import { describe, expect, it } from "vitest";

import {
  formatOffset,
  isKnownTimeZone,
  resolveWallTime,
  selectableTimeZones,
  toRfc3339,
  wallTimeOf,
  zoneOffsetMinutes,
} from "./time-zone";

describe("zoneOffsetMinutes", () => {
  it("reads the zone's offset at an instant, across daylight saving", () => {
    expect(zoneOffsetMinutes("Europe/Warsaw", new Date("2026-07-01T12:00:00Z"))).toBe(120);
    expect(zoneOffsetMinutes("Europe/Warsaw", new Date("2026-12-01T12:00:00Z"))).toBe(60);
    expect(zoneOffsetMinutes("America/New_York", new Date("2026-12-01T12:00:00Z"))).toBe(-300);
    expect(zoneOffsetMinutes("Asia/Kolkata", new Date("2026-12-01T12:00:00Z"))).toBe(330);
    expect(zoneOffsetMinutes("UTC", new Date("2026-12-01T12:00:00Z"))).toBe(0);
  });
});

describe("resolveWallTime", () => {
  it("resolves an ordinary wall time to one instant with the zone's offset", () => {
    const result = resolveWallTime("2026-10-21", "18:00", "Europe/Warsaw");
    expect(result.kind).toBe("exact");
    if (result.kind !== "exact") return;
    expect(result.at.instant.toISOString()).toBe("2026-10-21T16:00:00.000Z");
    expect(toRfc3339(result.at)).toBe("2026-10-21T18:00:00+02:00");
  });

  it("refuses a wall time the clocks jump over (spring forward)", () => {
    expect(resolveWallTime("2027-03-28", "02:30", "Europe/Warsaw")).toEqual({ kind: "gap" });
    expect(resolveWallTime("2027-03-14", "02:15", "America/New_York")).toEqual({ kind: "gap" });
  });

  it("offers both instants of a repeated wall time (fall back), earliest first", () => {
    const result = resolveWallTime("2026-10-25", "02:30", "Europe/Warsaw");
    expect(result.kind).toBe("overlap");
    if (result.kind !== "overlap") return;
    expect(toRfc3339(result.first)).toBe("2026-10-25T02:30:00+02:00");
    expect(toRfc3339(result.second)).toBe("2026-10-25T02:30:00+01:00");
    expect(result.first.instant.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(result.second.instant.toISOString()).toBe("2026-10-25T01:30:00.000Z");
  });

  it("keeps the edges of a transition exact", () => {
    // Warsaw springs forward at 02:00 → 03:00; 03:00 and 01:59 exist once.
    expect(resolveWallTime("2027-03-28", "03:00", "Europe/Warsaw").kind).toBe("exact");
    expect(resolveWallTime("2027-03-28", "01:59", "Europe/Warsaw").kind).toBe("exact");
    // It falls back at 03:00 → 02:00; 03:00 exists once.
    expect(resolveWallTime("2026-10-25", "03:00", "Europe/Warsaw").kind).toBe("exact");
  });

  it("handles zones with fractional and southern-hemisphere offsets", () => {
    const kolkata = resolveWallTime("2026-12-01", "09:00", "Asia/Kolkata");
    expect(kolkata.kind === "exact" && toRfc3339(kolkata.at)).toBe("2026-12-01T09:00:00+05:30");
    // Sydney springs forward on 2026-10-04 at 02:00 → 03:00.
    expect(resolveWallTime("2026-10-04", "02:30", "Australia/Sydney")).toEqual({ kind: "gap" });
  });

  it("formats UTC with a zero offset", () => {
    const result = resolveWallTime("2026-12-01", "07:05", "UTC");
    expect(result.kind === "exact" && toRfc3339(result.at)).toBe("2026-12-01T07:05:00+00:00");
  });

  it("rejects malformed dates, times and unknown zones", () => {
    expect(resolveWallTime("2026-02-30", "10:00", "UTC")).toEqual({ kind: "invalid" });
    expect(resolveWallTime("2026-02-10", "24:00", "UTC")).toEqual({ kind: "invalid" });
    expect(resolveWallTime("", "10:00", "UTC")).toEqual({ kind: "invalid" });
    expect(resolveWallTime("2026-02-10", "10:00", "Mars/Olympus")).toEqual({ kind: "invalid" });
  });
});

describe("wallTimeOf", () => {
  it("reads an instant on the zone's wall clock", () => {
    expect(wallTimeOf(new Date("2026-10-21T16:00:00Z"), "Europe/Warsaw")).toEqual({
      date: "2026-10-21",
      time: "18:00",
    });
    expect(wallTimeOf(new Date("2026-10-21T02:00:00Z"), "America/Los_Angeles")).toEqual({
      date: "2026-10-20",
      time: "19:00",
    });
  });
});

describe("formatOffset and zones", () => {
  it("prints signed hour:minute offsets", () => {
    expect(formatOffset(120)).toBe("+02:00");
    expect(formatOffset(-210)).toBe("-03:30");
    expect(formatOffset(0)).toBe("+00:00");
  });

  it("lists UTC first and only region zones, keeping an included one", () => {
    const zones = selectableTimeZones(["Europe/Kiev"]);
    expect(zones[0]).toBe("UTC");
    expect(zones).toContain("Europe/Warsaw");
    expect(zones).toContain("Europe/Kiev");
    expect(zones.some((zone) => zone.startsWith("Etc/"))).toBe(false);
    expect(isKnownTimeZone("Europe/Warsaw")).toBe(true);
    expect(isKnownTimeZone("Nope/Nowhere")).toBe(false);
  });
});
