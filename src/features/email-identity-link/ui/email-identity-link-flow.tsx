"use client";

import {
  CheckIcon,
  ClockIcon,
  LockIcon,
  MailIcon,
  RefreshCwIcon,
  ShieldIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type FormEvent } from "react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { CODE_LENGTH, CodeInput } from "@/shared/ui/code-input";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";
import { textLinkClass } from "@/shared/ui/text-link";

import { cellsFor, formatCountdown, type CodeStatus, type EmailStatus } from "../model/link";
import { useEmailIdentityLink } from "../model/use-email-identity-link";

/*
 * Verify an email and add it to this account (SF-78 on SF-77; Claude Design
 * WFI1 `link-*` states, version 1792666334-7310). Email → 6-digit code →
 * verified. The signed-in account stays the same; nothing else happens here:
 * no invitation is accepted, no account is created or merged.
 *
 * The flow is self-contained so the invitation page (and later Sign-in &
 * security) can host it: the host decides what "done", "cancel" and "switch
 * account" do.
 */

type Tone = "olive" | "amber" | "coral";

const EMAIL_NOTICES: Partial<Record<EmailStatus, Tone>> = {
  limited: "amber",
  error: "coral",
};

const CODE_NOTICES: Record<CodeStatus, { tone: Tone; icon: LucideIcon } | undefined> = {
  sent: { tone: "olive", icon: MailIcon },
  typing: undefined,
  resent: { tone: "olive", icon: RefreshCwIcon },
  invalid: { tone: "coral", icon: TriangleAlertIcon },
  expired: { tone: "amber", icon: ClockIcon },
  submitting: undefined,
  throttled: { tone: "coral", icon: TriangleAlertIcon },
  conflict: { tone: "coral", icon: LockIcon },
  session: { tone: "amber", icon: LockIcon },
  error: { tone: "coral", icon: TriangleAlertIcon },
};

export type EmailIdentityLinkFlowProps = {
  /** "Back to the invitation" after the email was verified. */
  onDone: () => void;
  /** Leave the flow without verifying. */
  onCancel: () => void;
  /** Sign out to use another account (offered after a conflict). */
  onSwitchAccount: () => void;
  /** Sign in again after the session ended. */
  onSignIn: () => void;
  /** Label of the way back (`onCancel` / `onDone`), e.g. "Back to the invitation". */
  backLabel: string;
  /** What comes next, shown after the email was verified (the host's wording). */
  doneHint?: string;
  className?: string;
};

export function EmailIdentityLinkFlow({
  onDone,
  onCancel,
  onSwitchAccount,
  onSignIn,
  backLabel,
  doneHint,
  className,
}: EmailIdentityLinkFlowProps) {
  const link = useEmailIdentityLink();
  const state = link.state;

  return (
    <div
      data-slot="email-identity-link"
      className={cn(
        "flex flex-col gap-3 rounded-3xl border bg-surface px-5 py-4",
        state.step === "linked" && "border-accent-border",
        className,
      )}
    >
      {state.step === "email" && (
        <EmailStep link={link} status={state.status} onCancel={onCancel} backLabel={backLabel} />
      )}
      {state.step === "code" && (
        <CodeStep
          link={link}
          status={state.status}
          onCancel={onCancel}
          onSwitchAccount={onSwitchAccount}
          onSignIn={onSignIn}
          backLabel={backLabel}
        />
      )}
      {state.step === "linked" && (
        <Linked
          outcome={state.outcome}
          email={state.email}
          backLabel={backLabel}
          hint={doneHint}
          onDone={() => {
            link.reset();
            onDone();
          }}
        />
      )}
    </div>
  );
}

type Link = ReturnType<typeof useEmailIdentityLink>;

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="type-h3 text-balance">{children}</h2>;
}

