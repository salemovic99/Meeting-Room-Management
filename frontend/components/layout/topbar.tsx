"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Languages, LogOut, Menu, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/features/auth/auth-provider";
import { useI18n } from "@/lib/i18n";
import { initials } from "@/lib/utils";
import type { SocketState } from "@/lib/ws";
import { ThemeToggle } from "./theme-toggle";
import { ChangePasswordDialog } from "./change-password-dialog";
import { SidebarNav } from "./sidebar";

export function Topbar({ realtime }: { realtime: SocketState }) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [pwOpen, setPwOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <Menu />
      </Button>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="bg-[hsl(var(--sidebar))] p-0 text-white">
          <SheetTitle className="px-6 pt-6 text-white">{t("Meeting Rooms")}</SheetTitle>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1" />

      <span
        className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex"
        title={t("Realtime updates")}
      >
        {realtime === "open" ? <Wifi className="h-4 w-4 text-success" /> : <WifiOff className="h-4 w-4 text-warning" />}
        {realtime === "open" ? t("Live") : t("Reconnecting…")}
      </span>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setLang(lang === "en" ? "ar" : "en")}
        aria-label={lang === "en" ? "التبديل إلى العربية" : "Switch to English"}
        title={lang === "en" ? "العربية" : "English"}
      >
        <Languages />
      </Button>
      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {user ? initials(user.full_name) : "?"}
            </span>
            <span className="hidden text-start leading-tight md:block">
              <span className="block text-sm font-medium">{user?.full_name}</span>
              <span className="block text-xs text-muted-foreground">{user?.roles.map((r) => r.replace("_", " ")).join(", ")}</span>
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">{user?.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPwOpen(true)}>
            <KeyRound /> {t("Change password")}
          </DropdownMenuItem>
          <DropdownMenuItem
            destructive
            onSelect={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            <LogOut /> {t("Logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </header>
  );
}
