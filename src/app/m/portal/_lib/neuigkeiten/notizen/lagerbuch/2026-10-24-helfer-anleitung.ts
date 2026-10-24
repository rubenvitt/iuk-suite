// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "helfer-anleitung",
  datum: "2026-10-24",
  titel: "Anleitung für Helfer zum Aushängen",
  inhalt: [
    absatz(
      "Unter Verwaltung → Ortsetiketten lädst du mit Helfer-Anleitung (PDF) drei A4-Blätter zum Aushängen herunter. " +
        "Sie zeigen mit Bildern vom Handy, wie Helfer Material entnehmen, in die Entnahmebox zurücklegen und den Fahrzeugcheck machen.",
    ),
  ],
};

export default notiz;
