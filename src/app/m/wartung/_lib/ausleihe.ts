/**
 * ENTNEHMEN UND ZURÜCKLEGEN (IDA-372). Wer etwas aus einer Materialkiste mitnimmt, trägt es ein; was nicht
 * zurückkommt, wird ein Fehlt-Mangel. Den Stand liest `unterwegs.ts`; hier stehen die Schreibpfade.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { WartungDb, WartungSchreiber } from "../_db/client";
import { art, eintrag, entnahme, entnahmePosition, inhalt, mangel } from "../_db/schema";
import type { EntnahmeEingabe, RueckgabeEingabe } from "./eingabe";
import { Abgelehnt, aktivesGeraet, neueId, type Kontext } from "./schreiben";
import { unterwegsStand } from "./unterwegs";

const sqlMenge = sql`menge`;
const UNGUELTIG = "Die Angaben sind unvollständig. Bitte die Seite neu laden.";

const istKiste = (db: WartungSchreiber, artId: string): boolean =>
  db.select({ kiste: art.kiste }).from(art).where(eq(art.id, artId)).get()?.kiste ?? false;

export function entnehmen(db: WartungDb, geraetId: string, e: EntnahmeEingabe, k: Kontext & { nutzer: string }): void {
  if (!k.nutzer) throw new Abgelehnt(UNGUELTIG);
  db.transaction((tx) => {
    const g = aktivesGeraet(tx, geraetId);
    const schon = tx.select({ geraetId: entnahme.geraetId }).from(entnahme).where(eq(entnahme.id, e.sendung)).get();
    if (schon) {
      if (schon.geraetId === geraetId) return;
      throw new Abgelehnt(UNGUELTIG);
    }
    const kiste = istKiste(tx, g.artId);
    const liste = kiste ? tx.select().from(inhalt).where(eq(inhalt.geraetId, geraetId)).orderBy(inhalt.position).all() : [];
    const stand = unterwegsStand(tx, geraetId);
    const positionen: { inhaltId: string; text: string; menge: number }[] = [];

    if (e.ganz) {
      if (stand.entnahmen.length > 0) throw new Abgelehnt("Es ist schon etwas unterwegs. Erst zurücklegen.");
      if (kiste && liste.length === 0) throw new Abgelehnt("Die Kiste hat noch keine Inhaltsliste.");
      positionen.push(...liste.map((p) => ({ inhaltId: p.id, text: p.text, menge: p.soll })));
    } else {
      if (!kiste) throw new Abgelehnt("Dieses Gerät kann nur ganz entnommen werden.");
      if (stand.ganz) throw new Abgelehnt("Die ganze Kiste ist schon unterwegs.");
      if (e.positionen.length === 0) throw new Abgelehnt("Bitte mindestens eine Position wählen.");
      if (new Set(e.positionen.map((p) => p.inhaltId)).size !== e.positionen.length) throw new Abgelehnt(UNGUELTIG);
      for (const p of e.positionen) {
        const soll = liste.find((x) => x.id === p.inhaltId);
        if (!soll) throw new Abgelehnt("Diese Position gibt es nicht mehr. Bitte die Seite neu laden.");
        const da = soll.soll - (stand.jePosition.get(soll.id) ?? 0);
        if (p.menge > da) throw new Abgelehnt(`${soll.text}: Es sind nur noch ${da} da.`);
        positionen.push({ inhaltId: soll.id, text: soll.text, menge: p.menge });
      }
    }

    tx.insert(entnahme).values({
      id: e.sendung, geraetId, nutzer: k.nutzer, wer: k.wer, zweck: e.zweck, ganz: e.ganz, entnommenAm: k.jetzt,
    }).run();
    for (const p of positionen) tx.insert(entnahmePosition).values({ id: neueId(), entnahmeId: e.sendung, ...p }).run();
  });
}

/** Schließt eine ganze Entnahme; nur aus `pruefungAbschliessen` (Durchzählen) und für Geräte ohne Inhaltsliste. */
export function ganzeSchliessen(tx: WartungSchreiber, geraetId: string, entnahmeId: string, k: Kontext): void {
  const e = tx.select().from(entnahme).where(and(eq(entnahme.id, entnahmeId), eq(entnahme.geraetId, geraetId), isNull(entnahme.zurueckAm))).get();
  if (!e?.ganz) throw new Abgelehnt("Das wurde inzwischen schon zurückgelegt. Bitte die Seite neu laden.");
  tx.update(entnahmePosition).set({ zurueck: sqlMenge }).where(eq(entnahmePosition.entnahmeId, entnahmeId)).run();
  tx.update(entnahme).set({ zurueckAm: k.jetzt, zurueckWer: k.wer }).where(eq(entnahme.id, entnahmeId)).run();
}

