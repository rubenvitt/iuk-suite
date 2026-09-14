"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { artikel, newId } from "../_db/schema";
import { type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { KATEGORIE_MAX_LAENGE, kategorieNormalisieren } from "../_lib/kategorie";
import {
  idBloecke,
  SAMMEL_MAX_ARTIKEL,
  type SammelAenderung,
} from "../_lib/sammelAenderung";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const ARTIKEL_PFAD = "/m/lagerbuch/verwaltung/artikel";

/**
 * DRK-294. `undefined` heisst „nicht gesendet" und laesst die Kategorie stehen;
 * ein Leerstring, nur Leerzeichen oder `null` heissen „ohne Kategorie" und werden
 * zu `null`. Ein Leerstring kommt nie in die Datenbank — er waere eine
 * unsichtbare Kategorie, die man trotzdem ausblenden koennte.
 */
const KategorieFeld = z
  .union([z.string(), z.null()])
  .optional()
  .transform((wert) => (wert === undefined ? undefined : kategorieNormalisieren(wert)))
  .refine(
    (wert) => wert == null || wert.length <= KATEGORIE_MAX_LAENGE,
    `Kategorie darf höchstens ${KATEGORIE_MAX_LAENGE} Zeichen haben`,
  );

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  einheit: z.string().trim().min(1, "Einheit darf nicht leer sein"),
  fach: z.string().trim().min(1, "Fach darf nicht leer sein"),
  mindestbestand: z.coerce
    .number()
    .int()
    .min(0, "Mindestbestand darf nicht negativ sein"),
  kategorie: KategorieFeld,
});

const UpdateSchema = z.object({
  mindestbestand: z.coerce
    .number()
    .int()
    .min(0, "Mindestbestand darf nicht negativ sein")
    .optional(),
  fach: z.string().trim().min(1, "Fach darf nicht leer sein").optional(),
  einheit: z.string().trim().min(1, "Einheit darf nicht leer sein").optional(),
  kategorie: KategorieFeld,
});

const AktivSchema = z.object({
  id: z.string().min(1),
  aktiv: z.boolean(),
});

function validierungsFehler(
  e: unknown,
): Extract<ActionErgebnis, { ok: false }> {
  const feldFehler = zodFehler(e);
  return {
    ok: false,
    fehler: "Bitte die markierten Felder prüfen.",
    ...(feldFehler ? { feldFehler } : {}),
  };
}

export async function createArtikel(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis<{ id: string }>> => {

    let v: z.output<typeof CreateSchema>;
    try {
      v = CreateSchema.parse(eingabe);
    } catch (e) {
      return validierungsFehler(e);
    }

    const id = newId();
    db.insert(artikel).values({
      id,
      name: v.name,
      einheit: v.einheit,
      fach: v.fach,
      mindestbestand: v.mindestbestand,
      kategorie: v.kategorie ?? null,
      aktiv: true,
      createdAt: new Date(),
    }).run();

    revalidatePath(ARTIKEL_PFAD);
    return { ok: true, wert: { id } };
  });
}

export async function updateArtikel(
  id: string,
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis> => {

    let v: z.output<typeof UpdateSchema>;
    try {
      v = UpdateSchema.parse(eingabe);
    } catch (e) {
      return validierungsFehler(e);
    }

    const aenderung: Partial<typeof artikel.$inferInsert> = {};
    if (v.mindestbestand !== undefined) {
      aenderung.mindestbestand = v.mindestbestand;
    }
    if (v.fach !== undefined) aenderung.fach = v.fach;
    if (v.einheit !== undefined) aenderung.einheit = v.einheit;
    if (v.kategorie !== undefined) aenderung.kategorie = v.kategorie;

    if (Object.keys(aenderung).length === 0) return { ok: true };

    db.update(artikel).set(aenderung).where(eq(artikel.id, id)).run();
    revalidatePath(ARTIKEL_PFAD);
    return { ok: true };
  });
}

