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
import { beendeAbgelaufeneRunden, rundenStand } from "@/app/m/feedback/_db/quiz";
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

const g = globalThis as typeof globalThis & {
  __iukQuizStand?: Speicher;
  __iukQuizZeitende?: Map<number, ReturnType<typeof setTimeout>>;
};

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
 *
 * Jeder Quizweg ruft es GENAU EINMAL, VOR dem Lesen: `offeneRundePerCode` und `starteOderHoleRunde`
 * holen es nicht selbst nach (`autoEnde.wege.test.ts`).
 */
export function holeAutoEndeNach(db: Db, jetzt: Date): number[] {
  // Die Quiz-Kennung kommt aus derselben Abfrage, kein zweites Lesen je Runde.
  const runden = auditSystem(() => beendeAbgelaufeneRunden(db, jetzt));
  for (const runde of runden) meldeRunde(runde);
  return runden.map((r) => r.id);
}

/**
 * „ZEIT UM" OHNE SCHREIBEN: nach Ablauf von `zeit_s` ändert sich die Sicht, aber nichts in der
 * Datenbank, also meldet auch niemand. Dieser Wecker meldet die Runde einmal kurz danach.
 *
 * EIN WECKER JE RUNDE: ein neuer ersetzt den alten (der Beamer blättert, zwei Tabs senden
 * denselben Schritt). Die Liste hängt an globalThis wie der Stand, damit `schritt` aus jedem
 * Bündel denselben Wecker trifft.
 */
export function planeZeitende(
  runde: { id: number; quizId: number | null },
  endetUm: number,
): void {
  const wecker = (g.__iukQuizZeitende ??= new Map());
  clearTimeout(wecker.get(runde.id));
  const warte = Math.max(0, endetUm - Date.now()) + ZEITENDE_NACHLAUF_MS;
  const t = setTimeout(() => {
    if (wecker.get(runde.id) === t) wecker.delete(runde.id);
    meldeRunde(runde);
  }, warte);
  t.unref?.();
  wecker.set(runde.id, t);
}
