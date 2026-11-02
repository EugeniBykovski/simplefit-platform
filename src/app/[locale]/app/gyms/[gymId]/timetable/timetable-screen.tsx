"use client";

import { GymTimetable } from "@/widgets/gym-timetable";
import { useGymWorkspace } from "@/widgets/gym-workspace";

/** WG5 for the console's gym: rendered only inside the console, with the backend's gym. */
export function TimetableScreen() {
  return <GymTimetable gym={useGymWorkspace()} />;
}
