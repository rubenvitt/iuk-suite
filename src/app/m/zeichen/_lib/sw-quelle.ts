/**
 * Quelltext der zwei Service-Worker-Fassungen dieses Moduls (Spec §7.3).
 *
 * Beide liegen als String in `_lib`, damit der Route Handler sie ausliefern und
 * der Unit-Test sie in einer nachgebauten Worker-Umgebung AUSFUEHREN kann —
 * sonst waere das Caching-Verhalten nur im Browser pruefbar und damit faktisch
 * ungetestet. Muster: `qr/_lib/sw-source.ts`, `uav/_lib/sw-quelle.ts`.
 *
 * KEIN "use client" (Falle 6). Der Konsument `sw.js/route.ts` ist eine
 * Server-Datei; ein WERT aus einem Client-Modul kaeme dort als Client-Referenz
 * an — HTTP 500, und weder `build` noch Vitest sehen es.
 *
 * ⛔ WAS DIESER WORKER MEHR HAT ALS DIE VON qr UND uav, und warum. Dieses Modul
 * ist das ERSTE der Suite mit `requiresAuth: true` UND einer PWA — es gibt kein
 * Vorbild (M17.5). Gemessen (M17.1/M17.2): eine auth-pflichtige Route
 * beantwortet OHNE Sitzung jeden Pfad mit 307 -> /login
 * (`routing.ts`, `proxy.ts`), und `fetch` FOLGT dem still:
 * `status 200, ok true, redirected true, url …/login`. Ein
 * `cache.put("/offline", res)` GELINGT dann — im Cache laege die Anmeldeseite
 * unter dem Offline-Schluessel. Der Waechter `if (!res.ok)`
 * (`qr/_lib/sw-source.ts`) faengt das NICHT. Daher `holeGeprueft()`, und
 * daher gilt der Riegel AUCH fuer Assets.
 *
 * ⬜ M-A, GEMESSEN AM 2026-09-03 (nicht angenommen) mit `playwright.pwa.config.ts`
 * und vollem Chromium-Kanal gegen `portal.localtest.me:3101` — dieselbe
 * Torkonfiguration wie `zeichen` (`registry.ts`: `requiresAuth: true`,
 * `requiredGroups: []`). Ablesung: `navigator.serviceWorker.register()` lieferte
 * `{ok:true, scope:"http://portal.localtest.me:3101/"}`, und die Sonde sah
 * serverseitig `Sitzungscookie dabei: true` — der /sw.js-Abruf des Browsers
 * schickt das Sitzungscookie also MIT, die Registrierung gelingt auf einem
 * auth-pflichtigen Host. Deshalb steht in `core/routing.ts` KEIN Durchlass.
 * Faellt diese Messung nach einem Next-Upgrade um, ist das Symptom ein
 * `SecurityError` ueber den MIME-Type `text/html` in der Konsole — und die
 * Abhilfe ist eine Betreiberentscheidung, keine Zeile Code (Spec §7.3, §9).
 */

/**
 * DER CACHE-WORKER.
 */
