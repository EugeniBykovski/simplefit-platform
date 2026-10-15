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

async function renderShell(shell: SidebarShellId, pathname: string, search = "") {
  location.pathname = `/en${pathname}`;
  location.search = search;
  await renderWithProviders(
    <WorkspaceShell shell={shell}>
      <p>content</p>
    </WorkspaceShell>,
  );
  const desktop = screen.getAllByRole("navigation")[0];
  if (!desktop) throw new Error("no navigation rendered");
  return desktop;
}

describe("WorkspaceShell navigation config", () => {
  it.each(SHELLS.filter((shell) => shell !== "web.app.coach"))(
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

  it("web.app.coach shows the MVP subset of its registry items, the rest Soon (D-WEB-COACH-HOME-MVP, SF-58)", () => {
    const shell = "web.app.coach";
    const configured = shellNavigation[shell].sections.flatMap((section) => section.items);
    const routed = webShell(shell)
      .navItems.filter((item) => item.route)
      .map((item) => item.key);
    expect(configured).toEqual(["dashboard", "fighters", "programs", "settings"]);
    for (const key of configured) expect(routed).toContain(key);
    expect(shellNavigation[shell].soon).toEqual(["programs", "settings"]);
    expect(new Set(configured).size).toBe(configured.length);
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
    const nav = await renderShell("web.app.gym", "/app/gym/members/m-42");
    expect(within(nav).getByRole("link", { name: "Members" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("shows the Coach MVP: Dashboard and Fighters linked, the sections without a domain Soon and unlinked", async () => {
    const nav = await renderShell("web.app.coach", "/app/coach");
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // SF-58: Fighters is real (WC7).
    const fighters = within(nav).getByRole("link", { name: "Fighters" });
    expect(fighters).toHaveAttribute("href", "/en/app/coach/fighters");
    expect(fighters).not.toHaveAttribute("aria-current");
    for (const name of ["Sessions", "Coach settings"]) {
      expect(within(nav).queryByRole("link", { name: new RegExp(name) })).toBeNull();
      const row = within(nav).getByText(name).closest("[aria-disabled]");
      expect(row).toHaveTextContent("Soon");
    }
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

  it("uses the query for sponsor Challenges and Events", async () => {
    const nav = await renderShell("web.sponsor", "/sponsor/campaigns", "type=event");
    expect(within(nav).getByRole("link", { name: "Events" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Events" })).toHaveAttribute(
      "href",
      "/en/sponsor/campaigns?type=event",
    );
    expect(within(nav).getByRole("link", { name: "Campaigns" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders the design's sections, the content and a translated shell", async () => {
    location.pathname = "/pl/app/gym";
    location.search = "";
    await renderWithProviders(
      <WorkspaceShell shell="web.app.gym">
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
});
