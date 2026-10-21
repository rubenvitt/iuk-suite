/**
 * IDA-261 — DER ZEITRAUM DER STATISTIK: wie viele Monate, und wo sie beginnen.
 *
 * KEIN "use client" (Falle 6): die Seite liest `ZEITRAEUME` als Wert, die
 * Client-Insel bekommt ihn nur als Prop.
 *
 * ⚠️ MONATE IN DER SUITE-ZONE, nicht in UTC. Eine Entnahme am 31.10. um 23:30
 * Berliner Zeit ist in UTC schon der 1.11. — gezaehlt wuerde sie im falschen
 * Monat, und genau an Monatsenden (Abrechnung, Bestellrunde) schaut jemand hin.
 * Die Grenzen kommen deshalb aus `ausZivilzeit` (`_lib/zeit.ts`), die Schluessel
 * aus `zeitFormat` je Aufruf (CLAUDE.md, Abschnitt Zeitzone).
 */
import { zeitFormat } from "@/core/zeit";
import { ausZivilzeit } from "../zeit";

/** Die waehlbaren Zeitraeume in Monaten. Der erste Monat ist der laufende. */
export const ZEITRAEUME = [3, 6, 12, 24] as const;
export type Zeitraum = (typeof ZEITRAEUME)[number];
export const ZEITRAUM_VORGABE: Zeitraum = 12;

/** Liest `?monate=` tolerant: alles Unbekannte faellt auf die Vorgabe. */
export function zeitraumAus(roh: string | string[] | undefined): Zeitraum {
  const wert = Number(Array.isArray(roh) ? roh[0] : roh);
  return (ZEITRAEUME as readonly number[]).includes(wert) ? (wert as Zeitraum) : ZEITRAUM_VORGABE;
}

export type Monat = {
  /** "YYYY-MM" — stabiler Schluessel und Sortierwert. */
  schluessel: string;
  /** "Okt 26" — die Achsenbeschriftung. */
  label: string;
};

const JAHR_MONAT = zeitFormat("en-CA", { year: "numeric", month: "2-digit" });

const MONATSNAMEN = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function jahrMonat(d: Date): { jahr: number; monat: number } {
  const teile = Object.fromEntries(JAHR_MONAT.formatToParts(d).map((t) => [t.type, t.value]));
  return { jahr: Number(teile.year), monat: Number(teile.month) };
}

/** Verschiebt (jahr, monat) um `delta` Monate; Monat 1–12. */
function verschiebe(jahr: number, monat: number, delta: number): { jahr: number; monat: number } {
  const index = jahr * 12 + (monat - 1) + delta;
  return { jahr: Math.floor(index / 12), monat: (index % 12) + 1 };
}

function monatVon(jahr: number, monat: number): Monat {
  return {
    schluessel: `${jahr}-${String(monat).padStart(2, "0")}`,
    label: `${MONATSNAMEN[monat - 1]} ${String(jahr).slice(2)}`,
  };
}

export type Monatsraster = {
  monate: Monat[];
  /**
   * `monate.length + 1` Zeitpunkte: Beginn jedes Monats und zuletzt der Beginn
   * des Folgemonats. Monat `i` umfasst `[grenzen[i], grenzen[i + 1])`.
   */
  grenzen: Date[];
};

/**
 * Die `anzahl` Monate bis einschliesslich des laufenden (rueckwaerts) bzw. ab
 * dem laufenden (`richtung: "vor"`, die Verfallsvorschau).
 */
export function monatsraster(
  jetzt: Date, anzahl: number, richtung: "zurueck" | "vor" = "zurueck",
): Monatsraster {
  const heute = jahrMonat(jetzt);
  const start = richtung === "zurueck" ? verschiebe(heute.jahr, heute.monat, -(anzahl - 1)) : heute;
  const monate: Monat[] = [];
  const grenzen: Date[] = [];
  for (let i = 0; i <= anzahl; i++) {
    const m = verschiebe(start.jahr, start.monat, i);
    grenzen.push(ausZivilzeit(m.jahr, m.monat, 1));
    if (i < anzahl) monate.push(monatVon(m.jahr, m.monat));
  }
  return { monate, grenzen };
}
