import { describe, expect, it, vi } from "vitest";

import { routeHref, webGuards } from "@/shared/routes/routes";

import { destinationRoute, entryHref, entryParams, isKnownEntry, type KnownEntry } from "./entry";

vi.mock("@/entities/session", () => ({ callWithSession: vi.fn() }));

const entry = (overrides: Partial<KnownEntry>): KnownEntry => ({
  destination: "role_selection",
  reason: "no_role_started",
  mandatory: false,
  intent: null,
  context: null,
  account_registration: "complete",
  fighter_profile: "not_started",
  coach_profile: "not_started",
  capabilities: [],
  gym_id: null,
  gym_workspaces: [],
  gym_workspace_count: 0,
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
      coach_home: "web.app.coach",
      context_selection: "web.app.context",
      gym_onboarding: "web.app.onboarding.gym",
      gym_home: "web.app.gyms._gym-id",
      gym_selection: "web.app.gyms",
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

describe("SF-51 destinations (SF-52)", () => {
  const COACH_HOME = entry({
    destination: "coach_home",
    reason: "coach_onboarding_completed",
    coach_profile: "completed",
    capabilities: ["COACH"],
  });

  it("maps Coach home, and context_selection to WCX1: never role selection or Fighter home (SF-54)", () => {
    expect(isKnownEntry(COACH_HOME)).toBe(true);
    expect(routeHref(destinationRoute("coach_home"))).toBe("/app/coach");
    const choice = { ...entry({}), destination: "context_selection" as const };
    expect(isKnownEntry(choice)).toBe(true);
    expect(routeHref(destinationRoute("context_selection"))).toBe("/app/context");
    // A returnTo the entry's capabilities do not allow never wins over the chooser.
    expect(entryHref(choice, { returnTo: "/app/home" })).toBe("/app/context");
    expect(isKnownEntry(entry({ destination: "coach_onboarding" }))).toBe(true);
  });

  it("a Coach intent that resolves to Coach home is a completed journey: a usable returnTo still wins", () => {
    expect(entryHref(COACH_HOME, { intent: "coach" })).toBe("/app/coach");
    expect(entryHref(COACH_HOME, { intent: "coach", returnTo: "/app/coach/fighters" })).toBe(
      "/app/coach/fighters",
    );
  });

  it("a Coach page is not a usable returnTo without the COACH capability", () => {
    const fighter = entry({
      destination: "fighter_home",
      reason: "fighter_onboarding_completed",
      fighter_profile: "completed",
      capabilities: ["FIGHTER"],
    });
    expect(entryHref(fighter, { returnTo: "/app/coach" })).toBe("/app/home");
  });
});

describe("gym destinations (SF-84, SF-88)", () => {
  const GYM = "1b9f6c2a-5d34-4e8b-9a71-0c2e4f6d8a10";
  const OTHER = "7c3e9b1d-2a6f-4c58-b0e4-9d1f3a5c7e82";
  const workspace = (gymId: string, actions: ("enter" | "continue_setup")[]) => ({
    gym_id: gymId,
    name: "Gym",
    role: "owner" as const,
    setup_status: actions.includes("enter") ? ("completed" as const) : ("draft" as const),
    available_actions: actions,
    selected: false,
  });
  const GYM_HOME = entry({
    destination: "gym_home",
    reason: "gym_workspace_completed",
    capabilities: ["GYM_WORKSPACE"],
    gym_id: GYM,
    gym_workspaces: [workspace(GYM, ["enter"])],
    gym_workspace_count: 1,
  });

  it("opens the console of the entry's gym_id, never a guessed gym", () => {
    expect(isKnownEntry(GYM_HOME)).toBe(true);
    expect(entryHref(GYM_HOME)).toBe(`/app/gyms/${GYM}`);
    expect(entryHref(GYM_HOME, { intent: "gym" })).toBe(`/app/gyms/${GYM}`);
  });

  it("does not map a gym_home without its gym_id (a controlled failure)", () => {
    expect(isKnownEntry({ ...GYM_HOME, gym_id: null })).toBe(false);
  });

  it("opens the gym chooser for gym_selection", () => {
    const choice = entry({
      destination: "gym_selection",
      reason: "gym_choice_required",
      capabilities: ["GYM_WORKSPACE"],
      gym_workspaces: [workspace(GYM, ["enter"]), workspace(OTHER, ["enter"])],
      gym_workspace_count: 2,
    });
    expect(isKnownEntry(choice)).toBe(true);
    expect(entryHref(choice)).toBe("/app/gyms");
  });

  it("keeps a gym console returnTo only while the entry reports GYM_WORKSPACE", () => {
    expect(entryHref(GYM_HOME, { returnTo: `/app/gyms/${OTHER}` })).toBe(`/app/gyms/${OTHER}`);
    expect(entryHref(FIGHTER_HOME, { returnTo: `/app/gyms/${OTHER}` })).toBe("/app/home");
  });
});
