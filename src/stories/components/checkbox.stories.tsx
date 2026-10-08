import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { Checkbox } from "@/shared/ui/checkbox";
import { Label } from "@/shared/ui/label";

const meta = {
  title: "Components/Checkbox",
  component: Checkbox,
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Checkbox id="unchecked" />
        <Label htmlFor="unchecked">Share trainings with friends</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="checked" defaultChecked />
        <Label htmlFor="checked">Remind me before sessions</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="disabled" disabled />
        <Label htmlFor="disabled">Disabled option</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="disabled-checked" disabled defaultChecked />
        <Label htmlFor="disabled-checked">Required by your gym</Label>
      </div>
    </div>
  ),
};

export const Toggles: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="toggle" />
      <Label htmlFor="toggle">Weekly recap email</Label>
    </div>
  ),
  play: async ({ canvas }) => {
    const box = canvas.getByRole("checkbox", { name: "Weekly recap email" });
    await userEvent.click(box);
    await expect(box).toBeChecked();
  },
};
