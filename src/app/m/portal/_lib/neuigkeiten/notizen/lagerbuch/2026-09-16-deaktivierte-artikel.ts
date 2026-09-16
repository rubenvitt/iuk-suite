// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "deaktivierte-artikel",
  datum: "2026-09-16",
  titel: "Auf deaktivierte Artikel geht nichts mehr zu",
  inhalt: [
    absatz(
      "Ist ein Artikel deaktiviert, lässt sich kein Material mehr auf ihn buchen — " +
        "weder über „Auffüllen“ noch über den Zugang in der Verwaltung. Entnahme und " +
        "Umlagerung bleiben möglich. Soll wieder aufgefüllt werden, schalte den " +
        "Artikel in der Verwaltung unter „Aktiv“ ein.",
    ),
  ],
};

export default notiz;
