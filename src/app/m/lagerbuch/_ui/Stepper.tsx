"use client";

import { useState } from "react";
import s from "./helfer.module.css";

/**
 * DER MODUL-EIGENE STEPPER — §7.7.3, Entscheidung 33 (d).
 *
 * Kein `InputNumber`, kein `Form.Item`. Zwei Gruende, und beide sind belegt:
 * `core/theme/tokens.ts:33` setzt TAP = 56 mit der Begruendung „Bedienung mit
 * Handschuhen … eine Einsatzanforderung, keine Stilfrage", und ein
 * formulargebundenes Feld baute die DRITTE Zustandsquelle auf, die der
 * `draft`-Zustand weiter unten bewusst aufgeloest hat (Falle 45; im Alt-Bestand
 * `lagerbuch/src/components/Stepper.tsx:24-28`).
 *
 * DIE `sm`-VARIANTE ENTFAELLT. Es gibt genau eine Groesse. Die Gegenrechnung
 * steht in §7.7.3: 30 -> 56px sind 26px je Zaehlzeile, auf zwanzig Positionen
 * etwa 520px — gut ein halber Bildschirm. Ein Teil kommt ueber den Wegfall der
 * Hinweiszeile bei Wiederholzeilen zurueck (§7.7.2 Punkt 3). Der Rest wird
 * akzeptiert: eine Zeile, die man mit Handschuhen nicht trifft, ist teurer als
 * eine, die man scrollen muss.
 *
 * DIE GROSSZUEGIGEN OBERGRENZEN BLEIBEN AUFRUFERSACHE (`max={9999}`): echter
 * Ueberbestand muss zaehlbar sein, sonst korrigiert der Abgleich real
 * vorhandene Teile STILL heraus, und eine ueberfuellte Flasche muss ablesbar
 * bleiben. Die SERVERSEITIGEN Deckel liegen darueber (99 999 bzw. 9 999,
 * §5.15) — sie fangen den Tippfehler, nicht die Bedienung.
 */
export function Stepper({
  wert,
  setWert,
  min = 1,
  max = 999,
  noText = false,
  beschriftung = "Menge",
}: {
  wert: number;
  setWert: (wert: number) => void;
  min?: number;
  max?: number;
  /**
   * Nur +/−, der Wert ist NICHT tippbar. 1:1 aus dem Alt-Bestand
   * (`lagerbuch/src/components/Stepper.tsx:19-21`), samt Begruendung: „damit
   * unterwegs am Handy nicht versehentlich ins Zahlenfeld getippt wird".
   * Genutzt beim Zaehlen und beim Nachfuellen — beides Stellen, an denen ein
   * Fehlgriff eine falsche Bestandsbuchung ist.
   */
  noText?: boolean;
  /**
   * Speist die drei `aria-label`. In der Zaehlliste stehen zwanzig Stepper
   * untereinander; „Menge erhoehen" zwanzigmal ist fuer eine
   * Bildschirmleserin keine Benennung.
   */
  beschriftung?: string;
}) {
  const klemmen = (n: number) => Math.min(max, Math.max(min, n));

  /**
   * `draft` haelt NUR den Roh-Text WAEHREND der Direkteingabe; `null` heisst
   * „das Feld spiegelt den `wert`-Prop". So bleibt der Parent-Wert die Quelle
   * der Wahrheit, und Klicks/Tastatur lesen nie einen veralteten Wert zurueck
   * (1:1 aus dem Alt-Bestand, `lagerbuch/src/components/Stepper.tsx:24-28`).
   */
  const [draft, setDraft] = useState<string | null>(null);
  const anzeige = draft ?? String(wert);

  function tippen(roh: string) {
    const nurZiffern = roh.replace(/\D/g, "");
    if (nurZiffern === "") {
      // Leere Eingabe erlauben (Loeschen und neu tippen) — NICHT als 0
      // committen. Eine committete Null waere in der Zaehlliste eine falsche
      // Bestandsbuchung, ausgeloest von einem Zwischenschritt der Eingabe.
      setDraft("");
      return;
    }
    // Anzeige = geklemmter Wert, kein Tippen ueber max.
    const geklemmt = klemmen(parseInt(nurZiffern, 10));
    setDraft(String(geklemmt));
    setWert(geklemmt);
  }

  /** Zurueck auf den `wert`-Prop; ein leeres oder ungueltiges Feld verwirft die Eingabe. */
  function abschliessen() {
    setDraft(null);
  }

  return (
    <div className={s.stepper}>
      <button
        type="button"
        className={s.stepTaste}
        aria-label={`${beschriftung} verringern`}
        onClick={() => {
          setDraft(null);
          setWert(klemmen(wert - 1));
        }}
      >
        {/* Lokales Inline-SVG (E3). `aria-hidden`, weil die Taste selbst benannt
            ist; Teil 5, T101 hebt es nach `_ui/ikonen.tsx`. */}
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>

      {noText ? (
        <div className={s.stepAnzeige} data-rolle="stepanzeige" aria-label={beschriftung}>
          {wert}
        </div>
      ) : (
        <input
          className={s.stepWert}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={beschriftung}
          value={anzeige}
          onChange={(e) => tippen(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={abschliessen}
        />
      )}

      <button
        type="button"
        className={s.stepTaste}
        aria-label={`${beschriftung} erhöhen`}
        onClick={() => {
          setDraft(null);
          setWert(klemmen(wert + 1));
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