const SCHON_ZURUECK = "Das wurde inzwischen schon zurückgelegt. Bitte die Seite neu laden.";

export function zuruecklegen(db: WartungDb, geraetId: string, r: RueckgabeEingabe, k: Kontext): { maengel: number } {
  return db.transaction((tx) => {
    const g = aktivesGeraet(tx, geraetId);
    const e = tx.select().from(entnahme).where(and(eq(entnahme.id, r.entnahmeId), eq(entnahme.geraetId, geraetId), isNull(entnahme.zurueckAm))).get();
    if (!e) throw new Abgelehnt(SCHON_ZURUECK);
    if (!istKiste(tx, g.artId)) {
      ganzeSchliessen(tx, geraetId, e.id, k);
      return { maengel: 0 };
    }
    if (e.ganz) throw new Abgelehnt("Die ganze Kiste wird über das Durchzählen zurückgelegt.");
    if (new Set(r.positionen.map((p) => p.positionId)).size !== r.positionen.length) throw new Abgelehnt(UNGUELTIG);

    let maengel = 0;
    for (const a of r.positionen) {
      const p = tx.select().from(entnahmePosition).where(and(eq(entnahmePosition.id, a.positionId), eq(entnahmePosition.entnahmeId, e.id))).get();
      if (!p) throw new Abgelehnt(UNGUELTIG);
      const offen = p.fehlt ? 0 : p.menge - p.zurueck;
      if (a.offen !== offen) throw new Abgelehnt(SCHON_ZURUECK);
      if (a.zurueck > offen) throw new Abgelehnt(`${p.text}: Es sind nur ${offen} unterwegs.`);
      const zurueck = p.zurueck + a.zurueck;
      const rest = p.menge - zurueck;
      const fehlt = a.fehlt && rest > 0;
      tx.update(entnahmePosition).set({ zurueck, fehlt }).where(eq(entnahmePosition.id, p.id)).run();

      const offenerMangel = p.inhaltId
        ? tx.select().from(mangel).where(and(eq(mangel.geraetId, geraetId), eq(mangel.fehlt, true), eq(mangel.inhaltId, p.inhaltId), isNull(mangel.behobenAm))).get()
        : undefined;
      if (rest === 0 && offenerMangel) {
        tx.update(mangel).set({ behobenAm: k.jetzt, behobenVon: k.wer }).where(eq(mangel.id, offenerMangel.id)).run();
        tx.insert(eintrag).values({
          id: neueId(), geraetId, typ: "behoben", titel: "Wieder vollständig", am: k.heute, wer: k.wer, notiz: offenerMangel.text, angelegtAm: k.jetzt,
        }).run();
      }
      if (fehlt && !offenerMangel) {
        const text = `Fehlt: ${p.text} (${rest} von ${p.menge} nicht zurück)`;
        tx.insert(mangel).values({
          id: neueId(), geraetId, text, foto: false, einsatzbereit: true, gemeldetAm: k.jetzt, gemeldetVon: k.wer, fehlt: true, inhaltId: p.inhaltId,
        }).run();
        tx.insert(eintrag).values({
          id: neueId(), geraetId, typ: "mangel", titel: "Mangel gemeldet", am: k.heute, wer: k.wer, notiz: text, ergebnis: "mangel", maengel: 1, angelegtAm: k.jetzt,
        }).run();
        maengel++;
      }
    }

    const alle = tx.select().from(entnahmePosition).where(eq(entnahmePosition.entnahmeId, e.id)).all();
    if (alle.every((p) => p.fehlt || p.zurueck === p.menge)) {
      tx.update(entnahme).set({ zurueckAm: k.jetzt, zurueckWer: k.wer }).where(eq(entnahme.id, e.id)).run();
    }
    return { maengel };
  });
}
