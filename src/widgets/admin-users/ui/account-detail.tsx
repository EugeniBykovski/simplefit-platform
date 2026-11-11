"use client";

import { AlertTriangleIcon, KeyRoundIcon, SearchXIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import {
  READ_REASONS,
  revealEmail,
  useAccount,
  type AccountAction,
  type AdminAccount,
  type ReadReason,
} from "@/entities/admin-user";
import { useOperatorKeys } from "@/entities/operator";
import { useSession } from "@/entities/session";
import { isApiError } from "@/shared/api/http/api-error";
import { useRouter } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

import { AccountActionDialog } from "./account-action-dialog";
import { Restricted, StatusBadge } from "./account-parts";
import { ReasonSelect } from "./reason-select";

/**
 * AD8, one account (SF-122; Claude Design `AdminUserDetail`, MVP reduced): what the
 * backend shows an operator (masked addresses, sign-in methods, registration, state,
 * sessions, context counts), read with a recorded reason; revealing the address and the
 * three account actions each go through the backend's own checks. There's no recovery,
 * identity change or "act as user".
 */
export function AccountDetail({
  accountId,
  initialReason,
}: {
  accountId: string;
  initialReason: ReadReason | null;
}) {
  const t = useTranslations("controlPlane.users");
  const router = useRouter();
  const [reason, setReason] = useState<ReadReason | null>(initialReason);
  const [chosen, setChosen] = useState<ReadReason>();
  const read = useAccount(accountId, reason);

  let body: ReactNode;
  if (reason === null) {
    body = (
      <form
        className="flex max-w-130 flex-col gap-3 rounded-3xl border bg-surface p-6.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (chosen) {
            setReason(chosen);
            router.replace(
              routeHref("web.admin.users._user-id", { userId: accountId }, { reason: chosen }),
            );
          }
        }}
      >
        <h2 className="type-h3 font-display">{t("detail.reasonTitle")}</h2>
        <p className="type-body-sm text-muted-foreground">{t("detail.reasonBody")}</p>
        <ReasonSelect
          id="account-reason"
          label={t("search.reason")}
          placeholder={t("search.reasonPlaceholder")}
          reasons={READ_REASONS}
          value={chosen}
          onChange={(value) => setChosen(value as ReadReason)}
        />
        <Button type="submit" className="h-11 w-fit" disabled={chosen === undefined}>
          {t("detail.open")}
        </Button>
      </form>
    );
  } else if (isApiError(read.error) && read.error.status === 403) {
    body = <Restricted />;
  } else if (isApiError(read.error) && read.error.status === 404) {
    body = (
      <section className="flex max-w-155 flex-col items-start gap-2.5 rounded-3xl border bg-surface p-6.5">
        <Badge variant="neutral" className="gap-1.5 uppercase">
          <SearchXIcon aria-hidden className="size-3.5" />
          {t("detail.notFound.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{t("detail.notFound.title")}</h2>
        <p className="type-body-sm text-muted-foreground">{t("detail.notFound.body")}</p>
      </section>
    );
  } else if (read.isError) {
    body = (
      <section className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5">
        <Badge variant="destructive" className="gap-1.5 uppercase">
          <AlertTriangleIcon aria-hidden className="size-3.5" />
          {t("error.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{t("error.title")}</h2>
        <p className="type-body-sm text-muted-foreground">{t("error.body")}</p>
        <Button onClick={() => void read.refetch()}>{t("error.retry")}</Button>
      </section>
    );
  } else if (read.data === undefined) {
    body = (
      <div
        role="status"
        aria-busy="true"
        aria-label={t("detail.loading")}
        className="grid gap-4 lg:grid-cols-2"
      >
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  } else {
    body = <Account account={read.data} reason={reason} onChanged={() => void read.refetch()} />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <nav aria-label="Breadcrumb">
            <p className="type-label text-faint-foreground">
              {t("detail.breadcrumb")}
              {read.data ? ` / ${read.data.name ?? t("detail.noName")}` : ""}
            </p>
          </nav>
          <h1 className="truncate type-h3 font-display">{t("detail.title")}</h1>
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">{body}</PageBody>
    </div>
  );
}

function Account({
  account,
  reason,
  onChanged,
}: {
  account: AdminAccount;
  reason: ReadReason;
  onChanged: () => void;
}) {
  const t = useTranslations("controlPlane.users.detail");
  const reasons = useTranslations("controlPlane.users.reasons");
  const format = useFormatter();
  const viewer = useSession().viewer;
  const [action, setAction] = useState<AccountAction | null>(null);
  const [revealing, setRevealing] = useState(false);

  const self = viewer?.id === account.id;
  const operator = account.contexts.platform_operator;
  const label = account.name ?? t("noName");
  const date = (value: string) => format.dateTime(new Date(value), "dateTime");
  const reasonName = (code: string) =>
    reasons.has(code as Parameters<typeof reasons.has>[0])
      ? reasons(code as Parameters<typeof reasons>[0])
      : code;

  return (
    <div
      data-account={account.id}
      data-account-status={account.status}
      className="flex flex-col gap-4"
    >
      {account.suspension && (
        <p
          role="status"
          className="rounded-xl border border-warning-subtle bg-warning-subtle px-4 py-3 type-body-sm text-warning-subtle-foreground"
        >
          {t("suspendedBanner", {
            date: date(account.suspension.since),
            reason: reasonName(account.suspension.reason_code),
          })}
        </p>
      )}
      <header className="flex flex-col gap-3 rounded-3xl border bg-surface p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="flex flex-wrap items-center gap-2 type-h3 font-display">
            {label}
            <StatusBadge status={account.status} />
          </h2>
          <p className="truncate type-caption text-faint-foreground">
            {t("joined", {
              id: account.id,
              date: format.dateTime(new Date(account.joined_at), "date"),
            })}
          </p>
          {(self || operator) && (
            <p className="type-caption text-muted-foreground">
              {self ? t("actions.self") : t("actions.operatorTarget")}
            </p>
          )}
        </div>
        <p className="type-caption text-muted-foreground sm:hidden">{t("actions.smallScreen")}</p>
        <div className="hidden flex-wrap gap-2 sm:flex" data-account-actions>
          <Button variant="quiet" onClick={() => setRevealing(true)}>
            {t("actions.reveal")}
          </Button>
          {!self && !operator && (
            <>
              <Button variant="quiet" onClick={() => setAction("sign_out_everywhere")}>
                {t("actions.signOut")}
              </Button>
              {account.status === "active" ? (
                <Button variant="destructive" onClick={() => setAction("suspend")}>
                  {t("actions.suspend")}
                </Button>
              ) : (
                <Button variant="warning" onClick={() => setAction("lift_suspension")}>
                  {t("actions.lift")}
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section title={t("contexts.title")} id="contexts" notes={[t("contexts.never")]}>
          <Row
            label={t("contexts.fighter")}
            value={t(`contexts.profile.${account.contexts.fighter_profile}`)}
          />
          <Row
            label={t("contexts.coach")}
            value={t(`contexts.profile.${account.contexts.coach_profile}`)}
          />
          <Row
            label={t("contexts.gymStaff")}
            value={t("contexts.count", { count: account.contexts.gym_staff })}
          />
          <Row
            label={t("contexts.gymMember")}
            value={t("contexts.count", { count: account.contexts.gym_member })}
          />
          <Row
            label={t("contexts.sponsor")}
            value={t("contexts.count", { count: account.contexts.sponsor_memberships })}
          />
          <Row
            label={t("contexts.operator")}
            value={operator ? t("contexts.operatorYes") : t("contexts.operatorNo")}
          />
        </Section>

        <Section
          title={t("security.title")}
          id="security"
          notes={[t("security.verification"), t("recovery")]}
        >
          <Row
            label={t("security.email")}
            value={account.masked_emails.join(", ") || t("security.noEmail")}
          />
          <Row
            label={t("security.methods")}
            value={account.providers
              .map((provider) => t(`security.providers.${provider}`))
              .join(" · ")}
          />
          <Row
            label={t("security.registration")}
            value={t(`security.registrationStates.${account.registration}`)}
          />
          <Row
            label={t("security.sessions")}
            value={
              account.sessions.length === 0 ? (
                t("security.noSessions")
              ) : (
                <ul
                  className="flex flex-col gap-0.5"
                  data-account-sessions={account.sessions.length}
                >
                  {account.sessions.map((session) => (
                    <li key={`${session.started_at}-${session.expires_at}`}>
                      {t("security.sessionLine", {
                        start: date(session.started_at),
                        end: date(session.expires_at),
                      })}
                    </li>
                  ))}
                </ul>
              )
            }
          />
          <Row
            label={t("security.lastSignIn")}
            value={account.last_sign_in_at ? date(account.last_sign_in_at) : t("security.never")}
          />
        </Section>
      </div>

      <RevealDialog
        accountId={account.id}
        reason={reason}
        open={revealing}
        onOpenChange={setRevealing}
      />
      {action && (
        <AccountActionDialog
          action={action}
          accountId={account.id}
          accountLabel={label}
          open
          onOpenChange={(open) => !open && setAction(null)}
          onSettled={onChanged}
        />
      )}
    </div>
  );
}

function Section({
  title,
  id,
  notes,
  children,
}: {
  title: string;
  id: string;
  notes: string[];
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`account-${id}`}
      className="flex flex-col gap-3 rounded-3xl border bg-surface p-5"
    >
      <h2 id={`account-${id}`} className="type-title font-display">
        {title}
      </h2>
      <dl className="flex flex-col divide-y">{children}</dl>
      {notes.map((note) => (
        <p key={note} className="type-caption text-faint-foreground">
          {note}
        </p>
      ))}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-3">
      <dt className="type-body-sm text-muted-foreground">{label}</dt>
      <dd className="type-body-sm sm:text-right">{value}</dd>
    </div>
  );
}

function RevealDialog({
  accountId,
  reason,
  open,
  onOpenChange,
}: {
  accountId: string;
  reason: ReadReason;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("controlPlane.users.detail.reveal");
  const action = useTranslations("controlPlane.users.action");
  const keys = useOperatorKeys();
  const [addresses, setAddresses] = useState<string[] | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "step_up" | "failed">("idle");

  const reveal = async (): Promise<void> => {
    setState("busy");
    try {
      setAddresses(await revealEmail(accountId, reason));
      setState("idle");
    } catch (error) {
      setState(isApiError(error) && error.code === "step_up_required" ? "step_up" : "failed");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setAddresses(null);
          setState("idle");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent closeLabel={t("cancel")} className="sm:max-w-130" data-account-reveal>
        <DialogTitle className="type-h3 font-display">{t("title")}</DialogTitle>
        <DialogDescription className="type-body-sm text-muted-foreground">
          {t("body")}
        </DialogDescription>
        {addresses ? (
          <ul className="flex flex-col gap-1 type-body-sm font-bold" data-account-revealed>
            {addresses.map((address) => (
              <li key={address}>{address}</li>
            ))}
          </ul>
        ) : (
          <>
            {state === "step_up" && (
              <p role="status" className="type-body-sm">
                {action("stepUp")}
              </p>
            )}
            {state === "failed" && (
              <p role="alert" className="type-body-sm font-bold text-destructive">
                {t("failed")}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="quiet" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              {state === "step_up" ? (
                <Button
                  onClick={() =>
                    void keys
                      .verifyKey()
                      .then(reveal)
                      .catch(() => setState("step_up"))
                  }
                >
                  <KeyRoundIcon aria-hidden />
                  {action("useKey")}
                </Button>
              ) : (
                <Button
                  loading={state === "busy"}
                  onClick={() => void reveal()}
                  data-account-reveal-confirm
                >
                  {t("reveal")}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
