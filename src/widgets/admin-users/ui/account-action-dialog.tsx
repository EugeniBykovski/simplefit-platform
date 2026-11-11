"use client";

import { AlertTriangleIcon, KeyRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import {
  ACTION_REASONS,
  executeAction,
  previewAction,
  type AccountAction,
  type ActionPreview,
} from "@/entities/admin-user";
import { useOperatorKeys } from "@/entities/operator";
import { isApiError } from "@/shared/api/http/api-error";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog";

import { ReasonSelect } from "./reason-select";

type Phase =
  | { kind: "reason" }
  | { kind: "step_up" }
  | { kind: "confirm"; preview: ActionPreview }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "conflict" }
  | { kind: "unknown" }
  | { kind: "failed" }
  | { kind: "denied" }
  | { kind: "protected"; who: "self" | "operator" };

const PERMISSION: Record<AccountAction, string> = {
  suspend: "users.restrict",
  lift_suspension: "users.restrict",
  sign_out_everywhere: "users.sessions.revoke",
};

/**
 * AD9, a high-risk account action (SF-122; Claude Design `AdminBan`, MVP): a reason, the
 * backend's preview (impact and a one-time confirmation), a fresh key check when the
 * backend asks for it, then the action under one operation id. Nothing is shown as done
 * until the backend says so; an unanswered request is "we don't know", never success.
 */
export function AccountActionDialog({
  action,
  accountId,
  accountLabel,
  open,
  onOpenChange,
  onSettled,
}: {
  action: AccountAction;
  accountId: string;
  accountLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After any answer that may have changed the account: read it again. */
  onSettled: () => void;
}) {
  const t = useTranslations("controlPlane.users.action");
  const keys = useOperatorKeys();
  const [reason, setReason] = useState<string>();
  const [phase, setPhase] = useState<Phase>({ kind: "reason" });
  const operation = useRef<string | null>(null);

  const reset = () => {
    setPhase({ kind: "reason" });
    setReason(undefined);
    operation.current = null;
  };

  const problem = (error: unknown): Phase => {
    if (!isApiError(error)) return { kind: "failed" };
    if (error.code === "step_up_required") return { kind: "step_up" };
    if (error.code === "forbidden" || error.status === 404) return { kind: "denied" };
    if (error.code === "conflict" && error.details.target === "self")
      return { kind: "protected", who: "self" };
    if (error.code === "conflict" && error.details.target === "operator") {
      return { kind: "protected", who: "operator" };
    }
    if (error.code === "conflict" || error.code === "revision_conflict")
      return { kind: "conflict" };
    return { kind: "failed" };
  };

  const review = async () => {
    if (reason === undefined) return;
    try {
      setPhase({ kind: "confirm", preview: await previewAction(action, accountId, reason) });
    } catch (error) {
      setPhase(problem(error));
    }
  };

  const confirm = async (preview: ActionPreview) => {
    operation.current ??= crypto.randomUUID();
    setPhase({ kind: "submitting" });
    try {
      await executeAction(action, accountId, preview, operation.current);
      setPhase({ kind: "success" });
      onSettled();
    } catch (error) {
      // No answer at all: the action may or may not have committed.
      const next = isApiError(error) ? problem(error) : ({ kind: "unknown" } as const);
      setPhase(next);
      if (next.kind !== "step_up") onSettled();
    }
  };

  const stepUp = async () => {
    try {
      await keys.verifyKey();
      await review();
    } catch {
      setPhase({ kind: "step_up" });
    }
  };

  const busy = phase.kind === "submitting";
  const done = ["success", "conflict", "unknown", "denied", "protected"].includes(phase.kind);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        {...(busy ? { showCloseButton: false as const } : { closeLabel: t("close") })}
        className="sm:max-w-140"
        data-account-action={action}
        data-phase={phase.kind}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="destructive" className="gap-1.5 uppercase">
            <AlertTriangleIcon aria-hidden className="size-3.5" />
            {t("risk")}
          </Badge>
          <span className="type-caption text-faint-foreground">
            {t("needs", { permission: PERMISSION[action] })}
          </span>
        </div>
        <DialogTitle className="type-h3 font-display">
          {t(`titles.${action}`, { account: accountLabel })}
        </DialogTitle>
        <DialogDescription className="type-caption text-muted-foreground">
          {t("target")}: {accountLabel}
        </DialogDescription>

        {phase.kind === "confirm" && (
          <section aria-labelledby="account-action-impact" className="flex flex-col gap-1.5">
            <h3 id="account-action-impact" className="type-label text-faint-foreground uppercase">
              {t("impact")}
            </h3>
            <ul className="flex list-disc flex-col gap-1 ps-5 type-body-sm">
              {phase.preview.impact.map((code) => (
                <li key={code}>
                  {t.has(`impacts.${code}` as Parameters<typeof t.has>[0])
                    ? t(`impacts.${code}` as Parameters<typeof t>[0])
                    : code}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(phase.kind === "reason" || phase.kind === "failed") && (
          <ReasonSelect
            id="account-action-reason"
            label={t("reason")}
            placeholder={t("reasonPlaceholder")}
            reasons={ACTION_REASONS[action]}
            value={reason}
            onChange={setReason}
          />
        )}

        <p role="status" className="type-body-sm">
          {phase.kind === "step_up" && t("stepUp")}
          {phase.kind === "submitting" && t("submitting")}
          {phase.kind === "success" && t("success")}
        </p>
        {["conflict", "unknown", "failed", "denied", "protected"].includes(phase.kind) && (
          <p role="alert" className="type-body-sm font-bold text-destructive">
            {phase.kind === "protected" ? t(`protected.${phase.who}`) : t(phase.kind as "conflict")}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {done ? (
            <Button
              variant="quiet"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              {phase.kind === "conflict" || phase.kind === "unknown" ? t("reload") : t("close")}
            </Button>
          ) : (
            <>
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                {t("cancel")}
              </Button>
              {phase.kind === "step_up" ? (
                <Button onClick={() => void stepUp()} data-account-action-key>
                  <KeyRoundIcon aria-hidden />
                  {t("useKey")}
                </Button>
              ) : phase.kind === "confirm" || phase.kind === "submitting" ? (
                <Button
                  variant="destructive"
                  loading={busy}
                  onClick={() => phase.kind === "confirm" && void confirm(phase.preview)}
                  data-account-action-confirm
                >
                  {busy ? t("working") : t("confirm")}
                </Button>
              ) : (
                <Button
                  disabled={reason === undefined}
                  onClick={() => void review()}
                  data-account-action-review
                >
                  {t("preview")}
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
