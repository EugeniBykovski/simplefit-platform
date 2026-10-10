import { ArrowRight, Check, X, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Container } from "@/shared/ui/container";

/*
 * The building blocks the public-website artboards share (Claude Design
 * L1–L5, PR1–PR6, SPX1–SPX2; SF-43). They take their copy as props; the
 * pages compose them. Desktop (from the `desktop` breakpoint, 1180 px) draws
 * the 1440 artboards' composition, fluid in width; narrower viewports stack
 * the columns.
 */

/**
 * The body of every public page: the artboards' 56 px / 64 px padding on the
 * site Container, a column with the page's section gap.
 */
export function SitePage({
  gap,
  className,
  children,
}: {
  gap: "4" | "9" | "10";
  className?: string;
  children: ReactNode;
}) {
  const gaps = { "4": "gap-4", "9": "gap-9", "10": "gap-10" } as const;
  return (
    <Container
      data-site-page
      className={cn("flex flex-col py-10 desktop:py-14", gaps[gap], className)}
    >
      {children}
    </Container>
  );
}

const eyebrowTones = {
  highlight: "text-highlight",
  warning: "text-warning",
  muted: "text-primary-muted",
} as const;

/** The 12 px mono kicker above a page headline. */
export function Eyebrow({
  tone = "highlight",
  children,
}: {
  tone?: keyof typeof eyebrowTones;
  children: ReactNode;
}) {
  return <p className={cn("type-site-eyebrow", eyebrowTones[tone])}>{children}</p>;
}

/** The 10 px mono label of a section or a card ("WHO IT’S FOR", "PRIVATE BY DEFAULT"). */
export function SectionLabel({
  tone = "faint",
  as: Tag = "p",
  children,
}: {
  tone?: "faint" | "highlight" | "warning" | "destructive";
  as?: "p" | "h2" | "h3";
  children: ReactNode;
}) {
  const tones = {
    faint: "text-faint-foreground",
    highlight: "text-highlight",
    warning: "text-warning",
    destructive: "text-destructive-subtle-foreground",
  } as const;
  return <Tag className={cn("type-label", tones[tone])}>{children}</Tag>;
}

/** A headline whose second part is olive (`accent`), as every landing hero draws it. */
export function AccentHeading({
  as: Tag = "h1",
  size,
  text,
  accent,
}: {
  as?: "h1" | "h2";
  size: "site-hero-xl" | "site-hero" | "site-hero-md" | "site-title-lg";
  text: string;
  accent?: string;
}) {
  const roles = {
    "site-hero-xl": "type-site-section md:type-site-hero-xl",
    "site-hero": "type-site-section md:type-site-hero",
    "site-hero-md": "type-site-section md:type-site-hero-md",
    "site-title-lg": "type-site-section md:type-site-title-lg",
  } as const;
  return (
    <Tag className={roles[size]}>
      {text}
      {accent === undefined ? null : (
        <>
          {" "}
          <span className="text-highlight">{accent}</span>
        </>
      )}
    </Tag>
  );
}

/** The 46 px heading roles of the pricing family (and the compare / enterprise titles). */
export function PageTitle({
  as: Tag = "h1",
  size = "site-hero-sm",
  children,
}: {
  as?: "h1" | "h2";
  size?: "site-hero-sm" | "site-title" | "site-title-md" | "site-title-sm";
  children: ReactNode;
}) {
  const sizes = {
    "site-hero-sm": "type-site-section md:type-site-hero-sm",
    "site-title": "type-site-section md:type-site-title",
    "site-title-md": "type-site-title-md",
    "site-title-sm": "type-site-title-sm",
  } as const;
  return <Tag className={sizes[size]}>{children}</Tag>;
}

/** The landing lead: 18 px muted. */
export function Lead({ size = "lg", children }: { size?: "lg" | "md"; children: ReactNode }) {
  return (
    <p
      className={cn(
        "text-pretty text-muted-foreground",
        size === "lg" ? "type-site-lead" : "type-lead",
      )}
    >
      {children}
    </p>
  );
}

export type Action = {
  label: string;
  href: string;
  /** Olive (primary) or the graphite quiet action. */
  primary?: boolean;
};

/** A row of 54 px actions (hero and call-to-action bands draw 54 and 52; one size). */
export function ActionRow({
  actions,
  className,
}: {
  actions: readonly Action[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {actions.map((action) => (
        <Button
          key={action.href + action.label}
          asChild
          size="xl"
          variant={action.primary ? "primary" : "quiet"}
        >
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ))}
    </div>
  );
}

/** An olive text link with the trailing arrow ("For fighters →"). */
export function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 rounded-xs type-body font-extrabold text-highlight outline-none hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ArrowRight aria-hidden className="size-4" />
    </Link>
  );
}

/** The surface card every section uses: radius 3xl, hairline border. */
export function SiteCard({
  tone = "default",
  className,
  ...props
}: ComponentProps<"div"> & { tone?: "default" | "accent" }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-3xl border",
        tone === "accent" ? "border-accent-border bg-accent" : "border-border bg-surface",
        className,
      )}
      {...props}
    />
  );
}

/** The 46 px olive icon tile of the feature cards (40 / 42 px in the compact cards). */
export function IconTile({
  icon: Icon,
  size = "lg",
}: {
  icon: LucideIcon | ((props: { className?: string }) => ReactNode);
  size?: "lg" | "md";
}) {
  return (
    <span
      className={cn(
        "flex flex-none items-center justify-center bg-accent text-highlight",
        size === "lg" ? "size-11.5 rounded-md-lg" : "size-10 rounded-md",
      )}
    >
      <Icon aria-hidden className={size === "lg" ? "size-5.75" : "size-5"} />
    </span>
  );
}

