import {
  AlertTriangleIcon,
  LockIcon,
  ServerOffIcon,
  WifiOffIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";

import { isRetryable, type FailureKind } from "../model/error-state";

const TONES: Record<
  FailureKind,
  {
    icon: LucideIcon;
    card: string;
    tag: string;
    iconWrap: string;
    action: "destructive-subtle" | "warning" | "primary";
  }
> = {
  unexpected: {
    icon: AlertTriangleIcon,
    card: "border-destructive-border",
    tag: "text-destructive-subtle-foreground",
    iconWrap: "bg-destructive-subtle text-destructive-subtle-foreground",
    action: "destructive-subtle",
  },
  offline: {
    icon: WifiOffIcon,
    card: "border-warning-subtle",
    tag: "text-warning",
    iconWrap: "bg-warning-subtle text-warning",
    action: "warning",
  },
  forbidden: {
    icon: LockIcon,
    card: "border-warning-subtle",
    tag: "text-warning",
    iconWrap: "bg-warning-subtle text-warning",
    action: "warning",
  },
  unavailable: {
    icon: ServerOffIcon,
    card: "border-border",
    tag: "text-faint-foreground",
    iconWrap: "bg-muted text-muted-foreground",
    action: "primary",
  },
};

/**
 * A failure state card (Claude Design "System states" sheet): tone tag, icon
 * tile, title, explanation and one valid action. Never shows an error's
 * message, stack, request or provider details. Retryable states call
 * `onRetry`; the others lead home.
 */
export function ErrorState({
  kind,
  onRetry,
  className,
}: {
  kind: FailureKind;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations("errors.states");
  const actions = useTranslations("actions");
  const tone = TONES[kind];
  const Icon = tone.icon;
  const retry = isRetryable(kind) && onRetry;

  return (
    <section
      role="alert"
      aria-labelledby={`failure-${kind}`}
      className={cn(
        "flex w-full max-w-95 flex-col gap-4 rounded-4xl border bg-background p-5",
        tone.card,
        className,
      )}
    >
      <span className={cn("type-label", tone.tag)}>{t(`${kind}.tag`)}</span>
      <span className={cn("flex size-13 items-center justify-center rounded-xl", tone.iconWrap)}>
        <Icon aria-hidden className="size-6.5" strokeWidth={1.8} />
      </span>
      <span className="flex flex-col gap-1.5">
        <h1 id={`failure-${kind}`} className="type-lead font-extrabold">
          {t(`${kind}.title`)}
        </h1>
        <p className="type-body-sm text-muted-foreground">{t(`${kind}.description`)}</p>
      </span>
      {retry ? (
        <Button size="system" variant={tone.action} onClick={onRetry}>
          {t(`${kind}.action`)}
        </Button>
      ) : (
        <Button size="system" variant={tone.action} asChild>
          <Link href={routeHref("web.root")}>
            {kind === "forbidden" ? t("forbidden.action") : actions("backToHome")}
          </Link>
        </Button>
      )}
    </section>
  );
}
