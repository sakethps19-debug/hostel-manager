export type BedStatus =
  | "available"
  | "occupied"
  | "vacating_soon"
  | "reserved"
  | "maintenance";

export type BedStatusInfo = {
  status: BedStatus;
  label: string;
  badgeClasses: string;
  iconColorClass: string;
  iconBgClass: string;
};

const STATUS_MAP: Record<BedStatus, BedStatusInfo> = {
  available: {
    status: "available",
    label: "Available",
    badgeClasses: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    iconColorClass: "text-emerald-600",
    iconBgClass: "bg-emerald-50",
  },
  occupied: {
    status: "occupied",
    label: "Occupied",
    badgeClasses: "bg-red-50 text-red-700 border border-red-200",
    iconColorClass: "text-red-600",
    iconBgClass: "bg-red-50",
  },
  vacating_soon: {
    status: "vacating_soon",
    label: "Vacating Soon",
    badgeClasses: "bg-amber-50 text-amber-700 border border-amber-200",
    iconColorClass: "text-amber-600",
    iconBgClass: "bg-amber-50",
  },
  reserved: {
    status: "reserved",
    label: "Reserved",
    badgeClasses: "bg-blue-50 text-blue-700 border border-blue-200",
    iconColorClass: "text-blue-600",
    iconBgClass: "bg-blue-50",
  },
  maintenance: {
    status: "maintenance",
    label: "Maintenance",
    badgeClasses: "bg-slate-100 text-slate-600 border border-slate-300",
    iconColorClass: "text-slate-400",
    iconBgClass: "bg-slate-100",
  },
};

export function getBedStatusInfo(status: BedStatus): BedStatusInfo {
  return STATUS_MAP[status];
}

export function deriveBedStatus(bed: {
  occupant_name?: string | null;
  notice_given_at?: string | null;
  is_future_booking?: boolean | null;
  bed_status?: string | null;
}): BedStatus {
  if (bed.bed_status && bed.bed_status !== "active") {
    return "maintenance";
  }

  if (bed.occupant_name) {
    return bed.notice_given_at ? "vacating_soon" : "occupied";
  }

  if (bed.is_future_booking) {
    return "reserved";
  }

  return "available";
}
