"use client";

import { useMemo, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";
import { downloadCsv } from "@/lib/csv";

type HostelBRoomRow = {
  room_id: number;
  floor_number: number;
  floor_name: string | null;
  room_number: string;
  sharing_type: number;
  standard_rate: number | null;
};

export default function HostelBRatesTable({
  rooms,
}: {
  rooms: HostelBRoomRow[];
}) {
  const [rows, setRows] = useState(rooms);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newRate, setNewRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const floors = useMemo(() => {
    const map = new Map<number, HostelBRoomRow[]>();
    for (const room of rows) {
      const list = map.get(room.floor_number) || [];
      list.push(room);
      map.set(room.floor_number, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [rows]);

  function startEdit(room: HostelBRoomRow) {
    setErrorMessage("");
    setEditingId(room.room_id);
    setNewRate(room.standard_rate ? String(room.standard_rate) : "");
  }

  async function handleSave(room: HostelBRoomRow) {
    setErrorMessage("");
    const rate = Number(newRate);

    if (!Number.isFinite(rate) || rate <= 0) {
      setErrorMessage("Please enter a valid rate.");
      return;
    }

    setSaving(true);

    try {
      await callRpcClient("update_room_standard_rate", {
        p_room_id: room.room_id,
        p_new_rate: rate,
      });

      await logAuditEvent("standard_rate_updated", "room", room.room_id, {
        room_number: room.room_number,
        new_rate: rate,
      });

      setRows((prev) =>
        prev.map((r) =>
          r.room_id === room.room_id ? { ...r, standard_rate: rate } : r
        )
      );
      setEditingId(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update rate."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    downloadCsv(
      `hostel-b-rates-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => ({
        floor: r.floor_name || `Floor ${r.floor_number}`,
        room_number: r.room_number,
        sharing_type: r.sharing_type,
        standard_rate: r.standard_rate ?? "",
      }))
    );
  }

  return (
    <div className="mt-4">
      {errorMessage && (
        <p className="mb-3 text-sm font-medium text-red-600">
          {errorMessage}
        </p>
      )}

      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          disabled={rows.length === 0}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      <div className="space-y-6">
        {floors.map(([floorNumber, floorRooms]) => (
          <div
            key={floorNumber}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {floorRooms[0].floor_name || `Floor ${floorNumber}`}
            </div>
            <table className="min-w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {floorRooms.map((room) => (
                  <tr key={room.room_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold">
                      Room {room.room_number}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {room.sharing_type} Sharing
                    </td>
                    <td className="px-4 py-3">
                      {editingId === room.room_id ? (
                        <input
                          type="number"
                          min="0"
                          value={newRate}
                          onChange={(e) => setNewRate(e.target.value)}
                          className="w-28 rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-indigo-500"
                          autoFocus
                        />
                      ) : room.standard_rate ? (
                        `Rs. ${Number(room.standard_rate).toLocaleString("en-IN")}`
                      ) : (
                        <span className="text-slate-400">Rate not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingId === room.room_id ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleSave(room)}
                            disabled={saving}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            disabled={saving}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(room)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
