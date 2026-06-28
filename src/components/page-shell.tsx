"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronRight,
  Inbox,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageFunMessage, type PageFunMessageKey } from "@/components/page-fun-message";
import { useMasking } from "@/components/masking-provider";
import type { MaskCategory } from "@/lib/masking";
import { cn } from "@/lib/utils";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  eyebrow?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  funKey?: PageFunMessageKey;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  titleAccessory?: React.ReactNode;
  className?: string;
};

type PageShellProps = React.ComponentProps<"div"> & {
  compact?: boolean;
};

type StatTone =
  | "default"
  | "brand"
  | "info"
  | "positive"
  | "success"
  | "warning"
  | "danger";

const statToneClasses: Record<StatTone, string> = {
  default: "border-border/70",
  brand: "border-sky-200/80 bg-sky-50/70",
  info: "border-sky-200/80 bg-sky-50/70",
  positive: "border-emerald-200/80 bg-emerald-50/80",
  success: "border-emerald-200/80 bg-emerald-50/80",
  warning: "border-amber-200/80 bg-amber-50/80",
  danger: "border-rose-200/80 bg-rose-50/80",
};

export function PageShell({ className, compact = false, ...props }: PageShellProps) {
  return (
    <div
      className={cn(compact ? "space-y-5 pb-6" : "space-y-6 pb-8", className)}
      {...props}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  funKey,
  breadcrumbs,
  actions,
  titleAccessory,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[1.5rem] border border-border/70 bg-card/85 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/75 lg:flex-row lg:items-start lg:justify-between lg:p-5",
        className
      )}
    >
      <div className="space-y-2.5">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {breadcrumbs.map((item, index) => (
              <React.Fragment key={`${item.label}-${index}`}>
                {index > 0 ? <ChevronRight className="size-4 shrink-0" /> : null}
                {item.href ? (
                  <Link href={item.href} className="transition-colors hover:text-foreground">
                    {item.label}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{item.label}</span>
                )}
              </React.Fragment>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          {eyebrow ? (
            <div className="inline-flex rounded-full border border-primary/10 bg-primary/8 px-2.5 py-0.5 text-[11px] font-medium text-primary">
              {eyebrow}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              {title}
            </h3>
            {titleAccessory}
          </div>

          {funKey || description ? (
            <p className="max-w-3xl text-sm leading-5 text-muted-foreground">
              {funKey ? <PageFunMessage key={funKey} page={funKey} /> : description}
            </p>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div className="flex w-full flex-col gap-1.5 sm:flex-row sm:flex-wrap lg:w-auto lg:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function PageToolbar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[1.5rem] border border-border/70 bg-card/85 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/75 md:p-4",
        className
      )}
      {...props}
    />
  );
}

export function PageSection({
  title,
  description,
  action,
  className,
  children,
}: React.PropsWithChildren<{
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}>) {
  return (
    <section className={cn("space-y-4", className)}>
      <SectionIntro title={title} description={description} action={action} />
      {children}
    </section>
  );
}

export function SectionCard({
  className,
  ...props
}: React.ComponentProps<typeof Card>) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-border/70 bg-card/85 p-5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/75",
        className
      )}
      {...props}
    />
  );
}

export function StatsGrid({
  className,
  columns = 4,
  ...props
}: React.ComponentProps<"div"> & { columns?: 2 | 3 | 4 | 6 }) {
  const gridClass =
    columns === 2
      ? "grid-cols-2"
      : columns === 3
        ? "grid-cols-3"
        : columns === 6
          ? "grid-cols-3 xl:grid-cols-6"
          : "grid-cols-4";

  return <div className={cn("grid gap-2 md:gap-4", gridClass, className)} {...props} />;
}

