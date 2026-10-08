"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { useFighterProfile, useFighterProfileActions } from "@/entities/fighter-profile";
import {
  BasicsStep,
  CompleteStep,
  decideStep,
  ProfileStep,
  resumeStep,
  StepNav,
  type FormStep,
  type Step,
  type StepSaver,
} from "@/features/fighter-onboarding";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { continuationOf, continuationQuery, withContinuation } from "@/shared/routes/continuation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { BrandTile, BrandWordmark } from "@/shared/ui/brand-mark";
import { Button } from "@/shared/ui/button";
import { Container } from "@/shared/ui/container";
import { Notice } from "@/shared/ui/notice";
import { Spinner } from "@/shared/ui/spinner";
import { TriangleAlertIcon } from "lucide-react";

/*
 * Fighter web registration (`web.app.onboarding.fighter`, SF-38; Claude Design
 * FIGHTER 5c, V78): WF0 Profile basics → WF1 Boxing profile → WF6 Complete.
 * The frame is the artboards' own (a 72 px header with the brand, the
 * "Fighter sign-up" badge and Save & exit; the 250 px step card, the form and
 * the 320 px preview), full-bleed with the site Container's gutters.
 *
 * Everything that decides comes from the backend: the profile (SF-25) for
 * the fields, the resume step and completion, the entry resolver (SF-45,
 * through `/app`) for where a completed Fighter goes. `?step=` only selects a
 * screen the backend state allows; `intent` / `returnTo` ride along.
 */
export function FighterOnboarding() {
  const t = useTranslations("fighterOnboarding");
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("step");
  const continuation = continuationOf(searchParams);
  const query = useFighterProfile();
  const { save, complete } = useFighterProfileActions();
  const [justCompleted, setJustCompleted] = useState(false);
  const saver = useRef<StepSaver | undefined>(undefined);
  const registerSaver = useCallback((next: StepSaver) => {
    saver.current = next;
  }, []);

  const decision = query.data ? decideStep(query.data, requested, justCompleted) : undefined;
  const step = decision?.kind === "step" ? decision.step : undefined;

  const search = searchParams.toString();
  const hrefFor = useCallback(
    (next: Step) =>
      routeHref(
        "web.app.onboarding.fighter",
        {},
        { step: next, ...continuationQuery(continuationOf(search)) },
      ),
    [search],
  );

  // A completed Fighter leaves through the application entry; any other state
  // shows the step the backend allows, with the URL saying so.
  useEffect(() => {
    if (decision?.kind === "exit") router.replace(routeHref("web.app"));
    else if (step !== undefined && step !== requested) router.replace(hrefFor(step));
  }, [decision?.kind, step, requested, router, hrefFor]);

  // After a step change, focus the new step's heading (not on the first load).
  const shown = useRef<Step | undefined>(undefined);
  useEffect(() => {
    if (step === undefined) return;
    if (shown.current !== undefined && shown.current !== step) {
      document.querySelector<HTMLElement>("#main h1")?.focus();
    }
    shown.current = step;
  }, [step]);

  const go = (next: FormStep) => router.push(hrefFor(next));
  const saveAndExit = async () => {
    if ((await saver.current?.()) ?? true) router.push(routeHref("web.root"));
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
  } else if (query.data === undefined || step === undefined) {
    body = (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner label={t("loading")} className="size-6 text-muted-foreground" />
      </div>
    );
  } else if (step === "complete") {
    body = (
      // WF6's 96 px top padding: the Container's 48 plus 48.
      <Container className="py-12">
        <div className="flex w-full justify-center pt-12">
          <CompleteStep profile={query.data} />
        </div>
      </Container>
    );
  } else {
    const profile = query.data;
    const basicsDone = resumeStep(profile) === "profile";
    const navigate = async (next: FormStep) => {
      if (next === step) return;
      if ((await saver.current?.()) ?? true) go(next);
    };
    body = (
      <Container className="py-12">
        <div
          data-onboarding-grid
          className="grid items-start gap-10 desktop:grid-cols-[250px_minmax(0,1fr)_320px]"
        >
          <StepNav
            current={step}
            basicsDone={basicsDone}
            onNavigate={(next) => void navigate(next)}
          />
          {step === "basics" ? (
            <BasicsStep
              key="basics"
              profile={profile}
              save={save}
              onDone={go}
              registerSaver={registerSaver}
            />
          ) : (
            <ProfileStep
              key="profile"
              profile={profile}
              save={save}
              complete={complete}
              onBack={go}
              onCompleted={() => {
                setJustCompleted(true);
                router.push(hrefFor("complete"));
              }}
              accountHref={withContinuation("web.app.onboarding.account", {
                ...continuation,
                intent: continuation.intent ?? "fighter",
              })}
              registerSaver={registerSaver}
            />
          )}
        </div>
      </Container>
    );
  }

  return (
    <div data-fighter-onboarding className="flex min-h-dvh w-full flex-col bg-background">
      <header className="h-18 flex-none border-b border-border-subtle">
        <Container
          size="frame"
          className="flex h-full items-center gap-4 px-4 sm:px-6 md:px-8 desktop:px-14"
        >
          <Link href={routeHref("web.root")} className="flex w-fit items-center gap-2.5 rounded-md">
            <BrandTile size="sm" />
            <BrandWordmark size="sm" />
          </Link>
          <span className="flex-1" />
          <div className="flex items-center gap-4">
            <Badge variant="accent">
              {step === "complete" ? t("frame.doneBadge") : t("frame.badge")}
            </Badge>
            {step !== "complete" && (
              <Button
                variant="ghost"
                className="h-auto px-0 type-body-sm font-extrabold text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={() => void saveAndExit()}
              >
                {t("frame.saveExit")}
              </Button>
            )}
          </div>
        </Container>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {body}
      </main>
    </div>
  );
}
