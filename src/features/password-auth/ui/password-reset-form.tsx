"use client";

import { AlertTriangleIcon, CheckIcon, ClockIcon, MailIcon, WifiOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";

import { requestCode, setPassword } from "../model/api";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  resetFailureOf,
  type ResetFailure,
} from "../model/failures";
import { PasswordField } from "./password-field";

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+$/.test(value);

type Step = { kind: "email" } | { kind: "code"; email: string } | { kind: "done" };

/**
 * Set or reset a password (SF-157): a code sent to the account's address, then
 * the code with the new password. The API answers the request alike for every
 * address, so the code step always follows. Setting the password signs the
 * account out everywhere and signs nobody in: `done` renders `signInLink`.
 */
export function PasswordResetForm({ signInLink }: { signInLink: ReactNode }) {
  const [step, setStep] = useState<Step>({ kind: "email" });
  if (step.kind === "done") return <Done signInLink={signInLink} />;
  if (step.kind === "code") {
    return (
      <CodeStep
        email={step.email}
        onDone={() => setStep({ kind: "done" })}
        onRestart={() => setStep({ kind: "email" })}
      />
    );
  }
  return <EmailStep onSent={(email) => setStep({ kind: "code", email })} />;
}

function Problem({ id, failure }: { id: string; failure: ResetFailure }) {
  const t = useTranslations("auth.password.resetErrors");
  return (
    <div id={id} role="alert">
      <Notice
        tone={failure.kind === "throttled" || failure.kind === "codeExpired" ? "amber" : "coral"}
        icon={
          failure.kind === "throttled"
            ? ClockIcon
            : failure.kind === "network"
              ? WifiOffIcon
              : AlertTriangleIcon
        }
      >
        {t(failure.kind, { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH })}
      </Notice>
    </div>
  );
}

function EmailStep({ onSent }: { onSent: (email: string) => void }) {
  const t = useTranslations("auth.password");
  const id = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ResetFailure | undefined>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const address = email.trim();
    if (!looksLikeEmail(address)) {
      setFailure({ kind: "invalidEmail" });
      return;
    }
    setBusy(true);
    setFailure(undefined);
    try {
      await requestCode(address);
      onSent(address);
    } catch (error) {
      setFailure(resetFailureOf(error));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="flex flex-col gap-3.5"
    >
      <p className="type-body-sm text-muted-foreground">{t("reset.emailIntro")}</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-email`} className="type-caption font-bold text-muted-foreground">
          {t("email")}
        </label>
        <Input
          id={`${id}-email`}
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          fieldSize="lg"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={failure?.kind === "invalidEmail" || undefined}
          aria-describedby={failure ? `${id}-error` : undefined}
        />
      </div>
      {failure && <Problem id={`${id}-error`} failure={failure} />}
      <Button type="submit" size="xl" className="w-full" loading={busy}>
        <MailIcon aria-hidden />
        {t("reset.sendCode")}
      </Button>
    </form>
  );
}

function CodeStep({
  email,
  onDone,
  onRestart,
}: {
  email: string;
  onDone: () => void;
  onRestart: () => void;
}) {
  const t = useTranslations("auth.password");
  const id = useId();
  const [code, setCode] = useState("");
  const [password, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ResetFailure | undefined>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) {
      setFailure({ kind: "codeInvalid" });
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      setFailure({ kind: "weakPassword" });
      return;
    }
    setBusy(true);
    setFailure(undefined);
    try {
      await setPassword(email, code, password);
      onDone();
    } catch (error) {
      setFailure(resetFailureOf(error));
      setBusy(false);
    }
  }

  const codeProblem = failure?.kind === "codeInvalid" || failure?.kind === "codeExpired";
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="flex flex-col gap-3.5"
    >
      <div role="status">
        <Notice tone="olive" icon={MailIcon}>
          {t("reset.codeSent", { email })}
        </Notice>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-code`} className="type-caption font-bold text-muted-foreground">
          {t("reset.code")}
        </label>
        <Input
          id={`${id}-code`}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          fieldSize="lg"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-invalid={codeProblem || undefined}
          aria-describedby={failure ? errorId : undefined}
        />
      </div>
      <PasswordField
        id={`${id}-password`}
        label={t("reset.newPassword")}
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        value={password}
        onChange={(event) => setNewPassword(event.target.value)}
        aria-invalid={failure?.kind === "weakPassword" || undefined}
        aria-describedby={failure ? `${errorId} ${hintId}` : hintId}
      />
      <p id={hintId} className="-mt-2 type-body-sm text-faint-foreground">
        {t("reset.passwordHint", { min: PASSWORD_MIN_LENGTH })}
      </p>
      {failure && <Problem id={errorId} failure={failure} />}
      <Button type="submit" size="xl" className="w-full" loading={busy}>
        {t("reset.submit")}
      </Button>
      <Button type="button" variant="link" className="w-fit" onClick={onRestart}>
        {t("reset.restart")}
      </Button>
    </form>
  );
}

function Done({ signInLink }: { signInLink: ReactNode }) {
  const t = useTranslations("auth.password.reset");
  return (
    <div className="flex flex-col gap-3.5">
      <div role="status">
        <Notice tone="olive" icon={CheckIcon}>
          {t("done")}
        </Notice>
      </div>
      {signInLink}
    </div>
  );
}
