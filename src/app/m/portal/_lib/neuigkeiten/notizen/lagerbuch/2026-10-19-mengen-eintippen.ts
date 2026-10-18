// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "mengen-eintippen",
  datum: "2026-10-19",
  titel: "Im Check die Menge eintippen",
  inhalt: [
    absatz(
      "Beim Check tippst du im Schritt „Zählen“ die gefundene Menge direkt ins Feld; „+“ und " +
        "„−“ bleiben. Ein leeres Fach bestätigst du mit 0. Unten läuft mit, wie viele Positionen " +
        "gezählt sind, und „Nächste offene“ springt zur ersten Zeile, die noch fehlt.",
    ),
    absatz(
      "Das Verfallsdatum öffnest du über „Verfall angeben“ an der Zeile; ein schon erfasstes " +
        "Datum steht dort weiter sichtbar.",
    ),
  ],
};

export default notiz;
