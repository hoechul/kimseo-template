"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BanknoteArrowUp, Landmark, Link2, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";

import { DepositDialog } from "@/components/deposit-dialog";
import { DepositAiMatchDialog } from "@/components/deposit-ai-match-dialog";
import { formatAmountInMan } from "@/lib/utils";

const DEPOSIT_TEST_CHANNEL = "deposit-notification-test";
import { EmptyState, ErrorState, LoadingState, PageHeader, PageShell, PageToolbar, StatCard, StatsGrid } from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SortableTableHead, sortData, useSortState } from "@/components/ui/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { Deposit, DepositInsert } from "@/lib/types";

export default function DepositsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();

  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiMatchOpen, setAiMatchOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);
  const { sort, toggle } = useSortState();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);

    await supabase.auth.getSession();

    const { data, error: fetchError } = await supabase
      .from("deposits")
      .select("*, revenues(id, title, total_amount, projects(name, client))")
      .order("deposit_date", { ascending: false })
      .limit(1000);

    if (fetchError) {
      console.error("입금 목록 조회 실패:", fetchError.message);
      toast.error("입금 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setError(true);
      setDeposits([]);
    } else {
      setDeposits(data ?? []);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

  const handleAdd = () => {
    setSelectedDeposit(null);
    setDialogOpen(true);
  };

  const handleTestNotification = async () => {
    const ch = supabase.channel(DEPOSIT_TEST_CHANNEL);
    await ch.subscribe();
    await ch.send({
      type: "broadcast",
      event: "test",
      payload: {
        id: "test",
        deposit_date: new Date().toISOString().slice(0, 10),
        amount: 1_000_000,
        depositor_name: "테스트",
        bank_name: "국민은행",
        created_at: new Date().toISOString(),
      },
    });
    supabase.removeChannel(ch);
  };

  const handleEdit = (deposit: Deposit) => {
    setSelectedDeposit(deposit);
    setDialogOpen(true);
  };

  const handleSave = async (data: DepositInsert) => {
    const cleaned = {
      ...data,
      bank_name: data.bank_name || null,
      account_alias: data.account_alias || null,
      revenue_id: data.revenue_id || null,
      memo: data.memo || null,
      raw_message: data.raw_message || null,
    };

    if (selectedDeposit) {
      const { error: updateError } = await supabase
        .from("deposits")
        .update(cleaned)
        .eq("id", selectedDeposit.id);

      if (updateError) {
        console.error("입금 수정 실패:", updateError.message);
        toast.error("입금 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      toast.success("입금 정보가 수정되었습니다.");
      sendLog("UPDATE_DEPOSIT", `입금 수정: ${data.depositor_name}`, {
        resource: "deposit",
        resource_id: selectedDeposit.id,
      });
    } else {
      const { error: insertError } = await supabase.from("deposits").insert(cleaned);

      if (insertError) {
        console.error("입금 등록 실패:", insertError.message);
        toast.error("입금 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      sendLog(
        "CREATE_DEPOSIT",
        `입금 등록: ${data.depositor_name} ${data.amount.toLocaleString("ko-KR")}원`,
        { resource: "deposit" }
      );
    }

    await fetchData();
  };

  const handleDelete = async (id: string) => {
    const target = deposits.find((d) => d.id === id);
    const { error: deleteError } = await supabase.from("deposits").delete().eq("id", id);
    if (deleteError) {
      console.error("입금 삭제 실패:", deleteError.message);
      toast.error("입금 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    toast.success("입금 항목이 삭제되었습니다.");
    sendLog("DELETE_DEPOSIT", `입금 삭제: ${target?.depositor_name}`, { resource: "deposit", resource_id: id });
    await fetchData();
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setSelectedDeposit(null);
    }
  };

  const keyword = search.trim();
  const filtered = useMemo(
    () =>
      deposits.filter((deposit) => {
        if (!keyword) return true;

        return (
          deposit.depositor_name.includes(keyword) ||
          deposit.bank_name?.includes(keyword) ||
          deposit.memo?.includes(keyword)
        );
      }),
    [deposits, keyword]
  );

  const sorted = useMemo(
    () =>
      sortData(filtered, sort, (item, key) => {
        switch (key) {
          case "deposit_date":
            return item.created_at;
          case "depositor_name":
            return item.depositor_name;
          case "amount":
            return item.amount;
          case "bank_name":
            return item.bank_name;
          case "source":
            return item.source;
          default:
            return null;
        }
      }),
    [filtered, sort]
  );

  const fmt = (amount: number) => mask("amount", amount.toLocaleString("ko-KR"));

  const revenueLabel = (rev: NonNullable<Deposit["revenues"]>) => {
    const project = rev.projects;
    const prefix = project?.client ?? project?.name;
    return prefix ? `${prefix} / ${rev.title}` : rev.title;
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  const monthlyTotal = useMemo(
    () =>
      deposits
        .filter((deposit) => deposit.deposit_date && deposit.deposit_date.startsWith(monthPrefix))
        .reduce((sum, deposit) => sum + deposit.amount, 0),
    [deposits, monthPrefix]
  );

  const yearlyTotal = useMemo(
    () =>
      deposits
        .filter((deposit) => deposit.deposit_date && deposit.deposit_date.startsWith(String(currentYear)))
        .reduce((sum, deposit) => sum + deposit.amount, 0),
    [deposits, currentYear]
  );

  const linkedCount = useMemo(
    () => deposits.filter((deposit) => deposit.revenues).length,
    [deposits]
  );

  const unlinkedCount = deposits.length - linkedCount;

  return (
    <PageShell>
      <PageHeader
        title="입금 관리"
        funKey="deposits"
        description="사업자 통장 입금 내역을 수기 입력과 자동 수집 기준으로 함께 관리합니다."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleTestNotification}>전광판 테스트</Button>
            <Button
              variant="outline"
              onClick={() => setAiMatchOpen(true)}
              disabled={unlinkedCount === 0}
              title={unlinkedCount === 0 ? "미연결 입금이 없습니다" : undefined}
            >
              <Sparkles className="h-4 w-4" /> AI 매칭
              {unlinkedCount > 0 ? (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary">
                  {unlinkedCount}
                </span>
              ) : null}
            </Button>
            <Button onClick={handleAdd}>입금 등록</Button>
          </div>
        }
      />

      <StatsGrid>
        <StatCard
          label={`${currentMonth}월 입금액`}
          value={`${fmt(monthlyTotal)}원`}
          mobileValue={formatAmountInMan(monthlyTotal)}
          description="이번 달에 확인된 총 입금액"
          icon={BanknoteArrowUp}
          tone="positive"
          sensitive="amount"
        />
        <StatCard
          label={`${currentYear}년 입금액`}
          value={`${fmt(yearlyTotal)}원`}
          mobileValue={formatAmountInMan(yearlyTotal)}
          description="올해 누적 입금액"
          icon={Wallet}
          sensitive="amount"
        />
        <StatCard
          label="입금 건수"
          value={`${deposits.length}건`}
          description="현재 등록된 총 입금 수"
          icon={Landmark}
          tone="brand"
        />
        <StatCard
          label="매출 연결"
          value={`${linkedCount}건`}
          description="매출 항목과 연결된 입금 수"
          icon={Link2}
        />
      </StatsGrid>

      <PageToolbar>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="입금자명, 은행, 메모를 검색하세요"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:max-w-sm"
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{filtered.length}건 표시 중</span>
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
          title="입금 내역을 불러오는 중입니다."
          description="은행 정보와 연결된 매출을 함께 가져오고 있습니다."
        />
      ) : error ? (
        <ErrorState
          description="입금 목록을 다시 불러오지 못했습니다."
          action={
            <Button variant="outline" size="sm" onClick={() => void fetchData()}>
              다시 시도
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={deposits.length === 0 ? "등록된 입금이 없습니다." : "조건에 맞는 입금이 없습니다."}
          description={
            deposits.length === 0
              ? "입금을 등록하면 매출 연결과 입금 흐름 추적을 바로 시작할 수 있습니다."
              : "검색어를 조정하거나 필터를 초기화해 보세요."
          }
          action={
            deposits.length === 0 ? (
              <Button size="sm" onClick={handleAdd}>
                입금 등록
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                검색 초기화
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {sorted.map((deposit) => (
              <button
                key={deposit.id}
                type="button"
                className="surface-subtle p-3 sm:p-4 text-left transition-colors hover:bg-muted/40 active:bg-muted"
                onClick={() => handleEdit(deposit)}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{mask("name", deposit.depositor_name)}</p>
                    {deposit.bank_name ? (
                      <p className="text-xs text-muted-foreground">{deposit.bank_name}</p>
                    ) : null}
                  </div>
                  <Badge variant={deposit.source === "webhook" ? "default" : "outline"}>
                    {deposit.source === "webhook" ? "자동" : "수기"}
                  </Badge>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>입금일시: {new Date(deposit.created_at).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                  <p>금액: {fmt(deposit.amount)}원</p>
                  <p>
                    매출 연결:{" "}
                    {deposit.revenues ? (
                      <Link
                        href={`/dashboard/revenues/${deposit.revenues.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {revenueLabel(deposit.revenues)}
                      </Link>
                    ) : (
                      "미연결"
                    )}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/90 shadow-sm md:block">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="deposit_date" currentSort={sort} onSort={toggle}>
                    입금일시
                  </SortableTableHead>
                  <SortableTableHead sortKey="depositor_name" currentSort={sort} onSort={toggle}>
                    입금자명
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="amount"
                    currentSort={sort}
                    onSort={toggle}
                    className="text-right"
                  >
                    입금액
                  </SortableTableHead>
                  <SortableTableHead sortKey="bank_name" currentSort={sort} onSort={toggle}>
                    은행
                  </SortableTableHead>
                  <SortableTableHead sortKey="source" currentSort={sort} onSort={toggle}>
                    출처
                  </SortableTableHead>
                  <TableHead>매출 연결</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((deposit) => (
                  <TableRow
                    key={deposit.id}
                    className="cursor-pointer"
                    onClick={() => handleEdit(deposit)}
                  >
                    <TableCell className="whitespace-nowrap">
                      {new Date(deposit.created_at).toLocaleString("ko-KR", {
                        year: "numeric", month: "2-digit", day: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate font-medium">{mask("name", deposit.depositor_name)}</TableCell>
                    <TableCell className="text-right">{fmt(deposit.amount)}원</TableCell>
                    <TableCell>{deposit.bank_name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={deposit.source === "webhook" ? "default" : "outline"}>
                        {deposit.source === "webhook" ? "자동" : "수기"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {deposit.revenues ? (
                        <Link
                          href={`/dashboard/revenues/${deposit.revenues.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {revenueLabel(deposit.revenues)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">미연결</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
        </>
      )}

      <DepositDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        deposit={selectedDeposit}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <DepositAiMatchDialog
        open={aiMatchOpen}
        onOpenChange={setAiMatchOpen}
        onLinked={() => void fetchData()}
      />
    </PageShell>
  );
}
