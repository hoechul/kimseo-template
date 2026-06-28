"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { TASK_WITH_PROJECT_AND_ASSIGNEES_SELECT } from "@/lib/task-assignees";
import { normalizeTaskStatuses } from "@/lib/task-status";
import type { Employee, Project, Task } from "@/lib/types";

export function useTasksData() {
  const supabase = useMemo(() => createClient(), []);
  const isMountedRef = useRef(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshTasks = useCallback(async () => {
    const { data, error: taskError } = await supabase
      .from("tasks")
      .select(TASK_WITH_PROJECT_AND_ASSIGNEES_SELECT)
      .order("sort_order", { ascending: true })
      .limit(1000);

    if (!isMountedRef.current) {
      return;
    }

    if (taskError) {
      console.error("할일 목록 조회 실패:", taskError.message);
      toast.error("할일 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setTasks(normalizeTaskStatuses((data ?? []) as Task[]) as Task[]);
    setError(false);
  }, [supabase]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);

    await supabase.auth.getSession();

    const [taskRes, employeeRes, projectRes, authRes] = await Promise.all([
      supabase
        .from("tasks")
        .select(TASK_WITH_PROJECT_AND_ASSIGNEES_SELECT)
        .order("sort_order", { ascending: true })
        .limit(1000),
      supabase.from("employees").select("id, name").order("name").limit(500),
      supabase.from("projects").select("id, project_number, name, client").order("name").limit(500),
      supabase.auth.getUser(),
    ]);

    if (!isMountedRef.current) {
      return;
    }

    if (taskRes.error) {
      console.error("할일 목록 조회 실패:", taskRes.error.message);
      toast.error("할일 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setTasks([]);
      setError(true);
    } else {
      setTasks(normalizeTaskStatuses((taskRes.data ?? []) as Task[]) as Task[]);
    }

    if (employeeRes.error) {
      console.error("직원 목록 조회 실패:", employeeRes.error.message);
      toast.error("직원 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setEmployees([]);
    } else {
      setEmployees((employeeRes.data ?? []) as Employee[]);
    }

    if (projectRes.error) {
      console.error("프로젝트 목록 조회 실패:", projectRes.error.message);
      toast.error("프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setProjects([]);
    } else {
      setProjects((projectRes.data ?? []) as Project[]);
    }

    const authUser = authRes.data.user;
    if (authUser) {
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("auth_uid", authUser.id)
        .maybeSingle();

      setCurrentEmployeeId(emp?.id ?? null);
    } else {
      setCurrentEmployeeId(null);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return {
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
  };
}
