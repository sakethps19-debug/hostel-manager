const HOSTEL_INITIAL_FALLBACK = "X";

const CATEGORY_PREFIXES: Record<string, string> = {
  "Cot / Bed Frame": "BED",
  Mattress: "MAT",
  "Bed Sheets": "BEDSHEET",
  Pillows: "PILLOW",
  Locker: "LOCK",
  Cupboard: "CUPB",
  Table: "TBL",
  Chair: "CHR",
  Fan: "FAN",
  Geyser: "GEYSER",
  "Washing Machine": "WM",
  "Refrigerator / Fridge": "FRIDGE",
  "Air Conditioner": "AC",
  TV: "TV",
  "CCTV Camera": "CCTV",
  Router: "ROUTER",
  "Inverter / UPS": "UPS",
  "Water Purifier": "WP",
  "Kitchen Equipment": "KITCHEN",
  "Other Appliances": "APPL",
  Furniture: "FURN",
  Electronics: "ELEC",
  "Other Assets": "OTHER",
  // Legacy categories from the original Asset Register (pre-accounting module)
  "Furniture ": "FURN",
  "Electrical Appliance": "APPL",
  "Kitchen Equipment ": "KITCHEN",
  "Fire Safety": "FIRE",
  "Plumbing Fixture": "PLUMB",
  Other: "OTHER",
};

export function categoryCodePrefix(category: string): string {
  return CATEGORY_PREFIXES[category] || category.slice(0, 4).toUpperCase().replace(/[^A-Z]/g, "") || "AST";
}

// Suggests the next AST-<hostel initial>-<category prefix>-<sequence> code
// given the codes already visible in the currently-loaded asset list. This
// is a convenience suggestion, not a guarantee of uniqueness - the database
// unique index on asset_code is the actual guarantee (see idx_assets_asset_code).
export function suggestNextAssetCode(
  existingCodes: string[],
  hostelName: string | null,
  category: string
): string {
  const hostelInitial = (hostelName?.trim()?.[0] || HOSTEL_INITIAL_FALLBACK).toUpperCase();
  const prefix = categoryCodePrefix(category);
  const codePrefix = `AST-${hostelInitial}-${prefix}-`;

  let maxSeq = 0;
  for (const code of existingCodes) {
    if (!code.startsWith(codePrefix)) continue;
    const seq = Number(code.slice(codePrefix.length));
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }

  return `${codePrefix}${String(maxSeq + 1).padStart(4, "0")}`;
}
