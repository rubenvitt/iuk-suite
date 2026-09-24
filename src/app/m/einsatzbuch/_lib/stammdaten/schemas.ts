/**
 * Eingabeprüfung für die Stammdaten. Ohne `"use client"`/`"use server"`-Direktive, damit
 * dieselben Schemas im Formular (Client) und in der Server Action gelesen werden können.
 * Die Fehlertexte sind Vertrag für den CSV-Import und die Server Actions — nicht ändern,
 * ohne dort nachzuziehen.
 */
import { z } from "zod";

const text = (max: number, feld: string) =>
  z.string().trim().min(1, `${feld} fehlt`).max(max, `${feld} ist länger als ${max} Zeichen`);

export const fahrzeugEingabe = z.object({
  typ: text(20, "Typ"),
  kennung: text(20, "Kennung"),
  ruf: text(80, "Funkrufname"),
  standort: text(60, "Standort"),
  aktiv: z.boolean(),
});
export const personEingabe = z.object({
  name: text(80, "Name").regex(/^[^,]+, [^,]+$/, "Name bitte als „Nachname, Vorname“"),
  quali: text(20, "Qualifikation"),
  ov: text(60, "Ortsverein"),
  aktiv: z.boolean(),
});
export const stichwortEingabe = z.object({
  gruppe: text(40, "Gruppe"),
  name: text(40, "Stichwort"),
  reihenfolge: z.number().int("Reihenfolge ist eine ganze Zahl").min(0).max(9999),
  aktiv: z.boolean(),
});

export type FahrzeugEingabe = z.infer<typeof fahrzeugEingabe>;
export type PersonEingabe = z.infer<typeof personEingabe>;
export type StichwortEingabe = z.infer<typeof stichwortEingabe>;
