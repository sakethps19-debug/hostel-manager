import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import { formatDate, formatMoney, todayIsoDateIST } from "@/lib/format";

type OperationalAlerts = {
  overdue_rent_count: number;
  vacating_7_days_count: number;
  vacating_30_days_count: number;
  deposit_pending_count: number;
  missing_id_proof_count: number;
  maintenance_count: number;
};

type ExpiringDocRow = {
  resident_id: number;
  full_name: string;
  document_type: string;
  expiry_date: string;
};

type EscalationRow = {
  escalation_id: number;
  complaint_id: number;
  escalated_to: string;
  reason: string;
  escalated_at: string;
  resolved_at: string | null;
};

type HousekeepingTaskRow = {
  task_id: number;
  description: string;
  status: string;
  due_date: string | null;
};

type AssetRow = {
  asset_id: number;
  name: string;
  condition: string;
};

type BedHoldRow = {
  hold_id: number;
  bed_code: string;
  hostel_name: string;
  prospect_name: string;
  hold_expiry_at: string;
};

type NotificationItem = {
  id: string;
  tone: "red" | "amber" | "blue";
  message: string;
  href: string;
};

async function fetchAll() {
  // Bed holds whose hold_expiry_at has passed still show up as "active"
  // until this runs - matches the pattern used by every other page that
  // reads bed holds (app/holds, hostel/floor/room pages).
  await callRpcServer("release_expired_holds").catch(() => {});

  const [
    alerts,
    pendingPoliceVerification,
    expiringDocs,
    escalations,
    housekeepingTasks,
    assets,
    bedHolds,
    pettyCashBalance,
  ] = await Promise.all([
    callRpcServer<OperationalAlerts[]>("get_operational_alerts").then(
      (r) => r[0] ?? null
    ),
    callRpcServer<number>("get_pending_police_verification_count"),
    callRpcServer<ExpiringDocRow[]>("get_expiring_documents"),
    callRpcServer<EscalationRow[]>("get_complaint_escalations"),
    callRpcServer<HousekeepingTaskRow[]>("get_housekeeping_tasks"),
    callRpcServer<AssetRow[]>("get_assets"),
    callRpcServer<BedHoldRow[]>("get_active_bed_holds"),
    callRpcServer<number>("get_petty_cash_balance"),
  ]);

  return {
    alerts,
    pendingPoliceVerification,
    expiringDocs,
    escalations,
    housekeepingTasks,
    assets,
    bedHolds,
    pettyCashBalance,
  };
}

