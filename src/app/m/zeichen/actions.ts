"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/core/auth";
import { getDb } from "./_db/client";
import { merkliste } from "./_db/schema";
import { findeZeichen } from "./_lib/katalog";

/*
 * DIE ZWEI ACTIONS DES KATALOGS. Beide werden von Client-Inseln DIREKT
 * IMPORTIERT, nie als Prop durchgereicht — Server Actions sind die einzigen
 * Funktionen, die die RSC-Grenze ueberqueren duerfen (Falle 9).
 *
 * ⛔ DER `sub` KOMMT AUS `auth()`, NIE AUS EINEM ARGUMENT. Sonst waere die
 * Merkliste jeder anderen Person mit einer erratenen Kennung zu leeren (IDOR).
 *
 * DER TYP LUEGT: `@auth/core` baut `session.user` OHNE `id`
 * (`lib/actions/session.js`), waehrend `core/auth/config.ts` den Pocket-ID-`sub`
 * im jwt-Callback aktiv zurueckholt. TypeScript sieht die Luecke nicht — deshalb
 * prueft jede Stelle explizit. In einer Server Action heisst das WERFEN: eine
 * Action, die unerlaubt aufgerufen wird, darf nicht „nichts tun und aussehen wie
 * Erfolg".
 */

const ZEICHEN_WURZEL = "/m/zeichen";

/**
 * EIN Aufruf mit `"layout"` (Vorbild `feedback/actions.ts`, `aufgaben/actions.ts`):
 * die Merkzahl steht auf `/katalog`, `/katalog/[id]` UND `/merkliste`. Ohne
 * `"layout"` bliebe die jeweils andere Flaeche auf dem alten Stand.
 */
function revalidate(): void {
  revalidatePath(ZEICHEN_WURZEL, "layout");
}

async function eigenerSub(): Promise<string> {
  const sub = (await auth())?.user?.id;
  if (!sub) throw new Error("Forbidden");
  return sub;
}

/**
 * Ein Zeichen auf die eigene Merkliste legen.
 *
 * Der `titelSchnappschuss` wird HIER aus dem Generat genommen und nicht vom
 * Client geliefert: der Client koennte jeden Text schicken, und der Schnappschuss
 * ist genau die Angabe, die spaeter trotz verschwundener ID noch etwas taugt
 * (Spec §4.2).
 *
 * Eine unbekannte ID ist ein ZUSTAND, kein Fehler (`findeZeichen` wirft nie): es
 * gibt nichts zu merken, also passiert nichts. Ein Wurf schickte ein altes
 * Lesezeichen auf die technische Fehlerseite.
 */
export async function merkeZeichen(zeichenId: string): Promise<void> {
  const sub = await eigenerSub();
  const zeichen = findeZeichen(zeichenId);
  if (zeichen === null) return;

  getDb()
    .insert(merkliste)
    .values({ sub, zeichenId: zeichen.id, titelSchnappschuss: zeichen.titel })
    .onConflictDoNothing()
    .run();
  revalidate();
}

/**
 * Ein Zeichen von der eigenen Merkliste nehmen.
 *
 * ⛔ HIER WIRD BEWUSST NICHT GEGEN DEN KATALOG GEPRUEFT. Spec §4.6 Stufe 2 sagt
 * zu, dass eine Merkzeile ohne Aufloesung SICHTBAR bleibt und einen
 * Entfernen-Knopf traegt. Mit einer `findeZeichen`-Huerde waere ausgerechnet
 * diese Zeile die einzige, die niemand mehr loswird — der Knopf stuende da und
 * taete nichts, ohne Meldung.
 */
export async function entferneZeichen(zeichenId: string): Promise<void> {
  const sub = await eigenerSub();
  getDb()
    .delete(merkliste)
    .where(and(eq(merkliste.sub, sub), eq(merkliste.zeichenId, zeichenId)))
    .run();
  revalidate();
}
