import { afterEach, describe, expect, it } from "vitest";

import { CARD_WIDTH, TOUR_DONE, TOUR_STEPS, place, targetBox, type TourStep } from "./tour";

/* GRW2 geometry (SF-91): the four MVP targets, their unions and the card placement. */

const VIEWPORT = { width: 1440, height: 900 };
const step = (id: string) => TOUR_STEPS.find((item) => item.id === id) as TourStep;

function box(
  element: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) {
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => rect,
    }) as DOMRect;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("GRW2 steps", () => {
  it("has exactly the four MVP steps of Claude Design 112 and no FUTURE target", () => {
    expect(TOUR_STEPS.map((item) => item.id)).toEqual(["checklist", "gym", "menu", "switcher"]);
    expect(TOUR_DONE.targets).toEqual(["checklist"]);
    const targets = TOUR_STEPS.flatMap((item) => item.targets);
    expect(targets).toEqual(["checklist", "summary", "access", "soon", "workspace"]);
  });
});

describe("targetBox", () => {
  it("unites every Soon item of the sidebar", () => {
    document.body.innerHTML = `<aside><span data-nav-item="board" aria-disabled="true"></span><a data-nav-item="dashboard"></a><span data-nav-item="settings" aria-disabled="true"></span></aside>`;
    const [board, , settings] = [...document.querySelectorAll("[data-nav-item]")] as HTMLElement[];
    box(board!, { left: 14, top: 180, width: 212, height: 38 });
    box(settings!, { left: 14, top: 820, width: 212, height: 38 });
    expect(targetBox(step("menu"))).toEqual({ left: 14, top: 180, width: 212, height: 678 });
  });

  it("clips each item to its scrolling menu, so items scrolled out of view are left out", () => {
    document.body.innerHTML = `<aside><div style="overflow-y: auto"><span data-nav-item="board" aria-disabled="true"></span><span data-nav-item="settings" aria-disabled="true"></span></div></aside>`;
    const scroller = document.querySelector("aside > div") as HTMLElement;
    const [board, settings] = [...document.querySelectorAll("[data-nav-item]")] as HTMLElement[];
    box(scroller, { left: 14, top: 120, width: 212, height: 660 });
    box(board!, { left: 14, top: 210, width: 212, height: 38 });
    box(settings!, { left: 14, top: 960, width: 212, height: 38 });
    expect(targetBox(step("menu"))).toEqual({ left: 14, top: 210, width: 212, height: 38 });
  });

  it("unites the gym and access cards", () => {
    document.body.innerHTML = `<section data-tour-target="gym-summary"></section><section data-tour-target="gym-access"></section>`;
    const [summary, access] = [...document.querySelectorAll("section")] as HTMLElement[];
    box(summary!, { left: 990, top: 100, width: 418, height: 190 });
    box(access!, { left: 990, top: 306, width: 418, height: 150 });
    expect(targetBox(step("gym"))).toEqual({ left: 990, top: 100, width: 418, height: 356 });
  });

  it("is undefined when a target is missing or hidden (the sidebar is a sheet below md)", () => {
    document.body.innerHTML = `<aside><div data-tour-target="workspace"></div></aside>`;
    box(document.querySelector("[data-tour-target]") as HTMLElement, {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });
    expect(targetBox(step("switcher"))).toBeUndefined();
    expect(targetBox(step("checklist"))).toBeUndefined();
  });
});

describe("place", () => {
  it("puts the card right of the checklist, 22 px away, inside the viewport", () => {
    const placed = place(
      step("checklist"),
      { left: 272, top: 264, width: 705, height: 600 },
      VIEWPORT,
      220,
    );
    expect(placed?.spot).toEqual({ left: 266, top: 258, width: 717, height: 612 });
    expect(placed?.card.left).toBe(266 + 717 + 22);
    expect(placed!.card.left + CARD_WIDTH).toBeLessThanOrEqual(VIEWPORT.width - 16);
    expect(placed!.card.top + 220).toBeLessThanOrEqual(VIEWPORT.height - 16);
  });

  it("puts the card left of the gym cards", () => {
    const placed = place(
      step("gym"),
      { left: 990, top: 100, width: 418, height: 356 },
      VIEWPORT,
      200,
    );
    expect(placed?.card.left).toBe(990 - 6 - 22 - CARD_WIDTH);
    expect(placed?.arrow?.x).toBe(placed!.card.left + CARD_WIDTH);
  });

  it("slides the card to the viewport edge, without its arrow, when the 22 px gap does not fit", () => {
    const placed = place(
      step("checklist"),
      { left: 272, top: 220, width: 604, height: 480 },
      { width: 1280, height: 720 },
      210,
    );
    expect(placed?.card.left).toBe(1280 - CARD_WIDTH - 16);
    expect(placed!.card.left).toBeGreaterThanOrEqual(placed!.spot.left + placed!.spot.width);
    expect(placed?.arrow).toBeUndefined();
  });

  it("centres the card when it would cover the target", () => {
    expect(
      place(
        step("checklist"),
        { left: 16, top: 200, width: 1000, height: 400 },
        { width: 1100, height: 800 },
        200,
      ),
    ).toBeUndefined();
    expect(
      place(step("gym"), { left: 200, top: 100, width: 300, height: 300 }, VIEWPORT, 200),
    ).toBeUndefined();
  });

  it("keeps a target taller than the viewport and its card on screen", () => {
    const placed = place(
      step("menu"),
      { left: 14, top: -200, width: 212, height: 1400 },
      VIEWPORT,
      220,
    );
    expect(placed).toBeDefined();
    expect(placed!.card.top).toBeGreaterThanOrEqual(16);
    expect(placed!.arrow!.y).toBeGreaterThanOrEqual(placed!.card.top);
    expect(placed!.arrow!.y).toBeLessThanOrEqual(placed!.card.top + 220);
  });
});
