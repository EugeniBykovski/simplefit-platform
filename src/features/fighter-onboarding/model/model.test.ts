import { describe, expect, it } from "vitest";

import type { FighterProfile } from "@/entities/fighter-profile";
import { ApiError } from "@/shared/api/http/api-error";

import { messageFor, rejectionOf } from "./errors";
import {
  basicsErrors,
  basicsPatch,
  changedOnly,
  GOALS,
  profileFrom,
  profilePatch,
  STANCES,
} from "./form-values";
import { decideStep, resumeStep } from "./steps";

const ALL_MISSING = [
  "display_name",
  "username",
  "country_code",
  "city",
  "experience_level",
  "stance",
] as const;

function profile(
  status: FighterProfile["onboarding"]["status"],
  missing: FighterProfile["onboarding"]["missing_requirements"] = [],
  fields: Partial<FighterProfile> = {},
): FighterProfile {
  return {
    display_name: null,
    username: null,
    country_code: null,
    city: null,
    experience_level: null,
    stance: null,
    amateur_bout_count: null,
    goals: [],
    weight_class: null,
    current_weight_kg: null,
    height_cm: null,
    next_fight_on: null,
    next_fight_name: null,
    ...fields,
    onboarding: {
      status,
      completed_at: status === "completed" ? "2026-10-08T12:00:00Z" : null,
      missing_requirements: missing,
    },
  };
}

const validation = (field_codes: Record<string, string[]>) =>
  new ApiError(422, "validation_error", "Validation failed", { fields: {}, field_codes }, null);

describe("decideStep (backend state decides, ?step= only navigates)", () => {
  it("starts a new Fighter at Profile basics", () => {
    expect(decideStep(profile("not_started", [...ALL_MISSING]), null, false)).toEqual({
      kind: "step",
      step: "basics",
    });
  });

  it("resumes at the earliest step with a missing requirement (a mobile start included)", () => {
    const basicsSaved = profile("in_progress", ["experience_level", "stance"]);
    expect(resumeStep(basicsSaved)).toBe("profile");
    expect(decideStep(basicsSaved, null, false)).toEqual({ kind: "step", step: "profile" });
    expect(resumeStep(profile("in_progress", ["city", "stance"]))).toBe("basics");
  });

  it("keeps both form steps reachable while unfinished", () => {
    const partial = profile("in_progress", ["city"]);
    expect(decideStep(partial, "profile", false)).toEqual({ kind: "step", step: "profile" });
    expect(decideStep(partial, "basics", false)).toEqual({ kind: "step", step: "basics" });
  });

  it.each(["complete", "gym", "coach", "privacy", "notifications", "garbage"])(
    "never shows ?step=%s on an unfinished profile: it resolves to the resume step",
    (requested) => {
      expect(decideStep(profile("in_progress", ["stance"]), requested, false)).toEqual({
        kind: "step",
        step: "profile",
      });
    },
  );

  it("shows WF6 only right after this tab completed onboarding", () => {
    expect(decideStep(profile("completed"), "complete", true)).toEqual({
      kind: "step",
      step: "complete",
    });
  });

  it.each([null, "basics", "profile", "complete"])(
    "sends a completed Fighter (?step=%s) out to the application, never back into onboarding",
    (requested) => {
      expect(decideStep(profile("completed"), requested, false)).toEqual({ kind: "exit" });
    },
  );
});

describe("errors (branch on field codes, never messages)", () => {
  it.each([
    ["username", "already_exists", "usernameTaken"],
    ["username", "invalid_format", "usernameFormat"],
    ["city", "required", "required.city"],
    ["stance", "required", "required.stance"],
    ["current_weight_kg", "invalid_format", "weightPrecision"],
    ["amateur_bout_count", "out_of_range", "wholeNumber"],
    ["height_cm", "invalid_type", "outOfRange"],
    ["next_fight_on", "invalid_format", "invalidDate"],
    ["next_fight_name", "too_long", "tooLong"],
    ["country_code", "invalid_choice", "invalidChoice"],
    ["city", "something_new", "invalid"],
  ] as const)("%s / %s → %s", (field, code, message) => {
    expect(messageFor(field, code)).toBe(message);
  });

  it("separates the account-registration gate from missing fields", () => {
    expect(rejectionOf(validation({ account_registration: ["required"] }))).toEqual({
      fields: {},
      missing: [],
      accountRegistration: true,
    });
    expect(rejectionOf(validation({ city: ["required"], stance: ["required"] }))).toMatchObject({
      missing: ["city", "stance"],
      accountRegistration: false,
    });
  });

  it("is not a rejection when the request failed for another reason", () => {
    expect(rejectionOf(new TypeError("Failed to fetch"))).toBeUndefined();
    expect(rejectionOf(new ApiError(500, "internal_error", "", {}, null))).toBeUndefined();
  });
});

