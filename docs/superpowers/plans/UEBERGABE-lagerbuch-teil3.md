# Übergabe aus Teil 3 (Fachlogik und Grenzen) an die Teile 4 bis 6

Entstanden am 05.08.2026 beim Bau von Teil 3 (`2026-08-03-lagerbuch-modul-teil3.md`, 34 Tasks,
jeder einzeln reviewt, dazu ein Whole-Branch-Review und eine Fix-Welle). **Alles hier ist im Bau
aufgelaufen und steht in keinem der sechs Plandokumente** — deshalb dieses Blatt, wie schon
`UEBERGABE-lagerbuch-teil2.md`.

Wer einen der Teile 4 bis 6 beginnt, liest **beide** Übergaben. Die aus Teil 2 gilt unverändert
weiter; insbesondere ihr Punkt 1 (die Reset-Haken der `console.warn`-Dedup-Speicher) und ihr
Punkt 3b (der Dev-Login verwirft absolute `callbackUrl`-Werte, `src/components/login-form.tsx:220`)
sind **nicht** erledigt. Punkt 3a ist erledigt: `playwright.config.ts` setzt seit T60 die
`LAGERBUCH_*`-Variablen.

Reihenfolge nach Dringlichkeit.

---

## 1. ⚠️ Die Auflage, die den Start der GANZEN Suite betrifft

**Sobald `SUITE_HOST_LAGERBUCH` gesetzt ist, wo die App bootet, werden Boot-Prüfung 4
(`LAGERBUCH_HELFER_SITZUNG_SECRET`) und Prüfung 5 (`SUITE_ADMIN_GROUP_LAGERBUCH`) zu harten
Startbedingungen der ganzen Suite.** Fehlt eine davon, bricht `next dev` bzw. der Container ab —
portal, qr, feedback und files inklusive.

In der E2E-Umgebung ist das gelöst: `e2e/helpers/lagerbuch.ts#LAGERBUCH_ENV` setzt alle drei
zusammen, und `e2e/e2eEnv.test.ts` bewacht seit der Fix-Welle Namen **und** Werttypen der neun
Zeilen. **Für den Cutover gilt dasselbe:** die drei Zeilen gehören gemeinsam in die `.env`, nicht
einzeln.

Nebenbefund, der erklärt, warum das lange unsichtbar war: `pnpm build` läuft **ohne**
`SUITE_HOST_LAGERBUCH`, das Gate steht dort also aus.

---

## 2. ⚠️ Was Teil 5 an der Bestellseite fehlt — ein Lesepfad, den niemand baut

`_lib/lesepfade/bestellung.ts#wareOffenbarDa` ist über die exportierten Funktionen **strukturell
nie `true`**: `bestellvorschlag` filtert exklusiv auf „unter Mindestbestand", was „wieder gedeckt"
per Definition ausschließt.

Die Auflage aus §5.5 („die Seite zeigt **beide** Mengen: den Vorschlag **und** die bestellten
Artikel, die schon wieder gedeckt sind") hat damit **keinen exportierten Aufruf für die zweite
Menge**. Teil 5 braucht dafür eine zweite Funktion oder einen anderen Weg.

⚠️ **Sonst entsteht dort ein Lesepfad, den niemand baut, weil alle annehmen, er existiere schon.**
Umsetzer und Reviewer haben das unabhängig voneinander gefunden.

---

## 3. ⚠️ Zwei Auflagen an Teil 5 aus dem Vorlagen-Sync

**a) Das Vorab-Auflösen-Muster der Alt-Anwendung beibehalten.**
`_db/template-sync.test.ts` benutzt `defer_foreign_keys=ON`, um Löschung und Sync in **einer**
Transaktion zu fahren. Das ist für den DB-Endzustand richtig — aber gegen
`lagerbuch/src/actions/templates.ts` geprüft braucht **kein** Produktionspfad diesen Pragma: jede
echte Löschung von `template_positionen` löst referenzierende `soll_positionen` **vorher** auf
(`templatePositionEntfernen`, `loeseFahrzeugVonTemplate`), und der einzige echte Waisen-Erzeuger
(`fahrzeugTemplateZuweisen`) ist FK-konfliktfrei.

