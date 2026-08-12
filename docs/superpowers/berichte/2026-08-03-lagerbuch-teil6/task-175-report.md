# T175 — Der Abruf je angefasster Route (36 Routen), Bericht

**Stand:** 2026-08-11 · Branch `feat/lagerbuch-abnahme` · Worktree
`/Users/rubeen/dev/personal/drk/iuk-suite-lagerbuch-teil6`

## 0. Umgebung

- `rtk pnpm dev` (liest `.env.local`), Port 3000, alle Abrufe gegen
  `http://lagerbuch.localtest.me:3000`. Log: `/tmp/t175-dev.log`.
- `rtk pnpm seed:lokal lagerbuch` gelaufen (idempotent). Kennungen aus der
  Seed-Datenbank: `art-kompresse-10x10`, `chk-rtw1-abgeschlossen`, `fz-rtw-1`,
  `tpl-rtw`, `ger-defi-rtw1` (Barcode `4012345678901`), `bz-rtw1`
  (Barcode `4015630000018`), `o2-rtw1-a`.
- **Drei Sitzungen**, alle per `curl` gegen den echten `dev-login`-Provider
  nachgebildet (Vorbild `e2e/fixtures.ts:devLogin`, Endpunkt
  `POST /api/auth/callback/dev-login` mit `csrfToken` aus `GET /api/auth/csrf`):
  - `jar-admin` — `groups=lagerbuch_nutzer` → `/api/auth/session` bestätigt
    `"groups":["lagerbuch_nutzer"]`
  - `jar-leer` — `groups=` (leer) → `"groups":[]` (Sitzung EXISTIERT, ohne
    Modulgruppe — genau der Fall, den Schritt 6 braucht)
  - `jar-helfer` — Helfer-Sitzung über `GET /t/100-100`
    (`Set-Cookie: helfer_session=…; Path=/; …` **ohne** `Domain=`)
- **Ehrlichkeitsregel dieses Berichts:** jede Zeile unten ist **selbst gefahren**.
  Keine Zeile ist aus fremdem Protokoll übernommen — die Begründung steht in §6,
  Fund 1.

---

## 1. Die 32 Tabellenzeilen aus §7.1 (29 `page.tsx`)

Je Zeile: Pfad · Status · unterscheidendes Merkmal (dritte Spalte §7.1) · Quelle.

