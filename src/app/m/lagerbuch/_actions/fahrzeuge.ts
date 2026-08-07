"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { lagerorte, newId, sollPositionen } from "../_db/schema";
import { type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { findeFahrzeug } from "../_lib/schreibpfade/fahrzeug";
import { loescheVerfallEintrag } from "../_lib/schreibpfade/lagerortVerfall";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const FAHRZEUGE_PFAD = "/m/lagerbuch/verwaltung/fahrzeuge";
const VERFALL_PFAD = "/m/lagerbuch/verwaltung/verfall";

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

const FahrzeugSchema = z.object({
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  kennung: z.string().trim().optional(),
});

export async function createFahrzeug(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();

  let v: z.output<typeof FahrzeugSchema>;
  try {
    v = FahrzeugSchema.parse(eingabe);
  } catch (e) {
    return validierungsFehler(e);
  }

  const id = newId();
  try {
    db.insert(lagerorte).values({
      id,
      name: v.name,
      typ: "fahrzeug",
      kennung: v.kennung || null,
      aktiv: true,
    }).run();
  } catch {
    return { ok: false, fehler: "Fahrzeug konnte nicht angelegt werden." };
  }

  revalidatePath(FAHRZEUGE_PFAD);
  return { ok: true, wert: { id } };
}

const AktivSchema = z.object({
  id: z.string().min(1),
  aktiv: z.boolean(),
});

export async function setFahrzeugAktiv(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  let v: z.output<typeof AktivSchema>;
  try {
    v = AktivSchema.parse(eingabe);
  } catch {
    return { ok: false, fehler: "Ungültige Eingabe." };
  }

  try {
    if (!findeFahrzeug(db, v.id)) {
      return { ok: false, fehler: "Fahrzeug nicht gefunden." };
    }
    db.update(lagerorte)
      .set({ aktiv: v.aktiv })
      .where(and(eq(lagerorte.id, v.id), eq(lagerorte.typ, "fahrzeug")))
      .run();
  } catch {
    return { ok: false, fehler: "Fahrzeugstatus konnte nicht geändert werden." };
  }

  revalidatePath(FAHRZEUGE_PFAD);
  return { ok: true };
}

const SollSchema = z.object({
  id: z.string().min(1).optional(),
  fahrzeugId: z.string().min(1),
  fachLabel: z.string().trim().min(1, "Fach darf nicht leer sein"),
  artikelId: z.string().min(1, "Artikel wählen"),
  soll: z.coerce.number().int().positive("Soll muss größer als 0 sein"),
  sort: z.coerce.number().int().default(0),
});

/**
 * Eine bearbeitete Vorlagen-Position wird manuell ueberschrieben und bleibt
 * damit bei spaeteren Vorlagen-Syncs unangetastet. Setzen belebt auch einen
 * zuvor entfernten Grabstein wieder.
 */
export async function sollPositionSetzen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();

  let v: z.output<typeof SollSchema>;
  try {
    v = SollSchema.parse(eingabe);
  } catch (e) {
    return validierungsFehler(e);
  }

  const id = v.id ?? newId();
  try {
    if (!findeFahrzeug(db, v.fahrzeugId)) {
      return { ok: false, fehler: "Fahrzeug nicht gefunden." };
    }
    if (v.id) {
      const row = db.select().from(sollPositionen)
        .where(eq(sollPositionen.id, v.id)).get();
      if (!row || row.fahrzeugId !== v.fahrzeugId) {
        return { ok: false, fehler: "Soll-Position nicht gefunden." };
      }
      const ueberschrieben = row?.templatePositionId
        ? true
        : (row?.ueberschrieben ?? false);

      db.update(sollPositionen)
        .set({
          fahrzeugId: v.fahrzeugId,
          fachLabel: v.fachLabel,
          artikelId: v.artikelId,
          soll: v.soll,
          sort: v.sort,
          ueberschrieben,
          entfernt: false,
        })
        .where(eq(sollPositionen.id, v.id))
        .run();
    } else {
      db.insert(sollPositionen).values({
        id,
        fahrzeugId: v.fahrzeugId,
        fachLabel: v.fachLabel,
        artikelId: v.artikelId,
        soll: v.soll,
        sort: v.sort,
      }).run();
    }
  } catch {
    return { ok: false, fehler: "Soll-Position konnte nicht gespeichert werden." };
  }

  revalidatePath(FAHRZEUGE_PFAD);
  revalidatePath(`${FAHRZEUGE_PFAD}/${v.fahrzeugId}`);
  return { ok: true, wert: { id } };
}

const PositionIdSchema = z.object({ id: z.string().min(1) });

/**
 * Vorlagen-Positionen bleiben als Grabsteine erhalten, damit der naechste
 * Sync sie nicht wieder anlegt. Manuelle Positionen werden hart geloescht.
 * Bleibt fuer den Artikel kein aktives Fach am Fahrzeug, wird auch dessen
 * gegenstandslose Verfall-Angabe entfernt.
 */
export async function sollPositionEntfernen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  let v: z.output<typeof PositionIdSchema>;
  try {
    v = PositionIdSchema.parse(eingabe);
  } catch {
    return { ok: false, fehler: "Ungültige Eingabe." };
  }

  let row: typeof sollPositionen.$inferSelect | undefined;
  try {
    row = db.transaction((tx) => {
      const gefunden = tx.select().from(sollPositionen)
        .where(eq(sollPositionen.id, v.id)).get();

      if (gefunden?.templatePositionId) {
        tx.update(sollPositionen)
          .set({ entfernt: true })
          .where(eq(sollPositionen.id, v.id))
          .run();
      } else {
        tx.delete(sollPositionen)
          .where(eq(sollPositionen.id, v.id))
          .run();
      }

      if (gefunden) {
        const restPositionen = tx
          .select({ id: sollPositionen.id, entfernt: sollPositionen.entfernt })
          .from(sollPositionen)
          .where(and(
            eq(sollPositionen.fahrzeugId, gefunden.fahrzeugId),
            eq(sollPositionen.artikelId, gefunden.artikelId),
          ))
          .all()
          .filter((position) => position.id !== v.id && !position.entfernt);

        if (restPositionen.length === 0) {
          loescheVerfallEintrag(tx, gefunden.fahrzeugId, gefunden.artikelId);
        }
      }

      return gefunden;
    });
  } catch {
    return { ok: false, fehler: "Soll-Position konnte nicht entfernt werden." };
  }

  if (row) revalidatePath(`${FAHRZEUGE_PFAD}/${row.fahrzeugId}`);
  revalidatePath(VERFALL_PFAD);
  revalidatePath(FAHRZEUGE_PFAD);
  return { ok: true };
}

/** Hebt den Grabstein einer zuvor entfernten Vorlagen-Position auf. */
export async function sollPositionWiederherstellen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  let v: z.output<typeof PositionIdSchema>;
  try {
    v = PositionIdSchema.parse(eingabe);
  } catch {
    return { ok: false, fehler: "Ungültige Eingabe." };
  }

  let row: typeof sollPositionen.$inferSelect | undefined;
  try {
    row = db.select().from(sollPositionen)
      .where(eq(sollPositionen.id, v.id)).get();
    db.update(sollPositionen)
      .set({ entfernt: false })
      .where(eq(sollPositionen.id, v.id))
      .run();
  } catch {
    return {
      ok: false,
      fehler: "Soll-Position konnte nicht wiederhergestellt werden.",
    };
  }

  if (row) revalidatePath(`${FAHRZEUGE_PFAD}/${row.fahrzeugId}`);
  revalidatePath(FAHRZEUGE_PFAD);
  return { ok: true };
}
