// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "verfall-in-der-box",
  datum: "2026-09-16",
  titel: "Gemeldeter Verfall wandert in die Entnahmebox mit",
  inhalt: [
    absatz(
      "Ein Verfallsdatum, das du beim Check gemeldet hast, steht jetzt auch in der " +
        "Entnahmebox, wenn das Material dorthin wandert — unter „Entnahmebox“ in der " +
        "Spalte „Gemeldet“ und am Telefon als Chip an der Zeile. An der leergeräumten " +
        "Einheit verschwindet die Angabe, sobald das letzte Stück heraus ist.",
    ),
    absatz(
      "Unter „Verwaltung → Verfall“ steht die Entnahmebox deshalb in derselben Liste wie " +
        "Fahrzeuge und Taschen. Der Umschalter dort heißt jetzt „nach Ort“ statt " +
        "„nach Einheit“.",
    ),
  ],
};

export default notiz;
