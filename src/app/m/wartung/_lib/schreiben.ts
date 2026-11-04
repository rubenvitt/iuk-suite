/**
 * DIE SCHREIBPFADE DER GERÄTEWARTUNG (IDA-312). Rechte prüfen die Actions und Routen davor (`_lib/zugang.ts`);
 * hier stehen die fachlichen Regeln: was zusammen geschrieben wird und was abgelehnt wird.
 *
 * Erwartbare Ablehnungen werfen `Abgelehnt` mit einem Satz für den Bildschirm; alles andere ist ein Fehler.
 */
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { WartungDb, WartungSchreiber } from "../_db/client";
import { art, checkpunkt, eintrag, frist, geraet, gruppe, inhalt, mangel, verwalter } from "../_db/schema";
import {
  artIkone, type ArtEingabe, type ErledigtEingabe, type GeraetEingabe, type GruppeEingabe, type InhaltEingabe, type PruefungEingabe,
} from "./eingabe";

export class Abgelehnt extends Error {
  constructor(text: string, readonly feld?: string) {
    super(text);
  }
}

export const neueId = (): string => randomUUID();

interface Kontext {
  jetzt: number;
  heute: string;
  wer: string;
}

function aktivesGeraet(db: WartungSchreiber, id: string) {
  const g = db.select().from(geraet).where(eq(geraet.id, id)).get();
  if (!g || !g.aktiv) throw new Abgelehnt("Dieses Gerät gibt es nicht mehr.");
  return g;
}

function pruefeStunden(neu: number | null, alt: number | null): void {
  if (neu !== null && alt !== null && neu < alt) {
    throw new Abgelehnt(`Kleiner als der letzte Stand (${alt} h). Bitte noch einmal ablesen.`, "stunden");
  }
}

// ---------------------------------------------------------------- Gruppen

export function gruppeSpeichern(db: WartungDb, id: string | null, e: GruppeEingabe, jetzt: number): string {
  if (id) {
    const r = db.update(gruppe).set({ name: e.name, aktualisiertAm: jetzt }).where(eq(gruppe.id, id)).run();
    if (r.changes === 0) throw new Abgelehnt("Diese Gruppe gibt es nicht mehr.");
    return id;
  }
  const neu = neueId();
  const position = db.select({ n: sql<number>`coalesce(max(position), -1) + 1` }).from(gruppe).get()?.n ?? 0;
  db.insert(gruppe).values({ id: neu, name: e.name, position, angelegtAm: jetzt, aktualisiertAm: jetzt }).run();
  return neu;
}

export function gruppeLoeschen(db: WartungDb, id: string): void {
  const n = db.select({ n: sql<number>`count(*)` }).from(geraet).where(eq(geraet.gruppeId, id)).get()?.n ?? 0;
  if (n > 0) throw new Abgelehnt("Zu dieser Gruppe gehören noch Geräte, auch ausgemusterte.");
  db.transaction((tx) => {
    tx.delete(verwalter).where(eq(verwalter.gruppeId, id)).run();
    tx.delete(gruppe).where(eq(gruppe.id, id)).run();
  });
}

// ---------------------------------------------------------------- Gerätearten

/** Legt an oder ersetzt Fristen und Checkliste der Art; entfernte Fristen lassen den Verlauf stehen. */
export function artSpeichern(db: WartungDb, id: string | null, e: ArtEingabe, jetzt: number): string {
  return db.transaction((tx) => {
    const artId = id ?? neueId();
    const werte = { name: e.name, einzahl: e.einzahl, ikone: artIkone(e.ikone), stundenPflicht: e.stundenPflicht, kiste: e.kiste, aktualisiertAm: jetzt };
    if (id) {
      const r = tx.update(art).set(werte).where(eq(art.id, id)).run();
      if (r.changes === 0) throw new Abgelehnt("Diese Geräteart gibt es nicht mehr.");
    } else {
      const position = tx.select({ n: sql<number>`coalesce(max(position), -1) + 1` }).from(art).get()?.n ?? 0;
      tx.insert(art).values({ id: artId, ...werte, position, angelegtAm: jetzt }).run();
    }

    const fristIds = e.fristen.map((f) => f.id).filter((x): x is string => x !== null);
    const bestehendeFristen = new Set(tx.select({ id: frist.id }).from(frist).where(eq(frist.artId, artId)).all().map((f) => f.id));
    tx.delete(frist).where(fristIds.length ? and(eq(frist.artId, artId), notInArray(frist.id, fristIds)) : eq(frist.artId, artId)).run();
    e.fristen.forEach((f, position) => {
      const w = { name: f.name, wer: f.wer, monate: f.monate, stunden: f.stunden, position };
      if (f.id && bestehendeFristen.has(f.id)) tx.update(frist).set(w).where(eq(frist.id, f.id)).run();
      else tx.insert(frist).values({ id: neueId(), artId, ...w }).run();
    });

    const punktIds = e.checkliste.map((p) => p.id).filter((x): x is string => x !== null);
    const bestehendePunkte = new Set(tx.select({ id: checkpunkt.id }).from(checkpunkt).where(eq(checkpunkt.artId, artId)).all().map((p) => p.id));
    tx.delete(checkpunkt).where(punktIds.length ? and(eq(checkpunkt.artId, artId), notInArray(checkpunkt.id, punktIds)) : eq(checkpunkt.artId, artId)).run();
    e.checkliste.forEach((p, position) => {
      const w = { text: p.text, hinweis: p.hinweis, position };
      if (p.id && bestehendePunkte.has(p.id)) tx.update(checkpunkt).set(w).where(eq(checkpunkt.id, p.id)).run();
      else tx.insert(checkpunkt).values({ id: neueId(), artId, ...w }).run();
    });
    return artId;
  });
}

