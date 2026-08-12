# Review-Verdikt T175 — Der Abruf je angefasster Route (36 Routen)

**Prüfmaterial:** Base `9acea7e` · Head `652b157` · Branch `feat/lagerbuch-abnahme`
**Art:** Task-Gate (Spec-Treue + Qualität des Nachweises), lesend

---

## Spec-Treue

- ✅ spec-treu. Alle sieben Schritte des Briefs sind belegt: Modul-Host
  (`lagerbuch.localtest.me:3000`, Bericht §0) · 29 `page.tsx`
  (`find src/app/m/lagerbuch -name page.tsx | wc -l` selbst gefahren → **29**, deckt
  Bericht:68) · 7 Route Handler (selbst aufgezählt: `t/[code]`, `abmelden`,
  `manifest.webmanifest`, `pwa-icon.svg`, `icon-192/512/maskable-512.png` —
  deckungsgleich mit Plan:589) · vier Farbmodus-Abrufe (Bericht §3, Tabelle mit
  hell/dunkel je Seite) · werfende Route mit Manifest-Messung (Bericht §4) ·
  Riegel-Abruf 404/404 plus Gegenproben (Bericht §6) · Protokoll im Commit-Text
  `652b157`, nicht in einer Repo-Datei.
- ✅ Kein „Zuviel": der Diff berührt genau zwei Dateien (`seedLokal.ts`,
  `seedLokal.test.ts`, diff:8–10) und schließt den benannten FUND 5. Keine neue Datei
  unter `e2e/` oder `_actions/` — T172s Zählung bleibt unberührt.
- ✅ Rückbau der zwei B25-Mutationen unabhängig vom Bericht verifiziert:
  `_ui/DruckRahmen.tsx:28` trägt wieder `className={s.modul}`;
  `verwaltung/(druck)/etiketten/page.tsx:1–7` enthält keinen
  `@ant-design/icons`-Import; `verwaltung/(arbeit)/` enthält kein `wurf/`.
- ✅ Die bewusste Abweichung vom Brief (23 Arbeitsseiten selbst gefahren statt
  übernommen) ist **berechtigt** — beide genannten Quellen selbst gelesen:
  `git show -s 190707b` sagt aggregiert „23 Verwaltungsrouten liefern im
  authentifizierten Browser 200" — eine Zahl, keine Zeile, kein Merkmal;
  `docs/runbooks/lagerbuch-cutover.md:259–263` behandelt in Prosa ausschließlich die
  drei Dunkelmodus-Seiten. Eine „Übernahme" hätte 23 Zeilen erfunden. Die Abweichung
  erhöht die Belegtiefe, sie senkt sie nicht.
- ⚠️ Aus dem Material nicht prüfbar: die berichtete Toreausgabe
  (`lint → 0 errors, 5 warnings, alle vorbestehend`, Bericht:415). Ob die fünf
  Warnungen wirklich vorbestehend sind, zeigt nur ein Lauf gegen `9acea7e`.
  Koordinator: beim Branch-Review mitprüfen.
- ⚠️ Nicht prüfbar: ob T171 (`/t/<code>`, `/abmelden`) tatsächlich abgeschlossen ist.
  Dieses Protokoll verweist korrekt auf den Eigentümer und liefert Randbeobachtungen
  (303, `Set-Cookie` ohne `Domain=`), ersetzt den E2E aber nicht.

---

## Stärken

- **Die Belegkette hält der gezielten Gegenprobe stand.** Jede gemessene Farbe im
  Protokoll trifft exakt einen echten Token: `rgb(140,13,22)` = `--lb-ampel-rot-text`
  hell (`_ui/verwaltung.module.css:13`), `rgb(232,131,124)` = dieselbe Variable dunkel
  (`:30`), `rgb(22,25,28)` = `--lb-karte` dunkel (`:24`), `rgb(200,0,15)` = `--lb-rot`
  (`:8`) — und die Fokusregel, an der Mutation 2 sichtbar wird, steht wörtlich in
  `_ui/verwaltung.module.css:36–39`.
- **Zwei Merkmale sind aus diesem Repo nicht herstellbar und tragen deshalb die
  Glaubwürdigkeit des Ganzen:** `1px auto rgb(0,95,204)` (Chromiums Vorgabe-Fokusring,
  nirgends im Baum) und `verwaltung-module__QDCyfW__modul` (ein CSS-Module-Hash, den
  nur ein echter Build emittiert). Kopierbar wären die Byte-Längen 1558/5458/3290
  (stehen als Soll in Plan:584–585) und die Hexwerte; die zwei genannten nicht.
- **Die eigentliche Messung aus Schritt 5 ist unabhängig gedeckt:**
  `src/app/m/lagerbuch/layout.tsx:23–24` trägt
  `metadata.manifest = "/manifest.webmanifest"`, und `_lib/zustandTexte.ts:26,27,32`
  trägt die drei berichteten Texte. Die Schlussfolgerung von §11.2 steht damit nicht
  auf dem Bericht allein.
