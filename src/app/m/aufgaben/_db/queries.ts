import { and, asc, eq } from "drizzle-orm";
import { darfFreigeben, istAktiv } from "../_lib/zugang";
import type { DB } from "./client";
import {
  aufgaben,
  nachweise,
  personen,
  routinen,
  verlauf,
  type AufgabeRow,
  type Ereignis,
  type NachweisRow,
  type PersonRow,
  type Rolle,
  type RoutineRow,
  type VerlaufRow,
} from "./schema";

/*
 * LESEPFADE — ALLE SYNCHRON. better-sqlite3 ist ein synchroner Treiber; `.all()`/`.get()`/`.run()`
 * liefern das Ergebnis direkt, kein Promise. Ein `async`-Wrapper hier waere eine Verzierung ohne
 * Gegenwert und zwaenge jeden Aufrufer zu einem `await`, das nichts abwartet — dieselbe Wahl wie
 * `feedback/_db/queries.ts`. EINZIGE AUSNAHME im Modul ist `personFuerSession` (`_lib/zugang.ts`):
 * die ist `async`, aber NUR wegen `auth()` — nicht wegen der Datenbank.
 *
 * Kein `"use client"` — Server Components lesen diese Funktionen direkt.
 *
 * DIE ZUGEHOERIGKEIT KOMMT AUS DER AUFGABE IN DER DATENBANK, NIE AUS EINEM URL-PARAMETER. Diese
 * Datei liest nur; das eigentliche IDOR-Risiko liegt bei den AUFRUFERN (Seiten, Actions), die eine
 * `id` aus der URL nehmen und sie ungeprueft an `aufgabe(db, id)` durchreichen wuerden. Vorbild
 * fuer die Gegenprobe: `assertGroupAccess` im Modul `feedback`.
 */

const ROLLEN_RANG: Record<Rolle, number> = { koordination: 0, auftrag: 1, bufdi: 2 };

/**
 * Sortiert: Rolle in der fachlichen Rangfolge, dann Name alphabetisch.
 *
 * `localeCompare(b.name, "de")` MIT explizitem Gebietsschema — ohne Argument haengt die
 * Sortierung eines Namens mit Umlaut gegen einen ohne an der Standard-Locale des Prozesses.
 * Vier weitere Stellen im Repo geben die Sprache aus demselben Grund mit an
 * (`core/auth/devGroups.ts`, `core/directory/index.ts`, `feedback/_lib/personen.ts`,
 * `lagerbuch/_lib/lesepfade/bestellung.ts`).
 */
export function allePersonen(db: DB): PersonRow[] {
  return db
    .select()
    .from(personen)
    .all()
    .sort(
      (a, b) => ROLLEN_RANG[a.rolle] - ROLLEN_RANG[b.rolle] || a.name.localeCompare(b.name, "de"),
    );
}

/**
 * Fuer Plan-Navigation — eine ausgeschiedene Person verschwindet hier. NICHT fuer Verteillisten:
 * die Koordination selbst ist aktiv und stuende hier drin, obwohl sie nicht verteilt bekommen
 * soll (`darfFreigeben` in `_lib/zugang.ts` begruendet das). Verteillisten speisen sich aus
 * `bufdis()`.
 */
export function aktivePersonen(db: DB, heute: string): PersonRow[] {
  return allePersonen(db).filter((p) => istAktiv(p, heute));
}

/** Aktive Personen mit `rolle === "bufdi"`, in der Sortierung von `allePersonen` (alphabetisch). */
export function bufdis(db: DB, heute: string): PersonRow[] {
  return aktivePersonen(db, heute).filter((p) => p.rolle === "bufdi");
}

export function personNachSub(db: DB, sub: string): PersonRow | null {
  return db.select().from(personen).where(eq(personen.sub, sub)).get() ?? null;
}

export function personNachId(db: DB, id: string): PersonRow | null {
  return db.select().from(personen).where(eq(personen.id, id)).get() ?? null;
}

export function aufgabe(db: DB, id: string): AufgabeRow | null {
  return db.select().from(aufgaben).where(eq(aufgaben.id, id)).get() ?? null;
}

/** `zugewiesenAn === personId` — der eigene Arbeitsvorrat eines BuFDi. */
export function aufgabenFuerPerson(db: DB, personId: string): AufgabeRow[] {
  return db.select().from(aufgaben).where(eq(aufgaben.zugewiesenAn, personId)).all();
}

/** `status === "eingegangen"` — noch niemandem zugewiesen. */
export function posteingang(db: DB): AufgabeRow[] {
  return db.select().from(aufgaben).where(eq(aufgaben.status, "eingegangen")).all();
}

