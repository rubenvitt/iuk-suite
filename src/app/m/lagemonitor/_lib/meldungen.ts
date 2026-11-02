/**
 * Meldungen für das Band am Lagemonitor, etwa „Nächste Lagebesprechung“. Jede Meldung läuft ab
 * (Vorgabe ein Tag, höchstens 7 Tage): ein vergessener Hinweis darf nicht für immer am Bildschirm
 * stehen. Optional zählt der Monitor bis zu einer Uhrzeit herunter („in 12 min“), optional beginnt sie
 * erst später („Anzeigen ab“), und ihre Kategorie kann sie kurz nach der Uhrzeit verschwinden lassen.
 *
 * Geplant sein dürfen viele, am Monitor stehen höchstens drei (`sichtbar`). An den Monitor geht nur, was
 * er gerade zeigen soll; eine geplante Meldung erscheint so mit der nächsten Abholung (spätestens nach einer
 * Minute). Den Ablauf prüft der Monitor zusätzlich selbst, damit eine Meldung auch ohne Verbindung zur
 * Suite pünktlich verschwindet.
 */
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { z } from "zod";
import type { LagemonitorDb } from "../_db/client";
import { kategorie, meldung } from "../_db/schema";
import { alsNoticeCategory, findeKategorie, kategorieDtoAus, type NoticeCategory } from "./kategorien";
import { beginnVon, endeVon, MELDUNGEN_MAX_GEPLANT, MINUTE, offen, planeMeldung, sichtbar, type MeldungDTO, type meldungEingabe } from "./meldungRegeln";

export { LAUFZEIT_VORGABE, LAUFZEITEN, MELDUNG_MAX_ZEICHEN, MELDUNGEN_MAX_AKTIV, MELDUNGEN_MAX_GEPLANT, meldungEingabe, naechsteUhrzeit, type MeldungDTO, type MeldungEingabe } from "./meldungRegeln";

function dtoAus(z: typeof meldung.$inferSelect, k: typeof kategorie.$inferSelect | null): MeldungDTO {
  return {
    id: z.id,
    text: z.text,
    zeitpunkt: z.zeitpunkt?.toISOString() ?? null,
    anzeigenAb: z.anzeigenAb?.toISOString() ?? null,
    ablaufAm: z.ablaufAm.toISOString(),
    angelegtAm: z.angelegtAm.toISOString(),
    angelegtVon: z.angelegtVon,
    kategorie: k ? kategorieDtoAus(k) : null,
  };
}

/**
 * Die laufenden und geplanten Meldungen, die zuerst fällige oben (so stehen sie auch am Monitor): nach der
 * Uhrzeit, bis zu der heruntergezählt wird, ohne Countdown nach dem Beginn. Was die Kategorie nach der Uhrzeit
 * schon beendet hat, fehlt.
 */
export function offeneMeldungen(db: LagemonitorDb, jetzt = new Date()): MeldungDTO[] {
  const zeilen = db
    .select()
    .from(meldung)
    .leftJoin(kategorie, eq(meldung.kategorieId, kategorie.id))
    .where(gt(meldung.ablaufAm, jetzt))
    // `angelegt_am` hat Sekunden; bei Gleichstand entscheidet die Reihenfolge des Anlegens (rowid), nicht die zufällige id.
    .orderBy(
      sql`coalesce(${meldung.zeitpunkt}, ${meldung.anzeigenAb}, ${meldung.angelegtAm})`,
      sql`coalesce(${meldung.anzeigenAb}, ${meldung.angelegtAm})`,
      sql`"lagemonitor_meldung"."rowid"`,
    )
    .all()
    .map((r) => dtoAus(r.lagemonitor_meldung, r.lagemonitor_kategorie));
  return offen(zeilen, jetzt.getTime());
}

/** Was der Monitor gerade zeigt: höchstens drei begonnene Meldungen. */
export function aktiveMeldungen(db: LagemonitorDb, jetzt = new Date()): MeldungDTO[] {
  return sichtbar(offeneMeldungen(db, jetzt), jetzt.getTime());
}

/** `wartet`: beginnt sofort, aber am Monitor stehen schon drei; sie rückt nach, sobald einer frei wird. */
export type AnlegenErgebnis = { ok: true; meldung: MeldungDTO; wartet: boolean } | { ok: false; fehler: string };

