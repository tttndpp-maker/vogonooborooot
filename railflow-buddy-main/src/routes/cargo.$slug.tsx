import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  ALL_FIELDS,
  FIELD_META,
  TIME_FIELDS,
  canEditField,
  type WagonField,
} from "@/lib/wagon-roles";
import { CARGOES, cargoBySlug } from "@/lib/cargo-types";
import { fmtShort, isoToDateTimeLocal, nowDateTimeLocal, nowIso, timeToIso } from "@/lib/time-utils";

export const Route = createFileRoute("/cargo/$slug")({
  component: CargoJournalPage,
  head: ({ params }) => {
    const c = cargoBySlug(params.slug);
    return {
      meta: [
        { title: `${c?.label ?? "Груз"} — Журнал вагонов` },
      ],
    };
  },
});

type WagonRow = {
  id: string;
  created_at: string;
} & Record<WagonField, string | null>;

const COLUMNS: WagonField[] = [
  "wagon_number",
  "asa_arrival_time",
  "balance_ndfz_time",
  "asa_dispatch_time",
  "train_number_asa",
  "fosfor_arrival_time",
  "cargo_submit_time",
  "cargo_operations",
  "request_submit_time",
  "track_assignment_time",
  "fosfor_dispatch_time",
  "train_number_fosfor",
  "asa_return_arrival_time",
  "asa_handover_time",
  "note",
];

const STAGE_BAR = {
  asa: "bg-stage-asa",
  fosfor: "bg-stage-fosfor",
  cargo: "bg-stage-cargo",
} as const;

