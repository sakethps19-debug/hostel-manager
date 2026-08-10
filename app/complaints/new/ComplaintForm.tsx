"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { logAuditEvent } from "@/lib/audit";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

type ResidentRow = {
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_id: number;
  bed_code: string | null;
};

const CATEGORIES = [
  "Plumbing",
  "Electrical",
  "Furniture",
  "Fan",
  "AC",
  "Geyser",
  "Wi-Fi",
  "Cleaning",
  "Pest Control",
  "Food",
  "Noise",
  "Other",
];

const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

export default function ComplaintForm({
  residents,
  hostelNames,
}: {
  residents: ResidentRow[];
  hostelNames: string[];
}) {
  const router = useRouter();

  const [residentSearch, setResidentSearch] = useState("");
  const [selectedResidentId, setSelectedResidentId] = useState<number | null>(
    null
  );
  const [hostelName, setHostelName] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const filteredResidents = useMemo(() => {
    const term = residentSearch.trim().toLowerCase();
    if (!term) return residents.slice(0, 8);
    return residents
      .filter(
        (r) =>
          r.full_name.toLowerCase().includes(term) ||
          (r.mobile_number || "").includes(term)
      )
      .slice(0, 8);
  }, [residents, residentSearch]);

  const selectedResident = residents.find(
    (r) => r.resident_id === selectedResidentId
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!category) {
      setErrorMessage("Please select a category.");
      return;
    }

    if (!description.trim()) {
      setErrorMessage("Please describe the issue.");
      return;
    }

    try {
      setSaving(true);

      const created = await callRpcClient<{ id: number }>("create_complaint", {
        p_resident_id: selectedResident?.resident_id || null,
        p_hostel_name: selectedResident?.hostel_name || hostelName || null,
        p_room_number: selectedResident?.room_number || roomNumber || null,
        p_bed_code: selectedResident?.bed_code || null,
        p_category: category,
        p_description: description,
        p_priority: priority,
      });
      await logAuditEvent("complaint_created", "complaint", created?.id ?? null, {
        category,
        priority,
      });

      router.push("/complaints");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to log complaint."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Resident (optional)
        </span>

        {selectedResident ? (
          <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
            <div>
              <p className="font-semibold text-indigo-800">
                {selectedResident.full_name}
              </p>
              <p className="text-sm text-indigo-700">
                {selectedResident.hostel_name} · Room{" "}
                {selectedResident.room_number} ·{" "}
                {selectedResident.bed_code || "-"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedResidentId(null)}
              className="text-sm font-semibold text-indigo-600"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              value={residentSearch}
              onChange={(e) => setResidentSearch(e.target.value)}
              placeholder="Search resident by name or mobile..."
              className="input-style"
            />
            {residentSearch && filteredResidents.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                {filteredResidents.map((r) => (
                  <button
                    type="button"
                    key={r.resident_id}
                    onClick={() => {
                      setSelectedResidentId(r.resident_id);
                      setResidentSearch("");
                    }}
                    className="block w-full border-b border-slate-100 px-4 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
                  >
                    <span className="font-semibold">{r.full_name}</span>
                    <span className="ml-2 text-slate-500">
                      {r.hostel_name} · Room {r.room_number}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!selectedResident && (
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Hostel (if not resident-specific)
            </span>
            <select
              value={hostelName}
              onChange={(e) => setHostelName(e.target.value)}
              className="input-style"
            >
              <option value="">Not specified</option>
              {hostelNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              Room Number
            </span>
            <input
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              className="input-style"
            />
          </label>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            Category *
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-style"
            required
          >
            <option value="">Select category</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            Priority
          </span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="input-style"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Description *
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="input-style"
          required
        />
      </label>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <a
          href="/complaints"
          className="rounded-xl border border-slate-200 px-6 py-3 font-semibold hover:bg-slate-50"
        >
          Cancel
        </a>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-indigo-600 px-7 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Log Complaint"}
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
