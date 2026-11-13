"use client";

import { FileTextIcon, LockIcon, TriangleAlertIcon, UploadIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import {
  putToStorage,
  type SponsorApplication,
  type SponsorApplicationPolicy,
  type SponsorEvidence,
  type SponsorEvidenceInput,
  type SponsorUpload,
} from "@/entities/sponsor-application";
import type { SponsorApplicationEvidenceRequestContentType } from "@/shared/api/generated/model";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";

import { outcomeOf } from "../model/outcome";
import { ChoicePills } from "@/shared/ui/choice-pills";

/**
 * Private evidence (SP7, and SP1's logo; SF-114, ADR 0032 rule 1): the
 * backend authorizes each upload, the browser sends the bytes straight to
 * the presigned URL, and only the backend's confirmation (it reads the
 * stored object) makes a document "uploaded". A successful PUT alone is
 * never shown as done. The presigned operation lives in this component's
 * memory for that upload only: never cached, stored, logged or put in a URL.
 * An expired operation is never reused; a new one is asked for.
 */

export type EvidenceActions = {
  addEvidence: (
    base: SponsorApplication,
    input: SponsorEvidenceInput,
  ) => Promise<{ evidence: SponsorEvidence; upload: SponsorUpload }>;
  confirmEvidence: (evidenceId: string) => Promise<SponsorApplication>;
  removeEvidence: (base: SponsorApplication, evidenceId: string) => Promise<SponsorApplication>;
  reload: () => Promise<SponsorApplication | null>;
};

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; name: string; id?: string }
  | { kind: "verifying"; name: string; id: string }
  | { kind: "done"; name: string }
  | { kind: "failed"; problem: Problem; retry?: () => void };

type Problem =
  | "type"
  | "size"
  | "name"
  | "limit"
  | "storage"
  | "mismatch"
  | "unavailable"
  | "unconfirmed"
  | "stale"
  | "session"
  | "rateLimited"
  | "failed";

type Pending = { upload: SponsorUpload; file: File; kind: string };

const TYPE_KEYS: Partial<Record<string, "pdf" | "jpeg" | "png">> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpeg",
  "image/png": "png",
};

const expired = (upload: SponsorUpload) => Date.parse(upload.expires_at) <= Date.now();

