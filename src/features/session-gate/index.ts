export { useEntryChoice, type EntryChoiceState } from "./ui/entry-choice";
export { EntryRedirect, useEntry, useEntryFailure } from "./ui/entry-redirect";
export { chooseEntryContext, type EntryContext } from "./ui/entry-context";
export {
  CoachGate,
  FighterGate,
  GymGate,
  SponsorGate,
  useWorkspaceEntry,
} from "./ui/workspace-gate";
export { OnboardingGate } from "./ui/onboarding-gate";
export { GuestOnly, RequireSession } from "./ui/session-gate";
export {
  contextOptions,
  PROFILE_CONTEXTS,
  type ContextOptions,
  type Journey,
  type ProfileContext,
} from "./model/contexts";
export type { Entry, KnownEntry } from "./model/entry";
export { entryHref, isKnownEntry } from "./ui/entry-href";
export {
  gymTarget,
  sponsorTarget,
  useContextSwitch,
  type ContextSwitchState,
  type SwitchTarget,
} from "./ui/context-switch";
export {
  ContextSwitcher,
  GymTile,
  initialsOf,
  SponsorTile,
  type GymIdentity,
  type SponsorIdentity,
  type SwitcherCurrent,
} from "./ui/context-switcher";
export { gymWorkspaceOptions, type GymWorkspace, type GymWorkspaceOptions } from "./model/gyms";
export {
  sponsorWorkspaceOptions,
  type SponsorWorkspace,
  type SponsorWorkspaceOptions,
} from "./model/sponsors";
