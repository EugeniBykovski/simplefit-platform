import { describe, expect, it } from "vitest";

import type { CoachProfile } from "@/entities/coach-profile";
import { ApiError } from "@/shared/api/http/api-error";
import { changedOnly } from "@/shared/lib/forms";

import { messageFor, rejectionOf } from "./errors";
import {
  COACHING_FORMATS,
  COMPETITION_LEVELS,
  LANGUAGES,
  lengthOf,
  nameSuggestion,
  profileErrors,
  profileFrom,
  profilePatch,
  typeErrors,
  typePatch,
} from "./form-values";
import { decideStep, resumeStep } from "./steps";

const ALL_MISSING = ["display_name", "country_code", "city", "coaching_formats"] as const;

function profile(
  status: CoachProfile["onboarding"]["status"],
  missing: CoachProfile["onboarding"]["missing_requirements"] = [],
  fields: Partial<CoachProfile> = {},
): CoachProfile {
  return {
    display_name: null,
    brand_name: null,
    country_code: null,
    city: null,
    bio: null,
    languages: [],
    coaching_formats: [],
    competition_levels: [],
    ...fields,
    onboarding: {
      status,
      completed_at: status === "completed" ? "2026-10-13T12:00:00Z" : null,
      missing_requirements: missing,
    },
  };
}

const validation = (field_codes: Record<string, string[]>) =>
  new ApiError(422, "validation_error", "Validation failed", { fields: {}, field_codes }, null);

describe("decideStep (backend state decides, ?step= only navigates)", () => {
  it("starts a new Coach at Coach profile", () => {
    expect(decideStep(profile("not_started", [...ALL_MISSING]), null, false)).toEqual({
      kind: "step",
      step: "profile",
    });
  });

  it("resumes at Coaching type once only the formats are missing", () => {
    const resumed = profile("in_progress", ["coaching_formats"]);
    expect(resumeStep(resumed)).toBe("type");
    expect(decideStep(resumed, null, false)).toEqual({ kind: "step", step: "type" });
  });

  it("shows either form step when asked, and the resume step for anything else", () => {
    const unfinished = profile("in_progress", ["city", "coaching_formats"]);
    expect(decideStep(unfinished, "type", false)).toEqual({ kind: "step", step: "type" });
    expect(decideStep(unfinished, "profile", false)).toEqual({ kind: "step", step: "profile" });
    for (const requested of ["complete", "credentials", "size", "gym", "plan", "x", ""]) {
      expect(decideStep(unfinished, requested, false)).toEqual({ kind: "step", step: "profile" });
    }
  });

  it("shows WCR7 only right after this tab completed; a completed Coach otherwise exits", () => {
    const completed = profile("completed");
    expect(decideStep(completed, "complete", true)).toEqual({ kind: "step", step: "complete" });
    expect(decideStep(completed, "complete", false)).toEqual({ kind: "exit" });
    expect(decideStep(completed, "profile", false)).toEqual({ kind: "exit" });
  });
});

