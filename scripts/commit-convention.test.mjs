import { describe, expect, it } from "vitest";

import { validateCommitHeader } from "./commit-convention.mjs";

describe("validateCommitHeader", () => {
  it.each([
    "feat: SF-14 - add fighter onboarding",
    "fix: SF-22 - prevent duplicate booking",
    "refactor: SF-31 - extract training mapper",
    "test: SF-18 - cover sparring validation",
    "docs: SF-5 - document OpenAPI workflow",
    "chore: SF-11 - configure web platform foundation",
  ])("accepts %s", (header) => {
    expect(validateCommitHeader(header)).toEqual([true, ""]);
  });

  it.each([
    ["feat: add test", /Jira issue key/],
    ["feat: SF-14 add fighter onboarding", /does not match/],
    ["feature: SF-14 - add fighter onboarding", /does not match/],
    ["feat(web): SF-14 - add fighter onboarding", /does not match/],
    ["feat: sf-14 - add fighter onboarding", /Jira issue key/],
    ["feat: SF-14 - ", /does not match/],
    ["SF-14 - add fighter onboarding", /does not match/],
    ["revert: SF-40 - revert booking reminder", /does not match/],
  ])("rejects %s", (header, message) => {
    const [valid, reason] = validateCommitHeader(header);
    expect(valid).toBe(false);
    expect(reason).toMatch(message);
  });
});
