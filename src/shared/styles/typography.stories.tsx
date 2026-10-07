import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import spec from "../../../docs/design-tokens.json";

type Role = keyof typeof spec.typography.roles;

/*
 * The type roles of the production contract. Names, sizes and weights come
 * from docs/design-tokens.json; each sample renders the real `type-*` utility.
 * The map below lists the literal class names so Tailwind generates them;
 * `satisfies` makes the typecheck fail if a contract role has no class.
 */
const roleClass = {
  display: "type-display",
  h1: "type-h1",
  h2: "type-h2",
  h3: "type-h3",
  title: "type-title",
  brand: "type-brand",
  "metric-xl": "type-metric-xl",
  "metric-lg": "type-metric-lg",
  metric: "type-metric",
  "metric-sm": "type-metric-sm",
  "body-lg": "type-body-lg",
  body: "type-body",
  "body-sm": "type-body-sm",
  caption: "type-caption",
  micro: "type-micro",
  badge: "type-badge",
  "label-lg": "type-label-lg",
  label: "type-label",
} as const satisfies Record<Role, string>;

const samples: Partial<Record<Role, string>> = {
  brand: "SimpleFit",
  display: "18:00",
  "metric-xl": "€29.99",
  "metric-lg": "142",
  metric: "1h 34m",
  "metric-sm": "22 rounds",
};

function Typography() {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="text-faint-foreground">
          <th className="py-2 pr-6 text-left type-label">Role</th>
          <th className="py-2 pr-6 text-left type-label">Spec</th>
          <th className="py-2 text-left type-label">Sample</th>
        </tr>
      </thead>
      <tbody>
        {(
          Object.entries(spec.typography.roles) as [Role, (typeof spec.typography.roles)[Role]][]
        ).map(([role, def]) => (
          <tr key={role} className="border-t border-border align-baseline">
            <td className="py-3 pr-6">
              <code className="type-body-sm font-bold">{roleClass[role]}</code>
            </td>
            <td className="py-3 pr-6 type-caption text-muted-foreground">
              {spec.typography.families[def.family as keyof typeof spec.typography.families]}{" "}
              {def.weight} · {def.size}/{def.lineHeight}
              {def.tracking ? ` · ${def.tracking}em` : ""}
              {"uppercase" in def ? " · uppercase" : ""}
            </td>
            <td className="py-3">
              <span className={roleClass[role]}>
                {samples[role] ?? "Train together, log every round"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Weights() {
  return (
    <div className="flex flex-col gap-2 type-body-lg">
      <p>Manrope 400 · role default</p>
      <p className="font-semibold">Manrope 600 · field values</p>
      <p className="font-bold">Manrope 700 · labels and names</p>
      <p className="font-extrabold">Manrope 800 · emphasis and every button label</p>
      <p className="type-h3">Unbounded 600 · headings</p>
      <p className="type-metric">Unbounded 700 · metrics</p>
      <p className="type-label">JetBrains Mono 400 · labels</p>
    </div>
  );
}

const meta = {
  title: "Foundations/Typography",
  component: Typography,
} satisfies Meta<typeof Typography>;

export default meta;

export const Roles: StoryObj<typeof meta> = {};
export const FontWeights: StoryObj<typeof meta> = { render: () => <Weights /> };
