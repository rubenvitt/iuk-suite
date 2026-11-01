/**
 * Die Eingaben der Planung, geprüft auf dem Server (jede Action parst neu, nie dem Client glauben).
 * Zeitpunkte sind Millisekunden, Kalendertage `JJJJ-MM-TT`.
 */
import { z } from "zod";

const STUNDE = 3_600_000;
/** Ein Event dauert höchstens zwei Wochen; was länger läuft, ist ein Projekt. */
export const MAX_EVENT_DAUER = 14 * 24 * STUNDE;
/** Höchstens so viele Zuständige je Aufgabe — mehr ist keine Aufgabe, sondern ein Aufruf an alle. */
export const MAX_ZUSTAENDIGE = 30;
/** Höchstens so viele Aufgaben je Event oder Projekt. */
export const MAX_AUFGABEN = 200;

const text = (min: number, max: number, meldung: string) => z.string().trim().min(min, meldung).max(max, `Höchstens ${max} Zeichen.`);
const frei = (max: number) => z.string().trim().max(max, `Höchstens ${max} Zeichen.`);

export const idSchema = z.string().min(1).max(64);
const kalendertag = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Datum wählen.").refine((t) => {
  const [j, m, d] = t.split("-").map(Number);
  const x = new Date(Date.UTC(j, m - 1, d));
  return x.getUTCFullYear() === j && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
}, "Bitte ein gültiges Datum wählen.");
/** Zwischen 2000 und 2100, damit kein Tippfehler ein Event ins Jahr 20026 legt. */
const zeitpunkt = z.number().int().min(Date.UTC(2000, 0, 1)).max(Date.UTC(2100, 0, 1));

const gemeinsam = {
  titel: text(3, 120, "Bitte einen Titel mit mindestens drei Zeichen eingeben."),
  beschreibung: frei(2000).default(""),
  verantwortlichId: idSchema.nullable().default(null),
};

export const eventEingabe = z.object({
  art: z.literal("event"),
  ...gemeinsam,
  von: zeitpunkt,
  bis: zeitpunkt,
  ort: frei(120).default(""),
  barBelegen: z.boolean().default(false),
  projektId: idSchema.nullable().default(null),
}).superRefine((e, ctx) => {
  if (e.bis <= e.von) ctx.addIssue({ code: "custom", path: ["bis"], message: "Das Ende muss nach dem Beginn liegen." });
  else if (e.bis - e.von > MAX_EVENT_DAUER) ctx.addIssue({ code: "custom", path: ["bis"], message: "Ein Event dauert höchstens 14 Tage." });
});

export const projektEingabe = z.object({
  art: z.literal("projekt"),
  ...gemeinsam,
  ziel: kalendertag.nullable().default(null),
});

export const vorhabenEingabe = z.discriminatedUnion("art", [eventEingabe, projektEingabe]);
export type VorhabenEingabe = z.infer<typeof vorhabenEingabe>;
export type EventEingabe = z.infer<typeof eventEingabe>;
export type ProjektEingabe = z.infer<typeof projektEingabe>;

export const zustaendigSchema = z.array(idSchema).max(MAX_ZUSTAENDIGE, `Höchstens ${MAX_ZUSTAENDIGE} Zuständige.`)
  .transform((ids) => [...new Set(ids)]);

export const aufgabeEingabe = z.object({
  titel: text(2, 200, "Bitte die Aufgabe mit mindestens zwei Zeichen beschreiben."),
  zustaendig: zustaendigSchema.default([]),
  faellig: kalendertag.nullable().default(null),
});
export type AufgabeEingabe = z.infer<typeof aufgabeEingabe>;
