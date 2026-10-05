import { CircleCheckIcon, CircleXIcon, LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/shared/ui/badge";

import type { HealthStatus } from "../model/health-status";

const presentation = {
  checking: { Icon: LoaderCircleIcon, variant: "neutral" },
  online: { Icon: CircleCheckIcon, variant: "success" },
  offline: { Icon: CircleXIcon, variant: "destructive" },
} as const satisfies Record<
  HealthStatus,
  { Icon: typeof CircleCheckIcon; variant: "neutral" | "success" | "destructive" }
>;

/** Status pill: icon + text + colour (never colour alone). */
export function HealthStatusBadge({ status }: { status: HealthStatus }) {
  const t = useTranslations("apiHealth.status");
  const { Icon, variant } = presentation[status];

  return (
    <Badge variant={variant}>
      <Icon
        aria-hidden
        className={status === "checking" ? "animate-spin motion-reduce:animate-none" : undefined}
      />
      {t(status)}
    </Badge>
  );
}
