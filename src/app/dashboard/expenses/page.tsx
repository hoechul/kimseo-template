"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleDollarSign, FileClock, ReceiptText, Repeat, TrendingDown } from "lucide-react";
import { formatAmountInMan } from "@/lib/utils";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import {
  EmptyState,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SortableTableHead,
  sortData,
  type SortState,
  useSortState,
} from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { getCache, setCache } from "@/lib/simple-cache";
import { EXPENSE_STATUS_LABEL, type Expense, type ExpenseStatus } from "@/lib/types";

const STATUS_BADGE_CLASS: Record<ExpenseStatus, string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-700",
  requested: "border-sky-300 bg-sky-100 text-sky-900",
  approved: "border-emerald-300 bg-emerald-100 text-emerald-900",
  rejected: "border-rose-300 bg-rose-100 text-rose-900",
  scheduled: "border-violet-300 bg-violet-100 text-violet-900",
  paid: "border-emerald-400 bg-emerald-200 text-emerald-900",
  cancelled: "border-slate-300 bg-slate-100 text-slate-500",
};

type SortKey =
  | "purchase_date"
  | "total_amount"
  | "title"
  | "type"
  | "vendor_name"
  | "payment_date"
  | "status"
  | "tax_invoice";

type ExpenseStatusFilter = "all" | "needsAction" | "unpaid" | ExpenseStatus;

const STATUS_FILTER_OPTIONS: Array<{ value: ExpenseStatusFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "needsAction", label: "처리필요" },
  { value: "unpaid", label: "미지급" },
  { value: "requested", label: "결의중" },
  { value: "approved", label: "승인" },
  { value: "paid", label: "지급완료" },
];

const SOURCE_LABEL: Record<Expense["source"], string> = {
  manual: "직접",
  card: "카드",
  recurring: "반복",
};

