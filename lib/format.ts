const IST = "Asia/Kolkata";

export function formatMoney(value: number): string {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

export function formatDate(dateStr: string): string {
  const date = dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr;
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: IST,
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: IST,
  });
}

/**
 * "Today" as a YYYY-MM-DD string in IST. Use this instead of
 * `new Date()` for any calendar-day comparison computed on the server -
 * Vercel's serverless runtime and Supabase's default database session
 * both run in UTC, which is 5.5 hours behind IST, so plain
 * `new Date()` used for calendar-day logic reports "yesterday" for the
 * first ~5.5 hours of every IST day.
 */
export function todayIsoDateIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST });
}

/**
 * Indian financial year runs 1 April - 31 March, unlike the calendar
 * year used for the month/year filters on the P&L and similar reports.
 * This only labels a (month, year) pair - it does not change what data
 * those filters fetch.
 */
export function formatFiscalYear(month: number, year: number): string {
  const fyStartYear = month >= 4 ? year : year - 1;
  const fyEndYearShort = String((fyStartYear + 1) % 100).padStart(2, "0");
  return `FY ${fyStartYear}-${fyEndYearShort}`;
}
