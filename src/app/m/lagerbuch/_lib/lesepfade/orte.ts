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
import { zaehlOrtLabel } from "../inventurOrt";
import { HANDLAGER_ID, type Einheitenart } from "../konstanten";
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

function baumZeilen(db: Leser): OrtZeile[] {
  return alleOrte(db).map((o) => ({ id: o.id, parentId: o.parentId, sortierung: o.sortierung }));
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
