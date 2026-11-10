import type { VerpflegungDb } from "../_db/client";
import { artikel, buchung, charge, helferLink, lagerort } from "../_db/schema";
import { tagInZone } from "./heute";
import { plusTage } from "./mhd";
import { neueId } from "./schreiben";
import { neuerZugangscode } from "@/core/helferlink/code";

/**
 * Lokale Demodaten — bewusst NICHT am Boot. Die Ware des POC (IDA-311): vier Lagerorte, fünfzehn Artikel, einunddreißig
 * Chargen mit MHD relativ zu heute (einiges abgelaufen, einiges kritisch, das meiste gut), ein paar Buchungen und
 * ein Helfer-Link. Alle EANs sind erfunden, Namen sind Rollen. Idempotent: gibt es schon einen Lagerort, bleibt alles.
 */
export async function seedLokalVerpflegung(db: VerpflegungDb, jetzt = Date.now()): Promise<string[]> {
  if (db.select({ id: lagerort.id }).from(lagerort).limit(1).get()) return ["verpflegung: Lagerorte vorhanden, nichts geändert"];
  const heute = tagInZone(jetzt);

  const orte = [
    { k: "o1", name: "Lagerraum Wache · Regal A", kurz: "Regal A", gekuehlt: false },
    { k: "o2", name: "Lagerraum Wache · Regal B", kurz: "Regal B", gekuehlt: false },
    { k: "o3", name: "Kühlschrank Küche", kurz: "Kühlschrank", gekuehlt: true },
    { k: "o4", name: "Verpflegungsanhänger", kurz: "Anhänger", gekuehlt: false },
  ].map((o, i) => ({ ...o, id: neueId(), position: i }));
  const ort = Object.fromEntries(orte.map((o) => [o.k, o.id]));
  for (const o of orte) db.insert(lagerort).values({ id: o.id, name: o.name, kurz: o.kurz, gekuehlt: o.gekuehlt, position: o.position, aktiv: true, angelegtAm: jetzt, aktualisiertAm: jetzt }).run();

  type A = [k: string, name: string, ean: string, kategorie: string, einheit: string, mhdArt: "mhd" | "verbrauch", rot: number, gelb: number, mindest: number | null];
  const ARTIKEL: A[] = [
    ["a1", "Mineralwasser still 1,5 l", "4005906001217", "Getränke", "Flasche", "mhd", 14, 60, 48],
    ["a2", "Apfelsaft naturtrüb 1 l", "4005906002481", "Getränke", "Flasche", "mhd", 14, 45, 12],
    ["a3", "Kaffee gemahlen 500 g", "4006581017808", "Trockenware", "Packung", "mhd", 14, 45, 12],
    ["a4", "Pfefferminztee 25 Beutel", "4006581020143", "Trockenware", "Packung", "mhd", 14, 45, null],
    ["a5", "Erbseneintopf 800 g", "4000400013287", "Konserven", "Dose", "mhd", 14, 60, 24],
    ["a6", "Ravioli in Tomatensoße 800 g", "4000400021558", "Konserven", "Dose", "mhd", 14, 60, 24],
    ["a7", "Nudeln Penne 5 kg", "4008258011123", "Trockenware", "Packung", "mhd", 14, 45, null],
    ["a8", "H-Milch 1,5 % 1 l", "4008452013305", "Getränke", "Packung", "mhd", 7, 21, 12],
    ["a9", "Kaffeesahne Portionen (240 Stk)", "4008452027760", "Trockenware", "Karton", "mhd", 7, 30, null],
    ["a10", "Müsliriegel Schoko", "4012345678901", "Snacks", "Stück", "mhd", 7, 30, 80],
    ["a11", "Knäckebrot Roggen", "4012345671230", "Backwaren", "Packung", "mhd", 7, 30, null],
    ["a12", "Vollkornbrot geschnitten", "4012345674569", "Backwaren", "Laib", "mhd", 1, 3, null],
    ["a13", "Fruchtjoghurt 150 g", "4023456789012", "Kühlware", "Becher", "mhd", 2, 5, null],
    ["a14", "Geflügelwürstchen 400 g", "4023456781238", "Kühlware", "Packung", "verbrauch", 2, 4, null],
    ["a15", "Zwieback (Notverpflegung)", "4012345675559", "Backwaren", "Packung", "mhd", 30, 90, null],
  ];
  const art: Record<string, string> = {};
  for (const [k, name, ean, kategorie, einheit, mhdArt, rotTage, gelbTage, mindest] of ARTIKEL) {
    art[k] = neueId();
    db.insert(artikel).values({ id: art[k], name, ean, kategorie, einheit, mhdArt, rotTage, gelbTage, mindest, vorlaeufig: false, aktiv: true, angelegtAm: jetzt, aktualisiertAm: jetzt }).run();
  }

  /** [Artikel, Ort, Tage bis MHD, Menge, Tage seit Eingang] */
  const ROH: [string, string, number, number, number][] = [
    ["a1", "o1", 9, 24, 200], ["a1", "o1", 140, 48, 30], ["a1", "o4", 300, 36, 10],
    ["a2", "o1", 41, 12, 90], ["a2", "o4", 180, 6, 10],
    ["a3", "o2", 5, 2, 300], ["a3", "o2", 210, 8, 25],
    ["a4", "o2", 400, 6, 60],
    ["a5", "o2", -3, 4, 700], ["a5", "o2", 23, 12, 500], ["a5", "o4", 620, 24, 40],
    ["a6", "o2", 52, 18, 300], ["a6", "o4", 590, 24, 40],
    ["a7", "o2", 160, 3, 120],
    ["a8", "o1", 3, 6, 80], ["a8", "o1", 18, 12, 30], ["a8", "o4", 95, 12, 10],
    ["a9", "o2", 12, 1, 200], ["a9", "o4", 240, 2, 20],
    ["a10", "o4", 1, 20, 150], ["a10", "o4", 75, 40, 20],
    ["a11", "o2", 27, 4, 60],
    ["a12", "o1", 0, 2, 3], ["a12", "o1", 4, 3, 1],
    ["a13", "o3", -1, 6, 12], ["a13", "o3", 4, 12, 2],
    ["a14", "o3", -1, 2, 6], ["a14", "o3", 2, 4, 3], ["a14", "o3", 6, 4, 1],
    ["a15", "o4", 25, 10, 900], ["a15", "o4", 700, 20, 30],
  ];
  for (const [a, o, mhd, menge, alt] of ROH) {
    db.insert(charge).values({ id: neueId(), artikelId: art[a], ortId: ort[o], mhd: plusTage(heute, mhd), menge, eingang: plusTage(heute, -alt), angelegtAm: jetzt, aktualisiertAm: jetzt }).run();
  }

  const code = neuerZugangscode();
  db.insert(helferLink).values({
    id: neueId(), code, name: "Dienstabend",
    gueltigBis: jetzt + 7 * 24 * 3_600_000, aktiv: true, angelegtAm: jetzt, angelegtVon: "Leitung Verpflegung",
  }).run();
  const tagZeit = (tage: number, std: number) => { const d = new Date(jetzt - tage * 86_400_000); d.setUTCHours(std, 0, 0, 0); return d.getTime(); };
  const B: [tage: number, std: number, art: "eingang" | "ausgabe" | "aussonderung", a: string, o: string, mhd: number, menge: number, wer: string, rest: { grund?: string; ziel?: string }][] = [
    [6, 9, "ausgabe", "a10", "o4", 1, 30, "Zugangscode · Stadtfest", { ziel: "Sanitätsdienst" }],
    [4, 18, "aussonderung", "a12", "o1", -2, 1, "Zugangscode · Küche", { grund: "verdorben" }],
    [2, 10, "eingang", "a13", "o3", 4, 12, "Leitung Verpflegung", {}],
    [2, 10, "eingang", "a14", "o3", 6, 4, "Leitung Verpflegung", {}],
    [1, 19, "ausgabe", "a1", "o1", 9, 12, "Zugangscode · Übung", { ziel: "Übung" }],
    [1, 19, "ausgabe", "a5", "o2", 23, 6, "Zugangscode · Übung", { ziel: "Übung" }],
  ];
  for (const [tage, std, a, k, o, mhd, menge, wer, rest] of B) {
    db.insert(buchung).values({ id: neueId(), zeit: tagZeit(tage, std), art: a, artikelId: art[k], ortId: ort[o], mhd: plusTage(heute, mhd), menge, wer, linkId: null, grund: rest.grund ?? null, ziel: rest.ziel ?? null }).run();
  }
  return [`verpflegung: ${orte.length} Lagerorte, ${ARTIKEL.length} Artikel, ${ROH.length} Chargen, ${B.length} Buchungen, Zugangscode /t/${code}`];
}
