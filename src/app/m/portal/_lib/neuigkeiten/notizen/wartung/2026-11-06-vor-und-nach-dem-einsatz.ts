// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "wartung",
  slug: "vor-und-nach-dem-einsatz",
  datum: "2026-11-06",
  titel: "Prüfen vor und nach dem Einsatz",
  inhalt: [
    absatz(
      "Unter Prüfarten stellst du bei Fällig jetzt auch Vor Verwendung oder Nach Benutzung ein. " +
        "Tippst du am Gerät oder in der Akte auf Wird eingesetzt bzw. Zurück, ist die passende Prüfung fällig, bis jemand sie abhakt. " +
        "Unter Gerätearten wählst du je Punkt der Checkliste, zu welchen Prüfungen er gehört.",
    ),
  ],
};

export default notiz;
