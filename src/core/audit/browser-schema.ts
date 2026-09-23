/** No identifiers, filenames, contents, actors or arbitrary metadata cross this boundary. */
export type BrowserExport = { module: "qr"; format: "png" };
export function parseBrowserExport(value: unknown): BrowserExport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).length !== 2 || !("module" in entry) || !("format" in entry)) return null;
  if (entry.module === "qr" && entry.format === "png") return { module: "qr", format: "png" };
  return null;
}
