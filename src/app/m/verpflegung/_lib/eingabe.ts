/**
 * Die Eingabe-Schemata der Schreibwege — eine Stelle für Verwaltung und Telefon. Kein `"use client"`.
 */
import { z } from "zod";
import { AUSGABE_ZIELE, AUSSONDER_GRUENDE, EINHEITEN, istKalendertag, KATEGORIEN, TEILBAR } from "./mhd";

export const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9-]+$/);

const name = (max: number) => z.string().trim().min(1, "Bitte ausfüllen.").max(max, `Höchstens ${max} Zeichen.`);
const tag = z.string().refine(istKalendertag, "Bitte ein gültiges Datum wählen.");

/** EAN-8, UPC-A, EAN-13 oder EAN-14 (GTIN): nur Ziffern. Leer = ohne Strichcode. */
export const eanSchema = z.string().trim().regex(/^(\d{8}|\d{12,14})$/, "8 oder 12 bis 14 Ziffern.");

export const menge = z.number().finite().min(0.001, "Mindestens 0,001.").max(100_000);

export const artikelEingabe = z.object({
  name: name(120),
  ean: z.union([eanSchema, z.literal("")]).transform((v) => (v === "" ? null : v)),
  kategorie: z.enum(KATEGORIEN),
  einheit: z.enum(EINHEITEN),
  mhdArt: z.enum(["mhd", "verbrauch"]),
  rotTage: z.number().int().min(0).max(365),
  gelbTage: z.number().int().min(0).max(730),
  mindest: z.number().positive().max(100_000).nullable(),
}).refine((a) => a.gelbTage >= a.rotTage, { message: "Gelb muss mindestens so früh beginnen wie Rot.", path: ["gelbTage"] });
export type ArtikelEingabe = z.output<typeof artikelEingabe>;

/** Vorläufig am Telefon: Name, EAN und Einheit; den Rest ergänzt die Verwaltung. */
export const vorlaeufigEingabe = z.object({
  name: name(120),
  ean: eanSchema,
  einheit: z.enum(EINHEITEN),
});

export const ortEingabe = z.object({
  name: name(80),
  kurz: name(30),
  gekuehlt: z.boolean(),
});
export type OrtEingabe = z.output<typeof ortEingabe>;

export const linkEingabe = z.object({
  name: name(60),
  /** Stunden ab jetzt, höchstens eine Woche. */
  stunden: z.number().int().min(1).max(24 * 7),
});

/** IDA-358: die Sendungs-ID des Telefons, wird die ID der Buchung (`schreiben.ts`, `frueherGebucht`). Optional für alte Seiten. */
const sendung = idSchema.optional();

export const eingangEingabe = z.object({
  artikelId: idSchema,
  ortId: idSchema,
  mhd: tag,
  menge,
  sendung,
});

export const ausgabeEingabe = z.object({
  chargeId: idSchema,
  menge,
  ziel: z.enum(AUSGABE_ZIELE),
  sendung,
});

export const aussonderEingabe = z.object({
  chargeId: idSchema,
  menge,
  grund: z.enum(AUSSONDER_GRUENDE),
  freitext: z.string().trim().max(200).default(""),
  sendung,
}).refine((a) => a.grund !== "Sonstiges" || a.freitext.length > 0, { message: "Bitte kurz sagen, was passiert ist.", path: ["freitext"] });

/** Ganze Zahl, außer in kg und l. */
export function mengePasst(m: number, einheit: string): boolean {
  return TEILBAR.includes(einheit) || Number.isInteger(m);
}

export function feldFehlerAus(e: z.ZodError): Record<string, string> {
  const aus: Record<string, string> = {};
  for (const i of e.issues) {
    const k = String(i.path[0] ?? "");
    if (k && !aus[k]) aus[k] = i.message;
  }
  return aus;
}
