"use client";

import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";

import {
  coachInvitationsKey,
  dataRulesAllowInviting,
  useCoachDataRules,
  type CoachInvitation,
} from "@/entities/coach-invitation";
import { callWithSession } from "@/entities/session";
import { createMyCoachInvitation } from "@/shared/api/generated/endpoints/coaching/coaching";
import type { CoachInvitationList } from "@/shared/api/generated/model";
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
import { Textarea } from "@/shared/ui/textarea";

type Values = { email: string; message: string };

type Outcome =
  | { kind: "form" }
  | { kind: "created" | "existing"; invitation: CoachInvitation }
  | { kind: "blocked" };

type Problem = "limited" | "pendingLimit" | "failed";

// Immediate feedback only; the backend's validation decides.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ONE_PARAGRAPH = /^[^\r\n\t\u0000-\u001f]*$/;

/**
 * "Invite fighter" and its composer (WC7, Claude Design 1792056621-3707):
 * an email and an optional note, sent to `createMyCoachInvitation` (SF-57).
 * The backend owns everything else: it rejects invalid input, enforces the
 * limits and the coach data rules, and answers the same whether or not the
 * address has an account. Success says the invitation was created and the
 * email is on its way, never that it was delivered. While inviting is not
 * available (no published coach data rules, sharing off) the dialog says so
 * and offers no way to send.
 */
export function InviteFighterDialog({ disabled = false }: { disabled?: boolean }) {
  const t = useTranslations("coachFighters");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <PlusIcon aria-hidden />
          {t("invite.open")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("invite.close")} className="sm:max-w-lg">
        {open && <Composer onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Composer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("coachFighters");
  const client = useQueryClient();
  const rules = useCoachDataRules();
  const ids = { email: useId(), note: useId() };
  const [outcome, setOutcome] = useState<Outcome>({ kind: "form" });
  const [problem, setProblem] = useState<{ kind: Problem; minutes?: number } | null>(null);
  const form = useForm<Values>({ defaultValues: { email: "", message: "" } });
  const { errors } = form.formState;

  const create = useMutation({
    mutationFn: (values: Values) =>
      callWithSession((init) =>
        createMyCoachInvitation(
          {
            email: values.email.trim(),
            ...(values.message.trim() === "" ? {} : { message: values.message.trim() }),
          },
          init,
        ),
      ),
    onSuccess: async (response) => {
      // The backend returns an invitation already pending to this address
      // unchanged (no new email): it is then one the coach's list already holds.
      const known = client
        .getQueryData<InfiniteData<CoachInvitationList>>(coachInvitationsKey)
        ?.pages.some((page) =>
          page.invitations.some((item) => item.invitation_id === response.invitation.invitation_id),
        );
      await client.invalidateQueries({ queryKey: coachInvitationsKey });
      setOutcome({ kind: known ? "existing" : "created", invitation: response.invitation });
    },
    onError: (error) => {
      if (!isApiError(error)) return setProblem({ kind: "failed" });
      const codes = error.fieldCodes;
      if (error.code === "validation_error") {
        if (codes.email) {
          // SF-57: `invalid` is only the coach's own verified address; a
          // malformed one is `format` (or `required` / `length`).
          form.setError("email", {
            message: t(
              codes.email.includes("invalid") ? "invite.email.own" : "invite.email.invalid",
            ),
          });
        }
        if (codes.message) form.setError("message", { message: t("invite.note.invalid") });
        if (!codes.email && !codes.message) setProblem({ kind: "failed" });
        return;
      }
      if (error.code === "rate_limited") {
        return setProblem({
          kind: "limited",
          minutes: Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60)),
        });
      }
      if (error.code === "conflict" && error.details["pending_invitations"] === "limit_reached") {
        return setProblem({ kind: "pendingLimit" });
      }
      // Data rules not acknowledged or not published, or sharing off.
      if (error.code === "conflict" || error.status === 404) return setOutcome({ kind: "blocked" });
      setProblem({ kind: "failed" });
    },
  });

  // The data rules load after the dialog opened (and took focus): once the
  // form appears, the address is where typing starts.
  const showForm =
    outcome.kind === "form" && rules.data !== undefined && dataRulesAllowInviting(rules.data);
  useEffect(() => {
    if (showForm) form.setFocus("email");
  }, [showForm, form]);

  if (rules.data === undefined && !rules.isError) {
    return (
      <div className="flex justify-center py-8">
        <Spinner label={t("invite.title")} />
      </div>
    );
  }

  if (outcome.kind === "blocked" || rules.isError || !dataRulesAllowInviting(rules.data)) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("invite.blocked.title")}</DialogTitle>
          <DialogDescription>{t("invite.blocked.body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>{t("invite.blocked.close")}</Button>
        </DialogFooter>
      </>
    );
  }

  if (outcome.kind === "created" || outcome.kind === "existing") {
    const email = outcome.invitation.recipient_email;
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            {t(`invite.${outcome.kind === "created" ? "sent" : "existing"}.title`)}
          </DialogTitle>
          <DialogDescription role="status">
            {t(`invite.${outcome.kind === "created" ? "sent" : "existing"}.body`, { email })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>{t("invite.sent.done")}</Button>
        </DialogFooter>
      </>
    );
  }

  const pending = create.isPending;
  const submit = form.handleSubmit((values) => {
    setProblem(null);
    create.mutate(values);
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("invite.title")}</DialogTitle>
        <DialogDescription>{t("invite.lead")}</DialogDescription>
      </DialogHeader>
      <FormField id={ids.email} label={t("invite.email.label")} error={errors.email?.message}>
        <Input
          id={ids.email}
          type="email"
          autoComplete="off"
          aria-invalid={errors.email !== undefined}
          aria-describedby={errors.email ? describedBy(ids.email) : undefined}
          disabled={pending}
          {...form.register("email", {
            validate: (value) => EMAIL.test(value.trim()) || t("invite.email.invalid"),
          })}
        />
      </FormField>
      <FormField
        id={ids.note}
        label={t("invite.note.label")}
        help={t("invite.note.help")}
        error={errors.message?.message}
      >
        <Textarea
          id={ids.note}
          rows={3}
          maxLength={500}
          aria-invalid={errors.message !== undefined}
          aria-describedby={describedBy(ids.note)}
          disabled={pending}
          {...form.register("message", {
            validate: (value) =>
              (value.trim().length <= 500 && ONE_PARAGRAPH.test(value.trim())) ||
              t("invite.note.invalid"),
          })}
        />
      </FormField>
      {problem && (
        <Notice tone={problem.kind === "failed" ? "coral" : "amber"} role="alert">
          {problem.kind === "limited"
            ? t("invite.limited", { minutes: problem.minutes ?? 1 })
            : t(`invite.${problem.kind}`)}
        </Notice>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          {t("invite.cancel")}
        </Button>
        <Button type="submit" aria-busy={pending} disabled={pending}>
          {pending && <Spinner />}
          {pending ? t("invite.sending") : t("invite.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
