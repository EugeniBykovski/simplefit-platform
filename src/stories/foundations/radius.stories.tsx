import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import spec from "../../../docs/design-tokens.json";

type Radius = keyof typeof spec.radius;

/*
 * Radius scale of the production contract (docs/design-tokens.json). Tiles
 * render the real Tailwind utilities (literal class names so Tailwind
 * generates them; `satisfies` fails the typecheck if a contract step has no
 * class here).
 */
const radiusClass = {
  xs: "rounded-xs",
  sm: "rounded-sm",
  md: "rounded-md",
  "md-lg": "rounded-md-lg",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",
  "4xl": "rounded-4xl",
} as const satisfies Record<Radius, string>;

const radiusUse: Record<Radius, string> = {
  xs: "Marks",
  sm: "Badges, small tiles",
  md: "Compact controls ≤ 48 px",
  "md-lg": "Public-site controls 40–46 px (SF-42)",
  lg: "Mobile fields, banners",
  xl: "Primary CTAs 50–56 px",
  "2xl": "Compact cards",
  "3xl": "Cards",
  "4xl": "Sheets, dialogs",
};

function Radii() {
  return (
    <ul className="flex flex-wrap gap-6">
      {(Object.entries(spec.radius) as [Radius, number][]).map(([name, px]) => (
        <li key={name} className="flex w-28 flex-col items-center gap-2">
          <span
            className={`block size-20 border border-border-strong bg-surface ${radiusClass[name]}`}
          />
          <code className="type-body-sm font-bold">
            {radiusClass[name]} · {px}
          </code>
          <span className="text-center type-caption text-faint-foreground">{radiusUse[name]}</span>
        </li>
      ))}
      <li className="flex w-28 flex-col items-center gap-2">
        <span className="block size-20 rounded-full border border-border-strong bg-surface" />
        <code className="type-body-sm font-bold">rounded-full</code>
        <span className="text-center type-caption text-faint-foreground">Pills, circles</span>
      </li>
    </ul>
  );
}

const meta = {
  title: "Foundations/Radius",
  component: Radii,
} satisfies Meta<typeof Radii>;

export default meta;

export const Scale: StoryObj<typeof meta> = {};
