import { describe, expect, it } from "vitest";

import { KNOCKOUT, initialRefereeState, refereeReducer } from "./referee-count";

describe("referee count (ER1/ER2)", () => {
  it("starts each phase at the design's count", () => {
    expect(initialRefereeState()).toEqual({ phase: "count", count: 1 });
    expect(initialRefereeState("saved")).toEqual({ phase: "saved", count: 7 });
    expect(initialRefereeState("ko")).toEqual({ phase: "ko", count: KNOCKOUT });
  });

  it("counts to ten, then it is a knockout", () => {
    let state = initialRefereeState();
    for (let tick = 0; tick < 8; tick += 1) state = refereeReducer(state, { type: "tick" });
    expect(state).toEqual({ phase: "count", count: 9 });
    state = refereeReducer(state, { type: "tick" });
    expect(state).toEqual({ phase: "ko", count: 10 });
    expect(refereeReducer(state, { type: "tick" })).toBe(state);
  });

  it("beating the count saves at the reached number; count again restarts", () => {
    const saved = refereeReducer({ phase: "count", count: 4 }, { type: "beat" });
    expect(saved).toEqual({ phase: "saved", count: 4 });
    expect(refereeReducer(saved, { type: "tick" })).toBe(saved);
    expect(refereeReducer({ phase: "ko", count: 10 }, { type: "beat" })).toEqual({
      phase: "ko",
      count: 10,
    });
    expect(refereeReducer({ phase: "ko", count: 10 }, { type: "again" })).toEqual({
      phase: "count",
      count: 1,
    });
  });
});
