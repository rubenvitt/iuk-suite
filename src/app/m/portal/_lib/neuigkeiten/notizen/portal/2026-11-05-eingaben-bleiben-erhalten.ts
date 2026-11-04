// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "eingaben-bleiben-erhalten",
  datum: "2026-11-05",
  titel: "Eingaben bleiben erhalten",
  inhalt: [
    absatz(
      "Was du in einen Check, eine Prüfung, eine Meldung oder ein Formular eingibst, bleibt auf deinem Gerät, " +
        "bis es angekommen ist. Lädt die Seite neu oder ist die Verbindung weg, steht „Eingaben wiederhergestellt“ " +
        "da. Steht dort „Nicht gesendet“, geht es von selbst noch einmal raus.",
    ),
  ],
};

export default notiz;
