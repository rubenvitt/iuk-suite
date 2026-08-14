import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // Dev-only: the suite is exercised across multiple *.localtest.me hosts against a
  // single `next dev` server. Next dev blocks cross-origin requests to /_next/* dev
  // resources from any host other than the one it was started on (localhost), which
  // prevents client hydration on every *.localtest.me host. Allow the dev hosts so
  // interactivity (and dev-login) works on each subdomain. No effect on `next build`/`next start`.
  allowedDevOrigins: ["*.localtest.me"],
  /*
   * `serverActions.bodySizeLimit` ANGEHOBEN VON DER 1-MB-VORGABE (Aufgabe 19, `aufgaben`-Modul,
   * `nachweisHochladenAction`). Next kappt Server-Action-Anfragen standardmaessig bei 1 MB
   * (`node_modules/next/dist/docs/.../server-actions.md`); `_lib/ablage.ts`s `NACHWEIS_MAX_BYTES`
   * (8 MiB) ist bewusst als „Server-Action und Formular importieren denselben Wert" gebaut — die
   * Upload-Strecke geht ueber eine ECHTE Server Action (`<form action={...}>` mit einem
   * `<input type="file">`, kein Route Handler wie bei `files`), also muss die Kappungsgrenze der
   * Aufgabe folgen, nicht umgekehrt. 9 MiB = 8 MiB Nutzlast plus etwas Rand fuer
   * Multipart-Kopfzeilen und die uebrigen Formularfelder (`aufgabeId`, `text`).
   *
   * ⚠️ DIESE GRENZE GILT SUITEWEIT, FUER JEDE SERVER ACTION JEDES MODULS — `serverActions` ist eine
   * EINZIGE, globale Next-Einstellung, keine modul-scoped Option. `files/_ui/UploadInsel.tsx`s
   * Kopfkommentar nennt „1 MB" als Kappungsebene 1 und bleibt trotzdem korrekt: `files`s
   * `anlegenAction` nimmt ohnehin NIE Dateibytes entgegen (das `<input type="file">` dort traegt
   * bewusst kein `name`), die Anhebung aendert an ihrem Verhalten nichts — aber der Zahlenwert in
   * jenem Kommentar ist seit dieser Aenderung nicht mehr die tatsaechlich wirksame Grenze. Im
   * Bericht dieser Aufgabe als Betreiber-sichtbare Nebenwirkung benannt, nicht still verschwiegen.
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "9mb",
    },
  },
};
export default nextConfig;
