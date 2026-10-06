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
// mounted router or the API.
vi.mock("@/features/sign-out", () => ({ SessionControl: () => null }));
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
  it.each(SHELLS)("%s lists exactly the routed registry nav items", (shell) => {
    const configured = shellNavigation[shell].sections.flatMap((section) => section.items);
    const routed = webShell(shell)
      .navItems.filter((item) => item.route)
      .map((item) => item.key);
    expect([...configured].sort()).toEqual([...routed].sort());
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
    expect(links).toHaveLength(items.length);
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
