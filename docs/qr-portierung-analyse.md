# Modul `qr` — Portierungsanalyse & offene Entscheidungen

**Stand 2026-07-19. Das ist noch keine Spec.** Es ist die Vorarbeit dafür: was `easy-qr`
heute tut, was der 1:1-Nachbau erzwingt, und die **neun Entscheidungen**, die vor der
Spec fallen müssen. Sie sind keine Details — jede einzelne verändert, was gebaut wird.

Quelle: vollständige Analyse von `easy-qr` (SvelteKit-SPA) und des Modul-Musters der
Suite. Ergänzt den grünen PWA-Spike (`docs/spikes/2026-07-19-qr-offline-pwa.md`).

---

## Was easy-qr heute ist

Eine **SPA** (`ssr = false` global), die QR-Codes **clientseitig** erzeugt (`qrcode@1.5.4`)
— deshalb funktioniert sie offline. Drei Zugriffsstufen:

| Stufe | Kann |
|---|---|
| **anonym** | Kompletter QR-Workflow: URL, WLAN, Telefon, vCard, Vollbild, Invertieren, PNG-Download, Teilen, lokaler Verlauf |
| **eingeloggt** | zusätzlich die Preset-Kacheln („Schnellzugriffe") |
| **Admin** | zusätzlich `/admin`: Presets anlegen/bearbeiten/sortieren/löschen |

QR-Optionen sind **hartkodiert** (Fehlerkorrektur `H`, Margin 4, Schwarz/Weiß, PNG-Export
1024×1024, Längenlimit 1273). Die einzige visuelle Option ist Invertieren per Long-Press.
Das ist kein Mangel, sondern Einsatz-Design: weniger Knöpfe, mehr Scan-Sicherheit.

**Datenmodell:** `presets` (Slug-PK, `kind`-CHECK, `value` als JSON-String, sort_order),
plus `users` und `sessions` aus dem eigenen Auth-Stack. Eigener Migrationsrunner, keine
Drizzle-Migrationen. Auth über `arctic` (PKCE) gegen Pocket ID, eigene Server-Sessions
(Cookie `drk_session`, HMAC-signiert, 7 Tage).

---

## Was beim Nachbau leicht wird

- **Keine SvelteKit Form Actions**, nirgends — alle Mutationen sind `fetch` auf JSON-APIs.
  Es gibt kein progressive-enhancement-Muster, für das ein Next-Äquivalent fehlt.
- **Nur zwei Server-Load-Funktionen** (User fürs Layout, Auth-Guard für `/admin`).
- Der PWA-Teil ist durch den Spike geklärt und übertragbar.
- Das E2E-Muster von easy-qr ist **besser als das der Suite** und sollte mitwandern: die
  Tests dekodieren den erzeugten QR-Code wirklich (`sharp` rastert das SVG, `jsqr` liest
  es zurück) statt nur zu prüfen, dass ein `<svg>` da ist.

## Was 1:1 bleiben muss (sonst brechen Nutzer)

| Artefakt | Wert | Bricht sonst |
|---|---|---|
| QR-URL-Vertrag | `/qr?data=…&label=…&kind=…` | geteilte/gebookmarkte Links |
| Preset-IDs | Slugs (PK **und** URL-Segment) | Datenbestand |
| localStorage-Key | `qr-generator:history:v1` | der lokale Verlauf jedes Nutzers |
| OIDC-Gruppen | `drk-qr-admin`, `drk-qr-user` | in Pocket ID gepflegt |

---

## Die neun Entscheidungen

### 1. Prod-Domain — **nicht im Repo auffindbar**
`easy-qr` hat keine Domain eingecheckt: Traefik-Label auskommentiert (`qr.example.org`),
`APP_ORIGIN`/`POCKET_ID_REDIRECT_URI` nur `localhost`, README generisch. Der einzige
Fund im ganzen Portfolio-Grep war `drop.iuk-ue.de` und `radio.iuk-ue.de`. **Die echte
QR-Domain steht auf dem Server (Traefik/`.env`), nicht im Code — sie muss von dort
kommen.** Ohne sie kein `prodHosts`-Eintrag, ohne den erscheint das Modul in Prod nicht
im App-Switcher (Post-Cutover-Befund 2).

### 2. Eigene Sessions ablösen — oder Sessions retten?
Die Suite hat Auth.js + Pocket ID mit Cookie auf `.iuk-ue.de`. `easy-qr` hat einen
komplett eigenen Stack (`arctic`, eigene `sessions`-Tabelle, Cookie `drk_session`).
**Empfehlung: den eigenen Stack ersatzlos streichen** — `users`/`sessions` wandern nicht
mit, nur `presets`. Preis: **alle bestehenden QR-Sessions werden beim Cutover ungültig**,
jeder muss sich einmal neu anmelden. Das ist bei einem 7-Tage-TTL zumutbar und der einzige
Weg, der nicht zwei Auth-Systeme im Monolithen zementiert. Alternative wäre, `SESSION_SECRET`
und Cookie-Format zu übernehmen — das würde den Fremdkörper aber dauerhaft festschreiben.

### 3. `created_by` / `updated_by` — worauf mappen?
Heute steht dort der Pocket-ID-`sub` — und beim Seed-Preset der Literal `'system'`, für
den es **keine** `users`-Zeile gibt. Ein naiv ergänzter Foreign Key würde daran scheitern.
Optionen: Spalten als reine Audit-Textfelder ohne FK behalten (billig, ehrlich) oder auf
Suite-User-IDs mappen (sauberer, aber `'system'` braucht eine Sonderregel).

### 4. Rollenmodell — heute wird abgewiesen, wer nicht in der Gruppe ist
`easy-qr` wirft beim Login **403 „Kein Zugriff"**, wenn ein User weder in `drk-qr-admin`
noch in `drk-qr-user` ist. In einer Suite mit *einem* Login ist das falsch: dort muss „kein
QR-Recht" zu „QR-Modul nicht sichtbar" werden, niemals zu „Login schlägt fehl". **Das ist
eine echte Verhaltensänderung, kein Port.**

### 5. Modul-Auth ist per-Modul, nicht per-Route — `qr` ist aber gemischt
Die Suite entscheidet Auth **auf Modulebene** (`requiresAuth` in der Registry). `qr`
braucht beides: anonymer Generator *und* Admin-Bereich. Mit `requiresAuth: false`
(nötig für den anonymen Teil) **löst nichts mehr automatisch einen Login aus** — Portal
bekommt das geschenkt, `qr` nicht. Also braucht es explizit:
- einen **Login-Einstiegspunkt** (`/login?callbackUrl=…` bzw. `signIn()`) im UI, und
- einen **In-Page-Guard** in `/admin` nach dem Muster `portal/admin/page.tsx` (`notFound()`
  statt 403, um die Route nicht zu verraten).

Beides muss in die Spec — es fällt sonst zwischen die Stühle.

### 6. Der Service Worker darf keine Admin-Seiten cachen
Der Spike-SW ist **network-first auf Navigationen und cached die Antwort**. In `beta`
egal, in `qr` nicht: so landet die authentifizierte Admin-Seite im Cache und wäre nach
dem Logout noch abrufbar. `easy-qr` löst das per Denylist (`/api/*`, `/auth/*` sind
`NetworkOnly`, `/api/presets` `NetworkFirst` und nur Status 200 cachebar). **Der Port
braucht dieselbe Trennung** — der Spike-SW ist dafür noch nicht fertig.

### 7. Presets hinter Login — soll das so bleiben?
Heute liefert `GET /api/presets` für Anonyme **401**; die Schnellzugriffe sieht nur, wer
eingeloggt ist. Genau daran sind in `easy-qr` **drei E2E-Tests gestorben** (`offline`,
`history`, `preset-flow` sind alle `test.skip`, Begründung: „anonyme Nutzer sehen keine
Preset-Buttons mehr"). **Offline-Verhalten ist dort aktuell gar nicht automatisiert
abgedeckt.** Wenn Presets anonym lesbar wären, würde das Modul offline für alle nützlich
— und die drei Tests kämen zurück. Fachliche Frage: sind Presets vertraulich?

### 8. Design — Hi-Vis-Amber und 56/72px-Tap-Targets gegen DRK-Rot
`easy-qr` hat ein eigenes Token-System auf Einsatztauglichkeit getrimmt: Akzent
Hi-Vis-Amber `#ffcc00`, `--tap: 56px` / `--tap-xl: 72px` (Bedienung mit Handschuhen),
High-Contrast. Die Suite bringt DRK-Rot `#c8000f` und Standard-Größen mit. **Die
Tap-Targets sind eine Anforderung, keine Stilfrage** — sie dürfen beim Angleichen ans
Suite-Design nicht verloren gehen. Der Akzentfarbwechsel ist verhandelbar.

### 9. Braucht `qr` überhaupt eine eigene DB?
Ja — wegen der Presets. Ohne Presets wäre `qr` ein reines Client-Modul ohne
`_db/`-Ordner. Mit ihnen: eine Tabelle `presets`, Slug-PK, `value` als JSON.
**Import-Fallstricke** (aus dem Schema belegt): `value` ist **doppelt kodiert** (auch
`kind='url'` steht als `"https://…"` *mit* JSON-Quotes in der Spalte), Zeitstempel sind
epoch-**Millisekunden** (Drizzle braucht `timestamp_ms`, nicht `timestamp`), alle PKs
sind extern erzeugter TEXT (kein Autoincrement), und die `CHECK`-Constraints auf
`kind`/`role` müssen explizit als `check()` mitwandern.

---

## Nicht als Quelle verwenden

`easy-qr/docs/superpowers/plans/*.md` und `specs/2026-05-13-backend-auth.md` beschreiben
die **Cloudflare-Pages/D1-Ära** und sind seit dem Refactor `e60bcce` (Docker +
better-sqlite3) überholt. Aktuell sind nur der Code und die README.

Ebenso: **Sentry** ist in `easy-qr` verdrahtet, in der Suite aber bewusst gestrichen
(Progress-Doc, Phase 1) — nicht mitportieren.

---

## Wenn die neun Punkte entschieden sind

Die Umsetzungsschritte stehen fest (aus dem Modul-Muster der Suite abgeleitet, nicht
geraten): Registry-Eintrag + Icon-Map · `_db/` mit Drizzle-Schema + generierten
Migrationen · `bootstrap.ts` + Dockerfile-COPY (beides jetzt testgekoppelt, siehe
`core/bootstrap.test.ts`) · `_lib/` für Presets/RBAC · Layout mit Shell · die vier
PWA-Dateien aus `beta` · Import-Skript nach dem `portal.ts`-Muster mit `parityView` ·
Colocated Unit-Tests + E2E inkl. QR-Dekodierung, Offline-Interaktion und
„anderer-Host-bleibt-sauber" · Traefik-Router + DNS. Health und Backup kommen
automatisch (registry- bzw. glob-getrieben).
