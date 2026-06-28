"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronRight,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { uploadFileToDrive } from "@/lib/drive-upload";
import type { DriveFile } from "@/lib/types";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const INTERNAL_DRAG_TYPE = "application/x-drive-file-ids";

interface FolderEntry {
  id: string;
  name: string;
}

interface DriveFileBrowserProps {
  folderId: string;
  title?: string;
}

function formatFileSize(bytes?: string) {
  if (!bytes) return "-";
  const b = parseInt(bytes, 10);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return "IMG";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "XLS";
  if (mimeType.includes("document") || mimeType.includes("word")) return "DOC";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "PPT";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "ZIP";
  return "FILE";
}

function getFileColor(mimeType: string) {
  if (mimeType.startsWith("image/")) return "bg-purple-100 text-purple-700";
  if (mimeType.includes("pdf")) return "bg-red-100 text-red-700";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "bg-green-100 text-green-700";
  if (mimeType.includes("document") || mimeType.includes("word")) return "bg-blue-100 text-blue-700";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "bg-orange-100 text-orange-700";
  return "bg-gray-100 text-gray-700";
}

function getPreviewUrl(file: DriveFile) {
  return `https://drive.google.com/file/d/${file.id}/preview`;
}

function getPreviewDescription(file: DriveFile) {
  if (file.mimeType.includes("pdf")) return "PDF 문서를 미리보고 있습니다.";
  if (file.mimeType.startsWith("image/")) return "이미지 파일을 미리보고 있습니다.";
  if (file.mimeType.includes("spreadsheet") || file.mimeType.includes("excel")) {
    return "스프레드시트 파일을 미리보고 있습니다.";
  }
  if (file.mimeType.includes("document") || file.mimeType.includes("word")) {
    return "문서 파일을 미리보고 있습니다.";
  }
  if (file.mimeType.includes("presentation") || file.mimeType.includes("powerpoint")) {
    return "프레젠테이션 파일을 미리보고 있습니다.";
  }
  return "Google Drive 파일을 미리보고 있습니다.";
}

