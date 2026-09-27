"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import type { AccountRow, AccountType } from "@/lib/accounting/types";

type SettingRow = { setting_key: string; setting_value: string };

const ACCOUNT_TYPES: AccountType[] = ["asset", "liability", "equity", "income", "expense"];

export default function AccountingConfigView({
  initialAccounts,
  initialSettings,
}: {
  initialAccounts: AccountRow[];
  initialSettings: SettingRow[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [settings, setSettings] = useState(new Map(initialSettings.map((s) => [s.setting_key, s.setting_value])));
  const [capThreshold, setCapThreshold] = useState(settings.get("capitalization_threshold") || "5000");
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: "", name: "", accountType: "expense" as AccountType, normalBalance: "debit" as "debit" | "credit", description: "",
  });

  async function handleAddAccount() {
    setErrorMessage("");
    if (!form.code.trim() || !form.name.trim()) {
      setErrorMessage("Code and name are required.");
      return;
    }
    setSaving(true);
    try {
      const accountId = await callRpcClient<number>("create_accounting_account", {
        p_code: form.code.trim(),
        p_name: form.name.trim(),
        p_account_type: form.accountType,
        p_normal_balance: form.normalBalance,
        p_description: form.description || null,
      });
      await logAuditEvent("accounting_account_created", "accounting_account", accountId, { code: form.code });

      setAccounts((prev) =>
        [
          ...prev,
          {
            account_id: accountId,
            code: form.code.trim(),
            name: form.name.trim(),
            account_type: form.accountType,
            account_subtype: null,
            normal_balance: form.normalBalance,
            parent_account_id: null,
            is_contra: false,
            is_system: false,
            is_active: true,
            description: form.description || null,
          },
        ].sort((a, b) => a.code.localeCompare(b.code))
      );
      setForm({ code: "", name: "", accountType: "expense", normalBalance: "debit", description: "" });
      setShowForm(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create account.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(accountId: number, isActive: boolean) {
    setErrorMessage("");
    try {
      await callRpcClient("set_accounting_account_active", { p_account_id: accountId, p_is_active: !isActive });
      setAccounts((prev) => prev.map((a) => (a.account_id === accountId ? { ...a, is_active: !isActive } : a)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update account.");
    }
  }

  async function handleSaveThreshold() {
    setErrorMessage("");
    setSaving(true);
    try {
      await callRpcClient("set_accounting_setting", { p_key: "capitalization_threshold", p_value: capThreshold });
      await logAuditEvent("accounting_setting_changed", "accounting", null, { key: "capitalization_threshold", value: capThreshold });
      setSettings((prev) => new Map(prev).set("capitalization_threshold", capThreshold));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Settings</h2>
        <label className="mt-3 block max-w-xs text-sm">
          Capitalization Threshold (Rs.)
          <p className="mt-1 text-xs text-slate-500">
            Fixed-asset purchases at or above this amount are capitalized and depreciated; below it,
            expensed immediately.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min="0"
              value={capThreshold}
              onChange={(e) => setCapThreshold(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none"
            />
            <button
              onClick={handleSaveThreshold}
              disabled={saving}
              className="whitespace-nowrap rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </label>
      </section>

      {errorMessage && <p className="mt-4 text-sm font-medium text-red-600">{errorMessage}</p>}

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Accounts</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {showForm ? "Cancel" : "+ New Account"}
          </button>
        </div>

        {showForm && (
          <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="Code (e.g. 5300)"
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              />
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Account name"
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              />
              <select
                value={form.accountType}
                onChange={(e) => {
                  const accountType = e.target.value as AccountType;
                  setForm({
                    ...form,
                    accountType,
                    normalBalance: accountType === "asset" || accountType === "expense" ? "debit" : "credit",
                  });
                }}
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description (optional)"
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none sm:col-span-2"
              />
            </div>
            <button
              onClick={handleAddAccount}
              disabled={saving}
              className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add Account"}
            </button>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Normal Balance</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((a) => (
                <tr key={a.account_id} className={a.is_active ? "" : "opacity-50"}>
                  <td className="px-4 py-2 text-slate-400">{a.code}</td>
                  <td className="px-4 py-2 font-semibold">
                    {a.name} {a.is_system && <span className="ml-1 text-xs text-slate-400">(System)</span>}
                  </td>
                  <td className="px-4 py-2 capitalize text-slate-500">{a.account_type}</td>
                  <td className="px-4 py-2 text-slate-500">{a.normal_balance}</td>
                  <td className="px-4 py-2">{a.is_active ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-2">
                    {!a.is_system && (
                      <button
                        onClick={() => handleToggleActive(a.account_id, a.is_active)}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        {a.is_active ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
