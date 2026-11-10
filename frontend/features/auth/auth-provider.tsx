"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, onSessionChange, refreshSession, setSession } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import type { Me, PermissionCode, TokenResponse } from "@/lib/types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: Me | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
  can: (perm: PermissionCode | PermissionCode[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const queryClient = useQueryClient();

  useEffect(() => {
    const off = onSessionChange((session) => {
      if (session) {
        setUser(session.user);
        setStatus("authenticated");
      } else {
        setUser(null);
        setStatus("unauthenticated");
      }
    });
    // Skip the user bootstrap on TV display pages — they use device credentials.
    if (window.location.pathname.startsWith("/display/")) {
      setStatus("unauthenticated");
    } else {
      void refreshSession().then((s) => {
        if (!s) setStatus("unauthenticated");
      });
    }
    return off;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api<TokenResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    setSession(session);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api<void>("/auth/logout", { method: "POST" });
    } finally {
      setSession(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const reloadUser = useCallback(async () => {
    const me = await api<Me>("/auth/me");
    setUser(me);
  }, []);

  const can = useCallback((perm: PermissionCode | PermissionCode[]) => hasPermission(user, perm), [user]);

  const value = useMemo(
    () => ({ user, status, login, logout, reloadUser, can }),
    [user, status, login, logout, reloadUser, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function usePermission(perm: PermissionCode | PermissionCode[]): boolean {
  return useAuth().can(perm);
}