/**
 * FILTERT SERVERSEITIG AUF DAS SICHTRECHT: das Ergebnis ist genau die Menge, fuer die
 * `darfFreigeben` wahr waere — Oberflaeche und Riegel sagen an dieser Stelle dasselbe, statt einer
 * Warteschlange, die mehr zeigt als der Knopf erlaubt.
 *
 * `heute` kommt VOM AUFRUFER, wie ueberall sonst im Modul — die urspruengliche Brief-Vorgabe
 * (kein `heute`-Argument, `isoTag(new Date())` hier selbst ermittelt) haengte die fuenf Tests
 * dieser Funktion an die echte Systemuhr und war ein Mangel des Briefs, nicht der Umsetzung. Die
 * Zeitzone bleibt trotzdem an der einen Stelle (`_lib/datum.ts`); diese Funktion bekommt das
 * Ergebnis nur uebergeben, statt es selbst abzufragen.
 */
export function freigabenFuer(db: DB, p: PersonRow, heute: string): AufgabeRow[] {
  return db
    .select()
    .from(aufgaben)
    .where(eq(aufgaben.status, "freigabe_offen"))
    .all()
    .filter((a) => darfFreigeben(p, a, heute));
}

export function aufgabenVonErsteller(db: DB, personId: string): AufgabeRow[] {
  return db.select().from(aufgaben).where(eq(aufgaben.erstellerId, personId)).all();
}

/** `status === "abgeschlossen"` — der Endzustand, das Archiv. */
export function archiv(db: DB): AufgabeRow[] {
  return db.select().from(aufgaben).where(eq(aufgaben.status, "abgeschlossen")).all();
}

export function routinenFuer(db: DB, personId: string): RoutineRow[] {
  return db.select().from(routinen).where(eq(routinen.personId, personId)).all();
}

export function routineNachId(db: DB, id: string): RoutineRow | null {
  return db.select().from(routinen).where(eq(routinen.id, id)).get() ?? null;
}

/**
 * ERSTELLT EINE ROUTINE — Aufgabe 11, `routineAnlegenAction`. Flaches Objekt wie
 * `erstelleAufgabe`: der Aufrufer soll `id`/`erstelltAm`/`aktiv` nicht mitgeben
 * koennen (`aktiv` traegt `$defaultFn`-freien `default(true)` im Schema — eine
 * neu angelegte Routine ruht nie).
 */
export function erstelleRoutine(
  db: DB,
  werte: {
    personId: string;
    titel: string;
    wochentage: number;
    uhrzeit: string | null;
    dauerMinuten: number;
  },
): RoutineRow {
  return db.insert(routinen).values(werte).returning().get();
}

/**
 * AKTUALISIERT EINE ROUTINE — `routineAendernAction` (Titel/Wochentage/Uhrzeit/Dauer) UND
 * `routineRuhenAction` (nur `aktiv`), deshalb ein gemeinsames Schreibprimitiv statt zweier fast
 * gleicher Funktionen. Anders als `aktualisiereAufgabe`: KEIN erzwungenes `aktualisiertAm` — die
 * Tabelle `routinen` fuehrt keine solche Spalte (`_db/schema.ts`), eine Routine traegt keine
 * Historie, die einen „zuletzt geaendert"-Zeitpunkt bräuchte.
 */
export function aktualisiereRoutine(
  db: DB,
  id: string,
  patch: Partial<Omit<typeof routinen.$inferInsert, "id" | "personId" | "erstelltAm">>,
): RoutineRow {
  return db.update(routinen).set(patch).where(eq(routinen.id, id)).returning().get();
}

/**
 * Aufsteigend nach `ts` — die Geschichte einer Aufgabe in der Reihenfolge, in der sie geschah.
 * `ORDER BY` in SQL statt eines JS-Sorts: das nutzt `verlauf_aufgabe_idx` auf
 * `(aufgabe_id, ts)` (Schema-Kommentar), fuer genau diese Abfrage angelegt.
 */
export function verlaufFuer(db: DB, aufgabeId: string): VerlaufRow[] {
  return db
    .select()
    .from(verlauf)
    .where(eq(verlauf.aufgabeId, aufgabeId))
    .orderBy(asc(verlauf.ts))
    .all();
}

export function nachweiseFuer(db: DB, aufgabeId: string): NachweisRow[] {
  return db.select().from(nachweise).where(eq(nachweise.aufgabeId, aufgabeId)).all();
}

