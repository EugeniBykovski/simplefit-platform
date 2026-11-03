"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import {
  BookingProblemNotice,
  bookingProblem,
  useCancelMyBooking,
} from "@/features/gym-class-booking";
import { Link, usePathname } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { PageHeader } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";

/**
 * The header of the member pages (interim web composition, D-WEB-GYM-MEMBER-BOOKING):
 * an eyebrow, the page title and the two member views as tabs. These pages
 * are account-level (`/app/me/…`, D-G07): a membership is participation in
 * a gym, never a gym workspace or a Fighter profile.
 */
export function MemberHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  const t = useTranslations("gymBooking.member.nav");
  const pathname = usePathname();
  const items = [
    {
      key: "gyms",
      href: routeHref("web.app.me.gyms"),
      active: !pathname.startsWith("/app/me/bookings"),
    },
    {
      key: "bookings",
      href: routeHref("web.app.me.bookings"),
      active: pathname.startsWith("/app/me/bookings"),
    },
  ] as const;
  return (
    <PageHeader inset="site" className="[&>div]:md:h-auto [&>div]:md:py-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="type-label font-mono text-faint-foreground uppercase">{eyebrow}</p>
        <h1 className="type-h3 font-display break-words">{title}</h1>
      </div>
      <nav aria-label={t("label")} className="flex gap-1 rounded-2xl border bg-surface p-1">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center rounded-xl px-3.5 type-body-sm font-bold text-muted-foreground",
              item.active && "bg-foreground text-background",
            )}
          >
            {t(item.key)}
          </Link>
        ))}
      </nav>
    </PageHeader>
  );
}

/** A centred, honest state of a member page (no membership, request pending, nothing booked). */
export function MemberState({
  title,
  body,
  action,
  marker,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  marker: string;
}) {
  return (
    <section
      className="mx-auto flex w-full max-w-140 flex-col items-start gap-3 rounded-3xl border border-dashed px-6 py-8"
      data-member-state={marker}
    >
      <h2 className="type-title font-display">{title}</h2>
      <p className="type-body-sm text-muted-foreground">{body}</p>
      {action}
    </section>
  );
}

/**
 * Cancelling one of the member's own bookings, always asked first. The
 * booking stays as it is until the backend answers; a refusal (the class
 * started, the booking was already cancelled…) stays in the dialog. Nothing
 * is said about money: there is no price, refund or plan.
 */
export function CancelBookingDialog({
  bookingId,
  title,
  when,
  trigger,
  onDone,
}: {
  bookingId: string;
  title: string;
  when: string;
  trigger: ReactNode;
  onDone?: () => void;
}) {
  const t = useTranslations("gymBooking.member.cancel");
  const [open, setOpen] = useState(false);
  const cancel = useCancelMyBooking();
  const pending = cancel.isPending;
  const problem = cancel.isError ? bookingProblem(cancel.error) : null;
  const close = () => {
    setOpen(false);
    cancel.reset();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) setOpen(true);
        else close();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        className="sm:max-w-md"
        data-cancel-booking-dialog={bookingId}
      >
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body", { title, when })}</DialogDescription>
        </DialogHeader>
        {problem && <BookingProblemNotice problem={problem} />}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={close}>
            {t("keep")}
          </Button>
          <Button
            variant="destructive"
            aria-busy={pending || undefined}
            disabled={pending}
            onClick={() =>
              cancel.mutate(bookingId, {
                onSuccess: () => {
                  setOpen(false);
                  onDone?.();
                },
              })
            }
            data-confirm-cancel-booking
          >
            {pending && <Spinner />}
            {pending ? t("pending") : problem?.kind === "unknown" ? t("again") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
