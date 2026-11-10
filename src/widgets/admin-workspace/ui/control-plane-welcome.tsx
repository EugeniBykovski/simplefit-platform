"use client";

import { AlertTriangleIcon, CheckIcon, InfoIcon, MinusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { useFirstRun, useRecordFirstRunOutcome, type FirstRunOutcome } from "@/entities/first-run";
import { useOperator, type Operator } from "@/entities/operator";
import { GuidedTour, type TourCopy } from "@/features/product-tour";
import { useRouter } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";

import {
  ACCESS_ROWS,
  CONTROL_PLANE_TOUR_STEPS,
  hasAccess,
  type ControlPlaneTourStepId,
} from "../model/access";

/**
 * ARW1, the Control Plane first visit (SF-120; Claude Design `FirstRunAdmin`, MVP):
 * what the operator can open, how sensitive actions work, and an optional tour.
 * Offered while the backend reports `control_plane_web_tour` pending; Skip,
 * Finish and Skip tour record the outcome there (account-wide, final), never in
 * the browser. A recorded visit keeps the page as a reference without the offer.
 */
export function ControlPlaneWelcome() {
  const operator = useOperator().data;
  if (!operator) return null;
  return <Welcome operator={operator} />;
}

function Welcome({ operator }: { operator: Operator }) {
  const t = useTranslations("controlPlane.welcome");
  const router = useRouter();
  const firstRun = useFirstRun("control_plane_web_tour");
  const record = useRecordFirstRunOutcome("control_plane_web_tour");
  const [touring, setTouring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const copy = useTourCopy();

  const offered = firstRun.data?.status === "pending";

  // The first outcome is final: another tab's earlier answer is kept, and that's fine.
  const keep = async (outcome: FirstRunOutcome) => {
    await record(outcome);
  };

  const skip = async () => {
    setSaving(true);
    setFailed(false);
    try {
      await keep("dismissed");
      router.push(routeHref("web.admin"));
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  if (firstRun.isError) {
    return (
      <Shell>
        <section
          data-control-plane-welcome="error"
          className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5"
        >
          <Badge variant="destructive" className="gap-1.5 uppercase">
            <AlertTriangleIcon aria-hidden className="size-3.5" />
            {t("error.pill")}
          </Badge>
          <h2 className="type-h3 font-display">{t("error.title")}</h2>
          <p className="type-body-sm text-muted-foreground">{t("error.body")}</p>
          <Button onClick={() => void firstRun.refetch()}>{t("error.retry")}</Button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <div
        data-control-plane-welcome={offered ? "ready" : "recorded"}
        className="grid items-start gap-4 lg:grid-cols-5"
      >
        <section
          data-tour-target="admin-access"
          aria-labelledby="control-plane-welcome-heading"
          className="flex flex-col gap-4 rounded-3xl border bg-surface p-5 sm:p-6.5 lg:col-span-3"
        >
          {offered && (
            <Badge variant="info" className="w-fit gap-1.5 uppercase">
              <InfoIcon aria-hidden className="size-3.5" />
              {t("pill")}
            </Badge>
          )}
          <h2
            ref={heading}
            tabIndex={-1}
            id="control-plane-welcome-heading"
            className="type-h2 font-display text-pretty outline-none"
          >
            {t("heading")}
          </h2>
          <p className="type-body text-pretty text-muted-foreground">{t("body")}</p>
          <h3 className="type-title">{t("access.title")}</h3>
          <ul className="flex flex-col divide-y rounded-xl border">
            {ACCESS_ROWS.map((row) => {
              const granted = hasAccess(operator, row);
              return (
                <li
                  key={row}
                  data-access-row={row}
                  data-granted={granted}
                  className="flex min-h-10 items-center justify-between gap-3 px-3.5 py-2 type-body-sm"
                >
                  <span>{t(`access.rows.${row}`)}</span>
                  {granted ? (
                    <span className="flex items-center gap-1 font-bold text-highlight">
                      <CheckIcon aria-hidden className="size-4" />
                      {t("access.granted")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-faint-foreground">
                      <MinusIcon aria-hidden className="size-4" />
                      {t("access.notGranted")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="type-caption text-muted-foreground">{t("access.notYet")}</p>
          <p className="type-caption text-faint-foreground">{t("note")}</p>
          {failed && (
            <p role="alert" className="type-caption font-bold text-destructive">
              {t("failed")}
            </p>
          )}
          {offered && (
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <Button
                className="h-11"
                disabled={saving}
                onClick={() => setTouring(true)}
                data-control-plane-tour-start
              >
                {t("tour")}
              </Button>
              <Button
                variant="link"
                className="h-11 w-fit"
                loading={saving}
                onClick={() => void skip()}
                data-control-plane-skip
              >
                {t("skip")}
              </Button>
            </div>
          )}
        </section>

        <section
          data-tour-target="admin-sensitive"
          aria-labelledby="control-plane-sensitive-heading"
          className="flex flex-col gap-3 rounded-3xl border bg-surface p-5 sm:p-6.5 lg:col-span-2"
        >
          <h2 id="control-plane-sensitive-heading" className="type-h3 font-display">
            {t("sensitive.title")}
          </h2>
          <ol className="flex list-decimal flex-col gap-2 ps-5 type-body-sm text-muted-foreground">
            <li>{t("sensitive.steps.check")}</li>
            <li>{t("sensitive.steps.reason")}</li>
            <li>{t("sensitive.steps.key")}</li>
            <li>{t("sensitive.steps.result")}</li>
          </ol>
        </section>
      </div>

      <GuidedTour
        open={touring}
        steps={CONTROL_PLANE_TOUR_STEPS}
        copy={copy}
        onComplete={() => keep("completed")}
        onDismiss={() => keep("dismissed")}
        onClose={() => setTouring(false)}
        onClosed={() => {
          if (firstRun.data?.status === "completed") router.push(routeHref("web.admin"));
          else heading.current?.focus();
        }}
      />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const t = useTranslations("controlPlane.welcome");
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="type-label text-faint-foreground">{t("breadcrumb")}</p>
          <h1 className="truncate type-h3 font-display">{t("title")}</h1>
        </div>
      </PageHeader>
      <PageBody className="pt-5.5">{children}</PageBody>
    </div>
  );
}

function useTourCopy(): TourCopy<ControlPlaneTourStepId> {
  const t = useTranslations("controlPlane.tour");
  return useMemo(
    () => ({
      step: (id) => ({ title: t(`steps.${id}.title`), body: t(`steps.${id}.body`) }),
      progress: (step, total) => t("step", { step, total }),
      complete: t("complete"),
      done: { title: t("steps.done.title"), body: t("steps.done.body") },
      confirm: {
        label: t("confirm.label"),
        title: t("confirm.title"),
        body: t("confirm.body"),
        keep: t("confirm.keep"),
        end: t("confirm.end"),
      },
      finishing: {
        title: t("finishing.title"),
        body: t("finishing.body"),
        button: t("finishing.button"),
      },
      finishFailed: { title: t("finishFailed.title"), body: t("finishFailed.body") },
      failed: t("failed"),
      end: t("end"),
      back: t("back"),
      next: t("next"),
      finish: t("finish"),
      close: t("close"),
      tryAgain: t("tryAgain"),
    }),
    [t],
  );
}