export function EvidencePanel({
  application,
  uploads,
  actions,
  kinds,
  editable,
  onSessionEnded,
}: {
  /** `null` before the draft exists: documents attach to a saved application. */
  application: SponsorApplication | null;
  uploads: SponsorApplicationPolicy["uploads"];
  actions: EvidenceActions;
  /** The document kinds offered here (SP1 offers the logo only). */
  kinds: readonly string[];
  editable: boolean;
  onSessionEnded: () => void;
}) {
  const t = useTranslations("sponsorApplication.uploads");
  const format = useFormatter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(new Map<string, Pending>());
  // The latest application, for writes that run after an await (their revision must be current).
  const latest = useRef(application);
  useEffect(() => {
    latest.current = application;
  }, [application]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const offered = kinds.filter((kind) => uploads.kinds.includes(kind));
  const [kind, setKind] = useState(offered[0] ?? "other");

  const documents = (application?.evidence ?? []).filter((item) => offered.includes(item.kind));
  const busy = phase.kind === "uploading" || phase.kind === "verifying";
  const megabytes = (bytes: number) =>
    format.number(bytes / (1024 * 1024), {
      style: "unit",
      unit: "megabyte",
      maximumFractionDigits: 1,
    });

  if (!uploads.available) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="amber" icon={LockIcon}>
          <b>{t("unavailable.title")}</b> {t("unavailable.body")}
        </Notice>
        <div
          aria-disabled
          className="flex flex-col items-center gap-2 rounded-3xl border-[1.5px] border-dashed border-border-strong p-6 text-center opacity-70"
        >
          <UploadIcon aria-hidden className="size-5.5 text-muted-foreground" />
          <span className="type-body font-extrabold">{t("dropTitle")}</span>
          <span className="type-caption text-muted-foreground">{t("unavailable.note")}</span>
        </div>
      </div>
    );
  }

  const fail = (problem: Problem, retry?: () => void) =>
    setPhase({ kind: "failed", problem, retry });

  // A failed call, as the problem to show; `retry` repeats it when that is safe.
  const failFrom = (error: unknown, retry?: () => void) => {
    const outcome = outcomeOf(error);
    switch (outcome.kind) {
      case "session":
        onSessionEnded();
        return fail("session");
      case "stale":
      case "moved":
      case "gone":
        void actions.reload().catch(() => undefined);
        return fail("stale");
      case "evidenceLimit":
        return fail("limit");
      case "invalid":
        return fail("failed");
      case "rateLimited":
        return fail("rateLimited");
      case "unavailable":
        return fail("unavailable", retry);
      case "upload":
        return fail(outcome.reason === "mismatch" ? "mismatch" : "storage", retry);
      default:
        return fail("unconfirmed", retry);
    }
  };

  // Storage accepted the bytes: ask the backend to check them. Only its answer completes.
  const verify = async (evidenceId: string, name: string) => {
    setPhase({ kind: "verifying", name, id: evidenceId });
    try {
      await actions.confirmEvidence(evidenceId);
      pending.current.delete(evidenceId);
      setPhase({ kind: "done", name });
    } catch (error) {
      const outcome = outcomeOf(error);
      const held = pending.current.get(evidenceId);
      if (outcome.kind === "upload" && outcome.reason === "not_found" && held !== undefined) {
        // The object never landed: send it again while the operation is valid, else start over.
        return failFrom(
          error,
          () => void (expired(held.upload) ? restart(evidenceId) : send(evidenceId)),
        );
      }
      if (outcome.kind === "upload" && outcome.reason !== "not_found") {
        // Different, or too late: this document can't be completed. Remove it.
        await discard(evidenceId);
        return failFrom(error, held === undefined ? undefined : () => void begin(held.file));
      }
      return failFrom(error, () => void verify(evidenceId, name));
    }
  };

  // Sends the bytes to the presigned operation of `evidenceId`.
  const send = async (evidenceId: string) => {
    const held = pending.current.get(evidenceId);
    if (held === undefined) return;
    if (expired(held.upload)) return restart(evidenceId);
    setPhase({ kind: "uploading", name: held.file.name, id: evidenceId });
    if (await putToStorage(held.upload, held.file)) return verify(evidenceId, held.file.name);
    fail("storage", () => void (expired(held.upload) ? restart(evidenceId) : send(evidenceId)));
  };

  // An operation that can't be used any more: drop its pending document, then a new one.
  const restart = async (evidenceId: string) => {
    const held = pending.current.get(evidenceId);
    await discard(evidenceId);
    if (held !== undefined) await begin(held.file);
  };

  const discard = async (evidenceId: string) => {
    pending.current.delete(evidenceId);
    const current = await actions.reload().catch(() => null);
    latest.current = current;
    if (current?.evidence.some((item) => item.evidence_id === evidenceId)) {
      latest.current = await actions.removeEvidence(current, evidenceId).catch(() => current);
    }
  };

  // Checks the file against the policy, then asks the backend for an upload.
  const begin = async (file: File) => {
    const base = latest.current;
    if (base === null) return;
    if (!uploads.content_types.includes(file.type)) return fail("type");
    if (file.size < 1 || file.size > uploads.max_bytes) return fail("size");
    if (file.name.length > 120) return fail("name");
    if (base.evidence.length >= uploads.max_documents) return fail("limit");
    setPhase({ kind: "uploading", name: file.name });
    try {
      const { evidence, upload } = await actions.addEvidence(base, {
        kind: kind as SponsorEvidenceInput["kind"],
        file_name: file.name,
        content_type: file.type as SponsorApplicationEvidenceRequestContentType,
        byte_size: file.size,
      });
      pending.current.set(evidence.evidence_id, { upload, file, kind });
      await send(evidence.evidence_id);
    } catch (error) {
      failFrom(error, () => void begin(file));
    }
  };

  const remove = async (evidence: SponsorEvidence) => {
    const base = latest.current;
    if (base === null) return;
    pending.current.delete(evidence.evidence_id);
    setPhase({ kind: "idle" });
    try {
      await actions.removeEvidence(base, evidence.evidence_id);
    } catch (error) {
      failFrom(error);
    }
  };

  const status = (item: SponsorEvidence) =>
    item.submitted
      ? t("status.submitted")
      : item.status === "uploaded"
        ? t("status.uploaded")
        : (phase.kind === "uploading" || phase.kind === "verifying") &&
            phase.id === item.evidence_id
          ? t("status.pending")
          : t("status.unfinished");

  const types = format.list(
    uploads.content_types.map((type) => {
      const key = TYPE_KEYS[type];
      return key === undefined ? type : t(`types.${key}`);
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      {documents.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label={t("listLabel")}>
          {documents.map((item) => (
            <li
              key={item.evidence_id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3"
            >
              <FileTextIcon aria-hidden className="size-4 flex-none text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="type-body-sm font-bold break-all">{item.file_name}</span>
                <span className="type-caption text-muted-foreground">
                  {t(`kinds.${item.kind}` as "kinds.other")} · {megabytes(item.byte_size)} ·{" "}
                  <span
                    className={cn(item.status === "uploaded" ? "text-highlight" : "text-warning")}
                  >
                    {status(item)}
                  </span>
                </span>
              </span>
              {editable && !item.submitted ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void remove(item)}
                  aria-label={t("removeNamed", { name: item.file_name })}
                >
                  {t("remove")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {editable ? (
        <div className="flex flex-col gap-3">
          {offered.length > 1 ? (
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-2 type-caption font-bold text-muted-foreground">
                {t("kindLegend")}
              </legend>
              <ChoicePills
                name={`${inputId}-kind`}
                type="radio"
                value={kind}
                disabled={busy}
                onChange={(next) => setKind(next as string)}
                options={offered.map((value) => ({
                  value,
                  label: t(`kinds.${value}` as "kinds.other"),
                }))}
              />
            </fieldset>
          ) : null}
          <label
            htmlFor={inputId}
            className={cn(
              "flex min-h-11 cursor-pointer flex-col items-center gap-2 rounded-3xl border-[1.5px] border-dashed border-border-strong p-6 text-center has-focus-visible:ring-2 has-focus-visible:ring-ring",
              (busy || application === null) && "cursor-not-allowed opacity-60",
            )}
          >
            <UploadIcon aria-hidden className="size-5.5 text-muted-foreground" />
            <span className="type-body font-extrabold">
              {offered.length === 1 && offered[0] === "logo" ? t("addLogo") : t("dropTitle")}
            </span>
            <span id={`${inputId}-rules`} className="type-caption text-muted-foreground">
              {t("rules", {
                types,
                size: megabytes(uploads.max_bytes),
                count: uploads.max_documents,
              })}
            </span>
            <input
              ref={input}
              id={inputId}
              type="file"
              accept={uploads.content_types.join(",")}
              disabled={busy || application === null}
              aria-describedby={`${inputId}-rules`}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file !== undefined) void begin(file);
              }}
            />
          </label>
          {application === null ? (
            <p className="type-caption text-muted-foreground">{t("needsDraft")}</p>
          ) : null}
        </div>
      ) : null}

      <div role="status" aria-live="polite" className="empty:hidden">
        {phase.kind === "uploading" ? (
          <p className="type-caption text-muted-foreground">
            {t("phase.uploading", { name: phase.name })}
          </p>
        ) : phase.kind === "verifying" ? (
          <p className="type-caption text-muted-foreground">
            {t("phase.verifying", { name: phase.name })}
          </p>
        ) : phase.kind === "done" ? (
          <p className="type-caption text-highlight">{t("phase.done", { name: phase.name })}</p>
        ) : null}
      </div>
      {phase.kind === "failed" ? (
        <Notice
          tone="coral"
          icon={TriangleAlertIcon}
          role="alert"
          action={
            phase.retry === undefined ? undefined : (
              <Button type="button" variant="quiet" size="sm" onClick={phase.retry}>
                {t("retry")}
              </Button>
            )
          }
        >
          {t(`problems.${phase.problem}`, {
            types,
            size: megabytes(uploads.max_bytes),
            count: uploads.max_documents,
          })}
        </Notice>
      ) : null}
      <p className="type-caption text-faint-foreground">{t("privacy")}</p>
    </div>
  );
}
