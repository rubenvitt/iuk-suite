// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "uebersicht-und-springen",
  datum: "2026-11-10",
  titel: "Übersicht mit Mängeln und Fristen, Springen zu Artikeln",
  inhalt: [
    absatz(
      "Die Übersicht der Verwaltung zeigt unter Was steht an jetzt offene Mängel, fällige Geräte, Sauerstoff und " +
        "Checks mit Befund. Entnahme, Auffüllen und Check durchführen stehen im Menü oben unter Am Regal / am " +
        "Fahrzeug, und Springen zu findet auch Artikel, Fahrzeuge und Wörter wie Wareneingang.",
    ),
    absatz(
      "Auf dem Telefon liegen die Filter der Artikelliste hinter Filter, und im Journal holst du ältere Buchungen " +
        "mit Weitere laden.",
    ),
  ],
};

export default notiz;
