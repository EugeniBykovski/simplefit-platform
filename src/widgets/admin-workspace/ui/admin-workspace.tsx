"use client";

import { KeyRoundIcon, LogOutIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";

import { useFirstRun } from "@/entities/first-run";
import { keyCheckRemaining, useKeyCheckClock, type Operator } from "@/entities/operator";
import { ControlPlaneGate } from "@/features/control-plane-entry";
import { usePathname, useRouter } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { WorkspaceShell } from "@/widgets/workspace-shell";

import { visibleNavItems } from "../model/access";

/**
 * `web.admin`, the Control Plane (SF-120): the AD0 gate, then the admin shell
 * with only the nav items the operator was granted and the operator block (key
 * check time left, "Exit control plane"). While the backend still offers the
 * first visit (ADR 0018 `control_plane_web_tour`), the overview sends the
 * operator to ARW1 once; the backend's record, not the browser, decides that.
 */
export function AdminWorkspace({ children }: { children: ReactNode }) {
  return (
    <ControlPlaneGate>
      {(operator, exit) => (
        <WorkspaceShell
          shell="web.admin"
          visibleItems={visibleNavItems(operator)}
          identity={<OperatorBlock operator={operator} onExit={exit} />}
        >
          <FirstVisitRedirect />
          {children}
        </WorkspaceShell>
      )}
    </ControlPlaneGate>
  );
}

function FirstVisitRedirect() {
  const firstRun = useFirstRun("control_plane_web_tour");
  const pathname = usePathname();
  const router = useRouter();
  const pending = firstRun.data?.status === "pending";
  const onOverview = pathname === routeHref("web.admin");
  useEffect(() => {
    if (pending && onOverview) router.replace(routeHref("web.admin.welcome"));
  }, [pending, onOverview, router]);
  return null;
}

/** The operator block (AdminNav `me`, FirstRunAdmin top bar): the key check and leaving. */
export function OperatorBlock({
  operator,
  onExit,
}: {
  operator: Operator;
  onExit: () => Promise<void>;
}) {
  const t = useTranslations("controlPlane.workspace");
  const shells = useTranslations("shells.admin");
  const now = useKeyCheckClock(operator);
  const remaining = keyCheckRemaining(operator, now) ?? 0;
  const minutes = Math.max(Math.ceil(remaining / 60_000), 0);
  const [exiting, setExiting] = useState(false);
  const [failed, setFailed] = useState(false);

  const exit = async () => {
    setExiting(true);
    setFailed(false);
    try {
      await onExit();
    } catch {
      setFailed(true);
      setExiting(false);
    }
  };

  return (
    <div data-control-plane-operator className="flex flex-col items-start gap-1.5 px-2">
      <span className="flex items-center gap-2">
        <span className="type-title">{t("operator")}</span>
        <Badge variant="warning">{shells("internal")}</Badge>
      </span>
      <span className="flex items-center gap-1.5 type-caption text-muted-foreground">
        <KeyRoundIcon aria-hidden className="size-3.5 text-highlight" />
        {t("keyChecked", { minutes })}
      </span>
      <span className="type-caption text-faint-foreground">
        {t("permissions", { count: operator.permissions.length })}
      </span>
      <Button
        variant="quiet"
        size="sm"
        className="mt-1"
        loading={exiting}
        onClick={() => void exit()}
        data-control-plane-exit
      >
        <LogOutIcon aria-hidden />
        {t("exit")}
      </Button>
      {failed && (
        <p role="alert" className="type-caption font-bold text-destructive">
          {t("exitFailed")}
        </p>
      )}
    </div>
  );
}
