"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCopy, PencilLine, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { Customer, Lead, Meeting, Project } from "@/lib/types";

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildSummaryMarkdown(meeting: Meeting): string {
  const lines: string[] = [];

  lines.push(`# ${meeting.title}`);
  lines.push("");

  const meta: string[] = [];
  const displayDate = meeting.started_at || meeting.created_at;
  if (displayDate) meta.push(`**시작**: ${formatDate(displayDate)}`);
  if (meeting.ended_at) meta.push(`**종료**: ${formatDate(meeting.ended_at)}`);
  if (meeting.status) meta.push(`**상태**: ${meeting.status}`);
  if (meta.length > 0) {
    lines.push(meta.join(" · "));
    lines.push("");
  }

  const links: string[] = [];
  if (meeting.projects) {
    const pLabel = meeting.projects.project_number
      ? `${meeting.projects.project_number} ${meeting.projects.name}`
      : meeting.projects.name;
    links.push(`**프로젝트**: ${pLabel}`);
  }
  if (meeting.customers) {
    links.push(`**고객**: ${meeting.customers.name}`);
  }
  if (meeting.leads) {
    links.push(`**리드**: ${meeting.leads.company_name}`);
  }
  if (links.length > 0) {
    lines.push(links.join(" · "));
    lines.push("");
  }

  lines.push("---");
  lines.push("");

  if (meeting.summary?.trim()) {
    lines.push("## 요약");
    lines.push("");
    lines.push(meeting.summary.trim());
    lines.push("");
  }

  return lines.join("\n");
}

interface MeetingDetailDialogProps {
  meetingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => Promise<void> | void;
  onDeleted?: () => Promise<void> | void;
}

