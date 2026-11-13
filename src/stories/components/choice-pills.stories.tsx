import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import { ChoicePills } from "@/shared/ui/choice-pills";

/**
 * SPA1 choice chips (SF-115), shared since SF-131: 44 px pills around native
 * radio or checkbox inputs, so the group is a real radio group or checkbox list.
 * A chosen pill is olive with a check, never colour alone.
 */
const meta = {
  title: "Components/ChoicePills",
  component: ChoicePills,
} satisfies Meta<typeof ChoicePills>;

export default meta;
type Story = StoryObj<typeof meta>;

const OPTIONS = [
  { value: "events", label: "Sponsored events" },
  { value: "content", label: "Content" },
  { value: "gyms", label: "Gym partnerships" },
];

function Checkboxes({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState<string[]>(["content"]);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="type-caption font-bold text-muted-foreground">Interests</legend>
      <ChoicePills
        name="interests"
        type="checkbox"
        options={OPTIONS}
        value={value}
        disabled={disabled}
        onChange={(next) => setValue(next as string[])}
      />
    </fieldset>
  );
}

function Radios() {
  const [value, setValue] = useState("global");
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="type-caption font-bold text-muted-foreground">Markets</legend>
      <ChoicePills
        name="scope"
        type="radio"
        options={[
          { value: "global", label: "Global" },
          { value: "countries", label: "Countries" },
          { value: "cities", label: "Cities" },
        ]}
        value={value}
        onChange={(next) => setValue(next as string)}
      />
    </fieldset>
  );
}

export const Checkbox: Story = {
  args: { name: "interests", type: "checkbox", options: OPTIONS, value: [], onChange: () => {} },
  render: () => <Checkboxes />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("checkbox", { name: "Sponsored events" }));
    await expect(canvas.getByRole("checkbox", { name: "Sponsored events" })).toBeChecked();
    await expect(canvas.getByRole("checkbox", { name: "Content" })).toBeChecked();
  },
};

export const Radio: Story = {
  args: { name: "scope", type: "radio", options: OPTIONS, value: "", onChange: () => {} },
  render: () => <Radios />,
};

export const Disabled: Story = {
  args: { name: "interests", type: "checkbox", options: OPTIONS, value: [], onChange: () => {} },
  render: () => <Checkboxes disabled />,
};
