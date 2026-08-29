// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Verwaltung (switcherGroupSources: ["admin"] in core/registry.ts —
// die Kachel und damit diese Notiz sieht nur, wer die Verwaltungsgruppe hat, nicht
// die Teilnehmerinnen und Teilnehmer selbst). Deshalb an die Person geschrieben,
// die Fragen aus dem Training beantwortet, nicht an die Trainierenden.
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "uav",
  slug: "drohnentraining-in-der-suite",
  datum: "2026-08-29",
  titel: "Das Drohnentraining ist in der Suite angekommen",
  inhalt: [
    absatz(
      "Das Drohnentraining war bisher eine eigene Anwendung. Es läuft jetzt als „Drohnentraining“ " +
        "in der Suite, mit denselben Aufgaben, denselben Teilnehmerinnen und Teilnehmern und " +
        "demselben Fortschritt wie vorher. Für dich als Verwaltung ändert sich der Anmeldeweg: du " +
        "meldest dich jetzt mit demselben Konto an wie in den anderen Apps der Suite, und wer " +
        "schon in einer davon angemeldet ist, ist es hier auch.",
    ),
    absatz(
      "Für die Teilnehmenden ändert sich am Zugang nichts. Die Adresse, unter der sie das Training " +
        "aufrufen, bleibt dieselbe, ihr Code auf dem Zettel oder im Kopf gilt weiter, ein " +
        "Magic-Link aus WhatsApp oder E-Mail öffnet das Dashboard wie bisher, und der bisherige " +
        "Fortschritt ist vollständig da. Auch Einträge, die auf einem Gerät noch nicht übertragen " +
        "waren, sind erhalten geblieben.",
    ),
    absatz(
      "Meldet sich jemand mit der Frage, warum die alte App plötzlich neu lädt: das ist erwartet. " +
        "Beim ersten Öffnen nach der Umstellung räumt das Gerät die alte Installation einmal " +
        "selbständig auf — Fortschritt und noch nicht übertragene Erfassungen übersteht das " +
        "unverändert.",
    ),
    absatz(
      "Eine Einschränkung gilt für eine Übergangszeit: die App lässt sich in dieser Zeit nicht " +
        "OHNE Netzverbindung neu öffnen. Wer eine Aufgabe bereits geöffnet hat, kann darin " +
        "weiterarbeiten und offline erfassen wie gewohnt — nur ein Neustart der App ohne Netz " +
        "geht in dieser Zeit nicht. Das endet mit einer Umstellung, die die Offline-Fähigkeit " +
        "wieder vollständig herstellt.",
    ),
    hinweis(
      "Bekommst du in dieser Zeit eine Rückmeldung, dass sich die App im Funkloch nicht mehr " +
        "öffnen lässt: das ist die bekannte Einschränkung oben, kein Datenverlust — einmal kurz " +
        "mit Netzverbindung öffnen behebt es.",
    ),
  ],
};

export default notiz;
