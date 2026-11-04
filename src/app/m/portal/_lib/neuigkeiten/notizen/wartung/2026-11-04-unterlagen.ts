// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "wartung",
  slug: "unterlagen",
  datum: "2026-11-04",
  titel: "Anleitung und Handbuch am QR-Code",
  inhalt: [
    absatz(
      "Wer den QR-Code an einem Gerät scannt, sieht jetzt dessen Hinweise und kann Kurzanleitung oder Handbuch direkt öffnen, auch ohne Anmeldung. " +
        "Als Verwalter lädst du PDFs oder Bilder in der Akte des Geräts unter Unterlagen hoch, die Hinweise trägst du unter Bearbeiten ein.",
    ),
  ],
};

export default notiz;
