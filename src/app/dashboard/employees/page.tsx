"use client";

import { ShieldCheck, UserCog, UserMinus, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmployeeDialog } from "@/components/employee-dialog";
import { EmployeeTable } from "@/components/employee-table";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  PageToolbar,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { suggestSlackIdForEmployee } from "@/lib/employee-slack";
import { resolveEmployeeType } from "@/lib/employee-type";
import { createClient } from "@/lib/supabase/client";
import type { Employee, EmployeeInsert } from "@/lib/types";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [employeeTypeEnabled, setEmployeeTypeEnabled] = useState(true);
  const [generatedPassword, setGeneratedPassword] = useState<{
    loginId: string;
    password: string;
  } | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError(false);

    const [authRes, probeRes, employeeRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("employees").select("id, employee_type").limit(1),
      supabase.from("employees").select("*").order("created_at", { ascending: false }).limit(1000),
    ]);

    const user = authRes.data.user;
    setCurrentUserId(user?.id ?? null);

    const supportsEmployeeType = !probeRes.error;
    setEmployeeTypeEnabled(supportsEmployeeType);

    const { data, error: fetchError } = employeeRes;

    if (fetchError) {
      console.error("직원 목록 조회 실패:", fetchError.message);
      toast.error("직원 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setEmployees([]);
      setError(true);
      setLoading(false);
      return;
    }

    let rows = data ?? [];

    if (user) {
      const currentEmployee = rows.find((employee) => employee.auth_uid === user.id);

      if (currentEmployee && supportsEmployeeType && currentEmployee.employee_type !== "관리자") {
        const { error: roleUpdateError } = await supabase
          .from("employees")
          .update({ employee_type: "관리자" })
          .eq("id", currentEmployee.id);

        if (roleUpdateError) {
          console.error("관리자 권한 업데이트 실패:", roleUpdateError.message);
          toast.error("관리자 권한 업데이트에 실패했습니다. 잠시 후 다시 시도해주세요.");
        } else {
          rows = rows.map((employee) =>
            employee.id === currentEmployee.id
              ? { ...employee, employee_type: "관리자" }
              : employee
          );
        }
      }
    }

    if (user && !rows.some((employee) => employee.auth_uid === user.id)) {
      const guessedName =
        typeof user.user_metadata?.name === "string" && user.user_metadata.name
          ? user.user_metadata.name
          : user.email?.split("@")[0] || "관리자";

      const basePayload = {
        name: guessedName,
        department: null,
        position: null,
        email: user.email || null,
        phone: null,
        slack_id: suggestSlackIdForEmployee(guessedName, null) || null,
        hire_date: null,
        login_id: null,
        auth_uid: user.id,
      };

      const insertPayload = supportsEmployeeType
        ? { ...basePayload, employee_type: "관리자" }
        : basePayload;

      const { data: inserted, error: insertError } = await supabase
        .from("employees")
        .insert(insertPayload)
        .select("*")
        .single();

      if (insertError) {
        console.error("관리자 자동 등록 실패:", insertError.message);
        toast.error("관리자 자동 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
      } else if (inserted) {
        rows = [inserted, ...rows];
      }
    }

    setEmployees(rows);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchEmployees();
  }, [fetchEmployees]);

  const handleSave = async (data: EmployeeInsert) => {
    const { login_id, employee_type, ...rest } = data;
    const basePayload = {
      ...rest,
      department: rest.department || null,
      position: rest.position || null,
      email: rest.email || null,
      phone: rest.phone || null,
      slack_id: rest.slack_id || null,
      hire_date: rest.hire_date || null,
      login_id: login_id || null,
    };
    const cleaned = employeeTypeEnabled
      ? { ...basePayload, employee_type: employee_type || "직원" }
      : basePayload;

    const { data: inserted, error: insertError } = await supabase
      .from("employees")
      .insert(cleaned)
      .select()
      .single();

    if (insertError) {
      console.error("직원 등록 실패:", insertError.message);
      toast.error("직원 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    if (login_id && inserted) {
      const response = await fetch("/api/employees/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: inserted.id,
          login_id,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        console.error("계정 생성 실패:", result.error);
        toast.error("계정 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
      } else {
        setGeneratedPassword({ loginId: login_id, password: result.generated_password });
      }
    }

    await fetchEmployees();
  };

  const keyword = search.trim();
  const filtered = employees.filter((employee) => {
    if (!keyword) return true;

    return (
      employee.name.includes(keyword) ||
      employee.department?.includes(keyword) ||
      employee.position?.includes(keyword) ||
      resolveEmployeeType(employee, currentUserId).includes(keyword) ||
      ((employee.is_active ?? true) ? "활성" : "비활성").includes(keyword) ||
      employee.email?.includes(keyword) ||
      employee.slack_id?.includes(keyword)
    );
  });

  const activeCount = employees.filter((employee) => employee.is_active !== false).length;
  const inactiveCount = employees.filter((employee) => employee.is_active === false).length;
  const adminCount = employees.filter(
    (employee) => resolveEmployeeType(employee, currentUserId) === "관리자"
  ).length;

  return (
    <PageShell>
      <PageHeader
        title="직원 관리"
        funKey="employees"
        description="직원 계정과 권한, 활성 상태를 같은 구조로 확인하고 바로 추가할 수 있도록 정리했습니다."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <UserPlus className="h-4 w-4" />
            직원 추가
          </Button>
        }
      />

      <StatsGrid>
        <StatCard
          label="전체 직원"
          value={`${employees.length}명`}
          description="현재 등록된 직원 수"
          icon={UserCog}
        />
        <StatCard
          label="활성 계정"
          value={`${activeCount}명`}
          description="로그인 가능한 상태의 직원"
          icon={ShieldCheck}
          tone="success"
        />
        <StatCard
          label="관리자"
          value={`${adminCount}명`}
          description="관리 권한을 가진 직원"
          icon={ShieldCheck}
          tone="info"
        />
        <StatCard
          label="비활성"
          value={`${inactiveCount}명`}
          description="로그인이 차단된 직원"
          icon={UserMinus}
          tone="warning"
        />
      </StatsGrid>

      <PageToolbar>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Input
              placeholder="이름, 부서, 직급, 권한, 상태, 이메일로 검색하세요"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full sm:max-w-sm"
            />
            {!employeeTypeEnabled ? (
              <p className="text-sm text-muted-foreground">
                직원 구분 저장을 위해 DB에 <code>employee_type</code> 컬럼 적용이 필요합니다.
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{filtered.length}명 표시 중</span>
            {search ? (
              <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                초기화
              </Button>
            ) : null}
          </div>
        </div>
      </PageToolbar>

      {loading ? (
        <LoadingState
          title="직원 목록을 불러오는 중입니다."
          description="현재 사용자 권한과 계정 연결 상태를 함께 확인하고 있습니다."
        />
      ) : error ? (
        <ErrorState
          description="직원 목록을 다시 불러오지 못했습니다."
          onRetry={() => void fetchEmployees()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={employees.length === 0 ? "등록된 직원이 없습니다." : "조건에 맞는 직원이 없습니다."}
          description={
            employees.length === 0
              ? "직원을 추가하면 로그인과 할일 배정, 일정 참석 연결을 바로 시작할 수 있습니다."
              : "검색어를 조정하거나 초기화해 보세요."
          }
          action={
            employees.length === 0 ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <UserPlus className="h-4 w-4" />
                직원 추가
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                검색 초기화
              </Button>
            )
          }
        />
      ) : (
        <EmployeeTable employees={filtered} currentUserId={currentUserId} />
      )}

      <EmployeeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employee={null}
        onSave={handleSave}
        enableEmployeeType={employeeTypeEnabled}
      />

      <Dialog open={!!generatedPassword} onOpenChange={() => setGeneratedPassword(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>계정이 생성되었습니다</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              아래 비밀번호는 <strong>이 창을 닫으면 다시 확인할 수 없습니다.</strong>
              <br />
              직원에게 전달한 뒤 직접 변경하도록 안내해 주세요.
            </p>
            <div className="space-y-2 rounded-md border bg-muted/50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">로그인 ID</span>
                <span className="font-mono font-medium">{generatedPassword?.loginId}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">비밀번호</span>
                <span className="font-mono font-medium">{generatedPassword?.password}</span>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                if (!generatedPassword) return;

                navigator.clipboard.writeText(
                  `로그인 ID: ${generatedPassword.loginId}\n비밀번호: ${generatedPassword.password}`
                );
                toast.success("클립보드에 복사되었습니다");
              }}
            >
              복사하기
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setGeneratedPassword(null)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
