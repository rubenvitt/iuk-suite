// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "wartung",
  slug: "geraetewartung",
  datum: "2026-11-03",
  titel: "Stromerzeuger, Heizungen und Technik im Blick",
  inhalt: [
    absatz(
      "In der neuen App Gerätewartung stehen Geräte mit ihren Prüf- und Wartungsfristen. " +
        "Am Gerät scannst du den QR-Code und gehst die Prüfung Punkt für Punkt durch, meldest einen Mangel mit Foto oder trägst die Betriebsstunden ein. " +
        "Was fällig ist, siehst du als Verwalter deiner Gruppe auch unter Was steht an.",
    ),
    absatz("Einen Mangel melden kann jeder über den QR-Code, auch ohne Anmeldung."),
  ],
};

export default notiz;
