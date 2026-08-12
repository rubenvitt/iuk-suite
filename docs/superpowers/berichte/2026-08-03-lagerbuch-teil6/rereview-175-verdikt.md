# Re-Review T175 — Fix-Runde 1 (sechs Minor-Funde)

**Prüfmaterial:** Fix-Base `652b157` · Head `7cea8e4` (Commits `129f0cc`, `7cea8e4`) ·
Diff-Datei `review-652b157..7cea8e4.diff` · Commit-Body `7cea8e4` per `git show -s --format=%B`.
Art: lesende Nachprüfung einer Fix-Runde, kein frisches Review.

## Fund-Verdikte

**1. Zeilenzahl falsch ("31" statt "32").** ADDRESSED — Commit-Body `7cea8e4`, Abschnitt 1,
sagt wörtlich „es sind 32 TABELLENZEILEN fuer 29 Dateien" mit derselben Begründung, die das
Verdikt verlangte (`/g/<bekannt>` zweimal, weil beide Zieläste einzeln getroffen wurden, mit
den zwei konkreten Barcodes belegt). Verifiziert: `seedLokal.ts:714-715` führt exakt diese
zwei `/g/`-Adressen, `seedLokal.ts:554,569` bestätigt die Barcode→ID-Zuordnung
(`ger-defi-rtw1`/`bz-rtw1`). Plan:570 ("Das sind 31 Zeilen für 29 Dateien") blieb im Diff
unverändert (Kontextzeile, kein `+`/`-`) — zu Recht: das ist die Plan-eigene Design-Zählung
(`/g/<bekannt>` als EINE logische Zeile, Plan:543 „bzw."), die weiterhin korrekt ist; die
Verwechslung lag nur in Bericht und Commit-Text, beide sind korrigiert. Der ursprüngliche
Fund verlangte die Korrektur ausdrücklich „im Commit-Text" — genau dort steht sie.

**2. §2b belegt `requireLagerbuchHost` nicht.** ADDRESSED — beide geforderten Teile sind da.
(a) Plan-Datei korrigiert: Diff `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md:30-51`
ersetzt die falsche Ursachenbehauptung durch die gemessene Erklärung (`moduleForHost("localhost")`
→ `portal`, dessen `requiresAuth`-Weiche vor jeder Modulseite greift; `AUTH_COOKIE_DOMAIN=.localtest.me`
schickt das Cookie nicht an `localhost`). (b) Beleg dort, wo der Riegel allein steht: zitiert wird
`e2e/lagerbuch-hosts.spec.ts` (`describe("Host-Riegel")`, gelesen `:91-179`) — das ist kein
"in der Nähe liegendes" Zitat, sondern eine echte Isolation: die 15 Einstiege sind INNERE Pfade
(`/m/lagerbuch/...`) auf einem FREMDEN, aber real auflösbaren Suite-Host
(`feedback.localtest.me`), angemeldet MIT Lagerbuch-Gruppe. Für innere Pfade gatet `decideRoute`
nach dem Pfadsegment, nicht nach dem Host; `lagerbuch` trägt `requiresAuth:false`, `canAccess`
steigt sofort mit `true` aus — der einzige verbleibende Riegel auf diesem Weg ist
`requireLagerbuchHost` im Modul-Layout selbst. Der Test prüft zusätzlich die Gegenrichtung (eigener
Host → nicht-404) und schließt Umwegeffekte per finaler-URL-Abgleich aus. Das ist eine echte,
saubere Isolation des benannten Wächters — kein Auth-Test mit Zufallstreffer.

**3. Zwei Merkmale still durch schwächere ersetzt — der inhaltlich schwerste Fund.** ADDRESSED,
mit echter Nachmessung, nicht mit einer Umformulierung desselben schwachen Signals.
`/verwaltung/geraete/scan`: der Nachtrag (Commit-Body Abschnitt 2a, gespiegelt in Bericht §1b)
benennt vier UNTERSCHEIDBARE Satzformen aus sieben `DOMException`-Ursachen
(NotAllowed/Security → ein Satz, NotFound/Overconstrained → ein Satz, NotReadable/Abort → ein Satz,
unbekannt → ein vierter Satz) und erklärt, warum ein bloßer `curl`/Abruf sie strukturell nie zeigt
(`isSecureContext` false über `http://`, früher Ausstieg vor dem zxing-Import). Das ist keine neue
Begründung derselben "4 Treffer"-Koinzidenz, sondern eine andere empirische Grundlage: **verifiziert
gegen den Quellcode** — `_ui/BarcodeScanner.tsx:32` trägt selbst den Kommentar „§7.6.3 — vier
Zustaende statt einem", und `kameraText()` (`:47-63`) implementiert exakt diese vier
Textgruppen aus sieben `DOMException`-Namen. Die vier Zustände sind also nicht irgendeine neue
Zählung, sondern die vom Code selbst behauptete Eigenschaft, jetzt tatsächlich durchgemessen
(`page.addInitScript` für `isSecureContext`, echte `DOMException`-Objekte). Dauerhafte Deckung
`_ui/BarcodeScanner.test.tsx:273-383` — Datei nicht im Fix-Diff, war schon vorher da, deckt
Wort für Wort dieselben sieben Fälle. `/verwaltung/inventur`: Zähler live 0→1→2→0 mit Singular/
Plural-Unterscheidung und Chip-Farbwerten — ebenfalls eine echte Messung, kein Ersatzmerkmal.

**4. §7.1 auf den gemessenen Zustand nachziehen.** ADDRESSED — alle drei Zeilen im Diff
korrigiert und gegen die Implementierung verifiziert: `/a/<unbekannt>` → Titel „Dieses Etikett
kennt kein Artikel" + Erklärsatz, deckt sich mit `a/[artikelId]/page.tsx:115-119` (der Diff-Text
zitiert den Satz leicht gekürzt, ohne „— der Bestand ist davon nicht betroffen.", das ist eine
Kürzung, keine sachliche Abweichung). `/g/<bekannt>` → 307 statt 303, mit beiden gemessenen Zielen;
`redirect()` in `g/[code]/page.tsx:77,79` ist Next-`redirect()`, 307 ist deren Next-16-Verhalten —
Implementierung bewusst unangetastet, wie vom Verdikt gefordert. `bz/<id>/kontrolle` → Label
„Kompressen-Verfall", deckt sich wörtlich mit `KontrolleForm.tsx:127-132` (`label="Kompressen-Verfall"`,
`picker="month"`). Keine der drei Korrekturen erfindet einen Zustand, den der Code nicht hat.

