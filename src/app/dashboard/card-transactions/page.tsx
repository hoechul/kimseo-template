"use client";

import {
  Camera,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  ImageUp,
  Pencil,
  Receipt,
  Search,
  Wallet,
  Trash2,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import {
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { sendLog } from "@/lib/log-client";
import { formatAmountInMan } from "@/lib/utils";
import type { CardTransaction, CardTransactionStatus, ExpenseType } from "@/lib/types";
import { CARD_TRANSACTION_STATUS_LABEL } from "@/lib/types";

type CardTxRow = CardTransaction & {
  card?: { id: string; last4: string; holder?: { id: string; name: string } | null } | null;
};

type ReceiptInputRefs = {
  camera: HTMLInputElement | null;
  file: HTMLInputElement | null;
};

/**
 * 적요 인라인 편집 셀.
 *
 * 평소엔 텍스트로만 보이고 hover 시 ✏️ 아이콘 노출 → 클릭하면 input.
 * Enter / blur 로 저장하면 ✓ 1.2초 표시 후 다시 읽기 모드로 복귀, Esc는 취소.
 */
function InlineMemoCell({
  initialValue,
  disabled,
  onSave,
}: {
  initialValue: string | null;
  disabled?: boolean;
  onSave: (newValue: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  }, [editing]);

  const commit = async () => {
    const trimmed = value.trim();
    const original = (initialValue ?? "").trim();
    if (trimmed === original) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(trimmed);
    setSaving(false);
    if (ok) {
      setEditing(false);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1200);
    }
  };

  const cancel = () => {
    setValue(initialValue ?? "");
    setEditing(false);
  };

  if (disabled) {
    return (
      <div className="px-2 py-1 text-xs text-muted-foreground">
        {initialValue || "—"}
      </div>
    );
  }

  if (editing) {
    return (
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          placeholder="적요 입력"
          className="h-8 pr-20 text-xs"
          disabled={saving}
        />
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[9px] text-muted-foreground/80">
          {saving ? "저장 중..." : "↵ 저장 · Esc 취소"}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setValue(initialValue ?? "");
        setEditing(true);
      }}
      className="group flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-xs transition-colors hover:bg-muted/60"
      title="클릭해서 적요 수정"
    >
      <span
        className={`min-w-0 truncate ${
          initialValue ? "text-foreground" : "text-muted-foreground/70"
        }`}
      >
        {initialValue || "+ 적요"}
      </span>
      {justSaved ? (
        <Check className="size-3.5 shrink-0 text-emerald-600" />
      ) : (
        <Pencil className="size-3 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}

type Filter = "all" | CardTransactionStatus;
type PeriodFilter = "thisMonth" | "lastMonth" | "thisYear" | "all";

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "pending", label: "미확정" },
  { value: "confirmed", label: "매입확정" },
  { value: "ignored", label: "무시" },
];

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "thisMonth", label: "이번 달" },
  { value: "lastMonth", label: "지난 달" },
  { value: "thisYear", label: "올해" },
  { value: "all", label: "전체기간" },
];

const RECEIPT_BUCKET = "expense-receipts";
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const PDF_PAGE_WIDTH_PX = 1123;
const PDF_PAGE_HEIGHT_PX = 794;
const PDF_PAGE_WIDTH_MM = 297;
const PDF_PAGE_HEIGHT_MM = 210;

function statusVariant(status: CardTransactionStatus): "default" | "secondary" | "outline" {
  switch (status) {
    case "confirmed":
      return "default";
    case "ignored":
      return "outline";
    default:
      return "secondary";
  }
}

