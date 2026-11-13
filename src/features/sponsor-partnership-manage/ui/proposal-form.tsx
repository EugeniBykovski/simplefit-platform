"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import {
  usePartnershipActions,
  type PartnershipPolicy,
  type PartnershipProposal,
} from "@/entities/sponsor-partnership";
import { Button } from "@/shared/ui/button";

import { keepKey, outcomeOf, type FieldMessage, type Outcome } from "../model/outcome";
import {
  draftInput,
  proposalPatch,
  proposalValues,
  SUMMARY_MAX,
  TITLE_MAX,
  type ProposalField,
  type ProposalValues,
} from "../model/values";
import { CountedText, OutcomeNotice } from "./form-parts";
import { MarketFields } from "./markets-fields";

/**
 * A partnership request's answers (SF-131 on SF-130): a new draft
 * (`proposal` null, `POST …/partnership-proposals`) or the edit of a draft or
 * a request with changes requested (`PATCH …/{id}` at its revision). After a
 * change request only the answers it names can change (the API refuses others
 * with `not_requested`; the form greys them). Nothing here submits: a draft is
 * saved, then submitted on its own page. The request is nonbinding and names
 * no opportunity, athlete, gym, budget or amount.
 */
export function ProposalForm({
  sponsorId,
  policy,
  proposal,
  onSaved,
  onCancel,
  onReload,
}: {
  sponsorId: string;
  policy: PartnershipPolicy;
  proposal: PartnershipProposal | null;
  onSaved: (proposal: PartnershipProposal) => void;
  onCancel: () => void;
  /** Reads the request again (after a stale save). */
  onReload?: () => void;
}) {
  const t = useTranslations("sponsorPartnerships");
  const actions = usePartnershipActions(sponsorId);
  const before = proposalValues(proposal);
  const form = useForm<ProposalValues>({ defaultValues: before });
  const [title, summary] = useWatch({ control: form.control, name: ["title", "summary"] });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [fields, setFields] = useState<Record<string, FieldMessage>>({});
  const [busy, setBusy] = useState(false);
  // One creation attempt, one key: a retry after a lost answer reuses it, so
  // the API answers with the same draft instead of making a second one.
  const [key, setKey] = useState<string | null>(null);

  const requested = proposal?.change_request?.fields;
  // Outside an open change request's answers (read-only, still submitted as they are).
  const fixed = (field: ProposalField) =>
    requested !== undefined && !(requested as readonly string[]).includes(field);
  const locked = (field: ProposalField) => busy || fixed(field);
  const error = (field: ProposalField) => {
    const message = fields[field];
    return message === undefined ? undefined : t(`errors.fields.${message}`);
  };

  const save = form.handleSubmit(async (values) => {
    setBusy(true);
    setOutcome(null);
    setFields({});
    try {
      let saved: PartnershipProposal;
      if (proposal === null) {
        const attempt = key ?? crypto.randomUUID();
        setKey(attempt);
        saved = await actions.create(attempt, draftInput(values));
      } else {
        const patch = proposalPatch(values, before);
        saved = Object.keys(patch).length === 0 ? proposal : await actions.update(proposal, patch);
      }
      setKey(null);
      onSaved(saved);
    } catch (failure) {
      const next = outcomeOf(failure);
      if (!keepKey(next)) setKey(null);
      if (next.kind === "invalid") setFields(next.fields);
      setOutcome(next);
    } finally {
      setBusy(false);
    }
  });

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={save} className="flex flex-col gap-5" aria-busy={busy}>
        <CountedText
          id="pr-title"
          label={t("fields.title")}
          help={t("fields.titleHelp")}
          value={title}
          limit={TITLE_MAX}
          required
          disabled={busy}
          readOnly={fixed("title")}
          error={error("title")}
          autoComplete="off"
          {...form.register("title")}
        />
        <MarketFields
          idPrefix="pr"
          policy={policy}
          error={error}
          locked={locked}
          interestsRequired
        />
        <CountedText
          id="pr-summary"
          label={t("fields.summary")}
          help={t("fields.summaryHelp")}
          value={summary}
          limit={SUMMARY_MAX}
          required
          multiline
          disabled={busy}
          readOnly={fixed("summary")}
          error={error("summary")}
          {...form.register("summary")}
        />
        {outcome !== null && <OutcomeNotice outcome={outcome} />}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? t("form.saving") : proposal === null ? t("form.create") : t("form.save")}
          </Button>
          <Button type="button" variant="quiet" disabled={busy} onClick={onCancel}>
            {t("form.cancel")}
          </Button>
          {outcome?.kind === "stale" && onReload !== undefined && (
            <Button type="button" variant="quiet" onClick={onReload}>
              {t("form.reload")}
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
