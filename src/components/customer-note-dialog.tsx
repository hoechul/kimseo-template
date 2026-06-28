"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageResizeOverlay } from "@/components/image-resize-overlay";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { CustomerNote } from "@/lib/types";

export interface CustomerNoteEditorValues {
  title: string;
  content: string;
  link_url: string;
}

interface CustomerNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: CustomerNote | null;
  customerId: string;
  onSave: (values: CustomerNoteEditorValues) => Promise<boolean>;
}

const IMAGE_BUCKET = "customer-note-images";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TAGS = [
  "p", "br", "b", "strong", "i", "em", "u", "s", "a", "div", "span",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "pre", "code",
  "img", "hr",
];
const ALLOWED_ATTR = ["href", "target", "rel", "src", "alt", "width", "height", "style", "class"];

function sanitizeHtml(dirty: string) {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS, ALLOWED_ATTR });
}

function normalizeLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    new URL(withProtocol);
    return withProtocol;
  } catch {
    return null;
  }
}

function sanitizeFileName(name: string) {
  const dotIdx = name.lastIndexOf(".");
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx) : "";
  const cleanedBase = base
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase();
  const safeExt = ext.replace(/[^a-zA-Z0-9.]+/g, "").toLowerCase();
  return `${cleanedBase || "image"}${safeExt || ""}`;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function legacyContentToHtml(raw: string) {
  if (/<[a-z][\s\S]*>/i.test(raw)) {
    return raw;
  }
  const markdownImage = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  const withImages = raw.replace(markdownImage, (_, alt: string, url: string) => {
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />`;
  });
  return withImages
    .split(/\n{2,}/)
    .map((block) => {
      const escaped = block.includes("<img") ? block : escapeHtml(block);
      return `<p>${escaped.replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
}

function htmlIsBlank(html: string) {
  const stripped = html.replace(/<img[^>]*>/gi, "img");
  const text = stripped.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  return text.length === 0 && !/<img/i.test(html);
}

export function CustomerNoteDialog({
  open,
  onOpenChange,
  note,
  customerId,
  onSave,
}: CustomerNoteDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEditorEmpty, setIsEditorEmpty] = useState(true);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<{ node: Node; offset: number } | null>(null);

  const syncEmptyState = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    setIsEditorEmpty(htmlIsBlank(el.innerHTML));
  }, []);

  useEffect(() => {
    if (!open) return;

    setTitle(note?.title ?? "");
    setLinkUrl(note?.link_url ?? "");

    const raw = note?.content ?? "";
    const html = raw ? sanitizeHtml(legacyContentToHtml(raw)) : "";

    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = html;
        syncEmptyState();
      }
    });
  }, [note, open, syncEmptyState]);

  const saveSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!editorRef.current?.contains(range.startContainer)) return;

    savedSelectionRef.current = {
      node: range.startContainer,
      offset: range.startOffset,
    };
  }, []);

  const restoreSelection = useCallback(() => {
    const saved = savedSelectionRef.current;
    const editor = editorRef.current;
    if (!editor) return null;

    if (saved && editor.contains(saved.node)) {
      const range = document.createRange();
      try {
        range.setStart(saved.node, saved.offset);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return range;
      } catch {
        // fall through to end-of-editor
      }
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return range;
  }, []);

  const insertNodeAtCursor = useCallback(
    (node: Node) => {
      const editor = editorRef.current;
      if (!editor) return;

      editor.focus();
      const range = restoreSelection();
      if (!range) {
        editor.appendChild(node);
      } else {
        range.deleteContents();
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }

      savedSelectionRef.current = {
        node: range?.startContainer ?? editor,
        offset: range?.startOffset ?? 0,
      };
      syncEmptyState();
    },
    [restoreSelection, syncEmptyState]
  );

  const uploadImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("이미지 파일만 업로드할 수 있습니다.");
        return;
      }

      if (file.size > MAX_IMAGE_BYTES) {
        toast.error("이미지 크기는 10MB 이하로 업로드해주세요.");
        return;
      }

      setUploading(true);
      try {
        const safeName = sanitizeFileName(file.name || `image-${Date.now()}.png`);
        const path = `${customerId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(IMAGE_BUCKET)
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "image/png",
          });

        if (uploadError) {
          console.error("이미지 업로드 실패:", uploadError.message);
          toast.error(
            `이미지 업로드에 실패했습니다. (${uploadError.message})`
          );
          return;
        }

        const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
        const publicUrl = data?.publicUrl;
        if (!publicUrl) {
          toast.error("이미지 주소를 가져오지 못했습니다.");
          return;
        }

        const img = document.createElement("img");
        img.src = publicUrl;
        img.alt = file.name.slice(0, 80) || "image";
        img.style.maxWidth = "100%";
        img.style.borderRadius = "6px";
        img.style.margin = "8px 0";

        const wrapper = document.createElement("div");
        wrapper.appendChild(img);

        insertNodeAtCursor(wrapper);
      } finally {
        setUploading(false);
      }
    },
    [insertNodeAtCursor, customerId, supabase]
  );

  const handleFilePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    for (const file of files) {
      await uploadImage(file);
    }
  };

  const handlePaste = async (event: ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));

    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        event.preventDefault();
        saveSelection();
        await uploadImage(file);
        return;
      }
    }

    const text = event.clipboardData?.getData("text/plain");
    if (text) {
      event.preventDefault();
      const textNode = document.createTextNode(text);
      insertNodeAtCursor(textNode);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
      file.type.startsWith("image/")
    );
    if (files.length === 0) {
      setIsDraggingImage(false);
      return;
    }

    event.preventDefault();
    setIsDraggingImage(false);
    saveSelection();
    for (const file of files) {
      await uploadImage(file);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (Array.from(event.dataTransfer?.items ?? []).some((item) => item.kind === "file")) {
      event.preventDefault();
      setIsDraggingImage(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setIsDraggingImage(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const normalizedLink = normalizeLink(linkUrl);
    if (normalizedLink === null) {
      toast.error("관련 링크 주소를 확인해주세요.");
      return;
    }

    const rawHtml = editorRef.current?.innerHTML ?? "";
    const sanitized = htmlIsBlank(rawHtml) ? "" : sanitizeHtml(rawHtml);

    const nextValues = {
      title: title.trim(),
      content: sanitized,
      link_url: normalizedLink,
    };

    if (!nextValues.title && !nextValues.content && !nextValues.link_url) {
      toast.error("제목, 내용, 링크 중 하나는 입력해주세요.");
      return;
    }

    setSaving(true);

    try {
      const success = await onSave(nextValues);
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[95vh] max-h-[95vh] max-w-[95vw] flex-col overflow-hidden sm:max-w-[95vw]">
        <DialogHeader className="shrink-0">
          <DialogTitle>{note ? "메모 수정" : "메모 추가"}</DialogTitle>
          <DialogDescription>
            내용 영역에 바로 타이핑하고, 이미지는 파일 선택·드래그&드롭·클립보드 붙여넣기로 삽입할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="space-y-2 shrink-0">
            <Label htmlFor="customer-note-title">제목</Label>
            <Input
              id="customer-note-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 요청 사항 정리"
              autoFocus
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col space-y-2">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <Label htmlFor="customer-note-content">내용</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFilePick}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-1.5"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {uploading ? "업로드 중..." : "이미지 추가"}
                </Button>
              </div>
            </div>
            <div
              className={`relative flex min-h-0 flex-1 overflow-hidden rounded-md border ${
                isDraggingImage ? "border-primary ring-2 ring-primary/30" : "border-input"
              }`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div
                id="customer-note-content"
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={syncEmptyState}
                onBlur={saveSelection}
                onKeyUp={saveSelection}
                onMouseUp={saveSelection}
                onPaste={handlePaste}
                data-placeholder="내용을 입력하세요. 이미지를 붙여넣거나 드래그&드롭 또는 '이미지 추가' 버튼으로 삽입할 수 있습니다."
                className="prose prose-sm dark:prose-invert h-full w-full max-w-none overflow-y-auto break-words bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring prose-img:my-2 prose-img:rounded-md"
              />
              {isEditorEmpty ? (
                <p className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
                  내용을 입력하세요. 이미지를 붙여넣거나 드래그&드롭 또는 &lsquo;이미지 추가&rsquo; 버튼으로 삽입할 수 있습니다.
                </p>
              ) : null}
              {isDraggingImage ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-primary/5 text-sm font-medium text-primary">
                  이미지를 놓으면 업로드됩니다
                </div>
              ) : null}
              <ImageResizeOverlay editorRef={editorRef} active={open} />
            </div>
          </div>

          <div className="space-y-2 shrink-0">
            <Label htmlFor="customer-note-link">관련 링크</Label>
            <Input
              id="customer-note-link"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <DialogFooter className="shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button type="submit" disabled={saving || uploading}>
              {saving ? "저장 중..." : note ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
