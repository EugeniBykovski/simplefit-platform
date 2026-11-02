import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/http/api-error";

import { isOutdated, timetableProblem } from "./timetable-problem";

const conflict = (details: Record<string, unknown>) =>
  new ApiError(409, "conflict", "conflict", details, null);

describe("timetableProblem (SF-97 error contract)", () => {
  it("names each scheduling conflict without inventing what the backend withholds", () => {
    expect(timetableProblem(conflict({ revision: "stale", current_revision: 3 }))).toEqual({
      kind: "stale",
    });
    expect(timetableProblem(conflict({ schedule: "venue_unavailable" }))).toEqual({
      kind: "venueTaken",
      dates: [],
    });
    expect(
      timetableProblem(conflict({ schedule: "venue_unavailable", local_dates: ["2027-03-29", 7] })),
    ).toEqual({ kind: "venueTaken", dates: ["2027-03-29"] });
    // Another gym's class may be in the way: nothing about it is known.
    expect(timetableProblem(conflict({ schedule: "instructor_unavailable" }))).toEqual({
      kind: "instructorBusy",
    });
    expect(
      timetableProblem(conflict({ venue: "has_upcoming_classes", upcoming_classes: 4 })),
    ).toEqual({ kind: "venueHasClasses", count: 4 });
    expect(timetableProblem(conflict({ venue: "capacity_below_upcoming_class" }))).toEqual({
      kind: "venueCapacity",
      count: null,
    });
    expect(timetableProblem(conflict({ class_occurrence: "started" })).kind).toBe(
      "occurrenceStarted",
    );
    expect(timetableProblem(conflict({ class_series: "cancelled" })).kind).toBe("seriesCancelled");
    expect(timetableProblem(conflict({ setup_status: "draft" })).kind).toBe("draft");
    expect(timetableProblem(conflict({ something: "else" })).kind).toBe("failed");
  });

  it("says a dropped answer is unknown, never a failure or a success", () => {
    expect(timetableProblem(new TypeError("Failed to fetch")).kind).toBe("unknown");
    expect(timetableProblem(new ApiError(503, "unavailable", "x", {}, null)).kind).toBe("unknown");
  });

  it("maps refusals, rate limits and lost access", () => {
    expect(timetableProblem(new ApiError(403, "forbidden", "x", {}, null)).kind).toBe("forbidden");
    expect(timetableProblem(new ApiError(404, "not_found", "x", {}, null)).kind).toBe("gone");
    expect(timetableProblem(new ApiError(429, "rate_limited", "x", {}, null, 90))).toEqual({
      kind: "limited",
      minutes: 2,
    });
    expect(timetableProblem(new ApiError(429, "rate_limited", "x", {}, null))).toEqual({
      kind: "limited",
      minutes: null,
    });
  });

  it("knows which answers mean the record must be read again", () => {
    expect(isOutdated({ kind: "stale" })).toBe(true);
    expect(isOutdated({ kind: "occurrenceCancelled" })).toBe(true);
    expect(isOutdated({ kind: "venueTaken", dates: [] })).toBe(false);
    expect(isOutdated({ kind: "unknown" })).toBe(false);
  });
});
