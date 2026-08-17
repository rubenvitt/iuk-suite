// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "checkliste-als-pdf",
  datum: "2026-08-16",
  titel: "Fahrzeug-Checklisten als PDF",
  inhalt: [
    absatz(
      "Der Checklistenbogen unter Verwaltung → Checklisten ließ sich bisher nur drucken. Neben " +
        "„Drucken“ steht jetzt „PDF“.",
    ),
    absatz(
      "Das ist nicht derselbe Weg mit einem zweiten Knopf: der Druckdialog liefert je nach " +
        "Browser, Betriebssystem und Papierformat ein anderes Blatt, auf dem Telefon oft gar " +
        "keines, und er entsteht nur an dem Rechner, an dem die Seite gerade offen ist. Die " +
        "Datei sieht überall gleich aus, lässt sich ablegen und weiterschicken.",
    ),
    absatz(
      "Im Bogen steht, was auf dem Bildschirm steht: Bestückung je Fach, Geräte mit Kästchen " +
        "für den Zustand, Sauerstoff, dazu Kopfzeile und Unterschrift. Jedes Fahrzeug beginnt " +
        "auf einer neuen Seite, und die Fußzeile zählt die Seiten je Fahrzeug — ein Blatt, das " +
        "aus dem Stapel fällt, findet zurück.",
    ),
    absatz(
      "Blindzählung und die kompakte Form nimmt der Knopf mit. Die Datei enthält damit genau " +
        "das Blatt, das du vor dir hast, und keine zweite Fassung davon.",
    ),
  ],
};

export default notiz;
