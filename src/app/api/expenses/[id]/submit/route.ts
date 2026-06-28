import { NextRequest, NextResponse } from "next/server";

import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import { resolveActorEmployee, submitExpense } from "@/lib/expense-mutations";

type RouteContext = { params: Promise<{ id: string }> };

function resolveExpenseUrl(request: NextRequest, id: string) {
  try {
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    return `${origin}/dashboard/expenses/${id}`;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const { supabase, user, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  try {
    const { actorId, actorName } = await resolveActorEmployee(supabase, user.id);
    const data = await submitExpense(id, {
      actorId,
      actorName,
      expenseUrl: resolveExpenseUrl(request, id),
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "지출 결의 제출에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