/** A feature card: icon tile, 18 px title, 14 px body and an optional arrow link. */
export function FeatureCard({
  icon,
  title,
  body,
  link,
  as: Heading = "h3",
}: {
  icon: LucideIcon | ((props: { className?: string }) => ReactNode);
  title: string;
  body: string;
  link?: { label: string; href: string };
  /** `h2` where no section heading precedes the cards. */
  as?: "h2" | "h3";
}) {
  return (
    <SiteCard className="gap-3 p-5.5">
      <IconTile icon={icon} />
      <Heading className="type-site-card-title">{title}</Heading>
      <p className="type-body text-muted-foreground">{body}</p>
      {link === undefined ? null : <ArrowLink href={link.href}>{link.label}</ArrowLink>}
    </SiteCard>
  );
}

/** A compact card: icon tile beside a title and a line (enterprise features, partner formats). */
export function CompactFeature({
  icon,
  title,
  body,
  titleSize = "body",
  as: Heading = "h3",
}: {
  icon: LucideIcon | ((props: { className?: string }) => ReactNode);
  title: string;
  body: string;
  titleSize?: "body" | "body-lg";
  /** `h2` where no section heading precedes the cards. */
  as?: "h2" | "h3";
}) {
  return (
    <SiteCard className="flex-row items-center gap-3 px-4 py-3.5">
      <IconTile icon={icon} size="md" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <Heading
          className={cn("font-extrabold", titleSize === "body" ? "type-body" : "type-body-lg")}
        >
          {title}
        </Heading>
        <p className="type-caption text-muted-foreground">{body}</p>
      </div>
    </SiteCard>
  );
}

/** A ✓ (or ✕) list: 14 / 1.35 by default, 12 or 13 px in pricing cards. */
export function CheckList({
  items,
  size = "md",
  mark = "check",
}: {
  items: readonly string[];
  size?: "lg" | "md" | "sm" | "xs";
  mark?: "check" | "cross";
}) {
  const text = {
    lg: "type-site-check-lg",
    md: "type-site-check",
    sm: "type-site-check-sm",
    xs: "type-site-check-xs",
  } as const;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className={cn("flex gap-2", text[size])}>
          {mark === "check" ? (
            <Check
              aria-hidden
              className="mt-0.5 size-3.5 flex-none text-highlight"
              strokeWidth={3}
            />
          ) : (
            <X aria-hidden className="mt-0.5 size-3.5 flex-none text-destructive" strokeWidth={3} />
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** The call-to-action band closing the landings: deep olive panel, title and line, actions right. */
export function CtaBand({
  title,
  body,
  actions,
  tone = "accent",
  titleSize = "site-section",
}: {
  title: string;
  body: string;
  actions: readonly Action[];
  tone?: "accent" | "surface";
  titleSize?: "site-section" | "site-section-md";
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-6 rounded-4xl border px-6 py-8 md:px-12 md:py-10 desktop:flex-row desktop:items-center desktop:gap-8",
        tone === "accent" ? "border-accent-border bg-accent" : "border-border bg-surface",
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className={titleSize === "site-section" ? "type-site-section" : "type-site-section-md"}>
          {title}
        </h2>
        <p className="type-body-lg text-muted-foreground">{body}</p>
      </div>
      <ActionRow actions={actions} className="desktop:ml-auto desktop:flex-none" />
    </section>
  );
}

/** A price: the 30 px amount and its unit, baseline-aligned. */
export function PriceTag({
  amount,
  unit,
  size = "xl",
}: {
  amount: string;
  unit?: string;
  /** 30, 26, 22 or 18 px, the artboards' price sizes. */
  size?: "xl" | "lg" | "md" | "sm";
}) {
  const sizes = {
    xl: "type-metric-xl",
    lg: "type-metric-lg",
    md: "type-metric",
    sm: "type-metric-sm",
  } as const;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cn("font-display font-bold text-foreground", sizes[size])}>{amount}</span>
      {unit === undefined ? null : (
        <span
          className={cn(
            "font-bold text-muted-foreground",
            size === "xl" ? "type-body-sm" : "type-caption",
          )}
        >
          {unit}
        </span>
      )}
    </span>
  );
}

/**
 * Marks product illustration as an example (SF-43 decision): the artboards'
 * mockups stay as drawn, inside a frame that says they are not real data.
 */
export function ExampleTag({ label, className }: { label: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("bg-background", className)}>
      {label}
    </Badge>
  );
}

/** The always-open FAQ grid of the pricing artboards. */
export function FaqGrid({
  label,
  items,
}: {
  label: string;
  items: readonly { question: string; answer: string }[];
}) {
  return (
    <section aria-labelledby="site-faq" className="flex flex-col gap-3.5">
      <h2 id="site-faq" className="type-site-eyebrow text-highlight">
        {label}
      </h2>
      <dl className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <SiteCard key={item.question} className="gap-1.5 px-4.5 py-4">
            <dt className="type-body-lg font-extrabold">{item.question}</dt>
            <dd className="type-body-sm text-muted-foreground">{item.answer}</dd>
          </SiteCard>
        ))}
      </dl>
    </section>
  );
}
