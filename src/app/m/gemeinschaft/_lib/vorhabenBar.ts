/**
 * Die Belegung der Bar aus Sicht der Planung: was beim Schalter „Bar belegen“ eines Events im Weg steht.
 * Rein (ohne Datenbank), damit das Formular im Browser dieselbe Antwort zeigt, die der Server beim
 * Speichern gibt. Die Vermietung selbst (Anfragen, Sperrzeiten) gehört nicht hierher; gelesen wird sie in
 * `vorhaben.ts` (`barBelegung`) mit eigener kleiner Abfrage.
 */

/**
 * - `sperre`: Sperrzeit der Vermietung
 * - `zugesagt`: zugesagte Anmietung
 * - `angefragt`: offene Anfrage (gilt öffentlich als frei, ist hier nur ein Hinweis)
 * - `event`: ein anderes Event mit „Bar belegen“ (in der Vermietung eine abgeleitete Sperrzeit)
 */
export type BarArt = "sperre" | "zugesagt" | "angefragt" | "event";

export type BarEintrag = { id: string; art: BarArt; von: number; bis: number; titel: string };

export type BarKonflikte = { hart: BarEintrag[]; hinweis: BarEintrag[] };

const ueberlappt = (a: { von: number; bis: number }, b: { von: number; bis: number }) => a.von < b.bis && b.von < a.bis;

/**
 * Was sich mit dem Zeitraum `entwurf` überschneidet. `hart` (Sperrzeit, Zusage, anderes Bar-Event) blockiert
 * das Speichern; `hinweis` (offene Anfragen) nicht — die lehnt die Leitung danach mit Begründung ab.
 * `eigenesEvent` ist das gerade bearbeitete Event, das sich nicht selbst im Weg steht.
 */
export function barKonflikte(eintraege: readonly BarEintrag[], entwurf: { von: number; bis: number }, eigenesEvent?: string | null): BarKonflikte {
  const treffer = eintraege.filter((e) => !(e.art === "event" && e.id === eigenesEvent) && ueberlappt(e, entwurf)).sort((a, b) => a.von - b.von);
  return { hart: treffer.filter((e) => e.art !== "angefragt"), hinweis: treffer.filter((e) => e.art === "angefragt") };
}

/** Kurze Beschreibung eines Konflikts für Meldung und Flyin. */
export function barKonfliktName(e: BarEintrag): string {
  switch (e.art) {
    case "sperre": return `Sperrzeit „${e.titel}“`;
    case "zugesagt": return `Zusage „${e.titel}“`;
    case "angefragt": return `Anfrage „${e.titel}“`;
    case "event": return `Event „${e.titel}“`;
  }
}
