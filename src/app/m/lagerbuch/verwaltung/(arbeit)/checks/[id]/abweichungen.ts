import type {
  AbgleichAnzeigeZeile,
  FlascheAnzeigeZeile,
  GeraetAnzeigeZeile,
  NachfuellAnzeigeZeile,
  VerfallAnzeigeZeile,
} from "./CheckDetailTabellen";

/**
 * IDA-236 — WAS AUF DER CHECK-DETAILSEITE ALS ABWEICHUNG ZÄHLT, und welche
 * Abschnitte die Adresse ganz aufgeklappt nennt.
 *
 * ⚠️ KEIN `"use client"` (Falle 6, `CLAUDE.md`): `page.tsx` ist eine Server
 * Component und liest `alleAusAdresse` von hier. Aus der Client-Insel kämen die
 * Werte dort als Client-Referenz an — HTTP 500, das Vitest nicht sieht.
 *
 * DIE REGEL: eine Zeile weicht ab, wenn sie jemand ansehen sollte. Wo ein Chip
 * die Ampel trägt, ist das alles außer Grün („ok") — auch Grau, denn „nicht
 * gemessen" und „nicht erfasst" sind Lücken im Nachweis, keine Entwarnung.
 */
export const ABSCHNITTE = ["abgleich", "nachfuellung", "geraete", "sauerstoff", "verfall"] as const;
export type AbschnittSchluessel = (typeof ABSCHNITTE)[number];

/** Der Adressparameter, der die ganz gezeigten Abschnitte trägt (`?alle=abgleich,geraete`). */
export const ALLE_PARAMETER = "alle";

/**
 * Abgleich: jede Zeile, an der der Bestand nicht einfach stimmte — es fehlte
 * etwas (nachgefüllt oder weiter offen), es lag mehr da als Soll, oder der
 * gebuchte Bestand wurde korrigiert. Allein `offenZahl` hieße: ein Artikel, der
 * beim Check aufgefüllt wurde, verschwände aus der Sicht, obwohl genau er die
 * Kachel „nachgefüllt" füllt.
 */
export function abgleichWeichtAb(zeile: AbgleichAnzeigeZeile): boolean {
  return zeile.istZahl !== zeile.sollZahl
    || zeile.korrekturZahl !== 0
    || zeile.nachgefuelltZahl > 0
    || zeile.offenZahl > 0;
}

/**
 * Nachfüllung je Fach: die Fächer mit Lücke und die mit zu viel — dieselben
 * Grenzen wie der Chip der Spalte („n fehlten", „n zu viel"). Seit IDA-247
 * schlägt der Check den Überbestand für die Entnahmebox vor; er gehört damit
 * hierher und nicht mehr nur in den Abgleich. Was innerhalb von „OK bis"
 * liegt, weicht nicht ab.
 */
export function nachfuellungWeichtAb(zeile: NachfuellAnzeigeZeile): boolean {
  return zeile.lueckeZahl > 0 || zeile.zuVielZahl > 0;
}

/** Geräte: fehlt, oder der Zustand ist nicht „In Ordnung" (auch „nicht erfasst"). */
export function geraetWeichtAb(zeile: GeraetAnzeigeZeile): boolean {
  return zeile.vorhandenChip.ton !== "ok" || zeile.zustandChip.ton !== "ok";
}

/** Sauerstoff: unter der Wechselschwelle, knapp darüber, ungemessen oder unbewertbar. */
export function flascheWeichtAb(zeile: FlascheAnzeigeZeile): boolean {
  return zeile.fuellstandChip.ton !== "ok";
}

/** Verfall: abgelaufen, läuft bald ab oder ist fällig — gegen heute gerechnet. */
export function verfallWeichtAb(zeile: VerfallAnzeigeZeile): boolean {
  return zeile.statusChip.ton !== "ok";
}

/**
 * Liest `?alle=` tolerant: unbekannte Namen fallen weg, Doppelte auch, die
 * Reihenfolge ist die der Seite. Ein Lesezeichen aus einer älteren Fassung
 * darf die Seite nicht kaputt machen.
 */
export function alleAusAdresse(wert: string | string[] | undefined): AbschnittSchluessel[] {
  const roh = (Array.isArray(wert) ? wert : [wert ?? ""])
    .flatMap((teil) => teil.split(","))
    .map((teil) => teil.trim());
  return ABSCHNITTE.filter((schluessel) => roh.includes(schluessel));
}

/**
 * Die Adresse mit dem neuen Stand — `null`, wenn sie schon stimmt.
 * Das Komma bleibt lesbar stehen (`URLSearchParams` schriebe `%2C`).
 */
export function adresseMitAlle(
  href: string,
  alle: ReadonlySet<AbschnittSchluessel>,
): string | null {
  const adresse = new URL(href);
  const wert = ABSCHNITTE.filter((schluessel) => alle.has(schluessel)).join(",");
  if ((adresse.searchParams.get(ALLE_PARAMETER) ?? "") === wert) return null;
  if (wert) adresse.searchParams.set(ALLE_PARAMETER, wert);
  else adresse.searchParams.delete(ALLE_PARAMETER);
  adresse.search = adresse.search.replace(/%2C/gi, ",");
  return adresse.toString();
}
