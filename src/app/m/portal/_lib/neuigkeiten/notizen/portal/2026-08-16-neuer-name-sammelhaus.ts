// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "neuer-name-sammelhaus",
  datum: "2026-08-16",
  titel: "Die Suite heißt jetzt Sammelhaus",
  inhalt: [
    absatz(
      "Aus „I&K Suite“ ist „Sammelhaus“ geworden. Geändert hat sich der Name auf den Köpfen der " +
        "Seiten; Adressen, Lesezeichen, Anmeldung und Daten bleiben, wie sie waren.",
    ),
  ],
};

export default notiz;
