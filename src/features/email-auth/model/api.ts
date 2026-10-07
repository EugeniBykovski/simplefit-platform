import { cookieTransport } from "@/entities/session";
import {
  getEmailRegistrationStatus,
  requestEmailRegistration,
  requestEmailSignIn,
  verifyEmailLink,
  verifyEmailRegistrationCode,
  verifyEmailSignInCode,
} from "@/shared/api/generated/endpoints/auth/auth";
import type {
  EmailRegistrationStatusStatus,
  EmailVerificationLinkResultStatus,
  SessionTokens,
} from "@/shared/api/generated/model";

import { pending, resendAtFrom, type PendingRegistration } from "./pending";

/*
 * The passwordless email endpoints (ADR 0012 in simplefit-api), through the
 * generated client. Two separate purposes: `email_sign_in` (B) and
 * `email_verification` (A, sign-up). The web client takes its refresh token
 * as the HttpOnly cookie.
 */

/** B: requests a sign-in code. The API answers the same whether or not an account exists. */
export async function requestSignInCode(email: string): Promise<number> {
  const accepted = await requestEmailSignIn({ email });
  const resendAt = resendAtFrom(accepted.resend_after_seconds);
  pending.set("signIn", { email, resendAt });
  return resendAt;
}

/** B: exchanges the emailed code for a session. */
export function verifySignInCode(email: string, code: string): Promise<SessionTokens> {
  return verifyEmailSignInCode({ email, code, refresh_token_transport: "cookie" }, cookieTransport);
}

/**
 * A: starts a registration. The API answers the same for an address that
 * already has an account (no email is sent then); sign-up never turns into
 * sign-in.
 */
export async function requestRegistrationCode(email: string): Promise<PendingRegistration> {
  const accepted = await requestEmailRegistration({ email });
  const flow = {
    email,
    registrationToken: accepted.registration_token,
    resendAt: resendAtFrom(accepted.resend_after_seconds),
  };
  pending.set("registration", flow);
  return flow;
}

/** A: verifies the emailed code on the registration device; creates the account and the session. */
export function verifyRegistrationCode(
  registrationToken: string,
  code: string,
): Promise<SessionTokens> {
  return verifyEmailRegistrationCode(
    { registration_token: registrationToken, code, refresh_token_transport: "cookie" },
    cookieTransport,
  );
}

/** A: where the registration stands (e.g. verified through the link on another device). */
export async function registrationStatus(
  registrationToken: string,
): Promise<EmailRegistrationStatusStatus> {
  return (await getEmailRegistrationStatus({ registration_token: registrationToken })).status;
}

/**
 * A → B after `verified_elsewhere`: the email address is kept, the
 * registration credential is dropped, and a NEW sign-in challenge is
 * requested. The registration token is never reused as a sign-in credential.
 */
export async function handOffToSignIn(email: string): Promise<void> {
  pending.clear("registration");
  await requestSignInCode(email);
}

/** The E01 link: verifies the address only, never creates a session. */
export async function verifyLink(token: string): Promise<EmailVerificationLinkResultStatus> {
  return (await verifyEmailLink({ token })).status;
}
