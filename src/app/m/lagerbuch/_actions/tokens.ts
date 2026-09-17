"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq } from "drizzle-orm";
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
/*
 * ⚠️ DER EINE FALL, DEN „Status konnte nicht geändert werden" NICHT ERKLAEREN
 * WUERDE — DRK-406, gefunden in der Durchsicht. Ein zurückgesetzter Ortscode
 * liegt gesperrt neben dem neuen aktiven Code DESSELBEN Ortes. Wer ihn
 * reaktiviert, verletzt `idx_tokens_ort_aktiv` („genau ein aktiver Code je
 * Ort"), und ohne diesen Satz bekäme er die allgemeine Meldung — für einen
 * Zustand, der kein Fehler ist, sondern eine Absicht.
 *
 * §11.7: der abgelehnte Weg nennt den Weg, der bleibt.
 */
const ORT_BESETZT_FEHLER =
  "Für diesen Ort gilt bereits ein neuerer Code. Ein zurückgesetzter Code "
  + "bleibt dauerhaft gesperrt — drucke die Karte mit dem aktuellen Code neu.";

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

    /*
     * ⚠️ DIE PRUEFUNG STEHT VOR DEM SCHREIBEN UND ERSETZT DEN INDEX NICHT. Der
     * Teilindex bleibt der Riegel — er haelt auch gegen zwei gleichzeitige
     * Anfragen. Diese Zeilen sind die ERKLAERUNG: sie machen aus einem
     * `UNIQUE constraint failed` einen Satz, der sagt, was los ist.
     *
     * ⚠️ NUR BEIM REAKTIVIEREN. Sperren kann den Index nie verletzen, und eine
     * Abfrage dafuer waere ein Zugriff, der nichts entscheidet.
     */
    if (geparst.data.aktiv) {
      const zeile = db.select({ ortId: tokens.ortId })
        .from(tokens)
        .where(eq(tokens.id, geparst.data.id))
        .get();
      if (zeile?.ortId
        && db.select({ id: tokens.id })
          .from(tokens)
          .where(and(eq(tokens.ortId, zeile.ortId), eq(tokens.aktiv, true))!)
          .get()) {
        return { ok: false, fehler: ORT_BESETZT_FEHLER };
      }
    }

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
