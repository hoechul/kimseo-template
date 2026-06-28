"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Customer, Employee, Project, ProjectInsert, ProjectType } from "@/lib/types";

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  customers: Customer[];
  employees: Employee[];
  projectTypes: ProjectType[];
  onSave: (data: ProjectInsert, assigneeIds: string[]) => Promise<void>;
  initialCustomerId?: string | null;
}

const emptyForm: ProjectInsert = {
  name: "",
  customer_id: null,
  type_id: null,
  client: "",
  description: "",
  status: "진행예정",
  start_date: "",
  end_date: "",
  manager: null,
};

const statusOptions = ["진행예정", "진행중", "완료", "보류", "취소"];

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  customers,
  employees,
  projectTypes,
  onSave,
  initialCustomerId = null,
}: ProjectDialogProps) {
  const [form, setForm] = useState<ProjectInsert>(emptyForm);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name,
        customer_id: project.customer_id,
        type_id: project.type_id,
        client: project.client ?? "",
        description: project.description ?? "",
        status: project.status,
        start_date: project.start_date ?? "",
        end_date: project.end_date ?? "",
        manager: project.manager,
      });
      setAssigneeIds(project.assignees?.map((assignee) => assignee.employee_id) ?? []);
      return;
    }

    const initialCustomer = customers.find((customer) => customer.id === initialCustomerId) ?? null;
    setForm({
      ...emptyForm,
      customer_id: initialCustomerId,
      client: initialCustomer?.name ?? "",
      type_id: projectTypes.length > 0 ? projectTypes[0].id : null,
    });
    setAssigneeIds([]);
  }, [customers, initialCustomerId, open, project, projectTypes]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === form.customer_id) ?? null,
    [customers, form.customer_id]
  );

  const update = (field: keyof ProjectInsert, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value as ProjectInsert[typeof field],
    }));
  };

  const handleCustomerSelect = (customerId: string) => {
    if (!customerId) {
      setForm((prev) => ({ ...prev, customer_id: null }));
      return;
    }

    const found = customers.find((customer) => customer.id === customerId);
    setForm((prev) => ({
      ...prev,
      customer_id: customerId,
      client: found?.name ?? prev.client,
    }));
  };

  const toggleAssignee = (employeeId: string, checked: boolean) => {
    setAssigneeIds((prev) =>
      checked ? [...prev, employeeId] : prev.filter((id) => id !== employeeId)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const selectedNames = employees
        .filter((employee) => assigneeIds.includes(employee.id))
        .map((employee) => employee.name);

      await onSave(
        {
          ...form,
          manager: selectedNames.length > 0 ? selectedNames.join(", ") : null,
        },
        assigneeIds
      );
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "프로젝트 수정" : "새 프로젝트 등록"}</DialogTitle>
          {project && (
            <p className="text-sm text-muted-foreground">프로젝트번호: {project.project_number}</p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="max-h-[85vh] overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">프로젝트명 *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="프로젝트명을 입력하세요"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>고객</Label>
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerPopoverOpen}
                    className="h-9 w-full justify-between font-normal"
                  >
                    {selectedCustomer ? (
                      <span className="truncate">
                        {selectedCustomer.name}
                        {selectedCustomer.representative_name
                          ? ` · 대표 ${selectedCustomer.representative_name}`
                          : ""}
                        {selectedCustomer.business_number
                          ? ` · ${selectedCustomer.business_number}`
                          : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">고객을 검색하세요</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command
                    filter={(value, search) => {
                      const customer = customers.find((item) => item.id === value);
                      if (!customer) return 0;
                      const keyword = search.toLowerCase();
                      if (customer.name.toLowerCase().includes(keyword)) return 1;
                      if (customer.representative_name?.toLowerCase().includes(keyword)) return 1;
                      if (customer.business_number?.toLowerCase().includes(keyword)) return 1;
                      return 0;
                    }}
                  >
                    <CommandInput placeholder="고객명, 대표자명 또는 사업자번호 검색..." />
                    <CommandList>
                      <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                      <CommandGroup>
                        {customers.map((customer) => (
                          <CommandItem
                            key={customer.id}
                            value={customer.id}
                            onSelect={(value) => {
                              handleCustomerSelect(value === form.customer_id ? "" : value);
                              setCustomerPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                form.customer_id === customer.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="truncate">
                              {customer.name}
                              {customer.representative_name
                                ? ` · 대표 ${customer.representative_name}`
                                : ""}
                              {customer.business_number ? ` · ${customer.business_number}` : ""}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedCustomer ? (
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => handleCustomerSelect("")}
                >
                  <X className="h-3 w-3" />
                  선택 해제
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  고객을 지정하지 않으면 기존 고객명(client)만 저장됩니다.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="type_id">유형 *</Label>
              <select
                id="type_id"
                value={form.type_id ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, type_id: e.target.value || null }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              >
                {projectTypes.map((projectType) => (
                  <option key={projectType.id} value={projectType.id}>
                    {projectType.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">상태</Label>
              <select
                id="status"
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="start_date">시작일</Label>
              <Input
                id="start_date"
                type="date"
                value={form.start_date ?? ""}
                onChange={(e) => update("start_date", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_date">종료일</Label>
              <Input
                id="end_date"
                type="date"
                value={form.end_date ?? ""}
                onChange={(e) => update("end_date", e.target.value)}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>담당자</Label>
              <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                {employees.map((employee) => (
                  <label
                    key={employee.id}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={assigneeIds.includes(employee.id)}
                      onCheckedChange={(checked) => toggleAssignee(employee.id, !!checked)}
                    />
                    <span>{employee.name}</span>
                    {employee.department && (
                      <span className="text-xs text-muted-foreground">{employee.department}</span>
                    )}
                  </label>
                ))}
                {employees.length === 0 && (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    등록된 직원이 없습니다.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">설명</Label>
              <textarea
                id="description"
                value={form.description ?? ""}
                onChange={(e) => update("description", e.target.value)}
                placeholder="프로젝트 설명"
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "저장 중..." : project ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
