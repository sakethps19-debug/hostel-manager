export default function AlertCard({
  count,
  label,
  href,
  tone = "amber",
}: {
  count: number;
  label: string;
  href: string;
  tone?: "amber" | "red" | "blue" | "slate" | "emerald" | "indigo";
}) {
  const toneClasses = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
  }[tone];

  return (
    <a
      href={href}
      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition hover:opacity-80 ${toneClasses}`}
    >
      <span>{label}</span>
      <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold shadow-sm">
        {count}
      </span>
    </a>
  );
}
