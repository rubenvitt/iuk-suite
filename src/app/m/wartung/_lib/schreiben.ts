/**
 * DIE SCHREIBPFADE DER GERÄTEWARTUNG (IDA-312). Rechte prüfen die Actions und Routen davor (`_lib/zugang.ts`);
 * hier stehen die fachlichen Regeln: was zusammen geschrieben wird und was abgelehnt wird.
 *
 * Erwartbare Ablehnungen werfen `Abgelehnt` mit einem Satz für den Bildschirm; alles andere ist ein Fehler.
 */
import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import type { WartungDb, WartungSchreiber } from "../_db/client";
import { art, artPruefart, checkpunkt, checkpunktPruefart, eintrag, entnahme, geraet, geraetPruefart, gruppe, inhalt, mangel, pruefart, unterlage, verwalter } from "../_db/schema";
import { zeitFormat } from "@/core/zeit";
import { ganzeSchliessen, SCHON_ZURUECK } from "./ausleihe";
import { hatOffeneEntnahme, unterwegsStand } from "./unterwegs";
import { hatVerlauf, ladeArten, ladeGeraet, ladeKatalog, ladePruefplan, pruefartenJePunkt } from "./daten";
import { ANLASS_NAME, type Anlass, type FristVorlage } from "./fristen";
import { geltende, pruefplan, pruefungAmGeraet, punktGilt } from "./pruefplan";
import {
  artIkone, UNTERLAGEN_MAX, type ArtEingabe, type ErledigtEingabe, type GeraetEingabe, type GruppeEingabe, type InhaltEingabe, type PruefartEingabe,
  type PruefplanEingabe, type PruefungEingabe,
} from "./eingabe";

export class Abgelehnt extends Error {
  constructor(text: string, readonly feld?: string) {
    super(text);
  }
}

export const neueId = (): string => randomUUID();

export const UNGUELTIG = "Die Angaben sind unvollständig. Bitte die Seite neu laden.";
const TAG_MONAT = zeitFormat("de-DE", { day: "2-digit", month: "2-digit" });

export interface Kontext {
  jetzt: number;
  heute: string;
  wer: string;
}