export async function setArtikelAktiv(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis> => {

    let v: z.output<typeof AktivSchema>;
    try {
      v = AktivSchema.parse(eingabe);
    } catch {
      return { ok: false, fehler: "Ungültige Eingabe." };
    }

    db.update(artikel).set({ aktiv: v.aktiv }).where(eq(artikel.id, v.id)).run();
    revalidatePath(ARTIKEL_PFAD);
    revalidatePath("/m/lagerbuch/verwaltung");
    return { ok: true };
  });
}

/**
 * DRK-293 — DIESELBE AENDERUNG AUF MEHRERE ARTIKEL.
 *
 * DREI FELDER, und welche das sind, steht in `_lib/sammelAenderung.ts` samt
 * Begruendung — nicht hier: die Oberflaeche, die Vorschau und dieses Schema
 * muessen sich ueber dieselbe Liste einig sein, und eine zweite Liste liefe mit
 * der ersten auseinander.
 *
 * ⚠️ `UpdateSchema` WIRD NICHT WIEDERVERWENDET, obwohl es aehnlich aussieht.
 * Es traegt `mindestbestand` und `einheit`, und beide sind hier ausdruecklich
 * ausgeschlossen. Wer die Schemata zusammenlegt, macht aus dem Ausschluss eine
 * Zeile, die beim naechsten Feld still wegfaellt.
 *
 * ⚠️ `aktiv` LIEGT MIT IM SELBEN AUFRUF, nicht in einem zweiten neben
 * `setArtikelAktiv`. Zwei Aufrufe koennten halb durchlaufen; hier faellt eine
 * Auswahl ganz oder gar nicht, weil alle Bloecke in EINER Transaktion stehen.
 *
 * Gezaehlt wird, was es wirklich gibt: unbekannte IDs werden still uebergangen
 * (eine Auswahl kann aelter sein als die Liste), und `betroffen` nennt die
 * Zeilen, die die Aenderung erreicht hat.
 */
const SammelSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1, "Bitte mindestens einen Artikel auswählen.")
    .max(SAMMEL_MAX_ARTIKEL, "Zu viele Artikel auf einmal."),
  aenderung: z.object({
    kategorie: KategorieFeld,
    fach: z.string().trim().min(1, "Fach darf nicht leer sein").optional(),
    aktiv: z.boolean().optional(),
  }),
});

export async function sammelAendereArtikel(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ betroffen: number }>> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis<{ betroffen: number }>> => {

    let v: z.output<typeof SammelSchema>;
    try {
      v = SammelSchema.parse(eingabe);
    } catch (e) {
      return validierungsFehler(e);
    }

    const gewuenscht: SammelAenderung = v.aenderung;
    const aenderung: Partial<typeof artikel.$inferInsert> = {};
    if (gewuenscht.kategorie !== undefined) aenderung.kategorie = gewuenscht.kategorie;
    if (gewuenscht.fach !== undefined) aenderung.fach = gewuenscht.fach;
    if (gewuenscht.aktiv !== undefined) aenderung.aktiv = gewuenscht.aktiv;

    if (Object.keys(aenderung).length === 0) {
      return { ok: false, fehler: "Bitte mindestens ein Feld zum Ändern auswählen." };
    }

    const ids = [...new Set(v.ids)];
    let betroffen = 0;
    db.transaction((tx) => {
      for (const block of idBloecke(ids)) {
        betroffen += tx
          .select({ id: artikel.id })
          .from(artikel)
          .where(inArray(artikel.id, block))
          .all().length;
        tx.update(artikel).set(aenderung).where(inArray(artikel.id, block)).run();
      }
    });

    revalidatePath(ARTIKEL_PFAD);
    // Wie `setArtikelAktiv`: ein stillgelegter Artikel faellt auch aus den
    // Zahlen der Verwaltungs-Startseite.
    revalidatePath("/m/lagerbuch/verwaltung");
    return { ok: true, wert: { betroffen } };
  });
}
