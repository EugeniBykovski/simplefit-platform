import { screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/shared/ui/tooltip";
import { renderWithProviders } from "@/test/render";

import { HomePage } from "./home-page";
import { FightersPage } from "./fighters-page";
import { CoachesPage } from "./coaches-page";
import { GymsPage } from "./gyms-page";
import { MarketplacePage } from "./marketplace-page";
import { PricingPage } from "./pricing-page";
import { PlanComparePage } from "./plan-compare-page";
import { WhiteLabelPage } from "./white-label-page";
import { PartnersPage } from "./partners-page";
import { PartnersApplyPage } from "./partners-apply-page";

vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    scroll: _scroll,
    ...props
  }: {
    href: string;
    scroll?: boolean;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const hrefOf = (name: string | RegExp) =>
  screen.getAllByRole("link", { name }).map((link) => link.getAttribute("href"));

describe("public website pages (SF-43)", () => {
  it("L1 home: the hero, the tagged example board and no invented live figures", async () => {
    await renderWithProviders(<HomePage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Train, coach and run your gym — in one place.",
      }),
    ).toBeInTheDocument();
    // The Live Board is one labelled image, tagged as an example of the product.
    const board = screen.getByRole("figure", { name: /An example Live Board/ });
    expect(within(board).getByText("Example")).toBeInTheDocument();
    // The artboard's 48K / 312 / 5 are not real figures: they are not shown.
    for (const figure of ["48K", "312", "Members", "Gyms", "Markets"]) {
      expect(screen.queryByText(figure, { exact: true })).not.toBeInTheDocument();
    }
    expect(hrefOf("Get started — it’s free")).toEqual(["/signup"]);
    expect(hrefOf("Sign in")).toEqual(["/login"]);
    expect(hrefOf("For fighters")).toEqual(["/fighters"]);
    // The pricing card reads the approved prices.
    expect(screen.getByText("€14.99")).toBeInTheDocument();
    expect(screen.getByText("€39")).toBeInTheDocument();
  });

  it("L2–L4: sign-up actions carry the role's journey, examples are tagged", async () => {
    const { unmount } = await renderWithProviders(<FightersPage />);
    expect(hrefOf("Join free")).toEqual(["/signup?intent=fighter", "/signup?intent=fighter"]);
    expect(screen.getByText("€7.99")).toBeInTheDocument();
    unmount();

    const coaches = await renderWithProviders(<CoachesPage />);
    expect(hrefOf("Start free")).toEqual(["/signup?intent=coach", "/signup?intent=coach"]);
    expect(screen.getByRole("figure", { name: /An example coach week/ })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: /An example PT sale/ })).toBeInTheDocument();
    // The coach plans table: a real table with its five plans.
    const plans = screen.getByRole("table");
    expect(within(plans).getAllByRole("row")).toHaveLength(6);
    coaches.unmount();

    await renderWithProviders(<GymsPage />);
    expect(hrefOf("Set up your gym")).toEqual(["/signup?intent=gym", "/signup?intent=gym"]);
    expect(hrefOf("Talk to sales")).toEqual(["/pricing?role=enterprise"]);
    expect(screen.getByRole("figure", { name: /An example gym day/ })).toBeInTheDocument();
  });

  it("L5 marketplace: search is visibly unavailable, listings are examples, actions need an account", async () => {
    await renderWithProviders(<MarketplacePage />);

    const search = screen.getByRole("search");
    for (const input of within(search).getAllByRole("textbox")) expect(input).toBeDisabled();
    expect(within(search).getByRole("button", { name: "Search" })).toBeDisabled();
    expect(search).toHaveAccessibleDescription(/Search isn’t open yet/);

    const listings = screen.getByRole("region", { name: "Example listings" });
    expect(within(listings).getAllByRole("listitem")).toHaveLength(6);
    expect(within(listings).getByText("Example")).toBeInTheDocument();
    for (const href of [...hrefOf("Book"), ...hrefOf("View gym")]) expect(href).toBe("/signup");
  });

  describe("pricing", () => {
    it("PR1 coach is the default: tabs and billing are links, the current ones marked", async () => {
      await renderWithProviders(<PricingPage audience="coach" billing="monthly" />);

      const roles = screen.getByRole("navigation", { name: "Plans for" });
      expect(within(roles).getByRole("link", { name: "Coach" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(within(roles).getByRole("link", { name: "Fighter" })).not.toHaveAttribute(
        "aria-current",
      );
      expect(
        within(roles)
          .getAllByRole("link")
          .map((link) => link.getAttribute("href")),
      ).toEqual([
        "/pricing?role=fighter",
        "/pricing",
        "/pricing?role=gym",
        "/pricing?role=enterprise",
      ]);
      const billing = screen.getByRole("navigation", { name: "Billing" });
      expect(within(billing).getByRole("link", { name: "Monthly" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(within(billing).getByRole("link", { name: /Annual/ })).toHaveAttribute(
        "href",
        "/pricing?billing=annual",
      );

      // Five plans at the approved prices; every action is sign-up as a coach, never checkout.
      for (const price of ["€0", "€14.99", "€29.99", "€49.99", "€69.99"]) {
        expect(screen.getByText(price)).toBeInTheDocument();
      }
      for (const name of [
        "Start Free",
        "Choose Starter",
        "Start 14-day trial",
        "Choose Elite",
        "Choose Unlimited",
      ]) {
        expect(hrefOf(name)).toEqual(["/signup?intent=coach"]);
      }
      expect(screen.getByText("Most popular")).toBeInTheDocument();
      expect(screen.getAllByRole("term")).toHaveLength(7);
    });

    it("annual billing: the tabs keep it; only stated annual prices are shown", async () => {
      const { unmount } = await renderWithProviders(
        <PricingPage audience="coach" billing="annual" />,
      );
      const roles = screen.getByRole("navigation", { name: "Plans for" });
      expect(within(roles).getByRole("link", { name: "Gym" })).toHaveAttribute(
        "href",
        "/pricing?role=gym&billing=annual",
      );
      // Enterprise has no billing toggle, so it drops the state.
      expect(within(roles).getByRole("link", { name: "Enterprise" })).toHaveAttribute(
        "href",
        "/pricing?role=enterprise",
      );
      // Coach plans have no approved annual price: monthly price and the note.
      expect(screen.getByText("€29.99")).toBeInTheDocument();
      expect(
        screen.getAllByText("Billed yearly · about 20% less, set per market").length,
      ).toBeGreaterThan(0);
      unmount();

      await renderWithProviders(<PricingPage audience="fighter" billing="annual" />);
      expect(screen.getByText("€6.39")).toBeInTheDocument();
      expect(hrefOf("Join free")).toEqual(["/signup?intent=fighter"]);
      expect(hrefOf("Start free trial")).toEqual(["/signup?intent=fighter"]);
    });

    it("PR3 gym: the plans, Multi-location from €499 and the comparison link", async () => {
      await renderWithProviders(<PricingPage audience="gym" billing="monthly" />);
      for (const price of ["€39", "€89", "€179", "€299"])
        expect(screen.getByText(price)).toBeInTheDocument();
      expect(screen.getByText("from €499")).toBeInTheDocument();
      expect(hrefOf("Contact Sales")).toEqual(["/pricing?role=enterprise"]);
      expect(hrefOf("Compare every feature")).toEqual(["/pricing/compare"]);
      expect(screen.getByText("Recommended")).toBeInTheDocument();
    });

    it("PR4 enterprise: the sales form is shown but cannot be sent", async () => {
      await renderWithProviders(<PricingPage audience="enterprise" billing="monthly" />);
      const form = screen.getByRole("form", { name: "Talk to Sales" });
      expect(within(form).getByRole("group")).toBeDisabled();
      for (const field of within(form).getAllByRole("textbox")) expect(field).toBeDisabled();
      expect(within(form).getByLabelText("Organization")).toHaveAttribute(
        "placeholder",
        "Baltic Boxing Federation",
      );
      expect(within(form).getByRole("button", { name: "Talk to Sales" })).toBeDisabled();
      expect(form).toHaveAccessibleDescription(/Sales requests aren’t open yet/);
      expect(screen.queryByRole("navigation", { name: "Billing" })).not.toBeInTheDocument();
      expect(hrefOf("White label")).toEqual(["/white-label"]);
    });
  });

  it("PR6 comparison: one table, every feature row, Gym the current section", async () => {
    await renderWithProviders(
      <TooltipProvider>
        <PlanComparePage />
      </TooltipProvider>,
    );

    const table = screen.getByRole("table", { name: "Compare gym plans" });
    const columns = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(columns).toEqual([
      "Free€0",
      "Starter€39/mo",
      "RecommendedPro€89/mo",
      "Business€179/mo",
      "Club+€299/mo",
    ]);
    expect(within(table).getAllByRole("rowheader")).toHaveLength(15);
    const payments = within(table).getByRole("rowheader", { name: "Payments" }).closest("tr");
    expect(payments).not.toBeNull();
    expect(
      within(payments as HTMLElement)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Not included", "Not included", "Included", "Included", "Included"]);
    expect(within(table).getByRole("button", { name: "Details: Packages" })).toBeInTheDocument();
    const roles = screen.getByRole("navigation", { name: "Plans for" });
    expect(within(roles).getByRole("link", { name: "Gym" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("PR5 white label: example apps and a request form that cannot be sent", async () => {
    await renderWithProviders(<WhiteLabelPage />);
    expect(screen.getByText("Coming 2027 · UI only")).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: /Three example branded apps/ })).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Request White Label" });
    expect(within(form).getByRole("group")).toBeDisabled();
    expect(within(form).getByRole("button", { name: "Request White Label" })).toBeDisabled();
    expect(form).toHaveAccessibleDescription(/White label requests aren’t open yet/);
  });

  it("SPX1 partners: no invented reach figures; the overview is not downloadable yet", async () => {
    await renderWithProviders(<PartnersPage />);
    for (const figure of ["48K", "312", "31%"]) {
      expect(screen.queryByText(figure, { exact: true })).not.toBeInTheDocument();
    }
    expect(hrefOf("Become a Sponsor")).toEqual(["/partners/apply"]);
    const download = screen.getByRole("button", { name: "Download Partnership Overview" });
    expect(download).toBeDisabled();
    expect(download).toHaveAccessibleDescription("The partnership overview isn’t published yet.");
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(8 + 3);
    expect(screen.getByRole("region", { name: /Example campaigns/ })).toBeInTheDocument();
  });

  it("SPX2 become a sponsor: the steps, an application that cannot start yet, and sign-in", async () => {
    await renderWithProviders(<PartnersApplyPage />);
    for (const step of ["Tell us about your brand", "We review", "Plan your first campaign"]) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    const start = screen.getByRole("button", { name: "Start application" });
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription(/Sponsor applications aren’t open yet/);
    // The artboard's sponsor sign-in (SponsorLogin), not the member one.
    expect(hrefOf("Already applied? Sign in")).toEqual(["/sponsor/login"]);
    expect(screen.getByRole("heading", { name: "What sponsors get" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What we never do" })).toBeInTheDocument();
  });
});
