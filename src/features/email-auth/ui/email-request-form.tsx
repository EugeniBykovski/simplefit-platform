"use client";

import { MailIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { useRouter } from "@/shared/i18n/navigation";
import { withContinuation, type Continuation } from "@/shared/routes/continuation";
import type { WebRouteId } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/utils";

import { requestRegistrationCode, requestSignInCode } from "../model/api";
import { requestFailureOf, type RequestFailure } from "../model/code-step";
import { normalizeEmail } from "../model/pending";

type Props = {
  /** Requests the code and records the pending flow; the API answers alike for every address. */
  request: (email: string) => Promise<unknown>;
  /** Where the code step lives (`/login/code`, `/signup/verify`). */
  next: WebRouteId;
  continuation?: Continuation;
  submitLabel: string;
  hint: string;
  /** Show the mail icon in the submit button (WA1 primary email action). */
  icon?: boolean;
  /** WA1 puts the hint under the button, WA3 under the field. */
  hintPlacement?: "field" | "button";
  /** Content between the field and the button (WA3 legal line). */
  children?: ReactNode;
  /** A field shown before the email field, in a two-column row (WA3's disabled Full name). */
  besideField?: ReactNode;
  /** WA1 stretches the button over the column; WA3 sizes it to its label. */
  fullWidth?: boolean;
  /** The designed CTA height: WA1 draws 50 px (`lg`, 48), WA3 52 px (`xl`, 54). */
  submitSize?: "lg" | "xl";
  /** Extra classes for the submit button (WA1 draws its 15 px CTA 50 px tall). */
  submitClassName?: string;
  className?: string;
};

// A shape check for UX only; the API validates and normalizes the address.
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+$/.test(value);

/**
 * The email step shared by sign-in (WA1, purpose email_sign_in) and sign-up
 * (WA3, purpose email_verification). After any accepted request the user
 * continues to the code step: whether an account exists is never revealed
 * (the API sends decoy responses).
 */
export function EmailRequestForm({
  request,
  next,
  continuation,
  submitLabel,
  hint,
  icon = false,
  hintPlacement = "button",
  children,
  besideField,
  fullWidth = true,
  submitSize = "xl",
  submitClassName,
  className,
}: Props) {
  const t = useTranslations("auth.email");
  const router = useRouter();
  const id = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<RequestFailure | undefined>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const address = normalizeEmail(email);
    if (!looksLikeEmail(address)) {
      setFailure("invalidEmail");
      return;
    }
    setBusy(true);
    setFailure(undefined);
    try {
      await request(address);
      router.push(withContinuation(next, continuation));
    } catch (error) {
      setFailure(requestFailureOf(error));
      setBusy(false);
    }
  }

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const hintText = (
    <p id={hintId} className="type-body-sm text-faint-foreground">
      {hint}
    </p>
  );

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className={className}>
      <div className={besideField ? "grid gap-3.5 sm:grid-cols-2" : "contents"}>
        {besideField}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-email`} className="type-caption font-bold text-muted-foreground">
            {t("label")}
          </label>
          <Input
            id={`${id}-email`}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            fieldSize="lg"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={failure === "invalidEmail" || undefined}
            aria-describedby={failure ? `${errorId} ${hintId}` : hintId}
          />
        </div>
      </div>
      {failure && (
        <p id={errorId} role="alert" className="type-caption font-bold text-destructive">
          {t(`errors.${failure}`)}
        </p>
      )}
      {hintPlacement === "field" && hintText}
      {children}
      <Button
        type="submit"
        size={submitSize}
        className={cn(fullWidth ? "w-full" : "w-fit", submitClassName)}
        loading={busy}
      >
        {icon && <MailIcon aria-hidden />}
        {submitLabel}
      </Button>
      {hintPlacement === "button" && hintText}
    </form>
  );
}

type StepFormProps = Omit<Props, "request" | "next">;

/** WA1 "Email me a sign-in code" (B, email_sign_in) → `/login/code`. */
export function SignInEmailForm(props: StepFormProps) {
  return <EmailRequestForm {...props} request={requestSignInCode} next="web.login.code" />;
}

/** WA3 "Create account" (A, email_verification) → `/signup/verify`. */
export function RegistrationEmailForm(props: StepFormProps) {
  return <EmailRequestForm {...props} request={requestRegistrationCode} next="web.signup.verify" />;
}
