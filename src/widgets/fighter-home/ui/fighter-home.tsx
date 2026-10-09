"use client";

import { EyeIcon, LayoutGridIcon, ShieldIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";

import { useFighterProfile } from "@/entities/fighter-profile";
import { useFirstRun, useRecordFirstRunOutcome } from "@/entities/first-run";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { ApplicationSkeleton, FailureView } from "@/widgets/system-states";

import { dayWithSimpleFit, headerDate, partOfDay } from "../model/home-date";
import { HomeTour } from "./home-tour";
import { SetupChecklist } from "./setup-checklist";

/**
 * The Fighter web home (`web.app.home`, SF-40; Claude Design 34b FRW1 / FRW2,
 * 1440 × 900), inside the Fighter shell and behind the Fighter gate.
 *
 * Two states of one page, chosen by the backend's first-run record (ADR 0018
 * in simplefit-api), never by browser storage:
 *
 * - **First run** (the tour is `pending`): "Welcome to SimpleFit", the day
 *   with SimpleFit, and the tour offered from the header and the Live Board
 *   card (FRW1). The nine-step tour (FRW2) opens only when asked.
 * - **Home** (the tour was finished or ended, here or on any other client):
 *   the greeting and the date. "Take the tour" stays as a replay (FRW2, complete),
 *   which records nothing.
 *
 * Only real data is shown: the Fighter's display name and onboarding
 * completion (FighterProfile). Everything the artboard fills from domains
 * that do not exist yet (gym, bookings, the next class, training, the store
 * links) is left out or shown as not available; nothing is invented.
 */
export function FighterHome() {
  const profile = useFighterProfile();
  const tour = useFirstRun("fighter_web_tour");

  if (profile.isError || tour.isError) {
    return (
      <FailureView
        error={profile.error ?? tour.error}
        onRetry={() => {
          void profile.refetch();
          void tour.refetch();
        }}
      />
    );
  }
  if (profile.data === undefined || tour.data === undefined) return <ApplicationSkeleton />;

  return (
    <HomeView
      name={profile.data.display_name}
      completedAt={profile.data.onboarding.completed_at}
      firstRun={tour.data.status === "pending"}
    />
  );
}

export function HomeView({
  name,
  completedAt,
  firstRun,
}: {
  name: string | null;
  completedAt: string | null;
  firstRun: boolean;
}) {
  const t = useTranslations("fighterHome");
  const locale = useLocale();
  const record = useRecordFirstRunOutcome("fighter_web_tour");
  const [touring, setTouring] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [now] = useState(() => new Date());

  const day = dayWithSimpleFit(completedAt, now);
  const date = headerDate(locale, now);
  const named = name === null ? "anonymous" : "named";

  const openTour = useCallback(() => setTouring(true), []);
  const closeTour = useCallback(() => setTouring(false), []);

  return (
    <section
      aria-labelledby="home-title"
      data-fighter-home={firstRun ? "first-run" : "home"}
      className="flex w-full flex-1 flex-col"
    >
      <PageHeader>
        <hgroup className="flex min-w-0 flex-col gap-0.5">
          <p className="type-label text-faint-foreground">
            {firstRun && day !== undefined ? t("header.dateDay", { date, day }) : date}
          </p>
          <h1
            id="home-title"
            ref={heading}
            tabIndex={-1}
            className="type-h2 text-pretty outline-none"
          >
            {firstRun
              ? t(`header.welcome.${named}`, { name: name ?? "" })
              : t(`header.greeting.${partOfDay(now)}.${named}`, { name: name ?? "" })}
          </h1>
        </hgroup>
        <span className="flex-1" />
        <Button
          variant="quiet"
          onClick={openTour}
          aria-haspopup="dialog"
          data-tour-target="tour-button"
        >
          <EyeIcon aria-hidden className="size-4.5" />
          {t("header.tour")}
        </Button>
      </PageHeader>
      <PageBody className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <SetupChecklist />
          <section
            aria-labelledby="home-board"
            data-home-board
            className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface px-5 py-4.5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="home-board" className="type-title">
                {t("board.title")}
              </h2>
              <Badge variant="neutral">{t("board.empty")}</Badge>
            </div>
            <p className="flex h-37.5 items-center justify-center gap-3.5 rounded-lg border-[1.5px] border-dashed border-input px-4 text-center type-body-sm text-muted-foreground">
              <LayoutGridIcon aria-hidden className="size-5.5 flex-none text-highlight" />
              {t("board.body")}
            </p>
            {firstRun && (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={openTour}
                className="self-start rounded-xs type-body-sm font-extrabold text-highlight outline-none hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("board.tour")}
              </button>
            )}
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <section
            aria-labelledby="home-app"
            data-home-app
            className="flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface px-5 py-4.5"
          >
            <p className="type-label text-highlight">{t("app.label")}</p>
            <div className="flex flex-col gap-1.5">
              <h2 id="home-app" className="type-body-lg font-bold">
                {t("app.title")}
              </h2>
              <p className="type-body-sm text-muted-foreground">{t("app.body")}</p>
            </div>
          </section>
          <Notice tone="olive" icon={ShieldIcon} className="rounded-lg">
            {t("plan")}
          </Notice>
        </div>
      </PageBody>
      {/* Mounted in both states: the completion card shows after the outcome is kept. */}
      <HomeTour
        open={touring}
        replay={!firstRun}
        onRecord={record}
        onClose={closeTour}
        onClosed={() => heading.current?.focus()}
      />
    </section>
  );
}
