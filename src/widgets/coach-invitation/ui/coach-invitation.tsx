"use client";

import { CheckIcon, MinusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import {
  pendingCoachInvitation,
  usePendingCoachInvitation,
} from "@/entities/pending-coach-invitation";
import { signOut, useSession } from "@/entities/session";
import {
  responseProblem,
  useInvitationPreview,
  useInvitationResponse,
  type InvitationPreview,
  type ResponseProblem,
} from "@/features/coach-invitation-response";
import { useEntry } from "@/features/session-gate";
import { Link } from "@/shared/i18n/navigation";
import { withContinuation } from "@/shared/routes/continuation";
import { routeHref, webGuards } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Notice } from "@/shared/ui/notice";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";

/*
 * WFI1 Coach invitation (`web.invite.coach`, SF-60; Claude Design
 * WebFighterInvite, version 1792151007-1d70): the page of the E08 link,
 * `/invite/coach#token=…` (SF-57).
 *
 * - The token is read once from the fragment (which never reaches a server),
 *   the fragment is removed, and the token is kept for this tab only
 *   (`pendingCoachInvitation`); it is sent only in SF-57 request bodies.
 * - Anyone may see the anonymous preview. Responding needs a session, a
 *   complete account and fighter profile (the entry decides; sign-in and
 *   onboarding come back here through the token-free `returnTo`), and the
 *   invited, verified email identity (the backend decides on submit).
 * - Accepting needs an explicit, unticked consent to the disclosure version
 *   the backend serves; nothing is ever accepted on the way through sign-in
 *   or onboarding, and nothing is shown as accepted or declined before the
 *   backend answers.
 */

const RETURN_TO = "/invite/coach";
const CONTINUATION = { returnTo: RETURN_TO, intent: "fighter" as const };

type Outcome =
  | { kind: "accepted"; existing: boolean; coach: string }
  | { kind: "declined"; coach: string }
  | { kind: "unavailable" };

export function CoachInvitation() {
  const session = useSession();
  const viewer =
    session.status === "authenticated"
      ? (session.viewer?.id ?? null)
      : session.status === "anonymous"
        ? null
        : undefined;
  const token = usePendingCoachInvitation(viewer);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  if (outcome !== null) return <OutcomeView outcome={outcome} />;
  if (token === undefined) return <Loading />;
  if (token === null) return <Missing signedIn={viewer !== null} />;
  // The outcome first, then the token goes: one render, never a "no
  // invitation" flash in between.
  const finish = (next: Outcome) => {
    setOutcome(next);
    pendingCoachInvitation.clear();
  };
  return <Invitation token={token} signedIn={viewer !== null} onOutcome={finish} />;
}

function Column({ children, busy = false }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-140 flex-col gap-4 px-5 py-10" aria-busy={busy}>
      {children}
    </div>
  );
}

function Eyebrow() {
  const t = useTranslations("coachInvitation");
  return <p className="type-label text-faint-foreground">{t("eyebrow")}</p>;
}

function Loading() {
  const t = useTranslations("coachInvitation");
  return (
    <Column busy>
      <Eyebrow />
      <div role="status" aria-label={t("loading")} className="flex flex-col gap-3">
        <Skeleton className="h-10 w-4/5 rounded-xl" />
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-48 rounded-3xl" />
      </div>
    </Column>
  );
}

