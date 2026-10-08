import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";

/** Canonical toggle: 44 × 26 (sm 34 × 20); on = primary, off = input. */
const meta = {
  title: "Components/Switch",
  component: Switch,
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Switch id="on" defaultChecked />
        <Label htmlFor="on">Gym mode</Label>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="off" />
        <Label htmlFor="off">Round sounds</Label>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="small" size="sm" defaultChecked />
        <Label htmlFor="small">Small</Label>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="disabled" disabled />
        <Label htmlFor="disabled">Disabled</Label>
      </div>
    </div>
  ),
};

export const Toggles: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Switch id="notify" />
      <Label htmlFor="notify">Session reminders</Label>
    </div>
  ),
  play: async ({ canvas }) => {
    const control = canvas.getByRole("switch", { name: "Session reminders" });
    await userEvent.click(control);
    await expect(control).toBeChecked();
  },
};
