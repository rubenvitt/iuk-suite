/**
 * Fahrzeuge auf der Karte aller Lagemonitore (LGM-10). Der Monitor im Fahrzeug meldet seinen GPS-Fix bei der
 * minütlichen Abholung mit (Kopfzeile `X-Lagemonitor-Position`, keine eigene Anfrage: die SIM im FüKw ist knapp),
 * und jeder Monitor bekommt mit der Konfiguration die Positionen aller Fahrzeuge (`vehicles`). Je Fahrzeug steht
 * nur die letzte Position; älter als 24 Stunden geht sie nicht mehr hinaus.
 *
 * Funkrufname und Zeichen gehören anderen Modulen und kommen nur über deren Bereitstellung. Ist eines davon nicht
 * lesbar, fehlen die Fahrzeuge — die Konfiguration selbst geht trotzdem hinaus.
 */
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { bereitgestellteFahrzeuge, type BereitgestelltesFahrzeug } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import { zeichenAlsSvg, zeichenAuswahl, type ZeichenWahl } from "@/app/m/kommplan/_lib/bereitstellung";
import type { LagemonitorDb } from "../_db/client";
import { fahrzeug, zugang } from "../_db/schema";

export const POSITION_HOECHSTALTER_MS = 24 * 60 * 60 * 1000;
export const POSITION_KOPF = "x-lagemonitor-position";

export interface Quellen {
  stamm: () => BereitgestelltesFahrzeug[];
  zeichen: () => ZeichenWahl[];
  svg: (schluessel: readonly string[]) => Record<string, string>;
}
export const QUELLEN: Quellen = {
  stamm: () => bereitgestellteFahrzeuge().fahrzeuge,
  zeichen: () => zeichenAuswahl(),
  svg: (k) => zeichenAlsSvg(k),
};

export function sicher<T>(lesen: () => T, ersatz: T): T {
  try {
    return lesen();
  } catch {
    return ersatz;
  }
}

export interface Position {
  lat: number;
  lon: number;
  /** Alter des Fixes in Sekunden, gemessen am Monitor: so stört eine falsch gehende Uhr im Fahrzeug nicht. */
  alterS: number;
}

const KOPF = /^(-?\d{1,3}(?:\.\d{1,8})?),(-?\d{1,3}(?:\.\d{1,8})?),(\d{1,6})$/;

/** `<Breite>,<Länge>,<Alter in s>`, etwa `52.96371,10.57720,12`. Alles andere ist `null` und wird übergangen. */
export function positionAusKopf(wert: string | null): Position | null {
  const m = KOPF.exec(wert?.trim() ?? "");
  if (!m) return null;
  const [lat, lon, alterS] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || alterS * 1000 > POSITION_HOECHSTALTER_MS) return null;
  return { lat, lon, alterS };
}

/**
 * Setzt die Position des Fahrzeugs, das an diesem Zugang hängt; ohne Fahrzeug passiert nichts. Ein älterer Fix als der
 * gespeicherte überschreibt ihn nicht (etwa eine verspätete Abholung nach einer schnelleren).
 */
export function meldePosition(db: LagemonitorDb, zugangId: string, p: Position, jetzt = new Date()): boolean {
  const gemeldetAm = new Date(jetzt.getTime() - p.alterS * 1000);
  return db.update(fahrzeug).set({ breite: p.lat, laenge: p.lon, gemeldetAm })
    .where(and(eq(fahrzeug.zugangId, zugangId), or(isNull(fahrzeug.gemeldetAm), lte(fahrzeug.gemeldetAm, gemeldetAm))))
    .run().changes > 0;
}

/** Ein Fahrzeug im Drahtformat. `own`: das Fahrzeug des abholenden Zugangs, der Monitor zeichnet es live aus dem GPS. */
export interface Vehicle {
  id: string;
  callSign: string;
  /** Eigenständiges SVG-Dokument; der Monitor zeigt es nur als Bild. */
  symbol: string;
  lat: number;
  lon: number;
  at: string;
  own: boolean;
  /** Ein fester Ort (`_lib/standort.ts`, `festeOrte`) statt eines Fahrzeugs; ältere Monitore übergehen das Feld. */
  fixed: boolean;
}

/**
 * Der eigene Eintrag, grob (LGM-12): Der Monitor zeichnet sein Fahrzeug aus dem eigenen GPS (`mapData.ts`,
 * `vehicleMarks`) und braucht von hier weder die genaue Position noch die Zeit. Genau änderten sie den Körper bei
 * jeder Abholung, und der ETag (`_lib/etag.ts`) griffe nie: Im FüKw kam so jede Minute die ganze Konfiguration.
 * Auf 0,01° (rund 1 km) und die volle Stunde bleibt er stehen, solange das Fahrzeug steht.
 */
export const grob = (grad: number) => Math.round(grad * 100) / 100;
const volleStunde = (d: Date) => new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);

export function alsVehicles(db: LagemonitorDb, zugangId: string | null, jetzt = new Date(), q: Quellen = QUELLEN): Vehicle[] {
  const zeilen = db.select().from(fahrzeug).all()
    .filter((f) => f.breite !== null && f.laenge !== null && f.gemeldetAm !== null && jetzt.getTime() - f.gemeldetAm.getTime() <= POSITION_HOECHSTALTER_MS);
  if (zeilen.length === 0) return [];
  const namen = new Map(sicher(q.stamm, []).map((s) => [s.id, s.funkrufname]));
  const bilder = sicher(() => q.svg(zeilen.map((f) => f.zeichen)), {});
  return zeilen.flatMap((f): Vehicle[] => {
    const callSign = namen.get(f.stammId);
    const symbol = bilder[f.zeichen];
    if (!callSign || !symbol) return [];
    const own = f.zugangId !== null && f.zugangId === zugangId;
    if (own) return [{ id: f.id, callSign, symbol, lat: grob(f.breite!), lon: grob(f.laenge!), at: volleStunde(f.gemeldetAm!).toISOString(), own, fixed: false }];
    return [{ id: f.id, callSign, symbol, lat: f.breite!, lon: f.laenge!, at: f.gemeldetAm!.toISOString(), own, fixed: false }];
  }).sort((a, b) => a.callSign.localeCompare(b.callSign, "de", { numeric: true }));
}

