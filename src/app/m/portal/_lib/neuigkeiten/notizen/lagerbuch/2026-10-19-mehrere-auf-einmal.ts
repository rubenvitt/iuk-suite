// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "mehrere-auf-einmal",
  datum: "2026-10-19",
  titel: "Bestellen und Aussondern für mehrere auf einmal",
  inhalt: [
    absatz(
      "Unter Verwaltung → Bestellung kreuzt du die Zeilen an und markierst sie mit „Als bestellt markieren“ in einem Schritt; " +
        "so nimmst du auch eine Markierung zurück. " +
        "Unter Verwaltung → Verfall kreuzt du abgelaufene Chargen an und sonderst sie mit „Ausgewählte aussondern“ nach einer einzigen Rückfrage aus.",
    ),
  ],
};

export default notiz;
