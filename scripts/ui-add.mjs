// Adds shadcn/ui components into src/shared/ui (see components.json), then
// normalises them to this repository's conventions:
//
// * The shadcn registry imports `cn` from the `cn` npm package. This repo has a
//   single canonical helper (clsx + tailwind-merge) in src/shared/lib/utils.ts,
//   so imports are rewritten to it and the `cn` package is removed again.
//
// Usage: pnpm ui:add <component...> [shadcn add options]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const UI_DIR = "src/shared/ui";
const CANONICAL_CN = "@/shared/lib/utils";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: pnpm ui:add <component...> [shadcn add options]");
  process.exit(1);
}

const run = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { stdio: "inherit" });

run("pnpm", ["exec", "shadcn", "add", ...args]);

let rewritten = 0;
for (const file of readdirSync(UI_DIR)) {
  if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
  const path = join(UI_DIR, file);
  const source = readFileSync(path, "utf8");
  const next = source.replaceAll(/from ["']cn["']/g, `from "${CANONICAL_CN}"`);
  if (next !== source) {
    writeFileSync(path, next);
    rewritten += 1;
  }
}
console.log(`ui:add: pointed ${rewritten} file(s) at ${CANONICAL_CN}`);

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (pkg.dependencies?.cn || pkg.devDependencies?.cn) {
  run("pnpm", ["remove", "cn"]);
}

run("pnpm", ["exec", "prettier", "--write", UI_DIR]);
