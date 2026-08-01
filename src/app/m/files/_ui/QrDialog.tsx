"use client";

import { Button, Modal } from "antd";

/**
 * DER QR-DIALOG DER FREIGABEN (Spec §7.9, §10.2; Plan T36 Punkt 8).
 *
 * ER ZEIGT UND ER LAEDT HERUNTER — beides, und der Download ist der Grund, dass
 * es diese Datei gibt: `drop` hatte den PNG-Download, `easy-filesharing` nicht,
 * und §7.9 haelt ausdruecklich fest, dass er beim Port nicht unbemerkt
 * wegfallen darf. Ein Dialog, der den Code nur anzeigt, waere die stille
 * Variante des Wegfalls — man sieht ihn ja.
 *
 * DER DATEINAME KOMMT FERTIG HEREIN. Er entsteht serverseitig aus
 * `entschaerfeTitel` (`_lib/zip.ts`), und zwar nicht aus Bequemlichkeit: `zip.ts`
 * zieht ueber `_lib/av.ts` `node:net` STATISCH in den Modulgraphen. Ein Import
 * von hier aus truege das ins Client-Bundle — ein lauter Bundler-Fehler in `dev`
 * und `build`, den `pnpm typecheck` nicht zeigt. Dieselbe Aufteilung wie bei den
 * Abgabelinks (`ZugangslinksListe`/`zugangslinks/page.tsx`).
 *
 * RELATIVE ADRESSE, und das ist hier RICHTIG — anders als bei den Abgabelinks.
 * `/api/s/<id>/qr.png` liegt auf DEMSELBEN (Verwaltungs-)Host wie diese Seite:
 * `decideRoute` schreibt jeden Pfad des Hosts auf `/m/files/<pfad>` um
 * (`core/routing.ts`). Ein absoluter Link waere hier kein Schutz, sondern ein
 * zweiter Ort, an dem derselbe Host anders bestimmt wuerde. Die Regel „Links auf
 * Inbox-Pfade sind absolut" (§10.2) gilt fuer die ANDERE Rolle.
 *
 * UND DESHALB WIRKT `download` HIER AUCH. Bei den Abgabelinks tut es das nicht —
 * dort ist die Herkunft fremd (Inbox-Domain), und der Browser ignoriert das
 * Attribut; die Route loest es dort ueber `?dl=1`. Der Share-QR braucht keinen
 * solchen Parameter, und er kennt ihn auch nicht: `api/s/[id]/qr.png/route.ts`
 * liest ausschliesslich `w`. Wer hier `?dl=1` anhinge, erzeugte einen zweiten
 * Cache-Schluessel fuer dasselbe Bild und keine einzige Wirkung.
 */

export type QrDialogProps = {
  shareId: string;
  /** Nur fuer die Ueberschrift und den Alternativtext — nie fuer den Dateinamen:
   *  der ist schon entschaerft (siehe Kopfkommentar). */
  titel: string;
  /** `<entschaerfter-titel>-qr.png`, serverseitig gebildet. */
  qrDateiname: string;
  offen: boolean;
  schliessen: () => void;
};

/** Vorschau und Download trennen sich nur in der Breite: 512 reicht auf dem
 *  Schirm, 1024 ist die Groesze, die ein Ausdruck braucht. Die Route klemmt auf
 *  2048 — beide Werte liegen also innerhalb. */
const BREITE_ANZEIGE = 512;
const BREITE_DOWNLOAD = 1024;

export function QrDialog({ shareId, titel, qrDateiname, offen, schliessen }: QrDialogProps) {
  const qrAdresse = `/api/s/${shareId}/qr.png`;

  return (
    <Modal
      open={offen}
      onCancel={schliessen}
      /* Kein `footer`: der einzige Knopf ist der Download, und der gehoert
         neben das Bild, nicht in eine Fuszzeile mit „OK". */
      footer={null}
      title={`QR-Code für „${titel}“`}
      data-testid="files-share-qr-dialog"
    >
      {/*
       * eslint-disable-next-line @next/next/no-img-element — `next/image` liefe
       * ueber den Optimierer und braechte fuer ein PNG, das genau die Groesze
       * hat, die es haben soll, nur eine zweite Auslieferungsstrecke. Dieselbe
       * Entscheidung wie in `feedback/_ui/QrGross.tsx:75-80` und
       * `ZugangslinksListe.tsx`.
       */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        data-testid="files-share-qr-bild"
        src={`${qrAdresse}?w=${BREITE_ANZEIGE}`}
        alt={`QR-Code für die Freigabe „${titel}“`}
        width={220}
        height={220}
      />
      <p>
        Der Code führt auf die öffentliche Freigabeseite. Er bleibt gültig, solange es die Freigabe
        gibt — gedruckt ist gedruckt.
      </p>
      {/* Kein `size`: `controlHeight` ist 56 und schon das richtige Touch-Masz;
          `size="large"` waeren 72px. */}
      <Button
        href={`${qrAdresse}?w=${BREITE_DOWNLOAD}`}
        download={qrDateiname}
        data-testid="files-share-qr-png"
      >
        QR als PNG laden
      </Button>
    </Modal>
  );
}
