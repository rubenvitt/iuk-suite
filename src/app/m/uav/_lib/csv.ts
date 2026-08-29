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
 * `Response.text()` entfernt nach WHATWG-Spezifikation beim UTF-8-Decodieren ein
 * führendes BOM (gemessen unter Node/undici) — für eine Excel-taugliche CSV-Antwort
 * ist das BOM aber Vertragsbestandteil, kein Decodier-Artefakt. Die Überschreibung
 * liefert exakt den erzeugten String zurück; Statuscode, Header und der tatsächliche
 * Byte-Body, den Next.js beim Senden über die Leitung liest, bleiben die echten aus
 * `Response`.
 */
export function csvAntwort(zeilen: string[][], dateiname: string): Response {
  const csv = "﻿" + zeilen.map((z) => z.map(csvFeld).join(",")).join("\r\n") + "\r\n";
  const res = new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${dateiname}"`,
    },
  });
  res.text = () => Promise.resolve(csv);
  return res;
}
