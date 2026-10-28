"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

import {
  TOUR_DONE,
  TOUR_STEPS,
  TOUR_TARGETS,
  place,
  targetBox,
  type Placement,
  type TourStep,
} from "../model/tour";

/**
 * GRW2, the gym owner's web introduction (SF-91; Claude Design 112,
 * `FirstRunWebGTour`): four coach marks on real console elements (the
 * checklist, the gym and access cards, the Soon items of the menu, the gym
 * switcher), then the done card. One modal dialog for the whole tour: focus
 * stays inside, the page is inert, each step re-measures its target on open,
 * resize and scroll and scrolls it into view; a hidden target (the sidebar is
 * a sheet below `md`) or no room beside it centres the card.
 *
 * Only explicit ends reach the backend, and only its answer moves the tour:
 *
 * - Finish (step 4) → `onComplete` (`completeGymFirstRun`): "Finishing…",
 *   then the done card; a failure keeps step 4 with "Try again".
 * - End tour or Escape → a confirmation in the card; "End introduction" →
 *   `onDismiss` (`dismissGymFirstRun`), then the tour closes; a failure keeps
 *   the confirmation with the error.
 *
 * Back and Next record nothing: the step is client-only (a resumed tour
 * starts at step 1 on any device).
 */

const SPOT_RADIUS = {
  "md-lg": "rounded-md-lg",
  xl: "rounded-xl",
  "3xl": "rounded-3xl",
  "4xl": "rounded-4xl",
} as const;

type View = number | "done" | "confirm";

function usePlacement(step: TourStep, open: boolean, card: HTMLElement | null) {
  const [placement, setPlacement] = useState<Placement>();
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const box = targetBox(step);
      setPlacement(
        box === undefined
          ? undefined
          : place(
              step,
              box,
              { width: window.innerWidth, height: window.innerHeight },
              card?.offsetHeight ?? 0,
            ),
      );
    };
    const [first] = step.targets;
    const target = first === undefined ? null : document.querySelector(TOUR_TARGETS[first]);
    if (target instanceof HTMLElement) target.scrollIntoView({ block: "nearest" });
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
  return placement;
}

