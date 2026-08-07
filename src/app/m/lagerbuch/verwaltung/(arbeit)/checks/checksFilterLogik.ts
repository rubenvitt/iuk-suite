/** Der bedingte Beschreibungstext für den begrenzten Historienausschnitt. */
export function deckelText(gezeigt: number, mehrVorhanden: boolean): string {
  return mehrVorhanden
    ? "Neueste 50 von mehr Treffern — Zeitraum eingrenzen"
    : `${gezeigt} Treffer`;
}
