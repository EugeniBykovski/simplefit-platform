import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import spec from "../../../docs/design-tokens.json";

/*
 * The web implementation of the shared design-system contract
 * (docs/design-tokens.json, kept identical in simplefit-mobile). These tests
 * keep tokens.css and theme.css in lockstep with it, so web and mobile share
 * one design language.
 */
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
const themes = { dark: block(/:root,\s*\.dark/), light: block(/\.light/) } as const;
type ThemeName = keyof typeof themes;
type Palette = Record<string, string>;

const specPalette: Palette = spec.palette;

function resolve(value: string, scope: Record<string, string>): string {
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (!ref) return value;
  const next = scope[ref[1]!] ?? palette[ref[1]!];
  if (!next) throw new Error(`unknown token ${ref[1]}`);
  return resolve(next, scope);
}

/** The hex value the spec assigns to a semantic token in a theme. */
function specValue(theme: ThemeName, token: string): string {
  const name = (spec.semantic[theme] as Record<string, string>)[token]!;
  return specPalette[name]!;
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

const semanticTokens = Object.keys(spec.semantic.dark);

describe("palette", () => {
  it("matches the shared contract for every raw value it declares", () => {
    for (const [name, value] of Object.entries(palette)) {
      if (name in specPalette) expect(value, name).toBe(specPalette[name]);
    }
  });

  it("keeps the canonical Styleguide values (Claude Design, SF-17)", () => {
    expect(palette).toMatchObject({
      "graphite-950": "#111312",
      "graphite-900": "#181b19",
      "graphite-850": "#1f2320",
      "graphite-700": "#2e332f",
      bone: "#edefe7",
      "olive-200": "#e4eab8",
      "olive-300": "#c9d17e",
      "olive-400": "#aeb95a",
      "olive-600": "#4e5626",
      "olive-900": "#262b15",
      amber: "#e3a24f",
      coral: "#e07a5f",
    });
  });
});

describe.each(["dark", "light"] as const)("%s theme", (name) => {
  const theme = themes[name];

  it("defines every semantic token with the contract's value", () => {
    for (const token of semanticTokens) {
      expect(theme, token).toHaveProperty(token);
      expect(resolve(`var(--${token})`, theme), token).toBe(specValue(name, token));
    }
  });

  it.each(spec.contrast.text)("%s on %s meets WCAG AA contrast", (fg, bg) => {
    const ratio = contrast(resolve(`var(--${fg})`, theme), resolve(`var(--${bg})`, theme));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it.each(spec.contrast.nonText)("%s is visible on %s (WCAG 1.4.11, 3:1)", (fg, bg) => {
    const ratio = contrast(resolve(`var(--${fg})`, theme), resolve(`var(--${bg})`, theme));
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});

describe("Tailwind theme", () => {
  it("maps every semantic token to a colour utility", () => {
    for (const token of semanticTokens) {
      expect(themeCss).toContain(`--color-${token}: var(--${token});`);
    }
  });

  it("removes Tailwind's default palette, radius and font-size scales", () => {
    expect(themeCss).toMatch(/--color-\*:\s*initial;/);
    expect(themeCss).toMatch(/--radius-\*:\s*initial;/);
    expect(themeCss).toMatch(/--text-\*:\s*initial;/);
  });

  it("defines the radius scale", () => {
    for (const [name, px] of Object.entries(spec.radius)) {
      expect(themeCss).toContain(`--radius-${name}: ${px}px;`);
    }
  });

  it.each(Object.entries(spec.typography.roles))("type-%s matches its role", (role, def) => {
    const body = themeCss.match(new RegExp(`@utility type-${role} \\{([^}]*)\\}`))?.[1];
    expect(body, role).toBeDefined();
    const rem = (px: number) => `${px / 16}rem`;
    expect(body).toContain(`font-family: var(--font-${def.family});`);
    expect(body).toContain(`font-size: ${rem(def.size)};`);
    expect(body).toContain(`line-height: ${rem(def.lineHeight)};`);
    expect(body).toContain(`font-weight: ${def.weight};`);
    if (def.tracking) expect(body).toContain(`letter-spacing: ${def.tracking}em;`);
    expect(body?.includes("text-transform: uppercase")).toBe(Boolean("uppercase" in def));
  });

  it.each(Object.entries(spec.typography.systemRoles.web))(
    "type-%s matches its web system role (SF-34)",
    (role, def) => {
      const body = themeCss.match(new RegExp(`@utility type-${role} \\{([^}]*)\\}`))?.[1];
      expect(body, role).toBeDefined();
      const rem = (px: number) => `${px / 16}rem`;
      expect(body).toContain(`font-family: var(--font-${def.family});`);
      expect(body).toContain(`font-size: ${rem(def.size)};`);
      expect(body).toContain(`line-height: ${rem(def.lineHeight)};`);
      expect(body).toContain(`font-weight: ${def.weight};`);
      if (def.tracking) expect(body).toContain(`letter-spacing: ${def.tracking}em;`);
      expect(body?.includes("text-transform: uppercase")).toBe(Boolean("uppercase" in def));
    },
  );

  it.each(Object.entries(spec.typography.authRoles.web))(
    "type-%s matches its web authentication role (SF-24)",
    (role, def) => {
      const body = themeCss.match(new RegExp(`@utility type-${role} \\{([^}]*)\\}`))?.[1];
      expect(body, role).toBeDefined();
      const rem = (px: number) => `${px / 16}rem`;
      expect(body).toContain(`font-family: var(--font-${def.family});`);
      expect(body).toContain(`font-size: ${rem(def.size)};`);
      expect(body).toContain(`line-height: ${rem(def.lineHeight)};`);
      expect(body).toContain(`font-weight: ${def.weight};`);
      if (def.tracking) expect(body).toContain(`letter-spacing: ${def.tracking}em;`);
    },
  );

  it.each(Object.entries(spec.typography.onboardingRoles.web))(
    "type-%s matches its web onboarding role (SF-38, SF-47)",
    (role, def) => {
      const body = themeCss.match(new RegExp(`@utility type-${role} \\{([^}]*)\\}`))?.[1];
      expect(body, role).toBeDefined();
      const rem = (px: number) => `${px / 16}rem`;
      expect(body).toContain(`font-family: var(--font-${def.family});`);
      expect(body).toContain(`font-size: ${rem(def.size)};`);
      expect(body).toContain(`line-height: ${rem(def.lineHeight)};`);
      expect(body).toContain(`font-weight: ${def.weight};`);
      expect(body).toContain(`letter-spacing: ${def.tracking}em;`);
      expect(body?.includes("text-transform: uppercase")).toBe(Boolean("uppercase" in def));
    },
  );

  it.each(Object.entries(spec.typography.siteRoles.web))(
    "type-%s matches its web public-site role (SF-42)",
    (role, def) => {
      const body = themeCss.match(new RegExp(`@utility type-${role} \\{([^}]*)\\}`))?.[1];
      expect(body, role).toBeDefined();
      const rem = (px: number) => `${px / 16}rem`;
      expect(body).toContain(`font-family: var(--font-${def.family});`);
      expect(body).toContain(`font-size: ${rem(def.size)};`);
      expect(body).toContain(`line-height: ${rem(def.lineHeight)};`);
      expect(body).toContain(`font-weight: ${def.weight};`);
      if (def.tracking) expect(body).toContain(`letter-spacing: ${def.tracking}em;`);
      expect(body?.includes("text-transform: uppercase")).toBe(Boolean("uppercase" in def));
    },
  );

  it("only uses font weights the contract allows for each family", () => {
    for (const def of [
      ...Object.values(spec.typography.roles),
      ...Object.values(spec.typography.systemRoles.web),
      ...Object.values(spec.typography.systemRoles.mobile),
      ...Object.values(spec.typography.authRoles.web),
      ...Object.values(spec.typography.authRoles.mobile),
      ...Object.values(spec.typography.siteRoles.web),
      ...Object.values(spec.typography.onboardingRoles.web),
    ]) {
      const family = def.family as keyof typeof spec.typography.weights;
      expect(spec.typography.weights[family]).toContain(def.weight);
    }
  });
});
