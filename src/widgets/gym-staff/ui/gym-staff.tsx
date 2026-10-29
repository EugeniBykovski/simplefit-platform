"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LockIcon, UserPlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";

import { gymQueryKey, type Gym } from "@/entities/gym";
import {
  staffCapabilities,
  useGymStaff,
  useGymStaffInvitations,
  type GymStaffInvitation,
  type GymStaffMember,
  type GymStaffRole,
  type GymStaffView,
  type StaffCapabilities,
} from "@/entities/gym-staff";
import {
  ChangeRoleDialog,
  EndMembershipDialog,
  InviteStaffDialog,
  StaffInvitationActions,
} from "@/features/gym-staff-manage";
import { isApiError } from "@/shared/api/http/api-error";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";

/*
 * The gym's coaches and staff (`web.app.gyms._gym-id.staff`, WG16; Claude
 * Design 112 reconciled with SF-82 R7/R11/C10/C16; SF-94) for the gym in
 * the path, on the SF-93 API only:
 *
 * - the roster (`listGymStaff`): active staff for every role, ended staff
 *   for the owner and managers (`view_staff_records`); each member is a
 *   short name, the gym role, when they joined and the status, nothing
 *   else (no location, last activity or shifts: those domains do not exist);
 * - the invitations (`listGymStaffInvitations`, owner and managers): masked
 *   addresses and the backend's statuses, resend and cancel where the
 *   viewer may invite that role;
 * - invite, change role and remove / leave, offered from the viewer's
 *   permission projection and decided by the backend on every request.
 *
 * Counts appear only once a list is complete (no further page), never a
 * partial total. Coaches and front desk get the read-only roster.
 */

const ROLES: readonly GymStaffRole[] = ["owner", "manager", "coach", "front_desk"];

/** The page for the console's gym: a new gym is a new page (no state carries over). */
export function GymStaff({ gym }: { gym: Gym }) {
  return <StaffPage key={gym.id} gym={gym} />;
}

function StaffPage({ gym }: { gym: Gym }) {
  const t = useTranslations("gymConsole.staff");
  const can = staffCapabilities(gym.viewer);
  const [view, setView] = useState<GymStaffView>("active");
  const [selected, setSelected] = useState<string | null>(null);
  const roster = useGymStaff(gym.id, view);
  const active = useGymStaff(gym.id, "active", { enabled: view !== "active" });
  const invitations = useGymStaffInvitations(gym.id, { enabled: can.canViewRecords });
  useGoneGym(gym.id, roster.error);

  const rows = roster.data?.pages.flatMap((page) => page.staff) ?? [];
  const activeRows =
    view === "active" ? rows : (active.data?.pages.flatMap((page) => page.staff) ?? []);
  const activeComplete = view === "active" ? !roster.hasNextPage : !active.hasNextPage;
  const person = rows.find((row) => row.staff_membership_id === selected) ?? rows[0];

  return (
    <div data-gym-staff data-gym-id={gym.id} className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="type-label text-faint-foreground">{t("eyebrow")}</p>
          <h1 className="type-h3 font-display">{t("title")}</h1>
        </div>
        {can.canInvite && (
          <div className="ml-auto">
            <InviteStaffDialog gymId={gym.id} gymName={gym.name} roles={can.inviteRoles} />
          </div>
        )}
      </PageHeader>
      <PageBody className="grid content-start gap-4 pt-5.5 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Stats
            members={activeComplete && activeRows.length > 0 ? activeRows : null}
            invitations={can.canViewRecords ? invitations : null}
          />
          <Roster
            gymId={gym.id}
            view={view}
            canViewEnded={can.canViewRecords}
            onView={(next) => {
              setView(next);
              setSelected(null);
            }}
            roster={roster}
            rows={rows}
            selected={person?.staff_membership_id}
            onSelect={setSelected}
            alone={view === "active" && activeComplete && rows.length === 1 && can.canInvite}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {person && <Person gym={gym} member={person} can={can} />}
          {can.canViewRecords && <Invitations gymId={gym.id} invitations={invitations} can={can} />}
          <RolesReference />
        </div>
      </PageBody>
    </div>
  );
}

/**
 * A read refused with 404 means this gym is gone for the viewer (removed
 * meanwhile): the console's gym is read again, and the console then shows
 * that it is not available. Nothing of the gym stays on screen.
 */
function useGoneGym(gymId: string, error: unknown) {
  const client = useQueryClient();
  const gone = isApiError(error) && error.status === 404;
  useEffect(() => {
    if (gone) void client.invalidateQueries({ queryKey: gymQueryKey(gymId) });
  }, [client, gone, gymId]);
}

