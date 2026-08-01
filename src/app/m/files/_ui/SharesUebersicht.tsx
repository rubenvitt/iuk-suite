import { Button, Card } from "antd";
import { notFound } from "next/navigation";
import { ladeUebersicht } from "../_db/queries";
import type { Rolle } from "../_lib/hostRolle";

/**
 * DIE FREIGABEN-UEBERSICHT — GERUEST UND LEERZUSTAND (Spec §7.3, §10.1).
 *
 * DIESE KOMPONENTE LAEDT IHRE ZEILEN SELBST. `page.tsx` uebergibt ihr die ROLLE
 * und sonst nichts — kein Zeilen-Prop, keine Projektion, kein `viewer`. Das ist
 * eine Festlegung ueber die Naht, nicht ueber den Geschmack: die Uebersicht wird
 * in Welle 6b zur Tabelle (T36) und bekommt in Welle 8a die Ablage-Kachel (T46).
 * Liefe der Ladeweg ueber `page.tsx`, haette der Rollen-Verteiler in JEDER dieser
 * Wellen einen zweiten Bearbeiter — und `page.tsx` ist die Datei, an der die
 * Rollentrennung samt Riegel haengt. So bleibt sie nach dieser Welle unberuehrt.
 *
 * ANTD IN EINER SERVER COMPONENT — ABER OHNE COMPOUND-ZUGRIFF. `Card` und
 * `Button` sind in RSC sicher; `Typography.Title` und Geschwister sind es NICHT
 * (sie sind in RSC `undefined` und ergeben HTTP 500, das `pnpm build` nicht
 * sieht). Die Ueberschrift ist deshalb ein nacktes `<h1>` — nicht aus Sparsamkeit,
 * sondern weil die naheliegende antd-Form die Seite abschieszt.
 *
 * WAS HIER (NOCH) NICHT STEHT: die Tabelle mit Status/Menge/Datum je Zeile, die
 * Kartenliste unter 767.98px, der QR-Dialog und die Zeilenaktionen. Alle vier
 * gehoeren T36 und brauchen `"use client"` — `columns` mit `render`-Funktionen
 * reicht Funktionen ueber die RSC-Grenze, und das scheitert unabhaengig von der
 * Compound-Falle.
 */
export async function SharesUebersicht({ rolle }: { rolle: Rolle }) {
  /*
   * DIE ROLLE IST DIE ZWEITE LINIE, nicht Zierde. Diese Ansicht zeigt die
   * Freigaben ALLER Mitglieder — Titel, Mengen, Ablauf. Auf der Inbox-Domain
   * darf sie nie erscheinen, dort ist jede Anfrage anonym.
   *
   * Entschieden wird das im Verteiler (`page.tsx`, Zweig `verwaltung`); diese
   * Zeile ist der Riegel am Ort der Daten, dieselbe Bauform wie
   * `requireFilesAccess()` aus ZWEI Stellen (§3.5). Sie kann heute nicht
   * ausloesen — und genau deshalb steht sie hier: der Tag, an dem jemand die
   * Uebersicht aus einer zweiten Seite rendert, ist der Tag, an dem sie es tut.
   * `notFound()` und nicht ein Wurf, weil das Modul die Existenz einer Ansicht
   * nirgends verraet.
   */
  if (rolle !== "verwaltung") notFound();

  const zeilen = await ladeUebersicht();

  return (
    <div data-testid="files-uebersicht">
      <h1>Freigaben</h1>

      {zeilen.length === 0 ? (
        <Card data-testid="files-uebersicht-leer">
          <p>Noch keine Freigabe angelegt.</p>
          {/*
           * DER KNOPF GEHOERT ZUM LEERZUSTAND, nicht daneben (§10.1): ohne ihn
           * ist die leere Seite eine Sackgasse, und `anlegenAction` haette
           * ausschlieszlich auf `/shares/neu` einen Einstieg — §10.2 verlangt
           * beide. Kein `size`: `controlHeight` ist 56 und schon das richtige
           * Touch-Masz, `size="large"` waeren 72px.
           *
           * Das Ziel `/shares/neu` entsteht in Welle 6a (T35); bis dahin fuehrt
           * der Knopf in einen 404 aus Abwesenheit. Das ist der einzige
           * Einstiegspunkt des Moduls mit dieser Eigenschaft und er ist
           * beabsichtigt — die Alternative waere ein Leerzustand ohne Ausweg,
           * der spaeter jemand nachtragen muesste.
           */}
          <Button type="primary" href="/shares/neu">
            Freigabe anlegen
          </Button>
        </Card>
      ) : (
        /*
         * DER NICHT-LEERE FALL IST BEWUSST SCHLICHT UND BEWUSST NICHT LEER.
         * Diese Welle sagt den Leerzustand zu; die Tabelle folgt in T36. Ein
         * Geruest, das vorhandene Freigaben VERSCHWEIGT, waere aber die
         * schlechtere Zwischenstufe — es saehe aus wie ein leeres Modul. Die
         * Zeile traegt deshalb schon Titel, MENGE und DATUM und nicht nur einen
         * Link (Prueffrage aus `docs/design/README.md:249`).
         */
        <ul data-testid="files-uebersicht-liste">
          {zeilen.map((zeile) => (
            <li key={zeile.id}>
              {zeile.titel} — {zeile.anzahlDateien}{" "}
              {zeile.anzahlDateien === 1 ? "Datei" : "Dateien"}, Ablauf{" "}
              {zeile.ablaufAt.toLocaleDateString("de-DE")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
