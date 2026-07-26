import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Der PWA-Spike braucht Chrome-Flags für den sicheren Kontext und läuft
  // deshalb in playwright.pwa.config.ts (eigener Port).
  testIgnore: /pwa-spike\.spec\.ts/,
  workers: 1,
  /*
   * 30s reichen NICHT fuer den ersten Test, der sich anmeldet.
   *
   * Die Suite faehrt gegen `next dev`, und ein Dev-Server uebersetzt jede Route
   * erst beim ersten Aufruf. In der CI ist `.next` IMMER kalt (frischer
   * Checkout, kein Build-Cache) UND der Runner klein; lokal ist beides nicht so,
   * deshalb blieb es unentdeckt, bis es in der CI stand. Gemessen auf einem
   * geloeschten `.next` und einer kuenstlich unter Last gesetzten Maschine (der
   * Ersatz fuer den Runner), sonst identischer Lauf:
   *
   *   GET /login ............................  7 368 ms
   *   Anmelden bis die Adresse /login verlaesst  13 722 ms
   *   derselbe Login ein zweites Mal, warm ...  1 160 ms
   *
   * Das ist echte Uebersetzungsarbeit, kein Haenger: der Klick stoesst
   * nacheinander die next-auth-Routen und die angemeldete Modul-Wurzel an. Die
   * erste Zeile nimmt ihm `webServer.url` unten ab; die zweite bleibt im Test
   * stehen und passt mit dem, was der Test danach noch tut, nicht in 30 s.
   *
   * Die Grenze gilt bewusst fuer ALLE Tests statt fuer einen ausgewaehlten: wer
   * der erste anmeldende Test ist, haengt an der Dateireihenfolge und aendert
   * sich mit der naechsten Spec.
   */
  timeout: 90_000,
  use: { baseURL: "http://portal.localtest.me:3100" },
  webServer: {
    command: "rm -rf ./.data/e2e && next dev -p 3100",
    /*
     * WARTET AUF DIE ANMELDESEITE, nicht auf `/api/health` — und uebersetzt sie
     * damit, bevor der erste Test laeuft. Zweck ist beides: der Server steht
     * (die Seite antwortet nur, wenn er hochgekommen ist) UND die teuerste
     * Erstuebersetzung der Suite (App-Huelle samt antd, 7,4 s kalt gemessen)
     * faellt hier an statt im Zeitbudget irgendeines Tests. Bewusst NUR ein GET
     * und kein Anmelden: eine echte Sitzung vor dem ersten Test waere geteilter
     * Zustand, und Anmelden per `globalSetup` war zwischenzeitlich probiert —
     * unter ihm fiel die Logout-Zusicherung in `qr.spec.ts` in drei von sieben
     * Laeufen aus. Ein Zusammenhang liess sich nicht belegen (sie faellt auch
     * ohne aus, siehe Bericht), aber ein GET braucht ihn gar nicht erst zu
     * widerlegen.
     */
    url: "http://feedback.localtest.me:3100/login",
    reuseExistingServer: false,
    // 120 s waren fuer `/api/health` bemessen; die Anmeldeseite kalt zu
    // uebersetzen kostet auf einem CI-Runner ein Vielfaches der lokal
    // gemessenen 7,4 s.
    timeout: 180_000,
    env: {
      AUTH_SECRET: "test-secret",
      AUTH_DEV_LOGIN: "true",
      AUTH_COOKIE_DOMAIN: ".localtest.me",
      DATA_DIR: "./.data/e2e",
      PORT: "3100",
      NODE_ENV: "development",
    },
  },
});
