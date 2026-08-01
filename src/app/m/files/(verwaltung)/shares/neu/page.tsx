import Link from "next/link";

import { grenzen } from "../../../_lib/grenzen";
import { UploadInsel } from "../../../_ui/UploadInsel";

/**
 * `/shares/neu` — DIE SEITE, DIE EINE FREIGABE ANLEGT (Spec §7.1, §10.1; Plan T35).
 *
 * SIE IST EINE SERVER COMPONENT UND BLEIBT ES. Alles Interaktive — Formular,
 * Fortschritt, Abbrechen, Wiederholen — liegt in `_ui/UploadInsel.tsx`. Der
 * Grund ist nicht Stil, sondern zwei Fallen, die HTTP 500 fuer die ganze Seite
 * ergeben und die weder `pnpm build` noch ein Vitest findet:
 *
 * 1. **Compound-Zugriff auf antd in RSC.** `Form.Item`, `Input.TextArea`,
 *    `Upload`, `List.Item` sind bei einer Datei-Verwaltung die erste Wahl und
 *    in einer Server Component `undefined` (`docs/design/README.md:39-44`).
 *    Diese Datei importiert deshalb NICHTS aus `antd`.
 * 2. **Ein WERT aus einem `"use client"`-Modul.** Die Zahlen unten kommen aus
 *    `_lib/grenzen.ts` — einem Modul OHNE `"use client"` — und werden als
 *    einfache Props weitergereicht. Aus der Insel wird ausschliesslich die
 *    KOMPONENTE importiert; `FILES_CHUNK_BYTES` von dort zu lesen ist bei
 *    einem Upload-Modul der naheliegende Griff und ergaebe eine
 *    Client-Referenz statt einer Zahl (`docs/design/README.md:87-103`).
 *
 * KEIN ZWEITER RIEGEL HIER. Host-Rolle und Zugriff stehen in
 * `(verwaltung)/layout.tsx` (`requireRolle("verwaltung", …)` und
 * `requireFilesAccess()`), und `anlegenAction` ruft `requireFilesAccess()`
 * ausserdem selbst — eine Layout-Pruefung erstreckt sich nicht auf die Actions
 * darunter (§2.4). Eine dritte Fassung hier waere eine dritte Wahrheit.
 *
 * `grenzen()` wird HIER gerufen und nicht in der Insel: die Funktion liest
 * `process.env`, und die ist im Browser leer.
 */
export default async function NeueFreigabeSeite() {
  const g = grenzen();

  return (
    <div data-testid="files-neue-freigabe">
      {/*
       * DER WEG ZURUECK. Jede Verwaltungsseite fuehrt zurueck, sonst ist sie
       * eine Sackgasse (`docs/design/README.md:244`). Ziel ist die
       * Modulwurzel — `/shares/<id>` (T41) gibt es noch nicht, und ein Weg in
       * einen 404 waere schlimmer als kein Weg.
       */}
      <p>
        <Link href="/">← Alle Freigaben</Link>
      </p>

      {/* Ein nacktes `<h1>` und NICHT `Typography.Title`: der Compound-Zugriff
          ist in RSC `undefined` und ergibt HTTP 500. */}
      <h1>Neue Freigabe</h1>

      <UploadInsel
        maxAblaufTage={g.maxAblaufTage}
        maxDateienProShare={g.maxDateienProShare}
        maxDateiBytes={g.maxDateiBytes}
      />
    </div>
  );
}
