import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { FahrzeugeDb } from "../_db/client";
import { fahrzeugakte, pruefung, reifensatz, stammfahrzeug } from "../_db/schema";
import { reifensatzEingabe, technikEingabe } from "./akte/eingabe";
import { heute as heuteInZone } from "./akte/heute";
import type { PruefArt, ReifenArt, TechnikEingabe } from "./akte/typen";
import { speichereFahrzeug } from "./daten";
import { fahrzeugEingabe } from "./eingabe";

/**
 * Beispielfahrzeuge, abgestimmt auf die Demodaten der anderen Module: die Funkkenner wie in
 * `einsatzbuch/_lib/stammdaten/vorlage.ts` (`VORLAGE_FAHRZEUGE`), die Kennzeichen wie die Fahrzeuge in
 * `lagerbuch/_lib/seedLokal.ts`. So hat der spätere Erstimport (IDA-256) lokal etwas zum Zuordnen.
 */
const BEISPIELE = [
  { art: "fahrzeug", typ: "ELW 1", funkrufname: "Rotkreuz Uelzen 11-11-1", funkkenner: "11-11-1", kennzeichen: "", standort: "Uelzen" },
  { art: "fahrzeug", typ: "RTW", funkrufname: "Rotkreuz Uelzen 11-83-1", funkkenner: "11-83-1", kennzeichen: "HN-DRK-1101", standort: "Uelzen" },
  { art: "fahrzeug", typ: "KTW-B", funkrufname: "Rotkreuz Uelzen 11-85-1", funkkenner: "11-85-1", kennzeichen: "HN-DRK-1201", standort: "Uelzen" },
  { art: "fahrzeug", typ: "MTF", funkrufname: "Rotkreuz Uelzen 11-19-1", funkkenner: "11-19-1", kennzeichen: "HN-DRK-1401", standort: "Uelzen" },
  { art: "fahrzeug", typ: "GW-San", funkrufname: "Rotkreuz Bad Bevensen 12-64-1", funkkenner: "12-64-1", kennzeichen: "", standort: "Bad Bevensen" },
  { art: "anhaenger", typ: "Anhänger Betreuung", funkrufname: "Anhänger Betreuung Uelzen", funkkenner: "", kennzeichen: "", standort: "Uelzen" },
] as const;

/** Eine Beispielprüfung: Art, Name, Abstand in Monaten, vor wie vielen Tagen zuletzt, optional der Kilometerteil. */
type P = readonly [art: PruefArt, name: string, monate: number, vorTagen: number, km?: { zuletztKm: number; kmAbstand: number }];

interface BeispielAkte {
  technik: TechnikEingabe;
  /** `null` beim Anhänger. */
  km: { stand: number; vorTagen: number } | null;
  /** `richtig`/`falsch` hängt an der Jahreszeit des Seed-Tags, damit die Reifenampel immer beide Fälle zeigt. */
  aufgezogen: "richtig" | "falsch" | "Ganzjahres";
  saetze: readonly { art: ReifenArt; dot: string; lager: string }[];
  pruefungen: readonly P[];
}

/**
 * Die Akten der Beispielfahrzeuge (IDA-299), Schlüssel ist der Funkrufname aus `BEISPIELE`. Alle Tage
 * stehen relativ zum Seed-Tag, damit die Ampel lokal jede Farbe zeigt: der RTW ist bei der HU überfällig
 * und fährt die falschen Reifen, beim KTW steht die UVV bald an, der MTF ist rundum in Ordnung.
 */