export function legeMeldungAn(db: LagemonitorDb, e: z.output<typeof meldungEingabe>, von: string, jetzt = new Date()): AnlegenErgebnis {
  if (offeneMeldungen(db, jetzt).length >= MELDUNGEN_MAX_GEPLANT) {
    return { ok: false, fehler: `Es laufen oder warten schon ${MELDUNGEN_MAX_GEPLANT} Meldungen. Bitte erst eine beenden.` };
  }
  const k = e.kategorieId === null ? null : findeKategorie(db, e.kategorieId);
  if (e.kategorieId !== null && !k) {
    return { ok: false, fehler: "Diese Kategorie gibt es nicht mehr. Bitte eine andere wählen." };
  }
  const plan = planeMeldung(e, jetzt);
  const beginn = plan.anzeigenAb ?? jetzt;
  if (plan.zeitpunkt && plan.zeitpunkt.getTime() <= beginn.getTime()) {
    return { ok: false, fehler: "„Anzeigen ab“ muss vor der Uhrzeit liegen, bis zu der heruntergezählt wird." };
  }
  const id = nanoid();
  db.insert(meldung)
    .values({ id, text: e.text, kategorieId: e.kategorieId, ...plan, angelegtAm: jetzt, angelegtVon: von })
    .run();
  const wartet = plan.anzeigenAb === null && !aktiveMeldungen(db, jetzt).some((m) => m.id === id);
  return { ok: true, meldung: { ...dtoAus(db.select().from(meldung).where(eq(meldung.id, id)).get()!, null), kategorie: k }, wartet };
}

/** Beendet eine laufende oder geplante Meldung sofort. `false`, wenn es sie nicht (mehr) gibt oder sie schon abgelaufen ist. */
export function beendeMeldung(db: LagemonitorDb, id: string, jetzt = new Date()): boolean {
  const r = db.update(meldung).set({ ablaufAm: jetzt }).where(and(eq(meldung.id, id), gt(meldung.ablaufAm, jetzt))).run();
  return r.changes > 0;
}

/**
 * So viele Minuten vor ihrem Beginn holt der Monitor eine geplante Meldung schon ab. Er fragt einmal pro Minute;
 * mit `showFrom` zeigt er sie dann auf die Sekunde pünktlich, auch wenn die Suite gerade nicht erreichbar ist.
 */
export const ABHOLUNG_VORAUS_MINUTEN = 5;

/** Das Drahtformat für den Lagemonitor (`Vertrag.notices`). */
export interface Notice {
  id: string;
  text: string;
  /** Zeitpunkt, bis zu dem der Monitor herunterzählt; `null` ohne Countdown. */
  countdownTo: string | null;
  /** Wann die Meldung verschwindet: Ende der Laufzeit, oder früher, wenn die Kategorie sie nach der Uhrzeit wegnimmt. */
  expiresAt: string;
  /**
   * Seit den planbaren Meldungen: ab wann der Monitor sie zeigt; `null` sofort. Ältere Monitore übergehen das
   * Feld und zeigen eine geplante Meldung bis zu `ABHOLUNG_VORAUS_MINUTEN` zu früh.
   */
  showFrom: string | null;
  /** Seit den Meldekategorien; `null` ohne Kategorie. Ältere Monitore übergehen das Feld. */
  category: NoticeCategory | null;
}

/**
 * Was der Monitor jetzt zeigen soll oder in den nächsten Minuten zeigen wird, die zuerst fällige oben. Der Monitor
 * zeigt davon die ersten drei begonnenen (Repo `lagemonitor`, `src/web/monitor.rs`, `NOTICES_VISIBLE_MAX`), genau
 * wie `sichtbar` hier; Wartende stehen mit drin, damit sie auch ohne Suite nachrücken.
 */
export function alsNotices(db: LagemonitorDb, jetzt = new Date()): Notice[] {
  const bis = jetzt.getTime() + ABHOLUNG_VORAUS_MINUTEN * MINUTE;
  return offeneMeldungen(db, jetzt)
    .filter((m) => beginnVon(m) <= bis)
    .map((m) => ({
      id: m.id,
      text: m.text,
      countdownTo: m.zeitpunkt,
      expiresAt: new Date(endeVon(m)).toISOString(),
      showFrom: m.anzeigenAb,
      category: m.kategorie ? alsNoticeCategory(m.kategorie) : null,
    }));
}
