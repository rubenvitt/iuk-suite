"use client";

import Script from "next/script";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TurnstileAktion } from "./aktionen";

/*
 * Das Turnstile-Widget der offenen Formulare (IDA-340, IDA-341), explizit gerendert: so lässt es sich nach einer
 * abgelehnten Sendung zurücksetzen (`runde`) und beim Neuaufbau des Formulars wieder entfernen.
 *
 * Zwei Wege zum Token: in einem `<form>` legt das Widget es selbst als `cf-turnstile-response` ab (Einwurf);
 * Formulare mit eigenem Zustand (Bar, Mangel) nehmen es über `beiToken` — `null`, sobald es abgelaufen ist oder
 * das Widget neu startet. Ein Token gilt bei Cloudflare nur einmal: nach jeder Ablehnung `runde` hochzählen.
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SKRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function Turnstile({ siteKey, aktion, runde, beiToken }: {
  siteKey: string; aktion: TurnstileAktion; runde: number; beiToken?: (token: string | null) => void;
}) {
  const ort = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [geladen, setGeladen] = useState(() => typeof window !== "undefined" && !!window.turnstile);
  // Der jüngste Rückweg, ohne das Widget bei jedem Aufbau der Elternkomponente neu zu rendern.
  const melde = useRef(beiToken);
  useLayoutEffect(() => {
    melde.current = beiToken;
  });

  useEffect(() => {
    if (!geladen || !ort.current || !window.turnstile) return;
    const api = window.turnstile;
    const weg = () => melde.current?.(null);
    // Muss doch jemand klicken, braucht „flexible" mindestens 300 px; auf 320er-Telefonen ist die Karte schmaler.
    const size = ort.current.clientWidth >= 300 ? "flexible" : "compact";
    id.current = api.render(ort.current, {
      sitekey: siteKey, action: aktion, appearance: "interaction-only", language: "de", size,
      callback: (token: string) => melde.current?.(token),
      "expired-callback": weg, "error-callback": weg, "timeout-callback": weg,
    });
    return () => {
      if (id.current) api.remove(id.current);
      id.current = null;
      weg();
    };
  }, [geladen, siteKey, aktion]);

  useEffect(() => {
    if (runde > 0 && id.current && window.turnstile) {
      melde.current?.(null);
      window.turnstile.reset(id.current);
    }
  }, [runde]);

  return (
    <>
      <Script src={SKRIPT} strategy="afterInteractive" onReady={() => setGeladen(true)} />
      <div ref={ort} data-rolle="turnstile" />
    </>
  );
}
