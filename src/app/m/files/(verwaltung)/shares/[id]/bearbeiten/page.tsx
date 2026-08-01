import Link from "next/link";
import { notFound } from "next/navigation";

import { ladeShareDetail } from "../../../../_db/queries";
import { grenzen } from "../../../../_lib/grenzen";
import { zeitpunktBerlin } from "../../../../_lib/zeit";
import { BearbeitenFormular } from "./BearbeitenFormular";

/**
 * `/shares/<id>/bearbeiten` — DIE SEITE, DIE EINE FREIGABE AENDERT
 * (Spec §7.3, §10.1; Plan T42).
 *
 * SIE IST EINE SERVER COMPONENT UND BLEIBT ES. Alles Interaktive liegt in
 * `BearbeitenFormular.tsx` daneben. Der Grund ist nicht Stil, sondern zwei
 * Fallen, die HTTP 500 fuer die ganze Seite ergeben und die weder `pnpm build`
 * noch ein Vitest findet:
 *
 * 1. **Compound-Zugriff auf antd in RSC.** `Form.Item`, `Input.TextArea`,
 *    `Input.Password` sind bei einem Formular die erste Wahl und in einer Server
 *    Component `undefined` (`docs/design/README.md:39-44`). Diese Datei
 *    importiert deshalb NICHTS aus `antd` — dieselbe Linie wie `shares/neu`.
 * 2. **Ein WERT aus einem `"use client"`-Modul.** Die Zahlen unten kommen aus
 *    `_lib/grenzen.ts` — einem Modul OHNE `"use client"` — und werden als
 *    einfache Props weitergereicht (`docs/design/README.md:87-103`).
 *
 * `grenzen()` wird HIER gerufen und nicht im Formular: die Funktion liest
 * `process.env`, und die ist im Browser leer.
 *
 * HIER WIRD ALLES GERECHNET, WAS AN EINER UHR ODER EINER EINHEIT HAENGT. Das
 * Formular bekommt fertigen Text und fertige Zahlen — keine `Date`-Objekte,
 * keine Drizzle-Zeile, und insbesondere kein `password_hash`: `ladeShareDetail`
 * holt ihn gar nicht erst, `hatPasswort` entsteht in SQLite (`_db/queries.ts`).
 *
 * KEIN ZWEITER RIEGEL HIER. Host-Rolle und Zugriff stehen in
 * `(verwaltung)/layout.tsx`, und `bearbeitenAction` ruft `requireFilesAccess()`
 * ausserdem selbst — eine Layout-Pruefung erstreckt sich nicht auf die Actions
 * darunter (§2.4). Eine dritte Fassung hier waere eine dritte Wahrheit.
 */

/**
 * Die Einheit steht im NAMEN, nicht in einem Kommentar (§9.1). `expires_at`
 * fuehrt SEKUNDEN (`mode: "timestamp"`), Drizzle liefert daraus ein `Date`, und
 * `Date.getTime()` liefert MILLISEKUNDEN — hier wird deshalb nie mit 1000
 * multipliziert oder geteilt. Ein Faktor-1000-Fehler waere still: eine
 * Restlaufzeit von 6 Tagen saehe als 6 Sekunden im Formular immer noch nach
 * einer plausiblen Zahl aus.
 */
const MILLISEKUNDEN_PRO_TAG = 24 * 60 * 60 * 1000;

/**
 * DIE RESTLAUFZEIT IN GANZEN TAGEN — die einzige Zahl, die man wieder abschicken
 * darf, ohne die Zeile zu veraendern.
 *
 * Die Alternative waere die urspruengliche Laufzeit aus `created_at`: sie ist
 * hier FALSCH, weil die Action `jetzt + n * 86400 s` schreibt — ein
 * Wiedereinreichen verlaengerte den Share um die schon verstrichene Zeit.
 *
 * `Math.ceil` und nicht `round` oder `floor`: Aufrunden kann eine Laufzeit nur
 * verlaengern, Abrunden koennte sie VERKUERZEN — und genau das Verkuerzen ist
 * der Alt-Defekt, den dieser Task nicht mitportiert (§7.3, Punkt 1).
 *
 * `null` fuer eine abgelaufene Freigabe, und das ist kein Randfall zum
 * Wegdruecken: eine geratene `1` waere derselbe Fehler wie `useState(1)`, und
 * „0 Tage" lehnt die Action ausdruecklich ab. Ein leeres Feld ist die einzige
 * ehrliche Vorbelegung — wer die Freigabe wiederbeleben will, sagt mit einer
 * Zahl, wie lange.
 */
function restTage(ablaufAt: Date, jetzt: Date): number | null {
  const rest = ablaufAt.getTime() - jetzt.getTime();
  return rest <= 0 ? null : Math.ceil(rest / MILLISEKUNDEN_PRO_TAG);
}

export default async function ShareBearbeitenSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const share = await ladeShareDetail(id);
  // `ladeShareDetail` liefert `null` statt zu werfen — `notFound()` gehoert in
  // die Seite, nicht in eine Abfrage (`_db/queries.ts`).
  if (share === null) notFound();

  const g = grenzen();
  const jetzt = new Date();

  return (
    <div data-testid="files-share-bearbeiten">
      {/*
       * DER WEG ZURUECK. Jede Verwaltungsseite fuehrt zurueck, sonst ist sie
       * eine Sackgasse (`docs/design/README.md:244`). Ziel ist die Modulwurzel
       * und NICHT `/shares/<id>`: die Detailseite entsteht in einem anderen Task
       * derselben Welle, und ein Weg in einen 404 waere schlimmer als ein Weg
       * eine Ebene hoeher. Dieselbe Entscheidung wie in `shares/neu/page.tsx`.
       */}
      <p>
        <Link href="/">← Alle Freigaben</Link>
      </p>

      {/* Ein nacktes `<h1>` und NICHT `Typography.Title`: der Compound-Zugriff
          ist in RSC `undefined` und ergibt HTTP 500. */}
      <h1>Freigabe bearbeiten</h1>
      <p>{share.titel}</p>

      <BearbeitenFormular
        shareId={share.id}
        titel={share.titel}
        // Leer heisst „keine Beschreibung": die Spalte ist nullable, und die
        // Action schreibt einen leeren Text wieder als NULL zurueck.
        beschreibung={share.beschreibung ?? ""}
        // `null` = UNBEGRENZT, nicht 0 und nicht −1 (§4.2) — deshalb der
        // ausdrueckliche Vergleich und niemals `||`: die Alt-Zeile
        // `maxDownloads || null` machte aus „0 Downloads" still einen
        // unbegrenzten Share.
        maxDownloadsText={share.maxDownloads === null ? "" : String(share.maxDownloads)}
        hatPasswort={share.hatPasswort}
        restTage={restTage(share.ablaufAt, jetzt)}
        /* Die Zeitzone steht im NAMEN und nur EINMAL, in `_lib/zeit.ts`. Ohne
           feste Zone formatierte `Intl` in der Zone des Serverprozesses — im
           Container UTC. Die Restlaufzeit oben ist davon unberuehrt: sie ist
           eine DIFFERENZ zweier Zeitpunkte und damit zonenfrei. */
        ablaufText={zeitpunktBerlin(share.ablaufAt)}
        // Serverseitig entschieden: rechnete es der Browser, entschieden Server
        // und Client an der Ablaufsekunde verschieden.
        abgelaufen={share.ablaufAt.getTime() <= jetzt.getTime()}
        maxAblaufTage={g.maxAblaufTage}
      />
    </div>
  );
}
