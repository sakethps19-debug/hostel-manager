"use client";

import { useMemo, useState } from "react";
import { slugifyHostelName } from "@/lib/hostel";

type ResidentRow = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  mobile_number: string | null;
  id_proof_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_id: number;
  bed_code: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  outstanding_rent: number;
  booking_status: string;
};

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isActiveStatus(status: string) {
  return status === "confirmed" || status === "checked_in";
}

function getStatusClasses(status: string) {
  if (isActiveStatus(status)) return "bg-emerald-50 text-emerald-700";
  if (status === "completed") return "bg-slate-100 text-slate-600";
  if (status === "cancelled") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-700";
}

export default function ResidentSearchTable({
  residents,
}: {
  residents: ResidentRow[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "vacated" | "all">(
    "active"
  );
  const [selectedHostel, setSelectedHostel] = useState("");

  const hostelOptions = useMemo(
    () => Array.from(new Set(residents.map((r) => r.hostel_name))).sort(),
    [residents]
  );

  const filteredResidents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return residents.filter((r) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && isActiveStatus(r.booking_status)) ||
        (statusFilter === "vacated" && !isActiveStatus(r.booking_status));

      const matchesHostel = !selectedHostel || r.hostel_name === selectedHostel;

      const matchesQuery =
        !query ||
        r.full_name.toLowerCase().includes(query) ||
        (r.mobile_number || "").toLowerCase().includes(query) ||
        (r.bed_code || "").toLowerCase().includes(query) ||
        r.room_number.toLowerCase().includes(query) ||
        r.hostel_name.toLowerCase().includes(query) ||
        (r.id_proof_number || "").toLowerCase().includes(query);

      return matchesStatus && matchesHostel && matchesQuery;
    });
  }, [residents, searchTerm, statusFilter, selectedHostel]);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search name, mobile, bed ID, room, ID proof..."
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

        <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-sm font-semibold">
          {(["active", "vacated", "all"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStatusFilter(option)}
              className={`rounded-lg px-4 py-1.5 capitalize transition ${
                statusFilter === option
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filteredResidents.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No residents match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3">Hostel</th>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Bed ID</th>
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">End</th>
                  <th className="px-4 py-3">Monthly Rent</th>
                  <th className="px-4 py-3">Outstanding</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredResidents.map((r) => {
                  const href = isActiveStatus(r.booking_status)
                    ? `/${slugifyHostelName(r.hostel_name)}/room/${r.room_number}/resident/${r.bed_id}`
                    : `/history/${r.booking_id}`;

                  return (
                    <tr key={r.booking_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <a
                          href={href}
                          className="font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          {r.full_name}
                        </a>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.mobile_number || "-"}
                      </td>
                      <td className="px-4 py-3">{r.hostel_name}</td>
                      <td className="px-4 py-3">{r.room_number}</td>
                      <td className="px-4 py-3">{r.bed_code || "-"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDate(r.start_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDate(r.end_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatMoney(r.monthly_rent)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-semibold">
                        {r.outstanding_rent > 0
                          ? formatMoney(r.outstanding_rent)
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                            r.booking_status
                          )}`}
                        >
                          {r.booking_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
