// `*.localtest.me` auf 127.0.0.1, ohne DNS — nur in einer Cloud-Session (IDA-374).
//
// Der Resolver des Cloud-Containers beantwortet öffentliche Namen (github.com),
// `localtest.me` und jeden Unternamen aber nicht: Antworten auf Loopback-
// Adressen verwirft er. Playwright wartete deshalb beim Start 180 s auf
// `feedback.localtest.me/login` und brach mit „Timed out waiting from
// config.webServer" ab — das klingt nach einem langsamen Server und ist die
// Namensauflösung. Ein Eintrag in `/etc/hosts` half, verschwand aber mitten in
// der Sitzung wieder (31.10.2026) und braucht root.
//
// Diese Datei biegt stattdessen `dns.lookup` und `dns.promises.lookup` im
// eigenen Prozess um. `e2e/helpers/cloud.ts` lädt sie in den Playwright-Lauf
// und reicht sie per `NODE_OPTIONS=--require` an Worker und Webserver weiter;
// Chromium bekommt dafür `--host-resolver-rules`. Jeder andere Name geht
// unverändert an den echten Resolver.
//
// CommonJS und nur `node:*`, weil `--require` sie vor allem anderen lädt;
// `getBuiltinModule` statt `require`, das die Lint-Regel hier verbietet.

"use strict";

const dns = process.getBuiltinModule("node:dns");

const MARKE = Symbol.for("iuk-suite.loopbackDns");

function istLoopbackName(name) {
  if (typeof name !== "string") return false;
  const klein = name.toLowerCase().replace(/\.$/, "");
  return klein === "localtest.me" || klein.endsWith(".localtest.me");
}

function antwort(optionen) {
  const familie = typeof optionen === "number" ? optionen : optionen?.family;
  const v6 = familie === 6 || familie === "IPv6";
  const eintrag = v6 ? { address: "::1", family: 6 } : { address: "127.0.0.1", family: 4 };
  return typeof optionen === "object" && optionen?.all ? [eintrag] : eintrag;
}

if (!dns.lookup[MARKE]) {
  const echt = dns.lookup;
  const umgebogen = function lookup(name, optionen, rueckruf) {
    if (!istLoopbackName(name)) return echt.apply(this, arguments);
    if (typeof optionen === "function") {
      rueckruf = optionen;
      optionen = undefined;
    }
    const ergebnis = antwort(optionen);
    if (Array.isArray(ergebnis)) process.nextTick(rueckruf, null, ergebnis);
    else process.nextTick(rueckruf, null, ergebnis.address, ergebnis.family);
    return {};
  };
  umgebogen[MARKE] = true;
  dns.lookup = umgebogen;

  const versprochen = dns.promises;
  const echtVersprochen = versprochen.lookup;
  versprochen.lookup = function lookup(name, optionen) {
    if (!istLoopbackName(name)) return echtVersprochen.apply(this, arguments);
    return Promise.resolve(antwort(optionen));
  };
}

module.exports = { istLoopbackName };
