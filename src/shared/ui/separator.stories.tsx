import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Separator } from "./separator";

const meta = {
  title: "Components/Separator",
  component: Separator,
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-3 type-body-sm">
      <span>Prorated · 18 days left</span>
      <Separator />
      <span>Next billing · Nov 4</span>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-6 items-center gap-3 type-body-sm">
      <span>Help</span>
      <Separator orientation="vertical" />
      <span>Privacy</span>
      <Separator orientation="vertical" />
      <span>Terms</span>
    </div>
  ),
};
