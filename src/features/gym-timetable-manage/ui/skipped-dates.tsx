"use client";

import { useFormatter, useTranslations } from "next-intl";

import { printable, type GymClassSkippedDate } from "@/entities/gym-timetable";
import { Notice } from "@/shared/ui/notice";

/**
 * The dates of a weekly rule on which the backend scheduled no class
 * because the local start time does not exist (clocks go forward) or exists
 * twice (clocks go back) in the venue's zone. Listed as they are, with why;
 * nothing is moved or added for them.
 */
export function SkippedDates({
  dates,
  zone,
}: {
  dates: readonly GymClassSkippedDate[];
  zone: string;
}) {
  const t = useTranslations("gymConsole.timetable.skipped");
  const format = useFormatter();
  return (
    <Notice tone="amber" role="status" data-skipped-dates={dates.length}>
      <strong className="font-extrabold">{t("title", { count: dates.length })}</strong>{" "}
      {t("body", { zone })}
      <ul className="mt-2 flex flex-col gap-1">
        {dates.map((skipped) => (
          <li
            key={skipped.local_date}
            data-skipped-date={skipped.local_date}
            data-skipped-reason={skipped.reason}
          >
            <span className="font-bold">
              {format.dateTime(printable(skipped.local_date), {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              })}
            </span>{" "}
            · {t(`reasons.${skipped.reason}`)}
          </li>
        ))}
      </ul>
      <p className="mt-2">{t("hint")}</p>
    </Notice>
  );
}
