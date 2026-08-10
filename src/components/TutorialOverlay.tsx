import { useEffect, useState } from 'react';
import { getActiveTutorialStep, type TutorialStep } from '../data/tutorialConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function measure(step: TutorialStep): Rect | null {
  const element = document.querySelector(`[data-tutorial="${step.targetSelector}"]`);
  if (!element) {
    return null;
  }
  const box = element.getBoundingClientRect();
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

// Plan section 20's "实际操作引导" - a spotlight ring around one real,
// clickable piece of UI (see tutorialConfig.ts's tutorialSteps) plus a small
// dismissible bubble, instead of a wall of text or a full-screen blocker.
// Deliberately non-blocking: nothing here has pointer-events except the
// dismiss button, so the spotlighted element underneath stays directly
// clickable while this is showing.
function TutorialOverlay() {
  const activeStep = useGameStore((state) => getActiveTutorialStep(state));
  const completeTutorialStep = useGameStore((state) => state.completeTutorialStep);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!activeStep) {
      setRect(null);
      return;
    }

    function update(): void {
      setRect(activeStep ? measure(activeStep) : null);
    }
    update();

    // The target is a fixed HUD nav button, not something that scrolls -
    // window resize (and the modal open/close reflow it can trigger) is the
    // only thing that actually moves it, so a resize listener plus a light
    // poll (panel unlock/DOM mount timing isn't otherwise observable here)
    // is enough without a full ResizeObserver/rAF loop.
    window.addEventListener('resize', update);
    const interval = window.setInterval(update, 500);
    return () => {
      window.removeEventListener('resize', update);
      window.clearInterval(interval);
    };
  }, [activeStep]);

  if (!activeStep || !rect) {
    return null;
  }

  const padding = 6;
  const ringStyle = {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };

  // Bubble sits above the ring for bottom-anchored nav buttons (every
  // current target - see App.tsx's bottom-left/bottom-right HUD groups),
  // flipping below if there's not enough room above (a future top-anchored
  // target won't silently render off-screen).
  const bubbleAboveTop = rect.top - padding - 12;
  const showBelow = bubbleAboveTop < 80;

  return (
    <div className="tutorial-layer">
      <div className="tutorial-ring" style={ringStyle} />
      <div
        className={`tutorial-bubble ${showBelow ? 'tutorial-bubble-below' : 'tutorial-bubble-above'}`}
        style={{
          left: Math.min(Math.max(rect.left + rect.width / 2, 160), window.innerWidth - 160),
          top: showBelow ? rect.top + rect.height + padding + 10 : rect.top - padding - 10,
        }}
      >
        <div className="tutorial-bubble-message">{t(activeStep.messageKey)}</div>
        <button className="tutorial-bubble-dismiss" onClick={() => completeTutorialStep(activeStep.id)}>
          {t('tutorialStep.dismiss')}
        </button>
      </div>
    </div>
  );
}

export default TutorialOverlay;
