"use client";

import { GymSettingsHeader } from "@/widgets/gym-billing";
import { GymGoLive } from "@/widgets/gym-verification";
import { useGymWorkspace } from "@/widgets/gym-workspace";

/** OG14 for the console's gym: rendered only inside the console, with the backend's gym. */
export function GoLiveScreen() {
  const gym = useGymWorkspace();
  return (
    <div className="flex min-h-full flex-col" data-gym-id={gym.id}>
      <GymSettingsHeader gymId={gym.id} active="goLive" />
      <GymGoLive gym={gym} />
    </div>
  );
}
