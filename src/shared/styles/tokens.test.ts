import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const tokensCss = readFileSync(join(__dirname, "tokens.css"), "utf8");
const themeCss = readFileSync(join(__dirname, "theme.css"), "utf8");

/** Custom properties declared in the CSS block whose selector matches. */
function block(selectorPattern: RegExp): Record<string, string> {
  const match = tokensCss.match(new RegExp(`${selectorPattern.source}\\s*\\{([^}]*)\\}`));
  if (!match?.[1]) throw new Error(`block ${selectorPattern} not found`);
  return Object.fromEntries(
    [...match[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

const palette = block(/:root/);
const dark = block(/:root,\s*\.dark/);
const light = block(/\.light/);

function resolve(value: string, scope: Record<string, string>): string {
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (!ref) return value;
  const next = scope[ref[1]!] ?? palette[ref[1]!];
  if (!next) throw new Error(`unknown token ${ref[1]}`);
  return resolve(next, scope);
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const semanticTokens = [
  "background",
  "foreground",
  "surface",
  "surface-foreground",
  "surface-subtle",
  "surface-elevated",
  "muted",
  "muted-foreground",
  "border",
  "input",
  "ring",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "info",
  "info-foreground",
];

// [foreground, background] pairs that carry text and must meet WCAG AA (4.5:1).
const textPairs = [
  ["foreground", "background"],
  ["surface-foreground", "surface"],
  ["foreground", "surface-elevated"],
  ["muted-foreground", "background"],
  ["muted-foreground", "surface"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["success-foreground", "success"],
  ["warning-foreground", "warning"],
  ["info-foreground", "info"],
  ["destructive-subtle-foreground", "destructive-subtle"],
  ["success-subtle-foreground", "success-subtle"],
  ["warning-subtle-foreground", "warning-subtle"],
  ["info-subtle-foreground", "info-subtle"],
];

describe.each([
  ["dark", dark],
  ["light", light],
])("%s theme", (_name, theme) => {
  it("defines every semantic token", () => {
    for (const token of semanticTokens) expect(theme, token).toHaveProperty(token);
  });

  it.each(textPairs)("%s on %s meets WCAG AA contrast", (fg, bg) => {
    const ratio = contrast(resolve(`var(--${fg})`, theme), resolve(`var(--${bg})`, theme));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("focus ring is visible against the background (WCAG 1.4.11, 3:1)", () => {
    expect(
      contrast(resolve("var(--ring)", theme), resolve("var(--background)", theme)),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("Tailwind theme", () => {
  it("maps every semantic token to a colour utility", () => {
    for (const token of semanticTokens) {
      expect(themeCss).toContain(`--color-${token}: var(--${token});`);
    }
  });

  it("removes the default Tailwind palette", () => {
    expect(themeCss).toMatch(/--color-\*:\s*initial;/);
  });

  it("keeps the documented brand palette", () => {
    expect(palette).toMatchObject({
      "graphite-950": "#111312",
      "graphite-900": "#181b19",
      bone: "#edefe7",
      "olive-400": "#aeb95a",
      amber: "#e2a250",
      coral: "#df7a5e",
    });
  });
});
