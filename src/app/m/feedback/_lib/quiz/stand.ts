// Der Stand einer Runde für die Ströme, mit kurzem Zwischenspeicher, und das Melden nach einem
// Schreiben. Nur Server, kein "use client" (Falle 6, `CLAUDE.md`).
//
// EIN LESEN JE RUNDE UND AUSLÖSUNG: der Verteiler ruft bei einer Auslösung alle Hörer einer Runde
// hintereinander auf (`verteiler.ts`, `ausloesen`). Ohne Zwischenspeicher läse jeder der bis zu
// 200 Hörer dieselbe Runde selbst. So liest der erste, die übrigen bekommen denselben Stand und
// rechnen nur noch ihre eigene Sicht (`handySicht` braucht die Teilnahme der Person).
//
// Der Speicher hängt wie der Verteiler an globalThis: Route Handler können in getrennten Bündeln
// laufen, und das Verwerfen nach einem Schreiben in `antwort` muss den Speicher von `strom` treffen.
import { auditSystem } from "@/core/audit/server";
import { beendeAbgelaufene, rundenStand } from "@/app/m/feedback/_db/quiz";
import { melde } from "./verteiler";

/** Kürzer als die Bündelung (200 ms): zwischen zwei Auslösungen liest der Strom immer neu. */
export const STAND_TTL_MS = 150;
/** Ab so vielen Einträgen fegt ein Lesen die abgelaufenen hinaus. */
const FEGEN_AB = 256;
/** Kleiner Abstand hinter dem Zeitende, damit die Sicht beim Auslösen schon „Zeit um" zeigt. */
const ZEITENDE_NACHLAUF_MS = 50;

type Db = Parameters<typeof rundenStand>[0];
export type Stand = NonNullable<ReturnType<typeof rundenStand>>;
type Speicher = Map<number, { bis: number; stand: Stand | null }>;

const g = globalThis as typeof globalThis & { __iukQuizStand?: Speicher };

function speicher(): Speicher {
  return (g.__iukQuizStand ??= new Map());
}

/** Der Stand der Runde (`null`: gibt es nicht), höchstens `STAND_TTL_MS` alt. */
export function leseStand(db: Db, rundeId: number): Stand | null {
  const jetzt = Date.now();
  const s = speicher();
  const treffer = s.get(rundeId);
  if (treffer && treffer.bis > jetzt) return treffer.stand;
  const stand = rundenStand(db, rundeId);
  if (s.size >= FEGEN_AB)
    for (const [k, v] of s) if (v.bis <= jetzt) s.delete(k);
  s.set(rundeId, { bis: jetzt + STAND_TTL_MS, stand });
  return stand;
}

/**
 * Der Kanal, auf dem der Beamer eines Quiz hört. Negativ, damit er nie mit einer Runden-Kennung
 * (positiv, AUTOINCREMENT) im Verteiler zusammenfällt. Der Beamer hört auf das Quiz und nicht auf
 * eine Runde, weil sein erster Schritt die Runde erst anlegt und ein Schritt nach dem Beenden eine
 * neue (§5.3) — sein Strom wechselt dann ohne Neuverbinden.
 */
export function quizKanal(quizId: number): number {
  return -quizId;
}

/**
 * NACH JEDEM SCHREIBEN: erst den Stand verwerfen, dann melden. Andersherum könnte eine Auslösung
 * den alten Stand aus dem Speicher lesen.
 */
export function meldeRunde(runde: { id: number; quizId: number | null }): void {
  speicher().delete(runde.id);
  melde(runde.id);
  if (runde.quizId !== null) melde(quizKanal(runde.quizId));
}

/**
 * AUTO-ENDE BEIM ZUGRIFF (§5.3): beendet Abgelaufene und meldet sie, damit offene Ströme „beendet"
 * sehen. Läuft unter dem Akteur `system`, auch mitten in einer anonymen Anfrage: das Ende hat die
 * Uhr beschlossen, nicht die Person, die zufällig gerade lädt.
 */
export function holeAutoEndeNach(db: Db, jetzt: Date): number[] {
  const ids = auditSystem(() => beendeAbgelaufene(db, jetzt));
  for (const id of ids) {
    speicher().delete(id);
    meldeRunde({ id, quizId: leseStand(db, id)?.daten.runde.quizId ?? null });
  }
  return ids;
}

/**
 * „ZEIT UM" OHNE SCHREIBEN: nach Ablauf von `zeit_s` ändert sich die Sicht, aber nichts in der
 * Datenbank, also meldet auch niemand. Dieser Wecker meldet die Runde einmal kurz danach.
 */
export function planeZeitende(
  runde: { id: number; quizId: number | null },
  endetUm: number,
): void {
  const warte = Math.max(0, endetUm - Date.now()) + ZEITENDE_NACHLAUF_MS;
  const t = setTimeout(() => meldeRunde(runde), warte);
  t.unref?.();
}