function Stats({
  members,
  invitations,
}: {
  members: GymStaffMember[] | null;
  invitations: ReturnType<typeof useGymStaffInvitations> | null;
}) {
  const t = useTranslations("gymConsole.staff.stats");
  const pending = invitations?.data?.pages
    .flatMap((page) => page.invitations)
    .filter((invitation) => invitation.status === "pending");
  const pendingComplete = invitations !== null && invitations.data && !invitations.hasNextPage;

  if (members === null && !pendingComplete) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2" data-staff-stats>
      {members !== null && (
        <Tile
          label={t("team")}
          value={members.length}
          line={ROLES.map((role) => [role, members.filter((m) => m.role === role).length] as const)
            .filter(([, count]) => count > 0)
            .map(([role, count]) => t(`roles.${role}`, { count }))
            .join(" · ")}
        />
      )}
      {pendingComplete && pending !== undefined && (
        <Tile
          label={t("pending")}
          value={pending.length}
          line={pending.length === 0 ? t("pendingNone") : t("pendingLine")}
        />
      )}
    </div>
  );
}

function Tile({ label, value, line }: { label: string; value: number; line: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-surface px-4 py-3.5">
      <span className="type-label text-faint-foreground">{label}</span>
      <span className="type-h3 font-display">{value}</span>
      <span className="type-caption font-bold text-muted-foreground">{line}</span>
    </div>
  );
}