export const ZEICHEN_SW_QUELLE = `
// v1: erste Fassung.
const CACHE = "zeichen-pwa-v1";

/**
 * GENAU EINE gecachte Navigationsroute — der EXTERNE Pfad auf dem Modul-Host,
 * und der ist zugleich der Cache-Schluessel. Der interne /m/zeichen/offline
 * kommt hier nirgends vor: der Rewrite ist serverintern und fuer die PWA
 * unsichtbar.
 *
 * ACHTUNG, KEINE RUECKWAERTSHOCHKOMMAS IN DIESEM KOMMENTAR: dieser Quelltext
 * liegt in einem Template-Literal, ein Hochkomma beendet es und der Parser
 * bricht mitten im Satz ab.
 *
 * WARUM NICHT "/" WIE BEI qr UND uav: "/" ist hier die RSC-Startseite unter
 * SuiteRahmen und liegt ausdruecklich NICHT im Cache (sie traegt den Klarnamen
 * im Flight-Payload). Die installierte PWA landete offline auf Chromiums
 * Netzwerkfehlerseite. Deshalb ist der Rueckfall hier JEDE nicht gecachte
 * Navigation innerhalb des Scopes -> /offline. Die Adresszeile steht dann auf
 * /katalog, waehrend /offline gerendert wird — sie luegt, und das ist der
 * bewusst gewaehlte kleinere Schaden gegenueber einer Fehlerseite.
 */
const NAV_FALLBACK = "/offline";
const SHELL_ROUTES = [NAV_FALLBACK];

/** Zwei Assets, die in keinem HTML als /_next/static/ auftauchen. */
const ZUSATZ_ASSETS = ["/manifest.webmanifest", "/pwa-icon.svg"];

/** Der Name der Geraete-Datenbank. MUSS zu _lib/merkgeraet.ts passen;
 *  merkgeraet.test.ts haelt beide Stellen zusammen. */
const MERK_DB = "zeichen-merkliste";

/** Wie lange eine geholte Offline-Fassung als frisch genug gilt, siehe qr:
 *  sw.js aendert sich bei einem gewoehnlichen Redeploy nicht Byte fuer Byte,
 *  der install-Handler laeuft dann nie wieder, und die gecachten Buendel
 *  zeigten dauerhaft auf Hashes, die es nicht mehr gibt. */
const SHELL_MAX_AGE_MS = 5 * 60 * 1000;
let lastShellRefresh = 0;

/**
 * Holt einen Pfad MIT Cookies und weist alles zurueck, was nicht wirklich von
 * diesem Pfad kommt. Fuer HTML UND fuer Assets.
 *
 * MIT Cookies, nicht credentials:"omit" wie bei qr: /offline ist auth-pflichtig,
 * ein anonymer Abruf bekaeme garantiert den Login. Die Flaeche selbst traegt
 * keine Nutzdaten (kein Shell, kein auth-Aufruf, der einen Namen liest) —
 * Vorbild uav /: gemessen 45.944 B, mit UND ohne Sitzung byteidentisch, 0x
 * userName.
 */
async function holeGeprueft(pfad) {
  let res;
  try {
    res = await fetch(pfad);
  } catch (e) {
    return null;
  }
  if (!res.ok) { await releaseBody(res); return null; }
  // DER REDIRECT-RIEGEL. Der gemessene 307 -> /login kommt hier als 200 an.
  if (res.redirected) { await releaseBody(res); return null; }
  let ziel = "";
  try { ziel = new URL(res.url, self.location.origin).pathname; } catch (e) { ziel = ""; }
  // Leeres res.url gibt es bei einer echten fetch-Antwort nicht, nur bei
  // synthetischen Responses. Fail closed: lieber nichts cachen als das Falsche.
  if (ziel !== pfad) { await releaseBody(res); return null; }
  return res;
}

/**
 * Gibt den Body einer Antwort frei, die nicht in den Cache wandert.
 *
 * Klingt nach Kosmetik, ist aber die Zusage, an der die ganze Offline-
 * Faehigkeit haengt: eine Antwort, deren Body im Service Worker weder gelesen
 * noch verworfen wird, legt dessen Abruf-Pipeline still. Im Prod-Build gemessen
 * (qr): nach DREI so liegengelassenen 404-Antworten kam KEIN weiterer fetch des
 * Workers mehr zurueck, der install-Handler lief nie zu Ende, der Worker blieb
 * dauerhaft "installing" und navigator.serviceWorker.ready loeste nie auf. Und
 * 404 ist hier ein VORGESEHENER Fall: nach einem Redeploy zeigt gecachtes HTML
 * auf Buendel-Hashes, die es nicht mehr gibt.
 */
function releaseBody(res) {
  return res.body ? res.body.cancel().catch(() => {}) : Promise.resolve();
}

/** Nimmt nur Pfade an, deren letztes Segment eine Dateiendung traegt — siehe qr:
 *  Next verteilt den Flight-Payload auf mehrere Bloecke, und eine Trennstelle
 *  faellt mitten in einen Asset-Pfad. Das Bruchstueck sieht wie ein Pfad aus,
 *  ist aber ein 404. */
function isCompleteAssetPath(pfad) {
  const ohneQuery = pfad.split(/[?#]/)[0];
  const letztes = ohneQuery.slice(ohneQuery.lastIndexOf("/") + 1);
  return /\\.[a-zA-Z0-9]+$/.test(letztes);
}

/**
 * Cache-first NUR fuer das nachweislich Anonyme und unter gehashter URL
 * Unveraenderliche. Bewusst eine ALLOWLIST: eine Denylist liess bei qr die
 * RSC-Antwort "/?_rsc=<hash>" einer Soft-Navigation durch, die dieselben
 * personalisierten Daten traegt wie das HTML — dauerhaft und ohne
 * Revalidierung. /_next/static steht ausserdem in PASSTHROUGH (routing.ts),
 * ist also ohne Sitzung abrufbar und kann NIE durch Login-HTML ersetzt werden.
 */
function isCacheableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/pwa-icon.svg" ||
    url.pathname === "/manifest.webmanifest"
  );
}

/** Die Build-Assets, die eine Seite referenziert — aus dem AUSGELIEFERTEN HTML
 *  gelesen statt aus einem Precache-Manifest, weil die Dateinamen gehasht sind
 *  und mit jedem Build wechseln. Getrennt wird auch am Backslash: Next legt
 *  denselben Pfad ein zweites Mal im Flight-Payload ab, dort mit maskierten
 *  Anfuehrungszeichen. */
function referenzierteAssets(html) {
  const treffer = html
    .split(/["'()\\\\]/)
    .filter((teil) => teil.startsWith("/_next/static/") && isCompleteAssetPath(teil));
  return [...new Set(treffer)];
}

async function cacheAsset(pfad, cache) {
  const vorhanden = await cache.match(pfad);
  if (vorhanden) return;
  const res = await holeGeprueft(pfad);
  if (!res) return;
  await cache.put(pfad, res);
}

/**
 * DER INHALTSRIEGEL. Gemessen (M17.3): jede Seite unter SuiteRahmen traegt
 * {"userName":"…","angemeldet":true} und die gruppenabhaengige App-Liste im
 * Flight-Payload. Wer /offline versehentlich in die Shell haengt, bekommt ab
 * hier gar keine PWA mehr — laut ist besser als still.
 *
 * ⛔ VOR DER PRUEFUNG FALLEN DIE BACKSLASHES WEG, und das ist keine Kosmetik,
 * sondern der Unterschied zwischen einem Riegel und einer Attrappe: Next legt
 * den Flight-Payload als JS-STRINGLITERAL ab, dort steht die maskierte Form
 * (Backslash, Anfuehrungszeichen, userName, Backslash, Anfuehrungszeichen) und
 * NICHT die nackte. Ein indexOf auf dem Rohtext findet sie deshalb nicht — der
 * Riegel waere leer-gruen und liesse genau das HTML durch, gegen das er steht.
 * Gemessen an der Fixture in sw-quelle.test.ts, die die maskierte Form traegt.
 */
function traegtPersonenbezug(text) {
  const flach = text.split("\\\\").join("");
  return flach.indexOf('"userName"') !== -1 || flach.indexOf('"angemeldet"') !== -1;
}

async function cacheShellRoute(pfad, cache) {
  const res = await holeGeprueft(pfad);
  if (!res) return;
  const text = await res.text();
  if (traegtPersonenbezug(text)) return;
  // ZUERST die Buendel, DANN das HTML. Umgekehrt hinterliesze ein Deploy am
  // Netzrand ein gecachtes HTML, dessen Chunk-Hashes es nicht mehr gibt —
  // offline kaputt, ohne Fehlermeldung.
  const assets = referenzierteAssets(text);
  for (const asset of assets) await cacheAsset(asset, cache);
  await cache.put(pfad, new Response(text, { status: 200, headers: res.headers }));
}

async function cacheAllesNoetige() {
  // Der Zeitstempel VOR den Abrufen: sonst starten zwei rasch aufeinander
  // folgende Navigationen denselben Durchlauf doppelt.
  lastShellRefresh = Date.now();
  const cache = await caches.open(CACHE);
  // Nacheinander, nicht parallel: die Seiten teilen sich Buendel, und parallel
  // sehen alle denselben Cache-Fehltreffer, bevor einer schreibt.
  for (const pfad of SHELL_ROUTES) await cacheShellRoute(pfad, cache);
  for (const pfad of ZUSATZ_ASSETS) await cacheAsset(pfad, cache);
}

function refreshShellIfStale() {
  if (Date.now() - lastShellRefresh < SHELL_MAX_AGE_MS) return Promise.resolve();
  return cacheAllesNoetige();
}

/** Loescht die Geraetedatenbank der Merkliste. onblocked wird mitbehandelt: ein
 *  zweiter offener Tab haelt die Datenbank, und ohne diesen Zweig bliebe das
 *  Promise ewig offen und mit ihm das waitUntil des Ereignisses. */
function loescheGeraeteDatenbank() {
  return new Promise((fertig) => {
    let anfrage;
    try { anfrage = indexedDB.deleteDatabase(MERK_DB); } catch (e) { fertig(); return; }
    anfrage.onsuccess = () => fertig();
    anfrage.onerror = () => fertig();
    anfrage.onblocked = () => fertig();
  });
}

/**
 * DER LOGOUT-HAKEN. next-auth sendet beim Abmelden POST /api/auth/signout
 * (node_modules/next-auth/react.js). Seit der Merkliste in IndexedDB
 * (Spec §7.5) ist das die TRAGENDE Massnahme und nicht mehr blosse Vorsorge.
 *
 * ⛔ ER DECKT NUR DEN GEORDNETEN FALL AB — nicht Ablauf, nicht Widerruf, nicht
 * Gruppenentzug, nicht ein weggelegtes Geraet. Wer ihn fuer eine Loeschzusage
 * haelt, liest ihn falsch.
 */
async function raeumeGeraet() {
  const namen = await caches.keys();
  await Promise.all(namen.map((n) => caches.delete(n)));
  await loescheGeraeteDatenbank();
}

async function navigationsAntwort(req, url) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    // DER REDIRECT-RIEGEL AUF DEM NAVIGATIONSZWEIG: mit Netz, aber abgelaufener
    // Sitzung antwortet die Suite 307 -> /login, und fetch folgt dem still.
    // Ohne diesen Zweig verloere jemand mit schwacher Verbindung den
    // vollstaendig vorhandenen Katalog an eine Anmeldemaske.
    if (res.redirected) {
      let ziel = "";
      try { ziel = new URL(res.url, self.location.origin).pathname; } catch (e) { ziel = ""; }
      if (ziel.indexOf("/login") === 0) {
        const gecacht = await cache.match(NAV_FALLBACK);
        if (gecacht) { await releaseBody(res); return gecacht; }
      }
    }
    return res;
  } catch (e) {
    // Pfadgenau zuerst, dann der Rueckfall. Gematcht wird auf url.pathname
    // statt auf req — sonst suchte der Cache nach "/katalog?q=rtw" und faende
    // die query-los abgelegte Fassung nie.
    const genau = await cache.match(url.pathname);
    if (genau) return genau;
    return await cache.match(NAV_FALLBACK);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAllesNoetige().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  // Loescht JEDEN anderen Cache-Namen — der einzige nachtraegliche Hebel gegen
  // Altbestand, und er wirkt erst, wenn sich sw.js BYTEWEISE aendert.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // VOR der Methodenpruefung, weil das Abmelden ein POST ist. Der Browser
  // normalisiert req.method auf Grossbuchstaben, auch wenn next-auth "post"
  // schreibt. Beantwortet wird die Anfrage NICHT — sie geht unveraendert ans
  // Netz, hier wird nur nebenher aufgeraeumt.
  if (req.method === "POST" && url.pathname === "/api/auth/signout") {
    event.waitUntil(raeumeGeraet());
    return;
  }
  if (req.method !== "GET") return;
  // Nie eine API-Antwort cachen, auf keinem Zweig.
  if (url.pathname.indexOf("/api/") === 0) return;

  if (req.mode === "navigate") {
    event.waitUntil(refreshShellIfStale());
    event.respondWith(navigationsAntwort(req, url));
    return;
  }

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const treffer = await cache.match(req);
      if (treffer) return treffer;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }),
  );
});
`;

