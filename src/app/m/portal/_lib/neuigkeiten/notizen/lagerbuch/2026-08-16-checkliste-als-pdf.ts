// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "checkliste-als-pdf",
  datum: "2026-08-16",
  titel: "Fahrzeug-Checklisten als PDF",
  inhalt: [
    absatz(
      "Unter Verwaltung → Checklisten steht neben „Drucken“ jetzt „PDF“. Die Datei sieht auf " +
        "jedem Gerät gleich aus, lässt sich ablegen und weiterschicken — anders als der " +
        "Druckdialog, der je nach Browser ein anderes Blatt liefert und auf dem Telefon oft " +
        "gar keines.",
    ),
  ],
};

export default notiz;
