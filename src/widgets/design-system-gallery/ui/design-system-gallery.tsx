"use client";

import { ArrowRightIcon, BellIcon, PlusIcon, TimerIcon } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { ThemeSwitcher } from "@/features/switch-theme";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Separator } from "@/shared/ui/separator";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { Switch } from "@/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Textarea } from "@/shared/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

/*
 * Developer tool (development builds only; see app/[locale]/dev/design-system).
 * Copy here is developer-facing and intentionally not translated.
 */

const typography = [
  ["type-display", "Display · 18:00"],
  ["type-h1", "H1 · Create your account"],
  ["type-h2", "H2 · Gym dashboard"],
  ["type-h3", "H3 · Upgrade to Coach Pro"],
  ["type-title", "Title · Next session"],
  ["type-metric-xl", "€29.99"],
  ["type-metric-lg", "142"],
  ["type-metric", "1h 34m"],
  ["type-metric-sm", "22 rounds"],
  ["type-body-lg", "Body large · Primary mobile copy and field values."],
  ["type-body", "Body · Mobile body copy, calm and legible between rounds."],
  ["type-body-sm", "Body small · Web body copy, table rows and button labels."],
  ["type-caption", "Caption · Arrive 17:50 · Ring 2"],
  ["type-micro", "Micro · Updated 2 min ago"],
  ["type-badge", "Badge · Past due"],
  ["type-label-lg", "Label large · Week 1"],
  ["type-label", "Label · Or email"],
] as const;

// Literal class names so Tailwind generates them.
const surfaceSwatches = [
  ["background", "bg-background text-foreground border-border"],
  ["surface", "bg-surface text-surface-foreground border-border"],
  ["surface-subtle", "bg-surface-subtle text-foreground border-border"],
  ["surface-elevated", "bg-surface-elevated text-foreground border-border"],
  ["muted", "bg-muted text-muted-foreground border-border"],
  ["primary", "bg-primary text-primary-foreground border-border"],
  ["secondary", "bg-secondary text-secondary-foreground border-border"],
  ["highlight", "bg-highlight text-highlight-foreground border-border"],
  ["accent", "bg-accent text-accent-foreground border-border"],
  ["accent-strong", "bg-accent-strong text-accent-foreground border-border"],
  ["success-subtle", "bg-success-subtle text-success-subtle-foreground border-success-border"],
  ["warning-subtle", "bg-warning-subtle text-warning-subtle-foreground border-warning-border"],
  [
    "destructive-subtle",
    "bg-destructive-subtle text-destructive-subtle-foreground border-destructive-border",
  ],
  ["info-subtle", "bg-info-subtle text-info-subtle-foreground border-info-border"],
  ["warning", "bg-warning text-warning-foreground border-border"],
  ["destructive", "bg-destructive text-destructive-foreground border-border"],
] as const;

const textSwatches = [
  ["foreground", "text-foreground"],
  ["muted-foreground", "text-muted-foreground"],
  ["faint-foreground", "text-faint-foreground"],
  ["highlight", "text-highlight"],
  ["accent-muted-foreground", "text-accent-muted-foreground"],
] as const;

const borderSwatches = [
  ["border", "border-border"],
  ["border-strong", "border-border-strong"],
  ["input", "border-input"],
  ["accent-border", "border-accent-border"],
  ["primary-muted", "border-primary-muted"],
  ["ring", "border-ring"],
] as const;

const rawPalette = [
  "--graphite-950",
  "--graphite-900",
  "--graphite-850",
  "--graphite-800",
  "--graphite-700",
  "--graphite-600",
  "--bone",
  "--stone-500",
  "--stone-550",
  "--olive-200",
  "--olive-300",
  "--olive-350",
  "--olive-400",
  "--olive-500",
  "--olive-600",
  "--olive-800",
  "--olive-900",
  "--amber",
  "--amber-200",
  "--coral",
  "--coral-200",
] as const;

// Spacing steps (docs/design-tokens.json) as literal width classes.
const spacing = [
  ["0.5", "w-0.5", 2],
  ["1", "w-1", 4],
  ["1.5", "w-1.5", 6],
  ["2", "w-2", 8],
  ["2.5", "w-2.5", 10],
  ["3", "w-3", 12],
  ["3.5", "w-3.5", 14],
  ["4", "w-4", 16],
  ["4.5", "w-4.5", 18],
  ["5", "w-5", 20],
  ["5.5", "w-5.5", 22],
  ["6", "w-6", 24],
  ["8", "w-8", 32],
  ["10", "w-10", 40],
  ["12", "w-12", 48],
  ["14", "w-14", 56],
  ["16", "w-16", 64],
  ["20", "w-20", 80],
] as const;

