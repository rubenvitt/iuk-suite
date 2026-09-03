import { and, asc, eq, lte } from "drizzle-orm";
import { findeZeichen, type Zeichen, type ZeichenId } from "../_lib/katalog";
import { fragbareZeichen } from "../_lib/lernen/fragen";
import { naechsterStand, type Ergebnis } from "../_lib/lernen/leitner";
import type { DB } from "./client";
import { lernsets, lernsetZeichen, lernstand } from "./schema";

/*
 * Abfragen mit dem QUERY-BUILDER. `db.query.*` und `relations()` kommen im ganzen Repo
 * null mal vor — hier wird kein zweites Muster aufgemacht.
 */

/** Die auflösbaren IDs eines Lernsets. Unbekannter Slug -> leere Liste, kein Wurf. */
export function idsAusSet(db: DB, slug: string): readonly ZeichenId[] {
  const set = db.select().from(lernsets).where(eq(lernsets.slug, slug)).get();
  if (!set) return [];
  return db
    .select()
    .from(lernsetZeichen)
    .where(eq(lernsetZeichen.lernsetId, set.id))
    .orderBy(asc(lernsetZeichen.position))
    .all()
    .map((z) => z.zeichenId);
}

export interface Uebersicht {
  gefestigt: number;
  inArbeit: number;
  faellig: number;
  nieGefragt: number;
  gesamt: number;
}

/**
 * Die vier Zahlen aus Spec §5.5. Sie summieren sich auf den fragbaren Bestand — 232,
 * oder die auflösbare Groesse des gewaehlten Sets.
 *
 * KEIN PROZENTBALKEN darueber: er mischt "einmal geraten" mit "seit Monaten sicher" und
 * steigt auch, wenn nichts haengenbleibt.
 */
export function lernUebersicht(
  db: DB,
  sub: string,
  heute: string,
  nur?: readonly ZeichenId[],
): Uebersicht {
  const bestand = fragbareZeichen(nur);
  const ids = new Set(bestand.map((z) => z.id));
  const staende = db.select().from(lernstand).where(eq(lernstand.sub, sub)).all()
    .filter((z) => ids.has(z.zeichenId));

  let gefestigt = 0;
  let inArbeit = 0;
  let faellig = 0;
  for (const z of staende) {
    if (z.faelligAm <= heute) faellig += 1;
    else if (z.stufe >= 3) gefestigt += 1;
    else inArbeit += 1;
  }
  return {
    gefestigt, inArbeit, faellig,
    nieGefragt: bestand.length - staende.length,
    gesamt: bestand.length,
  };
}

/**
 * Die naechste Karte: erst Faelliges (aeltestes zuerst), dann nie Gefragtes.
 *
 * ⛔ ZEILEN, DEREN ZEICHEN DER KATALOG NICHT MEHR FUEHRT, WERDEN UEBERSPRUNGEN — nicht
 * geloescht (Spec §4.6 Stufe 2): ein Paketupgrade kann sie zurueckbringen. Ohne diesen
 * Filter kaeme ein `null`-Zeichen zurueck und die Runde bliebe leer, ohne Meldung.
 */
export function naechsteKarte(
  db: DB,
  sub: string,
  heute: string,
  nur?: readonly ZeichenId[],
): { zeichen: Zeichen; stufe: number } | null {
  const bestand = fragbareZeichen(nur);
  const ids = new Set(bestand.map((z) => z.id));

  const faellige = db
    .select()
    .from(lernstand)
    .where(and(eq(lernstand.sub, sub), lte(lernstand.faelligAm, heute)))
    .orderBy(asc(lernstand.faelligAm))
    .all();
  for (const z of faellige) {
    const zeichen = findeZeichen(z.zeichenId);
    if (zeichen && ids.has(z.zeichenId)) return { zeichen, stufe: z.stufe };
  }

  const gefragt = new Set(
    db.select().from(lernstand).where(eq(lernstand.sub, sub)).all().map((z) => z.zeichenId),
  );
  const neu = bestand.find((z) => !gefragt.has(z.id));
  return neu ? { zeichen: neu, stufe: 0 } : null;
}

/**
 * Schreibt eine Antwort. Nach JEDER einzelnen Antwort, nicht am Rundenende:
 * `session.error === "RefreshTokenError"` loest in `components/providers.tsx:63-94`
 * einen stillen Re-Login mit vollem Seitenwechsel aus — mitten in der Bearbeitung.
 *
 * FREIWILLIGES RICHTIGES UEBEN AENDERT DEN STAND NICHT: ist die Karte noch nicht
 * faellig UND die Antwort richtig, bleibt alles, wie es war — sonst liesse sich der
 * Stapel mit Fleiss leerueben, ohne dass etwas haengenbleibt (die Zahl "gefestigt"
 * stiege, das Wissen nicht).
 *
 * ⚠️ DER GUARD GILT NUR FUER "richtig", NICHT FUER "falsch" — das ist eine Korrektur
 * gegen den urspruenglichen Testfall (gemessen: ein blindes `if (vorher.faelligAm >
 * heute) return;` liess "setzt bei falsch zurueck und zaehlt weiter" rot laufen, weil
 * die zweite, noch nicht faellige Antwort komplett verschluckt wurde). Fachlich ist
 * das richtig so: eine FALSCHE Antwort ist ein Befund, auch wenn sie zu frueh kommt —
 * wer sich beim freiwilligen Ueben irrt, weiss es offenkundig noch nicht sicher, und
 * das darf den Stand jederzeit zuruecksetzen. Nur ein frueher RICHTIGER Treffer soll
 * nicht zaehlen.
 */
