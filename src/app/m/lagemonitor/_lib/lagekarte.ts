/**
 * Die Lagekarte (IDA-348): feste Punkte und Flächen, die alle Lagemonitore gleich zeigen — anlegen, ändern, ein- und
 * ausschalten, löschen, und das Stück fürs Drahtformat (`mapObjects`). Die Regeln ohne Datenbank stehen in
 * `lagekarteRegeln.ts`. Das Zeichen eines Punkts gehört kommplan und kommt nur über dessen Bereitstellung
 * (`QUELLEN` in `fahrzeuge.ts`); ist es nicht lesbar, geht der Punkt mit `symbol: null` hinaus.
 */
import { count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LagemonitorDb } from "../_db/client";
import { kartenobjekt } from "../_db/schema";
import { QUELLEN, sicher, type Quellen } from "./fahrzeuge";
import { farbe, type FarbeDraht } from "./kategorieRegeln";
import { geschlosseneRing, LAGEKARTE_MAX, LAGEKARTE_PRAEFIX, schwerpunkt, type Lage, type LagekarteDaten, type LagekarteObjektDTO } from "./lagekarteRegeln";

export { lagekarteEingabe, type LagekarteEingabe, type LagekarteObjektDTO } from "./lagekarteRegeln";

type Zeile = typeof kartenobjekt.$inferSelect;

/** Ein Objekt im Drahtformat. Kein Zeitstempel: der ETag (`_lib/etag.ts`) soll halten, solange sich nichts ändert. */
export type MapObject =
  | { id: string; kind: "point"; name: string; symbol: string | null; lat: number; lon: number }
  | { id: string; kind: "area"; name: string; color: FarbeDraht; ring: Lage[]; lat: number; lon: number };

function ringAus(z: Zeile): Lage[] | null {
  if (z.ring === null) return null;
  try {
    const r = JSON.parse(z.ring) as unknown;
    return Array.isArray(r) && r.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number")) ? (r as Lage[]) : null;
  } catch {
    return null;
  }
}

