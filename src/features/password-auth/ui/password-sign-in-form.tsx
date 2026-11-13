"use client";

import { AlertTriangleIcon, ClockIcon, WifiOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, type FormEvent } from "react";

import { completeAuthentication } from "@/entities/session";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";

import { signIn } from "../model/api";
import { signInFailureOf, type SignInFailure } from "../model/failures";
import { PasswordField } from "./password-field";

// A shape check for UX only; the API validates and normalizes the address.
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+$/.test(value);
// Without a retry-after header, a throttled form unlocks after a minute.
const DEFAULT_THROTTLE_SECONDS = 60;

type Problem = SignInFailure | { kind: "missing" };

/**
 * Email and password sign-in (SF-157). A successful answer hands the tokens to
 * `completeAuthentication`, the pipeline shared with every other sign-in; the
 * guest-only gate then enters the validated continuation. Signing in grants
 * nothing by itself: the Control Plane gate and the API decide access.
 */
export function PasswordSignInForm({ className }: { className?: string }) {
  const t = useTranslations("auth.password");
  const id = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | undefined>();
  const [throttledUntil, setThrottledUntil] = useState<number | undefined>();

  // A throttle ends by itself once its delay has passed.
  useEffect(() => {
    if (throttledUntil === undefined) return;
    const timer = window.setTimeout(
      () => {
        setThrottledUntil(undefined);
        setProblem(undefined);
      },
      Math.max(0, throttledUntil - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [throttledUntil]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || throttledUntil !== undefined) return;
    const address = email.trim();
    if (!looksLikeEmail(address) || password.length === 0) {
      setProblem({ kind: "missing" });
      return;
    }
    setBusy(true);
    setProblem(undefined);
    try {
      const tokens = await signIn(address, password);
      await completeAuthentication(tokens);
      // The guest-only gate navigates; the button keeps its busy state until then.
    } catch (error) {
      const failure = signInFailureOf(error);
      setProblem(failure);
      if (failure.kind === "throttled") {
        setThrottledUntil(
          Date.now() + (failure.retryAfterSeconds ?? DEFAULT_THROTTLE_SECONDS) * 1000,
        );
      }
      if (failure.kind === "invalid") setPassword("");
      setBusy(false);
    }
  }

  const errorId = `${id}-error`;
  const invalid = problem?.kind === "invalid" || problem?.kind === "missing";

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      aria-describedby={problem ? errorId : undefined}
      className={className}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-email`} className="type-caption font-bold text-muted-foreground">
          {t("email")}
        </label>
        <Input
          id={`${id}-email`}
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          required
          fieldSize="lg"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={problem ? errorId : undefined}
        />
      </div>
      <PasswordField
        id={`${id}-password`}
        name="password"
        label={t("password")}
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={problem ? errorId : undefined}
      />
      {problem && (
        <div id={errorId} role="alert">
          <Notice
            tone={problem.kind === "throttled" ? "amber" : "coral"}
            icon={
              problem.kind === "throttled"
                ? ClockIcon
                : problem.kind === "network"
                  ? WifiOffIcon
                  : AlertTriangleIcon
            }
          >
            {t(`signInErrors.${problem.kind}`)}
          </Notice>
        </div>
      )}
      <Button
        type="submit"
        size="xl"
        className="w-full"
        loading={busy}
        disabled={throttledUntil !== undefined}
      >
        {t("submit")}
      </Button>
    </form>
  );
}