export function artLoeschen(db: WartungDb, id: string): void {
  const n = db.select({ n: sql<number>`count(*)` }).from(geraet).where(eq(geraet.artId, id)).get()?.n ?? 0;
  if (n > 0) throw new Abgelehnt("Es gibt noch Geräte dieser Art, auch ausgemusterte.");
  db.delete(art).where(eq(art.id, id)).run();
}

// ---------------------------------------------------------------- Geräte

export function geraetAnlegen(db: WartungDb, e: GeraetEingabe, jetzt: number): string {
  if (!db.select({ id: art.id }).from(art).where(eq(art.id, e.artId)).get()) throw new Abgelehnt("Diese Geräteart gibt es nicht mehr.", "artId");
  const id = neueId();
  db.insert(geraet).values({ id, ...e, aktiv: true, angelegtAm: jetzt, aktualisiertAm: jetzt }).run();
  return id;
}

export function geraetAendern(db: WartungDb, id: string, e: GeraetEingabe, jetzt: number): void {
  if (!db.select({ id: art.id }).from(art).where(eq(art.id, e.artId)).get()) throw new Abgelehnt("Diese Geräteart gibt es nicht mehr.", "artId");
  const r = db.update(geraet).set({ ...e, aktualisiertAm: jetzt }).where(eq(geraet.id, id)).run();
  if (r.changes === 0) throw new Abgelehnt("Dieses Gerät gibt es nicht mehr.");
}

export function geraetAktiv(db: WartungDb, id: string, aktiv: boolean, jetzt: number): void {
  db.update(geraet).set({ aktiv, aktualisiertAm: jetzt }).where(eq(geraet.id, id)).run();
}

/**
 * Ersetzt die Inhaltsliste einer Materialkiste (IDA-335). Bekannte Positionen behalten ihre ID, neue bekommen
 * eine; was fehlt, geht weg. Der Verlauf hält den Text zum Zeitpunkt jeder Prüfung selbst fest.
 */
export function inhaltSpeichern(db: WartungDb, geraetId: string, liste: InhaltEingabe): void {
  db.transaction((tx) => {
    const g = aktivesGeraet(tx, geraetId);
    if (!tx.select({ kiste: art.kiste }).from(art).where(eq(art.id, g.artId)).get()?.kiste) {
      throw new Abgelehnt("Nur eine Materialkiste hat eine Inhaltsliste.");
    }
    const bestehend = new Set(tx.select({ id: inhalt.id }).from(inhalt).where(eq(inhalt.geraetId, geraetId)).all().map((x) => x.id));
    const behalten = liste.map((p) => p.id).filter((x): x is string => x !== null && bestehend.has(x));
    tx.delete(inhalt).where(behalten.length ? and(eq(inhalt.geraetId, geraetId), notInArray(inhalt.id, behalten)) : eq(inhalt.geraetId, geraetId)).run();
    liste.forEach((p, position) => {
      const w = { text: p.text, soll: p.soll, bemerkung: p.bemerkung, position };
      if (p.id && bestehend.has(p.id)) tx.update(inhalt).set(w).where(eq(inhalt.id, p.id)).run();
      else tx.insert(inhalt).values({ id: neueId(), geraetId, ...w }).run();
    });
  });
}

