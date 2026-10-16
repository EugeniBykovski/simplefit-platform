"use client";

import { LockIcon, ShieldCheckIcon, UserRoundIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";

import {
  coachName,
  isUnavailable,
  useMyCoaches,
  type MyCoach,
  type MyCoachStatus,
} from "@/entities/my-coach";
import { EndRelationshipDialog } from "@/features/fighter-coach-relationship-end";
import { useRouter } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";

/*
 * WFC1 My coaches (`web.app.coaches`, SF-60; Claude Design
 * WebFighterCoaches, version 1792151007-1d70), in the Fighter shell.
 *
 * The fighter's real relationships from `listMyCoaches` (SF-56): Active
 * (default) and Ended (`?view=ended`). An active row shows the coach's public
 * identity and start and, expanded, what that coach sees with End
 * relationship; there is no detail route (fighters have no
 * single-relationship read, SF-74). Ended rows show only the coach's name at
 * the end, the date and who ended it. Loading, empty, unavailable (`404`: no
 * completed fighter profile) and failure are four different states.
 */

const VIEWS: readonly MyCoachStatus[] = ["active", "ended"];
const NEVER = ["goals", "body", "account", "others"] as const;

export function FighterCoaches({ view = "active" }: { view?: MyCoachStatus }) {
  const t = useTranslations("fighterCoaches");
  const router = useRouter();
  const list = useMyCoaches(view);
  const rows = list.data?.pages.flatMap((page) => page.relationships) ?? [];

  return (
    <div data-fighter-coaches className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex flex-col gap-0.5">
          <p className="type-label text-faint-foreground">{t("eyebrow")}</p>
          <h1 className="type-h3 font-display">{t("title")}</h1>
        </div>
      </PageHeader>
      <PageBody className="grid content-start gap-5 pt-5.5 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
        <section
          aria-labelledby="coaches-heading"
          className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface px-5 py-4.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="coaches-heading" className="type-label text-faint-foreground">
              {t("heading")}
            </h2>
            <nav aria-label={t("views")} className="flex gap-1.5">
              {VIEWS.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={item === view ? "secondary" : "ghost"}
                  aria-current={item === view ? "page" : undefined}
                  className="rounded-full"
                  onClick={() =>
                    router.replace(
                      routeHref("web.app.coaches", {}, item === "ended" ? { view: "ended" } : {}),
                    )
                  }
                >
                  {t(`tabs.${item}`)}
                </Button>
              ))}
            </nav>
          </div>

          {list.isError && isUnavailable(list.error) ? (
            <Message
              icon={<LockIcon aria-hidden className="size-6" />}
              title={t("unavailable.title")}
              body={t("unavailable.body")}
            />
          ) : list.isError ? (
            <Message
              alert
              title={t("failed.title")}
              body={t("failed.body")}
              action={
                <Button variant="quiet" onClick={() => void list.refetch()}>
                  {t("failed.retry")}
                </Button>
              }
            />
          ) : list.data === undefined ? (
            <div role="status" aria-label={t("loading")} className="flex flex-col gap-2.5">
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </div>
          ) : rows.length === 0 ? (
            <Message
              icon={<UserRoundIcon aria-hidden className="size-6" />}
              title={t(`empty.${view}.title`)}
              body={t(`empty.${view}.body`)}
            />
          ) : (
            <>
              <ul className="flex flex-col">
                {rows.map((coach) =>
                  view === "active" ? (
                    <ActiveRow key={coach.relationship_id} coach={coach} />
                  ) : (
                    <EndedRow key={coach.relationship_id} coach={coach} />
                  ),
                )}
              </ul>
              {list.hasNextPage && (
                <Button
                  variant="quiet"
                  size="sm"
                  className="self-center"
                  aria-busy={list.isFetchingNextPage}
                  disabled={list.isFetchingNextPage}
                  onClick={() => void list.fetchNextPage()}
                >
                  {list.isFetchingNextPage && <Spinner />}
                  {list.isFetchingNextPage ? t("loadingMore") : t("more")}
                </Button>
              )}
              {view === "ended" && (
                <p className="type-caption text-faint-foreground">{t("endedNote")}</p>
              )}
            </>
          )}
        </section>
        <div className="flex min-w-0 flex-col gap-3.5">
          <section
            aria-labelledby="never-heading"
            className="flex flex-col gap-2 rounded-3xl border bg-surface px-5 py-4.5"
          >
            <h2
              id="never-heading"
              className="flex items-center gap-2 type-label text-faint-foreground"
            >
              <ShieldCheckIcon aria-hidden className="size-4" />
              {t("never.title")}
            </h2>
            <ul className="flex flex-col gap-1 type-body-sm text-muted-foreground">
              {NEVER.map((line) => (
                <li key={line}>{t(`never.${line}`)}</li>
              ))}
            </ul>
          </section>
          <p className="rounded-lg border bg-muted px-3.5 py-3 type-caption text-muted-foreground">
            {t("howTo")}
          </p>
        </div>
      </PageBody>
    </div>
  );
}

