// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "neuer-name-sammelhaus",
  datum: "2026-08-16",
  titel: "Die Suite heißt jetzt Sammelhaus",
  inhalt: [
    absatz(
      "Aus „I&K Suite“ ist „Sammelhaus“ geworden. Der alte Name nannte den Fachdienst, der die " +
        "Plattform betreibt, und nicht das, was darin liegt: Lagerbuch, Aufgabenverteilung, " +
        "Rückmeldungen zum Dienstabend, Dateiaustausch, QR-Codes.",
    ),
    absatz(
      "Geändert hat sich der Name und das, was auf den Köpfen der Seiten steht. Adressen, " +
        "Lesezeichen, Anmeldung und Daten bleiben, wie sie waren.",
    ),
    hinweis(
      "Wo dir weiterhin „I&K“ begegnet — etwa in „Bitte beim I&K melden“ —, ist das kein " +
        "übersehener Rest: die Plattform heißt Sammelhaus, der Fachdienst dahinter weiter I&K.",
    ),
  ],
};

export default notiz;
