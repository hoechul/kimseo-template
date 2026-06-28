"use client";

function taskUrl(taskId: string) {
  if (typeof window === "undefined") return null;
  return `${window.location.origin}/dashboard/tasks/${taskId}`;
}

export async function notifyTaskCreated(taskId: string) {
  if (typeof window === "undefined" || !taskId) return;
  try {
    await fetch("/api/integrations/slack/task-created", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, task_url: taskUrl(taskId) }),
    });
  } catch (error) {
    console.error("Slack 할일 등록 알림 실패:", error);
  }
}

export async function notifyTaskStatusChanged(
  taskId: string,
  prevStatus: string | null,
  newStatus: string
) {
  if (typeof window === "undefined" || !taskId || !newStatus) return;
  if (prevStatus && prevStatus === newStatus) return;
  try {
    await fetch("/api/integrations/slack/task-status-changed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: taskId,
        prev_status: prevStatus,
        new_status: newStatus,
        task_url: taskUrl(taskId),
      }),
    });
  } catch (error) {
    console.error("Slack 할일 상태 알림 실패:", error);
  }
}
