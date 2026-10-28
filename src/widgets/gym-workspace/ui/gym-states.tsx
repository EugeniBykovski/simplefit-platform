"use client";

import { LockIcon, SearchXIcon, WrenchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { Gym } from "@/entities/gym";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";

/** A console state: the page header, then one message card. */
function StatePage({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div data-gym-state className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="type-label text-faint-foreground">{eyebrow}</p>
          <h1 className="truncate type-h3 font-display">{title}</h1>
        </div>
      </PageHeader>
      <PageBody className="pt-5.5">
        <section className="rounded-3xl border bg-surface px-5 py-4.5">{children}</section>
      </PageBody>
    </div>
  );
}

export function StateMessage({
  role = "status",
  icon,
  title,
  body,
  action,
}: {
  role?: "status" | "alert";
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div role={role} className="flex flex-col items-start gap-2.5 px-2 py-8">
      <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-highlight">
        {icon}
      </span>
      <p className="type-title font-display">{title}</p>
      <p className="max-w-130 type-body-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

/**
 * Not available (route rule 9): the gym is unknown, someone else's, or the
 * user's membership ended. The backend answers all of them with 404, and so
 * does this state: it never says which, nor that the gym exists.
 */
export function GymNotAvailable() {
  const t = useTranslations("gymConsole.states");
  return (
    <StatePage eyebrow={t("eyebrow")} title={t("notAvailable.heading")}>
      <StateMessage
        icon={<SearchXIcon aria-hidden className="size-5" />}
        title={t("notAvailable.title")}
        body={t("notAvailable.body")}
        action={
          <Button asChild variant="quiet">
            <Link href={routeHref("web.app.gyms")}>{t("notAvailable.action")}</Link>
          </Button>
        }
      />
    </StatePage>
  );
}

/**
 * Role-restricted (403, ADR 0026 D-G24): the user works at this gym, but
 * their role does not include what the page needs. It names no other role's
 * data and offers the console's dashboard.
 */
export function GymRestricted({ gymId }: { gymId?: string }) {
  const t = useTranslations("gymConsole.states");
  return (
    <StatePage eyebrow={t("eyebrow")} title={t("restricted.heading")}>
      <StateMessage
        icon={<LockIcon aria-hidden className="size-5" />}
        title={t("restricted.title")}
        body={t("restricted.body")}
        action={
          gymId === undefined ? undefined : (
            <Button asChild variant="quiet">
              <Link href={routeHref("web.app.gyms._gym-id", { gymId })}>
                {t("restricted.action")}
              </Link>
            </Button>
          )
        }
      />
    </StatePage>
  );
}

/**
 * A draft gym (setup not completed) is never an operational workspace: no
 * console page renders for it. The owner continues setup, which resumes this
 * draft (`continue_setup` belongs to the role that completes setup).
 */
export function GymDraftState({ gym }: { gym: Gym }) {
  const t = useTranslations("gymConsole.states");
  const canContinue = gym.viewer.permissions.includes("complete_setup");
  return (
    <StatePage eyebrow={t("eyebrow")} title={gym.name}>
      <StateMessage
        icon={<WrenchIcon aria-hidden className="size-5" />}
        title={t("draft.title")}
        body={canContinue ? t("draft.body") : t("draft.bodyStaff")}
        action={
          canContinue ? (
            <Button asChild>
              <Link href={routeHref("web.app.onboarding.gym", {}, { intent: "gym" })}>
                {t("draft.action")}
              </Link>
            </Button>
          ) : undefined
        }
      />
    </StatePage>
  );
}
