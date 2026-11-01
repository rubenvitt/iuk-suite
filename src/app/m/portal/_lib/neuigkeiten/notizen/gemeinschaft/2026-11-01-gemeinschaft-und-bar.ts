// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "gemeinschaft",
  slug: "gemeinschaft-und-bar",
  datum: "2026-11-01",
  titel: "Events, Projekte und die Bar an einem Ort",
  inhalt: [
    absatz(
      "In der neuen App Gemeinschaft planst du als Leitung Events und Projekte und verteilst die Aufgaben. " +
        "Mitglieder brauchen kein Konto, jedes hakt seine Aufgaben über einen persönlichen Link ab. " +
        "Die Bar fragst du ohne Anmeldung an, zu- oder absagen geht unter Vermietung.",
    ),
  ],
};

export default notiz;
