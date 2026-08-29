/**
 * CSV-Feld escapen und gegen Formel-Injection härten: Werte, die (auch nach
 * führendem Tab/CR) mit = + - @ beginnen, mit führendem Apostroph neutralisieren.
 * 1:1 aus uav-praxis/server/routes/admin.ts:12-15.
 */
export function csvFeld(v: string): string {
  const sicher = /^[\t\r]*[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${sicher.replace(/"/g, '""')}"`;
}

/**
 * BOM + CRLF + jedes Feld in Anführungszeichen — Excel-tauglich, formelsicher.
 *
 * Der Vertrag ist der Byte-Rumpf auf der Leitung, nicht `Response.text()`: die
 * WHATWG-Spezifikation lässt `text()` beim UTF-8-Decodieren ein führendes BOM
 * verschlucken (gemessen unter Node/undici) — das ist korrektes Verhalten einer
 * spec-konformen `Response`, kein Fehler, den Produktionscode umgehen müsste.
 * Wer das BOM prüfen will, liest die Bytes (`arrayBuffer()`) oder decodiert mit
 * `ignoreBOM: true`.
 */
export function csvAntwort(zeilen: string[][], dateiname: string): Response {
  const csv = "﻿" + zeilen.map((z) => z.map(csvFeld).join(",")).join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${dateiname}"`,
    },
  });
}
