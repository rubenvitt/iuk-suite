"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Popconfirm } from "antd";

import {
  downloadsAufstockenAction,
  shareLoeschenAction,
  type ShareFormZustand,
} from "../(verwaltung)/actions";
import { QrDialog } from "./QrDialog";
import styles from "./shareDetailAktionen.module.css";

/**
 * DIE HANDLUNGEN DER SHARE-DETAILSEITE (Spec §7.3, §7.5, §7.9, §10.2; Plan T41
 * Punkt 7).
 *
 * WARUM ES DIESE INSEL GIBT — und warum die Seite trotzdem RSC bleibt. Drei der
 * vier Einstiegspunkte aus §10.2 lassen sich aus einer Server Component
 * strukturell nicht bedienen:
 *  - `QrDialog` (T36) nimmt `schliessen: () => void` — eine FUNKTION überquert
 *    die RSC-Grenze nicht.
 *  - `shareLoeschenAction` und `downloadsAufstockenAction` haben die Bauform
 *    `(_vorher, formData)`, die `useActionState` verlangt: ein nacktes
 *    `<form action={…}>` in einer Server Component bekäme die `FormData` als
 *    ERSTES Argument. Fehler müssen außerdem AM FELD ankommen und nicht auf
 *    einer technischen Fehlerseite (`docs/design/README.md:245-247`).
 *  - Der Bestätigungsdialog und der Kopierknopf (`navigator.clipboard`) tragen
 *    Zustand.
 * „Bearbeiten" ist dagegen nur ein Link und könnte auch in der Seite stehen — er
 * steht hier, damit die vier Handlungen EINE Knopfzeile bilden statt zweier
 * Reihen, die zufällig nebeneinander landen.
 *
 * DIE KNOPFZEILE HAT EINE REGEL, UND SIE IST VERBINDLICH: „Handlungsknöpfe unter
 * 768px sind volle Breite und stehen untereinander, nie nebeneinander"
 * (`docs/design/README.md:189-190`). Sie steht in
 * `shareDetailAktionen.module.css`; hier bleibt nur, was das Markup dazu
 * beitragen muss — und das ist mehr als eine Klasse am Container:
 *  - Die Umschaltung ist CSS, nie JavaScript. Kein `Grid.useBreakpoint`, kein
 *    `matchMedia`: ein JS-Breakpoint zeigt beim ersten Render die falsche
 *    Variante (`docs/design/README.md:163-165`).
 *  - JEDER Knopf trägt zusätzlich `styles.knopf`, auch der im Löschformular.
 *    Ein Kindselektor auf der Zeile träfe dort nur das `<form>`; der Knopf darin
 *    bliebe auto-breit und stünde halb so breit neben seinen Nachbarn. Die
 *    Begründung der Spezifität steht in der CSS-Datei, wo die Regel steht.
 *  - `size` wird an keinem Knopf gesetzt. `ARBEITSDICHTE` setzt `controlHeight`
 *    auf 44 (nicht mehr 56, korrigiert Aufgabe 12) und schon das richtige
 *    Touch-Maß; `size="large"` wären 72px, `size="small"` unterschritte die
 *    44px-Trefferfläche — und seit Aufgabe 12 gibt es dafür keine Ausnahme
 *    mehr, auch nicht innerhalb einer Tabellenzeile (`docs/design/README.md`,
 *    Falle 4). Eine Tabellenzeile gibt es hier ohnehin nicht.
 *
 * DIE WERTE KOMMEN FERTIG HEREIN — Text, keine `Date`-Objekte, keine
 * Drizzle-Zeilen. Dieselben drei Gründe wie bei `SharesTabelle`: `password_hash`
 * überquert die Grenze nicht, der Ablaufzustand hängt an der Uhr DES SERVERS,
 * und Größentexte entstehen an EINER Stelle (MiB gegen MB, Faktor 1,048576 —
 * §9.1).
 *
 * KEIN IMPORT AUS `_db/queries` ODER `_lib/zip`: beide ziehen `better-sqlite3`
 * bzw. über `_lib/av.ts` `node:net` nach, und aus einem `"use client"`-Modul
 * landete das im Client-Bundle. Der QR-Dateiname wird deshalb serverseitig
 * gebildet und hereingereicht — dieselbe Aufteilung wie bei `ZugangslinksListe`.
 */

