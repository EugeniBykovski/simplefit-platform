import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Field, FieldLabel } from "@/shared/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

const meta = {
  title: "Components/Select",
  component: Select,
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

function GymSelect(props: { defaultValue?: string; disabled?: boolean; defaultOpen?: boolean }) {
  return (
    <Field>
      <FieldLabel htmlFor="gym">Gym</FieldLabel>
      <Select {...props}>
        <SelectTrigger id="gym" className="w-full">
          <SelectValue placeholder="Choose a gym" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Nearby</SelectLabel>
            <SelectItem value="warsaw">Warsaw Boxing Club</SelectItem>
            <SelectItem value="legia">Legia Fight</SelectItem>
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Visited</SelectLabel>
            <SelectItem value="berlin">Berlin Boxing Gym</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

export const Placeholder: Story = { render: () => <GymSelect /> };
export const Selected: Story = { render: () => <GymSelect defaultValue="warsaw" /> };
export const Open: Story = { render: () => <GymSelect defaultValue="legia" defaultOpen /> };
export const Disabled: Story = { render: () => <GymSelect defaultValue="warsaw" disabled /> };
