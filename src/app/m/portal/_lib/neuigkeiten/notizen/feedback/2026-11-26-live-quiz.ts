// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zweiter Absatz nur für Slidev: wer nicht mit Slidev präsentiert, braucht ihn nicht.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "feedback",
  slug: "live-quiz",
  datum: "2026-11-26",
  titel: "Live-Quiz am Dienstabend",
  inhalt: [
    absatz(
      "In deiner Gruppe legst du unter Quiz jetzt Fragen an, als Wettbewerb mit Rangliste oder als Lagebild ohne Namen. Öffne die Beamer-Adresse auf dem Bildschirm im Raum und klicke auf Lobby öffnen; alle machen per QR-Code oder Code auf dem Handy mit.",
    ),
    absatz("Präsentierst du mit Slidev, findest du im Quiz unter Für Slidev einen Schnipsel und die Komponente zum Herunterladen, mit denen das Quiz in deinen Folien läuft."),
  ],
};

export default notiz;
