"use client";

import { CheckIcon, CircleAlertIcon, ClockIcon, CompassIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";

import type { GymChecklistItem, GymFirstRun } from "@/entities/gym-first-run";
import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { Skeleton } from "@/shared/ui/skeleton";

/*
 * GRW1, the owner's first run on the gym console (SF-91; Claude Design 112,
 * `FirstRunWebG`): the introduction card and the gym's setup checklist,
 * both from `GET /api/v1/gyms/{gym_id}/first-run` (SF-90). The card offers
 * the tour (GRW2) while the backend says `not_started` or `in_progress`;
 * right after an outcome is kept here it says so, and the next visit is the
 * plain WG1 dashboard (completed and dismissed never reopen).
 */

export type IntroAction = "start" | "dismiss";

/** The introduction card: not started, in progress (from another device), or an outcome just kept here. */
export function FirstRunIntro({
  firstRun,
  pending,
  failed,
  onStart,
  onSkip,
}: {
  firstRun: GymFirstRun;
  /** A transition is on its way to the backend. */
  pending: IntroAction | undefined;
  /** The last transition failed; nothing changed. */
  failed: boolean;
  onStart: () => void;
  onSkip: () => void;
}) {
  const t = useTranslations("gymConsole.firstRun.intro");
  const format = useFormatter();

  if (firstRun.status === "completed" || firstRun.status === "dismissed") {
    const kept = firstRun.status;
    return (
      <Notice
        tone={kept === "completed" ? "olive" : "amber"}
        role="status"
        icon={kept === "completed" ? CheckIcon : CircleAlertIcon}
        data-first-run-outcome={kept}
        className="rounded-3xl px-5 py-4.5 type-body-sm"
      >
        <span className="flex flex-col gap-0.5">
          <b>{t(`${kept}.title`)}</b>
          <span>{t(`${kept}.body`)}</span>
        </span>
      </Notice>
    );
  }

  const resuming = firstRun.status === "in_progress";
  const started =
    resuming && firstRun.started_at !== null
      ? format.dateTime(new Date(firstRun.started_at), {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      : null;

  return (
    <section
      aria-labelledby="gym-first-run-heading"
      data-first-run-intro={firstRun.status}
      className="flex min-w-0 flex-col gap-4 rounded-3xl border border-accent-border bg-accent px-5 py-4.5 text-accent-foreground sm:flex-row sm:items-center"
    >
      <span
        aria-hidden
        className="flex size-13 flex-none items-center justify-center rounded-2xl bg-primary-muted/30 text-highlight"
      >
        <CompassIcon className="size-6.5" strokeWidth={1.8} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="type-label text-highlight">
          {resuming ? t("eyebrowInProgress") : t("eyebrowNotStarted")}
        </p>
        <h2 id="gym-first-run-heading" className="type-title font-display text-pretty">
          {resuming ? t("resumeTitle") : t("title")}
        </h2>
        <p className="type-body-sm text-pretty opacity-85">
          {resuming
            ? started === null
              ? t("resumeBodyUndated")
              : t("resumeBody", { date: started })
            : t("body")}
        </p>
        {failed && (
          <p
            role="alert"
            className="flex items-center gap-1.5 type-caption font-bold text-warning-subtle-foreground"
          >
            <CircleAlertIcon aria-hidden className="size-4" />
            {t("failed")}
          </p>
        )}
      </div>
      <div className="flex flex-none flex-col gap-2 sm:items-stretch">
        <Button
          aria-haspopup="dialog"
          loading={pending === "start"}
          disabled={pending !== undefined}
          onClick={onStart}
          data-first-run-start
        >
          {pending === "start" ? t("starting") : resuming ? t("resume") : t("start")}
        </Button>
        <Button
          variant="quiet"
          aria-haspopup="dialog"
          disabled={pending !== undefined}
          onClick={onSkip}
          data-first-run-skip
        >
          {t("skip")}
        </Button>
      </div>
    </section>
  );
}

export function FirstRunIntroLoading() {
  const t = useTranslations("gymConsole.firstRun");
  return (
    <div
      aria-busy="true"
      aria-label={t("loading")}
      className="flex flex-col gap-2.5 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <Skeleton className="h-3 w-48" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-3.5 w-4/5" />
    </div>
  );
}

/** The first-run read failed (offline, 5xx): the console works without it. */
export function FirstRunUnavailable({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("gymConsole.firstRun.unavailable");
  return (
    <Notice
      tone="amber"
      role="alert"
      icon={CircleAlertIcon}
      data-first-run-unavailable
      className="rounded-3xl px-5 py-4.5 type-body-sm"
      action={
        <Button variant="quiet" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      }
    >
      <span className="flex flex-col gap-0.5">
        <b>{t("title")}</b>
        <span>{t("body")}</span>
      </span>
    </Notice>
  );
}

/**
 * The gym's setup checklist, exactly as the backend projects it (SF-90): its
 * items in the response's order. A done item is a persisted fact; a
 * "coming later" item has no feature yet, links nowhere and is never counted
 * as missing. There is no progress count: no denominator would be truthful.
 */
export function GymChecklist({
  items,
  staffHref,
}: {
  items: GymChecklistItem[];
  /**
   * SF-94: where "Invite your staff" leads while it is available (the gym's
   * Coaches & staff page), for a viewer who may invite. Its status stays the
   * backend's: it completes only once an invitation is accepted.
   */
  staffHref?: string;
}) {
  const t = useTranslations("gymConsole.firstRun.checklist");
  const ready = items.filter((item) => item.status !== "coming_later");
  const later = items.filter((item) => item.status === "coming_later");
  const created = items.some((item) => item.key === "create_gym" && item.status === "completed");

  return (
    <section
      aria-labelledby="gym-checklist-heading"
      data-tour-target="gym-checklist"
      data-gym-checklist
      className="flex min-w-0 flex-col gap-4 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <div className="flex flex-col gap-1">
        <p className="type-label text-highlight">{t("eyebrow")}</p>
        <h2 id="gym-checklist-heading" className="type-title font-display">
          {created ? t("readyTitle") : t("title")}
        </h2>
        {created && <p className="type-body-sm text-muted-foreground">{t("readyBody")}</p>}
      </div>
      {ready.length > 0 && (
        <ul className="flex flex-col gap-2">
          {ready.map((item) => (
            <ChecklistRow
              key={item.key}
              item={item}
              href={
                item.key === "invite_staff" && item.status === "available" ? staffHref : undefined
              }
            />
          ))}
        </ul>
      )}
      {later.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="type-label text-faint-foreground">{t("moreTitle")}</h3>
          <p className="type-caption text-muted-foreground">{t("moreBody")}</p>
          <ul className="mt-1 flex flex-col">
            {later.map((item) => (
              <ChecklistRow key={item.key} item={item} />
            ))}
          </ul>
        </div>
      )}
      <p className="type-caption text-faint-foreground">{t("footnote")}</p>
    </section>
  );
}

function ChecklistRow({ item, href }: { item: GymChecklistItem; href?: string }) {
  const t = useTranslations("gymConsole.firstRun.checklist");
  const done = item.status === "completed";
  const later = item.status === "coming_later";
  return (
    <li
      data-checklist-key={item.key}
      data-checklist-status={item.status}
      className={cn(
        "flex min-h-14 items-center gap-3",
        done && "rounded-2xl border border-accent-border bg-accent px-3 py-2",
        later && "border-t py-2 first:border-t-0",
        item.status === "available" && "rounded-2xl border px-3 py-2",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-7 flex-none items-center justify-center rounded-full",
          done && "bg-primary text-primary-foreground",
          later && "border-[1.5px] border-dashed border-input text-faint-foreground",
          item.status === "available" && "border-2 border-highlight",
        )}
      >
        {done ? (
          <CheckIcon className="size-4" strokeWidth={3} />
        ) : later ? (
          <ClockIcon className="size-3.5" />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "type-body-sm font-extrabold",
            later ? "text-muted-foreground" : "text-foreground",
            done && "text-accent-foreground",
          )}
        >
          {href ? (
            <Link href={href} className="underline-offset-4 hover:underline" data-checklist-link>
              {t(`items.${item.key}.title`)}
            </Link>
          ) : (
            t(`items.${item.key}.title`)
          )}
        </span>
        <span className="type-caption text-muted-foreground">
          {t(`items.${item.key}.${item.status}`)}
        </span>
      </span>
      <Badge variant={done ? "accent" : "neutral"}>{t(`badges.${item.status}`)}</Badge>
    </li>
  );
}

export function GymChecklistLoading() {
  const t = useTranslations("gymConsole.firstRun.checklist");
  return (
    <div
      aria-busy="true"
      aria-label={t("loading")}
      className="flex flex-col gap-3 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-3 w-40" />
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} className="h-12 w-full" />
      ))}
    </div>
  );
}

