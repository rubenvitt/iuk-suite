// src/app/m/zeichen/_lib/boot.ts
// KEIN "use client" (Falle 6) — die Datei laeuft im Instrumentation-Hook, bevor
// irgendetwas rendert, UND `zeichenSwAn()` wird aus einer Server Component
// (`layout.tsx`) gelesen. Aus einem Client-Modul kaeme dort eine Client-Referenz
// statt des Wertes: HTTP 500 fuer die ganze Seite, und weder `build` noch Vitest
// sehen es.

type EnvLike = Record<string, string | undefined>;

/**
 * Ist die Offline-PWA dieses Moduls eingeschaltet?
 *
 * ⛔ NUR die Zeichenkette "1", und die sichere Seite ist AUS. Ein Tippfehler
 * ("true", "ja") darf keinen Worker registrieren: auf einer Instanz ohne
 * eigenen Modul-Host antwortet jede Route ohne Sitzung mit 307 -> /login, und
 * ein Worker legte dort Login-HTML unter dem Katalogschluessel ab (M17.2).
 */
export function zeichenSwAn(env: EnvLike = process.env): boolean {
  return env.ZEICHEN_SW === "1";
}

/**
 * Die Boot-Pruefung dieses Moduls. WIRFT NIE — `assertHostConfig()`
 * (`src/core/bootstrap.ts`) sammelt die Meldungen ALLER Module ein und
 * entscheidet einmal, ob daraus ein Abbruch wird. Ein Wurf hier naehme den
 * ganzen Prozess mit, samt aller anderen Module.
 *
 * ⛔ GREIFT NUR BEI ZEICHEN_SW=1 — dem Schalter, der die PWA einschaltet.
 * ABWEICHUNG VON SPEC §7.1, die eine unbedingte Pflicht in Produktion wollte:
 * die braeche jeden unbeteiligten Deploy im Fenster zwischen Merge und Cutover
 * ab (`uav/_lib/boot.ts` schreibt denselben Fehler aus). Das Schutzziel
 * bleibt erhalten: ohne den Schalter registriert `RegisterSW` nichts, es gibt
 * also nichts, was still ausfallen koennte; MIT dem Schalter ist der fehlende
 * Host ein LAUTER Startfehler.
 *
 * Warum der Host ueberhaupt Voraussetzung ist (Spec §7.1): ohne ihn findet
 * `moduleForHost` in Produktion kein Modul, `decideRoute` faellt aufs Portal
 * zurueck, `/sw.js` rewritet nach `/m/portal/sw.js` -> 404, und die
 * Registrierung scheitert mit EINER Konsolenzeile. `/manifest.webmanifest`,
 * `/pwa-icon.svg` und `/offline` sind dann ebenfalls Portal-Pfade und 404. Die
 * Release-Notiz verspraeche „Der Katalog steht auch ohne Verbindung bereit",
 * und niemand merkte, dass er es nicht tut, bis jemand ohne Netz danebensteht.
 *
 * ⛔ SIE LIEST KEINE TABELLE. Sie laeuft VOR `migrateAllModules()`
 * (`src/instrumentation.ts`) — dieselbe Regel wie bei `files`, `lagerbuch`,
 * `radio` und `uav`.
 */
export async function zeichenBootFehler(env: EnvLike = process.env): Promise<string[]> {
  if (!zeichenSwAn(env)) return [];
  if (!env.SUITE_HOST_ZEICHEN) {
    return [
      "ZEICHEN_SW=1 verlangt SUITE_HOST_ZEICHEN: ohne eigenen Modul-Host rewritet " +
        "/sw.js ins Portal (404) und die Offline-PWA faellt STILL aus. " +
        "Spec 2026-09-02 §7.1.",
    ];
  }
  return [];
}
