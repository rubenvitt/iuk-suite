// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "feedback",
  slug: "ehrlich-gesagt",
  datum: "2026-11-03",
  titel: "Ehrlich gesagt",
  inhalt: [
    absatz(
      "Im Feedback gibt es jetzt Ehrlich gesagt: Über einen QR-Code kann jede und jeder jederzeit anonym oder mit Namen etwas an die Vertrauenspersonen schreiben. Als Vertrauensperson findest du die Mitteilungen links unter Ehrlich gesagt, den Aushang unter QR-Code und Aushang.",
    ),
  ],
};

export default notiz;
