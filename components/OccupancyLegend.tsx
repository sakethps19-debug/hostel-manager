import { BedStatus, getBedStatusInfo } from "@/lib/bedStatus";
import BedStatusIcon from "./BedStatusIcon";

const LEGEND_STATUSES: BedStatus[] = [
  "available",
  "occupied",
  "vacating_soon",
  "reserved",
  "maintenance",
];

export default function OccupancyLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-500">
      {LEGEND_STATUSES.map((status) => {
        const info = getBedStatusInfo(status);
        return (
          <div key={status} className="flex items-center gap-1.5">
            <BedStatusIcon status={status} size="sm" />
            <span>{info.label}</span>
          </div>
        );
      })}
    </div>
  );
}
