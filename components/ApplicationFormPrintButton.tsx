"use client";

import { logAuditEvent } from "@/lib/audit";

export default function ApplicationFormPrintButton({
  bookingId,
}: {
  bookingId: number;
}) {
  function handlePrint() {
    logAuditEvent("application_form_printed", "booking", bookingId, {});
    window.print();
  }

  return (
    <button
      onClick={handlePrint}
      className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 print:hidden"
    >
      Print Application Form
    </button>
  );
}
