// Server component (no "use client") so isCommsTestMode() reads the real
// server-side env var directly - it must never be spoofable from the
// browser. Rendered wherever a message could be composed/sent, per Part H:
// "Clearly show: TEST MODE."
import { isCommsTestMode } from "@/lib/communications/provider";

export default function TestModeBanner() {
  if (!isCommsTestMode()) return null;

  return (
    <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800">
      TEST MODE — no real WhatsApp/SMS messages are being sent. Every send
      below is logged normally but only ever reaches a mock provider.
    </div>
  );
}
