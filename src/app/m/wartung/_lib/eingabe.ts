/**
 * Eingaben der Gerätewartung, geprüft auf dem Server (Actions und Route Handler). Die Grenzen lesen auch die
 * Formulare — deshalb ohne `"use client"` (Falle 6).
 */
import { z } from "zod";
import type { Icons8Name } from "@/core/ikonen/katalog";

export const NAME_MAX = 80;
export const KURZ_MAX = 60;
export const NOTIZ_MAX = 500;
export const PUNKT_MAX = 120;
export const STUNDEN_MAX = 1_000_000;
/** Positionen einer Materialkiste (IDA-335) — sie müssen noch auf ein Etikett passen. */
export const INHALT_MAX = 40;
export const SOLL_MAX = 9999;

/** Zeichen, aus denen eine Geräteart wählt. */
export const ART_IKONEN: readonly { name: Icons8Name; titel: string }[] = [
  { name: "engine", titel: "Motor" },
  { name: "fire", titel: "Flamme" },
  { name: "charging-battery", titel: "Akku" },
  { name: "computer", titel: "Rechner" },
  { name: "flashlight", titel: "Leuchte" },
  { name: "wind", titel: "Lüfter" },
  { name: "walkie-talkie", titel: "Funk" },
  { name: "monitor", titel: "Bildschirm" },
  { name: "tent", titel: "Zelt" },
  { name: "package", titel: "Kiste" },
  { name: "wrench", titel: "Werkzeug" },
];

export function artIkone(name: string): Icons8Name {
  return ART_IKONEN.find((i) => i.name === name)?.name ?? "wrench";
}

export const idSchema = z.string().uuid();

const tag = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Datum wählen.");
const stunden = z.number().int("Bitte ganze Stunden.").min(0, "Nicht negativ.").max(STUNDEN_MAX).nullable();
const pflicht = (max: number, meldung: string) => z.string().trim().min(1, meldung).max(max, `Höchstens ${max} Zeichen.`);
const frei = (max: number) => z.string().trim().max(max, `Höchstens ${max} Zeichen.`);

export const geraetEingabe = z.object({
  gruppeId: idSchema,
  artId: idSchema,
  name: pflicht(NAME_MAX, "Bitte eine Bezeichnung angeben."),
  hersteller: frei(KURZ_MAX),
  typ: frei(KURZ_MAX),
  seriennr: frei(KURZ_MAX),
  ortArt: z.enum(["lager", "fahrzeug"]),
  ort: pflicht(NAME_MAX, "Wo steht das Gerät?"),
  /** Das Fahrzeug der Fahrzeugverwaltung (IDA-342); `null` im Lager und bei einem Fahrzeug von woanders. */
  fahrzeugId: z.string().min(1).max(100).nullable().default(null),
  stunden,
  hinweise: frei(NOTIZ_MAX).default(""),
});
export type GeraetEingabe = z.infer<typeof geraetEingabe>;

export const erledigtEingabe = z.object({
  fristId: idSchema,
  am: tag,
  stunden,
  wer: frei(NAME_MAX),
  notiz: frei(NOTIZ_MAX),
});
export type ErledigtEingabe = z.infer<typeof erledigtEingabe>;

export const stundenEingabe = z.object({ stunden: z.number().int().min(0).max(STUNDEN_MAX) });

export const fristEingabe = z.object({
  id: idSchema.nullable(),
  name: pflicht(KURZ_MAX, "Bitte die Frist benennen."),
  wer: z.enum(["intern", "fachfirma", "elektrofachkraft"]),
  monate: z.number().int().min(1).max(120).nullable(),
  stunden: z.number().int().min(1).max(100_000).nullable(),
}).refine((f) => f.monate !== null || f.stunden !== null, { message: "Monate oder Stunden angeben.", path: ["monate"] });

export const punktEingabe = z.object({
  id: idSchema.nullable(),
  text: pflicht(PUNKT_MAX, "Bitte den Punkt benennen."),
  hinweis: frei(NOTIZ_MAX),
});

