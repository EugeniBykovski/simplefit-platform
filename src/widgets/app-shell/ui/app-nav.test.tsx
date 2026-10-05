import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/render";

import { AppNav } from "./app-nav";

// next-intl's usePathname strips the locale prefix from Next's pathname.
const pathname = vi.hoisted(() => ({ current: "/en/app" }));
vi.mock(import("next/navigation"), async (importOriginal) => ({
  ...(await importOriginal()),
  usePathname: () => pathname.current,
}));

describe("AppNav", () => {
  it("marks the current route for assistive technology", async () => {
    pathname.current = "/en/app";
    await renderWithProviders(<AppNav />);

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    const overview = screen.getByRole("link", { name: "Overview" });
    expect(overview).toHaveAttribute("aria-current", "page");
    expect(overview).toHaveAttribute("href", "/en/app");
  });

  it("renders translated, locale-prefixed navigation", async () => {
    pathname.current = "/pl/app";
    await renderWithProviders(<AppNav />, { locale: "pl" });

    expect(screen.getByRole("navigation", { name: "Główna" })).toBeInTheDocument();
    const overview = screen.getByRole("link", { name: "Przegląd" });
    expect(overview).toHaveAttribute("href", "/pl/app");
    expect(overview).toHaveAttribute("aria-current", "page");
  });

  it("does not mark items on other routes as current", async () => {
    pathname.current = "/en/somewhere-else";
    await renderWithProviders(<AppNav />);

    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });
});
