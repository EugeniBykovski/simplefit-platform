import { useTranslations } from "next-intl";

import { BrandLoader } from "./brand-loader";
import { CornerTip } from "./corner-tip";
import { LoadingSegments } from "./loading-indicators";

/**
 * LD3 · Web launch (Claude Design section 35): the full-screen state while
 * the web app restores the session before a signed-in surface renders.
 * Rendered by the signed-in layouts as RequireSession's pending state, so it
 * appears only while that real work runs; there is no minimum duration.
 *
 * Geometry follows the 1440 × 900 artboard: the brand block at 190 px and
 * the 440 px progress block at 600 px from the top (proportional to the
 * viewport height), the tagline 30 px above the bottom. Progress is
 * indeterminate: the app has no discrete bootstrap steps to report.
 */
export function LaunchScreen() {
  const t = useTranslations("system.launch");

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy
      aria-label={t("label")}
      className="relative min-h-dvh overflow-hidden bg-system-glow text-foreground [--glow-y:42%]"
    >
      <div className="relative mx-auto h-dvh min-h-180">
        <BrandLoader className="absolute inset-x-0 top-[21.1%]" />
        <div className="absolute top-[66.7%] left-1/2 flex w-110 max-w-[calc(100%-3rem)] -translate-x-1/2 flex-col gap-3.5">
          <p className="type-body-lg font-extrabold">{t("status")}</p>
          <LoadingSegments count={5} />
          <CornerTip label={t("tipLabel")} tip={t("tip")} />
        </div>
        <p className="absolute inset-x-0 bottom-7.5 px-6 text-center type-label text-faint-foreground">
          {t("footer")}
        </p>
      </div>
    </div>
  );
}
