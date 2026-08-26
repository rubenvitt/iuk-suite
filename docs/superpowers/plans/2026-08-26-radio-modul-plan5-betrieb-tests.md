# Planteil 5 — Betrieb und Tests (`radio`)

> ## For agentic workers
>
> Pflicht-Subskill: `superpowers:subagent-driven-development`. **Ein Subagent je Aufgabe, ein
> Review zwischen je zwei Aufgaben.** ⛔ **Kein Implementer unter Sonnet** — Haiku hat in diesem
> Repo gemessen falsche Grünmeldungen produziert (Gedächtnisnotiz „Kein Haiku für Entwicklung").
>
> **Lesereihenfolge vor der ersten Zeile Code:**
>
> 1. `.superpowers/sdd/planteil5/KONTEXT.md` — **vollständig**, einschließlich des Nachtrags vom
>    2026-08-26 (vier Auflagen).
> 2. Dieser Plan, Kopf bis einschließlich „Reihenfolge der Aufgaben".
> 3. `docs/superpowers/specs/2026-08-17-radio-modul-design.md`, Kapitel **A** (`:51-78`) und **B**
>    (`:79-122`), dann das Kapitel der eigenen Aufgabe (7 = `:5490-6358`, 8 = `:6359-7113`).
> 4. Die Datei, die die Aufgabe anfasst — **ganz**, nicht nur die Stelle.
>
> **Rangfolge der Dokumente:** `KONTEXT.md` bindet über diesen Plan, wo beide dasselbe sagen; wo
> dieser Plan mehr sagt, gilt dieser Plan. ⛔ **Spec-Kapitel A und B binden über jede Planzeile.**
> Wo der gebaute Bestand einer Spec-Zeile widerspricht, entscheidet die Entscheidungstafel unten —
> nicht der Bauende im Vorbeigehen.

## Stand

| | |
|---|---|
| Repo | `/Users/rubeen/dev/personal/drk/iuk-suite` |
| Branch | `feat/radio-modul-planteil2` |
| Vorgänger | Planteil 4 — Grenze und Verwaltung (`docs/superpowers/plans/2026-08-24-radio-modul-plan4-grenze-verwaltung.md`), gebaut und schlussgeprüft |
| Nachfolger | **keiner.** Dies ist der letzte Planteil des Bauwegs. Danach folgt Spec 2 (Cutover-Runbook), und die schreibt kein Modul-Code mehr. |
| Leitplan | `docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md`, Zeile 5 der Planteil-Tabelle (`:91`) |
| Fortschrittsseite | `docs/superpowers/plans/2026-08-18-radio-ausfuehrungsplan.md` |

**Die Grundlinie laut `KONTEXT.md:319-322`:** 509/509 Testdateien, 9034/9034 Tests, typecheck 0,
lint 0 Fehler, build 0, Playwright **350 passed**.

⛔ **Miss die Zahl selbst, vor der ersten Aufgabe**, mit `rtk pnpm vitest run`, und trag sie in den
Aufgabenbericht ein. **Rate sie nicht.** Jeder Fehlschlag, den du danach siehst, ist ein **neuer** —
du hast ihn verursacht, bis die Beiseitelege-Gegenprobe das Gegenteil zeigt.

## Goal

Am Ende dieses Planteils **startet und läuft** das Modul `radio` als Betriebsgegenstand, und die
Zusagen der vier Vorgänger sind **nachgewiesen** statt behauptet.

* **Der Start prüft sich selbst.** `radioBootFehler()` läuft **vor** den Migrationen, liest **keine**
  Tabelle und meldet jede Fehlkonfiguration, die im Repo oder in der `.env` behebbar ist — als
  gesammelte Liste, nie als Wurf. Alles, was erst am Server sichtbar wird, **meldet** statt zu
  werfen: eine `radio:`-Warnung im Startprotokoll ist ein Stopp-Punkt für das Runbook.
* **Die Löschrichtlinie läuft von selbst.** `starteRadioHintergrund()` registriert den
  Retention-Takt **nach** den Migrationen, purgt beim Start **nichts**, ist gegen Hot-Reload
  idempotent und hat mit `RADIO_HISTORIE_PURGE=0` einen bewussten, bei jedem Start lauten
  Abschalter.
* **Der Alt-Kiosk kann seinen Cache nicht mehr ausliefern.** Der Abräum-Worker liegt unter
  `/sw.js` auf dem radio-Host, hat **keinen** `fetch`-Handler, löscht **alle** Cache-Namen dieses
  Origins und trägt sich danach aus. ⛔ **Er ist vor dem Router-Schwenk ausgeliefert, nicht mit ihm.**
* **`radio` bewirbt keine PWA** — kein Manifest, kein Icon-Handler, kein `rel="manifest"`, und ein
  Quelltext-Scan hält das fest, statt es zu behaupten.
* **Die Riegel greifen nachweislich bei echten Abrufen** — je Riegelform und je Rechtestufe, über
  den Ausleihzweig genauso wie über den Verwaltungszweig, und für jede Fläche, die dieser Planteil
  selbst neu anlegt.
* **Jedes Pflichtstück ist falsifiziert.** Neun Mutationsproben über sieben Pflichtstücke sind
  gefahren, ihr rotes Ergebnis ist notiert, und was eine Mutation überlebt hat, ist gelöscht oder
  neu geschrieben — nicht ergänzt.

**Nicht enthalten:** der Router-Schwenk (6.7-Abschnitt D), der Abbau des Alt-Stacks (E), der
Import, die Generalprobe, das Runbook. Das ist Spec 2. Ebenso nicht enthalten: die Release-Notizen
— ihr `datum` ist der Tag des Rollouts und damit eine Betreiberangabe (⬜ **G-L8**, Rezept in
„Was Planteil 5 NICHT liefert").

## Architecture — zwei Blöcke, und ihre Reihenfolge ist NICHT frei

Der Leitplan zählt die Stufen **M, Z, A, V, G, T**. **G** ist Betrieb (Spec-Kapitel 7), **T** ist
Tests (Spec-Kapitel 8). Dieser Plan zählt seine Aufgaben entsprechend **G1…G8** und **T1…T6**.

| Block | Aufgaben | Liefert | Warum er genau hier steht |
|---|---|---|---|
| **G — Betrieb** | G1–G8 | die Boot-Prüfungen, den Retention-Takt, den Abräum-Worker, die PWA-Abwesenheit, die Health-Zusage, `.env.example` | Kapitel 8 prüft, **was Kapitel 7 baut**. Ein e2e-Fall für `/sw.js` vor `sw.js/route.ts` wäre ein Fall über eine 404-Route. |
| **T — Tests** | T1–T6 | die e2e-Fläche (drei neue Dateien, drei Ergänzungen), die neun Mutationsproben | Kapitel 8 ist der **Nachweis**, nicht der Bau. Die Mutationsproben laufen laut Spec:7044-7052 ausdrücklich **nach** dem Grünwerden. |

**Innerhalb von Block G ist die Reihenfolge gebunden — durch drei Zwänge, nicht durch Geschmack:**

1. ⛔ **Naht NS-M1 / Spec B8.** `_lib/boot.ts` trägt am Ende zwei Exportgruppen aus zwei Planteilen.
   `radioBootFehler()` läuft **vor** den Migrationen und liest **keine** Tabelle;
   `starteRadioHintergrund()` läuft **danach** und braucht sie. Deshalb **G2 vor G4**, und deshalb
   steht zwischen ihnen **G3** — der Wächter, der beide Einhängungen unverlierbar macht.
2. ⛔ **`grenzenFehler()` vor `radioBootFehler()`.** `_lib/grenzen.ts:53-56` schreibt namentlich aus,
   dass `radioBootFehler()` **dieselbe** Zahlentabelle liest: „zwei Tabellen wären zwei Wahrheiten,
   und der Boot prüfte etwas anderes als das, was zur Laufzeit gilt." Also **G1 vor G2**.
3. ⛔ **`sw.js/route.ts` vor jedem e2e-Fall darüber**, und **vor dem Router-Schwenk**. Siehe die
   Auflagentafel unten, Auflage 1.

### Blöcke mit EINEM gemeinsamen Tor

⛔ **Dieser Planteil hat einen — und nur einen: G2 und G3.**

Begründung, und sie ist dieselbe Klasse wie die zwei verbotenen Schnitte in Planteil 4: **G3
verschärft den bestehenden Wächter `describe("Boot-Haken der Module sind verdrahtet")` in
`src/core/bootstrap.test.ts:377-416` von einer handgepflegten Namensliste
(`["filesBootFehler", "lagerbuchBootFehler"]`, gemessen `:399` und `:411`) auf eine aus
`src/app/m/*/_lib/boot.ts` **abgeleitete** Liste.** Genau in dem Moment, in dem die Ableitung
scharf wird, muss `radioBootFehler` bereits eingehängt sein — sonst ist der Wächter im selben
Commit rot, in dem er entsteht, und der naheliegende Grünmacher ist, die Ableitung wieder
aufzuweichen. Das ist die NT11-Fehlerform in Reinform.

⛔ **Also: G2 und G3 haben ein gemeinsames Tor und werden zusammen abgenommen.** Sie bekommen
trotzdem **zwei** Commits, weil der eine Produktcode ist und der andere ein Wächter — aber kein
Review zwischen ihnen, und kein Merge mit nur einem der beiden.

Alle anderen Aufgaben tragen ihr Tor allein.

## Tech Stack (belegt)

| Was | Womit | Beleg |
|---|---|---|
| Boot-Haken | `assertHostConfig()`, Spread-Eintrag `...(await xBootFehler())` | `src/core/bootstrap.ts:90-103` |
| Hintergrund-Takt | `startBackgroundWork()`, synchron, wirft nie | `src/core/bootstrap.ts:129-134` |
| Timer-Hausmuster | `setInterval(...).unref()`, Modul-`let` als HMR-Wache, exportierter Stopper | `src/app/m/files/_lib/boot.ts:173-179` |
| Zahlenprüfung des Moduls | `ZAHLEN`-Tabelle + `zahl()`, wirft `GrenzenUngueltig` | `src/app/m/radio/_lib/grenzen.ts:63-153` |
| Host-Riegel, nicht werfende Form für Route Handler | `hostAbweisung(req): Response \| null` | `src/app/m/radio/_lib/hostRiegel.ts:33-37` |
| Service Worker als Route Handler | Quelltext in `_lib/`, Handler liefert ihn aus | `src/app/m/qr/sw.js/route.ts`, `src/app/m/qr/_lib/sw-source.ts` |
| Health je Modul | generischer `[modul]`-Handler, `checkModuleHealth` + `laufendeRevision()` | `src/app/api/health/[modul]/route.ts:1-27`, `src/core/health/index.ts:1-16` |
| Quelltext-Scan-Bereinigung | dreiteilig, `bereinigt()` schneidet zuletzt | `src/app/m/radio/_lib/quelltextScan.ts:14-18`, Exporte `:61`, `:208` |
| e2e | Playwright, `workers: 1`, absolute Modul-URLs, `devLogin` | `playwright.config.ts`, `e2e/fixtures.ts`, `e2e/helpers/radio.ts` |
| e2e-Vorbild Host-Schleife | `EINSTIEGE`-Array + Status/Umweg/Eigen-Host je Eintrag | `e2e/lagerbuch-hosts.spec.ts` |

## Spec — Kapitelgrenzen und Vorrang

**Auftrag dieses Planteils sind Kapitel 7 (`:5490-6358`) und Kapitel 8 (`:6359-7113`)** — zusammen
1624 Zeilen. Dazu die fünf **Takt**-Fälle aus §2.7.2 (`:1573-1604`), die laut NS-M1 hierher
gehören, weil sie den Timer brauchen.

⛔ **Kapitel A (`:51-78`) und B (`:79-122`) binden über jeden Kapiteltext.**

### Die B-Einträge, die INNERHALB der zitierten Kapitel etwas überschreiben

| B | Was der Kapiteltext sagte | Was gilt |
|---|---|---|
| **B1** | Kapitel 7/9: `RADIO_ZUGANG_SITZUNG_STUNDEN` | **`RADIO_AUSLEIH_SITZUNG_STUNDEN`.** Keine `RADIO_ZUGANG_*`-Form darf in einer Boot-Prüfung oder in `.env.example` stehen. |
| **B2** | Kapitel 7/9: `RADIO_ZUGANG_SITZUNG_SECRET`; Kapitel 3: `..._GEHEIMNIS` | **`RADIO_AUSLEIH_SITZUNG_SECRET`.** |
| **B3** | Kapitel 7: `RADIO_ADMIN_API_URL` | **`RADIO_ADMIN_URL`** — und sie entsteht in Kapitel 7 **gar nicht**, sie stirbt mit der HTTP-Grenze. |
| **B5** | zwei Retention-Arbeiter, zwei Namen, zwei Erstlauf-Zeiten, Host-Schalter davor | **Ein** Rumpf, **ein** Name: `starteRadioHintergrund()` in `_lib/boot.ts`. Erstlauf-Vorbelegung **1440** Minuten. ⛔ **Kein Host-Schalter vor dem Retention-Timer** — er gilt **nur** für die Bestandswarnung. Kein `_lib/retention.test.ts`. |
| **B8** | Kapitel 2 §2.9.3: „`radio` hat keine modul-eigene Boot-Prüfung" | **Kapitel 7 hat recht.** `radioBootFehler()` existiert, ist eingehängt, und die Reihenfolge der zwei Exporte ist Pflicht. |
| **B13** | Klausel (c) kannte nur `radioHostOderNull` | **Vierte Riegelform `hostAbweisung`** ist für Route Handler zulässig — sie existiert bereits (`_lib/hostRiegel.ts:33`) und hat mit `sw.js/route.ts` ihren ersten Konsumenten. |
| **B18** | Kapitel 7 nennt nur das Präfix `RADIO_GATE_*` | **Drei ausgeschriebene Namen** aus Kapitel 3 §3.7 — sie stehen bereits in `_lib/grenzen.ts:82-91` und in `.env.example:441-447`. |

---

## Zehn Dinge, die diesen Plan von einem gewöhnlichen Umsetzungsplan unterscheiden

1. ⛔ **Der Abräum-Worker gehört zum ERSTEN Deploy, nicht zum Cutover.** Der Leitplan
   (`:100-110`) wörtlich: „Weil der Alt-Kiosk denselben Origin hält, überlebt sein Service Worker
   den Umschwenk — ohne Abräumen liefert er gecachte Alt-Oberfläche an Geräte aus, die nie neu
   geladen haben." Wer G5 als Cutover-Schritt plant, hat den Zweck verfehlt: **nichts in der Suite
   ruft `navigator.serviceWorker.register()`**, die Route wird ausschließlich von der
   Update-Prüfung eines **schon registrierten** Workers abgeholt. Kommt sie erst mit dem Schwenk,
   gibt es im entscheidenden Fenster nichts, was sich vom Alten unterscheidet.

2. ⛔ **Die Reihenfolge der zwei Boot-Exporte ist Pflicht, und kein Typecheck sieht sie.**
   `radioBootFehler()` **vor** den Migrationen, ohne Tabellenzugriff;
   `starteRadioHintergrund()` **danach**, mit. Vertauscht ist beides typkorrekt, lint-sauber und
   baut durch. Deshalb schuldet dieser Plan **je einen Test, der die Reihenfolge zusichert** —
   G2 und G4 liefern sie, G3 macht sie unverlierbar.

3. ⛔ **Die Regressionssperre gegen den zurückgebauten Sofort-Purge ist bis heute NICHT gebaut.**
   `starteRadioHintergrund loescht beim Start NICHTS` ist der erste der fünf Takt-Fälle aus §2.7.2.
   Der Ausführungsplan sagt dazu wörtlich: „Das ist bewusst und steht hier, damit es niemand für
   vergessen hält." **G4 baut ihn, mit der Sonde, die ihn beweist.**
   Der Anlass, den die Spec selbst nennt (`:1578-1582`): kommt der Import mit einem
   Faktor-1000-Fehler durch, liegt jedes `returned_at` im Jahr 1970 — „und ein Boot-Purge löscht die
   vollständige abgeschlossene Leihhistorie im selben Moment, in dem der Container zum ersten Mal
   hochkommt, also vor jeder menschlichen Sichtprüfung."

4. ⛔ **Idempotenz gegen wiederholte Aufrufe ist kein Komfort.** `register()` in
   `src/instrumentation.ts` kann mehrfach laufen. Ein Timer ohne Wache liefe am Ende mehrfach — und
   **löschte dann mehrfach**. Die Wache ist ein Modul-`let` plus `if (uhr !== undefined) return;`
   (`src/app/m/files/_lib/boot.ts:173-179`, Wache `:174`), und ihre Sonde steht in G4.

   ⚠️ **Und hier steht, was der Fall NICHT belegt — die frühere Fassung dieses Punktes hat zu viel
   behauptet.** Der vorgeschriebene Fall `zweimaliger Aufruf startet nur einen Timer` misst **zwei
   Aufrufe in DERSELBEN Modulinstanz**. Ein Hot Reload, der das Modul **neu instanziiert**, setzt
   das Modul-`let` wieder auf `undefined`; davor schützt die Wache **nicht**, und es gibt dafür in
   diesem Repo **keine Messung**. Das Gegenindiz steht im Bestand: `src/core/db/index.ts:25` hält
   den DB-Cache bewusst auf `globalThis.__suiteDb`, **weil** Modulzustand hier nicht verlässlich
   überlebt. ⛔ **Die Hausform (`files/_lib/boot.ts:174`) wird übernommen, weil sie die gesetzte
   ist — nicht, weil sie gemessen HMR-fest wäre.** Eine `globalThis`-Wache wäre die stärkere Form;
   sie wird **nicht** gewählt, um nicht als einziges Modul eine fünfte Bauart einzuführen, und
   ⛔ **genau dieser Satz gehört in den Quelltext neben die Wache**.

5. ⛔ **Kapitel 8 prüft, was kein anderes Tor sieht — und ⬜ Z-L1 ist nur zur Hälfte erledigt.**
   Planteil 4 hat vier **grüne Dauerfälle** für den `(arbeit)`-Zweig hinterlassen
   (`e2e/radio-verwaltung.spec.ts`, „V-L3 A" bis „V-L3 D", zitiert in `riegel.test.ts:56-80`) —
   **mehr, als der Nachtrag in `KONTEXT.md:384-385` weiß**, der von zwei einmaligen Messungen
   spricht. ⛔ **Das entlastet Planteil 5 nicht.** Unbewiesen bleibt bei einem echten Abruf:
   der **anonyme Ausleihzweig** überhaupt (Spec:6584-6588: „`radio` führt `requiresAuth: false` …
   also antwortet **jeder** Suite-Host auf `/m/radio/*`, wenn das Modul seinen eigenen Riegel nicht
   trägt"), die **Gate-Riegel bei gesperrtem Code** in beiden Formen, die **Host-Schleife über alle
   Pfade** statt einer Stichprobe, der **Personenriegel im `(druck)`-Zweig** (⬜ V-L14), und **jede
   Fläche, die dieser Planteil selbst anlegt** (`/sw.js`, `/api/health/radio`).
   **Die vier Dauerfälle sind der Anfang, nicht der Ersatz** — und dieser Plan sagt das mit der
   genauen Angabe, was sie decken und was nicht, statt mit einer Vollzähligkeitsbehauptung.

6. ⛔ **Wer einen fünften Quelltext-Scan anlegt, übernimmt die dreiteilige Reparatur.** Vier Scans
   trugen dieselbe stille Blindstelle: ihr Kommentarschnitt kannte keine Regexliterale, ein `/\//`
   trägt zwei Schrägstriche, der Schnitt hielt sie für einen Kommentarbeginn und löschte den Rest
   der Zeile. Bei **negativen** Zusicherungen — genau der Art, die `_lib/keine-pwa.test.ts` prüft —
   heißt das **weniger gefundene Verstöße, still**.
   ⛔ **G6 implementiert den Schnitt nicht erneut. Er importiert einen exportierten Baustein aus
   `src/app/m/radio/_lib/quelltextScan.ts`** — ⛔ **`ohneKommentare`, NICHT `bereinigt`**
   (Entscheidung **E-G6a**): `bereinigt` leert jedes Zeichenkettenliteral (`:117-127`) und machte
   drei der fünf Zusagen dieser Datei **strukturell blind**. Die **Lehre** der Reparatur ist der
   Satz aus `quelltextScan.ts:55-59` — „ein Scan darf falsch-positiv sein und laut, nie
   falsch-negativ und still" —, nicht der Funktionsname. Gemessen exportiert die Datei genau zwei
   Namen,
   `ohneKommentare` (`:61`) und `bereinigt` (`:208`); `ohneKommentareUndZeichenketten` und
   `ohneRegexLiterale` bleiben **bewusst modul-privat**, weil nur der nicht exportierte Name ihren
   Direktaufruf konstruktiv unmöglich macht.

7. ⛔ **Wer „alle" schreibt, zählt vorher.** Eine Vollzähligkeitsbehauptung, die nicht trägt, ist
   schlimmer als keine — in Planteil 4 trug ein fünfter Fall die Ausnahme weiter und stand **blank
   ohne Kommentar**, war also mit dem naheliegenden Gegen-`grep` nicht auffindbar. Jede Zahl in
   diesem Plan (`HANDLER_ANZAHL`, die Länge von `EINSTIEGE`, die Zahl der Boot-Prüfungen, die Zahl
   der gescannten Dateien in G6) steht als `toBe`, **nie** als `toBeGreaterThanOrEqual`.

8. ⛔ **Der Boot-Haken-Wächter im Bestand ist heute eine handgepflegte Namensliste — gemessen.**
   `src/core/bootstrap.test.ts:399` und `:411` führen `["filesBootFehler", "lagerbuchBootFehler"]`
   als Literal. Ein `radioBootFehler`, das nie eingehängt wird, bliebe dort **grün**. G3 ersetzt die
   Liste durch eine aus `src/app/m/*/_lib/boot.ts` abgeleitete — das ist der Test, den Spec §7.3.7
   ausdrücklich verlangt („Quelltext-Scan über `src/app/m/*/_lib/boot.ts`", `Spec:6103`) und den
   der Bestand nur dem Namen nach hat.

   ⛔ **Aber für die HINTERGRUNDSTARTER trägt derselbe Glob nicht, und das ist gemessen.**
   `startBackgroundWork()` ruft heute **zwei** Starter (`src/core/bootstrap.ts:129-134`), nach G4
   **drei** — und einer davon liegt **außerhalb** des Globs: `starteAufgabenScanArbeiter` wird aus
   `@/app/m/aufgaben/_lib/scan` importiert (`bootstrap.ts:15`) und steht in
   `src/app/m/aufgaben/_lib/scan.ts:324`. `ls src/app/m/*/_lib/boot.ts` liefert genau drei Dateien
   (`files`, `lagerbuch`, `radio`). **Eine reine Vorwärts-Ableitung über den Spec-Glob zählte nach
   G4 `2`, während `3` laufen** — das ist die Vollzähligkeitsbehauptung aus der Planteil-4-Lehre,
   neu gebaut. ⛔ **Deshalb hat Klausel (II) in G3 ZWEI Richtungen**, und die Ausnahme steht
   namentlich im Quelltext. Siehe G3.

   ⚠️ **Der naheliegende Gegen-Vorschlag — den Glob auf `src/app/m/*/_lib/*.ts` weiten — ist
   gemessen FALSCH und wird ausdrücklich verworfen:** er zöge `starteAvArbeiter`
   (`src/app/m/files/_lib/av.ts:505`) mit herein, und die steht **nicht** im Rumpf von
   `startBackgroundWork()`, sondern wird von `starteFilesHintergrund` gerufen
   (`files/_lib/boot.ts:139`). Klausel (II) wäre damit **rot by construction**.

9. ⛔ **`startBackgroundWork()` wird in `src/core/bootstrap.test.ts` ECHT gerufen — zweimal.**
   Gemessen: `:315-340` und `:341-364`. Sobald G4 dort `starteRadioHintergrund()` einhängt, öffnet
   dieser Testlauf eine echte `radio.db` unter `./.data/bootstrap-test` und registriert einen echten
   Timer. Der Bestand hat für genau diese Klasse bereits einen Spion
   (`vi.mock("@/app/m/files/_lib/av")`, `:41-50`, mit der ausgeschriebenen Begründung „der echte
   Arbeiter öffnet Sockets und liest Tabellen"). **G4 legt den dritten Spion an, im selben Commit
   wie die Einhängung.**

10. ⛔ **NT7, und er gilt für jedes Tor.** `rtk` meldet **falsches Grün** für `tsc`, wenn Farbe
    durchkommt. `NO_COLOR=1` ist in der Umgebung gesetzt, `package.json` trägt
    `tsc --noEmit --pretty false`. **Niemals** `grep -cE "error TS"` auf farbigem Output — die
    ANSI-Sequenz steht zwischen `error` und `TS`, und `grep` zählt **0**. Außerhalb dieser Umgebung:
    **den Exit-Code prüfen**, nicht die Meldung.

---

## Global Constraints

* **Alle Kommandos mit `rtk` präfixt, auch in Ketten mit `&&`.**
* **Deutsch mit korrekten Umlauten** in Prosa und Kommentaren. In TypeScript-Bezeichnern und
  Testnamen **keine** Umlaute (Hausform: `paritaetsSichtGeraet`, `msZuDatum`, `tagInBerlin`).
  ⛔ **Niemals ein Umlaut in einem zitierten Wert oder einem Grep-Anker.**
  **Ausnahme:** wörtlich übernommener Bildschirmtext behält seine Umlaute.
* **Belegpflicht.** Jede Behauptung in Kommentar oder Plan nennt `datei:zeile`. ⛔ **Wo ein Wert erst
  der Bau oder der Server hergibt, steht eine benannte Leerstelle (⬜ …) mit „wer liest sie wann
  ab" — nie eine plausibel aussehende Erfindung.**
  ⛔ **Und die Regel gilt für JEDE Belegangabe dieses Plans, nicht nur für die Mutationstafel:**
  die Zeilen wandern in diesem Repo schnell, und die Vorabprüfung dieses Plans hat rund zwanzig
  Angaben gefunden, die um eine bis acht Zeilen verschoben waren oder hinter das Dateiende zeigten.
  Sie sind unten korrigiert — **wer eine davon benutzt, zählt sie am eigenen Arbeitsstand neu**
  (dieselbe Auflage, die `:1150` für `bootstrap.ts` und die Mutationstafel bereits tragen).
  ⚠️ **Die verlässlichste Form ist der Anker, nicht die Zahl:** ein `grep -n "<eindeutiger Text>"`
  findet die Stelle auch nach einer Verschiebung, eine Zahl allein nicht.
  ⚠️ **Ein Muster aus der Vorabprüfung, damit niemand es wiederholt:** sechs Belege auf
  `e2e/lagerbuch-hosts.spec.ts` lagen systematisch **+300** neben dem echten Ort — die Datei hat
  **273** Zeilen, jede Angabe darüber war falsch, jede Angabe darunter richtig. Zwei Messstände
  waren vermischt. **Wer eine Zeilenzahl notiert, notiert daneben die Zeilenzahl der Datei.**
* **Kein `git add .`, kein `-A`.** Namentlich stagen, mit `rtk git show --stat HEAD` nachsehen.
* **Commits müssen signiert sein** (main-Ruleset).
* **Migrationen sind append-only.** Dieser Planteil legt **keine** an.
* ⛔ **`getModuleDb()` wird in Tests NICHT benutzt** — sein Cache ist per Modulschlüssel gekeyt,
  nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`). Tests bauen ihre DB selbst und migrieren sie
  (Vorbild `src/app/m/lagerbuch/_db/migrations.test.ts:29-37`).
* ⛔ **Kein Worktree unter `.claude/worktrees/`** — das Verzeichnis liegt im Repo und vergiftet die
  Tore (251 Fremdfehlschläge, gemessen).
* ⛔ **Kein `pnpm build` vor einem Testlauf, den man ernst nimmt** — `.next/standalone/src/` ist eine
  vollständige Kopie des Quellbaums **inklusive Testdateien** (52 Fehlschläge).
* ⛔ **Kein `pnpm dev` parallel zur Testsuite.**
* **vitest 4.1.10, Node 26.** Node bringt ein eigenes `localStorage` mit, das jsdoms verdeckt — wer
  eine jsdom-Testdatei schreibt, die `localStorage` braucht, prüft das gesondert.
* **antd 6 ist das Design-System.** Dieser Planteil baut **keine** Oberfläche und berührt es nicht.

### Verbotene Namen und Muster

| Verboten | Warum | Beleg |
|---|---|---|
| `RADIO_ZUGANG_SITZUNG_STUNDEN`, `RADIO_ZUGANG_SITZUNG_SECRET`, `RADIO_AUSLEIH_SITZUNG_GEHEIMNIS` | verworfene Fassungen | B1, B2 (`Spec:90-91`) |
| `RADIO_ADMIN_API_URL`, `RADIO_ADMIN_API_TOKEN`, `RADIO_ADMIN_URL`, `POCKET_ID_*` für `radio` | entstehen nicht — die HTTP-Grenze fällt mit Entscheidung 15, `AdminUser` wandert nicht (Entscheidung 14) | B3; `Spec:6128-6140` |
| `starteRadioRetentionTakt` | Kapitel-2-Name, von B5 verworfen | `Spec:94` |
| `_lib/retention.test.ts` | „es gibt kein `retention.test.ts`, B5" | `Spec:94` |
| `src/app/api/health/radio/route.ts` | der `[modul]`-Handler ist bereits generisch; eine zweite Datei wäre eine zweite Wahrheit | `src/app/api/health/[modul]/route.ts:1-27` |
| ein `RADIO_HISTORIE_PURGE`- oder `RADIO_HISTORIE_ERSTLAUF_MINUTEN`-**Boot-Fehler** | §7.3.3 zählt **fünf** werfende Prüfungen, und keine davon ist eine Zahlenprüfung für diese zwei. Eine Prüfung, die niemand bestellt hat, ist am Cutover-Abend ein Startabbruch, den kein Kapiteltext rechtfertigt | E1 §6.1, `Spec:6042-6043` |
| eine zweite Zahlentabelle neben `ZAHLEN` | „zwei Tabellen wären zwei Wahrheiten" | `src/app/m/radio/_lib/grenzen.ts:53-56` |
| `navigator.serviceWorker.register` irgendwo unter `src/app/m/radio/` | der Abräum-Worker wird **nicht aktiv registriert** — er wird von der Update-Prüfung des Alt-Workers abgeholt | `Spec:5673-5678` |
| `manifest.webmanifest`, `rel="manifest"`, `metadata.manifest`, `beforeinstallprompt` unter `src/app/m/radio/` | `radio` bekommt **keine** PWA | `Spec:5511-5513`; G6 riegelt es ab |
| `toBeGreaterThanOrEqual` auf einer Zählzusage | NT11: „ein Wächter, der `>= 5` statt `= 6` prüft, bleibt grün und bewacht nichts" | `riegel.test.ts:98-100` (das NT11-Zitat; `:102-110` trägt die `toBe`-Begründung — die frühere Angabe `:107-110` traf den Beleg nicht) |
| `curl … manifest.webmanifest` als Beweis der PWA-Abwesenheit | prüft „die Abwesenheit von etwas, das kategorisch nicht entstehen kann: immer grün, und liest sich als Zusage" | Spec 2, V8/R36 |

### Das Tor je Aufgabe — es ist NICHT „volle Suite grün"

* `rtk pnpm typecheck` — **0 Fehler** (Exit-Code, nicht die Meldung; NT7)
* `rtk pnpm lint` — **0 Fehler**
* **die eigenen Testdateien der Aufgabe grün**
* **kein neuer Fehlschlag** in einer Datei, die der Diff nicht anfasst (gegen die selbst gemessene
  Grundlinie)

Streitfälle entscheidet die **Beiseitelege-Gegenprobe** (eigene Dateien temporär verschieben, voll
laufen lassen, zurücklegen) — nicht der Zählwert allein.

⛔ **Zusätzlich ab G5:** `rtk pnpm vitest run src/app/m/radio/riegel.test.ts` muss mitlaufen — der
Scan bewacht jede neue Fläche ab der ersten Zeile.
⛔ **Zusätzlich ab G2:** `rtk pnpm vitest run src/core/bootstrap.test.ts` muss mitlaufen.

`rtk pnpm build` und `rtk pnpm exec playwright test` laufen **einmal vor dem Merge**, nach den
Tests, **nie davor**. ⛔ **Ausnahme Block T:** dort ist Playwright das Tor der Aufgabe selbst und
läuft je Aufgabe — aber immer **nach** `vitest`, und nie mit einem parallelen `pnpm dev`.

---

## Die Bauform-Zulässigkeitstafel

| # | Was, wo | Zulässig? | Beleg |
|---|---|---|---|
| 1 | `"use client"` in `_lib/boot.ts`, `_lib/sw-quelle.ts`, `_lib/grenzen.ts` | ⛔ **nein** | Falle 6: ein WERT aus einem Client-Modul kommt in einer Server-Datei als Client-Referenz an, HTTP 500. `_lib/boot.ts:2` schreibt es bereits aus. |
| 2 | Icon-Import in einer dieser Dateien | ⛔ **nein** | Falle 7; die Dateien laufen im Instrumentation-Hook, bevor irgendetwas rendert |
| 3 | `throw` aus `radioBootFehler()` | ⛔ **nein** — sie **liefert** Meldungen | `Spec:5909-5911`; ein Wurf nähme den **ganzen Prozess** mit — alle **elf** Einträge in `src/core/registry.ts:53-213` (⚠️ **Spec-Abweichung R-G1-1**, Ledger `progress.md`: die Spec zählt hier sechs — Stand ihrer Abfassung 17.08.; die Auflage „kein `throw`" bleibt unberührt, nur ihre Zahl war zu klein) |
| 4 | `throw` aus `starteRadioHintergrund()` | ⛔ **nein** — synchron und wirft nie | `Spec:6015`; Vorbild `starteAufgabenScanArbeiter` |
| 5 | `async` bei `radioBootFehler()`, obwohl nichts darin asynchron ist | ✅ **ja, Pflicht** | die Naht daneben ist `...(await xBootFehler())`; eine synchrone Funktion lädt ein, das `await` zu vergessen — aus einem Startabbruch würde eine unbehandelte Rejection |
| 6 | `prodHostsFor(getModule("radio"), env).length === 0` als **erste** Anweisung von `radioBootFehler()` | ✅ **ja, Pflicht** | `Spec:5915-5917`; Vorbild `lagerbuch/_lib/boot.ts:43` |
| 7 | derselbe Host-Schalter vor dem **Retention-Timer** | ⛔ **nein** | B5: „ein Riegel auf `SUITE_HOST_RADIO` wäre hier sogar schädlich" — eine vergessene Variable schaltete still die Löschrichtlinie ab, die der DSGVO-Grund für `borrower_name` ist |
| 8 | derselbe Host-Schalter vor der **Bestandswarnung** | ✅ **ja, Pflicht** | `Spec:6015-6020`: „eine Warnung über einen Bestand, den dieser Container gar nicht bedient, ist Lärm" |
| 9 | `setInterval` ohne `.unref()` | ⛔ **nein** | `src/app/m/files/_lib/boot.ts:179`: ein Skript-Aufruf (`scripts/import/*.ts`) hinge sonst am Timer |
| 10 | erster Purge-Lauf bei `t=0` | ⛔ **nein, niemals** | §2.7.2, Fall 1 — die Regressionssperre |
| 11 | Cutoff beim Registrieren merken statt bei jedem Lauf neu rechnen | ⛔ **nein** | ein Prozess läuft wochenlang |
| 12 | `requireRadioHost()` (werfende Form) in `sw.js/route.ts` | ⛔ **nein** | ein `notFound()` wäre `text/html`, der Browser bräche die Worker-Registrierung mit irreführender Meldung ab (`Spec:5624-5629`) |
| 13 | `hostAbweisung(req) ?? <Antwort>` in `sw.js/route.ts` | ✅ **ja, Pflicht** | `_lib/hostRiegel.ts:17-22`: der `??` macht „als erste Anweisung" **strukturell** wahr |
| 14 | ein `fetch`-Handler im Abräum-Worker | ⛔ **nein** | „drei Eigenschaften und kein Zeichen mehr"; ein `releaseBody` wäre toter Code (`Spec:5704-5718`) |
| 15 | ein fester Cache-Name statt `caches.keys()` | ⛔ **nein** | „ältere Stände können weitere hinterlassen haben, und dieser Origin gehört ab jetzt der Suite" (`Spec:5663-5666`) |
| 16 | `_lib/keine-pwa.test.ts` mit eigenem Kommentarschnitt | ⛔ **nein** | Auflage 6; er importiert einen **exportierten** Baustein aus `_lib/quelltextScan.ts` — welchen, entscheidet **E-G6a** (`ohneKommentare` für die Zeichenkettenverbote, siehe Bauform 29) |
| 17 | eine neue Datei `src/app/api/health/radio/route.ts` | ⛔ **nein** | der `[modul]`-Handler deckt sie |
| 18 | ein radio-spezifischer Fall in `src/core/health/index.test.ts` | ⛔ **nein** | „die Funktion ist modul-agnostisch" (`Spec:5838-5849`) |
| 19 | ein Literal wie `"http://radio.localtest.me:3100"` oder `"iuk-radio-admin"` in einer e2e-Spec | ⛔ **nein** | alles aus `e2e/helpers/radio.ts` — sonst bezeugt ein falscher Wert einen Riegel-404 als bestandenen Test (`e2e/helpers/radio.ts:5-11`) |
| 20 | `groups: []` in `devLogin` | ⛔ **nein**, `groups: ""` | die Signatur nimmt einen String (`e2e/fixtures.ts`, `e2e/lagerbuch-hosts.spec.ts:263`) |
| 21 | eine Umgebungsvariable für e2e in `.env.local` | ⛔ **nein**, nur in `webServer.env` | eine dort gesetzte Variable hat Vorrang vor jeder `.env`-Datei; der Lauf wäre nicht rot, sondern **rennabhängig grün** |
| 22 | ein e2e-Fall, der nur auf eine Folgewirkung wartet statt die Antwort zu prüfen | ⛔ **nein** | Falle 10, zweite Testregel: jede abgelehnte Antwort liefe still ins Zeitbudget und meldete sich als etwas anderes |
| 23 | `page.goto` für einen Pfad mit nicht-HTML-`Content-Type` in der Host-Schleife | ⛔ **nein**, `page.request.get` | löst sonst `net::ERR_ABORTED` aus (`e2e/lagerbuch-hosts.spec.ts:137`) |
| 24 | ein `.click()` auf einen Anker in `FullShell` ohne Ruhewarten | ⛔ **nein**, `klickeWennRuhig` | Falle 12 |
| 25 | die Zahl `12` als Literal in einer e2e-Sitzungszusage | ⛔ **nein** | §8.2.2: „die Grenze relativ zum konfigurierten Wert, nie die Zahl 12" |
| 26 | `getModuleDb()` in einer Testdatei dieses Planteils — ⛔ **auch MITTELBAR über `getDb()`** | ⛔ **nein** | Cache per Modulschlüssel, nicht per `DATA_DIR` (`src/core/db/index.ts:25-36`). `getDb()` **ist** `getModuleDb("radio", schema)` (`src/app/m/radio/_db/client.ts:22-24`) — wer nur den direkten Aufruf verbietet, verbietet nichts. Der zulässige Weg steht in **G4** (`vi.mock("../_db/client")`) |
| 27 | `page.request.get(...)` **ohne** `maxRedirects: 0`, wo die Zusage der **Statuscode einer Umleitung** oder deren `Set-Cookie` ist | ⛔ **nein** | Playwrights `page.request` folgt Umleitungen **standardmäßig** — der Fall sähe Status und Kopfzeilen der **Endseite**, nie die 303 und nie ihr `Set-Cookie`. Das Haus schreibt den Griff aus: `e2e/lagerbuch-helfer.spec.ts:187` („`page.request` MIT `maxRedirects: 0`, **NICHT** `page.on(\"response\")`"), Fall `:194-201`; Kette hop-für-hop `:285`, `:302`, `:308`. Ebenso `e2e/radio-verwaltung.spec.ts:1137`, `:1148` |
| 28 | ein Quelltext-Scan, der den **Endungsfilter vor** `statSync(...).isDirectory()` anwendet | ⛔ **nein** | ein Verzeichnis mit Punkt im Namen ist hier Hausform (`src/app/m/qr/sw.js/route.ts`, und **G5 legt `src/app/m/radio/sw.js/` an**). `/\.tsx?$/.test("sw.js")` ist **falsch** — der Scan überspränge `sw.js/route.ts` samt Unterbaum, und die `toBe(N)`-Zahl stimmte trotzdem, weil sie am selben kaputten Lauf gemessen wurde. Hausform: `_lib/bauform.test.ts:174-181`, `riegel.test.ts:184-191` — **`isDirectory()` zuerst** |
| 29 | `bereinigt()` als Baustein für ein **Zeichenketten**-Verbot | ⛔ **nein**, `ohneKommentare()` | `bereinigt` leert jedes `"`/`'`/Backtick-Literal (`quelltextScan.ts:117-127`, aufgerufen `:208-209`). Eine verbotene Zeichenkette, die nur **innerhalb** eines Literals stehen kann, ist danach **nie** auffindbar. Siehe **E-G6a** |

---

## Die Sperrtafel

### 1. Vorbedingungen

| # | Was | Status | Beleg |
|---|---|---|---|
| P1 | `_lib/boot.ts` trägt die Retention-**Rechnung** | ✅ | `src/app/m/radio/_lib/boot.ts:25` (`RETENTION_MONATE_VORGABE`), `:40-44` (`retentionGrenze`), `:62-69` (`raeumeLeihhistorie`) — ⛔ **die Datei hat 69 Zeilen**; die früheren Angaben `:36`/`:51-55`/`:73-80` waren falsch bzw. hinter dem Dateiende |
| P2 | `_lib/hostRiegel.ts#hostAbweisung` existiert (vierte Riegelform) | ✅ | `src/app/m/radio/_lib/hostRiegel.ts:33-37` |
| P3 | `_lib/quelltextScan.ts` exportiert `ohneKommentare` und `bereinigt` | ✅ | `:61`, `:208` |
| P4 | `_lib/grenzen.ts` führt `ZAHLEN` mit den vier Kapitel-3-Zahlen und `ausleihSitzungGeheimnis()` | ✅ | `:62-105`, `:212-222` — ⛔ **die Datei hat 222 Zeilen**; `:212-228` zeigte hinter das Dateiende |
| P5 | `MODULE_MIGRATIONS` trägt `radio`; das Registrierungs-Dreieck steht | ✅ | `src/core/bootstrap.ts:49-56` |
| P6 | `src/app/api/health/[modul]/route.ts` ist generisch | ✅ | `:1-27` |
| P7 | `routen.test.ts` führt `/sw.js` bereits als Rewrite-Ziel | ✅ | `src/app/m/radio/_lib/routen.test.ts:122-132` |
| P8 | `riegel.test.ts` Klausel (c) lässt `hostAbweisung` als Alternative zu | ✅ | `riegel.test.ts:441-450` |
| P9 | `e2e/helpers/radio.ts` führt Host, Fremdhost, Port, beide Gruppen | ✅ | `RADIO_HOST` `:15`, `FREMDER_HOST` `:26`, `RADIO_PORT` `:29`, `RADIO_ADMIN_GRUPPE` `:40`, `RADIO_UPDATER_GRUPPE` `:51`, `RADIO_ENV` `:78-81` — die frühere Sammelangabe `:38-101` deckte drei der fünf nicht |
| P10 | `scripts/seed-lokal.ts radio` läuft im Playwright-Start | ✅ | `playwright.config.ts:157-158` |
| P11 | `_lib/seedLokal.ts` legt einen aktiven und einen gesperrten Code an | ✅ | `:96-97` |
| P12 | `radioBootFehler()` existiert | ⛔ **nein — G2** | `src/core/bootstrap.ts:90-103` führt nur `files` und `lagerbuch` |
| P13 | `starteRadioHintergrund()` existiert | ⛔ **nein — G4** | `src/core/bootstrap.ts:129-134` |
| P14 | `sw.js/route.ts` existiert | ⛔ **nein — G5** | `HANDLER_ANZAHL = 4` (`riegel.test.ts:145`) |
| P15 | Der Suite-Admin-Kurzschluss in `src/core/groups.ts:125` ist entfernt | ⏳ **eigener Plan, außerhalb dieses Wegs** | war Vorbedingung von Planteil 4; dieser Planteil baut ihn **nicht** und hängt nicht daran |
| P16 | Der `proxy.ts`-Umbau ist ausgerollt | ⏳ **wartet auf den Betreiber** | `docs/superpowers/berichte/2026-08-22-proxy-rewrite-abnahme.md` — dieser Planteil hängt **nicht** daran |

### 2. Leerstellen, die dieser Planteil ENTSPERRT

| ⬜ | Was | Wodurch |
|---|---|---|
| **A-L7** | „Es gibt für dieses Modul heute keine Boot-Prüfung auf das Geheimnis" (`_lib/grenzen.ts:206-210`, Eigentümer namentlich Planteil 5) | **G1** |
| **L11** | Was `radio.iuk-ue.de/manifest.webmanifest` liefert | **G6/G7** liefern die Bauform-Hälfte (es entsteht kategorisch keins); die Server-Hälfte bleibt ⬜ **G-L6** |
| **L12** | Der Ablesepunkt in den Browser-Entwicklerwerkzeugen | **G5** liefert das Messrezept, der Wert bleibt ⬜ **G-L7** |
| **N4 / Z-L1 (Restmenge)** | Wirknachweis der Riegel bei echtem Abruf für den **Ausleihzweig**, die **Host-Schleife**, den **`(druck)`-Zweig** und die neuen Flächen | **T2–T5** |

### 3. Leerstellen, die dieser Planteil NEU benennt

| ⬜ | Frage | Wer liest sie wann ab | Vorbelegung |
|---|---|---|---|
| **G-L1** | Der genaue Wortlaut der `console.info`-Zeile für `RADIO_HISTORIE_PURGE=0` — die Spec sagt nur „meldet ‚Retention abgeschaltet‘" (`Spec:5986`), keinen vollständigen Satz | **G4** legt ihn fest; **Spec 2** liest ihn als Grep-Anker für §4.6 Nr. 9 und Nr. 14 aus dem gebauten Quelltext ab | keine — der Anker steht erst nach G4 fest |
| **G-L2** | ⛔ **ENTSCHIEDEN, nicht mehr offen.** Die Zeile „`radio.db` existierte vor diesem Start nicht" wandert nach **`radioBootFehler()`** (G2) und wird dort mit `existsSync(moduleDbPath("radio"))` geprüft — als **`console.info`**, nicht als `warn`. **Der Grund ist gemessen**, siehe die Begründung unter „Die vier Melde-Zeilen" | **G2** baut sie; **Spec 2** liest ihre **Abwesenheit** beim Cutover-Start nach dem Import (Zusage 16) | ⛔ **Die alte Vorbelegung „`existsSync` vor dem ersten `getDb()` in `starteRadioHintergrund()`" ist GESTRICHEN, nicht bezweifelt: sie ist TOT.** `src/instrumentation.ts:56` ruft `migrateAllModules()` **vor** `:60` `startBackgroundWork()`; `src/core/bootstrap.ts:107-112` öffnet für **jeden** Eintrag aus `MODULE_MIGRATIONS` — `radio` steht dort — `openModuleDatabase(moduleDbPath(key))`, und `src/core/db/index.ts:12-17` legt Verzeichnis und Datei **an**. Wenn `starteRadioHintergrund()` läuft, existiert `radio.db` **immer**. Eine von vier zugesagten Melde-Zeilen wäre nie gefeuert |
| **G-L3** | Signatur und Verhalten von `stoppeRadioHintergrund()` — die Spec nennt **nur den Namen** (`Spec:1555`) | **G4**, nach dem Vorbild `stoppeAufraeumTimer()` (`files/_lib/boot.ts:183`) | `(): void`, wirft nie, setzt Uhr und Laufflagge zurück |
| **G-L4** | Ob `radioBootFehler()` und `starteRadioHintergrund()` denselben `EnvLike`-Parameterstil teilen — für die zweite schreibt die Spec **keine** Signatur aus | **G4** | ja, aus Testbarkeit: `starteRadioHintergrund(env: EnvLike = process.env): void` |
| **G-L5** | ⬜ **L5** weitergeführt: welches Feld der Antwort von `/api/health/radio` den **Modulnamen** und welches den **DB-Zugriff** belegt | **Spec 2**, am laufenden Container vor Cut 19; **G7** schreibt das Ablese-Rezept | `{ status, module, revision }` — gemessen an `src/core/health/index.ts:10` (`return { status: "ok", module: key }`, der Fehlerzweig `:12`; `:13` ist `} finally {`) und `src/app/api/health/[modul]/route.ts:23-26` (dort kommt `revision` dazu, **nicht** aus `checkModuleHealth`). Der **Rumpf im Betrieb** ist nicht abgelesen |
| **G-L6** | ⬜ **L11** weitergeführt: was `curl -si https://radio.iuk-ue.de/manifest.webmanifest` **tatsächlich** liefert (Portal-Fallback, 404, oder etwas Drittes) | **Spec 2**, beim ersten Deploy | keine — ein geratener Wert wäre genau die Zusage, die V8/R36 verbietet |
| **G-L7** | ⬜ **L12** weitergeführt: der genaue Ablesepunkt in den DevTools (Application → Service Workers / Cache Storage) und was dort **nach** dem Abräumen steht | **Spec 2**, §4.7.2 Hälfte 2, an einem **echten Gerät** — „`curl` hat keinen Service Worker" | keine |
| **G-L8** | Das `datum` der Release-Notizen — der Tag des **Rollouts**, nicht des Commits | **Betreiber**, über Spec 2; ⬜ **V-L10** aus Planteil 4 läuft hier zusammen | keine; das Rezept steht in „Was Planteil 5 NICHT liefert" |
| **T-L1** | Welche Zelle aus welcher `render`-Funktion die Zusagen der Fälle 7 und 8 tragen | **T5**, gemessen an den **Suite**-Dateien `src/app/m/radio/admin/(arbeit)/geraete/GeraeteTabelle.tsx` (**15** `render:`) und `src/app/m/radio/admin/(arbeit)/ausleihen/AusleihenTabelle.tsx` (**8** `render:`) | keine — die Spalte wird beim Bau gewählt und namentlich belegt. ⛔ **`deviceColumns.tsx` und `LoanList.tsx` sind Dateien des ALT-Bestands und existieren in diesem Repo nicht** (`find src -iname "*deviceColumns*" -o -iname "*LoanList*"` → leer; sie liegen unter `/Users/rubeen/dev/personal/drk/radio-admin/client/src/features/{devices,loans}/`). Die frühere Zahl „sieben" stand in **keiner** der drei möglichen Quellen: Alt-`LoanList.tsx` hat **5**, die Suite-Entsprechung **8**, und `Spec:6874` nennt für die Leihliste **gar keine** Zahl. ⚠️ **15 und 8 sind `grep -c "render:"`-Werte vom 26.08.2026** — sie zählen Vorkommen, nicht Spalten, und werden am Bautag neu gemessen |
| **T-L2** | Die tatsächlichen Statuscodes der vier Kiosk-Stationen (200 vs. 303) und der Einlöse-Route | **T2**, beim ersten Lauf; sie werden als **Messwerte** notiert, nicht als Zusagen erfunden | `t/[code]` → 303 laut `Spec:6817`; die drei Ausleihflächen → 200 |
| **T-L3** | ⬜ **V-L14** übernommen: die Wirkprobe des **Personen**riegels in `admin/(druck)/layout.tsx` | **T5.** ⚠️ Eigentümer war laut `riegel.test.ts:81-87` (Kern `:84-86`) „die Schlussprüfung von Planteil 4"; sie hat ihn nicht abgelesen. Planteil 5 übernimmt ihn **ausdrücklich**, statt ihn weiterzureichen. ⛔ **`:88-92` ist der Absatz „ZWEI FORMEN" und NICHT V-L14** — die frühere Angabe (viermal im Plan) traf den falschen Absatz | keine |
| **T-L4** | Welcher Testname bei welcher der acht Mutationen genau rot wird | **T6**, beim Fahren der Proben; die Spec nennt die Erwartung, der Bericht nennt die Messung | die Erwartungsspalte der Mutationstafel unten |

⚠️ **Was dieser Plan NICHT als Leerstelle führt, obwohl es naheliegt:** die Zahl `2` in
`RETENTION_MONATE_VORGABE` (sie ist 1:1 aus `radio-admin/server/src/services/retentionService.ts:9`
übernommen und belegt), die Zahl `1440` in `RADIO_HISTORIE_ERSTLAUF_MINUTEN` (B5 entscheidet sie),
und der Cache-Name des Alt-Kiosks (gemessen, siehe unten). Für keine dieser drei ist etwas offen.

---

## Die Entscheidungen, die dieser Plan fällt

### E-G1 — Die vier Kapitel-3-Zahlen, das Geheimnis und die Gate-Kopplung werden in `_lib/grenzen.ts` geprüft, nicht in `_lib/boot.ts`. Es entsteht **kein** `zahlFehler`

**Der Kapiteltext (Spec §7.3.3, `:5951-5955`) schreibt einen Helfer in `boot.ts` aus:**

```
function zahlFehler(name: string, roh: string | undefined, min: number, max: number): string | null;
```

und B18 ergänzt: „Der Boot-Helfer aus Kapitel 7 (`zahlFehler`) prüft **genau diese drei**"
(die `RADIO_GATE_*`-Zahlen).

**Der gebaute Bestand sagt etwas anderes, und er sagt es namentlich über Planteil 5.**
`src/app/m/radio/_lib/grenzen.ts:52-56`, wörtlich:

> „Die Tabelle aus Spec:2034-2040 und Spec:3004-3009, vollständig — die EINZIGE Quelle. `grenzen()`
> liest von hier, und **ab Planteil 5 wird `radioBootFehler()` dieselbe Tabelle lesen**; zwei
> Tabellen wären zwei Wahrheiten, und der Boot prüfte etwas anderes als das, was zur Laufzeit gilt."

Und `:166-170`, ebenfalls über diesen Planteil:

> „KEINE KOPPLUNGSPRÜFUNG hier. Die Gate-Ungleichungskette (Absender <= gesamt/min <= gesamt/h) ist
> eine BOOT-Prüfung und gehört zu `radioBootFehler()` in Planteil 5 (B8, Spec:97): der Boot will
> ALLE Fehler auf einmal melden, nicht den ersten."

Und `:206-210` (⬜ A-L7):

> „ES GIBT FÜR DIESES MODUL HEUTE KEINE BOOT-PRÜFUNG AUF DAS GEHEIMNIS. … Abgelesen wird die
> Leerstelle **von Planteil 5** beim Bau von `radioBootFehler()`."

**Verbindlich:** Ein `zahlFehler` in `boot.ts` entsteht **nicht**. Stattdessen bekommt
`_lib/grenzen.ts` eine Funktion `grenzenFehler(env): string[]` — genau die Bauform, die `lagerbuch`
trägt und die `lagerbuchBootFehler()` in einer Zeile konsumiert
(`src/app/m/lagerbuch/_lib/boot.ts:29`, `:47`). Sie umfasst:

1. die vier Zahlen aus `ZAHLEN`, über den bestehenden `zahl()`-Pfad — durch Abfangen von
   `GrenzenUngueltig`, **ohne** eine zweite Parse-Logik;
2. das Geheimnis: gesetzt, ≥ 32 Zeichen, **ungleich** `AUTH_SECRET` (⬜ A-L7);
3. die Gate-Ungleichungskette.

**Warum das keine Spec-Verletzung ist:** B18 entscheidet über **Namen**, nicht über Dateien; §7.3.3
beschreibt eine **Wirkung** („weitere `RADIO_GATE_*`-Zahlen werden von diesem Helfer geprüft"), und
die Wirkung tritt unverändert ein. Der einzige Unterschied ist, dass sie an der Stelle eintritt, an
der die Tabelle steht — und genau das verlangt der Bestand. Ein `zahlFehler` in `boot.ts` bräuchte
`min`/`max` je Variable und hätte sie **entweder** aus `ZAHLEN` importiert (dann müsste `ZAHLEN`
exportiert werden, was `grenzen.ts:96-105` ausdrücklich verbietet — der Satz „Wer `ZAHLEN`
exportierte, machte aus dem Test eine Tautologie" steht bei `:102`) **oder** sie
zweitgeschrieben — die zwei Wahrheiten.

⛔ **Der Name `zahlFehler` darf im Repo nicht auftauchen.** Wer ihn sucht, findet `grenzenFehler`
und den Grund im Kopfkommentar.

### E-G2 — `RADIO_AUSLEIH_SITZUNG_STUNDEN` bleibt bei `1..24`. Der Bereich `1..168` aus §7.3.3 wird **nicht** hergestellt

* **Kapitel 7 §7.3.3 Nr. 5 (Text vorher):** „`RADIO_AUSLEIH_SITZUNG_STUNDEN` gesetzt, aber keine
  ganze Zahl in `1..168`" — Begründung: „`0` machte jeden Code sofort wertlos, `100000` machte
  ‚zeitlich begrenzt‘ zur Behauptung. Obergrenze eine Woche."
* **Der Bestand aus Planteil 3 (gemessen, `_lib/grenzen.ts:76`):**
  `{ einheit: "Stunden", min: 1, max: 24, vorgabe: 12 }`, mit der ausgeschriebenen Begründung
  bei **`:63`**: „Obergrenze 24: eine Feldsitzung darf nie länger dauern als eine Schicht plus
  Puffer." (⛔ **nicht** `:73-75` — dort steht die B1-Namensbegründung.)

**Verbindlich: 24 bleibt.** Drei Gründe, in der Reihenfolge der Tragfähigkeit:

1. **24 ist die strengere Zusage.** Sie auf 168 zu weiten, ist keine Vervollständigung, sondern eine
   **Lockerung einer bereits ausgelieferten Grenze** — und zwar einer, die die Laufzeit heute
   erzwingt (`grenzen()` wirft bei 25). Ein Plan, der eine gebaute, begründete Verschärfung
   zurücknimmt, braucht dafür einen Auftrag; es gibt keinen.
2. **Die Tabelle ist die eine Quelle** (E-G1). Ein Boot-Bereich `1..168` neben einem
   Laufzeit-Bereich `1..24` wären genau die zwei Wahrheiten, die `grenzen.ts:53-56` verbietet: der
   Start ließe `48` durch, und die erste Einlösung würfe.
3. **Die Spec-Begründung trägt bei 24 unverändert.** „`0` macht jeden Code wertlos" und
   „`100000` macht ‚zeitlich begrenzt‘ zur Behauptung" sind bei `1..24` genauso erfüllt.

⚠️ **Was offen bleibt und nicht durch diese Entscheidung berührt wird:** ⬜ **A-L1** — die
**Vorbelegung** 12 ist der Vorschlag der Spec, nicht die Antwort des Betreibers
(`_lib/grenzen.ts:69-72`, `Spec:3279`: „Ob eine Schicht länger läuft, steht in keinem Repo").
Sie wird vor dem Cutover abgelesen und ändert genau eine Zeile in `ZAHLEN` und eine in
`.env.example`. **Planteil 5 setzt sie nicht.**

### E-G3 — `RADIO_HISTORIE_MONATE` wird in `_lib/boot.ts` geprüft, **nicht** in `ZAHLEN`

`ZAHLEN` ist ausdrücklich „die Tabelle aus Spec:2034-2040 und Spec:3004-3009" — eine
**Kapitel-3**-Tabelle. `RADIO_HISTORIE_MONATE` gehört Kapitel 7 §7.3.5 und ist über NS-M1
namentlich `_lib/boot.ts` zugewiesen. Drei Gründe gegen eine Zeile in `ZAHLEN`:

1. `ZahlRegel` verlangt ein `max`. **Die Spec gibt für `RADIO_HISTORIE_MONATE` keine Obergrenze**
   („keine ganze Zahl ≥ 1"). Eine erfundene Obergrenze verstieße gegen die eiserne Regel.
2. Die `Einheit`-Union kennt „Monate" nicht, und `grenzen.ts:38-42` warnt: „Ein ungenutztes Wort in
   dieser Union wäre ein Angebot an den nächsten Leser, eine Zahl mit falscher Einheit einzutragen."
3. `ZAHL_NAMEN` (`grenzen.ts:106`) wird von `grenzen.test.ts` gegen eine dort geführte
   Erwartungstabelle gespiegelt; eine Zeile ohne `max` bräche diese Spiegelung.

**Verbindlich:** `_lib/boot.ts` bekommt zwei kleine, namentliche Funktionen —
`historieMonate(env): number` (liest, wirft bei ungültig) und
`historieMonateFehler(env): string | null` (fängt und formuliert). ⛔ **Kein generischer Helfer** —
ein generischer lüde dazu ein, die Kapitel-3-Zahlen dort ein zweites Mal zu prüfen.

⛔ **`0` wird ausdrücklich abgewiesen, nicht als „aus" gelesen.** `0` Monate löschte beim ersten
Lauf die gesamte abgeschlossene Historie. Abschalten geht über `RADIO_HISTORIE_PURGE=0`.
Der Testfall dafür steht **einzeln**, nicht in einer Tabelle mit `-1` und `abc` versteckt
(`Spec:6092-6108`).

### E-G4 — Es entstehen **acht** Boot-Prüfungen: fünf werfende, eine gekoppelte, zwei meldende. Jede hat einen schriftlichen Eigentümer

⛔ **„Fünf" aus §7.3.3 ist die Zahl der Prüfungen, die Kapitel 7 selbst aufzählt — nicht die Zahl
der Prüfungen, die `radioBootFehler()` am Ende trägt.** Wer nur fünf baut, lässt zwei liegen, die
der Bestand namentlich diesem Planteil zuweist. Wer neun baut, hat eine erfunden. Die Tafel steht
unten unter „Die acht Boot-Prüfungen".

### E-G5 — Der Abräum-Worker löscht `caches.keys()`, und der Test nennt den **gemessenen** Alt-Namen zusätzlich

**Gemessen am Alt-Bestand** (`/Users/rubeen/dev/personal/drk/radio-inventar/apps/frontend/public/sw.js`,
ganze Datei gelesen):

| Tatsache | Beleg |
|---|---|
| Es gibt **genau einen** Cache-Namen: `radio-inventar-v1` | `sw.js:2` (`const CACHE_NAME = 'radio-inventar-v1';`) |
| `install` precacht darunter | `sw.js:20-21` |
| API-Antworten landen darunter | `sw.js:63`, `:107`, `:122` |
| Navigationsantworten landen darunter | `sw.js:84` |
| `activate` löscht jeden Cache, dessen Name **nicht** `CACHE_NAME` ist | `sw.js:32-36` |
| Registrierung: Root-Scope `'/'` | `apps/frontend/src/hooks/usePWA.ts:73` — ⛔ **`:72` ist die `if`-Zeile darüber.** Dieses Repo hat den Fehler bereits einmal schriftlich korrigiert (`src/app/m/radio/_lib/routen.test.ts:124-127`, Vorabscan-Fund F15); er darf nicht wieder eingeführt werden |
| Ein zweiter Cache-Name existiert im Alt-Kiosk **nicht** — geprüft über **alle ELF** `caches.`-Vorkommen der Datei | `sw.js:20, 32, 36, 63, 71, 84, 91, 92, 101, 107, 122` — ⛔ **`:36` (`.map((name) => caches.delete(name))`) fehlte in der früheren Liste**, ausgerechnet die Zeile, die den `activate`-Löschzweig trägt. Die Schlussfolgerung („genau **ein** Name") bleibt unberührt; die Zählung, die sie belegen soll, war falsch — und „wer ‚alle‘ schreibt, zählt vorher" gilt auch für diesen Plan |

⛔ **Der Worker löscht trotzdem `caches.keys()`, nicht diesen einen Namen** — so schreibt es
`Spec:5635-5656` aus, und die Begründung `:5663-5666` trägt: der Alt-Worker löscht selbst nur
**fremde** Namen, „über frühere Stände auf dem jeweiligen Telefon sagt das nichts". Ein Worker, der
nur `radio-inventar-v1` räumt, ließe den Cache eines Alt-Alt-Standes stehen.

⛔ **Und weil ein Worker, der die falschen Caches räumt, grün und wirkungslos ist, nennt der Test
den gemessenen Namen ausdrücklich:** neben dem Fall „er löscht ALLE Cache-Namen, nicht nur
radio-inventar-v1" (drei erfundene Fake-Namen, keiner Präfix des anderen) steht ein **zweiter**
Fall, der `radio-inventar-v1` als vierten Fake-Namen einspeist und zusichert, dass **auch er**
gelöscht wird. Der eine Fall beweist die Breite, der andere die Treffsicherheit — und die Messung
steht damit in der Datei, nicht nur in diesem Plan.

⚠️ **Das ist eine bewusste Abweichung von der Spec-Fixtur, und sie steht hier, statt still zu
bleiben.** `Spec:5757` schreibt für den Breitenfall wörtlich: „Fake-`caches.keys()` liefert
`[\"radio-inventar-v1\", \"radio-inventar-v0\", \"sonstiges\"]`; nach `activate` ist `caches.delete`
für **alle drei** gerufen. **Drei unterschiedliche Namen, keiner davon Präfix des anderen**" — der
gemessene Name steht dort also **im** Breitenfall. Dieser Plan trennt Breite und Treffsicherheit in
**zwei** Fälle, ⛔ **weil nur die Trennung durch Sonde S-G5b falsifizierbar ist**: ersetzt man
`caches.keys()` durch `[\"radio-inventar-v1\"]`, wird der Breitenfall rot und der Treffsicherheitsfall
bleibt grün — genau das Paar beweist, dass die zwei Fälle Verschiedenes messen. Netto ist die
Planfassung **nicht schwächer** als die Spec-Fixtur, sondern eine **Verschärfung**.

### E-G6 — Der fünfte Quelltext-Scan heißt `_lib/keine-pwa.test.ts`, ist ein **Konsument** von `_lib/quelltextScan.ts`, und zählt die Dateien, die er liest

⛔ **Er implementiert den Kommentarschnitt nicht erneut.** Er importiert seinen Baustein aus
`_lib/quelltextScan.ts` — **welchen, entscheidet E-G6a**, und die Antwort ist **nicht** für beide
Zusicherungsarten dieselbe.

### E-G6a — ⛔ Der Baustein wird je Zusicherungsart gewählt: `ohneKommentare` für die Zeichenkettenverbote, `bereinigt` nur für Struktur

**Der Befund, gemessen, und er hätte den ganzen Scan blind gemacht.** `bereinigt` ist
`ohneRegexLiterale(ohneKommentareUndZeichenketten(q)).replace(/\/\/.*$/gm, "")`
(`quelltextScan.ts:208-209`), und `ohneKommentareUndZeichenketten` ersetzt **jedes** `"`-, `'`- und
Backtick-Literal durch Leerzeichen (`:117-127`). Daraus folgen zwei Dinge, die zusammen den Scan
wertlos machen:

1. ⛔ **Drei der fünf verbotenen Zeichenketten können im Quelltext NUR INNERHALB eines Literals
   stehen** — `manifest.webmanifest` ist ein Pfad, `rel="manifest"` trägt selbst ein Literal,
   `beforeinstallprompt` ist das Argument eines `addEventListener`. Nach `bereinigt` sind sie
   **nie** auffindbar. Der Scan wäre für 3/5 seiner Zusagen **still leer**.
2. ⛔ **`_lib/sw-quelle.ts` ist zu praktisch 100 % ein Template-Literal.** Nach `bereinigt` bleibt
   von `export const RADIO_SW_ABRAEUM_QUELLE = \`…\`;` genau
   `export const RADIO_SW_ABRAEUM_QUELLE =   ;` übrig — die Datei, die am ehesten ein
   `serviceWorker.register` enthielte, ist für den Scan **leer**.

**Verbindlich:**

| Zusicherungsart | Baustein | Warum |
|---|---|---|
| **Zeichenkettenverbote** (alle fünf Muster, und der Existenzfall) | ⛔ **`ohneKommentare` (`:61`)** | er lässt Zeichenketten **absichtlich** stehen. Der Bestand schreibt den Grund aus (`quelltextScan.ts:55-59`): „Ein Scan darf **falsch-positiv sein und laut**, nie **falsch-negativ und still**." |
| **Struktur** (Klammer-, Körper-, Vorkommenszählungen — in dieser Datei **keine**) | `bereinigt` (`:208`) | dort schadet die geleerte Zeichenkette nicht, und die Regexliteral-Reparatur trägt |

⛔ **UND DIE VERSÖHNUNG MIT AUFLAGE 6, ausgeschrieben — sonst liest der nächste Prüfer diese
Entscheidung als Verstoß gegen eine bindende Auflage.** `KONTEXT.md:395` sagt: „Wer einen fünften
Scan anlegt, übernimmt sie [die dreiteilige Reparatur]." Die **Lehre** der Reparatur ist der Satz
aus `quelltextScan.ts:55-59`, nicht der Funktionsname `bereinigt`: ein Scan darf nicht
**falsch-negativ und still** sein. Für ein Zeichenkettenverbot ist `bereinigt` **genau die
falsch-negative, stille Form** — die Reparatur zu „übernehmen" heißt hier, den Baustein zu wählen,
der die Lehre einhält. ⛔ **Was NICHT erlaubt ist und was Auflage 6 wirklich verbietet: einen
eigenen `replace(/\/\/.*$/gm, "")` schreiben.** `ohneKommentare` ist ein **exportierter Baustein
derselben Datei**, kein Nachbau.

**Zwei Folgen, die in die Testtabelle gehören, damit sie niemand später „repariert":**

* Der Fall `der Scan sieht durch einen Kommentar hindurch` trägt weiter: `ohneKommentare` entfernt
  Blockkommentare und Zeilen, deren **getrimmter Inhalt mit `//` beginnt** (`:55-59`).
* ⛔ **Ein NACHGESTELLTES `// … manifest.webmanifest` am Ende einer Codezeile wird gemeldet.** Das
  ist **falsch-positiv mit Absicht** und die gewollte Richtung. Der Satz steht im Kopfkommentar der
  Datei, sonst „repariert" ihn jemand zurück auf `bereinigt`.

⚠️ **Und damit ändert sich die Auflage-6-Sonde.** **S-G6b** kann nicht mehr „`bereinigt` durch einen
naiven Schnitt ersetzen" lauten — siehe die neue Fassung in G6.

⛔ **Er trägt eine Zählzusage.** Ein Scan über „alle Dateien unter `src/app/m/radio`", der still auf
null Dateien läuft (falscher Pfad, geänderte Endungenliste), ist leer-grün. Also: die Zahl der
gescannten Dateien steht als `toBe(<gemessen>)` — und die Zahl wird **beim Bau gemessen**, nicht
hier geraten (⬜ ist sie nicht: sie ist zum Zeitpunkt des Baus ablesbar und gehört in denselben
Commit).

⚠️ **Zur Einordnung, damit die Zählung in `KONTEXT.md` nicht verrutscht:** `_lib/quelltextScan.ts`
ist **nicht** einer der vier Scans, sondern ihr gemeinsamer Helfer. `keine-pwa.test.ts` ist der
**fünfte Scan** und der **fünfte Konsument** des Helfers. `_lib/bauform.test.ts` und
`_actions/guards.test.ts` tragen die reparierte Bereinigung heute noch als eigene Kopie
(⬜ **V-L9**, „kein Bauwert in diesem Fenster", steht auf dem ClickUp-Board) — ⛔ **dieser Planteil
stellt sie nicht um.** Das wäre eine Änderung an drei fremden Wächtern für einen Nutzen, den kein
Tor misst.

### E-G7 — `/api/health/radio` bekommt **keine Datei**. Was entsteht, ist eine Abwesenheitszusage und ein Ablese-Rezept

`src/app/api/health/[modul]/route.ts:1-27` beantwortet `/api/health/radio` bereits heute, sobald
`radio` in der Registry steht (`src/core/registry.ts:197-199` — steht) und die Migration lief.
`checkModuleHealth` ist modul-agnostisch (`src/core/health/index.ts:1-16`).

**Verbindlich:**
* **keine** Datei `src/app/api/health/radio/route.ts`;
* **kein** radio-spezifischer Fall in `src/core/health/index.test.ts`;
* **kein** zweiter Endpunkt gegen Analyse-Falle 29 („health grün, null Geräte") — der Gegenzug ist
  ein **Runbook-Schritt** mit sechs `COUNT(*)`, nicht Code (`Spec:5775-5836`);
* stattdessen: ein e2e-Fall, der die Route auf dem **radio-Host** trifft (T4), plus das
  Ablese-Rezept für ⬜ G-L5 in G7.

⚠️ **Gegen den LEITPLAN ausgewiesen, nicht nur gegen die Spec** — der Auftrag verlangt die Prüfung
gegen beide. `docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md:91` führt
`/api/health/radio` in der Planteil-5-Zeile unter „**Erzeugt**". Gemessen **existiert die Route
bereits** (`src/app/api/health/[modul]/route.ts:1-27`, und `src/core/registry.ts:197-199` führt
`key: "radio"`). ⛔ **Was hier entsteht, ist die ZUSAGE und der Wirknachweis, nicht die Fläche** —
die Leitplanzeile ist damit eingelöst, nicht übergangen.

⚠️ **Die Nebenwirkung als Vor-Cutover-Prüfung ist der eigentliche Wert:** `getModule(key)` wirft bei
unbekanntem Key. **200 heißt „das Modul ist im Image", 503 heißt „falsches Image".**

### E-G8 — `radio-hosts.spec.ts` führt **vier** Einstiege in der Schleife plus **einen** eigenen Fall, nicht fünf in der Schleife

§8.4.3 nennt fünf Pfade: Ausleihe-Wurzel, Einlöse-Route mit gültigem Code, Abmelde-Handler,
`/m/radio/admin`, Manifest/Icon-Handler.

**Zwei davon lassen sich nicht als Listeneinträge bauen, und beide Gründe sind gemessen:**

1. **Die Einlöse-Route gehört nicht in die Schleife.** Der Eigen-Host-Arm der Schleife würde den
   Code **wirklich einlösen** — und damit die Vorbedingung des Falls zerstören, der die
   **Datenwirkung** prüft. Das Vorbild macht es genau so und schreibt den Grund aus
   (`e2e/lagerbuch-hosts.spec.ts:87-89`: „`/t/[code]` steht NICHT hier, weil er seinen eigenen
   Test unten hat: er ist die Zeile mit der Datenwirkung und verdient eine eigene, unmaskierte
   Zusicherung statt eines Listeneintrags").
2. **Es gibt keinen Manifest- oder Icon-Handler.** `radio` baut ausdrücklich keine PWA. Ein
   `curl`/`page.request` darauf prüfte „die Abwesenheit von etwas, das kategorisch nicht entstehen
   kann: immer grün, und liest sich als Zusage" (Spec 2, V8/R36). ⛔ **Der Slot wird nicht
   ersatzlos gestrichen** — er geht an `/m/radio/sw.js`, den einen Route Handler, den `radio` in
   dieser Klasse hat, und die Abwesenheit des Manifests beweist **G6** im Repo.

**Verbindlich, `EINSTIEGE` mit `toHaveLength(5)`:**

| # | Pfad | Eigen-Host erwartet |
|---|---|---|
| 1 | `/m/radio` | nicht 404 (das Gate) |
| 2 | `/m/radio/abmelden` | nicht 404 (303 nach `/m/radio`) |
| 3 | `/m/radio/admin` | nicht 404 (mit Admin-Gruppe: 200) |
| 4 | `/m/radio/admin/geraete/export` | nicht 404 (`GET`, `route.ts:70`) |
| 5 | `/m/radio/sw.js` | nicht 404 (200, `text/javascript`) |

⛔ **Die Klammerzusätze in Spalte 3 sind ERWARTUNGEN, keine Zusicherungen.** Die Schleife prüft je
Eintrag genau `not.toBe(404)` — **mit** folgenden Umleitungen, wie im Vorbild
(`e2e/lagerbuch-hosts.spec.ts:141-178`, `page.request.get` ohne `maxRedirects`). Ein `toBe(303)`
für Eintrag 2 stünde hier **nicht**; wer es einbaute, prüfte die Umleitung an einer Stelle, an der
sie nicht die Zusage ist. Der Statuscode **303** und sein `Set-Cookie` sind die Zusage von **T2**,
und dort gilt Bauform **27** (`maxRedirects: 0`).

⚠️ **Der Vorbild-Beleg zur Schleifenform, gemessen:** `test()` steht **innerhalb** der
`for`-Schleife (`e2e/lagerbuch-hosts.spec.ts:141-145`) — **ein Testfall je Eintrag**, nicht ein
Testfall für die ganze Schleife. Das ist für die Zählung unten tragend.

⛔ **`/m/radio/admin/import/hochladen` steht bewusst NICHT in der Liste** — gemessen exportiert die
Datei nur `POST` (`route.ts:81`). Next beantwortet ein `GET` dorthin mit **405, bevor der Handler
läuft**; der Host-Riegel käme auf dem fremden Host nie zum Zug, und der Fall wäre rot aus einem
Grund, der nichts mit dem Riegel zu tun hat. ⚠️ **Das ist eine Lücke, und sie steht hier, statt
verschwiegen zu werden:** der Host-Riegel dieses einen Handlers hat keinen e2e-Wirknachweis. Sein
Quelltext-Nachweis läuft (`riegel.test.ts` Klausel (c)), und ein POST-Fall mit gültigem
CSV-Rumpf auf einem fremden Host wäre ein e2e-Fall über einen Schreibweg, den Planteil 4 bereits
anderweitig deckt. **Wer ihn nachträgt, trägt ihn nach; wer ihn wegdefiniert, nicht.**

### E-G9 — `radio-tabellen.spec.ts` entsteht **nicht**. Ihre zwei Aufträge gehen an bestehende Dateien

§8.4.1 nennt fünf Spec-Dateien. Gemessen (E2 §2): `radio-verwaltung.spec.ts` existiert mit
**17** Testfällen und deckt §8.4.2 (je Seite ein Statusabruf) für alle zehn `/admin`-Seiten.

Die zwei Aufträge von `radio-tabellen.spec.ts`:
* **der Rundgang** über die vier Kiosk-Seiten — er wird von `radio-kiosk.spec.ts` (T2) **mitgetragen**,
  weil dessen Fluss alle vier der Reihe nach durchläuft; Bedingung ist, dass **jede Station ihre
  eigene Statusprüfung** trägt statt nur auf einen Folgezustand zu warten. Eine separate Datei für
  denselben Abruf wäre kein zusätzlicher Beweis.
* **die Zellen-Lücke** — sie geht als Ergänzung in `radio-verwaltung.spec.ts` Fälle 2 und 5 (T5),
  weil dort Insel, Host und Login bereits stehen und eine zweite Datei denselben Aufbau
  duplizieren müsste.

⛔ **Das ist eine Entscheidung aus Belegen, nicht aus Bequemlichkeit** — und sie wird im
Kopfkommentar von `radio-kiosk.spec.ts` ausgeschrieben, damit ein späterer Leser die fehlende Datei
nicht für ein Versehen hält.

### E-G9a — `e2e/radio-sw.spec.ts` entsteht **nicht**. Der eine `/sw.js`-Fall steht in `radio-hosts.spec.ts`

Die Spec benennt **zwei** e2e-Dateien, die dieser Plan nicht anlegt. Für `radio-tabellen.spec.ts`
steht der Handgriff in **E-G9** — für `radio-sw.spec.ts` fehlte er, und der Fall wanderte bisher
still unter anderem Namen nach `radio-hosts.spec.ts`. **Das wird hier nachgeholt.**

**Der Spec-Wortlaut, `:5765-5766`:** „Ein e2e-Fall `e2e/radio-sw.spec.ts` mit dem Namen
`\"GET /sw.js liefert den Abraeum-Worker\"` ist sinnvoll, sobald der Zwei-Host-Aufbau des Moduls
steht — **Zusage an das Test-Kapitel** … dieses Kapitel verlangt dort **genau einen** Fall."
Bestätigt in `Spec:6354`: „genau ein e2e-Fall fuer `/sw.js`, der die **Antwort** prueft".

**Verbindlich, mit drei Belegen:**

1. **Die Zusage ist „genau EIN Fall, der die Antwort prüft" — nicht „eine eigene Datei".** Die Spec
   nennt die Datei, das Kapitel zählt den **Fall**.
2. **`radio-hosts.spec.ts` ist der Ort, an dem der Fall billig ist:** `fremdUrl`/`radioUrl` und der
   Login mit `RADIO_ADMIN_GRUPPE` stehen dort bereits, und `/sw.js` braucht **beide** Hosts —
   404 auf dem fremden (Schleifeneintrag 5) und 200 auf dem eigenen (Fall 10). Eine eigene Datei
   duplizierte denselben Aufbau für einen Fall.
3. ⛔ **„Genau einer" ist eingehalten:** Fall 10 ist der einzige Fall, der die **Antwort** von
   `/sw.js` prüft. Der Schleifeneintrag 5 prüft die **Abwesenheit** auf dem fremden Host — das ist
   die Riegelzusage, nicht die Worker-Zusage.

⛔ **Der Verzicht wird im Kopfkommentar von `radio-hosts.spec.ts` ausgeschrieben**, mit dem
Spec-Anker `:5765-5766`, damit ein späterer Leser die fehlende Datei nicht für ein Versehen hält —
derselbe Handgriff wie bei E-G9.

### E-G10 — Die Bestandswarnung liest die Zahl der Geräte, und sie tut es **in** `starteRadioHintergrund()`

Nicht in `radioBootFehler()` — dort gäbe es die Tabellen noch nicht (B8). Nicht als eigener
Arbeiter — „damit Boot-Wissen nicht auf zwei Dateien fällt" (`Spec:6009-6011`).

⛔ **Nur sie steht hinter dem `prodHostsFor(...).length === 0`-Schalter.** Der Retention-Timer steht
**davor**, unbedingt (B5). Wer beide hinter denselben Schalter legt, schaltet mit einer vergessenen
`SUITE_HOST_RADIO` still die Löschrichtlinie ab.

---

## Die acht Boot-Prüfungen — jede mit ihrem schriftlichen Eigentümer

⛔ **Acht, und ich habe gezählt.** Fünf werfende aus §7.3.3, eine gekoppelte aus dem Bestand, zwei
meldende aus §7.3.4. Dazu vier Melde-Zeilen, die **nicht** Prüfungen sind, sondern Zustände.

### A. Die sechs werfenden — jede liefert einen String, und jeder String ist ein Startabbruch

⚠️ **Lesart:** `radioBootFehler()` wirft **nie**. Sie **liefert** Meldungen; `assertHostConfig`
entscheidet einmal, ob daraus ein Abbruch wird (`src/core/bootstrap.ts:100-102`, `errors.length > 0`).

| Nr. | Prüfung | Wo sie liegt | Beleg des Auftrags |
|---|---|---|---|
| 1 | `SUITE_ADMIN_GROUP_RADIO` fehlt oder ist leer | `boot.ts` | §7.3.3 Nr. 1; Analyse-Falle 23; Vorbild `lagerbuch/_lib/boot.ts:49-69` |
| 2 | `SUITE_ACCESS_GROUP_RADIO !== undefined` | `boot.ts` | §7.3.3 Nr. 2; Vorbild `lagerbuch/_lib/boot.ts:71-86` |
| 3 | `RADIO_AUSLEIH_SITZUNG_SECRET` fehlt, ist kürzer als 32 Zeichen, oder ist **gleich** `AUTH_SECRET` | `grenzen.ts` (E-G1) | §7.3.3 Nr. 3; ⬜ **A-L7** (`grenzen.ts:206-210`, Eigentümer namentlich Planteil 5) |
| 4 | `RADIO_HISTORIE_MONATE` gesetzt, aber keine ganze Zahl ≥ 1 (**`0` inklusive**) | `boot.ts` (E-G3) | §7.3.3 Nr. 4 |
| 5 | die vier Zahlen aus `ZAHLEN` gesetzt, aber ungültig | `grenzen.ts` (E-G1) | §7.3.3 Nr. 5 + B18 |
| 6 | die Gate-Ungleichungskette: Absender/min ≤ gesamt/min ≤ gesamt/h | `grenzen.ts` | **`grenzen.ts:166-170`**, wörtlich: „ist eine BOOT-Prüfung und gehört zu `radioBootFehler()` in Planteil 5" |

**Prüfung 1, im Detail — sie liest die Variable DIREKT:** nicht über `adminGroupsFor`, die sonst
still auf `mod.adminGroups` zurückfällt (`src/core/groups.ts:102-108`) und den
Entwicklungs-Vorgabewert meldete. Die Frage ist eine andere: **hat der Betreiber die produktive
Gruppe gesetzt?** `validateGroupConfig` meldet den leeren Admin-Wert bewusst nicht. Die Folge einer
leeren Pocket-ID-Gruppe ist ein **stummes 404 für ALLE Verwaltenden**, weil `radio` bewusst keine
Suite-Admin-Rückfallebene hat (Entscheidung 9). ⚠️ **Diese Prüfung fängt den LEEREN, nicht den
FALSCHEN Wert** — der Satz gehört wörtlich in die Meldung.

**Prüfung 2, im Detail:** ein gesetzter Wert wäre **still wirkungslos** — `canAccess` steigt bei
`requiresAuth: false` sofort mit `true` aus (`src/core/registry.ts:260-269`, die frühe Rückkehr `:265`) und liest `requiredGroups`
nie; `validateGroupConfig` meldet nur den **leer** gesetzten Fall. Die Meldung lautet: die Zeile
ersatzlos entfernen. ⛔ **Der Fall gilt für `=""` UND für `=irgendwas`** — beide je ein eigener Test.

**Prüfung 6, im Detail:** sie steht in `grenzenFehler()` und **nicht** in `grenzen()`, weil
`grenzen()` „dieselbe Auswertung ohne Gate liefern können muss — sonst gäbe es zwei Auswertungen und
damit zwei Wahrheiten" (`grenzen.ts:168-170`). Und weil der Boot **alle** Fehler auf einmal melden
will, nicht den ersten.

### B. Die zwei meldenden Prüfungen — `console.warn`, und jede ist ein Stopp-Punkt fürs Runbook

| Prüfung | Warum melden statt werfen | Beleg |
|---|---|---|
| `SUITE_HOST_RADIO` ist gesetzt, kommt aber in `SUITE_TRAEFIK_RULE` nicht vor (**beide** gesetzt, sonst still) | die Traefik-Labels leben serverseitig in der `.env`; ein Dev-Container hat die Variable legitim nicht; ein Abbruch träfe genau dann, wenn der Betreiber die `.env` gerade umstellt | `compose.yaml:149-153`, `:88` |
| `SUITE_TRAEFIK_RULE` enthält einen Host, der mit `radio-admin.` beginnt | der Alt-Host darf dort ausdrücklich **nicht** stehen — `moduleForHost` liefert sonst **portal** statt Redirect | Analyse-Falle 28 (`docs/radio-portierung-analyse.md:1646-1652`) |

⛔ **Die Grenzregel, wörtlich (`Spec:5936-5938`):** „Werfen darf nur, was `radio` für seine eigenen
Nutzer falsch macht und im Repo bzw. in der `.env` behebbar ist. Alles, was erst am Server sichtbar
wird und dort behoben werden muss, meldet — sonst steht die Suite am Cutover-Abend still, weil eine
Traefik-Zeile fehlt."

**Zusage an Spec 2:** das Runbook liest nach dem Start einmal
`docker compose logs --since 2m suite` und erwartet **keine** `radio:`-**Warnung**. Eine gefundene
Warnung ist ein **Stopp-Punkt, kein Hinweis.**

### C. Die vier Melde-Zeilen — sie sind keine Prüfungen

⛔ **ZWEI und ZWEI — die Überschrift dieses Abschnitts lautete früher „aus `starteRadioHintergrund()`"
und war schon damals falsch:** die `SUITE_UPDATER_GROUP_RADIO`-Zeile steht seit jeher in
`radioBootFehler()` (siehe die Reihenfolge-Tafel von G2, Zeile 6), und die `radio.db`-Zeile wandert
mit ⬜ G-L2 dorthin. **Die Spalte „Wo" steht deshalb ab jetzt in der Tabelle**, statt in der
Überschrift behauptet zu werden.

| Zeile | Wo | Stufe | Warum |
|---|---|---|---|
| `devices` ist leer | `starteRadioHintergrund()` | `warn` | vor dem Import legitim leer (Generalprobe, Dev); ein Wurf nähme sechs unbeteiligte Module mit. **Hinter** dem Host-Schalter (E-G10) |
| `radio.db` existierte vor diesem Start nicht | ⛔ **`radioBootFehler()`** (G2) | ⛔ **`info`, nicht `warn`** | ⛔ **In `starteRadioHintergrund()` könnte diese Zeile NIE feuern** — `src/instrumentation.ts:56` ruft `migrateAllModules()` **vor** `:60` `startBackgroundWork()`, und `src/core/bootstrap.ts:107-112` legt über `openModuleDatabase(moduleDbPath("radio"))` Verzeichnis **und Datei** an (`src/core/db/index.ts:12-17`). ⬜ **G-L2 ist damit entschieden, nicht offen.** `radioBootFehler()` läuft **vor** den Migrationen und sieht die Wahrheit; ein `existsSync` ist **kein** Tabellenzugriff und verletzt B8 nicht — der Wächter `radioBootFehler liest KEINE Tabelle` bleibt grün, weil `existsSync` nichts anlegt. **Hinter** demselben `prodHostsFor`-Schalter, der schon die erste Anweisung ist. ⛔ **`info` und nicht `warn`, aus der eigenen Regel dieses Plans:** beim **ersten Deploy** (der laut Auflage 1 den Abräum-Worker trägt und **vor** dem Import liegt) existiert `radio.db` legitim noch nicht — ein `warn` machte einen vorgeschriebenen, normalen Deploy zum Stopp-Punkt nach Zusage 1. Sie ist ein **Zustand**, kein Stopp. ⛔ **Ihre Alarmwirkung holt das Runbook**, indem es sie an einem benannten Punkt **nicht** sehen darf (Zusage 16) — dieselbe Bauform wie bei `RADIO_HISTORIE_PURGE=0` |
| `RADIO_HISTORIE_PURGE=0` — „Retention abgeschaltet" | `starteRadioHintergrund()` | ⛔ **`info`, nicht `warn`** | sonst triggert der **vorgeschriebene** Cutover-Zustand die eigene Stopp-Bedingung. ⛔ **Bei JEDEM Start neu geschrieben**, nicht nur beim ersten — sonst ist ein nach dem Fenster vergessenes `RADIO_HISTORIE_PURGE=0` ein **stiller** Verlust der Löschrichtlinie. ⬜ **G-L1** für den Wortlaut |
| `SUITE_UPDATER_GROUP_RADIO`: welcher Zustand gilt (gesetzt mit Wert / gesetzt und leer / nicht gesetzt) | `radioBootFehler()` | `info` | **NS-V4, wörtlich:** ein gesetzter, aber **leerer** Wert ist gültig („niemand ist Updater") und darf **nicht** abbrechen; ein Tippfehler ist von außen nicht unterscheidbar — **deshalb prüft der Boot-Helfer nicht den Inhalt, sondern meldet den Zustand LAUT beim Start.** ⬜ **E1b/V-L1**: wie die Gruppe heißt, weiß nur der Betreiber, fällig vor **Cut 26** |

⛔ **Die Regel, in einem Satz: `warn` = Stopp, `info` = Zustand.**

**Zusage an Spec 2:** der Schritt „Retention wieder einschalten" (§4.6 Nr. 14) endet mit einem
**zweiten** Log-Blick, in dem die Info-Zeile **fehlt**.

---

## Der Abräum-Worker — die Reihenfolge-Auflage, und wie man misst, dass er gewirkt hat

### Die Auflage

> ⛔ **Der Abräum-Worker aus Kapitel 7 gehört zum ERSTEN Deploy**, nicht zum Cutover. „Weil der
> Alt-Kiosk denselben Origin hält, überlebt sein Service Worker den Umschwenk — ohne Abräumen
> liefert er gecachte Alt-Oberfläche an Geräte aus, die nie neu geladen haben."
> (`docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md:100-110`)

**Was das für den Bau heißt, in drei Sätzen:**

1. **G5 ist keine Cutover-Aufgabe.** Sie wird gebaut, gemerged und **mit dem gewöhnlichen Deploy
   ausgeliefert**, lange bevor 6.7-Abschnitt D (Router-Schwenk) läuft.
2. **Die Route muss auf dem radio-Host erreichbar sein, bevor der Router schwenkt** — also muss
   `SUITE_HOST_RADIO` gesetzt sein, damit der Rewrite in `src/core/routing.ts:43-79` `/sw.js`
   extern auf `/m/radio/sw.js` intern abbildet. ⚠️ **Ohne die Variable greift der Rewrite nicht und
   `/sw.js` auf `radio.iuk-ue.de` landet im Portal-Modul** (§7.4.4, erster stiller Fall).
3. **Er wird nicht aktiv registriert.** Nichts in der Suite ruft
   `navigator.serviceWorker.register()`. Die Route wird ausschließlich von der **Update-Prüfung
   eines schon registrierten Workers** abgeholt: Browser holen das Worker-Skript bei einer
   Navigation im Scope neu und vergleichen die **Bytes**. Sie unterscheiden sich, der Abräum-Worker
   installiert sich, räumt auf, trägt sich aus. Auf einem Gerät, das den Alt-Kiosk nie geöffnet hat,
   wird die Route nie abgerufen — **das ist richtig und kein Fehler.**

⛔ **Freigabe-Zeile für den Merge dieses Planteils:** G5 ist die **einzige** Aufgabe, deren
Auslieferung eine Reihenfolge gegenüber Spec 2 trägt. Sie steht deshalb **nicht** am Ende des
Blocks G, sondern als fünfte von acht — früh genug, dass ein vorgezogener Teil-Deploy sie
mitnehmen kann.

### Die gemessene Cache-Lage des Alt-Kiosks

Siehe **E-G5** oben: **genau ein** Cache-Name, `radio-inventar-v1`, gemessen an
`radio-inventar/apps/frontend/public/sw.js:2` und an allen **elf** `caches.`-Vorkommen der Datei
(`:20, 32, 36, 63, 71, 84, 91, 92, 101, 107, 122`).
Der Worker löscht trotzdem `caches.keys()`; der Test nennt den gemessenen Namen zusätzlich
namentlich.

### Wie man misst, dass er gewirkt hat — zwei Hälften, und die erste beweist die zweite nicht

**Hälfte 1 — kopfgestützt, ohne Browser** (Spec 2 §3.2.6 V5/V6, §4.6 Nr. 5). Der Plan liefert die
drei Zeilen als Zusage an das Runbook; der e2e-Fall in **T4** prüft dieselbe Aussage im Lauf:

```
curl -s -H "$H" "$B/sw.js" | grep -c 'registration.unregister'   # MUSS >= 1
curl -s -H "$H" "$B/sw.js" | grep -c 'caches.keys'               # MUSS >= 1
curl -s -H "$H" "$B/sw.js" | grep -c 'addEventListener("fetch"'  # MUSS 0 sein
```

⚠️ **Kommt hier HTML oder Portal-Inhalt, greift der Rewrite nicht** — also ist `SUITE_HOST_RADIO`
falsch gesetzt (§7.1.4). Und auf einem **fremden** Host darf `/sw.js` ihn **nicht** liefern: das ist
`hostAbweisung` (B13), geprüft in T4.

**Hälfte 2 — an einem echten Gerät.** „`curl` hat keinen Service Worker."
Runbook-Zeile (**Zusage an Spec 2**, §4.6 Nr. 12): „Nach dem Umschwenk ein Telefon, das den
Alt-Kiosk kannte, einmal neu laden und prüfen, dass die Suite-Oberfläche erscheint."
Der genaue Ablesepunkt in den Entwicklerwerkzeugen ist ⬜ **G-L7** (= L12).

**Was man erwarten darf, und was nicht** (`Spec:5671-5684`): kein dauerhaft veraltetes HTML
(Navigationen sind network-first), **aber** der erste Seitenaufruf nach dem Umschwenk kann noch vom
alten Worker bedient werden — Worst Case **eine** veraltete Seitenansicht je Gerät, danach ist der
Origin frei. ⛔ **Wer mehr verspricht, verspricht etwas Ungemessenes.**

### Betreiberfrage 8 bleibt offen

Offline **schreiben** ist nicht entschieden, und dieser Planteil baut nichts, was sie vorwegnimmt:
der Abräum-Worker führt **keinen** Cache und **keine** Queue. Heute gilt: ohne Netz ist `radio`
nicht bedienbar — das war beim Alt-Kiosk ebenso, also **keine** Verhaltensänderung und **keine**
Ankündigung. ⚠️ Nicht zu verwechseln mit `STALE_GRACE_MS` (serverseitig, Ausleih-Kapitel) — dafür
baut dieses Kapitel keinen Ersatz; der Ersatz ist WAL + `busy_timeout` (B15).

---

## Die vierzehn e2e-Zusagen — was jede beweist, und welche Spec-Zeile sie einlöst

⛔ **Neun aus der ersten Tafel unten, plus die vier geschuldeten (10, 11, 12) und die
nachgetragene 13.** Die Zählung steht ausgeschrieben unter „Die Zählung — ZWEI Einheiten".

| # | Datei · Name | Was er beweist | Aufgabe |
|---|---|---|---|
| 1 | `radio-kiosk.spec.ts` · „Code am Gate einloesen, Geraeteliste, ausleihen, zurueckgeben" | echter Abruf über die RSC-Grenze; **jede Station mit eigener Statusprüfung** (trägt den Rundgang für die vier Kiosk-Seiten mit); 303 aufs Ziel; `Set-Cookie` der Ausleih-Sitzung **ohne** `Domain=`; die Ausleihe erscheint in der Liste aktiver Leihen; `returned_at` wird bei Rückgabe gesetzt | **T2** |
| 2 | `radio-zugang.spec.ts` · „Zugang ueber die Suite-Kachel, ohne Code" | angemeldet, Zugriff aus der Kachel: Ausleihe erreichbar **und in der Sache anonym** — die Journalzeile trägt den eingetippten Ausleihernamen, nicht die Kennung des Angemeldeten (Entscheidung 7) | **T3** |
| 3 | `radio-zugang.spec.ts` · „gesperrter Code am Gate" | benannte deutsche Meldung **am Feld**, nicht die stumme Landung des Bestands, **kein** Server-Exception | **T3** |
| 4 | `radio-zugang.spec.ts` · „Code sperren waehrend laufender Sitzung, dann neu laden" | Umleitung **über den Abmelde-Route-Handler** mit benanntem Grund; dessen Antwort trägt `Set-Cookie` mit `Max-Age=0` **ohne** `Domain=`; ein zweiter Aufruf landet danach ohne Umweg am Gate — geprüft über das **Antwortprotokoll**, nicht nur die Endadresse | **T3** |
| 5 | `radio-zugang.spec.ts` · „gesperrter Code an einer schreibenden Action" | deutsche Meldung am Formular, **kein Absturz**, eingetragene Felder bleiben stehen | **T3** |
| 6 | `radio-hosts.spec.ts` · „die Host-Schleife" (fünf Einstiege, E-G8) plus der Datenwirkungs-Fall für die Einlöse-Route | jeder Pfad über `fremdUrl(...)` mit 404 **und unverändert** (kein Umweg), dieselben über `radioUrl(...)` **nicht** 404 als Gegenprobe; `zugangscodes.last_used_at` nach dem Fremdversuch **differenziell unverändert** | **T4** |
| 7 | `radio-verwaltung.spec.ts` Fall 2 (Ergänzung) · „eine Geraetezeile zeigt ihren formatierten Wert, nicht das Rohfeld" | Zusicherung auf eine Zelle aus einer der **15** `render:`-Vorkommen in `src/app/m/radio/admin/(arbeit)/geraete/GeraeteTabelle.tsx` (⬜ T-L1) | **T5** |
| 8 | `radio-verwaltung.spec.ts` Fall 5 (Ergänzung) · „eine Leihzeile zeigt ihren formatierten Wert, nicht das Rohfeld" | Zusicherung auf eine Zelle aus einer der **acht** `render:`-Vorkommen in `src/app/m/radio/admin/(arbeit)/ausleihen/AusleihenTabelle.tsx` (⬜ T-L1). ⛔ **Nicht `LoanList.tsx` und nicht „sieben"** — beides gehört dem Alt-Bestand bzw. keiner Quelle | **T5** |
| 9 | `radio-verwaltung.spec.ts` (Ergänzung) · „die Hoehe eines App-Umschalter-Eintrags ist kleiner als die Kopfzeilenhoehe" | `boundingBox().height` als **Verhältnis**, nicht als Zahl — Falle 8 | **T5** |

**Dazu drei Fälle, die kein anderer Plan führt und die dieser Planteil schuldet, weil er die
Flächen anlegt:**

| # | Datei · Name | Warum |
|---|---|---|
| 10 | `radio-hosts.spec.ts` · „/sw.js liefert den Abraeum-Worker, und er hat keinen fetch-Handler" | die Hälfte-1-Messung aus §4.7.2 im Lauf, statt nur im Runbook — ⛔ **er trifft BEIDE Pfade**, siehe die Auflage unten |
| 11 | `radio-hosts.spec.ts` · „/api/health/radio nennt Modul und Revision" | die Fläche, die G7 zusagt, hat sonst keinen Wirknachweis (E4 §7.2) |
| 12 | `radio-verwaltung.spec.ts` (Ergänzung) · „das Druckblatt riegelt die Verwaltungsstufe ab" | ⬜ **V-L14 / T-L3** — der Personenriegel in `admin/(druck)/layout.tsx` hat bis heute **keine** Wirkprobe (`riegel.test.ts:81-87`) |
| 13 | `radio-hosts.spec.ts` · „der Abmelde-Handler auf fremdem Host laesst das Sitzungs-Cookie stehen" | ⛔ **die zweite Hälfte von `Spec:6916`**, die bisher fehlte: „der Abmelde-Route-Handler \| 404, **und das Cookie der laufenden Sitzung ist danach unverändert vorhanden**." Der Schleifeneintrag 2 belegt nur den 404 — dass der Riegel **vor** dem Cookie-Löschen greift, ist eine eigene Zusage |

⛔ **Auflage zu Fall 10 — er trifft ZWEI Pfade, und der Grund ist gemessen.**
`radioUrl("/m/radio/sw.js")` läuft in `decideRoute` über den **internen** `/m/<key>`-Zweig
(`src/core/routing.ts:68-77`) und berührt die **Host-Rewrite-Strecke nie**. Die Runbook-Zeile aus
§4.7.2 Hälfte 1 lautet aber `curl "$B/sw.js"` — der **externe** Pfad. ⛔ **Fall 10 prüft deshalb
zusätzlich `radioUrl("/sw.js")`** (200, `text/javascript`, derselbe Rumpf); erst dann ist „die
Hälfte-1-Messung im Lauf" wahr, und erst dann ist der „erste stille Fall" aus §7.4.4 — der Rewrite
greift nicht — im Lauf gedeckt statt nur im Unit-Test (`_lib/routen.test.ts:122-133`).

⚠️ **Die Voraussetzung ist gemessen, nicht angenommen — sonst wäre die neue Hälfte rot aus genau
dem Grund, gegen den sie antritt.** `moduleForHost` (`src/core/registry.ts:251-258`) trifft
`` `${m.key}.localtest.me` `` **in der Zeile VOR** dem `prodHostsFor`-Vergleich:

```ts
    if (h === `${m.key}.localtest.me`) return m;
    if (prodHostsFor(m, env).some((p) => p.toLowerCase() === h)) return m;
```

⛔ **Also löst `radio.localtest.me` auch OHNE gesetztes `SUITE_HOST_RADIO` nach `radio` auf**, und
`radioUrl("/sw.js")` rewritet nach `/m/radio/sw.js`. Der Bestand schreibt denselben Befund aus
(`src/app/m/radio/_lib/host.ts:37-41`: „trifft `radio.localtest.me` VOR und UNABHAENGIG von
`prodHostsFor` … OHNE dass SUITE_HOST_RADIO lokal gesetzt sein muss"). ⛔ **Damit bleibt T1s Zusage
unberührt** — `RADIO_ENV` braucht die Variable weiterhin nicht.

⚠️ **Der SCHLEIFEN-Eintrag bleibt `/m/radio/sw.js`**: auf einem fremden Host wäre `/sw.js` ein 404
aus dem falschen Grund (`moduleForHost("feedback.localtest.me")` rewritet nach `/m/feedback/sw.js`).

⛔ **Auflage zu Fall 13 — die Sitzung wird IM Fall geprägt.** Jeder Playwright-`test()` bekommt
einen frischen Kontext; ein Cookie aus Fall 6 oder dem Datenwirkungs-Fall überlebt nicht. Der Fall
löst deshalb selbst `radioUrl("/m/radio/t/<E2E_CODE_AKTIV>")` mit ⛔ **`maxRedirects: 0`**
(Bauform 27) ein, liest das Ausleih-Sitzungs-Cookie aus dem Kontext, ruft
`fremdUrl("/m/radio/abmelden")` mit `maxRedirects: 0` → **404**, und sichert das Cookie danach
⛔ **differenziell unverändert** zu — nicht „vorhanden", sondern **derselbe Wert**.

### ⛔ Die Zählung — ZWEI Einheiten, und mehr als zwei gibt es nicht

Die frühere Fassung dieses Absatzes zählte im selben Dokument **dreizehn**, **zwölf** und — nach
ihrer eigenen Bauanweisung in T4 — **vierzehn**. Das fällt unter Auflage 7 („wer ‚alle‘ schreibt,
zählt vorher"), und deshalb steht die Rechnung hier ausgeschrieben.

**Einheit A — ZUSAGEN (das, was die zwei Tafeln oben zählen): VIERZEHN.**
Neun aus der Grundtafel plus die vier geschuldeten (10, 11, 12) und die nachgetragene 13.
⛔ **Diese Zahl steht überall im Dokument, wo von „Fällen" die Rede ist.**

**Einheit B — LAUFENDE PLAYWRIGHT-`test()`-BLÖCKE: neunzehn neue, gerechnet.**
⛔ **Sie ist NICHT gleich A**, weil `test()` **innerhalb** der `EINSTIEGE`-Schleife steht
(gemessen am Vorbild, `e2e/lagerbuch-hosts.spec.ts:141-145`) — die Schleife erzeugt **fünf** Blöcke,
nicht einen. Die Rechnung je Datei:

| Datei | Blöcke | Rechnung |
|---|---|---|
| `e2e/radio-kiosk.spec.ts` | **1** | Fall 1 |
| `e2e/radio-zugang.spec.ts` | **4** | Fälle 2–5 |
| `e2e/radio-hosts.spec.ts` | **10** | 5 (Schleife, einer je Einstieg) + 1 (Längenfall) + 1 (Datenwirkung) + 1 (Fall 10) + 1 (Fall 11) + 1 (Fall 13) |
| `e2e/radio-verwaltung.spec.ts` | **+4** | Fälle 7, 8, 9, 12 — die Datei steht danach bei **21**, nicht 17 |
| **Summe neu** | **19** | 1 + 4 + 10 + 4 |

⛔ **Beide Zahlen werden in T6 GEMESSEN und in den Bericht geschrieben**, nicht aus diesem Plan
abgeschrieben — die Zahl der Blöcke liest man aus der Playwright-Zählzeile ab, nicht aus einem
`grep -c "test("` (der zählt `test.describe(` und Kommentartreffer mit; dieselbe Falle steht in T5).

⛔ **Der Datenwirkungs-Fall zählt in BEIDEN Einheiten eigenständig und fällt nicht unter Fall 6** —
er steht aus dem in **E-G8** genannten Grund außerhalb der Schleife und hat eine eigene,
unmaskierte Zusicherung.

### Was ⬜ Z-L1 nach diesem Planteil deckt — und was weiterhin nicht

| Riegelform | Rechtestufe | Wirknachweis heute | nach Planteil 5 |
|---|---|---|---|
| Verwaltungsriegel im Layout `(arbeit)` | ohne Sitzung | ✅ Dauerfall „V-L3 A" | unverändert |
| " | angemeldet, ohne beide Gruppen | ✅ „V-L3 B" | unverändert |
| " | Updater | ✅ „V-L3 C" | unverändert |
| " | Admin vs. Updater auf einer Admin-Seite | ✅ „V-L3 D" | unverändert |
| Personenriegel im Layout `(druck)` | Admin vs. Updater | ⛔ **keiner** (⬜ V-L14) | ✅ **T5, Fall 12** |
| Host-Riegel, werfende Form (Seiten/Layouts) | — | teilweise (`/m/radio/admin`, Fall 8) | ✅ **T4, Schleife** |
| Host-Riegel, nicht werfende Form (Route Handler) | — | ⛔ **keiner** | ✅ **T4**, für vier der fünf Handler (E-G8 nennt den fünften) — und für `/abmelden` ⛔ **vor jeder Wirkung**: Fall 13 sichert das Sitzungs-Cookie danach differenziell unverändert zu (`Spec:6916`, zweite Hälfte) |
| Host-Riegel, vierte Form `hostAbweisung` | — | ⛔ **keiner** (existiert erst mit G5) | ✅ **T4, Fall 10** |
| Ausleih-Zugangsriegel, **Lesepfad** | anonym, gesperrter Code | ⛔ **keiner** (nur In-Memory-Funktionstest) | ✅ **T3, Fall 3** |
| Ausleih-Zugangsriegel, **Schreibpfad** | anonym, gesperrter Code | ⛔ **keiner** | ✅ **T3, Fall 5** |
| Ausleih-Zugangsriegel, Sperrung **während** laufender Sitzung | anonym | ⛔ **keiner** | ✅ **T3, Fall 4** |
| der anonyme Ausleihzweig **überhaupt** (kein Login-Riegel im Weg) | anonym | ⛔ **keiner** | ✅ **T2, Fall 1** |
| der zweite Weg herein (angemeldet über die Kachel) | angemeldet | ⛔ **keiner** | ✅ **T3, Fall 2** |
| Datenwirkung **vor** dem Riegel (Einlöse-Route) | anonym | ⛔ **keiner** | ✅ **T4** |
| `import/hochladen` (POST-only) | Admin | ⛔ **keiner**, und er bleibt offen | ⛔ **weiterhin offen** — E-G8 nennt den Grund |

⛔ **Diese Tafel ist die Vollzähligkeitsaussage dieses Plans, und sie hat eine Zeile mit „offen"
darin.** Genau das ist der Unterschied zu einer Behauptung, die nicht trägt.

---

## Die neun Mutationsproben über sieben Pflichtstücke

**Verfahren (Spec:7044-7052):** **nach** dem Grünwerden, je Pflichtstück jede genannte Mutation
**einzeln** in den Arbeitsbaum legen, den zuständigen Testlauf fahren, das rote Ergebnis notieren,
`git checkout -- <datei>`. ⛔ **Nichts davon wird committet.**

**Die Falsifikationsregel (Spec:6396-6404), wörtlich:** „Ein Pflichtstück gilt als abgenommen, wenn
**jede** in seiner Zeile genannte Mutation den Test **rot** macht. Ein Test, der eine der genannten
Mutationen überlebt, ist **vakuös** und wird gelöscht oder neu geschrieben — nicht ergänzt."

| # | Pflichtstück | Testdatei | Zu mutierende Zeile | Die Mutation | Erwartete Wirkung |
|---|---|---|---|---|---|
| 1 | Zeitstempel-Abbildung | `scripts/import/radio.test.ts` | `scripts/import/radio.ts:352` | `?? 0` statt `null` durchlassen | ⛔ **`toNeueLeihe: returned_at NULL bleibt NULL (die aktive Leihe)`** (`:650`) wird rot. ⚠️ **NICHT** der Fall bei `:280` (`msZuDatumOptional und tagInBerlin geben bei null und undefined null zurueck`) — der prüft `msZuDatumOptional` **direkt** und sähe eine Mutation an `radio.ts:352` gar nicht. ⚠️ **Und `?? 0` ist an dieser Zeile typwidrig** (`Date \| 0` in eine `mode: "timestamp"`-Spalte): kommt die Probe als **Typfehler** rot statt als Testfehlschlag, ist das **kein** bestandener Nachweis — dann `?? new Date(0)` mutieren |
| 2 | Code-Einlöser, DB-Recheck im Lesepfad | ⛔ **`_lib/ausleihZugang.test.ts`** | `_lib/ausleihZugang.ts:181` | die `!zeile.aktiv`-Hälfte entfernen | ⛔ **`ohne Suite-Sitzung und mit gesperrtem Code -> grund gesperrt`** (`:351`) wird rot. ⚠️ **`_lib/zugang.test.ts` trägt gemessen KEINEN einzigen Fall über einen gesperrten Code** (`grep -n 'it(' … \| grep -i gesperrt` → leer) — wer nach der alten Tafel fährt, sieht Grün und notiert eine bestandene Probe für einen ungeprüften Riegel |
| 3 | Host-Riegel, ⛔ **VIER** Formen (B13, `Spec:105` — „drei Formen" ist die von B überholte §8.2.3-Überschrift) | `_lib/host.test.ts` | `_lib/host.ts:52-54` | durch einen direkten `prodHostsFor`-Vergleich ersetzen | ⛔ **`hat KEINEN 'kein Prod-Host konfiguriert -> durchlassen'-Zweig`** (`:91`) wird rot |
| 4 | Pfad-Riegel `/admin` | `_lib/zugang.test.ts` | `_lib/zugang.ts:190` | auf `isModuleAdmin`/`session.user.isAdmin` umstellen | ⛔ **`ein Viewer mit NUR dashboard-admins: false — der Suite-Admin bekommt keine Radio-Rechte`** (`:203`) wird rot |
| 5 | Retention-Auswahl | `_lib/boot.test.ts` | `_lib/boot.ts` — das `isNotNull(loans.returnedAt)` in `raeumeLeihhistorie` (`:62-69`) | `isNotNull(...)` streichen | ⛔ **`eine AKTIVE Leihe bleibt, egal wie alt ihr borrowed_at ist`** (`:96`) wird rot |
| 6a | Lesen während offenem Schreibvorgang — **Produktmutation** | `_db/leihen.test.ts` | `src/core/db/index.ts:18-20` | eine der beiden `pragma`-Zeilen (`journal_mode = WAL`, `busy_timeout = 5000`) streichen | der Pragma-Fall in `leihen.test.ts` wird rot |
| 6b | dasselbe — **Konstruktionsprobe** | `_db/leihen.test.ts` | die zwei Handles im Test selbst | probeweise auf **ein** Handle zusammenziehen | die einhändige Fassung bleibt **grün** — das macht sie **vakuös** nach §6.6 Punkt 1 und ist der Beweis, warum zwei Handles Pflicht sind. ⛔ **Die Probe ist selbst die Falsifikation, nicht ihr Ergebnis** |
| 7a | Guard-Scan der Actions — **der Scan** | `_actions/guards.test.ts` | eine beliebige Action unter `_actions/` | Guard-Aufruf entfernen, **ohne** die Ausnahmeliste zu erweitern | ⛔ **`keine Action ohne Riegel, keine Ausnahme ohne Host-Riegel`** (`:549`) wird rot |
| 7b | dasselbe Pflichtstück — **die Zählzusage** | `_actions/guards.test.ts` | `AUSNAHMEN` (`:56`) | einen **vierten** Eintrag setzen | ⛔ **`die Ausnahmeliste hat GENAU DREI Eintraege`** (`:499`) wird rot |

⛔ **Warum Probe 7 gespalten ist, und es ist ein bau-anhaltender Fehler der früheren Fassung.** Sie
nannte für die Guard-Mutation den Test `die Ausnahmeliste hat GENAU DREI Eintraege` — der prüft
gemessen eine **Konstante** (`:513` `expect(AUSNAHMEN.length…).toBe(3)`, `:514` der `toEqual`-Abgleich),
**nie** den Bestand der Actions. Die Probe wäre **grün geblieben**, nach der Regel in T6 Schritt 3
als vakuös verbucht — und ein **intakter** Wächter wäre gelöscht oder neu geschrieben worden. Das
ist die NT11-Fehlerform mit umgekehrtem Vorzeichen. **`Spec:7065` sagt es wörtlich:** „eine Action
ohne Guard hinzufügen; **der Scan** muss rot werden, **nicht die Ausnahmeliste wachsen**."
⛔ **Die Zählzusage ist deshalb eine eigene Probe mit ihrer eigenen Mutation** (7b), nicht die
erwartete Wirkung von 7a.

⛔ **NEUN Proben über sieben Pflichtstücke** (vorher: acht). Pflichtstück 7 zerfällt aus dem eben
genannten Grund in **7a/7b**. Pflichtstück 6 zerfällt in zwei Läufe, weil §8.6s
eigene Tabellenzeile die Mutation invertiert formuliert — „ohne den Test grün bliebe" bezieht sich
dort auf die **falsche Bauform** (ein Handle statt zwei), nicht auf eine Zeile im Produktcode.

⚠️ **Zwei Warnungen zu den Zeilenangaben:** die Zahlen in Spalte 4 stammen aus E2 und sind gegen
einen Arbeitsbaum vom 26.08.2026 gemessen. ⛔ **Wer die Probe fährt, sucht die Zeile am eigenen
Stand neu** — eine falsch getroffene Zeile macht einen falschen Test rot und zählt als bestanden.
Und: alle sieben Pflichtstücke **existieren bereits** (Planteil 1–4). Die Probe ist die Aufgabe,
nicht der Test.

---

## Was dieser Plan anlegt und ändert

### Neu

| Datei | Was |
|---|---|
| `src/app/m/radio/_lib/sw-quelle.ts` | `RADIO_SW_ABRAEUM_QUELLE: string` — der Worker-Quelltext. Kein `"use client"` |
| `src/app/m/radio/_lib/sw-quelle.test.ts` | drei Fälle: kein `fetch`-Handler, alle Cache-Namen, `claim` vor `unregister` — plus der Treffsicherheitsfall aus E-G5 |
| `src/app/m/radio/sw.js/route.ts` | `GET(req): Response`, `hostAbweisung(req) ?? …` |
| `src/app/m/radio/sw.js/route.test.ts` | fremder Host → 404 und **nicht** `text/html`; radio-Host → 200, `text/javascript`, `cache-control: no-cache` |
| `src/app/m/radio/_lib/keine-pwa.test.ts` | der fünfte Quelltext-Scan |
| `e2e/radio-kiosk.spec.ts` | Fall 1 |
| `e2e/radio-zugang.spec.ts` | Fälle 2–5 |
| `e2e/radio-hosts.spec.ts` | Fälle 6, 10, 11 |
| `docs/superpowers/berichte/2026-08-26-radio-mutationsproben.md` | das verfolgte Artefakt der neun Proben (T6) |

### Geändert

| Datei | Was |
|---|---|
| `src/app/m/radio/_lib/grenzen.ts` | `+ grenzenFehler(env): string[]` (E-G1): die vier Zahlen, das Geheimnis (⬜ A-L7), die Gate-Kopplung |
| `src/app/m/radio/_lib/grenzen.test.ts` | die Fälle dazu |
| `src/app/m/radio/_lib/boot.ts` | `+ radioBootFehler()`, `+ historieMonate`/`historieMonateFehler`, `+ starteRadioHintergrund()`, `+ stoppeRadioHintergrund()`, `+ RADIO_HISTORIE_*`, der Timer. ⛔ **Am Dateiende, nach `raeumeLeihhistorie()`**; der Kopfkommentar `:4-10` wird von „Planteil 5" auf „gebaut" fortgeschrieben, nicht gelöscht |
| `src/app/m/radio/_lib/boot.test.ts` | die Boot-Fälle (§7.3.7) **und** die fünf Takt-Fälle (§2.7.2) — ⛔ eine Datei, drei Beschreibungsorte, „keine Zeile doppelt" |
| `src/core/bootstrap.ts` | `+ import { radioBootFehler, starteRadioHintergrund }`, `+ ...(await radioBootFehler())` in `errors`, `+ starteRadioHintergrund()` in `startBackgroundWork()` |
| `src/core/bootstrap.test.ts` | die Namensliste wird abgeleitet (G3); zweite Klausel für die Hintergrundstarter; **dritter Spion** für `starteRadioHintergrund` (G4) |
| `src/app/m/radio/riegel.test.ts` | `HANDLER_ANZAHL` 4 → **5**, mit einem **neuen** Fahrplan-Eintrag im Kopf (NS-V2: keine stille Zahl) |
| `.env.example` | der Block „Modul radio" wird vervollständigt; `SUITE_HOST_RADIO` bleibt an seinem Platz (`:154`) |
| `e2e/helpers/radio.ts` | `+ RADIO_AUSLEIH_SITZUNG_SECRET` in `RADIO_ENV`, `+ E2E_CODE_AKTIV`, `+ E2E_CODE_GESPERRT` |
| `src/app/m/radio/_lib/e2eEnv.test.ts` | ⛔ **PFLICHT MIT T1, sonst faellt T1 durch sein eigenes Tor:** `expect(RADIO_ENV).toEqual({…})` (`:64-67`) steht heute auf **exakt zwei** Schluesseln. `describe`-Titel und `it`-Name werden **fortgeschrieben**, nicht geloescht; dazu ein neuer Fall, der den Wert gegen `.env.example:453` zeichengleich haelt |
| `e2e/radio-verwaltung.spec.ts` | vier Ergänzungsfälle (7, 8, 9, 12) |

### Nicht angefasst — je mit Begründung

| Datei | Warum nicht |
|---|---|
| `src/app/api/health/*` | der `[modul]`-Handler ist generisch; eine radio-Datei wäre eine zweite Wahrheit (E-G7) |
| `src/core/health/index.test.ts` | „die Funktion ist modul-agnostisch" |
| `compose.yaml` | kein zweiter Healthcheck, kein Volume, kein Service; einzige Berührung ist `SUITE_TRAEFIK_RULE`, und die lebt in der `.env` (`Spec:5797-5811`) |
| `scripts/backup.sh` | `radio.db` fällt über das `nullglob`-Muster ohne Änderung ins Backup (`:25-27`, `:41-43`) |
| `Dockerfile` | die `COPY`-Zeile für `radio` steht seit Planteil 1 |
| `src/app/m/radio/_db/migrations/` | append-only; dieser Planteil braucht keine |
| `src/app/m/radio/_lib/seedLokal.ts` | legt Geräte und Stammdaten an, **niemals** eine einlösbare Zugangszeile — bereits richtig |
| `seedAllModules()` | `radio` bekommt **keinen** Eintrag: „ein geseedeter Zugangscode wäre in der Generalprobe ein gültiger anonymer Zugang zum gesamten Gerätebestand samt Ausleihernamen" (Analyse-Falle 31) |
| `_lib/bauform.test.ts`, `_actions/guards.test.ts` | ihre Kopien der Bereinigung bleiben (⬜ V-L9, E-G6) |
| `playwright.pwa.config.ts`, `e2e/pwa-spike.spec.ts` | `radio` baut keine PWA; der Spike gehört `qr` |
| `src/core/groups.ts` | der Suite-Admin-Kurzschluss hat einen eigenen Plan |
| `src/core/ratelimit.ts` | CWE-348 ist gebaut (`7d71b6c`); dieser Planteil hängt nicht daran |

---

## Reihenfolge der Aufgaben

| # | Aufgabe | Tor |
|---|---|---|
| **G1** | `grenzenFehler()` in `_lib/grenzen.ts` — vier Zahlen, Geheimnis (⬜ A-L7), Gate-Kopplung | eigenes |
| **G2** | `radioBootFehler()` in `_lib/boot.ts` + Einhängung in `assertHostConfig()` | ⛔ **gemeinsam mit G3** |
| **G3** | Der abgeleitete Boot-Haken-Wächter in `src/core/bootstrap.test.ts`, beide Klauseln | ⛔ **gemeinsam mit G2** |
| **G4** | `starteRadioHintergrund()`/`stoppeRadioHintergrund()`, der Takt, die fünf Takt-Fälle, die Einhängung, der dritte Spion | eigenes |
| **G5** | `_lib/sw-quelle.ts`, `sw.js/route.ts`, `HANDLER_ANZAHL` 4 → 5 | eigenes |
| **G6** | `_lib/keine-pwa.test.ts` — der fünfte Quelltext-Scan | eigenes |
| **G7** | Die Health-Zusage: Abwesenheitsprüfung, ⬜ G-L5, der Zähl-Handgriff fürs Runbook | eigenes |
| **G8** | `.env.example` — der radio-Block, die Traefik-Zeile, der Dev/E2E-Unterblock | eigenes |
| **T1** | `e2e/helpers/radio.ts` — das Sitzungsgeheimnis, die zwei Codes | eigenes |
| **T2** | `e2e/radio-kiosk.spec.ts` — Fall 1, der Rundgang | eigenes |
| **T3** | `e2e/radio-zugang.spec.ts` — Fälle 2–5 | eigenes |
| **T4** | `e2e/radio-hosts.spec.ts` — Fälle 6, 10, 11 | eigenes |
| **T5** | `e2e/radio-verwaltung.spec.ts` — Fälle 7, 8, 9, 12 (⬜ T-L3) | eigenes |
| **T6** | Die neun Mutationsproben und ihr Bericht | eigenes |

⛔ **T1 vor T2/T3/T4.** Gemessener Grund: `RADIO_ENV` (`e2e/helpers/radio.ts:78-81`) trägt heute nur
die zwei Gruppenzeilen. **Es fehlt `RADIO_AUSLEIH_SITZUNG_SECRET`** —
`_lib/grenzen.ts:212-222` wirft `GrenzenUngueltig`, sobald `ausleihSitzungGeheimnis()` zur
Anfragezeit ohne diese Variable läuft, und genau das passiert bei der **ersten Einlösung eines
Codes am Gate**. `radio-verwaltung.spec.ts` berührt den Ausleihzweig nicht und hat die Lücke deshalb
nie gezeigt; T2 und T3 träfen sie im ersten Testlauf sofort.

---

# BLOCK G — Betrieb (Spec-Kapitel 7)

---

## Aufgabe G1: `grenzenFehler()` — die vier Zahlen, das Geheimnis, die Gate-Kopplung

**Files:** Modify `src/app/m/radio/_lib/grenzen.ts`, `src/app/m/radio/_lib/grenzen.test.ts`

**Interfaces:**
- Produces: `grenzenFehler(env?: EnvLike): string[]` — gelesen von **G2** (`radioBootFehler()`),
  und **nur** von dort.
- Consumes: die modul-private `ZAHLEN`-Tabelle (`grenzen.ts:62`) und `zahl()`,
  `ZAHL_NAMEN` (`:106`), `ausleihSitzungGeheimnis()` (`:212-222`) — ⛔ **die Datei hat 222 Zeilen**.

⛔ **Kein `zahlFehler`, keine zweite Zahlentabelle** (Entscheidung **E-G1**). Der Kopfkommentar von
`ZAHLEN` sagt namentlich über diesen Planteil: „ab Planteil 5 wird `radioBootFehler()` **dieselbe
Tabelle** lesen; zwei Tabellen wären zwei Wahrheiten" (`grenzen.ts:53-56`). ⛔ **`ZAHLEN` wird
NICHT exportiert** — der Grund steht `:96-105` (Kernsatz `:102`): „Wer `ZAHLEN` exportierte, machte
aus dem Test eine Tautologie: er prüfte den Code gegen sich selbst und bliebe auch bei falscher
Einheit grün."

⛔ **`grenzenFehler()` steht IN DERSELBEN DATEI und erreicht die Tabelle deshalb über die
modul-private `zahl()`, NICHT über `grenzen()`.** ⚠️ Die frühere Fassung schrieb hier „von innen,
über `grenzen()`" und zwei Zeilen später „je Variable ein eigener Aufruf-und-Fang" — **beides
zugleich ist nicht baubar**: `grenzen()` wertet gemessen alle vier Namen in **einem** Objektliteral
aus (`grenzen.ts:172-179`), und der erste Wurf aus `zahl()` (`:142`, `:149`) beendet den Aufruf.
Es gilt der zweite Satz.

⛔ **Sie wirft nie.** Sie sammelt. `grenzen()` wirft beim **ersten** ungültigen Wert —
`grenzenFehler()` will **alle** Fehler auf einmal (`grenzen.ts:166-170`). Wer sie mit einem
einzigen `try { grenzen(env) } catch` baut, meldet nur den ersten und lässt den Betreiber vier
Neustarts fahren. ⛔ **Also je Variable ein eigener Aufruf-und-Fang** — über `ZAHL_NAMEN`
(`:106`, exportiert genau dafür), nicht über eine handgeschriebene Namensliste.

⛔ **⬜ A-L7 wird hier abgelesen, nicht weitergereicht.** `grenzen.ts:206-210` benennt Planteil 5
namentlich als Eigentümer.

### Der Vertrag

```ts
/** Alle Boot-Meldungen dieses Moduls, die aus der Grenzen-Tabelle stammen. Wirft nie. */
export function grenzenFehler(env: EnvLike = process.env): string[];
```

Sie liefert, in dieser Reihenfolge:

| Teil | Was | Meldung enthält |
|---|---|---|
| 1 | je Name aus `ZAHL_NAMEN`: `zahl(name, env)` in `try`/`catch`, `GrenzenUngueltig` → `.message` übernehmen | Name, gelesener Wert, erlaubter Bereich, Einheit — das schreibt `zahl()` bereits (`:141-152`) |
| 2 | `RADIO_AUSLEIH_SITZUNG_SECRET` fehlt oder leer | den Wortlaut aus `ausleihSitzungGeheimnis()` (`:215-220`), übernommen statt neu formuliert |
| 3 | derselbe Wert **kürzer als 32 Zeichen** | Name, gelesene **Länge** (⛔ **nie der Wert selbst**), geforderte Mindestlänge, der Erzeugungshinweis `openssl rand -base64 32` |
| 4 | derselbe Wert **gleich** `AUTH_SECRET` | ⛔ **beide** Variablennamen; ein geteiltes Geheimnis macht aus einer Ausleih-Sitzung eine Suite-Sitzung |
| 5 | die Gate-Ungleichungskette verletzt | alle **drei** Namen und ihre gelesenen Werte, plus die Kette in Worten |

⛔ **Teil 5 läuft nur, wenn Teil 1 für die drei Gate-Zahlen fehlerfrei war** — sonst vergleicht die
Kette einen Wert, den `zahl()` gerade abgelehnt hat, gegen eine Vorbelegung, und die Meldung wäre
irreführend. Der Zustand wird **im Code sichtbar gemacht**, nicht durch Reihenfolge angedeutet.

⛔ **Kein Umlaut in einer Meldung, die als Grep-Anker taugen könnte.** Das Runbook greift
`radio:`-Zeilen aus dem Docker-Log; Umlaute in einer Meldung sind zulässig (es ist Bildschirmtext),
aber der **Anker** — der Präfix `[radio]` und der Variablenname — trägt keine.

### Die Testtabelle

| Testname | Aussage |
|---|---|
| `ohne jede RADIO_-Variable meldet grenzenFehler NUR das fehlende Geheimnis` | leeres `env` → **genau eine** Meldung. ⛔ **Nicht `[]`** — alle vier Zahlen haben Vorbelegungen, das Geheimnis wird aber **verlangt**. Siehe die Warnung unten |
| `eine ungueltige Zahl meldet genau eine Zeile mit Name und Bereich` | `RADIO_AUSLEIH_SITZUNG_STUNDEN="abc"` → eine Meldung, enthält Name **und** `1` und `24` |
| `RADIO_AUSLEIH_SITZUNG_STUNDEN=25 wird abgewiesen` | **eigener Fall** — die Obergrenze ist eine gebaute Zusage (**E-G2**), keine Randnotiz |
| `vier ungueltige Zahlen ergeben VIER Zeilen, nicht eine` | die Sammel-Eigenschaft; ⛔ dieser Fall ist der Grund, warum kein einzelnes `try` genügt |
| `fehlendes Sitzungsgeheimnis ist eine Meldung` | Name kommt vor |
| `zu kurzes Sitzungsgeheimnis nennt die LAENGE, nicht den Wert` | 31 Zeichen → Meldung enthält `31` und **nicht** den Wert |
| `Sitzungsgeheimnis gleich AUTH_SECRET nennt BEIDE Namen` | beide auf denselben 40-Zeichen-Wert → eine Meldung mit beiden Namen |
| `die Gate-Kette Absender <= gesamt pro min wird geprueft` | `..._PRO_ABSENDER_PRO_MIN=40`, `..._GESAMT_PRO_MIN=30` → Meldung mit beiden Namen |
| `die Gate-Kette gesamt pro min <= gesamt pro Stunde wird geprueft` | `..._GESAMT_PRO_MIN=100`, `..._GESAMT_PRO_STUNDE=50` → Meldung |
| `eine gueltige Kette meldet nichts` | die drei Vorbelegungen 5/30/300 → keine Ketten-Meldung |
| `grenzenFehler wirft nie` | `env` mit allen Fehlern gleichzeitig → Liste mit mehr als einem Eintrag, kein Wurf |

⛔ **Die Falle im ersten Fall, und sie ist gemessen:** `grenzenFehler({})` **darf nicht** `[]`
liefern, weil das Geheimnis Pflicht ist. Der Test heißt deshalb **nicht** „meldet nichts", sondern
`ohne jede RADIO_-Variable meldet grenzenFehler NUR das fehlende Geheimnis` — und sichert genau
eine Meldung zu. Die Gating-Frage („gilt das überhaupt auf dieser Instanz?") beantwortet **nicht**
diese Funktion, sondern der `prodHostsFor`-Schalter in `radioBootFehler()` (G2). ⛔ **Wer den
Schalter hierher zieht, macht `grenzenFehler()` unbenutzbar für einen späteren zweiten Aufrufer und
verdoppelt die Gating-Logik.**

- [ ] **Schritt 1** — Die elf Testfälle schreiben, alle rot.
- [ ] **Schritt 2** — Sonden benennen:
      **S-G1a**: die Schleife über `ZAHL_NAMEN` durch ein einzelnes `try { grenzen(env) }` ersetzen
      → `vier ungueltige Zahlen ergeben VIER Zeilen, nicht eine` muss **rot** werden.
      **S-G1b**: die 32-Zeichen-Grenze auf 8 senken → `zu kurzes Sitzungsgeheimnis…` rot.
      **S-G1c**: den `AUTH_SECRET`-Vergleich entfernen → der Beide-Namen-Fall rot.
      **S-G1d**: in der Kette `<=` auf `<` ändern → `eine gueltige Kette meldet nichts` rot
      (Randwertprobe: 30 und 30 wären dann ein Fehler).
      **S-G1e**: `max: 24` auf `168` heben → `RADIO_AUSLEIH_SITZUNG_STUNDEN=25 wird abgewiesen` rot.
      ⛔ **S-G1e ist die Sonde für Entscheidung E-G2** — sie beweist, dass der engere Bereich
      tatsächlich bewacht ist und nicht nur im Kommentar steht.
- [ ] **Schritt 3** — `grenzenFehler()` bauen, **unter** `ausleihSitzungGeheimnis()`, mit einem
      Kopfkommentar, der (a) auf `grenzen.ts:53-56` und `:166-170` verweist, (b) ⬜ A-L7 als
      **abgelesen** markiert und (c) E-G1 nennt, damit niemand später `zahlFehler` nachbaut.
- [ ] **Schritt 4** — ⬜ **A-L7** in `grenzen.ts:206-210` von „es gibt keine Boot-Prüfung" auf
      „gebaut in `grenzenFehler()`" fortschreiben. ⛔ **Fortschreiben, nicht löschen** — der Absatz
      erklärt, warum die Prüfung nicht in `ausleihSitzungGeheimnis()` selbst steht.
- [ ] **Schritt 5** — Tor. Zusätzlich: `rtk pnpm vitest run src/app/m/radio/_lib/grenzen.test.ts`.

```
rtk git add src/app/m/radio/_lib/grenzen.ts src/app/m/radio/_lib/grenzen.test.ts
rtk git commit -m "feat(radio): grenzenFehler — die Boot-Meldungen aus der Grenzen-Tabelle, A-L7 abgelesen"
```

---

## Aufgabe G2: `radioBootFehler()` — und die Einhängung, der stillste Posten dieses Kapitels

**Files:** Modify `src/app/m/radio/_lib/boot.ts`, `src/app/m/radio/_lib/boot.test.ts`,
`src/core/bootstrap.ts`

⛔ **Gemeinsames Tor mit G3.** Kein Review dazwischen, kein Merge mit nur einer der beiden.

**Interfaces:**
- Produces: `radioBootFehler(env?: EnvLike): Promise<string[]>`, `historieMonate(env?): number`,
  `historieMonateFehler(env?): string | null` — gelesen von `src/core/bootstrap.ts` (Einhängung)
  und von **G4** (`historieMonate` für den Takt).
- Consumes: `grenzenFehler()` aus **G1**, `prodHostsFor`/`getModule` aus `@/core/registry`.

⛔ **DIE EINHÄNGUNG IST TEIL DIESER AUFGABE, NICHT DER NÄCHSTEN.** `Spec:5855-5888`, wörtlich:
„Das ist der stillste Posten dieses Kapitels" — ohne sie laufen alle Prüfungen **nie**: die Datei
existiert, ihre Tests sind grün, `pnpm build` ist grün, „und beim Cutover fällt niemandem auf, dass
nichts geprüft wurde."

⛔ **SIE LIEST KEINE TABELLE** (B8). Sie läuft **vor** `migrateAllModules()`. Ein `getDb()`, ein
`select`, ein `openModuleDatabase` in dieser Funktion ist ein Fehler, den **kein Typecheck sieht**
— zur Laufzeit hieße er entweder „Tabelle existiert nicht" beim allerersten Start oder, schlimmer,
ein still angelegtes leeres Schema.

⛔ **SIE WIRFT NIE.** Ein `throw` von hier nähme den **ganzen Prozess** mit — alle **elf** Einträge in `src/core/registry.ts:53-213` (⚠️ **R-G1-1**: `Spec:5909-5911` zählt hier sechs, selbst nachgezählt sind es elf; die Auflage selbst ist unberührt),
„und die Meldung nennte nicht einmal das auslösende Modul" (`Spec:5909-5911`).

### Der Vertrag

```ts
type EnvLike = Record<string, string | undefined>;

export async function radioBootFehler(env: EnvLike = process.env): Promise<string[]>;
```

⛔ **`async`/`Promise<string[]>`, obwohl nichts darin asynchron ist — und das ist Pflicht, keine
Kosmetik.** Die Naht daneben sieht so aus: `...(await filesBootFehler())`,
`...(await lagerbuchBootFehler())` (`src/core/bootstrap.ts:95`, `:98`). Eine synchrone Funktion an
derselben Stelle lädt dazu ein, das `await` beim nächsten Umbau zu vergessen — und aus einem
Startabbruch würde eine **unbehandelte Rejection, die nichts abbricht**. Die Begründung steht
wörtlich bei `lagerbuch` (`_lib/boot.ts:21-26`) und wird hier nicht neu erfunden, sondern
übernommen.

**Der Schalter ist die erste Anweisung, wörtlich (`Spec:5915-5917`):**

```ts
  if (prodHostsFor(getModule("radio"), env).length === 0) return [];
```

`prodHostsFor` liest `SUITE_HOST_RADIO` und fällt sonst auf `mod.prodHosts` zurück
(`src/core/registry.ts:233-235`); mit `prodHosts: []` ist der Schalter genau „der Betreiber hat
radio eingeschaltet". Begründung (`Spec:5921-5926`): eine unbedingte Pflicht hieße, die Suite
startet ab dem ersten Image mit `radio` nicht mehr, bis die `.env` ergänzt ist — „dieses Modul
blockierte damit jeden unbeteiligten Deploy im Fenster zwischen Merge und Cutover". ⛔ **Es ist
dieselbe Variable, die das Modul einschaltet; einen zweiten, vergessbaren gibt es nicht.**

**Danach, in dieser Reihenfolge:**

| Reihenfolge | Was | Quelle |
|---|---|---|
| 1 | `...grenzenFehler(env)` | G1 — Prüfungen 3, 5, 6 der Achtertafel |
| 2 | `SUITE_ADMIN_GROUP_RADIO` fehlt oder leer | Prüfung 1 |
| 3 | `SUITE_ACCESS_GROUP_RADIO !== undefined` | Prüfung 2 |
| 4 | `historieMonateFehler(env)` | Prüfung 4, **E-G3** |
| 5 | die zwei `console.warn`-Traefik-Meldungen (⛔ **kein** Rückgabewert) | §7.3.4 |
| 6 | die `console.info`-Zeile zum Zustand von `SUITE_UPDATER_GROUP_RADIO` | NS-V4 |
| 7 | ⛔ **NEU:** die `console.info`-Zeile „`radio.db` existierte vor diesem Start nicht" — `existsSync(moduleDbPath("radio"))`, ⛔ **kein** Rückgabewert | ⬜ **G-L2**, entschieden. Sie steht **hier** und nicht in `starteRadioHintergrund()`, weil sie dort gemessen **nie feuern könnte**: `migrateAllModules()` (`src/instrumentation.ts:56`) legt `radio.db` über `openModuleDatabase` an (`bootstrap.ts:107-112`, `core/db/index.ts:12-17`), **bevor** `startBackgroundWork()` läuft (`:60`). ⛔ **`existsSync` ist KEIN Tabellenzugriff** und legt nichts an — B8 und der Fall `radioBootFehler liest KEINE Tabelle` bleiben unberührt. ⛔ **`info`, nicht `warn`:** beim ersten Deploy (vor dem Import) ist die Abwesenheit legitim; ein `warn` machte einen vorgeschriebenen Deploy zum Stopp-Punkt nach Zusage 1. Ihr Alarm ist Zusage 16 |

⛔ **Prüfung 2 gilt für `=""` UND für `=irgendwas`.** `!== undefined`, nicht `!== ""` — ein
gesetzter Wert wäre still wirkungslos, `validateGroupConfig` meldet nur den leeren Fall.

⛔ **Prüfung 1 liest die Variable DIREKT**, nicht über `adminGroupsFor` — die fiele sonst still auf
`mod.adminGroups` zurück (`src/core/groups.ts:102-108`) und meldete nichts.

⛔ **Zeile 6 ist eine `info`, keine Prüfung** (NS-V4): ein **gesetzter, aber leerer** Wert ist
gültig („niemand ist Updater") und darf **nicht** abbrechen; ein Tippfehler ist von außen nicht
unterscheidbar. Der Helfer prüft deshalb **nicht den Inhalt, sondern meldet den Zustand LAUT**.

### `historieMonate` und `historieMonateFehler` (E-G3)

```ts
/** Vorbelegung ist RETENTION_MONATE_VORGABE. Wirft bei gesetztem, ungueltigem Wert. */
export function historieMonate(env: EnvLike = process.env): number;

/** Dieselbe Pruefung, aber als Meldung. Wirft nie. */
export function historieMonateFehler(env: EnvLike = process.env): string | null;
```

⛔ **`0` wird abgewiesen, nicht als „aus" gelesen** — `0` Monate löschte beim ersten Lauf die
gesamte abgeschlossene Historie. Abschalten geht über `RADIO_HISTORIE_PURGE=0`.
⛔ **Keine Obergrenze.** Die Spec gibt keine; eine erfundene wäre ein Startabbruch, den kein
Kapiteltext rechtfertigt.
⛔ **Leer gesetzt gilt wie nicht gesetzt** — `RADIO_HISTORIE_MONATE=` ist der häufigere Fall als die
fehlende Zeile (jemand räumt eine `.env` auf), und `Number("")` wäre 0. Vorbild
`grenzen.ts:126-133`.
⛔ **Kein `Number()`** — `Number("0x10")` ist 16 und `Number.isInteger(16)` wahr. Vorbild
`grenzen.ts:122` (`const GANZZAHL = /^[+-]?\d+$/`).

### Die Einhängung, wörtlich

In `src/core/bootstrap.ts`, im `errors`-Array **unmittelbar nach der lagerbuch-Zeile** (heute `:98`):

```ts
    // radio: greift nur bei gesetztem SUITE_HOST_RADIO und WIRFT NIE (§7.3.2).
    ...(await radioBootFehler()),
```

und der Import neben den bestehenden Modul-Importen:

```ts
import { radioBootFehler } from "@/app/m/radio/_lib/boot";
```

⚠️ **Die Spec nennt für diese Stellen Zeilennummern aus einem älteren Stand** (`:5860-5865`,
`:5868-5870`). Gemessen am 26.08.2026: `assertHostConfig()` liegt bei `src/core/bootstrap.ts:90-103`,
der `filesBootFehler()`-Aufruf bei `:95`, der `lagerbuchBootFehler()`-Aufruf bei `:98`, der Wurf bei
`:100-102`. ⛔ **Wer die Naht baut, zählt die Zeilen am eigenen Arbeitsstand neu.**

### Die Testtabelle

| Datei | Testname | Aussage |
|---|---|---|
| `_lib/boot.test.ts` | `ohne SUITE_HOST_RADIO meldet radioBootFehler nichts` | Env ohne Variable, **auch ohne** `SUITE_ADMIN_GROUP_RADIO` und ohne Geheimnis → `[]` |
| " | `fehlende Admin-Gruppe ist ein Startabbruch` | Host gesetzt, Gruppe fehlt → genau eine Meldung mit dem Variablennamen |
| " | `leere Admin-Gruppe ist derselbe Startabbruch` | `SUITE_ADMIN_GROUP_RADIO=" , "` → Meldung (eigener Fall: `validateGroupConfig` meldet das nicht) |
| " | `eine gesetzte Zugangsgruppe ist ein Startabbruch` | `=""` **und** `=irgendwas` → je eine Meldung |
| " | `RADIO_HISTORIE_MONATE=0 wird abgewiesen` | **eigener Fall**, nicht in einer Tabelle mit `-1`/`abc` versteckt |
| " | `RADIO_HISTORIE_MONATE ohne Wert ergibt die Vorbelegung 2` | `historieMonate({})` → `RETENTION_MONATE_VORGABE` |
| " | `RADIO_HISTORIE_MONATE=0x10 wird abgewiesen` | die Hex-Falle |
| " | `radioBootFehler wirft nie` | Env mit allen Fehlern gleichzeitig → Liste mit mehr als einem Eintrag, ⛔ **`resolves` statt `rejects`** |
| " | `radioBootFehler liest KEINE Tabelle` | ⛔ **Der Reihenfolge-Test aus Auflage 2** — siehe unten |
| " | `ein fehlender radio-Host in SUITE_TRAEFIK_RULE meldet, bricht aber nicht ab` | `console.warn`-Spion feuert, Rückgabe enthält **keine** Zeile dazu |
| " | `ein radio-admin-Host in SUITE_TRAEFIK_RULE meldet, bricht aber nicht ab` | dasselbe für Falle 28 |
| " | `beide Traefik-Meldungen bleiben still, wenn SUITE_TRAEFIK_RULE fehlt` | ein Dev-Container hat die Variable legitim nicht |
| " | `der Zustand von SUITE_UPDATER_GROUP_RADIO wird als info gemeldet, in allen drei Faellen` | gesetzt+Wert / gesetzt+leer / fehlt → je eine `console.info`, ⛔ **nie** eine Rückgabezeile |
| " | `eine fehlende radio.db wird als info gemeldet, nicht als warn` | ⛔ **⬜ G-L2, gebaut.** Frisches, leeres `DATA_DIR` → **eine** `console.info` mit dem Dateinamen und ⛔ **keine** `console.warn`; danach `DATA_DIR` mit angelegter `radio.db` → **keine** Zeile. Zwei Zusicherungen in einem Fall, weil die Stufe genauso tragend ist wie die Meldung (Zusage 16 an Spec 2) |
| `src/core/bootstrap.test.ts` | (G3) | siehe dort |

⛔ **Der Reihenfolge-Test, ausgeschrieben — er ist Auflage 2 und kein Typecheck sieht ihn.**
`radioBootFehler liest KEINE Tabelle` wird **nicht** als Kommentar behauptet, sondern gemessen:
der Fall setzt `DATA_DIR` auf ein **frisches, leeres** Verzeichnis, ruft `radioBootFehler()` mit
vollständig gültigem `env` auf und sichert danach zu, dass in diesem Verzeichnis **keine**
`radio.db` entstanden ist. ⛔ **Das ist die Sonde, die trägt** — `openModuleDatabase` legt
Verzeichnis und Datei bei Bedarf **neu an** (Analyse-Falle 29), also ist eine entstandene Datei der
direkte Beweis eines Tabellenzugriffs. Ein reiner Quelltext-Scan auf `getDb` wäre die schwächere
Form und ließe einen indirekten Import durch.

⚠️ **Der Fall braucht ein eigenes `DATA_DIR`** und darf `getModuleDb()` nicht anfassen — dessen
Cache ist per Modulschlüssel gekeyt, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`).

- [ ] **Schritt 1** — Die **vierzehn** Testfälle schreiben, alle rot (dreizehn plus der
      `radio.db`-Fall aus ⬜ G-L2).
- [ ] **Schritt 2** — Sonden benennen:
      **S-G2a**: den `prodHostsFor`-Schalter entfernen → `ohne SUITE_HOST_RADIO meldet
      radioBootFehler nichts` rot.
      **S-G2b**: Prüfung 2 von `!== undefined` auf `!== ""` ändern → der `=irgendwas`-Fall rot.
      **S-G2c**: in `historieMonateFehler` die Untergrenze von `1` auf `0` senken →
      `RADIO_HISTORIE_MONATE=0 wird abgewiesen` rot.
      **S-G2d**: ⛔ **die Auflage-2-Sonde.** Ein `getDb()` am Anfang von `radioBootFehler()`
      einsetzen (Ergebnis verwerfen) → `radioBootFehler liest KEINE Tabelle` muss **rot** werden.
      Bleibt er grün, misst der Fall nichts und wird neu geschrieben, nicht ergänzt.
      **S-G2e**: die Traefik-Prüfung von `warn` auf einen Rückgabestring ändern →
      `…meldet, bricht aber nicht ab` rot.
      **S-G2f**: ⛔ **die G-L2-Sonde.** Die `console.info` der `radio.db`-Zeile auf `console.warn`
      heben → `eine fehlende radio.db wird als info gemeldet, nicht als warn` muss **rot** werden.
      ⛔ Sie schützt dieselbe Regel wie S-G4d („`warn` = Stopp, `info` = Zustand") an der Stelle,
      an der ein `warn` einen **vorgeschriebenen ersten Deploy** zum Stopp-Punkt machte.
- [ ] **Schritt 3** — `radioBootFehler`, `historieMonate`, `historieMonateFehler` in `_lib/boot.ts`
      bauen — ⛔ **am Dateiende, nach `raeumeLeihhistorie()`** (NS-M1). Den Kopfkommentar `:4-10`
      fortschreiben: „Kapitel 7 (Planteil 5)" wird zu „Kapitel 7 (Planteil 5, gebaut)", die
      Reihenfolge-Auflage bleibt **wörtlich stehen**.
- [ ] **Schritt 4** — Import und Spread-Eintrag in `src/core/bootstrap.ts` setzen. ⛔ **Mit `await`
      und mit Spread** — ohne beides ist der Aufruf typkorrekt, lint-sauber und **wirkungslos**.
- [ ] **Schritt 5** — Tor, plus `rtk pnpm vitest run src/core/bootstrap.test.ts`.
      ⛔ **Nicht mergen ohne G3.**

```
rtk git add src/app/m/radio/_lib/boot.ts src/app/m/radio/_lib/boot.test.ts src/core/bootstrap.ts
rtk git commit -m "feat(radio): radioBootFehler und die Einhaengung in assertHostConfig (B8)"
```

---

## Aufgabe G3: Der Boot-Haken-Wächter wird abgeleitet statt aufgezählt

**Files:** Modify `src/core/bootstrap.test.ts`

⛔ **Gemeinsames Tor mit G2.**

⛔ **Der Befund, gemessen, und er ist der Grund für diese Aufgabe.**
`src/core/bootstrap.test.ts:377-416` führt `describe("Boot-Haken der Module sind verdrahtet")` mit
einer **handgepflegten Namensliste**:

```
    for (const haken of ["filesBootFehler", "lagerbuchBootFehler"]) {
```

(zweimal, `:399` und `:411`). **Ein `radioBootFehler`, das nie eingehängt wird, bliebe dort grün.**
Das ist exakt die NT11-Form: ein Wächter, der eine Liste prüft statt einer Menge, bewacht nur, was
jemand daran denkt einzutragen.

Spec §7.3.7 verlangt ausdrücklich die abgeleitete Form: „Quelltext-Scan über
`src/app/m/*/_lib/boot.ts`: jede exportierte `*BootFehler`-Funktion muss in `src/core/bootstrap.ts`
vorkommen" — und dieselbe Zeile für die Hintergrundstarter. ⛔ **Diese zwei Zeilen gehören in
`bootstrap.test.ts`, nicht in eine radio-eigene Datei** (Zusage an das Test-Kapitel).

### Was gebaut wird

| Klausel | Menge | Zusage |
|---|---|---|
| (I) | jede aus `src/app/m/*/_lib/boot.ts` **exportierte** Funktion, deren Name auf `BootFehler` endet | steht in `src/core/bootstrap.ts` **und** wirksam als `...(await <name>())` im `errors`-Block |
| (IIa) | **vorwärts:** jede aus derselben Menge Dateien exportierte Funktion, deren Name auf `Hintergrund` oder `Arbeiter` endet und mit `starte` beginnt | steht wirksam im Rumpf von `startBackgroundWork()` |
| (IIb) | ⛔ **NEU, rückwärts:** jeder `starte…(`-Aufruf **im Rumpf von `startBackgroundWork()`** | hat einen `import` auf einen `starte*`-Export — und ihre **Zahl** steht als `toBe` |
| (III) | die **Zahl** der gefundenen Haken je Klausel | `toBe(<gemessen>)` — ⛔ eine Ableitung, die auf null Dateien läuft (falscher Glob, geänderte Endung), ist leer-grün |

⛔ **WARUM (IIb) EXISTIERT — der Befund ist gemessen, und ohne ihn baut G3 die
Vollzähligkeitsbehauptung aus der Planteil-4-Lehre neu.**
Der Glob `src/app/m/*/_lib/boot.ts` stammt aus der Spec (`Spec:6103-6104`) und trägt für Klausel (I)
vollständig. **Für die Hintergrundstarter trägt er nicht:** `startBackgroundWork()` ruft heute
**zwei** Starter (`src/core/bootstrap.ts:129-134`), nach G4 **drei** — und
`starteAufgabenScanArbeiter` liegt in `src/app/m/aufgaben/_lib/scan.ts:324`, wird von
`bootstrap.ts:15` importiert und ist vom Glob **strukturell nicht sichtbar**. Eine reine
Vorwärts-Ableitung stünde nach G4 auf `toBe(2)`, während **drei** laufen — und die Zahl **verdeckte**
die Lücke, statt sie zu melden.

⚠️ **Der naheliegende Gegenvorschlag — den Glob auf `src/app/m/*/_lib/*.ts` weiten — ist gemessen
FALSCH und wird ausdrücklich verworfen:** er zöge `starteAvArbeiter`
(`src/app/m/files/_lib/av.ts:505`) mit herein, und die steht **nicht** im Rumpf von
`startBackgroundWork()`, sondern wird von `starteFilesHintergrund` gerufen
(`files/_lib/boot.ts:139`). Klausel (IIa) wäre damit **rot by construction**.

⛔ **Also: (IIa) bleibt auf dem Spec-Glob und wird im Quelltext ausdrücklich als TEILMENGE
benannt** — mit `src/app/m/aufgaben/_lib/scan.ts:324` als **namentlich geführter Ausnahme**
(die Planteil-4-Lehre: der fünfte Fall stand **blank ohne Kommentar** und war mit dem naheliegenden
Gegen-`grep` nicht auffindbar). **(IIb) fängt die Ausnahme in der Zahl**, ohne die Menge zu weiten.

⛔ **Die Zahlen, gemessen am 26.08.2026 — sie stehen hier, damit der Bauende sie nicht rät:**
Klausel (I) **3** nach G2 (files, lagerbuch, radio) · Klausel (IIa) **1** vor G4 (nur `files`) und
**2** danach · Klausel (IIb) **2** vor G4 und **3** danach. ⛔ **Alle vier werden am eigenen
Arbeitsstand nachgezählt.**

⛔ **Klausel (IIa) ist heute noch nicht erfüllbar für `radio`** — `starteRadioHintergrund()` entsteht
erst in G4. Das ist **richtig so**: nach G3 ist der Wächter scharf, und G4 kann seine Funktion nicht
mehr bauen, ohne sie einzuhängen. ⚠️ **Er muss nach G3 grün sein**, weil `radio` heute keinen
Starter exportiert — wer feststellt, dass er rot ist, hat entweder die Ableitung falsch gebaut oder
G4 vorgezogen.

⛔ **Der Kommentarschnitt bleibt der bestehende Zeilenfilter** (`:393-396`,
`!zeile.trim().startsWith("//")`), und zwar aus zwei gemessenen Gründen: (a) `src/core/bootstrap.ts`
trägt **kein** Regexliteral (geprüft), die dreiteilige Reparatur hätte hier also nichts zu
reparieren; (b) diese Klauseln sind **positive** Zusicherungen — ein zu aggressiver Schnitt
entfernte echte Zeilen und machte den Test **rot**, nicht still grün. ⛔ **Das ist der umgekehrte
Fall zu Auflage 6 und wird im Quelltext ausgeschrieben**, damit ein späterer Leser nicht meint,
hier sei die Reparatur vergessen worden.

⛔ **`src/core/bootstrap.test.ts` importiert für diese Klauseln NICHT aus
`src/app/m/radio/_lib/quelltextScan.ts`.** Ein Kern-Test, der einen Helfer aus **einem** Modul
zieht, macht diesen Helfer zum Kern-Bestandteil, ohne dass es jemand entschieden hat. (Der Bestand
importiert dort zwar `ZAHL_NAMEN` aus `files` — `:14` —, aber das ist ein **Datum** dieses Moduls
und keine geteilte Mechanik.)

### Die Testtabelle

| Testname | Aussage |
|---|---|
| `jeder Modul-Boot-Haken ist in assertHostConfig eingehaengt` | Klausel (I), über die abgeleitete Menge |
| `jeder Haken steht WIRKSAM AWAITET im errors-Array, nicht irgendwo` | bestehender Fall, jetzt über die abgeleitete Menge |
| `die Zahl der Boot-Haken steht EXAKT auf dem Stand dieses Planteils` | Klausel (III) für (I) — `toBe(3)` nach G2 (files, lagerbuch, radio); ⛔ **die Zahl wird gemessen, nicht aus diesem Plan abgeschrieben** |
| `jeder Hintergrundstarter aus einer _lib/boot.ts ist in startBackgroundWork eingehaengt` | Klausel (IIa). ⛔ **Der Testname sagt „aus einer `_lib/boot.ts`"** — er behauptet damit **keine** Vollzähligkeit über alle Starter |
| `die Zahl dieser Hintergrundstarter steht EXAKT auf dem Stand dieses Planteils` | Klausel (III) für (IIa) — `toBe(1)` vor G4, `toBe(2)` danach; G4 hebt sie im selben Commit |
| `jeder starte-Aufruf in startBackgroundWork hat einen Import, und es sind genau so viele` | ⛔ **Klausel (IIb)** — `toBe(2)` vor G4, `toBe(3)` danach. **Sie ist die Zeile, die `starteAufgabenScanArbeiter` überhaupt sichtbar macht**, und sie fängt einen gelöschten Aufruf, den (IIa) nach einer gelöschten Datei nicht mehr fände |

- [ ] **Schritt 1** — Die **sechs** Fälle schreiben; ⛔ **die ZWEI alten ersetzen, nicht
      danebenstellen** — gemessen trägt `describe("Boot-Haken der Module sind verdrahtet")`
      (`src/core/bootstrap.test.ts:377`, Blockende `:416`) genau **zwei** `it`: `:398`
      (`assertHostConfig ruft jeden Modul-Boot-Haken`) und `:404`
      (`jeder Haken steht WIRKSAM AWAITET im errors-Array, nicht irgendwo`).
      ⛔ **`src/core/bootstrap.test.ts:302` gehört einem ANDEREN Wächter und bleibt unangetastet** —
      `it("prüft die Konfiguration VOR den Migrationen und startet den Hintergrund DANACH")` steht
      im `describe` ab `:295` („die Reihenfolge im Boot") und ist ein lebender Fall. Wer nach der
      früheren Angabe „die drei alten" sucht, greift genau ihn und entfernte ihn **still**.
      ⛔ **Zwei Wächter über derselben Fläche, von denen einer die Ableitung nicht kennt, sind ein
      Wächter zu viel** (dieselbe Begründung wie B14 zum `_actions/`-Scan) — das gilt für die
      **zwei** im selben `describe`, nicht für `:302`.
- [ ] **Schritt 2** — Sonden:
      **S-G3a**: `...(await radioBootFehler())` in `bootstrap.ts` **auskommentieren** →
      `jeder Haken steht WIRKSAM AWAITET…` rot. ⛔ **Auskommentieren, nicht löschen** — genau diese
      Mutation ist die wahrscheinlichere und der Grund für den Zeilenfilter.
      **S-G3b**: das `await` aus derselben Zeile entfernen → derselbe Fall rot.
      **S-G3c**: den Glob auf ein nicht existierendes Verzeichnis richten →
      `die Zahl der Boot-Haken…` rot (die Leer-Grün-Probe).
      **S-G3e**: ⛔ **die (IIb)-Sonde.** `starteAufgabenScanArbeiter();` in `startBackgroundWork()`
      auskommentieren → `jeder starte-Aufruf in startBackgroundWork hat einen Import, und es sind
      genau so viele` muss **rot** werden, während **beide** (IIa)-Fälle **grün bleiben**.
      ⛔ **Genau dieses Paar ist der Beweis, dass (IIa) allein eine Teilmenge bewacht** — bleibt
      auch (IIb) grün, ist die Rückwärtsrichtung nicht gebaut und die Zahl bewacht nur sich selbst.
      **S-G3d**: `radioBootFehler` in `_lib/boot.ts` in `radioStartFehler` umbenennen und die
      Einhängung mitziehen → Klausel (I) bleibt grün **und die Zahl auch** — ⛔ **das ist bewusst
      und wird im Quelltext ausgeschrieben:** der Wächter prüft die **Kopplung**, nicht die
      Namenswahl. Eine Umbenennung ohne Einhängung fängt er.
- [ ] **Schritt 3** — Den Kopfkommentar von `describe(...)` fortschreiben: warum die Liste weg ist,
      und dass der Zeilenfilter nicht die dreiteilige Reparatur ist (mit Grund).
- [ ] **Schritt 4** — Tor. ⛔ **G2 und G3 zusammen abnehmen.**

```
rtk git add src/core/bootstrap.test.ts
rtk git commit -m "test(core): der Boot-Haken-Waechter leitet die Hakenmenge ab, statt sie aufzuzaehlen"
```

---

## Aufgabe G4: `starteRadioHintergrund()` — der Takt, die fünf Takt-Fälle, die Einhängung, der dritte Spion

**Files:** Modify `src/app/m/radio/_lib/boot.ts`, `src/app/m/radio/_lib/boot.test.ts`,
`src/core/bootstrap.ts`, `src/core/bootstrap.test.ts`

**Interfaces:**
- Produces: `starteRadioHintergrund(env?): void`, `stoppeRadioHintergrund(): void`,
  `RADIO_HISTORIE_ERSTLAUF_MINUTEN_VORGABE`, `RADIO_HISTORIE_TAKT_MS` — gelesen von
  `src/core/bootstrap.ts` und von den Takt-Fällen.
- Consumes: `raeumeLeihhistorie()` und `historieMonate()` aus derselben Datei, `getDb()` aus
  `../_db/client`.

⛔ **Diese Aufgabe trägt ihre Tests selbst.** Die fünf Takt-Fälle sind die Tests dieses Rumpfs;
sie in eine eigene Aufgabe zu schieben hieße, den Takt ungetestet auszuliefern — und der erste der
fünf ist die **Regressionssperre gegen den zurückgebauten Sofort-Purge**.

### Der Vertrag

```ts
/** Registriert den Retention-Takt und schreibt die Bestandswarnung. Synchron, wirft nie. */
export function starteRadioHintergrund(env: EnvLike = process.env): void;

/** Nimmt den Takt zurueck. Exportiert, weil ein Modulzustand sonst den Test ueberlebt. */
export function stoppeRadioHintergrund(): void;
```

⬜ **G-L3** und ⬜ **G-L4** werden hier abgelesen: die Spec nennt für `stoppeRadioHintergrund()` nur
den Namen (`Spec:1555`) und schreibt für `starteRadioHintergrund()` keine Signatur aus. Beide Formen
folgen dem Hausmuster `stoppeAufraeumTimer()` (`src/app/m/files/_lib/boot.ts:182-186`) — **das ist
eine Ablesung am Bestand, keine Erfindung**, und der Kopfkommentar sagt es so.

### Sie tut genau drei Dinge, in dieser Reihenfolge

| # | Was | Hinter dem Host-Schalter? |
|---|---|---|
| 1 | **Die Bestandswarnung** — `devices` ist leer. ⛔ **NUR NOCH DIESE EINE ZEILE:** die Zeile „`radio.db` existierte vor diesem Start nicht" ist nach `radioBootFehler()` gewandert, weil sie hier gemessen **nie feuern könnte** (⬜ G-L2, entschieden — siehe die Melde-Zeilen-Tafel) | ✅ **ja** — „eine Warnung über einen Bestand, den dieser Container gar nicht bedient, ist Lärm" |
| 2 | **Der Abschalter** — `RADIO_HISTORIE_PURGE=0`: kein Timer, `console.info` bei **jedem** Start | ⛔ **nein** |
| 3 | **Den Retention-Timer registrieren** — `setInterval(purge, 24h)`, `.unref()`, erster Lauf **nicht** bei t=0 | ⛔ **nein** |

⛔ **KEIN Host-Schalter vor dem Retention-Timer** (B5). Grund: der Takt braucht keine Konfiguration,
nur die Tabelle; eine vergessene `SUITE_HOST_RADIO` schaltete sonst **still** die Löschrichtlinie
ab, die der DSGVO-Grund für `borrower_name` ist. Der Abschalter ist `RADIO_HISTORIE_PURGE=0` — er
ist bewusst und bei jedem Start laut.

### Die Konstanten

| Name | Vorbelegung | Wirkung |
|---|---|---|
| `RETENTION_MONATE_VORGABE` | **2** | steht bereits (`_lib/boot.ts:25`), 1:1 aus `radio-admin/server/src/services/retentionService.ts:9` |
| `RADIO_HISTORIE_MONATE` | 2 | Retention der abgeschlossenen Leihen; `0` verboten (G2) |
| `RADIO_HISTORIE_PURGE` | 1 | `0` schaltet den Timer **ganz** ab |
| `RADIO_HISTORIE_ERSTLAUF_MINUTEN` | **1440** (B5) | Verzögerung des ersten Laufs. „Nie `0`" ist eine Prosa-Regel, ⛔ **keine** Boot-Prüfung |
| Takt | 24 h | `24 * 60 * 60 * 1000` ms |

⛔ **Der Cutoff wird bei JEDEM Lauf neu gerechnet, nie beim Registrieren gemerkt** — ein Prozess
läuft wochenlang.
⛔ **`.unref()` auf jedem Timer**, damit ein Skript-Aufruf (`scripts/import/*.ts`) nicht am Timer
hängt.
⛔ **`purge` ist `raeumeLeihhistorie(getDb(), undefined, historieMonate(env))`, in `try`/`catch`** —
diese Funktion **importiert** die Purge-Abfrage, sie definiert sie nicht (Zusage an Kapitel 2).
⛔ **Eine Überlappungswache** um den Lauf (`purgeLaeuft`-Flag), analog `files/_lib/boot.ts:188-207`
— „ein Fehler im Lauf wirft nicht aus dem Takt heraus".

**Die HMR-Wache, wörtlich als Bauform:**

```ts
let purgeUhr: ReturnType<typeof setInterval> | undefined;
```

und `if (purgeUhr !== undefined) return;` als **erste** Anweisung des Registrierungsteils.
⛔ **Zwei Timer wären zwei Läufe je Takt** — und weil jeder Lauf ein **Löschereignis** ist, heißt
„mehrfach registriert" hier „mehrfach gelöscht".

⛔ **Was die Wache leistet und was NICHT — beides gehört in den Quelltext neben sie.**
Sie fängt **wiederholte Aufrufe in derselben Modulinstanz**; genau das misst der Fall
`zweimaliger Aufruf startet nur einen Timer`. Sie fängt ⛔ **nicht** einen Hot Reload, der das Modul
**neu instanziiert** — danach ist das Modul-`let` wieder `undefined`. Dafür gibt es in diesem Repo
**keine Messung**, und das Gegenindiz steht im Bestand: `src/core/db/index.ts:25` hält den DB-Cache
bewusst auf `globalThis.__suiteDb`, **weil** Modulzustand hier nicht verlässlich überlebt.
⛔ **Die Hausform (`files/_lib/boot.ts:174`) wird übernommen, weil sie die gesetzte ist — nicht,
weil sie gemessen HMR-fest wäre.** Eine `globalThis`-Wache wäre die stärkere Form; sie wird nicht
gewählt, um nicht als einziges Modul eine abweichende Bauart einzuführen. ⛔ **Dieser Satz steht im
Quelltext, nicht nur hier** — sonst liest der nächste Bauende die Wache als HMR-Beweis.

**Der verzögerte Erstlauf:** ein `setTimeout(erstlauf, minuten * 60_000).unref()`, der den
`setInterval` **danach** setzt — oder ein `setInterval` mit einem Zähler, der den ersten Tick
überspringt. ⛔ **Welche Form auch gewählt wird: die HMR-Wache muss BEIDE Uhren decken**, sonst
hinterlässt ein Hot Reload zwischen Timeout und Interval eine verwaiste Uhr.

### Die Einhängung

In `src/core/bootstrap.ts`:

```ts
export function startBackgroundWork(): void {
  starteFilesHintergrund();
  starteAufgabenScanArbeiter();
  // radio: Retention-Timer + Bestandswarnung. Purgt NICHT bei t=0 (§7.3.5).
  starteRadioHintergrund();
}
```

⛔ **UND DER DRITTE SPION IN `src/core/bootstrap.test.ts` — im selben Commit.**
Gemessen: `startBackgroundWork()` wird dort **echt** gerufen, zweimal (`:315-340` und `:341-364`).
Ohne Spion öffnet dieser Testlauf eine echte `radio.db` unter `./.data/bootstrap-test` und
registriert einen echten Timer. Der Bestand hat für genau diese Klasse bereits einen
(`vi.mock("@/app/m/files/_lib/av")`, `:41-50`, mit der Begründung „der echte Arbeiter öffnet Sockets
und liest Tabellen"). Der neue folgt derselben Form:

```ts
vi.mock("@/app/m/radio/_lib/boot", async (importOriginal) => { … })
```

mit `...echt` gespreadet, damit `radioBootFehler` **echt** bleibt (G2/G3 hängen daran), und
`starteRadioHintergrund` durch einen Zähler ersetzt. Dazu **ein** neuer Fall:
`startBackgroundWork startet den radio-Takt` — er ist zugleich Klausel (II) von G3 im Verhalten.

### Die Testtabelle — die fünf Takt-Fälle aus §2.7.2, wörtlich

| Testname | Aussage |
|---|---|
| `starteRadioHintergrund loescht beim Start NICHTS` | eine überfällige Leihe steht nach `starteRadioHintergrund()` und `vi.advanceTimersByTime(0)` **noch da**. ⛔ **Die Regressionssperre** |
| `nach RADIO_HISTORIE_ERSTLAUF_MINUTEN laeuft der erste Lauf` | dieselbe Leihe ist nach `advanceTimersByTime(1440 * 60_000)` weg |
| `RADIO_HISTORIE_PURGE=0 registriert gar keinen Timer` | nach beliebig langem Vorspulen ist die überfällige Leihe **noch da**, und im Log steht die `console.info`-Zeile |
| `zweimaliger Aufruf startet nur einen Timer` | Idempotenz gegen wiederholte Aufrufe **in derselben Modulinstanz**: nach zwei Aufrufen und einem Takt genau **ein** Lauf. ⛔ **Ein Hot Reload, der das Modul neu instanziiert, ist davon NICHT gedeckt** — siehe die Bauform-Auflage oben |
| `ein Fehler im Lauf wirft nicht aus dem Takt heraus` | eine geschlossene Verbindung erzeugt eine Protokollzeile, keinen `unhandledRejection` |

**Dazu vier Fälle, die dieser Plan ergänzt und die kein anderer trägt:**

| Testname | Aussage |
|---|---|
| `die console.info-Zeile steht bei JEDEM Start, nicht nur beim ersten` | zweimal `stoppeRadioHintergrund()` + `starteRadioHintergrund()` → zwei `info`-Zeilen. ⛔ Sonst ist ein vergessenes `RADIO_HISTORIE_PURGE=0` ein **stiller** Verlust der Retention |
| `der Cutoff wird bei jedem Lauf neu gerechnet` | Zeit zwischen zwei Takten vorspulen; eine Leihe, die beim ersten Lauf noch **innerhalb** der Frist lag, ist nach dem zweiten weg |
| `die Bestandswarnung steht hinter dem Host-Schalter, der Timer NICHT` | ohne `SUITE_HOST_RADIO`: **keine** `warn`-Zeile, **aber** der Timer läuft und löscht nach dem Erstlauf. ⛔ **Die Sonde für B5** |
| `stoppeRadioHintergrund macht einen erneuten Start wieder moeglich` | sonst überlebt der Modulzustand den Testlauf und die vier Fälle oben sind reihenfolgeabhängig |

⛔ **Die Datei ist `_lib/boot.test.ts`, und sie trägt drei Beschreibungsorte — keine Zeile
doppelt** (`Spec:1593-1595`): die **fünf reinen Fälle** aus §8.2.5/§2.7.3 stehen dort bereits aus
Planteil 1, die Boot-Prüfungen kamen mit G2 (§7.3.7), die Takt-Fälle kommen jetzt (§2.7.2).
⚠️ **„Rein" heißt NICHT „über `retentionGrenze`"** — gemessen sind es **zwei** `retentionGrenze`-Fälle
(`describe("retentionGrenze — rein")` `:60`, darin `:61` und `:65`) und **drei** über
`raeumeLeihhistorie` (`describe(…)` `:81`, darin `:82`, `:89`, `:96`). Der Leitplan sagt es richtig
(`:311`: „die **fünf reinen Fälle** aus §8.2.5/§2.7.3"); die frühere Planfassung verengte „rein"
fälschlich auf `retentionGrenze`. ⛔ **Wer nach fünf `retentionGrenze`-Fällen sucht, findet zwei und
schreibt drei dazu — genau die doppelte Zeile, die dieser Absatz verbietet.**
⛔ **Es entsteht kein `_lib/retention.test.ts`** (B5).

### ⛔ Testmechanik — die Entscheidung fällt HIER, sie bleibt nicht offen

Die Fälle brauchen `vi.useFakeTimers()` **und** eine eigene, selbst migrierte SQLite-Datei —
⛔ **niemals `getModuleDb()`** (Cache per Modulschlüssel, nicht per `DATA_DIR`,
`src/core/db/index.ts:25-36`). Vorbild `src/app/m/lagerbuch/_db/migrations.test.ts:29-37`.

⛔ **Die frühere Fassung bot zwei Wege an — „ein gesetztes `DATA_DIR` vor dem ersten Aufruf ODER
eine Injektionsnaht" — und verbot beide an anderer Stelle selbst. Gemessen:**

* **Weg 1 (gesetztes `DATA_DIR`)** läuft über `starteRadioHintergrund()` → `getDb()` →
  `getModuleDb("radio", schema)` (`src/app/m/radio/_db/client.ts:22-24`). Bauform **26** verbietet
  `getModuleDb()` in einer Testdatei dieses Planteils — und der Cache hängt gemessen an
  `globalThis.__suiteDb[key]`, **nicht** an `DATA_DIR` (`src/core/db/index.ts:25-36`): ein
  `DATA_DIR`, das nach dem ersten Zugriff irgendeiner Testdatei gesetzt wird, wirkt **nicht mehr**.
* **Weg 2 (Injektionsnaht)** bräuchte einen DB-Parameter, den die **verbindliche** Signatur aus
  ⬜ G-L4 nicht hat: `starteRadioHintergrund(env: EnvLike = process.env): void`. Und `:1355`
  schreibt den Aufruf fest: `purge` ist `raeumeLeihhistorie(getDb(), …)`.

⛔ **VERBINDLICH: `vi.mock("../_db/client")` in `_lib/boot.test.ts`.** Der Mock lässt `getDb` auf ein
im Test **selbst geöffnetes und migriertes** Handle zeigen (Vorbild
`src/app/m/lagerbuch/_db/migrations.test.ts:29-37`). Drei Gründe, in dieser Reihenfolge:

1. Er hält Bauform **26** ein — im Test steht **kein** `getModuleDb`, auch nicht mittelbar.
2. Er lässt die G-L4-Signatur unberührt: **keine** Injektionsnaht, die nur der Test benutzt.
3. Er ist **derselbe Spion-Griff, den der Bestand für diese Klasse bereits führt** —
   `vi.mock("@/app/m/files/_lib/av")` in `src/core/bootstrap.test.ts:41-50`, mit der
   ausgeschriebenen Begründung „der echte Arbeiter öffnet Sockets und liest Tabellen".

⛔ **Und Bauform 26 bekommt den Zusatz „auch MITTELBAR über `getDb()`"** — wer nur den direkten
Aufruf verbietet, verbietet nichts.

- [ ] **Schritt 1** — Die neun Testfälle schreiben, alle rot.
- [ ] **Schritt 2** — Sonden:
      **S-G4a**: ⛔ **die Regressionssonde.** Einen Sofort-Purge einbauen — `purge()` unmittelbar
      vor `setInterval` rufen → `starteRadioHintergrund loescht beim Start NICHTS` muss **rot**
      werden. Bleibt er grün, misst er nichts; dann ist er neu zu schreiben, nicht zu ergänzen.
      **S-G4b**: ⛔ **die HMR-Sonde.** `if (purgeUhr !== undefined) return;` entfernen →
      `zweimaliger Aufruf startet nur einen Timer` rot.
      **S-G4c**: einen Host-Schalter vor den Timer setzen →
      `die Bestandswarnung steht hinter dem Host-Schalter, der Timer NICHT` rot (B5).
      **S-G4d**: `console.info` auf `console.warn` heben → der Info-Fall rot. ⛔ Diese Sonde schützt
      die Runbook-Regel „`warn` = Stopp, `info` = Zustand": ein `warn` machte den
      **vorgeschriebenen** Cutover-Zustand zur eigenen Stopp-Bedingung.
      **S-G4e**: den Cutoff beim Registrieren merken → `der Cutoff wird bei jedem Lauf neu
      gerechnet` rot.
      **S-G4f**: `.unref()` entfernen → ⚠️ **kein Testfall wird rot, und das ist bekannt.** Der
      Schaden zeigt sich erst an einem Skript, das nicht mehr endet. ⛔ **Der Plan behauptet
      deshalb keinen Wächter dafür** — die Zeile steht mit ihrer Begründung im Quelltext, und das
      ist alles, was hier trägt.
- [ ] **Schritt 3** — `starteRadioHintergrund`/`stoppeRadioHintergrund` und die Konstanten in
      `_lib/boot.ts` bauen, ⛔ **hinter** dem Planteil-5-Abschnitt aus G2. Kopfkommentar: NS-M1
      als **erledigt** markieren, die Reihenfolge-Auflage wörtlich stehen lassen, ⬜ G-L1/G-L2/G-L3/G-L4
      namentlich ablesen.
- [ ] **Schritt 4** — Einhängung in `startBackgroundWork()` **und** der dritte Spion in
      `src/core/bootstrap.test.ts` — ⛔ **im selben Commit**, plus **beide** Zahlen aus G3 anheben:
      Klausel (IIa) von `1` auf `2` **und** Klausel (IIb) von `2` auf `3`.
- [ ] **Schritt 5** — Tor, plus `rtk pnpm vitest run src/app/m/radio/_lib/boot.test.ts src/core/bootstrap.test.ts`.

```
rtk git add src/app/m/radio/_lib/boot.ts src/app/m/radio/_lib/boot.test.ts src/core/bootstrap.ts src/core/bootstrap.test.ts
rtk git commit -m "feat(radio): der Retention-Takt — kein Sofort-Purge, HMR-idempotent, lauter Abschalter"
```

---

## Aufgabe G5: Der Abräum-Worker — `_lib/sw-quelle.ts`, `sw.js/route.ts`, `HANDLER_ANZAHL` 4 → 5

**Files:** Create `src/app/m/radio/_lib/sw-quelle.ts`, `src/app/m/radio/_lib/sw-quelle.test.ts`,
`src/app/m/radio/sw.js/route.ts`, `src/app/m/radio/sw.js/route.test.ts`;
Modify `src/app/m/radio/riegel.test.ts`

**Interfaces:**
- Produces: `RADIO_SW_ABRAEUM_QUELLE: string`, `GET(req: Request): Response` — gelesen von
  **T4** (Fall 10) und vom Runbook (Spec 2 §3.2.6 V5/V6, §4.6 Nr. 5).
- Consumes: `hostAbweisung` aus `_lib/hostRiegel.ts` (**existiert**, `:33-37`).

⛔ **DIESE AUFGABE GEHÖRT ZUM ERSTEN DEPLOY, NICHT ZUM CUTOVER.** Siehe die Auflagentafel oben.
Sie steht bewusst als fünfte von acht und nicht am Blockende, damit ein vorgezogener Teil-Deploy sie
mitnehmen kann.

⛔ **Kein `"use client"` in `_lib/sw-quelle.ts`** (Falle 6) — sonst käme der Wert im Route Handler
als Client-Referenz an, HTTP 500. Vorbild und Begründung: `src/app/m/qr/sw.js/route.ts:1` liest
`SW_SOURCE` aus einer eigenen Quelldatei „damit er testbar ist".

### Der Handler, wörtlich (`Spec:5607-5622`)

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

⛔ **`hostAbweisung`, nicht `requireRadioHost`.** Ein `notFound()` wäre eine HTML-Fehlerseite
(`Content-Type: text/html`), und der Browser bräche die Worker-Registrierung mit einer
irreführenden Meldung ab (`Spec:5624-5629`). ⛔ **Der `??` macht „als erste Anweisung"
STRUKTURELL wahr** — der rechte Zweig wird erst ausgewertet, wenn der linke `null` ist
(`_lib/hostRiegel.ts:17-22`).

⚠️ **`_lib/hostRiegel.ts` trägt eine Falle für den, der die Datei anfasst** (`:12-15`, wörtlich):
`host.test.ts` prüft `not.toMatch(/\brequireRadioHost\s*\(/)` auf dem **Rohtext** jener Datei. ⛔
**Diese Aufgabe ändert `_lib/hostRiegel.ts` nicht** — sie benutzt ihn.

### Der Worker-Quelltext, wörtlich (`Spec:5635-5656`)

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

⛔ **Drei Eigenschaften und kein Zeichen mehr:** kein `fetch`-Handler, `caches.keys()` statt eines
festen Namens, `clients.claim()` **vor** `registration.unregister()` — in dieser Reihenfolge
(`Spec:5667-5669`).

⛔ **Kein `releaseBody()`.** Die Lehre aus `qr`s Worker (`src/app/m/qr/_lib/sw-source.ts:100`,
`:150`, `:212`) wird „nicht abgeschrieben, sondern eingehalten, indem die Ursache fehlt": dieser
Worker liest **niemals** eine Antwort. Ein `releaseBody` hier wäre toter Code. ⚠️ **Die Lehre bleibt
verbindlich für jeden späteren cachenden Worker** — der Satz gehört in den Kopfkommentar.

⛔ **Keine Registrierung.** Nichts in der Suite ruft `navigator.serviceWorker.register()`. ⛔ **Es
entsteht keine `RegisterSW.tsx` für `radio`** — auch nicht „vorsichtshalber".

### Der Scope

Root-Scope `/sw.js`, **nicht** `/m/radio/sw.js`. Der Rewrite in `src/core/routing.ts:43-79` bildet
extern `/sw.js` auf `radio.iuk-ue.de` intern auf `/m/radio/sw.js` ab; `routen.test.ts:122-132`
führt den Fall bereits als grünen Test (**Vorbedingung P7**, nichts zu tun).
⚠️ **Bedingung: `SUITE_HOST_RADIO` muss gesetzt sein** — sonst greift der Rewrite nicht und
`/sw.js` landet im Portal-Modul (§7.4.4, erster stiller Fall).

### `HANDLER_ANZAHL` 4 → 5

`riegel.test.ts:145` steht auf `4`; der Fahrplan im Kopf (`:117`) sagt: „Planteil 5 baut
`sw.js/route.ts` → HANDLER_ANZAHL = 5". ⛔ **Im selben Commit wie der Handler** (NS-V1), und ⛔ **mit
einem neuen Fahrplan-Eintrag**, nicht mit einer stillen Zahl (NS-V2). Der neue Eintrag lautet
sinngemäß: „Der Fahrplan ist mit Planteil 5 abgearbeitet. Die nächste Anhebung braucht einen neuen
Eintrag hier, nicht eine geänderte Zahl unten."

⚠️ **Klausel (c) ist vorbereitet** (`riegel.test.ts:441-450`): sie lässt `radioHostOderNull` **oder**
`hostAbweisung` zu, und der Kommentar nennt `sw.js/route.ts` namentlich. ⛔ **Nichts an der Klausel
ändern.**

### Die Testtabelle

| Datei | Testname | Aussage |
|---|---|---|
| `_lib/sw-quelle.test.ts` | `der Abraeum-Worker registriert keinen fetch-Handler` | Fake-`self`, die gesammelten `addEventListener`-Namen sind **genau** `["install", "activate"]` — `toEqual`, nicht „enthält nicht fetch" |
| " | `er loescht ALLE Cache-Namen, nicht nur radio-inventar-v1` | drei verschiedene Fake-Namen, **keiner Präfix des anderen**, alle drei `caches.delete`-Aufrufe |
| " | `er loescht auch den gemessenen Alt-Namen radio-inventar-v1` | ⛔ **E-G5**: der vierte Fake-Name ist der **gemessene** (`radio-inventar/apps/frontend/public/sw.js:2`), und er wird gelöscht. Die Messung steht damit in der Datei |
| " | `er beansprucht die Clients und traegt sich danach aus` | `clients.claim` **vor** `registration.unregister`, über **eine gemeinsame Aufrufliste** — zwei getrennte Zähler bewiesen die Reihenfolge nicht |
| " | `skipWaiting steht im install-Handler, nicht im activate-Handler` | sonst übernähme der Worker die Kontrolle erst nach einem zweiten Ladevorgang |
| `sw.js/route.test.ts` | `auf fremdem Host 404, und nicht als HTML` | `host: portal.localtest.me` → 404, Body `Not found`, ⛔ **`content-type` beginnt NICHT mit `text/html`** |
| " | `auf dem radio-Host 200 mit text/javascript` | `host: radio.localtest.me` → 200, `content-type` beginnt mit `text/javascript`, `cache-control: no-cache` |
| " | `der Riegel steht VOR jeder Auswertung der Quelle` | der 404-Fall wird auch dann geliefert, wenn `RADIO_SW_ABRAEUM_QUELLE` leer ist — die strukturelle Zusage des `??` |
| `riegel.test.ts` | (bestehender Fall) | `HANDLER_ANZAHL` auf 5, Klausel (c) grün mit `hostAbweisung` |

⚠️ **Fake-`self` statt jsdom.** Der Worker läuft in keinem DOM; die Testdatei baut ein Objekt mit
`addEventListener`, `skipWaiting`, `clients.claim`, `registration.unregister` und einem
`caches`-Doppel, und wertet `RADIO_SW_ABRAEUM_QUELLE` in dessen Gültigkeitsbereich aus.
⛔ **Node 26 bringt eigenes globales Zeug mit** — die Testdatei darf sich nicht darauf verlassen,
dass `caches` oder `self` **nicht** existieren; sie setzt beide explizit.

- [ ] **Schritt 1** — Die neun Testfälle schreiben, alle rot.
- [ ] **Schritt 2** — Sonden:
      **S-G5a**: einen `fetch`-Handler in die Quelle setzen → `…registriert keinen fetch-Handler` rot.
      **S-G5b**: `caches.keys()` durch `["radio-inventar-v1"]` ersetzen →
      `er loescht ALLE Cache-Namen…` rot, `…auch den gemessenen Alt-Namen` bleibt **grün**.
      ⛔ **Genau dieses Paar ist der Beweis, dass die zwei Fälle verschiedene Dinge messen** —
      einer allein wäre in einer der beiden Richtungen blind.
      **S-G5c**: `unregister` vor `claim` ziehen → der Reihenfolgefall rot.
      **S-G5d**: `hostAbweisung(req) ??` durch eine zweite Anweisung nach dem Bau der Antwort
      ersetzen → `der Riegel steht VOR jeder Auswertung der Quelle` rot.
      **S-G5e**: `HANDLER_ANZAHL` auf `4` zurücksetzen → der Zählfall in `riegel.test.ts` rot.
- [ ] **Schritt 3** — `_lib/sw-quelle.ts` und `sw.js/route.ts` bauen, wörtlich nach den zwei
      Codeblöcken oben. Kopfkommentare: die Reihenfolge-Auflage („erster Deploy, nicht Cutover"),
      die gemessene Cache-Lage des Alt-Kiosks mit `datei:zeile`, die `releaseBody`-Abgrenzung, ⬜ G-L7.
- [ ] **Schritt 4** — `HANDLER_ANZAHL` auf 5, Fahrplan-Eintrag im Kopf von `riegel.test.ts`.
- [ ] **Schritt 5** — Tor, plus `rtk pnpm vitest run src/app/m/radio/riegel.test.ts src/app/m/radio/_lib/routen.test.ts`.

```
rtk git add src/app/m/radio/_lib/sw-quelle.ts src/app/m/radio/_lib/sw-quelle.test.ts src/app/m/radio/sw.js/route.ts src/app/m/radio/sw.js/route.test.ts src/app/m/radio/riegel.test.ts
rtk git commit -m "feat(radio): der Abraeum-Worker unter /sw.js — erster Deploy, nicht Cutover"
```

---

## Aufgabe G6: `_lib/keine-pwa.test.ts` — der fünfte Quelltext-Scan

**Files:** Create `src/app/m/radio/_lib/keine-pwa.test.ts`

⛔ **AUFLAGE 6 IST HIER LASTTRAGEND, NICHT ZEREMONIELL.** Vier Scans trugen dieselbe stille
Blindstelle: ihr Kommentarschnitt kannte keine Regexliterale, ein `/\//` trägt zwei Schrägstriche,
der Schnitt hielt sie für einen Kommentarbeginn und löschte den Rest der Zeile. **Bei negativen
Zusicherungen — genau der Art, die diese Datei prüft — heißt das weniger gefundene Verstöße,
still.** Behoben in `6331e77`, `4ed3410`; die Reparatur ist dreiteilig und trägt nur zusammen.

⛔ **Diese Datei implementiert den Schnitt NICHT erneut. Sie importiert ihren Baustein aus
`src/app/m/radio/_lib/quelltextScan.ts`.** Gemessen exportiert die Datei genau zwei Namen:
`ohneKommentare` (`:61`) und `bereinigt` (`:208`).

⛔ **UND SIE IMPORTIERT `ohneKommentare`, NICHT `bereinigt` — Entscheidung E-G6a, und der Grund ist
gemessen.** `bereinigt` ist
`ohneRegexLiterale(ohneKommentareUndZeichenketten(q)).replace(/\/\/.*$/gm, "")` (`:208-209`), und
`ohneKommentareUndZeichenketten` **leert jedes Zeichenkettenliteral** (`:117-127`). Drei der fünf
verbotenen Zeichenketten (`manifest.webmanifest`, `rel="manifest"`, `beforeinstallprompt`) können
im Quelltext **nur innerhalb** eines Literals stehen — nach `bereinigt` sind sie **nie** auffindbar.
Und `_lib/sw-quelle.ts` ist praktisch vollständig ein Template-Literal: nach `bereinigt` bleibt
`export const RADIO_SW_ABRAEUM_QUELLE =   ;` übrig, die Datei ist für den Scan **leer**.
⛔ **Ein Scan, der drei seiner fünf Zusagen strukturell nicht prüfen kann, ist genau die
falsch-negative, stille Form, gegen die Auflage 6 antritt** — der Bestand schreibt sie aus
(`quelltextScan.ts:55-59`: „Ein Scan darf falsch-positiv sein und laut, nie falsch-negativ und
still"). `ohneKommentare` lässt Zeichenketten **absichtlich** stehen und ist deshalb der
Auflage-6-treue Baustein für diese Datei. **Die Versöhnung mit `KONTEXT.md:395` steht in E-G6a.**

⛔ **Was Auflage 6 hier tatsächlich verbietet, und es gilt unverändert: einen eigenen
`replace(/\/\/.*$/gm, "")` schreiben.** `ohneKommentare` ist ein **exportierter Baustein derselben
Datei**, kein Nachbau — wer ihn nachbaut, baut den Fehler zum fünften Mal.

⛔ **Und die Folge, die in den Kopfkommentar gehört, damit sie niemand „repariert": ein
NACHGESTELLTES `// … manifest.webmanifest` am Ende einer Codezeile wird gemeldet.**
`ohneKommentare` schneidet nur Blockkommentare und Zeilen, deren getrimmter Inhalt mit `//`
**beginnt** (`:55-59`). Das ist **falsch-positiv mit Absicht** und die gewollte Richtung.
⛔ **`ohneKommentareUndZeichenketten` und `ohneRegexLiterale` sind bewusst modul-privat** — der
Wächter, der ihren Direktaufruf verbietet, ist ein Zähler über den Dateitext und könnte einen Aufruf
aus einer fremden Datei nicht sehen; nur der nicht exportierte Name macht ihn konstruktiv unmöglich.
⛔ **Wer hier einen eigenen `replace(/\/\/.*$/gm, "")` schreibt, baut den Fehler zum fünften Mal.**

### Was der Scan zusichert

Über **alle** Quelldateien unter `src/app/m/radio/` (`.ts`, `.tsx`, ⛔ **ohne** `.test.ts`/`.test.tsx`
— sonst wäre die Datei gegen sich selbst rot, weil sie die verbotenen Zeichenketten als Suchmuster
führt):

| Verbotene Zeichenkette | Warum |
|---|---|
| `serviceWorker.register` | ⛔ **radio registriert keinen Worker** — die Route wird von der Update-Prüfung des Alt-Workers abgeholt (`Spec:5673-5678`) |
| `manifest.webmanifest` | kein Manifest (`Spec:5511-5513`) |
| `rel="manifest"` | kein `<link>` |
| `metadata` mit `manifest`-Feld | kein Next-Metadata-Manifest |
| `beforeinstallprompt` | kein Installations-Banner |

⛔ **Und eine Existenz-Zusicherung dazu:** `src/app/m/radio/manifest.webmanifest/` existiert **nicht**
als Verzeichnis. Das ist die Bauform-Hälfte von V8/R36 aus Spec 2 und läuft **im Repo**, nicht als
`curl`.

⛔ **Die Zählzusage** (Auflage 6, zweite Hälfte — „wer ‚alle‘ schreibt, zählt vorher"): die Zahl der
gescannten Dateien steht als `toBe(<beim Bau gemessen>)`. Ein Scan, der auf null Dateien läuft
(falscher Pfad, geänderte Endungenliste, umbenannte Modulwurzel), ist leer-grün und bewacht nichts.

⛔ **DIE VERZEICHNISFALLE, und sie träfe genau die Datei, um die es hier geht (Bauform 28).**
`statSync(pfad).isDirectory()` steht ⛔ **VOR** dem Endungsfilter. **G5 legt ein Verzeichnis namens
`src/app/m/radio/sw.js/` an** — und `/\.tsx?$/.test("sw.js")` ist **falsch**. Wer den Endungsfilter
zuerst anwendet, überspringt `sw.js/` samt `sw.js/route.ts`: der Scan ist um **genau die eine
Datei** blind, die einen Service Worker ausliefert, und die `toBe(N)`-Zahl stimmt trotzdem, weil sie
am selben kaputten Lauf gemessen wurde. **Die Hausform ist gemessen und wird übernommen:**
`_lib/bauform.test.ts:174-181` und `riegel.test.ts:184-191` prüfen `isDirectory()` zuerst und
filtern `/\.tsx?$/` erst danach; `src/app/m/qr/sw.js/route.ts` zeigt, dass ein Verzeichnis mit Punkt
im Namen hier Hausform ist.
⛔ **Dazu ein eigener Fall** (unten), der zusichert, dass `sw.js/route.ts` in der gescannten Liste
**vorkommt** — sonst bewacht die Zahl nur sich selbst.
⚠️ **Die Zahl ist volatil** — jede spätere Datei unter `src/app/m/radio/` hebt sie. Das ist gewollt
und wird im Kopfkommentar ausgeschrieben, mit dem Verweis auf `riegel.test.ts:98-100`
(`toBe`, nicht `toBeGreaterThanOrEqual`).

### Die Testtabelle

| Testname | Aussage |
|---|---|
| `radio bewirbt keine PWA` | keine der fünf Zeichenketten kommt in einer bereinigten Quelldatei vor; die Fehlermeldung nennt **Datei und Zeichenkette**, nicht nur „gefunden" |
| `die Zahl der gescannten Dateien steht EXAKT auf dem Stand dieses Planteils` | `toBe(<gemessen>)` |
| `es gibt kein manifest.webmanifest-Verzeichnis unter radio` | `existsSync` → `false` |
| `der Scan sieht durch einen Kommentar hindurch` | Selbstprobe: ein synthetischer Quelltext, dessen **Zeile mit `//` beginnt** (`// serviceWorker.register`), **wird nicht** gemeldet — ein Kommentar ist kein Verstoß |
| `… aber ein nachgestelltes Kommentarende wird GEMELDET, und das ist Absicht` | ⛔ **die Gegenrichtung, und sie gehört in die Tabelle, damit sie niemand „repariert"**: `const x = 1; // manifest.webmanifest` **wird** gemeldet. `ohneKommentare` schneidet nur zeilen-**führende** `//` (`quelltextScan.ts:55-59`), und das ist die Auflage-6-treue Richtung: laut und falsch-positiv statt still und falsch-negativ |
| `eine verbotene Zeichenkette INNERHALB eines Literals wird gefunden` | ⛔ **die K1-Probe.** Ein synthetischer Quelltext mit `addEventListener("beforeinstallprompt", …)` **wird** gemeldet. Mit `bereinigt` wäre er es **nie** — das Literal ist dort geleert |
| `sw.js/route.ts steht in der gescannten Liste` | ⛔ **die Verzeichnisfalle-Probe (Bauform 28).** Der Pfad `src/app/m/radio/sw.js/route.ts` kommt in der Dateiliste **vor**. Ohne diesen Fall ist eine falsche Filterreihenfolge um genau eine Datei blind, und die `toBe(N)`-Zahl deckt sie |

⛔ **Die zwei mittleren Fälle sind der Grund für Auflage 6 in DIESER Datei** — sie beweisen, dass
der Scan die **Lehre** der Reparatur trägt („nie falsch-negativ und still"), nicht nur den
Funktionsnamen.

- [ ] **Schritt 1** — Die **sieben** Fälle schreiben, alle rot.
- [ ] **Schritt 2** — Sonden:
      **S-G6a**: ⛔ **namentlich in `src/app/m/radio/_lib/sw-quelle.ts`**
      `navigator.serviceWorker.register("/sw.js")` setzen → `radio bewirbt keine PWA` muss **rot**
      werden. ⛔ **Nicht „eine beliebige radio-Quelldatei"** — das machte die Sonde rennabhängig:
      genau `sw-quelle.ts` ist die Datei, die ein `bereinigt`-basierter Scan **nicht** sähe, und
      eine Sonde, die zufällig eine andere Datei wählt, bliebe grün und verbuchte den Scan als
      korrekt.
      **S-G6b**: ⛔ **die Auflage-6-Probe, neu gefasst.** `ohneKommentare` durch `bereinigt`
      ersetzen → `eine verbotene Zeichenkette INNERHALB eines Literals wird gefunden` muss **rot**
      werden. Bleibt sie grün, misst die Bausteinwahl nichts.
      **S-G6c**: den Glob auf ein nicht existierendes Verzeichnis richten → der Zählfall rot.
      **S-G6d**: ein leeres Verzeichnis `src/app/m/radio/manifest.webmanifest/` anlegen → der
      Existenzfall rot.
      **S-G6e**: ⛔ **die Verzeichnisfalle-Sonde.** Den Endungsfilter **vor** `isDirectory()` ziehen
      → `sw.js/route.ts steht in der gescannten Liste` rot **und** der Zählfall rot. Bleibt der
      Zählfall allein grün, wurde die Zahl am kaputten Lauf gemessen.
- [ ] **Schritt 3** — Die Datei bauen. Kopfkommentar: **fünfter Scan, fünfter Konsument**;
      ⛔ **E-G6a mit ihrer Begründung** (warum `ohneKommentare` und nicht `bereinigt`, und warum das
      Auflage 6 **einhält** statt sie zu brechen — `quelltextScan.ts:55-59` wörtlich);
      die beabsichtigte Falsch-Positiv-Richtung; Bauform 28 mit `bauform.test.ts:174-181`;
      ⬜ V-L9 als bewusst **nicht** hier erledigt (E-G6), und die Abgrenzung
      „`_lib/quelltextScan.ts` ist der Helfer, nicht der fünfte Scan".
- [ ] **Schritt 4** — Tor.

```
rtk git add src/app/m/radio/_lib/keine-pwa.test.ts
rtk git commit -m "test(radio): keine-pwa — der fuenfte Quelltext-Scan erbt die dreiteilige Reparatur"
```

---

## Aufgabe G7: Die Health-Zusage — keine Datei, eine Abwesenheitsprüfung, ein Ablese-Rezept

**Files:** Modify `src/app/m/radio/_lib/keine-pwa.test.ts` (ein Fall), Create
`docs/superpowers/berichte/2026-08-26-radio-betriebsablesungen.md`

⛔ **Es entsteht KEINE Datei `src/app/api/health/radio/route.ts`** (E-G7). Der `[modul]`-Handler
beantwortet `/api/health/radio` bereits — `checkModuleHealth` ist modul-agnostisch
(`src/core/health/index.ts:1-16`), `radio` steht in der Registry (`src/core/registry.ts:197-199`).

⛔ **Es entsteht KEIN radio-spezifischer Fall in `src/core/health/index.test.ts`** (`Spec:5838-5849`).

### Was tatsächlich entsteht

**1. Eine Abwesenheitszusage.** Ein Fall in `keine-pwa.test.ts` (dieselbe Datei, weil sie bereits
Abwesenheiten im Repo prüft und eine zweite Datei für einen Fall Lärm wäre):

| Testname | Aussage |
|---|---|
| `radio bringt keinen eigenen Health-Handler mit` | `existsSync("src/app/api/health/radio")` → `false`. ⛔ Ein zweiter Handler wäre eine zweite Wahrheit über denselben Pfad, und der generische trüge dann `revision`, der zweite nicht |

**2. Ein verfolgtes Ablese-Artefakt** —
`docs/superpowers/berichte/2026-08-26-radio-betriebsablesungen.md`, mit **leeren, benannten
Zeilen**, die Spec 2 füllt. ⛔ **Kein git-ignorierter Bericht** (Gedächtnisnotiz „Beleg nicht in der
Kladde": Abnahme-Messungen gehören in ein verfolgtes Artefakt).

| ⬜ | Was abzulesen ist | Wann | Wie |
|---|---|---|---|
| **G-L5** (= L5) | Welches Feld der Antwort von `/api/health/radio` den **Modulnamen** trägt und welches den **DB-Zugriff** belegt | vor Cut 19 | `curl -s -H "Host: radio.iuk-ue.de" http://127.0.0.1:3000/api/health/radio` am laufenden Container; Rumpf **wörtlich** eintragen |
| **G-L6** (= L11) | Was `curl -si https://radio.iuk-ue.de/manifest.webmanifest` **tatsächlich** liefert | erster Deploy | Rumpf und Statuscode wörtlich eintragen. ⛔ **Nicht raten** |
| **G-L7** (= L12) | Der Ablesepunkt in den DevTools (Application → Service Workers / Cache Storage) und was dort **nach** dem Abräumen steht | §4.7.2 Hälfte 2, echtes Gerät | Screenshot-Beschreibung plus die zwei Listen (registrierte Worker, Cache-Namen) |

**3. Die zwei Runbook-Zusagen, ausgeschrieben** (sie wandern nach Spec 2, stehen aber hier, damit
sie einen Ort haben, der älter ist als das Runbook):

* ⛔ **Der Monitor fragt `https://radio.iuk-ue.de/api/health/radio` ab, nie `/api/health`.**
  `src/app/api/health/route.ts` liefert konstant `{ status: "ok", timestamp }` — kein Modul, kein
  Parameter, keine Datenbank. **200 heißt „das Modul ist im Image", 503 heißt „falsches Image".**
  ⚠️ Beide Routen sind hostunabhängig (`src/core/routing.ts:12`, `PASSTHROUGH`) — `/api/health/radio`
  antwortet auch auf `iuk-ue.de`. **Der Monitor fragt trotzdem den radio-Host**, weil nur das den
  Router mitprüft.
* ⛔ **Health ist grün gegen eine frisch angelegte, leere `radio.db`** (Analyse-Falle 29):
  `openModuleDatabase` legt Verzeichnis und Datei bei Bedarf **neu an** — ein vertipptes `DATA_DIR`
  oder ein nicht gemountetes Volume ergibt „health grün, null Geräte". **Der Gegenzug ist kein
  zweiter Endpunkt, sondern ein Runbook-Schritt:** die Zähl-Abfragen aus Pflicht 4 der Analyse,
  **sechs** Zahlen aus der ersten Abfrage — `devices`, `software_versions`, `api_tokens`, `users`,
  `device_events`, `loans`. ⛔ **Die Freigabe braucht die sechs `COUNT(*)`, nie `status:"ok"`.**
  ⚠️ **NT8 dazu:** `sqlite3 -readonly` scheitert gegen eine frisch importierte `radio.db` (WAL ohne
  `-shm`) — das Runbook braucht die Zählung ohne `-readonly` oder mit mitgegebener `-shm`.

**4. Der Container-Healthcheck bleibt unverändert.** `compose.yaml:141-146` prüft
`http://127.0.0.1:3000/api/health/portal` — das bleibt, weil der Healthcheck über Container-Neustart
und `depends_on` entscheidet, nicht über den Zustand eines einzelnen Moduls. ⛔ **Kehrseite, und sie
gehört ins Runbook:** ein kaputtes `radio.db` lässt den Container „healthy". Genau deshalb ist der
externe Monitor der einzige Melder.

- [ ] **Schritt 1** — Den Abwesenheitsfall in `keine-pwa.test.ts` schreiben, rot.
- [ ] **Schritt 2** — Sonde **S-G7a**: ein leeres Verzeichnis `src/app/api/health/radio/` anlegen →
      der Fall rot.
- [ ] **Schritt 3** — Das Ablese-Artefakt anlegen, mit den drei ⬜-Zeilen **leer** und je einem
      ausgeschriebenen Handgriff. ⛔ **Keine Beispielausgabe eintragen** — eine plausibel aussehende
      Antwortstruktur ist genau die Erfindung, die die eiserne Regel verbietet.
- [ ] **Schritt 4** — Tor.

```
rtk git add src/app/m/radio/_lib/keine-pwa.test.ts docs/superpowers/berichte/2026-08-26-radio-betriebsablesungen.md
rtk git commit -m "docs(radio): die Health-Zusage — kein zweiter Handler, drei benannte Ablesungen"
```

---

## Aufgabe G8: `.env.example` — der radio-Block, die Traefik-Zeile, der Dev/E2E-Unterblock

**Files:** Modify `.env.example`

⚠️ **Gemessener Stand am 26.08.2026** — die Datei ist **nicht leer**, und der Bau ergänzt, statt neu
anzulegen:

| Zeile | Was schon steht |
|---|---|
| `:83-96` | `SUITE_ADMIN_GROUP_RADIO` mit dem ⚠️-Absatz „LEER gesetzt = eine GÜLTIGE Aussage" und dem auskommentierten Vorschlag |
| `:107-114` | `SUITE_UPDATER_GROUP_RADIO`, auskommentiert (⬜ E1b) |
| `:154` | `# SUITE_HOST_RADIO=` im Block „Prod-Domains der Module" — ⛔ **wird NICHT verschoben**, nur mit der echten Domain gefüllt |
| `:410` | der Hinweis, dass Host und Admin-Gruppe **oben** stehen |
| `:425` | `# RADIO_AUSLEIH_SITZUNG_SECRET=<eigener Wert, nicht aus dieser Vorlage>` |
| `:437` | `RADIO_AUSLEIH_SITZUNG_STUNDEN=12` |
| `:441-447` | die drei `RADIO_GATE_*`-Zahlen |
| `:453` | `# RADIO_AUSLEIH_SITZUNG_SECRET=e2e-radio-ausleih-secret-nicht-produktiv-32z` (E2E-Wert) |

### Was ergänzt wird

| # | Was | Wo |
|---|---|---|
| 1 | `RADIO_HISTORIE_MONATE=2` mit Kommentar: Retention der abgeschlossenen Leihen; ⛔ **`0` ist verboten** und bricht den Start ab; Abschalten geht über `RADIO_HISTORIE_PURGE` | im radio-Block, nach den Gate-Zahlen |
| 2 | `RADIO_HISTORIE_PURGE=1` mit dem **Cutover-Absatz**: `0` schaltet den Purge-Timer ganz ab, meldet bei **jedem** Start eine `info`-Zeile, und ⛔ **muss nach dem Verifikationsfenster wieder auf 1** — ein vergessenes `0` ist ein stiller Verlust der Löschrichtlinie | direkt darunter |
| 3 | `RADIO_HISTORIE_ERSTLAUF_MINUTEN=1440` mit Kommentar: Verzögerung des ersten Purge-Laufs; der erste Lauf nach dem Cutover ist ein **Löschereignis** und soll nicht mit dem Deploy zusammenfallen; ⛔ **nie `0`** (Prosa-Regel, **keine** Boot-Prüfung) | direkt darunter |
| 4 | ein ⚠️-Absatz zu `SUITE_ACCESS_GROUP_RADIO`: ⛔ **darf NICHT gesetzt sein**, weder leer noch mit Wert — wäre still wirkungslos (`requiresAuth: false`) und ist ein **Startabbruch** | im radio-Block |
| 5 | die `SUITE_TRAEFIK_RULE`-Erweiterung: `\|\| Host(\`radio.iuk-ue.de\`)`, ⛔ **ohne** `radio-admin.iuk-ue.de` | beim bestehenden `SUITE_TRAEFIK_RULE` |
| 6 | der **Redirect-Block für den Alt-Host** als kommentierte Traefik-Labels: zweiter, eigener Router mit `redirectregex`, ⛔ **302 statt 301**, doppeltes `$$` gegen Interpolation | direkt darunter |
| 7 | der Dev/E2E-Unterblock: `# SUITE_HOST_RADIO=radio.localtest.me` — ⛔ **mit dem Warnabsatz, nicht ohne**: „nur für einen bewussten Dev-Versuch; ⛔ **NICHT in `.env.local` übernehmen**. `next dev` liest `.env.local` im Repo-Wurzelverzeichnis mit; ein gesetzter Wert schaltet im e2e-Lauf **sämtliche** Boot-Prüfungen aus G2 scharf und macht den Lauf von der Vollständigkeit einer Testumgebung abhängig, die er nicht hat (`e2e/helpers/radio.ts:72-77`)." ⚠️ Ohne diesen Absatz trüge der Plan ausgerechnet die Variable als Vorschlag ein, deren **Abwesenheit** T1 als tragende Zusage führt | im bestehenden Dev-Abschnitt |
| 8 | ⛔ **NEU: der Absatz `:449-453` wird fortgeschrieben.** Er sagt heute wörtlich „Diese Zeile **gehört in die lokale `.env.local`**, nicht auf einen Server" — ⛔ **das ist das Gegenteil von Bauform 21 und von T1.** Neue Fassung: der Wert gehört in `webServer.env` (`playwright.config.ts:178-183`); eine Zeile in `.env.local` machte den Lauf ⛔ **nicht rot, sondern rennabhängig grün**. Der Satz „steht in diesem Repository und ist damit öffentlich" bleibt **wörtlich stehen** | beim bestehenden E2E-Absatz `:449-453` |

⛔ **`radio-admin.iuk-ue.de` darf in `SUITE_TRAEFIK_RULE` ausdrücklich NICHT stehen** —
`moduleForHost` lieferte sonst **portal** statt eines Redirects (Analyse-Falle 28,
`docs/radio-portierung-analyse.md:1646-1652`). Der DNS-Eintrag muss bleiben, solange der Redirect
steht. ⚠️ **Kein erprobtes Vorbild im Repo:** `grep -rn redirectregex compose.yaml docs/` bleibt
leer — der Block ist deshalb **kommentiert** und als „vom Betreiber zu prüfen" markiert.

⛔ **Reihenfolge-Pflicht beim Scharfschalten** (§7.4.4): erst der Registry-Eintrag `key: "radio"`
(steht seit Planteil 1), **dann** die `.env`. Umgekehrt bräche `SUITE_HOST_RADIO` den Start der
**ganzen** Suite ab.

⛔ **Rollback ist die LEERE Zeile, nicht die gelöschte.** `SUITE_HOST_RADIO=` ergibt `[]`;
**Entfernen** der Variable ergibt `null` und den Code-Default. Mit `prodHosts: []` heute
wirkungsgleich — „aber nur heute". Der Satz gehört in den Kommentar.

⚠️ **Was NICHT entsteht:** `RADIO_ADMIN_API_TOKEN`, `RADIO_ADMIN_URL`, irgendein `POCKET_ID_*` für
`radio`. `api_tokens` trägt produktiv genau einen Konsumenten (den Alt-Kiosk, Entscheidung 13), der
mit der HTTP-Grenze verschwindet (Entscheidung 15); `/admin` läuft über den **einen**
Suite-Auth.js-Client (Entscheidung 14).
⚠️ **Nicht hier, aber `radio` unmittelbar betreffend:** `TZ=Europe/Berlin` — eigener Suite-Posten,
nicht Teil dieser Spec, aber **Zusage an Spec 2** als Runbook-Voraussetzung, weil `Spec:6355` sie
ausdrücklich führt.
⛔ **Der frühere Beleg ist GESTRICHEN, weil er die Behauptung widerlegt, für die er stand:**
`radio-admin/server/src/routes/export.ts:51` ist die **einzige** Datumsformatierung jener Datei und
**zeitzonenunabhängig** — `new Date(value as number).toISOString().slice(0, 10)` liefert UTC, und
`TZ` ändert daran nichts. ⚠️ **Der Suite-eigene Pfad ist es gemessen ebenfalls:**
`src/app/m/radio/_lib/anzeige.ts:62` (`export const ZONE = "Europe/Berlin"`) und
`src/app/m/radio/_lib/csv/spalten.ts:126` tragen die Zone **im Ausdruck**; `spalten.ts:131` schreibt
aus: „DIE ZONE STEHT IM AUSDRUCK, NICHT IN DER UMGEBUNG. Das Repo setzt `TZ` ausdruecklich [nicht]."
⛔ **Die Zeile bleibt, weil die Spec sie setzt — nicht, weil `radio` gemessen daran hinge.**
Siehe Zusage **17** an Spec 2.

- [ ] **Schritt 1** — Die ACHT Ergänzungen setzen. ⛔ **Nichts verschieben**, was schon steht.
- [ ] **Schritt 2** — Gegenlesen gegen die Verbotstafel: keine `RADIO_ZUGANG_*`-Form, kein
      `_GEHEIMNIS`, kein `RADIO_ADMIN_*`.
- [ ] **Schritt 3** — Tor. ⚠️ `.env.example` hat keinen eigenen Test; das Tor ist typecheck/lint
      plus die Beiseitelege-Gegenprobe, falls ein Test die Datei liest.

```
rtk git add .env.example
rtk git commit -m "docs(radio): .env.example — die drei RADIO_HISTORIE_-Zeilen, Traefik und der Alt-Host-Redirect"
```

---

# BLOCK T — Tests (Spec-Kapitel 8)

⛔ **Was hier entsteht, ist der Nachweis für Zusagen, die bisher nur behauptet sind.** Die Vitest-
und Quelltext-Ebenen aus §8.2/§8.3 sind **bereits gebaut** (Planteil 1–4, geprüft: `_lib/code.test.ts`,
`_lib/zugang.test.ts`, `_lib/host.test.ts`, `_lib/boot.test.ts`, `_db/leihen.test.ts`,
`_lib/bauform.test.ts`, `_actions/guards.test.ts`). Der Leitplan sagt für Planteil 5: „nur die
e2e-Fläche und die Mutationsproben; die Unit-Tests entstehen **mit** ihrem Kapitel."

⛔ **Das Tor jeder Aufgabe in Block T umfasst einen Playwright-Lauf** — die eigene Spec-Datei, und
vor dem Merge einmal die ganze Fläche. ⛔ **Kein `pnpm dev` parallel.** ⛔ **Kein `pnpm build` vor
einem `vitest`-Lauf**, den man ernst nimmt.

---

## Aufgabe T1: `e2e/helpers/radio.ts` — das Sitzungsgeheimnis und die zwei Codes

**Files:** Modify `e2e/helpers/radio.ts`, ⛔ **`src/app/m/radio/_lib/e2eEnv.test.ts`**

### ⛔ DER WÄCHTER, DER T1 SONST DURCH SEIN EIGENES TOR FALLEN LÄSST

Gemessen, `src/app/m/radio/_lib/e2eEnv.test.ts:64-67`, wörtlich:

```
describe("RADIO_ENV — die zwei Gruppenzeilen des E2E-Servers", …)
  it("traegt beide Namen mit ihren Konstanten und keinen dritten", …)
    expect(RADIO_ENV).toEqual({ SUITE_ADMIN_GROUP_RADIO: …, SUITE_UPDATER_GROUP_RADIO: … });
```

⛔ **`toEqual` auf exakt diese Menge.** Ein dritter Schlüssel in `RADIO_ENV` macht diesen Fall
**rot** — und die Datei liegt bewusst unter `src/` (`:29-32`, weil `vitest.config.ts` `e2e/**`
ausschließt), läuft also **in `vitest`**, nicht in Playwright. **T1 fiele damit durch sein eigenes
Tor** („kein neuer Fehlschlag in einer Datei, die der Diff nicht anfasst").

**Verbindlich:**

* Der `toEqual`-Fall wird um den **dritten Schlüssel** ergänzt.
* ⛔ **`describe`-Titel und `it`-Name werden FORTGESCHRIEBEN, nicht gelöscht** — mit dem Grund:
  das Geheimnis ist **keine Gruppenzeile**, deshalb heißt der Block danach sinngemäß
  „die zwei Gruppenzeilen **und das Sitzungsgeheimnis**" und der Fall „…**und keinen vierten**".
* ⛔ **Ein zusätzlicher Fall hält den Wert gegen `.env.example:453` zeichengleich.** Ohne ihn ist
  die Kopplung, die T1 selbst als Kopplung benennt, unbewacht: ein geänderter Vorlagenwert und ein
  stehengebliebener `RADIO_ENV`-Wert wären beide grün.
* ⛔ **`rtk git add` im Commit-Block nimmt die Datei mit.**

⛔ **DIESE AUFGABE STEHT VOR T2/T3/T4, UND DER GRUND IST GEMESSEN.** `RADIO_ENV`
(`e2e/helpers/radio.ts:78-81`) trägt heute genau zwei Zeilen:

```ts
export const RADIO_ENV: Record<string, string> = {
  SUITE_ADMIN_GROUP_RADIO: RADIO_ADMIN_GRUPPE,
  SUITE_UPDATER_GROUP_RADIO: RADIO_UPDATER_GRUPPE,
};
```

**Es fehlt `RADIO_AUSLEIH_SITZUNG_SECRET`.** `src/app/m/radio/_lib/grenzen.ts:212-222` wirft
`GrenzenUngueltig`, sobald `ausleihSitzungGeheimnis()` zur Anfragezeit ohne diese Variable läuft —
und genau das passiert bei der **ersten Einlösung eines Codes am Gate**.
`radio-verwaltung.spec.ts` berührt den Ausleihzweig nicht und hat die Lücke deshalb nie gezeigt;
T2 und T3 träfen sie im ersten Testlauf sofort, mit einer Fehlermeldung, die nach etwas ganz anderem
klingt.

⛔ **Der Wert wird NICHT erfunden.** `.env.example:453` führt bereits einen fertigen E2E-Wert:
`RADIO_AUSLEIH_SITZUNG_SECRET=e2e-radio-ausleih-secret-nicht-produktiv-32z`. **Der wandert 1:1 in
`RADIO_ENV`.**

⛔ **Nur in `webServer.env`, nie in `.env.local`.** Eine dort gesetzte Variable hat Vorrang vor jeder
`.env`-Datei, und `next dev` läuft im Repo-Wurzelverzeichnis und läse eine gitignorierte `.env.local`
sonst mit — der Lauf wäre dann nicht rot, sondern **rennabhängig grün**.
⚠️ **Die Warnung steht ZWEIMAL, nicht dreimal, und beide Male im `aufgaben`-Umfeld:**
`playwright.config.ts:253-254` (im `AUFGABEN_ENV`-Absatz) und `:276` (im
`POCKET_ID_API_KEY`-Absatz). Der `LAGERBUCH_ENV`- und der `RADIO_ENV`-Absatz führen sie **nicht**;
für `radio` steht sie stattdessen in `e2e/helpers/radio.ts:64-70`.
⛔ **Auch das fällt unter Auflage 7 — wer „dreimal" schreibt, zählt vorher.**

⚠️ **`SUITE_HOST_RADIO` steht bewusst NICHT in `RADIO_ENV`** (`:72-76`, gemessene Begründung):
`moduleForHost` trifft `radio.localtest.me` **vor** und **unabhängig** von `prodHostsFor`
(`src/app/m/radio/_lib/host.ts:37-41`). ⛔ **Das bleibt so** — ein gesetzter Wert schaltete im
e2e-Lauf sämtliche Boot-Prüfungen aus G2 scharf und machte den Lauf von der Vollständigkeit einer
Testumgebung abhängig, die er nicht hat.

### Die zwei Codes

⛔ **Die Beispielwerte der Spec (`"111-111"`/`"222-222"`, `Spec:6802-6803`) sind VERALTET** — sie
stammen aus einer sechsstelligen Illustration, die durch die Festlegung auf 28 Zeichen
Crockford-Base32 (§3.2.1) überholt ist. ⛔ **Wer sie übernimmt, lässt einen Test einen Code
einlösen, den es nicht gibt.**

**Der gemessene Bestand** (`src/app/m/radio/_lib/seedLokal.ts:96-97`) — ⛔ **modul-privat, ohne
`export`, und OHNE das `E2E_`-Präfix**:

```ts
const CODE_AKTIV = "A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW";
const CODE_GESPERRT = "7QK2-M4XN-B9HV-3ZTD-5PJW-6RSG-8YFA";
```

**Was T1 in `e2e/helpers/radio.ts` NEU anlegt** — dieselben Werte, andere Namen, eigenes `export`:

```ts
export const E2E_CODE_AKTIV = "A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW";
export const E2E_CODE_GESPERRT = "7QK2-M4XN-B9HV-3ZTD-5PJW-6RSG-8YFA";
```

⛔ **Der zweite Block ist eine ANLAGE, kein Zitat.** Die frühere Fassung überschrieb ihn mit
„gemessen in `seedLokal.ts:96-97`" und zeigte `export const E2E_CODE_*` — diese Namen und dieses
`export` gibt es dort **nicht**. Gemessen sind die **Werte**, zeichengleich; die Seed-Zeilen `:190`
(`aktiv: true`) und `:192-193` (`aktiv: false, gesperrtAm, gesperrtVon`) tragen die Zusage von P11.
⛔ **Genau weil `seedLokal.ts` sie nicht exportiert, ist die unten verlangte Kopplungsnotiz nötig.**

Beide sind über `pnpm exec tsx scripts/seed-lokal.ts radio` (`playwright.config.ts:158`) im Lauf
vorhanden.

⚠️ **Die zwei Literale sind eine Kopplung, und sie bekommt einen Kommentar:** ändert jemand
`seedLokal.ts`, sind diese Zeilen die zweite Stelle. ⛔ **Kein Import aus `src/`** — e2e-Helfer und
Modulcode laufen in verschiedenen Prozessen mit verschiedenen `DATA_DIR`-Sichten, und ein Import
zöge das ganze Modul in den Testprozess. Die Kopplung wird **benannt**, nicht wegimportiert.

- [ ] **Schritt 1** — `RADIO_AUSLEIH_SITZUNG_SECRET` in `RADIO_ENV` ergänzen, mit dem Kommentar aus
      der Warnung oben (`grenzen.ts:212-222`, `.env.example:453`).
- [ ] **Schritt 2** — `E2E_CODE_AKTIV` und `E2E_CODE_GESPERRT` ergänzen, mit dem
      Kopplungskommentar und dem Verweis auf `seedLokal.ts:96-97`. ⛔ **Beide Werte zeichengleich
      abschreiben, nicht neu würfeln.**
- [ ] **Schritt 3** — ⛔ **`src/app/m/radio/_lib/e2eEnv.test.ts` fortschreiben** (siehe oben): der
      `toEqual`-Fall bekommt den dritten Schlüssel, `describe`-Titel und `it`-Name werden
      fortgeschrieben, und ein neuer Fall hält den Wert gegen `.env.example:453` zeichengleich.
      Dann `rtk pnpm vitest run src/app/m/radio/_lib/e2eEnv.test.ts`.
- [ ] **Schritt 4** — Kurzprobe: `rtk pnpm exec playwright test e2e/radio-verwaltung.spec.ts` muss
      **unverändert grün** bleiben (17 Fälle). ⛔ Wird er rot, hat die neue Env-Zeile etwas
      verschoben, und das ist ein Befund, kein Rauschen.
- [ ] **Schritt 5** — Tor.

```
rtk git add e2e/helpers/radio.ts src/app/m/radio/_lib/e2eEnv.test.ts
rtk git commit -m "test(radio): der e2e-Helfer traegt das Sitzungsgeheimnis und die zwei Seed-Codes"
```

---

## Aufgabe T2: `e2e/radio-kiosk.spec.ts` — der Rundgang durch den anonymen Ausleihzweig

**Files:** Create `e2e/radio-kiosk.spec.ts`

**Was er beweist** (Fall 1 der Zusagentafel): dass der **anonyme Ausleihzweig bei einem echten Abruf
funktioniert** — Code einlösen, Geräteliste, ausleihen, zurückgeben, **ohne** auf einen Login-Riegel
zu laufen. §8.2.4 hält als Bauform-Zusicherung fest: „der Riegel steht NICHT auf dem anonymen
Ausleih-Ast" — dass der Ast **tatsächlich** trägt, ist bis heute **kein** e2e-Fall.

⛔ **Und er trägt den Rundgang aus §8.4.2 für die vier Kiosk-Seiten mit** (E-G9). Gemessen mit
`rtk find "page.tsx" src/app/m/radio` sind es genau vier außerhalb von `admin/`: `page.tsx` (das
Gate), `(ausleihe)/geraete`, `(ausleihe)/ausleihen`, `(ausleihe)/rueckgabe`. ⛔ **Bedingung: jede
Station trägt ihre EIGENE Statusprüfung**, statt nur auf einen Folgezustand zu warten. Ohne diese
Bedingung wäre die Aussage „der Rundgang ist mitgetragen" falsch, und eine separate
`radio-tabellen.spec.ts` wäre doch nötig.

### Die Zusagen des Falls, einzeln

| # | Zusage | Warum sie einzeln steht |
|---|---|---|
| 1 | `t/<E2E_CODE_AKTIV>` antwortet mit **303** aufs Ziel | `Spec:6817`; ⬜ **T-L2** — der Code wird als **Messwert** notiert, nicht behauptet. ⛔ **Nur mit `maxRedirects: 0`**, siehe die Auflage darunter |
| 2 | dieselbe Antwort trägt `Set-Cookie` der Ausleih-Sitzung ⛔ **ohne `Domain=`** | §8.7 Nr. 2; ein `Domain=`-Attribut streute die Kiosk-Sitzung über alle Suite-Hosts. ⛔ **Nur mit `maxRedirects: 0`** |

⛔ **AUFLAGE ZU DEN ZUSAGEN 1 UND 2 — ohne sie messen beide etwas anderes, als ihr Name sagt.**
Playwrights `page.request.get` **folgt Umleitungen standardmäßig**. Der Fall sähe dann den Status
der **Endseite** (200) und **deren** Kopfzeilen — nie die **303** und nie ihr `Set-Cookie`.
⛔ **Pflicht: `page.request.get(radioUrl("/m/radio/t/<code>"), { maxRedirects: 0 })`**
(Bauform 27). **Das Haus schreibt den Griff aus, und es ist das direkte Vorbild für genau diese zwei
Zusagen:** `e2e/lagerbuch-helfer.spec.ts:187` („`page.request` **MIT** `maxRedirects: 0`,
**NICHT** `page.on(\"response\")\"`") und der Fall `:194-201`, der dort wörtlich
„antwortet 303 mit relativem Location und setzt das Cookie ohne Domain" heißt.
Ebenso `e2e/radio-verwaltung.spec.ts:1137`, `:1148`. ⚠️ `grep -rn maxRedirects e2e/` liefert acht
Treffer — der Plan nannte den Griff bisher an **keiner** Stelle.
| 3 | jede der vier Stationen antwortet mit ihrem eigenen, geprüften Status | §8.4.2 |
| 4 | die Ausleihe erscheint in der Liste **aktiver** Leihen | der Schreibweg wirkt |
| 5 | `returned_at` wird bei der Rückgabe gesetzt | gelesen **direkt aus der DB**, nicht aus der Oberfläche |
| 6 | die Sitzungsdauer wird ⛔ **relativ zum konfigurierten Wert** geprüft, nie gegen die Zahl `12` | §8.2.2, wörtlich: „die Grenze relativ zum konfigurierten Wert, nie die Zahl 12" |

### Die vier Fallen, die diesen Fall sonst falsch grün oder falsch rot machen

1. ⛔ **Falle 10, beide Hälften.** Ein POST auf einen Route Handler kann während dessen
   **Erstkompilierung** abgebrochen werden (`net::ERR_ABORTED`, `canceled: true`, **nie** eine
   Antwort) — und das Symptombild führt in die Irre: keine Datenbankzeile, keine Protokollzeile, ein
   Testlauf ins Zeitbudget mit einer Meldung, die nach etwas anderem klingt.
   **Abhilfe, beide Teile Pflicht:** (a) ein **Warmlauf-GET** auf dieselbe Route **vor** dem ersten
   echten POST — für die Gate-Route, die Ausleih-Action und die Rückgabe-Action; (b) ⛔ **jeder POST
   wird mit `page.waitForResponse` auf seine Antwort geprüft**, statt nur auf eine spätere
   Zustandsänderung zu warten. Vorbild: `e2e/files-fileshare.spec.ts`.
2. ⛔ **Falle 12.** Ein `.click()` auf einen echten Anker navigiert nicht, wenn die Hülle zwischen
   `mousedown` und `mouseup` umbricht. **Abhilfe: `klickeWennRuhig` aus `e2e/fixtures.ts`.**
   ⚠️ Der Ausleihzweig läuft anonym und ohne `SessionProvider`-Nachladung — die Falle ist dort
   **schwächer** als in `/admin`, aber die Navigation nach dem Einlösen geht über eine Hülle, die
   sich aufbaut. ⛔ **Im Zweifel `klickeWennRuhig`** — er kostet nichts, wenn nichts umbricht.
3. ⛔ **Der DB-Pfad kommt NICHT aus `moduleDbPath()`.** `DATA_DIR=./.data/e2e` steht nur in
   `playwright.config.ts`s `webServer.env` und erreicht ausschließlich den **Server**prozess. Im
   Testprozess ist die Variable nicht gesetzt; `moduleDbPath` liefe auf `./.data/radio.db` und läse
   **eine andere Datei** als die, in die der Server schreibt. Vorbild und Wortlaut:
   `e2e/lagerbuch-hosts.spec.ts:55` (Vorbehalt) und `:68-69` (die `existsSync`-Meldung) — der Pfad steht als Konstante `"./.data/e2e/radio.db"`,
   mit einer `existsSync`-Zusicherung und der Fehlermeldung „läuft der e2e-Server mit
   `DATA_DIR=./.data/e2e`?".
4. ⛔ **Die Zusicherungen auf DB-Werte sind DIFFERENZIELL, nicht absolut.** Ein Vergleich gegen
   `NULL` hängt am Seed-Zustand statt am Test selbst — unter `--repeat-each` oder `retries` läuft
   derselbe Fall ein zweites Mal auf einem veränderten Bestand. Die Frage lautet immer: **„in welchem
   falschen Zustand wäre das auch grün?"** (`e2e/lagerbuch-hosts.spec.ts:209`).

⚠️ **`E2E_CODE_AKTIV` wird von diesem Fall WIRKLICH eingelöst.** `zugangscodes.last_used_at`
(`_db/schema.ts:192`) trägt danach für den Rest des Laufs einen gesetzten Wert. ⛔ **Das wird im
Kopfkommentar vermerkt**, damit ein späterer Fall, der `last_used_at IS NULL` als Vorbedingung
braucht, diesen Code nicht mehr verwendet. ⚠️ **Und T4 hängt daran** — siehe dort.

- [ ] **Schritt 1** — Den Fall schreiben, mit allen sechs Zusagen einzeln benannt und je einer
      eigenen `expect`-Meldung. ⛔ **Kein Literal für Host, Port, Gruppe oder Code** — alles aus
      `e2e/helpers/radio.ts`.
- [ ] **Schritt 2** — Sonden:
      **S-T2a**: den Warmlauf-GET entfernen und den Lauf dreimal fahren → ⚠️ **erwartete Wirkung ist
      Flackern, nicht sicheres Rot.** ⛔ **Deshalb ist diese Sonde eine Beobachtung, keine Zusage** —
      sie wird gefahren und ihr Ergebnis notiert, aber kein Testfall hängt an ihr.
      **S-T2b**: die `Set-Cookie`-Zusage auf „enthält den Cookie-Namen" abschwächen und ein
      `Domain=.localtest.me` in die Antwort einbauen → die ursprüngliche Fassung muss **rot**
      werden, die abgeschwächte bleibt grün. Das ist die Probe, dass Zusage 2 etwas misst.
      **S-T2c**: die Statusprüfung einer Station durch ein reines `waitForURL` ersetzen → der
      Rundgang-Anspruch fällt; ⛔ **die Sonde bleibt in der Datei als Kommentar**, weil sie erklärt,
      warum `radio-tabellen.spec.ts` nicht existiert (E-G9).
- [ ] **Schritt 3** — Kopfkommentar: E-G9 (warum es keine `radio-tabellen.spec.ts` gibt), die vier
      Fallen mit `datei:zeile`, der `last_used_at`-Vermerk, ⬜ T-L2.
- [ ] **Schritt 4** — Tor, plus `rtk pnpm exec playwright test e2e/radio-kiosk.spec.ts`.

```
rtk git add e2e/radio-kiosk.spec.ts
rtk git commit -m "test(radio): der Kiosk-Rundgang — der anonyme Ausleihzweig traegt bei echtem Abruf"
```

---

## Aufgabe T3: `e2e/radio-zugang.spec.ts` — vier Fälle über die zwei Wege herein und die Sperre

**Files:** Create `e2e/radio-zugang.spec.ts`

**Vier Fälle (2–5 der Zusagentafel):**

| Fall | Name | Was er beweist |
|---|---|---|
| 2 | `Zugang ueber die Suite-Kachel, ohne Code` | angemeldet, Zugriff aus der Kachel: die Ausleihe ist erreichbar **und in der Sache anonym** — ⛔ **die Journalzeile trägt den eingetippten Ausleihernamen, nicht die Kennung des Angemeldeten** (Entscheidung 7). Geprüft **in der Datenbank**, nicht auf dem Bildschirm |
| 3 | `gesperrter Code am Gate` | benannte **deutsche Meldung am Feld**, nicht die stumme Landung des Bestands, ⛔ **kein** Server-Exception — der Riegel im **Lesepfad** bei echtem Abruf |
| 4 | `Code sperren waehrend laufender Sitzung, dann neu laden` | Umleitung ⛔ **über den Abmelde-Route-Handler** mit benanntem Grund; dessen Antwort trägt `Set-Cookie` mit `Max-Age=0` ⛔ **ohne `Domain=`**; ein zweiter Aufruf landet danach **ohne Umweg** am Gate |
| 5 | `gesperrter Code an einer schreibenden Action` | deutsche Meldung am Formular, ⛔ **kein Absturz**, eingetragene Felder bleiben stehen — der Riegel im **Schreibpfad** bei echtem Abruf |

⛔ **Fall 4 wird über das ANTWORTPROTOKOLL geprüft, nicht über die Endadresse.** Eine Endadresse
allein unterscheidet „über den Abmelde-Handler umgeleitet" nicht von „direkt am Gate gelandet" —
und genau der Unterschied ist die Zusage (§8.7 Nr. 2).

⛔ **Und die Form ist die gemessene des Hauses, nicht die naheliegende: die Kette wird HOP FÜR HOP
mit `page.request.get(url, { maxRedirects: 0 })` gefahren** (Bauform 27), Vorbild
`e2e/lagerbuch-helfer.spec.ts:285` („DIE KETTE WIRD HOP FUER HOP GEPRUEFT (`maxRedirects: 0` an
jeder Stufe)"), `:302`, `:308`. ⚠️ **`page.on("response", …)` ist die vom Haus ausdrücklich
VERWORFENE Form** — `lagerbuch-helfer.spec.ts:187` wörtlich: „`page.request` MIT `maxRedirects: 0`,
**NICHT** `page.on(\"response\")`". Die frühere Planfassung schlug sie als erste vor.
⛔ **Das gilt insbesondere für die `Set-Cookie`-Zusage mit `Max-Age=0`:** sie steht auf der Antwort
des **Abmelde-Handlers**, nicht auf der des Gates — ohne `maxRedirects: 0` sieht der Fall sie nie.
`page.on("response")` bleibt nur für eine Kette zulässig, die sich **nicht** zerlegen lässt, und das
ist hier nicht der Fall.

⛔ **Die Namen sind die aus `_lib/ausleihZugang.ts`** (B7): `ausleihZugangOderNull`,
`requireAusleihZugang`, `requireAusleihSchreibend`. ⛔ **Nicht `requireRadioZugang`** (Kapitel 4/6)
und **nicht `kioskZugangOderNull`** (Kapitel 8s eigener erster Entwurf).

⚠️ **Fall 2 berührt Spec §3.5, den zweiten Weg herein.** Er ist der einzige Fall dieses Planteils,
der eine **Suite-Sitzung** in den Ausleihzweig trägt — ⛔ **und die Zusage ist die Anonymität in der
Sache**, nicht ein Statuscode. Wer nur `200` prüft, hat den Fall nicht gebaut.

⚠️ **`E2E_CODE_GESPERRT` muss im Seed tatsächlich `aktiv = false` tragen.**
`_db/schema.ts:181` führt `aktiv` mit `.default(true)`, und `:178-180` warnt: „Ein Import oder ein
Seed, der alles als aktiv anlegt, reaktiviert still jeden gesperrten Code." ⛔ **Der erste Schritt
dieser Aufgabe ist deshalb eine Messung**, nicht eine Annahme: die Seed-Zeile für
`E2E_CODE_GESPERRT` in `./.data/e2e/radio.db` lesen und `aktiv` zusichern — **im Test selbst**, als
Vorbedingungs-`expect` mit eigener Meldung. Läuft der Fall gegen einen aktiven Code, ist er grün aus
dem falschen Grund und beweist nichts.

⚠️ **Fall 4 verändert den Bestand:** er sperrt einen Code **während** des Laufs. ⛔ **Er darf dafür
nicht `E2E_CODE_AKTIV` verwenden** — T2 braucht ihn einlösbar, und `workers: 1` heißt eine
gemeinsame Datei, nicht eine gemeinsame Reihenfolgezusage. ⬜ **Der Fall legt sich seinen eigenen
Code an** (über die Verwaltungsfläche oder direkt in der DB) und räumt ihn nicht auf — das ist
folgenlos, weil `zugangscodes` nie gelöscht wird (§3.2.4), und wird im Kommentar vermerkt.

- [ ] **Schritt 1** — Die vier Fälle schreiben, alle rot. ⛔ **Jeder mit seiner Vorbedingungs-Messung**
      (Code aktiv/gesperrt) als eigenem `expect`.
- [ ] **Schritt 2** — Sonden:
      **S-T3a**: in `_lib/ausleihZugang.ts` die `!zeile.aktiv`-Hälfte des DB-Rechecks entfernen →
      **Fall 3 rot**. ⛔ Das ist die e2e-Entsprechung der Mutationsprobe 2 und der Beweis, dass der
      **echte Server** denselben Riegel zieht wie die reine Funktion.
      **S-T3b**: den Schreibpfad-Riegel entfernen → **Fall 5 rot**.
      **S-T3c**: in Fall 2 die Journalzeile auf die Kennung des Angemeldeten umstellen → **Fall 2
      rot**. Bleibt er grün, prüft er nur einen Statuscode.
      **S-T3d**: den Abmelde-Handler überspringen und direkt aufs Gate umleiten → **Fall 4 rot**.
      Bleibt er grün, prüft er die Endadresse statt des Wegs.
- [ ] **Schritt 3** — Kopfkommentar: B7 (die drei richtigen Namen), die Anonymitätszusage aus
      Entscheidung 7, die `aktiv`-Vorbedingung mit `_db/schema.ts:178-181`.
- [ ] **Schritt 4** — Tor, plus `rtk pnpm exec playwright test e2e/radio-zugang.spec.ts`.

```
rtk git add e2e/radio-zugang.spec.ts
rtk git commit -m "test(radio): der Zugang bei echtem Abruf — beide Wege herein, beide Riegelformen der Sperre"
```

---

## Aufgabe T4: `e2e/radio-hosts.spec.ts` — die Host-Schleife, die Datenwirkung, der Worker, die Health

**Files:** Create `e2e/radio-hosts.spec.ts`

⛔ **EINE SCHLEIFE, KEINE ZWEI STICHPROBEN** (§8.4.3, wörtlich zur Begründung): **Route Handler
haben kein Layout**, und die Sperre erreicht sie über kein Group-Layout. Heute ist genau **ein**
Pfad geprüft (`/m/radio/admin`, `radio-verwaltung.spec.ts` Fall 8). Die übrigen fehlen.

⛔ **Der Grund, warum diese Datei überhaupt existieren muss** — Falle 61 in radio-Form:
`decideRoute` gatet interne `/m/<key>`-Pfade **nach dem Modul aus dem Segment, nicht nach dem
Host** (`src/core/routing.ts`), und `canAccess` steigt für ein Modul mit `requiresAuth: false`
**sofort mit `true`** aus (`src/core/registry.ts:260-269`, die frühe Rückkehr `:265`). `radio` trägt `requiresAuth: false`
(Entscheidung 4). **Folge: jeder Suite-Host, der auf den Container terminiert, beantwortet
`/m/radio/*`, wenn das Modul seinen eigenen Riegel nicht trägt** (Spec:6584-6588).
⛔ **Kein Gate sieht das:** `core/routing.test.ts` prüft **ausdrücklich**, dass interne Pfade nach
dem Segment gegatet werden — das Verhalten ist nicht bloß ungetestet, es ist **festgeschrieben**.

### Die Bauform — übernommen aus `e2e/lagerbuch-hosts.spec.ts`, nicht neu erfunden

Drei Zusicherungen **je Eintrag, in derselben Schleife**:

1. `page.request.get(fremdUrl(pfad))` → **404**;
2. ⛔ **kein Umweg**: `new URL(fremd.url()).pathname` ist **derselbe** Pfad. Ohne diese Zeile bewiese
   ein `/abmelden`-Eintrag etwas anderes: er antwortet auch **ohne** Host-Riegel mit einem relativen
   303, und die Folgeanfrage träfe auf dem fremden Host **zufällig** ebenfalls einen 404. Gemessen
   im Vorbild: bei probehalber deaktivierter Riegelfunktion blieb **genau dieser Fall** grün,
   während alle anderen korrekt rot wurden (`e2e/lagerbuch-hosts.spec.ts:155-167`, der Satz „blieb GENAU dieser Fall gruen" bei `:159`, die Umweg-Zusicherung bei `:167`);
3. ⛔ **die Gegenrichtung, je Eintrag**: `page.request.get(radioUrl(pfad))` → **nicht** 404. Ohne sie
   bewiese der 404 oben nur, dass **irgendetwas** 404 gibt — ein falsch geschriebener Pfad, eine
   umbenannte Route, ein Modul, das gar nicht aufgelöst wird.

⛔ **`page.request`, nicht `page.goto`, für BEIDE Seiten.** `page.request` trägt denselben
Cookie-Kontext, liefert den Statuscode direkt und löst bei einem nicht-HTML-`Content-Type` — hier
`text/javascript` für `/sw.js` und `application/json` für die Health — **kein** `net::ERR_ABORTED`
aus.

⛔ **Angemeldet MIT der radio-Admin-Gruppe.** Sonst wäre der 404 der **Gruppen**riegel und nicht der
**Host**riegel, und der Test bewiese das Falsche. `AUTH_COOKIE_DOMAIN=".localtest.me"`
(`playwright.config.ts:181`) trägt die Sitzung von `RADIO_HOST` auf `FREMDER_HOST` mit — genau das
ist die Voraussetzung dafür, dass der 404 dort wirklich der Host-Riegel ist.
⛔ **`groups: RADIO_ADMIN_GRUPPE`, und `groups: ""` nirgends hier** — die leere Stufe hat ihren
eigenen Fall in `radio-verwaltung.spec.ts` („V-L3 B"), ⛔ **nicht duplizieren.**

⚠️ **`FREMDER_HOST` ist `feedback.localtest.me`** (`e2e/helpers/radio.ts`) — die **schärfere** Probe,
weil `moduleForHost` dort tatsächlich ein Modul liefert: der 404 kommt nachweislich aus dem
radio-Host-Riegel, nicht aus einem unaufgelösten Host.

### `EINSTIEGE` — fünf, und die Zahl ist die Zusage (E-G8)

```ts
const EINSTIEGE = [
  "/m/radio",
  "/m/radio/abmelden",
  "/m/radio/admin",
  "/m/radio/admin/geraete/export",
  "/m/radio/sw.js",
];
```

⛔ **`expect(EINSTIEGE).toHaveLength(5)` als eigener Fall.** Eine gestrichene Zeile schrumpfte den
Lauf sonst **still**, und „vier von fünf gesperrt" sähe in der Ausgabe genauso grün aus wie fünf.
⚠️ **Die Länge deckt keinen Tippfehler in einem Pfad** — das tut die Eigen-Host-Hälfte: ein
verschriebener Pfad wäre dort ebenfalls 404 und ließe **genau diesen Eintrag** fehlschlagen.

⛔ **`/m/radio/t/[code]` steht NICHT in der Liste** — er hat seinen eigenen Fall unten (E-G8, Grund
1: der Eigen-Host-Arm der Schleife würde den Code wirklich einlösen und die Vorbedingung des
Datenwirkungs-Falls zerstören).
⛔ **`/m/radio/admin/import/hochladen` steht NICHT in der Liste** — gemessen exportiert die Datei nur
`POST` (`route.ts:81`); Next beantwortet ein `GET` mit 405, **bevor** der Handler läuft, und der
Host-Riegel käme nie zum Zug. ⚠️ **Diese Lücke steht im Kopfkommentar der Datei**, statt
verschwiegen zu werden.
⛔ **Kein `manifest.webmanifest`- oder Icon-Eintrag** — `radio` baut keine PWA; die Abwesenheit
beweist **G6** im Repo, nicht ein immer grüner `curl`.

### Der Fall mit der Datenwirkung

Nach dem Vorbild `e2e/lagerbuch-hosts.spec.ts:181-250`, gegen die Spalte
`zugangscodes.last_used_at` (gemessen, `_db/schema.ts:192`, SQL-Name `last_used_at`; die Tabelle
heißt `zugangscodes`, `:160`):

1. `vorFremd` lesen, `aktiv` als Vorbedingung zusichern;
2. `page.goto(fremdUrl("/m/radio/t/<code>"))` → **404**;
3. `nachFremd.last_used_at` ⛔ **differenziell gleich `vorFremd.last_used_at`** — nicht gleich `NULL`.
   ⛔ **Der Riegel muss VOR jeder Wirkung greifen**;
4. ⛔ **die stärkere Hälfte**: derselbe Code auf dem **eigenen** Host → **nicht** 404, und
   `last_used_at` danach **verschieden** von `vorFremd`. Ohne sie wäre der 404 oben aus dem
   **falschen** Grund nicht vom 404 aus dem **richtigen** zu unterscheiden: eine gelöschte Route,
   ein abgelehntes Codeformat oder ein toter Seed lieferten ebenfalls 404 mit unverändertem
   `last_used_at`.

⚠️ **Welcher Code?** ⛔ **Nicht `E2E_CODE_AKTIV`, wenn T2 ihn im selben Lauf einlöst und der Test
`last_used_at IS NULL` bräuchte** — er braucht es **nicht** (die Zusicherung ist differenziell,
genau deswegen). ⛔ **Aber die Wahl wird begründet und im Kommentar festgehalten**, nicht
stillschweigend getroffen. Vorgabe: `E2E_CODE_AKTIV`, weil er einlösbar sein **muss** und
`E2E_CODE_GESPERRT` in Schritt 4 kein `last_used_at` schriebe.

### Die zwei Fälle über die neuen Flächen

| Testname | Aussage |
|---|---|
| `/sw.js liefert den Abraeum-Worker, und er hat keinen fetch-Handler` | ⛔ **auf BEIDEN Pfaden**: `radioUrl("/m/radio/sw.js")` **und** `radioUrl("/sw.js")` → je 200, `content-type` beginnt mit `text/javascript`, `cache-control: no-cache`; Rumpf enthält `registration.unregister` und `caches.keys` und enthält ⛔ **nicht** `addEventListener("fetch"`. ⛔ **Der EXTERNE Pfad ist der tragende:** `/m/radio/sw.js` läuft in `decideRoute` über den internen `/m/<key>`-Zweig (`src/core/routing.ts:68-77`) und berührt die **Host-Rewrite-Strecke nie** — die Runbook-Zeile aus §4.7.2 Hälfte 1 lautet aber `curl "$B/sw.js"`. Erst mit `radioUrl("/sw.js")` ist „die Hälfte-1-Messung im Lauf" wahr, und erst dann ist der **erste stille Fall aus §7.4.4** (der Rewrite greift nicht) im Lauf gedeckt statt nur im Unit-Test (`_lib/routen.test.ts:122-133`) |
| `/api/health/radio nennt Modul und Revision` | auf `radioUrl("/api/health/radio")`: 200, Rumpf trägt `module` mit dem Wert `radio` und ein `revision`-Feld. ⛔ **Der Wert von `revision` wird NICHT zugesichert** — er ist der Commit-SHA und ändert sich; zugesichert wird die **Anwesenheit** des Feldes, weil sie die Zusage aus Spec 2 V3 ist. ⚠️ **`revision` kommt gemessen NICHT aus `checkModuleHealth`** (das liefert `{status, module, error?}`, `src/core/health/index.ts:4-15`), sondern aus dem Handler (`src/app/api/health/[modul]/route.ts:23-26`) |
| `der Abmelde-Handler auf fremdem Host laesst das Sitzungs-Cookie stehen` | ⛔ **Fall 13 — die zweite Hälfte von `Spec:6916`**, die bisher fehlte: „der Abmelde-Route-Handler \| 404, **und das Cookie der laufenden Sitzung ist danach unverändert vorhanden**." Der Fall prägt seine Sitzung **selbst** (`radioUrl("/m/radio/t/<E2E_CODE_AKTIV>")` mit ⛔ `maxRedirects: 0`, Bauform 27 — ein Cookie aus einem anderen `test()` überlebt nicht, jeder Block bekommt einen frischen Kontext), liest das Ausleih-Sitzungs-Cookie, ruft `fremdUrl("/m/radio/abmelden")` mit `maxRedirects: 0` → **404**, und sichert das Cookie danach ⛔ **differenziell unverändert** zu — **derselbe Wert**, nicht nur „vorhanden" |

⚠️ **Die Health-Route ist hostunabhängig** (`PASSTHROUGH`) — sie antwortet auch auf
`FREMDER_HOST`. ⛔ **Sie steht deshalb NICHT in der Schleife**, sondern als eigener Fall; ein
404-Anspruch auf dem fremden Host wäre falsch und der Fall rot aus dem richtigen Grund für die
falsche Zusage.

⚠️ **Reihenfolge gegenüber T2, und sie steht hier, statt vorausgesetzt zu werden:** T2 löst
`E2E_CODE_AKTIV` wirklich ein, T4 braucht ihn danach **erneut einlösbar**. Das trägt, weil **alle**
Zusagen von T4 auf `last_used_at` differenziell sind (nie gegen `NULL`) und `zugangscodes` nie
gelöscht wird (§3.2.4). ⛔ **`workers: 1` ist KEINE Reihenfolgezusage** — es heißt nur „eine
gemeinsame Datei". Der Plan sagt das für T3 Fall 4 bereits; hier fehlte der Satz.

- [ ] **Schritt 1** — Die Schleife, den Längenfall, den Datenwirkungs-Fall und die **drei**
      Flächen-Fälle (`/sw.js`, Health, Cookie) schreiben, alle rot. ⛔ **Zehn laufende Testfälle
      aus sechs `test(`-Quellen** — die Schleife erzeugt einen Block je Einstieg.
- [ ] **Schritt 2** — Sonden:
      **S-T4a**: `hostAbweisung` in `sw.js/route.ts` durch einen unbedingten `Response`-Bau ersetzen
      → der `/m/radio/sw.js`-Eintrag der Schleife rot. ⛔ **Die Wirkprobe der vierten Riegelform.**
      **S-T4b**: den Host-Abgleich in `t/[code]/route.ts` weglassen → der Datenwirkungs-Fall rot,
      **beide** Hälften.
      **S-T4c**: einen Eintrag aus `EINSTIEGE` streichen → der Längenfall rot.
      **S-T4d**: die Umweg-Zusicherung entfernen und `abmelden`s Riegel deaktivieren → ⚠️ die
      Schleife bliebe für **diesen** Eintrag grün. ⛔ **Genau das ist der Grund für Zusicherung 2**,
      und die Sonde belegt es.
      **S-T4e**: die Eigen-Host-Gegenprobe entfernen und einen Pfad verschreiben → die Schleife
      bliebe grün. ⛔ **Der Grund für Zusicherung 3.**
      **S-T4f**: ⛔ **die Fall-13-Sonde, EINE Mutation.** In `abmelden/route.ts` den Host-Riegel
      **hinter** das Löschen des Sitzungs-Cookies ziehen → `der Abmelde-Handler auf fremdem Host
      laesst das Sitzungs-Cookie stehen` muss **rot** werden, während der Schleifeneintrag
      `/m/radio/abmelden` **grün bleibt** (er antwortet weiterhin 404). ⛔ **Genau dieses Paar
      zeigt, warum die zweite Hälfte von `Spec:6916` eine eigene Zusage ist** — der 404 allein
      unterscheidet „der Riegel greift vor jeder Wirkung" nicht von „der Riegel greift danach".
      **S-T4g**: ⛔ **die Rewrite-Sonde für Fall 10.** In `src/core/registry.ts:251-258` die
      `localtest.me`-Zeile **hinter** den `prodHostsFor`-Vergleich ziehen → die Hälfte
      `radioUrl("/sw.js")` muss **rot** werden (Portal-Inhalt statt Worker), während
      `radioUrl("/m/radio/sw.js")` **grün bleibt**. ⛔ **Das ist der Nachweis, dass die zwei
      Hälften verschiedene Strecken messen** — die interne Segment-Auflösung und die
      Host-Rewrite-Strecke.
- [ ] **Schritt 3** — Kopfkommentar: Falle 61 in radio-Form mit `datei:zeile`, E-G8 (warum fünf und
      nicht die fünf aus §8.4.3), ⛔ **E-G9a (warum es keine `e2e/radio-sw.spec.ts` gibt, mit dem
      Spec-Anker `:5765-5766` und der Zusage „genau ein Fall, der die Antwort prüft")**, die zwei
      ausgeschlossenen Pfade **mit** ihren Gründen, die `FREMDER_HOST`-Begründung, der
      DB-Pfad-Vorbehalt, und ⛔ **der Satz, dass die Klammerzusätze der `EINSTIEGE`-Tafel
      Erwartungen und keine `toBe`-Zusicherungen sind**.
- [ ] **Schritt 4** — Tor, plus `rtk pnpm exec playwright test e2e/radio-hosts.spec.ts`.

```
rtk git add e2e/radio-hosts.spec.ts
rtk git commit -m "test(radio): die Host-Schleife — fuenf Einstiege, die Datenwirkung, der Worker, die Health"
```

---

## Aufgabe T5: `e2e/radio-verwaltung.spec.ts` — vier Ergänzungen, darunter ⬜ V-L14

**Files:** Modify `e2e/radio-verwaltung.spec.ts`

⛔ **Ergänzen, nicht umbauen.** Die Datei trägt **17** Testfälle aus Planteil 4 (gemessen, Zeile für
Zeile gezählt — ⛔ **nicht** per `grep -c "test("`, der zählt `test.describe(` und Kommentartreffer
mit). Darunter die vier Dauerfälle „V-L3 A" bis „V-L3 D" und Fall 8 gegen `FREMDER_HOST`. ⛔ **NS-V10:
nicht zurückbauen, nicht auf `portal.localtest.me` umstellen.**

### Die gemessene Lücke, die Fälle 7 und 8 schließen

`Spec:6874` nennt drei „sichere" Flächen für die Zellen-Zusage. Gemessen:

| Fläche | Bestehender Fall | Was tatsächlich geprüft wird | Trägt §8.4.2.1? |
|---|---|---|---|
| Software-Versionen | Fall 8 | Inhalt einer **Datenzeile** aus einer `render`-Funktion, gefiltert per `hasText` | ✅ **ja** |
| Geräteliste | Fall 2 | nur `table thead th` (Kopfzeile, statisches JSX), Zeilenanzahl, Filter-in-URL | ⛔ **nein — Lücke** |
| Ausleihenliste | Fall 5 | nur `table thead th`, Insel-Anwesenheit, Filter-in-URL | ⛔ **nein — Lücke** |

⚠️ **Ereignisse (Fall 4) und Zugänge (Fall 9) haben dieselbe Lücke, sind aber NICHT in
`Spec:6874`s Zusageliste** — für sie ist keine Zelle versprochen. ⛔ **Dieser Plan verspricht sie
auch nicht.** Wer sie nachträgt, trägt sie nach; wer daraus eine Vollzähligkeitsbehauptung macht,
nicht.

### Die vier Ergänzungen

| # | Testname | Aussage |
|---|---|---|
| 7 | `eine Geraetezeile zeigt ihren formatierten Wert, nicht das Rohfeld` | Zusicherung auf eine Zelle aus einem der **15** `render:`-Vorkommen in `src/app/m/radio/admin/(arbeit)/geraete/GeraeteTabelle.tsx`. ⬜ **T-L1**: welche Spalte, wird beim Bau gemessen und namentlich belegt. ⛔ **Eine Spalte mit sichtbarer Formatierung wählen** (Status als Wort, Datum als Kalendertag, Modi-Liste) — eine Spalte, deren `render` den Rohwert durchreicht, machte den Fall vakuös |
| 8 | `eine Leihzeile zeigt ihren formatierten Wert, nicht das Rohfeld` | dasselbe für eines der **acht** `render:`-Vorkommen in `src/app/m/radio/admin/(arbeit)/ausleihen/AusleihenTabelle.tsx`. ⛔ **Nicht `LoanList.tsx` (Alt-Bestand, existiert hier nicht) und nicht „sieben" (steht in keiner Quelle: Alt-Datei 5, Suite-Datei 8, `Spec:6874` nennt keine Zahl)** |
| 9 | `die Hoehe eines App-Umschalter-Eintrags ist kleiner als die Kopfzeilenhoehe` | ⛔ **`boundingBox().height` als VERHÄLTNIS, nicht als Zahl** — Falle 8. `antd/es/layout/style/index.js` setzt auf `.ant-layout-header` ein `lineHeight` in Kopfzeilenhöhe und vererbt es an jedes Kind; gemessen waren es 82 px je Eintrag in einer 64 px hohen Kopfzeile. ⛔ **Kein Gate findet das:** antd spritzt die Regel zur Laufzeit über cssinjs ein, sie steht in **keiner Datei des Repos**, und jsdom rechnet keine Zeilenboxen |
| 12 | `das Druckblatt riegelt die Verwaltungsstufe ab` | ⬜ **V-L14 / T-L3**: `admin/(druck)/zugaenge/blatt` mit der **Updater**-Gruppe → **404**, mit der **Admin**-Gruppe → **200**. ⛔ **Die Wirkprobe des Personenriegels in `admin/(druck)/layout.tsx`, die bis heute fehlt** (`riegel.test.ts:81-87`) |

⛔ **Fall 12 ist die Übernahme eines fremden Postens, und das steht so im Kommentar.** Eigentümer war
laut `riegel.test.ts:81-87` „die Schlussprüfung von Planteil 4"; sie hat ihn nicht abgelesen.
**Planteil 5 übernimmt ihn ausdrücklich, statt ihn weiterzureichen** — er gehört in die e2e-Fläche,
und die entsteht hier. ⛔ **Nach diesem Fall wird die Zeile in `riegel.test.ts` fortgeschrieben:**
⬜ V-L14 auf ✅, mit den zwei gemessenen Statuscodes, nach dem Muster der Dauerfälle A–D.

⚠️ **Fall 12 ist der einzige Fall dieses Planteils, der `riegel.test.ts` anfasst** — und nur den
Kopfkommentar, ⛔ **keine Klausel**. NS-V7, wörtlich: „Planteil 5 darf sie unter keinen Umständen
aufweichen."

⚠️ **Falle 12 (Klick-Falle) gilt hier scharf:** `/admin` läuft in `FullShell` mit `SessionProvider`,
und die Navigation wechselt nach dem Nachladen der Sitzung von der schmalen Platzhalter- auf die
volle Spalte — der Inhalt rutscht ~240 px hoch, **nach** `load` und **hinter** Playwrights eigener
Stabilitätsprobe. ⛔ **`klickeWennRuhig` aus `e2e/fixtures.ts`**, kein blankes `.click()`.

- [ ] **Schritt 1** — Die vier Fälle schreiben, alle rot. ⛔ **In die bestehende Datei, in die
      passenden `describe`-Blöcke**, nicht als vierter Block am Ende.
- [ ] **Schritt 2** — ⬜ **T-L1 ablesen**: die zwei Spalten namentlich wählen und mit `datei:zeile`
      belegen. ⛔ **Erst messen, dann schreiben.**
- [ ] **Schritt 3** — Sonden:
      **S-T5a**: die gewählte `render`-Funktion in `GeraeteTabelle.tsx` durch ein `String(wert)`
      ersetzen → Fall 7 rot. ⛔ Bleibt er grün, ist die Spalte falsch gewählt (T-L1) und der Fall
      wird **neu geschrieben, nicht ergänzt**.
      **S-T5b**: dasselbe für `AusleihenTabelle.tsx` → Fall 8 rot.
      **S-T5c**: `line-height: normal` am gemeinsamen Vorfahren entfernen → Fall 9 rot.
      **S-T5d**: `requireRadioAdmin()` in `admin/(druck)/layout.tsx` auf `requireRadioVerwaltung()`
      absenken → **Fall 12 rot**. ⛔ **Das ist die V-L14-Wirkprobe.** Bleibt er grün, misst er die
      Hülle statt der Stufe — genau der Zustand, den `riegel.test.ts:81-87` beklagt.
- [ ] **Schritt 4** — ⬜ V-L14 im Kopfkommentar von `riegel.test.ts` auf **abgelesen** setzen, mit
      den zwei Messwerten und dem Verweis auf den Dauerfall. ⛔ **Fortschreiben, nicht löschen.**
- [ ] **Schritt 5** — Tor, plus `rtk pnpm exec playwright test e2e/radio-verwaltung.spec.ts`
      (⛔ **21 Fälle danach, nicht 17** — die Zahl wird im Bericht genannt).

```
rtk git add e2e/radio-verwaltung.spec.ts src/app/m/radio/riegel.test.ts
rtk git commit -m "test(radio): vier Ergaenzungen — zwei Zellen, die Zeilenhoehe, und V-L14 abgelesen"
```

---

## Aufgabe T6: Die neun Mutationsproben und ihr verfolgter Bericht

**Files:** Create `docs/superpowers/berichte/2026-08-26-radio-mutationsproben.md`

⛔ **NACH dem Grünwerden aller vorherigen Aufgaben** (Spec:7044-7052). Diese Aufgabe schreibt
**keinen** Produktcode und **keinen** Test — sie **misst**, ob die vorhandenen etwas messen.

⛔ **Das Ergebnis gehört in ein VERFOLGTES Artefakt**, nicht in einen git-ignorierten SDD-Bericht.
Gedächtnisnotiz „Beleg nicht in der Kladde": Abnahme-Messungen gehören in eine Datei, die den
Merge überlebt.

### Das Verfahren, je Probe

1. `rtk git status` — ⛔ **der Arbeitsbaum muss sauber sein**, sonst ist nicht unterscheidbar, was
   die Probe geändert hat.
2. Die Mutation **einzeln** in den Arbeitsbaum legen. ⛔ **Eine Mutation je Lauf**, nie zwei.
3. Den **zuständigen** Testlauf fahren — nicht die ganze Suite: eine Mutation, die fünf fremde
   Dateien rot macht, verdeckt die Frage, ob **der genannte** Fall rot wird.
4. ⛔ **Den Testnamen notieren, der rot geworden ist**, nicht nur „rot". ⬜ **T-L4.**
5. `rtk git checkout -- <datei>` und mit `rtk git status` prüfen, dass der Baum wieder sauber ist.
6. ⛔ **Nichts davon wird committet** — außer dem Bericht.

### Die Tafel

Die neun Proben stehen vollständig oben unter „Die neun Mutationsproben über sieben Pflichtstücke".
⛔ **Die dort genannten Zeilennummern stammen aus einem Stand vom 26.08.2026 — wer die Probe fährt,
sucht die Zeile am eigenen Stand neu.** Eine falsch getroffene Zeile macht einen falschen Test rot
und zählt als bestanden.

⛔ **Probe 6b ist umgekehrt herum zu lesen.** Sie mutiert **keinen** Produktcode: sie zieht
probeweise die zwei DB-Handles im Test auf **eines** zusammen. Die einhändige Fassung **bleibt
grün** — und genau das macht sie **vakuös** nach §6.6 Punkt 1 (Spec:6706) und ist der Beweis, warum
zwei Handles Pflicht sind. ⛔ **Die Probe ist selbst die Falsifikation, nicht ihr Ergebnis.** Wer
hier „grün, also bestanden" notiert, hat sie missverstanden.

### Der Bericht

| Spalte | Inhalt |
|---|---|
| Probe | 1 … 7, ⛔ **6a/6b und 7a/7b getrennt** — neun Zeilen |
| Pflichtstück | der Name |
| Mutierte Datei:Zeile | ⛔ **am eigenen Stand gemessen** |
| Kommando | der genaue Testlauf |
| Ergebnis | ⛔ **der Testname, der rot wurde** — plus die Zählzeile des Laufs |
| Baum danach sauber? | `rtk git status`-Beleg |

### Was passiert, wenn eine Probe grün bleibt

⛔ **Die Falsifikationsregel, wörtlich (Spec:6396-6404):** „Ein Test, der eine der genannten
Mutationen überlebt, ist **vakuös** und wird **gelöscht oder neu geschrieben — nicht ergänzt**."

⛔ **Das ist eine Anweisung an diese Aufgabe, kein Notfallplan.** Bleibt eine Probe grün, endet T6
nicht mit einem Vermerk, sondern mit einer **Änderung am Test** und einem erneuten Lauf der
Probe. Der Bericht führt dann beide Läufe.

⚠️ **Die einzige Ausnahme ist 6b**, und sie ist oben ausgeschrieben.

- [ ] **Schritt 1** — Den Bericht als leere Tafel anlegen, mit dem Verfahren im Kopf.
- [ ] **Schritt 2** — Die neun Proben der Reihe nach fahren, je Probe eine Zeile füllen, je Probe
      den Baum zurücksetzen und den Rücksetzbeleg notieren.
- [ ] **Schritt 3** — Für jede grün gebliebene Probe (außer 6b): den Test **neu schreiben**, die
      Probe wiederholen, beide Läufe eintragen.
- [ ] **Schritt 4** — ⬜ **T-L4** im Leerstellenverzeichnis auf abgelesen setzen.
- [ ] **Schritt 5** — Tor: ⛔ **hier ist es der volle Lauf.** `rtk pnpm typecheck`,
      `rtk pnpm lint`, `rtk pnpm vitest run`, `rtk pnpm build`, `rtk pnpm exec playwright test` —
      in dieser Reihenfolge, Build und Playwright **zuletzt**. Die vier Zahlen kommen in den
      Bericht.

```
rtk git add docs/superpowers/berichte/2026-08-26-radio-mutationsproben.md
rtk git commit -m "docs(radio): neun Mutationsproben ueber sieben Pflichtstuecke, mit Messwerten"
```

---

# Schluss

## Was Planteil 5 NICHT liefert — mit Eigentümern

| Posten | Eigentümer | Warum nicht hier |
|---|---|---|
| Der **Router-Schwenk** (6.7-Abschnitt D) und der **Abbau** (E) | **Spec 2 / Betreiber** | eine Betriebsentscheidung mit einem Zeitfenster, kein Code |
| Der **Importer** und die **Generalprobe** | **Spec 2** (`2026-08-18-radio-bau-leitplan.md`) | eigener Weg, eigene Pläne |
| Das **Cutover-Runbook** selbst | **Spec 2** | dieser Plan liefert ihm **siebzehn** Zusagen (unten), nicht seine Schritte |
| Die **Release-Notizen** | ⬜ **G-L8 / V-L10 — Spec 2, mit dem Betreiber-Datum** | siehe das Rezept unten |
| ⬜ **A-L1** — die tatsächliche Sitzungsdauer (Vorschlag 12 h) | **Betreiber**, vor dem Cutover | „Ob eine Schicht länger läuft, steht in keinem Repo" (`Spec:3279`) |
| ⬜ **E1b / V-L1** — der Name der Gruppe für `SUITE_UPDATER_GROUP_RADIO` | **Betreiber**, vor **Cut 26** | der Bau setzt einen frei gewählten Wert, und das ist richtig |
| ⬜ **V-L9** — die vier Quelltext-Scans auf `_lib/quelltextScan.ts` zusammenlegen | **ClickUp-Board** | „kein Bauwert in diesem Fenster"; E-G6 begründet die Nicht-Berührung |
| Der **Suite-Admin-Kurzschluss** (`src/core/groups.ts:125`) | **eigener Plan** | eine Betriebsänderung, die **jedes** Modul der Suite berührt |
| Die **CWE-348-Abhilfe für den Egress-IP-Kollaps** (`VORARBEIT-selfhop.md`) | **eigener Plan** | beschrieben, nicht gebaut; `radio`s Abwehr sind die zwei modulweiten Zähler |
| Der **Wirknachweis für `admin/import/hochladen`** (POST-only) | **offen, ohne Eigentümer** | E-G8 nennt den Grund; ⛔ **weggedefiniert wird er nicht** |
| Eine **Boot-Prüfung für `RADIO_HISTORIE_PURGE` / `_ERSTLAUF_MINUTEN`** | ⛔ **niemand — sie soll nicht entstehen** | §7.3.3 zählt fünf Prüfungen, keine davon ist diese; eine ungefragte Prüfung ist am Cutover-Abend ein Startabbruch, den kein Kapiteltext rechtfertigt |
| Ein **`STALE_GRACE_MS`-Ersatz** | ⛔ **niemand** | B15: der Ersatz ist WAL + `busy_timeout`, sein Nachweis ist `_db/leihen.test.ts` |
| **Offline schreiben** (Betreiberfrage 8) | **offen** | dieser Planteil baut nichts, was sie vorwegnimmt: kein Cache, keine Queue |

### Das Rezept für die Release-Notizen (⬜ G-L8)

⛔ **Sie entstehen hier NICHT, und der Grund ist keine Bequemlichkeit:** `datum` ist der Tag des
**Rollouts**, und `register.test.ts` koppelt Dateiname ↔ Felder (`modul`, `datum`, `slug`) ↔
Registerzeile. Ein Platzhalter-Datum wäre eine **falsche Angabe in einem getesteten Dreieck** — und
CLAUDE.md nennt `datum` ausdrücklich als Rollout-Tag.

**Was zu schreiben ist, sobald der Betreiber das Datum nennt** — drei bemerkbare Änderungen, je eine
eigene Datei unter `src/app/m/portal/_lib/neuigkeiten/notizen/radio/` plus je eine Zeile in
`register.ts`:

1. **Der Funkgeräte-Bestand zieht in die Suite** — was der neue Weg herein ist (QR-Code scannen oder
   über die Kachel anmelden), was gleich bleibt (die Geräte, die Ausleihhistorie), und die Adresse
   mit den Wörtern, die auf dem Bildschirm stehen.
2. **Ausleihen und Zurückgeben am Telefon** — der Ablauf in der neuen Oberfläche.
3. **Die Verwaltung: zwei Rechtestufen** — wer was darf, mit den Namen aus der Modulleiste.

⛔ **Kein Dateiname, kein Funktionsname, keine Versionsnummer, kein Framework. Du-Form, Präsens,
aktiv. Höchstens ein `hinweis` je Notiz. Kein Markdown im Text.** Der Stil ist verbindlich
(CLAUDE.md, Abschnitt „Release Notes").

---

## Was der Cutover ab hier kann, das er vorher nicht konnte

| Vorher | Ab jetzt |
|---|---|
| Der Container startete mit einer halben `.env` und meldete nichts | ⛔ Er **startet nicht**, wenn `SUITE_ADMIN_GROUP_RADIO` fehlt, `SUITE_ACCESS_GROUP_RADIO` gesetzt ist, das Sitzungsgeheimnis fehlt/zu kurz/gleich `AUTH_SECRET` ist, eine Zahl außerhalb ihres Bereichs liegt, die Gate-Kette verletzt ist oder `RADIO_HISTORIE_MONATE` ungültig ist |
| Eine fehlende Traefik-Zeile fiel erst am Abend auf | Sie steht als `radio:`-**Warnung** im Startprotokoll — und das Runbook liest es (`docker compose logs --since 2m suite`) |
| Die Löschrichtlinie war eine Absicht | Sie **läuft**, mit 1440 Minuten Verzögerung nach dem Start, täglich, HMR-idempotent, und ihr Abschalter meldet sich bei **jedem** Start |
| Der Alt-Service-Worker hätte den Umschwenk überlebt | ⛔ Der Abräum-Worker liegt unter `/sw.js`, ist **vor** dem Schwenk ausgeliefert, und `curl` beweist im Image, dass er der richtige ist (V5), auf fremdem Host nicht ausgeliefert wird (V6) und keinen `fetch`-Handler hat |
| „`radio` baut keine PWA" war ein Satz in der Spec | Es ist ein **Test im Repo** (V8/R36 im Bau statt als immer grüner `curl`) |
| `/api/health/radio` war ein Plan | Es ist eine geprüfte Antwort mit `module` und `revision` — **200 = im Image, 503 = falsches Image** |
| Dass die Riegel greifen, war für den Ausleihzweig **unbewiesen** | Vierzehn e2e-Zusagen beweisen es je Riegelform und je Rechtestufe; die eine verbleibende Lücke ist **benannt** |
| Die Pflichtstücke waren getestet, aber nicht falsifiziert | Neun Mutationsproben, jede mit dem Testnamen, der rot wurde |

**Damit sind ausführbar geworden:**

| Cutover-Aufgabe | Was Planteil 5 dafür geliefert hat |
|---|---|
| **C19** — der kopfgestützte Prüfsatz, Stufe 1 (dritte, letzte Hälfte) | **V3** (Health mit Revision, ⬜ G-L5), **V5** (der Abräum-Worker liegt im Image und ist der richtige), **V6** (`/sw.js` auf fremdem Host liefert ihn nicht), **V8/R36** (die Abwesenheitsprüfung statt eines `curl`) |
| **C30** — §D Abnahme und §E Service Worker (dritte, letzte Hälfte) | **Nr. 3** (Health nennt Modul und Revision), **Nr. 5** (`/admin` riegelt ab UND `/sw.js` liefert den Abräum-Worker), **Nr. 6** (kein radio-Manifest, ⬜ G-L6), **Nr. 9** (genau eine Zeile „Retention abgeschaltet", ⬜ G-L1), **Nr. 12** (ein Telefon einmal neu laden), **Nr. 14** (Retention wieder ein, zweiter Log-Blick), und der **ganze** §4.7 |

⛔ **C20, C28, C29 hängen NICHT an Planteil-5-Artefakten** — geprüft, nicht angenommen: C20s
V9–V16 prüfen Login, Geräteliste, Druckblatt, Ausleihen/Rückgabe, hell/dunkel, also Planteil-3/4-Flächen.

---

## Zusagen dieses Planteils

### An die Vorgänger (rückwirkend)

| An wen | Zusage |
|---|---|
| **Planteil 1** | Die **Rechnung** in `_lib/boot.ts` bleibt unangetastet — `retentionGrenze` und `raeumeLeihhistorie` behalten ihre `Date`-Formen (B5). Der Takt **importiert** sie, er definiert sie nicht. Die fünf reinen `retentionGrenze`-Fälle bleiben in derselben Datei stehen, **keine Zeile doppelt** |
| **Planteil 2** | `_lib/host.ts` und `_lib/hostRiegel.ts` werden **benutzt, nicht geändert** — insbesondere trägt keine neue Zeile in `hostRiegel.ts` ein `requireRadioHost(` mit Klammer (`host.test.ts` scannt den Rohtext, `hostRiegel.ts:12-15`). `riegel.test.ts` wird **verschärft** (`HANDLER_ANZAHL` 4 → 5), nie aufgeweicht |
| **Planteil 3** | ⬜ **A-L9** (= Z-L1) wird für den **Ausleihzweig** eingelöst — T2 (der Ast trägt), T3 (beide Riegelformen der Sperre), T4 (die Datenwirkung vor dem Riegel). Die Namen sind die gebauten (B7), nicht die verworfenen |
| **Planteil 4** | ⬜ **V-L14** wird **abgelesen**, nicht weitergereicht (T5, Fall 12). `e2e/radio-verwaltung.spec.ts` wird **ergänzt**, die vier Dauerfälle bleiben unverändert (NS-V10). ⬜ **V-L9** bleibt bewusst offen, mit Begründung (E-G6) |

### An Spec 2 (das Runbook) — siebzehn Zeilen, die dort auftauchen müssen

⛔ **Siebzehn, und ich habe gezählt.** Die frühere Fassung nannte zwölf und ließ dabei **drei**
Zusagen liegen, die `Spec:6309-6311` und `Spec:6355` wörtlich verlangen (13, 14, 15); dazu kommt
die aus ⬜ G-L2 entstandene Zeile 16 und die bisher außerhalb der Liste stehende Zeile 17.

1. Nach dem Start einmal `docker compose logs --since 2m suite` lesen. ⛔ **Jede `radio:`-Warnung ist
   ein Stopp-Punkt, kein Hinweis.**
2. Der externe Monitor fragt `https://radio.iuk-ue.de/api/health/radio` — ⛔ **nie `/api/health`**.
   **200 = im Image, 503 = falsches Image.**
3. ⛔ **Health ist grün gegen eine leere `radio.db`.** Die Freigabe braucht die **sechs** `COUNT(*)`
   (`devices`, `software_versions`, `api_tokens`, `users`, `device_events`, `loans`), nie
   `status:"ok"`. ⚠️ NT8: `sqlite3 -readonly` scheitert gegen eine frisch importierte WAL-Datenbank.
4. ⛔ **Der Abräum-Worker ist im Deploy aus §4.2 Nr. 1, nicht im Cutover.**
5. Die drei `curl`-Zeilen aus V5 gegen `/sw.js`; ⛔ **kommt HTML oder Portal-Inhalt, greift der
   Rewrite nicht** — `SUITE_HOST_RADIO` ist falsch gesetzt.
6. `/sw.js` auf einem **fremden** Suite-Host liefert ihn **nicht** (404, und **nicht** als HTML).
7. Nach dem Umschwenk **ein Telefon**, das den Alt-Kiosk kannte, **einmal neu laden** und prüfen,
   dass die Suite-Oberfläche erscheint. ⚠️ Worst Case ist **eine** veraltete Seitenansicht je Gerät.
8. Die Abwesenheitsprüfung R36 läuft **im Repo, vor der Generalprobe** — nicht als `curl`.
9. `RADIO_HISTORIE_PURGE=0` während des Verifikationsfensters; die `info`-Zeile steht bei **jedem**
   Start. ⛔ **Der Schritt „Retention wieder einschalten" endet mit einem zweiten Log-Blick, in dem
   die Zeile FEHLT.**
10. `radio-admin.iuk-ue.de` steht ⛔ **nicht** in `SUITE_TRAEFIK_RULE`; der Redirect braucht einen
    **zweiten, eigenen Router** mit `redirectregex`, **302 statt 301**, doppeltes `$$`. Der
    DNS-Eintrag bleibt, solange der Redirect steht.
11. ⛔ **Rollback ist die LEERE Zeile, nicht die gelöschte.** Der Rückweg ist ausschließlich „Router
    zurück" — **kein Parallelfenster**.
12. Der **Standby-Stack zerstört beim Start genau die Quelle, für die er steht**:
    `radio-admin`s `startRetentionSchedule` purgt **sofort bei jedem Start**, mit Cutoff an der
    Wanduhr. ⛔ **Wer den Stack in Woche zwei zum Nachschlagen hochfährt, verliert zwei weitere
    Wochen zurückgegebener Leihen** — genau die, gegen die er prüfen wollte. Der Kiosk-Postgres
    fällt zudem aus jeder Sicherung heraus (letztes `pg_dump` vor Abbau).
13. ⛔ **Nach dem Import läuft `scripts/backup.sh` EINMAL VON HAND**, und das Tarball wird auf die
    Anwesenheit von `radio.db` geprüft: `tar -tzf … | grep radio.db`. **`Spec:6309-6311` wörtlich:**
    „Der Glob ist bewiesen erst, wenn er einmal gelaufen ist." ⚠️ **Der Plan-Eintrag „`scripts/backup.sh`
    — nicht angefasst" beantwortet eine ANDERE Frage** („ändert sich etwas?") und ersetzt diese
    Zusage nicht. Wiederholt in `Spec:6355`.
14. ⛔ **Der zweite der drei stillen Fälle aus §7.4.4 — der Login-Rückweg, als eigener Schritt:**
    einmal von `radio.iuk-ue.de/admin` aus anmelden und prüfen, dass man **dort** wieder landet
    (`Spec:6235-6249`). Handarbeit, kein Gate.
15. ⛔ **Der dritte stille Fall aus §7.4.4 — der `prodHosts`-Kollisionsabgleich, als eigener
    Schritt:** `grep -n 'prodHosts' src/core/registry.ts` gegen die gesetzten `SUITE_HOST_*` **von
    Hand** vergleichen (`Spec:6235-6249`).
    ⚠️ **Der erste der drei** (der Rewrite greift nicht → Portal-Fallback) steht als ⚠️ in Zeile 5.
    ⛔ **`Spec:6355` verlangt sie ausdrücklich als DREI GETRENNTE SCHRITTE** — die frühere Fassung
    trug nur den ersten.
16. ⛔ **Beim Cutover-Start NACH dem Import darf die `info`-Zeile „`radio.db` existierte vor diesem
    Start nicht" NICHT im Protokoll stehen.** Steht sie, ist das Volume nicht gemountet oder
    `DATA_DIR` vertippt. ⚠️ **Beim ERSTEN Deploy (vor dem Import) steht sie legitim** — deshalb ist
    sie `info` und kein Stopp-Punkt nach Zeile 1. Der Ablesepunkt ist derselbe Log-Blick.
17. **`TZ=Europe/Berlin`** als Voraussetzung — ⛔ **so verlangt es `Spec:6355`**, und dabei bleibt es.
    ⚠️ **Der bisher genannte Beleg trägt NICHT und ist gestrichen:**
    `radio-admin/server/src/routes/export.ts:51` (`new Date(value as number).toISOString().slice(0, 10)`)
    ist die **einzige** Datumsformatierung jener Datei und **zeitzonenunabhängig** — `toISOString()`
    liefert UTC. ⚠️ **Und der Suite-eigene Pfad ist es gemessen ebenfalls:**
    `src/app/m/radio/_lib/anzeige.ts:62` (`export const ZONE = "Europe/Berlin"`) und
    `src/app/m/radio/_lib/csv/spalten.ts:126` tragen die Zone **im Ausdruck**;
    `spalten.ts:131` schreibt aus: „DIE ZONE STEHT IM AUSDRUCK, NICHT IN DER UMGEBUNG. Das Repo setzt
    `TZ` ausdruecklich [nicht]." ⛔ **Die Zeile bleibt, weil die Spec sie setzt — nicht, weil `radio`
    gemessen daran hinge.** Wer sie mit einer radio-Abhängigkeit begründet, begründet sie falsch.

Dazu die drei Ablesungen ⬜ **G-L5 / G-L6 / G-L7** aus
`docs/superpowers/berichte/2026-08-26-radio-betriebsablesungen.md`.

### An jeden künftigen Bauenden

| Zusage |
|---|
| ⛔ **Wer einen sechsten Quelltext-Scan anlegt, importiert seinen Baustein aus `src/app/m/radio/_lib/quelltextScan.ts` — und wählt ihn nach der ZUSICHERUNGSART** (E-G6a): `ohneKommentare` (`:61`) für Verbote von **Zeichenketten**, `bereinigt` (`:208`) für Struktur- und Zählzusicherungen. `bereinigt` leert jedes Literal (`:117-127`); ein Zeichenkettenverbot darüber ist **still leer**. Die dreiteilige Reparatur wird nicht ein sechstes Mal neu geschrieben — ⛔ **und ihre Lehre ist der Satz aus `:55-59`, nicht der Funktionsname** |
| ⛔ **Wer einen cachenden Service Worker für `radio` baut, holt die `releaseBody()`-Lehre nach** (`src/app/m/qr/_lib/sw-source.ts:100`, `:150`, `:212`). Sie fehlt hier nur, weil die Ursache fehlt |
| ⛔ **Wer den 28-Zeichen-Coderaum aus §3.2.1 verkürzt, macht die CWE-348-Umstellung zur echten Voraussetzung.** Verkürze ihn nicht |
| ⛔ **Wer `RADIO_HISTORIE_MONATE` eine Obergrenze gibt, erfindet eine Zusage**, die keine Spec-Zeile trägt |
| ⛔ **Wer `RADIO_AUSLEIH_SITZUNG_STUNDEN` auf 168 weitet, nimmt eine ausgelieferte Verschärfung zurück** (E-G2) — das braucht einen Auftrag |
| ⛔ **Wer eine Zählzusage von `toBe` auf `toBeGreaterThanOrEqual` ändert, baut NT11 neu** |

---

## ⛔ Der Bauweg ist damit fertig — was noch aussteht, ist kein Code

**Nach Planteil 5 entsteht für `radio` kein Modul-Code mehr.** Was folgt, sind Betriebsschritte:
Import, Generalprobe, Freeze, Snapshot, Router-Schwenk, Standby, Abbau. Sie leben in Spec 2
(`docs/superpowers/specs/2026-08-18-radio-cutover-design.md`) und ihren Detailplänen.

### Die Übergabe, in einer Tafel

| Was | Zustand nach Planteil 5 |
|---|---|
| **Datenhaltung** (Planteil 1) | ✅ Schema, zwei Migrationen, Registrierungsdreieck, die Retention-Rechnung |
| **Zuschnitt** (Planteil 2) | ✅ Host-Riegel in **vier** Formen, Zugriffsriegel, Navigation, drei Hüllen, `riegel.test.ts` |
| **Zugang und Ausleihe** (Planteil 3) | ✅ Gate, Code-Einlösung, Sitzung, drei Ausleihflächen, neun Actions |
| **Grenze und Verwaltung** (Planteil 4) | ✅ zehn `/admin`-Seiten, acht Inseln, CSV-Export/-Import, Druckblatt, zwei Rechtestufen; die sechs `/v1`-Routen sind Drizzle-Aufrufe |
| **Betrieb** (Planteil 5, G) | ✅ Boot-Prüfungen, Retention-Takt, Abräum-Worker, PWA-Abwesenheit, Health-Zusage, `.env.example` |
| **Nachweis** (Planteil 5, T) | ✅ vierzehn e2e-Zusagen (neunzehn laufende Testfälle), neun Mutationsproben |
| **Import** | ⏳ Spec 2 |
| **Generalprobe** | ⏳ Spec 2 |
| **Cutover** | ⏳ Spec 2 / Betreiber |

### Welche Cutover-Aufgaben jetzt ausführbar werden

| C | Titel | Ab wann |
|---|---|---|
| **C19** | §P.9 — der kopfgestützte Prüfsatz (Stufe 1) | ⛔ **vollständig ausführbar**, sobald Planteil 5 deployt ist — V3/V5/V6/V8 waren die letzten fehlenden Zeilen |
| **C30** | §D Abnahme + §E Service Worker | ⛔ **vollständig ausführbar** — Nr. 3/5/6/9/12/14 und der ganze §4.7 hängen an Planteil-5-Artefakten |
| **C20** | §P.10 — der browsergestützte Prüfsatz (Stufe 3) | seit Planteil 3/4 ausführbar; Planteil 5 ändert daran nichts |
| **C28/C29** | Import, Parität, `.env` scharf, Router | hängen am Importer (Spec 2), nicht an Planteil 5 |

⛔ **Und die eine Reihenfolge-Auflage, die über alles andere geht:** G5 (der Abräum-Worker) muss
**deployt** sein, bevor C29s Router-Schritt läuft. **Nicht gebaut — deployt.**

### Welche ⬜ nach Planteil 5 noch offen sind

| ⬜ | Was | Eigentümer | Fällig |
|---|---|---|---|
| **G-L1** | Der Wortlaut der `info`-Zeile als Grep-Anker | Spec 2, aus dem gebauten Quelltext | vor C30 Nr. 9 |
| **G-L5** (= L5) | Welches Feld von `/api/health/radio` was belegt | Spec 2, am Container | vor **C19** |
| **G-L6** (= L11) | Was `manifest.webmanifest` auf dem radio-Host liefert | Spec 2, erster Deploy | vor **C30 Nr. 6** |
| **G-L7** (= L12) | Der DevTools-Ablesepunkt | Spec 2, echtes Gerät | vor **C30 Nr. 12** |
| **G-L8** (= V-L10) | Das `datum` der Release-Notizen | Betreiber | Rollout-Tag |
| **A-L1** | Die tatsächliche Sitzungsdauer (Vorschlag 12 h) | Betreiber | vor dem Cutover |
| **E1b / V-L1** | Der Name der Updater-Gruppe | Betreiber | vor **Cut 26** |
| **V-L9** | Die vier Scans auf eine Quelle zusammenlegen | ClickUp-Board | kein Bauwert in diesem Fenster |
| — | Der Wirknachweis für `admin/import/hochladen` (POST-only) | ⛔ **ohne Eigentümer, benannt** | offen |

⛔ **G-L2, G-L3, G-L4, T-L1, T-L2, T-L3, T-L4 werden VON DIESEM PLANTEIL abgelesen** und stehen
danach auf ✅. Sie sind hier als Leerstellen benannt, weil ihr Wert erst der Bau hergibt — nicht,
weil sie offen blieben.

---

## Leerstellenverzeichnis

**Zwölf neu benannte** (G-L1 … G-L8 und T-L1 … T-L4) und **sechs weitergeführte** (A-L7, A-L1,
E1b/V-L1, V-L9, Z-L1/A-L9 und die POST-only-Lücke ohne Eigentümer). ⛔ **Achtzehn Zeilen
insgesamt, und ich habe gezählt.**

⚠️ **⬜ T-L3 IST ⬜ V-L14 unter neuer Nummer** — derselbe Gegenstand, von Planteil 4 übernommen
(T5). ⛔ **Er wird EINMAL gezählt, als T-L3**, und `V-L14` erscheint deshalb nicht als eigene Zeile
dieser Tafel. Dieselbe Lesart gilt für G-L5/L5, G-L6/L11, G-L7/L12 und G-L8/V-L10: die
Spec-2-Nummer steht in Klammern, gezählt wird die G-Nummer.

| ⬜ | Frage | Wer liest sie wann ab | Zustand am Ende von Planteil 5 |
|---|---|---|---|
| **G-L1** | Wortlaut der `info`-Zeile für `RADIO_HISTORIE_PURGE=0` | G4 legt fest, Spec 2 liest als Grep-Anker | ✅ festgelegt / ⏳ als Anker abzulesen |
| **G-L2** | Mechanismus für „`radio.db` existierte vorher nicht" | G4 | ✅ |
| **G-L3** | Signatur/Verhalten von `stoppeRadioHintergrund()` | G4, nach `files`-Vorbild | ✅ |
| **G-L4** | `EnvLike`-Parameterstil von `starteRadioHintergrund()` | G4 | ✅ |
| **G-L5** (= L5) | Feldbelegung von `/api/health/radio` | Spec 2, vor C19 | ⏳ |
| **G-L6** (= L11) | Was `manifest.webmanifest` liefert | Spec 2, erster Deploy | ⏳ |
| **G-L7** (= L12) | DevTools-Ablesepunkt | Spec 2, echtes Gerät | ⏳ |
| **G-L8** (= V-L10) | `datum` der Release-Notizen | Betreiber | ⏳ |
| **T-L1** | Welche Zelle die Fälle 7/8 tragen | T5, gemessen | ✅ |
| **T-L2** | Statuscodes der Kiosk-Stationen | T2, gemessen | ✅ |
| **T-L3** (= V-L14) | Wirkprobe des `(druck)`-Personenriegels | T5 | ✅ |
| **T-L4** | Welcher Testname je Mutation rot wird | T6 | ✅ |
| **A-L7** | Boot-Prüfung auf das Sitzungsgeheimnis | G1 | ✅ |
| **A-L1** | Die tatsächliche Sitzungsdauer | Betreiber | ⏳ |
| **E1b / V-L1** | Name der Updater-Gruppe | Betreiber, vor Cut 26 | ⏳ |
| **V-L9** | Vier Scans zusammenlegen | ClickUp-Board | ⏳ (bewusst) |
| **Z-L1 / A-L9** | Riegel greifen bei echtem Abruf | Planteil 4 (Verwaltung) + Planteil 5 (Rest) | ✅ **bis auf eine benannte Zeile** |
| — | Wirknachweis `admin/import/hochladen` (POST-only) | ⛔ **ohne Eigentümer** | ⏳ **offen und benannt** |

---

## Selbstprüfung gegen den Auftrag

| Auflage | Wo dieser Plan sie einlöst |
|---|---|
| **1 — Abräum-Worker beim ERSTEN Deploy** | „Zehn Dinge" Punkt 1; Architektur-Block G (G5 als fünfte von acht, nicht am Ende); der eigene Abschnitt „Der Abräum-Worker"; die Freigabe-Zeile; „Was der Cutover ab hier kann"; die Zusage 4 an Spec 2 |
| **1b — Cache-Namen GEMESSEN, nicht geraten** | **E-G5** mit sechs Belegzeilen aus `radio-inventar/apps/frontend/public/sw.js`; der Testfall „er loescht auch den gemessenen Alt-Namen"; Sonde **S-G5b** als Paar-Probe |
| **1c — wie man misst, dass er gewirkt hat** | „Zwei Hälften, und die erste beweist die zweite nicht": die drei `curl`-Zeilen (V5/V6), der e2e-Fall 10 in T4, das Telefon (§4.7.2 Hälfte 2), ⬜ G-L7 |
| **2 — Reihenfolge der zwei Boot-Exporte, mit je einem zusichernden Test** | Architektur-Zwang 1; **G2** mit dem Fall `radioBootFehler liest KEINE Tabelle` und Sonde **S-G2d** (ein `getDb()` muss ihn rot machen); **G4** mit der Einhängung in `startBackgroundWork()` und **G3** als abgeleitetem Wächter über **beide** Familien — ⛔ Klausel (II) in **zwei Richtungen**, mit `aufgaben/_lib/scan.ts:324` als namentlich geführter Ausnahme |
| **3 — die fünf Takt-Fälle, inkl. der Regressionssperre, mit Mutationssonde** | **G4**, Testtabelle; Sonde **S-G4a** (ein Sofort-Purge muss `starteRadioHintergrund loescht beim Start NICHTS` rot machen) |
| **4 — HMR-Idempotenz, Fall und Sonde** | **G4**, Fall `zweimaliger Aufruf startet nur einen Timer`; Sonde **S-G4b**; „Zehn Dinge" Punkt 4; die Warnung, dass die Wache **beide** Uhren decken muss |
| **5 — Z-L1 je Riegelform und je Rechtestufe** | die Tafel „Was ⬜ Z-L1 nach diesem Planteil deckt" mit **fünfzehn** Zeilen, davon eine mit „weiterhin offen"; T2–T5; die Korrektur, dass Planteil 4 **vier grüne Dauerfälle** hinterlassen hat, nicht zwei einmalige Messungen — und dass sie nur den `(arbeit)`-Zweig decken |
| **6 — fünfter Scan übernimmt die dreiteilige Reparatur** | **E-G6** und ⛔ **E-G6a**: **G6** importiert `ohneKommentare` statt `bereinigt`, **weil** die Lehre der Reparatur „nie falsch-negativ und still" ist (`quelltextScan.ts:55-59`) und `bereinigt` drei der fünf Zusagen strukturell blind machte; die Fälle „eine verbotene Zeichenkette INNERHALB eines Literals wird gefunden" und „ein nachgestelltes Kommentarende wird GEMELDET"; Sonde **S-G6b** als Auflage-6-Probe, **S-G6a namentlich auf `_lib/sw-quelle.ts`** |
| **6b — wer „alle" schreibt, zählt vorher** | die Zählzusage in G6 (`toBe`), `HANDLER_ANZAHL` in G5, `toHaveLength(5)` in T4, die Hakenzahlen in G3; die Verbotstafel gegen `toBeGreaterThanOrEqual`; die POST-only-Lücke, die **benannt** statt weggedefiniert wird |
| **Eiserne Regel — benannte Leerstellen statt Erfindungen** | achtzehn Zeilen im Leerstellenverzeichnis, je mit „wer liest sie wann ab"; ⛔ kein erfundener Wert für ⬜ G-L5/G-L6/G-L7; keine Obergrenze für `RADIO_HISTORIE_MONATE`; keine Beispielausgabe im Ablese-Artefakt |
| **Kopf wie Planteil 4** | For agentic workers → Stand → Goal → Architecture mit Blockeinteilung → Blöcke mit gemeinsamem Tor → Tech Stack → Spec-Kapitelgrenzen mit B-Tafel → Zehn Dinge → Global Constraints + Verbotene Namen + Tor → **Bauform-Zulässigkeitstafel** (26 Zeilen) → **Sperrtafel** (drei Teile) → **Entscheidungstafel** (E-G1…E-G10) → Fachkapitel → Dateiliste → Reihenfolge |
| **Schluss wie gefordert** | „Was Planteil 5 NICHT liefert" · „Was der Cutover ab hier kann" · „Zusagen dieses Planteils" · ⛔ „Der Bauweg ist damit fertig — was noch aussteht, ist kein Code" (mit der Übergabe an Spec 2, den ausführbar gewordenen Cutover-Aufgaben und den offenen ⬜) · Leerstellenverzeichnis · Selbstprüfung |
| **Sichtbare Zweiteilung G / T** | zwei `# BLOCK`-Überschriften, G1–G8 und T1–T6, mit eigener Blocktafel in der Architektur |

⛔ **Was dieser Plan bewusst ANDERS macht als seine Eingaben, jeweils mit Beleg:**

1. **Kein `zahlFehler`** (E-G1) — der Bestand weist die Aufgabe namentlich `_lib/grenzen.ts` zu.
2. **`1..24` statt `1..168`** (E-G2) — eine ausgelieferte Verschärfung wird nicht zurückgenommen.
3. **Acht statt fünf Boot-Prüfungen** (E-G4) — zwei weitere haben einen schriftlichen Eigentümer.
4. **`EINSTIEGE` mit fünf statt der fünf aus §8.4.3** (E-G8) — zwei der genannten Pfade sind als
   Listeneinträge nicht baubar, und der Ersatz ist begründet.
5. **Keine `radio-tabellen.spec.ts`** (E-G9) — aus Belegen, nicht aus Annahme.
6. **G3 als eigene Aufgabe mit gemeinsamem Tor** — weil der Bestandswächter gemessen eine
   handgepflegte Namensliste ist und `radioBootFehler` dort grün durchginge.
7. **Der dritte Spion in `bootstrap.test.ts`** (G4) — weil `startBackgroundWork()` dort gemessen
   zweimal **echt** gerufen wird.
8. **⬜ V-L14 wird übernommen statt weitergereicht** (T5) — sein bisheriger Eigentümer hat ihn nicht
   abgelesen, und die e2e-Fläche entsteht hier.
9. **`ohneKommentare` statt `bereinigt` im fünften Scan** (E-G6a) — `bereinigt` leert
   Zeichenketten (`quelltextScan.ts:117-127`) und machte drei der fünf Zusagen **still blind**.
   Die Lehre von Auflage 6 ist der Satz aus `:55-59` („nie falsch-negativ und still"), nicht ein
   Funktionsname. **Keine Aufweichung, sondern ihre Einhaltung.**
10. **Klausel (II) in G3 läuft in ZWEI Richtungen** — der Spec-Glob `src/app/m/*/_lib/boot.ts` sieht
    `starteAufgabenScanArbeiter` (`aufgaben/_lib/scan.ts:324`) strukturell nicht; die
    Vorwärtsmenge wird als **Teilmenge** benannt, die Ausnahme namentlich im Quelltext geführt, und
    (IIb) zählt die Aufrufe im Rumpf von `startBackgroundWork()`.
11. **Die `radio.db`-Melde-Zeile steht in `radioBootFehler()` und ist `info`** (⬜ G-L2) — in
    `starteRadioHintergrund()` könnte sie gemessen **nie** feuern (`migrateAllModules()` legt die
    Datei vorher an), und als `warn` machte sie einen vorgeschriebenen **ersten Deploy** zum
    Stopp-Punkt nach Zusage 1.
12. **Mutationsprobe 7 ist gespalten (7a/7b)** — `Spec:7065` verlangt, dass **der Scan** rot wird,
    „nicht die Ausnahmeliste wachsen". Die frühere Fassung hätte einen **intakten** Wächter als
    vakuös verworfen: die NT11-Fehlerform mit umgekehrtem Vorzeichen.
13. **Fall 13 löst `Spec:6916`s zweite Hälfte ein** (T4) — das Cookie der laufenden Sitzung ist nach
    dem Fremdhost-Abruf auf `/abmelden` **differenziell unverändert**. Sie fehlte bisher ganz.
14. **Keine `e2e/radio-sw.spec.ts`** (E-G9a) — „genau ein Fall, der die Antwort prüft" ist die
    Zusage, nicht die Datei; der Fall steht in `radio-hosts.spec.ts`, wo beide Hosts schon stehen.
