"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type DragSelectMode = "add" | "remove";

interface UseDragSelectArgs {
  orderedTaskIds: string[];
  isSelected: (taskId: string) => boolean;
  onCommit: (ids: string[], mode: DragSelectMode) => void;
}

interface UseDragSelectResult {
  beginDrag: (sourceTaskId: string, event: React.MouseEvent) => void;
  draftIds: Set<string>;
  mode: DragSelectMode | null;
  isActive: boolean;
}

const DRAG_THRESHOLD_PX = 5;

function findTaskIdAtPoint(clientX: number, clientY: number): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    const element = el as HTMLElement;
    if (element.dataset?.taskId) return element.dataset.taskId;
    const ancestor = element.closest?.("[data-task-id]") as HTMLElement | null;
    if (ancestor?.dataset?.taskId) return ancestor.dataset.taskId;
  }
  return null;
}

function computeRange(ids: string[], srcId: string, tgtId: string): string[] {
  const srcIdx = ids.indexOf(srcId);
  const tgtIdx = ids.indexOf(tgtId);
  if (srcIdx === -1 || tgtIdx === -1) return [];
  const [lo, hi] = srcIdx < tgtIdx ? [srcIdx, tgtIdx] : [tgtIdx, srcIdx];
  return ids.slice(lo, hi + 1);
}

export function useDragSelect({
  orderedTaskIds,
  isSelected,
  onCommit,
}: UseDragSelectArgs): UseDragSelectResult {
  const [sourceTaskId, setSourceTaskId] = useState<string | null>(null);
  const [currentTargetId, setCurrentTargetId] = useState<string | null>(null);
  const [mode, setMode] = useState<DragSelectMode | null>(null);

  const orderedIdsRef = useRef<string[]>(orderedTaskIds);
  const onCommitRef = useRef(onCommit);
  const isSelectedRef = useRef(isSelected);
  const currentTargetRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    orderedIdsRef.current = orderedTaskIds;
  }, [orderedTaskIds]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    isSelectedRef.current = isSelected;
  }, [isSelected]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  const beginDrag = useCallback((nextSourceId: string, event: React.MouseEvent) => {
    if (event.button !== 0) return;

    cleanupRef.current?.();

    const startX = event.clientX;
    const startY = event.clientY;
    let dragActive = false;

    const nextMode: DragSelectMode = isSelectedRef.current(nextSourceId) ? "remove" : "add";

    const activate = () => {
      if (dragActive) return;
      dragActive = true;

      currentTargetRef.current = nextSourceId;
      setSourceTaskId(nextSourceId);
      setCurrentTargetId(nextSourceId);
      setMode(nextMode);

      window.getSelection()?.removeAllRanges();
      document.body.dataset.dragSelectActive = "true";
      document.body.style.userSelect = "none";
      document.body.style.cursor = "crosshair";
    };

    const suppressNextClick = () => {
      const eat = (ce: MouseEvent) => {
        ce.preventDefault();
        ce.stopPropagation();
      };
      window.addEventListener("click", eat, true);
      setTimeout(() => window.removeEventListener("click", eat, true), 0);
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragActive) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        activate();
      }
      const id = findTaskIdAtPoint(moveEvent.clientX, moveEvent.clientY);
      if (id && id !== currentTargetRef.current) {
        currentTargetRef.current = id;
        setCurrentTargetId(id);
      }
    };

    const finalize = (commit: boolean, pointerEvent?: MouseEvent) => {
      cleanup();
      if (!dragActive) return;

      const resolvedTarget =
        (pointerEvent ? findTaskIdAtPoint(pointerEvent.clientX, pointerEvent.clientY) : null) ??
        currentTargetRef.current ??
        nextSourceId;

      if (commit) {
        const range = computeRange(orderedIdsRef.current, nextSourceId, resolvedTarget);
        if (range.length > 0) onCommitRef.current(range, nextMode);
      }

      suppressNextClick();
      currentTargetRef.current = null;
      setSourceTaskId(null);
      setCurrentTargetId(null);
      setMode(null);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      finalize(true, upEvent);
    };

    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") finalize(false);
    };

    const handleContextMenu = (ctxEvent: MouseEvent) => {
      ctxEvent.preventDefault();
      finalize(false);
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("contextmenu", handleContextMenu);
      if (dragActive) {
        delete document.body.dataset.dragSelectActive;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      }
      cleanupRef.current = null;
    };

    cleanupRef.current = cleanup;

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("contextmenu", handleContextMenu);
  }, []);

  const draftIds = useMemo(() => {
    if (!sourceTaskId || !currentTargetId) return new Set<string>();
    return new Set(computeRange(orderedTaskIds, sourceTaskId, currentTargetId));
  }, [sourceTaskId, currentTargetId, orderedTaskIds]);

  return {
    beginDrag,
    draftIds,
    mode,
    isActive: Boolean(sourceTaskId),
  };
}
