"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

import { completeAuthentication, cookieTransport } from "@/entities/session";
import { authenticateWithGoogle } from "@/shared/api/generated/endpoints/auth/auth";
import { isApiError } from "@/shared/api/http/api-error";
import { publicEnv } from "@/shared/config/env";
import {
  GOOGLE_IDENTITY_SCRIPT_URL,
  googleIdentity,
  initializeGoogleIdentity,
} from "@/shared/lib/google-identity";
import { Spinner } from "@/shared/ui/spinner";

type Failure = "rejected" | "rateLimited" | "unavailable" | "scriptFailed" | "generic";

// Google renders its button between 200 and 400 px wide.
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

/**
 * "Continue with Google" (SF-22, ADR 0013 in simplefit-api).
 *
 * Google's own button (Google Identity Services) returns a Google ID token,
 * which is exchanged once at `POST /api/auth/google` for a SimpleFit session
 * (refresh cookie + in-memory access token) and then dropped: it is never
 * stored, logged or put in a URL. There is no client secret and no
 * authorization-code flow.
 *
 * The session goes through `completeAuthentication`, the pipeline shared with
 * Apple and the email code (SF-24): it resolves the viewer, and the
 * guest-only gate then enters the application (a valid `returnTo`, otherwise
 * `/app`). A new and an existing account are treated alike; no role is
 * inferred here.
 */
export function GoogleSignInButton() {
  const clientId = publicEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const t = useTranslations("auth.google");

  if (clientId === undefined) {
    return <p className="type-body-sm text-muted-foreground">{t("notConfigured")}</p>;
  }

  return <GoogleButton clientId={clientId} />;
}

function GoogleButton({ clientId }: { clientId: string }) {
  const t = useTranslations("auth.google");
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(() => googleIdentity() !== undefined);
  const [exchanging, setExchanging] = useState(false);
  const [failure, setFailure] = useState<Failure | undefined>();

  const exchange = useCallback(async (idToken: string) => {
    setExchanging(true);
    setFailure(undefined);
    try {
      const session = await authenticateWithGoogle(
        { id_token: idToken, refresh_token_transport: "cookie" },
        cookieTransport,
      );
      // Stays "exchanging" until the gate navigates into the application.
      if ((await completeAuthentication(session)) === "anonymous") {
        setFailure("generic");
        setExchanging(false);
      }
    } catch (error) {
      setFailure(failureOf(error));
      setExchanging(false);
    }
  }, []);

  useEffect(() => {
    const identity = googleIdentity();
    const parent = container.current;
    if (!ready || identity === undefined || parent === null) return;

    initializeGoogleIdentity(identity, clientId, (idToken) => void exchange(idToken));
    parent.replaceChildren();
    identity.renderButton(parent, {
      type: "standard",
      theme: resolvedTheme === "light" ? "outline" : "filled_black",
      size: "large",
      text: "continue_with",
      shape: "pill",
      logo_alignment: "left",
      width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.floor(parent.clientWidth))),
      locale,
    });
  }, [ready, clientId, exchange, locale, resolvedTheme]);

  return (
    <div className="flex flex-col gap-3">
      <Script
        src={GOOGLE_IDENTITY_SCRIPT_URL}
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() => setFailure("scriptFailed")}
      />
      <div ref={container} hidden={exchanging} className="flex min-h-11 w-full justify-center" />
      {exchanging && (
        <p className="flex items-center justify-center gap-2 type-body-sm text-muted-foreground">
          <Spinner />
          <span role="status">{t("exchanging")}</span>
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
