import type { DateiRow } from "../_db/schema";
import { Ikone } from "./ikonen";

/**
 * DER BILDTEIL EINES NACHWEISES (Aufgabe 19) — GEMEINSAM FUER `_ui/FreigabeZone.tsx` ("use client")
 * UND `a/[id]/page.tsx` (Server Component): „nur `sauber` liefert aus/zeigt an" gehoert an EINE
 * Stelle (Brief: „keine zweite Fassung einer Bedingung"), und diese Komponente ist reiner Konsument
 * eines bereits berechneten `freigegeben`-Booleans (`_db/queries.ts`s `mitDatei`, das intern EINMAL
 * `istFreigegeben` aus `_lib/scan.ts` aufruft) — sie importiert `_lib/scan.ts` selbst NICHT.
 *
 * WARUM DAS SICHER IN EINER CLIENT-INSEL IST: diese Datei importiert nur `./ikonen` (reine
 * SVG-Icons, bereits heute in Server- UND Client-Kontexten dieses Moduls verwendet) und Typen aus
 * `_db/schema.ts` (loeschen sich zur Laufzeit auf). KEIN `_lib/scan.ts`, KEIN `_lib/ablage.ts` —
 * beide importieren `node:fs/promises`/`@/core/av/scanner` statisch und buendelten das in den
 * Browser, ginge diese Komponente den Umweg selbst (dieselbe Falle wie ein direkter `zugang.ts`-
 * Import in `_ui/AktionsZone.tsx`, dort im Kopfkommentar benannt).
 *
 * KEIN `Content-Disposition`-Vertrauen hier: die `<img src>` zeigt auf die Auslieferungsroute, die
 * selbst noch einmal `darfNachweisSehen` UND `scanStatus === "sauber"` prueft (`route.ts`) — ein
 * gerendertes `<img>` fuer ein NICHT freigegebenes Bild waere ohnehin nur ein kaputtes Icon, kein
 * Sicherheitsproblem, aber genau deshalb wird hier gar nicht erst versucht, es zu laden.
 */

const GRUND_TEXT: Record<string, string> = {
  offen: "Der Nachweis wird noch geprüft.",
  befund: "Bei der Prüfung wurde ein Fund festgestellt — das Bild wird nicht angezeigt.",
  fehler: "Die Prüfung ist fehlgeschlagen — das Bild wird nicht angezeigt.",
};

export interface NachweisBildProps {
  aufgabeId: string;
  nachweisId: string;
  datei: Pick<DateiRow, "dateiname" | "scanStatus"> | null;
  freigegeben: boolean;
}

export function NachweisBild({ aufgabeId, nachweisId, datei, freigegeben }: NachweisBildProps) {
  if (freigegeben && datei !== null) {
    return (
      // `next/image` hilft hier nicht: die Quelle ist ein Route Handler mit Zugriffspruefung
      // (`a/[id]/nachweis/[nachweisId]/route.ts`), kein statisch bekanntes Bild — `next/image`
      // braucht entweder einen bekannten Import oder eine `remotePatterns`-Freigabe, beides passt
      // nicht auf einen authentifizierten, pro Aufruf geprueften Auslieferungspfad. Dieselbe
      // Abwaegung wie `feedback/_ui/Teilnahme.tsx` und `files/_ui/QrDialog.tsx`.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/a/${aufgabeId}/nachweis/${nachweisId}`}
        alt={datei.dateiname}
        // `data-testid` traegt die `nachweisId` NICHT (Aufgabe 19-Konvention dieses Moduls: Test-Ids
        // sind stabile Namen, keine dynamischen Werte) — Tests binden ueber `alt`/`src`.
        data-testid="nachweis-bild"
        style={{ maxWidth: 240, maxHeight: 240, display: "block", borderRadius: 4 }}
      />
    );
  }
  const grund = datei === null ? "Das Bild ist nicht verfügbar." : (GRUND_TEXT[datei.scanStatus] ?? "Das Bild ist nicht verfügbar.");
  return (
    <span
      data-testid="nachweis-bild-grund"
      style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      <Ikone name="nachweis-bild" />
      {grund}
    </span>
  );
}
