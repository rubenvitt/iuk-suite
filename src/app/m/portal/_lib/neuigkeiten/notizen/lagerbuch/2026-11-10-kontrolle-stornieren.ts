// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "kontrolle-stornieren",
  datum: "2026-11-10",
  titel: "BZ-Kontrolle stornieren",
  inhalt: [
    absatz(
      "Eine falsch erfasste BZ-Kontrolle stornierst du jetzt im Logbuch des Geräts über Stornieren. Sie bleibt " +
        "sichtbar, zählt aber nicht mehr. Die nächste Kontrolle wird nur noch von einer bestandenen berechnet.",
    ),
  ],
};

export default notiz;
