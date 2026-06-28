"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toKstDateString } from "@/lib/date";
import type { Deposit, DepositInsert } from "@/lib/types";

interface RevenueOption {
  id: string;
  title: string;
  total_amount: number;
  project_name: string | null;
}

interface DepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deposit: Deposit | null;
  onSave: (data: DepositInsert) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

function createEmptyDeposit(): DepositInsert {
  const today = toKstDateString();
  return {
    deposit_date: today,
    amount: 0,
    depositor_name: "",
    bank_name: null,
    account_alias: null,
    revenue_id: null,
    source: "manual",
    raw_message: null,
    memo: null,
  };
}

function RevenueCombobox({
  revenues,
  value,
  onChange,
  fmt,
}: {
  revenues: RevenueOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  fmt: (n: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const selected = revenues.find((r) => r.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selected
              ? `${selected.project_name ? `${selected.project_name} / ` : ""}${selected.title} (${fmt(selected.total_amount)}원)`
              : "매출 미연결"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="매출 검색..." />
          <CommandList>
            <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="매출 미연결"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    !value ? "opacity-100" : "opacity-0"
                  )}
                />
                매출 미연결
              </CommandItem>
              {revenues.map((rev) => (
                <CommandItem
                  key={rev.id}
                  value={`${rev.title} ${rev.project_name ?? ""} ${fmt(rev.total_amount)}`}
                  onSelect={() => {
                    onChange(rev.id === value ? null : rev.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === rev.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{rev.title} ({fmt(rev.total_amount)}원)</span>
                    {rev.project_name ? (
                      <span className="text-xs text-muted-foreground">{rev.project_name}</span>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function DepositDialog({
  open,
  onOpenChange,
  deposit,
  onSave,
  onDelete,
}: DepositDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<DepositInsert>(createEmptyDeposit());
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [displayAmount, setDisplayAmount] = useState("");
  const [revenues, setRevenues] = useState<RevenueOption[]>([]);

  const formatNumberWithCommas = (value: string) => {
    const num = value.replace(/[^\d]/g, "");
    return num ? Number(num).toLocaleString() : "";
  };

  useEffect(() => {
    if (!open) return;
    supabase
      .from("revenues")
      .select("id, title, total_amount, projects(name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRevenues(
          (data ?? []).map((r) => ({
            id: r.id,
            title: r.title,
            total_amount: r.total_amount,
            project_name: ((r.projects as unknown as { name: string } | null)?.name) ?? null,
          }))
        );
      });
  }, [open, supabase]);

  useEffect(() => {
    if (deposit) {
      setForm({
        deposit_date: deposit.deposit_date,
        amount: deposit.amount,
        depositor_name: deposit.depositor_name,
        bank_name: deposit.bank_name,
        account_alias: deposit.account_alias,
        revenue_id: deposit.revenue_id,
        source: deposit.source,
        raw_message: deposit.raw_message,
        memo: deposit.memo,
      });
      setDisplayAmount(deposit.amount ? deposit.amount.toLocaleString() : "");
    } else {
      setForm(createEmptyDeposit());
      setDisplayAmount("");
    }
  }, [deposit, open]);

  const handleAmountChange = (value: string) => {
    const rawNum = value.replace(/[^\d]/g, "");
    const amount = Number.parseInt(rawNum, 10) || 0;
    setForm((prev) => ({ ...prev, amount }));
    setDisplayAmount(formatNumberWithCommas(rawNum));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload: DepositInsert = {
        ...form,
        bank_name: form.bank_name || null,
        account_alias: form.account_alias || null,
        revenue_id: form.revenue_id || null,
        memo: form.memo || null,
        raw_message: form.raw_message || null,
      };

      await onSave(payload);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deposit || !onDelete) return;
    if (!confirm("이 입금 항목을 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      await onDelete(deposit.id);
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{deposit ? "입금 수정" : "입금 등록"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="deposit_date">입금일 *</Label>
              <DateInput
                id="deposit_date"
                value={form.deposit_date}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, deposit_date: v }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deposit_amount">입금액 *</Label>
              <Input
                id="deposit_amount"
                type="text"
                inputMode="numeric"
                value={displayAmount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                required
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="depositor_name">입금자명 *</Label>
              <Input
                id="depositor_name"
                value={form.depositor_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, depositor_name: e.target.value }))
                }
                placeholder="입금자명"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bank_name">은행</Label>
              <Input
                id="bank_name"
                value={form.bank_name ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, bank_name: e.target.value }))
                }
                placeholder="은행명"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account_alias">통장 별칭</Label>
              <Input
                id="account_alias"
                value={form.account_alias ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, account_alias: e.target.value }))
                }
                placeholder="예: 사업자통장"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>매출 연결</Label>
              <RevenueCombobox
                revenues={revenues}
                value={form.revenue_id}
                onChange={(id) =>
                  setForm((prev) => ({ ...prev, revenue_id: id }))
                }
                fmt={fmt}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="deposit-memo">메모</Label>
              <textarea
                id="deposit-memo"
                value={form.memo ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, memo: e.target.value }))
                }
                placeholder="메모"
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <DialogFooter className="flex-row gap-2">
            {deposit && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting || loading}
                className="mr-auto"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={loading || deleting}>
              {loading ? "저장 중..." : deposit ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
