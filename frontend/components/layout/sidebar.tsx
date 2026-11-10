"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { useT } from "@/lib/i18n";
import { NAV_ITEMS } from "./nav-config";

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const t = useT();

  return (
    <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main">
      {NAV_ITEMS.filter((item) => can(item.perm)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? t(item.label) : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-white/15 text-white"
                : "text-white/70 hover:bg-white/10 hover:text-white",
              collapsed && "justify-center px-2",
            )}
          >
            {active ? (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-y-1 start-0 w-1 rounded-full bg-[#BB9D5A]"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            ) : null}
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            {!collapsed ? <span className="truncate">{t(item.label)}</span> : <span className="sr-only">{t(item.label)}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-[width] duration-200 lg:flex",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center gap-3 border-b border-white/10 px-4", collapsed && "justify-center px-2")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="h-9 w-9 rounded-lg" />
        {!collapsed ? (
          <div className="leading-tight">
            <p className="text-sm font-semibold">{t("Meeting Rooms")}</p>
            <p className="text-xs text-white/60">{t("Management & Signage")}</p>
          </div>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto">
        <SidebarNav collapsed={collapsed} />
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-12 items-center justify-center gap-2 border-t border-white/10 text-sm text-white/70 hover:text-white"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4 rtl:rotate-180" /> : <ChevronsLeft className="h-4 w-4 rtl:rotate-180" />}
        {!collapsed ? <span>{t("Collapse")}</span> : null}
      </button>
    </aside>
  );
}
