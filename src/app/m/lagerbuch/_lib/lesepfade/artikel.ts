/**
 * Lesepfade rund um Artikel und Chargen. Kein "use client", kein Icon-Import.
 *
 * WAS SICH GEGENUEBER `queries.ts:35-71` AENDERT: nur die ABFRAGEFORM.
 * `artikelListe` faehrt heute 3·N Abfragen (`:40`, `:29-30`); ab jetzt sind es
 * drei — Artikel, Bestand je Artikel, Rest je Charge (§5.2.4).
 *
 * WAS SICH NICHT AENDERT (§5.2.1, normativ): Liste und Detail-Bestandszahl
 * rechnen HANDLAGER; der Buchungsverlauf im Detail bleibt
 * LAGERORT-UEBERGREIFEND, weil er Umlagerungen aufs Fahrzeug als Aktivitaet zeigt
 * (`queries.ts:65-66`). Wer ihn „konsistent" auf den Handlager filtert, macht
 * jede Umlagerung unsichtbar.
 */
import { desc, eq } from "drizzle-orm";
import { artikel, buchungen, chargen } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { verfallStatus, verfallSchwellen, type Ampel } from "../domain/verfall";
import { braucht } from "../domain/vorschlag";
import { chargeText } from "../format";
import { bestandJeArtikel, restJeCharge, type Leser } from "./bestand";

export type ChargeZeile = { id: string; chargenNr: string; verfall: string; rest: number };

export type ArtikelZeile = {
  id: string; name: string; einheit: string; fach: string; mindestbestand: number;
  bestand: number; aktiv: boolean;
  /** VORGERECHNET fuer `_lib/artikelFilter.ts` — eine Client-Insel darf keine
   *  Ampel rechnen (§5.1, Falle 6). */
  unterMindest: boolean;
  chargeKritisch: boolean;
  naechsteCharge: { chargenNr: string; verfall: string } | null;
};

/**
 * Chargen EINES Artikels mit Rest AN EINEM Lagerort (Vorgabe Handlager).
 *
 * ⚠️ AUFGEBRAUCHTE CHARGEN BLEIBEN IN DER LISTE, mit `rest: 0`. Das Artikel-Detail
 * zeigt sie (die Chargennummer ist ein Fundstueck), und `?? 0` macht aus der
 * fehlenden Aggregatzeile die 0.
 */
export function chargenMitRest(
  db: Leser, artikelId: string, lagerortId: string = HANDLAGER_ID,
): ChargeZeile[] {
  const chs = db.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  const rest = restJeCharge(db, lagerortId);
  return chs.map((c) => ({
    id: c.id, chargenNr: c.chargenNr, verfall: c.verfall, rest: rest.get(c.id) ?? 0,
  }));
}

export function artikelListe(
  db: Leser, opts: { inklInaktiv?: boolean } = {}, now: Date = new Date(),
): ArtikelZeile[] {
  const schwellen = verfallSchwellen();
  const arts = opts.inklInaktiv
    ? db.select().from(artikel).all()
    : db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  // DREI Abfragen statt 3·N: Artikel, Bestand je Artikel, Rest je Charge.
  const bestand = bestandJeArtikel(db, HANDLAGER_ID);
  const rest = restJeCharge(db, HANDLAGER_ID);
  const alleChargen = db.select().from(chargen).all();

  return arts.map((a) => {
    const b = bestand.get(a.id) ?? 0;
    const naechste = alleChargen
      .filter((c) => c.artikelId === a.id && (rest.get(c.id) ?? 0) > 0)
      .sort((x, y) => x.verfall.localeCompare(y.verfall))[0] ?? null;
    const s = naechste ? verfallStatus(naechste.verfall, schwellen, now) : null;
    return {
      id: a.id, name: a.name, einheit: a.einheit, fach: a.fach,
      mindestbestand: a.mindestbestand, aktiv: a.aktiv,
      // HANDLAGER, nicht die Summe ueber alle Lagerorte (§5.2.1).
      bestand: b,
      unterMindest: braucht(b, a.mindestbestand),
      chargeKritisch: s !== null && s.ampel !== "gruen",
      naechsteCharge: naechste ? { chargenNr: naechste.chargenNr, verfall: naechste.verfall } : null,
    };
  });
}

// `_now` bleibt Teil der Signatur (Symmetrie mit `artikelDetailHelfer`, das die
// Zeit fuer die Ampel braucht) und unbenutzt: der Bestand und der Verlauf haengen
// nicht von der Uhrzeit ab, nur die Chargen-Ampel — und die liegt bei
// `artikelDetailHelfer`.
export function artikelDetail(db: Leser, id: string, _now: Date = new Date()) {
  const a = db.select().from(artikel).where(eq(artikel.id, id)).get();
  if (!a) return null;
  const bu = db
    .select().from(buchungen).where(eq(buchungen.artikelId, id))
    // Zweitsortierung nach `id`: `ts` sind UNIX-SEKUNDEN, und ein Check-Abschluss
    // schreibt mehrere Zeilen in DERSELBEN Sekunde (§5.14.4).
    .orderBy(desc(buchungen.ts), desc(buchungen.id))
    .all();
  return {
    artikel: a,
    bestand: bestandJeArtikel(db, HANDLAGER_ID).get(id) ?? 0,
    chargen: chargenMitRest(db, id),
    // LAGERORT-UEBERGREIFEND — siehe Kopfkommentar.
    buchungen: bu.slice(0, 8).map((b) => ({
      ts: b.ts, typ: b.typ, menge: b.menge, kommentar: b.kommentar, quelleId: b.quelleId,
    })),
  };
}

/** Die Helfer-Ansicht eines Artikels (`/a/[artikelId]`): nur Chargen mit Rest,
 *  aufsteigend nach Verfall, jede mit Ampel UND Text (§5.17, Punkt 3). */
export function artikelDetailHelfer(db: Leser, id: string, now: Date = new Date()) {
  const d = artikelDetail(db, id, now);
  if (!d) return null;
  const schwellen = verfallSchwellen();
  const cs = d.chargen
    .filter((c) => c.rest > 0)
    .map((c) => {
      const s = verfallStatus(c.verfall, schwellen, now);
      return { ...c, ampel: s.ampel as Ampel, text: chargeText(s, c.verfall) };
    })
    .sort((x, y) => x.verfall.localeCompare(y.verfall));
  return {
    id: d.artikel.id, name: d.artikel.name, einheit: d.artikel.einheit,
    fach: d.artikel.fach, bestand: d.bestand, chargen: cs,
  };
}
