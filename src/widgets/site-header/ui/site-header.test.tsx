import { screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { matchWebRoute } from "@/shared/routes/routes";
import { renderWithProviders } from "@/test/render";

import { activeSiteNavKey } from "../model/navigation";
import { SiteFooter, SiteFrame, SiteHeader } from "./site-header";

vi.mock("@/features/switch-locale", () => ({ LocaleSwitcher: () => null }));
vi.mock("@/features/switch-theme", () => ({ ThemeSwitcher: () => null }));

const location = vi.hoisted(() => ({ pathname: "/", search: "" }));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => location.pathname,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(location.search),
}));

const SITE_LINKS = [
  "Fighters",
  "Coaches",
  "Gyms",
  "Pricing",
  "Marketplace",
  "Partners",
  "Enterprise",
];

beforeEach(() => {
  location.pathname = "/";
  location.search = "";
});

/** The desktop site navigation (the menu sheet's copy is not rendered until opened). */
const siteNav = () => screen.getAllByRole("navigation", { name: "Site" })[0]!;

describe("SiteHeader", () => {
  it("links the public site to canonical registry routes, in the designed order", async () => {
    await renderWithProviders(<SiteHeader />);
    const links = within(siteNav()).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual(SITE_LINKS);
    for (const link of links) {
      const href = new URL(link.getAttribute("href") ?? "", "http://x");
      expect(matchWebRoute(href.pathname)?.session).toBe("PUBLIC");
    }
    expect(within(siteNav()).getByRole("link", { name: "Enterprise" })).toHaveAttribute(
      "href",
      "/pricing?role=enterprise",
    );
  });

  it("offers sign-in and sign-up", async () => {
    await renderWithProviders(<SiteHeader />, { locale: "de" });
    expect(screen.getByRole("link", { name: "Anmelden" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Loslegen" })).toHaveAttribute("href", "/signup");
  });

  it.each([
    ["/", "", undefined],
    ["/signup", "", undefined],
    ["/fighters", "", "Fighters"],
    ["/coaches", "", "Coaches"],
    ["/gyms", "", "Gyms"],
    ["/marketplace", "", "Marketplace"],
    ["/pricing", "", "Pricing"],
    ["/pricing", "?role=fighter", "Pricing"],
    ["/pricing", "?role=gym", "Pricing"],
    ["/pricing", "?role=enterprise", "Enterprise"],
    ["/pricing/compare", "?role=gym", "Pricing"],
    ["/white-label", "", "Enterprise"],
    ["/partners", "", "Partners"],
    ["/partners/apply", "", "Partners"],
  ])("marks the current item on %s%s as the artboards do", async (pathname, search, current) => {
    location.pathname = pathname;
    location.search = search;
    await renderWithProviders(<SiteHeader />);
    const marked = within(siteNav())
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(marked.map((link) => link.textContent)).toEqual(current ? [current] : []);
  });
});

describe("activeSiteNavKey", () => {
  it("marks nothing for routes outside the site navigation", () => {
    expect(activeSiteNavKey(undefined)).toBeUndefined();
    expect(activeSiteNavKey("web.root")).toBeUndefined();
    expect(activeSiteNavKey("web.verify-email")).toBeUndefined();
  });
});

describe("SiteFooter", () => {
  it("has the four labelled columns of registry links and the plain company entries", async () => {
    await renderWithProviders(<SiteFooter />);
    const columns = ["Product", "Business", "Partners", "Company"].map((name) =>
      screen.getByRole("navigation", { name }),
    );
    expect(
      within(columns[0]!)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Fighters", "Coaches", "Gyms", "Sign in"]);
    for (const link of screen.getAllByRole("link")) {
      expect(
        matchWebRoute(new URL(link.getAttribute("href") ?? "", "http://x").pathname),
      ).toBeDefined();
    }
    expect(within(columns[3]!).queryAllByRole("link")).toEqual([]);
  });
});

describe("SiteFrame", () => {
  it("renders header, the main landmark and footer, without stretching the content", async () => {
    await renderWithProviders(
      <SiteFrame>
        <p>page</p>
      </SiteFrame>,
    );
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main.className).not.toMatch(/\bflex-1\b|\bgrow\b/);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
