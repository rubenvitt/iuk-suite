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
/*
 * ⚠️ ZWEI FAELLE, DIE „Status konnte nicht geändert werden" NICHT ERKLAEREN
 * WUERDE — DRK-406, beide in der Durchsicht gefunden. Keiner von beiden ist ein
 * Fehler; beide sind eine Absicht, und §11.7 verlangt, dass der abgelehnte Weg
 * den Weg nennt, der bleibt.
 */
const ORTSCODE_FEHLER =
  "Ein Code, der zu einer Ortskarte gehört, wird nicht wieder aktiviert — ein "
  + "zurückgesetzter Code bleibt dauerhaft gesperrt. Den aktuellen Code des "
  + "Ortes findest du unter „Verwaltung → Ortsetiketten“; fehlt dort einer, "
  + "entsteht er beim Öffnen.";
const ERSETZT_FEHLER =
  "Dieser Code gehörte zu einem Ort, den es nicht mehr gibt. Er bleibt "
  + "dauerhaft gesperrt.";

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
     * REAKTIVIEREN GILT NUR FUER DEN ALTBESTAND — DRK-406, und die zwei Zeilen
     * sind die Zusage, die die Anwender-Notiz gibt: „der bisherige ist dann
     * dauerhaft gesperrt".
     *
     * ⚠️ HIER STAND „hat dieser Ort schon einen aktiven Code?", UND DAS WAR ZU
     * WENIG. Der Weg zurueck ging ueber zwei erlaubte Handgriffe: erst den
     * NACHFOLGER sperren, dann am Vorgaenger reaktivieren — nach dem ersten
     * Klick hat der Ort keinen aktiven Code mehr, und die Pruefung liess
     * durch. Das weggeworfene Kaertchen galt wieder. Der Teilindex
     * `idx_tokens_ort_aktiv` sieht das nicht und kann es nicht sehen: es ist zu
     * jedem Zeitpunkt genau ein aktiver Code je Ort, nur eben der verbrannte.
     *
     * ⚠️ DESHALB ENTSCHEIDET DIE HERKUNFT, NICHT DER ZUSTAND DES ORTES. Ein
     * Code mit `ort_id` gehoert einer Karte; sein Nachschub kommt aus den
     * Ortsetiketten, nie aus diesem Knopf. Ein Code mit `ersetzt_am` ist
     * verbrannt — die Spalte ueberlebt das Loeschen der Einheit, bei dem
     * `ort_id` geleert werden MUSS (`_actions/loeschen.ts`).
     *
     * ⚠️ NUR BEIM REAKTIVIEREN. Sperren bleibt fuer JEDEN Code offen, auch fuer
     * den Ortscode: es ist der Griff, der wirkt, wenn eine Karte verschwindet.
     */
    const zeile = db.select({ ortId: tokens.ortId, ersetztAm: tokens.ersetztAm })
      .from(tokens)
      .where(eq(tokens.id, geparst.data.id))
      .get();

    if (geparst.data.aktiv) {
      if (zeile?.ortId) return { ok: false, fehler: ORTSCODE_FEHLER };
      if (zeile?.ersetztAm) return { ok: false, fehler: ERSETZT_FEHLER };
    }

    /*
     * SPERREN SETZT DEN TAG — fuer einen ORTSCODE, und nur fuer ihn.
     *
     * ⚠️ DAS FOLGT AUS DEM RIEGEL DARUEBER, und ohne diese Zeilen widerspraeche
     * sich die Datei selbst: wer einen Ortscode sperrt, sperrt ihn DAUERHAFT
     * (`ORTSCODE_FEHLER` laesst ihn nie wieder hoch). Er ist damit verbrannt,
     * und ein verbrannter Code ohne Datum ist genau das, was `ersetzt_am`
     * verhindern soll — die Liste koennte fuer das Foto in der Hand nicht mehr
     * sagen, seit wann es nicht mehr gilt.
     *
     * ⚠️ UND ES IST NICHT NUR EINE LEERE ZELLE. Wird der Ort spaeter geloescht,
     * stempelt `_actions/loeschen.ts` den Tag nach — dort, wo noch keiner
     * steht. Ohne diese Zeilen bekaeme die Zeile den LOESCHTAG, also ein
     * spaeteres Datum als das, an dem der Code wirklich aufhoerte zu wirken.
     * Das ist derselbe Fehler, den die Trennung beim Loeschen gerade behebt,
     * nur durch die Hintertuer.
     *
     * ⚠️ DER ALTBESTAND BLEIBT UNBERUEHRT (`ortId === null`): dort ist Sperren
     * ruecknehmbar, und ein Datum wuerde ihn ueber `ERSETZT_FEHLER` genau um
     * diese Ruecknahme bringen. Und ein schon gesetzter Tag bleibt stehen —
     * ein zweites Sperren derselben Zeile darf ihn nicht nach vorn schieben.
     */
    const verbrennt = !geparst.data.aktiv && zeile?.ortId != null && zeile.ersetztAm == null;

    try {
      db.update(tokens)
        .set(verbrennt
          ? { aktiv: false, ersetztAm: new Date() }
          : { aktiv: geparst.data.aktiv })
        .where(eq(tokens.id, geparst.data.id))
        .run();
    } catch {
      return { ok: false, fehler: STATUS_FEHLER };
    }

    revalidatePath(LISTENPFAD);
    return { ok: true };
  });
}
