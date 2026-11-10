/**
 * Coach-mark geometry shared by the product tours (the gym introduction, SF-91; the
 * partner portal tour, SF-119): where the visible part of a step's targets is, and
 * where the spotlight, card and arrow go. Pure functions over the DOM and numbers;
 * no step knowledge.
 */

export type Box = { left: number; top: number; width: number; height: number };

/**
 * - `right` / `left`: the card 22 px beside the spotlight, its top 52 px above the
 *   target's centre, the arrow on that centre;
 * - `below`: the card 22 px under the spotlight, aligned with its left edge (above it
 *   when there is no room below).
 */
export type TourPlacement = "right" | "left" | "below";

/** The nearest ancestor that scrolls, whose box clips what the user can see of `element`. */
function scrollClip(element: Element): DOMRect | undefined {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY, overflowX } = getComputedStyle(node);
    if (/(auto|scroll|hidden)/.test(`${overflowY} ${overflowX}`))
      return node.getBoundingClientRect();
  }
  return undefined;
}

/**
 * The union of the visible parts of every match of `selectors`, or `undefined` when
 * one selector has nothing visible. Each match is clipped to its scrolling container
 * (the sidebar's menu scrolls on short windows), so the spotlight never covers what
 * lies outside it.
 */
export function visibleBox(
  selectors: readonly string[],
  root: ParentNode = document,
): Box | undefined {
  const boxes: { left: number; top: number; right: number; bottom: number }[] = [];
  for (const selector of selectors) {
    const visible = [...root.querySelectorAll(selector)]
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .map((element) => {
        const box = element.getBoundingClientRect();
        const clip = scrollClip(element);
        return {
          left: Math.max(box.left, clip?.left ?? -Infinity),
          top: Math.max(box.top, clip?.top ?? -Infinity),
          right: Math.min(box.right, clip?.right ?? Infinity),
          bottom: Math.min(box.bottom, clip?.bottom ?? Infinity),
        };
      })
      .filter((box) => box.right - box.left > 0 && box.bottom - box.top > 0);
    if (visible.length === 0) return undefined;
    boxes.push(...visible);
  }
  if (boxes.length === 0) return undefined;
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

export const CARD_WIDTH = 380;
const GAP = 22;
/** The card's top above the target's centre. */
const RISE = 52;
const EDGE = 16;
/** The arrow needs a real gap between the spotlight and the card. */
const ARROW_GAP = 12;

export type Placement = {
  spot: Box;
  card: { left: number; top: number };
  /** The arrow's centre, or `undefined` when the card sits flush against the spotlight. */
  arrow: { x: number; y: number } | undefined;
};

/**
 * Where the spotlight, card and arrow go for a target box in a viewport, or
 * `undefined` when the card cannot sit beside the target without covering it (it is
 * then centred over the dimmed page). Beside: the step's side, 22 px away; when the
 * window is too narrow for that gap the card slides to the viewport edge as long as it
 * still clears the spotlight, and is kept inside the viewport vertically. Below: under
 * the spotlight, else above it, else `undefined`. A spotlight taller than the viewport
 * is clipped to it.
 */
export function placeCard(
  placement: TourPlacement,
  pad: { padX: number; padY: number },
  box: Box,
  viewport: { width: number; height: number },
  cardHeight: number,
): Placement | undefined {
  const { padX, padY } = pad;
  const spot = {
    left: box.left - padX,
    top: box.top - padY,
    width: box.width + padX * 2,
    height: box.height + padY * 2,
  };
  const visibleTop = Math.max(spot.top, 0);
  const visibleBottom = Math.min(spot.top + spot.height, viewport.height);
  if (visibleBottom <= visibleTop) return undefined;

  if (placement === "below") {
    const left = Math.min(Math.max(spot.left, EDGE), viewport.width - CARD_WIDTH - EDGE);
    const under = visibleBottom + GAP;
    if (under + cardHeight + EDGE <= viewport.height)
      return { spot, card: { left, top: under }, arrow: undefined };
    const over = visibleTop - GAP - cardHeight;
    if (over >= EDGE) return { spot, card: { left, top: over }, arrow: undefined };
    return undefined;
  }

  const centre = (visibleTop + visibleBottom) / 2;
  const maxTop = Math.max(EDGE, viewport.height - cardHeight - EDGE);
  const top = Math.min(Math.max(EDGE, centre - RISE), maxTop);
  const arrowY = Math.min(Math.max(centre, top + 24), top + Math.max(cardHeight - 24, 24));
  const spotRight = spot.left + spot.width;

  if (placement === "right") {
    const left = Math.min(spotRight + GAP, viewport.width - CARD_WIDTH - EDGE);
    if (left < spotRight) return undefined;
    const arrow = left - spotRight >= ARROW_GAP ? { x: left, y: arrowY } : undefined;
    return { spot, card: { left, top }, arrow };
  }
  const left = Math.max(spot.left - GAP - CARD_WIDTH, EDGE);
  if (left + CARD_WIDTH > spot.left) return undefined;
  const arrow =
    spot.left - (left + CARD_WIDTH) >= ARROW_GAP ? { x: left + CARD_WIDTH, y: arrowY } : undefined;
  return { spot, card: { left, top }, arrow };
}
