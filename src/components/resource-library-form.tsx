"use client";

import { FileText, Paperclip, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { DriveFileBrowser } from "@/components/drive-file-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ResourceLibraryPost } from "@/lib/types";

interface ResourceLibraryFormValues {
  title: string;
  content: string;
}

interface ResourceLibraryUploadState {
  active: boolean;
  progress: number;
  currentFileName: string | null;
  uploadedCount: number;
  totalCount: number;
}

interface ResourceLibraryFormProps {
  post: ResourceLibraryPost | null;
  onSave: (
    values: ResourceLibraryFormValues,
    files: File[],
    setUploadState: (state: ResourceLibraryUploadState) => void
  ) => Promise<void>;
  onCancel: () => void;
}

const initialUploadState: ResourceLibraryUploadState = {
  active: false,
  progress: 0,
  currentFileName: null,
  uploadedCount: 0,
  totalCount: 0,
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function ResourceLibraryForm({
  post,
  onSave,
  onCancel,
}: ResourceLibraryFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<ResourceLibraryUploadState>(initialUploadState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    setTitle(post?.title ?? "");
    setContent(post?.content ?? "");
    setPendingFiles([]);
  }, [post]);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    setPendingFiles((prev) => {
      const existingKeys = new Set(prev.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const next = [...prev];

      for (const file of Array.from(fileList)) {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          next.push(file);
        }
      }

      return next;
    });
  };

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    if (event.dataTransfer.types.includes("Files")) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = 0;
    setDragOver(false);
    addFiles(event.dataTransfer.files);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setUploadState((prev) =>
      pendingFiles.length > 0
        ? {
            active: true,
            progress: 0,
            currentFileName: null,
            uploadedCount: 0,
            totalCount: pendingFiles.length,
          }
        : prev
    );

    try {
      await onSave(
        {
          title: title.trim(),
          content: content.trim(),
        },
        pendingFiles,
        setUploadState
      );
      setPendingFiles([]);
    } finally {
      setUploadState(initialUploadState);
      setSaving(false);
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  };

  const totalPendingBytes = pendingFiles.reduce((sum, file) => sum + file.size, 0);
  const progressPercent = Math.max(0, Math.min(100, uploadState.progress));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="surface-panel space-y-6 px-5 py-5 sm:px-6">
        <div className="grid gap-5">
          <div className="space-y-2">
            <Label htmlFor="resource-library-title">제목</Label>
            <Input
              id="resource-library-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="자료 제목을 입력하세요"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-library-content">내용</Label>
            <textarea
              id="resource-library-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={8}
              className="min-h-56 sm:min-h-[280px] w-full rounded-[1.25rem] border border-input/85 bg-background/80 px-4 py-3 text-sm shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="자료 설명이나 안내 내용을 입력하세요 (선택)"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <Label>파일 추가</Label>
                <p className="text-sm text-muted-foreground">
                  프로젝트관리와 동일하게 Google Drive에 업로드됩니다.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  addFiles(event.target.files);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                파일 선택
              </Button>
            </div>

            <div
              className={`rounded-[1.25rem] border border-dashed px-4 py-5 transition-all ${
                dragOver
                  ? "border-primary bg-primary/10 shadow-[0_0_0_4px_rgba(23,81,208,0.08)]"
                  : "border-border/80 bg-muted/10"
              }`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center justify-center gap-2 text-center">
                <div className={`rounded-2xl p-3 ${dragOver ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
                  <Upload className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    파일을 여기로 드래그하거나 버튼으로 선택하세요
                  </p>
                  <p className="text-xs text-muted-foreground">
                    여러 파일을 한 번에 추가할 수 있습니다.
                  </p>
                </div>
              </div>
            </div>

            {uploadState.active ? (
              <div className="space-y-3 rounded-[1.25rem] border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">파일 업로드 중</p>
                    <p className="text-xs text-muted-foreground">
                      {uploadState.uploadedCount}/{uploadState.totalCount} 완료
                      {uploadState.currentFileName ? ` · ${uploadState.currentFileName}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-primary">{progressPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-primary/10">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            ) : null}

            {pendingFiles.length > 0 ? (
              <div className="space-y-2 rounded-[1.25rem] border border-border/70 bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                  <span>선택 파일 {pendingFiles.length}개</span>
                  <span>총 용량 {formatFileSize(totalPendingBytes)}</span>
                </div>
                {pendingFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">{file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => removePendingFile(index)}
                      disabled={saving}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[1.25rem] border border-dashed border-border/80 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
                저장할 때 선택한 파일이 자료실 전용 드라이브 폴더로 업로드됩니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {post?.drive_folder_id ? (
        <div className="surface-panel space-y-4 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <FileText className="h-4 w-4 text-muted-foreground" />
            기존 첨부 파일
          </div>
          <DriveFileBrowser folderId={post.drive_folder_id} />
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? (uploadState.active ? "업로드 중..." : "저장 중...") : post ? "자료 수정" : "자료 등록"}
        </Button>
      </div>
    </form>
  );
}