export interface FahrzeugDTO {
  id: string;
  /** `null`, wenn es das Fahrzeug in der Fahrzeugverwaltung nicht (mehr) gibt. */
  funkrufname: string | null;
  zeichenTitel: string;
  /** Vorschau; `null`, wenn kommplan das Zeichen nicht (mehr) kennt. */
  svg: string | null;
  zugang: string | null;
  gemeldetAm: string | null;
}

export interface FahrzeugAuswahl {
  stamm: { id: string; funkrufname: string }[];
  zeichen: ZeichenWahl[];
  zugaenge: { id: string; bezeichnung: string }[];
}

export function listeFahrzeuge(db: LagemonitorDb, q: Quellen = QUELLEN): { liste: FahrzeugDTO[]; auswahl: FahrzeugAuswahl } {
  const zeilen = db.select({ f: fahrzeug, zugang: zugang.bezeichnung }).from(fahrzeug).leftJoin(zugang, eq(fahrzeug.zugangId, zugang.id)).all();
  const stamm = sicher(q.stamm, []);
  const zeichen = sicher(q.zeichen, []);
  const namen = new Map(stamm.map((s) => [s.id, s.funkrufname]));
  const titel = new Map(zeichen.map((z) => [z.schluessel, z.titel]));
  const bilder = sicher(() => q.svg(zeilen.map((z) => z.f.zeichen)), {});
  const vergeben = new Set(zeilen.map((z) => z.f.stammId));
  const belegt = new Set(zeilen.map((z) => z.f.zugangId));
  return {
    liste: zeilen.map(({ f, zugang: z }) => ({
      id: f.id,
      funkrufname: namen.get(f.stammId) ?? null,
      zeichenTitel: titel.get(f.zeichen) ?? f.zeichen,
      svg: bilder[f.zeichen] ?? null,
      zugang: z,
      gemeldetAm: f.gemeldetAm?.toISOString() ?? null,
    })).sort((a, b) => (a.funkrufname ?? "").localeCompare(b.funkrufname ?? "", "de", { numeric: true })),
    auswahl: {
      stamm: stamm.filter((s) => s.aktiv && !vergeben.has(s.id)).map((s) => ({ id: s.id, funkrufname: s.funkrufname }))
        .sort((a, b) => a.funkrufname.localeCompare(b.funkrufname, "de", { numeric: true })),
      zeichen,
      zugaenge: db.select({ id: zugang.id, bezeichnung: zugang.bezeichnung }).from(zugang).all().filter((z) => !belegt.has(z.id)),
    },
  };
}

export const fahrzeugEingabe = z.object({
  stammId: z.string().min(1, "Bitte ein Fahrzeug wählen.").max(64),
  zeichen: z.string().min(1, "Bitte ein Zeichen wählen.").max(80),
  zugangId: z.string().min(1).max(64).nullable(),
}).strict();
export type FahrzeugEingabe = z.infer<typeof fahrzeugEingabe>;

/** Prüft gegen die Bereitstellungen und die eigenen Zugänge — nichts davon kommt ungeprüft aus dem Formular. */
export function legeFahrzeugAn(db: LagemonitorDb, e: FahrzeugEingabe, von: string, jetzt = new Date(), q: Quellen = QUELLEN): { ok: true } | { ok: false; fehler: string } {
  const s = sicher(q.stamm, []).find((x) => x.id === e.stammId && x.aktiv);
  if (!s) return { ok: false, fehler: "Dieses Fahrzeug gibt es in der Fahrzeugverwaltung nicht (mehr)." };
  if (!sicher(() => q.svg([e.zeichen]), {})[e.zeichen]) return { ok: false, fehler: "Dieses Zeichen gibt es nicht (mehr)." };
  if (db.select({ id: fahrzeug.id }).from(fahrzeug).where(eq(fahrzeug.stammId, e.stammId)).get()) return { ok: false, fehler: `„${s.funkrufname}“ steht schon auf der Karte.` };
  if (e.zugangId !== null) {
    if (!db.select({ id: zugang.id }).from(zugang).where(eq(zugang.id, e.zugangId)).get()) return { ok: false, fehler: "Diesen Zugang gibt es nicht mehr." };
    if (db.select({ id: fahrzeug.id }).from(fahrzeug).where(eq(fahrzeug.zugangId, e.zugangId)).get()) return { ok: false, fehler: "Dieser Zugang meldet schon für ein anderes Fahrzeug." };
  }
  db.insert(fahrzeug).values({ id: nanoid(), stammId: e.stammId, zeichen: e.zeichen, zugangId: e.zugangId, angelegtAm: jetzt, angelegtVon: von }).run();
  return { ok: true };
}

/** Nimmt ein Fahrzeug von der Karte; seine letzte Position ist damit weg. */
export function loescheFahrzeug(db: LagemonitorDb, id: string): boolean {
  return db.delete(fahrzeug).where(eq(fahrzeug.id, id)).run().changes > 0;
}
