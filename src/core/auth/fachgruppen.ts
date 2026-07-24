/**
 * Liest die Fachgruppen-Slugs, für die eine Person Gruppenleitung ist, aus dem
 * ID-Token — nach demselben Muster wie `parseGroups` in groups.ts.
 *
 * Die Strenge ist Absicht und sicherheitsrelevant: **nur Arrays** werden
 * akzeptiert. Keine String-Koerzion, kein Zerlegen an Trennzeichen (anders als
 * `parseDevGroups`, das eine Dev-Eingabe zerlegt). Fehlt der Claim oder hat er
 * einen anderen Typ, ist das Ergebnis die LEERE Menge — die Zuordnung degradiert
 * dann auf `user_groups` allein, niemals auf „alle Gruppen".
 */
export function parseFachgruppen(
  source: Record<string, unknown>,
  claim = process.env.POCKET_ID_FACHGRUPPEN_CLAIM ?? "fachgruppen",
): string[] {
  const value = source[claim];
  return Array.isArray(value) ? (value as string[]) : [];
}
