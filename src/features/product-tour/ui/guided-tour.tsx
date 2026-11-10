"use client";

import { CheckIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { cn } from "@/shared/lib/utils";
import { placeCard, visibleBox, type Placement } from "@/shared/lib/tour";
import { Button } from "@/shared/ui/button";

import type { TourPlacement } from "@/shared/lib/tour";

/**
 * A guided product tour (SF-119 SRW2, SF-120 ARW1): coach marks on real page elements,
 * then a done card. One modal dialog for the whole tour: focus stays inside, the page
 * behind is inert, each step re-measures its target on open, resize and scroll. Below
 * 1024 px, or when a target isn't visible, the card docks to the bottom over the
 * dimmed page.
 *
 * Only explicit ends reach the caller's backend, and only its answer moves the tour:
 *
 * - Finish (last step) → `onComplete`: "Finishing…", then the done card; a failure
 *   keeps the last step with "Try again".
 * - End tour or Escape → a confirmation in the card; ending → `onDismiss`, then the
 *   tour closes; a failure keeps the confirmation with the error.
 *
 * Back and Next record nothing. The caller owns the steps (stable selectors, never
 * DOM position or text) and all copy; this component holds no product knowledge.
 */

export type TourStep<Id extends string = string> = {
  id: Id;
  /** A stable selector of the step's real target. */
  selector: string;
  placement: TourPlacement;
  spot: { padX: number; padY: number; radius: "xl" | "3xl" | "4xl" };
};

export type TourCopy<Id extends string = string> = {
  step: (id: Id) => { title: string; body: string };
  progress: (step: number, total: number) => string;
  complete: string;
  done: { title: string; body: string };
  confirm: { label: string; title: string; body: string; keep: string; end: string };
  finishing: { title: string; body: string; button: string };
  finishFailed: { title: string; body: string };
  failed: string;
  end: string;
  back: string;
  next: string;
  finish: string;
  close: string;
  tryAgain: string;
};

/** Below this width the card docks to the bottom of the viewport, without a spotlight. */
export const DOCK_BELOW = 1024;

const SPOT_RADIUS = { xl: "rounded-xl", "3xl": "rounded-3xl", "4xl": "rounded-4xl" } as const;

type View = number | "done" | "confirm";

type Layout = { kind: "docked" } | { kind: "placed"; placement: Placement };

function useLayout(step: TourStep<string> | undefined, open: boolean, card: HTMLElement | null) {
  const [layout, setLayout] = useState<Layout>({ kind: "docked" });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (step === undefined || window.innerWidth < DOCK_BELOW) {
        setLayout({ kind: "docked" });
        return;
      }
      const box = visibleBox([step.selector]);
      const placement =
        box === undefined
          ? undefined
          : placeCard(
              step.placement,
              step.spot,
              box,
              { width: window.innerWidth, height: window.innerHeight },
              card?.offsetHeight ?? 0,
            );
      setLayout(placement === undefined ? { kind: "docked" } : { kind: "placed", placement });
    };
    if (step !== undefined) {
      const target = document.querySelector(step.selector);
      if (target instanceof HTMLElement) target.scrollIntoView({ block: "nearest" });
    }
    update();
    const observer = new ResizeObserver(update);
    if (card) observer.observe(card);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step, open, card]);
  return layout;
}

