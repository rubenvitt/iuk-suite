/**
 * Baut die Exportdatei am Rechner (Spec §3.3, Plan Stufe 6, Entscheidung 7) mit dem geteilten
 * Kern (`@kern/export`, `verschluesseleExport`) — rein, ohne `invoke`, ohne React. Auch das
 * E2E-Skript der Auslieferung importiert dieses Modul, deshalb stehen hier nur Importe aus
 * `@kern/*`.
 *
 * Getragen wird nur, was die Datei soll (Review Focus 4): die ausgewählten Originalblöcke
 * unverändert, die Inhaltsschlüssel genau dieser Blöcke und der letzte von der Suite bestätigte
 * Anker. Ein ausgewählter Block ohne Schlüssel bricht ab, statt eine Datei zu erzeugen, die
 * der Reader nur zum Teil öffnen kann.
 *
 * Die CEK-Bytes gehören dem Aufrufer: Er überschreibt sie nach dem Aufruf (`fill(0)`); hier
 * entsteht nur ihre Base64-Form im Klartext des Exports, der gleich danach verschlüsselt wird.
 */
import { zuBase64 } from "@kern/bytes";
import { KENNWORT_MINDESTLAENGE, verschluesseleExport } from "@kern/export";
import type { Block, Exportdatei, Exportinhalt, Exportkopf } from "@kern/format";

export type Exportumfang = Exportkopf["umfang"];

export interface Exportauftrag {
  /** Die ganze Kette des Rechners, aufsteigend. */
  bloecke: readonly Block[];
  umfang: Exportumfang;
  /** „einzeln“: dieser Block; ohne Wahl der neueste. Bei „alle“ ohne Bedeutung. */
  gewaehlt: number | null;
  ceks: ReadonlyMap<number, Uint8Array>;
  anker: Exportinhalt["anker"];
  /** Name der Verwaltungssitzung. */
  exportiertVon: string;
  /** Name der Bereitschaft. */
  quelle: string;
  /** Zeitpunkt mit Offset der Einrichtungszone (`Status.jetzt`). */
  erstellt: string;
  zeitzone: string;
  /** Einsatznummer des Blocks bei „einzeln“, für den Dateinamen. */
  nummer: string | null;
}

/** „YYYY-MM-DD“ des Zeitpunkts in `zeitzone` — das Format je Aufruf, nie auf Modulebene. */
function tagIn(zeitpunkt: string, zeitzone: string): string {
  const teile = new Intl.DateTimeFormat("en-US", { timeZone: zeitzone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(zeitpunkt));
  const t = Object.fromEntries(teile.map((p) => [p.type, p.value]));
  return `${t.year}-${t.month}-${t.day}`;
}

function auswahl(e: Exportauftrag): Block[] {
  if (e.bloecke.length === 0) throw new Error("Es gibt keine Einsätze zum Herunterladen.");
  const aufsteigend = [...e.bloecke].sort((a, b) => a.kopf.block - b.kopf.block);
  if (e.umfang === "alle") return aufsteigend;
  if (e.gewaehlt === null) return [aufsteigend[aufsteigend.length - 1]];
  const block = aufsteigend.find((b) => b.kopf.block === e.gewaehlt);
  if (!block) throw new Error(`Block ${e.gewaehlt} gibt es auf diesem Rechner nicht.`);
  return [block];
}

/** Dateiname wie die Vorlage (`exportieren`): die Kette mit Datum und Blockbereich, ein Einsatz mit seiner Nummer. */
function dateinameFuer(e: Exportauftrag, kopf: Exportkopf): string {
  if (e.umfang === "alle") return `einsatzbuch_${tagIn(e.erstellt, e.zeitzone)}_block-${kopf.von}-${kopf.bis}.einsatzbuch`;
  return e.nummer ? `einsatz_${e.nummer}.einsatzbuch` : `einsatz_block-${kopf.von}.einsatzbuch`;
}

export async function baueExport(e: Exportauftrag, kennwort: string): Promise<{ datei: Exportdatei; dateiname: string }> {
  if (kennwort.length < KENNWORT_MINDESTLAENGE) throw new Error(`Das Kennwort braucht mindestens ${KENNWORT_MINDESTLAENGE} Zeichen.`);
  const bloecke = auswahl(e);
  const schluessel: Record<string, string> = {};
  for (const b of bloecke) {
    const cek = e.ceks.get(b.kopf.block);
    if (!cek) throw new Error(`Für Block ${b.kopf.block} fehlt der Schlüssel.`);
    schluessel[String(b.kopf.block)] = zuBase64(cek);
  }
  const kopf: Exportkopf = {
    erstellt: e.erstellt,
    umfang: e.umfang,
    von: bloecke[0].kopf.block,
    bis: bloecke[bloecke.length - 1].kopf.block,
    anzahl: bloecke.length,
    quelle: e.quelle,
  };
  const inhalt: Exportinhalt = { bloecke, schluessel, exportiertVon: e.exportiertVon, quelle: e.quelle, anker: e.anker };
  const datei = await verschluesseleExport(inhalt, kennwort, kopf);
  return { datei, dateiname: dateinameFuer(e, kopf) };
}
