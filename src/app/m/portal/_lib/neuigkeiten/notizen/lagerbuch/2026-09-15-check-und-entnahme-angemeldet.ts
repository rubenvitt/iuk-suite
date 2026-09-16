// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "check-und-entnahme-angemeldet",
  datum: "2026-09-15",
  titel: "Check und Entnahme auch ohne Code",
  inhalt: [
    absatz(
      "Bist du angemeldet, erreichst du den Check über Prüfungen → Check durchführen und " +
        "die Entnahme über Bestand → Entnahme — ohne einen Code einzulösen. Im Check wählst " +
        "du dabei aus allen aktiven Einheiten; auf dem Blatt einer Einheit führt dich „Check " +
        "durchführen“ direkt zu dieser einen.",
    ),
  ],
};

export default notiz;
