"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { TURNSTILE_AKTION } from "../_lib/ehrlich/turnstile";

/*
 * Das Turnstile-Widget des Einwurfs (IDA-340), explizit gerendert: so lässt es sich nach einer
 * abgelehnten Prüfung zurücksetzen (`runde`) und beim Neuaufbau des Formulars wieder entfernen.
 * Das Widget legt sein Token selbst als `cf-turnstile-response` in das umgebende Formular.
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

export function Turnstile({ siteKey, runde }: { siteKey: string; runde: number }) {
  const ort = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [geladen, setGeladen] = useState(() => typeof window !== "undefined" && !!window.turnstile);

  useEffect(() => {
    if (!geladen || !ort.current || !window.turnstile) return;
    const api = window.turnstile;
    id.current = api.render(ort.current, { sitekey: siteKey, action: TURNSTILE_AKTION, appearance: "interaction-only", language: "de" });
    return () => {
      if (id.current) api.remove(id.current);
      id.current = null;
    };
  }, [geladen, siteKey]);

  useEffect(() => {
    if (runde > 0 && id.current && window.turnstile) window.turnstile.reset(id.current);
  }, [runde]);

  return (
    <>
      <Script src={SKRIPT} strategy="afterInteractive" onReady={() => setGeladen(true)} />
      <div ref={ort} style={{ marginTop: 12 }} />
    </>
  );
}
