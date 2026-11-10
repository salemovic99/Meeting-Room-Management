"use client";

import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { RolesMatrix } from "@/features/settings/roles-matrix";
import { SystemSettingsForm } from "@/features/settings/system-settings-form";
import { useT } from "@/lib/i18n";

export default function SettingsPage() {
  const t = useT();
  const { can } = useAuth();
  const canSettings = can("settings.manage");
  const canRoles = can("roles.manage");
  const defaultTab = canSettings ? "system" : "roles";

  return (
    <>
      <PageHeader title={t("Settings")} />
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {canSettings ? <TabsTrigger value="system">{t("System")}</TabsTrigger> : null}
          {canRoles ? <TabsTrigger value="roles">{t("Roles & permissions")}</TabsTrigger> : null}
        </TabsList>
        {canSettings ? (
          <TabsContent value="system">
            <SystemSettingsForm />
          </TabsContent>
        ) : null}
        {canRoles ? (
          <TabsContent value="roles">
            <RolesMatrix />
          </TabsContent>
        ) : null}
      </Tabs>
    </>
  );
}
