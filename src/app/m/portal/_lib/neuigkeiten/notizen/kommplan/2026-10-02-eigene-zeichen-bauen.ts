// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "eigene-zeichen-bauen",
  datum: "2026-10-02",
  titel: "Eigene taktische Zeichen bauen",
  inhalt: [
    absatz(
      "Fehlt dir ein Zeichen, etwa für deine Leitstelle, baust du es mit Bearbeitungsrecht unter „Bibliothek“ im Reiter „Zeichen“: " +
        "Grundzeichen, Organisation und Beschriftung wählen, Namen geben, speichern. " +
        "Du findest es dann in der Zeichensuche jedes Plans; änderst du es, ändert es sich in allen Plänen mit.",
    ),
  ],
};

export default notiz;
