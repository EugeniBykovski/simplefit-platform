"use client";

import { KeyRoundIcon, LogOutIcon, PlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { revokeOwnKey, useOwnKeys } from "@/entities/admin-operators";
import {
  keyCheckRemaining,
  useKeyCheckClock,
  useOperatorKeys,
  type Operator,
} from "@/entities/operator";
import { isApiError } from "@/shared/api/http/api-error";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";

type Note = "added" | "removed" | "minimum" | "keyFailed" | "failed" | "ended" | null;

/**
 * The viewer's own security (AD20 "Your security", SF-129): their keys (labels and
 * dates only), this session's key check, their permissions. They can add a key, remove
 * one while more than the required number remain, and end the key check now. Each
 * change needs a fresh key check, which the backend asks for; nothing changes here
 * until it answers.
 */
export function YourSecurity({ operator }: { operator: Operator }) {
  const t = useTranslations("controlPlane.operators.security");
  const format = useFormatter();
  const ids = useId();
  const now = useKeyCheckClock(operator);
  const ceremonies = useOperatorKeys();
  const keys = useOwnKeys(true);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);

  const remaining = keyCheckRemaining(operator, now);
  const minutes = remaining === undefined ? 0 : Math.ceil(remaining / 60_000);
  const active = (keys.data ?? []).filter((key) => key.revoked_at === null);
  const required = operator.security_keys.required;

  // A change that needs a fresh key check: check once, then try again.
  const withKeyCheck = async <T,>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      if (!isApiError(error) || error.code !== "step_up_required") throw error;
      await ceremonies.verifyKey();
      return run();
    }
  };

  const add = async () => {
    const name = label.trim();
    if (name.length === 0) return;
    setBusy("add");
    setNote(null);
    try {
      await withKeyCheck(() => ceremonies.registerKey(name));
      setLabel("");
      setNote("added");
    } catch {
      setNote("keyFailed");
    } finally {
      setBusy(null);
      void keys.refetch();
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    setNote(null);
    try {
      await withKeyCheck(() => revokeOwnKey(id));
      setNote("removed");
    } catch (error) {
      setNote(
        isApiError(error) && error.details.credentials === "minimum_required"
          ? "minimum"
          : "failed",
      );
    } finally {
      setBusy(null);
      setConfirming(null);
      void keys.refetch();
      void ceremonies.reread();
    }
  };

  const end = async () => {
    setBusy("end");
    setNote(null);
    try {
      await ceremonies.endKeyCheck();
      setNote("ended");
    } catch {
      setNote("failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-labelledby="operators-security"
      className="flex min-w-0 flex-col gap-4 rounded-3xl border bg-surface p-5"
      data-operators-security
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="operators-security" className="type-title font-display">
          {t("title")}
        </h2>
        <span className="flex-1" />
        <Badge
          variant={remaining ? "success" : "neutral"}
          data-key-check={remaining ? "on" : "off"}
        >
          {remaining ? t("keyCheck", { minutes }) : t("noKeyCheck")}
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="type-label text-faint-foreground uppercase">{t("keys")}</h3>
        {keys.isPending ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : keys.data === undefined ? (
          <p role="alert" className="type-body-sm text-destructive">
            {t("keysUnavailable")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-2xl border" data-own-keys={active.length}>
            {active.map((key, index) => (
              <li key={key.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                <KeyRoundIcon aria-hidden className="size-4 flex-none text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate type-body-sm font-extrabold">{key.label}</span>
                  <span className="type-caption text-muted-foreground">
                    {index === 0 ? t("first") : t("backup")} ·{" "}
                    {t("added", { date: format.dateTime(new Date(key.created_at), "date") })} ·{" "}
                    {key.last_used_at
                      ? t("lastUsed", {
                          time: format.dateTime(new Date(key.last_used_at), "dateTime"),
                        })
                      : t("neverUsed")}
                  </span>
                </div>
                {active.length > required &&
                  (confirming === key.id ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      loading={busy === key.id}
                      onClick={() => void remove(key.id)}
                    >
                      {t("confirmRemove", { label: key.label })}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="quiet"
                      disabled={busy !== null}
                      aria-label={t("removeLabel", { label: key.label })}
                      onClick={() => setConfirming(key.id)}
                    >
                      {t("remove")}
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        )}
        <p className="type-caption text-muted-foreground">{t("rules", { required })}</p>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${ids}-label`}>{t("newKeyLabel")}</Label>
          <Input
            id={`${ids}-label`}
            value={label}
            maxLength={60}
            onChange={(event) => setLabel(event.target.value)}
            disabled={busy !== null}
          />
        </div>
        <Button
          type="submit"
          variant="quiet"
          disabled={label.trim().length === 0 || (busy !== null && busy !== "add")}
          loading={busy === "add"}
        >
          <PlusIcon aria-hidden />
          {t("addKey")}
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        <h3 className="type-label text-faint-foreground uppercase">{t("permissions")}</h3>
        <ul className="flex flex-wrap gap-1.5" data-own-permissions>
          {operator.permissions.map((permission) => (
            <li key={permission}>
              <Badge variant="outline" className="font-mono">
                {permission}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="type-caption text-muted-foreground">{t("selfRules")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="quiet"
          disabled={!remaining || busy !== null}
          loading={busy === "end"}
          onClick={() => void end()}
        >
          <LogOutIcon aria-hidden />
          {t("endKeyCheck")}
        </Button>
        <p role="status" className="type-body-sm">
          {note === "added" && t("notes.added")}
          {note === "removed" && t("notes.removed")}
          {note === "ended" && t("notes.ended")}
        </p>
        {(note === "minimum" || note === "keyFailed" || note === "failed") && (
          <p role="alert" className="type-body-sm font-bold text-destructive">
            {t(`notes.${note}`)}
          </p>
        )}
      </div>
    </section>
  );
}
