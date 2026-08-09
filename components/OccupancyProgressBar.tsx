export default function OccupancyProgressBar({
  percent,
}: {
  percent: number;
}) {
  const clamped = Math.min(Math.max(percent, 0), 100);

  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-indigo-600 transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
