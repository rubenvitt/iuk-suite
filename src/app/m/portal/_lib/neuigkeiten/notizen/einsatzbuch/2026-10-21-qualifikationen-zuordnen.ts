// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "einsatzbuch",
  slug: "qualifikationen-zuordnen",
  datum: "2026-10-21",
  titel: "Qualifikationen aus HiOrg selbst zuordnen",
  inhalt: [
    absatz(
      "Unter Stammdaten → Personal → „Aus Helferverzeichnis abgleichen“ legst du unter „Qualifikationen aus HiOrg“ fest, welches Kürzel eine Qualifikation aus HiOrg im Einsatzbuch bekommt. " +
        "So übernimmst du auch Helfer, deren Qualifikation das Einsatzbuch bisher nicht erkannt hat.",
    ),
  ],
};

export default notiz;
