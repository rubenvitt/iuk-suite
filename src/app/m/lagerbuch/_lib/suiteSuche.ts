/**
 * Die Treffer des Lagerbuchs für die suiteweite Suche (IDA-301, Vertrag in `core/suche`).
 *
 * Zugang: nur die Verwaltung (`istLagerbuchAdmin` aus `_lib/zugang.ts`), dieselbe Gruppe, die
 * `verwaltung/` riegelt — dorthin führt jeder Treffer. Helfer-Sitzungen (Token am Schrank) suchen
 * nicht mit; sie haben keine Suite-Sitzung.
 *
 * Gesucht wird in Artikeln (Name, Kategorie, Fach), Geräten und BZ-Geräten (Name, Barcode), O2-Flaschen
 * (Name) und Lagerorten (Name, Kennung — bei Fahrzeugen das Kennzeichen). Der Bestand ist klein genug für
 * einen Vergleich in JavaScript; so finden sich auch Umlaute unabhängig von der Schreibweise, was
 * SQLites `LIKE` nur für ASCII tut.
 */
import type { Session } from "next-auth";
import { falte, kappe, merkmale, trifft, type SuchAntwort, type SuchTreffer } from "@/core/suche";
import { getDb, type DB } from "../_db/client";
import { artikel, bzGeraete, geraete, lagerorte, o2Flaschen } from "../_db/schema";
import { verwaltungDetailPfad } from "./verwaltungPfad";
import { istLagerbuchAdmin, viewerAusSession } from "./zugang";

const inaktiv = (aktiv: boolean) => (aktiv ? null : "inaktiv");

export function suiteSuche(begriff: string, sitzung: Session | null, db?: DB): SuchAntwort | null {
  if (!istLagerbuchAdmin(viewerAusSession(sitzung))) return null;
  const d = db ?? getDb();
  const nadel = falte(begriff);

  const orte = d.select({ id: lagerorte.id, name: lagerorte.name, typ: lagerorte.typ, kennung: lagerorte.kennung, aktiv: lagerorte.aktiv })
    .from(lagerorte).orderBy(lagerorte.name).all();
  const ortName = new Map(orte.map((o) => [o.id, o.name]));

  const treffer: SuchTreffer[] = [];

  for (const a of d.select({ id: artikel.id, name: artikel.name, kategorie: artikel.kategorie, fach: artikel.fach, aktiv: artikel.aktiv })
    .from(artikel).orderBy(artikel.name).all()) {
    if (!trifft(nadel, a.name, a.kategorie, a.fach)) continue;
    treffer.push({
      id: `artikel:${a.id}`, art: "Artikel", titel: a.name,
      merkmale: merkmale(["Kategorie", a.kategorie], ["Fach", a.fach], ["Status", inaktiv(a.aktiv)]),
      pfad: `/verwaltung/artikel?artikel=${encodeURIComponent(a.id)}`,
    });
  }

  for (const g of d.select({ id: geraete.id, name: geraete.name, typ: geraete.typ, barcode: geraete.barcode, lagerortId: geraete.lagerortId, aktiv: geraete.aktiv })
    .from(geraete).orderBy(geraete.name).all()) {
    if (!trifft(nadel, g.name, g.barcode)) continue;
    treffer.push({
      id: `geraet:${g.id}`, art: g.typ === "medizin" ? "Medizingerät" : "Gerät", titel: g.name,
      merkmale: merkmale(["Barcode", g.barcode], ["Ort", ortName.get(g.lagerortId)], ["Status", inaktiv(g.aktiv)]),
      pfad: verwaltungDetailPfad("geraete", g.id),
    });
  }

  for (const b of d.select({ id: bzGeraete.id, name: bzGeraete.name, barcode: bzGeraete.barcode, lagerortId: bzGeraete.lagerortId, aktiv: bzGeraete.aktiv })
    .from(bzGeraete).orderBy(bzGeraete.name).all()) {
    if (!trifft(nadel, b.name, b.barcode)) continue;
    treffer.push({
      id: `bz:${b.id}`, art: "BZ-Gerät", titel: b.name,
      merkmale: merkmale(["Barcode", b.barcode], ["Ort", ortName.get(b.lagerortId)], ["Status", inaktiv(b.aktiv)]),
      pfad: verwaltungDetailPfad("bz", b.id),
    });
  }

  for (const f of d.select({ id: o2Flaschen.id, name: o2Flaschen.name, lagerortId: o2Flaschen.lagerortId, aktiv: o2Flaschen.aktiv })
    .from(o2Flaschen).orderBy(o2Flaschen.name).all()) {
    if (!trifft(nadel, f.name)) continue;
    treffer.push({
      id: `o2:${f.id}`, art: "O2-Flasche", titel: f.name,
      merkmale: merkmale(["Ort", ortName.get(f.lagerortId)], ["Status", inaktiv(f.aktiv)]),
      pfad: verwaltungDetailPfad("sauerstoff", f.id),
    });
  }

  for (const o of orte) {
    if (!trifft(nadel, o.name, o.kennung)) continue;
    treffer.push({
      id: `ort:${o.id}`, art: o.typ === "fahrzeug" ? "Fahrzeug" : "Lagerort", titel: o.name,
      merkmale: merkmale(["Kennung", o.kennung], ["Status", inaktiv(o.aktiv)]),
      pfad: o.typ === "fahrzeug" ? verwaltungDetailPfad("fahrzeuge", o.id) : "/verwaltung/lagerorte",
    });
  }

  return kappe(treffer);
}
