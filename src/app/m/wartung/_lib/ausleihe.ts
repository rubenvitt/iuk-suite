/**
 * ENTNEHMEN UND ZURÜCKLEGEN (IDA-372). Wer etwas aus einer Materialkiste mitnimmt, trägt es ein; was nicht
 * zurückkommt, wird ein Fehlt-Mangel; behoben wird er nur beim Durchzählen, nie hier. Den Stand liest `unterwegs.ts`; hier stehen die Schreibpfade.
 *
 * Nur Kisten: ein einzelnes Gerät meldet sich mit „Wird eingesetzt“/„Zurück“ (IDA-369). Die Kiste speist denselben
 * Mechanismus: die erste offene Entnahme vermerkt `einsatz`, die letzte geschlossene `rueckkehr` (Abgleich 08.11.2026).
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { WartungDb, WartungSchreiber } from "../_db/client";
import { art, eintrag, entnahme, entnahmePosition, inhalt, mangel } from "../_db/schema";
import type { EntnahmeEingabe, RueckgabeEingabe } from "./eingabe";
import { ladeGeraet } from "./daten";
import { Abgelehnt, aktivesGeraet, anlassSchreiben, neueId, UNGUELTIG, type Kontext } from "./schreiben";
import { hatOffeneEntnahme, unterwegsStand } from "./unterwegs";

const sqlMenge = sql`${entnahmePosition.menge}`;

const istKiste = (db: WartungSchreiber, artId: string): boolean =>
  db.select({ kiste: art.kiste }).from(art).where(eq(art.id, artId)).get()?.kiste ?? false;

const NUR_KISTEN = "Geräte meldest du mit „Wird eingesetzt“.";

export function entnehmen(db: WartungDb, geraetId: string, e: EntnahmeEingabe, k: Kontext & { nutzer: string }): void {
  if (!k.nutzer) throw new Abgelehnt(UNGUELTIG);
  db.transaction((tx) => {
    const g = aktivesGeraet(tx, geraetId);
    if (!istKiste(tx, g.artId)) throw new Abgelehnt(NUR_KISTEN);
    const schon = tx.select({ geraetId: entnahme.geraetId }).from(entnahme).where(eq(entnahme.id, e.sendung)).get();
    if (schon) {
      if (schon.geraetId === geraetId) return;
      throw new Abgelehnt(UNGUELTIG);
    }
    const liste = tx.select().from(inhalt).where(eq(inhalt.geraetId, geraetId)).orderBy(inhalt.position).all();
    const stand = unterwegsStand(tx, geraetId);
    const positionen: { inhaltId: string; text: string; menge: number }[] = [];

    if (e.ganz) {
      if (e.positionen.length > 0) throw new Abgelehnt(UNGUELTIG);
      if (stand.entnahmen.length > 0) throw new Abgelehnt("Es ist schon etwas unterwegs. Erst zurücklegen.");
      if (liste.length === 0) throw new Abgelehnt("Die Kiste hat noch keine Inhaltsliste.");
      // Zurück kommt sie über das Durchzählen nach Frist; ohne diese Prüfart bliebe sie für immer unterwegs.
      if (!ladeGeraet(tx, geraetId, k.heute)?.staende.some((f) => f.vorlage.wer === "intern" && !f.vorlage.anlass)) {
        throw new Abgelehnt("Die ganze Kiste geht nur mit, wenn sie eine Prüfung nach Frist hat; zurück kommt sie über das Durchzählen.");
      }
      positionen.push(...liste.map((p) => ({ inhaltId: p.id, text: p.text, menge: p.soll })));
    } else {
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
    // Die Kiste ist jetzt unterwegs; war sie es schon, schreibt der Vermerk nichts.
    anlassSchreiben(tx, geraetId, "einsatz", k);
  });
}

/**
 * Ist keine Entnahme mehr offen, ist die Kiste zurück: Vermerk `rueckkehr`. Liefert die Prüfart „nach Benutzung“,
 * die jetzt fällig ist, damit das Telefon dorthin weitergeht; sonst null.
 */
function zurueckWennLeer(tx: WartungSchreiber, geraetId: string, k: Kontext): string | null {
  if (hatOffeneEntnahme(tx, geraetId)) return null;
  anlassSchreiben(tx, geraetId, "rueckkehr", k);
  return ladeGeraet(tx, geraetId, k.heute)?.staende
    .find((f) => f.vorlage.wer === "intern" && f.vorlage.anlass === "rueckkehr" && f.stufe !== "ok")?.vorlage.id ?? null;
}

/** Schließt eine ganze Entnahme; nur aus `pruefungAbschliessen` (Durchzählen). Liefert wie `zurueckWennLeer`. */
export function ganzeSchliessen(tx: WartungSchreiber, geraetId: string, entnahmeId: string, k: Kontext): string | null {
  const e = tx.select().from(entnahme).where(and(eq(entnahme.id, entnahmeId), eq(entnahme.geraetId, geraetId), isNull(entnahme.zurueckAm))).get();
  if (!e?.ganz) throw new Abgelehnt("Das wurde inzwischen schon zurückgelegt. Bitte die Seite neu laden.");
  tx.update(entnahmePosition).set({ zurueck: sqlMenge }).where(eq(entnahmePosition.entnahmeId, entnahmeId)).run();
  tx.update(entnahme).set({ zurueckAm: k.jetzt, zurueckWer: k.wer }).where(eq(entnahme.id, entnahmeId)).run();
  return zurueckWennLeer(tx, geraetId, k);
}

export const SCHON_ZURUECK = "Das wurde inzwischen schon zurückgelegt. Bitte die Seite neu laden.";

/** `weiter`: die Prüfart „nach Benutzung“, die nach der letzten Rückgabe fällig ist (siehe `zurueckWennLeer`). */
export function zuruecklegen(db: WartungDb, geraetId: string, r: RueckgabeEingabe, k: Kontext): { maengel: number; weiter: string | null } {
  return db.transaction((tx) => {
    const g = aktivesGeraet(tx, geraetId);
    if (!istKiste(tx, g.artId)) throw new Abgelehnt(NUR_KISTEN);
    const e = tx.select().from(entnahme).where(and(eq(entnahme.id, r.entnahmeId), eq(entnahme.geraetId, geraetId), isNull(entnahme.zurueckAm))).get();
    if (!e) throw new Abgelehnt(SCHON_ZURUECK);
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

      // Ein offener Fehlt-Mangel wird hier nie behoben: die Rückgabe kennt nur ihre Entnahme, nicht das Soll. Das tut das Durchzählen.
      const offenerMangel = p.inhaltId
        ? tx.select({ id: mangel.id }).from(mangel).where(and(eq(mangel.geraetId, geraetId), eq(mangel.fehlt, true), eq(mangel.inhaltId, p.inhaltId), isNull(mangel.behobenAm))).get()
        : undefined;
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
    if (!alle.every((p) => p.fehlt || p.zurueck === p.menge)) return { maengel, weiter: null };
    tx.update(entnahme).set({ zurueckAm: k.jetzt, zurueckWer: k.wer }).where(eq(entnahme.id, e.id)).run();
    return { maengel, weiter: zurueckWennLeer(tx, geraetId, k) };
  });
}
