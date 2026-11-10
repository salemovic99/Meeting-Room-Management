"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Loader2, LogIn } from "lucide-react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, errorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { loginSchema, type LoginValues } from "@/schemas/auth";

/** Accept only same-origin paths like "/book/room-01" — never "//host" or "https://…". */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/overview";
  return raw;
}

function LoginForm() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { login, status } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const next = safeNext(params.get("next"));

  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, router, next]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values.email, values.password);
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError("Too many attempts. Please wait and try again.");
      else if (err instanceof ApiError && err.status === 401) setError("Invalid email or password.");
      else setError(errorMessage(err));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardHeader className="items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="mb-2 h-14 w-14" />
            <CardTitle className="text-2xl">{t("Meeting Room Management")}</CardTitle>
            <CardDescription>{t("Sign in with your corporate account")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <FormField label={t("Email")} htmlFor="email" error={form.formState.errors.email?.message} required>
                <Input id="email" type="email" autoComplete="username" autoFocus {...form.register("email")} />
              </FormField>
              <FormField label={t("Password")} htmlFor="password" error={form.formState.errors.password?.message} required>
                <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
              </FormField>
              {error ? (
                <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <LogIn />}
                {t("Sign in")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
