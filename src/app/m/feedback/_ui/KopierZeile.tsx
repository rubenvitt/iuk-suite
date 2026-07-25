"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "antd";

/**
 * DER KOPIERKNOPF DER TEILNAHME-ZONE (Entwurf §2.4, §4.13).
 *
 * Client-Insel aus einem Grund: `navigator.clipboard`. Kopiert wird die
 * VOLLSTÄNDIGE Adresse mit Protokoll und Host — der Rohtoken war der Ist-Zustand
 * und landete so in WhatsApp-Gruppen, wo er nicht anklickbar ist.
 *
 * Die Rückmeldung sitzt AM KNOPF („Kopiert ✓", 2 s) und nicht in einem Toast:
 * man sieht den Knopf an, den man gerade gedrückt hat, und ein Toast in der
 * Bildschirmecke ist für diese Bestätigung die falsche Entfernung.
 *
 * NAMENSWAHL: der Entwurf nennt die Insel `KopierZeile` (§4.13). Sie ist der
 * KNOPF der Knopfzeile aus §2.4, nicht der Klartextblock darüber — der ist
 * server-gerendert (`userSelect: all`), damit die Adresse auch ohne JavaScript
 * markierbar bleibt.
 *
 * KEIN `type="primary"`: pro Seite gibt es genau einen Primärknopf (§2.6), und
 * das ist nie das Kopieren. Rot ist in diesem Projekt `colorPrimary` (§4.9).
 */

export type KopierZeileProps = {
  /** Die vollständige Teilnahme-Adresse — `${proto}://${host}/f/${token}`. */
  url: string;
};

/** 2 s: lang genug zum Lesen, kurz genug, dass der Knopf nicht „Kopiert" heißt. */
const RUECKMELDUNG_MS = 2000;

export function KopierZeile({ url }: KopierZeileProps) {
  const [kopiert, setKopiert] = useState(false);
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Aufräumen beim Ausbauen: ein `setState` nach dem Unmount ist eine Warnung
  // ohne Nutzen, und der Timer hält sonst eine Referenz auf die Komponente.
  useEffect(() => () => { if (uhr.current) clearTimeout(uhr.current); }, []);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Ohne Berechtigung (oder ohne sicheren Kontext) bleibt die Adresse
      // darüber markierbar — deshalb kein Alarm, nur keine Bestätigung.
      return;
    }
    setKopiert(true);
    if (uhr.current) clearTimeout(uhr.current);
    uhr.current = setTimeout(() => setKopiert(false), RUECKMELDUNG_MS);
  };

  return (
    <Button onClick={kopieren} className="fb-block-mobil">
      {kopiert ? "Kopiert ✓" : "Kopieren"}
    </Button>
  );
}
