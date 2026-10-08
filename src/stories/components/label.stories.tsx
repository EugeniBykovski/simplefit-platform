import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Checkbox } from "@/shared/ui/checkbox";
import { Field, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

/*
 * Two label roles: a field label above a control (caption 700, muted) and an
 * inline label next to a checkbox, radio or switch (body-sm 700).
 */
const meta = {
  title: "Components/Label",
  component: Label,
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FieldLabelAbove: Story = {
  render: () => (
    <Field className="max-w-sm">
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input id="email" placeholder="fighter@example.com" />
    </Field>
  ),
};

export const InlineLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="remind" defaultChecked />
      <Label htmlFor="remind">Remind me before sessions</Label>
    </div>
  ),
};