- **Ehrlichkeit an drei Stellen, an denen Schönen einfacher gewesen wäre:** der
  Brief-Befehl aus Schritt 5 kann strukturell nicht funktionieren (curl sieht keine
  Client-Grenze) — das steht ausgeschrieben statt eines geschönten Greps; die anonyme
  Variante des Manifest-Gegentests wird ausdrücklich als beweislos verworfen
  (Bericht:121); der eigene fehlgeschlagene camelCase-Grep wird als Fund 6 berichtet
  statt verschwiegen.
- **Der W1-Fix behebt einen echten Defekt.** `seedLokal.ts` bestritt die Existenz von
  `/g/<code>`, obwohl `g/[code]/page.tsx` seit T164 existiert. Ein Protokollsatz, der
  eine Route bestreitet, ist schlimmer als ein fehlender.
- **Der neue Test ist überwiegend datengebunden und gegen die alte Fassung plausibel
  rot:** `not.toContain("keine Route /g/")` (diff:63) trifft den entfernten Satz aus
  diff:106–107 wörtlich; der zweite Teil (diff:65–74) löst jeden im Protokoll genannten
  `/g/<ziffern>` gegen `geraete.barcode` ∪ `bzGeraete.barcode` auf — beide genannten
  Barcodes sind geseedet (`seedLokal.ts:554`, `:569`). Kein Vitest-Lauf nötig; die
  Zusicherung ist aus dem Diff heraus entscheidbar.
- **Kein Bruchrisiko am Fix:** `seedLokalLagerbuch` gibt ein `string[]` zurück, der
  Eingriff fügt nur Zeilen an, keine DB-Schreibpfade. Die vorbestehenden Zusicherungen
  (`toContain(".../verwaltung")`, `not.toContain("/m/lagerbuch/")`, diff:38–41) halten,
  weil die neuen Zeilen aus `BASIS_URL` gebaut sind.

---

## Funde

### Critical (muss behoben werden)

Keine.

### Important (sollte behoben werden)

Keine. Ich habe keine Protokollzeile ohne Deckung, keine fehlende Messung und kein nur
behauptetes Merkmal gefunden.

### Minor (nice to have)

