import type { ReactNode } from "react";

import { AuthStepFrame } from "@/widgets/auth-screens";

/** The auth step frame around the Control Plane sign-in (WA1, SF-120). */
export default function AdminSignInLayout({ children }: { children: ReactNode }) {
  return <AuthStepFrame>{children}</AuthStepFrame>;
}
