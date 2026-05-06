export type AppRole = "ADMIN" | "ASU" | "STATION";

export type WagonField =
  | "wagon_number"
  | "asa_arrival_time"
  | "platform_number"
  | "balance_ndfz_time"
  | "asa_dispatch_time"
  | "train_number_asa"
  | "fosfor_arrival_time"
  | "cargo_submit_time"
  | "cargo_operations"
  | "request_submit_time"
  | "track_assignment_time"
  | "fosfor_dispatch_time"
  | "train_number_fosfor"
  | "asa_return_arrival_time"
  | "asa_handover_time"
  | "note";

export const ROLE_FIELDS: Record<Exclude<AppRole, "ADMIN">, WagonField[]> = {
  ASU: [
    "asa_arrival_time",
    "asa_dispatch_time",
    "train_number_asa",
    "asa_return_arrival_time",
    "asa_handover_time",
  ],
  STATION: [
    "platform_number",
    "balance_ndfz_time",
    "fosfor_arrival_time",
    "cargo_submit_time",
    "cargo_operations",
    "request_submit_time",
    "track_assignment_time",
    "fosfor_dispatch_time",
    "train_number_fosfor",
    "note",
  ],
};

export function canEditField(roles: AppRole[], field: WagonField): boolean {
  if (roles.includes("ADMIN")) return true;
  for (const role of roles) {
    if (role === "ADMIN") continue;
    if (ROLE_FIELDS[role]?.includes(field)) return true;
  }
  return false;
}

export type StageGroup = "asa" | "fosfor" | "cargo";

export const FIELD_META: Record<
  WagonField,
  { label: string; type: "text" | "datetime"; stage: StageGroup }
> = {
  wagon_number: { label: "№ вагона", type: "text", stage: "asa" },
  asa_arrival_time: { label: "Прибытие Аса", type: "datetime", stage: "asa" },
  platform_number: { label: "№ платформы", type: "text", stage: "cargo" },
  balance_ndfz_time: { label: "Баланс НДФЗ", type: "datetime", stage: "cargo" },
  asa_dispatch_time: { label: "Отпр. Аса", type: "datetime", stage: "asa" },
  train_number_asa: { label: "№ поезда (Аса)", type: "text", stage: "asa" },
  fosfor_arrival_time: { label: "Приб. Фосфорная", type: "datetime", stage: "fosfor" },
  cargo_submit_time: { label: "Время подачи на веса", type: "datetime", stage: "cargo" },
  cargo_operations: { label: "Время подачи под выгрузку", type: "datetime", stage: "cargo" },
  request_submit_time: { label: "Окончание выгрузки", type: "datetime", stage: "cargo" },
  track_assignment_time: { label: "Ожидание оформления, инструкций, выставления", type: "datetime", stage: "fosfor" },
  fosfor_dispatch_time: { label: "Отпр. Фосфорная", type: "datetime", stage: "fosfor" },
  train_number_fosfor: { label: "№ поезда (Фосфорная)", type: "text", stage: "fosfor" },
  asa_return_arrival_time: { label: "Возврат на Аса", type: "datetime", stage: "asa" },
  asa_handover_time: { label: "Сдача по Аса", type: "datetime", stage: "asa" },
  note: { label: "Примечание", type: "text", stage: "cargo" },
};

export const ALL_FIELDS: WagonField[] = Object.keys(FIELD_META) as WagonField[];

export const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: "Администратор",
  ASU: "АСУ (Аса)",
  STATION: "Станция",
};

// All datetime fields in a stable display order
export const TIME_FIELDS: WagonField[] = ALL_FIELDS.filter(
  (f) => FIELD_META[f].type === "datetime"
);
