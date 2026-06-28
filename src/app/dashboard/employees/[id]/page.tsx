"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { sendLog } from "@/lib/log-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { resolveEmployeeType } from "@/lib/employee-type";
import type { Employee } from "@/lib/types";

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const employeeId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [employeeTypeEnabled, setEmployeeTypeEnabled] = useState(true);
  const { mask } = useMasking();

  const fetchEmployee = useCallback(async () => {
    setLoading(true);
    setError(false);

    const [authRes, probeRes, employeeRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("employees").select("id, employee_type").limit(1),
      supabase.from("employees").select("*").eq("id", employeeId).single(),
    ]);

    setCurrentUserId(authRes.data.user?.id ?? null);
    setEmployeeTypeEnabled(!probeRes.error);

    const { data, error: fetchError } = employeeRes;
    if (fetchError) {
      console.error("직원 정보 조회 실패:", fetchError.message);
      toast.error("직원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setError(true);
    }
    setEmployee(data);
    setLoading(false);
  }, [supabase, employeeId]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  const handleDelete = async () => {
    if (!confirm("정말 이 직원을 삭제하시겠습니까?")) return;
    setDeleting(true);
    const { error } = await supabase.from("employees").delete().eq("id", employeeId);
    if (error) {
      console.error("직원 삭제 실패:", error.message);
      toast.error("직원 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setDeleting(false);
      return;
    }
    toast.success("직원이 삭제되었습니다.");
    sendLog("DELETE_EMPLOYEE", `직원 삭제: ${employee?.name}`, { resource: "employee", resource_id: employeeId });
    router.push("/dashboard/employees");
  };

  const handleToggleAccountActive = async () => {
    if (!employee) return;

    const nextActive = employee.is_active === false;
    const confirmed = confirm(
      nextActive
        ? "이 계정을 활성화하시겠습니까?"
        : "이 계정을 비활성화하시겠습니까?"
    );
    if (!confirmed) return;

    setStatusUpdating(true);
    const payload = nextActive
      ? {
          is_active: true,
          failed_login_count: 0,
          failed_login_window_started_at: null,
          last_failed_login_at: null,
        }
      : {
          is_active: false,
        };

    const { error } = await supabase.from("employees").update(payload).eq("id", employeeId);
    if (error) {
      console.error("계정 상태 변경 실패:", error.message);
      toast.error("계정 상태 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setStatusUpdating(false);
      return;
    }

    setEmployee((prev) => (prev ? { ...prev, ...payload } : prev));
    toast.success(nextActive ? "계정이 활성화되었습니다." : "계정이 비활성화되었습니다.");
    sendLog(nextActive ? "ACTIVATE_EMPLOYEE_LOGIN" : "DEACTIVATE_EMPLOYEE_LOGIN", `${employee.name} 계정 상태 변경`, {
      resource: "employee",
      resource_id: employeeId,
      details: { is_active: nextActive },
    });

    setStatusUpdating(false);
  };

  if (loading) {
    return <LoadingState title="직원 정보를 불러오는 중입니다." />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">정보를 불러오지 못했습니다.</p>
        <Button variant="outline" onClick={() => fetchEmployee()}>
          다시 시도
        </Button>
      </div>
    );
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
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/employees"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              직원관리
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm font-medium">{mask("name", employee.name)}</span>
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">{mask("name", employee.name)}</h3>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <Button variant="outline" onClick={() => router.push(`/dashboard/employees/${employeeId}/edit`)} className="flex-1 sm:flex-none">
            수정
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="flex-1 sm:flex-none">
            {deleting ? "삭제 중..." : "삭제"}
          </Button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">부서</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{employee.department || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">직급</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{employee.position || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">직원구분</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{resolveEmployeeType(employee, currentUserId)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">입사일</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{employee.hire_date || "-"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">연락처</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground w-16">이메일</span>
            <span>{employee.email ? mask("email", employee.email) : "-"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground w-16">전화번호</span>
            <span>{employee.phone ? mask("phone", employee.phone) : "-"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">계정 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground w-20">로그인 ID</span>
            <span className="font-medium">{employee.login_id ? mask("name", employee.login_id) : "-"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground w-20">계정상태</span>
            <span
              className={
                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium " +
                (employee.is_active === false
                  ? "bg-red-100 text-red-700"
                  : "bg-emerald-100 text-emerald-700")
              }
            >
              {employee.is_active === false ? "비활성" : "활성"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground w-20">실패횟수</span>
            <span>{employee.failed_login_count ?? 0}</span>
          </div>

          {!employee.auth_uid && !employee.login_id && (
            <p className="text-sm text-muted-foreground">
              등록된 로그인 계정이 없습니다.
            </p>
          )}

          {employee.login_id && (
            <div className="pt-1">
              <Button
                type="button"
                variant={employee.is_active === false ? "default" : "destructive"}
                size="sm"
                onClick={handleToggleAccountActive}
                disabled={statusUpdating}
              >
                {statusUpdating
                  ? "처리 중..."
                  : employee.is_active === false
                  ? "계정 활성화"
                  : "계정 비활성화"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Slack</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium">{employee.slack_id ? mask("name", employee.slack_id) : "-"}</p>
        </CardContent>
      </Card>
    </div>
  );
}
