"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ExternalLink,
  Mail,
  MoreHorizontal,
  UsersRound,
  WalletCards,
} from "lucide-react";
import DOMPurify from "isomorphic-dompurify";
import { toast } from "sonner";
import { DriveFileBrowser } from "@/components/drive-file-browser";
import { NavBackHint } from "@/components/nav-history";
import { ErrorState, LoadingState, PageHeader, PageShell, StatCard, StatsGrid } from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { ProjectDialog } from "@/components/project-dialog";
import {
  type ProjectNoteEditorValues,
  ProjectNoteDialog,
} from "@/components/project-note-dialog";
import { ExpenseQuickAddDialog } from "@/components/expenses/expense-quick-add-dialog";
import { RevenueDialog } from "@/components/revenue-dialog";
import { RevenueDetailDialog } from "@/components/revenue-detail-dialog";
import { ScheduleDialog } from "@/components/schedule-dialog";
import { TaskCreateDialog } from "@/components/task-create-dialog";
import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { TasksGanttView } from "@/components/tasks/tasks-gantt-view";
import { computeProjectProgress } from "@/lib/tasks/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sendLog } from "@/lib/log-client";
import { attachProjectAssignees, getProjectAssigneeNames } from "@/lib/project-assignees";
import { getTaskAssigneeLabel, TASK_WITH_ASSIGNEES_SELECT } from "@/lib/task-assignees";
import { createClient, warmupSession } from "@/lib/supabase/client";
import { normalizeTaskStatus, normalizeTaskStatuses } from "@/lib/task-status";
import type { GmailMessage } from "@/lib/gmail";
import type {
  Customer,
  Employee,
  Expense,
  ExpenseInsert,
  ExpenseType,
  Meeting,
  Note,
  Project,
  ProjectInsert,
  ProjectNote,
  ProjectType,
  Revenue,
  RevenueInsert,
  Schedule,
  ScheduleCategoryItem,
  ScheduleInsert,
  RecurrenceType,
  ScheduleRecurrenceActionScope,
  Task,
} from "@/lib/types";

function hasValidScheduleRange(startAt: string, endAt: string) {
  return new Date(endAt).getTime() > new Date(startAt).getTime();
}

const getProjectStatusVariant = (
  status: string
): "default" | "secondary" | "outline" | "destructive" => {
  if (status === "진행중") return "default";
  if (status === "완료") return "secondary";
  if (status === "취소") return "destructive";
  return "outline";
};

const projectNoteDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const PROJECT_NOTE_ALLOWED_TAGS = [
  "p", "br", "b", "strong", "i", "em", "u", "s", "a", "div", "span",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "pre", "code",
  "img", "hr",
];
const PROJECT_NOTE_ALLOWED_ATTR = [
  "href", "target", "rel", "src", "alt", "width", "height", "style", "class",
];

function escapeProjectNoteHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderProjectNoteContent(raw: string) {
  if (/<[a-z][\s\S]*>/i.test(raw)) {
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: PROJECT_NOTE_ALLOWED_TAGS,
      ALLOWED_ATTR: PROJECT_NOTE_ALLOWED_ATTR,
    });
  }

  const markdownImage = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  const withImages = raw.replace(markdownImage, (_, alt: string, url: string) => {
    return `<img src="${escapeProjectNoteHtml(url)}" alt="${escapeProjectNoteHtml(alt)}" />`;
  });
  const blocks = withImages
    .split(/\n{2,}/)
    .map((block) => {
      if (block.includes("<img")) return block;
      return `<p>${escapeProjectNoteHtml(block).replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
  return DOMPurify.sanitize(blocks, {
    ALLOWED_TAGS: PROJECT_NOTE_ALLOWED_TAGS,
    ALLOWED_ATTR: PROJECT_NOTE_ALLOWED_ATTR,
  });
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const isMountedRef = useRef(true);
  const { mask } = useMasking();

  const [project, setProject] = useState<Project | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [linkedNotes, setLinkedNotes] = useState<Note[]>([]);
  const [scheduleCategories, setScheduleCategories] = useState<ScheduleCategoryItem[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [editDialogLoading, setEditDialogLoading] = useState(false);
  const [editDialogDataLoaded, setEditDialogDataLoaded] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [revenueDialogOpen, setRevenueDialogOpen] = useState(false);
  const [editingRevenue, setEditingRevenue] = useState<Revenue | null>(null);
  const [revenueDetailOpen, setRevenueDetailOpen] = useState(false);
  const [selectedRevenue, setSelectedRevenue] = useState<Revenue | null>(null);
  const [deletingRevenue, setDeletingRevenue] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<ProjectNote | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [currentEmployeeName, setCurrentEmployeeName] = useState<string | null>(null);
  const [contactMails, setContactMails] = useState<GmailMessage[]>([]);
  const [mailsLoading, setMailsLoading] = useState(false);
  const [taskViewMode, setTaskViewMode] = useState<"gantt" | "list">("gantt");
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleOpenTaskDetail = useCallback((taskId: string) => {
    setDetailTaskId(taskId);
    setDetailOpen(true);
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("dashboard.project-tasks.view");
      if (stored === "list" || stored === "gantt") {
        setTaskViewMode(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleChangeTaskView = useCallback((next: "gantt" | "list") => {
    setTaskViewMode(next);
    try {
      window.localStorage.setItem("dashboard.project-tasks.view", next);
    } catch {
      // ignore
    }
  }, []);

  const refreshNotes = useCallback(async () => {
    const { data, error } = await supabase
      .from("project_notes")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("메모 목록 갱신 실패:", error.message);
      toast.error("메모 목록을 갱신하지 못했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }

    setNotes((data ?? []) as ProjectNote[]);
    return true;
  }, [projectId, supabase]);

  const refreshTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select(TASK_WITH_ASSIGNEES_SELECT)
      .eq("project_id", projectId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true });

    if (!isMountedRef.current) {
      return;
    }

    if (error) {
      console.error("할일 목록 조회 실패:", error.message);
      toast.error("할일 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setTasks(normalizeTaskStatuses((data ?? []) as Task[]) as Task[]);
  }, [projectId, supabase]);

  const fetchData = useCallback(async () => {
    setLoading(true);

    await warmupSession(supabase);

    const [
      projectRes,
      employeesRes,
      categoryRes,
      revenueRes,
      expenseRes,
      expenseTypeRes,
      scheduleRes,
      taskRes,
      noteRes,
      linkedNoteRes,
      meetingRes,
      assigneeRes,
    ] = await Promise.all([
      supabase
        .from("projects")
        .select("*, customers(id, name, business_number, drive_folder_id), project_types(id, name)")
        .eq("id", projectId)
        .single(),
      supabase.from("employees").select("id, name, department").order("name").limit(500),
      supabase
        .from("schedule_categories")
        .select("id, value, label, color, sort_order")
        .order("sort_order", { ascending: true })
        .limit(500),
      supabase
        .from("revenues")
        .select("*")
        .eq("project_id", projectId)
        .order("revenue_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("expenses")
        .select("*, expense_types(id, name)")
        .eq("project_id", projectId)
        .order("purchase_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase.from("expense_types").select("*").order("sort_order"),
      supabase
        .from("schedules")
        .select(
          "*, creator:employees!created_by(id, name), attendees:schedule_attendees(id, schedule_id, employee_id, created_at, employees(id, name, department))"
        )
        .eq("project_id", projectId)
        .order("start_at", { ascending: true }),
      supabase
        .from("tasks")
        .select(TASK_WITH_ASSIGNEES_SELECT)
        .eq("project_id", projectId)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("sort_order", { ascending: true }),
      supabase
        .from("project_notes")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("notes")
        .select("*, customers:customer_id(id, name)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("meetings")
        .select("*")
        .eq("project_id", projectId)
        .order("started_at", { ascending: false }),
      supabase
        .from("project_assignees")
        .select("id, project_id, employee_id, created_at, employees(id, name, department)")
        .eq("project_id", projectId),
    ]);

    if (!isMountedRef.current) {
      return;
    }

    if (projectRes.error) { console.error("프로젝트 조회 실패:", projectRes.error.message); toast.error("프로젝트 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (employeesRes.error) { console.error("직원 목록 조회 실패:", employeesRes.error.message); toast.error("직원 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (categoryRes.error) { console.error("일정 유형 조회 실패:", categoryRes.error.message); toast.error("일정 유형을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (revenueRes.error) { console.error("매출 목록 조회 실패:", revenueRes.error.message); toast.error("매출 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (expenseRes.error) { console.error("매입 목록 조회 실패:", expenseRes.error.message); toast.error("매입 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (scheduleRes.error) { console.error("일정 목록 조회 실패:", scheduleRes.error.message); toast.error("일정 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (taskRes.error) { console.error("할일 목록 조회 실패:", taskRes.error.message); toast.error("할일 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (meetingRes.error) { console.error("미팅 목록 조회 실패:", meetingRes.error.message); toast.error("미팅 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (assigneeRes.error) { console.error("프로젝트 담당자 조회 실패:", assigneeRes.error.message); toast.error("프로젝트 담당자를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }

    if (noteRes.error) { console.error("메모 조회 실패:", noteRes.error.message); toast.error("메모를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (linkedNoteRes.error) { console.error("연결된 메모 조회 실패:", linkedNoteRes.error.message); }

    setProject(
      projectRes.data ? attachProjectAssignees([projectRes.data], assigneeRes.data ?? [])[0] : null
    );
    setEmployees((employeesRes.data ?? []) as Employee[]);
    setScheduleCategories((categoryRes.data ?? []) as ScheduleCategoryItem[]);
    setRevenues((revenueRes.data ?? []) as Revenue[]);
    setExpenses((expenseRes.data ?? []) as Expense[]);
    setExpenseTypes((expenseTypeRes.data ?? []) as ExpenseType[]);
    setSchedules((scheduleRes.data ?? []) as Schedule[]);
    setTasks(normalizeTaskStatuses((taskRes.data ?? []) as Task[]) as Task[]);
    setNotes((noteRes.data ?? []) as ProjectNote[]);
    setLinkedNotes((linkedNoteRes.data ?? []) as Note[]);
    setMeetings((meetingRes.data ?? []) as Meeting[]);
    setLoading(false);

    // 프로젝트 연결 고객의 담당자 이메일로 관련 메일 조회
    const customerId = projectRes.data?.customer_id;
    if (customerId) {
      const { data: contactsData } = await supabase
        .from("customer_contacts")
        .select("email")
        .eq("customer_id", customerId);
      const contactEmails = (contactsData ?? [])
        .map((c) => c.email)
        .filter(Boolean) as string[];
      if (contactEmails.length > 0) {
        setMailsLoading(true);
        try {
          const q = contactEmails.map((e) => `from:${e} OR to:${e}`).join(" OR ");
          const mailRes = await fetch(`/api/gmail/messages?q=${encodeURIComponent(q)}`);
          const mailData = await mailRes.json();
          if (!mailData.error) setContactMails(mailData.messages ?? []);
        } catch {
          // 메일 연동 안 된 경우 무시
        } finally {
          setMailsLoading(false);
        }
      }
    }
  }, [projectId, supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const loadEditDialogData = useCallback(async () => {
    if (editDialogDataLoaded) return true;
    const [customersRes, typesRes] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name, business_number, representative_name")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("project_types")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true })
        .limit(500),
    ]);

    if (customersRes.error) {
      console.error("고객 목록 조회 실패:", customersRes.error.message);
      toast.error("고객 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }
    if (typesRes.error) {
      console.error("유형 목록 조회 실패:", typesRes.error.message);
      toast.error("유형 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }

    setCustomers((customersRes.data ?? []) as Customer[]);
    setProjectTypes((typesRes.data ?? []) as ProjectType[]);
    setEditDialogDataLoaded(true);
    return true;
  }, [editDialogDataLoaded, supabase]);

  const handleOpenEditDialog = useCallback(async () => {
    if (editDialogDataLoaded) {
      setProjectDialogOpen(true);
      return;
    }
    setEditDialogLoading(true);
    const ok = await loadEditDialogData();
    setEditDialogLoading(false);
    if (ok) setProjectDialogOpen(true);
  }, [editDialogDataLoaded, loadEditDialogData]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("employees")
        .select("id, name")
        .eq("auth_uid", user.id)
        .single()
        .then(({ data: employee }) => {
          if (employee) {
            setCurrentEmployeeId(employee.id);
            setCurrentEmployeeName(employee.name);
          }
        });
    });
  }, [supabase]);

  const handleAddNote = () => {
    setSelectedNote(null);
    setNoteDialogOpen(true);
  };

  const handleEditNote = (note: ProjectNote) => {
    setSelectedNote(note);
    setNoteDialogOpen(true);
  };

  const handleAddRevenue = () => {
    setEditingRevenue(null);
    setRevenueDialogOpen(true);
  };

  const refreshRevenues = useCallback(async () => {
    const { data, error } = await supabase
      .from("revenues")
      .select("*")
      .eq("project_id", projectId)
      .order("revenue_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("매출 목록 갱신 실패:", error.message);
      return;
    }
    setRevenues((data ?? []) as Revenue[]);
  }, [projectId, supabase]);

  const handleSaveRevenue = async (data: RevenueInsert) => {
    const isRefundRevenue = data.total_amount < 0;
    const cleaned = {
      ...data,
      project_id: projectId,
      revenue_date: data.revenue_date || null,
      expected_payment_date: data.expected_payment_date || null,
      paid_date: data.is_paid ? data.paid_date || null : null,
      is_tax_invoice_issued: isRefundRevenue ? false : data.is_tax_invoice_issued,
      tax_invoice_not_required: isRefundRevenue ? true : data.tax_invoice_not_required,
      tax_invoice_date:
        !isRefundRevenue && data.is_tax_invoice_issued ? data.tax_invoice_date || null : null,
      memo: data.memo || null,
    };

    if (editingRevenue) {
      const { data: updated, error } = await supabase
        .from("revenues")
        .update(cleaned)
        .eq("id", editingRevenue.id)
        .select("*")
        .single();
      if (error) {
        console.error("매출 수정 실패:", error.message);
        toast.error("매출 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
        throw error;
      }

      toast.success("매출이 수정되었습니다.");
      sendLog("UPDATE_REVENUE", `매출 수정: ${data.title}`, {
        resource: "revenue",
        resource_id: editingRevenue.id,
      });
      await refreshRevenues();
      setEditingRevenue(null);
      if (updated) {
        setSelectedRevenue(updated as Revenue);
        setRevenueDetailOpen(true);
      }
      return;
    }

    const { data: inserted, error } = await supabase.from("revenues").insert(cleaned).select("id").single();
    if (error) {
      console.error("매출 등록 실패:", error.message);
      toast.error("매출 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
      throw error;
    }

    toast.success("매출이 등록되었습니다.");
    sendLog("CREATE_REVENUE", `매출 등록: ${data.title}`, {
      resource: "revenue",
      resource_id: inserted.id,
    });
    await refreshRevenues();
  };

  const handleOpenRevenue = useCallback(
    (revenueId: string) => {
      const target = revenues.find((r) => r.id === revenueId);
      if (!target) return;
      setSelectedRevenue(target);
      setRevenueDetailOpen(true);
    },
    [revenues]
  );

  const handleEditRevenueFromDetail = useCallback(() => {
    if (!selectedRevenue) return;
    setEditingRevenue(selectedRevenue);
    setRevenueDetailOpen(false);
    setRevenueDialogOpen(true);
  }, [selectedRevenue]);

  const handleDeleteRevenueFromDetail = useCallback(async () => {
    if (!selectedRevenue) return;
    if (!confirm("이 매출 항목을 삭제하시겠습니까?")) return;

    setDeletingRevenue(true);
    const { error } = await supabase
      .from("revenues")
      .delete()
      .eq("id", selectedRevenue.id);

    if (error) {
      console.error("매출 삭제 실패:", error.message);
      toast.error("매출 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setDeletingRevenue(false);
      return;
    }

    toast.success("매출 항목을 삭제했습니다.");
    sendLog("DELETE_REVENUE", `매출 삭제: ${selectedRevenue.title}`, {
      resource: "revenue",
      resource_id: selectedRevenue.id,
    });
    setDeletingRevenue(false);
    setRevenueDetailOpen(false);
    setSelectedRevenue(null);
    await refreshRevenues();
  }, [refreshRevenues, selectedRevenue, supabase]);

  const handleAddExpense = () => {
    setExpenseDialogOpen(true);
  };

  const refreshExpenses = useCallback(async () => {
    const { data, error } = await supabase
      .from("expenses")
      .select("*, expense_types(id, name)")
      .eq("project_id", projectId)
      .order("purchase_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("매입 목록 갱신 실패:", error.message);
      return;
    }
    setExpenses((data ?? []) as Expense[]);
  }, [projectId, supabase]);

  const handleSaveExpense = async (data: ExpenseInsert) => {
    const cleaned: ExpenseInsert = {
      ...data,
      project_id: projectId,
      type_id: data.type_id || null,
      vendor_name: data.vendor_name?.trim() ? data.vendor_name.trim() : null,
      purchase_date: data.purchase_date || null,
      payment_date: data.payment_date || null,
      purchase_tax_invoice_received: data.purchase_tax_invoice_not_required
        ? false
        : data.purchase_tax_invoice_received,
      purchase_tax_invoice_date:
        !data.purchase_tax_invoice_not_required && data.purchase_tax_invoice_received
          ? data.purchase_tax_invoice_date || null
          : null,
      memo: data.memo || null,
    };

    const { data: inserted, error } = await supabase
      .from("expenses")
      .insert(cleaned)
      .select("id")
      .single();

    if (error) {
      console.error("매입 등록 실패:", error.message);
      toast.error("매입 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
      throw error;
    }

    toast.success("매입이 등록되었습니다.");
    sendLog("CREATE_EXPENSE", `매입 등록: ${data.title}`, {
      resource: "expense",
      resource_id: inserted.id,
    });
    await refreshExpenses();
  };

  const handleOpenExpense = useCallback(
    (expenseId: string) => {
      router.push(`/dashboard/expenses/${expenseId}`);
    },
    [router]
  );

  const handleDeleteProject = async () => {
    if (!confirm("프로젝트를 삭제하시겠습니까?")) return;

    setDeleting(true);
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) {
      console.error("프로젝트 삭제 실패:", error.message);
      toast.error("프로젝트 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setDeleting(false);
      return;
    }

    toast.success("프로젝트가 삭제되었습니다.");
    sendLog("DELETE_PROJECT", `프로젝트 삭제: ${project?.name}`, {
      resource: "project",
      resource_id: projectId,
    });
    router.push("/dashboard/projects");
  };

  const handleSaveProject = async (data: ProjectInsert, assigneeIds: string[]) => {
    const selectedCustomer = customers.find((customer) => customer.id === data.customer_id);
    const cleaned = {
      ...data,
      customer_id: data.customer_id || null,
      type_id: data.type_id || null,
      client: selectedCustomer?.name || data.client || null,
      description: data.description || null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
    };

    // 유형이 변경되었고 Drive 폴더가 있으면 폴더 이동
    const typeChanged = project && cleaned.type_id !== project.type_id;
    if (typeChanged && project.drive_folder_id) {
      try {
        // 이전 유형 폴더 ID (null이면 API가 루트 반환)
        const oldRes = await fetch("/api/drive/type-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typeId: project.type_id }),
        });
        if (!oldRes.ok) {
          const errData = await oldRes.json().catch(() => null);
          console.error("이전 유형 폴더 조회 실패:", errData);
        }
        const fromFolderId = oldRes.ok ? (await oldRes.json()).driveFolderId : null;

        // 새 유형 폴더 ID (null이면 API가 루트 반환)
        const newRes = await fetch("/api/drive/type-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typeId: cleaned.type_id }),
        });
        if (!newRes.ok) {
          const errData = await newRes.json().catch(() => null);
          console.error("새 유형 폴더 조회 실패:", errData);
        }
        const toFolderId = newRes.ok ? (await newRes.json()).driveFolderId : null;

        if (fromFolderId && toFolderId && fromFolderId !== toFolderId) {
          const moveRes = await fetch("/api/drive/move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileIds: [project.drive_folder_id],
              fromFolderId,
              toFolderId,
            }),
          });
          if (!moveRes.ok) {
            const errData = await moveRes.json().catch(() => null);
            console.error("Drive 폴더 이동 실패:", errData);
            toast.warning("프로젝트 유형이 변경되었지만 Drive 폴더 이동에 실패했습니다.");
          }
        } else {
          console.warn("폴더 이동 스킵:", { fromFolderId, toFolderId, driveFolderId: project.drive_folder_id });
        }
      } catch (err) {
        console.error("Drive 폴더 이동 중 오류:", err);
        toast.warning("프로젝트 유형이 변경되었지만 Drive 폴더 이동에 실패했습니다.");
      }
    }

    const { error: updateError } = await supabase.from("projects").update(cleaned).eq("id", projectId);
    if (updateError) {
      console.error("프로젝트 수정 실패:", updateError.message);
      toast.error("프로젝트 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const { error: deleteAssigneeError } = await supabase
      .from("project_assignees")
      .delete()
      .eq("project_id", projectId);
    if (deleteAssigneeError) {
      console.error("프로젝트 담당자 갱신 실패:", deleteAssigneeError.message);
      toast.error("프로젝트 담당자 갱신에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    if (assigneeIds.length > 0) {
      const { error: insertAssigneeError } = await supabase.from("project_assignees").insert(
        assigneeIds.map((employee_id) => ({ project_id: projectId, employee_id }))
      );
      if (insertAssigneeError) {
        console.error("프로젝트 담당자 저장 실패:", insertAssigneeError.message);
        toast.error("프로젝트 담당자 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
    }

    toast.success("프로젝트가 수정되었습니다.");
    sendLog("UPDATE_PROJECT", `프로젝트 수정: ${data.name}`, {
      resource: "project",
      resource_id: projectId,
    });
    setProjectDialogOpen(false);
    await fetchData();
  };

  const handleSaveNote = async (values: ProjectNoteEditorValues) => {
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
        console.error("메모 수정 실패:", error.message);
        toast.error("메모 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return false;
      }

      toast.success("메모가 수정되었습니다.");
      sendLog("UPDATE_PROJECT_NOTE", `프로젝트 메모 수정: ${project?.name ?? projectId}`, {
        resource: "project_note",
        resource_id: selectedNote.id,
        details: { project_id: projectId },
      });
      setSelectedNote(null);
      return await refreshNotes();
    }

    const authorName =
      currentEmployeeName ??
      employees.find((employee) => employee.id === currentEmployeeId)?.name ??
      "알 수 없음";

    const { data, error } = await supabase
      .from("project_notes")
      .insert({
        project_id: projectId,
        author_employee_id: currentEmployeeId,
        author_name: authorName,
        ...cleaned,
      })
      .select("id")
      .single();

    if (error) {
      console.error("메모 추가 실패:", error.message);
      toast.error("메모 추가에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }

    toast.success("메모가 추가되었습니다.");
    sendLog("CREATE_PROJECT_NOTE", `프로젝트 메모 추가: ${project?.name ?? projectId}`, {
      resource: "project_note",
      resource_id: data.id,
      details: { project_id: projectId },
    });
    return await refreshNotes();
  };

  const handleDeleteNote = async (note: ProjectNote) => {
    if (!confirm("이 메모를 삭제하시겠습니까?")) return;

    const { error } = await supabase.from("project_notes").delete().eq("id", note.id);

    if (error) {
      console.error("메모 삭제 실패:", error.message);
      toast.error("메모 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    toast.success("메모가 삭제되었습니다.");
    sendLog("DELETE_PROJECT_NOTE", `프로젝트 메모 삭제: ${project?.name ?? projectId}`, {
      resource: "project_note",
      resource_id: note.id,
      details: { project_id: projectId },
    });

    if (selectedNote?.id === note.id) {
      setSelectedNote(null);
    }

    await refreshNotes();
  };

  const handleStartMeeting = async () => {
    const title = `미팅 ${new Date().toLocaleDateString("ko-KR")} ${new Date().toLocaleTimeString(
      "ko-KR",
      { hour: "2-digit", minute: "2-digit" }
    )}`;

    const { data, error } = await supabase
      .from("meetings")
      .insert({ title, status: "진행중", transcript: "", summary: "", project_id: projectId })
      .select()
      .single();

    if (error) {
      console.error("미팅 생성 실패:", error.message);
      toast.error("미팅 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    router.push(`/dashboard/meetings/${data.id}`);
  };

  const handleOpenSchedule = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setScheduleDialogOpen(true);
  };

  const handleAddSchedule = () => {
    setSelectedSchedule(null);
    setScheduleDialogOpen(true);
  };

  const handleSaveSchedule = async (
    data: ScheduleInsert,
    attendeeIds: string[],
    recurrence?: { type: RecurrenceType; endDate: string | null },
    options?: { addGoogleMeet?: boolean },
    scope?: ScheduleRecurrenceActionScope
  ) => {
    if (!hasValidScheduleRange(data.start_at, data.end_at)) {
      toast.error("종료 일시는 시작 일시보다 이후여야 합니다.");
      return false;
    }

    if (!selectedSchedule) {
      const scheduleData = {
        ...data,
        project_id: data.project_id ?? projectId,
      };

      if (recurrence && recurrence.type !== "none" && recurrence.endDate) {
        const res = await fetch("/api/schedules/mutate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            schedule: scheduleData,
            attendeeIds,
            recurrence,
            addGoogleMeet: options?.addGoogleMeet,
          }),
        });
        const result = await res.json().catch(() => null);

        if (!res.ok) {
          console.error("반복 일정 등록 실패:", result?.error ?? "알 수 없는 오류");
          toast.error("반복 일정 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
          return false;
        }

        toast.success(`반복 일정 ${result?.count ?? 0}건이 등록되었습니다.`);
        if (result?.warning) toast.warning(result.warning);
        sendLog("CREATE_SCHEDULE", `반복 일정 등록: ${data.title} (${result?.count ?? 0}건)`, {
          resource: "schedule",
          resource_id: String(result?.ids?.[0] ?? ""),
        });
        await fetchData();
        return true;
      }

      const res = await fetch("/api/schedules/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          schedule: scheduleData,
          attendeeIds,
          addGoogleMeet: options?.addGoogleMeet,
        }),
      });
      const result = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("일정 등록 실패:", result?.error ?? "알 수 없는 오류");
        toast.error("일정 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return false;
      }

      toast.success("일정이 등록되었습니다.");
      if (result?.warning) toast.warning(result.warning);
      sendLog("CREATE_SCHEDULE", `일정 등록: ${data.title}`, {
        resource: "schedule",
        resource_id: String(result?.id ?? ""),
      });
      await fetchData();
      return true;
    }

    const res = await fetch("/api/schedules/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        scheduleId: selectedSchedule.id,
        schedule: data,
        attendeeIds,
        scope,
      }),
    });
    const result = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("일정 수정 실패:", result?.error ?? "알 수 없는 오류");
      toast.error("일정 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }

    toast.success(
      (result?.count ?? 1) > 1
        ? `반복 일정 ${result.count}건이 수정되었습니다.`
        : "일정이 수정되었습니다."
    );
    if (result?.warning) toast.warning(result.warning);
    sendLog("UPDATE_SCHEDULE", `일정 수정: ${data.title}`, {
      resource: "schedule",
      resource_id: selectedSchedule.id,
    });
    await fetchData();
    return true;
  };

  const handleDeleteSchedule = async (scheduleId: string, scope?: ScheduleRecurrenceActionScope) => {
    const res = await fetch("/api/schedules/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        scheduleId,
        scope,
      }),
    });
    const result = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("일정 삭제 실패:", result?.error ?? "알 수 없는 오류");
      toast.error("일정 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }

    toast.success(
      (result?.count ?? 1) > 1
        ? `반복 일정 ${result.count}건이 삭제되었습니다.`
        : "일정이 삭제되었습니다."
    );
    if (result?.warning) toast.warning(result.warning);
    sendLog("DELETE_SCHEDULE", "일정 삭제", { resource: "schedule", resource_id: scheduleId });
    await fetchData();
    return true;
  };

  const fmt = (value: number) => mask("amount", value.toLocaleString("ko-KR"));
  const employeeNameMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.name])),
    [employees]
  );

  const getScheduleCategoryLabel = (category: string) =>
    scheduleCategories.find((item) => item.value === category)?.label ?? category;

  const formatScheduleDate = (schedule: Schedule) => {
    const start = new Date(schedule.start_at);
    const end = new Date(schedule.end_at);
    const startParts = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(start);
    const endParts = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(end);
    const weekday = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      weekday: "short",
    }).format(start);

    const dateLabel = `${startParts.find((part) => part.type === "year")?.value}.${startParts.find((part) => part.type === "month")?.value}.${startParts.find((part) => part.type === "day")?.value} (${weekday})`;

    if (schedule.all_day) return `${dateLabel} 종일`;

    const startLabel = `${startParts.find((part) => part.type === "hour")?.value}:${startParts.find((part) => part.type === "minute")?.value}`;
    const endLabel = `${endParts.find((part) => part.type === "hour")?.value}:${endParts.find((part) => part.type === "minute")?.value}`;
    return `${dateLabel} ${startLabel} - ${endLabel}`;
  };

  const getTaskStatusVariant = (
    status: Task["status"]
  ): "default" | "secondary" | "outline" | "destructive" => {
    const normalizedStatus = normalizeTaskStatus(status);

    if (normalizedStatus === "완료") return "secondary";
    if (normalizedStatus === "진행중") return "default";
    return "outline";
  };

  const getTaskPriorityClass = (priority: Task["priority"]) => {
    if (priority === "높음") return "bg-red-100 text-red-700";
    if (priority === "보통") return "bg-blue-100 text-blue-700";
    return "bg-gray-100 text-gray-700";
  };

  const getTaskAssigneeName = (task: Task) => getTaskAssigneeLabel(task, employeeNameMap);
  const formatProjectNoteDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : projectNoteDateFormatter.format(date);
  };

  if (loading) {
    return (
      <LoadingState
        title="프로젝트 정보를 불러오는 중입니다."
        description="매출, 일정, 할일, 미팅 정보를 함께 준비하고 있습니다."
      />
    );
  }

  if (!project) {
    return (
      <ErrorState
        title="프로젝트를 찾을 수 없습니다."
        description="삭제되었거나 접근 경로가 잘못되었을 수 있습니다."
        action={
          <Button variant="outline" onClick={() => router.push("/dashboard/projects")}>
            목록으로 돌아가기
          </Button>
        }
      />
    );
  }

  const totalRevenue = revenues.reduce((sum, revenue) => sum + revenue.total_amount, 0);
  const totalSupply = revenues.reduce((sum, revenue) => sum + revenue.supply_amount, 0);
  const totalVat = revenues.reduce((sum, revenue) => sum + revenue.vat_amount, 0);
  const paidCount = revenues.filter((revenue) => revenue.is_paid).length;
  const invoiceCount = revenues.filter((revenue) => revenue.is_tax_invoice_issued).length;
  const totalExpense = expenses.reduce((sum, expense) => sum + expense.total_amount, 0);
  const totalExpenseSupply = expenses.reduce((sum, expense) => sum + expense.supply_amount, 0);
  const totalExpenseVat = expenses.reduce((sum, expense) => sum + expense.vat_amount, 0);
  const paidExpenseCount = expenses.filter((expense) => Boolean(expense.payment_date)).length;
  const purchaseInvoiceCount = expenses.filter(
    (expense) => expense.purchase_tax_invoice_received || expense.purchase_tax_invoice_not_required
  ).length;
  const assigneeNames = getProjectAssigneeNames(project);
  const taskProgress = computeProjectProgress(tasks);

  const projectBreadcrumbs = project.customers
    ? [
        { label: "고객관리", href: "/dashboard/customers" },
        { label: mask("customer_name", project.customers.name), href: `/dashboard/customers/${project.customers.id}` },
        { label: "프로젝트", href: "/dashboard/projects" },
        { label: project.project_number || mask("title", project.name) },
      ]
    : [
        { label: "프로젝트 관리", href: "/dashboard/projects" },
        { label: project.project_number || mask("title", project.name) },
      ];
  const backParentHref = project.customers
    ? `/dashboard/customers/${project.customers.id}`
    : null;

  return (
    <PageShell>
      <NavBackHint parentHref={backParentHref} />
      <PageHeader
        title={mask("title", project.name)}
        funKey="projects"
        description="프로젝트에 연결된 매출, 일정, 할일, 미팅 흐름을 한 화면에서 확인합니다."
        breadcrumbs={projectBreadcrumbs}
        titleAccessory={<Badge variant={getProjectStatusVariant(project.status)}>{project.status}</Badge>}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void handleOpenEditDialog()}
              disabled={editDialogLoading}
              className="w-full sm:w-auto"
            >
              {editDialogLoading ? "불러오는 중..." : "수정"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteProject()}
              disabled={deleting}
              className="w-full sm:w-auto"
            >
              {deleting ? "삭제 중..." : "삭제"}
            </Button>
          </>
        }
      />

      <StatsGrid>
        <StatCard
          label="고객"
          value={
            project.customers ? (
              <Link
                href={`/dashboard/customers/${project.customers.id}`}
                className="text-primary hover:underline"
              >
                {mask("customer_name", project.customers.name)}
              </Link>
            ) : (
              "-"
            )
          }
          description={project.project_types?.name ?? "유형 미지정"}
          icon={Building2}
        />
        <StatCard
          label="진행 기간"
          value={`${project.start_date ?? "미정"} ~ ${project.end_date ?? "미정"}`}
          description={project.project_number || "프로젝트 번호 미지정"}
          icon={CalendarDays}
        />
        <StatCard
          label="담당자"
          value={
            assigneeNames.length > 0
              ? assigneeNames.map((n) => mask("name", n)).join(", ")
              : "-"
          }
          description={`${tasks.length}건의 할일이 연결되어 있습니다.`}
          icon={UsersRound}
        />
        <StatCard
          label="총 매출"
          value={`${fmt(totalRevenue)}원`}
          description={`공급가 ${fmt(totalSupply)}원 / 부가세 ${fmt(totalVat)}원`}
          icon={WalletCards}
          tone={totalRevenue > 0 ? "positive" : "default"}
        />
      </StatsGrid>

      {project.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              프로젝트 설명
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{project.description}</p>
          </CardContent>
        </Card>
      )}

      <SectionHeader
        title="메모"
        description={`프로젝트 관련 메모 ${notes.length}개`}
        action={
          <Button onClick={handleAddNote} size="sm" className="w-full sm:w-auto">
            메모추가
          </Button>
        }
      />
      {notes.length === 0 ? (
        <EmptyState text="등록된 메모가 없습니다. 메모추가 버튼으로 프로젝트 관련 내용을 쌓아두세요." />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const hasTitle = Boolean(note.title?.trim());
            const hasContent = Boolean(note.content?.trim());
            const hasLink = Boolean(note.link_url?.trim());
            const updated = note.updated_at !== note.created_at;

            return (
              <Card key={note.id} className="gap-2 py-4">
                <CardHeader className="pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base">
                        {hasTitle ? note.title : "제목 없음"}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>작성자 {note.author_name}</span>
                        <span>
                          {updated ? "수정" : "작성"}{" "}
                          {formatProjectNoteDate(updated ? note.updated_at : note.created_at)}
                        </span>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label="메모 메뉴"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditNote(note)}>
                          수정
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => void handleDeleteNote(note)}
                        >
                          삭제
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {hasContent ? (
                    <div
                      className="prose prose-sm max-w-none break-words dark:prose-invert prose-img:my-2 prose-img:rounded-md"
                      dangerouslySetInnerHTML={{
                        __html: renderProjectNoteContent(note.content ?? ""),
                      }}
                    />
                  ) : null}

                  {hasLink ? (
                    <a
                      href={note.link_url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 break-all text-sm text-primary underline-offset-4 hover:underline"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      <span>{note.link_url}</span>
                    </a>
                  ) : null}

                  {!hasContent && !hasLink ? (
                    <p className="text-sm text-muted-foreground">내용이 없습니다.</p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {linkedNotes.length > 0 && (
        <>
          <SectionHeader
            title="연결된 메모"
            description={`메모관리에서 이 프로젝트에 연결된 메모 ${linkedNotes.length}개`}
            action={
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => router.push("/dashboard/notes")}
              >
                메모관리
              </Button>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {linkedNotes.map((note) => (
              <Link
                key={note.id}
                href="/dashboard/notes"
                className="block rounded-2xl border border-border/70 bg-card/85 p-4 shadow-sm transition-colors hover:bg-muted/35"
              >
                <h4 className="line-clamp-1 font-medium">{note.title || "(제목 없음)"}</h4>
                {note.content && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {note.content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim()}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{note.author_name}</span>
                  <span>·</span>
                  <span>{formatProjectNoteDate(note.created_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <SectionHeader
        title="매출 내역"
        description={`${revenues.length}건 · 입금 ${paidCount}/${revenues.length}건 · 세금계산서 ${invoiceCount}/${revenues.length}건`}
        action={
          <Button onClick={handleAddRevenue} size="sm" className="w-full sm:w-auto">
            매출 추가
          </Button>
        }
      />
      {revenues.length === 0 ? (
        <EmptyState text='등록된 매출이 없습니다. "매출 추가" 버튼으로 등록하세요.' />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제목</TableHead>
                <TableHead className="text-right">총액</TableHead>
                <TableHead className="text-right">공급가</TableHead>
                <TableHead className="text-right">부가세</TableHead>
                <TableHead>매출일</TableHead>
                <TableHead>입금예정일</TableHead>
                <TableHead>입금</TableHead>
                <TableHead>계산서</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenues.map((revenue) => (
                <TableRow
                  key={revenue.id}
                  role="link"
                  tabIndex={0}
                  className="cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  onClick={() => handleOpenRevenue(revenue.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleOpenRevenue(revenue.id);
                    }
                  }}
                >
                  <TableCell className="font-medium">{revenue.title}</TableCell>
                  <TableCell className="text-right">{fmt(revenue.total_amount)}원</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fmt(revenue.supply_amount)}원
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fmt(revenue.vat_amount)}원
                  </TableCell>
                  <TableCell>{revenue.revenue_date ?? "-"}</TableCell>
                  <TableCell>{revenue.expected_payment_date ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={revenue.is_paid ? "default" : "outline"}>
                      {revenue.is_paid ? "입금완료" : "미입금"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        revenue.tax_invoice_not_required
                          ? "secondary"
                          : revenue.is_tax_invoice_issued
                            ? "default"
                            : "outline"
                      }
                    >
                      {revenue.tax_invoice_not_required
                        ? "불필요"
                        : revenue.is_tax_invoice_issued
                          ? "발행"
                          : "미발행"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>합계</TableCell>
                <TableCell className="text-right">{fmt(totalRevenue)}원</TableCell>
                <TableCell className="text-right">{fmt(totalSupply)}원</TableCell>
                <TableCell className="text-right">{fmt(totalVat)}원</TableCell>
                <TableCell colSpan={4}></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      <SectionHeader
        title="매입 내역"
        description={`${expenses.length}건 · 지급 ${paidExpenseCount}/${expenses.length}건 · 매입세금계산서 ${purchaseInvoiceCount}/${expenses.length}건`}
        action={
          <Button onClick={handleAddExpense} size="sm" className="w-full sm:w-auto">
            매입 추가
          </Button>
        }
      />
      {expenses.length === 0 ? (
        <EmptyState text='등록된 매입이 없습니다. "매입 추가" 버튼으로 등록하세요.' />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제목</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>매입처</TableHead>
                <TableHead className="text-right">총액</TableHead>
                <TableHead className="text-right">공급가</TableHead>
                <TableHead className="text-right">부가세</TableHead>
                <TableHead>매입일</TableHead>
                <TableHead>지급일</TableHead>
                <TableHead>매입계산서</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow
                  key={expense.id}
                  role="link"
                  tabIndex={0}
                  className="cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  onClick={() => handleOpenExpense(expense.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleOpenExpense(expense.id);
                    }
                  }}
                >
                  <TableCell className="font-medium">{expense.title}</TableCell>
                  <TableCell>
                    {expense.expense_types?.name ? (
                      <Badge variant="secondary">{expense.expense_types.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {expense.vendor_name ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">{fmt(expense.total_amount)}원</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fmt(expense.supply_amount)}원
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fmt(expense.vat_amount)}원
                  </TableCell>
                  <TableCell>{expense.purchase_date ?? "-"}</TableCell>
                  <TableCell>
                    {expense.payment_date ? (
                      expense.payment_date
                    ) : (
                      <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">
                        미지급
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        expense.purchase_tax_invoice_not_required
                          ? "secondary"
                          : expense.purchase_tax_invoice_received
                            ? "default"
                            : "outline"
                      }
                    >
                      {expense.purchase_tax_invoice_not_required
                        ? "불필요"
                        : expense.purchase_tax_invoice_received
                          ? "수취"
                          : "미수취"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={3}>합계</TableCell>
                <TableCell className="text-right">{fmt(totalExpense)}원</TableCell>
                <TableCell className="text-right">{fmt(totalExpenseSupply)}원</TableCell>
                <TableCell className="text-right">{fmt(totalExpenseVat)}원</TableCell>
                <TableCell colSpan={3}></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      <SectionHeader
        title="할일"
        description={`이 프로젝트에 연결된 할일 ${tasks.length}건${tasks.length > 0 ? ` · 진척률 ${taskProgress.percent}% (완료 ${taskProgress.done}/${taskProgress.total}건)` : ""}`}
        action={
          <Button
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => setTaskDialogOpen(true)}
          >
            할일 추가
          </Button>
        }
      />
      {tasks.length === 0 ? (
        <EmptyState text="연결된 할일이 없습니다. 이 화면에서 등록하면 현재 프로젝트에 바로 연결됩니다." />
      ) : (
        <div className="space-y-3">
          <div className="inline-flex gap-1 rounded-full border border-border/70 bg-background/70 p-1">
            {[
              { value: "gantt", label: "간트" },
              { value: "list", label: "목록" },
            ].map((option) => {
              const isActive = taskViewMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleChangeTaskView(option.value as "gantt" | "list")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  aria-pressed={isActive}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {taskViewMode === "gantt" ? (
            <TasksGanttView
              tasks={tasks}
              project={project}
              employeeNameMap={employeeNameMap}
              onSelectTask={handleOpenTaskDetail}
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>제목</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>우선순위</TableHead>
                    <TableHead>기간</TableHead>
                    <TableHead>담당자</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow
                      key={task.id}
                      className="cursor-pointer"
                      onClick={() => handleOpenTaskDetail(task.id)}
                    >
                      <TableCell className="max-w-[260px] font-medium">
                        <div className="truncate">{task.title}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getTaskStatusVariant(task.status)}>{normalizeTaskStatus(task.status)}</Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getTaskPriorityClass(task.priority)}`}
                        >
                          {task.priority}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {task.start_date && task.due_date && task.start_date !== task.due_date
                          ? `${task.start_date} ~ ${task.due_date}`
                          : task.due_date ?? task.start_date ?? "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{getTaskAssigneeName(task)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      <SectionHeader
        title="일정"
        description={`이 프로젝트에 연결된 일정 ${schedules.length}건`}
        action={
          <Button onClick={handleAddSchedule} size="sm" className="w-full sm:w-auto">
            일정 추가
          </Button>
        }
      />
      {schedules.length === 0 ? (
        <EmptyState text="연결된 일정이 없습니다. 일정 관리에서 프로젝트를 선택해 연결하세요." />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제목</TableHead>
                <TableHead>일시</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>장소</TableHead>
                <TableHead>참석자</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow
                  key={schedule.id}
                  className="cursor-pointer"
                  onClick={() => handleOpenSchedule(schedule)}
                >
                  <TableCell className="max-w-[220px] font-medium">
                    <div className="truncate">{schedule.title}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatScheduleDate(schedule)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {schedule.all_day ? "종일" : getScheduleCategoryLabel(schedule.category)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[180px] text-muted-foreground">
                    <div className="truncate">{schedule.location ?? "-"}</div>
                  </TableCell>
                  <TableCell className="max-w-[260px] text-muted-foreground">
                    <div className="truncate">
                      {schedule.attendees && schedule.attendees.length > 0
                        ? schedule.attendees
                            .map((attendee) => attendee.employees?.name)
                            .filter(Boolean)
                            .join(", ")
                        : "-"}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {project.drive_folder_id && (
        <DriveFileBrowser folderId={project.drive_folder_id} title="프로젝트 파일" />
      )}

      {project.customers?.drive_folder_id && (
        <DriveFileBrowser
          folderId={project.customers.drive_folder_id}
          title={`고객 파일 · ${project.customers.name}`}
        />
      )}

      <SectionHeader
        title="미팅 내역"
        description={`이 프로젝트에 연결된 미팅 ${meetings.length}건`}
        action={
          <Button onClick={handleStartMeeting} size="sm" className="w-full sm:w-auto">
            미팅 추가
          </Button>
        }
      />
      {meetings.length === 0 ? (
        <EmptyState text="연결된 미팅이 없습니다. 미팅을 시작하면 자동으로 이 프로젝트에 연결됩니다." />
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => (
            <Link
              key={meeting.id}
              href={`/dashboard/meetings/${meeting.id}`}
              className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium">{meeting.title}</span>
                <Badge variant="outline">{meeting.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                시작: {new Date(meeting.started_at).toLocaleString("ko-KR")}
              </p>
              {meeting.ended_at && (
                <p className="text-sm text-muted-foreground">
                  종료: {new Date(meeting.ended_at).toLocaleString("ko-KR")}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* 프로젝트 관련 메일 섹션 */}
      {(contactMails.length > 0 || mailsLoading) && (
        <div className="space-y-3">
          <SectionHeader
            title="관련 메일"
            description="연결된 고객 담당자와 주고받은 최근 메일입니다."
            action={
              <Button
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => router.push("/dashboard/mail")}
              >
                <Mail className="mr-1 h-4 w-4" />
                메일관리
              </Button>
            }
          />
          {mailsLoading ? (
            <div className="rounded-[1.5rem] border border-border/70 bg-card/80 px-5 py-8 text-center text-sm text-muted-foreground">
              메일을 불러오는 중...
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-border/70 bg-card/80 overflow-hidden">
              <div className="divide-y divide-border/50">
                {contactMails.slice(0, 5).map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex cursor-pointer items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/35 ${!msg.isRead ? "bg-sky-50/40" : ""}`}
                    onClick={() => router.push(`/dashboard/mail/${msg.id}`)}
                  >
                    <div className="mt-1.5 flex-shrink-0">
                      {!msg.isRead ? (
                        <div className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                      ) : (
                        <div className="h-1.5 w-1.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm ${!msg.isRead ? "font-semibold" : "font-medium"}`}>
                          {msg.subject}
                        </p>
                        <span className="flex-shrink-0 text-xs text-muted-foreground">
                          {(() => {
                            try {
                              const d = new Date(msg.date);
                              const now = new Date();
                              const isToday =
                                d.getFullYear() === now.getFullYear() &&
                                d.getMonth() === now.getMonth() &&
                                d.getDate() === now.getDate();
                              return isToday
                                ? d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                                : d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
                            } catch {
                              return msg.date;
                            }
                          })()}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {msg.fromName || msg.from} → {msg.to}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {contactMails.length > 5 && (
                <div className="border-t border-border/50 px-5 py-3 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/dashboard/mail")}
                  >
                    메일관리에서 전체 보기
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <RevenueDialog
        open={revenueDialogOpen}
        onOpenChange={(open) => {
          setRevenueDialogOpen(open);
          if (!open) setEditingRevenue(null);
        }}
        revenue={editingRevenue}
        projectId={projectId}
        onSave={handleSaveRevenue}
        onSaveAndContinue={editingRevenue ? undefined : handleSaveRevenue}
      />

      <RevenueDetailDialog
        open={revenueDetailOpen}
        onOpenChange={(open) => {
          setRevenueDetailOpen(open);
          if (!open) setSelectedRevenue(null);
        }}
        revenue={selectedRevenue}
        onEdit={handleEditRevenueFromDetail}
        onDelete={handleDeleteRevenueFromDetail}
        deleting={deletingRevenue}
      />

      <ExpenseQuickAddDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        expense={null}
        projectId={projectId}
        expenseTypes={expenseTypes}
        onSave={handleSaveExpense}
        onSaveAndContinue={handleSaveExpense}
      />

      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        project={project}
        customers={customers}
        employees={employees}
        projectTypes={projectTypes}
        onSave={handleSaveProject}
      />

      <ProjectNoteDialog
        open={noteDialogOpen}
        onOpenChange={(open) => {
          setNoteDialogOpen(open);
          if (!open) {
            setSelectedNote(null);
          }
        }}
        note={selectedNote}
        projectId={projectId}
        onSave={handleSaveNote}
      />

      <ScheduleDialog
        open={scheduleDialogOpen}
        onOpenChange={(open) => {
          setScheduleDialogOpen(open);
          if (!open) setSelectedSchedule(null);
        }}
        schedule={selectedSchedule}
        employees={employees}
        projects={[project]}
        categories={scheduleCategories}
        currentEmployeeId={currentEmployeeId}
        defaultProjectId={project.id}
        onSave={handleSaveSchedule}
        onDelete={handleDeleteSchedule}
      />

      <TaskCreateDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        employees={employees}
        projects={[project]}
        currentEmployeeId={currentEmployeeId}
        defaultProjectId={project.id}
        onCreated={refreshTasks}
      />

      <TaskDetailDialog
        taskId={detailTaskId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        employees={employees}
        projects={[project]}
        onUpdated={refreshTasks}
        onDeleted={refreshTasks}
      />
    </PageShell>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
