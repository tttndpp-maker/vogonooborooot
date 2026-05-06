import type { Database } from "@/integrations/supabase/types";

export type CargoTable =
  | "cargo_coke"
  | "cargo_slag"
  | "cargo_knauf_gypsum"
  | "cargo_yellow_phosphorus"
  | "cargo_ulken_buryl"
  | "cargo_tksm"
  | "cargo_birlik"
  | "cargo_other_loading"
  | "cargo_other_unloading";

export type CargoSlug =
  | "coke"
  | "slag"
  | "knauf-gypsum"
  | "yellow-phosphorus"
  | "ulken-buryl"
  | "tksm"
  | "birlik"
  | "other-loading"
  | "other-unloading";

export type CargoCategory = "general" | "counterparty";

export interface CargoInfo {
  slug: CargoSlug;
  table: CargoTable;
  label: string;
  short: string;
  accent: string;
  category: CargoCategory;
}

export const CARGOES: CargoInfo[] = [
  { slug: "coke", table: "cargo_coke", label: "Кокс", short: "К", accent: "bg-zinc-800 text-white", category: "general" },
  { slug: "slag", table: "cargo_slag", label: "Шлак", short: "Ш", accent: "bg-stone-600 text-white", category: "general" },
  { slug: "yellow-phosphorus", table: "cargo_yellow_phosphorus", label: "Жёлтый фосфор", short: "ЖФ", accent: "bg-yellow-500 text-stone-900", category: "general" },
  { slug: "other-loading", table: "cargo_other_loading", label: "Прочее (Погрузка)", short: "ПП", accent: "bg-slate-600 text-white", category: "general" },
  { slug: "other-unloading", table: "cargo_other_unloading", label: "Прочее (Выгрузка)", short: "ПВ", accent: "bg-slate-500 text-white", category: "general" },
  { slug: "knauf-gypsum", table: "cargo_knauf_gypsum", label: "Кнауф Гипс", short: "КГ", accent: "bg-blue-600 text-white", category: "counterparty" },
  { slug: "ulken-buryl", table: "cargo_ulken_buryl", label: "Улкен Бурыл", short: "УБ", accent: "bg-emerald-600 text-white", category: "counterparty" },
  { slug: "birlik", table: "cargo_birlik", label: "Бирлик", short: "Б", accent: "bg-purple-600 text-white", category: "counterparty" },
  { slug: "tksm", table: "cargo_tksm", label: "ТКСМ", short: "Т", accent: "bg-orange-600 text-white", category: "counterparty" },
];

export function cargoBySlug(slug: string): CargoInfo | undefined {
  return CARGOES.find((c) => c.slug === slug);
}

// Type-level sanity: ensure CargoTable matches DB
type _TableCheck = CargoTable extends keyof Database["public"]["Tables"] ? true : false;
const _tableCheck: _TableCheck = true;
void _tableCheck;
