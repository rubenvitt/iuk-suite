/**
 * DIE LESEPFADE DER GERÄTEWARTUNG (IDA-312). Seiten, Telefon, „Was steht an“ und Push lesen hierüber; die
 * Fristen rechnet allein `fristen.ts`.
 *
 * `gruppen` ist überall die Liste der Gruppen, deren Geräte die aufrufende Person sehen soll — `null` heißt
 * alle (Telefonansicht, Geräteliste für Prüfende, Push vor dem Filtern je Person).
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { WartungDb } from "../_db/client";
import { art, artPruefart, checkpunkt, checkpunktPruefart, eintrag, entnahme, entnahmePosition, geraet, geraetPruefart, gruppe, inhalt, mangel, pruefart, unterlage } from "../_db/schema";
import { ladeVerwalter } from "./personen";
import { fristStand, naechsteFrist, vergleicheStaende, zustandAus, type Anlass, type Ereignis, type LetzteErledigung } from "./fristen";
import { geltende, pruefplan, type Abweichung, type PlanPunkt, type PruefartZeile } from "./pruefplan";
import type { ArtDTO, BekannteOrte, EintragDTO, EntnahmeDTO, FristZeile, GeraetZeile, GruppeDTO, InhaltDTO, MangelDTO, PruefartDTO, UnterlageDTO } from "./typen";

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

/** Der Katalog der Prüfarten (IDA-368) in seiner Reihenfolge. */
export function ladeKatalog(db: Leser): PruefartZeile[] {
  return db.select({ id: pruefart.id, name: pruefart.name, wer: pruefart.wer, monate: pruefart.monate, stunden: pruefart.stunden, position: pruefart.position, anlass: pruefart.anlass })
    .from(pruefart).orderBy(asc(pruefart.position), asc(pruefart.name)).all();
}

/** Je Geräteart die Prüfarten, die ihre Geräte von sich aus haben. */
function standardJeArt(db: Leser): Map<string, Set<string>> {
  const ergebnis = new Map<string, Set<string>>();
  for (const z of db.select().from(artPruefart).all()) {
    if (!ergebnis.has(z.artId)) ergebnis.set(z.artId, new Set());
    ergebnis.get(z.artId)!.add(z.pruefartId);
  }
  return ergebnis;
}

function abweichungenJeGeraet(db: Leser, geraetIds: readonly string[]): Map<string, Abweichung[]> {
  const ergebnis = new Map<string, Abweichung[]>();
  if (geraetIds.length === 0) return ergebnis;
  for (const z of db.select().from(geraetPruefart).where(inArray(geraetPruefart.geraetId, [...geraetIds])).all()) {
    if (!ergebnis.has(z.geraetId)) ergebnis.set(z.geraetId, []);
    ergebnis.get(z.geraetId)!.push({ pruefartId: z.pruefartId, an: z.an, monate: z.monate, stunden: z.stunden });
  }
  return ergebnis;
}

/** Der Prüfplan eines Geräts: was die Art mitbringt und wo das Gerät abweicht (`_lib/pruefplan.ts`). */
export function ladePruefplan(db: Leser, g: { id: string; artId: string }): PlanPunkt[] {
  return pruefplan(ladeKatalog(db), standardJeArt(db).get(g.artId) ?? new Set(), abweichungenJeGeraet(db, [g.id]).get(g.id) ?? []);
}

/** Der Katalog mit der Zahl der Gerätearten und aktiven Geräte, an denen jede Prüfart gilt. */
export function ladePruefarten(db: Leser): PruefartDTO[] {
  const katalog = ladeKatalog(db);
  const standard = standardJeArt(db);
  const geraete = db.select({ id: geraet.id, artId: geraet.artId }).from(geraet).where(eq(geraet.aktiv, true)).all();
  const ab = abweichungenJeGeraet(db, geraete.map((g) => g.id));
  const zahl = new Map<string, number>();
  for (const g of geraete) {
    for (const v of geltende(pruefplan(katalog, standard.get(g.artId) ?? new Set(), ab.get(g.id) ?? []))) zahl.set(v.id, (zahl.get(v.id) ?? 0) + 1);
  }
  return katalog.map((p) => ({
    ...p,
    arten: [...standard].filter(([, ids]) => ids.has(p.id)).map(([artId]) => artId),
    geraete: zahl.get(p.id) ?? 0,
  }));
}

/** Je Checklistenpunkt die Prüfarten, zu denen er gehört (IDA-369) — in der Reihenfolge des Katalogs; fehlt er, gehört er zu allen. */
export function pruefartenJePunkt(db: Leser): Map<string, string[]> {
  const reihe = new Map(ladeKatalog(db).map((p, i) => [p.id, i]));
  const ergebnis = new Map<string, string[]>();
  for (const z of db.select().from(checkpunktPruefart).all()) ergebnis.set(z.checkpunktId, [...(ergebnis.get(z.checkpunktId) ?? []), z.pruefartId]);
  for (const ids of ergebnis.values()) ids.sort((x, y) => (reihe.get(x) ?? 0) - (reihe.get(y) ?? 0));
  return ergebnis;
}

