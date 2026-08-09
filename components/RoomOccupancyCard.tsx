import { BedStatus } from "@/lib/bedStatus";
import BedStatusIcon from "./BedStatusIcon";

type MiniBed = {
  bedId: number;
  status: BedStatus;
};

export default function RoomOccupancyCard({
  roomNumber,
  sharingType,
  monthlyRent,
  beds,
  href,
}: {
  roomNumber: string;
  sharingType: number;
  monthlyRent: number;
  beds: MiniBed[];
  href: string;
}) {
  const occupied = beds.filter(
    (b) => b.status === "occupied" || b.status === "vacating_soon"
  ).length;
  const available = beds.filter((b) => b.status === "available").length;

  return (
    <a
      href={href}
      className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold">Room {roomNumber}</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {sharingType} Sharing
          </p>
        </div>

        <p className="text-sm font-semibold text-slate-700">
          {monthlyRent > 0
            ? `Rs. ${Number(monthlyRent).toLocaleString("en-IN")}`
            : "Rate not set"}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {beds.map((bed) => (
          <BedStatusIcon key={bed.bedId} status={bed.status} size="sm" />
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {occupied} Occupied · {available} Available
      </p>
    </a>
  );
}
