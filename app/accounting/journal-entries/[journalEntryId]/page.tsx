import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { formatDate, formatMoney } from "@/lib/format";
import ReverseEntryButton from "./ReverseEntryButton";

type JournalEntryRow = {
  journal_entry_id: number;
  entry_date: string;
  hostel_name: string | null;
  source_type: string;
  source_id: number | null;
  narration: string;
  status: "posted" | "reversed";
  total_amount: number;
  created_at: string;
};

type JournalEntryLineRow = {
  journal_entry_line_id: number;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  hostel_name: string | null;
  resident_id: number | null;
  booking_id: number | null;
  vendor_id: number | null;
  asset_id: number | null;
  memo: string | null;
};

type PageProps = {
  params: Promise<{ journalEntryId: string }>;
};

export default async function JournalEntryDetailPage({ params }: PageProps) {
  await requirePermission("viewFinancialReports");
  if (!(await isFeatureEnabled("enable_accounting"))) notFound();

  const { journalEntryId } = await params;
  const id = Number(journalEntryId);
  if (!Number.isInteger(id)) notFound();

  const entryRows = await callRpcServer<JournalEntryRow[]>("get_journal_entry", { p_journal_entry_id: id });
  const entry = entryRows.length > 0 ? entryRows[0] : null;
  if (!entry) notFound();

  const lines = await callRpcServer<JournalEntryLineRow[]>("get_journal_entry_lines", {
    p_journal_entry_id: id,
  });

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <a href="/accounting/journal-entries" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          ← Back to Journal Entries
        </a>

        <div className="mt-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              {formatDate(entry.entry_date)} · {entry.source_type}
            </p>
            <h1 className="mt-2 text-3xl font-bold">{entry.narration}</h1>
            <p className="mt-2 text-slate-500">
              {entry.hostel_name || "Consolidated"}
              {entry.source_id ? ` · Source #${entry.source_id}` : ""}
            </p>
          </div>
          <span
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              entry.status === "reversed" ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {entry.status === "reversed" ? "Reversed" : "Posted"}
          </span>
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Credit</th>
                <th className="px-4 py-3">Memo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.journal_entry_line_id}>
                  <td className="px-4 py-3">
                    <a
                      href={`/accounting/ledger?account=${l.account_code}`}
                      className="font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      {l.account_code} — {l.account_name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right">{l.debit ? formatMoney(l.debit) : "-"}</td>
                  <td className="px-4 py-3 text-right">{l.credit ? formatMoney(l.credit) : "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{l.memo || "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold">
              <tr>
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{formatMoney(lines.reduce((s, l) => s + l.debit, 0))}</td>
                <td className="px-4 py-3 text-right">{formatMoney(lines.reduce((s, l) => s + l.credit, 0))}</td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          </table>
        </section>

        {entry.status === "posted" && (
          <div className="mt-6">
            <ReverseEntryButton journalEntryId={entry.journal_entry_id} />
          </div>
        )}
      </div>
    </main>
  );
}
