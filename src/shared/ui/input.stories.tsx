import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import { Input } from "./input";

/*
 * Canonical web field: 40 px (`fieldSize="lg"`: 44 px), radius md, body-sm on the `surface` well with a
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

/** controls.field.webLarge: the 44 px, body 600 email field of the auth screens (SF-24). */
export const Large: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="auth-email">Email</FieldLabel>
      <Input id="auth-email" type="email" fieldSize="lg" defaultValue="fighter@example.com" />
    </Field>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Email").getBoundingClientRect().height).toBe(44);
  },
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