**Teil 5 darf also nicht auf „Löschen + Sync in einer `defer_foreign_keys`-Transaktion" umsteigen.**
Der Test kann etwas, was die Produktion nicht können soll.

**b) `linkedByTp` verträgt keine Doppelverknüpfung.**
`_lib/schreibpfade/templateSync.ts:293-294` ist eine `Map`, keyed by `templatePositionId`. Gäbe es
zwei `soll_positionen`-Zeilen desselben Fahrzeugs mit derselben Verknüpfung, wäre die ältere für
beide Schleifen **unsichtbar** — und **kein Unique-Index verhindert das**.

Über die Pfade von Teil 3 ist dieser Zustand nicht erzeugbar (Regel 1 legt je `templatePositionId`
höchstens eine Zeile an, Regel 4 setzt nur auf `null`). Der einzige plausible Erzeuger ist
**„Vorlage aus Fahrzeug"** (`templates.ts:190-204`) — dort als **Important** behandeln, nicht als
Randnotiz.

---

## 4. Ein öffentlicher Typ hat sich geändert: `druckBar` ist jetzt nullbar

`CheckFlascheDetail.druckBar` ist seit der Fix-Welle **`number | null`** statt `number`.

Vorher las `checks.ts` eine fehlende Messung als `0 bar` → Ampel rot → **Fehlalarm** in
`flaschenAuffaellig`, statt „nicht bewertbar" zu melden. Dieselbe Silent-Fallback-Klasse wie
`?? 200`, nur in die andere Richtung.