/**
 * DER ABRAEUM-WORKER — ausgeliefert, wenn ZEICHEN_SW NICHT auf "1" steht.
 *
 * Uebernommen aus `uav/_lib/sw-quelle.ts`. Er existiert, weil ein
 * Schalter, den man einschalten kann, auch wieder ausschaltbar sein muss: ohne
 * ihn liefe auf jedem Geraet, das die PWA einmal installiert hat, der alte
 * Worker WEITER — mitsamt Cache und Geraetedatenbank —, und niemand haette
 * einen Hebel dagegen. Mit ihm holt der installierte Worker bei seiner naechsten
 * Update-Pruefung diese Fassung, raeumt alles ab und traegt sich aus.
 *
 * KEIN fetch-Handler, KEIN releaseBody: dieser Worker liest niemals eine
 * Antwort, ein releaseBody waere toter Code (dieselbe Begruendung wie bei uav).
 */
export const ZEICHEN_SW_ABRAEUM_QUELLE = `// Abraeum-Worker: raeumt Cache und Geraetedaten ab und traegt sich aus.
// KEIN fetch-Handler. Dieser Worker beantwortet nichts.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const namen = await caches.keys();
      await Promise.all(namen.map((n) => caches.delete(n)));
      try { indexedDB.deleteDatabase("zeichen-merkliste"); } catch (e) {}
      await self.clients.claim();
      await self.registration.unregister();
    })(),
  );
});
`;
