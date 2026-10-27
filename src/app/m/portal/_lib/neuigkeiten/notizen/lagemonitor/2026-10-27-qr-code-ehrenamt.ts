// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagemonitor",
  slug: "qr-code-ehrenamt",
  datum: "2026-10-27",
  titel: "QR-Code fürs Ehrenamt am Lagemonitor",
  inhalt: [
    absatz(
      "Unter Mitmachen im Ehrenamt schaltest du einen QR-Code ein, der zur Mitmach-Seite eures Ortsvereins führt. " +
        "Der Monitor zeigt ihn unten rechts auf der Karte, solange es ruhig ist, und blendet ihn bei einer Warnung im Band oder einem Einsatz aus.",
    ),
  ],
};

export default notiz;
