"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import { formatMoney } from "@/lib/format";

type UsageSummary = {
  whatsapp_sent: number;
  sms_sent: number;
  utility_count: number;
  marketing_count: number;
  failed_count: number;
  estimated_cost: number;
  residents_messaged: number;
  avg_messages_per_resident: number;
};

type SettingRow = { setting_key: string; setting_value: string };

const SETTING_LABELS: Record<string, string> = {
  whatsapp_utility_rate: "WhatsApp Utility Rate (Rs. per message)",
  whatsapp_marketing_rate: "WhatsApp Marketing/Other Rate (Rs. per message)",
  sms_rate: "SMS Rate (Rs. per message)",
  monthly_communication_budget: "Monthly Communication Budget (Rs.)",
  monthly_message_limit_per_resident: "Monthly Message Limit per Resident",
};

const SETTING_ORDER = [
  "whatsapp_utility_rate",
  "whatsapp_marketing_rate",
  "sms_rate",
  "monthly_communication_budget",
  "monthly_message_limit_per_resident",
];

export default function UsageCostView({
  month,
  year,
  months,
  summary,
  exceedingResidentCount,
  settings,
}: {
  month: number;
  year: number;
  months: string[];
  summary: UsageSummary;
  exceedingResidentCount: number;
  settings: SettingRow[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((s) => [s.setting_key, s.setting_value]))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const budget = Number(form.monthly_communication_budget || 0);
  const budgetUsedPct = budget > 0 ? (summary.estimated_cost / budget) * 100 : 0;

  const budgetTone =
    budgetUsedPct >= 100 ? "red" : budgetUsedPct >= 90 ? "amber" : budgetUsedPct >= 75 ? "amber" : null;

  function changeMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    router.push(`/communications/usage-cost?month=${m}&year=${y}`);
  }

  async function handleSaveSetting(key: string) {
    setErrorMessage("");
    setSaving(key);
    try {
      await callRpcClient("set_communication_setting", {
        p_key: key,
        p_value: form[key],
      });
      await logAuditEvent("communication_setting_updated", "communication_settings", null, {
        key,
        value: form[key],
      });
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save setting.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => changeMonth(-1)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          ← Prev
        </button>
        <p className="text-sm font-semibold text-slate-700">
          {months[month - 1]} {year}
        </p>
        <button
          onClick={() => changeMonth(1)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Next →
        </button>
      </div>

      {budgetTone && (
        <div
          className={`mt-5 rounded-2xl border px-5 py-4 text-sm font-medium ${
            budgetTone === "red"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          Estimated communication spend is at {budgetUsedPct.toFixed(0)}% of the
          Rs. {budget.toLocaleString("en-IN")} monthly budget
          ({formatMoney(summary.estimated_cost)}). This is a warning only — sending
          is never blocked by budget, and an Owner can always send what&apos;s needed.
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Tile label="WhatsApp Sent" value={summary.whatsapp_sent} />
        <Tile label="SMS Sent" value={summary.sms_sent} />
        <Tile label="Utility Messages" value={summary.utility_count} />
        <Tile label="Marketing/Other" value={summary.marketing_count} />
        <Tile label="Failed" value={summary.failed_count} tone="red" />
        <Tile
          label="Avg / Resident"
          value={summary.avg_messages_per_resident}
        />
        <Tile
          label="Residents Exceeding Threshold"
          value={exceedingResidentCount}
          tone={exceedingResidentCount > 0 ? "amber" : undefined}
        />
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-400">Estimated Cost</p>
          <p className="mt-1 text-2xl font-bold">{formatMoney(summary.estimated_cost)}</p>
          <p className="mt-1 text-xs text-slate-400">
            Actual cost is not yet available — no provider billing is connected.
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="font-semibold text-slate-900">Pricing &amp; Budget Configuration</p>
        <p className="mt-1 text-sm text-slate-500">
          Provider rates change over time — update these to match your current
          Meta/SMS rate card rather than relying on a hardcoded price.
        </p>

        {errorMessage && (
          <p className="mt-3 text-sm font-medium text-red-600">{errorMessage}</p>
        )}

        <div className="mt-4 space-y-3">
          {SETTING_ORDER.map((key) => (
            <div key={key} className="flex flex-wrap items-center gap-3">
              <label className="w-full text-sm font-medium text-slate-700 sm:w-80">
                {SETTING_LABELS[key] || key}
              </label>
              <input
                value={form[key] ?? ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => handleSaveSetting(key)}
                disabled={saving === key}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {saving === key ? "Saving..." : "Save"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "red" | "amber" }) {
  const toneClass =
    tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-slate-900";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