export function GuidedTour<Id extends string>({
  open,
  steps,
  copy,
  onComplete,
  onDismiss,
  onClose,
  onClosed,
}: {
  open: boolean;
  steps: readonly TourStep<Id>[];
  copy: TourCopy<Id>;
  /** Records completion; rejects when the backend did not keep it. */
  onComplete: () => Promise<unknown>;
  /** Records dismissal; rejects when the backend did not keep it. */
  onDismiss: () => Promise<unknown>;
  /** Closes the dialog. */
  onClose: () => void;
  /** After the dialog closed: where focus goes. */
  onClosed: () => void;
}) {
  const [view, setView] = useState<View>(0);
  const [returnTo, setReturnTo] = useState(0);
  const [saving, setSaving] = useState<"complete" | "dismiss">();
  const [failed, setFailed] = useState<"complete" | "dismiss">();
  const [card, setCard] = useState<HTMLElement | null>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const bodyId = useId();

  const total = steps.length;
  const index = typeof view === "number" ? view : undefined;
  const step = view === "done" ? undefined : steps[index ?? returnTo];
  const layout = useLayout(step, open, card);
  const last = index === total - 1;

  const close = useCallback(() => {
    setView(0);
    setReturnTo(0);
    setFailed(undefined);
    onClose();
  }, [onClose]);

  // A new step or view keeps focus in the card (Back disappears on step 1).
  useEffect(() => {
    if (open && card !== null && !card.contains(document.activeElement)) primary.current?.focus();
  }, [view, open, card]);

  const finish = async () => {
    if (saving !== undefined) return;
    setSaving("complete");
    setFailed(undefined);
    try {
      await onComplete();
      setView("done");
    } catch {
      setFailed("complete");
    } finally {
      setSaving(undefined);
    }
  };

  const dismiss = async () => {
    if (saving !== undefined) return;
    setSaving("dismiss");
    setFailed(undefined);
    try {
      await onDismiss();
      close();
    } catch {
      setFailed("dismiss");
    } finally {
      setSaving(undefined);
    }
  };

  const askEnd = () => {
    if (index !== undefined) setReturnTo(index);
    setFailed(undefined);
    setView("confirm");
  };

  const go = (to: number) => {
    setFailed(undefined);
    setView(Math.min(Math.max(to, 0), total - 1));
  };

  const keys = (event: KeyboardEvent) => {
    if (index === undefined || saving !== undefined) return;
    if (event.key === "ArrowRight" && !last) go(index + 1);
    if (event.key === "ArrowLeft" && index > 0) go(index - 1);
  };

  const label =
    view === "done"
      ? copy.complete
      : view === "confirm"
        ? copy.confirm.label
        : copy.progress((index ?? 0) + 1, total);
  const stepId: string = step?.id ?? "";
  const text =
    view === "done"
      ? copy.done
      : view === "confirm"
        ? copy.confirm
        : saving === "complete"
          ? copy.finishing
          : failed === "complete"
            ? copy.finishFailed
            : step === undefined
              ? copy.done
              : copy.step(step.id);
  const { title, body } = text;

  const placed = layout.kind === "placed" && view !== "done" ? layout.placement : undefined;

  return (
    <DialogPrimitive.Root open={open}>
      <DialogPrimitive.Portal>
        {placed === undefined ? (
          <div aria-hidden data-tour-dim className="fixed inset-0 z-50 bg-overlay" />
        ) : (
          <span
            aria-hidden
            data-tour-spotlight={view === "confirm" ? "confirm" : stepId}
            className={cn(
              "pointer-events-none fixed z-50 border-2 shadow-[0_0_0_4000px_var(--overlay)] motion-safe:transition-all",
              view === "confirm" ? "border-warning" : "border-highlight",
              SPOT_RADIUS[step?.spot.radius ?? "xl"],
            )}
            style={placed.spot}
          />
        )}
        <DialogPrimitive.Content
          ref={setCard}
          data-guided-tour={view === "done" || view === "confirm" ? view : stepId}
          data-tour-layout={placed === undefined ? "docked" : "placed"}
          aria-modal="true"
          aria-busy={saving !== undefined || undefined}
          aria-describedby={bodyId}
          onKeyDown={keys}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            if (saving !== undefined) return;
            if (view === "done") close();
            else if (view === "confirm") setView(returnTo);
            else askEnd();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onClosed();
          }}
          style={placed?.card}
          className={cn(
            // The bone card of the artboards: the light theme's tokens, whatever the page's theme.
            "light fixed z-50 flex max-h-[calc(100dvh-1.5rem)] flex-col gap-2.5 overflow-y-auto rounded-3xl bg-background p-4.5 text-foreground shadow-modal outline-none",
            placed === undefined
              ? view === "done"
                ? "top-1/2 left-1/2 w-95 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2"
                : "inset-x-3 bottom-3 sm:left-1/2 sm:w-120 sm:-translate-x-1/2"
              : "w-95 max-w-[calc(100vw-2rem)]",
          )}
        >
          {placed?.arrow !== undefined && (
            <span
              aria-hidden
              data-tour-arrow
              className="fixed size-4 rotate-45 bg-background"
              style={{ left: placed.arrow.x - 8, top: placed.arrow.y - 8 }}
            />
          )}
          <div className="flex items-center justify-between gap-3">
            <p
              className={cn(
                "type-label",
                view === "confirm" ? "text-warning-subtle-foreground" : "text-highlight",
              )}
            >
              {label}
            </p>
            {view === "done" ? (
              <span
                aria-hidden
                className="flex size-5.5 items-center justify-center rounded-full bg-highlight text-background"
              >
                <CheckIcon className="size-3.5" strokeWidth={3} />
              </span>
            ) : index !== undefined ? (
              <span aria-hidden data-tour-progress className="flex gap-1">
                {steps.map((item, at) => (
                  <span
                    key={item.id}
                    className={cn(
                      "h-1 w-3.5 rounded-full",
                      at <= index ? "bg-highlight" : "bg-input",
                    )}
                  />
                ))}
              </span>
            ) : null}
          </div>
          <DialogPrimitive.Title className="type-h3 text-pretty">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description
            id={bodyId}
            className="type-body-sm text-pretty text-muted-foreground"
          >
            {body}
          </DialogPrimitive.Description>
          <p aria-live="polite" className="sr-only">
            {`${label}: ${title}`}
          </p>
          {failed !== undefined && (
            <p role="alert" className="type-caption font-bold text-destructive">
              {copy.failed}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            {view === "done" ? (
              <span />
            ) : view === "confirm" ? (
              <Button
                variant="link"
                className="type-body-sm text-muted-foreground"
                disabled={saving !== undefined}
                onClick={() => {
                  setFailed(undefined);
                  setView(returnTo);
                }}
              >
                {copy.confirm.keep}
              </Button>
            ) : (
              <Button
                variant="link"
                className="type-body-sm text-muted-foreground"
                disabled={saving !== undefined}
                onClick={askEnd}
                data-guided-tour-end
              >
                {copy.end}
              </Button>
            )}
            <span className="flex gap-2">
              {index !== undefined && index > 0 && (
                <Button
                  variant="outline"
                  className="h-11 rounded-md-lg border-input px-4 text-foreground hover:bg-muted hover:text-foreground"
                  disabled={saving !== undefined}
                  onClick={() => go(index - 1)}
                >
                  {copy.back}
                </Button>
              )}
              {view === "confirm" ? (
                <Button
                  ref={primary}
                  variant="warning"
                  className="h-11 rounded-md-lg"
                  loading={saving === "dismiss"}
                  onClick={() => void dismiss()}
                  data-guided-tour-dismiss
                >
                  {copy.confirm.end}
                </Button>
              ) : (
                <Button
                  ref={primary}
                  variant="secondary"
                  className="h-11 rounded-md-lg"
                  disabled={saving !== undefined}
                  loading={saving === "complete"}
                  onClick={() => {
                    if (view === "done") close();
                    else if (last) void finish();
                    else if (index !== undefined) go(index + 1);
                  }}
                  data-guided-tour-next
                >
                  {view === "done"
                    ? copy.close
                    : last
                      ? saving === "complete"
                        ? copy.finishing.button
                        : failed === "complete"
                          ? copy.tryAgain
                          : copy.finish
                      : copy.next}
                </Button>
              )}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
