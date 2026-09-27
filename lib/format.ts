export function inr(n: number, opts: { sign?: boolean } = {}): string {
  const v = Math.round(Math.abs(n)).toLocaleString("en-IN");
  const sign = n < 0 ? "-" : opts.sign && n > 0 ? "+" : "";
  return `${sign}₹${v}`;
}

/** Whole rupees with Indian digit grouping: ₹1,20,000 / -₹4,500. */
export function formatINR(n: number): string {
  return inr(n);
}

/** ₹1.8L, ₹90K, ₹1.2Cr — for tight spaces. */
export function inrCompact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}K`;
  return `${sign}₹${Math.round(a)}`;
}

function trim(n: number): string {
  return n.toFixed(n >= 10 ? 1 : 2).replace(/\.?0+$/, "");
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
}

export function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatDate(iso, { month: "short", year: "numeric" });
}

export function monthLabel(key: string): string {
  return formatDate(`${key}-01`, { month: "long", year: "numeric" });
}

export function daysFromToday(iso: string, today = new Date()): number {
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.parse(iso + "T00:00:00Z") - t) / 86_400_000);
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
