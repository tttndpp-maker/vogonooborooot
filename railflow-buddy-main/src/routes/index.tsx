import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { CARGOES } from "@/lib/cargo-types";
import { Package } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Грузы — Вагонооборот" },
      { name: "description", content: "Учёт вагонов по типам грузов" },
    ],
  }),
});

function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const result: Record<string, number> = {};
      await Promise.all(
        CARGOES.map(async (c) => {
          const { count } = await supabase
            .from(c.table)
            .select("*", { count: "exact", head: true });
          result[c.slug] = count ?? 0;
        })
      );
      setCounts(result);
    })();
  }, [user]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Журналы по грузам</h1>
          <p className="text-sm text-muted-foreground">Выберите груз, чтобы открыть его журнал вагонов.</p>
        </div>

        <div className="space-y-8">
          {([
            { key: "general", title: "Грузы" },
            { key: "counterparty", title: "Контрагенты" },
          ] as const).map((section) => (
            <section key={section.key}>
              <h2 className="mb-3 text-lg font-semibold tracking-tight">{section.title}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CARGOES.filter((c) => c.category === section.key).map((c) => (
                  <Link key={c.slug} to="/cargo/$slug" params={{ slug: c.slug }}>
                    <Card className="group h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md">
                      <CardContent className="flex items-center gap-4 p-5">
                        <div
                          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold ${c.accent}`}
                        >
                          {c.short}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground">{c.label}</div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Package className="h-3 w-3" />
                            {counts[c.slug] ?? 0} вагонов
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
