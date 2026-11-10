/**
 * The browser side of a WebAuthn ceremony (SF-120): turn the backend's options (the
 * WebAuthn JSON form, base64url) into a `navigator.credentials` call and the
 * authenticator's answer back into base64url fields. It decides nothing: the backend
 * issued the challenge and verifies the answer (origin, rpId, challenge, signature,
 * counter, user verification). A browser that returned a credential has proved nothing
 * until the backend says so. No dependency; nothing is stored.
 */

export type WebAuthnFailure =
  /** No WebAuthn in this browser (or not a secure context). */
  | "unsupported"
  /** The person cancelled, the prompt timed out, or no matching key answered. */
  | "cancelled"
  /** This authenticator already holds one of the account's keys (registration only). */
  | "duplicate"
  /** Anything else the browser refused. */
  | "failed";

export class WebAuthnError extends Error {
  override readonly name = "WebAuthnError";
  constructor(readonly reason: WebAuthnFailure) {
    super(`WebAuthn ${reason}`);
  }
}

type Json = Record<string, unknown>;

export function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): ArrayBuffer {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const descriptors = (list: unknown): PublicKeyCredentialDescriptor[] =>
  Array.isArray(list)
    ? list.map((item: Json) => ({ type: "public-key" as const, id: fromBase64Url(text(item.id)) }))
    : [];

/** Whether this browser can run a ceremony at all. */
export function webAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.create === "function"
  );
}

function classify(error: unknown): WebAuthnError {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "AbortError")
      return new WebAuthnError("cancelled");
    if (error.name === "InvalidStateError") return new WebAuthnError("duplicate");
  }
  return new WebAuthnError("failed");
}

/** Registers a new key from the backend's creation options; base64url fields to send back. */
export async function createCredential(
  publicKey: Json,
  signal?: AbortSignal,
): Promise<{ attestation_object: string; client_data_json: string }> {
  if (!webAuthnSupported()) throw new WebAuthnError("unsupported");
  const rp = (publicKey.rp ?? {}) as Json;
  const user = (publicKey.user ?? {}) as Json;
  const options: PublicKeyCredentialCreationOptions = {
    challenge: fromBase64Url(text(publicKey.challenge)),
    rp: { id: text(rp.id), name: text(rp.name) },
    user: {
      id: fromBase64Url(text(user.id)),
      name: text(user.name),
      displayName: text(user.displayName),
    },
    pubKeyCredParams: (Array.isArray(publicKey.pubKeyCredParams)
      ? publicKey.pubKeyCredParams
      : []
    ).map((param: Json) => ({ type: "public-key" as const, alg: Number(param.alg) })),
    timeout: typeof publicKey.timeout === "number" ? publicKey.timeout : undefined,
    attestation: "none",
    authenticatorSelection: publicKey.authenticatorSelection as AuthenticatorSelectionCriteria,
    excludeCredentials: descriptors(publicKey.excludeCredentials),
  };
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.create({ publicKey: options, signal });
  } catch (error) {
    throw classify(error);
  }
  if (!(credential instanceof PublicKeyCredential)) throw new WebAuthnError("failed");
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    attestation_object: toBase64Url(response.attestationObject),
    client_data_json: toBase64Url(response.clientDataJSON),
  };
}

/** Uses a registered key against the backend's request options; base64url fields to send back. */
export async function getAssertion(
  publicKey: Json,
  signal?: AbortSignal,
): Promise<{
  credential_id: string;
  authenticator_data: string;
  client_data_json: string;
  signature: string;
}> {
  if (!webAuthnSupported()) throw new WebAuthnError("unsupported");
  const options: PublicKeyCredentialRequestOptions = {
    challenge: fromBase64Url(text(publicKey.challenge)),
    rpId: text(publicKey.rpId) || undefined,
    timeout: typeof publicKey.timeout === "number" ? publicKey.timeout : undefined,
    userVerification: "required",
    allowCredentials: descriptors(publicKey.allowCredentials),
  };
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get({ publicKey: options, signal });
  } catch (error) {
    throw classify(error);
  }
  if (!(credential instanceof PublicKeyCredential)) throw new WebAuthnError("failed");
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    credential_id: toBase64Url(credential.rawId),
    authenticator_data: toBase64Url(response.authenticatorData),
    client_data_json: toBase64Url(response.clientDataJSON),
    signature: toBase64Url(response.signature),
  };
}