function CargoJournalPage() {
  const { slug } = Route.useParams();
  const cargo = cargoBySlug(slug);
  const { user, roles, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isAdmin = roles.includes("ADMIN");

  const [wagons, setWagons] = useState<WagonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<WagonRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!cargo && !authLoading) navigate({ to: "/" });
  }, [cargo, authLoading, navigate]);

  const load = async () => {
    if (!cargo) return;
    setLoading(true);
    const { data, error } = await supabase
      .from(cargo.table)
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setWagons((data ?? []) as WagonRow[]);
  };

  useEffect(() => {
    if (user && cargo) load();
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cargo?.table]);

  // Realtime
  useEffect(() => {
    if (!user || !cargo) return;
    const channel = supabase
      .channel(`${cargo.table}-changes`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: cargo.table },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cargo?.table]);

  // Daily stats: arrivals & dispatches — independent dates per event
  const todayStr = (() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();
  const [arrivalDate, setArrivalDate] = useState<string>(todayStr);
  const [dispatchDate, setDispatchDate] = useState<string>(todayStr);

  const countInDay = (dateStr: string, field: "asa_arrival_time" | "asa_dispatch_time") => {
    if (!dateStr) return 0;
    const start = new Date(dateStr + "T00:00:00").getTime();
    const end = new Date(dateStr + "T23:59:59").getTime();
    let n = 0;
    for (const w of wagons) {
      const iso = w[field];
      if (!iso) continue;
      const t = new Date(iso).getTime();
      if (t >= start && t <= end) n++;
    }
    return n;
  };

  const dayStats = useMemo(
    () => ({
      arrived: countInDay(arrivalDate, "asa_arrival_time"),
      dispatched: countInDay(dispatchDate, "asa_dispatch_time"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wagons, arrivalDate, dispatchDate],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return wagons.filter((w) => {
      if (s && !w.wagon_number?.toLowerCase().includes(s)) return false;
      if (fromTs || toTs) {
        const t = new Date(w.created_at).getTime();
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      return true;
    });
  }, [wagons, search, dateFrom, dateTo]);

  const handleDelete = async () => {
    if (!deleteId || !cargo) return;
    const { error } = await supabase.from(cargo.table).delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else {
      toast.success("Вагон удалён");
      setWagons((p) => p.filter((w) => w.id !== deleteId));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(deleteId);
        return n;
      });
    }
    setDeleteId(null);
  };

  const handleBulkDelete = async () => {
    if (!cargo || selected.size === 0) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from(cargo.table).delete().in("id", ids);
    if (error) toast.error(error.message);
    else {
      toast.success(`Удалено вагонов: ${ids.length}`);
      setWagons((p) => p.filter((w) => !selected.has(w.id)));
      setSelected(new Set());
    }
    setBulkDeleteOpen(false);
  };

  const toggleSel = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((w) => w.id)));
  };

  const exportToExcel = (rows: WagonRow[], suffix = "") => {
    if (!cargo) return;
    if (rows.length === 0) {
      toast.error("Нет данных для экспорта");
      return;
    }
    const data = rows.map((w) => {
      const obj: Record<string, string> = {};
      for (const f of COLUMNS) {
        const meta = FIELD_META[f];
        const v = w[f];
        obj[meta.label] = meta.type === "datetime" ? fmtShort(v) : (v ?? "");
      }
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cargo.short || "Вагоны");
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${cargo.label}_${suffix || "журнал"}_${date}.xlsx`);
    toast.success(`Экспортировано: ${rows.length}`);
  };

  if (authLoading || !user || !cargo) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Загрузка...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <AppHeader />

      <main className="mx-auto max-w-[1700px] space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg font-bold ${cargo.accent}`}
            >
              {cargo.short}
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{cargo.label}</h1>
              <p className="text-xs text-muted-foreground">
                Показано: {filtered.length} из {wagons.length}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск № вагона..."
                className="w-56 pl-8"
              />
            </div>
            <div className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1">
              <Label className="text-xs text-muted-foreground">С</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-7 w-[140px] border-0 px-1 text-xs"
              />
              <Label className="text-xs text-muted-foreground">По</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-7 w-[140px] border-0 px-1 text-xs"
              />
              {(dateFrom || dateTo) && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  title="Сбросить фильтр"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={() => setAnalyticsOpen(true)}>
              <BarChart3 className="mr-1 h-4 w-4" /> Аналитика
            </Button>
            <BulkTimeButton
              disabled={selected.size === 0}
              onOpen={() => setBulkOpen(true)}
              count={selected.size}
            />
            {isAdmin && (
              <Button
                variant="outline"
                disabled={selected.size === 0}
                onClick={() => setBulkDeleteOpen(true)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Удалить выбранные {selected.size > 0 && `(${selected.size})`}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                const rows = selected.size > 0
                  ? filtered.filter((w) => selected.has(w.id))
                  : filtered;
                exportToExcel(rows, selected.size > 0 ? "выбранные" : "журнал");
              }}
            >
              <Download className="mr-1 h-4 w-4" />
              Экспорт в Excel {selected.size > 0 && `(${selected.size})`}
            </Button>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1 h-4 w-4" /> Добавить
                </Button>
              </DialogTrigger>
              <AddWagonForm
                table={cargo.table}
                onClose={() => setAddOpen(false)}
                onAdded={load}
              />
            </Dialog>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Label className="text-xs font-medium uppercase text-muted-foreground">
              Статистика по дням
            </Label>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-md bg-stage-asa/10 px-3 py-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-stage-asa" />
              <span className="text-xs text-muted-foreground">Прибыло в Аса</span>
              <Input
                type="date"
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
                className="h-7 w-[140px] text-xs"
              />
              <span className="text-base font-bold tabular-nums text-foreground">{dayStats.arrived}</span>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-stage-fosfor/10 px-3 py-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-stage-fosfor" />
              <span className="text-xs text-muted-foreground">Отправлено из Аса</span>
              <Input
                type="date"
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
                className="h-7 w-[140px] text-xs"
              />
              <span className="text-base font-bold tabular-nums text-foreground">{dayStats.dispatched}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b">
                  <th className="sticky left-0 z-10 bg-card px-2 py-2.5 w-10">
                    <Checkbox
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onCheckedChange={toggleAll}
                      aria-label="Выбрать все"
                    />
                  </th>
                  <th className="bg-card px-2 py-2.5 text-left text-xs font-medium uppercase text-muted-foreground">
                    Действия
                  </th>
                  {COLUMNS.map((field) => {
                    const meta = FIELD_META[field];
                    return (
                      <th
                        key={field}
                        className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase text-muted-foreground"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block h-2 w-2 rounded-full ${STAGE_BAR[meta.stage]}`} />
                          {meta.label}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={COLUMNS.length + 2} className="p-8 text-center text-muted-foreground">
                      Загрузка...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length + 2} className="p-8 text-center text-muted-foreground">
                      Нет записей
                    </td>
                  </tr>
                ) : (
                  filtered.map((w) => (
                    <tr
                      key={w.id}
                      className={`border-b transition-colors hover:bg-secondary/40 ${selected.has(w.id) ? "bg-primary/5" : ""}`}
                    >
                      <td className="sticky left-0 z-10 bg-card px-2 py-2">
                        <Checkbox
                          checked={selected.has(w.id)}
                          onCheckedChange={() => toggleSel(w.id)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setEditing(w)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setDeleteId(w.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                      {COLUMNS.map((field) => {
                        const meta = FIELD_META[field];
                        const v = w[field];
                        return (
                          <td key={field} className="whitespace-nowrap px-3 py-2">
                            {field === "wagon_number" ? (
                              <span className="font-mono font-medium text-foreground">{v ?? "—"}</span>
                            ) : meta.type === "datetime" ? (
                              <span className="font-mono text-xs text-foreground/80">{fmtShort(v)}</span>
                            ) : (
                              <span className="text-foreground/80">{v ?? "—"}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {(["asa", "fosfor", "cargo"] as const).map((s) => (
            <Badge key={s} variant="outline" className="gap-1.5 font-normal">
              <span className={`inline-block h-2 w-2 rounded-full ${STAGE_BAR[s]}`} />
              {s === "asa" ? "Аса" : s === "fosfor" ? "Фосфорная" : "Грузовые"}
            </Badge>
          ))}
        </div>
      </main>

      {/* Edit dialog */}
      <EditWagonDialog
        wagon={editing}
        table={cargo.table}
        bulkIds={
          editing && selected.has(editing.id) && selected.size > 1
            ? Array.from(selected)
            : null
        }
        onClose={() => setEditing(null)}
        onSaved={() => {
          load();
          if (editing && selected.has(editing.id) && selected.size > 1) {
            setSelected(new Set());
          }
        }}
      />

      {/* Bulk time dialog */}
      <BulkTimeDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        table={cargo.table}
        ids={Array.from(selected)}
        onSaved={() => {
          setBulkOpen(false);
          setSelected(new Set());
          load();
        }}
      />

      {/* Analytics dialog */}
      <AnalyticsDialog
        open={analyticsOpen}
        onOpenChange={setAnalyticsOpen}
        cargoLabel={cargo.label}
        allWagons={wagons}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить вагон?</AlertDialogTitle>
            <AlertDialogDescription>Действие нельзя отменить.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить выбранные вагоны?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет удалено вагонов: {selected.size}. Действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

void ALL_FIELDS;
void CARGOES;

/* ---------------- subcomponents ---------------- */

function BulkTimeButton({
  disabled,
  count,
  onOpen,
}: {
  disabled: boolean;
  count: number;
  onOpen: () => void;
}) {
  return (
    <Button variant="outline" disabled={disabled} onClick={onOpen}>
      <Clock className="mr-1 h-4 w-4" />
      Время для выбранных {count > 0 && `(${count})`}
    </Button>
  );
}

function AddWagonForm({
  table,
  onClose,
  onAdded,
}: {
  table: ReturnType<typeof cargoBySlug> extends infer T ? T extends { table: infer U } ? U : never : never;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { user } = useAuth();
  const [num, setNum] = useState("");
  const [saving, setSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const save = async (keepOpen: boolean) => {
    if (!num.trim()) {
      toast.error("Укажите номер вагона");
      return;
    }
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from(table)
      .insert({ wagon_number: num.trim(), created_by: user.id });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Вагон добавлен");
    setNum("");
    onAdded();
    if (keepOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      onClose();
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save(true);
  };

  return (
    <DialogContent className="max-w-md sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Новый вагон</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="wn">Номер вагона</Label>
          <Input
            id="wn"
            ref={inputRef}
            autoFocus
            value={num}
            onChange={(e) => setNum(e.target.value)}
            placeholder="например, 56234578"
          />
          <p className="text-xs text-muted-foreground">
            Нажмите Enter, чтобы добавить и продолжить ввод следующего вагона.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Готово</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Создание..." : "Добавить и продолжить"}
          </Button>
          <Button type="button" disabled={saving} onClick={() => save(false)}>
            Создать и закрыть
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditWagonDialog({
  wagon,
  table,
  bulkIds,
  onClose,
  onSaved,
}: {
  wagon: WagonRow | null;
  table: ReturnType<typeof cargoBySlug> extends infer T ? T extends { table: infer U } ? U : never : never;
  bulkIds: string[] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { roles } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const isBulk = !!bulkIds && bulkIds.length > 1;

  useEffect(() => {
    if (wagon) {
      const init: Record<string, string> = {};
      ALL_FIELDS.forEach((f) => {
        const v = wagon[f];
        if (FIELD_META[f].type === "datetime") init[f] = isoToDateTimeLocal(v);
        else init[f] = v ?? "";
      });
      setValues(init);
    } else {
      setValues({});
    }
  }, [wagon]);

  const setNow = (field: WagonField) => {
    setValues((v) => ({ ...v, [field]: nowDateTimeLocal() }));
  };

  const save = async () => {
    if (!wagon) return;
    setSaving(true);
    const update: Record<string, string | null> = {};
    for (const f of ALL_FIELDS) {
      if (!canEditField(roles, f)) continue;
      if (isBulk && f === "wagon_number") continue;
      const raw = values[f];
      if (FIELD_META[f].type === "datetime") {
        if (raw === "") update[f] = null;
        else {
          const iso = timeToIso(raw);
          if (iso === null && raw) {
            setSaving(false);
            return toast.error(`Неверное время в поле "${FIELD_META[f].label}". Формат ЧЧ:ММ`);
          }
          update[f] = iso;
        }
      } else {
        update[f] = raw === "" ? null : raw;
      }
    }
    if (Object.keys(update).length === 0) {
      setSaving(false);
      return toast.error("Нет прав на редактирование");
    }
    let error: { message: string } | null = null;
    if (isBulk && bulkIds) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (supabase.from(table) as any).update(update).in("id", bulkIds);
      error = res.error;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (supabase.from(table) as any).update(update).eq("id", wagon.id);
      error = res.error;
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isBulk ? `Сохранено для ${bulkIds!.length} вагонов` : "Сохранено");
    onSaved();
    onClose();
  };

  const grouped = (["asa", "fosfor", "cargo"] as const).map((stage) => ({
    stage,
    fields: ALL_FIELDS.filter((f) => FIELD_META[f].stage === stage && f !== "platform_number"),
  }));

  const stageLabels = { asa: "Станция Аса", fosfor: "Станция Фосфорная", cargo: "Грузовые / прочее" };
  const stageClass = {
    asa: "bg-stage-asa text-stage-asa-foreground",
    fosfor: "bg-stage-fosfor text-stage-fosfor-foreground",
    cargo: "bg-stage-cargo text-stage-cargo-foreground",
  } as const;

  return (
    <Dialog open={!!wagon} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isBulk
              ? `Массовое редактирование (${bulkIds!.length} вагонов)`
              : `Вагон №${wagon?.wagon_number ?? ""}`}
            <Badge variant="outline" className="ml-2 font-normal">Сегодня, {new Date().toLocaleDateString("ru-RU")}</Badge>
          </DialogTitle>
          {isBulk && (
            <p className="text-xs text-muted-foreground">
              Все заполненные поля будут применены ко всем выбранным вагонам. Пустые — очистят значение. Поле «№ вагона» не меняется.
            </p>
          )}
        </DialogHeader>

        <div className="space-y-5">
          {grouped.map(({ stage, fields }) => (
            <div key={stage} className="rounded-lg border bg-card p-4">
              <div className={`mb-3 inline-block rounded-md px-2.5 py-1 text-xs font-medium ${stageClass[stage]}`}>
                {stageLabels[stage]}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((field) => {
                  const meta = FIELD_META[field];
                  const editable = canEditField(roles, field);
                  return (
                    <div key={field} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {meta.label}
                        {!editable && <span className="ml-1 text-[10px] uppercase">(только чтение)</span>}
                      </Label>
                      {field === "cargo_operations" || field === "note" ? (
                        <Textarea
                          rows={2}
                          disabled={!editable}
                          value={values[field] ?? ""}
                          onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                        />
                      ) : meta.type === "datetime" ? (
                        <div className="flex gap-1.5">
                          <Input
                            type="datetime-local"
                            disabled={!editable}
                            value={values[field] ?? ""}
                            onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                            className="font-mono"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!editable}
                            onClick={() => setNow(field)}
                            title="Сейчас"
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Input
                          disabled={!editable || field === "wagon_number"}
                          value={values[field] ?? ""}
                          onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Сохранение..." : "Сохранить"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkTimeDialog({
  open,
  onOpenChange,
  table,
  ids,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  table: ReturnType<typeof cargoBySlug> extends infer T ? T extends { table: infer U } ? U : never : never;
  ids: string[];
  onSaved: () => void;
}) {
  const { roles } = useAuth();
  const editableTimeFields = TIME_FIELDS.filter((f) => canEditField(roles, f));
  const [field, setField] = useState<WagonField | "">("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setField(editableTimeFields[0] ?? "");
      setTime(nowDateTimeLocal());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const apply = async () => {
    if (!field) return;
    const iso = time ? timeToIso(time) : null;
    if (time && !iso) return toast.error("Неверная дата/время");
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from(table) as any)
      .update({ [field]: iso })
      .in("id", ids);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Обновлено вагонов: ${ids.length}`);
    onSaved();
  };

  const setNow = () => {
    setTime(nowDateTimeLocal());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Присвоить время</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Выбрано вагонов: <span className="font-medium text-foreground">{ids.length}</span>.
            Укажите дату и время — будет применено ко всем выбранным.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Поле</Label>
            <Select value={field} onValueChange={(v) => setField(v as WagonField)}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите поле" />
              </SelectTrigger>
              <SelectContent>
                {editableTimeFields.map((f) => (
                  <SelectItem key={f} value={f}>{FIELD_META[f].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editableTimeFields.length === 0 && (
              <p className="text-xs text-destructive">У вас нет прав ни на одно поле времени.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Дата и время</Label>
            <div className="flex gap-2">
              <Input
                type="datetime-local"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="font-mono"
              />
              <Button type="button" variant="outline" onClick={setNow}>
                <Clock className="mr-1 h-3.5 w-3.5" /> Сейчас
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Оставьте пустым, чтобы очистить поле у выбранных вагонов.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Отмена</Button>
          <Button onClick={apply} disabled={saving || !field}>
            {saving ? "Сохранение..." : `Применить к ${ids.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Analytics ---------------- */

function AnalyticsDialog({
  open,
  onOpenChange,
  cargoLabel,
  allWagons,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cargoLabel: string;
  allWagons: WagonRow[];
}) {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const wagons = useMemo(() => {
    if (!from && !to) return allWagons;
    const fromTs = from ? new Date(from + "T00:00:00").getTime() : null;
    const toTs = to ? new Date(to + "T23:59:59").getTime() : null;
    // Wagon is in period if any of its key timestamps fall in the range
    const keys: WagonField[] = [
      "asa_arrival_time",
      "asa_dispatch_time",
      "asa_handover_time",
      "cargo_operations",
      "request_submit_time",
    ];
    return allWagons.filter((w) => {
      for (const k of keys) {
        const v = w[k];
        if (!v) continue;
        const t = new Date(v).getTime();
        if (isNaN(t)) continue;
        if (fromTs && t < fromTs) continue;
        if (toTs && t > toTs) continue;
        return true;
      }
      return false;
    });
  }, [allWagons, from, to]);

  const stats = useMemo(() => {
    const total = wagons.length;
    const filled = (f: WagonField) => wagons.filter((w) => w[f]).length;
    const arrived = filled("asa_arrival_time");
    const dispatched = filled("asa_dispatch_time");
    const handed = filled("asa_handover_time");
    const inProgress = wagons.filter(
      (w) => w.asa_arrival_time && !w.asa_handover_time
    ).length;
    const completed = handed;

    const diffsMinutes = (fromF: WagonField, toF: WagonField): number[] => {
      const out: number[] = [];
      for (const w of wagons) {
        const a = w[fromF];
        const b = w[toF];
        if (!a || !b) continue;
        const da = new Date(a).getTime();
        const db = new Date(b).getTime();
        if (isNaN(da) || isNaN(db) || db < da) continue;
        out.push((db - da) / 60000);
      }
      return out;
    };
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : null;

    const unloadDiffs = diffsMinutes("cargo_operations", "request_submit_time");
    const balanceToHandoverDiffs = diffsMinutes("balance_ndfz_time", "asa_handover_time");

    return {
      total,
      arrived,
      dispatched,
      completed,
      inProgress,
      pctCompleted: total ? Math.round((completed / total) * 100) : 0,
      avgArrToDispatch: avg(diffsMinutes("asa_arrival_time", "asa_dispatch_time")),
      avgFosArrToFosDisp: avg(diffsMinutes("fosfor_arrival_time", "fosfor_dispatch_time")),
      avgFullCycle: avg(diffsMinutes("asa_arrival_time", "asa_handover_time")),
      avgUnload: avg(unloadDiffs),
      countUnload: unloadDiffs.length,
      avgBalanceToHandover: avg(balanceToHandoverDiffs),
      countBalanceToHandover: balanceToHandoverDiffs.length,
    };
  }, [wagons]);

  const fmtMin = (m: number | null) => {
    if (m === null) return "—";
    if (m < 60) return `${m} мин`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r === 0 ? `${h} ч` : `${h} ч ${r} мин`;
  };

  const periodLabel = from || to
    ? `${from || "…"} — ${to || "…"}`
    : "за всё время";

  const exportAnalytics = () => {
    const summary = [
      ["Аналитика", cargoLabel],
      ["Период", periodLabel],
      ["В выборке", String(stats.total)],
      [],
      ["Метрика", "Значение"],
      ["Всего вагонов", stats.total],
      ["Прибыло на Аса", stats.arrived],
      ["Отправлено с Аса", stats.dispatched],
      ["В работе", stats.inProgress],
      ["Завершено", `${stats.completed} (${stats.pctCompleted}%)`],
      [],
      ["Среднее время", "Значение", "Кол-во измерений"],
      ["Аса: приб. → отпр.", fmtMin(stats.avgArrToDispatch), ""],
      ["Фосфорная: приб. → отпр.", fmtMin(stats.avgFosArrToFosDisp), ""],
      ["Полный цикл (приб. Аса → сдача Аса)", fmtMin(stats.avgFullCycle), ""],
      ["Длительность выгрузки (подача под выгрузку → окончание)", fmtMin(stats.avgUnload), stats.countUnload],
      ["От Баланс НДФЗ до Сдача по Аса", fmtMin(stats.avgBalanceToHandover), stats.countBalanceToHandover],
    ];
    const ws = XLSX.utils.aoa_to_sheet(summary);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Аналитика");

    // Per-wagon breakdown
    const detail = wagons.map((w) => {
      const a = w.cargo_operations ? new Date(w.cargo_operations).getTime() : null;
      const b = w.request_submit_time ? new Date(w.request_submit_time).getTime() : null;
      const unloadMin = a && b && b >= a ? Math.round((b - a) / 60000) : null;
      const c = w.balance_ndfz_time ? new Date(w.balance_ndfz_time).getTime() : null;
      const d = w.asa_handover_time ? new Date(w.asa_handover_time).getTime() : null;
      const bToHMin = c && d && d >= c ? Math.round((d - c) / 60000) : null;
      return {
        "№ вагона": w.wagon_number,
        "Подача под выгрузку": fmtShort(w.cargo_operations),
        "Окончание выгрузки": fmtShort(w.request_submit_time),
        "Длительность выгрузки": fmtMin(unloadMin),
        "Баланс НДФЗ": fmtShort(w.balance_ndfz_time),
        "Сдача по Аса": fmtShort(w.asa_handover_time),
        "От Баланс НДФЗ до Сдача": fmtMin(bToHMin),
      };
    });
    const ws2 = XLSX.utils.json_to_sheet(detail);
    XLSX.utils.book_append_sheet(wb, ws2, "По вагонам");

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Аналитика_${cargoLabel}_${date}.xlsx`);
    toast.success("Аналитика экспортирована");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Аналитика — {cargoLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-secondary/40 px-3 py-2">
            <Label className="text-xs text-muted-foreground">Фильтр по дням:</Label>
            <Label className="text-xs">С</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-[150px] text-xs"
            />
            <Label className="text-xs">По</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-[150px] text-xs"
            />
            {(from || to) && (
              <Button size="sm" variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>
                Сброс
              </Button>
            )}
            <div className="ml-auto text-xs text-muted-foreground">
              Период: <span className="font-medium text-foreground">{periodLabel}</span> · В выборке: {stats.total} из {allWagons.length}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Всего вагонов" value={String(stats.total)} />
            <StatCard label="Прибыло на Аса" value={String(stats.arrived)} />
            <StatCard label="В работе" value={String(stats.inProgress)} accent="warning" />
            <StatCard label="Завершено" value={`${stats.completed} (${stats.pctCompleted}%)`} accent="success" />
          </div>

          <div className="space-y-2 rounded-lg border bg-card p-4">
            <div className="text-sm font-medium">Среднее время</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <MetricRow label="Аса: приб. → отпр." value={fmtMin(stats.avgArrToDispatch)} />
              <MetricRow label="Фосфорная: приб. → отпр." value={fmtMin(stats.avgFosArrToFosDisp)} />
              <MetricRow
                label={`Длительность выгрузки (n=${stats.countUnload})`}
                value={fmtMin(stats.avgUnload)}
              />
              <MetricRow
                label={`Баланс НДФЗ → Сдача по Аса (n=${stats.countBalanceToHandover})`}
                value={fmtMin(stats.avgBalanceToHandover)}
              />
              <MetricRow label="Полный цикл" value={fmtMin(stats.avgFullCycle)} />
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="mb-2 text-sm font-medium">Прогресс этапов</div>
            <div className="space-y-2">
              <ProgressBar label="Прибыло на Аса" value={stats.arrived} total={stats.total || 1} color="bg-stage-asa" />
              <ProgressBar label="Отправлено с Аса" value={stats.dispatched} total={stats.total || 1} color="bg-stage-fosfor" />
              <ProgressBar label="Сдано (завершено)" value={stats.completed} total={stats.total || 1} color="bg-stage-cargo" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={exportAnalytics}>
            <Download className="mr-1 h-4 w-4" /> Экспорт в Excel
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function StatCard({ label, value, accent }: { label: string; value: string; accent?: "success" | "warning" }) {
  const accentCls =
    accent === "success" ? "text-emerald-600" : accent === "warning" ? "text-amber-600" : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accentCls}`}>{value}</div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-secondary/40 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-medium">{value}</div>
    </div>
  );
}

function ProgressBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = Math.round((value / total) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{value} / {total} ({pct}%)</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

void fmtShort;
void nowIso;
