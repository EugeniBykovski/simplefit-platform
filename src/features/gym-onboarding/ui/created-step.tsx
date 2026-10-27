"use client";

import { CheckIcon, InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import type { GymSetup } from "@/entities/gym-setup";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";

import { noticeActionClass } from "./step-notice";

/** OG6b's "get ready to open" list (OG7–OG14), none of which exists yet. */
const LATER = [
  "verify",
  "memberships",
  "payments",
  "timetable",
  "team",
  "import",
  "community",
  "launch",
] as const;

/**
 * OG6b "Gym created": shown only once the API has recorded completion
 * (`setup_status: completed`) in this tab. It claims nothing else: no trial,
 * plan or verification exists, and the get-ready steps are listed as coming
 * later, never as links (approved SF-86 differences). "Go to gym" continues
 * only through the backend: `onOpen` records the explicit choice of this gym
 * (SF-84) and resolves the entry; a failure keeps the visitor here with Try
 * again.
 */
export function CreatedStep({
  setup,
  onOpen,
}: {
  setup: GymSetup;
  /** Resolves once the browser is on its way; rejects when it could not continue. */
  onOpen: () => Promise<void>;
}) {
  const t = useTranslations("gymOnboarding.done");
  const heading = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<"ready" | "opening" | "failure">("ready");

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
      data-created-step
      className="grid w-full content-start items-start gap-12 px-4 py-12 sm:px-6 md:px-8 desktop:grid-cols-[minmax(0,1fr)_380px] desktop:px-16 desktop:py-16"
    >
      <div className="flex min-w-0 flex-col items-start gap-4.5">
        <span
          aria-hidden
          className="flex size-18 items-center justify-center rounded-3xl bg-primary text-primary-foreground"
        >
          <CheckIcon className="size-9" strokeWidth={3} />
        </span>
        <p className="type-label text-highlight">{t("eyebrow")}</p>
        <h1
          ref={heading}
          tabIndex={-1}
          className="type-onboarding-done text-balance break-words outline-none"
        >
          {t("title", { name: setup.name })}
        </h1>
        <p className="max-w-160 type-body-lg text-pretty text-muted-foreground">{t("lead")}</p>
        <Notice tone="muted" icon={InfoIcon} className="w-full max-w-160">
          <span className="flex flex-col gap-0.5">
            <b className="text-foreground">{t("pendingTitle")}</b>
            <span>{t("pendingBody")}</span>
          </span>
        </Notice>
        <div role="status" aria-live="polite" className="w-full max-w-160 empty:sr-only">
          {state === "failure" && (
            <Notice
              tone="amber"
              action={
                <button type="button" onClick={() => void open()} className={noticeActionClass}>
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
      <section
        aria-labelledby="gym-later-title"
        className="flex min-w-0 flex-col gap-0.5 rounded-3xl border bg-surface p-4.5"
      >
        <h2 id="gym-later-title" className="type-label text-faint-foreground">
          {t("laterTitle")}
        </h2>
        <ul className="flex flex-col">
          {LATER.map((step, index) => (
            <li
              key={step}
              className="flex min-h-15 items-center gap-3 border-b border-border-subtle py-2 last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="type-body font-extrabold text-muted-foreground">
                  {t(`later.${step}.title`)}
                </span>
                <span className="type-caption text-faint-foreground">{t(`later.${step}.sub`)}</span>
              </span>
              <span
                className="flex-none rounded-sm bg-surface-elevated px-2.5 py-1 type-badge text-faint-foreground"
                data-step-number={index + 7}
              >
                {t("laterBadge")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
