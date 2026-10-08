"use client";

import {
  HandFistIcon,
  HouseIcon,
  InfoIcon,
  StarIcon,
  UserCheckIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { signOut } from "@/entities/session";
import { useEntryChoice } from "@/features/session-gate";
import type { EntryIntent } from "@/shared/routes/continuation";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import {
  OnboardingFrame,
  OnboardingGrid,
  OnboardingStepCard,
  onboardingActionClass,
} from "@/shared/ui/onboarding-frame";

/*
 * WA6 Choose where to start (`web.app.onboarding.role`, SF-47; Claude Design
 * V78 WebRoleSelect, 1440 × 980): the account setup frame, the three-step
 * card (Account basics done), the four journeys as one choice, and Continue.
 *
 * A journey is navigation only. Continue asks the entry resolver (SF-45)
 * again with the chosen intent and goes where it answers; nothing is stored
 * (a reload asks again), and no role, profile, capability or workspace is
 * created or implied. The onboarding gate shows this page only when the
 * resolver answers `role_selection`.
 */

const JOURNEYS = [
  { intent: "fighter", icon: HandFistIcon },
  { intent: "coach", icon: UserCheckIcon },
  { intent: "gym", icon: HouseIcon },
  { intent: "sponsor", icon: StarIcon },
] as const satisfies readonly { intent: EntryIntent; icon: LucideIcon }[];

export function RoleSelection() {
  const t = useTranslations("roleSelection");
  const setup = useTranslations("accountRegistration");
  const { state, choose } = useEntryChoice();
  const [picked, setPicked] = useState<EntryIntent>();
  const hintId = useId();
  const busy = state.status === "resolving";
  const failed = state.status === "failed" ? state : undefined;

  const submit = () => {
    if (picked !== undefined) void choose(picked);
  };

  return (
    <OnboardingFrame
      data-role-selection
      badge={setup("frame.badge")}
      badgeVariant="neutral"
      actions={
        <Button variant="ghost" className={onboardingActionClass} onClick={() => void signOut()}>
          {setup("frame.signOut")}
        </Button>
      }
    >
      <OnboardingGrid>
        <OnboardingStepCard
          label={setup("nav.label")}
          title={setup("nav.title")}
          note={setup("nav.note")}
          footnote={setup("nav.footnote")}
          steps={[
            {
              key: "basics",
              label: setup("nav.steps.basics"),
              state: "done",
              hint: t("stepDone"),
            },
            { key: "start", label: setup("nav.steps.start"), state: "current" },
            {
              key: "setup",
              label: setup("nav.steps.setup"),
              state: "later",
              hint: setup("nav.later"),
            },
          ]}
        />
        <div className="flex min-w-0 flex-col gap-5.5">
          <hgroup className="flex flex-col gap-2">
            <p className="type-label text-highlight">{t("eyebrow")}</p>
            <h1 tabIndex={-1} className="type-onboarding-title outline-none">
              {t("title")}
            </h1>
            <p className="type-body-lg text-pretty text-muted-foreground">{t("lead")}</p>
          </hgroup>
          {/* Empty, the live region stays out of the flow; a failure shows in place. */}
          <div
            role="status"
            aria-live="polite"
            data-choice-notice={failed?.reason}
            className={failed === undefined ? "sr-only" : undefined}
          >
            {failed !== undefined && (
              <Notice
                tone="amber"
                action={
                  <button
                    type="button"
                    onClick={() => void choose(failed.intent)}
                    className="rounded-xs type-caption font-extrabold underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t("failure.retry")}
                  </button>
                }
              >
                <span className="flex flex-col gap-0.5">
                  <b>{t("failure.title")}</b>
                  <span>
                    {failed.reason === "unexpected" ? t("failure.unexpected") : t("failure.body")}
                  </span>
                </span>
              </Notice>
            )}
          </div>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="flex min-w-0 flex-col gap-5.5"
          >
            <fieldset
              data-journeys
              aria-busy={busy || undefined}
              className="grid min-w-0 gap-3.5 sm:grid-cols-2"
            >
              <legend className="sr-only">{t("groupLabel")}</legend>
              {JOURNEYS.map(({ intent, icon: Icon }) => (
                <label
                  key={intent}
                  data-journey={intent}
                  className="group flex min-h-42 min-w-0 cursor-pointer flex-col gap-2.5 rounded-2xl border bg-surface p-4.5 transition-colors hover:border-border-strong has-checked:border-[1.5px] has-checked:border-highlight has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring has-disabled:cursor-default"
                >
                  <input
                    type="radio"
                    name="journey"
                    value={intent}
                    checked={picked === intent}
                    onChange={() => setPicked(intent)}
                    disabled={busy}
                    aria-describedby={`journey-${intent}-body journey-${intent}-note`}
                    className="sr-only"
                  />
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex size-10.5 flex-none items-center justify-center rounded-md-lg bg-muted text-highlight group-has-checked:bg-highlight group-has-checked:text-highlight-foreground"
                    >
                      <Icon className="size-5" strokeWidth={2} />
                    </span>
                    <span className="type-metric-sm font-semibold">
                      {t(`journeys.${intent}.title`)}
                    </span>
                    <span
                      aria-hidden
                      className="ml-auto flex size-5 flex-none items-center justify-center rounded-full border-2 border-border-strong group-has-checked:border-highlight"
                    >
                      <span className="size-2.5 rounded-full bg-highlight opacity-0 group-has-checked:opacity-100" />
                    </span>
                  </span>
                  <span
                    id={`journey-${intent}-body`}
                    className="type-body-sm text-muted-foreground"
                  >
                    {t(`journeys.${intent}.body`)}
                  </span>
                  <span
                    id={`journey-${intent}-note`}
                    className="mt-auto type-label-tight text-faint-foreground group-has-checked:text-highlight"
                  >
                    {t(`journeys.${intent}.note`)}
                  </span>
                </label>
              ))}
            </fieldset>
            {picked === undefined && (
              <p id={hintId} className="type-caption text-faint-foreground">
                {t("hint")}
              </p>
            )}
            <div className="mt-1 flex items-center gap-2.5 border-t border-border-subtle pt-2.5">
              <span className="flex-1" />
              <Button
                type="submit"
                size="lg"
                className="min-w-30"
                disabled={picked === undefined}
                loading={busy}
                aria-describedby={picked === undefined ? hintId : undefined}
              >
                {busy
                  ? t("opening")
                  : picked === undefined
                    ? t("continue")
                    : t(`journeys.${picked}.cta`)}
              </Button>
            </div>
          </form>
        </div>
        <aside className="flex min-w-0 flex-col gap-3.5">
          <section
            aria-labelledby="role-account"
            className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-4.5"
          >
            <h2 id="role-account" className="type-label text-faint-foreground">
              {t("account.title")}
            </h2>
            <p className="type-body-sm">{t("account.body")}</p>
            <ul className="flex flex-wrap items-center gap-1.5">
              {JOURNEYS.map(({ intent }) => (
                <li key={intent}>
                  <Badge variant="neutral">{t(`account.roles.${intent}`)}</Badge>
                </li>
              ))}
            </ul>
          </section>
          <Notice tone="muted" icon={InfoIcon}>
            {t("notSaved")}
          </Notice>
        </aside>
      </OnboardingGrid>
    </OnboardingFrame>
  );
}
