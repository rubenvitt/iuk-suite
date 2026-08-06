# T87 — Abnahme Teil 4: die Verschärfung, die Abrufprobe und die Bestandsaufnahme

**BASE** `88a5c52` · **HEAD** `49a77c6` · Branch `feat/lagerbuch-modul-teil4` (nicht verlassen, nicht gepusht)
**Datum** 06.08.2026 · **Next.js** 16.2.11 (Turbopack) · **Vitest** 4.1.10 · **Node** aus mise/24

---

## 1. Umgesetztes

Eine einzige geänderte Datei: `src/app/m/lagerbuch/_lib/bauform.test.ts`. **Es ist keine zweite
Scan-Datei entstanden**, keine Produktionsdatei angefasst, keine E2E-Spec angelegt.

### 1.1 Die Weichen-Verschärfung (E9)

Der Block `„die drei Weichen-Dateien tragen ein PRAEDIKAT, keinen Riegel"` ist **an Ort und Stelle
ersetzt** (nicht dupliziert) durch
`describe("Teil 4, T87 — die Weichen-Dateien existieren UND tragen ein PRAEDIKAT, keinen Riegel")`:

- `PFLICHT` = `page.tsx`, `a/[artikelId]/page.tsx` — je drei `it()`: **existiert**, **ruft
  `requireLagerbuchHost(`**, **benutzt das Prädikat `istLagerbuchAdmin(`, nicht
  `requireLagerbuchAdmin`/`requireHelferSitzung`**.
- `NOCH_NICHT` = `g/[code]/page.tsx` — bleibt Eigenschaftsform, als **`it.runIf(existsSync(pfad))`**,
  mit einem **benannten Einlöser im Kommentar**: Teil 6, T164 (siehe §6.1, Befund 47). Der Lauf meldet
  dafür **übersprungen**, nicht bestanden — „bestanden" wäre für eine Datei, die es nicht gibt, die
  falsche Auskunft, und ein `expect(existsSync(p)).toBe(false)` davor wäre eine Zusicherung, die
  konstruktiv nie fehlschlagen kann (selbst eine der drei verbotenen Formen).
- Der Kopfkommentar der Datei sagt jetzt, **welche zwei Blöcke** die Eigenschaftsform verlassen
  haben; der Satz „ALLE Scans sind in der Eigenschaftsform" wäre ab hier falsch gewesen.

### 1.2 Die Gate-Flächen-Verschärfung (B2, Auflage aus T64)

Neuer erster Test im Block `B2 / Befund 15`:
`expect(flaechen().map(f => f.schluessel)).toEqual(GATE_FLAECHEN)`.

**Die Pflicht sitzt bewusst auf `flaechen()` und nicht auf `existsSync` allein.** `flaechen()`
filtert zweimal — auf Existenz *und* auf `einloeseAbschnitt() !== null`. Eine Fläche, die ihr
`redeemToken(` verliert, fiel bis hierher **still** aus allen drei Reihenfolge-Tests heraus. Gemessen
(Mutation M4 unten): mit der Verschärfung 1 rot, ohne sie 0 rot.

### 1.3 Der dritte Block: Riegelform je Flächenart

`describe("Teil 4, T87 — die Riegelform je Flaechenart, ueber den Baum statt ueber eine Liste")` mit
drei `it()`: alle Route Handler des Moduls nehmen die nicht-werfende Form, `hostAbweisung` selbst löst
auf die nicht-werfende Form auf, und `helfer/layout.tsx` trägt den Sitzungsriegel **ohne** zweiten
Host-Riegel und **ohne** Rahmen.

**Testzahl `_lib/bauform.test.ts`: 31 → 40**, davon 9 neu und 1 übersprungen (`g/[code]`).
Beide Zahlen sind **gemessen**, nicht gerechnet: `git show 88a5c52:…/bauform.test.ts` in den
Arbeitsbaum gelegt und gefahren → `Tests 31 passed (31)`; HEAD → `Tests 39 passed | 1 skipped (40)`.

---

## 2. Jede Abweichung einzeln

