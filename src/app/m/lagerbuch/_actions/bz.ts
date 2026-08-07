"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pruefeBarcodeFrei } from "../_db/barcode";
import { getDb, type DB } from "../_db/client";
import {
  bzGeraete,
  bzKontrollen,
  lagerorte,
  newId,
} from "../_db/schema";
import { type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { normalisiereBarcode } from "../_lib/barcode";
import { MONAT_REGEX } from "../_lib/konstanten";
import { bewerteKontrolle } from "../_lib/domain/bz";
import { bzGeraetByBarcode } from "../_lib/lesepfade/bz";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const LISTENPFAD = "/m/lagerbuch/verwaltung/bz";
const LAGERORT_FEHLER = "Lagerort nicht gefunden oder inaktiv.";
const BARCODE_FEHLER = "Barcode bereits vergeben.";

const GeraetSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  barcode: z.string().trim().optional(),
  lagerortId: z.string().min(1, "Standort wählen"),
  streifenLot: z.string().trim().optional(),
  level1Label: z.string().trim().optional(),
  level1Min: z.coerce.number().int().optional(),
  level1Max: z.coerce.number().int().optional(),
  level2Label: z.string().trim().optional(),
  level2Min: z.coerce.number().int().optional(),
  level2Max: z.coerce.number().int().optional(),
});

const AktivSchema = z.object({
  id: z.string().min(1),
  aktiv: z.boolean(),
});

const KontrolleSchema = z.object({
  geraetId: z.string().min(1),
  level1Wert: z.coerce.number().int().optional(),
  level2Wert: z.coerce.number().int().optional(),
  kompresseVerfall: z.string()
    .regex(MONAT_REGEX, "Verfall muss YYYY-MM sein")
    .optional(),
  sticks: z.coerce.number().int().min(0).max(9999).default(0),
  lanzetten: z.coerce.number().int().min(0).max(9999).default(0),
  batterieGewechselt: z.coerce.boolean().default(false),
  kommentar: z.string().trim().optional(),
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

function orNull<T>(value: T | undefined): T | null {
  return value === undefined || value === "" ? null : value;
}

function revalidate(id: string) {
  revalidatePath(LISTENPFAD);
  revalidatePath(`${LISTENPFAD}/${id}`);
}

/**
 * Die drei Geraete-Actions tragen absichtlich dieselben Namen wie die
 * generischen Geraete-Actions: gleicher Vorgang, eigener Fachbereich.
 */
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
        v.id ? { tabelle: "bzGeraet", id: v.id } : null,
      );
    }

    const felder = {
      name: v.name,
      barcode,
      lagerortId: v.lagerortId,
      streifenLot: orNull(v.streifenLot),
      level1Label: orNull(v.level1Label),
      level1Min: orNull(v.level1Min),
      level1Max: orNull(v.level1Max),
      level2Label: orNull(v.level2Label),
      level2Min: orNull(v.level2Min),
      level2Max: orNull(v.level2Max),
    };

    if (v.id) {
      db.update(bzGeraete)
        .set(felder)
        .where(eq(bzGeraete.id, v.id))
        .run();
    } else {
      db.insert(bzGeraete).values({
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
    return festerFehler("BZ-Gerät konnte nicht gespeichert werden.");
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
    db.update(bzGeraete)
      .set({ aktiv: geparst.data.aktiv })
      .where(eq(bzGeraete.id, geparst.data.id))
      .run();
  } catch {
    return festerFehler("BZ-Gerätestatus konnte nicht geändert werden.");
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
    return { ok: true, wert: bzGeraetByBarcode(db, barcode) };
  } catch {
    return festerFehler("BZ-Gerät konnte nicht gesucht werden.");
  }
}

/**
 * Schreibt genau eine append-only Kontrollzeile. `bewerteKontrolle` liefert die
 * drei Bewertungswerte; der rohe Snapshot friert die sieben Referenzfelder in
 * der vertraglichen Reihenfolge ein.
 */
export async function kontrolleErfassen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string; bestanden: boolean }>> {
  const viewer = await requireLagerbuchAdmin();

  const geparst = KontrolleSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);
  const v = geparst.data;

  let id: string;
  let bestanden: boolean;
  try {
    const geraet = db.select().from(bzGeraete)
      .where(eq(bzGeraete.id, v.geraetId))
      .get();
    if (!geraet) return festerFehler("Gerät nicht gefunden.");

    const level1Wert = v.level1Wert ?? null;
    const level2Wert = v.level2Wert ?? null;
    const bewertung = bewerteKontrolle({
      level1Wert,
      level1Min: geraet.level1Min,
      level1Max: geraet.level1Max,
      level2Wert,
      level2Min: geraet.level2Min,
      level2Max: geraet.level2Max,
    });

    const refSnapshot = JSON.stringify({
      streifenLot: geraet.streifenLot,
      level1Label: geraet.level1Label,
      level1Min: geraet.level1Min,
      level1Max: geraet.level1Max,
      level2Label: geraet.level2Label,
      level2Min: geraet.level2Min,
      level2Max: geraet.level2Max,
    });

    id = newId();
    bestanden = bewertung.bestanden;
    db.insert(bzKontrollen).values({
      id,
      geraetId: geraet.id,
      ts: new Date(),
      quelleTyp: "oidc",
      quelleId: viewer.sub,
      level1Wert,
      level1ImBereich: bewertung.level1ImBereich,
      level2Wert,
      level2ImBereich: bewertung.level2ImBereich,
      kompresseVerfall: v.kompresseVerfall ?? null,
      sticks: v.sticks,
      lanzetten: v.lanzetten,
      batterieGewechselt: v.batterieGewechselt,
      kommentar: orNull(v.kommentar),
      bestanden,
      refSnapshot,
    }).run();
  } catch {
    return festerFehler("Kontrolle konnte nicht gespeichert werden.");
  }

  revalidate(v.geraetId);
  return { ok: true, wert: { id, bestanden } };
}
