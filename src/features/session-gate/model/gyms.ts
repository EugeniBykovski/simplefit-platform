import type { EntryGymWorkspace } from "@/shared/api/generated/model";

import type { Entry } from "./entry";

/**
 * The gym workspaces of one account (SF-84 `gym_workspaces`): gyms where the
 * user holds an active staff membership, re-read on every entry resolution,
 * so a revoked membership is gone from the next answer. What may be done
 * with each is the backend's `available_actions`, never the client's guess:
 * `enter` a completed gym, `continue_setup` of the user's own draft. A gym
 * listed with neither offers nothing.
 */
export type GymWorkspace = EntryGymWorkspace;

export type GymWorkspaceOptions = {
  /** Completed gyms to open (`enter`), in the entry's order (newest membership first). */
  enter: GymWorkspace[];
  /** Drafts whose setup the user continues (`continue_setup`); setup only, never a console. */
  setup: GymWorkspace[];
  /** The entry lists at most 25; more exist when the count says so (`listMyGyms` pages them). */
  more: boolean;
};

export function gymWorkspaceOptions(entry: Entry): GymWorkspaceOptions {
  const workspaces = entry.gym_workspaces;
  return {
    enter: workspaces.filter((gym) => gym.available_actions.includes("enter")),
    setup: workspaces.filter((gym) => gym.available_actions.includes("continue_setup")),
    more: entry.gym_workspace_count > workspaces.length,
  };
}