| # | Abweichung | Begründung |
|---|---|---|
| A | Der `requireLagerbuchAdmin`-Scan läuft über `ohneKommentare`/`trefferAuf`, nicht über den Rohtext | **Befund 45.** `page.tsx:33` und `a/[artikelId]/page.tsx:43` tragen `requireLagerbuchAdmin()` wörtlich in ihrer Begründung, weil §3.2.1 sie dort haben will. Der abgedruckte Scan wäre deterministisch ROT, und die naheliegende „Reparatur" wäre das Löschen genau dieser Begründung. `ohneKommentare` steht in derselben Datei — **keine lokale Kopie nötig** (N-5 greift hier nicht, weil die Verschärfung in `bauform.test.ts` selbst liegt). |
| B | Der positive Halb prüft `/\bistLagerbuchAdmin\s*\(/` statt `/istLagerbuchAdmin/`, gelesen über `ohneKommentareUndZeichenketten` | **Regel 2.** Beide Dateien *importieren* das Symbol namentlich; ohne Klammer erfüllt schon die Importzeile die Zusage. **Gemessen (M2):** Mutation „Aufruf entfernen, Import stehen lassen" — ohne Klammer kein Fehlschlag (40 passed), mit Klammer rot. Zeichenketten müssen raus, weil ein `toMatch` sonst von einem Textliteral erfüllt wird (die Datei begründet das an ihrer eigenen Helferfunktion). |
| C | `isModuleAdmin` und `moduleAdminPageOrNotFound` stehen **nicht** in der Negativliste | **Regel 4.** Der Block „keine Suite-Admin-Abkürzung im Modul" (`bauform.test.ts`, oberhalb) hält beide bereits **modulweit** über `quellDateien()` und damit strikt stärker. Eine Kopie je Weiche könnte nie auslösen, ohne dass dort schon rot wäre — läse sich aber als eigene Absicherung. `requireHelferSitzung` bleibt in der Liste (es ist im Modul erlaubt, nur in einer Weiche falsch) — der abgedruckte Testkörper hatte es **fallengelassen**, das wäre eine Abschwächung gewesen. |
| D | `helfer/layout.tsx`: `not.toMatch(/requireLagerbuchHost/)` statt `toMatch` | **Befund 46 / Global Constraint 24.** Die Datei ruft heute nur `requireHelferSitzung(getDb())`; T84 hat den doppelten Aufruf entfernt, und T75 erzwingt dieselbe Regel für `_actions/sitzung.ts` mit einem eigenen `not.toMatch`. Der abgedruckte Testkörper hätte eine Regel in zwei entgegengesetzte Dauerzusagen zerlegt. |
| E | Statt der festen Dreierliste der Route Handler ein Scan über den **Baum**, dazu ein eigener Test auf `_lib/hostRiegel.ts` | Zwei Gründe. **(1) Die abgedruckte Form ist rot:** `manifest.webmanifest/route.ts` und `icon-192.png/route.ts` nennen `lagerbuchHostOderNull` gar nicht mehr, sie rufen `hostAbweisung` (Befund 43 hat den Riegel geteilt). **(2) Sie wäre eine reine Kopie** (Regel 4): `pwa.route.test.ts:282` hält die Aussage für alle fünf PWA-Handler, `t/[code]/route.test.ts:421` für den Token-Handler. Der Baum-Scan hält, was keiner der beiden hält: den **achten** Handler, den es heute noch nicht gibt — und den siebten, `abmelden/route.ts` (Teil 2, T26), den beide Listen nicht führen. **Gemessen (M7):** mit einem achten Handler blieben beide Nachbardateien 44/44 grün, der Baum-Scan wurde rot. |
| F | Aufruf 5 der Abrufprobe wurde falsifizierbar gemacht | **Befund 51.** Der Plan nennt weder Status noch Rumpfmerkmal. Gemessen wird jetzt Status **und** die Abwesenheit dreier Lagerbuch-Marken aus `_lib/marke.ts` (`Lagerbuch`, `Bestand, Fahrzeuge, Geräte`, `/pwa-icon.svg`). |
| G | Der `git log`-Beweis für „kein `buchung.ts` aus diesem Plan" ist **ersetzt**, nicht gestrichen | **Befund 51.** Der Befehl druckt in beiden Welten einen Commit. Ersetzt durch die Herkunftsangabe mit Commit-Betreff (§4.3). |
| H | Die Abrufprobe lief auf **Port 3200 statt 3000** und aus einer Arbeitskopie des Baums | Auf 3000 lief bereits ein fremder `next dev` (PID 62743, gestartet 15:34 Uhr, nicht von mir). Next 16 erlaubt zudem **keinen zweiten Dev-Server im selben Verzeichnis** (Lock `.next/dev/lock`). Details und die genaue Kommandozeile in §4.1. |
| I | Die Routenzahl **14** ist nicht bestätigt; gemessen sind **11** | **Befund 49.** Siehe §4.4. |
| J | Es wurden **drei** Bildschirmmessungen protokolliert, nicht zwei | **Befund 50.** (c) ist die einzige Stelle des Plans, an der die Prop-Durchreichung der Aktivmarkierung an einer gerenderten Seite gemessen wird. |
| K | **Zusätzlich gemessen:** der Verwaltungsknopf des Gates | **B-1** der Regeldatei bindet T87 ausdrücklich („ein literaler Prod-Host lässt T87 weiterhin ins Leere laufen"), und der abgedruckte Aufruf 1 prüft nur zwei Wörter. Siehe §4.2, Aufruf 1. |

---

## 3. Mutationsproben (Regel 2 — gefahren, nicht erzählt)

Kommando durchweg `pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts`. Ausgangslage
**39 passed | 1 skipped (40)** (Abnahme: von Anfang an grün, das ist der Punkt).

⚠️ **Wogegen gemessen wurde.** M1–M7 liefen gegen `d9a65b0`, M8 gegen `49a77c6`; die beiden Stände
unterscheiden sich allein im `it.runIf`-Zweig für `g/[code]` (dort meldete der Lauf davor
`40 passed`, danach `39 passed | 1 skipped`) — an keiner der acht Zusicherungen ändert das etwas.
M1 und M2 waren **zuerst** gegen die Fassung gemessen worden, die der `git checkout`-Zwischenfall
(unten) verworfen hat; sie wurden nach der Neuschrift **wiederholt**, damit keine Zahl in dieser
Tabelle auf eine Datei zeigt, die es nicht mehr gibt.

| # | Mutation | Ergebnis |
|---|---|---|
| M1 | `requireLagerbuchHost(kopf);` aus `page.tsx` entfernt | **1 failed \| 39 passed** — `× page.tsx ruft requireLagerbuchHost` · `AssertionError: page.tsx ohne Host-Riegel: expected 'import { headers } from …' to match /\brequireLagerbuchHost\s*\(/` |
| M2a | `if (istLagerbuchAdmin(await viewerOderNull()))` → `if ((await viewerOderNull())?.mutation)` — **Import bleibt stehen** | **1 failed \| 39 passed** — `× page.tsx benutzt das PRAEDIKAT, nicht den Riegel` |
| M2b | dieselbe Mutation, aber Regex auf `/\bistLagerbuchAdmin\b/` abgeschwächt | **40 passed** — der Beleg, dass der Klammer-Anker die Zusicherung trägt und nicht die Namensnennung |
| M3 | `_actions/gate.ts` verschoben (Fläche verschwindet) | **1 failed \| 39 passed** — `× Teil 4, T87 — alle drei Gate-Flaechen existieren UND loesen ein` · `expected [ '_actions/sitzung.ts', …(1) ] to deeply equal [ '_actions/gate.ts', …(2) ]`. **Vor der Verschärfung war genau das 0 failed.** |
| M4 | `redeemToken(` → `redeemTokenX(` in `t/[code]/route.ts` (Datei existiert, löst nicht mehr ein) | **1 failed \| 39 passed** — derselbe Test. Die drei Reihenfolge-Tests darunter blieben **grün**: genau der zweite, stille Ausgang, den `existsSync` allein offengelassen hätte. |
| M5 | `requireLagerbuchHost(await headers());` in `helfer/layout.tsx` eingesetzt (die vom Plan gedruckte Form) | **1 failed \| 39 passed** — `AssertionError: Global Constraint 24 — der Riegel ruft den Host-Riegel intern: expected … not to match /\brequireLagerbuchHost\b/` |
| M6 | `hostAbweisung` auf die werfende Form umgestellt | **1 failed \| 39 passed** — `× hostAbweisung selbst loest auf die nicht-werfende Form auf` |
| M7 | achter Route Handler `probe-m7/route.ts` mit `requireLagerbuchHost` angelegt | **1 failed \| 39 passed**, beide Verstöße namentlich gemeldet. **Gegenprobe:** `pwa.route.test.ts` + `t/[code]/route.test.ts` im selben Zustand **44/44 grün** — der Beleg für Abweichung E. |
| M8 | `g/[code]/page.tsx` als Attrappe angelegt (ohne Host-Riegel, ohne Prädikat) | **1 failed \| 39 passed** — `× g/[code]/page.tsx: falls vorhanden, traegt sie die Regel`. Der Beleg, dass der `it.runIf`-Zweig **anläuft**, sobald Teil 6 die Datei baut, und nicht auf Dauer stillsteht. |

Alle sieben Mutationen wurden zurückgenommen; `git status` zeigt danach nur
`_lib/bauform.test.ts`.

> **Zwischenfall, ehrlich protokolliert:** beim Zurücknehmen von M2 habe ich
> `git checkout -- … _lib/bauform.test.ts` mitlaufen lassen und damit **meine eigene, noch nicht
> committete Verschärfung verworfen**. Sie wurde vollständig neu geschrieben, danach lag eine
> Sicherungskopie im Scratchpad, und alle weiteren Mutationen wurden ohne `git checkout` auf dieser
> Datei zurückgenommen. Der Endzustand ist der committete; kein Verlust.

---

## 4. Die Abrufprobe — das Protokoll

**06.08.2026, Next.js 16.2.11 (Turbopack), Dev-Server aus dem Arbeitsbaum @ `d9a65b0` (inhaltsgleich mit `49a77c6` bis auf den `it.runIf`-Zweig, der keine Laufzeitwirkung hat).**

### 4.1 Was gefahren wurde und warum nicht wie abgedruckt (Befund 48 + Abweichung H)

`webServer.env` aus `playwright.config.ts` ist Playwrights Prozessumgebung; ein blankes `pnpm dev`
erbt davon nichts, und `_lib/grenzen.ts` wirft ohne `LAGERBUCH_HELFER_SITZUNG_SECRET` — Aufruf 3 wäre
ausgefallen. Die Werte stammen aus `e2e/helpers/lagerbuch.ts` (`LAGERBUCH_ENV`, neun Zeilen) und
wurden **vollständig** gesetzt, nicht nur die drei genannten; die Kopplungsprüfungen aus §10.5 greifen
sonst vor dem ersten Abruf.

Zwei Umgebungshindernisse und ihre Behandlung:

1. **Port 3000 war belegt** von einem fremden `next dev` (PID 62743 / `pnpm dev` 62673, gestartet
   06.08. 15:34). Ich habe ihn **nicht** angefasst.
2. **Next 16 lässt keinen zweiten Dev-Server im selben Verzeichnis zu**
   (`node_modules/next/dist/build/lockfile.js:181`, Lock `.next/dev/lock`). Deshalb lief die Probe in
   einer **Arbeitskopie des Baums** im Scratchpad (`rsync` ohne `node_modules/.next/.git/.data`, dann
   `pnpm install --frozen-lockfile`), auf **Port 3200**, gegen die **echte** Modul-Datenbank unter
   `DATA_DIR=<repo>/.data/t87`. Die Quellen sind byte-gleich mit dem Arbeitsbaum.
   *Nebenbefund ohne Produktbezug:* außerhalb des Original-Installationsorts fehlte
   `node_modules/@swc` (pnpm-Hoisting); ein Symlink auf `.pnpm/node_modules/@swc` behob es. Kein
   Befund am Modul.

Seed und Start, wörtlich:

```bash
env DATA_DIR=./.data/t87 SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me \
    SUITE_ADMIN_GROUP_LAGERBUCH=lagerbuch_nutzer \
    LAGERBUCH_HELFER_SITZUNG_SECRET=e2e-helfer-secret-nicht-produktiv-32z \
    pnpm exec tsx e2e/seed-lagerbuch.ts
# → [e2e] lagerbuch migriert + geseedet: ./.data/t87/lagerbuch.db

env DATA_DIR=<repo>/.data/t87 \
    SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me \
    SUITE_ADMIN_GROUP_LAGERBUCH=lagerbuch_nutzer \
    LAGERBUCH_HELFER_SITZUNG_SECRET=e2e-helfer-secret-nicht-produktiv-32z \
    LAGERBUCH_VERFALL_ROT_TAGE=31 LAGERBUCH_VERFALL_GELB_TAGE=56 \
    LAGERBUCH_HELFER_SITZUNG_STUNDEN=12 \
    LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=5 \
    LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=30 \
    LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=300 \
    node node_modules/next/dist/bin/next dev -p 3200
```

⚠️ **Für die `.env` gilt die Kopplung**: sobald `SUITE_HOST_LAGERBUCH` gesetzt ist, sind
`LAGERBUCH_HELFER_SITZUNG_SECRET` und `SUITE_ADMIN_GROUP_LAGERBUCH` **harte Startbedingungen der
ganzen Suite** — fehlt eine, bricht der Container ab, portal und feedback inklusive. Die drei Zeilen
gehören zusammen in eine Datei, nicht einzeln.

### 4.2 Die sieben Aufrufe

| # | Aufruf | Erwartung | **Gemessen** | ✓ |
|---|---|---|---|---|
| 1 | `GET http://lagerbuch.localtest.me:3200/` | 200, HTML mit `Im Dienst` **und** `Verwaltung` | `status=200`, je 1 Treffer für `Im Dienst` und `Verwaltung` | ✓ |
| 1b | **(zusätzlich, B-1)** derselbe Abruf, Ziel des Verwaltungsknopfs | eigene Origin, **nicht** der Prod-Literal | `href="/login?callbackUrl=http%3A%2F%2Flagerbuch.localtest.me%3A3200%2Fverwaltung"` — aus `verwaltungsZiel(kopf)` gebaut, nimmt der B3-reparierte Dev-Login an | ✓ |
| 2 | `GET …/?grund=code` | HTML enthält `Dieser Code ist unbekannt oder wurde gesperrt.` | `status=200`, Satz 1×, wörtlich | ✓ |
| 3 | `GET …/t/111-111` | 303, `Location: /helfer` relativ, `Set-Cookie: helfer_session=…` **ohne** `Domain=` | `HTTP/1.1 303 See Other` · `location: /helfer` · `set-cookie: helfer_session=eyJhbGciOiJIUzI1NiJ9…; Path=/; Expires=Fri, 07 Aug 2026 03:55:23 GMT; Max-Age=43200; HttpOnly; SameSite=lax` — **kein `Domain=`**. Gegenprobe im selben Kopf: `authjs.callback-url=…; Domain=.localtest.me` — die Messung *könnte* ein `Domain=` sehen, sie sieht hier keins. | ✓ |
| 4 | `GET …/manifest.webmanifest` | 200, `Content-Type: application/manifest+json` | `status=200 bytes=509`, `content-type: application/manifest+json`, Rumpf beginnt `{"name":"Lagerbuch · DRK Bereitschaft Musterstadt",…}` | ✓ |
| 5 | `GET http://portal.localtest.me:3200/manifest.webmanifest` | **falsifizierbar gemacht:** Status notieren, Rumpf ohne jede Lagerbuch-Marke | `status=307 bytes=42`, `location: /login?callbackUrl=%2Fmanifest.webmanifest`; Treffer für `Lagerbuch` = **0**, für `pwa-icon.svg` = **0**, für `Bestand, Fahrzeuge, Geräte` = **0**. Das Portal liefert also **kein** Manifest, sondern schickt in den Login — in keinem Fall das lagerbuch-Manifest. | ✓ |
| 6 | `curl -sio /dev/null -w '%{http_code} %{size_download}' …/icon-192.png` | `200 1558` | `200 1558` (zeichengleich) | ✓ |
| 7 | `GET http://feedback.localtest.me:3200/m/lagerbuch/helfer` | 404 | `HTTP/1.1 404 Not Found` — **und zwar aus der richtigen Schicht** (nachgesehen, weil Aufruf 5 zeigt, wie leicht eine Probe aus dem falschen Grund besteht): `core/routing.ts:57-66` erkennt den bereits präfixierten Pfad, `lagerbuch` hat `requiresAuth: false`, also `action: "next"` — kein Login, kein `forbidden`, und `src/proxy.ts` kennt überhaupt kein 404. Der 404 entsteht **im Modul**, aus `requireHelferSitzung` → `requireLagerbuchHost` → `notFound()`. Genau Falle 61. | ✓ |

### 4.3 Die DREI Bildschirmmessungen (Befund 50), 2 Breiten × 2 Seiten = 12 Datenpunkte

Cookie über echte Navigation auf `/t/111-111` geholt (303 → `/helfer` in einem Zug), Chrome mit
Viewport-Emulation.

| Seite | Viewport | (a) `[data-testid="lb-tableiste"]` im Sichtbereich | (b) `scrollWidth === clientWidth` | (c) genau **ein** `a[aria-current="page"]`, Text |
|---|---|---|---|---|
| `/helfer` | 390×844 (mobile, DPR 3) | ✓ `top 784 / bottom 844`, Höhe 60, `innerHeight 844` | ✓ 390 = 390 | ✓ 1 × „**Entnahme**", `href="/helfer"` |
| `/helfer/check` | 390×844 | ✓ `top 784 / bottom 844` | ✓ 390 = 390 | ✓ 1 × „**Fahrzeug-Check**", `href="/helfer/check"` |
| `/helfer` | 1280×720 | ✓ `top 660 / bottom 720` | ✓ 1280 = 1280 | ✓ 1 × „**Entnahme**" |
| `/helfer/check` | 1280×720 | ✓ `top 660 / bottom 720` | ✓ 1280 = 1280 | ✓ 1 × „**Fahrzeug-Check**" |

(a) und (b) sind zwei verschiedene Aussagen: `scrollHeight === clientHeight` in allen vier Fällen,
also kein Überlauf nach unten — genau das, was (b) allein nicht sähe (Falle 41).
(c) ist **Vorprüfung**: die Prop wird durchgereicht und die Markierung wechselt mit der Seite. Der
belastbare Nachweis für Falle 63 fährt **unter dem Rewrite** und gehört zu Teil 6, T171.

### 4.4 Die Bestandsaufnahme — mechanisch nachgezählt

**Die zehn Zeilen des Plans sind zehn DATEIEN.** `ls` über die Liste: **10** — bestätigt.

**Routen: gemessen 11, nicht 14** (Befund 49). Die Build-Ausgabe listet unter `/m/lagerbuch`
**elf** Zeilen (von 67 Routenzeilen der ganzen Suite):

```
/m/lagerbuch · /m/lagerbuch/a/[artikelId] · /m/lagerbuch/abmelden · /m/lagerbuch/helfer
/m/lagerbuch/helfer/check · /m/lagerbuch/icon-192.png · /m/lagerbuch/icon-512.png
/m/lagerbuch/icon-maskable-512.png · /m/lagerbuch/manifest.webmanifest
/m/lagerbuch/pwa-icon.svg · /m/lagerbuch/t/[code]
```

**Zwei unabhängige Herleitungen, beide auf 11:**

1. **10** aus der Dateiliste dieses Plans **+ 1** (`/abmelden`, Teil 2 T26 — in der Aufstellung des
   Plans nicht enthalten).
2. **7 Route Handler** (`t/[code]`, `abmelden`, `manifest.webmanifest`, `pwa-icon.svg` und die drei
   PNG) **+ 4 Seiten** (`/`, `/a/[artikelId]`, `/helfer`, `/helfer/check`) = **11**. Die 7 ist
   dieselbe Zahl, die der neue Baum-Scan als Untergrenze zusichert.

`layout.tsx` und `helfer/layout.tsx` sind **keine** Routen.
Die Zahl **14** entsteht nur durch Doppelzählung: `/helfer` und `/helfer/check` sind in den zehn
bereits enthalten, „zusätzlich" ist sachlich falsch. **Wer 14 braucht, muss neu herleiten.**

**Actions: 3 Dateien, 4 Deklarationen** — `gate.ts` 1, `sitzung.ts` 2, `check.ts` 1. Bestätigt.

**`_actions/buchung.ts` stammt NICHT aus diesem Plan** (Ersatz für den nicht tragenden `git log`,
Befund 51):

```
d5b1cf1 2026-08-06 feat(lagerbuch): _actions/buchung.ts — Zugang, Entnahme, Helfer-Entnahme
6b48c8e 2026-08-06 feat(lagerbuch): der gemeinsame Rueckgabetyp der Actions (nur _lib/actionErgebnis.ts)
```

Beides ist **Teil 5, T114 bzw. T113, vorgezogen** — Auflage **A2** verlangt genau das, weil sonst
`pnpm typecheck` und `pnpm build` an einer Importzeile in T83 scheitern. `buchung.ts` trägt drei
Deklarationen; sie zählen zu Teil 5, nicht zu den vier dieses Plans.

**Der Variablensatz von `_ui/helfer.module.css` — gezählt, nicht delegiert** (nachgereicht in
Fix-Runde 1, Befund 1; siehe §9.1 für die Mutationen):

| Träger | Neutrale | `--lb-ampel-*` | Summe |
|---|---|---|---|
| Hellblock `.rahmen` (Z. 33–79) | **15** — 12 Farben (Z. 36–47) **+** die drei Schriftstapel `--lb-display`/`--lb-body`/`--lb-mono` (Z. 64–66) | **8** (Z. 55–62) | **23** |
| Dunkelblock `:root[data-theme="dark"] .rahmen` (Z. 91–113) | **12** (Z. 92–103) | **8** (Z. 105–112) | **20** |

Die Differenz sind **genau die drei Schriftstapel**. Sie sind moduskonstant, und
`bauform.test.ts:510` nimmt sie im Dunkelzweig ausdrücklich aus
(`NEUTRALE.filter((n) => !/display|body|mono/.test(n))`), mit der Begründung im Kommentar darüber.

**Die „fünfzehn" der Abschluss-Abnahme ist RICHTIG** und deckt sich zeichengleich mit `NEUTRALE` in
`bauform.test.ts:473-477` (12 Farbnamen + 3 Schriftstapel) und mit dem Titel des Scans selbst
(`bauform.test.ts:493`). Der Kommentar `helfer.module.css:34` („Die zwoelf Neutralen") beschriftet
die **Farbgruppe unter sich**, nicht die Liste des Scans; `task-64-report.md:71-72` hat beide Zahlen
schon beim Bau nebeneinandergestellt: „Beides stimmt: 12 Farben + 3 Schriftstapel."

⚠️ **Unscharf ist allein das „in beiden Modi" des Abnahme-Punkts.** Fünfzehn gilt **hell**, zwölf
**dunkel** — und das ist gewollt, nicht ein Mangel. Wer den Satz wörtlich liest und die drei
Schriftstapel in den Dunkelblock nachträgt, ändert nichts an einer Zusicherung (Gegenprobe M11
unten: 39 passed | 1 skipped, unverändert) und baut drei moduskonstante Werte doppelt.

**Das Urteil, damit niemand es neu fällen muss: der Abschluss-Abnahme-Punkt ist ABGEHAKT** — in der
Lesart, die `_lib/bauform.test.ts` erzwingt und die als einzige mechanisch gedeckt ist: **15 Neutrale
+ 8 Ampelwerte hell** (`:493`, grün) und **die zwanzig Farbnamen dunkel** (`:504`, grün). Falsch ist
**allein der Wortlaut** „in beiden Modi" im Brief — ein Formulierungsmangel des Abnahme-Punkts, **kein
Mangel der Datei** und kein offener Rest. Wer Teil 5 zieht, muss hier nichts nachmessen und nichts
nachtragen.

**Was hier NICHT belegt werden kann, und warum:** „T100 ist danach **ohne jede Änderung** grün" (A3)
ist auf diesem Branch **strukturell unprüfbar** — beide Subjekte fehlen: `_lib/ampel.test.ts` gibt es
nicht (`ls` → `No such file or directory`), und `_ui/verwaltung.module.css` gibt es nicht (die einzige
`.css` unter `_ui/` ist `helfer.module.css`). Gezählt ist hier der **Namensbestand**, den A3 als
Prämisse hat; **grün** wird T100 dort bewiesen.

**Nicht angelegt, wie zugesagt:** `e2e/lagerbuch-helfer.spec.ts` (Teil 6, T171) und
`g/[code]/page.tsx` (Teil 6, T164) — beide auf der Platte nicht vorhanden.

### 4.5 Die vier Gates

| Gate | Ergebnis |
|---|---|
| `pnpm typecheck` | **grün** (exit 0) |
| `pnpm lint` | **grün** — 0 Fehler, 6 Warnungen (alle vorbestehend, keine im Lagerbuch-Modul) |
| `pnpm vitest run` | **grün** — 247 Dateien, **4352 Tests**, 0 fehlgeschlagen |
| `pnpm build` | **grün**; `next-env.d.ts` danach zurückgesetzt (N-6), Baum sauber |

---

## 5. Die Auflage aus T64, geprüft (nicht behauptet)

`einloeseAbschnitt()` deckt **Position**, nicht Bedingtheit, und sagt nichts über „Erfolg → Cookie"
und „kein Budgetverbrauch im Erfolgsfall". Die Auflage lautete, dass die mock-basierten Unit-Tests
das tragen. **Nachgesehen — sie tragen es:**

| Fläche | „Erfolg → Cookie" | „kein Budgetverbrauch" |
|---|---|---|
| `_actions/gate.ts` (T73) | `gate.test.ts:240` „setzt das Sitzungs-Cookie und leitet an das Code-Ziel" | `:287` „verbraucht KEIN Budget — fünf Erfolge in Folge schließen das Gate nicht" |
| `_actions/sitzung.ts` (T74) | `sitzung.test.ts:272` „setzt ein FRISCHES Cookie mit voller Gültigkeit" | `:304` „verbraucht KEIN Budget — fünf Erneuerungen in Folge …" |
| `t/[code]/route.ts` (T82) | `route.test.ts:259` „antwortet 303 mit RELATIVEM Location und setzt das Cookie auf DIESER Antwort" | `:319` „verbraucht KEIN Budget" |

`page.tsx` (T81) löst selbst nicht ein und steht deshalb zu Recht **nicht** in `GATE_FLAECHEN`.

---

## 6. Bestandsaufnahme für Teil 5 und Teil 6 — damit sie nichts neu herleiten müssen

### 6.1 Was dieser Branch an Teil 6 auflegt

| # | Auflage | Warum sie sonst ausfällt |
|---|---|---|
| **T6-1** | **Wer `g/[code]/page.tsx` baut (T164, dort J3), überführt sie aus `NOCH_NICHT` in `PFLICHT`** in `_lib/bauform.test.ts` — drei Zeilen. | Befund 47: E9 verweist für die Weiterführung auf „§6", und §6.3 führt sie unter seinen vier namentlich zugewiesenen Auflagen **nicht**. Ohne Zuständigen ist die `NOCH_NICHT`-Schleife ein Dauer-No-op. Die Zuständigkeit steht jetzt **im Kommentar an der Stelle selbst**, nicht nur im Plan. |
| **T6-2** | **`e2e/lagerbuch-helfer.spec.ts` bleibt T171s Datei** — dieser Plan hat sie nicht angelegt und **behauptet nichts über den Mehrhost-Fall**. | Falle 16 unter zwei Hosts und Falle 63 unter dem Rewrite sind in Vitest strukturell nicht darstellbar. T87 hat die **Form** des 303 und die **Prop-Durchreichung auf einem Host** gemessen — mehr nicht (§4.2 Aufruf 3, §4.3 Spalte c). |
| **T6-3** | Wer eine **vierte Gate-Fläche** baut, trägt sie in `GATE_FLAECHEN` ein (N-3), und wer sie als Route Handler baut, nimmt sie in `HOST_FORM` auf. | Der Reihenfolge-Scan ist eine feste Dreierliste, kein Sammler; seit T87 ist sie zusätzlich eine **Existenzpflicht** — ein Eintrag ohne Datei ist ab jetzt rot, nicht mehr still grün. |
| **T6-4** | Die Routenzahl **14** ist nicht belegt; gemessen sind **11** (§4.4). Wer sie in Teil 6 §2.1 fortschreibt, zählt neu. | Doppelzählung, Befund 49. |

### 6.2 Was dieser Branch an Teil 5 auflegt

| # | Auflage | Stand |
|---|---|---|
| **T5-1 (A2)** | `_actions/buchung.ts` (T114) und `_lib/actionErgebnis.ts` (T113) sind **vorgezogen und eingecheckt** (`d5b1cf1`, `6b48c8e`). Teil 5 legt sie **nicht** noch einmal an. | erledigt |
| **T5-2 (A1)** | `bucheEntnahmeHelfer` gibt `HelferErgebnis<{gebucht:number}>`, und `gebucht === 0` ist `{ok:false, grund:"leer", …}` — nicht „200, das lügt". | liegt bei T114; nicht Gegenstand dieser Abnahme |
| **T5-3 (A3)** | `_lib/ampel.test.ts` (T100) muss **ohne jede Änderung** über `_ui/verwaltung.module.css` **und** `_ui/helfer.module.css` grün sein. | **Die Namen sind hier gezählt und in beiden Modi vollständig** (§4.4): hell 15 Neutrale + 8 `--lb-ampel-*`, dunkel 12 + 8 = die zwanzig Farbnamen; die drei Schriftstapel sind moduskonstant und im Dunkelzweig ausdrücklich ausgenommen (`bauform.test.ts:510`). **Grün** wird T100 **dort** bewiesen — und nur dort: `_lib/ampel.test.ts` und `_ui/verwaltung.module.css` existieren auf diesem Branch beide **nicht**, die Prämisse von A3 ist damit hier gezählt, ihr Vollzug ist nicht darstellbar |
| **T5-4** | `_ui/ikonen.tsx` (T101) hebt die lokalen Inline-`<svg>` per **reinem Import-Tausch**; **kein** Test dieses Plans sichert ein `d`-Attribut zu. Die Ausnahme „Zeichen ohne Text" bleibt der **Taschenlampenschalter** (N-7), mit `aria-label` + `aria-pressed` am Knopf. | vorbereitet |
| **T5-5 (B4)** | `HelferGrund` trägt seit diesem Branch den fünften Wert `"eingabe"`; die Konsumenten in Teil 5 müssen ihn **anzeigen** können. `darfErneuern("eingabe") === false`. | additiv erledigt |

### 6.3 Die drei Runbook-Eingaben (R1–R3) — unverändert offen, hier zusammengefasst

- **R1 (teuerste):** `APP_BASE_URL` im Wortlaut, und die Bestätigung, dass `SUITE_HOST_LAGERBUCH`
  **zeichengleich derselbe Host** ist. `helferCookieOptionen()` setzt `path:"/"` **ohne** `domain` —
  **in Aufruf 3 heute gemessen und bestätigt**. Weicht der neue Host ab, endet jede laufende
  Feld-Sitzung beim Cutover, und kein Test sieht das. Dann gehört in die Cutover-Kommunikation:
  „alle Helfer müssen ihr Kärtchen einmal neu scannen."
- **R2:** nach dem Umschwenken `curl -si https://lagerbuch.iuk-ue.de/manifest.webmanifest` und
  `/icon-192.png` gegen §7.10.2 halten (heute lokal: `200 application/manifest+json` und
  `200 1558`), und `https://<portal-host>/manifest.webmanifest` darf das lagerbuch-Manifest **nicht**
  liefern (lokal: 307 in den Login, null Lagerbuch-Marken).
- **R3:** Generalprobe auf **einem** Gerät: PWA installieren, im Browser einlösen, Regaletikett mit
  der Systemkamera scannen. Keine Codeantwort — auf iOS führt das Startbildschirm-Fenster eine eigene
  Speicherpartition.

### 6.4 Was T87 ausdrücklich **nicht** belegt

Der Mehrhost-Fall von Falle 16, `aria-current` unter dem Rewrite (Falle 63), das Verhalten hinter
einer echten Anmeldung, und alles, was zwei Hosts **gleichzeitig** braucht. Das ist Teil 6, T171
(A4). Diese Abnahme hat **einen** Server auf **einem** Port gesehen.

---

## 7. Selbst-Review

**Vollständigkeit.** Alle sechs Schritte des Briefs sind gefahren; die sieben Vorabbefunde (45–51 und
B-1) sind einzeln abgearbeitet und in §2 namentlich zugeordnet. Die vom Brief zusätzlich verlangte
Prüfung der T64-Auflage steht in §5.

**YAGNI.** Drei `describe`-Blöcke, alle in der bestehenden Datei; keine neue Scan-Datei, keine neue
Helferfunktion, keine Produktionsdatei angefasst. `ohneKommentare` wurde **nicht** kopiert, weil die
Verschärfung in derselben Datei liegt (N-5 greift nur für fremde Testkörper).

**Testgüte.** Kein `it()` ohne `expect` — auch der `NOCH_NICHT`-Zweig sichert die Nicht-Existenz
ausdrücklich zu, statt still zurückzukehren. Keine Schleife ohne Mindestzahl: der Baum-Scan hat
`expect(handler.length).toBeGreaterThanOrEqual(7)`. Keine Zusicherung gegen eine selbst gebaute
Zeichenkette: die linke Seite von `toEqual(GATE_FLAECHEN)` kommt aus `existsSync` + `readFileSync`.
Sieben Mutationen gefahren, alle rot in genau dem Test, der die Regel trägt.

**Wo die Zusicherungen dünn bleiben, benannt statt weggeschrieben:**

1. Der Weichen-Block prüft **Vorhandensein** des Host-Riegels, nicht seine **Position** als erste
   Anweisung. Für die Weichen gibt es keinen `ersteRumpfanweisung`-Test wie bei den PWA-Handlern.
2. Der Baum-Scan sieht `hostAbweisung(` als Erfüllung, ohne zu prüfen, dass es **kurzschließend**
   (`??`) benutzt wird. Das hält `pwa.route.test.ts:259` für die fünf PWA-Handler; für
   `abmelden/route.ts` hält es niemand.
3. `helfer/layout.tsx` hat weiterhin **keinen eigenen Testkörper**; die drei Aussagen dieses Blocks
   sind Quelltext-Aussagen, kein Verhalten. Das Verhalten wäre nur über einen echten Abruf ohne
   Cookie sichtbar — Teil 6.

---

## 8. Bedenken

1. **Die Abrufprobe ist nicht wiederholbar, solange ein fremder `next dev` im Repo läuft.** Next 16
   verweigert den zweiten Dev-Server pro Verzeichnis. Wer sie nachfahren will, stoppt entweder den
   laufenden Server oder wiederholt den Arbeitskopie-Weg aus §4.1. Das gehört ins Runbook, sonst
   probiert es der Nächste zwanzig Minuten lang.
2. **Aufruf 5 beweist weniger, als es aussieht.** Das Portal liefert heute gar kein Manifest, sondern
   307 in den Login — die Aussage „nicht das lagerbuch-Manifest" ist damit erfüllt, aber der Riegel
   wird dabei **nicht wirklich auf die Probe gestellt**, weil der Auth-Redirect vorher greift. Die
   harte Probe ist R2 nach dem Cutover, gegen einen Portal-Host, der ein eigenes Manifest hat.
3. **`istLagerbuchAdmin(` bleibt eine Schreibweisen-Prüfung.** Ein Verhaltenstest wäre möglich
   (`page.test.tsx` mountet die Seite ohnehin) — er existiert dort auch —, dieser Scan ist die
   modulweite Klammer darüber. Wer ihn für den eigentlichen Träger hält, irrt; er ist der zweite
   Riegel.
4. **Die Bildschirmmessung lief unter Chrome-Emulation, nicht auf einem Gerät.** 390×844 mit DPR 3
   und `mobile,touch` ist nah dran, aber die Software-Tastatur und Safaris dynamische Adressleiste
   sind damit nicht gemessen — und genau die sind die Ursache von Falle 41 auf echten Geräten. R3
   deckt das ab, kein Test tut es.
5. **Das Sitzungsgeheimnis der Probe steht im Klartext in diesem Protokoll** — es ist der E2E-Wert
   aus `e2e/helpers/lagerbuch.ts`, ausdrücklich „nicht produktiv". Der produktive Wert ist eine
   Betreiber-Entscheidung (R1) und darf nirgends in einem Bericht landen.

---

# 9. Fix-Runde 1 — Befund 1 (Important)

**Übernehmender Umsetzer** (der Vorgänger ist nicht mehr erreichbar) · **06.08.2026** ·
BASE `49a77c6` · Branch `feat/lagerbuch-modul-teil4` (nicht verlassen, nicht gepusht).

## 9.1 Befund 1 — der Abnahme-Punkt „fünfzehn Neutrale" wurde delegiert statt gemessen

**Was verlangt war.** §6.2 T5-3 schrieb „der Nachweis fällt in T100" und ließ damit den einzigen
Abschluss-Abnahme-Punkt zum Variablensatz ungemessen stehen. Das ist genau die Delegation, die die
Bestandsaufnahme für Teil 5 verhindern soll. **Der Befund trägt** — und ich habe ihn behoben.

**Geändert (kein Codeeingriff, wie der Befund es vorsieht):**

1. **§4.4** — eine gemessene Tabelle über beide Träger ergänzt (Zeilenbereiche, Zahlen, Summen), plus
   die Begründung der Differenz und die **benannte Absenz**, warum „T100 grün" hier nicht darstellbar
   ist.
2. **§6.2, Zeile T5-3** — von „der Nachweis fällt in T100" auf „die Namen sind hier gezählt und in
   beiden Modi vollständig; grün wird T100 dort bewiesen" umgestellt, mit der Absenz beider Subjekte.

### ⚠️ Abweichung vom Wortlaut des verlangten Fixes — die Zahl „zwölf" wird ZURÜCKGEWIESEN

Der Review verlangt wörtlich den Satz „Die Zahl fünfzehn aus der Abschluss-Abnahme ist falsch — es
sind zwölf". **Diesen Satz habe ich nicht geschrieben, weil er selbst falsch ist** und eine neue
falsche Zahl in dasselbe Protokoll trüge — dieselbe Fehlerklasse, gegen die der Befund gerichtet ist.
Er schickte den nächsten Umsetzer auf die Suche nach drei Variablen, die es **gibt**, nämlich in
`helfer.module.css:64-66`.

Vier voneinander unabhängige Primärquellen, alle auf **15 = 12 + 3**:

| # | Quelle | Wortlaut |
|---|---|---|
| 1 | `src/app/m/lagerbuch/_lib/bauform.test.ts:473-477` | `NEUTRALE` hat **15** Einträge: die 12 Farbnamen **und** `--lb-display`, `--lb-body`, `--lb-mono` |
| 2 | `src/app/m/lagerbuch/_lib/bauform.test.ts:493` | der Scan heißt selbst „`.rahmen` traegt alle **fuenfzehn** Neutralen UND die acht Ampelwerte" — und er ist grün |
| 3 | `src/app/m/lagerbuch/_ui/helfer.module.css:64-66` | die drei Schriftstapel stehen **im Körper von `.rahmen`**, nicht daneben |
| 4 | `.superpowers/sdd/2026-08-03-lagerbuch-modul-teil4/task-64-report.md:71-72` | schon beim Bau festgehalten: „Die Kommentare des Briefs sprechen von ‚fünfzehn Neutralen', die CSS-Kommentare von ‚zwölf'. **Beides stimmt: 12 Farben + 3 Schriftstapel.**" |

Der Kommentar `helfer.module.css:34` („Die zwoelf Neutralen") ist **keine Widerlegung**: er beschriftet
die Farbgruppe **unter sich** (Z. 36–47), nicht die Liste, gegen die der Scan läuft.

Was am Abnahme-Punkt **tatsächlich** unscharf ist, steht jetzt in §4.4: das **„in beiden Modi"**.
Fünfzehn gilt hell, zwölf dunkel — gewollt, weil die drei Schriftstapel moduskonstant sind.

Ebenfalls abgewichen, weil nachgemessen: die im Review genannten Zeilenbereiche **Z. 39–62** und
**Z. 91–113** für die Deklarationen treffen nicht. Gemessen sind **36–47** (Farben hell), **55–62**
(Ampel hell), **92–103** (Farben dunkel), **105–112** (Ampel dunkel); `91–113` ist der Umfang der
Dunkel-**Regel** samt Selektor und Klammern, nicht der Deklarationen.

### Die gefahrenen Mutationen (Regel 2 — gefahren, nicht erzählt)

Kommando durchweg `pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts`. Ausgangslage
**39 passed | 1 skipped (40)** (`task-87-fix1-logs/m0-baseline.txt`, exit 0).

⚠️ **Der Befund ist doku-only — es gibt keine Zeile Code, die man mutieren könnte.** Mutiert wurde
deshalb der **Gegenstand der Behauptung**: die CSS-Datei. Die Frage, die diese drei Proben
beantworten, ist genau die des Befunds — **trägt die Zahl, die im Protokoll steht?**

| # | Mutation | Ergebnis | Was sie beweist |
|---|---|---|---|
| **M9** | `--lb-display` aus dem **Hell**block `.rahmen` entfernt (Z. 64) | **1 failed \| 38 passed \| 1 skipped** — rot ist `.rahmen traegt alle fuenfzehn Neutralen UND die acht Ampelwerte`, mit `AssertionError: --lb-display fehlt unter .rahmen: expected … to match /--lb-display\s*:/` (`bauform.test.ts:500`) | **Der Hellblock trägt fünfzehn, nicht zwölf.** Wäre die Zahl zwölf, wie der Review schreibt, wäre diese Mutation folgenlos. Sie ist es nicht. |
| **M10** | `--lb-ampel-grau-flaeche: #1c2024;` aus dem **Dunkel**block entfernt | **1 failed \| 38 passed \| 1 skipped** — rot ist `der Dunkelzweig setzt DIESELBEN zwanzig Farbnamen neu`, mit `AssertionError: --lb-ampel-grau-flaeche fehlt im Dunkelzweig` (`bauform.test.ts:511`) | **Der Dunkelblock trägt seine zwanzig wirklich**, jede einzeln. Die Zeile „dieselben 20 im Dunkelblock" ist damit belegt und nicht abgeschrieben. |
| **M11** | **Gegenprobe:** die drei Schriftstapel **zusätzlich** in den Dunkelblock eingesetzt (dort dann 23) | **39 passed \| 1 skipped (40)** — unverändert grün | **Der Dunkelzweig verlangt 20, nicht 23.** Die wörtliche Lesart „fünfzehn in beiden Modi" ist von keiner Zusicherung gedeckt; wer sie umsetzt, doppelt drei moduskonstante Werte, ohne dass ein Test es bemerkt. Genau deshalb steht das „in beiden Modi" jetzt als das Unscharfe in §4.4, nicht die Fünfzehn. |

**Gegenprobe zur alten Fassung** (Auflage: „dass die alte Fassung unter derselben Mutation grün
blieb"): Die alte Fassung von §6.2 T5-3 war der Satz „der Nachweis fällt in T100". Er ist unter
**allen drei** Mutationen unverändert wahr geblieben — M9, M10 und M11 hätten ihn nicht angetastet,
weil er über den Dateiinhalt **nichts behauptet**. Genau das ist der Befund: eine Zusage, die unter
jeder Mutation ihres Gegenstands stehenbleibt, trägt nichts. Die neue Fassung nennt Zahlen, die M9
und M10 rot machen, sobald sie nicht mehr stimmen.

**Zurückgenommen und nachgewiesen:** alle drei Mutationen aus der Sicherungskopie
`scratchpad/helfer.module.css.orig` zurückgespielt, `git status --short` danach **leer**,
`git diff --stat` leer. Kein `git checkout` auf einer Datei mit ungesicherter Arbeit (die Lehre aus
dem Zwischenfall in §3).

Rohausgaben, ungekürzt und **dauerhaft abgelegt** (Regel 3) — neben diesem Bericht in
`task-87-fix1-logs/`, nicht im flüchtigen Scratchpad: `m0-baseline.txt`, `m9-display-weg.txt`,
`m10-dunkel-ampel-weg.txt`, `m11-gegenprobe-dunkel-23.txt`, dazu `g-typecheck.txt`, `g-lint.txt`,
`g-bauform-final.txt`. (Dasselbe Muster wie `task-62-logs/`, `task-64-logs/`, `t66-logs/`.)

## 9.2 Abdeckende Tests und die Gates dieser Fix-Runde

`src/app/m/lagerbuch/_ui/helfer.module.css` ist durch `_lib/bauform.test.ts` abgedeckt (Block
„Teil 4, T64 — das Stylesheet des Helfer-Wegs", 8 `it()`); genau dort liegen die drei Mutationen.
**Geändert wurde in dieser Runde ausschließlich `task-87-report.md`** — kein Produktions- und kein
Testcode, damit auch keine neue Abdeckung nötig.

| Kommando | Ergebnis |
|---|---|
| `pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts` | **grün**, exit 0 — `Test Files 1 passed (1)` · `Tests 39 passed \| 1 skipped (40)` (`task-87-fix1-logs/g-bauform-final.txt`) |
| `pnpm typecheck` | **grün**, exit 0 (`task-87-fix1-logs/g-typecheck.txt`) |
| `pnpm lint` | **grün**, exit 0 — `✖ 6 problems (0 errors, 6 warnings)`, alle sechs vorbestehend und keine im Lagerbuch-Modul (`task-87-fix1-logs/g-lint.txt`) |

`pnpm vitest run` (voll) und `pnpm build` sind **nicht erneut** gefahren: diese Runde hat keine Zeile
Code angefasst, und §4.5 hält ihr Ergebnis für den unveränderten Codestand `49a77c6` fest.

### ⚠️ Kein Commit möglich — und das ist kein Versäumnis

`.superpowers/sdd/.gitignore` enthält `*`; der gesamte Planordner ist **ignoriert**
(`git check-ignore -v` → `.superpowers/sdd/.gitignore:1:*`). Die einzige Datei, die diese Runde
geändert hat, ist `task-87-report.md` — also **nicht versioniert**. `git status --porcelain` ist
folgerichtig **leer**; `HEAD` bleibt `49a77c6`, unverändert gegenüber BASE.

Ein `git add -f` hätte den Planordner gegen die geltende `.gitignore` in die Historie gezogen — das
ist eine Repo-Entscheidung, keine Umsetzerentscheidung, und der Fix-Auftrag deckt sie nicht.

## 9.3 Was diese Runde NICHT angefasst hat

Kein Codeeingriff — der Befund sieht keinen vor, und die CSS-Datei ist inhaltlich in Ordnung.
**Nicht angefasst**, ausdrücklich: `helfer.module.css:34` (der Kommentar ist richtig, er beschriftet
nur eine Untergruppe), die `it()`-Titel und die Liste `NEUTRALE` in `bauform.test.ts`, sowie jede
andere Feststellung des Vorgängerberichts.
