"use client";

import { CirclePlay, FileText, Link2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { MeetingDetailDialog } from "@/components/meeting-detail-dialog";
import { useMasking } from "@/components/masking-provider";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  PageToolbar,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead, sortData, useSortState } from "@/components/ui/sortable-table-head";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/lib/use-is-mobile";
import type { Meeting } from "@/lib/types";

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [detailMeetingId, setDetailMeetingId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isMobile = useIsMobile();
  const { sort, toggle } = useSortState();
  const { mask } = useMasking();

  const handleMeetingClick = (meetingId: string) => {
    if (isMobile) {
      router.push(`/dashboard/meetings/${meetingId}`);
      return;
    }
    setDetailMeetingId(meetingId);
    setDetailOpen(true);
  };

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    setError(false);

    await supabase.auth.getSession();

    const { data, error: fetchError } = await supabase
      .from("meetings")
      .select("*, projects(project_number, name), customers(id, name)")
      .order("started_at", { ascending: false })
      .limit(1000);

    if (fetchError) {
      console.error("미팅 목록 조회 실패:", fetchError.message);
      toast.error("미팅 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setMeetings([]);
      setError(true);
      setLoading(false);
      return;
    }

    setMeetings(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchMeetings();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchMeetings]);

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-meetings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meetings" },
        () => {
          void fetchMeetings();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchMeetings, supabase]);

  const handleStartMeeting = async () => {
    const title = `미팅 ${new Date().toLocaleDateString("ko-KR")} ${new Date().toLocaleTimeString(
      "ko-KR",
      { hour: "2-digit", minute: "2-digit" }
    )}`;

    const { data, error: insertError } = await supabase
      .from("meetings")
      .insert({ title, status: "진행중", transcript: "", summary: "" })
      .select()
      .single();

    if (insertError) {
      console.error("미팅 생성 실패:", insertError.message);
      toast.error("미팅 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    router.push(`/dashboard/meetings/${data.id}`);
  };

  const keyword = search.trim();
  const filtered = useMemo(
    () =>
      meetings.filter((meeting) => {
        if (!keyword) return true;

        return (
          meeting.title.includes(keyword) ||
          meeting.customers?.name?.includes(keyword) ||
          meeting.projects?.name?.includes(keyword) ||
          meeting.projects?.project_number?.includes(keyword)
        );
      }),
    [meetings, keyword]
  );

  const sorted = useMemo(
    () =>
      sortData(filtered, sort, (item, key) => {
        switch (key) {
          case "title":
            return item.title;
          case "project":
            return item.projects?.name;
          case "customer":
            return item.customers?.name;
          case "started_at":
            return item.started_at || item.created_at;
          case "transcript":
            return item.transcript?.split("\n").length ?? 0;
          default:
            return null;
        }
      }),
    [filtered, sort]
  );

  const getMeetingDisplayDate = (meeting: Meeting) => meeting.started_at || meeting.created_at;

  const formatDate = (value: string) => {
    const date = new Date(value);
    return date.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const linkedProjectCount = useMemo(
    () => meetings.filter((meeting) => meeting.projects).length,
    [meetings]
  );
  const linkedCustomerCount = useMemo(
    () => meetings.filter((meeting) => meeting.customers).length,
    [meetings]
  );
  const transcriptLineCount = useMemo(
    () =>
      meetings.reduce(
        (sum, meeting) => sum + (meeting.transcript ? meeting.transcript.split("\n").length : 0),
        0
      ),
    [meetings]
  );

  return (
    <PageShell>
      <PageHeader
        title="미팅 관리"
        funKey="meetings"
        description="회의록과 프로젝트 연결 정보를 한 화면에서 빠르게 정리합니다."
        actions={
          <Button onClick={handleStartMeeting}>
            <CirclePlay className="h-4 w-4" />
            미팅 추가
          </Button>
        }
      />

      <StatsGrid>
        <StatCard
          label="전체 미팅"
          value={`${meetings.length}건`}
          description="등록된 미팅 기록"
          icon={FileText}
        />
        <StatCard
          label="프로젝트 연결"
          value={`${linkedProjectCount}건`}
          description="프로젝트와 연결된 미팅"
          icon={Link2}
          tone="info"
        />
        <StatCard
          label="고객 연결"
          value={`${linkedCustomerCount}건`}
          description="고객과 연결된 미팅"
          icon={Link2}
          tone="info"
        />
        <StatCard
          label="기록 줄 수"
          value={`${transcriptLineCount.toLocaleString()}줄`}
          description="누적 회의록 줄 수"
          icon={FileText}
          tone="success"
        />
      </StatsGrid>

      <PageToolbar>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="미팅명, 프로젝트명, 프로젝트 번호 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full sm:max-w-sm"
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{filtered.length}건 표시 중</span>
            {search ? (
              <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                초기화
              </Button>
            ) : null}
          </div>
        </div>
      </PageToolbar>

      {loading ? (
        <LoadingState
          title="미팅 목록을 불러오는 중입니다."
          description="연결된 프로젝트와 회의록 정보도 함께 가져오고 있습니다."
        />
      ) : error ? (
        <ErrorState
          description="미팅 데이터를 다시 불러오지 못했습니다."
          onRetry={() => void fetchMeetings()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={meetings.length === 0 ? "미팅 기록이 없습니다." : "검색 조건에 맞는 미팅이 없습니다."}
          description={
            meetings.length === 0
              ? "새 미팅을 추가한 뒤 회의록을 바로 입력할 수 있습니다."
              : "검색어를 조정하거나 초기화해 다시 확인해보세요."
          }
          action={
            meetings.length === 0 ? (
              <Button size="sm" onClick={handleStartMeeting}>
                <CirclePlay className="h-4 w-4" />
                미팅 추가
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                검색 초기화
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {sorted.map((meeting) => (
              <button
                key={meeting.id}
                className="surface-subtle p-3 sm:p-4 text-left transition-transform hover:-translate-y-0.5"
                onClick={() => handleMeetingClick(meeting.id)}
              >
                <div className="mb-2">
                  <p className="font-medium">{mask("title", meeting.title)}</p>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>미팅 일시: {formatDate(getMeetingDisplayDate(meeting))}</p>
                  <p>
                    프로젝트:{" "}
                    {meeting.projects
                      ? `${meeting.projects.project_number} ${mask("title", meeting.projects.name)}`
                      : "-"}
                  </p>
                  <p>고객: {meeting.customers?.name ? mask("customer_name", meeting.customers.name) : "-"}</p>
                  <p>회의록: {meeting.transcript ? `${meeting.transcript.split("\n").length}줄` : "-"}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="surface-panel hidden overflow-hidden p-1 md:block">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="started_at" currentSort={sort} onSort={toggle}>
                    미팅 일시
                  </SortableTableHead>
                  <SortableTableHead sortKey="title" currentSort={sort} onSort={toggle}>
                    미팅명
                  </SortableTableHead>
                  <SortableTableHead sortKey="project" currentSort={sort} onSort={toggle}>
                    연결 프로젝트
                  </SortableTableHead>
                  <SortableTableHead sortKey="customer" currentSort={sort} onSort={toggle}>
                    연결 고객
                  </SortableTableHead>
                  <SortableTableHead sortKey="transcript" currentSort={sort} onSort={toggle}>
                    회의록
                  </SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((meeting) => (
                  <TableRow
                    key={meeting.id}
                    className="cursor-pointer"
                    onClick={() => handleMeetingClick(meeting.id)}
                  >
                    <TableCell className="text-sm">{formatDate(getMeetingDisplayDate(meeting))}</TableCell>
                    <TableCell className="max-w-[200px] truncate font-medium">{mask("title", meeting.title)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {meeting.projects ? (
                        <span className="text-sm">
                          <span className="font-mono text-xs text-muted-foreground">
                            {meeting.projects.project_number}
                          </span>{" "}
                          {mask("title", meeting.projects.name)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate text-sm">
                      {meeting.customers ? (
                        <span>{mask("customer_name", meeting.customers.name)}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {meeting.transcript ? `${meeting.transcript.split("\n").length}줄` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
        </>
      )}
      <MeetingDetailDialog
        meetingId={detailMeetingId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={fetchMeetings}
        onDeleted={fetchMeetings}
      />
    </PageShell>
  );
}