function EmailStep({
  link,
  status,
  onCancel,
  backLabel,
}: {
  link: Link;
  status: EmailStatus;
  onCancel: () => void;
  backLabel: string;
}) {
  const t = useTranslations("emailIdentityLink");
  const id = useId();
  const sending = status === "sending";
  const notice = EMAIL_NOTICES[status];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void link.request();
  }

  return (
    <>
      <p className="type-label text-highlight">{t("eyebrow")}</p>
      <Heading>{t("email.title")}</Heading>
      <p className="type-body text-pretty text-muted-foreground">{t("email.body")}</p>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-email`} className="type-caption font-bold text-muted-foreground">
            {t("email.label")}
          </label>
          <Input
            id={`${id}-email`}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            fieldSize="lg"
            required
            autoFocus
            placeholder={t("email.placeholder")}
            value={link.email}
            readOnly={sending}
            onChange={(event) => link.changeEmail(event.target.value)}
            aria-invalid={status === "invalid" || undefined}
            aria-describedby={status === "invalid" ? `${id}-error` : undefined}
          />
          {status === "invalid" && (
            <p id={`${id}-error`} role="alert" className="type-caption font-bold text-destructive">
              {t("email.invalid")}
            </p>
          )}
        </div>
        {notice && (
          <Notice tone={notice} icon={TriangleAlertIcon} role="alert">
            {t(`email.${status as "limited" | "error"}`)}
          </Notice>
        )}
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" size="lg" loading={sending}>
            {sending ? t("email.sending") : t("email.send")}
          </Button>
          <Button type="button" size="lg" variant="quiet" onClick={onCancel} disabled={sending}>
            {backLabel}
          </Button>
        </div>
      </form>
      <p className="type-caption text-faint-foreground">{t("email.note")}</p>
    </>
  );
}

function CodeStep({
  link,
  status,
  onCancel,
  onSwitchAccount,
  onSignIn,
  backLabel,
}: {
  link: Link;
  status: CodeStatus;
  onCancel: () => void;
  onSwitchAccount: () => void;
  onSignIn: () => void;
  backLabel: string;
}) {
  const t = useTranslations("emailIdentityLink");
  const notice = CODE_NOTICES[status];
  const message = notice ? t(`code.notices.${status}` as "code.notices.sent") : "";
  const submitting = status === "submitting";
  const terminal = status === "conflict" || status === "session";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "expired") void link.resend();
    else if (status === "error") void link.retry();
    else void link.confirm(link.code);
  }

  const primary =
    status === "expired"
      ? t("code.sendNewCode")
      : status === "error"
        ? t("code.tryAgain")
        : submitting
          ? t("code.submitting")
          : t("code.submit");

  return (
    <>
      <p className="type-label text-highlight">{t("eyebrow")}</p>
      <Heading>{t("code.title")}</Heading>
      <p className="type-body text-pretty text-muted-foreground">
        {t.rich("code.body", {
          email: link.sentTo,
          minutes: link.expiresInMinutes,
          b: (chunks) => <b className="font-bold break-all text-foreground">{chunks}</b>,
        })}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {!terminal && (
          <CodeInput
            label={t("code.label")}
            value={link.code}
            onChange={link.changeCode}
            onComplete={(value) => void link.confirm(value)}
            state={cellsFor(status, link.code)}
            autoFocus
          />
        )}
        {/* One polite live region announces every status; the visible box is not read twice. */}
        <p role="status" aria-live="polite" className="sr-only">
          {message}
        </p>
        {notice && (
          <Notice tone={notice.tone} icon={notice.icon} aria-hidden>
            {message}
          </Notice>
        )}
        <div className="flex flex-wrap gap-2.5">
          {/* Distinct keys: a button never morphs (and colour-transitions) into another. */}
          {status === "conflict" ? (
            <>
              <Button
                key="switch"
                type="button"
                size="lg"
                variant="quiet"
                onClick={onSwitchAccount}
              >
                {t("code.switchAccount")}
              </Button>
              <Button key="back" type="button" size="lg" variant="quiet" onClick={onCancel}>
                {backLabel}
              </Button>
            </>
          ) : status === "session" ? (
            <Button key="sign-in" type="button" size="lg" onClick={onSignIn}>
              {t("code.signIn")}
            </Button>
          ) : (
            <Button
              key="submit"
              type="submit"
              size="lg"
              loading={submitting}
              disabled={
                status === "throttled" ||
                (!["expired", "error"].includes(status) && link.code.length !== CODE_LENGTH)
              }
            >
              {primary}
            </Button>
          )}
        </div>
      </form>
      {!terminal && (
        <>
          <div className="flex items-center gap-2.5 type-body-sm">
            <span className="text-muted-foreground">{t("code.didntGetIt")}</span>
            <span className="flex-1" />
            <Resend link={link} status={status} />
          </div>
          <p className="type-body-sm text-faint-foreground">
            {t.rich("code.wrongEmail", {
              link: (chunks) => (
                <button
                  type="button"
                  className={textLinkClass}
                  onClick={link.chooseDifferentEmail}
                  disabled={submitting}
                >
                  {chunks}
                </button>
              ),
            })}
          </p>
        </>
      )}
      <Notice tone="muted" icon={ShieldIcon}>
        {t("code.neverShare")}
      </Notice>
    </>
  );
}

function Resend({ link, status }: { link: Link; status: CodeStatus }) {
  const t = useTranslations("emailIdentityLink.code");
  if (status === "throttled") {
    return <span className="type-body-sm text-faint-foreground">{t("resendUnavailable")}</span>;
  }
  if (link.canResend) {
    return (
      <button
        type="button"
        className={cn("type-body-sm", textLinkClass)}
        onClick={() => void link.resend()}
      >
        {t("sendNewCode")}
      </button>
    );
  }
  // The countdown is not a live region: it would announce every second.
  return (
    <span className="type-body-sm text-faint-foreground tabular-nums">
      {t("resendIn", { time: formatCountdown(link.secondsUntilResend) })}
    </span>
  );
}

function Linked({
  outcome,
  email,
  backLabel,
  hint,
  onDone,
}: {
  outcome: "linked" | "already_linked";
  email: string;
  backLabel: string;
  hint: string | undefined;
  onDone: () => void;
}) {
  const t = useTranslations("emailIdentityLink.linked");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const key = outcome === "linked" ? "new" : "already";

  return (
    <div role="status" className="flex flex-col gap-3">
      <p className="flex items-center gap-2 type-label text-highlight">
        <CheckIcon aria-hidden className="size-3.5" />
        {t("eyebrow")}
      </p>
      <h2 ref={heading} tabIndex={-1} className="type-h3 text-balance outline-none">
        {t(`${key}.title`)}
      </h2>
      <p className="type-body text-pretty text-muted-foreground">
        {t.rich(`${key}.body`, {
          email,
          b: (chunks) => <b className="font-bold break-all text-foreground">{chunks}</b>,
        })}
        {hint && ` ${hint}`}
      </p>
      <Button size="lg" className="self-start" onClick={onDone}>
        {backLabel}
      </Button>
    </div>
  );
}