export function GymTour({
  open,
  gymName,
  onComplete,
  onDismiss,
  onClose,
  onClosed,
}: {
  open: boolean;
  gymName: string;
  /** `completeGymFirstRun`; rejects when the backend did not keep it. */
  onComplete: () => Promise<unknown>;
  /** `dismissGymFirstRun`; rejects when the backend did not keep it. */
  onDismiss: () => Promise<unknown>;
  /** Closes the dialog. */
  onClose: () => void;
  /** After the dialog closed: where focus goes. */
  onClosed: () => void;
}) {
  const t = useTranslations("gymConsole.firstRun.tour");
  const [view, setView] = useState<View>(0);
  const [returnTo, setReturnTo] = useState(0);
  const [saving, setSaving] = useState<"complete" | "dismiss">();
  const [failed, setFailed] = useState<"complete" | "dismiss">();
  const [card, setCard] = useState<HTMLElement | null>(null);
  const primary = useRef<HTMLButtonElement>(null);

  const total = TOUR_STEPS.length;
  const index = typeof view === "number" ? view : undefined;
  const step =
    index === undefined
      ? view === "done"
        ? TOUR_DONE
        : (TOUR_STEPS[returnTo] ?? TOUR_DONE)
      : (TOUR_STEPS[index] ?? TOUR_DONE);
  const placement = usePlacement(step, open, card);
  const last = index === total - 1;

  const reset = useCallback(() => {
    setView(0);
    setReturnTo(0);
    setFailed(undefined);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

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
      ? t("complete")
      : view === "confirm"
        ? t("confirm.label")
        : t("step", { step: (index ?? 0) + 1, total });
  const title =
    view === "done"
      ? t("steps.done.title")
      : view === "confirm"
        ? t("confirm.title")
        : saving === "complete"
          ? t("finishing.title")
          : failed === "complete"
            ? t("finishFailed.title")
            : t(`steps.${step.id}.title`);
  const body =
    view === "done"
      ? t("steps.done.body")
      : view === "confirm"
        ? t("confirm.body")
        : saving === "complete"
          ? t("finishing.body")
          : failed === "complete"
            ? t("finishFailed.body")
            : step.id === "switcher"
              ? t("steps.switcher.body", { name: gymName })
              : t(`steps.${step.id}.body`);

  return (
    <DialogPrimitive.Root open={open}>
      <DialogPrimitive.Portal>
        {placement === undefined ? (
          <div aria-hidden data-tour-dim className="fixed inset-0 z-50 bg-overlay" />
        ) : (
          <span
            aria-hidden
            data-tour-spotlight={view === "confirm" ? "confirm" : step.id}
            className={cn(
              "pointer-events-none fixed z-50 border-2 shadow-[0_0_0_4000px_var(--overlay)]",
              view === "confirm" ? "border-warning" : "border-highlight",
              SPOT_RADIUS[step.spot.radius],
            )}
            style={placement.spot}
          />
        )}
        <DialogPrimitive.Content
          ref={setCard}
          data-gym-tour={view === "done" || view === "confirm" ? view : step.id}
          aria-modal="true"
          aria-busy={saving !== undefined || undefined}
          aria-describedby="gym-tour-body"
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
          style={placement?.card}
          className={cn(
            // The bone card of the artboards: the light theme's tokens, whatever the page's theme.
            "light fixed z-50 flex w-95 max-w-[calc(100vw-2rem)] flex-col gap-2.5 rounded-3xl bg-background p-4.5 text-foreground shadow-modal outline-none",
            placement === undefined && "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          )}
        >
          {placement?.arrow !== undefined && (
            <span
              aria-hidden
              data-tour-arrow
              className="fixed size-4 rotate-45 bg-background"
              style={{ left: placement.arrow.x - 8, top: placement.arrow.y - 8 }}
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
                {TOUR_STEPS.map((item, at) => (
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
            id="gym-tour-body"
            className="type-body-sm text-pretty text-muted-foreground"
          >
            {body}
          </DialogPrimitive.Description>
          <p aria-live="polite" className="sr-only">
            {`${label}: ${title}`}
          </p>
          {failed !== undefined && (
            <p role="alert" className="type-caption font-bold text-destructive">
              {t("failed")}
            </p>
          )}
          <div className="mt-1 flex items-center justify-between gap-3">
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
                {t("confirm.keep")}
              </Button>
            ) : (
              <Button
                variant="link"
                className="type-body-sm text-muted-foreground"
                disabled={saving !== undefined}
                onClick={askEnd}
                data-gym-tour-end
              >
                {t("end")}
              </Button>
            )}
            <span className="flex gap-2">
              {index !== undefined && index > 0 && (
                <Button
                  variant="outline"
                  className="h-10.5 rounded-md-lg border-input px-4 text-foreground hover:bg-muted hover:text-foreground"
                  disabled={saving !== undefined}
                  onClick={() => go(index - 1)}
                >
                  {t("back")}
                </Button>
              )}
              {view === "confirm" ? (
                <Button
                  ref={primary}
                  variant="warning"
                  className="h-10.5 rounded-md-lg"
                  loading={saving === "dismiss"}
                  onClick={() => void dismiss()}
                  data-gym-tour-dismiss
                >
                  {t("confirm.end")}
                </Button>
              ) : (
                <Button
                  ref={primary}
                  variant="secondary"
                  className="h-10.5 rounded-md-lg"
                  disabled={saving !== undefined}
                  loading={saving === "complete"}
                  onClick={() => {
                    if (view === "done") close();
                    else if (last) void finish();
                    else if (index !== undefined) go(index + 1);
                  }}
                  data-gym-tour-next
                >
                  {view === "done"
                    ? t("toDashboard")
                    : last
                      ? saving === "complete"
                        ? t("finishing.button")
                        : failed === "complete"
                          ? t("tryAgain")
                          : t("finish")
                      : t("next")}
                </Button>
              )}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
