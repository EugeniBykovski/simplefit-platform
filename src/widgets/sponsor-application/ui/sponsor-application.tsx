"use client";

import { MailIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { restoreSession, signOut, useSession } from "@/entities/session";
import {
  useSponsorApplication,
  useSponsorApplicationActions,
  useSponsorApplicationPolicy,
  useSponsorMemberships,
  type SponsorApplication,
  type SponsorApplicationPolicy,
} from "@/entities/sponsor-application";
import { useEntry } from "@/features/session-gate";
import { AppleSignInButton } from "@/features/sign-in-with-apple";
import { GoogleSignInButton } from "@/features/sign-in-with-google";
import {
  isEditable,
  isStep,
  resumeStep,
  SponsorApplicationForm,
  type StepKey,
} from "@/features/sponsor-application-form";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { withContinuation } from "@/shared/routes/continuation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import { textLinkClass } from "@/shared/ui/text-link";

import { EntryPanel, StatusPanel, SubmittedPanel, type EntryState } from "./panels";

/*
 * The sponsor application journey on `web.partners.apply` (SF-115; Claude
 * Design SPA0, SPA1 / SP1–SP7 and review, SP9, SPX5). `?step=` selects the
 * screen: `start` (SPA0), the eight form steps, `submitted` (SP9) and
 * `status` (SPX5). The session and the backend's application decide what
 * may show; the URL is corrected to match, never trusted:
 *
 * - no session: SPA0 asks to sign in, returning here (`returnTo`);
 * - the account needs registering first (the entry resolver says so): SPA0
 *   links to account registration with the same continuation;
 * - no application yet: SPA0 "ready", then the form; the first save
 *   creates the draft (nothing is created by visiting or signing in);
 * - a draft (or answers to correct after a change request): the form;
 * - anything else: its status. Never a workspace: an application grants no
 *   Sponsor organization, membership or capability in any status.
 *
 * Everything below the session is keyed by the signed-in user, so another
 * account never sees this one's form state (the query cache is cleared at
 * the session boundary by the app providers).
 */

type View = "start" | StepKey | "submitted" | "status";
const VIEWS: readonly string[] = ["start", "submitted", "status"];
const isView = (value: string | null): value is View =>
  value !== null && (VIEWS.includes(value) || isStep(value));

const hrefFor = (view: View) => routeHref("web.partners.apply", {}, { step: view });

export function SponsorApplicationFlow() {
  const session = useSession();
  const searchParams = useSearchParams();
  const requested = searchParams.get("step");
  const view: View = isView(requested) ? requested : "start";
  // Where sign-in and account registration return: this screen, validated again on arrival.
  const continuation = useMemo(() => ({ returnTo: hrefFor(view) }), [view]);

  let body: ReactNode;
  if (session.status === "loading") {
    body = <Pending />;
  } else if (session.status === "unavailable") {
    body = <EntryPanel state="error" actions={<Retry onRetry={() => void restoreSession()} />} />;
  } else if (session.status === "anonymous") {
    body = (
      <EntryPanel
        state={session.ended === "expired" ? "expired" : "signed_out"}
        actions={<SignInMethods continuation={continuation} />}
      />
    );
  } else {
    body = (
      <SignedIn
        key={session.viewer?.id}
        view={view}
        requested={requested}
        continuation={continuation}
      />
    );
  }

  return <Frame>{body}</Frame>;
}

/** The page band under the site header: the application's own label and padding. */
function Frame({ children }: { children: ReactNode }) {
  const t = useTranslations("sponsorApplication");
  return (
    <div className="mx-auto flex w-full max-w-[1568px] flex-col gap-8 px-4 py-10 sm:px-6 lg:px-16">
      <div className="flex flex-wrap items-center gap-4">
        <p className="type-label text-faint-foreground">{t("frameLabel")}</p>
        <span className="flex-1" />
        <Link href={routeHref("web.partners")} className={textLinkClass}>
          {t("about")}
        </Link>
      </div>
      {children}
    </div>
  );
}

function Pending() {
  const t = useTranslations("sponsorApplication");
  return (
    <div className="flex min-h-80 items-center justify-center">
      <Spinner label={t("loading")} className="size-6 text-muted-foreground" />
    </div>
  );
}

function Retry({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("sponsorApplication.entry");
  return (
    <Button type="button" size="lg" onClick={onRetry} className="w-full sm:w-fit">
      {t("retry")}
    </Button>
  );
}

/** SPA0's sign-in methods: Google and Apple here; email through the sign-in page. Both return here. */
function SignInMethods({ continuation }: { continuation: { returnTo: string } }) {
  const t = useTranslations("sponsorApplication.entry");
  return (
    <>
      <GoogleSignInButton className="min-h-13" />
      <AppleSignInButton className="h-13" />
      <Button asChild variant="quiet" size="lg" className="h-12.5">
        <Link href={withContinuation("web.login", continuation)}>
          <MailIcon aria-hidden />
          {t("email")}
        </Link>
      </Button>
      <p className="type-caption text-muted-foreground">{t("signInNote")}</p>
    </>
  );
}

function SignedIn({
  view,
  requested,
  continuation,
}: {
  view: View;
  requested: string | null;
  continuation: { returnTo: string };
}) {
  const t = useTranslations("sponsorApplication");
  const router = useRouter();
  const entry = useEntry({});
  const registration = entry.data?.destination === "account_registration";
  const ready = entry.isSuccess && !registration;
  const application = useSponsorApplication(ready);
  const policy = useSponsorApplicationPolicy(ready);
  const memberships = useSponsorMemberships(ready && application.data === null);
  const actions = useSponsorApplicationActions();
  // SP9 shows only right after a confirmed submission (or its re-read).
  const [confirmed, setConfirmed] = useState<SponsorApplication | null>(null);

  const accountHref = withContinuation("web.app.onboarding.account", continuation);
  const app = application.data;
  const target =
    app === undefined || policy.data === undefined ? undefined : decide(view, app, confirmed);

  useEffect(() => {
    if (target !== undefined && target !== requested) router.replace(hrefFor(target));
  }, [target, requested, router]);

  // A new screen moves focus to its heading (not on the first render).
  const shown = useRef<View | undefined>(undefined);
  useEffect(() => {
    if (target === undefined) return;
    if (shown.current !== undefined && shown.current !== target) {
      document.querySelector<HTMLElement>("h1[tabindex='-1']")?.focus();
    }
    shown.current = target;
  }, [target]);

  const go = useCallback((next: View) => router.push(hrefFor(next)), [router]);
  const sessionEnded = useCallback(() => void restoreSession(), []);

  if (entry.isError || application.isError || policy.isError) {
    return (
      <EntryPanel
        state="error"
        actions={
          <Retry
            onRetry={() => {
              void entry.refetch();
              void application.refetch();
              void policy.refetch();
            }}
          />
        }
      />
    );
  }
  if (registration) {
    return (
      <EntryPanel
        state="registration"
        actions={
          <Button asChild size="lg" className="w-full sm:w-fit">
            <Link href={accountHref}>{t("entry.finishAccount")}</Link>
          </Button>
        }
      />
    );
  }
  if (app === undefined || policy.data === undefined || target === undefined || target !== view) {
    return <Pending />;
  }

  if (target === "start") {
    return (
      <Start application={app} policy={policy.data} members={memberships.data ?? 0} onGo={go} />
    );
  }
  if (target === "submitted" && app !== null) {
    return (
      <SubmittedPanel
        application={app}
        actions={
          <>
            <Button asChild size="lg">
              <Link href={hrefFor("status")}>{t("submitted.view")}</Link>
            </Button>
            <Button asChild size="lg" variant="quiet">
              <Link href={routeHref("web.root")}>{t("submitted.back")}</Link>
            </Button>
          </>
        }
      />
    );
  }
  if (target === "status" && app !== null) {
    return (
      <StatusPanel
        application={app}
        policy={policy.data}
        actions={<StatusActions application={app} policy={policy.data} onGo={go} />}
      />
    );
  }
  if (isStep(target)) {
    return (
      <SponsorApplicationForm
        application={app}
        policy={policy.data}
        step={target}
        actions={actions}
        onStep={go}
        onSubmitted={(submitted) => {
          setConfirmed(submitted);
          go("submitted");
        }}
        onExit={() => router.push(routeHref("web.partners"))}
        onSessionEnded={sessionEnded}
        accountHref={accountHref}
        statusHref={hrefFor("status")}
        renderLink={(href, children, className) => (
          <Link href={href} className={className}>
            {children}
          </Link>
        )}
      />
    );
  }
  return <Pending />;
}

/**
 * The screen the backend's application allows for the requested one:
 * the form only while answers can be edited, SP9 only after a submission
 * confirmed in this page, the status for everything else.
 */
export function decide(
  view: View,
  application: SponsorApplication | null,
  confirmed: SponsorApplication | null,
): View {
  if (view === "start") return "start";
  if (application === null) return isStep(view) ? view : "start";
  if (view === "submitted") {
    return confirmed !== null && !isEditable(application) ? "submitted" : "status";
  }
  if (view === "status") return "status";
  return isEditable(application) ? view : "status";
}

/** SPA0 for a signed-in account: start, resume, already applied, or already a partner. */
function Start({
  application,
  policy,
  members,
  onGo,
}: {
  application: SponsorApplication | null;
  policy: SponsorApplicationPolicy;
  members: number;
  onGo: (view: View) => void;
}) {
  const t = useTranslations("sponsorApplication.entry");
  const [leaving, setLeaving] = useState(false);
  const another = (
    <Button
      type="button"
      size="lg"
      variant="quiet"
      loading={leaving}
      className="w-full sm:w-fit"
      onClick={() => {
        setLeaving(true);
        void signOut().finally(() => setLeaving(false));
      }}
    >
      {t("anotherAccount")}
    </Button>
  );

  let state: EntryState;
  let actions: ReactNode;
  if (application === null && members > 0) {
    state = "member";
    actions = (
      <>
        <Button asChild size="lg" className="w-full sm:w-fit">
          {/* The entry resolver picks the organization (one, the remembered one, or the chooser). */}
          <Link href={routeHref("web.app", {}, { intent: "sponsor" })}>{t("openWorkspace")}</Link>
        </Button>
        <Button
          type="button"
          size="lg"
          variant="quiet"
          className="w-full sm:w-fit"
          onClick={() => onGo("company")}
        >
          {t("applyAnother")}
        </Button>
      </>
    );
  } else if (application === null) {
    state = "ready";
    actions = (
      <>
        <Button type="button" size="lg" className="w-full sm:w-fit" onClick={() => onGo("company")}>
          {t("start")}
        </Button>
        {another}
      </>
    );
  } else if (isEditable(application) && application.status === "draft") {
    state = "resume";
    actions = (
      <>
        <Button
          type="button"
          size="lg"
          className="w-full sm:w-fit"
          onClick={() => onGo(resumeStep(application, policy))}
        >
          {t("continue")}
        </Button>
        {another}
      </>
    );
  } else {
    state = "exists";
    actions = (
      <Button type="button" size="lg" className="w-full sm:w-fit" onClick={() => onGo("status")}>
        {t("view")}
      </Button>
    );
  }
  return <EntryPanel state={state} actions={actions} />;
}

function StatusActions({
  application,
  policy,
  onGo,
}: {
  application: SponsorApplication;
  policy: SponsorApplicationPolicy;
  onGo: (view: View) => void;
}) {
  const t = useTranslations("sponsorApplication.status");
  if (isEditable(application)) {
    return (
      <Button type="button" size="lg" onClick={() => onGo(resumeStep(application, policy))}>
        {application.status === "changes_requested" ? t("update") : t("continue")}
      </Button>
    );
  }
  if (application.status === "approved" && application.sponsor_id !== null) {
    return (
      <Button asChild size="lg">
        <Link href={routeHref("web.sponsor.dashboard", { sponsorId: application.sponsor_id })}>
          {t("openWorkspace")}
        </Link>
      </Button>
    );
  }
  return null;
}
