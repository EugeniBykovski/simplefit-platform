"use client";

import { RefreshCwIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { HealthStatusBadge, toHealthStatus } from "@/entities/system-health";
import { useGetHealth } from "@/shared/api/generated/endpoints/system/system";
import { isApiError } from "@/shared/api/http/api-error";
import { publicEnv } from "@/shared/config/env";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";

/**
 * Checks SimpleFit API availability from the browser through the generated
 * TanStack Query hook. Proves the env -> generated client -> query pipeline.
 */
export function ApiHealthCard() {
  const t = useTranslations("apiHealth");
  const actions = useTranslations("actions");
  const format = useFormatter();
  const health = useGetHealth({
    query: { retry: false, refetchOnWindowFocus: false, staleTime: 0 },
  });
  const status = toHealthStatus(health);
  const checkedAt = Math.max(health.dataUpdatedAt, health.errorUpdatedAt);

  async function checkAgain() {
    const result = await health.refetch();
    if (result.isError) toast.error(t("toastOffline"));
    else toast.success(t("toastOnline"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription className="break-all">{publicEnv.NEXT_PUBLIC_API_URL}</CardDescription>
        <CardAction>
          <HealthStatusBadge status={status} />
        </CardAction>
      </CardHeader>
      <CardContent aria-live="polite" className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p>{t(status)}</p>
        {status === "offline" && isApiError(health.error) && (
          <>
            <p>
              {t.rich("errorCode", {
                errorCode: health.error.code,
                code: (chunks) => <code className="font-mono">{chunks}</code>,
              })}
            </p>
            {health.error.requestId && (
              <p>{t("requestId", { requestId: health.error.requestId })}</p>
            )}
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {checkedAt > 0
            ? t("lastChecked", { time: format.dateTime(checkedAt, "time") })
            : t("notChecked")}
        </p>
        <Button variant="outline" size="sm" onClick={checkAgain} disabled={health.isFetching}>
          <RefreshCwIcon aria-hidden className={health.isFetching ? "animate-spin" : undefined} />
          {actions("checkAgain")}
        </Button>
      </CardFooter>
    </Card>
  );
}