describe("form values (SF-25 vocabulary, nothing rounded)", () => {
  it("uses the contract's enums only", () => {
    expect(STANCES).toEqual(["orthodox", "southpaw", "switch"]);
    expect(GOALS).toEqual([
      "fitness",
      "learn_boxing",
      "improve_technique",
      "competition",
      "fight_preparation",
    ]);
  });

  it("sends a weight with more precision exactly as typed (the API rejects it, never rounds it)", () => {
    const values = { ...profileFrom(profile("in_progress")), current_weight_kg: "73.85" };
    expect(profilePatch(values)).toEqual({
      patch: expect.objectContaining({ current_weight_kg: 73.85 }),
      errors: {},
    });
  });

  it("reads a decimal comma, keeps optional numbers optional and flags what is not a number", () => {
    const base = profileFrom(profile("in_progress"));
    expect(profilePatch({ ...base, current_weight_kg: "73,8" }).patch.current_weight_kg).toBe(73.8);
    expect(profilePatch(base).patch).toMatchObject({
      amateur_bout_count: null,
      current_weight_kg: null,
      height_cm: null,
      next_fight_on: null,
      next_fight_name: null,
    });
    const invalid = profilePatch({
      ...base,
      amateur_bout_count: "-2",
      height_cm: "1.78",
      current_weight_kg: "heavy",
    });
    expect(invalid.errors).toEqual({
      amateur_bout_count: "wholeNumber",
      height_cm: "invalid",
      current_weight_kg: "invalid",
    });
    expect(invalid.patch).not.toHaveProperty("amateur_bout_count");
  });

  it("keeps the next fight date and event independent", () => {
    const base = profileFrom(profile("in_progress"));
    expect(profilePatch({ ...base, next_fight_name: "Warsaw Cup" }).patch).toMatchObject({
      next_fight_on: null,
      next_fight_name: "Warsaw Cup",
    });
  });

  it("checks WF0's requirements and the username shape before saving", () => {
    expect(basicsErrors({ display_name: " ", username: "", country_code: null, city: "" })).toEqual(
      {
        display_name: "required.display_name",
        username: "required.username",
        country_code: "required.country_code",
        city: "required.city",
      },
    );
    expect(
      basicsErrors({ display_name: "Alex", username: "_alex", country_code: "PL", city: "Warsaw" }),
    ).toEqual({
      username: "usernameFormat",
    });
    // Trimmed text, empty → null (the API's "clear"); the ISO code is sent as chosen.
    expect(
      basicsPatch({ display_name: " Alex K. ", username: "Alex_K", country_code: "PL", city: "" }),
    ).toEqual({
      display_name: "Alex K.",
      username: "Alex_K",
      country_code: "PL",
      city: null,
    });
  });
});

describe("changedOnly (SF-27: a save never writes back another client's newer values)", () => {
  it("keeps the fields this page changed, goals included, and nothing else", () => {
    const patch = {
      display_name: "Alex",
      city: "Warsaw",
      goals: ["fitness" as const],
      stance: null,
    };
    expect(changedOnly(patch, { display_name: true, goals: [false, true] })).toEqual({
      display_name: "Alex",
      goals: ["fitness"],
    });
    // A deliberately cleared field is a change: `null` is sent.
    expect(changedOnly(patch, { stance: true })).toEqual({ stance: null });
    expect(changedOnly(patch, {})).toEqual({});
    expect(changedOnly(patch, { goals: [false] })).toEqual({});
  });
});
