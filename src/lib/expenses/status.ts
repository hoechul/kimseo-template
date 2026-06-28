import type { ExpenseStatus } from "@/lib/types";

const TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
  draft: ["requested", "cancelled"],
  requested: ["approved", "rejected", "cancelled"],
  approved: ["scheduled", "paid", "cancelled"],
  rejected: ["requested"],
  scheduled: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export function canTransition(from: ExpenseStatus, to: ExpenseStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: ExpenseStatus): ExpenseStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function isTerminalStatus(status: ExpenseStatus): boolean {
  return status === "paid" || status === "cancelled" || status === "rejected";
}
