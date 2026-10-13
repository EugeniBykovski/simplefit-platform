import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CoachProfile, CoachProfilePatch } from "@/entities/coach-profile";
import { renderWithProviders } from "@/test/render";

import { ProfileStep, type StepSaver } from "./profile-step";

/*
 * WCR1's account-name suggestion (SF-52 guardrail): the account's full name
 * pre-fills the coach name of a new, unsaved profile as an editable value. It
 * reaches the API only through a save of this step, and a coach name saved
 * elsewhere meanwhile replaces it as long as the visitor has not edited it.
 */

const NEW: CoachProfile = {
  display_name: null,
  brand_name: null,
  country_code: null,
  city: null,
  bio: null,
  languages: [],
  coaching_formats: [],
  competition_levels: [],
  onboarding: {
    status: "not_started",
    completed_at: null,
    missing_requirements: ["display_name", "country_code", "city", "coaching_formats"],
  },
};

const SAVED_ELSEWHERE: CoachProfile = {
  ...NEW,
  display_name: "Coach Alex",
  onboarding: {
    status: "in_progress",
    completed_at: null,
    missing_requirements: ["country_code", "city", "coaching_formats"],
  },
};

async function renderStep(profile: CoachProfile, suggestion?: string) {
  let saver: StepSaver | undefined;
  const save = vi.fn(
    async (patch: CoachProfilePatch) => ({ ...profile, ...patch }) as CoachProfile,
  );
  const props = {
    save,
    onDone: vi.fn(),
    registerSaver: (next: StepSaver) => {
      saver = next;
    },
  };
  const view = await renderWithProviders(
    <ProfileStep profile={profile} suggestion={suggestion} {...props} />,
  );
  const rerender = (next: CoachProfile) =>
    view.rerender(<ProfileStep profile={next} suggestion={suggestion} {...props} />);
  return { save, rerender, persist: () => saver?.() };
}

describe("ProfileStep: the coach-name suggestion", () => {
  it("pre-fills a new profile's coach name with the account name, saying where it comes from", async () => {
    const { save } = await renderStep(NEW, "Alex Kowalski");
    expect(screen.getByRole("textbox", { name: "Coach name" })).toHaveValue("Alex Kowalski");
    expect(
      screen.getByText(
        "Suggested from your account name. Change it if you coach under another name.",
      ),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the suggestion only when the visitor saves the step", async () => {
    const { save, persist } = await renderStep(NEW, "Alex Kowalski");
    await expect(persist()).resolves.toBe(true);
    expect(save).toHaveBeenCalledExactlyOnceWith({ display_name: "Alex Kowalski" });
  });

  it("an edited suggestion is the visitor's own value", async () => {
    const { save, persist } = await renderStep(NEW, "Alex Kowalski");
    const name = screen.getByRole("textbox", { name: "Coach name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Coach Alex");
    expect(screen.getByText("Shown to fighters. Up to 60 characters.")).toBeInTheDocument();
    await persist();
    expect(save).toHaveBeenCalledExactlyOnceWith({ display_name: "Coach Alex" });
  });

  it("never overwrites a coach name saved elsewhere meanwhile", async () => {
    const { save, rerender, persist } = await renderStep(NEW, "Alex Kowalski");
    rerender(SAVED_ELSEWHERE);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Coach name" })).toHaveValue("Coach Alex"),
    );
    await expect(persist()).resolves.toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("offers nothing when there is no suggestion", async () => {
    await renderStep(NEW);
    expect(screen.getByRole("textbox", { name: "Coach name" })).toHaveValue("");
    expect(screen.getByText("Shown to fighters. Up to 60 characters.")).toBeInTheDocument();
  });
});
