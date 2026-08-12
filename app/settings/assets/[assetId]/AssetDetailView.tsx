"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import { formatDate, formatMoney } from "@/lib/format";
import { buildAssetFilePath, getAssetFileSignedUrl, uploadAssetFile } from "@/lib/supabase/assetFiles";
import { ASSET_STATUS_LABELS, type AssetRow, type AssetStatus, type AssetTransferRow, type AssetDocumentRow, type AssetDisposalRow, type AssetDepreciationEntryRow } from "../types";
import type { AssetCategoryRow } from "@/lib/accounting/types";

type VendorOption = { vendor_id: number; name: string };
type MaintenanceRow = {
  maintenance_id: number;
  reason: string;
  start_date: string;
  actual_completion_date: string | null;
  cost: number | null;
  status: string;
};

const ASSET_STATUSES: AssetStatus[] = [
  "in_use", "available", "under_maintenance", "damaged", "retired", "sold", "lost", "written_off",
];

const DOCUMENT_TYPES = [
  { value: "purchase_invoice", label: "Purchase Invoice" },
  { value: "warranty", label: "Warranty Document" },
  { value: "service_invoice", label: "Service Invoice" },
  { value: "photograph", label: "Photograph" },
  { value: "disposal_document", label: "Disposal Document" },
  { value: "other", label: "Other" },
];

function safeDate(value: string | null) {
  return value ? formatDate(value) : "-";
}

function safeMoney(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : formatMoney(value);
}

