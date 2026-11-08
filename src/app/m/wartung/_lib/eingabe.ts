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
  pruefanleitung: frei(NOTIZ_MAX).default(""),
});
export type GeraetEingabe = z.infer<typeof geraetEingabe>;

export const erledigtEingabe = z.object({
  pruefartId: idSchema,
  am: tag,
  stunden,
  wer: frei(NAME_MAX),
  notiz: frei(NOTIZ_MAX),
});
export type ErledigtEingabe = z.infer<typeof erledigtEingabe>;

/** `sendung` (IDA-358): die Sendungs-ID des Telefons, wird die ID des Eintrags — optional für offene alte Seiten. */
export const stundenEingabe = z.object({ stunden: z.number().int().min(0).max(STUNDEN_MAX), sendung: idSchema.optional() });

const monate = z.number().int("Bitte ganze Monate.").min(1, "Mindestens 1.").max(120, "Höchstens 120.").nullable();
const intervallStunden = z.number().int("Bitte ganze Stunden.").min(1, "Mindestens 1.").max(100_000).nullable();

/**
 * Eine Prüfart des Katalogs (IDA-368). Mit `anlass` (IDA-369) ist sie fällig, wenn das Gerät eingesetzt wird bzw.
 * zurückkommt: dann ohne Intervall, und erledigt wird sie selbst am Gerät.
 */
export const pruefartEingabe = z.object({
  name: pflicht(KURZ_MAX, "Bitte die Prüfart benennen."),
  wer: z.enum(["intern", "fachfirma", "elektrofachkraft"]),
  monate,
  stunden: intervallStunden,
  anlass: z.enum(["einsatz", "rueckkehr"]).nullable().default(null),
}).refine((f) => f.anlass !== null || f.monate !== null || f.stunden !== null, { message: "Monate oder Stunden angeben.", path: ["monate"] })
  .refine((f) => f.anlass === null || f.wer === "intern", { message: "Vor oder nach dem Einsatz prüft man selbst am Gerät.", path: ["wer"] })
  .transform((f) => (f.anlass ? { ...f, monate: null, stunden: null } : f));
/** Wie sie hereinkommt (`anlass` darf fehlen); geprüft wird mit `pruefartEingabe`. */
export type PruefartEingabe = z.input<typeof pruefartEingabe>;

/**
 * Der Prüfplan eines Geräts, ganz (IDA-368): je Prüfart, ob sie gilt, und ein eigenes Intervall. Prüfarten der Art,
 * die hier fehlen, gelten wie bei der Art.
 */
export const pruefplanEingabe = z.array(z.object({
  pruefartId: idSchema,
  an: z.boolean(),
  /** Eigenes Intervall statt dem des Katalogs; beide `null` heißt: wie im Katalog. */
  eigenes: z.object({ monate, stunden: intervallStunden })
    .refine((e) => e.monate !== null || e.stunden !== null, { message: "Monate oder Stunden angeben.", path: ["monate"] })
    .nullable(),
})).max(40).refine((l) => new Set(l.map((x) => x.pruefartId)).size === l.length, "Jede Prüfart nur einmal.");
export type PruefplanEingabe = z.infer<typeof pruefplanEingabe>;

export const punktEingabe = z.object({
  id: idSchema.nullable(),
  text: pflicht(PUNKT_MAX, "Bitte den Punkt benennen."),
  hinweis: frei(NOTIZ_MAX),
  /** Zu welchen Prüfarten der Punkt gehört (IDA-369); leer heißt zu allen. */
  pruefarten: z.array(idSchema).max(20).default([]).refine((l) => new Set(l).size === l.length, "Jede Prüfart nur einmal."),
});

export const artEingabe = z.object({
  name: pflicht(KURZ_MAX, "Bitte einen Namen angeben."),
  einzahl: pflicht(KURZ_MAX, "Bitte die Einzahl angeben."),
  ikone: z.string(),
  stundenPflicht: z.boolean(),
  kiste: z.boolean(),
  /** Die Prüfarten des Katalogs, die jedes Gerät dieser Art von sich aus hat (IDA-368). Was sie verlangen, prüft `artSpeichern`. */
  pruefarten: z.array(idSchema).max(20).refine((l) => new Set(l).size === l.length, "Jede Prüfart nur einmal."),
  checkliste: z.array(punktEingabe).max(40),
}).refine((a) => !(a.kiste && a.stundenPflicht), {
  message: "Eine Materialkiste hat keine Betriebsstunden.", path: ["stundenPflicht"],
});
/** Wie sie hereinkommt (die Prüfarten eines Punkts dürfen fehlen); geprüft wird mit `artEingabe`. */
export type ArtEingabe = z.input<typeof artEingabe>;

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
  /** Welche Prüfung (IDA-369); fehlt sie (alte offene Seite), die fällige wie beim Öffnen ohne Auswahl. */
  pruefartId: idSchema.optional(),
  stunden,
  antworten: z.array(z.object({
    punktId: idSchema, ok: z.boolean(), text: frei(NOTIZ_MAX),
    /** Nur beim Durchzählen: Soll-Menge, Wortlaut und Bemerkung der Position, gegen die gezählt wurde (IDA-335). */
    soll: z.number().int().min(1).max(SOLL_MAX).optional(),
    punkt: z.string().max(PUNKT_MAX).optional(),
    hinweis: z.string().max(KURZ_MAX).optional(),
    /** Nur beim Durchzählen: so viele dieser Position sind gerade unterwegs (IDA-372); fehlt = 0. */
    unterwegs: z.number().int().min(0).max(SOLL_MAX).optional(),
  })).max(INHALT_MAX)
    .refine((a) => new Set(a.map((x) => x.punktId)).size === a.length, "Jeder Punkt der Checkliste darf nur einmal vorkommen."),
  ergebnis: z.enum(["ok", "mangel", "defekt"]),
  notiz: frei(NOTIZ_MAX),
  /** Entnahme-ID der offenen ganzen Entnahme: dieses Durchzählen legt die Kiste zurück (IDA-372). */
  rueckgabe: idSchema.optional(),
});
export type PruefungEingabe = z.infer<typeof pruefungEingabe>;

/** „Wird eingesetzt“ bzw. „Zurück“ (IDA-369). */
export const anlassEingabe = z.enum(["einsatz", "rueckkehr"]);

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

/** Eine Entnahme aus einer Kiste (IDA-372); `sendung` macht sie idempotent. */
export const entnahmeEingabe = z.object({
  sendung: idSchema,
  ganz: z.boolean(),
  zweck: frei(KURZ_MAX).default(""),
  positionen: z.array(z.object({ inhaltId: idSchema, menge: z.number().int().min(1).max(SOLL_MAX) })).max(INHALT_MAX),
});
export type EntnahmeEingabe = z.infer<typeof entnahmeEingabe>;

export const rueckgabeEingabe = z.object({
  entnahmeId: idSchema,
  // je Position: was jetzt zurückkommt, ob der Rest fehlt, und die Offen-Menge, die auf dem Bildschirm stand
  positionen: z.array(z.object({
    positionId: idSchema, zurueck: z.number().int().min(0).max(SOLL_MAX), fehlt: z.boolean(), offen: z.number().int().min(1),
  })).max(INHALT_MAX),
});
export type RueckgabeEingabe = z.infer<typeof rueckgabeEingabe>;
