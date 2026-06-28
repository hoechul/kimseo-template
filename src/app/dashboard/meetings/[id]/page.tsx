"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { Customer, Lead, Meeting, Project } from "@/lib/types";

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  const fetchMeeting = useCallback(
    async (options?: { preserveDraft?: boolean }) => {
      const { data, error } = await supabase
        .from("meetings")
        .select("*, projects(project_number, name), customers(id, name), leads(id, company_name)")
        .eq("id", meetingId)
        .single();

      if (error) {
        console.error("미팅 조회 실패:", error.message);
        toast.error("미팅 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        setMeeting(null);
        setLoading(false);
        return;
      }

      setMeeting(data);

      if (!options?.preserveDraft) {
        setTranscriptDraft(data?.transcript ?? "");
        setSummaryDraft(data?.summary ?? "");
      }

      setLoading(false);
    },
    [meetingId, supabase]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchMeeting();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchMeeting]);

  const runAiMatch = useCallback(
    async (currentMeeting: Meeting) => {
      const needsMatch =
        !currentMeeting.project_id || !currentMeeting.customer_id || !currentMeeting.lead_id;
      const hasTranscript = (currentMeeting.transcript ?? "").trim().length > 0;

      if (!needsMatch || !hasTranscript) return;

      try {
        const res = await fetch("/api/meetings/ai-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId: currentMeeting.id }),
        });

        if (!res.ok) return;

        const result = await res.json();
        const names = result.matchedNames as Record<string, string> | undefined;

        if (names && Object.keys(names).length > 0) {
          const parts: string[] = [];
          if (names.customer) parts.push(`고객 '${names.customer}'`);
          if (names.project) parts.push(`프로젝트 '${names.project}'`);
          if (names.lead) parts.push(`리드 '${names.lead}'`);
          toast.success(`AI가 ${parts.join(", ")}을(를) 자동 연결했습니다.`);
          void fetchMeeting({ preserveDraft: true });
        }
      } catch {
        // AI 매칭 실패는 조용히 무시 (저장 자체는 성공했으므로)
      }
    },
    [fetchMeeting]
  );

  const syncMeetingToDrive = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings/drive-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.fileId) {
          setMeeting((prev) => prev ? { ...prev, drive_file_id: data.fileId } : prev);
        }
      }
    } catch {
      // Drive 동기화 실패는 조용히 무시
    }
  }, [meetingId]);

  const handleSaveTranscript = useCallback(async () => {
    if (!meeting) return false;

    const updatePayload = {
      transcript: transcriptDraft,
      summary: summaryDraft,
      status: "완료",
      ended_at: meeting.ended_at ?? new Date().toISOString(),
    };

    setSavingTranscript(true);
    const { error } = await supabase.from("meetings").update(updatePayload).eq("id", meetingId);
    setSavingTranscript(false);

    if (error) {
      console.error("미팅 저장 실패:", error.message);
      toast.error("미팅 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }

    const savedMeeting = { ...meeting, ...updatePayload };
    setMeeting((prev) => (prev ? savedMeeting : prev));
    toast.success("회의록과 요약을 저장했고 상태는 완료로 처리했습니다.");

    // 저장 성공 후 AI 자동매칭 (비동기)
    void runAiMatch(savedMeeting);

    // 프로젝트가 연결되어 있으면 Drive에 파일 동기화 (비동기)
    if (savedMeeting.project_id) {
      void syncMeetingToDrive();
    }

    return true;
  }, [meeting, meetingId, summaryDraft, supabase, transcriptDraft, runAiMatch, syncMeetingToDrive]);

  const handleDelete = async () => {
    if (!confirm("이 미팅 기록을 삭제하시겠습니까?")) return;

    setDeleting(true);
    const { error } = await supabase.from("meetings").delete().eq("id", meetingId);

    if (error) {
      console.error("미팅 삭제 실패:", error.message);
      toast.error("미팅 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setDeleting(false);
      return;
    }

    sendLog("DELETE_MEETING", `미팅 삭제: ${meeting?.title}`, {
      resource: "meeting",
      resource_id: meetingId,
    });
    router.push("/dashboard/meetings");
  };

  const handleLinkProject = async (projectId: string | null) => {
    const { error } = await supabase
      .from("meetings")
      .update({ project_id: projectId })
      .eq("id", meetingId);

    if (error) {
      console.error("프로젝트 연결 변경 실패:", error.message);
      toast.error("프로젝트 연결 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setProjectDialogOpen(false);
    void fetchMeeting({ preserveDraft: true });

    // 프로젝트가 연결되고 전사록/요약이 있으면 Drive 동기화
    if (projectId && (transcriptDraft.trim() || summaryDraft.trim())) {
      void syncMeetingToDrive();
    }
  };

  const handleLinkCustomer = async (customerId: string | null) => {
    const { error } = await supabase
      .from("meetings")
      .update({ customer_id: customerId })
      .eq("id", meetingId);

    if (error) {
      console.error("고객 연결 변경 실패:", error.message);
      toast.error("고객 연결 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setCustomerDialogOpen(false);
    void fetchMeeting({ preserveDraft: true });
  };

  const openProjectDialog = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("프로젝트 목록 조회 실패:", error.message);
      toast.error("프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
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
      .order("name")
      .limit(500);

    if (error) {
      console.error("고객 목록 조회 실패:", error.message);
      toast.error("고객 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setCustomers((data ?? []) as Customer[]);
    setCustomerSearch("");
    setCustomerDialogOpen(true);
  };

  const handleLinkLead = async (leadId: string | null) => {
    const { error } = await supabase
      .from("meetings")
      .update({ lead_id: leadId })
      .eq("id", meetingId);

    if (error) {
      console.error("리드 연결 변경 실패:", error.message);
      toast.error("리드 연결 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setLeadDialogOpen(false);
    void fetchMeeting({ preserveDraft: true });
  };

  const openLeadDialog = async () => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("리드 목록 조회 실패:", error.message);
      toast.error("리드 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setLeads((data ?? []) as Lead[]);
    setLeadSearch("");
    setLeadDialogOpen(true);
  };

  const handleTitleSave = async () => {
    const nextTitle = editTitle.trim();
    if (!nextTitle) return;

    const { error } = await supabase
      .from("meetings")
      .update({ title: nextTitle })
      .eq("id", meetingId);

    if (error) {
      console.error("미팅명 저장 실패:", error.message);
      toast.error("미팅명 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setMeeting((prev) => (prev ? { ...prev, title: nextTitle } : prev));
    setTitleEditing(false);
  };

  const handleResetDraft = () => {
    setTranscriptDraft(meeting?.transcript ?? "");
    setSummaryDraft(meeting?.summary ?? "");
  };

  const getMeetingDisplayDate = (value: string | null | undefined) => value ?? meeting?.created_at ?? "";

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  if (loading) {
    return <LoadingState title="미팅 정보를 불러오는 중입니다." />;
  }

  if (!meeting) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">미팅을 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/meetings")}>
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  const filteredProjects = projects.filter(
    (project) =>
      project.name.includes(projectSearch) ||
      project.project_number.includes(projectSearch) ||
      project.client?.includes(projectSearch)
  );
  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.includes(customerSearch) ||
      customer.representative_name?.includes(customerSearch) ||
      customer.business_number?.includes(customerSearch)
  );
  const filteredLeads = leads.filter(
    (lead) =>
      lead.company_name.includes(leadSearch) ||
      lead.contact_name.includes(leadSearch) ||
      lead.phone.includes(leadSearch)
  );
  const draftLineCount = transcriptDraft ? transcriptDraft.split("\n").length : 0;
  const hasDraftChanges =
    transcriptDraft !== (meeting.transcript ?? "") || summaryDraft !== (meeting.summary ?? "");
  const isBusy = savingTranscript;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/meetings"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              미팅관리
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm font-medium">{mask("title", meeting.title)}</span>
          </div>
          {titleEditing ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                className="h-9 w-full text-xl font-bold sm:w-80"
                onKeyDown={(event) => event.key === "Enter" && handleTitleSave()}
                autoFocus
              />
              <Button size="sm" onClick={handleTitleSave}>
                저장
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTitleEditing(false)}>
                취소
              </Button>
            </div>
          ) : (
            <h3
              className="cursor-pointer text-xl font-semibold tracking-tight transition-colors hover:text-muted-foreground sm:text-2xl"
              onClick={() => {
                setEditTitle(meeting.title);
                setTitleEditing(true);
              }}
            >
              {mask("title", meeting.title)}
            </h3>
          )}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 sm:flex-none"
          >
            {deleting ? "삭제 중..." : "삭제"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">시작 시간</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{formatDate(getMeetingDisplayDate(meeting.started_at))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">종료 시간</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {meeting.ended_at ? formatDate(getMeetingDisplayDate(meeting.ended_at)) : "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">연결 프로젝트</CardTitle>
          </CardHeader>
          <CardContent>
            {meeting.projects ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href={`/dashboard/projects/${meeting.project_id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {meeting.projects.project_number} {mask("title", meeting.projects.name)}
                </Link>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={openProjectDialog}
                  >
                    변경
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleLinkProject(null)}
                  >
                    해제
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={openProjectDialog}>
                프로젝트 연결
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">연결 고객</CardTitle>
          </CardHeader>
          <CardContent>
            {meeting.customers ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href={`/dashboard/customers/${meeting.customer_id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {mask("customer_name", meeting.customers.name)}
                </Link>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={openCustomerDialog}
                  >
                    변경
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleLinkCustomer(null)}
                  >
                    해제
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={openCustomerDialog}>
                고객 연결
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">연결 리드</CardTitle>
          </CardHeader>
          <CardContent>
            {meeting.leads ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href={`/dashboard/leads/${meeting.lead_id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {mask("customer_name", meeting.leads.company_name)}
                </Link>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={openLeadDialog}
                  >
                    변경
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleLinkLead(null)}
                  >
                    해제
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={openLeadDialog}>
                리드 연결
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">회의록</CardTitle>
            <p className="text-sm text-muted-foreground">
              미팅 내용을 직접 입력하고 저장합니다. 저장하면 상태는 자동으로 완료 처리됩니다.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{draftLineCount}줄</span>
            <span>{transcriptDraft.length.toLocaleString()}자</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={transcriptDraft}
            onChange={(event) => {
              setTranscriptDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                if (!hasDraftChanges || isBusy) return;
                void handleSaveTranscript();
              }
            }}
            placeholder="미팅에서 논의한 내용, 결정 사항, 다음 액션을 회의록으로 입력하세요."
            rows={10}
            className="flex min-h-[200px] sm:min-h-[320px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="space-y-2">
            <Label htmlFor="meeting-summary">요약본</Label>
            <textarea
              id="meeting-summary"
              value={summaryDraft}
              onChange={(event) => setSummaryDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                  event.preventDefault();
                  if (!hasDraftChanges || isBusy) return;
                  void handleSaveTranscript();
                }
              }}
              placeholder="핵심 결정사항과 후속 액션만 짧게 정리하세요."
              rows={6}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {hasDraftChanges
                ? "아직 저장되지 않은 변경사항이 있습니다."
                : "현재 회의록과 요약본이 저장되어 있습니다. Ctrl+S로도 저장할 수 있습니다."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleResetDraft}
                disabled={!hasDraftChanges || isBusy}
              >
                되돌리기
              </Button>
              <Button onClick={() => void handleSaveTranscript()} disabled={!hasDraftChanges || isBusy}>
                {savingTranscript ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
                onChange={(event) => setProjectSearch(event.target.value)}
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
                    onClick={() => handleLinkProject(project.id)}
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {project.project_number}
                    </span>
                    <span className="font-medium">{mask("title", project.name)}</span>
                    {project.client ? (
                      <span className="ml-auto text-xs text-muted-foreground">{mask("customer_name", project.client)}</span>
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
                onChange={(event) => setCustomerSearch(event.target.value)}
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
                    onClick={() => handleLinkCustomer(customer.id)}
                  >
                    <span className="font-medium">{mask("customer_name", customer.name)}</span>
                    {customer.representative_name ? (
                      <span className="text-xs text-muted-foreground">
                        대표 {mask("name", customer.representative_name)}
                      </span>
                    ) : null}
                    {customer.business_number ? (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {mask("business_number", customer.business_number)}
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
                onChange={(event) => setLeadSearch(event.target.value)}
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
                    onClick={() => handleLinkLead(lead.id)}
                  >
                    <span className="font-medium">{mask("customer_name", lead.company_name)}</span>
                    <span className="text-xs text-muted-foreground">{mask("name", lead.contact_name)}</span>
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
    </div>
  );
}
