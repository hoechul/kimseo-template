import type { SupabaseClient } from "@supabase/supabase-js";

import { calcWithholding } from "@/lib/expenses/tax";
import { canTransition } from "@/lib/expenses/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendExpenseSlackNotification } from "@/lib/slack";
import { logInfo } from "@/lib/logger";
import type { ExpenseStatus, VendorTaxCategory } from "@/lib/types";

const EXPENSE_MUTATION_SELECT =
  "id, title, status, total_amount, withholding_amount, net_payment_amount, tax_category, vendor_id, purchase_date, payment_date, slack_thread_ts";

type ExpenseRow = {
  id: string;
  title: string;
  status: ExpenseStatus;
  total_amount: number;
  withholding_amount: number;
  net_payment_amount: number | null;
  tax_category: VendorTaxCategory | null;
  vendor_id: string | null;
  purchase_date: string | null;
  payment_date: string | null;
  slack_thread_ts: string | null;
};

export interface MutationContext {
  actorId: string | null;
  actorName: string | null;
  expenseUrl?: string | null;
}

async function getExpense(expenseId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("expenses")
    .select(EXPENSE_MUTATION_SELECT)
    .eq("id", expenseId)
    .maybeSingle<ExpenseRow>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Expense not found");
  return data;
}

async function logStatusTransition({
  expenseId,
  fromStatus,
  toStatus,
  actorId,
  actorName,
  reason,
}: {
  expenseId: string;
  fromStatus: ExpenseStatus;
  toStatus: ExpenseStatus;
  actorId: string | null;
  actorName: string | null;
  reason?: string | null;
}) {
  const admin = createAdminClient();
  await admin.from("expense_status_history").insert({
    expense_id: expenseId,
    from_status: fromStatus,
    to_status: toStatus,
    actor_id: actorId,
    actor_name: actorName,
    reason: reason ?? null,
  });
}

function ensureTransition(from: ExpenseStatus, to: ExpenseStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`상태 '${from}' 에서 '${to}' 로 전환할 수 없습니다.`);
  }
}

async function notifySlack(params: {
  expenseId: string;
  event: "requested" | "approved" | "rejected" | "scheduled" | "paid" | "cancelled";
  ctx: MutationContext;
  reason?: string | null;
}) {
  try {
    await sendExpenseSlackNotification({
      expenseId: params.expenseId,
      event: params.event,
      expenseUrl: params.ctx.expenseUrl,
      actorName: params.ctx.actorName,
      reason: params.reason ?? null,
    });
  } catch (error) {
    console.error("Slack 매입 알림 실패:", error);
  }
}

export async function submitExpense(expenseId: string, ctx: MutationContext) {
  const expense = await getExpense(expenseId);
  ensureTransition(expense.status, "requested");

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("expenses")
    .update({
      status: "requested" as ExpenseStatus,
      requested_by: ctx.actorId,
      requested_at: nowIso,
    })
    .eq("id", expenseId)
    .select(EXPENSE_MUTATION_SELECT)
    .maybeSingle<ExpenseRow>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Expense update failed");

  await logStatusTransition({
    expenseId,
    fromStatus: expense.status,
    toStatus: "requested",
    actorId: ctx.actorId,
    actorName: ctx.actorName,
  });

  logInfo("SUBMIT_EXPENSE", `매입 결의 제출: ${data.title}`, {
    resource: "expense",
    resource_id: expenseId,
  });

  await notifySlack({ expenseId, event: "requested", ctx });
  return data;
}

export async function approveExpense(
  expenseId: string,
  ctx: MutationContext
) {
  const expense = await getExpense(expenseId);
  ensureTransition(expense.status, "approved");

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("expenses")
    .update({
      status: "approved" as ExpenseStatus,
      approver_id: ctx.actorId,
      approved_at: nowIso,
      rejected_reason: null,
    })
    .eq("id", expenseId)
    .select(EXPENSE_MUTATION_SELECT)
    .maybeSingle<ExpenseRow>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Expense update failed");

  await logStatusTransition({
    expenseId,
    fromStatus: expense.status,
    toStatus: "approved",
    actorId: ctx.actorId,
    actorName: ctx.actorName,
  });

  logInfo("APPROVE_EXPENSE", `매입 승인: ${data.title}`, {
    resource: "expense",
    resource_id: expenseId,
  });

  await notifySlack({ expenseId, event: "approved", ctx });
  return data;
}

