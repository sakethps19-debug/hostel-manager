import { BedStatus, getBedStatusInfo } from "@/lib/bedStatus";

export default function BedStatusIcon({
  status,
  size = "md",
}: {
  status: BedStatus;
  size?: "sm" | "md" | "lg";
}) {
  const info = getBedStatusInfo(status);

  const dimensions = {
    sm: { box: "h-8 w-8", icon: "h-4 w-4" },
    md: { box: "h-11 w-11", icon: "h-6 w-6" },
    lg: { box: "h-14 w-14", icon: "h-7 w-7" },
  }[size];

  return (
    <div
      className={`flex items-center justify-center rounded-xl ${info.iconBgClass} ${dimensions.box}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={`${dimensions.icon} ${info.iconColorClass}`}
        aria-hidden="true"
      >
        <path
          d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3 18v2M21 18v2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M5 10V8a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 10V9a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
