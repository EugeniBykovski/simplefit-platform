"use client";

import { Link2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Link, useRouter } from "@/shared/i18n/navigation";
import { withReturnTo } from "@/shared/routes/return-to";
import { Button } from "@/shared/ui/button";
import { CODE_LENGTH, CodeInput } from "@/shared/ui/code-input";
import { Notice } from "@/shared/ui/notice";
import { textLinkClass } from "@/shared/ui/text-link";

import {
  handOffToSignIn,
  registrationStatus,
  requestRegistrationCode,
  verifyRegistrationCode,
} from "../model/api";
import { EDITABLE, inputStateFor, requestFailureOf, type RequestFailure } from "../model/code-step";
import { pending, usePendingFlow, type PendingRegistration } from "../model/pending";
import { useCodeStep } from "../model/use-code-step";
import { ctaFor, ResendStatus, StatusNotice } from "./code-step-parts";
import { StepPending } from "./sign-in-code-step";

/**
 * WA4 "Verify your email" (email_verification): the code entered on the
 * registration device creates the account and the session. Without a pending
 * registration in this tab it goes back to the email step.
 */
export function RegistrationCodeStep({ returnTo }: { returnTo?: string }) {
  const flow = usePendingFlow("registration");
  const router = useRouter();

  useEffect(() => {
    if (flow === null) router.replace(withReturnTo("web.signup.account", returnTo));
  }, [flow, router, returnTo]);

  if (!flow) return <StepPending />;
  return <RegistrationCodeForm flow={flow} returnTo={returnTo} />;
}

export function RegistrationCodeForm({
  flow,
  returnTo,
}: {
  flow: PendingRegistration;
  returnTo?: string;
}) {
  const t = useTranslations("auth.code.registration");
  const code = useTranslations("auth.code");
  const email = useTranslations("auth.email");
  const router = useRouter();
  // The latest registration token: a resend replaces it.
  const token = useRef(flow.registrationToken);
  const [handingOff, setHandingOff] = useState(false);
  const [handOffFailure, setHandOffFailure] = useState<RequestFailure | undefined>();

  const step = useCodeStep({
    purpose: "registration",
    initialStatus: "typing",
    resendAt: flow.resendAt,
    verify: (value) => verifyRegistrationCode(token.current, value),
    resend: async () => {
      const next = await requestRegistrationCode(flow.email);
      token.current = next.registrationToken;
      return next.resendAt;
    },
    onVerified: () => pending.clear("registration"),
  });
  const { status, report } = step;

  // Back from the mail app: the link may have verified the address meanwhile.
  useEffect(() => {
    async function check() {
      if (document.visibilityState !== "visible" || !EDITABLE.has(status)) return;
      try {
        const current = await registrationStatus(token.current);
        if (current === "verified_elsewhere" || current === "completed") {
          report("verified-elsewhere");
        } else if (current === "expired") {
          report("expired");
        }
      } catch {
        // The next verification attempt reports the same outcome.
      }
    }
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [status, report]);

  /** verified_elsewhere: a NEW email_sign_in challenge for the same address (D8). */
  async function handOff() {
    if (handingOff) return;
    setHandingOff(true);
    setHandOffFailure(undefined);
    try {
      await handOffToSignIn(flow.email);
      router.push(withReturnTo("web.login.code", returnTo));
    } catch (error) {
      setHandOffFailure(requestFailureOf(error));
      setHandingOff(false);
    }
  }

  const cta = ctaFor(status, step.code.length === CODE_LENGTH);
  const final = status === "success" || status === "verified-elsewhere";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cta.action === "submit") void step.submit(step.code);
    else if (cta.action === "resend") void step.resend();
    else if (cta.action === "retry") void step.retry();
    else if (cta.action === "handoff") void handOff();
  }

  const signIn = withReturnTo("web.login", returnTo);

  return (
    <div className="flex flex-col gap-5">
      <p className="type-label text-highlight">{t("eyebrow")}</p>
      <h1 className="type-auth-title text-balance">{t("title")}</h1>
      <p className="type-body-lg text-pretty text-muted-foreground">
        {t.rich("description", {
          email: flow.email,
          b: (chunks) => <b className="font-bold text-foreground">{chunks}</b>,
        })}
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <CodeInput
          label={code("label")}
          value={step.code}
          onChange={step.changeCode}
          onComplete={(value) => void step.submit(value)}
          state={inputStateFor(status, step.code)}
          autoFocus
        />
        {/* WA4's 560 px message block: always present, as in the artboard. */}
        <div className="flex max-w-140 flex-col gap-5">
          <StatusNotice purpose="registration" status={status} email={flow.email} />
          {handOffFailure && (
            <p role="alert" className="type-caption font-bold text-destructive">
              {email(`errors.${handOffFailure}`)}
            </p>
          )}
          {status === "verified-elsewhere" && (
            <p className="type-body-sm text-faint-foreground">
              {t.rich("preferSignIn", {
                link: (chunks) => (
                  <Link href={signIn} className={textLinkClass}>
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="submit"
            size="xl"
            disabled={cta.disabled || handingOff}
            loading={status === "submitting" || status === "success" || handingOff}
          >
            {cta.label === "submit" || cta.label === "submitting"
              ? t(`cta.${cta.label}`)
              : code(`cta.${cta.label}`)}
          </Button>
          {!final && (
            <ResendStatus
              status={status}
              secondsUntilResend={step.secondsUntilResend}
              canResend={step.canResend}
              onResend={() => void step.resend()}
            />
          )}
        </div>
      </form>
      {!final && (
        <p className="type-body-sm text-faint-foreground">
          {t.rich("links", {
            change: (chunks) => (
              <Link href={withReturnTo("web.signup.account", returnTo)} className={textLinkClass}>
                {chunks}
              </Link>
            ),
            signIn: (chunks) => (
              <Link href={signIn} className={textLinkClass}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
      {!final && (
        <Notice tone="muted" icon={Link2Icon} className="max-w-140">
          {t.rich("linkInfo", { b: (chunks) => <b className="font-bold">{chunks}</b> })}
        </Notice>
      )}
    </div>
  );
}
