"use client";

import { usePathname } from "next/navigation";

import { MobileSidebar, Sidebar } from "@/components/sidebar";
import { SessionGuard } from "@/components/session-guard";
import { BackButton } from "@/components/back-button";
import { NavHistoryRecorder } from "@/components/nav-history";
import { MaskingProvider } from "@/components/masking-provider";
import { MaskModeIndicator } from "@/components/mask-mode-indicator";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isFullWidth =
    (pathname?.startsWith("/dashboard/workspace") ?? false) ||
    (pathname?.startsWith("/dashboard/office") ?? false);
  const isWideContent = pathname?.startsWith("/dashboard/schedules") ?? false;

  return (
    <MaskingProvider>
      <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(13,110,110,0.08),_transparent_30%),radial-gradient(circle_at_top,_rgba(180,131,83,0.08),_transparent_28%)]">
        <SessionGuard />
        <NavHistoryRecorder />
        <MaskModeIndicator />
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <MobileSidebar />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <BackButton />
            <main
              className={cn(
                "min-h-0 flex-1 overflow-x-hidden",
                isFullWidth ? "overflow-y-hidden" : "overflow-y-auto px-4 py-4 md:px-6 md:py-6"
              )}
            >
              <div
                className={cn(
                  "w-full",
                  isFullWidth ? "h-full" : isWideContent ? "" : "mx-auto max-w-7xl"
                )}
              >
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </MaskingProvider>
  );
}
