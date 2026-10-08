"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { useAccountProfile, useAccountProfileActions } from "@/entities/account-profile";
import { signOut } from "@/entities/session";
import { AccountBasicsStep } from "@/features/account-registration";
import { Button } from "@/shared/ui/button";
import { Container } from "@/shared/ui/container";
import { Notice } from "@/shared/ui/notice";
import {
  OnboardingFrame,
  OnboardingGrid,
  OnboardingStepCard,
  onboardingActionClass,
} from "@/shared/ui/onboarding-frame";
import { Spinner } from "@/shared/ui/spinner";

/*
 * WA5 Account basics & consent (`web.app.onboarding.account`, SF-46; Claude
 * Design V78 WebAccountBasics, 1440 × 980): the onboarding frame with the
 * neutral "Account setup" badge and Sign out, the three-step card, the form
 * and the "Why we ask" aside.
 *
 * The backend decides everything: SF-44 the registration state, SF-45 where
 * the visitor goes. The onboarding gate (layout) keeps an incomplete account
 * here and sends a complete one to the resolver's destination with the URL's
 * `intent` / `returnTo`; this page only re-asks it when the registration
 * turns out complete (completed here, or in another tab).
 */
export function AccountRegistration() {
  const t = useTranslations("accountRegistration");
  const query = useAccountProfile();
  const { save, complete, resolveAgain } = useAccountProfileActions();
  const status = query.data?.registration.status;

  useEffect(() => {
    if (status === "complete") void resolveAgain();
  }, [status, resolveAgain]);

  let body;
  if (query.isError) {
    body = (
      <Container className="py-12">
        <Notice
          tone="amber"
          icon={TriangleAlertIcon}
          className="max-w-140"
          action={
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="type-caption font-extrabold underline"
            >
              {t("loadFailure.retry")}
            </button>
          }
        >
          <span role="alert" className="flex flex-col gap-0.5">
            <b>{t("loadFailure.title")}</b>
            <span>{t("loadFailure.body")}</span>
          </span>
        </Notice>
      </Container>
    );
  } else if (status === "complete") {
    // Leaving for the resolver's destination (the gate navigates).
    body = (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner label={t("saving")} className="size-6 text-muted-foreground" />
      </div>
    );
  } else {
    body = (
      <OnboardingGrid>
        <OnboardingStepCard
          label={t("nav.label")}
          title={t("nav.title")}
          note={t("nav.note")}
          footnote={t("nav.footnote")}
          steps={[
            { key: "basics", label: t("nav.steps.basics"), state: "current" },
            { key: "start", label: t("nav.steps.start"), state: "todo" },
            { key: "setup", label: t("nav.steps.setup"), state: "later", hint: t("nav.later") },
          ]}
        />
        <AccountBasicsStep profile={query.data} save={save} complete={complete} />
      </OnboardingGrid>
    );
  }

  return (
    <OnboardingFrame
      data-account-registration
      badge={t("frame.badge")}
      badgeVariant="neutral"
      actions={
        <Button variant="ghost" className={onboardingActionClass} onClick={() => void signOut()}>
          {t("frame.signOut")}
        </Button>
      }
    >
      {body}
    </OnboardingFrame>
  );
}
