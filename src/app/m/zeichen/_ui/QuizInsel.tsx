"use client";

import { useState } from "react";
import { Button } from "antd";
import { AKTION_FEHLGESCHLAGEN } from "../_lib/aktionsfehler";
import type { Frage } from "../_lib/lernen/fragen";
import { stummesSvg } from "../_lib/stummesSvg";
import s from "./zeichen.module.css";

/*
 * ⛔ DIESE INSEL IMPORTIERT NICHTS AUS `_ui/baukasten/`. Dort liegt der einzige
 * Katalog-Code-Import des Moduls; ein Import von hier zoege 133 KB gzip auf den Lernpfad
 * und braeche `_lib/naht.test.ts`. Alles, was diese Insel braucht, kommt als
 * serialisierbares Prop herein: die Frage und das SVG des Ziels als STRING.
 *
 * `beantworte` ist eine Server Action und wird von der Seite DIREKT importiert und
 * durchgereicht — Server Actions duerfen als einzige Funktionen die RSC-Grenze
 * ueberqueren (Falle 9).
 *
 * ⛔ JEDES SVG DIESER FLAECHE LAEUFT DURCH `stummesSvg` UND STECKT IN EINER
 * `aria-hidden`-HUELLE (Abschlussreview, W1). Gemessen am Generat: jedes der 246
 * SVGs traegt `<title>` (= Titel), `<desc>` (= Bedeutung, bei 232 byteidentisch)
 * und `aria-labelledby` auf beide. Das ist im Katalog richtig und HIER die
 * Loesung: bei `zeichen_bedeutung` stand die Antwort im Fragebild, bei
 * `bedeutung_zeichen` nannte jede Option per Tooltip ihren Namen, und einem
 * Bildschirmleser las die Runde Frage UND Antwort in einem Zug vor.
 *
 * DIE ZWEI MASSNAHMEN DECKEN ZWEI VERSCHIEDENE LECKS und ersetzen einander
 * nicht: `stummesSvg` nimmt den nativen TOOLTIP, den `aria-hidden` gar nicht
 * beruehrt (es wirkt auf den Barrierefreiheitsbaum, nicht auf die
 * Browseroberflaeche); die Huelle nimmt das danach NAMENLOSE `role="img"` aus
 * dem Baum, damit dort nicht „Grafik" ohne Auskunft ankommt.
 *
 * DIE BESCHRIFTUNG KOMMT VON AUSSEN UND NENNT DEN NAMEN NICHT — der Fragetext am
 * Bild, die laufende Nummer an der Option. Am Fragebild traegt DASSELBE Element
 * `role="img"` und `aria-label` (seine Nachfahren sind damit praesentational);
 * ein zusaetzliches inneres Element ginge nicht, weil `.detailblatt` und
 * `.zeichengross` hier auf EINEM Knoten liegen und `.zeichengross > svg` ein
 * direktes Kind verlangt — die Groesse fiele sonst still auf 300x150 (Falle 5).
 * An der Option, die den Knopf als eigenes Element hat, steht die Huelle
 * dagegen wie im Katalog: `aria-hidden` am Bild, Name am Knopf. Vorbild:
 * `KatalogInsel.tsx`, `MerklisteZeilen.tsx`.
 */

/**
 * Die Beschriftung des Fragebildes. Sie steht hier und nicht sichtbar auf der
 * Flaeche, weil das Bild die Frage IST — ein zusaetzlicher Satz daneben waere
 * eine zweite Frage. Ein Bildschirmleser braucht ihn trotzdem, sonst kommt an
 * dieser Stelle „Grafik" ohne jede Auskunft an.
 */
