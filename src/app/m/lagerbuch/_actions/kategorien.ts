"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { ausgeblendeteKategorien } from "../_db/schema";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import {
  KATEGORIE_MAX_LAENGE,
  KATEGORIEN_AUSWAHL_MAX,
  kategorieNormalisieren,
  kategorieSchluessel,
} from "../_lib/kategorie";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const ARTIKEL_PFAD = "/m/lagerbuch/verwaltung/artikel";

const AuswahlSchema = z.object({
  kategorien: z
    .array(z.string().refine((wert) => wert.trim().length <= KATEGORIE_MAX_LAENGE))
    .max(KATEGORIEN_AUSWAHL_MAX),
});

/**
 * DRK-294 — die in „Artikel & Bestand" ausgeblendeten Kategorien des EIGENEN
 * Kontos, als Ganzes ersetzt.
 *
 * DAS KONTO KOMMT AUS DER SITZUNG (`viewer.sub`), nie aus der Eingabe: ein
 * mitgeschicktes `userId` faellt am Schema durch, ohne je gelesen zu werden. Sonst
 * liest und schreibt jeder die Auswahl eines anderen (CLAUDE.md, „Zugriffsschutz").
 *
 * GANZ ERSETZT, NICHT EINZELN UMGESCHALTET: die Oberflaeche schickt nach jeder
 * Aenderung die vollstaendige Liste. Zwei schnelle Umschaltungen koennen damit
 * nicht zu einem Stand fuehren, den nie jemand gesehen hat — die zuletzt
 * angekommene Liste gilt.
 *
 * Gespeichert wird der gefaltete Schluessel. Der Audit-Kontext steht trotzdem da,
 * obwohl die Tabelle keine Trigger hat (`core/audit/catalog.ts`): jede Action
 * dieses Moduls laeuft in ihm, und ein spaeterer Trigger soll nicht an einer
 * fehlenden Klammer scheitern.
 */
export async function setzeAusgeblendeteKategorien(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis> => {
    const geprueft = AuswahlSchema.safeParse(eingabe);
    if (!geprueft.success) {
      return { ok: false, fehler: "Die Auswahl konnte nicht gespeichert werden." };
    }

    const schluessel = [...new Set(
      geprueft.data.kategorien
        .map(kategorieNormalisieren)
        .filter((wert): wert is string => wert !== null)
        .map(kategorieSchluessel),
    )];

    db.transaction((tx) => {
      tx.delete(ausgeblendeteKategorien)
        .where(eq(ausgeblendeteKategorien.userId, viewer.sub))
        .run();
      if (schluessel.length > 0) {
        tx.insert(ausgeblendeteKategorien)
          .values(schluessel.map((kategorie) => ({ userId: viewer.sub, kategorie })))
          .run();
      }
    });

    revalidatePath(ARTIKEL_PFAD);
    return { ok: true };
  });
}
