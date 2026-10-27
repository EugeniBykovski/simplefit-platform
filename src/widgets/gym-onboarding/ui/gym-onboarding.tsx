"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useGymDraft, useGymSetup, useGymSetupActions, type GymSetup } from "@/entities/gym-setup";
import {
  BrandingStep,
  CreatedStep,
  decideStep,
  GymSetupFrame,
  LocationStep,
  outcomeOf,
  SetupSidebar,
  TypeStep,
  type CreateKey,
  type FormStep,
  type RailStepState,
  type Step,
  type StepSaver,
} from "@/features/gym-onboarding";
import { chooseEntryContext } from "@/features/session-gate";
import { useRouter } from "@/shared/i18n/navigation";
import { continuationOf, continuationQuery, withContinuation } from "@/shared/routes/continuation";
import { routeHref } from "@/shared/routes/routes";
import { Container } from "@/shared/ui/container";
import { Notice } from "@/shared/ui/notice";
import { Spinner } from "@/shared/ui/spinner";

/*
 * Gym owner web registration (`web.app.onboarding.gym`, SF-86; Claude Design
 * GYM 5e with the approved SF-86 differences, docs/gym-onboarding-web.md):
 * OG1 Gym name & type → OG2 Location → OG3 Branding → OG6b Gym created, in
 * the GymSetupSteps frame.
 *
 * Everything that decides comes from the backend: the viewer's open draft
 * (SF-83 `GET /me/gyms`), its setup (SF-85) for the fields, the resume step
 * and completion, and the entry resolver (SF-84, through `/app`) for where a
 * completed gym goes. `?step=` only selects a screen the backend state
 * allows; `intent` / `returnTo` ride along. The browser stores no business
 * state: the only client-held value is the create key of the attempt in
 * progress, kept in memory so a retry repeats it.
 */
