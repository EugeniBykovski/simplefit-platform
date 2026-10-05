import {
  COMMIT_HEADER_PATTERN,
  COMMIT_TYPES,
  validateCommitHeader,
} from "./scripts/commit-convention.mjs";

/**
 * Enforces `<type>: SF-<n> - <description>`. commitlint's conventional preset
 * cannot express the mandatory Jira key, so the header is parsed with our own
 * pattern and checked by the custom `simplefit-header` rule.
 *
 * Merge commits and git's default revert messages are ignored by commitlint's
 * default ignores.
 *
 * @type {import("@commitlint/types").UserConfig}
 */
const config = {
  parserPreset: {
    parserOpts: {
      headerPattern: COMMIT_HEADER_PATTERN,
      headerCorrespondence: ["type", "ticket", "subject"],
    },
  },
  plugins: [
    {
      rules: {
        "simplefit-header": (parsed) => validateCommitHeader(parsed.header),
      },
    },
  ],
  rules: {
    "simplefit-header": [2, "always"],
    "type-enum": [2, "always", COMMIT_TYPES],
    "header-max-length": [2, "always", 100],
    "body-leading-blank": [2, "always"],
    "footer-leading-blank": [2, "always"],
  },
  helpUrl: "docs/architecture/README.md#git-and-jira-conventions",
};

export default config;
