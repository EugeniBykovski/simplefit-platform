import { describe, expect, it } from "vitest";

import { fillLegalPlaceholders, parseLegalText } from "./legal-text";

describe("parseLegalText (SF-72)", () => {
  it("reads the registry's Markdown subset into headings, paragraphs and lists", () => {
    expect(
      parseLegalText("# Title\n\nFirst line\nsecond line\n\n## Part\n- one\n- two\n\nAfter."),
    ).toEqual([
      { kind: "heading", level: 1, text: "Title" },
      { kind: "paragraph", text: "First line second line" },
      { kind: "heading", level: 2, text: "Part" },
      { kind: "list", items: ["one", "two"] },
      { kind: "paragraph", text: "After." },
    ]);
  });

  it("keeps markup as plain text: never HTML or links", () => {
    const blocks = parseLegalText('<img src=x onerror="alert(1)"> [link](javascript:alert(1))');
    expect(blocks).toEqual([
      { kind: "paragraph", text: '<img src=x onerror="alert(1)"> [link](javascript:alert(1))' },
    ]);
  });

  it("fills only {coach} and {version}", () => {
    expect(
      fillLegalPlaceholders("{coach} sees {version}; {other} stays", {
        coach: "Coach Marek",
        version: "v-1",
      }),
    ).toBe("Coach Marek sees v-1; {other} stays");
    expect(fillLegalPlaceholders("{coach}", {})).toBe("{coach}");
  });
});
