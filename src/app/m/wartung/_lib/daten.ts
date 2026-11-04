/**
 * DIE LESEPFADE DER GERÄTEWARTUNG (IDA-312). Seiten, Telefon, „Was steht an“ und Push lesen hierüber; die
 * Fristen rechnet allein `fristen.ts`.
 *
 * `gruppen` ist überall die Liste der Gruppen, deren Geräte die aufrufende Person sehen soll — `null` heißt
 * alle (Telefonansicht, Geräteliste für Prüfende, Push vor dem Filtern je Person).
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { WartungDb } from "../_db/client";
import { art, checkpunkt, eintrag, frist, geraet, gruppe, inhalt, mangel } from "../_db/schema";
import { ladeVerwalter } from "./personen";
import { fristStand, naechsteFrist, vergleicheStaende, zustandAus, type LetzteErledigung } from "./fristen";
import type { ArtDTO, EintragDTO, FristZeile, GeraetZeile, GruppeDTO, InhaltDTO, MangelDTO } from "./typen";

type Leser = Pick<WartungDb, "select">;

export function ladeGruppen(db: Leser): GruppeDTO[] {
  const zahl = new Map(
    db.select({ id: geraet.gruppeId, n: sql<number>`count(*)` }).from(geraet).where(eq(geraet.aktiv, true))
      .groupBy(geraet.gruppeId).all().map((z) => [z.id, z.n]),
  );
  const verwalter = ladeVerwalter(db);
  return db.select().from(gruppe).orderBy(asc(gruppe.position), asc(gruppe.name)).all()
    .map((g) => ({ id: g.id, name: g.name, verwalter: verwalter.get(g.id) ?? [], geraete: zahl.get(g.id) ?? 0 }));
}

export function ladeArten(db: Leser): ArtDTO[] {
  const fristen = db.select().from(frist).orderBy(asc(frist.position)).all();
  const punkte = db.select().from(checkpunkt).orderBy(asc(checkpunkt.position)).all();
  const zahl = new Map(
    db.select({ id: geraet.artId, n: sql<number>`count(*)` }).from(geraet).where(eq(geraet.aktiv, true))
      .groupBy(geraet.artId).all().map((z) => [z.id, z.n]),
  );
  return db.select().from(art).orderBy(asc(art.position), asc(art.name)).all().map((a) => ({
    id: a.id,
    name: a.name,
    einzahl: a.einzahl,
    ikone: a.ikone,
    stundenPflicht: a.stundenPflicht,
    kiste: a.kiste,
    fristen: fristen.filter((f) => f.artId === a.id)
      .map((f) => ({ id: f.id, name: f.name, wer: f.wer, monate: f.monate, stunden: f.stunden, position: f.position })),
    checkliste: punkte.filter((p) => p.artId === a.id).map((p) => ({ id: p.id, text: p.text, hinweis: p.hinweis })),
    geraete: zahl.get(a.id) ?? 0,
  }));
}

/** Je Gerät und Frist die jüngste Erledigung (Prüfung oder eingetragen). */
function letzteErledigungen(db: Leser, geraetIds: readonly string[]): Map<string, LetzteErledigung> {
  const ergebnis = new Map<string, LetzteErledigung>();
  if (geraetIds.length === 0) return ergebnis;
  const zeilen = db.select({ g: eintrag.geraetId, f: eintrag.fristId, am: eintrag.am, stunden: eintrag.stunden })
    .from(eintrag)
    .where(and(inArray(eintrag.geraetId, [...geraetIds]), isNotNull(eintrag.fristId), inArray(eintrag.typ, ["pruefung", "erledigt"])))
    .orderBy(desc(eintrag.am), desc(eintrag.angelegtAm))
    .all();
  for (const z of zeilen) {
    const schluessel = `${z.g}|${z.f}`;
    if (!ergebnis.has(schluessel)) ergebnis.set(schluessel, { am: z.am, stunden: z.stunden });
  }
  return ergebnis;
}

export interface GeraeteFilter {
  gruppen: readonly string[] | null;
  heute: string;
  /** Auch ausgemusterte (nur die Akte eines einzelnen Geräts). */
  ausgemustert?: boolean;
  ids?: readonly string[];
}

