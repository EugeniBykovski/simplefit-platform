import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, screen, userEvent, within } from "storybook/test";

import { countryOptions } from "@/shared/lib/countries";

import { Combobox } from "@/shared/ui/combobox";
import { Label } from "@/shared/ui/label";

/** Searchable single choice (SF-38): the Fighter country selector, with the real country list. */
const meta = {
  title: "Components/Combobox",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Country({ initial = null, invalid }: { initial?: string | null; invalid?: boolean }) {
  const [value, setValue] = useState<string | null>(initial);
  const options = countryOptions("en").map(({ code, name }) => ({ value: code, label: name }));
  return (
    <div className="flex max-w-80 flex-col gap-1.5">
      <Label htmlFor="country">Country</Label>
      <Combobox
        id="country"
        value={value}
        onValueChange={setValue}
        options={options}
        placeholder="Select a country"
        searchLabel="Search countries"
        searchPlaceholder="Search"
        emptyLabel="No country matches."
        invalid={invalid}
      />
      <output className="type-caption text-faint-foreground">{value ?? "—"}</output>
    </div>
  );
}

export const Empty: Story = { render: () => <Country /> };

export const Selected: Story = { render: () => <Country initial="PL" /> };

export const Invalid: Story = { render: () => <Country invalid /> };

/** Type to filter, ↓ and Enter to choose: the stored value is the ISO code. */
export const KeyboardSearch: Story = {
  render: () => <Country />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("combobox", { name: "Country" }));
    const search = await screen.findByRole("combobox", { name: "Search countries" });
    await expect(search).toHaveFocus();
    await userEvent.type(search, "pola");
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByRole("combobox", { name: "Country" })).toHaveTextContent("Poland");
    await expect(canvas.getByText("PL")).toBeVisible();
  },
};
