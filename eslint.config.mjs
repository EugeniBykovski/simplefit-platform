import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/** Non-localized Next.js navigation APIs; use @/shared/i18n/navigation instead. */
const localizedNavigation = [
  {
    name: "next/link",
    message: "Use Link from @/shared/i18n/navigation so URLs keep the active locale.",
  },
  {
    name: "next/navigation",
    importNames: ["redirect", "permanentRedirect", "usePathname", "useRouter"],
    message: "Use the locale-aware equivalent from @/shared/i18n/navigation.",
  },
];

/**
 * Design-token guard (docs/design-system.md): colours come from semantic
 * tokens, never hex values, arbitrary colour values or Tailwind's default
 * palette (which is also removed from the theme).
 */
const rawColor =
  "#[0-9a-fA-F]{3,8}\\b|-\\[(#|rgb|hsl|oklch)|\\b(bg|text|border|ring|fill|stroke|outline|divide|from|via|to|shadow|caret|accent|decoration|placeholder)-(black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-[0-9]{2,3})?\\b";
const rawColorMessage =
  "Use semantic colour tokens (bg-surface, text-muted-foreground, ...), not hex values, arbitrary colours or the default Tailwind palette.";
const tokenGuards = [
  "JSXAttribute[name.name='className']",
  "CallExpression[callee.name=/^(cn|cva)$/]",
].flatMap((scope) => [
  { selector: `${scope} Literal[value=/${rawColor}/]`, message: rawColorMessage },
  { selector: `${scope} TemplateElement[value.raw=/${rawColor}/]`, message: rawColorMessage },
]);

/**
 * Design-scale guards (docs/design-tokens.json, SF-16/SF-17).
 *
 * typeScale (everywhere): text is sized only by the `type-*` roles; Tailwind's
 * default font sizes, leading and tracking presets are removed or banned, and
 * only the canonical Manrope weights (400 via the role, 600, 700, 800) exist.
 * Bare `rounded` has no value in the SimpleFit radius scale.
 *
 * offScale and spacingSteps (product code; primitives in src/shared/ui own
 * their internal geometry): no arbitrary spacing, radius or type values, and
 * spacing uses only the canonical steps. Layout dimensions (w/h/size/inset)
 * may stay arbitrary.
 */
const typeScale =
  "\\b(text-(xs|sm|base|lg|xl|[2-9]xl)|font-(thin|extralight|light|normal|medium|black)|leading-(none|tight|snug|normal|relaxed|loose)|tracking-(tighter|tight|normal|wide|wider|widest))(?![\\w-])|(^|[\\s:])rounded(?![\\w-])";
const typeScaleMessage =
  "Use the SimpleFit type roles (type-*) and radius scale (docs/design-tokens.json): Tailwind's default text sizes, leading, tracking, non-canonical weights and bare `rounded` are not part of the design system.";
const offScale =
  "\\b(-?[pm][xytrblse]?|gap(-[xy])?|space-[xy]|rounded(-[a-z]{1,2})?|text|leading|tracking|font)-\\[";
const offScaleMessage =
  "Off-scale value: use the SF-13 spacing, radius and type scales (docs/design-handoff.md §8.1), not arbitrary values.";
const spacingSteps =
  "(^|[\\s:])-?([pm][xytrblse]?|gap(-[xy])?|space-[xy])-(?=\\d)(?!(0|0\\.5|1|1\\.5|2|2\\.5|3|3\\.5|4|4\\.5|5|5\\.5|6|8|10|12|14|16|20)(?![\\w.-]))";
const spacingStepsMessage =
  "Spacing step outside the SimpleFit scale (docs/design-tokens.json spacing.steps: 0.5–6 in half steps, then 8, 10, 12, 14, 16, 20).";
const classScopes = [
  "JSXAttribute[name.name='className']",
  "CallExpression[callee.name=/^(cn|cva)$/]",
];
const literalGuards = (pattern, message) =>
  classScopes.flatMap((scope) => [
    { selector: `${scope} Literal[value=/${pattern}/]`, message },
    { selector: `${scope} TemplateElement[value.raw=/${pattern}/]`, message },
  ]);
const typeGuards = literalGuards(typeScale, typeScaleMessage);
const scaleGuards = [
  ...literalGuards(offScale, offScaleMessage),
  ...literalGuards(spacingSteps, spacingStepsMessage),
];