/** Die Punkte der Prüfung am Gerät: die Checkliste der Art, bei einer Materialkiste ihre Inhaltsliste. */
function pruefpunkte(db: WartungSchreiber, g: { id: string; artId: string }, kiste: boolean) {
  if (kiste) {
    return db.select().from(inhalt).where(eq(inhalt.geraetId, g.id)).orderBy(inhalt.position).all()
      .map((p) => ({ id: p.id, text: p.text, soll: p.soll as number | null }));
  }
  return db.select().from(checkpunkt).where(eq(checkpunkt.artId, g.artId)).orderBy(checkpunkt.position).all()
    .map((p) => ({ id: p.id, text: p.text, soll: null as number | null }));
}

/** Wartung oder Elektroprüfung, von der Verwaltung eingetragen. */
export function erledigtEintragen(db: WartungDb, geraetId: string, e: ErledigtEingabe, k: Kontext): void {
  db.transaction((tx) => {
    const g = aktivesGeraet(tx, geraetId);
    const f = tx.select().from(frist).where(and(eq(frist.id, e.fristId), eq(frist.artId, g.artId))).get();
    if (!f) throw new Abgelehnt("Diese Frist gilt für das Gerät nicht mehr.");
    if (e.am > k.heute) throw new Abgelehnt("Das Datum liegt in der Zukunft.", "am");
    if (f.stunden && e.stunden === null) throw new Abgelehnt("Für das Stundenintervall nötig.", "stunden");
    tx.insert(eintrag).values({
      id: neueId(), geraetId, typ: "erledigt", fristId: f.id, titel: f.name, am: e.am, stunden: e.stunden,
      wer: e.wer || k.wer, notiz: e.notiz, angelegtAm: k.jetzt,
    }).run();
    if (e.stunden !== null && (g.stunden === null || e.stunden > g.stunden)) {
      tx.update(geraet).set({ stunden: e.stunden, aktualisiertAm: k.jetzt }).where(eq(geraet.id, geraetId)).run();
    }
  });
}

export function stundenEintragen(db: WartungDb, geraetId: string, stunden: number, k: Kontext): void {
  db.transaction((tx) => {
    const g = aktivesGeraet(tx, geraetId);
    pruefeStunden(stunden, g.stunden);
    tx.update(geraet).set({ stunden, aktualisiertAm: k.jetzt }).where(eq(geraet.id, geraetId)).run();
    tx.insert(eintrag).values({
      id: neueId(), geraetId, typ: "stunden", titel: "Betriebsstunden abgelesen", am: k.heute, stunden, wer: k.wer, angelegtAm: k.jetzt,
    }).run();
  });
}

export interface NeuerMangel {
  id: string;
  text: string;
  foto: boolean;
}

/** Mangel direkt am Gerät, ohne Prüfung. */
export function mangelMelden(db: WartungDb, geraetId: string, m: NeuerMangel & { einsatzbereit: boolean }, k: Kontext): void {
  db.transaction((tx) => {
    aktivesGeraet(tx, geraetId);
    tx.insert(mangel).values({
      id: m.id, geraetId, text: m.text, foto: m.foto, einsatzbereit: m.einsatzbereit, gemeldetAm: k.jetzt, gemeldetVon: k.wer,
    }).run();
    tx.insert(eintrag).values({
      id: neueId(), geraetId, typ: "mangel", titel: "Mangel gemeldet", am: k.heute, wer: k.wer, notiz: m.text,
      ergebnis: m.einsatzbereit ? "mangel" : "defekt", maengel: 1, angelegtAm: k.jetzt,
    }).run();
  });
}

/**
 * Kam diese Sendung schon an? Geht die Antwort unterwegs verloren, schickt das Telefon dieselbe Prüfung bzw.
 * denselben Mangel mit derselben ID noch einmal; dann steht nichts doppelt da. `fremd`: die ID gehört zu
 * etwas anderem, das wird abgewiesen.
 */
export function schonGesendet(
  db: Pick<WartungDb, "select">,
  was: "pruefung" | "mangel",
  id: string,
  geraetId: string,
): { maengel: number } | "fremd" | null {
  if (was === "mangel") {
    const m = db.select({ geraetId: mangel.geraetId }).from(mangel).where(eq(mangel.id, id)).get();
    if (!m) return null;
    return m.geraetId === geraetId ? { maengel: 1 } : "fremd";
  }
  const e = db.select({ geraetId: eintrag.geraetId, typ: eintrag.typ, maengel: eintrag.maengel }).from(eintrag).where(eq(eintrag.id, id)).get();
  if (!e) return null;
  return e.geraetId === geraetId && e.typ === "pruefung" ? { maengel: e.maengel ?? 0 } : "fremd";
}

