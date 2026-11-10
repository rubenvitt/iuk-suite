/**
 * „WAS STEHT AN" AUF DER VERWALTUNGSÜBERSICHT (IDA-380) — offene Mängel, Geräte mit Frist,
 * Sauerstoff zum Wechseln und Checks mit Befund, ohne einen Klick.
 *
 * ⚠️ HIER WIRD NICHTS NEU GERECHNET, dieselbe Regel wie in `faelligkeiten.ts`: jede Zahl kommt aus
 * dem Lesepfad, den die Seite derselben Sache benutzt (`offeneMaengel` → Mängel, `geraeteUebersicht`
 * → Geräte, `o2FlaschenUebersicht` → Sauerstoff, `checkHistorie` → Checks). Eine zweite Rechnung
 * liefe auseinander, und dann zeigte die Kachel etwas, das die Seite einen Klick weiter nicht zeigt.
 *
 * Die Bedingungen sind die der Zielseiten:
 *   * Geräte: aktiv, mit gepflegtem Datum, Ampel nicht grün — wie die Kacheln auf `/verwaltung/geraete`
 *     („MTK fällig/bald", „MTK überfällig", „Objekte ablaufend"). Ein Gerät ohne Datum ist eine
 *     Pflegelücke und keine Frist.
 *   * Sauerstoff: aktiv und `status?.wechseln` — wie „Wechsel fällig" auf `/verwaltung/sauerstoff`.
 *     Eine Flasche ohne Messung zählt nicht.
 *   * Checks: abgeschlossen in den letzten `CHECK_BEFUND_TAGE` Tagen, mit einem der Befunde, die die
 *     Check-Historie als Warnung färbt (fehlt weiterhin, Gerät auffällig, Flasche wechseln, Plombe
 *     offen) oder unlesbar. Ein Nachfüllen oder eine Korrektur ist Arbeit, kein Befund.
 *
 * KEIN "use client": gelesen von der Übersicht, einer Server Component (Falle 6). Alles, was
 * herausgeht, sind Zeichenketten und Zahlen.
 */
import type { DB } from "../_db/client";
import { mangelKurz } from "./faelligkeiten";
import type { AmpelTon } from "./format";
import { checkHistorie } from "./lesepfade/checks";
import { geraeteUebersicht } from "./lesepfade/geraete";
import { o2FlaschenUebersicht } from "./lesepfade/o2";
import { offeneMaengel } from "./maengel/daten";
import { verwaltungDetailPfad } from "./verwaltungPfad";

/** Wie weit „Checks mit Befund" zurückschaut. Älteres ist Historie, kein Anstehen. */
export const CHECK_BEFUND_TAGE = 14;

export type AnstehendZeile = {
  /** Eindeutig über alle Arten. */
  id: string;
  art: "Mangel" | "Gerät" | "Sauerstoff";
  titel: string;
  wo: string;
  /** Text des Chips: „überfällig", „MTK in 12 T", „noch 18 %, wechseln". */
  zustand: string;
  ton: AmpelTon;
  href: string;
};

export type Anstehend = {
  /** Dringendes zuerst (rot vor gelb), innerhalb der Ampel Mängel, Geräte, Sauerstoff. */
  zeilen: AnstehendZeile[];
  maengel: number;
  geraeteUeberfaellig: number;
  /** Fällig oder bald fällig, ohne die überfälligen. */
  geraeteBald: number;
  flaschenWechseln: number;
  checksMitBefund: number;
};

export function anstehend(db: DB, jetzt: Date): Anstehend {
  const maengel = offeneMaengel(db).map((m): AnstehendZeile => ({
    id: `mangel:${m.id}`,
    art: "Mangel",
    titel: mangelKurz(m),
    wo: m.ort,
    zustand: "gemeldet, offen",
    ton: "rot",
    href: "/verwaltung/maengel",
  }));

  const geraete = geraeteUebersicht(db, jetzt)
    .filter((g) => g.aktiv && !g.faelligkeit.keinDatum && g.faelligkeit.ampel !== "gruen" && g.chip !== null)
    .map((g): AnstehendZeile & { ueberfaellig: boolean } => ({
      id: `geraet:${g.id}`,
      art: "Gerät",
      titel: g.name,
      wo: g.lagerortName,
      zustand: g.chip!.text,
      ton: g.chip!.ton,
      href: verwaltungDetailPfad("geraete", g.id),
      ueberfaellig: g.faelligkeit.ueberfaellig,
    }));

  const flaschen = o2FlaschenUebersicht(db)
    .filter((f) => f.aktiv && f.status?.wechseln)
    .map((f): AnstehendZeile => ({
      id: `o2:${f.id}`,
      art: "Sauerstoff",
      titel: `Flasche ${f.name}`,
      wo: f.lagerortName,
      zustand: `noch ${f.status!.prozent} %, wechseln`,
      ton: "rot",
      href: verwaltungDetailPfad("sauerstoff", f.id),
    }));

  const seit = new Date(jetzt.getTime() - CHECK_BEFUND_TAGE * 86_400_000);
  const checksMitBefund = checkHistorie(db, { von: seit }).zeilen.filter((c) =>
    c.completedAt !== null
    && (c.unlesbar || c.offen > 0 || c.geraeteAuffaellig > 0 || c.flaschenAuffaellig > 0 || c.plombenOffen > 0),
  ).length;

  const rang = (z: AnstehendZeile) => (z.ton === "rot" ? 0 : 1);
  const geraeteZeilen = geraete.map((g): AnstehendZeile => ({
    id: g.id, art: g.art, titel: g.titel, wo: g.wo, zustand: g.zustand, ton: g.ton, href: g.href,
  }));
  const zeilen = [...maengel, ...geraeteZeilen, ...flaschen]
    // `sort` ist stabil: innerhalb gleicher Ampel bleibt die Reihenfolge der Arten oben stehen.
    .sort((a, b) => rang(a) - rang(b));

  return {
    zeilen,
    maengel: maengel.length,
    geraeteUeberfaellig: geraete.filter((g) => g.ueberfaellig).length,
    geraeteBald: geraete.filter((g) => !g.ueberfaellig).length,
    flaschenWechseln: flaschen.length,
    checksMitBefund,
  };
}
