/**
 * Kurze Rückmeldung, die über der Seite schwebt und von selbst wieder geht. Sie verschiebt nichts:
 * Der Platz liegt in `.oben` (App-Rahmen), der Toast hängt absolut darunter. Kein Knopf darin —
 * wer handeln will, findet den Weg auf der Seite selbst.
 */
import { useEffect, useEffectEvent, type CSSProperties, type ReactNode } from "react";

import { Zeichen, type ZeichenName } from "./Symbol";

/** Lang genug für einen Satz, kurz genug, dass er nicht zum Dauerhinweis wird. */
export const TOAST_DAUER_MS = 5_000;

export function Toast({
  zeichen,
  dauerMs = TOAST_DAUER_MS,
  beiEnde,
  children,
}: {
  zeichen?: ZeichenName;
  dauerMs?: number;
  beiEnde: () => void;
  children: ReactNode;
}) {
  // Über `useEffectEvent`: Ein neuer `beiEnde` aus jedem Render (Statusabfrage im Takt) startete
  // die Uhr sonst jedes Mal neu, und der Toast bliebe stehen.
  const ende = useEffectEvent(beiEnde);
  useEffect(() => {
    const t = setTimeout(() => ende(), dauerMs);
    return () => clearTimeout(t);
  }, [dauerMs]);

  return (
    <div className="toast" role="status" style={{ "--toast-dauer": `${dauerMs}ms` } as CSSProperties}>
      {zeichen ? <Zeichen name={zeichen} /> : null}
      <span>{children}</span>
    </div>
  );
}