export type ShareDetailAktionenProps = {
  shareId: string;
  titel: string;
  /** VOLLSTÄNDIG übertragene Dateien — die Zahl, die die Bestätigung nennt. */
  anzahlDateien: number;
  /** Summe AUS DEN ZEILEN, fertig formatiert (§7.3). */
  groesseText: string;
  /** `<entschärfter-titel>-qr.png`, serverseitig gebildet (§7.9). */
  qrDateiname: string;
  /** Vollständige öffentliche Adresse aus `oeffentlicheUrl("verwaltung", …)`
   *  (§3.2) — nie ein relativer Pfad: sie wird kopiert und weitergegeben. */
  oeffentlicheAdresse: string;
  /** `max_downloads IS NOT NULL`. **Nicht** die Zahl selbst: `0` ist ein
   *  gesetztes Limit (erschöpft), und eine Wahrheitsprüfung auf der Zahl
   *  blendete das Aufstocken genau dort aus, wo es gebraucht wird (§4.2). */
  hatDownloadLimit: boolean;
};

const START: ShareFormZustand = { ok: false, feldFehler: {}, werte: {} };

/** 2 s: lang genug zum Lesen, kurz genug, dass der Knopf nicht „Kopiert" heißt. */
const RUECKMELDUNG_MS = 2000;

function fehlerText(zustand: ShareFormZustand): string | null {
  if (zustand.ok) return null;
  const werte = Object.values(zustand.feldFehler);
  return werte.length === 0 ? null : werte.join(" ");
}

