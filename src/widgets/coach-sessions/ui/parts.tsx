"use client";

import { ChevronLeftIcon, InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { TrainingSessionStatus } from "@/entities/training-session";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";

const STATUS_BADGE = {
  planned: "accent",
  completed: "success",
  cancelled: "neutral",
} as const;

/** A session's backend status, always in words (colour is never the only signal). */
export function StatusBadge({ status }: { status: TrainingSessionStatus }) {
  const t = useTranslations("coachSessions");
  return (
    <Badge variant={STATUS_BADGE[status]} data-status={status}>
      {t(`status.${status}`)}
    </Badge>
  );
}

/**
 * The frame of the sessions pages (WCT1, WC3, WCT2, WCT3): the 76 px header
 * with its eyebrow, title and actions (and, below the planner, the way back
 * to it), then the main column and the 320 px aside.
 */
export function SessionsPage({
  eyebrow,
  title,
  back = false,
  actions,
  aside,
  wide = false,
  children,
}: {
  eyebrow: string;
  title: string;
  back?: boolean;
  actions?: ReactNode;
  aside: string;
  /** The planner's list fills the column; forms and details stop at 720 px. */
  wide?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("coachSessions");
  return (
    <div data-coach-sessions className="flex min-h-full flex-col">
      <PageHeader>
        {back && (
          <Button asChild variant="quiet" size="icon" className="flex-none">
            <Link href={routeHref("web.app.coach.sessions")} aria-label={t("back")}>
              <ChevronLeftIcon aria-hidden />
            </Link>
          </Button>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="type-label text-faint-foreground">{eyebrow}</p>
          <h1 className="truncate type-h3 font-display">{title}</h1>
        </div>
        {actions !== undefined && (
          <div className="ml-auto flex flex-wrap items-center gap-2.5">{actions}</div>
        )}
      </PageHeader>
      <PageBody
        className={
          wide
            ? "grid content-start gap-5 pt-5.5 lg:grid-cols-[minmax(0,1fr)_20rem]"
            : "grid content-start gap-5 pt-5.5 lg:grid-cols-[minmax(0,45rem)_20rem]"
        }
      >
        <div className="flex min-w-0 flex-col">{children}</div>
        {/* A note beside the content, not a landmark: the shell's sidebar is the page's aside. */}
        <div data-sessions-aside className="flex min-w-0 flex-col gap-3.5">
          <p className="flex items-start gap-2.5 rounded-lg border bg-muted px-3.5 py-3 type-caption text-muted-foreground">
            <InfoIcon aria-hidden className="mt-0.5 size-4 flex-none text-faint-foreground" />
            {aside}
          </p>
        </div>
      </PageBody>
    </div>
  );
}

/** The card the planner list, a form and a session sit on. */
export function Card({ children, labelledBy }: { children: ReactNode; labelledBy?: string }) {
  return (
    <section
      aria-labelledby={labelledBy}
      className="flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface px-5 py-4.5 md:px-6 md:py-5.5"
    >
      {children}
    </section>
  );
}

/** A state in place of content: loading aside, an empty list, not available, a failure. */
export function StateMessage({
  role,
  icon,
  title,
  body,
  action,
}: {
  role?: "status" | "alert";
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div role={role} className="flex flex-col items-start gap-2.5 px-2 py-6">
      {icon !== undefined && (
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-highlight">
          {icon}
        </span>
      )}
      <p className="type-title font-display">{title}</p>
      <p className="max-w-140 type-body-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
