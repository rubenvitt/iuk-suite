/**
 * DRK-299 — der Verlauf abgeschlossener Inventuren. Kein "use client".
 * ZWEI Abfragen fuer die Liste (Koepfe + Zaehlung je Lauf), keine je Lauf.
 * Laeufe vor DRK-299 gibt es hier nicht — sie stehen nur im Journal.
 */
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { artikel, chargen, inventuren, inventurPositionen } from "../../_db/schema";
import { INVENTUR_VERLAUF_GRENZE } from "../grenzen";
import type { Leser } from "./bestand";

/**
 * DRK-337 — `ort` ist das LABEL des gezaehlten Orts („Schrank 1",
 * „Nicht zugeordnet") oder `null` fuer den ganzen Handlager.
 *
 * ⚠️ LAEUFE VOR DRK-337 HABEN DAS FELD NICHT, und das ist kein Mangel: sie
 * zaehlten den ganzen Handlager, `null` ist also die wahre Antwort. Der
 * Verlauf ist append-only — es gibt keinen Weg, das nachzutragen, und es
 * braucht auch keinen.
 */
export type Umfang = { kategorien: string[]; faecher: string[]; ort: string | null } | null;
export type LaufKurz = {
  id: string; ts: Date; quelleTyp: string; quelleId: string; kommentar: string;
  umfang: Umfang; positionen: number; abweichungen: number;
};
export type LaufPosition = {
  id: string; artikelId: string; artikelName: string; einheit: string;
  chargeId: string | null; chargenNr: string | null; verfall: string | null;
  erwartet: number; gezaehlt: number;
};

export function umfangAus(roh: string | null): Umfang {
  if (!roh) return null;
  try {
    const wert = JSON.parse(roh) as { kategorien?: unknown; faecher?: unknown; ort?: unknown } | null;
    if (!wert || typeof wert !== "object") return null;
    const liste = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
    return {
      kategorien: liste(wert.kategorien),
      faecher: liste(wert.faecher),
      ort: typeof wert.ort === "string" && wert.ort !== "" ? wert.ort : null,
    };
  } catch {
    return null;
  }
}

/**
 * Der Umfang als Anzeigetext — „vollständig" oder die Filterwerte. Liegt HIER
 * und nicht in einer der beiden Seiten, weil Liste UND Detail ihn brauchen und
 * eine Seite keine Werte aus der anderen importieren soll.
 */
export function umfangText(umfang: Umfang): string {
  if (!umfang) return "vollständig";
  // Der Ort ZUERST: er begrenzt, was ueberhaupt erwartet wurde, waehrend
  // Kategorie und Fach nur auswaehlen, welche Zeilen auf dem Schirm standen.
  const teile = [
    ...(umfang.ort ? [`Ort ${umfang.ort}`] : []),
    ...umfang.kategorien,
    ...umfang.faecher.map((f) => `Fach ${f}`),
  ];
  return teile.length > 0 ? teile.join(", ") : "vollständig";
}

function zaehlungen(db: Leser, ids: string[]): Map<string, { positionen: number; abweichungen: number }> {
  if (ids.length === 0) return new Map();
  const rows = db.select({
    inventurId: inventurPositionen.inventurId,
    positionen: sql<number>`count(*)`,
    abweichungen: sql<number>`sum(case when ${inventurPositionen.gezaehlt} <> ${inventurPositionen.erwartet} then 1 else 0 end)`,
  }).from(inventurPositionen).where(inArray(inventurPositionen.inventurId, ids))
    .groupBy(inventurPositionen.inventurId).all();
  return new Map(rows.map((r) => [r.inventurId, { positionen: r.positionen, abweichungen: r.abweichungen ?? 0 }]));
}

function kurz(k: typeof inventuren.$inferSelect, z: { positionen: number; abweichungen: number } | undefined): LaufKurz {
  return {
    id: k.id, ts: k.ts, quelleTyp: k.quelleTyp, quelleId: k.quelleId, kommentar: k.kommentar,
    umfang: umfangAus(k.umfang), positionen: z?.positionen ?? 0, abweichungen: z?.abweichungen ?? 0,
  };
}

export function inventurLaeufe(
  db: Leser,
  grenze: number = INVENTUR_VERLAUF_GRENZE,
): { laeufe: LaufKurz[]; begrenzt: boolean } {
  // Zweitsortierung nach `id`: `ts` sind UNIX-SEKUNDEN (§5.14.4).
  const koepfe = db.select().from(inventuren)
    .orderBy(desc(inventuren.ts), desc(inventuren.id))
    .limit(grenze + 1)
    .all();
  const begrenzt = koepfe.length > grenze;
  const sichtbar = koepfe.slice(0, grenze);
  const z = zaehlungen(db, sichtbar.map((k) => k.id));
  return { laeufe: sichtbar.map((k) => kurz(k, z.get(k.id))), begrenzt };
}

export function inventurLauf(db: Leser, id: string): { kopf: LaufKurz; positionen: LaufPosition[] } | null {
  const k = db.select().from(inventuren).where(eq(inventuren.id, id)).get();
  if (!k) return null;
  const positionen = db.select({
    id: inventurPositionen.id, artikelId: inventurPositionen.artikelId,
    artikelName: artikel.name, einheit: artikel.einheit,
    chargeId: inventurPositionen.chargeId, chargenNr: chargen.chargenNr, verfall: chargen.verfall,
    erwartet: inventurPositionen.erwartet, gezaehlt: inventurPositionen.gezaehlt,
  }).from(inventurPositionen)
    .innerJoin(artikel, eq(artikel.id, inventurPositionen.artikelId))
    .leftJoin(chargen, eq(chargen.id, inventurPositionen.chargeId))
    .where(eq(inventurPositionen.inventurId, id))
    // `artikelId` direkt hinter dem Namen: zwei gleichnamige Artikel duerfen ihre
    // Chargenzeilen nicht verschraenken — die Detailtabelle gruppiert nach
    // aufeinanderfolgenden Zeilen desselben Artikels.
    .orderBy(asc(artikel.name), asc(inventurPositionen.artikelId), asc(chargen.verfall), asc(inventurPositionen.id))
    .all();
  return { kopf: kurz(k, zaehlungen(db, [id]).get(id)), positionen };
}
