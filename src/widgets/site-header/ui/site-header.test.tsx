import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { matchWebRoute } from "@/shared/routes/routes";
import { renderWithProviders } from "@/test/render";

import { SiteHeader } from "./site-header";

vi.mock("@/features/switch-locale", () => ({ LocaleSwitcher: () => null }));
vi.mock("@/features/switch-theme", () => ({ ThemeSwitcher: () => null }));

describe("SiteHeader", () => {
  it("links the public site to canonical registry routes", async () => {
    await renderWithProviders(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: "Site" });
    const links = within(nav).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual([
      "Fighters",
      "Coaches",
      "Gyms",
      "Pricing",
      "Marketplace",
      "Partners",
      "Enterprise",
    ]);
    for (const link of links) {
      const href = new URL(link.getAttribute("href") ?? "", "http://x");
      expect(matchWebRoute(href.pathname.replace(/^\/en/, ""))?.session).toBe("PUBLIC");
    }
    expect(within(nav).getByRole("link", { name: "Enterprise" })).toHaveAttribute(
      "href",
      "/en/pricing?role=enterprise",
    );
  });

  it("offers sign-in and sign-up", async () => {
    await renderWithProviders(<SiteHeader />, { locale: "de" });
    expect(screen.getByRole("link", { name: "Anmelden" })).toHaveAttribute("href", "/de/login");
    expect(screen.getByRole("link", { name: "Loslegen" })).toHaveAttribute("href", "/de/signup");
  });
});
