"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { useAccountProfile } from "@/entities/account-profile";
import { useCoachProfile, useCoachProfileActions } from "@/entities/coach-profile";
import {
  CompleteStep,
  decideStep,
  nameSuggestion,
  ProfileStep,
  resumeStep,
  StepNav,
  TypeStep,
  type FormStep,
  type Step,
  type StepSaver,
} from "@/features/coach-onboarding";
import { chooseEntryContext } from "@/features/session-gate";
import { useRouter } from "@/shared/i18n/navigation";
import { continuationOf, continuationQuery, withContinuation } from "@/shared/routes/continuation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Container } from "@/shared/ui/container";
import { Notice } from "@/shared/ui/notice";
import {
  OnboardingFrame,
  OnboardingGrid,
  onboardingActionClass,
} from "@/shared/ui/onboarding-frame";
import { Spinner } from "@/shared/ui/spinner";

/*
 * Coach web registration (`web.app.onboarding.coach`, SF-52; Claude Design
 * COACH 5d, 1791896379-65b7): WCR1 Coach profile → WCR2 Coaching type →
 * WCR7 Complete. The frame is the artboards' own (a 72 px header with the
 * brand, the "Coach sign-up" badge and Save & exit; the 250 px step card,
 * the form and the 320 px preview), full-bleed with the site Container's
 * gutters.
 *
 * Everything that decides comes from the backend: the CoachProfile (SF-50)
 * for the fields, the resume step and completion; the entry resolver (SF-51,
 * through `/app`) for where a completed Coach goes. `?step=` only selects a
 * screen the backend state allows; `intent` / `returnTo` ride along. The
 * account (SF-44) is read only for the coach-name suggestion of a new
 * profile, and never written.
 */
export function CoachOnboarding() {
  const t = useTranslations("coachOnboarding");
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("step");
  const continuation = continuationOf(searchParams);
  const query = useCoachProfile();
  const { save, complete } = useCoachProfileActions();
  const [justCompleted, setJustCompleted] = useState(false);
  const saver = useRef<StepSaver | undefined>(undefined);
  const registerSaver = useCallback((next: StepSaver) => {
    saver.current = next;
  }, []);

  const decision = query.data ? decideStep(query.data, requested, justCompleted) : undefined;
  const step = decision?.kind === "step" ? decision.step : undefined;

  // The account's full name, only while it could still be suggested.
  const suggestible =
    query.data?.onboarding.status === "not_started" && query.data.display_name === null;
  const account = useAccountProfile({ enabled: suggestible });
  const awaitingAccount = suggestible && step === "profile" && account.isPending;

  const search = searchParams.toString();
  const hrefFor = useCallback(
    (next: Step) =>
      routeHref(
        "web.app.onboarding.coach",
        {},
        { step: next, ...continuationQuery(continuationOf(search)) },
      ),
    [search],
  );
  // The entry, asked for the Coach journey: a completed Coach resolves to Coach home.
  const coachEntry = useCallback(
    () =>
      routeHref("web.app", {}, continuationQuery({ ...continuationOf(search), intent: "coach" })),
    [search],
  );

  // A completed Coach leaves through the application entry; any other state
  // shows the step the backend allows, with the URL saying so.
  useEffect(() => {
    if (decision?.kind === "exit") router.replace(coachEntry());
    else if (step !== undefined && step !== requested) router.replace(hrefFor(step));
  }, [decision?.kind, step, requested, router, hrefFor, coachEntry]);

  // After a step change, focus the new step's heading (not on the first load).
  const shown = useRef<Step | undefined>(undefined);
  useEffect(() => {
    if (step === undefined) return;
    if (shown.current !== undefined && shown.current !== step) {
      document.querySelector<HTMLElement>("#main h1")?.focus();
    }
    shown.current = step;
  }, [step]);

  // Completion asked for here: WCR7 must show the moment the completed profile
  // lands in the cache, never the "already completed" exit.
  const completeHere = async () => {
    setJustCompleted(true);
    try {
      return await complete();
    } catch (error) {
      setJustCompleted(false);
      throw error;
    }
  };

  const go = (next: FormStep) => router.push(hrefFor(next));
  const saveAndExit = async () => {
    if ((await saver.current?.()) ?? true) router.push(routeHref("web.root"));
  };

  // WCR7's Continue: an explicit choice of the (completed) Coach context, then
  // the entry resolver decides; Coach home is whatever it maps today.
  const openCoachHome = async () => {
    await chooseEntryContext("coach");
    router.push(coachEntry());
  };

  let body: ReactNode;
  if (query.isError) {
    body = (
      <Container className="py-12">
        <Notice
          tone="amber"
          icon={TriangleAlertIcon}
          className="max-w-140"
          action={
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="type-caption font-extrabold underline"
            >
              {t("loadFailure.retry")}
            </button>
          }
        >
          <span role="alert" className="flex flex-col gap-0.5">
            <b>{t("loadFailure.title")}</b>
            <span>{t("loadFailure.body")}</span>
          </span>
        </Notice>
      </Container>
    );
  } else if (query.data === undefined || step === undefined || awaitingAccount) {
    body = (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner label={t("loading")} className="size-6 text-muted-foreground" />
      </div>
    );
  } else if (step === "complete") {
    body = (
      <Container className="py-12">
        <CompleteStep profile={query.data} onOpen={openCoachHome} />
      </Container>
    );
  } else {
    const profile = query.data;
    const profileDone = resumeStep(profile) === "type";
    const navigate = async (next: FormStep) => {
      if (next === step) return;
      if ((await saver.current?.()) ?? true) go(next);
    };
    body = (
      <OnboardingGrid>
        <StepNav
          current={step}
          profileDone={profileDone}
          onNavigate={(next) => void navigate(next)}
        />
        {step === "profile" ? (
          <ProfileStep
            key="profile"
            profile={profile}
            suggestion={nameSuggestion(profile, account.data?.full_name)}
            save={save}
            onDone={go}
            registerSaver={registerSaver}
          />
        ) : (
          <TypeStep
            key="type"
            profile={profile}
            save={save}
            complete={completeHere}
            onBack={go}
            onCompleted={() => router.push(hrefFor("complete"))}
            accountHref={withContinuation("web.app.onboarding.account", {
              ...continuation,
              intent: continuation.intent ?? "coach",
            })}
            registerSaver={registerSaver}
          />
        )}
      </OnboardingGrid>
    );
  }

  return (
    <OnboardingFrame
      data-coach-onboarding
      badge={step === "complete" ? t("frame.doneBadge") : t("frame.badge")}
      actions={
        step !== "complete" && (
          <Button
            variant="ghost"
            className={onboardingActionClass}
            onClick={() => void saveAndExit()}
          >
            {t("frame.saveExit")}
          </Button>
        )
      }
    >
      {body}
    </OnboardingFrame>
  );
}
