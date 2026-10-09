import { describe, expect, it } from "vitest";

import { dayWithSimpleFit, headerDate, partOfDay } from "./home-date";

describe("dayWithSimpleFit", () => {
  const now = new Date(2026, 9, 10, 9, 30);

  it("counts the completion day as day 1, by the local calendar", () => {
    expect(dayWithSimpleFit(new Date(2026, 9, 10, 0, 5).toISOString(), now)).toBe(1);
    expect(dayWithSimpleFit(new Date(2026, 9, 9, 23, 55).toISOString(), now)).toBe(2);
    expect(dayWithSimpleFit(new Date(2026, 8, 30, 12).toISOString(), now)).toBe(11);
  });

  it("never goes below 1 and needs a valid completion time", () => {
    expect(dayWithSimpleFit(new Date(2026, 9, 12).toISOString(), now)).toBe(1);
    expect(dayWithSimpleFit(null, now)).toBeUndefined();
    expect(dayWithSimpleFit("not a date", now)).toBeUndefined();
  });
});

describe("headerDate", () => {
  it("joins the weekday and the date in the locale's order", () => {
    const saturday = new Date(2026, 9, 3, 12);
    expect(headerDate("en", saturday)).toBe("Sat · Oct 3");
    expect(headerDate("de", saturday)).toMatch(/^Sa\.? · 3\. Okt\.$/);
  });
});

describe("partOfDay", () => {
  it.each([
    [5, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [17, "afternoon"],
    [18, "evening"],
    [23, "evening"],
  ] as const)("%i h is %s", (hour, part) => {
    expect(partOfDay(new Date(2026, 9, 10, hour))).toBe(part);
  });
});
