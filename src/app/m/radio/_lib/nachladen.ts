// src/app/m/radio/_lib/nachladen.ts
// KEIN "use client" UND KEIN "use server" (Falle 6, `CLAUDE.md`): die Pruefungen hier ruft die
// Server Action, die Antwortform liest die Client-Insel. Aus einem Client-Modul kaeme eine
// Funktion in der Action als Referenz statt als Wert an — HTTP 500, und weder `build` noch
// Vitest saehen es.
import { SUCHPARAMETER_MAX_ZEICHEN } from "./suchparameter";
import type { LeihCursor } from "./lesepfade/ausleihen";
import type { GeraetCursor } from "./lesepfade/geraete";

/**
 * DAS NACHLADEN BEIM SCROLLEN (DRK-335) — die Eingangspruefung der zwei Nachschlag-Actions
 * (`geraeteNachladenAction`, `ausleihenNachladenAction` in `admin/actions.ts`) und die Form
 * ihrer Antwort. Vorbild in jeder Hinsicht: das Journal des Lagerbuchs (DRK-331).
 *
 * ⛔ DIE ACTION BEKOMMT DIE SUCHPARAMETER IN IHRER ADRESSZEILEN-FORM, nicht einen fertigen
 * Filter. Sie faltet sie mit DERSELBEN Funktion wie die Seite (`geraeteParameterAus`,
 * `ausleihenParameterAus`) — so kann der Nachschlag keinen anderen Filter fahren als die erste
 * Portion. Zwei Faltungen liefen beim naechsten Filterfeld auseinander, und die Tabelle
 * blaetterte ab der zweiten Portion durch eine ANDERE Treffermenge.
 *
 * ⛔ EINE ACTION IST VON AUSSEN AUFRUFBAR — die Eingabe ist deshalb `unknown`, bis sie hier
 * durch ist. Der Typ an der Signatur ist eine Zusage an den Aufrufer, keine Pruefung.
 */

/** Die Antwort eines Nachschlags. `gesamt` wird jedes Mal neu gezaehlt, damit die Zahl lebt. */
export type NachladeAntwort<Z, C> =
  | { ok: true; zeilen: Z[]; cursor: C | null; gesamt: number }
  | { ok: false; fehler: string };

/** Mehr Schluessel fuehrt keiner der zwei Vertraege (Geraete: dreizehn, Ausleihen: drei). */
const SCHLUESSEL_MAX = 32;
const NAME_MAX = 64;
/** Eine Kennung ist ein `nanoid()` (21 Zeichen); der Spielraum kostet nichts. */
const KENNUNG_MAX = 64;

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert);
}

/**
 * Die Suchparameter einer Nachschlag-Anfrage — ein flaches Objekt aus Zeichenketten.
 *
 * ⛔ DIE LAENGENGRENZE IST DIESELBE, DIE DIE SEITE BEIM LESEN ANWENDET
 * (`SUCHPARAMETER_MAX_ZEICHEN`). Eine Grenze nur hier liesse die Seite einen Wert annehmen, den
 * jeder Nachschlag abweist (DRK-331, Reviewbefund).
 */
export function parameterLesen(roh: unknown): Record<string, string> | null {
  if (!istObjekt(roh)) return null;
  const eintraege = Object.entries(roh);
  if (eintraege.length > SCHLUESSEL_MAX) return null;
  const parameter: Record<string, string> = {};
  for (const [name, wert] of eintraege) {
    if (name.length > NAME_MAX) return null;
    if (typeof wert !== "string" || wert.length > SUCHPARAMETER_MAX_ZEICHEN) return null;
    parameter[name] = wert;
  }
  return parameter;
}

function kennung(wert: unknown): string | null {
  return typeof wert === "string" && wert.length > 0 && wert.length <= KENNUNG_MAX ? wert : null;
}

/**
 * Die Position der Geraeteliste.
 *
 * ⛔ `wert` WIRD NICHT GEKUERZT UND NICHT IN DER LAENGE BEGRENZT: er ist ein Spalteninhalt,
 * den die Seite selbst geliefert hat. Eine Grenze hier waere wieder eine, die die Seite nicht
 * kennt — ein Geraet mit langem Lagerort liesse das Nachladen an genau dieser Zeile haengen.
 */
export function geraetCursorLesen(roh: unknown): GeraetCursor | null {
  if (!istObjekt(roh)) return null;
  const id = kennung(roh.id);
  if (id === null) return null;
  const { wert } = roh;
  if (wert === null || typeof wert === "string") return { wert, id };
  if (typeof wert === "number" && Number.isFinite(wert)) return { wert, id };
  return null;
}

/** Die Position der Ausleihenliste: Sekundenzahl der Ausleihe und Kennung. */
export function leihCursorLesen(roh: unknown): LeihCursor | null {
  if (!istObjekt(roh)) return null;
  const id = kennung(roh.id);
  if (id === null) return null;
  if (typeof roh.ausgeliehen !== "number" || !Number.isSafeInteger(roh.ausgeliehen)) return null;
  return { ausgeliehen: roh.ausgeliehen, id };
}

/** Feste Saetze statt `e.message` — eine Fehlermeldung des Treibers gehoert nicht in die Flaeche. */
export const GERAETE_NACHLADE_FEHLER = "Weitere Geräte konnten nicht geladen werden.";
export const AUSLEIHEN_NACHLADE_FEHLER = "Weitere Ausleihen konnten nicht geladen werden.";
