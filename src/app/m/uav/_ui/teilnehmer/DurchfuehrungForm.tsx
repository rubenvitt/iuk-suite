"use client";

import { useState, type FormEvent } from "react";
import { datumKurz } from "../../_lib/datum";
import type { Durchfuehrung } from "../offline/progress";
import { useLocalStorage } from "./useFortschritt";
import styles from "./uav.module.css";

type Props = {
  onAdd: (eintrag: Omit<Durchfuehrung, "id">) => void;
  heute: string;
};

type Team = { drohnensteuerer: string; luftraumbeobachter: string };
const LEERES_TEAM: Team = { drohnensteuerer: "", luftraumbeobachter: "" };

/** Port aus uav-praxis/src/components/DurchfuehrungForm.tsx. */
export function DurchfuehrungForm({ onAdd, heute }: Props) {
  // Zuletzt erfasstes Team aufgaben- und sitzungsübergreifend merken, damit die
  // beiden Namensfelder beim nächsten Eintrag bereits vorbelegt sind.
  const [letztesTeam, setLetztesTeam] = useLocalStorage<Team>("df:letztes-team", LEERES_TEAM);
  const [datum, setDatum] = useState(heute);
  const [drohnensteuerer, setDrohnensteuerer] = useState(letztesTeam.drohnensteuerer);
  const [luftraumbeobachter, setLuftraumbeobachter] = useState(letztesTeam.luftraumbeobachter);

  function absenden(e: FormEvent) {
    e.preventDefault();
    onAdd({ datum, drohnensteuerer, luftraumbeobachter });
    setLetztesTeam({ drohnensteuerer, luftraumbeobachter });
    setDatum(heute);
    // Namensfelder bleiben als Vorbelegung für die nächste Durchführung stehen.
  }

  return (
    <form className={styles["df-form"]} onSubmit={absenden}>
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
          onChange={(e) => setDatum(e.target.value)}
        />
      </label>
      <label className={styles.feld} htmlFor="df-drohnensteuerer">
        <span className={styles["feld-label"]}>Drohnensteuerer</span>
        <input
          id="df-drohnensteuerer"
          type="text"
          value={drohnensteuerer}
          onChange={(e) => setDrohnensteuerer(e.target.value)}
          autoComplete="off"
        />
      </label>
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