export function MeetingDetailDialog({
  meetingId,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: MeetingDetailDialogProps) {
  const supabase = useMemo(() => createClient(), []);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");

  // Link dialogs
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadSearch, setLeadSearch] = useState("");

  const fetchMeeting = useCallback(async () => {
    if (!meetingId) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("meetings")
      .select("*, projects(project_number, name), customers(id, name), leads(id, company_name)")
      .eq("id", meetingId)
      .single();

    if (error) {
      toast.error("미팅 조회 실패: " + error.message);
      setMeeting(null);
    } else {
      setMeeting(data);
    }
    setLoading(false);
  }, [supabase, meetingId]);

  useEffect(() => {
    if (open && meetingId) {
      setMode("view");
      void fetchMeeting();
    }
    if (!open) {
      setMeeting(null);
      setMode("view");
    }
  }, [open, meetingId, fetchMeeting]);

  const enterEditMode = () => {
    if (!meeting) return;
    setEditTitle(meeting.title);
    setTranscriptDraft(meeting.transcript ?? "");
    setSummaryDraft(meeting.summary ?? "");
    setMode("edit");
  };

  const handleSave = async () => {
    if (!meeting) return;

    const payload = {
      title: editTitle.trim() || meeting.title,
      transcript: transcriptDraft,
      summary: summaryDraft,
      status: "완료" as const,
      ended_at: meeting.ended_at ?? new Date().toISOString(),
    };

    setSaving(true);
    const { error } = await supabase
      .from("meetings")
      .update(payload)
      .eq("id", meeting.id);
    setSaving(false);

    if (error) {
      toast.error("미팅 저장 실패: " + error.message);
      return;
    }

    sendLog("UPDATE_MEETING", `미팅 수정: ${payload.title}`, {
      resource: "meeting",
      resource_id: meeting.id,
    });

    toast.success("미팅이 저장되었습니다.");
    setMode("view");
    await fetchMeeting();
    await onUpdated?.();
  };

  const handleDelete = async () => {
    if (!meeting) return;
    if (!confirm("이 미팅 기록을 삭제하시겠습니까?")) return;

    setDeleting(true);
    const { error } = await supabase.from("meetings").delete().eq("id", meeting.id);

    if (error) {
      toast.error("미팅 삭제 실패: " + error.message);
      setDeleting(false);
      return;
    }

    sendLog("DELETE_MEETING", `미팅 삭제: ${meeting.title}`, {
      resource: "meeting",
      resource_id: meeting.id,
    });

    toast.success("미팅이 삭제되었습니다.");
    onOpenChange(false);
    await onDeleted?.();
  };

  // --- Link handlers ---
  const handleLinkProject = async (projectId: string | null) => {
    if (!meeting) return;
    const { error } = await supabase
      .from("meetings")
      .update({ project_id: projectId })
      .eq("id", meeting.id);

    if (error) {
      toast.error("프로젝트 연결 변경 실패: " + error.message);
      return;
    }

    setProjectDialogOpen(false);
    await fetchMeeting();
    await onUpdated?.();
  };

  const handleLinkCustomer = async (customerId: string | null) => {
    if (!meeting) return;
    const { error } = await supabase
      .from("meetings")
      .update({ customer_id: customerId })
      .eq("id", meeting.id);

    if (error) {
      toast.error("고객 연결 변경 실패: " + error.message);
      return;
    }

    setCustomerDialogOpen(false);
    await fetchMeeting();
    await onUpdated?.();
  };

  const handleLinkLead = async (leadId: string | null) => {
    if (!meeting) return;
    const { error } = await supabase
      .from("meetings")
      .update({ lead_id: leadId })
      .eq("id", meeting.id);

    if (error) {
      toast.error("리드 연결 변경 실패: " + error.message);
      return;
    }

    setLeadDialogOpen(false);
    await fetchMeeting();
    await onUpdated?.();
  };

  const openProjectDialog = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("프로젝트 목록 조회 실패: " + error.message);
      return;
    }

    setProjects(data ?? []);
    setProjectSearch("");
    setProjectDialogOpen(true);
  };

  const openCustomerDialog = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name");

    if (error) {
      toast.error("고객 목록 조회 실패: " + error.message);
      return;
    }

    setCustomers((data ?? []) as Customer[]);
    setCustomerSearch("");
    setCustomerDialogOpen(true);
  };

  const openLeadDialog = async () => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("리드 목록 조회 실패: " + error.message);
      return;
    }

    setLeads((data ?? []) as Lead[]);
    setLeadSearch("");
    setLeadDialogOpen(true);
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.name.includes(projectSearch) ||
      p.project_number.includes(projectSearch) ||
      p.client?.includes(projectSearch)
  );
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.includes(customerSearch) ||
      c.representative_name?.includes(customerSearch) ||
      c.business_number?.includes(customerSearch)
  );
  const filteredLeads = leads.filter(
    (l) =>
      l.company_name.includes(leadSearch) ||
      l.contact_name.includes(leadSearch) ||
      l.phone.includes(leadSearch)
  );

  const summaryMd = meeting ? buildSummaryMarkdown(meeting) : "";

  const [viewTab, setViewTab] = useState<"summary" | "transcript">("summary");

  const handleCopySummary = async () => {
    if (!meeting) return;
    await navigator.clipboard.writeText(summaryMd);
    toast.success("요약본이 마크다운 형식으로 복사되었습니다.");
  };

  const handleCopyTranscript = async () => {
    if (!meeting?.transcript) return;
    await navigator.clipboard.writeText(meeting.transcript);
    toast.success("전사록이 복사되었습니다.");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-4xl">
          {loading ? (
            <>
              <DialogHeader>
                <DialogTitle>미팅 상세</DialogTitle>
                <DialogDescription>미팅 정보를 불러오는 중입니다.</DialogDescription>
              </DialogHeader>
              <div className="flex h-40 items-center justify-center">
                <p className="text-sm text-muted-foreground">불러오는 중...</p>
              </div>
            </>
          ) : !meeting ? (
            <>
              <DialogHeader>
                <DialogTitle>미팅 상세</DialogTitle>
                <DialogDescription>미팅을 찾을 수 없습니다.</DialogDescription>
              </DialogHeader>
              <p className="py-8 text-center text-sm text-muted-foreground">
                삭제되었거나 접근할 수 없는 항목일 수 있습니다.
              </p>
            </>
          ) : mode === "edit" ? (
            <>
              <DialogHeader>
                <DialogTitle>미팅 수정</DialogTitle>
                <DialogDescription>
                  미팅 정보와 회의록을 수정합니다.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="meeting-edit-title">미팅명</Label>
                  <Input
                    id="meeting-edit-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="미팅 제목"
                  />
                </div>

                <LinkChips
                  meeting={meeting}
                  onOpenProject={() => void openProjectDialog()}
                  onUnlinkProject={() => void handleLinkProject(null)}
                  onOpenCustomer={() => void openCustomerDialog()}
                  onUnlinkCustomer={() => void handleLinkCustomer(null)}
                  onOpenLead={() => void openLeadDialog()}
                  onUnlinkLead={() => void handleLinkLead(null)}
                />

                <div className="space-y-2">
                  <Label htmlFor="meeting-edit-summary">요약본</Label>
                  <textarea
                    id="meeting-edit-summary"
                    value={summaryDraft}
                    onChange={(e) => setSummaryDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                        e.preventDefault();
                        void handleSave();
                      }
                    }}
                    placeholder="핵심 결정사항과 후속 액션만 짧게 정리하세요. 마크다운을 사용할 수 있습니다."
                    rows={8}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meeting-edit-transcript">전사록</Label>
                  <textarea
                    id="meeting-edit-transcript"
                    value={transcriptDraft}
                    onChange={(e) => setTranscriptDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                        e.preventDefault();
                        void handleSave();
                      }
                    }}
                    placeholder="미팅에서 논의한 내용, 결정 사항, 다음 액션을 회의록으로 입력하세요."
                    rows={14}
                    className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setMode("view")}>
                  취소
                </Button>
                <Button onClick={() => void handleSave()} disabled={saving}>
                  {saving ? "저장 중..." : "저장"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>{meeting.title}</span>
                  <Badge
                    variant="outline"
                    className={
                      meeting.status === "완료"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-sky-200 bg-sky-50 text-sky-700"
                    }
                  >
                    {meeting.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {formatDate(meeting.started_at || meeting.created_at)}
                  {meeting.ended_at ? ` ~ ${formatDate(meeting.ended_at)}` : ""}
                </DialogDescription>
              </DialogHeader>

              {/* Actions + Link chips */}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={enterEditMode} disabled={deleting}>
                  <PencilLine className="h-4 w-4" />
                  수정
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "삭제 중..." : "삭제"}
                </Button>
              </div>

              <LinkChips
                meeting={meeting}
                onOpenProject={() => void openProjectDialog()}
                onUnlinkProject={() => void handleLinkProject(null)}
                onOpenCustomer={() => void openCustomerDialog()}
                onUnlinkCustomer={() => void handleLinkCustomer(null)}
                onOpenLead={() => void openLeadDialog()}
                onUnlinkLead={() => void handleLinkLead(null)}
              />

              {/* Tabs: 요약본 / 전사록 */}
              <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-background/70 p-1">
                <button
                  type="button"
                  onClick={() => setViewTab("summary")}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    viewTab === "summary"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  요약본
                </button>
                <button
                  type="button"
                  onClick={() => setViewTab("transcript")}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    viewTab === "transcript"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  전사록
                  {meeting.transcript?.trim() && (
                    <span className="ml-1.5 text-xs opacity-70">
                      {meeting.transcript.split("\n").length}줄
                    </span>
                  )}
                </button>
              </div>

              {viewTab === "summary" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground"
                      onClick={() => void handleCopySummary()}
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                      마크다운 복사
                    </Button>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-5">
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:mb-2 prose-headings:mt-4 prose-headings:font-semibold prose-p:my-1.5 prose-hr:my-3 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 first:prose-headings:mt-0">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {summaryMd}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ) : meeting.transcript?.trim() ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {meeting.transcript.split("\n").length}줄 · {meeting.transcript.length.toLocaleString()}자
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground"
                      onClick={() => void handleCopyTranscript()}
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                      복사
                    </Button>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto rounded-xl border border-border/60 bg-muted/10 p-4">
                    <pre className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                      {meeting.transcript}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
                  <p className="text-sm text-muted-foreground">등록된 전사록이 없습니다.</p>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Sub-dialogs for linking */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>프로젝트 연결</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>프로젝트 검색</Label>
              <Input
                placeholder="프로젝트명, 번호, 고객사..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
              />
            </div>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {filteredProjects.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">프로젝트가 없습니다.</p>
              ) : (
                filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                    onClick={() => void handleLinkProject(project.id)}
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {project.project_number}
                    </span>
                    <span className="font-medium">{project.name}</span>
                    {project.client ? (
                      <span className="ml-auto text-xs text-muted-foreground">{project.client}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectDialogOpen(false)}>
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>고객 연결</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>고객 검색</Label>
              <Input
                placeholder="고객명, 대표자명, 사업자번호"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            </div>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {filteredCustomers.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">고객이 없습니다.</p>
              ) : (
                filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                    onClick={() => void handleLinkCustomer(customer.id)}
                  >
                    <span className="font-medium">{customer.name}</span>
                    {customer.representative_name ? (
                      <span className="text-xs text-muted-foreground">
                        대표 {customer.representative_name}
                      </span>
                    ) : null}
                    {customer.business_number ? (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {customer.business_number}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerDialogOpen(false)}>
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leadDialogOpen} onOpenChange={setLeadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>리드 연결</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>리드 검색</Label>
              <Input
                placeholder="회사명, 담당자명, 연락처"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
              />
            </div>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {filteredLeads.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">리드가 없습니다.</p>
              ) : (
                filteredLeads.map((lead) => (
                  <button
                    key={lead.id}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                    onClick={() => void handleLinkLead(lead.id)}
                  >
                    <span className="font-medium">{lead.company_name}</span>
                    <span className="text-xs text-muted-foreground">{lead.contact_name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{lead.status}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeadDialogOpen(false)}>
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LinkChips({
  meeting,
  onOpenProject,
  onUnlinkProject,
  onOpenCustomer,
  onUnlinkCustomer,
  onOpenLead,
  onUnlinkLead,
}: {
  meeting: Meeting;
  onOpenProject: () => void;
  onUnlinkProject: () => void;
  onOpenCustomer: () => void;
  onUnlinkCustomer: () => void;
  onOpenLead: () => void;
  onUnlinkLead: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {meeting.projects ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs text-muted-foreground">
          <Link
            href={`/dashboard/projects/${meeting.project_id}`}
            className="hover:text-foreground"
          >
            프로젝트: {meeting.projects.project_number} {meeting.projects.name}
          </Link>
          <button
            type="button"
            onClick={onOpenProject}
            className="rounded-full p-0.5 hover:bg-muted"
            title="프로젝트 변경"
          >
            <PencilLine className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onUnlinkProject}
            className="rounded-full p-0.5 hover:bg-muted"
            title="프로젝트 해제"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={onOpenProject}
          className="rounded-full border border-dashed border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          + 프로젝트 연결
        </button>
      )}

      {meeting.customers ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs text-muted-foreground">
          <Link
            href={`/dashboard/customers/${meeting.customer_id}`}
            className="hover:text-foreground"
          >
            고객: {meeting.customers.name}
          </Link>
          <button
            type="button"
            onClick={onOpenCustomer}
            className="rounded-full p-0.5 hover:bg-muted"
            title="고객 변경"
          >
            <PencilLine className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onUnlinkCustomer}
            className="rounded-full p-0.5 hover:bg-muted"
            title="고객 해제"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={onOpenCustomer}
          className="rounded-full border border-dashed border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          + 고객 연결
        </button>
      )}

      {meeting.leads ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs text-muted-foreground">
          <Link
            href={`/dashboard/leads/${meeting.lead_id}`}
            className="hover:text-foreground"
          >
            리드: {meeting.leads.company_name}
          </Link>
          <button
            type="button"
            onClick={onOpenLead}
            className="rounded-full p-0.5 hover:bg-muted"
            title="리드 변경"
          >
            <PencilLine className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onUnlinkLead}
            className="rounded-full p-0.5 hover:bg-muted"
            title="리드 해제"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={onOpenLead}
          className="rounded-full border border-dashed border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          + 리드 연결
        </button>
      )}
    </div>
  );
}
