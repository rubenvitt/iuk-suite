/**
 * BETRIEBSSTUNDEN VOM ZÄHLER LESEN (IDA-381) — was am Telefon getippt wird, als ganze Stunden, und ob der Stand
 * zum letzten passt. Gelesen von `StundenAmGeraet` und `PruefungAmGeraet`; ohne `"use client"` (Falle 6).
 *
 * Getippt wird, was der Zähler zeigt — oft mit einer Nachkommastelle („231,5“). Vor IDA-381 schluckte das Feld das
 * Komma (2315) oder rundete den Punkt still; jetzt gilt:
 * - Komma ist das Dezimalzeichen, wie auf deutschen Tastaturen und Zählern.
 * - Ein Punkt vor genau drei Ziffern („1.234“, „12.345.678“) trennt Tausender; vor ein oder zwei Ziffern („231.5“)
 *   ist er das Dezimalzeichen eines englisch eingestellten Telefons. Kein Stundenzähler zeigt drei Nachkommastellen,
 *   also ist „1.234“ nie 1,234 h. Kommt beides vor, trennt der Punkt Tausender („1.234,5“).
 * - Gerundet wird kaufmännisch (231,5 → 232): der Stand fließt in Stundenintervalle, und lieber eine halbe Stunde
 *   früher fällig als später.
 */
import { STUNDEN_MAX } from "./eingabe";

/**
 * Ab diesem Sprung über den letzten Stand fragt das Telefon nach, bevor es speichert. 100 h sind gut vier Tage
 * Dauerbetrieb — mehr läuft ein Gerät der Bereitschaft zwischen zwei Ablesungen kaum. Die typischen Vertipper
 * (Komma verschluckt, Ziffer doppelt, eine Null zu viel) verzehnfachen den Stand und liegen darüber, sobald er über
 * etwa 12 h liegt. Eine Rückfrage zu viel kostet einen Tipp; ein gespeicherter Vertipper nach oben ließ sich vor
 * IDA-381 nur in der Verwaltung beheben.
 */
export const STUNDEN_SPRUNG = 100;

export type StundenLesung =
  | { art: "leer" }
  | { art: "ungueltig"; fehler: string }
  | { art: "zahl"; wert: number; gerundet: boolean };

const TAUSENDER = /^\d{1,3}(\.\d{3})+$/;

/** Liest den getippten Text als ganze Stunden. Leerzeichen und ein angehängtes „h“ stören nicht. */
export function leseStunden(text: string): StundenLesung {
  let t = text.replace(/\s+/g, "").replace(/h$/i, "");
  if (t === "") return { art: "leer" };
  if (t.startsWith("-")) return { art: "ungueltig", fehler: "Nicht negativ." };
  if (t.includes(",")) {
    // „1.234,5“: Punkte trennen Tausender, und nur dann, wenn sie richtig stehen.
    const [ganz, ...rest] = t.split(",");
    if (rest.length !== 1 || (ganz.includes(".") && !TAUSENDER.test(ganz))) return ungueltig();
    t = `${ganz.replaceAll(".", "")}.${rest[0]}`;
  } else if (TAUSENDER.test(t)) {
    t = t.replaceAll(".", "");
  }
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return ungueltig();
  const roh = Number(t);
  if (!Number.isFinite(roh)) return ungueltig();
  const wert = Math.round(roh);
  if (wert > STUNDEN_MAX) return { art: "ungueltig", fehler: `Höchstens ${STUNDEN_MAX.toLocaleString("de-DE")} h.` };
  return { art: "zahl", wert, gerundet: wert !== roh };
}

const ungueltig = (): StundenLesung => ({ art: "ungueltig", fehler: "Bitte den Stand als Zahl eingeben." });

export type StundenBefund =
  | { art: "leer" }
  | { art: "ungueltig"; fehler: string }
  /** Passt: speichern ohne Rückfrage. */
  | { art: "ok"; wert: number; gerundet: boolean }
  /** Mehr als `STUNDEN_SPRUNG` über dem letzten Stand: erst nach Rückfrage. */
  | { art: "sprung"; wert: number; gerundet: boolean; plus: number }
  /** Kleiner als der letzte Stand: nur als Korrektur durch Verwaltende der Gruppe. */
  | { art: "kleiner"; wert: number; gerundet: boolean; zuletzt: number };

/** Liest den Text und vergleicht mit dem letzten Stand. */
export function pruefeStundenEingabe(text: string, zuletzt: number | null): StundenBefund {
  const l = leseStunden(text);
  if (l.art !== "zahl") return l;
  if (zuletzt !== null && l.wert < zuletzt) return { ...l, art: "kleiner", zuletzt };
  if (zuletzt !== null && l.wert - zuletzt > STUNDEN_SPRUNG) return { ...l, art: "sprung", plus: l.wert - zuletzt };
  return { ...l, art: "ok" };
}

const zahl = (n: number) => n.toLocaleString("de-DE");

/** Die Rückfrage vor einem großen Sprung. */
export const sprungFrage = (plus: number): string => `+${zahl(plus)} h seit dem letzten Stand?`;

/** Die Rückfrage vor einer Korrektur nach unten. */
export const korrekturFrage = (zuletzt: number, wert: number): string => `Stand von ${zahl(zuletzt)} h auf ${zahl(wert)} h korrigieren?`;

export const KLEINER_TEXT = (zuletzt: number): string => `Kleiner als der letzte Stand (${zahl(zuletzt)} h).`;

/** Die Statuszeile unter dem Feld. */
export function stundenZeile(b: StundenBefund, zuletzt: number | null): string | null {
  switch (b.art) {
    case "ungueltig": return b.fehler;
    case "kleiner": return KLEINER_TEXT(b.zuletzt);
    case "leer": return zuletzt !== null ? `Zuletzt ${zahl(zuletzt)} h` : null;
    default: return b.gerundet ? `Gerundet auf ${zahl(b.wert)} h` : zuletzt !== null ? `Zuletzt ${zahl(zuletzt)} h` : null;
  }
}
