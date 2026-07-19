"use client";

import { useEffect } from "react";

/**
 * Registriert den Modul-Service-Worker. Steht im Modul-Layout, nicht im
 * Root-Layout — dadurch läuft die Registrierung nur auf dem Modul-Host.
 *
 * `isSecureContext` ist der Grund, warum der Spike lokal ein Chrome-Flag
 * braucht: `http://<modul>.localtest.me` ist für den Browser kein sicherer
 * Kontext (nur `localhost`/`127.0.0.1` sind es), in Prod hinter TLS schon.
 */
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("[pwa-spike] SW-Registrierung fehlgeschlagen", err);
    });
  }, []);
  return null;
}
