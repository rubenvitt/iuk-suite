"use server";

import { and, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { artikel, lagerorte, newId, tokens } from "../_db/schema";
import { type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import {
  TOKEN_ALPHABET,
  TOKEN_ZIEHUNGEN,
  TOKEN_ZIFFERN,
} from "../_lib/tokenForm";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const LISTENPFAD = "/m/lagerbuch/verwaltung/tokens";
const CODE_FEHLER =
  "Es konnte kein freier Code erzeugt werden — bitte erneut versuchen.";
const ANLEGEN_FEHLER = "Zugangs-Code konnte nicht angelegt werden.";
const STATUS_FEHLER = "Zugangs-Code-Status konnte nicht geändert werden.";
const FAHRZEUG_FEHLER = "Fahrzeug nicht gefunden oder inaktiv.";
const ARTIKEL_FEHLER = "Artikel nicht gefunden oder inaktiv.";

/**
 * §8.3 — DER TOKEN-VERTRAG. Alphabet, Laenge und Ziehungszahl stehen seit T160
 * benannt in `_lib/tokenForm.ts` und werden hier nur noch BENUTZT. Sie stehen
 * nicht in dieser Datei, weil eine `"use server"`-Datei ausschliesslich Actions
 * exportiert (T126 hat das so uebergeben; der Bauform-Scan in
 * `_actions/guards.test.ts` — Zusicherung „kennt an einem Zeilenanfang mit
 * `export` NUR die eine Action-Bauform und Typ-Exporte" — meldet jede andere
 * Form).
 *
 * Der Bindestrich ist Teil des gespeicherten Werts. `normalisiereCode` fuegt
 * ihn beim Einloesen derselben sechs Ziffern wieder ein.
 */
const sechsZiffern = customAlphabet(TOKEN_ALPHABET, TOKEN_ZIFFERN);

/**
 * ENTSCHEIDUNG 8-F: Die Kollisionspruefung laeuft gegen ALLE vorhandenen
 * Zeilen, ohne `aktiv`-Bedingung — und das war schon immer so. Loechrig war sie
 * nur, weil Zeilen per Hard-Delete verschwinden konnten. Mit dem Wegfall des
 * Token-Hard-Deletes (`_actions/loeschen.ts`) schliesst sich die Luecke OHNE
 * eine Zeile hier: kein neuer Wurf, keine geaenderte Signatur, derselbe
 * Nullpfad. Eine `verbrauchte_codes`-Tabelle (Option b der Analyse) waere
 * teurer ohne Zusatznutzen.
 */
function erzeugeFreienCode(db: DB): string | null {
  for (let versuch = 0; versuch < TOKEN_ZIEHUNGEN; versuch++) {
    const ziffern = sechsZiffern();
    const code = `${ziffern.slice(0, 3)}-${ziffern.slice(3)}`;
    const belegt = db.select({ id: tokens.id })
      .from(tokens)
      .where(eq(tokens.code, code))
      .get();
    if (!belegt) return code;
  }
  return null;
}

const CreateSchema = z.object({
  label: z.string().trim().min(1, "Bezeichnung erforderlich"),
  zielTyp: z.enum(["fahrzeug", "artikel"]).optional(),
  zielId: z.string().min(1).optional(),
}).refine(
  (wert) => (wert.zielTyp ? Boolean(wert.zielId) : !wert.zielId),
  { message: "Ziel unvollständig", path: ["zielId"] },
);

const AktivSchema = z.object({
  id: z.string().min(1),
  aktiv: z.boolean(),
});

type FehlerErgebnis = Extract<ActionErgebnis, { ok: false }>;

function festerFehler(fehler: string): FehlerErgebnis {
  return { ok: false, fehler };
}

function validierungsFehler(e: unknown): FehlerErgebnis {
  const feldFehler = zodFehler(e);
  return {
    ok: false,
    fehler: "Bitte die markierten Felder prüfen.",
    ...(feldFehler ? { feldFehler } : {}),
  };
}

function zielFehler(fehler: string): FehlerErgebnis {
  return {
    ok: false,
    fehler,
    feldFehler: { zielId: fehler },
  };
}

export async function createToken(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string; code: string }>> {
  const viewer = await requireLagerbuchAdmin();

  const geparst = CreateSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);
  const v = geparst.data;
  let angelegt: { id: string; code: string } | undefined;

  try {
    if (v.zielTyp === "fahrzeug") {
      const fahrzeug = db.select({ id: lagerorte.id })
        .from(lagerorte)
        .where(and(
          eq(lagerorte.id, v.zielId!),
          eq(lagerorte.typ, "fahrzeug"),
          eq(lagerorte.aktiv, true),
        )!)
        .get();
      if (!fahrzeug) return zielFehler(FAHRZEUG_FEHLER);
    } else if (v.zielTyp === "artikel") {
      const zielArtikel = db.select({ id: artikel.id })
        .from(artikel)
        .where(and(
          eq(artikel.id, v.zielId!),
          eq(artikel.aktiv, true),
        )!)
        .get();
      if (!zielArtikel) return zielFehler(ARTIKEL_FEHLER);
    }

    const code = erzeugeFreienCode(db);
    if (!code) return festerFehler(CODE_FEHLER);

    const id = newId();
    db.insert(tokens).values({
      id,
      code,
      label: v.label,
      zielTyp: v.zielTyp ?? null,
      zielId: v.zielTyp ? v.zielId! : null,
      aktiv: true,
      createdAt: new Date(),
      createdBy: viewer.sub,
    }).run();
    angelegt = { id, code };
  } catch {
    return festerFehler(ANLEGEN_FEHLER);
  }

  if (!angelegt) return festerFehler(ANLEGEN_FEHLER);
  revalidatePath(LISTENPFAD);
  return { ok: true, wert: angelegt };
}

export async function setTokenAktiv(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  const geparst = AktivSchema.safeParse(eingabe);
  if (!geparst.success) return festerFehler("Ungültige Eingabe.");

  try {
    db.update(tokens)
      .set({ aktiv: geparst.data.aktiv })
      .where(eq(tokens.id, geparst.data.id))
      .run();
  } catch {
    return festerFehler(STATUS_FEHLER);
  }

  revalidatePath(LISTENPFAD);
  return { ok: true };
}
