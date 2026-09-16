// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "wer-hat-geprueft",
  datum: "2026-09-16",
  titel: "Wer einen Check erfasst hat",
  inhalt: [
    absatz(
      "Unter „Verwaltung → Checks“ steht jetzt in der Spalte „Wer“, von wem ein Check " +
        "stammt — beim Kärtchen dessen Beschriftung, sonst der Name des Kontos. Du kannst " +
        "die Liste danach filtern; auf der Detailseite steht derselbe Name über dem Ergebnis.",
    ),
  ],
};

export default notiz;
