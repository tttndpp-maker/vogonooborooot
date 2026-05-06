import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type AppRole } from "@/lib/wagon-roles";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Пользователи — Вагонооборот" }] }),
});

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
};

const ALL_ROLES: AppRole[] = ["ADMIN", "ASU", "STATION"];

function AdminPage() {
  const { roles, loading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, AppRole[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      if (!user) navigate({ to: "/auth" });
      else if (!roles.includes("ADMIN")) navigate({ to: "/" });
    }
  }, [authLoading, user, roles, navigate]);

  const load = async () => {
    setLoading(true);
    const [{ data: ps }, { data: rs }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setProfiles((ps ?? []) as ProfileRow[]);
    const map: Record<string, AppRole[]> = {};
    (rs ?? []).forEach((r) => {
      const uid = r.user_id as string;
      const role = r.role as AppRole;
      map[uid] = [...(map[uid] ?? []), role];
    });
    setRolesByUser(map);
    setLoading(false);
  };

  useEffect(() => {
    if (roles.includes("ADMIN")) load();
  }, [roles]);

  const toggleRole = async (userId: string, role: AppRole, has: boolean) => {
    if (has) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) return toast.error(error.message);
    }
    toast.success("Роль обновлена");
    load();
  };

  if (authLoading || !roles.includes("ADMIN")) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Пользователи и роли</h1>
          <p className="text-sm text-muted-foreground">
            Назначайте роли — это определяет, какие поля вагона может редактировать каждый сотрудник.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Список пользователей</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Загрузка...</div>
            ) : (
              <div className="space-y-3">
                {profiles.map((p) => {
                  const userRoles = rolesByUser[p.id] ?? [];
                  return (
                    <div
                      key={p.id}
                      className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="font-medium">{p.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          Логин: {p.email?.split("@")[0] ?? "—"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {ALL_ROLES.map((r) => {
                          const has = userRoles.includes(r);
                          return (
                            <Button
                              key={r}
                              size="sm"
                              variant={has ? "default" : "outline"}
                              onClick={() => toggleRole(p.id, r, has)}
                              className="h-7 text-xs"
                            >
                              {has ? "✓ " : "+ "}
                              {ROLE_LABELS[r]}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {profiles.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Пользователей пока нет.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="mt-4 text-xs text-muted-foreground">
          <Badge variant="outline" className="mr-1">Совет</Badge>
          Один пользователь может иметь несколько ролей одновременно.
        </p>
      </main>
    </div>
  );
}
