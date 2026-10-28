"use client";

import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";

import { useCoachProfile } from "@/entities/coach-profile";
import { useFighterProfile } from "@/entities/fighter-profile";
import { signOut } from "@/entities/session";
import {
  contextOptions,
  entryHref,
  gymTarget,
  gymWorkspaceOptions,
  initialsOf,
  isKnownEntry,
  useContextSwitch,
  useEntry,
  type KnownEntry,
  type ProfileContext,
  type SwitchTarget,
} from "@/features/session-gate";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { ChoiceAvatar, ChoiceRow } from "@/shared/ui/choice-row";
import { Notice } from "@/shared/ui/notice";
import { OnboardingFrame, onboardingActionClass } from "@/shared/ui/onboarding-frame";
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
 *   the entry with its intent and goes to its onboarding; nothing is recorded;
 * - gym workspaces (SF-84 / SF-88), when completed contexts include gyms:
 *   a completed gym opens its console (the choice recorded), the user's own
 *   draft continues its setup.
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
  const roles = useTranslations("gymConsole.switcher.roles");
  const { completed, journeys } = contextOptions(entry);
  const gyms = gymWorkspaceOptions(entry);
  const switching = useContextSwitch();
  const { state } = switching;
  const names = useProfileNames(completed);
  const pending = state.status === "pending";
  const scenario = completed.length + gyms.enter.length > 1 ? "completed" : "setup";
  const mixed = gyms.enter.length + gyms.setup.length > 0;

  const rows: {
    target: SwitchTarget;
    title: string;
    line: string;
    action: string;
    run: () => void;
    avatar: ReactNode;
  }[] = [
    ...completed.map((context) => ({
      target: context,
      title: contexts(`contexts.${context}`),
      line: [names[context], contexts(`homes.${context}`)].filter(Boolean).join(" · "),
      action: t("open"),
      run: () => void switching.open(context),
      avatar: <ChoiceAvatar tone={context}>{contexts(`initials.${context}`)}</ChoiceAvatar>,
    })),
    ...gyms.enter.map((gym) => ({
      target: gymTarget(gym.gym_id),
      title: gym.name,
      line: t("gymLine", { role: roles(gym.role) }),
      action: t("open"),
      run: () => void switching.openGym(gym.gym_id),
      avatar: <ChoiceAvatar tone="gym">{initialsOf(gym.name)}</ChoiceAvatar>,
    })),
    ...journeys
      .filter((journey) => scenario === "setup" || journey.started)
      .map((journey) => {
        const kind = journey.started ? "continue" : "start";
        return {
          target: journey.context,
          title: contexts(`${kind}.${journey.context}`),
          line: contexts(`${kind}Lines.${journey.context}`),
          action: t("continue"),
          run: () => void switching.continueJourney(journey.context),
          avatar: (
            <ChoiceAvatar tone="journey">{contexts(`initials.${journey.context}`)}</ChoiceAvatar>
          ),
        };
      }),
    ...gyms.setup.map((gym) => ({
      target: "gym-setup" as const,
      title: t("gymSetup"),
      line: gym.name,
      action: t("continue"),
      run: () => void switching.continueGymSetup(),
      avatar: <ChoiceAvatar tone="journey">{initialsOf(gym.name)}</ChoiceAvatar>,
    })),
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
          <p className="type-body text-muted-foreground">
            {mixed ? t(`${scenario}.leadMixed`) : t(`${scenario}.lead`)}
          </p>
          <ul className="mt-1.5 flex flex-col gap-2.5">
            {rows.map((row) => (
              <li key={row.target === "gym-setup" ? `setup-${row.line}` : row.target}>
                <ChoiceRow
                  avatar={row.avatar}
                  title={row.title}
                  line={row.line}
                  action={row.action}
                  pending={pending}
                  opening={pending && state.target === row.target}
                  openingLabel={contexts("opening")}
                  onClick={row.run}
                />
              </li>
            ))}
          </ul>
          {gyms.more && (
            <Link href={routeHref("web.app.gyms")} className="w-fit type-body-sm font-extrabold">
              {t("allGyms", { count: entry.gym_workspace_count })}
            </Link>
          )}
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
