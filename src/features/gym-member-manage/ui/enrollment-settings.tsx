"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, KeyRoundIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { gymEnrollmentSettingsKey, type GymEnrollmentSettings } from "@/entities/gym-member";
import { callWithSession } from "@/entities/session";
import {
  disableGymJoinCode,
  rotateGymJoinCode,
  updateGymEnrollmentSettings,
} from "@/shared/api/generated/endpoints/gym-members/gym-members";
import type { GymEnrollmentSettingsResponse } from "@/shared/api/generated/model";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Notice } from "@/shared/ui/notice";
import { Spinner } from "@/shared/ui/spinner";
import { Switch } from "@/shared/ui/switch";

import { isFailure, memberProblem, type MemberProblem } from "../model/member-problem";
import { useMemberRefresh } from "../model/refresh";
import { useProblemText } from "./problem-text";

type Change = "rotate" | "enable" | "disable" | "autoOn" | "autoOff";

/**
 * The gym's join code and auto-approval (SF-95 enrollment settings), as the
 * backend answers them for this viewer:
 *
 * - The code is an enrollment credential, not an identity: anyone holding it
 *   can only *ask* to join. It is shown, copied and changed only here; it is
 *   never written to a URL, storage, analytics or a log. A new code replaces
 *   the old one at once, and the old one is never shown again.
 * - Front desk sees the code to hand it out (`can_manage: false`); owner and
 *   managers (`can_manage: true`) may also issue a new code, switch joining
 *   by code off, and switch auto-approval.
 * - Auto-approval is off by default. Switching it on is confirmed first and
 *   says exactly what it does: a request becomes a membership at once only
 *   for a person with a completed account and a verified sign-in identity;
 *   everyone else still waits for the gym. The page applies nothing itself.
 *
 * Every change shows the backend's answer (the new settings), then reads the
 * gym's member data again.
 */