export function StatCard({
  label,
  value,
  mobileValue,
  description,
  icon: Icon,
  tone = "default",
  compact = false,
  className,
  sensitive,
}: {
  label: string;
  value: React.ReactNode;
  mobileValue?: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  compact?: boolean;
  className?: string;
  sensitive?: MaskCategory | false;
}) {
  const { mask } = useMasking();
  const applyMask = (node: React.ReactNode): React.ReactNode => {
    if (!sensitive) return node;
    if (typeof node === "string" || typeof node === "number") {
      return mask(sensitive, node);
    }
    return node;
  };
  const renderedValue = applyMask(value);
  const renderedMobile = mobileValue != null ? applyMask(mobileValue) : mobileValue;
  return (
    <Card className={cn("min-h-0 md:min-h-[100px] gap-0 overflow-hidden py-0", statToneClasses[tone], className)}>
      <CardContent
        className={cn(
          "flex items-start justify-between",
          compact ? "gap-2.5 p-3.5" : "gap-2 p-2.5 md:gap-3 md:p-4"
        )}
      >
        <div className={cn(compact ? "space-y-1" : "space-y-0.5 md:space-y-1.5")}>
          <p className={cn("font-medium text-muted-foreground", compact ? "text-[11px]" : "text-[11px] md:text-xs")}>
            {label}
          </p>
          {mobileValue != null ? (
            <>
              <div className={cn("font-semibold tracking-tight text-foreground md:hidden", compact ? "text-lg" : "text-sm")}>
                {renderedMobile}
              </div>
              <div className={cn("font-semibold tracking-tight text-foreground hidden md:block", compact ? "text-lg" : "md:text-xl")}>
                {renderedValue}
              </div>
            </>
          ) : (
            <div className={cn("font-semibold tracking-tight text-foreground", compact ? "text-lg" : "text-sm md:text-xl")}>
              {renderedValue}
            </div>
          )}
        </div>
        {Icon ? (
          <div
            className={cn(
              "hidden md:flex shrink-0 items-center justify-center border border-border/60 bg-background/70 text-muted-foreground",
              compact ? "size-9 rounded-xl" : "md:size-10 md:rounded-xl"
            )}
          >
            <Icon className={cn(compact ? "size-4" : "md:size-5")} />
          </div>
        ) : null}
      </CardContent>
      {description ? (
        <div
          className="hidden md:block border-t border-border/60 text-muted-foreground px-4 py-2 text-xs leading-4"
        >
          {description}
        </div>
      ) : null}
    </Card>
  );
}

export function SectionIntro({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function LoadingState({
  label,
  title = "불러오는 중입니다.",
  description = "데이터를 준비하고 있습니다.",
  className,
}: {
  label?: string;
  title?: string;
  description?: string;
  className?: string;
}) {
  const resolvedTitle = label ?? title;

  return (
    <div
      className={cn(
        "flex min-h-48 flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border/80 bg-card/70 px-6 py-10 text-center shadow-sm",
        className
      )}
    >
      <LoaderCircle className="mb-3 size-6 animate-spin text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{resolvedTitle}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function ErrorState({
  title = "데이터를 불러오지 못했습니다.",
  description = "잠시 후 다시 시도해주세요.",
  action,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  const resolvedAction =
    action ??
    (onRetry ? (
      <Button variant="outline" size="sm" onClick={onRetry}>
        다시 시도
      </Button>
    ) : null);

  return (
    <div
      className={cn(
        "flex min-h-48 flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border/80 bg-card/70 px-6 py-10 text-center shadow-sm",
        className
      )}
    >
      <div className="mb-3 flex size-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600">
        <TriangleAlert className="size-5" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {resolvedAction ? <div className="mt-4">{resolvedAction}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title = "아직 데이터가 없습니다.",
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-dashed bg-card/75", className)}>
      <CardHeader className="items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background/80 text-muted-foreground">
          <Icon className="size-5" />
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? (
          <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      {action ? <CardContent className="pt-0 text-center">{action}</CardContent> : null}
    </Card>
  );
}

export function DetailGrid({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", className)} {...props} />
  );
}

export function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-2xl border border-border/70 bg-card/80 p-3 sm:p-4 shadow-sm", className)}
    >
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
