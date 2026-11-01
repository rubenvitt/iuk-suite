// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "unterkunft",
  slug: "unterkunft-und-zelte-berechnen",
  datum: "2026-11-01",
  titel: "Unterkunft und Zelte berechnen",
  inhalt: [
    absatz(
      "In der neuen App Unterkunftsrechner gibst du Personen, Räume, Fläche oder einen Zeltbestand ein und siehst sofort, was die Unterbringung braucht: Feldbetten, Zelte, Toiletten, Wasser, Krankenbetten und Biergarnituren. Unter Richtwerte steht zu jedem Wert, woher er kommt; Werte ohne Quelle sind als Annahme markiert.",
    ),
  ],
};

export default notiz;
