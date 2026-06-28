export const PROJECT_STATUS_OPTIONS = ["진행예정", "진행중", "완료", "보류", "취소"] as const;
export type ProjectStatus = (typeof PROJECT_STATUS_OPTIONS)[number];

export const PROJECT_STATUS_TABS = ["전체", ...PROJECT_STATUS_OPTIONS] as const;
export type ProjectStatusTab = (typeof PROJECT_STATUS_TABS)[number];

export function projectStatusButtonClass(status: string) {
  switch (status) {
    case "진행중":
      return "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100";
    case "완료":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
    case "진행예정":
      return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100";
    case "보류":
      return "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100";
    case "취소":
      return "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100";
    default:
      return "border-border text-muted-foreground";
  }
}
