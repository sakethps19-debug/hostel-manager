"use client";

import { useEffect, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

type ResidentRow = {
  resident_id: number;
  full_name: string;
  mobile_number: string | null;
  id_proof_number: string | null;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  booking_status: string;
};

export default function DuplicateResidentWarning({
  mobileNumber,
  idProofNumber,
  onAcknowledgeChange,
}: {
  mobileNumber: string;
  idProofNumber: string;
  onAcknowledgeChange: (acknowledged: boolean) => void;
}) {
  const [residents, setResidents] = useState<ResidentRow[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;

    callRpcClient<ResidentRow[]>("get_resident_master_list")
      .then((rows) => {
        if (!cancelled) setResidents(rows);
      })
      .catch(() => {
        if (!cancelled) setResidents([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const mobileMatches =
    residents?.filter(
      (r) => mobileNumber.length === 10 && r.mobile_number === mobileNumber
    ) || [];

  // ID proof numbers are masked in the resident list, so we can only
  // compare the last few characters as a best-effort heuristic - not a
  // guaranteed match.
  const idSuffix = idProofNumber.trim().slice(-4);
  const idMatches =
    idSuffix.length === 4
      ? residents?.filter(
          (r) =>
            r.id_proof_number &&
            r.id_proof_number.slice(-4) === idSuffix &&
            !mobileMatches.some((m) => m.resident_id === r.resident_id)
        ) || []
      : [];

  const matches = [...mobileMatches, ...idMatches];

  useEffect(() => {
    onAcknowledgeChange(matches.length === 0 || acknowledged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches.length, acknowledged]);

  if (matches.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="font-semibold text-amber-800">
        {mobileMatches.length > 0
          ? "A resident with this mobile number already exists."
          : "A resident with a similar ID proof number already exists."}
      </p>

      <ul className="mt-2 space-y-1 text-sm text-amber-800">
        {matches.map((r) => (
          <li key={r.resident_id}>
            {r.full_name} · {r.hostel_name} · Room {r.room_number}
            {r.bed_code ? ` · ${r.bed_code}` : ""} · {r.booking_status}
            {r.id_proof_number ? ` · ID ending ${r.id_proof_number.slice(-4)}` : ""}
          </li>
        ))}
      </ul>

      <label className="mt-3 flex items-start gap-2 text-sm text-amber-900">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
        />
        <span>
          I&apos;ve checked and this is a different person, or there&apos;s a
          legitimate reason to proceed.
        </span>
      </label>
    </div>
  );
}
