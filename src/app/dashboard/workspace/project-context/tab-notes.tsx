"use client";

import DOMPurify from "isomorphic-dompurify";
import { ExternalLink, MoreHorizontal, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  ProjectNoteDialog,
  type ProjectNoteEditorValues,
} from "@/components/project-note-dialog";
import { Button } from "@/components/ui/button";
import { useMasking } from "@/components/masking-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { Project, ProjectNote } from "@/lib/types";

const ALLOWED_TAGS = [
  "p", "br", "b", "strong", "i", "em", "u", "s", "a", "div", "span",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "pre", "code",
  "img", "hr",
];
const ALLOWED_ATTR = ["href", "target", "rel", "src", "alt", "width", "height", "style", "class"];

const noteDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderNoteContent(raw: string) {
  if (/<[a-z][\s\S]*>/i.test(raw)) {
    return DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR });
  }
  const markdownImage = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  const withImages = raw.replace(markdownImage, (_, alt: string, url: string) => {
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />`;
  });
  const blocks = withImages
    .split(/\n{2,}/)
    .map((block) => {
      if (block.includes("<img")) return block;
      return `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
  return DOMPurify.sanitize(blocks, { ALLOWED_TAGS, ALLOWED_ATTR });
}

interface TabNotesProps {
  project: Project;
  currentEmployeeId: string | null;
  currentEmployeeName: string | null;
}

export function TabNotes({ project, currentEmployeeId, currentEmployeeName }: TabNotesProps) {
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<ProjectNote | null>(null);

  const refreshNotes = useCallback(async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from("project_notes")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("메모 목록을 불러오지 못했습니다.");
      return false;
    }
    setNotes((data ?? []) as ProjectNote[]);
    return true;
  }, [project.id, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void refreshNotes().finally(() => setLoading(false));
  }, [refreshNotes]);

  useEffect(() => {
    const channel = supabase
      .channel(`workspace-notes-${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_notes",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          void refreshNotes();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [project.id, supabase, refreshNotes]);

  const handleAdd = () => {
    setSelectedNote(null);
    setDialogOpen(true);
  };

  const handleEdit = (note: ProjectNote) => {
    setSelectedNote(note);
    setDialogOpen(true);
  };

  const handleDelete = async (note: ProjectNote) => {
    if (!confirm("이 메모를 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("project_notes").delete().eq("id", note.id);
    if (error) {
      toast.error("메모 삭제에 실패했습니다.");
      return;
    }
    toast.success("메모가 삭제되었습니다.");
    sendLog("DELETE_PROJECT_NOTE", `프로젝트 메모 삭제: ${project.name}`, {
      resource: "project_note",
      resource_id: note.id,
      details: { project_id: project.id },
    });
    await refreshNotes();
  };

  const handleSave = async (values: ProjectNoteEditorValues): Promise<boolean> => {
    const cleaned = {
      title: values.title || null,
      content: values.content || null,
      link_url: values.link_url || null,
    };

    if (selectedNote) {
      const { error } = await supabase
        .from("project_notes")
        .update(cleaned)
        .eq("id", selectedNote.id);
      if (error) {
        toast.error("메모 수정에 실패했습니다.");
        return false;
      }
      toast.success("메모가 수정되었습니다.");
      sendLog("UPDATE_PROJECT_NOTE", `프로젝트 메모 수정: ${project.name}`, {
        resource: "project_note",
        resource_id: selectedNote.id,
        details: { project_id: project.id },
      });
      setSelectedNote(null);
      return await refreshNotes();
    }

    const authorName = currentEmployeeName ?? "알 수 없음";
    const { data, error } = await supabase
      .from("project_notes")
      .insert({
        project_id: project.id,
        author_employee_id: currentEmployeeId,
        author_name: authorName,
        ...cleaned,
      })
      .select("id")
      .single();

    if (error) {
      toast.error("메모 추가에 실패했습니다.");
      return false;
    }
    toast.success("메모가 추가되었습니다.");
    sendLog("CREATE_PROJECT_NOTE", `프로젝트 메모 추가: ${project.name}`, {
      resource: "project_note",
      resource_id: data.id,
      details: { project_id: project.id },
    });
    return await refreshNotes();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{notes.length}개의 메모</div>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          메모 추가
        </Button>
      </div>

      {loading ? (
        <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          불러오는 중…
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          등록된 메모가 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => {
            const updated = note.updated_at !== note.created_at;
            return (
              <div key={note.id} className="rounded-md border border-border/60 bg-background/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {note.title?.trim() ? mask("title", note.title) : "제목 없음"}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {mask("name", note.author_name)} · {updated ? "수정" : "작성"}{" "}
                      {noteDateFormatter.format(new Date(updated ? note.updated_at : note.created_at))}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="메모 메뉴">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(note)}>수정</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => void handleDelete(note)}>
                        삭제
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {note.content?.trim() ? (
                  <div
                    className="prose prose-sm mt-2 max-w-none break-words dark:prose-invert prose-img:my-2 prose-img:rounded-md"
                    dangerouslySetInnerHTML={{ __html: renderNoteContent(note.content) }}
                  />
                ) : null}

                {note.link_url?.trim() ? (
                  <a
                    href={note.link_url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 break-all text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span>{note.link_url}</span>
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <ProjectNoteDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setSelectedNote(null);
        }}
        note={selectedNote}
        projectId={project.id}
        onSave={handleSave}
      />
    </div>
  );
}
