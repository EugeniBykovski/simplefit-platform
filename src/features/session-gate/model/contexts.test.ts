import { describe, expect, it } from "vitest";

import type { EntryResponseEntry } from "@/shared/api/generated/model";

import { contextOptions } from "./contexts";

const entry = (overrides: Partial<EntryResponseEntry>): EntryResponseEntry => ({
  destination: "role_selection",
  reason: "no_role_started",
  mandatory: false,
  intent: null,
  context: null,
  account_registration: "complete",
  fighter_profile: "not_started",
  coach_profile: "not_started",
  capabilities: [],
  ...overrides,
});

describe("contextOptions (SF-54)", () => {
  it("offers both completed contexts for a Fighter and Coach, and no journey", () => {
    expect(
      contextOptions(
        entry({
          fighter_profile: "completed",
          coach_profile: "completed",
          capabilities: ["FIGHTER", "COACH"],
        }),
      ),
    ).toEqual({ completed: ["fighter", "coach"], journeys: [] });
  });

  it("offers a started journey to continue and an unstarted one to start", () => {
    expect(
      contextOptions(
        entry({
          fighter_profile: "completed",
          coach_profile: "in_progress",
          capabilities: ["FIGHTER"],
        }),
      ),
    ).toEqual({ completed: ["fighter"], journeys: [{ context: "coach", started: true }] });
    expect(contextOptions(entry({ coach_profile: "completed", capabilities: ["COACH"] }))).toEqual({
      completed: ["coach"],
      journeys: [{ context: "fighter", started: false }],
    });
  });

  it("E11: two unfinished journeys and no completed context", () => {
    expect(
      contextOptions(entry({ fighter_profile: "in_progress", coach_profile: "in_progress" })),
    ).toEqual({
      completed: [],
      journeys: [
        { context: "fighter", started: true },
        { context: "coach", started: true },
      ],
    });
  });

  it("counts a context as completed only through its capability, never a profile status", () => {
    // A completed profile without the capability (a stale or inconsistent answer) is not a context.
    expect(
      contextOptions(entry({ coach_profile: "completed", capabilities: [] })).completed,
    ).toEqual([]);
  });
});
