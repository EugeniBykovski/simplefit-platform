"use client";

import { CheckIcon, InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import type { CoachProfile } from "@/entities/coach-profile";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";

import { profileFrom, typeFrom } from "../model/form-values";
import { CompletedCoachCard } from "./coach-preview";

const actionClass =
  "rounded-xs type-caption font-extrabold underline outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * WCR7 "Your coach profile is ready" (Coach sign-up · complete): shown only
 * once the API has recorded completion (`status: completed`). It claims
 * nothing else: Coach Home is not built yet, so the page says so instead of
 * promising a workspace. Continue goes on only through the backend: `onOpen`
 * records the explicit Coach context choice (SF-51) and resolves the entry;
 * a failure keeps the visitor here with Try again.
 */
export function CompleteStep({
  profile,
  onOpen,
}: {
  profile: CoachProfile;
  /** Resolves once the browser is on its way; rejects when it could not continue. */
  onOpen: () => Promise<void>;
}) {
  const t = useTranslations("coachOnboarding.done");
  const heading = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<"ready" | "opening" | "failure">("ready");

  // The step changed under the visitor's focus: move it to the new heading.
  useEffect(() => heading.current?.focus(), []);

  async function open() {
    if (state === "opening") return;
    setState("opening");
    try {
      await onOpen();
    } catch {
      setState("failure");
    }
  }

  return (
    <div
      data-complete-step
      className="grid w-full items-start gap-10 desktop:grid-cols-[minmax(0,1fr)_420px] desktop:gap-14"
    >
      <div className="flex min-w-0 flex-col items-start gap-4.5">
        <span
          aria-hidden
          className="flex size-19 items-center justify-center rounded-4xl bg-primary text-primary-foreground"
        >
          <CheckIcon className="size-10" strokeWidth={3} />
        </span>
        <h1 ref={heading} tabIndex={-1} className="type-onboarding-done outline-none">
          {t("title")}
        </h1>
        <p className="type-body-lg text-pretty text-muted-foreground">{t("lead")}</p>
        <Notice tone="muted" icon={InfoIcon} className="w-full">
          <span className="flex flex-col gap-0.5">
            <b className="text-foreground">{t("pendingTitle")}</b>
            <span>{t("pendingBody")}</span>
          </span>
        </Notice>
        <div role="status" aria-live="polite" className="w-full empty:sr-only">
          {state === "failure" && (
            <Notice
              tone="amber"
              action={
                <button type="button" onClick={() => void open()} className={actionClass}>
                  {t("retry")}
                </button>
              }
            >
              <span className="flex flex-col gap-0.5">
                <b>{t("failureTitle")}</b>
                <span>{t("failureBody")}</span>
              </span>
            </Notice>
          )}
        </div>
        <Button
          size="xl"
          className="mt-1.5 h-13 rounded-xl px-4.5 type-body"
          loading={state === "opening"}
          onClick={() => void open()}
        >
          {state === "opening" ? t("opening") : t("continue")}
        </Button>
      </div>
      <CompletedCoachCard profile={profileFrom(profile)} values={typeFrom(profile)} />
    </div>
  );
}
