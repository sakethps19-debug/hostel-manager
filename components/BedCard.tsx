import { BedStatus, getBedStatusInfo } from "@/lib/bedStatus";
import BedStatusIcon from "./BedStatusIcon";

export default function BedCard({
  bedLabel,
  status,
  occupantName,
  href,
}: {
  bedLabel: string;
  status: BedStatus;
  occupantName?: string | null;
  href: string;
}) {
  const info = getBedStatusInfo(status);

  return (
    <a
      href={href}
      className={`flex flex-col items-center gap-2 rounded-2xl p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${info.badgeClasses}`}
    >
      <BedStatusIcon status={status} size="lg" />

      <p className="text-sm font-bold text-slate-900">{bedLabel}</p>

      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${info.badgeClasses}`}
      >
        {info.label}
      </span>

      {status === "occupied" || status === "vacating_soon" ? (
        occupantName && (
          <p className="max-w-full truncate text-xs text-slate-500">
            {occupantName}
          </p>
        )
      ) : null}
    </a>
  );
}
