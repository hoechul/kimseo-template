"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Percent, Scale } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import {
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  PageToolbar,
  SectionIntro,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import type { MaskCategory } from "@/lib/masking";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatAmountInMan } from "@/lib/utils";

type RevenueRow = {
  revenue_date: string | null;
  total_amount: number;
  project_types: { name: string | null } | null;
  channel: string | null;
};

type ExpenseRow = {
  purchase_date: string | null;
  total_amount: number;
  expense_types: { name: string | null } | null;
};

const REVENUE_COLORS = ["#60a5fa", "#34d399", "#a78bfa", "#fbbf24", "#f87171", "#22d3ee"];
const EXPENSE_COLORS = ["#fca5a5", "#fcd34d", "#86efac", "#93c5fd", "#c4b5fd", "#f9a8d4"];

export default function ProfitAnalysisPage() {
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();
  const [now] = useState(() => new Date());

  const [revenues, setRevenues] = useState<RevenueRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [year, setYear] = useState(now.getFullYear());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    await supabase.auth.getSession();

    const [revRes, expRes] = await Promise.all([
      supabase
        .from("revenues")
        .select("revenue_date, total_amount, channel, project_types(name)")
        .limit(5000),
      supabase
        .from("expenses")
        .select("purchase_date, total_amount, expense_types(name)")
        .limit(5000),
    ]);

    if (revRes.error || expRes.error) {
      console.error("영업이익 분석 데이터 조회 실패:", revRes.error?.message, expRes.error?.message);
      toast.error("분석 데이터를 불러오지 못했습니다.");
      setError(true);
      setLoading(false);
      return;
    }

    setRevenues((revRes.data ?? []) as unknown as RevenueRow[]);
    setExpenses((expRes.data ?? []) as unknown as ExpenseRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const rev of revenues) {
      if (rev.revenue_date) years.add(Number(rev.revenue_date.slice(0, 4)));
    }
    for (const exp of expenses) {
      if (exp.purchase_date) years.add(Number(exp.purchase_date.slice(0, 4)));
    }
    years.add(now.getFullYear());
    return [...years].sort((a, b) => b - a);
  }, [revenues, expenses, now]);

  const yearPrefix = String(year);

  const filteredRevenues = useMemo(
    () => revenues.filter((r) => r.revenue_date?.startsWith(yearPrefix)),
    [revenues, yearPrefix]
  );
  const filteredExpenses = useMemo(
    () => expenses.filter((e) => e.purchase_date?.startsWith(yearPrefix)),
    [expenses, yearPrefix]
  );

  const yearlyRevenue = filteredRevenues.reduce((sum, r) => sum + (r.total_amount ?? 0), 0);
  const yearlyExpense = filteredExpenses.reduce((sum, e) => sum + (e.total_amount ?? 0), 0);
  const yearlyProfit = yearlyRevenue - yearlyExpense;
  const yearlyMargin = yearlyRevenue > 0 ? (yearlyProfit / yearlyRevenue) * 100 : 0;

  const monthlyChartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) =>
      `${yearPrefix}-${String(i + 1).padStart(2, "0")}`
    );

    const revMap: Record<string, number> = {};
    const expMap: Record<string, number> = {};
    for (const m of months) {
      revMap[m] = 0;
      expMap[m] = 0;
    }
    for (const r of filteredRevenues) {
      const key = r.revenue_date?.slice(0, 7);
      if (!key || !(key in revMap)) continue;
      revMap[key] += r.total_amount ?? 0;
    }
    for (const e of filteredExpenses) {
      const key = e.purchase_date?.slice(0, 7);
      if (!key || !(key in expMap)) continue;
      expMap[key] += e.total_amount ?? 0;
    }

    return months.map((m) => ({
      month: `${Number(m.split("-")[1])}월`,
      매출: revMap[m],
      매입: expMap[m],
      영업이익: revMap[m] - expMap[m],
      이익률: revMap[m] > 0 ? Math.round(((revMap[m] - expMap[m]) / revMap[m]) * 1000) / 10 : 0,
    }));
  }, [filteredRevenues, filteredExpenses, yearPrefix]);

  const revenueByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of filteredRevenues) {
      const name = r.project_types?.name ?? r.channel ?? "미분류";
      map[name] = (map[name] ?? 0) + (r.total_amount ?? 0);
    }
    return Object.entries(map)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredRevenues]);

  const expenseByType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of filteredExpenses) {
      const name = e.expense_types?.name ?? "미분류";
      map[name] = (map[name] ?? 0) + (e.total_amount ?? 0);
    }
    return Object.entries(map)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses]);

  const formatAmount = (n: number) => n.toLocaleString("ko-KR");
  const chartFormatter = (value: number) => {
    let label: string;
    if (Math.abs(value) >= 100_000_000) label = `${(value / 100_000_000).toFixed(1)}억`;
    else if (Math.abs(value) >= 10_000) label = `${Math.round(value / 10_000)}만`;
    else label = String(value);
    return mask("amount", label);
  };
  const formatBarLabel = (v: unknown) => {
    if (typeof v !== "number" || v === 0) return "";
    const man = Math.round(v / 10_000);
    if (man === 0) return "";
    return mask("amount", `${man.toLocaleString("ko-KR")}만`);
  };
  const formatPctLabel = (v: unknown) => {
    if (typeof v !== "number") return "";
    return `${Math.round(v)}%`;
  };

  const profitTone: "success" | "warning" | "danger" =
    yearlyProfit > 0 ? "success" : yearlyProfit === 0 ? "warning" : "danger";

  return (
    <PageShell>
      <PageHeader
        title="영업이익 분석"
        description="월별 매출·매입·영업이익을 한 화면에서 비교하고, 카테고리별로 어디서 돈을 벌고 어디서 쓰는지 확인합니다."
      />

      <PageToolbar>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}년
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {year}년 1월 ~ 12월 누계 분석
          </span>
        </div>
      </PageToolbar>

      <StatsGrid>
        <StatCard
          label={`${year}년 매출`}
          value={`${formatAmount(yearlyRevenue)}원`}
          mobileValue={formatAmountInMan(yearlyRevenue)}
          description="매출관리 등록 합계"
          icon={ArrowUpRight}
          tone="info"
          sensitive="amount"
        />
        <StatCard
          label={`${year}년 매입`}
          value={`${formatAmount(yearlyExpense)}원`}
          mobileValue={formatAmountInMan(yearlyExpense)}
          description="매입관리 등록 합계"
          icon={ArrowDownRight}
          tone="warning"
          sensitive="amount"
        />
        <StatCard
          label={`${year}년 영업이익`}
          value={`${formatAmount(yearlyProfit)}원`}
          mobileValue={formatAmountInMan(yearlyProfit)}
          description={yearlyProfit >= 0 ? "흑자" : "적자"}
          icon={Scale}
          tone={profitTone}
          sensitive="amount"
        />
        <StatCard
          label="영업이익률"
          value={yearlyRevenue > 0 ? `${yearlyMargin.toFixed(1)}%` : "—"}
          description={yearlyRevenue > 0 ? "영업이익 ÷ 매출" : "매출 없음"}
          icon={Percent}
          tone={profitTone}
        />
      </StatsGrid>

      {loading ? (
        <LoadingState title="영업이익 분석 데이터를 불러오는 중입니다." />
      ) : error ? (
        <ErrorState
          description="분석 데이터를 다시 불러오지 못했습니다."
          action={
            <Button variant="outline" size="sm" onClick={() => void fetchData()}>
              다시 시도
            </Button>
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <SectionIntro
                title={`${year}년 월별 매출 · 매입`}
                description="파란 막대는 매출, 빨간 막대는 매입 합계입니다."
              />
            </CardHeader>
            <CardContent>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={monthlyChartData}
                    margin={{ top: 24, right: 24, left: 12, bottom: 8 }}
                    barCategoryGap="30%"
                    barGap={6}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 13, fontWeight: 600, fill: "#475569" }}
                      tickLine={false}
                      axisLine={{ stroke: "#cbd5e1" }}
                      interval={0}
                      padding={{ left: 8, right: 8 }}
                    />
                    <YAxis
                      tickFormatter={chartFormatter}
                      tick={{ fontSize: 12, fill: "#64748b" }}
                      width={56}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.12)" }}
                      formatter={(value, name) => [
                        mask("amount", `${formatAmount(Number(value))}원`),
                        name,
                      ]}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                        backgroundColor: "#ffffff",
                      }}
                      labelStyle={{ color: "#0f172a", fontWeight: 700 }}
                      itemStyle={{ color: "#0f172a", fontWeight: 600 }}
                    />
                    <Legend
                      iconType="rect"
                      iconSize={12}
                      wrapperStyle={{ fontSize: 13, paddingTop: 8 }}
                    />
                    <Bar dataKey="매출" fill="#93c5fd" radius={[4, 4, 0, 0]} maxBarSize={32}>
                      <LabelList
                        dataKey="매출"
                        position="top"
                        formatter={formatBarLabel}
                        style={{ fontSize: 13, fill: "#1d4ed8", fontWeight: 700 }}
                      />
                    </Bar>
                    <Bar dataKey="매입" fill="#fca5a5" radius={[4, 4, 0, 0]} maxBarSize={32}>
                      <LabelList
                        dataKey="매입"
                        position="top"
                        formatter={formatBarLabel}
                        style={{ fontSize: 13, fill: "#b91c1c", fontWeight: 700 }}
                      />
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionIntro
                title={`${year}년 월별 영업이익 · 영업이익률`}
                description="초록 막대는 영업이익(매출−매입), 보라 선은 매출 대비 영업이익률(%)입니다."
              />
            </CardHeader>
            <CardContent>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={monthlyChartData}
                    margin={{ top: 24, right: 24, left: 12, bottom: 8 }}
                    barCategoryGap="40%"
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <ReferenceLine yAxisId="left" y={0} stroke="#94a3b8" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 13, fontWeight: 600, fill: "#475569" }}
                      tickLine={false}
                      axisLine={{ stroke: "#cbd5e1" }}
                      interval={0}
                      padding={{ left: 8, right: 8 }}
                    />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={chartFormatter}
                      tick={{ fontSize: 12, fill: "#15803d" }}
                      width={56}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 12, fill: "#6d28d9" }}
                      width={44}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.12)" }}
                      formatter={(value, name) => {
                        if (name === "이익률") return [`${value}%`, name];
                        return [mask("amount", `${formatAmount(Number(value))}원`), name];
                      }}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                        backgroundColor: "#ffffff",
                      }}
                      labelStyle={{ color: "#0f172a", fontWeight: 700 }}
                      itemStyle={{ color: "#0f172a", fontWeight: 600 }}
                    />
                    <Legend
                      iconType="rect"
                      iconSize={12}
                      wrapperStyle={{ fontSize: 13, paddingTop: 8 }}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="영업이익"
                      fill="#86efac"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    >
                      <LabelList
                        dataKey="영업이익"
                        position="top"
                        formatter={formatBarLabel}
                        style={{ fontSize: 13, fill: "#15803d", fontWeight: 700 }}
                      />
                    </Bar>
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="이익률"
                      stroke="#a78bfa"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#a78bfa", strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    >
                      <LabelList
                        dataKey="이익률"
                        position="top"
                        offset={14}
                        formatter={formatPctLabel}
                        style={{ fontSize: 13, fill: "#6d28d9", fontWeight: 700 }}
                      />
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <SectionIntro
                  title={`${year}년 카테고리별 매출`}
                  description="프로젝트 유형(교육/에이전시 등) 또는 채널 기준 매출 비중입니다."
                />
              </CardHeader>
              <CardContent>
                <CategoryBreakdown
                  data={revenueByCategory}
                  total={yearlyRevenue}
                  colors={REVENUE_COLORS}
                  formatAmount={formatAmount}
                  mask={mask}
                  emptyText="등록된 매출이 없습니다."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <SectionIntro
                  title={`${year}년 매입 유형별`}
                  description="강사비·외주비·운영비 등 매입 계정과목 비중입니다."
                />
              </CardHeader>
              <CardContent>
                <CategoryBreakdown
                  data={expenseByType}
                  total={yearlyExpense}
                  colors={EXPENSE_COLORS}
                  formatAmount={formatAmount}
                  mask={mask}
                  emptyText="등록된 매입이 없습니다."
                />
              </CardContent>
            </Card>
          </div>

        </>
      )}
    </PageShell>
  );
}

