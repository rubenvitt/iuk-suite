// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "check-und-entnahme-angemeldet",
  datum: "2026-09-15",
  titel: "Check und Entnahme auch ohne Code",
  inhalt: [
    absatz(
      "Bist du angemeldet, erreichst du den Fahrzeug-Check über Prüfungen → Check durchführen " +
        "und die Entnahme über Bestand → Entnahme — ohne einen Code einzulösen. Im Check wählst " +
        "du dabei aus allen aktiven Fahrzeugen; auf dem Fahrzeugblatt führt dich „Check " +
        "durchführen“ direkt zu diesem einen.",
    ),
  ],
};

export default notiz;
