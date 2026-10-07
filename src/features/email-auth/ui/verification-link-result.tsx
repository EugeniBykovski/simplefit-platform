"use client";

import { CheckIcon, ClockIcon, LockIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { Spinner } from "@/shared/ui/spinner";
import { textLinkClass } from "@/shared/ui/text-link";

import { verifyLink } from "../model/api";

export type LinkResult = "verifying" | "verified" | "already" | "expired" | "error";

/** The outcome of a failed link verification; branches on `code`, never on messages. */
export function linkFailureOf(error: unknown): LinkResult {
  if (isApiError(error) && ["code_expired", "validation_error"].includes(error.code)) {
    return "expired";
  }
  return "error";
}

/**
 * Reads the E01 link token from the URL fragment (`/verify-email#token=…`;
 * a fragment never reaches a server by itself), removes it from the address
 * bar and history at once, and posts it to the API. The result only verifies
 * the address: no session is created, here or on any other device.
 */
export function useVerificationLink(): { result: LinkResult; retry: () => void } {
  const [result, setResult] = useState<LinkResult>("verifying");
  const token = useRef<string | null | undefined>(undefined);

  const run = useCallback(async () => {
    const value = token.current;
    if (!value) {
      setResult("expired");
      return;
    }
    setResult("verifying");
    try {
      setResult((await verifyLink(value)) === "verified" ? "verified" : "already");
    } catch (error) {
      setResult(linkFailureOf(error));
    }
  }, []);

  useEffect(() => {
    // Once per page load (React may run effects twice in development).
    if (token.current !== undefined) return;
    token.current = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    void run();
  }, [run]);

  return { result, retry: () => void run() };
}

const TILES: Record<Exclude<LinkResult, "verifying">, { icon: LucideIcon; tone: string }> = {
  verified: { icon: CheckIcon, tone: "bg-accent text-highlight" },
  already: { icon: CheckIcon, tone: "bg-surface-elevated text-faint-foreground" },
  expired: { icon: ClockIcon, tone: "bg-warning-subtle text-warning" },
  error: { icon: TriangleAlertIcon, tone: "bg-destructive-subtle text-destructive" },
};

/** WA4b "Email verified" (E01 link). Never signs anyone in. */
export function VerificationLinkResult() {
  const { result, retry } = useVerificationLink();
  return <VerificationLinkView result={result} onRetry={retry} />;
}

export function VerificationLinkView({
  result,
  onRetry,
}: {
  result: LinkResult;
  onRetry: () => void;
}) {
  const t = useTranslations("auth.verifyEmail");
  const tile = result === "verifying" ? undefined : TILES[result];

  return (
    <div className="flex w-full max-w-140 flex-col gap-4.5" aria-busy={result === "verifying"}>
      <span
        aria-hidden
        className={cn(
          "flex size-16 items-center justify-center rounded-3xl",
          tile?.tone ?? "bg-surface-elevated text-muted-foreground",
        )}
      >
        {tile ? <tile.icon className="size-7.5" /> : <Spinner className="size-7" />}
      </span>
      <p className="type-label text-highlight">{t("eyebrow")}</p>
      <div role="status" aria-live="polite" className="flex flex-col gap-4.5">
        <h1 className="type-auth-title text-balance">{t(`${result}.title`)}</h1>
        <p className="type-body-lg text-pretty text-muted-foreground">{t(`${result}.body`)}</p>
      </div>
      <Notice tone="muted" icon={LockIcon}>
        {t("noSession")}
      </Notice>
      <div className="flex flex-wrap items-center gap-4">
        {result === "error" ? (
          <Button size="xl" onClick={onRetry}>
            {t("retry")}
          </Button>
        ) : (
          <Button asChild variant="quiet" size="xl">
            <Link href={routeHref("web.root")}>{t("home")}</Link>
          </Button>
        )}
        <span className="type-body-sm text-faint-foreground">
          {t.rich("useThisDevice", {
            link: (chunks) => (
              <Link href={routeHref("web.login")} className={textLinkClass}>
                {chunks}
              </Link>
            ),
          })}
        </span>
      </div>
    </div>
  );
}
