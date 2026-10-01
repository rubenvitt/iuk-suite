import type { PlanInhalt } from "../../_lib/plan/schema";

/**
 * Stellen, Einheiten und Verbindungen teilen einen ID-Namensraum (Kopfkommentar `_lib/plan/schema.ts`).
 *
 * ⚠️ NICHT `crypto.randomUUID()`: das gibt es nur in einem sicheren Kontext. Lokal und in der e2e
 * läuft die Suite über `http://kommplan.localtest.me:<port>` — Chromium hält nur `localhost`,
 * `*.localhost` und Loopback-IPs über http für vertrauenswürdig, `isSecureContext` ist dort `false`
 * und jedes Einfügen würfe. jsdom hat `randomUUID`, Vitest sähe das nie. `getRandomValues` gibt es
 * auch ohne sicheren Kontext.
 */
function vergeben(inhalt: PlanInhalt): Set<string> {
  return new Set([...inhalt.stellen.flatMap((s) => [s.id, ...s.einheiten.map((e) => e.id)]), ...inhalt.verbindungen.map((v) => v.id)]);
}

const ZEICHEN = "abcdefghijklmnopqrstuvwxyz0123456789";
const ZUFALL = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ZEICHEN[b % ZEICHEN.length]).join("");

export function neueIds(inhalt: PlanInhalt, praefix: "s" | "e" | "v", anzahl: number, zufall: () => string = ZUFALL): string[] {
  const belegt = vergeben(inhalt);
  const aus: string[] = [];
  while (aus.length < anzahl) {
    const id = `${praefix}-${zufall()}`;
    if (!belegt.has(id)) { belegt.add(id); aus.push(id); }
  }
  return aus;
}

export function neueId(inhalt: PlanInhalt, praefix: "s" | "e" | "v", zufall: () => string = ZUFALL): string {
  return neueIds(inhalt, praefix, 1, zufall)[0];
}
