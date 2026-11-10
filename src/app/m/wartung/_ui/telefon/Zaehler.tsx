"use client";

import { useState } from "react";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import s from "../wartung.module.css";

/**
 * „− n +“ für ganze Stückzahlen am Telefon (IDA-381), nach dem Vorbild von `verpflegung/_ui/telefon/teile.tsx`,
 * Bauteil `Stepper`. Nicht dorthin gezogen: der kennt Teilmengen (kg, l), klemmt Getipptes still auf das Maximum
 * und fängt bei 1 an. Hier zählt 0 als „nichts“, und ein getippter Wert über `max` bleibt stehen, damit die Seite
 * ihn am Feld beanstanden kann, statt den Knopf wortlos zu sperren.
 */
export function Zaehler({ wert, setWert, max, label, disabled = false }: {
  wert: number;
  setWert: (n: number) => void;
  max: number;
  label: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const setze = (n: number) => {
    setText(null);
    setWert(Math.max(0, Math.min(max, n)));
  };
  return (
    <div className={s.zaehler} data-rolle="zaehler">
      <button type="button" className={s.zaehlTaste} aria-label={`${label} verringern`} disabled={disabled || wert <= 0} onClick={() => setze(wert - 1)}>
        <Icons8Ikone name="minus" groesse={22} kraeftig />
      </button>
      <input
        className={s.zaehlWert}
        inputMode="numeric"
        aria-label={label}
        aria-invalid={wert > max || undefined}
        disabled={disabled}
        value={text ?? String(wert)}
        onChange={(e) => {
          const roh = e.target.value.replace(/\D/g, "").slice(0, 4);
          setText(roh);
          setWert(roh === "" ? 0 : Number(roh));
        }}
        onBlur={() => setText(null)}
      />
      <button type="button" className={s.zaehlTaste} aria-label={`${label} erhöhen`} disabled={disabled || wert >= max} onClick={() => setze(wert + 1)}>
        <Icons8Ikone name="plus" groesse={22} kraeftig />
      </button>
    </div>
  );
}

