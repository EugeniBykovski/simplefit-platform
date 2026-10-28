/**
 * The gym owner's web introduction (SF-91; Claude Design 112 `1793198527-a0fc`,
 * GRW2 `FirstRunWebGTour`, steps 1–4 and done). Only the four MVP targets
 * are here: each is a real element of the production console. The design's
 * FUTURE steps (`f-board` … `f-public`: live board, people, timetable,
 * bookings, community, money, public profile) point at modules that do not
 * exist and are deliberately absent. Copy lives in `gymConsole.firstRun.tour`
 * under the step id; the renderer (`GymTour`) holds no step knowledge.
 */

/** Production anchors, by stable semantic attribute (never DOM position). */
export const TOUR_TARGETS = {
  checklist: "[data-tour-target=gym-checklist]",
  summary: "[data-tour-target=gym-summary]",
  access: "[data-tour-target=gym-access]",
  /** Every console item marked Soon (their union is spotlighted). */
  soon: "aside [data-nav-item][aria-disabled=true]",
  workspace: "aside [data-tour-target=workspace]",
} as const;

export type TourTarget = keyof typeof TOUR_TARGETS;

/**
 * - `right`: the card 22 px right of the spotlight, its top 52 px above the
 *   target's centre, the arrow on that centre.
 * - `left`: the same on the spotlight's left side.
 */
export type TourPlacement = "right" | "left";

export type TourStepId = "checklist" | "gym" | "menu" | "switcher" | "done";

export type TourStep = {
  id: TourStepId;
  targets: readonly TourTarget[];
  placement: TourPlacement;
  spot: { padX: number; padY: number; radius: "md-lg" | "xl" | "3xl" | "4xl" };
};

/** GRW2 steps 1–4 (tour 1/4 … 4/4), in order. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "checklist",
    targets: ["checklist"],
    placement: "right",
    spot: { padX: 6, padY: 6, radius: "4xl" },
  },
  {
    id: "gym",
    targets: ["summary", "access"],
    placement: "left",
    spot: { padX: 6, padY: 6, radius: "4xl" },
  },
  {
    id: "menu",
    targets: ["soon"],
    placement: "right",
    spot: { padX: 4, padY: 4, radius: "md-lg" },
  },
  {
    id: "switcher",
    targets: ["workspace"],
    placement: "right",
    spot: { padX: 4, padY: 4, radius: "xl" },
  },
];

/** GRW2 · done: back on the checklist, after the backend kept `completed`. */
export const TOUR_DONE: TourStep = {
  id: "done",
  targets: ["checklist"],
  placement: "right",
  spot: { padX: 6, padY: 6, radius: "4xl" },
};

export type Box = { left: number; top: number; width: number; height: number };

/** The nearest ancestor that scrolls, whose box clips what the user can see of `element`. */
function scrollClip(element: Element): DOMRect | undefined {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY, overflowX } = getComputedStyle(node);
    if (/(auto|scroll|hidden)/.test(`${overflowY} ${overflowX}`))
      return node.getBoundingClientRect();
  }
  return undefined;
}

/**
 * The union of the visible parts of every match of the step's targets, or
 * `undefined` when one target has nothing visible. Each match is clipped to
 * its scrolling container (the sidebar's menu scrolls on short windows), so
 * the spotlight never covers what lies outside it.
 */
export function targetBox(step: TourStep, root: ParentNode = document): Box | undefined {
  const boxes: { left: number; top: number; right: number; bottom: number }[] = [];
  for (const target of step.targets) {
    const visible = [...root.querySelectorAll(TOUR_TARGETS[target])]
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .map((element) => {
        const box = element.getBoundingClientRect();
        const clip = scrollClip(element);
        return {
          left: Math.max(box.left, clip?.left ?? -Infinity),
          top: Math.max(box.top, clip?.top ?? -Infinity),
          right: Math.min(box.right, clip?.right ?? Infinity),
          bottom: Math.min(box.bottom, clip?.bottom ?? Infinity),
        };
      })
      .filter((box) => box.right - box.left > 0 && box.bottom - box.top > 0);
    if (visible.length === 0) return undefined;
    boxes.push(...visible);
  }
  if (boxes.length === 0) return undefined;
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

export const CARD_WIDTH = 380;
const GAP = 22;
/** The card's top above the target's centre. */
const RISE = 52;
const EDGE = 16;

export type Placement = {
  spot: Box;
  card: { left: number; top: number };
  /** The arrow's centre, or `undefined` when the card sits flush against the spotlight. */
  arrow: { x: number; y: number } | undefined;
};

/** The arrow needs a real gap between the spotlight and the card. */
const ARROW_GAP = 12;

/**
 * Where the spotlight, card and arrow go for a target box in a viewport, or
 * `undefined` when the card cannot sit beside the target without covering it
 * (it is then centred over the dimmed page). The card prefers the step's
 * side, 22 px away; when the window is too narrow for that gap it slides to
 * the viewport edge as long as it still clears the spotlight. It is kept
 * inside the viewport vertically; a spotlight taller than the viewport is
 * clipped to it.
 */
export function place(
  step: TourStep,
  box: Box,
  viewport: { width: number; height: number },
  cardHeight: number,
): Placement | undefined {
  const { padX, padY } = step.spot;
  const spot = {
    left: box.left - padX,
    top: box.top - padY,
    width: box.width + padX * 2,
    height: box.height + padY * 2,
  };
  const visibleTop = Math.max(spot.top, 0);
  const visibleBottom = Math.min(spot.top + spot.height, viewport.height);
  if (visibleBottom <= visibleTop) return undefined;
  const centre = (visibleTop + visibleBottom) / 2;
  const maxTop = Math.max(EDGE, viewport.height - cardHeight - EDGE);
  const top = Math.min(Math.max(EDGE, centre - RISE), maxTop);
  const arrowY = Math.min(Math.max(centre, top + 24), top + Math.max(cardHeight - 24, 24));
  const spotRight = spot.left + spot.width;

  if (step.placement === "right") {
    const left = Math.min(spotRight + GAP, viewport.width - CARD_WIDTH - EDGE);
    if (left < spotRight) return undefined;
    const arrow = left - spotRight >= ARROW_GAP ? { x: left, y: arrowY } : undefined;
    return { spot, card: { left, top }, arrow };
  }
  const left = Math.max(spot.left - GAP - CARD_WIDTH, EDGE);
  if (left + CARD_WIDTH > spot.left) return undefined;
  const arrow =
    spot.left - (left + CARD_WIDTH) >= ARROW_GAP ? { x: left + CARD_WIDTH, y: arrowY } : undefined;
  return { spot, card: { left, top }, arrow };
}
