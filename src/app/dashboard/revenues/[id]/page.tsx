"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BadgeDollarSign,
  CalendarClock,
  ExternalLink,
  FileText,
  LoaderCircle,
  PencilLine,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  type ReactNode,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { NavBackHint } from "@/components/nav-history";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  SectionIntro,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { BoltaTaxInvoiceIssueRequest } from "@/lib/bolta";
import { sendLog } from "@/lib/log-client";
import {
  getRevenueTaxInvoiceBadgeClassName,
  getRevenueTaxInvoiceBadgeVariant,
  getRevenueTaxInvoiceIssuingAgeMinutes,
  getRevenueTaxInvoiceLabel,
  getRevenueTaxInvoiceState,
  isRevenueTaxInvoiceIssuingStale,
} from "@/lib/revenue-tax-invoice";
import { createClient } from "@/lib/supabase/client";
import { getTaxInvoicePreviewMissingFields } from "@/lib/tax-invoice-preview";
import type { Revenue } from "@/lib/types";

const currencyFormatter = new Intl.NumberFormat("ko-KR");

type TaxInvoicePreview = BoltaTaxInvoiceIssueRequest;

type TaxInvoicePreviewResponse = {
  canIssue: boolean;
  taxInvoiceState: string;
  missingFields: string[];
  blockedReasons: string[];
  nonEditableBlockedReasons: string[];
  preview: TaxInvoicePreview;
};

type TaxInvoiceMutationResponse = {
  success?: boolean;
  resolved?: boolean;
  stale?: boolean;
  message?: string;
  error?: string;
  data?: RevenueDetail | null;
};

type RevenueCustomerDetail = {
  id: string;
  name: string;
  customer_type?: string | null;
  representative_name: string | null;
  business_number: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  memo: string | null;
};

type RevenueProjectDetail = NonNullable<Revenue["projects"]> & {
  customer_id: string | null;
  client: string | null;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  manager: string | null;
  customers: RevenueCustomerDetail | null;
};

type RevenueDetail = Omit<Revenue, "projects"> & {
  projects: RevenueProjectDetail | null;
};

type DetailField = {
  label: string;
  value: ReactNode;
  multiline?: boolean;
  tone?: "default" | "danger";
};

type DetailSection = {
  title: string;
  fields: DetailField[];
};

function formatCurrency(amount: number) {
  return `${currencyFormatter.format(amount)}원`;
}

function formatDate(value: string | null) {
  return value ? value.slice(0, 10) : "-";
}

