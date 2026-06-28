"use client";

import { useCallback } from "react";
import { FolderKanban, Users } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SortableTableHead, sortData, useSortState } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMasking } from "@/components/masking-provider";
import { getProjectAssigneeNames } from "@/lib/project-assignees";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDragSelect, type DragSelectMode } from "@/lib/use-drag-select";

interface ProjectTableProps {
  projects: Project[];
  revenueTotals?: Record<string, number>;
  selectedIds: Set<string>;
  onToggleProject: (id: string, checked: boolean) => void;
  onToggleAllVisible: (visibleIds: string[], checked: boolean) => void;
  onCommitDragSelect: (ids: string[], mode: DragSelectMode) => void;
  onOpenStatusModal: (project: Project) => void;
  updatingProjectId?: string | null;
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  진행예정: "outline",
  진행중: "default",
  완료: "secondary",
  보류: "outline",
  취소: "destructive",
};

function formatAmount(amount: number) {
  return amount > 0 ? `${amount.toLocaleString("ko-KR")}원` : "-";
}

export function ProjectTable({
  projects,
  revenueTotals = {},
  selectedIds,
  onToggleProject,
  onToggleAllVisible,
  onCommitDragSelect,
  onOpenStatusModal,
  updatingProjectId = null,
}: ProjectTableProps) {
  const router = useRouter();
  const { sort, toggle } = useSortState();
  const { mask } = useMasking();

  const sorted = sortData(projects, sort, (item, key) => {
    switch (key) {
      case "project_number":
        return item.project_number;
      case "name":
        return item.name;
      case "customer":
        return item.customers?.name ?? item.client;
      case "type":
        return item.project_types?.name;
      case "status":
        return item.status;
      case "manager":
        return getProjectAssigneeNames(item).join(", ");
      case "total_amount":
        return revenueTotals[item.id] ?? 0;
      case "start_date":
        return item.start_date;
      case "end_date":
        return item.end_date;
      default:
        return null;
    }
  });

  const visibleIds = sorted.map((p) => p.id);
  const isProjectSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const dragSelect = useDragSelect({
    orderedTaskIds: visibleIds,
    isSelected: isProjectSelected,
    onCommit: onCommitDragSelect,
  });

  const visibleSelectedCount = visibleIds.reduce(
    (count, id) => (selectedIds.has(id) ? count + 1 : count),
    0
  );
  const headerSelectionState: boolean | "indeterminate" =
    visibleIds.length > 0 && visibleSelectedCount === visibleIds.length
      ? true
      : visibleSelectedCount > 0
        ? "indeterminate"
        : false;

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="등록된 프로젝트가 없습니다."
        description="새 프로젝트를 추가하면 고객, 일정, 매출 흐름을 연결해서 관리할 수 있습니다."
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {sorted.map((project) => {
          const assignees = getProjectAssigneeNames(project);
          const customerLabel = project.customers?.name ?? project.client ?? "고객 미지정";
          const isSelected = selectedIds.has(project.id);
          const isInDraft = dragSelect.draftIds.has(project.id);
          const effectiveSelected = isInDraft ? dragSelect.mode === "add" : isSelected;

          return (
            <div
              key={project.id}
              className={cn(
                "surface-subtle flex items-start gap-2 p-3 sm:p-4",
                isSelected && "ring-2 ring-primary/30"
              )}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={effectiveSelected}
                  onCheckedChange={(value) => onToggleProject(project.id, value === true)}
                  aria-label={`${project.name} 선택`}
                />
              </div>
              <div
                role="button"
                tabIndex={0}
                className="flex-1 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/dashboard/projects/${project.id}`);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {project.project_number || "NO CODE"}
                    </p>
                    <p className="font-semibold text-foreground">{mask("title", project.name)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenStatusModal(project);
                    }}
                    disabled={updatingProjectId === project.id}
                    className="shrink-0"
                  >
                    <Badge
                      variant={statusVariant[project.status] ?? "outline"}
                      className="cursor-pointer transition-opacity hover:opacity-80"
                    >
                      {project.status}
                    </Badge>
                  </button>
                </div>

                <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
                  <span>{mask("customer_name", customerLabel)}</span>
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    <span>
                      {assignees.length > 0
                        ? assignees.map((n) => mask("name", n)).join(", ")
                        : "담당자 미지정"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{project.project_types?.name ?? "유형 미지정"}</span>
                    <span className="font-medium text-foreground">
                      {(revenueTotals[project.id] ?? 0) > 0
                        ? mask("amount", formatAmount(revenueTotals[project.id] ?? 0))
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="surface-panel hidden overflow-hidden p-1 md:block">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 px-2">
                <Checkbox
                  checked={headerSelectionState}
                  onCheckedChange={(value) => onToggleAllVisible(visibleIds, value === true)}
                  aria-label="보이는 프로젝트 전체 선택"
                />
              </TableHead>
              <SortableTableHead sortKey="name" currentSort={sort} onSort={toggle}>
                프로젝트명
              </SortableTableHead>
              <SortableTableHead sortKey="customer" currentSort={sort} onSort={toggle}>
                고객
              </SortableTableHead>
              <SortableTableHead sortKey="type" currentSort={sort} onSort={toggle}>
                유형
              </SortableTableHead>
              <SortableTableHead sortKey="status" currentSort={sort} onSort={toggle}>
                상태
              </SortableTableHead>
              <SortableTableHead sortKey="manager" currentSort={sort} onSort={toggle}>
                담당자
              </SortableTableHead>
              <SortableTableHead
                sortKey="total_amount"
                currentSort={sort}
                onSort={toggle}
                className="text-right"
              >
                누적 매출
              </SortableTableHead>
              <SortableTableHead sortKey="start_date" currentSort={sort} onSort={toggle}>
                시작일
              </SortableTableHead>
              <SortableTableHead sortKey="end_date" currentSort={sort} onSort={toggle}>
                종료일
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((project) => {
              const isSelected = selectedIds.has(project.id);
              const isInDraft = dragSelect.draftIds.has(project.id);
              const effectiveSelected = isInDraft ? dragSelect.mode === "add" : isSelected;
              const draftRemove = isInDraft && dragSelect.mode === "remove";
              const draftAdd = isInDraft && dragSelect.mode === "add";
              return (
                <TableRow
                  key={project.id}
                  data-task-id={project.id}
                  className={cn(
                    "cursor-pointer",
                    isSelected && !draftRemove && "bg-primary/5",
                    draftAdd && "bg-sky-50",
                    draftRemove && "bg-rose-50"
                  )}
                  onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                >
                  <TableCell className="w-12 px-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={effectiveSelected}
                      onCheckedChange={(value) => onToggleProject(project.id, value === true)}
                      aria-label={`${project.name} 선택`}
                    />
                  </TableCell>
                  <TableCell className="min-w-[280px] font-medium whitespace-normal break-words">
                    {project.project_number
                      ? `[${project.project_number}] ${mask("title", project.name)}`
                      : mask("title", project.name)}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {project.customers?.name
                      ? mask("customer_name", project.customers.name)
                      : project.client
                        ? mask("customer_name", project.client)
                        : "-"}
                  </TableCell>
                  <TableCell>{project.project_types?.name ?? "-"}</TableCell>
                  <TableCell
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => dragSelect.beginDrag(project.id, e)}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenStatusModal(project)}
                      disabled={updatingProjectId === project.id}
                      className={cn(
                        "inline-flex",
                        updatingProjectId === project.id && "cursor-not-allowed opacity-60"
                      )}
                    >
                      <Badge
                        variant={statusVariant[project.status] ?? "outline"}
                        className="cursor-pointer transition-opacity hover:opacity-80"
                      >
                        {project.status}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="max-w-[100px] truncate">
                    {(() => {
                      const names = getProjectAssigneeNames(project);
                      return names.length > 0
                        ? names.map((n) => mask("name", n)).join(", ")
                        : "-";
                    })()}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {(revenueTotals[project.id] ?? 0) > 0
                      ? mask("amount", formatAmount(revenueTotals[project.id] ?? 0))
                      : "-"}
                  </TableCell>
                  <TableCell>{project.start_date ?? "-"}</TableCell>
                  <TableCell>{project.end_date ?? "-"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </div>
    </>
  );
}
