"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { setHistoryOwner } from "@/app/m/qr/_lib/history";

// Nur im Test: der E2E fragt den Eigentümer über dieses globale Hook ab, um zu
// warten, bis der Client die Session aufgelöst hat. Das Hook ist kein
// Sicherheitsmechanismus — es liest denselben Wert, den HistoryOwner ohnehin
// in den Store schreibt.
declare global {
  interface Window {
    __historyOwner?: string | null;
  }
}

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
 * Dass die Sitzung erst nach dem Hydrieren feststeht, ist unkritisch: bis dahin
 * meldet dieser Effekt GAR NICHTS, und `history.ts` haelt den Verlauf verborgen
 * und jeden neuen Eintrag zurueck. Ein anonymer Betrachter sieht fremde
 * Eintraege deshalb zu keinem Zeitpunkt, auch nicht kurz aufblitzend. Umgekehrt
 * erscheint der eigene Verlauf eines Angemeldeten einen Wimpernschlag spaeter.
 *
 * `status` ist dabei die eigentliche Aussage, nicht `session?.user?.id ?? null`:
 * das `?? null` machte aus „weiss ich noch nicht" ein „anonym" und stempelte
 * damit den Eintrag, den jemand vor dem ersten Sitzungs-Abruf antippt, als
 * herrenlos — sichtbar fuer die naechste Person am selben Tablet.
 */
export function HistoryOwner() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (status === "loading") return;
    setHistoryOwner(userId);
    // Test-Hook: der E2E pollt diesen Wert, um zu warten, bis der Client die
    // Sitzung aufgelöst hat. Er spiegelt denselben Zustand, den der Store hat —
    // und ist, solange die Sitzung laedt, bewusst noch gar nicht gesetzt.
    window.__historyOwner = userId;
  }, [status, userId]);

  return null;
}
