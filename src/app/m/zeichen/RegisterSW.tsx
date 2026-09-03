"use client";

import { useEffect } from "react";

/**
 * Registriert den Modul-Service-Worker — Muster `qr/RegisterSW.tsx`, Prop-Form
 * wie `uav/RegisterSW.tsx`.
 *
 * `an` kommt aus `zeichenSwAn(process.env)` im Modul-Layout (Server Component).
 * Ein WERT aus einem `"use client"`-Modul kaeme dort nicht an (Falle 6) —
 * deshalb lebt `zeichenSwAn` in `_lib/boot.ts` OHNE `"use client"`.
 *
 * `isSecureContext` ist der Grund, warum die PWA lokal ein Chrome-Flag braucht:
 * `http://zeichen.localtest.me` ist fuer den Browser kein sicherer Kontext (nur
 * `localhost`/`127.0.0.1` sind es), in Prod hinter TLS schon.
 *
 * ⛔ KEIN `register()` OHNE `an`: auf einer Instanz ohne SUITE_HOST_ZEICHEN
 * rewritet `/sw.js` ins Portal und liefert 404 — die Registrierung scheiterte
 * dann mit EINER Konsolenzeile, und niemand merkte es.
 *
 * ⬜ DASS DER ABRUF VON `/sw.js` DAS SITZUNGSCOOKIE MITSCHICKT, IST GEMESSEN
 * (M-A, 2026-09-03, voller Chromium-Kanal gegen einen Host mit
 * `requiresAuth: true`): ohne Cookie antwortete die Middleware 307 -> /login,
 * der Browser bekaeme `text/html` und `register()` lehnte mit einem
 * `SecurityError` ueber den MIME-Type ab. Die Ablesung steht im Kopf von
 * `_lib/sw-quelle.ts`.
 */
export function RegisterSW({ an }: { an: boolean }) {
  useEffect(() => {
    if (!an) return;
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("[zeichen] SW-Registrierung fehlgeschlagen", err);
    });
  }, [an]);
  return null;
}
