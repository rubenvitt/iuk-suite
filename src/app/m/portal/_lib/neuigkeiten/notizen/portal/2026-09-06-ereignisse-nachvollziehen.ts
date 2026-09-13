// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "ereignisse-nachvollziehen",
  datum: "2026-09-06",
  titel: "Änderungen und Abrufe nachvollziehen",
  inhalt: [
    absatz(
      "Als Suite-Admin findest du unter Verwaltung → Audit-Log die Änderungen, Anmeldungen und " +
        "Abrufe aus der gesamten Suite, eingrenzbar nach Zeitraum, Modul, Person, Aktion und " +
        "Ergebnis.",
    ),
    absatz(
      "Aufgezeichnet wird ab der Aktivierung; frühere Vorgänge werden nicht nachgetragen. Die " +
        "anonymen Rückmeldungen bleiben anonym.",
    ),
  ],
};

export default notiz;
