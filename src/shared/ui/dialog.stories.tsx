import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor } from "storybook/test";

import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

/** Dialog: surface-elevated, radius 4xl, title h3, `overlay` scrim; Escape and the close button dismiss it. */
const meta = {
  title: "Components/Dialog",
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function CancelBooking({ open }: { open?: boolean }) {
  return (
    <Dialog defaultOpen={open}>
      <DialogTrigger asChild>
        <Button variant="quiet">Cancel booking</Button>
      </DialogTrigger>
      <DialogContent closeLabel="Close">
        <DialogHeader>
          <DialogTitle>Cancel booking?</DialogTitle>
          <DialogDescription>Your spot is released to the waitlist.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Keep booking</Button>
          </DialogClose>
          <Button variant="destructive">Cancel booking</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Open: Story = { render: () => <CancelBooking open /> };

/** Opens from its trigger, moves focus into the dialog and closes on Escape. */
export const KeyboardInteraction: Story = {
  render: () => <CancelBooking />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Cancel booking" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel booking?" });
    // Wait for the open transition to finish.
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
};

export const BottomSheet: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant="quiet">Upgrade</Button>
      </SheetTrigger>
      <SheetContent side="bottom" closeLabel="Close">
        <SheetHeader>
          <SheetTitle>Upgrade to Coach Pro</SheetTitle>
          <SheetDescription>Prorated · charged today €8.71</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <Button size="xl" className="w-full">
            Confirm upgrade
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  ),
};
