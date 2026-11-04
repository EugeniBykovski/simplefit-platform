"use client";

import { CheckIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useGym } from "@/entities/gym";
import {
  pendingStaffInvitation,
  usePendingStaffInvitation,
} from "@/entities/pending-staff-invitation";
import { signOut, useSession } from "@/entities/session";
import { EmailIdentityLinkFlow } from "@/features/email-identity-link";
import { useEntry } from "@/features/session-gate";
import {
  staffInvitationProblem,
  useStaffInvitationAnswer,
  useStaffInvitationPreview,
  useStaffInvitationRecipient,
  type StaffInvitationProblem,
  type StaffPreview,
  type StaffRecipientView,
} from "@/features/staff-invitation-response";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { withContinuation } from "@/shared/routes/continuation";
import { routeHref, webGuards } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";

/*
 * Gym staff invitation (`web.invite.staff`, SF-133): the page of the E06 link,
 * `/invite/staff#token=…` (SF-93). No web artboard exists: this is an interim
 * composition of the coach invitation page (WFI1) with the content of the
 * mobile boards OS1 and OS1b (Claude Design 1793198527-a0fc), documented in
 * docs/gym-console-web.md.
 *
 * - The token is read once from the fragment (which never reaches a server),
 *   the fragment is removed, and the token is kept for this tab only
 *   (`pendingStaffInvitation`); it is sent only in SF-93 request bodies.
 * - Anyone may see the anonymous preview. Answering needs a session, a complete
 *   account (sign-in and registration come back here through the token-free
 *   `returnTo`) and a verified email identity of the invited address. The
 *   backend decides all three; a Google or Apple sign-in alone does not count.
 * - Signed in, the page reads the viewer's own view of the invitation, so the
 *   recipient learns what became of it (expired, cancelled, declined, already
 *   accepted) and anyone else learns nothing.
 * - Opening the page accepts nothing: accepting and declining are explicit, and
 *   nothing is shown as done before the backend answers. An acceptance opens
 *   the console of the gym the backend answered; the design's location chip,
 *   "Sent to" before verification and scan/sell abilities have no contract.
 */

const CONTINUATION = { returnTo: "/invite/staff" };

type Outcome = { kind: "declined"; gym: string } | { kind: "unavailable" } | { kind: "entering" };

export function StaffInvitation() {
  const session = useSession();
  const viewer =
    session.status === "authenticated"
      ? (session.viewer?.id ?? null)
      : session.status === "anonymous"
        ? null
        : undefined;
  const token = usePendingStaffInvitation(viewer);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  if (outcome !== null) return <OutcomeView outcome={outcome} signedIn={viewer !== null} />;
  if (token === undefined) return <Loading />;
  if (token === null) return <Missing signedIn={viewer !== null} />;
  // The outcome first, then the token goes: one render, never a "no
  // invitation" flash in between.
  const finish = (next: Outcome) => {
    setOutcome(next);
    pendingStaffInvitation.clear();
  };
  return viewer === null ? (
    <Anonymous token={token} />
  ) : (
    <Recipient token={token} viewer={viewer ?? ""} onOutcome={finish} />
  );
}

