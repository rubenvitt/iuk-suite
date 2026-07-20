"use client";

import { useEffect } from "react";

/**
 * Registriert den Modul-Service-Worker. Steht im Modul-Layout, nicht im
 * Root-Layout — dadurch laeuft die Registrierung nur auf dem Modul-Host.
 *
 * `isSecureContext` ist der Grund, warum die PWA lokal ein Chrome-Flag
 * braucht: `http://qr.localtest.me` ist fuer den Browser kein sicherer
 * Kontext (nur `localhost`/`127.0.0.1` sind es), in Prod hinter TLS schon.
 */
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("[qr] SW-Registrierung fehlgeschlagen", err);
    });
  }, []);
  return null;
}
