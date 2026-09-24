import { oeffneBlock } from "../kern/block";
import { ausBase64 } from "../kern/bytes";
import { entschluesseleExport, istExportdatei, KennwortFalsch } from "../kern/export";
import type { Block, Einsatz, Exportdatei } from "../kern/format";
import { pruefeKette } from "../kern/kette";
import { zeitpunktText } from "../kern/zeit";
import { kettenzustandAus, type Kettenzustand } from "../kern/ansichten/modell";
import { einsatzSchema, exportinhaltSchema, exportkopfSchema } from "./pruefung";

export const KEINE_DATEI = (name: string) => `„${name}“ ist keine Einsatzbuch-Datei. Erwartet wird eine .einsatzbuch-Datei aus der Verwaltung.`;
export const KENNWORT_FALSCH = "Das Kennwort passt nicht. Die Datei bleibt verschlüsselt.";
export const INHALT_BESCHAEDIGT = "Der Inhalt der Datei ist beschädigt oder hat nicht die erwartete Form.";

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

export interface Eintrag { block: Block; einsatz: Einsatz | null; fehler: string | null }
export interface Geoeffnet {
  eintraege: Eintrag[]; kette: Kettenzustand; test: boolean; exportiertVon: string; quelle: string;
  anker: { block: number; hash: string; gemeldetAm: string } | null; von: number; bis: number; anzahl: number;
}
export type Oeffnung = { ok: true; wert: Geoeffnet } | { ok: false; fehler: string; kennwort: boolean };

/**
 * Entschlüsselt mit dem Kennwort, prüft den Inhalt streng (zod, Entscheidung 1) und öffnet
 * jeden Block einzeln — ein Block ohne passenden oder gültigen CEK ist kein Formfehler der
 * ganzen Datei, sondern „Block n lässt sich nicht öffnen“ (Entscheidung 1 aus `kontext.md`).
 */
export async function oeffneExport(datei: Exportdatei, kennwort: string): Promise<Oeffnung> {
  let roh: unknown;
  try { roh = await entschluesseleExport(datei, kennwort); }
  catch (e) { return e instanceof KennwortFalsch ? { ok: false, fehler: KENNWORT_FALSCH, kennwort: true } : { ok: false, fehler: INHALT_BESCHAEDIGT, kennwort: false }; }
  const inhalt = exportinhaltSchema.safeParse(roh);
  if (!inhalt.success) return { ok: false, fehler: INHALT_BESCHAEDIGT, kennwort: false };
  const bloecke = inhalt.data.bloecke as Block[];
  const kette = kettenzustandAus(await pruefeKette(bloecke), bloecke);
  const eintraege: Eintrag[] = [];
  for (const b of bloecke) {
    const cek = inhalt.data.schluessel[String(b.kopf.block)];
    let einsatz: Einsatz | null = null;
    if (cek) {
      try { const e = einsatzSchema.safeParse(await oeffneBlock(b, ausBase64(cek))); einsatz = e.success ? (e.data as Einsatz) : null; }
      catch { einsatz = null; }
    }
    eintraege.push({ block: b, einsatz, fehler: einsatz ? null : `Block ${b.kopf.block} lässt sich nicht öffnen` });
  }
  const nummern = bloecke.map((b) => b.kopf.block);
  return { ok: true, wert: {
    eintraege, kette, test: bloecke.some((b) => b.kopf.umgebung === "test"),
    exportiertVon: inhalt.data.exportiertVon, quelle: inhalt.data.quelle, anker: inhalt.data.anker,
    von: Math.min(...nummern), bis: Math.max(...nummern), anzahl: bloecke.length,
  } };
}
