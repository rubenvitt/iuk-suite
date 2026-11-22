// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "zaehlen",
  datum: "2026-11-22",
  titel: "Einheiten in der Verwaltung zählen",
  inhalt: [
    absatz(
      "Unter Verwaltung → Fahrzeuge & Taschen kannst du eine Einheit jetzt mit „Zählen“ am Telefon oder Tablet " +
        "durchzählen, Fehlendes auffüllen, Überzähliges zurücklegen und Abgelaufenes aussondern. Plomben, " +
        "Geräte und Sauerstoffflaschen legst du dabei gleich an oder verknüpfst sie. Der Abschluss zählt als Check.",
    ),
  ],
};

export default notiz;
