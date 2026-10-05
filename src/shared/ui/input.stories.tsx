import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import { Input } from "./input";

/*
 * Canonical web field: 40 px, radius md, body-sm on the `surface` well with a
 * hairline border, olive border + ring on focus; label caption 700 muted.
 */
const meta = {
  title: "Components/Input",
  component: Input,
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input id="email" type="email" placeholder="fighter@example.com" />
      <FieldDescription>We send a 6-digit code to confirm it’s you.</FieldDescription>
    </Field>
  ),
};

export const Populated: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="name">Full name</FieldLabel>
      <Input id="name" defaultValue="Alex Fighter" />
    </Field>
  ),
};

export const Focused: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="gym">Gym</FieldLabel>
      <Input id="gym" placeholder="Search gyms" />
    </Field>
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByLabelText("Gym"));
    await expect(canvas.getByLabelText("Gym")).toHaveFocus();
  },
};

export const Invalid: Story = {
  render: () => (
    <Field data-invalid>
      <FieldLabel htmlFor="promo">Promo code</FieldLabel>
      <Input id="promo" defaultValue="SPRING10" aria-invalid aria-describedby="promo-error" />
      <FieldError id="promo-error">This code expired on Sep 30</FieldError>
    </Field>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Field data-disabled>
      <FieldLabel htmlFor="locked">Membership ID</FieldLabel>
      <Input id="locked" defaultValue="WBC-0412" disabled />
    </Field>
  ),
};
