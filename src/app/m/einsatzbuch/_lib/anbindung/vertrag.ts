/**
 * Drahtvertrag zwischen Suite und Desktop-App (Plan Stufe 5, Tabelle „Schnittstellen“). Diese
 * Schemas sind maßgeblich; die Beispiele unter `vertrag/*.json` prüft `vertrag.test.ts` gegen sie,
 * und der Rust-Kern liest dieselben Dateien mit `deny_unknown_fields`. Deshalb ist jedes Objekt
 * `.strict()`, und kein Antwortschema formt Werte um. Zeitpunkte tragen immer einen Offset.
 */
import { z } from "zod";
import { cekSchema, istEchterZeitpunkt, kopfSchema, umschlagSchema } from "../reader/pruefung";
import { GEHEIMNIS } from "./token";

const geheimnis = z.string().regex(GEHEIMNIS);
const zeitpunkt = z.string().refine(istEchterZeitpunkt, "kein Zeitpunkt mit Offset");
const art = z.enum(["echt", "test"]);
const hex = (n: number) => z.string().regex(new RegExp(`^[0-9a-f]{${n}}$`));

export const tauschAnfrage = z.object({
  code: geheimnis,
  verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
}).strict();

const einrichtungswunsch = z.object({ art, name: z.string().min(1).max(60), ersetzen: z.boolean() }).strict();

export const tauschAntwort = z.object({
  sitzungstoken: geheimnis,
  name: z.string(),
  ablauf: zeitpunkt,
  rechnerId: z.string().nullable(),
  einrichtung: einrichtungswunsch.nullable(),
}).strict();
export type TauschAntwort = z.infer<typeof tauschAntwort>;

export const einrichtenAnfrage = z.object({ art, name: z.string().trim().min(1).max(60) }).strict();

export const stammdatenpaketSchema = z.object({
  version: z.number().int().min(0),
  stammdaten: z.object({
    fahrzeuge: z.array(z.object({ id: z.string(), typ: z.string(), kennung: z.string(), ruf: z.string(), standort: z.string() }).strict()),
    personal: z.array(z.object({ id: z.string(), name: z.string(), quali: z.string(), ov: z.string() }).strict()),
    stichworte: z.array(z.object({ name: z.string(), items: z.array(z.string()) }).strict()),
  }).strict(),
  fristMinuten: z.number().int().min(1).max(120),
  besatzung: z.boolean(),
  zeitzone: z.string().min(1),
  bereitschaft: z.string(),
}).strict();
export type Stammdatenpaket = z.infer<typeof stammdatenpaketSchema>;

export const einrichtenAntwort = z.object({
  rechnerId: z.string().min(1),
  art,
  name: z.string(),
  geraeteToken: geheimnis,
  oeffentlichSpki: z.string().min(1),
  schluesselId: hex(16),
  paket: stammdatenpaketSchema,
  eingerichtetAm: zeitpunkt,
  eingerichtetVon: z.string(),
}).strict();
export type EinrichtenAntwort = z.infer<typeof einrichtenAntwort>;

export const ankerAnfrage = z.object({ block: z.number().int().min(1).max(10_000), hash: hex(64) }).strict();

/**
 * Abfrage von `GET /api/anker?erster=<hash>` (Entscheidung 5): `erster` ist der Hash von Block 1
 * der Kette, deren Anker gesucht ist — er macht die Kette erkennbar, damit die Anker einer
 * älteren, verlorenen Kette nicht mitzählen.
 */
export const kettenankerAbfrage = z.object({ erster: hex(64) }).strict();

/**
 * Antwort von `GET /api/anker` (Entscheidung 5): der höchste Suite-Anker der Kette mit dem
 * Block-1-Hash `erster`, oder `null` ohne einen. Anders als `ankerAnfrage` ohne Obergrenze auf
 * `block` — die Kette kann inzwischen weiter sein, als `POST anker` je gesehen hat.
 */
export const kettenankerAntwort = z.object({
  anker: z.object({ block: z.number().int().min(1), hash: hex(64) }).strict().nullable(),
}).strict();
export type KettenankerAntwort = z.infer<typeof kettenankerAntwort>;

export const sicherungAnfrage = z.object({ erstellt: zeitpunkt }).strict();

/**
 * Kopf und Umschlag so streng wie im Reader (`exportinhaltSchema`). Bewusst ohne `.max(200)`:
 * mehr als 200 Einträge sind `413 zu_viele` (`gibFrei`), keine `400 validation_error`.
 */
export const freigabeAnfrage = z.array(z.object({ kopf: kopfSchema, umschlag: umschlagSchema }).strict()).min(1);

export const freigabeAntwort = z.array(z.object({ block: z.number().int().min(1), cek: cekSchema }).strict());

/**
 * Fehlerkörper: `{ error: { code, message } }`, dazu höchstens die Zusatzfelder, die der Rust-Kern
 * kennt (`Fehlerkoerper` in `kern/src/vertrag.rs`). Ein neues Zusatzfeld braucht beide Seiten.
 */
export const fehlerKoerper = z.object({
  error: z.object({ code: z.string().min(1), message: z.string() }).strict(),
  erwartet: z.string().optional(),
  eingerichtetAm: zeitpunkt.optional(),
  eingerichtetVon: z.string().optional(),
  feld: z.string().optional(),
  eintrag: z.string().optional(),
}).strict();

export function fehler(status: number, code: string, message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ ...extra, error: { code, message } }, { status });
}
