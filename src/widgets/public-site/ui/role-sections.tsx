import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { ArrowLink, SectionLabel, SiteCard } from "./sections";

/*
 * Sections only the role landings draw (L2 fighters, L3 coaches, L4 gyms):
 * the hero beside its product example, and the plans card.
 */

/** The hero: copy on the left, the product example in a fixed column on the right. */
export function RoleHero({
  copy,
  example,
  exampleWidth,
}: {
  copy: ReactNode;
  example: ReactNode;
  /** The right column's width in the artboard: 520 (L2, L4) or 500 (L3). */
  exampleWidth: 520 | 500;
}) {
  return (
    <div
      className={cn(
        "grid items-center gap-10 desktop:gap-16",
        exampleWidth === 520
          ? "desktop:grid-cols-[minmax(0,1fr)_520px]"
          : "desktop:grid-cols-[minmax(0,1fr)_500px]",
      )}
    >
      <div className="flex min-w-0 flex-col gap-5">{copy}</div>
      {example}
    </div>
  );
}

/** The plans card of L3 and L4: plan, capacity and price per row, the featured one bold. */
export function PlansCard({
  label,
  columns,
  rows,
  link,
}: {
  label: string;
  columns: readonly [string, string, string];
  rows: readonly {
    id: string;
    name: string;
    capacity: string;
    price: string;
    featured?: boolean;
  }[];
  link: { label: string; href: string };
}) {
  return (
    <SiteCard className="gap-2.5 p-6.5">
      <SectionLabel tone="highlight">{label}</SectionLabel>
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          {/* The artboard's 1fr / 1fr / 0.8fr columns. */}
          <col className="w-[35.7%]" />
          <col className="w-[35.7%]" />
          <col />
        </colgroup>
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="px-2.5 pb-2.5 text-left type-label text-faint-foreground"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="h-9 border-b border-muted type-body-sm">
              <th
                scope="row"
                className={cn("px-2.5 text-left type-body-sm", row.featured && "font-extrabold")}
              >
                {row.name}
              </th>
              <td className="px-2.5">{row.capacity}</td>
              <td className="px-2.5">{row.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ArrowLink href={link.href}>{link.label}</ArrowLink>
    </SiteCard>
  );
}

/** A stat tile of the product examples (FIGHTERS 14 / CHECKED IN 42). */
export function Stat({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? "flex flex-col gap-1 rounded-2xl border border-accent-border bg-accent px-4 py-3.5"
          : "flex flex-col gap-1 rounded-2xl border border-border bg-surface px-4 py-3.5"
      }
    >
      <span
        className={
          accent ? "type-label text-accent-muted-foreground" : "type-label text-faint-foreground"
        }
      >
        {label}
      </span>
      <span
        className={
          accent
            ? "type-metric-lg font-display font-bold text-accent-foreground"
            : "type-metric-lg font-display font-bold text-foreground"
        }
      >
        {value}
      </span>
      <span
        className={
          accent
            ? "type-caption font-bold text-highlight"
            : "type-caption font-bold text-muted-foreground"
        }
      >
        {note}
      </span>
    </div>
  );
}
