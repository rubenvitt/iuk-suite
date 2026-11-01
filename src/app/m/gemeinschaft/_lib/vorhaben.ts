/**
 * Lesen und Schreiben von Events, Projekten und ihren Aufgaben (IDA-320). Jede Funktion bekommt die
 * Kennung des Vorhabens und prüft, dass die Aufgabe zu GENAU diesem Vorhaben gehört, und dass genannte
 * Mitglieder und Projekte existieren — nie einer Kennung aus der Anfrage glauben (IDOR, CLAUDE.md
 * „Zugriffsschutz“).
 *
 * Gelesen wird bewusst der ganze Bestand der Planung auf einmal: eine Helfergruppe hat Dutzende Vorhaben,
 * nicht Tausende, und so rechnen Liste, Übersicht und Detailseite aus denselben Zahlen.
 */
import { and, asc, count, eq, gt, inArray, lt, max } from "drizzle-orm";
import type { GemeinschaftDb, GemeinschaftSchreiber } from "../_db/client";
import { anfrage, aufgabe, mitglied, sperrzeit, vorhaben, zustaendig } from "../_db/schema";
import { neueId } from "./kennung";
import { barKonflikte, barKonfliktName, type BarEintrag, type BarKonflikte } from "./vorhabenBar";
import { MAX_AUFGABEN, type AufgabeEingabe, type VorhabenEingabe } from "./vorhabenEingabe";
import { istVorbei, type AufgabeDTO, type FormularDaten, type MitgliedWahl, type VorhabenArt, type VorhabenDetailDTO, type VorhabenKarteDTO } from "./vorhabenTypen";

/** Ein Objekt, das es nicht (mehr) gibt. Die Meldung geht so an die Leitung. */
export class NichtGefunden extends Error {
  constructor(was = "Dieses Event oder Projekt gibt es nicht mehr.") {
    super(was);
  }
}

/** Ein Wert, den die Planung nicht aufnehmen kann (Bar vergeben, Person unbekannt …). */
export class Abgelehnt extends Error {}

type Db = GemeinschaftSchreiber;
type VorhabenZeile = typeof vorhaben.$inferSelect;

const nachName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "de");

/* ── Lesen ──────────────────────────────────────────────────────────────── */

/** Alle Mitglieder zur Auswahl (Verantwortlich, Zuständige), nach Namen. Ohne Telefon. */
export function mitgliederWahl(db: Db): MitgliedWahl[] {
  return db.select({ id: mitglied.id, name: mitglied.name }).from(mitglied).all().sort(nachName);
}

/** Alle Projekte zur Auswahl „Gehört zu Projekt“, nach Titel. */
export function projektWahl(db: Db): { id: string; titel: string }[] {
  return db.select({ id: vorhaben.id, titel: vorhaben.titel }).from(vorhaben).where(eq(vorhaben.art, "projekt")).all()
    .sort((a, b) => a.titel.localeCompare(b.titel, "de"));
}

type Bestand = {
  vorhaben: VorhabenZeile[];
  mitglieder: Map<string, MitgliedWahl>;
  aufgaben: Map<string, AufgabeDTO[]>;
};

/** Der ganze Bestand der Planung, Aufgaben je Vorhaben in ihrer Reihenfolge, Zuständige nach Namen. */
export function ladeBestand(db: Db): Bestand {
  const mitglieder = new Map(mitgliederWahl(db).map((m) => [m.id, m]));
  const zu = new Map<string, string[]>();
  for (const z of db.select().from(zustaendig).all()) zu.set(z.aufgabeId, [...(zu.get(z.aufgabeId) ?? []), z.mitgliedId]);
  const aufgaben = new Map<string, AufgabeDTO[]>();
  for (const a of db.select().from(aufgabe).orderBy(asc(aufgabe.position), asc(aufgabe.angelegtAm)).all()) {
    const ids = (zu.get(a.id) ?? []).filter((id) => mitglieder.has(id)).sort((x, y) => nachName(mitglieder.get(x)!, mitglieder.get(y)!));
    aufgaben.set(a.vorhabenId, [...(aufgaben.get(a.vorhabenId) ?? []), { id: a.id, titel: a.titel, faellig: a.faellig, erledigt: a.erledigtAm !== null, zustaendig: ids }]);
  }
  return { vorhaben: db.select().from(vorhaben).all(), mitglieder, aufgaben };
}

