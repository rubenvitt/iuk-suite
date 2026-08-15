import { eq } from "drizzle-orm";

import { getDb } from "@/core/konto/_db/client";
import { sitzungWiderruf } from "@/core/konto/_db/schema";

/**
 * „Ist diese Sitzung widerrufen?" — die Frage, die der `jwt`-Callback bei JEDER
 * Anfrage stellt.
 *
 * Ein `SELECT` ueber den Primaerschluessel, better-sqlite3, synchron: im
 * einstelligen Mikrosekundenbereich. BEWUSST OHNE ZWISCHENSPEICHER — er braechte
 * hier nichts Messbares und traete die Zusage „gilt sofort" wieder los, sobald
 * es je einen zweiten Prozess gibt.
 *
 * Ohne `sub` gibt es nichts zu vergleichen: dann `false`. Fail-closed waere hier
 * falsch — es wuerde jede Sitzung ohne Kennung abschieszen, statt die eine
 * widerrufene zu treffen.
 */
export function istWiderrufen(
  sub: string | undefined,
  angemeldetSeit: number | undefined,
): boolean {
  if (!sub) return false;

  const zeile = getDb()
    .select({ widerrufenAb: sitzungWiderruf.widerrufenAb })
    .from(sitzungWiderruf)
    .where(eq(sitzungWiderruf.sub, sub))
    .get();

  if (!zeile) return false;

  // Fehlendes `angemeldetSeit` gilt als 0 — Bestandstokens tragen das Feld
  // nicht und sind nach einem Widerruf tot. Gleichstand gilt als gueltig, siehe
  // den Grenzfall in `widerruf.test.ts`.
  return (angemeldetSeit ?? 0) < zeile.widerrufenAb;
}

/**
 * Zieht die Grenze neu. `jetztSekunden` ist nur fuer Tests da; im Betrieb
 * gewinnt immer die Gegenwart.
 */
export function widerrufeAlleSitzungen(sub: string, jetztSekunden?: number): void {
  const ab = jetztSekunden ?? Math.floor(Date.now() / 1000);
  const jetzt = new Date();
  getDb()
    .insert(sitzungWiderruf)
    .values({ sub, widerrufenAb: ab, aktualisiertAm: jetzt })
    .onConflictDoUpdate({
      target: sitzungWiderruf.sub,
      set: { widerrufenAb: ab, aktualisiertAm: jetzt },
    })
    .run();
}
