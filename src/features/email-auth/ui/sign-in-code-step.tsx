"use client";

import { ShieldIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, type FormEvent } from "react";

import { Link, useRouter } from "@/shared/i18n/navigation";
import { withContinuation, type Continuation } from "@/shared/routes/continuation";
import { Button } from "@/shared/ui/button";
import { CODE_LENGTH, CodeInput } from "@/shared/ui/code-input";
import { Notice } from "@/shared/ui/notice";
import { Spinner } from "@/shared/ui/spinner";
import { textLinkClass } from "@/shared/ui/text-link";

import { requestSignInCode, verifySignInCode } from "../model/api";
import { inputStateFor } from "../model/code-step";
import { pending, usePendingFlow, type PendingSignIn } from "../model/pending";
import { useCodeStep } from "../model/use-code-step";
import { ctaFor, ResendStatus, StatusNotice } from "./code-step-parts";

/**
 * WA1b "Enter your sign-in code" (email_sign_in). Without a pending sign-in in
 * this tab (opened directly, or finished) it goes back to the email step.
 */
export function SignInCodeStep({ continuation }: { continuation?: Continuation }) {
  const flow = usePendingFlow("signIn");
  const router = useRouter();

  useEffect(() => {
    if (flow === null) router.replace(withContinuation("web.login", continuation));
  }, [flow, router, continuation]);

  if (!flow) return <StepPending />;
  return <SignInCodeForm flow={flow} continuation={continuation} />;
}

export function SignInCodeForm({
  flow,
  continuation,
}: {
  flow: PendingSignIn;
  continuation?: Continuation;
}) {
  const t = useTranslations("auth.code.signIn");
  const code = useTranslations("auth.code");
  const step = useCodeStep({
    purpose: "sign-in",
    initialStatus: "sent",
    resendAt: flow.resendAt,
    verify: (value) => verifySignInCode(flow.email, value),
    resend: () => requestSignInCode(flow.email),
    onVerified: () => pending.clear("signIn"),
  });
  const cta = ctaFor(step.status, step.code.length === CODE_LENGTH);
  const final = step.status === "success";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cta.action === "submit") void step.submit(step.code);
    else if (cta.action === "resend") void step.resend();
    else if (cta.action === "retry") void step.retry();
  }

  return (
    <div className="flex flex-col gap-3.5">
      <p className="type-label text-highlight">{t("eyebrow")}</p>
      <h1 className="type-auth-heading text-balance">{t("title")}</h1>
      <p className="type-body text-pretty text-muted-foreground">
        {t.rich("description", {
          email: flow.email,
          b: (chunks) => <b className="font-bold text-foreground">{chunks}</b>,
        })}
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <CodeInput
          label={code("label")}
          value={step.code}
          onChange={step.changeCode}
          onComplete={(value) => void step.submit(value)}
          state={inputStateFor(step.status, step.code)}
          autoFocus
        />
        <StatusNotice purpose="sign-in" status={step.status} email={flow.email} />
        <Button
          type="submit"
          size="xl"
          className="w-full"
          disabled={cta.disabled}
          loading={step.status === "submitting" || final}
        >
          {cta.label === "submit" || cta.label === "submitting"
            ? t(`cta.${cta.label}`)
            : code(`cta.${cta.label}`)}
        </Button>
      </form>
      {!final && (
        <div className="flex items-center gap-2.5 type-body-sm">
          <span className="text-muted-foreground">{code("didntGetIt")}</span>
          <span className="flex-1" />
          <ResendStatus
            status={step.status}
            secondsUntilResend={step.secondsUntilResend}
            canResend={step.canResend}
            onResend={() => void step.resend()}
          />
        </div>
      )}
      {!final && (
        // WA1b: 13 px under the resend row, and the eyebrow, title and CTA run
        // 4 px over the artboard; 2 px back keeps the centred column on it.
        <p className="-mt-0.5 type-body-sm text-faint-foreground">
          {t.rich("wrongEmail", {
            link: (chunks) => (
              <Link href={withContinuation("web.login", continuation)} className={textLinkClass}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
      <Notice tone="muted" icon={ShieldIcon}>
        {code("neverShare")}
      </Notice>
      {/* 2 px closer: WA1b sets this line at 18 px, the `body-sm` line is 20. */}
      <p className="-mt-0.5 type-body-sm text-faint-foreground">
        {t.rich("newHere", {
          link: (chunks) => (
            <Link href={withContinuation("web.signup", continuation)} className={textLinkClass}>
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}

export function StepPending() {
  const t = useTranslations("auth.session");
  return (
    <div className="flex min-h-60 items-center justify-center">
      <Spinner label={t("checking")} className="size-6 text-muted-foreground" />
    </div>
  );
}
