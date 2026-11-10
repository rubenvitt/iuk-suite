// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "check-ohne-vorbelegung",
  datum: "2026-11-10",
  titel: "Check: Geräte und Sauerstoff erst nach dem Hinsehen",
  inhalt: [
    absatz(
      "Im Check ist nichts mehr vorgewählt: Jedes Gerät braucht eine Antwort und jede Flasche einen abgelesenen " +
        "Druck, bevor du abschließen kannst. Ein Gerät, das fehlt oder defekt ist, steht danach unter Mängel und " +
        "auf der Seite des Geräts. Oben heißt der Knopf jetzt Abmelden.",
    ),
  ],
};

export default notiz;
