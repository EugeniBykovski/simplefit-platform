"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import type { SponsorOrganizationAccess } from "@/entities/sponsor-organization";
import {
  usePartnershipPolicy,
  usePartnershipPreferences,
  type PartnershipPreferencesView,
} from "@/entities/sponsor-partnership";
import { PreferencesForm } from "@/features/sponsor-partnership-manage";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { FailureView } from "@/widgets/system-states";

import {
  AnswerRow,
  PartnershipCard,
  PartnershipPage,
  useMarketWords,
  useRecheckOnNotFound,
} from "./partnership-parts";
import { useSponsorWorkspace } from "./sponsor-workspace";

/**
 * `web.sponsor.interests` (SF-131): the organization's partnership interests,
 * markets and goals (SF-130 preferences), beside what its application
 * submitted, read-only and never changed by these. The owner and managers of
 * an active organization edit them when the backend says so (`can_edit`);
 * everyone else reads. No budget is shown or collected (D-SA39). No artboard:
 * composed from SP3, SP4 and SP6 and the SPX9 card (D-SF131-PARTNERSHIP-BOARDS).
 */
export function SponsorInterests() {
  return <SponsorInterestsView access={useSponsorWorkspace()} />;
}

export function SponsorInterestsView({ access }: { access: SponsorOrganizationAccess }) {
  const t = useTranslations("sponsorPartnerships.interests");
  const sponsorId = access.organization.sponsor_id;
  const query = usePartnershipPreferences(sponsorId);
  const notFound = useRecheckOnNotFound(sponsorId, query.error);
  // Only the answer for this organization is shown (keys are per organization).
  const view = query.data?.sponsor_id === sponsorId ? query.data : undefined;

  return (
    <PartnershipPage access={access} title={t("title")} state="interests">
      <p className="max-w-160 type-body-sm text-muted-foreground">{t("lead")}</p>
      {view !== undefined ? (
        <Current
          key={sponsorId}
          sponsorId={sponsorId}
          view={view}
          onReload={() => void query.refetch()}
        />
      ) : query.isError && !notFound ? (
        <FailureView error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Skeleton className="h-48 w-full rounded-3xl lg:max-w-200" />
      )}
      {view?.application_answers != null && <FromApplication view={view} />}
    </PartnershipPage>
  );
}

function Current({
  sponsorId,
  view,
  onReload,
}: {
  sponsorId: string;
  view: PartnershipPreferencesView;
  onReload: () => void;
}) {
  const t = useTranslations("sponsorPartnerships.interests");
  const format = useFormatter();
  const words = useMarketWords();
  const policy = usePartnershipPolicy();
  const [editing, setEditing] = useState(false);
  const saved = view.preferences;

  if (editing && view.can_edit) {
    return (
      <PartnershipCard title={t("current")} labelledBy="partnership-current">
        {policy.data !== undefined ? (
          <PreferencesForm
            sponsorId={sponsorId}
            view={view}
            policy={policy.data}
            onDone={() => setEditing(false)}
            onReload={() => {
              setEditing(false);
              onReload();
            }}
          />
        ) : policy.isError ? (
          <FailureView error={policy.error} onRetry={() => void policy.refetch()} />
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </PartnershipCard>
    );
  }

  return (
    <PartnershipCard
      title={t("current")}
      labelledBy="partnership-current"
      lead={
        saved === null
          ? undefined
          : t("updated", { date: format.dateTime(new Date(saved.updated_at), "date") })
      }
      actions={
        view.can_edit ? (
          <Button type="button" variant="quiet" onClick={() => setEditing(true)}>
            {saved === null ? t("add") : t("edit")}
          </Button>
        ) : undefined
      }
    >
      {saved === null ? (
        <p className="type-body-sm text-muted-foreground" data-preferences-empty>
          {view.can_edit ? t("emptyEditable") : t("emptyReadOnly")}
        </p>
      ) : (
        <dl className="flex flex-col gap-3">
          <AnswerRow label={t("interests")}>{words.interests(saved.interests)}</AnswerRow>
          <AnswerRow label={t("markets")}>
            {words.markets(saved.market_scope, saved.market_countries, saved.market_cities)}
          </AnswerRow>
          <AnswerRow label={t("goals")}>{saved.goals ?? words.none}</AnswerRow>
        </dl>
      )}
      {!view.can_edit && <p className="type-caption text-faint-foreground">{t("readOnly")}</p>}
    </PartnershipCard>
  );
}

function FromApplication({ view }: { view: PartnershipPreferencesView }) {
  const t = useTranslations("sponsorPartnerships.interests");
  const format = useFormatter();
  const words = useMarketWords();
  const answers = view.application_answers;
  if (answers === null) return null;
  return (
    <PartnershipCard
      title={t("application")}
      labelledBy="partnership-application"
      lead={t("applicationLead", {
        date: format.dateTime(new Date(answers.submitted_at), "date"),
      })}
    >
      <dl className="flex flex-col gap-3">
        <AnswerRow label={t("interests")}>{words.interests(answers.interests)}</AnswerRow>
        <AnswerRow label={t("markets")}>
          {words.markets(answers.market_scope, answers.market_countries, answers.market_cities)}
        </AnswerRow>
        <AnswerRow label={t("goals")}>{answers.goals ?? words.none}</AnswerRow>
      </dl>
    </PartnershipCard>
  );
}
