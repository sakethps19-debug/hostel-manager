"use client";

import { useMemo, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

type RequestRow = {
  request_id: number;
  hostel_name: string | null;
  category: string;
  amount: number;
  vendor: string | null;
  justification: string;
  status: string;
  requested_by_name: string | null;
  requested_at: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  resulting_expense_recorded: boolean;
};

const CATEGORIES = [
  "Electricity",
  "Water",
  "Housekeeping",
  "Repairs & Maintenance",
  "Wi-Fi",
  "Salaries",
  "Supplies",
  "Rent / Lease",
  "Taxes / Charges",
  "Other",
];

function formatMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function statusClasses(status: string) {
  if (status === "Approved") return "bg-emerald-50 text-emerald-700";
  if (status === "Rejected") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-700";
}

export default function ExpenseApprovalsView({
  requests,
  hostelNames,
}: {
  requests: RequestRow[];
  hostelNames: string[];
}) {
  const [rows, setRows] = useState(requests);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [showForm, setShowForm] = useState(false);
  const [hostelName, setHostelName] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const filtered = useMemo(
    () => rows.filter((r) => !statusFilter || r.status === statusFilter),
    [rows, statusFilter]
  );

  async function handleSubmit() {
    setErrorMessage("");

    const amt = Number(amount);

    if (!category) {
      setErrorMessage("Please select a category.");
      return;
    }

    if (!Number.isFinite(amt) || amt <= 0) {
      setErrorMessage("Please enter a valid amount.");
      return;
    }

    if (!justification.trim()) {
      setErrorMessage("Please enter a justification.");
      return;
    }

    setSaving(true);

    try {
      const id = await callRpcClient<number>("submit_expense_approval_request", {
        p_hostel_name: hostelName || null,
        p_category: category,
        p_amount: amt,
        p_vendor: vendor || null,
        p_justification: justification.trim(),
      });

      await logAuditEvent(
        "expense_approval_requested",
        "expense_approval_request",
        id,
        { category, amount: amt }
      );

      setRows((prev) => [
        {
          request_id: id,
          hostel_name: hostelName || null,
          category,
          amount: amt,
          vendor: vendor || null,
          justification: justification.trim(),
          status: "Pending",
          requested_by_name: null,
          requested_at: new Date().toISOString(),
          reviewed_by_name: null,
          reviewed_at: null,
          review_notes: null,
          resulting_expense_recorded: false,
        },
        ...prev,
      ]);

      setAmount("");
      setVendor("");
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

  async function handleReview(requestId: number, status: string) {
    setErrorMessage("");

    try {
      await callRpcClient("review_expense_approval_request", {
        p_request_id: requestId,
        p_status: status,
        p_review_notes: reviewNotes || null,
      });

      await logAuditEvent(
        status === "Approved"
          ? "expense_request_approved"
          : "expense_request_rejected",
        "expense_approval_request",
        requestId,
        {}
      );

      setRows((prev) =>
        prev.map((r) =>
          r.request_id === requestId
            ? {
                ...r,
                status,
                review_notes: reviewNotes || null,
                reviewed_at: new Date().toISOString(),
                resulting_expense_recorded: status === "Approved",
              }
            : r
        )
      );

      setReviewingId(null);
      setReviewNotes("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to review request."
      );
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
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
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
              <option value="">Common / Consolidated</option>
              {hostelNames.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            >
              <option value="">Select category *</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount *"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Vendor / Payee (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-3"
            />

            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Justification *"
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

      <div className="mt-5 space-y-4">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
            No requests match.
          </div>
        ) : (
          filtered.map((r) => (
            <div
              key={r.request_id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">
                      {r.category}
                    </span>
                    <span className="font-bold">{formatMoney(r.amount)}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {r.hostel_name || "Common"}
                    {r.vendor ? ` · ${r.vendor}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    {r.justification}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    Requested by {r.requested_by_name || "-"}
                  </p>
                  {r.review_notes && (
                    <p className="mt-2 text-sm text-slate-600">
                      Review notes: {r.review_notes}
                    </p>
                  )}
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(r.status)}`}
                >
                  {r.status}
                </span>
              </div>

              {r.status === "Pending" && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  {reviewingId === r.request_id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Review notes (optional)"
                        className="min-w-[200px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none"
                      />
                      <button
                        onClick={() => handleReview(r.request_id, "Approved")}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReview(r.request_id, "Rejected")}
                        className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => setReviewingId(null)}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setReviewingId(r.request_id)}
                      className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                    >
                      Review
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
