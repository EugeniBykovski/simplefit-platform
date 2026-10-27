import { describe, expect, it } from "vitest";

import type { GymSetup } from "@/entities/gym-setup";
import { SessionChangedError } from "@/entities/session";
import { ApiError } from "@/shared/api/http/api-error";

import { messageFor, outcomeOf } from "./errors";
import {
  ACCENT_COLORS,
  brandErrors,
  brandPatch,
  GYM_TYPES,
  gymErrors,
  gymFrom,
  gymPatch,
  locationChanged,
  locationErrors,
  locationFrom,
  locationInput,
  normalizeWebsite,
} from "./form-values";
import { decideStep, LATER_STEPS, resumeStep } from "./steps";

const LOCATION = {
  id: "loc-1",
  name: "Warsaw",
  country_code: "PL",
  city: "Warsaw",
  address_line: "ul. Ząbkowska 31",
  entrance_note: null,
  is_primary: true,
};

function setup(fields: Partial<GymSetup> = {}): GymSetup {
  return {
    gym_id: "gym-1",
    name: "Simple Boxing Gym",
    gym_type: "boxing_gym",
    phone: null,
    website: null,
    tagline: null,
    accent_color: null,
    primary_location: null,
    revision: 3,
    setup_status: "draft",
    missing_requirements: ["primary_location"],
    viewer: { role: "owner", permissions: [], staff_membership_id: "sm-1" },
    ...fields,
  } as GymSetup;
}

const api = (status: number, code: string, details: Record<string, unknown> = {}, retry?: string) =>
  ApiError.fromResponse(status, { error: { code, message: "x", details } }, null, retry ?? null);

describe("decideStep (backend state decides, ?step= only navigates)", () => {
  it("shows OG1 without a draft, whatever the query asks", () => {
    for (const requested of [null, "type", "location", "branding", "complete", "plan", "x"]) {
      expect(decideStep(null, requested, false)).toEqual({ kind: "step", step: "type" });
    }
  });

  it("resumes a draft at the earliest missing requirement", () => {
    expect(resumeStep(setup())).toBe("location");
    expect(resumeStep(setup({ missing_requirements: ["name", "primary_location"] }))).toBe("type");
    expect(resumeStep(setup({ missing_requirements: [], primary_location: LOCATION }))).toBe(
      "branding",
    );
    expect(decideStep(setup(), null, false)).toEqual({ kind: "step", step: "location" });
  });

  it("keeps every form step of a draft reachable", () => {
    for (const requested of ["type", "location", "branding"] as const) {
      expect(decideStep(setup(), requested, false)).toEqual({ kind: "step", step: requested });
    }
  });

  it("never shows OG6b or a FUTURE step for a draft", () => {
    for (const requested of ["complete", ...LATER_STEPS, "garbage"]) {
      expect(decideStep(setup(), requested, false)).toEqual({ kind: "step", step: "location" });
    }
  });

  it("shows OG6b for a completed gym only right after this tab completed it", () => {
    const done = setup({ setup_status: "completed", missing_requirements: [] });
    expect(decideStep(done, "complete", true)).toEqual({ kind: "step", step: "complete" });
    expect(decideStep(done, "complete", false)).toEqual({ kind: "exit" });
    expect(decideStep(done, "type", false)).toEqual({ kind: "exit" });
  });

  it("lists the eleven designed steps after OG3 as later", () => {
    expect(LATER_STEPS).toHaveLength(11);
  });
});

