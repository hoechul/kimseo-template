"use client";

import { FileText, Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  SectionCard,
} from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { useMasking } from "@/components/masking-provider";

interface EmployeeInfo {
  name: string;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  employee_type: string | null;
}

const PURPOSE_OPTIONS = [
  "일반용",
  "은행제출용",
  "비자신청용",
  "관공서제출용",
  "기타",
];

// 재직증명서에 표시되는 회사 정보입니다. 본인 회사 정보로 바꿔서 사용하세요.
const COMPANY_INFO = {
  name: "주식회사 ○○○",
  representative: "대표자명",
  businessNumber: "000-00-00000",
  address: "",
  phone: "00-0000-0000",
};

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

function todayFormatted(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  return `${y}년 ${m}월 ${d}일`;
}

function todayISO(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export default function CertificatesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { mask, enabled: maskEnabled, setEnabled: setMaskEnabled } = useMasking();
  const printRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [purpose, setPurpose] = useState("일반용");
  const [customPurpose, setCustomPurpose] = useState("");
  const [issued, setIssued] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError(true);
        setLoading(false);
        return;
      }

      const { data, error: empError } = await supabase
        .from("employees")
        .select("name, department, position, hire_date, employee_type")
        .eq("auth_uid", user.id)
        .maybeSingle();

      if (empError || !data) {
        setError(true);
        setLoading(false);
        return;
      }

      setEmployee(data);
    } catch {
      setError(true);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const resolvedPurpose = purpose === "기타" ? customPurpose.trim() || "기타" : purpose;

  const handleIssue = () => {
    if (!employee) return;
    setIssued(true);
    toast.success("재직증명서가 발급되었습니다.");
  };

  const handlePrint = async () => {
    if (!printRef.current) return;

    const prevMaskEnabled = maskEnabled;
    if (prevMaskEnabled) {
      setMaskEnabled(false);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    const printContents = printRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("팝업이 차단되었습니다. 팝업을 허용해주세요.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>재직증명서</title>
        <style>
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.min.css');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Pretendard', sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page { size: A4; margin: 20mm; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>${printContents}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
      if (prevMaskEnabled) setMaskEnabled(true);
    }, 300);
  };

  if (loading) {
    return (
      <PageShell>
        <PageHeader title="재직증명서 발급" />
        <LoadingState label="직원 정보를 불러오는 중입니다." />
      </PageShell>
    );
  }

  if (error || !employee) {
    return (
      <PageShell>
        <PageHeader title="재직증명서 발급" />
        <ErrorState
          title="직원 정보를 불러오지 못했습니다."
          description="로그인 상태를 확인하거나 관리자에게 문의해주세요."
          onRetry={load}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="재직증명서 발급"
        description="본인의 재직증명서를 직접 발급할 수 있습니다."
        actions={
          issued ? (
            <Button onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              인쇄 / PDF 저장
            </Button>
          ) : undefined
        }
      />

      {!issued ? (
        <SectionCard>
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>성명</Label>
                <Input value={mask("name", employee.name)} readOnly className="bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label>부서</Label>
                <Input value={employee.department || "-"} readOnly className="bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label>직위</Label>
                <Input value={employee.position || "-"} readOnly className="bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label>입사일</Label>
                <Input
                  value={employee.hire_date ? formatDate(employee.hire_date) : "-"}
                  readOnly
                  className="bg-muted/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>용도</Label>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PURPOSE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {purpose === "기타" && (
                <Input
                  placeholder="용도를 입력해주세요"
                  value={customPurpose}
                  onChange={(e) => setCustomPurpose(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleIssue}>
                <FileText className="mr-2 h-4 w-4" />
                재직증명서 발급
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-4">
          <SectionCard className="p-0 overflow-auto">
            <div ref={printRef}>
              <CertificateDocument
                employee={employee}
                purpose={resolvedPurpose}
                issueDate={todayFormatted()}
                issueDateISO={todayISO()}
                company={COMPANY_INFO}
                maskName={(v) => mask("name", v)}
              />
            </div>
          </SectionCard>

          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => setIssued(false)}>
              다시 작성
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              인쇄 / PDF 저장
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function CertificateDocument({
  employee,
  purpose,
  issueDate,
  issueDateISO,
  company,
  maskName,
}: {
  employee: EmployeeInfo;
  purpose: string;
  issueDate: string;
  issueDateISO: string;
  company: typeof COMPANY_INFO;
  maskName: (value: string) => string;
}) {
  const maskedName = maskName(employee.name);
  return (
    <div
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "25mm 20mm",
        fontFamily: "'Pretendard', sans-serif",
        color: "#1a1a1a",
        lineHeight: 1.8,
        position: "relative",
      }}
    >
      {/* Title */}
      <h1
        style={{
          textAlign: "center",
          fontSize: "28pt",
          fontWeight: 700,
          letterSpacing: "12px",
          marginBottom: "50px",
        }}
      >
        재 직 증 명 서
      </h1>

      {/* Info Table */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "40px",
          fontSize: "11pt",
        }}
      >
        <tbody>
          <tr>
            <td style={thStyle}>성 명</td>
            <td style={tdStyle}>{maskedName}</td>
            <td style={thStyle}>부 서</td>
            <td style={tdStyle}>{employee.department || "-"}</td>
          </tr>
          <tr>
            <td style={thStyle}>직 위</td>
            <td style={tdStyle}>{employee.position || "-"}</td>
            <td style={thStyle}>입사일</td>
            <td style={tdStyle}>
              {employee.hire_date ? formatDate(employee.hire_date) : "-"}
            </td>
          </tr>
          <tr>
            <td style={thStyle}>용 도</td>
            <td style={tdStyle} colSpan={3}>
              {purpose}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Body */}
      <div
        style={{
          textAlign: "center",
          fontSize: "12pt",
          marginTop: "60px",
          marginBottom: "60px",
          lineHeight: 2.2,
        }}
      >
        <p>
          위 사람은 {company.name}에 재직하고 있음을 증명합니다.
        </p>
      </div>

      {/* Issue Date */}
      <div
        style={{
          textAlign: "center",
          fontSize: "12pt",
          marginTop: "80px",
          marginBottom: "60px",
        }}
      >
        <p>{issueDate}</p>
      </div>

      {/* Company Info */}
      <div
        style={{
          textAlign: "center",
          fontSize: "12pt",
          lineHeight: 2,
        }}
      >
        <p style={{ fontSize: "14pt", fontWeight: 600 }}>{company.name}</p>
        {company.businessNumber && (
          <p style={{ fontSize: "10pt", color: "#666" }}>
            (사업자등록번호: {company.businessNumber})
          </p>
        )}
        <p style={{ marginTop: "10px", fontSize: "13pt", fontWeight: 600 }}>
          대표이사 {company.representative} (인)
        </p>
      </div>

      {/* Footer - issue number */}
      <div
        style={{
          position: "absolute",
          bottom: "20mm",
          left: "20mm",
          right: "20mm",
          borderTop: "1px solid #e5e5e5",
          paddingTop: "8px",
          fontSize: "8pt",
          color: "#999",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>발급번호: CERT-{issueDateISO.replace(/-/g, "")}-{maskedName.replace(/\s/g, "")}</span>
        <span>본 증명서는 발급일 기준으로 유효합니다.</span>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  width: "18%",
  padding: "10px 14px",
  backgroundColor: "#f8f9fa",
  border: "1px solid #dee2e6",
  fontWeight: 600,
  textAlign: "center",
  fontSize: "11pt",
};

const tdStyle: React.CSSProperties = {
  width: "32%",
  padding: "10px 14px",
  border: "1px solid #dee2e6",
  fontSize: "11pt",
};