function toneClasses(tone: NotificationItem["tone"]) {
  if (tone === "red") return "border-red-200 bg-red-50 text-red-800";
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

export default async function NotificationsPage() {
  await requirePermission("manageUsers");

  const {
    alerts,
    pendingPoliceVerification,
    expiringDocs,
    escalations,
    housekeepingTasks,
    assets,
    bedHolds,
    pettyCashBalance,
  } = await fetchAll();

  const today = todayIsoDateIST();
  const items: NotificationItem[] = [];

  if (alerts) {
    if (alerts.overdue_rent_count > 0) {
      items.push({
        id: "overdue-rent",
        tone: "red",
        message: `${alerts.overdue_rent_count} resident${alerts.overdue_rent_count === 1 ? "" : "s"} overdue on rent`,
        href: "/rent/overdue",
      });
    }
    if (alerts.maintenance_count > 0) {
      items.push({
        id: "maintenance",
        tone: "amber",
        message: `${alerts.maintenance_count} bed${alerts.maintenance_count === 1 ? "" : "s"} under maintenance`,
        href: "/maintenance",
      });
    }
    if (alerts.deposit_pending_count > 0) {
      items.push({
        id: "deposit-pending",
        tone: "amber",
        message: `${alerts.deposit_pending_count} resident${alerts.deposit_pending_count === 1 ? "" : "s"} with deposit pending`,
        href: "/residents",
      });
    }
    if (alerts.missing_id_proof_count > 0) {
      items.push({
        id: "missing-id",
        tone: "amber",
        message: `${alerts.missing_id_proof_count} resident${alerts.missing_id_proof_count === 1 ? "" : "s"} missing ID proof`,
        href: "/residents",
      });
    }
    if (alerts.vacating_7_days_count > 0) {
      items.push({
        id: "vacating-7",
        tone: "blue",
        message: `${alerts.vacating_7_days_count} resident${alerts.vacating_7_days_count === 1 ? "" : "s"} vacating in 7 days`,
        href: "/vacancies",
      });
    }
  }

  if (pendingPoliceVerification > 0) {
    items.push({
      id: "police-verification",
      tone: "amber",
      message: `${pendingPoliceVerification} police verification${pendingPoliceVerification === 1 ? "" : "s"} pending`,
      href: "/residents",
    });
  }

  for (const doc of expiringDocs) {
    const isExpired = doc.expiry_date < today;
    items.push({
      id: `doc-${doc.resident_id}-${doc.document_type}`,
      tone: isExpired ? "red" : "amber",
      message: `${doc.full_name}: ${doc.document_type} ${isExpired ? "expired" : "expiring"} on ${formatDate(doc.expiry_date)}`,
      href: "/documents/expiring",
    });
  }

  for (const esc of escalations) {
    if (esc.resolved_at) continue;
    items.push({
      id: `escalation-${esc.escalation_id}`,
      tone: "red",
      message: `Complaint #${esc.complaint_id} escalated to ${esc.escalated_to}: ${esc.reason}`,
      href: "/complaints",
    });
  }

  for (const task of housekeepingTasks) {
    if (task.status === "Done" || task.status === "Cancelled") continue;
    if (task.due_date && task.due_date < today) {
      items.push({
        id: `housekeeping-${task.task_id}`,
        tone: "amber",
        message: `Housekeeping task overdue: ${task.description}`,
        href: "/housekeeping",
      });
    }
  }

  for (const asset of assets) {
    if (asset.condition === "Needs Repair") {
      items.push({
        id: `asset-${asset.asset_id}`,
        tone: "amber",
        message: `Asset needs repair: ${asset.name}`,
        href: "/settings/assets",
      });
    }
  }

  for (const hold of bedHolds) {
    const expiresInHours =
      (new Date(hold.hold_expiry_at).getTime() - Date.now()) / (1000 * 60 * 60);
    if (expiresInHours < 0) {
      items.push({
        id: `hold-${hold.hold_id}`,
        tone: "red",
        message: `Bed hold for ${hold.prospect_name} (${hold.bed_code}) has expired and needs releasing`,
        href: "/holds",
      });
    } else if (expiresInHours < 2) {
      items.push({
        id: `hold-${hold.hold_id}`,
        tone: "blue",
        message: `Bed hold for ${hold.prospect_name} (${hold.bed_code}) expires soon`,
        href: "/holds",
      });
    }
  }

  if (pettyCashBalance < 1000) {
    items.push({
      id: "petty-cash-low",
      tone: "red",
      message: `Petty cash balance is low: ${formatMoney(pettyCashBalance)}`,
      href: "/expenses/petty-cash",
    });
  }

  const grouped = {
    red: items.filter((i) => i.tone === "red"),
    amber: items.filter((i) => i.tone === "amber"),
    blue: items.filter((i) => i.tone === "blue"),
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <a
          href="/"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Dashboard
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Owner Insights
          </p>
          <h1 className="mt-2 text-4xl font-bold">Notifications Centre</h1>
          <p className="mt-2 text-slate-500">
            Everything needing attention across the app, pulled live from
            existing reports — nothing is stored separately here.
          </p>
        </div>

        {items.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
            All clear — nothing needs attention right now.
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {[...grouped.red, ...grouped.amber, ...grouped.blue].map((item) => (
              <a
                key={item.id}
                href={item.href}
                className={`block rounded-xl border px-5 py-3 text-sm font-medium shadow-sm transition hover:opacity-80 ${toneClasses(item.tone)}`}
              >
                {item.message}
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
