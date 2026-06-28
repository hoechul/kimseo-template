"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import { KanbanColumn } from "@/components/tasks/kanban-column";
import { normalizeTaskStatus, TASK_STATUS_OPTIONS, type TaskDisplayStatus } from "@/lib/task-status";
import type { Task } from "@/lib/types";

const COLLAPSE_KEY = "dashboard.tasks.kanban-collapsed";
const DEFAULT_COLLAPSED: TaskDisplayStatus[] = ["완료", "취소"];

export function TasksKanbanView({
  tasks,
  assigneeMap,
  onNavigate,
  onOpenProjectLink,
  onMove,
  onQuickAdd,
}: {
  tasks: Task[];
  assigneeMap: Map<string, string>;
  onNavigate: (taskId: string) => void;
  onOpenProjectLink: (task: Task) => void;
  onMove: (taskId: string, toStatus: TaskDisplayStatus, toIndex: number) => void;
  onQuickAdd: (status: TaskDisplayStatus) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<TaskDisplayStatus>>(() => new Set());
  const [collapsedReady, setCollapsedReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSE_KEY);
      if (raw) {
        const parsed = raw
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is TaskDisplayStatus =>
            (TASK_STATUS_OPTIONS as readonly string[]).includes(s)
          );
        setCollapsed(new Set(parsed));
      } else {
        setCollapsed(new Set(DEFAULT_COLLAPSED));
      }
    } catch {
      setCollapsed(new Set(DEFAULT_COLLAPSED));
    }
    setCollapsedReady(true);
  }, []);

  useEffect(() => {
    if (!collapsedReady) return;
    try {
      window.localStorage.setItem(COLLAPSE_KEY, Array.from(collapsed).join(","));
    } catch {
      // ignore
    }
  }, [collapsed, collapsedReady]);

  const onToggleCollapsed = useCallback((status: TaskDisplayStatus) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const columns = useMemo(() => {
    const grouped: Record<TaskDisplayStatus, Task[]> = {
      백로그: [],
      "할 일": [],
      진행중: [],
      완료: [],
      취소: [],
    };
    for (const task of tasks) {
      const status = normalizeTaskStatus(task.status);
      grouped[status].push(task);
    }
    return grouped;
  }, [tasks]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const activeTaskId = String(active.id);
      const overId = String(over.id);

      let targetStatus: TaskDisplayStatus | null = null;
      let targetIndex = 0;

      if (overId.startsWith("column-")) {
        targetStatus = overId.replace("column-", "") as TaskDisplayStatus;
        targetIndex = columns[targetStatus].length;
      } else {
        const overTask = tasks.find((t) => t.id === overId);
        if (!overTask) return;
        targetStatus = normalizeTaskStatus(overTask.status);
        const columnTasks = columns[targetStatus];
        const overIndex = columnTasks.findIndex((t) => t.id === overId);
        targetIndex = overIndex === -1 ? columnTasks.length : overIndex;
      }

      const activeTask = tasks.find((t) => t.id === activeTaskId);
      if (!activeTask || !targetStatus) return;

      const activeStatus = normalizeTaskStatus(activeTask.status);
      if (activeStatus === targetStatus) {
        const activeIndex = columns[targetStatus].findIndex((t) => t.id === activeTaskId);
        if (activeIndex === targetIndex || activeIndex + 1 === targetIndex) return;
      }

      onMove(activeTaskId, targetStatus, targetIndex);
    },
    [columns, tasks, onMove]
  );

  const handleDragCancel = useCallback(() => setActiveId(null), []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex min-h-[320px] gap-3 overflow-x-auto pb-2">
        {(TASK_STATUS_OPTIONS as readonly TaskDisplayStatus[]).map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={columns[status]}
            assigneeMap={assigneeMap}
            collapsed={collapsed.has(status)}
            onToggleCollapsed={onToggleCollapsed}
            onNavigate={onNavigate}
            onOpenProjectLink={onOpenProjectLink}
            onQuickAdd={onQuickAdd}
          />
        ))}
      </div>
      {activeId ? null : null}
    </DndContext>
  );
}