const AKTEN: Record<string, BeispielAkte> = {
  "Rotkreuz Uelzen 11-11-1": {
    technik: { modell: "VW T6.1 Kombi", baujahr: 2020, laengeCm: 530, breiteCm: 190, hoeheCm: 199, zggKg: 3200, leerKg: 2510, staerke: [1, 1, 2], sitze: 5, tragen: 0, fuehrerschein: "B", besonderheiten: ["Sondersignal", "Anhängerkupplung", "Standheizung"] },
    km: { stand: 84210, vorTagen: 6 }, aufgezogen: "richtig",
    saetze: [{ art: "Winter", dot: "3822", lager: "Fahrzeughalle Uelzen, Regal 2" }, { art: "Sommer", dot: "1423", lager: "Fahrzeughalle Uelzen, Regal 2" }],
    pruefungen: [["HU", "HU (TÜV)", 24, 712], ["UVV", "UVV-Prüfung", 12, 190], ["Service", "Inspektion", 12, 290, { zuletztKm: 69400, kmAbstand: 30000 }], ["Weitere", "Feuerlöscher", 24, 410]],
  },
  "Rotkreuz Uelzen 11-83-1": {
    technik: { modell: "Mercedes Sprinter 519, Kofferaufbau", baujahr: 2016, laengeCm: 695, breiteCm: 230, hoeheCm: 285, zggKg: 5000, leerKg: 4120, staerke: [0, 1, 1], sitze: 4, tragen: 1, fuehrerschein: "C1", besonderheiten: ["Sondersignal", "Rückfahrkamera", "Landstrom"] },
    km: { stand: 152340, vorTagen: 2 }, aufgezogen: "falsch",
    saetze: [{ art: "Winter", dot: "4121", lager: "Reifenservice Uelzen" }, { art: "Sommer", dot: "2022", lager: "Reifenservice Uelzen" }],
    pruefungen: [["HU", "HU (TÜV)", 12, 371], ["UVV", "UVV-Prüfung", 12, 340], ["Service", "Inspektion", 12, 150, { zuletztKm: 133140, kmAbstand: 20000 }], ["Weitere", "Feuerlöscher", 24, 200], ["Weitere", "Medizinprodukte (STK)", 12, 160]],
  },
  "Rotkreuz Uelzen 11-85-1": {
    technik: { modell: "Mercedes Sprinter 316, Kastenwagen", baujahr: 2018, laengeCm: 593, breiteCm: 202, hoeheCm: 270, zggKg: 3880, leerKg: 3150, staerke: [0, 1, 1], sitze: 5, tragen: 1, fuehrerschein: "C1", besonderheiten: ["Sondersignal", "Allrad", "Anhängerkupplung"] },
    km: { stand: 96820, vorTagen: 20 }, aufgezogen: "richtig",
    saetze: [{ art: "Winter", dot: "4423", lager: "Fahrzeughalle Uelzen, Regal 3" }, { art: "Sommer", dot: "1824", lager: "Fahrzeughalle Uelzen, Regal 3" }],
    pruefungen: [["HU", "HU (TÜV)", 12, 100], ["UVV", "UVV-Prüfung", 12, 353], ["Service", "Inspektion", 12, 120, { zuletztKm: 90100, kmAbstand: 30000 }], ["Weitere", "Feuerlöscher", 24, 300]],
  },
  "Rotkreuz Uelzen 11-19-1": {
    technik: { modell: "VW Crafter 35, 9-Sitzer", baujahr: 2022, laengeCm: 599, breiteCm: 204, hoeheCm: 259, zggKg: 3500, leerKg: 2490, staerke: [0, 1, 8], sitze: 9, tragen: 0, fuehrerschein: "B", besonderheiten: ["Anhängerkupplung"] },
    km: { stand: 63410, vorTagen: 9 }, aufgezogen: "Ganzjahres",
    saetze: [{ art: "Ganzjahres", dot: "2224", lager: "" }],
    pruefungen: [["HU", "HU (TÜV)", 24, 300], ["UVV", "UVV-Prüfung", 12, 60], ["Service", "Inspektion", 24, 200, { zuletztKm: 51200, kmAbstand: 30000 }], ["Weitere", "Feuerlöscher", 24, 60]],
  },
  "Rotkreuz Bad Bevensen 12-64-1": {
    technik: { modell: "MAN TGL 8.190, Kofferaufbau", baujahr: 2012, laengeCm: 740, breiteCm: 245, hoeheCm: 330, zggKg: 7490, leerKg: 5880, staerke: [0, 1, 5], sitze: 6, tragen: 4, fuehrerschein: "C1", besonderheiten: ["Sondersignal", "Ladebordwand", "Stromerzeuger", "Anhängerkupplung"] },
    km: { stand: 41260, vorTagen: 34 }, aufgezogen: "richtig",
    saetze: [{ art: "Winter", dot: "4020", lager: "Wache Bad Bevensen" }, { art: "Sommer", dot: "1622", lager: "Wache Bad Bevensen" }],
    pruefungen: [["HU", "HU (TÜV)", 12, 120], ["UVV", "UVV-Prüfung", 12, 90], ["Service", "Inspektion", 12, 200, { zuletztKm: 38900, kmAbstand: 30000 }], ["Weitere", "Stromerzeuger (DGUV V3)", 12, 345], ["Weitere", "Ladebordwand", 12, 30]],
  },
  "Anhänger Betreuung Uelzen": {
    technik: { modell: "Humbaur Kofferanhänger HK 202513", baujahr: 2019, laengeCm: 390, breiteCm: 175, hoeheCm: 220, zggKg: 2000, leerKg: 640, staerke: null, sitze: 0, tragen: 0, fuehrerschein: "BE", besonderheiten: ["Tempo 100", "Auflaufbremse"] },
    km: null, aufgezogen: "Ganzjahres",
    saetze: [{ art: "Ganzjahres", dot: "0819", lager: "" }],
    pruefungen: [["HU", "HU (TÜV)", 24, 500], ["Weitere", "Wartung Auflaufbremse", 24, 300]],
  },
};

/** Kalendertag `tage` Tage vor `tag` (`JJJJ-MM-TT`) — reine Kalenderrechnung in UTC, ohne Zeitzone. */
function tageVor(tag: string, tage: number): string {
  const [j, m, t] = tag.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t - tage)).toISOString().slice(0, 10);
}

