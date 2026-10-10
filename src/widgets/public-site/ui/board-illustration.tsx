import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";

import { ExampleTag } from "./sections";

/**
 * The Live Board illustration of the L1 and L2 heroes (Claude Design
 * LandHome 560 × 430, LandFighters 520 × 400): a fighter at the centre,
 * dashed links to a gym, a coach, two partners and a fight, and the next
 * class. Drawn from the artboards' geometry with tokens (SF-43 decision: a
 * SimpleFit illustration, no Lucide meaning). It is an example of the
 * product, never anyone's board: one image for assistive technology, tagged
 * as an example.
 */
export function BoardIllustration({ size }: { size: "lg" | "md" }) {
  const t = useTranslations("site.board");
  const common = useTranslations("site.common");
  // Every node sits where both artboards draw it; only the frame differs.
  const links = [
    "M280 215 L140 120",
    "M280 215 L430 130",
    "M280 215 L150 330",
    "M280 215 L420 320",
    "M280 215 L280 70",
  ];

  return (
    <figure
      aria-label={t("description")}
      className={cn(
        "relative w-full overflow-hidden rounded-4xl border border-border bg-surface-sunken bg-[radial-gradient(var(--color-muted)_1px,transparent_1px)] bg-size-[20px_20px]",
        size === "lg" ? "h-107.5 desktop:w-140" : "h-100 desktop:w-130",
      )}
    >
      <div
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-140 -translate-x-1/2 desktop:left-0 desktop:translate-x-0"
      >
        <svg
          width="560"
          height="430"
          className="absolute top-0 left-0 overflow-visible"
          fill="none"
        >
          {links.map((d) => (
            <path
              key={d}
              d={d}
              className="stroke-primary-muted"
              strokeWidth={2}
              strokeDasharray="6 6"
            />
          ))}
        </svg>
        <Node
          className="top-46.25 left-62.5 size-15 bg-highlight text-highlight-foreground ring-accent"
          label={t("nodes.fighter")}
          text="type-title"
        />
        <Node
          className="top-24.5 left-29.5 size-11 bg-primary text-primary-foreground ring-accent"
          label={t("nodes.gym")}
          text="type-micro"
        />
        <Node
          className="top-27.5 left-102.5 size-10 bg-secondary text-secondary-foreground ring-input"
          label={t("nodes.coach")}
          text="type-badge"
        />
        <Node
          className="top-77.5 left-32.5 size-10 bg-input text-foreground ring-muted"
          label={t("nodes.partner")}
          text="type-badge"
        />
        <Node
          className="top-75 left-100 size-10 bg-input text-foreground ring-muted"
          label={t("nodes.sparring")}
          text="type-badge"
        />
        <span className="absolute top-14 left-66.5 size-7 rotate-45 rounded-xs bg-accent-foreground ring-4 ring-accent-strong" />
      </div>
      <ExampleTag label={common("example")} className="absolute top-4 left-4" />
      <div aria-hidden className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1 rounded-3xl border border-border bg-surface px-3.5 py-3">
          <span className="type-label text-highlight">{t("nextLabel")}</span>
          <span className="type-body font-extrabold">{t("nextTitle")}</span>
          <span className="type-caption text-muted-foreground">{t("nextPlace")}</span>
        </div>
        <span className="flex gap-1.5">
          <Badge variant="accent">{t("liveBoard")}</Badge>
          <Badge>{t("year")}</Badge>
        </span>
      </div>
    </figure>
  );
}

function Node({ className, label, text }: { className: string; label: string; text: string }) {
  return (
    <span
      className={cn(
        "absolute flex items-center justify-center rounded-full font-display font-bold ring-5",
        text,
        className,
      )}
    >
      {label}
    </span>
  );
}
