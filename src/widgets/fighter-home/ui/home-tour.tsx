"use client";

import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCallback, useLayoutEffect, useState, type CSSProperties } from "react";

import type { FirstRunOutcome } from "@/entities/first-run";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

/**
 * FRW2 · the Fighter web tour (Claude Design 34b, `FirstRunWebFTour`): a
 * coach mark on the sidebar's Live Board item. The artboard draws step 2 of
 * 4; only that step exists, and its copy promises nothing the Live Board
 * does not do yet (SF-40 decision).
 *
 * It is a modal dialog (focus kept inside, the page inert, Escape ends it),
 * anchored to the real nav item: the spotlight is the item's box plus 4 px,
 * and the card sits 22 px to its right with the arrow on the item's centre,
 * measured again on resize and scroll. Where the item is not visible (the
 * sidebar is a menu below `md`), the card is centred over the dimmed page.
 *
 * "End tour" records `dismissed` and "Done" `completed`
 * (`onFinish`); the dialog stays open, with the error, until the backend has
 * kept the outcome. Escape ends the tour like "End tour".
 */

/** The anchor: the desktop sidebar's Live Board item (`ShellNavLinks`). */
const TARGET = "aside [data-nav-item=board]";
const SPOT = 4;
const GAP = 22;
const CARD_WIDTH = 380;
const EDGE = 16;

type Anchor = { left: number; top: number; width: number; height: number };

function measure(): Anchor | undefined {
  const element = document.querySelector(TARGET);
  if (!(element instanceof HTMLElement)) return undefined;
  const box = element.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return undefined;
  // Only an anchor with room for the card beside it.
  if (box.right + SPOT + GAP + CARD_WIDTH + EDGE > window.innerWidth) return undefined;
  return {
    left: box.left - SPOT,
    top: box.top - SPOT,
    width: box.width + SPOT * 2,
    height: box.height + SPOT * 2,
  };
}

function useAnchor(open: boolean) {
  const [anchor, setAnchor] = useState<Anchor>();
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => setAnchor(measure());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);
  return anchor;
}

export function HomeTour({
  open,
  onFinish,
  onClosed,
}: {
  open: boolean;
  /** Records the outcome; rejects when it was not kept. */
  onFinish: (outcome: FirstRunOutcome) => Promise<unknown>;
  /** After the dialog closed: where focus goes. */
  onClosed: () => void;
}) {
  const t = useTranslations("fighterHome.tour");
  const anchor = useAnchor(open);
  const [saving, setSaving] = useState<FirstRunOutcome>();
  const [failed, setFailed] = useState(false);

  const finish = useCallback(
    async (outcome: FirstRunOutcome) => {
      if (saving !== undefined) return;
      setSaving(outcome);
      setFailed(false);
      try {
        await onFinish(outcome);
      } catch {
        setFailed(true);
      } finally {
        setSaving(undefined);
      }
    },
    [onFinish, saving],
  );

  const centre = anchor === undefined ? undefined : anchor.top + anchor.height / 2;
  const card: CSSProperties | undefined =
    anchor === undefined || centre === undefined
      ? undefined
      : {
          left: anchor.left + anchor.width + GAP,
          top: Math.max(EDGE, centre - 37),
        };

  return (
    <DialogPrimitive.Root open={open}>
      <DialogPrimitive.Portal>
        {anchor === undefined ? (
          <div aria-hidden data-tour-dim className="fixed inset-0 z-50 bg-overlay" />
        ) : (
          <span
            aria-hidden
            data-tour-spotlight
            className="pointer-events-none fixed z-50 rounded-md border-2 border-highlight shadow-[0_0_0_4000px_var(--overlay)]"
            style={anchor}
          />
        )}
        <DialogPrimitive.Content
          data-home-tour
          aria-modal="true"
          aria-describedby="home-tour-body"
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            void finish("dismissed");
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onClosed();
          }}
          style={card}
          className={cn(
            // The bone card of the artboard: the light theme's tokens, whatever the page's theme.
            "light fixed z-50 flex w-95 max-w-[calc(100vw-2rem)] flex-col gap-2.5 rounded-3xl bg-background p-4.5 text-foreground shadow-modal outline-none",
            card === undefined && "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          )}
        >
          {anchor !== undefined && centre !== undefined && (
            <span
              aria-hidden
              data-tour-arrow
              className="fixed size-4 rotate-45 bg-background"
              style={{ left: anchor.left + anchor.width + GAP - 7, top: centre - 8 }}
            />
          )}
          <p className="type-label text-highlight">{t("label")}</p>
          <DialogPrimitive.Title className="type-h3 text-pretty">
            {t("title")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description
            id="home-tour-body"
            className="type-body-sm text-pretty text-muted-foreground"
          >
            {t("body")}
          </DialogPrimitive.Description>
          {failed && (
            <p role="alert" className="type-caption font-bold text-destructive">
              {t("failed")}
            </p>
          )}
          <div className="mt-1 flex items-center justify-between gap-3">
            <Button
              variant="link"
              className="type-body-sm text-muted-foreground"
              disabled={saving !== undefined}
              loading={saving === "dismissed"}
              onClick={() => void finish("dismissed")}
            >
              {t("end")}
            </Button>
            <Button
              variant="secondary"
              className="h-10.5 rounded-md-lg"
              disabled={saving !== undefined}
              loading={saving === "completed"}
              onClick={() => void finish("completed")}
            >
              {t("done")}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