/**
 * Füllt die Akten der Beispielfahrzeuge nach — nur dort, wo ein Fahrzeug mit dem Funkrufnamen aus
 * `AKTEN` noch gar nichts hat (keine Aktenzeile, keine Prüfung, kein Reifensatz). Was jemand lokal
 * eingetragen hat, bleibt unberührt. Schreibt bewusst direkt in die Tabellen statt über
 * `akte/daten.ts`: die Beispielprüfungen bringen ihren `zuletztKm` mit, den `speicherePruefung` nicht annimmt.
 */
export function seedLokalAkten(db: FahrzeugeDb, heute: string = heuteInZone(), jetzt = new Date()): number {
  // Oktober bis März ist Winterreifenzeit (dieselbe Grenze wie die Saisonregel in `akte/regeln.ts`).
  const monat = Number(heute.slice(5, 7));
  const richtig: ReifenArt = monat >= 10 || monat <= 3 ? "Winter" : "Sommer";
  const falsch: ReifenArt = richtig === "Winter" ? "Sommer" : "Winter";
  return db.transaction((tx) => {
    let gefuellt = 0;
    const fahrzeuge = tx.select({ id: stammfahrzeug.id, funkrufname: stammfahrzeug.funkrufname }).from(stammfahrzeug)
      .where(inArray(stammfahrzeug.funkrufname, Object.keys(AKTEN))).all();
    const gesehen = new Set<string>();
    for (const f of fahrzeuge) {
      // Der Funkrufname ist nicht eindeutig: bei zwei gleichnamigen Fahrzeugen bekommt nur das erste die Akte.
      if (gesehen.has(f.funkrufname)) continue;
      gesehen.add(f.funkrufname);
      const belegt = tx.select({ id: fahrzeugakte.stammId }).from(fahrzeugakte).where(eq(fahrzeugakte.stammId, f.id)).get()
        ?? tx.select({ id: pruefung.id }).from(pruefung).where(eq(pruefung.stammId, f.id)).limit(1).get()
        ?? tx.select({ id: reifensatz.id }).from(reifensatz).where(eq(reifensatz.stammId, f.id)).limit(1).get();
      if (belegt) continue;
      const a = AKTEN[f.funkrufname];
      const t = technikEingabe.parse(a.technik);
      tx.insert(fahrzeugakte).values({
        stammId: f.id, modell: t.modell, baujahr: t.baujahr, laengeCm: t.laengeCm, breiteCm: t.breiteCm, hoeheCm: t.hoeheCm, zggKg: t.zggKg, leerKg: t.leerKg,
        staerkeF: t.staerke?.[0] ?? null, staerkeU: t.staerke?.[1] ?? null, staerkeM: t.staerke?.[2] ?? null,
        sitze: t.sitze, tragen: t.tragen, fuehrerschein: t.fuehrerschein, besonderheiten: t.besonderheiten,
        km: a.km?.stand ?? null, kmAm: a.km ? tageVor(heute, a.km.vorTagen) : null,
        reifenAufgezogen: a.aufgezogen === "richtig" ? richtig : a.aufgezogen === "falsch" ? falsch : a.aufgezogen,
      }).run();
      for (const s of a.saetze) tx.insert(reifensatz).values({ id: nanoid(), stammId: f.id, ...reifensatzEingabe.parse(s) }).run();
      for (const [art, name, monate, vorTagen, km] of a.pruefungen) {
        tx.insert(pruefung).values({
          id: nanoid(), stammId: f.id, art, name, monate, zuletzt: tageVor(heute, vorTagen),
          kmAbstand: km?.kmAbstand ?? null, zuletztKm: km?.zuletztKm ?? null, angelegtAm: jetzt,
        }).run();
      }
      gefuellt++;
    }
    return gefuellt;
  });
}

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag fahrzeuge). Idempotent: steht schon
 * ein Fahrzeug im Bestand, kommt kein Fahrzeug dazu (additiv, nichts wird überschrieben). Die Akten
 * (`seedLokalAkten`) werden auch auf einem schon geseedeten Bestand nachgezogen.
 */
export async function seedLokalFahrzeuge(db: FahrzeugeDb): Promise<string[]> {
  const meldungen: string[] = [];
  if (db.select({ id: stammfahrzeug.id }).from(stammfahrzeug).limit(1).get()) {
    meldungen.push("fahrzeuge: Bestand vorhanden, kein Fahrzeug angelegt");
  } else {
    for (const b of BEISPIELE) speichereFahrzeug(db, null, fahrzeugEingabe.parse({ ...b, bemerkung: "", aktiv: true }));
    meldungen.push(`fahrzeuge: ${BEISPIELE.length} Beispielfahrzeuge angelegt`);
  }
  const akten = seedLokalAkten(db);
  meldungen.push(akten > 0 ? `fahrzeuge: ${akten} Fahrzeugakten gefüllt` : "fahrzeuge: Akten vorhanden, nichts geändert");
  return meldungen;
}
