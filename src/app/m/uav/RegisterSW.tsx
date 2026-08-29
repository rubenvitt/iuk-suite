"use client";

import { useEffect } from "react";
import type { SwModus } from "./_lib/boot";

/**
 * Registriert den Modul-Service-Worker — Muster `qr/RegisterSW.tsx`. Anders als
 * dort bekommt diese Komponente den Modus als Prop, weil `/sw.js` hier zwei
 * Bedeutungen haben kann (Spec §5): im Modus `abraeumen` registriert nichts — der
 * schon installierte Alt-Worker holt `/sw.js` bei seiner eigenen Update-Prüfung
 * selbst ab, ein `register()` der Suite wäre hier wirkungslos und falsch, weil es
 * genau den Worker registrierte, den §5 erst im Modus `cachen` will.
 *
 * `modus` kommt aus `swModus(process.env)` im Modul-Layout (Server Component) —
 * ein Wert aus einem `"use client"`-Modul käme dort nicht an (Falle 6), deshalb
 * lebt `swModus` in `_lib/boot.ts` ohne `"use client"`.
 *
 * `isSecureContext`: derselbe Grund wie bei `qr` — lokal braucht die
 * PWA-Registrierung ein Chrome-Flag, weil `http://uav.localtest.me` kein sicherer
 * Kontext ist.
 */
export function RegisterSW({ modus }: { modus: SwModus }) {
  useEffect(() => {
    if (modus !== "cachen") return;
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("[uav] SW-Registrierung fehlgeschlagen", err);
    });
  }, [modus]);
  return null;
}
