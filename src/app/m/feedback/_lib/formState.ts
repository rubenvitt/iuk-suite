/**
 * DER EINHEITLICHE RÜCKGABETYP DER FORMULAR-ACTIONS (Entwurf §4.4).
 *
 * Warum überhaupt ein Rückgabetyp: `throw` kann keinen Feldfehler transportieren.
 * Eine geworfene Ausnahme landet auf der technischen Fehlerseite — und nimmt die
 * Eingaben mit. Genau das ist im Modul `feedback` der teuerste Fehler, den die
 * Oberfläche machen kann: der Nutzer ist Ehrenamtlicher, kommt einmal pro Woche
 * für zwei Minuten, und wenn sein Datum und sein Thema weg sind, hört er auf.
 *
 * `values` trägt die eingetippten Werte zurück, damit `defaultValue` sie wieder
 * einsetzen kann. `fieldErrors` ist auf Feldnamen geschlüsselt (`name`-Attribut),
 * weil die Meldung im `useActionState`-Muster ohne `Form.Item` von Hand am Feld
 * gerendert wird (§4.4 verzichtet bewusst auf `Form`).
 *
 * ZUGRIFFSVERLETZUNGEN GEHÖREN NICHT HIERHER: `assertGroupAccess` wirft weiter.
 * Das ist kein Feldfehler, sondern ein Angriff, und eine gerenderte Meldung
 * „darfst du nicht" wäre eine Auskunft über fremde Datenbestände.
 */
export type FormState =
  | { ok: true }
  | { ok: false; fieldErrors: Record<string, string>; values: Record<string, string> };

/** Startwert für `useActionState` — vor dem ersten Absenden gibt es keinen Fehler. */
export const FORM_START: FormState = { ok: true };

/** Feldwert aus dem Zustand oder die Vorbelegung — nie `undefined` im `value`. */
export function feldWert(state: FormState, feld: string, vorbelegung: string): string {
  return state.ok ? vorbelegung : (state.values[feld] ?? "");
}

/** Fehlermeldung zu einem Feld, wenn es eine gibt. */
export function feldFehler(state: FormState, feld: string): string | undefined {
  return state.ok ? undefined : state.fieldErrors[feld];
}
