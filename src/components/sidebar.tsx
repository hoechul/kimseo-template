"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MaskModeToggle } from "@/components/mask-mode-toggle";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface MenuItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface MenuSection {
  title: string | null;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    title: null,
    items: [
      {
        label: "워크스페이스",
        href: "/dashboard/workspace",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 3v18" />
            <path d="M15 12h6" />
            <path d="M15 6h6" />
            <path d="M15 18h6" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "영업",
    items: [
      {
        label: "고객관리",
        href: "/dashboard/customers",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h8v14H5a2 2 0 0 1-2-2Z" />
            <path d="M13 5h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6" />
            <path d="M8 10h1" />
            <path d="M8 14h1" />
          </svg>
        ),
      },
      {
        label: "프로젝트관리",
        href: "/dashboard/projects",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "할일",
    items: [
      {
        label: "할일관리",
        href: "/dashboard/tasks",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        ),
      },
      {
        label: "일정관리",
        href: "/dashboard/schedules",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
            <line x1="16" x2="16" y1="2" y2="6" />
            <line x1="8" x2="8" y1="2" y2="6" />
            <line x1="3" x2="21" y1="10" y2="10" />
          </svg>
        ),
      },
      {
        label: "미팅관리",
        href: "/dashboard/meetings",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        ),
      },
      {
        label: "명함관리",
        href: "/dashboard/business-cards",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M7 10h6" />
            <path d="M7 14h4" />
            <path d="M17 9a2 2 0 1 1 0 4a2 2 0 0 1 0-4z" />
          </svg>
        ),
      },
      {
        label: "자료실",
        href: "/dashboard/resource-library",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
            <path d="M8 7h8" />
            <path d="M8 11h8" />
            <path d="M8 15h5" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "재무",
    items: [
      {
        label: "견적관리",
        href: "/dashboard/quotations",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" x2="8" y1="13" y2="13" />
            <line x1="16" x2="8" y1="17" y2="17" />
            <line x1="10" x2="8" y1="9" y2="9" />
          </svg>
        ),
      },
      {
        label: "매출관리",
        href: "/dashboard/revenues",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" x2="12" y1="2" y2="22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        ),
      },
      {
        label: "입금관리",
        href: "/dashboard/deposits",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
          </svg>
        ),
      },
      {
        label: "매입관리",
        href: "/dashboard/expenses",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M3 14h18" />
            <path d="M16 10l5 4-5 4" />
          </svg>
        ),
      },
      {
        label: "카드사용내역",
        href: "/dashboard/card-transactions",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="7" y1="9" x2="17" y2="9" />
            <line x1="7" y1="13" x2="17" y2="13" />
            <line x1="7" y1="17" x2="13" y2="17" />
          </svg>
        ),
      },
      {
        label: "영업이익분석",
        href: "/dashboard/profit-analysis",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18" />
            <path d="M7 14l4-4 4 4 6-6" />
          </svg>
        ),
      },
    ],
  },
  {
    title: "시스템",
    items: [
      {
        label: "재직증명서",
        href: "/dashboard/certificates",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            <path d="M9 15l2 2 4-4" />
          </svg>
        ),
      },
    ],
  },
];

const adminMenuItems: MenuItem[] = [
  {
    label: "법인카드",
    href: "/dashboard/cards",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
        <line x1="6" y1="15" x2="10" y2="15" />
      </svg>
    ),
  },
  {
    label: "직원관리",
    href: "/dashboard/employees",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: "시스템 설정",
    href: "/dashboard/settings",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
];

const allMenuItems = [...menuSections.flatMap((section) => section.items), ...adminMenuItems];

interface CurrentUser {
  name: string;
  department: string | null;
  position: string | null;
  employee_type: string | null;
}

interface CurrentUserState {
  user: CurrentUser | null;
  hasSession: boolean;
  isResolved: boolean;
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return null;
  }

  return (
    <Link href="/dashboard/workspace" className={cn("group flex items-center gap-3", collapsed && "justify-center")}>
      <div className="overflow-hidden rounded-2xl border border-primary/15 bg-white/80 p-1 shadow-[0_18px_36px_-24px_rgba(13,105,106,0.55)]">
        <Image src="/logo.png" alt="김비서 로고" width={40} height={40} className="h-10 w-10 rounded-xl object-cover" />
      </div>
      {!collapsed ? (
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">김비서</span>
        </div>
      ) : null}
    </Link>
  );
}

