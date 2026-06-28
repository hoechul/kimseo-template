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
import type { CorporateCardInsert, Employee } from "@/lib/types";

interface CorporateCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Pick<Employee, "id" | "name">[];
  onSave: (data: CorporateCardInsert) => Promise<void>;
}

const emptyForm: CorporateCardInsert = {
  alias: null,
  last4: "",
  holder_employee_id: null,
  issuer: null,
  is_active: true,
  memo: null,
};

export function CorporateCardDialog({
  open,
  onOpenChange,
  employees,
  onSave,
}: CorporateCardDialogProps) {
  const [form, setForm] = useState<CorporateCardInsert>(emptyForm);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setForm(emptyForm);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(form.last4)) {
      alert("카드 끝 4자리는 숫자 4자리여야 합니다.");
      return;
    }
    setLoading(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>법인카드 등록</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="last4">카드 끝 4자리 *</Label>
              <Input
                id="last4"
                value={form.last4}
                onChange={(e) =>
                  setForm({ ...form, last4: e.target.value.replace(/\D/g, "").slice(0, 4) })
                }
                placeholder="1234"
                maxLength={4}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issuer">카드사</Label>
              <Input
                id="issuer"
                value={form.issuer ?? ""}
                onChange={(e) => setForm({ ...form, issuer: e.target.value || null })}
                placeholder="신한 / 삼성 / 현대 …"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="holder">사용 직원</Label>
            <select
              id="holder"
              value={form.holder_employee_id ?? ""}
              onChange={(e) =>
                setForm({ ...form, holder_employee_id: e.target.value || null })
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">미지정</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="memo">메모</Label>
            <Input
              id="memo"
              value={form.memo ?? ""}
              onChange={(e) => setForm({ ...form, memo: e.target.value || null })}
              placeholder="용도, 한도 등"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "저장 중..." : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
