import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Skeleton } from "./skeleton";

/** For waits longer than ~300 ms; keeps the geometry of the content it replaces. Decorative. */
const meta = {
  title: "Components/Skeleton",
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ListRow: Story = {
  render: () => (
    <div className="flex max-w-sm items-center gap-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  ),
};

export const CardBlock: Story = {
  render: () => <Skeleton className="h-24 max-w-sm rounded-3xl" />,
};