/**
 * NACHWEISE, DIE DIE PFLICHT NOCH ERFUELLEN DUERFEN (Aufgabe 10, Review Fix-Runde 1, Befund #6,
 * Betreiberentscheidung 2026-08-14) — nur die, die NACH der letzten Zurueckweisung entstanden sind.
 *
 * BEGRUENDUNG, ABLEITBAR, NICHT GESCHMACKSSACHE: ein Nachweis ist der BELEG FUER EINE
 * FERTIGMELDUNG. Eine Zurueckweisung erklaert genau diese Fertigmeldung fuer ungenuegend — und
 * damit auch ihren Beleg. Bliebe ein alter Nachweis gueltig, koennte eine zurueckgewiesene Aufgabe
 * beim zweiten Anlauf OHNE JEDE NEUE HANDLUNG abgeschlossen werden (fertig melden -> zurueckgewiesen
 * -> wiederaufnehmen -> erneut fertig melden mit LEEREM Textfeld, weil die alte Zeile die
 * Untergrenze noch "erfuellt") — die Nachweispflicht waere dann eine Huerde, die man genau einmal
 * nimmt. Das gilt fuer BEIDE Zweige (`text` und `bild`) gleichermassen: `fertigMeldenAction` ruft
 * diese Funktion einmal fuer beide auf, keine zweite Fassung derselben Regel.
 *
 * Der Zeitpunkt kommt aus dem VERLAUF (der ohnehin da ist), nicht aus einem zusaetzlichen Feld auf
 * der Aufgabe — die letzte Zeile mit `ereignis === "zurueckgewiesen"`. Gibt es keine, zaehlen alle
 * Nachweise (der Normalfall: eine Aufgabe, die noch nie zurueckgewiesen wurde).
 */
export function nachweiseSeitLetzterZurueckweisung(db: DB, aufgabeId: string): NachweisRow[] {
  const historie = verlaufFuer(db, aufgabeId);
  let gueltigAb: Date | null = null;
  for (let i = historie.length - 1; i >= 0; i--) {
    if (historie[i]!.ereignis === "zurueckgewiesen") {
      gueltigAb = historie[i]!.ts;
      break;
    }
  }
  const alle = nachweiseFuer(db, aufgabeId);
  return gueltigAb === null ? alle : alle.filter((n) => n.erstelltAm > gueltigAb!);
}

/**
 * DER PLATZ FUER EINPLANEN (Aufgabe 10, `einplanenAction`) — DICHTE SKALA JE PERSON UND TAG,
 * AUFSTEIGEND. Diese Funktion ORDNET NIE UM, sie entscheidet nur den Platz eines EINZELNEN
 * Einplanens; das Auf-/Ab-Paar aus Spec §8.5 (Aufgabe 12) und das Ziehen (Aufgabe 20) sind eigene
 * Schreiboperationen AUF dieser Skala, keine Erweiterung dieser Funktion.
 *
 * ZWEI FAELLE:
 *  - Der Tag AENDERT SICH (oder die Aufgabe hatte noch keinen `planDatum`): sie wird ANS ENDE des
 *    NEUEN Tages gehaengt (`max(planRang) + 1`, oder 0 wenn der Tag dort noch leer ist) — ein
 *    frisch eingeplanter Eintrag hat noch keine gewaehlte Position innerhalb des Tages.
 *  - Der Tag BLEIBT GLEICH (nur die Uhrzeit wird korrigiert, keine Verschiebung): der BISHERIGE
 *    `planRang` bleibt STEHEN. Ohne diese Ausnahme wuerde ein zweites `einplanen` auf denselben Tag
 *    die Aufgabe erneut ans Ende haengen — eine reine Korrekturbuchung der Uhrzeit verschoebe die
 *    Position in der Liste schweigend. Die Gestaltungshoheit ueber den eigenen Tag
 *    (`darfPlanAendern`-Kommentar in `_lib/zugang.ts`) gilt auch fuer eine Reihenfolge, die die
 *    Person bereits selbst gewaehlt hat.
 *
 * Die Abfrage im zweiten Fall schliesst die AUFGABE SELBST implizit aus: sie wird nur erreicht, wenn
 * `task.planDatum !== planDatum` gilt, und die eigene (alte) Zeile der Aufgabe traegt dann per
 * Definition NICHT den neuen `planDatum`-Wert, taucht also im Filter nicht auf — ein separates
 * `ne(aufgaben.id, task.id)` waere derselbe Ausschluss ein zweites Mal.
 *
 * Nutzt den Index `aufgaben_plan_idx` auf `(zugewiesen_an, plan_datum)` (Schema-Kommentar), fuer
 * genau diese Abfrage angelegt.
 */
