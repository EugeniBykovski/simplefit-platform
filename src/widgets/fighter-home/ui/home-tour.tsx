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

import type { FirstRunOutcome } from "@/entities/first-run";
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
 * The Fighter web tour (Claude Design 34b, FRW2: steps 1–9 and complete): nine coach marks on
 * real production elements, then the completion card. The steps, their
 * targets and placement come from `model/tour`; this component only renders
 * the current one.
 *
 * It is one modal dialog for the whole tour (focus kept inside, the page
 * inert). Every step re-measures its target on open, resize and scroll, and
 * scrolls it into view; a target that is hidden (the sidebar is a menu below
 * `md`) or leaves no room for the card centres the card over the dimmed page.
 *
 * Outcomes (`onRecord`, simplefit-api ADR 0018) are recorded only by an
 * explicit end: "End tour" or Escape records `dismissed` on any step, "Finish"
 * on step 9 records `completed` and then shows the completion card. Back and
 * Next record nothing. A failed write keeps the step open with the error. A
 * replay (the outcome is already kept) records nothing at all.
 */

const SPOT_RADIUS = {
  "md-lg": "rounded-md-lg",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "4xl": "rounded-4xl",
} as const;

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

export function HomeTour({
  open,
  replay,
  onRecord,
  onClose,
  onClosed,
}: {
  open: boolean;
  /** The outcome is already kept: the tour records nothing. */
  replay: boolean;
  /** Records the outcome; rejects when it was not kept. */
  onRecord: (outcome: FirstRunOutcome) => Promise<unknown>;
  /** Closes the dialog (after an outcome or the completion card). */
  onClose: () => void;
  /** After the dialog closed: where focus goes. */
  onClosed: () => void;
}) {
  const t = useTranslations("fighterHome.tour");
  const [index, setIndex] = useState<number | "done">(0);
  const [saving, setSaving] = useState<FirstRunOutcome>();
  const [failed, setFailed] = useState(false);
  const [card, setCard] = useState<HTMLElement | null>(null);
  const primary = useRef<HTMLButtonElement>(null);

  const step = index === "done" ? TOUR_DONE : (TOUR_STEPS[index] ?? TOUR_DONE);
  const placement = usePlacement(step, open, card);
  const total = TOUR_STEPS.length;
  const last = index === total - 1;

  // Closing resets the tour, so the next presentation starts at step 1.
  const close = useCallback(() => {
    setIndex(0);
    setFailed(false);
    onClose();
  }, [onClose]);

  // Moving between steps keeps focus in the card: Back disappears on step 1.
  useEffect(() => {
    if (open && card !== null && !card.contains(document.activeElement)) primary.current?.focus();
  }, [index, open, card]);

  const end = useCallback(
    async (outcome: FirstRunOutcome) => {
      if (saving !== undefined) return;
      if (replay) {
        if (outcome === "completed") setIndex("done");
        else close();
        return;
      }
      setSaving(outcome);
      setFailed(false);
      try {
        await onRecord(outcome);
        if (outcome === "completed") setIndex("done");
        else close();
      } catch {
        setFailed(true);
      } finally {
        setSaving(undefined);
      }
    },
    [close, onRecord, replay, saving],
  );

  const go = (to: number) => {
    setFailed(false);
    setIndex(Math.min(Math.max(to, 0), total - 1));
  };

  const keys = (event: KeyboardEvent) => {
    if (index === "done" || saving !== undefined) return;
    if (event.key === "ArrowRight" && !last) go(index + 1);
    if (event.key === "ArrowLeft" && index > 0) go(index - 1);
  };

  const id = step.id;
  const position = index === "done" ? undefined : index + 1;

  return (
    <DialogPrimitive.Root open={open}>
      <DialogPrimitive.Portal>
        {placement === undefined ? (
          <div aria-hidden data-tour-dim className="fixed inset-0 z-50 bg-overlay" />
        ) : (
          <span
            aria-hidden
            data-tour-spotlight={id}
            className={cn(
              "pointer-events-none fixed z-50 border-2 border-highlight shadow-[0_0_0_4000px_var(--overlay)]",
              SPOT_RADIUS[step.spot.radius],
            )}
            style={placement.spot}
          />
        )}
        <DialogPrimitive.Content
          ref={setCard}
          data-home-tour={id}
          aria-modal="true"
          aria-describedby="home-tour-body"
          onKeyDown={keys}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            if (index === "done") close();
            else void end("dismissed");
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
          {placement !== undefined && (
            <span
              aria-hidden
              data-tour-arrow
              className="fixed size-4 rotate-45 bg-background"
              style={{ left: placement.arrow.x - 8, top: placement.arrow.y - 8 }}
            />
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="type-label text-highlight">
              {position === undefined ? t("complete") : t("step", { step: position, total })}
            </p>
            {position === undefined ? (
              <span
                aria-hidden
                className="flex size-5.5 items-center justify-center rounded-full bg-highlight text-background"
              >
                <CheckIcon className="size-3.5" strokeWidth={3} />
              </span>
            ) : (
              <span aria-hidden data-tour-progress className="flex gap-1">
                {TOUR_STEPS.map((item, at) => (
                  <span
                    key={item.id}
                    className={cn(
                      "h-1 w-3.5 rounded-full",
                      at < position ? "bg-highlight" : "bg-input",
                    )}
                  />
                ))}
              </span>
            )}
          </div>
          <DialogPrimitive.Title className="type-h3 text-pretty">
            {t(`steps.${id}.title`)}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description
            id="home-tour-body"
            className="type-body-sm text-pretty text-muted-foreground"
          >
            {t(`steps.${id}.body`)}
          </DialogPrimitive.Description>
          {/* Announces each new step; the title and body above are its content. */}
          <p aria-live="polite" className="sr-only">
            {position === undefined
              ? t("complete")
              : `${t("step", { step: position, total })}: ${t(`steps.${id}.title`)}`}
          </p>
          {failed && (
            <p role="alert" className="type-caption font-bold text-destructive">
              {t("failed")}
            </p>
          )}
          <div className="mt-1 flex items-center justify-between gap-3">
            {index === "done" ? (
              <span />
            ) : (
              <Button
                variant="link"
                className="type-body-sm text-muted-foreground"
                disabled={saving !== undefined}
                loading={saving === "dismissed"}
                onClick={() => void end("dismissed")}
              >
                {t("end")}
              </Button>
            )}
            <span className="flex gap-2">
              {index !== "done" && index > 0 && (
                <Button
                  variant="outline"
                  className="h-10.5 rounded-md-lg border-input px-4 text-foreground hover:bg-muted hover:text-foreground"
                  disabled={saving !== undefined}
                  onClick={() => go(index - 1)}
                >
                  {t("back")}
                </Button>
              )}
              <Button
                ref={primary}
                variant="secondary"
                className="h-10.5 rounded-md-lg"
                disabled={saving !== undefined}
                loading={saving === "completed"}
                onClick={() => {
                  if (index === "done") close();
                  else if (last) void end("completed");
                  else go(index + 1);
                }}
              >
                {index === "done" ? t("toChecklist") : last ? t("finish") : t("next")}
              </Button>
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
