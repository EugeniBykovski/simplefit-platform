import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import spec from "../../../docs/design-tokens.json";

type Step = keyof typeof spec.spacing.steps;

/*
 * Spacing scale of the production contract (docs/design-tokens.json). Bars
 * render the real Tailwind width utilities (literal class names so Tailwind
 * generates them; `satisfies` fails the typecheck if the contract gains a
 * step without a class here).
 */
const stepClass = {
  "0": "w-0",
  "0.5": "w-0.5",
  "1": "w-1",
  "1.5": "w-1.5",
  "2": "w-2",
  "2.5": "w-2.5",
  "3": "w-3",
  "3.5": "w-3.5",
  "4": "w-4",
  "4.5": "w-4.5",
  "5": "w-5",
  "5.5": "w-5.5",
  "6": "w-6",
  "8": "w-8",
  "10": "w-10",
  "12": "w-12",
  "14": "w-14",
  "16": "w-16",
  "20": "w-20",
} as const satisfies Record<Step, string>;

function Spacing() {
  return (
    <ul className="flex flex-col gap-2">
      {(Object.entries(spec.spacing.steps) as [Step, number][]).map(([step, px]) => (
        <li key={step} className="flex items-center gap-4">
          <code className="w-24 shrink-0 type-caption text-muted-foreground">
            {step} · {px}px
          </code>
          <span className={`block h-3 rounded-xs bg-primary ${stepClass[step]}`} />
        </li>
      ))}
    </ul>
  );
}

const meta = {
  title: "Foundations/Spacing",
  component: Spacing,
} satisfies Meta<typeof Spacing>;

export default meta;

export const Steps: StoryObj<typeof meta> = {};
