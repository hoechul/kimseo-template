"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendLog } from "@/lib/log-client";
import { Button } from "@/components/ui/button";
import { RevenueForm } from "@/components/revenue-form";
import { LoadingState } from "@/components/page-shell";
import type { Project, ProjectType, Revenue, RevenueInsert } from "@/lib/types";

export default function EditRevenuePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const revenueId = params.id as string;
  const returnToParam = searchParams.get("returnTo");
  const returnTo =
    returnToParam && returnToParam.startsWith("/dashboard/")
      ? returnToParam
      : null;
  const supabase = useMemo(() => createClient(), []);

  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    await supabase.auth.getSession();

    const [revenueRes, projectsRes, typesRes] = await Promise.all([
      supabase
        .from("revenues")
        .select("*")
        .eq("id", revenueId)
        .single(),
      supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("project_types")
        .select("id, name")
        .order("sort_order"),
    ]);

    if (revenueRes.error) {
      console.error("매출 정보 조회 실패:", revenueRes.error.message);
      toast.error("매출 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setRevenue(null);
    } else {
      setRevenue(revenueRes.data);
    }

    if (projectsRes.error) {
      console.error("프로젝트 목록 조회 실패:", projectsRes.error.message);
      toast.error("프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setProjects([]);
    } else {
      setProjects(projectsRes.data ?? []);
    }

    setProjectTypes((typesRes.data ?? []) as ProjectType[]);

    setLoading(false);
  }, [supabase, revenueId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

    const { error } = await supabase
      .from("revenues")
      .update(cleaned)
      .eq("id", revenueId);

    if (error) {
      console.error("매출 수정 실패:", error.message);
      toast.error("매출 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    sendLog("UPDATE_REVENUE", `매출 수정: ${data.title}`, {
      resource: "revenue",
      resource_id: revenueId,
    });
    toast.success("매출이 수정되었습니다.");

    router.push(returnTo || `/dashboard/revenues/${revenueId}`);
  };

  const handleCancel = () => {
    router.push(returnTo || `/dashboard/revenues/${revenueId}`);
  };

  if (loading) {
    return <LoadingState title="매출 정보를 불러오는 중입니다." />;
  }

  if (!revenue) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">매출 항목을 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/revenues")}>목록으로 돌아가기</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-1">
        <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">매출 수정</h3>
        <p className="text-sm text-muted-foreground">
          모바일에서도 스크롤 가능한 개별 화면에서 매출을 수정합니다.
        </p>
      </div>

      <RevenueForm
        revenue={revenue}
        projectId={revenue.project_id}
        projects={projects}
        projectTypes={projectTypes}
        allowProjectSelection
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  );
}
