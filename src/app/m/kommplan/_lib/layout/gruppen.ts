import type { Stelle } from "../plan/schema";
import { LINIEN_LUFT } from "./kontur";
import { ABSTAND, BLATT, MIN_MASSSTAB, PAPIER } from "./masse";
import type { Ziel } from "./typen";

/** Schlüssel der Gruppe „ohne Verbindung" — `~` ist in IDs nicht erlaubt, kollidiert also nie. */
export const OHNE_VERBINDUNG = "~";

export interface Gruppe { schluessel: string; verbindungId: string | null; kinder: Stelle[]; reihen: Stelle[][] }

const EPS = 1e-6;
/** Die neue Grenze einer schrumpfenden Gruppe liegt so weit unter ihrer heute breitesten Reihe. */
const SCHRITT = 1e-3;

/**
 * Spec §5.5: das Breitenbudget einer Kinderreihe folgt aus dem Zielformat bei Mindestmaßstab;
 * der Bildschirm nimmt das Budget von A3.
 */
export function budgetFuer(ziel: Ziel): number {
  const format = ziel === "bildschirm" ? "a3-quer" : ziel;
  return (PAPIER[format].breite - 2 * BLATT.randX) / MIN_MASSSTAB;
}

export function reihenBreite<T>(reihe: readonly T[], breite: (k: T) => number): number {
  return reihe.reduce((s, k) => s + breite(k), 0) + Math.max(0, reihe.length - 1) * ABSTAND.geschwister;
}

/** Gierig nach Breite: eine neue Reihe, sobald `grenze` überschritten wäre; jede Reihe trägt mindestens ein Kind. */
export function reihenNachBreite<T>(kinder: readonly T[], breite: (k: T) => number, grenze: number, luecke: number = ABSTAND.geschwister): T[][] {
  const reihen: T[][] = [];
  let aktuell: T[] = [];
  let b = 0;
  for (const k of kinder) {
    const w = breite(k);
    const mit = aktuell.length === 0 ? w : b + luecke + w;
    if (aktuell.length > 0 && mit > grenze + EPS) { reihen.push(aktuell); aktuell = [k]; b = w; }
    else { aktuell.push(k); b = mit; }
  }
  if (aktuell.length > 0) reihen.push(aktuell);
  return reihen;
}

/** Breite einer Gruppe: ihre breiteste Reihe; bricht sie um, dazu der Kammrücken links samt Linienluft. */
export function gruppenBreite<T>(reihen: readonly (readonly T[])[], breite: (k: T) => number): number {
  const max = Math.max(0, ...reihen.map((r) => reihenBreite(r, breite)));
  return reihen.length > 1 ? max + ABSTAND.kammEinzug + LINIEN_LUFT / 2 : max;
}

function teile(kinder: readonly Stelle[]): Omit<Gruppe, "reihen">[] {
  const nachSchluessel = new Map<string, Stelle[]>();
  for (const k of kinder) {
    const s = k.verbindungId ?? OHNE_VERBINDUNG;
    nachSchluessel.set(s, [...(nachSchluessel.get(s) ?? []), k]);
  }
  return [...nachSchluessel].map(([schluessel, ks]) => ({
    schluessel, verbindungId: schluessel === OHNE_VERBINDUNG ? null : schluessel, kinder: ks,
  }));
}

/**
 * DER KAMM (Spec §5.5, Abweichung 13) — über die GANZE Kinderreihe einer Stelle, gemessen in Breite.
 *
 * 1. Jede Gruppe steht einreihig; passen alle Gruppen samt Gruppenabständen ins Budget, fertig.
 * 2. Sonst schrumpft die breiteste kämmbare Gruppe (Gleichstand → die frühere): ihre neue Grenze
 *    liegt knapp unter ihrer heute breitesten Reihe, und ihre Kinder brechen gierig nach Breite um.
 *    Das wiederholt sich, bis alles passt oder keine Gruppe mehr schrumpfen kann.
 *
 * Jede Gruppe bleibt zusammenhängend unter IHREM Bus („unter demselben Bus") und steht neben den
 * anderen — so bleibt der Stielbeweis aus Task 9 gültig. Eine Gruppe über mehrere Reihen VERSCHIEDENER
 * Gruppen zu verteilen hieße, Stiele durch fremde Reihen zu führen.
 *
 * Kämmbar ist eine Gruppe nur, wenn keines ihrer Kinder sichtbare Unterstellen hat (`kammfaehig`):
 * eine Kammreihe unter Teilbäumen stünde auf der Höhe fremder Enkel (§5.2). Eingeklappte Kinder und
 * Verweiskarten zählen als Blätter — die Sicht entscheidet, also wird nach jedem Schnitt neu gerechnet.
 *
 * ENDLICH: ein Schritt macht die breiteste Reihe der gewählten Gruppe echt schmaler — ein einzelnes
 * Kind, das allein breiter ist als die Grenze, steht allein und war vorher Teil einer breiteren
 * Reihe. Ist die breiteste Reihe schon ein einzelnes Kind, ist die Gruppe fest. Die möglichen
 * Reihenbreiten sind endlich. DETERMINISTISCH: nur Kinderfolge, Breiten und Budget gehen ein.
 */
export function bildeGruppen(
  kinder: readonly Stelle[], breite: (s: Stelle) => number, budget: number, kammfaehig: (s: Stelle) => boolean,
): Gruppe[] {
  const roh = teile(kinder);
  const reihen: Stelle[][][] = roh.map((g) => [g.kinder]);
  const fest = roh.map((g) => g.kinder.length < 2 || !g.kinder.every(kammfaehig));
  const gesamt = () =>
    reihen.reduce((s, r) => s + gruppenBreite(r, breite), 0) + Math.max(0, roh.length - 1) * ABSTAND.gruppen;
  while (gesamt() > budget + EPS) {
    let wahl = -1;
    for (let i = 0; i < roh.length; i++) {
      if (fest[i]) continue;
      if (wahl < 0 || gruppenBreite(reihen[i], breite) > gruppenBreite(reihen[wahl], breite) + EPS) wahl = i;
    }
    if (wahl < 0) break;
    const breiteste = Math.max(...reihen[wahl].map((r) => reihenBreite(r, breite)));
    if (reihen[wahl].some((r) => r.length === 1 && reihenBreite(r, breite) >= breiteste - EPS)) { fest[wahl] = true; continue; }
    reihen[wahl] = reihenNachBreite(roh[wahl].kinder, breite, breiteste - SCHRITT);
  }
  return roh.map((g, i) => ({ ...g, reihen: reihen[i] }));
}

export function gruppenAnzahl(kinder: readonly Stelle[]): number {
  return new Set(kinder.map((k) => k.verbindungId ?? OHNE_VERBINDUNG)).size;
}

export function anzeigereihenfolge(kinder: readonly Stelle[]): Stelle[] {
  return teile(kinder).flatMap((g) => g.kinder);
}
