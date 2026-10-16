// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "check-ohne-soll",
  datum: "2026-10-16",
  titel: "Check zählt ohne Soll",
  inhalt: [
    absatz(
      "Beim Check siehst du im Schritt „Zählen“ das Soll nicht mehr, zähl einfach, was wirklich da ist. " +
        "Was fehlt, zeigt dir danach der Schritt „Nachfüllen“.",
    ),
  ],
};

export default notiz;
