// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "radio",
  slug: "alte-qr-codes-gelten-weiter",
  datum: "2026-08-28",
  titel: "Die alten QR-Codes gelten weiter",
  inhalt: [
    absatz(
      "Der QR-Code, der an den Tablets und im Funkraum hängt, führt wieder direkt in die " +
        "Geräteliste; bis heute zeigte der Scan nur das leere Codefeld. Er ist eine " +
        "Übergangslösung mit festem Enddatum.",
    ),
    hinweis(
      "Ersetze die hängenden Blätter nach und nach durch das Druckblatt aus " +
        "Verwaltung → Zugänge → Druckblatt.",
    ),
  ],
};

export default notiz;