function Roster({
  gymId,
  view,
  canViewEnded,
  onView,
  roster,
  rows,
  selected,
  onSelect,
  alone,
}: {
  gymId: string;
  view: GymStaffView;
  canViewEnded: boolean;
  onView: (view: GymStaffView) => void;
  roster: ReturnType<typeof useGymStaff>;
  rows: GymStaffMember[];
  selected: string | undefined;
  onSelect: (id: string) => void;
  alone: boolean;
}) {
  const t = useTranslations("gymConsole.staff.roster");
  const views: readonly GymStaffView[] = canViewEnded ? ["active", "ended"] : ["active"];

  return (
    <section
      aria-labelledby="staff-roster-heading"
      data-staff-roster={view}
      className="flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="staff-roster-heading" className="type-label text-faint-foreground">
          {t("heading")}
        </h2>
        {views.length > 1 && (
          <div role="group" aria-label={t("views")} className="flex gap-1.5">
            {views.map((item) => (
              <Button
                key={item}
                size="sm"
                variant={item === view ? "secondary" : "ghost"}
                aria-pressed={item === view}
                className="rounded-full"
                onClick={() => onView(item)}
              >
                {t(`tabs.${item}`)}
              </Button>
            ))}
          </div>
        )}
      </div>

      {roster.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2.5 px-2 py-8">
          <p className="type-title font-display">{t("failed.title")}</p>
          <p className="max-w-130 type-body-sm text-muted-foreground">{t("failed.body")}</p>
          <Button variant="quiet" onClick={() => void roster.refetch()}>
            {t("failed.retry")}
          </Button>
        </div>
      ) : roster.data === undefined ? (
        <div role="status" aria-label={t("loading")} className="flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-13 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-start gap-2.5 px-2 py-8">
          <p className="type-title font-display">{t(`empty.${view}.title`)}</p>
          <p className="max-w-130 type-body-sm text-muted-foreground">{t(`empty.${view}.body`)}</p>
        </div>
      ) : (
        <>
          <RosterTable
            gymId={gymId}
            view={view}
            rows={rows}
            selected={selected}
            onSelect={onSelect}
          />
          {roster.hasNextPage && (
            <Button
              variant="quiet"
              size="sm"
              className="self-center"
              aria-busy={roster.isFetchingNextPage}
              disabled={roster.isFetchingNextPage}
              onClick={() => void roster.fetchNextPage()}
            >
              {roster.isFetchingNextPage && <Spinner />}
              {roster.isFetchingNextPage ? t("loadingMore") : t("more")}
            </Button>
          )}
          {alone && (
            <p className="flex items-center gap-2.5 px-3 type-body-sm text-muted-foreground">
              <UserPlusIcon aria-hidden className="size-4 flex-none text-faint-foreground" />
              {t("alone")}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function RosterTable({
  gymId,
  view,
  rows,
  selected,
  onSelect,
}: {
  gymId: string;
  view: GymStaffView;
  rows: GymStaffMember[];
  selected: string | undefined;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("gymConsole.staff");
  const roleName = useTranslations("gymConsole.switcher.roles");
  const format = useFormatter();
  const date = (value: string) => format.dateTime(new Date(value), "date");
  const columns =
    view === "active"
      ? (["person", "role", "joined", "status"] as const)
      : (["person", "role", "joined", "ended"] as const);
  const grid = "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]";

  return (
    <div
      role="table"
      aria-label={t(`roster.label.${view}`)}
      data-gym-id={gymId}
      className="flex flex-col"
    >
      <div role="rowgroup" className="hidden md:block">
        <div
          role="row"
          className={cn("grid gap-3 px-3 pb-2 type-label text-faint-foreground", grid)}
        >
          {columns.map((column) => (
            <span key={column} role="columnheader">
              {t(`roster.columns.${column}`)}
            </span>
          ))}
        </div>
      </div>
      <div role="rowgroup">
        {rows.map((row) => {
          const name = row.name ?? t("noName");
          const current = row.staff_membership_id === selected;
          return (
            <div
              key={row.staff_membership_id}
              role="row"
              data-staff-member={row.staff_membership_id}
              data-staff-role={row.role}
              className={cn(
                "relative grid min-h-14 items-center gap-x-3 gap-y-1 rounded-lg border-t px-3 py-2 type-body-sm transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted",
                current && "bg-accent hover:bg-accent",
                grid,
              )}
            >
              <span role="cell" className="flex min-w-0 items-center gap-2.5">
                <Initials name={row.name} muted={row.status === "ended"} />
                <span className="flex min-w-0 flex-col">
                  {/* The name's button stretches over the row: one control per row, table semantics kept. */}
                  <button
                    type="button"
                    aria-pressed={current}
                    aria-label={t("roster.select", { name })}
                    onClick={() => onSelect(row.staff_membership_id)}
                    className="truncate text-left font-extrabold outline-none after:absolute after:inset-0 after:rounded-lg"
                  >
                    {name}
                  </button>
                  {row.is_viewer && (
                    <span className="type-caption text-muted-foreground">{t("roster.you")}</span>
                  )}
                </span>
              </span>
              <span role="cell" className="font-bold">
                <Hidden label={t("roster.columns.role")} />
                {roleName(row.role)}
              </span>
              <span role="cell" className="text-muted-foreground">
                <Hidden label={t("roster.columns.joined")} />
                {date(row.joined_at)}
              </span>
              <span role="cell">
                <Hidden label={t(`roster.columns.${view === "active" ? "status" : "ended"}`)} />
                {view === "active" ? (
                  <Badge variant="accent">
                    {row.role === "owner" ? t("status.owner") : t("status.active")}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">
                    {row.ended_at ? date(row.ended_at) : null}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Person({
  gym,
  member,
  can,
}: {
  gym: Gym;
  member: GymStaffMember;
  can: StaffCapabilities;
}) {
  const t = useTranslations("gymConsole.staff");
  const roleName = useTranslations("gymConsole.switcher.roles");
  const format = useFormatter();
  const date = (value: string) => format.dateTime(new Date(value), "date");
  const name = member.name ?? t("noName");
  const targets = can.roleTargets(member);
  const end = can.canEnd(member);

  return (
    <section
      aria-labelledby="staff-person-heading"
      data-staff-person={member.staff_membership_id}
      className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <h2 id="staff-person-heading" className="sr-only">
        {t("person.heading", { name })}
      </h2>
      <div className="flex items-center gap-3">
        <Initials name={member.name} size="lg" muted={member.status === "ended"} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="type-body-lg font-extrabold break-words">
            {name}
            {member.is_viewer && (
              <span className="ml-2 type-caption font-bold text-faint-foreground">
                {t("roster.you")}
              </span>
            )}
          </p>
          <p className="type-caption text-muted-foreground">
            {t("person.since", { role: roleName(member.role), date: date(member.joined_at) })}
          </p>
          {member.status === "ended" && member.ended_at && (
            <p className="type-caption text-muted-foreground">
              {t(`person.ended.${member.ended_reason ?? "removed"}`, {
                date: date(member.ended_at),
              })}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="type-label text-faint-foreground">
          {t("person.abilities", { role: roleName(member.role) })}
        </p>
        <p className="type-body-sm">{t(`roles.${member.role}.detail`)}</p>
      </div>
      {member.status === "active" &&
        (targets.length > 0 || end ? (
          <div className="flex flex-wrap items-center gap-2.5">
            {targets.length > 0 && (
              <ChangeRoleDialog
                gymId={gym.id}
                gymName={gym.name}
                member={member}
                targets={targets}
              />
            )}
            {end && <EndMembershipDialog gymId={gym.id} gymName={gym.name} member={member} />}
          </div>
        ) : (
          <p className="type-caption text-faint-foreground">
            {member.role === "owner" ? t("person.owner") : t("person.noActions")}
          </p>
        ))}
    </section>
  );
}

function Invitations({
  gymId,
  invitations,
  can,
}: {
  gymId: string;
  invitations: ReturnType<typeof useGymStaffInvitations>;
  can: StaffCapabilities;
}) {
  const t = useTranslations("gymConsole.staff.invitations");
  const items = invitations.data?.pages.flatMap((page) => page.invitations) ?? [];

  return (
    <section
      aria-labelledby="staff-invitations-heading"
      data-staff-invitations
      className="flex flex-col gap-1 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <h2 id="staff-invitations-heading" className="pb-2 type-label text-faint-foreground">
        {t("heading")}
      </h2>
      {invitations.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 py-2">
          <p className="type-body-sm text-muted-foreground">{t("failed")}</p>
          <Button size="sm" variant="quiet" onClick={() => void invitations.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : invitations.data === undefined ? (
        <div role="status" aria-label={t("loading")} className="flex flex-col gap-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-2 type-body-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((invitation) => (
            <InvitationItem
              key={invitation.invitation_id}
              gymId={gymId}
              invitation={invitation}
              manageable={can.managesInvitation(invitation)}
            />
          ))}
          {invitations.hasNextPage && (
            <li className="flex justify-center pt-2">
              <Button
                size="sm"
                variant="quiet"
                aria-busy={invitations.isFetchingNextPage}
                disabled={invitations.isFetchingNextPage}
                onClick={() => void invitations.fetchNextPage()}
              >
                {invitations.isFetchingNextPage && <Spinner />}
                {t("more")}
              </Button>
            </li>
          )}
        </ul>
      )}
      <Notice tone="muted" className="mt-2">
        {t("notice")}
      </Notice>
    </section>
  );
}

function InvitationItem({
  gymId,
  invitation,
  manageable,
}: {
  gymId: string;
  invitation: GymStaffInvitation;
  manageable: boolean;
}) {
  const t = useTranslations("gymConsole.staff.invitations");
  const roleName = useTranslations("gymConsole.switcher.roles");
  const format = useFormatter();
  const date = (value: string | null) => (value ? format.dateTime(new Date(value), "date") : "");
  const status = invitation.status;
  const line =
    status === "pending"
      ? t("line.pending", {
          sent: date(invitation.last_sent_at),
          expires: date(invitation.expires_at),
        })
      : t(`line.${status}`, {
          date: date(status === "expired" ? invitation.expires_at : invitation.responded_at),
        });

  return (
    <li
      className="flex flex-col gap-1.5 border-t py-3"
      data-staff-invitation={invitation.invitation_id}
      data-staff-invitation-status={status}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate type-body-sm font-extrabold">
          {invitation.recipient_email}
        </span>
        <Badge variant={status === "pending" ? "accent" : "neutral"}>{t(`status.${status}`)}</Badge>
      </span>
      <span className="type-caption text-muted-foreground">
        {roleName(invitation.role)}
        {invitation.invited_by.name
          ? ` · ${t("invitedBy", { name: invitation.invited_by.name })}`
          : ""}
      </span>
      <span className="type-caption text-faint-foreground">{line}</span>
      {status === "pending" && manageable && (
        <StaffInvitationActions gymId={gymId} invitation={invitation} />
      )}
    </li>
  );
}

/**
 * What each role allows at this gym today (SF-82 C10, the MVP matrix in
 * words), and the row WG17 keeps: no gym role reads private training data.
 * Copy only; it grants and checks nothing.
 */
function RolesReference() {
  const t = useTranslations("gymConsole.staff");
  const roleName = useTranslations("gymConsole.switcher.roles");
  return (
    <section
      aria-labelledby="staff-roles-heading"
      className="flex flex-col gap-1 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <h2 id="staff-roles-heading" className="pb-1 type-label text-faint-foreground">
        {t("reference.heading")}
      </h2>
      <dl className="flex flex-col">
        {ROLES.map((role) => (
          <div key={role} className="flex flex-col gap-0.5 border-t py-2.5 first:border-t-0">
            <dt className="type-body-sm font-extrabold">{roleName(role)}</dt>
            <dd className="type-caption text-muted-foreground">{t(`roles.${role}.line`)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 flex items-start gap-2.5 rounded-lg border bg-muted px-3.5 py-3 type-caption text-muted-foreground">
        <LockIcon aria-hidden className="mt-0.5 size-4 flex-none text-faint-foreground" />
        {t("reference.never")}
      </p>
    </section>
  );
}

/** A column name for stacked rows (below md the header row is hidden). */
function Hidden({ label }: { label: string }) {
  return <span className="sr-only md:hidden">{`${label} `}</span>;
}

/** "Natalia W." → "NW"; no name shows a neutral mark. */
function Initials({
  name,
  muted = false,
  size = "md",
}: {
  name: string | null;
  muted?: boolean;
  size?: "md" | "lg";
}): ReactNode {
  const letters = (name ?? "")
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
        "flex flex-none items-center justify-center rounded-full font-display font-bold",
        size === "lg" ? "size-13 type-body" : "size-8.5 type-caption",
        muted ? "bg-muted text-muted-foreground" : "bg-highlight text-highlight-foreground",
      )}
    >
      {letters || "·"}
    </span>
  );
}
