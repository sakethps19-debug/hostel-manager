import { notFound } from "next/navigation";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

type ResidentDetails = {
  resident_id: number;
  booking_id: number;
  full_name: string;
  hostel_name: string;
  bed_code: string | null;
  bed_number: string;
  room_number: string;
  notice_given_at: string | null;
  expected_vacate_date: string | null;
  notice_notes: string | null;
};

type TransferRecord = {
  transfer_id: number;
  old_booking_id: number;
  new_booking_id: number;
  transfer_date: string;
  reason: string;
  notes: string | null;
  old_hostel_name: string;
  old_room_number: string;
  old_bed_code: string | null;
  new_hostel_name: string;
  new_room_number: string;
  new_bed_code: string | null;
  rent_before: number;
  rent_after: number;
};

type BookingDetails = {
  booking_id: number;
  hostel_name: string;
  room_number: string;
  bed_code: string | null;
  bed_number: string;
  start_date: string;
  end_date: string;
  booking_status: string;
  created_at: string;
};

type PaymentHistoryRow = {
  payment_id: number;
  receipt_number: string;
  payment_date: string;
  payment_type: string;
  amount: number;
  status: string;
  reversed_reason: string | null;
};

type RentRevisionRow = {
  revision_id: number;
  previous_rent: number;
  new_rent: number;
  effective_date: string;
  reason: string | null;
};

type Settlement = {
  settlement_id: number;
  settlement_date: string;
  refund_amount: number;
  final_balance: number;
};

type TimelineEvent = {
  date: string;
  title: string;
  detail: string;
  tone: "neutral" | "positive" | "warning" | "negative";
};

type PageProps = {
  params: Promise<{
    hostelSlug: string;
    roomNumber: string;
    bedId: string;
  }>;
};

function formatDate(date: string) {
  return new Date(date.length === 10 ? `${date}T00:00:00` : date).toLocaleDateString(
    "en-IN",
    { day: "2-digit", month: "short", year: "numeric" }
  );
}

function money(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function toneClasses(tone: TimelineEvent["tone"]) {
  if (tone === "positive") return "border-emerald-200 bg-emerald-50";
  if (tone === "warning") return "border-amber-200 bg-amber-50";
  if (tone === "negative") return "border-red-200 bg-red-50";
  return "border-slate-200 bg-white";
}

export default async function ResidentTimelinePage({ params }: PageProps) {
  const { hostelSlug, roomNumber, bedId } = await params;

  const residentRows = await callRpcServer<ResidentDetails[]>(
    "get_resident_details",
    { p_bed_id: Number(bedId) }
  );
  const resident = residentRows.length > 0 ? residentRows[0] : null;

  if (!resident) {
    notFound();
  }

  const transfers = await callRpcServer<TransferRecord[]>("get_transfer_history", {
    p_resident_id: resident.resident_id,
  });

  const bookingIds = Array.from(
    new Set([
      resident.booking_id,
      ...transfers.flatMap((t) => [t.old_booking_id, t.new_booking_id]),
    ])
  );

  const events: TimelineEvent[] = [];

  for (const bookingId of bookingIds) {
    const [bookingRows, payments, rentHistory] = await Promise.all([
      callRpcServer<BookingDetails[]>("get_booking_details", {
        p_booking_id: bookingId,
      }),
      callRpcServer<PaymentHistoryRow[]>("get_payment_history", {
        p_booking_id: bookingId,
      }),
      callRpcServer<RentRevisionRow[]>("get_rent_history", {
        p_booking_id: bookingId,
      }),
    ]);

    const booking = bookingRows.length > 0 ? bookingRows[0] : null;
    if (!booking) continue;

    const location = `${booking.hostel_name} / Room ${booking.room_number} · ${booking.bed_code || booking.bed_number}`;

    events.push({
      date: booking.created_at,
      title: "Booking Created",
      detail: location,
      tone: "neutral",
    });

    for (const payment of payments) {
      events.push({
        date: payment.payment_date,
        title:
          payment.status === "active" ? "Payment Recorded" : "Payment Reversed",
        detail: `${payment.payment_type} — ${money(payment.amount)}${
          payment.reversed_reason ? ` (${payment.reversed_reason})` : ""
        }`,
        tone: payment.status === "active" ? "positive" : "negative",
      });
    }

    for (const rev of rentHistory) {
      events.push({
        date: rev.effective_date,
        title: "Rent Revised",
        detail: `${money(rev.previous_rent)} → ${money(rev.new_rent)}${
          rev.reason ? ` — ${rev.reason}` : ""
        }`,
        tone: "neutral",
      });
    }

    // A booking closed via transfer already gets its own "Transferred" event
    // below - only surface a genuine vacate here.
    const wasTransferredOut = transfers.some(
      (t) => t.old_booking_id === bookingId
    );

    if (booking.booking_status === "completed" && !wasTransferredOut) {
      try {
        const settlementRows = await callRpcServer<Settlement[]>(
          "get_booking_settlement",
          { p_booking_id: bookingId }
        );
        const settlement =
          settlementRows.length > 0 && settlementRows[0].settlement_id
            ? settlementRows[0]
            : null;

        if (settlement) {
          events.push({
            date: settlement.settlement_date,
            title: "Final Settlement Completed",
            detail:
              settlement.final_balance >= 0
                ? `Refund: ${money(settlement.refund_amount)}`
                : `Amount owed: ${money(Math.abs(settlement.final_balance))}`,
            tone: settlement.final_balance >= 0 ? "positive" : "warning",
          });
        }
      } catch {
        // No settlement recorded for this booking - not every completed
        // booking necessarily has one visible via this RPC.
      }
    }
  }

  for (const t of transfers) {
    events.push({
      date: t.transfer_date,
      title: "Transferred",
      detail: `${t.old_hostel_name} / Room ${t.old_room_number} · ${t.old_bed_code || "-"} → ${t.new_hostel_name} / Room ${t.new_room_number} · ${t.new_bed_code || "-"} (${t.reason})`,
      tone: "neutral",
    });
  }

  if (resident.notice_given_at) {
    events.push({
      date: resident.notice_given_at,
      title: "Notice Given",
      detail: resident.expected_vacate_date
        ? `Expected to vacate ${formatDate(resident.expected_vacate_date)}${resident.notice_notes ? ` — ${resident.notice_notes}` : ""}`
        : resident.notice_notes || "",
      tone: "warning",
    });
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <a
          href={`/${hostelSlug}/room/${roomNumber}/resident/${bedId}`}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          ← Back to Resident Details
        </a>

        <div className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            {resident.hostel_name} · Room {roomNumber}
          </p>
          <h1 className="mt-2 text-4xl font-bold">{resident.full_name}</h1>
          <p className="mt-2 text-slate-500">Activity Timeline</p>
        </div>

        {events.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500 shadow-sm">
            No activity recorded yet.
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {events.map((event, i) => (
              <div
                key={i}
                className={`rounded-2xl border p-4 shadow-sm ${toneClasses(event.tone)}`}
              >
                <p className="text-xs font-medium text-slate-400">
                  {formatDate(event.date)}
                </p>
                <p className="mt-1 font-semibold">{event.title}</p>
                {event.detail && (
                  <p className="mt-1 text-sm text-slate-600">{event.detail}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
