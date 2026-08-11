"use client";

import { useMemo, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  type TemplateCategory,
} from "@/lib/communications/templateCategories";

type TemplateRow = {
  template_id: number;
  category: string;
  name: string;
  channel: "whatsapp" | "sms" | "both";
  body: string;
  is_active: boolean;
};

type FormState = {
  category: TemplateCategory;
  name: string;
  channel: "whatsapp" | "sms" | "both";
  body: string;
};

const EMPTY_FORM: FormState = {
  category: "general_notice",
  name: "",
  channel: "both",
  body: "",
};

export default function MessageTemplatesTable({
  templates,
}: {
  templates: TemplateRow[];
}) {
  const [rows, setRows] = useState(templates);
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const filtered = useMemo(
    () => rows.filter((t) => showInactive || t.is_active),
    [rows, showInactive]
  );

  function startEdit(template: TemplateRow) {
    setEditingId(template.template_id);
    setForm({
      category: template.category as TemplateCategory,
      name: template.name,
      channel: template.channel,
      body: template.body,
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
      setErrorMessage("Please enter a template name.");
      return;
    }

    if (!form.body.trim()) {
      setErrorMessage("Please enter the message body.");
      return;
    }

    setSaving(true);

    try {
      if (editingId !== null) {
        await callRpcClient("update_message_template", {
          p_template_id: editingId,
          p_name: form.name.trim(),
          p_channel: form.channel,
          p_body: form.body.trim(),
        });

        await logAuditEvent("message_template_updated", "message_template", editingId, {
          name: form.name.trim(),
        });

        setRows((prev) =>
          prev.map((t) =>
            t.template_id === editingId
              ? { ...t, name: form.name.trim(), channel: form.channel, body: form.body.trim() }
              : t
          )
        );
      } else {
        const id = await callRpcClient<number>("create_message_template", {
          p_category: form.category,
          p_name: form.name.trim(),
          p_channel: form.channel,
          p_body: form.body.trim(),
        });

        await logAuditEvent("message_template_created", "message_template", id, {
          category: form.category,
          name: form.name.trim(),
        });

        setRows((prev) => [
          {
            template_id: id,
            category: form.category,
            name: form.name.trim(),
            channel: form.channel,
            body: form.body.trim(),
            is_active: true,
          },
          ...prev,
        ]);
      }

      cancelForm();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save template."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(template: TemplateRow) {
    const nextActive = !template.is_active;
    setErrorMessage("");

    try {
      await callRpcClient("set_message_template_active", {
        p_template_id: template.template_id,
        p_is_active: nextActive,
      });

      await logAuditEvent(
        nextActive ? "message_template_activated" : "message_template_deactivated",
        "message_template",
        template.template_id,
        {}
      );

      setRows((prev) =>
        prev.map((t) =>
          t.template_id === template.template_id ? { ...t, is_active: nextActive } : t
        )
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update template."
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
          Show inactive templates
        </label>

        <button
          onClick={() => (showForm ? cancelForm() : setShowForm(true))}
          className="ml-auto rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white"
        >
          {showForm ? "Cancel" : "+ New Template"}
        </button>
      </div>

      {errorMessage && !showForm && (
        <p className="mt-3 text-sm font-medium text-red-600">{errorMessage}</p>
      )}

      {showForm && (
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <p className="font-semibold text-slate-900">
            {editingId ? "Edit Template" : "New Template"}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {editingId === null ? (
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as TemplateCategory })
                }
                className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
              >
                {TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {TEMPLATE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-500">
                {TEMPLATE_CATEGORY_LABELS[form.category]}
              </div>
            )}

            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Template name *"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <select
              value={form.channel}
              onChange={(e) =>
                setForm({
                  ...form,
                  channel: e.target.value as "whatsapp" | "sms" | "both",
                })
              }
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            >
              <option value="both">WhatsApp + SMS</option>
              <option value="whatsapp">WhatsApp only</option>
              <option value="sms">SMS only</option>
            </select>
          </div>

          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="Message body *"
            rows={4}
            className="mt-3 w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
          />

          {errorMessage && (
            <p className="mt-2 text-sm font-medium text-red-600">{errorMessage}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Save Changes" : "Create Template"}
          </button>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No templates match.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((template) => (
                  <tr
                    key={template.template_id}
                    className={`hover:bg-slate-50 ${template.is_active ? "" : "opacity-50"}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold">{template.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{template.body}</p>
                      {!template.is_active && (
                        <p className="text-xs text-slate-400">Inactive</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {TEMPLATE_CATEGORY_LABELS[template.category as TemplateCategory] ||
                        template.category}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {template.channel === "both" ? "WhatsApp + SMS" : template.channel}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(template)}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(template)}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {template.is_active ? "Deactivate" : "Reactivate"}
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
