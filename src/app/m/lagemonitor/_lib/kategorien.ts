/**
 * Meldekategorien: anlegen, ändern, löschen, und das Stück fürs Drahtformat. Die Regeln ohne
 * Datenbank stehen in `kategorieRegeln.ts`.
 *
 * Eine gelöschte Kategorie verschwindet auch von laufenden Meldungen: sie stehen dann als schlichte
 * „Meldung“ am Monitor, wie die von vor den Kategorien.
 */
import { asc, eq, max } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { z } from "zod";
import { ICONS8 } from "@/core/ikonen/katalog";
import type { LagemonitorDb } from "../_db/client";
import { kategorie, meldung } from "../_db/schema";
import { farbe, KATEGORIEN_MAX, ZEICHEN, type Farbe, type FarbeDraht, type KategorieDTO, type kategorieEingabe, type Zeichen } from "./kategorieRegeln";

export { KATEGORIEN_MAX, kategorieEingabe, type KategorieDTO, type KategorieEingabe } from "./kategorieRegeln";

type Zeile = typeof kategorie.$inferSelect;

export function kategorieDtoAus(z: Zeile): KategorieDTO {
  // Ein Zeichen, das aus der Auswahl gefallen ist, zeigt wie eine neue Kategorie das erste.
  const zeichen = (ZEICHEN as readonly string[]).includes(z.zeichen) ? (z.zeichen as Zeichen) : ZEICHEN[0];
  return { id: z.id, name: z.name, zeichen, farbe: farbe(z.farbe).wert, vorlaufMinuten: z.vorlaufMinuten };
}

export function listeKategorien(db: LagemonitorDb): KategorieDTO[] {
  return db.select().from(kategorie).orderBy(asc(kategorie.reihenfolge), asc(kategorie.id)).all().map(kategorieDtoAus);
}

export function findeKategorie(db: LagemonitorDb, id: string): KategorieDTO | null {
  const z = db.select().from(kategorie).where(eq(kategorie.id, id)).get();
  return z ? kategorieDtoAus(z) : null;
}

export type KategorieErgebnis = { ok: true; kategorie: KategorieDTO } | { ok: false; fehler: string };

export function legeKategorieAn(db: LagemonitorDb, e: z.output<typeof kategorieEingabe>, jetzt = new Date()): KategorieErgebnis {
  if (listeKategorien(db).length >= KATEGORIEN_MAX) {
    return { ok: false, fehler: `Es gibt schon ${KATEGORIEN_MAX} Kategorien. Bitte erst eine löschen.` };
  }
  const id = nanoid();
  const letzte = db.select({ n: max(kategorie.reihenfolge) }).from(kategorie).get()?.n ?? 0;
  db.insert(kategorie).values({ id, ...e, reihenfolge: letzte + 1, angelegtAm: jetzt }).run();
  return { ok: true, kategorie: findeKategorie(db, id)! };
}

export function aendereKategorie(db: LagemonitorDb, id: string, e: z.output<typeof kategorieEingabe>): KategorieErgebnis {
  const r = db.update(kategorie).set(e).where(eq(kategorie.id, id)).run();
  if (r.changes === 0) return { ok: false, fehler: "Diese Kategorie gibt es nicht mehr." };
  return { ok: true, kategorie: findeKategorie(db, id)! };
}

/** Löscht eine Kategorie; Meldungen mit ihr verlieren sie (auch ohne `foreign_keys`-Pragma). */
export function loescheKategorie(db: LagemonitorDb, id: string): boolean {
  return db.transaction((tx) => {
    tx.update(meldung).set({ kategorieId: null }).where(eq(meldung.kategorieId, id)).run();
    return tx.delete(kategorie).where(eq(kategorie.id, id)).run().changes > 0;
  });
}

/** Die Kategorie einer Meldung im Drahtformat (`Notice.category`). */
export interface NoticeCategory {
  name: string;
  color: FarbeDraht;
  /** Das Zeichen als Pfaddaten, damit der Monitor keinen eigenen Katalog braucht und offline bleibt. */
  icon: { viewBox: string; paths: string[] };
  /** Minuten vor `countdownTo`, ab denen der Monitor die Meldung blinken lässt; `null` nie. */
  alertLeadMinutes: number | null;
}

export function alsNoticeCategory(k: { name: string; zeichen: Zeichen; farbe: Farbe; vorlaufMinuten: number | null }): NoticeCategory {
  const z = ICONS8[k.zeichen];
  return { name: k.name, color: farbe(k.farbe).draht, icon: { viewBox: z.viewBox, paths: [...z.pfade] }, alertLeadMinutes: k.vorlaufMinuten };
}
