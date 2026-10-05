// Copies the backend OpenAPI artifact verbatim into openapi/simplefit.api.json.
//
// The backend (simplefit-api) owns the contract; this repo never edits the
// snapshot by hand. With --if-present a missing upstream is not an error (the
// committed snapshot is kept), which lets `pnpm api:generate` run anywhere.
import { writeFileSync } from "node:fs";

import { readOpenApi, SNAPSHOT_PATH, UPSTREAM_PATH, upstreamAvailable } from "./openapi-source.mjs";

const ifPresent = process.argv.includes("--if-present");

if (!upstreamAvailable()) {
  const message = `api:sync: backend OpenAPI artifact not found at ${UPSTREAM_PATH}`;
  if (ifPresent) {
    console.log(`${message}; keeping committed ${SNAPSHOT_PATH}.`);
    process.exit(0);
  }
  console.error(
    `${message}.\nSet SIMPLEFIT_API_OPENAPI or check out simplefit-api next to this repo.`,
  );
  process.exit(1);
}

const { raw, document } = readOpenApi(UPSTREAM_PATH);
writeFileSync(SNAPSHOT_PATH, raw);
console.log(
  `api:sync: ${SNAPSHOT_PATH} <- ${UPSTREAM_PATH} (${document.info?.title} ${document.info?.version})`,
);
