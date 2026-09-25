/** No identifiers, filenames, contents, actors or arbitrary metadata cross this boundary. */
export type BrowserExport =
  | { module: "qr"; format: "png" }
  | { module: "einsatzbuch"; format: "reader_oeffnen" | "reader_druck"; von: number; bis: number; anzahl: number };

const MAX_BLOCKNUMMER = 10_000_000;
const istGanzzahl = (wert: unknown): wert is number => typeof wert === "number" && Number.isSafeInteger(wert);

export function parseBrowserExport(value: unknown): BrowserExport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const keys = Object.keys(entry).sort().join(",");
  if (keys === "format,module") {
    if (entry.module === "qr" && entry.format === "png") return { module: "qr", format: "png" };
    return null;
  }
  if (
    keys === "anzahl,bis,format,module,von" &&
    entry.module === "einsatzbuch" &&
    (entry.format === "reader_oeffnen" || entry.format === "reader_druck") &&
    istGanzzahl(entry.von) && istGanzzahl(entry.bis) && istGanzzahl(entry.anzahl) &&
    entry.von >= 1 && entry.von <= entry.bis && entry.bis <= MAX_BLOCKNUMMER &&
    entry.anzahl >= 1 && entry.anzahl <= entry.bis - entry.von + 1
  ) {
    return { module: "einsatzbuch", format: entry.format, von: entry.von, bis: entry.bis, anzahl: entry.anzahl };
  }
  return null;
}
