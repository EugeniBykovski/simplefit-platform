/**
 * The Fighter web tour (SF-40; Claude Design 34b, FRW2 `FirstRunWebFTour`, steps 1–9 and complete): nine
 * steps in their canonical order, then the completion card. A step names the
 * real production elements it spotlights (their union when it covers several
 * nav items) and where its card sits; its copy lives in the `fighterHome.tour`
 * messages under the same id. The renderer (`HomeTour`) holds no step
 * knowledge of its own.
 */

/** Production anchors, by stable semantic attribute (never DOM position). */
export const TOUR_TARGETS = {
  checklist: "[data-tour-target=checklist]",
  workspace: "aside [data-tour-target=workspace]",
  tourButton: "[data-tour-target=tour-button]",
  board: "aside [data-nav-item=board]",
  training: "aside [data-nav-item=training]",
  progress: "aside [data-nav-item=progress]",
  community: "aside [data-nav-item=community]",
  discover: "aside [data-nav-item=discover]",
  profile: "aside [data-nav-item=profile]",
  market: "aside [data-nav-item=market]",
  calendar: "aside [data-nav-item=calendar]",
  messages: "aside [data-nav-item=messages]",
  settings: "aside [data-nav-item=settings]",
} as const;

export type TourTarget = keyof typeof TOUR_TARGETS;

/**
 * - `right`: the card 22 px right of the spotlight, its top 52 px above the
 *   target's centre, the arrow on that centre (steps 1–9).
 * - `below`: the card 20 px below the spotlight, centred on it (complete).
 */
export type TourPlacement = "right" | "below";

export type TourStep = {
  id: TourStepId;
  targets: readonly TourTarget[];
  placement: TourPlacement;
  /** The spotlight's padding around the target box and its radius token. */
  spot: { padX: number; padY: number; radius: "md-lg" | "lg" | "xl" | "4xl" };
};

export type TourStepId =
  | "home"
  | "board"
  | "camp"
  | "progress"
  | "people"
  | "market"
  | "week"
  | "privacy"
  | "workspace"
  | "done";

const NAV = { padX: 4, padY: 4, radius: "md-lg" } as const;

/** FRW2 steps 1–9 (tour 1/9 … 9/9), in order. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "home",
    targets: ["checklist"],
    placement: "right",
    spot: { padX: 6, padY: 7, radius: "4xl" },
  },
  { id: "board", targets: ["board"], placement: "right", spot: NAV },
  { id: "camp", targets: ["training"], placement: "right", spot: NAV },
  { id: "progress", targets: ["progress"], placement: "right", spot: NAV },
  {
    id: "people",
    targets: ["community", "discover", "profile"],
    placement: "right",
    spot: NAV,
  },
  { id: "market", targets: ["market"], placement: "right", spot: NAV },
  { id: "week", targets: ["calendar", "messages"], placement: "right", spot: NAV },
  { id: "privacy", targets: ["settings"], placement: "right", spot: NAV },
  // The workspace switcher is not built (D-WEB-WORKSPACE-SWITCHER): the step
  // spotlights the shell identity block where it will sit (SF-40 decision).
  {
    id: "workspace",
    targets: ["workspace"],
    placement: "right",
    spot: { padX: 4, padY: 4, radius: "xl" },
  },
];

/** FRW2 · tour complete, on the "Take the tour" button (replay). */
export const TOUR_DONE: TourStep = {
  id: "done",
  targets: ["tourButton"],
  placement: "below",
  spot: { padX: 4, padY: 4, radius: "lg" },
};

export type Box = { left: number; top: number; width: number; height: number };

/** The union of the targets' boxes, or `undefined` when one is missing or hidden. */
export function targetBox(step: TourStep, root: ParentNode = document): Box | undefined {
  const boxes: DOMRect[] = [];
  for (const target of step.targets) {
    const element = root.querySelector(TOUR_TARGETS[target]);
    if (!(element instanceof HTMLElement)) return undefined;
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return undefined;
    boxes.push(box);
  }
  if (boxes.length === 0) return undefined;
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

export const CARD_WIDTH = 380;
const GAP_RIGHT = 22;
const GAP_BELOW = 20;
/** The card's top above the target's centre (`right`). */
const RISE = 52;
const EDGE = 16;

export type Placement = {
  spot: Box;
  card: { left: number; top: number };
  /** The arrow's centre. */
  arrow: { x: number; y: number };
};

/**
 * Where the spotlight, card and arrow go for a target box in a viewport, or
 * `undefined` when the card cannot sit beside or below it (it is then centred
 * over the page). The card is kept inside the viewport vertically.
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
  if (step.placement === "right") {
    const left = spot.left + spot.width + GAP_RIGHT;
    if (left + CARD_WIDTH + EDGE > viewport.width) return undefined;
    const centre = spot.top + spot.height / 2;
    const maxTop = Math.max(EDGE, viewport.height - cardHeight - EDGE);
    const top = Math.min(Math.max(EDGE, centre - RISE), maxTop);
    return { spot, card: { left, top }, arrow: { x: left, y: centre } };
  }
  const centre = spot.left + spot.width / 2;
  const top = spot.top + spot.height + GAP_BELOW;
  if (top + cardHeight + EDGE > viewport.height || viewport.width < CARD_WIDTH + EDGE * 2) {
    return undefined;
  }
  const left = Math.min(
    Math.max(EDGE, centre - CARD_WIDTH / 2),
    viewport.width - CARD_WIDTH - EDGE,
  );
  return { spot, card: { left, top }, arrow: { x: centre, y: top } };
}