export default function ExpensesPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { mask } = useMasking();
  const [now] = useState(() => new Date());
  const [chartReady, setChartReady] = useState(false);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [showUndatedOnly, setShowUndatedOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ExpenseStatusFilter>("all");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>(String(now.getMonth() + 1));
  const { sort, toggle } = useSortState<SortKey>("purchase_date");

  const fetchData = useCallback(async (options: { skipCache?: boolean } = {}) => {
    const cacheKey = "expenses:list";
    const cached = options.skipCache ? null : getCache<Expense[]>(cacheKey);

    if (cached) {
      setExpenses(cached);
      setLoading(false);
      setError(false);
    } else {
      setLoading(true);
      setError(false);
    }

    await supabase.auth.getSession();

    const { data, error: fetchError } = await supabase
      .from("expenses")
      .select("*, expense_types(id, name), projects(id, project_number, name)")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (fetchError) {
      console.error("매입 목록 조회 실패:", fetchError.message);
      if (!cached) {
        toast.error("매입 목록을 불러오지 못했습니다.");
        setError(true);
        setExpenses([]);
        setLoading(false);
      }
      return;
    }

    const fresh = (data ?? []) as Expense[];
    setExpenses(fresh);
    setCache(cacheKey, fresh);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    setChartReady(true);
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const expense of expenses) {
      if (expense.purchase_date) years.add(Number(expense.purchase_date.slice(0, 4)));
    }
    years.add(now.getFullYear());
    return [...years].sort((left, right) => right - left);
  }, [now, expenses]);

  const selectedPrefix =
    selectedMonth === "all"
      ? String(selectedYear)
      : `${selectedYear}-${selectedMonth.padStart(2, "0")}`;

  const typeName = (expense: Expense) => expense.expense_types?.name ?? null;

  const expenseDisplayName = (expense: Expense) =>
    expense.vendor_name ? `${expense.title} (${expense.vendor_name})` : expense.title;

  const sourceLabel = (expense: Expense) => SOURCE_LABEL[expense.source] ?? "직접";

  const matchesSelectedPeriod = useCallback(
    (expense: Expense) => {
      if (showUndatedOnly) return !expense.purchase_date;
      return Boolean(expense.purchase_date?.startsWith(selectedPrefix));
    },
    [selectedPrefix, showUndatedOnly]
  );

  const matchesStatusFilter = useCallback((expense: Expense, filter: ExpenseStatusFilter) => {
    if (filter === "all") return true;
    if (filter === "needsAction") {
      return expense.status !== "paid" && expense.status !== "cancelled";
    }
    if (filter === "unpaid") return !expense.payment_date;
    return expense.status === filter;
  }, []);

  const filtered = useMemo(() => {
    const result = expenses.filter((expense) => {
      if (!matchesSelectedPeriod(expense)) return false;
      if (!matchesStatusFilter(expense, statusFilter)) return false;

      const keyword = search.trim();
      if (!keyword) return true;

      return (
        expense.title.includes(keyword) ||
        expense.vendor_name?.includes(keyword) ||
        expense.projects?.name?.includes(keyword) ||
        expense.projects?.project_number?.includes(keyword) ||
        expense.memo?.includes(keyword)
      );
    });

    return sortData(result, sort as SortState, (item, key) => {
      switch (key) {
        case "title":
          return item.title;
        case "type":
          return typeName(item) ?? "";
        case "vendor_name":
          return item.vendor_name ?? "";
        case "total_amount":
          return item.total_amount;
        case "purchase_date":
          return item.purchase_date;
        case "payment_date":
          return item.payment_date;
        case "status":
          return item.status;
        case "tax_invoice":
          if (item.purchase_tax_invoice_not_required) return 0;
          return item.purchase_tax_invoice_received ? 2 : 1;
        default:
          return null;
      }
    });
  }, [expenses, matchesSelectedPeriod, matchesStatusFilter, search, sort, statusFilter]);

  const formatAmount = (amount: number) => amount.toLocaleString("ko-KR");
  const unpaidBadgeClass = "border-amber-300 bg-amber-100 text-amber-900";

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const yearlyTotal = expenses
    .filter(
      (expense) => expense.purchase_date && expense.purchase_date.startsWith(String(currentYear))
    )
    .reduce((sum, expense) => sum + expense.total_amount, 0);
  const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
  const monthlyTotal = expenses
    .filter((expense) => expense.purchase_date && expense.purchase_date.startsWith(monthPrefix))
    .reduce((sum, expense) => sum + expense.total_amount, 0);
  const totalUnpaid = expenses
    .filter((expense) => !expense.payment_date)
    .reduce((sum, expense) => sum + expense.total_amount, 0);
  const selectedTotal = filtered.reduce((sum, expense) => sum + expense.total_amount, 0);

  const TYPE_COLORS: Record<string, string> = {
    강사비: "#fca5a5",
    외주비: "#93c5fd",
    운영비: "#86efac",
    미분류: "#9ca3af",
  };
  const TYPE_COLOR_FALLBACKS = ["#c4b5fd", "#fde68a", "#f9a8d4", "#6ee7b7", "#fed7aa"];

  const typeNames = useMemo(() => {
    const names = new Set<string>();
    for (const expense of expenses) {
      if (!expense.purchase_date) continue;
      if (!expense.purchase_date.startsWith(String(currentYear))) continue;
      names.add(typeName(expense) ?? "미분류");
    }
    return [...names].sort((a, b) => {
      if (a === "미분류") return 1;
      if (b === "미분류") return -1;
      return a.localeCompare(b);
    });
  }, [currentYear, expenses]);

  const getTypeColor = useCallback(
    (name: string) => {
      if (TYPE_COLORS[name]) return TYPE_COLORS[name];
      const knownCount = Object.keys(TYPE_COLORS).length;
      const idx = typeNames.indexOf(name);
      return TYPE_COLOR_FALLBACKS[Math.max(0, idx - knownCount) % TYPE_COLOR_FALLBACKS.length];
    },
    [typeNames]
  );

  const monthlyChartData = useMemo(() => {
    const lastMonth = Math.min(currentYear === now.getFullYear() ? currentMonth + 3 : 12, 12);

    const months: string[] = [];
    for (let month = 1; month <= lastMonth; month += 1) {
      months.push(`${currentYear}-${String(month).padStart(2, "0")}`);
    }

    const monthTypeMap: Record<string, Record<string, number>> = {};
    for (const m of months) {
      monthTypeMap[m] = {};
      for (const t of typeNames) monthTypeMap[m][t] = 0;
    }

    for (const expense of expenses) {
      if (!expense.purchase_date) continue;
      const key = expense.purchase_date.slice(0, 7);
      if (!(key in monthTypeMap)) continue;
      const t = typeName(expense) ?? "미분류";
      monthTypeMap[key][t] = (monthTypeMap[key][t] ?? 0) + expense.total_amount;
    }

    return months.map((key) => {
      const typeValues = monthTypeMap[key];
      const total = Object.values(typeValues).reduce((s, v) => s + v, 0);
      return {
        month: `${Number(key.split("-")[1])}월`,
        ...typeValues,
        total,
      };
    });
  }, [currentMonth, currentYear, now, expenses, typeNames]);

  const typeChartData = useMemo(() => {
    const typeMap: Record<string, number> = {};
    for (const expense of expenses) {
      if (!expense.purchase_date) continue;
      if (!expense.purchase_date.startsWith(String(currentYear))) continue;
      const t = typeName(expense) ?? "미분류";
      typeMap[t] = (typeMap[t] ?? 0) + expense.total_amount;
    }
    return Object.entries(typeMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => {
        if (a.name === "미분류") return 1;
        if (b.name === "미분류") return -1;
        return b.amount - a.amount;
      });
  }, [currentYear, expenses]);

  const chartFormatter = (value: number) => {
    let label: string;
    if (value >= 100_000_000) label = `${(value / 100_000_000).toFixed(1)}억`;
    else if (value >= 10_000) label = `${Math.round(value / 10_000)}만`;
    else label = String(value);
    return mask("amount", label);
  };

  const taxInvoiceLabel = (expense: Expense) =>
    expense.purchase_tax_invoice_not_required
      ? "불필요"
      : expense.purchase_tax_invoice_received
        ? "수취완료"
        : "미수취";

  const taxInvoiceBadgeClass = (expense: Expense) =>
    expense.purchase_tax_invoice_not_required
      ? undefined
      : expense.purchase_tax_invoice_received
        ? undefined
        : "border-amber-300 bg-amber-100 text-amber-900";

  const statusFilterButtonClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
    }`;

  const statusFilterCount = (filter: ExpenseStatusFilter) =>
    expenses.filter(
      (expense) => matchesSelectedPeriod(expense) && matchesStatusFilter(expense, filter)
    ).length;

  return (
    <PageShell>
      <PageHeader
        title="매입 관리"
        description="강사비, 외주비, 운영비 등 매입 내역과 지급 상태를 관리합니다."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/recurring-expenses">
                <Repeat className="h-4 w-4" />
                반복 매입
              </Link>
            </Button>
            <Button onClick={() => router.push("/dashboard/expenses/new")}>매입 등록</Button>
          </div>
        }
      />

      <StatsGrid>
        <StatCard
          label={`${currentYear}년 누적 매입`}
          value={`${formatAmount(yearlyTotal)}원`}
          mobileValue={formatAmountInMan(yearlyTotal)}
          description="올해 누적된 총 매입 금액입니다."
          icon={TrendingDown}
          sensitive="amount"
        />
        <StatCard
          label={`${currentMonth}월 매입`}
          value={`${formatAmount(monthlyTotal)}원`}
          mobileValue={formatAmountInMan(monthlyTotal)}
          description="이번 달 기준 집계입니다."
          icon={CircleDollarSign}
          tone="warning"
          sensitive="amount"
        />
        <StatCard
          label="누적 미지급"
          value={`${formatAmount(totalUnpaid)}원`}
          mobileValue={formatAmountInMan(totalUnpaid)}
          description="아직 지급되지 않은 총 금액입니다."
          icon={FileClock}
          tone="warning"
          sensitive="amount"
        />
        <StatCard
          label="현재 선택 합계"
          value={`${formatAmount(selectedTotal)}원`}
          mobileValue={formatAmountInMan(selectedTotal)}
          description={`${filtered.length}건이 현재 필터에 포함되어 있습니다.`}
          icon={ReceiptText}
          tone="brand"
          sensitive="amount"
        />
      </StatsGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <SectionIntro
              title={`${currentYear}년 유형별 매입`}
              description="매입 유형별 비중을 확인할 수 있습니다."
            />
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              {chartReady && typeChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typeChartData}
                      dataKey="amount"
                      nameKey="name"
                      cx="50%"
                      cy="42%"
                      outerRadius={80}
                      innerRadius={45}
                      paddingAngle={2}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      label={((props: any) => {
                        const { name, percent, cx, cy, midAngle, outerRadius } = props;
                        if ((percent ?? 0) < 0.04) return null;
                        const RADIAN = Math.PI / 180;
                        const r = (outerRadius as number) + 18;
                        const x = (cx as number) + r * Math.cos(-(midAngle as number) * RADIAN);
                        const y = (cy as number) + r * Math.sin(-(midAngle as number) * RADIAN);
                        return (
                          <text
                            x={x}
                            y={y}
                            fill="#374151"
                            textAnchor={x > (cx as number) ? "start" : "end"}
                            dominantBaseline="central"
                            fontSize={11}
                          >
                            {name} {Math.round((percent ?? 0) * 100)}%
                          </text>
                        );
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      }) as any}
                      labelLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
                    >
                      {typeChartData.map((entry) => (
                        <Cell key={entry.name} fill={getTypeColor(entry.name)} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [mask("amount", `${formatAmount(Number(value))}원`), "매입"]}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(value) => <span style={{ color: "inherit" }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  매입 데이터가 없습니다.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <SectionIntro
              title={`${currentYear}년 월별 매입 현황`}
              description="월별 추이를 빠르게 확인한 뒤 아래 목록에서 상세 건을 살펴볼 수 있습니다."
            />
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              {chartReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    accessibilityLayer={false}
                    data={monthlyChartData}
                    margin={{ top: 24, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      className="stroke-muted/50"
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={chartFormatter}
                      tick={{ fontSize: 12 }}
                      width={50}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={false}
                      formatter={(value, name) => [mask("amount", `${formatAmount(Number(value))}원`), name]}
                      labelFormatter={(label) => `${currentYear}년 ${label}`}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    {typeNames.map((name, index) => (
                      <Bar
                        key={name}
                        dataKey={name}
                        stackId="expense"
                        fill={getTypeColor(name)}
                        radius={
                          index === typeNames.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]
                        }
                      >
                        <LabelList
                          dataKey={name}
                          position="center"
                          formatter={(v: unknown) =>
                            typeof v === "number" && v > 0 ? mask("amount", formatAmountInMan(v)) : ""
                          }
                          style={{ fontSize: 10, fill: "#fff", fontWeight: 600 }}
                        />
                        {index === typeNames.length - 1 && (
                          <LabelList
                            dataKey="total"
                            position="top"
                            formatter={(v: unknown) =>
                              typeof v === "number" && v > 0 ? mask("amount", formatAmountInMan(v)) : ""
                            }
                            style={{
                              fontSize: 11,
                              fill: "hsl(var(--foreground))",
                            }}
                          />
                        )}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full rounded-md bg-muted/30" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <PageToolbar>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(selectedYear)}
              onValueChange={(value) => setSelectedYear(Number(value))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}년
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[88px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                  <SelectItem key={month} value={String(month)}>
                    {month}월
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="text-sm text-muted-foreground">
              {selectedMonth === "all"
                ? `${selectedYear}년 전체`
                : `${selectedYear}년 ${selectedMonth}월`}
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatusFilter(option.value)}
                  className={statusFilterButtonClass(statusFilter === option.value)}
                >
                  {option.label}
                  <span className="ml-1 opacity-70">{statusFilterCount(option.value)}</span>
                </button>
              ))}
            </div>
            <Input
              placeholder="매입명, 매입처, 프로젝트명, 메모 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full sm:w-64"
            />
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
              <Checkbox
                id="expense-undated-only"
                checked={showUndatedOnly}
                onCheckedChange={(checked) => setShowUndatedOnly(checked === true)}
              />
              <Label htmlFor="expense-undated-only" className="cursor-pointer text-sm">
                날짜미정
              </Label>
            </div>
            {search || showUndatedOnly || statusFilter !== "all" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setShowUndatedOnly(false);
                  setStatusFilter("all");
                }}
              >
                초기화
              </Button>
            ) : null}
          </div>
        </div>
      </PageToolbar>

      {loading ? (
        <LoadingState
          title="매입 데이터를 불러오는 중입니다."
          description="프로젝트 연결 정보를 함께 정리하고 있습니다."
        />
      ) : error ? (
        <ErrorState
          description="매입 목록을 다시 불러오지 못했습니다."
          action={
            <Button variant="outline" size="sm" onClick={() => void fetchData({ skipCache: true })}>
              다시 시도
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="조건에 맞는 매입이 없습니다."
          description={`${selectedYear}년 ${
            selectedMonth === "all" ? "전체" : `${selectedMonth}월`
          } 기준으로 조회된 항목이 없습니다.`}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedMonth("all");
                setSearch("");
                setShowUndatedOnly(false);
                setStatusFilter("all");
              }}
            >
              필터 초기화
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {filtered.map((expense) => (
              <button
                key={expense.id}
                className="surface-subtle p-3 sm:p-4 text-left transition-colors hover:bg-muted/40 active:bg-muted"
                onClick={() => router.push(`/dashboard/expenses/${expense.id}`)}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="font-medium">{expenseDisplayName(expense)}</p>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary">{sourceLabel(expense)}</Badge>
                    <Badge variant="outline" className={STATUS_BADGE_CLASS[expense.status]}>
                      {EXPENSE_STATUS_LABEL[expense.status]}
                    </Badge>
                    <Badge
                      variant={expense.payment_date ? "default" : "outline"}
                      className={!expense.payment_date ? unpaidBadgeClass : undefined}
                    >
                      {expense.payment_date ? "지급완료" : "미지급"}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  {typeName(expense) ? <p>유형: {typeName(expense)}</p> : null}
                  {expense.projects ? (
                    <p>
                      프로젝트: [{expense.projects.project_number}] {expense.projects.name}
                    </p>
                  ) : null}
                  <p>매입일: {expense.purchase_date || "-"}</p>
                  <p>지급일: {expense.payment_date || "-"}</p>
                  <p className="font-medium text-foreground">
                    금액: {mask("amount", `${formatAmount(expense.total_amount)}원`)}
                  </p>
                  <p>매입세금계산서: {taxInvoiceLabel(expense)}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/90 shadow-sm md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="title" currentSort={sort} onSort={toggle}>
                      매입명
                    </SortableTableHead>
                    <SortableTableHead sortKey="type" currentSort={sort} onSort={toggle}>
                      매입유형
                    </SortableTableHead>
                    <SortableTableHead sortKey="vendor_name" currentSort={sort} onSort={toggle}>
                      매입처
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="total_amount"
                      currentSort={sort}
                      onSort={toggle}
                      className="text-right"
                    >
                      매입금액
                    </SortableTableHead>
                    <SortableTableHead sortKey="purchase_date" currentSort={sort} onSort={toggle}>
                      매입일
                    </SortableTableHead>
                    <SortableTableHead sortKey="payment_date" currentSort={sort} onSort={toggle}>
                      지급일
                    </SortableTableHead>
                    <SortableTableHead sortKey="status" currentSort={sort} onSort={toggle}>
                      결의상태
                    </SortableTableHead>
                    <SortableTableHead sortKey="tax_invoice" currentSort={sort} onSort={toggle}>
                      매입세금계산서
                    </SortableTableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((expense) => (
                    <TableRow
                      key={expense.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/expenses/${expense.id}`)}
                    >
                      <TableCell className="max-w-[250px] truncate font-medium">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{expenseDisplayName(expense)}</span>
                          <Badge variant="secondary" className="shrink-0">
                            {sourceLabel(expense)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {typeName(expense) ? (
                          <Badge variant="secondary">{typeName(expense)}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {expense.vendor_name ? (
                          <span>{expense.vendor_name}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {mask("amount", `${formatAmount(expense.total_amount)}원`)}
                      </TableCell>
                      <TableCell>{expense.purchase_date || "-"}</TableCell>
                      <TableCell>
                        {expense.payment_date ? (
                          expense.payment_date
                        ) : (
                          <Badge variant="outline" className={unpaidBadgeClass}>
                            미지급
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_BADGE_CLASS[expense.status]}>
                          {EXPENSE_STATUS_LABEL[expense.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={taxInvoiceBadgeClass(expense)}>
                          {taxInvoiceLabel(expense)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
