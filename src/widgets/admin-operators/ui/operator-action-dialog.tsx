"use client";

import { AlertTriangleIcon, KeyRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import {
  ACTION_REASONS,
  executeOperatorAction,
  previewOperatorAction,
  type GovernedOperator,
  type OperatorAction,
  type OperatorPreview,
} from "@/entities/admin-operators";
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
  | { kind: "confirm"; preview: OperatorPreview }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "conflict" }
  | { kind: "self" }
  | { kind: "invalid" }
  | { kind: "unknown" }
  | { kind: "failed" }
  | { kind: "denied" };

const DONE = ["success", "conflict", "self", "invalid", "unknown", "denied"];
const PROBLEMS = ["conflict", "self", "invalid", "unknown", "failed", "denied"];
const ENDING: readonly OperatorAction[] = ["suspend", "revoke", "revoke_permission"];

/**
 * One SF-111 operator action (SF-129): grant or remove a permission, suspend, reinstate
 * or revoke an operator. A reason, the backend's preview at the revision the viewer saw
 * (current and proposed state, impact, one-time confirmation when the backend asks), a
 * fresh key check when the backend asks, then the action under one operation id.
 * Nothing shows as changed until the backend says so; no answer at all is "we don't
 * know", and nothing is retried with a new confirmation.
 */
