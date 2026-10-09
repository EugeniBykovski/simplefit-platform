import { useTranslations } from "next-intl";

/**
 * FRW1 "Set up your corner" (Claude Design 34b, `FirstRunWebF`): the Fighter's
 * first-run checklist. Every step's completion belongs to a product domain
 * (gym membership, the mobile app, bookings, training logs, privacy settings,
 * partners). None of them exists yet, so no step is done and none links
 * anywhere: each shows "Not available yet" instead of a fake tick, count or
 * destination. A step ticks only from its domain's own state, never from a
 * click, and that state is shared by web and mobile.
 */
export const SETUP_STEPS = ["gym", "app", "classes", "training", "privacy", "partners"] as const;

export function SetupChecklist() {
  const t = useTranslations("fighterHome.checklist");
  const total = SETUP_STEPS.length;
  const done = 0;

  return (
    <section
      aria-labelledby="setup-checklist"
      data-setup-checklist
      className="flex min-w-0 flex-col gap-3 rounded-3xl border border-input bg-surface px-6 pt-5.5 pb-2.5"
    >
      <div className="flex items-end justify-between gap-3">
        <hgroup className="flex flex-col gap-1">
          <p className="type-label text-highlight">{t("label", { count: total })}</p>
          <h2 id="setup-checklist" className="type-h3">
            {t("title")}
          </h2>
        </hgroup>
        <p className="type-title text-accent-foreground">
          <span aria-hidden>
            {done}
            <span className="text-faint-foreground"> / {total}</span>
          </span>
          <span className="sr-only">{t("progress", { done, total })}</span>
        </p>
      </div>
      <div
        role="progressbar"
        aria-label={t("title")}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-highlight"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
      <ul className="flex flex-col">
        {SETUP_STEPS.map((step) => (
          <li
            key={step}
            data-setup-step={step}
            className="flex min-h-14 items-center gap-3 border-b py-1.5"
          >
            <span
              aria-hidden
              className="size-6.5 flex-none rounded-full border-2 border-dashed border-accent-border"
            />
            {/* Below `sm` the status goes under the step, so the step keeps its width. */}
            <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="type-body font-extrabold">{t(`steps.${step}.title`)}</span>
                <span className="type-caption text-faint-foreground">
                  {t(`steps.${step}.body`)}
                </span>
              </span>
              <span className="flex-none type-label text-faint-foreground">{t("unavailable")}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