export default function AssetDetailView({
  asset,
  hostelNames,
  categories,
  vendors,
  initialTransfers,
  initialDocuments,
  maintenanceHistory,
  disposal,
  depreciationEntries,
  canManageFinance,
}: {
  asset: AssetRow;
  hostelNames: string[];
  categories: AssetCategoryRow[];
  vendors: VendorOption[];
  initialTransfers: AssetTransferRow[];
  initialDocuments: AssetDocumentRow[];
  maintenanceHistory: MaintenanceRow[];
  disposal: AssetDisposalRow | null;
  depreciationEntries: AssetDepreciationEntryRow[];
  canManageFinance: boolean;
}) {
  const [current, setCurrent] = useState(asset);
  const [transfers, setTransfers] = useState(initialTransfers);
  const [documents, setDocuments] = useState(initialDocuments);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // Finance fields form
  const [financeForm, setFinanceForm] = useState({
    purchaseCost: asset.purchase_cost?.toString() || "",
    vendorId: asset.vendor_id?.toString() || "",
    invoiceNumber: asset.invoice_number || "",
    paymentMode: asset.payment_mode || "",
    serialNumber: asset.serial_number || "",
    model: asset.model || "",
    brand: asset.brand || "",
    warrantyStartDate: asset.warranty_start_date || "",
    warrantyExpiry: asset.warranty_expiry || "",
    usefulLifeMonths: asset.useful_life_months?.toString() || "",
    residualValue: asset.residual_value?.toString() || "0",
    depreciationStartDate: asset.depreciation_start_date || "",
  });

  // Transfer form
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferForm, setTransferForm] = useState({
    toHostelName: "", toRoomNumber: "", toBedCode: "", reason: "", notes: "",
  });

  // Document upload form
  const [docType, setDocType] = useState(DOCUMENT_TYPES[0].value);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docNotes, setDocNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  // Disposal form
  const [showDisposalForm, setShowDisposalForm] = useState(false);
  const [disposalForm, setDisposalForm] = useState({
    disposalDate: new Date().toISOString().slice(0, 10),
    saleProceeds: "0",
    buyer: "",
    reason: "",
  });

  const nbv =
    current.purchase_cost !== null ? current.purchase_cost - (current.accumulated_depreciation || 0) : null;

  async function handleFinanceSave() {
    setErrorMessage("");
    setSaving(true);

    try {
      const cost = financeForm.purchaseCost ? Number(financeForm.purchaseCost) : null;
      if (cost !== null && (Number.isNaN(cost) || cost < 0)) {
        throw new Error("Purchase cost cannot be negative.");
      }
      const usefulLife = financeForm.usefulLifeMonths ? Number(financeForm.usefulLifeMonths) : null;
      const residual = financeForm.residualValue ? Number(financeForm.residualValue) : 0;

      await callRpcClient("update_asset_finance_fields", {
        p_asset_id: current.asset_id,
        p_purchase_cost: cost,
        p_vendor_id: financeForm.vendorId ? Number(financeForm.vendorId) : null,
        p_invoice_number: financeForm.invoiceNumber || null,
        p_payment_mode: financeForm.paymentMode || null,
        p_serial_number: financeForm.serialNumber || null,
        p_model: financeForm.model || null,
        p_brand: financeForm.brand || null,
        p_warranty_start_date: financeForm.warrantyStartDate || null,
        p_warranty_expiry: financeForm.warrantyExpiry || null,
        p_useful_life_months: usefulLife,
        p_depreciation_method: "straight_line",
        p_residual_value: residual,
        p_depreciation_start_date: financeForm.depreciationStartDate || financeForm.warrantyStartDate || null,
        p_gl_account_id: null,
      });

      await logAuditEvent("asset_finance_fields_updated", "asset", current.asset_id, {});

      setCurrent((prev) => ({
        ...prev,
        purchase_cost: cost,
        vendor_id: financeForm.vendorId ? Number(financeForm.vendorId) : null,
        invoice_number: financeForm.invoiceNumber || null,
        payment_mode: financeForm.paymentMode || null,
        serial_number: financeForm.serialNumber || null,
        model: financeForm.model || null,
        brand: financeForm.brand || null,
        warranty_start_date: financeForm.warrantyStartDate || null,
        warranty_expiry: financeForm.warrantyExpiry || null,
        useful_life_months: usefulLife,
        residual_value: residual,
        depreciation_start_date: financeForm.depreciationStartDate || null,
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save finance details.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTransfer() {
    setErrorMessage("");
    if (!transferForm.toHostelName) {
      setErrorMessage("Please choose a destination hostel.");
      return;
    }
    setSaving(true);
    try {
      await callRpcClient("transfer_asset", {
        p_asset_id: current.asset_id,
        p_to_hostel_name: transferForm.toHostelName,
        p_to_room_number: transferForm.toRoomNumber || null,
        p_to_bed_code: transferForm.toBedCode || null,
        p_reason: transferForm.reason || null,
        p_notes: transferForm.notes || null,
      });

      await logAuditEvent("asset_transferred", "asset", current.asset_id, {
        to_hostel_name: transferForm.toHostelName,
      });

      setTransfers((prev) => [
        {
          transfer_id: Date.now(),
          asset_id: current.asset_id,
          from_hostel_name: current.hostel_name,
          from_room_number: current.room_number,
          from_bed_code: current.bed_code,
          to_hostel_name: transferForm.toHostelName,
          to_room_number: transferForm.toRoomNumber || null,
          to_bed_code: transferForm.toBedCode || null,
          transfer_date: new Date().toISOString().slice(0, 10),
          transferred_by: null,
          reason: transferForm.reason || null,
          notes: transferForm.notes || null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setCurrent((prev) => ({
        ...prev,
        hostel_name: transferForm.toHostelName,
        room_number: transferForm.toRoomNumber || null,
        bed_code: transferForm.toBedCode || null,
      }));
      setTransferForm({ toHostelName: "", toRoomNumber: "", toBedCode: "", reason: "", notes: "" });
      setShowTransferForm(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to transfer asset.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadDocument() {
    setErrorMessage("");
    if (!docFile) {
      setErrorMessage("Please choose a file to upload.");
      return;
    }
    setUploading(true);
    try {
      const path = buildAssetFilePath(current.asset_id, docFile.name);
      await uploadAssetFile(path, docFile);

      const documentId = await callRpcClient<number>("add_asset_document", {
        p_asset_id: current.asset_id,
        p_document_type: docType,
        p_storage_path: path,
        p_notes: docNotes || null,
      });

      await logAuditEvent("asset_document_added", "asset", current.asset_id, { document_type: docType });

      setDocuments((prev) => [
        {
          document_id: documentId,
          asset_id: current.asset_id,
          document_type: docType as AssetDocumentRow["document_type"],
          storage_path: path,
          notes: docNotes || null,
          uploaded_by: null,
          uploaded_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setDocFile(null);
      setDocNotes("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to upload document.");
    } finally {
      setUploading(false);
    }
  }

  async function handleViewDocument(path: string) {
    try {
      const url = await getAssetFileSignedUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to open document.");
    }
  }

  async function handleDispose() {
    setErrorMessage("");
    const proceeds = Number(disposalForm.saleProceeds || 0);
    if (Number.isNaN(proceeds) || proceeds < 0) {
      setErrorMessage("Sale proceeds cannot be negative.");
      return;
    }
    setSaving(true);
    try {
      await callRpcClient("post_asset_disposal_journal", {
        p_asset_id: current.asset_id,
        p_disposal_date: disposalForm.disposalDate,
        p_sale_proceeds: proceeds,
        p_buyer: disposalForm.buyer || null,
        p_reason: disposalForm.reason || null,
      });

      await logAuditEvent("asset_disposed", "asset", current.asset_id, {
        sale_proceeds: proceeds,
      });

      setCurrent((prev) => ({ ...prev, status: proceeds > 0 ? "sold" : "written_off" }));
      setShowDisposalForm(false);
      window.location.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to record disposal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            {current.category}
            {current.asset_code ? ` · ${current.asset_code}` : ""}
          </p>
          <h1 className="mt-2 text-3xl font-bold">{current.name}</h1>
        </div>
        <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
          {ASSET_STATUS_LABELS[current.status]}
        </span>
      </div>

      {errorMessage && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errorMessage}</p>
      )}

      {/* Operational status + location */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Status & Location</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
            <select
              value={current.status}
              onChange={async (e) => {
                const newStatus = e.target.value;
                setErrorMessage("");
                const prevStatus = current.status;
                setCurrent((prev) => ({ ...prev, status: newStatus as AssetStatus }));
                try {
                  await callRpcClient("set_asset_status", { p_asset_id: current.asset_id, p_status: newStatus });
                  await logAuditEvent("asset_status_changed", "asset", current.asset_id, { status: newStatus });
                } catch (error) {
                  setCurrent((prev) => ({ ...prev, status: prevStatus }));
                  setErrorMessage(error instanceof Error ? error.message : "Unable to update status.");
                }
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            >
              {ASSET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ASSET_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p>
            <p className="mt-2 text-sm">
              {[current.hostel_name, current.room_number && `Room ${current.room_number}`, current.bed_code]
                .filter(Boolean)
                .join(" · ") || "Unassigned"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Condition</p>
            <p className="mt-2 text-sm">{current.condition}</p>
          </div>
        </div>

        <div className="mt-4">
          <button
            onClick={() => setShowTransferForm((v) => !v)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {showTransferForm ? "Cancel Transfer" : "Transfer Asset"}
          </button>
        </div>

        {showTransferForm && (
          <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={transferForm.toHostelName}
                onChange={(e) => setTransferForm({ ...transferForm, toHostelName: e.target.value })}
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              >
                <option value="">Destination hostel *</option>
                {hostelNames.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <input
                value={transferForm.toRoomNumber}
                onChange={(e) => setTransferForm({ ...transferForm, toRoomNumber: e.target.value })}
                placeholder="Room number (optional)"
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              />
              <input
                value={transferForm.toBedCode}
                onChange={(e) => setTransferForm({ ...transferForm, toBedCode: e.target.value })}
                placeholder="Bed code (optional)"
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              />
              <input
                value={transferForm.reason}
                onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })}
                placeholder="Reason (optional)"
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              />
              <input
                value={transferForm.notes}
                onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                placeholder="Notes (optional)"
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-2"
              />
            </div>
            <button
              onClick={handleTransfer}
              disabled={saving}
              className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Transferring..." : "Confirm Transfer"}
            </button>
          </div>
        )}

        {transfers.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transfer History</p>
            <ul className="mt-2 space-y-2 text-sm">
              {transfers.map((t) => (
                <li key={t.transfer_id} className="rounded-xl bg-slate-50 px-3 py-2">
                  {safeDate(t.transfer_date)}:{" "}
                  {[t.from_hostel_name, t.from_room_number].filter(Boolean).join(" ") || "Unassigned"} →{" "}
                  {[t.to_hostel_name, t.to_room_number].filter(Boolean).join(" ") || "Unassigned"}
                  {t.reason ? ` · ${t.reason}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Finance fields */}
      {canManageFinance ? (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Finance Details</h2>
          <p className="mt-1 text-sm text-slate-500">
            Purchase cost, depreciation, and vendor details — visible to Owner/Finance Manager only.
          </p>

          {categories.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const match = categories.find((c) => c.name === current.category);
                if (!match) return;
                setFinanceForm((f) => ({
                  ...f,
                  usefulLifeMonths: match.default_useful_life_months?.toString() || f.usefulLifeMonths,
                  residualValue:
                    match.default_residual_pct && financeForm.purchaseCost
                      ? String(
                          Math.round((Number(financeForm.purchaseCost) * match.default_residual_pct) / 100)
                        )
                      : f.residualValue,
                }));
              }}
              className="mt-3 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
            >
              Use &ldquo;{current.category}&rdquo; category defaults for useful life &amp; residual value
            </button>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              Purchase Cost
              <input
                type="number"
                min="0"
                value={financeForm.purchaseCost}
                onChange={(e) => setFinanceForm({ ...financeForm, purchaseCost: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block text-sm">
              Vendor
              <select
                value={financeForm.vendorId}
                onChange={(e) => setFinanceForm({ ...financeForm, vendorId: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              >
                <option value="">No vendor</option>
                {vendors.map((v) => (
                  <option key={v.vendor_id} value={v.vendor_id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Invoice Number
              <input
                value={financeForm.invoiceNumber}
                onChange={(e) => setFinanceForm({ ...financeForm, invoiceNumber: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block text-sm">
              Payment Mode
              <select
                value={financeForm.paymentMode}
                onChange={(e) => setFinanceForm({ ...financeForm, paymentMode: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              >
                <option value="">Not set</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label className="block text-sm">
              Serial Number
              <input
                value={financeForm.serialNumber}
                onChange={(e) => setFinanceForm({ ...financeForm, serialNumber: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block text-sm">
              Brand
              <input
                value={financeForm.brand}
                onChange={(e) => setFinanceForm({ ...financeForm, brand: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block text-sm">
              Model
              <input
                value={financeForm.model}
                onChange={(e) => setFinanceForm({ ...financeForm, model: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block text-sm">
              Warranty Start
              <input
                type="date"
                value={financeForm.warrantyStartDate}
                onChange={(e) => setFinanceForm({ ...financeForm, warrantyStartDate: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block text-sm">
              Warranty Expiry
              <input
                type="date"
                value={financeForm.warrantyExpiry}
                onChange={(e) => setFinanceForm({ ...financeForm, warrantyExpiry: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block text-sm">
              Useful Life (months)
              <input
                type="number"
                min="0"
                value={financeForm.usefulLifeMonths}
                onChange={(e) => setFinanceForm({ ...financeForm, usefulLifeMonths: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block text-sm">
              Residual Value
              <input
                type="number"
                min="0"
                value={financeForm.residualValue}
                onChange={(e) => setFinanceForm({ ...financeForm, residualValue: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block text-sm">
              Depreciation Start Date
              <input
                type="date"
                value={financeForm.depreciationStartDate}
                onChange={(e) => setFinanceForm({ ...financeForm, depreciationStartDate: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>

          <button
            onClick={handleFinanceSave}
            disabled={saving}
            className="mt-4 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Finance Details"}
          </button>

          <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accumulated Depreciation</p>
              <p className="mt-1 font-semibold">{safeMoney(current.accumulated_depreciation)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Net Book Value</p>
              <p className="mt-1 font-semibold">{safeMoney(nbv)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Capitalized</p>
              <p className="mt-1 font-semibold">{current.capitalized ? "Yes" : "No (expensed)"}</p>
            </div>
          </div>

          {depreciationEntries.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Depreciation History</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {depreciationEntries.map((d) => (
                  <li key={d.depreciation_entry_id}>
                    {d.period_month}/{d.period_year}: {formatMoney(d.depreciation_amount)} — NBV after:{" "}
                    {formatMoney(d.net_book_value_after)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!disposal ? (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <button
                onClick={() => setShowDisposalForm((v) => !v)}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                {showDisposalForm ? "Cancel Disposal" : "Dispose / Write Off Asset"}
              </button>

              {showDisposalForm && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      Disposal Date
                      <input
                        type="date"
                        value={disposalForm.disposalDate}
                        onChange={(e) => setDisposalForm({ ...disposalForm, disposalDate: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-red-200 px-3 py-2 text-sm outline-none"
                      />
                    </label>
                    <label className="block text-sm">
                      Sale Proceeds (0 if written off)
                      <input
                        type="number"
                        min="0"
                        value={disposalForm.saleProceeds}
                        onChange={(e) => setDisposalForm({ ...disposalForm, saleProceeds: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-red-200 px-3 py-2 text-sm outline-none"
                      />
                    </label>
                    <input
                      value={disposalForm.buyer}
                      onChange={(e) => setDisposalForm({ ...disposalForm, buyer: e.target.value })}
                      placeholder="Buyer (optional)"
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm outline-none"
                    />
                    <input
                      value={disposalForm.reason}
                      onChange={(e) => setDisposalForm({ ...disposalForm, reason: e.target.value })}
                      placeholder="Reason"
                      className="rounded-xl border border-red-200 px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Book value at disposal: {safeMoney(nbv)}. This posts an accounting entry and cannot be undone
                    except by a manual reversal in the General Ledger.
                  </p>
                  <button
                    onClick={handleDispose}
                    disabled={saving}
                    className="mt-3 rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {saving ? "Recording..." : "Confirm Disposal"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <p className="font-semibold">Disposed {safeDate(disposal.disposal_date)}</p>
              <p className="text-slate-500">
                Sale proceeds {formatMoney(disposal.sale_proceeds)} · Book value {formatMoney(disposal.book_value_at_disposal)} ·{" "}
                {disposal.gain_loss >= 0 ? "Gain" : "Loss"} {formatMoney(Math.abs(disposal.gain_loss))}
              </p>
            </div>
          )}
        </section>
      ) : (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">
            Purchase cost, depreciation, and disposal details are visible to the Owner and Finance Manager only.
          </p>
        </section>
      )}

      {/* Maintenance history */}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Maintenance History</h2>
        {maintenanceHistory.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No maintenance recorded against this asset yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {maintenanceHistory.map((m) => (
              <li key={m.maintenance_id} className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="font-semibold">{m.reason}</p>
                <p className="text-xs text-slate-500">
                  {safeDate(m.start_date)}
                  {m.actual_completion_date ? ` – ${safeDate(m.actual_completion_date)}` : " (open)"}
                  {m.cost ? ` · ${formatMoney(m.cost)}` : ""} · {m.status}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Documents */}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Documents</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            type="file"
            onChange={(e) => setDocFile(e.target.files?.[0] || null)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />
          <input
            value={docNotes}
            onChange={(e) => setDocNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
          />
        </div>
        <button
          onClick={handleUploadDocument}
          disabled={uploading}
          className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload Document"}
        </button>

        {documents.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No documents uploaded yet.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {documents.map((d) => (
              <li key={d.document_id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <div>
                  <p className="font-semibold">{DOCUMENT_TYPES.find((t) => t.value === d.document_type)?.label || d.document_type}</p>
                  <p className="text-xs text-slate-500">
                    {safeDate(d.uploaded_at)}
                    {d.notes ? ` · ${d.notes}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleViewDocument(d.storage_path)}
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  View
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
