// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// ⛔ DIE AUSSAGE IST AN IHRE BEDINGUNG GEBUNDEN, UND ZWAR IM ERSTEN ABSATZ.
// Sichtbar ist eine Notiz ab dem Merge und für jeden, der die Kachel sieht — die
// Offline-Fähigkeit dagegen setzt einen eigenen Modul-Host voraus und existiert
// auf der Suite-Adresse gar nicht. Eine Notiz, die etwas verspricht, das der
// Leser bei sich nicht findet, macht die ganze Liste unglaubwürdig. Die Schalter
// selbst kommen nicht vor — „eigene Adresse" ist das, was ein Anwender sieht.
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "zeichen",
  slug: "zeichen-ohne-netz",
  datum: "2026-09-03",
  titel: "Der Katalog auch ohne Verbindung",
  inhalt: [
    absatz(
      "Auf der eigenen Adresse der App schlägst du alle Zeichen auch ohne Verbindung nach. Über " +
        "die Adresse der Suite geöffnet, braucht sie weiterhin Netz; ob es die eigene Adresse " +
        "bei euch gibt, sagt dir, wer die Suite betreut.",
    ),
    absatz(
      "Deine Merkliste liegt dafür auf dem Gerät — auf einem geteilten Tablet sieht sie auch, " +
        "wer sich nach dir anmeldet. „Von diesem Gerät löschen“ entfernt sie wieder.",
    ),
    hinweis("Öffne den Katalog einmal über die eigene Adresse und mit Netz, bevor du losfährst."),
  ],
};

export default notiz;
