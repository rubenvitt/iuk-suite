"use server";

import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { requireEinsatzbuchAktion } from "../_lib/zugang";
import { type ActionErgebnis } from "../_lib/actionErgebnis";
import { aktiverEchterRechner, loescheTestRechner, widerrufe } from "../_lib/anbindung/rechner";

/** Nach jeder Schreibaktion: die Rechnerseite und die Übersicht laufen mit neuem Bestand. */
function neuLaden(): void {
  revalidatePath("/m/einsatzbuch/rechner");
  revalidatePath("/m/einsatzbuch");
}

/**
 * Widerruft den aktiven echten Rechner. Die Objekt-Zugehörigkeit (IST das überhaupt der aktive
 * echte Rechner?) wird aus der DB aufgelöst, nie aus der übergebenen `id` allein geglaubt (IDOR) —
 * ein Test-Rechner oder eine unbekannte ID werden hier abgelehnt, nicht gelöscht.
 */
export async function rechnerWiderrufenAction(id: string): Promise<ActionErgebnis<null>> {
  const viewer = await requireEinsatzbuchAktion();
  if (typeof id !== "string" || id.length === 0) return { ok: false, fehler: "Unbekannter Rechner." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const db = getDb();
    const aktiv = aktiverEchterRechner(db);
    if (!aktiv || aktiv.id !== id) {
      return { ok: false, fehler: "Dieser Rechner ist nicht (mehr) der aktive echte Rechner." };
    }
    if (!widerrufe(db, id, new Date())) {
      return { ok: false, fehler: "Der Rechner ist schon widerrufen." };
    }
    neuLaden();
    return { ok: true, wert: null };
  });
}

/**
 * Löscht einen Test-Rechner unwiderruflich (Rechner, Token, Schlüsselpaar, Anker — Trigger und
 * `ON DELETE CASCADE`, `_lib/anbindung/rechner.ts`). Ein echter Rechner wird hier abgelehnt: er
 * wird widerrufen, nie gelöscht, seine Kette bleibt lesbar.
 */
export async function testRechnerLoeschenAction(id: string): Promise<ActionErgebnis<null>> {
  const viewer = await requireEinsatzbuchAktion();
  if (typeof id !== "string" || id.length === 0) return { ok: false, fehler: "Unbekannter Rechner." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const ergebnis = loescheTestRechner(getDb(), id);
    if (ergebnis === "unbekannt") return { ok: false, fehler: "Dieser Rechner existiert nicht mehr." };
    if (ergebnis === "nur_test") return { ok: false, fehler: "Nur Test-Rechner lassen sich hier löschen. Ein echter Rechner wird widerrufen." };
    neuLaden();
    return { ok: true, wert: null };
  });
}
