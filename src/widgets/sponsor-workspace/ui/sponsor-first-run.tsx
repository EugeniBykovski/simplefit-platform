"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CircleAlertIcon, CompassIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type ReactNode, type RefObject } from "react";

import {
  isSponsorFirstRunConflict,
  useSponsorFirstRun,
  useSponsorFirstRunActions,
  type SponsorFirstRun,
  type SponsorFirstRunAction,
} from "@/entities/sponsor-first-run";
import {
  sponsorOrganizationQueryKey,
  type SponsorOrganizationAccess,
} from "@/entities/sponsor-organization";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";

import { SponsorTour } from "./sponsor-tour";

/*
 * SRW1, the partner portal welcome (SF-119; Claude Design `FirstRunSponsor`, MVP),
 * on the overview of the organization in the path, and the flow into SRW2. Both from
 * `GET /api/v1/sponsor-organizations/{sponsor_id}/first-run`, per organization and
 * member, the same on every device.
 */

export type WelcomeAction = "start" | "dismiss";

/** The welcome: not started, in progress (started on another device), or an outcome just kept here. */
export function SponsorWelcome({
  sponsorId,
  firstRun,
  pending,
  failed,
  onStart,
  onDismiss,
}: {
  sponsorId: string;
  firstRun: SponsorFirstRun;
  /** A transition is on its way to the backend. */
  pending: WelcomeAction | undefined;
  /** The last transition failed; nothing changed. */
  failed: boolean;
  onStart: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("sponsorPortal.firstRun.welcome");

  if (firstRun.status === "completed" || firstRun.status === "dismissed") {
    const kept = firstRun.status;
    return (
      <Notice
        tone={kept === "completed" ? "olive" : "amber"}
        role="status"
        icon={kept === "completed" ? CheckIcon : CircleAlertIcon}
        data-first-run-outcome={kept}
        className="rounded-3xl px-5 py-4.5 type-body-sm"
      >
        <span className="flex flex-col gap-0.5">
          <b>{t(`${kept}.title`)}</b>
          <span>{t(`${kept}.body`)}</span>
        </span>
      </Notice>
    );
  }

  const resuming = firstRun.status === "in_progress";
  const steps = [
    {
      key: "details",
      href: routeHref("web.sponsor.settings", { sponsorId }, { section: "organization" }),
    },
    {
      key: "members",
      href: routeHref("web.sponsor.settings", { sponsorId }, { section: "members" }),
    },
    { key: "future", href: undefined },
  ] as const;

  return (
    <section
      aria-labelledby="sponsor-welcome-heading"
      data-tour-target="sponsor-welcome"
      data-first-run-welcome={firstRun.status}
      className="flex min-w-0 flex-col gap-4 rounded-3xl border border-accent-border bg-accent px-5 py-4.5 text-accent-foreground"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex size-13 flex-none items-center justify-center rounded-2xl bg-primary-muted/30 text-highlight"
        >
          <CompassIcon className="size-6.5" strokeWidth={1.8} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="type-label text-highlight">
            {resuming ? t("eyebrowInProgress") : t("eyebrow")}
          </p>
          <h2 id="sponsor-welcome-heading" className="type-title font-display text-pretty">
            {t("title")}
          </h2>
          <p className="type-body-sm text-pretty opacity-85">{t("body")}</p>
        </div>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((step, at) => (
          <li key={step.key} className="flex items-center gap-3 type-body-sm font-bold">
            <span
              aria-hidden
              className="flex size-7 flex-none items-center justify-center rounded-full border border-accent-border type-caption"
            >
              {at + 1}
            </span>
            {step.href === undefined ? (
              <span>{t(`steps.${step.key}`)}</span>
            ) : (
              <Link href={step.href} className="underline-offset-4 hover:underline">
                {t(`steps.${step.key}`)}
              </Link>
            )}
          </li>
        ))}
      </ol>
      {failed && (
        <p
          role="alert"
          className="flex items-center gap-1.5 type-caption font-bold text-warning-subtle-foreground"
        >
          <CircleAlertIcon aria-hidden className="size-4" />
          {t("failed")}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          aria-haspopup="dialog"
          loading={pending === "start"}
          disabled={pending !== undefined}
          onClick={onStart}
          data-first-run-start
        >
          {pending === "start" ? t("starting") : resuming ? t("resume") : t("start")}
        </Button>
        <Button
          variant="quiet"
          loading={pending === "dismiss"}
          disabled={pending !== undefined}
          onClick={onDismiss}
          data-first-run-dismiss
        >
          {t("dismiss")}
        </Button>
      </div>
    </section>
  );
}

/**
 * The first run on the overview (SF-119). Modes:
 *
 * - `off`: the read answered 404 (the organization is gone for this viewer; the
 *   portal re-reads it and shows "not available"), `unavailable` (suspended), or an
 *   outcome kept before this page opened (completed and dismissed never reopen).
 * - `loading`: nothing shows until the backend answered, so no welcome ever flashes.
 * - `error`: the read failed; the overview works without it and offers a retry.
 * - `offer`: `not_started` or `in_progress` (started on another device).
 * - `kept`: an outcome kept on this page, said once until the next visit.
 *
 * A 409 (the other outcome was kept elsewhere) re-reads the state, closes the tour if
 * it is open and shows what the backend kept. Every transition is bound to the
 * organization this flow was rendered for (its parent keys it by id), so nothing
 * started in one organization is ever recorded against another.
 */
export function useSponsorFirstRunFlow(
  access: SponsorOrganizationAccess,
  heading: RefObject<HTMLHeadingElement | null>,
): { panel: ReactNode; overlays: ReactNode } {
  const t = useTranslations("sponsorPortal.firstRun");
  const sponsorId = access.organization.sponsor_id;
  const active = access.organization.status === "active";
  const query = useSponsorFirstRun(sponsorId);
  const transition = useSponsorFirstRunActions(sponsorId);
  const client = useQueryClient();
  const [keptHere, setKeptHere] = useState(false);
  const [pending, setPending] = useState<WelcomeAction>();
  const [failed, setFailed] = useState<WelcomeAction>();
  const [touring, setTouring] = useState(false);

  const data = query.data?.sponsor_id === sponsorId ? query.data : undefined;
  const status = isApiError(query.error) ? query.error.status : undefined;

  // The organization is gone for this viewer (revoked meanwhile): the portal re-reads it.
  useEffect(() => {
    if (status === 404) {
      void client.invalidateQueries({ queryKey: sponsorOrganizationQueryKey(sponsorId) });
    }
  }, [client, sponsorId, status]);

  const act = useCallback(
    async (action: SponsorFirstRunAction) => {
      try {
        const kept = await transition(action);
        if (kept.status === "completed" || kept.status === "dismissed") setKeptHere(true);
        if (kept.status === "unavailable") setTouring(false);
        return kept;
      } catch (error) {
        if (isSponsorFirstRunConflict(error)) {
          setKeptHere(true);
          setTouring(false);
        }
        if (isApiError(error) && (error.status === 404 || error.status === 409)) {
          // Revoked or suspended meanwhile: the portal re-reads the organization.
          void client.invalidateQueries({ queryKey: sponsorOrganizationQueryKey(sponsorId) });
        }
        throw error;
      }
    },
    [client, sponsorId, transition],
  );

  const start = async () => {
    setPending("start");
    setFailed(undefined);
    try {
      const kept = await act("start");
      if (kept.status === "in_progress") setTouring(true);
    } catch {
      setFailed("start");
    } finally {
      setPending(undefined);
    }
  };

  const dismiss = async () => {
    setPending("dismiss");
    setFailed(undefined);
    try {
      await act("dismiss");
    } catch (error) {
      if (!isSponsorFirstRunConflict(error)) setFailed("dismiss");
    } finally {
      setPending(undefined);
    }
  };

  let panel: ReactNode = null;
  if (!active || status === 404) panel = null;
  else if (data === undefined) {
    panel = query.isError ? (
      <Notice tone="amber" role="alert" data-first-run-error>
        <span className="flex flex-col items-start gap-1">
          <span>{t("loadFailed")}</span>
          <Button variant="link" className="h-auto p-0" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </span>
      </Notice>
    ) : // Nothing until the backend answered: no welcome flashes, nothing shifts for members who finished.
    null;
  } else if (
    data.status === "not_started" ||
    data.status === "in_progress" ||
    (keptHere && (data.status === "completed" || data.status === "dismissed"))
  ) {
    panel = (
      <SponsorWelcome
        sponsorId={sponsorId}
        firstRun={data}
        pending={pending}
        failed={failed !== undefined}
        onStart={() => void start()}
        onDismiss={() => void dismiss()}
      />
    );
  }

  const overlays =
    data === undefined || !active ? null : (
      <SponsorTour
        // A 404 (revoked meanwhile) closes the tour at once, before the portal re-reads.
        open={touring && status !== 404}
        viewsContacts={access.membership.permissions.includes("view_contacts")}
        onComplete={() => act("complete")}
        onDismiss={() => act("dismiss")}
        onClose={() => setTouring(false)}
        onClosed={() => heading.current?.focus()}
      />
    );

  return { panel, overlays };
}
