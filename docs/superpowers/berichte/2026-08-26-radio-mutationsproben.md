# Radio — die neun Mutationsproben über sieben Pflichtstücke (Aufgabe T6)

Planteil 5 von 5, Aufgabe **T6**. Diese Datei ist **kein Bericht über einen Bau**: in dieser
Aufgabe entsteht **kein Produktcode und kein Test**. Sie **misst**, ob die sieben Pflichtstücke
aus den Planteilen 1–4 etwas messen — jede Mutation einzeln in den Arbeitsbaum gelegt, der
zuständige Testlauf gefahren, der **Testname** notiert, der rot wurde, der Baum zurückgesetzt.

⛔ **Warum diese Datei hier liegt und nicht im SDD-Arbeitsordner:** `.gitignore:17` ignoriert
`.superpowers/`. Abnahme-Messungen, die dort stehen, sind nach dem Merge weg — die Gedächtnisnotiz
„Beleg nicht in der Kladde" hält genau diesen Fehler fest. Alles, was eine spätere Runde gegen
diesen Stand halten muss, gehört deshalb in `docs/`.

⚠️ Der Dateiname trägt den **2026-08-26** (das Plandatum von Planteil 5); **gemessen wurde am
2026-08-27**. Der Name bleibt, weil `briefs/T6.md` und der Plan ihn wörtlich vorschreiben —
dieselbe Klausel wie bei `2026-08-26-radio-betriebsablesungen.md` (G7).

**Stand des Arbeitsbaums bei jeder Probe:** Commit **`0db7130d`**, `rtk proxy git status --porcelain`
→ **leer**, `rtk proxy git diff HEAD --stat` → **leer**. Vor der ersten und nach der letzten Probe
gemessen, nicht angenommen.

---

## Die Regel, an der jede Zeile unten hängt

**Falsifikationsregel (Spec:6396-6404), wörtlich:** „Ein Pflichtstück gilt als abgenommen, wenn
**jede** in seiner Zeile genannte Mutation den Test **rot** macht. Ein Test, der eine der genannten
Mutationen überlebt, ist **vakuös** und wird gelöscht oder neu geschrieben — nicht ergänzt."

