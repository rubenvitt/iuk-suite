/**
 * DER EINHEITLICHE RUECKGABETYP DER FORMULAR-ACTIONS (Spec §9.9).
 *
 * Warum ueberhaupt ein Rueckgabetyp: `throw` kann keinen Feldfehler transportieren. Eine geworfene
 * Ausnahme landet auf der technischen Fehlerseite — und nimmt die Eingaben mit. `values` traegt die
 * eingetippten Werte zurueck, damit `defaultValue`/`feldWert` sie wieder einsetzen kann;
 * `fieldErrors` ist auf Feldnamen geschluesselt (`name`-Attribut), weil `useActionState` ohne
 * `Form.Item` die Meldung von Hand am Feld rendert.
 *
 * ZUGRIFFSVERLETZUNGEN GEHOEREN NICHT HIERHER: eine fehlgeschlagene Pruefung aus `_lib/zugang.ts`
 * oder ein abgelehntes `uebergang()`/`anfangsZustand()` wirft weiter. Das ist kein Feldfehler,
 * sondern ein Angriff bzw. ein manipuliertes Formular, und eine gerenderte Meldung „darfst du
 * nicht" waere eine Auskunft ueber fremde Datenbestaende (Aufgabe 9, Spec §9.9).
 *
 * DRITTE AUSPRAEGUNG DIESES MUSTERS IM REPOSITORY — `feedback/_lib/formState.ts` (dieselbe Form)
 * und `files/_ui/ZugangslinksListe.tsx` (`ZugangslinkFormState`, andere Form, anderer Startwert:
 * `files` beginnt mit `{ ok: false }`). Nach der `core`-Regel waere ein dritter Fall der Anlass,
 * nach `src/core` zu heben. WIRD HIER BEWUSST NICHT GETAN: die drei Formen sind heute nicht
 * deckungsgleich, eine Vereinheitlichung zoege zwei laufende Module in einen Umbau, und sie gehoert
 * als eigene Aufgabe mit eigener Begruendung gemacht — nicht nebenbei in einer Aufgabe ueber die
 * Actions eines dritten Moduls. Wer sie angeht, hat mit dieser Datei den dritten belegbaren
 * Nutzniesser.
 *
 * Kein "use client" — Typen und reine Funktionen, gelesen von Server-Actions UND Client-Inseln.
 */
export type FormState =
  | { ok: true }
  | { ok: false; fieldErrors: Record<string, string>; values: Record<string, string> };

/** Startwert fuer `useActionState` — vor dem ersten Absenden gibt es keinen Fehler. */
export const FORM_START: FormState = { ok: true };

/** Feldwert aus dem Zustand oder die Vorbelegung — nie `undefined` im `value`. */
export function feldWert(state: FormState, feld: string, vorbelegung: string): string {
  return state.ok ? vorbelegung : (state.values[feld] ?? "");
}

/** Fehlermeldung zu einem Feld, wenn es eine gibt. */
export function feldFehler(state: FormState, feld: string): string | undefined {
  return state.ok ? undefined : state.fieldErrors[feld];
}