export async function rejectExpense(
  expenseId: string,
  reason: string,
  ctx: MutationContext
) {
  const trimmed = reason?.trim();
  if (!trimmed) {
    throw new Error("반려 사유는 필수입니다.");
  }

  const expense = await getExpense(expenseId);
  ensureTransition(expense.status, "rejected");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("expenses")
    .update({
      status: "rejected" as ExpenseStatus,
      approver_id: ctx.actorId,
      rejected_reason: trimmed,
    })
    .eq("id", expenseId)
    .select(EXPENSE_MUTATION_SELECT)
    .maybeSingle<ExpenseRow>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Expense update failed");

  await logStatusTransition({
    expenseId,
    fromStatus: expense.status,
    toStatus: "rejected",
    actorId: ctx.actorId,
    actorName: ctx.actorName,
    reason: trimmed,
  });

  logInfo("REJECT_EXPENSE", `매입 반려: ${data.title} (${trimmed})`, {
    resource: "expense",
    resource_id: expenseId,
  });

  await notifySlack({ expenseId, event: "rejected", ctx, reason: trimmed });
  return data;
}

export async function markExpensePaid(
  expenseId: string,
  paymentDate: string,
  ctx: MutationContext
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    throw new Error("payment_date must be YYYY-MM-DD");
  }

  const expense = await getExpense(expenseId);
  ensureTransition(expense.status, "paid");

  const calc = calcWithholding({
    totalAmount: expense.total_amount,
    taxCategory: expense.tax_category,
    withholdingRate: null,
  });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("expenses")
    .update({
      status: "paid" as ExpenseStatus,
      payment_date: paymentDate,
      withholding_amount:
        expense.tax_category === "personal_withholding"
          ? expense.withholding_amount || calc.withholdingAmount
          : 0,
    })
    .eq("id", expenseId)
    .select(EXPENSE_MUTATION_SELECT)
    .maybeSingle<ExpenseRow>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Expense update failed");

  await logStatusTransition({
    expenseId,
    fromStatus: expense.status,
    toStatus: "paid",
    actorId: ctx.actorId,
    actorName: ctx.actorName,
  });

  logInfo("PAY_EXPENSE", `매입 지급 완료: ${data.title} ${paymentDate}`, {
    resource: "expense",
    resource_id: expenseId,
  });

  await notifySlack({ expenseId, event: "paid", ctx });
  return data;
}

export async function cancelExpense(
  expenseId: string,
  reason: string | null,
  ctx: MutationContext
) {
  const expense = await getExpense(expenseId);
  ensureTransition(expense.status, "cancelled");

  const trimmed = reason?.trim() || null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("expenses")
    .update({
      status: "cancelled" as ExpenseStatus,
      cancelled_at: new Date().toISOString(),
      cancelled_reason: trimmed,
    })
    .eq("id", expenseId)
    .select(EXPENSE_MUTATION_SELECT)
    .maybeSingle<ExpenseRow>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Expense update failed");

  await logStatusTransition({
    expenseId,
    fromStatus: expense.status,
    toStatus: "cancelled",
    actorId: ctx.actorId,
    actorName: ctx.actorName,
    reason: trimmed,
  });

  logInfo("CANCEL_EXPENSE", `매입 취소: ${data.title}`, {
    resource: "expense",
    resource_id: expenseId,
  });

  await notifySlack({ expenseId, event: "cancelled", ctx, reason: trimmed });
  return data;
}

export async function resolveActorEmployee(supabase: SupabaseClient, authUid: string) {
  const { data } = await supabase
    .from("employees")
    .select("id, name")
    .eq("auth_uid", authUid)
    .maybeSingle<{ id: string; name: string | null }>();
  return {
    actorId: data?.id ?? null,
    actorName: data?.name ?? null,
  };
}
