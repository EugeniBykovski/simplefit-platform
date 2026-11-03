"use client";

import { GymSettingsHeader, GymSettingsIndex } from "@/widgets/gym-billing";
import { useGymWorkspace } from "@/widgets/gym-workspace";

/** The gym settings sections for the console's gym. */
export function SettingsScreen() {
  const gym = useGymWorkspace();
  return (
    <div className="flex min-h-full flex-col" data-gym-id={gym.id}>
      <GymSettingsHeader gymId={gym.id} />
      <GymSettingsIndex gymId={gym.id} />
    </div>
  );
}
