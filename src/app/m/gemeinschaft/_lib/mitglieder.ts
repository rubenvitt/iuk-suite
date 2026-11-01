import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { resolveHost } from "@/core/routing";
import type { GemeinschaftSchreiber } from "../_db/client";
import { aufgabe, mitglied, vorhaben, zustaendig } from "../_db/schema";
import { neueId, neuerLinkCode } from "./kennung";
import { MITGLIED_NAME_MAX, MITGLIED_TELEFON_MAX, type MitgliedZeile } from "./mitgliederAnzeige";

/**
 * Die Mitglieder der Gemeinschaft, wie die Leitung sie pflegt (IDA-320). Mitglieder haben kein Konto: Name,
 * freiwillig eine Telefonnummer (sieht nur die Leitung) und ein persönlicher Link `/mein/<link>`. Ein neuer
 * Link ersetzt den alten in derselben Zeile — der alte findet danach kein Mitglied mehr (`_lib/meinLink.ts`).
 *
 * Kein `"use client"`, kein `"server-only"`: Seite, Actions und Vitest lesen diese Datei.
 */

/** Erwartbare Ablehnung mit einem Satz für die Oberfläche (Muster `schichtplan/_lib/daten.ts`). */
export class MitgliedNichtGefunden extends Error {
  constructor() { super("Dieses Mitglied gibt es nicht mehr. Lade die Seite neu."); }
}

export const mitgliedEingabe = z.object({
  name: z.string().trim()
    .min(2, "Bitte einen Namen eingeben.")
    .max(MITGLIED_NAME_MAX, `Höchstens ${MITGLIED_NAME_MAX} Zeichen.`),
  telefon: z.string().trim()
    .max(MITGLIED_TELEFON_MAX, `Höchstens ${MITGLIED_TELEFON_MAX} Zeichen.`)
    .regex(/^[0-9+()/\- ]*$/, "Nur Ziffern, Leerzeichen und + ( ) / -."),
});
export type MitgliedEingabe = z.infer<typeof mitgliedEingabe>;

export const idSchema = z.string().uuid();

/**
 * „Nicht vergangen“ — dieselbe Regel wie im POC: ein Event, solange sein Ende nicht vorbei ist; ein Projekt
 * immer (es hat keinen festen Tag, höchstens einen Zieltermin, und läuft, bis die Leitung es entfernt).
 */
export const nichtVergangen = (jetzt: number) => or(eq(vorhaben.art, "projekt"), gt(vorhaben.bis, jetzt));

export function listeMitglieder(db: GemeinschaftSchreiber, jetzt = Date.now()): MitgliedZeile[] {
  const alle = db.select().from(mitglied).orderBy(asc(mitglied.name)).all();
  const verantwortlich = db.select({ id: vorhaben.id, titel: vorhaben.titel, wer: vorhaben.verantwortlichId, von: vorhaben.von })
    .from(vorhaben).where(nichtVergangen(jetzt)).orderBy(asc(vorhaben.von), asc(vorhaben.titel)).all();
  const offen = db.select({ wer: zustaendig.mitgliedId })
    .from(zustaendig)
    .innerJoin(aufgabe, eq(aufgabe.id, zustaendig.aufgabeId))
    .innerJoin(vorhaben, eq(vorhaben.id, aufgabe.vorhabenId))
    .where(and(isNull(aufgabe.erledigtAm), nichtVergangen(jetzt)))
    .all();
  const zahl = new Map<string, number>();
  for (const z of offen) zahl.set(z.wer, (zahl.get(z.wer) ?? 0) + 1);
  return alle.map((m) => ({
    id: m.id,
    name: m.name,
    telefon: m.telefon,
    link: m.link,
    verantwortlich: verantwortlich.filter((v) => v.wer === m.id).map((v) => ({ id: v.id, titel: v.titel })),
    offeneAufgaben: zahl.get(m.id) ?? 0,
  }));
}

export function legeMitgliedAn(db: GemeinschaftSchreiber, eingabe: MitgliedEingabe, jetzt: number): string {
  const id = neueId();
  db.insert(mitglied).values({ id, name: eingabe.name, telefon: eingabe.telefon, link: neuerLinkCode(), angelegtAm: jetzt, aktualisiertAm: jetzt }).run();
  return id;
}

export function aendereMitglied(db: GemeinschaftSchreiber, id: string, eingabe: MitgliedEingabe, jetzt: number): void {
  const r = db.update(mitglied).set({ name: eingabe.name, telefon: eingabe.telefon, aktualisiertAm: jetzt }).where(eq(mitglied.id, id)).run();
  if (r.changes === 0) throw new MitgliedNichtGefunden();
}

/** Ersetzt den persönlichen Link. Der alte gilt ab sofort nicht mehr, denn er steht nirgends mehr. */
export function erneuereLink(db: GemeinschaftSchreiber, id: string, jetzt: number): string {
  const link = neuerLinkCode();
  const r = db.update(mitglied).set({ link, aktualisiertAm: jetzt }).where(eq(mitglied.id, id)).run();
  if (r.changes === 0) throw new MitgliedNichtGefunden();
  return link;
}

/**
 * Entfernt ein Mitglied. Seine Zuständigkeiten fallen per Fremdschlüssel weg (`zustaendig`, cascade), eine
 * Verantwortung wird leer (`vorhaben.verantwortlich_id`, set null); die Aufgaben selbst bleiben.
 */
export function entferneMitglied(db: GemeinschaftSchreiber, id: string): void {
  const r = db.delete(mitglied).where(eq(mitglied.id, id)).run();
  if (r.changes === 0) throw new MitgliedNichtGefunden();
}

/**
 * Anfang der Adresse, unter der dieses Modul gerade aufgerufen wird, etwa `https://gemeinschaft.example`. Der
 * Host kommt aus den Kopfzeilen (Vorrang `x-forwarded-host`, Regel aus `core/routing.resolveHost`) und nie aus
 * der Anfrage-URL, die nach dem Host-Rewrite intern ist — dieselbe Herleitung wie `teilnahmeUrlAus` in
 * `feedback/_ui/Teilnahme.tsx`. Die Seiten der Leitung laufen nur auf dem Modul-Host (`requireGemeinschaftHost`),
 * also ist das der Host, unter dem auch `/mein/<link>` erreichbar ist.
 */
export function linkBasisAus(headers: Headers): string {
  const host = resolveHost(headers);
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  return `${proto}://${host}`;
}
