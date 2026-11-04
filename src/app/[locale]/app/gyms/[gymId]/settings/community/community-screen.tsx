"use client";

import { GymSettingsHeader } from "@/widgets/gym-billing";
import { GymCommunityDefaults } from "@/widgets/gym-verification";
import { useGymWorkspace } from "@/widgets/gym-workspace";

/** WG10 / OG13 for the console's gym: rendered only inside the console, with the backend's gym. */
export function CommunityScreen() {
  const gym = useGymWorkspace();
  return (
    <div className="flex min-h-full flex-col" data-gym-id={gym.id}>
      <GymSettingsHeader gymId={gym.id} active="community" />
      <GymCommunityDefaults gym={gym} />
    </div>
  );
}
