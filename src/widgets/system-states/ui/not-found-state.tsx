"use client";

import {
  LayoutGridIcon,
  RotateCwIcon,
  SearchIcon,
  TicketIcon,
  TimerIcon,
  UsersIcon,
  WarehouseIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Link, usePathname } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref, type WebRouteId } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Container } from "@/shared/ui/container";

import { KNOCKOUT, useRefereeCount, type RefereePhase } from "../model/referee-count";

const QUICK_LINKS: {
  key: "board" | "gyms" | "coaches" | "pricing";
  route: WebRouteId;
  icon: LucideIcon;
}[] = [
  { key: "board", route: "web.app.board", icon: LayoutGridIcon },
  { key: "gyms", route: "web.marketplace", icon: WarehouseIcon },
  { key: "coaches", route: "web.coaches", icon: UsersIcon },
  { key: "pricing", route: "web.pricing", icon: TicketIcon },
];

/**
 * There is no search capability yet (SF-34 decision 5): the designed search
 * control and the "Search" action open the Marketplace, where discovery
 * lives. A search feature replaces this target, not ER2.
 */
const SEARCH_ROUTE: WebRouteId = "web.marketplace";

/**
 * ER2 · Web 404 (Claude Design section 35): the referee count, then a
 * knockout or "saved by the bell", with real registry destinations only.
 * Rendered below the public SiteHeader by the not-found boundaries. The count
 * is local presentation state; `initialPhase` and `frozen` exist for
 * deterministic stories and visual QA, production passes neither.
 */
