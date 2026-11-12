"use client";

import { AlertTriangleIcon, KeyRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import {
  FLAG_REASONS,
  executeFlagAction,
  previewFlagAction,
  type ConfigurationFlag,
  type FlagAction,
  type FlagPreview,
} from "@/entities/admin-configuration";
import { useOperatorKeys } from "@/entities/operator";
import { isApiError } from "@/shared/api/http/api-error";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

type Phase =
  | { kind: "reason" }
  | { kind: "step_up" }
  | { kind: "confirm"; preview: FlagPreview }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "conflict" }
  | { kind: "invalid" }
  | { kind: "unknown" }
  | { kind: "failed" }
  | { kind: "denied" };

const DONE = ["success", "conflict", "invalid", "unknown", "denied"];

/**
 * Suspend or restore one allowlisted switch (SF-128) through the SF-111 framework: a
 * reason, the backend's preview at the revision the operator saw (current and proposed
 * state, impact, one-time confirmation), a fresh key check when the backend asks, then
 * the action under one operation id. Nothing shows as changed until the backend says
 * so; no answer at all is "we don't know", and nothing is retried with a new token.
 */
export function FlagActionDialog({
  action,
  flag,
  name,
  environment,
  open,
  onOpenChange,
  onSettled,
}: {
  action: FlagAction;
  flag: ConfigurationFlag;
  name: string;
  environment: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After any answer that may have changed the flag: read the configuration again. */
  onSettled: () => void;
}) {
  const t = useTranslations("controlPlane.configuration.dialog");
  const c = useTranslations("controlPlane.configuration");
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
    if (error.code === "conflict" || error.code === "revision_conflict")
      return { kind: "conflict" };
    if (error.code === "confirmation_invalid" || error.code === "confirmation_required")
      return { kind: "invalid" };
    return { kind: "failed" };
  };

  const review = async () => {
    if (reason === undefined) return;
    try {
      setPhase({ kind: "confirm", preview: await previewFlagAction(action, flag, reason) });
    } catch (error) {
      setPhase(problem(error));
    }
  };

  const confirm = async (preview: FlagPreview) => {
    operation.current ??= crypto.randomUUID();
    setPhase({ kind: "submitting" });
    try {
      await executeFlagAction(action, flag, preview, operation.current);
      setPhase({ kind: "success" });
      onSettled();
    } catch (error) {
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
  const done = DONE.includes(phase.kind);
  const impact = (code: string) =>
    t.has(`impacts.${code}` as Parameters<typeof t.has>[0])
      ? t(`impacts.${code}` as Parameters<typeof t>[0])
      : code;
  const reasonName = (code: string) =>
    t.has(`reasons.${code}` as Parameters<typeof t.has>[0])
      ? t(`reasons.${code}` as Parameters<typeof t>[0])
      : code;
  const stateName = (state: string) =>
    state === "suspended" ? t("state.suspended") : t("state.active");

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
        data-flag-action={action}
        data-phase={phase.kind}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning" className="gap-1.5 uppercase">
            <AlertTriangleIcon aria-hidden className="size-3.5" />
            {c(`risk.${flag.risk}`)}
          </Badge>
          <span className="type-caption text-faint-foreground">
            {t("needs", { permission: "config.flags.write" })}
          </span>
        </div>
        <DialogTitle className="type-h3 font-display">
          {t(`titles.${action}`, { switch: name })}
        </DialogTitle>
        <DialogDescription className="type-caption text-muted-foreground">
          {t("target")}: <span className="font-mono">{flag.key}</span> ·{" "}
          {t("where", { environment, revision: flag.revision ?? 0 })}
        </DialogDescription>

        {phase.kind === "confirm" && (
          <>
            <dl className="grid grid-cols-2 gap-3 rounded-2xl border p-3.5" data-flag-diff>
              <div className="flex flex-col gap-0.5">
                <dt className="type-label text-faint-foreground">{t("current")}</dt>
                <dd className="type-body font-extrabold">
                  {stateName(phase.preview.current_state)}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="type-label text-faint-foreground">{t("proposed")}</dt>
                <dd className="type-body font-extrabold">
                  {stateName(phase.preview.proposed_state)}
                </dd>
              </div>
            </dl>
            <section aria-labelledby="flag-action-impact" className="flex flex-col gap-1.5">
              <h3 id="flag-action-impact" className="type-label text-faint-foreground uppercase">
                {t("impact")}
              </h3>
              <ul className="flex list-disc flex-col gap-1 ps-5 type-body-sm">
                {phase.preview.impact.map((code) => (
                  <li key={code}>{impact(code)}</li>
                ))}
              </ul>
            </section>
          </>
        )}

        {(phase.kind === "reason" || phase.kind === "failed") && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="flag-action-reason">
              {t("reason")} <span aria-hidden>*</span>
            </Label>
            <Select value={reason ?? ""} onValueChange={setReason} required>
              <SelectTrigger id="flag-action-reason" className="h-11 w-full" aria-required="true">
                <SelectValue placeholder={t("reasonPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {FLAG_REASONS[action].map((code) => (
                  <SelectItem key={code} value={code}>
                    {reasonName(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <p role="status" className="type-body-sm">
          {phase.kind === "step_up" && t("stepUp")}
          {phase.kind === "submitting" && t("working")}
          {phase.kind === "success" && t("success")}
        </p>
        {["conflict", "invalid", "unknown", "failed", "denied"].includes(phase.kind) && (
          <p role="alert" className="type-body-sm font-bold text-destructive">
            {t(phase.kind as "conflict")}
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
              {phase.kind === "success" || phase.kind === "denied" ? t("close") : t("reload")}
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
                <Button onClick={() => void stepUp()} data-flag-action-key>
                  <KeyRoundIcon aria-hidden />
                  {t("useKey")}
                </Button>
              ) : phase.kind === "confirm" || phase.kind === "submitting" ? (
                <Button
                  variant={action === "suspend" ? "destructive" : "primary"}
                  loading={busy}
                  onClick={() => phase.kind === "confirm" && void confirm(phase.preview)}
                  data-flag-action-confirm
                >
                  {busy ? t("working") : t(`confirm.${action}`)}
                </Button>
              ) : (
                <Button
                  disabled={reason === undefined}
                  onClick={() => void review()}
                  data-flag-action-review
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
