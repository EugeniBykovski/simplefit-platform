"use client";

import { InfoIcon, RefreshCwIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";

import {
  useConfiguration,
  useForgetConfigurationOnRefusal,
  type Configuration,
  type ConfigurationFlag,
  type FlagAction,
} from "@/entities/admin-configuration";
import { grants, useOperator } from "@/entities/operator";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

import { FlagActionDialog } from "./flag-action-dialog";

// Message keys for the registered switches (a key's "." becomes "_": next-intl nests on ".").
const KNOWN = [
  "gym_member_invitations",
  "gym_staff_invitations",
  "sponsor_application_emails",
  "sponsor_evidence_uploads",
  "coaching_access",
  "stripe_billing",
  "stripe_mode",
  "stripe_connect",
  "api_docs",
] as const;

const RISK_VARIANT = { low: "neutral", medium: "warning", high: "destructive" } as const;

/**
 * AD6 reduced (SF-128; Claude Design `AdminFlags`, FUTURE, built on the real
 * configuration): every switch the backend registers, where its value comes from, what
 * reads it, its control and risk, and what is effective now. With `config.flags.write`
 * the allowlisted switches can be suspended and restored through the SF-111 dialog; the
 * rest show no control at all. No rollout slider, targeting, guardrail metric or
 * second approver: none exists. Changes show only once the backend confirms them.
 */
export function ConfigurationPage() {
  const t = useTranslations("controlPlane.configuration");
  const format = useFormatter();
  const operator = useOperator().data;
  const known = operator !== undefined;
  const canRead = !!operator && grants(operator, "config.read");
  const canWrite = !!operator && grants(operator, "config.flags.write");
  const configuration = useConfiguration(canRead);
  useForgetConfigurationOnRefusal(configuration.error);
  const refused =
    known &&
    (!canRead ||
      (isApiError(configuration.error) &&
        (configuration.error.status === 403 || configuration.error.status === 404)));

  let body: ReactNode;
  if (!known || (canRead && configuration.isPending && !configuration.isError)) {
    body = (
      <div role="status" aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-2">
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  } else if (refused) {
    body = <Restricted />;
  } else if (configuration.data === undefined) {
    body = (
      <section
        data-configuration-state="unreachable"
        className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5"
      >
        <h2 className="type-h3 font-display">{t("unreachable.title")}</h2>
        <p role="alert" className="type-body-sm text-muted-foreground">
          {t("unreachable.body")}
        </p>
        <Button onClick={() => void configuration.refetch()}>{t("refresh")}</Button>
      </section>
    );
  } else {
    body = (
      <Inventory
        configuration={configuration.data}
        canWrite={canWrite}
        refreshing={configuration.isFetching}
        onRefresh={() => void configuration.refetch()}
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
        {configuration.data && !refused && (
          <span className="type-caption text-faint-foreground">
            {t("environment", { environment: configuration.data.environment })} ·{" "}
            {t("observedAt", {
              time: format.dateTime(new Date(configuration.data.observed_at), "dateTime"),
            })}
          </span>
        )}
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">{body}</PageBody>
    </div>
  );
}

function Inventory({
  configuration,
  canWrite,
  refreshing,
  onRefresh,
}: {
  configuration: Configuration;
  canWrite: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations("controlPlane.configuration");
  const format = useFormatter();
  const [action, setAction] = useState<{ action: FlagAction; flag: ConfigurationFlag } | null>(
    null,
  );
  const opener = useRef<HTMLButtonElement | null>(null);
  const name = (key: string) => {
    const id = key.replace(".", "_");
    return (KNOWN as readonly string[]).includes(id)
      ? t(`flags.${id as (typeof KNOWN)[number]}`)
      : key;
  };
  const value = (v: ConfigurationFlag["effective"]) =>
    v === true ? t("value.on") : v === false ? t("value.off") : t(`value.${v}`);

  return (
    <div className="flex flex-col gap-5" data-configuration-state="ready">
      <div className="flex items-start gap-2.5 rounded-2xl border bg-surface-elevated p-3.5 type-body-sm">
        <InfoIcon aria-hidden className="mt-0.5 size-4 flex-none text-highlight" />
        <div className="flex min-w-0 flex-col gap-1">
          <p>{t("intro")}</p>
          <p className="text-muted-foreground">{t("notShown")}</p>
          <p className="text-muted-foreground">{t("notSupported")}</p>
        </div>
      </div>

      <section
        aria-labelledby="configuration-switches"
        className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-5"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="configuration-switches" className="type-title font-display">
            {t("title")}
          </h2>
          <span className="flex-1" />
          <Button variant="quiet" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCwIcon aria-hidden className="size-4" />
            {t("refresh")}
          </Button>
        </div>
        {!canWrite && <p className="type-caption text-muted-foreground">{t("actions.noWrite")}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-220 text-left">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr className="border-b type-label text-faint-foreground">
                {(
                  [
                    "switch",
                    "source",
                    "control",
                    "risk",
                    "deployment",
                    "effective",
                    "action",
                  ] as const
                ).map((column) => (
                  <th key={column} scope="col" className="py-2 pe-3">
                    {t(`columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {configuration.flags.map((flag) => {
                const next: FlagAction = flag.suspended ? "restore" : "suspend";
                return (
                  <tr
                    key={flag.key}
                    className="align-top type-body-sm"
                    data-flag={flag.key}
                    data-effective={String(flag.effective)}
                  >
                    <td className="py-2.5 pe-3">
                      <span className="font-extrabold">{name(flag.key)}</span>
                      <span className="block type-caption font-mono text-faint-foreground">
                        {flag.key}
                      </span>
                      <span className="block type-caption text-muted-foreground">
                        {t("consumer", { consumer: flag.consumer })}
                      </span>
                    </td>
                    <td className="py-2.5 pe-3">
                      <span className="type-caption font-mono">{flag.variable}</span>
                      <span className="block type-caption text-muted-foreground">
                        {t("decision", { decision: flag.decision })}
                      </span>
                    </td>
                    <td className="py-2.5 pe-3">
                      <Badge variant="outline">{t(`control.${flag.control}`)}</Badge>
                      {flag.revision !== null && (
                        <span className="block type-caption text-faint-foreground">
                          {t("revision", { revision: flag.revision })}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pe-3">
                      <Badge variant={RISK_VARIANT[flag.risk]}>{t(`risk.${flag.risk}`)}</Badge>
                    </td>
                    <td className="py-2.5 pe-3">{value(flag.deployment_value)}</td>
                    <td className="py-2.5 pe-3">
                      <span className="font-extrabold">{value(flag.effective)}</span>
                      {flag.suspended && (
                        <Badge variant="warning" className="ms-2">
                          {t("suspendedBadge")}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 pe-3">
                      {canWrite && flag.control === "suspendable" && flag.flag_id ? (
                        <Button
                          size="sm"
                          variant={next === "suspend" ? "destructive" : "quiet"}
                          aria-label={t("actions.label", {
                            action: t(`actions.${next}`),
                            switch: name(flag.key),
                          })}
                          onClick={(event) => {
                            opener.current = event.currentTarget;
                            setAction({ action: next, flag });
                          }}
                          data-flag-open={next}
                        >
                          {t(`actions.${next}`)}
                        </Button>
                      ) : (
                        <span aria-hidden className="text-faint-foreground">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="configuration-history"
        className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-5"
      >
        <h2 id="configuration-history" className="type-title font-display">
          {t("history.title")}
        </h2>
        {configuration.changes.length === 0 ? (
          <p className="type-body-sm text-muted-foreground" data-history="empty">
            {t("history.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left" data-history="ready">
              <caption className="sr-only">{t("history.caption")}</caption>
              <thead>
                <tr className="border-b type-label text-faint-foreground">
                  {(["when", "switch", "change", "reason", "revision"] as const).map((column) => (
                    <th key={column} scope="col" className="py-2 pe-3">
                      {t(`history.columns.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {configuration.changes.map((change) => (
                  <tr key={`${change.key}-${change.revision}`} className="type-body-sm">
                    <td className="py-2 pe-3 text-muted-foreground">
                      {format.dateTime(new Date(change.changed_at), "dateTime")}
                    </td>
                    <td className="py-2 pe-3">{name(change.key ?? "")}</td>
                    <td className="py-2 pe-3">{t(`history.change.${change.change}`)}</td>
                    <td className="py-2 pe-3 type-caption font-mono">{change.reason_code}</td>
                    <td className="py-2 pe-3 tabular-nums">{change.revision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {action && (
        <FlagActionDialog
          key={`${action.flag.key}-${action.action}-${action.flag.revision}`}
          action={action.action}
          flag={action.flag}
          name={name(action.flag.key)}
          environment={configuration.environment}
          open
          onOpenChange={(open) => {
            if (!open) {
              setAction(null);
              requestAnimationFrame(() => opener.current?.focus());
            }
          }}
          onSettled={onRefresh}
        />
      )}
    </div>
  );
}

function Restricted() {
  const t = useTranslations("controlPlane.users.restricted");
  return (
    <section
      data-configuration-state="restricted"
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