export function ladeGeraete(db: Leser, filter: GeraeteFilter): GeraetZeile[] {
  if (filter.gruppen && filter.gruppen.length === 0) return [];
  const bedingungen = [
    filter.ausgemustert ? undefined : eq(geraet.aktiv, true),
    filter.gruppen ? inArray(geraet.gruppeId, [...filter.gruppen]) : undefined,
    filter.ids ? inArray(geraet.id, [...filter.ids]) : undefined,
  ].filter((b) => b !== undefined);
  const zeilen = db.select({ g: geraet, gruppeName: gruppe.name, artEinzahl: art.einzahl, ikone: art.ikone, stundenPflicht: art.stundenPflicht, kiste: art.kiste })
    .from(geraet)
    .innerJoin(gruppe, eq(gruppe.id, geraet.gruppeId))
    .innerJoin(art, eq(art.id, geraet.artId))
    .where(bedingungen.length ? and(...bedingungen) : undefined)
    .orderBy(asc(geraet.name))
    .all();
  if (zeilen.length === 0) return [];
  const ids = zeilen.map((z) => z.g.id);
  const fristen = db.select().from(frist).orderBy(asc(frist.position)).all();
  const letzte = letzteErledigungen(db, ids);
  const offen = db.select({ g: mangel.geraetId, einsatzbereit: mangel.einsatzbereit, fehlt: mangel.fehlt, inhaltId: mangel.inhaltId }).from(mangel)
    .where(and(inArray(mangel.geraetId, ids), isNull(mangel.behobenAm))).all();

  return zeilen.map(({ g, gruppeName, artEinzahl, ikone, stundenPflicht, kiste }) => {
    const staende = fristen.filter((f) => f.artId === g.artId)
      .map((f) => fristStand(
        { id: f.id, name: f.name, wer: f.wer, monate: f.monate, stunden: f.stunden },
        letzte.get(`${g.id}|${f.id}`) ?? null,
        g.stunden,
        filter.heute,
      ));
    const eigene = offen.filter((m) => m.g === g.id);
    return {
      id: g.id, name: g.name, hersteller: g.hersteller, typ: g.typ, seriennr: g.seriennr,
      gruppeId: g.gruppeId, gruppeName, artId: g.artId, artEinzahl, ikone, stundenPflicht, kiste,
      ortArt: g.ortArt, ort: g.ort, stunden: g.stunden, aktiv: g.aktiv,
      zustand: zustandAus(eigene), staende, naechste: naechsteFrist(staende), offeneMaengel: eigene.length,
      // Nur Positionen, die noch auf der Liste stehen: ein Mangel zu einer entfernten Position bleibt offen,
      // lässt sich aber durch Durchzählen nicht mehr beheben.
      fehlend: eigene.filter((m) => m.fehlt && m.inhaltId !== null).length,
    };
  });
}

/** Die Inhaltsliste einer Materialkiste in ihrer Reihenfolge (IDA-335). */
export function ladeInhalt(db: Leser, geraetId: string): InhaltDTO[] {
  return db.select({ id: inhalt.id, text: inhalt.text, soll: inhalt.soll, bemerkung: inhalt.bemerkung }).from(inhalt)
    .where(eq(inhalt.geraetId, geraetId)).orderBy(asc(inhalt.position)).all();
}

export function ladeGeraet(db: Leser, id: string, heute: string): GeraetZeile | null {
  return ladeGeraete(db, { gruppen: null, heute, ausgemustert: true, ids: [id] })[0] ?? null;
}

/** Fristen, die nicht im Plan sind — überfällig zuerst. */
export function faelligeFristen(geraete: readonly GeraetZeile[]): FristZeile[] {
  return geraete
    .flatMap((g) => g.staende.filter((f) => f.stufe !== "ok")
      .map((f) => ({ geraet: { id: g.id, name: g.name, ort: g.ort, gruppeName: g.gruppeName }, frist: f })))
    .sort((a, b) => vergleicheStaende(a.frist, b.frist) || a.geraet.name.localeCompare(b.geraet.name, "de"));
}

