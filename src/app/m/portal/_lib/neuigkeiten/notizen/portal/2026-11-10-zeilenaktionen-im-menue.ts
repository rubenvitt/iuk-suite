// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "zeilenaktionen-im-menue",
  datum: "2026-11-10",
  titel: "Aktionen einer Zeile im Menü",
  inhalt: [
    absatz(
      "Hat eine Zeile in einer Liste mehrere Aktionen, etwa Bearbeiten und Entfernen, findest du sie jetzt hinter " +
        "dem Knopf mit den drei Punkten am rechten Rand. Die Listen passen damit auch auf einem Laptop ganz auf den " +
        "Bildschirm. Lange Codes und Links sind gekürzt, der Knopf daneben kopiert sie vollständig.",
    ),
  ],
};

export default notiz;
