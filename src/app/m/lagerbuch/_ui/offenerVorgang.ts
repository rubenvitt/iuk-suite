"use client";

/**
 * IDA-377 — „IST GERADE ETWAS OFFEN?" zwischen zwei Inseln des Helferrahmens.
 *
 * Der Check (`CheckFlow`) weiß, ob schon etwas eingegeben ist; der Knopf „Abmelden" im Kopf
 * (`AbmeldenKnopf`) soll dann nachfragen. Beide sind Client-Inseln in derselben Seite, aber nicht
 * Eltern und Kind — der Kopf ist Server Component. Ein kleiner Zähler auf Modulebene verbindet sie
 * ohne Kontext-Provider, den der Rahmen als Server Component nicht stellen könnte.
 *
 * Ein Zähler und kein Wahrheitswert: zwei Inseln können zugleich offen sein, und die eine darf die
 * andere beim Schließen nicht mit zurücksetzen.
 */
import { useEffect, useSyncExternalStore } from "react";

let offen = 0;
const hoerer = new Set<() => void>();
const melde = () => { for (const h of hoerer) h(); };

/** Meldet, solange `istOffen` gilt, einen offenen Vorgang an. */
export function useOffenerVorgang(istOffen: boolean): void {
  useEffect(() => {
    if (!istOffen) return;
    offen += 1;
    melde();
    return () => {
      offen -= 1;
      melde();
    };
  }, [istOffen]);
}

/** `true`, solange irgendeine Insel einen offenen Vorgang meldet. */
export function useIrgendwasOffen(): boolean {
  return useSyncExternalStore(
    (h) => { hoerer.add(h); return () => { hoerer.delete(h); }; },
    () => offen > 0,
    () => false,
  );
}