/**
 * Die Prüfung am Gerät. Jeder Punkt der Checkliste ist beantwortet; ein Punkt mit Mangel wird ein Mangel (mit
 * dem Foto, das die Route schon abgelegt hat). „In Ordnung“ geht nur ohne Mangel, und ein schlechteres Ergebnis
 * ohne einzelnen Punkt braucht eine Bemerkung: sie wird dann der Mangel — sonst stünde ein Gerät auf „mit
 * Mangel“, das niemand beheben kann.
 *
 * Bei einer Materialkiste (IDA-335) sind die Punkte ihre Inhaltsliste: „fehlt“ braucht keinen Text, denn die
 * Position sagt schon, was fehlt; der Mangel trägt `fehlt` und die Position und erscheint so in „Was steht an“.
 * Je Position gibt es höchstens einen offenen Fehlt-Mangel, und eine wieder vollständig gezählte behebt ihn.
 * Fotos, die so keinem neuen Mangel zugeordnet werden, nennt `ungenutzteFotos`; die Route räumt sie weg.
 */
export function pruefungAbschliessen(
  db: WartungDb,
  geraetId: string,
  p: PruefungEingabe,
  fotos: ReadonlyMap<string, string>,
  k: Kontext,
): { maengel: number; ungenutzteFotos: string[] } {
  return db.transaction((tx) => {
    const g = aktivesGeraet(tx, geraetId);
    const a = tx.select().from(art).where(eq(art.id, g.artId)).get()!;
    const punkte = pruefpunkte(tx, g, a.kiste);
    if (a.kiste && punkte.length === 0) throw new Abgelehnt("Die Kiste hat noch keine Inhaltsliste.");
    const antwort = new Map(p.antworten.map((x) => [x.punktId, x]));
    const meldung = a.kiste ? "Die Inhaltsliste hat sich geändert. Bitte neu durchzählen." : "Die Checkliste hat sich geändert. Bitte die Prüfung neu starten.";
    if (punkte.some((pk) => !antwort.has(pk.id))) throw new Abgelehnt(meldung);
    // Gezählt wurde gegen die Menge auf dem Bildschirm; hat sie jemand inzwischen geändert, gilt die Zählung nicht.
    if (a.kiste && punkte.some((pk) => antwort.get(pk.id)!.soll !== pk.soll)) throw new Abgelehnt(meldung);
    if (!a.kiste && a.stundenPflicht && p.stunden === null) throw new Abgelehnt("Betriebsstunden fehlen.", "stunden");
    pruefeStunden(p.stunden, g.stunden);

    const mitMangel = punkte.filter((pk) => !antwort.get(pk.id)!.ok);
    if (!a.kiste && mitMangel.some((pk) => !antwort.get(pk.id)!.text)) throw new Abgelehnt("Bei jedem Mangel kurz beschreiben, was los ist.");
    if (mitMangel.length > 0 && p.ergebnis === "ok") throw new Abgelehnt("Mit Mangel ist das Ergebnis nicht „In Ordnung“.", "ergebnis");
    if (mitMangel.length === 0 && p.ergebnis !== "ok" && !p.notiz) {
      throw new Abgelehnt("Bitte in der Bemerkung beschreiben, was nicht stimmt.", "notiz");
    }

    // Je Position höchstens ein offener Fehlt-Mangel: fehlt sie wieder, bleibt der alte stehen; ist sie wieder
    // vollständig, ist er behoben.
    const offenFehlt = a.kiste
      ? new Map(tx.select({ id: mangel.id, inhaltId: mangel.inhaltId, text: mangel.text }).from(mangel)
        .where(and(eq(mangel.geraetId, geraetId), eq(mangel.fehlt, true), isNull(mangel.behobenAm))).all()
        .filter((m) => m.inhaltId !== null).map((m) => [m.inhaltId!, m]))
      : new Map<string, { id: string; text: string }>();
    const maengel: (NeuerMangel & { inhaltId: string | null })[] = mitMangel.filter((pk) => !offenFehlt.has(pk.id)).map((pk) => {
      const x = antwort.get(pk.id)!;
      const id = fotos.get(pk.id) ?? neueId();
      const text = a.kiste ? `Fehlt: ${pk.text} (Soll ${pk.soll})${x.text ? ` – ${x.text}` : ""}` : `${pk.text}: ${x.text}`;
      return { id, text, foto: fotos.has(pk.id), inhaltId: a.kiste ? pk.id : null };
    });
    if (mitMangel.length === 0 && p.ergebnis !== "ok") maengel.push({ id: neueId(), text: p.notiz, foto: false, inhaltId: null });
    const nochOffen = mitMangel.filter((pk) => offenFehlt.has(pk.id)).map((pk) => offenFehlt.get(pk.id)!);
    const wiederDa = punkte.filter((pk) => antwort.get(pk.id)!.ok && offenFehlt.has(pk.id)).map((pk) => offenFehlt.get(pk.id)!);

    const pruefFrist = tx.select().from(frist).where(and(eq(frist.artId, g.artId), eq(frist.wer, "intern"))).get();
    tx.insert(eintrag).values({
      id: p.sendung, geraetId, typ: "pruefung", fristId: pruefFrist?.id ?? null, titel: pruefFrist?.name ?? "Prüfung",
      am: k.heute, stunden: p.stunden, wer: k.wer, notiz: p.notiz, ergebnis: p.ergebnis,
      antworten: JSON.stringify(punkte.map((pk) => ({ text: pk.soll === null ? pk.text : `${pk.soll} × ${pk.text}`, ok: antwort.get(pk.id)!.ok }))),
      maengel: maengel.length, angelegtAm: k.jetzt,
    }).run();
    if (p.stunden !== null) tx.update(geraet).set({ stunden: p.stunden, aktualisiertAm: k.jetzt }).where(eq(geraet.id, geraetId)).run();
    for (const m of maengel) {
      tx.insert(mangel).values({
        id: m.id, geraetId, text: m.text, foto: m.foto, einsatzbereit: p.ergebnis !== "defekt", gemeldetAm: k.jetzt, gemeldetVon: k.wer,
        fehlt: m.inhaltId !== null, inhaltId: m.inhaltId,
      }).run();
    }
    // Fehlt eine Position weiter und ist die Kiste jetzt nicht einsatzbereit, gilt das auch für ihren alten Mangel.
    if (p.ergebnis === "defekt") {
      for (const m of nochOffen) tx.update(mangel).set({ einsatzbereit: false }).where(eq(mangel.id, m.id)).run();
    }
    for (const m of wiederDa) {
      tx.update(mangel).set({ behobenAm: k.jetzt, behobenVon: k.wer }).where(eq(mangel.id, m.id)).run();
      tx.insert(eintrag).values({
        id: neueId(), geraetId, typ: "behoben", titel: "Wieder vollständig", am: k.heute, wer: k.wer, notiz: m.text, angelegtAm: k.jetzt,
      }).run();
    }
    const genutzt = new Set(maengel.map((m) => m.id));
    return { maengel: maengel.length, ungenutzteFotos: [...fotos.values()].filter((id) => !genutzt.has(id)) };
  });
}

