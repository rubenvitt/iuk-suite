/**
 * DIE ZWEI PFADLISTEN DES MODULS — die aeusseren Pfade, die die Middleware ins Modul
 * umschreibt (Spec 1 §1.2.1 und §1.2.2).
 *
 * ⛔ EIN REINES WERTMODUL: keine Direktive, kein Import, kein Zugriff auf `_db/`. Es wird
 * von zwei Testdateien gelesen (`_lib/routen.test.ts` und `_lib/nav.test.ts`), und es liegt
 * unter `_lib/`, weil `riegel.test.ts` dort BEIDE Bauform-Direktiven verbietet — ein
 * `"use client"` machte aus diesen Listen Client-Referenzen (Falle 6), ein `"use server"`
 * Serverreferenzen.
 *
 * ⛔ WARUM DIE LISTEN HIER LIEGEN UND NICHT MEHR IN `_lib/routen.test.ts`: der
 * Kopplungsfall aus `_lib/nav.test.ts` („jeder href zeigt auf eine Route der Routenkarte")
 * braucht sie als Wert. In der Testdatei waren sie modul-privat — `grep -c "^export"`
 * darauf lieferte 0 —, und ein Import AUS einer Testdatei registrierte deren Suiten ein
 * zweites Mal. Die einzige Alternative waere eine zweite Abschrift der Karte gewesen, also
 * genau der Zustand, gegen den der Kopplungsfall antritt.
 *
 * ⚠️ DIE LISTEN SIND KEINE DATEIEXISTENZ-ZUSAGE. Sie beschreiben die
 * Middleware-Entscheidung (`core/routing.ts`); mehrere dieser Pfade haben heute keine
 * Datei und bekommen sie erst in einem spaeteren Planteil. Ein Rewrite auf einen Pfad ohne
 * Datei ist eine saubere 404 — der erwartete Zustand und kein Mangel.
 */

/**
 * Der Ausleih-Zweig, Spec 1 §1.2.1 (`Spec:275-284`).
 *
 * Sechs aeussere Pfade. Die zwei uebrigen Tabellenzeilen dort (`layout.tsx` und
 * `(ausleihe)/layout.tsx`) tragen keinen aeusseren Pfad.
 */
export const AUSLEIH_PFADE = [
  "/",
  "/t/ABC123",
  "/abmelden",
  "/geraete",
  "/ausleihen",
  "/rueckgabe",
];

/**
 * Der Verwaltungszweig: die ZEHN Seiten aus Spec 1 §1.2.2 (`Spec:301-314`) plus die ZWEI
 * Route Handler.
 *
 * ⚠️ Der ERSTE Handler steht NICHT in `Spec:301-314` — er steht in `Spec:563` (§1.4.3) und
 * wird erst durch B9 (`Spec:98`) mitgezaehlt: „Gezaehlt wird jetzt einheitlich: zehn
 * Seiten-Pfade plus ein Route Handler."
 *
 * ⚠️ `/admin/versionen` UND NICHT `/admin/einstellungen` — ebenfalls B9 (Kapiteltext
 * `Spec:326-331`).
 *
 * ✅ DER ZWEITE HANDLER IST DA — `/admin/import/hochladen` (Entscheidung E-V16), angelegt in
 * Aufgabe V18 im selben Commit wie `admin/(arbeit)/import/hochladen/route.ts` und wie die
 * Zahl im Vollzaehligkeitsfall von `_lib/routen.test.ts`. ⛔ Damit ist die Liste
 * vollstaendig; die naechste Anhebung braucht einen neuen benannten Grund.
 */
export const VERWALTUNGS_PFADE = [
  "/admin",
  "/admin/geraete",
  "/admin/geraete/g-1",
  "/admin/geraete/g-1/ereignisse",
  "/admin/ausleihen",
  "/admin/import",
  "/admin/software",
  "/admin/versionen",
  "/admin/zugaenge",
  "/admin/zugaenge/blatt",
  "/admin/geraete/export",
  "/admin/import/hochladen",
];