function Missing({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("coachInvitation.missing");
  return (
    <Column>
      <Eyebrow />
      <h1 className="type-h2 font-display">{t("title")}</h1>
      <p className="type-body text-muted-foreground">{t("body")}</p>
      <Button asChild variant="quiet" className="self-start">
        <Link href={routeHref(signedIn ? webGuards.entry : "web.root")}>{t("action")}</Link>
      </Button>
    </Column>
  );
}

function OutcomeView({ outcome }: { outcome: Outcome }) {
  const t = useTranslations("coachInvitation.outcome");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  const [title, body, href, action] =
    outcome.kind === "accepted"
      ? [
          t(outcome.existing ? "already.title" : "accepted.title", { name: outcome.coach }),
          t(outcome.existing ? "already.body" : "accepted.body", { name: outcome.coach }),
          routeHref("web.app.coaches"),
          t("accepted.action"),
        ]
      : outcome.kind === "declined"
        ? [
            t("declined.title"),
            t("declined.body", { name: outcome.coach }),
            routeHref(webGuards.entry),
            t("declined.action"),
          ]
        : [
            t("unavailable.title"),
            t("unavailable.body"),
            routeHref("web.root"),
            t("unavailable.action"),
          ];

  return (
    <Column>
      <Eyebrow />
      <div role="status" className="flex flex-col gap-3">
        <h1 ref={heading} tabIndex={-1} className="type-h2 font-display outline-none">
          {title}
        </h1>
        <p className="type-body text-muted-foreground">{body}</p>
      </div>
      <Button
        asChild
        variant={outcome.kind === "accepted" ? "primary" : "quiet"}
        className="self-start"
      >
        <Link href={href}>{action}</Link>
      </Button>
    </Column>
  );
}

function Invitation({
  token,
  signedIn,
  onOutcome,
}: {
  token: string;
  signedIn: boolean;
  onOutcome: (outcome: Outcome) => void;
}) {
  const t = useTranslations("coachInvitation");
  const preview = useInvitationPreview(token);

  useEffect(() => {
    if (preview.isError && responseProblem(preview.error) === "unavailable") {
      onOutcome({ kind: "unavailable" });
    }
  }, [preview.isError, preview.error, onOutcome]);

  if (preview.isError) {
    const problem = responseProblem(preview.error);
    if (problem === "unavailable") return <Loading />;
    return (
      <Column>
        <Eyebrow />
        <Notice tone={problem === "limited" ? "amber" : "coral"} role="alert">
          <strong>
            {t(`problems.${problem === "limited" ? "limited" : "previewFailed"}.title`)}
          </strong>{" "}
          {t(`problems.${problem === "limited" ? "limited" : "previewFailed"}.body`)}
        </Notice>
        <Button variant="quiet" className="self-start" onClick={() => void preview.refetch()}>
          {t("retry")}
        </Button>
      </Column>
    );
  }
  if (preview.data === undefined) return <Loading />;

  return (
    <Column>
      <Eyebrow />
      <Summary preview={preview.data} />
      {signedIn ? (
        <Respond
          token={token}
          preview={preview.data}
          onStale={() => preview.refetch()}
          onOutcome={onOutcome}
        />
      ) : (
        <SignedOut />
      )}
    </Column>
  );
}

const coachOf = (preview: InvitationPreview, fallback: string) =>
  preview.invitation.coach.display_name ?? preview.invitation.coach.brand_name ?? fallback;

function Summary({ preview }: { preview: InvitationPreview }) {
  const t = useTranslations("coachInvitation");
  const fields = useTranslations("coachInvitation.fields");
  const never = useTranslations("coachInvitation.never");
  const format = useFormatter();
  const name = coachOf(preview, t("fallbackName"));
  const brand = preview.invitation.coach.display_name ? preview.invitation.coach.brand_name : null;
  const ids = { sees: useId(), never: useId() };

  return (
    <>
      <h1 className="type-h2 font-display">{t("title", { name })}</h1>
      <div className="flex flex-col gap-3 rounded-3xl border bg-surface px-5 py-4">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden
            className="flex size-12 flex-none items-center justify-center rounded-full bg-highlight type-caption font-display font-bold text-highlight-foreground"
          >
            {initials(name)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate type-body font-extrabold">{name}</span>
            {brand && <span className="type-body-sm text-muted-foreground">{brand}</span>}
          </div>
          <span className="type-label text-faint-foreground">
            {t("expires", {
              date: format.dateTime(new Date(preview.invitation.expires_at), "date"),
            })}
          </span>
        </div>
        {preview.invitation.message && (
          <p className="border-t pt-3 type-body-sm">
            {t("note", { note: preview.invitation.message, name })}
          </p>
        )}
      </div>
      <div className="grid gap-5 rounded-3xl border bg-surface px-5 py-4 sm:grid-cols-2">
        <section aria-labelledby={ids.sees} className="flex flex-col gap-2">
          <h2 id={ids.sees} className="type-label text-faint-foreground">
            {t("sees", { name })}
          </h2>
          <ul className="flex flex-col gap-1 type-body-sm">
            {preview.disclosure.fields.map((field) => (
              <li key={field} className="flex items-center gap-2">
                <CheckIcon aria-hidden className="size-4 text-highlight" />
                {fields(field)}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby={ids.never} className="flex flex-col gap-2">
          <h2 id={ids.never} className="type-label text-faint-foreground">
            {t("neverTitle")}
          </h2>
          <ul className="flex flex-col gap-1 type-body-sm text-muted-foreground">
            {preview.disclosure.never_shared.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <MinusIcon aria-hidden className="size-4" />
                {never(item)}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function SignedOut() {
  const t = useTranslations("coachInvitation.signedOut");
  return (
    <>
      <p className="type-body-sm text-muted-foreground">{t("body")}</p>
      <div className="flex flex-wrap gap-2.5">
        <Button asChild>
          <Link href={withContinuation("web.login", CONTINUATION)}>{t("signIn")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={withContinuation("web.signup", CONTINUATION)}>{t("signUp")}</Link>
        </Button>
      </div>
    </>
  );
}

function Respond({
  token,
  preview,
  onStale,
  onOutcome,
}: {
  token: string;
  preview: InvitationPreview;
  onStale: () => Promise<unknown>;
  onOutcome: (outcome: Outcome) => void;
}) {
  const t = useTranslations("coachInvitation");
  const entry = useEntry({ intent: "fighter" });
  const { accept, decline } = useInvitationResponse(token);
  const [agreed, setAgreed] = useState(false);
  const [problem, setProblem] = useState<ResponseProblem | null>(null);
  const consent = useId();
  const name = coachOf(preview, t("fallbackName"));
  const pending = accept.isPending || decline.isPending;

  if (entry.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Notice tone="coral" role="alert">
          {t("problems.failed.title")} {t("problems.failed.body")}
        </Notice>
        <Button variant="quiet" onClick={() => void entry.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (entry.data === undefined) {
    return <Spinner label={t("checking")} />;
  }
  const ready =
    entry.data.account_registration === "complete" && entry.data.fighter_profile === "completed";

  const fail = (error: unknown) => {
    const next = responseProblem(error);
    if (next === "unavailable") return onOutcome({ kind: "unavailable" });
    if (next === "stale") {
      setAgreed(false);
      void onStale();
    }
    setProblem(next);
  };

  if (!ready || problem === "profile") {
    return (
      <div className="flex flex-col items-start gap-3">
        <Notice tone="amber" role="status">
          <strong>{t("problems.profile.title")}</strong> {t("problems.profile.body")}
        </Notice>
        <Button asChild>
          <Link href={withContinuation(webGuards.entry, CONTINUATION)}>{t("continueSetup")}</Link>
        </Button>
      </div>
    );
  }

  if (problem === "mismatch") {
    return (
      <div className="flex flex-col items-start gap-3">
        <Notice tone="coral" role="alert">
          <strong>{t("problems.mismatch.title")}</strong> {t("problems.mismatch.body")}
        </Notice>
        <Button variant="quiet" onClick={() => void signOut()}>
          {t("switchAccount")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {problem !== null && (
        <Notice tone={problem === "failed" ? "coral" : "amber"} role="alert">
          <strong>{t(`problems.${problem}.title`)}</strong> {t(`problems.${problem}.body`)}
        </Notice>
      )}
      <label
        htmlFor={consent}
        className="flex items-start gap-3 rounded-2xl border px-4 py-3.5 type-body-sm"
      >
        <Checkbox
          id={consent}
          className="mt-0.5"
          checked={agreed}
          disabled={pending}
          onCheckedChange={(value) => setAgreed(value === true)}
        />
        <span className="flex flex-col gap-1">
          <span>{t("consent", { name })}</span>
          <span className="type-caption text-faint-foreground">
            {t("version", { version: preview.disclosure.version })}
          </span>
        </span>
      </label>
      <div className="flex flex-wrap gap-2.5">
        <Button
          aria-busy={accept.isPending}
          disabled={!agreed || pending}
          onClick={() => {
            setProblem(null);
            accept.mutate(preview.disclosure.version, {
              onSuccess: (response) =>
                onOutcome({
                  kind: "accepted",
                  existing: response.outcome === "already_connected",
                  coach: name,
                }),
              onError: fail,
            });
          }}
        >
          {accept.isPending && <Spinner />}
          {accept.isPending ? t("accepting") : t("accept")}
        </Button>
        <Button
          variant="outline"
          aria-busy={decline.isPending}
          disabled={pending}
          onClick={() => {
            setProblem(null);
            decline.mutate(undefined, {
              onSuccess: () => onOutcome({ kind: "declined", coach: name }),
              onError: fail,
            });
          }}
        >
          {decline.isPending && <Spinner />}
          {decline.isPending ? t("declining") : t("decline")}
        </Button>
      </div>
      <p className="type-caption text-faint-foreground">{t("acceptHint")}</p>
    </div>
  );
}

function initials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toUpperCase();
  return letters || "·";
}
