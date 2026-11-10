// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "auffuellen-ohne-chargennummer",
  datum: "2026-11-10",
  titel: "Auffüllen ohne Chargennummer",
  inhalt: [
    absatz(
      "Unter „Auffüllen“ kannst du eine neue Charge jetzt ohne Chargennummer buchen, und " +
        "für Material ohne Ablaufdatum wählst du „ohne Verfall“. Ist der Verfall schon " +
        "vorbei, fragt die Ansicht vor dem Buchen nach.",
    ),
  ],
};

export default notiz;
