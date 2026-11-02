// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "unterkunft",
  slug: "berechnung-drucken",
  datum: "2026-11-03",
  titel: "Berechnung drucken",
  inhalt: [
    absatz(
      "Im Unterkunftsrechner druckst du das Ergebnis über Drucken als A4-Blatt. Darauf stehen deine Eingaben, der ganze Bedarf mit einer leeren Spalte Ist zum Abhaken und Felder für Einsatz, Objekt und deinen Namen zum Ausfüllen von Hand.",
    ),
  ],
};

export default notiz;
