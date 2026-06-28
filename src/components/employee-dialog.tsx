"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { resolveSlackIdByEmployeeName, suggestSlackIdForEmployee } from "@/lib/employee-slack";
import { EMPLOYEE_TYPE_OPTIONS } from "@/lib/employee-type";
import type { Employee, EmployeeInsert, EmployeeType } from "@/lib/types";

interface EmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  onSave: (data: EmployeeInsert) => Promise<void>;
  enableEmployeeType?: boolean;
}

type EmployeeForm = Omit<EmployeeInsert, "employee_type"> & {
  employee_type: EmployeeType;
};

const emptyForm: EmployeeForm = {
  name: "",
  department: "",
  position: "",
  employee_type: "직원",
  email: "",
  phone: "",
  slack_id: "",
  hire_date: "",
  login_id: "",
};

export function EmployeeDialog({
  open,
  onOpenChange,
  employee,
  onSave,
  enableEmployeeType = true,
}: EmployeeDialogProps) {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (employee) {
      setForm({
        name: employee.name,
        department: employee.department ?? "",
        position: employee.position ?? "",
        employee_type: employee.employee_type ?? "직원",
        email: employee.email ?? "",
        phone: employee.phone ?? "",
        slack_id: suggestSlackIdForEmployee(employee.name, employee.slack_id),
        hire_date: employee.hire_date ?? "",
        login_id: employee.login_id ?? "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [employee, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const update = (field: keyof EmployeeForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value as EmployeeForm[typeof field],
      ...(field === "name"
        ? {
            slack_id:
              !prev.slack_id ||
              prev.slack_id === (resolveSlackIdByEmployeeName(prev.name) ?? "")
                ? suggestSlackIdForEmployee(value, "")
                : prev.slack_id,
          }
        : {}),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {employee ? "직원 정보 수정" : "신규 직원 등록"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">이름 *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="홍길동"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slack_id">Slack ID</Label>
              <Input
                id="slack_id"
                value={form.slack_id ?? ""}
                onChange={(e) => update("slack_id", e.target.value)}
                placeholder="U0123456789"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">부서</Label>
              <Input
                id="department"
                value={form.department ?? ""}
                onChange={(e) => update("department", e.target.value)}
                placeholder="개발팀"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="position">직급</Label>
              <Input
                id="position"
                value={form.position ?? ""}
                onChange={(e) => update("position", e.target.value)}
                placeholder="사원"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee_type">직원구분</Label>
              <select
                id="employee_type"
                value={form.employee_type}
                onChange={(e) => update("employee_type", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!enableEmployeeType}
              >
                {EMPLOYEE_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              {!enableEmployeeType && (
                <p className="text-xs text-muted-foreground">
                  DB에 employee_type 컬럼 적용 후 저장 시 반영됩니다.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                value={form.email ?? ""}
                onChange={(e) => update("email", e.target.value)}
                placeholder="hong@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">전화번호</Label>
              <Input
                id="phone"
                value={form.phone ?? ""}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="010-1234-5678"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hire_date">입사일</Label>
              <Input
                id="hire_date"
                type="date"
                value={form.hire_date ?? ""}
                onChange={(e) => update("hire_date", e.target.value)}
              />
            </div>
          </div>

          {/* 로그인 계정 영역 - 신규 등록 시만 표시 */}
          {!employee && (
            <div className="space-y-4 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">
                로그인 계정 (선택)
              </p>
              <div className="space-y-2">
                <Label htmlFor="login_id">로그인 ID</Label>
                <Input
                  id="login_id"
                  value={form.login_id ?? ""}
                  onChange={(e) => update("login_id", e.target.value)}
                  placeholder="hong"
                />
                <p className="text-xs text-muted-foreground">
                  로그인 ID를 입력하면 비밀번호가 자동 생성됩니다
                </p>
              </div>
            </div>
          )}

          {/* 수정 시 로그인 ID 표시 */}
          {employee && employee.login_id && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">
                로그인 계정
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">로그인 ID:</span>
                <span className="font-medium">{employee.login_id}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "저장 중..." : employee ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
