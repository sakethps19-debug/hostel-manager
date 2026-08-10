"use client";

import { useEffect, useState } from "react";
import { callRpcClient } from "@/lib/supabase/callRpcClient";

type PaymentRow = {
  payment_id: number;
  receipt_number: string;
  payment_date: string;
  payment_type: string;
  amount: number;
  payment_mode: string;
  reference_number: string | null;
  status: string;
};

export default function DuplicatePaymentWarning({
  bookingId,
  amount,
  paymentDate,
  paymentMode,
  referenceNumber,
  onAcknowledgeChange,
}: {
  bookingId: number;
  amount: string;
  paymentDate: string;
  paymentMode: string;
  referenceNumber: string;
  onAcknowledgeChange: (acknowledged: boolean) => void;
}) {
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;

    callRpcClient<PaymentRow[]>("get_payment_history", {
      p_booking_id: bookingId,
    })
      .then((rows) => {
        if (!cancelled) setPayments(rows);
      })
      .catch(() => {
        if (!cancelled) setPayments([]);
      });

    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const numericAmount = Number(amount);

  const matches = (payments || []).filter((p) => {
    if (p.status === "reversed") return false;
    if (Number(p.amount) !== numericAmount) return false;

    const sameReference =
      referenceNumber.trim().length > 0 &&
      p.reference_number?.trim() === referenceNumber.trim();

    const sameDateAndMode =
      p.payment_date === paymentDate && p.payment_mode === paymentMode;

    return sameReference || sameDateAndMode;
  });

  useEffect(() => {
    onAcknowledgeChange(matches.length === 0 || acknowledged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches.length, acknowledged]);

  useEffect(() => {
    setAcknowledged(false);
  }, [numericAmount, paymentDate, paymentMode, referenceNumber]);

  if (!numericAmount || matches.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="font-semibold text-amber-800">
        This looks like it might be a duplicate of an existing payment.
      </p>

      <ul className="mt-2 space-y-1 text-sm text-amber-800">
        {matches.map((p) => (
          <li key={p.payment_id}>
            Receipt {p.receipt_number} · Rs. {Number(p.amount).toLocaleString("en-IN")} ·{" "}
            {p.payment_mode} ·{" "}
            {new Date(`${p.payment_date}T00:00:00`).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
            {p.reference_number ? ` · Ref ${p.reference_number}` : ""}
          </li>
        ))}
      </ul>

      <label className="mt-3 flex items-start gap-2 text-sm text-amber-900">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
        />
        <span>
          I&apos;ve checked and this is a separate, legitimate payment.
        </span>
      </label>
    </div>
  );
}
