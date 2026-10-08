"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import type { FighterProfile } from "@/entities/fighter-profile";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";

import { basicsFrom, profileFrom } from "../model/form-values";
import { CompletedProfileCard } from "./profile-preview";

/**
 * WF6 "You're in" (Fighter sign-up · complete): shown only once the API has
 * recorded completion (`status: completed`). It states that and nothing else:
 * no email, coach, gym or session is claimed. "Go to my home" goes through
 * the application entry, so the backend resolver (SF-45) picks the
 * destination (the Fighter home once onboarding is complete).
 */
export function CompleteStep({ profile }: { profile: FighterProfile }) {
  const t = useTranslations("fighterOnboarding.done");
  const heading = useRef<HTMLHeadingElement>(null);
  const basics = basicsFrom(profile);
  const firstName = basics.display_name.trim().split(/\s+/)[0] ?? basics.display_name;

  // The step changed under the visitor's focus: move it to the new heading.
  useEffect(() => heading.current?.focus(), []);

  return (
    <div data-complete-step className="flex w-full max-w-140 flex-col items-start gap-5.5">
      <span
        aria-hidden
        className="flex size-16 items-center justify-center rounded-3xl border border-accent-border bg-accent text-highlight"
      >
        <CheckIcon className="size-7" strokeWidth={2.5} />
      </span>
      <p className="type-label text-highlight">{t("eyebrow")}</p>
      <h1 ref={heading} tabIndex={-1} className="type-onboarding-done outline-none">
        {t("title", { name: firstName })}
      </h1>
      <p className="type-body-lg text-pretty text-muted-foreground">{t("lead")}</p>
      <CompletedProfileCard basics={basics} values={profileFrom(profile)} />
      <Button asChild size="xl" className="h-13 rounded-md-lg px-5.5 type-body">
        <Link href={routeHref("web.app")}>{t("home")}</Link>
      </Button>
    </div>
  );
}
