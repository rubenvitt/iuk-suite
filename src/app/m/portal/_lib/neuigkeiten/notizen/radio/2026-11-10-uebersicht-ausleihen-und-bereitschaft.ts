// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "uebersicht-ausleihen-und-bereitschaft",
  datum: "2026-11-10",
  titel: "Übersicht zeigt Ausleihen und nicht einsatzbereite Geräte",
  inhalt: [
    absatz(
      "Die Übersicht der Funkgeräte-Verwaltung zeigt jetzt, welche Geräte gerade ausgeliehen sind und von wem, und welche nicht einsatzbereit sind. " +
        "In der Ausleihe heißen die Filter wie die Geräte selbst: „Verfügbar“ und „Ausgeliehen“.",
    ),
  ],
};

export default notiz;
