import { zeitFormat } from "@/core/zeit";

/**
 * DER NAME EINES DRUCKSTÜCKS — als Dateiname und als Dokumenttitel.
 *
 * Der Browser nimmt beim „Als PDF speichern“ den `document.title` als Dateinamen; ohne eigenen Titel hieß jedes
 * Blatt der Suite „IDA“ (Wurzel-Layout). Eine erzeugte PDF trägt denselben Text im Feld Titel der Metadaten,
 * den PDF-Betrachter als Fenstertitel und manche Telefone beim Teilen als Dateinamen zeigen.
 *
 * Teile werden mit „ – “ verbunden, leere fallen weg; Zeichen, die ein Dateisystem nicht nimmt, werden zu
 * Leerzeichen. Das Datum (Kalendertag in der Suite-Zone, `JJJJ-MM-TT`) steht hinten, damit Dateien sortieren.
 */

const TAG = zeitFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" });

/** Kalendertag `JJJJ-MM-TT` des Zeitpunkts in der Suite-Zone. */
export function druckTag(ms: number): string {
  return TAG.format(ms);
}

/** Höchstlänge ohne Endung: lässt Platz für „.pdf“ und bleibt unter den 255 Byte der Dateisysteme. */
const MAX = 120;

export function druckTitel(teile: readonly (string | null | undefined | false)[], am?: number): string {
  const sauber = teile
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0);
  const text = sauber.join(" – ").slice(0, MAX).trim();
  return am === undefined ? text : `${text} ${druckTag(am)}`.trim();
}

/** Derselbe Name als PDF-Dateiname. */
export function pdfDateiname(teile: readonly (string | null | undefined | false)[], am?: number): string {
  return `${druckTitel(teile, am) || "Dokument"}.pdf`;
}
