"use client";

import { AlertTriangleIcon, SearchXIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";

import {
  OVERSIGHT_REASONS,
  useCoach,
  useFighter,
  useProfileSearch,
  type OversightCoach,
  type OversightCoachSummary,
  type OversightFighter,
  type OversightFighterSummary,
  type OversightReason,
  type ProfileKind,
  type ProfileSearch as Search,
} from "@/entities/admin-oversight";
import { grants, useOperator } from "@/entities/operator";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";

import { Restricted, StatusBadge } from "./account-parts";
import { ReasonSelect } from "./reason-select";

type Summary = OversightCoachSummary | OversightFighterSummary;

/**
 * AD7's Fighters and Coaches tabs (SF-123; Claude Design `AdminUsers`, MVP): an exact
 * lookup (`@username` for fighters, or the account's email or user id) with a recorded
 * reason; at most one result. Opening it reads the profile the backend allows
 * (`coaches.read` / `fighters.read`): shared fields, onboarding and account state
 * apart, and counts. Never training, notes, weight, health, messages or who the other
 * party of a relationship is.
 */
export function ProfileSearchPanel({ kind }: { kind: ProfileKind }) {
  const t = useTranslations(`controlPlane.users.profiles.${kind}`);
  const p = useTranslations("controlPlane.users.profiles");
  const common = useTranslations("controlPlane.users");
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState<OversightReason>();
  const [submitted, setSubmitted] = useState<Search | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const search = useProfileSearch(kind, submitted);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === "" || reason === undefined) return;
    setOpen(null);
    setSubmitted({ query: trimmed, reason });
  };

  const forbidden = isApiError(search.error) && search.error.status === 403;
  const limited = isApiError(search.error) && search.error.status === 429;

  let body: ReactNode;
  if (forbidden) {
    body = <Restricted />;
  } else if (submitted === null) {
    body = <p className="type-body-sm text-muted-foreground">{t("idle")}</p>;
  } else if (search.isFetching) {
    body = (
      <div role="status" aria-label={common("searching")} aria-busy="true">
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  } else if (search.isError) {
    body = (
      <section className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5">
        <Badge variant="destructive" className="gap-1.5 uppercase">
          <AlertTriangleIcon aria-hidden className="size-3.5" />
          {common("error.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{common("error.title")}</h2>
        <p role="alert" className="type-body-sm text-muted-foreground">
          {limited ? common("search.rateLimited") : common("error.body")}
        </p>
        <Button onClick={() => void search.refetch()}>{common("error.retry")}</Button>
      </section>
    );
  } else if (search.data?.length === 0) {
    body = (
      <section
        role="status"
        data-search-state="no-match"
        className="flex max-w-155 flex-col items-start gap-2.5 rounded-3xl border bg-surface p-6.5"
      >
        <Badge variant="neutral" className="gap-1.5 uppercase">
          <SearchXIcon aria-hidden className="size-3.5" />
          {common("search.noMatch.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{t("noMatch")}</h2>
        <p className="type-body-sm text-muted-foreground">{common("search.noMatch.body")}</p>
      </section>
    );
  } else if (search.data && submitted) {
    body = (
      <section aria-labelledby={`${kind}-search-result`} className="flex flex-col gap-3">
        <h2 id={`${kind}-search-result`} className="type-title font-display">
          {common("search.result")}
        </h2>
        <ul className="flex flex-col divide-y rounded-3xl border bg-surface">
          {search.data.map((profile: Summary) => (
            <li key={profile.id} data-profile-result={profile.id} className="flex flex-col">
              <div className="grid gap-3 p-4 sm:grid-cols-5 sm:items-center">
                <div className="flex min-w-0 flex-col sm:col-span-2">
                  <span className="truncate type-body-sm font-bold">
                    {profile.display_name ?? p("noName")}
                  </span>
                  <span className="truncate type-caption text-faint-foreground">
                    {"username" in profile
                      ? profile.username && `@${profile.username}`
                      : profile.brand_name}
                  </span>
                </div>
                <span className="type-body-sm text-muted-foreground">
                  {p(`profileStatus.${profile.profile_status}`)}
                </span>
                <span className="type-body-sm text-muted-foreground">
                  {p("activeRelationships", { count: profile.active_relationships })}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={profile.account_status} />
                  <Button
                    variant="quiet"
                    size="sm"
                    aria-expanded={open === profile.id}
                    aria-controls={`profile-detail-${profile.id}`}
                    onClick={() => setOpen(open === profile.id ? null : profile.id)}
                  >
                    {open === profile.id ? p("hide") : p("show")}
                  </Button>
                </span>
              </div>
              {open === profile.id && (
                <div id={`profile-detail-${profile.id}`} className="border-t p-4">
                  <ProfileDetail kind={kind} id={profile.id} reason={submitted.reason} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <>
      <form
        role="search"
        aria-label={t("label")}
        onSubmit={submit}
        className="grid gap-3 rounded-3xl border bg-surface p-5 md:grid-cols-5 md:items-end"
      >
        <div className="flex min-w-0 flex-col gap-1.5 md:col-span-2">
          <Label htmlFor={`${kind}-search-query`}>
            {t("label")} <span aria-hidden>*</span>
          </Label>
          <Input
            id={`${kind}-search-query`}
            value={query}
            required
            maxLength={320}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("placeholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <ReasonSelect
            id={`${kind}-search-reason`}
            label={common("search.reason")}
            placeholder={common("search.reasonPlaceholder")}
            reasons={OVERSIGHT_REASONS}
            value={reason}
            onChange={(value) => setReason(value as OversightReason)}
          />
        </div>
        <Button
          type="submit"
          className="h-11"
          disabled={query.trim() === "" || reason === undefined}
          loading={search.isFetching}
        >
          {common("search.submit")}
        </Button>
        <p className="type-caption text-faint-foreground md:col-span-5">{p("note")}</p>
      </form>
      {body}
    </>
  );
}

function ProfileDetail({
  kind,
  id,
  reason,
}: {
  kind: ProfileKind;
  id: string;
  reason: OversightReason;
}) {
  const coach = useCoach(kind === "coach" ? id : null, reason);
  const fighter = useFighter(kind === "fighter" ? id : null, reason);
  const read = kind === "coach" ? coach : fighter;
  const p = useTranslations("controlPlane.users.profiles");
  const common = useTranslations("controlPlane.users");

  if (isApiError(read.error) && read.error.status === 403) return <Restricted />;
  if (isApiError(read.error) && read.error.status === 404)
    return <p className="type-body-sm text-muted-foreground">{p("gone")}</p>;
  if (read.isError)
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="type-body-sm text-muted-foreground">
          {common("error.body")}
        </p>
        <Button variant="quiet" onClick={() => void read.refetch()}>
          {common("error.retry")}
        </Button>
      </div>
    );
  if (coach.data) return <Coach coach={coach.data} reason={reason} />;
  if (fighter.data) return <Fighter fighter={fighter.data} reason={reason} />;
  return (
    <div role="status" aria-busy="true" aria-label={p("loading")}>
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}

function useLinks(reason: OversightReason) {
  const operator = useOperator().data;
  const may = (permission: string) => (operator ? grants(operator, permission) : false);
  return {
    account: (userId: string, label: string) =>
      may("users.read") ? (
        <Link
          href={routeHref("web.admin.users._user-id", { userId }, { reason })}
          className="font-bold text-highlight underline-offset-4 hover:underline"
        >
          {label}
        </Link>
      ) : null,
    gym: may("gyms.read"),
  };
}

function Coach({ coach, reason }: { coach: OversightCoach; reason: OversightReason }) {
  const p = useTranslations("controlPlane.users.profiles");
  const format = useFormatter();
  const links = useLinks(reason);
  const list = (names: string[]) => (names.length === 0 ? "—" : names.join(", "));

  return (
    <div data-coach={coach.id} className="grid items-start gap-4 lg:grid-cols-2">
      <Facts title={p("profile")} id={`coach-profile-${coach.id}`} notes={[p("coach.never")]}>
        <Fact label={p("name")} value={coach.display_name ?? p("noName")} />
        <Fact label={p("coach.brand")} value={coach.brand_name ?? "—"} />
        <Fact label={p("location")} value={place(coach.city, coach.country_code)} />
        <Fact
          label={p("coach.formats")}
          value={list(coach.coaching_formats.map((value) => p(`formats.${value}`)))}
        />
        <Fact
          label={p("coach.levels")}
          value={list(coach.competition_levels.map((value) => p(`levels.${value}`)))}
        />
        <Fact
          label={p("coach.languages")}
          value={list(coach.languages.map((value) => p(`languages.${value}`)))}
        />
        <Fact label={p("profileLabel")} value={p(`profileStatus.${coach.profile_status}`)} />
        <Fact label={p("created")} value={format.dateTime(new Date(coach.created_at), "date")} />
      </Facts>
      <div className="flex flex-col gap-4">
        <Facts title={p("account")} id={`coach-account-${coach.id}`} notes={[p("accountNote")]}>
          <Fact label={p("accountState")} value={<StatusBadge status={coach.account_status} />} />
          <Fact
            label={p("accountLink")}
            value={links.account(coach.user_id, p("openAccount")) ?? p("noAccountAccess")}
          />
        </Facts>
        <Facts
          title={p("relationships")}
          id={`coach-relationships-${coach.id}`}
          notes={[p("relationshipsNote")]}
        >
          <Fact label={p("active")} value={p("count", { count: coach.relationships.active })} />
          <Fact label={p("ended")} value={p("count", { count: coach.relationships.ended })} />
          <Fact
            label={p("coach.invitations")}
            value={p("count", { count: coach.relationships.invitations_pending })}
          />
        </Facts>
        <Facts title={p("coach.gyms")} id={`coach-gyms-${coach.id}`} notes={[p("coach.gymsNote")]}>
          {coach.gyms.length === 0 ? (
            <Fact label={p("coach.gymCount")} value={p("count", { count: 0 })} />
          ) : (
            coach.gyms.map((gym, index) => (
              <Fact
                key={gym.gym_id}
                label={p("coach.gym", { n: index + 1 })}
                value={
                  links.gym ? (
                    <Link
                      href={routeHref(
                        "web.admin.tenants._tenant-id",
                        { tenantId: gym.gym_id },
                        { reason },
                      )}
                      className="font-bold text-highlight underline-offset-4 hover:underline"
                    >
                      {p("coach.openGym", { date: format.dateTime(new Date(gym.since), "date") })}
                    </Link>
                  ) : (
                    p("coach.since", { date: format.dateTime(new Date(gym.since), "date") })
                  )
                }
              />
            ))
          )}
        </Facts>
      </div>
    </div>
  );
}

function Fighter({ fighter, reason }: { fighter: OversightFighter; reason: OversightReason }) {
  const p = useTranslations("controlPlane.users.profiles");
  const format = useFormatter();
  const links = useLinks(reason);

  return (
    <div data-fighter={fighter.id} className="grid items-start gap-4 lg:grid-cols-2">
      <Facts title={p("profile")} id={`fighter-profile-${fighter.id}`} notes={[p("fighter.never")]}>
        <Fact label={p("name")} value={fighter.display_name ?? p("noName")} />
        <Fact
          label={p("fighter.username")}
          value={fighter.username ? `@${fighter.username}` : "—"}
        />
        <Fact label={p("location")} value={place(fighter.city, fighter.country_code)} />
        <Fact
          label={p("fighter.experience")}
          value={fighter.experience_level ? p(`experience.${fighter.experience_level}`) : "—"}
        />
        <Fact
          label={p("fighter.stance")}
          value={fighter.stance ? p(`stance.${fighter.stance}`) : "—"}
        />
        <Fact label={p("profileLabel")} value={p(`profileStatus.${fighter.profile_status}`)} />
        <Fact label={p("created")} value={format.dateTime(new Date(fighter.created_at), "date")} />
      </Facts>
      <div className="flex flex-col gap-4">
        <Facts title={p("account")} id={`fighter-account-${fighter.id}`} notes={[p("accountNote")]}>
          <Fact label={p("accountState")} value={<StatusBadge status={fighter.account_status} />} />
          <Fact
            label={p("accountLink")}
            value={links.account(fighter.user_id, p("openAccount")) ?? p("noAccountAccess")}
          />
        </Facts>
        <Facts
          title={p("relationships")}
          id={`fighter-relationships-${fighter.id}`}
          notes={[p("relationshipsNote")]}
        >
          <Fact label={p("active")} value={p("count", { count: fighter.relationships.active })} />
          <Fact label={p("ended")} value={p("count", { count: fighter.relationships.ended })} />
          <Fact
            label={p("fighter.gymMemberships")}
            value={p("count", { count: fighter.gym_memberships })}
          />
        </Facts>
      </div>
    </div>
  );
}

const place = (city: string | null, country: string | null) =>
  [city, country].filter(Boolean).join(", ") || "—";

function Facts({
  title,
  id,
  notes,
  children,
}: {
  title: string;
  id: string;
  notes: string[];
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-2xl border p-4">
      <h3 id={id} className="type-title font-display">
        {title}
      </h3>
      <dl className="flex flex-col divide-y">{children}</dl>
      {notes.map((note) => (
        <p key={note} className="type-caption text-faint-foreground">
          {note}
        </p>
      ))}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-3">
      <dt className="type-body-sm text-muted-foreground">{label}</dt>
      <dd className="type-body-sm sm:text-right">{value}</dd>
    </div>
  );
}
