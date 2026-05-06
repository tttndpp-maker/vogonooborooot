// Convert "YYYY-MM-DDTHH:MM" (datetime-local) or legacy "HH:MM" to ISO timestamp.
// "HH:MM" is interpreted as today (kept for backwards compatibility).
export function timeToIso(input: string): string | null {
  if (!input) return null;
  const v = input.trim();

  // datetime-local: YYYY-MM-DDTHH:MM(:SS)?
  const dt = /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v);
  if (dt) {
    const d = new Date(
      Number(dt[1]),
      Number(dt[2]) - 1,
      Number(dt[3]),
      Number(dt[4]),
      Number(dt[5]),
      Number(dt[6] ?? 0),
      0,
    );
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // Legacy HH:MM => today
  const hm = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (hm) {
    const h = Number(hm[1]);
    const min = Number(hm[2]);
    if (h > 23 || min > 59) return null;
    const d = new Date();
    d.setHours(h, min, 0, 0);
    return d.toISOString();
  }

  return null;
}

// ISO -> "HH:MM" local (legacy helper, still used for some displays)
export function isoToTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ISO -> "YYYY-MM-DDTHH:MM" local, suitable for <input type="datetime-local">
export function isoToDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Current local time as "YYYY-MM-DDTHH:MM"
export function nowDateTimeLocal(): string {
  return isoToDateTimeLocal(new Date().toISOString());
}

// Display: DD.MM HH:MM (always include date so multi-day ranges are clear)
export function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${date} ${t}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
