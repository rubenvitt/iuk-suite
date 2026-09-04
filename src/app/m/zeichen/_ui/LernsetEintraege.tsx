"use client";

import { useState, useTransition } from "react";
import { Button } from "antd";
import { AKTION_FEHLGESCHLAGEN } from "../_lib/aktionsfehler";
import { VERWAIST_TEXT } from "../_lib/merkliste";
import {
  entferneZeichenAusSet,
  fuegeZeichenZuSetHinzu,
  setzeLernsetAktiv,
} from "../actions";
import s from "./zeichen.module.css";

export interface LernsetEintragAnzeige {
  zeichenId: string;
  titel: string;
  verwaist: boolean;
}

/**
 * DIE DETAILSEITE EINES LERNSETS — wie `LernsetTabelle`, kein antd `Table`/`Listy`
 * (Falle 9), nur serialisierbare Props: die Eintraege sind server-seitig ueber
 * `merkAnzeige`-gleiche Logik aufgeloest (Titel aus dem Katalog, sonst Schnappschuss),
 * die waehlbaren Optionen kommen als fertige `{id, titel}`-Liste.
 */
export function LernsetEintraege(props: {
  set: { id: string; slug: string; titel: string; aktiv: boolean };
  eintraege: readonly LernsetEintragAnzeige[];
  optionen: readonly { id: string; titel: string }[];
}) {
  const { set, eintraege, optionen } = props;
  const [imUebergang, starte] = useTransition();
  const [laufend, setLaufend] = useState<string | null>(null);
  const [aktionsfehler, setAktionsfehler] = useState<string | null>(null);
  /*
   * ⛔ FIX-RUNDE 1, BEFUND W4: `ausgewaehlt` merkt sich nur, WAS die Person zuletzt
   * ANGEKLICKT hat — nicht, was gerade gueltig ist. Eine Einmal-Initialisierung aus
   * `optionen[0]` (der urspruengliche Stand) blieb nach einer erfolgreichen Aufnahme
   * stehen, obwohl das aufgenommene Zeichen aus `optionen` verschwunden war (Server
   * Action revalidiert, `optionen` kommt neu herein): das kontrollierte `<select>` fand
   * keine passende `<option>` mehr und zeigte nichts an, und ein zweiter Klick auf
   * „Hinzufuegen" schickte die veraltete ID erneut — abgewiesen mit „Dieses Zeichen
   * steht schon im Set." `effektiveAuswahl` ist deshalb eine ABLEITUNG aus State UND
   * Props bei jedem Render, keine einmalige Kopie: faellt die gemerkte Auswahl aus
   * `optionen`, springt sie automatisch auf die erste noch verfuegbare Option.
   */
  const [ausgewaehlt, setAusgewaehlt] = useState<string | null>(null);
  const auswahlGueltig = ausgewaehlt !== null && optionen.some((o) => o.id === ausgewaehlt);
  const effektiveAuswahl = auswahlGueltig ? (ausgewaehlt as string) : (optionen[0]?.id ?? "");

  function entfernen(zeichenId: string) {
    setLaufend(zeichenId);
    starte(async () => {
      setAktionsfehler(null);
      try {
        await entferneZeichenAusSet(set.id, zeichenId);
      } catch {
        setAktionsfehler(AKTION_FEHLGESCHLAGEN);
      }
    });
  }

  function hinzufuegen() {
    if (!effektiveAuswahl) return;
    setLaufend("__hinzufuegen__");
    starte(async () => {
      setAktionsfehler(null);
      try {
        const ergebnis = await fuegeZeichenZuSetHinzu(set.id, effektiveAuswahl);
        if (!ergebnis.ok) setAktionsfehler(ergebnis.fehler ?? AKTION_FEHLGESCHLAGEN);
      } catch {
        setAktionsfehler(AKTION_FEHLGESCHLAGEN);
      }
    });
  }

  function umschalten() {
    setLaufend("__aktiv__");
    starte(async () => {
      setAktionsfehler(null);
      try {
        await setzeLernsetAktiv(set.id, !set.aktiv);
      } catch {
        setAktionsfehler(AKTION_FEHLGESCHLAGEN);
      }
    });
  }

  return (
    <div>
      <p data-testid="lernset-detail-status">
        Status: {set.aktiv ? "Sichtbar auf „Üben“" : "Entwurf, noch nicht sichtbar"}
      </p>
      <Button
        loading={imUebergang && laufend === "__aktiv__"}
        onClick={umschalten}
        data-testid="lernset-detail-umschalten"
        style={{ minHeight: 44, marginBlockEnd: 16 }}
      >
        {set.aktiv ? "Zurückziehen" : "Veröffentlichen"}
      </Button>

      {aktionsfehler !== null && (
        <p className={s.hinweis} data-testid="zeichen-aktionsfehler" role="status">
          {aktionsfehler}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBlockEnd: 16 }}>
        <div className={s.feld}>
          <label htmlFor="lernset-hinzufuegen-auswahl">Zeichen hinzufügen</label>
          <select
            id="lernset-hinzufuegen-auswahl"
            className={s.eingabe}
            value={effektiveAuswahl}
            onChange={(e) => setAusgewaehlt(e.target.value)}
            data-testid="lernset-hinzufuegen-auswahl"
            disabled={optionen.length === 0}
          >
            {optionen.length === 0 && <option value="">Alle Zeichen sind schon im Set</option>}
            {optionen.map((o) => (
              <option key={o.id} value={o.id}>
                {o.titel}
              </option>
            ))}
          </select>
        </div>
        <Button
          onClick={hinzufuegen}
          disabled={optionen.length === 0}
          loading={imUebergang && laufend === "__hinzufuegen__"}
          data-testid="lernset-hinzufuegen-absenden"
          style={{ minHeight: 44 }}
        >
          Hinzufügen
        </Button>
      </div>

      {eintraege.length === 0 ? (
        <p data-testid="lernset-eintraege-leer">Noch kein Zeichen in diesem Set.</p>
      ) : (
        <ul className={s.merkliste} data-testid="lernset-eintraege">
          {eintraege.map((e) => (
            <li
              key={e.zeichenId}
              className={s.merkzeile}
              data-testid={`lernset-eintrag-${e.zeichenId}`}
            >
              <span className={s.merktext} style={{ flexDirection: "row", gap: 8 }}>
                {e.titel}
                {e.verwaist && (
                  <span className={s.hinweis} data-testid={`lernset-eintrag-verwaist-${e.zeichenId}`}>
                    {VERWAIST_TEXT}
                  </span>
                )}
              </span>
              <Button
                loading={imUebergang && laufend === e.zeichenId}
                onClick={() => entfernen(e.zeichenId)}
                data-testid={`lernset-eintrag-entfernen-${e.zeichenId}`}
                style={{ minHeight: 44 }}
              >
                Entfernen
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
