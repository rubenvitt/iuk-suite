/**
 * DRK-297 — die Orte als Stammdaten. Kein "use client", kein Icon-Import.
 *
 * ⚠️ `lagerorte` IST WINZIG (heute eine Handvoll Zeilen). Diese Datei laedt sie
 * absichtlich vollstaendig und rechnet in JS weiter, statt je Frage eine
 * Abfrage zu fahren — dasselbe Muster wie `ortStamm` es fuer die Anzeige
 * braucht. Wer hier spaeter optimiert, optimiert das Falsche.
 */
import { lagerorte } from "../../_db/schema";
import { teilbaum, type Lagerbereich, type OrtZeile } from "../domain/orte";
import { eindeutigeLabels, zaehlOrtLabel } from "../inventurOrt";
import { HANDLAGER_ID, istEntnahmebox, type Einheitenart } from "../konstanten";
import type { Leser } from "./bestand";

export type OrtStammZeile = {
  id: string;
  name: string;
  kennung: string | null;
  zugangshinweis: string | null;
  sortierung: number;
  parentId: string | null;
  typ: "lager" | "fahrzeug";
  /** DRK-309: Der Stamm traegt die Art, damit jede Anzeige daraus dieselbe
   *  Zeile bauen kann (`standortZeile`). */
  einheitenart: Einheitenart | null;
  aktiv: boolean;
};

function alleOrte(db: Leser): OrtStammZeile[] {
  return db.select().from(lagerorte).all().map((o) => ({
    id: o.id, name: o.name, kennung: o.kennung, zugangshinweis: o.zugangshinweis,
    sortierung: o.sortierung, parentId: o.parentId, typ: o.typ,
    einheitenart: o.einheitenart, aktiv: o.aktiv,
  }));
}

/**
 * Der Handlager und seine Schraenke — der Bereich, den JEDE bisher
 * handlager-gescopte Abfrage meint.
 *
 * ⚠️ STILLGELEGTE SCHRAENKE SIND DABEI. Bestand an einem inaktiven Ort zaehlt
 * weiter und wird weiter entnommen; alles andere liesse Material beim Umraeumen
 * verschwinden. „Inaktiv" heisst allein: taucht in der Zugangsauswahl nicht
 * mehr auf.
 */
export function handlagerOrte(db: Leser): Lagerbereich {
  return teilbaum(baumZeilen(db), HANDLAGER_ID);
}

/**
 * Die Zeilen, aus denen der HANDLAGER-BAUM gerechnet wird.
 *
 * ⚠️ DIE ENTNAHMEBOX FAELLT HIER RAUS, UND ZWAR NICHT AUS VORSICHT
 * (Codex-Review zu PR #175). Migration 0011 haengt sie NEBEN den Handlager
 * (`parent_id IS NULL`) — das ist die ganze Entscheidung von DRK-314, und der
 * Grund steht bei `ENTNAHMEBOX_ID`: alles unter `HANDLAGER_ID` zaehlt sofort
 * als Handlagerbestand, in den Bestellvorschlag, in die Verfallsliste, in die
 * FEFO-Verteilung jeder Entnahme.
 *
 * Diese Zusage hing aber allein am Wert in der Migration, und die schreibt
 * `INSERT OR IGNORE`: liegt in einer importierten Datenbank schon eine Zeile
 * `entnahmebox`, bleibt sie unangetastet — samt ihres `parent_id`. Damit waere
 * die Box eingehaengt, jede Abgabe zaehlte doppelt, und eine Helferin am Regal
 * bekaeme Material angeboten, das ungeprueft in einer Kiste liegt. Nichts
 * daran waere zu sehen: die Zahlen stimmen ja, sie meinen nur etwas anderes.
 *
 * ⚠️ VOR dem Baum und nicht danach, damit auch ein Teilbaum UNTER der Box
 * unerreichbar wird: nur zu filtern, was `teilbaum` zurueckgibt, liesse ihre
 * Kinder drin. Und lieber hier als in einem Riegel je Schreibpfad — die Frage
 * „was ist Handlager?" hat genau eine Antwort, und das ist diese Funktion.
 */
function baumZeilen(db: Leser): OrtZeile[] {
  return alleOrte(db)
    .filter((o) => !istEntnahmebox(o.id))
    .map((o) => ({ id: o.id, parentId: o.parentId, sortierung: o.sortierung }));
}

/** Die Schraenke OHNE die Wurzel — fuer Auswahllisten und die Verwaltung. */
export function handlagerSchraenke(db: Leser, nurAktive = false): OrtStammZeile[] {
  const stamm = ortStamm(db);
  return handlagerOrte(db)
    .filter((id) => id !== HANDLAGER_ID)
    .map((id) => stamm.get(id))
    .filter((o): o is OrtStammZeile => o !== undefined && (!nurAktive || o.aktiv));
}

