import { describe, expect, it } from "vitest";

import {
  addDays,
  datesFrom,
  daysBetween,
  firstDayOfWeek,
  isoWeekday,
  isWallDate,
  layoutDay,
  wallClock,
  wallDate,
  wallMinutes,
  weekStart,
  windowFor,
} from "./calendar";

describe("timetable calendar arithmetic (SF-98)", () => {
  it("moves wall dates by calendar days across months, years and DST nights", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(daysBetween("2026-11-02", "2027-11-02")).toBe(365);
  });

  it("knows ISO weekdays and validates wall dates", () => {
    expect(isoWeekday("2026-11-02")).toBe(1);
    expect(isoWeekday("2026-11-08")).toBe(7);
    expect(isWallDate("2026-02-29")).toBe(false);
    expect(isWallDate("2028-02-29")).toBe(true);
    expect(isWallDate("2026-13-01")).toBe(false);
  });

  it("starts the week on the locale's first day, not always Monday or Sunday", () => {
    expect(firstDayOfWeek("pl")).toBe(1);
    expect(firstDayOfWeek("de")).toBe(1);
    expect(firstDayOfWeek("en")).toBe(7);
    expect(weekStart("2026-11-05", 1)).toBe("2026-11-02");
    expect(weekStart("2026-11-05", 7)).toBe("2026-11-01");
    expect(weekStart("2026-11-01", 1)).toBe("2026-10-26");
    expect(datesFrom("2026-11-02", 7)).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
  });

  it("asks for a window that holds the dates' classes in any zone, within the backend's 31 days", () => {
    const { from, to } = windowFor("2026-11-02", "2026-11-08");
    expect(from).toBe("2026-11-01T10:00:00.000Z");
    expect(to).toBe("2026-11-09T14:00:00.000Z");
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBeLessThanOrEqual(31);
  });

  it("reads the backend's wall times without any zone conversion", () => {
    expect(wallDate("2027-03-29T18:00:00")).toBe("2027-03-29");
    expect(wallClock("2027-03-29T18:00:00")).toBe("18:00");
    expect(wallMinutes("2027-03-29T18:30:00")).toBe(18 * 60 + 30);
  });

  it("lays overlapping classes side by side and the rest full width", () => {
    const items = [
      { id: "a", start: 9 * 60, end: 10 * 60 + 30 },
      { id: "b", start: 10 * 60, end: 11 * 60 },
      { id: "c", start: 10 * 60 + 30, end: 12 * 60 },
      { id: "d", start: 18 * 60, end: 19 * 60 },
    ];
    const placed = layoutDay(items, (item) => item);
    const lane = (id: string) => placed.find((entry) => entry.item.id === id)!;
    expect([lane("a").lane, lane("b").lane, lane("c").lane]).toEqual([0, 1, 0]);
    expect(lane("a").lanes).toBe(2);
    expect(lane("d")).toMatchObject({ lane: 0, lanes: 1 });
    // A class ending after midnight stays within its day.
    expect(layoutDay([{ start: 23 * 60, end: 25 * 60 }], (item) => item)[0]?.end).toBe(24 * 60);
  });
});
