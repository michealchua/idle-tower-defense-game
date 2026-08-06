import { useCallback, useRef, useState, type PointerEvent } from 'react';

interface DragVisual {
  draggingId: string | null;
  pointerX: number;
  pointerY: number;
}

interface DragSession {
  draggingId: string | null;
  startX: number;
  startY: number;
}

const IDLE_VISUAL: DragVisual = { draggingId: null, pointerX: 0, pointerY: 0 };
const IDLE_SESSION: DragSession = { draggingId: null, startX: 0, startY: 0 };

// Below this many pixels of movement, a pointerdown+pointerup is treated as
// a plain tap (fires onToggle) rather than a drag (fires onDeploy) - so
// tapping a card to deploy/undeploy doesn't get misread as a zero-distance
// drag.
const DRAG_THRESHOLD_PX = 6;

export interface DeployDragCallbacks {
  // Plain tap on a roster card, no dedicated deploy/undeploy button needed -
  // toggles the unit's current deploy state.
  onToggle: (id: string) => void;
  // Drag ends over the registered game-screen element - deploys.
  onDeploy: (id: string) => void;
}

// Pointer-events-based drag (not the native HTML5 Drag and Drop API, which
// never fires on touchscreens) so this works with both mouse and touch.
// Shared by HeroPanel/PetPanel: drag a roster card onto the visible battle
// canvas to deploy it, or just tap the card to toggle deploy/bench.
export function useDeploySlotDrag({ onToggle, onDeploy }: DeployDragCallbacks) {
  // Visual-only (drives the ghost element) - fine if this lags a render
  // behind a pointermove, nothing functional depends on it.
  const [visual, setVisual] = useState<DragVisual>(IDLE_VISUAL);
  // The actual source of truth for handlePointerUp's logic. A ref instead
  // of React state because it must be readable synchronously and correctly
  // at pointerup time regardless of whether React has re-rendered (and thus
  // rebound the DOM listener with a fresh closure) between pointerdown and
  // pointerup - for a fast tap/drag that's not guaranteed, and reading a
  // stale `session` would silently drop the interaction.
  const session = useRef<DragSession>(IDLE_SESSION);
  const gameScreenEl = useRef<HTMLElement | null>(null);

  // Called once by the panel to point this drag session at the actual
  // battle canvas element (owned by BattleScreen, passed down via a ref
  // prop) - there's only ever one drop target now.
  const registerGameScreen = useCallback((el: HTMLElement | null) => {
    gameScreenEl.current = el;
  }, []);

  function isOverGameScreen(x: number, y: number): boolean {
    const el = gameScreenEl.current;
    if (!el) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  const handlePointerDown = useCallback(
    (id: string) => (event: PointerEvent<HTMLElement>) => {
      event.preventDefault();
      try {
        // Not strictly required (hit-testing doesn't depend on capture),
        // but keeps pointermove/pointerup routed to this element even if
        // the pointer briefly leaves it mid-drag. Wrapped because some
        // pointer sessions can reject capture - degrade gracefully rather
        // than let a thrown DOMException abort the drag before session/
        // visual state is set.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignored - see comment above.
      }
      session.current = { draggingId: id, startX: event.clientX, startY: event.clientY };
      setVisual({ draggingId: id, pointerX: event.clientX, pointerY: event.clientY });
    },
    [],
  );

  const handlePointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!session.current.draggingId) {
      return;
    }
    const overGameScreen = isOverGameScreen(event.clientX, event.clientY);
    gameScreenEl.current?.classList.toggle('canvas-drop-target', overGameScreen);
    setVisual((prev) => (prev.draggingId ? { ...prev, pointerX: event.clientX, pointerY: event.clientY } : prev));
  }, []);

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      gameScreenEl.current?.classList.remove('canvas-drop-target');
      const { draggingId, startX, startY } = session.current;
      session.current = IDLE_SESSION;
      setVisual(IDLE_VISUAL);

      if (!draggingId) {
        return;
      }
      const movedDistance = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (movedDistance < DRAG_THRESHOLD_PX) {
        onToggle(draggingId);
      } else if (isOverGameScreen(event.clientX, event.clientY)) {
        onDeploy(draggingId);
      }
    },
    [onToggle, onDeploy],
  );

  const handlePointerCancel = useCallback(() => {
    gameScreenEl.current?.classList.remove('canvas-drop-target');
    session.current = IDLE_SESSION;
    setVisual(IDLE_VISUAL);
  }, []);

  return { drag: visual, registerGameScreen, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel };
}
