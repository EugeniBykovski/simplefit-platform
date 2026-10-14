import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { CoachHome } from "./coach-home";

/*
 * WC1 Coach dashboard (SF-54) on the SF-50 CoachProfile, with the network
 * mocked at `fetch`: real profile data only, and the domains that do not
 * exist yet shown as unavailable, never as zeros.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));

const PROFILE = {
  display_name: "Alex Novak",
  brand_name: "Novak Boxing",
  country_code: "PL",
  city: "Warsaw",
  bio: "Footwork-first boxing.",
  languages: ["en", "pl"],
  coaching_formats: ["personal_training", "fight_camps"],
  competition_levels: ["amateur"],
  onboarding: {
    status: "completed",
    completed_at: "2026-10-14T10:00:00Z",
    missing_requirements: [],
  },
};

vi.mock("@/shared/i18n/navigation", () => ({
  usePathname: () => "/app/coach",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(() => vi.unstubAllGlobals());

describe("CoachHome (WC1)", () => {
  it("shows the saved coach profile and no fabricated domain data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ coach_profile: PROFILE }))),
    );
    await renderWithProviders(<CoachHome />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Welcome, Alex Novak" }),
    ).toBeVisible();
    const profile = screen.getByRole("region", { name: "Your coach profile" });
    expect(within(profile).getByText("Novak Boxing · Warsaw, Poland")).toBeVisible();
    expect(within(profile).getByText("Personal Training · Fight Camps")).toBeVisible();
    expect(within(profile).getByText("Amateur")).toBeVisible();
    expect(within(profile).getByText("English · Polski")).toBeVisible();
    expect(within(profile).getByText("Footwork-first boxing.")).toBeVisible();

    // Unknown is not zero: no count is shown for a domain the backend does not have.
    const fills = screen.getByRole("region", { name: "What fills this dashboard" });
    expect(within(fills).getAllByText("Not available yet")).toHaveLength(3);
    expect(within(fills).queryByText(/^0$/)).toBeNull();
    expect(screen.queryByText(/€|booked|attendance|rounds/i)).toBeNull();

    const setup = screen.getByRole("region", { name: "Get your coaching space ready" });
    expect(within(setup).getByText("Coach profile")).toBeVisible();
    expect(within(setup).getAllByText("Not available yet")).toHaveLength(3);
    expect(within(setup).queryByRole("link")).toBeNull();
  });

  it("offers a retry when the profile cannot be loaded", async () => {
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        fail
          ? Promise.reject(new TypeError("Network request failed"))
          : Promise.resolve(jsonResponse({ coach_profile: PROFILE })),
      ),
    );
    await renderWithProviders(<CoachHome />);
    const retry = await screen.findByRole("button", { name: /try again/i });
    fail = false;
    await userEvent.click(retry);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Welcome, Alex Novak" }),
    ).toBeVisible();
  });
});