function Column({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  const t = useTranslations("staffInvitation");
  return (
    <div
      className="mx-auto flex w-full max-w-140 flex-col gap-4 px-5 py-10"
      aria-busy={busy}
      data-staff-invitation
    >
      <p className="type-label text-faint-foreground">{t("eyebrow")}</p>
      {children}
    </div>
  );
}

function Loading() {
  const t = useTranslations("staffInvitation");
  return (
    <Column busy>
      <div role="status" aria-label={t("loading")} className="flex flex-col gap-3">
        <Skeleton className="h-10 w-4/5 rounded-xl" />
        <Skeleton className="h-44 rounded-3xl" />
      </div>
    </Column>
  );
}

/** A final page: its heading takes the focus, so the change is announced. */
function Final({
  state,
  title,
  body,
  children,
}: {
  state: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <Column>
      <div role="status" className="flex flex-col gap-3" data-invitation-state={state}>
        <h1 ref={heading} tabIndex={-1} className="type-h2 font-display outline-none">
          {title}
        </h1>
        <p className="type-body text-muted-foreground">{body}</p>
      </div>
      {children}
    </Column>
  );
}

function EntryAction({ signedIn, primary = false }: { signedIn: boolean; primary?: boolean }) {
  const t = useTranslations("staffInvitation");
  return (
    <Button asChild variant={primary ? "primary" : "quiet"} className="self-start">
      <Link href={routeHref(signedIn ? webGuards.entry : "web.root")}>
        {t(signedIn ? "actions.home" : "actions.site")}
      </Link>
    </Button>
  );
}

function Missing({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("staffInvitation.missing");
  return (
    <Final state="missing" title={t("title")} body={t("body")}>
      <EntryAction signedIn={signedIn} />
    </Final>
  );
}

function OutcomeView({ outcome, signedIn }: { outcome: Outcome; signedIn: boolean }) {
  const t = useTranslations("staffInvitation.states");
  const entering = useTranslations("staffInvitation");
  // Accepted: the console of the gym is on its way (the page replaces this).
  if (outcome.kind === "entering") {
    return (
      <Column busy>
        <Spinner label={entering("entering")} />
      </Column>
    );
  }
  return outcome.kind === "declined" ? (
    <Final
      state="declined"
      title={t("declined.title")}
      body={t("declined.justNow", { gym: outcome.gym })}
    >
      <EntryAction signedIn={signedIn} />
    </Final>
  ) : (
    <Final state="unavailable" title={t("unavailable.title")} body={t("unavailable.body")}>
      <EntryAction signedIn={signedIn} />
    </Final>
  );
}

/** The gym, the role and who invited, from the preview or the recipient's view. */
function Summary({
  invitation,
  sentTo,
}: {
  invitation: Pick<StaffPreview, "role" | "invited_by" | "expires_at" | "gym">;
  sentTo?: string | null;
}) {
  const t = useTranslations("staffInvitation");
  const format = useFormatter();
  const role = invitation.role;
  return (
    <>
      <h1 className="type-h2 font-display">{t("title", { gym: invitation.gym.name ?? "" })}</h1>
      <div className="flex flex-col gap-3 rounded-3xl border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="type-body-sm text-muted-foreground">{t("joinAs")}</span>
          <Badge variant="accent" data-invited-role={role}>
            {t(`roles.${role}`)}
          </Badge>
        </div>
        <dl className="flex flex-col gap-2 border-t pt-3 type-body-sm">
          {invitation.invited_by.first_name && (
            <Row label={t("invitedBy")}>
              {invitation.invited_by.role
                ? t("inviter", {
                    name: invitation.invited_by.first_name,
                    role: t(`roles.${invitation.invited_by.role}`),
                  })
                : invitation.invited_by.first_name}
            </Row>
          )}
          {sentTo && <Row label={t("sentTo")}>{sentTo}</Row>}
          <Row label={t("expires")}>{format.dateTime(new Date(invitation.expires_at), "date")}</Row>
        </dl>
      </div>
      <section
        aria-labelledby="staff-invitation-abilities"
        className="flex flex-col gap-2 rounded-3xl border bg-surface px-5 py-4"
      >
        <h2 id="staff-invitation-abilities" className="type-label text-faint-foreground">
          {t("abilities.title")}
        </h2>
        <ul className="flex flex-col gap-1.5 type-body-sm">
          {(role === "manager"
            ? (["edit", "invite", "team"] as const)
            : (["workspace", "team"] as const)
          ).map((ability) => (
            <li key={ability} className="flex items-start gap-2">
              <CheckIcon aria-hidden className="mt-0.5 size-4 flex-none text-highlight" />
              {t(`abilities.${ability}`)}
            </li>
          ))}
        </ul>
        <p className="type-caption text-faint-foreground">{t("abilities.private")}</p>
      </section>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <dt className="font-extrabold">{label}</dt>
      <dd className="min-w-0 break-words text-muted-foreground">{children}</dd>
    </div>
  );
}

function Problem({ problem, onRetry }: { problem: "limited" | "failed"; onRetry: () => void }) {
  const t = useTranslations("staffInvitation.problems");
  const actions = useTranslations("staffInvitation.actions");
  return (
    <div className="flex flex-col items-start gap-3" data-invitation-problem={problem}>
      <Notice tone={problem === "limited" ? "amber" : "coral"} role="alert">
        <strong>{t(`${problem}.title`)}</strong> {t(`${problem}.body`)}
      </Notice>
      <Button variant="quiet" onClick={onRetry}>
        {actions("retry")}
      </Button>
    </div>
  );
}

function SignInActions() {
  const t = useTranslations("staffInvitation.signedOut");
  return (
    <div className="flex flex-wrap gap-2.5">
      <Button asChild>
        <Link href={withContinuation("web.login", CONTINUATION)}>{t("signIn")}</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href={withContinuation("web.signup.account", CONTINUATION)}>{t("signUp")}</Link>
      </Button>
    </div>
  );
}

/** Signed out: the anonymous preview, and the way to sign in. */
function Anonymous({ token }: { token: string }) {
  const t = useTranslations("staffInvitation");
  const preview = useStaffInvitationPreview(token);

  if (preview.isError) {
    const problem = staffInvitationProblem(preview.error);
    if (problem === "unavailable") {
      // A used or cancelled link says the same as a wrong one to an anonymous
      // holder; its recipient learns more after signing in.
      return (
        <Final
          state="unavailable"
          title={t("states.unavailable.title")}
          body={t("states.unavailable.signedOut")}
        >
          <SignInActions />
        </Final>
      );
    }
    return (
      <Column>
        <Problem
          problem={problem === "limited" ? "limited" : "failed"}
          onRetry={() => void preview.refetch()}
        />
      </Column>
    );
  }
  if (preview.data === undefined) return <Loading />;

  return (
    <Column>
      <Summary invitation={preview.data} />
      <div className="flex flex-col gap-3" data-invitation-state="signed-out">
        <p className="type-body-sm text-muted-foreground">{t("signedOut.body")}</p>
        <SignInActions />
      </div>
    </Column>
  );
}

/** Signed in: the viewer's own view of the invitation decides what the page offers. */
function Recipient({
  token,
  viewer,
  onOutcome,
}: {
  token: string;
  viewer: string;
  onOutcome: (outcome: Outcome) => void;
}) {
  const recipient = useStaffInvitationRecipient(token, viewer);

  if (recipient.isError) {
    const problem = staffInvitationProblem(recipient.error);
    if (problem === "mismatch") {
      return <WrongAccount token={token} onVerified={() => void recipient.refetch()} />;
    }
    if (problem === "unavailable")
      return <OutcomeView outcome={{ kind: "unavailable" }} signedIn />;
    // `session`: the session boundary is already dropping the token.
    if (problem === "session") return <Loading />;
    return (
      <Column>
        <Problem
          problem={problem === "limited" ? "limited" : "failed"}
          onRetry={() => void recipient.refetch()}
        />
      </Column>
    );
  }
  if (recipient.data === undefined) return <Loading />;

  const invitation = recipient.data;
  switch (invitation.status) {
    case "pending":
      return (
        <Respond
          token={token}
          invitation={invitation}
          onStale={() => recipient.refetch()}
          onOutcome={onOutcome}
        />
      );
    case "accepted":
      return <AlreadyAccepted invitation={invitation} />;
    default:
      return <Ended invitation={invitation} />;
  }
}

function Ended({ invitation }: { invitation: StaffRecipientView }) {
  const t = useTranslations("staffInvitation.states");
  const status = invitation.status as "declined" | "cancelled" | "expired";
  const gym = invitation.gym.name ?? "";
  return (
    <Final state={status} title={t(`${status}.title`)} body={t(`${status}.body`, { gym })}>
      <EntryAction signedIn />
    </Final>
  );
}

/**
 * Accepted by this person earlier (a lost answer, another tab): the backend
 * says whether the gym is still theirs (a removal ended the membership).
 */
function AlreadyAccepted({ invitation }: { invitation: StaffRecipientView }) {
  const t = useTranslations("staffInvitation.states");
  const gymId = invitation.gym.gym_id;
  const gym = useGym(gymId);
  const name = invitation.gym.name ?? "";

  if (gym.isPending) return <Loading />;
  if (gym.isError) {
    return (
      <Final
        state="access-ended"
        title={t("accessEnded.title")}
        body={t("accessEnded.body", { gym: name })}
      >
        <EntryAction signedIn />
      </Final>
    );
  }
  return (
    <Final
      state="already-accepted"
      title={t("accepted.title", { gym: name })}
      body={t("accepted.body")}
    >
      <Button asChild className="self-start">
        <Link href={routeHref("web.app.gyms._gym-id", { gymId })}>{t("accepted.action")}</Link>
      </Button>
    </Final>
  );
}

/**
 * A current invitation for another address: the viewer verifies that address
 * on this account (the same user, no new account, nothing merged) or uses the
 * account that owns it. Nothing tells them which address it is.
 */
function WrongAccount({ token, onVerified }: { token: string; onVerified: () => void }) {
  const t = useTranslations("staffInvitation");
  const router = useRouter();
  const preview = useStaffInvitationPreview(token);
  const [linking, setLinking] = useState(false);

  return (
    <Column>
      {preview.data !== undefined && <Summary invitation={preview.data} />}
      {linking ? (
        <EmailIdentityLinkFlow
          backLabel={t("backToInvitation")}
          doneHint={t("linkDoneHint")}
          onDone={() => {
            setLinking(false);
            onVerified();
          }}
          onCancel={() => setLinking(false)}
          onSwitchAccount={() => void signOut()}
          onSignIn={() => router.push(withContinuation("web.login", CONTINUATION))}
        />
      ) : (
        <div className="flex flex-col items-start gap-3" data-invitation-state="wrong-account">
          <Notice tone="amber" role="status">
            <strong>{t("mismatch.title")}</strong> {t("mismatch.body")}
          </Notice>
          <div className="flex flex-wrap gap-2.5">
            <Button onClick={() => setLinking(true)}>{t("mismatch.verify")}</Button>
            <Button variant="quiet" onClick={() => void signOut()}>
              {t("mismatch.switch")}
            </Button>
          </div>
        </div>
      )}
    </Column>
  );
}

function Respond({
  token,
  invitation,
  onStale,
  onOutcome,
}: {
  token: string;
  invitation: StaffRecipientView;
  onStale: () => Promise<unknown>;
  onOutcome: (outcome: Outcome) => void;
}) {
  const t = useTranslations("staffInvitation");
  const router = useRouter();
  const entry = useEntry({});
  const { accept, decline } = useStaffInvitationAnswer(token);
  const [problem, setProblem] = useState<StaffInvitationProblem | null>(null);
  const [declining, setDeclining] = useState(false);
  const confirm = useRef<HTMLButtonElement>(null);
  const gym = invitation.gym.name ?? "";
  const pending = accept.isPending || decline.isPending;

  useEffect(() => {
    if (declining) confirm.current?.focus();
  }, [declining]);

  const summary = <Summary invitation={invitation} sentTo={invitation.sent_to} />;

  if (entry.isError) {
    return (
      <Column>
        {summary}
        <Problem problem="failed" onRetry={() => void entry.refetch()} />
      </Column>
    );
  }
  if (entry.data === undefined) {
    return (
      <Column>
        {summary}
        <Spinner label={t("checking")} />
      </Column>
    );
  }
  if (entry.data.account_registration !== "complete" || problem === "registration") {
    return (
      <Column>
        {summary}
        <div className="flex flex-col items-start gap-3" data-invitation-state="registration">
          <Notice tone="amber" role="status">
            <strong>{t("registration.title")}</strong> {t("registration.body")}
          </Notice>
          <Button asChild>
            <Link href={withContinuation(webGuards.entry, CONTINUATION)}>
              {t("registration.action")}
            </Link>
          </Button>
        </div>
      </Column>
    );
  }
  if (problem === "alreadyStaff") {
    return (
      <Final
        state="already-staff"
        title={t("states.alreadyStaff.title", { gym })}
        body={t("states.alreadyStaff.body")}
      >
        <Button asChild className="self-start">
          <Link href={routeHref("web.app.gyms._gym-id", { gymId: invitation.gym.gym_id })}>
            {t("states.accepted.action")}
          </Link>
        </Button>
      </Final>
    );
  }

  /** Any other refusal reads the invitation again: the backend says what it is now. */
  const fail = (error: unknown) => {
    const next = staffInvitationProblem(error);
    setDeclining(false);
    if (
      next === "limited" ||
      next === "failed" ||
      next === "registration" ||
      next === "alreadyStaff"
    ) {
      setProblem(next);
    }
    void onStale();
  };

  return (
    <Column>
      {summary}
      <div className="flex flex-col gap-3.5" data-invitation-state="pending">
        {(problem === "limited" || problem === "failed") && (
          <Notice tone={problem === "limited" ? "amber" : "coral"} role="alert">
            <strong>{t(`problems.${problem}.title`)}</strong> {t(`problems.${problem}.body`)}
          </Notice>
        )}
        {declining ? (
          <div className="flex flex-col gap-3" data-invitation-state="decline-confirm">
            <p className="type-body-sm">{t("decline.confirm", { gym })}</p>
            <div className="flex flex-wrap gap-2.5">
              <Button
                ref={confirm}
                variant="destructive"
                aria-busy={decline.isPending}
                disabled={pending}
                onClick={() => {
                  setProblem(null);
                  decline.mutate(undefined, {
                    onSuccess: () => onOutcome({ kind: "declined", gym }),
                    onError: fail,
                  });
                }}
              >
                {decline.isPending && <Spinner />}
                {decline.isPending ? t("decline.pending") : t("decline.action")}
              </Button>
              <Button variant="quiet" disabled={pending} onClick={() => setDeclining(false)}>
                {t("decline.keep")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2.5">
              <Button
                aria-busy={accept.isPending}
                disabled={pending}
                onClick={() => {
                  setProblem(null);
                  accept.mutate(undefined, {
                    onSuccess: (answer) => {
                      onOutcome({ kind: "entering" });
                      // The backend's gym, never one the page chose.
                      router.replace(routeHref("web.app.gyms._gym-id", { gymId: answer.gym_id }));
                    },
                    onError: fail,
                  });
                }}
              >
                {accept.isPending && <Spinner />}
                {accept.isPending ? t("accepting") : t("accept")}
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => setDeclining(true)}>
                {t("decline.action")}
              </Button>
            </div>
            <p className="type-caption text-faint-foreground">{t("acceptHint")}</p>
          </>
        )}
      </div>
    </Column>
  );
}
