"use client";

import { useQueryClient } from "@tanstack/react-query";
import { EyeOffIcon, LockIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";

import { gymQueryKey, type Gym } from "@/entities/gym";
import {
  memberCapabilities,
  useGymEnrollmentSettings,
  useGymJoinRequests,
  useGymMemberInvitations,
  useGymMembers,
  type GymMember,
  type GymMemberInvitation,
  type GymMemberView,
  type MemberCapabilities,
} from "@/entities/gym-member";
import { MemberImport } from "@/features/gym-member-import";
import {
  EnrollmentSettingsPanel,
  InviteMemberDialog,
  JoinRequestActions,
  MemberInvitationActions,
  RemoveMemberDialog,
} from "@/features/gym-member-manage";
import { isApiError } from "@/shared/api/http/api-error";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

/*
 * The gym's members (`web.app.gyms._gym-id.members`, WG3 with OG12; Claude
 * Design 112 reconciled with SF-95 and SF-82; SF-96) for the gym in the
 * path, on the SF-95 API only:
 *
 * - Members (`listGymMembers`): active and ended memberships, each a short
 *   name, how and when the person joined and how it ended, nothing else (no
 *   plan, payment, location, visits or contact: those domains do not exist,
 *   and training data is never the gym's, D-G06). Ending a membership is the
 *   owner's and managers' (`change_member_status`).
 * - Requests (`listGymJoinRequests`): approve or reject, owner, managers and
 *   front desk (`manage_member_enrollment`).
 * - Invitations (`listGymMemberInvitations`, E07): masked addresses and the
 *   backend's statuses; invite, resend and cancel. Where the server keeps
 *   member invitations off (409 `recipient_flow_unavailable`), the page says
 *   so and stops offering them; nothing is ever said to be sent.
 * - Join code & approval (`getGymEnrollmentSettings`): the code, its
 *   rotation and auto-approval, changed only where `can_manage`.
 * - Import preview (`previewGymMemberImport`): a dry run that stores and
 *   sends nothing; importing is not available (D-G27).
 *
 * A coach holds `view_members` only for their own classes, which do not
 * exist yet: the backend refuses the roster (403) and the page shows that.
 * Counts appear only once a list is complete (no further page), never a
 * partial total. Nothing changes before the backend answers.
 */

type Tab = "members" | "requests" | "invitations" | "settings" | "import";

/** The page for the console's gym: a new gym is a new page (no state, file or code carries over). */
export function GymMembers({ gym }: { gym: Gym }) {
  return <MembersPage key={gym.id} gym={gym} />;
}

function MembersPage({ gym }: { gym: Gym }) {
  const t = useTranslations("gymConsole.members");
  const can = memberCapabilities(gym.viewer);
  const [tab, setTab] = useState<Tab>("members");
  // Learnt from the backend's 409: member invitations are off on this server.
  const [invitesOff, setInvitesOff] = useState(false);
  const requests = useGymJoinRequests(gym.id, { enabled: can.canEnroll });
  const requestRows = requests.data?.pages.flatMap((page) => page.members) ?? [];
  const requestCount =
    requests.data !== undefined && !requests.hasNextPage ? requestRows.length : null;

  const tabs: readonly Tab[] = can.canEnroll
    ? ["members", "requests", "invitations", "settings", "import"]
    : ["members"];

  return (
    <div data-gym-members data-gym-id={gym.id} className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="type-label text-faint-foreground">{t("eyebrow")}</p>
          <h1 className="type-h3 font-display">{t("title")}</h1>
        </div>
        {can.canEnroll && !invitesOff && (
          <div className="ml-auto">
            <InviteMemberDialog
              gymId={gym.id}
              gymName={gym.name}
              onUnavailable={() => setInvitesOff(true)}
            />
          </div>
        )}
      </PageHeader>
      <PageBody className="flex flex-col gap-4 pt-5.5">
        <Tabs
          value={tab}
          onValueChange={(next) => {
            setTab(next as Tab);
            // Opening the requests reads them again: someone may have asked meanwhile.
            if (next === "requests") void requests.refetch();
          }}
          className="gap-4"
        >
          {tabs.length > 1 && (
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <TabsList aria-label={t("tabs.label")} className="h-auto min-h-9">
                {tabs.map((item) => {
                  const count = item === "requests" && requestCount ? requestCount : null;
                  return (
                    <TabsTrigger
                      key={item}
                      value={item}
                      data-members-tab={item}
                      aria-label={count ? t("tabs.requestsWaiting", { count }) : undefined}
                    >
                      {t(`tabs.${item}`)}
                      {count && (
                        <span
                          aria-hidden
                          className="type-caption font-mono opacity-80"
                          data-requests-count
                        >
                          {count}
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>
          )}
          <TabsContent value="members">
            <MembersTab gym={gym} can={can} />
          </TabsContent>
          {can.canEnroll && (
            <>
              <TabsContent value="requests">
                <RequestsTab
                  gym={gym}
                  requests={requests}
                  rows={requestRows}
                  onSettings={() => setTab("settings")}
                />
              </TabsContent>
              <TabsContent value="invitations">
                <InvitationsTab
                  gym={gym}
                  invitesOff={invitesOff}
                  onUnavailable={() => setInvitesOff(true)}
                />
              </TabsContent>
              <TabsContent value="settings">
                <SettingsTab gym={gym} />
              </TabsContent>
              <TabsContent value="import">
                <MemberImport gymId={gym.id} />
              </TabsContent>
            </>
          )}
        </Tabs>
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

/** The state of a read that has no rows to show: loading, refused, failed (retry). */
function ReadState({
  query,
  loading,
  children,
}: {
  query: { isError: boolean; error: unknown; data: unknown; refetch: () => unknown };
  loading: string;
  children: ReactNode;
}) {
  const t = useTranslations("gymConsole.members.read");
  if (query.isError) {
    const status = isApiError(query.error) ? query.error.status : undefined;
    if (status === 403) {
      return (
        <div
          role="alert"
          className="flex flex-col items-start gap-2.5 px-2 py-8"
          data-members-restricted
        >
          <p className="flex items-center gap-2 type-title font-display">
            <LockIcon aria-hidden className="size-4.5 text-faint-foreground" />
            {t("restricted.title")}
          </p>
          <p className="max-w-130 type-body-sm text-muted-foreground">{t("restricted.body")}</p>
        </div>
      );
    }
    return (
      <div role="alert" className="flex flex-col items-start gap-2.5 px-2 py-8" data-members-failed>
        <p className="type-title font-display">{t("failed.title")}</p>
        <p className="max-w-130 type-body-sm text-muted-foreground">{t("failed.body")}</p>
        <Button variant="quiet" onClick={() => void query.refetch()}>
          {t("failed.retry")}
        </Button>
      </div>
    );
  }
  if (query.data === undefined) {
    return (
      <div role="status" aria-label={loading} className="flex flex-col gap-2.5">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-13 rounded-xl" />
        ))}
      </div>
    );
  }
  return children;
}

function MembersTab({ gym, can }: { gym: Gym; can: MemberCapabilities }) {
  const t = useTranslations("gymConsole.members.roster");
  const [view, setView] = useState<GymMemberView>("active");
  const [selected, setSelected] = useState<string | null>(null);
  const roster = useGymMembers(gym.id, view);
  useGoneGym(gym.id, roster.error);
  const rows = roster.data?.pages.flatMap((page) => page.members) ?? [];
  const person = rows.find((row) => row.gym_member_id === selected) ?? rows[0];
  const refused = roster.isError && isApiError(roster.error) && roster.error.status === 403;

  return (
    <div className="grid content-start gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
      <section
        aria-labelledby="members-roster-heading"
        data-members-roster={view}
        className="flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface px-5 py-4.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 id="members-roster-heading" className="type-label text-faint-foreground">
              {t("heading")}
            </h2>
            {roster.data !== undefined && !roster.hasNextPage && rows.length > 0 && (
              <span className="type-label font-mono text-faint-foreground" data-members-count>
                {t("count", { count: rows.length })}
              </span>
            )}
          </div>
          {!refused && (
            <div role="group" aria-label={t("views")} className="flex gap-1.5">
              {(["active", "ended"] as const).map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={item === view ? "secondary" : "ghost"}
                  aria-pressed={item === view}
                  className="rounded-full"
                  onClick={() => {
                    setView(item);
                    setSelected(null);
                  }}
                >
                  {t(`tabs.${item}`)}
                </Button>
              ))}
            </div>
          )}
        </div>
        <ReadState query={roster} loading={t("loading")}>
          {rows.length === 0 ? (
            <div className="flex flex-col items-start gap-2.5 px-2 py-8" data-members-empty={view}>
              <p className="type-title font-display">{t(`empty.${view}.title`)}</p>
              <p className="max-w-130 type-body-sm text-muted-foreground">
                {t(`empty.${view}.body`)}
              </p>
            </div>
          ) : (
            <>
              <RosterTable
                view={view}
                rows={rows}
                selected={person?.gym_member_id}
                onSelect={setSelected}
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
            </>
          )}
        </ReadState>
      </section>
      <div className="flex min-w-0 flex-col gap-4">
        {person && !refused && <Person gym={gym} member={person} can={can} />}
        <PrivacyCard />
      </div>
    </div>
  );
}

function RosterTable({
  view,
  rows,
  selected,
  onSelect,
}: {
  view: GymMemberView;
  rows: GymMember[];
  selected: string | undefined;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("gymConsole.members");
  const format = useFormatter();
  const date = (value: string | null) => (value ? format.dateTime(new Date(value), "date") : "—");
  const columns =
    view === "active"
      ? (["person", "joined", "via", "status"] as const)
      : (["person", "joined", "ended", "how"] as const);
  const grid = "md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.9fr)]";

  return (
    <div role="table" aria-label={t(`roster.label.${view}`)} className="flex flex-col">
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
          const current = row.gym_member_id === selected;
          return (
            <div
              key={row.gym_member_id}
              role="row"
              data-member={row.gym_member_id}
              data-member-status={row.status}
              className={cn(
                "relative grid min-h-14 items-center gap-x-3 gap-y-1 rounded-lg border-t px-3 py-2 type-body-sm transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted",
                current && "bg-accent hover:bg-accent",
                grid,
              )}
            >
              <span role="cell" className="flex min-w-0 items-center gap-2.5">
                <Initials name={row.name} muted={row.status !== "active"} />
                {/* The name's button stretches over the row: one control per row, table semantics kept. */}
                <button
                  type="button"
                  aria-pressed={current}
                  aria-label={t("roster.select", { name })}
                  onClick={() => onSelect(row.gym_member_id)}
                  className="min-w-0 truncate text-left font-extrabold outline-none after:absolute after:inset-0 after:rounded-lg"
                >
                  {name}
                </button>
              </span>
              <span role="cell" className="text-muted-foreground">
                <Hidden label={t("roster.columns.joined")} />
                {date(row.joined_at)}
              </span>
              {view === "active" ? (
                <>
                  <span role="cell" className="text-muted-foreground">
                    <Hidden label={t("roster.columns.via")} />
                    {t(`via.${row.joined_via}`)}
                  </span>
                  <span role="cell">
                    <Hidden label={t("roster.columns.status")} />
                    <Badge variant="accent">{t("status.active")}</Badge>
                  </span>
                </>
              ) : (
                <>
                  <span role="cell" className="text-muted-foreground">
                    <Hidden label={t("roster.columns.ended")} />
                    {date(row.ended_at)}
                  </span>
                  <span role="cell">
                    <Hidden label={t("roster.columns.how")} />
                    <Badge variant="neutral">{t(`ended.${row.ended_reason ?? "removed"}`)}</Badge>
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Person({ gym, member, can }: { gym: Gym; member: GymMember; can: MemberCapabilities }) {
  const t = useTranslations("gymConsole.members");
  const format = useFormatter();
  const date = (value: string | null) => (value ? format.dateTime(new Date(value), "date") : "");
  const name = member.name ?? t("noName");

  return (
    <section
      aria-labelledby="member-person-heading"
      data-member-person={member.gym_member_id}
      className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <h2 id="member-person-heading" className="sr-only">
        {t("person.heading", { name })}
      </h2>
      <div className="flex items-center gap-3">
        <Initials name={member.name} size="lg" muted={member.status !== "active"} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="type-body-lg font-extrabold break-words">{name}</p>
          {member.joined_at && (
            <p className="type-caption text-muted-foreground">
              {t("person.since", { date: date(member.joined_at), gym: gym.name })}
            </p>
          )}
          {member.status === "ended" && member.ended_at && (
            <p className="type-caption text-muted-foreground">
              {t(`person.ended.${member.ended_reason ?? "removed"}`, {
                date: date(member.ended_at),
              })}
            </p>
          )}
        </div>
      </div>
      <dl className="flex flex-col">
        <Fact label={t("person.via")} value={t(`via.${member.joined_via}`)} />
        {member.requested_at && (
          <Fact label={t("person.requested")} value={date(member.requested_at)} />
        )}
        {member.joined_via === "join_code" && member.status !== "requested" && (
          <Fact
            label={t("person.approval")}
            value={member.auto_approved ? t("person.autoApproved") : t("person.staffApproved")}
          />
        )}
      </dl>
      {member.status === "active" &&
        (can.canEnd ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <RemoveMemberDialog gymId={gym.id} gymName={gym.name} member={member} />
          </div>
        ) : (
          <p className="type-caption text-faint-foreground">{t("person.noActions")}</p>
        ))}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t py-2.5 type-body-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-bold">{value}</dd>
    </div>
  );
}

/** WG3's "Gym admin can't see", kept: the gym never reads members' training data (D-G06). */
function PrivacyCard() {
  const t = useTranslations("gymConsole.members.privacy");
  return (
    <section
      aria-labelledby="members-privacy-heading"
      className="flex flex-col gap-1.5 rounded-3xl border border-dashed bg-surface px-5 py-4.5"
    >
      <h2
        id="members-privacy-heading"
        className="flex items-center gap-2 type-label text-faint-foreground"
      >
        <EyeOffIcon aria-hidden className="size-4" />
        {t("heading")}
      </h2>
      <p className="type-caption text-muted-foreground">{t("body")}</p>
      <p className="type-caption text-faint-foreground">{t("membership")}</p>
    </section>
  );
}

function RequestsTab({
  gym,
  requests,
  rows,
  onSettings,
}: {
  gym: Gym;
  requests: ReturnType<typeof useGymJoinRequests>;
  rows: GymMember[];
  onSettings: () => void;
}) {
  const t = useTranslations("gymConsole.members.requests");
  const format = useFormatter();
  useGoneGym(gym.id, requests.error);

  return (
    <section
      aria-labelledby="members-requests-heading"
      data-members-requests
      className="flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="members-requests-heading" className="type-title font-display">
          {t("heading")}
        </h2>
        <p className="type-caption text-muted-foreground">
          {t("lead")}{" "}
          <button
            type="button"
            onClick={onSettings}
            className="font-bold text-highlight underline-offset-4 hover:underline"
          >
            {t("settingsLink")}
          </button>
        </p>
      </div>
      <ReadState query={requests} loading={t("loading")}>
        {rows.length === 0 ? (
          <p className="px-2 py-6 type-body-sm text-muted-foreground" data-requests-empty>
            {t("empty")}
          </p>
        ) : (
          <ul className="flex flex-col">
            {rows.map((request) => (
              <li
                key={request.gym_member_id}
                data-request={request.gym_member_id}
                className="flex flex-wrap items-center gap-3 border-t py-3"
              >
                <Initials name={request.name} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate type-body-sm font-extrabold">
                    {request.name ?? t("someone")}
                  </span>
                  {request.requested_at && (
                    <span className="type-caption text-muted-foreground">
                      {t("asked", {
                        date: format.dateTime(new Date(request.requested_at), "date"),
                      })}
                    </span>
                  )}
                </div>
                <JoinRequestActions gymId={gym.id} gymName={gym.name} request={request} />
              </li>
            ))}
            {requests.hasNextPage && (
              <li className="flex justify-center pt-2">
                <Button
                  size="sm"
                  variant="quiet"
                  aria-busy={requests.isFetchingNextPage}
                  disabled={requests.isFetchingNextPage}
                  onClick={() => void requests.fetchNextPage()}
                >
                  {requests.isFetchingNextPage && <Spinner />}
                  {t("more")}
                </Button>
              </li>
            )}
          </ul>
        )}
      </ReadState>
    </section>
  );
}

function InvitationsTab({
  gym,
  invitesOff,
  onUnavailable,
}: {
  gym: Gym;
  invitesOff: boolean;
  onUnavailable: () => void;
}) {
  const t = useTranslations("gymConsole.members.invitations");
  const invitations = useGymMemberInvitations(gym.id);
  const items = invitations.data?.pages.flatMap((page) => page.invitations) ?? [];

  return (
    <div className="grid content-start gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
      <section
        aria-labelledby="members-invitations-heading"
        data-member-invitations
        className="flex min-w-0 flex-col gap-1 rounded-3xl border bg-surface px-5 py-4.5"
      >
        <h2 id="members-invitations-heading" className="pb-2 type-title font-display">
          {t("heading")}
        </h2>
        {invitesOff && (
          <Notice tone="amber" className="mb-2" data-member-invitations-off>
            {t("off")}
          </Notice>
        )}
        <ReadState query={invitations} loading={t("loading")}>
          {items.length === 0 ? (
            <p className="py-2 type-body-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col">
              {items.map((invitation) => (
                <InvitationItem
                  key={invitation.invitation_id}
                  gymId={gym.id}
                  invitation={invitation}
                  invitesOff={invitesOff}
                  onUnavailable={onUnavailable}
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
        </ReadState>
      </section>
      <section
        aria-labelledby="members-invitations-about"
        className="flex min-w-0 flex-col gap-2 rounded-3xl border bg-surface px-5 py-4.5"
      >
        <h2 id="members-invitations-about" className="type-label text-faint-foreground">
          {t("about.heading")}
        </h2>
        <p className="type-caption text-muted-foreground">{t("about.body")}</p>
        <p className="type-caption text-muted-foreground">{t("about.proof")}</p>
      </section>
    </div>
  );
}

function InvitationItem({
  gymId,
  invitation,
  invitesOff,
  onUnavailable,
}: {
  gymId: string;
  invitation: GymMemberInvitation;
  invitesOff: boolean;
  onUnavailable: () => void;
}) {
  const t = useTranslations("gymConsole.members.invitations");
  const format = useFormatter();
  const date = (value: string | null) => (value ? format.dateTime(new Date(value), "date") : "");
  const status = invitation.status;
  const line =
    status === "pending"
      ? t("line.pending", { expires: date(invitation.expires_at) })
      : t(`line.${status}`, {
          date: date(status === "expired" ? invitation.expires_at : invitation.responded_at),
        });

  return (
    <li
      className="flex flex-col gap-1.5 border-t py-3"
      data-member-invitation={invitation.invitation_id}
      data-member-invitation-status={status}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate type-body-sm font-extrabold">
          {invitation.recipient_email}
        </span>
        <Badge variant={status === "pending" ? "accent" : "neutral"}>{t(`status.${status}`)}</Badge>
      </span>
      {invitation.invited_by.name && (
        <span className="type-caption text-muted-foreground">
          {t("invitedBy", { name: invitation.invited_by.name })}
        </span>
      )}
      <span className="type-caption text-faint-foreground">{line}</span>
      {status === "pending" && (
        <MemberInvitationActions
          gymId={gymId}
          invitation={invitation}
          canResend={!invitesOff}
          onUnavailable={onUnavailable}
        />
      )}
    </li>
  );
}

function SettingsTab({ gym }: { gym: Gym }) {
  const t = useTranslations("gymConsole.members.settings");
  const settings = useGymEnrollmentSettings(gym.id);
  useGoneGym(gym.id, settings.error);
  return (
    <div className="grid content-start gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
      <ReadState query={settings} loading={t("loading")}>
        {settings.data && (
          <EnrollmentSettingsPanel gymId={gym.id} gymName={gym.name} settings={settings.data} />
        )}
      </ReadState>
      <section
        aria-labelledby="members-settings-about"
        className="flex min-w-0 flex-col gap-2 rounded-3xl border bg-surface px-5 py-4.5"
      >
        <h2 id="members-settings-about" className="type-label text-faint-foreground">
          {t("about.heading")}
        </h2>
        <p className="type-caption text-muted-foreground">{t("about.code")}</p>
        <p className="type-caption text-muted-foreground">{t("about.auto")}</p>
      </section>
    </div>
  );
}

/** A column name for stacked rows (below md the header row is hidden). */
function Hidden({ label }: { label: string }) {
  return <span className="sr-only md:hidden">{`${label} `}</span>;
}

/** "Marta K." → "MK"; no name shows a neutral mark. */
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
