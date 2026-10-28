"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { useMyGymPages } from "@/entities/gym";
import { signOut } from "@/entities/session";
import {
  contextOptions,
  gymTarget,
  gymWorkspaceOptions,
  initialsOf,
  isKnownEntry,
  useContextSwitch,
  useEntry,
  type GymWorkspace,
  type KnownEntry,
} from "@/features/session-gate";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { ChoiceAvatar, ChoiceRow } from "@/shared/ui/choice-row";
import { Notice } from "@/shared/ui/notice";
import { OnboardingFrame, onboardingActionClass } from "@/shared/ui/onboarding-frame";
import { FailureView, LaunchScreen } from "@/widgets/system-states";

/**
 * The web gym chooser (`web.app.gyms`, SF-88), where the entry resolver's
 * `gym_selection` lands (route-architecture rule 7), in the WCX1 composition.
 * Everything listed is the backend's: the entry's `gym_workspaces` (re-read
 * on every visit, so a revoked membership is gone), then `GET /api/v1/me/gyms`
 * page by page when `gym_workspace_count` says the user has more.
 *
 * - **No gym:** an honest start of gym registration; nothing is created.
 * - **One completed gym and nothing else:** nothing to choose; its console
 *   opens.
 * - **Several:** completed gyms open their console (the choice is recorded
 *   as the landing preference); the user's own draft continues setup, in a
 *   group of its own, never as an operational gym.
 * - The account's completed profiles stay reachable: a gym never replaces
 *   them.
 */
export function GymChooser() {
  const router = useRouter();
  const query = useEntry({});
  const entry = query.data !== undefined && isKnownEntry(query.data) ? query.data : undefined;
  const only =
    entry !== undefined && entry.gym_workspace_count === 1
      ? gymWorkspaceOptions(entry).enter[0]
      : undefined;

  useEffect(() => {
    if (only !== undefined)
      router.replace(routeHref("web.app.gyms._gym-id", { gymId: only.gym_id }));
  }, [only, router]);

  const unknown = query.data !== undefined && entry === undefined;
  if (query.isError || unknown) {
    return (
      <FailureView
        error={query.error ?? new Error("Unknown entry destination")}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (entry === undefined || only !== undefined) return <LaunchScreen />;
  return <GymChooserView entry={entry} />;
}

export function GymChooserView({ entry }: { entry: KnownEntry }) {
  const t = useTranslations("gymConsole.chooser");
  const roles = useTranslations("gymConsole.switcher.roles");
  const contexts = useTranslations("contextSwitcher");
  const gyms = gymWorkspaceOptions(entry);
  const { completed } = contextOptions(entry);
  const pages = useMyGymPages(gyms.more);
  const switching = useContextSwitch();
  const { state } = switching;
  const pending = state.status === "pending";

  // Gyms beyond the entry's 25: completed gyms only (a draft is always the
  // user's own and the entry lists it first).
  const listed = new Set(entry.gym_workspaces.map((gym) => gym.gym_id));
  const extra: Pick<GymWorkspace, "gym_id" | "name" | "role">[] = (pages.data?.pages ?? [])
    .flatMap((page) => page.gyms)
    .filter((gym) => gym.setup_status === "completed" && !listed.has(gym.id))
    .map((gym) => ({ gym_id: gym.id, name: gym.name, role: gym.viewer.role }));
  const enter = [...gyms.enter, ...extra];
  const empty = enter.length === 0 && gyms.setup.length === 0;

  const gymRow = (gym: Pick<GymWorkspace, "gym_id" | "name" | "role">) => (
    <li key={gym.gym_id}>
      <ChoiceRow
        avatar={<ChoiceAvatar tone="gym">{initialsOf(gym.name)}</ChoiceAvatar>}
        title={gym.name}
        line={roles(gym.role)}
        action={t("open")}
        pending={pending}
        opening={pending && state.target === gymTarget(gym.gym_id)}
        openingLabel={contexts("opening")}
        onClick={() => void switching.openGym(gym.gym_id)}
      />
    </li>
  );

  return (
    <OnboardingFrame
      data-gym-chooser
      badge={null}
      actions={
        <Button variant="ghost" className={onboardingActionClass} onClick={() => void signOut()}>
          {t("signOut")}
        </Button>
      }
    >
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-140 flex-col gap-4">
          <p className="type-label text-faint-foreground">{t("eyebrow")}</p>
          <h1 className="type-h2 font-display">{empty ? t("empty.title") : t("title")}</h1>
          <p className="type-body text-muted-foreground">{empty ? t("empty.lead") : t("lead")}</p>

          {empty && (
            <Button asChild size="lg" className="w-fit">
              <Link href={routeHref("web.app.onboarding.gym", {}, { intent: "gym" })}>
                {t("empty.action")}
              </Link>
            </Button>
          )}

          {enter.length > 0 && (
            <section aria-labelledby="gym-chooser-gyms" className="mt-1.5 flex flex-col gap-2.5">
              <h2 id="gym-chooser-gyms" className="type-label text-faint-foreground">
                {t("gyms")}
              </h2>
              <ul className="flex flex-col gap-2.5">{enter.map(gymRow)}</ul>
              {pages.hasNextPage ? (
                <Button
                  variant="quiet"
                  className="w-fit"
                  disabled={pages.isFetching}
                  onClick={() => void pages.fetchNextPage()}
                >
                  {t("more", { count: entry.gym_workspace_count })}
                </Button>
              ) : null}
              {pages.isError && (
                <Notice tone="amber" role="alert">
                  {t("moreFailed")}
                </Notice>
              )}
            </section>
          )}

          {gyms.setup.length > 0 && (
            <section aria-labelledby="gym-chooser-setup" className="mt-1.5 flex flex-col gap-2.5">
              <h2 id="gym-chooser-setup" className="type-label text-faint-foreground">
                {t("setup")}
              </h2>
              <ul className="flex flex-col gap-2.5">
                {gyms.setup.map((gym) => (
                  <li key={gym.gym_id}>
                    <ChoiceRow
                      avatar={<ChoiceAvatar tone="journey">{initialsOf(gym.name)}</ChoiceAvatar>}
                      title={gym.name}
                      line={t("draftLine")}
                      action={t("continue")}
                      pending={pending}
                      opening={pending && state.target === "gym-setup"}
                      openingLabel={contexts("opening")}
                      onClick={() => void switching.continueGymSetup()}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {completed.length > 0 && (
            <section
              aria-labelledby="gym-chooser-profiles"
              className="mt-1.5 flex flex-col gap-2.5"
            >
              <h2 id="gym-chooser-profiles" className="type-label text-faint-foreground">
                {contexts("heading")}
              </h2>
              <ul className="flex flex-col gap-2.5">
                {completed.map((context) => (
                  <li key={context}>
                    <ChoiceRow
                      avatar={
                        <ChoiceAvatar tone={context}>
                          {contexts(`initials.${context}`)}
                        </ChoiceAvatar>
                      }
                      title={contexts(`contexts.${context}`)}
                      line={contexts(`homes.${context}`)}
                      action={t("open")}
                      pending={pending}
                      opening={pending && state.target === context}
                      openingLabel={contexts("opening")}
                      onClick={() => void switching.open(context)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {state.status === "failed" && (
            <Notice tone="amber" role="alert">
              <span className="flex flex-col gap-0.5">
                <span className="font-extrabold">{t("failed.title")}</span>
                <span>{t("failed.body")}</span>
              </span>
            </Notice>
          )}
          <p className="type-caption text-faint-foreground">{t("note")}</p>
        </div>
      </div>
    </OnboardingFrame>
  );
}
