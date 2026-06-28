"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { RevenueDetailDialog } from "@/components/revenue-detail-dialog";
import { RevenueDialog } from "@/components/revenue-dialog";
import { Button } from "@/components/ui/button";
import { useMasking } from "@/components/masking-provider";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import { formatKstDateLabel } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Project, Revenue, RevenueInsert } from "@/lib/types";

interface TabRevenuesProps {
  project: Project;
}

function formatKrw(amount: number) {
  return new Intl.NumberFormat("ko-KR").format(amount);
}

export function TabRevenues({ project }: TabRevenuesProps) {
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRevenue, setEditingRevenue] = useState<Revenue | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRevenue, setSelectedRevenue] = useState<Revenue | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("revenues")
      .select("*")
      .eq("project_id", project.id)
      .order("revenue_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("매출 목록을 불러오지 못했습니다.");
      return;
    }
    setRevenues((data ?? []) as Revenue[]);
  }, [project.id, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`workspace-revenues-${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "revenues",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [project.id, supabase, refresh]);

  const handleSave = async (data: RevenueInsert) => {
    const isRefund = data.total_amount < 0;
    const cleaned = {
      ...data,
      project_id: project.id,
      revenue_date: data.revenue_date || null,
      expected_payment_date: data.expected_payment_date || null,
      paid_date: data.is_paid ? data.paid_date || null : null,
      is_tax_invoice_issued: isRefund ? false : data.is_tax_invoice_issued,
      tax_invoice_not_required: isRefund ? true : data.tax_invoice_not_required,
      tax_invoice_date:
        !isRefund && data.is_tax_invoice_issued ? data.tax_invoice_date || null : null,
      memo: data.memo || null,
    };

    if (editingRevenue) {
      const { data: updated, error } = await supabase
        .from("revenues")
        .update(cleaned)
        .eq("id", editingRevenue.id)
        .select("*")
        .single();
      if (error) {
        toast.error("매출 수정에 실패했습니다.");
        throw error;
      }
      toast.success("매출이 수정되었습니다.");
      sendLog("UPDATE_REVENUE", `매출 수정: ${data.title}`, {
        resource: "revenue",
        resource_id: editingRevenue.id,
      });
      await refresh();
      if (updated) {
        setSelectedRevenue(updated as Revenue);
        setDetailOpen(true);
      }
      return;
    }

    const { data: inserted, error } = await supabase
      .from("revenues")
      .insert(cleaned)
      .select("id")
      .single();
    if (error) {
      toast.error("매출 등록에 실패했습니다.");
      throw error;
    }
    toast.success("매출이 등록되었습니다.");
    sendLog("CREATE_REVENUE", `매출 등록: ${data.title}`, {
      resource: "revenue",
      resource_id: inserted.id,
    });
    await refresh();
  };

  const handleOpenDetail = (revenue: Revenue) => {
    setSelectedRevenue(revenue);
    setDetailOpen(true);
  };

  const handleEditFromDetail = () => {
    if (!selectedRevenue) return;
    setEditingRevenue(selectedRevenue);
    setDetailOpen(false);
    setEditDialogOpen(true);
  };

  const handleDeleteFromDetail = async () => {
    if (!selectedRevenue) return;
    if (!confirm("이 매출 항목을 삭제하시겠습니까?")) return;

    setDeleting(true);
    const { error } = await supabase
      .from("revenues")
      .delete()
      .eq("id", selectedRevenue.id);
    if (error) {
      toast.error("매출 삭제에 실패했습니다.");
      setDeleting(false);
      return;
    }
    toast.success("매출 항목을 삭제했습니다.");
    sendLog("DELETE_REVENUE", `매출 삭제: ${selectedRevenue.title}`, {
      resource: "revenue",
      resource_id: selectedRevenue.id,
    });
    setDeleting(false);
    setDetailOpen(false);
    setSelectedRevenue(null);
    await refresh();
  };

  const handleRevenueUpdated = (updatedRevenue: Revenue) => {
    setSelectedRevenue(updatedRevenue);
    setRevenues((prev) =>
      prev.map((revenue) => (revenue.id === updatedRevenue.id ? updatedRevenue : revenue))
    );
    void refresh();
  };

  const totalAmount = revenues.reduce((sum, r) => sum + (r.total_amount ?? 0), 0);
  const unpaidAmount = revenues
    .filter((r) => !r.is_paid)
    .reduce((sum, r) => sum + (r.total_amount ?? 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          총 {mask("amount", `${formatKrw(totalAmount)}원`)} · 미입금 {mask("amount", `${formatKrw(unpaidAmount)}원`)}
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingRevenue(null);
            setEditDialogOpen(true);
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          매출 등록
        </Button>
      </div>

      {loading ? (
        <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          불러오는 중…
        </div>
      ) : revenues.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          등록된 매출이 없습니다.
        </div>
      ) : (
        <div className="space-y-1">
          {revenues.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleOpenDetail(r)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-left transition-colors hover:bg-accent/50",
                r.is_paid ? "bg-emerald-50/40" : "bg-background/60"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {mask("title", r.title)}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.revenue_date ? formatKstDateLabel(r.revenue_date) : "매출일 미정"}
                  {r.is_paid
                    ? ` · 입금 ${r.paid_date ? formatKstDateLabel(r.paid_date) : "—"}`
                    : r.expected_payment_date
                    ? ` · 예정 ${formatKstDateLabel(r.expected_payment_date)}`
                    : ""}
                </div>
              </div>
              <div className="shrink-0 text-sm font-semibold text-foreground">
                {mask("amount", `${formatKrw(r.total_amount ?? 0)}원`)}
              </div>
            </button>
          ))}
        </div>
      )}

      <RevenueDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingRevenue(null);
        }}
        revenue={editingRevenue}
        projectId={project.id}
        onSave={handleSave}
        onSaveAndContinue={editingRevenue ? undefined : handleSave}
      />

      <RevenueDetailDialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedRevenue(null);
        }}
        revenue={selectedRevenue}
        onEdit={handleEditFromDetail}
        onDelete={handleDeleteFromDetail}
        onRevenueUpdated={handleRevenueUpdated}
        deleting={deleting}
      />
    </div>
  );
}
