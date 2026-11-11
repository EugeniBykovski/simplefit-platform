import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { localeRegistry, type Locale } from "@/shared/i18n/routing";
import { renderWithProviders } from "@/test/render";

import { TrustSafetyUnavailable, type TrustSafetyArea } from "./trust-safety-unavailable";

/*
 * AD4 and AD11 (SF-125): no reports, content or enforcement domain exists, so the
 * screens say so truthfully, ask the backend for nothing, show no queue, count or
 * control, and point only to the real, separate controls.
 */

vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
}));

const fetchSpy = vi.fn();
afterEach(() => {
  vi.unstubAllGlobals();
  fetchSpy.mockReset();
});

async function render(area: TrustSafetyArea, locale: Locale = "en") {
  vi.stubGlobal("fetch", fetchSpy);
  await renderWithProviders(<TrustSafetyUnavailable area={area} />, { locale });
}

describe("Trust & safety unavailable (SF-125)", () => {
  it("moderation: says nothing exists to review; no queue, data or request", async () => {
    await render("moderation");
    expect(screen.getByRole("heading", { level: 1, name: "Moderation" })).toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument();
    expect(screen.getByText(/SimpleFit has no reports, posts, comments/)).toBeInTheDocument();
    expect(
      screen.getByText(/isn’t an empty queue, a missing permission or an error/),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("table")).toEqual([]);
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("enforcement: no appeal is promised; points to the real, separate controls", async () => {
    await render("enforcement");
    expect(screen.getByRole("heading", { level: 1, name: "Enforcement" })).toBeInTheDocument();
    expect(screen.getByText(/can’t be appealed here/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/en/admin/users");
    expect(screen.getByRole("link", { name: "Sponsor applications" })).toHaveAttribute(
      "href",
      "/en/admin/sponsors",
    );
    expect(screen.getByText(/Suspending a sponsor organization/)).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(2);
  });

  it.each(Object.keys(localeRegistry) as Locale[])("%s has every message", async (locale) => {
    await render("moderation", locale);
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toMatch(/trustSafety/);
  });
});
