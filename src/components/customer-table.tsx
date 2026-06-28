"use client";

import { Building2, FolderOpen } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/page-shell";
import { SortableTableHead, sortData, useSortState } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMasking } from "@/components/masking-provider";
import type { Customer } from "@/lib/types";

export interface CustomerWithStats extends Customer {
  project_count: number;
  project_total_amount: number;
}

interface CustomerTableProps {
  customers: CustomerWithStats[];
}

function formatAmount(amount: number) {
  return amount > 0 ? `${amount.toLocaleString("ko-KR")}원` : "-";
}

export function CustomerTable({ customers }: CustomerTableProps) {
  const router = useRouter();
  const { sort, toggle } = useSortState();
  const { mask } = useMasking();

  const sorted = sortData(customers, sort, (item, key) => {
    switch (key) {
      case "name":
        return item.name;
      case "project_count":
        return item.project_count;
      case "project_total_amount":
        return item.project_total_amount;
      default:
        return null;
    }
  });

  if (customers.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="등록된 고객이 없습니다."
        description="새 고객을 추가하면 프로젝트와 매출 흐름을 연결해 관리할 수 있습니다."
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {sorted.map((customer) => (
          <button
            key={customer.id}
            type="button"
            className="surface-subtle p-3 sm:p-4 text-left transition-colors hover:bg-muted/40 active:bg-muted/60"
            onClick={() => router.push(`/dashboard/customers/${customer.id}`)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-semibold text-foreground">
                  {mask("customer_name", customer.name)}
                </p>
                {customer.representative_name ? (
                  <p className="text-xs text-muted-foreground">
                    대표 {mask("name", customer.representative_name)}
                  </p>
                ) : null}
                {customer.business_number ? (
                  <p className="text-xs text-muted-foreground">
                    {mask("business_number", customer.business_number)}
                  </p>
                ) : null}
              </div>
              <div className="rounded-full border border-primary/10 bg-primary/8 px-2.5 py-1 text-[11px] font-medium text-primary">
                프로젝트 {customer.project_count}건
              </div>
            </div>
            <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5" />
                <span>
                  누적 매출{" "}
                  {customer.project_total_amount > 0
                    ? mask("amount", formatAmount(customer.project_total_amount))
                    : "-"}
                </span>
              </div>
              <span>{customer.address ? mask("address", customer.address) : "주소 정보 없음"}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="surface-panel hidden overflow-hidden bg-transparent p-1 shadow-none backdrop-blur-none md:block">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="name" currentSort={sort} onSort={toggle}>
                고객명
              </SortableTableHead>
              <TableHead className="font-medium text-muted-foreground">사업자번호</TableHead>
              <SortableTableHead
                sortKey="project_count"
                currentSort={sort}
                onSort={toggle}
                className="w-32 text-right"
              >
                프로젝트 수
              </SortableTableHead>
              <SortableTableHead
                sortKey="project_total_amount"
                currentSort={sort}
                onSort={toggle}
                className="w-44 text-right"
              >
                누적 매출
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((customer) => (
              <TableRow
                key={customer.id}
                className="cursor-pointer"
                onClick={() => router.push(`/dashboard/customers/${customer.id}`)}
              >
                <TableCell className="max-w-[200px] font-medium">
                  <div className="space-y-0.5">
                    <p className="truncate font-medium text-foreground">
                      {mask("customer_name", customer.name)}
                    </p>
                    {customer.representative_name ? (
                      <p className="text-xs font-normal text-muted-foreground">
                        대표 {mask("name", customer.representative_name)}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {customer.business_number
                    ? mask("business_number", customer.business_number)
                    : "-"}
                </TableCell>
                <TableCell className="text-right">{customer.project_count}건</TableCell>
                <TableCell className="text-right font-medium">
                  {customer.project_total_amount > 0
                    ? mask("amount", formatAmount(customer.project_total_amount))
                    : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>
    </>
  );
}
