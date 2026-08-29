// 1:1 aus uav-praxis/src/domain/progress.ts.

export type Durchfuehrung = {
  id: string;
  datum: string; // ISO yyyy-mm-dd
  drohnensteuerer: string;
  luftraumbeobachter: string;
};

export type AufgabenFortschritt = {
  zielanzahl: number;
  durchfuehrungen: Durchfuehrung[];
  nichtAnwendbar: boolean;
};

export type AufgabenStatus = "offen" | "erledigt" | "nicht-anwendbar";

export function leererFortschritt(zielanzahl: number): AufgabenFortschritt {
  return { zielanzahl: Math.max(1, zielanzahl), durchfuehrungen: [], nichtAnwendbar: false };
}

export function aufgabenStatus(f: AufgabenFortschritt): AufgabenStatus {
  if (f.nichtAnwendbar) return "nicht-anwendbar";
  return f.durchfuehrungen.length >= f.zielanzahl ? "erledigt" : "offen";
}

export function aufgabenQuote(f: AufgabenFortschritt): number {
  const ziel = Math.max(1, f.zielanzahl);
  return Math.min(1, f.durchfuehrungen.length / ziel);
}

export function gesamtFortschritt(
  map: Record<string, AufgabenFortschritt>,
): { erledigt: number; gesamt: number } {
  const werte = Object.values(map);
  const gesamt = werte.filter((f) => !f.nichtAnwendbar).length;
  const erledigt = werte.filter((f) => aufgabenStatus(f) === "erledigt").length;
  return { erledigt, gesamt };
}
