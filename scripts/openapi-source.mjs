// Shared helpers for the OpenAPI snapshot scripts.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Committed verbatim copy of the backend artifact that Orval generates from. */
export const SNAPSHOT_PATH = "openapi/simplefit.api.json";

/**
 * Canonical artifact owned by the backend. Defaults to the sibling checkout
 * (simpleFit-boxing/simplefit-api); override with SIMPLEFIT_API_OPENAPI.
 */
export const UPSTREAM_PATH = resolve(
  process.env.SIMPLEFIT_API_OPENAPI ?? "../simplefit-api/openapi/simplefit.api.json",
);

export function upstreamAvailable() {
  return existsSync(UPSTREAM_PATH);
}

/** Reads an OpenAPI JSON document, failing loudly if it is not one. */
export function readOpenApi(path) {
  const raw = readFileSync(path, "utf8");
  let document;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
  if (typeof document.openapi !== "string" || typeof document.paths !== "object") {
    throw new Error(`${path} is not an OpenAPI document (missing "openapi" or "paths").`);
  }
  return { raw, document };
}
