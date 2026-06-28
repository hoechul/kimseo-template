"use client";

import { ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/page-shell";
import { SortableTableHead, sortData, useSortState } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMasking } from "@/components/masking-provider";
import { formatKstDateTime } from "@/lib/date";
import { resolveEmployeeType } from "@/lib/employee-type";
import type { Employee } from "@/lib/types";

interface EmployeeTableProps {
  employees: Employee[];
  currentUserId?: string | null;
}

function formatLastLoginAt(value: string | null | undefined) {
  return value ? formatKstDateTime(value) : "-";
}

export function EmployeeTable({ employees, currentUserId }: EmployeeTableProps) {
  const router = useRouter();
  const { sort, toggle } = useSortState<string>();
  const { mask } = useMasking();

  const sorted = sortData(employees, sort, (item, key) => {
    switch (key) {
      case "name":
        return item.name;
      case "department":
        return item.department;
      case "position":
        return item.position;
      case "employee_type":
        return resolveEmployeeType(item, currentUserId);
      case "is_active":
        return item.is_active === false ? "비활성" : "활성";
      case "email":
        return item.email;
      case "hire_date":
        return item.hire_date;
      case "last_login_at":
        return item.last_login_at;
      default:
        return null;
    }
  });

  if (employees.length === 0) {
    return (
      <EmptyState
        icon={UserRound}
        title="등록된 직원이 없습니다."
        description="직원을 추가하면 로그인과 할일 할당, 일정 배정까지 바로 연결됩니다."
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {sorted.map((employee) => (
          <button
            key={employee.id}
            type="button"
            className="surface-subtle p-3 sm:p-4 text-left transition-colors hover:bg-muted/40 active:bg-muted/60"
            onClick={() => router.push(`/dashboard/employees/${employee.id}`)}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {employee.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{mask("name", employee.name)}</p>
                  <p className="text-xs text-muted-foreground">
                    {resolveEmployeeType(employee, currentUserId)}
                  </p>
                </div>
              </div>
              <span
                className={cnStatus(
                  employee.is_active === false
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                )}
              >
                {employee.is_active === false ? "비활성" : "활성"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>부서 {employee.department ?? "-"}</span>
              <span>직책 {employee.position ?? "-"}</span>
              <span className="col-span-2">{employee.email ? mask("email", employee.email) : "-"}</span>
              <span>{employee.phone ? mask("phone", employee.phone) : "-"}</span>
              <span>{employee.hire_date ?? "-"}</span>
              <span className="col-span-2">최근 로그인 {formatLastLoginAt(employee.last_login_at)}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="surface-panel hidden overflow-hidden p-1 md:block">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="name" currentSort={sort} onSort={toggle}>
                이름
              </SortableTableHead>
              <SortableTableHead sortKey="department" currentSort={sort} onSort={toggle}>
                부서
              </SortableTableHead>
              <SortableTableHead sortKey="position" currentSort={sort} onSort={toggle}>
                직책
              </SortableTableHead>
              <SortableTableHead sortKey="employee_type" currentSort={sort} onSort={toggle}>
                권한
              </SortableTableHead>
              <SortableTableHead sortKey="is_active" currentSort={sort} onSort={toggle}>
                상태
              </SortableTableHead>
              <SortableTableHead sortKey="email" currentSort={sort} onSort={toggle}>
                이메일
              </SortableTableHead>
              <TableHead className="font-medium text-muted-foreground">연락처</TableHead>
              <SortableTableHead sortKey="hire_date" currentSort={sort} onSort={toggle}>
                입사일
              </SortableTableHead>
              <SortableTableHead sortKey="last_login_at" currentSort={sort} onSort={toggle}>
                최근 로그인
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((employee) => (
              <TableRow
                key={employee.id}
                className="cursor-pointer"
                onClick={() => router.push(`/dashboard/employees/${employee.id}`)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {employee.name.charAt(0)}
                    </div>
                    <div className="space-y-0.5">
                      <p>{mask("name", employee.name)}</p>
                      {employee.auth_uid === currentUserId ? (
                        <div className="inline-flex items-center gap-1 rounded-full border border-primary/10 bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary">
                          <ShieldCheck className="h-3 w-3" />
                          내 계정
                        </div>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{employee.department ?? "-"}</TableCell>
                <TableCell>{employee.position ?? "-"}</TableCell>
                <TableCell>{resolveEmployeeType(employee, currentUserId)}</TableCell>
                <TableCell>
                  <span
                    className={cnStatus(
                      employee.is_active === false
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    )}
                  >
                    {employee.is_active === false ? "비활성" : "활성"}
                  </span>
                </TableCell>
                <TableCell className="max-w-[200px] truncate">{employee.email ? mask("email", employee.email) : "-"}</TableCell>
                <TableCell className="max-w-[150px] truncate">{employee.phone ? mask("phone", employee.phone) : "-"}</TableCell>
                <TableCell>{employee.hire_date ?? "-"}</TableCell>
                <TableCell>{formatLastLoginAt(employee.last_login_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>
    </>
  );
}

function cnStatus(className: string) {
  return `inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${className}`;
}
