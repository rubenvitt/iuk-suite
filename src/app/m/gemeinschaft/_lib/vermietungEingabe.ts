/**
 * Die Eingaben der Vermietung, geprüft auf dem Server (jede Action parst neu, nie dem Client glauben). Datum und
 * Uhrzeit kommen als Text (`JJJJ-MM-TT`, `HH:MM`) und werden hier in der Suite-Zone zu Millisekunden — der Browser
 * rechnet nicht mit, damit eine falsch eingestellte Gerätezone nichts verschiebt.
 */
import { z } from "zod";
import { zeitpunkt } from "./zeit";

const STUNDE = 3_600_000;
const TAG = 24 * STUNDE;

/** Eine Anfrage dauert höchstens drei Tage — ein Wochenende mit Auf- und Abbau. */
export const ANFRAGE_MAX_DAUER = 3 * TAG;
/** So weit im Voraus nimmt die Bar Anfragen an (18 Monate). */
export const ANFRAGE_MAX_VORLAUF = 548 * TAG;
export const PERSONEN_MAX = 200;
/** Eine Sperrzeit dauert höchstens ein Vierteljahr (Renovierung). */
export const SPERRE_MAX_DAUER = 92 * TAG;

const text = (max: number, meldung = "Bitte ausfüllen.") => z.string().trim().min(1, meldung).max(max, `Höchstens ${max} Zeichen.`);
const frei = (max: number) => z.string().trim().max(max, `Höchstens ${max} Zeichen.`);
const tag = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Datum wählen.")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "Bitte ein Datum wählen.");
const uhr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Bitte eine Uhrzeit wählen.")
  .refine((s) => Number(s.slice(3)) % 15 === 0, "Bitte auf eine Viertelstunde legen.");

const zeitfelder = { vonTag: tag, vonUhr: uhr, bisTag: tag, bisUhr: uhr };

/**
 * Grob, ob das Kontaktfeld erreichbar aussieht (IDA-387: „abc“ ging durch und stand so auf der Statusseite):
 * eine E-Mail mit Text vor und nach dem @ und einem Punkt dahinter, oder mindestens sechs Ziffern. Mehr nicht —
 * „0151 2345678 (abends)“ bleibt gültig.
 */
export function istKontakt(s: string): boolean {
  return /[^\s@]@[^\s@]+\.[^\s@]/.test(s) || (s.match(/\d/g)?.length ?? 0) >= 6;
}

export const anfrageFelder = z.object({
  ...zeitfelder,
  anlass: text(120, "Bitte den Anlass nennen."),
  personen: z.coerce.number({ message: "Bitte eine Zahl eingeben." }).int("Bitte eine ganze Zahl.").min(1, "Mindestens 1.").max(PERSONEN_MAX, `Höchstens ${PERSONEN_MAX}. Für mehr ist die Bar zu klein.`),
  person: text(120, "Bitte deinen Namen eingeben."),
  kontakt: z.string().trim().min(3, "Bitte Telefon oder E-Mail eingeben.").max(200, "Höchstens 200 Zeichen.")
    .refine(istKontakt, "Bitte eine Telefonnummer oder E-Mail-Adresse eingeben."),
  hinweis: frei(1000).default(""),
  /** Honigtopf: im Formular unsichtbar, ein Mensch lässt es leer. */
  webseite: z.string().max(500).default(""),
});
export type AnfrageFelder = z.infer<typeof anfrageFelder>;

export type FeldFehler = Record<string, string>;
export type Pruefung<T> = { ok: true; wert: T } | { ok: false; feldFehler: FeldFehler };

/** Die geprüfte Anfrage, Zeiten in Millisekunden. */
export type AnfrageWert = Omit<AnfrageFelder, keyof typeof zeitfelder | "webseite"> & { von: number; bis: number; webseite: string };

function feldkarte(e: z.ZodError): FeldFehler {
  const karte: FeldFehler = {};
  for (const p of e.issues) {
    const feld = p.path.join(".") || "_";
    if (!(feld in karte)) karte[feld] = p.message;
  }
  return karte;
}

/** Zeitraum aus den vier Feldern, mit den Grenzen, die für beide Formen gelten. */
function zeitraum(f: { vonTag: string; vonUhr: string; bisTag: string; bisUhr: string }, maxDauer: number, dauerText: string): Pruefung<{ von: number; bis: number }> {
  const von = zeitpunkt(f.vonTag, f.vonUhr);
  const bis = zeitpunkt(f.bisTag, f.bisUhr);
  if (bis <= von) return { ok: false, feldFehler: { bisTag: "Das Ende liegt vor dem Beginn. Prüf bitte Datum und Uhrzeit." } };
  if (bis - von > maxDauer) return { ok: false, feldFehler: { bisTag: dauerText } };
  return { ok: true, wert: { von, bis } };
}

/** Prüft eine öffentliche Anfrage; `jetzt` für „nicht in der Vergangenheit“ und den Vorlauf. */
export function pruefeAnfrage(roh: unknown, jetzt: number): Pruefung<AnfrageWert> {
  const p = anfrageFelder.safeParse(roh);
  if (!p.success) return { ok: false, feldFehler: feldkarte(p.error) };
  const z = zeitraum(p.data, ANFRAGE_MAX_DAUER, "Eine Anfrage dauert höchstens drei Tage.");
  if (!z.ok) return z;
  if (z.wert.von < jetzt) return { ok: false, feldFehler: { vonTag: "Der Beginn liegt in der Vergangenheit." } };
  if (z.wert.von > jetzt + ANFRAGE_MAX_VORLAUF) return { ok: false, feldFehler: { vonTag: "So weit im Voraus nehmen wir noch keine Anfragen an. Frag bitte höchstens 18 Monate vorher." } };
  const d = p.data;
  return { ok: true, wert: { anlass: d.anlass, personen: d.personen, person: d.person, kontakt: d.kontakt, hinweis: d.hinweis, webseite: d.webseite, ...z.wert } };
}

export const sperrzeitFelder = z.object({ ...zeitfelder, grund: text(120, "Bitte einen Grund nennen.").pipe(z.string().min(3, "Mindestens 3 Zeichen.")) });
export type SperrzeitWert = { von: number; bis: number; grund: string };

export function pruefeSperrzeit(roh: unknown): Pruefung<SperrzeitWert> {
  const p = sperrzeitFelder.safeParse(roh);
  if (!p.success) return { ok: false, feldFehler: feldkarte(p.error) };
  const z = zeitraum(p.data, SPERRE_MAX_DAUER, "Eine Sperrzeit dauert höchstens 92 Tage.");
  return z.ok ? { ok: true, wert: { ...z.wert, grund: p.data.grund } } : z;
}

/** Begründung einer Absage oder zurückgenommenen Zusage; die anfragende Person liest sie. */
export const begruendungSchema = z.string().trim().min(5, "Bitte mindestens 5 Zeichen.").max(1000, "Höchstens 1000 Zeichen.");
export const vertragSchema = z.enum(["offen", "verschickt", "unterschrieben"]);
export const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9-]+$/);

/**
 * Rückgabe aller Actions der Vermietung. Rückgabewert statt Wurf: Next ersetzt geworfene Fehlertexte im
 * Produktionsbau durch einen englischen Sammeltext (wie `schichtplan/_lib/actionErgebnis.ts`).
 */
export type Ergebnis<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { wert: T }))
  | { ok: false; fehler: string; feldFehler?: FeldFehler };
