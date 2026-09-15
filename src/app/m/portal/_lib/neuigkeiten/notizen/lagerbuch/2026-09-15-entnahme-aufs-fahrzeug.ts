// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "entnahme-aufs-fahrzeug",
  datum: "2026-09-15",
  titel: "Entnahme auf ein Fahrzeug buchen",
  inhalt: [
    absatz(
      "Entnimmst du mit dem Kärtchen etwas am Regal, wählst du jetzt unter „Ziel“, wohin das " +
        "Material geht: auf ein Fahrzeug oder „Kein Fahrzeug — Verbrauch“. Auf ein Fahrzeug " +
        "gebucht, zählt es dort zum Bestand. Die Wahl gilt für alle weiteren Entnahmen mit " +
        "demselben Kärtchen.",
    ),
    absatz(
      "Solange nichts gewählt ist, lässt sich nicht buchen — damit nichts versehentlich am " +
        "falschen Ort landet.",
    ),
  ],
};

export default notiz;
