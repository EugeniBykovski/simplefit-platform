"use client";

import {
  AlertTriangleIcon,
  CheckIcon,
  CircleHelpIcon,
  ClockIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { BrandTile } from "@/shared/ui/brand-mark";
import { Button } from "@/shared/ui/button";

/**
 * What AD0 shows (Claude Design `AdminSignIn`, MVP states). Presentational: the
 * gate decides the view from the backend's operator answer and the ceremony in
 * progress.
 */
export type EntryView =
  | { kind: "checking" }
  | { kind: "loadFailed" }
  | { kind: "unavailable" }
  | { kind: "enrollmentExpired" }
  | { kind: "unsupported" }
  | { kind: "serviceUnavailable" }
  | { kind: "recovery" }
  /** `failed` is the design's `failed` state; `lapsed` its `reverify`. */
  | { kind: "key"; lapsed: boolean; problem?: "failed" | "rateLimited" | undefined }
  | { kind: "waiting" }
  | {
      kind: "enroll";
      registered: number;
      required: number;
      problem?: "failed" | "duplicate" | "rejected" | "rateLimited" | undefined;
    }
  | { kind: "enrollDone"; required: number };

export type EntryActions = {
  onUseKey: () => void;
  onRegister: () => void;
  onCancel: () => void;
  onRecovery: () => void;
  onBack: () => void;
  onContinue: () => void;
  onRetry: () => void;
  /** SF-157: back to the Control Plane from key registration (it opens without keys). */
  onLeave?: () => void;
};

type Tone = "neutral" | "warning" | "destructive" | "success";

export function ControlPlaneEntry({ view, ...on }: { view: EntryView } & EntryActions) {
  const t = useTranslations("controlPlane.entry");
  return (
    <div data-control-plane-entry={view.kind} className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center gap-2.5 px-4 sm:px-12">
        <Link href={routeHref("web.root")} className="flex items-center gap-2.5 rounded-md">
          <BrandTile size="sm" />
          <span className="type-brand">{siteConfig.name.split(" ")[0]}</span>
        </Link>
        <span className="ml-auto hidden type-label text-faint-foreground uppercase sm:inline">
          {t("header")}
        </span>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 justify-center px-4 pt-8 pb-12 outline-none sm:px-12 sm:pt-16"
      >
        <Card view={view} on={on} />
      </main>
    </div>
  );
}

function Card({ view, on }: { view: EntryView; on: EntryActions }) {
  const t = useTranslations("controlPlane.entry");

  if (view.kind === "checking") {
    return (
      <section
        role="status"
        aria-busy="true"
        className="flex h-fit w-full max-w-130 flex-col gap-4 rounded-3xl border bg-surface p-6.5"
      >
        <span aria-hidden className="h-3 w-2/5 animate-pulse rounded-full bg-muted" />
        <span aria-hidden className="h-3 w-7/10 animate-pulse rounded-full bg-muted" />
        <p className="type-body-sm text-muted-foreground">{t("checking")}</p>
      </section>
    );
  }

  switch (view.kind) {
    case "unavailable":
      return (
        <Frame title={t("unavailable.title")} body={t("unavailable.body")}>
          <Button asChild variant="quiet" className="h-12">
            <Link href={routeHref("web.root")}>{t("unavailable.action")}</Link>
          </Button>
        </Frame>
      );
    case "loadFailed":
      return (
        <Frame
          pill={{ icon: AlertTriangleIcon, tone: "destructive", label: t("pill.problem") }}
          title={t("loadFailed.title")}
          body={t("loadFailed.body")}
        >
          <Primary onClick={on.onRetry}>{t("loadFailed.retry")}</Primary>
        </Frame>
      );
    case "enrollmentExpired":
    case "unsupported":
    case "serviceUnavailable":
      return (
        <Frame
          pill={{ icon: AlertTriangleIcon, tone: "warning", label: t("pill.problem") }}
          title={t(`${view.kind}.title`)}
          body={t(`${view.kind}.body`)}
        >
          {view.kind === "serviceUnavailable" ? (
            <Primary onClick={on.onRetry}>{t("loadFailed.retry")}</Primary>
          ) : (
            <Button variant="link" className="h-11 w-fit px-0" onClick={on.onRecovery}>
              {t("key.recovery")}
            </Button>
          )}
          <Leave on={on} />
        </Frame>
      );
    case "recovery":
      return (
        <Frame
          pill={{ icon: CircleHelpIcon, tone: "neutral", label: t("pill.recovery") }}
          title={t("recovery.title")}
          body={t("recovery.body")}
        >
          <Button variant="quiet" className="h-12" onClick={on.onBack}>
            {t("recovery.back")}
          </Button>
        </Frame>
      );
    case "waiting":
      return (
        <Frame
          pill={{ icon: KeyRoundIcon, tone: "neutral", label: t("pill.key") }}
          title={t("waiting.title")}
          body={t("waiting.body")}
          busy
        >
          <p role="status" className="type-body-sm text-muted-foreground">
            {t("waiting.status")}
          </p>
          <Button variant="quiet" className="h-12" onClick={on.onCancel}>
            {t("waiting.cancel")}
          </Button>
        </Frame>
      );
    case "key": {
      const failed = view.problem !== undefined;
      return (
        <Frame
          pill={
            failed
              ? { icon: AlertTriangleIcon, tone: "destructive", label: t("pill.failed") }
              : view.lapsed
                ? { icon: ClockIcon, tone: "warning", label: t("pill.reverify") }
                : { icon: KeyRoundIcon, tone: "neutral", label: t("pill.key") }
          }
          title={failed ? t("failed.title") : view.lapsed ? t("reverify.title") : t("key.title")}
          body={failed ? t("failed.body") : view.lapsed ? t("reverify.body") : t("key.body")}
          alert={view.problem === "rateLimited" ? t("rateLimited") : undefined}
        >
          <Primary icon onClick={on.onUseKey}>
            {failed ? t("failed.retry") : t("key.action")}
          </Primary>
          <Button variant="link" className="h-11 w-fit px-0" onClick={on.onRecovery}>
            {t("key.recovery")}
          </Button>
        </Frame>
      );
    }
    case "enroll": {
      const step = Math.min(view.registered + 1, view.required);
      const second = view.registered > 0;
      const alert =
        view.problem === "duplicate"
          ? t("duplicate")
          : view.problem === "rejected"
            ? t("rejected")
            : view.problem === "rateLimited"
              ? t("rateLimited")
              : view.problem === "failed"
                ? t("failed.body")
                : undefined;
      return (
        <Frame
          pill={{
            icon: KeyRoundIcon,
            tone: "warning",
            label: t("pill.enroll", { step, total: view.required }),
          }}
          title={second ? t("enrollSecond.title") : t("enroll.title")}
          body={second ? t("enrollSecond.body") : t("enroll.body")}
          alert={alert}
        >
          <KeyList registered={view.registered} required={view.required} />
          <Primary icon onClick={on.onRegister}>
            {second ? t("enrollSecond.action") : t("enroll.action")}
          </Primary>
          <Button variant="link" className="h-11 w-fit px-0" onClick={on.onRecovery}>
            {t("key.recovery")}
          </Button>
          <Leave on={on} />
        </Frame>
      );
    }
    case "enrollDone":
      return (
        <Frame
          pill={{ icon: ShieldCheckIcon, tone: "success", label: t("pill.done") }}
          title={t("enrollDone.title")}
          body={t("enrollDone.body")}
        >
          <KeyList registered={view.required} required={view.required} />
          <Primary onClick={on.onContinue}>{t("enrollDone.action")}</Primary>
        </Frame>
      );
  }
}

/** SF-157: "Back to the Control Plane", when the gate offers it. */
function Leave({ on }: { on: EntryActions }) {
  const t = useTranslations("controlPlane.entry");
  if (on.onLeave === undefined) return null;
  return (
    <Button variant="quiet" className="h-12" onClick={on.onLeave} data-control-plane-leave>
      {t("leave")}
    </Button>
  );
}

function Frame({
  pill,
  title,
  body,
  alert,
  busy,
  children,
}: {
  pill?: { icon: LucideIcon; tone: Tone; label: string };
  title: string;
  body: string;
  alert?: string | undefined;
  busy?: boolean;
  children: ReactNode;
}) {
  const Icon = pill?.icon;
  return (
    <section
      aria-labelledby="control-plane-entry-title"
      aria-busy={busy || undefined}
      className="flex h-fit w-full max-w-130 flex-col gap-4 rounded-3xl border bg-surface p-5 sm:p-6.5"
    >
      {pill && Icon ? (
        <Badge variant={pill.tone} className="w-fit gap-1.5 uppercase">
          <Icon aria-hidden className="size-3.5" />
          {pill.label}
        </Badge>
      ) : null}
      <h1 id="control-plane-entry-title" className="type-h2 font-display text-pretty">
        {title}
      </h1>
      <p className="type-body text-pretty text-muted-foreground">{body}</p>
      {alert !== undefined && (
        <p role="alert" className="type-body-sm font-bold text-destructive">
          {alert}
        </p>
      )}
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function Primary({
  icon,
  onClick,
  children,
}: {
  icon?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button className="h-12" onClick={onClick} data-control-plane-primary>
      {icon ? <KeyRoundIcon aria-hidden /> : null}
      {children}
    </Button>
  );
}

function KeyList({ registered, required }: { registered: number; required: number }) {
  const t = useTranslations("controlPlane.entry.enroll");
  return (
    <ul className="flex flex-col divide-y rounded-xl border">
      {Array.from({ length: required }, (_, index) => {
        const done = index < registered;
        return (
          <li key={index} className="flex min-h-10 items-center gap-2.5 px-3.5 py-2 type-body-sm">
            <KeyRoundIcon aria-hidden className="size-4 text-muted-foreground" />
            <span className="flex-1">{index === 0 ? t("first") : t("backup")}</span>
            {done ? (
              <span className="flex items-center gap-1 font-bold text-highlight">
                <CheckIcon aria-hidden className="size-4" />
                {t("registered")}
              </span>
            ) : (
              <span className="text-faint-foreground">{t("notYet")}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
