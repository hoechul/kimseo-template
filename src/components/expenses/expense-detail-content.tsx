"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useState } from "react";
import {
  BadgeDollarSign,
  CheckCircle2,
  ChevronDown,
  PencilLine,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useMasking } from "@/components/masking-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  EXPENSE_STATUS_LABEL,
  type Expense,
  type ExpenseStatus,
  type ExpenseStatusHistory,
} from "@/lib/types";

const currencyFormatter = new Intl.NumberFormat("ko-KR");

function formatCurrency(amount: number) {
  return `${currencyFormatter.format(amount)}원`;
}

function formatDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "-";
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yy}-${mm}-${dd} ${hh}:${mi}`;
}

const TAX_CATEGORY_LABEL: Record<string, string> = {
  personal_withholding: "개인(원천 3.3%)",
  business_vat: "사업자(세금계산서)",
  corporate_vat: "법인(세금계산서)",
  none: "해당없음",
};

const STATUS_BADGE_CLASS: Record<ExpenseStatus, string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-700",
  requested: "border-sky-300 bg-sky-100 text-sky-900",
  approved: "border-emerald-300 bg-emerald-100 text-emerald-900",
  rejected: "border-rose-300 bg-rose-100 text-rose-900",
  scheduled: "border-violet-300 bg-violet-100 text-violet-900",
  paid: "border-emerald-400 bg-emerald-200 text-emerald-900",
  cancelled: "border-slate-300 bg-slate-100 text-slate-500",
};

const SOURCE_LABEL: Record<Expense["source"], string> = {
  manual: "직접 등록",
  card: "법인카드",
  recurring: "반복 매입",
};

export type ExpenseWithVendor = Expense & {
  vendor?: { id: string; name: string } | null;
};

interface ExpenseDetailContentProps {
  expense: ExpenseWithVendor;
  history: ExpenseStatusHistory[];
  /** "modal" 시 일부 컨테이너/타이틀 영역을 외부에서 그릴 수 있도록 압축 */
  variant?: "page" | "modal";
  onEdit?: () => void;
  onDelete: () => Promise<void> | void;
  /** 결의 액션 처리. action에 따라 body 인자를 받음. */
  onStatusAction: (
    action: "submit" | "approve" | "reject" | "pay" | "cancel",
    body?: Record<string, unknown>
  ) => Promise<boolean>;
}

export function ExpenseDetailContent({
  expense,
  history,
  variant = "page",
  onEdit,
  onDelete,
  onStatusAction,
}: ExpenseDetailContentProps) {
  const { mask } = useMasking();
  const [actionLoading, setActionLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const status = expense.status;
  const statusLabel = EXPENSE_STATUS_LABEL[status] ?? status;
  const isPaid = Boolean(expense.payment_date);
  const paymentLabel = isPaid ? "지급완료" : "미지급";

  const taxInvoiceLabel = expense.purchase_tax_invoice_not_required
    ? "수취 불필요"
    : expense.purchase_tax_invoice_received
      ? "수취완료"
      : "미수취";
  const taxInvoiceDescription = expense.purchase_tax_invoice_not_required
    ? "수취가 필요하지 않은 매입"
    : expense.purchase_tax_invoice_received
      ? `수취일 ${formatDate(expense.purchase_tax_invoice_date)}`
      : "아직 수취하지 않았습니다";

  const taxCategoryLabel = expense.tax_category
    ? TAX_CATEGORY_LABEL[expense.tax_category] ?? expense.tax_category
    : "-";
  const sourceLabel = SOURCE_LABEL[expense.source] ?? "직접 등록";

  const runStatusAction = useCallback(
    async (
      action: "submit" | "approve" | "reject" | "pay" | "cancel",
      body?: Record<string, unknown>
    ) => {
      setActionLoading(true);
      try {
        return await onStatusAction(action, body);
      } finally {
        setActionLoading(false);
      }
    },
    [onStatusAction]
  );

  const handleSubmitForApproval = async () => {
    if (!confirm("매입 결의를 올리시겠습니까?")) return;
    const ok = await runStatusAction("submit");
    if (ok) toast.success("매입 결의가 올라갔습니다.");
  };

  const handleApprove = async () => {
    if (!confirm("이 매입을 승인하시겠습니까?")) return;
    const ok = await runStatusAction("approve");
    if (ok) toast.success("매입이 승인되었습니다.");
  };

  const handleReject = async () => {
    const reason = window.prompt("반려 사유를 입력해 주세요.");
    if (!reason || !reason.trim()) return;
    const ok = await runStatusAction("reject", { reason: reason.trim() });
    if (ok) toast.success("매입이 반려되었습니다.");
  };

  const handleMarkPaid = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const input = window.prompt("지급일을 입력해 주세요. (YYYY-MM-DD)", today);
    if (!input) return;
    const trimmed = input.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      toast.error("지급일 형식은 YYYY-MM-DD 입니다.");
      return;
    }
    const ok = await runStatusAction("pay", { payment_date: trimmed });
    if (ok) toast.success("매입이 지급 완료 처리되었습니다.");
  };

  const handleCancel = async () => {
    if (!confirm("이 매입을 취소하시겠습니까?")) return;
    const reason = window.prompt("취소 사유를 입력해 주세요. (선택)") ?? "";
    const ok = await runStatusAction("cancel", reason.trim() ? { reason: reason.trim() } : {});
    if (ok) toast.success("매입이 취소되었습니다.");
  };

  const handleDelete = async () => {
    if (!confirm(`"${expense.title}" 매입을 삭제하시겠습니까?`)) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const canEdit =
    status === "draft" ||
    status === "rejected" ||
    (expense.source === "card" && status !== "cancelled");
  const canCancel =
    status === "draft" || status === "requested" || status === "approved" || status === "scheduled";

  const amountRows: Array<{ label: string; value: ReactNode }> = [
    { label: "매입총액", value: mask("amount", formatCurrency(expense.total_amount)) },
    { label: "공급가액", value: mask("amount", formatCurrency(expense.supply_amount)) },
    { label: "부가세", value: mask("amount", formatCurrency(expense.vat_amount)) },
  ];
  if (expense.tax_category === "personal_withholding") {
    amountRows.push(
      {
        label: "원천징수",
        value: `${mask("amount", formatCurrency(expense.withholding_amount))} (${(
          Number(expense.withholding_rate ?? 0.033) * 100
        ).toFixed(1)}%)`,
      },
      { label: "실지급액", value: mask("amount", formatCurrency(expense.net_payment_amount)) }
    );
  }

  return (
    <div className="space-y-5">
      {variant === "modal" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={STATUS_BADGE_CLASS[status]}>
            {statusLabel}
          </Badge>
          <Badge
            variant={isPaid ? "default" : "outline"}
            className={!isPaid ? "border-amber-300 bg-amber-100 text-amber-900" : undefined}
          >
            {paymentLabel}
          </Badge>
          {expense.expense_types?.name ? (
            <Badge variant="secondary">{expense.expense_types.name}</Badge>
          ) : null}
          <Badge variant="secondary">{sourceLabel}</Badge>
        </div>
      ) : null}

      {/* 핵심 요약 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="총 매입금액"
          value={mask("amount", formatCurrency(expense.total_amount))}
          description={
            expense.tax_category === "personal_withholding"
              ? `실지급 ${mask("amount", formatCurrency(expense.net_payment_amount))}`
              : `공급가 ${mask("amount", formatCurrency(expense.supply_amount))} / VAT ${mask(
                  "amount",
                  formatCurrency(expense.vat_amount)
                )}`
          }
          tone="brand"
        />
        <SummaryCard
          label="지급 상태"
          value={paymentLabel}
          description={
            isPaid
              ? `지급일 ${formatDate(expense.payment_date)}`
              : `매입일 ${formatDate(expense.purchase_date)}`
          }
          tone={isPaid ? "positive" : "warning"}
        />
        <SummaryCard
          label="매입세금계산서"
          value={taxInvoiceLabel}
          description={taxInvoiceDescription}
          tone={
            expense.purchase_tax_invoice_not_required
              ? "muted"
              : expense.purchase_tax_invoice_received
                ? "positive"
                : "warning"
          }
        />
      </div>

      {/* 상세 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <InfoBlock title="매입 정보">
          <InfoRow label="매입항목" value={mask("title", expense.title)} />
          <InfoRow
            label="매입처"
            value={
              expense.vendor ? (
                <Link
                  href={`/dashboard/customers/${expense.vendor.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {mask("customer_name", expense.vendor.name)}
                </Link>
              ) : expense.vendor_name ? (
                mask("customer_name", expense.vendor_name)
              ) : (
                "-"
              )
            }
          />
          <InfoRow label="매입구분" value={taxCategoryLabel} />
          <InfoRow label="매입유형" value={expense.expense_types?.name || "-"} />
          <InfoRow
            label="등록경로"
            value={
              expense.source === "card" ? `${sourceLabel} 확정 시 자동 지급완료` : sourceLabel
            }
          />
          <InfoRow label="매입일" value={formatDate(expense.purchase_date)} />
          {expense.rejected_reason ? (
            <InfoRow label="반려 사유" value={expense.rejected_reason} multiline />
          ) : null}
          {expense.memo ? <InfoRow label="비고" value={expense.memo} multiline /> : null}
        </InfoBlock>

        <InfoBlock title="금액 / 연결">
          {amountRows.map((row) => (
            <InfoRow key={row.label} label={row.label} value={row.value} />
          ))}
          <div className="my-2 h-px bg-border/60" />
          <InfoRow
            label="프로젝트"
            value={
              expense.projects ? (
                <Link
                  href={`/dashboard/projects/${expense.projects.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  [{expense.projects.project_number}] {mask("title", expense.projects.name)}
                </Link>
              ) : (
                "-"
              )
            }
          />
          {expense.card_transaction_id ? (
            <InfoRow
              label="카드거래"
              value={
                <Link
                  href={`/dashboard/card-transactions/${expense.card_transaction_id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  카드사용내역 보기
                </Link>
              }
            />
          ) : null}
          {expense.receipt_url ? (
            <InfoRow
              label="영수증"
              value={
                <a
                  href={expense.receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  영수증 열기
                </a>
              }
            />
          ) : null}
        </InfoBlock>
      </div>

      {/* 결의 이력 토글 */}
      <div className="rounded-xl border border-border/60 bg-card/80">
        <button
          type="button"
          onClick={() => setShowHistory((open) => !open)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
          aria-expanded={showHistory}
        >
          <span>결의 이력 {history.length > 0 ? `(${history.length})` : ""}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              showHistory ? "rotate-180" : "rotate-0"
            )}
          />
        </button>
        {showHistory ? (
          <div className="border-t border-border/60 px-4 py-3">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">이력이 없습니다.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {history.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span className="w-32 shrink-0 text-muted-foreground">
                      {formatDateTime(entry.created_at)}
                    </span>
                    <div className="flex-1">
                      <p>
                        <span className="text-muted-foreground">
                          {entry.from_status
                            ? EXPENSE_STATUS_LABEL[entry.from_status] ?? entry.from_status
                            : "-"}
                        </span>
                        {" → "}
                        <span className="font-medium">
                          {EXPENSE_STATUS_LABEL[entry.to_status] ?? entry.to_status}
                        </span>
                        {entry.actor_name ? (
                          <span className="ml-2 text-muted-foreground">
                            by {mask("name", entry.actor_name)}
                          </span>
                        ) : null}
                      </p>
                      {entry.reason ? (
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                          {entry.reason}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </div>

      {/* 액션바 */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {status === "draft" ? (
          <Button onClick={() => void handleSubmitForApproval()} disabled={actionLoading}>
            <Send className="h-4 w-4" />
            결의 올리기
          </Button>
        ) : null}
        {status === "requested" ? (
          <>
            <Button onClick={() => void handleApprove()} disabled={actionLoading}>
              <CheckCircle2 className="h-4 w-4" />
              승인
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleReject()}
              disabled={actionLoading}
            >
              <XCircle className="h-4 w-4" />
              반려
            </Button>
          </>
        ) : null}
        {(status === "approved" || status === "scheduled") ? (
          <Button onClick={() => void handleMarkPaid()} disabled={actionLoading}>
            <BadgeDollarSign className="h-4 w-4" />
            지급 완료
          </Button>
        ) : null}
        {canCancel ? (
          <Button variant="outline" onClick={() => void handleCancel()} disabled={actionLoading}>
            취소
          </Button>
        ) : null}
        {canEdit && onEdit ? (
          <Button variant="outline" onClick={onEdit}>
            <PencilLine className="h-4 w-4" />
            수정
          </Button>
        ) : null}
        <Button
          variant="destructive"
          onClick={() => void handleDelete()}
          disabled={deleting}
        >
          <Trash2 className="h-4 w-4" />
          {deleting ? "삭제 중..." : "삭제"}
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  description,
  tone = "muted",
}: {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  tone?: "brand" | "positive" | "warning" | "muted";
}) {
  const toneClass = {
    brand: "border-primary/30 bg-primary/5",
    positive: "border-emerald-200 bg-emerald-50",
    warning: "border-amber-200 bg-amber-50",
    muted: "border-border/60 bg-muted/30",
  }[tone];
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", toneClass)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
      {description ? (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: ReactNode;
  multiline?: boolean;
}) {
  return (
    <div
      className={cn("flex gap-3 text-sm leading-6", multiline ? "flex-col" : "items-start")}
    >
      <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn("flex-1", multiline ? "whitespace-pre-wrap" : "")}>{value}</span>
    </div>
  );
}

export { STATUS_BADGE_CLASS };
