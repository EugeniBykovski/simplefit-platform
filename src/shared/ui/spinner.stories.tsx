import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Spinner } from "./spinner";

/** For short or indeterminate waits. Labelled = announced (`role="status"`); unlabelled = decorative. */
const meta = {
  title: "Components/Spinner",
  component: Spinner,
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Announced: Story = {
  render: () => (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Spinner label="Loading sessions" />
      <span className="type-body-sm">Loading sessions</span>
    </div>
  ),
};

export const Decorative: Story = {
  render: () => <Spinner className="size-6 text-highlight" />,
};
