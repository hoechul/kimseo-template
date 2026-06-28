"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { LoadingState } from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import type { Customer, CustomerType, VendorTaxCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Paperclip, X } from "lucide-react";
import { uploadFileToDrive } from "@/lib/drive-upload";
import { CUSTOMERS_DRIVE_ROOT_FOLDER_ID } from "@/lib/customers/drive";
import { PERSONAL_WITHHOLDING_RATE } from "@/lib/expenses/tax";

const CUSTOMER_TYPE_OPTIONS: Array<{ value: CustomerType | "none"; label: string }> = [
  { value: "none", label: "선택 안 함" },
  { value: "개인", label: "개인" },
  { value: "개인사업자", label: "개인사업자" },
  { value: "법인", label: "법인" },
];

const VENDOR_TAX_OPTIONS: Array<{ value: VendorTaxCategory | "none-unset"; label: string }> = [
  { value: "none-unset", label: "매입 대상 아님" },
  { value: "personal_withholding", label: "개인 (원천 3.3%)" },
  { value: "business_vat", label: "사업자 (세금계산서 10%)" },
  { value: "corporate_vat", label: "법인 (세금계산서 10%)" },
  { value: "none", label: "해당없음" },
];

export default function CustomerEditPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    name: "",
    customer_type: "none" as CustomerType | "none",
    representative_name: "",
    business_number: "",
    resident_number: "",
    address: "",
    memo: "",
    tax_category: "" as VendorTaxCategory | "",
    default_withholding_rate: "",
    bank_name: "",
    account_number: "",
    account_holder: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchCustomer = useCallback(async () => {
    setLoading(true);

    const { data, error: fetchError } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .single();

    if (fetchError) {
      console.error("고객 정보 조회 실패:", fetchError.message);
      toast.error("고객 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setCustomer(null);
      setLoading(false);
      return;
    }

    const nextCustomer = data as Customer;
    setCustomer(nextCustomer);
    setForm({
      name: nextCustomer.name ?? "",
      customer_type: nextCustomer.customer_type ?? "none",
      representative_name: nextCustomer.representative_name ?? "",
      business_number: nextCustomer.business_number ?? "",
      resident_number: nextCustomer.resident_number ?? "",
      address: nextCustomer.address ?? "",
      memo: nextCustomer.memo ?? "",
      tax_category: (nextCustomer.tax_category as VendorTaxCategory | null) ?? "",
      default_withholding_rate:
        nextCustomer.default_withholding_rate !== null
          ? String(nextCustomer.default_withholding_rate)
          : "",
      bank_name: nextCustomer.bank_name ?? "",
      account_number: nextCustomer.account_number ?? "",
      account_holder: nextCustomer.account_holder ?? "",
    });
    setLoading(false);
  }, [customerId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCustomer();
  }, [fetchCustomer]);

  function handleFormChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  async function ensureDriveFolder(): Promise<string | null> {
    if (customer?.drive_folder_id) return customer.drive_folder_id;
    if (!customer) return null;
    setCreatingFolder(true);
    try {
      const folderRes = await fetch("/api/drive/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customer.name,
          parentId: CUSTOMERS_DRIVE_ROOT_FOLDER_ID,
        }),
      });
      if (!folderRes.ok) {
        toast.error("Drive 폴더 생성에 실패했습니다.");
        return null;
      }
      const folder = await folderRes.json();
      if (!folder?.id) return null;
      const { error: updateError } = await supabase
        .from("customers")
        .update({ drive_folder_id: folder.id })
        .eq("id", customerId);
      if (updateError) {
        toast.error("Drive 폴더 ID 저장에 실패했습니다.");
        return null;
      }
      setCustomer({ ...customer, drive_folder_id: folder.id });
      toast.success("Drive 폴더를 생성했습니다.");
      return folder.id;
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (files.length === 0) return;

    const folderId = await ensureDriveFolder();
    if (!folderId) {
      toast.error("Drive 폴더가 없어 업로드할 수 없습니다.");
      return;
    }

    setUploadingFiles(true);
    let uploadedCount = 0;
    for (const file of files) {
      try {
        await uploadFileToDrive(folderId, file);
        uploadedCount += 1;
      } catch (err) {
        console.error("파일 업로드 실패:", file.name, err);
        toast.error(`${file.name} 업로드에 실패했습니다.`);
      }
    }
    setUploadingFiles(false);
    if (uploadedCount > 0) {
      toast.success(`${uploadedCount}개 파일을 업로드했습니다. 상세 페이지 파일함에서 확인하세요.`);
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("고객명은 필수 입력 항목입니다.");
      return;
    }

    setSaving(true);

    const rawRate = form.default_withholding_rate.trim();
    let parsedRate: number | null = null;
    if (rawRate) {
      const parsed = Number(rawRate);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        setSaving(false);
        setError("원천징수율은 0~1 사이 숫자로 입력해주세요. 예: 개인 3.3% → 0.033");
        return;
      }
      parsedRate = parsed;
    }
    const resolvedTaxCategory = form.tax_category === "" ? null : form.tax_category;
    const resolvedRate =
      parsedRate !== null
        ? parsedRate
        : resolvedTaxCategory === "personal_withholding"
          ? PERSONAL_WITHHOLDING_RATE
          : null;

    const resolvedCustomerType = form.customer_type === "none" ? null : form.customer_type;

    const { error: updateError } = await supabase
      .from("customers")
      .update({
        name: form.name.trim(),
        customer_type: resolvedCustomerType,
        representative_name: form.representative_name.trim() || null,
        business_number: form.business_number.trim() || null,
        resident_number: form.resident_number.trim() || null,
        address: form.address.trim() || null,
        memo: form.memo.trim() || null,
        tax_category: resolvedTaxCategory,
        default_withholding_rate: resolvedRate,
        bank_name: form.bank_name.trim() || null,
        account_number: form.account_number.trim() || null,
        account_holder: form.account_holder.trim() || null,
      })
      .eq("id", customerId);

    setSaving(false);

    if (updateError) {
      console.error("고객 정보 수정 실패:", updateError);
      const detail = updateError.message ?? "알 수 없는 오류";
      toast.error(`고객 정보 수정에 실패했습니다: ${detail}`);
      setError(detail);
      return;
    }

    toast.success("고객 정보가 수정되었습니다.");
    router.push(`/dashboard/customers/${customerId}`);
  }

  if (loading) {
    return <LoadingState title="고객 정보를 불러오는 중입니다." />;
  }

  if (!customer) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <p className="text-muted-foreground">고객 정보를 찾을 수 없습니다.</p>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/customers")}
        >
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/dashboard/customers"
          className="text-muted-foreground hover:text-foreground"
        >
          고객관리
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link
          href={`/dashboard/customers/${customerId}`}
          className="text-muted-foreground hover:text-foreground"
        >
          {mask("customer_name", customer.name)}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">수정</span>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">
                고객명(회사명) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                value={form.name}
                onChange={handleFormChange}
                placeholder="고객명 또는 회사명을 입력하세요"
                required
              />
            </div>

            <div className="space-y-1">
              <Label>고객 구분</Label>
              <div
                role="radiogroup"
                aria-label="고객 구분"
                className="flex flex-wrap items-center gap-4"
              >
                {CUSTOMER_TYPE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="customer_type"
                      value={option.value}
                      checked={form.customer_type === option.value}
                      onChange={() =>
                        setForm((prev) => ({
                          ...prev,
                          customer_type: option.value,
                        }))
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {form.customer_type === "개인사업자" || form.customer_type === "법인" ? (
              <div className="space-y-1">
                <Label htmlFor="representative_name">대표자명</Label>
                <Input
                  id="representative_name"
                  name="representative_name"
                  value={form.representative_name}
                  onChange={handleFormChange}
                  placeholder="대표자명을 입력하세요"
                />
              </div>
            ) : null}

            {form.customer_type === "개인" ? (
              <div className="space-y-1">
                <Label htmlFor="resident_number">주민등록번호</Label>
                <Input
                  id="resident_number"
                  name="resident_number"
                  value={form.resident_number}
                  onChange={handleFormChange}
                  placeholder="000000-0000000"
                  autoComplete="off"
                />
                <p className="text-xs text-amber-700">
                  민감 개인정보입니다. 원천징수 신고 등 꼭 필요한 용도로만 입력하세요.
                </p>
              </div>
            ) : null}

            {form.customer_type === "개인사업자" || form.customer_type === "법인" ? (
              <div className="space-y-1">
                <Label htmlFor="business_number">사업자번호</Label>
                <Input
                  id="business_number"
                  name="business_number"
                  value={form.business_number}
                  onChange={handleFormChange}
                  placeholder="000-00-00000"
                />
              </div>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="address">주소</Label>
              <Input
                id="address"
                name="address"
                value={form.address}
                onChange={handleFormChange}
                placeholder="주소를 입력하세요"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="memo">메모</Label>
              <textarea
                id="memo"
                name="memo"
                value={form.memo}
                onChange={handleFormChange}
                rows={12}
                placeholder="메모를 입력하세요"
                className="min-h-[18rem] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>계좌정보</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="bank_name">은행명</Label>
                <Input
                  id="bank_name"
                  name="bank_name"
                  value={form.bank_name}
                  onChange={handleFormChange}
                  placeholder="예: 국민은행"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="account_number">계좌번호</Label>
                <Input
                  id="account_number"
                  name="account_number"
                  value={form.account_number}
                  onChange={handleFormChange}
                  placeholder="000-0000-0000-00"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="account_holder">예금주</Label>
                <Input
                  id="account_holder"
                  name="account_holder"
                  value={form.account_holder}
                  onChange={handleFormChange}
                  placeholder="예금주명"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>파일 첨부</CardTitle>
            <p className="text-xs text-muted-foreground">
              신분증·사업자등록증·통장사본 등 관련 서류를 Google Drive 폴더에 업로드합니다. (여러 파일 선택 가능, 선택 즉시 업로드)
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                id="customer-attachments-edit"
                type="file"
                multiple
                onChange={(event) => void handleFilesSelected(event)}
                className="hidden"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFiles || creatingFolder}
                >
                  <Paperclip className="h-4 w-4" />
                  {uploadingFiles
                    ? "업로드 중..."
                    : creatingFolder
                      ? "Drive 폴더 준비 중..."
                      : "파일 선택"}
                </Button>
                {customer?.drive_folder_id ? (
                  <span className="text-xs text-muted-foreground">
                    Drive 폴더 연동됨. 업로드한 파일은 상세 페이지의 파일함에서 확인하세요.
                  </span>
                ) : (
                  <span className="text-xs text-amber-700">
                    Drive 폴더가 아직 없습니다. 파일 선택 시 자동으로 생성됩니다.
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>매입 대상 정보</CardTitle>
            <p className="text-xs text-muted-foreground">
              강사·외주 등 이 고객에게 매입할 때 자동으로 호출됩니다. 한 번 등록해 두면 이후 매입 등록 시 재입력이 필요 없습니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="tax_category">매입 구분</Label>
              <Select
                value={form.tax_category === "" ? "none-unset" : form.tax_category}
                onValueChange={(value) => {
                  if (value === "none-unset") {
                    setForm((prev) => ({ ...prev, tax_category: "", default_withholding_rate: "" }));
                    return;
                  }
                  setForm((prev) => ({
                    ...prev,
                    tax_category: value as VendorTaxCategory,
                    default_withholding_rate:
                      value === "personal_withholding"
                        ? prev.default_withholding_rate || String(PERSONAL_WITHHOLDING_RATE)
                        : "",
                  }));
                }}
              >
                <SelectTrigger id="tax_category">
                  <SelectValue placeholder="매입 구분을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_TAX_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.tax_category === "personal_withholding" ? (
              <div className="space-y-1">
                <Label htmlFor="default_withholding_rate">기본 원천징수율</Label>
                <Input
                  id="default_withholding_rate"
                  name="default_withholding_rate"
                  value={form.default_withholding_rate}
                  onChange={handleFormChange}
                  placeholder="개인 3.3% → 0.033"
                  inputMode="decimal"
                />
                <p className="text-xs text-muted-foreground">
                  0~1 사이 소수로 입력 (3.3% = 0.033)
                </p>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              신분증·사업자등록증·통장사본은 고객 상세 페이지의 파일함(Google Drive)에서 업로드·관리합니다.
            </p>
          </CardContent>
        </Card>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href={`/dashboard/customers/${customerId}`}>취소</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </form>
    </div>
  );
}