function karte(v: VorhabenZeile, b: Bestand, jetzt: number): VorhabenKarteDTO {
  const liste = b.aufgaben.get(v.id) ?? [];
  const projekt = v.projektId ? b.vorhaben.find((p) => p.id === v.projektId && p.art === "projekt") : undefined;
  return {
    id: v.id, art: v.art, titel: v.titel,
    verantwortlich: v.verantwortlichId ? b.mitglieder.get(v.verantwortlichId) ?? null : null,
    von: v.von, bis: v.bis, ort: v.ort, barBelegen: v.barBelegen, ziel: v.ziel,
    projekt: projekt ? { id: projekt.id, titel: projekt.titel } : null,
    events: v.art === "projekt" ? b.vorhaben.filter((e) => e.art === "event" && e.projektId === v.id).length : 0,
    aufgaben: liste.length,
    erledigt: liste.filter((a) => a.erledigt).length,
    ohneZustaendige: liste.filter((a) => !a.erledigt && a.zustaendig.length === 0).length,
    vorbei: istVorbei(v, jetzt),
  };
}

/** Events kommend (nach Beginn) und vorbei (neueste zuerst). */
export function eventKarten(db: Db, jetzt = Date.now()): { kommend: VorhabenKarteDTO[]; vorbei: VorhabenKarteDTO[] } {
  const b = ladeBestand(db);
  const alle = b.vorhaben.filter((v) => v.art === "event").map((v) => karte(v, b, jetzt));
  return {
    kommend: alle.filter((k) => !k.vorbei).sort((x, y) => x.von! - y.von!),
    vorbei: alle.filter((k) => k.vorbei).sort((x, y) => y.von! - x.von!),
  };
}

/** Projekte nach Zieltermin, ohne Ziel zuletzt. */
export function projektKarten(db: Db, jetzt = Date.now()): VorhabenKarteDTO[] {
  const b = ladeBestand(db);
  return b.vorhaben.filter((v) => v.art === "projekt").map((v) => karte(v, b, jetzt))
    .sort((x, y) => (x.ziel ?? "9999").localeCompare(y.ziel ?? "9999") || x.titel.localeCompare(y.titel, "de"));
}

/** Die Detailseite: Fakten, Aufgaben (offen vor erledigt, nach Fälligkeit), bei Projekten die Events. */
export function vorhabenDetail(db: Db, id: string, jetzt = Date.now()): VorhabenDetailDTO | null {
  const b = ladeBestand(db);
  const v = b.vorhaben.find((x) => x.id === id);
  if (!v) return null;
  const aufgabenListe = [...(b.aufgaben.get(v.id) ?? [])].sort((x, y) =>
    Number(x.erledigt) - Number(y.erledigt) || (x.faellig ?? "9999").localeCompare(y.faellig ?? "9999"));
  const eventKarten = v.art === "projekt"
    ? b.vorhaben.filter((e) => e.art === "event" && e.projektId === v.id).sort((x, y) => x.von! - y.von!).map((e) => karte(e, b, jetzt))
    : [];
  return { ...karte(v, b, jetzt), beschreibung: v.beschreibung, verantwortlichId: v.verantwortlichId, projektId: v.projektId, aufgabenListe, eventKarten };
}

const ENDE_DER_ZEIT = Number.MAX_SAFE_INTEGER;

/**
 * Was die Bar im Zeitraum `[von, bis)` belegt oder angefragt hat: Sperrzeiten, zugesagte und offene
 * Anfragen, Events mit „Bar belegen“. Abgelehnte und zurückgezogene Anfragen zählen nicht.
 */
export function barBelegungIm(db: Db, von: number, bis: number): BarEintrag[] {
  const sperren = db.select({ id: sperrzeit.id, von: sperrzeit.von, bis: sperrzeit.bis, titel: sperrzeit.grund }).from(sperrzeit)
    .where(and(eq(sperrzeit.raum, "bar"), lt(sperrzeit.von, bis), gt(sperrzeit.bis, von))).all()
    .map((s) => ({ ...s, art: "sperre" as const }));
  const anfragen = db.select({ id: anfrage.id, von: anfrage.von, bis: anfrage.bis, titel: anfrage.anlass, status: anfrage.status }).from(anfrage)
    .where(and(eq(anfrage.raum, "bar"), inArray(anfrage.status, ["angefragt", "zugesagt"]), lt(anfrage.von, bis), gt(anfrage.bis, von))).all()
    .map(({ status, ...a }) => ({ ...a, art: status === "zugesagt" ? "zugesagt" as const : "angefragt" as const }));
  const events = db.select({ id: vorhaben.id, von: vorhaben.von, bis: vorhaben.bis, titel: vorhaben.titel }).from(vorhaben)
    .where(and(eq(vorhaben.art, "event"), eq(vorhaben.barBelegen, true), lt(vorhaben.von, bis), gt(vorhaben.bis, von))).all()
    .map((e) => ({ id: e.id, von: e.von!, bis: e.bis!, titel: e.titel, art: "event" as const }));
  return [...sperren, ...anfragen, ...events].sort((a, b) => a.von - b.von);
}

