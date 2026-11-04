"use client";

import { useEffect } from "react";
import { Statuschip, type Statuston } from "@/core/status/Statuschip";
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

/** Zustand einer Anfrage oder Sperrzeit als Ton des Statuschips (`core/status`): kein Rot, auch nicht für „abgelehnt". */
const ZUSTAND_TON: Record<Zustand, Statuston> = {
  angefragt: "warnung", zugesagt: "ok", gesperrt: "neutral", abgelehnt: "neutral", zurueckgezogen: "neutral",
};
const VERTRAG_TON: Record<VertragStand, Statuston> = { offen: "warnung", verschickt: "info", unterschrieben: "ok" };

export function Zustandschip({ zustand }: { zustand: Zustand }) {
  return <Statuschip ton={ZUSTAND_TON[zustand]}>{ZUSTAND_TEXT[zustand]}</Statuschip>;
}

export function Vertragschip({ stand }: { stand: VertragStand }) {
  return <Statuschip ton={VERTRAG_TON[stand]}>{VERTRAG_TEXT[stand]}</Statuschip>;
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