/** Utility-first styling selectors (shared by the styling blocks below). */
const stylingSyntax = [
  {
    selector:
      "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression:not(:has(SpreadElement)):not(:has(Property[value.type!='Literal']))",
    message: "Static inline style: use Tailwind classes. Keep `style` for runtime-computed values.",
  },
  {
    selector: "ImportDeclaration[source.value=/\\.module\\.(css|scss|sass)$/]",
    message: "CSS modules are not used: style with Tailwind classes.",
  },
  {
    selector:
      "ImportDeclaration[source.value=/^(styled-components|@emotion\\/(react|styled|css))$/]",
    message: "CSS-in-JS is not used: style with Tailwind classes.",
  },
];

/** Higher layers each FSD-lite layer must not import from. */
const forbiddenLayers = {
  "src/shared/**": ["app", "widgets", "features", "entities"],
  "src/entities/**": ["app", "widgets", "features"],
  "src/features/**": ["app", "widgets"],
  "src/widgets/**": ["app"],
};

// One block per layer: flat config replaces (not merges) rule options, so each
// block repeats the navigation restriction alongside its layer patterns.
function importBoundaries() {
  const restrict = (patterns) => ["error", { paths: localizedNavigation, patterns }];

  return [
    { files: ["src/**"], rules: { "no-restricted-imports": restrict([]) } },
    ...Object.entries(forbiddenLayers).map(([files, layers]) => ({
      files: [files],
      rules: {
        "no-restricted-imports": restrict([
          {
            group: layers.map((layer) => `@/${layer}/*`),
            message: `This layer must not import from: ${layers.join(", ")}. Dependencies point downwards (app > widgets > features > entities > shared).`,
          },
        ]),
      },
    })),
    {
      // The one place allowed to wrap Next.js navigation.
      files: ["src/shared/i18n/**"],
      rules: {
        "no-restricted-imports": restrict([
          {
            group: ["@/app/*", "@/widgets/*", "@/features/*", "@/entities/*"],
            message: "shared/ must not import from higher layers.",
          },
        ]),
      },
    },
  ];
}

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // Accessibility is a requirement. eslint-config-next registers jsx-a11y but
    // enables only a few rules; these are the plugin's core recommended rules.
    files: ["**/*.tsx"],
    rules: {
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/aria-activedescendant-has-tabindex": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/iframe-has-title": "error",
      "jsx-a11y/img-redundant-alt": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/label-has-associated-control": "error",
      "jsx-a11y/media-has-caption": "error",
      "jsx-a11y/mouse-events-have-key-events": "error",
      "jsx-a11y/no-access-key": "error",
      "jsx-a11y/no-autofocus": ["error", { ignoreNonDOM: true }],
      "jsx-a11y/no-distracting-elements": "error",
      "jsx-a11y/no-interactive-element-to-noninteractive-role": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/no-noninteractive-element-to-interactive-role": "error",
      "jsx-a11y/no-noninteractive-tabindex": "error",
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/scope": "error",
      "jsx-a11y/tabindex-no-positive": "error",
    },
  },
  // Import boundaries: locale-aware navigation everywhere in src/, plus the
  // FSD-lite dependency direction per layer (see docs/architecture/README.md).
  ...importBoundaries(),
  {
    // Utility-first styling (docs/engineering-standards.md §7): Tailwind classes
    // on components. Inline `style` stays available for runtime values and
    // libraries that need style objects (e.g. CSS variables for Sonner).
    files: ["src/**/*.tsx", "src/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...stylingSyntax, ...tokenGuards, ...typeGuards],
    },
  },
  {
    // Product code (everything but the primitives) also keeps to the design
    // scales. Flat config replaces rule options, so the selectors repeat.
    files: ["src/**/*.tsx", "src/**/*.ts"],
    ignores: ["src/shared/ui/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...stylingSyntax,
        ...tokenGuards,
        ...typeGuards,
        ...scaleGuards,
      ],
    },
  },
  {
    // Node maintenance scripts may log progress.
    files: ["scripts/**"],
    rules: { "no-console": "off" },
  },
  // Formatting is owned by Prettier; must come last to disable conflicting rules.
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "storybook-static/**",
    "next-env.d.ts",
    // Generated by Orval from openapi/simplefit.api.json. DO NOT EDIT MANUALLY.
    "src/shared/api/generated/**",
    "src/shared/api/.generated-check/**",
  ]),
]);