**5. Etiketten-Zeile im W1-Fix ungesichert.** ADDRESSED — `seedLokal.test.ts` diff:116-120 fügt
`expect(text).toContain("http://lagerbuch.localtest.me:3000/verwaltung/etiketten")` im
vorhandenen Block „vergibt feste Codes" ein, mit Begründung im Kommentar. Verifiziert:
`seedLokal.ts:713` führt diese Adresse tatsächlich im Protokoll-Array — die Zusicherung prüft
echten Code, keine Attrappe. Kein neuer Testblock, keine neue Datei.

**6. Wortlaut-Hälfte der Zusicherung umgehbar / Bericht überzog.** ADDRESSED im Rahmen dessen, was
der Fund selbst als Ziel setzte (er verlangte keine wasserdichte Lösung, sondern entweder eine
robustere Prüfung oder ehrliche Offenlegung der Grenze — beides ist jetzt da). Die
`not.toContain`-Einzelphrase wurde zu einer `RegExp` mit drei Alternativformen erweitert (diff:159-160,
verifiziert: aktuell führt `seedLokal.ts` keine der gefangenen Phrasen mehr, kein False-Positive-Risiko).
Der Testkommentar (diff:138-152) benennt jetzt ausdrücklich, dass die negative/wortlautgebundene
Hälfte weiterhin umgehbar bleibt und nur die positive, datengebundene Hälfte trägt — exakt das
Gegenteil der vorher zu starken Behauptung "an die Seed-Daten gebunden, nicht an den Wortlaut".
Die Regex bleibt bewusst unvollständig (dokumentiert, keine "Phrasen-Ratejagd") — das ist die im
Fund selbst akzeptierte Grenze, keine offene Lücke.

## Neue Schäden im Fix-Diff

Keine. Beide geänderten Dateien (`docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md`,
`src/app/m/lagerbuch/_lib/seedLokal.test.ts`) stimmen mit `git diff --stat` (2 Dateien,
56 Einfügungen/10 Löschungen) überein — keine unerwartete Drittdatei. Die neu eingefügte
Host-Tabelle im Plan ist wohlgeformtes Markdown (4 Spalten, Kopf/Trenner/3 Datenzeilen). Kein
Code, kein `e2e/`- oder `_actions/`-Zuwachs (T172s Zählung bleibt unberührt, wie vom Bericht
behauptet und durch die Diff-Statistik bestätigt). Keine Referenz im Repo (`src`, `e2e`, `docs`)
zitiert absolute Zeilennummern der Plandatei außerhalb von `.superpowers/sdd/`, die durch die
Verschiebung der Zeilen hätten veralten können — geprüft per Grep, kein Treffer.

Die Testbehauptung (PASS 66/FAIL 0, typecheck grün, lint 0/5 vorbestehend) ist im Bericht
(§11.3) mit Kommando, Datei-Liste und Ausgabe benannt, nicht bloß behauptet, und deckt sich mit
dem Diff-Umfang (nur `seedLokal.test.ts` geändert, Rot-Grün für beide neuen Assertions separat
dokumentiert). Kein eigener Testlauf nötig — der Diff ist aus sich heraus entscheidbar (wie
schon im Erstverdikt bei der Vorgänger-Zusicherung).

## Beobachtungen außerhalb des Umfangs

Keine.

## Verdikt

**Fix-Runde:** Alle sechs Funde behoben, keine neuen Critical/Important-Schäden. Fund 3 — der als
inhaltlich schwerster markiert war — wurde mit einer echten, gegen den Quellcode verifizierbaren
Messung geschlossen (vier Textgruppen aus sieben `DOMException`-Ursachen, wörtlich im
Komponentencode als "§7.6.3 — vier Zustaende statt einem" festgehalten), nicht mit einer
Umformulierung des ursprünglichen schwachen "4 Treffer"-Signals. Fund 2 trägt einen echten
isolierten Beleg des Host-Riegels (innerer Pfad auf realem Fremd-Host, `canAccess` kurzschließt
über `requiresAuth:false`, einziger verbleibender Filter ist `requireLagerbuchHost`).
