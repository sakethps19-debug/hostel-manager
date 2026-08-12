"use client";

import { useMemo, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import {
  formatDate as formatDateShared,
  formatMoney as formatMoneyShared,
} from "@/lib/format";
import type { AssetRow, AssetStatus } from "./types";
import { ASSET_STATUS_LABELS } from "./types";
import { suggestNextAssetCode } from "@/lib/accounting/assetCode";

// Fallback list used only if the asset_categories table can't be reached
// (e.g. accounting migrations not yet applied) - AssetsPage passes the real
// broad-grouping list fetched from the database as the `categories` prop.
const FALLBACK_CATEGORIES = ["Furniture", "Electronics", "Other"];

const OTHER_CATEGORY_VALUE = "__other__";

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
  customCategory: string;
  hostelName: string;
  roomNumber: string;
  bedCode: string;
  purchaseDate: string;
  purchaseCost: string;
  warrantyExpiry: string;
  notes: string;
  assetCode: string;
  paymentMode: string;
};

function emptyForm(categories: string[]): FormState {
  return {
    name: "",
    category: categories[0] ?? OTHER_CATEGORY_VALUE,
    customCategory: "",
    hostelName: "",
    roomNumber: "",
    bedCode: "",
    purchaseDate: "",
    purchaseCost: "",
    warrantyExpiry: "",
    notes: "",
    assetCode: "",
    paymentMode: "",
  };
}

export default function AssetsTable({
  assets,
  hostelNames,
  categories: categoriesProp,
  canManageFinance,
}: {
  assets: AssetRow[];
  hostelNames: string[];
  categories: string[];
  canManageFinance: boolean;
}) {
  const categories = categoriesProp.length > 0 ? categoriesProp : FALLBACK_CATEGORIES;

  const [rows, setRows] = useState(assets);
  const [conditionFilter, setConditionFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(categories));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // The actual category text to save - either the picked broad grouping, or
  // whatever the owner typed when they picked "Other" (never the literal
  // sentinel value).
  const resolvedCategory =
    form.category === OTHER_CATEGORY_VALUE ? form.customCategory.trim() : form.category;

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

    if (form.category === OTHER_CATEGORY_VALUE && !resolvedCategory) {
      setErrorMessage("Please specify what \"Other\" category this asset is.");
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
        p_category: resolvedCategory,
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
        category: resolvedCategory,
      });

      const assetCode = form.assetCode.trim();
      if (assetCode) {
        await callRpcClient("set_asset_code", { p_asset_id: id, p_asset_code: assetCode });
      }

      if (cost && cost > 0) {
        if (form.paymentMode) {
          await callRpcClient("update_asset_finance_fields", {
            p_asset_id: id,
            p_payment_mode: form.paymentMode,
          });
        }
        // Books the purchase (Dr Fixed Asset or expense / Cr Cash-Bank) — a
        // best-effort second step after add_asset succeeds, mirroring how
        // logAuditEvent is already called here; reconcile_journal_postings()
        // on the Reconciliation page catches any asset that fails to post.
        try {
          await callRpcClient("post_asset_purchase_journal", { p_asset_id: id });
        } catch {
          // surfaced via the Reconciliation page's unjournaled-asset check, not here
        }
      }

      setRows((prev) => [
        {
          asset_id: id,
          name: form.name.trim(),
          category: resolvedCategory,
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
          asset_code: assetCode || null,
          description: null,
          floor_number: null,
          location_notes: null,
          vendor_id: null,
          invoice_number: null,
          payment_mode: form.paymentMode || null,
          serial_number: null,
          model: null,
          brand: null,
          warranty_start_date: null,
          useful_life_months: null,
          depreciation_method: "straight_line",
          residual_value: 0,
          depreciation_start_date: null,
          accumulated_depreciation: 0,
          status: "in_use",
          last_service_date: null,
          next_service_date: null,
          capitalized: true,
          gl_account_id: null,
        },
        ...prev,
      ]);

      setForm(emptyForm(categories));
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
          {filtered.length} assets
          {canManageFinance ? ` · ${formatMoney(totalValue)} total purchase value` : ""}
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
            <div>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={OTHER_CATEGORY_VALUE}>Other (please specify)</option>
              </select>
              {form.category === OTHER_CATEGORY_VALUE && (
                <input
                  value={form.customCategory}
                  onChange={(e) => setForm({ ...form, customCategory: e.target.value })}
                  placeholder="What is this asset? *"
                  className="mt-2 w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
                />
              )}
            </div>
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
            {canManageFinance && (
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
            )}
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
            <div className="flex gap-2">
              <input
                value={form.assetCode}
                onChange={(e) => setForm({ ...form, assetCode: e.target.value })}
                placeholder="Asset code (optional)"
                className="w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    assetCode: suggestNextAssetCode(
                      rows.map((r) => r.asset_code).filter((c): c is string => Boolean(c)),
                      f.hostelName || null,
                      f.category === OTHER_CATEGORY_VALUE ? f.customCategory.trim() : f.category
                    ),
                  }))
                }
                className="whitespace-nowrap rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
              >
                Suggest
              </button>
            </div>
            {canManageFinance && (
              <select
                value={form.paymentMode}
                onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              >
                <option value="">Payment mode (if cost entered)</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Other">Other</option>
              </select>
            )}
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
                  <th className="px-4 py-3">Status</th>
                  {canManageFinance && <th className="px-4 py-3 text-right">Cost</th>}
                  {canManageFinance && <th className="px-4 py-3 text-right">Net Book Value</th>}
                  <th className="px-4 py-3">Warranty Until</th>
                  <th className="px-4 py-3">Condition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((asset) => (
                  <tr key={asset.asset_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <a
                        href={`/settings/assets/${asset.asset_id}`}
                        className="font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        {asset.name}
                      </a>
                      <p className="text-xs text-slate-500">
                        {asset.category}
                        {asset.asset_code ? ` · ${asset.asset_code}` : ""}
                      </p>
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
                    <td className="px-4 py-3 text-slate-500">
                      {ASSET_STATUS_LABELS[asset.status as AssetStatus] || asset.status}
                    </td>
                    {canManageFinance && (
                      <td className="px-4 py-3 text-right">
                        {formatMoney(asset.purchase_cost)}
                      </td>
                    )}
                    {canManageFinance && (
                      <td className="px-4 py-3 text-right">
                        {asset.purchase_cost
                          ? formatMoney(asset.purchase_cost - (asset.accumulated_depreciation || 0))
                          : "-"}
                      </td>
                    )}
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
