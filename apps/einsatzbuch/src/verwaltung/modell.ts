/**
 * Anzeigemodell der Verwaltung am Rechner, rein und ohne React: Kennzahlen und Stichwort-
 * verteilung wie `kpis`/`verteilung` der Vorlage (`docs/design/einsatzbuch-v2/vorlage/
 * Einsatzbuch v2.dc.html`, Abschnitt „Verwaltung“ in `renderVals`), dazu die Zeilen der
 * geteilten `Kettenliste`. Zeiten rechnen immer in der übergebenen Zone, nie in der des Browsers.
 */
import { knotenFuer, type Kettenzustand, type Listeneintrag } from "@kern/ansichten/modell";
import type { Block, Einsatz } from "@kern/format";
import { dauerMinuten, zeitpunktText } from "@kern/zeit";

import type { SitzungInfo } from "../typen";

/** Ein entschlüsselter Block — lebt nur im Speicher der laufenden Sitzung. */
export interface Offen {
  block: Block;
  einsatz: Einsatz;
}

export interface Kennzahl {
  zahl: string;
  label: string;
}

/**
 * Die vier Kacheln der Vorlage. `anzahl` zählt alle Blöcke, auch die, die zu sind. Solange einer
 * zu ist, stehen die Summen als „—“ (wie die gesperrte Vorlage): Eine Summe über einen Teil der
 * Kette sähe aus wie die ganze.
 */
export function kennzahlen(offen: readonly Offen[], o: { anzahl: number; zeitzone: string }): Kennzahl[] {
  const vollstaendig = offen.length === o.anzahl;
  const summe = (f: (e: Einsatz) => number) => String(offen.reduce((a, x) => a + f(x.einsatz), 0));
  const minuten = offen.reduce((a, x) => a + Math.max(0, dauerMinuten(x.einsatz, o.zeitzone) ?? 0), 0);
  return [
    { label: "Einsätze versiegelt", zahl: String(o.anzahl) },
    { label: "Patienten gesamt", zahl: vollstaendig ? summe((e) => e.vorOrt + e.transport) : "—" },
    { label: "davon mit Transport", zahl: vollstaendig ? summe((e) => e.transport) : "—" },
    { label: "Einsatzstunden", zahl: vollstaendig ? String(Math.round(minuten / 60)) : "—" },
  ];
}

/** Anzahl je Alarmstichwort, meiste zuerst, bei Gleichstand nach Namen; Balken relativ zum häufigsten. */
export function stichwortVerteilung(offen: readonly Offen[]): { name: string; anz: number; breite: string }[] {
  const zaehl = new Map<string, number>();
  for (const { einsatz } of offen) zaehl.set(einsatz.stichwort, (zaehl.get(einsatz.stichwort) ?? 0) + 1);
  const max = Math.max(1, ...zaehl.values());
  return [...zaehl.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"))
    .map(([name, anz]) => ({ name, anz, breite: `${Math.round((anz / max) * 100)}%` }));
}

const mitZahl = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;

/** Anschnitt des echten Chiffrats für eine gesperrte Zeile (die Vorlage zeigt dort Base64 mit „…“). */
export function chiffreAnschnitt(daten: string): string {
  return `${daten.slice(0, 48)}…`;
}

/**
 * Zeilen der `Kettenliste`, neueste oben. `gesperrt`: Die Freigabe ist gescheitert, jede Zeile,
 * die zu ist, zeigt nur ihr Chiffrat. Sonst ist ein Block, der zu ist, einer, der sich trotz
 * Freigabe nicht öffnen ließ — dann steht das an Stelle des Inhalts.
 */
export function listeneintraege(
  z: { offen: readonly Offen[]; zu: readonly Block[]; gesperrt: boolean },
  pruefung: Kettenzustand | null,
  zeitzone: string,
): Listeneintrag[] {
  const pz: Kettenzustand = pruefung ?? { art: "ungeprueft" };
  const basis = (b: Block) => ({
    block: b.kopf.block,
    versiegelt: zeitpunktText(b.kopf.versiegelt, zeitzone),
    hash: b.hash,
    prev: b.kopf.prev,
    knoten: knotenFuer(b.kopf.block, pz),
  });
  const offen: Listeneintrag[] = z.offen.map(({ block, einsatz: e }) => ({
    ...basis(block),
    nummer: e.nummer,
    stichwort: e.stichwort,
    ort: [e.strasse, e.ort].filter(Boolean).join(", ") || null,
    meta: [
      mitZahl(e.fahrzeuge.length, "Fahrzeug", "Fahrzeuge"),
      mitZahl(e.personal.length, "Kraft", "Kräfte"),
      mitZahl(e.vorOrt + e.transport, "Patient", "Patienten"),
    ].join(" · "),
  }));
  const zu: Listeneintrag[] = z.zu.map((b) => ({
    ...basis(b),
    nummer: null,
    stichwort: null,
    ort: null,
    ...(z.gesperrt ? { gesperrt: true, chiffre: chiffreAnschnitt(b.daten) } : { fehler: `Block ${b.kopf.block} lässt sich nicht öffnen` }),
  }));
  return [...offen, ...zu].sort((a, b) => b.block - a.block);
}

function uhrzeit(ms: number, zeitzone: string): string {
  const t = Object.fromEntries(
    new Intl.DateTimeFormat("de-DE", { timeZone: zeitzone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return `${t.hour}:${t.minute}`;
}

/** „Sitzung von Ruben Vitt, endet 11:00 Uhr“ — Text unter „Verschlüsselt“. */
export function sitzungText(sitzung: SitzungInfo, zeitzone: string): string {
  return `Sitzung von ${sitzung.name}, endet ${uhrzeit(sitzung.ablaufMs, zeitzone)} Uhr`;
}

/** Unterstes Glied der Kette, mit Tag und Person der Einrichtung, soweit bekannt. */
export function anfangText(eingerichtetAm: string | null, eingerichtetVon: string | null, zeitzone: string): string {
  const anfang = "Block 0 · Anfang der Kette";
  if (!eingerichtetAm) return anfang;
  const tag = zeitpunktText(eingerichtetAm, zeitzone).split(",")[0];
  return `${anfang} · angelegt am ${tag}${eingerichtetVon ? ` von ${eingerichtetVon}` : ""}`;
}
