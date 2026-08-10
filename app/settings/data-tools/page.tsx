import { requirePermission } from "@/lib/auth";

const EXPORTS = [
  {
    label: "Residents",
    href: "/residents",
    note: "Search list has an Export CSV button (includes Bed ID, not internal bed number).",
  },
  {
    label: "Payments",
    href: "/reports/payments",
    note: "Full payments report across all hostels, filterable by date and hostel.",
  },
  {
    label: "Expenses",
    href: "/expenses",
    note: "Filterable by hostel and category before export.",
  },
  {
    label: "Rates",
    href: "/settings/rates",
    note: "Both the Hostel A/C sharing-type rate card and the Hostel B per-room rate card.",
  },
  {
    label: "Booking History",
    href: "/history",
    note: "Full booking history including no-shows and cancellations.",
  },
];

export default async function DataToolsPage() {
  await requirePermission("manageUsers");

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
            Administration
          </p>
          <h1 className="mt-2 text-4xl font-bold">Import / Export</h1>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Export</h2>
          <p className="mt-1 text-sm text-slate-500">
            CSV export is available on each list below. Every export uses
            human-readable values (Bed ID, hostel/room names) instead of
            internal database IDs.
          </p>

          <ul className="mt-4 space-y-3">
            {EXPORTS.map((item) => (
              <li key={item.href} className="rounded-xl border border-slate-100 p-4">
                <a
                  href={item.href}
                  className="font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  {item.label} →
                </a>
                <p className="mt-1 text-sm text-slate-500">{item.note}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-bold text-amber-900">
            Bulk Import — intentionally not built yet
          </h2>
          <p className="mt-2 text-sm text-amber-800">
            Safe bulk import (Residents, Payments, Expenses, Rates from a
            CSV/Excel template) needs a preview step, validation, duplicate
            detection against live data, and a per-row error report with no
            partial/silent corruption — matching the standard this app
            already holds itself to for duplicate detection elsewhere.
          </p>
          <p className="mt-2 text-sm text-amber-800">
            Building that correctly requires new write-path RPCs, and this
            pass deliberately avoided guessing at those to protect
            production data (bookings, payments, and residents are exactly
            the tables this project has been careful never to touch without
            certainty). Recommendation: scope bulk import as its own
            follow-up with a specific starting table (Expenses is the
            lowest-risk starting point, since it has no downstream booking
            or bed-state effects) once the confirmed row-insert
            requirements are agreed.
          </p>
        </section>
      </div>
    </main>
  );
}
