"use client";

import ExcelJS from "exceljs";

export type XlsxColumn = {
  header: string;
  key: string;
  type?: "number" | "date" | "string";
};

// Client-side XLSX export used across the accounting module's statement
// pages. Uses exceljs (not the npm "xlsx"/SheetJS package, which has
// unpatched high-severity prototype-pollution/ReDoS advisories) and writes
// numeric columns as real numbers, not formatted strings, per the "Financial
// Excel exports must retain numeric values as numbers" requirement.
export async function downloadXlsx(
  filename: string,
  sheetName: string,
  columns: XlsxColumn[],
  rows: Record<string, unknown>[]
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.max(c.header.length + 2, 14),
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const values: Record<string, unknown> = {};
    for (const col of columns) {
      const raw = row[col.key];
      if (col.type === "number") {
        values[col.key] = raw === null || raw === undefined ? null : Number(raw);
      } else {
        values[col.key] = raw ?? "";
      }
    }
    sheet.addRow(values);
  }

  for (const col of columns) {
    if (col.type === "number") {
      sheet.getColumn(col.key).numFmt = "#,##0.00";
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
