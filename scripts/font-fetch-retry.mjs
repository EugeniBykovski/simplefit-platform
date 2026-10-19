#!/usr/bin/env node
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

/*
 * next/font/google downloads the brand typefaces (src/shared/styles/fonts.ts)
 * from Google Fonts at build time, in `next build` and in the Storybook build.
 * Its own retries are a few seconds apart, so a short outage on a CI runner
 * fails the build ("Failed to fetch `Unbounded` from Google Fonts") although
 * nothing in the code changed. CI runs those builds through this wrapper: it
 * runs the command again, after a pause, only when the failure is that
 * download. Any other failure (a type error, a broken story) fails at once.
 *
 *   node scripts/font-fetch-retry.mjs pnpm storybook:build
 */
export const FONT_FETCH_FAILURE = /Failed to fetch [`'"]?[\w ]+[`'"]? from Google Fonts/;

export function isFontFetchFailure(output) {
  return FONT_FETCH_FAILURE.test(output);
}

const ATTEMPTS = 3;
const PAUSE_MS = 30_000;

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["inherit", "pipe", "pipe"] });
    let output = "";
    const keep = (target) => (chunk) => {
      target.write(chunk);
      output += chunk;
    };
    child.stdout.on("data", keep(process.stdout));
    child.stderr.on("data", keep(process.stderr));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function main([command, ...args]) {
  if (!command) {
    console.error("usage: node scripts/font-fetch-retry.mjs <command> [args...]");
    return 2;
  }
  for (let attempt = 1; ; attempt += 1) {
    const { code, output } = await run(command, args);
    if (code === 0 || attempt === ATTEMPTS || !isFontFetchFailure(output)) return code;
    console.error(
      `\n[font-fetch-retry] Google Fonts could not be reached (attempt ${attempt}/${ATTEMPTS}); ` +
        `retrying in ${PAUSE_MS / 1000} s.\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main(process.argv.slice(2)));
}
