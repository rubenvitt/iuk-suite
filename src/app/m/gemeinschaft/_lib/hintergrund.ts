import { withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { loescheFaelligeTestanfragen } from "./vermietung";

/**
 * DER LÖSCHTAKT FÜR TESTANFRAGEN (IDA-375, Regel in `testanfrage.ts`). Alle sechs Stunden, der erste Lauf zehn
 * Minuten nach dem Start — ein Löschlauf soll nicht mit dem Deploy zusammenfallen (Vorbild
 * `feedback/_lib/ehrlich/hintergrund.ts`). Synchron, `unref`, wirft nie. Im Audit-Log steht „System".
 */
const TAKT_MS = 6 * 60 * 60_000;
const ERSTLAUF_MS = 10 * 60_000;
let gestartet = false;

export function testanfragenAufraeumen(jetzt = Date.now()): number {
  try {
    return withAuditContext({ actor: { kind: "system" } }, () => loescheFaelligeTestanfragen(getDb(), jetzt));
  } catch (fehler) {
    console.error("[gemeinschaft] Löschfrist für Testanfragen nicht angewandt:", fehler instanceof Error ? fehler.message : fehler);
    return 0;
  }
}

export function starteGemeinschaftHintergrund(): void {
  if (gestartet) return;
  gestartet = true;
  const erst = setTimeout(() => {
    testanfragenAufraeumen();
    setInterval(() => testanfragenAufraeumen(), TAKT_MS).unref?.();
  }, ERSTLAUF_MS);
  erst.unref?.();
}
