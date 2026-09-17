import { eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { tokens } from "../../_db/schema";

/**
 * SPERREN — DER EINE SCHREIBPFAD FÜR BEIDE KNÖPFE. DRK-406, aus Codex'
 * Durchsicht von `100235b`.
 *
 * ⚠️ ES GIBT ZWEI SPERRWEGE, UND NUR EINER KANNTE DIE REGEL. `setTokenAktiv`
 * stempelte den Tag, `deaktiviereElement("token", …)` setzte bloß `aktiv =
 * false`. Der zweite ist kein toter Code: eine `"use server"`-Datei macht aus
 * jedem Export einen global aufrufbaren Endpunkt — dass heute keine Fläche ihn
 * mit `"token"` ruft, ist eine Aussage über die Oberfläche, nicht über die
 * Erreichbarkeit. Genau dieses Argument hat `createToken` ganz entfernt.
 *
 * ⚠️ DER SCHADEN IST EIN FALSCHES DATUM, NICHT EIN OFFENER CODE. Ein so
 * gesperrter Ortscode bleibt gesperrt (`ORTSCODE_FEHLER` hängt an `ort_id`, die
 * noch steht). Wird die Einheit aber später gelöscht, stempelt
 * `_actions/loeschen.ts` den Tag dort nach, wo noch keiner steht — die Zeile
 * bekäme den LÖSCHTAG statt des Tages, an dem der Code wirklich aufhörte zu
 * wirken. Für das Foto in der Hand beantwortet die Liste dann „seit wann?"
 * falsch, und zwar um genau die Spanne dazwischen.
 *
 * ⚠️ SIE STEHT NICHT IN `ortCodes.ts`, OBWOHL SIE DORT THEMATISCH HINGEHÖRTE.
 * Jene Datei ruft `customAlphabet` auf MODULEBENE; ein Import von dort zöge die
 * Ziehung in `_actions/tokens.ts` — und genau deren Abwesenheit sichert
 * `tokens.test.ts` zu („zieht selbst keine Codes mehr"). Sperren braucht keine
 * Ziehung, also teilt es ihren Namensraum auch nicht.
 *
 * ⚠️ DER ALTBESTAND BLEIBT RÜCKNEHMBAR (`ortId === null`): kein Tag, sonst
 * nähme `ERSETZT_FEHLER` der Betreiberin genau die Rücknahme, die ihr die
 * Betreiberentscheidung vom 17.09.2026 zusichert. Und ein schon gesetzter Tag
 * bleibt stehen — ein zweites Sperren darf ihn nicht nach vorn schieben.
 */
export function sperreToken(db: DB, id: string): void {
  const zeile = db.select({ ortId: tokens.ortId, ersetztAm: tokens.ersetztAm })
    .from(tokens)
    .where(eq(tokens.id, id))
    .get();
  const verbrennt = zeile?.ortId != null && zeile.ersetztAm == null;
  db.update(tokens)
    .set(verbrennt ? { aktiv: false, ersetztAm: new Date() } : { aktiv: false })
    .where(eq(tokens.id, id))
    .run();
}
