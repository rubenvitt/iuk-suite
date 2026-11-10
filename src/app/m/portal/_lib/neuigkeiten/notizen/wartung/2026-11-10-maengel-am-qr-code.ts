// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "wartung",
  slug: "maengel-am-qr-code",
  datum: "2026-11-10",
  titel: "Gemeldete Mängel am QR-Code",
  inhalt: [
    absatz(
      "Am QR-Code eines Geräts siehst du jetzt auch ohne Anmeldung, welche Mängel schon gemeldet sind. " +
        "Verwaltest du die Gruppe, korrigierst du unter Betriebsstunden eintragen einen zu hohen Stand direkt am Gerät. " +
        "Die Kennzahlen der Übersicht führen auf die Geräteliste mit genau den gezählten Geräten.",
    ),
  ],
};

export default notiz;