function CategoryBreakdown({
  data,
  total,
  colors,
  formatAmount,
  mask,
  emptyText,
}: {
  data: Array<{ name: string; amount: number }>;
  total: number;
  colors: string[];
  formatAmount: (n: number) => string;
  mask: (category: MaskCategory, value: string | number | null | undefined) => string;
  emptyText: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-5">
      <div className="sm:col-span-2 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="name"
              innerRadius={36}
              outerRadius={70}
              paddingAngle={2}
            >
              {data.map((entry, idx) => (
                <Cell key={entry.name} fill={colors[idx % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [mask("amount", `${formatAmount(Number(value))}원`), ""]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                backgroundColor: "#ffffff",
              }}
              labelStyle={{ color: "#0f172a", fontWeight: 700 }}
              itemStyle={{ color: "#0f172a", fontWeight: 600 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="sm:col-span-3 space-y-2 text-sm">
        {data.map((entry, idx) => {
          const pct = total > 0 ? (entry.amount / total) * 100 : 0;
          return (
            <li key={entry.name} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ background: colors[idx % colors.length] }}
                />
                <span className="truncate">{entry.name}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="font-mono">{mask("amount", `${formatAmount(entry.amount)}원`)}</span>
                <span className="text-muted-foreground w-12 text-right">{pct.toFixed(1)}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
