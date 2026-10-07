"use client";

import { useTranslations } from "next-intl";
import Script from "next/script";
import { useRef, useState } from "react";

import { completeAuthentication, cookieTransport } from "@/entities/session";
import { authenticateWithApple } from "@/shared/api/generated/endpoints/auth/auth";
import { isApiError } from "@/shared/api/http/api-error";
import { publicEnv } from "@/shared/config/env";
import {
  APPLE_ID_SCRIPT_URL,
  appleIdAuth,
  isAppleCancellation,
  randomToken,
  sha256Hex,
} from "@/shared/lib/apple-identity";
import { Button } from "@/shared/ui/button";

type Failure = "rejected" | "rateLimited" | "unavailable" | "scriptFailed" | "generic";

/**
 * "Continue with Apple" (SF-23, ADR 0014 in simplefit-api).
 *
 * Apple JS in popup mode returns an Apple identity token for a request that
 * carried the SHA-256 of a fresh raw nonce; the token and the raw nonce are
 * exchanged once at `POST /api/auth/apple` for a SimpleFit session (refresh
 * cookie + in-memory access token) and then dropped. No Apple scopes are
 * requested, so no name or email is collected. `state` is generated per
 * attempt and checked when Apple answers. There is no callback route, no
 * authorization-code exchange and no client secret.
 *
 * The session goes through `completeAuthentication`, the pipeline shared with
 * Google and the email code (SF-24); the guest-only gate then enters the
 * application. A new and an existing account are treated alike; no role is
 * inferred here.
 */
export function AppleSignInButton() {
  const servicesId = publicEnv.NEXT_PUBLIC_APPLE_SERVICES_ID;
  const redirectUri = publicEnv.NEXT_PUBLIC_APPLE_REDIRECT_URI;
  const t = useTranslations("auth.apple");

  if (servicesId === undefined || redirectUri === undefined) {
    // Keeps the button's 54 px row, so the composition does not shift.
    return (
      <p className="flex h-13.5 items-center justify-center type-body-sm text-muted-foreground">
        {t("notConfigured")}
      </p>
    );
  }

  return <AppleButton servicesId={servicesId} redirectUri={redirectUri} />;
}

function AppleButton({ servicesId, redirectUri }: { servicesId: string; redirectUri: string }) {
  const t = useTranslations("auth.apple");
  const [ready, setReady] = useState(() => appleIdAuth() !== undefined);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | undefined>();
  // Guards against a second click before React re-renders the busy state.
  const inFlight = useRef(false);

  async function signIn() {
    const apple = appleIdAuth();
    if (inFlight.current || apple === undefined) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(undefined);

    try {
      const nonce = randomToken();
      const state = randomToken(16);
      apple.init({
        clientId: servicesId,
        scope: "",
        redirectURI: redirectUri,
        state,
        nonce: await sha256Hex(nonce),
        usePopup: true,
      });

      const { authorization } = await apple.signIn();
      if (authorization.state !== state || !authorization.id_token) {
        setFailure("generic");
        return;
      }

      const session = await authenticateWithApple(
        { id_token: authorization.id_token, nonce, refresh_token_transport: "cookie" },
        cookieTransport,
      );
      if ((await completeAuthentication(session)) === "anonymous") setFailure("generic");
    } catch (error) {
      if (!isAppleCancellation(error)) setFailure(failureOf(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Script
        src={APPLE_ID_SCRIPT_URL}
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() => setFailure("scriptFailed")}
      />
      <Button
        variant="secondary"
        size="xl"
        className="w-full"
        disabled={!ready}
        loading={busy}
        onClick={() => void signIn()}
      >
        {t("continue")}
      </Button>
      {busy && (
        <p role="status" className="sr-only">
          {t("exchanging")}
        </p>
      )}
      {failure && (
        <p
          role="alert"
          className="rounded-md border border-destructive-border bg-destructive-subtle px-3 py-2 type-body-sm text-destructive-subtle-foreground"
        >
          {t(`errors.${failure}`)}
        </p>
      )}
    </div>
  );
}

/** Maps the API's error codes (never messages) to user-facing copy. */
function failureOf(error: unknown): Failure {
  if (!isApiError(error)) return "generic";
  switch (error.code) {
    case "unauthorized":
      return "rejected";
    case "rate_limited":
      return "rateLimited";
    case "service_unavailable":
      return "unavailable";
    default:
      return "generic";
  }
}
