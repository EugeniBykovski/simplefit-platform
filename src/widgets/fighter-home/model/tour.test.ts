import { describe, expect, it } from "vitest";

import { TOUR_DONE, TOUR_STEPS, place } from "./tour";

const viewport = { width: 1440, height: 900 };
const step = (id: string) => {
  const found = TOUR_STEPS.find((item) => item.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe("TOUR_STEPS", () => {
  it("is the artboards' nine steps in order (FRW2 steps 1–9)", () => {
    expect(TOUR_STEPS.map((item) => item.id)).toEqual([
      "home",
      "board",
      "camp",
      "progress",
      "people",
      "market",
      "week",
      "privacy",
      "workspace",
    ]);
    expect(step("people").targets).toEqual(["community", "discover", "profile"]);
    expect(step("week").targets).toEqual(["calendar", "messages"]);
  });
});

describe("place", () => {
  it("right: the card 22 px beside the spotlight, its top 52 px above the centre", () => {
    // Step 2: the Live Board item at 14 / 209, 212 × 38 → spotlight 10 / 205, 220 × 46.
    const placement = place(
      step("board"),
      { left: 14, top: 209, width: 212, height: 38 },
      viewport,
      210,
    );
    expect(placement).toEqual({
      spot: { left: 10, top: 205, width: 220, height: 46 },
      card: { left: 252, top: 176 },
      arrow: { x: 252, y: 228 },
    });
  });

  it("right: the checklist spotlight is 6 / 7 px larger (FRW2)", () => {
    const placement = place(
      step("home"),
      { left: 272, top: 101, width: 641, height: 435 },
      viewport,
      190,
    );
    expect(placement?.spot).toEqual({ left: 266, top: 94, width: 653, height: 449 });
    expect(placement?.card.left).toBe(941);
  });

  it("keeps the card inside the viewport vertically", () => {
    const high = place(
      step("workspace"),
      { left: 14, top: 10, width: 212, height: 40 },
      viewport,
      230,
    );
    expect(high?.card.top).toBe(16);
    const low = place(
      step("privacy"),
      { left: 14, top: 690, width: 212, height: 38 },
      { width: 1280, height: 720 },
      210,
    );
    expect(low?.card.top).toBe(720 - 210 - 16);
  });

  it("below: centred under the target, clamped to the edge (complete)", () => {
    const placement = place(
      TOUR_DONE,
      { left: 1138, top: 18, width: 145, height: 40 },
      viewport,
      200,
    );
    expect(placement?.spot).toEqual({ left: 1134, top: 14, width: 153, height: 48 });
    expect(placement?.card).toEqual({ left: 1020.5, top: 82 });
    const edge = place(TOUR_DONE, { left: 1264, top: 18, width: 144, height: 40 }, viewport, 200);
    expect(edge?.card.left).toBe(1440 - 380 - 16);
  });

  it("no room beside or below: centred instead", () => {
    expect(
      place(
        step("home"),
        { left: 16, top: 100, width: 358, height: 400 },
        { width: 390, height: 844 },
        200,
      ),
    ).toBeUndefined();
    expect(
      place(
        TOUR_DONE,
        { left: 200, top: 18, width: 140, height: 40 },
        { width: 390, height: 200 },
        200,
      ),
    ).toBeUndefined();
  });
});
