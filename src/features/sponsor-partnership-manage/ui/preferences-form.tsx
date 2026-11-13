"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import {
  usePartnershipActions,
  type PartnershipPolicy,
  type PartnershipPreferencesView,
} from "@/entities/sponsor-partnership";
import { Button } from "@/shared/ui/button";

import { outcomeOf, type FieldMessage, type Outcome } from "../model/outcome";
import {
  GOALS_MAX,
  preferencesPatch,
  preferencesValues,
  type PreferenceField,
  type PreferencesValues,
} from "../model/values";
import { CountedText, OutcomeNotice } from "./form-parts";
import { MarketFields } from "./markets-fields";

/**
 * Edits the organization's partnership preferences (SF-131 on SF-130
 * `PATCH …/partnership-preferences`): interests, markets and goals, no budget
 * (D-SA39). Saves at the revision it read (`0` before the first save) and
 * sends only what changed; a stale copy is refused by the API and the latest
 * is offered instead of overwriting. Shown only when the backend says the
 * viewer may edit (`can_edit`); the API checks again on every save.
 */
export function PreferencesForm({
  sponsorId,
  view,
  policy,
  onDone,
  onReload,
}: {
  sponsorId: string;
  view: PartnershipPreferencesView;
  policy: PartnershipPolicy;
  /** After a save, or on cancel. */
  onDone: () => void;
  /** Reads the preferences again (after a stale save). */
  onReload: () => void;
}) {
  const t = useTranslations("sponsorPartnerships");
  const actions = usePartnershipActions(sponsorId);
  const before = preferencesValues(view);
  const form = useForm<PreferencesValues>({ defaultValues: before });
  const goals = useWatch({ control: form.control, name: "goals" });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [fields, setFields] = useState<Record<string, FieldMessage>>({});
  const [busy, setBusy] = useState(false);

  const error = (field: PreferenceField) => {
    const key = fields[field];
    return key === undefined ? undefined : t(`errors.fields.${key}`);
  };

  const save = form.handleSubmit(async (values) => {
    const patch = preferencesPatch(values, before);
    if (Object.keys(patch).length === 0) return onDone();
    setBusy(true);
    setOutcome(null);
    setFields({});
    try {
      await actions.savePreferences(view.preferences?.revision ?? 0, patch);
      onDone();
    } catch (failure) {
      const next = outcomeOf(failure);
      if (next.kind === "invalid") setFields(next.fields);
      setOutcome(next);
    } finally {
      setBusy(false);
    }
  });

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={save} className="flex flex-col gap-5" aria-busy={busy}>
        <MarketFields idPrefix="pp" policy={policy} error={error} locked={() => busy} />
        <CountedText
          id="pp-goals"
          label={t("fields.goals")}
          help={t("fields.goalsHelp")}
          value={goals}
          limit={GOALS_MAX}
          multiline
          disabled={busy}
          error={error("goals")}
          {...form.register("goals")}
        />
        {outcome !== null && <OutcomeNotice outcome={outcome} />}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? t("interests.saving") : t("interests.save")}
          </Button>
          <Button type="button" variant="quiet" disabled={busy} onClick={onDone}>
            {t("interests.cancel")}
          </Button>
          {outcome?.kind === "stale" && (
            <Button type="button" variant="quiet" onClick={onReload}>
              {t("interests.reload")}
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
