import { z } from "zod";
import { GRENZE, kontaktSchema, LAENGE, VERBINDUNGS_ARTEN } from "../plan/schema";

/**
 * Eingaben der Bibliothek (Entscheidungen 11, 12) — dieselben Feldgrenzen wie im Plan (`LAENGE`), damit eine
 * Kopie nie an einem Schemafehler des Plans scheitert. `id: null` heißt „neu".
 */
export const BIB_GRENZE = { eintraege: 2000, notiz: 500, import: 500 } as const;
const leerZuNull = (v: unknown) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v);
const pflicht = (laenge: number, leer: string) => z.string().trim().min(1, leer).max(laenge, `Höchstens ${laenge} Zeichen.`);
const frei = (laenge: number) => z.preprocess(leerZuNull, z.string().max(laenge, `Höchstens ${laenge} Zeichen.`).nullable());
const id = z.string().min(1).max(64).nullable();
const notiz = frei(BIB_GRENZE.notiz);
const zeichen = frei(80);

export const bibStelleSchema = z.object({
  id, titel: pflicht(LAENGE.titel, "Bitte einen Titel eintragen."), zeichen, leiter: frei(LAENGE.leiter),
  kontakte: z.array(kontaktSchema).max(GRENZE.kontakte, `Höchstens ${GRENZE.kontakte} Kontakte.`)
    .transform((k) => k.filter((x) => x.wert.trim() !== "")),
  notiz,
}).strict();
export const bibEinheitSchema = z.object({
  id, typ: pflicht(LAENGE.typ, "Bitte einen Typ eintragen."), rufname: pflicht(LAENGE.rufname, "Bitte einen Rufnamen eintragen."), zeichen, notiz,
}).strict();
export const bibVerbindungSchema = z.object({
  id, art: z.enum(VERBINDUNGS_ARTEN, { error: "Bitte eine Art wählen." }), bezeichnung: pflicht(LAENGE.bezeichnung, "Bitte eine Bezeichnung eintragen."), notiz,
}).strict();
export const bibImportSchema = z.array(z.object({
  typ: pflicht(LAENGE.typ, "Bitte einen Typ eintragen."), rufname: pflicht(LAENGE.rufname, "Bitte einen Rufnamen eintragen."), notiz,
  zeichen: zeichen.optional(),
}).strict()).min(1, "Die Liste ist leer.").max(BIB_GRENZE.import, `Höchstens ${BIB_GRENZE.import} Zeilen je Import.`);
export const bibVerbindungsImportSchema = z.array(z.object({
  art: z.enum(VERBINDUNGS_ARTEN, { error: "Bitte eine Art wählen." }), bezeichnung: pflicht(LAENGE.bezeichnung, "Bitte eine Bezeichnung eintragen."),
}).strict()).min(1, "Der Plan hat keine Verbindungen.").max(BIB_GRENZE.import, `Höchstens ${BIB_GRENZE.import} Zeilen je Import.`);
export const bibLoeschSchema = z.object({ art: z.enum(["stelle", "einheit", "verbindung"]), id: z.string().min(1).max(64) }).strict();
