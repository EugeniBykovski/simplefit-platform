"use client";

import { GymMembers } from "@/widgets/gym-members";
import { useGymWorkspace } from "@/widgets/gym-workspace";

/** WG3 for the console's gym: rendered only inside the console, with the backend's gym. */
export function MembersScreen() {
  return <GymMembers gym={useGymWorkspace()} />;
}
