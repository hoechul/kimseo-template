"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PRESETS = [25, 50, 75, 100] as const;
const MIN_WIDTH_PX = 48;
const MOBILE_QUERY = "(max-width: 767px)";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  editorWidth: number;
}

interface ImageResizeOverlayProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  active: boolean;
}

export function ImageResizeOverlay({ editorRef, active }: ImageResizeOverlayProps) {
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    startWidth: number;
    editorWidth: number;
  } | null>(null);

  useEffect(() => {
    imgRef.current = selectedImg;
  }, [selectedImg]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync selection with dialog open prop
      setSelectedImg(null);
    }
  }, [active]);

  const recompute = useCallback(() => {
    const editor = editorRef.current;
    const container = editor?.parentElement;
    if (!selectedImg || !editor || !container) {
      setRect(null);
      return;
    }
    const imgRect = selectedImg.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const style = window.getComputedStyle(editor);
    const paddingX =
      parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0");
    setRect({
      top: imgRect.top - containerRect.top,
      left: imgRect.left - containerRect.left,
      width: imgRect.width,
      height: imgRect.height,
      editorWidth: Math.max(1, editor.clientWidth - paddingX),
    });
  }, [editorRef, selectedImg]);

  useEffect(() => {
    if (!selectedImg) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale rect when selection is released
      setRect(null);
      return;
    }

    const observer = new ResizeObserver(() => recompute());
    observer.observe(selectedImg);

    const editor = editorRef.current;
    const onScroll = () => recompute();
    const onResize = () => recompute();
    editor?.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);

    return () => {
      observer.disconnect();
      editor?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [selectedImg, editorRef, recompute]);

  useEffect(() => {
    if (!active) return;
    const handlePointerDown = (event: PointerEvent) => {
      const editor = editorRef.current;
      if (!editor) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (editor.contains(target) && target.tagName === "IMG") {
        setSelectedImg(target as HTMLImageElement);
      } else if (!target.closest("[data-image-resize-overlay]")) {
        setSelectedImg(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [active, editorRef]);

  const applyPercent = useCallback(
    (percent: number) => {
      const img = imgRef.current;
      if (!img) return;
      img.style.width = `${percent}%`;
      img.style.height = "auto";
      requestAnimationFrame(recompute);
    },
    [recompute]
  );

  const onHandlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      const editor = editorRef.current;
      const img = imgRef.current;
      if (!img || !editor) return;
      event.preventDefault();
      event.stopPropagation();
      const style = window.getComputedStyle(editor);
      const paddingX =
        parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0");
      dragStateRef.current = {
        startX: event.clientX,
        startWidth: img.getBoundingClientRect().width,
        editorWidth: Math.max(1, editor.clientWidth - paddingX),
      };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    },
    [editorRef]
  );

  const onHandlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragStateRef.current;
      const img = imgRef.current;
      if (!drag || !img) return;
      const delta = event.clientX - drag.startX;
      const newWidth = Math.max(
        MIN_WIDTH_PX,
        Math.min(drag.editorWidth, drag.startWidth + delta)
      );
      const percent = Math.round((newWidth / drag.editorWidth) * 100);
      img.style.width = `${percent}%`;
      img.style.height = "auto";
      recompute();
    },
    [recompute]
  );

  const onHandlePointerUp = useCallback((event: React.PointerEvent) => {
    dragStateRef.current = null;
    const element = event.currentTarget as HTMLElement;
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
  }, []);

  if (!active || !selectedImg || !rect) return null;

  const toolbarAbove = rect.top >= 40;
  const toolbarTop = toolbarAbove ? rect.top - 36 : rect.top + rect.height + 4;
  const currentPercent = Math.round((rect.width / rect.editorWidth) * 100);

  return (
    <div
      data-image-resize-overlay
      className="pointer-events-none absolute inset-0 z-20"
    >
      <div
        className="absolute rounded-md ring-2 ring-primary"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
      />
      {isMobile ? (
        <div
          className="pointer-events-auto absolute flex gap-1 rounded-md border bg-popover px-1.5 py-1 shadow-md"
          style={{ top: toolbarTop, left: rect.left }}
        >
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyPercent(preset)}
              className="rounded px-2 py-1 text-xs font-medium hover:bg-accent"
            >
              {preset}%
            </button>
          ))}
        </div>
      ) : (
        <>
          <div
            className="pointer-events-none absolute rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow"
            style={{ top: Math.max(0, rect.top - 20), left: rect.left }}
          >
            {currentPercent}%
          </div>
          <div
            className="pointer-events-auto absolute h-4 w-4 cursor-nwse-resize rounded-full border-2 border-background bg-primary shadow"
            style={{
              top: rect.top + rect.height - 8,
              left: rect.left + rect.width - 8,
            }}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
          />
        </>
      )}
    </div>
  );
}
