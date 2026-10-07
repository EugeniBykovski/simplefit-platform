import { act, screen } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as SessionModule from "@/entities/session";

import { resetGoogleIdentityForTests, type GoogleIdentity } from "@/shared/lib/google-identity";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { GoogleSignInButton } from "./google-sign-in-button";

const CLIENT_ID = "111111111111-webclienttest.apps.googleusercontent.com";
const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.google-id-token-under-test.signature";

const env = vi.hoisted(() => ({
  NEXT_PUBLIC_API_URL: "http://api.test",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: undefined as string | undefined,
}));
vi.mock("@/shared/config/env", () => ({ publicEnv: env }));

// Every sign-in method ends in the shared session pipeline (SF-24); navigation is the gate's job.
const completeAuthentication = vi.hoisted(() => vi.fn(async () => "authenticated" as const));
vi.mock("@/entities/session", async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  completeAuthentication,
}));

// next/script cannot load anything in jsdom: report the script as loaded, or failed.
const script = vi.hoisted(() => ({ fails: false }));
vi.mock("next/script", () => ({
  default: function Script({ onReady, onError }: { onReady?: () => void; onError?: () => void }) {
    useEffect(() => (script.fails ? onError?.() : onReady?.()), [onReady, onError]);
    return null;
  },
}));

type Callback = (response: { credential?: string }) => void;

/** A stand-in for Google Identity Services that renders a plain button. */
function installGoogle() {
  let callback: Callback | undefined;
  const id: GoogleIdentity = {
    initialize: vi.fn((config: { callback: Callback }) => {
      callback = config.callback;
    }),
    renderButton: vi.fn((parent: HTMLElement) => {
      const button = document.createElement("button");
      button.textContent = "Continue with Google";
      parent.append(button);
    }),
    disableAutoSelect: vi.fn(),
  };
  vi.stubGlobal("google", { accounts: { id } });
  return {
    id,
    /** Google hands an ID token to the page, as after a successful popup. */
    signIn: async (credential = ID_TOKEN) => act(async () => callback?.({ credential })),
  };
}

const session = (account: "created" | "existing") =>
  jsonResponse({
    access_token: "sfa_from_google",
    access_token_expires_at: new Date(Date.now() + 900_000).toISOString(),
    refresh_token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    refresh_token_transport: "cookie",
    token_type: "Bearer",
    account,
  });

const apiError = (status: number, code: string) =>
  jsonResponse({ error: { code, message: "ignored by the client", details: {} } }, { status });

describe("GoogleSignInButton", () => {
  beforeEach(() => {
    env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = CLIENT_ID;
    script.fails = false;
    resetGoogleIdentityForTests();
    completeAuthentication.mockClear();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("renders Google's button with the web client ID and the page locale", async () => {
    const google = installGoogle();

    await renderWithProviders(<GoogleSignInButton />, { locale: "pl" });

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(google.id.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: CLIENT_ID, auto_select: false }),
    );
    expect(google.id.renderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ text: "continue_with", locale: "pl", theme: "filled_black" }),
    );
  });

  it.each(["created", "existing"] as const)(
    "exchanges the ID token for a cookie session and completes the shared session pipeline (%s account)",
    async (account) => {
      const google = installGoogle();
      const fetchMock = vi.fn().mockResolvedValue(session(account));
      vi.stubGlobal("fetch", fetchMock);
      const log = vi.spyOn(console, "log");

      await renderWithProviders(<GoogleSignInButton />);
      await google.signIn();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://api.test/api/auth/google");
      expect(init).toMatchObject({ method: "POST", credentials: "include" });
      expect(new Headers(init.headers).get("x-simplefit-csrf")).toBe("1");
      expect(JSON.parse(String(init.body))).toEqual({
        id_token: ID_TOKEN,
        refresh_token_transport: "cookie",
      });
      expect(completeAuthentication).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ refresh_token_transport: "cookie" }),
      );

      // The Google ID token is used once and never kept.
      const kept = [
        JSON.stringify({ ...localStorage }),
        JSON.stringify({ ...sessionStorage }),
        document.cookie,
        window.location.href,
        document.body.innerHTML,
      ];
      expect(kept.filter((value) => value.includes(ID_TOKEN))).toEqual([]);
      expect(log).not.toHaveBeenCalled();
    },
  );

  it.each([
    [401, "unauthorized", "We couldn't verify your Google sign-in. Please try again."],
    [429, "rate_limited", "Too many sign-in attempts. Wait a few minutes and try again."],
    [
      503,
      "service_unavailable",
      "Google sign-in is temporarily unavailable. Please try again later.",
    ],
    [500, "internal_error", "Something went wrong. Please try again."],
  ])("explains a %i %s response and lets the user retry", async (status, code, message) => {
    const google = installGoogle();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiError(status, code)));

    await renderWithProviders(<GoogleSignInButton />);
    await google.signIn();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    expect(completeAuthentication).not.toHaveBeenCalled();
  });

  it("reports a network failure", async () => {
    const google = installGoogle();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await renderWithProviders(<GoogleSignInButton />);
    await google.signIn();

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });

  it("shows progress while the token is exchanged", async () => {
    const google = installGoogle();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => undefined)));

    await renderWithProviders(<GoogleSignInButton />);
    await google.signIn();

    expect(screen.getByRole("status")).toHaveTextContent("Signing you in…");
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  });

  it("ignores a Google response without a credential", async () => {
    const google = installGoogle();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await renderWithProviders(<GoogleSignInButton />);
    await google.signIn("");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports when Google's script cannot load", async () => {
    script.fails = true;

    await renderWithProviders(<GoogleSignInButton />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Google sign-in couldn't load. Check your connection and reload the page.",
    );
  });

  it("is unavailable without a configured client ID", async () => {
    env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = undefined;
    const google = installGoogle();

    await renderWithProviders(<GoogleSignInButton />, { locale: "de" });

    expect(
      screen.getByText("Die Anmeldung mit Google ist gerade nicht verfügbar."),
    ).toBeInTheDocument();
    expect(google.id.initialize).not.toHaveBeenCalled();
  });
});
