/**
 * Pre-commit: fast checks on staged files only. Typecheck, tests and the
 * production build run in `pnpm quality` and CI, not here.
 *
 * @type {import("lint-staged").Configuration}
 */
const config = {
  "*.{js,mjs,cjs,ts,mts,cts,tsx}": [
    "eslint --max-warnings=0 --no-warn-ignored --fix",
    "prettier --write --ignore-unknown",
  ],
  "*.{json,md,css,yml,yaml}": "prettier --write --ignore-unknown",
};

export default config;
