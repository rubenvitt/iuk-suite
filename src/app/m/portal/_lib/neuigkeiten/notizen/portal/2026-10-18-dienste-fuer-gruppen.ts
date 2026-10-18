// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "portal",
  slug: "dienste-fuer-gruppen",
  datum: "2026-10-18",
  titel: "Dienste nur für bestimmte Gruppen",
  inhalt: [
    absatz(
      "Unter „Dienste verwalten“ wählst du für einen Dienst ohne Haken bei „Öffentlich " +
        "sichtbar“ jetzt die Gruppen, die seine Kachel sehen. Bei bestehenden Diensten " +
        "änderst du das über „Sichtbarkeit“ in der Liste.",
    ),
  ],
};

export default notiz;
