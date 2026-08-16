import type { DB } from "../_db/client";
import { allePersonen, letztesEreignis } from "../_db/queries";
import type { VerlaufRow } from "../_db/schema";
import { aktionsOptionen, type AktionsOptionen } from "./aktionsOptionen";
import { FUEHRUNG_EREIGNIS, naechsterArbeitstag, namenMap } from "./anzeige";
import type { Lage } from "./lage";
import { darfFreigabenSehen, darfPlanAendern, darfRoutinenVerwalten, type Akteur } from "./zugang";

/*
 * DIE GEMEINSAMEN SECHS FELDER DER FUEHRUNGSKARTE (Oberflaechen-Spec 2026-08-16 §4.2, §6.7).
 *
 * WARUM SIE HIER LIEGEN UND NICHT DREIMAL IN DEN EINSTIEGEN: alle drei Rollen brauchen dieselben
 * Ableitungen — den Namensspiegel, die Zustandsaktionen der fuehrenden Zeile, die Verlaufszeile,
 * den naechsten Arbeitstag und die drei Zugriffspraedikate. Dreimal derselbe Block laeuft
 * auseinander, sobald nur EINE Stelle nachgezogen wird; genau diese Lehre traegt schon
 * `verteilDaten`/`freigabeDaten` in `_db/queries.ts` („zwei separate Ladebloecke fuer dieselbe
 * Sache laufen auseinander, ohne dass ein Test es sieht").
 *
 * SERVER-ONLY, WIE `_lib/lage.ts` — und aus demselben Grund (§4.1): diese Datei ruft
 * `aktionsOptionen`, das ueber `_lib/lebenszyklus.ts` → `_lib/zugang.ts` → `@/core/auth`
 * (next-auth) haengt. Ein Import in eine Client-Insel zoege denselben serverseitigen Code ins
 * Bundle. Das ERGEBNIS ist rein und serialisierbar; die Karte bekommt nie den Selektor selbst und
 * nie eine Funktion daraus (Falle 9).
 *
 * `optionen` NUR BEI GENAU EINER ZEILE. Bei n > 1 nennt die Karte die Zahl und greift keine
 * Aufgabe heraus (§4.3) — eine Zustandsaktion muesste dann auf eine von vielen wirken, und der
 * Knopf loege ueber seinen Gegenstand. Das ist keine Sparsamkeit, sondern Regel P.
 */

export interface KartenGrunddaten {
  namen: Record<string, string>;
  optionen: AktionsOptionen | null;
  darfPlanAendern: boolean;
  darfFreigabenSehen: boolean;
  darfRoutinenVerwalten: boolean;
  naechsterArbeitstag: string;
  ereignis: VerlaufRow | null;
}

export function kartenGrunddaten(db: DB, akteur: Akteur, heute: string, lage: Lage): KartenGrunddaten {
  const fuehrend = lage.fuehrung.einzeln ? (lage.fuehrung.zeilen[0] ?? null) : null;
  const gesucht = FUEHRUNG_EREIGNIS[lage.fuehrung.art];
  const erste = lage.fuehrung.zeilen[0] ?? null;

  return {
    namen: namenMap(allePersonen(db)),
    optionen: fuehrend === null ? null : aktionsOptionen(fuehrend, akteur, heute),
    // DIESELBEN PRAEDIKATE, DIE DIE ROUTEN UND DIE ACTIONS DURCHSETZEN (§10 Prueffrage 2) — nie
    // eine gleichwertige Nachbildung: `darfRoutinenVerwalten` gatet den Fussverweis, weil
    // `/routinen` sonst `notFound()` wirft, und `darfFreigabenSehen` den Deckel, weil `/freigaben`
    // sonst 404 antwortet.
    darfPlanAendern: darfPlanAendern(akteur, akteur.person.id, heute),
    darfFreigabenSehen: darfFreigabenSehen(akteur, heute),
    darfRoutinenVerwalten: darfRoutinenVerwalten(akteur, heute),
    naechsterArbeitstag: naechsterArbeitstag(heute),
    // DIE VERLAUFSZEILE WIRD NUR GELESEN, WENN DER ANLASS SIE BRAUCHT — sonst waere es eine
    // Abfrage je Seitenaufruf fuer eine Angabe, die niemand zeigt.
    ereignis: gesucht === undefined || erste === null ? null : letztesEreignis(db, erste.id, gesucht),
  };
}
