"use client";

import { useEffect } from "react";
import { setHistoryOwner } from "@/app/m/qr/_lib/history";

/**
 * Meldet dem Verlauf, wem er gerade gehoert. Steht im Modul-Layout, weil auch
 * die Formularrouten (/wifi, /tel, /contact) in den Verlauf schreiben — auf der
 * Startseite allein bekaeme `recordEntry` dort den falschen Eigentuemer.
 *
 * Bewusst ein Effekt und keine Zuweisung waehrend des Renderns: `setHistoryOwner`
 * benachrichtigt die Abonnenten des Verlauf-Stores, und das waehrend des Renderns
 * einer anderen Komponente zu tun, ist genau der Fall, den React verbietet.
 *
 * Dass der Effekt erst nach dem ersten Rendern laeuft, ist unkritisch: der
 * Vorgabewert in `history.ts` ist `null`. Ein anonymer Betrachter sieht fremde
 * Eintraege deshalb zu keinem Zeitpunkt, auch nicht kurz aufblitzend. Umgekehrt
 * erscheint der eigene Verlauf eines Angemeldeten einen Wimpernschlag spaeter.
 */
export function HistoryOwner({ userId }: { userId: string | null }) {
  useEffect(() => {
    setHistoryOwner(userId);
  }, [userId]);
  return null;
}
