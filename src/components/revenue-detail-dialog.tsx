"use client";

import Link from "next/link";
import { ExternalLink, PencilLine, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RevenueTaxInvoiceActions } from "@/components/revenue-tax-invoice-actions";
import type { Revenue } from "@/lib/types";

interface RevenueDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revenue: Revenue | null;
  onEdit: () => void;
  onDelete: () => void;
  onRevenueUpdated?: (revenue: Revenue) => void;
  deleting?: boolean;
}

const currencyFormatter = new Intl.NumberFormat("ko-KR");

function formatCurrency(amount: number) {
  return `${currencyFormatter.format(amount)}원`;
}

function formatDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "-";
}

export function RevenueDetailDialog({
  open,
  onOpenChange,
  revenue,
  onEdit,
  onDelete,
  onRevenueUpdated,
  deleting = false,
}: RevenueDetailDialogProps) {
  if (!revenue) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl" />
      </Dialog>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const isDelayed = Boolean(
    !revenue.is_paid &&
      revenue.expected_payment_date &&
      revenue.expected_payment_date < today
  );
  const paymentLabel = revenue.is_paid
    ? "입금완료"
    : isDelayed
      ? "입금지연"
      : "미입금";
  const paymentBadgeClass = revenue.is_paid
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : isDelayed
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-amber-300 bg-amber-100 text-amber-900";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{revenue.title}</span>
            <Badge variant="outline" className={paymentBadgeClass}>
              {paymentLabel}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            매출 상세 정보와 세금계산서 발행 상태를 확인합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <Section title="기본 정보">
            <Row label="제목" value={revenue.title} />
            {revenue.channel ? <Row label="판매채널" value={revenue.channel} /> : null}
            {revenue.product_name ? (
              <Row label="상품명" value={revenue.product_name} />
            ) : null}
            {revenue.external_order_id ? (
              <Row label="주문번호" value={revenue.external_order_id} />
            ) : null}
            <Row label="매출금액" value={formatCurrency(revenue.total_amount)} />
            <Row label="공급가액" value={formatCurrency(revenue.supply_amount)} />
            <Row label="부가세" value={formatCurrency(revenue.vat_amount)} />
            <Row
              label="부가세 포함"
              value={revenue.vat_included ? "예" : "아니오"}
            />
            <Row label="매출일" value={formatDate(revenue.revenue_date)} />
          </Section>

          <Section title="입금 정보">
            <Row
              label="상태"
              value={
                <Badge variant="outline" className={paymentBadgeClass}>
                  {paymentLabel}
                </Badge>
              }
            />
            <Row
              label="예상 입금일"
              value={formatDate(revenue.expected_payment_date)}
            />
            <Row label="입금일" value={formatDate(revenue.paid_date)} />
          </Section>

          <Section title="세금계산서">
            {revenue.tax_invoice_date ? (
              <Row label="발행일" value={formatDate(revenue.tax_invoice_date)} />
            ) : null}
            {revenue.tax_invoice_url ? (
              <Row
                label="문서"
                value={
                  <Link
                    href={revenue.tax_invoice_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    발행 문서 열기
                    <ExternalLink className="size-3.5" />
                  </Link>
                }
              />
            ) : null}
            {revenue.tax_invoice_error_message ? (
              <Row
                label="오류"
                value={
                  <span className="whitespace-pre-wrap break-words text-rose-700">
                    {revenue.tax_invoice_error_code
                      ? `[${revenue.tax_invoice_error_code}] `
                      : ""}
                    {revenue.tax_invoice_error_message}
                  </span>
                }
              />
            ) : null}
            <div className="border-b border-border/60 px-3 py-3 last:border-b-0">
              <RevenueTaxInvoiceActions
                revenue={revenue}
                onRevenueUpdated={onRevenueUpdated}
              />
            </div>
          </Section>

          {revenue.memo?.trim() ? (
            <Section title="비고">
              <p className="whitespace-pre-wrap break-words text-foreground">
                {revenue.memo}
              </p>
            </Section>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/dashboard/revenues/${revenue.id}`}>
              <ExternalLink className="h-4 w-4" />
              전체 페이지로 보기
            </Link>
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? "삭제 중..." : "삭제"}
            </Button>
            <Button onClick={onEdit} disabled={deleting}>
              <PencilLine className="h-4 w-4" />
              수정
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/10">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border/60 px-3 py-2 last:border-b-0">
      <p className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <div className="text-sm leading-6 text-foreground">{value}</div>
    </div>
  );
}
