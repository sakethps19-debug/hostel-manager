"use client";

import { useMemo, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

type RequestRow = {
  request_id: number;
  hostel_name: string | null;
  item_description: string;
  quantity: number;
  estimated_cost: number | null;
  vendor_id: number | null;
  vendor_name: string | null;
  urgency: string;
  justification: string | null;
  status: string;
  requested_by_name: string | null;
  requested_at: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
};

type VendorRow = {
  vendor_id: number;
  name: string;
  is_active: boolean;
};

const URGENCIES = ["Low", "Normal", "High", "Urgent"];
const STATUSES = ["Pending", "Approved", "Rejected", "Ordered", "Received"];

function formatMoney(value: number | null) {
  if (value === null) return "-";
  return `Rs. ${Number(value).toLocaleString("en-IN")}`;
}

function urgencyClasses(urgency: string) {
  if (urgency === "Urgent") return "bg-red-100 text-red-800";
  if (urgency === "High") return "bg-amber-100 text-amber-800";
  if (urgency === "Normal") return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-600";
}

function statusClasses(status: string) {
  if (status === "Approved" || status === "Received") return "bg-emerald-50 text-emerald-700";
  if (status === "Rejected") return "bg-red-50 text-red-700";
  if (status === "Ordered") return "bg-blue-50 text-blue-700";
  return "bg-amber-50 text-amber-700";
}

export default function PurchaseRequestsView({
  requests,
  vendors,
  hostelNames,
}: {
  requests: RequestRow[];
  vendors: VendorRow[];
  hostelNames: string[];
}) {
  const [rows, setRows] = useState(requests);
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [hostelName, setHostelName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [urgency, setUrgency] = useState("Normal");
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const filtered = useMemo(
    () => rows.filter((r) => !statusFilter || r.status === statusFilter),
    [rows, statusFilter]
  );

  async function handleSubmit() {
    setErrorMessage("");

    if (!itemDescription.trim()) {
      setErrorMessage("Please describe the item needed.");
      return;
    }

    setSaving(true);

    try {
      const qty = Number(quantity) || 1;
      const cost = estimatedCost ? Number(estimatedCost) : null;
      const vId = vendorId ? Number(vendorId) : null;

      const id = await callRpcClient<number>("submit_purchase_request", {
        p_hostel_name: hostelName || null,
        p_item_description: itemDescription.trim(),
        p_quantity: qty,
        p_estimated_cost: cost,
        p_vendor_id: vId,
        p_urgency: urgency,
        p_justification: justification || null,
      });

      await logAuditEvent("purchase_request_submitted", "purchase_request", id, {
        item_description: itemDescription.trim(),
      });

      setRows((prev) => [
        {
          request_id: id,
          hostel_name: hostelName || null,
          item_description: itemDescription.trim(),
          quantity: qty,
          estimated_cost: cost,
          vendor_id: vId,
          vendor_name: vendors.find((v) => v.vendor_id === vId)?.name || null,
          urgency,
          justification: justification || null,
          status: "Pending",
          requested_by_name: null,
          requested_at: new Date().toISOString(),
          reviewed_by_name: null,
          reviewed_at: null,
          review_notes: null,
        },
        ...prev,
      ]);

      setItemDescription("");
      setQuantity("1");
      setEstimatedCost("");
      setVendorId("");
      setJustification("");
      setShowForm(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to submit request."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(requestId: number, status: string) {
    try {
      await callRpcClient("update_purchase_request_status", {
        p_request_id: requestId,
        p_status: status,
        p_review_notes: null,
      });

      await logAuditEvent(
        "purchase_request_status_changed",
        "purchase_request",
        requestId,
        { status }
      );

      setRows((prev) =>
        prev.map((r) => (r.request_id === requestId ? { ...r, status } : r))
      );
    } catch {
      // Best-effort UI update failure is surfaced via the row staying unchanged.
    }
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white"
        >
          {showForm ? "Cancel" : "+ New Request"}
        </button>
      </div>

      {showForm && (
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={hostelName}
              onChange={(e) => setHostelName(e.target.value)}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            >
              <option value="">No specific hostel</option>
              {hostelNames.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Quantity"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            >
              {URGENCIES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>

            <input
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              placeholder="Item description *"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-3"
            />

            <input
              type="number"
              min="0"
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
              placeholder="Estimated cost (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-2"
            >
              <option value="">No specific vendor</option>
              {vendors.map((v) => (
                <option key={v.vendor_id} value={v.vendor_id}>
                  {v.name}
                </option>
              ))}
            </select>

            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Justification (optional)"
              rows={2}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-3"
            />
          </div>

          {errorMessage && (
            <p className="mt-2 text-sm font-medium text-red-600">
              {errorMessage}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No purchase requests match.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Urgency</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3 text-right">Est. Cost</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.request_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold">
                        {r.item_description} × {r.quantity}
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.hostel_name || "General"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${urgencyClasses(r.urgency)}`}
                      >
                        {r.urgency}
                      </span>
                    </td>
                    <td className="px-4 py-3">{r.vendor_name || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(r.estimated_cost)}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={r.status}
                        onChange={(e) =>
                          handleStatusChange(r.request_id, e.target.value)
                        }
                        className={`rounded-full border-0 px-3 py-1 text-xs font-semibold outline-none ${statusClasses(r.status)}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
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
