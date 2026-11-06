/**
 * WAS AN EINEM GERÄT GEPRÜFT WIRD (IDA-368) — rein, ohne Datenbank. Die Prüfarten stehen einmal im Katalog; die
 * Geräteart schaltet ihre üblichen zu, und das Gerät weicht ab: eine abgewählt, eine zusätzlich, oder ein eigenes
 * Intervall. Laden, Schreiben, Telefon und „Was steht an“ lesen ALLE diese Rechnung.
 *
 * Kein `"use client"` (Falle 6): auch das Formular im Browser rechnet hiermit.
 */
import type { FristVorlage, Wer } from "./fristen";

export interface PruefartZeile {
  id: string;
  name: string;
  wer: Wer;
  monate: number | null;
  stunden: number | null;
  position: number;
}

/** Eine Abweichung des Geräts (`geraet_pruefart`). */
export interface Abweichung {
  pruefartId: string;
  an: boolean;
  monate: number | null;
  stunden: number | null;
}

export interface PlanPunkt {
  pruefart: PruefartZeile;
  /** Die Art hat sie von sich aus. */
  standard: boolean;
  /** Gilt am Gerät (bei `standard` nicht abgewählt, sonst zusätzlich). */
  an: boolean;
  /** Eigenes Intervall statt dem des Katalogs. */
  eigenes: { monate: number | null; stunden: number | null } | null;
  /** Wie sie am Gerät gilt; `null`, wenn sie dort nicht gilt. */
  vorlage: FristVorlage | null;
}

const hatEigenes = (a: Abweichung | undefined): a is Abweichung => !!a && (a.monate !== null || a.stunden !== null);

/**
 * Alle Prüfarten, die das Gerät betreffen — die der Art (auch abgewählte) und die zusätzlichen — in der Reihenfolge
 * des Katalogs. Was nicht gilt, hat `vorlage: null`.
 */
export function pruefplan(
  katalog: readonly PruefartZeile[],
  standard: ReadonlySet<string> | readonly string[],
  abweichungen: readonly Abweichung[],
): PlanPunkt[] {
  const std = standard instanceof Set ? standard : new Set(standard as readonly string[]);
  const ab = new Map(abweichungen.map((a) => [a.pruefartId, a]));
  return [...katalog]
    .sort((x, y) => x.position - y.position || x.name.localeCompare(y.name, "de"))
    .filter((p) => std.has(p.id) || ab.get(p.id)?.an)
    .map((p) => {
      const a = ab.get(p.id);
      const an = a ? a.an : std.has(p.id);
      const eigenes = an && hatEigenes(a) ? { monate: a.monate, stunden: a.stunden } : null;
      const vorlage: FristVorlage | null = an
        ? { id: p.id, name: p.name, wer: p.wer, monate: eigenes ? eigenes.monate : p.monate, stunden: eigenes ? eigenes.stunden : p.stunden }
        : null;
      return { pruefart: p, standard: std.has(p.id), an, eigenes, vorlage };
    });
}

/** Nur was gilt — die Vorlagen für die Fristrechnung. */
export function geltende(plan: readonly PlanPunkt[]): FristVorlage[] {
  return plan.flatMap((p) => (p.vorlage ? [p.vorlage] : []));
}

/** Die Prüfung am Gerät per QR: die erste geltende, die man selbst erledigt. */
export function selbstPruefung(plan: readonly PlanPunkt[]): FristVorlage | null {
  return geltende(plan).find((v) => v.wer === "intern") ?? null;
}