export function OperatorActionDialog({
  action,
  target,
  name,
  permission: fixed,
  grantable = [],
  open,
  onOpenChange,
  onSettled,
}: {
  action: OperatorAction;
  target: GovernedOperator;
  name: string;
  /** The permission removed (`revoke_permission`). */
  permission?: string;
  /** The permissions that can be granted (`grant`): the catalog minus what they hold. */
  grantable?: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After any answer that may have changed the operator: read them again. */
  onSettled: () => void;
}) {
  const t = useTranslations("controlPlane.operators.dialog");
  const keys = useOperatorKeys();
  const [reason, setReason] = useState<string>();
  const [chosen, setChosen] = useState<string | undefined>(fixed);
  const [phase, setPhase] = useState<Phase>({ kind: "reason" });
  const operation = useRef<string | null>(null);
  const permission = action === "grant" ? chosen : fixed;

  const reset = () => {
    setPhase({ kind: "reason" });
    setReason(undefined);
    setChosen(fixed);
    operation.current = null;
  };

  const problem = (error: unknown): Phase => {
    if (!isApiError(error)) return { kind: "failed" };
    if (error.code === "step_up_required") return { kind: "step_up" };
    if (error.code === "forbidden" || error.status === 404) return { kind: "denied" };
    if (error.code === "conflict" && error.details.target === "self") return { kind: "self" };
    if (error.code === "conflict" || error.code === "revision_conflict")
      return { kind: "conflict" };
    if (error.code === "confirmation_invalid" || error.code === "confirmation_required")
      return { kind: "invalid" };
    return { kind: "failed" };
  };

  const review = async () => {
    if (reason === undefined || (action === "grant" && permission === undefined)) return;
    try {
      setPhase({
        kind: "confirm",
        preview: await previewOperatorAction(action, target, reason, permission),
      });
    } catch (error) {
      setPhase(problem(error));
    }
  };

  const confirm = async (preview: OperatorPreview) => {
    operation.current ??= crypto.randomUUID();
    setPhase({ kind: "submitting" });
    try {
      await executeOperatorAction(action, target, preview, operation.current, permission);
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
  const known = (group: string, code: string) =>
    t.has(`${group}.${code}` as Parameters<typeof t.has>[0])
      ? t(`${group}.${code}` as Parameters<typeof t>[0])
      : code;
  const editing = phase.kind === "reason" || phase.kind === "failed";

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
        className="max-h-[92dvh] overflow-y-auto sm:max-w-140"
        data-operator-action={action}
        data-phase={phase.kind}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={ENDING.includes(action) ? "destructive" : "warning"}
            className="gap-1.5 uppercase"
          >
            <AlertTriangleIcon aria-hidden className="size-3.5" />
            {t("risk")}
          </Badge>
          <span className="type-caption text-faint-foreground">
            {t("needs", { permission: "operators.manage" })}
          </span>
        </div>
        <DialogTitle className="type-h3 font-display">
          {t(`titles.${action}`, { name, permission: permission ?? "" })}
        </DialogTitle>
        <DialogDescription className="type-caption text-muted-foreground">
          {t("target", { id: target.id, revision: target.revision })}
        </DialogDescription>

        {phase.kind === "confirm" && (
          <>
            <dl className="grid grid-cols-2 gap-3 rounded-2xl border p-3.5" data-operator-diff>
              <div className="flex flex-col gap-0.5">
                <dt className="type-label text-faint-foreground">{t("current")}</dt>
                <dd className="type-body font-extrabold">
                  {known("states", phase.preview.current_state)}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="type-label text-faint-foreground">{t("proposed")}</dt>
                <dd className="type-body font-extrabold">
                  {known("states", phase.preview.proposed_state)}
                </dd>
              </div>
              {phase.preview.permission && (
                <div className="col-span-2 flex flex-col gap-0.5">
                  <dt className="type-label text-faint-foreground">{t("permission")}</dt>
                  <dd className="type-body-sm font-mono">{phase.preview.permission}</dd>
                </div>
              )}
            </dl>
            <section aria-labelledby="operator-action-impact" className="flex flex-col gap-1.5">
              <h3
                id="operator-action-impact"
                className="type-label text-faint-foreground uppercase"
              >
                {t("impact")}
              </h3>
              <ul className="flex list-disc flex-col gap-1 ps-5 type-body-sm">
                {phase.preview.impact.map((code) => (
                  <li key={code}>{known("impacts", code)}</li>
                ))}
              </ul>
            </section>
          </>
        )}

        {editing && action === "grant" && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="operator-action-permission">
              {t("permission")} <span aria-hidden>*</span>
            </Label>
            <Select value={chosen ?? ""} onValueChange={setChosen} required>
              <SelectTrigger
                id="operator-action-permission"
                className="h-11 w-full font-mono"
                aria-required="true"
              >
                <SelectValue placeholder={t("permissionPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {grantable.map((code) => (
                  <SelectItem key={code} value={code} className="font-mono">
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {editing && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="operator-action-reason">
              {t("reason")} <span aria-hidden>*</span>
            </Label>
            <Select value={reason ?? ""} onValueChange={setReason} required>
              <SelectTrigger
                id="operator-action-reason"
                className="h-11 w-full"
                aria-required="true"
              >
                <SelectValue placeholder={t("reasonPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {ACTION_REASONS[action].map((code) => (
                  <SelectItem key={code} value={code}>
                    {known("reasons", code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <p role="status" className="type-body-sm">
          {phase.kind === "step_up" && t("stepUp")}
          {phase.kind === "submitting" && t("working")}
          {phase.kind === "success" && t(`success.${action}`)}
        </p>
        {PROBLEMS.includes(phase.kind) && (
          <p role="alert" className="type-body-sm font-bold text-destructive">
            {t(`problems.${phase.kind as "conflict"}`)}
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
              {phase.kind === "success" || phase.kind === "denied" || phase.kind === "self"
                ? t("close")
                : t("reload")}
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
                <Button onClick={() => void stepUp()} data-operator-action-key>
                  <KeyRoundIcon aria-hidden />
                  {t("useKey")}
                </Button>
              ) : phase.kind === "confirm" || phase.kind === "submitting" ? (
                <Button
                  variant={ENDING.includes(action) ? "destructive" : "primary"}
                  loading={busy}
                  onClick={() => phase.kind === "confirm" && void confirm(phase.preview)}
                  data-operator-action-confirm
                >
                  {busy ? t("working") : t(`confirm.${action}`)}
                </Button>
              ) : (
                <Button
                  disabled={reason === undefined || (action === "grant" && !permission)}
                  onClick={() => void review()}
                  data-operator-action-review
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
