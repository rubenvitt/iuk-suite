// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "aussonderung-und-inventur-im-journal",
  datum: "2026-09-15",
  titel: "Aussonderung und Inventur im Journal",
  inhalt: [
    absatz(
      "Im Journal steht in der Spalte „Vorgang“ jetzt „Aussonderung“, wenn abgelaufenes Material " +
        "entsorgt wurde, und „Inventur“ bei einer Inventurdifferenz. Bisher hieß beides " +
        "„Korrektur“, und woran du warst, stand allenfalls im Kommentar daneben.",
    ),
    absatz(
      "Über dem Journal kannst du auch danach filtern. „Korrektur“ zeigt dort jetzt nur noch die " +
        "Korrekturen von Hand. Buchungen von vor dieser Änderung behalten ihre alte Bezeichnung.",
    ),
  ],
};

export default notiz;
