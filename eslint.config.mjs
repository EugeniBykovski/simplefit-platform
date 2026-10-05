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
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression:not(:has(SpreadElement)):not(:has(Property[value.type!='Literal']))",
          message:
            "Static inline style: use Tailwind classes. Keep `style` for runtime-computed values.",
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
        ...tokenGuards,
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
    "next-env.d.ts",
    // Generated by Orval from openapi/simplefit.api.json. DO NOT EDIT MANUALLY.
    "src/shared/api/generated/**",
    "src/shared/api/.generated-check/**",
  ]),
]);