export function GymOnboarding() {
  const t = useTranslations("gymOnboarding");
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("step");
  const continuation = continuationOf(searchParams);
  const draft = useGymDraft();
  const gymId = draft.data?.draftId ?? null;
  const setupQuery = useGymSetup(gymId);
  const { create, save, setLocation, complete, reload } = useGymSetupActions();
  const [justCompleted, setJustCompleted] = useState(false);
  const createKey = useCreateKey();
  const saver = useRef<StepSaver | undefined>(undefined);
  const registerSaver = useCallback((next: StepSaver) => {
    saver.current = next;
  }, []);

  const ready = draft.isSuccess && (gymId === null || setupQuery.isSuccess);
  const setup: GymSetup | null = gymId === null ? null : (setupQuery.data ?? null);
  const decision = ready ? decideStep(setup, requested, justCompleted) : undefined;
  const step = decision?.kind === "step" ? decision.step : undefined;

  const search = searchParams.toString();
  const hrefFor = useCallback(
    (next: Step) =>
      routeHref(
        "web.app.onboarding.gym",
        {},
        { step: next, ...continuationQuery(continuationOf(search)) },
      ),
    [search],
  );
  // The entry, asked for the Gym journey: a completed gym resolves to its home.
  const gymEntry = useCallback(
    () => routeHref("web.app", {}, continuationQuery({ ...continuationOf(search), intent: "gym" })),
    [search],
  );

  // A completed gym (not just completed here) leaves through the application
  // entry; any other state shows the step the backend allows, with the URL
  // saying so.
  useEffect(() => {
    if (decision?.kind === "exit") router.replace(gymEntry());
    else if (step !== undefined && step !== requested) router.replace(hrefFor(step));
  }, [decision?.kind, step, requested, router, hrefFor, gymEntry]);

  // After a step change, focus the new step's heading (not on the first load).
  const shown = useRef<Step | undefined>(undefined);
  useEffect(() => {
    if (step === undefined) return;
    if (shown.current !== undefined && shown.current !== step) {
      document.querySelector<HTMLElement>("#main h1")?.focus();
    }
    shown.current = step;
  }, [step]);

  // Completion asked for here: OG6b must show the moment the completed setup
  // lands in the cache, never the "already completed" exit.
  const completeHere = async (current: GymSetup) => {
    setJustCompleted(true);
    try {
      return await complete(current);
    } catch (error) {
      setJustCompleted(false);
      throw error;
    }
  };

  const go = (next: Step) => router.push(hrefFor(next));
  const saveAndExit = async () => {
    if ((await saver.current?.()) ?? true) router.push(routeHref("web.root"));
  };
  const navigate = async (next: FormStep) => {
    if (next === step) return;
    if ((await saver.current?.()) ?? true) go(next);
  };

  // OG6b's Go to gym: an explicit choice of the completed gym, then the
  // entry resolver decides; the gym's home is whatever it maps today.
  const openGym = async () => {
    if (setup === null) return;
    await chooseEntryContext("gym", setup.gym_id);
    router.push(gymEntry());
  };

  const accountHref = withContinuation("web.app.onboarding.account", {
    ...continuation,
    intent: continuation.intent ?? "gym",
  });
  const reloadSetup = useMemo(
    () => (setup === null ? undefined : () => reload(setup.gym_id)),
    [setup, reload],
  );

  // A gym that vanished under a step: look for the draft again (none → OG1).
  const restart = () => {
    setJustCompleted(false);
    void draft.refetch();
  };

  const setupGone = setupQuery.isError && outcomeOf(setupQuery.error).kind === "gone";

  if (draft.isError || (setupQuery.isError && !setupGone)) {
    return (
      <Problem
        title={t("loadFailure.title")}
        body={t("loadFailure.body")}
        action={t("loadFailure.retry")}
        onAction={() => void (draft.isError ? draft.refetch() : setupQuery.refetch())}
      />
    );
  }
  if (setupGone) {
    return (
      <Problem
        title={t("gone.title")}
        body={t("gone.body")}
        action={t("gone.restart")}
        onAction={() => void draft.refetch()}
      />
    );
  }
  if (!ready || step === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <Spinner label={t("loading")} className="size-6 text-muted-foreground" />
      </div>
    );
  }

  const states: Record<FormStep, RailStepState> =
    setup === null
      ? { type: "todo", location: "locked", branding: "locked" }
      : {
          type: "done",
          location: setup.primary_location === null ? "todo" : "done",
          branding: setup.setup_status === "completed" ? "done" : "todo",
        };

  let body: ReactNode;
  if (step === "complete" && setup !== null) {
    body = <CreatedStep setup={setup} onOpen={openGym} />;
  } else if (step === "location" && setup !== null) {
    body = (
      <LocationStep
        key={`location-${setup.gym_id}`}
        setup={setup}
        setLocation={setLocation}
        reload={() => reload(setup.gym_id)}
        accountHref={accountHref}
        onDone={go}
        onSaveExit={() => void saveAndExit()}
        registerSaver={registerSaver}
        onRestart={restart}
      />
    );
  } else if (step === "branding" && setup !== null) {
    body = (
      <BrandingStep
        key={`branding-${setup.gym_id}`}
        setup={setup}
        save={save}
        reload={() => reload(setup.gym_id)}
        complete={completeHere}
        accountHref={accountHref}
        onNavigate={go}
        onCompleted={() => router.push(hrefFor("complete"))}
        onSaveExit={() => void saveAndExit()}
        registerSaver={registerSaver}
        onRestart={restart}
      />
    );
  } else {
    body = (
      <TypeStep
        key="type"
        setup={setup}
        create={create}
        save={save}
        reload={reloadSetup}
        createKey={createKey}
        existingGyms={draft.data?.completed ?? 0}
        gymHref={gymEntry()}
        accountHref={accountHref}
        onDone={go}
        onSaveExit={() => void saveAndExit()}
        registerSaver={registerSaver}
        onRestart={restart}
      />
    );
  }

  return (
    <GymSetupFrame
      data-gym-onboarding
      data-step={step}
      sidebar={
        <SetupSidebar
          gymName={setup?.name ?? null}
          current={step}
          states={states}
          onSelect={(next) => void navigate(next)}
        />
      }
    >
      {body}
    </GymSetupFrame>
  );
}

/**
 * The create key of the attempt in progress: one UUID, repeated by every
 * retry of the same attempt (so a lost response never creates a second gym),
 * renewed only after the API reported it spent (`discarded` / `reused`).
 * In memory only: a reload starts a new attempt, which the API resolves to
 * the open draft if the earlier one landed.
 */
function useCreateKey(): CreateKey {
  const key = useRef<string | undefined>(undefined);
  return useMemo(
    () => ({
      current: () => (key.current ??= crypto.randomUUID()),
      renew: () => {
        key.current = undefined;
      },
    }),
    [],
  );
}

function Problem({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Container className="py-12">
          <Notice
            tone="amber"
            icon={TriangleAlertIcon}
            className="max-w-140"
            action={
              <button
                type="button"
                onClick={onAction}
                className="rounded-xs type-caption font-extrabold underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {action}
              </button>
            }
          >
            <span role="alert" className="flex flex-col gap-0.5">
              <b>{title}</b>
              <span>{body}</span>
            </span>
          </Notice>
        </Container>
      </main>
    </div>
  );
}
