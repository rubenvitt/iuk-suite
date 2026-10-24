// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "inventur-einsortieren",
  datum: "2026-10-24",
  titel: "Bei der Inventur einsortieren",
  inhalt: [
    absatz(
      "Zählst du unter Verwaltung → Inventur einen Schrank, stehen in der aufgeklappten Zeile auch die Chargen, " +
        "die noch bei „Nicht zugeordnet“ liegen. Was du im Schrank zählst, wird von dort umgelagert, " +
        "und den Rest buchst du mit einem Haken als Abweichung aus, damit bei „Nicht zugeordnet“ 0 steht.",
    ),
    absatz(
      "Eine ergänzte Charge kannst du vor dem Abschließen noch ändern: die Menge mit Plus und Minus, " +
        "MHD und Chargennummer über den Stift.",
    ),
  ],
};

export default notiz;