/** Jeder Ort nach `id` — Name, Hinweis und Reihenfolge fuer die Anzeige. */
export function ortStamm(db: Leser): Map<string, OrtStammZeile> {
  return new Map(alleOrte(db).map((o) => [o.id, o]));
}

/**
 * DRK-337 — DER BEREICH EINER ZAEHLUNG. Drei Faelle, und der Unterschied
 * zwischen den ersten beiden ist genau der Punkt des Tickets:
 *
 *   `null`         → der GANZE Handlager (Wurzel plus Schraenke) — das Verhalten
 *                    vor DRK-337 und weiterhin die Vorgabe.
 *   `HANDLAGER_ID` → NUR die Wurzel, also „im Handlager, Schrank noch nicht
 *                    zugeordnet" (Migration 0008). Das ist eine eigene Zaehlung,
 *                    keine Teilmenge, die man nebenbei miterledigt.
 *   `<schrankId>`  → dieser Schrank. Ueber `teilbaum`, nicht `[id]`: Schraenke
 *                    haben heute keine Kinder, aber ein spaeter eingehaengter Ort
 *                    fiele sonst still aus der Zaehlung — dieselbe Begruendung,
 *                    aus der `teilbaum` ueberhaupt beliebig tief absteigt.
 *
 * ⚠️ `null` HEISST HIER ZWEIERLEI, UND NUR AN EINER STELLE: als EINGABE „kein
 * Ort gewaehlt", als RUECKGABE „diesen Ort gibt es im Handlager nicht". Die
 * Rueckgabe ist NIE eine leere Liste — die ginge in `inArray` und machte daraus
 * `WHERE false`, also still ueberall Bestand 0 (Kopf von `domain/orte.ts`). Der
 * Aufrufer entscheidet: die Seite faellt auf den ganzen Handlager zurueck (wie
 * `checks/page.tsx` mit einem unbekannten Fahrzeug), die Action weist ab.
 */
export function zaehlBereich(db: Leser, ortId: string | null): Lagerbereich | null {
  const zeilen = baumZeilen(db);
  const handlager = teilbaum(zeilen, HANDLAGER_ID);
  if (ortId === null) return handlager;
  if (!handlager.includes(ortId)) return null;
  // DRK-354 — `teilbaum(..., { ohneKinder: true })` statt `[HANDLAGER_ID]`:
  // dasselbe Ergebnis, aber die Marke bleibt bei ihrem einzigen Erzeuger.
  return ortId === HANDLAGER_ID
    ? teilbaum(zeilen, HANDLAGER_ID, { ohneKinder: true })
    : teilbaum(zeilen, ortId);
}

/**
 * DRK-337 — WOHIN EIN GESPEICHERTER ORTSNAME HEUTE ZEIGT (fuenfter Codex-Befund).
 *
 * Der Verlauf zeigt den Namen, den ein Lauf DAMALS trug; die Orte aendern sich
 * weiter. Die Frage ist deshalb nicht „gibt es den Namen heute doppelt?",
 * sondern die schaerfere: **loest dieser Name heute noch eindeutig auf GENAU
 * DIESEN Ort auf?**
 *
 * ⚠️ WARUM DIE ERSTE FASSUNG ZU SCHWACH WAR: hiessen zwei Schraenke `a` und `b`
 * beide „X", als ihre Laeufe entstanden, und wird `b` spaeter in „Y"
 * umbenannt, gibt es „X" heute nur noch einmal — ein blosser Doppel-Test
 * schwiege, und BEIDE Altlaeufe stuenden wieder als „Ort X" da, obwohl sie
 * verschiedene Orte meinen. Die Karte hier beantwortet auch diesen Fall: fuer
 * den Lauf von `b` zeigt „X" auf `a`, also nicht auf ihn.
 *
 * `null` heisst „mehrere Orte tragen diesen Namen", ein fehlender Schluessel
 * „diesen Namen traegt heute keiner" (umbenannt oder geloescht). Beide Male
 * traegt der Name nicht mehr allein, und die Kennung gehoert daneben.
 *
 * ⚠️ DIESELBE MENGE WIE IN DER AUSWAHL, also Wurzel UND Schraenke ueber
 * `zaehlOrtLabel`: ein Schrank namens „Nicht zugeordnet" kollidiert mit der
 * Wurzel, und diese Richtung faellt sonst durch.
 */
