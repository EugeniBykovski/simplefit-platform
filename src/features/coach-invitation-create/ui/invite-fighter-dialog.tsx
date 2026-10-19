"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";

import {
  coachDataRulesKey,
  coachInvitationsKey,
  dataRulesAllowInviting,
  useCoachDataRules,
  type CoachDataRules,
  type CoachInvitation,
} from "@/entities/coach-invitation";
import { callWithSession } from "@/entities/session";
import {
  acknowledgeMyCoachDataRules,
  createMyCoachInvitation,
} from "@/shared/api/generated/endpoints/coaching/coaching";
import type { CoachDataRulesAcknowledgeRequestDocumentLanguage } from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";
import { localeName, matchLocale } from "@/shared/i18n/routing";
import { fillLegalPlaceholders } from "@/shared/lib/legal-text";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
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
import { LegalText } from "@/shared/ui/legal-text";
import { Notice } from "@/shared/ui/notice";
import { Spinner } from "@/shared/ui/spinner";
import { Textarea } from "@/shared/ui/textarea";

type Values = { email: string; message: string };

type Outcome =
  { kind: "form" } | { kind: "pending"; invitation: CoachInvitation } | { kind: "blocked" };

type Problem = "limited" | "pendingLimit" | "failed";

// Immediate feedback only; the backend's validation decides.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ONE_PARAGRAPH = /^[^\r\n\t\u0000-\u001f]*$/;

/**
 * "Invite fighter" and its composer (WC7, Claude Design 1792056621-3707):
 * an email and an optional note, sent to `createMyCoachInvitation` (SF-57).
 * The backend owns everything else: it rejects invalid input, enforces the
 * limits and the coach data rules, and answers the same whether or not the
 * address has an account. The backend answers a new invitation (201, email
 * queued) and one already pending to the address (200, no new email) with
 * the same body, and the generated client exposes only the body: success
 * therefore says only what both share, that an invitation to the address is
 * pending until its expiry, never that an email was sent or delivered. While inviting is not
 * available (no published coach data rules, sharing off) the dialog says so
 * and offers no way to send. Before the first invitation under a data-rules
 * version, the coach reads the backend's approved text of exactly that
 * version in the page language and acknowledges it with an unticked box
 * (SF-72); without an approved text in the page language there is nothing
 * to acknowledge here (never another language instead).
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
  const format = useFormatter();
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
      setOutcome({ kind: "pending", invitation: response.invitation });
      await client.invalidateQueries({ queryKey: coachInvitationsKey });
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
      // A newer data-rules version to acknowledge: show it (SF-72).
      if (error.code === "conflict" && error.details["data_rules_acknowledgement"] === "required") {
        void client.invalidateQueries({ queryKey: coachDataRulesKey });
        return;
      }
      // Data rules not published, or sharing off.
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

  if (
    outcome.kind === "form" &&
    rules.data?.document_version != null &&
    rules.data.document !== null &&
    rules.data.acknowledged_at === null
  ) {
    return (
      <Rules
        rules={rules.data}
        onChanged={() => void rules.refetch()}
        onBlocked={() => setOutcome({ kind: "blocked" })}
        onClose={onClose}
      />
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

  if (outcome.kind === "pending") {
    const { recipient_email: email, expires_at: expires } = outcome.invitation;
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("invite.pending.title")}</DialogTitle>
          <DialogDescription role="status">
            {t("invite.pending.body", {
              email,
              expires: format.dateTime(new Date(expires), "date"),
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>{t("invite.pending.done")}</Button>
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

type AcknowledgeOutcome = "acknowledged" | "stale" | "language" | "blocked";

/**
 * The coach data rules of the version the backend serves (SF-72): the
 * approved summary, the full text on demand and the approved confirmation
 * next to an unticked box. Acknowledging sends exactly that version and the
 * language of the text shown; a newer version or a withdrawn language asks
 * again.
 */
function Rules({
  rules,
  onChanged,
  onBlocked,
  onClose,
}: {
  rules: CoachDataRules;
  onChanged: () => void;
  onBlocked: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("coachFighters.invite.rules");
  const client = useQueryClient();
  const ids = { consent: useId(), full: useId() };
  const [agreed, setAgreed] = useState(false);
  const [full, setFull] = useState(false);
  const [notice, setNotice] = useState<"stale" | "failed" | null>(null);
  const document = rules.document;

  const acknowledge = useMutation({
    mutationFn: async ({
      version,
      language,
    }: {
      version: string;
      language: CoachDataRulesAcknowledgeRequestDocumentLanguage;
    }): Promise<AcknowledgeOutcome> => {
      try {
        await callWithSession((init) =>
          acknowledgeMyCoachDataRules(
            { document_version: version, document_language: language },
            init,
          ),
        );
        return "acknowledged";
      } catch (error) {
        if (isApiError(error) && error.status === 409) {
          return error.details["document_language"] === "unavailable" ? "language" : "stale";
        }
        if (isApiError(error) && error.status === 404) return "blocked";
        throw error;
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey: coachDataRulesKey }),
  });

  if (document === null) return null;
  const { language, summary, checkbox } = document;

  if (language === null || summary === null || checkbox === null) {
    const languages = document.available_languages
      .map((code) => {
        const known = matchLocale(code);
        return known ? localeName(known) : code;
      })
      .join(", ");
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("language", { languages })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>{t("later")}</Button>
        </DialogFooter>
      </>
    );
  }

  const pending = acknowledge.isPending;

  return (
    <div className="grid gap-4" data-testid="invite-rules">
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("version", { version: document.version })}
        </DialogDescription>
      </DialogHeader>
      <div className="max-h-80 overflow-y-auto rounded-2xl border px-4 py-3">
        <LegalText text={summary} headingLevel={3} />
        {document.full !== null && (
          <div id={ids.full} hidden={!full} className="mt-3 border-t pt-3">
            <LegalText text={document.full} headingLevel={3} />
          </div>
        )}
      </div>
      {document.full !== null && (
        <Button
          type="button"
          variant="quiet"
          className="justify-self-start"
          aria-expanded={full}
          aria-controls={ids.full}
          onClick={() => setFull((open) => !open)}
        >
          {full ? t("hideFull") : t("readFull")}
        </Button>
      )}
      {notice && (
        <Notice tone={notice === "failed" ? "coral" : "amber"} role="alert">
          {t(notice)}
        </Notice>
      )}
      <label
        htmlFor={ids.consent}
        className="flex items-start gap-3 rounded-2xl border px-4 py-3.5 type-body-sm"
      >
        <Checkbox
          id={ids.consent}
          className="mt-0.5"
          checked={agreed}
          disabled={pending}
          onCheckedChange={(value) => setAgreed(value === true)}
        />
        <span className="flex flex-col gap-1">
          <span>{fillLegalPlaceholders(checkbox, { version: document.version })}</span>
          <span className="type-caption text-faint-foreground">
            {t("version", { version: document.version })}
          </span>
        </span>
      </label>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          {t("later")}
        </Button>
        <Button
          type="button"
          aria-busy={pending}
          disabled={!agreed || pending}
          onClick={() => {
            setNotice(null);
            acknowledge.mutate(
              { version: document.version, language },
              {
                onSuccess: (outcome) => {
                  if (outcome === "blocked") onBlocked();
                  if (outcome === "stale" || outcome === "language") {
                    setAgreed(false);
                    setNotice("stale");
                    onChanged();
                  }
                },
                onError: () => setNotice("failed"),
              },
            );
          }}
        >
          {pending && <Spinner />}
          {pending ? t("acknowledging") : t("acknowledge")}
        </Button>
      </DialogFooter>
    </div>
  );
}
