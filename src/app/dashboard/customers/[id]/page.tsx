"use client";

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Building2,
  CircleUserRound,
  ExternalLink,
  FolderKanban,
  Mail,
  MoreHorizontal,
  WalletCards,
} from "lucide-react";
import DOMPurify from "isomorphic-dompurify";
import { toast } from "sonner";
import {
  CustomerNoteDialog,
  type CustomerNoteEditorValues,
} from "@/components/customer-note-dialog";
import { DriveFileBrowser } from "@/components/drive-file-browser";
import { ProjectDialog } from "@/components/project-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatAmountInMan } from "@/lib/utils";
import { useMasking } from "@/components/masking-provider";
import {
  DetailGrid,
  DetailItem,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  SectionIntro,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sendLog } from "@/lib/log-client";
import { attachProjectAssignees, getProjectAssigneeNames } from "@/lib/project-assignees";
import { createClient } from "@/lib/supabase/client";
import type { GmailMessage } from "@/lib/gmail";
import type {
  Customer,
  CustomerContact,
  CustomerNote,
  Employee,
  Meeting,
  Note,
  Project,
  ProjectInsert,
  ProjectType,
  Schedule,
} from "@/lib/types";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  진행예정: "outline",
  진행중: "default",
  완료: "secondary",
  보류: "outline",
  취소: "destructive",
};

const customerNoteDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const CUSTOMER_NOTE_ALLOWED_TAGS = [
  "p", "br", "b", "strong", "i", "em", "u", "s", "a", "div", "span",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "pre", "code",
  "img", "hr",
];
const CUSTOMER_NOTE_ALLOWED_ATTR = [
  "href", "target", "rel", "src", "alt", "width", "height", "style", "class",
];

function escapeCustomerNoteHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCustomerNoteContent(raw: string) {
  if (/<[a-z][\s\S]*>/i.test(raw)) {
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: CUSTOMER_NOTE_ALLOWED_TAGS,
      ALLOWED_ATTR: CUSTOMER_NOTE_ALLOWED_ATTR,
    });
  }

  const markdownImage = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  const withImages = raw.replace(markdownImage, (_, alt: string, url: string) => {
    return `<img src="${escapeCustomerNoteHtml(url)}" alt="${escapeCustomerNoteHtml(alt)}" />`;
  });
  const blocks = withImages
    .split(/\n{2,}/)
    .map((block) => {
      if (block.includes("<img")) return block;
      return `<p>${escapeCustomerNoteHtml(block).replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
  return DOMPurify.sanitize(blocks, {
    ALLOWED_TAGS: CUSTOMER_NOTE_ALLOWED_TAGS,
    ALLOWED_ATTR: CUSTOMER_NOTE_ALLOWED_ATTR,
  });
}

type ContactFormState = {
  name: string;
  position: string;
  phone: string;
  email: string;
  memo: string;
};

function createEmptyContactForm(): ContactFormState {
  return {
    name: "",
    position: "",
    phone: "",
    email: "",
    memo: "",
  };
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const { mask } = useMasking();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [revenueMap, setRevenueMap] = useState<Record<string, number>>({});
  const [contactMails, setContactMails] = useState<GmailMessage[]>([]);
  const [mailsLoading, setMailsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactForm, setContactForm] = useState<ContactFormState>(createEmptyContactForm());
  const [selectedContact, setSelectedContact] = useState<CustomerContact | null>(null);
  const [contactDialogMode, setContactDialogMode] = useState<"create" | "view" | "edit">("create");
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [linkedNotes, setLinkedNotes] = useState<Note[]>([]);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<CustomerNote | null>(null);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [currentEmployeeName, setCurrentEmployeeName] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    await supabase.auth.getSession();

    const [customerRes, projectsRes, contactsRes, meetingsRes, schedulesRes, assigneeRes, employeesRes, projectTypesRes, notesRes, linkedNoteRes] =
      await Promise.all([
        supabase.from("customers").select("*").eq("id", customerId).single(),
        supabase.from("projects").select("*").eq("customer_id", customerId).order("created_at", {
          ascending: false,
        }),
        supabase.from("customer_contacts").select("*").eq("customer_id", customerId).order("created_at"),
        supabase
          .from("meetings")
          .select("*, projects(project_number, name)")
          .eq("customer_id", customerId)
          .order("started_at", { ascending: false }),
        supabase
          .from("schedules")
          .select("*, creator:employees!created_by(id, name)")
          .eq("customer_id", customerId)
          .order("start_at", { ascending: false }),
        supabase
          .from("project_assignees")
          .select("id, project_id, employee_id, created_at, employees(id, name, department)")
          .limit(1000),
        supabase.from("employees").select("*").order("name").limit(500),
        supabase.from("project_types").select("*").order("sort_order", { ascending: true }).limit(500),
        supabase
          .from("customer_notes")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("notes")
          .select("*, projects:project_id(id, project_number, name)")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
      ]);

    if (customerRes.error) { console.error("고객 정보 조회 실패:", customerRes.error.message); toast.error("고객 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (projectsRes.error) { console.error("고객 프로젝트 조회 실패:", projectsRes.error.message); toast.error("고객 프로젝트를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (contactsRes.error) { console.error("고객 담당자 조회 실패:", contactsRes.error.message); toast.error("고객 담당자를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (assigneeRes.error) { console.error("프로젝트 담당자 조회 실패:", assigneeRes.error.message); toast.error("프로젝트 담당자를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (meetingsRes.error) { console.error("고객 미팅 조회 실패:", meetingsRes.error.message); toast.error("고객 미팅을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (schedulesRes.error) { console.error("고객 일정 조회 실패:", schedulesRes.error.message); toast.error("고객 일정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (employeesRes.error) { console.error("직원 목록 조회 실패:", employeesRes.error.message); toast.error("직원 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (projectTypesRes.error) { console.error("프로젝트 유형 조회 실패:", projectTypesRes.error.message); toast.error("프로젝트 유형을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (notesRes.error) { console.error("고객 메모 조회 실패:", notesRes.error.message); toast.error("고객 메모를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    if (linkedNoteRes.error) { console.error("연결된 메모 조회 실패:", linkedNoteRes.error.message); }

    setLinkedNotes((linkedNoteRes.data ?? []) as Note[]);
    const mergedProjects = attachProjectAssignees(projectsRes.data ?? [], assigneeRes.data ?? []);
    const projectIds = mergedProjects.map((project) => project.id);
    const nextRevenueMap: Record<string, number> = {};

    if (projectIds.length > 0) {
      const { data: revenueData, error: revenueError } = await supabase
        .from("revenues")
        .select("project_id, total_amount")
        .in("project_id", projectIds);

      if (revenueError) console.error("매출 데이터 조회 실패:", revenueError.message);

      for (const revenue of revenueData ?? []) {
        if (revenue.project_id) {
          nextRevenueMap[revenue.project_id] =
            (nextRevenueMap[revenue.project_id] ?? 0) + revenue.total_amount;
        }
      }
    }

    setCustomer(customerRes.data);
    setProjects(mergedProjects);
    setContacts(contactsRes.data ?? []);
    setMeetings((meetingsRes.data ?? []) as Meeting[]);
    setSchedules((schedulesRes.data ?? []) as Schedule[]);
    setEmployees(employeesRes.data ?? []);
    setProjectTypes(projectTypesRes.data ?? []);
    setRevenueMap(nextRevenueMap);
    setNotes((notesRes.data ?? []) as CustomerNote[]);
    setLoading(false);

    // 고객 담당자 이메일로 관련 메일 조회
    const contactEmails = (contactsRes.data ?? [])
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
  }, [customerId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

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

  const refreshNotes = useCallback(async () => {
    const { data, error } = await supabase
      .from("customer_notes")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("고객 메모 갱신 실패:", error.message);
      toast.error("메모 목록을 갱신하지 못했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }

    setNotes((data ?? []) as CustomerNote[]);
    return true;
  }, [customerId, supabase]);

  const handleAddNote = () => {
    setSelectedNote(null);
    setNoteDialogOpen(true);
  };

  const handleEditNote = (note: CustomerNote) => {
    setSelectedNote(note);
    setNoteDialogOpen(true);
  };

  const handleSaveNote = async (values: CustomerNoteEditorValues) => {
    const cleaned = {
      title: values.title || null,
      content: values.content || null,
      link_url: values.link_url || null,
    };

    if (selectedNote) {
      const { error } = await supabase
        .from("customer_notes")
        .update(cleaned)
        .eq("id", selectedNote.id);

      if (error) {
        console.error("고객 메모 수정 실패:", error.message);
        toast.error(`메모 수정에 실패했습니다: ${error.message}`);
        return false;
      }

      toast.success("메모가 수정되었습니다.");
      sendLog("UPDATE_CUSTOMER_NOTE", `고객 메모 수정: ${customer?.name ?? customerId}`, {
        resource: "customer_note",
        resource_id: selectedNote.id,
        details: { customer_id: customerId },
      });
      setSelectedNote(null);
      return await refreshNotes();
    }

    const authorName =
      currentEmployeeName ??
      employees.find((employee) => employee.id === currentEmployeeId)?.name ??
      "알 수 없음";

    const { data, error } = await supabase
      .from("customer_notes")
      .insert({
        customer_id: customerId,
        author_employee_id: currentEmployeeId,
        author_name: authorName,
        ...cleaned,
      })
      .select("id")
      .single();

    if (error) {
      console.error("고객 메모 추가 실패:", error.message);
      toast.error(`메모 추가에 실패했습니다: ${error.message}`);
      return false;
    }

    toast.success("메모가 추가되었습니다.");
    sendLog("CREATE_CUSTOMER_NOTE", `고객 메모 추가: ${customer?.name ?? customerId}`, {
      resource: "customer_note",
      resource_id: data.id,
      details: { customer_id: customerId },
    });
    return await refreshNotes();
  };

  const handleDeleteNote = async (note: CustomerNote) => {
    if (!confirm("이 메모를 삭제하시겠습니까?")) return;

    const { error } = await supabase.from("customer_notes").delete().eq("id", note.id);

    if (error) {
      console.error("고객 메모 삭제 실패:", error.message);
      toast.error(`메모 삭제에 실패했습니다: ${error.message}`);
      return;
    }

    toast.success("메모가 삭제되었습니다.");
    sendLog("DELETE_CUSTOMER_NOTE", `고객 메모 삭제: ${customer?.name ?? customerId}`, {
      resource: "customer_note",
      resource_id: note.id,
      details: { customer_id: customerId },
    });

    if (selectedNote?.id === note.id) {
      setSelectedNote(null);
    }

    await refreshNotes();
  };

  const formatCustomerNoteDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : customerNoteDateFormatter.format(date);
  };

  const handleDelete = async () => {
    const hasProjects = projects.length > 0;
    const ok = confirm(
      hasProjects
        ? `연결된 프로젝트 ${projects.length}건의 고객 연결이 해제됩니다. 그래도 삭제하시겠습니까?`
        : "이 고객을 삭제하시겠습니까?"
    );

    if (!ok) return;

    setDeleting(true);
    const { error } = await supabase.from("customers").delete().eq("id", customerId);
    if (error) {
      console.error("고객 삭제 실패:", error.message);
      toast.error("고객 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setDeleting(false);
      return;
    }

    toast.success("고객을 삭제했습니다.");
    sendLog("DELETE_CUSTOMER", `고객 삭제: ${customer?.name}`, {
      resource: "customer",
      resource_id: customerId,
    });
    router.push("/dashboard/customers");
  };

  const generateProjectNumber = async (): Promise<string> => {
    const yy = String(new Date().getFullYear()).slice(2);
    const prefix = `${yy}-`;

    const { data } = await supabase
      .from("projects")
      .select("project_number")
      .like("project_number", `${prefix}%`)
      .order("project_number", { ascending: false });

    let seq = 1;
    if (data && data.length > 0) {
      const maxSeq = data.reduce((max, row) => {
        const num = parseInt(row.project_number.split("-")[1], 10);
        return Number.isNaN(num) ? max : Math.max(max, num);
      }, 0);
      seq = maxSeq + 1;
    }

    return `${prefix}${seq}`;
  };

  const handleCreateProject = async (data: ProjectInsert, assigneeIds: string[]) => {
    const cleaned = {
      ...data,
      customer_id: customerId,
      type_id: data.type_id || null,
      client: customer?.name || data.client || null,
      description: data.description || null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
    };
    const projectNumber = await generateProjectNumber();

    let driveFolderId: string | null = null;
    try {
      const folderRes = await fetch("/api/drive/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${projectNumber} ${cleaned.name}` }),
      });
      if (folderRes.ok) {
        const folder = await folderRes.json();
        driveFolderId = folder.id;
      } else {
        toast.error("Drive 폴더 생성 실패");
      }
    } catch (err) {
      console.error("Drive 폴더 생성 오류:", err instanceof Error ? err.message : String(err));
      toast.error("Drive 폴더 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }

    const { data: inserted, error: insertError } = await supabase
      .from("projects")
      .insert({
        ...cleaned,
        project_number: projectNumber,
        drive_folder_id: driveFolderId,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("프로젝트 등록 실패:", insertError?.message ?? "알 수 없는 오류");
      toast.error("프로젝트 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
      await fetchData();
      return;
    }

    if (assigneeIds.length > 0) {
      const { error: assigneeError } = await supabase.from("project_assignees").insert(
        assigneeIds.map((employee_id) => ({
          project_id: inserted.id,
          employee_id,
        }))
      );

      if (assigneeError) {
        console.error("프로젝트 담당자 저장 실패:", assigneeError.message);
        toast.error("프로젝트 담당자 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
        await fetchData();
        return;
      }
    }

    try {
      const slackRes = await fetch("/api/integrations/slack/project-created", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_number: projectNumber,
          project_name: data.name,
          customer_name: customer?.name ?? cleaned.client,
          status: cleaned.status,
          project_url: `${window.location.origin}/dashboard/projects/${inserted.id}`,
        }),
      });

      if (!slackRes.ok) {
        const slackData = await slackRes.json().catch(() => null);
        toast.warning(
          "프로젝트는 등록되었지만 Slack 알림 발송은 실패했습니다." +
            (slackData?.error ? ` ${slackData.error}` : "")
        );
      }
    } catch {
      toast.warning("프로젝트는 등록되었지만 Slack 알림 발송은 실패했습니다.");
    }

    toast.success("프로젝트를 등록했습니다.");
    sendLog("CREATE_PROJECT", `프로젝트 등록: ${data.name}`, { resource: "project" });
    await fetchData();
  };

  const handleContactDialogChange = (open: boolean) => {
    setContactDialogOpen(open);
    if (!open) {
      setSelectedContact(null);
      setContactDialogMode("create");
      setContactForm(createEmptyContactForm());
    }
  };

  const openCreateContactDialog = () => {
    setSelectedContact(null);
    setContactDialogMode("create");
    setContactForm(createEmptyContactForm());
    setContactDialogOpen(true);
  };

  const openViewContactDialog = (contact: CustomerContact) => {
    setSelectedContact(contact);
    setContactDialogMode("view");
    setContactForm({
      name: contact.name,
      position: contact.position ?? "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      memo: contact.memo ?? "",
    });
    setContactDialogOpen(true);
  };

  const switchToEditContact = () => {
    if (!selectedContact) return;
    setContactDialogMode("edit");
  };

  const handleContactFormChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setContactForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!contactForm.name.trim()) {
      toast.error("담당자 이름은 필수입니다.");
      return;
    }

    setContactSaving(true);

    const payload = {
      name: contactForm.name.trim(),
      position: contactForm.position.trim() || null,
      phone: contactForm.phone.trim() || null,
      email: contactForm.email.trim() || null,
      memo: contactForm.memo.trim() || null,
    };

    const { error } =
      contactDialogMode === "edit" && selectedContact
        ? await supabase.from("customer_contacts").update(payload).eq("id", selectedContact.id)
        : await supabase.from("customer_contacts").insert({
            customer_id: customerId,
            ...payload,
          });

    if (error) {
      console.error(contactDialogMode === "edit" ? "담당자 수정 실패:" : "담당자 추가 실패:", error.message);
      toast.error(
        contactDialogMode === "edit"
          ? "담당자 수정에 실패했습니다. 잠시 후 다시 시도해주세요."
          : "담당자 추가에 실패했습니다. 잠시 후 다시 시도해주세요."
      );
      setContactSaving(false);
      return;
    }

    toast.success(contactDialogMode === "edit" ? "담당자를 수정했습니다." : "담당자를 추가했습니다.");
    handleContactDialogChange(false);
    setContactSaving(false);
    await fetchData();
  };

  const handleDeleteContact = async () => {
    if (!selectedContact) return;
    if (!confirm(`"${selectedContact.name}" 담당자를 삭제하시겠습니까?`)) return;

    setContactSaving(true);
    const { error } = await supabase.from("customer_contacts").delete().eq("id", selectedContact.id);

    if (error) {
      console.error("담당자 삭제 실패:", error.message);
      toast.error("담당자 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setContactSaving(false);
      return;
    }

    toast.success("담당자를 삭제했습니다.");
    handleContactDialogChange(false);
    setContactSaving(false);
    await fetchData();
  };

  if (loading) {
    return (
      <LoadingState
        title="고객 정보를 불러오는 중입니다."
        description="연결 프로젝트와 담당자 목록을 함께 준비하고 있습니다."
      />
    );
  }

  if (!customer) {
    return (
      <ErrorState
        title="고객을 찾을 수 없습니다."
        description="삭제되었거나 접근 경로가 잘못되었을 수 있습니다."
        action={
          <Button variant="outline" onClick={() => router.push("/dashboard/customers")}>
            목록으로 돌아가기
          </Button>
        }
      />
    );
  }

  const totalRevenue = Object.values(revenueMap).reduce((sum, amount) => sum + amount, 0);
  const formatMeetingDate = (value: string | null) => {
    if (!value) return "-";

    return new Date(value).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  return (
    <PageShell>
      <PageHeader
        title={mask("customer_name", customer.name)}
        funKey="customers"
        description="고객 기본정보와 연결 프로젝트를 한 곳에서 확인합니다."
        breadcrumbs={[
          { label: "고객관리", href: "/dashboard/customers" },
          { label: mask("customer_name", customer.name) },
        ]}
        actions={
          <>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => router.push(`/dashboard/customers/${customerId}/edit`)}
            >
              수정
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "삭제 중..." : "삭제"}
            </Button>
          </>
        }
      />

      <StatsGrid>
        <StatCard
          label="사업자정보"
          value={
            <div className="space-y-2 text-sm font-medium tracking-normal">
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground">대표자명</p>
                <p className="text-base text-foreground">
                  {customer.representative_name ? mask("name", customer.representative_name) : "-"}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground">사업자번호</p>
                <p className="text-base text-foreground">
                  {customer.business_number ? mask("business_number", customer.business_number) : "-"}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground">주소</p>
                <p className="line-clamp-2 text-xs font-normal leading-4 text-muted-foreground">
                  {customer.address ? mask("address", customer.address) : "주소 정보 없음"}
                </p>
              </div>
            </div>
          }
          icon={Building2}
          compact
          className="min-h-[148px]"
        />
        <StatCard
          label="담당자"
          value={`${contacts.length}명`}
          description="연결된 고객 담당자 수"
          icon={CircleUserRound}
        />
        <StatCard
          label="연결 프로젝트"
          value={`${projects.length}건`}
          description="현재 고객과 연결된 프로젝트"
          icon={FolderKanban}
        />
        <StatCard
          label="누적 매출"
          value={`${totalRevenue.toLocaleString("ko-KR")}원`}
          mobileValue={formatAmountInMan(totalRevenue)}
          description="연결 프로젝트 기준 누적 매출"
          icon={WalletCards}
          tone={totalRevenue > 0 ? "positive" : "default"}
          sensitive="amount"
        />
      </StatsGrid>

      <DetailGrid className="md:grid-cols-1 xl:grid-cols-1">
        <DetailItem
          label="메모"
          value={<p className="whitespace-pre-wrap text-sm font-normal text-muted-foreground">{customer.memo || "-"}</p>}
        />
      </DetailGrid>

      <VendorSummary customer={customer} />

      {customer.drive_folder_id && (
        <DriveFileBrowser
          folderId={customer.drive_folder_id}
          title={`고객 파일 · ${customer.name}`}
        />
      )}

      <section className="space-y-3">
        <SectionIntro
          title="메모"
          description={`고객 관련 메모 ${notes.length}개`}
          action={
            <Button onClick={handleAddNote} size="sm" className="w-full sm:w-auto">
              메모 추가
            </Button>
          }
        />
        {notes.length === 0 ? (
          <EmptyState
            title="등록된 메모가 없습니다."
            description="메모 추가 버튼으로 고객 관련 메시지·이미지를 쌓아두세요."
          />
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
                            {formatCustomerNoteDate(updated ? note.updated_at : note.created_at)}
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
                          __html: renderCustomerNoteContent(note.content ?? ""),
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
      </section>

      {linkedNotes.length > 0 && (
        <section className="space-y-3">
          <SectionIntro
            title="연결된 메모"
            description={`메모관리에서 이 고객에 연결된 메모 ${linkedNotes.length}개`}
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
                {note.projects && (
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      <FolderKanban className="h-3 w-3" />
                      {note.projects.name}
                    </span>
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{note.author_name}</span>
                  <span>·</span>
                  <span>{customerNoteDateFormatter.format(new Date(note.created_at))}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-3">
        <SectionIntro
          title="담당자 목록"
          description={`총 ${contacts.length}명의 담당자가 연결되어 있습니다.`}
          action={
            <Button
              size="sm"
              className="w-full sm:w-auto"
              onClick={openCreateContactDialog}
            >
              담당자 추가
            </Button>
          }
        />

        {contacts.length === 0 ? (
          <EmptyState
            title="등록된 담당자가 없습니다."
            description="연락처 정보를 추가하면 후속 프로젝트 커뮤니케이션이 쉬워집니다."
          />
        ) : (
          <div className="rounded-[1.5rem] border border-border/70 bg-card/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%]">이름</TableHead>
                  <TableHead className="w-[18%]">직책</TableHead>
                  <TableHead className="w-[24%]">연락처</TableHead>
                  <TableHead className="w-[26%]">이메일</TableHead>
                  <TableHead className="w-[12%]">메모</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow
                    key={contact.id}
                    className="cursor-pointer"
                    onClick={() => openViewContactDialog(contact)}
                  >
                    <TableCell className="font-medium">{mask("name", contact.name)}</TableCell>
                    <TableCell>{contact.position || "-"}</TableCell>
                    <TableCell>{contact.phone ? mask("phone", contact.phone) : "-"}</TableCell>
                    <TableCell>{contact.email ? mask("email", contact.email) : "-"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.memo ? "있음" : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <SectionIntro
          title="연결 프로젝트"
          description={`총 ${projects.length}건의 프로젝트가 연결되어 있습니다.`}
          action={
            <Button size="sm" className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
              프로젝트 추가
            </Button>
          }
        />

        {projects.length === 0 ? (
          <EmptyState
            title="연결된 프로젝트가 없습니다."
            description="프로젝트 추가 버튼으로 바로 연결할 수 있습니다."
          />
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="block rounded-[1.5rem] border border-border/70 bg-card/80 p-5 transition-colors hover:bg-muted/35"
              >
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{project.project_number}</p>
                    <p className="font-medium">{project.name}</p>
                  </div>
                  <Badge variant={statusVariant[project.status] ?? "outline"}>{project.status}</Badge>
                </div>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                  <span>
                    담당자:{" "}
                    {(() => {
                      const names = getProjectAssigneeNames(project);
                      return names.length > 0
                        ? names.map((n) => mask("name", n)).join(", ")
                        : "-";
                    })()}
                  </span>
                  <span>기간: {project.start_date || "미정"} ~ {project.end_date || "미정"}</span>
                  <span>
                    매출:{" "}
                    {revenueMap[project.id]
                      ? mask("amount", `${revenueMap[project.id].toLocaleString("ko-KR")}원`)
                      : "-"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <SectionIntro
          title="연결 미팅"
          description={`총 ${meetings.length}건의 미팅이 이 고객과 연결되어 있습니다.`}
        />

        {meetings.length === 0 ? (
          <EmptyState
            title="연결된 미팅이 없습니다."
            description="미팅 상세에서 고객을 연결하면 이곳에 회의 내용이 함께 표시됩니다."
          />
        ) : (
          <div className="space-y-3">
            {meetings.map((meeting) => (
              <Link
                key={meeting.id}
                href={`/dashboard/meetings/${meeting.id}`}
                className="block rounded-[1.5rem] border border-border/70 bg-card/80 p-5 transition-colors hover:bg-muted/35"
              >
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{meeting.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMeetingDate(meeting.started_at || meeting.created_at)}
                    </p>
                  </div>
                  {meeting.projects ? (
                    <Badge variant="outline">
                      {meeting.projects.project_number} {meeting.projects.name}
                    </Badge>
                  ) : null}
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {meeting.summary?.trim() || meeting.transcript?.trim() || "기록된 미팅 내용이 없습니다."}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog open={contactDialogOpen} onOpenChange={handleContactDialogChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {contactDialogMode === "create"
                ? "담당자 추가"
                : contactDialogMode === "edit"
                  ? "담당자 수정"
                  : "담당자 정보"}
            </DialogTitle>
            <DialogDescription>
              {contactDialogMode === "create"
                ? "고객 담당자 정보를 입력하고 바로 추가합니다."
                : contactDialogMode === "edit"
                  ? "고객 담당자 정보를 수정합니다."
                  : "담당자 상세 정보를 확인하고 수정 또는 삭제할 수 있습니다."}
            </DialogDescription>
          </DialogHeader>

          {contactDialogMode === "view" && selectedContact ? (
            <>
              <div className="space-y-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">이름</p>
                    <p className="font-medium">{selectedContact.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">직책</p>
                    <p>{selectedContact.position || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">연락처</p>
                    <p>{selectedContact.phone || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">이메일</p>
                    <p>{selectedContact.email || "-"}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">메모</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {selectedContact.memo || "-"}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleDeleteContact()}
                  disabled={contactSaving}
                  className="sm:mr-auto"
                >
                  {contactSaving ? "삭제 중..." : "삭제"}
                </Button>
                <Button type="button" variant="outline" onClick={() => handleContactDialogChange(false)}>
                  닫기
                </Button>
                <Button type="button" onClick={switchToEditContact}>
                  수정
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form className="space-y-4" onSubmit={handleCreateContact}>
              <div className="space-y-2">
                <Label htmlFor="contact-name">이름</Label>
                <Input
                  id="contact-name"
                  name="name"
                  value={contactForm.name}
                  onChange={handleContactFormChange}
                  placeholder="담당자 이름"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contact-position">직책</Label>
                  <Input
                    id="contact-position"
                    name="position"
                    value={contactForm.position}
                    onChange={handleContactFormChange}
                    placeholder="예: 팀장"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-phone">연락처</Label>
                  <Input
                    id="contact-phone"
                    name="phone"
                    value={contactForm.phone}
                    onChange={handleContactFormChange}
                    placeholder="전화번호"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-email">이메일</Label>
                <Input
                  id="contact-email"
                  name="email"
                  type="email"
                  value={contactForm.email}
                  onChange={handleContactFormChange}
                  placeholder="name@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-memo">메모</Label>
                <textarea
                  id="contact-memo"
                  name="memo"
                  value={contactForm.memo}
                  onChange={handleContactFormChange}
                  placeholder="추가로 남길 내용을 입력하세요."
                  className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
              <DialogFooter>
                {contactDialogMode === "edit" && selectedContact ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void handleDeleteContact()}
                    disabled={contactSaving}
                    className="sm:mr-auto"
                  >
                    {contactSaving ? "삭제 중..." : "삭제"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (contactDialogMode === "edit" && selectedContact) {
                      openViewContactDialog(selectedContact);
                      return;
                    }
                    handleContactDialogChange(false);
                  }}
                  disabled={contactSaving}
                >
                  {contactDialogMode === "edit" ? "보기로 돌아가기" : "취소"}
                </Button>
                <Button type="submit" disabled={contactSaving}>
                  {contactSaving
                    ? contactDialogMode === "edit"
                      ? "수정 중..."
                      : "추가 중..."
                    : contactDialogMode === "edit"
                      ? "수정"
                      : "담당자 추가"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        <SectionIntro
          title="연결 일정"
          description={`총 ${schedules.length}건의 일정이 이 고객과 연결되어 있습니다.`}
        />

        {schedules.length === 0 ? (
          <EmptyState
            title="연결된 일정이 없습니다."
            description="일정 등록 시 고객을 연결하면 이곳에 표시됩니다."
          />
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <Link
                key={schedule.id}
                href={`/dashboard/schedules?edit=${schedule.id}`}
                className="block rounded-[1.5rem] border border-border/70 bg-card/80 p-5 transition-colors hover:bg-muted/35"
              >
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{schedule.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(schedule.start_at).toLocaleString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" ~ "}
                      {new Date(schedule.end_at).toLocaleString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {schedule.creator && (
                    <Badge variant="outline">{schedule.creator.name}</Badge>
                  )}
                </div>
                {schedule.description && (
                  <p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {schedule.description}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 고객 관련 메일 섹션 */}
      {(contactMails.length > 0 || mailsLoading) && (
        <div className="space-y-3">
          <SectionIntro
            title="관련 메일"
            description="고객 담당자와 주고받은 최근 메일입니다."
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

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={null}
        customers={[customer]}
        employees={employees}
        projectTypes={projectTypes}
        onSave={handleCreateProject}
        initialCustomerId={customerId}
      />

      <CustomerNoteDialog
        open={noteDialogOpen}
        onOpenChange={(open) => {
          setNoteDialogOpen(open);
          if (!open) {
            setSelectedNote(null);
          }
        }}
        note={selectedNote}
        customerId={customerId}
        onSave={handleSaveNote}
      />
    </PageShell>
  );
}

function VendorSummary({ customer }: { customer: Customer }) {
  const taxLabel = (() => {
    switch (customer.tax_category) {
      case "personal_withholding":
        return "개인 (원천 3.3%)";
      case "business_vat":
        return "사업자 (세금계산서 10%)";
      case "corporate_vat":
        return "법인 (세금계산서 10%)";
      case "none":
        return "해당없음";
      default:
        return null;
    }
  })();

  const hasVendorData =
    customer.is_vendor ||
    customer.bank_name ||
    customer.account_number ||
    customer.resident_number ||
    customer.business_number;

  if (!hasVendorData) {
    return null;
  }

  const rateLabel =
    customer.default_withholding_rate !== null
      ? `${(Number(customer.default_withholding_rate) * 100).toFixed(1)}%`
      : "-";

  const identifierLabel =
    customer.customer_type === "개인"
      ? `주민등록번호: ${customer.resident_number || "-"}`
      : customer.customer_type === "개인사업자" || customer.customer_type === "법인"
        ? `사업자번호: ${customer.business_number || "-"}`
        : customer.business_number
          ? `사업자번호: ${customer.business_number}`
          : customer.resident_number
            ? `주민등록번호: ${customer.resident_number}`
            : "-";

  return (
    <DetailGrid>
      <DetailItem
        label="고객 식별"
        value={
          <span className="text-sm">
            {customer.customer_type ?? "미분류"}
            <span className="ml-2 text-muted-foreground">{identifierLabel}</span>
          </span>
        }
      />
      <DetailItem
        label="매입 구분"
        value={
          <span className="text-sm">
            {taxLabel ?? "매입 대상 아님"}
            {customer.tax_category === "personal_withholding" ? (
              <span className="ml-2 text-muted-foreground">원천 {rateLabel}</span>
            ) : null}
          </span>
        }
      />
      <DetailItem
        label="계좌"
        value={
          <span className="text-sm">
            {customer.bank_name || "-"} {customer.account_number || ""}{" "}
            {customer.account_holder ? `(${customer.account_holder})` : ""}
          </span>
        }
      />
    </DetailGrid>
  );
}