export function mangelBeheben(db: WartungDb, id: string, k: Kontext): void {
  db.transaction((tx) => {
    const m = tx.select().from(mangel).where(and(eq(mangel.id, id), isNull(mangel.behobenAm))).get();
    if (!m) throw new Abgelehnt("Dieser Mangel ist schon behoben.");
    tx.update(mangel).set({ behobenAm: k.jetzt, behobenVon: k.wer }).where(eq(mangel.id, id)).run();
    tx.insert(eintrag).values({
      id: neueId(), geraetId: m.geraetId, typ: "behoben", titel: "Mangel behoben", am: k.heute, wer: k.wer, notiz: m.text, angelegtAm: k.jetzt,
    }).run();
  });
}

// ---------------------------------------------------------------- Sofort-Push

/** Neue „nicht einsatzbereit“-Mängel, noch nicht gepusht, ab `seit`. */
export function ungepushteAusfaelle(db: Pick<WartungDb, "select">, seit: number) {
  return db.select({ id: mangel.id, geraetId: mangel.geraetId, geraetName: geraet.name, ort: geraet.ort, gruppeId: geraet.gruppeId, foto: mangel.foto })
    .from(mangel).innerJoin(geraet, eq(geraet.id, mangel.geraetId))
    .where(and(eq(mangel.einsatzbereit, false), isNull(mangel.gepushtAm), isNull(mangel.behobenAm), sql`${mangel.gemeldetAm} >= ${seit}`))
    .all();
}

export function vermerkeGepusht(db: WartungDb, ids: readonly string[], jetzt: number): void {
  if (ids.length === 0) return;
  db.update(mangel).set({ gepushtAm: jetzt }).where(inArray(mangel.id, [...ids])).run();
}