export function EnrollmentSettingsPanel({
  gymId,
  gymName,
  settings,
}: {
  gymId: string;
  gymName: string;
  settings: GymEnrollmentSettings;
}) {
  const t = useTranslations("gymConsole.members.settings");
  const format = useFormatter();
  const client = useQueryClient();
  const refresh = useMemberRefresh(gymId);
  const problemText = useProblemText();
  const switchId = useId();
  const [confirming, setConfirming] = useState<Change | null>(null);

  const change = useMutation({
    mutationFn: (kind: Change) =>
      callWithSession((init): Promise<GymEnrollmentSettingsResponse> => {
        if (kind === "rotate" || kind === "enable") return rotateGymJoinCode(gymId, init);
        if (kind === "disable") return disableGymJoinCode(gymId, init);
        return updateGymEnrollmentSettings(gymId, { auto_approve: kind === "autoOn" }, init);
      }),
    onSuccess: (response, kind) => {
      // The backend's answer is the state now: the new code replaces the old one at once.
      client.setQueryData(gymEnrollmentSettingsKey(gymId), response);
      setConfirming(null);
      toast.success(t(`done.${kind}`, { gym: gymName }));
      void refresh();
    },
  });
  const pending = change.isPending;
  const problem = change.isError ? memberProblem(change.error) : null;
  const pendingKind = pending ? change.variables : undefined;

  const ask = (kind: Change) => {
    change.reset();
    if (kind === "autoOff" || kind === "enable") change.mutate(kind);
    else setConfirming(kind);
  };
  const closeDialog = () => {
    if (pending) return;
    setConfirming(null);
    if (change.isError) {
      change.reset();
      void refresh();
    }
  };

  const code = settings.join_code;
  const date = (value: string | null) => (value ? format.dateTime(new Date(value), "date") : "");

  return (
    <div className="flex flex-col gap-4" data-member-settings>
      <section
        aria-labelledby="member-code-heading"
        className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface px-5 py-4.5"
      >
        <div className="flex items-center gap-2.5">
          <KeyRoundIcon aria-hidden className="size-4 text-faint-foreground" />
          <h2 id="member-code-heading" className="type-label text-faint-foreground">
            {t("code.heading")}
          </h2>
        </div>
        {code ? (
          <div className="flex flex-wrap items-center gap-3">
            <p
              className={`type-metric-sm font-mono break-all ${pendingKind === "rotate" ? "opacity-50" : ""}`}
              data-join-code
              aria-label={t("code.current")}
            >
              {code}
            </p>
            <Button
              size="sm"
              variant="quiet"
              onClick={() =>
                void navigator.clipboard.writeText(code).then(
                  () => toast.success(t("code.copied")),
                  () => toast.error(t("code.copyFailed")),
                )
              }
            >
              <CopyIcon aria-hidden />
              {t("code.copy")}
            </Button>
          </div>
        ) : (
          <p className="type-body-sm text-muted-foreground" data-join-code-off>
            {t("code.off")}
          </p>
        )}
        <p className="type-caption text-muted-foreground">
          {code ? t("code.howOn") : t("code.howOff")}
        </p>
        {code && settings.join_code_rotated_at && (
          <p className="type-caption text-faint-foreground">
            {t("code.since", { date: date(settings.join_code_rotated_at) })}
          </p>
        )}
        {settings.can_manage ? (
          <div className="flex flex-wrap gap-2.5">
            {code ? (
              <>
                <Button size="sm" variant="quiet" disabled={pending} onClick={() => ask("rotate")}>
                  {t("code.rotate")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive-subtle"
                  disabled={pending}
                  onClick={() => ask("disable")}
                >
                  {t("code.disable")}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                aria-busy={pendingKind === "enable"}
                disabled={pending}
                onClick={() => ask("enable")}
              >
                {pendingKind === "enable" && <Spinner />}
                {t("code.enable")}
              </Button>
            )}
          </div>
        ) : (
          <p className="type-caption text-faint-foreground">{t("readOnly")}</p>
        )}
        {problem && confirming === null && (
          <Notice tone={isFailure(problem) ? "coral" : "amber"} role="alert">
            {problemText(problem)}
          </Notice>
        )}
      </section>

      <section
        aria-labelledby="member-auto-heading"
        className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface px-5 py-4.5"
      >
        <h2 id="member-auto-heading" className="type-label text-faint-foreground">
          {t("auto.heading")}
        </h2>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={switchId} className="type-body-sm font-extrabold">
              {t("auto.label")}
            </label>
            <p className="type-caption text-muted-foreground" id={`${switchId}-help`}>
              {settings.auto_approve ? t("auto.on") : t("auto.off")}
            </p>
          </div>
          <Switch
            id={switchId}
            checked={settings.auto_approve}
            disabled={!settings.can_manage || pending}
            aria-describedby={`${switchId}-help`}
            onCheckedChange={(next) => ask(next ? "autoOn" : "autoOff")}
            data-member-auto-approve
          />
        </div>
        <p className="type-caption text-faint-foreground">{t("auto.verified")}</p>
        {settings.auto_approve_changed_at && (
          <p className="type-caption text-faint-foreground">
            {t("auto.changed", { date: date(settings.auto_approve_changed_at) })}
          </p>
        )}
        {!settings.can_manage && (
          <p className="type-caption text-faint-foreground">{t("readOnly")}</p>
        )}
      </section>

      <Confirm
        open={confirming !== null}
        title={confirming ? t(`confirm.${confirming}.title`, { gym: gymName }) : ""}
        body={confirming ? t(`confirm.${confirming}.body`, { gym: gymName }) : ""}
        confirm={confirming ? t(`confirm.${confirming}.confirm`) : ""}
        keep={t("confirm.keep")}
        pendingLabel={t("confirm.pending")}
        destructive={confirming === "disable"}
        pending={pending}
        problem={problem}
        problemText={problemText}
        onConfirm={() => confirming && change.mutate(confirming)}
        onClose={closeDialog}
      />
    </div>
  );
}

function Confirm({
  open,
  title,
  body,
  confirm,
  keep,
  pendingLabel,
  destructive,
  pending,
  problem,
  problemText,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirm: string;
  keep: string;
  pendingLabel: string;
  destructive: boolean;
  pending: boolean;
  problem: MemberProblem | null;
  problemText: (problem: MemberProblem) => string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {problem && (
          <Notice tone={isFailure(problem) ? "coral" : "amber"} role="alert">
            {problemText(problem)}
          </Notice>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            {keep}
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            aria-busy={pending}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending && <Spinner />}
            {pending ? pendingLabel : confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
