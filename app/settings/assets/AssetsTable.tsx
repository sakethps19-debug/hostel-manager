"use client";

import { useMemo, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import {
  formatDate as formatDateShared,
  formatMoney as formatMoneyShared,
} from "@/lib/format";
import type { AssetRow } from "./types";

const CATEGORIES = [
  "Furniture",
  "Electrical Appliance",
  "Electronics",
  "Kitchen Equipment",
  "Fire Safety",
  "Plumbing Fixture",
  "Other",
];

const CONDITIONS = ["Good", "Fair", "Needs Repair", "Disposed"];

function formatDate(date: string | null) {
  if (!date) return "-";
  return formatDateShared(date);
}

function formatMoney(value: number | null) {
  if (value === null) return "-";
  return formatMoneyShared(value);
}

function conditionClasses(condition: string) {
  if (condition === "Needs Repair") return "bg-red-50 text-red-700";
  if (condition === "Fair") return "bg-amber-50 text-amber-700";
  if (condition === "Disposed") return "bg-slate-100 text-slate-500";
  return "bg-emerald-50 text-emerald-700";
}

type FormState = {
  name: string;
  category: string;
  hostelName: string;
  roomNumber: string;
  bedCode: string;
  purchaseDate: string;
  purchaseCost: string;
  warrantyExpiry: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  category: "Other",
  hostelName: "",
  roomNumber: "",
  bedCode: "",
  purchaseDate: "",
  purchaseCost: "",
  warrantyExpiry: "",
  notes: "",
};

export default function AssetsTable({
  assets,
  hostelNames,
}: {
  assets: AssetRow[];
  hostelNames: string[];
}) {
  const [rows, setRows] = useState(assets);
  const [conditionFilter, setConditionFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const filtered = useMemo(
    () => rows.filter((a) => !conditionFilter || a.condition === conditionFilter),
    [rows, conditionFilter]
  );

  const totalValue = useMemo(
    () => filtered.reduce((sum, a) => sum + (a.purchase_cost || 0), 0),
    [filtered]
  );

  async function handleAdd() {
    setErrorMessage("");

    if (!form.name.trim()) {
      setErrorMessage("Please enter an asset name.");
      return;
    }

    const cost = form.purchaseCost ? Number(form.purchaseCost) : null;
    if (cost !== null && (Number.isNaN(cost) || cost < 0)) {
      setErrorMessage("Purchase cost cannot be negative.");
      return;
    }

    setSaving(true);

    try {

      const id = await callRpcClient<number>("add_asset", {
        p_name: form.name.trim(),
        p_category: form.category,
        p_hostel_name: form.hostelName || null,
        p_room_number: form.roomNumber || null,
        p_bed_code: form.bedCode || null,
        p_purchase_date: form.purchaseDate || null,
        p_purchase_cost: cost,
        p_condition: "Good",
        p_warranty_expiry: form.warrantyExpiry || null,
        p_notes: form.notes || null,
      });

      await logAuditEvent("asset_added", "asset", id, {
        name: form.name.trim(),
        category: form.category,
      });

      setRows((prev) => [
        {
          asset_id: id,
          name: form.name.trim(),
          category: form.category,
          hostel_name: form.hostelName || null,
          room_number: form.roomNumber || null,
          bed_code: form.bedCode || null,
          bed_id: null,
          purchase_date: form.purchaseDate || null,
          purchase_cost: cost,
          condition: "Good",
          warranty_expiry: form.warrantyExpiry || null,
          notes: form.notes || null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);

      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to add asset."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleConditionChange(assetId: number, condition: string) {
    setErrorMessage("");

    try {
      await callRpcClient("set_asset_condition", {
        p_asset_id: assetId,
        p_condition: condition,
      });

      await logAuditEvent("asset_condition_changed", "asset", assetId, {
        condition,
      });

      setRows((prev) =>
        prev.map((a) => (a.asset_id === assetId ? { ...a, condition } : a))
      );
    } catch (error) {
      // Force a re-render so the controlled <select> reverts to the saved
      // condition - without this the browser's own selection stays shown
      // even though rows (and the database) still hold the old value.
      setRows((prev) => [...prev]);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update condition."
      );
    }
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={conditionFilter}
          onChange={(e) => setConditionFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">All Conditions</option>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <p className="text-sm text-slate-500">
          {filtered.length} assets · {formatMoney(totalValue)} total purchase value
        </p>

        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white"
        >
          {showForm ? "Cancel" : "+ Add Asset"}
        </button>
      </div>

      {errorMessage && !showForm && (
        <p className="mt-3 text-sm font-medium text-red-600">{errorMessage}</p>
      )}

      {showForm && (
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Asset name *"
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
            <input
              value={form.roomNumber}
              onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}
              placeholder="Room number (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
            <input
              value={form.bedCode}
              onChange={(e) => setForm({ ...form, bedCode: e.target.value })}
              placeholder="Bed code (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
            <input
              type="date"
              value={form.purchaseDate}
              onChange={(e) =>
                setForm({ ...form, purchaseDate: e.target.value })
              }
              placeholder="Purchase date"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
            <input
              type="number"
              min="0"
              value={form.purchaseCost}
              onChange={(e) =>
                setForm({ ...form, purchaseCost: e.target.value })
              }
              placeholder="Purchase cost (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
            <input
              type="date"
              value={form.warrantyExpiry}
              onChange={(e) =>
                setForm({ ...form, warrantyExpiry: e.target.value })
              }
              placeholder="Warranty expiry"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notes (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
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
            {saving ? "Adding..." : "Add Asset"}
          </button>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No assets match.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Purchased</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3">Warranty Until</th>
                  <th className="px-4 py-3">Condition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((asset) => (
                  <tr key={asset.asset_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{asset.name}</p>
                      <p className="text-xs text-slate-500">{asset.category}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {[
                        asset.hostel_name,
                        asset.room_number && `Room ${asset.room_number}`,
                        asset.bed_code,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "-"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(asset.purchase_date)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(asset.purchase_cost)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(asset.warranty_expiry)}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={asset.condition}
                        onChange={(e) =>
                          handleConditionChange(asset.asset_id, e.target.value)
                        }
                        className={`rounded-full border-0 px-3 py-1 text-xs font-semibold outline-none ${conditionClasses(asset.condition)}`}
                      >
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
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
