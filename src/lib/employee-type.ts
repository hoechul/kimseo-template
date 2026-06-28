import type { Employee, EmployeeType } from "@/lib/types";

export const EMPLOYEE_TYPE_OPTIONS: EmployeeType[] = ["관리자", "직원"];

export function resolveEmployeeType(
  employee: Pick<Employee, "employee_type" | "auth_uid">,
  currentUserId?: string | null
): EmployeeType {
  if (employee.employee_type === "관리자" || employee.employee_type === "직원") {
    return employee.employee_type;
  }

  if (currentUserId && employee.auth_uid === currentUserId) {
    return "관리자";
  }

  return "직원";
}
