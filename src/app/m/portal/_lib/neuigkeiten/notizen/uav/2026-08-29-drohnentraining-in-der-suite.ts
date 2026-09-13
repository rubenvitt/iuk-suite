// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: die Verwaltung (switcherGroupSources: ["admin"] in core/registry.ts —
// die Kachel und damit diese Notiz sieht nur, wer die Verwaltungsgruppe hat).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "uav",
  slug: "drohnentraining-in-der-suite",
  datum: "2026-08-29",
  titel: "Das Drohnentraining ist in der Suite angekommen",
  inhalt: [
    absatz(
      "Das Training läuft jetzt als App in der Suite, mit denselben Aufgaben, denselben " +
        "Teilnehmenden und demselben Fortschritt. Für dich als Verwaltung ändert sich der " +
        "Anmeldeweg: dasselbe Konto wie in den anderen Apps.",
    ),
    absatz(
      "Für die Teilnehmenden bleibt der Zugang, wie er war — dieselbe Adresse, derselbe Code, " +
        "derselbe Fortschritt. Beim ersten Öffnen räumt das Gerät die alte Installation einmal " +
        "selbständig auf; das sieht nach einem Neustart aus und ist erwartet.",
    ),
    absatz(
      "Für eine Übergangszeit lässt sich die App ohne Netzverbindung nicht neu öffnen. Wer eine " +
        "Aufgabe bereits offen hat, erfasst darin offline weiter wie gewohnt.",
    ),
  ],
};

export default notiz;
