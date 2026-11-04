"use client";

import { GymSettingsHeader } from "@/widgets/gym-billing";
import { GymVerification } from "@/widgets/gym-verification";
import { useGymWorkspace } from "@/widgets/gym-workspace";

/** OG7 for the console's gym: rendered only inside the console, with the backend's gym. */
export function VerificationScreen() {
  const gym = useGymWorkspace();
  return (
    <div className="flex min-h-full flex-col" data-gym-id={gym.id}>
      <GymSettingsHeader gymId={gym.id} active="verification" />
      <GymVerification gym={gym} />
    </div>
  );
}
