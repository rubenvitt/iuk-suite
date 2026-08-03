"use client";

import { useState } from "react";
import { Button } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { MAX_SERIEN, NotenVerlauf, type NotenVerlaufPunkt } from "./NotenVerlauf";
import { T } from "./typo";

/**
 * DAS TRENDDIAGRAMM MIT ZUSCHALTBAREN FRAGEN (Entwurf §3.3, wortgenau: „Nur die
 * Gesamtdurchschnittslinie ist Vorgabe; einzelne Fragen sind zuschaltbar, maximal
 * drei gleichzeitig, gestrichelt und direkt beschriftet — acht Kurven in einem
 * Bild wären Spaghetti").
 *
 * WARUM ES DIESE INSEL GIBT: die Trendseite ist eine Server Component. Der
 * Umschalter braucht Zustand, und der Zustand muss das Diagramm treiben — also
 * liegen Schalterreihe und Diagramm zusammen in einer Client-Insel. Vorher trug
 * die Seite nur `<NotenVerlauf punkte={…} />`: es gab keinen Weg zu einer
 * Frage-Kurve, und wer wissen wollte, ob sich speziell „Wie gut war alles
 * vorbereitet?" über zwölf Monate verbessert hat, musste zwölf
 * Auswertungsseiten öffnen und die Notenspuren im Kopf vergleichen.
 *
 * VIER ENTSCHEIDUNGEN, DIE HIER UND NUR HIER LIEGEN:
 *
 * 1. DER DECKEL IST SICHTBAR, NICHT STILL. Ist die dritte Frage zugeschaltet,
 *    sind die übrigen Schalter `disabled` — ein Klick, der nichts tut, lehrt „die
 *    Anwendung ist kaputt". Die Zeile sagt zusätzlich, wie viele noch gehen.
 * 2. DER ZUSTAND IST LOKAL, NICHT IN DER URL. `?monate=` steht dort, weil es eine
 *    DATENFRAGE ist (welche Abende kommen in die Kurve) — die Auswahl der
 *    Sichtlinien ist eine Ansichtsfrage, und §3.3 verlangt sie nicht teilbar. In
 *    der URL käme das Klemmen unbekannter ids und einer vierten Frage dazu.
 * 3. KEIN `type="primary"`. `colorError === colorPrimary === #c8000f`: ein
 *    gefüllter Primärknopf pro zugeschalteter Frage wäre Suite-Rot auf einer
 *    Datenfläche (Farb-Klausel §4.9). Der Unterschied zwischen an und aus liegt
 *    an `default` gegen `text` plus `aria-pressed`.
 * 4. DIE REIHE STEHT ÜBER DEM DIAGRAMM. Sie erklärt, was man gleich sieht;
 *    darunter wäre sie eine Legende, die man erst nach der Fehldeutung liest.
 */
export type TrendFrage = {
  /** Die Fragen-`id` — stabiler Schlüssel über Monate hinweg. */
  id: string;
  /** Der Fragetext; er beschriftet die Kurve direkt. */
  text: string;
  /** Ein Wert je Monat, gleiche Länge und Ordnung wie `punkte`. */
  werte: (number | null)[];
};

export type TrendDiagrammProps = {
  punkte: NotenVerlaufPunkt[];
  fragen: TrendFrage[];
};

export function TrendDiagramm({ punkte, fragen }: TrendDiagrammProps) {
  const [aktiv, setAktiv] = useState<string[]>([]);

  const umschalten = (id: string) =>
    setAktiv((vorher) =>
      vorher.includes(id)
        ? vorher.filter((x) => x !== id)
        : vorher.length >= MAX_SERIEN
          ? vorher
          : [...vorher, id],
    );

  const voll = aktiv.length >= MAX_SERIEN;
  /* Die Ordnung der Kurven folgt der Auswahl, nicht der Bogenordnung: wer als
     dritte Frage etwas zuschaltet, sucht sie am Ende der Reihe. */
  const serien = aktiv
    .map((id) => fragen.find((f) => f.id === id))
    .filter((f): f is TrendFrage => f !== undefined)
    .map((f) => ({ id: f.id, label: f.text, werte: f.werte }));

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
      {fragen.length > 0 && (
        <div
          data-testid="trend-fragen"
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SPACE.xs }}
        >
          <span style={{ ...T.kicker, marginRight: SPACE.xs }}>
            EINZELNE FRAGEN ZUSCHALTEN (MAX. {MAX_SERIEN})
          </span>
          {fragen.map((f) => {
            const an = aktiv.includes(f.id);
            return (
              <Button
                key={f.id}
                type={an ? "default" : "text"}
                aria-pressed={an}
                disabled={!an && voll}
                onClick={() => umschalten(f.id)}
              >
                {f.text}
              </Button>
            );
          })}
          {voll && (
            <span style={T.meta}>
              Drei Kurven sind das Maximum — eine abwählen, um eine andere zu sehen.
            </span>
          )}
        </div>
      )}
      <NotenVerlauf punkte={punkte} serien={serien} />
    </section>
  );
}
