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
    closeAll,
    isDragging: (id: string) => draggingId === id,
    isOpen: (id: string) => openId === id,
  };
}
