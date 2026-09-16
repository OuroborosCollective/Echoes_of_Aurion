import { useEffect, useRef } from "react";

export type SwipeDirection = "up" | "down" | "left" | "right";

interface SwipeOptions {
  onSwipe?: (direction: SwipeDirection) => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  maxTime?: number;
  enabled?: boolean;
}

/**
 * Custom hook to detect swipe gestures on mobile devices.
 * Helps reduce reliance on small tap targets by allowing directional swipes to trigger actions.
 */
export function useSwipeGesture({
  onSwipe,
  onSwipeUp,
  onSwipeDown,
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  maxTime = 300,
  enabled = true,
}: SwipeOptions) {
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Avoid triggering on interactive elements to prevent conflicts with UI controls
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, select, textarea, [role="button"], .open-world-dpad, .virtual-joystick')) {
        return;
      }

      touchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return;

      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
        time: Date.now(),
      };

      const dx = touchEnd.x - touchStart.current.x;
      const dy = touchEnd.y - touchStart.current.y;
      const dt = touchEnd.time - touchStart.current.time;

      touchStart.current = null;

      // Filter out slow drags (scrolling) or very short touches
      if (dt > maxTime) return;

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (Math.max(absX, absY) < threshold) return;

      // Determine primary direction
      if (absX > absY) {
        // Horizontal swipe
        const direction = dx > 0 ? "right" : "left";
        if (direction === "right") onSwipeRight?.();
        else onSwipeLeft?.();
        onSwipe?.(direction);
      } else {
        // Vertical swipe
        const direction = dy > 0 ? "down" : "up";
        if (direction === "down") onSwipeDown?.();
        else onSwipeUp?.();
        onSwipe?.(direction);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, threshold, maxTime, onSwipe, onSwipeUp, onSwipeDown, onSwipeLeft, onSwipeRight]);
}