export const artEingabe = z.object({
  name: pflicht(KURZ_MAX, "Bitte einen Namen angeben."),
  einzahl: pflicht(KURZ_MAX, "Bitte die Einzahl angeben."),
  ikone: z.string(),
  stundenPflicht: z.boolean(),
  kiste: z.boolean(),
  fristen: z.array(fristEingabe).min(1, "Mindestens eine Frist.").max(10),
  checkliste: z.array(punktEingabe).max(40),
}).refine((a) => a.fristen.filter((f) => f.wer === "intern").length <= 1, {
  message: "Nur eine Frist wird selbst am Gerät erledigt.", path: ["fristen"],
}).refine((a) => !(a.kiste && a.stundenPflicht), {
  message: "Eine Materialkiste hat keine Betriebsstunden.", path: ["stundenPflicht"],
}).refine((a) => !a.kiste || a.fristen.every((f) => f.stunden === null), {
  message: "Eine Materialkiste hat keine Betriebsstunden.", path: ["fristen"],
}).refine((a) => !a.kiste || a.fristen.some((f) => f.wer === "intern"), {
  message: "Eine Materialkiste braucht eine Frist, die selbst durchgezählt wird.", path: ["fristen"],
}).refine((a) => a.kiste || !a.fristen.some((f) => f.wer === "intern") || a.checkliste.length > 0, {
  message: "Die Prüfung am Gerät braucht mindestens einen Punkt.", path: ["checkliste"],
});
export type ArtEingabe = z.infer<typeof artEingabe>;

/** Die Inhaltsliste einer Materialkiste, ganz (IDA-335): Reihenfolge wie übergeben. */
export const inhaltEingabe = z.array(z.object({
  id: idSchema.nullable(),
  text: pflicht(PUNKT_MAX, "Was liegt in der Kiste?"),
  soll: z.number({ message: "Bitte eine Menge angeben." }).int("Bitte eine ganze Zahl.").min(1, "Mindestens 1.").max(SOLL_MAX),
  bemerkung: frei(KURZ_MAX),
})).max(INHALT_MAX, `Höchstens ${INHALT_MAX} Positionen.`);
export type InhaltEingabe = z.infer<typeof inhaltEingabe>;

export const gruppeEingabe = z.object({
  name: pflicht(40, "Bitte einen Namen angeben."),
});

/** Eine Person einer Gruppe zuordnen oder dort entfernen (IDA-337). */
export const verwalterEingabe = z.object({ gruppeId: idSchema, nutzer: z.string().trim().min(1).max(200) }).strict();
export type GruppeEingabe = z.infer<typeof gruppeEingabe>;

/** Die Prüfung am Gerät, wie sie die Route bekommt (Fotos getrennt im multipart). */
export const pruefungEingabe = z.object({
  /** Vom Telefon je Prüfung einmal gezogen: kommt sie zweimal an, steht sie trotzdem nur einmal da. */
  sendung: idSchema,
  stunden,
  antworten: z.array(z.object({
    punktId: idSchema, ok: z.boolean(), text: frei(NOTIZ_MAX),
    /** Nur beim Durchzählen: Soll-Menge, Wortlaut und Bemerkung der Position, gegen die gezählt wurde (IDA-335). */
    soll: z.number().int().min(1).max(SOLL_MAX).optional(),
    punkt: z.string().max(PUNKT_MAX).optional(),
    hinweis: z.string().max(KURZ_MAX).optional(),
  })).max(INHALT_MAX)
    .refine((a) => new Set(a.map((x) => x.punktId)).size === a.length, "Jeder Punkt der Checkliste darf nur einmal vorkommen."),
  ergebnis: z.enum(["ok", "mangel", "defekt"]),
  notiz: frei(NOTIZ_MAX),
});
export type PruefungEingabe = z.infer<typeof pruefungEingabe>;

export const mangelEingabe = z.object({
  text: pflicht(NOTIZ_MAX, "Bitte kurz beschreiben, was los ist."),
  einsatzbereit: z.boolean(),
  /** Nur ohne Anmeldung: wer meldet, freiwillig (IDA-337). */
  name: z.string().trim().max(NAME_MAX).default(""),
});

/** Titel einer Unterlage am Gerät (IDA-300), z. B. „Kurzanleitung“. */
export const unterlageTitel = pflicht(KURZ_MAX, "Bitte die Unterlage benennen.");
/** Höchstens so viele Unterlagen je Gerät. */
export const UNTERLAGEN_MAX = 12;

/** Erste Meldung je Feld aus einem Zod-Fehler. */
export function feldFehlerAus(fehler: z.ZodError): Record<string, string> {
  const ergebnis: Record<string, string> = {};
  for (const p of fehler.issues) {
    const feld = p.path.join(".") || "_";
    if (!(feld in ergebnis)) ergebnis[feld] = p.message;
  }
  return ergebnis;
}