export function aktivesGeraet(db: WartungSchreiber, id: string) {
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

// ---------------------------------------------------------------- Prüfarten (IDA-368)

const SCHON_EINE: Record<Anlass | "frist", string> = {
  frist: "nur eine Prüfart nach Frist wird selbst am Gerät erledigt.",
  einsatz: `nur eine Prüfart „${ANLASS_NAME.einsatz}“.`,
  rueckkehr: `nur eine Prüfart „${ANLASS_NAME.rueckkehr}“.`,
};

/**
 * Was für die Prüfarten gilt, die an einer Art oder einem Gerät gelten (`name` steht vorn in der Meldung): selbst
 * erledigt höchstens eine nach Frist und je Anlass eine; eine Materialkiste braucht eine (sie wird durchgezählt)
 * und hat keine Betriebsstunden, also auch kein Intervall danach; sonst braucht jede selbst erledigte Prüfung
 * mindestens einen Punkt der Checkliste, der zu ihr gehört (IDA-369).
 */
function pruefeGeltende(
  name: string,
  a: { name: string; kiste: boolean; checkliste: readonly { pruefarten?: readonly string[] }[] },
  gilt: readonly FristVorlage[],
  amGeraet: boolean,
): void {
  const selbst = gilt.filter((v) => v.wer === "intern");
  const feld = amGeraet ? undefined : "pruefarten";
  for (const wann of ["frist", "einsatz", "rueckkehr"] as const) {
    if (selbst.filter((v) => (v.anlass ?? "frist") === wann).length > 1) throw new Abgelehnt(`${name}: ${SCHON_EINE[wann]}`, feld);
  }
  if (a.kiste && selbst.length === 0) throw new Abgelehnt(`${name}: eine Materialkiste braucht eine Prüfart, die selbst durchgezählt wird.`, feld);
  if (a.kiste && gilt.some((v) => v.stunden !== null)) throw new Abgelehnt(`${name}: eine Materialkiste hat keine Betriebsstunden.`, feld);
  // Entnehmen vermerkt `einsatz`; „vor Verwendung“ wäre an jeder Kiste unterwegs sofort überfällig (Spec 2.8, IDA-372).
  if (a.kiste && gilt.some((v) => v.anlass === "einsatz")) {
    throw new Abgelehnt(`${name}: eine Materialkiste hat keine Prüfung vor Verwendung – beim Entnehmen genügt ein kurzer Blick.`, feld);
  }
  if (a.kiste) return;
  const ohne = selbst.find((v) => !a.checkliste.some((pk) => punktGilt(pk, v.id)));
  if (!ohne) return;
  if (amGeraet) throw new Abgelehnt(`${name}: für „${ohne.name}“ hat die Geräteart ${a.name} keinen Punkt in der Checkliste.`);
  throw new Abgelehnt(`${name}: „${ohne.name}“ braucht mindestens einen Punkt in der Checkliste.`, "checkliste");
}

/**
 * Was nach jeder Änderung an Katalog, Art oder Prüfplan stimmen muss — geprüft in derselben Transaktion, ein
 * Verstoß rollt alles zurück (`pruefeGeltende`). Am Gerät gilt dasselbe für das, was nach Abwahl und Zusatz übrig
 * bleibt — an jedem aktiven Gerät, darum prüft auch das Zurückholen eines ausgemusterten.
 */
function pruefeRegeln(tx: WartungSchreiber): void {
  const katalog = ladeKatalog(tx);
  const arten = ladeArten(tx);
  for (const a of arten) pruefeGeltende(a.name, a, geltende(pruefplan(katalog, a.pruefarten, [])), false);
  const artVon = new Map(arten.map((a) => [a.id, a]));
  const abweichende = tx.selectDistinct({ id: geraet.id, name: geraet.name, artId: geraet.artId }).from(geraet)
    .innerJoin(geraetPruefart, eq(geraetPruefart.geraetId, geraet.id)).where(eq(geraet.aktiv, true)).all();
  const ab = abweichende.length ? tx.select().from(geraetPruefart).where(inArray(geraetPruefart.geraetId, abweichende.map((g) => g.id))).all() : [];
  for (const g of abweichende) {
    const a = artVon.get(g.artId)!;
    pruefeGeltende(g.name, a, geltende(pruefplan(katalog, a.pruefarten, ab.filter((x) => x.geraetId === g.id))), true);
  }
  // Eine ganz entnommene Kiste kommt über ihre Prüfung nach Frist zurück (IDA-372); die darf ihr solange nicht fehlen.
  const ganzWeg = tx.select({ id: geraet.id, name: geraet.name, artId: geraet.artId }).from(entnahme).innerJoin(geraet, eq(geraet.id, entnahme.geraetId))
    .where(and(eq(entnahme.ganz, true), isNull(entnahme.zurueckAm))).all();
  for (const g of ganzWeg) {
    if (!geltende(ladePruefplan(tx, g)).some((v) => v.wer === "intern" && !v.anlass)) {
      throw new Abgelehnt(`Erst zurücklegen: ${g.name} ist ganz unterwegs und kommt über ihre Prüfung nach Frist zurück.`);
    }
  }
}

export function pruefartSpeichern(db: WartungDb, id: string | null, e: PruefartEingabe): string {
  return db.transaction((tx) => {
    const werte = { name: e.name, wer: e.wer, monate: e.monate, stunden: e.stunden, anlass: e.anlass ?? null };
    let pid = id;
    if (pid) {
      const r = tx.update(pruefart).set(werte).where(eq(pruefart.id, pid)).run();
      if (r.changes === 0) throw new Abgelehnt("Diese Prüfart gibt es nicht mehr.");
      // Auf Anlass gibt es kein Intervall: ein eigenes an Geräten fällt weg, eine bloße Abweichung ohne An/Aus auch.
      if (werte.anlass) {
        tx.update(geraetPruefart).set({ monate: null, stunden: null }).where(eq(geraetPruefart.pruefartId, pid)).run();
        const standardArten = tx.select({ artId: artPruefart.artId }).from(artPruefart).where(eq(artPruefart.pruefartId, pid)).all().map((z) => z.artId);
        const ueberfluessig = tx.select({ geraetId: geraetPruefart.geraetId }).from(geraetPruefart).innerJoin(geraet, eq(geraet.id, geraetPruefart.geraetId))
          .where(and(eq(geraetPruefart.pruefartId, pid), eq(geraetPruefart.an, true), standardArten.length ? inArray(geraet.artId, standardArten) : sql`0`)).all();
        for (const z of ueberfluessig) tx.delete(geraetPruefart).where(and(eq(geraetPruefart.geraetId, z.geraetId), eq(geraetPruefart.pruefartId, pid))).run();
      }
    } else {
      pid = neueId();
      const position = tx.select({ n: sql<number>`coalesce(max(position), -1) + 1` }).from(pruefart).get()?.n ?? 0;
      tx.insert(pruefart).values({ id: pid, ...werte, position }).run();
    }
    pruefeRegeln(tx);
    return pid;
  });
}

/** Entfernt die Prüfart aus Katalog, Arten und Geräten; der Verlauf behält ihren Namen. */
export function pruefartLoeschen(db: WartungDb, id: string): void {
  db.transaction((tx) => {
    // Ein Punkt, der nur zu dieser Prüfart gehört, gälte nach dem Löschen still für alle (IDA-369).
    const nurHier = tx.select({ art: art.name }).from(checkpunktPruefart)
      .innerJoin(checkpunkt, eq(checkpunkt.id, checkpunktPruefart.checkpunktId))
      .innerJoin(art, eq(art.id, checkpunkt.artId))
      .where(and(eq(checkpunktPruefart.pruefartId, id), sql`NOT EXISTS (SELECT 1 FROM checkpunkt_pruefart AS w
        WHERE w.checkpunkt_id = ${checkpunktPruefart.checkpunktId} AND w.pruefart_id <> ${id})`)).all();
    if (nurHier.length) {
      const arten = [...new Set(nurHier.map((z) => z.art))].sort().map((n) => `„${n}“`).join(", ");
      throw new Abgelehnt(`Erst die Punkte dieser Prüfart in der Checkliste von ${arten} entfernen oder anderen Prüfarten zuordnen.`);
    }
    tx.delete(pruefart).where(eq(pruefart.id, id)).run();
    pruefeRegeln(tx);
  });
}

/** Eine Stelle nach oben oder unten im Katalog. */
export function pruefartVerschieben(db: WartungDb, id: string, richtung: -1 | 1): void {
  db.transaction((tx) => {
    const reihe = ladeKatalog(tx).map((p) => p.id);
    const i = reihe.indexOf(id);
    const j = i + richtung;
    if (i < 0 || j < 0 || j >= reihe.length) return;
    [reihe[i], reihe[j]] = [reihe[j], reihe[i]];
    reihe.forEach((pid, position) => tx.update(pruefart).set({ position }).where(eq(pruefart.id, pid)).run());
  });
}

/**
 * Ersetzt den Prüfplan eines Geräts: gespeichert wird nur, wo es von seiner Art abweicht — eine Prüfart der Art
 * abgewählt, eine zusätzlich, oder ein eigenes Intervall. Ändert die Art später ihre Prüfarten, folgt das Gerät
 * darin, ausgenommen seine Abweichungen.
 */
export function pruefplanSpeichern(db: WartungDb, geraetId: string, liste: PruefplanEingabe): void {
  db.transaction((tx) => {
    // Auch ausgemustert: ein Plan, der nicht mehr passt, lässt sich vor dem Zurückholen richten.
    const g = tx.select().from(geraet).where(eq(geraet.id, geraetId)).get();
    if (!g) throw new Abgelehnt("Dieses Gerät gibt es nicht mehr.");
    const katalog = new Map(ladeKatalog(tx).map((p) => [p.id, p]));
    const standard = new Set(tx.select({ id: artPruefart.pruefartId }).from(artPruefart).where(eq(artPruefart.artId, g.artId)).all().map((z) => z.id));
    tx.delete(geraetPruefart).where(eq(geraetPruefart.geraetId, geraetId)).run();
    for (const z of liste) {
      const p = katalog.get(z.pruefartId);
      if (!p) throw new Abgelehnt("Diese Prüfart gibt es nicht mehr. Bitte neu laden.");
      if (p.anlass && z.an && z.eigenes) throw new Abgelehnt(`„${p.name}“ ist ${ANLASS_NAME[p.anlass].toLowerCase()} fällig und hat kein Intervall.`);
      const eigenes = z.an ? z.eigenes : null;
      if (z.an === standard.has(z.pruefartId) && !eigenes) continue;
      tx.insert(geraetPruefart).values({
        geraetId, pruefartId: z.pruefartId, an: z.an, monate: eigenes?.monate ?? null, stunden: eigenes?.stunden ?? null,
      }).run();
    }
    pruefeRegeln(tx);
  });
}

// ---------------------------------------------------------------- Gerätearten

/** Legt an oder ersetzt Prüfarten und Checkliste der Art; ihre Geräte folgen, ausgenommen ihre Abweichungen. */
export function artSpeichern(db: WartungDb, id: string | null, e: ArtEingabe, jetzt: number): string {
  return db.transaction((tx) => {
    const artId = id ?? neueId();
    const werte = { name: e.name, einzahl: e.einzahl, ikone: artIkone(e.ikone), stundenPflicht: e.stundenPflicht, kiste: e.kiste, aktualisiertAm: jetzt };
    if (id) {
      // Kiste ↔ Gerät mit Material draußen: die Entnahme ließe sich danach nicht mehr zurücklegen (IDA-372).
      const alt = tx.select({ kiste: art.kiste }).from(art).where(eq(art.id, id)).get();
      if (alt && alt.kiste !== e.kiste && tx.select({ id: entnahme.id }).from(entnahme).innerJoin(geraet, eq(geraet.id, entnahme.geraetId))
        .where(and(eq(geraet.artId, id), isNull(entnahme.zurueckAm))).get()) {
        throw new Abgelehnt("Erst zurücklegen: An einem Gerät dieser Art ist noch etwas unterwegs.", "kiste");
      }
      const r = tx.update(art).set(werte).where(eq(art.id, id)).run();
      if (r.changes === 0) throw new Abgelehnt("Diese Geräteart gibt es nicht mehr.");
    } else {
      const position = tx.select({ n: sql<number>`coalesce(max(position), -1) + 1` }).from(art).get()?.n ?? 0;
      tx.insert(art).values({ id: artId, ...werte, position, angelegtAm: jetzt }).run();
    }

    const bekannt = new Set(ladeKatalog(tx).map((p) => p.id));
    if (e.pruefarten.some((p) => !bekannt.has(p))) throw new Abgelehnt("Eine der Prüfarten gibt es nicht mehr. Bitte neu laden.", "pruefarten");
    const bisher = new Set(tx.select({ id: artPruefart.pruefartId }).from(artPruefart).where(eq(artPruefart.artId, artId)).all().map((z) => z.id));
    const neu = new Set(e.pruefarten);
    for (const p of bisher) if (!neu.has(p)) tx.delete(artPruefart).where(and(eq(artPruefart.artId, artId), eq(artPruefart.pruefartId, p))).run();
    for (const p of neu) if (!bisher.has(p)) tx.insert(artPruefart).values({ artId, pruefartId: p }).run();

    const punktIds = e.checkliste.map((p) => p.id).filter((x): x is string => x !== null);
    const bestehendePunkte = new Set(tx.select({ id: checkpunkt.id }).from(checkpunkt).where(eq(checkpunkt.artId, artId)).all().map((p) => p.id));
    tx.delete(checkpunkt).where(punktIds.length ? and(eq(checkpunkt.artId, artId), notInArray(checkpunkt.id, punktIds)) : eq(checkpunkt.artId, artId)).run();
    // Ein Punkt gehört zu Prüfarten, die man selbst am Gerät erledigt (IDA-369); die Zuordnung wird nur geändert, wo sie sich ändert.
    const selbst = new Set(ladeKatalog(tx).filter((p) => p.wer === "intern").map((p) => p.id));
    const bisherZu = pruefartenJePunkt(tx);
    e.checkliste.forEach((p, position) => {
      const zu = p.pruefarten ?? [];
      if (zu.some((x) => !selbst.has(x))) throw new Abgelehnt("Ein Punkt gehört zu einer Prüfart, die nicht selbst am Gerät erledigt wird. Bitte neu laden.", "checkliste");
      const w = { text: p.text, hinweis: p.hinweis, position };
      let pid = p.id;
      if (pid && bestehendePunkte.has(pid)) tx.update(checkpunkt).set(w).where(eq(checkpunkt.id, pid)).run();
      else {
        pid = neueId();
        tx.insert(checkpunkt).values({ id: pid, artId, ...w }).run();
      }
      const vorher = new Set(bisherZu.get(pid) ?? []);
      const nachher = new Set(zu);
      for (const x of vorher) if (!nachher.has(x)) tx.delete(checkpunktPruefart).where(and(eq(checkpunktPruefart.checkpunktId, pid), eq(checkpunktPruefart.pruefartId, x))).run();
      for (const x of nachher) if (!vorher.has(x)) tx.insert(checkpunktPruefart).values({ checkpunktId: pid, pruefartId: x }).run();
    });
    pruefeRegeln(tx);
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
  db.transaction((tx) => {
    // Eine andere Art würde eine offene Entnahme verwaisen lassen (Kiste ↔ Gerät kehrt den Rückweg um).
    const alt = tx.select({ artId: geraet.artId }).from(geraet).where(eq(geraet.id, id)).get();
    if (alt && alt.artId !== e.artId && hatOffeneEntnahme(tx, id)) throw new Abgelehnt("Erst zurücklegen: Es ist noch etwas unterwegs.", "artId");
    const r = tx.update(geraet).set({ ...e, aktualisiertAm: jetzt }).where(eq(geraet.id, id)).run();
    if (r.changes === 0) throw new Abgelehnt("Dieses Gerät gibt es nicht mehr.");
    // Eine andere Art bringt andere Prüfarten mit; die Abweichungen bleiben und müssen weiter zusammenpassen.
    pruefeRegeln(tx);
  });
}

export function geraetAktiv(db: WartungDb, id: string, aktiv: boolean, jetzt: number): void {
  db.transaction((tx) => {
    if (!aktiv && hatOffeneEntnahme(tx, id)) throw new Abgelehnt("Erst zurücklegen: Es ist noch etwas unterwegs.");
    tx.update(geraet).set({ aktiv, aktualisiertAm: jetzt }).where(eq(geraet.id, id)).run();
    // Während es ausgemustert war, können sich Katalog und Art geändert haben: sein Prüfplan muss wieder passen.
    if (aktiv) pruefeRegeln(tx);
  });
}

/**
 * Löscht eine ausgemusterte Akte ohne Verlauf endgültig; Inhalt, Prüfplan-Abweichungen und Unterlagen-Zeilen gehen per
 * Cascade mit. Die Dateien der zurückgegebenen Unterlagen räumt der Aufrufer danach weg.
 */
export function geraetLoeschen(db: WartungDb, id: string): { unterlagen: { id: string; typ: "pdf" | "bild" }[] } {
  return db.transaction((tx) => {
    const g = tx.select({ aktiv: geraet.aktiv }).from(geraet).where(eq(geraet.id, id)).get();
    if (!g) throw new Abgelehnt("Dieses Gerät gibt es nicht mehr.");
    if (g.aktiv) throw new Abgelehnt("Nur ausgemusterte Akten lassen sich endgültig löschen.");
    if (hatVerlauf(tx, id)) throw new Abgelehnt("Diese Akte hat einen Verlauf. Bitte ausgemustert lassen.");
    const unterlagen = tx.select({ id: unterlage.id, typ: unterlage.typ }).from(unterlage).where(eq(unterlage.geraetId, id)).all();
    tx.delete(geraet).where(eq(geraet.id, id)).run();
    return { unterlagen };
  });
}

/** Fingerabdruck einer Inhaltsliste, wie sie angezeigt wurde: wer speichert, schickt ihn mit (IDA-335). */
export function inhaltStand(liste: readonly { id: string; text: string; soll: number; bemerkung: string }[]): string {
  return createHash("sha256").update(JSON.stringify(liste.map((p) => [p.id, p.text, p.soll, p.bemerkung]))).digest("hex").slice(0, 32);
}

/**
 * Ersetzt die Inhaltsliste einer Materialkiste (IDA-335). Bekannte Positionen behalten ihre ID, neue bekommen
 * eine; was fehlt, geht weg. Der Verlauf hält den Text zum Zeitpunkt jeder Prüfung selbst fest. Mit `stand`
 * wird nur gespeichert, wenn die Liste noch so ist wie beim Öffnen — sonst ginge die Änderung eines anderen verloren.
 */
export function inhaltSpeichern(db: WartungDb, geraetId: string, liste: InhaltEingabe, stand?: string): void {
  db.transaction((tx) => {
    const g = aktivesGeraet(tx, geraetId);
    if (!tx.select({ kiste: art.kiste }).from(art).where(eq(art.id, g.artId)).get()?.kiste) {
      throw new Abgelehnt("Nur eine Materialkiste hat eine Inhaltsliste.");
    }
    if (stand !== undefined) {
      const jetzt = tx.select({ id: inhalt.id, text: inhalt.text, soll: inhalt.soll, bemerkung: inhalt.bemerkung }).from(inhalt)
        .where(eq(inhalt.geraetId, geraetId)).orderBy(asc(inhalt.position)).all();
      if (inhaltStand(jetzt) !== stand) throw new Abgelehnt("Die Inhaltsliste wurde inzwischen geändert. Bitte die Seite neu laden.");
    }
    const bestehend = new Map(tx.select({ id: inhalt.id, text: inhalt.text }).from(inhalt).where(eq(inhalt.geraetId, geraetId)).all().map((x) => [x.id, x.text]));
    const behalten = liste.map((p) => p.id).filter((x): x is string => x !== null && bestehend.has(x));
    // Was gerade unterwegs ist, darf weder von der Liste noch unter die Menge, die draußen ist.
    const draussen = unterwegsStand(tx, geraetId).jePosition;
    for (const [pid, text] of bestehend) {
      const n = draussen.get(pid) ?? 0;
      if (n === 0) continue;
      const neu = liste.find((p) => p.id === pid);
      if (!neu) throw new Abgelehnt(`${text} ist gerade unterwegs und kann nicht von der Liste.`);
      if (neu.soll < n) throw new Abgelehnt(`${text}: Es sind gerade ${n} unterwegs.`);
    }
    tx.delete(inhalt).where(behalten.length ? and(eq(inhalt.geraetId, geraetId), notInArray(inhalt.id, behalten)) : eq(inhalt.geraetId, geraetId)).run();
    liste.forEach((p, position) => {
      const w = { text: p.text, soll: p.soll, bemerkung: p.bemerkung, position };
      if (p.id && bestehend.has(p.id)) {
        // Neuer Wortlaut ist eine andere Sache: ein offener Fehlt-Mangel der alten löst sich wie bei einer
        // gelöschten Position von ihr und bleibt offen, statt durch die Zählung der neuen behoben zu werden.
        if (bestehend.get(p.id) !== p.text) tx.update(mangel).set({ inhaltId: null }).where(and(eq(mangel.inhaltId, p.id), isNull(mangel.behobenAm))).run();
        tx.update(inhalt).set(w).where(eq(inhalt.id, p.id)).run();
      } else tx.insert(inhalt).values({ id: neueId(), geraetId, ...w }).run();
    });
  });
}

/**
 * Die Punkte der Prüfung am Gerät: die Punkte der Checkliste der Art, die zu dieser Prüfart gehören (IDA-369), bei
 * einer Materialkiste ihre Inhaltsliste.
 */
function pruefpunkte(db: WartungSchreiber, g: { id: string; artId: string }, kiste: boolean, pruefartId: string) {
  if (kiste) {
    return db.select().from(inhalt).where(eq(inhalt.geraetId, g.id)).orderBy(inhalt.position).all()
      .map((p) => ({ id: p.id, text: p.text, soll: p.soll as number | null, bemerkung: p.bemerkung }));
  }
  const zu = pruefartenJePunkt(db);
  return db.select().from(checkpunkt).where(eq(checkpunkt.artId, g.artId)).orderBy(checkpunkt.position).all()
    .filter((p) => punktGilt({ pruefarten: zu.get(p.id) }, pruefartId))
    .map((p) => ({ id: p.id, text: p.text, soll: null as number | null, bemerkung: "" }));
}

// ---------------------------------------------------------------- Unterlagen (IDA-300)

/** Trägt eine schon abgelegte Datei am Gerät ein, hinten an. */
export function unterlageAnlegen(
  db: WartungDb, geraetId: string, u: { id: string; titel: string; typ: "pdf" | "bild"; bytes: number }, k: Pick<Kontext, "jetzt" | "wer">,
): void {
  db.transaction((tx) => {
    aktivesGeraet(tx, geraetId);
    const n = tx.select({ n: sql<number>`count(*)`, p: sql<number>`coalesce(max(position), -1) + 1` }).from(unterlage)
      .where(eq(unterlage.geraetId, geraetId)).get();
    if ((n?.n ?? 0) >= UNTERLAGEN_MAX) throw new Abgelehnt(`Höchstens ${UNTERLAGEN_MAX} Unterlagen je Gerät.`);
    tx.insert(unterlage).values({ ...u, geraetId, position: n?.p ?? 0, angelegtAm: k.jetzt, angelegtVon: k.wer }).run();
  });
}

/** Entfernt den Eintrag; die Datei räumt der Aufrufer danach weg. */
export function unterlageLoeschen(db: WartungDb, id: string): void {
  db.delete(unterlage).where(eq(unterlage.id, id)).run();
}

/** Eine Stelle nach oben oder unten. */
export function unterlageVerschieben(db: WartungDb, id: string, richtung: -1 | 1): void {
  db.transaction((tx) => {
    const u = tx.select({ geraetId: unterlage.geraetId }).from(unterlage).where(eq(unterlage.id, id)).get();
    if (!u) throw new Abgelehnt("Diese Unterlage gibt es nicht mehr.");
    const reihe = tx.select({ id: unterlage.id }).from(unterlage).where(eq(unterlage.geraetId, u.geraetId))
      .orderBy(asc(unterlage.position), asc(unterlage.angelegtAm)).all().map((r) => r.id);
    const i = reihe.indexOf(id);
    const j = i + richtung;
    if (j < 0 || j >= reihe.length) return;
    [reihe[i], reihe[j]] = [reihe[j], reihe[i]];
    reihe.forEach((uid, position) => tx.update(unterlage).set({ position }).where(eq(unterlage.id, uid)).run());
  });
}

/** Wartung oder Elektroprüfung, von der Verwaltung eingetragen. */
export function erledigtEintragen(db: WartungDb, geraetId: string, e: ErledigtEingabe, k: Kontext): void {
  db.transaction((tx) => {
    const g = aktivesGeraet(tx, geraetId);
    const f = geltende(ladePruefplan(tx, g)).find((v) => v.id === e.pruefartId);
    if (!f) throw new Abgelehnt("Diese Prüfart gilt für das Gerät nicht mehr.");
    if (e.am > k.heute) throw new Abgelehnt("Das Datum liegt in der Zukunft.", "am");
    if (f.stunden && e.stunden === null) throw new Abgelehnt("Für das Stundenintervall nötig.", "stunden");
    tx.insert(eintrag).values({
      id: neueId(), geraetId, typ: "erledigt", pruefartId: f.id, titel: f.name, am: e.am, stunden: e.stunden,
      wer: e.wer || k.wer, notiz: e.notiz, angelegtAm: k.jetzt,
    }).run();
    if (e.stunden !== null && (g.stunden === null || e.stunden > g.stunden)) {
      tx.update(geraet).set({ stunden: e.stunden, aktualisiertAm: k.jetzt }).where(eq(geraet.id, geraetId)).run();
    }
  });
}

export function stundenEintragen(db: WartungDb, geraetId: string, stunden: number, k: Kontext, sendung?: string): void {
  db.transaction((tx) => {
    // IDA-358: dieselbe Sendung schon gebucht (nur die Antwort ging verloren) — VOR `pruefeStunden`, das sonst
    // nichts sähe, was die Wiederholung abweist; eine fremde ID ist ein Eingabefehler.
    if (sendung) {
      const schon = tx.select({ geraetId: eintrag.geraetId, typ: eintrag.typ }).from(eintrag).where(eq(eintrag.id, sendung)).get();
      if (schon) {
        if (schon.geraetId === geraetId && schon.typ === "stunden") return;
        throw new Abgelehnt("Die Angabe kam nicht vollständig an. Bitte noch einmal senden.");
      }
    }
    const g = aktivesGeraet(tx, geraetId);
    pruefeStunden(stunden, g.stunden);
    tx.update(geraet).set({ stunden, aktualisiertAm: k.jetzt }).where(eq(geraet.id, geraetId)).run();
    tx.insert(eintrag).values({
      id: sendung ?? neueId(), geraetId, typ: "stunden", titel: "Betriebsstunden abgelesen", am: k.heute, stunden, wer: k.wer, angelegtAm: k.jetzt,
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
    // Die Rückgabe der ganzen Kiste zählt als Prüfung nach Frist, nie als eine auf Anlass (Abgleich mit IDA-369).
    const staende = (ladeGeraet(tx, geraetId, k.heute)?.staende ?? []).filter((f) => !p.rueckgabe || !f.vorlage.anlass);
    const stand = pruefungAmGeraet(staende, p.pruefartId);
    if (!stand) throw new Abgelehnt(p.pruefartId ? "Diese Prüfung gilt für das Gerät nicht mehr." : "Für dieses Gerät gibt es keine Prüfung am Gerät.");
    const pruefFrist = stand.vorlage;
    const punkte = pruefpunkte(tx, g, a.kiste, pruefFrist.id);
    if (a.kiste && punkte.length === 0) throw new Abgelehnt("Die Kiste hat noch keine Inhaltsliste.");
    // IDA-372: unterwegs ist nichts zu zählen. Eine ganz entnommene Kiste wird nur über `rueckgabe` durchgezählt,
    // und zwar gegen den vollen Soll; sonst zählt je Position `soll − unterwegs`.
    const weg = a.kiste ? unterwegsStand(tx, geraetId) : null;
    if (p.rueckgabe && p.rueckgabe !== weg?.ganz?.id) {
      // Ein zweites Telefon, das dieselbe Kiste zurücklegt, kommt zu spät, ist aber nicht ungültig.
      const bekannt = tx.select({ id: entnahme.id }).from(entnahme).where(and(eq(entnahme.id, p.rueckgabe), eq(entnahme.geraetId, geraetId))).get();
      throw new Abgelehnt(bekannt ? SCHON_ZURUECK : UNGUELTIG);
    }
    if (weg?.ganz && !p.rueckgabe) {
      throw new Abgelehnt(`Die Kiste ist unterwegs seit ${TAG_MONAT.format(weg.ganz.seit)} Durchzählen geht, wenn sie zurück ist.`);
    }
    const unterwegs = (id: string) => (p.rueckgabe ? 0 : weg?.jePosition.get(id) ?? 0);
    const antwort = new Map(p.antworten.map((x) => [x.punktId, x]));
    const meldung = a.kiste ? "Die Inhaltsliste hat sich geändert. Bitte neu durchzählen." : "Die Checkliste hat sich geändert. Bitte die Prüfung neu starten.";
    if (punkte.some((pk) => !antwort.has(pk.id)) || (a.kiste && antwort.size !== punkte.length)) throw new Abgelehnt(meldung);
    // Gezählt wurde gegen Menge, Wortlaut und Bemerkung auf dem Bildschirm; hat sie jemand inzwischen geändert, gilt die Zählung nicht.
    const anders = (pk: (typeof punkte)[number]) => {
      const x = antwort.get(pk.id)!;
      return x.soll !== pk.soll || x.punkt !== pk.text || (x.hinweis ?? "") !== pk.bemerkung;
    };
    if (a.kiste && punkte.some((pk) => anders(pk) || (antwort.get(pk.id)!.unterwegs ?? 0) !== unterwegs(pk.id))) throw new Abgelehnt(meldung);
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

    const pruefung = {
      id: p.sendung, geraetId, typ: "pruefung" as const, pruefartId: pruefFrist.id, titel: pruefFrist.name,
      am: k.heute, stunden: p.stunden, wer: k.wer, notiz: p.notiz, ergebnis: p.ergebnis,
      antworten: JSON.stringify(punkte.map((pk) => ({ text: pk.soll === null ? pk.text : `${pk.soll} × ${pk.text}`, ok: antwort.get(pk.id)!.ok }))),
      maengel: maengel.length, angelegtAm: k.jetzt,
    };
    tx.insert(eintrag).values(pruefung).run();
    if (p.stunden !== null) tx.update(geraet).set({ stunden: p.stunden, aktualisiertAm: k.jetzt }).where(eq(geraet.id, geraetId)).run();
    for (const m of maengel) {
      tx.insert(mangel).values({
        id: m.id, geraetId, text: m.text, foto: m.foto, einsatzbereit: p.ergebnis !== "defekt", gemeldetAm: k.jetzt, gemeldetVon: k.wer,
        fehlt: m.inhaltId !== null, inhaltId: m.inhaltId,
      }).run();
    }
    // Fehlt eine Position weiter und ist die Kiste jetzt nicht einsatzbereit, gilt das auch für ihren alten Mangel.
    if (p.ergebnis === "defekt") {
      for (const m of nochOffen) {
        tx.update(mangel).set({ einsatzbereit: false, herabgestuftAm: k.jetzt }).where(and(eq(mangel.id, m.id), eq(mangel.einsatzbereit, true))).run();
      }
    }
    // Fehlt sie weiter und gibt es eine neue Angabe dazu („nur noch einer da“), gilt die neue.
    for (const pk of mitMangel) {
      const alt = offenFehlt.get(pk.id);
      const angabe = antwort.get(pk.id)!.text;
      if (alt && angabe) tx.update(mangel).set({ text: `Fehlt: ${pk.text} (Soll ${pk.soll}) – ${angabe}` }).where(eq(mangel.id, alt.id)).run();
    }
    for (const m of wiederDa) {
      tx.update(mangel).set({ behobenAm: k.jetzt, behobenVon: k.wer }).where(eq(mangel.id, m.id)).run();
      tx.insert(eintrag).values({
        id: neueId(), geraetId, typ: "behoben", titel: "Wieder vollständig", am: k.heute, wer: k.wer, notiz: m.text, angelegtAm: k.jetzt,
      }).run();
    }
    // Bei einer Kiste ist „nach Benutzung“ dasselbe Durchzählen: wird sie mit der Rückkehr fällig, erfüllt diese Zählung
    // sie mit, als eigener Eintrag; die Mängel hängen nur am ersten (Entscheidung 08.11.2026).
    const nachBenutzung = p.rueckgabe ? ganzeSchliessen(tx, geraetId, p.rueckgabe, k) : null;
    if (nachBenutzung) tx.insert(eintrag).values({ ...pruefung, id: neueId(), pruefartId: nachBenutzung.id, titel: nachBenutzung.name, maengel: 0 }).run();
    const genutzt = new Set(maengel.map((m) => m.id));
    return { maengel: maengel.length, ungenutzteFotos: [...fotos.values()].filter((id) => !genutzt.has(id)) };
  });
}

export const ANLASS_TITEL: Record<Anlass, string> = { einsatz: "Eingesetzt", rueckkehr: "Zurück vom Einsatz" };

/**
 * „Wird eingesetzt“ bzw. „Zurück“ (IDA-369): danach ist die Prüfart mit diesem Anlass fällig, bis jemand sie abhakt.
 * Steht das Gerät schon so da (doppelt getippt, zwei Telefone), geschieht nichts. Eine Kiste geht stattdessen über
 * Entnehmen und Zurücklegen, die denselben Vermerk schreiben (`anlassSchreiben`); so gibt es je Kiste einen Weg.
 */
export function anlassVermerken(db: WartungDb, geraetId: string, anlass: Anlass, k: Kontext): void {
  db.transaction((tx) => {
    const g = aktivesGeraet(tx, geraetId);
    if (tx.select({ kiste: art.kiste }).from(art).where(eq(art.id, g.artId)).get()?.kiste) throw new Abgelehnt("Kisten meldest du mit „Entnehmen“.");
    anlassSchreiben(tx, geraetId, anlass, k);
  });
}

/** Der Vermerk selbst, in der Transaktion des Aufrufers (auch aus `ausleihe.ts`); doppelt schreibt er nichts. */
export function anlassSchreiben(tx: WartungSchreiber, geraetId: string, anlass: Anlass, k: Kontext): void {
  const zuletzt = tx.select({ typ: eintrag.typ }).from(eintrag)
    .where(and(eq(eintrag.geraetId, geraetId), inArray(eintrag.typ, ["einsatz", "rueckkehr"])))
    .orderBy(sql`${eintrag.angelegtAm} DESC`).limit(1).get();
  if (zuletzt?.typ === anlass || (!zuletzt && anlass === "rueckkehr")) return;
  tx.insert(eintrag).values({ id: neueId(), geraetId, typ: anlass, titel: ANLASS_TITEL[anlass], am: k.heute, wer: k.wer, angelegtAm: k.jetzt }).run();
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

/** Neue „nicht einsatzbereit“-Mängel, noch nicht gepusht, ab `seit` (gemeldet oder später herabgestuft). */
export function ungepushteAusfaelle(db: Pick<WartungDb, "select">, seit: number) {
  return db.select({ id: mangel.id, geraetId: mangel.geraetId, geraetName: geraet.name, ort: geraet.ort, gruppeId: geraet.gruppeId, foto: mangel.foto })
    .from(mangel).innerJoin(geraet, eq(geraet.id, mangel.geraetId))
    .where(and(eq(mangel.einsatzbereit, false), isNull(mangel.gepushtAm), isNull(mangel.behobenAm), sql`coalesce(${mangel.herabgestuftAm}, ${mangel.gemeldetAm}) >= ${seit}`))
    .all();
}

export function vermerkeGepusht(db: WartungDb, ids: readonly string[], jetzt: number): void {
  if (ids.length === 0) return;
  db.update(mangel).set({ gepushtAm: jetzt }).where(inArray(mangel.id, [...ids])).run();
}
