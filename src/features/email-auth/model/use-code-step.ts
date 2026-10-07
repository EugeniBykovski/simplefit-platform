import { useCallback, useEffect, useRef, useState } from "react";

import { completeAuthentication } from "@/entities/session";
import type { SessionTokens } from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";
import { CODE_LENGTH } from "@/shared/ui/code-input";

import {
  EDITABLE,
  requestFailureOf,
  statusForVerifyError,
  type CodeStepStatus,
  type Purpose,
} from "./code-step";

// Without a retry-after header, a throttled step unlocks after a minute.
const DEFAULT_THROTTLE_SECONDS = 60;

/** The current time, re-rendered every second (for the resend countdown). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

type Options = {
  purpose: Purpose;
  initialStatus: CodeStepStatus;
  /** When a resend is allowed (epoch ms), from the request's `resend_after_seconds`. */
  resendAt: number;
  /** Verifies the code with the API (purpose-specific endpoint). */
  verify: (code: string) => Promise<SessionTokens>;
  /** Requests a new code; resolves with the next `resendAt`. */
  resend: () => Promise<number>;
  /**
   * Clears the pending flow once the code was accepted. Runs when the step
   * unmounts (the guest-only gate navigates into the app), so the step keeps
   * rendering its success state until then.
   */
  onVerified: () => void;
};

/**
 * The code step's state machine. A successful verification hands the tokens
 * to `completeAuthentication`, the pipeline shared with Google and Apple; the
 * guest-only gate then enters the application. Nothing here navigates.
 */
export function useCodeStep({
  purpose,
  initialStatus,
  resendAt: initialResendAt,
  verify,
  resend: requestCode,
  onVerified,
}: Options) {
  const [stored, setStatus] = useState<CodeStepStatus>(initialStatus);
  const [code, setCode] = useState("");
  const [resendAt, setResendAt] = useState(initialResendAt);
  const [throttledUntil, setThrottledUntil] = useState<number | undefined>();
  const busy = useRef(false);
  const lastAction = useRef<"verify" | "resend">("verify");
  const verified = useRef(false);
  const now = useNow();
  // A throttle ends by itself once its delay has passed.
  const status: CodeStepStatus =
    stored === "throttled" && throttledUntil !== undefined && now >= throttledUntil
      ? "typing"
      : stored;
  const done = useRef(onVerified);

  useEffect(() => {
    done.current = onVerified;
  }, [onVerified]);

  useEffect(
    () => () => {
      if (verified.current) done.current();
    },
    [],
  );

  const throttle = useCallback((seconds: number | undefined) => {
    setThrottledUntil(Date.now() + (seconds ?? DEFAULT_THROTTLE_SECONDS) * 1000);
    setStatus("throttled");
  }, []);

  const submit = useCallback(
    async (value: string) => {
      if (busy.current || value.length !== CODE_LENGTH) return;
      busy.current = true;
      lastAction.current = "verify";
      setStatus("submitting");
      try {
        const tokens = await verify(value);
        verified.current = true;
        setStatus("success");
        await completeAuthentication(tokens);
      } catch (error) {
        const outcome = statusForVerifyError(error, purpose);
        if (outcome.status === "throttled") throttle(outcome.retryAfterSeconds);
        else setStatus(outcome.status);
      } finally {
        busy.current = false;
      }
    },
    [verify, purpose, throttle],
  );

  const resend = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    lastAction.current = "resend";
    try {
      setResendAt(await requestCode());
      setCode("");
      setStatus("resent");
    } catch (error) {
      if (requestFailureOf(error) === "rateLimited") {
        throttle(isApiError(error) ? (error.retryAfterSeconds ?? undefined) : undefined);
      } else {
        setStatus("error");
      }
    } finally {
      busy.current = false;
    }
  }, [requestCode, throttle]);

  const changeCode = useCallback(
    (value: string) => {
      setCode(value);
      if (EDITABLE.has(status) && status !== "typing") setStatus("typing");
    },
    [status],
  );

  /** "Try again" repeats whatever failed: the verification or the resend. */
  const retry = useCallback(
    () => (lastAction.current === "resend" ? resend() : submit(code)),
    [resend, submit, code],
  );

  const secondsUntilResend = Math.max(0, Math.ceil((resendAt - now) / 1000));

  return {
    status,
    /** Applies a status the API reported outside a verification (registration status check). */
    report: setStatus,
    // Locked steps show empty cells (the artboards' throttled and verified-elsewhere states).
    code: status === "throttled" || status === "verified-elsewhere" ? "" : code,
    changeCode,
    submit,
    resend,
    retry,
    secondsUntilResend,
    canResend: secondsUntilResend === 0 && status !== "throttled" && status !== "submitting",
  };
}
