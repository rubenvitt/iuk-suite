import { and, asc, count, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { GemeinschaftDb, GemeinschaftSchreiber } from "../_db/client";
import { anfrage, sperrzeit, vertragsdatei, vertragsdokument, vertragsunterschrift, vertragsvorlage, vorhaben } from "../_db/schema";
import { EVENT_PRAEFIX, harteKonflikte, sperrenAusEvents, ueberlappt, type BarEvent, type Eintrag, type Zeitraum } from "./belegung";
import { neueId, neuerLinkCode } from "./kennung";
import { TEST_ANLASS, testanfrageFaellig } from "./testanfrage";
import type { AnfrageWert, SperrzeitWert } from "./vermietungEingabe";
import { felderAusJson, unterschriftfelder, werteAusJson, type Vertragsfeld, type Werte } from "./vertragFeld";
import { dokumentDateiname } from "./vertragName";
import { zeitraumText, type VertragStand } from "./vermietungText";
import {
  anfrageAlsEintrag, DOKUMENTARTEN, sperreAlsEintrag, type Abgelegt, type AnfrageDTO, type Dokumentart, type DokumentDTO, type DokumentKurz, type Herkunft,
  type SperrzeitDTO, type StatusDokument, type StatusDTO, type VorlageDTO,
} from "./vermietungTypen";

export type { AnfrageDTO, DokumentDTO, SperrzeitDTO, StatusDTO, VorlageDTO } from "./vermietungTypen";

/**
 * Die Datenbankseite der Vermietung (IDA-315). Jede Funktion nimmt die Datenbank als Argument — die Actions
 * reichen `getDb()`, die Tests eine In-Memory-DB (`testDb.ts`). Erwartbare Ablehnungen werfen `Abgelehnt` mit
 * einem Satz für die Oberfläche, eine unbekannte Kennung `NichtGefunden`. Heute gibt es nur einen Raum, die Bar.
 */

export const RAUM = "bar";

export class Abgelehnt extends Error {}
export class NichtGefunden extends Error {
  constructor() { super("Diesen Eintrag gibt es nicht mehr. Bitte die Seite neu laden."); }
}

/* ---------------- Lesen ---------------- */

export function ladeAnfragen(db: GemeinschaftSchreiber): AnfrageDTO[] {
  const zeilen = db.select({
    id: anfrage.id, status: anfrage.status, code: anfrage.code, von: anfrage.von, bis: anfrage.bis, anlass: anfrage.anlass,
    personen: anfrage.personen, person: anfrage.person, kontakt: anfrage.kontakt, hinweis: anfrage.hinweis, mitglied: anfrage.mitglied,
    begruendung: anfrage.begruendung, vertrag: anfrage.vertrag, eingegangenAm: anfrage.eingegangenAm, entschiedenAm: anfrage.entschiedenAm,
  }).from(anfrage).where(eq(anfrage.raum, RAUM)).orderBy(asc(anfrage.von)).all();
  const dateien = db.select({ anfrageId: vertragsdatei.anfrageId, art: vertragsdatei.art, groesse: vertragsdatei.groesse, abgelegtAm: vertragsdatei.abgelegtAm, herkunft: vertragsdatei.herkunft, unterschriebenVon: vertragsdatei.unterschriebenVon })
    .from(vertragsdatei).all();
  const dokumente = db.select({ anfrageId: vertragsdokument.anfrageId, art: vertragsdokument.art, freigegebenAm: vertragsdokument.freigegebenAm, felder: vertragsdokument.felder }).from(vertragsdokument).all();
  const leitungDa = new Set(db.select({ anfrageId: vertragsunterschrift.anfrageId, art: vertragsunterschrift.art }).from(vertragsunterschrift).where(eq(vertragsunterschrift.rolle, "leitung")).all()
    .map((u) => `${u.anfrageId}/${u.art}`));
  const vorlagen = new Set(db.select({ art: vertragsvorlage.art }).from(vertragsvorlage).where(eq(vertragsvorlage.raum, RAUM)).all().map((v) => v.art));
  return zeilen.map((a) => ({
    ...a,
    dokumente: DOKUMENTARTEN.map((art): DokumentKurz => {
      const d = dokumente.find((x) => x.anfrageId === a.id && x.art === art);
      const f = dateien.find((x) => x.anfrageId === a.id && x.art === art);
      const leitungOffen = !!d && !!f && wartetAufLeitung(felderAusJson(d.felder), f.herkunft, leitungDa.has(`${a.id}/${art}`));
      return { art, vorlage: vorlagen.has(art), stand: d ? (d.freigegebenAm !== null ? "freigegeben" : "entwurf") : null, datei: f ? abgelegt(art, a.von, f) : null, leitungOffen };
    }),
  }));
}

function abgelegt(art: Dokumentart, von: number, f: { groesse: number; abgelegtAm: number; herkunft: Herkunft; unterschriebenVon: string | null }): Abgelegt {
  return { name: dokumentDateiname(art, von, true), groesse: f.groesse, abgelegtAm: f.abgelegtAm, herkunft: f.herkunft, unterschriebenVon: f.unterschriebenVon };
}

export function ladeSperrzeiten(db: GemeinschaftSchreiber): SperrzeitDTO[] {
  const eigene = db.select({ id: sperrzeit.id, von: sperrzeit.von, bis: sperrzeit.bis, grund: sperrzeit.grund })
    .from(sperrzeit).where(eq(sperrzeit.raum, RAUM)).all().map((s) => ({ ...s, eventId: null }));
  const ausEvents = sperrenAusEvents(ladeBarEvents(db)).map((e) => ({ id: e.id, von: e.von, bis: e.bis, grund: e.titel, eventId: e.eventId }));
  return [...eigene, ...ausEvents].sort((a, b) => a.von - b.von || a.bis - b.bis);
}

/** Events mit „Bar belegen“ (Tabelle des Bereichs Planung; nur gelesen). */
export function ladeBarEvents(db: GemeinschaftSchreiber): BarEvent[] {
  return db.select({ id: vorhaben.id, titel: vorhaben.titel, von: vorhaben.von, bis: vorhaben.bis }).from(vorhaben)
    .where(and(eq(vorhaben.art, "event"), eq(vorhaben.barBelegen, true))).all()
    .flatMap((v) => (v.von !== null && v.bis !== null ? [{ id: v.id, titel: v.titel, von: v.von, bis: v.bis }] : []));
}

/** Alle Einträge der Belegung: Anfragen in jedem Stand, Sperrzeiten, Sperrzeiten aus Events. */
export function ladeEintraege(db: GemeinschaftSchreiber): Eintrag[] {
  return [...ladeAnfragen(db).map(anfrageAlsEintrag), ...ladeSperrzeiten(db).map(sperreAlsEintrag)];
}

/** Nur was belegt (Zusagen, Sperrzeiten, Events) und nach `ab` endet — Grundlage der öffentlichen Sicht und der Kollisionsprüfung. */
export function ladeBelegendeEintraege(db: GemeinschaftSchreiber, ab = 0): Eintrag[] {
  const zusagen = db.select({ id: anfrage.id, von: anfrage.von, bis: anfrage.bis, anlass: anfrage.anlass, status: anfrage.status }).from(anfrage)
    .where(and(eq(anfrage.raum, RAUM), eq(anfrage.status, "zugesagt"), gt(anfrage.bis, ab))).all().map(anfrageAlsEintrag);
  const sperren = ladeSperrzeiten(db).filter((s) => s.bis > ab).map(sperreAlsEintrag);
  return [...zusagen, ...sperren];
}

/** Die Statusseite: nur über den Code, nie über die Kennung (IDOR). */
export function anfrageNachCode(db: GemeinschaftSchreiber, code: string): StatusDTO | null {
  const z = db.select({
    id: anfrage.id, status: anfrage.status, von: anfrage.von, bis: anfrage.bis, anlass: anfrage.anlass, personen: anfrage.personen,
    person: anfrage.person, kontakt: anfrage.kontakt, begruendung: anfrage.begruendung, stand: anfrage.vertrag, eingegangenAm: anfrage.eingegangenAm,
  }).from(anfrage).where(eq(anfrage.code, code)).get();
  if (!z) return null;
  const { id, stand, ...a } = z;
  if (a.status !== "zugesagt") return { ...a, vertrag: null };
  return { ...a, vertrag: { stand, dokumente: statusDokumente(db, id, stand) } };
}

/** Was die mietende Person je Art sieht: abgelegte Fassung, sonst ein freigegebenes Dokument. */
function statusDokumente(db: GemeinschaftSchreiber, id: string, stand: VertragStand): StatusDokument[] {
  const dateien = db.select({ art: vertragsdatei.art, am: vertragsdatei.abgelegtAm, herkunft: vertragsdatei.herkunft }).from(vertragsdatei).where(eq(vertragsdatei.anfrageId, id)).all();
  const dokumente = db.select({ art: vertragsdokument.art, version: vertragsdokument.version, freigegebenAm: vertragsdokument.freigegebenAm })
    .from(vertragsdokument).where(eq(vertragsdokument.anfrageId, id)).all();
  return DOKUMENTARTEN.flatMap((art): StatusDokument[] => {
    const f = dateien.find((x) => x.art === art);
    if (f) return [{ art, stand: "unterschrieben", datei: { am: f.am, herkunft: f.herkunft } }];
    // Von der Leitung von Hand auf „unterschrieben“ gesetzt, ohne Datei (Papiervertrag).
    if (art === "mietvertrag" && stand === "unterschrieben") return [{ art, stand: "unterschrieben", datei: null }];
    const d = dokumente.find((x) => x.art === art);
    if (!d || d.freigegebenAm === null) return [];
    return [{ art, stand: "offen", version: d.version, zeichnen: zeichnenErlaubt(db, art) }];
  });
}

/** Schalter „Digital unterschreiben“ der Vorlage; ohne Vorlage (inzwischen entfernt) bleibt das Zeichnen an. */
export function zeichnenErlaubt(db: GemeinschaftSchreiber, art: Dokumentart): boolean {
  return db.select({ z: vertragsvorlage.zeichnen }).from(vertragsvorlage).where(and(eq(vertragsvorlage.raum, RAUM), eq(vertragsvorlage.art, art))).get()?.z ?? true;
}

/** Wie viele Anfragen seit `ab` eingegangen sind — das Mengenbudget gegen Massenabsenden liegt in der Datenbank. */
export function anfragenSeit(db: GemeinschaftSchreiber, ab: number): number {
  return db.select({ n: count() }).from(anfrage).where(gt(anfrage.eingegangenAm, ab)).get()?.n ?? 0;
}

/* ---------------- Öffentlich schreiben ---------------- */

function kollisionsSatz(k: Eintrag): string {
  return `In diesem Zeitraum ist die Bar schon belegt (${zeitraumText(k.von, k.bis)}). Schau im Kalender, wann sie frei ist.`;
}

/** Legt eine Anfrage an, wenn der Zeitraum frei ist (Prüfung und Schreiben in einer Transaktion). Gibt den Code zurück. */
export function legeAnfrageAn(db: GemeinschaftDb, w: AnfrageWert, mitglied: boolean, jetzt: number, sendung?: string): string {
  return db.transaction((tx) => {
    // IDA-358: dieselbe Sendung schon angelegt (nur die Antwort ging verloren) — derselbe Statuslink wie damals.
    if (sendung) {
      const frueher = tx.select({ code: anfrage.code }).from(anfrage).where(eq(anfrage.id, sendung)).get();
      if (frueher) return frueher.code;
    }
    const [k] = harteKonflikte(w, ladeBelegendeEintraege(tx, w.von));
    if (k) throw new Abgelehnt(kollisionsSatz(k));
    const code = neuerLinkCode();
    tx.insert(anfrage).values({
      id: sendung ?? neueId(), raum: RAUM, status: "angefragt", code, von: w.von, bis: w.bis, anlass: w.anlass, personen: w.personen,
      person: w.person, kontakt: w.kontakt, hinweis: w.hinweis, mitglied, eingegangenAm: jetzt,
    }).run();
    return code;
  });
}

/** Die Person zieht ihre Anfrage zurück — offen oder zugesagt; danach ist die Bar für andere wieder frei. */
export function zieheZurueck(db: GemeinschaftDb, code: string, jetzt: number): void {
  db.transaction((tx) => {
    const a = tx.select({ id: anfrage.id, status: anfrage.status }).from(anfrage).where(eq(anfrage.code, code)).get();
    if (!a) throw new NichtGefunden();
    if (a.status !== "angefragt" && a.status !== "zugesagt") throw new Abgelehnt("Diese Anfrage ist schon abgeschlossen.");
    tx.update(anfrage).set({ status: "zurueckgezogen", entschiedenAm: jetzt }).where(eq(anfrage.id, a.id)).run();
  });
}

/* ---------------- Löschfrist ---------------- */

/**
 * IDA-375: löscht die Testanfragen (Anlass „Test"), deren Löschtag erreicht ist — Regel in `testanfrage.ts`, Takt in
 * `hintergrund.ts`. Vorauswahl in SQL (nur „test" nach `trim`/`lower`), der Tag wird in der Suite-Zone gerechnet.
 * Dokumente, Dateien und Unterschriften gehen per `ON DELETE CASCADE` mit. Gibt die Zahl der gelöschten zurück.
 */
export function loescheFaelligeTestanfragen(db: GemeinschaftDb, jetzt: number): number {
  return db.transaction((tx) => {
    const ids = tx.select({ id: anfrage.id, anlass: anfrage.anlass, eingegangenAm: anfrage.eingegangenAm }).from(anfrage)
      .where(and(eq(anfrage.raum, RAUM), sql`lower(trim(${anfrage.anlass})) = ${TEST_ANLASS}`)).all()
      .filter((a) => testanfrageFaellig(a, jetzt)).map((a) => a.id);
    if (ids.length === 0) return 0;
    return tx.delete(anfrage).where(inArray(anfrage.id, ids)).run().changes;
  });
}

/* ---------------- Leitung ---------------- */

function holeAnfrage(tx: GemeinschaftSchreiber, id: string) {
  const a = tx.select({ id: anfrage.id, status: anfrage.status, von: anfrage.von, bis: anfrage.bis, anlass: anfrage.anlass })
    .from(anfrage).where(and(eq(anfrage.id, id), eq(anfrage.raum, RAUM))).get();
  if (!a) throw new NichtGefunden();
  return a;
}

/**
 * Zusagen. Eine harte Überschneidung (Zusage, Sperrzeit, Event) blockiert; offene Anfragen im selben Zeitraum
 * nicht — ihre Zahl kommt zurück, damit die Leitung sie danach ablehnt.
 */
export function sageZu(db: GemeinschaftDb, id: string, jetzt: number): { weitereOffene: number } {
  return db.transaction((tx) => {
    const a = holeAnfrage(tx, id);
    if (a.status !== "angefragt") throw new Abgelehnt("Diese Anfrage ist nicht mehr offen.");
    const hart = harteKonflikte(a, ladeBelegendeEintraege(tx, a.von), a.id);
    if (hart.length) {
      throw new Abgelehnt(`Zusagen geht nicht: der Zeitraum ist schon belegt (${hart.map((x) => x.titel).join(", ")}). Lehne die Anfrage ab oder ändere zuerst die Sperrzeit.`);
    }
    tx.update(anfrage).set({ status: "zugesagt", begruendung: "", entschiedenAm: jetzt }).where(eq(anfrage.id, a.id)).run();
    const offen = tx.select({ id: anfrage.id }).from(anfrage)
      .where(and(eq(anfrage.raum, RAUM), eq(anfrage.status, "angefragt"), lt(anfrage.von, a.bis), gt(anfrage.bis, a.von))).all();
    return { weitereOffene: offen.length };
  });
}

/** Ablehnen (offene Anfrage) mit Pflichtbegründung. */
export function lehneAb(db: GemeinschaftDb, id: string, begruendung: string, jetzt: number): void {
  db.transaction((tx) => {
    const a = holeAnfrage(tx, id);
    if (a.status !== "angefragt") throw new Abgelehnt("Diese Anfrage ist nicht mehr offen.");
    tx.update(anfrage).set({ status: "abgelehnt", begruendung, entschiedenAm: jetzt }).where(eq(anfrage.id, a.id)).run();
  });
}

/** Eine Zusage zurücknehmen, mit Begründung; die Person sieht sie als Absage auf ihrer Statusseite. */
export function nimmZusageZurueck(db: GemeinschaftDb, id: string, begruendung: string, jetzt: number): void {
  db.transaction((tx) => {
    const a = holeAnfrage(tx, id);
    if (a.status !== "zugesagt") throw new Abgelehnt("Diese Anfrage ist nicht zugesagt.");
    tx.update(anfrage).set({ status: "abgelehnt", begruendung, entschiedenAm: jetzt }).where(eq(anfrage.id, a.id)).run();
  });
}

export function setzeVertrag(db: GemeinschaftDb, id: string, stand: VertragStand): void {
  db.transaction((tx) => {
    const a = holeAnfrage(tx, id);
    if (a.status !== "zugesagt") throw new Abgelehnt("Einen Vertrag gibt es nur zu einer Zusage.");
    tx.update(anfrage).set({ vertrag: stand }).where(eq(anfrage.id, a.id)).run();
  });
}

/** Offene und zugesagte Anfragen, die eine geplante Sperrzeit treffen. */
export function getroffeneAnfragen(db: GemeinschaftSchreiber, z: Zeitraum): AnfrageDTO[] {
  return ladeAnfragen(db).filter((a) => (a.status === "angefragt" || a.status === "zugesagt") && ueberlappt(a, z));
}

/**
 * Eine Sperrzeit anlegen. Liegt eine Zusage im Zeitraum, geht es nicht — die Zusage muss zuerst mit Begründung
 * zurückgenommen werden, damit die Person Bescheid bekommt. Offene Anfragen blockieren nicht.
 */
export function legeSperrzeitAn(db: GemeinschaftDb, w: SperrzeitWert, jetzt: number): string {
  return db.transaction((tx) => {
    const zusage = getroffeneAnfragen(tx, w).find((a) => a.status === "zugesagt");
    if (zusage) throw new Abgelehnt(`Hier liegt schon eine Zusage („${zusage.anlass}“, ${zeitraumText(zusage.von, zusage.bis)}). Nimm sie zuerst zurück.`);
    const id = neueId();
    tx.insert(sperrzeit).values({ id, raum: RAUM, von: w.von, bis: w.bis, grund: w.grund, angelegtAm: jetzt }).run();
    return id;
  });
}

export function loescheSperrzeit(db: GemeinschaftDb, id: string): void {
  if (id.startsWith(EVENT_PRAEFIX)) throw new Abgelehnt("Diese Sperrzeit kommt aus einem Event. Ändern oder freigeben geht nur dort.");
  const r = db.delete(sperrzeit).where(and(eq(sperrzeit.id, id), eq(sperrzeit.raum, RAUM))).run();
  if (r.changes === 0) throw new NichtGefunden();
}

/* ---------------- Abgelegte Fassungen ---------------- */

const SCHON_UNTERSCHRIEBEN = "Dieses Dokument ist schon unterschrieben.";

/** Ein Mietvertrag gilt mit der abgelegten Fassung als unterschrieben; Übergabe und Rückgabe haben keinen Stand. */
function markiereUnterschrieben(tx: GemeinschaftSchreiber, id: string, art: Dokumentart) {
  if (art === "mietvertrag") tx.update(anfrage).set({ vertrag: "unterschrieben" }).where(eq(anfrage.id, id)).run();
}

/**
 * Legt die unterschriebene Fassung der Leitung ab (ersetzt eine vorhandene); beim Mietvertrag setzt das
 * „unterschrieben“. Geht auch ohne erstelltes Dokument (Papiervertrag, eingescannt).
 */
export function legeVertragAb(db: GemeinschaftDb, id: string, art: Dokumentart, name: string, inhalt: Buffer, jetzt: number): void {
  db.transaction((tx) => {
    const a = holeAnfrage(tx, id);
    if (a.status !== "zugesagt") throw new Abgelehnt("Ein Dokument gibt es nur zu einer Zusage.");
    const zeile = { name, groesse: inhalt.length, inhalt, abgelegtAm: jetzt, herkunft: "leitung" as const, unterschriebenVon: null };
    tx.insert(vertragsdatei).values({ anfrageId: a.id, art, ...zeile }).onConflictDoUpdate({ target: [vertragsdatei.anfrageId, vertragsdatei.art], set: zeile }).run();
    markiereUnterschrieben(tx, a.id, art);
  });
}

/** Die unterschriebene Fassung; `name` ist der Name zum Herunterladen (`vertragName.ts`), nicht der hochgeladene. */
export function ladeVertragsdatei(db: GemeinschaftSchreiber, id: string, art: Dokumentart): { name: string; inhalt: Buffer } | null {
  const z = db.select({ von: anfrage.von, inhalt: vertragsdatei.inhalt }).from(vertragsdatei)
    .innerJoin(anfrage, eq(anfrage.id, vertragsdatei.anfrageId)).where(and(eq(vertragsdatei.anfrageId, id), eq(vertragsdatei.art, art))).get();
  return z ? { name: dokumentDateiname(art, z.von, true), inhalt: z.inhalt } : null;
}

/**
 * Entfernt die abgelegte Fassung samt allen digitalen Unterschriften: sonst stünde das Dokument „fertig
 * unterschrieben“ ohne Fassung da, und die Leitung unterschreibt erst nach der mietenden Person (IDA-364). Der Mietvertrag fällt auf „verschickt“ (Dokument
 * freigegeben) oder „offen“ zurück.
 */
export function entferneVertrag(db: GemeinschaftDb, id: string, art: Dokumentart): void {
  db.transaction((tx) => {
    const r = tx.delete(vertragsdatei).where(and(eq(vertragsdatei.anfrageId, id), eq(vertragsdatei.art, art))).run();
    if (r.changes === 0) throw new NichtGefunden();
    tx.delete(vertragsunterschrift).where(and(eq(vertragsunterschrift.anfrageId, id), eq(vertragsunterschrift.art, art))).run();
    if (art === "mietvertrag") {
      const d = tx.select({ f: vertragsdokument.freigegebenAm }).from(vertragsdokument).where(and(eq(vertragsdokument.anfrageId, id), eq(vertragsdokument.art, art))).get();
      tx.update(anfrage).set({ vertrag: d?.f != null ? "verschickt" : "offen" }).where(eq(anfrage.id, id)).run();
    }
  });
}

/* ---------------- Vorlagen (IDA-343, IDA-354) ---------------- */

const vorlageWo = (art: Dokumentart) => and(eq(vertragsvorlage.raum, RAUM), eq(vertragsvorlage.art, art));

export function ladeVorlagenInfo(db: GemeinschaftSchreiber): VorlageDTO[] {
  return db.select({ art: vertragsvorlage.art, name: vertragsvorlage.name, groesse: vertragsvorlage.groesse, abgelegtAm: vertragsvorlage.abgelegtAm, sha256: vertragsvorlage.sha256, felder: vertragsvorlage.felder, zeichnen: vertragsvorlage.zeichnen })
    .from(vertragsvorlage).where(eq(vertragsvorlage.raum, RAUM)).all()
    .map((v) => ({ ...v, felder: felderAusJson(v.felder) }))
    .sort((a, b) => DOKUMENTARTEN.indexOf(a.art) - DOKUMENTARTEN.indexOf(b.art));
}

export function ladeVorlage(db: GemeinschaftSchreiber, art: Dokumentart): { name: string; inhalt: Buffer; sha256: string; felder: Vertragsfeld[]; zeichnen: boolean } | null {
  const v = db.select({ name: vertragsvorlage.name, inhalt: vertragsvorlage.inhalt, sha256: vertragsvorlage.sha256, felder: vertragsvorlage.felder, zeichnen: vertragsvorlage.zeichnen })
    .from(vertragsvorlage).where(vorlageWo(art)).get();
  return v ? { ...v, felder: felderAusJson(v.felder) } : null;
}

/**
 * Legt die Vorlage ab oder ersetzt sie. Die Feldliste beginnt neu mit den Formularfeldern der PDF; aufgezogene
 * Felder der alten Vorlage gelten nicht weiter. Schon erstellte Dokumente behalten ihre Kopie.
 */
export function legeVorlageAb(db: GemeinschaftDb, art: Dokumentart, name: string, inhalt: Buffer, sha: string, formular: readonly Vertragsfeld[], jetzt: number): void {
  const zeile = { name, groesse: inhalt.length, inhalt, sha256: sha, felder: JSON.stringify(formular), abgelegtAm: jetzt };
  db.insert(vertragsvorlage).values({ raum: RAUM, art, ...zeile }).onConflictDoUpdate({ target: [vertragsvorlage.raum, vertragsvorlage.art], set: zeile }).run();
}

export function setzeVorlageFelder(db: GemeinschaftDb, art: Dokumentart, felder: readonly Vertragsfeld[]): void {
  const r = db.update(vertragsvorlage).set({ felder: JSON.stringify(felder) }).where(vorlageWo(art)).run();
  if (r.changes === 0) throw new NichtGefunden();
}

/** Schaltet das Zeichnen auf der Statusseite an oder aus; beim Ersetzen der Vorlage bleibt die Wahl stehen. */
export function setzeVorlageZeichnen(db: GemeinschaftDb, art: Dokumentart, an: boolean): void {
  const r = db.update(vertragsvorlage).set({ zeichnen: an }).where(vorlageWo(art)).run();
  if (r.changes === 0) throw new NichtGefunden();
}

export function entferneVorlage(db: GemeinschaftDb, art: Dokumentart): void {
  const r = db.delete(vertragsvorlage).where(vorlageWo(art)).run();
  if (r.changes === 0) throw new NichtGefunden();
}

/* ---------------- Dokumente einer Anfrage (IDA-354) ---------------- */

const dokWo = (id: string, art: Dokumentart) => and(eq(vertragsdokument.anfrageId, id), eq(vertragsdokument.art, art));
const GEAENDERT = "Das Dokument wurde gerade geändert. Bitte die Seite neu laden.";
const FREIGEGEBEN = "Das Dokument ist freigegeben. Nimm die Freigabe zurück, um es zu ändern.";

type DokZeile = { anfrageId: string; art: Dokumentart; felder: Vertragsfeld[]; werte: Werte; version: number; freigegebenAm: number | null };

function holeDokument(tx: GemeinschaftSchreiber, id: string, art: Dokumentart): DokZeile {
  const d = tx.select({ anfrageId: vertragsdokument.anfrageId, art: vertragsdokument.art, felder: vertragsdokument.felder, werte: vertragsdokument.werte, version: vertragsdokument.version, freigegebenAm: vertragsdokument.freigegebenAm })
    .from(vertragsdokument).where(dokWo(id, art)).get();
  if (!d) throw new NichtGefunden();
  return { ...d, felder: felderAusJson(d.felder), werte: werteAusJson(d.werte) };
}

function pruefeVersion(d: DokZeile, version: number) {
  if (d.version !== version) throw new Abgelehnt(GEAENDERT);
}

const naechsteVersion = (tx: GemeinschaftSchreiber, d: DokZeile, mehr: Partial<typeof vertragsdokument.$inferInsert> = {}) =>
  tx.update(vertragsdokument).set({ version: d.version + 1, ...mehr }).where(and(dokWo(d.anfrageId, d.art), eq(vertragsdokument.version, d.version))).run();

function hatDatei(tx: GemeinschaftSchreiber, id: string, art: Dokumentart): boolean {
  return tx.select({ a: vertragsdatei.anfrageId }).from(vertragsdatei).where(and(eq(vertragsdatei.anfrageId, id), eq(vertragsdatei.art, art))).get() !== undefined;
}

/**
 * Erstellt das Dokument einer Zusage aus der aktuellen Vorlage (Kopie von PDF und Feldern). Die Version beginnt beim
 * Erstellzeitpunkt, nicht bei 1: ein verworfenes und neu erstelltes Dokument nimmt keine Version des alten an.
 */
export function erstelleDokument(db: GemeinschaftDb, id: string, art: Dokumentart, jetzt: number, von: string | null = null): void {
  db.transaction((tx) => {
    const a = holeAnfrage(tx, id);
    if (a.status !== "zugesagt") throw new Abgelehnt("Ein Dokument gibt es nur zu einer Zusage.");
    const v = tx.select({ name: vertragsvorlage.name, inhalt: vertragsvorlage.inhalt, felder: vertragsvorlage.felder }).from(vertragsvorlage).where(vorlageWo(art)).get();
    if (!v) throw new Abgelehnt("Dazu liegt keine Vorlage. Lade sie zuerst unter Vermietung, Verträge hoch.");
    const da = tx.select({ a: vertragsdokument.anfrageId }).from(vertragsdokument).where(dokWo(id, art)).get();
    if (da) throw new Abgelehnt("Dieses Dokument gibt es schon.");
    tx.insert(vertragsdokument).values({ anfrageId: id, art, name: v.name, inhalt: v.inhalt, felder: v.felder, werte: "{}", version: jetzt, erstelltAm: jetzt, erstelltVon: von?.trim() || null }).run();
  });
}

/** Verwirft einen Entwurf; ein freigegebenes Dokument nicht. */
export function verwirfDokument(db: GemeinschaftDb, id: string, art: Dokumentart): void {
  db.transaction((tx) => {
    const d = holeDokument(tx, id, art);
    if (d.freigegebenAm !== null) throw new Abgelehnt(FREIGEGEBEN);
    tx.delete(vertragsdokument).where(dokWo(id, art)).run();
  });
}

/** Speichert die Werte der Leitung, nur vor der Freigabe; Unterschriften gibt es erst danach (IDA-364), gelöscht wird zur Sicherheit trotzdem. */
export function speichereWerte(db: GemeinschaftDb, id: string, art: Dokumentart, werte: Werte, version: number): number {
  return db.transaction((tx) => {
    const d = holeDokument(tx, id, art);
    pruefeVersion(d, version);
    if (d.freigegebenAm !== null) throw new Abgelehnt(FREIGEGEBEN);
    const neu = JSON.stringify(werte);
    if (neu === JSON.stringify(d.werte)) return d.version;
    tx.delete(vertragsunterschrift).where(and(eq(vertragsunterschrift.anfrageId, id), eq(vertragsunterschrift.art, art))).run();
    naechsteVersion(tx, d, { werte: neu });
    return d.version + 1;
  });
}

export type NeueUnterschrift = { name: string; bild: Buffer; am: number };

/**
 * Wartet das Dokument auf die Leitung? Erst wenn die mietende Person unterschrieben hat (IDA-364), nur mit Feld für die
 * Leitung, und nicht, wenn die Leitung die Fassung selbst abgelegt hat (Papier, von ihr unterschrieben).
 */
function wartetAufLeitung(felder: readonly Vertragsfeld[], herkunft: Herkunft, leitungDa: boolean): boolean {
  return herkunft !== "leitung" && !leitungDa && unterschriftfelder(felder, "leitung").length > 0;
}

const NACH_MIETER = "Die Leitung unterschreibt, nachdem die mietende Person unterschrieben hat.";

/**
 * Darf die Leitung jetzt unterschreiben? Nur nach der mietenden Person, nur einmal. Gibt die abgelegte Fassung zurück,
 * an die die Unterschrift kommt.
 */
export function pruefeLeitungUnterschreibbar(tx: GemeinschaftSchreiber, id: string, art: Dokumentart, version: number) {
  const d = holeDokument(tx, id, art);
  pruefeVersion(d, version);
  const felder = unterschriftfelder(d.felder, "leitung");
  if (!felder.length) throw new Abgelehnt("Dieses Dokument hat kein Unterschriftenfeld für die Leitung.");
  const f = tx.select({ herkunft: vertragsdatei.herkunft, inhalt: vertragsdatei.inhalt, abgelegtAm: vertragsdatei.abgelegtAm })
    .from(vertragsdatei).where(and(eq(vertragsdatei.anfrageId, id), eq(vertragsdatei.art, art))).get();
  if (d.freigegebenAm === null || !f) throw new Abgelehnt(NACH_MIETER);
  const da = tx.select({ f: vertragsunterschrift.feldId }).from(vertragsunterschrift)
    .where(and(eq(vertragsunterschrift.anfrageId, id), eq(vertragsunterschrift.art, art), eq(vertragsunterschrift.rolle, "leitung"))).get();
  if (!wartetAufLeitung(d.felder, f.herkunft, da !== undefined)) throw new Abgelehnt(SCHON_UNTERSCHRIEBEN);
  return { herkunft: f.herkunft as Exclude<Herkunft, "leitung">, inhalt: f.inhalt, abgelegtAm: f.abgelegtAm, feldIds: felder.map((x) => x.id) };
}


/**
 * Die Leitung unterschreibt alle ihre Felder, nach der mietenden Person (IDA-364): ihre Unterschrift wird
 * gespeichert und die abgelegte Fassung durch `inhalt` ersetzt (mit beiden Unterschriften). `abgelegtAm` ist die
 * Fassung, aus der `inhalt` entstand — wurde sie inzwischen ersetzt, wird nichts gespeichert. Gibt die neue Version
 * zurück.
 */
export function unterschreibeAlsLeitung(db: GemeinschaftDb, id: string, art: Dokumentart, version: number, u: NeueUnterschrift, fassung: { inhalt: Buffer; abgelegtAm: number }): number {
  return db.transaction((tx) => {
    const p = pruefeLeitungUnterschreibbar(tx, id, art, version);
    if (p.abgelegtAm !== fassung.abgelegtAm) throw new Abgelehnt(GEAENDERT);
    for (const feldId of p.feldIds) {
      tx.insert(vertragsunterschrift).values({ anfrageId: id, art, feldId, rolle: "leitung", name: u.name, am: u.am, bild: u.bild }).run();
    }
    tx.update(vertragsdatei).set({ inhalt: fassung.inhalt, groesse: fassung.inhalt.length })
      .where(and(eq(vertragsdatei.anfrageId, id), eq(vertragsdatei.art, art))).run();
    naechsteVersion(tx, holeDokument(tx, id, art));
    return version + 1;
  });
}

/** Gibt das Dokument frei: es steht auf der Statusseite, die Werte sind gesperrt. Die Leitung unterschreibt danach (IDA-364). */
export function gebeDokumentFrei(db: GemeinschaftDb, id: string, art: Dokumentart, version: number, jetzt: number): void {
  db.transaction((tx) => {
    const a = holeAnfrage(tx, id);
    if (a.status !== "zugesagt") throw new Abgelehnt("Ein Dokument gibt es nur zu einer Zusage.");
    const d = holeDokument(tx, id, art);
    pruefeVersion(d, version);
    if (d.freigegebenAm !== null) throw new Abgelehnt("Das Dokument ist schon freigegeben.");
    naechsteVersion(tx, d, { freigegebenAm: jetzt });
    if (art === "mietvertrag") tx.update(anfrage).set({ vertrag: "verschickt" }).where(and(eq(anfrage.id, id), eq(anfrage.vertrag, "offen"))).run();
  });
}

/** Nimmt die Freigabe zurück, solange die mietende Person nicht unterschrieben hat und nichts abgelegt ist. */
export function nimmFreigabeZurueck(db: GemeinschaftDb, id: string, art: Dokumentart, version: number): void {
  db.transaction((tx) => {
    const d = holeDokument(tx, id, art);
    pruefeVersion(d, version);
    if (d.freigegebenAm === null) throw new Abgelehnt("Das Dokument ist nicht freigegeben.");
    if (hatDatei(tx, id, art)) throw new Abgelehnt(SCHON_UNTERSCHRIEBEN);
    naechsteVersion(tx, d, { freigegebenAm: null });
    if (art === "mietvertrag") tx.update(anfrage).set({ vertrag: "offen" }).where(and(eq(anfrage.id, id), eq(anfrage.vertrag, "verschickt"))).run();
  });
}

/** Alles, was die PDF eines Dokuments braucht (Vorlage, Felder, Werte, Unterschriften mit Bild). */
export function dokumentGrundlage(db: GemeinschaftSchreiber, id: string, art: Dokumentart) {
  const d = db.select().from(vertragsdokument).where(dokWo(id, art)).get();
  if (!d) return null;
  const a = db.select({ von: anfrage.von, bis: anfrage.bis, anlass: anfrage.anlass, person: anfrage.person, status: anfrage.status }).from(anfrage).where(eq(anfrage.id, id)).get();
  if (!a) return null;
  const unterschriften = db.select({ feldId: vertragsunterschrift.feldId, rolle: vertragsunterschrift.rolle, name: vertragsunterschrift.name, am: vertragsunterschrift.am, bild: vertragsunterschrift.bild })
    .from(vertragsunterschrift).where(and(eq(vertragsunterschrift.anfrageId, id), eq(vertragsunterschrift.art, art))).all();
  return { anfrage: a, inhalt: d.inhalt, felder: felderAusJson(d.felder), werte: werteAusJson(d.werte), version: d.version, freigegebenAm: d.freigegebenAm, erstelltVon: d.erstelltVon, unterschriften };
}

/** Die Ausfüllseite der Leitung. */
export function ladeDokument(db: GemeinschaftSchreiber, id: string, art: Dokumentart): DokumentDTO | null {
  const g = dokumentGrundlage(db, id, art);
  if (!g || g.anfrage.status !== "zugesagt") return null;
  const f = db.select({ groesse: vertragsdatei.groesse, abgelegtAm: vertragsdatei.abgelegtAm, herkunft: vertragsdatei.herkunft, unterschriebenVon: vertragsdatei.unterschriebenVon })
    .from(vertragsdatei).where(and(eq(vertragsdatei.anfrageId, id), eq(vertragsdatei.art, art))).get();
  return {
    anfrageId: id, art, felder: g.felder, werte: g.werte, version: g.version, freigegebenAm: g.freigegebenAm,
    unterschriften: g.unterschriften.map(({ bild: _, ...u }) => u), datei: f ? abgelegt(art, g.anfrage.von, f) : null, zeichnen: zeichnenErlaubt(db, art),
    erstelltVon: g.erstelltVon,
    anfrage: { person: g.anfrage.person, anlass: g.anfrage.anlass, von: g.anfrage.von, bis: g.anfrage.bis },
  };
}

/** Die Statusseite: Anfrage zum Code, nur bei einer Zusage. */
export function vertragsGrundlage(db: GemeinschaftSchreiber, code: string) {
  const a = db.select({ id: anfrage.id, status: anfrage.status, vertrag: anfrage.vertrag, von: anfrage.von, bis: anfrage.bis, anlass: anfrage.anlass, person: anfrage.person })
    .from(anfrage).where(and(eq(anfrage.code, code), eq(anfrage.raum, RAUM))).get();
  return a ?? null;
}

/**
 * Darf die mietende Person dieses Dokument (noch) unterschreiben? Über den Code der Statusseite oder, vor Ort, über
 * die Kennung (dann prüft die Action die Leitung). Wirft den Satz für die Oberfläche.
 */
export function pruefeUnterschreibbar(tx: GemeinschaftSchreiber, wer: { code: string } | { id: string }, art: Dokumentart) {
  const a = "code" in wer ? vertragsGrundlage(tx, wer.code)
    : tx.select({ id: anfrage.id, status: anfrage.status, vertrag: anfrage.vertrag, von: anfrage.von, bis: anfrage.bis, anlass: anfrage.anlass, person: anfrage.person })
      .from(anfrage).where(and(eq(anfrage.id, wer.id), eq(anfrage.raum, RAUM))).get() ?? null;
  if (!a) throw new NichtGefunden();
  if (a.status !== "zugesagt") throw new Abgelehnt("Ein Dokument gibt es nur zu einer Zusage.");
  if (hatDatei(tx, a.id, art) || (art === "mietvertrag" && a.vertrag === "unterschrieben")) throw new Abgelehnt(SCHON_UNTERSCHRIEBEN);
  const d = tx.select({ f: vertragsdokument.freigegebenAm, version: vertragsdokument.version }).from(vertragsdokument).where(dokWo(a.id, art)).get();
  if (!d || d.f === null) throw new Abgelehnt("Zu dieser Zusage liegt dieses Dokument nicht zum Unterschreiben vor.");
  return { ...a, version: d.version };
}

/**
 * Legt die fertige Fassung ab, die die mietende Person unterschrieben hat: gezeichnet (mit ihren Unterschriften,
 * `version` = die Version, die sie gesehen hat — inzwischen geändert, wird nichts gespeichert) oder als Datei/Foto
 * hochgeladen. Eine Transaktion, damit zwei gleichzeitige Unterschriften nicht beide landen.
 */
export function legeUnterschriebenAb(
  db: GemeinschaftDb, wer: { code: string } | { id: string }, art: Dokumentart,
  d: { inhalt: Buffer; herkunft: Exclude<Herkunft, "leitung">; unterschrift: (NeueUnterschrift & { feldIds: string[] }) | null; version: number | null },
  jetzt: number,
): void {
  db.transaction((tx) => {
    const a = pruefeUnterschreibbar(tx, wer, art);
    if (d.version !== null && a.version !== d.version) throw new Abgelehnt(GEAENDERT);
    if (d.unterschrift) {
      for (const feldId of d.unterschrift.feldIds) {
        tx.insert(vertragsunterschrift).values({ anfrageId: a.id, art, feldId, rolle: "mieter", name: d.unterschrift.name, am: d.unterschrift.am, bild: d.unterschrift.bild })
          .onConflictDoNothing().run();
      }
    }
    tx.insert(vertragsdatei).values({
      anfrageId: a.id, art, name: dokumentDateiname(art, a.von, true), groesse: d.inhalt.length, inhalt: d.inhalt, abgelegtAm: jetzt,
      herkunft: d.herkunft, unterschriebenVon: d.unterschrift?.name ?? null,
    }).run();
    markiereUnterschrieben(tx, a.id, art);
  });
}

/** Für die Statusseite: die unterschriebene Fassung, sonst das freigegebene Dokument (zum Rendern). */
export function dokumentFuerStatus(db: GemeinschaftSchreiber, code: string, art: Dokumentart):
  | { id: string; art: "unterschrieben"; name: string; inhalt: Buffer }
  | { id: string; art: "ansicht"; grundlage: NonNullable<ReturnType<typeof dokumentGrundlage>> }
  | null {
  const a = vertragsGrundlage(db, code);
  if (!a || a.status !== "zugesagt") return null;
  const datei = ladeVertragsdatei(db, a.id, art);
  if (datei) return { id: a.id, art: "unterschrieben", ...datei };
  const g = dokumentGrundlage(db, a.id, art);
  if (!g || g.freigegebenAm === null) return null;
  return { id: a.id, art: "ansicht", grundlage: g };
}