export function ShareDetailAktionen({
  shareId,
  titel,
  anzahlDateien,
  groesseText,
  qrDateiname,
  oeffentlicheAdresse,
  hatDownloadLimit,
}: ShareDetailAktionenProps) {
  const [qrOffen, setQrOffen] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loeschZustand, loeschen] = useActionState(shareLoeschenAction, START);
  const [aufstockZustand, aufstocken] = useActionState(downloadsAufstockenAction, START);
  const loeschFormular = useRef<HTMLFormElement>(null);

  // Ein `setState` nach dem Ausbauen ist eine Warnung ohne Nutzen, und der
  // Zeitgeber hielte sonst eine Referenz auf die Komponente.
  useEffect(
    () => () => {
      if (uhr.current) clearTimeout(uhr.current);
    },
    [],
  );

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(oeffentlicheAdresse);
    } catch {
      // Ohne Berechtigung (oder ohne sicheren Kontext) bleibt die Adresse
      // daneben markierbar — deshalb kein Alarm, nur keine Bestätigung.
      return;
    }
    setKopiert(true);
    if (uhr.current) clearTimeout(uhr.current);
    uhr.current = setTimeout(() => setKopiert(false), RUECKMELDUNG_MS);
  };

  const loeschFehler = fehlerText(loeschZustand);
  const aufstockFehler = fehlerText(aufstockZustand);

  return (
    <div className={styles.aktionen} data-testid="files-detail-aktionen">
      {/*
       * DIE ADRESSE STEHT ALS TEXT DA, nicht nur im Kopierknopf: ohne
       * `navigator.clipboard` (unsicherer Kontext, verweigerte Berechtigung)
       * bliebe sie sonst unerreichbar. `user-select: all` macht einen Klick zur
       * vollständigen Auswahl — es steht mit dem Umbruch zusammen in der
       * CSS-Datei, weil eine Adresse ohne Leerzeichen auf 390px keine
       * Umbruchstelle hat und die Seite sonst nach rechts schöbe.
       */}
      <p className={styles.adresse} data-testid="files-detail-adresse">
        {oeffentlicheAdresse}
      </p>

      {/* Der Griff für T48: Klassennamen eines CSS-Moduls sind gehasht und in
          Playwright nicht adressierbar — ohne diese `data-testid` hätte die
          Mobil-Abnahme nichts zu messen. */}
      <div className={styles.knopfzeile} data-testid="files-detail-knopfzeile">
        <Button
          className={styles.knopf}
          onClick={kopieren}
          data-testid="files-detail-kopieren"
        >
          {kopiert ? "Kopiert ✓" : "Link kopieren"}
        </Button>

        <Button
          className={styles.knopf}
          href={`/shares/${shareId}/bearbeiten`}
          data-testid="files-detail-bearbeiten"
        >
          Bearbeiten
        </Button>

        <Button
          className={styles.knopf}
          onClick={() => setQrOffen(true)}
          data-testid="files-detail-qr"
        >
          QR
        </Button>

        <form action={loeschen} ref={loeschFormular}>
          <input type="hidden" name="id" value={shareId} />
          <Popconfirm
            title="Freigabe löschen?"
            /*
             * DATEIZAHL UND GRÖSSE, beide (§7.3). „2 Dateien" allein sagt nicht,
             * was verloren geht, und eine Größe allein nicht, wie viele
             * Empfänger ins Leere laufen. Das Zugriffsprotokoll wird
             * ausdrücklich genannt, weil es NICHT mitstirbt (§4.5) — sonst
             * zögert jemand aus einem falschen Grund.
             */
            description={
              `„${titel}“ mit ${anzahlDateien} ${anzahlDateien === 1 ? "Datei" : "Dateien"} ` +
              `(${groesseText}) wird mit allen Dateien gelöscht. ` +
              `Das Zugriffsprotokoll bleibt erhalten.`
            }
            okText="Löschen"
            cancelText="Abbrechen"
            onConfirm={() => loeschFormular.current?.requestSubmit()}
          >
            {/* `danger` OHNE `type="primary"`: `colorError === colorPrimary ===
                #c8000f`, ein roter Vollknopf wäre pixelgleich mit einer
                Primäraktion. Rot bleibt am Rand. */}
            <Button className={styles.knopf} danger data-testid="files-detail-loeschen">
              Löschen
            </Button>
          </Popconfirm>
        </form>
      </div>

      {loeschFehler !== null && (
        /* `type="warning"` und NICHT `type="error"` — die Fehlerfarbe IST die
           Primärfarbe (`docs/design/README.md`, Falle 3). */
        <Alert
          type="warning"
          showIcon
          data-testid="files-detail-loeschen-fehler"
          message={loeschFehler}
        />
      )}

      {/*
       * „DOWNLOADS AUFSTOCKEN" ERSCHEINT NUR BEI GESETZTEM LIMIT (§10.2). Ein
       * unbegrenzter Share hat kein Limit, das man aufstocken könnte: das
       * `UPDATE` verlangt `max_downloads IS NOT NULL`, und ohne diese Bedingung
       * bekäme der Betreiber eine Erfolgsmeldung für einen Vorgang, der nichts
       * getan hat.
       *
       * Angegeben wird der ZUWACHS, nicht die neue Summe — so kann das `UPDATE`
       * ein `max_downloads + ?` bleiben und keinen gleichzeitig laufenden
       * Download überschreiben (§7.5).
       */}
      {hatDownloadLimit && (
        <form
          className={styles.aktionen}
          action={aufstocken}
          data-testid="files-detail-aufstocken"
        >
          <input type="hidden" name="id" value={shareId} />
          <label htmlFor="zusatzDownloads">Downloads aufstocken um</label>
          {/*
           * EINE ZWEITE `knopfzeile`, und das ist kein Zierrat: „Aufstocken" ist
           * ein Handlungsknopf wie die vier oben, und die 768px-Regel sagt
           * nicht „nur die oberste Reihe". Stünde er außerhalb, hätte dieselbe
           * Ansicht zwei verschiedene Antworten auf dieselbe Regel — und die
           * zweite fiele niemandem auf, weil sie nur unter 768px sichtbar wird.
           */}
          <div className={styles.knopfzeile} data-testid="files-detail-aufstocken-zeile">
            <Input
              className={styles.zahlfeld}
              id="zusatzDownloads"
              name="zusatzDownloads"
              type="number"
              min={1}
              step={1}
              defaultValue={10}
              status={aufstockFehler === null ? undefined : "warning"}
            />
            <Button
              className={styles.knopf}
              htmlType="submit"
              data-testid="files-detail-aufstocken-absenden"
            >
              Aufstocken
            </Button>
          </div>
          {aufstockFehler !== null && (
            <Alert
              type="warning"
              showIcon
              data-testid="files-detail-aufstocken-fehler"
              message={aufstockFehler}
            />
          )}
        </form>
      )}

      {qrOffen && (
        <QrDialog
          shareId={shareId}
          titel={titel}
          qrDateiname={qrDateiname}
          offen
          schliessen={() => setQrOffen(false)}
        />
      )}
    </div>
  );
}
