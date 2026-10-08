import { describe, expect, it, vi } from "vitest";

import type { EntryResponseEntry } from "@/shared/api/generated/model";
import { routeHref, webGuards } from "@/shared/routes/routes";

import { destinationRoute, entryHref, entryParams } from "./entry";

vi.mock("@/entities/session", () => ({ callWithSession: vi.fn() }));

const entry = (overrides: Partial<EntryResponseEntry>): EntryResponseEntry => ({
  destination: "role_selection",
  reason: "no_role_started",
  mandatory: false,
  intent: null,
  account_registration: "complete",
  fighter_profile: "not_started",
  capabilities: [],
  ...overrides,
});

const ACCOUNT = entry({
  destination: "account_registration",
  reason: "account_registration_incomplete",
  mandatory: true,
  account_registration: "not_started",
});
const FIGHTER_ONBOARDING = entry({
  destination: "fighter_onboarding",
  reason: "fighter_onboarding_in_progress",
  mandatory: true,
  fighter_profile: "in_progress",
});
const FIGHTER_HOME = entry({
  destination: "fighter_home",
  reason: "fighter_onboarding_completed",
  fighter_profile: "completed",
  capabilities: ["FIGHTER"],
});

describe("destinationRoute", () => {
  it("maps every semantic destination to its canonical web route", () => {
    expect(webGuards.entryDestinations).toEqual({
      account_registration: "web.app.onboarding.account",
      role_selection: "web.app.onboarding.role",
      fighter_onboarding: "web.app.onboarding.fighter",
      fighter_home: "web.app.home",
      coach_onboarding: "web.app.onboarding.coach",
      gym_onboarding: "web.app.onboarding.gym",
      sponsor_application: "web.partners.apply",
    });
    expect(routeHref(destinationRoute("account_registration"))).toBe("/app/onboarding/account");
    expect(routeHref(destinationRoute("role_selection"))).toBe("/app/onboarding/role");
    expect(routeHref(destinationRoute("sponsor_application"))).toBe("/partners/apply");
  });
});

describe("entryHref", () => {
  it("the account gate wins over a safe returnTo and keeps the continuation", () => {
    expect(entryHref(ACCOUNT, { returnTo: "/app/settings/security", intent: "fighter" })).toBe(
      "/app/onboarding/account?returnTo=%2Fapp%2Fsettings%2Fsecurity&intent=fighter",
    );
    expect(entryHref(ACCOUNT)).toBe("/app/onboarding/account");
  });

  it("no intent and no role state: role selection, never Fighter", () => {
    expect(entryHref(entry({}))).toBe("/app/onboarding/role");
  });

  it("a usable returnTo wins over a non-mandatory destination", () => {
    expect(entryHref(entry({}), { returnTo: "/app/settings/security" })).toBe(
      "/app/settings/security",
    );
  });

  it("a returnTo behind a capability the backend does not report is not usable", () => {
    // Kept as the continuation, resolved again once a role journey completes.
    expect(entryHref(entry({}), { returnTo: "/app/home" })).toBe(
      "/app/onboarding/role?returnTo=%2Fapp%2Fhome",
    );
    expect(entryHref(entry({}), { returnTo: "/app/coach" })).toBe(
      "/app/onboarding/role?returnTo=%2Fapp%2Fcoach",
    );
  });

  it("unfinished Fighter onboarding beats an inaccessible Fighter-home returnTo, keeping it", () => {
    expect(entryHref(FIGHTER_ONBOARDING, { returnTo: "/app/home" })).toBe(
      "/app/onboarding/fighter?returnTo=%2Fapp%2Fhome",
    );
  });

  it("a completed fighter may enter Fighter home or a FIGHTER returnTo", () => {
    expect(entryHref(FIGHTER_HOME)).toBe("/app/home");
    expect(entryHref(FIGHTER_HOME, { returnTo: "/app/board" })).toBe("/app/board");
    expect(entryHref(FIGHTER_HOME, { intent: "fighter", returnTo: "/app/board" })).toBe(
      "/app/board",
    );
  });

  it("an explicit intent leads to its journey before a returnTo, which rides along", () => {
    const coach = entry({
      destination: "coach_onboarding",
      reason: "coach_intent",
      intent: "coach",
    });
    expect(entryHref(coach, { intent: "coach", returnTo: "/app/settings/security" })).toBe(
      "/app/onboarding/coach?returnTo=%2Fapp%2Fsettings%2Fsecurity&intent=coach",
    );
    const gym = entry({ destination: "gym_onboarding", reason: "gym_intent", intent: "gym" });
    expect(entryHref(gym, { intent: "gym" })).toBe("/app/onboarding/gym?intent=gym");
  });

  it("the public sponsor application carries no continuation", () => {
    const sponsor = entry({
      destination: "sponsor_application",
      reason: "sponsor_intent",
      intent: "sponsor",
    });
    expect(entryHref(sponsor, { intent: "sponsor", returnTo: "/app/settings/security" })).toBe(
      "/partners/apply",
    );
  });

  it("does not re-enter the entry itself", () => {
    expect(entryHref(entry({}), { returnTo: "/app" }).split("?")[0]).toBe("/app/onboarding/role");
  });

  it.each([
    "https://evil.example/app",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "data:text/html,x",
    "/%2F%2Fevil.example",
    "/login",
    "/app/onboarding/account",
  ])("never follows or carries the unsafe returnTo %s", (returnTo) => {
    expect(entryHref(entry({}), { returnTo })).toBe("/app/onboarding/role");
  });
});

describe("entryParams", () => {
  it("sends only the validated intent", () => {
    expect(entryParams({})).toBeUndefined();
    expect(entryParams({ returnTo: "/app/settings/security" })).toBeUndefined();
    expect(entryParams({ intent: "fighter", returnTo: "/app/settings/security" })).toEqual({
      intent: "fighter",
    });
  });
});
