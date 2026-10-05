// SimpleFit commit message convention (enforced by commitlint and CI; see
// docs/engineering-standards.md §3). GitHub's `Revert "…"` commits and merge
// commits are skipped by commitlint's default ignores.
//
//   <type>: <JIRA-ID> - <description>
//   feat: SF-14 - add fighter onboarding
//
// Kept dependency-free so commitlint.config.mjs and the tests share one source.

export const COMMIT_TYPES = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "test",
  "docs",
  "build",
  "ci",
  "chore",
];

export const JIRA_KEY_PATTERN = /SF-[0-9]+/;

export const COMMIT_HEADER_PATTERN = new RegExp(
  `^(${COMMIT_TYPES.join("|")}): (${JIRA_KEY_PATTERN.source}) - (\\S.*)$`,
);

export const COMMIT_FORMAT_HELP =
  "Expected '<type>: SF-<n> - <description>', e.g. 'feat: SF-14 - add fighter onboarding'. " +
  `Allowed types: ${COMMIT_TYPES.join(", ")}.`;

/** Validates a commit header (first line). Returns [valid, message]. */
export function validateCommitHeader(header) {
  const value = (header ?? "").trim();

  if (!JIRA_KEY_PATTERN.test(value)) {
    return [false, `Commit header must contain a Jira issue key (SF-<n>). ${COMMIT_FORMAT_HELP}`];
  }
  if (!COMMIT_HEADER_PATTERN.test(value)) {
    return [false, `Commit header does not match the convention. ${COMMIT_FORMAT_HELP}`];
  }
  return [true, ""];
}
