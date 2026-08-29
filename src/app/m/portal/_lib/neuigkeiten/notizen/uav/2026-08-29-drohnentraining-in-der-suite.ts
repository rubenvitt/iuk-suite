// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "uav",
  slug: "drohnentraining-in-der-suite",
  datum: "2026-08-29",
  titel: "Das Drohnentraining ist in der Suite angekommen",
  inhalt: [
    absatz(
      "Das Drohnentraining war bisher eine eigene Anwendung. Es steht jetzt als „Drohnentraining“ " +
        "in der Suite, mit denselben Aufgaben, Teilnehmerinnen und Teilnehmern und demselben " +
        "Fortschritt wie vorher — du fängst nicht bei null an.",
    ),
    absatz(
      "Am Zugang ändert sich nichts. Dein Code auf dem Zettel oder Kopf gilt weiter, und ein " +
        "Magic-Link aus WhatsApp oder E-Mail öffnet dein Dashboard wie bisher, ohne dass du dich " +
        "irgendwo anmelden musst. Angefangene Übungen und noch nicht übertragene Einträge auf " +
        "deinem Gerät bleiben erhalten, auch offline im Feld.",
    ),
    absatz(
      "Beim ersten Öffnen nach der Umstellung räumt dein Gerät die alte Installation einmal " +
        "selbständig auf und lädt neu — das ist kein Fehler. Dein Fortschritt und eine noch nicht " +
        "übertragene Erfassung überstehen das unverändert.",
    ),
    absatz(
      "Neu ist der Weg für die Verwaltung: sie meldet sich jetzt mit demselben Konto an wie in den " +
        "anderen Apps der Suite. Wer schon in einer davon angemeldet ist, ist es hier auch. " +
        "Teilnehmerliste, Aufgabenkatalog und Magic-Link-Erzeugung stehen wie gewohnt zur " +
        "Verfügung.",
    ),
  ],
};

export default notiz;
