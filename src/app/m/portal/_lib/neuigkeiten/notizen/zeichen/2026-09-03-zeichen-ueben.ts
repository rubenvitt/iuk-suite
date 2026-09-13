// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// `datum` ist der Tag des ROLLOUTS. Wird er verschoben, wandern Dateiname UND Feld
// gemeinsam — `register.test.ts` hält beides zusammen.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "zeichen",
  slug: "zeichen-ueben",
  datum: "2026-09-03",
  titel: "Zeichen üben, bis sie sitzen",
  inhalt: [
    absatz(
      "Unter „Üben“ fragt dich die App taktische Zeichen ab — mal das Zeichen zur Bedeutung, " +
        "mal umgekehrt. Was du sicher kannst, kommt seltener; was du verwechselst, kommt am " +
        "nächsten Tag wieder.",
    ),
    absatz(
      "Hat deine Ausbildung Lernsets angelegt, übst du wahlweise nur damit. Dein Lernstand ist " +
        "an deine Anmeldung geknüpft.",
    ),
  ],
};

export default notiz;
