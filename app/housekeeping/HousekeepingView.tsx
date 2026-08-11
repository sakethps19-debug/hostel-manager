"use client";

import { useMemo, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";
import { logAuditEvent } from "@/lib/audit";

type HousekeepingTaskRow = {
  task_id: number;
  hostel_name: string | null;
  room_number: string | null;
  bed_code: string | null;
  bed_id: number | null;
  task_type: string;
  description: string;
  status: string;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
};

const TASK_TYPES = ["Cleaning", "Maintenance Support", "Restocking", "Other"];
const STATUSES = ["Pending", "In Progress", "Done", "Cancelled"];

function formatDate(date: string | null) {
  if (!date) return "-";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStatusClasses(status: string) {
  if (status === "Done") return "bg-emerald-50 text-emerald-700";
  if (status === "In Progress") return "bg-amber-50 text-amber-700";
  if (status === "Cancelled") return "bg-slate-100 text-slate-500";
  return "bg-red-50 text-red-700";
}

export default function HousekeepingView({
  tasks,
  hostelNames,
}: {
  tasks: HousekeepingTaskRow[];
  hostelNames: string[];
}) {
  const [rows, setRows] = useState(tasks);
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [hostelName, setHostelName] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [bedCode, setBedCode] = useState("");
  const [taskType, setTaskType] = useState("Cleaning");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const filtered = useMemo(
    () => rows.filter((t) => !statusFilter || t.status === statusFilter),
    [rows, statusFilter]
  );

  async function handleAdd() {
    setErrorMessage("");

    if (!description.trim()) {
      setErrorMessage("Please enter a description.");
      return;
    }

    setSaving(true);

    const trimmedRoomNumber = roomNumber.trim() || null;
    const trimmedBedCode = bedCode.trim() || null;
    const trimmedAssignedTo = assignedTo.trim() || null;

    try {
      const id = await callRpcClient<number>("add_housekeeping_task", {
        p_hostel_name: hostelName || null,
        p_room_number: trimmedRoomNumber,
        p_bed_code: trimmedBedCode,
        p_bed_id: null,
        p_task_type: taskType,
        p_description: description.trim(),
        p_assigned_to: trimmedAssignedTo,
        p_due_date: dueDate || null,
      });

      await logAuditEvent("housekeeping_task_added", "housekeeping_task", id, {
        task_type: taskType,
        hostel_name: hostelName || null,
      });

      setRows((prev) => [
        {
          task_id: id,
          hostel_name: hostelName || null,
          room_number: trimmedRoomNumber,
          bed_code: trimmedBedCode,
          bed_id: null,
          task_type: taskType,
          description: description.trim(),
          status: "Pending",
          assigned_to: trimmedAssignedTo,
          due_date: dueDate || null,
          completed_at: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);

      setRoomNumber("");
      setBedCode("");
      setDescription("");
      setAssignedTo("");
      setDueDate("");
      setShowForm(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to add task."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(taskId: number, status: string) {
    if (updatingTaskId === taskId) return;

    setErrorMessage("");
    setUpdatingTaskId(taskId);

    try {
      await callRpcClient("update_housekeeping_task_status", {
        p_task_id: taskId,
        p_status: status,
      });

      await logAuditEvent("housekeeping_task_status_changed", "housekeeping_task", taskId, {
        new_status: status,
      });

      setRows((prev) =>
        prev.map((t) =>
          t.task_id === taskId
            ? {
                ...t,
                status,
                completed_at: status === "Done" ? new Date().toISOString() : null,
              }
            : t
        )
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update task status."
      );
    } finally {
      setUpdatingTaskId(null);
    }
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white"
        >
          {showForm ? "Cancel" : "+ New Task"}
        </button>
      </div>

      {errorMessage && !showForm && (
        <p className="mt-3 text-sm font-medium text-red-600">{errorMessage}</p>
      )}

      {showForm && (
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={hostelName}
              onChange={(e) => setHostelName(e.target.value)}
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
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="Room number (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <input
              value={bedCode}
              onChange={(e) => setBedCode(e.target.value)}
              placeholder="Bed code (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            >
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <input
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="Assigned to (optional)"
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />

            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
            />
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Task description *"
            rows={2}
            className="mt-3 w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm outline-none"
          />

          {errorMessage && (
            <p className="mt-2 text-sm font-medium text-red-600">{errorMessage}</p>
          )}

          <button
            onClick={handleAdd}
            disabled={saving}
            className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add Task"}
          </button>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-500">
            No housekeeping tasks match.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Assigned To</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((task) => (
                  <tr key={task.task_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{task.description}</p>
                      <p className="text-xs text-slate-500">{task.task_type}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {[task.hostel_name, task.room_number && `Room ${task.room_number}`, task.bed_code]
                        .filter(Boolean)
                        .join(" · ") || "-"}
                    </td>
                    <td className="px-4 py-3">{task.assigned_to || "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(task.due_date)}</td>
                    <td className="px-4 py-3">
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.task_id, e.target.value)}
                        disabled={updatingTaskId === task.task_id}
                        className={`rounded-full border-0 px-3 py-1 text-xs font-semibold outline-none disabled:opacity-50 ${getStatusClasses(task.status)}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
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
