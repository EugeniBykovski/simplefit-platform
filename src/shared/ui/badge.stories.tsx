import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Badge } from "./badge";

const variants = [
  "neutral",
  "primary",
  "accent",
  "success",
  "warning",
  "destructive",
  "info",
  "outline",
] as const;

/** Status pill: badge role (10 / 800, uppercase), radius sm, padding 4 × 9. */
const meta = {
  title: "Components/Badge",
  component: Badge,
  args: { children: "Past due", variant: "warning" },
  argTypes: { variant: { control: "select", options: variants } },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const SemanticVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="neutral">Free</Badge>
      <Badge variant="primary">Pro</Badge>
      <Badge variant="accent">Trial</Badge>
      <Badge variant="success">Active</Badge>
      <Badge variant="warning">Past due</Badge>
      <Badge variant="destructive">Payment failed</Badge>
      <Badge variant="info">Paused</Badge>
      <Badge variant="outline">Cancelled</Badge>
    </div>
  ),
};
