// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "sauerstoff-wechselhinweis",
  datum: "2026-09-15",
  titel: "Wechselhinweis für Sauerstoffflaschen",
  inhalt: [
    absatz(
      "Jede Sauerstoffflasche sagt jetzt selbst, ab wann sie gewechselt werden soll. Den Wert " +
        "stellst du unter „Verwaltung → Sauerstoff“ je Flasche ein; voreingestellt sind 25 % " +
        "vom Nennfülldruck. Erreicht eine Flasche ihn, erscheint der Hinweis mit der bar-Zahl, " +
        "die du am Manometer abliest.",
    ),
  ],
};

export default notiz;
