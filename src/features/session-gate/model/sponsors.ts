import type { EntrySponsorWorkspace } from "@/shared/api/generated/model";

import type { Entry } from "./entry";

/**
 * The sponsor workspaces of one account (SF-112 `sponsor_workspaces`): active
 * memberships of active organizations, re-read on every entry resolution, so
 * a revoked membership or a suspended organization is gone from the next
 * answer. A listed organization is a choice, never authority: its portal
 * authorizes the organization in its path on every request (D-SA26).
 */
export type SponsorWorkspace = EntrySponsorWorkspace;

export type SponsorWorkspaceOptions = {
  /**
   * The organizations to open, in the entry's order (oldest membership first).
   * The entry lists at most 25; no listing beyond it exists yet, so a 26th
   * organization is reached by its own link only.
   */
  enter: SponsorWorkspace[];
};

export function sponsorWorkspaceOptions(entry: Entry): SponsorWorkspaceOptions {
  return { enter: entry.sponsor_workspaces };
}
