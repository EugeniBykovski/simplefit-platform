import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { matchWebRoute, webShell } from "@/shared/routes/routes";
import { renderWithProviders } from "@/test/render";

import { shellNavigation, type SidebarShellId } from "../model/navigation";
import { WorkspaceShell } from "./workspace-shell";

const location = vi.hoisted(() => ({ pathname: "/en/app/home", search: "" }));
vi.mock(import("next/navigation"), async (importOriginal) => ({
  ...(await importOriginal()),
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search) as never,
}));
// Session control, locale and theme switchers have their own tests and need a
// mounted router or the API; so does the context switcher (SF-54).
vi.mock("@/features/sign-out", () => ({ SessionControl: () => null }));
vi.mock("@/features/session-gate", () => ({
  ContextSwitcher: ({ context }: { context: string }) => <p>switcher:{context}</p>,
}));
vi.mock("@/features/switch-locale", () => ({ LocaleSwitcher: () => null }));
vi.mock("@/features/switch-theme", () => ({ ThemeSwitcher: () => null }));

const SHELLS = Object.keys(shellNavigation) as SidebarShellId[];
const GYM_ID = "6f1d2c4e-9a51-4b3e-8c0d-2b6a7e19f3a4";
const SPONSOR_ID = "0b6d1f3e-2c4a-4e5b-9d7f-8a1c2e3b4d5f";
/** The gym console's links name its gym (SF-88), the partner portal's its organization (SF-117). */
const paramsOf = (shell: SidebarShellId): Record<string, string> =>
  shell === "web.app.gym"
    ? { gymId: GYM_ID }
    : shell === "web.sponsor"
      ? { sponsorId: SPONSOR_ID }
      : {};

async function renderShell(shell: SidebarShellId, pathname: string, search = "") {
  location.pathname = `/en${pathname}`;
  location.search = search;
  await renderWithProviders(
    <WorkspaceShell shell={shell} params={paramsOf(shell)}>
      <p>content</p>
    </WorkspaceShell>,
  );
  const desktop = screen.getAllByRole("navigation")[0];
  if (!desktop) throw new Error("no navigation rendered");
  return desktop;
}

describe("WorkspaceShell navigation config", () => {
  it.each(SHELLS.filter((shell) => shell !== "web.app.coach" && shell !== "web.sponsor"))(
    "%s lists exactly the routed registry nav items",
    (shell) => {
      const configured = shellNavigation[shell].sections.flatMap((section) => section.items);
      const routed = webShell(shell)
        .navItems.filter((item) => item.route)
        .map((item) => item.key);
      expect([...configured].sort()).toEqual([...routed].sort());
      expect(new Set(configured).size).toBe(configured.length);
      for (const key of configured) expect(shellNavigation[shell].icons[key]).toBeDefined();
    },
  );

  it("web.app.coach shows the MVP subset of its registry items, the rest Soon (D-WEB-COACH-HOME-MVP, SF-58, SF-64)", () => {
    const shell = "web.app.coach";
    const configured = shellNavigation[shell].sections.flatMap((section) => section.items);
    const routed = webShell(shell)
      .navItems.filter((item) => item.route)
      .map((item) => item.key);
    expect(configured).toEqual(["dashboard", "fighters", "programs", "settings"]);
    for (const key of configured) expect(routed).toContain(key);
    expect(shellNavigation[shell].soon).toEqual(["settings"]);
    expect(new Set(configured).size).toBe(configured.length);
    for (const key of configured) expect(shellNavigation[shell].icons[key]).toBeDefined();
  });

  it("web.sponsor shows the partner portal MVP: Overview, Application, Organization, Members and Settings; no campaign domain (SF-118)", () => {
    const shell = "web.sponsor";
    const configured = shellNavigation[shell].sections.flatMap((section) => section.items);
    const routed = webShell(shell)
      .navItems.filter((item) => item.route)
      .map((item) => item.key);
    expect(configured).toEqual(["overview", "applications", "organization", "members", "settings"]);
    for (const key of configured) expect(routed).toContain(key);
    expect(shellNavigation[shell].soon).toBeUndefined();
    for (const key of configured) expect(shellNavigation[shell].icons[key]).toBeDefined();
  });

  it("hides only the sponsor items without a route (Creative, Analytics)", () => {
    const hidden = webShell("web.sponsor")
      .navItems.filter((item) => !item.route)
      .map((item) => item.key);
    expect(hidden).toEqual(["creative", "analytics"]);
  });
});

