// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// `datum` ist der Tag des ROLLOUTS. Wird er verschoben, wandern Dateiname UND Feld
// gemeinsam — `register.test.ts` hält beides zusammen.
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "zeichen",
  slug: "zeichen-ueben",
  datum: "2026-09-03",
  titel: "Zeichen üben, bis sie sitzen",
  inhalt: [
    absatz(
      "Unter „Üben“ fragt dich die App taktische Zeichen ab — mal zeigt sie dir ein Zeichen und du " +
        "wählst die Bedeutung, mal umgekehrt. Was du sicher kannst, kommt seltener; was du " +
        "verwechselst, kommt am nächsten Tag wieder.",
    ),
    absatz(
      "Oben siehst du vier Zahlen: gefestigt, in Arbeit, heute fällig und noch nie gefragt. Sie " +
        "beziehen sich auf die 232 zusammengesetzten Zeichen des Katalogs. Die Grundformen selbst " +
        "werden nicht abgefragt — bei ihnen wäre die Frage die Antwort.",
    ),
    absatz(
      "Wenn deine Ausbildung Lernsets angelegt hat, kannst du oben eines auswählen und nur damit " +
        "üben — auch im Baukasten zieht die Übungsaufgabe dann aus diesem Set. Die falschen " +
        "Antworten kommen trotzdem aus dem ganzen Katalog, sonst würdest du nach ein paar Fragen " +
        "das Set erraten statt die Zeichen zu kennen.",
    ),
    absatz(
      "Dein Lernstand gehört dir und ist an deine Anmeldung geknüpft. Merkliste, Katalog und " +
        "Baukasten bleiben, wie sie waren.",
    ),
    hinweis(
      "Die Bedeutungen folgen einem Entwurf, dessen fachliche Prüfung noch läuft. Zum Üben der " +
        "Systematik taugt er; für eine verbindliche Auskunft gilt die Dienstvorschrift deiner " +
        "Organisation.",
    ),
  ],
};

export default notiz;
