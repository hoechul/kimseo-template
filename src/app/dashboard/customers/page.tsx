"use client";

import { Building2, Handshake, Plus, Search, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { CustomerTable, type CustomerWithStats } from "@/components/customer-table";
import { formatAmountInMan } from "@/lib/utils";
import { ErrorState, LoadingState, PageHeader, PageShell, PageToolbar, StatCard, StatsGrid } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

type CustomerContactSummary = {
  name: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
};

export default function CustomersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [customers, setCustomers] = useState<CustomerWithStats[]>([]);
  const [contactsByCustomer, setContactsByCustomer] = useState<Map<string, CustomerContactSummary[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(false);

    await supabase.auth.getSession();

    const [customersRes, projectsRes, revenuesRes, contactsRes] = await Promise.all([
      supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("projects").select("id, customer_id").limit(1000),
      supabase.from("revenues").select("project_id, total_amount").limit(1000),
      supabase.from("customer_contacts").select("customer_id, name, position, phone, email").limit(5000),
    ]);

    if (customersRes.error) {
      console.error("고객 목록 조회 실패:", customersRes.error.message);
      toast.error("고객 목록 조회에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setError(true);
      setLoading(false);
      return;
    }

    if (contactsRes.error) {
      console.error("고객 담당자 조회 실패:", contactsRes.error.message);
    }

    const contactsMap = new Map<string, CustomerContactSummary[]>();
    for (const contact of contactsRes.data ?? []) {
      if (!contact.customer_id) continue;
      const list = contactsMap.get(contact.customer_id) ?? [];
      list.push({
        name: contact.name,
        position: contact.position,
        phone: contact.phone,
        email: contact.email,
      });
      contactsMap.set(contact.customer_id, list);
    }

    const projectCountMap = new Map<string, number>();
    const projectIdsByCustomer = new Map<string, Set<string>>();

    for (const project of projectsRes.data ?? []) {
      if (!project.customer_id) continue;
      projectCountMap.set(project.customer_id, (projectCountMap.get(project.customer_id) ?? 0) + 1);
      if (!projectIdsByCustomer.has(project.customer_id)) {
        projectIdsByCustomer.set(project.customer_id, new Set());
      }
      projectIdsByCustomer.get(project.customer_id)?.add(project.id);
    }

    const revenueByProject = new Map<string, number>();
    for (const revenue of revenuesRes.data ?? []) {
      if (!revenue.project_id) continue;
      revenueByProject.set(revenue.project_id, (revenueByProject.get(revenue.project_id) ?? 0) + revenue.total_amount);
    }

    const enriched: CustomerWithStats[] = (customersRes.data ?? []).map((customer) => {
      const projectIds = projectIdsByCustomer.get(customer.id);
      let totalAmount = 0;

      if (projectIds) {
        for (const projectId of projectIds) {
          totalAmount += revenueByProject.get(projectId) ?? 0;
        }
      }

      return {
        ...customer,
        project_count: projectCountMap.get(customer.id) ?? 0,
        project_total_amount: totalAmount,
      };
    });

    setCustomers(enriched);
    setContactsByCustomer(contactsMap);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCustomers();
  }, [fetchCustomers]);

  const filtered = customers.filter((customer) => {
    const keyword = search.trim();
    if (!keyword) return true;

    if (
      customer.name.includes(keyword) ||
      customer.representative_name?.includes(keyword) ||
      customer.business_number?.includes(keyword) ||
      customer.contact_name?.includes(keyword) ||
      customer.contact_email?.includes(keyword) ||
      customer.contact_phone?.includes(keyword)
    ) {
      return true;
    }

    const contacts = contactsByCustomer.get(customer.id);
    if (!contacts) return false;

    return contacts.some(
      (contact) =>
        contact.name?.includes(keyword) ||
        contact.position?.includes(keyword) ||
        contact.phone?.includes(keyword) ||
        contact.email?.includes(keyword),
    );
  });

  const totalProjectCount = customers.reduce((sum, customer) => sum + customer.project_count, 0);
  const totalRevenue = customers.reduce((sum, customer) => sum + customer.project_total_amount, 0);

  return (
    <PageShell>
      <PageHeader
        title="고객관리"
        funKey="customers"
        description="고객 정보를 기준으로 프로젝트와 누적 매출 흐름을 함께 확인합니다."
        actions={
          <Button onClick={() => router.push("/dashboard/customers/new")}>
            <Plus className="h-4 w-4" />
            고객 등록
          </Button>
        }
      />

      <StatsGrid className="xl:grid-cols-3">
        <StatCard label="총 고객 수" value={`${customers.length}곳`} description="현재 등록된 고객" icon={Building2} />
        <StatCard label="연결 프로젝트" value={`${totalProjectCount}건`} description="고객과 연결된 전체 프로젝트" icon={Handshake} tone="info" />
        <StatCard
          label="누적 매출"
          value={`${totalRevenue.toLocaleString("ko-KR")}원`}
          mobileValue={formatAmountInMan(totalRevenue)}
          description="고객별 프로젝트 합산 매출"
          icon={Wallet}
          tone="success"
          sensitive="amount"
        />
      </StatsGrid>

      <PageToolbar>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="고객명, 대표자명, 사업자번호, 담당자(이름·직책·전화·이메일)로 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-10"
            />
          </div>
          {search ? (
            <Button variant="ghost" onClick={() => setSearch("")}>
              검색 초기화
            </Button>
          ) : null}
        </div>
      </PageToolbar>

      {loading ? (
        <LoadingState label="고객 목록을 불러오는 중..." />
      ) : error ? (
        <ErrorState onRetry={() => void fetchCustomers()} />
      ) : (
        <CustomerTable customers={filtered} />
      )}
    </PageShell>
  );
}
