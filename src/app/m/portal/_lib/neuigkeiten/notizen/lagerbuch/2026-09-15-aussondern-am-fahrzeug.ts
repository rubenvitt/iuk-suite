// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "aussondern-am-fahrzeug",
  datum: "2026-09-15",
  titel: "Abgelaufenes einzeln aussondern",
  inhalt: [
    absatz(
      "Auf dem Blatt einer Einheit sonderst du abgelaufenes Material jetzt einzeln aus, ohne " +
        "einen ganzen Check zu fahren. In der Verfallstabelle steht je Artikel „aussondern“: " +
        "du gibst die Menge an, bei Bedarf die Charge, und trägst das Verfallsdatum ein, das " +
        "danach noch dort auf einer Packung steht.",
    ),
  ],
};

export default notiz;