function antworten(json: string | null): EintragDTO["antworten"] {
  if (!json) return null;
  try {
    const wert = JSON.parse(json) as unknown;
    return Array.isArray(wert) ? wert.filter((a): a is { text: string; ok: boolean } => typeof a?.text === "string" && typeof a?.ok === "boolean") : null;
  } catch {
    return null;
  }
}

export interface VerlaufFilter {
  gruppen: readonly string[] | null;
  geraetId?: string;
  /** Nur Prüfungen und eingetragene Erledigungen. */
  nurFristen?: boolean;
  grenze?: number;
}

export function ladeVerlauf(db: Leser, filter: VerlaufFilter): EintragDTO[] {
  if (filter.gruppen && filter.gruppen.length === 0) return [];
  const bedingungen = [
    filter.geraetId ? eq(eintrag.geraetId, filter.geraetId) : undefined,
    filter.gruppen ? inArray(geraet.gruppeId, [...filter.gruppen]) : undefined,
    filter.nurFristen ? inArray(eintrag.typ, ["pruefung", "erledigt"]) : undefined,
  ].filter((b) => b !== undefined);
  return db.select({ e: eintrag, geraetName: geraet.name }).from(eintrag)
    .innerJoin(geraet, eq(geraet.id, eintrag.geraetId))
    .where(bedingungen.length ? and(...bedingungen) : undefined)
    .orderBy(desc(eintrag.am), desc(eintrag.angelegtAm))
    .limit(filter.grenze ?? 500)
    .all()
    .map(({ e, geraetName }) => ({
      id: e.id, geraetId: e.geraetId, geraetName, typ: e.typ, titel: e.titel, am: e.am, stunden: e.stunden,
      wer: e.wer, notiz: e.notiz, ergebnis: e.ergebnis, antworten: antworten(e.antworten), maengel: e.maengel,
    }));
}

export interface MaengelFilter {
  gruppen: readonly string[] | null;
  geraetId?: string;
  offen: boolean;
  grenze?: number;
}

export function ladeMaengel(db: Leser, filter: MaengelFilter): MangelDTO[] {
  if (filter.gruppen && filter.gruppen.length === 0) return [];
  const bedingungen = [
    filter.offen ? isNull(mangel.behobenAm) : isNotNull(mangel.behobenAm),
    filter.geraetId ? eq(mangel.geraetId, filter.geraetId) : undefined,
    filter.gruppen ? inArray(geraet.gruppeId, [...filter.gruppen]) : undefined,
  ].filter((b) => b !== undefined);
  return db.select({ m: mangel, geraetName: geraet.name, ort: geraet.ort, gruppeName: gruppe.name }).from(mangel)
    .innerJoin(geraet, eq(geraet.id, mangel.geraetId))
    .innerJoin(gruppe, eq(gruppe.id, geraet.gruppeId))
    .where(and(...bedingungen))
    .orderBy(filter.offen ? desc(mangel.gemeldetAm) : desc(mangel.behobenAm))
    .limit(filter.grenze ?? 500)
    .all()
    .map(({ m, geraetName, ort, gruppeName }) => ({
      id: m.id, geraetId: m.geraetId, geraetName, ort, gruppeName, text: m.text, foto: m.foto,
      einsatzbereit: m.einsatzbereit, gemeldetAm: m.gemeldetAm, gemeldetVon: m.gemeldetVon,
      behobenAm: m.behobenAm, behobenVon: m.behobenVon,
    }));
}

/** Ein einzelner Mangel mit der Gruppe seines Geräts — für Foto-Route und „Behoben“. */
export function ladeMangel(db: Leser, id: string): { id: string; geraetId: string; gruppeId: string; foto: boolean; behobenAm: number | null } | null {
  return db.select({ id: mangel.id, geraetId: mangel.geraetId, gruppeId: geraet.gruppeId, foto: mangel.foto, behobenAm: mangel.behobenAm })
    .from(mangel).innerJoin(geraet, eq(geraet.id, mangel.geraetId)).where(eq(mangel.id, id)).get() ?? null;
}

/** Standorte und Fahrzeuge, die schon vorkommen — Vorschläge im Formular. */
export function bekannteOrte(db: Pick<WartungDb, "selectDistinct">): string[] {
  return db.selectDistinct({ ort: geraet.ort }).from(geraet).orderBy(asc(geraet.ort)).all().map((z) => z.ort);
}
