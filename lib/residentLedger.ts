export type LedgerEntry = {
  date: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number | null;
  reversed?: boolean;
};

type RentRevision = {
  previous_rent: number;
  new_rent: number;
  effective_date: string;
};

type PaymentRow = {
  payment_id: number;
  receipt_number: string;
  payment_date: string;
  payment_for_month: string | null;
  payment_type: string;
  amount: number;
  payment_mode: string;
  reference_number: string | null;
  status: string;
  reversed_reason: string | null;
};

function rentEffectiveOn(
  date: Date,
  startingRent: number,
  revisions: RentRevision[]
) {
  let rent = startingRent;
  for (const rev of revisions) {
    if (new Date(`${rev.effective_date}T00:00:00`) <= date) {
      rent = Number(rev.new_rent);
    } else {
      break;
    }
  }
  return rent;
}

export function buildResidentLedger({
  startDate,
  endDate,
  currentMonthlyRent,
  securityDeposit,
  rentHistory,
  payments,
}: {
  startDate: string;
  endDate: string;
  currentMonthlyRent: number;
  securityDeposit: number | null;
  rentHistory: RentRevision[];
  payments: PaymentRow[];
}): LedgerEntry[] {
  const revisions = [...rentHistory].sort(
    (a, b) =>
      new Date(a.effective_date).getTime() - new Date(b.effective_date).getTime()
  );

  const startingRent =
    revisions.length > 0 ? Number(revisions[0].previous_rent) : currentMonthlyRent;

  const rows: (LedgerEntry & { isRentAccount: boolean; sortKey: number })[] = [];

  // Security deposit due, at move-in.
  if (Number(securityDeposit) > 0) {
    rows.push({
      date: startDate,
      type: "Security Deposit Due",
      description: "Security deposit agreed at move-in",
      debit: 0,
      credit: 0,
      runningBalance: null,
      isRentAccount: false,
      sortKey: new Date(`${startDate}T00:00:00`).getTime() - 2,
    });
  }

  // Monthly rent due schedule, one entry per calendar month from start
  // date through the earlier of today or the booking end date.
  const start = new Date(`${startDate}T00:00:00`);
  const cap = new Date(
    Math.min(new Date().getTime(), new Date(`${endDate}T00:00:00`).getTime())
  );

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const capMonth = new Date(cap.getFullYear(), cap.getMonth(), 1);

  while (cursor <= capMonth) {
    const dueDate =
      cursor.getTime() === new Date(start.getFullYear(), start.getMonth(), 1).getTime()
        ? startDate
        : cursor.toISOString().slice(0, 10);

    const rent = rentEffectiveOn(cursor, startingRent, revisions);

    rows.push({
      date: dueDate,
      type: "Monthly Rent Due",
      description: `Rent for ${cursor.toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
      })}`,
      debit: rent,
      credit: 0,
      runningBalance: null,
      isRentAccount: true,
      sortKey: new Date(`${dueDate}T00:00:00`).getTime() - 1,
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Actual payments/refunds/adjustments.
  for (const payment of payments) {
    const isReversed = payment.status === "reversed";
    const base = {
      date: payment.payment_date,
      reversed: isReversed,
      sortKey: new Date(`${payment.payment_date}T00:00:00`).getTime(),
    };

    if (payment.payment_type === "Security Deposit") {
      rows.push({
        ...base,
        type: "Deposit Payment",
        description: `Receipt ${payment.receipt_number} · ${payment.payment_mode}${isReversed ? " (Reversed)" : ""}`,
        debit: 0,
        credit: isReversed ? 0 : Number(payment.amount),
        runningBalance: null,
        isRentAccount: false,
      });
    } else if (payment.payment_type === "Deposit Refund") {
      rows.push({
        ...base,
        type: "Deposit Refund",
        description: `Receipt ${payment.receipt_number} · ${payment.payment_mode}${isReversed ? " (Reversed)" : ""}`,
        debit: isReversed ? 0 : Number(payment.amount),
        credit: 0,
        runningBalance: null,
        isRentAccount: false,
      });
    } else {
      const label =
        payment.payment_type === "Monthly Rent"
          ? "Rent Payment"
          : payment.payment_type === "Adjustment"
          ? "Discount / Adjustment"
          : "Other Charge";

      rows.push({
        ...base,
        type: label,
        description: `Receipt ${payment.receipt_number} · ${payment.payment_mode}${
          payment.payment_for_month
            ? ` · for ${new Date(`${payment.payment_for_month}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`
            : ""
        }${isReversed ? " (Reversed)" : ""}`,
        debit: 0,
        credit: isReversed ? 0 : Number(payment.amount),
        runningBalance: null,
        isRentAccount: true,
      });
    }
  }

  rows.sort((a, b) => a.sortKey - b.sortKey);

  let balance = 0;
  return rows.map((row) => {
    if (row.isRentAccount) {
      balance += row.debit - row.credit;
    }
    return {
      date: row.date,
      type: row.type,
      description: row.description,
      debit: row.debit,
      credit: row.credit,
      runningBalance: row.isRentAccount ? balance : null,
      reversed: row.reversed,
    };
  });
}
