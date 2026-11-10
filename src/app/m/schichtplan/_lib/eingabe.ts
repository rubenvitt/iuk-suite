/**
 * Die Eingaben der Planungsseite, geprüft auf dem Server (jede Action parst neu, nie dem Client
 * glauben). Zeiten sind Millisekunden in der Suite-Zone, schon auf das Raster (`RASTER_MIN`) gerastet.
 */
import { z } from "zod";
import { MAX_ANFORDERUNGEN, MIN_SCHICHT_MIN, MINUTE, RASTER_MIN, STUNDE } from "./typen";

const text = (max: number, meldung = "Bitte ausfüllen.") => z.string().trim().min(1, meldung).max(max, `Höchstens ${max} Zeichen.`);
const frei = (max: number) => z.string().trim().max(max, `Höchstens ${max} Zeichen.`);
const imRaster = (ms: number) => ms % (RASTER_MIN * MINUTE) === 0;
const zeitpunkt = z.number().int().refine(imRaster, `Bitte auf ${RASTER_MIN} Minuten genau angeben.`);

/** Ein Planungszeitraum ist höchstens zwei Wochen lang — eine Lage darüber hinaus plant man neu. */
export const MAX_ZEITRAUM = 14 * 24 * STUNDE;

export const qualiSchema = z.object({ kurz: text(40), name: text(120) });

export const planungEingabe = z.object({
  name: text(120, "Bitte einen Namen eingeben."),
  art: z.enum(["veranstaltung", "lage"]),
  ort: frei(120).default(""),
  von: zeitpunkt,
  bis: zeitpunkt,
  maxDienstMin: z.number().int().min(60).max(24 * 60),
  minRuheMin: z.number().int().min(0).max(24 * 60),
}).superRefine((p, ctx) => {
  if (p.bis <= p.von) ctx.addIssue({ code: "custom", path: ["bis"], message: "Das Ende muss nach dem Beginn liegen." });
  else if (p.bis - p.von < MIN_SCHICHT_MIN * MINUTE) ctx.addIssue({ code: "custom", path: ["bis"], message: `Mindestens ${MIN_SCHICHT_MIN} Minuten.` });
  else if (p.bis - p.von > MAX_ZEITRAUM) ctx.addIssue({ code: "custom", path: ["bis"], message: "Höchstens 14 Tage." });
});
export type PlanungEingabe = z.infer<typeof planungEingabe>;

export const einheitEingabe = z.object({
  art: z.enum(["abschnitt", "fahrzeug"]),
  name: text(80, "Bitte einen Namen eingeben."),
  fahrzeugId: z.string().min(1).max(64).nullable().default(null),
  kenner: frei(40).nullable().default(null),
  schichtMin: z.number().int().min(MIN_SCHICHT_MIN, `Mindestens ${MIN_SCHICHT_MIN} Minuten.`).max(24 * 60).refine((m) => m % RASTER_MIN === 0, `Bitte in Schritten von ${RASTER_MIN} Minuten.`),
  soll: z.number().int().min(1, "Mindestens 1.").max(50, "Höchstens 50."),
  anforderungen: z.array(z.object({ quali: qualiSchema, anzahl: z.number().int().min(1).max(50) })).max(MAX_ANFORDERUNGEN, `Höchstens ${MAX_ANFORDERUNGEN} Qualifikationen.`).default([]),
  /** Beim Ändern: alle Schichten der Einheit nach der neuen Länge neu aufteilen (Einteilungen gehen verloren). */
  neuAufteilen: z.boolean().default(false),
});
export type EinheitEingabe = z.infer<typeof einheitEingabe>;

export const schichtZeitEingabe = z.object({ von: zeitpunkt, bis: zeitpunkt }).refine((s) => s.bis > s.von, { path: ["bis"], message: "Das Ende muss nach dem Beginn liegen." })
  .refine((s) => s.bis - s.von >= MIN_SCHICHT_MIN * MINUTE, { path: ["bis"], message: `Eine Schicht dauert mindestens ${MIN_SCHICHT_MIN} Minuten.` })
  .refine((s) => s.bis - s.von <= 24 * STUNDE, { path: ["bis"], message: "Eine Schicht dauert höchstens 24 Stunden." });
export type SchichtZeitEingabe = z.infer<typeof schichtZeitEingabe>;

export const tempHelferEingabe = z.object({
  vorname: text(80, "Bitte einen Vornamen eingeben."),
  nachname: text(80, "Bitte einen Nachnamen eingeben."),
  telefon: frei(40).default(""),
  organisation: frei(120).default(""),
  qualifikationen: z.array(qualiSchema).max(20).default([]),
});
export type TempHelferEingabe = z.infer<typeof tempHelferEingabe>;

export const idSchema = z.string().min(1).max(64);
export const quelleSchema = z.enum(["stamm", "temp"]);