const FRAGEBILD = "Welche Bedeutung hat dieses Zeichen?";
export function QuizInsel(props: {
  frage: Frage;
  /** Das SVG des Zielzeichens — nur bei `zeichen_bedeutung` gezeigt. */
  svg: string;
  beantworte: (
    zeichenId: string,
    typ: Frage["typ"],
    gewaehlteId: string,
  ) => Promise<{ richtig: boolean }>;
  /**
   * Der auf `/lernen` gewaehlte Lernset-Slug, unveraendert durchgereicht von
   * `runde/page.tsx`. ⛔ FIX-RUNDE 1, BEFUND W1: ohne dieses Prop haengte der
   * „Naechstes Zeichen"-Link fest auf `/m/zeichen/lernen/runde` OHNE `?set=` — die
   * zweite und jede weitere Frage einer Lernset-Runde uebte danach still im ganzen
   * Bestand, obwohl „Loesueben" mit gewaehltem Set gestartet wurde. Genau die Zusage,
   * die die Release-Notiz macht.
   */
  set?: string;
}) {
  const { frage, svg, beantworte, set } = props;
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [richtig, setRichtig] = useState<boolean | null>(null);
  const [aktionsfehler, setAktionsfehler] = useState<string | null>(null);

  const zielAntwort = frage.optionen.find((o) => o.id === frage.zeichenId)?.antwort ?? "";

  async function waehle(id: string) {
    if (gewaehlt !== null) return; // nach der Antwort gesperrt
    setGewaehlt(id);
    setAktionsfehler(null);
    try {
      const { richtig: r } = await beantworte(frage.zeichenId, frage.typ, id);
      setRichtig(r);
    } catch {
      /*
       * ⛔ EIN ABGEWIESENER SCHREIBVORGANG ZEIGT EINEN SATZ, ER ZERLEGT KEINE FLAECHE.
       * `beantworte` wirft ohne Sitzung — ohne `catch` naeme der Wurf die ganze
       * Quizflaeche mit. Die Wahl bleibt gesperrt (Vorbild `zeichenId` schon gesetzt),
       * aber es gibt keine Aufloesung — der naechste Versuch ist ein Neuladen der Seite.
       */
      setAktionsfehler(AKTION_FEHLGESCHLAGEN);
    }
  }

  return (
    <div className={s.modul} data-testid="quiz-frage">
      {frage.typ === "zeichen_bedeutung" ? (
        <div
          className={`${s.detailblatt} ${s.zeichengross}`}
          data-testid="quiz-zeichen"
          role="img"
          aria-label={FRAGEBILD}
          dangerouslySetInnerHTML={{ __html: stummesSvg(svg) }}
        />
      ) : (
        <p style={{ fontSize: "1.125rem" }} data-testid="quiz-bedeutung">
          {frage.stamm}
        </p>
      )}

      {aktionsfehler !== null && (
        <p className={s.hinweis} data-testid="zeichen-aktionsfehler" role="status">
          {aktionsfehler}
        </p>
      )}

      <div style={{ display: "grid", gap: 8, marginBlockStart: 16 }}>
        {frage.optionen.map((o, i) => (
          <button
            key={o.id}
            type="button"
            data-testid="quiz-option"
            disabled={gewaehlt !== null}
            onClick={() => waehle(o.id)}
            /* Die LAUFENDE NUMMER, nicht der Name: eine Bildoption haette nach
               `stummesSvg` sonst gar keinen Namen — und mit ihrem eigenen waere
               sie fuer einen Bildschirmleser die Antwort auf die Frage. */
            aria-label={o.svg ? `Antwort ${i + 1}` : undefined}
            // ARBEITSDICHTE: 44 als Literal, weil eigenes Markup den antd-Token nicht erbt.
            style={{ minHeight: 44, textAlign: "start", padding: "8px 12px" }}
          >
            {o.svg ? (
              <span
                className={s.zeichenflaeche}
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: stummesSvg(o.svg) }}
              />
            ) : (
              o.antwort
            )}
          </button>
        ))}
      </div>

      {richtig !== null && (
        <div
          data-testid="quiz-aufloesung"
          style={{
            marginBlockStart: 16,
            // Farbe ZULETZT — das Wort steht schon da.
            borderInlineStart: `3px solid var(--tz-lern-${richtig ? "richtig" : "falsch"})`,
            paddingInlineStart: 12,
          }}
        >
          <strong>{richtig ? "Richtig." : "Nicht ganz."}</strong>{" "}
          {richtig ? null : (
            <>
              Richtig wäre <strong>{zielAntwort}</strong> gewesen.{" "}
            </>
          )}
          <Button
            href={`/m/zeichen/lernen/runde${set ? `?set=${set}` : ""}`}
            type="link"
            data-testid="quiz-naechstes"
            style={{ paddingInline: 0 }}
          >
            Nächstes Zeichen
          </Button>
        </div>
      )}
    </div>
  );
}
