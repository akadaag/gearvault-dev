import { useState, type TouchEvent } from 'react';

interface UseSwipeRevealOptions {
  openOffset?: number;
  openThreshold?: number;
  closeThreshold?: number;
}

interface TouchState {
  id: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  directionLocked: 'x' | 'y' | null;
}

const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

export function useSwipeReveal({
  openOffset = 168,
  openThreshold = 84,
  closeThreshold = 40,
}: UseSwipeRevealOptions = {}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [touchState, setTouchState] = useState<TouchState | null>(null);

  function isMobile() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  }

  function onTouchStart(id: string, e: TouchEvent<HTMLElement>) {
    if (!isMobile()) return;
    const touch = e.touches[0];
    if (!touch) return;

    setOpenId((prev) => (prev && prev !== id ? null : prev));
    setDraggingId(id);
    // If the item is already open, start dragOffset at -openOffset so the card
    // doesn't jump from its current visual position (translateX(-168px)) to 0.
    setDragOffset(openId === id ? -openOffset : 0);
    setTouchState({
      id,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      directionLocked: null,
    });
  }

  function onTouchMove(id: string, e: TouchEvent<HTMLElement>) {
    if (!isMobile() || draggingId !== id || !touchState || touchState.id !== id) return;
    const touch = e.touches[0];
    if (!touch) return;

    const nextX = touch.clientX;
    const nextY = touch.clientY;
    const deltaX = nextX - touchState.startX;
    const deltaY = nextY - touchState.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    let direction = touchState.directionLocked;
    if (direction == null && (absX > 8 || absY > 8)) {
      direction = absX > absY ? 'x' : 'y';
    }

    const updatedState: TouchState = {
      ...touchState,
      currentX: nextX,
      currentY: nextY,
      directionLocked: direction,
    };
    setTouchState(updatedState);

    if (direction === 'y') return;

    const baseOffset = openId === id ? -openOffset : 0;
    const nextOffset = Math.min(0, Math.max(-openOffset, baseOffset + deltaX));
    setDragOffset(nextOffset);
    e.preventDefault();
  }

  function onTouchEnd(id: string) {
    if (!isMobile() || draggingId !== id || !touchState || touchState.id !== id) {
      setDraggingId(null);
      setTouchState(null);
      setDragOffset(0);
      return;
    }

    const deltaX = touchState.currentX - touchState.startX;
    const baseOffset = openId === id ? -openOffset : 0;
    const finalOffset = Math.min(0, Math.max(-openOffset, baseOffset + deltaX));

    if (finalOffset <= -openThreshold) {
      setOpenId(id);
    } else if (deltaX >= closeThreshold || finalOffset > -openThreshold) {
      setOpenId(null);
    }

    setDraggingId(null);
    setTouchState(null);
    setDragOffset(0);
  }

  function getTransform(id: string) {
    if (draggingId === id) return `translateX(${dragOffset}px)`;
    if (openId === id) return `translateX(${-openOffset}px)`;
    return 'translateX(0px)';
  }

  // Returns the transform for the action tray so pills slide in from the right
  // in sync with the foreground card sliding left.
  // At rest (closed): pills sit openOffset px off-screen to the right.
  // While dragging: they follow the drag proportionally.
  // When open (snapped): translateX(0) — fully visible.
  function getActionsTransform(id: string) {
    if (draggingId === id) return `translateX(${openOffset + dragOffset}px)`;
    if (openId === id) return 'translateX(0px)';
    return `translateX(${openOffset}px)`;
  }

  // Returns a 0–1 progress value representing how far the swipe has revealed.
  // Used to drive the pill zoom-in scale animation.
  function getActionsProgress(id: string) {
    if (draggingId === id) return Math.min(1, Math.max(0, -dragOffset / openOffset));
    if (openId === id) return 1;
    return 0;
  }

  function closeAll() {
    setOpenId(null);
    setDraggingId(null);
    setTouchState(null);
    setDragOffset(0);
  }

  return {
    openId,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    getTransform,
    getActionsTransform,
    getActionsProgress,
    closeAll,
    isDragging: (id: string) => draggingId === id,
    isOpen: (id: string) => openId === id,
  };
}