export function planRangFuerEinplanen(db: DB, task: AufgabeRow, planDatum: string): number {
  if (task.planDatum === planDatum) return task.planRang;
  // Invariante: "einplanen" ist nur ab "verteilt" ODER "in_arbeit" erreichbar (Spec-Nachtrag
  // 2026-08-13), und beide Zustaende setzen `zugewiesenAn` immer (ueber "verteilen"/"umverteilen"
  // bzw. das nachfolgende "starten") — dieser Zweig ist damit nach heutiger Tabelle unerreichbar.
  if (task.zugewiesenAn === null) return 0;
  const zeilen = db
    .select({ planRang: aufgaben.planRang })
    .from(aufgaben)
    .where(and(eq(aufgaben.zugewiesenAn, task.zugewiesenAn), eq(aufgaben.planDatum, planDatum)))
    .all();
  if (zeilen.length === 0) return 0;
  return Math.max(...zeilen.map((z) => z.planRang)) + 1;
}

/**
 * ALLE AUFGABEN EINER PERSON AN EINEM PLANTAG, AUFSTEIGEND NACH `planRang` (Aufgabe 12,
 * `rangVerschiebenAction`) — DIESELBE SKALA, DIE `tagesOrdnung` (`_lib/tagesplan.ts`, Schritt 1) FUER
 * DIE AUFGABEN-TEILFOLGE EINES TAGES VERWENDET: derselbe Filter
 * (`zugewiesenAn === personId && planDatum === datum`), dieselbe Sortierung nach `planRang`. "Erster"
 * und "letzter" beziehen sich deshalb NUR auf die AUFGABEN dieser Person an diesem Tag — Routinen
 * zaehlen nicht mit, sie tragen keinen `planRang` und keine Aktionen (Spec §8.1: "Routineblöcke ...
 * tragen keine Aktionen"). Eine Aufgabe, die in der gemischten `tagesOrdnung`-Ansicht visuell HINTER
 * einem Routineblock steht, kann auf DIESER Skala trotzdem die erste sein — das ist beabsichtigt,
 * kein Fehler dieser Funktion, und Aufrufer (Aufgabe 13/20), die `istErste`/`istLetzte` fuer
 * `RangKnoepfe` ableiten, muessen von DIESER Liste ausgehen, nicht von `tagesOrdnung`s Ergebnis.
 *
 * Sekundaer nach `id` sortiert — rein defensiv: ueber `einplanenAction`/`planRangFuerEinplanen` ist
 * ein Gleichstand innerhalb eines Tages nicht erreichbar (die Skala bleibt dort je Tag lueckenlos
 * eindeutig, `max(planRang) + 1` fuer jeden neu ankommenden Eintrag), aber die Nachbarermittlung in
 * `rangVerschiebenAction` soll nicht von der zufaelligen Ruecklieferreihenfolge der SQL-Abfrage
 * abhaengen, falls doch einmal zwei Zeilen denselben Rang tragen (z. B. ein direkt geschriebener
 * Seed).
 *
 * Nutzt denselben Index wie `planRangFuerEinplanen`: `aufgaben_plan_idx` auf
 * `(zugewiesen_an, plan_datum)`.
 */
