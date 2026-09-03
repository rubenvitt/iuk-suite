"use client";

import { useState } from "react";
import { Button } from "antd";
import { AKTION_FEHLGESCHLAGEN } from "../_lib/aktionsfehler";
import type { Frage } from "../_lib/lernen/fragen";
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
 */
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
          dangerouslySetInnerHTML={{ __html: svg }}
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
        {frage.optionen.map((o) => (
          <button
            key={o.id}
            type="button"
            data-testid="quiz-option"
            disabled={gewaehlt !== null}
            onClick={() => waehle(o.id)}
            // ARBEITSDICHTE: 44 als Literal, weil eigenes Markup den antd-Token nicht erbt.
            style={{ minHeight: 44, textAlign: "start", padding: "8px 12px" }}
          >
            {o.svg ? (
              <span className={s.zeichenflaeche} dangerouslySetInnerHTML={{ __html: o.svg }} />
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