export function NotFoundState({
  initialPhase,
  frozen,
}: {
  initialPhase?: RefereePhase;
  frozen?: boolean;
}) {
  const t = useTranslations("system.notFound");
  const referee = useRefereeCount({ initialPhase, frozen });
  const pathname = usePathname();
  const search = useRef<HTMLAnchorElement>(null);
  const { phase, count } = referee;

  // "/" focuses the search control, as its key hint says.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, [contenteditable]") !== null;
      if (event.key !== "/" || typing) return;
      event.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const home = routeHref("web.root");

  return (
    <Container className="grid flex-1 items-center gap-16 pt-14 pb-10 desktop:grid-cols-[600px_1fr]">
      <div className="flex min-w-0 flex-col gap-6">
        <RefereeCount phase={phase} count={count} compact className="desktop:hidden" />
        <div className="flex flex-col gap-2.5">
          <p className="type-label-lg text-highlight">{t(`${phase}.kicker`)}</p>
          <h1 className="type-h1 text-balance sm:type-hero">{t(`${phase}.title`)}</h1>
          <p className="type-body text-pretty text-muted-foreground sm:type-lead">
            {t(`${phase}.description`)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {phase === "count" ? (
            <>
              <Button size="xl" onClick={referee.beat}>
                <TimerIcon aria-hidden className="size-4.5" />
                {t("count.beat")}
              </Button>
              <Button size="xl" variant="quiet" asChild>
                <Link href={home}>{t("count.home")}</Link>
              </Button>
            </>
          ) : phase === "ko" ? (
            <>
              <Button size="xl" asChild>
                <Link href={home}>{t("ko.corner")}</Link>
              </Button>
              <Button size="xl" variant="quiet" onClick={referee.again}>
                <RotateCwIcon aria-hidden />
                {t("ko.again")}
              </Button>
            </>
          ) : (
            <>
              <Button size="xl" asChild>
                <Link href={home}>{t("saved.corner")}</Link>
              </Button>
              <Button size="xl" variant="quiet" asChild>
                <Link href={routeHref(SEARCH_ROUTE)}>
                  <SearchIcon aria-hidden />
                  {t("saved.search")}
                </Link>
              </Button>
            </>
          )}
        </div>

        <Link
          ref={search}
          href={routeHref(SEARCH_ROUTE)}
          className="flex h-13.5 items-center gap-2.5 rounded-lg border-[1.5px] border-accent-border bg-surface px-4 type-body-lg text-faint-foreground transition-colors hover:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <SearchIcon aria-hidden className="size-4.5 text-highlight" />
          <span className="flex-1">{t("searchPlaceholder")}</span>
          <kbd aria-hidden className="rounded-xs border border-input px-1.5 py-1 type-label">
            /
          </kbd>
        </Link>

        <nav aria-label={t("quickLinks")}>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {QUICK_LINKS.map(({ key, route, icon: Icon }) => (
              <li key={key}>
                <Link
                  href={routeHref(route)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:bg-surface-elevated focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="flex size-9.5 flex-none items-center justify-center rounded-md bg-accent text-highlight">
                    <Icon aria-hidden className="size-4.5" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="type-body font-extrabold">{t(`links.${key}.title`)}</span>
                    <span className="type-caption text-faint-foreground">
                      {t(`links.${key}.description`)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="relative hidden aspect-square w-full max-w-140 justify-self-center desktop:block">
        <RefereeRing />
        <div className="absolute inset-0 flex items-center justify-center">
          <RefereeCount phase={phase} count={count} />
        </div>
        <p className="absolute -bottom-7.5 left-1/2 -translate-x-1/2 type-micro font-mono whitespace-nowrap text-faint-foreground">
          {t("requested", { path: pathname })}
        </p>
      </div>
      <p className="type-micro font-mono break-all text-faint-foreground desktop:hidden">
        {t("requested", { path: pathname })}
      </p>
    </Container>
  );
}

/** The count, knockout or saved centre of the ring, and the ten count ticks. */
function RefereeCount({
  phase,
  count,
  compact = false,
  className,
}: {
  phase: RefereePhase;
  count: number;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("system.notFound");
  const ticks = (
    <div aria-hidden className="flex gap-1">
      {Array.from({ length: KNOCKOUT }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 rounded-full",
            compact ? "w-2" : "w-3.5",
            index < count ? (phase === "ko" ? "bg-destructive" : "bg-highlight") : "bg-input",
          )}
        />
      ))}
    </div>
  );

  if (phase === "saved") {
    return (
      <div className={cn("flex animate-system-pop flex-col items-center gap-2.5", className)}>
        {/* The saved tile is illustration geometry (a 33 % squircle), drawn in SVG. */}
        <svg aria-hidden viewBox="0 0 200 200" className={compact ? "size-16" : "size-50"}>
          <rect width="200" height="200" rx="66" className="fill-primary" />
          <path
            d="M70.8 102.1 89.6 120.8 129.2 81.3"
            fill="none"
            className="stroke-primary-foreground"
            strokeWidth="12.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="type-label-lg text-highlight">{t("saved.tag", { count })}</span>
      </div>
    );
  }

  if (phase === "ko") {
    return (
      <div className={cn("flex animate-system-shake flex-col items-center gap-2.5", className)}>
        <span className={cn("text-foreground", compact ? "type-metric-xl" : "type-numeral-ko")}>
          404
        </span>
        <span className="rounded-sm bg-destructive-subtle px-2.5 py-1.5 type-label-lg font-semibold text-destructive-subtle-foreground">
          {t("ko.tag")}
        </span>
        {ticks}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <span className="type-label-lg text-faint-foreground">{t("refCount")}</span>
      <span
        key={count}
        className={cn(
          "animate-system-pop text-foreground",
          compact ? "type-metric-xl" : "type-numeral",
        )}
      >
        {count}
      </span>
      <span className="type-count-word text-highlight">{t(`words.${count}` as "words.1")}</span>
      {ticks}
    </div>
  );
}

/** The ring of ER2: a canvas square inside two ropes, with four olive corner posts. */
function RefereeRing() {
  const posts = [
    [22, 22],
    [538, 22],
    [22, 538],
    [538, 538],
  ];
  return (
    <svg aria-hidden viewBox="0 0 560 560" className="absolute inset-0 size-full">
      <rect x="34" y="34" width="492" height="492" rx="26" className="fill-surface-subtle" />
      <rect
        x="18"
        y="18"
        width="524"
        height="524"
        rx="34"
        fill="none"
        className="stroke-border-strong"
        strokeWidth="3"
      />
      <rect
        x="34"
        y="34"
        width="492"
        height="492"
        rx="28"
        fill="none"
        className="stroke-input"
        strokeWidth="2.5"
      />
      <rect
        x="50"
        y="50"
        width="460"
        height="460"
        rx="22"
        fill="none"
        className="stroke-border"
        strokeWidth="2"
      />
      {posts.map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="11" className="fill-highlight" />
          <circle cx={cx} cy={cy} r="4.5" className="fill-accent" />
        </g>
      ))}
    </svg>
  );
}
