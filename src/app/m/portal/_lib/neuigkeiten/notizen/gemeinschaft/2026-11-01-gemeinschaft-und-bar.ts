// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "gemeinschaft",
  slug: "gemeinschaft-und-bar",
  datum: "2026-11-01",
  titel: "Events, Projekte und die Bar an einem Ort",
  inhalt: [
    absatz(
      "In der neuen App Gemeinschaft legt die Leitung Events und Projekte an, verteilt Aufgaben und sieht im Kalender alles zusammen. " +
        "Mitglieder brauchen kein Konto: Jedes bekommt unter Mitglieder einen persönlichen Link, hakt dort seine Aufgaben ab und trägt sich mit Ich mach’s für offene ein.",
    ),
    absatz(
      "Die Bar fragst du jetzt ohne Anmeldung an und siehst den Stand über deinen Link. " +
        "Unter Vermietung sagt die Leitung zu oder ab und hält fest, wie weit der Mietvertrag ist.",
    ),
  ],
};

export default notiz;
