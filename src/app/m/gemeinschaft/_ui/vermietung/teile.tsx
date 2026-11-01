"use client";

import { useEffect } from "react";
import { konflikte, type Eintrag, type Zustand } from "../../_lib/belegung";
import { VERTRAG_TEXT, zeitraumText, ZUSTAND_TEXT, type VertragStand } from "../../_lib/vermietungText";
import s from "./vermietung.module.css";

/** Hängt die Farb-Tokens an den `body`, solange die Seite steht: Flyins und Dialoge rendern in Portale. */
export function useTokensAmBody(): void {
  useEffect(() => {
    document.body.classList.add(s.tokens);
    return () => document.body.classList.remove(s.tokens);
  }, []);
}

export function Zustandschip({ zustand }: { zustand: Zustand }) {
  return <span className={`${s.chip} ${s[zustand]}`}>{ZUSTAND_TEXT[zustand]}</span>;
}

export function Vertragschip({ stand }: { stand: VertragStand }) {
  return <span className={`${s.chip} ${s[stand]}`}>{VERTRAG_TEXT[stand]}</span>;
}

/** Wie ein Eintrag in Listen heißt: Sperrzeit „Grund“, Zusage/Anfrage „Anlass“. */
export function eintragName(x: Eintrag): string {
  if (x.art === "sperre") return x.eventId ? x.titel : `Sperrzeit „${x.titel}“`;
  return `${x.zustand === "zugesagt" ? "Zusage" : "Anfrage"} „${x.titel}“`;
}

/** Die Überschneidungen eines Eintrags als Hinweis (Text plus Kante, kein Rot). Nichts, wenn es keine gibt. */
export function Konfliktliste({ e, eintraege }: { e: Eintrag; eintraege: readonly Eintrag[] }) {
  const k = konflikte(e, eintraege);
  if (!k.length) return null;
  return (
    <div className={s.konflikt} data-testid="konflikte">
      <b>Überschneidet sich mit:</b>
      {k.map((x) => <div key={x.id}>{eintragName(x)} · {zeitraumText(x.von, x.bis)}</div>)}
    </div>
  );
}
