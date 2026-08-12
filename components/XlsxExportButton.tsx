"use client";

import { useState } from "react";
import { downloadXlsx, type XlsxColumn } from "@/lib/accounting/xlsxExport";

export default function XlsxExportButton({
  filename,
  sheetName,
  columns,
  rows,
  label = "Export Excel",
}: {
  filename: string;
  sheetName: string;
  columns: XlsxColumn[];
  rows: Record<string, unknown>[];
  label?: string;
}) {
  const [exporting, setExporting] = useState(false);

  async function handleClick() {
    setExporting(true);
    try {
      await downloadXlsx(filename, sheetName, columns, rows);
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={exporting || rows.length === 0}
      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {exporting ? "Exporting..." : label}
    </button>
  );
}
