// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "auffuellen",
  datum: "2026-09-16",
  titel: "Handlager auffüllen",
  inhalt: [
    absatz(
      "Unter „Auffüllen“ buchst du Material ins Handlager: du wählst die Charge — eine " +
        "vorhandene oder eine neue mit Nummer und Verfallsmonat —, die Menge und den Schrank. " +
        "Die Ansicht ist wie die Entnahme für das Telefon gebaut, nur in der anderen Richtung.",
    ),
    absatz(
      "Auffüllen geht nur mit Anmeldung, nicht mit einem Zugangs-Kärtchen. Material auf ein " +
        "Fahrzeug bringst du weiterhin über „Entnahme“ mit dem Fahrzeug als Ziel.",
    ),
  ],
};

export default notiz;
