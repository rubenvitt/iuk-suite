// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "personal-aus-dem-helferverzeichnis",
  datum: "2026-10-20",
  titel: "Personal aus dem Helferverzeichnis übernehmen",
  inhalt: [
    absatz(
      "Unter Stammdaten → Personal übernimmst du mit „Aus Helferverzeichnis abgleichen“ die freigegebenen Helfer samt Qualifikation. " +
        "Von Hand angelegtes Personal bleibt, wie es ist; wer nicht mehr freigegeben ist, wird deaktiviert.",
    ),
  ],
};

export default notiz;
