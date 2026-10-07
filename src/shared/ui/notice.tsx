import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * The inline status box of the auth screens (Claude Design O01c, O03, WA1b,
 * WA4, WA4b): a 16 px icon and caption text on a tinted, bordered well,
 * radius `lg`, padding 12 × 14.
 *
 * - `olive`: confirmations ("Code sent", "Email verified");
 * - `amber`: something to act on ("This code has expired");
 * - `coral`: errors ("That code isn't right");
 * - `muted`: guidance ("Never share this code").
 */
const noticeVariants = cva(
  "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 type-caption text-pretty",
  {
    variants: {
      tone: {
        olive: "border-accent-border bg-accent text-accent-foreground",
        amber: "border-warning-border bg-warning-subtle text-warning-subtle-foreground",
        coral: "border-destructive-border bg-destructive-subtle text-destructive-subtle-foreground",
        muted: "border-input bg-surface-elevated text-muted-foreground",
      },
    },
    defaultVariants: { tone: "muted" },
  },
);

const iconTone = {
  olive: "text-highlight",
  amber: "text-warning",
  coral: "text-destructive",
  muted: "text-faint-foreground",
} as const;

type NoticeProps = ComponentProps<"div"> &
  VariantProps<typeof noticeVariants> & {
    icon: LucideIcon;
  };

export function Notice({ tone, icon: Icon, className, children, ...props }: NoticeProps) {
  return (
    <div data-slot="notice" className={cn(noticeVariants({ tone }), className)} {...props}>
      {/* The artboards' icon box: a 16 px glyph in a 21 px line box, 1 px down. */}
      <span aria-hidden className="mt-px flex h-[21px] flex-none">
        <Icon className={cn("size-4", iconTone[tone ?? "muted"])} />
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
