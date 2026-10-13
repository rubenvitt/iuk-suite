// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "artikelnamen-aendern",
  datum: "2026-10-13",
  titel: "Artikelnamen ändern",
  inhalt: [
    absatz(
      "Du kannst den Namen eines Artikels jetzt nachträglich ändern. Öffne unter „Artikel“ " +
        "den Artikel, klick oben auf den Stift neben dem Namen und bestätige mit Enter. " +
        "Bestand und bisherige Buchungen bleiben erhalten und zeigen dann den neuen Namen.",
    ),
  ],
};

export default notiz;
