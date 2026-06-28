"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { EmptyState, SectionIntro } from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import {
  GripIcon,
  TaskDueDateButton,
  TaskProjectTag,
  TaskStatusControl,
  priorityBadgeClass,
} from "@/components/tasks/task-row-parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getTaskAssigneeLabel, getTaskAssigneeNames } from "@/lib/task-assignees";
import type { DragSelectMode } from "@/lib/use-drag-select";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

function maskAssigneeLabel(
  task: Task,
  assigneeMap: Map<string, string>,
  maskFn: ReturnType<typeof useMasking>["mask"]
) {
  const names = getTaskAssigneeNames(task, assigneeMap);
  if (names.length === 0) return getTaskAssigneeLabel(task, assigneeMap);
  return names.map((name) => maskFn("name", name)).join(", ");
}

function SortableMobileCard({
  task,
  assigneeMap,
  updatingTaskId,
  isSelected,
  onToggleSelection,
  onOpenStatusModal,
  onOpenDueDateModal,
  onOpenPriorityModal,
  onOpenAssigneeModal,
  onOpenProjectLink,
  onNavigate,
}: {
  task: Task;
  assigneeMap: Map<string, string>;
  updatingTaskId: string | null;
  isSelected: boolean;
  onToggleSelection: (taskId: string, checked: boolean) => void;
  onOpenStatusModal: (task: Task) => void;
  onOpenDueDateModal: (task: Task) => void;
  onOpenPriorityModal: (task: Task) => void;
  onOpenAssigneeModal: (task: Task) => void;
  onOpenProjectLink: (task: Task) => void;
  onNavigate: (id: string) => void;
}) {
  const { mask } = useMasking();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={(value) => onToggleSelection(task.id, value === true)}
          aria-label={`${task.title} 선택`}
        />
      </div>
      <button
        type="button"
        className="flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>

      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-2.5 py-2",
          isSelected && "border-primary/60 bg-primary/5"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground">
              <button type="button" className="text-left" onClick={() => onNavigate(task.id)}>
                <span className="whitespace-normal break-words text-sm font-medium text-foreground">
                  {mask("title", task.title)}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenPriorityModal(task); }}
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80 ${priorityBadgeClass(task.priority)}`}
              >
                {task.priority}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenAssigneeModal(task); }}
                className="max-w-[66px] shrink-0 truncate transition-colors hover:text-foreground"
              >
                {maskAssigneeLabel(task, assigneeMap, mask)}
              </button>
            </div>
            <TaskProjectTag task={task} onLink={onOpenProjectLink} />
          </div>
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <TaskDueDateButton
              task={task}
              updatingTaskId={updatingTaskId}
              onOpen={onOpenDueDateModal}
              compact
            />
          </div>
        </div>

        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <TaskStatusControl
            task={task}
            updatingTaskId={updatingTaskId}
            onOpen={onOpenStatusModal}
          />
        </div>
      </div>
    </div>
  );
}

function SortableTableRow({
  task,
  assigneeMap,
  updatingTaskId,
  isSelected,
  isInDragDraft,
  dragSelectMode,
  onToggleSelection,
  onBeginDragSelect,
  onOpenStatusModal,
  onOpenDueDateModal,
  onOpenPriorityModal,
  onOpenAssigneeModal,
  onOpenProjectLink,
  onNavigate,
}: {
  task: Task;
  assigneeMap: Map<string, string>;
  updatingTaskId: string | null;
  isSelected: boolean;
  isInDragDraft: boolean;
  dragSelectMode: DragSelectMode | null;
  onToggleSelection: (taskId: string, checked: boolean) => void;
  onBeginDragSelect: (sourceTaskId: string, event: React.MouseEvent) => void;
  onOpenStatusModal: (task: Task) => void;
  onOpenDueDateModal: (task: Task) => void;
  onOpenPriorityModal: (task: Task) => void;
  onOpenAssigneeModal: (task: Task) => void;
  onOpenProjectLink: (task: Task) => void;
  onNavigate: (id: string) => void;
}) {
  const { mask } = useMasking();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const effectiveSelected = isInDragDraft
    ? dragSelectMode === "add"
    : isSelected;
  const draftRemove = isInDragDraft && dragSelectMode === "remove";
  const draftAdd = isInDragDraft && dragSelectMode === "add";
  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      data-task-id={task.id}
      className={cn(
        "cursor-pointer",
        isSelected && !draftRemove && "bg-primary/5",
        draftAdd && "bg-sky-50",
        draftRemove && "bg-rose-50"
      )}
      onClick={() => onNavigate(task.id)}
    >
      <TableCell className="w-12 px-2" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={effectiveSelected}
          onCheckedChange={(value) => onToggleSelection(task.id, value === true)}
          aria-label={`${task.title} 선택`}
        />
      </TableCell>
      <TableCell className="w-10 px-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="flex cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>
      </TableCell>
      <TableCell className="whitespace-normal break-words font-medium">
        <div className="flex flex-col gap-1">
          <span>{mask("title", task.title)}</span>
          <TaskProjectTag task={task} onLink={onOpenProjectLink} />
        </div>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onOpenPriorityModal(task)}
          className={`inline-flex cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80 ${priorityBadgeClass(task.priority)}`}
        >
          {task.priority}
        </button>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onOpenAssigneeModal(task)}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {maskAssigneeLabel(task, assigneeMap, mask)}
        </button>
      </TableCell>
      <TableCell
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => onBeginDragSelect(task.id, e)}
      >
        <TaskDueDateButton task={task} updatingTaskId={updatingTaskId} onOpen={onOpenDueDateModal} />
      </TableCell>
      <TableCell
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => onBeginDragSelect(task.id, e)}
      >
        <TaskStatusControl
          task={task}
          updatingTaskId={updatingTaskId}
          onOpen={onOpenStatusModal}
        />
      </TableCell>
    </TableRow>
  );
}

export function TasksListView({
  title,
  description,
  count,
  tasks,
  assigneeMap,
  updatingTaskId,
  selectedTaskIds,
  headerSelectionState,
  onToggleTaskSelection,
  onToggleAllVisible,
  dragSelectDraftIds,
  dragSelectMode,
  onBeginDragSelect,
  onOpenStatusModal,
  onOpenDueDateModal,
  onOpenPriorityModal,
  onOpenAssigneeModal,
  onOpenProjectLink,
  onNavigate,
  onReorder,
  onQuickAdd,
}: {
  title: string;
  description: string;
  count: number;
  tasks: Task[];
  assigneeMap: Map<string, string>;
  updatingTaskId: string | null;
  selectedTaskIds: Set<string>;
  headerSelectionState: boolean | "indeterminate";
  onToggleTaskSelection: (taskId: string, checked: boolean) => void;
  onToggleAllVisible: (checked: boolean) => void;
  dragSelectDraftIds: Set<string>;
  dragSelectMode: DragSelectMode | null;
  onBeginDragSelect: (sourceTaskId: string, event: React.MouseEvent) => void;
  onOpenStatusModal: (task: Task) => void;
  onOpenDueDateModal: (task: Task) => void;
  onOpenPriorityModal: (task: Task) => void;
  onOpenAssigneeModal: (task: Task) => void;
  onOpenProjectLink: (task: Task) => void;
  onNavigate: (id: string) => void;
  onReorder: (reorderedTasks: Task[]) => void;
  onQuickAdd: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tasks.findIndex((task) => task.id === active.id);
    const newIndex = tasks.findIndex((task) => task.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tasks, oldIndex, newIndex);
    onReorder(reordered);
  };

  return (
    <div className="space-y-3">
      <SectionIntro
        title={
          <span className="inline-flex items-center gap-2">
            <span>{title}</span>
            <span className="text-sm font-medium text-muted-foreground">(총 {count}건)</span>
          </span>
        }
        description={description}
        action={
          <Button variant="outline" size="sm" onClick={onQuickAdd}>
            <Sparkles className="size-4" />
            빠른추가
          </Button>
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          title={`${title} 항목이 없습니다.`}
          description="새 할일을 추가하거나 필터 조건을 바꿔 보세요."
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            <div className="grid gap-3 md:hidden">
              {tasks.map((task) => (
                <SortableMobileCard
                  key={task.id}
                  task={task}
                  assigneeMap={assigneeMap}
                  updatingTaskId={updatingTaskId}
                  isSelected={selectedTaskIds.has(task.id)}
                  onToggleSelection={onToggleTaskSelection}
                  onOpenStatusModal={onOpenStatusModal}
                  onOpenDueDateModal={onOpenDueDateModal}
                  onOpenPriorityModal={onOpenPriorityModal}
                  onOpenAssigneeModal={onOpenAssigneeModal}
                  onOpenProjectLink={onOpenProjectLink}
                  onNavigate={onNavigate}
                />
              ))}
            </div>

            <div className="hidden rounded-[1.5rem] border border-border/70 bg-card/80 md:block">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 px-2">
                      <Checkbox
                        checked={headerSelectionState}
                        onCheckedChange={(value) => onToggleAllVisible(value === true)}
                        aria-label="이 탭의 할일 전체 선택"
                      />
                    </TableHead>
                    <TableHead className="w-10 px-2" />
                    <TableHead className="w-[36%]">할일명</TableHead>
                    <TableHead className="w-[12%]">우선순위</TableHead>
                    <TableHead className="w-[14%]">담당자</TableHead>
                    <TableHead className="w-[12%]">마감일</TableHead>
                    <TableHead className="w-[14%]">상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <SortableTableRow
                      key={task.id}
                      task={task}
                      assigneeMap={assigneeMap}
                      updatingTaskId={updatingTaskId}
                      isSelected={selectedTaskIds.has(task.id)}
                      isInDragDraft={dragSelectDraftIds.has(task.id)}
                      dragSelectMode={dragSelectMode}
                      onToggleSelection={onToggleTaskSelection}
                      onBeginDragSelect={onBeginDragSelect}
                      onOpenStatusModal={onOpenStatusModal}
                      onOpenDueDateModal={onOpenDueDateModal}
                      onOpenPriorityModal={onOpenPriorityModal}
                      onOpenAssigneeModal={onOpenAssigneeModal}
                      onOpenProjectLink={onOpenProjectLink}
                      onNavigate={onNavigate}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
