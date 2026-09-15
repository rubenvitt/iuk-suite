/**
 * DRK-299 — die Zeilen der Inventur. Kein "use client": `inventur/page.tsx`
 * (Server Component) liest sie und reicht nur diese serialisierbare Form an die
 * Client-Insel (Falle 6, Falle 9).
 *
 * DREI ABFRAGEN STATT 3·N — dasselbe Muster wie `artikelListe`: Artikel,
 * Bestand je Artikel, Rest je Charge (beide HANDLAGER-gescoped) plus alle Chargen.
 *
 * Die Ampel wird HIER berechnet, damit das Formular weder Uhr noch Schwellen kennt.
 */
import { eq } from "drizzle-orm";
import { artikel, chargen } from "../../_db/schema";
import { verfallSchwellen, verfallStatus, type Ampel } from "../domain/verfall";
import { vergleicheFefoCharge } from "./artikel";
import { bestandJeArtikel, restJeCharge, type Leser } from "./bestand";
import { handlagerOrte } from "./orte";

export type InventurCharge = { id: string; chargenNr: string; verfall: string; rest: number; ampel: Ampel };

export type InventurZeile = {
  id: string; name: string; einheit: string; fach: string;
  kategorie: string | null; mindestbestand: number; bestand: number;
  /** Nur Rest > 0 AM HANDLAGER, FEFO-sortiert — `chargen[0]` ist das naechste MHD. */
  chargen: InventurCharge[];
};

export function inventurZeilen(db: Leser, now: Date = new Date()): InventurZeile[] {
  const schwellen = verfallSchwellen();
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  const orte = handlagerOrte(db);
  const bestand = bestandJeArtikel(db, orte);
  const rest = restJeCharge(db, orte);
  const alleChargen = db.select().from(chargen).all();

  return arts.map((a) => ({
    id: a.id, name: a.name, einheit: a.einheit, fach: a.fach,
    kategorie: a.kategorie, mindestbestand: a.mindestbestand,
    bestand: bestand.get(a.id) ?? 0,
    chargen: alleChargen
      .filter((c) => c.artikelId === a.id && (rest.get(c.id) ?? 0) > 0)
      .sort(vergleicheFefoCharge)
      .map((c) => ({
        id: c.id, chargenNr: c.chargenNr, verfall: c.verfall,
        rest: rest.get(c.id) ?? 0,
        ampel: verfallStatus(c.verfall, schwellen, now).ampel,
      })),
  }));
}
