"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pruefeBarcodeFrei } from "../_db/barcode";
import { getDb, type DB } from "../_db/client";
import { geraete, lagerorte, newId } from "../_db/schema";
import { type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { normalisiereBarcode } from "../_lib/barcode";
import {
  GERAETE_TYPEN,
  istEchterKalendertag,
  TAG_REGEX,
} from "../_lib/konstanten";
import { geraetByBarcode } from "../_lib/lesepfade/geraete";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const LISTENPFAD = "/m/lagerbuch/verwaltung/geraete";
const LAGERORT_FEHLER = "Lagerort nicht gefunden oder inaktiv.";
const BARCODE_FEHLER = "Barcode bereits vergeben.";

const TagSchema = z.string()
  .regex(TAG_REGEX, "Datum muss YYYY-MM-DD sein")
  .refine(istEchterKalendertag, "Datum muss ein echter Kalendertag sein");
const OptionalerTagSchema = z.union([z.literal(""), TagSchema]).optional();

const GeraetSchema = z.object({
  id: z.string().min(1).optional(),
  typ: z.enum(GERAETE_TYPEN),
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  barcode: z.string().trim().optional(),
  lagerortId: z.string().min(1, "Standort wählen"),
  anmerkung: z.string().trim().optional(),
  mtkFaellig: OptionalerTagSchema,
  beschreibung: z.string().trim().optional(),
  ablaufdatum: OptionalerTagSchema,
});

const AktivSchema = z.object({
  id: z.string().min(1),
  aktiv: z.boolean(),
});

type FehlerErgebnis = Extract<ActionErgebnis, { ok: false }>;

function validierungsFehler(e: unknown): FehlerErgebnis {
  const feldFehler = zodFehler(e);
  return {
    ok: false,
    fehler: "Bitte die markierten Felder prüfen.",
    ...(feldFehler ? { feldFehler } : {}),
  };
}

function festerFehler(fehler: string): FehlerErgebnis {
  return { ok: false, fehler };
}

function barcodeFehler(): FehlerErgebnis {
  return {
    ok: false,
    fehler: BARCODE_FEHLER,
    feldFehler: { barcode: BARCODE_FEHLER },
  };
}

function orNull(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

function revalidate(id: string) {
  revalidatePath(LISTENPFAD);
  revalidatePath(`${LISTENPFAD}/${id}`);
}

export async function geraetSpeichern(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();

  const geparst = GeraetSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);
  const v = geparst.data;
  const id = v.id ?? newId();
  const barcode = orNull(v.barcode);

  try {
    const lagerort = db.select({ id: lagerorte.id }).from(lagerorte)
      .where(and(
        eq(lagerorte.id, v.lagerortId),
        eq(lagerorte.aktiv, true),
      ))
      .get();
    if (!lagerort) return festerFehler(LAGERORT_FEHLER);

    if (barcode) {
      pruefeBarcodeFrei(
        db,
        barcode,
        v.id ? { tabelle: "geraet", id: v.id } : null,
      );
    }

    const istMedizin = v.typ === "medizin";
    const felder = {
      typ: v.typ,
      name: v.name,
      barcode,
      lagerortId: v.lagerortId,
      anmerkung: orNull(v.anmerkung),
      mtkFaellig: istMedizin ? orNull(v.mtkFaellig) : null,
      beschreibung: istMedizin ? null : orNull(v.beschreibung),
      ablaufdatum: istMedizin ? null : orNull(v.ablaufdatum),
    };

    if (v.id) {
      db.update(geraete)
        .set(felder)
        .where(eq(geraete.id, v.id))
        .run();
    } else {
      db.insert(geraete).values({
        id,
        aktiv: true,
        createdAt: new Date(),
        ...felder,
      }).run();
    }
  } catch (e) {
    if (e instanceof Error && e.name === "BarcodeKollision") {
      return barcodeFehler();
    }
    return festerFehler("Gerät konnte nicht gespeichert werden.");
  }

  revalidate(id);
  return { ok: true, wert: { id } };
}

export async function setGeraetAktiv(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  const geparst = AktivSchema.safeParse(eingabe);
  if (!geparst.success) return festerFehler("Ungültige Eingabe.");

  try {
    db.update(geraete)
      .set({ aktiv: geparst.data.aktiv })
      .where(eq(geraete.id, geparst.data.id))
      .run();
  } catch {
    return festerFehler("Gerätestatus konnte nicht geändert werden.");
  }

  revalidate(geparst.data.id);
  return { ok: true };
}

export async function geraetZuBarcode(
  rohwert: string,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string } | null>> {
  await requireLagerbuchAdmin();

  try {
    const barcode = normalisiereBarcode(rohwert);
    if (!barcode) return { ok: true, wert: null };
    return { ok: true, wert: geraetByBarcode(db, barcode) };
  } catch {
    return festerFehler("Gerät konnte nicht gesucht werden.");
  }
}
