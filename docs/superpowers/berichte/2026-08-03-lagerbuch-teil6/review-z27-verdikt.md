# Review T176a1 — §11.5 Zustand 27 („`checks.ergebnis` unlesbar"), 04a4438..443ddb0

### Spec-Treue

**✅ spec-treu.** Alle neun Festlegungen sind an der Sache belegt, nicht nur behauptet:

| # | Festlegung | Beleg |
|---|---|---|
| 1 | unlesbar = `catch` · Nicht-Objekt · `""` | `_lib/checkErgebnis.ts:195` (`""`), `:200` (`catch`), `:207` (`daten === null \|\| typeof daten !== "object"`) — genau die drei, keine vierte |
| 2 | `roh === null` **nicht** unlesbar, ausdrücklich zugesichert | `checkErgebnis.ts:194` (`if (roh === null) return leer();`); benannte Zusicherung `checkErgebnis.test.ts:249-260` („`null` ist NICHT unlesbar — ein offener Check hat noch kein Ergebnis") und `lesepfade/checks.test.ts:396` |
| 3 | `altFormat` unverändert, nicht eingemeindet | V1-Zweig des Parsers unberührt; `page.tsx:120-127` wörtlich unverändert; `checks.ts` bezieht `altFormat` weiterhin aus `summe.altFormat`; `checkErgebnis.test.ts` (letzter Fall im neuen Block) sichert `expect(e).not.toHaveProperty("unlesbar")` für V1 |
| 4 | additiv, mit Vorgabewert, keine Aufrufstelle angefasst | **zwei Ebenen, und nur eine ist additiv — beides geprüft:** Parsergrenze `checkErgebnis.ts:115` `unlesbar?: true`, Vorgabe `undefined` = **lesbar** (die harmlose Richtung), alle vier Aufrufstellen unverändert. Leser-DTO `lesepfade/checks.ts:116` `unlesbar: boolean` ist **erforderlich** und hat genau eine Aufrufstelle gekostet (s. u.) |
| 5 | kein Overbuild | kein „Check läuft noch", keine zweite Warnklasse (`checkErgebnis.test.ts:241` hält „Müll in den Listen" ausdrücklich lesbar), `CheckSummen`/`checkHistorie` unberührt |
| 6 | TDD je Schicht, rot vor der Implementierung | Bericht §3 nennt je Schicht Kommando, rote und grüne Ausgabe; die roten Ausgaben sind mit dem Diff intern konsistent (s. „Zur Echtheit der TDD-Belege") |
| 7 | echter Render beider Fälle | `e2e/lagerbuch-verwaltung.spec.ts:144-158` (unlesbar) und `:161-171` (Gegenprobe), Fixtures `e2e/seed-lagerbuch.ts:219-239` |
| 8 | kein `src/core`, keine neue Datei unter `e2e/` oder `_actions/` | Diff: 8 Dateien, alle Modifikationen, keine `new file mode`; `guards.test.ts` zählt ohnehin nur `_actions/` (`:408-414`) |
| 9 | kein zweites DOM-Harness, keine `e.message`-Anzeige | `page.test.tsx` nutzt die dort vorhandenen Element-Baum-Helfer (`elementeVomTyp`, `:42-54`, unverändert); der Alert-Titel ist ein fester Satz (`page.tsx:153`), kein durchgereichter Fehlertext |

**⚠️ Aus dem Material nicht abschließend prüfbar**

- Ob die roten Ausgaben in Bericht §3 wirklich **vor** der Implementierung entstanden sind, kann ich
  nicht beweisen (kein Testlauf erlaubt, keine git-Nachfahrt). Die inhaltliche Prüfung spricht dafür
  (unten).
- Die Playwright-Zahlen (9 passed / 54 passed) und die Nicht-Vakuitätsmessung sind Behauptungen. Was
  ich stattdessen geprüft habe: die Zusicherungen können **strukturell** nicht vakuös grün werden
  (`toHaveCount(1)` und `toHaveClass(…)` auf einem gefilterten Locator schlagen bei 0 Treffern fehl,
  `e2e/…:154-158`).
- Die Lesart von §11.5, Zeile 27 („die **Zeile** wird als ‚Ergebnis unlesbar' gekennzeichnet"): siehe
  Minor 2 — der Übersichtsroute wurde nichts gegeben, und das kann gewollt sein.

### Stärken

- **Die Abgrenzung sitzt dort, wo sie hält, und ist doppelt verriegelt.** `checkErgebnis.test.ts:109`
  (`expect(parseCheckErgebnis(null)).toEqual(LEERES_ERGEBNIS)`) würde bei einer Rückkehr zu `!roh`
  rot, weil `toEqual` die zusätzliche Eigenschaft `unlesbar: true` nicht durchlässt; die benannte
  Zusicherung `:249-260` würde zusätzlich rot (`toBeFalsy()` gegen `true`). Die vom Lead verlangte
  Antwort auf „würde eine Rückkehr zu `!roh` rot?" ist damit **ja, an zwei Stellen**.
- **Additivität real geprüft, nicht geglaubt.** Alle vier Aufrufstellen lesen nur Felder und
  serialisieren nichts zurück, keine läuft über `Object.keys`/Spread-in-DB:
  `_actions/loeschen.ts:181` (liest `geraete`), `_lib/domain/check.ts:83` (`summiereCheckErgebnis`,
  zählt Listen), `_lib/lesepfade/checks.ts:130`, `_lib/seedLokal.test.ts:258`. `LEERES_ERGEBNIS` hat
  **keinen** Konsumenten außerhalb von `checkErgebnis.ts`/`.test.ts` (repo-weit gegrept). Der
  Vorgabewert bedeutet „lesbar" — die stille Verschlimmerung, vor der der Auftrag warnt, existiert
  nicht.
- **Die Asymmetrie der beiden neuen Felder ist die richtige, und der Preis ist laut statt still.**
  Optional dort, wo es viele Aufrufer gibt (Parser, vier Stellen, Vorgabe „lesbar"); **erforderlich**
  dort, wo es genau einen Erzeuger gibt (`CheckDetail`, gebaut nur von `checkDetail()` selbst —
  repo-weit gegrept, jedes andere Vorkommen ist ein Fixture in `page.test.tsx`). Ein erforderliches
  Feld kann gar keinen falschen Vorgabewert tragen. Die einzige gebrochene Stelle war deshalb
  `page.test.tsx:16` (`BASIS`), und sie brach zur **Übersetzungszeit** — der Bericht nennt den Fehler
  namentlich (`TS2741`). Das ist kein Verstoß gegen Festlegung 4, sondern ihr Sinn: nicht „nichts
  musste angefasst werden", sondern „nichts kann still falsch werden".
- **Die RSC-Fallen sind vermieden und bleiben verriegelt.** `page.tsx` importiert weiterhin nur
  `{ Alert, Col, Row }` (`:1`), kein Compound-Zugriff, kein Icon-Paket; der neue Block ist
  `Alert type="warning" showIcon={false}` (`:148-155`). Der bestehende Quelltext-Riegel
  (`page.test.tsx:471-505`) scannt genau diese Datei auf `@ant-design/icons|Table.Column|Card.Meta`,
  `"use client"` und die RSC-Naht — er greift also auch für die Zukunft.
- **Die Gegenprobe ist ernst gemeint.** `page.test.tsx:428` („meldet NICHTS für einen lesbaren Check
  mit 0 Positionen", 0 Alerts auf `BASIS`), `lesepfade/checks.test.ts:388` (legitim leer → `false`),
  `:396` (offener Check → `false`), `:401` (Altformat → `false`), plus die ~12 bestehenden
  Seitentests, die alle mit `unlesbar: false` fahren. „Warnt zu oft" ist damit auf drei Schichten
  ausgeschlossen.
- **Der E2E-Nachweis prüft die gerenderte Fassung, nicht das Prop** (`ant-alert-warning` /
  `not ant-alert-error`, `:156-158`) und schließt den 500 explizit aus (`status() === 200` plus
  „server-side exception"-Ausschluss) — das ist genau die Lücke, die Vitest hier strukturell nicht
  schließen kann.
- **Der Seed ist gegen Nachbarn abgesichert, und die Begründung stimmt nachprüfbar.** Beide
  Check-Zeilen hängen am vorhandenen `e2e-fahrzeug` und tragen `completedAt` in der Vergangenheit
  (`seed-lagerbuch.ts:216-239`). Ich habe die genannte Kopplung nachgelesen:
  `e2e/lagerbuch-helfer.spec.ts:88-100` (`letzterCheck`, `order by completed_at desc, id desc`) liest
  `ergebnis` **roh** und parst es nicht — die Zeile mit kaputtem JSON kann dort also weder gewinnen
  noch werfen; `:412-415` vergleicht nur IDs. Kein anderer Spec liest `checks` (repo-weit gegrept),
  und `/verwaltung` wird in `lagerbuch-verwaltung.spec.ts:1-90` nur auf Navigation geprüft, nicht auf
  Kennzahlen.
- **Zur Echtheit der TDD-Belege — sie halten einer inhaltlichen Gegenprobe stand.** Die roten
  Ausgaben passen jeweils exakt zum Zusicherungs**stil** der betroffenen Schicht, was man im
  Nachhinein kaum konstruiert: Schicht 1 meldet nur 3 Fehlschläge, weil die vier „NICHT unlesbar"-
  Fälle dort `toBeFalsy()` benutzen (ein fehlendes Feld ist falsy — sie *müssen* schon grün sein);
  Schicht 2 meldet **alle sechs**, weil sie dort `toBe(false)`/`toBe(true)` benutzen (`undefined`
  scheitert an beidem); Schicht 3 meldet 2 von 3, weil der dritte die Gegenprobe ist. Die Summe 23 in
  der roten Schicht-1-Ausgabe stimmt mit der Datei überein (15 alt + 8 neu). Das ist starke
  Indizienlage für „rot war wirklich vorher".
- Der Bericht schreibt seine eigenen Grenzen aus (was das Mutationsexperiment **nicht** zeigt; dass
  der Leser-Test nur Regressionsschutz und nicht der Beleg ist; der rote Lauf ohne Namen). Das ist die
  Sorte Bericht, die man prüfen kann.

### Funde

#### Critical (muss behoben werden)

Keine. Keine Warnung auf einem gültigen Zustand (`checks.ts:243` bindet sie an
`e.version === 2 && e.unlesbar === true`, und `unlesbar` entsteht nur an den drei Fehlerwegen), kein
gebrochener Aufrufer, kein RSC-Ausfall im Diff.

#### Important (sollte behoben werden)

Keine.

#### Minor (nice to have)

1. **Der Name des E2E-Gegenprobentests sagt etwas anderes als sein Fixture.**
   `e2e/lagerbuch-verwaltung.spec.ts:161` heißt „ein lesbarer Check mit **0 Positionen** bekommt KEINE
   solche Warnung", das zugehörige `e2e-check-lesbar` trägt aber **eine** Position und einen
   Artikel (`e2e/seed-lagerbuch.ts:219-232`) — der Test prüft „gefüllt und lesbar", nicht „legitim
   leer". Der geforderte Fall „lesbar" ist damit gerendert, die eigentliche Unterscheidung
   („leer ≠ kaputt") aber nur unter Vitest belegt (`page.test.tsx:428`,
   `lesepfade/checks.test.ts:388`). Der Bericht sagt das in §4a selbst; die **Testüberschrift** sagt
   es nicht, und wer sie später liest, hält die E2E-Deckung für breiter, als sie ist. Entweder
   umbenennen („ein gefüllter lesbarer Check …") oder eine dritte Seed-Zeile mit leerem gültigem V2.
   Nur **Minor**, weil die beiden Ausfallarten getrennt abgedeckt sind: „warnt auf allem" fängt die
   E2E-Gegenprobe, „warnt an `positionen.length === 0`" fangen `page.test.tsx:428` (leere Listen) und
   `lesepfade/checks.test.ts:388`. Zwei Belege, nicht einer — nur trägt einer davon die falsche
   Überschrift.

2. **Die Check-Übersicht zeigt für einen kaputten Datensatz weiterhin die ruhige Null.**
   §11.5:10332 sagt „die **Zeile** wird als ‚Ergebnis unlesbar' gekennzeichnet statt als
   ‚0 Positionen'", und `/verwaltung/checks` hat eine Spalte „Positionen"
   (`verwaltung/(arbeit)/checks/ChecksTabelle.tsx:68-72`), die für `e2e-check-unlesbar` „0" zeigt. Die
   Umsetzung hat das bewusst ausgelassen (Bericht §2), gestützt auf die zweite Spec-Stelle (`:5619`),
   die den `Alert` ausdrücklich auf `/verwaltung/checks/[id]` verortet — und auf das Overbuild-Verbot.
   Ich halte die Auslegung für vertretbar und die Entscheidung für deine, melde die Stelle aber, weil
   „Zeile" die Tabellenzeile mindestens genauso gut trifft wie die Detailseite.

3. **Die vier übrigen Leertexte der Detailtabellen widersprechen der Warnung weiterhin.** Angepasst
   wurde nur `nachfuellLeertext` (`page.tsx:200-204`); daneben stehen unverändert „Keine Positionen
   erfasst." (`CheckDetailTabellen.tsx:231`), „Keine Geräte in diesem Check." (`:253`), „Keine
   Flaschen in diesem Check." (`:264`), „Keine Verfallsangabe in diesem Check." (`:275`) — nach der
   Begründung des Umsetzenden („eine Tatsachenbehauptung, die niemand prüfen konnte") gilt für sie
   dasselbe. Klein, weil die Warnung darüber steht; inkonsequent bleibt es.

4. **Zählfehler im Bericht.** Der neue Parser-`describe` hat **8** Tests
   (`checkErgebnis.test.ts:204-269`), der Bericht nennt in §3 und §6 „7 Parser" und „16 Tests neu" —
   richtig sind 8 und 17. Bemerkenswert: die *rote Ausgabe* („3 failed | 20 passed (23)") ist mit 8
   neuen Tests konsistent und mit 7 nicht; der Fehler liegt also in der Zusammenfassung, nicht in der
   Messung. Trotzdem ein Posten, weil du dem Bericht nicht glauben sollst, wo du zählen kannst.

5. **`!roh` → zwei Gleichheitsprüfungen ändert das Verhalten für ein Laufzeit-`undefined`.** Früher
   fing `!roh` auch `undefined` als leer ab; heute liefe es in `JSON.parse(undefined)` → `catch` →
   `unlesbar()` (`checkErgebnis.ts:194-201`). Die Signatur ist `string | null` und alle vier
   Aufrufstellen reichen eine Spalte durch (nachgelesen), es gibt also keinen lebenden Pfad — der
   Vollständigkeit halber genannt.

6. **Der nicht erfasste rote Lauf** („2 failed", Bericht §6): aus dem Diff heraus halte ich
   **Gleichzeitigkeit** für die weit wahrscheinlichere Ursache. Die Vitest-Oberfläche dieser Änderung
   ist gemeinsamer-Zustand-frei — reine Funktion (`checkErgebnis`), In-Memory-Drizzle
   (`migrierteTestDb` in `lesepfade/checks.test.ts:2`), React-Element-Baum (`page.test.tsx`); **kein**
   Vitest-Test importiert `e2e/seed-lagerbuch.ts` (repo-weit gegrept, null Treffer), der Seed-Eingriff
   kann also gar nicht in einen Vitest-Lauf hineinwirken. Dass die Namen nicht erfasst wurden, ist
   dennoch ein eigener kleiner Fund: `vitest run 2>&1 | tee` hätte nichts gekostet, und ohne Namen
   bleibt die Aussage „5798 grün" um genau diesen einen Lauf herum unbelegbar statt widerlegt.

### Bewertung

**Task-Qualität:** Angenommen

**Begründung:** Die eine Sache, an der dieser Auftrag hängt — die Warnung erscheint genau dann und
nur dann — ist auf drei Schichten an der Sache belegt und gegen eine Rückkehr zu `!roh` an zwei
Stellen verriegelt; Additivität, `altFormat`-Trennung und die RSC-Naht habe ich einzeln nachgelesen
und bestätigt gefunden. Die Funde sind Beschriftung, Konsequenz und Buchhaltung, kein Verhalten.
