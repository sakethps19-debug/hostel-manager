"use client";

import { useMemo, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import type { ReceivableAgeingRow } from "@/lib/accounting/types";

type ResidentRow = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
};

type AccrualStatus = {
  total_active_bookings: number;
  already_accrued: number;
  pending: number;
};

function bucketClasses(bucket: string) {
  if (bucket === "60+ days") return "bg-red-50 text-red-700";
  if (bucket === "31-60 days") return "bg-amber-50 text-amber-700";
  if (bucket === "8-30 days") return "bg-amber-50 text-amber-600";
  if (bucket === "Current") return "bg-emerald-50 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}

export default function ReceivablesView({
  ageing,
  residents,
  hostelNames,
  accrualStatus,
  periodYear,
  periodMonth,
}: {
  ageing: ReceivableAgeingRow[];
  residents: ResidentRow[];
  hostelNames: string[];
  accrualStatus: AccrualStatus | null;
  periodYear: number;
  periodMonth: number;
}) {
  const [selectedHostel, setSelectedHostel] = useState("");
  const [runningAccrual, setRunningAccrual] = useState(false);
  const [accrualMessage, setAccrualMessage] = useState("");
  const [pending, setPending] = useState(accrualStatus?.pending ?? 0);

  const residentByBooking = useMemo(() => {
    const map = new Map<number, ResidentRow>();
    for (const r of residents) map.set(r.booking_id, r);
    return map;
  }, [residents]);

  const rows = useMemo(
    () =>
      ageing
        .map((a) => ({ ...a, resident: a.booking_id ? residentByBooking.get(a.booking_id) : undefined }))
        .filter((a) => !selectedHostel || a.hostel_name === selectedHostel || a.resident?.hostel_name === selectedHostel),
    [ageing, residentByBooking, selectedHostel]
  );

  const totalOutstanding = rows.reduce((sum, r) => sum + r.outstanding, 0);

  async function handleRunAccrual() {
    setAccrualMessage("");
    setRunningAccrual(true);
    try {
      const count = await callRpcClient<number>("post_rent_accruals_for_period", {
        p_period_year: periodYear,
        p_period_month: periodMonth,
      });
      await logAuditEvent("rent_accruals_posted", "accounting", null, {
        period_year: periodYear,
        period_month: periodMonth,
        count,
      });
      setPending(Math.max(0, pending - count));
      setAccrualMessage(`Accrued rent for ${count} booking${count === 1 ? "" : "s"}. Reload to see updated receivables.`);
    } catch (error) {
      setAccrualMessage(error instanceof Error ? error.message : "Unable to run rent accrual.");
    } finally {
      setRunningAccrual(false);
    }
  }

  function handleExport() {
    downloadCsv(
      `accounts-receivable-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => ({
        Resident: r.resident?.full_name || `Booking #${r.booking_id}`,
        Hostel: r.resident?.hostel_name || r.hostel_name || "",
        "Room/Bed": [r.resident?.room_number, r.resident?.bed_code].filter(Boolean).join(" · "),
        Outstanding: r.outstanding,
        "Oldest Due Date": r.oldest_due_date ? formatDate(r.oldest_due_date) : "",
        "Days Overdue": r.days_overdue,
        "Ageing Bucket": r.ageing_bucket,
      }))
    );
  }

  return (
    <section className="mt-8">
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-indigo-800">
              Rent Accrual for {periodMonth}/{periodYear}
            </p>
            <p className="text-sm text-slate-600">
              {accrualStatus ? (
                <>
                  {accrualStatus.already_accrued}/{accrualStatus.total_active_bookings} active bookings accrued
                  {pending > 0 ? ` · ${pending} pending` : " · all caught up"}
                </>
              ) : (
                "Status unavailable"
              )}
            </p>
          </div>
          <button
            onClick={handleRunAccrual}
            disabled={runningAccrual || pending === 0}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {runningAccrual ? "Running..." : `Run Accrual (${pending} pending)`}
          </button>
        </div>
        {accrualMessage && <p className="mt-2 text-sm font-medium text-indigo-800">{accrualMessage}</p>}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <select
          value={selectedHostel}
          onChange={(e) => setSelectedHostel(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">All Hostels</option>
          {hostelNames.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <p className="text-sm text-slate-500">
          {rows.length} residents owing · {formatMoney(totalOutstanding)} total outstanding
        </p>

        <button
          onClick={handleExport}
          disabled={rows.length === 0}
          className="ml-auto rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">No outstanding receivables.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Resident</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Oldest Due Date</th>
                  <th className="px-4 py-3">Ageing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.booking_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold">{r.resident?.full_name || `Booking #${r.booking_id}`}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {[r.resident?.hostel_name || r.hostel_name, r.resident?.room_number, r.resident?.bed_code]
                        .filter(Boolean)
                        .join(" · ") || "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(r.outstanding)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {r.oldest_due_date ? formatDate(r.oldest_due_date) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${bucketClasses(r.ageing_bucket)}`}>
                        {r.ageing_bucket}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