function formatApprovedAt(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatApprovedDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatFileDate(date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sanitizeFileName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const cleaned = base
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase();
  return `${cleaned || "file"}${ext.toLowerCase()}`;
}

function inPeriod(iso: string, period: PeriodFilter): boolean {
  if (period === "all") return true;
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  if (period === "thisMonth") {
    return sameYear && d.getMonth() === now.getMonth();
  }
  if (period === "lastMonth") {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth();
  }
  if (period === "thisYear") return sameYear;
  return true;
}

function isPdfReceiptUrl(url: string): boolean {
  const normalized = url.split("?")[0]?.toLowerCase() ?? "";
  return normalized.endsWith(".pdf");
}

function formatPdfAmount(row: CardTxRow): string {
  if (row.currency !== "KRW" && row.foreign_amount != null) {
    return `${row.currency} ${row.foreign_amount.toLocaleString("ko-KR")}`;
  }

  return `${row.amount.toLocaleString("ko-KR")}원`;
}

function formatPdfCardLast4(row: CardTxRow): string {
  const raw = row.card?.last4 ?? row.card_last4 ?? "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);

  const visible = raw.replace(/\*/g, "").trim();
  return visible ? visible.slice(-4) : "-";
}

export default function CardTransactionsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();
  const [rows, setRows] = useState<CardTxRow[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Filter>("pending");
  const [period, setPeriod] = useState<PeriodFilter>("thisMonth");
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(true);
  const [onlyMissingReceipt, setOnlyMissingReceipt] = useState(false);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [canConfirm, setCanConfirm] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  // 행마다 파일 input을 hidden으로 두기 위한 trigger
  const fileInputRefs = useRef<Record<string, ReceiptInputRefs>>({});

  // 벌크 다이얼로그
  const [memoDialogOpen, setMemoDialogOpen] = useState(false);
  const [bulkMemo, setBulkMemo] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(false);
    await supabase.auth.getSession();

    // 현재 로그인 사용자의 employee_id 조회
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    setCanConfirm(false);
    setCurrentEmployeeId(null);
    if (authUser) {
      const { data: emp } = await supabase
        .from("employees")
        .select("id, employee_type, is_finance")
        .eq("auth_uid", authUser.id)
        .maybeSingle();
      if (emp) {
        setCurrentEmployeeId(emp.id);
        setCanConfirm(emp.is_finance === true);
      }
    }

    const [rowsRes, typesRes] = await Promise.all([
      supabase
        .from("card_transactions")
        .select(
          "*, card:corporate_cards(id, last4, holder:employees!corporate_cards_holder_employee_id_fkey(id, name))"
        )
        .order("approved_at", { ascending: false })
        .limit(1000),
      supabase.from("expense_types").select("*").order("sort_order"),
    ]);

    if (rowsRes.error) {
      console.error("카드 거래 조회 실패:", rowsRes.error.message);
      toast.error("카드 거래 목록 조회에 실패했습니다.");
      setError(true);
      setLoading(false);
      return;
    }

    const fetched = (rowsRes.data ?? []) as CardTxRow[];
    setRows(fetched);
    setExpenseTypes((typesRes.data ?? []) as ExpenseType[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!inPeriod(r.approved_at, period)) return false;
      if (!r.card_id || !r.card?.holder?.id) return false;
      if (r.parse_status !== "parsed") return false;
      if (onlyMine && currentEmployeeId) {
        if (r.card?.holder?.id !== currentEmployeeId) return false;
      }
      if (onlyMissingReceipt && r.receipt_url) return false;
      if (q) {
        const hay =
          `${r.merchant ?? ""} ${r.description ?? ""} ${r.card_last4 ?? ""} ${r.card?.last4 ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, period, query, onlyMine, currentEmployeeId, onlyMissingReceipt]);

  const monthAmountFiltered = useMemo(
    () =>
      filtered
        .filter((r) => r.status !== "ignored" && r.currency === "KRW")
        .reduce((sum, r) => sum + r.amount, 0),
    [filtered]
  );
  const pendingCountFiltered = useMemo(
    () => filtered.filter((r) => r.status === "pending").length,
    [filtered]
  );
  const missingReceiptCountFiltered = useMemo(
    () => filtered.filter((r) => !r.receipt_url && r.status === "pending").length,
    [filtered]
  );
  const totalCountFiltered = filtered.length;

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const selectedRows = useMemo(
    () => filtered.filter((r) => selected.has(r.id)),
    [filtered, selected]
  );
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.id)));
    }
  };

  const clearSelection = () => setSelected(new Set());

  // 인라인 적요 저장 — InlineMemoCell에서 호출, 성공/실패만 반환
  // 네트워크 일시 오류 대비: 한 번까지 자동 재시도 후 실패 시에만 toast.
  const saveDescription = useCallback(
    async (id: string, newValue: string): Promise<boolean> => {
      const trimmed = newValue.trim() || null;
      const attempt = async () =>
        await supabase
          .from("card_transactions")
          .update({ description: trimmed })
          .eq("id", id);

      let { error: err } = await attempt();
      if (err) {
        await new Promise((r) => setTimeout(r, 600));
        const retry = await attempt();
        err = retry.error;
      }
      if (err) {
        toast.error(`적요 저장 실패 (재시도 포함): ${err.message}`);
        return false;
      }
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, description: trimmed } : r))
      );
      return true;
    },
    [supabase]
  );

  // 인라인 영수증 첨부
  const handleReceiptUpload = async (id: string, file: File) => {
    if (file.size > MAX_RECEIPT_BYTES) {
      toast.error("영수증은 10MB 이하로 업로드해주세요.");
      return;
    }
    setUploadingId(id);
    try {
      const safe = sanitizeFileName(file.name || `receipt-${Date.now()}.jpg`);
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from(RECEIPT_BUCKET)
        .upload(path, file, { contentType: file.type || "image/jpeg" });
      if (upErr) {
        toast.error(`업로드 실패: ${upErr.message}`);
        return;
      }
      const { data: pub } = supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) {
        toast.error("영수증 주소를 가져오지 못했습니다.");
        return;
      }
      const { error: updErr } = await supabase
        .from("card_transactions")
        .update({ receipt_url: publicUrl })
        .eq("id", id);
      if (updErr) {
        toast.error(`영수증 연결 실패: ${updErr.message}`);
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, receipt_url: publicUrl } : r))
      );
      toast.success("영수증 첨부됨");
    } finally {
      setUploadingId(null);
    }
  };

  const setReceiptInputRef = (
    id: string,
    kind: keyof ReceiptInputRefs,
    el: HTMLInputElement | null
  ) => {
    const current = fileInputRefs.current[id] ?? { camera: null, file: null };
    fileInputRefs.current[id] = { ...current, [kind]: el };
  };

  const triggerReceiptInput = (id: string, kind: keyof ReceiptInputRefs) => {
    fileInputRefs.current[id]?.[kind]?.click();
  };

  const openReceiptPreview = (url: string) => {
    setPreviewUrl(url);
  };

  const handleDownloadPdf = async () => {
    if (filtered.length === 0) {
      toast.error("PDF로 정리할 카드사용내역이 없습니다.");
      return;
    }

    setPdfDownloading(true);
    let exportContainer: HTMLDivElement | null = null;

    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");
      const statusLabel =
        FILTER_OPTIONS.find((option) => option.value === statusFilter)?.label ?? "전체";
      const periodLabel =
        PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "전체기간";
      const filterParts = [
        periodLabel,
        statusLabel,
        onlyMine && currentEmployeeId ? "내 카드만" : null,
        onlyMissingReceipt ? "영수증 미첨부" : null,
        query.trim() ? `검색: ${query.trim()}` : null,
      ].filter(Boolean);
      const krwTotal = filtered
        .filter((row) => row.status !== "ignored" && row.currency === "KRW")
        .reduce((sum, row) => sum + row.amount, 0);
      const withReceipt = filtered.filter((row) => row.receipt_url).length;

      const setStyles = (element: HTMLElement, styles: Partial<CSSStyleDeclaration>) => {
        Object.assign(element.style, styles);
      };

      const appendText = (
        parent: HTMLElement,
        tagName: keyof HTMLElementTagNameMap,
        text: string,
        styles?: Partial<CSSStyleDeclaration>
      ) => {
        const element = document.createElement(tagName);
        element.textContent = text;
        if (styles) setStyles(element, styles);
        parent.appendChild(element);
        return element;
      };

      const appendCell = (
        rowElement: HTMLTableRowElement,
        text: string,
        styles?: Partial<CSSStyleDeclaration>
      ) => {
        const cell = document.createElement("td");
        cell.textContent = text;
        setStyles(cell, {
          borderBottom: "1px solid #e5e7eb",
          color: "#111827",
          fontSize: "12px",
          lineHeight: "1.35",
          padding: "6px 7px",
          verticalAlign: "top",
          wordBreak: "break-word",
          ...styles,
        });
        rowElement.appendChild(cell);
        return cell;
      };

      exportContainer = document.createElement("div");
      setStyles(exportContainer, {
        left: "-12000px",
        position: "fixed",
        top: "0",
        width: `${PDF_PAGE_WIDTH_PX}px`,
        zIndex: "-1",
      });
      document.body.appendChild(exportContainer);

      const createPage = (continued: boolean) => {
        const pageElement = document.createElement("div");
        setStyles(pageElement, {
          background: "#ffffff",
          boxSizing: "border-box",
          color: "#111827",
          fontFamily:
            "Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          height: `${PDF_PAGE_HEIGHT_PX}px`,
          overflow: "hidden",
          padding: "28px 30px",
          width: `${PDF_PAGE_WIDTH_PX}px`,
        });

        const header = document.createElement("div");
        setStyles(header, { marginBottom: continued ? "12px" : "16px" });
        pageElement.appendChild(header);

        appendText(header, "h1", continued ? "카드사용내역 영수증 링크 목록 (계속)" : "카드사용내역 영수증 링크 목록", {
          color: "#111827",
          fontSize: continued ? "18px" : "24px",
          fontWeight: "700",
          letterSpacing: "0",
          lineHeight: "1.2",
          margin: "0",
        });

        if (!continued) {
          appendText(header, "p", `생성일시: ${formatApprovedDateTime(new Date().toISOString())}`, {
            color: "#6b7280",
            fontSize: "12px",
            lineHeight: "1.35",
            margin: "10px 0 0",
          });
          appendText(
            header,
            "p",
            `대상: ${filtered.length.toLocaleString("ko-KR")}건 · 영수증 링크 ${withReceipt.toLocaleString("ko-KR")}건 · 원화 합계 ${krwTotal.toLocaleString("ko-KR")}원`,
            {
              color: "#111827",
              fontSize: "13px",
              fontWeight: "600",
              lineHeight: "1.35",
              margin: "5px 0 0",
            }
          );
          appendText(header, "p", `필터: ${filterParts.join(" · ")}`, {
            color: "#6b7280",
            fontSize: "12px",
            lineHeight: "1.35",
            margin: "5px 0 0",
          });
        }

        const table = document.createElement("table");
        setStyles(table, {
          borderCollapse: "collapse",
          tableLayout: "fixed",
          width: "100%",
        });
        pageElement.appendChild(table);

        const colgroup = document.createElement("colgroup");
        const columnWidths = ["12%", "8%", "6%", "20%", "10%", "24%", "10%", "10%"];
        for (const width of columnWidths) {
          const col = document.createElement("col");
          col.style.width = width;
          colgroup.appendChild(col);
        }
        table.appendChild(colgroup);

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        const headers = ["승인일시", "직원", "카드", "가맹점", "금액", "적요", "영수증", "상태"];
        headers.forEach((label, index) => {
          const th = document.createElement("th");
          th.textContent = label;
          setStyles(th, {
            background: "#eef6f6",
            borderBottom: "1px solid #cbd5e1",
            borderTop: "1px solid #cbd5e1",
            color: "#374151",
            fontSize: "12px",
            fontWeight: "700",
            lineHeight: "1.25",
            padding: "7px",
            textAlign: index === 4 ? "right" : "left",
          });
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        table.appendChild(tbody);
        exportContainer?.appendChild(pageElement);

        return { pageElement, tbody };
      };

      const appendRow = (tbody: HTMLTableSectionElement, row: CardTxRow) => {
        const tr = document.createElement("tr");
        const receiptUrl = row.receipt_url;

        appendCell(tr, formatApprovedDateTime(row.approved_at));
        appendCell(tr, row.card?.holder?.name ?? "미매핑");
        appendCell(tr, formatPdfCardLast4(row));
        appendCell(tr, row.merchant ?? "(가맹점 미상)", { fontWeight: "600" });
        appendCell(tr, formatPdfAmount(row), { textAlign: "right", whiteSpace: "nowrap" });
        appendCell(tr, row.description ?? "-");

        const receiptCell = appendCell(tr, "");
        if (receiptUrl) {
          const link = document.createElement("a");
          link.href = receiptUrl;
          link.dataset.receiptUrl = receiptUrl;
          link.textContent = "영수증 열기";
          setStyles(link, {
            color: "#0f5fcb",
            fontWeight: "700",
            textDecoration: "underline",
          });
          receiptCell.appendChild(link);
        } else {
          receiptCell.textContent = "-";
        }

        appendCell(tr, CARD_TRANSACTION_STATUS_LABEL[row.status], { whiteSpace: "nowrap" });
        tbody.appendChild(tr);
        return tr;
      };

      const pages: HTMLDivElement[] = [];
      let current = createPage(false);
      pages.push(current.pageElement);

      for (const row of filtered) {
        const tr = appendRow(current.tbody, row);
        if (current.pageElement.scrollHeight > PDF_PAGE_HEIGHT_PX && current.tbody.children.length > 1) {
          tr.remove();
          current = createPage(true);
          pages.push(current.pageElement);
          appendRow(current.tbody, row);
        }
      }

      if ("fonts" in document) {
        await document.fonts.ready;
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const pdf = new jsPDF("l", "mm", "a4");
      for (let index = 0; index < pages.length; index += 1) {
        const pageElement = pages[index];
        if (index > 0) pdf.addPage();

        const pageRect = pageElement.getBoundingClientRect();
        const receiptLinks = Array.from(
          pageElement.querySelectorAll<HTMLAnchorElement>("a[data-receipt-url]")
        ).map((link) => {
          const rect = link.getBoundingClientRect();
          return {
            url: link.dataset.receiptUrl ?? link.href,
            x: ((rect.left - pageRect.left) / pageRect.width) * PDF_PAGE_WIDTH_MM,
            y: ((rect.top - pageRect.top) / pageRect.height) * PDF_PAGE_HEIGHT_MM,
            width: (rect.width / pageRect.width) * PDF_PAGE_WIDTH_MM,
            height: (rect.height / pageRect.height) * PDF_PAGE_HEIGHT_MM,
          };
        });

        const canvas = await html2canvas(pageElement, {
          backgroundColor: "#ffffff",
          logging: false,
          scale: 1.5,
          useCORS: true,
        });
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.92),
          "JPEG",
          0,
          0,
          PDF_PAGE_WIDTH_MM,
          PDF_PAGE_HEIGHT_MM
        );

        for (const receiptLink of receiptLinks) {
          if (receiptLink.url) {
            pdf.link(receiptLink.x, receiptLink.y, receiptLink.width, receiptLink.height, {
              url: receiptLink.url,
            });
          }
        }
      }

      pdf.save(`card-transactions-${formatFileDate()}.pdf`);
      toast.success(`카드사용내역 ${filtered.length.toLocaleString("ko-KR")}건 PDF 다운로드됨`);
    } catch (err) {
      console.error("카드사용내역 PDF 생성 실패:", err);
      toast.error("PDF 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      exportContainer?.remove();
      setPdfDownloading(false);
    }
  };

  // 벌크 핸들러
  const handleBulkSetMemo = async () => {
    if (selectedIds.length === 0) return;
    const trimmed = bulkMemo.trim() || null;
    setBulkBusy(true);
    const { error: err } = await supabase
      .from("card_transactions")
      .update({ description: trimmed })
      .in("id", selectedIds);
    setBulkBusy(false);
    if (err) {
      toast.error(`적요 일괄 적용 실패: ${err.message}`);
      return;
    }
    setMemoDialogOpen(false);
    setBulkMemo("");
    toast.success(`${selectedIds.length}건 적요 적용 완료`);
    await fetchRows();
  };

  const handleBulkIgnore = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`선택한 ${selectedIds.length}건을 무시 처리하시겠습니까?`)) return;
    setBulkBusy(true);
    const { error: err } = await supabase
      .from("card_transactions")
      .update({ status: "ignored" })
      .in("id", selectedIds);
    setBulkBusy(false);
    if (err) {
      toast.error(`무시 일괄 처리 실패: ${err.message}`);
      return;
    }
    toast.success(`${selectedIds.length}건 무시 처리됨`);
    clearSelection();
    await fetchRows();
  };

  // 선택된 행이 모두 "파싱 실패" 또는 "무시" 상태인지 — 둘 다 영구 삭제 가능 대상
  const selectedAllDeletable =
    selectedRows.length > 0 &&
    selectedRows.every((r) => r.parse_status === "failed" || r.status === "ignored");

  // 파싱 실패 / 무시 처리된 거래만 영구 삭제 (되돌릴 수 없음)
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!selectedAllDeletable) {
      toast.error("영구 삭제는 파싱 실패 또는 무시 처리된 거래만 가능합니다.");
      return;
    }
    if (
      !confirm(
        `선택한 ${selectedIds.length}건을 영구 삭제합니다.\n되돌릴 수 없습니다. 진행할까요?`
      )
    )
      return;
    setBulkBusy(true);
    // 서버측 안전장치 — parse_status=failed 이거나 status=ignored 인 행만 삭제
    const { error: err } = await supabase
      .from("card_transactions")
      .delete()
      .in("id", selectedIds)
      .or("parse_status.eq.failed,status.eq.ignored");
    setBulkBusy(false);
    if (err) {
      toast.error(`삭제 실패: ${err.message}`);
      return;
    }
    toast.success(`${selectedIds.length}건 영구 삭제됨`);
    clearSelection();
    await fetchRows();
  };

  const handleBulkConfirm = async () => {
    if (selectedIds.length === 0) return;
    if (!canConfirm) {
      toast.error("매입확정은 재무팀 권한자만 처리할 수 있습니다.");
      return;
    }

    // 유형 미지정 시 자동 적용할 기본 유형 (운영비 → 잡비 → 첫 번째 순)
    const defaultType =
      expenseTypes.find((t) => t.account_code === "operating") ??
      expenseTypes.find((t) => t.account_code === "misc") ??
      expenseTypes[0];
    if (!defaultType) {
      toast.error("기본 매입유형을 찾을 수 없습니다. 매입유형 설정을 확인해주세요.");
      return;
    }

    const issues: string[] = [];
    const targets: CardTxRow[] = [];
    for (const row of selectedRows) {
      if (row.status !== "pending") {
        issues.push(`${row.merchant ?? "(미상)"} — 이미 처리됨`);
        continue;
      }
      if (row.currency !== "KRW") {
        issues.push(`${row.merchant ?? "(미상)"} — 외화`);
        continue;
      }
      if (row.amount <= 0) {
        issues.push(`${row.merchant ?? "(미상)"} — 금액 0`);
        continue;
      }
      targets.push(row);
    }

    if (targets.length === 0) {
      toast.error(
        `확정 가능한 거래가 없습니다.\n${issues.slice(0, 3).join("\n")}${issues.length > 3 ? `\n외 ${issues.length - 3}건` : ""}`
      );
      return;
    }

    const msg =
      issues.length > 0
        ? `${targets.length}건 매입확정 (${issues.length}건은 조건 미충족으로 건너뜀)\n진행할까요?`
        : `${targets.length}건을 매입으로 확정합니다.`;
    if (!confirm(msg)) return;

    setBulkBusy(true);
    let successCount = 0;
    for (const row of targets) {
      const type = expenseTypes.find((t) => t.id === row.type_id) ?? defaultType;
      const vatDeductible = type.is_vat_deductible !== false;
      const supply = vatDeductible ? Math.round(row.amount / 1.1) : row.amount;
      const vat = vatDeductible ? row.amount - supply : 0;
      const expenseDate = new Date(row.approved_at).toISOString().slice(0, 10);

      const { data: expense, error: insErr } = await supabase
        .from("expenses")
        .insert({
          title: row.merchant ?? "법인카드 사용",
          type_id: type.id,
          vendor_name: row.merchant,
          total_amount: row.amount,
          supply_amount: supply,
          vat_amount: vat,
          vat_included: true,
          purchase_date: expenseDate,
          payment_date: expenseDate,
          status: "paid",
          purchase_tax_invoice_received: false,
          purchase_tax_invoice_not_required: true,
          memo: row.description ?? null,
          source: "card",
          card_transaction_id: row.id,
          receipt_url: row.receipt_url,
        })
        .select("id")
        .single();

      if (insErr || !expense) {
        console.error("매입 생성 실패:", insErr?.message);
        continue;
      }

      const { error: updErr } = await supabase
        .from("card_transactions")
        .update({ status: "confirmed", expense_id: expense.id, type_id: type.id })
        .eq("id", row.id);
      if (updErr) {
        console.error("거래 상태 갱신 실패:", updErr.message);
        continue;
      }

      successCount += 1;
    }
    setBulkBusy(false);

    sendLog(
      "CONFIRM_CARD_TRANSACTION_BULK",
      `카드거래 일괄 매입확정: ${successCount}건`,
      { resource: "card_transaction" }
    );

    if (successCount > 0) toast.success(`${successCount}건 매입확정 및 지급완료 처리됨`);
    if (successCount < targets.length)
      toast.error(`${targets.length - successCount}건은 처리 중 오류로 건너뜀`);
    clearSelection();
    await fetchRows();
  };

  // 빠른필터 토글 색
  const quickFilterBtn = (active: boolean) =>
    `cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
    }`;

  return (
    <PageShell>
      <PageHeader
        title="카드사용내역"
        description="SMS로 들어온 법인카드 거래를 검토하고 영수증·적요를 첨부해 매입으로 확정합니다. 체크카드 결제는 매입일·지급일을 모두 결제일로 등록합니다."
        actions={
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={loading || pdfDownloading || filtered.length === 0}
          >
            <Download className="h-4 w-4" />
            {pdfDownloading ? "생성 중..." : "PDF 다운로드"}
          </Button>
        }
      />

      <StatsGrid className="grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="표시"
          value={`${totalCountFiltered}건`}
          icon={Receipt}
          tone="brand"
          compact
        />
        <StatCard
          label="미확정"
          value={`${pendingCountFiltered}건`}
          icon={Receipt}
          tone="warning"
          compact
        />
        <StatCard
          label="영수증 미첨부"
          value={`${missingReceiptCountFiltered}건`}
          icon={Camera}
          tone={missingReceiptCountFiltered > 0 ? "warning" : "info"}
          compact
        />
        <StatCard
          label="합계"
          value={mask("amount", `${monthAmountFiltered.toLocaleString("ko-KR")}원`)}
          mobileValue={formatAmountInMan(monthAmountFiltered)}
          icon={Wallet}
          tone="info"
          sensitive="amount"
          compact
        />
      </StatsGrid>

      {/* 필터 / 검색 라인 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="가맹점·적요 검색"
              className="h-9 pl-8"
            />
          </div>
          {currentEmployeeId && (
            <button
              type="button"
              onClick={() => setOnlyMine((v) => !v)}
              className={quickFilterBtn(onlyMine)}
              title="내 카드만 보기"
            >
              내 카드만
            </button>
          )}
          <button
            type="button"
            onClick={() => setOnlyMissingReceipt((v) => !v)}
            className={quickFilterBtn(onlyMissingReceipt)}
          >
            영수증 미첨부
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={quickFilterBtn(statusFilter === opt.value)}
              >
                {opt.label}
                {opt.value !== "all" && (
                  <span className="ml-1 opacity-70">
                    {rows.filter((r) => r.status === opt.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">·</span>
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={quickFilterBtn(period === opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 벌크 액션바 */}
      {selectedIds.length > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium">선택 {selectedIds.length}건</span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMemoDialogOpen(true)}
            disabled={bulkBusy}
          >
            적요 일괄
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkIgnore}
            disabled={bulkBusy}
          >
            <XCircle className="h-4 w-4" />
            무시 처리
          </Button>
          {canConfirm && (
            <Button size="sm" onClick={handleBulkConfirm} disabled={bulkBusy}>
              <CheckCircle2 className="h-4 w-4" />
              매입확정
            </Button>
          )}
          {selectedAllDeletable && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkBusy}
              title="파싱 실패 / 무시 처리된 거래만 영구 삭제 (되돌릴 수 없음)"
            >
              <Trash2 className="h-4 w-4" />
              영구 삭제
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={clearSelection}
            disabled={bulkBusy}
          >
            선택해제
          </Button>
        </div>
      )}

      {loading ? (
        <LoadingState label="카드 거래 목록을 불러오는 중..." />
      ) : error ? (
        <ErrorState onRetry={() => void fetchRows()} />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-background/40 p-10 text-center">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">표시할 거래가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                선택한 필터에 해당하는 거래가 없습니다.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setStatusFilter("all");
                  setPeriod("all");
                  setQuery("");
                  setOnlyMine(false);
                  setOnlyMissingReceipt(false);
                }}
              >
                필터 초기화
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
        {/* 모바일: 카드 그리드 */}
        <div className="grid gap-2 md:hidden">
          {filtered.map((row) => {
            const isSelected = selected.has(row.id);
            const goDetail = () => router.push(`/dashboard/card-transactions/${row.id}`);
            const isFailed = row.parse_status === "failed";
            const receiptUrl = row.receipt_url;
            return (
              <div
                key={row.id}
                className={`rounded-xl border p-3 transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : isFailed
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border/70 bg-background/40"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleRow(row.id)}
                    className="mt-0.5 size-4 cursor-pointer"
                    aria-label="선택"
                  />
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={goDetail}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {row.merchant ? mask("customer_name", row.merchant) : "(가맹점 미상)"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatApprovedAt(row.approved_at)}
                          {row.card?.holder?.name
                            ? ` · ${mask("name", row.card.holder.name)}`
                            : " · 미매핑"}
                        </p>
                      </div>
                      <p className="shrink-0 text-right text-sm font-semibold">
                        {row.currency !== "KRW" && row.foreign_amount != null ? (
                          <span className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[9px]">
                              {row.currency}
                            </Badge>
                            <span>{mask("amount", row.foreign_amount.toLocaleString("ko-KR"))}</span>
                          </span>
                        ) : (
                          mask("amount", `${row.amount.toLocaleString("ko-KR")}원`)
                        )}
                      </p>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant={statusVariant(row.status)} className="text-[10px]">
                        {CARD_TRANSACTION_STATUS_LABEL[row.status]}
                      </Badge>
                      {isFailed && (
                        <Badge variant="destructive" className="text-[10px]">
                          파싱 실패
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* 적요 + 영수증 */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <InlineMemoCell
                      initialValue={row.description}
                      disabled={row.status !== "pending"}
                      onSave={(v) => saveDescription(row.id, v)}
                    />
                  </div>
                  <input
                    ref={(el) => {
                      setReceiptInputRef(row.id, "camera", el);
                    }}
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    hidden
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (file) void handleReceiptUpload(row.id, file);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={(el) => {
                      setReceiptInputRef(row.id, "file", el);
                    }}
                    type="file"
                    accept="image/*,application/pdf"
                    hidden
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (file) void handleReceiptUpload(row.id, file);
                      e.target.value = "";
                    }}
                  />
                  {receiptUrl ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openReceiptPreview(receiptUrl);
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700"
                    >
                      <Eye className="size-3.5" />
                      영수증
                    </button>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          disabled={uploadingId === row.id || row.status !== "pending"}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-amber-400 px-2 py-1.5 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        >
                          <Camera className="size-3.5" />
                          {uploadingId === row.id ? "업로드" : "영수증"}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerReceiptInput(row.id, "camera");
                          }}
                        >
                          <Camera className="size-4" />
                          사진 촬영
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerReceiptInput(row.id, "file");
                          }}
                        >
                          <ImageUp className="size-4" />
                          파일 선택
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 데스크탑: 테이블 */}
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-border/70 bg-background/40">
          <table className="w-full text-sm">
            <thead className="border-b border-border/70 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-3 w-9">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAllFiltered}
                    className="size-4 cursor-pointer"
                    aria-label="전체 선택"
                  />
                </th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">승인 시각</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">직원</th>
                <th className="px-3 py-3 font-medium">가맹점</th>
                <th className="px-3 py-3 font-medium text-right whitespace-nowrap">금액</th>
                <th className="px-3 py-3 font-medium">적요</th>
                <th className="px-3 py-3 font-medium text-center whitespace-nowrap">영수증</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isSelected = selected.has(row.id);
                const goDetail = () =>
                  router.push(`/dashboard/card-transactions/${row.id}`);
                const isFailed = row.parse_status === "failed";
                const isPartial = row.parse_status === "partial";
                const receiptUrl = row.receipt_url;
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-border/50 last:border-0 transition-colors ${
                      isSelected
                        ? "bg-primary/5"
                        : isFailed
                          ? "bg-destructive/5 hover:bg-destructive/10"
                          : "hover:bg-muted/40"
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="size-4 cursor-pointer"
                        aria-label="선택"
                      />
                    </td>
                    <td
                      className="cursor-pointer px-3 py-2.5 whitespace-nowrap text-xs"
                      onClick={goDetail}
                    >
                      {formatApprovedAt(row.approved_at)}
                    </td>
                    <td
                      className="cursor-pointer px-3 py-2.5"
                      onClick={goDetail}
                    >
                      {row.card?.holder?.name ? (
                        <span className="text-sm">{mask("name", row.card.holder.name)}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">미매핑</span>
                      )}
                    </td>
                    <td
                      className="cursor-pointer px-3 py-2.5 font-medium"
                      onClick={goDetail}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span>{row.merchant ? mask("customer_name", row.merchant) : "(가맹점 미상)"}</span>
                        {isFailed && (
                          <span className="text-[10px] font-normal text-destructive">
                            파싱 실패 — SMS 확인 필요
                          </span>
                        )}
                        {isPartial && !isFailed && (
                          <span className="text-[10px] font-normal text-amber-600">
                            일부 필드 누락
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className="cursor-pointer px-3 py-2.5 text-right whitespace-nowrap"
                      onClick={goDetail}
                    >
                      {row.currency !== "KRW" && row.foreign_amount != null ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {row.currency}
                          </Badge>
                          <span>{mask("amount", row.foreign_amount.toLocaleString("ko-KR"))}</span>
                        </span>
                      ) : (
                        mask("amount", `${row.amount.toLocaleString("ko-KR")}원`)
                      )}
                    </td>
                    <td className="px-3 py-2.5 min-w-[180px]">
                      <InlineMemoCell
                        initialValue={row.description}
                        disabled={row.status !== "pending"}
                        onSave={(v) => saveDescription(row.id, v)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        ref={(el) => {
                          setReceiptInputRef(row.id, "camera", el);
                        }}
                        type="file"
                        accept="image/*,application/pdf"
                        capture="environment"
                        hidden
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          const file = e.target.files?.[0];
                          if (file) void handleReceiptUpload(row.id, file);
                          e.target.value = "";
                        }}
                      />
                      <input
                        ref={(el) => {
                          setReceiptInputRef(row.id, "file", el);
                        }}
                        type="file"
                        accept="image/*,application/pdf"
                        hidden
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          const file = e.target.files?.[0];
                          if (file) void handleReceiptUpload(row.id, file);
                          e.target.value = "";
                        }}
                      />
                      {receiptUrl ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openReceiptPreview(receiptUrl);
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                          title="영수증 미리보기"
                        >
                          <Eye className="size-3.5" />
                          첨부됨
                        </button>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              disabled={uploadingId === row.id || row.status !== "pending"}
                              className="inline-flex items-center gap-1 rounded-md border border-dashed border-amber-400 px-1.5 py-0.5 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                            >
                              <Camera className="size-3.5" />
                              {uploadingId === row.id ? "업로드중" : "첨부"}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerReceiptInput(row.id, "camera");
                              }}
                            >
                              <Camera className="size-4" />
                              사진 촬영
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerReceiptInput(row.id, "file");
                              }}
                            >
                              <ImageUp className="size-4" />
                              파일 선택
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                    <td
                      className="cursor-pointer px-3 py-2.5"
                      onClick={goDetail}
                    >
                      <Badge variant={statusVariant(row.status)}>
                        {CARD_TRANSACTION_STATUS_LABEL[row.status]}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* 적요 일괄 입력 다이얼로그 */}
      <Dialog open={memoDialogOpen} onOpenChange={setMemoDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>적요 일괄 입력</DialogTitle>
            <DialogDescription>
              선택한 {selectedIds.length}건에 동일한 적요를 적용합니다. 빈 값으로 두면 적요가 제거됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-memo">적요</Label>
            <textarea
              id="bulk-memo"
              value={bulkMemo}
              onChange={(e) => setBulkMemo(e.target.value)}
              placeholder="예: 거래처 미팅 6인 식사"
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemoDialogOpen(false)} disabled={bulkBusy}>
              취소
            </Button>
            <Button onClick={handleBulkSetMemo} disabled={bulkBusy}>
              {bulkBusy ? "적용 중..." : "적용"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 영수증 미리보기 다이얼로그 */}
      <Dialog open={previewUrl !== null} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>영수증 미리보기</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/70 bg-muted/20">
            {previewUrl && isPdfReceiptUrl(previewUrl) ? (
              <div className="flex min-h-48 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                PDF 영수증은 새 창에서 열어 확인해 주세요.
              </div>
            ) : previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="영수증"
                className="mx-auto h-auto max-h-[70dvh] w-full object-contain"
              />
            ) : null}
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setPreviewUrl(null)}>
              닫기
            </Button>
            {previewUrl ? (
              <Button asChild>
                <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  새 창에서 열기
                </a>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </PageShell>
  );
}
