// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagemonitor",
  slug: "lagemonitor-einstellen",
  datum: "2026-10-27",
  titel: "Den Lagemonitor im FüKw einstellen",
  inhalt: [
    absatz(
      "In der neuen App Lagemonitor legst du fest, was der Bildschirm im FüKw zeigt: Standort, Warnregion, ab welcher Warnung das rote Band kommt und welche Teile wie Wetter, Regenradar oder Warngebiete zu sehen sind. " +
        "Die Vorschau daneben zeigt jede Änderung sofort mit Beispieldaten, noch bevor du speicherst.",
    ),
    absatz(
      "Trägst du unter Suchlage den Großbild-Link aus Suchlage ein, zeigt der Monitor während eines laufenden Einsatzes die Flugspuren, die gezeichneten Suchgebiete und das Drohnenbild, das von rechts hereinfährt.",
    ),
  ],
};

export default notiz;
