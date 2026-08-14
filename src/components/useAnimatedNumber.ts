import { useEffect, useRef, useState } from 'react';

// Eases a displayed number toward `target` instead of snapping the instant
// it changes - used for HUD currency/power readouts (App.tsx/BattleScreen.tsx)
// so a gold/exp/power gain reads as a brisk count-up rather than an instant
// digit swap. Returns a float (fractional mid-animation) - callers already
// round for display (see utils/scaling.ts's formatBigNumber), so this never
// needs to round itself.
export function useAnimatedNumber(target: number, durationMs = 400): number {
  const [displayed, setDisplayed] = useState(target);
  // Captures wherever the display currently sits the moment a new target
  // arrives - deliberately NOT a dependency of the effect below (only
  // target/durationMs are), since re-running on every `displayed` update
  // would restart the animation from scratch every single frame instead of
  // ever converging.
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current = displayed;
    const from = fromRef.current;
    const delta = target - from;
    let startTimestamp: number | null = null;

    function step(timestamp: number): void {
      if (startTimestamp === null) {
        startTimestamp = timestamp;
      }
      const progress = Math.min(1, (timestamp - startTimestamp) / durationMs);
      // Ease-out cubic - fast start, gentle settle, reads as "catching up"
      // rather than a linear slide.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(from + delta * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    if (delta === 0) {
      return;
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see fromRef's comment above
  }, [target, durationMs]);

  return displayed;
}
