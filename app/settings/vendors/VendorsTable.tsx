"use client";

import { useMemo, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

type VendorRow = {
  vendor_id: number;
  name: string;
  category: string;
  contact_person: string | null;
  contact_number: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  totalSpend: number;
  expenseCount: number;
};

const CATEGORIES = [
  "Maintenance",
  "Groceries",
  "Utilities",
  "Furniture",
  "Cleaning Supplies",
  "Housekeeping",
  "Security",
  "Other",
];

function formatMoney(value: number) {
  return `Rs. ${Number(value).toLocaleString("en-IN")}`;
}

type VendorFormState = {
  name: string;
  category: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
  address: string;
  gstNumber: string;
  notes: string;
};

const EMPTY_FORM: VendorFormState = {
  name: "",
  category: "Other",
  contactPerson: "",
  contactNumber: "",
  email: "",
  address: "",
  gstNumber: "",
  notes: "",
};

export default function VendorsTable({ vendors }: { vendors: VendorRow[] }) {
  const [rows, setRows] = useState(vendors);
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<VendorFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const filtered = useMemo(
    () => rows.filter((v) => showInactive || v.is_active),
    [rows, showInactive]
  );

  function startEdit(vendor: VendorRow) {
    setEditingId(vendor.vendor_id);
    setForm({
      name: vendor.name,
      category: vendor.category,
      contactPerson: vendor.contact_person || "",
      contactNumber: vendor.contact_number || "",
      email: vendor.email || "",
      address: vendor.address || "",
      gstNumber: vendor.gst_number || "",
      notes: vendor.notes || "",
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrorMessage("");
  }

  async function handleSave() {
    setErrorMessage("");

    if (!form.name.trim()) {
      setErrorMessage("Please enter a vendor name.");
      return;
    }

    setSaving(true);

    try {
      if (editingId !== null) {
        await callRpcClient("update_vendor", {
          p_vendor_id: editingId,
          p_name: form.name.trim(),
          p_category: form.category,
          p_contact_person: form.contactPerson || null,
          p_contact_number: form.contactNumber || null,
          p_email: form.email || null,
          p_address: form.address || null,
          p_gst_number: form.gstNumber || null,
          p_notes: form.notes || null,
        });

        await logAuditEvent("vendor_updated", "vendor", editingId, {
          name: form.name.trim(),
        });

        setRows((prev) =>
          prev.map((v) =>
            v.vendor_id === editingId
              ? {
                  ...v,
                  name: form.name.trim(),
                  category: form.category,
                  contact_person: form.contactPerson || null,
                  contact_number: form.contactNumber || null,
                  email: form.email || null,
                  address: form.address || null,
                  gst_number: form.gstNumber || null,
                  notes: form.notes || null,
                }
              : v
          )
        );
      } else {
        const id = await callRpcClient<number>("add_vendor", {
          p_name: form.name.trim(),
          p_category: form.category,
          p_contact_person: form.contactPerson || null,
          p_contact_number: form.contactNumber || null,
          p_email: form.email || null,
          p_address: form.address || null,
          p_gst_number: form.gstNumber || null,
          p_notes: form.notes || null,
        });

        await logAuditEvent("vendor_added", "vendor", id, {
          name: form.name.trim(),
          category: form.category,
        });

        setRows((prev) => [
          {
            vendor_id: id,
            name: form.name.trim(),
            category: form.category,
            contact_person: form.contactPerson || null,
            contact_number: form.contactNumber || null,
            email: form.email || null,
            address: form.address || null,
            gst_number: form.gstNumber || null,
            notes: form.notes || null,
            is_active: true,
            created_at: new Date().toISOString(),
            totalSpend: 0,
            expenseCount: 0,
          },
          ...prev,
        ]);
      }

      cancelForm();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save vendor."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(vendor: VendorRow) {
    const nextActive = !vendor.is_active;

    if (
      !nextActive &&
      !window.confirm(
        `Deactivate ${vendor.name}? It will no longer appear in the expense form's vendor autocomplete or the default vendor list.`
      )
    ) {
      return;
    }

    try {
      await callRpcClient("set_vendor_active", {
        p_vendor_id: vendor.vendor_id,
        p_is_active: nextActive,
      });

      await logAuditEvent(
        nextActive ? "vendor_reactivated" : "vendor_deactivated",
        "vendor",
        vendor.vendor_id,
        {}
      );

      setRows((prev) =>
        prev.map((v) =>
          v.vendor_id === vendor.vendor_id ? { ...v, is_active: nextActive } : v
        )
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update vendor."
      );
    }
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive vendors
        </label>

        <button
          onClick={() => (showForm ? cancelForm() : setShowForm(true))}
          className="ml-auto rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white"
        >
          {showForm ? "Cancel" : "+ Add Vendor"}
        </button>
      </div>

      {showForm && (
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <p className="font-semibold text-slate-900">
            {editingId ? "Edit Vendor" : "Add Vendor"}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Vendor name *"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
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
              value={form.contactPerson}
              onChange={(e) =>
                setForm({ ...form, contactPerson: e.target.value })
              }
              placeholder="Contact person (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
            <input
              value={form.contactNumber}
              onChange={(e) =>
                setForm({ ...form, contactNumber: e.target.value })
              }
              placeholder="Contact number (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
            <input
              value={form.gstNumber}
              onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
              placeholder="GST number (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Address (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-2"
            />
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notes (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-2"
            />
          </div>

          {errorMessage && (
            <p className="mt-2 text-sm font-medium text-red-600">
              {errorMessage}
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Save Changes" : "Add Vendor"}
          </button>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No vendors match.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3 text-right">Expenses</th>
                  <th className="px-4 py-3 text-right">Total Spend</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((vendor) => (
                  <tr
                    key={vendor.vendor_id}
                    className={`hover:bg-slate-50 ${
                      vendor.is_active ? "" : "opacity-50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold">{vendor.name}</p>
                      {!vendor.is_active && (
                        <p className="text-xs text-slate-400">Inactive</p>
                      )}
                    </td>
                    <td className="px-4 py-3">{vendor.category}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {[vendor.contact_person, vendor.contact_number]
                        .filter(Boolean)
                        .join(" · ") || "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {vendor.expenseCount}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatMoney(vendor.totalSpend)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(vendor)}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(vendor)}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {vendor.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
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
