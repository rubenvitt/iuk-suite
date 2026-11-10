"use client";

import { useRef, useState, type FormEvent } from "react";
import { datumKurz } from "../../_lib/datum";
import type { Durchfuehrung } from "../offline/progress";
import { teamSchluessel } from "../offline/localStore";
import { useLocalStorage } from "./useFortschritt";
import styles from "./uav.module.css";

type Props = {
  onAdd: (eintrag: Omit<Durchfuehrung, "id">) => void;
  heute: string;
  /** Besitzer des Speichers (DRK-286) — die Vorbelegung trägt Namen und ist persönlich. */
  besitzer: string;
  /** Name der angemeldeten Person — Vorbelegung des Steuerers, solange kein letztes Team gemerkt ist. */
  eigenerName?: string;
};

type Team = { drohnensteuerer: string; luftraumbeobachter: string };
const LEERES_TEAM: Team = { drohnensteuerer: "", luftraumbeobachter: "" };

/** Port aus uav-praxis/src/components/DurchfuehrungForm.tsx. */
export function DurchfuehrungForm({ onAdd, heute, besitzer, eigenerName = "" }: Props) {
  // Zuletzt erfasstes Team aufgaben- und sitzungsübergreifend merken, damit die
  // beiden Namensfelder beim nächsten Eintrag bereits vorbelegt sind.
  const [letztesTeam, setLetztesTeam] = useLocalStorage<Team>(teamSchluessel(besitzer), LEERES_TEAM);
  const [datum, setDatum] = useState(heute);
  // `null` = noch nicht angefasst: dann folgt das Feld der Vorbelegung, auch wenn
  // der eigene Name erst nach `api.me()` ankommt.
  const [steuererEingabe, setSteuererEingabe] = useState<string | null>(null);
  const drohnensteuerer = steuererEingabe ?? (letztesTeam.drohnensteuerer || eigenerName);
  const [luftraumbeobachter, setLuftraumbeobachter] = useState(letztesTeam.luftraumbeobachter);
  const [steuererFehlt, setSteuererFehlt] = useState(false);
  const [datumFehlt, setDatumFehlt] = useState(false);
  const steuererFeld = useRef<HTMLInputElement>(null);

  function absenden(e: FormEvent) {
    e.preventDefault();
    // IDA-389: eine Durchführung ohne Steuerer zählte trotzdem auf die
    // Zielanzahl („10.11.2026 · — / —"). Ohne Namen wird nichts gespeichert.
    const steuerer = drohnensteuerer.trim();
    const beobachter = luftraumbeobachter.trim();
    // Ein geleertes oder halb getipptes Datumsfeld liefert "" — der Server
    // lehnt das ab, und der Eintrag bliebe für immer in der Sync-Warteschlange.
    const datumOk = /^\d{4}-\d{2}-\d{2}$/.test(datum);
    setDatumFehlt(!datumOk);
    if (!datumOk) return;
    if (!steuerer) {
      setSteuererFehlt(true);
      steuererFeld.current?.focus();
      return;
    }
    setSteuererFehlt(false);
    onAdd({ datum, drohnensteuerer: steuerer, luftraumbeobachter: beobachter });
    setLetztesTeam({ drohnensteuerer: steuerer, luftraumbeobachter: beobachter });
    setDatum(heute);
    // Namensfelder bleiben als Vorbelegung für die nächste Durchführung stehen.
  }

  return (
    <form className={styles["df-form"]} onSubmit={absenden} noValidate>
      <label className={styles.feld} htmlFor="df-datum">
        {/*
         * Das gewählte Datum steht in deutscher Form NEBEN der Beschriftung.
         *
         * Die Anzeigeform des nativen Feldes bestimmt die Sprache des BROWSERS,
         * nicht das Dokument: mit `lang="de"` am `<html>` und einem Browser auf
         * `de-DE` (Accept-Language und `navigator.language`) zeigte Chromium
         * gemessen weiterhin `08/29/2026` — es folgt seiner UI-Sprache, die eine
         * Seite nicht setzt. Das Feld bleibt trotzdem nativ (Datumswähler des
         * Telefons, Tastatur mit Ziffernblock); daneben steht, welcher Tag
         * gemeint ist.
         */}
        <span className={styles["feld-label"]}>
          Datum
          {datumKurz(datum) && <span className={styles["feld-wert"]}>{datumKurz(datum)}</span>}
        </span>
        <input
          id="df-datum"
          type="date"
          value={datum}
          onChange={(e) => {
            setDatum(e.target.value);
            if (e.target.value) setDatumFehlt(false);
          }}
          aria-invalid={datumFehlt || undefined}
          aria-describedby={datumFehlt ? "df-datum-fehler" : undefined}
        />
      </label>
      {datumFehlt && (
        <p id="df-datum-fehler" className={styles["feld-fehler"]} role="alert">
          Datum fehlt.
        </p>
      )}
      <label className={styles.feld} htmlFor="df-drohnensteuerer">
        <span className={styles["feld-label"]}>Drohnensteuerer</span>
        <input
          ref={steuererFeld}
          id="df-drohnensteuerer"
          type="text"
          required
          value={drohnensteuerer}
          onChange={(e) => {
            setSteuererEingabe(e.target.value);
            if (e.target.value.trim()) setSteuererFehlt(false);
          }}
          autoComplete="off"
          aria-invalid={steuererFehlt || undefined}
          aria-describedby={steuererFehlt ? "df-steuerer-fehler" : undefined}
        />
      </label>
      {steuererFehlt && (
        <p id="df-steuerer-fehler" className={styles["feld-fehler"]} role="alert">
          Name des Drohnensteuerers fehlt.
        </p>
      )}
      <label className={styles.feld} htmlFor="df-luftraumbeobachter">
        <span className={styles["feld-label"]}>Luftraumbeobachter</span>
        <input
          id="df-luftraumbeobachter"
          type="text"
          value={luftraumbeobachter}
          onChange={(e) => setLuftraumbeobachter(e.target.value)}
          autoComplete="off"
        />
      </label>
      <button type="submit" className={styles["btn-primaer"]}>
        Durchführung hinzufügen
      </button>
    </form>
  );
}
