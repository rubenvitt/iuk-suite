type EnvLike = Record<string, string | undefined>;

/**
 * LÄUFT DIESE SUITE LOKAL ÜBER HTTP AUF `<modul>.localtest.me`? (DRK-415)
 *
 * Zwei Dinge hängen daran: ob Anmelde-Cookies `Secure` tragen und ob ein
 * Modul-Link auf den Produktionshost (`https://…`) oder auf
 * `http://<modul>.localtest.me:<port>` zeigt. Beides fragte bis DRK-415
 * `process.env.NODE_ENV === "production"` — und das ist unter einem gebauten
 * Stand keine Laufzeitfrage mehr.
 *
 * ⛔ `next build` BACKT `process.env.NODE_ENV` FEST EIN, AUCH IM SERVERCODE.
 * Nachgesehen im gebauten Chunk: von `moduleUrl` blieb nur der
 * Produktionszweig übrig. Eine e2e-Suite gegen `next start` bekam deshalb
 * `Secure`-Cookies, die Chromium über `http://*.localtest.me` still verwirft
 * (schon die Dev-Anmeldung kam nicht mehr von `/login` weg), und Modul-Links
 * auf die echten Produktionshosts. Deshalb liest diese Datei `env.NODE_ENV`
 * über einen PARAMETER: nur der wörtliche Ausdruck `process.env.NODE_ENV`
 * wird ersetzt, ein Zugriff über eine Variable bleibt zur Laufzeit stehen
 * (derselbe Chunk zeigt `"production"===a.NODE_ENV` für `core/auth/cookies`).
 * `lokalHttp.test.ts` hält fest, dass der wörtliche Ausdruck hier nicht steht.
 *
 * `SUITE_LOKAL_HTTP=1` setzt NUR das e2e-Profil (`playwright.config.ts`).
 * Ungesetzt bleibt die Produktion, wie sie war: `Secure` an, https-Links.
 * `next dev` und Vitest brauchen die Variable nicht — dort ist `NODE_ENV`
 * ohnehin nicht `production`.
 */
export function lokalUeberHttp(env: EnvLike = process.env): boolean {
  return env.NODE_ENV !== "production" || env.SUITE_LOKAL_HTTP === "1";
}

/**
 * `secure` für Cookies, die die Suite selbst setzt. Über http gesetzt, verwirft
 * der Browser ein `Secure`-Cookie wortlos; über https ohne `Secure` ginge es im
 * Klartext mit, sobald jemand den Host per http aufruft.
 */
export function cookiesSicher(env: EnvLike = process.env): boolean {
  return !lokalUeberHttp(env);
}

/**
 * BOOT-PRÜFUNG: der Schalter darf nie still in der Produktion stehen.
 *
 * `SUITE_LOKAL_HTTP=1` neben einer `https://`-`AUTH_URL` ist ein Widerspruch —
 * die Suite läuft hinter TLS und nähme den Cookies trotzdem `Secure`. Und ein
 * anderer Wert als `1` (etwa `true`) schaltete nichts und sähe aus, als ob.
 * Beides bricht den Start ab, statt zu raten. Wirft nie; der Aufrufer sammelt
 * (`assertHostConfig` in `core/bootstrap`).
 */
export function lokalHttpFehler(env: EnvLike = process.env): string[] {
  const wert = env.SUITE_LOKAL_HTTP ?? "";
  if (wert === "") return [];
  if (wert !== "1") return [`SUITE_LOKAL_HTTP kennt nur "1" oder leer, nicht "${wert}".`];
  if ((env.AUTH_URL ?? "").startsWith("https://")) {
    return [
      `SUITE_LOKAL_HTTP=1 widerspricht AUTH_URL=${env.AUTH_URL}: hinter TLS gehört \`Secure\` an die Cookies. ` +
        "Die Variable ist nur für die e2e-Suite gegen einen gebauten Stand gedacht.",
    ];
  }
  return [];
}
