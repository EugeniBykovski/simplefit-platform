import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { matchWebRoute } from "@/shared/routes/routes";
import { renderWithProviders } from "@/test/render";

import { NotFoundState } from "./not-found-state";

vi.mock(import("next/navigation"), async (importOriginal) => ({
  ...(await importOriginal()),
  usePathname: () => "/en/app/sessions/8812",
}));

/** Every link must open a canonical registry route (never a fake target). */
function expectRegistryLinks() {
  for (const link of screen.getAllByRole("link")) {
    const href = new URL(link.getAttribute("href") ?? "", "http://x");
    expect(href.pathname.startsWith("/en")).toBe(true);
    const path = href.pathname.replace(/^\/en/, "") || "/";
    expect([path, matchWebRoute(path)?.id]).toEqual([path, expect.any(String)]);
  }
}

describe("NotFoundState (ER2)", () => {
  it("runs the count with real destinations and shows the requested path", async () => {
    await renderWithProviders(<NotFoundState frozen />);
    expect(
      screen.getByRole("heading", { level: 1, name: "This page is down for the count." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back home" })).toHaveAttribute("href", "/en");
    expect(screen.getByRole("link", { name: /Search gyms, coaches, programs/ })).toHaveAttribute(
      "href",
      "/en/marketplace",
    );
    const quick = within(screen.getByRole("navigation", { name: "Where to next" }));
    expect(quick.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/en/app/board",
      "/en/marketplace",
      "/en/coaches",
      "/en/pricing",
    ]);
    expect(screen.getAllByText("GET /app/sessions/8812 → 404")[0]).toBeInTheDocument();
    expectRegistryLinks();
  });

  it("is saved by the bell, then offers its corner and search", async () => {
    await renderWithProviders(<NotFoundState frozen />);
    fireEvent.click(screen.getByRole("button", { name: "Beat the count" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Saved by the bell." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to my corner" })).toHaveAttribute("href", "/en");
    expect(screen.getByRole("link", { name: "Search", exact: true } as never)).toHaveAttribute(
      "href",
      "/en/marketplace",
    );
    expectRegistryLinks();
  });

  it("counts again after a knockout", async () => {
    await renderWithProviders(<NotFoundState initialPhase="ko" frozen />);
    expect(
      screen.getByRole("heading", { level: 1, name: "KO. This page didn’t get up." }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Count again" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "This page is down for the count." }),
    ).toBeInTheDocument();
  });

  it("focuses the search control with the / key", async () => {
    await renderWithProviders(<NotFoundState frozen />);
    fireEvent.keyDown(window, { key: "/" });
    expect(screen.getByRole("link", { name: /Search gyms/ })).toHaveFocus();
  });

  it("is localized", async () => {
    await renderWithProviders(<NotFoundState frozen />, { locale: "pl" });
    expect(
      screen.getByRole("heading", { level: 1, name: "Ta strona jest liczona." }),
    ).toBeInTheDocument();
  });
});
