import { oeffneBlock } from "../kern/block";
import { ausBase64 } from "../kern/bytes";
import { entschluesseleExport, istExportdatei, KennwortFalsch } from "../kern/export";
import type { Block, Einsatz, Exportdatei } from "../kern/format";
import { pruefeKette, type Kettenergebnis } from "../kern/kette";
import { zeitpunktText } from "../kern/zeit";
import { kettenzustandAus, type Kettenzustand, type Listeneintrag } from "../kern/ansichten/modell";
import { einsatzSchema, exportinhaltSchema, exportkopfSchema } from "./pruefung";

export const KEINE_DATEI = (name: string) => `„${name}“ ist keine Einsatzbuch-Datei. Erwartet wird eine .einsatzbuch-Datei aus der Verwaltung.`;
export const KENNWORT_FALSCH = "Das Kennwort passt nicht. Die Datei bleibt verschlüsselt.";
export const INHALT_BESCHAEDIGT = "Der Inhalt der Datei ist beschädigt oder hat nicht die erwartete Form.";
export const ZU_GROSS = "Die Datei ist zu groß für eine Einsatzbuch-Datei.";
/** Obergrenze vor `File.text()` — ein Export der Verwaltung bleibt weit darunter. */
export const MAX_DATEIGROESSE = 50 * 1024 * 1024;

export type Gelesen = { ok: true; datei: Exportdatei; kopfText: string } | { ok: false; fehler: string };

/**
 * Liest eine ausgewählte Datei roh (JSON, noch verschlüsselt) und prüft nur die äußere Hülle
 * (Kern `istExportdatei` plus zod-Kopfprüfung) — genug, um den Kopf anzuzeigen und nach dem
 * Kennwort zu fragen, ohne dass eine fremde oder kaputte Datei den Reader abstürzen lässt.
 */
export function leseDatei(name: string, text: string, zeitzone: string): Gelesen {
  let roh: unknown;
  try { roh = JSON.parse(text); } catch { return { ok: false, fehler: KEINE_DATEI(name) }; }
  if (!istExportdatei(roh) || !exportkopfSchema.safeParse(roh.kopf).success) return { ok: false, fehler: KEINE_DATEI(name) };
  const k = roh.kopf;
  const bereich = k.von === k.bis ? `Block ${k.von}` : `Block ${k.von}–${k.bis}`;
  return { ok: true, datei: roh, kopfText: `Exportiert ${zeitpunktText(k.erstellt, zeitzone)} · ${k.quelle} · ${bereich} · ${k.anzahl} ${k.anzahl === 1 ? "Einsatz" : "Einsätze"}` };
}

/**
 * `knoten` ist der Prüfstatus an der Position des Blocks IN DER DATEI, nicht nach seiner
 * Nummer: `pruefeKette` bricht an der ersten fehlerhaften Position ab und hasht nichts dahinter.
 * In einer umgestellten Datei `[3, 2, 1]` liegt Block 1 hinter dem Bruch bei Block 2 — nach
 * Nummern (`knotenFuer`) hieße er „geprüft“, obwohl ihn niemand gehasht hat.
 */
export interface Eintrag { block: Block; einsatz: Einsatz | null; fehler: string | null; knoten: Listeneintrag["knoten"] }
export interface Geoeffnet {
  eintraege: Eintrag[]; kette: Kettenzustand; test: boolean; exportiertVon: string; quelle: string;
  anker: { block: number; hash: string; gemeldetAm: string } | null; von: number; bis: number; anzahl: number;
}
export type Oeffnung = { ok: true; wert: Geoeffnet } | { ok: false; fehler: string; kennwort: boolean };

/**
 * Entschlüsselt mit dem Kennwort, prüft den Inhalt streng mit zod und öffnet jeden Block einzeln;
 * ein Block ohne gültigen CEK ist kein Formfehler der Datei, sondern „Block n lässt sich nicht
 * öffnen“ (Plan Stufe 3, `docs/superpowers/plans/2026-09-24-einsatzbuch-v2-stufe-3-reader.md`, Entscheidung 1).
 */
export async function oeffneExport(datei: Exportdatei, kennwort: string): Promise<Oeffnung> {
  let roh: unknown;
  try { roh = await entschluesseleExport(datei, kennwort); }
  catch (e) { return e instanceof KennwortFalsch ? { ok: false, fehler: KENNWORT_FALSCH, kennwort: true } : { ok: false, fehler: INHALT_BESCHAEDIGT, kennwort: false }; }
  const inhalt = exportinhaltSchema.safeParse(roh);
  if (!inhalt.success) return { ok: false, fehler: INHALT_BESCHAEDIGT, kennwort: false };
  const bloecke = inhalt.data.bloecke as Block[];
  const ergebnis = await pruefeKette(bloecke);
  const kette = kettenzustandAus(ergebnis, bloecke);
  const bruch = await bruchstelle(bloecke, ergebnis);
  const eintraege: Eintrag[] = [];
  for (const [i, b] of bloecke.entries()) {
    const cek = inhalt.data.schluessel[String(b.kopf.block)];
    let einsatz: Einsatz | null = null;
    if (cek) {
      try { const e = einsatzSchema.safeParse(await oeffneBlock(b, ausBase64(cek))); einsatz = e.success ? (e.data as Einsatz) : null; }
      catch { einsatz = null; }
    }
    const knoten = i < bruch ? "geprueft" : i === bruch ? "gebrochen" : "neutral";
    eintraege.push({ block: b, einsatz, fehler: einsatz ? null : `Block ${b.kopf.block} lässt sich nicht öffnen`, knoten });
  }
  const nummern = bloecke.map((b) => b.kopf.block);
  return { ok: true, wert: {
    eintraege, kette, test: bloecke.some((b) => b.kopf.umgebung === "test"),
    exportiertVon: inhalt.data.exportiertVon, quelle: inhalt.data.quelle, anker: inhalt.data.anker,
    von: Math.min(...nummern), bis: Math.max(...nummern), anzahl: bloecke.length,
  } };
}

/**
 * Dateiposition, an der `pruefeKette` abgebrochen hat; bei intakter Kette `bloecke.length`.
 * Der Kern meldet nur die Blocknummer, und die ist in einer umgestellten oder selbst gebauten
 * Datei weder eindeutig noch aufsteigend — deshalb wird die Position über Präfixe gesucht, ohne
 * den Kern zu ändern. Binäre Suche ist zulässig, weil das Präfix-Ergebnis monoton ist:
 * `pruefeKette` prüft Position i nur gegen Block i und i−1 und bricht an der ersten Verletzung
 * ab. Ein Präfix, das bricht, bricht also verlängert an derselben Stelle; ein Präfix, das
 * besteht, enthält keine Verletzung. Der erste brechende Präfix `slice(0, k)` endet an der
 * Bruchstelle k−1.
 */
async function bruchstelle(bloecke: readonly Block[], ergebnis: Kettenergebnis): Promise<number> {
  if (ergebnis.ok) return bloecke.length;
  let lo = 1;
  let hi = bloecke.length;
  while (lo < hi) {
    const mitte = Math.floor((lo + hi) / 2);
    if ((await pruefeKette(bloecke.slice(0, mitte))).ok) lo = mitte + 1;
    else hi = mitte;
  }
  return lo - 1;
}
