"use client";

import { Bot, CalendarRange, Check, Copy, Eye, EyeOff, FolderKanban, KeyRound, MessageSquare, Receipt, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  PageHeader,
  PageSection,
  PageShell,
  SectionCard,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiKey, ExpenseType, ProjectType, ScheduleCategoryItem } from "@/lib/types";

import { Badge } from "@/components/ui/badge";

interface ModelOption {
  id: string;
  display_name: string;
  tier: string;
  context: string;
  max_output: string;
  input_price: number | null;
  output_price: number | null;
  description: string;
}

interface BoltaSettingsForm {
  api_key: string;
  customer_key: string;
  webhook_secret: string;
  supplier_manager_email: string;
}

interface GeminiSettingsForm {
  api_key: string;
}

interface SlackSettingsForm {
  bot_token: string;
  project_channel: string;
  sms_channel: string;
  signing_secret: string;
}

interface NotificationFilterRow {
  id: string;
  phrase: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface GeminiUsageLog {
  id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_cost: number;
  created_at: string;
}

interface GeminiUsageSummary {
  total_requests: number;
  input_tokens: number;
  output_tokens: number;
  total_cost: number;
  recent_logs: GeminiUsageLog[];
}

function ModelSelector({
  title,
  models,
  currentModel,
  loading,
  saving,
  onSelect,
}: {
  title: string;
  models: ModelOption[];
  currentModel: string;
  loading: boolean;
  saving: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <p className="text-sm text-muted-foreground">모델 목록 불러오는 중...</p>
        </div>
      ) : models.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">모델 목록을 불러올 수 없습니다.</p>
        </div>
      ) : (
        <>
          {saving && (
            <p className="text-xs text-muted-foreground">저장 중...</p>
          )}
          {/* 모바일 카드 */}
          <div className="grid gap-2 md:hidden">
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
                disabled={saving}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                  currentModel === m.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-muted/50"
                }`}
              >
                <div className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                  currentModel === m.id ? "border-primary bg-primary" : "border-muted-foreground/30"
                }`}>
                  {currentModel === m.id && (
                    <div className="flex h-full items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.display_name}</p>
                  {m.description && (
                    <p className="text-xs text-muted-foreground">{m.description}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    {m.context && <span>ctx: {m.context}</span>}
                    {m.max_output && <span>out: {m.max_output}</span>}
                    {m.input_price != null && (
                      <span>in: ${m.input_price}/1M</span>
                    )}
                    {m.output_price != null && (
                      <span>out: ${m.output_price}/1M</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* 데스크톱 테이블 */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>모델명</TableHead>
                  <TableHead>모델 ID</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-right">컨텍스트</TableHead>
                  <TableHead className="text-right">최대 출력</TableHead>
                  <TableHead className="text-right">Input ($/1M)</TableHead>
                  <TableHead className="text-right">Output ($/1M)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((m) => (
                  <TableRow
                    key={m.id}
                    className={`cursor-pointer transition-colors ${
                      currentModel === m.id ? "bg-primary/5" : "hover:bg-muted/50"
                    }`}
                    onClick={() => onSelect(m.id)}
                  >
                    <TableCell>
                      <div className={`mx-auto h-4 w-4 rounded-full border-2 ${
                        currentModel === m.id ? "border-primary bg-primary" : "border-muted-foreground/30"
                      }`}>
                        {currentModel === m.id && (
                          <div className="flex h-full items-center justify-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{m.display_name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{m.id}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.description || "-"}</TableCell>
                    <TableCell className="text-right text-sm">{m.context || "-"}</TableCell>
                    <TableCell className="text-right text-sm">{m.max_output || "-"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {m.input_price != null ? `$${m.input_price}` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {m.output_price != null ? `$${m.output_price}` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // AI 모델 설정
  const [chatModels, setChatModels] = useState<ModelOption[]>([]);
  const [currentModel, setCurrentModel] = useState("");
  const [currentQuotationModel, setCurrentQuotationModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelSaving, setModelSaving] = useState<string | null>(null);
  const [boltaSettings, setBoltaSettings] = useState<BoltaSettingsForm>({
    api_key: "",
    customer_key: "",
    webhook_secret: "",
    supplier_manager_email: "",
  });
  const [boltaLoading, setBoltaLoading] = useState(true);
  const [boltaSaving, setBoltaSaving] = useState(false);
  const [geminiSettings, setGeminiSettings] = useState<GeminiSettingsForm>({
    api_key: "",
  });
  const [slackSettings, setSlackSettings] = useState<SlackSettingsForm>({
    bot_token: "",
    project_channel: "",
    sms_channel: "",
    signing_secret: "",
  });
  const [notificationFilters, setNotificationFilters] = useState<NotificationFilterRow[]>([]);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [newFilterPhrase, setNewFilterPhrase] = useState("");
  const [filterSaving, setFilterSaving] = useState(false);
  const [filterTogglingId, setFilterTogglingId] = useState<string | null>(null);
  const [filterDeletingId, setFilterDeletingId] = useState<string | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(true);
  const [geminiSaving, setGeminiSaving] = useState(false);
  const [slackLoading, setSlackLoading] = useState(true);
  const [slackSaving, setSlackSaving] = useState(false);
  const [slackTesting, setSlackTesting] = useState(false);
  const [geminiModels, setGeminiModels] = useState<ModelOption[]>([]);
  const [currentGeminiModel, setCurrentGeminiModel] = useState("");
  const [geminiUsage, setGeminiUsage] = useState<GeminiUsageSummary>({
    total_requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_cost: 0,
    recent_logs: [],
  });

  // 생성 다이얼로그
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);

  // 생성 완료 다이얼로그
  const [resultOpen, setResultOpen] = useState(false);
  const [generatedKey, setGeneratedKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [revealedApiKeys, setRevealedApiKeys] = useState<Record<string, string>>({});
  const [revealingApiKeyId, setRevealingApiKeyId] = useState<string | null>(null);
  const [copiedApiKeyId, setCopiedApiKeyId] = useState<string | null>(null);

  // 프로젝트 유형
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ProjectType | null>(null);
  const [typeName, setTypeName] = useState("");
  const [typeSaving, setTypeSaving] = useState(false);
  const [ptDragIdx, setPtDragIdx] = useState<number | null>(null);
  const [ptDragOverIdx, setPtDragOverIdx] = useState<number | null>(null);

  // 매입 유형 (계정과목)
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [expTypesLoading, setExpTypesLoading] = useState(true);
  const [expTypeDialogOpen, setExpTypeDialogOpen] = useState(false);
  const [editingExpType, setEditingExpType] = useState<ExpenseType | null>(null);
  const [expTypeName, setExpTypeName] = useState("");
  const [expTypeAccountCode, setExpTypeAccountCode] = useState("");
  const [expTypeVatDeductible, setExpTypeVatDeductible] = useState(true);
  const [expTypeSaving, setExpTypeSaving] = useState(false);
  const [expDragIdx, setExpDragIdx] = useState<number | null>(null);
  const [expDragOverIdx, setExpDragOverIdx] = useState<number | null>(null);

  // 일정 유형
  const [scheduleCategories, setScheduleCategories] = useState<ScheduleCategoryItem[]>([]);
  const [schCatLoading, setSchCatLoading] = useState(true);
  const [schCatDialogOpen, setSchCatDialogOpen] = useState(false);
  const [editingSchCat, setEditingSchCat] = useState<ScheduleCategoryItem | null>(null);
  const [schCatLabel, setSchCatLabel] = useState("");
  const [schCatValue, setSchCatValue] = useState("");
  const [schCatColor, setSchCatColor] = useState("#6b7280");
  const [schCatSaving, setSchCatSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);


  const fetchApiKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/api-keys");
      if (res.ok) {
        const json = await res.json();
        setApiKeys(json.data ?? []);
      }
    } catch (e) {
      console.error("API Key 조회 실패:", e instanceof Error ? e.message : String(e));
      toast.error("API Key를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
    setLoading(false);
  }, []);

  const fetchProjectTypes = useCallback(async () => {
    setTypesLoading(true);
    const { data, error } = await supabase
      .from("project_types")
      .select("*")
      .order("sort_order", { ascending: true })
      .limit(500);
    if (error) { console.error("프로젝트 유형 조회 실패:", error.message); toast.error("프로젝트 유형을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    setProjectTypes(data ?? []);
    setTypesLoading(false);
  }, [supabase]);

  const fetchExpenseTypes = useCallback(async () => {
    setExpTypesLoading(true);
    const { data, error } = await supabase
      .from("expense_types")
      .select("*")
      .order("sort_order", { ascending: true })
      .limit(500);
    if (error) {
      console.error("매입 유형 조회 실패:", error.message);
      toast.error("매입 유형을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
    setExpenseTypes((data ?? []) as ExpenseType[]);
    setExpTypesLoading(false);
  }, [supabase]);

  const fetchScheduleCategories = useCallback(async () => {
    setSchCatLoading(true);
    const { data, error } = await supabase
      .from("schedule_categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .limit(500);
    if (error) { console.error("일정 유형 조회 실패:", error.message); toast.error("일정 유형을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    setScheduleCategories((data ?? []) as ScheduleCategoryItem[]);
    setSchCatLoading(false);
  }, [supabase]);

  const fetchChatModel = useCallback(async () => {
    setModelsLoading(true);
    try {
      const res = await fetch("/api/settings/chat-model");
      if (res.ok) {
        const data = await res.json();
        setCurrentModel(data.current_model ?? "");
        setCurrentQuotationModel(data.current_quotation_model ?? "");
        setChatModels(data.models ?? []);
      }
    } catch {
      // ignore
    }
    setModelsLoading(false);
  }, []);

  const fetchBoltaSettings = useCallback(async () => {
    setBoltaLoading(true);
    try {
      const res = await fetch("/api/settings/bolta");
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Bolta 설정을 불러오지 못했습니다.");
      }

      setBoltaSettings({
        api_key: data?.api_key ?? "",
        customer_key: data?.customer_key ?? "",
        webhook_secret: data?.webhook_secret ?? "",
        supplier_manager_email: data?.supplier_manager_email ?? "",
      });
    } catch (e) {
      console.error("Bolta 설정 조회 실패:", e instanceof Error ? e.message : String(e));
      toast.error("Bolta 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
    setBoltaLoading(false);
  }, []);

  const fetchGeminiSettings = useCallback(async () => {
    setGeminiLoading(true);
    try {
      const res = await fetch("/api/settings/gemini");
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Gemini 설정을 불러오지 못했습니다.");
      }

      setGeminiSettings({
        api_key: data?.api_key ?? "",
      });
      setCurrentGeminiModel(data?.current_model ?? "");
      setGeminiModels(data?.models ?? []);
      setGeminiUsage({
        total_requests: data?.usage?.total_requests ?? 0,
        input_tokens: data?.usage?.input_tokens ?? 0,
        output_tokens: data?.usage?.output_tokens ?? 0,
        total_cost: data?.usage?.total_cost ?? 0,
        recent_logs: data?.usage?.recent_logs ?? [],
      });
    } catch (e) {
      console.error("Gemini 설정 조회 실패:", e instanceof Error ? e.message : String(e));
      toast.error("Gemini 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
    setGeminiLoading(false);
  }, []);

  const fetchSlackSettings = useCallback(async () => {
    setSlackLoading(true);
    try {
      const res = await fetch("/api/settings/slack");
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Slack 설정을 불러오지 못했습니다.");
      }

      setSlackSettings({
        bot_token: data?.bot_token ?? "",
        project_channel: data?.project_channel ?? "",
        sms_channel: data?.sms_channel ?? "",
        signing_secret: data?.signing_secret ?? "",
      });
    } catch (e) {
      console.error("Slack 설정 조회 실패:", e instanceof Error ? e.message : String(e));
      toast.error("Slack 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
    setSlackLoading(false);
  }, []);

  const fetchNotificationFilters = useCallback(async () => {
    setFiltersLoading(true);
    try {
      const res = await fetch("/api/settings/notification-filters");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "필터 목록을 불러오지 못했습니다.");
      }
      setNotificationFilters(data?.data ?? []);
    } catch (e) {
      console.error("알림 필터 조회 실패:", e instanceof Error ? e.message : String(e));
      toast.error("알림 필터를 불러오지 못했습니다.");
    }
    setFiltersLoading(false);
  }, []);

  const handleAddFilter = async () => {
    const trimmed = newFilterPhrase.trim();
    if (!trimmed) return;
    setFilterSaving(true);
    try {
      const res = await fetch("/api/settings/notification-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "필터를 추가하지 못했습니다.");
      }
      setNewFilterPhrase("");
      await fetchNotificationFilters();
      toast.success("필터를 추가했습니다.");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("알림 필터 추가 실패:", message);
      toast.error(message);
    }
    setFilterSaving(false);
  };

  const handleToggleFilter = async (row: NotificationFilterRow) => {
    setFilterTogglingId(row.id);
    try {
      const res = await fetch("/api/settings/notification-filters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, enabled: !row.enabled }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "필터 상태 변경 실패");
      }
      await fetchNotificationFilters();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("알림 필터 토글 실패:", message);
      toast.error(message);
    }
    setFilterTogglingId(null);
  };

  const handleDeleteFilter = async (row: NotificationFilterRow) => {
    if (!confirm(`"${row.phrase}" 필터를 삭제할까요?`)) return;
    setFilterDeletingId(row.id);
    try {
      const res = await fetch(
        `/api/settings/notification-filters?id=${encodeURIComponent(row.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "필터 삭제 실패");
      }
      await fetchNotificationFilters();
      toast.success("필터를 삭제했습니다.");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("알림 필터 삭제 실패:", message);
      toast.error(message);
    }
    setFilterDeletingId(null);
  };

  const handleModelChange = async (model: string, key: "chat_model" | "quotation_ai_model" = "chat_model") => {
    setModelSaving(key);
    if (key === "chat_model") setCurrentModel(model);
    else setCurrentQuotationModel(model);
    try {
      const res = await fetch("/api/settings/chat-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, key }),
      });
      if (res.ok) {
        toast.success("AI 모델이 변경되었습니다.");
      } else {
        toast.error("모델 변경 실패");
      }
    } catch {
      toast.error("모델 변경 실패");
    }
    setModelSaving(null);
  };

  const handleBoltaSettingChange = (
    key: keyof BoltaSettingsForm,
    value: string
  ) => {
    setBoltaSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveBoltaSettings = async () => {
    setBoltaSaving(true);
    try {
      const res = await fetch("/api/settings/bolta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(boltaSettings),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Bolta 설정 저장에 실패했습니다.");
      }

      toast.success("Bolta 설정을 저장했습니다.");
      await fetchBoltaSettings();
    } catch (e) {
      console.error("Bolta 설정 저장 실패:", e instanceof Error ? e.message : String(e));
      toast.error("Bolta 설정 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
    setBoltaSaving(false);
  };

  const handleSaveGeminiSettings = async () => {
    setGeminiSaving(true);
    try {
      const res = await fetch("/api/settings/gemini", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: geminiSettings.api_key,
          model: currentGeminiModel,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Gemini 설정 저장에 실패했습니다.");
      }

      toast.success("Gemini 설정을 저장했습니다.");
      await fetchGeminiSettings();
    } catch (e) {
      console.error("Gemini 설정 저장 실패:", e instanceof Error ? e.message : String(e));
      toast.error("Gemini 설정 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
    setGeminiSaving(false);
  };

  const handleSlackSettingChange = (key: keyof SlackSettingsForm, value: string) => {
    setSlackSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveSlackSettings = async () => {
    setSlackSaving(true);
    try {
      const res = await fetch("/api/settings/slack", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackSettings),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Slack 설정 저장에 실패했습니다.");
      }

      toast.success("Slack 설정을 저장했습니다.");
      await fetchSlackSettings();
    } catch (e) {
      console.error("Slack 설정 저장 실패:", e instanceof Error ? e.message : String(e));
      toast.error("Slack 설정 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
    setSlackSaving(false);
  };

  const handleTestSlack = async () => {
    setSlackTesting(true);
    try {
      const res = await fetch("/api/settings/slack/test", { method: "POST" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Slack 테스트 발송에 실패했습니다.");
      }

      toast.success("Slack 테스트 메시지를 발송했습니다.");
    } catch (e) {
      console.error("Slack 테스트 실패:", e instanceof Error ? e.message : String(e));
      toast.error("Slack 테스트 발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
    setSlackTesting(false);
  };

  const handleGeminiModelChange = async (model: string) => {
    setGeminiSaving(true);
    setCurrentGeminiModel(model);
    try {
      const res = await fetch("/api/settings/gemini", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: geminiSettings.api_key,
          model,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Gemini 모델 저장에 실패했습니다.");
      }

      toast.success("명함관리 모델을 저장했습니다.");
      await fetchGeminiSettings();
    } catch (e) {
      console.error("Gemini 모델 저장 실패:", e instanceof Error ? e.message : String(e));
      toast.error("Gemini 모델 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
    setGeminiSaving(false);
  };

  useEffect(() => {
    fetchApiKeys();
    fetchProjectTypes();
    fetchExpenseTypes();
    fetchScheduleCategories();
    fetchChatModel();
    fetchBoltaSettings();
    fetchGeminiSettings();
    fetchSlackSettings();
    fetchNotificationFilters();
  }, [fetchApiKeys, fetchProjectTypes, fetchExpenseTypes, fetchScheduleCategories, fetchChatModel, fetchBoltaSettings, fetchGeminiSettings, fetchSlackSettings, fetchNotificationFilters]);

  const openTypeDialog = (type?: ProjectType) => {
    setEditingType(type ?? null);
    setTypeName(type?.name ?? "");
    setTypeDialogOpen(true);
  };

  const handleSaveType = async () => {
    const trimmed = typeName.trim();
    if (!trimmed) return;

    const duplicate = projectTypes.some(
      (t) => t.name === trimmed && t.id !== editingType?.id
    );
    if (duplicate) {
      toast.error("이미 동일한 이름의 유형이 존재합니다.");
      return;
    }

    setTypeSaving(true);

    if (editingType) {
      const { error } = await supabase
        .from("project_types")
        .update({ name: trimmed })
        .eq("id", editingType.id);
      if (error) {
        console.error("유형 수정 실패:", error.message);
        toast.error("유형 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
      } else {
        toast.success("유형이 수정되었습니다.");
      }
    } else {
      const maxOrder = projectTypes.reduce((max, t) => Math.max(max, t.sort_order), 0);
      const { error } = await supabase
        .from("project_types")
        .insert({ name: trimmed, sort_order: maxOrder + 1 });
      if (error) {
        console.error("유형 추가 실패:", error.message);
        toast.error("유형 추가에 실패했습니다. 잠시 후 다시 시도해주세요.");
      } else {
        toast.success("유형이 추가되었습니다.");
      }
    }

    setTypeSaving(false);
    setTypeDialogOpen(false);
    fetchProjectTypes();
  };

  const handleDeleteType = async (type: ProjectType) => {
    if (!confirm(`"${type.name}" 유형을 삭제하시겠습니까?\n이 유형을 사용 중인 프로젝트는 유형이 비워집니다.`)) return;
    const { error } = await supabase.from("project_types").delete().eq("id", type.id);
    if (error) {
      console.error("유형 삭제 실패:", error.message);
      toast.error("유형 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    toast.success("유형이 삭제되었습니다.");
    fetchProjectTypes();
  };

  const handlePtDrop = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const reordered = [...projectTypes];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    setProjectTypes(reordered);
    setPtDragIdx(null);
    setPtDragOverIdx(null);

    const updates = reordered.map((pt, i) => ({ id: pt.id, sort_order: i + 1 }));
    for (const u of updates) {
      await supabase.from("project_types").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
    fetchProjectTypes();
  };

  const openExpTypeDialog = (type?: ExpenseType) => {
    setEditingExpType(type ?? null);
    setExpTypeName(type?.name ?? "");
    setExpTypeAccountCode(type?.account_code ?? "");
    setExpTypeVatDeductible(type?.is_vat_deductible ?? true);
    setExpTypeDialogOpen(true);
  };

  const handleSaveExpType = async () => {
    const trimmedName = expTypeName.trim();
    if (!trimmedName) return;

    const duplicate = expenseTypes.some(
      (t) => t.name === trimmedName && t.id !== editingExpType?.id
    );
    if (duplicate) {
      toast.error("이미 동일한 이름의 매입 유형이 존재합니다.");
      return;
    }

    setExpTypeSaving(true);
    const payload = {
      name: trimmedName,
      account_code: expTypeAccountCode.trim() || null,
      is_vat_deductible: expTypeVatDeductible,
    };

    if (editingExpType) {
      const { error } = await supabase
        .from("expense_types")
        .update(payload)
        .eq("id", editingExpType.id);
      if (error) {
        console.error("매입 유형 수정 실패:", error.message);
        toast.error("매입 유형 수정에 실패했습니다.");
      } else {
        toast.success("매입 유형이 수정되었습니다.");
      }
    } else {
      const maxOrder = expenseTypes.reduce((max, t) => Math.max(max, t.sort_order), 0);
      const { error } = await supabase
        .from("expense_types")
        .insert({ ...payload, sort_order: maxOrder + 1 });
      if (error) {
        console.error("매입 유형 추가 실패:", error.message);
        toast.error("매입 유형 추가에 실패했습니다.");
      } else {
        toast.success("매입 유형이 추가되었습니다.");
      }
    }

    setExpTypeSaving(false);
    setExpTypeDialogOpen(false);
    fetchExpenseTypes();
  };

  const handleDeleteExpType = async (type: ExpenseType) => {
    if (
      !confirm(
        `"${type.name}" 매입 유형을 삭제하시겠습니까?\n이 유형을 사용 중인 매입/카드거래는 유형이 비워집니다.`
      )
    )
      return;
    const { error } = await supabase.from("expense_types").delete().eq("id", type.id);
    if (error) {
      console.error("매입 유형 삭제 실패:", error.message);
      toast.error("매입 유형 삭제에 실패했습니다.");
      return;
    }
    toast.success("매입 유형이 삭제되었습니다.");
    fetchExpenseTypes();
  };

  const handleExpTypeDrop = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const reordered = [...expenseTypes];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    setExpenseTypes(reordered);
    setExpDragIdx(null);
    setExpDragOverIdx(null);

    const updates = reordered.map((t, i) => ({ id: t.id, sort_order: i + 1 }));
    for (const u of updates) {
      await supabase.from("expense_types").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
    fetchExpenseTypes();
  };

  const openSchCatDialog = (cat?: ScheduleCategoryItem) => {
    setEditingSchCat(cat ?? null);
    setSchCatLabel(cat?.label ?? "");
    setSchCatValue(cat?.value ?? "");
    setSchCatColor(cat?.color ?? "#6b7280");
    setSchCatDialogOpen(true);
  };

  const handleSaveSchCat = async () => {
    if (!schCatLabel.trim()) return;
    setSchCatSaving(true);

    const value = schCatValue.trim() || schCatLabel.trim().toLowerCase().replace(/\s+/g, "_");

    if (editingSchCat) {
      const { error } = await supabase
        .from("schedule_categories")
        .update({ label: schCatLabel.trim(), value, color: schCatColor })
        .eq("id", editingSchCat.id);
      if (error) { console.error("일정 유형 수정 실패:", error.message); toast.error("일정 유형 수정에 실패했습니다. 잠시 후 다시 시도해주세요."); }
      else toast.success("일정 유형이 수정되었습니다.");
    } else {
      const maxOrder = scheduleCategories.reduce((max, c) => Math.max(max, c.sort_order), 0);
      const { error } = await supabase
        .from("schedule_categories")
        .insert({ label: schCatLabel.trim(), value, color: schCatColor, sort_order: maxOrder + 1 });
      if (error) { console.error("일정 유형 추가 실패:", error.message); toast.error("일정 유형 추가에 실패했습니다. 잠시 후 다시 시도해주세요."); }
      else toast.success("일정 유형이 추가되었습니다.");
    }

    setSchCatSaving(false);
    setSchCatDialogOpen(false);
    fetchScheduleCategories();
  };

  const handleDeleteSchCat = async (cat: ScheduleCategoryItem) => {
    if (!confirm(`"${cat.label}" 일정 유형을 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from("schedule_categories").delete().eq("id", cat.id);
    if (error) {
      console.error("일정 유형 삭제 실패:", error.message);
      toast.error("일정 유형 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    toast.success("일정 유형이 삭제되었습니다.");
    fetchScheduleCategories();
  };

  const handleSchCatDrop = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const reordered = [...scheduleCategories];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    // 낙관적 업데이트
    setScheduleCategories(reordered);
    setDragIdx(null);
    setDragOverIdx(null);

    // DB 일괄 업데이트
    const updates = reordered.map((cat, i) => ({ id: cat.id, sort_order: i + 1 }));
    for (const u of updates) {
      await supabase.from("schedule_categories").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
    fetchScheduleCategories();
  };

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });

      if (res.ok) {
        const json = await res.json();
        setGeneratedKey(json.data.raw_key);
        setCreateOpen(false);
        setNewKeyName("");
        setResultOpen(true);
        setCopied(false);
        await fetchApiKeys();
        toast.success("API Key가 생성되었습니다.");
      }
    } catch (e) {
      console.error("API Key 생성 실패:", e instanceof Error ? e.message : String(e));
      toast.error("API Key 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }

    setCreating(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" API Key를 삭제하시겠습니까?\n삭제 후 이 Key로는 더 이상 API를 호출할 수 없습니다.`)) return;

    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRevealedApiKeys((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setCopiedApiKeyId((prev) => (prev === id ? null : prev));
        await fetchApiKeys();
      }
    } catch (e) {
      console.error("API Key 삭제 실패:", e instanceof Error ? e.message : String(e));
      toast.error("API Key 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const fetchRawApiKey = useCallback(async (id: string) => {
    const res = await fetch(`/api/api-keys/${id}/reveal`, { cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(json?.error ?? "API Key를 불러오지 못했습니다.");
    }

    const rawKey =
      typeof json?.data?.raw_key === "string" ? json.data.raw_key.trim() : "";

    if (!rawKey) {
      throw new Error("API Key 값이 비어 있습니다.");
    }

    setRevealedApiKeys((prev) => ({ ...prev, [id]: rawKey }));
    return rawKey;
  }, []);

  const handleToggleApiKeyVisibility = async (apiKey: ApiKey) => {
    if (revealedApiKeys[apiKey.id]) {
      setRevealedApiKeys((prev) => {
        const next = { ...prev };
        delete next[apiKey.id];
        return next;
      });
      return;
    }

    if (!apiKey.can_reveal) {
      toast.error("이 API Key는 전체 값을 다시 볼 수 없습니다. 새로 생성해주세요.");
      return;
    }

    setRevealingApiKeyId(apiKey.id);

    try {
      await fetchRawApiKey(apiKey.id);
    } catch (e) {
      console.error("API Key 조회 실패:", e instanceof Error ? e.message : String(e));
      toast.error("API Key를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setRevealingApiKeyId((prev) => (prev === apiKey.id ? null : prev));
    }
  };

  const handleCopyApiKey = async (apiKey: ApiKey) => {
    try {
      const rawKey =
        revealedApiKeys[apiKey.id] ??
        (apiKey.can_reveal ? await fetchRawApiKey(apiKey.id) : "");

      if (!rawKey) {
        toast.error("이 API Key는 전체 값을 다시 복사할 수 없습니다. 새로 생성해주세요.");
        return;
      }

      await navigator.clipboard.writeText(rawKey);
      setCopiedApiKeyId(apiKey.id);
      setTimeout(() => {
        setCopiedApiKeyId((prev) => (prev === apiKey.id ? null : prev));
      }, 2000);
      toast.success("API Key를 복사했습니다.");
    } catch (e) {
      console.error("API Key 복사 실패:", e instanceof Error ? e.message : String(e));
      toast.error("API Key 복사에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select input text
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCost = (value: number) => `$${value.toFixed(4)}`;

  const formatTokens = (value: number) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const hasLegacyApiKeys = useMemo(
    () => apiKeys.some((apiKey) => !apiKey.can_reveal),
    [apiKeys]
  );

  return (
    <PageShell>
      <PageHeader
        title="설정"
        description="AI 모델, 외부 연동 키, 프로젝트·매입·일정 유형을 같은 패턴으로 관리합니다."
      />

      <StatsGrid>
        <StatCard
          label="AI 모델 옵션"
          value={chatModels.length}
          description="채팅과 견적 생성에 사용할 수 있는 모델 수"
          icon={Bot}
          tone="brand"
        />
        <StatCard
          label="API 키"
          value={apiKeys.length}
          description={hasLegacyApiKeys ? "일부 키는 재조회가 제한됩니다." : "외부 연동용 키를 관리합니다."}
          icon={KeyRound}
          tone={hasLegacyApiKeys ? "warning" : "info"}
        />
        <StatCard
          label="프로젝트 유형"
          value={projectTypes.length}
          description="프로젝트 입력 화면에 노출되는 분류 항목"
          icon={FolderKanban}
          tone="success"
        />
        <StatCard
          label="매입 유형"
          value={expenseTypes.length}
          description="매입·카드거래 입력 시 쓰는 계정과목"
          icon={Receipt}
          tone="info"
        />
        <StatCard
          label="일정 유형"
          value={scheduleCategories.length}
          description="캘린더와 일정 다이얼로그에서 쓰는 카테고리"
          icon={CalendarRange}
        />
      </StatsGrid>

      <PageSection
        title="AI 모델 설정"
      >
        <div className="space-y-4">
          <ModelSelector
              title="김대리모델"
              models={chatModels}
              currentModel={currentModel}
              loading={modelsLoading}
              saving={modelSaving === "chat_model"}
              onSelect={(id) => handleModelChange(id, "chat_model")}
          />
          <ModelSelector
              title="AI견적모델"
              models={chatModels}
              currentModel={currentQuotationModel}
              loading={modelsLoading}
              saving={modelSaving === "quotation_ai_model"}
              onSelect={(id) => handleModelChange(id, "quotation_ai_model")}
          />
          <ModelSelector
              title="명함관리모델"
              models={geminiModels}
              currentModel={currentGeminiModel}
              loading={geminiLoading}
              saving={geminiSaving}
              onSelect={(id) => void handleGeminiModelChange(id)}
          />
        </div>
      </PageSection>

      <PageSection
        title="Slack 프로젝트 알림"
        description="프로젝트가 생성되면 지정한 Slack 채널로 생성 알림을 보냅니다."
      >
        <SectionCard>
          {slackLoading ? (
            <div className="flex h-40 items-center justify-center rounded-[1.25rem] border border-dashed border-border/80 bg-background/60">
              <p className="text-sm text-muted-foreground">Slack 설정을 불러오는 중입니다.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="slack_bot_token">Slack Bot Token</Label>
                  <Input
                    id="slack_bot_token"
                    type="password"
                    value={slackSettings.bot_token}
                    onChange={(e) => handleSlackSettingChange("bot_token", e.target.value)}
                    placeholder="xoxb-..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slack_project_channel">프로젝트 알림 채널</Label>
                  <Input
                    id="slack_project_channel"
                    value={slackSettings.project_channel}
                    onChange={(e) => handleSlackSettingChange("project_channel", e.target.value)}
                    placeholder="#project-alert 또는 C0123456789"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="slack_sms_channel">SMS 알림 채널</Label>
                  <Input
                    id="slack_sms_channel"
                    value={slackSettings.sms_channel}
                    onChange={(e) => handleSlackSettingChange("sms_channel", e.target.value)}
                    placeholder="#sms 또는 C0123456789"
                  />
                  <p className="text-xs text-muted-foreground">
                    카드 webhook 으로 들어온 알림 중 아래 SMS 알림 필터를 통과한 메시지가 이 채널로 전달됩니다.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="slack_signing_secret">Slack Signing Secret</Label>
                  <Input
                    id="slack_signing_secret"
                    type="password"
                    value={slackSettings.signing_secret}
                    onChange={(e) => handleSlackSettingChange("signing_secret", e.target.value)}
                    placeholder="Basic Information → Signing Secret"
                  />
                  <p className="text-xs text-muted-foreground">
                    @김비서 멘션 처리에 사용됩니다. Slack 앱의 Event Subscriptions 활성화 후 Basic Information에서 Signing Secret을 복사해 입력하세요.
                  </p>
                </div>
              </div>
              <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                프로젝트 생성 시 채널에 프로젝트 번호, 이름, 고객명, 상태가 발송됩니다.
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={handleTestSlack} disabled={slackTesting || slackSaving}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {slackTesting ? "테스트 발송 중..." : "테스트 발송"}
                </Button>
                <Button onClick={handleSaveSlackSettings} disabled={slackSaving}>
                  {slackSaving ? "저장 중..." : "Slack 설정 저장"}
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      </PageSection>

      <PageSection
        title="SMS 알림 필터"
        description="Tasker → 카드 webhook 으로 들어온 알림 중 등록된 phrase 가 본문에 포함되면 Slack 전달을 차단합니다. (카드거래 row 자체는 항상 저장됩니다)"
      >
        <SectionCard>
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={newFilterPhrase}
                onChange={(e) => setNewFilterPhrase(e.target.value)}
                placeholder="차단할 문구 (예: (광고), 한진택배입니다)"
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddFilter();
                  }
                }}
              />
              <Button
                onClick={handleAddFilter}
                disabled={filterSaving || !newFilterPhrase.trim()}
              >
                {filterSaving ? "추가 중..." : "필터 추가"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              비교는 대소문자 무시 + 부분일치(contains) 입니다. 하나라도 일치하면 Slack 으로 전달되지 않습니다.
            </p>

            {filtersLoading ? (
              <div className="flex h-32 items-center justify-center rounded-[1.25rem] border border-dashed border-border/80 bg-background/60">
                <p className="text-sm text-muted-foreground">필터 목록을 불러오는 중입니다.</p>
              </div>
            ) : notificationFilters.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-[1.25rem] border border-dashed border-border/80 bg-background/60">
                <p className="text-sm text-muted-foreground">등록된 필터가 없습니다.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phrase</TableHead>
                    <TableHead className="w-28 text-center">상태</TableHead>
                    <TableHead className="w-24 text-right">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notificationFilters.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-sm">{row.phrase}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant={row.enabled ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleToggleFilter(row)}
                          disabled={filterTogglingId === row.id}
                        >
                          {filterTogglingId === row.id
                            ? "변경 중..."
                            : row.enabled
                            ? "사용 중"
                            : "비활성"}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteFilter(row)}
                          disabled={filterDeletingId === row.id}
                        >
                          {filterDeletingId === row.id ? "삭제 중..." : "삭제"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SectionCard>
      </PageSection>

      <PageSection
        title="Bolta 연동 설정"
        description="세금계산서 발행에 필요한 키와 웹훅 값을 한 카드 안에서 관리합니다."
      >
        <SectionCard>
          {boltaLoading ? (
            <div className="flex h-40 items-center justify-center rounded-[1.25rem] border border-dashed border-border/80 bg-background/60">
              <p className="text-sm text-muted-foreground">
                Bolta 설정을 불러오는 중입니다.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bolta_api_key">Bolta API Key</Label>
                <Input
                  id="bolta_api_key"
                  type="password"
                  value={boltaSettings.api_key}
                  onChange={(e) =>
                    handleBoltaSettingChange("api_key", e.target.value)
                  }
                  placeholder="test_ 또는 live_ 로 시작하는 키"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bolta_customer_key">Customer Key</Label>
                <Input
                  id="bolta_customer_key"
                  value={boltaSettings.customer_key}
                  onChange={(e) =>
                    handleBoltaSettingChange("customer_key", e.target.value)
                  }
                  placeholder="CustomerKey_..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bolta_webhook_secret">Webhook Secret</Label>
                <Input
                  id="bolta_webhook_secret"
                  value={boltaSettings.webhook_secret}
                  onChange={(e) =>
                    handleBoltaSettingChange("webhook_secret", e.target.value)
                  }
                  placeholder="웹훅 URL query secret"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bolta_supplier_manager_email">
                  공급자 담당자 이메일
                </Label>
                <Input
                  id="bolta_supplier_manager_email"
                  type="email"
                  value={boltaSettings.supplier_manager_email}
                  onChange={(e) =>
                    handleBoltaSettingChange(
                      "supplier_manager_email",
                      e.target.value
                    )
                  }
                  placeholder="없으면 직원 정보에서 자동 탐색"
                />
              </div>
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              웹훅 URL은{" "}
              <span className="font-mono">
                /api/bolta/webhook?secret=&lt;Webhook Secret&gt;
              </span>{" "}
              형태로 Bolta에 등록하면 됩니다.
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveBoltaSettings} disabled={boltaSaving}>
                {boltaSaving ? "저장 중..." : "Bolta 설정 저장"}
              </Button>
            </div>
          </div>
        )}
        </SectionCard>
      </PageSection>

      <PageSection
        title="Gemini OCR 설정"
        description="명함 사진 OCR에 사용할 Gemini API Key를 저장합니다."
      >
        <SectionCard>
          {geminiLoading ? (
            <div className="flex h-40 items-center justify-center rounded-[1.25rem] border border-dashed border-border/80 bg-background/60">
              <p className="text-sm text-muted-foreground">
                Gemini 설정을 불러오는 중입니다.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gemini_api_key">Gemini API Key</Label>
                <Input
                  id="gemini_api_key"
                  type="password"
                  value={geminiSettings.api_key}
                  onChange={(e) =>
                    setGeminiSettings({ api_key: e.target.value })
                  }
                  placeholder="AIza..."
                />
              </div>

              <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                명함 OCR은 이 값을 우선 사용하며, 비어 있으면
                <span className="mx-1 font-mono">GEMINI_API_KEY</span>
                환경변수를 fallback으로 사용합니다.
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <StatCard
                  label="OCR 요청"
                  value={geminiUsage.total_requests.toLocaleString()}
                  compact
                />
                <StatCard
                  label="Input 토큰"
                  value={formatTokens(geminiUsage.input_tokens)}
                  compact
                />
                <StatCard
                  label="Output 토큰"
                  value={formatTokens(geminiUsage.output_tokens)}
                  compact
                />
                <StatCard
                  label="누적 비용"
                  value={formatCost(geminiUsage.total_cost)}
                  tone="warning"
                  compact
                />
              </div>

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>시간</TableHead>
                      <TableHead>모델</TableHead>
                      <TableHead className="text-right">Input</TableHead>
                      <TableHead className="text-right">Output</TableHead>
                      <TableHead className="text-right">비용</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {geminiUsage.recent_logs.length > 0 ? (
                      geminiUsage.recent_logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>{formatDateTime(log.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs">{log.model}</TableCell>
                          <TableCell className="text-right">{formatTokens(log.input_tokens)}</TableCell>
                          <TableCell className="text-right">{formatTokens(log.output_tokens)}</TableCell>
                          <TableCell className="text-right font-medium text-amber-600">
                            {formatCost(Number(log.total_cost))}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          아직 명함 OCR 사용 로그가 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveGeminiSettings} disabled={geminiSaving}>
                  {geminiSaving ? "저장 중..." : "Gemini 설정 저장"}
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      </PageSection>

      <PageSection
        title="API Key 관리"
        description="외부 시스템 연동용 키를 생성, 확인, 삭제까지 같은 흐름으로 처리할 수 있게 정리했습니다."
        action={
          <Button onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            API Key 생성
          </Button>
        }
      >
        <SectionCard className="gap-4">

        {hasLegacyApiKeys ? (
          <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            이전 방식으로 생성된 API Key는 전체 값을 다시 볼 수 없습니다. eye/copy 기능이 필요하면 새로 생성해주세요.
          </div>
        ) : null}

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">
              등록된 API Key가 없습니다. &quot;API Key 생성&quot; 버튼으로 추가하세요.
            </p>
          </div>
        ) : (
          <>
            {/* 모바일 카드 */}
            <div className="grid gap-3 md:hidden">
              {apiKeys.map((apiKey) => (
                <div key={apiKey.id} className="rounded-lg border bg-card p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{apiKey.name}</p>
                      <div className="mt-1 flex items-center gap-1">
                        <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                          {revealedApiKeys[apiKey.id] ?? apiKey.key_prefix}
                        </p>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => void handleToggleApiKeyVisibility(apiKey)}
                          disabled={
                            revealingApiKeyId === apiKey.id ||
                            (!apiKey.can_reveal && !revealedApiKeys[apiKey.id])
                          }
                          aria-label={
                            revealedApiKeys[apiKey.id] ? "API Key 숨기기" : "API Key 보기"
                          }
                        >
                          {revealedApiKeys[apiKey.id] ? <EyeOff /> : <Eye />}
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => void handleCopyApiKey(apiKey)}
                          disabled={
                            revealingApiKeyId === apiKey.id ||
                            (!apiKey.can_reveal && !revealedApiKeys[apiKey.id])
                          }
                          aria-label="API Key 복사"
                        >
                          {copiedApiKeyId === apiKey.id ? <Check /> : <Copy />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>생성자: {apiKey.created_by}</p>
                    <p>생성일: {formatDate(apiKey.created_at)}</p>
                    <p>마지막 사용: {formatDateTime(apiKey.last_used_at)}</p>
                  </div>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="w-full"
                      onClick={() => handleDelete(apiKey.id, apiKey.name)}
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* 데스크톱 테이블 */}
            <div className="hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>생성자</TableHead>
                    <TableHead>생성일</TableHead>
                    <TableHead>마지막 사용</TableHead>
                    <TableHead className="w-20">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((apiKey) => (
                    <TableRow key={apiKey.id}>
                      <TableCell className="font-medium">{apiKey.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground">
                            {revealedApiKeys[apiKey.id] ?? apiKey.key_prefix}
                          </span>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => void handleToggleApiKeyVisibility(apiKey)}
                            disabled={
                              revealingApiKeyId === apiKey.id ||
                              (!apiKey.can_reveal && !revealedApiKeys[apiKey.id])
                            }
                            aria-label={
                              revealedApiKeys[apiKey.id] ? "API Key 숨기기" : "API Key 보기"
                            }
                          >
                            {revealedApiKeys[apiKey.id] ? <EyeOff /> : <Eye />}
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => void handleCopyApiKey(apiKey)}
                            disabled={
                              revealingApiKeyId === apiKey.id ||
                              (!apiKey.can_reveal && !revealedApiKeys[apiKey.id])
                            }
                            aria-label="API Key 복사"
                          >
                            {copiedApiKeyId === apiKey.id ? <Check /> : <Copy />}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{apiKey.created_by}</TableCell>
                      <TableCell>{formatDate(apiKey.created_at)}</TableCell>
                      <TableCell>{formatDateTime(apiKey.last_used_at)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleDelete(apiKey.id, apiKey.name)}
                        >
                          삭제
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        </SectionCard>
      </PageSection>

      {/* API Key 생성 다이얼로그 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key 생성</DialogTitle>
            <DialogDescription>
              외부 시스템 연동을 위한 새 API Key를 생성합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="key-name">Key 이름</Label>
            <Input
              id="key-name"
              placeholder="예: ERP 연동용"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              취소
            </Button>
            <Button onClick={handleCreate} disabled={!newKeyName.trim() || creating}>
              {creating ? "생성 중..." : "생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 생성 완료 다이얼로그 */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key가 생성되었습니다</DialogTitle>
            <DialogDescription>
              생성 직후 복사하는 것을 권장합니다. 이후에는 설정 목록에서 eye 아이콘으로 다시 확인할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={generatedKey}
                className="font-mono text-sm"
              />
              <Button variant="outline" onClick={handleCopy} className="shrink-0">
                {copied ? "복사됨!" : "복사"}
              </Button>
            </div>
            <p className="text-xs text-amber-600">
              기존에 생성된 일부 Key는 보안상 전체 값을 다시 볼 수 없을 수 있습니다.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setResultOpen(false)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PageSection
        title="프로젝트 유형 관리"
        description="프로젝트 생성 폼에서 쓰는 유형을 같은 카드 패턴으로 정리하고, 드래그 순서도 바로 반영되게 했습니다."
        action={
          <Button onClick={() => openTypeDialog()} className="w-full sm:w-auto">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            유형 추가
          </Button>
        }
      >
        <SectionCard className="gap-4">
        <div className="flex items-center gap-2 rounded-[1.25rem] border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          <Sparkles className="size-4 text-primary" />
          순서를 바꾸면 프로젝트 입력 화면의 선택 순서에도 바로 반영됩니다.
        </div>

        {typesLoading ? (
          <div className="flex h-40 items-center justify-center">
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          </div>
        ) : projectTypes.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">
              등록된 프로젝트 유형이 없습니다. &quot;유형 추가&quot; 버튼으로 추가하세요.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {projectTypes.map((pt, idx) => (
              <div
                key={pt.id}
                draggable
                onDragStart={() => setPtDragIdx(idx)}
                onDragOver={(e) => { e.preventDefault(); setPtDragOverIdx(idx); }}
                onDragEnd={() => { setPtDragIdx(null); setPtDragOverIdx(null); }}
                onDrop={(e) => { e.preventDefault(); if (ptDragIdx !== null) handlePtDrop(ptDragIdx, idx); }}
                className={`flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors ${
                  ptDragIdx === idx ? "opacity-50" : ""
                } ${ptDragOverIdx === idx && ptDragIdx !== idx ? "border-primary bg-primary/5" : ""}`}
              >
                <div className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none select-none">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="5.5" cy="3" r="1.2"/><circle cx="10.5" cy="3" r="1.2"/>
                    <circle cx="5.5" cy="8" r="1.2"/><circle cx="10.5" cy="8" r="1.2"/>
                    <circle cx="5.5" cy="13" r="1.2"/><circle cx="10.5" cy="13" r="1.2"/>
                  </svg>
                </div>
                <span className="font-medium text-sm flex-1">{pt.name}</span>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openTypeDialog(pt)}>
                    수정
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => handleDeleteType(pt)}>
                    삭제
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        </SectionCard>
      </PageSection>

      {/* 프로젝트 유형 추가/수정 다이얼로그 */}
      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingType ? "프로젝트 유형 수정" : "프로젝트 유형 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="type-name">유형명</Label>
            <Input
              id="type-name"
              placeholder="예: 에이전시"
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveType();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveType} disabled={!typeName.trim() || typeSaving}>
              {typeSaving ? "저장 중..." : editingType ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PageSection
        title="매입 유형 관리"
        description="매입·카드거래에 쓰는 계정과목과 부가세 매입세액 공제 여부를 관리합니다. 공제 불가 항목은 빨간 뱃지로 구분됩니다."
        action={
          <Button onClick={() => openExpTypeDialog()} className="w-full sm:w-auto">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            계정과목 추가
          </Button>
        }
      >
        <SectionCard className="gap-4">
          <div className="flex items-center gap-2 rounded-[1.25rem] border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            <Sparkles className="size-4 text-primary" />
            순서를 바꾸면 매입 입력 화면의 선택 순서에도 바로 반영됩니다.
          </div>

          {expTypesLoading ? (
            <div className="flex h-40 items-center justify-center">
              <p className="text-sm text-muted-foreground">불러오는 중...</p>
            </div>
          ) : expenseTypes.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground">
                등록된 매입 유형이 없습니다. &quot;계정과목 추가&quot; 버튼으로 추가하세요.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {expenseTypes.map((et, idx) => (
                <div
                  key={et.id}
                  draggable
                  onDragStart={() => setExpDragIdx(idx)}
                  onDragOver={(e) => { e.preventDefault(); setExpDragOverIdx(idx); }}
                  onDragEnd={() => { setExpDragIdx(null); setExpDragOverIdx(null); }}
                  onDrop={(e) => { e.preventDefault(); if (expDragIdx !== null) handleExpTypeDrop(expDragIdx, idx); }}
                  className={`flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors ${
                    expDragIdx === idx ? "opacity-50" : ""
                  } ${expDragOverIdx === idx && expDragIdx !== idx ? "border-primary bg-primary/5" : ""}`}
                >
                  <div className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none select-none">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="5.5" cy="3" r="1.2"/><circle cx="10.5" cy="3" r="1.2"/>
                      <circle cx="5.5" cy="8" r="1.2"/><circle cx="10.5" cy="8" r="1.2"/>
                      <circle cx="5.5" cy="13" r="1.2"/><circle cx="10.5" cy="13" r="1.2"/>
                    </svg>
                  </div>
                  <span className="font-medium text-sm flex-1">{et.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {et.account_code && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {et.account_code}
                      </Badge>
                    )}
                    {!et.is_vat_deductible && (
                      <Badge variant="destructive" className="text-[10px]">
                        부가세 공제불가
                      </Badge>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openExpTypeDialog(et)}>
                      수정
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => handleDeleteExpType(et)}>
                      삭제
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </PageSection>

      {/* 매입 유형 추가/수정 다이얼로그 */}
      <Dialog open={expTypeDialogOpen} onOpenChange={setExpTypeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExpType ? "매입 유형 수정" : "매입 유형 추가"}</DialogTitle>
            <DialogDescription>
              세무사가 보는 계정과목 이름과 부가세 매입세액 공제 여부를 함께 입력합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="exp-type-name">계정과목명</Label>
              <Input
                id="exp-type-name"
                placeholder="예: 통신비"
                value={expTypeName}
                onChange={(e) => setExpTypeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveExpType();
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-type-code">코드 (선택)</Label>
              <Input
                id="exp-type-code"
                placeholder="예: comm"
                value={expTypeAccountCode}
                onChange={(e) => setExpTypeAccountCode(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                보고서·API에서 식별용으로 쓰는 영문 약어. 비워두어도 됩니다.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/60 p-3">
              <input
                id="exp-type-vat"
                type="checkbox"
                checked={expTypeVatDeductible}
                onChange={(e) => setExpTypeVatDeductible(e.target.checked)}
                className="mt-0.5 size-4 cursor-pointer"
              />
              <Label htmlFor="exp-type-vat" className="cursor-pointer text-sm font-normal">
                부가세 매입세액 공제 가능
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  접대비·비영업용 차량 관련 비용 등은 체크 해제해주세요.
                </span>
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpTypeDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveExpType} disabled={!expTypeName.trim() || expTypeSaving}>
              {expTypeSaving ? "저장 중..." : editingExpType ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PageSection
        title="일정 유형 관리"
        description="캘린더와 일정 입력 다이얼로그에서 쓰는 카테고리를 같은 패턴으로 관리합니다."
        action={
          <Button onClick={() => openSchCatDialog()} className="w-full sm:w-auto">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            유형 추가
          </Button>
        }
      >
        <SectionCard className="gap-4">
        <div className="flex items-center gap-2 rounded-[1.25rem] border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          <Sparkles className="size-4 text-primary" />
          드래그 순서는 일정 작성 다이얼로그와 캘린더 범례에 그대로 반영됩니다.
        </div>

        {schCatLoading ? (
          <div className="flex h-40 items-center justify-center">
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          </div>
        ) : scheduleCategories.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">
              등록된 일정 유형이 없습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {scheduleCategories.map((cat, idx) => (
              <div
                key={cat.id}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) handleSchCatDrop(dragIdx, idx); }}
                className={`flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors ${
                  dragIdx === idx ? "opacity-50" : ""
                } ${dragOverIdx === idx && dragIdx !== idx ? "border-primary bg-primary/5" : ""}`}
              >
                <div className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none select-none">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="5.5" cy="3" r="1.2"/><circle cx="10.5" cy="3" r="1.2"/>
                    <circle cx="5.5" cy="8" r="1.2"/><circle cx="10.5" cy="8" r="1.2"/>
                    <circle cx="5.5" cy="13" r="1.2"/><circle cx="10.5" cy="13" r="1.2"/>
                  </svg>
                </div>
                <span className="inline-block h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="font-medium text-sm flex-1">{cat.label}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">{cat.value}</span>
                <div className="flex gap-1 ml-auto shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openSchCatDialog(cat)}>
                    수정
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => handleDeleteSchCat(cat)}>
                    삭제
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        </SectionCard>
      </PageSection>

      {/* 일정 유형 추가/수정 다이얼로그 */}
      <Dialog open={schCatDialogOpen} onOpenChange={setSchCatDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSchCat ? "일정 유형 수정" : "일정 유형 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="schcat-label">유형명 *</Label>
              <Input
                id="schcat-label"
                placeholder="예: 미팅"
                value={schCatLabel}
                onChange={(e) => setSchCatLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schcat-value">식별값</Label>
              <Input
                id="schcat-value"
                placeholder="자동 생성 (예: meeting)"
                value={schCatValue}
                onChange={(e) => setSchCatValue(e.target.value)}
                disabled={!!editingSchCat}
              />
              <p className="text-xs text-muted-foreground">비워두면 유형명을 기반으로 자동 생성됩니다</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schcat-color">색상</Label>
              <div className="flex items-center gap-3">
                <input
                  id="schcat-color"
                  type="color"
                  value={schCatColor}
                  onChange={(e) => setSchCatColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-input p-0.5"
                />
                <Input
                  value={schCatColor}
                  onChange={(e) => setSchCatColor(e.target.value)}
                  className="w-28 font-mono text-sm"
                  placeholder="#000000"
                />
                <span className="inline-block h-6 w-6 rounded-full" style={{ backgroundColor: schCatColor }} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchCatDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveSchCat} disabled={!schCatLabel.trim() || schCatSaving}>
              {schCatSaving ? "저장 중..." : editingSchCat ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
