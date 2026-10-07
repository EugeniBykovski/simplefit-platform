import { useMemo, useSyncExternalStore } from "react";

/**
 * The email challenge a tab is in the middle of, between the email step and
 * the code step (and across a reload of the code step).
 *
 * Kept in this tab's `sessionStorage` only, never in a URL (paths, queries
 * and history leak into logs and referrers): the normalized email address
 * and, for sign-up, the registration token, which is worthless without the
 * emailed code. Cleared when the flow completes. Storage that is unavailable
 * (private mode, blocked site data) falls back to memory for this page load.
 *
 * Sign-up and sign-in are separate purposes with separate records: a
 * registration token is never turned into a sign-in credential.
 */
export type PendingSignIn = { email: string; resendAt: number };
export type PendingRegistration = { email: string; registrationToken: string; resendAt: number };

const KEYS = {
  signIn: "simplefit.auth.email-sign-in",
  registration: "simplefit.auth.email-registration",
} as const;

type Kind = keyof typeof KEYS;
type Value<K extends Kind> = K extends "signIn" ? PendingSignIn : PendingRegistration;

const memory = new Map<Kind, string>();

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function write(kind: Kind, value: string | undefined) {
  if (value === undefined) memory.delete(kind);
  else memory.set(kind, value);
  try {
    if (value === undefined) storage()?.removeItem(KEYS[kind]);
    else storage()?.setItem(KEYS[kind], value);
  } catch {
    // Memory keeps it for this page load.
  }
}

function read(kind: Kind): string | undefined {
  try {
    return storage()?.getItem(KEYS[kind]) ?? memory.get(kind);
  } catch {
    return memory.get(kind);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function parse<K extends Kind>(kind: K, raw: string | undefined): Value<K> | undefined {
  if (raw === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.email !== "string" || value.email === "") return undefined;
    if (typeof value.resendAt !== "number") return undefined;
    if (kind === "registration" && typeof value.registrationToken !== "string") return undefined;
    return value as Value<K>;
  } catch {
    return undefined;
  }
}

export const pending = {
  get: <K extends Kind>(kind: K): Value<K> | undefined => parse(kind, read(kind)),
  set: <K extends Kind>(kind: K, value: Value<K>) => write(kind, JSON.stringify(value)),
  clear: (kind: Kind) => write(kind, undefined),
};

/** The API's canonical form of an address (trim, ASCII lower case), for display and reuse. */
export function normalizeEmail(email: string): string {
  return email.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/** When a resend is allowed again, from the API's `resend_after_seconds`. */
export const resendAtFrom = (seconds: number, now = Date.now()) => now + seconds * 1000;

/**
 * The pending flow of `kind` in this tab: `undefined` before hydration (the
 * server never sees sessionStorage), `null` when there is none.
 */
export function usePendingFlow<K extends Kind>(kind: K): Value<K> | null | undefined {
  const raw = useSyncExternalStore(
    subscribeNever,
    () => read(kind) ?? "",
    () => null,
  );
  return useMemo(
    () => (raw === null ? undefined : (parse(kind, raw || undefined) ?? null)),
    [kind, raw],
  );
}

// The pending flow only changes through this tab's own actions, which re-render anyway.
const subscribeNever = () => () => undefined;
