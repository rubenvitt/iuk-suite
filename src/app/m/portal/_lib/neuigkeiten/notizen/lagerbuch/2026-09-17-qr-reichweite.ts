// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

/**
 * ⚠️ WARUM ES DIESE NOTIZ GIBT, obwohl die meisten Änderungen keine bekommen:
 * hier trifft die Probe gleich zweimal. Etwas VERSCHWINDET — wer bisher mit der
 * Karte am Fahrzeug aus dem Handlager gebucht hat, findet den Reiter „Entnahme"
 * dort nicht mehr und sucht ihn. Und etwas GEHT, das vorher nicht ging: die
 * Entnahmebox hat eine eigene Karte.
 *
 * ⚠️ SIE STEHT NEBEN DER VORTAGSNOTIZ „Jede Ortskarte hat ihren eigenen
 * Zugangs-Code" UND ERSETZT SIE NICHT. Jene führt die Codes ein, diese schneidet
 * sie zu — zwei Änderungen, zwei Notizen, dieselbe Regel, die dort schon einmal
 * angewandt wurde. Der erste Wurf hatte beides zusammengefasst und behauptete
 * damit, die Codes seien neu; für jeden, der die Karten schon geklebt hat, wäre
 * das die falsche Auskunft gewesen.
 *
 * ⚠️ DER ERSTE SATZ NENNT DIE EINSCHRÄNKUNG, NICHT DAS NEUE. Das neue Kärtchen
 * an der Kiste sucht niemand; den verschwundenen Reiter sucht jeder, der ihn
 * gestern noch hatte.
 *
 * ⚠️ EIN `hinweis`, und er ist eine AUFFORDERUNG: ohne einen neuen Druck hängt
 * an der Entnahmebox gar nichts. Die Karte entsteht beim Öffnen der Fläche, das
 * Kleben nicht.
 */
const notiz: Releasenotiz = {
  modul: "lagerbuch",
  slug: "qr-reichweite",
  datum: "2026-09-17",
  titel: "Jeder Code öffnet nur noch seinen eigenen Vorgang",
  inhalt: [
    absatz(
      "Ein Zugangs-Code kann ab jetzt genau das, wofür seine Karte hängt. Mit der Karte am " +
        "Fahrzeug oder an der Tasche machst du den Check und legst Material in die " +
        "Entnahmebox — aus dem Handlager entnimmst du damit nicht mehr. Dafür scanne die " +
        "Karte am Regal.",
    ),
    absatz(
      "Die Entnahmebox hat jetzt eine eigene Karte. Wer sie scannt, wählt die Einheit und " +
        "legt ab. Angemeldet bleibt alles wie bisher.",
    ),
    hinweis(
      "Öffne einmal „Verwaltung → Ortsetiketten“ und klebe die neue Karte an die " +
        "Entnahmebox.",
    ),
  ],
};

export default notiz;