export function DriveFileBrowser({ folderId, title = "파일" }: DriveFileBrowserProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [folderStack, setFolderStack] = useState<FolderEntry[]>([]);
  const [folderDialogMode, setFolderDialogMode] = useState<"create" | "rename" | null>(null);
  const [folderDialogName, setFolderDialogName] = useState("");
  const [folderDialogTarget, setFolderDialogTarget] = useState<DriveFile | null>(null);
  const [folderSaving, setFolderSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DriveFile | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Folder drop highlight
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const folderDragCounters = useRef<Map<string, number>>(new Map());

  const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1].id : folderId;
  const parentFolderId = folderStack.length > 1
    ? folderStack[folderStack.length - 2].id
    : folderStack.length === 1
      ? folderId
      : null;

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/drive/files?folderId=${currentFolderId}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      } else {
        console.error("Failed to fetch files");
      }
    } catch (error) {
      console.error("Fetch files error:", error);
    }
    setLoading(false);
  }, [currentFolderId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchFiles();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchFiles]);

  // Clear selection when navigating folders
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentFolderId]);

  const nameAsc = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, "ko");
  const nonFolderFiles = files.filter((f) => f.mimeType !== FOLDER_MIME).sort(nameAsc);
  const folderFiles = files.filter((f) => f.mimeType === FOLDER_MIME).sort(nameAsc);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === nonFolderFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(nonFolderFiles.map((f) => f.id)));
    }
  };

  // --- File upload (external drag & drop) ---
  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (!fileList || fileList.length === 0) return;
      setUploading(true);
      try {
        for (let i = 0; i < fileList.length; i += 1) {
          const file = fileList[i];
          try {
            await uploadFileToDrive(currentFolderId, file);
          } catch (error) {
            console.error("Upload failed for:", file.name, error);
          }
        }
        void fetchFiles();
      } catch (error) {
        console.error("Upload error:", error);
      }
      setUploading(false);
    },
    [currentFolderId, fetchFiles]
  );

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;
    await uploadFiles(selectedFiles);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // --- Move files ---
  const moveFiles = useCallback(
    async (fileIds: string[], toFolderId: string) => {
      if (fileIds.length === 0) return;
      setMoving(true);
      try {
        const res = await fetch("/api/drive/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileIds, fromFolderId: currentFolderId, toFolderId }),
        });
        if (res.ok) {
          setSelectedIds(new Set());
          void fetchFiles();
        }
      } catch (error) {
        console.error("Move error:", error);
      }
      setMoving(false);
    },
    [currentFolderId, fetchFiles]
  );

  const handleMoveToParent = () => {
    if (!parentFolderId || selectedIds.size === 0) return;
    void moveFiles(Array.from(selectedIds), parentFolderId);
  };

  // --- Container drag (external file upload) ---
  const isInternalDrag = (event: React.DragEvent) =>
    event.dataTransfer.types.includes(INTERNAL_DRAG_TYPE);

  const handleContainerDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    if (event.dataTransfer.types.includes("Files") && !event.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)) {
      setDragOver(true);
    }
  }, []);

  const handleContainerDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setDragOver(false);
  }, []);

  const handleContainerDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleContainerDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragCounterRef.current = 0;
      setDragOver(false);
      // Only handle external file uploads here
      if (!isInternalDrag(event) && event.dataTransfer.files.length > 0) {
        await uploadFiles(event.dataTransfer.files);
      }
    },
    [uploadFiles]
  );

  // --- Internal drag: file rows ---
  const handleFileDragStart = (event: React.DragEvent, file: DriveFile) => {
    // If the dragged file is not in selection, select only it
    let dragIds: string[];
    if (selectedIds.has(file.id)) {
      dragIds = Array.from(selectedIds);
    } else {
      dragIds = [file.id];
      setSelectedIds(new Set(dragIds));
    }
    event.dataTransfer.setData(INTERNAL_DRAG_TYPE, JSON.stringify(dragIds));
    event.dataTransfer.effectAllowed = "move";
  };

  // --- Folder drop target ---
  const handleFolderDragEnter = (event: React.DragEvent, targetFolderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const count = (folderDragCounters.current.get(targetFolderId) ?? 0) + 1;
    folderDragCounters.current.set(targetFolderId, count);
    if (isInternalDrag(event)) {
      setDropTargetFolderId(targetFolderId);
    }
  };

  const handleFolderDragLeave = (event: React.DragEvent, targetFolderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const count = (folderDragCounters.current.get(targetFolderId) ?? 0) - 1;
    folderDragCounters.current.set(targetFolderId, count);
    if (count <= 0) {
      folderDragCounters.current.delete(targetFolderId);
      if (dropTargetFolderId === targetFolderId) setDropTargetFolderId(null);
    }
  };

  const handleFolderDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (isInternalDrag(event)) {
      event.dataTransfer.dropEffect = "move";
    }
  };

  const handleFolderDrop = (event: React.DragEvent, targetFolderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    folderDragCounters.current.delete(targetFolderId);
    setDropTargetFolderId(null);

    const raw = event.dataTransfer.getData(INTERNAL_DRAG_TYPE);
    if (!raw) return;
    try {
      const fileIds = JSON.parse(raw) as string[];
      if (fileIds.length > 0) {
        void moveFiles(fileIds, targetFolderId);
      }
    } catch {
      // ignore
    }
  };

  // --- File/folder actions ---
  const handleDelete = async (fileId: string, fileName: string) => {
    if (!confirm(`"${fileName}" 파일을 삭제하시겠습니까?`)) return;
    setDeletingId(fileId);
    try {
      const res = await fetch(`/api/drive/files?fileId=${fileId}`, { method: "DELETE" });
      if (res.ok) void fetchFiles();
    } catch (error) {
      console.error("Delete error:", error);
    }
    setDeletingId(null);
  };

  const openCreateFolderDialog = () => {
    setFolderDialogMode("create");
    setFolderDialogName("");
    setFolderDialogTarget(null);
  };

  const openRenameDialog = (target: DriveFile) => {
    setFolderDialogMode("rename");
    setFolderDialogName(target.name);
    setFolderDialogTarget(target);
  };

  const closeFolderDialog = () => {
    setFolderDialogMode(null);
    setFolderDialogName("");
    setFolderDialogTarget(null);
  };

  const handleFolderDialogSubmit = async () => {
    const trimmed = folderDialogName.trim();
    if (!trimmed) return;
    setFolderSaving(true);
    try {
      if (folderDialogMode === "create") {
        const res = await fetch("/api/drive/folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, parentId: currentFolderId }),
        });
        if (res.ok) { closeFolderDialog(); void fetchFiles(); }
      } else if (folderDialogMode === "rename" && folderDialogTarget) {
        const res = await fetch("/api/drive/files", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: folderDialogTarget.id, name: trimmed }),
        });
        if (res.ok) { closeFolderDialog(); void fetchFiles(); }
      }
    } catch (error) {
      console.error("Folder dialog error:", error);
    }
    setFolderSaving(false);
  };

  const openDeleteFolderDialog = (folder: DriveFile) => {
    setDeleteTarget(folder);
    setDeleteStep(1);
  };

  const closeDeleteFolderDialog = () => {
    setDeleteTarget(null);
    setDeleteStep(1);
  };

  const handleDeleteFolderConfirm = async () => {
    if (deleteStep === 1) { setDeleteStep(2); return; }
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    closeDeleteFolderDialog();
    try {
      const res = await fetch(`/api/drive/files?fileId=${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) void fetchFiles();
    } catch (error) {
      console.error("Delete folder error:", error);
    }
    setDeletingId(null);
  };

  const handleCopyLink = useCallback(async () => {
    if (!previewFile?.webViewLink) return;
    try {
      await navigator.clipboard.writeText(previewFile.webViewLink);
    } catch (error) {
      console.error("Copy link error:", error);
    }
  }, [previewFile]);

  const hasSelection = selectedIds.size > 0;

  return (
    <>
      <div
        className={`relative space-y-4 rounded-lg transition-colors ${dragOver || uploading ? "bg-primary/5 ring-2 ring-primary ring-dashed" : ""}`}
        onDragEnter={handleContainerDragEnter}
        onDragLeave={handleContainerDragLeave}
        onDragOver={handleContainerDragOver}
        onDrop={handleContainerDrop}
      >
        {(dragOver || uploading) && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10">
            <div className="text-center">
              {uploading ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 animate-spin text-primary"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  <p className="text-sm font-medium text-primary">업로드 중...</p>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 text-primary"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                  <p className="text-sm font-medium text-primary">여기에 파일을 놓아주세요</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">
              Google Drive 연동 · {nonFolderFiles.length}개 파일
              {folderFiles.length > 0 && ` · ${folderFiles.length}개 폴더`}
            </p>
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <Button variant="outline" onClick={openCreateFolderDialog} size="sm" className="w-full sm:w-auto">
              <FolderPlus className="mr-2 h-4 w-4" />
              폴더 생성
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} size="sm" className="w-full sm:w-auto">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
              {uploading ? "업로드 중..." : "파일 업로드"}
            </Button>
          </div>
        </div>

        {/* Selection toolbar */}
        {hasSelection && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
            <span className="text-sm font-medium">{selectedIds.size}개 선택됨</span>
            <div className="flex items-center gap-2">
              {parentFolderId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMoveToParent}
                  disabled={moving}
                >
                  <ArrowUp className="mr-1.5 h-3.5 w-3.5" />
                  {moving ? "이동 중..." : "상위 폴더로 이동"}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                선택 해제
              </Button>
            </div>
          </div>
        )}

        {/* Breadcrumb */}
        {folderStack.length > 0 && (
          <nav className="flex items-center gap-1 text-sm">
            <button
              type="button"
              className="text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setFolderStack([])}
            >
              루트
            </button>
            {folderStack.map((entry, idx) => (
              <span key={entry.id} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                {idx === folderStack.length - 1 ? (
                  <span className="font-medium">{entry.name}</span>
                ) : (
                  <button
                    type="button"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setFolderStack(folderStack.slice(0, idx + 1))}
                  >
                    {entry.name}
                  </button>
                )}
              </span>
            ))}
          </nav>
        )}

        {/* File list */}
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">파일 목록을 불러오는 중...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">
              {folderStack.length > 0
                ? "이 폴더에 파일이 없습니다."
                : "파일이 없습니다. 파일을 드래그하거나 \"파일 업로드\" 버튼으로 추가해 주세요."}
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {/* Select all */}
            {nonFolderFiles.length > 0 && (
              <div className="flex items-center gap-2 px-1 pb-1">
                <Checkbox
                  checked={selectedIds.size === nonFolderFiles.length && nonFolderFiles.length > 0}
                  onCheckedChange={toggleSelectAll}
                  aria-label="전체 선택"
                />
                <span className="text-xs text-muted-foreground">전체 선택</span>
              </div>
            )}

            {/* Folders */}
            {folderFiles.map((folder) => (
              <div
                key={folder.id}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 transition-colors ${
                  dropTargetFolderId === folder.id
                    ? "border-primary bg-primary/10 ring-2 ring-primary"
                    : "hover:bg-muted/50"
                }`}
                onDragEnter={(e) => handleFolderDragEnter(e, folder.id)}
                onDragLeave={(e) => handleFolderDragLeave(e, folder.id)}
                onDragOver={handleFolderDragOver}
                onDrop={(e) => handleFolderDrop(e, folder.id)}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() =>
                    setFolderStack([...folderStack, { id: folder.id, name: folder.name }])
                  }
                >
                  <Folder className="h-5 w-5 shrink-0 text-blue-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{folder.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(folder.modifiedTime)}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label={`${folder.name} 폴더 메뉴`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openRenameDialog(folder)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      이름 변경
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => openDeleteFolderDialog(folder)}
                      disabled={deletingId === folder.id}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {deletingId === folder.id ? "삭제 중..." : "삭제"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}

            {/* Files */}
            {nonFolderFiles.map((file) => (
              <div
                key={file.id}
                draggable
                onDragStart={(e) => handleFileDragStart(e, file)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
                  selectedIds.has(file.id) ? "border-primary/50 bg-primary/5" : ""
                }`}
              >
                <Checkbox
                  checked={selectedIds.has(file.id)}
                  onCheckedChange={() => toggleSelect(file.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`${file.name} 선택`}
                  className="shrink-0"
                />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => setPreviewFile(file)}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Badge
                      variant="outline"
                      className={`shrink-0 px-1.5 py-0.5 text-[10px] font-bold ${getFileColor(file.mimeType)}`}
                    >
                      {getFileIcon(file.mimeType)}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="block truncate text-sm font-medium">{file.name}</div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:gap-3">
                        <span>{formatFileSize(file.size)}</span>
                        <span>{formatDate(file.modifiedTime)}</span>
                      </div>
                    </div>
                  </div>
                </button>

                <div className="flex shrink-0 items-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`${file.name} 메뉴 열기`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DropdownMenuItem onClick={() => openRenameDialog(file)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        이름 변경
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => void handleDelete(file.id, file.name)}
                        disabled={deletingId === file.id}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {deletingId === file.id ? "삭제 중..." : "삭제"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Folder/file create/rename dialog */}
      <Dialog open={folderDialogMode !== null} onOpenChange={(open) => { if (!open) closeFolderDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {folderDialogMode === "create"
                ? "폴더 생성"
                : folderDialogTarget?.mimeType === FOLDER_MIME
                  ? "폴더 이름 변경"
                  : "파일 이름 변경"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); void handleFolderDialogSubmit(); }}
            className="space-y-4"
          >
            <Input
              autoFocus
              placeholder={
                folderDialogMode === "rename" && folderDialogTarget?.mimeType !== FOLDER_MIME
                  ? "파일 이름을 입력하세요"
                  : "폴더 이름을 입력하세요"
              }
              value={folderDialogName}
              onChange={(e) => setFolderDialogName(e.target.value)}
              disabled={folderSaving}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeFolderDialog} disabled={folderSaving}>
                취소
              </Button>
              <Button type="submit" disabled={folderSaving || !folderDialogName.trim()}>
                {folderSaving
                  ? (folderDialogMode === "create" ? "생성 중..." : "변경 중...")
                  : (folderDialogMode === "create" ? "생성" : "변경")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Folder delete dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) closeDeleteFolderDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {deleteStep === 1 ? "폴더 삭제" : "정말 삭제하시겠습니까?"}
            </DialogTitle>
            <DialogDescription>
              {deleteStep === 1 ? (
                <>
                  <span className="font-semibold">&ldquo;{deleteTarget?.name}&rdquo;</span> 폴더를 삭제하시겠습니까?
                </>
              ) : (
                <span className="text-destructive font-semibold">
                  폴더 안의 모든 하위 폴더와 파일이 영구적으로 삭제되며 복구할 수 없습니다.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteFolderDialog} autoFocus>
              취소
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteFolderConfirm()}>
              {deleteStep === 1 ? "삭제" : "모두 삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File preview dialog */}
      <Dialog open={Boolean(previewFile)} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent
          className="max-w-[min(1100px,calc(100vw-2rem))] max-h-[90vh] p-0 sm:max-w-[min(1100px,calc(100vw-2rem))]"
          showCloseButton={false}
        >
          {previewFile ? (
            <>
              <DialogHeader className="border-b border-border/60 px-6 py-4">
                <DialogTitle>{previewFile.name}</DialogTitle>
                <DialogDescription>{getPreviewDescription(previewFile)}</DialogDescription>
              </DialogHeader>
              <div className="h-[calc(80vh-8rem)] w-full bg-black/5">
                <iframe
                  src={getPreviewUrl(previewFile)}
                  title={previewFile.name}
                  className="h-full w-full"
                  allow="autoplay"
                />
              </div>
              <div className="flex flex-row flex-wrap gap-2 border-t border-border/60 px-6 py-4 justify-end">
                {previewFile.webViewLink ? (
                  <Button variant="outline" onClick={() => void handleCopyLink()}>
                    링크 복사
                  </Button>
                ) : null}
                {previewFile.webViewLink ? (
                  <Button asChild variant="outline">
                    <a href={previewFile.webViewLink} target="_blank" rel="noopener noreferrer">
                      새 창에서 열기
                    </a>
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
