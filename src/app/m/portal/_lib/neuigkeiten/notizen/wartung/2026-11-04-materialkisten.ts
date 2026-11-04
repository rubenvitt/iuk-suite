// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "wartung",
  slug: "materialkisten",
  datum: "2026-11-04",
  titel: "Materialkisten mit Inhaltsliste",
  inhalt: [
    absatz(
      "In der Gerätewartung gibt es jetzt Materialkisten. " +
        "Als Verwalter erfasst du am Telefon, was in welcher Menge in der Kiste liegt, und druckst unter QR-Etiketten ein Etikett mit Inhaltsliste zum Aufkleben.",
    ),
    absatz("Bei der Prüfung zählst du die Kiste durch. Was fehlt, wird als Mangel gemeldet und steht unter Was steht an."),
  ],
};

export default notiz;
