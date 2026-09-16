"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { buchungen, chargen, newId } from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { handlagerOrte } from "../_lib/lesepfade/orte";
import { verfallSchwellen, verfallStatus } from "../_lib/domain/verfall";
import { AUSSONDERN_PRAEFIX } from "../_lib/vorgang";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const AussondernSchema = z.object({
  chargeId: z.string().min(1),
  /**
   * DRK-339 — EIN Ort des Handlagers statt aller. Fehlt das Feld, bleibt es
   * bei „alles raus", dem Verhalten seit jeher.
   *
   * ⚠️ DER CLIENT SCHICKT EINEN ORT, NIE EINE MENGE. Die Zeile auf dem Schirm
   * nennt einen Rest, den sie beim RENDERN gesehen hat; bis zum Bestaetigen
   * kann eine andere Sitzung gebucht haben. Wer die Menge mitschickte, buchte
   * gegen einen veralteten Stand — mal zu viel (Saldo ins Minus, in einem
   * Journal ohne UPDATE und ohne DELETE), mal zu wenig, und beides still. Was
   * tatsaechlich am Ort liegt, rechnet die Transaktion unten aus.
   *
   * ⚠️ UND ER WIRD GEGEN DEN BEREICH GEPRUEFT, NICHT GEGLAUBT. Ohne die Probe
   * unten waere das hier die weiche Tuer neben `aussondernVomLagerort`: eine
   * Fahrzeug-ID im Feld, und der Fahrzeugbestand flöge aus — vorbei an der
   * Soll-Pruefung, die jener Weg genau dafuer fuehrt.
   */
  lagerortId: z.string().min(1).nullish(),
  kommentar: z.string().trim().min(1, "Kommentar erforderlich"),
});

/**
 * Bucht den positiven Rest einer abgelaufenen Charge im Handlager als
 * Korrektur aus — an allen Orten des Bereichs oder, mit `lagerortId`, an genau
 * einem davon (DRK-339). Bestand derselben Charge in Fahrzeugen bleibt
 * unberührt.
 *
 * ⚠️ DIE REFERENZ IST DIE KENNZEICHNUNG, NICHT DER KOMMENTAR (DRK-344). Der
 * Kommentar ist Freitext — der Grund, den jemand eingetippt hat; er trägt die
 * Begründung, nicht die Einordnung. Erst das Präfix `aussondern:` macht die
 * Entsorgung abgelaufenen Materials von einer Zählkorrektur unterscheidbar,
 * und genau das ist der Vorgang, den man im Nachhinein belegen können muss.
 *
 * ⚠️ VORHER GESCHRIEBENE ZEILEN TRAGEN `referenz: null` und bleiben im Journal
 * „Korrektur". Das Journal ist append-only; sie nachträglich zu kennzeichnen
 * hieße, es umzuschreiben.
 */
export async function aussondern(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis> => {

    const geparst = AussondernSchema.safeParse(eingabe);
    if (!geparst.success) {
      const feldFehler = zodFehler(geparst.error);
      return {
        ok: false,
        fehler: "Bitte die markierten Felder prüfen.",
        ...(feldFehler ? { feldFehler } : {}),
      };
    }
    const v = geparst.data;

    let fachFehler: string | null;
    try {
      const schwellen = verfallSchwellen();
      const jetzt = new Date();
      fachFehler = db.transaction((tx): string | null => {
        const charge = tx.select().from(chargen).where(eq(chargen.id, v.chargeId)).get();
        if (!charge) return "Charge nicht gefunden.";

        if (!verfallStatus(charge.verfall, schwellen, jetzt).abgelaufen) {
          return "Nur abgelaufene Chargen können ausgesondert werden.";
        }

        // DRK-297 — der Rest je ORT, nicht als eine Summe über den Bereich.
        // EINE Abfrage, `GROUP BY lagerort_id`, mit Bereichs-Prädikat.
        const orte = handlagerOrte(tx);

        // DRK-339 — die Probe VOR der Abfrage, damit ein fremder Ort gar nicht
        // erst in ein Prädikat gerät. Ein Fahrzeug fällt hier heraus, ein
        // stillgelegter Schrank NICHT: `handlagerOrte` führt ihn weiter, und
        // ein stillgelegter Schrank ist genau der, den man ausräumt.
        if (v.lagerortId && !orte.includes(v.lagerortId)) {
          return "Dieser Ort gehört nicht zum Handlager.";
        }

        const jeOrt = tx
          .select({
            lagerortId: buchungen.lagerortId,
            summe: sql<number>`sum(${buchungen.menge})`,
          })
          .from(buchungen)
          .where(and(
            eq(buchungen.chargeId, charge.id),
            inArray(buchungen.lagerortId, [...orte]),
          ))
          .groupBy(buchungen.lagerortId)
          .all();

        // DRK-339 — die Wahl schraenkt die Orte ein, sie ersetzt die Abfrage
        // nicht: gebucht wird weiterhin der Saldo, den die Transaktion sieht.
        const ziele = v.lagerortId
          ? jeOrt.filter((z) => z.lagerortId === v.lagerortId)
          : jeOrt;

        const gesamt = ziele.reduce((s, z) => s + z.summe, 0);
        if (gesamt <= 0) {
          return v.lagerortId
            ? "An diesem Ort liegt nichts mehr von dieser Charge."
            : "Charge hat keinen Restbestand im Handlager.";
        }

        for (const zeile of ziele) {
          // ⚠️ EIN ORT MIT REST 0 ODER WENIGER BEKOMMT KEINE ZEILE. Eine
          // Buchung über 0 stünde im Journal und sagte nichts; eine über eine
          // negative Zahl drehte das Vorzeichen um und schriebe Bestand ZU.
          if (zeile.summe <= 0) continue;
          tx.insert(buchungen).values({
            id: newId(), ts: jetzt, typ: "korrektur", artikelId: charge.artikelId,
            chargeId: charge.id, lagerortId: zeile.lagerortId, menge: -zeile.summe,
            quelleTyp: "oidc", quelleId: viewer.sub,
            referenz: `${AUSSONDERN_PRAEFIX}${zeile.lagerortId}`, kommentar: v.kommentar,
          }).run();
        }
        return null;
      });
    } catch {
      return { ok: false, fehler: "Aussondern fehlgeschlagen." };
    }

    if (fachFehler !== null) return { ok: false, fehler: fachFehler };

    revalidatePath("/m/lagerbuch/verwaltung/verfall");
    revalidatePath("/m/lagerbuch/verwaltung/artikel");
    revalidatePath("/m/lagerbuch/verwaltung");
    return { ok: true };
  });
}
