// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "zu-viel-an-bord",
  datum: "2026-10-19",
  titel: "Zu viel Material beim Check in die Entnahmebox legen",
  inhalt: [
    absatz(
      "In der Soll-Bestückung und unter Verwaltung → Vorlagen kannst du in der Spalte „OK bis“ eintragen, " +
        "wie viel über dem Soll noch in Ordnung ist. " +
        "Liegt beim Check mehr an Bord, zeigt „Nachfüllen“ den Abschnitt „Zu viel an Bord“, " +
        "und was du dort bestätigst, wird in die Entnahmebox gebucht.",
    ),
  ],
};

export default notiz;