export function planEintraegeFuerTag(db: DB, personId: string, planDatum: string): AufgabeRow[] {
  return db
    .select()
    .from(aufgaben)
    .where(and(eq(aufgaben.zugewiesenAn, personId), eq(aufgaben.planDatum, planDatum)))
    .all()
    .sort((a, b) => a.planRang - b.planRang || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * SCHREIBT EINEN TEXTNACHWEIS (Aufgabe 10, `fertigMeldenAction`). Der Bildnachweis (`dateiId`
 * gesetzt) kommt erst mit dem Upload aus Aufgabe 17-19 — diese Funktion schreibt deshalb nur die
 * Textform; `dateiId` bleibt in dieser Aufgabe immer `null`.
 */
export function erstelleNachweis(
  db: DB,
  werte: { aufgabeId: string; text: string; erstelltVon: string },
): NachweisRow {
  return db
    .insert(nachweise)
    .values({ aufgabeId: werte.aufgabeId, art: "text", text: werte.text, erstelltVon: werte.erstelltVon })
    .returning()
    .get();
}

/**
 * ERSTELLT EINE AUFGABE — Aufgabe 9, `aufgabeEinstellenAction`. Nimmt bewusst ein flaches Objekt
 * statt `typeof aufgaben.$inferInsert`: der Aufrufer soll nicht `id`/`erstelltAm`/`aktualisiertAm`
 * mitgeben koennen (beide `$defaultFn`), und `planRang`/`vorschlagDatum`/`vorschlagUhrzeit` sind
 * beim Einstellen nie gesetzt (eine neue Aufgabe hat weder Plan noch Vorschlag).
 */
export function erstelleAufgabe(
  db: DB,
  werte: {
    titel: string;
    beschreibung: string;
    prioritaet: (typeof aufgaben.$inferInsert)["prioritaet"];
    erstellerId: string;
    zugewiesenAn: string | null;
    status: (typeof aufgaben.$inferInsert)["status"];
    faelligAm: string;
    faelligUhrzeit: string | null;
    dauerMinuten: number;
    nachweisPflicht: boolean;
    nachweisArt: (typeof aufgaben.$inferInsert)["nachweisArt"];
    prueferId: string | null;
    istSelbst: boolean;
  },
): AufgabeRow {
  return db.insert(aufgaben).values(werte).returning().get();
}

/**
 * AKTUALISIERT EINE AUFGABE — das gemeinsame Schreibprimitiv fuer `verteilen`, `umverteilen` und
 * jeden weiteren Uebergang aus Aufgabe 10-12. `aktualisiertAm` bekommt HIER, an der einen Stelle,
 * IMMER einen frischen Wert: die Spalte traegt zwar `$defaultFn(() => new Date())`, aber das feuert
 * NUR beim Insert — ein Update ohne diese Zeile liesse `aktualisiertAm` bei jedem Statuswechsel
 * lautlos veralten.
 */
export function aktualisiereAufgabe(
  db: DB,
  id: string,
  patch: Partial<Omit<typeof aufgaben.$inferInsert, "id" | "erstellerId" | "erstelltAm">>,
): AufgabeRow {
  return db
    .update(aufgaben)
    .set({ ...patch, aktualisiertAm: new Date() })
    .where(eq(aufgaben.id, id))
    .returning()
    .get();
}

/**
 * LOESCHT EINE AUFGABE SAMT VERLAUF (und Nachweisen/Dateien) — `zurueckziehenAction`, NUR aus
 * `eingegangen` (das prueft `uebergang()`, nicht diese Funktion). Die Kaskade steht im Schema
 * (`onDelete: "cascade"` auf `verlauf.aufgabeId`/`nachweise.aufgabeId`/`dateien.aufgabeId`, von
 * Aufgabe 2 getestet) — ein zweiter, manueller Loeschlauf hier waere dieselbe Zusage doppelt gehalten.
 */
export function loescheAufgabe(db: DB, id: string): void {
  db.delete(aufgaben).where(eq(aufgaben.id, id)).run();
}

/**
 * DAS EINE SCHREIBPRIMITIV DIESER AUFGABE. Jeder Uebergang der Uebergangstabelle (Spec §5.2)
 * schreibt eine Verlaufszeile — diese Funktion ist damit heute schon belegbar gebraucht (erster
 * Aufrufer: `_lib/seedLokal.ts`). Die UEBRIGEN Schreibprimitive (Aufgabe erstellen, verteilen,
 * Status wechseln, …) gehoeren NICHT in diese Aufgabe: welche Form sie brauchen, weiss man erst,
 * wenn die Server-Actions der Aufgaben 9/10 geschrieben sind. Sie jetzt zu erfinden hiesse, eine
 * Schnittstelle gegen einen unbekannten Aufrufer zu bauen.
 *
 * `ts` bekommt bewusst KEIN Argument: der Zeitpunkt eines Verlaufseintrags ist der Moment des
 * Schreibens, nicht ein von aussen mitgebrachter Wert — die Spalte traegt ohnehin einen
 * `$defaultFn(() => new Date())` (Schema).
 *
 * `ereignis: Ereignis` STATT `string` (nachgezogen in Aufgabe 8, die `EREIGNISSE` erst einfuehrt):
 * ohne diese Verengung waere `EREIGNISSE` nur eine Behauptung, die niemand am einzigen Schreibpfad
 * durchsetzt — genau die Luecke, die Aufgabe 7 schon einmal eine ganze Suite gruen liess, obwohl
 * der tragende Mechanismus fehlte. `_lib/seedLokal.ts` (der einzige heutige Aufrufer) haelt sich
 * bereits an das Vokabular und braucht deshalb keine Anpassung ausser dem Typ ihres eigenen Felds.
 */
export function schreibeVerlauf(
  db: DB,
  eintrag: { aufgabeId: string; ereignis: Ereignis; akteurId: string; notiz?: string },
): VerlaufRow {
  return db
    .insert(verlauf)
    .values({
      aufgabeId: eintrag.aufgabeId,
      ereignis: eintrag.ereignis,
      akteurId: eintrag.akteurId,
      notiz: eintrag.notiz ?? null,
    })
    .returning()
    .get();
}
