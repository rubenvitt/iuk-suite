// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "demo-check",
  datum: "2026-10-17",
  titel: "Demo-Check zum Ausprobieren",
  inhalt: [
    absatz(
      "Unter Verwaltung → Vorlagen schaltest du im Abschnitt „Demo-Check“ eine Probefahrt des Fahrzeug-Checks " +
        "ein: Du wählst eine Vorlage, und jede Person kann den Check über die angezeigte Adresse oder den QR-Code " +
        "ohne Code ausprobieren. Es wird nichts gespeichert, und das Demo-Fahrzeug erscheint nirgends sonst.",
    ),
  ],
};

export default notiz;
