/**
 * Die Aufbereitung EINER Journalzeile: Vorzeichen, Zustandsname, Typtext.
 * Kein "use client", kein Datenbankzugriff, KEIN Hexwert.
 *
 * WAS DIESE ACHT ZEILEN ERSETZEN (§12.1, Punkt 4): `verwaltung-flow.spec.ts:67`
 * greift heute `.jdelta.minus` — eine Zusicherung an einer EIGENEN CSS-Klasse, die
 * den antd-Umbau sicher nicht ueberlebt. Der Ersatz ist zweiteilig: Unit (hier)
 * liefert Vorzeichen und Zustandsnamen, DOM (Teil 5) prueft, dass die Zeile beides
 * rendert.
 *
 * ⚠️ KEIN HEXWERT UND KEIN KLASSENNAME. Ob Rot auf dieser Datenflaeche bleiben
 * darf, entscheidet Entscheidung 30 (§6.6.2). Diese Datei liefert einen
 * ZUSTANDSNAMEN; wie er aussieht, entscheidet Teil 5.
 */
import { typLabel } from "./format";

export type JournalZustand = "negativ" | "positiv" | "neutral";

export type JournalDarstellung = {
  /** ASCII-Vorzeichen (Festlegung H6): "+5", "-3", "0". KEIN U+2212 — ein
   *  typografisches Minus ist genau die Klasse, an der ein Selektor unsichtbar
   *  scheitert (§12.3). */
  mengeText: string;
  /** Haengt am VORZEICHEN, nicht am Typ: eine Korrektur geht in beide Richtungen,
   *  und eine Umlagerung erzeugt zwei Legs mit entgegengesetztem Vorzeichen (I3). */
  zustand: JournalZustand;
  typText: string;
};

export function journalZeile(b: { typ: string; menge: number }): JournalDarstellung {
  const zustand: JournalZustand = b.menge < 0 ? "negativ" : b.menge > 0 ? "positiv" : "neutral";
  const mengeText = b.menge > 0 ? `+${b.menge}` : String(b.menge);
  return { mengeText, zustand, typText: typLabel(b.typ) };
}
