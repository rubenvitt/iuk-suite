"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { buchungen, chargen, newId } from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { bestandProLagerort } from "../_lib/domain/bestand";
import { CHARGE_INVENTUR, HANDLAGER_ID, PSEUDO_VERFALL } from "../_lib/konstanten";
import { fefoAbbuchung } from "../_lib/schreibpfade/abbuchung";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const InventurSchema = z.object({
  kommentar: z.string().trim().min(1, "Kommentar erforderlich"),
  positionen: z.array(z.object({
    artikelId: z.string().min(1),
    // Echter Ueberbestand muss zaehlbar bleiben. Eine enge Obergrenze wuerde
    // vorhandene Teile am Eingang abweisen und den Abgleich unbrauchbar machen.
    ist: z.coerce.number().int().min(0).max(99_999),
  })).min(1, "Keine Zählung erfasst"),
});

/**
 * Gleicht ausschliesslich die tatsaechlich gezaehlten Positionen gegen den
 * LIVE-Bestand im Handlager ab. Alle Zeilen eines Laufs entstehen atomar und
 * tragen dieselbe `inventur:<id>`-Referenz.
 *
 * Dieser Pfad ist bewusst von `korrekturAufLagerort` getrennt: Inventurzugang
 * ohne vorhandene Charge braucht den Herkunftshinweis `Inventur`, waehrend der
 * allgemeine Korrekturpfad `Korrektur` anlegt.
 */
export async function inventurKorrektur(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ korrigiert: number }>> {
  const viewer = await requireLagerbuchAdmin();

  const geparst = InventurSchema.safeParse(eingabe);
  if (!geparst.success) {
    const feldFehler = zodFehler(geparst.error);
    return {
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      ...(feldFehler ? { feldFehler } : {}),
    };
  }
  const v = geparst.data;

  const referenz = `inventur:${newId()}`;
  const quelle = { quelleTyp: "oidc" as const, quelleId: viewer.sub };
  let korrigiert = 0;

  try {
    db.transaction((tx) => {
      for (const position of v.positionen) {
        // Der Bestand wird innerhalb derselben Transaktion frisch gelesen. Das
        // Lagerortfeld bleibt erhalten, damit Fahrzeugbestand nicht einfliesst.
        const zeilen = tx.select({
          lagerortId: buchungen.lagerortId,
          menge: buchungen.menge,
        }).from(buchungen).where(eq(buchungen.artikelId, position.artikelId)).all();
        const liveBestand = bestandProLagerort(zeilen, HANDLAGER_ID);
        const diff = position.ist - liveBestand;

        if (diff === 0) continue;

        if (diff < 0) {
          fefoAbbuchung(tx, {
            artikelId: position.artikelId,
            menge: -diff,
            lagerortId: HANDLAGER_ID,
            quelle,
            kommentar: v.kommentar,
            referenz,
            typ: "korrektur",
          });
        } else {
          const vorhandeneChargen = tx.select().from(chargen)
            .where(eq(chargen.artikelId, position.artikelId)).all();
          let chargeId: string;

          if (vorhandeneChargen.length > 0) {
            chargeId = vorhandeneChargen.slice().sort((a, b) =>
              b.verfall.localeCompare(a.verfall)
              || b.createdAt.getTime() - a.createdAt.getTime()
              || b.id.localeCompare(a.id))[0]!.id;
          } else {
            chargeId = newId();
            tx.insert(chargen).values({
              id: chargeId,
              artikelId: position.artikelId,
              chargenNr: CHARGE_INVENTUR,
              verfall: PSEUDO_VERFALL,
              createdAt: new Date(),
            }).run();
          }

          tx.insert(buchungen).values({
            id: newId(),
            ts: new Date(),
            typ: "korrektur",
            artikelId: position.artikelId,
            chargeId,
            lagerortId: HANDLAGER_ID,
            menge: diff,
            quelleTyp: quelle.quelleTyp,
            quelleId: quelle.quelleId,
            referenz,
            kommentar: v.kommentar,
          }).run();
        }

        korrigiert++;
      }
    });
  } catch {
    // SQLite- und Infrastrukturtexte gehoeren weder ins Formular noch an den
    // Client. Erwartbare Eingabefehler wurden bereits oberhalb abgebildet.
    return { ok: false, fehler: "Inventur konnte nicht gebucht werden." };
  }

  revalidatePath("/m/lagerbuch/verwaltung/inventur");
  revalidatePath("/m/lagerbuch/verwaltung/artikel");
  revalidatePath("/m/lagerbuch/verwaltung");
  return { ok: true, wert: { korrigiert } };
}