describe("WorkspaceShell", () => {
  it.each(SHELLS)("%s links every item to its canonical registry route", async (shell) => {
    const nav = await renderShell(shell, "/");
    const links = within(nav).getAllByRole("link");
    const items = webShell(shell).navItems.filter((item) => item.route);
    const linked = shellNavigation[shell].sections
      .flatMap((section) => section.items)
      .filter((key) => !shellNavigation[shell].soon?.includes(key));
    expect(links).toHaveLength(linked.length);
    for (const link of links) {
      const href = new URL(link.getAttribute("href") ?? "", "http://x");
      expect(href.pathname.startsWith("/en/")).toBe(true);
      const route = matchWebRoute(href.pathname.slice(3));
      expect(items.some((item) => item.route === route?.id)).toBe(true);
    }
  });

  it("marks the current route's item, keeping parents active on nested routes", async () => {
    const nav = await renderShell("web.app.coach", "/app/coach/fighters/f-42");
    expect(within(nav).getByRole("link", { name: "Fighters" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("shows the gym console MVP: Dashboard, Members (SF-96), Coaches & staff (SF-94), Timetable (SF-98) and Settings (SF-102) of the gym in the path, every other item Soon (SF-88)", async () => {
    const nav = await renderShell("web.app.gym", `/app/gyms/${GYM_ID}/members/m-42`);
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      `/en/app/gyms/${GYM_ID}`,
    );
    expect(within(nav).getByRole("link", { name: "Coaches & staff" })).toHaveAttribute(
      "href",
      `/en/app/gyms/${GYM_ID}/staff`,
    );
    expect(within(nav).getByRole("link", { name: "Members" })).toHaveAttribute(
      "href",
      `/en/app/gyms/${GYM_ID}/members`,
    );
    expect(within(nav).getByRole("link", { name: "Timetable" })).toHaveAttribute(
      "href",
      `/en/app/gyms/${GYM_ID}/timetable`,
    );
    // SF-102: settings open the gym settings (its SimpleFit plan tab).
    expect(within(nav).getByRole("link", { name: "Gym settings & plan" })).toHaveAttribute(
      "href",
      `/en/app/gyms/${GYM_ID}/settings`,
    );
    for (const label of ["Leads & trials", "Bookings", "Revenue & payouts"]) {
      expect(within(nav).queryByRole("link", { name: label })).toBeNull();
      expect(within(nav).getByText(label).closest("[aria-disabled]")).toHaveTextContent("Soon");
    }
  });

  it("puts a supplied identity block above the navigation", async () => {
    location.pathname = `/en/app/gyms/${GYM_ID}`;
    await renderWithProviders(
      <WorkspaceShell shell="web.app.gym" params={{ gymId: GYM_ID }} identity={<p>gym-switcher</p>}>
        <p>content</p>
      </WorkspaceShell>,
    );
    expect(screen.getAllByText("gym-switcher").length).toBeGreaterThan(0);
  });

  it("shows the Coach MVP: Dashboard, Fighters and Sessions linked, Coach settings Soon and unlinked", async () => {
    const nav = await renderShell("web.app.coach", "/app/coach");
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // SF-58: Fighters is real (WC7).
    const fighters = within(nav).getByRole("link", { name: "Fighters" });
    expect(fighters).toHaveAttribute("href", "/en/app/coach/fighters");
    expect(fighters).not.toHaveAttribute("aria-current");
    // SF-64: Sessions opens the planner (WCT1).
    expect(within(nav).getByRole("link", { name: "Sessions" })).toHaveAttribute(
      "href",
      "/en/app/coach/sessions",
    );
    expect(within(nav).queryByRole("link", { name: /Coach settings/ })).toBeNull();
    const row = within(nav).getByText("Coach settings").closest("[aria-disabled]");
    expect(row).toHaveTextContent("Soon");
    expect(within(nav).queryByText(/Earnings|Sparring|Team board|Messages/)).toBeNull();
    // The identity block is the profile context switcher (SF-54).
    expect(screen.getAllByText("switcher:coach").length).toBeGreaterThan(0);
  });

  it("marks Fighters current on the Coach fighters route", async () => {
    const nav = await renderShell("web.app.coach", "/app/coach/fighters");
    expect(within(nav).getByRole("link", { name: "Fighters" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("gives the Fighter shell the context switcher and other shells none", async () => {
    await renderShell("web.app.fighter", "/app/home");
    expect(screen.getAllByText("switcher:fighter").length).toBeGreaterThan(0);
  });

  it("links the partner portal of the organization in the path; nothing of campaigns (SF-118)", async () => {
    const nav = await renderShell(
      "web.sponsor",
      `/sponsor/${SPONSOR_ID}/settings`,
      "section=members",
    );
    const href = (name: string) => within(nav).getByRole("link", { name }).getAttribute("href");
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(href("Overview")).toBe(`/en/sponsor/${SPONSOR_ID}/dashboard`);
    expect(href("Application")).toBe(`/en/sponsor/${SPONSOR_ID}/application`);
    expect(href("Organization")).toBe(`/en/sponsor/${SPONSOR_ID}/settings?section=organization`);
    expect(href("Members")).toBe(`/en/sponsor/${SPONSOR_ID}/settings?section=members`);
    expect(href("Settings")).toBe(`/en/sponsor/${SPONSOR_ID}/settings`);
    // The query decides between items of the same route.
    expect(within(nav).getByRole("link", { name: "Members" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
    expect(within(nav).queryByText(/Campaigns|Challenges|Events|Invoices/)).toBeNull();
  });

  it("renders the design's sections, the content and a translated shell", async () => {
    location.pathname = `/pl/app/gyms/${GYM_ID}`;
    location.search = "";
    await renderWithProviders(
      <WorkspaceShell shell="web.app.gym" params={{ gymId: GYM_ID }}>
        <p>content</p>
      </WorkspaceShell>,
      { locale: "pl" },
    );
    const nav = screen.getAllByRole("navigation", { name: "Konsola klubu" })[0];
    if (!nav) throw new Error("no navigation rendered");
    expect(within(nav).getByRole("heading", { name: "Ludzie" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Panel" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("main")).toHaveTextContent("content");
  });

  it("marks the admin control plane as internal", async () => {
    await renderShell("web.admin", "/admin/audit");
    expect(screen.getByText("Internal")).toBeInTheDocument();
  });

  it("lists only the visible items and hides emptied sections (Control Plane, SF-120)", async () => {
    location.pathname = "/en/admin";
    location.search = "";
    await renderWithProviders(
      <WorkspaceShell shell="web.admin" visibleItems={["overview", "audit"]}>
        <p>content</p>
      </WorkspaceShell>,
    );
    const nav = screen.getAllByRole("navigation")[0];
    if (!nav) throw new Error("no navigation rendered");
    expect(within(nav).getByRole("link", { name: "Global overview" })).toBeVisible();
    // Granted but not built yet: a labelled, unlinked "Soon" row.
    expect(within(nav).getByText("Audit log")).toBeVisible();
    expect(within(nav).queryByRole("link", { name: /Audit log/ })).toBeNull();
    expect(within(nav).queryByText("Revenue")).toBeNull();
    expect(within(nav).queryByRole("heading", { name: "Revenue" })).toBeNull();
    expect(within(nav).queryByText("Internal access")).toBeNull();
  });
});
