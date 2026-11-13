"use client";

import { KeyRoundIcon, UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { PROVISION_REASONS, provision, type GovernedOperator } from "@/entities/admin-operators";
import { needsEnrollment, useOperatorKeys } from "@/entities/operator";
import type { OperatorPermissionCatalogResponsePermissionsItem } from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

type Phase =
  | "editing"
  | "step_up"
  | "submitting"
  | "success"
  | "not_eligible"
  | "exists"
  | "self"
  | "invalid"
  | "denied"
  | "unknown"
  | "failed";

const PROBLEMS = ["not_eligible", "exists", "self", "invalid", "denied", "unknown", "failed"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Add an operator (SF-129; SF-110 provisioning): an existing account named by one exact
 * reference (a user id, or a verified email address the backend resolves), the
 * permissions to grant and a reason. No preview: the new operator holds nothing usable
 * until they register their own two keys. One operation id per attempt, so a retry
 * after a key check or a lost answer adds nobody twice.
 */
export function AddOperatorDialog({
  catalog,
  open,
  onOpenChange,
  onAdded,
}: {
  catalog: readonly OperatorPermissionCatalogResponsePermissionsItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the backend confirmed the new operator (or may have: reload). */
  onAdded: (operator: GovernedOperator | null) => void;
}) {
  const t = useTranslations("controlPlane.operators.add");
  const d = useTranslations("controlPlane.operators.dialog");
  const keys = useOperatorKeys();
  const ids = useId();
  const [account, setAccount] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [reason, setReason] = useState<string>();
  const [phase, setPhase] = useState<Phase>("editing");
  const operation = useRef<string | null>(null);

  const reference = account.trim();
  const ready = reference.length > 0 && permissions.length > 0 && reason !== undefined;
  const busy = phase === "submitting";

  const reset = () => {
    setAccount("");
    setPermissions([]);
    setReason(undefined);
    setPhase("editing");
    operation.current = null;
  };

  const problem = (error: unknown): Phase => {
    if (!isApiError(error)) return "unknown";
    // SF-157: no keys yet; the gate shows key registration instead.
    if (needsEnrollment(error)) return "unknown";
    if (error.code === "step_up_required") return "step_up";
    if (error.code === "forbidden" || error.status === 404) return "denied";
    if (error.code === "validation_error") return "invalid";
    if (error.code === "conflict") {
      if (error.details.target === "self") return "self";
      if (error.details.operator === "exists") return "exists";
      if (error.details.user === "not_eligible") return "not_eligible";
    }
    return "failed";
  };

  const submit = async () => {
    if (!ready || reason === undefined) return;
    operation.current ??= crypto.randomUUID();
    setPhase("submitting");
    try {
      const created = await provision(
        UUID.test(reference) ? { user_id: reference } : { email: reference },
        permissions,
        reason,
        operation.current,
      );
      setPhase("success");
      onAdded(created);
    } catch (error) {
      const next = problem(error);
      setPhase(next);
      // A refused reference can be corrected: a new attempt is a new operation. After a
      // key check or a lost answer, the retry keeps the id, so it adds nobody twice.
      if (next !== "step_up" && next !== "unknown") operation.current = null;
      if (next === "unknown") onAdded(null);
    }
  };

  const stepUp = async () => {
    try {
      await keys.verifyKey();
      await submit();
    } catch {
      setPhase("step_up");
    }
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

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
        {...(busy ? { showCloseButton: false as const } : { closeLabel: d("close") })}
        className="max-h-[92dvh] overflow-y-auto sm:max-w-140"
        data-add-operator={phase}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning" className="gap-1.5 uppercase">
            <UserPlusIcon aria-hidden className="size-3.5" />
            {d("risk")}
          </Badge>
          <span className="type-caption text-faint-foreground">
            {d("needs", { permission: "operators.manage" })}
          </span>
        </div>
        <DialogTitle className="type-h3 font-display">{t("title")}</DialogTitle>
        <DialogDescription className="type-body-sm text-muted-foreground">
          {t("body")}
        </DialogDescription>

        {phase !== "success" && (
          <>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={`${ids}-account`}>
                {t("account")} <span aria-hidden>*</span>
              </Label>
              <Input
                id={`${ids}-account`}
                value={account}
                onChange={(event) => setAccount(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                required
                maxLength={320}
                aria-describedby={`${ids}-account-hint`}
                disabled={busy}
              />
              <p id={`${ids}-account-hint`} className="type-caption text-muted-foreground">
                {t("accountHint")}
              </p>
            </div>

            <fieldset className="flex min-w-0 flex-col gap-2" disabled={busy}>
              <legend className="mb-1.5 type-label text-faint-foreground">
                {t("permissions")} <span aria-hidden>*</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {catalog.map((entry) => {
                  const id = `${ids}-${entry.permission}`;
                  return (
                    <div key={entry.permission} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={permissions.includes(entry.permission)}
                        onCheckedChange={(checked) =>
                          setPermissions((current) =>
                            checked === true
                              ? [...current, entry.permission]
                              : current.filter((p) => p !== entry.permission),
                          )
                        }
                      />
                      <Label htmlFor={id} className="type-body-sm font-mono">
                        {entry.permission}
                      </Label>
                      {entry.assurance === "fresh_key" && (
                        <span className="type-caption text-faint-foreground">{t("freshKey")}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={`${ids}-reason`}>
                {d("reason")} <span aria-hidden>*</span>
              </Label>
              <Select value={reason ?? ""} onValueChange={setReason} required disabled={busy}>
                <SelectTrigger id={`${ids}-reason`} className="h-11 w-full" aria-required="true">
                  <SelectValue placeholder={d("reasonPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {PROVISION_REASONS.map((code) => (
                    <SelectItem key={code} value={code}>
                      {d(`reasons.${code}` as Parameters<typeof d>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="type-caption text-muted-foreground">{t("note")}</p>
          </>
        )}

        <p role="status" className="type-body-sm">
          {phase === "step_up" && d("stepUp")}
          {phase === "submitting" && d("working")}
          {phase === "success" && t("success")}
        </p>
        {PROBLEMS.includes(phase) && (
          <p role="alert" className="type-body-sm font-bold text-destructive">
            {t(`problems.${phase as "self"}`)}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {phase === "success" || phase === "denied" ? (
            <Button variant="quiet" onClick={close}>
              {d("close")}
            </Button>
          ) : (
            <>
              <Button variant="quiet" disabled={busy} onClick={close}>
                {d("cancel")}
              </Button>
              {phase === "step_up" ? (
                <Button onClick={() => void stepUp()} data-add-operator-key>
                  <KeyRoundIcon aria-hidden />
                  {d("useKey")}
                </Button>
              ) : (
                <Button
                  disabled={!ready}
                  loading={busy}
                  onClick={() => void submit()}
                  data-add-operator-submit
                >
                  {busy ? d("working") : t("submit")}
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
