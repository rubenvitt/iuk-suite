// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Sichtbar ist diese Notiz für jeden, der die Kachel „Taktische Zeichen" sieht —
// das Modul steht hinter dem Login, ohne eigene Zugangsgruppe. Geschrieben also
// an alle, die die App benutzen, nicht an eine Verwaltung.
// `datum` ist der Tag des ROLLOUTS, nicht des Commits: 2026-09-03, derselbe Tag
// wie die vorangegangene Notiz „Zeichen üben, bis sie sitzen".
import { absatz, hinweis, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "zeichen",
  slug: "zeichen-ohne-netz",
  datum: "2026-09-03",
  titel: "Der Katalog steht auch ohne Verbindung bereit",
  inhalt: [
    absatz(
      "Ohne Verbindung kannst du jetzt alle Zeichen nachschlagen, durchsuchen und deine " +
        "Merkliste ansehen. Es öffnet sich dann eine schlanke Ansicht mit demselben Suchfeld " +
        "wie im Katalog. Oben steht, wie viele Zeichen gespeichert sind und von wann der " +
        "Stand ist.",
    ),
    absatz(
      "Ändern, Bauen und Üben brauchen weiterhin eine Verbindung. Merken und Entfernen, der " +
        "Baukasten und die Übungsrunden erscheinen ohne Netz deshalb gar nicht erst — ein " +
        "Knopf, der ins Leere läuft, kostet unterwegs nur Zeit.",
    ),
    absatz(
      "Das funktioniert erst, nachdem du den Katalog einmal mit Netz geöffnet hast: dabei legt " +
        "dein Gerät die Zeichen ab. Ein Gerät, das lange nicht online war, verlangt beim " +
        "nächsten Netzkontakt eine Anmeldung; der gespeicherte Katalog bleibt dabei erhalten.",
    ),
    absatz(
      "Deine Merkliste wird dafür auf dem Gerät gespeichert. Auf einem geteilten Tablet sieht " +
        "sie damit auch, wer sich nach dir anmeldet. In der Offline-Ansicht steht deshalb ein " +
        "Knopf „Von diesem Gerät löschen“, und beim Abmelden räumt die App von sich auf.",
    ),
    hinweis("Öffne den Katalog einmal mit Netz, bevor du losfährst."),
  ],
};

export default notiz;
