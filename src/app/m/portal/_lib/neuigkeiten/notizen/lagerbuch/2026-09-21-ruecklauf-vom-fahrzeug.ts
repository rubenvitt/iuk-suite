// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "ruecklauf-vom-fahrzeug",
  datum: "2026-09-21",
  titel: "Material vom Fahrzeug zurück in einen Schrank",
  inhalt: [
    absatz(
      "Auf dem Blatt eines Fahrzeugs oder einer Tasche gibt es je Artikel „zurückbuchen“: du " +
        "wählst Charge, Menge und den Schrank im Handlager. Die Charge bleibt dabei dieselbe. " +
        "Der Weg über die Entnahmebox bleibt für alle ohne Anmeldung bestehen.",
    ),
  ],
};

export default notiz;
