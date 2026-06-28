"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  PageToolbar,
} from "@/components/page-shell";
import { TaskCreateDialog } from "@/components/task-create-dialog";
import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { TaskBulkActionBar } from "@/components/tasks/task-bulk-action-bar";
import { TasksFilterBar } from "@/components/tasks/tasks-filter-bar";
import { TasksDayView } from "@/components/tasks/tasks-day-view";
import { TasksKanbanView } from "@/components/tasks/tasks-kanban-view";
import { TasksListView } from "@/components/tasks/tasks-list-view";
import { TasksWeekView } from "@/components/tasks/tasks-week-view";
import {
  TaskAssigneeDialog,
  TaskDueDateDialog,
  TaskPriorityDialog,
  TaskProjectLinkDialog,
  TaskQuickAddDialog,
  TaskStatusChangeDialog,
} from "@/components/tasks/tasks-modals";
import { TasksViewTabs } from "@/components/tasks/tasks-view-tabs";
import { Button } from "@/components/ui/button";
import { useTasksData } from "@/lib/hooks/use-tasks-data";
import { useTasksFilters } from "@/lib/hooks/use-tasks-filters";
import { notifyTaskCreated, notifyTaskStatusChanged } from "@/lib/tasks/slack-notify";
import { useTaskViewMode } from "@/lib/tasks/view-mode";
import { sendLog } from "@/lib/log-client";
import {
  buildTaskAssigneeRows,
  getTaskAssigneeIds,
  getTaskAssigneeNames,
  normalizeTaskAssigneeIds,
} from "@/lib/task-assignees";
import { bulkUpdateTasks, type BulkTaskPatch } from "@/lib/task-mutations";
import {
  normalizeTaskStatus,
  type TaskDisplayStatus,
  type TaskStatusTab,
} from "@/lib/task-status";
import { useDragSelect, type DragSelectMode } from "@/lib/use-drag-select";
import type { Task, TaskPriority } from "@/lib/types";

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksPageContent />
    </Suspense>
  );
}

