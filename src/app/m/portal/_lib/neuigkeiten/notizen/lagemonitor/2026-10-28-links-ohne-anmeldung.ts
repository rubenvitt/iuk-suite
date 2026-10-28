// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagemonitor",
  slug: "links-ohne-anmeldung",
  datum: "2026-10-28",
  titel: "Den Lagemonitor auch außerhalb des FüKw zeigen",
  inhalt: [
    absatz(
      "Den Lagemonitor gibt es jetzt auch online, für jeden mit Zugang zum Lagemonitor. " +
        "Unter Links für Rechner ohne Anmeldung legst du einen Link an, etwa für den Rechner in der Wache: Wer ihn öffnet, sieht den Monitor ohne Anmeldung, bis du den Link widerrufst.",
    ),
  ],
};

export default notiz;
