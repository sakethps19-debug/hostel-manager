"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import type { ChecklistItemDef, ChecklistType } from "@/lib/checklists";

type ChecklistItemState = ChecklistItemDef & {
  is_checked: boolean;
  checked_at: string | null;
  checked_by_name: string | null;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BookingChecklist({
  bookingId,
  checklistType,
  title,
  items,
  readOnly = false,
}: {
  bookingId: number;
  checklistType: ChecklistType;
  title: string;
  items: ChecklistItemState[];
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState(items);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const doneCount = rows.filter((r) => r.is_checked).length;
  const percent =
    rows.length === 0 ? 0 : Math.round((doneCount / rows.length) * 100);

  async function toggle(item: ChecklistItemState) {
    if (readOnly) return;

    setErrorMessage("");
    setSavingKey(item.key);
    const nextChecked = !item.is_checked;

    try {
      await callRpcClient("set_booking_checklist_item", {
        p_booking_id: bookingId,
        p_checklist_type: checklistType,
        p_item_key: item.key,
        p_item_label: item.label,
        p_is_checked: nextChecked,
      });

      setRows((prev) =>
        prev.map((r) =>
          r.key === item.key
            ? {
                ...r,
                is_checked: nextChecked,
                checked_at: nextChecked ? new Date().toISOString() : null,
                checked_by_name: nextChecked ? r.checked_by_name : null,
              }
            : r
        )
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update checklist."
      );
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        <span className="text-sm font-semibold text-slate-500">
          {doneCount} / {rows.length} complete
        </span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${
            percent === 100 ? "bg-emerald-500" : "bg-amber-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {errorMessage && (
        <p className="mt-3 text-sm font-medium text-red-600">{errorMessage}</p>
      )}

      <ul className="mt-5 divide-y divide-slate-100">
        {rows.map((item) => (
          <li key={item.key} className="flex items-start gap-3 py-3">
            <input
              type="checkbox"
              checked={item.is_checked}
              disabled={readOnly || savingKey === item.key}
              onChange={() => toggle(item)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />

            <div>
              <p
                className={`text-sm font-medium ${
                  item.is_checked ? "text-slate-900" : "text-slate-700"
                }`}
              >
                {item.label}
              </p>

              {item.is_checked && item.checked_at && (
                <p className="mt-0.5 text-xs text-slate-400">
                  Done {formatDateTime(item.checked_at)}
                  {item.checked_by_name ? ` by ${item.checked_by_name}` : ""}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
