"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

const DOCUMENT_TYPES = ["Agreement", "Police Verification", "Other"];

const POLICE_VERIFICATION_STATUSES = [
  "Not Required",
  "Pending",
  "Submitted",
  "Completed",
  "Rejected",
];

function policeStatusClasses(status: string) {
  if (status === "Completed") return "bg-emerald-50 text-emerald-700";
  if (status === "Rejected") return "bg-red-50 text-red-700";
  if (status === "Pending" || status === "Submitted")
    return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-500";
}

type ExpiryRow = {
  document_type: string;
  expiry_date: string | null;
  notes: string | null;
  status: string | null;
};

function daysUntil(dateStr: string) {
  const diff =
    new Date(`${dateStr}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / 86400000);
}

function statusFor(dateStr: string | null) {
  if (!dateStr) return null;
  const days = daysUntil(dateStr);
  if (days < 0) return { label: "Expired", classes: "bg-red-50 text-red-700" };
  if (days <= 7)
    return {
      label: `Expires in ${days} day${days === 1 ? "" : "s"}`,
      classes: "bg-red-50 text-red-700",
    };
  if (days <= 30)
    return {
      label: `Expires in ${days} days`,
      classes: "bg-amber-50 text-amber-700",
    };
  return { label: "Valid", classes: "bg-emerald-50 text-emerald-700" };
}

export default function DocumentExpiryTracker({
  residentId,
  initialExpiries,
}: {
  residentId: number;
  initialExpiries: ExpiryRow[];
}) {
  const byType = new Map(initialExpiries.map((r) => [r.document_type, r]));

  const [values, setValues] = useState(
    DOCUMENT_TYPES.map((type) => ({
      documentType: type,
      expiryDate: byType.get(type)?.expiry_date || "",
      notes: byType.get(type)?.notes || "",
      status: byType.get(type)?.status || "Not Required",
    }))
  );
  const [savingType, setSavingType] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function save(documentType: string) {
    const row = values.find((v) => v.documentType === documentType);
    if (!row) return;

    setErrorMessage("");
    setSavingType(documentType);

    try {
      await callRpcClient("set_document_expiry", {
        p_resident_id: residentId,
        p_document_type: documentType,
        p_expiry_date: row.expiryDate || null,
        p_notes: row.notes || null,
        p_status:
          documentType === "Police Verification" ? row.status : null,
      });

      await logAuditEvent("document_expiry_updated", "resident", residentId, {
        document_type: documentType,
        expiry_date: row.expiryDate || null,
        status: documentType === "Police Verification" ? row.status : null,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save expiry date."
      );
    } finally {
      setSavingType(null);
    }
  }

  return (
    <div>
      {errorMessage && (
        <p className="mb-3 text-sm font-medium text-red-600">{errorMessage}</p>
      )}

      <div className="space-y-4">
        {values.map((row) => {
          const status = statusFor(row.expiryDate || null);

          return (
            <div
              key={row.documentType}
              className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-4"
            >
              <div>
                <p className="text-xs font-medium text-slate-400">
                  {row.documentType}
                </p>
                {status && (
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${status.classes}`}
                  >
                    {status.label}
                  </span>
                )}
              </div>

              {row.documentType === "Police Verification" && (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">
                    Verification Status
                  </span>
                  <select
                    value={row.status}
                    onChange={(e) =>
                      setValues((prev) =>
                        prev.map((v) =>
                          v.documentType === row.documentType
                            ? { ...v, status: e.target.value }
                            : v
                        )
                      )
                    }
                    className={`rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-500 ${policeStatusClasses(row.status)}`}
                  >
                    {POLICE_VERIFICATION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">
                  Expiry Date
                </span>
                <input
                  type="date"
                  value={row.expiryDate}
                  onChange={(e) =>
                    setValues((prev) =>
                      prev.map((v) =>
                        v.documentType === row.documentType
                          ? { ...v, expiryDate: e.target.value }
                          : v
                      )
                    )
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">
                  Notes
                </span>
                <input
                  value={row.notes}
                  onChange={(e) =>
                    setValues((prev) =>
                      prev.map((v) =>
                        v.documentType === row.documentType
                          ? { ...v, notes: e.target.value }
                          : v
                      )
                    )
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  placeholder="Optional"
                />
              </label>

              <button
                onClick={() => save(row.documentType)}
                disabled={savingType === row.documentType}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {savingType === row.documentType ? "Saving..." : "Save"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
