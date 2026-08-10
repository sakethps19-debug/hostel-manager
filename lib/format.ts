export function formatMoney(value: number): string {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

export function formatDate(dateStr: string): string {
  const date = dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr;
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
