import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import { RemovableChips } from "@/shared/ui/removable-chips";

/**
 * Chosen items as olive chips with their own remove buttons (SPA1 markets,
 * shared since SF-131). Each button is named for its item; the list isn't
 * rendered when empty.
 */
const meta = {
  title: "Components/RemovableChips",
  component: RemovableChips,
} satisfies Meta<typeof RemovableChips>;

export default meta;
type Story = StoryObj<typeof meta>;

function Countries({ disabled = false }: { disabled?: boolean }) {
  const [items, setItems] = useState([
    { value: "PL", label: "Poland" },
    { value: "DE", label: "Germany" },
  ]);
  return (
    <RemovableChips
      items={items}
      disabled={disabled}
      removeLabel={(label) => `Remove ${label}`}
      onRemove={(value) => setItems(items.filter((item) => item.value !== value))}
    />
  );
}

const args = {
  items: [],
  removeLabel: (label: string) => label,
  onRemove: () => {},
  disabled: false,
};

export const Default: Story = {
  args,
  render: () => <Countries />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Remove Poland" }));
    await expect(canvas.queryByText("Poland")).toBeNull();
    await expect(canvas.getByText("Germany")).toBeVisible();
  },
};

export const Disabled: Story = { args, render: () => <Countries disabled /> };
