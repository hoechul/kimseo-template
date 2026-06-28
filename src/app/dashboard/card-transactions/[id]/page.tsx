"use client";

import { ArrowLeft, Camera, CheckCircle2, ImageUp, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { LoadingState, PageHeader, PageShell } from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { CardTransaction, ExpenseType } from "@/lib/types";
import { CARD_TRANSACTION_STATUS_LABEL } from "@/lib/types";

const RECEIPT_BUCKET = "expense-receipts";
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

type CardTxFull = CardTransaction & {
  card?: {
    id: string;
    last4: string;
    holder?: { id: string; name: string } | null;
  } | null;
  expense?: { id: string; title: string } | null;
};

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

function statusVariant(status: CardTransaction["status"]): "default" | "secondary" | "outline" {
  switch (status) {
    case "confirmed":
      return "default";
    case "ignored":
      return "outline";
    default:
      return "secondary";
  }
}

export default function CardTransactionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const txId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tx, setTx] = useState<CardTxFull | null>(null);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [description, setDescription] = useState("");
  const [canConfirm, setCanConfirm] = useState(false);

  const fetchTx = useCallback(async () => {
    setLoading(true);
    await supabase.auth.getSession();

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    setCanConfirm(false);
    if (authUser) {
      const { data: emp } = await supabase
        .from("employees")
        .select("employee_type, is_finance")
        .eq("auth_uid", authUser.id)
        .maybeSingle();
      if (emp) {
        setCanConfirm(emp.is_finance === true);
      }
    }

    const [txRes, typesRes] = await Promise.all([
      supabase
        .from("card_transactions")
        .select(
          "*, card:corporate_cards(id, last4, holder:employees!corporate_cards_holder_employee_id_fkey(id, name)), expense:expenses!card_transactions_expense_id_fkey(id, title)"
        )
        .eq("id", txId)
        .single(),
      supabase.from("expense_types").select("*").order("sort_order"),
    ]);

    if (txRes.error) {
      console.error("거래 조회 실패:", txRes.error.message);
      toast.error("거래 정보를 불러오지 못했습니다.");
      setTx(null);
    } else {
      const data = txRes.data as CardTxFull;
      setTx(data);
      setDescription(data.description ?? "");
    }
    setExpenseTypes((typesRes.data ?? []) as ExpenseType[]);
    setLoading(false);
  }, [supabase, txId]);

  useEffect(() => {
    void fetchTx();
  }, [fetchTx]);

  const persistFields = useCallback(
    async (patch: Partial<CardTransaction>) => {
      const { error } = await supabase.from("card_transactions").update(patch).eq("id", txId);
      if (error) {
        console.error("거래 갱신 실패:", error.message);
        toast.error("저장에 실패했습니다.");
        return false;
      }
      return true;
    },
    [supabase, txId]
  );

  const handleReceiptUpload = async (file: File) => {
    if (file.size > MAX_RECEIPT_BYTES) {
      toast.error("영수증은 10MB 이하로 업로드해주세요.");
      return;
    }
    setUploading(true);
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
      const { data } = supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(path);
      const publicUrl = data?.publicUrl;
      if (!publicUrl) {
        toast.error("영수증 주소를 가져오지 못했습니다.");
        return;
      }
      const ok = await persistFields({ receipt_url: publicUrl });
      if (ok) {
        toast.success("영수증이 첨부되었습니다.");
        await fetchTx();
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveReceipt = async () => {
    if (!confirm("영수증을 제거하시겠습니까?")) return;
    const ok = await persistFields({ receipt_url: null });
    if (ok) {
      toast.success("영수증이 제거되었습니다.");
      await fetchTx();
    }
  };

  const handleSaveMemo = async () => {
    const ok = await persistFields({
      description: description.trim() || null,
    });
    if (ok) toast.success("적요가 저장되었습니다.");
  };

  const handleIgnore = async () => {
    if (!confirm("이 거래를 무시 처리하시겠습니까? (매입에 반영하지 않습니다)")) return;
    const ok = await persistFields({ status: "ignored" });
    if (ok) {
      toast.success("거래를 무시 처리했습니다.");
      await fetchTx();
    }
  };

  const handleReopen = async () => {
    const ok = await persistFields({ status: "pending" });
    if (ok) {
      toast.success("미확정으로 되돌렸습니다.");
      await fetchTx();
    }
  };

  const handleConfirmToExpense = async () => {
    if (!tx) return;
    if (!canConfirm) {
      toast.error("매입확정은 재무팀 권한자만 처리할 수 있습니다.");
      return;
    }
    if (tx.currency !== "KRW") {
      toast.error("외화 결제는 KRW 환산 금액 입력이 필요합니다. (추후 지원)");
      return;
    }
    // 유형 미지정 시 자동 적용할 기본 유형 (운영비 → 잡비 → 첫 번째 순)
    const defaultType =
      expenseTypes.find((t) => t.account_code === "operating") ??
      expenseTypes.find((t) => t.account_code === "misc") ??
      expenseTypes[0];
    const resolvedType =
      (tx.type_id ? expenseTypes.find((t) => t.id === tx.type_id) : undefined) ??
      defaultType;
    if (!resolvedType) {
      toast.error("매입유형을 찾을 수 없습니다. 매입유형 설정을 확인해주세요.");
      return;
    }
    setConfirming(true);
    try {
      const expenseDate = new Date(tx.approved_at).toISOString().slice(0, 10);
      const title = tx.merchant ?? "법인카드 사용";
      const vatDeductible = resolvedType.is_vat_deductible !== false;
      const supplyAmount = vatDeductible ? Math.round(tx.amount / 1.1) : tx.amount;
      const vatAmount = vatDeductible ? tx.amount - supplyAmount : 0;
      const insertPayload = {
        title,
        type_id: resolvedType.id,
        vendor_name: tx.merchant,
        total_amount: tx.amount,
        supply_amount: supplyAmount,
        vat_amount: vatAmount,
        vat_included: true,
        purchase_date: expenseDate,
        payment_date: expenseDate,
        status: "paid",
        purchase_tax_invoice_received: false,
        purchase_tax_invoice_not_required: true,
        memo: description.trim() || null,
        source: "card",
        card_transaction_id: tx.id,
        receipt_url: tx.receipt_url,
      };

      const { data: expense, error: insertErr } = await supabase
        .from("expenses")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertErr) {
        console.error("매입 생성 실패:", insertErr.message);
        toast.error(`매입 생성 실패: ${insertErr.message}`);
        return;
      }

      const { error: updErr } = await supabase
        .from("card_transactions")
        .update({
          status: "confirmed",
          expense_id: expense.id,
          type_id: resolvedType.id,
          description: description.trim() || null,
        })
        .eq("id", tx.id);

      if (updErr) {
        toast.error(`거래 상태 갱신 실패: ${updErr.message}`);
        return;
      }

      sendLog(
        "CONFIRM_CARD_TRANSACTION",
        `카드거래 매입확정: ${title} ${tx.amount.toLocaleString()}원`,
        { resource: "card_transaction", resource_id: tx.id }
      );
      toast.success("매입확정 및 지급완료 처리되었습니다.");
      await fetchTx();
    } finally {
      setConfirming(false);
    }
  };

  if (loading) return <LoadingState title="거래 정보를 불러오는 중..." />;
  if (!tx) {
    return (
      <PageShell>
        <p className="text-muted-foreground">거래를 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/card-transactions")}>
          목록으로 돌아가기
        </Button>
      </PageShell>
    );
  }

  const isConfirmed = tx.status === "confirmed";
  const isIgnored = tx.status === "ignored";
  const isForeign = tx.currency !== "KRW";
  const amountDisplay = isForeign
    ? `${tx.currency} ${(tx.foreign_amount ?? 0).toLocaleString("ko-KR")}`
    : `${tx.amount.toLocaleString("ko-KR")}원`;

  const parseStatusLabel =
    tx.parse_status === "parsed"
      ? "정상"
      : tx.parse_status === "partial"
        ? "일부 필드 누락"
        : "파싱 실패";

  return (
    <PageShell compact>
      <PageHeader
        breadcrumbs={[
          { label: "카드사용내역", href: "/dashboard/card-transactions" },
          { label: tx.merchant ? mask("customer_name", tx.merchant) : "(가맹점 미상)" },
        ]}
        title={tx.merchant ? mask("customer_name", tx.merchant) : "(가맹점 미상)"}
        titleAccessory={
          <Badge variant={statusVariant(tx.status)}>{CARD_TRANSACTION_STATUS_LABEL[tx.status]}</Badge>
        }
        description={`${mask("amount", amountDisplay)} · ${new Date(tx.approved_at).toLocaleString("ko-KR")}`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/card-transactions">
              <ArrowLeft className="h-4 w-4" />
              목록
            </Link>
          </Button>
        }
      />

      {/* 거래 기본 정보 — 한 줄 메타 + 접힌 SMS */}
      <div className="rounded-2xl border border-border/70 bg-background/40 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">카드</span>
            {tx.card ? (
              <Link
                href={`/dashboard/cards/${tx.card.id}`}
                className="font-medium hover:text-primary"
              >
                {tx.card.last4}
              </Link>
            ) : tx.card_last4 ? (
              <span className="text-muted-foreground">{tx.card_last4} (미등록)</span>
            ) : (
              <span className="text-muted-foreground">미매핑</span>
            )}
            {tx.card?.holder?.name && (
              <span className="text-muted-foreground">
                · {mask("name", tx.card.holder.name)}
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">금액</span>
            {isForeign && (
              <Badge variant="outline" className="text-[10px]">
                {tx.currency}
              </Badge>
            )}
            <span className="font-semibold">{mask("amount", amountDisplay)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">승인</span>
            <span>{new Date(tx.approved_at).toLocaleString("ko-KR")}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">파싱</span>
            <span>{parseStatusLabel}</span>
          </span>
        </div>
        <details open className="mt-2 group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
            원본 SMS
          </summary>
          <pre className="mt-1.5 whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-[11px] leading-snug">
            {tx.raw_text}
          </pre>
        </details>
      </div>

      {/* 적요 + 영수증 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-2xl border border-border/70 bg-background/40 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">적요</h3>
            {!isConfirmed && !isIgnored && (
              <Button size="sm" variant="outline" onClick={handleSaveMemo} className="h-7 px-2 text-xs">
                저장
              </Button>
            )}
          </div>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="예: 거래처 미팅 6인 식사, 사무실 비품 구매"
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            disabled={isConfirmed || isIgnored}
          />
        </div>

        <div className="space-y-2 rounded-2xl border border-border/70 bg-background/40 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">영수증</h3>
            {tx.receipt_url && !isConfirmed && (
              <Button size="sm" variant="outline" onClick={handleRemoveReceipt} className="h-7 px-2 text-xs">
                <Trash2 className="h-3.5 w-3.5" />
                제거
              </Button>
            )}
            {!tx.receipt_url && (
              <>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleReceiptUpload(file);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleReceiptUpload(file);
                    e.target.value = "";
                  }}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      disabled={uploading || isConfirmed || isIgnored}
                      className="h-7 px-2 text-xs"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      {uploading ? "업로드 중" : "촬영/선택"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
                      <Camera className="size-4" />
                      사진 촬영
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                      <ImageUp className="size-4" />
                      파일 선택
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
          {tx.receipt_url ? (
            <a
              href={tx.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-lg border border-border/70"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tx.receipt_url}
                alt="영수증"
                className="w-full object-contain"
                style={{ maxHeight: 220 }}
              />
            </a>
          ) : (
            <p className="rounded-md bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
              영수증이 필요한 경우 우측 버튼으로 사진을 첨부해주세요.
            </p>
          )}
        </div>
      </div>

      {/* 액션 영역 — 컴팩트 */}
      {isConfirmed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/40 px-4 py-3 text-sm">
          <p>
            이 거래는 매입으로 확정되었습니다.{" "}
            {tx.expense_id && (
              <Link
                href={`/dashboard/expenses/${tx.expense_id}`}
                className="font-medium text-primary hover:underline"
              >
                매입 상세 보기 →
              </Link>
            )}
          </p>
          {canConfirm && (
            <Button size="sm" variant="outline" onClick={handleReopen}>
              미확정으로 되돌리기
            </Button>
          )}
        </div>
      ) : isIgnored ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <p>이 거래는 무시 처리되었습니다.</p>
          <Button size="sm" variant="outline" onClick={handleReopen}>
            미확정으로 되돌리기
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/70 bg-background/40 p-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canConfirm && (
              <Button onClick={handleConfirmToExpense} disabled={confirming}>
                <CheckCircle2 className="h-4 w-4" />
                {confirming ? "확정 중..." : "매입으로 확정"}
              </Button>
            )}
            <Button variant="outline" onClick={handleIgnore}>
              <XCircle className="h-4 w-4" />
              무시
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {canConfirm
              ? "매입유형은 운영비로 자동 적용됩니다 (필요 시 매입 상세에서 수정). 부가세는 총액의 1/11로 자동 계산 (공제불가 유형은 0원). 체크카드 거래이므로 매입확정 즉시 결제일 기준 지급완료 처리됩니다."
              : "매입확정은 재무팀 권한자만 수행할 수 있습니다. 적요·영수증 첨부와 무시 처리는 가능합니다."}
          </p>
        </div>
      )}
    </PageShell>
  );
}
