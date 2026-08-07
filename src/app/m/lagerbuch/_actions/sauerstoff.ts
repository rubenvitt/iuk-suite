"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { lagerorte, newId, o2Flaschen, o2Messungen } from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const LISTENPFAD = "/m/lagerbuch/verwaltung/sauerstoff";
const LAGERORT_FEHLER = "Lagerort nicht gefunden oder inaktiv.";
const FLASCHE_FEHLER = "Sauerstoffflasche nicht gefunden.";

function fehlerhaft(fehler: unknown): ActionErgebnis<never> {
  const feldFehler = zodFehler(fehler);
  return {
    ok: false,
    fehler: "Bitte die markierten Felder prüfen.",
    ...(feldFehler ? { feldFehler } : {}),
  };
}

function istAktiverLagerort(db: DB, id: string): boolean {
  return Boolean(db.select({ id: lagerorte.id })
    .from(lagerorte)
    .where(and(eq(lagerorte.id, id), eq(lagerorte.aktiv, true)))
    .get());
}

function flascheExistiert(db: DB, id: string): boolean {
  return Boolean(db.select({ id: o2Flaschen.id })
    .from(o2Flaschen)
    .where(eq(o2Flaschen.id, id))
    .get());
}

const FlascheSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  lagerortId: z.string().min(1, "Standort wählen"),
  groesseLiter: z.coerce.number().int().positive().optional(),
  // Der Vorgabewert wird bei jedem Schreiben materialisiert. Ein Rückfall im
  // Lesepfad würde eine fehlkonfigurierte Flasche fachlich falsch bewerten.
  nennfuelldruckBar: z.coerce.number()
    .int()
    .positive("Nennfülldruck muss größer als 0 sein")
    .default(200),
});

export async function flascheSpeichern(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();

  const geparst = FlascheSchema.safeParse(eingabe);
  if (!geparst.success) return fehlerhaft(geparst.error);
  const v = geparst.data;

  if (!istAktiverLagerort(db, v.lagerortId)) {
    return { ok: false, fehler: LAGERORT_FEHLER };
  }

  const id = v.id ?? newId();
  if (v.id) {
    if (!flascheExistiert(db, v.id)) {
      return { ok: false, fehler: FLASCHE_FEHLER };
    }
    db.update(o2Flaschen)
      .set({
        name: v.name,
        lagerortId: v.lagerortId,
        groesseLiter: v.groesseLiter ?? null,
        nennfuelldruckBar: v.nennfuelldruckBar,
      })
      .where(eq(o2Flaschen.id, v.id))
      .run();
    revalidatePath(`${LISTENPFAD}/${v.id}`);
  } else {
    db.insert(o2Flaschen).values({
      id,
      name: v.name,
      lagerortId: v.lagerortId,
      groesseLiter: v.groesseLiter ?? null,
      nennfuelldruckBar: v.nennfuelldruckBar,
      aktiv: true,
      createdAt: new Date(),
    }).run();
  }

  revalidatePath(LISTENPFAD);
  return { ok: true, wert: { id } };
}

const AktivSchema = z.object({
  id: z.string().min(1),
  aktiv: z.boolean(),
});

export async function setFlascheAktiv(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  const geparst = AktivSchema.safeParse(eingabe);
  if (!geparst.success) return { ok: false, fehler: "Ungültige Eingabe." };
  const v = geparst.data;

  if (!flascheExistiert(db, v.id)) {
    return { ok: false, fehler: FLASCHE_FEHLER };
  }
  db.update(o2Flaschen)
    .set({ aktiv: v.aktiv })
    .where(eq(o2Flaschen.id, v.id))
    .run();
  revalidatePath(LISTENPFAD);
  revalidatePath(`${LISTENPFAD}/${v.id}`);
  return { ok: true };
}

const MessungSchema = z.object({
  flascheId: z.string().min(1),
  // 0 bar ist ein gültiger Messwert: Eine leere Flasche ist keine fehlende
  // Eingabe, sondern genau der Zustand, den die Ampel melden soll.
  druckBar: z.coerce.number().int().min(0, "Druck darf nicht negativ sein"),
  kommentar: z.string().trim().optional(),
});

/** Diese Action fügt Messungen ausschließlich ein; die Tabelle selbst bleibt
 * bewusst ohne globalen Append-only-Trigger, damit Fehlmessungen korrigierbar sind. */
export async function messungErfassen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  const viewer = await requireLagerbuchAdmin();

  const geparst = MessungSchema.safeParse(eingabe);
  if (!geparst.success) return fehlerhaft(geparst.error);
  const v = geparst.data;

  if (!flascheExistiert(db, v.flascheId)) {
    return { ok: false, fehler: FLASCHE_FEHLER };
  }

  const id = newId();
  db.insert(o2Messungen).values({
    id,
    flascheId: v.flascheId,
    ts: new Date(),
    druckBar: v.druckBar,
    quelleTyp: "oidc",
    quelleId: viewer.sub,
    kommentar: v.kommentar ?? null,
  }).run();
  revalidatePath(LISTENPFAD);
  revalidatePath(`${LISTENPFAD}/${v.flascheId}`);
  return { ok: true, wert: { id } };
}
