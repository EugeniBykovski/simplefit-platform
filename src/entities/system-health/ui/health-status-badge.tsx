import { CircleCheckIcon, CircleXIcon, LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";

import type { HealthStatus } from "../model/health-status";

const presentation = {
  checking: { Icon: LoaderCircleIcon, className: "" },
  online: { Icon: CircleCheckIcon, className: "bg-success text-success-foreground" },
  offline: { Icon: CircleXIcon, className: "bg-danger text-danger-foreground" },
} satisfies Record<HealthStatus, { Icon: typeof CircleCheckIcon; className: string }>;

export function HealthStatusBadge({ status }: { status: HealthStatus }) {
  const t = useTranslations("apiHealth.status");
  const { Icon, className } = presentation[status];

  return (
    <Badge variant={status === "checking" ? "secondary" : "default"} className={cn(className)}>
      <Icon aria-hidden className={cn(status === "checking" && "animate-spin")} />
      {t(status)}
    </Badge>
  );
}
