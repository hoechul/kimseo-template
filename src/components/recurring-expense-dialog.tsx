"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ExpenseType,
  RecurringExpense,
  RecurringExpenseInsert,
} from "@/lib/types";

interface RecurringExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: RecurringExpense | null;
  expenseTypes: ExpenseType[];
  onSave: (data: RecurringExpenseInsert) => Promise<void>;
}

const emptyForm: RecurringExpenseInsert = {
  title: "",
  type_id: null,
  vendor_name: null,
  vendor_id: null,
  amount: 0,
  vat_included: true,
  day_of_month: 1,
  start_date: new Date().toISOString().slice(0, 10),
  end_date: null,
  is_active: true,
  memo: null,
};

export function RecurringExpenseDialog({
  open,
  onOpenChange,
  template,
  expenseTypes,
  onSave,
}: RecurringExpenseDialogProps) {
  const [form, setForm] = useState<RecurringExpenseInsert>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (template) {
      setForm({
        title: template.title,
        type_id: template.type_id,
        vendor_name: template.vendor_name,
        vendor_id: template.vendor_id,
        amount: template.amount,
        vat_included: template.vat_included,
        day_of_month: template.day_of_month,
        start_date: template.start_date,
        end_date: template.end_date,
        is_active: template.is_active,
        memo: template.memo,
      });
    } else {
      setForm(emptyForm);
    }
  }, [template, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      alert("이름을 입력해주세요.");
      return;
    }
    if (form.amount <= 0) {
      alert("금액은 1원 이상이어야 합니다.");
      return;
    }
    if (form.day_of_month < 1 || form.day_of_month > 28) {
      alert("매월 지급일은 1~28 사이여야 합니다.");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {template ? "반복 매입 템플릿 수정" : "반복 매입 템플릿 등록"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">이름 *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="예: 본사 임대료"
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type_id">매입 유형</Label>
              <select
                id="type_id"
                value={form.type_id ?? ""}
                onChange={(e) => setForm({ ...form, type_id: e.target.value || null })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">선택</option>
                {expenseTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_vat_deductible === false ? " · 부가세 공제불가" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor_name">매입처</Label>
              <Input
                id="vendor_name"
                value={form.vendor_name ?? ""}
                onChange={(e) => setForm({ ...form, vendor_name: e.target.value || null })}
                placeholder="예: ○○빌딩"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">금액 (원) *</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                value={form.amount === 0 ? "" : form.amount}
                onChange={(e) =>
                  setForm({ ...form, amount: parseInt(e.target.value || "0", 10) || 0 })
                }
                placeholder="1100000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="day_of_month">매월 지급일 (1~28) *</Label>
              <Input
                id="day_of_month"
                type="number"
                min={1}
                max={28}
                value={form.day_of_month}
                onChange={(e) =>
                  setForm({
                    ...form,
                    day_of_month: Math.max(1, Math.min(28, parseInt(e.target.value || "1", 10) || 1)),
                  })
                }
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">시작일 *</Label>
              <Input
                id="start_date"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">종료일 (선택)</Label>
              <Input
                id="end_date"
                type="date"
                value={form.end_date ?? ""}
                onChange={(e) => setForm({ ...form, end_date: e.target.value || null })}
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.vat_included}
                onChange={(e) => setForm({ ...form, vat_included: e.target.checked })}
                className="h-4 w-4"
              />
              부가세 포함
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="h-4 w-4"
              />
              활성 (매월 자동 생성)
            </label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="memo">메모</Label>
            <Input
              id="memo"
              value={form.memo ?? ""}
              onChange={(e) => setForm({ ...form, memo: e.target.value || null })}
              placeholder="계약 기간, 호실 정보 등"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "저장 중..." : template ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
