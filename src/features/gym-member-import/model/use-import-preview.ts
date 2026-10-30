"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { callWithSession, onSessionBoundary } from "@/entities/session";
import { previewGymMemberImport } from "@/shared/api/generated/endpoints/gym-members/gym-members";
import type { GymMemberImportPreviewResponsePreview } from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";

import { readCsvFile, type FileProblem } from "./csv-file";

export type ImportPreview = GymMemberImportPreviewResponsePreview;

/** Which header column holds each SimpleFit field; `null`: not chosen (or not used, for name). */
export type ColumnMapping = { email: string | null; name: string | null };

/**
 * Why the preview did not run or came back refused (SF-95). `file`: the
 * backend could not read the list (bad quoting, too many rows or columns, a
 * field over 500 bytes...); `emailColumn`: no column was (or could be
 * suggested as) the email; `mapping`: a mapping the header does not have.
 * A preview stores nothing, so trying again is always safe.
 */
export type PreviewProblem =
  | { kind: "file" }
  | { kind: "emailColumn" }
  | { kind: "mapping" }
  | { kind: "limited"; minutes: number | null }
  | { kind: "draft" }
  | { kind: "forbidden" }
  | { kind: "gone" }
  | { kind: "unknown" };

export type ImportState = {
  /** The chosen file's name and size; never its content. */
  file: { name: string; size: number } | null;
  header: string[];
  mapping: ColumnMapping;
  fileProblem: FileProblem | null;
  reading: boolean;
  running: boolean;
  preview: ImportPreview | null;
  problem: PreviewProblem | null;
};

const EMPTY: ImportState = {
  file: null,
  header: [],
  mapping: { email: null, name: null },
  fileProblem: null,
  reading: false,
  running: false,
  preview: null,
  problem: null,
};

/**
 * The member-list dry run of one gym (OG12 on SF-95): choose a file, map its
 * columns, run the backend's validation, review the result. Commit does not
 * exist: the preview stores nothing and the backend answers
 * `commit.available: false` (D-G27 pending).
 *
 * The file's text is kept in a ref, outside React state and outside the
 * query cache, only while this gym's page has it chosen: it is dropped on
 * Clear, on a new file, when the page unmounts (another gym, leaving the
 * page) and at every session boundary (sign-out, another account). It is
 * never written to a URL, storage, a log or telemetry. The preview shows
 * only what the backend returns (addresses masked). An answer arriving after
 * any of those resets is ignored.
 */
export function useImportPreview(gymId: string) {
  const [state, setState] = useState<ImportState>(EMPTY);
  const text = useRef<string | null>(null);
  const run = useRef<{ generation: number; controller: AbortController | null }>({
    generation: 0,
    controller: null,
  });

  const clear = useCallback(() => {
    run.current.generation += 1;
    run.current.controller?.abort();
    run.current.controller = null;
    text.current = null;
    setState(EMPTY);
  }, []);

  useEffect(() => onSessionBoundary(clear), [clear]);
  useEffect(
    () => () => {
      run.current.generation += 1;
      run.current.controller?.abort();
      text.current = null;
    },
    [],
  );

  const choose = useCallback(
    async (file: File) => {
      clear();
      const generation = run.current.generation;
      setState({ ...EMPTY, file: { name: file.name, size: file.size }, reading: true });
      const read = await readCsvFile(file);
      if (generation !== run.current.generation) return;
      if (!read.ok) {
        setState({
          ...EMPTY,
          file: { name: file.name, size: file.size },
          fileProblem: read.problem,
        });
        return;
      }
      text.current = read.text;
      setState({ ...EMPTY, file: { name: file.name, size: file.size }, header: read.header });
    },
    [clear],
  );

  const setMapping = useCallback((mapping: ColumnMapping) => {
    // A changed mapping invalidates the shown result: it was for the other one.
    setState((current) => ({ ...current, mapping, preview: null, problem: null }));
  }, []);

  const validate = useCallback(async () => {
    const csv = text.current;
    if (csv === null) return;
    const { mapping } = state;
    if (mapping.name !== null && mapping.email === null) {
      setState((current) => ({ ...current, problem: { kind: "emailColumn" } }));
      return;
    }
    run.current.controller?.abort();
    const controller = new AbortController();
    run.current.controller = controller;
    const generation = run.current.generation;
    setState((current) => ({ ...current, running: true, preview: null, problem: null }));

    try {
      const response = await callWithSession((init) =>
        previewGymMemberImport(
          gymId,
          // Without a chosen email column the backend suggests the columns.
          mapping.email === null ? { csv } : { csv, mapping },
          { ...init, signal: controller.signal },
        ),
      );
      if (generation !== run.current.generation || controller.signal.aborted) return;
      const used = mappingOf(response.preview);
      setState((current) => ({
        ...current,
        running: false,
        mapping: used,
        preview: response.preview,
      }));
    } catch (error) {
      if (generation !== run.current.generation || controller.signal.aborted) return;
      setState((current) => ({ ...current, running: false, problem: previewProblem(error) }));
    } finally {
      if (run.current.controller === controller) run.current.controller = null;
    }
  }, [gymId, state]);

  return { state, choose, setMapping, validate, clear };
}

/** The columns the backend used for each field (its answer, also when it suggested them). */
function mappingOf(preview: ImportPreview): ColumnMapping {
  const find = (field: "email" | "name") =>
    preview.columns.find((column) => column.field === field)?.header ?? null;
  return { email: find("email"), name: find("name") };
}

function previewProblem(error: unknown): PreviewProblem {
  if (!isApiError(error)) return { kind: "unknown" };
  if (error.code === "validation_error") {
    const codes = error.fieldCodes;
    if (codes.email_column) return { kind: "emailColumn" };
    if (codes.mapping) return { kind: "mapping" };
    return { kind: "file" };
  }
  if (error.code === "rate_limited") {
    const seconds = error.retryAfterSeconds;
    return {
      kind: "limited",
      minutes: seconds === null ? null : Math.max(1, Math.ceil(seconds / 60)),
    };
  }
  if (error.code === "conflict" && error.details["setup_status"] === "draft") {
    return { kind: "draft" };
  }
  if (error.status === 403) return { kind: "forbidden" };
  if (error.status === 404) return { kind: "gone" };
  return { kind: "unknown" };
}