/** Die Bar ab `ab` — für die Konfliktanzeige im Formular. */
export function barBelegung(db: Db, ab: number): BarEintrag[] {
  return barBelegungIm(db, ab, ENDE_DER_ZEIT);
}

export function barKonflikteInDb(db: Db, von: number, bis: number, eigenesEvent: string | null): BarKonflikte {
  return barKonflikte(barBelegungIm(db, von, bis), { von, bis }, eigenesEvent);
}

/** Auswahl und Bar-Belegung für das Formular „anlegen/bearbeiten“. Die Bar ab dem Vortag, damit ein laufendes Event mitzählt. */
export function formularDaten(db: Db, jetzt = Date.now()): FormularDaten {
  return { mitglieder: mitgliederWahl(db), projekte: projektWahl(db), bar: barBelegung(db, jetzt - 86_400_000) };
}

/* ── Schreiben ──────────────────────────────────────────────────────────── */

function vorhabenZeile(db: Db, id: string): VorhabenZeile {
  const v = db.select().from(vorhaben).where(eq(vorhaben.id, id)).get();
  if (!v) throw new NichtGefunden();
  return v;
}

function pruefeMitglieder(db: Db, ids: readonly string[]): void {
  if (ids.length === 0) return;
  const da = db.select({ id: mitglied.id }).from(mitglied).where(inArray(mitglied.id, [...ids])).all();
  if (da.length !== new Set(ids).size) throw new Abgelehnt("Eine der gewählten Personen gibt es nicht mehr. Bitte die Seite neu laden.");
}

function aufgabeIn(db: Db, vorhabenId: string, aufgabeId: string) {
  const a = db.select().from(aufgabe).where(and(eq(aufgabe.id, aufgabeId), eq(aufgabe.vorhabenId, vorhabenId))).get();
  if (!a) throw new NichtGefunden("Diese Aufgabe gibt es nicht mehr.");
  return a;
}

const beruehrt = (db: Db, id: string, jetzt: number) => db.update(vorhaben).set({ aktualisiertAm: jetzt }).where(eq(vorhaben.id, id)).run();

/**
 * Anlegen (`id === null`) oder ändern; gibt die Kennung zurück. Die Art lässt sich nicht wechseln. Ein Event
 * mit „Bar belegen“ wird abgelehnt, solange eine Sperrzeit, eine Zusage oder ein anderes Bar-Event im
 * Zeitraum liegt; offene Anfragen halten es nicht auf.
 */
export function speichereVorhaben(db: GemeinschaftDb, id: string | null, e: VorhabenEingabe, jetzt = Date.now()): string {
  return db.transaction((tx) => {
    const alt = id === null ? null : vorhabenZeile(tx, id);
    if (alt && alt.art !== e.art) throw new Abgelehnt("Aus einem Event wird kein Projekt und umgekehrt.");
    if (e.verantwortlichId) pruefeMitglieder(tx, [e.verantwortlichId]);
    const gemeinsam = { titel: e.titel, beschreibung: e.beschreibung, verantwortlichId: e.verantwortlichId, aktualisiertAm: jetzt };
    let felder: Partial<typeof vorhaben.$inferInsert>;
    if (e.art === "event") {
      if (e.projektId) {
        const p = tx.select({ art: vorhaben.art }).from(vorhaben).where(eq(vorhaben.id, e.projektId)).get();
        if (p?.art !== "projekt") throw new Abgelehnt("Dieses Projekt gibt es nicht mehr. Bitte die Seite neu laden.");
      }
      if (e.barBelegen) {
        const { hart } = barKonflikteInDb(tx, e.von, e.bis, id);
        if (hart.length) throw new Abgelehnt(`Die Bar ist in dieser Zeit schon vergeben: ${hart.map(barKonfliktName).join(", ")}.`);
      }
      felder = { ...gemeinsam, von: e.von, bis: e.bis, ort: e.ort, barBelegen: e.barBelegen, projektId: e.projektId, ziel: null };
    } else {
      felder = { ...gemeinsam, ziel: e.ziel };
    }
    if (alt) {
      tx.update(vorhaben).set(felder).where(eq(vorhaben.id, alt.id)).run();
      return alt.id;
    }
    const neu = neueId();
    tx.insert(vorhaben).values({ ...felder, id: neu, art: e.art, titel: e.titel, angelegtAm: jetzt, aktualisiertAm: jetzt }).run();
    return neu;
  });
}

