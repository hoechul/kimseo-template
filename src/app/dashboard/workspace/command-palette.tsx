"use client";

import { Building2, FolderKanban } from "lucide-react";
import { useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Customer, Project } from "@/lib/types";

interface CommandPaletteProps {
  projects: Project[];
  customers: Customer[];
  onSelectCustomer: (customerId: string) => void;
  onSelectProject: (projectId: string) => void;
}

export function CommandPalette({
  projects,
  customers,
  onSelectCustomer,
  onSelectProject,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="빠른 점프"
      description="프로젝트와 고객을 검색해 점프합니다."
    >
      <CommandInput placeholder="프로젝트·고객·번호로 검색…" />
      <CommandList>
        <CommandEmpty>일치하는 항목 없음</CommandEmpty>
        <CommandGroup heading="프로젝트">
          {projects.map((p) => {
            const customerName = p.customers?.name ?? "";
            const value = `${p.name} ${customerName} ${p.project_number}`;
            return (
              <CommandItem
                key={p.id}
                value={value}
                onSelect={() => {
                  onSelectProject(p.id);
                  setOpen(false);
                }}
              >
                <FolderKanban className="text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{p.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {customerName || "—"} · {p.status}
                    {p.project_number ? ` · ${p.project_number}` : ""}
                  </div>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="고객">
          {customers.map((customer) => {
            const value = [
              customer.name,
              customer.representative_name,
              customer.business_number,
              customer.contact_name,
              customer.contact_email,
              customer.contact_phone,
            ]
              .filter(Boolean)
              .join(" ");
            const meta = [
              customer.representative_name ? `대표 ${customer.representative_name}` : null,
              customer.business_number,
              customer.contact_name ? `담당 ${customer.contact_name}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <CommandItem
                key={customer.id}
                value={value}
                onSelect={() => {
                  onSelectCustomer(customer.id);
                  setOpen(false);
                }}
              >
                <Building2 className="text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{customer.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {meta || "고객 상세"}
                  </div>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