export function schreibeAntwort(
  db: DB,
  sub: string,
  zeichenId: string,
  ergebnis: Ergebnis,
  heute: string,
): void {
  const vorher = db
    .select()
    .from(lernstand)
    .where(and(eq(lernstand.sub, sub), eq(lernstand.zeichenId, zeichenId)))
    .get();

  if (vorher && ergebnis === "richtig" && vorher.faelligAm > heute) return;

  const stand = naechsterStand(vorher?.stufe ?? 0, ergebnis, heute);
  db.insert(lernstand)
    .values({
      sub,
      zeichenId,
      stufe: stand.stufe,
      faelligAm: stand.faelligAm,
      richtig: (vorher?.richtig ?? 0) + (ergebnis === "richtig" ? 1 : 0),
      falsch: (vorher?.falsch ?? 0) + (ergebnis === "falsch" ? 1 : 0),
      letzteAntwortAm: new Date(),
    })
    .onConflictDoUpdate({
      target: [lernstand.sub, lernstand.zeichenId],
      set: {
        stufe: stand.stufe,
        faelligAm: stand.faelligAm,
        richtig: (vorher?.richtig ?? 0) + (ergebnis === "richtig" ? 1 : 0),
        falsch: (vorher?.falsch ?? 0) + (ergebnis === "falsch" ? 1 : 0),
        letzteAntwortAm: new Date(),
      },
    })
    .run();
}

/**
 * Die waehlbaren Sets. `groesse` ist die eingetragene Zahl, `verfuegbar` die auflösbare —
 * beide getrennt, damit die Flaeche "18 von 20 verfuegbar" sagen kann statt still
 * weniger zu fragen (Spec §4.6 Stufe 2).
 */
export function aktiveLernsets(
  db: DB,
): readonly { slug: string; titel: string; groesse: number; verfuegbar: number }[] {
  return db
    .select()
    .from(lernsets)
    .where(eq(lernsets.aktiv, true))
    .orderBy(asc(lernsets.sortierung), asc(lernsets.titel))
    .all()
    .map((set) => {
      const zeilen = db
        .select()
        .from(lernsetZeichen)
        .where(eq(lernsetZeichen.lernsetId, set.id))
        .all();
      return {
        slug: set.slug,
        titel: set.titel,
        groesse: zeilen.length,
        verfuegbar: zeilen.filter((z) => findeZeichen(z.zeichenId) !== null).length,
      };
    });
}

/*
 * --- Verwaltung (eigene Ergaenzung, nicht im Brief ausgeschrieben) --------------------
 *
 * Die zwei Abfragen unten bedienen die Lernset-Verwaltung: dort muessen auch INAKTIVE
 * (Entwurfs-)Sets sichtbar sein, `aktiveLernsets` oben blendet sie absichtlich aus.
 */

export interface LernsetZeile {
  id: string;
  slug: string;
  titel: string;
  aktiv: boolean;
  anzahl: number;
}

/** ALLE Lernsets — auch inaktive Entwuerfe — mit ihrer eingetragenen Groesse. */
export function alleLernsetsMitAnzahl(db: DB): readonly LernsetZeile[] {
  return db
    .select()
    .from(lernsets)
    .orderBy(asc(lernsets.sortierung), asc(lernsets.titel))
    .all()
    .map((set) => ({
      id: set.id,
      slug: set.slug,
      titel: set.titel,
      aktiv: set.aktiv,
      anzahl: db
        .select()
        .from(lernsetZeichen)
        .where(eq(lernsetZeichen.lernsetId, set.id))
        .all().length,
    }));
}

export interface LernsetEintrag {
  zeichenId: string;
  titelSchnappschuss: string;
  position: number;
}

/** Ein Set mit seinen Eintraegen, fuer die Detailseite. `null`, wenn die ID nicht existiert. */
export function einLernsetMitEintraegen(
  db: DB,
  id: string,
): { set: { id: string; slug: string; titel: string; aktiv: boolean }; eintraege: readonly LernsetEintrag[] } | null {
  const set = db.select().from(lernsets).where(eq(lernsets.id, id)).get();
  if (!set) return null;
  const eintraege = db
    .select()
    .from(lernsetZeichen)
    .where(eq(lernsetZeichen.lernsetId, id))
    .orderBy(asc(lernsetZeichen.position))
    .all()
    .map((z) => ({
      zeichenId: z.zeichenId,
      titelSchnappschuss: z.titelSchnappschuss,
      position: z.position,
    }));
  return { set: { id: set.id, slug: set.slug, titel: set.titel, aktiv: set.aktiv }, eintraege };
}
