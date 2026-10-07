"use client";

import { useEffect, useReducer } from "react";

/**
 * The referee count of the 404 (Claude Design ER1/ER2): local presentation
 * state only, nothing is stored or sent.
 *
 * - `count`: the count rises by one every 950 ms; at ten it is a knockout.
 * - `ko`: "Count again" restarts the count at one.
 * - `saved`: "Beat the count" stops it; the reached number is kept.
 */
export type RefereePhase = "count" | "ko" | "saved";
export type RefereeState = { phase: RefereePhase; count: number };
export type RefereeAction = { type: "tick" } | { type: "beat" } | { type: "again" };

export const COUNT_INTERVAL_MS = 950;
export const KNOCKOUT = 10;

/** The design's initial count per phase (count 1, saved 7, ko 10). */
export function initialRefereeState(phase: RefereePhase = "count"): RefereeState {
  return { phase, count: phase === "count" ? 1 : phase === "saved" ? 7 : KNOCKOUT };
}

export function refereeReducer(state: RefereeState, action: RefereeAction): RefereeState {
  switch (action.type) {
    case "tick":
      if (state.phase !== "count") return state;
      return state.count + 1 >= KNOCKOUT
        ? { phase: "ko", count: KNOCKOUT }
        : { ...state, count: state.count + 1 };
    case "beat":
      return state.phase === "count" ? { ...state, phase: "saved" } : state;
    case "again":
      return initialRefereeState("count");
  }
}

/** Runs the count; `frozen` keeps the phase still (deterministic stories and QA). */
export function useRefereeCount({
  initialPhase = "count",
  frozen = false,
}: {
  initialPhase?: RefereePhase;
  frozen?: boolean;
} = {}) {
  const [state, dispatch] = useReducer(refereeReducer, initialPhase, initialRefereeState);

  useEffect(() => {
    if (frozen || state.phase !== "count") return;
    const timer = window.setInterval(() => dispatch({ type: "tick" }), COUNT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [frozen, state.phase]);

  return {
    ...state,
    beat: () => dispatch({ type: "beat" }),
    again: () => dispatch({ type: "again" }),
  };
}
