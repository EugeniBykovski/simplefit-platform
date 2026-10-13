import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ChoiceField, describedBy, FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

/*
 * The labelled onboarding field and choice group (WF0 / WF1, WCR1 / WCR2):
 * the 12 px bold label, the control, then the help line, which the error
 * replaces in place.
 */
const meta = {
  title: "Components/Form field",
  component: FormField,
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHelp: Story = {
  args: { id: "city", label: "City", help: "Free text.", children: null },
  render: (args) => (
    <FormField {...args}>
      <Input
        id="city"
        fieldSize="lg"
        placeholder="Your city"
        aria-describedby={describedBy("city")}
      />
    </FormField>
  ),
};

export const Invalid: Story = {
  args: {
    id: "city-invalid",
    label: "City",
    help: "Free text.",
    error: "Enter your city.",
    children: null,
  },
  render: (args) => (
    <FormField {...args}>
      <Input
        id="city-invalid"
        fieldSize="lg"
        aria-invalid
        aria-describedby={describedBy("city-invalid")}
      />
    </FormField>
  ),
};

export const ChoiceGroup: Story = {
  args: { id: "levels", label: "Competition level · optional", children: null },
  render: () => (
    <ChoiceField
      id="levels"
      legend="Competition level · optional"
      error="Choose one of the options."
    >
      <div className="flex gap-2">
        {["Amateur", "Professional"].map((level) => (
          <label key={level} className="flex items-center gap-1.5 type-body-sm">
            <input type="checkbox" />
            {level}
          </label>
        ))}
      </div>
    </ChoiceField>
  ),
};
