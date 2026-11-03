"use client";

import { Suspense } from "react";

import { GymBilling, GymSettingsHeader } from "@/widgets/gym-billing";
import { useGymWorkspace } from "@/widgets/gym-workspace";

/** WG25 for the console's gym: rendered only inside the console, with the backend's gym. */
export function PlanScreen() {
  const gym = useGymWorkspace();
  return (
    <div className="flex min-h-full flex-col" data-gym-id={gym.id}>
      <GymSettingsHeader gymId={gym.id} active="plan" />
      <Suspense>
        <GymBilling gym={gym} />
      </Suspense>
    </div>
  );
}
