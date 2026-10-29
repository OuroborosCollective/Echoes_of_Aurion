import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * True while a scroll container still has content below its visible area, so the HUD can fade that edge
 * instead of silently cutting the last entry. Pure presentation: it reads the element, it changes nothing.
 * Pass values that change the content height as `deps` (the list, a collapsed flag).
 */
export function useScrollHint<T extends HTMLElement>(deps: readonly unknown[]): { ref: RefObject<T | null>; more: boolean } {
  const ref = useRef<T | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      setMore(false);
      return;
    }
    const update = () => setMore(element.scrollTop + element.clientHeight < element.scrollHeight - 2);
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, more };
}
