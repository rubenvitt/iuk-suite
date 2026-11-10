"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "antd";

import { QrDialog } from "./QrDialog";
import styles from "./shareDetailAktionen.module.css";
import { useKopieren } from "./useKopieren";

/**
 * DER LINK EINER FRISCH ANGELEGTEN FREIGABE (IDA-388). Wer eine Freigabe
 * anlegt, will sie weitergeben — vorher stand nach dem Hochladen nur „Zurück
 * zur Übersicht" da, und der Link lag drei Klicks entfernt hinter
 * „Bearbeiten → Abbrechen".
 *
 * Adresse als Text (markierbar, auch ohne `navigator.clipboard`), Kopieren, QR
 * und der Weg auf die Detailseite. Dieselbe Knopfzeilen-Regel wie auf der
 * Detailseite (unter 768px volle Breite, untereinander) — deshalb dasselbe
 * CSS-Modul statt einer Abschrift.
 */
export function FreigabeLink({
  shareId,
  titel,
  adresse,
  qrDateiname,
}: {
  shareId: string;
  titel: string;
  /** Vollständige öffentliche Adresse — nie relativ: sie wird weitergegeben. */
  adresse: string;
  qrDateiname: string;
}) {
  const { kopiert, kopieren } = useKopieren();
  const [qrOffen, setQrOffen] = useState(false);

  return (
    <div className={styles.aktionen} data-testid="files-neu-link">
      <p className={styles.adresse} data-testid="files-neu-adresse">
        {adresse}
      </p>
      <div className={styles.knopfzeile}>
        <Button
          className={styles.knopf}
          type="primary"
          onClick={() => void kopieren(adresse)}
          data-testid="files-neu-kopieren"
        >
          {kopiert ? "Kopiert ✓" : "Link kopieren"}
        </Button>
        <Button
          className={styles.knopf}
          onClick={() => setQrOffen(true)}
          data-testid="files-neu-qr"
        >
          QR
        </Button>
      </div>
      <p>
        <Link href={`/shares/${shareId}`} data-testid="files-neu-detail">
          Zur Freigabe
        </Link>
        {" · "}
        <Link href="/">Alle Freigaben</Link>
      </p>
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
