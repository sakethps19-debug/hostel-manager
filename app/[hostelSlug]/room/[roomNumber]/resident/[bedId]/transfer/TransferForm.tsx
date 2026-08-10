"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { slugifyHostelName } from "@/lib/hostelSlug";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

type AvailableBedRow = {
  bed_id: number;
  bed_number: string;
  bed_code: string | null;
  hostel_name: string;
  floor_number: number;
  floor_name: string | null;
  room_number: string;
  sharing_type: number;
  monthly_rent: number;
};

type TransferResult = {
  new_booking_id: number;
  new_bed_id: number;
  new_hostel_name: string;
  new_room_number: string;
};

const REASONS = [
  "Resident Request",
  "Room Upgrade",
  "Room Downgrade",
  "Hostel Change",
  "Maintenance Relocation",
  "Other",
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return Number(value) > 0
    ? `Rs. ${Number(value).toLocaleString("en-IN")}`
    : "Rate not set";
}

export default function TransferForm({
  bookingId,
  currentBedLabel,
  currentMonthlyRent,
  currentSecurityDeposit,
  currentEndDate,
  availableBeds,
  backHref,
}: {
  bookingId: number;
  currentBedLabel: string;
  currentMonthlyRent: number;
  currentSecurityDeposit: number;
  currentEndDate: string;
  availableBeds: AvailableBedRow[];
  backHref: string;
}) {
  const router = useRouter();

  const [selectedBed, setSelectedBed] = useState<AvailableBedRow | null>(
    null
  );
  const [selectedHostel, setSelectedHostel] = useState("");
  const [selectedSharing, setSelectedSharing] = useState("");

  const [transferDate, setTransferDate] = useState(todayIsoDate());
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [newMonthlyRent, setNewMonthlyRent] = useState(
    String(currentMonthlyRent)
  );
  const [newSecurityDeposit, setNewSecurityDeposit] = useState(
    String(currentSecurityDeposit)
  );
  const [newEndDate, setNewEndDate] = useState(currentEndDate);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const hostelOptions = useMemo(
    () => Array.from(new Set(availableBeds.map((b) => b.hostel_name))).sort(),
    [availableBeds]
  );

  const sharingOptions = useMemo(
    () =>
      Array.from(new Set(availableBeds.map((b) => b.sharing_type))).sort(
        (a, b) => a - b
      ),
    [availableBeds]
  );

  const filteredBeds = useMemo(() => {
    return availableBeds.filter((bed) => {
      const matchesHostel =
        !selectedHostel || bed.hostel_name === selectedHostel;
      const matchesSharing =
        !selectedSharing || String(bed.sharing_type) === selectedSharing;
      return matchesHostel && matchesSharing;
    });
  }, [availableBeds, selectedHostel, selectedSharing]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!selectedBed) {
      setErrorMessage("Please select a destination bed.");
      return;
    }

    if (!reason) {
      setErrorMessage("Please select a reason for the transfer.");
      return;
    }

    const rent = Number(newMonthlyRent);
    const deposit = Number(newSecurityDeposit || 0);

    if (!Number.isFinite(rent) || rent < 0) {
      setErrorMessage("Please enter a valid monthly rent.");
      return;
    }

    if (!Number.isFinite(deposit) || deposit < 0) {
      setErrorMessage("Please enter a valid security deposit.");
      return;
    }

    try {
      setSaving(true);

      let data: TransferResult[];

      try {
        data = await callRpcClient<TransferResult[]>("transfer_resident", {
          p_booking_id: bookingId,
          p_new_bed_id: selectedBed.bed_id,
          p_transfer_date: transferDate,
          p_reason: reason,
          p_notes: notes || null,
          p_new_monthly_rent: rent,
          p_new_security_deposit: deposit,
          p_new_end_date: newEndDate || null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes("already booked")) {
          throw new Error(
            "The selected bed is already booked for part of the requested period."
          );
        }

        throw err;
      }

      const result = data.length > 0 ? data[0] : null;

      if (!result) {
        throw new Error("Transfer completed but no result was returned.");
      }

      await logAuditEvent("resident_transferred", "booking", bookingId, {
        new_booking_id: result.new_booking_id,
        new_bed_id: result.new_bed_id,
        reason,
        transfer_date: transferDate,
      });

      const newSlug = slugifyHostelName(result.new_hostel_name);
      router.push(
        `/${newSlug}/room/${result.new_room_number}/resident/${result.new_bed_id}`
      );
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to transfer resident."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">1. Choose Destination Bed</h2>
        <p className="mt-1 text-sm text-slate-500">
          Currently in {currentBedLabel}.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
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

          <select
            value={selectedSharing}
            onChange={(e) => setSelectedSharing(e.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">All Sharing Types</option>
            {sharingOptions.map((sharing) => (
              <option key={sharing} value={sharing}>
                {sharing} Sharing
              </option>
            ))}
          </select>
        </div>

        {filteredBeds.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">
            No vacant beds match the current filters.
          </p>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {filteredBeds.map((bed) => {
              const isSelected = selectedBed?.bed_id === bed.bed_id;

              return (
                <button
                  type="button"
                  key={bed.bed_id}
                  onClick={() => setSelectedBed(bed)}
                  className={`rounded-xl border p-4 text-left transition ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <p className="text-xs font-medium text-slate-400">
                    {bed.hostel_name} ·{" "}
                    {bed.floor_name || `Floor ${bed.floor_number}`}
                  </p>
                  <p className="mt-1 font-bold">
                    Room {bed.room_number} · {bed.bed_code || bed.bed_number}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {bed.sharing_type} Sharing ·{" "}
                    {formatMoney(bed.monthly_rent)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">2. Transfer Details</h2>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Transfer Date *
            </span>
            <input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              className="input-style"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Reason *
            </span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-style"
              required
            >
              <option value="">Select a reason</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              New Agreed Monthly Rent *
            </span>
            <input
              type="number"
              min="0"
              value={newMonthlyRent}
              onChange={(e) => setNewMonthlyRent(e.target.value)}
              className="input-style"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              New Security Deposit
            </span>
            <input
              type="number"
              min="0"
              value={newSecurityDeposit}
              onChange={(e) => setNewSecurityDeposit(e.target.value)}
              className="input-style"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              New Booking End Date
            </span>
            <input
              type="date"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              className="input-style"
            />
          </label>
        </div>

        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            Notes
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="input-style"
            placeholder="Any additional context for this transfer"
          />
        </label>

        {currentSecurityDeposit > 0 && (
          <p className="mt-4 text-xs text-slate-400">
            Any deposit already received on the current booking will be
            carried forward to the new bed automatically — no repayment is
            required from the resident.
          </p>
        )}
      </section>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <a
          href={backHref}
          className="rounded-xl border border-slate-200 px-6 py-3 font-semibold hover:bg-slate-50"
        >
          Cancel
        </a>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-indigo-600 px-7 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Transferring..." : "Confirm Transfer"}
        </button>
      </div>

      <style jsx>{`
        .input-style {
          width: 100%;
          border: 1px solid rgb(226 232 240);
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          outline: none;
        }

        .input-style:focus {
          border-color: rgb(99 102 241);
          box-shadow: 0 0 0 2px rgb(224 231 255);
        }
      `}</style>
    </form>
  );
}
