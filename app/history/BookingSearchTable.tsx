"use client";

import { useMemo, useState } from "react";
import { downloadCsv } from "@/lib/csv";

type BookingHistoryRow = {
  booking_id: number;
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  email: string | null;
  emergency_contact: string | null;
  notes: string | null;
  hostel_name: string;
  floor_number: number;
  room_number: string;
  bed_number: string;
  bed_code: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number | null;
  booking_status: string;
  created_at: string;
};

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(value: number | null) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function getStatusClasses(status: string) {
  if (status === "confirmed" || status === "checked_in") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "completed") {
    return "bg-slate-100 text-slate-600";
  }

  if (status === "cancelled") {
    return "bg-red-50 text-red-700";
  }

  return "bg-amber-50 text-amber-700";
}

export default function BookingSearchTable({
  bookings,
}: {
  bookings: BookingHistoryRow[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedHostel, setSelectedHostel] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");

  const hostelOptions = useMemo(
    () =>
      Array.from(new Set(bookings.map((booking) => booking.hostel_name))).sort(),
    [bookings]
  );

  const roomOptions = useMemo(() => {
    const rooms = bookings
      .filter(
        (booking) =>
          !selectedHostel || booking.hostel_name === selectedHostel
      )
      .map((booking) => booking.room_number);

    return Array.from(new Set(rooms)).sort();
  }, [bookings, selectedHostel]);

  const filteredBookings = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return bookings.filter((booking) => {
      const matchesName =
        !query || booking.full_name.toLowerCase().includes(query);

      const matchesHostel =
        !selectedHostel || booking.hostel_name === selectedHostel;

      const matchesRoom =
        !selectedRoom || booking.room_number === selectedRoom;

      return matchesName && matchesHostel && matchesRoom;
    });
  }, [bookings, searchTerm, selectedHostel, selectedRoom]);

  function handleExport() {
    downloadCsv(
      `booking-history-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredBookings.map((b) => ({
        full_name: b.full_name,
        mobile_number: b.mobile_number || "",
        hostel_name: b.hostel_name,
        room_number: b.room_number,
        bed_code: b.bed_code || b.bed_number,
        start_date: b.start_date,
        end_date: b.end_date,
        monthly_rent: b.monthly_rent,
        security_deposit: b.security_deposit || 0,
        status: b.booking_status,
      }))
    );
  }

  return (
    <section className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-xl font-bold">Resident Bookings</h2>

        <p className="mt-1 text-sm text-slate-500">
          {filteredBookings.length} booking record
          {filteredBookings.length === 1 ? "" : "s"}
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search residents by name..."
            className="w-full max-w-sm rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />

          <select
            value={selectedHostel}
            onChange={(e) => {
              setSelectedHostel(e.target.value);
              setSelectedRoom("");
            }}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">All Hostels</option>
            {hostelOptions.map((hostel) => (
              <option key={hostel} value={hostel}>
                {hostel}
              </option>
            ))}
          </select>

          <select
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">All Rooms</option>
            {roomOptions.map((room) => (
              <option key={room} value={room}>
                Room {room}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExport}
            disabled={filteredBookings.length === 0}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>
      </div>

      {filteredBookings.length === 0 ? (
        <div className="px-6 py-16 text-center text-slate-500">
          {bookings.length === 0
            ? "No booking history available."
            : "No residents match the current filters."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-4">Resident</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Stay</th>
                <th className="px-6 py-4">Rent</th>
                <th className="px-6 py-4">Deposit</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredBookings.map((booking) => (
                <tr key={booking.booking_id} className="hover:bg-slate-50">
                  <td className="px-6 py-5">
                    <p className="font-semibold text-slate-900">
                      {booking.full_name}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {booking.mobile_number || "No mobile number"}
                    </p>
                  </td>

                  <td className="px-6 py-5">
                    <p className="font-medium">{booking.hostel_name}</p>

                    <p className="mt-1 text-xs text-slate-500">
                      Room {booking.room_number} · {booking.bed_code || booking.bed_number}
                    </p>
                  </td>

                  <td className="px-6 py-5 whitespace-nowrap">
                    <p>{formatDate(booking.start_date)}</p>

                    <p className="mt-1 text-xs text-slate-500">
                      to {formatDate(booking.end_date)}
                    </p>
                  </td>

                  <td className="px-6 py-5 whitespace-nowrap font-semibold">
                    {formatMoney(booking.monthly_rent)}
                  </td>

                  <td className="px-6 py-5 whitespace-nowrap">
                    {formatMoney(booking.security_deposit)}
                  </td>

                  <td className="px-6 py-5">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                        booking.booking_status
                      )}`}
                    >
                      {booking.booking_status}
                    </span>
                  </td>

                  <td className="px-6 py-5 text-right">
                    <a
                      href={`/history/${booking.booking_id}`}
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
    </section>
  );
}