function TasksPageContent() {
  const {
    supabase,
    tasks,
    setTasks,
    employees,
    projects,
    currentEmployeeId,
    loading,
    error,
    fetchData,
    refreshTasks,
  } = useTasksData();
  const {
    search,
    setSearch,
    statusFilters,
    toggleStatusFilter,
    clearStatusFilters,
    filterMode,
    selectedEmployeeIds,
    handleFilterChange,
    applyInitialAssignees,
    hideDone,
    toggleHideDone,
  } = useTasksFilters();
  const { view, setView } = useTaskViewMode();

  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddStatusOverride, setQuickAddStatusOverride] = useState<TaskDisplayStatus | null>(null);
  const [statusModalTask, setStatusModalTask] = useState<Task | null>(null);
  const [dueDateModalTask, setDueDateModalTask] = useState<Task | null>(null);
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [priorityModalTask, setPriorityModalTask] = useState<Task | null>(null);
  const [assigneeModalTask, setAssigneeModalTask] = useState<Task | null>(null);
  const [assigneeDraft, setAssigneeDraft] = useState<string[]>([]);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [projectLinkTask, setProjectLinkTask] = useState<Task | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set());
  const [bulkPending, setBulkPending] = useState(false);

  useEffect(() => {
    if (loading) return;
    applyInitialAssignees(currentEmployeeId, employees);
  }, [applyInitialAssignees, currentEmployeeId, employees, loading]);

  const assigneeMap = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((employee) => map.set(employee.id, employee.name));
    return map;
  }, [employees]);

  const currentEmployeeName = useMemo(
    () => employees.find((employee) => employee.id === currentEmployeeId)?.name ?? null,
    [employees, currentEmployeeId]
  );

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );

  /** statusFilters를 제외한 모든 조건(검색, 담당자, 완료 숨김)을 적용한 결과.
   * 상태 탭 숫자는 이 결과에서 집계해 "담당자/검색을 걸면 탭 숫자도 함께 줄어든다"를 보장. */
  const baseFilteredTasks = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return tasks.filter((task) => {
      const normalizedStatus = normalizeTaskStatus(task.status);
      if (hideDone && (normalizedStatus === "완료" || normalizedStatus === "취소")) return false;

      const assigneeIds = getTaskAssigneeIds(task);
      if (filterMode === "unassigned" && assigneeIds.length > 0) return false;
      if (filterMode === "custom") {
        if (assigneeIds.length === 0) return false;
        if (!assigneeIds.some((assigneeId) => selectedEmployeeIds.includes(assigneeId))) return false;
      }

      if (!keyword) return true;

      const assigneeName = getTaskAssigneeNames(task, assigneeMap).join(", ").toLowerCase();
      return (
        task.title.toLowerCase().includes(keyword) ||
        (task.description ?? "").toLowerCase().includes(keyword) ||
        normalizedStatus.toLowerCase().includes(keyword) ||
        task.priority.toLowerCase().includes(keyword) ||
        assigneeName.includes(keyword)
      );
    });
  }, [tasks, hideDone, filterMode, selectedEmployeeIds, search, assigneeMap]);

  const filteredTasks = useMemo(() => {
    if (statusFilters.size === 0) return baseFilteredTasks;
    return baseFilteredTasks.filter((task) =>
      statusFilters.has(normalizeTaskStatus(task.status))
    );
  }, [baseFilteredTasks, statusFilters]);

  const unassignedCount = tasks.filter((task) => getTaskAssigneeIds(task).length === 0).length;

  const employeeTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of tasks) {
      for (const assigneeId of getTaskAssigneeIds(task)) {
        counts[assigneeId] = (counts[assigneeId] ?? 0) + 1;
      }
    }
    return counts;
  }, [tasks]);

  const statusCounts = useMemo(() => {
    const counts: Record<TaskStatusTab, number> = {
      all: baseFilteredTasks.length,
      백로그: 0,
      "할 일": 0,
      진행중: 0,
      완료: 0,
      취소: 0,
    };

    for (const task of baseFilteredTasks) {
      counts[normalizeTaskStatus(task.status)] += 1;
    }

    return counts;
  }, [baseFilteredTasks]);

  const visibleTaskIds = useMemo(() => filteredTasks.map((task) => task.id), [filteredTasks]);
  const visibleSelectedCount = useMemo(
    () => visibleTaskIds.reduce((count, id) => (selectedTaskIds.has(id) ? count + 1 : count), 0),
    [selectedTaskIds, visibleTaskIds]
  );
  const hiddenSelectedCount = selectedTaskIds.size - visibleSelectedCount;
  const headerSelectionState: boolean | "indeterminate" =
    visibleTaskIds.length > 0 && visibleSelectedCount === visibleTaskIds.length
      ? true
      : visibleSelectedCount > 0
        ? "indeterminate"
        : false;

  const quickAddStatus: TaskDisplayStatus =
    quickAddStatusOverride
    ?? (statusFilters.size === 1 ? (Array.from(statusFilters)[0] ?? "할 일") : "할 일");
  const quickAddAssigneeIds = useMemo(() => {
    if (filterMode === "custom") return normalizeTaskAssigneeIds(selectedEmployeeIds);
    if (filterMode === "unassigned") return [];
    return currentEmployeeId ? [currentEmployeeId] : [];
  }, [currentEmployeeId, filterMode, selectedEmployeeIds]);
  const quickAddAssigneeNames = useMemo(() => {
    const names = quickAddAssigneeIds
      .map((employeeId) => assigneeMap.get(employeeId) ?? null)
      .filter((name): name is string => Boolean(name));

    if (names.length > 0) return names;
    if (filterMode === "all" && currentEmployeeName) return [currentEmployeeName];
    return [];
  }, [assigneeMap, currentEmployeeName, filterMode, quickAddAssigneeIds]);
  const quickAddAssigneeHint = useMemo(() => {
    if (filterMode === "custom") {
      return quickAddAssigneeNames.length > 1
        ? "현재 선택된 담당자 모두에게 배정됩니다."
        : "현재 선택된 담당자 기준으로 등록됩니다.";
    }
    if (filterMode === "unassigned") {
      return "현재 미배정 보기 기준으로 담당자 없이 등록됩니다.";
    }
    return quickAddAssigneeNames.length > 0
      ? "담당자 전체 보기에서는 로그인 사용자를 기본 담당자로 지정합니다."
      : "기본 담당자가 없어 미배정으로 등록됩니다.";
  }, [filterMode, quickAddAssigneeNames.length]);

  const handleQuickAdd = useCallback(async () => {
    const title = quickAddTitle.trim();
    if (!title) return;

    setQuickAddSaving(true);
    const createdBy = currentEmployeeId;
    const assigneeIds = quickAddAssigneeIds;
    const maxOrder = tasks.reduce((max, task) => Math.max(max, task.sort_order), 0);

    const { data: inserted, error } = await supabase
      .from("tasks")
      .insert({
        title,
        description: null,
        status: quickAddStatus,
        priority: "보통" as Task["priority"],
        assigned_to: assigneeIds[0] ?? null,
        due_date: null,
        created_by: createdBy,
        sort_order: maxOrder + 1,
      })
      .select("id")
      .single();

    if (error) {
      console.error("빠른추가 실패:", error.message);
      toast.error("할일 추가에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setQuickAddSaving(false);
      return;
    }

    if (assigneeIds.length > 0) {
      const { error: assigneeError } = await supabase
        .from("task_assignees")
        .insert(buildTaskAssigneeRows(inserted.id, assigneeIds));

      if (assigneeError) {
        await supabase.from("tasks").delete().eq("id", inserted.id);
        console.error("담당자 연결 실패:", assigneeError.message);
        toast.error("담당자 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
        setQuickAddSaving(false);
        return;
      }
    }

    sendLog("CREATE_TASK", `할일 빠른추가: ${title}`, {
      resource: "task",
      resource_id: inserted.id,
    });

    await notifyTaskCreated(inserted.id);

    setQuickAddTitle("");
    setQuickAddOpen(false);
    setQuickAddStatusOverride(null);
    await refreshTasks();
    setQuickAddSaving(false);
    toast.success("할일이 등록되었습니다.");
  }, [currentEmployeeId, quickAddAssigneeIds, quickAddStatus, quickAddTitle, refreshTasks, supabase, tasks]);

  const handleStatusChange = useCallback(async (taskId: string, nextStatus: TaskDisplayStatus) => {
    setUpdatingTaskId(taskId);

    // 낙관적 업데이트
    const prevTasks = tasks;
    const prevStatus = prevTasks.find((task) => task.id === taskId)?.status ?? null;
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, status: nextStatus } : task
      )
    );

    const { error } = await supabase
      .from("tasks")
      .update({ status: nextStatus })
      .eq("id", taskId);

    if (error) {
      console.error("할일 상태 변경 실패:", error.message);
      toast.error("할일 상태 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setTasks(prevTasks);
      setUpdatingTaskId(null);
      return false;
    }

    sendLog("UPDATE_TASK_STATUS", `할일 상태 변경 ${nextStatus}`, {
      resource: "task",
      resource_id: taskId,
    });

    if (prevStatus !== nextStatus) {
      await notifyTaskStatusChanged(taskId, prevStatus ?? null, nextStatus);
    }

    setUpdatingTaskId(null);
    return true;
  }, [supabase, tasks]);

  const openStatusModal = useCallback((task: Task) => {
    setStatusModalTask(task);
  }, []);

  const openDueDateModal = useCallback((task: Task) => {
    setDueDateModalTask(task);
    setDueDateDraft(task.due_date ?? "");
  }, []);

  const handleDueDateChange = useCallback(async () => {
    if (!dueDateModalTask) return;

    const taskId = dueDateModalTask.id;
    const nextDueDate = dueDateDraft || null;
    setUpdatingTaskId(taskId);

    // 낙관적 업데이트
    const prevTasks = tasks;
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, due_date: nextDueDate } : task
      )
    );
    setDueDateModalTask(null);

    const { error } = await supabase
      .from("tasks")
      .update({ due_date: nextDueDate })
      .eq("id", taskId);

    if (error) {
      console.error("할일 마감일 변경 실패:", error.message);
      toast.error("할일 마감일 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setTasks(prevTasks);
      setDueDateModalTask(null);
      setUpdatingTaskId(null);
      return;
    }

    sendLog("UPDATE_TASK_DUE_DATE", `할일 마감일 변경 ${nextDueDate ?? "없음"}`, {
      resource: "task",
      resource_id: taskId,
    });

    setUpdatingTaskId(null);
  }, [dueDateDraft, dueDateModalTask, supabase, tasks]);

  const handleStatusOptionClick = useCallback(async (nextStatus: TaskDisplayStatus) => {
    if (!statusModalTask) return;

    const updated = await handleStatusChange(statusModalTask.id, nextStatus);
    if (updated) {
      setStatusModalTask(null);
    }
  }, [handleStatusChange, statusModalTask]);

  const openPriorityModal = useCallback((task: Task) => {
    setPriorityModalTask(task);
  }, []);

  const handlePriorityChange = useCallback(async (nextPriority: TaskPriority) => {
    if (!priorityModalTask) return;

    const taskId = priorityModalTask.id;
    setUpdatingTaskId(taskId);

    // 낙관적 업데이트
    const prevTasks = tasks;
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, priority: nextPriority } : task
      )
    );
    setPriorityModalTask(null);

    const { error } = await supabase
      .from("tasks")
      .update({ priority: nextPriority })
      .eq("id", taskId);

    if (error) {
      console.error("우선순위 변경 실패:", error.message);
      toast.error("우선순위 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setTasks(prevTasks);
      setUpdatingTaskId(null);
      return;
    }

    sendLog("UPDATE_TASK", `할일 우선순위 변경 ${nextPriority}`, {
      resource: "task",
      resource_id: taskId,
    });

    setUpdatingTaskId(null);
  }, [priorityModalTask, supabase, tasks]);

  const openAssigneeModal = useCallback((task: Task) => {
    setAssigneeModalTask(task);
    setAssigneeDraft(getTaskAssigneeIds(task));
  }, []);

  const handleAssigneeChange = useCallback(async () => {
    if (!assigneeModalTask) return;

    const taskId = assigneeModalTask.id;
    const nextAssigneeIds = normalizeTaskAssigneeIds(assigneeDraft);
    setUpdatingTaskId(taskId);

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ assigned_to: nextAssigneeIds[0] ?? null })
      .eq("id", taskId);

    if (updateError) {
      console.error("담당자 변경 실패:", updateError.message);
      toast.error("담당자 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setUpdatingTaskId(null);
      return;
    }

    const { error: deleteError } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", taskId);

    if (deleteError) {
      console.error("담당자 갱신 실패:", deleteError.message);
      toast.error("담당자 갱신에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setUpdatingTaskId(null);
      return;
    }

    if (nextAssigneeIds.length > 0) {
      const { error: insertError } = await supabase
        .from("task_assignees")
        .insert(buildTaskAssigneeRows(taskId, nextAssigneeIds));

      if (insertError) {
        console.error("담당자 저장 실패:", insertError.message);
        toast.error("담당자 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
        setUpdatingTaskId(null);
        return;
      }
    }

    sendLog("UPDATE_TASK", `할일 담당자 변경`, {
      resource: "task",
      resource_id: taskId,
    });

    setAssigneeModalTask(null);
    setUpdatingTaskId(null);
    await refreshTasks();
  }, [assigneeDraft, assigneeModalTask, refreshTasks, supabase]);

  const handleProjectLink = useCallback(
    async (taskId: string, projectId: string | null) => {
      setUpdatingTaskId(taskId);

      // 낙관적 업데이트
      const prevTasks = tasks;
      const linked = projects.find((p) => p.id === projectId);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                project_id: projectId,
                projects: linked
                  ? { id: linked.id, project_number: linked.project_number, name: linked.name }
                  : null,
              }
            : t
        )
      );
      setProjectLinkTask(null);

      try {
        const { error: err } = await supabase
          .from("tasks")
          .update({ project_id: projectId })
          .eq("id", taskId);
        if (err) throw err;

        toast.success(projectId ? "프로젝트가 연결되었습니다." : "프로젝트 연결이 해제되었습니다.");
      } catch {
        toast.error("프로젝트 연결에 실패했습니다.");
        setTasks(prevTasks);
      } finally {
        setUpdatingTaskId(null);
      }
    },
    [supabase, projects, tasks]
  );

  const toggleTaskSelection = useCallback((taskId: string, checked: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTaskIds(new Set());
  }, []);

  const setSelectionForVisible = useCallback((visibleIds: string[], checked: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of visibleIds) next.add(id);
      } else {
        for (const id of visibleIds) next.delete(id);
      }
      return next;
    });
  }, []);

  const runBulkUpdate = useCallback(
    async (
      ids: string[],
      patch: BulkTaskPatch,
      successMessage: (count: number) => string,
      options: { clearSelectionOnSuccess?: boolean } = {}
    ) => {
      if (ids.length === 0) return;

      setBulkPending(true);
      const prevTasks = tasks;
      const idSet = new Set(ids);
      setTasks((prev) =>
        prev.map((task) => (idSet.has(task.id) ? { ...task, ...patch } : task))
      );

      const result = await bulkUpdateTasks(supabase, ids, patch);
      if (!result.ok) {
        console.error("할일 일괄 수정 실패:", result.error);
        toast.error("할일 일괄 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
        setTasks(prevTasks);
        setBulkPending(false);
        return;
      }

      toast.success(successMessage(ids.length));
      if (options.clearSelectionOnSuccess) setSelectedTaskIds(new Set());
      setBulkPending(false);
    },
    [supabase, tasks]
  );

  const handleBulkStatus = useCallback(
    (nextStatus: TaskDisplayStatus) =>
      runBulkUpdate(
        Array.from(selectedTaskIds),
        { status: nextStatus },
        (n) => `${n}건 상태를 ${nextStatus}(으)로 변경했습니다.`,
        { clearSelectionOnSuccess: true }
      ),
    [runBulkUpdate, selectedTaskIds]
  );

  const handleBulkDueDate = useCallback(
    (nextDueDate: string | null) =>
      runBulkUpdate(
        Array.from(selectedTaskIds),
        { due_date: nextDueDate },
        (n) => `${n}건 마감일을 ${nextDueDate ?? "없음"}(으)로 변경했습니다.`,
        { clearSelectionOnSuccess: true }
      ),
    [runBulkUpdate, selectedTaskIds]
  );

  const selectedTaskIdsRef = useRef(selectedTaskIds);
  useEffect(() => {
    selectedTaskIdsRef.current = selectedTaskIds;
  }, [selectedTaskIds]);
  const isTaskSelected = useCallback((id: string) => selectedTaskIdsRef.current.has(id), []);

  const handleDragSelectCommit = useCallback((ids: string[], mode: DragSelectMode) => {
    if (ids.length === 0) return;
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (mode === "add") {
        for (const id of ids) next.add(id);
      } else {
        for (const id of ids) next.delete(id);
      }
      return next;
    });
  }, []);

  const dragSelect = useDragSelect({
    orderedTaskIds: visibleTaskIds,
    isSelected: isTaskSelected,
    onCommit: handleDragSelectCommit,
  });

  const handleReorder = useCallback(
    async (reorderedVisibleTasks: Task[]) => {
      const visibleIds = new Set(reorderedVisibleTasks.map((task) => task.id));
      const reorderedQueue = [...reorderedVisibleTasks];
      const nextTasks = tasks
        .map((task) => {
          if (!visibleIds.has(task.id)) return task;
          return reorderedQueue.shift() ?? task;
        })
        .map((task, index) => ({
          ...task,
          sort_order: index,
        }));

      setTasks(nextTasks);

      await Promise.all(
        nextTasks.map((task) =>
          supabase
            .from("tasks")
            .update({ sort_order: task.sort_order })
            .eq("id", task.id)
        )
      );
    },
    [setTasks, supabase, tasks]
  );

  const handleKanbanMove = useCallback(
    async (movedId: string, toStatus: TaskDisplayStatus, toIndex: number) => {
      const movedTask = tasks.find((t) => t.id === movedId);
      if (!movedTask) return;

      const prevTasks = tasks;
      const remaining = tasks.filter((t) => t.id !== movedId);
      const columns: Record<TaskDisplayStatus, Task[]> = {
        백로그: [],
        "할 일": [],
        진행중: [],
        완료: [],
        취소: [],
      };
      for (const t of remaining) {
        columns[normalizeTaskStatus(t.status)].push(t);
      }
      const updatedMoved: Task = { ...movedTask, status: toStatus };
      const targetColumn = columns[toStatus];
      const safeIndex = Math.max(0, Math.min(toIndex, targetColumn.length));
      columns[toStatus] = [
        ...targetColumn.slice(0, safeIndex),
        updatedMoved,
        ...targetColumn.slice(safeIndex),
      ];

      const statusOrder: TaskDisplayStatus[] = ["백로그", "할 일", "진행중", "완료", "취소"];
      const flat: Task[] = [];
      for (const status of statusOrder) {
        for (const t of columns[status]) flat.push(t);
      }
      const withOrder = flat.map((t, i) => ({ ...t, sort_order: i }));
      setTasks(withOrder);

      const prevStatus = movedTask.status;
      try {
        const results = await Promise.all([
          supabase.from("tasks").update({ status: toStatus }).eq("id", movedId),
          ...withOrder.map((t) =>
            supabase.from("tasks").update({ sort_order: t.sort_order }).eq("id", t.id)
          ),
        ]);
        const firstError = results.find((r) => r.error);
        if (firstError?.error) throw firstError.error;

        sendLog("UPDATE_TASK_STATUS", `할일 상태 변경(칸반) ${toStatus}`, {
          resource: "task",
          resource_id: movedId,
        });

        if (prevStatus !== toStatus) {
          await notifyTaskStatusChanged(movedId, prevStatus ?? null, toStatus);
        }
      } catch (err) {
        console.error("칸반 이동 실패:", err);
        toast.error("할일 이동에 실패했습니다.");
        setTasks(prevTasks);
      }
    },
    [setTasks, supabase, tasks]
  );

  return (
    <PageShell>
      <PageHeader
        title="할일관리"
        funKey="tasks"
        description="상태 중심으로 할일을 관리하고, 담당자 기준으로 바로 추적할 수 있게 정리했습니다."
        actions={
          <Button onClick={() => setTaskDialogOpen(true)} className="w-full sm:w-auto" disabled={loading}>
            <Plus className="size-4" />
            할일 추가
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TasksViewTabs view={view} onChange={setView} />
      </div>

      <PageToolbar>
        <TasksFilterBar
          search={search}
          onSearchChange={setSearch}
          statusFilters={statusFilters}
          statusCounts={statusCounts}
          onToggleStatusFilter={toggleStatusFilter}
          onClearStatusFilters={clearStatusFilters}
          employees={employees}
          filterMode={filterMode}
          selectedEmployeeIds={selectedEmployeeIds}
          totalTasksCount={tasks.length}
          unassignedCount={unassignedCount}
          employeeTaskCounts={employeeTaskCounts}
          onFilterChange={handleFilterChange}
          hideDone={hideDone}
          onToggleHideDone={toggleHideDone}
        />
      </PageToolbar>

      {loading ? (
        <LoadingState
          title="할일을 불러오는 중입니다."
          description="담당자와 할일 목록을 준비하고 있습니다."
        />
      ) : error ? (
        <ErrorState
          description="할일 목록을 다시 가져오지 못했습니다."
          action={
            <Button variant="outline" size="sm" onClick={fetchData}>
              다시 시도
            </Button>
          }
        />
      ) : view === "kanban" ? (
        <TasksKanbanView
          tasks={filteredTasks}
          assigneeMap={assigneeMap}
          onNavigate={(id) => {
            setDetailTaskId(id);
            setDetailOpen(true);
          }}
          onOpenProjectLink={setProjectLinkTask}
          onMove={(taskId, toStatus, toIndex) =>
            void handleKanbanMove(taskId, toStatus, toIndex)
          }
          onQuickAdd={(status) => {
            setQuickAddTitle("");
            setQuickAddStatusOverride(status);
            setQuickAddOpen(true);
          }}
        />
      ) : view === "day" ? (
        <TasksDayView
          tasks={filteredTasks}
          assigneeMap={assigneeMap}
          onNavigate={(id) => {
            setDetailTaskId(id);
            setDetailOpen(true);
          }}
          onOpenProjectLink={setProjectLinkTask}
        />
      ) : view === "week" ? (
        <TasksWeekView
          tasks={filteredTasks}
          assigneeMap={assigneeMap}
          onNavigate={(id) => {
            setDetailTaskId(id);
            setDetailOpen(true);
          }}
          onOpenProjectLink={setProjectLinkTask}
        />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          title="조건에 맞는 할일이 없습니다."
          description="필터를 조정하거나 새 할일을 추가해 보세요."
        />
      ) : (
        <TasksListView
          title={
            statusFilters.size === 0
              ? "전체 할일"
              : Array.from(statusFilters).join(" · ")
          }
          description="상태 기준으로 정렬된 할일 목록입니다."
          count={filteredTasks.length}
          tasks={filteredTasks}
          assigneeMap={assigneeMap}
          updatingTaskId={updatingTaskId}
          selectedTaskIds={selectedTaskIds}
          headerSelectionState={headerSelectionState}
          onToggleTaskSelection={toggleTaskSelection}
          onToggleAllVisible={(checked) => setSelectionForVisible(visibleTaskIds, checked)}
          dragSelectDraftIds={dragSelect.draftIds}
          dragSelectMode={dragSelect.mode}
          onBeginDragSelect={dragSelect.beginDrag}
          onOpenStatusModal={openStatusModal}
          onOpenDueDateModal={openDueDateModal}
          onOpenPriorityModal={openPriorityModal}
          onOpenAssigneeModal={openAssigneeModal}
          onNavigate={(id) => {
            setDetailTaskId(id);
            setDetailOpen(true);
          }}
          onOpenProjectLink={setProjectLinkTask}
          onReorder={handleReorder}
          onQuickAdd={() => {
            setQuickAddTitle("");
            setQuickAddStatusOverride(null);
            setQuickAddOpen(true);
          }}
        />
      )}

      <TaskBulkActionBar
        selectedCount={selectedTaskIds.size}
        hiddenSelectedCount={hiddenSelectedCount}
        pending={bulkPending}
        onBulkStatus={handleBulkStatus}
        onBulkDueDate={handleBulkDueDate}
        onClear={clearSelection}
      />

      <TaskCreateDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        employees={employees}
        projects={projects}
        currentEmployeeId={currentEmployeeId}
        onCreated={refreshTasks}
      />

      <TaskDetailDialog
        taskId={detailTaskId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        employees={employees}
        projects={projects}
        onUpdated={refreshTasks}
        onDeleted={refreshTasks}
      />

      <TaskQuickAddDialog
        open={quickAddOpen}
        onOpenChange={(open) => {
          setQuickAddOpen(open);
          if (!open) setQuickAddStatusOverride(null);
        }}
        status={quickAddStatus}
        assigneeNames={quickAddAssigneeNames}
        assigneeHint={quickAddAssigneeHint}
        title={quickAddTitle}
        onTitleChange={setQuickAddTitle}
        saving={quickAddSaving}
        onSubmit={() => void handleQuickAdd()}
      />

      <TaskStatusChangeDialog
        task={statusModalTask}
        updatingTaskId={updatingTaskId}
        onClose={() => setStatusModalTask(null)}
        onSelect={(status) => void handleStatusOptionClick(status)}
      />

      <TaskDueDateDialog
        task={dueDateModalTask}
        updatingTaskId={updatingTaskId}
        draft={dueDateDraft}
        onDraftChange={setDueDateDraft}
        onClose={() => setDueDateModalTask(null)}
        onSave={() => void handleDueDateChange()}
      />

      <TaskPriorityDialog
        task={priorityModalTask}
        updatingTaskId={updatingTaskId}
        onClose={() => setPriorityModalTask(null)}
        onSelect={(priority) => void handlePriorityChange(priority)}
      />

      <TaskAssigneeDialog
        task={assigneeModalTask}
        updatingTaskId={updatingTaskId}
        employees={employees}
        draft={assigneeDraft}
        onDraftChange={setAssigneeDraft}
        onClose={() => setAssigneeModalTask(null)}
        onSave={() => void handleAssigneeChange()}
      />

      <TaskProjectLinkDialog
        task={projectLinkTask}
        projects={sortedProjects}
        onClose={() => setProjectLinkTask(null)}
        onChange={(taskId, projectId) => void handleProjectLink(taskId, projectId)}
      />
    </PageShell>
  );
}
