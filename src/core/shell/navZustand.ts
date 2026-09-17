/**
 * WELCHE ABSCHNITTE SIND ZUGEKLAPPT — je Modul, ueber Seitenwechsel hinweg.
 *
 * Ein eigener, winziger Speicher statt `useState`, und der Grund ist die
 * Bauform der Shell: die Modulnavigation steht ZWEIMAL im Baum — als
 * Seitenleiste (`Modulleiste`) und als Drawer (`SuiteNav`). Welche man sieht,
 * entscheidet CSS, gerendert werden immer beide. Mit zwei getrennten
 * Komponentenzustaenden liefe die eine Fassung der anderen davon: wer im
 * Drawer einen Abschnitt zuklappt und das Fenster breiter zieht, saehe ihn
 * offen. Ein gemeinsamer Speicher haelt beide auf demselben Stand.
 *
 * KEIN "use client": diese Datei enthaelt keine Komponente und keinen Hook,
 * nur Funktionen. Sie wird ausschlieszlich von Client-Komponenten gerufen —
 * ein `"use client"` hier wuerde nichts verbessern und die Werte fuer eine
 * kuenftige Server-Lesung unbrauchbar machen (Falle 6).
 *
 * ⚠️ `localStorage` KANN WERFEN UND KANN LEER ZURUECKKOMMEN — im privaten
 * Fenster, bei gesperrten Website-Daten, in einer Vorschau. Jeder Zugriff hier
 * steht deshalb in `try`/`catch`, und der Ausfall ist harmlos: ohne
 * gespeicherten Stand sind alle Abschnitte offen, also genau das Bild von vor
 * dieser Aenderung.
 */

const PRAEFIX = "iuk-nav-zu:";

/**
 * Der Schnappschuss fuer den SERVER — und zugleich der Rueckfall fuer jeden
 * Fehlerfall. Eine leere Liste heiszt „nichts zugeklappt".
 *
 * ⚠️ ER MUSS EINE KONSTANTE SEIN, kein frisch gebautes `[]`: `useSyncExternal
 * Store` vergleicht Schnappschuesse mit `Object.is` und liefe mit einem neuen
 * Objekt je Aufruf in eine Endlosschleife. Deshalb ist der Schnappschuss
 * ueberhaupt eine ZEICHENKETTE (der rohe JSON-Text) und nicht die Menge: zwei
 * gleiche Zeichenketten sind `Object.is`-gleich, zwei gleiche `Set` nicht.
 */
export const KEINE_ZUGEKLAPPT = "[]";

const hoerer = new Set<() => void>();

/**
 * Der zuletzt gelesene Rohwert je Modul. Ohne ihn laese `useSyncExternalStore`
 * bei JEDEM Render aus `localStorage` — synchron, und damit auf dem Hauptfaden.
 */
const zwischenspeicher = new Map<string, string>();

function schluessel(modulKey: string): string {
  return `${PRAEFIX}${modulKey}`;
}

/** Der rohe, gespeicherte JSON-Text — nie `null`, nie ein Wurf. */
export function liesZugeklappt(modulKey: string): string {
  const k = schluessel(modulKey);
  const gemerkt = zwischenspeicher.get(k);
  if (gemerkt !== undefined) return gemerkt;
  let roh = KEINE_ZUGEKLAPPT;
  try {
    roh = globalThis.localStorage?.getItem(k) ?? KEINE_ZUGEKLAPPT;
  } catch {
    roh = KEINE_ZUGEKLAPPT;
  }
  zwischenspeicher.set(k, roh);
  return roh;
}

/**
 * Rohtext → Titel. Alles, was nicht wie erwartet aussieht, ergibt eine leere
 * Liste: ein von Hand verbogener Eintrag im Speicher darf die Navigation nicht
 * ausfallen lassen.
 */
export function entpacke(roh: string): string[] {
  try {
    const wert: unknown = JSON.parse(roh);
    return Array.isArray(wert) ? wert.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

export function schreibeZugeklappt(modulKey: string, titel: readonly string[]): void {
  const k = schluessel(modulKey);
  // Sortiert, damit derselbe Stand denselben Text ergibt — sonst meldete der
  // Vergleich eine Aenderung, wo keine ist, und `useSyncExternalStore` renderte
  // ohne Grund neu.
  const roh = JSON.stringify([...titel].sort());
  if (zwischenspeicher.get(k) === roh) return;
  zwischenspeicher.set(k, roh);
  try {
    globalThis.localStorage?.setItem(k, roh);
  } catch {
    // Kein Speicher, kein Drama: der Stand haelt fuer diese Sitzung im
    // Zwischenspeicher und ist nach dem naechsten Laden wieder offen.
  }
  // ⚠️ EIGENE BENACHRICHTIGUNG, weil `storage` im SCHREIBENDEN Tab NICHT
  // feuert (HTML Standard, §storage event). Ohne diese Schleife saehe die
  // zweite Fassung der Navigation die Aenderung erst beim naechsten Render aus
  // anderem Grund — also scheinbar gar nicht.
  for (const rueckruf of [...hoerer]) rueckruf();
}

/**
 * ⚠️ MODULEBENE UND NICHT IN DER KOMPONENTE: `useSyncExternalStore` meldet sich
 * bei jeder neuen `subscribe`-Referenz ab und wieder an. Eine bei jedem Render
 * erzeugte Funktion ergaebe eine Endlosschleife von An- und Abmeldungen.
 */
export function abonniereZugeklappt(rueckruf: () => void): () => void {
  hoerer.add(rueckruf);
  const ausAnderemTab = (ereignis: StorageEvent) => {
    if (ereignis.key === null || ereignis.key.startsWith(PRAEFIX)) {
      zwischenspeicher.clear();
      rueckruf();
    }
  };
  globalThis.addEventListener?.("storage", ausAnderemTab);
  return () => {
    hoerer.delete(rueckruf);
    globalThis.removeEventListener?.("storage", ausAnderemTab);
  };
}

/** Nur fuer Tests: den Prozesszustand zuruecksetzen. */
export function vergissZugeklappt(): void {
  zwischenspeicher.clear();
}
