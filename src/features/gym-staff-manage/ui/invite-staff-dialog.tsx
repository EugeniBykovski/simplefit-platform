"use client";

import { useMutation } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import type { AssignableRole, GymStaffInvitation } from "@/entities/gym-staff";
import { callWithSession } from "@/entities/session";
import { createGymStaffInvitation } from "@/shared/api/generated/endpoints/gym-staff/gym-staff";
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

import { useDialogRefresh } from "../model/refresh";
import { staffProblem, type StaffProblem } from "../model/staff-problem";
import { useProblemText } from "./problem-text";
import { RoleChoice } from "./role-choice";

type Values = { email: string; role: AssignableRole | undefined };

// Immediate feedback only; the backend normalizes and validates the address.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Invite" and its form (WG16 header action; OG11's invite row): an email
 * and a role, sent to `createGymStaffInvitation` (SF-93) for the gym in the
 * path. The roles offered are those the viewer's permission projection
 * allows (the owner: manager, coach, front desk; a manager: coach, front
 * desk), never owner; the backend decides. A new invitation (201) and the
 * one already pending for this address and role (200) carry the same body,
 * and the generated client exposes only the body, so success says what both
 * share: an invitation is pending until its expiry. It never says an email
 * was sent or delivered. Without an answer (a dropped connection) nothing is
 * claimed; sending again is safe, because the backend returns the pending
 * invitation instead of creating another.
 */
export function InviteStaffDialog({
  gymId,
  gymName,
  roles,
}: {
  gymId: string;
  gymName: string;
  roles: readonly AssignableRole[];
}) {
  const t = useTranslations("gymConsole.staff.invite");
  const [open, setOpen] = useState(false);
  const refresh = useDialogRefresh(gymId);
  const toggle = (next: boolean) => {
    setOpen(next);
    if (!next) refresh.onClose();
  };

  return (
    <Dialog open={open} onOpenChange={toggle}>
      <DialogTrigger asChild>
        <Button data-staff-invite>
          <PlusIcon aria-hidden />
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("close")} className="sm:max-w-lg">
        {open && (
          <InviteForm
            gymId={gymId}
            gymName={gymName}
            roles={roles}
            refresh={refresh}
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
  roles,
  refresh,
  onClose,
}: {
  gymId: string;
  gymName: string;
  roles: readonly AssignableRole[];
  refresh: ReturnType<typeof useDialogRefresh>;
  onClose: () => void;
}) {
  const t = useTranslations("gymConsole.staff.invite");
  const roleName = useTranslations("gymConsole.switcher.roles");
  const format = useFormatter();
  const problemText = useProblemText();
  const ids = { email: useId(), role: useId() };
  const [problem, setProblem] = useState<StaffProblem | null>(null);
  const [pendingInvitation, setPendingInvitation] = useState<GymStaffInvitation | null>(null);
  const form = useForm<Values>({
    defaultValues: { email: "", role: roles.length === 1 ? roles[0] : undefined },
  });
  const { errors } = form.formState;
  const role = useWatch({ control: form.control, name: "role" });

  useEffect(() => {
    form.setFocus("email");
  }, [form]);

  const create = useMutation({
    mutationFn: ({ email, role: chosen }: { email: string; role: AssignableRole }) =>
      callWithSession((init) => createGymStaffInvitation(gymId, { email, role: chosen }, init)),
    onSuccess: (response) => {
      setPendingInvitation(response.invitation);
      void refresh.now();
    },
    onError: (error) => {
      refresh.later();
      if (isApiError(error) && error.code === "validation_error") {
        const codes = error.fieldCodes;
        if (codes.email) {
          // SF-93: `invalid` with "is your own address"; a malformed one is `format`.
          form.setError("email", {
            message: t(codes.email.includes("format") ? "email.invalid" : "email.rejected"),
          });
        }
        if (codes.role) form.setError("role", { message: t("role.invalid") });
        if (!codes.email && !codes.role) setProblem({ kind: "failed" });
        return;
      }
      setProblem(staffProblem(error));
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
              role: roleName(pendingInvitation.role),
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

  const pending = create.isPending;
  const submit = form.handleSubmit(({ email, role: chosen }) => {
    if (chosen === undefined) {
      form.setError("role", { message: t("role.required") });
      return;
    }
    setProblem(null);
    create.mutate({ email: email.trim(), role: chosen });
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("title", { gym: gymName })}</DialogTitle>
        <DialogDescription>{t("lead")}</DialogDescription>
      </DialogHeader>
      <FormField id={ids.email} label={t("email.label")} error={errors.email?.message}>
        <Input
          id={ids.email}
          type="email"
          autoComplete="off"
          aria-invalid={errors.email !== undefined}
          aria-describedby={errors.email ? describedBy(ids.email) : undefined}
          disabled={pending}
          {...form.register("email", {
            validate: (value) => EMAIL.test(value.trim()) || t("email.invalid"),
          })}
        />
      </FormField>
      <fieldset className="grid gap-2">
        <legend id={ids.role} className="pb-1 type-label text-muted-foreground">
          {t("role.label")}
        </legend>
        <RoleChoice
          roles={roles}
          value={role}
          onChange={(next) => {
            form.clearErrors("role");
            form.setValue("role", next);
          }}
          disabled={pending}
          invalid={errors.role !== undefined}
          labelledBy={ids.role}
        />
        {errors.role?.message && (
          <p role="alert" className="type-caption text-destructive">
            {errors.role.message}
          </p>
        )}
      </fieldset>
      {problem && (
        <Notice
          tone={problem.kind === "failed" || problem.kind === "unknown" ? "coral" : "amber"}
          role="alert"
        >
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