**Teil 5 muss den Null-Fall anzeigen** („nicht gemessen"), sonst steht dort ein leeres Feld ohne
Erklärung. Heute hat der Typ keinen Konsumenten, weil `_actions/` leer ist und es keine Oberfläche
gibt — der Bruch fällt also erst dort auf.

---

## 5. §5.14.4 „id-Tiebreaker überall" — eine Stelle fehlt noch, und sie liegt in Teil 5

Der Abnahmekatalog (T61-Brief, Zeile 122) verlangt den `id`-Tiebreaker für T45, T46, T49, T51 und
T52. **Gebaut ist er überall dort** — bei T51 und T52 erst nach einem Review-Befund, weil er jeweils
in einer **JS-Verdichtung** fehlte, während die SQL-Sortierung daneben ihn schon hatte.

**Offen bleibt die Anzeige:** `_lib/lesepfade/artikel.ts:65-67,117` sortiert `naechsteCharge` und
die Chargenliste nur nach `verfall`, **ohne** den FEFO-Tiebreak `createdAt → chargeId` aus §5.3.1.
Das ist plan-vorgegeben (byte-gleich zum Brief-Referenzcode) und heute ohne Gleichstands-Fixture
nicht auslösbar — aber es ist die **einzige** Stelle, an der Anzeige und Schreibweg auseinandergehen
können: `fefoVerteilung` sortiert dreistufig, die Anzeige einstufig.

**Teil 5 baut die Anzeige. Dort gehört die Entscheidung hin.**

Merke für alle drei Teile: `ts` und `createdAt` stehen in **Sekunden**. Zwei Vorgänge einer
Sammel-Prüfsitzung in derselben Sekunde sind realistisch, kein Exotenfall — bei T51 hätte die Lücke
dazu geführt, dass die Geräteübersicht „letzte Kontrolle bestanden" zeigt, während die oberste
Logbuchzeile derselben Sekunde „nicht bestanden" ausweist. Auf einem Medizinprodukte-Nachweis.

---

## 6. Was Teil 6 am E2E-Harness vorfindet — und nicht wieder einreißen darf

- **Drei Token-Codes, drei Flows, drei eigene Artikel.** `e2e/seed-lagerbuch.ts` legt je Flow
  (Helfer, Check, Geräte) einen **eigenen** Artikel an. Vorher teilten sich alle drei einen —
  Playwright fährt alle Specs in **einem** Worker gegen **eine** SQLite-Datei, und ein Check hätte
  ins Journal des Helfer-Flows gebucht.
  ⚠️ **Wer in Teil 6 eine Check-Spec schreibt, darf nicht wieder auf `e2e-artikel` zeigen.** Der
  Kommentar an `artikelMitBestand` sagt warum.
- **Kein dritter Host.** `feedback.localtest.me:3100` ist der zweite und existiert seit Bestand
  (H8). Er ist zugleich die schärfere Probe: ein echtes Modul, kein Platzhalter.
- **Der Seed ist idempotent gegen Wiederholung**, nicht gegen **geänderte** Fixture-Werte bei
  wiederverwendetem `DATA_DIR`. Im Playwright-Pfad ist das durch `rm -rf ./.data/e2e` maskiert; beim
  manuellen Debuggen nicht.
- **Der `e.message`-Quelltext-Scan** (§11.2, §12.6 Punkt 5) steht weiterhin aus und gehört Teil 6.

---

## 7. Eine Fernwirkung auf eine fremde Spec, die kein Gate zeigt

`e2e/login-dev-gruppen.spec.ts` begründet ihre Zusicherung damit, `lagerbuch_nutzer` stehe „fest in
der Registry" — ein env-abhängiger Beleg wäre „grün hier, rot auf einem Server mit anders benannter
Betreibergruppe".

Seit T60 stimmt das nicht mehr: `devGroupChoices` liest über `adminGroupsFor(mod, env)`, also
**env-first**, und `LAGERBUCH_ENV` setzt `SUITE_ADMIN_GROUP_LAGERBUCH`. Der Beleg kommt in E2E
jetzt aus `playwright.config.ts`. **Grün bleibt er nur, weil `LAGERBUCH_ADMIN_GRUPPE` zufällig
gleich dem Registry-Vorgabewert ist.**

Der Kommentar dort ist inzwischen korrigiert, und `e2e/e2eEnv.test.ts` bewacht die Gleichheit —
bricht sie, wird er rot, **bevor** die fremde Spec es tut. Die Fernwirkung selbst bleibt aber
bestehen und gehört gewusst.

---

## 8. Drei Verfahrensregeln, die sich in Teil 3 teuer erkauft haben

**Dreizehn** Tasks hatten Testkörper, die grün blieben, **ohne ihre Zusage zu tragen** — fast immer
wörtlich aus dem Plan übernommen. Das Whole-Branch-Review fand **zehn weitere**, die niemand bemerkt
hatte. Die Ursache ist in gut der Hälfte der Fälle dieselbe: **eine Fixture, deren Sortier- oder
Unterscheidungsschlüssel alle in dieselbe Richtung zeigen.**

Die Ausprägungen, jede mindestens einmal real eingetreten:

1. Die **Einfügereihenfolge** fällt mit der Sollreihenfolge zusammen → eine Sortierung ist
   ersatzlos entfernbar, ohne dass ein Test rot wird (T30, T46, T47, T48, T53, T54).
2. Die Fixture-**Namen** sind alphabetisch mit der geprüften Ordnung gleichgerichtet — bei T54 war
   der DB-Determinismustest dadurch eine echte **Teilmenge** des Unit-Tests, obwohl die Abnahme
   ausdrücklich „verschiedene Fälle" verlangt.
3. Die geforderte **Menge** liegt unter **allen** in Frage kommenden Restmengen → ein Prädikat ist
   wirkungslos, und der als „⚠️ DIE ZEILE, UM DIE ES GEHT" ausgezeichnete Test läuft mit und ohne
   die Regel identisch grün (T54).
4. **Vitest behandelt bei `toEqual` eine Eigenschaft mit Wert `undefined` wie einen fehlenden
   Schlüssel.** Für „der Schlüssel fehlt" braucht es `toStrictEqual` oder
   `expect("x" in obj).toBe(false)`, für „die Map hat keinen Eintrag" ein `has()` (T43).
5. Zwei Rechenwege liefern mit der Fixture **zufällig** dieselbe Zahl (T49).
6. Die **Erwartungswerte des Plans** sind rechnerisch falsch — in drei von drei nachgerechneten
   Fällen (T45, T47, T52). Nachrechnen, die **Erwartung** korrigieren, nicht die Regel.

**Daraus die drei Regeln:**

- **Frage bei jeder Zusicherung: bliebe sie grün, wenn ich genau die Regel entfernte, die sie
  zusichern soll?** Und **belege es** durch eine gefahrene Mutation, nicht durch Erzählen.
- **Schreibe lange Testausgaben in eine Datei und zitiere daraus.** Bei T57 war eine berichtete Zahl
  aus einer per `tail` gekürzten Ausgabe **geschätzt** — das kostete eine ganze Fix-Runde, und die
  Zahl war falsch.
- **Wenn zwei Tests dieselbe Zusage tragen sollen, muss die Probe zeigen, WELCHER WELCHEN Fall
  allein hält.** Sonst ist der zweite eine Kopie, die als Absicherung gelesen wird.

Dazu eine vierte, aus der Abnahme: **Zeitzonen-Stichproben brauchen ein negatives Vorzeichen.** Die
drei Zonen des Plans (Berlin +02, UTC ±00, Kiritimati +14) haben alle Offset ≥ 0; ein
`-0`/`+0`-Artefakt — die Klasse, die bei T35 tatsächlich auftrat — wäre darunter unsichtbar
geblieben. T61 ist deshalb fünf Zonen gefahren.

---

## 9. Eine Entscheidung, die der Betreiber ratifizieren sollte

`_lib/artikelFilter.ts:198,201` faltet über **`falte()`** aus `_lib/suche.ts` statt über ein inline
`.toLowerCase()`, wie der Task-Brief es abdruckte. Die Anweisung kam vom Koordinator, nicht vom
Umsetzer.

**Das Verhalten ist heute byte-identisch** (`suche.ts:20` *ist* `s.toLowerCase()`). Zwei Reviewer
haben unabhängig votiert, sie zu ratifizieren: die Alternative legte eine **zweite**
Kleinschreibungsstelle in einem Modul an, dessen §5.13.2-Prämisse wörtlich „eine Faltung, ein Ort"
lautet, und der Artikelfilter hat keine SQL-Hälfte, also entsteht keine Asymmetrie.

⚠️ **Kein Netz sichert die Bindung.** Empirisch belegt: ein Rückfall auf `.toLowerCase()` bliebe
grün. Falls die Entscheidung ratifiziert wird, gehört ein Quelltext-Scan in die **Teil-4-Erweiterung
von `_lib/bauform.test.ts`** — dort wird die Datei ohnehin angefasst.

---

## 10. Zwei kleine Dinge, die aktenkundig gehören

- **`_lib/lesepfade/artikel.ts:22` verweist irreführend.** Die Fundstellenangabe wurde von
  `lagerbuch/src/lib/domain/bestand.ts:22-24` (Alt-App, dort steht die Phantombestand-Warnung) auf
  `_lib/domain/bestand.ts:22-24` verkürzt; dort stehen in der **neuen** Datei die Zeilen von
  `export function bestand(rows)` — ausgerechnet die Summation **ohne** Lagerortfilter. Wer der
  Referenz folgt, landet beim Gegenteil der Warnung.
- **Der `.limit()`-Deckel im Artikel-Verlauf ist von keinem Vitest bewacht.** Seine Entfernung
  sähe kein Test; dafür bräuchte es einen Quelltext-Scan oder eine Zählung abgesetzter Zeilen.
  Notiert, damit er nicht als „getestet" durchgeht.
