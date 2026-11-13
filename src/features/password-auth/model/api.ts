import { cookieTransport } from "@/entities/session";
import {
  confirmPasswordReset,
  requestPasswordReset,
  signInWithPassword,
} from "@/shared/api/generated/endpoints/auth/auth";
import type { SessionTokens } from "@/shared/api/generated/model";

/*
 * The optional password credential (SF-157, ADR 0012 amendment in simplefit-api),
 * through the generated client. Signing in proves the account only: the Control
 * Plane gate and every operator endpoint decide access. The web client takes its
 * refresh token as the HttpOnly cookie, as every other sign-in does.
 */

/** Exchanges an email address and password for a session. */
export function signIn(email: string, password: string): Promise<SessionTokens> {
  return signInWithPassword(
    { email, password, refresh_token_transport: "cookie" },
    cookieTransport,
  );
}

/** Asks for a code to set or reset a password; the API answers alike for every address. */
export async function requestCode(email: string): Promise<number> {
  const accepted = await requestPasswordReset({ email });
  return Date.now() + accepted.resend_after_seconds * 1000;
}

/** Sets the new password with the emailed code. Signs out everywhere; signs nobody in. */
export function setPassword(email: string, code: string, password: string): Promise<void> {
  return confirmPasswordReset({ email, code, password });
}
