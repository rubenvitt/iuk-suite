"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { tokens } from "../_db/schema";
import { type ActionErgebnis } from "../_lib/actionErgebnis";
import { requireLagerbuchAdmin } from "../_lib/zugang";

/**
 * SPERREN UND REAKTIVIEREN — seit DRK-406 das EINZIGE, was diese Datei noch
 * kann.
 *
 * ⚠️ `createToken` IST ERSATZLOS ENTFALLEN, und dass die Action MIT dem Knopf
 * verschwindet, ist der Punkt: eine `"use server"`-Datei macht aus jedem Export
 * einen global aufrufbaren Endpunkt. Nur den Dialog wegzunehmen hätte die
 * Oberfläche aufgeräumt und die Fähigkeit stehen lassen — Codes von Hand
 * anzulegen wäre weiter möglich gewesen, nur nicht mehr sichtbar. Ein Code
 * entsteht ab jetzt ausschließlich als ORTSCODE
 * (`_lib/schreibpfade/ortCodes.ts`), also immer mit einer Karte, an der er
 * klebt.
 *
 * ⚠️ DIE ZIEHUNG IST MIT UMGEZOGEN, NICHT KOPIERT. `erzeugeFreienCode` stand
 * hier als modulprivate Funktion; sie steht jetzt in jenem Schreibpfad und
 * nirgends sonst. Zwei Ziehungen für denselben Namensraum wären zwei Zufälle
 * und zwei Kollisionsbehandlungen — und das fiele erst auf, wenn zwei Karten
 * denselben Code trügen.
 *
 * ⚠️ WAS BLEIBT, IST DER WIDERRUF FÜR ALLES. `setTokenAktiv` gilt für
 * Ortscodes UND für den Altbestand (Betreiberentscheidung 17.09.2026: von Hand
 * angelegte Kärtchen bleiben gültig und sperrbar). Ein Riegel, der nur noch
 * Ortscodes sperren ließe, nähme der Betreiberin genau den Griff, den sie
 * braucht, wenn ein altes laminiertes Kärtchen verschwindet.
 */
const LISTENPFAD = "/m/lagerbuch/verwaltung/tokens";
const STATUS_FEHLER = "Zugangs-Code-Status konnte nicht geändert werden.";

const AktivSchema = z.object({
  id: z.string().min(1),
  aktiv: z.boolean(),
});

export async function setTokenAktiv(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis> => {

    const geparst = AktivSchema.safeParse(eingabe);
    if (!geparst.success) return { ok: false, fehler: "Ungültige Eingabe." };

    try {
      db.update(tokens)
        .set({ aktiv: geparst.data.aktiv })
        .where(eq(tokens.id, geparst.data.id))
        .run();
    } catch {
      return { ok: false, fehler: STATUS_FEHLER };
    }

    revalidatePath(LISTENPFAD);
    return { ok: true };
  });
}
