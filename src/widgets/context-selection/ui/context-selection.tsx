"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { useCoachProfile } from "@/entities/coach-profile";
import { useFighterProfile } from "@/entities/fighter-profile";
import { signOut } from "@/entities/session";
import {
  contextOptions,
  entryHref,
  isKnownEntry,
  useContextSwitch,
  useEntry,
  type KnownEntry,
  type ProfileContext,
} from "@/features/session-gate";
import { useRouter } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { OnboardingFrame, onboardingActionClass } from "@/shared/ui/onboarding-frame";
import { Spinner } from "@/shared/ui/spinner";
import { FailureView, LaunchScreen } from "@/widgets/system-states";

/*
 * WCX1 Choose where to continue (`web.app.context`, SF-54; Claude Design
 * 1791982482-71e3 WebContextSelect, 1440 × 900), where the entry resolver's
 * `context_selection` lands (SF-51):
 *
 * - completed contexts (Fighter and Coach both reported as capabilities, no
 *   remembered choice): opening one records the choice with the backend and
 *   resolves the entry again, which leads to that context's home;
 * - unfinished journeys (both profiles in progress, E11): continuing one asks
 *   the entry with its intent and goes to its onboarding; nothing is recorded.
 *
 * Every option comes from the entry; nothing is stored in the browser. The
 * page shows only while the entry answers `context_selection`: any other
 * answer (a choice made in another tab, a completed profile) continues there.
 */
export function ContextSelection() {
  const router = useRouter();
  const query = useEntry({});
  const entry = query.data !== undefined && isKnownEntry(query.data) ? query.data : undefined;
  const elsewhere =
    entry !== undefined && entry.destination !== "context_selection" ? entryHref(entry) : undefined;

  useEffect(() => {
    if (elsewhere !== undefined) router.replace(elsewhere);
  }, [elsewhere, router]);

  const unknown = query.data !== undefined && entry === undefined;
  if (query.isError || unknown) {
    return (
      <FailureView
        error={query.error ?? new Error("Unknown entry destination")}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (entry === undefined || elsewhere !== undefined) return <LaunchScreen />;
  return <ContextChooser entry={entry} />;
}

export function ContextChooser({ entry }: { entry: KnownEntry }) {
  const t = useTranslations("contextSelection");
  const contexts = useTranslations("contextSwitcher");
  const { completed, journeys } = contextOptions(entry);
  const { state, open, continueJourney } = useContextSwitch();
  const names = useProfileNames(completed);
  const pending = state.status === "pending";
  const scenario = completed.length > 1 ? "completed" : "setup";

  const rows = [
    ...completed.map((context) => ({
      context,
      title: contexts(`contexts.${context}`),
      line: [names[context], contexts(`homes.${context}`)].filter(Boolean).join(" · "),
      action: t("open"),
      run: () => void open(context),
      avatar: "context" as const,
    })),
    ...journeys
      .filter((journey) => scenario === "setup" || journey.started)
      .map((journey) => {
        const kind = journey.started ? "continue" : "start";
        return {
          context: journey.context,
          title: contexts(`${kind}.${journey.context}`),
          line: contexts(`${kind}Lines.${journey.context}`),
          action: t("continue"),
          run: () => void continueJourney(journey.context),
          avatar: "journey" as const,
        };
      }),
  ];

  return (
    <OnboardingFrame
      data-context-selection
      badge={null}
      actions={
        <Button variant="ghost" className={onboardingActionClass} onClick={() => void signOut()}>
          {t("signOut")}
        </Button>
      }
    >
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-140 flex-col gap-4">
          <p className="type-label text-faint-foreground">{t(`${scenario}.eyebrow`)}</p>
          <h1 className="type-h2 font-display">{t(`${scenario}.title`)}</h1>
          <p className="type-body text-muted-foreground">{t(`${scenario}.lead`)}</p>
          <ul className="mt-1.5 flex flex-col gap-2.5">
            {rows.map((row) => {
              const opening = pending && state.context === row.context;
              return (
                <li key={`${row.avatar}-${row.context}`}>
                  <button
                    type="button"
                    disabled={pending}
                    aria-busy={opening}
                    onClick={row.run}
                    className={cn(
                      "flex w-full items-center gap-3.5 rounded-2xl border bg-surface px-4.5 py-4 text-left transition-colors",
                      "hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      "disabled:cursor-default",
                      pending && !opening && "opacity-50",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-11 flex-none items-center justify-center rounded-md type-caption font-display font-bold",
                        row.avatar === "journey"
                          ? "bg-accent text-highlight"
                          : row.context === "coach"
                            ? "bg-warning text-warning-foreground"
                            : "bg-highlight text-highlight-foreground",
                      )}
                    >
                      {contexts(`initials.${row.context}`)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="type-body-lg font-extrabold">{row.title}</span>
                      <span className="type-body-sm text-muted-foreground">{row.line}</span>
                    </span>
                    <span className="flex flex-none items-center gap-2 type-body-sm font-extrabold text-highlight">
                      {opening ? <Spinner /> : null}
                      {opening ? contexts("opening") : row.action}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {state.status === "failed" && (
            <Notice tone="amber" role="alert">
              <span className="flex flex-col gap-0.5">
                <span className="font-extrabold">{t("failed.title")}</span>
                <span>{t("failed.body")}</span>
              </span>
            </Notice>
          )}
          <p className="type-caption text-faint-foreground">{t(`${scenario}.note`)}</p>
        </div>
      </div>
    </OnboardingFrame>
  );
}

function useProfileNames(completed: readonly ProfileContext[]) {
  const fighter = useFighterProfile({ enabled: completed.includes("fighter") });
  const coach = useCoachProfile({ enabled: completed.includes("coach") });
  return {
    fighter: fighter.data?.display_name ?? undefined,
    coach: coach.data?.display_name ?? undefined,
  } satisfies Record<ProfileContext, string | undefined>;
}
