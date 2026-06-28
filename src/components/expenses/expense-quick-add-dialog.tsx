"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ExpenseFormBody,
  type ExpenseTypeOption,
  type VendorOption,
} from "@/components/expenses/expense-form-body";
import { createClient } from "@/lib/supabase/client";
import type { Expense, ExpenseInsert, Project } from "@/lib/types";

interface ExpenseQuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
  projectId?: string | null;
  /** 부모가 expenseTypes를 이미 갖고 있다면 전달. 비우면 자체 fetch */
  expenseTypes?: ExpenseTypeOption[];
  allowProjectSelection?: boolean;
  onSave: (data: ExpenseInsert) => Promise<void>;
  onSaveAndContinue?: (data: ExpenseInsert) => Promise<void>;
}

export function ExpenseQuickAddDialog({
  open,
  onOpenChange,
  expense = null,
  projectId = null,
  expenseTypes: expenseTypesProp,
  allowProjectSelection = false,
  onSave,
  onSaveAndContinue,
}: ExpenseQuickAddDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [fetchedExpenseTypes, setFetchedExpenseTypes] = useState<ExpenseTypeOption[]>([]);
  const expenseTypes = expenseTypesProp ?? fetchedExpenseTypes;
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const vendorsPromise = supabase
        .from("customers")
        .select(
          "id, name, customer_type, tax_category, default_withholding_rate, bank_name, account_number, account_holder, contact_phone, is_vendor"
        )
        .order("is_vendor", { ascending: false })
        .order("name");
      const projectsPromise = allowProjectSelection
        ? supabase.from("projects").select("*").order("created_at", { ascending: false }).limit(500)
        : null;
      const typesPromise = !expenseTypesProp
        ? supabase.from("expense_types").select("*").order("sort_order")
        : null;

      const [vendorsRes, projectsRes, typesRes] = await Promise.all([
        vendorsPromise,
        projectsPromise,
        typesPromise,
      ]);
      if (cancelled) return;
      setVendors((vendorsRes.data ?? []) as VendorOption[]);
      if (projectsRes) {
        setProjects((projectsRes.data ?? []) as Project[]);
      }
      if (typesRes) {
        setFetchedExpenseTypes((typesRes.data ?? []) as ExpenseTypeOption[]);
      }
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, supabase, allowProjectSelection, expenseTypesProp]);

  const handleSave = async (data: ExpenseInsert) => {
    await onSave(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{expense ? "매입 수정" : "매입 등록"}</DialogTitle>
          <DialogDescription>
            강사비, 외주비, 운영비 등 매입을 기록합니다.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            불러오는 중...
          </div>
        ) : (
          <ExpenseFormBody
            expense={expense}
            projectId={projectId}
            projects={projects}
            expenseTypes={expenseTypes}
            vendors={vendors}
            allowProjectSelection={allowProjectSelection}
            onSave={handleSave}
            onSaveAndContinue={onSaveAndContinue}
            onCancel={() => onOpenChange(false)}
            onVendorsChange={setVendors}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
