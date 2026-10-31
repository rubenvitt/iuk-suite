// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "was-steht-an",
  datum: "2026-10-31",
  titel: "Was steht an",
  inhalt: [
    absatz(
      "Verwaltest du das Lagerbuch oder die Funkgeräte, zeigt dir die Startseite jetzt „Was steht an“: " +
        "abgelaufenes Material, Sauerstoff zum Wechseln, fällige BZ-Kontrollen, offene Plomben und lange " +
        "ausgeliehene Funkgeräte an einer Stelle. Dort wählst du auch, was dir montags aufs Telefon kommt.",
    ),
  ],
};

export default notiz;
