// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// DER TITEL WIEDERHOLT DEN APP-NAMEN NICHT — der Modultitel steht daneben
// (er kommt aus core/registry.ts). Der slug bleibt, er ist die Sprungmarke
// unter /neuigkeiten und wird von register.test.ts gegen den Dateinamen gehalten.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "zeichen",
  slug: "taktische-zeichen-nachschlagen",
  datum: "2026-09-02",
  titel: "Zeichen nachschlagen und merken",
  inhalt: [
    absatz(
      "In der Suite gibt es eine neue App für taktische Zeichen. Unter Katalog stehen alle " +
        "Zeichen mit Bild und Bedeutung; was du öfter brauchst, legst du mit „Merken“ auf die " +
        "Merkliste. Wer angemeldet ist, kann nachschlagen — eine zusätzliche Berechtigung " +
        "braucht es nicht.",
    ),
    absatz(
      "Die Bedeutungen folgen einem Entwurf, dessen fachliche Prüfung noch läuft. Verbindlich " +
        "ist die Dienstvorschrift deiner Organisation.",
    ),
  ],
};

export default notiz;
