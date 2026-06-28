"use client";

import Link from "next/link";
import { Paperclip, Plus, Save, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { PageHeader, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendLog } from "@/lib/log-client";
import { uploadFileToDrive } from "@/lib/drive-upload";
import { createClient } from "@/lib/supabase/client";
import { CUSTOMERS_DRIVE_ROOT_FOLDER_ID } from "@/lib/customers/drive";
import { DRIVE_ENABLED } from "@/lib/drive-config";
import type { CustomerType } from "@/lib/types";

const CUSTOMER_TYPE_OPTIONS: Array<{ value: CustomerType | "none"; label: string }> = [
  { value: "none", label: "선택 안 함" },
  { value: "개인", label: "개인" },
  { value: "개인사업자", label: "개인사업자" },
  { value: "법인", label: "법인" },
];

type ContactDraft = {
  name: string;
  position: string;
  phone: string;
  email: string;
  memo: string;
};

function createEmptyContact(): ContactDraft {
  return { name: "", position: "", phone: "", email: "", memo: "" };
}

export default function NewCustomerPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [form, setForm] = useState({
    name: "",
    customer_type: "none" as CustomerType | "none",
    representative_name: "",
    business_number: "",
    resident_number: "",
    bank_name: "",
    account_number: "",
    account_holder: "",
    address: "",
    memo: "",
  });
  const [contacts, setContacts] = useState<ContactDraft[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleAddContact() {
    setContacts((prev) => [...prev, createEmptyContact()]);
  }

  function handleRemoveContact(index: number) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }

  function handleContactChange(
    index: number,
    field: keyof ContactDraft,
    value: string,
  ) {
    setContacts((prev) =>
      prev.map((contact, i) => (i === index ? { ...contact, [field]: value } : contact)),
    );
  }

  function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    if (incoming.length === 0) return;
    setAttachedFiles((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (!next.some((f) => f.name === file.name && f.size === file.size)) {
          next.push(file);
        }
      }
      return next;
    });
    // 같은 파일을 다시 선택할 수 있도록 input 초기화
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleRemoveAttachedFile(target: File) {
    setAttachedFiles((prev) =>
      prev.filter((file) => !(file.name === target.name && file.size === target.size))
    );
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const name = form.name.trim();
    if (!name) {
      setError("고객명은 필수 항목입니다.");
      return;
    }

    const trimmedContacts = contacts.map((contact) => ({
      name: contact.name.trim(),
      position: contact.position.trim(),
      phone: contact.phone.trim(),
      email: contact.email.trim(),
      memo: contact.memo.trim(),
    }));
    const missingContactName = trimmedContacts.findIndex((contact) => !contact.name);
    if (missingContactName !== -1) {
      setError(`담당자 ${missingContactName + 1}의 이름을 입력해 주세요.`);
      return;
    }

    setLoading(true);

    // 모바일 안정성: 세션 워밍업 (memory: project_supabase_session_warmup)
    await supabase.auth.getSession();

    // 1. Drive 폴더 먼저 생성 (연동 활성 시에만, 실패해도 고객 등록은 진행)
    let driveFolderId: string | null = null;
    if (DRIVE_ENABLED) try {
      const folderRes = await fetch("/api/drive/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: CUSTOMERS_DRIVE_ROOT_FOLDER_ID }),
      });
      if (folderRes.ok) {
        const folder = await folderRes.json();
        driveFolderId = folder.id ?? null;
      } else {
        toast.warning("Drive 폴더 생성에 실패했습니다. 고객 상세에서 재시도 해주세요.");
      }
    } catch (err) {
      console.error("Drive 폴더 생성 오류:", err instanceof Error ? err.message : String(err));
      toast.warning("Drive 폴더 생성 중 오류가 발생했습니다. 고객 상세에서 재시도 해주세요.");
    }

    const customerType = form.customer_type === "none" ? null : form.customer_type;

    const insertPayload: Record<string, unknown> = {
      name,
      customer_type: customerType,
      representative_name: form.representative_name.trim() || null,
      business_number: form.business_number.trim() || null,
      resident_number: form.resident_number.trim() || null,
      bank_name: form.bank_name.trim() || null,
      account_number: form.account_number.trim() || null,
      account_holder: form.account_holder.trim() || null,
      address: form.address.trim() || null,
      memo: form.memo.trim() || null,
    };
    // drive_folder_id 컬럼은 마이그레이션 20260422150000 이후에만 존재. 값 있을 때만 전송.
    if (driveFolderId) {
      insertPayload.drive_folder_id = driveFolderId;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("customers")
      .insert(insertPayload)
      .select("id")
      .single();
    setLoading(false);

    if (insertError || !inserted) {
      console.error("고객 등록 실패:", insertError);
      const detail = insertError?.message ?? "알 수 없는 오류";
      toast.error(`고객 등록에 실패했습니다: ${detail}`);
      setError(detail);
      return;
    }

    // 담당자 일괄 등록 (실패해도 고객 등록 자체는 유지)
    if (trimmedContacts.length > 0) {
      const contactPayload = trimmedContacts.map((contact) => ({
        customer_id: inserted.id,
        name: contact.name,
        position: contact.position || null,
        phone: contact.phone || null,
        email: contact.email || null,
        memo: contact.memo || null,
      }));
      const { error: contactsError } = await supabase
        .from("customer_contacts")
        .insert(contactPayload);
      if (contactsError) {
        console.error("담당자 등록 실패:", contactsError.message);
        toast.warning(
          "담당자 등록에 실패했습니다. 고객 상세 페이지에서 다시 추가해 주세요.",
        );
      }
    }

    // 3. 첨부파일 일괄 업로드
    if (driveFolderId && attachedFiles.length > 0) {
      let uploadedCount = 0;
      for (const file of attachedFiles) {
        try {
          await uploadFileToDrive(driveFolderId, file);
          uploadedCount += 1;
        } catch (err) {
          console.error("파일 업로드 실패:", file.name, err);
          toast.error(`${file.name} 업로드에 실패했습니다.`);
        }
      }
      if (uploadedCount > 0) {
        toast.success(`첨부파일 ${uploadedCount}개를 업로드했습니다.`);
      }
    } else if (!driveFolderId && attachedFiles.length > 0) {
      toast.warning(
        "Drive 폴더가 없어 첨부파일을 업로드하지 못했습니다. 상세 페이지에서 폴더 생성 후 다시 업로드해 주세요."
      );
    }

    toast.success("고객이 등록되었습니다.");
    sendLog("CREATE_CUSTOMER", `고객 등록: ${name}`, {
      resource: "customer",
      resource_id: inserted.id,
    });
    router.push(`/dashboard/customers/${inserted.id}`);
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "고객관리", href: "/dashboard/customers" },
          { label: "신규 등록" },
        ]}
        title="고객 등록"
        funKey="customers"
        description="프로젝트와 매출에 연결할 기본 고객 정보를 먼저 정리합니다. 등록 시 Google Drive 폴더도 함께 생성됩니다."
        actions={
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/customers">목록으로</Link>
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="overflow-hidden">
          <CardContent className="pt-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">고객명 또는 회사명 *</Label>
                <Input
                  id="name"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="예: ○○주식회사"
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
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
                <p className="text-xs text-muted-foreground">
                  선택 안 함으로 두면 이후 상세 페이지에서 분류할 수 있습니다.
                </p>
              </div>

              {form.customer_type === "개인사업자" || form.customer_type === "법인" ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="representative_name">대표자명</Label>
                  <Input
                    id="representative_name"
                    name="representative_name"
                    value={form.representative_name}
                    onChange={handleChange}
                    placeholder="대표자명을 입력해 주세요"
                  />
                </div>
              ) : null}

              {form.customer_type === "개인" ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="resident_number">주민등록번호</Label>
                  <Input
                    id="resident_number"
                    name="resident_number"
                    value={form.resident_number}
                    onChange={handleChange}
                    placeholder="000000-0000000"
                    autoComplete="off"
                  />
                  <p className="text-xs text-amber-700">
                    민감 개인정보입니다. 원천징수 신고 등 꼭 필요한 용도로만 입력하고, 공유에 주의해 주세요.
                  </p>
                </div>
              ) : null}

              {form.customer_type === "개인사업자" || form.customer_type === "법인" ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="business_number">사업자번호</Label>
                  <Input
                    id="business_number"
                    name="business_number"
                    value={form.business_number}
                    onChange={handleChange}
                    placeholder="000-00-00000"
                  />
                </div>
              ) : null}

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="address">주소</Label>
                <Input
                  id="address"
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="주소를 입력해 주세요"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="memo">메모</Label>
                <textarea
                  id="memo"
                  name="memo"
                  value={form.memo}
                  onChange={handleChange}
                  rows={6}
                  placeholder="참고 메모를 입력해 주세요"
                  className="min-h-36 w-full rounded-[1.25rem] border border-input/85 bg-background/80 px-4 py-3 text-sm shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">담당자</CardTitle>
            <p className="text-xs text-muted-foreground">
              고객사의 담당자 정보를 등록합니다. 등록 후에도 상세 페이지에서 추가/수정할 수 있습니다.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {contacts.length === 0 ? (
                <p className="text-xs text-muted-foreground">담당자가 추가되지 않았습니다.</p>
              ) : (
                contacts.map((contact, index) => (
                  <div
                    key={index}
                    className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">담당자 {index + 1}</p>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRemoveContact(index)}
                        aria-label={`담당자 ${index + 1} 제거`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`contact-name-${index}`}>
                        이름 <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`contact-name-${index}`}
                        value={contact.name}
                        onChange={(event) =>
                          handleContactChange(index, "name", event.target.value)
                        }
                        placeholder="담당자 이름"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`contact-position-${index}`}>직책</Label>
                        <Input
                          id={`contact-position-${index}`}
                          value={contact.position}
                          onChange={(event) =>
                            handleContactChange(index, "position", event.target.value)
                          }
                          placeholder="예: 팀장"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`contact-phone-${index}`}>연락처</Label>
                        <Input
                          id={`contact-phone-${index}`}
                          value={contact.phone}
                          onChange={(event) =>
                            handleContactChange(index, "phone", event.target.value)
                          }
                          placeholder="전화번호"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`contact-email-${index}`}>이메일</Label>
                      <Input
                        id={`contact-email-${index}`}
                        type="email"
                        value={contact.email}
                        onChange={(event) =>
                          handleContactChange(index, "email", event.target.value)
                        }
                        placeholder="name@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`contact-memo-${index}`}>메모</Label>
                      <textarea
                        id={`contact-memo-${index}`}
                        value={contact.memo}
                        onChange={(event) =>
                          handleContactChange(index, "memo", event.target.value)
                        }
                        rows={3}
                        placeholder="추가로 남길 내용을 입력해 주세요"
                        className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      />
                    </div>
                  </div>
                ))
              )}
              <Button type="button" variant="outline" onClick={handleAddContact}>
                <Plus className="h-4 w-4" />
                담당자 추가
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">계좌정보</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="bank_name">은행명</Label>
                <Input
                  id="bank_name"
                  name="bank_name"
                  value={form.bank_name}
                  onChange={handleChange}
                  placeholder="예: 국민은행"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="account_number">계좌번호</Label>
                <Input
                  id="account_number"
                  name="account_number"
                  value={form.account_number}
                  onChange={handleChange}
                  placeholder="000-0000-0000-00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="account_holder">예금주</Label>
                <Input
                  id="account_holder"
                  name="account_holder"
                  value={form.account_holder}
                  onChange={handleChange}
                  placeholder="예금주명"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">파일 첨부</CardTitle>
            <p className="text-xs text-muted-foreground">
              신분증·사업자등록증·통장사본 등 관련 서류를 첨부하세요. 고객 등록과 함께 Google Drive 폴더에 업로드됩니다. (여러 파일 선택 가능)
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <input
                  ref={fileInputRef}
                  id="customer-attachments"
                  type="file"
                  multiple
                  onChange={handleFilesSelected}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                  파일 선택
                </Button>
              </div>
              {attachedFiles.length > 0 ? (
                <ul className="space-y-1">
                  {attachedFiles.map((file) => (
                    <li
                      key={`${file.name}-${file.size}`}
                      className="flex items-center justify-between rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{file.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="ml-2 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRemoveAttachedFile(file)}
                        aria-label={`${file.name} 제거`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">선택된 파일이 없습니다.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {error ? (
          <div className="rounded-2xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/customers">취소</Link>
          </Button>
          <Button type="submit" disabled={loading}>
            <Save className="h-4 w-4" />
            {loading ? "등록 중..." : "고객 등록"}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
