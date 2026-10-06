/**
 * Sign in with Apple JS (ADR 0014 in simplefit-api), in popup mode: Apple's
 * script opens Apple's sign-in window and hands the result back to the page
 * (`response_mode=web_message`), so there is no redirect callback route. The
 * identity token is exchanged once and dropped; it is never stored, logged
 * or put in a URL.
 *
 * Only the parts SimpleFit uses are typed here.
 */
export const APPLE_ID_SCRIPT_URL =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

export type AppleSignInResponse = {
  authorization: { id_token?: string; code?: string; state?: string };
};

type AppleIdAuth = {
  init(config: {
    clientId: string;
    scope: string;
    redirectURI: string;
    state: string;
    nonce: string;
    usePopup: true;
  }): void;
  signIn(): Promise<AppleSignInResponse>;
};

type AppleGlobal = { AppleID?: { auth?: AppleIdAuth } };

/** The loaded Apple JS client, or undefined before the script has run. */
export function appleIdAuth(): AppleIdAuth | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & AppleGlobal).AppleID?.auth;
}

/** Apple's popup errors that mean the user stopped, not that sign-in failed. */
const CANCELLATIONS = new Set(["popup_closed_by_user", "user_cancelled_authorize"]);

export function isAppleCancellation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("error" in error)) return false;
  return CANCELLATIONS.has(String(error.error));
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** A random value from `size` bytes, base64url without padding. */
export function randomToken(size = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(size)));
}

/** Lowercase hex SHA-256 of `value`: what Apple receives instead of the raw nonce. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
