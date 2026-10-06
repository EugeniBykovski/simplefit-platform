import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sha256Hex, type AppleSignInResponse } from "@/shared/lib/apple-identity";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { AppleSignInButton } from "./apple-sign-in-button";

const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.apple-identity-token-under-test.signature";

const env = vi.hoisted(() => ({
  NEXT_PUBLIC_API_URL: "http://api.test",
  NEXT_PUBLIC_APPLE_SERVICES_ID: "com.simplefit.test.web" as string | undefined,
  NEXT_PUBLIC_APPLE_REDIRECT_URI: "https://app.simplefit.test/login" as string | undefined,
}));
vi.mock("@/shared/config/env", () => ({ publicEnv: env }));

const replace = vi.hoisted(() => vi.fn());
vi.mock("@/shared/i18n/navigation", () => ({ useRouter: () => ({ replace }) }));

// next/script cannot load anything in jsdom: report the script as loaded, or failed.
const script = vi.hoisted(() => ({ fails: false }));
vi.mock("next/script", () => ({
  default: function Script({ onReady, onError }: { onReady?: () => void; onError?: () => void }) {
    useEffect(() => (script.fails ? onError?.() : onReady?.()), [onReady, onError]);
    return null;
  },
}));

type InitConfig = { state: string; nonce: string; [key: string]: unknown };

/** A stand-in for Apple JS: `respond` decides what the popup returns. */
function installApple(respond: (config: InitConfig) => Promise<AppleSignInResponse>) {
  let config: InitConfig | undefined;
  const auth = {
    init: vi.fn((c: InitConfig) => {
      config = c;
    }),
    signIn: vi.fn(() => respond(config as InitConfig)),
  };
  vi.stubGlobal("AppleID", { auth });
  return auth;
}

const approve = (config: InitConfig) =>
  Promise.resolve({ authorization: { id_token: ID_TOKEN, code: "c.0.x", state: config.state } });

const session = (account: "created" | "existing") =>
  jsonResponse({
    access_token: "sfa_from_apple",
    access_token_expires_at: new Date(Date.now() + 900_000).toISOString(),
    refresh_token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    refresh_token_transport: "cookie",
    token_type: "Bearer",
    account,
  });

const apiError = (status: number, code: string) =>
  jsonResponse({ error: { code, message: "ignored by the client", details: {} } }, { status });

async function press() {
  await userEvent.setup().click(screen.getByRole("button", { name: "Continue with Apple" }));
}

describe("AppleSignInButton", () => {
  beforeEach(() => {
    env.NEXT_PUBLIC_APPLE_SERVICES_ID = "com.simplefit.test.web";
    env.NEXT_PUBLIC_APPLE_REDIRECT_URI = "https://app.simplefit.test/login";
    script.fails = false;
    localStorage.clear();
    sessionStorage.clear();
  });

  it.each(["created", "existing"] as const)(
    "signs in through the popup with a hashed nonce and a cookie session (%s account)",
    async (account) => {
      const apple = installApple(approve);
      const fetchMock = vi.fn().mockResolvedValue(session(account));
      vi.stubGlobal("fetch", fetchMock);
      const log = vi.spyOn(console, "log");

      await renderWithProviders(<AppleSignInButton />);
      await press();

      await waitFor(() => expect(replace).toHaveBeenCalledWith("/app"));
      const config = apple.init.mock.calls[0]?.[0] as InitConfig;
      expect(config).toMatchObject({
        clientId: "com.simplefit.test.web",
        redirectURI: "https://app.simplefit.test/login",
        scope: "",
        usePopup: true,
      });
      expect(config.state).toMatch(/^[A-Za-z0-9_-]{22}$/);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://api.test/api/auth/apple");
      expect(init).toMatchObject({ method: "POST", credentials: "include" });
      expect(new Headers(init.headers).get("x-simplefit-csrf")).toBe("1");
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body).toEqual({
        id_token: ID_TOKEN,
        nonce: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        refresh_token_transport: "cookie",
      });
      // Apple received the hash; the API receives the raw nonce.
      expect(config.nonce).toBe(await sha256Hex(body.nonce as string));

      const kept = [
        JSON.stringify({ ...localStorage }),
        JSON.stringify({ ...sessionStorage }),
        document.cookie,
        window.location.href,
        document.body.innerHTML,
      ];
      expect(kept.filter((value) => value.includes(ID_TOKEN))).toEqual([]);
      expect(kept.filter((value) => value.includes(body.nonce as string))).toEqual([]);
      expect(log).not.toHaveBeenCalled();
    },
  );

  it("uses a fresh nonce and state for every attempt", async () => {
    const apple = installApple(() => Promise.reject({ error: "popup_closed_by_user" }));
    await renderWithProviders(<AppleSignInButton />);
    await press();
    await press();

    const [first, second] = apple.init.mock.calls.map(([c]) => c as InitConfig);
    expect(first?.nonce).not.toBe(second?.nonce);
    expect(first?.state).not.toBe(second?.state);
  });

  it.each(["popup_closed_by_user", "user_cancelled_authorize"])(
    "treats %s as a silent cancellation",
    async (error) => {
      installApple(() => Promise.reject({ error }));
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await renderWithProviders(<AppleSignInButton />);
      await press();

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeEnabled(),
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a response whose state does not match", async () => {
    installApple(() =>
      Promise.resolve({ authorization: { id_token: ID_TOKEN, state: "forged-state" } }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await renderWithProviders(<AppleSignInButton />);
    await press();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an Apple provider failure generically", async () => {
    installApple(() => Promise.reject({ error: "invalid_client" }));
    await renderWithProviders(<AppleSignInButton />);
    await press();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
  });

  it.each([
    [401, "unauthorized", "We couldn't verify your Apple sign-in. Please try again."],
    [429, "rate_limited", "Too many sign-in attempts. Wait a few minutes and try again."],
    [
      503,
      "service_unavailable",
      "Apple sign-in is temporarily unavailable. Please try again later.",
    ],
    [500, "internal_error", "Something went wrong. Please try again."],
  ])("explains a %i %s response", async (status, code, message) => {
    installApple(approve);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiError(status, code)));

    await renderWithProviders(<AppleSignInButton />);
    await press();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(replace).not.toHaveBeenCalled();
  });

  it("ignores repeated clicks while a sign-in is in flight", async () => {
    const apple = installApple(approve);
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => undefined)));
    const user = userEvent.setup();

    await renderWithProviders(<AppleSignInButton />);
    const button = screen.getByRole("button", { name: "Continue with Apple" });
    await user.click(button);
    await user.click(button);

    expect(apple.signIn).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Signing you in with Apple…");
  });

  it("reports when Apple's script cannot load", async () => {
    script.fails = true;
    await renderWithProviders(<AppleSignInButton />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Apple sign-in couldn't load. Check your connection and reload the page.",
    );
    expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeDisabled();
  });

  it.each(["NEXT_PUBLIC_APPLE_SERVICES_ID", "NEXT_PUBLIC_APPLE_REDIRECT_URI"] as const)(
    "degrades to an unavailable message without %s",
    async (name) => {
      env[name] = undefined;
      const apple = installApple(approve);

      await renderWithProviders(<AppleSignInButton />, { locale: "pl" });

      expect(screen.getByText("Logowanie przez Apple nie jest tu dostępne.")).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(apple.init).not.toHaveBeenCalled();
    },
  );
});
