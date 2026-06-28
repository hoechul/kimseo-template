"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleDollarSign,
  FileClock,
  ReceiptText,
  TrendingUp,
} from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getRevenueTaxInvoiceBadgeClassName,
  getRevenueTaxInvoiceBadgeVariant,
  getRevenueTaxInvoiceLabel,
  getRevenueTaxInvoiceSortRank,
  getRevenueTaxInvoiceState,
} from "@/lib/revenue-tax-invoice";
import { createClient } from "@/lib/supabase/client";
import { getCache, setCache } from "@/lib/simple-cache";
import type { Revenue } from "@/lib/types";

type SortKey =
  | "revenue_date"
  | "total_amount"
  | "title"
  | "channel"
  | "expected_payment_date"
  | "paid_date"
  | "is_paid"
  | "tax_invoice";

export default function RevenuesPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { mask } = useMasking();
  const [now] = useState(() => new Date());
  const [chartReady, setChartReady] = useState(false);

  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [showUndatedOnly, setShowUndatedOnly] = useState(false);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<string>(
    String(now.getMonth() + 1)
  );
  const { sort, toggle } = useSortState<SortKey>("revenue_date");

  const fetchData = useCallback(async (options: { skipCache?: boolean } = {}) => {
    const cacheKey = "revenues:list";
    const cached = options.skipCache ? null : getCache<Revenue[]>(cacheKey);

    if (cached) {
      // Show cached data instantly, then refresh in background (stale-while-revalidate)
      setRevenues(cached);
      setLoading(false);
      setError(false);
    } else {
      setLoading(true);
      setError(false);
    }

    await supabase.auth.getSession();

    const { data, error: revenuesError } = await supabase
      .from("revenues")
      .select("*, project_types(id, name), projects(id, project_number, name, project_types(id, name))")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (revenuesError) {
      console.error("매출 목록 조회 실패:", revenuesError.message);
      if (!cached) {
        toast.error("매출 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        setError(true);
        setRevenues([]);
        setLoading(false);
      }
      return;
    }

    const fresh = (data ?? []) as Revenue[];
    setRevenues(fresh);
    setCache(cacheKey, fresh);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    setChartReady(true);
  }, []);

  const handleAdd = () => {
    router.push("/dashboard/revenues/new");
  };

  const availableYears = useMemo(() => {
    const years = new Set<number>();

    for (const revenue of revenues) {
      if (revenue.revenue_date) {
        years.add(Number(revenue.revenue_date.slice(0, 4)));
      }
    }

    years.add(now.getFullYear());

    return [...years].sort((left, right) => right - left);
  }, [now, revenues]);

  const selectedPrefix =
    selectedMonth === "all"
      ? String(selectedYear)
      : `${selectedYear}-${selectedMonth.padStart(2, "0")}`;

  const filtered = useMemo(() => {
    const result = revenues.filter((revenue) => {
      if (showUndatedOnly) {
        if (revenue.revenue_date) {
          return false;
        }
      } else if (
        !revenue.revenue_date ||
        !revenue.revenue_date.startsWith(selectedPrefix)
      ) {
        return false;
      }

      const keyword = search.trim();
      if (!keyword) {
        return true;
      }

      return (
        revenue.title.includes(keyword) ||
        revenue.projects?.name?.includes(keyword) ||
        revenue.projects?.project_number?.includes(keyword) ||
        revenue.channel?.includes(keyword) ||
        revenue.product_name?.includes(keyword) ||
        revenue.memo?.includes(keyword)
      );
    });

    return sortData(result, sort as SortState, (item, key) => {
      switch (key) {
        case "title":
          return item.projects ? `${item.projects.name} - ${item.title}` : item.title;
        case "type":
          return revenueTypeName(item) ?? "";
        case "channel":
          return item.channel;
        case "total_amount":
          return item.total_amount;
        case "revenue_date":
          return item.revenue_date;
        case "expected_payment_date":
          return item.expected_payment_date;
        case "paid_date":
          return item.paid_date;
        case "is_paid":
          return item.is_paid ? 1 : 0;
        case "tax_invoice":
          return getRevenueTaxInvoiceSortRank(item);
        default:
          return null;
      }
    });
  }, [revenues, search, selectedPrefix, showUndatedOnly, sort]);

  const formatAmount = (amount: number) => amount.toLocaleString("ko-KR");
  const amountTextClass = (amount: number) =>
    amount < 0 ? "font-medium text-red-600" : "";
  const today = now.toISOString().slice(0, 10);
  const unpaidBadgeClass = "border-amber-300 bg-amber-100 text-amber-900";
  const isPaymentDelayed = (revenue: Revenue) =>
    Boolean(
      !revenue.is_paid &&
        revenue.expected_payment_date &&
        revenue.expected_payment_date < today
    );
  const revenueTypeName = (revenue: Revenue) =>
    revenue.project_types?.name ?? revenue.projects?.project_types?.name ?? null;

  const revenueDisplayName = (revenue: Revenue) => {
    const projectName = revenue.projects ? mask("title", revenue.projects.name) : null;
    const title = mask("title", revenue.title);
    const base = projectName ? `${projectName}(${title})` : title;

    if (revenue.channel === "아임웹" && revenue.memo) {
      const match = revenue.memo.match(/주문자\s*:?\s*([^/]+)/);
      if (match) {
        return `${base} (${mask("name", match[1].trim())})`;
      }
    }

    return base;
  };

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const yearlyTotal = revenues
    .filter(
      (revenue) =>
        revenue.revenue_date &&
        revenue.revenue_date.startsWith(String(currentYear))
    )
    .reduce((sum, revenue) => sum + revenue.total_amount, 0);
  const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
  const monthlyTotal = revenues
    .filter(
      (revenue) =>
        revenue.revenue_date && revenue.revenue_date.startsWith(monthPrefix)
    )
    .reduce((sum, revenue) => sum + revenue.total_amount, 0);
  const totalUnpaid = revenues
    .filter((revenue) => !revenue.is_paid)
    .reduce((sum, revenue) => sum + revenue.total_amount, 0);
  const selectedMonthTotal = filtered.reduce(
    (sum, revenue) => sum + revenue.total_amount,
    0
  );
  const issuingCount = revenues.filter(
    (revenue) => getRevenueTaxInvoiceState(revenue) === "issuing"
  ).length;

  const TYPE_COLORS: Record<string, string> = {
    에이전시: "#93c5fd",
    강의: "#fca5a5",
    교육: "#fca5a5",
    구독: "#86efac",
    미분류: "#9ca3af",
  };
  const TYPE_COLOR_FALLBACKS = [
    "#c4b5fd",
    "#fde68a",
    "#f9a8d4",
    "#6ee7b7",
    "#fed7aa",
  ];

  const typeNames = useMemo(() => {
    const names = new Set<string>();
    for (const revenue of revenues) {
      if (!revenue.revenue_date) continue;
      if (!revenue.revenue_date.startsWith(String(currentYear))) continue;
      names.add(revenueTypeName(revenue) ?? "미분류");
    }
    return [...names].sort((a, b) => {
      if (a === "미분류") return 1;
      if (b === "미분류") return -1;
      return a.localeCompare(b);
    });
  }, [currentYear, revenues]);

  const getTypeColor = useCallback(
    (name: string) => {
      if (TYPE_COLORS[name]) return TYPE_COLORS[name];
      const knownCount = Object.keys(TYPE_COLORS).length;
      const idx = typeNames.indexOf(name);
      return TYPE_COLOR_FALLBACKS[
        Math.max(0, idx - knownCount) % TYPE_COLOR_FALLBACKS.length
      ];
    },
    [typeNames]
  );

  const monthlyChartData = useMemo(() => {
    const lastMonth = Math.min(
      currentYear === now.getFullYear() ? currentMonth + 3 : 12,
      12
    );

    const months: string[] = [];
    for (let month = 1; month <= lastMonth; month += 1) {
      months.push(`${currentYear}-${String(month).padStart(2, "0")}`);
    }

    const monthTypeMap: Record<string, Record<string, number>> = {};
    for (const m of months) {
      monthTypeMap[m] = {};
      for (const t of typeNames) {
        monthTypeMap[m][t] = 0;
      }
    }

    for (const revenue of revenues) {
      if (!revenue.revenue_date) continue;
      const key = revenue.revenue_date.slice(0, 7);
      if (!(key in monthTypeMap)) continue;
      const typeName = revenueTypeName(revenue) ?? "미분류";
      monthTypeMap[key][typeName] =
        (monthTypeMap[key][typeName] ?? 0) + revenue.total_amount;
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
  }, [currentMonth, currentYear, now, revenues, typeNames]);

  const typeChartData = useMemo(() => {
    const typeMap: Record<string, number> = {};

    for (const revenue of revenues) {
      if (!revenue.revenue_date) continue;
      if (!revenue.revenue_date.startsWith(String(currentYear))) continue;

      const typeName =
        revenueTypeName(revenue) ?? "미분류";
      typeMap[typeName] = (typeMap[typeName] ?? 0) + revenue.total_amount;
    }

    return Object.entries(typeMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => {
        if (a.name === "미분류") return 1;
        if (b.name === "미분류") return -1;
        return b.amount - a.amount;
      });
  }, [currentYear, revenues]);

  const chartFormatter = (value: number) => {
    let label: string;
    if (value >= 100_000_000) {
      label = `${(value / 100_000_000).toFixed(1)}억`;
    } else if (value >= 10_000) {
      label = `${Math.round(value / 10_000)}만`;
    } else {
      label = String(value);
    }
    return mask("amount", label);
  };

  return (
    <>
      <PageShell>
        <PageHeader
          title="매출 관리"
          funKey="revenues"
          description="모든 매출을 한곳에서 관리하고 입금 상태와 세금계산서 진행 상황까지 바로 확인할 수 있습니다."
          actions={<Button onClick={handleAdd}>매출 등록</Button>}
        />

        <StatsGrid>
          <StatCard
            label={`${currentYear}년 누적 매출`}
            value={`${formatAmount(yearlyTotal)}원`}
            mobileValue={formatAmountInMan(yearlyTotal)}
            description="올해 누적된 총 매출입니다."
            icon={TrendingUp}
            sensitive="amount"
          />
          <StatCard
            label={`${currentMonth}월 매출`}
            value={`${formatAmount(monthlyTotal)}원`}
            mobileValue={formatAmountInMan(monthlyTotal)}
            description="이번 달 기준 집계입니다."
            icon={CircleDollarSign}
            tone="positive"
            sensitive="amount"
          />
          <StatCard
            label="누적 미수금"
            value={`${formatAmount(totalUnpaid)}원`}
            mobileValue={formatAmountInMan(totalUnpaid)}
            description={
              issuingCount > 0
                ? `미입금 금액과 함께 세금계산서 발행중 ${issuingCount}건을 추적합니다.`
                : "아직 입금되지 않은 총 금액입니다."
            }
            icon={FileClock}
            tone="warning"
            sensitive="amount"
          />
          <StatCard
            label="현재 선택 합계"
            value={`${formatAmount(selectedMonthTotal)}원`}
            mobileValue={formatAmountInMan(selectedMonthTotal)}
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
                title={`${currentYear}년 유형별 매출`}
                description="프로젝트 유형별 매출 비중을 확인할 수 있습니다."
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
                        }) as any}
                        labelLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
                      >
                        {typeChartData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={getTypeColor(entry.name)}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [
                          mask("amount", `${formatAmount(Number(value))}원`),
                          "매출",
                        ]}
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
                        formatter={(value) => (
                          <span style={{ color: "inherit" }}>{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    매출 데이터가 없습니다.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <SectionIntro
                title={`${currentYear}년 월별 매출 현황`}
                description="월별 추이를 빠르게 확인한 뒤 아래 목록에서 상세 건을 살펴볼 수 있습니다."
              />
            </CardHeader>
            <CardContent>
              <div className="revenue-monthly-chart h-64 w-full">
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
                        formatter={(value, name) => [
                          mask("amount", `${formatAmount(Number(value))}원`),
                          name,
                        ]}
                        labelFormatter={(label) => `${currentYear}년 ${label}`}
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
                      />
                      {typeNames.map((name, index) => (
                        <Bar
                          key={name}
                          dataKey={name}
                          stackId="revenue"
                          fill={getTypeColor(name)}
                          radius={
                            index === typeNames.length - 1
                              ? [6, 6, 0, 0]
                              : [0, 0, 0, 0]
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
                              style={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
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
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(
                    (month) => (
                      <SelectItem key={month} value={String(month)}>
                        {month}월
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>

              <span className="text-sm text-muted-foreground">
                {selectedMonth === "all"
                  ? `${selectedYear}년 전체`
                  : `${selectedYear}년 ${selectedMonth}월`}
              </span>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                placeholder="매출명, 프로젝트명, 프로젝트 번호, 메모 검색"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full sm:w-64"
              />
              <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                <Checkbox
                  id="revenue-undated-only"
                  checked={showUndatedOnly}
                  onCheckedChange={(checked) => setShowUndatedOnly(checked === true)}
                />
                <Label htmlFor="revenue-undated-only" className="cursor-pointer text-sm">
                  날짜미정
                </Label>
              </div>
              {search || showUndatedOnly ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setShowUndatedOnly(false);
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
            title="매출 데이터를 불러오는 중입니다."
            description="프로젝트 연결 정보와 세금계산서 상태를 함께 정리하고 있습니다."
          />
        ) : error ? (
          <ErrorState
            description="매출 목록을 다시 불러오지 못했습니다."
            action={
              <Button variant="outline" size="sm" onClick={() => void fetchData({ skipCache: true })}>
                다시 시도
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="조건에 맞는 매출이 없습니다."
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
                }}
              >
                필터 초기화
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {filtered.map((revenue) => (
                <button
                  key={revenue.id}
                  className="surface-subtle p-3 sm:p-4 text-left transition-colors hover:bg-muted/40 active:bg-muted"
                  onClick={() => router.push(`/dashboard/revenues/${revenue.id}`)}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="font-medium">{revenueDisplayName(revenue)}</p>
                    <div className="flex items-center gap-1">
                      {isPaymentDelayed(revenue) ? (
                        <Badge variant="destructive">입금지연</Badge>
                      ) : null}
                      <Badge
                        variant={revenue.is_paid ? "default" : "outline"}
                        className={!revenue.is_paid ? unpaidBadgeClass : undefined}
                      >
                        {revenue.is_paid ? "입금완료" : "미입금"}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    {revenueTypeName(revenue) ? <p>유형: {revenueTypeName(revenue)}</p> : null}
                    {revenue.channel ? <p>채널: {revenue.channel}</p> : null}
                    <p>매출일: {revenue.revenue_date || "-"}</p>
                    <p>입금예정일: {revenue.expected_payment_date || "-"}</p>
                    <p>입금일: {revenue.paid_date || "-"}</p>
                    <p className={amountTextClass(revenue.total_amount)}>
                      금액: {mask("amount", `${formatAmount(revenue.total_amount)}원`)}
                    </p>
                    <p>세금계산서: {getRevenueTaxInvoiceLabel(revenue)}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/90 shadow-sm md:block">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      sortKey="title"
                      currentSort={sort}
                      onSort={toggle}
                    >
                      매출명
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="type"
                      currentSort={sort}
                      onSort={toggle}
                    >
                      매출유형
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="channel"
                      currentSort={sort}
                      onSort={toggle}
                    >
                      판매채널
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="total_amount"
                      currentSort={sort}
                      onSort={toggle}
                      className="text-right"
                    >
                      매출금액
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="revenue_date"
                      currentSort={sort}
                      onSort={toggle}
                    >
                      매출일
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="expected_payment_date"
                      currentSort={sort}
                      onSort={toggle}
                    >
                      입금예정일
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="paid_date"
                      currentSort={sort}
                      onSort={toggle}
                    >
                      입금일
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="is_paid"
                      currentSort={sort}
                      onSort={toggle}
                    >
                      입금
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="tax_invoice"
                      currentSort={sort}
                      onSort={toggle}
                    >
                      세금계산서
                    </SortableTableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((revenue) => (
                    <TableRow
                      key={revenue.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/revenues/${revenue.id}`)}
                    >
                      <TableCell className="max-w-[250px] truncate font-medium">
                        {revenueDisplayName(revenue)}
                      </TableCell>
                      <TableCell>
                        {revenueTypeName(revenue) ? (
                          <Badge variant="secondary">{revenueTypeName(revenue)}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {revenue.channel ? (
                          <Badge variant="secondary">{revenue.channel}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right ${amountTextClass(revenue.total_amount)}`}
                      >
                        {mask("amount", `${formatAmount(revenue.total_amount)}원`)}
                      </TableCell>
                      <TableCell>{revenue.revenue_date || "-"}</TableCell>
                      <TableCell>{revenue.expected_payment_date || "-"}</TableCell>
                      <TableCell>{revenue.paid_date || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {isPaymentDelayed(revenue) ? (
                            <Badge variant="destructive">입금지연</Badge>
                          ) : null}
                          <Badge
                            variant={revenue.is_paid ? "default" : "outline"}
                            className={!revenue.is_paid ? unpaidBadgeClass : undefined}
                          >
                            {revenue.is_paid ? "입금완료" : "미입금"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getRevenueTaxInvoiceBadgeVariant(revenue)}
                          className={getRevenueTaxInvoiceBadgeClassName(revenue)}
                        >
                          {getRevenueTaxInvoiceLabel(revenue)}
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
    </>
  );
}