function NavItem({
  item,
  collapsed = false,
  onNavigate,
  pathname,
}: {
  item: MenuItem;
  collapsed?: boolean;
  onNavigate?: () => void;
  pathname: string;
}) {
  const isActive =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href) && item.href !== "#";

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm transition-all",
        isActive
          ? "border-primary/15 bg-primary/95 text-primary-foreground shadow-[0_16px_32px_-22px_rgba(13,105,106,0.7)]"
          : "border-transparent text-muted-foreground hover:border-primary/10 hover:bg-white/70 hover:text-foreground",
        collapsed && "justify-center px-0"
      )}
    >
      <span className={cn("shrink-0", !isActive && "text-primary/90 group-hover:text-primary")}>{item.icon}</span>
      {!collapsed ? <span>{item.label}</span> : null}
    </Link>
  );
}

function SidebarNav({
  collapsed = false,
  isAdmin = false,
  onNavigate,
}: {
  collapsed?: boolean;
  isAdmin?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col overflow-y-auto px-3 pb-3">
      {menuSections.map((section) => (
        <div key={section.title ?? "_top"} className={section.title ? "mt-3" : ""}>
          {section.title && !collapsed ? (
            <div className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {section.title}
            </div>
          ) : null}
          {section.title && collapsed ? (
            <div className="mx-auto my-2 h-px w-8 bg-border/80" />
          ) : null}
          <div className="space-y-1">
            {section.items.map((item) => (
              <NavItem
                key={item.label}
                item={item}
                collapsed={collapsed}
                onNavigate={onNavigate}
                pathname={pathname}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="mt-auto pt-4 space-y-1">
        {isAdmin ? (
          <div className="pt-2">
            {!collapsed ? (
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                관리자 메뉴
              </div>
            ) : null}
            <div className="space-y-1">
              {adminMenuItems.map((item) => (
                <NavItem
                  key={item.label}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                  pathname={pathname}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}

function useCurrentUser() {
  const [state, setState] = useState<CurrentUserState>({
    user: null,
    hasSession: false,
    isResolved: false,
  });

  useEffect(() => {
    const supabase = createClient();
    let isActive = true;

    const syncCurrentUser = async (authUser?: User | null) => {
      try {
        const resolvedAuthUser =
          authUser !== undefined
            ? authUser
            : (await supabase.auth.getUser()).data.user;

        if (!isActive) {
          return;
        }

        if (!resolvedAuthUser) {
          setState({
            user: null,
            hasSession: false,
            isResolved: true,
          });
          return;
        }

        const fallbackUser: CurrentUser = {
          name: resolvedAuthUser.email?.split("@")[0] ?? "사용자",
          department: null,
          position: null,
          employee_type: null,
        };

        const { data: employee } = await supabase
          .from("employees")
          .select("name, department, position, employee_type")
          .eq("auth_uid", resolvedAuthUser.id)
          .maybeSingle();

        if (!isActive) {
          return;
        }

        setState({
          user: employee ?? fallbackUser,
          hasSession: true,
          isResolved: true,
        });
      } catch {
        if (!isActive) {
          return;
        }

        setState({
          user: null,
          hasSession: false,
          isResolved: true,
        });
      }
    };

    void syncCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncCurrentUser(session?.user ?? null);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

function UserProfile({
  collapsed = false,
  user,
  onNavigate,
}: {
  collapsed?: boolean;
  user: CurrentUser | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname.startsWith("/dashboard/my");
  const subtitle = [user?.department, user?.position].filter(Boolean).join(" · ") || user?.employee_type || "직원";

  if (!user) return null;

  return (
    <Link
      href="/dashboard/my"
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm transition-all",
        isActive
          ? "border-primary/15 bg-primary/95 text-primary-foreground shadow-[0_16px_32px_-22px_rgba(13,105,106,0.72)]"
          : "border-white/50 bg-white/65 text-muted-foreground hover:border-primary/10 hover:bg-white/80 hover:text-foreground",
        collapsed && "justify-center px-0"
      )}
      title={collapsed ? user.name : undefined}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium",
          isActive ? "bg-primary-foreground/18 text-primary-foreground" : "bg-primary/10 text-primary"
        )}
      >
        {user.name.charAt(0)}
      </div>
      {!collapsed ? (
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-medium", isActive ? "text-primary-foreground" : "text-foreground")}>
            {user.name}
          </p>
          <p className={cn("truncate text-xs", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
            {subtitle}
          </p>
        </div>
      ) : null}
    </Link>
  );
}

function SidebarFooter({
  collapsed = false,
  user,
  hasSession,
  isResolved,
  onNavigate,
}: {
  collapsed?: boolean;
  user: CurrentUser | null;
  hasSession: boolean;
  isResolved: boolean;
  onNavigate?: () => void;
}) {
  const fallbackTitle = !isResolved
    ? "계정 확인 중"
    : hasSession
      ? "사용자 정보 확인 필요"
      : "세션이 끊어졌습니다";
  const fallbackSubtitle = !isResolved
    ? "세션 상태를 확인하고 있습니다."
    : hasSession
      ? "프로필 정보를 불러오지 못했습니다."
      : "로그아웃 후 다시 로그인해 주세요.";

  return (
    <div>
      {user ? (
        <UserProfile collapsed={collapsed} user={user} onNavigate={onNavigate} />
      ) : (
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl border border-dashed border-sidebar-border/80 bg-white/45 px-3 py-3 text-sm text-muted-foreground",
            collapsed && "justify-center px-0"
          )}
          title={collapsed ? fallbackTitle : undefined}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            ?
          </div>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{fallbackTitle}</p>
              <p className="truncate text-xs text-muted-foreground">{fallbackSubtitle}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user: currentUser, hasSession, isResolved } = useCurrentUser();
  const isAdmin = currentUser?.employee_type === "관리자";

  return (
    <aside
      className={cn(
        "hidden h-screen shrink-0 flex-col transition-all duration-300 md:sticky md:top-0 md:flex",
        collapsed ? "w-20" : "w-72"
      )}
    >
      <div className="m-3 flex h-[calc(100vh-1.5rem)] flex-col rounded-[2rem] border border-white/70 bg-sidebar/85 shadow-[0_28px_70px_-38px_rgba(13,77,77,0.4)] backdrop-blur-md">
        <div className="flex items-center gap-3 border-b border-sidebar-border/70 px-4 py-4">
          <Brand collapsed={collapsed} />
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-9 w-9 rounded-2xl", collapsed ? "mx-auto" : "ml-auto")}
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            )}
          </Button>
        </div>

        <SidebarNav collapsed={collapsed} isAdmin={isAdmin} />

        <div className="border-t border-sidebar-border/70 p-3 space-y-2">
          <MaskModeToggle collapsed={collapsed} />
          <SidebarFooter
            collapsed={collapsed}
            user={currentUser}
            hasSession={hasSession}
            isResolved={isResolved}
          />
        </div>
      </div>
    </aside>
  );
}

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user: currentUser, hasSession, isResolved } = useCurrentUser();
  const isAdmin = currentUser?.employee_type === "관리자";
  const currentLabel =
    allMenuItems.find((item) =>
      item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href)
    )?.label ?? "작업 공간";

  return (
    <header className="sticky top-0 z-30 px-4 pt-4 md:hidden">
      <div className="surface-panel flex h-16 items-center justify-between px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{currentLabel}</p>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-2xl" aria-label="메뉴 열기">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </svg>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] border-r-0 bg-transparent p-3 shadow-none">
            <SheetTitle className="sr-only">김비서 메뉴</SheetTitle>
            <div className="flex h-full flex-col rounded-[2rem] border border-white/70 bg-sidebar/95 shadow-[0_28px_70px_-38px_rgba(13,77,77,0.42)] backdrop-blur-md">
              <div className="border-b border-sidebar-border/70 px-4 py-4">
                <Brand />
              </div>
              <SidebarNav isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
              <div className="border-t border-sidebar-border/70 p-3 space-y-2">
                <MaskModeToggle />
                <SidebarFooter
                  user={currentUser}
                  hasSession={hasSession}
                  isResolved={isResolved}
                  onNavigate={() => setOpen(false)}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