function formatDateTime(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBoolean(value: boolean) {
  return value ? "예" : "아니오";
}

function getTaxInvoiceStateBlockedReasons(taxInvoiceState: string) {
  if (taxInvoiceState === "not_required") {
    return ["세금계산서 발행 대상이 아닌 매출입니다."];
  }

  if (taxInvoiceState === "issued") {
    return ["이미 세금계산서가 발행된 매출입니다."];
  }

  if (taxInvoiceState === "issuing") {
    return ["세금계산서 발행이 진행 중입니다."];
  }

  return [];
}

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

function formatBusinessNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 10)}`;
}

function parseBusinessNumber(value: string) {
  return value.replace(/[^\d-]/g, "").replace(/-/g, "");
}

function parseNumberInput(value: string, fallback = 0) {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function RevenueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const revenueId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();
  const isMountedRef = useRef(true);

  const [revenue, setRevenue] = useState<RevenueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [syncingTaxInvoice, setSyncingTaxInvoice] = useState(false);
  const [resettingTaxInvoice, setResettingTaxInvoice] = useState(false);
  const [forceCancelOpen, setForceCancelOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [issuePreview, setIssuePreview] = useState<TaxInvoicePreviewResponse | null>(
    null
  );
  const [issueDraft, setIssueDraft] = useState<TaxInvoicePreview | null>(null);

  const loadRevenue = useCallback(
    async ({
      silent = false,
      showErrorToast = true,
    }: {
      silent?: boolean;
      showErrorToast?: boolean;
    } = {}) => {
      if (!silent) {
        setLoading(true);
      }

      const { data, error } = await supabase
        .from("revenues")
        .select(`
          *,
          projects(
            id,
            project_number,
            name,
            customer_id,
            client,
            description,
            status,
            start_date,
            end_date,
            manager,
            customers(
              id,
              name,
              customer_type,
              representative_name,
              business_number,
              contact_name,
              contact_email,
              contact_phone,
              address,
              memo
            )
          )
        `)
        .eq("id", revenueId)
        .single();

      if (!isMountedRef.current) {
        return;
      }

      if (error) {
        if (showErrorToast) {
          console.error("매출 정보 조회 실패:", error.message);
          toast.error("매출 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
          setRevenue(null);
        }
      } else {
        setRevenue(data as RevenueDetail);
      }

      if (!silent) {
        setLoading(false);
      }
    },
    [revenueId, supabase]
  );

  useEffect(() => {
    isMountedRef.current = true;
    void loadRevenue();

    return () => {
      isMountedRef.current = false;
    };
  }, [loadRevenue]);

  useEffect(() => {
    if (!revenue || getRevenueTaxInvoiceState(revenue) !== "issuing") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadRevenue({ silent: true, showErrorToast: false });
    }, 10_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadRevenue, revenue]);

  const loadIssuePreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const response = await fetch(`/api/revenues/${revenueId}/tax-invoice`);
      const payload = (await response.json().catch(() => null)) as
        | ({ error?: string } & Partial<TaxInvoicePreviewResponse>)
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "세금계산서 발행 정보를 불러오지 못했습니다.");
      }

      setIssuePreview(payload as TaxInvoicePreviewResponse);
      setIssueDraft((payload as TaxInvoicePreviewResponse).preview);
    } catch (error) {
      setIssuePreview(null);
      setIssueDraft(null);
      setPreviewError(
        error instanceof Error
          ? error.message
          : "세금계산서 발행 정보를 불러오지 못했습니다."
      );
    } finally {
      setPreviewLoading(false);
    }
  }, [revenueId]);

  useEffect(() => {
    if (!previewOpen) {
      return;
    }

    void loadIssuePreview();
  }, [loadIssuePreview, previewOpen]);

  const handleDelete = async () => {
    if (!confirm("이 매출 항목을 삭제하시겠습니까?")) {
      return;
    }

    setDeleting(true);
    const { error } = await supabase.from("revenues").delete().eq("id", revenueId);

    if (error) {
      console.error("매출 삭제 실패:", error.message);
      toast.error("매출 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setDeleting(false);
      return;
    }

    toast.success("매출 항목을 삭제했습니다.");
    sendLog("DELETE_REVENUE", `매출 삭제: ${revenue?.title}`, {
      resource: "revenue",
      resource_id: revenueId,
    });
    router.push("/dashboard/revenues");
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRevenue({ silent: true });
    setRefreshing(false);
  };

  const handleSyncTaxInvoice = async () => {
    setSyncingTaxInvoice(true);

    try {
      const response = await fetch(`/api/revenues/${revenueId}/tax-invoice`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "sync",
        }),
      });
      const payload = (await response.json().catch(() => null)) as TaxInvoiceMutationResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || "세금계산서 상태를 재확인하지 못했습니다.");
      }

      if (payload?.data) {
        setRevenue(payload.data);
      } else {
        await loadRevenue({ silent: true, showErrorToast: false });
      }

      if (payload?.resolved) {
        toast.success(payload.message || "세금계산서 상태를 반영했습니다.");
      } else {
        toast.warning(payload?.message || "아직 최종 발행 결과를 확인하지 못했습니다.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "세금계산서 상태 재확인 중 오류가 발생했습니다."
      );
    } finally {
      setSyncingTaxInvoice(false);
    }
  };

  const handleForceCancelTaxInvoice = async () => {
    setResettingTaxInvoice(true);

    try {
      const response = await fetch(`/api/revenues/${revenueId}/tax-invoice`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "force-reset",
        }),
      });
      const payload = (await response.json().catch(() => null)) as TaxInvoiceMutationResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || "발행을 강제 취소하지 못했습니다.");
      }

      if (payload?.data) {
        setRevenue(payload.data);
      } else {
        await loadRevenue({ silent: true, showErrorToast: false });
      }

      setForceCancelOpen(false);
      toast.success(
        "발행중 상태를 강제 취소했습니다. 볼타 관리자 화면에서 실제 발행 여부를 반드시 확인하세요."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "강제 취소 중 오류가 발생했습니다."
      );
    } finally {
      setResettingTaxInvoice(false);
    }
  };

  const handleIssueTaxInvoice = async () => {
    if (!issueDraft) {
      return;
    }

    setIssuing(true);

    try {
      const response = await fetch(`/api/revenues/${revenueId}/tax-invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preview: issueDraft,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            missingFields?: string[];
            blockedReasons?: string[];
            nonEditableBlockedReasons?: string[];
            preview?: TaxInvoicePreview;
          }
        | null;

      if (!response.ok) {
        if (payload?.preview) {
          setIssueDraft(payload.preview);
        }

        if (payload?.missingFields || payload?.blockedReasons) {
          setIssuePreview((prev) =>
            prev
              ? {
                  ...prev,
                  missingFields: payload.missingFields ?? [],
                  blockedReasons: payload.blockedReasons ?? [],
                  nonEditableBlockedReasons: payload.nonEditableBlockedReasons ?? [],
                }
              : prev
          );
        }

        throw new Error(payload?.error || "세금계산서 발행 요청에 실패했습니다.");
      }

      await loadRevenue({ silent: true, showErrorToast: false });
      setPreviewOpen(false);
      setIssuePreview(null);
      setIssueDraft(null);
      toast.success(
        "세금계산서 발행을 요청했습니다. 결과 웹훅이 도착하면 상태가 자동으로 반영됩니다."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "세금계산서 발행 요청 중 오류가 발생했습니다."
      );
    } finally {
      setIssuing(false);
    }
  };

  if (loading) {
    return (
      <LoadingState
        title="매출 정보를 불러오는 중입니다."
        description="프로젝트 연결, 입금 상태, 세금계산서 진행 상황을 함께 확인하고 있습니다."
      />
    );
  }

  if (!revenue) {
    return (
      <ErrorState
        title="매출 항목을 찾을 수 없습니다."
        description="삭제되었거나 접근할 수 없는 항목일 수 있습니다."
        action={
          <Button variant="outline" onClick={() => router.push("/dashboard/revenues")}>
            목록으로 돌아가기
          </Button>
        }
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const taxInvoiceState = getRevenueTaxInvoiceState(revenue);
  const taxInvoiceLabel = getRevenueTaxInvoiceLabel(revenue);
  const taxInvoiceBadgeClassName = getRevenueTaxInvoiceBadgeClassName(revenue);
  const taxInvoiceIssuingAgeMinutes = getRevenueTaxInvoiceIssuingAgeMinutes(revenue);
  const isTaxInvoiceIssuingStale = isRevenueTaxInvoiceIssuingStale(revenue);
  const hasTaxInvoiceTrackingInfo = Boolean(
    revenue.tax_invoice_client_reference_id || revenue.tax_invoice_issuance_key
  );
  const isDelayed = Boolean(
    !revenue.is_paid &&
      revenue.expected_payment_date &&
      revenue.expected_payment_date < today
  );
  const paymentLabel = revenue.is_paid
    ? "입금 완료"
    : isDelayed
      ? "입금 지연"
      : "미입금";
  const unpaidBadgeClass = "border-amber-300 bg-amber-100 text-amber-900";
  const imwebCustomerName =
    revenue.memo?.match(/주문자\s*:?\s*([^/]+)/)?.[1]?.trim() || null;
  const headerTitleBase =
    revenue.channel === "아임웹"
      ? revenue.product_name?.trim() || revenue.title
      : revenue.projects?.name?.trim() || revenue.title;
  const headerTitleMeta =
    revenue.channel === "아임웹"
      ? imwebCustomerName
      : revenue.projects?.name
        ? revenue.title
        : null;
  const headerTitle = headerTitleMeta
    ? `${headerTitleBase} (${headerTitleMeta})`
    : headerTitleBase;
  const canIssueTaxInvoice =
    !revenue.tax_invoice_not_required &&
    taxInvoiceState !== "issued" &&
    taxInvoiceState !== "issuing";
  const issueButtonLabel = taxInvoiceState === "failed" ? "재발행" : "세금계산서 발행";
  const canSyncTaxInvoice =
    !revenue.tax_invoice_not_required &&
    taxInvoiceState !== "issued" &&
    hasTaxInvoiceTrackingInfo;
  const taxInvoiceDescription =
    taxInvoiceState === "not_required"
      ? "발행 대상이 아닙니다."
      : taxInvoiceState === "issuing"
        ? isTaxInvoiceIssuingStale && taxInvoiceIssuingAgeMinutes !== null
          ? `웹훅 대기 ${taxInvoiceIssuingAgeMinutes}분 경과. 상태 재확인 또는 강제 취소가 가능합니다.`
          : "Bolta 발행 결과 웹훅을 기다리는 중입니다."
        : taxInvoiceState === "issued"
          ? `발행일 ${formatDate(revenue.tax_invoice_date)}`
          : taxInvoiceState === "failed"
            ? revenue.tax_invoice_error_message?.trim() || "실패 사유를 확인해 주세요."
            : "아직 발행하지 않았습니다.";
  const taxInvoiceTone =
    taxInvoiceState === "issued"
      ? "positive"
      : taxInvoiceState === "issuing"
        ? "brand"
        : taxInvoiceState === "not_required"
          ? "default"
          : "warning";
  const draftMissingFields = issueDraft
    ? getTaxInvoicePreviewMissingFields(issueDraft)
    : [];
  const previewBlockedReasons = issuePreview
    ? [
        ...new Set([
          ...(issuePreview.nonEditableBlockedReasons ??
            getTaxInvoiceStateBlockedReasons(issuePreview.taxInvoiceState)),
          ...draftMissingFields,
        ]),
      ]
    : [];
  const canSubmitIssue =
    !!issueDraft &&
    previewBlockedReasons.length === 0 &&
    !previewLoading &&
    !previewError &&
    !issuing;

  const project = revenue.projects;
  const customer = project?.customers ?? null;

  const revenueSections: DetailSection[] = [
    {
      title: "기본 정보",
      fields: [
        { label: "제목", value: mask("title", revenue.title) },
        { label: "판매 채널", value: revenue.channel ?? "-" },
        { label: "상품명", value: revenue.product_name ? mask("title", revenue.product_name) : "-" },
        { label: "주문번호", value: revenue.external_order_id ?? "-" },
        { label: "총 매출금액", value: mask("amount", formatCurrency(revenue.total_amount)) },
        { label: "공급가액", value: mask("amount", formatCurrency(revenue.supply_amount)) },
        { label: "부가세", value: mask("amount", formatCurrency(revenue.vat_amount)) },
        { label: "부가세 포함", value: formatBoolean(revenue.vat_included) },
        { label: "매출일", value: formatDate(revenue.revenue_date) },
      ],
    },
    {
      title: "입금 정보",
      fields: [
        {
          label: "입금 상태",
          value: (
            <Badge
              variant="outline"
              className={
                revenue.is_paid
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : isDelayed
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : unpaidBadgeClass
              }
            >
              {paymentLabel}
            </Badge>
          ),
        },
        { label: "예상 입금일", value: formatDate(revenue.expected_payment_date) },
        { label: "입금일", value: formatDate(revenue.paid_date) },
      ],
    },
    {
      title: "세금계산서",
      fields: [
        {
          label: "발행 상태",
          value: (
            <Badge
              variant={getRevenueTaxInvoiceBadgeVariant(revenue)}
              className={taxInvoiceBadgeClassName}
            >
              {taxInvoiceLabel}
            </Badge>
          ),
        },
        {
          label: "발행 불필요",
          value: formatBoolean(revenue.tax_invoice_not_required),
        },
        { label: "발행일", value: formatDate(revenue.tax_invoice_date) },
        {
          label: "발행 요청 시각",
          value: formatDateTime(revenue.tax_invoice_issue_requested_at),
        },
        {
          label: "발행 완료 시각",
          value: formatDateTime(revenue.tax_invoice_issued_at),
        },
        {
          label: "결과 웹훅 수신",
          value: formatDateTime(revenue.tax_invoice_last_webhook_at),
        },
        { label: "발행키", value: revenue.tax_invoice_issuance_key ?? "-" },
        {
          label: "국세청 거래 ID",
          value: revenue.tax_invoice_nts_transaction_id ?? "-",
        },
        {
          label: "문서 링크",
          value: revenue.tax_invoice_url ? (
            <Link
              href={revenue.tax_invoice_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              발행 문서 열기
              <ExternalLink className="size-3.5" />
            </Link>
          ) : (
            "-"
          ),
        },
        {
          label: "발행 오류",
          value: revenue.tax_invoice_error_message ? (
            <span className="whitespace-pre-wrap break-words">
              {revenue.tax_invoice_error_code
                ? `[${revenue.tax_invoice_error_code}] `
                : ""}
              {revenue.tax_invoice_error_message}
            </span>
          ) : (
            "-"
          ),
          multiline: true,
          tone: revenue.tax_invoice_error_message ? "danger" : "default",
        },
        { label: "등록일", value: formatDateTime(revenue.created_at) },
        { label: "수정일", value: formatDateTime(revenue.updated_at) },
        {
          label: "비고",
          value: (
            <span className="whitespace-pre-wrap break-words">
              {revenue.memo?.trim() || "기록된 메모가 없습니다."}
            </span>
          ),
          multiline: true,
        },
      ],
    },
  ];

  const projectSections: DetailSection[] = [
    {
      title: "프로젝트 개요",
      fields: [
        {
          label: "연결 프로젝트",
          value: project ? (
            <Link
              href={`/dashboard/projects/${revenue.project_id}`}
              className="font-medium text-primary hover:underline"
            >
              {project.project_number} · {mask("title", project.name)}
            </Link>
          ) : (
            "미연결"
          ),
        },
        { label: "프로젝트 번호", value: project?.project_number ?? "-" },
        { label: "프로젝트명", value: project?.name ? mask("title", project.name) : "-" },
        {
          label: "진행 상태",
          value: project?.status ? <Badge variant="outline">{project.status}</Badge> : "-",
        },
        { label: "거래처 표기", value: project?.client ? mask("customer_name", project.client) : "-" },
        { label: "담당자", value: project?.manager ? mask("name", project.manager) : "-" },
        {
          label: "진행 기간",
          value:
            project?.start_date || project?.end_date
              ? `${formatDate(project?.start_date ?? null)} ~ ${formatDate(
                  project?.end_date ?? null
                )}`
              : "-",
        },
      ],
    },
    {
      title: "프로젝트 설명",
      fields: [
        {
          label: "설명",
          value: (
            <span className="whitespace-pre-wrap break-words">
              {project?.description?.trim() || "등록된 프로젝트 설명이 없습니다."}
            </span>
          ),
          multiline: true,
        },
      ],
    },
  ];

  const customerSections: DetailSection[] = [
    {
      title: "고객 기본 정보",
      fields: [
        {
          label: "고객명",
          value: customer ? (
            <Link
              href={`/dashboard/customers/${customer.id}`}
              className="font-medium text-primary hover:underline"
            >
              {mask("customer_name", customer.name)}
            </Link>
          ) : (
            project?.client
              ? mask("customer_name", project.client)
              : imwebCustomerName
                ? mask("name", imwebCustomerName)
                : "미연결"
          ),
        },
        { label: "고객 구분", value: customer?.customer_type ?? "-" },
        { label: "대표자명", value: customer?.representative_name ? mask("name", customer.representative_name) : "-" },
        { label: "사업자번호", value: customer?.business_number ? mask("business_number", customer.business_number) : "-" },
        {
          label: "주문 메모 고객명",
          value: imwebCustomerName ? mask("name", imwebCustomerName) : "-",
        },
        { label: "주소", value: customer?.address ? mask("address", customer.address) : "-" },
      ],
    },
    {
      title: "담당자 정보",
      fields: [
        { label: "담당자명", value: customer?.contact_name ? mask("name", customer.contact_name) : "-" },
        { label: "이메일", value: customer?.contact_email ? mask("email", customer.contact_email) : "-" },
        { label: "연락처", value: customer?.contact_phone ? mask("phone", customer.contact_phone) : "-" },
      ],
    },
    {
      title: "고객 메모",
      fields: [
        {
          label: "메모",
          value: (
            <span className="whitespace-pre-wrap break-words">
              {customer?.memo?.trim() || "등록된 고객 메모가 없습니다."}
            </span>
          ),
          multiline: true,
        },
      ],
    },
  ];

  const maskedHeaderTitle = mask("title", headerTitle);
  const revenueBreadcrumbs = (() => {
    if (project && customer) {
      return [
        { label: "고객관리", href: "/dashboard/customers" },
        { label: mask("customer_name", customer.name), href: `/dashboard/customers/${customer.id}` },
        { label: "프로젝트", href: "/dashboard/projects" },
        { label: project.project_number || mask("title", project.name), href: `/dashboard/projects/${project.id}` },
        { label: "매출", href: "/dashboard/revenues" },
        { label: maskedHeaderTitle },
      ];
    }
    if (project) {
      return [
        { label: "프로젝트 관리", href: "/dashboard/projects" },
        { label: project.project_number || mask("title", project.name), href: `/dashboard/projects/${project.id}` },
        { label: "매출", href: "/dashboard/revenues" },
        { label: maskedHeaderTitle },
      ];
    }
    return [
      { label: "매출관리", href: "/dashboard/revenues" },
      { label: maskedHeaderTitle },
    ];
  })();
  const backParentHref = project
    ? `/dashboard/projects/${project.id}`
    : customer
      ? `/dashboard/customers/${customer.id}`
      : null;

  return (
    <PageShell>
      <NavBackHint parentHref={backParentHref} />
      <PageHeader
        breadcrumbs={revenueBreadcrumbs}
        title={maskedHeaderTitle}
        funKey="revenues"
        titleAccessory={
          <Badge
            variant="outline"
            className={
              revenue.is_paid
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : isDelayed
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : unpaidBadgeClass
            }
          >
            {paymentLabel}
          </Badge>
        }
        description="입금 일정, 세금계산서 상태, 연결 프로젝트를 한 화면에서 바로 확인할 수 있습니다."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void handleRefresh()}
              disabled={refreshing || issuing || syncingTaxInvoice || resettingTaxInvoice}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            {canSyncTaxInvoice ? (
              <Button
                variant="outline"
                onClick={() => void handleSyncTaxInvoice()}
                disabled={syncingTaxInvoice || issuing || resettingTaxInvoice}
              >
                <RefreshCw className={`h-4 w-4 ${syncingTaxInvoice ? "animate-spin" : ""}`} />
                상태 재확인
              </Button>
            ) : null}
            {taxInvoiceState === "issuing" ? (
              <Button
                variant="destructive"
                onClick={() => setForceCancelOpen(true)}
                disabled={resettingTaxInvoice || issuing || syncingTaxInvoice}
              >
                {resettingTaxInvoice ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                {resettingTaxInvoice ? "취소 중..." : "강제 취소"}
              </Button>
            ) : null}
            {revenue.tax_invoice_url ? (
              <Button variant="outline" asChild>
                <Link href={revenue.tax_invoice_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  세금계산서 보기
                </Link>
              </Button>
            ) : null}
            {!revenue.tax_invoice_not_required ? (
              <Button
                onClick={() => setPreviewOpen(true)}
                disabled={!canIssueTaxInvoice || issuing || syncingTaxInvoice || resettingTaxInvoice}
              >
                {taxInvoiceState === "issuing" || issuing ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ReceiptText className="h-4 w-4" />
                )}
                {taxInvoiceState === "issuing" || issuing ? "발행중" : issueButtonLabel}
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link href={`/dashboard/revenues/${revenueId}/edit`}>
                <PencilLine className="h-4 w-4" />
                수정
              </Link>
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? "삭제 중..." : "삭제"}
            </Button>
          </>
        }
      />

      <StatsGrid columns={3}>
        <StatCard
          label="총 매출금액"
          value={mask("amount", formatCurrency(revenue.total_amount))}
          description={`공급가액 ${mask("amount", formatCurrency(revenue.supply_amount))} / 부가세 ${mask("amount", formatCurrency(revenue.vat_amount))}`}
          icon={BadgeDollarSign}
          tone="brand"
        />
        <StatCard
          label="입금 상태"
          value={paymentLabel}
          description={
            revenue.is_paid
              ? `입금일 ${formatDate(revenue.paid_date)}`
              : `예상 입금일 ${formatDate(revenue.expected_payment_date)}`
          }
          icon={CalendarClock}
          tone={revenue.is_paid ? "positive" : "warning"}
        />
        <StatCard
          label="세금계산서"
          value={taxInvoiceLabel}
          description={taxInvoiceDescription}
          icon={FileText}
          tone={taxInvoiceTone}
        />
      </StatsGrid>

      {taxInvoiceState === "issuing" ? (
        <div
          className={[
            "flex flex-col gap-3 rounded-2xl border px-4 py-3 text-sm",
            isTaxInvoiceIssuingStale
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-sky-200 bg-sky-50 text-sky-800",
          ].join(" ")}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">
                {isTaxInvoiceIssuingStale && taxInvoiceIssuingAgeMinutes !== null
                  ? `세금계산서 발행 결과가 ${taxInvoiceIssuingAgeMinutes}분째 웹훅으로 반영되지 않았습니다.`
                  : "세금계산서 발행 요청은 접수되었고 현재 Bolta 결과 웹훅을 기다리는 중입니다."}
              </p>
              <p>
                이미 발행됐는데 웹훅만 늦는 경우에는 `상태 재확인`으로 복구할 수 있고,
                오래 멈췄거나 재발행이 필요한 경우 `강제 취소` 후 다시 발행할 수 있습니다.
                단, 강제 취소 후에도 볼타 웹훅이 뒤늦게 도착해 발행이 완료될 수 있으니 주의하세요.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <section className="space-y-4">
        <SectionIntro title="상세 정보" />

        <div className="space-y-4">
          <OverviewCard title="매출정보" sections={revenueSections} />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <OverviewCard title="프로젝트정보" sections={projectSections} />
            <OverviewCard title="고객정보" sections={customerSections} />
          </div>
        </div>
      </section>

      <Dialog
        open={previewOpen}
        onOpenChange={(nextOpen) => {
          setPreviewOpen(nextOpen);
          if (!nextOpen) {
            setPreviewError(null);
            setIssuePreview(null);
            setIssueDraft(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>세금계산서 발행</DialogTitle>
            <DialogDescription>
              발행 전에 실제 전송될 정보를 확인하세요. 필수 항목이 누락되면 발행할 수 없습니다.
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              세금계산서 발행 정보를 불러오는 중입니다.
            </div>
          ) : previewError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {previewError}
            </div>
          ) : issuePreview && issueDraft ? (
            <div className="space-y-4">
              {previewBlockedReasons.length > 0 ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <p className="text-sm font-semibold text-rose-700">
                    발행 전에 확인이 필요한 항목이 있습니다.
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
                    {previewBlockedReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  연결된 정보를 기본값으로 불러왔습니다. 수정 후 발행할 수 있습니다.
                </div>
              )}

              {/* 기본 정보 */}
              <fieldset className="rounded-2xl border border-border/70 bg-card/70 p-4">
                <legend className="px-2 text-sm font-semibold">기본 정보</legend>
                <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-2">
                  <Label htmlFor="issue-date" className="text-right text-sm text-muted-foreground">발행일</Label>
                  <Input
                    id="issue-date"
                    type="date"
                    value={issueDraft.date}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev ? { ...prev, date: event.target.value } : prev
                      )
                    }
                  />
                  <Label htmlFor="issue-purpose" className="text-right text-sm text-muted-foreground">발행 구분</Label>
                  <select
                    id="issue-purpose"
                    className="flex h-10 w-full rounded-xl border border-input/85 bg-background/80 px-3.5 py-2 text-sm shadow-sm outline-none transition-[color,box-shadow,border-color,background-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    value={issueDraft.purpose}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              purpose:
                                event.target.value === "RECEIPT" ? "RECEIPT" : "CLAIM",
                            }
                          : prev
                      )
                    }
                  >
                    <option value="CLAIM">청구</option>
                    <option value="RECEIPT">영수</option>
                  </select>
                  <Label htmlFor="issue-description" className="self-start pt-2.5 text-right text-sm text-muted-foreground">설명</Label>
                  <IssueTextarea
                    id="issue-description"
                    value={issueDraft.description ?? ""}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev ? { ...prev, description: event.target.value } : prev
                      )
                    }
                  />
                </div>
              </fieldset>

              {/* 품목 */}
              <fieldset className="rounded-2xl border border-border/70 bg-card/70 p-4">
                <legend className="px-2 text-sm font-semibold">품목</legend>
                <div className="space-y-3">
                  {issueDraft.items.map((item, index) => (
                    <div
                      key={`tax-invoice-item-${index}`}
                      className="rounded-xl border border-border/60 bg-background/70 p-3"
                    >
                      <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-2">
                        <Label htmlFor={`issue-item-name-${index}`} className="text-right text-sm text-muted-foreground">품목명</Label>
                        <Input
                          id={`issue-item-name-${index}`}
                          value={item.name}
                          onChange={(event) =>
                            setIssueDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    items: prev.items.map((current, currentIndex) =>
                                      currentIndex === index
                                        ? { ...current, name: event.target.value }
                                        : current
                                    ),
                                  }
                                : prev
                            )
                          }
                        />
                        <Label htmlFor={`issue-item-date-${index}`} className="text-right text-sm text-muted-foreground">일자</Label>
                        <Input
                          id={`issue-item-date-${index}`}
                          type="date"
                          value={item.date}
                          onChange={(event) =>
                            setIssueDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    items: prev.items.map((current, currentIndex) =>
                                      currentIndex === index
                                        ? { ...current, date: event.target.value }
                                        : current
                                    ),
                                  }
                                : prev
                            )
                          }
                        />
                        <Label htmlFor={`issue-item-quantity-${index}`} className="text-right text-sm text-muted-foreground">수량</Label>
                        <Input
                          id={`issue-item-quantity-${index}`}
                          type="number"
                          min="1"
                          value={item.quantity ?? 1}
                          onChange={(event) =>
                            setIssueDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    items: prev.items.map((current, currentIndex) =>
                                      currentIndex === index
                                        ? {
                                            ...current,
                                            quantity: parseNumberInput(
                                              event.target.value,
                                              current.quantity ?? 1
                                            ),
                                          }
                                        : current
                                    ),
                                  }
                                : prev
                            )
                          }
                        />
                        <Label htmlFor={`issue-item-supply-${index}`} className="text-right text-sm text-muted-foreground">공급가액</Label>
                        <Input
                          id={`issue-item-supply-${index}`}
                          inputMode="numeric"
                          value={formatNumber(item.supplyCost)}
                          onChange={(event) =>
                            setIssueDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    items: prev.items.map((current, currentIndex) =>
                                      currentIndex === index
                                        ? {
                                            ...current,
                                            supplyCost: parseNumberInput(
                                              event.target.value,
                                              current.supplyCost
                                            ),
                                            unitPrice: parseNumberInput(
                                              event.target.value,
                                              current.unitPrice ?? current.supplyCost
                                            ),
                                          }
                                        : current
                                    ),
                                  }
                                : prev
                            )
                          }
                        />
                        <Label htmlFor={`issue-item-tax-${index}`} className="text-right text-sm text-muted-foreground">세액</Label>
                        <Input
                          id={`issue-item-tax-${index}`}
                          inputMode="numeric"
                          value={formatNumber(item.tax ?? 0)}
                          onChange={(event) =>
                            setIssueDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    items: prev.items.map((current, currentIndex) =>
                                      currentIndex === index
                                        ? {
                                            ...current,
                                            tax: parseNumberInput(
                                              event.target.value,
                                              current.tax ?? 0
                                            ),
                                          }
                                        : current
                                    ),
                                  }
                                : prev
                            )
                          }
                        />
                        <Label htmlFor={`issue-item-description-${index}`} className="self-start pt-2.5 text-right text-sm text-muted-foreground">품목 설명</Label>
                        <IssueTextarea
                          id={`issue-item-description-${index}`}
                          value={item.description ?? ""}
                          onChange={(event) =>
                            setIssueDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    items: prev.items.map((current, currentIndex) =>
                                      currentIndex === index
                                        ? { ...current, description: event.target.value }
                                        : current
                                    ),
                                  }
                                : prev
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              {/* 공급자 */}
              <fieldset className="rounded-2xl border border-border/70 bg-card/70 p-4">
                <legend className="px-2 text-sm font-semibold">공급자</legend>
                <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-2">
                  <Label htmlFor="supplier-business-number" className="text-right text-sm text-muted-foreground">사업자번호</Label>
                  <Input
                    id="supplier-business-number"
                    placeholder="000-00-00000"
                    value={formatBusinessNumber(issueDraft.supplier.identificationNumber)}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplier: {
                                ...prev.supplier,
                                identificationNumber: parseBusinessNumber(event.target.value),
                              },
                            }
                          : prev
                      )
                    }
                  />
                  <Label htmlFor="supplier-organization-name" className="text-right text-sm text-muted-foreground">상호</Label>
                  <Input
                    id="supplier-organization-name"
                    value={issueDraft.supplier.organizationName}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplier: {
                                ...prev.supplier,
                                organizationName: event.target.value,
                              },
                            }
                          : prev
                      )
                    }
                  />
                  <Label htmlFor="supplier-representative-name" className="text-right text-sm text-muted-foreground">대표자명</Label>
                  <Input
                    id="supplier-representative-name"
                    value={issueDraft.supplier.representativeName}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplier: {
                                ...prev.supplier,
                                representativeName: event.target.value,
                              },
                            }
                          : prev
                      )
                    }
                  />
                  <Label htmlFor="supplier-address" className="text-right text-sm text-muted-foreground">주소</Label>
                  <Input
                    id="supplier-address"
                    value={issueDraft.supplier.address ?? ""}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplier: {
                                ...prev.supplier,
                                address: event.target.value,
                              },
                            }
                          : prev
                      )
                    }
                  />
                  <Label htmlFor="supplier-manager-name" className="text-right text-sm text-muted-foreground">담당자명</Label>
                  <Input
                    id="supplier-manager-name"
                    value={issueDraft.supplier.manager.name ?? ""}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplier: {
                                ...prev.supplier,
                                manager: {
                                  ...prev.supplier.manager,
                                  name: event.target.value,
                                },
                              },
                            }
                          : prev
                      )
                    }
                  />
                  <Label htmlFor="supplier-manager-email" className="text-right text-sm text-muted-foreground">이메일</Label>
                  <Input
                    id="supplier-manager-email"
                    type="email"
                    value={issueDraft.supplier.manager.email}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplier: {
                                ...prev.supplier,
                                manager: {
                                  ...prev.supplier.manager,
                                  email: event.target.value,
                                },
                              },
                            }
                          : prev
                      )
                    }
                  />
                  <Label htmlFor="supplier-manager-phone" className="text-right text-sm text-muted-foreground">연락처</Label>
                  <Input
                    id="supplier-manager-phone"
                    value={issueDraft.supplier.manager.telephone ?? ""}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplier: {
                                ...prev.supplier,
                                manager: {
                                  ...prev.supplier.manager,
                                  telephone: event.target.value,
                                },
                              },
                            }
                          : prev
                      )
                    }
                  />
                </div>
              </fieldset>

              {/* 공급받는자 */}
              <fieldset className="rounded-2xl border border-border/70 bg-card/70 p-4">
                <legend className="px-2 text-sm font-semibold">공급받는자</legend>
                <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-2">
                  <Label htmlFor="recipient-business-number" className="text-right text-sm text-muted-foreground">사업자번호</Label>
                  <Input
                    id="recipient-business-number"
                    placeholder="000-00-00000"
                    value={formatBusinessNumber(issueDraft.supplied.identificationNumber)}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplied: {
                                ...prev.supplied,
                                identificationNumber: parseBusinessNumber(event.target.value),
                              },
                            }
                          : prev
                      )
                    }
                  />
                  <Label htmlFor="recipient-organization-name" className="text-right text-sm text-muted-foreground">상호</Label>
                  <Input
                    id="recipient-organization-name"
                    value={issueDraft.supplied.organizationName}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplied: {
                                ...prev.supplied,
                                organizationName: event.target.value,
                              },
                            }
                          : prev
                      )
                    }
                  />
                  <Label htmlFor="recipient-representative-name" className="text-right text-sm text-muted-foreground">대표자명</Label>
                  <Input
                    id="recipient-representative-name"
                    value={issueDraft.supplied.representativeName}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplied: {
                                ...prev.supplied,
                                representativeName: event.target.value,
                              },
                            }
                          : prev
                      )
                    }
                  />
                  <Label htmlFor="recipient-address" className="text-right text-sm text-muted-foreground">주소</Label>
                  <Input
                    id="recipient-address"
                    value={issueDraft.supplied.address ?? ""}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplied: {
                                ...prev.supplied,
                                address: event.target.value,
                              },
                            }
                          : prev
                      )
                    }
                  />
                  <Label htmlFor="recipient-manager-name" className="text-right text-sm text-muted-foreground">담당자명</Label>
                  <Input
                    id="recipient-manager-name"
                    value={issueDraft.supplied.managers[0]?.name ?? ""}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplied: {
                                ...prev.supplied,
                                managers: [
                                  {
                                    ...prev.supplied.managers[0],
                                    name: event.target.value,
                                  },
                                ],
                              },
                            }
                          : prev
                      )
                    }
                  />
                  <Label htmlFor="recipient-manager-email" className="text-right text-sm text-muted-foreground">이메일</Label>
                  <Input
                    id="recipient-manager-email"
                    type="email"
                    value={issueDraft.supplied.managers[0]?.email ?? ""}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplied: {
                                ...prev.supplied,
                                managers: [
                                  {
                                    ...prev.supplied.managers[0],
                                    email: event.target.value,
                                  },
                                ],
                              },
                            }
                          : prev
                      )
                    }
                  />
                  <Label htmlFor="recipient-manager-phone" className="text-right text-sm text-muted-foreground">연락처</Label>
                  <Input
                    id="recipient-manager-phone"
                    value={issueDraft.supplied.managers[0]?.telephone ?? ""}
                    onChange={(event) =>
                      setIssueDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplied: {
                                ...prev.supplied,
                                managers: [
                                  {
                                    ...prev.supplied.managers[0],
                                    telephone: event.target.value,
                                  },
                                ],
                              },
                            }
                          : prev
                      )
                    }
                  />
                </div>
              </fieldset>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(false)}
              disabled={issuing}
            >
              닫기
            </Button>
            <Button
              onClick={() => void handleIssueTaxInvoice()}
              disabled={!canSubmitIssue}
            >
              {issuing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ReceiptText className="h-4 w-4" />
              )}
              {issuing ? "발행 요청 중..." : "발행 요청"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={forceCancelOpen}
        onOpenChange={(nextOpen) => {
          if (resettingTaxInvoice) {
            return;
          }
          setForceCancelOpen(nextOpen);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
              세금계산서 발행 강제 취소
            </DialogTitle>
            <DialogDescription>
              발행중 상태를 수동으로 해제합니다. 진행 전에 아래 내용을 반드시 확인해 주세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
              <p className="font-semibold">볼타 세금계산서 발행 구조</p>
              <p className="mt-1 leading-relaxed">
                볼타에 발행 요청을 보내면 <strong>발행대기</strong> 상태로 접수되고,
                약 <strong>10분 후</strong> 결과 웹훅이 도착해 최종 상태가 결정됩니다.
                이 작업은 서비스의 `발행중` 상태만 <strong>failed</strong>로 바꿀 뿐,
                볼타 쪽 발행 요청 자체를 취소하지는 못합니다.
              </p>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
              <p className="font-semibold">강제 취소 시 발생할 수 있는 문제</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
                <li>
                  강제 취소 후에도 10분 뒤 웹훅이 <strong>발행 완료</strong>로 도착하면,
                  상태가 다시 `발행 완료`로 덮어써져 취소 기록과 정합성이 맞지 않게 됩니다.
                </li>
                <li>
                  취소했다고 판단해 같은 건을 재발행하면 볼타에 <strong>중복 발행</strong>이
                  발생할 수 있으니, 반드시 볼타 관리자 화면에서 실제 발행 여부를 먼저 확인하세요.
                </li>
                <li>
                  402/네트워크 오류로 요청 자체가 실패해 `발행중`만 남은 경우라면 중복 위험은 없지만,
                  확실하지 않다면 먼저 <strong>상태 재확인</strong>을 실행해 보세요.
                </li>
              </ul>
            </div>

            {taxInvoiceIssuingAgeMinutes !== null ? (
              <div className="rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-muted-foreground">
                현재 발행 요청 후 <strong>{taxInvoiceIssuingAgeMinutes}분</strong> 경과했습니다.
                {taxInvoiceIssuingAgeMinutes < 10
                  ? " 볼타 웹훅이 아직 도착할 가능성이 높은 시점입니다."
                  : " 웹훅 도착 예상 시점을 지났지만, 늦게 도착할 수도 있습니다."}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setForceCancelOpen(false)}
              disabled={resettingTaxInvoice}
            >
              닫기
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleForceCancelTaxInvoice()}
              disabled={resettingTaxInvoice}
            >
              {resettingTaxInvoice ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {resettingTaxInvoice ? "취소 중..." : "위험을 감수하고 강제 취소"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function OverviewCard({
  title,
  sections,
}: {
  title: string;
  sections: DetailSection[];
}) {
  return (
    <Card className="h-full border-border/70 bg-card/85 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {sections.map((section) => (
          <div key={section.title} className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {section.title}
            </p>
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted/10">
              {section.fields.map((field, index) => (
                <DetailRow
                  key={`${section.title}-${field.label}-${index}`}
                  label={field.label}
                  value={field.value}
                  multiline={field.multiline}
                  tone={field.tone}
                  isLast={index === section.fields.length - 1}
                />
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  multiline = false,
  tone = "default",
  isLast = false,
}: DetailField & { isLast?: boolean }) {
  return (
    <div
      className={[
        "px-4 py-3",
        multiline
          ? "flex flex-col gap-2"
          : "flex items-start gap-4",
        isLast ? "" : "border-b border-border/60",
      ].join(" ")}
    >
      <p className="shrink-0 w-24 text-xs font-medium text-muted-foreground">{label}</p>
      <div
        className={[
          "text-sm leading-6",
          multiline ? "whitespace-pre-wrap" : "",
          tone === "danger" ? "text-rose-700" : "text-foreground",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function IssueTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "min-h-16 w-full rounded-xl border border-input/85 bg-background/80 px-3.5 py-2 text-sm shadow-sm outline-none transition-[color,box-shadow,border-color,background-color]",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        props.className ?? "",
      ].join(" ")}
    />
  );
}
