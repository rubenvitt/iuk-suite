/**
 * Kategorie-Werte der anonymen Abgabe — Schreib-Validierung und
 * Anzeige-Toleranz (Spec §8.3, Spalte `inbox_files.kategorie` §4.6).
 *
 * KEIN `"use client"` in dieser Datei und in diesem Ordner. Das Abgabeformular
 * ist eine Client-Insel, der Posteingang ist eine Server Component — und ein
 * WERT aus einem Client-Modul kommt in einer Server Component nicht an,
 * sondern als Client-Referenz (`docs/design/README.md:87-103`, HTTP 500 fuer
 * die ganze Seite; TypeScript und `pnpm build` sehen es nicht). Deshalb
 * importieren beide Seiten von hier, nie umgekehrt.
 *
 * DIE ASYMMETRIE IST DER KERN: beim Schreiben gilt die feste Liste, beim
 * Anzeigen gilt Toleranz. Der Grund liegt in der Herkunft der Werte — neue
 * Abgaben kommen aus einem Formular mit genau diesen drei Knoepfen, der
 * Altbestand aus einem Feld, das Freitext war.
 *
 * WEIL DIE KATEGORIE HIER EINE SPALTE IST, kann sie kein Verzeichnis mehr
 * erzeugen: `drop` legte aus ihr per `mkdir recursive` einen Pfad an
 * (`drop/src/app.js:315-316`), nachdem `sanitizeCategory` nur zeichenweise
 * gesaeubert hatte. Damit entfaellt `mkdir` auf Nutzereingabe — und der
 * Sentinel `__none__`, der die Alt-Saeuberung unveraendert ueberlebte, hat
 * keine Wirkung mehr.
 */

/** Ein Wert, der in die Spalte `inbox_files.kategorie` geschrieben werden darf. */
export type SchreibbareKategorie = "bilder" | "dokumente" | "sonstiges";

/**
 * Die drei Werte, die das Abgabeformular anbietet — Wert und Beschriftung
 * 1:1 aus `drop/src/app.js:22-35` (`UPLOAD_CATEGORIES`, veroeffentlicht ueber
 * `/api/upload/context`).
 *
 * DIESE DREI SIND EINE VORLAGE, NOCH KEINE ANTWORT. Sie sind heute
 * gleichzeitig Verzeichnisnamen unter `/srv/fuekw/drop_inbox` und META-Feld;
 * welche Verzeichnisse dort REAL existieren, weiss nur der Betreiber
 * (Spec §13.1 Frage 5, `find -maxdepth 1 -type d`). Der Preis, falls die
 * Antwort andere Namen nennt: das ist eine **Migration plus
 * Formularaenderung**, kein Einzeiler — die Werte stehen dann in Bestandszeilen
 * der Spalte, im Formular und in den Filtern des Posteingangs.
 *
 * Die Reihenfolge ist die Reihenfolge im Formular; die Liste ist die einzige
 * Quelle, `istSchreibbareKategorie` leitet daraus ab.
 */
export const SCHREIBBARE_KATEGORIEN = [
  { wert: "bilder", beschriftung: "Bilder" },
  { wert: "dokumente", beschriftung: "Dokumente" },
  { wert: "sonstiges", beschriftung: "Sonstiges" },
] as const satisfies readonly { wert: SchreibbareKategorie; beschriftung: string }[];

/**
 * Was anstelle einer fehlenden Kategorie steht. Ein benannter Wert und nicht
 * die leere Zelle: eine leere Zelle ist von "Spalte vergessen" nicht zu
 * unterscheiden, und der Altbestand besteht ueberwiegend aus Dateien ohne
 * Kategorie (die META entstand nur bei gesetztem Hinweis ODER Kategorie).
 */
export const KATEGORIE_LEER_ANZEIGE = "Ohne Kategorie";

/**
 * Darf dieser Wert in die Spalte? Exakter Vergleich, **keine**
 * Normalisierung.
 *
 * WARUM NICHT NACHSICHTIG: der einzige Schreibweg ist eine Radiogruppe mit
 * genau diesen drei Werten. Ein `.trim().toLowerCase()` vor dem Nachschlagen
 * wuerde deshalb nichts Legitimes retten, aber einen Wert in die Spalte
 * schreiben, der so nirgends angeboten wurde — und danach ist einem DB-Wert
 * nicht mehr anzusehen, ob er aus dem Formular oder aus dem Import kommt.
 *
 * `null`/`undefined`/`""` sind **nicht** schreibbar: "keine Kategorie" ist
 * NULL in der Spalte, und diesen Weg waehlt der Aufrufer, nicht dieses
 * Praedikat. Nicht-Zeichenketten (FormData liefert auch `File`) ergeben
 * `false` statt eines Wurfs — ein Wurf waere hier ein 500 statt einer
 * Feldmeldung.
 */
export function istSchreibbareKategorie(wert: unknown): wert is SchreibbareKategorie {
  return SCHREIBBARE_KATEGORIEN.some((k) => k.wert === wert);
}

/**
 * Wie eine gespeicherte Kategorie angezeigt wird: **roh**, auch wenn sie
 * unbekannt ist.
 *
 * Der Altbestand kann jeden Wert tragen, den `sanitizeCategory` durchliess
 * (`berichte` steht im Alt-Test, `__none__` ebenso). Ein unbekannter Wert wird
 * deshalb angezeigt und nicht verworfen — sonst verschwinden Zeilen aus dem
 * Posteingang, deren Datei sehr wohl da ist, und der Betreiber sieht nicht,
 * dass er umbenennen muss.
 *
 * Bekannte Werte werden **nicht** auf ihre Beschriftung abgebildet: sonst
 * stuende in derselben Spalte "Bilder" neben "berichte", und der Unterschied
 * waere eine Eigenschaft dieser Funktion statt der Daten. Beschriftungen
 * gehoeren ins Formular.
 *
 * `""` UND REINE LEERZEICHEN GELTEN WIE `null`, und das ist keine Erfindung:
 * `sanitizeCategory` gab fuer jede leere Eingabe `''` zurueck, und
 * `drop/src/app.js:315` legte daraufhin im Wurzelverzeichnis ab
 * (`category ? path.join(…, category) : uploadDir`). Der Leerstring BEDEUTETE
 * dort also "keine Kategorie". Ihn hier als leere Zelle zu zeigen waere eine
 * zweite, unbenannte Darstellung derselben Sache.
 */
export function anzeigeKategorie(wert: string | null | undefined): string {
  if (wert === null || wert === undefined || wert.trim() === "") {
    return KATEGORIE_LEER_ANZEIGE;
  }
  return wert;
}
