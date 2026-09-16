"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { lagerorte, newId } from "../_db/schema";
import { type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { HANDLAGER_ID } from "../_lib/konstanten";
import {
  istNamensKollision,
  NAME_VERGEBEN,
  schrankNameVergeben,
} from "../_lib/schrankName";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const LAGERORTE_PFAD = "/m/lagerbuch/verwaltung/lagerorte";
const ARTIKEL_PFAD = "/m/lagerbuch/verwaltung/artikel";

function validierungsFehler(e: unknown): Extract<ActionErgebnis, { ok: false }> {
  const feldFehler = zodFehler(e);
  return {
    ok: false,
    fehler: "Bitte die markierten Felder prüfen.",
    ...(feldFehler ? { feldFehler } : {}),
  };
}

/**
 * DRK-367 — der Satz steht am FELD und daneben. Beide Formulare reichen
 * `feldFehler.name` an die Eingabe durch (`schrankWerte.ts`), und ein Fehler
 * ohne Feldmarkierung liesse die Person raten, welches der drei Felder gemeint
 * ist.
 */
function nameVergebenFehler(): Extract<ActionErgebnis, { ok: false }> {
  return { ok: false, fehler: NAME_VERGEBEN, feldFehler: { name: NAME_VERGEBEN } };
}

const SchrankSchema = z.object({
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  zugangshinweis: z.string().trim().optional(),
  sortierung: z.coerce.number().int().default(0),
});

export async function createSchrank(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis<{ id: string }>> => {
    let v: z.output<typeof SchrankSchema>;
    try {
      v = SchrankSchema.parse(eingabe);
    } catch (e) {
      return validierungsFehler(e);
    }

    if (schrankNameVergeben(db, HANDLAGER_ID, v.name)) return nameVergebenFehler();

    const id = newId();
    try {
      db.insert(lagerorte).values({
        id,
        name: v.name,
        typ: "lager",
        kennung: null,
        aktiv: true,
        // Ein Schrank haengt IMMER am Handlager. Eine freie Elternwahl gaebe es
        // erst mit einem zweiten Lager — das gibt es heute nicht, und ein Feld
        // ohne zweite Wahl ist eine Frage ohne Antwortmoeglichkeit.
        parentId: HANDLAGER_ID,
        // Leerstring heisst „kein Hinweis" und wird zu null: ein leerer String
        // renderte spaeter ein leeres Hinweis-Abzeichen.
        zugangshinweis: v.zugangshinweis || null,
        sortierung: v.sortierung,
      }).run();
    } catch (e) {
      if (istNamensKollision(e)) return nameVergebenFehler();
      return { ok: false, fehler: "Schrank konnte nicht angelegt werden." };
    }

    revalidatePath(LAGERORTE_PFAD);
    revalidatePath(ARTIKEL_PFAD);
    return { ok: true, wert: { id } };
  });
}

/**
 * Findet einen Schrank — also einen Ort, der AM HANDLAGER HAENGT. Die Wurzel
 * selbst und jedes Fahrzeug fallen durch: beide haben `parent_id IS NULL`.
 */
function findeSchrank(db: DB, id: string) {
  return db.select().from(lagerorte)
    .where(and(eq(lagerorte.id, id), eq(lagerorte.parentId, HANDLAGER_ID)))
    .get();
}

const UpdateSchema = SchrankSchema.extend({ id: z.string().min(1) });

export async function updateSchrank(
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

    if (!findeSchrank(db, v.id)) return { ok: false, fehler: "Schrank nicht gefunden." };

    // `v.id` als Ausnahme: ein Schrank, der seinen eigenen Namen behaelt und nur
    // die Reihenfolge aendert, kollidierte sonst mit sich selbst.
    if (schrankNameVergeben(db, HANDLAGER_ID, v.name, v.id)) return nameVergebenFehler();

    try {
      db.update(lagerorte)
        .set({ name: v.name, zugangshinweis: v.zugangshinweis || null, sortierung: v.sortierung })
        .where(eq(lagerorte.id, v.id))
        .run();
    } catch (e) {
      if (istNamensKollision(e)) return nameVergebenFehler();
      return { ok: false, fehler: "Schrank konnte nicht gespeichert werden." };
    }

    revalidatePath(LAGERORTE_PFAD);
    revalidatePath(ARTIKEL_PFAD);
    return { ok: true };
  });
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });

/**
 * ⚠️ STILLLEGEN NIMMT KEINEN BESTAND WEG. Ein inaktiver Schrank bleibt im
 * Handlager-Bereich; sein Bestand zaehlt weiter und wird weiter entnommen.
 * Alles andere liesse beim Umraeumen Material verschwinden. „Inaktiv" heisst
 * allein: taucht in der Zugangsauswahl nicht mehr auf.
 */
export async function setSchrankAktiv(
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

    // Der Riegel deckt Wurzel UND Fahrzeug ab, weil beide `parent_id IS NULL`
    // tragen — eine ausdrueckliche Meldung ist trotzdem besser als „nicht
    // gefunden", weil der Handlager der haeufigere Fehlgriff ist.
    if (v.id === HANDLAGER_ID) {
      return { ok: false, fehler: "Das Handlager ist der feste Bezugspunkt jeder Buchung und kann nicht stillgelegt werden." };
    }
    if (!findeSchrank(db, v.id)) return { ok: false, fehler: "Schrank nicht gefunden." };

    try {
      db.update(lagerorte).set({ aktiv: v.aktiv }).where(eq(lagerorte.id, v.id)).run();
    } catch {
      return { ok: false, fehler: "Schrankstatus konnte nicht geändert werden." };
    }

    revalidatePath(LAGERORTE_PFAD);
    revalidatePath(ARTIKEL_PFAD);
    return { ok: true };
  });
}
