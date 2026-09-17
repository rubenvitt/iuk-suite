// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes“.
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "inventur-link-zaehlort",
  datum: "2026-09-16",
  titel: "Gespeicherte Inventur-Links öffnen den ganzen Handlager",
  inhalt: [
    absatz(
      "Ein Link auf die Inventur, den du dir für einen einzelnen Schrank gemerkt hast, öffnet " +
        "jetzt wieder den ganzen Handlager. Oben unter Verwaltung → Inventur steht dann " +
        "„Ganzer Handlager“, und die erwarteten Mengen gelten für alle Schränke zusammen.",
    ),
    hinweis("Prüfe den Zählort oben, bevor du zählst, und merke dir den Link danach neu."),
  ],
};

export default notiz;
