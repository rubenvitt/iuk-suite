/**
 * Meldungen für das Band am Lagemonitor, etwa „Nächste Lagebesprechung“. Jede Meldung läuft ab
 * (Vorgabe 24 Stunden, höchstens 7 Tage): ein vergessener Hinweis darf nicht für immer am Bildschirm
 * stehen. Optional zählt der Monitor bis zu einer Uhrzeit herunter („in 12 min“).
 *
 * Abgelaufene Meldungen gehen nicht mehr an den Monitor; der Monitor prüft den Ablauf zusätzlich
 * selbst, damit eine Meldung auch ohne Verbindung zur Suite pünktlich verschwindet.
 */
import { and, asc, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { z } from "zod";
import type { LagemonitorDb } from "../_db/client";
import { kategorie, meldung } from "../_db/schema";
import { alsNoticeCategory, findeKategorie, kategorieDtoAus, type NoticeCategory } from "./kategorien";
import { MELDUNGEN_MAX_AKTIV, naechsteUhrzeit, STUNDE, type MeldungDTO, type meldungEingabe } from "./meldungRegeln";

export { LAUFZEIT_VORGABE, LAUFZEITEN, MELDUNG_MAX_ZEICHEN, MELDUNGEN_MAX_AKTIV, meldungEingabe, naechsteUhrzeit, type MeldungDTO, type MeldungEingabe } from "./meldungRegeln";

function dtoAus(z: typeof meldung.$inferSelect, k: typeof kategorie.$inferSelect | null): MeldungDTO {
  return {
    id: z.id,
    text: z.text,
    zeitpunkt: z.zeitpunkt?.toISOString() ?? null,
    ablaufAm: z.ablaufAm.toISOString(),
    angelegtAm: z.angelegtAm.toISOString(),
    angelegtVon: z.angelegtVon,
    kategorie: k ? kategorieDtoAus(k) : null,
  };
}

/** Die laufenden Meldungen, die zuerst angelegte oben (so stehen sie auch am Monitor). */
export function aktiveMeldungen(db: LagemonitorDb, jetzt = new Date()): MeldungDTO[] {
  return db
    .select()
    .from(meldung)
    .leftJoin(kategorie, eq(meldung.kategorieId, kategorie.id))
    .where(gt(meldung.ablaufAm, jetzt))
    .orderBy(asc(meldung.angelegtAm), asc(meldung.id))
    .all()
    .map((r) => dtoAus(r.lagemonitor_meldung, r.lagemonitor_kategorie));
}

export type AnlegenErgebnis = { ok: true; meldung: MeldungDTO } | { ok: false; fehler: string };

export function legeMeldungAn(db: LagemonitorDb, e: z.output<typeof meldungEingabe>, von: string, jetzt = new Date()): AnlegenErgebnis {
  if (aktiveMeldungen(db, jetzt).length >= MELDUNGEN_MAX_AKTIV) {
    return { ok: false, fehler: `Es laufen schon ${MELDUNGEN_MAX_AKTIV} Meldungen. Bitte erst eine beenden.` };
  }
  if (e.kategorieId !== null && !findeKategorie(db, e.kategorieId)) {
    return { ok: false, fehler: "Diese Kategorie gibt es nicht mehr. Bitte eine andere wählen." };
  }
  const id = nanoid();
  db.insert(meldung)
    .values({
      id,
      text: e.text,
      kategorieId: e.kategorieId,
      zeitpunkt: e.uhrzeit === "" ? null : naechsteUhrzeit(e.uhrzeit, jetzt),
      ablaufAm: new Date(jetzt.getTime() + e.laufzeitStunden * STUNDE),
      angelegtAm: jetzt,
      angelegtVon: von,
    })
    .run();
  return { ok: true, meldung: aktiveMeldungen(db, jetzt).find((m) => m.id === id)! };
}

/** Beendet eine laufende Meldung sofort. `false`, wenn es sie nicht (mehr) gibt oder sie schon abgelaufen ist. */
export function beendeMeldung(db: LagemonitorDb, id: string, jetzt = new Date()): boolean {
  const r = db.update(meldung).set({ ablaufAm: jetzt }).where(and(eq(meldung.id, id), gt(meldung.ablaufAm, jetzt))).run();
  return r.changes > 0;
}

/** Das Drahtformat für den Lagemonitor (`Vertrag.notices`). */
export interface Notice {
  id: string;
  text: string;
  /** Zeitpunkt, bis zu dem der Monitor herunterzählt; `null` ohne Countdown. */
  countdownTo: string | null;
  expiresAt: string;
  /** Seit den Meldekategorien; `null` ohne Kategorie. Ältere Monitore übergehen das Feld. */
  category: NoticeCategory | null;
}

export function alsNotices(db: LagemonitorDb, jetzt = new Date()): Notice[] {
  return aktiveMeldungen(db, jetzt).map((m) => ({ id: m.id, text: m.text, countdownTo: m.zeitpunkt, expiresAt: m.ablaufAm, category: m.kategorie ? alsNoticeCategory(m.kategorie) : null }));
}
