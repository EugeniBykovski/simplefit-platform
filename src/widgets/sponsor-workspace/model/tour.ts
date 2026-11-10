import type { TourPlacement } from "@/shared/lib/tour";

/**
 * SRW2, the partner portal tour (SF-119; Claude Design `FirstRunSponsorTour`, MVP,
 * canvas 1794299393-d9d6): six coach marks on real portal elements, then the done
 * card. Every target exists for every member: the welcome list (SRW1), the sidebar's
 * Overview, Application, Organization and Members, and the overview's FUTURE card.
 * Nothing points at campaigns, analytics, invoices, invitations or account settings.
 * Copy lives in `sponsorPortal.firstRun.tour` under the step id; the renderer
 * (`SponsorTour`) holds no step knowledge.
 */

/** Production anchors, by stable semantic attribute (never DOM position or text). */
export const SPONSOR_TOUR_TARGETS = {
  welcome: "[data-tour-target=sponsor-welcome]",
  overview: "aside [data-nav-item=overview]",
  application: "aside [data-nav-item=applications]",
  organization: "aside [data-nav-item=organization]",
  members: "aside [data-nav-item=members]",
  future: "[data-tour-target=sponsor-future]",
} as const;

export type SponsorTourTarget = keyof typeof SPONSOR_TOUR_TARGETS;

export type SponsorTourStepId =
  "start" | "overview" | "application" | "organization" | "members" | "future";

export type SponsorTourStep = {
  id: SponsorTourStepId;
  target: SponsorTourTarget;
  placement: TourPlacement;
  spot: { padX: number; padY: number; radius: "xl" | "3xl" | "4xl" };
};

/** SRW2 MVP steps 1–6 (tour 1/6 … 6/6), in design order. */
export const SPONSOR_TOUR_STEPS: readonly SponsorTourStep[] = [
  { id: "start", target: "welcome", placement: "below", spot: { padX: 4, padY: 4, radius: "4xl" } },
  {
    id: "overview",
    target: "overview",
    placement: "right",
    spot: { padX: 4, padY: 4, radius: "xl" },
  },
  {
    id: "application",
    target: "application",
    placement: "right",
    spot: { padX: 4, padY: 4, radius: "xl" },
  },
  {
    id: "organization",
    target: "organization",
    placement: "right",
    spot: { padX: 4, padY: 4, radius: "xl" },
  },
  {
    id: "members",
    target: "members",
    placement: "right",
    spot: { padX: 4, padY: 4, radius: "xl" },
  },
  { id: "future", target: "future", placement: "left", spot: { padX: 4, padY: 4, radius: "4xl" } },
];

/** Below this width the card docks to the bottom of the viewport, without a spotlight (SRW2 docked). */
export const DOCK_BELOW = 1024;
