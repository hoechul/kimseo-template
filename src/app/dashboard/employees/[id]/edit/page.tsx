"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { resolveSlackIdByEmployeeName, suggestSlackIdForEmployee } from "@/lib/employee-slack";
import { EMPLOYEE_TYPE_OPTIONS } from "@/lib/employee-type";
import { LoadingState } from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import type { Employee } from "@/lib/types";

export default function EmployeeEditPage() {
  const params = useParams();
  const router = useRouter();
  const employeeId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employeeTypeEnabled, setEmployeeTypeEnabled] = useState(true);
  const [originalLoginId, setOriginalLoginId] = useState<string | null>(null);

  // Password reset dialog states
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { mask } = useMasking();

  const [form, setForm] = useState<{
    name: string;
    department: string;
    position: string;
    employee_type: string;
    is_finance: boolean;
    email: string;
    phone: string;
    slack_id: string;
    hire_date: string;
    login_id: string;
  }>({
    name: "",
    department: "",
    position: "",
    employee_type: "직원",
    is_finance: false,
    email: "",
    phone: "",
    slack_id: "",
    hire_date: "",
    login_id: "",
  });

  const fetchEmployee = useCallback(async () => {
    setLoading(true);

    const { error: probeError } = await supabase
      .from("employees")
      .select("id, employee_type")
      .limit(1);
    setEmployeeTypeEnabled(!probeError);

    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("id", employeeId)
      .single();

    if (error) {
      console.error("직원 정보 조회 실패:", error.message);
      toast.error("직원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    } else if (data) {
      setEmployee(data);
      const loginId = data.login_id ?? "";
      setOriginalLoginId(loginId);
      setForm({
        name: data.name ?? "",
        department: data.department ?? "",
        position: data.position ?? "",
        employee_type: data.employee_type ?? "직원",
        is_finance: data.is_finance ?? false,
        email: data.email ?? "",
        phone: data.phone ?? "",
        slack_id: suggestSlackIdForEmployee(data.name, data.slack_id),
        hire_date: data.hire_date ?? "",
        login_id: loginId,
      });
    }

    setLoading(false);
  }, [supabase, employeeId]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
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

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("이름은 필수 항목입니다.");
      return;
    }

    setSaving(true);
    try {
      const basePayload = {
        name: form.name,
        department: form.department || null,
        position: form.position || null,
        email: form.email || null,
        phone: form.phone || null,
        slack_id: form.slack_id || null,
        hire_date: form.hire_date || null,
        login_id: form.login_id || null,
        is_finance: form.is_finance,
      };

      const payload = employeeTypeEnabled
        ? { ...basePayload, employee_type: form.employee_type || "직원" }
        : basePayload;

      const { error } = await supabase
        .from("employees")
        .update(payload)
        .eq("id", employeeId);

      if (error) {
        console.error("직원 정보 저장 실패:", error.message);
        toast.error("저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      // If login_id changed and employee has auth_uid, update auth as well
      if (
        employee?.auth_uid &&
        form.login_id !== originalLoginId
      ) {
        const res = await fetch("/api/employees/auth", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            auth_uid: employee.auth_uid,
            login_id: form.login_id,
          }),
        });
        if (!res.ok) {
          const result = await res.json();
          console.error("계정 로그인 ID 업데이트 실패:", result.error);
          toast.error("계정 로그인 ID 업데이트에 실패했습니다. 잠시 후 다시 시도해주세요.");
          return;
        }
      }

      router.push(`/dashboard/employees/${employeeId}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPasswordConfirm = async () => {
    if (!employee?.auth_uid) return;
    setConfirmResetOpen(false);
    setResetting(true);
    setTempPassword(null);
    try {
      const res = await fetch("/api/employees/auth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth_uid: employee.auth_uid }),
      });
      const result = await res.json();
      if (res.ok) {
        setTempPassword(result.temp_password);
        setResultOpen(true);
      } else {
        console.error("비밀번호 재설정 실패:", result.error);
        toast.error("비밀번호 재설정에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setResetting(false);
    }
  };

  const handleCopy = async () => {
    if (!tempPassword) return;
    await navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <LoadingState title="직원 정보를 불러오는 중입니다." />;
  }

  if (!employee) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">직원을 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/employees")}>
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/employees"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            직원관리
          </Link>
          <span className="text-sm text-muted-foreground">/</span>
          <Link
            href={`/dashboard/employees/${employeeId}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {mask("name", employee.name)}
          </Link>
          <span className="text-sm text-muted-foreground">/</span>
          <span className="text-sm font-medium">수정</span>
        </div>
        <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">직원 정보 수정</h3>
      </div>

      {/* Basic Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* 이름 */}
            <div className="space-y-2">
              <Label htmlFor="name">
                이름 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="이름을 입력하세요"
              />
            </div>

            {/* 부서 */}
            <div className="space-y-2">
              <Label htmlFor="department">부서</Label>
              <Input
                id="department"
                value={form.department}
                onChange={(e) => handleChange("department", e.target.value)}
                placeholder="부서를 입력하세요"
              />
            </div>

            {/* 직급 */}
            <div className="space-y-2">
              <Label htmlFor="position">직급</Label>
              <Input
                id="position"
                value={form.position}
                onChange={(e) => handleChange("position", e.target.value)}
                placeholder="직급을 입력하세요"
              />
            </div>

            {/* 직원구분 */}
            <div className="space-y-2">
              <Label htmlFor="employee_type">직원구분</Label>
              <select
                id="employee_type"
                value={form.employee_type}
                onChange={(e) => handleChange("employee_type", e.target.value)}
                disabled={!employeeTypeEnabled}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {EMPLOYEE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {/* 재무팀 권한 */}
            <div className="space-y-2">
              <Label>재무팀 권한</Label>
              <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
                <input
                  id="is_finance"
                  type="checkbox"
                  checked={form.is_finance}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, is_finance: e.target.checked }))
                  }
                  className="size-4 cursor-pointer"
                />
                <span>재무팀 (매입확정 권한)</span>
              </label>
            </div>

            {/* 이메일 */}
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="이메일을 입력하세요"
              />
            </div>

            {/* 전화번호 */}
            <div className="space-y-2">
              <Label htmlFor="phone">전화번호</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="전화번호를 입력하세요"
              />
            </div>

            {/* 입사일 */}
            <div className="space-y-2">
              <Label htmlFor="hire_date">입사일</Label>
              <Input
                id="hire_date"
                type="date"
                value={form.hire_date}
                onChange={(e) => handleChange("hire_date", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 계정 정보 섹션 - only shown when employee has auth_uid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Slack 연동</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="slack_id">Slack ID</Label>
            <Input
              id="slack_id"
              value={form.slack_id}
              onChange={(e) => handleChange("slack_id", e.target.value)}
              placeholder="U0123456789"
            />
          </div>
        </CardContent>
      </Card>

      {employee.auth_uid && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">계정 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 로그인 ID */}
            <div className="space-y-2">
              <Label htmlFor="login_id">로그인 ID</Label>
              <Input
                id="login_id"
                value={form.login_id}
                onChange={(e) => handleChange("login_id", e.target.value)}
                placeholder="로그인 ID를 입력하세요"
              />
            </div>

            {/* 비밀번호 재설정 */}
            <div className="space-y-2">
              <Label>비밀번호</Label>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmResetOpen(true)}
                  disabled={resetting}
                >
                  {resetting ? "재설정 중..." : "비밀번호 재설정"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bottom buttons */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/dashboard/employees/${employeeId}`)}
        >
          취소
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>

      {/* 비밀번호 재설정 확인 Dialog */}
      <Dialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>비밀번호 재설정</DialogTitle>
            <DialogDescription>
              비밀번호를 재설정하시겠습니까? 임시 비밀번호가 생성됩니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmResetOpen(false)}
            >
              취소
            </Button>
            <Button type="button" onClick={handleResetPasswordConfirm}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 비밀번호 재설정 결과 Dialog */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>임시 비밀번호</DialogTitle>
            <DialogDescription>
              임시 비밀번호가 생성되었습니다. 직원에게 전달해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <code className="rounded bg-background px-2 py-1 text-sm font-mono font-bold flex-1">
                {tempPassword}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                {copied ? "복사됨" : "복사"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setResultOpen(false)}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