export function ladeArten(db: Leser): ArtDTO[] {
  const standard = standardJeArt(db);
  const reihe = new Map(ladeKatalog(db).map((p, i) => [p.id, i]));
  const punkte = db.select().from(checkpunkt).orderBy(asc(checkpunkt.position)).all();
  const zuordnung = pruefartenJePunkt(db);
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
    pruefarten: [...(standard.get(a.id) ?? [])].sort((x, y) => (reihe.get(x) ?? 0) - (reihe.get(y) ?? 0)),
    checkliste: punkte.filter((p) => p.artId === a.id).map((p) => ({ id: p.id, text: p.text, hinweis: p.hinweis, pruefarten: zuordnung.get(p.id) ?? [] })),
    geraete: zahl.get(a.id) ?? 0,
  }));
}

/** Je Gerät und Prüfart die jüngste Erledigung (Prüfung oder eingetragen). */
function letzteErledigungen(db: Leser, geraetIds: readonly string[]): Map<string, LetzteErledigung> {
  const ergebnis = new Map<string, LetzteErledigung>();
  if (geraetIds.length === 0) return ergebnis;
  const zeilen = db.select({ g: eintrag.geraetId, f: eintrag.pruefartId, am: eintrag.am, stunden: eintrag.stunden, zeit: eintrag.angelegtAm })
    .from(eintrag)
    .where(and(inArray(eintrag.geraetId, [...geraetIds]), isNotNull(eintrag.pruefartId), inArray(eintrag.typ, ["pruefung", "erledigt"])))
    .orderBy(desc(eintrag.am), desc(eintrag.angelegtAm))
    .all();
  for (const z of zeilen) {
    const schluessel = `${z.g}|${z.f}`;
    const bisher = ergebnis.get(schluessel);
    // Stand ist die jüngste nach Datum, am selben Tag die zuletzt erfasste; `zeit` gehört zu genau diesem Eintrag,
    // denn gegen einen Anlass müssen Tag und Erfassung derselben Erledigung danach liegen.
    if (!bisher) ergebnis.set(schluessel, { am: z.am, stunden: z.stunden, zeit: z.zeit });
  }
  return ergebnis;
}

/** Je Gerät, wann es zuletzt eingesetzt wurde und zurückkam (IDA-369), und was davon zuletzt war. */
function letzteAnlaesse(db: Leser, geraetIds: readonly string[]): Map<string, { einsatz: Ereignis | null; rueckkehr: Ereignis | null; zuletzt: Anlass | null }> {
  const ergebnis = new Map<string, { einsatz: Ereignis | null; rueckkehr: Ereignis | null; zuletzt: Anlass | null }>();
  if (geraetIds.length === 0) return ergebnis;
  const zeilen = db.select({ g: eintrag.geraetId, typ: eintrag.typ, am: eintrag.am, zeit: eintrag.angelegtAm }).from(eintrag)
    .where(and(inArray(eintrag.geraetId, [...geraetIds]), inArray(eintrag.typ, ["einsatz", "rueckkehr"])))
    .orderBy(desc(eintrag.angelegtAm))
    .all();
  for (const z of zeilen) {
    const typ = z.typ as Anlass;
    const e = ergebnis.get(z.g) ?? { einsatz: null, rueckkehr: null, zuletzt: typ };
    if (!e[typ]) e[typ] = { am: z.am, zeit: z.zeit };
    ergebnis.set(z.g, e);
  }
  return ergebnis;
}

/** Hat das Gerät Einträge, Mängel oder Entnahmen — dann bleibt die Akte als Nachweis ausgemustert stehen. */
export function hatVerlauf(db: Leser, geraetId: string): boolean {
  return [eintrag, mangel, entnahme].some((t) => db.select({ id: t.id }).from(t).where(eq(t.geraetId, geraetId)).limit(1).get() !== undefined);
}

