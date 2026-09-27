"use client";

import { useMemo, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { downloadXlsx } from "@/lib/accounting/xlsxExport";
import type { PayableRow, PayableAgeingRow } from "@/lib/accounting/types";

const CATEGORIES = [
  "Electricity", "Water", "Housekeeping", "Repairs & Maintenance", "Wi-Fi",
  "Salaries", "Supplies", "Rent / Lease", "Taxes / Charges", "Other",
];

const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Other"];

type VendorOption = { vendor_id: number; name: string };

function statusClasses(status: string) {
  if (status === "paid") return "bg-emerald-50 text-emerald-700";
  if (status === "overdue") return "bg-red-50 text-red-700";
  if (status === "partially_paid") return "bg-amber-50 text-amber-700";
  if (status === "cancelled") return "bg-slate-100 text-slate-400";
  return "bg-slate-100 text-slate-600";
}

const STATUS_LABELS: Record<string, string> = {
  due: "Due", partially_paid: "Partially Paid", paid: "Paid", overdue: "Overdue", cancelled: "Cancelled",
};

export default function PayablesView({
  initialPayables,
  ageing,
  vendors,
  hostelNames,
}: {
  initialPayables: PayableRow[];
  ageing: PayableAgeingRow[];
  vendors: VendorOption[];
  hostelNames: string[];
}) {
  const [payables, setPayables] = useState(initialPayables);
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [payingId, setPayingId] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("");

  const [form, setForm] = useState({
    vendorId: "",
    vendorName: "",
    hostelName: "",
    category: CATEGORIES[0],
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    amount: "",
    notes: "",
  });

  const ageingByPayable = useMemo(() => {
    const map = new Map<number, PayableAgeingRow>();
    for (const a of ageing) map.set(a.payable_id, a);
    return map;
  }, [ageing]);

  const filtered = payables.filter((p) => !statusFilter || p.status === statusFilter);
  const totalOutstanding = filtered.reduce((sum, p) => sum + (p.amount - p.amount_paid), 0);

  async function handleAddInvoice() {
    setErrorMessage("");

    const amount = Number(form.amount);
    if (!form.vendorName.trim() && !form.vendorId) {
      setErrorMessage("Please choose a vendor or enter a payee name.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage("Please enter an amount greater than zero.");
      return;
    }
    if (form.dueDate < form.invoiceDate) {
      setErrorMessage("Due date cannot be before the invoice date.");
      return;
    }

    setSaving(true);
    try {
      const vendorName =
        form.vendorName.trim() || vendors.find((v) => String(v.vendor_id) === form.vendorId)?.name || "";

      const payableId = await callRpcClient<number>("add_payable", {
        p_vendor_id: form.vendorId ? Number(form.vendorId) : null,
        p_vendor_name: vendorName,
        p_hostel_name: form.hostelName || null,
        p_category: form.category,
        p_invoice_number: form.invoiceNumber || null,
        p_invoice_date: form.invoiceDate,
        p_due_date: form.dueDate,
        p_amount: amount,
        p_notes: form.notes || null,
      });

      await logAuditEvent("payable_added", "payable", payableId, { vendor_name: vendorName, amount });

      setPayables((prev) => [
        {
          payable_id: payableId,
          vendor_id: form.vendorId ? Number(form.vendorId) : null,
          vendor_name: vendorName,
          hostel_name: form.hostelName || null,
          category: form.category,
          invoice_number: form.invoiceNumber || null,
          invoice_date: form.invoiceDate,
          due_date: form.dueDate,
          amount,
          amount_paid: 0,
          status: "due",
          notes: form.notes || null,
          attachment_path: null,
        },
        ...prev,
      ]);

      setForm({
        vendorId: "", vendorName: "", hostelName: "", category: CATEGORIES[0], invoiceNumber: "",
        invoiceDate: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10),
        amount: "", notes: "",
      });
      setShowForm(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordPayment(payableId: number) {
    setErrorMessage("");
    const amount = Number(paymentAmount);
    const payable = payables.find((p) => p.payable_id === payableId);
    if (!payable) return;

    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage("Please enter a payment amount greater than zero.");
      return;
    }
    if (!paymentMode) {
      setErrorMessage("Please select a payment mode.");
      return;
    }
    if (amount > payable.amount - payable.amount_paid) {
      setErrorMessage("Payment cannot exceed the outstanding balance.");
      return;
    }

    setSaving(true);
    try {
      await callRpcClient("record_payable_payment", {
        p_payable_id: payableId,
        p_payment_date: new Date().toISOString().slice(0, 10),
        p_amount: amount,
        p_payment_mode: paymentMode,
      });

      await logAuditEvent("payable_payment_recorded", "payable", payableId, { amount });

      setPayables((prev) =>
        prev.map((p) =>
          p.payable_id === payableId
            ? {
                ...p,
                amount_paid: p.amount_paid + amount,
                status: p.amount_paid + amount >= p.amount ? "paid" : "partially_paid",
              }
            : p
        )
      );
      setPayingId(null);
      setPaymentAmount("");
      setPaymentMode("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to record payment.");
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    downloadCsv(
      `accounts-payable-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((p) => ({
        Vendor: p.vendor_name,
        Hostel: p.hostel_name || "",
        Category: p.category,
        Invoice: p.invoice_number || "",
        "Invoice Date": formatDate(p.invoice_date),
        "Due Date": formatDate(p.due_date),
        Amount: p.amount,
        Paid: p.amount_paid,
        Outstanding: p.amount - p.amount_paid,
        Status: STATUS_LABELS[p.status] || p.status,
      }))
    );
  }

  async function handleExportXlsx() {
    await downloadXlsx(
      `accounts-payable-${new Date().toISOString().slice(0, 10)}`,
      "Accounts Payable",
      [
        { header: "Vendor", key: "vendor" },
        { header: "Hostel", key: "hostel" },
        { header: "Category", key: "category" },
        { header: "Invoice", key: "invoice" },
        { header: "Invoice Date", key: "invoiceDate", type: "date" },
        { header: "Due Date", key: "dueDate", type: "date" },
        { header: "Amount", key: "amount", type: "number" },
        { header: "Paid", key: "paid", type: "number" },
        { header: "Outstanding", key: "outstanding", type: "number" },
        { header: "Status", key: "status" },
      ],
      filtered.map((p) => ({
        vendor: p.vendor_name,
        hostel: p.hostel_name || "",
        category: p.category,
        invoice: p.invoice_number || "",
        invoiceDate: formatDate(p.invoice_date),
        dueDate: formatDate(p.due_date),
        amount: p.amount,
        paid: p.amount_paid,
        outstanding: p.amount - p.amount_paid,
        status: STATUS_LABELS[p.status] || p.status,
      }))
    );
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
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <p className="text-sm text-slate-500">
          {filtered.length} invoices · {formatMoney(totalOutstanding)} outstanding
        </p>

        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Export CSV
        </button>
        <button
          onClick={handleExportXlsx}
          disabled={filtered.length === 0}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Export Excel
        </button>

        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white"
        >
          {showForm ? "Cancel" : "+ New Invoice"}
        </button>
      </div>

      {errorMessage && !showForm && payingId === null && (
        <p className="mt-3 text-sm font-medium text-red-600">{errorMessage}</p>
      )}

      {showForm && (
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={form.vendorId}
              onChange={(e) => setForm({ ...form, vendorId: e.target.value, vendorName: "" })}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            >
              <option value="">Choose a vendor</option>
              {vendors.map((v) => (
                <option key={v.vendor_id} value={v.vendor_id}>
                  {v.name}
                </option>
              ))}
            </select>
            <input
              value={form.vendorName}
              onChange={(e) => setForm({ ...form, vendorName: e.target.value, vendorId: "" })}
              placeholder="...or a payee name"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
            <select
              value={form.hostelName}
              onChange={(e) => setForm({ ...form, hostelName: e.target.value })}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            >
              <option value="">No specific hostel</option>
              {hostelNames.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              value={form.invoiceNumber}
              onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
              placeholder="Invoice number (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
            <input
              type="number"
              min="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="Amount *"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
            <label className="block text-sm">
              Invoice Date
              <input
                type="date"
                value={form.invoiceDate}
                onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                className="mt-1 w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block text-sm">
              Due Date
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="mt-1 w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              />
            </label>
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notes (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
          </div>

          {errorMessage && <p className="mt-2 text-sm font-medium text-red-600">{errorMessage}</p>}

          <button
            onClick={handleAddInvoice}
            disabled={saving}
            className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add Invoice"}
          </button>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">No payables match.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Ageing</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => {
                  const outstanding = p.amount - p.amount_paid;
                  const bucket = ageingByPayable.get(p.payable_id)?.ageing_bucket;
                  return (
                    <tr key={p.payable_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{p.vendor_name}</p>
                        {p.invoice_number && <p className="text-xs text-slate-500">{p.invoice_number}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{p.category}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDate(p.due_date)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatMoney(outstanding)}</td>
                      <td className="px-4 py-3 text-slate-500">{bucket || "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(p.status)}`}>
                          {STATUS_LABELS[p.status] || p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {outstanding > 0 && p.status !== "cancelled" && (
                          <button
                            onClick={() => {
                              setPayingId(p.payable_id);
                              setPaymentAmount(String(outstanding));
                              setErrorMessage("");
                            }}
                            className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                          >
                            Record Payment
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payingId !== null && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-bold">Record Payment</h3>
            <label className="mt-4 block text-sm">
              Amount
              <input
                type="number"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="mt-3 block text-sm">
              Payment Mode
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              >
                <option value="">Select mode</option>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            {errorMessage && <p className="mt-3 text-sm font-medium text-red-600">{errorMessage}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  setPayingId(null);
                  setErrorMessage("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRecordPayment(payingId)}
                disabled={saving}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