const nachName = (a: { name: string; id: string }, b: { name: string; id: string }) =>
  a.name.localeCompare(b.name, "de", { numeric: true }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Alle Objekte für die Verwaltung (auch ausgeschaltete), Flächen vor Punkten, je nach Name. */
export function listeLagekarte(db: LagemonitorDb, q: Pick<Quellen, "zeichen" | "svg"> = QUELLEN): { liste: LagekarteObjektDTO[]; zeichen: { schluessel: string; titel: string }[] } {
  const zeilen = db.select().from(kartenobjekt).all();
  const zeichen = sicher(q.zeichen, []);
  const titel = new Map(zeichen.map((z) => [z.schluessel, z.titel]));
  const punkte = zeilen.flatMap((z) => (z.art === "punkt" && z.zeichen ? [z.zeichen] : []));
  const bilder = punkte.length > 0 ? sicher(() => q.svg(punkte), {}) : {};
  const liste = zeilen.map((z): LagekarteObjektDTO => ({
    id: z.id,
    art: z.art === "flaeche" ? "flaeche" : "punkt",
    name: z.name,
    aufKarte: z.aufKarte,
    zeichen: z.zeichen,
    zeichenTitel: z.zeichen ? (titel.get(z.zeichen) ?? z.zeichen) : null,
    svg: z.zeichen ? (bilder[z.zeichen] ?? null) : null,
    farbe: z.art === "flaeche" ? farbe(z.farbe ?? "").wert : null,
    breite: z.breite,
    laenge: z.laenge,
    ring: ringAus(z),
    geaendertAm: z.geaendertAm.toISOString(),
    geaendertVon: z.geaendertVon,
  }));
  return {
    liste: [...liste.filter((o) => o.art === "flaeche").sort(nachName), ...liste.filter((o) => o.art === "punkt").sort(nachName)],
    zeichen,
  };
}

export type LagekarteErgebnis = { ok: true; id: string } | { ok: false; fehler: string };

/** Die Spalten zu einer geprüften Eingabe; die Felder der anderen Art werden geleert. */
function spalten(e: LagekarteDaten) {
  return e.art === "punkt"
    ? { art: e.art, name: e.name, zeichen: e.zeichen, farbe: null, breite: e.breite, laenge: e.laenge, ring: null, aufKarte: e.aufKarte }
    : { art: e.art, name: e.name, zeichen: null, farbe: e.farbe, breite: null, laenge: null, ring: JSON.stringify(e.ring), aufKarte: e.aufKarte };
}

function zeichenBekannt(e: LagekarteDaten, q: Pick<Quellen, "svg">): boolean {
  return e.art !== "punkt" || !!sicher(() => q.svg([e.zeichen]), {})[e.zeichen];
}

export function legeObjektAn(db: LagemonitorDb, e: LagekarteDaten, von: string, jetzt = new Date(), q: Pick<Quellen, "svg"> = QUELLEN): LagekarteErgebnis {
  if ((db.select({ n: count() }).from(kartenobjekt).get()?.n ?? 0) >= LAGEKARTE_MAX) {
    return { ok: false, fehler: `Es stehen schon ${LAGEKARTE_MAX} Objekte auf der Lagekarte. Bitte erst eines löschen.` };
  }
  if (!zeichenBekannt(e, q)) return { ok: false, fehler: "Dieses Zeichen gibt es nicht (mehr)." };
  const id = `${LAGEKARTE_PRAEFIX}${nanoid(12)}`;
  db.insert(kartenobjekt).values({ id, ...spalten(e), angelegtAm: jetzt, angelegtVon: von, geaendertAm: jetzt, geaendertVon: von }).run();
  return { ok: true, id };
}

/** Ändert ein Objekt; auch die Art darf wechseln (aus einem Punkt wird eine Fläche). */
export function aendereObjekt(db: LagemonitorDb, id: string, e: LagekarteDaten, von: string, jetzt = new Date(), q: Pick<Quellen, "svg"> = QUELLEN): LagekarteErgebnis {
  if (!db.select({ id: kartenobjekt.id }).from(kartenobjekt).where(eq(kartenobjekt.id, id)).get()) return { ok: false, fehler: "Dieses Objekt gibt es nicht mehr." };
  if (!zeichenBekannt(e, q)) return { ok: false, fehler: "Dieses Zeichen gibt es nicht (mehr)." };
  db.update(kartenobjekt).set({ ...spalten(e), geaendertAm: jetzt, geaendertVon: von }).where(eq(kartenobjekt.id, id)).run();
  return { ok: true, id };
}

/** Schaltet ein Objekt auf der Karte ein oder aus; es bleibt in der Verwaltung stehen. */
export function schalteObjekt(db: LagemonitorDb, id: string, aufKarte: boolean, von: string, jetzt = new Date()): boolean {
  return db.update(kartenobjekt).set({ aufKarte, geaendertAm: jetzt, geaendertVon: von }).where(eq(kartenobjekt.id, id)).run().changes > 0;
}

export function loescheObjekt(db: LagemonitorDb, id: string): boolean {
  return db.delete(kartenobjekt).where(eq(kartenobjekt.id, id)).run().changes > 0;
}

/**
 * `mapObjects` im Drahtformat: nur eingeschaltete Objekte, Flächen vor Punkten, je nach Name. Ein Eintrag, dessen
 * Lage kaputt ist, fällt weg, statt die Konfiguration zu brechen. Der Beschriftungspunkt einer Fläche ist ihr
 * Schwerpunkt (`schwerpunkt`).
 */
export function alsMapObjects(db: LagemonitorDb, q: Pick<Quellen, "svg"> = QUELLEN): MapObject[] {
  const zeilen = db.select().from(kartenobjekt).where(eq(kartenobjekt.aufKarte, true)).all().sort(nachName);
  const punkte = zeilen.flatMap((z) => (z.art === "punkt" && z.zeichen ? [z.zeichen] : []));
  const bilder = punkte.length > 0 ? sicher(() => q.svg(punkte), {}) : {};
  const flaechen: MapObject[] = [];
  const orte: MapObject[] = [];
  for (const z of zeilen.slice(0, LAGEKARTE_MAX)) {
    if (z.art === "flaeche") {
      const ecken = ringAus(z);
      if (!ecken || ecken.length < 3) continue;
      const [lon, lat] = schwerpunkt(ecken);
      flaechen.push({ id: z.id, kind: "area", name: z.name, color: farbe(z.farbe ?? "").draht, ring: geschlosseneRing(ecken), lat, lon });
    } else if (z.breite !== null && z.laenge !== null) {
      orte.push({ id: z.id, kind: "point", name: z.name, symbol: (z.zeichen && bilder[z.zeichen]) || null, lat: z.breite, lon: z.laenge });
    }
  }
  return [...flaechen, ...orte];
}
