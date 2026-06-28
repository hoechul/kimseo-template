"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { CUSTOMERS_DRIVE_ROOT_FOLDER_ID } from "@/lib/customers/drive";
import { DRIVE_ENABLED } from "@/lib/drive-config";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { CustomerType } from "@/lib/types";

interface CustomerCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customerId: string) => void;
}

const CUSTOMER_TYPE_OPTIONS: Array<{ value: CustomerType | "none"; label: string }> = [
  { value: "none", label: "구분 없음" },
  { value: "개인", label: "개인" },
  { value: "개인사업자", label: "개인사업자" },
  { value: "법인", label: "법인" },
];

function createEmptyForm() {
  return {
    name: "",
    customer_type: "none" as CustomerType | "none",
    representative_name: "",
    business_number: "",
    resident_number: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    address: "",
    memo: "",
  };
}

export function CustomerCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: CustomerCreateDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState(createEmptyForm);
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next && !saving) setForm(createEmptyForm());
  };

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      toast.error("고객명은 필수입니다.");
      return;
    }

    setSaving(true);
    await supabase.auth.getSession();

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
        toast.warning("Drive 폴더 생성에 실패했습니다. 고객 정보는 먼저 등록합니다.");
      }
    } catch {
      toast.warning("Drive 폴더 생성 중 오류가 발생했습니다. 고객 정보는 먼저 등록합니다.");
    }

    const insertPayload: Record<string, unknown> = {
      name,
      customer_type: form.customer_type === "none" ? null : form.customer_type,
      representative_name: form.representative_name.trim() || null,
      business_number: form.business_number.trim() || null,
      resident_number: form.resident_number.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      address: form.address.trim() || null,
      memo: form.memo.trim() || null,
    };
    if (driveFolderId) insertPayload.drive_folder_id = driveFolderId;

    const { data, error } = await supabase
      .from("customers")
      .insert(insertPayload)
      .select("id")
      .single();

    setSaving(false);

    if (error || !data) {
      toast.error(`고객 등록에 실패했습니다: ${error?.message ?? "알 수 없는 오류"}`);
      return;
    }

    toast.success("고객이 등록되었습니다.");
    sendLog("CREATE_CUSTOMER", `워크스페이스 고객 등록: ${name}`, {
      resource: "customer",
      resource_id: data.id,
    });
    setForm(createEmptyForm());
    onOpenChange(false);
    onCreated(data.id);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>고객 추가</DialogTitle>
          <DialogDescription>
            워크스페이스에서 바로 찾고 프로젝트에 연결할 고객 기본정보를 등록합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="workspace-customer-name">고객명 *</Label>
              <Input
                id="workspace-customer-name"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="회사명 또는 고객명"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-customer-type">고객 구분</Label>
              <select
                id="workspace-customer-type"
                name="customer_type"
                value={form.customer_type}
                onChange={handleChange}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CUSTOMER_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-customer-representative">대표자명</Label>
              <Input
                id="workspace-customer-representative"
                name="representative_name"
                value={form.representative_name}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-customer-business-number">사업자번호</Label>
              <Input
                id="workspace-customer-business-number"
                name="business_number"
                value={form.business_number}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-customer-resident-number">주민번호</Label>
              <Input
                id="workspace-customer-resident-number"
                name="resident_number"
                value={form.resident_number}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-customer-contact-name">담당자명</Label>
              <Input
                id="workspace-customer-contact-name"
                name="contact_name"
                value={form.contact_name}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-customer-contact-phone">담당자 연락처</Label>
              <Input
                id="workspace-customer-contact-phone"
                name="contact_phone"
                value={form.contact_phone}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="workspace-customer-contact-email">담당자 이메일</Label>
              <Input
                id="workspace-customer-contact-email"
                name="contact_email"
                type="email"
                value={form.contact_email}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="workspace-customer-address">주소</Label>
              <Input
                id="workspace-customer-address"
                name="address"
                value={form.address}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="workspace-customer-memo">메모</Label>
              <textarea
                id="workspace-customer-memo"
                name="memo"
                value={form.memo}
                onChange={handleChange}
                rows={3}
                className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              {saving ? "등록 중..." : "고객 추가"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
