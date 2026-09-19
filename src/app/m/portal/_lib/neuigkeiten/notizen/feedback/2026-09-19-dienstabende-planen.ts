// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zwei Absätze, weil der zweite eine Einschränkung nennt, die man kennen muss:
// Planen ist nicht Starten. Ohne diesen Satz klickt jemand im September zwölf
// Termine zusammen und wartet auf Rückmeldungen, die niemand geben kann.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "feedback",
  slug: "dienstabende-planen",
  datum: "2026-09-19",
  titel: "Dienstabende im Voraus planen",
  inhalt: [
    absatz(
      "Du kannst die Dienstabende eines ganzen Jahres vorab eintragen — einzeln oder als " +
        "Serie, etwa alle zwei Wochen oder monatlich am gleichen Wochentag. Der Weg ist " +
        "„Kommende Abende“ → „Dienstabende planen“.",
    ),
    absatz(
      "Das Feedback startet damit noch nicht. Du gibst es an jedem Abend einzeln frei; ein " +
        "laufendes Feedback wird dabei beendet, denn je Gruppe gibt es nur einen QR-Code. " +
        "Fällt ein Dienst aus, sagst du den Abend ab — er bleibt im Verlauf stehen.",
    ),
  ],
};

export default notiz;