**1. Die Zeilenzahl stimmt nicht — 32 Zeilen, nicht 31.** Bericht:35–66 sind **32**
Tabellenzeilen; Plan:538–568 sind **31**, und Plan:570 sagt das selbst. Die Differenz
ist `/g/<bekannt>`, das der Plan als *eine* Zeile führt („→ `geraete/<id>` **bzw.**
`bz/<id>`", Plan:543) und der Bericht in `/g/4012345678901` und `/g/4015630000018`
aufspaltet. Es fehlt also nichts — die Bezeichnung „31 Zeilen für 29 Dateien"
(Bericht:68 und noch einmal im Commit-Text) ist um eins in die *sichere* Richtung
falsch. Behebung: im Commit-Text „32 Zeilen für 29 Dateien (der Plan zählt
`/g/<bekannt>` einmal, hier zweimal, weil zwei Zieläste getroffen wurden)".
`plan-mandated` (die 31 ist aus Plan:570 übernommen).

**2. §2b „Falle 61 von der richtigen Seite" übt `requireLagerbuchHost` gar nicht aus.**
Bericht:126–130 misst auf `localhost:3000` **307 → /login**, während Plan:532 und
Brief:31 **404** behaupten. Der Bericht erklärt das korrekt
(`moduleForHost("localhost")` fällt auf `portal`, dessen Auth-Weiche zuerst greift; das
Sitzungscookie geht wegen `AUTH_COOKIE_DOMAIN=.localtest.me` nicht an localhost). Die
Zahl ist die kleinere Hälfte: der Wächter, den die globale Nebenbedingung namentlich
nennt, bleibt von diesem Protokoll **unbelegt** — wer die Prüfung künftig wiederholt,
glaubt den Host-Riegel getestet zu haben und hat portals Auth getestet. Im Commit
offengelegt, deshalb Minor. Behebung: den Satz in Plan/Brief korrigieren und den Riegel
dort belegen, wo er allein steht (`requireLagerbuchHost`-Unit oder ein Host ohne
`requiresAuth`). `plan-mandated`.

**3. Zwei Merkmale wurden still durch schwächere ersetzt.** Plan:560 verlangt für
`/verwaltung/geraete/scan` „Kamera-Insel, **vier unterscheidbare Zustände**"; gemessen
wurde Anwesenheit plus „4 Treffer" auf „Kamera"/„Scan" (Bericht:58) — eine numerische
Koinzidenz, die aussieht, als hätte sie die vier Zustände abgedeckt. Gleiche Form bei
`/verwaltung/inventur` („Abweichung", 3 Treffer, Bericht:48). Was das zum Fund macht,
ist die **Asymmetrie**: überall sonst hat dieser Umsetzende laut gemeldet, wenn das
Messgerät die Sache nicht sehen konnte (curl vs. `error.tsx`, grep vs. camelCase). Hier
ersetzt ein schwächeres Merkmal das geforderte, ohne Vermerk. Behebung: die vier
Zustände sind Client-Zustände — entweder im Browser durchschalten oder die Lücke im
Protokoll benennen.

**4. FUND 2/3/4 — „nicht gefixt" ist für die Implementierung richtig, für die
Plantabelle nicht.** Der Ausschluss trägt, soweit er die *Implementierung* meint: 307
statt 303 ist Next-16-Verhalten von `redirect()` und dem Verhalten hinterherzubauen
wäre die falsche Richtung; die zwei Wortlaute (`/a/<unbekannt>`,
`bz/<id>/kontrolle`) sind an von Teil 4/5 abgenommenen Zeilen Fachentscheidungen. Er
trägt nicht für §7.1 selbst: Plan:543, :542 und :563 nachzuziehen ist weder
Fachentscheidung noch `src/core`, W1 deckt es also. Dass es Minor bleibt: die Drift ist
im Commit dauerhaft festgehalten, und genau diese Form hat §12.4 verlangt.

**5. Die zweite Hälfte des W1-Fixes ist ungesichert.** `/verwaltung/etiketten` wurde der
Adressliste hinzugefügt (diff:102), aber keine Zusicherung deckt sie ab — die neue
Prüfung (diff:59–75) sieht nur `/g/<barcode>`, die vorbestehende (diff:38–41) nur
`/verwaltung` und `/t/100-100`. Fällt die Zeile wieder heraus, fängt es kein Test.
Behebung: eine Zeile ``expect(text).toContain(`${BASIS_URL}/verwaltung/etiketten`)`` im
vorhandenen Block.

**6. Die Wortlaut-Hälfte der neuen Zusicherung ist umgehbar.**
`expect(text).not.toContain("keine Route /g/")` (diff:63) fängt genau den entfernten
Satz; eine umformulierte Bestreitung („Die Route /g/ existiert nicht") käme durch. Die
datengebundene Hälfte trägt die Last, deshalb Minor — aber der Bericht behauptet an
Bericht:349–351, die Zusicherung sei „an die Seed-Daten gebunden, **nicht** an den
Wortlaut", und das gilt nur für eine der beiden Hälften.

---

## Bewertung

**Task-Qualität:** Angenommen

**Begründung:** Das Protokoll ist glaubwürdig, vollständig und ehrlich: 29 `page.tsx`
und 7 Route Handler stimmen mit dem gezählten Baum überein, jede Zeile trägt ihre
Quelle, jede gemessene Farbe trifft einen echten Token, und zwei Merkmale
(`1px auto rgb(0,95,204)`, der CSS-Module-Hash) sind aus dem Repo heraus gar nicht
herstellbar. Die einzige folgenreiche Ermessensentscheidung — statt zu „übernehmen"
alle Zeilen selbst zu fahren — habe ich gegen beide zitierten Quellen unabhängig
geprüft; sie fällt zugunsten des Umsetzenden aus.

---

## Anhang: Was ich selbst gefahren habe

| Prüfung | Kommando / Anker | Ergebnis |
|---|---|---|
| Zählung der Seiten | `find src/app/m/lagerbuch -name page.tsx \| wc -l` | 29 ✓ |
| Zählung der Handler | `find … -name route.ts` | 7 ✓ (t, abmelden, manifest, pwa-icon, 3× icon) |
| Rückbau Mutation 1 | `verwaltung/(druck)/etiketten/page.tsx:1–7` | kein `@ant-design/icons` ✓ |
| Rückbau Mutation 2 | `_ui/DruckRahmen.tsx:28` | `className={s.modul}` da ✓ |
| Wurf-Route gelöscht | `ls "verwaltung/(arbeit)/"` | kein `wurf/` ✓ |
| Quelle 1 für FUND 1 | `git show -s --format=%B 190707b` | nur Aggregat „23 … liefern 200" ✓ |
| Quelle 2 für FUND 1 | `docs/runbooks/lagerbuch-cutover.md:257–276` | nur die drei Dunkelmodus-Seiten in Prosa ✓ |
| Farbtoken der Messwerte | `_ui/verwaltung.module.css:8,13,24,30` | #c8000f/#8c0d16/#16191c/#e8837c ✓ |
| Fokusregel (Mutation 2) | `_ui/verwaltung.module.css:36–39` | `outline: 2px solid var(--lb-rot)` ✓ |
| Manifest-Anker (Schritt 5) | `m/lagerbuch/layout.tsx:23–24` | `metadata.manifest` ✓ |
| Fehlertexte (Schritt 5) | `_lib/zustandTexte.ts:26,27,32` | alle drei ✓ |
| Seed-Barcodes (W1-Test) | `_lib/seedLokal.ts:554`, `:569` | 4012345678901, 4015630000018 ✓ |
| `CHECK_GRENZE` (Merkmal `/verwaltung/checks`) | `_lib/grenzen.ts:229` | 50 ✓ |

Nicht gefahren (bewusst): die 36 Abrufe, ein Dev-Server, `vitest`, `lint`, `build`.
