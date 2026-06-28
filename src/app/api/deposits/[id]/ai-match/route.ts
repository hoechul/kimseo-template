import { NextResponse } from "next/server";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import { suggestDepositRevenueMatch } from "@/lib/gemini-deposit-match";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { supabase, user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const { id } = await context.params;

  try {
    // 입금 조회
    const { data: deposit, error: depositError } = await supabase
      .from("deposits")
      .select("id, depositor_name, amount, deposit_date, memo")
      .eq("id", id)
      .single();

    if (depositError || !deposit) {
      return NextResponse.json({ error: "입금을 찾을 수 없습니다." }, { status: 404 });
    }

    // 미결제 매출 조회 (금액 범위 필터: 0.5배 ~ 2배)
    const minAmount = deposit.amount * 0.5;
    const maxAmount = deposit.amount * 2;

    const { data: revenues } = await supabase
      .from("revenues")
      .select("id, title, total_amount, supply_amount, expected_payment_date, is_paid, projects(name, client)")
      .eq("is_paid", false)
      .gte("total_amount", minAmount)
      .lte("total_amount", maxAmount)
      .order("created_at", { ascending: false })
      .limit(50);

    const candidates = (revenues ?? []).map((r: Record<string, unknown>) => {
      const project = r.projects as { name: string; client: string | null } | null;
      return {
        id: r.id as string,
        title: r.title as string,
        total_amount: r.total_amount as number,
        supply_amount: r.supply_amount as number,
        project_name: project?.name ?? null,
        client: project?.client ?? null,
        expected_payment_date: r.expected_payment_date as string | null,
      };
    });

    const suggestions = await suggestDepositRevenueMatch({
      deposit: {
        depositor_name: deposit.depositor_name,
        amount: deposit.amount,
        deposit_date: deposit.deposit_date,
        memo: deposit.memo,
      },
      revenues: candidates,
    });

    // 매칭된 매출의 상세 정보 포함
    const enriched = suggestions.map((s) => {
      const rev = candidates.find((r) => r.id === s.revenue_id);
      return {
        ...s,
        revenue_title: rev?.title ?? "",
        revenue_amount: rev?.total_amount ?? 0,
        project_name: rev?.project_name ?? null,
      };
    });

    return NextResponse.json({ ok: true, suggestions: enriched });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI 매칭 실패" },
      { status: 500 }
    );
  }
}
