"use client";

import { useMemo, useState } from "react";
import { slugifyHostelName } from "@/lib/hostelSlug";
import { downloadCsv } from "@/lib/csv";

type LedgerRow = {
  booking_id: number;
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_id: number;
  bed_code: string | null;
  monthly_rent: number;
  months_elapsed: number;
  amount_due: number;
  amount_paid: number;
  balance_outstanding: number;
  last_payment_date: string | null;
  payment_status: string;
  start_date: string;
  end_date: string | null;
};

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(date: string | null) {
  if (!date) return "-";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStatusClasses(status: string) {
  if (status === "Paid" || status === "Advance Paid") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "Partially Paid") {
    return "bg-amber-50 text-amber-700";
  }
  if (status === "Overdue") {
    return "bg-red-50 text-red-700";
  }
  return "bg-slate-100 text-slate-600";
}

export default function OverdueRentTable({
  ledger,
}: {
  ledger: LedgerRow[];
}) {
  const [selectedHostel, setSelectedHostel] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const hostelOptions = useMemo(
    () => Array.from(new Set(ledger.map((row) => row.hostel_name))).sort(),
    [ledger]
  );

  const filteredLedger = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return ledger
      .filter((row) => showAll || row.balance_outstanding > 0)
      .filter(
        (row) => !selectedHostel || row.hostel_name === selectedHostel
      )
      .filter(
        (row) =>
          !query ||
          row.full_name.toLowerCase().includes(query) ||
          row.room_number.toLowerCase().includes(query) ||
          (row.bed_code || "").toLowerCase().includes(query)
      )
      .sort((a, b) => b.balance_outstanding - a.balance_outstanding);
  }, [ledger, selectedHostel, showAll, searchTerm]);

  const totalOutstanding = filteredLedger.reduce(
    (sum, row) => sum + Math.max(row.balance_outstanding, 0),
    0
  );

  function handleExport() {
    downloadCsv(
      `rent-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredLedger.map((row) => ({
        full_name: row.full_name,
        mobile_number: row.mobile_number || "",
        hostel_name: row.hostel_name,
        room_number: row.room_number,
        bed_code: row.bed_code || "",
        monthly_rent: row.monthly_rent,
        amount_due: row.amount_due,
        amount_paid: row.amount_paid,
        balance_outstanding: row.balance_outstanding,
        last_payment_date: row.last_payment_date || "",
        payment_status: row.payment_status,
      }))
    );
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search resident, room or bed ID..."
          className="w-full max-w-sm rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />

        <select
          value={selectedHostel}
          onChange={(e) => setSelectedHostel(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All Hostels</option>
          {hostelOptions.map((hostel) => (
            <option key={hostel} value={hostel}>
              {hostel}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Show all residents (not just outstanding)
        </label>

        <button
          type="button"
          onClick={handleExport}
          disabled={filteredLedger.length === 0}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">
          Total outstanding across {filteredLedger.length} resident
          {filteredLedger.length === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-2xl font-bold text-red-600">
          {formatMoney(totalOutstanding)}
        </p>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filteredLedger.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            {showAll
              ? "No residents match the current filters."
              : "No outstanding rent right now."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Resident</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Monthly Rent</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Outstanding</th>
                  <th className="px-4 py-3">Last Receipt</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredLedger.map((row) => (
                  <tr key={row.booking_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">
                        {row.full_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.mobile_number || "No mobile number"}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <p className="font-medium">{row.hostel_name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Room {row.room_number} ·{" "}
                        {row.bed_code || `Bed ${row.bed_id}`}
                      </p>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatMoney(row.monthly_rent)}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatMoney(row.amount_due)}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatMoney(row.amount_paid)}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-red-600">
                      {formatMoney(row.balance_outstanding)}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(row.last_payment_date)}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                          row.payment_status
                        )}`}
                      >
                        {row.payment_status}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/${slugifyHostelName(row.hostel_name)}/room/${row.room_number}/resident/${row.bed_id}`}
                        className="font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        View →
                      </a>
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
