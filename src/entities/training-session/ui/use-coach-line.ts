"use client";

import { useTranslations } from "next-intl";

import { coachIdentity, type MyTrainingSession } from "../model/my-training-session";

/**
 * The coach line of one of the fighter's sessions: the display name (and
 * brand) while the relationship is active, "Former coach · name" after it
 * ended, or "Coach not shared" when no name was disclosed. `name` is what
 * the completion confirmation names; `faint` marks the line as secondary.
 */
export function useCoachLine() {
  const t = useTranslations("fighterTraining.coach");
  return (session: Pick<MyTrainingSession, "coach" | "coach_display_name_at_end">) => {
    const { name, brand, former } = coachIdentity(session);
    if (name === null) return { line: t("notShared"), name: null, faint: true };
    if (former) return { line: t("former", { name }), name, faint: true };
    return { line: brand ? t("withBrand", { name, brand }) : name, name, faint: false };
  };
}