| Pfad | Status | Unterscheidendes Merkmal — **gemessen** | Quelle |
|---|---|---|---|
| `/` (Gate) | 200 | Im **gerenderten DOM** nachgemessen (`/tmp/t175-gate.mjs`), nicht in der RSC-Nutzlast: `getAttribute("inputmode")="numeric"`, `("maxlength")="7"`, `("pattern")="[0-9]{3}-?[0-9]{3}"`, `("aria-label")="Zugangs-Code"`. ⚠️ Im **gelieferten Markup** stehen die Namen camelCase (`inputMode=`, `maxLength=`, `autoComplete=`). HTML-Attributnamen sind ASCII-case-insensitiv, der Browser liest sie richtig — aber ein `grep` auf die Kleinschreibung findet **nichts**; genau das ist mir zuerst passiert. Siehe Fund 6. | selbst gefahren |
| `/helfer` | 200 | Tab-Leiste, `aria-current="page" href="/helfer"` auf „Entnahme" | selbst gefahren |
| `/helfer/check` | 200 | Fahrzeugwahl mit echten Fahrzeugen („RTW 1"), kein Leerzustand | selbst gefahren |
| `/a/art-kompresse-10x10` | 200 | Artikelname „Kompressen 10×10 cm, steril" **+** Knopf „Entnahme buchen" | selbst gefahren |
| `/a/gibtsnicht-xyz` | **200**, nicht 303 | „Dieses Etikett kennt kein Artikel" + „Der Artikel wurde gelöscht oder das Etikett stammt aus einer anderen Anwendung. Bitte der Verwaltung melden." (8-C) ⚠️ Wortlaut weicht von der Plantabelle ab, siehe Fund 3 | selbst gefahren |
| `/g/4012345678901` (bekannt, Gerät) | **307** (Plan sagt 303, Fund 2) | `location: /verwaltung/geraete/ger-defi-rtw1` — **relativ**, kein Host im Kopf | selbst gefahren |
| `/g/4015630000018` (bekannt, BZ) | **307** | `location: /verwaltung/bz/bz-rtw1` — **relativ** | selbst gefahren |
| `/g/kein-solcher-barcode-9999` | **200**, nicht 404 | „Kein Gerät zu diesem Barcode" + der gescannte Code **im Klartext** (`data-testid="lb-barcode-code"` → `kein-solcher-barcode-9999`) + Shell (`data-testid="suite-header"`) + Modulnavigation (`Modulnav`) + beide Wege (`lb-barcode-nochmal`, `lb-barcode-liste`) | selbst gefahren |
| `/verwaltung` | 200 | KPI-Kacheln mit farbiger linker Kante: `kpiRot` → `border-inline-start-color: rgb(140,13,22)`, Breite `4px` (im Browser gemessen) | selbst gefahren |
| `/verwaltung/artikel` (T165) | 200 | `ant-table` vorhanden **und** Excel-Knopf „Excel-Liste" **ohne** `disabled`, mit Titel „Erzeugt eine Excel-Datei (.xlsx) mit der aktuell angezeigten Liste" | selbst gefahren |
| `/verwaltung/journal` | 200 | Δ-Spalte vorhanden, ASCII-Vorzeichen in den Zellen (59 Treffer auf `>[+-][0-9]+<`) | selbst gefahren |
| `/verwaltung/checks` | 200 | Grenzhinweis **nicht** da — korrekt: `CHECK_GRENZE = 50`, in der Seed-Datenbank stehen 2 Checks, `deckelText` liefert „2 Treffer" statt „Neueste 50 von mehr Treffern — Zeitraum eingrenzen" | selbst gefahren |
| `/verwaltung/checks/chk-rtw1-abgeschlossen` | 200 | Positionsdetails vorhanden (kein Alt-Format-Hinweis), Brotkrume (`<nav aria-label="Brotkrume">`) | selbst gefahren |
| `/verwaltung/inventur` | 200 | Abweichungszähler im Knopftext, **wörtlich und lebend** (`/tmp/t175-inventur.mjs`): Ausgangszustand `Inventur abschließen (0 Abweichungen)` · nach einer verstellten Ist-Menge `Inventur abschließen (1 Abweichung)` (Singular!) · nach zwei `(2 Abweichungen)` · zurückgestellt wieder `(0 Abweichungen)`. 17 Ist-Felder im DOM. Der Abweichungs-Chip trägt dabei `+5` mit `bg rgb(251,241,220)` / `fg rgb(138,82,0)` = `--lb-ampel-gelb-flaeche`/`-text`. ⚠️ Erste Fassung maß nur „„Abweichung", 3 Treffer" — siehe Fund 7 | selbst gefahren |
| `/verwaltung/bestellung` (T166) | 200 | **beide** Knöpfe ohne `disabled`, Beschriftungen zeichengleich `Liste kopieren (nur offene)` und `CSV (alle Zeilen)` | selbst gefahren |
| `/verwaltung/etiketten` (T162) | 200 | Bogen (`lb-etikettbogen`) + Zeile **mit dem Wert**: „Alle QR-Codes zeigen auf `http://lagerbuch.localtest.me:3000`" (`data-testid="lb-basis"`) — die Zeile, die eine umsortierte `SUITE_HOST_LAGERBUCH` **vor** dem Papier sichtbar macht; QR als **Inline-SVG** in `.lb-etikettQr > svg` (`viewBox="0 0 49 49"`), nicht als `data:image/png` | selbst gefahren |
| `/verwaltung/tokens` (T160) | 200 | Code-Spalte mit Klartext-Codes (21 Treffer auf `\d{3}-\d{3}`), Knopf „Sperren" vorhanden, **„Endgültig löschen" NICHT vorhanden** (8-F) | selbst gefahren |
| `/verwaltung/fahrzeuge` | 200 | echter `<Link>` in der ersten Spalte: `/verwaltung/fahrzeuge/fz-rtw-1`, `…/fz-ktw-1`, `…/fz-mtw-1` (äußere Pfadform) | selbst gefahren |
| `/verwaltung/fahrzeuge/fz-rtw-1` | 200 | Brotkrume `<nav aria-label="Brotkrume">`, **kein** `aria-current="page"` in der Modulnavigation (im Browser bestätigt) | selbst gefahren |
| `/verwaltung/vorlagen` | 200 | Liste mit „RTW-Standardbeladung" | selbst gefahren |
| `/verwaltung/vorlagen/tpl-rtw` | 200 | Brotkrume + Gefahrenzone (Löschabschnitt) | selbst gefahren |
| `/verwaltung/geraete` | 200 | Fälligkeits-Chips **mit Text** („überfällig" / „fällig" / „kein Datum") | selbst gefahren |
| `/verwaltung/geraete/ger-defi-rtw1` | 200 | Brotkrume | selbst gefahren |
| `/verwaltung/geraete/scan` | 200 | Kamera-Insel mit **allen vier unterscheidbaren Zuständen einzeln gemessen** (`/tmp/t175-scan.mjs`, Tabelle in §1b) — plus dem fünften (`KEIN_SICHERER_KONTEXT`), der auf `http://` der **einzige** ist, den ein blosser Abruf je zeigt. Das manuelle Feld steht in jedem der fünf. ⚠️ Erste Fassung maß nur „„Kamera"/„Scan", 4 Treffer" — eine numerische Koinzidenz, kein Nachweis; siehe Fund 7 | selbst gefahren |
| `/verwaltung/bz` | 200 | Fälligkeit „noch nie geprüft" als **eigener Text** | selbst gefahren |
| `/verwaltung/bz/bz-rtw1` | 200 | Logbuch mit `ref_snapshot`-Grenzen (3 Treffer) | selbst gefahren |
| `/verwaltung/bz/bz-rtw1/kontrolle` | 200 | `DatePicker picker="month"` (gerendert als `picker-month`) — Label heißt „Kompressen-Verfall", nicht „Verfallsmonat" (Fund 4) | selbst gefahren |
| `/verwaltung/bz/scan` | 200 | Kamera-Insel — dieselbe Komponente (`_ui/BarcodeScanner`), ungeschönt gemessen: `KEIN_SICHERER_KONTEXT` + manuelles Feld + Knopf „Suchen" (§1b) | selbst gefahren |
| `/verwaltung/sauerstoff` | 200 | „keine Messung" vorhanden, **`>0 %<` kommt NICHT vor** | selbst gefahren |
| `/verwaltung/sauerstoff/o2-rtw1-a` | 200 | Brotkrume + Messverlauf | selbst gefahren |
| `/verwaltung/import` | 200 | Vorschau vor dem Absendeknopf | selbst gefahren |
| `/verwaltung/verfall` | 200 | `<li>` vorhanden (99 Treffer), **`ant-table` kommt NICHT vor** | selbst gefahren |

**32 Tabellenzeilen für 29 Dateien** — der Plan zählt **31**, weil er `/g/<bekannt>`
als *eine* Zeile führt („→ `geraete/<id>` **bzw.** `bz/<id>`", Plan:543); hier steht
sie **zweimal**, weil beide Zieläste getroffen und einzeln gemessen wurden
(`4012345678901` → Geräte-Detail, `4015630000018` → BZ-Detail). Es fehlt nichts, es
ist eine Zeile mehr. `find src/app/m/lagerbuch -name page.tsx | wc -l` = **29** (nach
dem Löschen der Wurf-Route, siehe §4).
⚠️ Die erste Fassung dieses Berichts und `652b157` sagen an dieser Stelle „31 Zeilen";
korrigiert im Nachtrag-Commit (Review-Fund 1).

### 1a. Die vierte Fehlerklasse: die `usePathname`-Naht unter dem Rewrite

Im **echten Browser** gemessen (`/tmp/t175-nav.mjs`), nach Hydration **und** nach
Client-Navigation — nicht nur im SSR-Markup:

```
/verwaltung                       -> /verwaltung «Übersicht» (2x: Kopfzeile + Modulnav)
/verwaltung/artikel               -> /verwaltung/artikel «Artikel»
/verwaltung/verfall               -> /verwaltung/verfall «Verfall»
/verwaltung/tokens                -> /verwaltung/tokens «Zugangs-Codes»
/verwaltung/geraete               -> /verwaltung/geraete «Geräte»
/verwaltung/geraete/ger-defi-rtw1 -> KEINE   (dokumentierter Verlust §6.3.3, Brotkrume trägt)
/verwaltung/bz/bz-rtw1            -> KEINE   (dito)
/verwaltung/etiketten             -> KEINE   (Druckast ohne Shell — es gibt dort keine Nav)
(Client-Navigation nach Klick)    -> /verwaltung/artikel «Artikel»
```

`usePathname` liefert unter dem Host-Rewrite die **äußere** Pfadform. Kein Fund.

### 1b. Die vier unterscheidbaren Zustände der Kamera-Insel (Nachtrag zu Review-Fund 3)

**Warum ein blosser Abruf sie strukturell nicht zeigt:** `kameraText()` in
`_ui/BarcodeScanner.tsx` verzweigt über `DOMException.name` aus `getUserMedia` — das
sind **Client**-Zustände. Über `http://lagerbuch.localtest.me:3000` ist
`window.isSecureContext` **falsch**; die Insel steigt in ihrem Effekt **vor** dem
dynamischen zxing-Import aus (`!window.isSecureContext || !navigator.mediaDevices`)
und zeigt immer nur den **fünften** Zustand. Genau das ist gemessen:

```
/verwaltung/geraete/scan  [ohne Praeparation, isSecureContext=false]
    Fehlerkarte:   Die Kamera braucht eine verschlüsselte Verbindung. Bitte die Seite
                   über die normale Adresse aufrufen, nicht über die IP.
    Video im DOM:  nein   manuelles Feld: ja   Knopf: Suchen
/verwaltung/bz/scan       [identisch]
```

**Die vier, je Ursache einzeln durchgeschaltet** (`page.addInitScript`:
`isSecureContext` auf `true`, `navigator.mediaDevices.getUserMedia` wirft die jeweilige
`DOMException` — eine gewöhnliche `Error`-Instanz liefe in den Fallback und
gäbe viermal denselben Satz):

| Ursache | Gerenderter Satz (`[data-rolle="scan-fehler"]`) |
|---|---|
| `NotAllowedError` | „Der Kamerazugriff wurde abgelehnt. In den Browser-Einstellungen für diese Seite freigeben — oder den Barcode unten eintippen." |
| `SecurityError` | **derselbe Satz** — dieselbe Handlung, so gewollt |
| `NotFoundError` | „Keine Rückkamera gefunden. Barcode bitte unten eintippen." |
| `OverconstrainedError` | **derselbe Satz** wie `NotFoundError` |
| `NotReadableError` | „Die Kamera wird gerade von einer anderen App benutzt. Diese schließen oder den Barcode unten eintippen." |
| `AbortError` | **derselbe Satz** wie `NotReadableError` |
| unbekannt (kein `DOMException`) | „Die Kamera ist nicht verfügbar. Barcode bitte unten eintippen." — behauptet **nicht**, der Zugriff sei abgelehnt worden |

**Vier unterscheidbare Zustände, sieben Ursachen** — die Zusammenfassungen sind
Absicht (§7.6.3: „die HANDLUNG unterscheidet sich je Ursache", nicht die Ursache je
Satz). In **jedem** der fünf Fälle steht das manuelle Barcode-Feld samt Knopf
„Suchen" — das ist die 1:1-Pflicht aus §7.6.3, und ein Rückfall, der sich hinter
einem Kamerafehler versteckt, wäre keiner.

Dauerhaft gehalten wird dieselbe Aussage von `_ui/BarcodeScanner.test.tsx:332–380`
(je ein `it` pro `DOMException`-Name, mit demselben Wortlaut) und `:281–326` für den
unsicheren Kontext. Der Abruf hier belegt zusätzlich, dass die Sätze **im echten
Browser aus dem echten Bundle** kommen.

---

## 2. Die 7 Route Handler (§7.2)

| Pfad | Status | Content-Type | Unterscheidendes Merkmal — gemessen | Quelle |
|---|---|---|---|---|
| `/manifest.webmanifest` | 200 | `application/manifest+json` | `"start_url":"/"`, `"scope":"/"`, `theme_color:#C8000F` | selbst gefahren |
| `/pwa-icon.svg` | 200 | `image/svg+xml` | Suite-Rot `#c8000f` im SVG | selbst gefahren |
| `/icon-192.png` | 200 | `image/png` | **1558 Bytes** (Sollwert getroffen) | selbst gefahren |
| `/icon-512.png` | 200 | `image/png` | **5458 Bytes** (Sollwert getroffen) | selbst gefahren |
| `/icon-maskable-512.png` | 200 | `image/png` | **3290 Bytes** (Sollwert getroffen) | selbst gefahren |
| `/t/<code>` | — | — | **Eigentümer T171** (E2E, `e2e/lagerbuch-helfer.spec.ts` / `lagerbuch-hosts.spec.ts`); nur ein Browser zeigt, dass das Cookie auf DEMSELBEN Host landet. **Beobachtung am Rande** beim Aufbau der Helfer-Sitzung: `/t/100-100` → `303`, `location: /helfer` (relativ), `set-cookie: helfer_session=…; Path=/; Max-Age=43200; HttpOnly; SameSite=lax` — **ohne `Domain=`**. `/t/900-900` → `303`, `location: /?grund=code`, und das Gate **zeigt** den Grund: „Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung." (Falle 60) | T171 |
| `/abmelden` | — | — | **Eigentümer T171.** Beobachtung am Rande: `303`, `location: /` (relativ), `set-cookie: helfer_session=; Path=/; Max-Age=0; HttpOnly; SameSite=lax` — **ohne `Domain=`** | T171 |

Zusatz (nicht in §7.2, im Brief-Kommando enthalten): `/api/health/lagerbuch` → **200**,
`application/json`, Rumpf `{"status":"ok","module":"lagerbuch"}`.

### 2a. Der Manifest-Gegentest auf dem Portal-Host (Falle 56, Runbook R2)

```
curl -si http://portal.localtest.me:3000/manifest.webmanifest          → 307 → /login
curl -si -b jar-admin http://portal.localtest.me:3000/manifest.webmanifest → 404
   x-middleware-rewrite: /m/portal/manifest.webmanifest
   Rumpf: HTML-404-Seite, KEIN Lagerbuch-Manifest
```

Auch die vier Icon-Handler antworten auf dem Portal-Host mit **404**
(`/pwa-icon.svg`, `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`).
Der Gegentest ist eingelöst: kein Suite-Host außer `lagerbuch.localtest.me`
bewirbt eine Lagerbuch-PWA.

⚠️ Die anonyme Variante (307 → `/login`) beweist das **nicht**, sie beweist nur,
dass `portal` `requiresAuth: true` trägt. Die Messung, die zählt, ist die mit Sitzung.

### 2b. Falle 61 von der richtigen Seite — und was `localhost` *nicht* beweist

Auf `localhost:3000` antworten `/`, `/verwaltung`, `/verwaltung/etiketten`,
`/manifest.webmanifest`, `/t/100-100`, `/abmelden` mit **307 → `/login`**, auch mit
Cookie-Jar — weil `AUTH_COOKIE_DOMAIN=.localtest.me` das Sitzungscookie gar nicht an
`localhost` sendet und `moduleForHost("localhost")` auf `portal` fällt, das Auth verlangt.
Der Punkt hält: **auf `localhost` bekommt man keine einzige gültige Lagerbuch-Zeile.**

⚠️ **Diese Messung übt `requireLagerbuchHost` aber gar nicht aus** (Review-Fund 2).
Plan:532 und der Brief sagen „auf `localhost` greift `requireLagerbuchHost` und jede
Zeile antwortete 404" — der **Effekt** stimmt, die **Ursache** nicht: portals
`requiresAuth`-Weiche in `decideRoute` greift **vor** jeder Modulseite, der Riegel
wird nie erreicht. Wer die Prüfung so wiederholt, glaubt den Host-Riegel getestet zu
haben und hat portals Auth getestet. Plan:530–532 ist deshalb nachgezogen.

**Der Riegel allein — nachgemessen.** Ein **innerer** Pfad auf einem fremden Suite-Host
läuft an allem anderen vorbei: `decideRoute` nimmt für `/m/lagerbuch/…` den
Internal-Zweig, `lagerbuch` trägt `requiresAuth: false`, `canAccess` steigt sofort mit
`true` aus — die Anfrage landet ungefiltert auf `requireLagerbuchHost` bzw.
`lagerbuchHostOderNull`. Gleiche Sitzung (`jar-admin`), gleicher Pfad, nur der `Host`
unterscheidet sich:

| Host | `/m/lagerbuch/verwaltung/artikel` | `/m/lagerbuch/verwaltung/etiketten` | `/m/lagerbuch/manifest.webmanifest` |
|---|---|---|---|
| `files.localtest.me` | **404** | **404** | **404** |
| `portal.localtest.me` | **404** | **404** | **404** |
| `lagerbuch.localtest.me` | **200** | **200** | **200** |

Nichts außer dem Host-Riegel erklärt die Differenz — die Gruppe ist dieselbe, der Pfad
ist derselbe, die Route existiert nachweislich (Spalte 3).

**Dauerhaft gehalten** wird dieselbe Aussage bereits von
`e2e/lagerbuch-hosts.spec.ts` (`test.describe("Host-Riegel")`, Zeilen 109–180): **15**
Einstiege, je **404 auf `feedback.localtest.me`** *und* **nicht-404 auf dem eigenen
Host**, angemeldet **mit** Lagerbuch-Gruppe — damit der 404 nicht der Gruppenriegel
ist —, plus ein Umweg-Ausschluss über die finale URL. **Es wurde deshalb kein neuer
Test angelegt**; die Lücke war die im Protokoll, nicht die in der Abdeckung.

---

## 3. Die vier Farbmodus-Abrufe (Schritt 4) — alle vier im echten Browser

Werkzeug: `/tmp/t175-farbmodus.mjs` (Wegwerf-Skript in `/tmp`, **nicht** unter `e2e/`
und **nicht** unter `_actions/` — T172s Zählung bleibt unberührt), gefahren mit
`rtk proxy node`. Umgeschaltet über den **Cookie-Umschalter der Suite**
(`iuk-theme=light|dark` auf `.localtest.me`, `src/core/theme/mode.ts:5`) — **nie**
über `prefers-color-scheme`. `data-theme` am `<html>` je Lauf gegengeprüft.

| Seite | hell | dunkel | Urteil |
|---|---|---|---|
| `/verwaltung/artikel` — **tragen die Chips Farbe?** | Chip „unter Mindestbestand": `background-color rgb(246,227,224)`, `color rgb(140,13,22)` | `background-color rgb(42,17,19)`, `color rgb(232,131,124)` | **Ja** — Fläche UND Text wechseln, nicht nur Polster/Rundung |
| `/verwaltung/verfall` — **ist die Plakette keine weiße Scheibe?** | Kreis `fill rgb(255,255,255)`, aktiver Strich `rgb(140,13,22)`, übrige Striche `rgb(217,221,225)` | Kreis `fill rgb(22,25,28)` (= `--lb-karte` dunkel), aktiver Strich `rgb(232,131,124)`, übrige `rgb(42,47,52)` | **Keine weiße Scheibe** |
| `/verwaltung` — **sind die farbigen linken Kanten da?** | `kpiRot`: `border-inline-start-color rgb(140,13,22)`, Breite `4px` | `rgb(232,131,124)`, Breite `4px` | **Da, in beiden Modi** |
| **`/verwaltung/etiketten` — bleibt der Bogen weiß mit schwarzer Schrift?** | Bogen `bg rgb(255,255,255)` / `color rgb(0,0,0)`; Etikett `bg rgb(255,255,255)` / `color rgb(0,0,0)`; Titel `rgb(0,0,0)` | **identisch**: `rgb(255,255,255)` / `rgb(0,0,0)` | **Ja — der Bogen ist modusfest.** Ein Bogen aus einer dunkel eingestellten Sitzung druckt nicht weiß auf weiß |

Zusätzlich am Bogen gemessen: `suite-header` ist **nicht im DOM** (Druckast ohne Shell,
§2.9), QR-SVG vorhanden.

### 3a. Der Print-Abruf (`emulateMedia({ media: "print" })`)

Eigentümer ist T167; hier zur Vollständigkeit mitgemessen, in **beiden** Farbmodi
identisch:

```
leisteDisplay:        none    (trotz Inline-Style "display:flex;…" — die !important-Regel greift)
leisteInlineStyle:    display:flex;gap:8px;margin-bottom:12px
wahlDisplay:          none    (Auswahlkästchen unsichtbar)
abgewaehltDisplay:    none    (abgewählte Kachel unsichtbar, nicht nur transparent)
h1Display:            none
basisZeileDisplay:    none
bogenBg:              rgb(255, 255, 255)
bogenGap:             0px     (Bildschirm 2mm → Papier 0)
printColorAdjust:     exact
```

Suite-Kopfzeile: entfällt konstruktiv (kein Shell im Druckast).

---

## 4. Die absichtlich werfende Route (Schritt 5) — der `error.tsx`-Nachweis

Angelegt: `src/app/m/lagerbuch/verwaltung/(arbeit)/wurf/page.tsx` (Wortlaut aus dem
Brief). Abruf `http://lagerbuch.localtest.me:3000/verwaltung/wurf`:

- **HTTP 500** ✓
- ⚠️ **`curl` allein reicht hier nicht**, und das ist eine eigene Beobachtung: im
  Dev-Server liefert der 500 Nexts Entwickler-Fehlerseite mit dem geworfenen Text
  („Absichtlicher Wurf …"). Die Modul-`error.tsx` ist eine **Client**-Grenze und
  rendert erst im Browser. Der Brief-Befehl (`curl … | grep …`) findet die zwei Texte
  deshalb **nicht** — nicht weil die Rahmung fehlt, sondern weil `curl` sie nicht
  sehen kann. Nachgemessen mit `/tmp/t175-wurf.mjs` (Chromium):

| Messung | Ergebnis |
|---|---|
| HTTP-Status der Navigation | **500** |
| `FEHLER_TITEL` „Diese Ansicht konnte nicht geladen werden." | **JA** |
| `FEHLER_ERNEUT` „Erneut versuchen" | **JA** |
| `FEHLER_ZURUECK` „Zurück zum Anfang" | **JA** |
| **DIE MESSUNG: steht der Manifest-Verweis aus `m/lagerbuch/layout.tsx` in der Antwort?** | **JA** — `<link rel="manifest" href="/manifest.webmanifest">`, identisch zu `/verwaltung` und `/verwaltung/etiketten` |
| Suite-Kopfzeile | nicht vorhanden — die Grenze liegt **über** `verwaltung/(arbeit)/layout.tsx`, dessen `FullShell` fällt mit weg |

Sichtbarer Text: „Diese Ansicht konnte nicht geladen werden. Bitte versuche es noch
einmal. Bleibt es dabei, melde dich bei der Verwaltung. Erneut versuchen Zurück zum
Anfang."

**§11.2 ist damit eingelöst, nicht behauptet:** die Modul-`error.tsx` rendert
**innerhalb** von `m/lagerbuch/layout.tsx` — der Manifest-Verweis ist der Beleg.

**Rückbau:** `rm -rf "src/app/m/lagerbuch/verwaltung/(arbeit)/wurf"`, danach
`git status --short` leer und `find … -name page.tsx | wc -l` = **29**.

---

## 5. Die zwei benannten Mutationen (Entscheidung B25)

### Mutation 1 — `@ant-design/icons` in `verwaltung/(druck)/etiketten/page.tsx`

**Verändert:** `import { PrinterOutlined } from "@ant-design/icons";` plus
`<PrinterOutlined />` in der `<h1>`.

**Was der Abruf zeigte:**

```
curl … /verwaltung/etiketten   → HTTP 500
Dev-Log: TypeError: (0 , _react.createContext) is not a function
```

Genau Falle 7: der Fehler entsteht **beim Import**, nicht beim Rendern. Zusätzlich
gemessen — die zwei Quelltext-Scans gehen mit rot:

```
src/core/shell/icons.test.ts       FAIL  („Diese Dateien importieren antd-Icons OHNE `use client`")
src/app/m/lagerbuch/_ui/ikonen.test.ts  FAIL  (AST-Riegel)
```

Damit ist die Klasse zweifach belegt: der **Scan** sieht den Import, der **Abruf**
sieht den 500. Hätte der Abruf 200 gezeigt, fienge dieses Protokoll die Klasse nicht.

**Rückbau bestätigt:** Datei aus der Kopie `/tmp/t175/page.tsx.orig` zurückgespielt,
danach `/verwaltung/etiketten` → **200**, `git status --short` leer.

### Mutation 2 — `className={s.modul}` fällt aus `_ui/DruckRahmen.tsx`

**Verändert:** `return <div className={s.modul}>{children}</div>;` →
`return <div>{children}</div>;`

**Was der Abruf zeigte — und warum ihn nur der Browser sieht:**

| Messung | mit Träger (Ist) | ohne Träger (Mutation) |
|---|---|---|
| HTTP-Status | **200** | **200** |
| Merkmal „Alle QR-Codes zeigen auf" | vorhanden | **vorhanden** |
| Dev-Log | keine Zeile | **keine Zeile** |
| CSS-Scan `_ui/rahmen.test.tsx` | PASS (11) | **PASS (11) — grün geblieben** |
| Träger im DOM | `verwaltung-module__QDCyfW__modul` | **NEIN** |
| `--lb-rot` am Träger | `#c8000f` | — |
| **`--lb-rot` geerbt am Bogen** | `#c8000f` | **leer → jedes `var(--lb-…)` fällt auf `transparent`, gültiges CSS** |
| `--lb-karte` geerbt am Bogen | `#fff` | **leer** |
| Fokusring des Auswahlkästchens (Tab 4, Tastaturfokus) | **`2px solid rgb(200,0,15)`** = Suite-Rot aus `--lb-rot` | **`1px auto rgb(0,95,204)`** = Browser-Vorgabe (blau) |
| Fokusring der antd-Knöpfe (Tab 1–3) | `3px solid rgb(237,118,114)` | unverändert — das ist antds eigener Ring, kein `--lb-*` |

Der Bogen selbst bleibt weiß/schwarz, weil `druck.css` dort **Literale** trägt
(`#ffffff`/`#000000`, §6.10.2 Punkt 2) — das ist Absicht und genau der Grund, warum
der Ausfall so still ist. Sichtbar wird er an der **Fokusregel**
(`.modul input:focus-visible { outline: 2px solid var(--lb-rot) }`): sie verschwindet
ersatzlos, und übrig bleibt der blaue Browser-Standardring. HTTP 200, kein Log, jeder
Scan grün — belegt.

**Rückbau bestätigt:** aus `/tmp/t175/DruckRahmen.tsx.orig` zurückgespielt, danach
Träger wieder da (`--lb-rot: #c8000f` am Bogen, Fokusring wieder `2px solid
rgb(200,0,15)`), `/verwaltung/etiketten` → 200, `git status --short` leer.

---

## 6. Der Riegel-Abruf (Schritt 6, F3)

Als Konto **mit** Sitzung, aber **ohne** `lagerbuch_nutzer`
(`/api/auth/session` → `"groups":[]`):

```
/verwaltung/etiketten   404
/verwaltung/artikel     404
/verwaltung             404
/verwaltung/tokens      404
```

**Zweimal dieselbe Zahl, und die Zahl ist 404 — nicht 403.** Gegenproben:

```
mit Gruppe:        /verwaltung/etiketten 200   /verwaltung/artikel 200
ganz ohne Sitzung: /verwaltung/etiketten 307   /verwaltung/artikel 307  (→ /login)
```

Die Kopplung zwischen `(arbeit)/layout.tsx` und `(druck)/layout.tsx` ist damit gegen
den **tatsächlich laufenden** Server belegt, auf dem echten Modul-Host. Ein
Quelltext-Scan sieht sie nicht; T167 hält dieselbe Aussage dauerhaft als E2E.

---

## 7. Funde, Einordnung, was daraus wurde

### Fund 1 — die Prämisse „Teil 5s Protokoll wird gelesen und übernommen" trägt nicht (Bedenken, kein Blocker)

Brief und Plan sagen, die 23 Arbeitsseiten seien von T151 abgehakt und das Protokoll
werde „gelesen und übernommen". **Beide genannten Quellen enthalten kein
Zeilenprotokoll:**

- `git show -s 190707b` sagt aggregiert „23 Verwaltungsrouten liefern im
  authentifizierten Browser 200" — eine Zahl, keine Zeile, kein Merkmal.
- `docs/runbooks/lagerbuch-cutover.md` §12 behandelt in Prosa nur die **drei**
  Dunkelmodus-Seiten.

Eine „Übernahme" hätte 23 Zeilen erfunden, die es nirgends gibt — genau der
schlimmstmögliche Ausgang. **Konsequenz:** alle 32 Zeilen und alle vier
Farbmodus-Abrufe wurden **selbst gefahren**. Kosten: ein Kommando. Der Befund selbst
bleibt als Bedenken stehen — nicht für diesen Task, sondern weil §7.1 die Spalte
„Verifiziert in: Teil 5, T151/2" führt und die Belegkette dort dünner ist, als die
Tabelle nahelegt.

### Fund 2 — `/g/<bekannt>` antwortet 307, der Plan erwartet 303 (Abweichung, kein Defekt)

`redirect()` in einer Server Component ergibt in Next 16 einen **307**, nicht 303. Der
`Location`-Kopf ist **relativ** — und das ist das unterscheidende Merkmal der Zeile,
das hält. Für einen GET verhalten sich 303 und 307 im Browser gleich. **Nicht
gefixt:** ein Umbau auf 303 wäre eine Änderung am Verhalten, um eine Zahl in einer
Plantabelle zu treffen. Die Plantabelle ist die ungenauere Quelle.

### Fund 3 — Wortlaut in §7.1 weicht von der Implementierung ab (`/a/<unbekannt>`)

Plan: „Dieses Etikett gehört zu keinem Artikel mehr." · Implementierung (Teil 4):
„Dieses Etikett kennt kein Artikel" + „Der Artikel wurde gelöscht oder das Etikett
stammt aus einer anderen Anwendung. Bitte der Verwaltung melden."
**Die Substanz von 8-C hält** (200 statt 303, benannter Text, kein 404). Nicht gefixt
— eine Textänderung an einer von Teil 4 abgenommenen Zeile wäre eine Fachentscheidung.

### Fund 4 — Wortlaut in §7.1 weicht ab (`bz/<id>/kontrolle`)

Plan: Label „Verfallsmonat" · Implementierung: Label „Kompressen-Verfall", mit
`picker="month"` (gerendert `picker-month`). Substanz hält, Wortlaut nicht. Nicht
gefixt, gleiche Begründung.

### Fund 5 — **gefixt:** das Seed-Protokoll bestritt die Existenz von `/g/<barcode>`

`src/app/m/lagerbuch/_lib/seedLokal.ts:714` schloss mit
„⚠️ Es gibt heute keine Route `/g/<code>` …". Richtig, solange Teil 4 galt; **seit
T164 falsch**. Ein Protokollsatz, der eine Route **bestreitet**, ist schlimmer als ein
fehlender: wer lokal prüft, lässt die Route dann aus — und `/g/<barcode>` ist der Weg
des gescannten Typenschilds. Kein Gate sah es (Fließtext in einem Array). Außerdem
fehlte `/verwaltung/etiketten` in der Adressliste.

**Behebung** (eigener Commit `6326006`): der Satz ist ersetzt durch zwei echte
Adressen (`/g/4012345678901` → Geräte-Detail, `/g/4015630000018` → BZ-Detail), die
Etikettenseite steht in der Liste, und die zwei Namensräume sind abgegrenzt (`/t/`
nimmt den sechsstelligen Zugangs-Code, `/g/` den Barcode vom Typenschild).

**Der Test, der es künftig fängt** (`seedLokal.test.ts`) hat **zwei Hälften mit
ungleicher Tragfähigkeit** — die erste Berichtsfassung behauptete pauschal, er sei „an
die Seed-Daten gebunden, **nicht** an den Wortlaut". Das gilt nur für eine Hälfte
(Review-Fund 6), richtiggestellt:

- **positiv, datengebunden, wortlautunabhängig — sie trägt die Last:** jeder im
  Protokoll genannte `/g/<ziffern>` wird gegen `geraete.barcode` ∪ `bzGeraete.barcode`
  aufgelöst. Ein umformulierter Hinweis bleibt grün, ein Barcode ohne Gerät nicht.
- **negativ, wortlautgebunden — Zusatz, kein Ersatz:** das Muster fängt die heute
  bekannten Bestreitungsformen und ist **ausdrücklich umgehbar**. In der Fix-Runde
  von `not.toContain("keine Route /g/")` auf ein `RegExp` erweitert, das auch
  „Route /g/… existiert nicht / gibt es nicht / ist nicht implementiert" trifft — aber
  eine neu erfundene Formulierung käme weiterhin durch. Der Grund, es trotzdem zu
  behalten: der konkrete Satz, der den Fund auslöste, kann nicht unbemerkt
  zurückkehren. Eine Phrasen-Ratejagd wäre die falsche Reaktion — sie täuschte
  Vollständigkeit vor.

Außerdem in der Fix-Runde ergänzt (Review-Fund 5): eine Zusicherung auf
`…:3000/verwaltung/etiketten` in der Adressliste — die zweite Hälfte des W1-Fixes war
bis dahin von keinem Test gedeckt.

**Rot-Grün beider Hälften nachgewiesen** (Kommandos und Ausgaben in §11).

### Fund 6 — das Gate-Codefeld liefert camelCase-Attributnamen (Beobachtung, kein Defekt)

Das gelieferte Markup des Gates enthält
`<input class="helfer-module__…__codefeld" inputMode="numeric" autoComplete="off" maxLength="7" …>`
— die **React-Prop-Schreibweise**, nicht die HTML-Attributschreibweise. Ein
`grep 'inputmode="numeric"'` über die Antwort liefert **0 Treffer**; genau daran
ist meine erste Merkmalsprüfung gescheitert.

**Kein Defekt:** HTML-Attributnamen sind ASCII-case-insensitiv, der Parser
normalisiert. Im DOM steht `getAttribute("inputmode") === "numeric"` und
`getAttribute("maxlength") === "7"` — die Zusage des Codefelds hält, auf jedem
Gerät. **Die Konsequenz für Prüfungen:** ein Quelltext- oder Antwort-`grep` auf
die Kleinschreibung würde hier still nichts finden und „Merkmal fehlt" melden.
Wer diese Zeile künftig automatisiert prüft, muss den **DOM** fragen oder
case-insensitiv greppen. Deshalb steht die DOM-Messung im Protokoll und nicht der
`grep`.

### Fund 7 — **selbst verursacht, in der Fix-Runde behoben:** zwei still abgeschwächte Merkmale

Die erste Fassung dieses Protokolls maß für `/verwaltung/geraete/scan` „Kamera-Insel
vorhanden („Kamera"/„Scan", 4 Treffer)" und für `/verwaltung/inventur`
„Abweichungszähler im Knopftext („Abweichung", 3 Treffer)". Plan:584 verlangt aber
„Kamera-Insel, **vier unterscheidbare Zustände**", und die „4 Treffer" waren eine
**numerische Koinzidenz** — sie sahen aus, als hätten sie die vier Zustände abgedeckt,
und deckten nur die Anwesenheit zweier Wörter ab. Beim Zähler dasselbe: drei Treffer
auf „Abweichung" belegen keine Zahl im Knopftext.

Das Verwerfliche daran ist nicht die schwächere Messung, sondern die **Asymmetrie**:
an drei anderen Stellen (curl vs. `error.tsx`, `grep` vs. camelCase, die anonyme
Variante des Manifest-Gegentests) steht ausgeschrieben, was das Messgerät *nicht*
sehen konnte — hier ersetzte ein schwächeres Merkmal das geforderte ohne Vermerk.

**Behebung:** beide im echten Browser nachgemessen statt bloß benannt — die vier
Kamerazustände einzeln durchgeschaltet (§1b) und der Zähler live hochgezählt
(0 → 1 → 2 → 0, mit korrektem Singular). Zusätzlich in Plan:584 vermerkt, **warum** ein
blosser Abruf die vier nie zeigt.

### Kein Fund

Keine der vier unsichtbaren Fehlerklassen hat im Ist-Zustand zugeschlagen: kein 500
auf einer der 32 Zeilen, kein antd-Compound-Ausfall, kein Icon-Import in der
RSC-Ebene, kein Wert aus einem `"use client"`-Modul in einer Server Component, keine
fehlende oder falsche Aktivmarkierung unter dem Rewrite.

---

## 8. Geänderte Dateien, Kommandos, Ausgaben

**Committet** (`6326006`, `fix(lagerbuch): das Seed-Protokoll bestreitet /g/<barcode> nicht mehr`):

- `src/app/m/lagerbuch/_lib/seedLokal.ts` — Protokolltext
- `src/app/m/lagerbuch/_lib/seedLokal.test.ts` — neue Zusicherung

**Temporär, nicht committet, zurückgebaut:**

- `src/app/m/lagerbuch/verwaltung/(druck)/etiketten/page.tsx` (Mutation 1)
- `src/app/m/lagerbuch/_ui/DruckRahmen.tsx` (Mutation 2)
- `src/app/m/lagerbuch/verwaltung/(arbeit)/wurf/page.tsx` (Schritt 5) — gelöscht

**Wegwerf-Werkzeuge in `/tmp`** (bewusst **nicht** unter `e2e/` oder `_actions/` —
T172 zählt beide Verzeichnisse hart ab):

- `/tmp/t175/run.sh`, `/tmp/t175/marker.sh` — Abrufe und Merkmalsgreps
- `/tmp/t175-farbmodus.mjs` — vier Seiten × zwei Farbmodi + Print-Emulation
- `/tmp/t175-traeger.mjs` — die `.modul`-Sonde für Mutation 2
- `/tmp/t175-wurf.mjs` — der `error.tsx`-Nachweis im Browser
- `/tmp/t175-nav.mjs` — die `usePathname`-Naht nach Hydration
- `/tmp/t175-gate.mjs` — Zeile 1 im gerenderten DOM + `daten.basis` am Bogen

⚠️ Anmerkung zum Werkzeug: das Skript musste als **`.mjs`** laufen, nicht als `.ts`
über `tsx` — esbuild injiziert bei `keepNames` ein `__name`, das im `page.evaluate`-
Kontext des Browsers nicht existiert (`ReferenceError: __name is not defined`). Und
der `@playwright/test`-Import braucht in `/tmp` den absoluten Pfad ins `node_modules`
des Worktrees plus Default-Import (CJS).

**Prüfungstore nach dem Fix:**

```
rtk tsc          → TypeScript: No errors found
pnpm lint        → 0 errors, 5 warnings (alle vorbestehend, keine in den zwei Dateien)
rtk vitest run   → PASS (5781) FAIL (0)
pnpm build       → Errors: 0 | Warnings: 0
git status       → sauber
```

---

## 9. Selbstreview

- **Vollständigkeit:** 32 Tabellenzeilen für 29 `page.tsx` ✓ · 7 Route Handler ✓ (5 selbst,
  2 bei T171, mit Beobachtung am Rande) · je Zeile Status **und** Merkmal ✓ · vier
  Farbmodus-Abrufe ✓ (alle vier selbst im Browser, nicht drei übernommen) ·
  Print-Abruf ✓ · Riegel-Abruf ✓ · Wurf mit Manifest-Messung ✓ · Manifest-Gegentest
  auf dem Portal-Host ✓ (in der Variante **mit** Sitzung, die allein etwas beweist).
- **Ehrlichkeit:** jede Zeile trägt ihre Quelle. Kein Status steht im Protokoll, den
  ich nicht gesehen habe. Wo `curl` strukturell nicht ausreicht (Wurf-Route,
  Farbmodus, Fokusring), steht das ausdrücklich dabei statt eines geschönten Greps.
- **Sauberkeit:** beide Mutationen und die Wurf-Route zurückgebaut; `git status` vor
  jedem Commit leer; `page.tsx`-Zählung wieder 29. `CLAUDE.md` wurde von `next dev`
  **nicht** verändert (der Block stand schon committet drin).
- **Disziplin:** abgerufen und protokolliert. Der einzige Eingriff in den Baum ist
  Fund 5 — ein echter Defekt, gefixt nach W1 mit eigenem Commit und einem Test, der
  gegen die alte Fassung rot läuft.

## 10. Bedenken

1. **Fund 1** — §7.1 führt 23 Zeilen als „Verifiziert in: Teil 5, T151/2", ohne dass
   dazu ein Zeilenprotokoll existiert. Für diesen Task erledigt (selbst gefahren), für
   die Belegkette der Plantabelle nicht.
2. **Fund 2/3/4** — drei Stellen, an denen §7.1 gegen die Implementierung driftet
   (307 vs. 303; zwei Wortlaute). An der **Implementierung** nicht gefixt: das wäre
   eine Fach- oder Textentscheidung an von Teil 4/5 abgenommenen Zeilen. Die
   **Plantabelle** ist in der Fix-Runde nachgezogen (Koordinatorentscheidung zu
   Review-Fund 4) — siehe §11.
3. **Der Brief-Befehl in Schritt 5 kann nicht funktionieren, wie er dasteht** — der
   `curl | grep` findet die zwei `error.tsx`-Texte im Dev-Server nie, weil die Grenze
   client-seitig rendert. Die Aussage stimmt trotzdem, nur ist der Browser das einzige
   Messgerät dafür. Wer den Befehl unbesehen fährt und „nicht gefunden" liest, zieht
   den falschen Schluss.

---

# 11. Fix-Bericht — Review-Runde 1 (sechs Minor-Funde)

**Verdikt:** `review-175-verdikt.md` — Task-Qualität angenommen, Spec-Treue ✅, keine
Critical-, keine Important-Funde. Sechs Minor-Funde, nach Betreiberentscheidung W1
sämtlich behoben.

## 11.1 Was geändert wurde, je Fund

### Review-Fund 3 (der schwerste) — zwei still abgeschwächte Merkmale · **nachgemessen**

Statt die Lücke nur zu benennen, sind beide Merkmale im echten Browser nachgemessen.
Als **Fund 7** in §7 aufgenommen, weil er selbst verursacht ist.

**a) `/verwaltung/geraete/scan` — die vier Zustände einzeln durchgeschaltet**
(`/tmp/t175-scan.mjs`, volle Tabelle in **§1b**). Zuerst der ungeschönte Ist-Zustand:
über `http://` ist `window.isSecureContext` **falsch**, die Insel steigt **vor** dem
zxing-Import aus und zeigt auf beiden Scan-Seiten immer nur den **fünften** Zustand
(`KEIN_SICHERER_KONTEXT`). Dann je Ursache ein Lauf mit präpariertem
`isSecureContext` und einem `getUserMedia`, das die passende `DOMException` wirft:

```
NotAllowedError        → „Der Kamerazugriff wurde abgelehnt. In den Browser-Einstellungen …"
SecurityError          → derselbe Satz
NotFoundError          → „Keine Rückkamera gefunden. Barcode bitte unten eintippen."
OverconstrainedError   → derselbe Satz
NotReadableError       → „Die Kamera wird gerade von einer anderen App benutzt. …"
AbortError             → derselbe Satz
kein DOMException      → „Die Kamera ist nicht verfügbar. Barcode bitte unten eintippen."
```

Vier unterscheidbare Zustände aus sieben Ursachen — die Zusammenfassungen sind Absicht
(§7.6.3: die **Handlung** unterscheidet sich je Ursache). In jedem der fünf Fälle steht
das manuelle Feld samt Knopf „Suchen". ⚠️ Fallstricke, an denen die Messung sonst
viermal denselben Satz gezeigt hätte: `isSecureContext` muss per `addInitScript`
überschrieben werden (sonst greift der Frühausstieg), und der Fehler muss eine echte
`DOMException` sein (eine `Error`-Instanz landet im Fallback).

**b) `/verwaltung/inventur` — der Zähler live** (`/tmp/t175-inventur.mjs`):

```
Ausgangszustand:     Inventur abschließen (0 Abweichungen)
Ist-Felder im DOM:   17
nach 1 Abweichung:   Inventur abschließen (1 Abweichung)     ← Singular
nach 2 Abweichungen: Inventur abschließen (2 Abweichungen)
zurückgestellt:      Inventur abschließen (0 Abweichungen)
Abweichungs-Chip:    "+5" bg rgb(251,241,220) fg rgb(138,82,0)
```

Die Chip-Farben sind `--lb-ampel-gelb-flaeche` (`#fbf1dc`) und `--lb-ampel-gelb-text`
(`#8a5200`) — dieselben Token wie in §3.

**Deckung im Repo:** `_ui/BarcodeScanner.test.tsx:281–380` hält alle Kamerazustände
mit demselben Wortlaut; `InventurForm.test.tsx` deckt den Knopftext. **Kein neuer
Test angelegt.**

### Review-Fund 2 — `requireLagerbuchHost` war vom Protokoll unbelegt

- **(a) Plandatei korrigiert:** Plan:530–532 sagte „auf `localhost` greift
  `requireLagerbuchHost` und jede Zeile antwortete 404". Effekt richtig, Ursache
  falsch — portals `requiresAuth`-Weiche greift vorher, der Riegel wird nie erreicht.
  Ersetzt durch die gemessene Wahrheit **plus** dem Experiment, das den Riegel
  isoliert, **plus** dem Verweis auf die dauerhafte Zusicherung.
- **(b) Zusicherung gesucht — und gefunden, deshalb nichts gebaut:**
  `e2e/lagerbuch-hosts.spec.ts` (`test.describe("Host-Riegel")`, Z. 109–180) prüft
  **15** Einstiege, je 404 auf `feedback.localtest.me` und nicht-404 auf dem eigenen
  Host, angemeldet **mit** Lagerbuch-Gruppe (damit der 404 nicht der Gruppenriegel
  ist), plus Umweg-Ausschluss über die finale URL. Die Lücke war die im Protokoll,
  nicht die in der Abdeckung.
- **Eigene Messung, in §2b aufgenommen:** gleicher innerer Pfad, gleiche Sitzung, nur
  der Host unterscheidet sich — `files.localtest.me` **404**, `portal.localtest.me`
  **404**, `lagerbuch.localtest.me` **200**, für `/m/lagerbuch/verwaltung/artikel`,
  `…/etiketten` und `…/manifest.webmanifest`.

### Review-Fund 5 — die Etikettenzeile war ungesichert

`seedLokal.test.ts`, im **vorhandenen** Block „vergibt feste Codes":
`expect(text).toContain("http://lagerbuch.localtest.me:3000/verwaltung/etiketten")`,
mit der Begründung im Kommentar (es ist die einzige Adresse der Liste, die Token-Codes
im Klartext und als QR zeigt).

### Review-Fund 6 — die Wortlaut-Hälfte war umgehbar, die Behauptung darüber zu stark

Zweierlei getan: das Muster von `not.toContain("keine Route /g/")` auf ein `RegExp`
erweitert, das auch „Route /g/… existiert nicht / gibt es nicht / ist nicht
implementiert" trifft — **und** im Test wie im Bericht (§7, Fund 5) ausgeschrieben,
dass diese Hälfte ausdrücklich umgehbar bleibt und die **positive, datengebundene**
Hälfte die Last trägt. Eine Phrasen-Ratejagd wäre die falsche Reaktion.

### Review-Fund 1 — die Zeilenzahl

„31 Zeilen für 29 Dateien" → **„32 Tabellenzeilen für 29 Dateien"**, mit der Erklärung
im selben Satz: der Plan führt `/g/<bekannt>` als *eine* Zeile, hier steht sie
zweimal, weil beide Zieläste getroffen und einzeln gemessen wurden. Korrigiert in
§1-Überschrift, §1-Fußzeile, §7 und §9. `652b157` kann nur der Nachtrag-Commit
korrigieren — er tut es.

### Review-Fund 4 — §7.1 nachgezogen (Koordinatorentscheidung)

Drei Zeilen der Plantabelle auf den **gemessenen** Zustand, je mit Vermerk „aus T175
nachgezogen" und dem, was gemessen wurde:

| Plan | vorher | nachher |
|---|---|---|
| `/a/<unbekannt>` | „Dieses Etikett gehört zu keinem Artikel mehr." | „Dieses Etikett kennt kein Artikel" + Erklärsatz |
| `/g/<bekannt>` | 303 | **307**, mit beiden gemessenen Zielen; tragendes Merkmal bleibt die relative `Location` |
| `bz/<id>/kontrolle` | Label „Verfallsmonat" | Label **„Kompressen-Verfall"**, gerendert `picker-month` |

Zusätzlich Plan:584 (`geraete/scan`) um den Grund ergänzt, **warum** ein blosser Abruf
die vier Zustände nie zeigt. **Die Implementierung ist unverändert** — die Richtung
ist: die Tabelle folgt dem gemessenen Code, nicht umgekehrt.

### Offene Frage des Reviewers, mitbeantwortet

Verdikt ⚠️ „Ob die fünf lint-Warnungen wirklich vorbestehend sind, zeigt nur ein Lauf
gegen `9acea7e`." — gefahren:

```
git checkout 9acea7e -- .  &&  pnpm lint   →  ✖ 5 problems (0 errors, 5 warnings)
```

**Ja, vorbestehend.** Danach `git checkout HEAD -- .` und `git stash pop`;
`git status` wieder auf den zwei geänderten Dateien.

## 11.2 Geänderte Dateien

| Datei | Was |
|---|---|
| `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md` | §7 Serverabsatz (Fund 2a) · drei Tabellenzeilen (Fund 4) · Scan-Zeile ergänzt (Fund 3) |
| `src/app/m/lagerbuch/_lib/seedLokal.test.ts` | Etiketten-Zusicherung (Fund 5) · Bestreitungs-`RegExp` + ausgeschriebene Tragfähigkeit beider Hälften (Fund 6) |

**Nicht angefasst:** `seedLokal.ts` (der W1-Fix aus `6326006` bleibt, wie er ist),
kein Produktivcode, keine Datei unter `e2e/` oder `_actions/`.

## 11.3 Kommandos und Ausgaben

```
# Rot-Grün, Fund 5 (Etikettenzeile aus seedLokal.ts entfernt)
rtk vitest run src/app/m/lagerbuch/_lib/seedLokal.test.ts     → PASS (14) FAIL (1)

# Rot-Grün, Fund 6 (umformulierte Bestreitung eingesetzt:
#   "⚠️ Die Route /g/<code> existiert nicht in dieser Fassung.")
rtk vitest run src/app/m/lagerbuch/_lib/seedLokal.test.ts     → PASS (14) FAIL (1)
  AssertionError: das Protokoll bestreitet die Existenz von /g/ —
  seit T164 ist das falsch: expected true to be false
# (die alte Fassung `not.toContain("keine Route /g/")` wäre hier GRÜN geblieben)

# beide zurückgenommen, Zustand wie committet
rtk vitest run src/app/m/lagerbuch/_lib/seedLokal.test.ts     → PASS (15) FAIL (0)

# Tests über den geänderten Code
rtk vitest run  _lib/seedLokal.test.ts  scripts/seed-lokal.test.ts \
                _actions/guards.test.ts  _ui/BarcodeScanner.test.tsx
                                                              → PASS (66) FAIL (0)
#   guards.test.ts grün = T172s Zählung (47 Zusicherungen, 18 Dateien,
#   19 Verzeichniseinträge) unberührt

rtk pnpm typecheck                                            → No errors found
rtk pnpm lint                                                 → 0 errors, 5 warnings
                                                                 (vorbestehend, s. o.)
```

`pnpm build` und `pnpm exec playwright test` bewusst **nicht** in dieser Runde — die
Änderung berührt eine Testdatei und eine Markdown-Datei; den vollen Lauf fährt T176.

## 11.4 Selbstreview der Fix-Runde

- Alle **sechs** Minor-Funde adressiert, keiner nur vermerkt.
- **Kein `--amend` an `652b157`.** Die Protokollhistorie bleibt stehen; der Nachtrag
  schreibt aus, was er korrigiert und warum. Zwei Commits, die zusammen die Wahrheit
  sagen, statt eines, der sie nachträglich behauptet.
- **Keine neue Datei**, weder unter `e2e/` noch unter `_actions/` — die Wegwerf-Sonden
  liegen in `/tmp`.
- Beide neuen/geänderten Zusicherungen sind **rot-grün belegt**, nicht nur grün.
- Bei Fund 2 und Fund 3 zuerst geprüft, ob eine Zusicherung schon existiert, **bevor**
  gebaut wurde — in beiden Fällen gab es sie, und es wurde nichts gebaut.

## 11.5 Commits der Fix-Runde

| SHA | Betreff |
|---|---|
| `129f0cc` | `docs(lagerbuch): §7.1 auf den gemessenen Zustand, zwei Zusicherungen nachgezogen` |
| `7cea8e4` | `chore(lagerbuch): Nachtrag zum Abrufprotokoll — Zeilenzahl, zwei Merkmale, der Riegel` (`--allow-empty`) |

`652b157` bleibt unverändert. Arbeitsbaum vor und nach beiden Commits sauber.

**Nachkontrolle gegen den committeten Stand** (die Zahl in `129f0cc` war vor dem
`stash`/`checkout`-Zyklus der Lint-Gegenprobe gemessen — hier noch einmal danach):

```
git stash list                                  → leer (Zyklus sauber aufgelöst)
rtk vitest run  _lib/seedLokal.test.ts  scripts/seed-lokal.test.ts \
                _actions/guards.test.ts  _ui/BarcodeScanner.test.tsx
                                                → PASS (66) FAIL (0)
```

**Markdown-Nachkontrolle der Plandatei** (der einzige committete Nicht-Test-Eingriff):
die vier geänderten Tabellenzeilen (566 `/a/<unbekannt>`, 567 `/g/<bekannt>`,
584 `geraete/scan`, 587 `bz/<id>/kontrolle`) tragen wie alle übrigen Zeilen der
Tabelle **6** Pipes; die neu eingefügte Host-Tabelle im §7-Serverblock ist mit
je **5** Pipes über Kopf, Trenner und drei Datenzeilen wohlgeformt.

---

# 12. Statusmeldung (Fix-Runde 1)

> Zusätzlich hier abgelegt, weil in dieser Sitzung wiederholt Nachrichten verloren
> gehen.

**Status:** DONE_WITH_CONCERNS

**Commits (Fix-Runde):**
- `129f0cc` docs(lagerbuch): §7.1 auf den gemessenen Zustand, zwei Zusicherungen nachgezogen
- `7cea8e4` chore(lagerbuch): Nachtrag zum Abrufprotokoll — Zeilenzahl, zwei Merkmale, der Riegel

*(aus der ersten Runde unverändert: `6326006`, `652b157`)*

**Tests:** `rtk vitest run` über `seedLokal.test.ts`, `scripts/seed-lokal.test.ts`,
`_actions/guards.test.ts`, `_ui/BarcodeScanner.test.tsx` → **PASS (66) FAIL (0)**;
beide geänderten Zusicherungen **rot-grün** belegt; `typecheck` grün; `lint` 0 Fehler /
5 Warnungen, gegen `9acea7e` gegengeprüft und damit **vorbestehend** (offene Frage des
Verdikts beantwortet). `guards.test.ts` grün → T172s Zählung unberührt.

**Alle sechs Minor-Funde behoben** — Fund 3 nicht nur benannt, sondern nachgemessen
(vier Kamerazustände einzeln, Zähler live 0→1→2→0); Fund 2 mit einem Experiment, das
den Host-Riegel isoliert, plus Zitat der vorhandenen E2E-Deckung; kein neuer Test, kein
Produktivcode.

**Bedenken (zwei aus Runde 1, eines neu):**
1. §7.1 führt 23 Zeilen als „Verifiziert in: Teil 5, T151/2" — dahinter steht kein
   Zeilenprotokoll. Für T175 erledigt (selbst gefahren), für die Belegkette nicht.
2. Der `curl | grep` aus Schritt 5 des Briefs kann die `error.tsx`-Texte strukturell
   nie finden. Der Brief ist nicht korrigiert (er ist ein historisches Artefakt und
   git-ignoriert); der Sachverhalt steht im Protokoll und in §4.
3. **Die Kamerawege sind nur über HTTPS prüfbar — und im Cutover-Runbook fehlt die
   Zeile.** Ohne sicheren Kontext gibt es kein `getUserMedia`;
   `/verwaltung/geraete/scan` und `/verwaltung/bz/scan` zeigen über `http://`
   ausschließlich `KEIN_SICHERER_KONTEXT` samt manuellem Feld. **Das ist kein Defekt
   und auch nicht unbekannt:** `_ui/BarcodeScanner.tsx` schreibt es aus („der
   Berührungspunkt mit §3.5.2: über den DIREKTEN Weg (`http://<ip>:<port>`) ist
   `getUserMedia` GAR NICHT verfügbar; der Scanner ist dort strukturell unbenutzbar"),
   und §3.5.2 kennt es. Was fehlt, ist die Folge für den Betrieb:
   `docs/runbooks/lagerbuch-cutover.md` enthält **keine** Zeile dazu (geprüft:
   `grep -n "isSecureContext\|sicherer Kontext\|Kamera"` → kein Treffer). Wer die
   Generalprobe über eine IP oder `http://` fährt, hält die Scan-Seiten für kaputt
   oder für geprüft — beides falsch. Nicht selbst nachgetragen, weil das eine
   Runbook-Entscheidung ist; gehört zu T176.