export function ortNamensaufloesung(db: Leser): Map<string, string | null> {
  const orte = [
    { id: HANDLAGER_ID, label: zaehlOrtLabel(HANDLAGER_ID, undefined) },
    ...handlagerSchraenke(db).map((o) => ({ id: o.id, label: zaehlOrtLabel(o.id, o.name) })),
  ];
  const karte = new Map<string, string | null>();
  for (const o of orte) karte.set(o.label, karte.has(o.label) ? null : o.id);
  return karte;
}

/**
 * DRK-313 — DIE BESCHRIFTUNG DER HANDLAGER-WURZEL ALS ZUGANGSZIEL.
 *
 * ⚠️ NICHT `ZAEHLORT_WURZEL_LABEL` („Nicht zugeordnet"), obwohl beide denselben
 * Ort meinen. Eine Zaehlung fragt „was liegt hier?", ein Zugang fragt „wohin
 * lege ich es?" — und auf die zweite Frage ist „Nicht zugeordnet" keine
 * Antwort, sondern eine Zustandsbeschreibung. Die Wurzel ist als Ziel eine
 * bewusste Wahl („ich weiss den Schrank noch nicht"), und der Satz muss das
 * sagen, sonst waehlt niemand sie absichtlich.
 */
export const ZUGANGSZIEL_WURZEL_LABEL = "Handlager (ohne Schrank)";

/**
 * DRK-313 — DIE WAEHLBAREN ZIELE EINES ZUGANGS: die Wurzel plus die AKTIVEN
 * Schraenke.
 *
 * ⚠️ SIE IST NICHT `handlagerSchraenke` MIT EINEM EINTRAG DAVOR, auch wenn sie
 * so aussieht. Der Unterschied ist `nurAktive`: ein stillgelegter Schrank
 * bleibt Bestandsort und bleibt Quelle einer Umlagerung — genau dafuer legt man
 * ihn still —, aber er nimmt nichts mehr auf. Wer die Liste an einer zweiten
 * Stelle neu baut, vergisst das Flag irgendwann an einer davon, und der Fehler
 * ist still: der Zugang GELINGT, er landet nur an einem Ort, den die Verwaltung
 * gerade leerraeumt.
 *
 * Zwei Aufrufer, und das ist der Grund, warum sie hier steht statt an einem von
 * beiden: der Artikel-Drawer der Verwaltung (`_actions/detail.ts`) und die
 * Auffuellansicht (`auffuellen/[artikelId]`). Zwei Schreibweisen fuer dieselbe
 * Auswahl liessen die beiden Flaechen verschiedene Orte anbieten.
 */
export function zugangsZiele(
  db: Leser,
): { id: string; name: string; zugangshinweis: string | null }[] {
  const roh = [
    { id: HANDLAGER_ID, name: ZUGANGSZIEL_WURZEL_LABEL, zugangshinweis: null },
    ...handlagerSchraenke(db, true).map((o) => ({
      id: o.id,
      name: o.name,
      zugangshinweis: o.zugangshinweis,
    })),
  ];

  /*
   * ⚠️ DIE WURZEL KANN MIT EINEM SCHRANK KOLLIDIEREN, und NUR sie.
   * `idx_lagerorte_name_je_parent` (DRK-367) haelt zwei Schraenke unter dem
   * Handlager auseinander — aber ausdruecklich nur Kinder (`parent_id IS NOT
   * NULL`), und die Wurzel traegt `parent_id IS NULL`. Ein Schrank, den jemand
   * „Handlager (ohne Schrank)" nennt, steht in dieser Liste also zweimal
   * gleich da.
   *
   * ⚠️ WAS DARAN TEUER IST, IST NICHT DIE OPTIK: der Klick trifft ueber die
   * `id` weiterhin die richtige Zeile — die Person erfaehrt nur nicht, welche.
   * Sie buchte den Wareneingang dann in dem Glauben, ihn einzusortieren,
   * waehrend er auf der Wurzel landet (oder umgekehrt), und der Bestand ist
   * danach am falschen Ort. Dieselbe Klasse und dieselbe Abhilfe wie bei den
   * Zaehlorten (`eindeutigeLabels`, DRK-337) und bei den Einheiten
   * (`einheitLabels`, DRK-309) — deshalb wird sie hier benutzt und nicht ein
   * drittes Mal nachgebaut.
   */
  // `schluessel` ist die rohe Kennung, wie im Verlauf und in der Verfallsliste
  // (DRK-371) — nicht der Auswahlwert der Inventur.
  const eindeutig = eindeutigeLabels(roh.map((o) => ({ schluessel: o.id, label: o.name })));
  return roh.map((o, i) => ({ ...o, name: eindeutig[i]!.label }));
}
