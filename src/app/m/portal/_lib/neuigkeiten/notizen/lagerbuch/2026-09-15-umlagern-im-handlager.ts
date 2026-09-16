// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "umlagern-im-handlager",
  datum: "2026-09-15",
  titel: "Material zwischen Schränken umlagern",
  inhalt: [
    absatz(
      "In den Artikeldetails gibt es den Abschnitt „Umlagern im Handlager“: du wählst die " +
        "Charge, den Schrank, aus dem sie kommt, den Schrank, in den sie geht, und die Menge. " +
        "Der Gesamtbestand ändert sich dabei nicht, nur der Ort.",
    ),
    absatz(
      "Im Journal steht jetzt zu jeder Buchung die Spalte „Ort“. Eine Umlagerung erkennst du " +
        "daran an zwei Zeilen: der Schrank, aus dem die Menge abgeht, und der, in dem sie ankommt.",
    ),
  ],
};

export default notiz;
