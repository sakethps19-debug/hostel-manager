"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import { todayIsoDateIST } from "@/lib/format";

type RecurringTemplateRow = {
  template_id: number;
  hostel_name: string | null;
  category: string;
  amount: number;
  vendor: string | null;
  payment_mode: string;
  reference_number: string | null;
  notes: string | null;
  day_of_month: number;
  is_active: boolean;
  last_generated_for: string | null;
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

const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Other"];

function formatMoney(value: number) {
  return `Rs. ${Number(value).toLocaleString("en-IN")}`;
}

type FormState = {
  hostelName: string;
  category: string;
  amount: string;
  vendor: string;
  paymentMode: string;
  referenceNumber: string;
  notes: string;
  dayOfMonth: string;
};

const EMPTY_FORM: FormState = {
  hostelName: "",
  category: "",
  amount: "",
  vendor: "",
  paymentMode: "Cash",
  referenceNumber: "",
  notes: "",
  dayOfMonth: "1",
};

export default function RecurringExpensesView({
  templates,
  hostelNames,
}: {
  templates: RecurringTemplateRow[];
  hostelNames: string[];
}) {
  const [rows, setRows] = useState(templates);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  async function handleAdd() {
    setErrorMessage("");

    const amt = Number(form.amount);
    const day = Number(form.dayOfMonth);

    if (!form.category) {
      setErrorMessage("Please select a category.");
      return;
    }

    if (!Number.isFinite(amt) || amt <= 0) {
      setErrorMessage("Please enter a valid amount.");
      return;
    }

    if (!Number.isInteger(day) || day < 1 || day > 28) {
      setErrorMessage("Day of month must be between 1 and 28.");
      return;
    }

    setSaving(true);

    try {
      const id = await callRpcClient<number>("add_recurring_expense_template", {
        p_hostel_name: form.hostelName || null,
        p_category: form.category,
        p_amount: amt,
        p_vendor: form.vendor || null,
        p_payment_mode: form.paymentMode,
        p_reference_number: form.referenceNumber || null,
        p_notes: form.notes || null,
        p_day_of_month: day,
      });

      await logAuditEvent(
        "recurring_expense_template_added",
        "recurring_expense_template",
        id,
        { category: form.category, amount: amt }
      );

      setRows((prev) => [
        {
          template_id: id,
          hostel_name: form.hostelName || null,
          category: form.category,
          amount: amt,
          vendor: form.vendor || null,
          payment_mode: form.paymentMode,
          reference_number: form.referenceNumber || null,
          notes: form.notes || null,
          day_of_month: day,
          is_active: true,
          last_generated_for: null,
        },
        ...prev,
      ]);

      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to add template."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(template: RecurringTemplateRow) {
    const nextActive = !template.is_active;

    try {
      await callRpcClient("set_recurring_expense_template_active", {
        p_template_id: template.template_id,
        p_is_active: nextActive,
      });

      await logAuditEvent(
        nextActive
          ? "recurring_expense_template_reactivated"
          : "recurring_expense_template_deactivated",
        "recurring_expense_template",
        template.template_id,
        {}
      );

      setRows((prev) =>
        prev.map((t) =>
          t.template_id === template.template_id
            ? { ...t, is_active: nextActive }
            : t
        )
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update template."
      );
    }
  }

  async function handleGenerate() {
    setErrorMessage("");
    setStatusMessage("");
    setGenerating(true);

    try {
      const count = await callRpcClient<number>(
        "generate_due_recurring_expenses"
      );

      await logAuditEvent(
        "recurring_expenses_generated",
        "recurring_expense_template",
        null,
        { count }
      );

      setStatusMessage(
        count > 0
          ? `Generated ${count} expense${count === 1 ? "" : "s"} into the Expenses log.`
          : "No templates were due today."
      );

      if (count > 0) {
        const today = todayIsoDateIST();
        const todayOfMonth = Number(today.slice(8, 10));
        const monthStart = today.slice(0, 7) + "-01";

        setRows((prev) =>
          prev.map((t) =>
            t.is_active &&
            t.day_of_month <= todayOfMonth &&
            (!t.last_generated_for || t.last_generated_for < monthStart)
              ? { ...t, last_generated_for: monthStart }
              : t
          )
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to generate due expenses."
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          {generating ? "Generating..." : "Generate Due Expenses"}
        </button>

        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white"
        >
          {showForm ? "Cancel" : "+ New Template"}
        </button>
      </div>

      {statusMessage && (
        <p className="mt-3 text-sm font-medium text-emerald-700">
          {statusMessage}
        </p>
      )}

      {showForm && (
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={form.hostelName}
              onChange={(e) => setForm({ ...form, hostelName: e.target.value })}
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
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
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
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="Amount *"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <input
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              placeholder="Vendor / Payee (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <select
              value={form.paymentMode}
              onChange={(e) =>
                setForm({ ...form, paymentMode: e.target.value })
              }
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              max="28"
              value={form.dayOfMonth}
              onChange={(e) =>
                setForm({ ...form, dayOfMonth: e.target.value })
              }
              placeholder="Day of month (1-28) *"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <input
              value={form.referenceNumber}
              onChange={(e) =>
                setForm({ ...form, referenceNumber: e.target.value })
              }
              placeholder="Reference number (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-2"
            />

            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notes (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-3"
            />
          </div>

          {errorMessage && (
            <p className="mt-2 text-sm font-medium text-red-600">
              {errorMessage}
            </p>
          )}

          <button
            onClick={handleAdd}
            disabled={saving}
            className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add Template"}
          </button>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No recurring expense templates yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Hostel</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3">Last Generated</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => (
                  <tr
                    key={t.template_id}
                    className={`hover:bg-slate-50 ${
                      t.is_active ? "" : "opacity-50"
                    }`}
                  >
                    <td className="px-4 py-3 font-semibold">
                      {t.category}
                      {!t.is_active && (
                        <p className="text-xs font-normal text-slate-400">
                          Inactive
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">{t.hostel_name || "Common"}</td>
                    <td className="px-4 py-3">{t.vendor || "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatMoney(t.amount)}
                    </td>
                    <td className="px-4 py-3">{t.day_of_month}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {t.last_generated_for
                        ? new Date(
                            `${t.last_generated_for}T00:00:00`
                          ).toLocaleDateString("en-IN", {
                            month: "short",
                            year: "numeric",
                          })
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleToggleActive(t)}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {t.is_active ? "Deactivate" : "Reactivate"}
                      </button>
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
