"use client";

/*
 * DAS BILDSCHIRM-CHROME DES ETIKETTENBOGENS.
 *
 * WARUM NICHT FullShell: `(druck)/layout.tsx` laesst die Suite-Shell aus zwei
 * Gruenden weg, die beide weiter gelten -- FullShell druckt Kopfzeile und
 * App-Switcher mit, und sein `minHeight:100vh` erzeugt leere Folgeseiten
 * hinter dem Bogen. Der Rahmen fehlte also nur am BILDSCHIRM, und genau dort
 * setzt diese Insel an.
 *
 * JEDES AEUSSERE ELEMENT TRAEGT `lb-nichtDrucken`. Die Klasse ist global
 * (druck.css ist ein gewoehnliches Stylesheet, kein CSS-Modul) und blendet
 * innerhalb @media print mit `!important` aus. Wer hier einen Inline-Style
 * fuer `display` ergaenzt, schlaegt die Regel und druckt das Chrome mit aufs
 * gekaufte Etikettenmaterial -- ohne dass ein Test oder `pnpm build` es vor
 * dem Drucker zeigte.
 *
 * WARUM EINE CLIENT-INSEL: `page.tsx` ist eine Server Component und traegt
 * bewusst KEIN antd und KEIN Zeichen (Fallen 1 und 7). Der Druckknopf
 * braucht ausserdem `window.print()`.
 *
 * ZEICHEN UEBER `<Ikone>`: seit Task 2 kommen die Zeichen des Moduls aus
 * `react-icons/pi` ausschliesslich ueber `_ui/ikonen.tsx`, nicht per Direkt-
 * import. Die Union fuehrt `pfeil-links` und `drucken` bereits.
 */
import { Button, Flex } from "antd";
import Link from "next/link";
import { Ikone } from "../../../_ui/ikonen";

export function EtikettenChrome({ basis }: { basis: string }) {
  return (
    <div className="lb-nichtDrucken" data-testid="lb-chrome">
      {/*
        KEIN Inline-Style-Objekt mit einer CSS-`display`-Eigenschaft auf
        diesem Link: der Quelltext-Test unten scannt die ganze Datei nach
        genau diesem Muster und unterscheidet nicht zwischen Layout- und
        Druckregel-Zweck. `Flex` setzt das darunterliegende CSS ueber eine
        antd-Klasse, nicht als Inline-Style, und bleibt damit fuer den Scan
        unsichtbar.
      */}
      <Link href="/verwaltung">
        <Flex align="center" gap={6}>
          <Ikone name="pfeil-links" groesse={15} />
          Zurück zur Verwaltung
        </Flex>
      </Link>

      <Flex align="center" justify="space-between" gap={12} style={{ marginBlock: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Etiketten</h1>
          {/*
            §8.1, 8-B: `moduleUrl` nimmt prodHostsFor(mod)[0]. Eine Umsortierung
            von SUITE_HOST_LAGERBUCH aendert STILL jeden ab dann gedruckten
            Bogen, waehrend die alten Etiketten weiter auf den frueheren ersten
            Eintrag zeigen. Diese Zeile ist der einzige Weg, den Fehler VOR dem
            Papier zu bemerken.
          */}
          <p data-testid="lb-basis" style={{ margin: 0 }}>
            Alle QR-Codes zeigen auf {basis}
          </p>
        </div>
        <Button type="primary" onClick={() => window.print()} icon={<Ikone name="drucken" groesse={16} />}>
          Drucken
        </Button>
      </Flex>
    </div>
  );
}