function ActiveRow({ coach }: { coach: MyCoach }) {
  const t = useTranslations("fighterCoaches");
  const fields = useTranslations("fighterCoaches.fields");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const panel = useId();
  const name = coachName(coach.coach) ?? t("fallbackName");
  const brand = coach.coach?.display_name ? coach.coach.brand_name : null;
  const since = format.dateTime(new Date(coach.started_at), "date");

  const done = (outcome: "ended" | "unavailable") => {
    // Only the backend's 204 names the coach; a relationship no longer
    // reachable says nothing about who or why.
    if (outcome === "ended") toast.success(t("end.ended", { name }));
    else toast(t("end.unavailable"));
  };

  return (
    <li className="flex flex-col gap-3 border-t py-3">
      <div className="flex items-center gap-3">
        <Initials name={name} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate type-body-sm font-extrabold">{name}</span>
          <span className="type-caption text-muted-foreground">
            {brand ? t("row.brandSince", { brand, date: since }) : t("row.since", { date: since })}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t("row.hide") : t("row.show")}
        </Button>
      </div>
      {open && (
        <div
          id={panel}
          className="flex flex-col gap-3 rounded-2xl border bg-background px-4 py-3 sm:ml-12 sm:flex-row sm:items-start"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h3 className="type-label text-faint-foreground">{t("sees", { name })}</h3>
            {coach.disclosed_fields.length === 0 ? (
              <p className="type-body-sm text-muted-foreground">{t("nothing")}</p>
            ) : (
              <ul className="flex flex-wrap gap-x-3 gap-y-1 type-body-sm">
                {coach.disclosed_fields.map((field) => (
                  <li key={field}>{fields(field)}</li>
                ))}
              </ul>
            )}
          </div>
          <EndRelationshipDialog
            relationshipId={coach.relationship_id}
            coachName={name}
            onDone={done}
          />
        </div>
      )}
    </li>
  );
}

function EndedRow({ coach }: { coach: MyCoach }) {
  const t = useTranslations("fighterCoaches");
  const format = useFormatter();
  const name = coach.coach_display_name_at_end ?? t("fallbackName");
  const date = coach.ended_at ? format.dateTime(new Date(coach.ended_at), "date") : "";

  return (
    <li className="flex items-center gap-3 border-t py-3">
      <Initials name={name} muted />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate type-body-sm font-extrabold text-muted-foreground">{name}</span>
        <span className="type-caption text-faint-foreground">
          {t("row.ended", {
            date,
            by: coach.ended_by === "coach" ? t("row.endedBy.coach") : t("row.endedBy.fighter"),
          })}
        </span>
      </div>
    </li>
  );
}

function Message({
  icon,
  title,
  body,
  action,
  alert = false,
}: {
  icon?: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div role={alert ? "alert" : "status"} className="flex flex-col items-start gap-2.5 py-6">
      {icon && (
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-highlight">
          {icon}
        </span>
      )}
      <p className="type-title font-display">{title}</p>
      <p className="max-w-130 type-body-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

function Initials({ name, muted = false }: { name: string; muted?: boolean }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 flex-none items-center justify-center rounded-full type-caption font-display font-bold",
        muted ? "bg-muted text-muted-foreground" : "bg-highlight text-highlight-foreground",
      )}
    >
      {letters || "·"}
    </span>
  );
}
