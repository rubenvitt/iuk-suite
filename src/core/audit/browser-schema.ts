/** No identifiers, filenames, contents, actors or arbitrary metadata cross this boundary. */
export type BrowserExport = { module: "qr"; format: "png" } | { module: "zeichen"; format: "png" | "svg" | "json" };
export function parseBrowserExport(value: unknown): BrowserExport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).length !== 2 || !("module" in entry) || !("format" in entry)) return null;
  if (entry.module === "qr" && entry.format === "png") return { module: "qr", format: "png" };
  if (entry.module === "zeichen" && (entry.format === "png" || entry.format === "svg" || entry.format === "json")) return { module: "zeichen", format: entry.format };
  return null;
}
