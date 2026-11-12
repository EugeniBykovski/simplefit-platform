"use client";

import { useQueryClient } from "@tanstack/react-query";
import { InfoIcon, RefreshCwIcon, UserPlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";

import {
  useForgetOperatorsOnRefusal,
  useOperatorDetail,
  useOperatorEvents,
  useOperators,
  usePermissionCatalog,
  type GovernanceEvent,
  type GovernedOperator,
  type OperatorAction,
} from "@/entities/admin-operators";
import { grants, useOperator, useOperatorKeys, type Operator } from "@/entities/operator";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

import { AddOperatorDialog } from "./add-operator-dialog";
import { OperatorActionDialog } from "./operator-action-dialog";
import { YourSecurity } from "./your-security";

const STATUS_VARIANT = {
  active: "success",
  pending_enrollment: "info",
  suspended: "warning",
  revoked: "destructive",
} as const;

type Pending = { action: OperatorAction; target: GovernedOperator; permission?: string };

/**
 * AD20 (SF-129; Claude Design `AdminStaff`): the operators, each one's permissions with
 * who granted them, when and why, and the viewer's own security. With `operators.read`
 * the inventory and detail; with `operators.manage` adding an operator and the SF-111
 * actions on anyone but oneself; with `audit.read` their governance history and recent
 * actions. The backend decides every rule (no self-action, the last manager stays, the
 * required keys); this page shows its answers and hides what the viewer can't do. No
 * two-person approval, break-glass, SSO or access requests: none exists.
 */
export function OperatorsPage() {
  const t = useTranslations("controlPlane.operators");
  const operator = useOperator().data;
  const known = operator !== undefined;
  const canRead = !!operator && grants(operator, "operators.read");
  const operators = useOperators(canRead);
  useForgetOperatorsOnRefusal(operators.error);
  const refused =
    known &&
    (!canRead ||
      (isApiError(operators.error) &&
        (operators.error.status === 403 || operators.error.status === 404)));

  let inventory: ReactNode;
  if (!known || (canRead && operators.isPending && !operators.isError)) {
    inventory = (
      <div role="status" aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-2">
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  } else if (refused) {
    inventory = <Restricted />;
  } else if (operators.data === undefined) {
    inventory = (
      <section
        data-operators-state="unreachable"
        className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5"
      >
        <h2 className="type-h3 font-display">{t("unreachable.title")}</h2>
        <p role="alert" className="type-body-sm text-muted-foreground">
          {t("unreachable.body")}
        </p>
        <Button onClick={() => void operators.refetch()}>{t("refresh")}</Button>
      </section>
    );
  } else if (operator) {
    inventory = (
      <Governance
        viewer={operator}
        operators={operators.data}
        refreshing={operators.isFetching}
        onRefresh={() => void operators.refetch()}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader className="flex-wrap gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <nav aria-label="Breadcrumb">
            <p className="type-label text-faint-foreground">{t("breadcrumb")}</p>
          </nav>
          <h1 className="truncate type-h3 font-display">{t("title")}</h1>
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">
        <div className="flex items-start gap-2.5 rounded-2xl border bg-surface-elevated p-3.5 type-body-sm">
          <InfoIcon aria-hidden className="mt-0.5 size-4 flex-none text-highlight" />
          <div className="flex min-w-0 flex-col gap-1">
            <p>{t("intro")}</p>
            <p className="text-muted-foreground">{t("notSupported")}</p>
          </div>
        </div>
        {inventory}
        {operator && <YourSecurity operator={operator} />}
      </PageBody>
    </div>
  );
}

function Governance({
  viewer,
  operators,
  refreshing,
  onRefresh,
}: {
  viewer: Operator;
  operators: GovernedOperator[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations("controlPlane.operators");
  const format = useFormatter();
  const client = useQueryClient();
  const { reread } = useOperatorKeys();
  const canManage = grants(viewer, "operators.manage");
  const canAudit = grants(viewer, "audit.read");
  const catalog = usePermissionCatalog(canManage);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [adding, setAdding] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const detailQuery = useOperatorDetail(selected);
  const detail =
    detailQuery.data ?? operators.find((candidate) => candidate.id === selected) ?? null;

  const name = (op: GovernedOperator) => op.short_name ?? t("unnamed");
  const nameOf = (id: string | null | undefined) => {
    const match = operators.find((candidate) => candidate.id === id);
    return match ? name(match) : (id ?? "");
  };

  // After any answer that may have changed something: the list, the detail, the history
  // and the viewer's own authority (their permissions may have changed too).
  const settle = () => {
    void client.invalidateQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === "string" &&
        (query.queryKey[0].startsWith("/api/v1/admin/operators") ||
          query.queryKey[0].startsWith("/api/v1/admin/audit-events")),
    });
    void reread();
  };

  const open = (event: MouseEvent<HTMLButtonElement>, next: Pending) => {
    opener.current = event.currentTarget;
    setPending(next);
  };
  const restoreFocus = () => requestAnimationFrame(() => opener.current?.focus());

  return (
    <div className="flex flex-col gap-5" data-operators-state="ready">
      <section
        aria-labelledby="operators-inventory"
        className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-5"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="operators-inventory" className="type-title font-display">
            {t("inventory.title")}
          </h2>
          <span className="type-caption text-faint-foreground">
            {t("inventory.count", { count: operators.length })}
          </span>
          <span className="flex-1" />
          <Button variant="quiet" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCwIcon aria-hidden className="size-4" />
            {t("refresh")}
          </Button>
          {canManage && (
            <Button
              size="sm"
              className="hidden sm:inline-flex"
              disabled={catalog.data === undefined}
              onClick={(event) => {
                opener.current = event.currentTarget;
                setAdding(true);
              }}
              data-add-operator-open
            >
              <UserPlusIcon aria-hidden className="size-4" />
              {t("add.open")}
            </Button>
          )}
        </div>
        {!canManage && <p className="type-caption text-muted-foreground">{t("noManage")}</p>}
        {/* Positioned, so the screen-reader-only header scrolls with the table. */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-170 text-left">
            <caption className="sr-only">{t("inventory.caption")}</caption>
            <thead>
              <tr className="border-b type-label text-faint-foreground">
                {(["operator", "status", "permissions", "keys", "lastActive", "open"] as const).map(
                  (column) => (
                    <th key={column} scope="col" className="py-2 pe-3">
                      {column === "open" ? (
                        <span className="sr-only">{t(`inventory.columns.${column}`)}</span>
                      ) : (
                        t(`inventory.columns.${column}`)
                      )}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {operators.map((op) => (
                <tr
                  key={op.id}
                  className="align-top type-body-sm"
                  data-operator-row={op.id}
                  data-status={op.status}
                  aria-current={op.id === selected ? "true" : undefined}
                >
                  <td className="py-2.5 pe-3">
                    <span className="font-extrabold">{name(op)}</span>
                    {op.id === viewer.id && (
                      <Badge variant="accent" className="ms-2" data-you>
                        {t("you")}
                      </Badge>
                    )}
                    <span className="block truncate type-caption font-mono text-faint-foreground">
                      {op.id}
                    </span>
                  </td>
                  <td className="py-2.5 pe-3">
                    <Badge variant={STATUS_VARIANT[op.status]}>{t(`status.${op.status}`)}</Badge>
                  </td>
                  <td className="py-2.5 pe-3 tabular-nums">{op.permissions.length}</td>
                  <td className="py-2.5 pe-3 tabular-nums">
                    {t("inventory.keys", {
                      registered: op.security_keys.registered,
                      required: op.security_keys.required,
                    })}
                  </td>
                  <td className="py-2.5 pe-3 text-muted-foreground">
                    {op.last_key_check_at
                      ? format.dateTime(new Date(op.last_key_check_at), "dateTime")
                      : t("inventory.never")}
                  </td>
                  <td className="py-2.5 pe-3 text-end">
                    <Button
                      size="sm"
                      variant="quiet"
                      aria-label={t("inventory.view", { name: name(op) })}
                      aria-pressed={op.id === selected}
                      onClick={() => setSelected(op.id)}
                      data-operator-open={op.id}
                    >
                      {t("inventory.viewShort")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detail && (
        <Detail
          key={detail.id}
          operator={detail}
          self={detail.id === viewer.id}
          canManage={canManage}
          canAudit={canAudit}
          catalog={(catalog.data ?? []).map((entry) => entry.permission)}
          nameOf={nameOf}
          name={name(detail)}
          onAction={open}
        />
      )}

      {pending && (
        <OperatorActionDialog
          key={`${pending.target.id}-${pending.action}-${pending.permission ?? ""}-${pending.target.revision}`}
          action={pending.action}
          target={pending.target}
          name={name(pending.target)}
          {...(pending.permission === undefined ? {} : { permission: pending.permission })}
          grantable={(catalog.data ?? [])
            .map((entry) => entry.permission)
            .filter((permission) => !pending.target.permissions.includes(permission))}
          open
          onOpenChange={(next) => {
            if (!next) {
              setPending(null);
              restoreFocus();
            }
          }}
          onSettled={settle}
        />
      )}

      {adding && catalog.data && (
        <AddOperatorDialog
          catalog={catalog.data}
          open
          onOpenChange={(next) => {
            if (!next) {
              setAdding(false);
              restoreFocus();
            }
          }}
          onAdded={(created) => {
            settle();
            if (created) setSelected(created.id);
          }}
        />
      )}
    </div>
  );
}

function Detail({
  operator,
  self,
  canManage,
  canAudit,
  catalog,
  name,
  nameOf,
  onAction,
}: {
  operator: GovernedOperator;
  self: boolean;
  canManage: boolean;
  canAudit: boolean;
  catalog: string[];
  name: string;
  nameOf: (id: string | null | undefined) => string;
  onAction: (event: MouseEvent<HTMLButtonElement>, next: Pending) => void;
}) {
  const t = useTranslations("controlPlane.operators");
  const d = useTranslations("controlPlane.operators.dialog");
  const format = useFormatter();
  const acts = canManage && !self && operator.status !== "revoked";
  const grantable = catalog.some((permission) => !operator.permissions.includes(permission));
  const reasonName = (code: string | null) =>
    code === null
      ? ""
      : d.has(`reasons.${code}` as Parameters<typeof d.has>[0])
        ? d(`reasons.${code}` as Parameters<typeof d>[0])
        : code;

  return (
    <section
      aria-labelledby="operator-detail"
      className="flex min-w-0 flex-col gap-4 rounded-3xl border bg-surface p-5"
      data-operator-detail={operator.id}
      data-status={operator.status}
      data-revision={operator.revision}
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="operator-detail" className="type-title font-display">
            {name}
          </h2>
          <Badge variant={STATUS_VARIANT[operator.status]}>{t(`status.${operator.status}`)}</Badge>
          {self && <Badge variant="accent">{t("you")}</Badge>}
        </div>
        <p className="truncate type-caption font-mono text-faint-foreground">
          {t("detail.ids", {
            id: operator.id,
            user: operator.user_id,
            date: format.dateTime(new Date(operator.created_at), "date"),
          })}
        </p>
        {self && <p className="type-caption text-muted-foreground">{t("detail.self")}</p>}
        {operator.status === "pending_enrollment" && (
          <p className="type-caption text-muted-foreground">
            {t("detail.pending", {
              registered: operator.security_keys.registered,
              required: operator.security_keys.required,
            })}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="type-label text-faint-foreground uppercase">{t("detail.permissions")}</h3>
        {(operator.grants ?? []).length === 0 ? (
          <p className="type-body-sm text-muted-foreground">{t("detail.noPermissions")}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-2xl border" data-operator-grants>
            {(operator.grants ?? []).map((grant) => (
              <li
                key={grant.permission}
                className="flex flex-wrap items-center gap-3 px-3.5 py-2.5"
                data-grant={grant.permission}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="type-body-sm font-mono font-extrabold">{grant.permission}</span>
                  <span className="type-caption text-muted-foreground">
                    {grant.bootstrap
                      ? t("detail.bootstrap", {
                          date: format.dateTime(new Date(grant.granted_at), "date"),
                        })
                      : t("detail.grantedBy", {
                          name: nameOf(grant.granted_by_operator_id),
                          date: format.dateTime(new Date(grant.granted_at), "date"),
                          reason: reasonName(grant.reason_code),
                        })}
                  </span>
                </div>
                {acts && (
                  <Button
                    size="sm"
                    variant="quiet"
                    className="hidden sm:inline-flex"
                    aria-label={t("actions.revokePermissionLabel", {
                      permission: grant.permission,
                      name,
                    })}
                    onClick={(event) =>
                      onAction(event, {
                        action: "revoke_permission",
                        target: operator,
                        permission: grant.permission,
                      })
                    }
                    data-revoke-permission={grant.permission}
                  >
                    {t("actions.revokePermission")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {acts && (
        <>
          <p className="type-caption text-muted-foreground sm:hidden">{t("actions.smallScreen")}</p>
          <div className="hidden flex-wrap gap-2 sm:flex" data-operator-actions>
            {grantable && (
              <Button
                variant="quiet"
                onClick={(event) => onAction(event, { action: "grant", target: operator })}
                data-operator-action-open="grant"
              >
                {t("actions.grant")}
              </Button>
            )}
            {operator.status === "active" && (
              <Button
                variant="quiet"
                onClick={(event) => onAction(event, { action: "suspend", target: operator })}
                data-operator-action-open="suspend"
              >
                {t("actions.suspend")}
              </Button>
            )}
            {operator.status === "suspended" && (
              <Button
                variant="quiet"
                onClick={(event) => onAction(event, { action: "reinstate", target: operator })}
                data-operator-action-open="reinstate"
              >
                {t("actions.reinstate")}
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={(event) => onAction(event, { action: "revoke", target: operator })}
              data-operator-action-open="revoke"
            >
              {t("actions.revoke")}
            </Button>
          </div>
        </>
      )}

      {canAudit ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Events operatorId={operator.id} side="target" nameOf={nameOf} />
          <Events operatorId={operator.id} side="actor" nameOf={nameOf} />
        </div>
      ) : (
        <p className="type-caption text-muted-foreground" data-operator-history="restricted">
          {t("history.noAudit")}
        </p>
      )}
    </section>
  );
}

function Events({
  operatorId,
  side,
  nameOf,
}: {
  operatorId: string;
  side: "target" | "actor";
  nameOf: (id: string | null | undefined) => string;
}) {
  const t = useTranslations("controlPlane.operators.history");
  const format = useFormatter();
  const events = useOperatorEvents(operatorId, side, true);
  const title = side === "target" ? t("governance") : t("recent");
  const actionName = (event: GovernanceEvent) => {
    const key = event.action.replaceAll(".", "_");
    return t.has(`actions.${key}` as Parameters<typeof t.has>[0])
      ? t(`actions.${key}` as Parameters<typeof t>[0])
      : event.action;
  };

  return (
    <div className="flex min-w-0 flex-col gap-2" data-operator-history={side}>
      <h3 className="type-label text-faint-foreground uppercase">{title}</h3>
      {events.isPending ? (
        <Skeleton className="h-16 w-full rounded-lg" />
      ) : events.data === undefined ? (
        <p role="alert" className="type-body-sm text-destructive">
          {t("unavailable")}
        </p>
      ) : events.data.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-2xl border">
          {events.data.map((event) => (
            <li key={event.id} className="flex flex-col gap-0.5 px-3.5 py-2 type-body-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold">{actionName(event)}</span>
                {event.permission && (
                  <span className="type-caption font-mono">{event.permission}</span>
                )}
                {event.outcome !== "allowed" && (
                  <Badge variant="warning">{t(`outcome.${event.outcome}`)}</Badge>
                )}
              </span>
              <span className="type-caption text-muted-foreground">
                {format.dateTime(new Date(event.occurred_at), "dateTime")}
                {side === "target" && event.actor_operator_id
                  ? ` · ${t("by", { name: nameOf(event.actor_operator_id) })}`
                  : ""}
                {event.reason_code ? ` · ${event.reason_code}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Restricted() {
  const t = useTranslations("controlPlane.operators.restricted");
  return (
    <section
      data-operators-state="restricted"
      className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5"
    >
      <h2 className="type-h3 font-display">{t("title")}</h2>
      <p className="type-body-sm text-muted-foreground">{t("body")}</p>
      <Button asChild variant="quiet">
        <Link href={routeHref("web.admin")}>{t("back")}</Link>
      </Button>
    </section>
  );
}
