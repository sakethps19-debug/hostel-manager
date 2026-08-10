import { callRpcServer } from "@/lib/supabase/callRpcServer";
import { requirePermission } from "@/lib/auth";
import StatCard from "@/components/StatCard";

type EnquiryRow = {
  enquiry_id: number;
  source: string | null;
  status: string;
};

export default async function EnquiryConversionPage() {
  await requirePermission("manageOperationalRecords");

  const enquiries = await callRpcServer<EnquiryRow[]>("get_enquiries");

  const bySource = new Map<
    string,
    { total: number; converted: number; lost: number; open: number }
  >();

  for (const e of enquiries) {
    const source = e.source || "Unspecified";
    const bucket = bySource.get(source) || {
      total: 0,
      converted: 0,
      lost: 0,
      open: 0,
    };

    bucket.total += 1;
    if (e.status === "Converted") bucket.converted += 1;
    else if (e.status === "Lost") bucket.lost += 1;
    else bucket.open += 1;

    bySource.set(source, bucket);
  }

  const rows = Array.from(bySource.entries())
    .map(([source, b]) => ({
      source,
      ...b,
      conversionPercent: b.total > 0 ? Math.round((b.converted / b.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const totalEnquiries = enquiries.length;
  const totalConverted = enquiries.filter((e) => e.status === "Converted").length;
  const overallConversion =
    totalEnquiries > 0 ? Math.round((totalConverted / totalEnquiries) * 1000) / 10 : 0;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
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
          <h1 className="mt-2 text-4xl font-bold">Enquiry Source &amp; Conversion</h1>
          <p className="mt-2 text-slate-500">
            Which enquiry sources are actually converting to bookings.
          </p>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard label="Total Enquiries" value={totalEnquiries} />
          <StatCard label="Converted" value={totalConverted} green />
          <StatCard label="Overall Conversion %" value={overallConversion} />
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4">Source</th>
                  <th className="px-6 py-4 text-right">Enquiries</th>
                  <th className="px-6 py-4 text-right">Converted</th>
                  <th className="px-6 py-4 text-right">Lost</th>
                  <th className="px-6 py-4 text-right">Open</th>
                  <th className="px-6 py-4 text-right">Conversion %</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.source} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-semibold">{r.source}</td>
                    <td className="px-6 py-4 text-right">{r.total}</td>
                    <td className="px-6 py-4 text-right text-emerald-700">{r.converted}</td>
                    <td className="px-6 py-4 text-right text-red-700">{r.lost}</td>
                    <td className="px-6 py-4 text-right text-amber-700">{r.open}</td>
                    <td className="px-6 py-4 text-right font-semibold">
                      {r.conversionPercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-4 text-xs text-slate-400">
          Average Agreed Rent, Average Discount, and Commission/Acquisition
          Cost per source aren&apos;t shown yet — converted enquiries aren&apos;t
          linked to their resulting booking record today, so those figures
          would have to be guessed via name/mobile matching rather than a
          reliable join. Flagged here rather than estimated.
        </p>
      </div>
    </main>
  );
}
