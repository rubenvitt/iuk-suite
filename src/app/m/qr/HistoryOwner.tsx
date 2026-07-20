"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { setHistoryOwner } from "@/app/m/qr/_lib/history";

/**
 * Meldet dem Verlauf, wem er gerade gehoert. Steht im Modul-Layout, weil auch
 * die Formularrouten (/wifi, /tel, /contact) in den Verlauf schreiben — auf der
 * Startseite allein bekaeme `recordEntry` dort den falschen Eigentuemer.
 *
 * Die Sitzung wird CLIENTSEITIG gelesen, nicht per `auth()` im Layout. Ein
 * `await auth()` dort liest Cookies und macht damit jede Route unter dem Layout
 * dynamisch — gemessen kippten /qr, /wifi, /tel und /contact von statisch auf
 * server-gerendert. Genau das vermeidet `qr/page.tsx` bewusst, indem es auf die
 * Server-Prop `searchParams` verzichtet. Zusaetzliche Kosten entstehen nicht:
 * der `SessionGuard` im Root-Layout ruft `useSession()` ohnehin auf jeder Seite.
 *
 * Bewusst ein Effekt und keine Zuweisung waehrend des Renderns: `setHistoryOwner`
 * benachrichtigt die Abonnenten des Verlauf-Stores, und das waehrend des Renderns
 * einer anderen Komponente zu tun, ist genau der Fall, den React verbietet.
 *
 * Dass die Sitzung erst nach dem Hydrieren feststeht, ist unkritisch: der
 * Vorgabewert in `history.ts` ist `null`. Ein anonymer Betrachter sieht fremde
 * Eintraege deshalb zu keinem Zeitpunkt, auch nicht kurz aufblitzend. Umgekehrt
 * erscheint der eigene Verlauf eines Angemeldeten einen Wimpernschlag spaeter.
 */
export function HistoryOwner() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    setHistoryOwner(userId);
  }, [userId]);

  return null;
}
