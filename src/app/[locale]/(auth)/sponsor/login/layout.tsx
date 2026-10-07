import type { ReactNode } from "react";

import { AuthStepFrame } from "@/widgets/auth-screens";

/** The auth step frame around this sign-in placeholder (its screen is built by its own ticket). */
export default function SignInPlaceholderLayout({ children }: { children: ReactNode }) {
  return <AuthStepFrame>{children}</AuthStepFrame>;
}
