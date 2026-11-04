"use client";

import { CheckIcon, ClockIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Gym } from "@/entities/gym";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { PageBody } from "@/shared/ui/page";

/*
 * OG13 "Community defaults" / WG10 (`web.app.gyms._gym-id.settings.community`;
 * Claude Design 1793198527-a0fc, WebSetupCommunity and
 * WebCommunitySettings, FUTURE boards built with adaptations).
 *
 * None of the designed settings (community feed, challenges, coaches or
 * schedule on a public page, members seeing each other, discoverability,
 * open sparring, shared sessions, public leaderboards, member discovery) has
 * a backend domain that would enforce it, so none is stored or shown as a
 * working switch (SF-103): they are listed as coming later. What holds
 * today is stated as such: the platform guarantees that no gym role reads
 * members' private data (ADR 0026 D-G06), whatever a gym setting says, and
 * the one real enrollment setting (auto-approval of join requests, SF-95)
 * stays on the Members page. Nothing about members is shown or counted.
 */

const FUTURE = [
  "communityFeed",
  "challenges",
  "publicProfile",
  "memberVisibility",
  "discoverability",
  "openSparring",
  "sharedSessions",
  "leaderboards",
] as const;

const NEVER = ["messages", "training", "health", "coachNotes", "location"] as const;
const SEES = ["attendance", "membership", "contact"] as const;

export function GymCommunityDefaults({ gym }: { gym: Gym }) {
  const t = useTranslations("gymCommunity");

  return (
    <PageBody
      className="grid items-start gap-4 pt-5.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
      data-gym-community
    >
      <div className="flex min-w-0 flex-col gap-4">
        <p className="type-body-sm text-muted-foreground">{t("lead")}</p>
        <section aria-labelledby="community-future" className="flex flex-col gap-2">
          <h2 id="community-future" className="px-1 type-label text-faint-foreground">
            {t("future.title")}
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-3xl border border-border bg-card px-4">
            {FUTURE.map((key) => (
              <li key={key} className="flex items-center gap-3 py-3.5" data-community-setting={key}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="type-body-sm font-extrabold text-muted-foreground">
                    {t(`future.items.${key}.title`)}
                  </span>
                  <span className="type-caption text-faint-foreground">
                    {t(`future.items.${key}.body`)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 type-caption text-faint-foreground">
                  <ClockIcon aria-hidden className="size-3.5" />
                  {t("future.soon")}
                </span>
              </li>
            ))}
          </ul>
          <p className="px-1 type-caption text-faint-foreground">{t("future.note")}</p>
        </section>
        <section
          aria-labelledby="community-enrollment"
          className="flex flex-col gap-1.5 rounded-3xl border border-border bg-card px-5 py-4"
        >
          <h2 id="community-enrollment" className="type-body-sm font-extrabold">
            {t("enrollment.title")}
          </h2>
          <p className="type-body-sm text-muted-foreground">{t("enrollment.body")}</p>
          <Link
            href={routeHref("web.app.gyms._gym-id.members", { gymId: gym.id })}
            className="type-caption font-extrabold text-highlight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("enrollment.link")}
          </Link>
        </section>
      </div>
      <aside
        aria-labelledby="community-guarantees"
        className="flex min-w-0 flex-col gap-3 rounded-3xl border border-border bg-card px-5 py-5"
      >
        <h2 id="community-guarantees" className="type-label text-faint-foreground">
          {t("guarantees.sees")}
        </h2>
        <ul className="flex flex-col gap-1.5 type-body-sm">
          {SEES.map((key) => (
            <li key={key} className="flex items-start gap-2">
              <CheckIcon aria-hidden className="mt-0.5 size-4 flex-none text-highlight" />
              {t(`guarantees.seesItems.${key}`)}
            </li>
          ))}
        </ul>
        <h2 className="type-label text-destructive-subtle-foreground">{t("guarantees.never")}</h2>
        <ul className="flex flex-col gap-1.5 type-body-sm text-muted-foreground">
          {NEVER.map((key) => (
            <li key={key} className="flex items-start gap-2">
              <XIcon aria-hidden className="mt-0.5 size-4 flex-none" />
              {t(`guarantees.neverItems.${key}`)}
            </li>
          ))}
        </ul>
        <p className="type-caption text-faint-foreground">{t("guarantees.note")}</p>
      </aside>
    </PageBody>
  );
}