describe("outcomeOf", () => {
  it("maps the stable codes, never the messages", () => {
    expect(outcomeOf(api(409, "conflict", { revision: "stale" }))).toEqual({ kind: "stale" });
    expect(outcomeOf(api(409, "conflict", { client_request_id: "discarded" }))).toEqual({
      kind: "discarded",
    });
    expect(outcomeOf(api(409, "conflict", { client_request_id: "reused" }))).toEqual({
      kind: "reused",
    });
    expect(outcomeOf(api(409, "conflict", { setup_status: "completed" }))).toEqual({
      kind: "completed",
    });
    expect(outcomeOf(api(409, "conflict", { owner: "not_exactly_one" }))).toEqual({
      kind: "conflict",
    });
    expect(outcomeOf(api(401, "unauthorized"))).toEqual({ kind: "session" });
    expect(outcomeOf(new SessionChangedError())).toEqual({ kind: "session" });
    expect(outcomeOf(api(403, "forbidden"))).toEqual({ kind: "forbidden" });
    expect(outcomeOf(api(404, "not_found"))).toEqual({ kind: "gone" });
    expect(outcomeOf(api(429, "rate_limited", {}, "120"))).toEqual({
      kind: "rateLimited",
      retryAfter: 120,
    });
  });

  it("never treats a lost response or a server error as a definite failure", () => {
    expect(outcomeOf(new TypeError("Failed to fetch"))).toEqual({ kind: "unconfirmed" });
    expect(outcomeOf(new DOMException("timeout", "TimeoutError"))).toEqual({
      kind: "unconfirmed",
    });
    expect(outcomeOf(api(502, "bad_gateway"))).toEqual({ kind: "unconfirmed" });
    expect(outcomeOf(api(504, "gateway_timeout"))).toEqual({ kind: "unconfirmed" });
  });

  it("splits validation into field messages, completion requirements and the account", () => {
    const outcome = outcomeOf(
      api(422, "validation_error", {
        fields: {},
        field_codes: {
          name: ["too_long"],
          website: ["invalid_format"],
          primary_location: ["required"],
          account_registration: ["required"],
        },
      }),
    );
    expect(outcome).toEqual({
      kind: "invalid",
      fields: { name: "tooLong", website: "invalidFormat", primary_location: "invalid" },
      missing: ["primary_location"],
      accountRegistration: true,
    });
  });

  it("keys required messages by field", () => {
    expect(messageFor("city", "required")).toBe("required.city");
    expect(messageFor("tagline", "required")).toBe("invalid");
    expect(messageFor("accent_color", "invalid_choice")).toBe("invalidChoice");
  });
});

describe("form values", () => {
  it("uses the contract vocabularies", () => {
    expect(GYM_TYPES).toEqual([
      "boxing_gym",
      "boxing_club",
      "amateur_club",
      "professional_team",
      "combat_sports_gym",
      "fitness_boxing_studio",
    ]);
    expect(ACCENT_COLORS).toEqual([
      "#aeb95a",
      "#e3a24f",
      "#e07a5f",
      "#7fa7c9",
      "#edefe7",
      "#8d9840",
    ]);
  });

  it("checks OG1 as the API would", () => {
    const values = { name: " ", gym_type: null, phone: "abc", website: "ftp://x" };
    expect(gymErrors(values)).toEqual({
      name: "required.name",
      gym_type: "required.gym_type",
      phone: "invalidFormat",
      website: "invalidFormat",
    });
    expect(
      gymErrors({
        name: "x".repeat(81),
        gym_type: "boxing_club",
        phone: "+48 (22) 000-00",
        website: "",
      }),
    ).toEqual({ name: "tooLong" });
    expect(
      gymErrors({ name: "Gym", gym_type: "boxing_club", phone: "", website: "https://u:p@gym.pl" }),
    ).toEqual({ website: "invalidFormat" });
  });

  it("adds https:// to a website typed without a scheme, and clears empty optionals", () => {
    expect(normalizeWebsite("simpleboxing.pl")).toBe("https://simpleboxing.pl");
    expect(normalizeWebsite(" http://gym.pl ")).toBe("http://gym.pl");
    expect(normalizeWebsite("  ")).toBeNull();
    expect(
      gymPatch({ name: " Gym ", gym_type: "boxing_gym", phone: " ", website: "gym.pl" }),
    ).toEqual({ name: "Gym", gym_type: "boxing_gym", phone: null, website: "https://gym.pl" });
    expect(gymFrom(null)).toEqual({ name: "", gym_type: null, phone: "", website: "" });
  });

  it("writes the location whole and only when it changed", () => {
    const saved = setup({ primary_location: LOCATION });
    const values = locationFrom(saved);
    expect(locationChanged(saved, values)).toBe(false);
    expect(locationChanged(saved, { ...values, entrance_note: "Courtyard" })).toBe(true);
    expect(locationChanged(setup(), locationFrom(setup()))).toBe(true);
    expect(locationInput({ ...values, entrance_note: "  " })).toEqual({
      country_code: "PL",
      city: "Warsaw",
      address_line: "ul. Ząbkowska 31",
      entrance_note: null,
    });
    expect(
      locationErrors({ country_code: null, city: "", address_line: "", entrance_note: "" }),
    ).toEqual({
      country_code: "required.country_code",
      city: "required.city",
      address_line: "required.address_line",
    });
  });

  it("keeps OG3 optional", () => {
    expect(brandErrors({ tagline: "", accent_color: null })).toEqual({});
    expect(brandErrors({ tagline: "x".repeat(121), accent_color: null })).toEqual({
      tagline: "tooLong",
    });
    expect(brandPatch({ tagline: " ", accent_color: "#7fa7c9" })).toEqual({
      tagline: null,
      accent_color: "#7fa7c9",
    });
  });
});