const radii = [
  ["xs", "rounded-xs", 6, "marks"],
  ["sm", "rounded-sm", 9, "badges"],
  ["md", "rounded-md", 12, "controls"],
  ["lg", "rounded-lg", 16, "fields"],
  ["xl", "rounded-xl", 18, "CTAs"],
  ["2xl", "rounded-2xl", 20, "compact cards"],
  ["3xl", "rounded-3xl", 22, "cards"],
  ["4xl", "rounded-4xl", 28, "sheets"],
  ["full", "rounded-full", null, "pills"],
] as const;

const buttonVariants = [
  "primary",
  "secondary",
  "quiet",
  "outline",
  "ghost",
  "destructive",
  "destructive-subtle",
  "link",
] as const;
const buttonSizes = [
  ["sm", "32"],
  ["md", "40"],
  ["lg", "48"],
  ["xl", "54"],
] as const;
const badgeVariants = [
  "neutral",
  "primary",
  "accent",
  "success",
  "warning",
  "destructive",
  "info",
  "outline",
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`ds-${title}`} className="flex flex-col gap-4">
      <h2 id={`ds-${title}`} className="type-label text-faint-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function DesignSystemGallery() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-10 sm:px-6 lg:py-14"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="type-label text-highlight">SimpleFit · Visual system 2026</p>
          <h1 className="type-h1">Design system</h1>
          <p className="max-w-2xl type-body text-muted-foreground">
            Graphite × Olive primitives and tokens. Development builds only.
          </p>
        </div>
        <ThemeSwitcher />
      </header>

      <Section title="Typography">
        <div className="flex flex-col gap-3">
          {typography.map(([className, sample]) => (
            <div key={className} className="flex flex-wrap items-baseline gap-4">
              <code className="w-32 shrink-0 type-caption text-faint-foreground">{className}</code>
              <p className={className}>{sample}</p>
            </div>
          ))}
          <p className="type-body-sm text-muted-foreground">
            Manrope weights: <span className="font-semibold">600 field values</span> ·{" "}
            <span className="font-bold">700 labels</span> ·{" "}
            <span className="font-extrabold">800 emphasis and buttons</span>
          </p>
        </div>
      </Section>

      <Section title="Semantic colours">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {surfaceSwatches.map(([name, className]) => (
            <li
              key={name}
              className={`flex h-20 items-end rounded-lg border p-3 type-body-sm font-bold ${className}`}
            >
              {name}
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {textSwatches.map(([name, className]) => (
            <li key={name} className={`type-body-sm font-bold ${className}`}>
              {name}
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-3">
          {borderSwatches.map(([name, className]) => (
            <li
              key={name}
              className={`rounded-md border-2 bg-surface px-3 py-2 type-caption text-muted-foreground ${className}`}
            >
              {name}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Raw palette (tokens.css only)">
        <ul className="flex flex-wrap gap-3">
          {rawPalette.map((token) => (
            <li key={token} className="flex flex-col gap-1">
              {/* Runtime-computed swatch colour (documented exception). */}
              <span
                className="block size-14 rounded-md border border-border"
                style={{ backgroundColor: `var(${token})` }}
              />
              <code className="type-caption text-muted-foreground">{token.slice(2)}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Spacing">
        <ul className="flex flex-col gap-1.5">
          {spacing.map(([step, className, px]) => (
            <li key={step} className="flex items-center gap-3">
              <code className="w-20 shrink-0 type-caption text-faint-foreground">
                {step} · {px}px
              </code>
              <span className={`block h-3 rounded-xs bg-primary ${className}`} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Radius">
        <ul className="flex flex-wrap gap-4">
          {radii.map(([name, className, px, use]) => (
            <li key={name} className="flex flex-col items-center gap-1.5">
              <span
                className={`block size-16 border border-border-strong bg-surface ${className}`}
              />
              <code className="type-caption text-muted-foreground">
                {name}
                {px === null ? "" : ` · ${px}`}
              </code>
              <span className="type-micro text-faint-foreground">{use}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          {buttonVariants.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {buttonSizes.map(([size, height]) => (
            <Button key={size} size={size}>
              {size} · {height}
            </Button>
          ))}
          <Button size="xl">
            Start round <ArrowRightIcon aria-hidden />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="icon" variant="quiet" aria-label="Add">
            <PlusIcon aria-hidden />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Notifications">
            <BellIcon aria-hidden />
          </Button>
          <Button disabled>Disabled</Button>
          <Button loading>Saving</Button>
          <Button variant="quiet" loading>
            Syncing
          </Button>
          <Button variant="secondary">Finish round</Button>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-6 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ds-email">Email</FieldLabel>
            <Input id="ds-email" type="email" placeholder="fighter@example.com" />
            <FieldDescription>We never share it.</FieldDescription>
          </Field>
          <Field data-invalid>
            <FieldLabel htmlFor="ds-promo">Promo code</FieldLabel>
            <Input id="ds-promo" defaultValue="SPRING10" aria-invalid />
            <FieldError>This code expired on Sep 30</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="ds-notes">Notes</FieldLabel>
            <Textarea id="ds-notes" placeholder="How did the session feel?" />
          </Field>
          <Field>
            <FieldLabel htmlFor="ds-gym">Gym</FieldLabel>
            <Select defaultValue="warsaw">
              <SelectTrigger id="ds-gym" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warsaw">Warsaw Boxing Club</SelectItem>
                <SelectItem value="berlin">Berlin Boxing Gym</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="ds-terms" defaultChecked />
              <Label htmlFor="ds-terms">Remind me before sessions</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="ds-disabled" disabled />
              <Label htmlFor="ds-disabled">Disabled option</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="ds-gym-mode" defaultChecked />
              <Label htmlFor="ds-gym-mode">Gym mode</Label>
            </div>
          </div>
          <RadioGroup defaultValue="monthly" aria-label="Billing cycle">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="monthly" id="ds-monthly" />
              <Label htmlFor="ds-monthly">Monthly</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="annual" id="ds-annual" />
              <Label htmlFor="ds-annual">Annual</Label>
            </div>
          </RadioGroup>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          {badgeVariants.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="Card">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Next session</CardTitle>
              <CardDescription>Technical · Warsaw BC</CardDescription>
              <CardAction>
                <Badge variant="success">Booked</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="type-metric-xl">18:00</p>
            </CardContent>
            <CardFooter className="justify-between">
              <span className="type-caption text-muted-foreground">Arrive 17:50 · Ring 2</span>
              <Button size="sm">Check in</Button>
            </CardFooter>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Loading · compact card</CardTitle>
              <CardDescription>Skeletons keep the card geometry.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-16 w-full" />
              <div className="flex items-center gap-2 text-muted-foreground">
                <Spinner label="Loading sessions" />
                <span className="type-body-sm">Spinner for short waits only</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Overlays and feedback">
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Open dialog</Button>
            </DialogTrigger>
            <DialogContent closeLabel="Close">
              <DialogHeader>
                <DialogTitle>Cancel booking?</DialogTitle>
                <DialogDescription>Your spot is released to the waitlist.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="destructive">Cancel booking</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="quiet">Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Edit session</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Round timer">
                <TimerIcon aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Round timer</TooltipContent>
          </Tooltip>
          <Button variant="ghost" onClick={() => toast.success("Session saved")}>
            <BellIcon aria-hidden /> Success toast
          </Button>
          <Button variant="ghost" onClick={() => toast.error("Payment failed")}>
            Error toast
          </Button>
        </div>
      </Section>

      <Section title="Tabs, avatar, separator">
        <Tabs defaultValue="today" className="max-w-md">
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="camp">Camp</TabsTrigger>
          </TabsList>
          <TabsContent value="today" className="type-body-sm text-muted-foreground">
            Two sessions planned.
          </TabsContent>
          <TabsContent value="week" className="type-body-sm text-muted-foreground">
            Nine sessions this week.
          </TabsContent>
          <TabsContent value="camp" className="type-body-sm text-muted-foreground">
            Week 6 of 10.
          </TabsContent>
        </Tabs>
        <Separator />
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>YB</AvatarFallback>
          </Avatar>
          <Avatar size="lg">
            <AvatarFallback>MK</AvatarFallback>
          </Avatar>
        </div>
      </Section>
    </main>
  );
}
