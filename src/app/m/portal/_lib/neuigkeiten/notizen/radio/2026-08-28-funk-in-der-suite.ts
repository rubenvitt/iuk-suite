// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "funk-in-der-suite",
  datum: "2026-08-28",
  titel: "Ausleihe und Verwaltung der Funkgeräte in einer App",
  inhalt: [
    absatz(
      "Die beiden getrennten Anwendungen sind jetzt eine App in der Suite und stehen als " +
        "„Funkgeräte“ in der Kachelliste. Geräte, Ausleihen, Softwareversionen und Zugangscodes " +
        "sind vollständig übernommen.",
    ),
    absatz(
      "Am Ausleihen ändert sich nichts: die Adresse bleibt, die aufgeklebten QR-Codes gelten " +
        "weiter. In die Verwaltung kommst du über „Zur Verwaltung“ und meldest dich mit " +
        "demselben Konto an wie in den anderen Apps.",
    ),
  ],
};

export default notiz;
