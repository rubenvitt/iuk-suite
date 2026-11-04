/**
 * Die Vertrags-PDF einer Zusage: Grenzen, Prüfung der Bytes, Dateiname für den Download. Kein Erzeugen, nur Ablage.
 *
 * Geprüft wird, was ankommt, nicht was der Browser behauptet: der Typ muss `application/pdf` sein UND die Datei mit
 * `%PDF-` beginnen (Magic Bytes). Eine HTML-Datei mit `.pdf`-Endung kommt so nicht in die Datenbank.
 */

// 10 MB dezimal, nicht 10 MiB: mit dem Multipart-Überhang des Route Handlers bleibt die Anfrage unter den
// 10 MiB, die `src/proxy.ts` als Middleware standardmäßig puffert (`experimental.proxyClientMaxBodySize`).
export const VERTRAG_MAX_BYTES = 10_000_000;
const PDF_KOPF = Buffer.from("%PDF-", "ascii");

export type PdfPruefung = { ok: true; name: string } | { ok: false; fehler: string; status: 400 | 413 | 415 };

/** Ein Dateiname ohne Pfad, ohne Steuerzeichen, mit `.pdf` und höchstens 120 Zeichen. */
export function sichererName(roh: string): string {
  const ohnePfad = roh.split(/[\\/]/).pop() ?? "";
  const sauber = ohnePfad.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  const basis = (sauber.replace(/\.pdf$/i, "") || "Mietvertrag").slice(0, 116);
  return `${basis}.pdf`;
}

export function pruefePdf(name: string, typ: string, bytes: Buffer): PdfPruefung {
  if (bytes.length === 0) return { ok: false, fehler: "Die Datei ist leer.", status: 400 };
  if (bytes.length > VERTRAG_MAX_BYTES) return { ok: false, fehler: "Die Datei ist größer als 10 MB.", status: 413 };
  if (typ !== "application/pdf" || !bytes.subarray(0, PDF_KOPF.length).equals(PDF_KOPF)) {
    return { ok: false, fehler: "Bitte eine PDF-Datei wählen.", status: 415 };
  }
  return { ok: true, name: sichererName(name) };
}

/** `Content-Disposition: attachment` mit ASCII-Rückfall und dem echten Namen in `filename*` (RFC 6266/5987). */
export function anhangKopf(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "Mietvertrag.pdf";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Wie `anhangKopf`, aber zum Ansehen im Browser (`inline`), etwa die Vorlage auf der Statusseite. */
export function ansichtKopf(name: string): string {
  return anhangKopf(name).replace(/^attachment/, "inline");
}
