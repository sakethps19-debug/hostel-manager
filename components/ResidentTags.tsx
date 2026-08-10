"use client";

import { useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

type TagRow = {
  tag_id: number;
  tag_label: string;
};

export default function ResidentTags({
  residentId,
  initialTags,
  suggestions = [],
}: {
  residentId: number;
  initialTags: TagRow[];
  suggestions?: string[];
}) {
  const [tags, setTags] = useState(initialTags);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function addTag(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (tags.some((t) => t.tag_label.toLowerCase() === trimmed.toLowerCase())) {
      setNewTag("");
      return;
    }

    setErrorMessage("");
    setSaving(true);

    try {
      const tagId = await callRpcClient<number>("add_resident_tag", {
        p_resident_id: residentId,
        p_tag_label: trimmed,
      });

      setTags((prev) => [...prev, { tag_id: tagId, tag_label: trimmed }]);
      setNewTag("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to add tag."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeTag(tagId: number) {
    setErrorMessage("");

    try {
      await callRpcClient("remove_resident_tag", { p_tag_id: tagId });
      setTags((prev) => prev.filter((t) => t.tag_id !== tagId));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to remove tag."
      );
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag.tag_id}
            className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"
          >
            {tag.tag_label}
            <button
              onClick={() => removeTag(tag.tag_id)}
              className="text-indigo-400 hover:text-indigo-700"
              aria-label={`Remove ${tag.tag_label}`}
            >
              ×
            </button>
          </span>
        ))}

        {tags.length === 0 && (
          <p className="text-sm text-slate-400">No tags yet.</p>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(newTag);
            }
          }}
          list="resident-tag-suggestions"
          disabled={saving}
          placeholder="Add a tag and press Enter"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <datalist id="resident-tag-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        <button
          onClick={() => addTag(newTag)}
          disabled={saving || !newTag.trim()}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {errorMessage && (
        <p className="mt-2 text-xs font-medium text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
