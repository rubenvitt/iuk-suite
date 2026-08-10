"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { artikel, newId } from "../_db/schema";
import { type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const ARTIKEL_PFAD = "/m/lagerbuch/verwaltung/artikel";

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  einheit: z.string().trim().min(1, "Einheit darf nicht leer sein"),
  fach: z.string().trim().min(1, "Fach darf nicht leer sein"),
  mindestbestand: z.coerce
    .number()
    .int()
    .min(0, "Mindestbestand darf nicht negativ sein"),
});

const UpdateSchema = z.object({
  mindestbestand: z.coerce
    .number()
    .int()
    .min(0, "Mindestbestand darf nicht negativ sein")
    .optional(),
  fach: z.string().trim().min(1, "Fach darf nicht leer sein").optional(),
  einheit: z.string().trim().min(1, "Einheit darf nicht leer sein").optional(),
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
  await requireLagerbuchAdmin();

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
    aktiv: true,
    createdAt: new Date(),
  }).run();

  revalidatePath(ARTIKEL_PFAD);
  return { ok: true, wert: { id } };
}

export async function updateArtikel(
  id: string,
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

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

  if (Object.keys(aenderung).length === 0) return { ok: true };

  db.update(artikel).set(aenderung).where(eq(artikel.id, id)).run();
  revalidatePath(ARTIKEL_PFAD);
  return { ok: true };
}

export async function setArtikelAktiv(
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

  db.update(artikel).set({ aktiv: v.aktiv }).where(eq(artikel.id, v.id)).run();
  revalidatePath(ARTIKEL_PFAD);
  revalidatePath("/m/lagerbuch/verwaltung");
  return { ok: true };
}
