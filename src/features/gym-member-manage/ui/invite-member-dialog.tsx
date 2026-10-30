"use client";

import { useMutation } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import type { GymMemberInvitation } from "@/entities/gym-member";
import { callWithSession } from "@/entities/session";
import { createGymMemberInvitation } from "@/shared/api/generated/endpoints/gym-members/gym-members";
import { isApiError } from "@/shared/api/http/api-error";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { describedBy, FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";
import { Spinner } from "@/shared/ui/spinner";

import { isFailure, memberProblem, type MemberProblem } from "../model/member-problem";
import { useDialogRefresh } from "../model/refresh";
import { useProblemText } from "./problem-text";

// Immediate feedback only; the backend normalizes and validates the address.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Invite member" and its form (SF-95 `createGymMemberInvitation`, E07): one
 * email address for the gym in the path. A new invitation (201) and the one
 * already pending for this address (200) carry the same body, so success
 * says what both share: an invitation is pending until its expiry. It never
 * says an email was sent or delivered, never that the address belongs to a
 * SimpleFit account (the recipient proves that by signing in), and nothing
 * joins anyone: the person becomes a member only by accepting.
 *
 * Where the server keeps member invitations off because invited people
 * cannot answer them in a client yet (409 `recipient_flow_unavailable`), the
 * form says so and, once it is closed, `onUnavailable` lets the page stop
 * offering it. Nothing was created or sent then.
 */
export function InviteMemberDialog({
  gymId,
  gymName,
  onUnavailable,
}: {
  gymId: string;
  gymName: string;
  onUnavailable: () => void;
}) {
  const t = useTranslations("gymConsole.members.invite");
  const [open, setOpen] = useState(false);
  const refresh = useDialogRefresh(gymId);
  // Reported when the dialog closes, so its explanation stays on screen until then.
  const unavailable = useRef(false);
  const toggle = (next: boolean) => {
    setOpen(next);
    if (next) return;
    refresh.onClose();
    if (unavailable.current) onUnavailable();
  };

  return (
    <Dialog open={open} onOpenChange={toggle}>
      <DialogTrigger asChild>
        <Button data-member-invite>
          <PlusIcon aria-hidden />
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("close")} className="sm:max-w-lg">
        {open && (
          <InviteForm
            gymId={gymId}
            gymName={gymName}
            refresh={refresh}
            onUnavailable={() => {
              unavailable.current = true;
            }}
            onClose={() => toggle(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({
  gymId,
  gymName,
  refresh,
  onUnavailable,
  onClose,
}: {
  gymId: string;
  gymName: string;
  refresh: ReturnType<typeof useDialogRefresh>;
  onUnavailable: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("gymConsole.members.invite");
  const format = useFormatter();
  const problemText = useProblemText();
  const emailId = useId();
  const [problem, setProblem] = useState<MemberProblem | null>(null);
  const [pendingInvitation, setPendingInvitation] = useState<GymMemberInvitation | null>(null);
  const form = useForm<{ email: string }>({ defaultValues: { email: "" } });
  const { errors } = form.formState;

  useEffect(() => {
    form.setFocus("email");
  }, [form]);

  const create = useMutation({
    mutationFn: (email: string) =>
      callWithSession((init) => createGymMemberInvitation(gymId, { email }, init)),
    onSuccess: (response) => {
      setPendingInvitation(response.invitation);
      void refresh.now();
    },
    onError: (error) => {
      refresh.later();
      if (isApiError(error) && error.code === "validation_error") {
        const codes = error.fieldCodes;
        if (codes.email) {
          form.setError("email", {
            message: t(codes.email.includes("invalid_format") ? "email.invalid" : "email.rejected"),
          });
        } else setProblem({ kind: "failed" });
        return;
      }
      const next = memberProblem(error);
      if (next.kind === "invitationsUnavailable") onUnavailable();
      setProblem(next);
    },
  });

  if (pendingInvitation) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("pending.title")}</DialogTitle>
          <DialogDescription role="status">
            {t("pending.body", {
              email: pendingInvitation.recipient_email,
              expires: format.dateTime(new Date(pendingInvitation.expires_at), "date"),
            })}
          </DialogDescription>
        </DialogHeader>
        <Notice tone="muted">{t("pending.note")}</Notice>
        <DialogFooter>
          <Button onClick={onClose}>{t("pending.done")}</Button>
        </DialogFooter>
      </>
    );
  }

  if (problem?.kind === "invitationsUnavailable") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("unavailable.title")}</DialogTitle>
          <DialogDescription role="alert">{t("unavailable.body")}</DialogDescription>
        </DialogHeader>
        <Notice tone="muted">{t("unavailable.note")}</Notice>
        <DialogFooter>
          <Button onClick={onClose}>{t("unavailable.done")}</Button>
        </DialogFooter>
      </>
    );
  }

  const pending = create.isPending;
  const submit = form.handleSubmit(({ email }) => {
    setProblem(null);
    create.mutate(email.trim());
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("title", { gym: gymName })}</DialogTitle>
        <DialogDescription>{t("lead")}</DialogDescription>
      </DialogHeader>
      <FormField id={emailId} label={t("email.label")} error={errors.email?.message}>
        <Input
          id={emailId}
          type="email"
          autoComplete="off"
          aria-invalid={errors.email !== undefined}
          aria-describedby={errors.email ? describedBy(emailId) : undefined}
          disabled={pending}
          {...form.register("email", {
            validate: (value) => EMAIL.test(value.trim()) || t("email.invalid"),
          })}
        />
      </FormField>
      <Notice tone="muted">{t("privacy")}</Notice>
      {problem && (
        <Notice tone={isFailure(problem) ? "coral" : "amber"} role="alert">
          {problemText(problem)}
        </Notice>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" aria-busy={pending} disabled={pending}>
          {pending && <Spinner />}
          {pending ? t("sending") : t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
