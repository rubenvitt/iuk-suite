// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Sichtbar ist diese Notiz für jeden, der die Kachel „Taktische Zeichen" sieht —
// das Modul steht hinter dem Login, ohne eigene Zugangsgruppe. Geschrieben also
// an alle, die die App benutzen, nicht an eine Verwaltung.
// `datum` ist der Tag des ROLLOUTS, nicht des Commits: 2026-09-03, derselbe Tag
// wie die vorangegangene Notiz „Zeichen üben, bis sie sitzen".
//
// ⛔ DIE AUSSAGE IST AN IHRE BEDINGUNG GEBUNDEN, UND ZWAR IM ERSTEN ABSATZ
// (Abschlussreview, W3). Die erste Fassung versprach die Offline-Fähigkeit
// unbedingt. Sichtbar ist eine Notiz aber ab dem Merge und für jeden, der die
// Kachel sieht — die Fähigkeit dagegen setzt einen eigenen Modul-Host UND den
// eingeschalteten Service Worker voraus und existiert auf der Suite-Adresse gar
// nicht. Eine Notiz, die etwas verspricht, das der Leser bei sich nicht findet,
// macht die ganze Liste unglaubwürdig. Der erste Absatz ist deshalb wahr, egal
// wie die Schalter stehen: er sagt, WO es das gibt.
//
// Die Schalter selbst kommen nicht vor — „eigene Adresse" ist das, was ein
// Anwender sieht; `SUITE_HOST_ZEICHEN` und `ZEICHEN_SW` sind seine Sache nicht.
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "zeichen",
  slug: "zeichen-ohne-netz",
  datum: "2026-09-03",
  titel: "Der Katalog steht auf der eigenen Adresse auch ohne Verbindung bereit",
  inhalt: [
    absatz(
      "Ohne Verbindung kannst du alle Zeichen nachschlagen, durchsuchen und deine Merkliste " +
        "ansehen — auf der eigenen Adresse der App. Nur dort lässt sie sich als eigene App " +
        "einrichten und legt die Zeichen auf deinem Gerät ab; über die Adresse der Suite " +
        "geöffnet, braucht sie weiterhin Netz. Ob es die eigene Adresse bei euch gibt, sagt " +
        "dir, wer die Suite betreut.",
    ),
    absatz(
      "Ohne Netz öffnet sich dann eine schlanke Ansicht mit demselben Suchfeld wie im Katalog. " +
        "Oben steht, wie viele Zeichen gespeichert sind und von wann der Stand ist. Merken und " +
        "Entfernen, der Baukasten und die Übungsrunden erscheinen dort gar nicht erst — ein " +
        "Knopf, der ins Leere läuft, kostet unterwegs nur Zeit.",
    ),
    absatz(
      "Das funktioniert erst, nachdem du den Katalog einmal mit Netz geöffnet hast: dabei legt " +
        "dein Gerät die Zeichen ab. Ein Gerät, das lange nicht online war, verlangt beim " +
        "nächsten Netzkontakt eine Anmeldung; der gespeicherte Katalog bleibt dabei erhalten.",
    ),
    absatz(
      "Deine Merkliste wird dafür auf dem Gerät gespeichert — auch das nur auf der eigenen " +
        "Adresse. Auf einem geteilten Tablet sieht sie damit auch, wer sich nach dir anmeldet. " +
        "In der Ansicht ohne Netz steht deshalb ein Knopf „Von diesem Gerät löschen“ — er " +
        "entfernt die Merkliste, die gespeicherten Zeichen bleiben. Beim Abmelden räumt die " +
        "App beides von sich auf.",
    ),
    hinweis("Öffne den Katalog einmal über die eigene Adresse und mit Netz, bevor du losfährst."),
  ],
};

export default notiz;
