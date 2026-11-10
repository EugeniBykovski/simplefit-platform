import {
  placeCard,
  visibleBox,
  type Box,
  type Placement,
  type TourPlacement as SharedPlacement,
} from "@/shared/lib/tour";

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
export type TourPlacement = Extract<SharedPlacement, "right" | "left">;

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

export { CARD_WIDTH, type Box, type Placement } from "@/shared/lib/tour";

/**
 * The union of the visible parts of every match of the step's targets, or
 * `undefined` when one target has nothing visible (shared geometry, SF-119).
 */
export function targetBox(step: TourStep, root: ParentNode = document): Box | undefined {
  return visibleBox(
    step.targets.map((target) => TOUR_TARGETS[target]),
    root,
  );
}

/** Where the spotlight, card and arrow go for the step (shared geometry, SF-119). */
export function place(
  step: TourStep,
  box: Box,
  viewport: { width: number; height: number },
  cardHeight: number,
): Placement | undefined {
  return placeCard(step.placement, step.spot, box, viewport, cardHeight);
}
