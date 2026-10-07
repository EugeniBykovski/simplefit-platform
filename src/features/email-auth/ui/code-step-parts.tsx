"use client";

import {
  CheckIcon,
  ClockIcon,
  LockIcon,
  MailIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/utils";
import { Notice } from "@/shared/ui/notice";
import { textLinkClass } from "@/shared/ui/text-link";

import { formatCountdown, type CodeStepStatus, type Purpose } from "../model/code-step";

type Tone = "olive" | "amber" | "coral";

const NOTICES: Partial<Record<CodeStepStatus, { tone: Tone; icon: LucideIcon }>> = {
  sent: { tone: "olive", icon: MailIcon },
  resent: { tone: "olive", icon: RefreshCwIcon },
  invalid: { tone: "coral", icon: TriangleAlertIcon },
  expired: { tone: "amber", icon: ClockIcon },
  success: { tone: "olive", icon: CheckIcon },
  throttled: { tone: "coral", icon: TriangleAlertIcon },
  error: { tone: "coral", icon: TriangleAlertIcon },
  "verified-elsewhere": { tone: "amber", icon: LockIcon },
};

const copyNamespace = (purpose: Purpose) =>
  purpose === "sign-in" ? "auth.code.signIn" : "auth.code.registration";

/**
 * The status message of the step (olive, amber or coral). The polite live
 * region is a visually hidden twin outside the layout flow, so an empty
 * status never adds a gap the artboards don't draw; the visible box is hidden
 * from assistive technology to avoid reading it twice.
 */
export function StatusNotice({
  purpose,
  status,
  email,
}: {
  purpose: Purpose;
  status: CodeStepStatus;
  email: string;
}) {
  const t = useTranslations(copyNamespace(purpose));
  const notice = NOTICES[status];
  const message = notice ? t(`notices.${status}` as "notices.sent", { email }) : "";

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
      {notice && (
        <Notice tone={notice.tone} icon={notice.icon} aria-hidden>
          {message}
        </Notice>
      )}
    </>
  );
}

/** "Resend in 0:42", or the "Send a new code" action once allowed. */
export function ResendStatus({
  status,
  secondsUntilResend,
  canResend,
  onResend,
}: {
  status: CodeStepStatus;
  secondsUntilResend: number;
  canResend: boolean;
  onResend: () => void;
}) {
  const t = useTranslations("auth.code");
  if (status === "throttled") {
    return <span className="type-body-sm text-faint-foreground">{t("resendUnavailable")}</span>;
  }
  if (canResend) {
    return (
      <button type="button" className={cn("type-body-sm", textLinkClass)} onClick={onResend}>
        {t("sendNewCode")}
      </button>
    );
  }
  return (
    <span className="type-body-sm text-faint-foreground tabular-nums">
      {t("resendIn", { time: formatCountdown(secondsUntilResend) })}
    </span>
  );
}

export type CtaAction = "submit" | "resend" | "retry" | "handoff" | "none";

/** The primary action of each status (the artboards' state tables). */
export function ctaFor(
  status: CodeStepStatus,
  codeComplete: boolean,
): {
  action: CtaAction;
  label: "submit" | "submitting" | "continue" | "sendNewCode" | "tryAgain";
  disabled: boolean;
} {
  switch (status) {
    case "submitting":
      return { action: "none", label: "submitting", disabled: true };
    case "success":
      return { action: "none", label: "continue", disabled: true };
    case "expired":
      return { action: "resend", label: "sendNewCode", disabled: false };
    case "verified-elsewhere":
      return { action: "handoff", label: "sendNewCode", disabled: false };
    case "error":
      return { action: "retry", label: "tryAgain", disabled: false };
    case "throttled":
      return { action: "none", label: "submit", disabled: true };
    default:
      return { action: "submit", label: "submit", disabled: !codeComplete };
  }
}
