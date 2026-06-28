"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { sendLog } from "@/lib/log-client";
import { Button } from "@/components/ui/button";
import { QUOTATION_STATUS_COLORS } from "@/lib/quotation-constants";
import { LoadingState } from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import type { Quotation } from "@/lib/types";

export default function QuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const quotationId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const { mask, enabled: maskEnabled, setEnabled: setMaskEnabled } = useMasking();

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [versions, setVersions] = useState<{ id: string; quotation_number: string; version: number; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const quotationRes = await supabase
      .from("quotations")
      .select("*, customers(id, name), projects(id, project_number, name), quotation_items(*)")
      .eq("id", quotationId)
      .single();

    if (quotationRes.error) {
      console.error("견적 정보 조회 실패:", quotationRes.error.message);
      toast.error("견적 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setLoading(false);
      return;
    }
    setQuotation(quotationRes.data);

    // 같은 계열 버전 조회 (parent_id 또는 자기 자신이 parent인 것들)
    const q = quotationRes.data;
    if (q) {
      const rootId = q.parent_id ?? q.id;
      const { data: versionData, error: versionError } = await supabase
        .from("quotations")
        .select("id, quotation_number, version, created_at")
        .or(`id.eq.${rootId},parent_id.eq.${rootId}`)
        .order("version", { ascending: true });
      if (versionError) console.error("견적 버전 조회 실패:", versionError.message);
      setVersions(versionData ?? []);
    }

    setLoading(false);
  }, [supabase, quotationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async () => {
    if (!confirm("이 견적을 삭제하시겠습니까?")) return;
    setDeleting(true);
    const { error } = await supabase.from("quotations").delete().eq("id", quotationId);
    if (error) {
      console.error("견적 삭제 실패:", error.message);
      toast.error("견적 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setDeleting(false);
      return;
    }
    toast.success("견적이 삭제되었습니다.");
    sendLog("DELETE_QUOTATION", `견적 삭제: ${quotation?.quotation_number}`, {
      resource: "quotation",
      resource_id: quotationId,
    });
    router.push("/dashboard/quotations");
  };

  const handleDownloadPdf = async () => {
    if (!pdfRef.current || !quotation) return;
    setPdfLoading(true);
    const prevMaskEnabled = maskEnabled;
    if (prevMaskEnabled) {
      setMaskEnabled(false);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgWidth = 210; // A4 mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pdf = new jsPDF("p", "mm", "a4");
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgWidth, imgHeight);
      pdf.save(`${quotation.quotation_number}.pdf`);
    } catch {
      toast.error("PDF 생성에 실패했습니다.");
    } finally {
      if (prevMaskEnabled) setMaskEnabled(true);
      setPdfLoading(false);
    }
  };

  const fmt = (n: number) => mask("amount", n.toLocaleString("ko-KR"));

  if (loading) {
    return <LoadingState title="견적 정보를 불러오는 중입니다." />;
  }

  if (!quotation) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">견적을 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/quotations")}>
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  const sortedItems = (quotation.quotation_items ?? []).sort(
    (a, b) => a.sort_order - b.sort_order
  );

  const hasVersions = versions.length > 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="no-print flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/quotations"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              견적관리
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm font-medium">{quotation.quotation_number}</span>
          </div>
          <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {quotation.quotation_number}
            <span className={`ml-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${QUOTATION_STATUS_COLORS[quotation.status] || ""}`}>
              {quotation.status}
            </span>
          </h3>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <Button variant="outline" onClick={() => router.push(`/dashboard/quotations/${quotationId}/edit`)} className="flex-1 sm:flex-none">
            수정
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="flex-1 sm:flex-none">
            {deleting ? "삭제 중..." : "삭제"}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/quotations/new?from=${quotationId}`)}
            className="flex-1 sm:flex-none"
          >
            새 버전
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="flex-1 sm:flex-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {pdfLoading ? "생성 중..." : "PDF"}
          </Button>
        </div>
      </div>

      {/* Main layout: Version sidebar + Quotation document */}
      <div className={`${hasVersions ? "flex flex-col lg:flex-row lg:gap-6" : ""}`}>
        {/* Version Sidebar (left) */}
        {hasVersions && (
          <div className="no-print mb-4 lg:mb-0 lg:w-52 lg:shrink-0">
            <div className="rounded-lg border bg-card p-3 lg:sticky lg:top-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">버전 이력</h3>
              <div className="space-y-1">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm ${
                      v.id === quotationId
                        ? "bg-primary/10 font-medium"
                        : "hover:bg-muted/50 cursor-pointer"
                    }`}
                    onClick={() => {
                      if (v.id !== quotationId) router.push(`/dashboard/quotations/${v.id}`);
                    }}
                  >
                    <span className="truncate text-xs">{v.quotation_number}</span>
                    <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">{v.created_at.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quotation Document View — A4 ratio */}
        <div ref={pdfRef} className="print-quotation mx-auto w-full max-w-[210mm] h-[297mm] rounded-lg border bg-white p-5 sm:p-8 shadow-sm flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Title */}
          <h2 className="text-center text-2xl font-bold tracking-[0.5em] mb-4">견 적 서</h2>

          {/* Quotation number, date, validity */}
          <div className="mb-3 flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
            <div>
              <span className="text-muted-foreground">견적번호: </span>
              <span className="font-medium">{quotation.quotation_number}</span>
            </div>
            <div>
              <span className="text-muted-foreground">견적일: </span>
              <span className="font-medium">{quotation.quotation_date}</span>
            </div>
            <div>
              <span className="text-muted-foreground">유효기간: </span>
              <span className="font-medium">{quotation.valid_until || "-"}</span>
            </div>
          </div>

          {/* "아래와 같이 견적합니다" */}
            <p className="text-center text-sm mb-3">아래와 같이 견적합니다.</p>

          {/* Recipient / Supplier 2-column */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            {/* Recipient */}
            <div>
              <h3 className="mb-2 text-sm font-semibold border-b pb-1">수신자</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1 pr-3 text-muted-foreground w-20">상호</td>
                    <td className="py-1 font-medium">{mask("customer_name", quotation.recipient_name)}</td>
                  </tr>
                  {quotation.recipient_contact_name && (
                    <tr>
                      <td className="py-1 pr-3 text-muted-foreground">담당자</td>
                      <td className="py-1">{quotation.recipient_contact_name}</td>
                    </tr>
                  )}
                  {quotation.recipient_phone && (
                    <tr>
                      <td className="py-1 pr-3 text-muted-foreground">연락처</td>
                      <td className="py-1">{mask("phone", quotation.recipient_phone)}</td>
                    </tr>
                  )}
                  {quotation.recipient_address && (
                    <tr>
                      <td className="py-1 pr-3 text-muted-foreground">주소</td>
                      <td className="py-1">{mask("address", quotation.recipient_address)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Supplier */}
            <div>
              <h3 className="mb-2 text-sm font-semibold border-b pb-1">공급자</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1 pr-3 text-muted-foreground w-24">상호</td>
                    <td className="py-1 font-medium">{quotation.supplier_name}</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-3 text-muted-foreground">대표자</td>
                    <td className="py-1">{quotation.supplier_representative ?? ""}</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-3 text-muted-foreground">사업자번호</td>
                    <td className="py-1">{quotation.supplier_business_number ?? ""}</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-3 text-muted-foreground">연락처</td>
                    <td className="py-1">{quotation.supplier_phone ?? ""}</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-3 text-muted-foreground">담당자</td>
                    <td className="py-1">{quotation.supplier_manager ?? ""}</td>
                  </tr>
                  {quotation.supplier_address && (
                    <tr>
                      <td className="py-1 pr-3 text-muted-foreground">주소</td>
                      <td className="py-1">{quotation.supplier_address}</td>
                    </tr>
                  )}
                  {quotation.supplier_business_type && (
                    <tr>
                      <td className="py-1 pr-3 text-muted-foreground">업태</td>
                      <td className="py-1">{quotation.supplier_business_type}</td>
                    </tr>
                  )}
                  {quotation.supplier_business_category && (
                    <tr>
                      <td className="py-1 pr-3 text-muted-foreground">종목</td>
                      <td className="py-1">{quotation.supplier_business_category}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Items Table — 10행 고정 */}
          <div className="mb-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-y-2 border-foreground bg-muted/50">
                  <th className="px-2 py-1.5 text-center w-10">No</th>
                  <th className="px-2 py-1.5 text-left">품명</th>
                  <th className="px-2 py-1.5 text-center w-16">단위</th>
                  <th className="px-2 py-1.5 text-right w-16">수량</th>
                  <th className="px-2 py-1.5 text-right w-24">단가</th>
                  <th className="px-2 py-1.5 text-right w-28">공급가액</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }).map((_, idx) => {
                  const item = sortedItems[idx];
                  return (
                    <tr key={idx} className="border-b">
                      <td className="px-2 py-1.5 text-center">{idx + 1}</td>
                      <td className="px-2 py-1.5">{item?.item_name ?? ""}</td>
                      <td className="px-2 py-1.5 text-center">{item?.unit ?? ""}</td>
                      <td className="px-2 py-1.5 text-right">{item ? item.quantity : ""}</td>
                      <td className="px-2 py-1.5 text-right">{item ? fmt(item.unit_price) : ""}</td>
                      <td className="px-2 py-1.5 text-right">{item ? fmt(item.supply_amount) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals — inline row */}
          <div className="mb-3 flex items-center justify-end gap-4 text-sm border-t-2 border-foreground pt-2">
            <span className="text-muted-foreground">공급가액 <span className="font-medium text-foreground">{fmt(quotation.supply_total)}원</span></span>
            <span className="text-muted-foreground">부가세 <span className="font-medium text-foreground">{fmt(quotation.vat_total)}원</span></span>
            <span className="text-base font-bold">합계 {fmt(quotation.grand_total)}원</span>
          </div>

          {/* Rate Reference */}
          <div className="mb-2 text-xs text-muted-foreground">
            ※ 본 견적서의 인건비 단가는 한국소프트웨어산업협회 「2026년 소프트웨어기술자 노임단가」를 기준으로 산정되었습니다.
          </div>

          {/* Conditions */}
          <div className="space-y-1 text-sm mb-2">
            {quotation.payment_terms && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0">결제조건</span>
                <span>{quotation.payment_terms}</span>
              </div>
            )}
            {quotation.delivery_terms && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0">납기</span>
                <span>{quotation.delivery_terms}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-muted-foreground w-20 shrink-0">입금계좌</span>
              <span className="font-medium">{quotation.bank_account}</span>
            </div>
          </div>

          {/* Memo — 하단 남은 공간 채움 */}
          <div className="flex-1 rounded border bg-muted/30 p-3 text-sm min-h-[120px]">
            <p className="font-semibold mb-1">비고 / 특약사항</p>
            <p className="whitespace-pre-wrap">{quotation.memo || ""}</p>
          </div>
        </div>
      </div>

    </div>
  );
}
