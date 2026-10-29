// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Einsatzbuch-Verwaltung (switcherGroupSources: ["access"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "anleitung-fuer-den-rechner",
  datum: "2026-10-29",
  titel: "Anleitung für den Einsatzbuch-Rechner",
  inhalt: [
    absatz(
      "Unter Rechner lädst du mit Anleitung für den Rechner (PDF) zwei A4-Blätter herunter, die du neben den Rechner legen kannst. " +
        "Sie zeigen mit Bildern der Desktop-App, wie man einen Einsatz erfasst, in der Frist korrigiert und versiegelt.",
    ),
  ],
};

export default notiz;
