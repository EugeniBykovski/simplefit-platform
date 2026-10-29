"use client";

import { GymStaff } from "@/widgets/gym-staff";
import { useGymWorkspace } from "@/widgets/gym-workspace";

/** WG16 for the console's gym: rendered only inside the console, with the backend's gym. */
export function StaffScreen() {
  return <GymStaff gym={useGymWorkspace()} />;
}