/**
 * Skip = `dismissed` (SF-90 D4): final on every device, and it completes no
 * checklist item. Confirmed first; the dialog closes only once the backend
 * kept the outcome, and a failure keeps it open with nothing changed.
 */
export function SkipDialog({
  open,
  pending,
  failed,
  onConfirm,
  onCancel,
  onClosed,
}: {
  open: boolean;
  pending: boolean;
  failed: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** After the dialog closed: where focus goes (no Radix trigger owns it). */
  onClosed: () => void;
}) {
  const t = useTranslations("gymConsole.firstRun.skip");
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <DialogPrimitive.Content
          role="alertdialog"
          data-first-run-skip-dialog
          onInteractOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onClosed();
          }}
          className="fixed top-1/2 left-1/2 z-50 flex w-110 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-3xl border bg-popover p-6 text-popover-foreground shadow-modal outline-none"
        >
          <p className="type-label text-warning-subtle-foreground">{t("eyebrow")}</p>
          <DialogPrimitive.Title className="type-h3 font-display text-pretty">
            {t("title")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="type-body-sm text-pretty text-muted-foreground">
            {t("body")}
          </DialogPrimitive.Description>
          {failed && (
            <p role="alert" className="type-caption font-bold text-destructive">
              {t("failed")}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap justify-end gap-2.5">
            <Button variant="quiet" disabled={pending} onClick={onCancel}>
              {t("keep")}
            </Button>
            <Button
              variant="warning"
              loading={pending}
              onClick={onConfirm}
              data-first-run-skip-confirm
            >
              {t("confirm")}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