⛔ **`vakuös` ist eine gemessene Eigenschaft, kein Synonym für „hat überlebt".** Probe 5 unten ist
genau dieser Fall: die vom Plan genannte Mutation ist **verhaltensneutral**, der Test überlebt sie
und ist trotzdem **nicht** vakuös — die Mutation, die die Zusage wirklich aufhebt, macht ihn rot,
und zwar allein. Der Plan hat diese Fehlerklasse für Pflichtstück 7 selbst ausgeschrieben („ein
**intakter** Wächter wäre gelöscht oder neu geschrieben worden") und dort in **7a/7b** gespalten.

⛔ **Die Zeilennummern aus der Plantafel sind gegen einen Baum vom 26.08.2026 gemessen.** Jede
Zeile unten ist **am eigenen Stand neu gesucht**; wo sie abweicht, steht beides.

---

## Die Tafel

| # | Pflichtstück | Mutierte Datei:Zeile (eigener Stand) | Kommando | Ergebnis — der Testname, der rot wurde | Baum danach sauber? |
|---|---|---|---|---|---|
| **1** | Zeitstempel-Abbildung | `scripts/import/radio.ts:352` — `msZuDatumOptional(...)` **→** `msZuDatumOptional(...) ?? 0` *(Planangabe `:352`, **trifft**)* | `rtk pnpm vitest run scripts/import/radio.test.ts` | 🔴 **`toNeueLeihe: returned_at NULL bleibt NULL (die aktive Leihe)`** — `AssertionError: expected +0 to be null`, `scripts/import/radio.test.ts:651`. Zählzeile: **`9 failed \| 43 passed (52)`**, Exit 1 | ✅ `git checkout --` → `status --porcelain` leer |
| **2** | Code-Einlöser, DB-Recheck im Lesepfad | `src/app/m/radio/_lib/ausleihZugang.ts:181` — `if (!zeile \|\| !zeile.aktiv)` **→** `if (!zeile)` *(Planangabe `:181`, **trifft**)* | `rtk pnpm vitest run src/app/m/radio/_lib/ausleihZugang.test.ts` | 🔴 **`ohne Suite-Sitzung und mit gesperrtem Code -> grund gesperrt`** — `expected { ok: true, …(1) } to deeply equal { ok: false, grund: 'gesperrt' }`, `ausleihZugang.test.ts:355`. Zählzeile: **`3 failed \| 15 passed (18)`** | ✅ leer |
| **3** | Host-Riegel, **vier** Formen (B13) | `src/app/m/radio/_lib/host.ts:59-61` — Prädikatsform **→** direkter `prodHostsFor`-Vergleich **mit** dem „kein Prod-Host konfiguriert → durchlassen"-Zweig *(Planangabe `:52-54`, **überholt**; siehe Abweichung **A2**)* | `rtk pnpm vitest run src/app/m/radio/_lib/host.test.ts` | 🔴 **`hat KEINEN 'kein Prod-Host konfiguriert -> durchlassen'-Zweig`** — `expected true to be false`, `host.test.ts:95`. Zählzeile: **`8 failed \| 7 passed (15)`** | ✅ leer |
| **4** | Pfad-Riegel `/admin` | `src/app/m/radio/_lib/zugang.ts:188-192` — `adminGroupsFor(getModule("radio")) + .some()` **→** `isModuleAdmin(getModule("radio"), viewer.groups)` *(Planangabe `:190`, **trifft den Rumpf**)* | `rtk pnpm vitest run src/app/m/radio/_lib/zugang.test.ts` | 🔴 **`ein Viewer mit NUR dashboard-admins: false — der Suite-Admin bekommt keine Radio-Rechte`** — `expected true to be false`, `zugang.test.ts:218`. Zählzeile: **`1 failed \| 32 passed (33)`** — **einziger** Fehlschlag der Datei | ✅ leer |
| **5** | Retention-Auswahl | `src/app/m/radio/_lib/boot.ts:80` — `and(isNotNull(loans.returnedAt), lt(...))` **→** `lt(...)` *(Planangabe `:62-69`, **überholt**)* | `rtk pnpm vitest run src/app/m/radio/_lib/boot.test.ts` | 🟢 **GRÜN — `32 passed (32)`.** ⛔ **0 rot, und der Grund ist gemessen, nicht gemutmaßt** — siehe **Lauf 5-II** und Abweichung **A1** | ✅ leer |
| **5-II** | dasselbe Pflichtstück, die Mutation, die die Zusage **wirklich** aufhebt | `src/app/m/radio/_lib/boot.ts:80` — **→** `or(isNull(loans.returnedAt), lt(loans.returnedAt, grenze))` | `rtk pnpm vitest run src/app/m/radio/_lib/boot.test.ts` | 🔴 **`eine AKTIVE Leihe bleibt, egal wie alt ihr borrowed_at ist`** — `expected 1 to be +0`, `boot.test.ts:153`. Zählzeile: **`1 failed \| 31 passed (32)`** — **einziger** Fehlschlag. ⛔ **Damit ist der Test nicht vakuös, und das Pflichtstück ist falsifiziert** | ✅ leer |
| **6a** | Lesen während offenem Schreibvorgang — **Produktmutation** | `src/core/db/index.ts:18` — `sqlite.pragma("journal_mode = WAL");` **gestrichen** *(Planangabe `:18-20`, **trifft**)* | `rtk pnpm vitest run src/app/m/radio/_db/leihen.test.ts` | 🔴 **`liest die Geraeteliste waehrend eines offenen Schreibvorgangs`** — Zählzeile: **`1 failed \| 51 passed (52)`**, **einziger** Fehlschlag. ⚠️ Gemeldet wird `SqliteError: cannot rollback - no transaction is active` (`leihen.test.ts:982`), **nicht** die auslösende Pragma-Zusicherung — siehe Bedenken **B2** | ✅ leer |
| **6b** | dasselbe — **Konstruktionsprobe**, kein Produktcode | `src/app/m/radio/_db/leihen.test.ts:951-953`, `:957`, `:984` — die **zwei** Handles auf **eines** zusammengezogen | `rtk pnpm vitest run src/app/m/radio/_db/leihen.test.ts` | 🔴 **`liest die Geraeteliste waehrend eines offenen Schreibvorgangs`** — `expected 'ON_LOAN' to be 'AVAILABLE'`, `leihen.test.ts:979`. Zählzeile: **`1 failed \| 51 passed (52)`**. ⛔ **Der Plan sagt „bleibt grün" — gemessen ist rot.** Abweichung **A3**; die Schlussfolgerung trägt trotzdem, siehe **6b-II** | ✅ leer |
| **6b-II** | dieselbe Konstruktionsprobe, **eine Bearbeitung weiter** | zusätzlich `leihen.test.ts:979` — `toBe("AVAILABLE")` **→** `toBe("ON_LOAN")` | `rtk pnpm vitest run src/app/m/radio/_db/leihen.test.ts` | 🟢 **GRÜN — `52 passed (52)`.** ⛔ **DAS ist die vakuöse Fassung, die der Plan meint**, und sie liegt **eine** naheliegende Bearbeitung von 6b entfernt. Sie misst über **eine** Verbindung nichts Nebenläufiges mehr | ✅ leer |
| **7a** | Guard-Scan der Actions — **der Scan** | `src/app/m/radio/_actions/ausleihe.ts:342-346` — `const schreibend = await requireAusleihSchreibend(getDb()); if (!schreibend.ok) return;` **gestrichen**, `AUSNAHMEN` **unberührt** | `rtk pnpm vitest run src/app/m/radio/_actions/guards.test.ts` | 🔴 **`keine Action ohne Riegel, keine Ausnahme ohne Host-Riegel`** — `expected [ Array(1) ] to deeply equal []`, Inhalt `"ausleihe.ts#listeAktualisieren: weder requireRadioAdmin( noch requireAusleihSchreibend("`, `guards.test.ts:687`. Zählzeile: **`1 failed \| 5 passed (6)`** | ✅ leer |
| **7b** | dasselbe Pflichtstück — **die Zählzusage** | `src/app/m/radio/_actions/guards.test.ts:56-60` — **vierter**, erfundener Eintrag `"codes.ts#gibtEsNicht"` *(Planangabe `:56`, **trifft**)* | `rtk pnpm vitest run src/app/m/radio/_actions/guards.test.ts` | 🔴 **`die Ausnahmeliste hat GENAU DREI Eintraege`** — `eine vierte Ausnahme ist eine ENTSCHEIDUNG, kein Diff: expected 4 to be 3`, `guards.test.ts:514`. Zählzeile: **`1 failed \| 5 passed (6)`** | ✅ leer |

**Neun Proben, gezählt: 1, 2, 3, 4, 5, 6a, 6b, 7a, 7b.** Die Zeilen **5-II** und **6b-II** sind
**zweite Läufe derselben Probe**, keine zehnte und elfte — die Berichtsform dafür schreibt
`briefs/T6.md` Schritt 3 vor („beide Läufe eintragen").

---

## Die Spaltung von Pflichtstück 7 ist am eigenen Stand bestätigt

Der Plan spaltet Probe 7 mit der Begründung, `die Ausnahmeliste hat GENAU DREI Eintraege` prüfe eine
**Konstante** und **nie** den Bestand der Actions — eine Guard-Mutation ließe sie grün, und die
frühere Planfassung hätte einen **intakten** Wächter als vakuös verbucht.

⛔ **Gemessen, nicht übernommen:** in Lauf **7a** ist `die Ausnahmeliste hat GENAU DREI Eintraege`
**grün geblieben** — die Zählzeile weist genau **einen** Fehlschlag aus, und das ist `:549`. In Lauf
**7b** ist es umgekehrt: `keine Action ohne Riegel …` bleibt grün, rot wird `:499`. Die zwei
Zusicherungen sind gemessen **disjunkt**, und die Spaltung war richtig.

---

## Abweichungen vom Plan

### A1 — Probe 5: die vom Plan genannte Mutation ist **verhaltensneutral**; der Test ist trotzdem nicht vakuös

**Was der Plan erwartet** (`…plan5-betrieb-tests.md`, Mutationstafel, Zeile 5): `isNotNull(...)`
streichen → `eine AKTIVE Leihe bleibt, egal wie alt ihr borrowed_at ist` wird rot.

**Was gemessen ist:** der Lauf bleibt **grün**, `32 passed (32)`.

**Der Grund, und er ist Mechanik, keine Meinung.** Die Klausel lautet nach der Mutation
`lt(loans.returnedAt, grenze)`. Eine aktive Leihe trägt `returned_at IS NULL`; in SQLs dreiwertiger
Logik ist `NULL < grenze` **NULL** und damit **nicht wahr** — die Zeile fällt mit **und ohne**
`isNotNull` aus der Löschmenge. Die zwei Fassungen sind für **jede** Eingabe verhaltensgleich.
⛔ **Kein Verhaltenstest kann sie unterscheiden**; nur ein Quelltext-Scan könnte es, und der wäre
genau das „ergänzt", das die Falsifikationsregel verbietet.

**Warum Schritt 3 hier NICHT feuert.** Schritt 3 setzt voraus, dass der überlebende Test **vakuös**
ist. Das ist eine **messbare** Eigenschaft, und sie ist hier **widerlegt**: Lauf **5-II** hebt die
Zusage wirklich auf (`or(isNull(...), lt(...))` — der „aufräumen, was zu lange draußen ist"-Zweig,
den `boot.test.ts:140-141` namentlich verbietet) und macht **genau** den benannten Test rot, als
**einzigen** Fehlschlag der Datei. Ein Test, der an der Mutation stirbt, die die Zusage entfernt,
ist kein vakuöser Test. ⛔ **`boot.test.ts:136` wird deshalb NICHT umgeschrieben und NICHT
gelöscht** — das wäre die Fehlerform, die der Plan für 7a selbst ausgeschrieben hat.

**Das Pflichtstück ist damit falsifiziert** — durch 5-II, nicht durch die Planmutation. Was falsch
ist, ist die **Mutationsangabe des Plans**, nicht der Test. Hausform der Feststellung: `R-G1-1`,
`R-G2-1` im Ledger.

### A2 — Probe 3: ein *bloßer* `prodHostsFor`-Vergleich lässt den benannten Test GRÜN

Der Plan nennt als Mutation „durch einen direkten `prodHostsFor`-Vergleich ersetzen". ⛔ **Wörtlich
genommen trifft sie den benannten Test nicht.** Gegenprobe gefahren, mit
`return hosts.includes(resolveHost(headers));` **ohne** den Durchlass-Zweig:
Zählzeile **`8 failed | 7 passed (15)`** — rot werden `trifft den Dev-Host OHNE jede Env`,
`ignoriert einen Port`, `laesst den eigenen Host durch` und fünf weitere;
⛔ **`hat KEINEN 'kein Prod-Host konfiguriert -> durchlassen'-Zweig` bleibt GRÜN.** Das ist exakt
die Falle, vor der der Planbrief warnt: „eine falsch getroffene Zeile macht einen falschen Test rot
und zählt als bestanden."

Gefahren wurde deshalb die Fassung, die der Quelltext selbst als die verbotene benennt
(`host.ts:53-57`: „Er wäre die Sperre, die sich selbst abschaltet"): der direkte Vergleich **plus**
`if (hosts.length === 0) return true;`. Sie macht den benannten Test rot. **Beide Läufe stehen
oben bzw. hier**; die gefahrene Probe ist die zweite.

⚠️ **Nebenbefund, gemessen:** `host.ts enthaelt keinen Zweig, der bei leerem prodHostsFor
durchlaesst` (`host.test.ts:170`) wird von **beiden** Fassungen rot — er bindet an den
Funktionsnamen (`not.toMatch(/\bprodHostsFor\s*\(/)`, `:180`) und ist damit ein zweiter,
**unabhängiger** Wächter über dieselbe Zusage.

### A3 — Probe 6b: die einhändige Fassung bleibt **nicht** grün

Der Plan schreibt für 6b: „die einhändige Fassung bleibt **grün** — das macht sie **vakuös**".
⛔ **Gemessen ist sie rot** (`expected 'ON_LOAN' to be 'AVAILABLE'`, `leihen.test.ts:979`): auf
**einer** Verbindung ist der noch nicht bestätigte `INSERT` für den Leser sichtbar, weil er
derselbe Verbindungskontext ist.

⛔ **Die Schlussfolgerung des Plans trägt trotzdem, und sie wird durch 6b-II sogar schärfer.** Was
rot wird, ist die **Isolations**hälfte (`:979`), nicht die Nebenläufigkeitshälfte — und wer diesen
Rotstand auf die naheliegende Art beruhigt (`toBe("ON_LOAN")`), hat einen Lauf mit **`52 passed
(52)`** und einen Test, der über eine einzige Verbindung **nichts** Nebenläufiges mehr misst:
`geraeteMitLeihstand` kann an einem offenen Schreibvorgang gar nicht mehr hängenbleiben, weil es
keinen zweiten Leser gibt. ⛔ **Zwei Handles bleiben Pflicht** — der Beweis liegt aber bei
**6b-II**, nicht bei der Farbe von 6b.

⚠️ **Was 6b-II NICHT zeigt:** die erste Zusicherung des Falles (`pragma("journal_mode")`, `:957`)
liest die einhändige Fassung weiterhin und bliebe damit für Probe **6a** wirksam. Vakuös wird durch
das Zusammenziehen die **Wirk**aussage über WAL, nicht die Ablesung des Pragma-Werts.

### A4 — `⬜ T-L4` fragt nach „**acht**" Mutationen; es sind **neun**

`…plan5-betrieb-tests.md:420` (und wortgleich `briefs/KOPF.md:420`) führt T-L4 als „Welcher Testname
bei welcher der **acht** Mutationen genau rot wird". Derselbe Plan zählt an anderer Stelle
ausdrücklich **neun** („⛔ **NEUN Proben über sieben Pflichtstücke** (vorher: acht)"), weil
Pflichtstück 7 in 7a/7b zerfällt. ⛔ **Die Zahl in der T-L4-Zeile ist ein Rest der früheren
Fassung.** Hier benannt, **nicht** überschrieben — dieselbe Klausel wie `R-G1-1`: eine Abweichung
wird belegt und geführt, nicht in die Vorlage zurückgeschrieben.

---

## ⬜ T-L4 — abgelesen

**Die Frage:** welcher Testname bei welcher Mutation genau rot wird.
**Die Antwort:** die Spalte „Ergebnis" der Tafel oben — **neun** Proben, je mit Testname,
Fehlermeldung, `datei:zeile` der Zusicherung und der Zählzeile des Laufs.

| Probe | Testname, der rot wurde |
|---|---|
| 1 | `toNeueLeihe: returned_at NULL bleibt NULL (die aktive Leihe)` |
| 2 | `ohne Suite-Sitzung und mit gesperrtem Code -> grund gesperrt` |
| 3 | `hat KEINEN 'kein Prod-Host konfiguriert -> durchlassen'-Zweig` |
| 4 | `ein Viewer mit NUR dashboard-admins: false — der Suite-Admin bekommt keine Radio-Rechte` |
| 5 | ⛔ **keiner** bei der Planmutation (verhaltensneutral); bei 5-II: `eine AKTIVE Leihe bleibt, egal wie alt ihr borrowed_at ist` |
| 6a | `liest die Geraeteliste waehrend eines offenen Schreibvorgangs` |
| 6b | `liest die Geraeteliste waehrend eines offenen Schreibvorgangs` (Isolationshälfte; Plan erwartete grün) |
| 7a | `keine Action ohne Riegel, keine Ausnahme ohne Host-Riegel` |
| 7b | `die Ausnahmeliste hat GENAU DREI Eintraege` |

⚠️ **Das Leerstellenverzeichnis des Plans (`:3050`) trägt für T-L4 bereits `✅`** — es ist als
Zustand *am Ende* von Planteil 5 geschrieben. Es ist damit **nichts umzustellen**; abgelesen wird
die Leerstelle **durch diese Datei**. Die Zahl „acht" in `:420` bleibt als Abweichung **A4** stehen.

---

## Erwartete Nebenwirkungen — benannt, damit sie niemand jagt

Eine Mutation, die fünf fremde Dateien rot macht, verdeckt die Frage, ob **der genannte** Fall rot
wird. Deshalb lief je Probe **nur** der zuständige Testlauf. Was innerhalb dieses Laufs (oder in
einem eigens nachgemessenen Nachbarn) **zusätzlich** rot wurde, steht hier — ⛔ **erwartet und kein
Befund**, dieselbe Lesart, die `VORABSCAN.md` Fund **F10** für die T5-Sonde S-T5d festgehalten hat:

| Probe | Zusätzlich rot | gemessen? |
|---|---|---|
| 1 | acht weitere Fälle derselben Datei, sämtlich über `TypeError: value.getTime is not a function` aus dem drizzle-Binding (`?? 0` ist an dieser Spalte typwidrig) | ✅ im selben Lauf |
| 2 | `der Recheck laeuft auch auf dem reinen LESEpfad`, `gesperrter Code -> Redirect auf /abmelden?grund=gesperrt` | ✅ im selben Lauf |
| 3 | sieben weitere Fälle von `host.test.ts`, darunter der unabhängige Quelltext-Wächter `host.ts enthaelt keinen Zweig, der bei leerem prodHostsFor durchlaesst` | ✅ im selben Lauf |
| 4 | `riegel.test.ts` → `Pflicht 17 — dieses Modul nimmt von der Suite-Admin-Abkuerzung Abstand > findet keinen der vier core-Riegel` (`1 failed \| 24 passed (25)`) | ✅ **eigens nachgemessen**, statt vermutet |
| 7a | **keine** — `riegel.test.ts` bleibt bei `25 passed (25)` | ✅ **eigens nachgemessen** |

---

## Bedenken

**B1 — `boot.ts:74` behauptet mehr, als die Zeile darunter liefert.** Der Kommentar sagt „AKTIVE
LEIHEN BLEIBEN, IMMER: `isNotNull(returnedAt)` ist die halbe Zusage von §2.7.4." Gemessen (A1) ist
`isNotNull` in **dieser** Klausel verhaltensneutral: die Zusage trägt die dreiwertige Logik, nicht
das Prädikat. Ob `isNotNull` als Deutlichkeit und Indexgriff bleiben soll oder der Kommentar seine
Zusage kleiner fassen muss, ist eine **Entscheidung** — ⛔ und T6 schreibt keinen Produktcode. Hier
benannt, nicht gefällt.

**B2 — der `finally`-Block von `leihen.test.ts:981-984` verdeckt die eigentliche Fehlermeldung.**
In Probe 6a scheitert die Pragma-Zusicherung `:957`; weil `BEGIN IMMEDIATE` dadurch nie läuft, wirft
das `ROLLBACK` im `finally` seinerseits, und **diese** Meldung (`cannot rollback - no transaction is
active`) ersetzt die AssertionError im Bericht. ⛔ **Der Fall wird richtig rot** — aber wer nur die
Meldung liest, sucht an der falschen Stelle. Die Bauform-Auflage 3 im Dateikopf (`:43-49`) sagt
ausdrücklich „fällt genau diese Zeile"; gemeldet wird eine andere.

**B3 — 6b-II liegt eine Bearbeitung von der vakuösen Fassung entfernt.** Die einhändige Fassung ist
nicht still grün, sie ist **laut rot** — und der naheliegende Griff, die eine Zusicherung an das
anzupassen, was eine Verbindung sieht, führt zu `52 passed (52)` und einem Fall, der seinen eigenen
Namen nicht mehr einlöst. Die drei Bauform-Auflagen im Dateikopf (`leihen.test.ts:32-59`) sind
damit **die** Sicherung dieses Falles; ein Scan über sie existiert nicht.

**B4 — Probe 3 ist gegen ihre eigene Planangabe nicht selbsttragend.** Wer die Planzeile wörtlich
nimmt, misst einen grünen Wächter und notiert eine bestandene Probe (A2). Die tragende
Mutationsangabe steht **im Quelltext** (`host.ts:53-57`), nicht in der Plantafel.

---

## Das Tor nach den Proben — die vier Zahlen, abgelesen

Gefahren in der vorgeschriebenen Reihenfolge, **Build und Playwright zuletzt** (`briefs/T6.md`
Schritt 5). Arbeitsbaum dabei: Commit **`0db7130d`**, `git diff HEAD --stat` **leer** — die einzige
neue Datei ist dieser Bericht (untracked, `docs/`).

| Lauf | Kommando | Abgelesene Ausgabe | Exit |
|---|---|---|---|
| typecheck | `rtk pnpm typecheck` | `TypeScript: No errors found` | **0** |
| lint | `rtk pnpm lint` | `✖ 14 problems (0 errors, 14 warnings)` — ⛔ **0 Fehler**; alle 14 Warnungen sind Bestand (`_weg`, `_issi`, `_now`, `impl`, `PLAN`, `expect`) | **0** |
| vitest | `rtk pnpm vitest run` | **`Test Files 512 passed (512)`** · **`Tests 9101 passed (9101)`** | **0** |
| build | `rtk pnpm build` | durchgelaufen; `/m/radio/sw.js` und die achtzehn übrigen radio-Routen stehen in der Routentafel | **0** |
| playwright | `rtk pnpm exec playwright test` | **`2 failed`** · **`367 passed (13.2m)`** | **1** |

⛔ **Die zwei Playwright-Fehlschläge sind NICHT neu, und das ist gemessen, nicht behauptet.**
Es sind `e2e/aufgaben.spec.ts:1048` („Ziehbereich: die Knopfstrecke bleibt bedienbar …") und
`:1594` („Tastaturbedienung: eine Aufgabe laesst sich ohne Maus verschieben …") — dieselben zwei,
die **T3** (`352 passed · 3 failed`) und **T4** (`363 passed · 2 failed`) vor dieser Aufgabe
gemessen und als eigentümerlos geführt haben. Drei Belege:

1. **Die Beiseitelege-Gegenprobe ist hier trivial und trotzdem gefahren:** T6 hat **keine** Zeile
   Produktcode und **keinen** Test geändert. `rtk proxy git diff HEAD --stat` → **leer**, HEAD
   **`0db7130d`**. Es gibt nichts von dieser Aufgabe, das beiseitezulegen wäre.
2. **Isolationslauf ohne jede radio-Spec:** `rtk proxy pnpm exec playwright test e2e/aufgaben.spec.ts`
   → **`2 failed · 84 passed (3.7m)`**, dieselben zwei Fälle. Sie hängen nicht an der übrigen Suite.
3. **Die Zählung geht ohne Rest auf.** T4 maß `363 passed + 2 failed` = **365** Blöcke. Jetzt:
   `367 passed + 2 failed` = **369**. Differenz **4** — genau die vier Ergänzungsfälle, die **T5**
   in `e2e/radio-verwaltung.spec.ts` angelegt hat (Fälle 7, 8, 9, 12; T5 maß dort `21 passed`).

⚠️ Die Ledger-Grundlinie nennt „playwright **350 passed**". Der Zuwachs auf 369 Blöcke ist das
Werk von T2–T5 (die e2e-Fläche dieses Planteils), kein Drift — die Rechnung oben schließt ihn.

---

## Was diese Aufgabe NICHT geliefert hat, benannt

⛔ **Keine neue Mutationssonde.** Die Hausauflage verlangt für jeden **neuen** Test die Sonde auf
seiner tragenden Zeile. T6 legt **keinen** Test und **keine** tragende Zeile an — die neun Proben
oben **sind** die Sonden dieser Aufgabe, nur über fremde Pflichtstücke. Dieselbe Klausel wie in
Ruling **R-T5-1, zweiter Teil** („keine NEUE Mutationssonde, weil kein neuer Test und keine neue
tragende Zeile entstand").

⛔ **Kein Produktcode und keine Testdatei geändert** — auch nicht die, die eine Probe hätte
„reparieren" wollen. Die Begründung dafür steht vollständig in **A1**.
