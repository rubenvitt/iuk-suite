// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "entnahmebox",
  datum: "2026-09-16",
  titel: "Zu viel auf dem Fahrzeug: in die Entnahmebox",
  inhalt: [
    absatz(
      "Was du aus einem Fahrzeug oder einer Tasche herausnimmst, ohne es zu verbrauchen, " +
        "legst du in die Entnahmebox in der Halle. Am Telefon buchst du das über den " +
        "Reiter „Box“: Einheit wählen, Artikel antippen, Menge eingeben. Das Material " +
        "bleibt im Buch — es steht danach in der Box statt auf der Einheit.",
    ),
    absatz(
      "Unter „Entnahmebox“ siehst du, was gerade darin liegt, mit Verfallsdatum und mit " +
        "der Einheit, aus der es kam.",
    ),
    hinweis(
      "Abgelaufenes gehört nicht in die Box, sondern weiter über „Aussondern“ heraus.",
    ),
  ],
};

export default notiz;
