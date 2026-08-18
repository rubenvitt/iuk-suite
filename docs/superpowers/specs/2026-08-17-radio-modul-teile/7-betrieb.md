# 7. PWA, Health, Boot-Pruefungen und Konfiguration

Dieses Kapitel traegt alles, was `radio` **ausserhalb** einer Seite braucht: den Umgang mit dem
Service Worker des Alt-Kiosks, den Endpunkt, den der Monitor abfragt, die Pruefungen beim Start, die
Umgebungsvariablen und die Sicherung.

**Zu den Fallen-Nummern:** in diesem Projekt zaehlen drei Systeme parallel. „Suite-Falle N" meint die
zwoelf aus `CLAUDE.md:8-114`. „Analyse-Falle N" meint die 31 aus
`docs/radio-portierung-analyse.md:1187-1756`. „lagerbuch-Falle N" meint die Nummerierung der
Lagerbuch-Spec (55/56/57/61), die der Auftrag zitiert. Jede Nennung unten traegt ihre Quelle mit.

**Zu den Kapitelnummern:** wo dieses Kapitel eine Zusage an ein anderes macht, steht sie als
„**Zusage an das \<Sache\>-Kapitel**". Die Nummer setzt die Zusammenfuehrung ein — sie steht hier
bewusst nicht geraten da. Gesammelt in §7.7.

---

## 7.1 PWA: `radio` bekommt keine — und braucht dafuer einen Abraeum-Worker

### 7.1.1 Die Entscheidung

**`radio` erhaelt kein Manifest, keine Icon-Handler und keinen `<link rel="manifest">`.** Es entsteht
weder `src/app/m/radio/manifest.webmanifest/route.ts` noch ein Icon-Handler, und das Modul-Layout
setzt **kein** `metadata.manifest`.

Begruendung, in der Reihenfolge der Tragfaehigkeit:

1. **Der Nutzungsfall ist weg.** Betreiberantwort 5 (`docs/radio-portierung-analyse.md:1774`,
   woertlich „Ist kein Tablet.") beschreibt zwei Zugangswege: ein gescannter QR-Code, oder die
   Anmeldung ueber die Suite mit Zugriff aus der Kachel. Beide enden in einem **Browser-Tab**. Eine
   PWA loest genau ein Problem, das hier keins ist: das wiederholte Starten **ohne** Adresszeile auf
   **einem** Geraet. Wer einen QR-Code scannt, installiert nichts; wer aus der Suite-Kachel kommt,
   hat die Suite schon offen.
2. **Ein Manifest ohne Installationsabsicht ist eine Zusage, die niemand einloest.** `display:
   standalone` und ein `start_url` sind Werte, die beim Installieren **eingebrannt** werden — der
   Kopfkommentar von `src/app/m/lagerbuch/manifest.webmanifest/route.ts:38-41` schreibt genau das
   aus („SIE WERDEN BEIM INSTALLIEREN EINGEBRANNT. Ein spaeterer Tausch erreicht kein Geraet, auf dem
   die App schon liegt."). Fuer ein Modul, dessen Bedienung mit dem Zurueckgeben endet, ist das
   Risiko ohne Gegenwert.
3. **Offline schreiben ist offen** (Betreiberfrage 8, `docs/radio-portierung-analyse.md:1782`). Ein
   Service Worker mit Cache, der heute gebaut wird, verspricht genau die Faehigkeit, die diese Spec
   nicht zusagen darf — siehe §7.1.6.

**Damit ist lagerbuch-Falle 56 („jeder Suite-Host bewirbt eine Modul-PWA") durch Abwesenheit
beantwortet.** Das ist die staerkste Form: es gibt keinen Pfad an der Wurzel, der sie ausloesen
koennte, und keinen Host-Riegel, den ein spaeterer Umbau vergessen kann.

**Folge, ausdruecklich, damit sie nicht als Auslassung gelesen wird:** die drei PWA-Bauteile des
Alt-Kiosks — `PWAInstallBanner.tsx`, `PWAOfflineIndicator.tsx`, `PWAUpdateNotification.tsx` in
`radio-inventar/apps/frontend/src/components/pwa/` — wandern **nicht mit**. Ebenso nicht der Hook
`radio-inventar/apps/frontend/src/hooks/usePWA.ts` (153 Zeilen). **Suite-Falle 7** (`CLAUDE.md:31-44`,
`@ant-design/icons` in einer Server Component ergibt HTTP 500) wird von diesem Kapitel deshalb
**nicht beruehrt** — es entsteht hier kein Icon und kein Symbol. Das ist eine Folge der Entscheidung,
keine Luecke.

### 7.1.2 Was der Alt-Kiosk hinterlaesst — gemessen

Die Analyse fuehrt an zwei Stellen ausdruecklich „**nicht gemessen**": Analyse-Falle 30 (i)
(`docs/radio-portierung-analyse.md:1712-1714`, „Der Scope des **Alt**-Kiosks … ist **nicht
gemessen**") und offene Messung 36 (`:2149-2150`). **Beide sind jetzt gemessen.** Es gibt kein
Vite-PWA-Plugin — `radio-inventar/apps/frontend/vite.config.ts` enthaelt weder `VitePWA` noch
`workbox`; der Worker ist handgeschrieben und liegt statisch in `public/`:

| Tatsache | Beleg |
| --- | --- |
| Registrierung mit **Root-Scope** | `radio-inventar/apps/frontend/src/hooks/usePWA.ts:72-73` — `navigator.serviceWorker.register('/sw.js', { scope: '/' })` |
| Auslieferungspfad `/sw.js`, statisch | `radio-inventar/apps/frontend/public/sw.js` (3,6 kB, kein Build-Schritt) |
| Cache-Name | `sw.js:2` — `const CACHE_NAME = 'radio-inventar-v1'` |
| Uebernahme **sofort**, ohne Reload | `sw.js:24` `self.skipWaiting()`, `sw.js:40` `self.clients.claim()` |
| Vorgeladen: `/`, `/offline.html`, `/manifest.json`, `/favicon.svg`, `/apple-touch-icon.svg`, drei Icons | `sw.js:6-15` |
| Manifest an der Wurzel, `scope: "/"`, `start_url: "/"` | `radio-inventar/apps/frontend/public/manifest.json` |
| `<link rel="manifest" href="/manifest.json">` | `radio-inventar/apps/frontend/index.html:7` |

**Und die Strategie je Anfrageart — das ist der Teil, der Analyse-Falle 30 (ii) praezisiert:**

* **Navigationen** (`request.mode === 'navigate'`): **network-first**, Cache nur im `.catch()`
  (`sw.js:78-96`).
* **`/api/*`**: ebenfalls **network-first**, Cache nur im `.catch()` (`sw.js:56-77`) — und
  erfolgreiche Antworten werden per `cache.put` mitgeschrieben (`sw.js:63-68`).
* **Alles andere** (JS, CSS, Bilder, `/manifest.json`, Icons): **cache-first**, mit
  Hintergrund-Nachladen (`sw.js:100-127`).

**Daraus folgt die Gefahrenlage nach dem Umschwenk praeziser als in der Analyse.** Der Origin bleibt
zeichengleich (Betreiberantwort 1) und es gibt **kein Parallelfenster** (gesetzte Entscheidung 3) —
jedes Telefon, das den Alt-Kiosk je geoeffnet hat, traegt den alten Worker weiter, und er ist
`clients.claim()`-aktiv. Was das konkret heisst:

* **Kein dauerhaft veraltetes HTML.** Navigationen sind network-first; solange Netz da ist, kommt die
  Suite-Antwort durch. Die Analyse hielt hier das Schlimmere fuer moeglich (`:1716-1721`); gemessen
  ist es der guenstigere Fall.
* **Aber:** ohne Netz liefert der alte Worker `/` aus seinem Cache — die **Alt-Oberflaeche**, gegen
  ein Backend, das es nicht mehr gibt. Und `cache-first` betrifft dauerhaft `/manifest.json`,
  `/favicon.svg`, `/apple-touch-icon.svg` und die drei Icons: **eine installierte Alt-PWA bewirbt
  sich nach dem Cutover mit dem alten Manifest weiter**, weil das Manifest aus dem Cache kommt und
  nie neu geholt wird.
* **Dazu die zwischengespeicherten `/api`-Antworten.** Der alte Worker hat Bestands- und
  Ausleihdaten in seinem Cache liegen; sie sind fuer die Suite bedeutungslos, gehoeren aber nicht auf
  ein fremdes Telefon.

**Kein Gate sieht davon etwas** (`docs/radio-portierung-analyse.md:1723-1724`): ein Service Worker
mit veraltetem Cache antwortet mit HTTP 200.

### 7.1.3 Der Abraeum-Worker

**Es entsteht genau eine PWA-Route, und ihr einziger Zweck ist die Loeschung.**

Dateien:

* `src/app/m/radio/_lib/sw-quelle.ts` — exportiert `export const RADIO_SW_ABRAEUM_QUELLE: string`.
  **Kein `"use client"`** (Suite-Falle 6, `CLAUDE.md:27-30`): ein Wert aus einem Client-Modul kaeme
  im Route Handler als Client-Referenz an, HTTP 500. Vorbild fuer die Trennung Quelle/Handler:
  `src/app/m/qr/sw.js/route.ts:1` liest `SW_SOURCE` aus `@/app/m/qr/_lib/sw-source` mit der
  Begruendung „damit er testbar ist".
* `src/app/m/radio/sw.js/route.ts` — `export function GET(req: Request): Response`.

Der Handler, vollstaendig:

```ts
import { hostAbweisung } from "../_lib/hostRiegel";
import { RADIO_SW_ABRAEUM_QUELLE } from "../_lib/sw-quelle";

export function GET(req: Request): Response {
  return (
    hostAbweisung(req) ??
    new Response(RADIO_SW_ABRAEUM_QUELLE, {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-cache",
      },
    })
  );
}
```

`hostAbweisung` ist die **nicht werfende** Riegelform (`Response | null`, mit `??`
kurzgeschlossen) — genau die Bauform aus `src/app/m/lagerbuch/_lib/hostRiegel.ts`, und aus demselben
Grund: ein `notFound()` waere eine HTML-Fehlerseite mit `Content-Type: text/html`, und der Browser
meldete „manifest fetch failed" bzw. brach die Worker-Registrierung mit einer irrefuehrenden Meldung
ab. Der Riegel steht **strukturell** als erste Anweisung, nicht nur konventionell: der rechte
`??`-Zweig wird erst ausgewertet, wenn der linke `null` ist. **Zusage an das Zugangs-Kapitel:**
`hostAbweisung` liegt in `src/app/m/radio/_lib/hostRiegel.ts` und ruft die nicht werfende
Praedikatsform aus `src/app/m/radio/_lib/host.ts` (dort in der lagerbuch-Form, ohne
„kein Prod-Host konfiguriert → durchlassen"-Zweig, gesetzte Entscheidung 10). Dieses Kapitel legt
`host.ts` nicht an, es benutzt es.

Der Quelltext in `sw-quelle.ts` — verbindlich, drei Eigenschaften und **kein Zeichen mehr**:

```js
// Abraeum-Worker: ersetzt den Service Worker des Alt-Kiosks und traegt sich aus.
// KEIN fetch-Handler. Dieser Worker beantwortet nichts.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // ALLE Cache-Namen, nicht nur 'radio-inventar-v1': aeltere Staende koennen
      // weitere hinterlassen haben, und dieser Origin gehoert ab jetzt der Suite.
      const namen = await caches.keys();
      await Promise.all(namen.map((n) => caches.delete(n)));
      await self.clients.claim();
      await self.registration.unregister();
    })(),
  );
});
```

**Die drei Eigenschaften und warum jede einzelne noetig ist:**

1. **Kein `fetch`-Handler.** Ein Worker ohne `fetch`-Handler laesst jede Anfrage unberuehrt zum Netz.
   Das ist die einzige Form, die keine neue Cache-Semantik einfuehrt — und sie macht Betreiberfrage 8
   nicht vor.
2. **`caches.keys()` statt eines festen Namens.** Der gemessene Name ist `radio-inventar-v1`
   (`radio-inventar/apps/frontend/public/sw.js:2`), aber die `activate`-Logik des Alten loescht
   selbst nur fremde Namen (`sw.js:33-36`, `:35`) — ueber frueheren Staenden auf dem jeweiligen Telefon sagt
   das nichts. Ein fester Name ist eine Annahme; `caches.keys()` ist keine.
3. **`skipWaiting()` + `clients.claim()` vor `unregister()`.** Ohne beides bliebe der **alte** Worker
   der aktive, bis alle Tabs geschlossen sind — und `unregister()` eines Workers, der nie aktiv
   wurde, entfernt die falsche Registrierung nicht.

**Zwei Betriebsfolgen, auf die das Runbook baut:**

* **Nichts in der Suite ruft `navigator.serviceWorker.register()`.** Diese Route wird also
  ausschliesslich von der **Update-Pruefung eines schon registrierten Workers** abgeholt: Browser
  holen das Worker-Skript bei einer Navigation im Scope neu und vergleichen die Bytes. Sie
  unterscheiden sich, der Abraeum-Worker installiert sich, raeumt auf, traegt sich aus. **Auf einem
  Geraet, das den Alt-Kiosk nie geoeffnet hat, wird die Route nie abgerufen** — das ist richtig und
  kein Fehler.
* **Der erste Seitenaufruf nach dem Umschwenk kann noch vom alten Worker bedient werden.** Der
  Worst Case ist **eine** veraltete Seitenansicht je Geraet, danach ist der Origin frei. Das gehoert
  in die Ankuendigung, die die gesetzte Entscheidung 8 ohnehin verlangt — **Zusage an das
  Zugangs-Kapitel** (das die Ankuendigung fachlich fuehrt) und **Zusage an Spec 2** (Runbook-Zeile:
  „Nach dem Umschwenk ein Telefon, das den Alt-Kiosk kannte, einmal neu laden und pruefen, dass die
  Suite-Oberflaeche erscheint").

### 7.1.4 Warum `/sw.js` trotz Modulpfad Root-Scope hat

Ein Service Worker beansprucht nur seinen **eigenen Pfad und darunter** — Analyse-Falle 30 (i)
(`docs/radio-portierung-analyse.md:1709-1711`) ist richtig, und die Antwort ist der Rewrite:

`decideRoute` in `src/core/routing.ts:43-79` prueft zuerst die Passthrough-Liste (`:50-52`), dann
einen bereits internen `/m/<key>`-Pfad (`:58-66`), und rewritet erst danach nach Host:
`return { action: "rewrite", target: `/m/${mod.key}${rest}`, moduleKey: mod.key }` (`:79`). Der
Browser sieht auf `radio.iuk-ue.de` also die Adresse **`/sw.js`** — Root-Scope, ohne
`Service-Worker-Allowed`-Header —, waehrend intern `/m/radio/sw.js` antwortet. Genau derselbe
Mechanismus tragt heute `qr` (`src/app/m/qr/sw.js/route.ts:3-8`, woertlich: „extern liegt er auf
`qr.<domain>/sw.js` (Root-Scope, ohne `Service-Worker-Allowed`-Header), intern unter `/m/qr/sw.js`").

**Bedingung:** `SUITE_HOST_RADIO` muss gesetzt sein, sonst greift der Rewrite nicht und `/sw.js` auf
`radio.iuk-ue.de` landet im Portal-Modul (§7.4.4, erster stiller Fall). Auf **jedem anderen**
Suite-Host rewritet `/sw.js` in dessen Modul; die radio-Route ist dort nicht erreichbar, und wo sie
es doch waere (interner Pfad `/m/radio/sw.js`), antwortet der Host-Riegel mit 404.

### 7.1.5 Die `releaseBody()`-Lehre — warum sie hier nicht greift

Der Service Worker des `qr`-Moduls war latent kaputt, weil er Bodies nicht gecachter Antworten
ungelesen liess; die Abhilfe steht dort heute als `releaseBody(res)`
(`src/app/m/qr/_lib/sw-source.ts:100`, `:150`, Definition `:212`; Entscheidungslog vom 23.07.).

**Der Abraeum-Worker kann diesen Fehler strukturell nicht haben: er hat keinen `fetch`-Handler und
liest niemals eine Antwort.** Die Lehre wird also nicht abgeschrieben, sondern **eingehalten, indem
die Ursache fehlt**. Ein `releaseBody` in dieser Datei waere toter Code — und ein Signal, dass hier
doch Antworten verarbeitet werden.

**Die Lehre wird trotzdem verbindlich weitergegeben:** sollte `radio` je einen cachenden Worker
bekommen (nur unter einer Antwort auf Betreiberfrage 8, §7.1.6), gilt ab der ersten Zeile: jede
Antwort, die **nicht** in den Cache geht, wird ausgelesen oder verworfen. Der Satz gehoert dann in
den Kopfkommentar von `sw-quelle.ts`, nicht in ein Review.

### 7.1.6 Offline **schreiben** — Betreiberfrage 8, offen. Nicht entschieden.

Betreiberfrage 8 (`docs/radio-portierung-analyse.md:1782`) ist die einzige der acht, die offen
geblieben ist: „Muss der Kiosk offline **schreiben** koennen?" Mit Antwort 5 hat sie sich verschoben —
nicht „Wandtablet ohne Netz", sondern „Telefon im Funkraum mit schlechtem Empfang".

**Dieses Kapitel entscheidet sie nicht und baut nichts, was sie vorwegnimmt.** Was hier zugesagt
wird, ist nur, was eine spaetere Antwort **nicht verbaut**:

* Der Abraeum-Worker fuehrt keinen Cache und keine Queue ein. Eine spaetere Offline-Faehigkeit
  ersetzt ihn, sie muss ihn nicht rueckbauen.
* Die Adresse `/sw.js` auf dem radio-Host ist damit **belegt und erprobt**. Ein spaeterer Worker
  erbt Route, Host-Riegel und Test.
* Was ein „Ja" kosten wuerde, gehoert benannt, damit die Frage entscheidbar bleibt: eine
  Schreib-Warteschlange auf dem Geraet heisst **Ausleihen ohne Serverpruefung**, also einen
  Konfliktfall „zwei Telefone leihen dasselbe Geraet offline aus". Der partielle Unique-Index auf
  offene Leihen (Analyse-Falle 2, `docs/radio-portierung-analyse.md:1208`) faengt das beim
  Nachtragen mit einem **Fehler**, nicht mit einer Loesung — die Aufloesung waere fachlich zu
  entscheiden. Deshalb ist „offline lesen" beantwortbar, „offline schreiben" nicht nebenbei.

**Was heute gilt:** ohne Netz ist `radio` nicht bedienbar. Das ist der Zustand des Alt-Kiosks beim
Schreiben ebenfalls (`docs/radio-portierung-analyse.md:2289-2294`), also **keine
Verhaltensaenderung** und **keine Ankuendigung**.

⚠️ **Nicht zu verwechseln mit dem Ausfall-Puffer.** `STALE_GRACE_MS = 5 * 60_000`
(`radio-inventar/apps/backend/src/modules/radio-admin/radio-admin.service.ts:48`, gesetzte
Entscheidung 15) ist **serverseitig** und hat mit dem Service Worker nichts zu tun: er haelt
Ausleihe/Rueckgabe/Historie bedienbar, wenn die **HTTP-Grenze zur Verwaltung** kurz stoert, nicht
wenn das Telefon kein Netz hat. Beim naiven Port fiele er weg. Er wird in dem Kapitel gefuehrt, das
den Datenweg traegt — **Zusage an das Ausleih-Kapitel**: dieses Kapitel baut keinen Ersatz dafuer und
kein Offline-Verhalten, das ihn ueberdeckt.

### 7.1.7 Tests

| Datei | Testname | Prueft |
| --- | --- | --- |
| `src/app/m/radio/_lib/sw-quelle.test.ts` | `"der Abraeum-Worker registriert keinen fetch-Handler"` | Quelle in einem Fake-`self` ausfuehren (`new Function("self", "caches", RADIO_SW_ABRAEUM_QUELLE)`), die aufgezeichneten `addEventListener`-Namen sind genau `["install", "activate"]` |
| " | `"er loescht ALLE Cache-Namen, nicht nur radio-inventar-v1"` | Fake-`caches.keys()` liefert `["radio-inventar-v1", "radio-inventar-v0", "sonstiges"]`; nach `activate` ist `caches.delete` fuer **alle drei** gerufen. **Drei unterschiedliche Namen, keiner davon Praefix des anderen** — ein Test mit nur `radio-inventar-v1` liesse eine fest verdrahtete Loeschung durch |
| " | `"er beansprucht die Clients und traegt sich danach aus"` | `clients.claim` wird gerufen, **danach** `registration.unregister`; Reihenfolge ueber eine gemeinsame Aufrufliste geprueft, nicht ueber zwei getrennte Spies |
| `src/app/m/radio/sw.js/route.test.ts` | `"auf fremdem Host 404, und nicht als HTML"` | `GET` mit `host: portal.localtest.me` → Status 404, Body `"Not found"`, **kein** `text/html` |
| " | `"auf dem radio-Host 200 mit text/javascript"` | `host: radio.localtest.me` → 200, `content-type` beginnt mit `text/javascript`, `cache-control: no-cache` |
| `src/app/m/radio/_lib/keine-pwa.test.ts` | `"radio bewirbt keine PWA"` | **Quelltext-Scan** ueber `src/app/m/radio`: keine Vorkommen von `serviceWorker.register`, `manifest.webmanifest`, `rel="manifest"`, `metadata.manifest`, `beforeinstallprompt`. Begruendung im Test: die Entscheidung „keine PWA" ist eine **Abwesenheit**, und Abwesenheiten haben sonst kein Gate — ein spaeter nachgeruesteter Banner waere lokal gruen und bewaerbe auf jedem Suite-Host eine radio-PWA |

**Kein e2e fuer den Fremd-Host.** Playwright fahrt gegen genau einen `baseURL` (lagerbuch-Falle 57);
der Fremd-Host-Fall ist deshalb ein Vitest-Routentest, nicht ein Playwright-Test. Ein e2e-Fall
`e2e/radio-sw.spec.ts` mit dem Namen `"GET /sw.js liefert den Abraeum-Worker"` ist sinnvoll, sobald
der Zwei-Host-Aufbau des Moduls steht — **Zusage an das Test-Kapitel**, das die e2e-Aufstellung
fuehrt: dieses Kapitel verlangt dort genau einen Fall, und er prueft die **Antwort**
(`page.waitForResponse` bzw. `request.get`), nicht eine Folgewirkung (Suite-Falle 10, zweite
Testregel, `CLAUDE.md:82-85`).

---

## 7.2 Health

### 7.2.1 Was der Monitor abfragt

**Der externe Monitor fragt `https://radio.iuk-ue.de/api/health/radio` ab. Nie `/api/health`.**

Der Grund ist keine Vorliebe: `src/app/api/health/route.ts` ist zwei Zeilen und liefert konstant
`{ status: "ok", timestamp }` — kein Modul, kein Parameter, keine Datenbank. Nach dem Cutover
antwortet `radio.iuk-ue.de/api/health` also weiter `ok`, **ohne ueber `radio` irgendetwas zu sagen**
(Analyse-Falle 29, `docs/radio-portierung-analyse.md:1677-1683`). Der `[modul]`-Handler sagt selbst,
warum er der richtige ist (`src/app/api/health/[modul]/route.ts:12-17`).

Erwartete Antwort: `{ status: "ok", module: "radio", revision: "<sha>" }` mit HTTP 200; bei Fehler
`status: "error"` und HTTP 503 (`src/app/api/health/[modul]/route.ts:27-30`). Die `revision` traegt
nur dieser Handler und nicht `/api/health` — begruendet ebendort (`:12-17`: die parameterfreie Route
kann Next prerendern, dort stuende der Bauzeit-Wert `unbekannt`). **Zusage an Spec 2:** die
Rollout-Verifikation von `radio` liest `revision` aus **dieser** Antwort.

`/api/health` und `/api/health/radio` sind beide unauthentifiziert erreichbar — `src/core/routing.ts:12`
fuehrt `/api/health` in `PASSTHROUGH`, und `decideRoute` steigt dort mit `{ action: "next" }` aus
(`:50-52`). Das gilt **hostunabhaengig**: `/api/health/radio` antwortet auch auf `iuk-ue.de`. Fuer
einen Monitor ist das bequem; fuer den Cutover ist es wichtig, dass er trotzdem den **radio-Host**
abfragt, weil nur das den Router mitprueft.

### 7.2.2 Der Container-Healthcheck bleibt unveraendert

`compose.yaml:140-144` prueft `http://127.0.0.1:3000/api/health/portal`. **Das bleibt so, und es ist
richtig:** der Healthcheck entscheidet ueber Container-Neustart und `depends_on`; er beantwortet „ist
der Prozess ansprechbar", nicht „ist radio in Ordnung". Wuerde er auf `radio` umgestellt, riss ein
Datenproblem eines einzelnen Moduls **die ganze Suite** in den Neustart — portal, qr, feedback, files,
lagerbuch und aufgaben mit.

**Die Kehrseite gehoert ausgesprochen:** ein kaputtes `radio.db` laesst den Container „healthy". Es
gibt in dieser Aufstellung **keinen** Weg, auf dem der Zustand von `radio` von allein auffaellt —
genau deshalb ist der externe Monitor aus §7.2.1 nicht optional, sondern der einzige Melder.

**Kein Eintrag in `compose.yaml` wird fuer `radio` gebraucht** — kein zweiter Healthcheck, kein
neues Volume (eine Datei `radio.db` unter `DATA_DIR`, gesetzter Zuschnitt), kein neuer Service.
Einzige compose-Beruehrung ist `SUITE_TRAEFIK_RULE` (§7.4.3), und die lebt in der `.env`.

### 7.2.3 Was `/api/health/radio` **nicht** beweist — der zaehlende Check

`checkModuleHealth` (`src/core/health/index.ts:4-17`) tut genau drei Dinge: `getModule(key)`,
`openModuleDatabase(moduleDbPath(key))`, `SELECT 1`. **`openModuleDatabase` legt das Verzeichnis bei
Bedarf neu an, und better-sqlite3 legt die Datei an, wenn sie fehlt.** Ein vertipptes `DATA_DIR` oder
ein nicht gemountetes Volume ergibt damit eine **nagelneue, leere `radio.db`, auf der `SELECT 1`
klaglos gelingt — health gruen, null Geraete** (Analyse-Falle 29,
`docs/radio-portierung-analyse.md:1685-1696`). Der Healthcheck **ist** das Gate, und er ist gruen.

**Der Gegenzug ist kein zweiter Endpunkt, sondern ein Runbook-Schritt.** Ein zaehlender
HTTP-Endpunkt waere ein unauthentifizierter Zaehler ueber den Geraetebestand — nicht schlimm, aber
auch nicht noetig, weil die Freigabe nach dem Cutover ohnehin ein Mensch mit `sqlite3` erteilt.

**Zusage an Spec 2 (Runbook) und an das Import-Kapitel:** die Freigabe nach dem Import prueft die
**Zaehl-Abfragen aus Pflicht 4** der Analyse (`docs/radio-portierung-analyse.md:748-763`) gegen die
Alt-Werte, nicht `status: "ok"`. Das sind fuenf Abfragen; die erste liefert **sechs** Zahlen
(`devices`, `software_versions`, `api_tokens`, `users`, `device_events`, `loans`, `:751-752`) — daher
die Rede von „den sechs Zahlen" in Falle 29. Die verbindliche Liste fuehrt das Import-Kapitel; dieses
Kapitel sagt nur zu, dass **`/api/health/radio` sie nicht ersetzt** und dass der Monitor sie nicht
kennt.

Ein Nebenbefund, der die Runbook-Zeile praeziser macht: `api_tokens` traegt produktiv genau einen
Konsumenten, den Alt-Kiosk (gesetzte Entscheidung 13). Die Zahl bleibt trotzdem eine
Paritaets-Sollzahl — sie zaehlt Historie, nicht Zukunft.

### 7.2.4 Nebenwirkung, die als Vor-Cutover-Pruefung taugt

`checkModuleHealth` ruft `getModule(key)` als erstes, und `getModule` wirft bei unbekanntem Key
(Kommentar ebendort: „throws on unknown; not yet opened, so nothing to close"). **Bis der
Registry-Eintrag `radio` existiert, antwortet `/api/health/radio` also mit HTTP 503** und der
Fehlermeldung von `getModule`. Das ist kein Fehler, sondern die billigste Pruefung, dass ein Image den
Modul-Eintrag wirklich enthaelt: **Zusage an Spec 2** — vor dem Umschwenk einmal
`curl -s -o /dev/null -w '%{http_code}' https://iuk-ue.de/api/health/radio` gegen den **laufenden**
Container; 200 heisst „das Modul ist im Image", 503 heisst „falsches Image".

`src/core/health/index.test.ts` braucht **keinen** radio-spezifischen Fall: die Funktion ist
modul-agnostisch, und ein Test je Modul waere eine Liste, die das naechste Modul vergisst.

---

## 7.3 Boot-Pruefungen

### 7.3.1 Die Einhaengung — ohne sie laufen die Pruefungen nie

**Verbindlich: in `src/core/bootstrap.ts` wird die Fehlerliste um eine Zeile erweitert**, unmittelbar
nach der lagerbuch-Zeile (`:90`):

```ts
    ...(await lagerbuchBootFehler()),
    // radio: greift nur bei gesetztem SUITE_HOST_RADIO und WIRFT NIE (§7.3.2).
    ...(await radioBootFehler()),
```

dazu der Import neben `:14`:

```ts
import { radioBootFehler } from "@/app/m/radio/_lib/boot";
```

⚠️ **Das ist der stillste Posten dieses Kapitels.** Ohne diese Zeile laufen alle Pruefungen unten
**nie** — die Datei existiert, die Tests dazu sind gruen, `pnpm build` ist gruen, und beim Cutover
faellt niemandem auf, dass nichts geprueft wurde. `src/core/bootstrap.test.ts` koppelt nur das
Migrations-Dreieck (Migrationsordner ↔ `MODULE_MIGRATIONS`/`CORE_MIGRATIONS` ↔ `COPY` im
`Dockerfile`); **fuer die Boot-Haken gibt es kein Netz.** Deshalb schuldet dieses Kapitel selbst
einen Test dafuer, §7.3.7, letzte Zeile.

Reihenfolge im Boot, gemessen: `src/instrumentation.ts:55` `await assertHostConfig()`, **dann** `:56`
`migrateAllModules()`, dann `:57` der Seed, dann `:60` `startBackgroundWork()`. Das `await` in `:55`
ist Pflicht — der Kommentar `:51-54` schreibt aus, was sonst passiert; `assertHostConfig` wiederholt
es (`src/core/bootstrap.ts:78-81`): ohne `await` wird aus dem Startabbruch eine unbehandelte
Rejection, die **nichts** abbricht.

**Folge fuer den Zuschnitt der Pruefungen:** `radioBootFehler()` laeuft **vor den Migrationen**. Es
darf deshalb **keine Tabelle lesen** — auf einem frischen Volume gibt es sie noch nicht, und ein
`no such table` waere ein Startabbruch mit einer Meldung, die in die Irre fuehrt. Alles, was Daten
sehen muss, liegt in `starteRadioHintergrund()` (§7.3.5), das **nach** den Migrationen laeuft.

### 7.3.2 `radioBootFehler()` — Datei, Signatur, Schalter

Datei: `src/app/m/radio/_lib/boot.ts`. Kein `"use client"`, kein Icon-Import — die Datei laeuft im
Instrumentation-Hook, bevor irgendetwas rendert (Vorbild und Begruendung:
`src/app/m/lagerbuch/_lib/boot.ts:1-27`).

```ts
type EnvLike = Record<string, string | undefined>;

export async function radioBootFehler(env: EnvLike = process.env): Promise<string[]>;
```

**`async` und `Promise<string[]>`, obwohl nichts darin asynchron ist.** Die Naht daneben sieht so aus
(`...(await filesBootFehler())`, `...(await lagerbuchBootFehler())`, `src/core/bootstrap.ts:87-90`);
eine synchrone Funktion an derselben Stelle laedt dazu ein, das `await` beim naechsten Umbau zu
vergessen — und aus einem Startabbruch wuerde eine unbehandelte Rejection, die nichts abbricht.
Dieselbe Begruendung steht bei lagerbuch (`_lib/boot.ts:21-26`); sie wird hier nicht neu erfunden,
sondern uebernommen.

**Sie wirft nie selbst.** Sie **liefert** Meldungen; `assertHostConfig` entscheidet einmal, ob daraus
ein Abbruch wird (`src/core/bootstrap.ts:92-94`). Ein `throw` von hier naehme portal, qr, feedback,
files, lagerbuch und aufgaben mit, und die Meldung naennte nicht einmal das ausloesende Modul.

**Der Schalter ist die erste Anweisung:**

```ts
  if (prodHostsFor(getModule("radio"), env).length === 0) return [];
```

`prodHostsFor` liest `SUITE_HOST_RADIO` und faellt sonst auf `mod.prodHosts` zurueck
(`src/core/registry.ts:207-209`); mit `prodHosts: []` (gesetzter Zuschnitt 1) ist der Schalter genau
**„der Betreiber hat radio eingeschaltet"**. Das ist keine Milderung, sondern eine Notwendigkeit:
eine unbedingte Pflicht hiesse, dass die Suite ab dem ersten Image mit `radio` nicht mehr startet,
bis die `.env` ergaenzt ist — dieses Modul blockierte damit **jeden unbeteiligten Deploy** im Fenster
zwischen Merge und Cutover. Es ist **dieselbe** Variable, die das Modul einschaltet; einen zweiten,
vergessbaren gibt es nicht (Begruendung woertlich uebernommen aus
`src/app/m/lagerbuch/_lib/boot.ts:13-19`).

### 7.3.3 Was **wirft** (also: als String zurueckkommt)

⚠️ **Wichtig fuer die Lesart:** *jeder* zurueckgegebene String **ist** ein Startabbruch — `errors`
ist eine Liste, und `assertHostConfig` wirft bei `length > 0` (`src/core/bootstrap.ts:92`). „Nur
melden" kann daher **nie** ein Rueckgabewert sein, sondern nur eine Protokollzeile (§7.3.4).

Die Grenze zwischen beiden Listen ist eine Regel, nicht ein Gefuehl:

> **Werfen darf nur, was `radio` fuer seine eigenen Nutzer falsch macht und im Repo bzw. in der `.env`
> behebbar ist. Alles, was erst am Server sichtbar wird und dort behoben werden muss, meldet — sonst
> steht die Suite am Cutover-Abend still, weil eine Traefik-Zeile fehlt.**

| Nr. | Pruefung | Meldung/Grund | Beleg |
| --- | --- | --- | --- |
| **1** | `SUITE_ADMIN_GROUP_RADIO` fehlt oder ist leer | Ohne sie greift der Entwicklungs-Vorgabewert aus der Registry; ist in Pocket ID niemand in dieser Gruppe, ist die Folge ein **stummes 404 fuer ALLE Verwaltenden** — fuer `radio` gibt es bewusst **keine** Suite-Admin-Rueckfallebene (gesetzte Entscheidung 9). ⚠️ **Gelesen wird die Variable direkt**, nicht ueber `adminGroupsFor`: das faellt bei fehlender Variable auf `mod.adminGroups` zurueck (`src/core/groups.ts:102-108`) und meldete nichts. Und `validateGroupConfig` meldet den **leeren** Admin-Wert bewusst nicht — „bei den Admin-Gruppen ist leer dagegen eine gueltige Aussage und wird nicht gemeldet" (`src/core/groups.ts`, Kopfkommentar von `validateGroupConfig`) | Analyse-Falle 23, `docs/radio-portierung-analyse.md:1570-1575`; Vorbild `src/app/m/lagerbuch/_lib/boot.ts:49-69` |
| **2** | `SUITE_ACCESS_GROUP_RADIO !== undefined` | Ein gesetzter Wert waere **still wirkungslos**: `canAccess` steigt fuer `requiresAuth: false` sofort mit `true` aus (`src/core/registry.ts:239`) und liest `requiredGroups` nie. `validateGroupConfig` meldet nur den **leer** gesetzten Fall (`src/core/groups.ts:156`) — der Betreiber setzte also eine Zugangsgruppe, bekaeme keine Warnung, und das Modul blieb fuer jeden offen. Ausweg in der Meldung: **die Zeile ersatzlos entfernen**; wer den Verwaltungszugang steuern will, setzt `SUITE_ADMIN_GROUP_RADIO` | Vorbild `src/app/m/lagerbuch/_lib/boot.ts:71-86`; die dortige Zeilenangabe `registry.ts:155` ist **veraltet**, heute `:239` (nachgemessen) |
| **3** | `RADIO_ZUGANG_SITZUNG_SECRET` fehlt oder ist kuerzer als 32 Zeichen | Ohne den Wert kann keine zeitlich begrenzte Sitzung ausgestellt oder geprueft werden; ein kurzer Wert ist eine Signatur, die aussieht wie eine. **Zusaetzlich:** Wert **gleich** `AUTH_SECRET` → eigene Meldung. Dieselbe Signatur fuer Suite- und Zugangs-Sitzung hebt die Domaenentrennung auf, die das eigene Geheimnis begruendet | Bauform woertlich lagerbuch (gesetzte Entscheidung 6); Vorbild `.env.example:250-258` |
| **4** | `RADIO_HISTORIE_MONATE` ist gesetzt, aber keine ganze Zahl ≥ 1 | **`0` wird ausdruecklich abgewiesen** und nicht als „aus" gelesen: `0` Monate Retention loescht beim ersten Lauf die **gesamte** abgeschlossene Leihhistorie. Wer die Retention abschalten will, laesst die Variable weg — dann gilt die Vorbelegung 2 (gesetzte Entscheidung 12) — und schaltet den Arbeiter ueber `RADIO_HISTORIE_PURGE=0` ab (§7.3.5) | Alt-Wert `HISTORY_RETENTION_MONTHS = 2`, `radio-admin/server/src/services/retentionService.ts:9` |
| **5** | `RADIO_ZUGANG_SITZUNG_STUNDEN` ist gesetzt, aber keine ganze Zahl in `1..168` | Eine Sitzungsdauer von `0` machte jeden gescannten Code sofort wertlos, eine von `100000` machte „zeitlich begrenzt" zur Behauptung. Obergrenze eine Woche | Vorbelegung 12 (lagerbuch: `LAGERBUCH_HELFER_SITZUNG_STUNDEN=12`, `.env.example:265`) — ⚠️ **zu bestaetigen**, §7.6 |

Die Zahlenpruefungen 4 und 5 laufen ueber **einen** Helfer in derselben Datei, damit die naechste Zahl
nicht als handgeschriebene Kopie dazukommt:

```ts
function zahlFehler(
  name: string, roh: string | undefined, min: number, max: number,
): string | null;
```

`roh === undefined` → `null` (Vorbelegung gilt). Sonst: `Number.isInteger` und Bereich, sonst eine
Meldung, die **Name, gelesenen Wert und erlaubten Bereich** nennt. **Zusage an das Zugangs-Kapitel:**
weitere `RADIO_GATE_*`-Zahlen (Bremse am Einlöse-Gate) werden von **diesem** Helfer geprueft; das
Zugangs-Kapitel legt Namen, Vorbelegung und Bereich fest, dieses Kapitel prueft sie beim Boot und
schreibt sie in `.env.example`.

⚠️ **Voraussetzung, nicht Teil dieser Spec:** die Bremse am Einlöse-Gate haengt an der
CWE-348-Umstellung in `src/core/ratelimit.ts` (eigener Suite-Posten). Solange sie offen ist, ist die
Absenderkennung am Gate faelschbar. **Das wird hier benannt und nicht umgesetzt** — und es ist keine
Boot-Pruefung: eine Env-Variable kann das nicht sehen.

### 7.3.4 Was nur **meldet**

Alles hier schreibt eine Zeile mit `console.warn` **innerhalb** von `radioBootFehler()` bzw.
`starteRadioHintergrund()` und gibt **keinen** String zurueck.

| Pruefung | Warum melden und nicht werfen | Beleg |
| --- | --- | --- |
| `SUITE_HOST_RADIO` ist gesetzt, kommt aber in `SUITE_TRAEFIK_RULE` nicht vor (beide gesetzt, sonst still) | Der Host erreicht den Container dann gar nicht erst; die Domain ist tot, ohne dass etwas kaputt aussieht. **Nicht werfen:** die Labels leben in der `.env` **auf dem Server**, ein Dev-Container hat die Variable legitim nicht, und ein Abbruch traefe genau in dem Moment, in dem der Betreiber die `.env` gerade umstellt | `compose.yaml:149-153`; die Variable kommt per `env_file` in den Prozess (`compose.yaml:88`) |
| `SUITE_TRAEFIK_RULE` enthaelt einen Host, der mit `radio-admin.` beginnt | Der Alt-Host darf dort **ausdruecklich nicht** stehen: er erreicht dann den Container, kein `SUITE_HOST_*` beansprucht ihn, `moduleForHost` liefert **portal** — und `radio-admin.iuk-ue.de` zeigt das **Portal** statt des Redirects. Melden statt werfen aus demselben Grund wie oben | Analyse-Falle 28, `docs/radio-portierung-analyse.md:1646-1652` |
| `devices` ist leer (in `starteRadioHintergrund()`, nach den Migrationen) | Das ist das Symptom aus Analyse-Falle 29: vertipptes `DATA_DIR` oder nicht gemountetes Volume ergibt eine frische, leere `radio.db`. **Niemals werfen:** vor dem Import ist die Tabelle **legitim** leer — in der Generalprobe und in jedem Dev-Container —, und ein Wurf naehme sechs unbeteiligte Module mit | `docs/radio-portierung-analyse.md:1685-1696` |
| `radio.db` existierte vor diesem Start nicht (Datei neu angelegt) | Dieselbe Familie, aber eine Stufe frueher und deutlich aussagekraeftiger: `openModuleDatabase` legt Verzeichnis **und** Datei stumm an (`src/core/health/index.ts:9-11` nutzt genau diesen Weg). Die Zeile lautet sinngemaess „radio.db wurde neu angelegt — bei einem Cutover ist das der Hinweis auf ein nicht gemountetes Volume" | s. o. |

**Warum eine Protokollzeile hier ueberhaupt etwas wert ist:** sie steht im Container-Log direkt neben
`docker compose up -d`, also genau dort, wo beim Cutover jemand hinsieht. **Zusage an Spec 2:** das
Runbook liest nach dem Start einmal `docker compose logs --since 2m suite` und erwartet **keine**
`radio:`-**Warnung**; eine gefundene Warnung ist ein Stopp-Punkt, kein Hinweis.

⚠️ **Eine `radio:`-Zeile ist im Cutover-Fenster erwartet und darf deshalb keine Warnung sein:**
`RADIO_HISTORIE_PURGE=0` (§7.3.5) meldet „Retention abgeschaltet". Sie geht als **`console.info`**
ins Log, nicht als `console.warn` — sonst tritt der vorgeschriebene Cutover-Zustand die eigene
Stopp-Bedingung aus. Die Trennung ist damit scharf und pruefbar: **`warn` = Stopp, `info` = Zustand.**
Und sie wird **bei jedem Start neu geschrieben**, nicht nur beim ersten: ein nach dem Fenster
vergessenes `RADIO_HISTORIE_PURGE=0` ist sonst ein **stiller** Verlust der Retention — die Zeile ist
das einzige, was ihn findbar haelt. **Zusage an Spec 2:** der Schritt „Retention wieder einschalten"
endet mit einem zweiten Log-Blick, in dem die Info-Zeile **fehlt**.

### 7.3.5 Der Retention-Arbeiter — und warum er **nicht** beim Boot purgt

`startBackgroundWork()` (`src/core/bootstrap.ts:121-126`) ist der Ort fuer alles, was ein Modul
einmal je Prozess im Hintergrund startet; der Kopfkommentar `:112-120` sagt, warum es von
`migrateAllModules()` getrennt ist und dass es **danach** laeuft (`src/instrumentation.ts:56` vor
`:60`). **Verbindlich: eine Zeile mehr dort**, plus Import:

```ts
export function startBackgroundWork(): void {
  starteFilesHintergrund();
  starteAufgabenScanArbeiter();
  // radio: Retention-Timer + Bestandswarnung. Purgt NICHT bei t=0 (§7.3.5).
  starteRadioHintergrund();
}
```

`starteRadioHintergrund(): void` liegt in `src/app/m/radio/_lib/boot.ts` (dieselbe Datei, damit
Boot-Wissen nicht auf zwei Dateien faellt), ist **synchron** und **wirft nie** — ein Wurf hier naehme
den Start der ganzen Suite mit, nachdem die Migrationen schon liefen. Vorbild fuer beides:
`starteAufgabenScanArbeiter()` („synchron und wirft nie", `src/core/bootstrap.ts:123-125`).

Sie tut genau drei Dinge:

1. **Aussteigen, wenn das Modul nicht eingeschaltet ist** — derselbe `prodHostsFor(...).length === 0`
   -Schalter wie in §7.3.2. Kein Timer in einem Container, der `radio` gar nicht bedient.
2. **Die Bestandswarnung aus §7.3.4** (`devices` leer, Datei neu) — hier, weil erst hier die Tabellen
   existieren.
3. **Den Retention-Timer registrieren.** `setInterval(purge, 24 * 60 * 60 * 1000)` mit `.unref()`,
   **und der erste Lauf ist nicht t=0.**

⚠️ **Das ist der Kern und der Unterschied zur Alt-App.** `radio-admin/server/src/index.ts:35` ruft
`startRetentionSchedule`, und `radio-admin/server/src/services/retentionService.ts:47` fuehrt
`purge()` **sofort** aus, erst `:48` setzt den Timer — mit dem Kommentar „straight after a data
migration". Die Folge steht in der Analyse (`docs/radio-portierung-analyse.md:823-831`): weil der
Cutoff an der **Wanduhr** haengt und nicht am Cutover-Zeitpunkt, **loescht jeder weitere Start mehr
als der vorige**. In der Suite kommt ein zweiter Verstaerker dazu: ein Faktor-1000-Fehler in der
Zeitstempel-Normalisierung (gesetzte Entscheidung 11) ist **paritaetsgruen**, und ein Purge beim Boot
verwandelt ihn im selben Atemzug in Datenverlust — der Import ist dann fertig, die Historie weg, und
die Paritaetspruefung hat gelaechelt.

Deshalb verbindlich:

* **Kein Purge bei t=0.** Der erste Lauf ist um `RADIO_HISTORIE_ERSTLAUF_MINUTEN` (Vorbelegung **60**)
  verzoegert. Eine Stunde ist lang genug, dass ein Import, eine Stichprobe und ein „Halt, das sieht
  falsch aus" dazwischenpassen, und kurz genug, dass die Retention in jedem realistischen
  Prozessleben ueberhaupt greift.
* **`RADIO_HISTORIE_PURGE=0` schaltet den Purge ganz ab** — der Timer wird dann nicht registriert und
  eine **`console.info`**-Zeile ins Log geschrieben, bei **jedem** Start neu (Begruendung am Ende von
  §7.3.4: als `warn` traete der vorgeschriebene Cutover-Zustand die eigene Stopp-Bedingung, und ohne
  Wiederholung waere ein vergessenes `0` ein stiller Verlust der Retention).
  **Zusage an Spec 2:** im Cutover-Fenster steht `RADIO_HISTORIE_PURGE=0`
  in der `.env`; die Zeile wird erst nach der bestandenen Stichprobe entfernt und der Container einmal
  neu gestartet. Das ist die einzige Massnahme, die den Verlust **strukturell** ausschliesst statt ihn
  zu bewetten.
* **Der Cutoff wird bei jedem Lauf neu gerechnet**, nie beim Registrieren gemerkt — ein Prozess laeuft
  wochenlang.
* **`.unref()`** auf dem Timer, damit ein Skript-Aufruf (`scripts/import/*.ts`) nicht am Timer haengt.

**Zusage an das Daten-Kapitel:** dieses Kapitel traegt **Registrierung, Verzoegerung, Abschalter und
Takt**; die **Purge-Abfrage selbst** (welche Zeilen, welche Tabelle, welches Feld, `returned_at IS NOT
NULL`) und die Uebernahme der 2-Monats-Regel (gesetzte Entscheidung 12, Betreiberantwort 4, betroffen
< 100 Leihen — **Schaetzung**, keine Zaehlung) gehoert dorthin. `starteRadioHintergrund()`
**importiert** die Purge-Funktion, sie definiert sie nicht.

**Zusage an Spec 2 (Standby):** die Analyse haelt fest, dass der Standby-Alt-Stack beim Start genau
die Quelle zerstoert, fuer die er steht (`docs/radio-portierung-analyse.md:823-834`). Die zwei Regeln
dort gelten unveraendert und stehen im Runbook: feldweise Nachpruefungen laufen per `sqlite3` gegen die
**Snapshot-Kopie**, nie gegen einen gebooteten Alt-Stack; muss die Alt-App doch laufen, wird
`HISTORY_RETENTION_MONTHS` vorher hochgesetzt.

### 7.3.6 Seed am Boot — die Regel, die dieses Kapitel dazu haelt

`shouldSeed()` ist `SUITE_SEED === "1" || NODE_ENV === "development"`
(`src/core/bootstrap.ts:108-110`), aufgerufen aus `src/instrumentation.ts:57`. **`SUITE_SEED=1` ist
der Generalproben-Schalter, nicht nur der Lokalschalter** — `src/core/bootstrap.ts:45` schreibt das
aus, `CLAUDE.md:180-188` ebenso.

**Regel fuer `radio`, verbindlich:** `radio` bekommt **keinen** Eintrag in `seedAllModules()`
(`src/core/bootstrap.ts:128-132`) — wie `files`, `lagerbuch` und `aufgaben`, mit einer eigenen
Begruendung: **ein geseedeter Zugangscode waere in der Generalprobe ein gueltiger anonymer Zugang zum
gesamten Geraetebestand samt Ausleihernamen** (Analyse-Falle 31,
`docs/radio-portierung-analyse.md:1740-1749`). Der Kommentar dazu gehoert in die
`MODULE_MIGRATIONS`-Liste, neben die drei bestehenden Ausnahmen.

`src/app/m/radio/_lib/seedLokal.ts` **muss** es trotzdem geben — `scripts/seed-lokal.test.ts` verlangt
fuer jeden `MODULE_MIGRATIONS`-Eintrag einen Seed (`CLAUDE.md:183-188`). **Zusage an das
Zugangs-Kapitel:** dieser Seed legt Geraete und Stammdaten an und **niemals eine einloesbare
Zugangszeile**; die Code-Tabelle bleibt beim Seed **leer**. Wer lokal einen Code braucht, stellt ihn
ueber die Verwaltungsflaeche aus — das ist derselbe Weg wie in Produktion und deshalb der bessere Test.

### 7.3.7 Tests

| Datei | Testname | Prueft |
| --- | --- | --- |
| `src/app/m/radio/_lib/boot.test.ts` | `"ohne SUITE_HOST_RADIO meldet radioBootFehler nichts"` | Env ohne die Variable, auch ohne `SUITE_ADMIN_GROUP_RADIO` → `[]` |
| " | `"fehlende Admin-Gruppe ist ein Startabbruch"` | `SUITE_HOST_RADIO` gesetzt, `SUITE_ADMIN_GROUP_RADIO` fehlt → genau eine Meldung, die den Variablennamen enthaelt |
| " | `"leere Admin-Gruppe ist derselbe Startabbruch"` | `SUITE_ADMIN_GROUP_RADIO=" , "` → Meldung. **Eigener Fall**, weil `validateGroupConfig` diesen Zustand bewusst nicht meldet |
| " | `"eine gesetzte Zugangsgruppe ist ein Startabbruch"` | `SUITE_ACCESS_GROUP_RADIO=""` **und** `=irgendwas` → je eine Meldung; beide Faelle, weil `!== undefined` und nicht „leer" geprueft wird |
| " | `"RADIO_HISTORIE_MONATE=0 wird abgewiesen"` | eigener Fall, nicht in einer Tabelle mit `-1` und `abc` versteckt — `0` ist der Wert, den jemand fuer „aus" haelt |
| " | `"RADIO_ZUGANG_SITZUNG_SECRET gleich AUTH_SECRET ist ein Startabbruch"` | beide auf denselben 40-Zeichen-Wert → Meldung, die **beide** Namen nennt |
| " | `"radioBootFehler wirft nie"` | Env mit **allen** Fehlern gleichzeitig → die Funktion laeuft durch und liefert eine Liste mit mehr als einem Eintrag; `await expect(...).resolves` statt `rejects` |
| `src/core/bootstrap.test.ts` (Ergaenzung) | `"jeder Modul-Boot-Haken ist in assertHostConfig eingehaengt"` | **Quelltext-Scan** ueber `src/app/m/*/_lib/boot.ts`: fuer jede gefundene exportierte `*BootFehler`-Funktion muss ihr Name in `src/core/bootstrap.ts` vorkommen. **Das ist das fehlende Netz aus §7.3.1** — und es faengt nicht nur `radio`, sondern jedes kuenftige Modul |
| " | `"jeder Hintergrundstarter ist in startBackgroundWork eingehaengt"` | dasselbe fuer `starte*Hintergrund`/`starte*Arbeiter` |

Die letzten zwei Zeilen sind **Zusage an das Test-Kapitel** und gehoeren in `bootstrap.test.ts`, nicht
in eine radio-eigene Datei: eine radio-eigene Pruefung, dass radio eingehaengt ist, waere ein Test,
den das naechste Modul wieder nicht hat.

---

## 7.4 Konfiguration

### 7.4.1 Die Variablen

| Variable | Pflicht | Vorbelegung | Wirkung |
| --- | --- | --- | --- |
| `SUITE_HOST_RADIO` | **zum Cutover ja** | keine (`prodHosts: []`) | Setzt die Prod-Domain: `radio.iuk-ue.de`. Schaltet zugleich alle Boot-Pruefungen aus §7.3.3 und den Hintergrundarbeiter §7.3.5 ein |
| `SUITE_ADMIN_GROUP_RADIO` | **ja, nicht leer** | Registry-Vorgabe (Entwicklung) | Wer `/admin` bedienen darf. Leer = **stumme Aussperrung aller**, weil `radio` den Suite-Admin-Kurzschluss modulintern ignoriert (gesetzte Entscheidung 9) |
| `SUITE_ACCESS_GROUP_RADIO` | **darf nicht gesetzt sein** | — | Waere still wirkungslos (`requiresAuth: false`). Gesetzt = Startabbruch, §7.3.3 Nr. 2 |
| `RADIO_ZUGANG_SITZUNG_SECRET` | **ja**, ≥ 32 Zeichen | keine | Signiert die zeitlich begrenzte Sitzung, die ein eingeloester Code praegt. **Nicht** gleich `AUTH_SECRET` |
| `RADIO_ZUGANG_SITZUNG_STUNDEN` | nein | **12** ⚠️ zu bestaetigen | Lebensdauer dieser Sitzung |
| `RADIO_HISTORIE_MONATE` | nein | **2** | Retention der abgeschlossenen Leihen (Betreiberantwort 4). `0` ist verboten, §7.3.3 Nr. 4 |
| `RADIO_HISTORIE_PURGE` | nein | **1** | `0` schaltet den Purge-Timer ab. Im Cutover-Fenster auf `0`, §7.3.5 |
| `RADIO_HISTORIE_ERSTLAUF_MINUTEN` | nein | **60** | Verzoegerung des ersten Purge-Laufs. Nie `0` |
| `SUITE_TRAEFIK_RULE` | **ja, erweitern** | `Host(\`iuk-ue.de\`)` | Um `Host(\`radio.iuk-ue.de\`)` erweitern — **ohne** `radio-admin.iuk-ue.de`, §7.4.3 |

**Was ausdruecklich nicht entsteht:** kein `RADIO_ADMIN_API_TOKEN` und kein `RADIO_ADMIN_API_URL`.
`api_tokens` traegt produktiv genau einen Konsumenten, den Alt-Kiosk (Betreiberantwort 3, gesetzte
Entscheidung 13), und der verschwindet mit dem Port; die HTTP-Grenze zwischen Kiosk und Verwaltung
faellt im selben Fenster (gesetzte Entscheidung 15). Eine Variable dafuer waere ein Angebot an einen
Konsumenten, den es nicht gibt. Ebenso **kein** `POCKET_ID_*` fuer `radio`: `/admin` laeuft ueber
Auth.js v5 gegen den **einen** Suite-Client, und `AdminUser` aus radio-inventar wandert nicht
(gesetzte Entscheidung 14).

Ebenfalls nicht hier: `TZ=Europe/Berlin`. Es ist ein **eigener Suite-Posten** (nicht Teil dieser
Spec), betrifft aber `radio` unmittelbar — der CSV-Export der Alt-App formatiert Datumswerte
(`radio-admin/server/src/routes/export.ts:49-51`), und ohne gesetzte Zeitzone ist die Tagesgrenze im
Container UTC. **Zusage an Spec 2:** das Runbook nennt `TZ` als Voraussetzung des Cutovers, ohne sie
in dieser Spec zu setzen.

### 7.4.2 `.env.example`

`SUITE_HOST_RADIO` steht **bereits** als kommentierte Zeile in der Datei (`.env.example:112`, im Block
„Prod-Domains der Module") — sie wird dort **nicht verschoben**, sondern nur mit der echten Domain
gefuellt, wenn der Cutover kommt. Der Block „Modul lagerbuch" macht genau das vor
(`.env.example:231-239`) und schreibt aus, warum die Host-Zeile oben und nicht im Modulblock steht.

Neu entsteht ein Block **„── Modul radio ──"** nach dem lagerbuch-Block (also vor
`# ─── Modul aufgaben ───`, heute `.env.example:309`). Inhalt, verbindlich:

* Ein Verweis nach oben auf `SUITE_HOST_RADIO` (`:112`), mit dem Satz, dass sie **zum Cutover Pflicht**
  ist, auch wenn der Host-Riegel sie nicht braucht (er trifft `radio.localtest.me` ohne jede Env) —
  weil die Boot-Pruefungen aus §7.3.3 an `prodHostsFor(...).length > 0` haengen und der
  Login-Rueckweg ohne sie den **angefragten** statt des kanonischen Hosts nimmt.
* `SUITE_ADMIN_GROUP_RADIO=<Wert aus der alten stack.env>` — **ohne** Vorbelegung im Beispiel, mit dem
  Hinweis, dass leer eine stumme Aussperrung ist.
* Ein ⚠️-Absatz: **`SUITE_ACCESS_GROUP_RADIO` darf nicht gesetzt werden** (Boot-Abbruch, Grund in
  einem Satz).
* `# RADIO_ZUGANG_SITZUNG_SECRET=<neu erzeugen, openssl rand -base64 32>` — **auskommentiert und ohne
  Wert.** Ein aus der Vorlage mitgeschleppter Wert waere ein oeffentlich nachlesbares Geheimnis; bei
  lagerbuch steht die Begruendung woertlich (`.env.example:250-258`). **Anders als bei lagerbuch gibt
  es hier keinen Alt-Wert zu uebernehmen** — der Alt-Kiosk kannte keine solche Sitzung, sein
  Zugangsmittel war der geteilte API-Token im QR-Parameter
  (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`).
* Die vier `RADIO_*`-Zahlen **ausgeschrieben mit ihren Vorbelegungen**, wie es der lagerbuch-Block
  fuer seine sechs Zahlen tut (`.env.example:261-274`, dort woertlich: „Sie stehen ausgeschrieben da,
  weil ein Betreiber sie sonst nur im Quelltext findet").
* Ein Absatz zu `RADIO_HISTORIE_PURGE=0` als **Cutover-Schalter** mit dem Satz, wann er wieder
  entfernt wird.
* Ein Dev/E2E-Unterblock nach dem Muster `.env.example:276-290`: `# SUITE_HOST_RADIO=radio.localtest.me`
  (woertlich dieser Host — `moduleForHost` prueft `${key}.localtest.me`, damit lokal derselbe Code-Pfad
  laeuft) und ein **Wegwerf**-Geheimnis mit dem Hinweis, dass es in diesem Repository steht und damit
  oeffentlich ist.
* Der Redirect-Block fuer den Alt-Host als **kommentierte Traefik-Labels** neben der
  `SUITE_TRAEFIK_RULE`-Zeile (`.env.example:369`) — siehe §7.4.3.

### 7.4.3 Traefik: eine Zeile erweitern, eine Zeile **nicht**

`compose.yaml:153` definiert **einen** Router:
``traefik.http.routers.iuk-suite.rule=${SUITE_TRAEFIK_RULE:-Host(`iuk-ue.de`)}``, und der Kommentar
`:149-152` sagt, dass diese Regel **dieselben** Hosts fuehren muss wie die `SUITE_HOST_*`-Variablen —
sonst erreicht die Domain den Container gar nicht erst.

**Erweitern:** `SUITE_TRAEFIK_RULE=Host(\`iuk-ue.de\`) || … || Host(\`radio.iuk-ue.de\`)`.

⚠️ **`radio-admin.iuk-ue.de` darf dort ausdruecklich NICHT stehen.** Wer den Alt-Host mit aufnimmt,
bekommt **nicht** den Redirect, sondern den stillen Portal-Fallback: der Host erreicht den Container,
kein `SUITE_HOST_*` beansprucht ihn, `moduleForHost` liefert **portal** — `radio-admin.iuk-ue.de`
zeigt dann das Portal (Analyse-Falle 28, `docs/radio-portierung-analyse.md:1646-1652`). Genau diesen
Fall meldet die Boot-Warnung aus §7.3.4.

Der pfaderhaltende Redirect (gesetzte Entscheidung 2) braucht einen **zweiten, eigenen Router** mit
eigener `redirectregex`-Middleware auf denselben Service — Middleware haengt am **Router**, nicht am
Service, nur so trifft der Redirect nicht auch die Suite —, **302 statt 301** (ein 301 liegt im Cache
jedes Geraets und macht den Rueckweg praktisch unmoeglich), in compose mit doppeltem `$$` gegen die
Interpolation (`docs/radio-portierung-analyse.md:1654-1657`). ⚠️ **Es gibt im Repo kein erprobtes
Vorbild** — `grep -rn redirectregex compose.yaml docs/` bleibt leer (`:1659-1661`). **Zusage an
Spec 2:** die Label-Zeilen gehoeren als **Runbook-Zeile** und als kommentierter Block in
`.env.example` neben `SUITE_TRAEFIK_RULE`; sie leben auf dem Server, nicht im Repo (gesetzte
Entscheidung 2). ⚠️ **Der DNS-Eintrag `radio-admin.iuk-ue.de` muss bleiben, solange der Redirect
steht** — er ist die Abhaengigkeit des Redirects, kein Abbau-Posten (`:1669-1670`).

### 7.4.4 Was den Boot abbricht — und die drei stillen Faelle

`validateHostConfig` (`src/core/hosts.ts:65-99`) bricht den Boot bei **genau drei** Dingen ab: ein
`SUITE_HOST_*`, dessen Suffix zu keinem Modul-Key passt (`:69-76`), ein Wert mit `/` oder `:`
(`:81-85`), ein Host, den **zwei per Env gesetzte** Module beanspruchen (`:87-93`).
`validateGroupConfig` tut dasselbe fuer `SUITE_ADMIN_GROUP_*`/`SUITE_ACCESS_GROUP_*`
(`src/core/groups.ts:141-155`), und beide Listen laufen in denselben Wurf (`src/core/bootstrap.ts:84-94`).

⚠️ **Daraus folgt eine Reihenfolge, und sie ist der einzige Startabbruch, den ein Cutover selbst
ausloesen kann: erst der Registry-Eintrag, dann die `.env`.** Solange `key: "radio"` in
`src/core/registry.ts` fehlt, passt das Suffix `RADIO` zu keinem Modul-Key — `SUITE_HOST_RADIO` **oder**
`SUITE_ADMIN_GROUP_RADIO` in der `.env` eines Images ohne den Eintrag bricht den Start der **ganzen
Suite** ab, mit einer allerdings selbsterklaerenden Meldung („passt zu keinem Modul. Bekannt: …").
Analyse-Falle 23 (`docs/radio-portierung-analyse.md:1555-1556`) schreibt dieselbe Reihenfolge aus.
**Zusage an Spec 2:** die `.env`-Zeilen werden erst gesetzt, **nachdem** das Image mit dem
Registry-Eintrag laeuft — nachweisbar ueber die Vor-Cutover-Pruefung aus §7.2.4 (dort 200 statt 503).

**Alles andere faellt still** — und zwar in drei Ausprägungen, jede mit ihrem eigenen Handgriff.
Alle drei sind **Zusage an Spec 2**, weil keine davon von einem Test oder vom Boot gefunden werden
kann:

1. **Richtig geschriebener, falscher Hostname.** `SUITE_HOST_RADIO=falsch.example.com` ist von einem
   Tippfehler nicht zu unterscheiden; `moduleForHost` faellt auf **portal** zurueck, und
   `radio.iuk-ue.de` zeigt stillschweigend das Portal (`src/core/hosts.ts:52-57`, woertlich).
   ⚠️ **Fuer `radio` schaerfer als sonst:** unter derselben Domain liegen zwei Zugangswelten, und ein
   Portal-Fallback ueberdeckt die **Ausleihe** — die anonyme Flaeche, die kein Anmeldefenster zeigt,
   an dem jemand den Fehler bemerkt.
   **Handgriff:** `curl -s https://radio.iuk-ue.de/api/health/radio` muss `"module":"radio"` und HTTP
   200 liefern, **und** ein `curl -sI https://radio.iuk-ue.de/` darf keine Portal-Seite ergeben.
   Zusaetzlich `curl -s https://radio.iuk-ue.de/sw.js | head -3` — kommt dort **nicht** der
   Abraeum-Worker, greift der Rewrite nicht (§7.1.4).
2. **Der Login-Rueckweg, den kein `curl` sieht.** Die Allowlist in `src/core/auth/redirect.ts`
   erkennt einen Modul-Host ueber genau diese Variable; fehlt sie, wirft Auth.js den Nutzer nach dem
   Login **aufs Portal**, ohne Fehler und ohne Meldung — „ein curl sieht davon nichts"
   (`src/core/hosts.ts:59-63`, woertlich). Betrifft `radio` nur ueber `/admin`, aber genau die
   Personen, die den Cutover verantworten.
   **Handgriff:** **einmal von `radio.iuk-ue.de/admin` aus anmelden** und pruefen, dass man dort
   wieder landet. Handarbeit, nicht automatisierbar.
3. **Die Kollision, die `validateHostConfig` strukturell nicht sehen kann.** Die Kollisions-Map wird
   ausschliesslich aus `envHostsFor` gefuellt (`src/core/hosts.ts:78-95`) — ein Host, den ein anderes
   Modul per Registry-`prodHosts` im **Code-Default** fuehrt, erreicht sie **nie** und kollidiert
   ohne jede Meldung (`docs/radio-portierung-analyse.md:798-804`). `moduleForHost` entscheidet dann
   nach **Registry-Reihenfolge**, nicht nach Env.
   **Handgriff:** vor dem Cutover einmal `grep -n 'prodHosts' src/core/registry.ts` und die
   Code-Defaults gegen die gesetzten `SUITE_HOST_*` von Hand vergleichen. Betrieblich sofort relevant,
   weil `radio-admin.iuk-ue.de` uebergangsweise weiterlebt.

**Rollback ist die leere Zeile, nicht die geloeschte:** `SUITE_HOST_RADIO=` ergibt `[]` (bewusst keine
Prod-Hosts), das **Entfernen** der Variable ergibt `null` und damit den Code-Default aus der Registry
(`src/core/hosts.ts:33-46`, `:39-46`). Mit `prodHosts: []` (gesetzter Zuschnitt 1) ist der Unterschied
heute wirkungsgleich — aber nur heute, und die leere Zeile ist die Form, die sagt, was gemeint ist.
⚠️ **Der Rueckweg ist ausschliesslich „Router zurueck"** (gesetzte Entscheidung 3): es gibt kein
Parallelfenster, weil Alt-Kiosk und Suite denselben Host nicht gleichzeitig halten koennen.

### 7.4.5 Das Dreieck

`radio` fuehrt eine eigene Datenbank und braucht deshalb **drei** zusammenpassende Eintraege
(`CLAUDE.md:127-131`), sonst laeuft es lokal und bricht im Container:

1. `src/app/m/radio/_db/migrations`
2. `{ key: "radio", migrationsFolder: "src/app/m/radio/_db/migrations" }` in `MODULE_MIGRATIONS`
   (`src/core/bootstrap.ts:20-49`) — **mit** dem Seed-Ausnahmekommentar aus §7.3.6
3. Eine **eigene `COPY`-Zeile** im `Dockerfile` neben `:51-56`:
   `COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/radio/_db/migrations ./src/app/m/radio/_db/migrations`
   — es gibt **kein** Sammel-`COPY`, das ein neues Modul automatisch mitnimmt (gemessen:
   `Dockerfile:51-58` fuehrt je Modul eine Zeile plus eine fuer `core/konto`)

`src/core/bootstrap.test.ts` prueft dieses Dreieck ueber beide Listen (`CLAUDE.md:133-137`) — es ist
damit der **einzige** Teil der Modul-Anmeldung mit einem Netz. **Zusage an das Daten-Kapitel:** der
Migrationsordner und sein Inhalt gehoeren dorthin; dieses Kapitel sagt Punkt 2 und 3 zu und traegt
den Kommentar, der die Seed-Ausnahme begruendet.

---

## 7.5 Backup: `scripts/backup.sh` reicht — geprueft, nicht angenommen

**`radio.db` faellt ohne jede Skriptaenderung ins Backup.** `scripts/backup.sh:25-27` sammelt
`dbs=("$DATA_DIR"/*.db)` per `nullglob`, `:41-43` sichert jede gefundene Datei per
`sqlite3 "$db" ".backup ..."`. Mit der gesetzten Ein-Datei-Regel (`radio.db` unter `DATA_DIR`) ist das
vollstaendig. Der harte Abbruch bei „keine `*.db` gefunden" (`:29-35`, Meldung „no *.db in $DATA_DIR —
aborting (misconfigured DATA_DIR?)") gilt fuer `radio` mit.

**Gibt es Blobs? Nein — nachgesehen, in beiden Alt-Apps:**

| Gepruefte Stelle | Befund |
| --- | --- |
| CSV-**Export** der Verwaltung | Baut den Text im Speicher (`radio-admin/server/src/routes/export.ts:56-62`, `buildExportCsv` liefert einen String) und liefert ihn als Antwort mit `Content-Disposition: attachment` (`:74`). **Keine Datei auf Platte** |
| CSV-**Import** | `Buffer.from(await file.arrayBuffer())` (`radio-admin/server/src/routes/import.ts:23`) — im Speicher, kein Temp-Pfad. Gesucht wurde in `radio-admin/server/src`, `radio-admin/client/src`, `radio-inventar/apps/backend/src` und `radio-inventar/apps/frontend/src` nach `writeFileSync`, `createWriteStream`, `fs.promises.writeFile`, `multer`, `diskStorage`, `FileInterceptor`, `formidable`, `busboy`, `tmpdir`, `mkdtemp`, `multipart`. **Treffer: zwei, beide harmlos** — ein Kommentar (`import.ts:14`) und ein Testhelfer (`radio-admin/server/src/db/smoke.test.ts:18`, `mkdtempSync` fuer eine Wegwerf-DB) |
| Anhaenge, Bilder | Keine. Weder in `radio-admin` noch im Kiosk gibt es einen Upload-Pfad ausser dem CSV-Import; die einzigen Bilddateien sind die **statischen** PWA-Icons des Kiosks (`radio-inventar/apps/frontend/public/icons/`, drei SVG), und die wandern nach §7.1.1 nicht mit |
| Volumes der Alt-Apps | `radio-admin/docker-compose.yml:13-14` `radio-data:/data` mit `DATABASE_PATH=/data/data.sqlite` (`:11`) — nur die SQLite-Datei. `radio-inventar/docker-compose.yml:11-12` `postgres_data:/var/lib/postgresql/data` |

**Es entsteht also kein `BLOB_DIR`-Aequivalent und keine Aenderung an `scripts/backup.sh`.** Der
files-spezifische Zaehl-Riegel (`:69-99`) haengt an `-f "$work/files.db"` und beruehrt `radio` nicht.

⚠️ **Zwei Saetze, die trotzdem ins Runbook gehoeren:**

* **Der Kiosk-Postgres faellt aus jeder Sicherung heraus, die dieses Repo kennt.** Das Skript kennt
  `*.db` und `BLOB_DIR` (`:15-21`); solange der Alt-Kiosk laeuft, haengt `postgres_data` an **keiner**
  Sicherung der Suite (`docs/radio-portierung-analyse.md:810-812`). Ein letztes `pg_dump` in die
  Archivablage ist Abbau-Voraussetzung — auch weil erst eine Zaehlung dort die Frage nach `AdminUser`
  endgueltig belegt (Betreiberantwort 7, gesetzte Entscheidung 14), und **ein geloeschtes Volume nimmt
  die Antwort mit** (`:814-816`).
* **`BACKUP_KEEP` bleibt unveraendert.** `radio.db` ist eine kleine SQLite-Datei; sie multipliziert die
  Ablage nicht wie die files-Blobs (`scripts/backup.sh:10-13`). Kein Grund, an der Rotation zu drehen.

**Zusage an Spec 2:** nach dem Import laeuft `scripts/backup.sh` **einmal von Hand**, und das Tarball
wird auf die Anwesenheit von `radio.db` geprueft (`tar -tzf … | grep radio.db`). Der Glob ist bewiesen
erst, wenn er einmal gelaufen ist.

---

## 7.6 Zu bestaetigen (nur der Betreiber weiss es)

1. **Sitzungsdauer nach dem Einloesen eines Codes.** Vorschlag **12 Stunden**, woertlich wie lagerbuch
   (`.env.example:265`, `LAGERBUCH_HELFER_SITZUNG_STUNDEN=12`). Der Nutzungsfall ist anders — ein
   Telefon, das einen QR-Code scannt und nach einer Ausleihe fertig ist —, was auch fuer **deutlich
   kuerzer** sprechen koennte. Umsetzung ist eine Zahl in der `.env`
   (`RADIO_ZUGANG_SITZUNG_STUNDEN`), also billig zu aendern; die Vorbelegung 12 gilt, bis der Betreiber
   widerspricht.
2. **Sind gedruckte Aufsteller mit QR-Codes im Umlauf, und wo?** Entscheidet nichts am Code, aber
   alles am Cutover-Abend: ein dauerhafter, sperrbarer Code loest jedes gedruckte Kaertchen ein — ein
   Code, der auf einem Aufsteller im Funkraum klebt und den heutigen Token traegt, hoert mit dem Port
   auf zu funktionieren (der heutige QR-Code traegt den geteilten API-Token base64-kodiert als
   URL-Parameter, `radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`).
   **Gebraucht wird:** Anzahl, Ort, und wer sie ersetzen kann. Ohne diese Antwort ist die
   Ankuendigungspflicht aus der gesetzten Entscheidung 8 nicht adressierbar.
3. **Vorausgefuellter Benutzername fuer angemeldete Ausleihen** (Betreiberantwort 6: „koennte …,
   optional"). Ja oder nein entscheidet der Betreiber. Betriebliche Folge, die in die Entscheidung
   gehoert: **ja** heisst, dass eine anonyme Ausleihe und eine angemeldete Ausleihe im Journal
   unterschiedlich aussehen, und dass der Suite-Name in eine Zeile geraet, deren Fach-Semantik
   „anonym" ist. Fuer dieses Kapitel folgt daraus **nichts** — es entsteht keine Variable dafuer, weil
   es keine Betriebsentscheidung, sondern eine Fach-Entscheidung ist. **Zusage an das Ausleih-Kapitel:**
   wenn dort ein Schalter gewuenscht ist, kommt er als `RADIO_*`-Variable in §7.4.1 und bekommt eine
   Boot-Zahl/Bool-Pruefung nach §7.3.3.
4. **Offline schreiben** — Betreiberfrage 8, unveraendert offen. §7.1.6 sagt, was heute gilt und was
   ein „Ja" kosten wuerde. **Hier nicht entschieden.**

---

## 7.7 Zusagen an andere Kapitel — gesammelt

Die Kapitelnummern setzt die Zusammenfuehrung ein; die Sache ist eindeutig benannt.

| An | Zusage |
| --- | --- |
| **Zugangs-Kapitel** (Host-Riegel, Codes, Sitzung) | Dieses Kapitel legt `_lib/host.ts` **nicht** an, sondern ruft `hostAbweisung` aus `_lib/hostRiegel.ts` (§7.1.3). Es setzt die Variablennamen `RADIO_ZUGANG_SITZUNG_SECRET` und `RADIO_ZUGANG_SITZUNG_STUNDEN` (§7.4.1) und prueft sie beim Boot (§7.3.3 Nr. 3, 5). ⚠️ **Der Name ist hier gesetzt, nicht das Verfahren:** waehlt das Zugangs-Kapitel ein anderes Signaturverfahren, wandert die Pruefung auf **dessen** Variable und behaelt die Form (vorhanden, ≥ 32 Zeichen, nicht gleich `AUTH_SECRET`). Was **nicht** verhandelbar ist: es gibt eine solche Pflichtvariable und sie wird beim Boot geprueft — eine werfende Pruefung auf einen Namen, den niemand setzt, waere ein Startabbruch am Cutover-Abend. Weitere `RADIO_GATE_*`-Zahlen werden vom Helfer `zahlFehler` geprueft und in `.env.example` geschrieben. `seedLokal` legt **keine** einloesbare Zugangszeile an (§7.3.6). Die Ankuendigung der Verhaltensaenderung braucht den Satz aus §7.1.3 („eine veraltete Seitenansicht je Geraet") |
| **Daten-Kapitel** (Schema, Retention-Abfrage) | Dieses Kapitel traegt Registrierung, 60-Minuten-Verzoegerung, Abschalter und Takt des Retention-Arbeiters; die **Purge-Abfrage** und die 2-Monats-Regel gehoeren dorthin (§7.3.5). Migrationsordner: dieses Kapitel sagt `MODULE_MIGRATIONS`-Eintrag und `COPY`-Zeile zu (§7.4.5) |
| **Import-Kapitel** | Die Freigabe nach dem Import laeuft ueber die Zaehl-Abfragen aus Pflicht 4, **nicht** ueber `/api/health/radio` (§7.2.3). Der Mapping-Unit-Test mit je Feld **unterschiedlichen** Fixture-Werten (gesetzte Entscheidung 11) ist dort zu fuehren; §7.3.5 begruendet, warum `RADIO_HISTORIE_PURGE=0` im Cutover-Fenster die zweite Halbe der Absicherung ist |
| **Ausleih-Kapitel** | Dieses Kapitel baut **kein** Offline-Verhalten und keinen Ersatz fuer `STALE_GRACE_MS` (§7.1.6). Wenn ein Schalter fuer den vorausgefuellten Namen gewuenscht ist, kommt er als `RADIO_*`-Variable hierher (§7.6 Nr. 3) |
| **Verwaltungs-Kapitel** | `/admin` erbt mit `requiresAuth: false` **kein** Middleware-Gating (gesetzte Entscheidung 10). Dieses Kapitel liefert nur den Boot-Riegel gegen die **leere** Admin-Gruppe (§7.3.3 Nr. 1) — er ersetzt keine einzige Pruefung in einer Seite, Action oder Route |
| **Test-Kapitel** | Zwei Ergaenzungen in `src/core/bootstrap.test.ts` (Boot-Haken und Hintergrundstarter sind eingehaengt, §7.3.7) und genau ein e2e-Fall fuer `/sw.js`, der die **Antwort** prueft (§7.1.7) |
| **Spec 2 (Runbook)** | Redirect-Labels fuer `radio-admin.iuk-ue.de` (302, `redirectregex`, eigener Router, `$$`, DNS bleibt) · `SUITE_TRAEFIK_RULE` erweitern, Alt-Host **nicht** aufnehmen · `RADIO_HISTORIE_PURGE=0` im Fenster, danach entfernen und neu starten · Monitor auf `/api/health/radio` · Vor-Cutover-`curl` auf `/api/health/radio` gegen den laufenden Container (503 = falsches Image) · die drei stillen Faelle aus §7.4.4 als drei getrennte Schritte · `docker compose logs --since 2m suite` ohne `radio:`-Warnung · `scripts/backup.sh` einmal von Hand plus `tar -tzf | grep radio.db` · letztes `pg_dump` des Kiosk-Postgres vor dem Abbau · nach dem Umschwenk ein Telefon, das den Alt-Kiosk kannte, einmal neu laden · `TZ=Europe/Berlin` als Voraussetzung |
