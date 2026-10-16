import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FighterProfile } from "@/entities/fighter-profile";
import { renderWithProviders } from "@/test/render";

import { CompleteStep } from "./complete-step";

/*
 * WF6 leaves through the application entry with the Fighter intent and the
 * URL's continuation (SF-45): a visitor sent here from a page, such as a
 * coach invitation (SF-60), returns to it. An unsafe returnTo never survives.
 */

vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const PROFILE = {
  display_name: "Alex Rivera",
  username: "alex",
  country_code: "PL",
  city: "Kraków",
  experience_level: "amateur",
  amateur_bout_count: null,
  stance: "orthodox",
  goals: [],
  next_fight_on: null,
  next_fight_name: null,
  weight_class: null,
  current_weight_kg: null,
  height_cm: null,
  onboarding: {
    status: "completed",
    completed_at: "2026-10-16T10:00:00Z",
    missing_requirements: [],
  },
} as unknown as FighterProfile;

describe("WF6 complete step", () => {
  it("goes home through the entry by default", async () => {
    await renderWithProviders(<CompleteStep profile={PROFILE} />);
    expect(screen.getByRole("link", { name: "Go to my home" })).toHaveAttribute(
      "href",
      "/app?intent=fighter",
    );
  });

  it("continues back to the page that sent the visitor (a coach invitation)", async () => {
    await renderWithProviders(
      <CompleteStep
        profile={PROFILE}
        continuation={{ returnTo: "/invite/coach", intent: "fighter" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      "/app?returnTo=%2Finvite%2Fcoach&intent=fighter",
    );
  });

  it("drops an unsafe returnTo", async () => {
    await renderWithProviders(
      <CompleteStep profile={PROFILE} continuation={{ returnTo: "//evil.example/x" }} />,
    );
    expect(screen.getByRole("link", { name: "Go to my home" })).toHaveAttribute(
      "href",
      "/app?intent=fighter",
    );
  });
});
