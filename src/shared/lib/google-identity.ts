/**
 * Google Identity Services (GIS) for the web: the official script, loaded from
 * Google, renders Google's own "Sign in with Google" button and returns a
 * Google ID token to a callback (ADR 0013 in simplefit-api).
 *
 * Only the parts SimpleFit uses are typed here. The ID token is handed to the
 * callback and must never be stored, logged or put in a URL; it is exchanged
 * for a SimpleFit session and then dropped.
 */
export const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";

export type GoogleButtonOptions = {
  type: "standard";
  theme: "outline" | "filled_black";
  size: "large";
  text: "continue_with";
  shape: "pill";
  logo_alignment: "left";
  width: number;
  locale: string;
};

type GoogleIdConfiguration = {
  client_id: string;
  callback: (response: { credential?: string }) => void;
  auto_select: false;
  cancel_on_tap_outside: true;
};

export type GoogleIdentity = {
  initialize(configuration: GoogleIdConfiguration): void;
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
  disableAutoSelect(): void;
};

type GoogleGlobal = { google?: { accounts?: { id?: GoogleIdentity } } };

/** The loaded GIS client, or undefined before the script has run. */
export function googleIdentity(): GoogleIdentity | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & GoogleGlobal).google?.accounts?.id;
}

let initializedClientId: string | undefined;
let credentialHandler: ((credential: string) => void) | undefined;

/**
 * Initializes GIS once per page load (Google warns on repeated
 * `initialize` calls) and routes every credential to the latest handler.
 */
export function initializeGoogleIdentity(
  identity: GoogleIdentity,
  clientId: string,
  onCredential: (credential: string) => void,
): void {
  credentialHandler = onCredential;
  if (initializedClientId === clientId) return;

  identity.initialize({
    client_id: clientId,
    callback: ({ credential }) => {
      if (typeof credential === "string" && credential !== "") credentialHandler?.(credential);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  initializedClientId = clientId;
}

/** Stops GIS from signing the user in automatically after an explicit sign-out. */
export function disableGoogleAutoSelect(): void {
  googleIdentity()?.disableAutoSelect();
}

/** Test seam: forget the initialization (each test loads a fresh GIS stub). */
export function resetGoogleIdentityForTests(): void {
  initializedClientId = undefined;
  credentialHandler = undefined;
}