describe("form values (SF-50 vocabulary only)", () => {
  it("uses the generated enums in contract order", () => {
    expect(COACHING_FORMATS).toEqual([
      "personal_training",
      "group_coaching",
      "online_coaching",
      "fight_camps",
    ]);
    expect(COMPETITION_LEVELS).toEqual(["amateur", "professional"]);
    expect(LANGUAGES).toEqual(["en", "pl", "ru", "be", "uk"]);
  });

  it("trims text and clears empty values with null", () => {
    expect(
      profilePatch({
        display_name: "  Coach Yauheni ",
        brand_name: " ",
        country_code: "PL",
        city: "Warsaw",
        bio: "Line one\nLine two  ",
        languages: ["pl", "en"],
      }),
    ).toEqual({
      display_name: "Coach Yauheni",
      brand_name: null,
      country_code: "PL",
      city: "Warsaw",
      bio: "Line one\nLine two",
      languages: ["pl", "en"],
    });
    expect(typePatch({ coaching_formats: ["fight_camps"], competition_levels: [] })).toEqual({
      coaching_formats: ["fight_camps"],
      competition_levels: [],
    });
  });

  it("sends only what this form changed (a partial PATCH)", () => {
    const values = profileFrom(profile("in_progress", ["city"], { display_name: "Coach Y" }));
    const changed = changedOnly(profilePatch({ ...values, city: "Warsaw" }), { city: true });
    expect(changed).toEqual({ city: "Warsaw" });
  });

  it("checks the step's requirements and the contract lengths before saving", () => {
    const empty = profileFrom(profile("not_started"));
    expect(profileErrors(empty)).toEqual({
      display_name: "required.display_name",
      country_code: "required.country_code",
      city: "required.city",
    });
    expect(
      profileErrors({
        ...empty,
        display_name: "x".repeat(61),
        country_code: "PL",
        city: "Warsaw",
        bio: "y".repeat(501),
      }),
    ).toEqual({ display_name: "tooLong", bio: "tooLong" });
    expect(typeErrors({ coaching_formats: [], competition_levels: ["amateur"] })).toEqual({
      coaching_formats: "required.coaching_formats",
    });
    expect(typeErrors({ coaching_formats: ["group_coaching"], competition_levels: [] })).toEqual(
      {},
    );
  });

  it("counts characters as the API does (code points, trimmed)", () => {
    expect(lengthOf("  Беларуская ")).toBe(10);
    expect(lengthOf("🥊🥊")).toBe(2);
  });
});

describe("nameSuggestion (an editable suggestion, never persisted data)", () => {
  it("suggests the account's full name for a new, unsaved profile", () => {
    expect(nameSuggestion(profile("not_started", [...ALL_MISSING]), "  Alex Kowalski ")).toBe(
      "Alex Kowalski",
    );
  });

  it("never replaces a saved coach name or suggests for a profile already started", () => {
    expect(
      nameSuggestion(profile("in_progress", ["city"], { display_name: "Coach Alex" }), "Alex K"),
    ).toBeUndefined();
    expect(nameSuggestion(profile("in_progress", ["display_name"]), "Alex K")).toBeUndefined();
    expect(nameSuggestion(profile("completed", [], { display_name: "Coach" }), "Alex")).toBe(
      undefined,
    );
  });

  it("offers nothing without a usable account name", () => {
    const fresh = profile("not_started", [...ALL_MISSING]);
    expect(nameSuggestion(fresh, null)).toBeUndefined();
    expect(nameSuggestion(fresh, "   ")).toBeUndefined();
    expect(nameSuggestion(fresh, "n".repeat(61))).toBeUndefined();
  });
});

describe("rejectionOf / messageFor (stable SF-50 codes, never messages)", () => {
  it("maps each code to a message key", () => {
    expect(messageFor("display_name", "required")).toBe("required.display_name");
    expect(messageFor("coaching_formats", "required")).toBe("required.coaching_formats");
    expect(messageFor("bio", "too_long")).toBe("tooLong");
    expect(messageFor("country_code", "invalid_choice")).toBe("invalidChoice");
    expect(messageFor("city", "invalid_format")).toBe("invalidFormat");
    expect(messageFor("languages", "invalid")).toBe("invalid");
    expect(messageFor("brand_name", "invalid_type")).toBe("invalid");
  });

  it("separates the account registration requirement and lists missing fields", () => {
    expect(rejectionOf(validation({ account_registration: ["required"] }))).toEqual({
      fields: {},
      missing: [],
      accountRegistration: true,
    });
    expect(
      rejectionOf(validation({ city: ["required"], coaching_formats: ["required"] })),
    ).toMatchObject({ missing: ["city", "coaching_formats"], accountRegistration: false });
  });

  it("is undefined for anything but a validation error", () => {
    expect(rejectionOf(new ApiError(500, "internal_error", "x", {}, null))).toBeUndefined();
    expect(rejectionOf(new TypeError("Failed to fetch"))).toBeUndefined();
  });
});
