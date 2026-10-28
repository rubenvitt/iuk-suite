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
/**
 * Ohne Prüfung gegen die Liste der Qualifikationen, die in der Datenbank steht (IDA-282) — dafür
 * `personEingabeMit`. Dieses Schema gibt nur die Form vor.
 */
export const personEingabe = z.object({
  name: text(80, "Name").regex(/^[^,]+, [^,]+$/, "Name bitte als „Nachname, Vorname“"),
  quali: text(20, "Qualifikation"),
  aktiv: z.boolean(),
});
/** `personEingabe` mit der Qualifikation aus `kurzformen` (in Rangfolge, `listeQualifikationen`). */
export function personEingabeMit(kurzformen: readonly string[]) {
  return personEingabe.extend({
    quali: personEingabe.shape.quali.refine((q) => kurzformen.includes(q), kurzformen.length
      ? `Qualifikation bitte aus ${kurzformen.join(", ")} wählen`
      : "Bitte zuerst unter „Qualifikationen“ eine Qualifikation anlegen"),
  });
}
/** Kurzform ohne Komma und Semikolon: sie steht in CSV-Zeilen und in der Fehlermeldung oben als Liste. */
export const qualifikationEingabe = z.object({
  kurz: text(20, "Kurzform").regex(/^[^,;]+$/, "Kurzform ohne Komma und Semikolon"),
  lang: text(60, "Bezeichnung"),
  rang: z.number({ error: "Rang ist eine ganze Zahl" }).int("Rang ist eine ganze Zahl")
    .min(1, "Rang liegt außerhalb von 1 bis 99").max(99, "Rang liegt außerhalb von 1 bis 99"),
});
export const stichwortEingabe = z.object({
  gruppe: text(40, "Gruppe"),
  name: text(40, "Stichwort"),
  reihenfolge: z.number({ error: "Reihenfolge ist eine ganze Zahl" }).int("Reihenfolge ist eine ganze Zahl")
    .min(0, "Reihenfolge liegt außerhalb von 0 bis 9999").max(9999, "Reihenfolge liegt außerhalb von 0 bis 9999"),
  aktiv: z.boolean(),
});

export type FahrzeugEingabe = z.infer<typeof fahrzeugEingabe>;
export type PersonEingabe = z.infer<typeof personEingabe>;
export type StichwortEingabe = z.infer<typeof stichwortEingabe>;
export type QualifikationEingabe = z.infer<typeof qualifikationEingabe>;
