import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/shared/ui/field";
import { Textarea } from "@/shared/ui/textarea";

const meta = {
  title: "Components/Textarea",
  component: Textarea,
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="notes">Notes</FieldLabel>
      <Textarea id="notes" placeholder="How did the session feel?" />
      <FieldDescription>Only you and your coach can see notes.</FieldDescription>
    </Field>
  ),
};

export const Populated: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="notes-filled">Notes</FieldLabel>
      <Textarea
        id="notes-filled"
        defaultValue="Kept the guard high in round 4. Left hook still late."
      />
    </Field>
  ),
};

export const Invalid: Story = {
  render: () => (
    <Field data-invalid>
      <FieldLabel htmlFor="appeal">Appeal</FieldLabel>
      <Textarea id="appeal" aria-invalid aria-describedby="appeal-error" />
      <FieldError id="appeal-error">Tell us what happened (at least 20 characters)</FieldError>
    </Field>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Field data-disabled>
      <FieldLabel htmlFor="locked-notes">Coach notes</FieldLabel>
      <Textarea id="locked-notes" defaultValue="Read only" disabled />
    </Field>
  ),
};
