// Verifies the generated API client cannot drift from the API contract.
//
// 1. Snapshot vs backend: when the backend artifact is available locally,
//    openapi/simplefit.api.json must be byte-identical to it.
// 2. Generated code vs snapshot: Orval regenerates into a scratch directory at
//    the same depth as src/shared/api/generated (so relative imports match),
//    and the result must be identical to the committed generated code.
//
// Fix any failure with `pnpm api:generate` and commit the result.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";

import { readOpenApi, SNAPSHOT_PATH, UPSTREAM_PATH, upstreamAvailable } from "./openapi-source.mjs";

const GENERATED_DIR = "src/shared/api/generated";
const SCRATCH_DIR = "src/shared/api/.generated-check";

const failures = [];

const snapshot = readOpenApi(SNAPSHOT_PATH);

if (upstreamAvailable()) {
  const upstream = readOpenApi(UPSTREAM_PATH);
  if (upstream.raw !== snapshot.raw) {
    failures.push(`${SNAPSHOT_PATH} differs from the backend artifact at ${UPSTREAM_PATH}.`);
  } else {
    console.log(`api:check: snapshot matches backend artifact (${UPSTREAM_PATH}).`);
  }
} else {
  console.log(
    `api:check: backend artifact not found at ${UPSTREAM_PATH}; skipping snapshot comparison.`,
  );
}

rmSync(SCRATCH_DIR, { recursive: true, force: true });
try {
  execFileSync(join("node_modules", ".bin", "orval"), ["--config", "orval.config.ts"], {
    env: { ...process.env, ORVAL_OUTPUT_DIR: SCRATCH_DIR },
    stdio: ["ignore", "ignore", "inherit"],
  });

  const expected = listFiles(SCRATCH_DIR);
  const actual = existsSync(GENERATED_DIR) ? listFiles(GENERATED_DIR) : [];

  for (const file of expected) {
    if (!actual.includes(file)) failures.push(`missing generated file: ${GENERATED_DIR}/${file}`);
    else if (read(SCRATCH_DIR, file) !== read(GENERATED_DIR, file)) {
      failures.push(`stale or edited generated file: ${GENERATED_DIR}/${file}`);
    }
  }
  for (const file of actual) {
    if (!expected.includes(file))
      failures.push(`unexpected generated file: ${GENERATED_DIR}/${file}`);
  }
} finally {
  rmSync(SCRATCH_DIR, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`api:check: FAILED\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  console.error(
    "Run `pnpm api:generate` and commit the result. Never edit generated code by hand.",
  );
  process.exit(1);
}

console.log(`api:check: ${GENERATED_DIR} is up to date with ${SNAPSHOT_PATH}.`);

function listFiles(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort();
}

function read(root, file) {
  return readFileSync(join(root, file), "utf8");
}
