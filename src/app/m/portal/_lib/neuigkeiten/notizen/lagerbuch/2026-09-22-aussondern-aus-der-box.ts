// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "aussondern-aus-der-box",
  datum: "2026-09-22",
  titel: "Abgelaufenes direkt aus der Entnahmebox aussondern",
  inhalt: [
    absatz(
      "Unter „Aus der Entnahmebox einräumen“ wählst du je Artikel jetzt, ob er zurück ins " +
        "Handlager geht oder ausgesondert wird. Zum Aussondern gibst du Charge, Menge und " +
        "einen Grund an. Stillgelegte Artikel kannst du dort nur noch aussondern.",
    ),
  ],
};

export default notiz;
