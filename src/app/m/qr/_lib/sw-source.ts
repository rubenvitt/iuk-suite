/**
 * Quelltext des Service Workers. Liegt als String in `_lib`, damit ihn der
 * Route Handler (`sw.js/route.ts`) ausliefern und der Unit-Test ihn in einer
 * nachgebauten Worker-Umgebung ausfuehren kann — sonst waere das
 * Caching-Verhalten nur im Browser pruefbar und damit faktisch ungetestet.
 *
 * Bewusst handgeschrieben statt Serwist/next-pwa: das Muster stammt aus dem
 * verifizierten Spike (`docs/spikes/2026-07-19-qr-offline-pwa.md`) und soll
 * keine Precache-Build-Pipeline einfuehren. Die Build-Assets werden trotzdem
 * vorgehalten — aber zur Laufzeit aus dem HTML der Shell-Seiten gelesen statt
 * aus einem beim Bauen erzeugten Manifest (siehe `cacheReferencedAssets`).
 * Der erste Besuch muss weiterhin online passieren.
 */
export const SW_SOURCE = `
// v2 statt v1: Geraete, die den alten Worker hatten, tragen unter v1 womoeglich
// die eingeloggte Startseite im Cache. Der activate-Handler loescht jeden Cache
// ausser dem aktuellen — mit einem neuen Namen ist der Altbestand damit
// zuverlaessig weg, statt darauf zu hoffen, dass ihn der naechste Write
// ueberschreibt.
const CACHE = "qr-pwa-v2";
const NAV_FALLBACK = "/";

/**
 * Die Routen, die offline tragen muessen: JEDE Route, die die Startseite
 * verlinkt, plus die Anzeige "/qr" am anderen Ende des Weges Eingabe ->
 * Anzeige.
 *
 * Lag eine dieser Routen nicht im Cache, beantwortete der Worker die Navigation
 * aus NAV_FALLBACK: die Adresszeile stand auf /wifi, gerendert wurde die
 * Startseite — kein Fehler, kein Hinweis, nur kein Formular. Damit waren offline
 * drei der vier QR-Typen nicht erzeugbar, darunter WLAN: einen Zugang an der
 * Einsatzstelle zu teilen, ist genau der Fall, der ohne Netz gebraucht wird.
 *
 * Wer in \`page.tsx\` (KINDS) eine Route ergaenzt, muss sie hier nachtragen. Die
 * JS-Buendel kommen dann von selbst mit, weil \`cacheReferencedAssets\` das HTML
 * jeder Shell-Route scannt.
 */
const SHELL_ROUTES = [NAV_FALLBACK, "/qr", "/wifi", "/tel", "/contact"];

/**
 * Wie lange eine geholte Offline-Fassung als frisch genug gilt.
 *
 * Der Refresh haengt nicht nur am install-Handler, sondern auch am
 * navigate-Zweig, weil \`sw.js\` bei einem gewoehnlichen Redeploy Byte fuer Byte
 * gleich bleibt: der Browser installiert dann nie neu, und die gecachten Buendel
 * zeigten dauerhaft auf Hashes, die es nicht mehr gibt — offline waere nach dem
 * ersten Deploy kaputt. Ungedrosselt kostet dieser Selbstheilungspfad aber einen
 * Dokumentabruf je Shell-Route bei JEDER Navigation; auf einem Einsatz-Tablet am
 * Mobilfunkrand nicht egal.
 */
const SHELL_MAX_AGE_MS = 5 * 60 * 1000;
let lastShellRefresh = 0;

/**
 * Holt die Offline-Fassungen der Shell-Routen grundsaetzlich ohne Cookies.
 *
 * Grund: "/" zeigt eingeloggt das Preset-Grid. Dessen Props landen als
 * Client-Komponenten-Payload im HTML — bei einem WLAN-Preset samt Passwort.
 * Wuerde der Worker die ausgelieferte Antwort cachen, laege dieses HTML nach
 * dem Logout weiter auf dem Geraet und waere auf einem geteilten Tablet offline
 * fuer die naechste Person abrufbar. Genau der Leak, gegen den die
 * Admin-Ausnahme geschrieben war, nur auf der Route mit den Daten.
 *
 * Ein Header-Check (no-store/private) traegt hier nicht: "/" ist in beiden
 * Session-Zustaenden dynamisch und liefert dieselben Cache-Header — er wuerde
 * entweder beide Fassungen cachen oder gar keine. \`credentials: "omit"\` macht
 * die gecachte Fassung dagegen bauartbedingt anonym, unabhaengig von Headern.
 * Der Preis: offline gibt es keine Presets. Die QR-Erzeugung selbst laeuft
 * clientseitig und funktioniert weiter.
 *
 * "/qr" wird ohne Query geholt und liegt deshalb query-los im Cache. Das ist
 * kein Mangel, sondern Voraussetzung: die Ansicht liest \`data\`/\`label\`/\`kind\`
 * clientseitig aus der Adresszeile, eine einzige gecachte Fassung bedient
 * darum jeden Payload.
 */
function cacheAnonymousShell() {
  // Der Zeitstempel wird VOR den Abrufen gesetzt: sonst starten zwei rasch
  // aufeinanderfolgende Navigationen denselben Durchlauf doppelt, weil die erste
  // ihn erst am Ende vermerkt haette.
  lastShellRefresh = Date.now();
  // Nacheinander, nicht parallel: die Shell-Seiten teilen sich Buendel.
  // Parallel sehen alle denselben Cache-Fehltreffer, bevor einer schreibt, und
  // holen dieselbe Datei mehrfach — auf einem Einsatz-Tablet am Mobilfunkrand
  // nicht egal.
  return SHELL_ROUTES.reduce(
    (chain, path) => chain.then(() => cacheShellRoute(path)),
    Promise.resolve(),
  );
}

/** Drosselung des Selbstheilungspfads, siehe SHELL_MAX_AGE_MS. */
function refreshShellIfStale() {
  if (Date.now() - lastShellRefresh < SHELL_MAX_AGE_MS) return Promise.resolve();
  return cacheAnonymousShell();
}

function cacheShellRoute(path) {
  return fetch(path, { credentials: "omit" })
    .then(async (res) => {
      if (!res.ok) return releaseBody(res);
      const html = await res.clone().text();
      const cache = await caches.open(CACHE);
      await cache.put(path, res);
      await cacheReferencedAssets(html, cache);
    })
    .catch(() => {});
}

/**
 * Zieht die Build-Assets nach, die eine Shell-Seite referenziert.
 *
 * Ohne das haengt die Offline-Zusage an einem Rennen: Das JS-Buendel einer
 * Route holt der Browser erst, wenn sie betreten oder vorgeladen wird. Bricht
 * das Netz vorher weg, fehlt genau das Buendel, das die Seite braucht, und der
 * Nutzer sieht statt seines Codes Next' Fehlerseite. Im Prod-Build gemessen:
 * "/qr" referenziert genau ein Buendel, das "/" nicht laedt.
 *
 * Ein \`router.prefetch("/qr")\` auf der Startseite war der erste Versuch und
 * ist bewusst wieder raus: es laeuft erst nach der Hydrierung an, und bricht
 * das Netz waehrenddessen weg, werden die Abrufe mittendrin abgebrochen
 * (gemessen: ERR_ABORTED auf genau jenem Buendel, in 1 von 6 Durchlaeufen).
 * Hier dagegen haengt alles am install-Handler — ist der Worker aktiv, ist
 * alles Noetige beisammen, ohne Rennen.
 *
 * Bewusst aus dem ausgelieferten HTML gelesen statt aus einem Precache-
 * Manifest: die Dateinamen sind gehasht und wechseln mit jedem Build, und eine
 * Build-Pipeline soll dieses Modul laut Plan nicht bekommen. Das HTML kennt
 * sie zur Laufzeit ohnehin.
 *
 * Getrennt wird auch am Backslash, nicht nur an Anfuehrungszeichen: Next legt
 * denselben Pfad ein zweites Mal im eingebetteten Flight-Payload ab, dort mit
 * maskierten Anfuehrungszeichen (\\"/_next/…\\"). Ohne den Backslash im Trenner
 * bliebe er am Pfad kleben und der Abruf ginge ins Leere.
 *
 * Gefiltert wird zusaetzlich auf eine vollstaendige Dateiendung, siehe
 * \`isCompleteAssetPath\`.
 */
function cacheReferencedAssets(html, cache) {
  const refs = new Set(
    html
      .split(/["'()\\\\]/)
      .filter((part) => part.startsWith("/_next/static/") && isCompleteAssetPath(part)),
  );
  return Promise.all(
    [...refs].map((path) =>
      cache.match(path).then((hit) =>
        hit
          ? undefined
          : fetch(path)
              .then((res) => (res.ok ? cache.put(path, res) : releaseBody(res)))
              .catch(() => {}),
      ),
    ),
  );
}

/**
 * Nimmt nur Pfade an, deren letztes Segment eine Dateiendung traegt.
 *
 * Next verteilt den eingebetteten Flight-Payload auf mehrere
 * \`self.__next_f.push(...)\`-Bloecke. Seit das HTML dieses Moduls die
 * antd-Stile mitbringt, ist es gross genug, dass eine dieser Trennstellen
 * MITTEN in einen Asset-Pfad faellt: aus \`…/chunks/06oawi8hdf7uj.js\` wird am
 * Blockende \`…/chunks/06oawi8h\`. Das Bruchstueck sieht wie ein Pfad aus, ist
 * aber ein 404 — gemessen im Prod-Build, drei Stueck ueber die fuenf
 * Shell-Routen.
 *
 * Frueher eine Allowlist bekannter Endungen (\`.js\`, \`.css\`, ...). Zwei
 * Bruchstellen daran: Erstens vergisst eine Allowlist zwangslaeufig Endungen
 * (\`.jpeg\` fehlte neben \`.jpg\`, ebenso \`.mp4\`/\`.webm\`/\`.eot\`) — jeder
 * vergessene Fall verwirft ein GUELTIGES Asset lautlos, ohne Fehlermeldung.
 * Zweitens prueft \`endsWith\` gegen den GESAMTEN Pfad: haengt ein Deployment
 * \`deploymentId\` in \`next.config\` ein, haengt Next \`?dpl=…\` an JEDE
 * Asset-URL, keine endet dann noch auf eine Endung, und der Precache waere
 * leer. Der eigentliche Zweck ist, Bruchstuecke zu erkennen — ein
 * abgeschnittener Pfad hat im letzten Segment KEINE Endung
 * (\`.../chunks/06oawi8h\` statt \`.../chunks/foo.js\`). Genau dieses Merkmal
 * wird hier direkt geprueft: Query und Fragment werden vor der Pruefung
 * abgeschnitten, danach zaehlt nur, ob das letzte Pfadsegment ueberhaupt eine
 * Endung hat — welche, ist fuer die Bruchstueck-Frage unerheblich.
 */
function isCompleteAssetPath(path) {
  const withoutQuery = path.split(/[?#]/)[0];
  const lastSegment = withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
  // Zwei Backslashes, nicht einer: SW_SOURCE ist selbst ein Template-Literal
  // (siehe der Trenner-Regex oben in cacheReferencedAssets, ebenfalls
  // doppelt). \\. wird beim Parsen DIESER Datei zu \. entschaerft — ein
  // einzelner Backslash vor dem Punkt wuerde beim Parsen ganz verschluckt
  // (kein bekanntes Escape) und liesse den Punkt zum Platzhalter fuer ein
  // BELIEBIGES Zeichen werden statt fuer einen echten Punkt zu stehen. Genau
  // damit haette das Bruchstueck "…/chunks/qr-vi" ("-vi" = ein Zeichen +
  // Alnum am Ende) faelschlich als vollstaendiger Pfad gegolten.
  return /\\.[a-zA-Z0-9]+$/.test(lastSegment);
}

/**
 * Gibt den Body einer Antwort frei, die nicht in den Cache wandert.
 *
 * Klingt nach Kosmetik, ist aber die Zusage, an der die ganze Offline-Faehigkeit
 * haengt: Eine Antwort, deren Body im Service Worker weder gelesen noch
 * verworfen wird, legt dessen Abruf-Pipeline still. Gemessen im Prod-Build —
 * nach drei so liegengelassenen 404-Antworten kam KEIN weiterer \`fetch\` des
 * Workers mehr zurueck, der install-Handler lief nie zu Ende, der Worker blieb
 * dauerhaft im Zustand "installing" und \`navigator.serviceWorker.ready\` loeste
 * nie auf. Ergebnis: gar keine PWA, ohne Fehlermeldung.
 *
 * Betrifft nicht nur die oben gefilterten Bruchstuecke: nach einem Redeploy
 * zeigt gecachtes HTML auf Buendel-Hashes, die es nicht mehr gibt — 404 ist in
 * diesem Entwurf ein VORGESEHENER Fall (siehe SHELL_MAX_AGE_MS). Ohne diese
 * Freigabe machte genau der Selbstheilungspfad den Worker unbrauchbar.
 */
function releaseBody(res) {
  return res.body ? res.body.cancel().catch(() => {}) : undefined;
}

/**
 * Cache-first nur fuer das, was nachweislich anonym und unter gehashter URL
 * unveraenderlich ist. Bewusst eine Allowlist: die fruehere Denylist
 * (/admin, /api/) liess die RSC-Antwort "/?_rsc=<hash>" einer Soft-Navigation
 * durch, die dieselben Preset-Daten traegt wie das HTML — dauerhaft und ohne
 * Revalidierung. Alles Unbekannte geht am Worker vorbei ans Netz.
 */
function isCacheableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/pwa-icon.svg" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAnonymousShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigationen: erst Netz (frische, ggf. personalisierte Seite), offline aus
  // dem Cache. Die ausgelieferte Antwort wird nie gecacht; die Offline-Fassung
  // zieht refreshShellIfStale separat nach. Der Write haengt an waitUntil —
  // ohne das darf der Browser den Worker beenden, sobald die Antwort steht, und
  // der Write ginge verloren.
  if (req.mode === "navigate") {
    event.waitUntil(refreshShellIfStale());
    event.respondWith(
      // Offline pfadgenau antworten und erst danach auf "/" zurueckfallen.
      // Pauschal NAV_FALLBACK auszuliefern hiess: jede Navigation zeigt die
      // Startseite, egal wohin sie ging. Gematcht wird auf url.pathname statt
      // auf req — sonst suchte der Cache nach "/qr?data=…" und faende die
      // query-los abgelegte Fassung nie.
      fetch(req).catch(() =>
        caches
          .open(CACHE)
          .then(async (c) => (await c.match(url.pathname)) ?? (await c.match(NAV_FALLBACK))),
      ),
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }),
  );
});
`;
