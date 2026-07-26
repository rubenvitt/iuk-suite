/**
 * LEITET DER EINSTIEG DIESEN NUTZER DURCH? — genau eine Stelle.
 *
 * Zwei Seiten brauchen dieselbe Antwort, und eine abweichende Antwort ergibt
 * eine Navigationsschleife:
 *
 * - Der Einstieg `/m/feedback` leitet bei **genau einer zugänglichen Gruppe UND
 *   kein Voll-Admin** per `redirect` ins Cockpit (§3.1, 0 Klicks). Die
 *   Admin-Ausnahme ist nötig, sonst käme ein Admin mit einer Gruppe nie an
 *   „Gruppenvergleich" und „+ Neue Gruppe".
 * - Das Cockpit trägt **genau dann keine Breadcrumb** (§4.1): der Wurzelpunkt
 *   „Gruppen" zeigte auf den Einstieg, der sofort wieder hierher leitet. Für den
 *   häufigsten Nutzer des Moduls — Gruppenleiter, kein Voll-Admin, eine Gruppe —
 *   wäre der Krümel garantiert ein Weg zurück auf die Seite, auf der er steht.
 *
 * Deshalb entscheidet **diese** Funktion beides, aus derselben Eingabe: dem
 * Ergebnis von `accessibleGroupFilter` und `isFeedbackAdmin`. Zwei getrennte
 * Prädikate wären zwei Wahrheiten, und die Schleife entstünde beim ersten
 * Auseinanderlaufen — ohne dass ein Test sie fände, weil jede Seite für sich
 * richtig bliebe.
 *
 * Rückgabe ist die Ziel-Gruppen-ID (nicht `boolean`): der Einstieg braucht sie
 * für den `redirect`, das Cockpit prüft nur auf `!== null`. Damit gibt es auch
 * keine zweite Herleitung des Ziels.
 *
 * Warum `filter.length` als Zahl der zugänglichen Gruppen genügt: `user_groups`
 * hängt mit `ON DELETE cascade` an `groups` (Migration 0000), und die aus dem
 * Fachgruppen-Claim aufgelösten IDs kommen aus einem `select` auf `groups` —
 * eine ID in `memberIds` ohne Gruppe kann es also nicht geben.
 */
export function einstiegZiel(filter: "all" | number[], istAdmin: boolean): number | null {
  // Voll-Admin sieht „all": beide Bedingungen prüfen, weil `accessibleGroupFilter`
  // und `isFeedbackAdmin` unabhängige Funktionen sind und ein künftiges „all" für
  // eine andere Rolle sonst stillschweigend zum Redirect führte.
  if (istAdmin || filter === "all") return null;
  return filter.length === 1 ? filter[0] : null;
}
