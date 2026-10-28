// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagemonitor",
  slug: "verkehrslage",
  datum: "2026-10-28",
  titel: "Verkehrslage auf der Karte des Lagemonitors",
  inhalt: [
    absatz(
      "Unter Verkehrslage schaltest du den Verkehrsfluss und die Baustellen und Sperrungen von TomTom auf die Karte, dazu brauchst du einen API-Schlüssel von TomTom. " +
        "Feste Blitzer aus OpenStreetMap zeigt nur der Online-Monitor, der Bildschirm im FüKw nie.",
    ),
  ],
};

export default notiz;
