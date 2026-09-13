// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "von-allen-geraeten-abmelden",
  datum: "2026-08-14",
  titel: "Von allen Geräten abmelden",
  inhalt: [
    absatz(
      "Im Nutzermenü oben rechts steht jetzt „Profil“. Darunter liegt „Von allen Geräten " +
        "abmelden“: der Knopf beendet jede Sitzung deines Kontos, nicht nur die in diesem " +
        "Browser. Der kurze Weg, wenn ein Gerät abhandenkommt.",
    ),
  ],
};

export default notiz;
