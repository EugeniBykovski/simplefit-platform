"use client";

import { AlertTriangleIcon, KeyRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import {
  CHANGE_FIELDS,
  executeReviewAction,
  previewReviewAction,
  REVIEW_ACTIONS,
  type ActionInput,
  type ChangeField,
  type ReviewAction,
  type ReviewPreview,
} from "@/entities/admin-sponsor-review";
import { needsEnrollment, useOperatorKeys } from "@/entities/operator";
import { isApiError } from "@/shared/api/http/api-error";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

import { ReasonSelect } from "./review-parts";

type Phase =
  | { kind: "input" }
  | { kind: "step_up" }
  | { kind: "confirm"; preview: ReviewPreview }
  | { kind: "submitting"; preview: ReviewPreview }
  | { kind: "success" }
  | { kind: "conflict" }
  | { kind: "expired" }
  | { kind: "unknown"; preview: ReviewPreview }
  | { kind: "invalid" }
  | { kind: "failed" }
  | { kind: "denied" }
  | { kind: "party" };

/** Decisions can't be undone by the applicant: they read as high risk. */
const HIGH_RISK: readonly ReviewAction[] = [
  "approve",
  "reject",
  "suspend_organization",
  "reinstate_organization",
];

/**
 * AS2's action dialogs (SF-124; Claude Design `AdminSponsorDetail`, MVP): a reason (and,
 * for a change request, the answers to revisit and a message), the backend's preview
 * (current and resulting state, impact, one-time confirmation), a fresh key check when
 * the backend asks, then the SF-111 command under one operation id. Nothing shows as
 * done until the backend answers. An unanswered request is "we don't know": checking
 * sends the very same request again, which the backend answers with the current state
 * if it already committed, and never applies twice. A new confirmation is never minted
 * for an unknown outcome.
 */
export function ReviewActionDialog({
  action,
  applicationId,
  label,
  open,
  onOpenChange,
  onSettled,
  returnFocusTo,
}: {
  action: ReviewAction;
  applicationId: string;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After any answer that may have changed the application: read it again. */
  onSettled: () => void;
  /** The button that opened the dialog; focus goes back to it on close. */
  returnFocusTo?: HTMLElement | null;
}) {
  const t = useTranslations("controlPlane.sponsorReview.action");
  const fieldNames = useTranslations("controlPlane.sponsorReview.fields");
  const keys = useOperatorKeys();
  const { permission, reasons } = REVIEW_ACTIONS[action];
  const [reason, setReason] = useState<string | undefined>(
    reasons.length === 1 ? reasons[0] : undefined,
  );
  const [fields, setFields] = useState<ChangeField[]>([]);
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const operation = useRef<string | null>(null);
  const changes = action === "request_changes";

  const input: ActionInput = {
    reason: reason ?? "",
    ...(changes && { fields, message: message.trim() }),
  };
  const ready =
    reason !== undefined && (!changes || (fields.length > 0 && message.trim().length > 0));

  const reset = () => {
    setPhase({ kind: "input" });
    setReason(reasons.length === 1 ? reasons[0] : undefined);
    setFields([]);
    setMessage("");
    operation.current = null;
  };

  const problem = (error: unknown): Phase => {
    if (!isApiError(error)) return { kind: "failed" };
    // SF-157: no keys yet; the gate shows key registration instead.
    if (needsEnrollment(error)) return { kind: "failed" };
    if (error.code === "step_up_required") return { kind: "step_up" };
    if (error.code === "forbidden" || error.status === 404) return { kind: "denied" };
    if (error.code === "conflict" && error.details.target === "self") return { kind: "party" };
    if (error.code === "conflict" || error.code === "revision_conflict")
      return { kind: "conflict" };
    if (error.code === "confirmation_invalid" || error.code === "confirmation_required")
      return { kind: "expired" };
    if (error.code === "validation_error") return { kind: "invalid" };
    return { kind: "failed" };
  };

  const review = async () => {
    if (!ready) return;
    operation.current = null;
    try {
      setPhase({
        kind: "confirm",
        preview: await previewReviewAction(action, applicationId, input),
      });
    } catch (error) {
      const next = problem(error);
      setPhase(next);
      // A refusal can mean the application moved on: show its current state.
      if (["conflict", "denied", "party"].includes(next.kind)) onSettled();
    }
  };

  const run = async (preview: ReviewPreview) => {
    operation.current ??= crypto.randomUUID();
    setPhase({ kind: "submitting", preview });
    try {
      await executeReviewAction(action, applicationId, input, preview, operation.current);
      setPhase({ kind: "success" });
      onSettled();
    } catch (error) {
      // No answer at all: it may or may not have committed. Keep the exact request.
      const next: Phase = isApiError(error) ? problem(error) : { kind: "unknown", preview };
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
  const settled = ["success", "conflict", "denied", "party"].includes(phase.kind);
  const editable = phase.kind === "input" || phase.kind === "invalid" || phase.kind === "failed";
  const impactName = (code: string) =>
    t.has(`impacts.${code}` as Parameters<typeof t.has>[0])
      ? t(`impacts.${code}` as Parameters<typeof t>[0])
      : code;
  const stateName = (code: string) =>
    t.has(`states.${code}` as Parameters<typeof t.has>[0])
      ? t(`states.${code}` as Parameters<typeof t>[0])
      : code;

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
        className="max-h-[90vh] overflow-y-auto sm:max-w-140"
        onCloseAutoFocus={(event) => {
          if (returnFocusTo?.isConnected) {
            event.preventDefault();
            returnFocusTo.focus();
          }
        }}
        data-review-action={action}
        data-phase={phase.kind}
      >
        <div className="flex flex-wrap items-center gap-2">
          {HIGH_RISK.includes(action) && (
            <Badge variant="destructive" className="gap-1.5 uppercase">
              <AlertTriangleIcon aria-hidden className="size-3.5" />
              {t("risk")}
            </Badge>
          )}
          <span className="type-caption text-muted-foreground">{t("needs", { permission })}</span>
        </div>
        <DialogTitle className="type-h3 font-display">
          {t(`titles.${action}`, { organization: label })}
        </DialogTitle>
        <DialogDescription className="type-body-sm text-muted-foreground">
          {t(`bodies.${action}`)}
        </DialogDescription>

        {(phase.kind === "confirm" || phase.kind === "submitting") && (
          <section aria-labelledby="review-action-impact" className="flex flex-col gap-2">
            <h3 id="review-action-impact" className="type-label text-muted-foreground uppercase">
              {t("impact")}
            </h3>
            <p className="type-body-sm">
              {t("transition", {
                from: stateName(phase.preview.current_state),
                to: stateName(phase.preview.proposed_state),
                revision: phase.preview.expected_revision,
              })}
            </p>
            <ul className="flex list-disc flex-col gap-1 ps-5 type-body-sm">
              {phase.preview.impact.map((code) => (
                <li key={code}>{impactName(code)}</li>
              ))}
            </ul>
          </section>
        )}

        {editable && (
          <div className="flex flex-col gap-3">
            {reasons.length > 1 && (
              <ReasonSelect
                id="review-action-reason"
                reasons={reasons}
                value={reason}
                onChange={setReason}
              />
            )}
            {changes && (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="type-body-sm font-bold">
                    {t("fields")} <span aria-hidden>*</span>
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CHANGE_FIELDS.map((field) => (
                      <div key={field} className="flex items-center gap-2">
                        <Checkbox
                          id={`review-field-${field}`}
                          checked={fields.includes(field)}
                          onCheckedChange={(checked) =>
                            setFields((current) =>
                              checked === true
                                ? [...current, field]
                                : current.filter((item) => item !== field),
                            )
                          }
                        />
                        <Label htmlFor={`review-field-${field}`} className="type-body-sm">
                          {fieldNames(field)}
                        </Label>
                      </div>
                    ))}
                  </div>
                </fieldset>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="review-action-message">
                    {t("message")} <span aria-hidden>*</span>
                  </Label>
                  <Textarea
                    id="review-action-message"
                    value={message}
                    maxLength={2000}
                    rows={4}
                    aria-describedby="review-action-message-help"
                    onChange={(event) => setMessage(event.target.value)}
                  />
                  <p id="review-action-message-help" className="type-caption text-muted-foreground">
                    {t("messageHelp")}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        <p role="status" className="type-body-sm">
          {phase.kind === "step_up" && t("stepUp")}
          {phase.kind === "submitting" && t("submitting")}
          {phase.kind === "success" && t("success")}
        </p>
        {["conflict", "expired", "unknown", "invalid", "failed", "denied", "party"].includes(
          phase.kind,
        ) && (
          <p role="alert" className="type-body-sm font-bold text-destructive">
            {t(`outcomes.${phase.kind as "conflict"}`)}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {settled ? (
            <Button
              variant="quiet"
              onClick={() => {
                if (phase.kind === "conflict") onSettled();
                reset();
                onOpenChange(false);
              }}
            >
              {phase.kind === "conflict" ? t("reload") : t("close")}
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
                <Button onClick={() => void stepUp()} data-review-action-key>
                  <KeyRoundIcon aria-hidden />
                  {t("useKey")}
                </Button>
              ) : phase.kind === "unknown" ? (
                <Button onClick={() => void run(phase.preview)} data-review-action-check>
                  {t("checkOutcome")}
                </Button>
              ) : phase.kind === "expired" ? (
                <Button onClick={() => void review()} data-review-action-review>
                  {t("previewAgain")}
                </Button>
              ) : phase.kind === "confirm" || phase.kind === "submitting" ? (
                <Button
                  variant={HIGH_RISK.includes(action) ? "destructive" : "primary"}
                  loading={busy}
                  onClick={() => phase.kind === "confirm" && void run(phase.preview)}
                  data-review-action-confirm
                >
                  {busy ? t("working") : t(`confirm.${action}`)}
                </Button>
              ) : (
                <Button disabled={!ready} onClick={() => void review()} data-review-action-review>
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
