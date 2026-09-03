"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { entferneZeichen } from "../actions";
import { VERWAIST_TEXT, type MerkAnzeige } from "../_lib/merkliste";
import s from "./zeichen.module.css";

/*
 * DIE MERKLISTE ALS EIGENE CLIENT-KOMPONENTE — Vorbild
 * `lagerbuch/verwaltung/(arbeit)/LetzteBuchungenTable.tsx` und
 * `aufgaben/_ui/RoutinenTabelle.tsx`.
 *
 * ⛔ SIE BEKOMMT NUR SERIALISIERBARE DATEN (Falle 9). `(shell)/merkliste/page.tsx`
 * bleibt dadurch eine Server Component: sie liest die Zeilen, ruft
 * `merkAnzeige()` und reicht das Ergebnis weiter. Eine Funktion — etwa ein
 * fertiger Entfernen-Handler — kaeme ueber die RSC-Grenze NICHT an
 * („Functions cannot be passed directly to Client Components"), und weder
 * `pnpm build` noch ein jsdom-`mount()` saehe das: der Build prueft Modulgrenzen
 * statt Serialisierung, und jsdom kennt gar keine RSC-Grenze.
 *
 * `entferneZeichen` ist die EINE erlaubte Ausnahme: Server Actions sind
 * serialisierbar — aber DIREKT IMPORTIERT, nie als Prop durchgereicht.
 */
export function MerklisteZeilen({ zeilen }: { zeilen: readonly MerkAnzeige[] }) {
  /*
   * Die laufende Id EINZELN, nicht nur ein Sammel-Flag: mit `loading={laeuft}` an
   * jedem Knopf draehte nach einem Klick die ganze Liste, und die Oberflaeche
   * behauptete etwas, das nicht stimmt.
   */
  const [laufend, setLaufend] = useState<string | null>(null);
  const [imUebergang, starte] = useTransition();

  if (zeilen.length === 0) {
    return (
      <p style={SCHRIFT.text} data-testid="zeichen-merkliste-leer">
        Noch nichts gemerkt. Im Katalog steht an jedem Zeichen der Knopf „Merken“.
      </p>
    );
  }

  return (
    <ul className={s.merkliste} data-testid="zeichen-merkliste">
      {zeilen.map((z) => (
        <li
          key={z.zeichenId}
          className={s.merkzeile}
          data-testid={`zeichen-merkzeile-${z.zeichenId}`}
        >
          {/* Kein Bild fuer eine verwaiste Zeile: es gaebe keines, und ein
              erfundenes waere schlimmer als ein leerer Platzhalter. */}
          {z.svg === null ? (
            <span className={s.zeichenfehlt} aria-hidden="true" />
          ) : (
            <span
              className={s.zeichenflaeche}
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: z.svg }}
            />
          )}

          <div className={s.merktext}>
            {z.verwaist ? (
              /* Kein Link — `/katalog/<id>` liefe hier in ein notFound(). */
              <span style={SCHRIFT.text}>{z.titel}</span>
            ) : (
              <Link
                href={`/m/zeichen/katalog/${encodeURIComponent(z.zeichenId)}`}
                style={SCHRIFT.text}
              >
                {z.titel}
              </Link>
            )}
            <span style={SCHRIFT.neben}>{z.verwaist ? VERWAIST_TEXT : z.bedeutung}</span>
          </div>

          <Button
            data-testid={`zeichen-merkliste-entfernen-${z.zeichenId}`}
            loading={imUebergang && laufend === z.zeichenId}
            onClick={() => {
              setLaufend(z.zeichenId);
              starte(async () => {
                await entferneZeichen(z.zeichenId);
              });
            }}
          >
            Entfernen
          </Button>
        </li>
      ))}
    </ul>
  );
}