/** Löscht ein Event oder Projekt samt Aufgaben; die Events eines Projekts bleiben, nur ohne Projekt. */
export function loescheVorhaben(db: GemeinschaftDb, id: string, jetzt = Date.now()): VorhabenArt {
  return db.transaction((tx) => {
    const v = vorhabenZeile(tx, id);
    if (v.art === "projekt") tx.update(vorhaben).set({ projektId: null, aktualisiertAm: jetzt }).where(eq(vorhaben.projektId, id)).run();
    tx.delete(vorhaben).where(eq(vorhaben.id, id)).run();
    return v.art;
  });
}

export function setzeVerantwortlich(db: GemeinschaftDb, vorhabenId: string, mitgliedId: string | null, jetzt = Date.now()): void {
  db.transaction((tx) => {
    vorhabenZeile(tx, vorhabenId);
    if (mitgliedId) pruefeMitglieder(tx, [mitgliedId]);
    tx.update(vorhaben).set({ verantwortlichId: mitgliedId, aktualisiertAm: jetzt }).where(eq(vorhaben.id, vorhabenId)).run();
  });
}

/** Neue Aufgabe ans Ende der Liste; gibt ihre Kennung zurück. */
export function legeAufgabeAn(db: GemeinschaftDb, vorhabenId: string, e: AufgabeEingabe, jetzt = Date.now()): string {
  return db.transaction((tx) => {
    vorhabenZeile(tx, vorhabenId);
    pruefeMitglieder(tx, e.zustaendig);
    const stand = tx.select({ n: max(aufgabe.position), anzahl: count() }).from(aufgabe).where(eq(aufgabe.vorhabenId, vorhabenId)).get();
    if ((stand?.anzahl ?? 0) >= MAX_AUFGABEN) throw new Abgelehnt(`Höchstens ${MAX_AUFGABEN} Aufgaben je Event oder Projekt.`);
    const id = neueId();
    tx.insert(aufgabe).values({ id, vorhabenId, titel: e.titel, faellig: e.faellig, position: (stand?.n ?? -1) + 1, angelegtAm: jetzt }).run();
    if (e.zustaendig.length) tx.insert(zustaendig).values(e.zustaendig.map((mitgliedId) => ({ aufgabeId: id, mitgliedId }))).run();
    beruehrt(tx, vorhabenId, jetzt);
    return id;
  });
}

export function setzeErledigt(db: GemeinschaftDb, vorhabenId: string, aufgabeId: string, erledigt: boolean, jetzt = Date.now()): void {
  db.transaction((tx) => {
    const a = aufgabeIn(tx, vorhabenId, aufgabeId);
    if ((a.erledigtAm !== null) === erledigt) return;
    tx.update(aufgabe).set({ erledigtAm: erledigt ? jetzt : null }).where(eq(aufgabe.id, aufgabeId)).run();
    beruehrt(tx, vorhabenId, jetzt);
  });
}

/** Ersetzt die Zuständigen einer Aufgabe; nur die Unterschiede werden geschrieben (sauberes Audit). */
export function setzeZustaendige(db: GemeinschaftDb, vorhabenId: string, aufgabeId: string, ids: readonly string[], jetzt = Date.now()): void {
  db.transaction((tx) => {
    aufgabeIn(tx, vorhabenId, aufgabeId);
    pruefeMitglieder(tx, ids);
    const bisher = new Set(tx.select({ id: zustaendig.mitgliedId }).from(zustaendig).where(eq(zustaendig.aufgabeId, aufgabeId)).all().map((z) => z.id));
    const soll = new Set(ids);
    const weg = [...bisher].filter((id) => !soll.has(id));
    const dazu = [...soll].filter((id) => !bisher.has(id));
    if (weg.length) tx.delete(zustaendig).where(and(eq(zustaendig.aufgabeId, aufgabeId), inArray(zustaendig.mitgliedId, weg))).run();
    if (dazu.length) tx.insert(zustaendig).values(dazu.map((mitgliedId) => ({ aufgabeId, mitgliedId }))).run();
    if (weg.length || dazu.length) beruehrt(tx, vorhabenId, jetzt);
  });
}

export function loescheAufgabe(db: GemeinschaftDb, vorhabenId: string, aufgabeId: string, jetzt = Date.now()): void {
  db.transaction((tx) => {
    aufgabeIn(tx, vorhabenId, aufgabeId);
    tx.delete(aufgabe).where(eq(aufgabe.id, aufgabeId)).run();
    beruehrt(tx, vorhabenId, jetzt);
  });
}
