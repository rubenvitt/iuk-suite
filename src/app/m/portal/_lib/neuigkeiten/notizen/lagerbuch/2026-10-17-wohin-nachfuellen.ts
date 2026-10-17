// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "wohin-nachfuellen",
  datum: "2026-10-17",
  titel: "Beim Nachfüllen sehen, wohin die Teile gehören",
  inhalt: [
    absatz(
      "Im Schritt „Nachfüllen“ des Fahrzeug-Checks stehen die fehlenden Teile jetzt unter dem Fach der Einheit, " +
        "in das sie gehören. Nach dem Abschluss zeigt dir „Wohin die geholten Teile gehören“ noch einmal je Fach, " +
        "wie viel du dort einräumst.",
    ),
  ],
};

export default notiz;
