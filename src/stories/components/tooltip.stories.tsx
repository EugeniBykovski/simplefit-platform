import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TimerIcon } from "lucide-react";

import { Button } from "@/shared/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/shared/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

const meta = {
  title: "Components/Tooltip",
  component: Tooltip,
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  render: () => (
    <div className="p-10">
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="quiet" size="icon" aria-label="Round timer">
            <TimerIcon aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Round timer</TooltipContent>
      </Tooltip>
    </div>
  ),
};

export const PopoverPanel: Story = {
  name: "Popover",
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="quiet">Why am I seeing this?</Button>
      </PopoverTrigger>
      <PopoverContent aria-labelledby="sponsored-title">
        <PopoverHeader>
          <PopoverTitle id="sponsored-title">Sponsored</PopoverTitle>
          <PopoverDescription>
            Shown because you train in Warsaw. Never based on weight or health data.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  ),
};
