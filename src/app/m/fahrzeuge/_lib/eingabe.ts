/**
 * Eingabeprüfung für ein Fahrzeug. Ohne `"use client"`/`"use server"`-Direktive, damit Formular (Client)
 * und Server Action dasselbe Schema lesen.
 *
 * Die Längen folgen dem Einsatzbuch (`einsatzbuch/_lib/stammdaten/schemas.ts`, `fahrzeugEingabe`): Typ 20,
 * Funkkenner 20, Funkrufname 80, Standort 60. Was hier gültig ist, kommt dort beim Abgleich ohne Kürzen an.
 */
import { z } from "zod";

export const ARTEN = [
  { wert: "fahrzeug", text: "Fahrzeug" },
  { wert: "anhaenger", text: "Anhänger" },
] as const;
export type Art = (typeof ARTEN)[number]["wert"];

const pflicht = (max: number, feld: string) =>
  z.string().trim().min(1, `${feld} fehlt`).max(max, `${feld} ist länger als ${max} Zeichen`);

/** Ein leeres Feld heißt „nicht vergeben“ und wird `null`, nie ein Leerstring (`_db/schema.ts`). */
const frei = (max: number, feld: string) =>
  z.string().trim().max(max, `${feld} ist länger als ${max} Zeichen`).transform((s) => (s === "" ? null : s));

export const fahrzeugEingabe = z.object({
  art: z.enum(["fahrzeug", "anhaenger"], { error: "Bitte Fahrzeug oder Anhänger wählen" }),
  typ: pflicht(20, "Typ"),
  funkrufname: pflicht(80, "Funkrufname"),
  funkkenner: frei(20, "Funkkenner"),
  kennzeichen: frei(20, "Kennzeichen").transform((s) => s?.toUpperCase().replace(/\s+/g, " ") ?? null),
  standort: pflicht(60, "Standort"),
  bemerkung: frei(500, "Bemerkung"),
  aktiv: z.boolean(),
});

export type FahrzeugEingabe = z.output<typeof fahrzeugEingabe>;
