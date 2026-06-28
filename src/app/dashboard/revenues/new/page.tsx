"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

import { LoadingState, PageHeader, PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RevenueForm } from "@/components/revenue-form";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { Project, ProjectType, RevenueInsert } from "@/lib/types";

function NewRevenueContent() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const returnToParam = searchParams.get("returnTo");
  const returnTo = returnToParam && returnToParam.startsWith("/dashboard/") ? returnToParam : null;

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [projRes, typesRes] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("project_types").select("id, name").order("sort_order"),
      ]);

      if (cancelled) return;

      if (projRes.error) {
        console.error("프로젝트 목록 조회 실패:", projRes.error.message);
        toast.error("프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        setProjects([]);
      } else {
        setProjects(projRes.data ?? []);
      }

      setProjectTypes((typesRes.data ?? []) as ProjectType[]);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleSave = async (data: RevenueInsert) => {
    const isRefundRevenue = data.total_amount < 0;
    const cleaned = {
      ...data,
      project_id: data.project_id || null,
      revenue_date: data.revenue_date || null,
      expected_payment_date: data.expected_payment_date || null,
      paid_date: data.is_paid ? data.paid_date || null : null,
      is_tax_invoice_issued: isRefundRevenue ? false : data.is_tax_invoice_issued,
      tax_invoice_not_required: isRefundRevenue ? true : data.tax_invoice_not_required,
      tax_invoice_date:
        !isRefundRevenue && data.is_tax_invoice_issued ? data.tax_invoice_date || null : null,
      memo: data.memo || null,
    };

    const { data: inserted, error } = await supabase.from("revenues").insert(cleaned).select("id").single();

    if (error) {
      console.error("매출 등록 실패:", error.message);
      toast.error("매출 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    sendLog("CREATE_REVENUE", `매출 등록: ${data.title}`, {
      resource: "revenue",
      resource_id: inserted.id,
    });
    toast.success("매출이 등록되었습니다.");

    if (returnTo) {
      router.push(returnTo);
      return;
    }

    router.push(`/dashboard/revenues/${inserted.id}`);
  };

  if (loading) {
    return (
      <LoadingState
        title="매출 입력 화면을 준비하는 중입니다."
        description="연결 가능한 프로젝트 목록을 불러오고 있습니다."
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "매출관리", href: "/dashboard/revenues" },
          { label: "신규 등록" },
        ]}
        title="매출 등록"
        funKey="revenues"
        titleAccessory={projectId ? <Badge variant="secondary">프로젝트 연결 예정</Badge> : null}
        description="프로젝트에 연결된 매출과 입금 계획을 한 번에 입력합니다."
        actions={
          <Button variant="outline" asChild>
            <Link href={returnTo || "/dashboard/revenues"}>
              <ArrowLeft className="h-4 w-4" />
              목록으로
            </Link>
          </Button>
        }
      />

      <RevenueForm
        revenue={null}
        projectId={projectId}
        projects={projects}
        projectTypes={projectTypes}
        allowProjectSelection
        onSave={handleSave}
        onCancel={() => router.push(returnTo || "/dashboard/revenues")}
      />
    </PageShell>
  );
}

export default function NewRevenuePage() {
  return (
    <Suspense
      fallback={
        <LoadingState
          title="매출 입력 화면을 준비하는 중입니다."
          description="필수 데이터를 불러오고 있습니다."
        />
      }
    >
      <NewRevenueContent />
    </Suspense>
  );
}
