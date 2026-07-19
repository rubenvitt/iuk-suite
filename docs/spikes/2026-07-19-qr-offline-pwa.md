# Spike: domain-scoped Offline-PWA im Monolithen (Phase 2, Modul `qr`)

**Datum:** 2026-07-19 · **Ergebnis: trägt.** · Träger: Wegwerf-Modul `beta`, stellvertretend für `qr`.

## Frage

Das Modul `qr` soll offline-fähig sein (QR-Erzeugung im Einsatz, ohne Netz) — die alte
App `easy-qr` ist eine PWA mit eigenem Manifest und Service Worker. In der Suite liegen
aber *alle* Module auf **einem** Next-Server; die Trennung entsteht erst durch den
Host-Rewrite in `proxy.ts`. Frage also: lässt sich eine PWA so einbauen, dass sie **nur**
auf der QR-Domain existiert und die anderen Domains — allen voran das produktive Portal
auf dem Apex — unberührt bleiben?

## Antwort

Ja, und ohne zusätzliche Abhängigkeit (kein Serwist/next-pwa). Der Trick ist, **Manifest,
Icon und Service Worker als Route Handler unter das Modul zu legen** statt in `app/` oder
`public/`:

| Datei | extern (Browser sieht) | intern (nach Rewrite) |
|---|---|---|
| `src/app/m/beta/manifest.webmanifest/route.ts` | `beta.<domain>/manifest.webmanifest` | `/m/beta/manifest.webmanifest` |
| `src/app/m/beta/sw.js/route.ts` | `beta.<domain>/sw.js` | `/m/beta/sw.js` |
| `src/app/m/beta/pwa-icon.svg/route.ts` | `beta.<domain>/pwa-icon.svg` | `/m/beta/pwa-icon.svg` |

Damit fällt der Scope automatisch richtig:

- Der Browser sieht die Assets auf **Root-Pfaden des Modul-Hosts** — `start_url` und
  `scope` sind schlicht `/`, der SW liegt auf `/sw.js` und darf ohne
  `Service-Worker-Allowed`-Header den ganzen Origin kontrollieren.
- Auf jedem anderen Host rewritet derselbe Pfad in *dessen* Modul (`/m/portal/sw.js`)
  und läuft dort ins Leere.
- `<link rel="manifest">` kommt aus `metadata` im **Modul-Layout**, die SW-Registrierung
  aus einer Client-Komponente im selben Layout. Andere Module rendern dieses Layout nie.

`public/` wäre der falsche Ort: statische Dateien werden auf allen Hosts ausgeliefert.

Weil jedes Modul ohnehin eine eigene Subdomain hat, ist die Origin-Trennung der Service
Worker zusätzlich vom Browser garantiert — ein SW auf `qr.<domain>` kann Requests auf dem
Apex gar nicht sehen. Der Aufwand oben dient dem, was der Browser *nicht* erzwingt:
dass die anderen Hosts das Manifest/den SW erst gar nicht angeboten bekommen.

## Verifiziert

`e2e/pwa-spike.spec.ts`, 4 Tests, alle grün (`pnpm e2e:pwa`):

1. Modul-Host liefert Manifest (200, `application/manifest+json`, `scope: "/"`), Icon und SW.
2. Service Worker registriert sich, Scope ist der Modul-Origin.
3. Offline: Seite lädt aus dem SW-Cache **und hydriert** — eine rein clientseitige
   Interaktion (Platzhalter für die QR-Erzeugung) funktioniert ohne Netz.
4. **Der eigentliche Punkt:** der Portal-Host liefert kein Manifest, kein JS unter
   `/sw.js`, hat keinen `link[rel=manifest]` im HTML und keine SW-Registrierung.

## Zwei Fallstricke, die den Spike zuerst rot gemacht haben

**1. Playwrights Standard-Browser kann keine Service Worker auf `*.localtest.me`.**
Service Worker brauchen einen sicheren Kontext; `http://beta.localtest.me` ist keiner
(nur `localhost`/`127.0.0.1` sind es). Gemessen:

| Setup | `isSecureContext` | `navigator.serviceWorker` |
|---|---|---|
| Playwright-Default (chromium headless shell) + `--unsafely-treat-insecure-origin-as-secure` | `false` | fehlt |
| `channel: "chromium"` (voller Chromium) + gleiches Flag | `true` | da |
| `*.localhost` ohne Flag | `true` | da |

Der Headless-Shell **ignoriert das Flag stillschweigend**. Deshalb läuft der Spike in
einer eigenen `playwright.pwa.config.ts` mit `channel: "chromium"` — das Flag soll nicht
in der normalen E2E-Suite hängen, wo es echte Browser-Sicherheitszusagen abschaltet.
(Alternative wäre gewesen, Dev-Hosts auf `*.localhost` umzustellen; das hätte
`moduleForHost` in `core/registry.ts` für Testzwecke aufgebohrt — verworfen.)
In Prod hinter TLS stellt sich die Frage nicht.

**2. Offline funktioniert unter `next dev` nicht — nur der Prod-Build beweist etwas.**
Der erste Offline-Test war grün, solange er nur „rendert die Seite?" prüfte. Sobald er
zusätzlich prüft, ob die Seite **interaktiv** ist, fällt er unter `next dev` um: die
Chunk-URLs variieren pro Request, der SW-Cache greift nicht, die Hydration bleibt aus —
sichtbar war nur noch das SSR-Standbild. Unter `next build && next start` (stabil
gehashte Assets) ist er grün. Der Spike fährt deshalb bewusst gegen den Prod-Build,
anders als die Haupt-E2E-Suite.

> **Übertragbar:** „Seite lädt offline" ist als Zusage wertlos. Der Offline-Test eines
> jeden künftigen Moduls muss eine clientseitige Interaktion ausführen.

## Offen / bewusst nicht gemacht

- **Kein Precaching.** Der SW cached zur Laufzeit (network-first für Navigationen,
  cache-first für Assets). Für `qr` heißt das: der erste Besuch muss online passieren,
  danach trägt es. Ein echtes Precache-Manifest (Serwist o. ä.) wäre ein eigener Schritt —
  entscheiden, wenn der Anspruch „ab Werk offline, ohne Erstbesuch" tatsächlich gilt.
- **Kein Update-Flow.** `skipWaiting` + `clients.claim()` ziehen die neue Version beim
  nächsten Load durch. Kein Hinweis an die Nutzenden, kein Versionswechsel im laufenden Tab.
- **Kein CI-Lauf.** `pnpm e2e:pwa` braucht den vollen Chromium (`playwright install
  chromium`) und einen Prod-Build. Bewusst lokal gelassen, bis das Muster im echten
  `qr`-Modul steckt — dann gehört es in die CI-Matrix, nicht als Wegwerf-Modul-Test.
- **`next start` warnt** bei `output: standalone` („use node .next/standalone/server.js").
  Der Spike lief trotzdem korrekt gegen echte gehashte Assets; für die spätere
  CI-Einbindung ist der Standalone-Server der richtige Startbefehl.

## Was daraus für Modul `qr` folgt

1. Die drei Route Handler und die Layout-Einbindung 1:1 nach `src/app/m/qr/` übernehmen.
2. Den Test „anderer Host bleibt sauber" mitnehmen — er ist die eigentliche Zusage.
3. Offline-Test mit echter QR-Erzeugung statt Platzhalter, gegen den Prod-Build.
4. Der Spike-Code auf `beta` wird zurückgebaut, wenn `qr` steht (zusammen mit den
   übrigen Wegwerf-Modulen).
