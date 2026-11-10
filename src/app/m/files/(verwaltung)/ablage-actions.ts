"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

/**
 * DER MANUELLE AUSLOESER DES AUFRAEUMLAUFS (Spec §7.6; Plan T46).
 *
 * WARUM EIN KNOPF UND KEIN `/api/cleanup`: der Alt-Endpunkt hatte eine Falle,
 * die man nicht erbt — `replace("Bearer ", "")` ist KEINE Pruefung, das nackte
 * Secret passiert ebenso. Dazu kaeme, dass ein Cron, der einen Host aufruft, den
 * `moduleForHost` nicht kennt, ein **302 auf `/login`** bekommt und Erfolg
 * meldet, wenn er nur auf HTTP-Fehler prueft. Ein Knopf hat eine Session, also
 * braucht er kein Secret — ein Geheimnis weniger in der `.env`.
 *
 * WARUM SIE IN EINER EIGENEN DATEI STEHT und nicht in `(verwaltung)/actions.ts`:
 * dort liegen die Schreibwege der Fileshare-VERWALTUNG (anlegen, bearbeiten,
 * aufstocken, loeschen). Das Aufraeumen ist Betrieb, nicht Fachlichkeit, und die
 * Datei gehoert einem anderen Task — zwei Bearbeiter an einer Datei sind der
 * teuerste Weg, dieselbe Zeile zu schreiben.
 *
 * DER RIEGEL STEHT IM RUMPF DER FUNKTION, nicht im Layout: eine Seiten- oder
 * Layout-Pruefung erstreckt sich NICHT auf die Actions darunter (§2.4), und
 * `actions.test.ts` sichert das als Quelltext-Scan ueber JEDE `"use server"`-
 * Datei des Moduls zu — auch ueber diese hier.
 */

import { revalidatePath } from "next/cache";

import { requireFilesAccess } from "../_lib/access";
import { aufraeumSatz } from "../_lib/aufraeumText";
import { fuehreAufraeumLaufAus, planeAufraeumVorschau } from "../_lib/boot";

/**
 * Der INTERNE Pfad, wie ihn `revalidatePath` braucht — nicht die per Host
 * geroutete Wurzel `/`. Dieselbe Form wie in `(verwaltung)/actions.ts`. Dort
 * haengt die Ablage-Kachel; ohne diese Zeile zeigte sie bis zur naechsten
 * Navigation die Zahlen von VOR dem Lauf, und die Vorschau waere unsichtbar.
 */
const INTERNER_PFAD = "/m/files";

/**
 * Einen Aufraeumlauf ausloesen — als VORSCHAU oder als echten Lauf.
 *
 * ALLES AUSSER `"echt"` IST EINE VORSCHAU, auch ein fehlendes Feld. Die sichere
 * Richtung ist hier nicht Geschmack: der erste Lauf nach dem Cutover ist ein
 * LOESCHEREIGNIS (§7.6) — auf dem Server der Alt-App laeuft moeglicherweise kein
 * Cleanup-Cron, dann enthaelt die Produktions-DB abgelaufene Shares
 * vollstaendig. Ein verdrehtes Formularfeld ist ein schlechter Ausloeser dafuer.
 *
 * Und der Trockenlauf laesst sich von hier nur EINSCHALTEN, nie ausschalten:
 * `FILES_AUFRAEUMEN_TROCKENLAUF` bleibt die staerkere Sicherung
 * (`_lib/boot.ts`).
 */
export async function aufraeumenAction(formData: FormData): Promise<void> {
  const auditViewer = await requireFilesAccess();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<void> => {

    const modus = formData.get("modus");
    const nurVorschau = modus !== "echt";

    await fuehreAufraeumLaufAus({ nurVorschau });

    revalidatePath(INTERNER_PFAD);
  });
}

/** Was die Rueckfrage vor „Jetzt aufräumen" nennt (IDA-388). */
export type AufraeumVorschau = {
  /** `null` = nichts zu loeschen. */
  satz: string | null;
  /** `FILES_AUFRAEUMEN_TROCKENLAUF` ist an — auch der echte Lauf loescht nichts. */
  trockenlaufErzwungen: boolean;
};

/**
 * Die Zahlen fuer die Rueckfrage, OHNE Protokollzeile (`planeAufraeumVorschau`).
 * Derselbe Riegel wie beim Lauf: eine Action ist ein eigener Einstieg, die
 * Layout-Pruefung erstreckt sich nicht auf sie (§2.4).
 */
export async function aufraeumVorschauAction(): Promise<AufraeumVorschau> {
  await requireFilesAccess();
  const { zahlen, trockenlaufErzwungen } = await planeAufraeumVorschau();
  return { satz: aufraeumSatz(zahlen), trockenlaufErzwungen };
}
