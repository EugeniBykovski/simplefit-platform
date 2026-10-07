import { VerificationLinkResult } from "@/features/email-auth";
import { Container } from "@/shared/ui/container";

/**
 * WA4b, the E01 link (`/verify-email#token=…`): verifies the email address
 * only and never creates a session. Renders inside the site chrome (registry
 * shell `web.site`).
 */
export function VerifyEmailScreen() {
  return (
    <Container className="flex flex-1 items-center justify-center py-12">
      <VerificationLinkResult />
    </Container>
  );
}
