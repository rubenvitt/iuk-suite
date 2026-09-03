// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: jeder Angemeldete — das Modul trägt `requiredGroups: []`, die
// Kachel und damit diese Notiz sieht, wer sich anmelden kann.
//
// DER TITEL WIEDERHOLT DEN APP-NAMEN NICHT. Spec §10 schlägt „Taktische Zeichen
// nachschlagen und merken" vor; CLAUDE.md verbietet die Wiederholung
// ausdrücklich, und der Modultitel steht ohnehin daneben (er kommt aus
// core/registry.ts). Der Dateiname und der slug bleiben wie in der Spec — der
// slug ist die Sprungmarke unter /neuigkeiten und wird von register.test.ts
// gegen den Dateinamen gehalten.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "zeichen",
  slug: "taktische-zeichen-nachschlagen",
  datum: "2026-09-02",
  titel: "Zeichen nachschlagen und auf eine Merkliste legen",
  inhalt: [
    absatz(
      "In der Suite gibt es eine neue App für taktische Zeichen. Unter Katalog stehen alle " +
        "Zeichen mit Bild, Bedeutung, Kapitel und Abschnitt; ein Klick auf ein Zeichen öffnet " +
        "die Einzelheiten direkt über der Liste, ohne dass du die Seite verlässt. Was du " +
        "öfter brauchst, legst du mit „Merken“ ab und findest es unter Merkliste wieder.",
    ),
    absatz(
      "An den Apps, die du schon benutzt, ändert sich nichts. Die Anmeldung ist dieselbe, und " +
        "für die neue App brauchst du keine zusätzliche Berechtigung: wer angemeldet ist, kann " +
        "nachschlagen.",
    ),
    absatz(
      "Die Suche liest neben den Titeln auch die Bedeutungen mit, deshalb führen Kürzel wie " +
        "SEG, RTW oder KTW zu Treffern. Umlaute kannst du weglassen — „loeschgruppe“ findet " +
        "„Löschgruppe“. Umgangssprachliche Fahrzeugnamen findet sie nicht: auf „Drehleiter“ " +
        "oder „Krankenwagen“ kommt nichts zurück, weil der Katalog diese Einträge nicht " +
        "führt. In dem Fall helfen die Filter Kapitel, Organisation und Grundform weiter.",
    ),
    absatz(
      "Die Bedeutungen folgen einem Entwurf, dessen fachliche Prüfung noch läuft. Zum " +
        "Nachschlagen und Einordnen taugt er; für eine verbindliche Auskunft gilt die " +
        "Dienstvorschrift deiner Organisation. Bei einzelnen Zeichen steht unter dem Bild ein " +
        "Satz zu einer bekannten zeichnerischen Abweichung.",
    ),
  ],
};

export default notiz;