/** Ob der Knopf „Akte endgültig löschen“ erscheint: ausgemustert und ohne Verlauf. */
export function darfEndgueltigLoeschen(db: Leser, id: string): boolean {
  const g = db.select({ aktiv: geraet.aktiv }).from(geraet).where(eq(geraet.id, id)).get();
  return g !== undefined && !g.aktiv && !hatVerlauf(db, id);
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
  const katalog = ladeKatalog(db);
  const standard = standardJeArt(db);
  const abweichungen = abweichungenJeGeraet(db, ids);
  const letzte = letzteErledigungen(db, ids);
  const unterwegs = new Set(db.select({ g: entnahme.geraetId }).from(entnahme)
    .where(and(inArray(entnahme.geraetId, ids), isNull(entnahme.zurueckAm))).all().map((z) => z.g));
  const anlaesse = letzteAnlaesse(db, ids);
  const offen = db.select({ g: mangel.geraetId, einsatzbereit: mangel.einsatzbereit, fehlt: mangel.fehlt, inhaltId: mangel.inhaltId }).from(mangel)
    .where(and(inArray(mangel.geraetId, ids), isNull(mangel.behobenAm))).all();

  return zeilen.map(({ g, gruppeName, artEinzahl, ikone, stundenPflicht, kiste }) => {
    const plan = pruefplan(katalog, standard.get(g.artId) ?? new Set(), abweichungen.get(g.id) ?? []);
    const anlass = anlaesse.get(g.id);
    const staende = geltende(plan)
      .map((v) => fristStand(
        v,
        letzte.get(`${g.id}|${v.id}`) ?? null,
        g.stunden,
        filter.heute,
        v.anlass ? anlass?.[v.anlass] ?? null : null,
      ));
    const eigene = offen.filter((m) => m.g === g.id);
    return {
      id: g.id, name: g.name, hersteller: g.hersteller, typ: g.typ, seriennr: g.seriennr,
      gruppeId: g.gruppeId, gruppeName, artId: g.artId, artEinzahl, ikone, stundenPflicht, kiste,
      ortArt: g.ortArt, ort: g.ort, fahrzeugId: g.fahrzeugId, stunden: g.stunden, hinweise: g.hinweise, pruefanleitung: g.pruefanleitung, aktiv: g.aktiv,
      zustand: zustandAus(eigene), plan, staende, naechste: naechsteFrist(staende), offeneMaengel: eigene.length,
      imEinsatz: anlass?.zuletzt === "einsatz",
      // Nur Positionen, die noch auf der Liste stehen: ein Mangel zu einer entfernten Position bleibt offen,
      // lässt sich aber durch Durchzählen nicht mehr beheben.
      fehlend: kiste ? eigene.filter((m) => m.fehlt && m.inhaltId !== null).length : 0,
      unterwegs: unterwegs.has(g.id),
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

/** Fristen (je Gerät und Prüfart), die nicht im Plan sind — überfällig zuerst. */
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

/**
 * Standorte und Fahrzeuge, die schon vorkommen — Vorschläge im Formular. Fahrzeuge mit Verweis fehlen hier:
 * sie kommen aus der Fahrzeugverwaltung (IDA-342).
 */
export function bekannteOrte(db: Pick<WartungDb, "selectDistinct">): BekannteOrte {
  const zeilen = db.selectDistinct({ ort: geraet.ort, ortArt: geraet.ortArt }).from(geraet)
    .where(isNull(geraet.fahrzeugId)).orderBy(asc(geraet.ort)).all();
  return {
    lager: zeilen.filter((z) => z.ortArt === "lager").map((z) => z.ort),
    fahrzeug: zeilen.filter((z) => z.ortArt === "fahrzeug").map((z) => z.ort),
  };
}

/** Die letzten Entnahmen einer Kiste, auch geschlossene (IDA-372), jüngste zuerst. */
export function ladeEntnahmen(db: Leser, geraetId: string, grenze = 20): EntnahmeDTO[] {
  const kopf = db.select().from(entnahme).where(eq(entnahme.geraetId, geraetId)).orderBy(desc(entnahme.entnommenAm), desc(entnahme.id)).limit(grenze).all();
  if (kopf.length === 0) return [];
  const pos = db.select().from(entnahmePosition).where(inArray(entnahmePosition.entnahmeId, kopf.map((e) => e.id))).all();
  return kopf.map((e) => ({
    id: e.id, wer: e.wer, zweck: e.zweck, ganz: e.ganz, seit: e.entnommenAm, zurueckAm: e.zurueckAm, zurueckWer: e.zurueckWer,
    positionen: pos.filter((p) => p.entnahmeId === e.id).map((p) => `${p.menge} × ${p.text}`),
  }));
}

/** Die Unterlagen eines Geräts in ihrer Reihenfolge (IDA-300). */
export function ladeUnterlagen(db: Leser, geraetId: string): UnterlageDTO[] {
  return db.select({ id: unterlage.id, titel: unterlage.titel, typ: unterlage.typ, bytes: unterlage.bytes }).from(unterlage)
    .where(eq(unterlage.geraetId, geraetId)).orderBy(asc(unterlage.position), asc(unterlage.angelegtAm)).all();
}

/** Eine Unterlage samt Gerät — für die Auslieferung und das Entfernen; die Gruppe kommt aus der Datenbank (IDOR). */
export function ladeUnterlage(db: Leser, id: string): { id: string; geraetId: string; gruppeId: string; aktiv: boolean; titel: string; typ: "pdf" | "bild" } | null {
  return db.select({ id: unterlage.id, geraetId: unterlage.geraetId, gruppeId: geraet.gruppeId, aktiv: geraet.aktiv, titel: unterlage.titel, typ: unterlage.typ })
    .from(unterlage).innerJoin(geraet, eq(geraet.id, unterlage.geraetId)).where(eq(unterlage.id, id)).get() ?? null;
}
