# Modul `lagerbuch` — Implementierungsplan, Teil 6: Artefakte, Ausgaben, Abnahme

> **Für agentische Umsetzer:** PFLICHT-SUB-SKILL `superpowers:subagent-driven-development` (empfohlen)
> oder `superpowers:executing-plans`. Die Tasks sind auf parallele Ausführung geschnitten.
> **Innerhalb einer Wellenstufe dürfen alle genannten Tasks gleichzeitig laufen; über Stufengrenzen
> hinweg nicht.** Die Gates (§6) laufen am Ende **jeder Stufe**.
>
> Jeder Task ist TDD: erst der Test, dann der Code. **Ausgenommen sind die als „Abnahme" markierten
> Schritte** (T172–T176): sie prüfen zusammengesetztes Verhalten, das zum Zeitpunkt ihrer Entstehung
> schon gebaut ist. Sie sind von Anfang an grün, und das ist **kein** Mangel; statt „Rot, weil …"
> nennen sie die **Mutation**, die sie fangen.

**Spec:** `docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md` (11.036 Zeilen, verbindlich).
Dieser Plan setzt **§8** (Zeilen 9018–9497), **§9** (9498–9864), **§11** (10150–10402) und **§12
ohne §12.6** (10403–10669) um — Knoten **G + H** aus dem Spec-Anhang.
**Faktenbasis:** `docs/lagerbuch-portierung-analyse.md`. **Querschnitt:** `docs/design/README.md`.
**Projektregeln:** `CLAUDE.md` (die sieben Fallen, `:9-46`). **Alt-Anwendung:** `../lagerbuch` @
`ca04eb1` (eingefroren). **Branch:** `feat/lagerbuch-modul` (aus Teil 5 fortgeführt).

**Ziel:** Die Dinge, die das Modul **verlassen** — auf Papier, als Datei, in die Zwischenablage — und
die Abnahme des ganzen Vorhabens. Konkret: der Etikettenbogen samt eigener Route-Gruppe `(druck)`,
dem Druck-Stylesheet und dem QR aus `core/qr`; die drei Ausgabewege (CSV, Zwischenablage, Excel);
`/g/<code>` als gestalteter Zustand statt 404; die Modul-Fehlergrenze `error.tsx`; die fünf
E2E-Dateien, die dieser Plan besitzt; die **Zählung** im Guard-Scan; und die Abnahmecheckliste über
alle sechs Teile mitsamt der Übergabetabelle an Spec 2.

**Architektur:** Der Druckast ist eine eigene Route-Gruppe **ohne Suite-Shell** und mit **denselben
zwei Riegeln** wie die Arbeitsgruppe — er trägt die Zugangs-Codes im Klartext. Das Druck-CSS ist ein
**gewöhnliches** Stylesheet mit `lb-`-Präfix, kein CSS-Modul, und es kommt **ohne** die heutige
Sichtbarkeitsumkehr `body * { visibility: hidden }` aus: die Route-Gruppe ersetzt sie. Die drei
Ausgabewege sind reine Funktionen unter `_lib/` mit Client-Inseln davor; der Vertrag ist jeweils eine
**Zeichenkette bzw. eine Spaltenliste**, und die liegt deshalb außerhalb jeder `"use client"`-Grenze.

**Tech Stack:** Next.js 16.2.11 (App Router/RSC) · Ant Design 6 · Drizzle 0.45 + better-sqlite3 12.11
· `qrcode` über `core/qr` · `write-excel-file` (Client, beim Klick nachgeladen) · `sharp` + `jsqr`
(nur im Test) · Vitest 4 + Playwright · pnpm.

---

## 1. Plan-Index

Der vollständige Index der sechs Teile, der Schnitt entlang der Knoten A–H aus dem Spec-Anhang und
die Begründung dafür stehen **in Teil 1**
(`docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil1.md`, Abschnitt „Plan-Index — dieser Plan
ist Teil 1 von sechs"). Er wird hier **nicht** kopiert; eine zweite Kopie liefe auseinander.

Dieser Plan ist **Teil 6 von sechs** und deckt **Knoten G + H**. Er ist der letzte.

| Voraussetzung | Zustand |
|---|---|
| **Teil 1** — Gerüst und Datenmodell (§2, §4, §5.13.2), T1–T14 | muss abgenommen sein |
| **Teil 2** — Zugang (§3), T15–T27 | muss abgenommen sein |
| **Teil 3** — Fachlogik und Grenzen (§5, §10, §12.6), T28–T61 | muss abgenommen sein |
| **Teil 4** — Helfer-Weg (§7), T62–T87 | muss abgenommen sein |
| **Teil 5** — Verwaltung (§6), T100–T152 | muss abgenommen sein |

**Task-Nummern:** Teil 5 endet bei T152 und schreibt „Teil 6 setzt bei **T153** fort" (H1). Dieser
Plan trägt **T153 bis T176**.

---

## 2. Vorbedingungen

⚠️ **Zuerst lesen: `docs/superpowers/plans/UEBERGABE-lagerbuch-teil2.md`.** Für Teil 6 binden
**Punkt 1** (der falsche Satz zu den Reset-Haken der Dedup-Speicher, den auch dieser Plan zitiert)
und **Punkt 5** (`_actions/guards.test.ts:57` hat dieselbe `.spec.ts`-Lücke, die in
`_lib/bauform.test.ts:56` bereits geschlossen ist — diese Datei fasst Teil 6 für die Guard-Zählung
ohnehin an).

### 2.1 Teil 4 ist vollständig

⚠️ **Hier stand bis zum 04.08.2026 das Gegenteil**, und zwar als nachgemessene Tatsache: Teil 4 war
ein 304-Zeilen-Torso ohne einen einzigen Task, weil der schreibende Lauf an einem Verbindungsfehler
abgebrochen war. Der Abschnitt leitete daraus die Anweisung ab, die Wellen 5 bis 7 dieses Plans
anzuhalten. **Das ist erledigt:** Teil 4 trägt heute **T62–T87** in acht Wellen. Der Absatz bleibt
als Notiz stehen, damit niemand die frühere Fassung für den aktuellen Stand hält.

```bash
grep -c "^### Task " docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil4.md   # → 26
```

**Die drei Dateien, die dieser Plan von Teil 4 übernommen hat, bleiben bei ihm** — die Zuordnung ist
in J2 und J3 begründet und in Teil 4 gegengezeichnet: `g/[code]/page.tsx` (T164) und
`e2e/lagerbuch-helfer.spec.ts` (T171). Es gibt für jede genau einen Task.


### 2.2 ⚠️ „Excel als Standard für alle Reports" ist NICHT Teil dieses Plans

Die Betreiberantwort zu D8 geht über die gestellte Frage hinaus: *„wir brauchen auch keine
Unterscheidung Excel/CSV. Ich denke Excel kann Standard werden für alle reports (auch über Module
hinweg)."*

**Dieser Plan setzt das nicht um, und das ist eine Entscheidung, keine Nachlässigkeit.** Drei Gründe:

1. **Ein Port reproduziert.** `bestellvorschlag.csv` ist eine 1:1-portierte Ausgabe mit
   spaltengenauer Vorgabe (§9.2). Sie im selben Zug durch ein anderes Dateiformat zu ersetzen,
   vermischt „umgezogen" mit „geändert" — und macht jede Abweichung nach dem Cutover
   nicht mehr zuordenbar.
2. **Die Entscheidung ist suiteweit, nicht modulweit.** „Auch über Module hinweg" berührt portal,
   qr, feedback und files. Eine Formatfestlegung für vier fremde Module als Nebenwirkung einer
   lagerbuch-Spec zu treffen, ist genau die Klasse stiller Suite-Entscheidung, die diese Spec an
   vier anderen Stellen ausdrücklich ablehnt (§1.5).
3. **Es ist mehr Arbeit, als es aussieht.** CSV und XLSX unterscheiden sich nicht nur im Container:
   der CSV-Weg ist serverseitig und streamt, der XLSX-Weg lädt `write-excel-file` **im Browser**
   nach (§9.4). Ein Wechsel verschiebt die Erzeugung über die Client-Grenze und nimmt der Datei den
   Weg über einen Route Handler.

→ **Als eigener Posten aufgenommen** (ClickUp-Board des Projekts). Bis dahin bleibt es bei
`bestellvorschlag.csv` **plus** `bestand-YYYY-MM-DD.xlsx` — beide wie im Bestand.

### 2.3 Die offenen Betreiberfragen dieses Teils

Die Tabelle steht vollständig, weil eine gekürzte Liste eine stille Herabstufung wäre. **Keine
blockiert den Baubeginn**; zwei blockieren den **Cutover**.

| # | Frage | Antwortet | Blockiert | Rückfall, mit dem dieser Plan baut |
|---|---|---|---|---|
| 7 | ~~In welchem Programm wird `bestellvorschlag.csv` geöffnet?~~ | ✅ **entschieden (D8, 04.08.2026): Tabellenkalkulation** | — | **A-J1 ist zur FESTLEGUNG hochgestuft.** Entscheidung 9-C wird umgesetzt: `csvTextZelle` neutralisiert `=`/`+`/`-`/`@` **nur** auf den drei Textspalten. ⚠️ **Der Betreiber will darüber hinaus Excel als Standard für alle Reports, auch über Module hinweg.** Das ist eine **suiteweite Formatentscheidung** und wird hier ausdrücklich **nicht** nebenbei vollzogen — siehe §2.3 |
| — | **Der Probebogen aus 8-I** — welcher Drucker, welches gekaufte Etikettenmaterial? | Betreiber | **den Cutover**, nicht den Bau | **A-J2:** `core/qr` wird unverändert benutzt (Level H, `margin: 4`). Scheitert die Abnahme, ist der benannte Rückfall ein optionaler `margin`-Parameter an `qrSvg`, vom Etikettenbogen auf `1` gesetzt und an der Aufrufstelle mit dem Messergebnis begründet. **Level H bleibt in beiden Fällen.** T176, Schritt 8 führt die Runbook-Zeile |
| — | **Darf die Reihenfolge in `SUITE_HOST_LAGERBUCH` nach dem ersten Etikettendruck eingefroren werden?** (§8.1, 8-B) | Betreiber | nichts im Bau | **A-J3:** ja. `moduleUrl` nimmt `prodHostsFor(mod)[0]`; eine Umsortierung ändert **still** jeden ab dann gedruckten Bogen. T162 druckt den verwendeten Host als Text über den Bogen, damit die Person vor dem Drucken sieht, was sie druckt; T176 führt die Runbook-Auflage |
| 9 | Soll eine abgelöste Domain dauerhaft als zweiter Host mitlaufen? (E16 b) | Betreiber | nichts | §2.6 erlaubt ≥ 2 Hosts. ⚠️ Fällt die Antwort „ja", **muss `lagerbuch.iuk-ue.de` Index 0 bleiben** — sonst drucken ab dem nächsten Bogen alle QR auf die Altdomain |
| 4, 5, 6, 8 | Backup-Job · `scope_lagerort_id` als Riegel · Netz im Lagerraum · Hersteller-EANs | Betreiber | nichts hier | in Teil 2 (A31), Teil 3/4 abgehandelt; berühren diesen Plan nicht |

**Keine dieser Fragen darf durch eine erfundene Vorbelegung ersetzt werden.** Wo dieser Plan einen
Wert nennt, ist er in der Spec belegt oder als Annahme `A-J<n>` markiert.

### 2.4 Was dieser Plan dem Runbook schuldet

| # | Eingabe | Warum sie nicht warten kann |
|---|---|---|
| R30 | **Probebogen:** auf dem tatsächlich benutzten Drucker, auf das tatsächlich gekaufte Etikettenmaterial, mit **zwei** Telefonen aus 15 cm gescannt — je fünf Etiketten aus der **ersten und der letzten** Zeile des Bogens (§8.4, 8-I) | Kein Test kann das. `pnpm build` und Vitest sehen `@media print` gar nicht, Playwright rendert per Vorgabe für den Bildschirm. Ein fehlerhafter Bogen kostet gekauftes Material und einen Gang durch alle Fahrzeuge |
| R31 | **`SUITE_HOST_LAGERBUCH`: Reihenfolge nach dem ersten Druck einfrieren** (§8.1) | `moduleUrl` liest Index 0. Eine Umsortierung ist eine stille Änderung an gedruckten Pixeln |
| R32 | **Die Menge der physisch hängenden Etiketten ist echt größer als die Menge der druckbaren** (§8.4, Falle 26): `etikettenDaten` filtert hart auf `aktiv = true`, ein deaktivierter Artikel bleibt unter `/a/<id>` bebuchbar, ist aber nie wieder nachdruckbar. Die Differenz ist im Repo nicht abzählbar | Wer nach dem Cutover ein Etikett nachdrucken will und den Artikel nicht findet, sucht sonst einen Fehler, wo eine Entscheidung ist |
| R33 | **Ankündigung: die beiden Knopfbeschriftungen auf `/verwaltung/bestellung` ändern sich** — `Liste kopieren` → `Liste kopieren (nur offene)`, `CSV` → `CSV (alle Zeilen)` (§9.1, 9-A) | Die beiden Wege liefern **verschieden viele Zeilen**, und heute verrät das nichts. Die Vereinheitlichung wäre eine Fachentscheidung im Gewand einer Aufräumarbeit — deshalb bleibt der Umfang und die Beschriftung wird ehrlich |

---

## 3. Festlegungen dieses Plans, die die Spec offen lässt

Dreizehn Punkte. Jeder ist eine Entscheidung **dieses** Plans, keine Ableitung. Die Nummern J1–J13
setzen die Kreise F… (Teil 1), G… (Teil 2), H… (Teil 3 und 5) und E… (Teil 4) fort.

### J1 — Der Nummernkreis dieses Plans ist T153–T176

Teil 5 (H1) reserviert T62–T99 für Teil 4 und endet selbst bei T152 mit der Zeile „Teil 6 setzt bei
**T153** fort". Das gilt, **auch wenn Teil 4 seine Nummern nie vergeben hat** — eine nachträgliche
Verdichtung machte jeden Commit-Verweis der anderen Pläne mehrdeutig.

### J2 — `e2e/lagerbuch-helfer.spec.ts` gehört DIESEM Plan

Teil 4 beansprucht sie in **E11** für T84. **T84 existiert nicht** (§2.1). Eine Zusicherung, die
nirgends geschrieben ist, ist keine Zusicherung, und es hängt viel daran: sie ist laut §7.12.4 und
§12.2 der **einzige** Nachweis für **Falle 16** (setzt `/t/<code>` das Cookie auf demselben Host, auf
dem die Landung passiert?) und **Falle 63** (`aria-current` an drei Einstiegen unter dem Rewrite),
und sie ist der Nachfolger von `lagerbuch/e2e/helfer-flow.spec.ts:56`, das den Absturz heute als
**erwartete Ausgabe** festschreibt (§12.5).

→ **T171 legt sie an**, mit allen vier Zusagen aus §12.2 und §3.8.3, die den Helfer-Weg betreffen.
⚠️ **Wird Teil 4 doch noch geschrieben und legt seinerseits T84 an, ist die Datei zu vereinigen, nicht
zu verdoppeln** — dann gilt: T171s Zusicherungen wandern in T84s Datei, T171 entfällt. Es gibt in
keinem Fall **zwei** Helfer-Specs.

### J3 — `g/[code]/page.tsx` gehört DIESEM Plan

Hier widersprechen sich zwei fertige Pläne, und die Auflösung ist eindeutig:

- **Teil 4, E1** schiebt die Datei ausdrücklich und begründet zu Teil 6: `/g` rendert **überhaupt nur
  einen** Zustand, und der trägt `_ui/VerwaltungsRahmen.tsx` **mit** Shell und Modulnavigation
  (§2.9, §8.1 8-C2, §11.3) — eine Datei, die erst in Teil 5 entsteht. Die beiden Alternativen sind
  benannt und beide schlecht: ein `notFound()` mit Einlöser in einem *anderen* Plan, oder ein
  zweiter, shell-loser Rahmen, der genau den Mangel nachbaut, den §11.3 repariert.
- **Teil 5s Abschlusstabelle** schreibt „Der Zustand von `/g/<code>` … **Teil 4**".

**E1 gewinnt:** es ist der spezifische, begründete Anspruch, es ist die spätere Aussage, und Teil 4
hat keine Task, die die Datei bauen würde. → **T164 baut `g/[code]/page.tsx`.**

⚠️ **Der harte Consumes, den dieser Plan nicht selbst herstellt:**
`_lib/barcode.ts#normalisiereBarcode(roh: string): string` (Teil 4, T62, §7.6.2). Ohne sie reicht
`/g` seinen Routenparameter **roh** durch — die einzige unnormalisierte Lesestelle des Bestands
(`g/[code]/page.tsx:29,31`, Falle 29), während beide Schreibwege und der andere Leseweg trimmen.
**T164 ist damit die einzige Reihenfolgebindung dieses Plans nach außen** und steht in §5 mit.

### J4 — Dieser Plan schreibt FÜNF E2E-Dateien, nicht sechs

§12.2 listet sechs Dateien. `e2e/lagerbuch-verwaltung.spec.ts` gehört **Teil 5** (H14, **T150 ist
geschrieben**) — ihre vier Zusagen (`aria-current` über `LAGERBUCH_NAV`, `scrollWidth` bei 1280×720
gegen die `.modulnav`-Reparatur) haben ihr Subjekt ausschließlich dort. Dieser Plan schreibt
**keine zweite Navigations-Spec**.

| Datei | Eigentümer |
|---|---|
| `e2e/lagerbuch-etiketten.spec.ts` | **T167** (dieser Plan) |
| `e2e/lagerbuch-bestand-export.spec.ts` | **T168** (dieser Plan) |
| `e2e/lagerbuch-hosts.spec.ts` | **T169** (dieser Plan) |
| `e2e/lagerbuch-mobil.spec.ts` | **T170** (dieser Plan) |
| `e2e/lagerbuch-helfer.spec.ts` | **T171** (dieser Plan, J2) |
| `e2e/lagerbuch-verwaltung.spec.ts` | **Teil 5, T150** — hier NICHT |

### J5 — Die Guard-Zählung ist 47 = 44 + 3 in 18 Dateien und 19 Verzeichniseinträgen, und sie wird HERGELEITET

Teil 1 (F4) weist Teil 6 die Zählung zu und nennt die Zahlen. Beide Zuliefererpläne nennen
**andere** Zahlen, und beide rechnen falsch. **Ein `toHaveLength(44)`, das auf einer der beiden
Angaben ruht, ist am ersten Tag rot, ohne dass man wüsste, welcher Plan zu wenig geliefert hat.**
Deshalb steht die vollständige Herleitung in §4 dieses Plans, aus der **einen** verbindlichen Quelle:
der Abbildungstabelle Alt→Neu in **Spec §2.1 a** (Zeilen 420–447). Die beiden Rechenfehler sind dort
namentlich aufgelöst.

### J6 — `_lib/zustandTexte.ts` wird eingeführt

§11.6 ist kategorisch: „Die Zustandstexte dieser Tabelle liest sowohl eine Server Component
(`/g/[code]`, `/a/[artikelId]` sind Server Components) als auch eine Client-Insel … Sie gehören
deshalb in ein Modul **ohne** `"use client"` unter `_lib/`." Der Verzeichnisbaum aus §2.1 nennt dafür
**keine Datei**. Ohne eine benannte Datei landet jeder Text dort, wo er gerade gebraucht wird —
`error.tsx` trägt `"use client"` in Zeile 1, und ein dort gehaltener Text wäre für jede Server
Component, die ihn mitliest, **Falle 6**: HTTP 500, `typecheck` und `build` grün, Vitest
strukturell blind.

→ **`src/app/m/lagerbuch/_lib/zustandTexte.ts`**, ohne `"use client"`, hält die Texte der drei
Zustände dieses Plans: die Modul-Fehlergrenze (§11.5, Zustände 22 und 23), den Barcode-Zustand
(§11.5, Zustand 15) und die fehlende Etiketten-Domain (§11.5, Zustand 38).
⚠️ **Die Texte des Helfer-Wegs (Zustände 1–11, 33–36) gehören NICHT hierher** — sie sind Teil 4 und
liegen bei ihren Bauteilen bzw. in `_lib/gateTexte.ts` (Teil 2, T18). Diese Datei sammelt nicht
„alle Texte des Moduls"; sie sammelt die Texte **dieses** Plans, die eine `"use client"`-Grenze
kreuzen.

### J7 — `error.tsx` benutzt KEIN Ant Design und bekommt `_ui/fehler.module.css`

§11.2 sagt, die Grenze „trägt die Modul-Anmutung" — und das Modul hat **zwei**: die öffentliche
Ansichtsklasse des Helfer-Wegs (§7.1, ausdrücklich ohne antd) und die antd-Verwaltung (§6). Eine
Fehlergrenze auf Modulebene fängt **beide** Äste. Drei Wege, zwei davon falsch:

- **antd + `verwaltung.module.css`**: zieht die Verwaltungsanmutung und `--lb-*` in den bewusst
  antd-freien Helfer-Zweig — genau der Bruch, gegen den Entscheidung 28 gebaut ist.
- **`_ui/helfer.module.css`**: gehört Teil 4 und existiert in Welle 3 dieses Plans womöglich nicht;
  eine Fehlergrenze, die an einer fremden Datei hängt, fällt aus, wenn die fehlt.
- → **Eigenes Markup plus `_ui/fehler.module.css`**, nach dem **belegten** Hausmuster der Suite:
  `src/app/not-found.tsx` rendert eigenes Markup und färbt sich aus `not-found.module.css` über
  `--nf-*`; deren Kopf schreibt aus, warum `--ant-*` dort still wirkungslos wäre (Falle 2). Die
  Datei ist ~35 Zeilen, trägt beide Farbmodi über `:root[data-theme="dark"]` und hat **keinen**
  Icon-Import (Falle 7 — und `"use client"` behebt ihn nicht, es macht ihn still).

⚠️ **`error.tsx` trägt `"use client"` in Zeile 1, ohne Ausnahme** (§11.2). Next verlangt das für jede
Fehlergrenze, und `reset()` ist eine Prop, die nur ein Client-Modul annehmen kann. Sie ist damit die
**einzige** `"use client"`-Datei außerhalb von `_ui/` — als Segmentdatei muss sie neben der Route
liegen. Das Verbot aus §2.1 richtet sich gegen `_lib/` und bleibt unberührt.

### J8 — `etikettenDaten` ruft `moduleUrl` selbst und wirft eine BENANNTE Fehlerklasse

§8.4 (8-B) verlangt: `moduleUrl("lagerbuch")` ist die Quelle der Basis-URL, und bei `null` „wirft
`etikettenDaten`, und die Etikettenseite zeigt statt eines Bogens eine Meldung". §9.6 verlangt dafür
einen eigenen Vitest.

**Zwei Bauformfragen, die die Spec offen lässt, und beide entscheiden über die Testbarkeit:**

1. **Ein `throw new Error(...)` wäre von einem Datenbankfehler nicht zu unterscheiden.** Die Seite
   müsste den Text vergleichen, um zu wissen, ob sie die Domain-Meldung oder die Fehlergrenze zeigt
   — ein Textvergleich als Kontrollfluss. → **`export class EtikettenBasisFehlt extends Error`**, mit
   `name = "EtikettenBasisFehlt"`. Die Seite fängt genau diese Klasse; alles andere fällt an
   `error.tsx` durch, und das ist richtig.
2. **`moduleUrl` liefert unter Vitest NIEMALS `null`.** Der `null`-Zweig hängt an
   `process.env.NODE_ENV === "production"` (`core/shell/moduleUrl.ts:19-21`); unter Vitest gilt der
   Dev-Zweig und liefert `http://lagerbuch.localtest.me:3000`. Ein Test, der den Zustand über
   `NODE_ENV` herbeiführen wollte, änderte eine Prozessvariable, die Next und antd mitlesen. →
   **Der Test mockt das Modul: `vi.mock("@/core/shell/moduleUrl", …)`.** Der ausgeschriebene Mock
   steht in T159, Schritt 4.

### J9 — `decodeQr` bleibt in `e2e/helpers/decode-qr.ts` — gemessen

§8.5 nennt einen Rückfall: „wenn die Vitest-Konfiguration `e2e/helpers/` nicht auflöst, wandert der
Helfer nach `src/core/qr/decode.ts`". **Der Rückfall ist nicht nötig, und das ist nachgemessen** —
am 04.08.2026 im Arbeitsbaum, mit `vitest 4.1.10`:

```
src/__probe.test.ts:  import { decodeQr } from "../e2e/helpers/decode-qr";
                      import { qrSvg } from "@/core/qr";
pnpm vitest run src/__probe.test.ts   →   Test Files 1 passed, Tests 1 passed
```

`vitest.config.ts:exclude` steuert die **Sammlung** von Testdateien, nicht die Auflösung von
Importen; `sharp` und `jsqr` stehen in `devDependencies` (`package.json:51-52`) und sind damit auch
außerhalb von Playwright ladbar.

→ **`_db/etiketten.test.ts` importiert relativ aus `e2e/helpers/decode-qr`.** Es entsteht **kein**
zweiter Dekodierer, und `src/core/qr/decode.ts` wird **nicht** angelegt. ⚠️ Die Messung gehört in den
Kopfkommentar der Testdatei — sonst verschiebt sie der nächste Umsetzer „vorsichtshalber".

### J10 — Sieben fremde Dateien werden ERGÄNZT, nicht neu angelegt

Dieser Plan ist der einzige, der planmäßig in Dateien anderer Teile schreibt. Das ist kein Bruch der
Eigentümerschaft, sondern von den Zuliefererplänen **ausdrücklich so übergeben**. Die
Eigentümertabelle (§5) führt jede Zeile mit dem Vermerk **ERGÄNZT**; wer das nicht liest, hält den
Vorgriff für einen Fehler und baut daneben eine zweite Datei.

| Datei | Eigentümer | Was dieser Plan ergänzt | Beleg |
|---|---|---|---|
| `_actions/guards.test.ts` | Teil 2, T20 | die **Zählung** (47 = 44 + 3, 18 Dateien, 19 Einträge) | Teil 1 F4; Teil 2 T20 „Teil 6 ERWEITERT diese Datei" |
| `_lib/bauform.test.ts` | Teil 2, T21 | die **Verschärfung** der Weichen-Zeile auf drei existierende Dateien | Teil 4 E9 („wird von Teil 6 in die Existenzpflicht überführt") |
| `_lib/lesepfade/tokens.ts` | Teil 5, T126 | §8.3 (Alphabet, Länge, Kollision gegen **alle** Zeilen) | Teil 5 H8 |
| `_actions/tokens.ts` | Teil 5, T126 | dasselbe, plus 8-F | Teil 5 H8 |
| `_actions/loeschen.ts` | Teil 5, T124 | **8-F**: `pruefeToken` und `case "token"` in `loescheElement` entfallen | §8.3, 8-F — die exportierte Oberfläche bleibt **unverändert** |
| `verwaltung/(arbeit)/artikel/**` | Teil 5, T129 | der Excel-Knopf wird von `disabled` befreit und angebunden | Teil 5 §10, „Teil 6 löst ihn ein" |
| `verwaltung/(arbeit)/bestellung/**` | Teil 5, T145 | CSV- und Zwischenablage-Knopf werden angebunden | ebenda |
| `verwaltung/(arbeit)/tokens/**` | Teil 5, T148 | 8-F entfernt den `LoeschButton`-Aufruf, **nicht** den Dialog | Teil 5 §10 |

### J11 — Es bleibt bei EINER Druck-Scan-Datei, und ihr Glob liest `.css`, nicht `.module.css`

§6.10.2 Punkt 4 und §8.5 verlangen denselben Scan und sagen beide „es bleibt bei **einem**". Teil 5
schreibt ihn ausdrücklich **nicht**. → **`verwaltung/(druck)/etiketten/druck.test.ts`** (T161) hält
alle CSS-Aussagen des Moduls:

1. `@media print` kommt unter `src/app/m/lagerbuch/**` **genau einmal** vor, und zwar in
   `(druck)/druck.css`.
2. `body *` kommt **gar nicht** vor (Falle 43 — CSS Modules schreiben ausschließlich
   **Klassen**selektoren um; `body *` bliebe global und leerte jede andere Druckseite der Suite).
3. `druck.css` trägt `@page`, `.lb-nichtDrucken`, `print-color-adjust: exact`, die festen `#fff`/
   `#000` und die Millimeterwerte aus `_lib/etikettMasse.ts`.
4. In `max-width`-Abfragen des Modul-CSS steht **kein anderer Wert als 767.98px** (§12.2 — nicht 768,
   sonst gelten bei exakt 768px beide Seiten und die Reihenfolge im Stylesheet entscheidet).

⚠️ **Der Glob muss `**/*.css` lesen, nicht `_ui/*.module.css`.** Ein Scan über die Modul-Stylesheets
ließe ausgerechnet die Datei aus, die die Druckregeln trägt, und wäre **grün und blind**.

### J12 — Die sieben Zusicherungen aus §12.1 werden NICHT sieben neue Tasks

§12.1 fordert für jede der sieben Aussagen ohne Netz einen **ersetzenden** Test, bevor die alte Spec
fällt. Nachgeprüft in den fertigen Plänen haben **fünf** davon längst einen Eigentümer (§8 dieses
Plans führt die Tabelle mit Datei und Testnamen). Sieben neue Tasks wären fünfmal eine
Neuimplementierung fremder Arbeit — und damit genau die Doppelung, gegen die die Eigentümertabellen
gebaut sind.

→ **T174** ist ein **Abgleich**: je Aussage wird der Nachfolger namentlich nachgewiesen
(`grep` auf Datei **und** Testnamen), gegen die alte Fassung gehalten (§12.3, Regel 3) und abgehakt.
Die **zwei** Aussagen ohne Eigentümer — die Export/Filter-Kopplung aus Punkt 2 und der QR-Träger aus
Punkt 7 — entstehen in T156 bzw. T162 als echter Testcode. Die E2E-Hälfte von Punkt 1 („der Wert
überlebt bis in die Datenbank") entsteht in T171.

### J13 — 8-F fasst `_actions/loeschen.ts` an, obwohl seine Exportliste unverändert bleibt

§8.3 (8-F) ist zweifach gelesen worden und heißt beides zugleich: „Die exportierte Oberfläche von
`loeschen.ts` bleibt unverändert (`pruefeLoeschbar`, `loescheElement`, `deaktiviereElement`); die
Zahl der Actions ändert sich nicht" **und** „konkret entfallen `pruefeToken` (`loeschen.ts:89-99`)
und der Zweig `case "token"` in `loescheElement` (`:168`) ersatzlos". Es ändern sich also die
**Innereien** einer Datei, deren Signatur gleich bleibt.

→ **T160 fasst `_actions/loeschen.ts` an** und die Guard-Zählung in §4 bleibt davon unberührt:
`loeschen.ts` steht weiter mit **3** Deklarationen in der Tabelle. Der Test dafür („`loescheElement`
mit `art: "token"` lehnt ab und nennt das Sperren als Weg") gehört in `_actions/loeschen.test.ts`
(Teil 5, T124) — **ERGÄNZT**, keine zweite Datei.

---

## 4. Die Guard-Zählung — hergeleitet, nicht behauptet

**Das ist der Kern von Festlegung J5 und der einzige Ort im ganzen Vorhaben, an dem die Zahl 47
begründet steht.**

### 4.1 Die Sollliste aus Spec §2.1 a

Nachgezählt am eingefrorenen Bestand (`lagerbuch` @ `ca04eb1`): **16 Dateien** unter `src/actions/`
tragen `"use server"` mit zusammen **44 exportierten Funktionen**, und **alle 44 tragen heute schon
einen Riegel als erste Anweisung**. Der Port setzt keine fehlenden Guards, er übersetzt vorhandene —
und legt **zwei** neue Dateien mit **drei** bewusst ungeschützten Actions dazu.

| # | `_actions/`-Datei | Deklarationen | Riegel | Gebaut in |
|---|---|---|---|---|
| 1 | `artikel.ts` | 3 | `requireLagerbuchAdmin` | Teil 5, T113 |
| 2 | `aussondern.ts` | 1 | `requireLagerbuchAdmin` | Teil 5, T115 |
| 3 | `bestellung.ts` | 1 | `requireLagerbuchAdmin` | Teil 5, T117 |
| 4 | `buchung.ts` | 3 | 2× `requireLagerbuchAdmin`, 1× **`requireHelferSchreibend`** | Teil 5, T114 (H7) |
| 5 | `bz.ts` | 4 | `requireLagerbuchAdmin` | Teil 5, T122 |
| 6 | `check.ts` | 1 | **`requireHelferSchreibend`** | **Teil 4** |
| 7 | `csv.ts` | 1 | `requireLagerbuchAdmin` | Teil 5, T125 |
| 8 | `detail.ts` | 1 | `requireLagerbuchAdmin` | Teil 5, T125 |
| 9 | `fahrzeuge.ts` | 5 | `requireLagerbuchAdmin` | Teil 5, T118 |
| 10 | `geraete.ts` | 3 | `requireLagerbuchAdmin` | Teil 5, T121 |
| 11 | `inventur.ts` | 1 | `requireLagerbuchAdmin` | Teil 5, T116 |
| 12 | `lagerortVerfall.ts` | 1 | `requireLagerbuchAdmin` | Teil 5, T120 |
| 13 | `loeschen.ts` | 3 | `requireLagerbuchAdmin` | Teil 5, T124 (+ 8-F in T160) |
| 14 | `sauerstoff.ts` | 3 | `requireLagerbuchAdmin` | Teil 5, T123 |
| 15 | `templates.ts` | 11 | `requireLagerbuchAdmin` | Teil 5, T119 |
| 16 | `tokens.ts` | 2 | `requireLagerbuchAdmin` | Teil 5, T126 (+ §8.3 in T160) |
| 17 | `gate.ts` | 1 | **Ausnahme 1** (`einloesenAmGate`) | **Teil 4** |
| 18 | `sitzung.ts` | 2 | **Ausnahmen 2 und 3** (`erneuereSitzung`, `beenden`) | **Teil 4** |
| | **18 Dateien** | **47** | **44 bewacht + 3 Ausnahmen** | |

**Die Additionen, ausgeschrieben, damit niemand sie nachrechnen muss:**

```
3+1+1+3+4+1+1+1+5+3+1+1+3+3+11+2  = 44      (die 16 portierten Dateien)
                              +1+2 = 47      (gate.ts, sitzung.ts)
47 − 3 Ausnahmen                   = 44      bewacht
44 − 2 (bucheEntnahmeHelfer, checkAbschluss)= 42  mit requireLagerbuchAdmin
18 Action-Dateien + guards.test.ts = 19      Verzeichniseinträge
```

### 4.2 Wer wieviel beisteuert — und die zwei Rechenfehler in den Zuliefererplänen

| Plan | Dateien | Deklarationen | davon bewacht | Ausnahmen |
|---|---|---|---|---|
| **Teil 5** (T113–T126) | 15 (Nr. 1–5, 7–16) | **43** | 43 | 0 |
| **Teil 4** (§7) | 3 (Nr. 6, 17, 18) | **4** | 1 | 3 |
| **Summe** | **18** | **47** | **44** | **3** |

⚠️ **Teil 5 §6 nennt „14 Action-Dateien mit 32 exportierten Actions". Beide Zahlen sind falsch.** Die
Eigentümertabelle von Teil 5 (§5) führt **15** Action-Dateien (`csv.ts` **und** `detail.ts` stehen in
T125, das ist eine Task mit zwei Dateien), und die eigene Zuordnungstabelle desselben Kapitels hat
**43 Zeilen** — genau die 43 Deklarationen. Der Satz „43 Zeilen, 32 exportierte Actions … die
Differenz sind die zehn `templates.ts`-Actions und die Dubletten" trägt nicht: `templates.ts` hat
**elf** Deklarationen und **elf** Zeilen, und die Dubletten stehen je Datei **einmal**. Die Differenz
existiert nicht; 43 ist die Zahl.

⚠️ **Teil 4 E10 nennt „4 Dateien, 5 Exporte" und rechnet „47 − 5 = 42 bewachte in 14 Dateien".** Das
zählt `buchung.ts` doppelt: **Teil 5s H7 hat die ganze Datei einschließlich `bucheEntnahmeHelfer`
übernommen**, ausdrücklich und mit Begründung („sie teilen sich `fefoAbbuchung` und dieselbe
Zod-Basis"). Teil 4 baut sie nicht, es **ruft** sie. Netto bleiben Teil 4 drei Dateien mit vier
Deklarationen.

**Verbindlich für T172:** die Zahlen aus §4.1 — **47 / 44 / 3 / 18 / 19**. Sie stimmen mit Teil 1 F4
und mit Spec §2.1 a und §3.8.2 überein; die beiden abweichenden Angaben sind Rechenfehler und keine
Planänderungen.

⚠️ **Teil 5s Abschluss-Abnahme trägt die Zeile „`_actions/guards.test.ts` (Teil 2) ist grün: **32
Deklarationen in 14 Dateien, alle bewacht**".** Diese Zeile wird beim Abhaken **nicht** zutreffen und
ist kein Mangel des Baus: der Scan aus Teil 2 ist in der **Eigenschaftsform** geschrieben und zählt
zu diesem Zeitpunkt gar nicht. Wer sie abhakt, prüft „43 Deklarationen in 15 Dateien, alle bewacht".

### 4.3 Die drei Fallstricke, die die Zählung falsch machen

1. **Drei Namensdubletten.** `geraetSpeichern`, `setGeraetAktiv` und `geraetZuBarcode` stehen
   **sowohl** in `bz.ts` **als auch** in `geraete.ts` — gleicher Name, verschiedene Tabellen
   (`bz_geraete` gegen `geraete`), verschiedene Felder. **Ein Scan, der die Exportnamen in ein `Set`
   legt, zählt 41 statt 44.** Gezählt wird **je Datei je Deklaration**. Die beiden Dateien werden
   **nicht** zusammengelegt.
2. **`export type` ist keine Action.** `detail.ts` exportiert neben `getDetail` **drei Typen**
   (`ArtikelDetailCharge`, `ArtikelDetailBuchung`, `ArtikelDetailResult`). Der Scan muss
   `export type` und `export interface` verwerfen, sonst liest er drei ungeschützte Actions, die
   keine sind. Dieselbe Unterscheidung hält `_lib/actionTypen.ts` aus dem Ordner heraus (§2.1 a).
3. **Drei der 44 lesen nur und bleiben trotzdem Actions.** `getDetail`, `pruefeLoeschbar` und
   `geraetZuBarcode` (**zweimal**, je Datei) liegen hier und nicht unter `_lib/lesepfade/`, weil ihr
   einziger Aufrufer jeweils eine Client-Insel ist. Sie zählen mit und tragen einen Riegel.

---

## 5. Datei-Eigentümerschaft — mechanisch prüfbar

Jede Datei gehört genau einem Task. Wer in einer fremden Datei arbeitet, hat den Schnitt verlassen.
Pfade ohne Präfix liegen unter `src/app/m/lagerbuch/`.

| Datei | Task | Art |
|---|---|---|
| `_lib/etikettMasse.ts`, `_lib/etikettMasse.test.ts` | T153 | neu |
| `_lib/csvZelle.ts`, `_lib/csvBestellung.ts`, `_lib/csvBestellung.test.ts` | T154 | neu |
| `_lib/bestellText.ts`, `_lib/bestellText.test.ts` | T155 | neu |
| `_lib/bestandExport.ts`, `_lib/bestandExport.test.ts` | T156 | neu |
| `_lib/bestandExportSpalten.ts`, `_lib/bestandExportSpalten.test.ts` | T157 | neu |
| `_lib/zustandTexte.ts`, `_lib/zustandTexte.test.ts` | T158 | neu (J6) |
| `_db/etiketten.ts`, `_db/etiketten.test.ts` | T159 | neu |
| `_lib/lesepfade/tokens.ts`, `_actions/tokens.ts`, `_actions/tokens.test.ts` | T160 | **ERGÄNZT** (Teil 5, T126) |
| `_actions/loeschen.ts`, `_actions/loeschen.test.ts` | T160 | **ERGÄNZT** (Teil 5, T124 — J13) |
| `verwaltung/(arbeit)/tokens/**` | T160 | **ERGÄNZT** (Teil 5, T148 — 8-F entfernt den `LoeschButton`) |
| `verwaltung/(druck)/layout.tsx`, `verwaltung/(druck)/druck.css`, `_ui/DruckRahmen.tsx`, `verwaltung/(druck)/etiketten/druck.test.ts` | T161 | neu |
| `verwaltung/(druck)/etiketten/page.tsx`, `.../EtikettenBogen.tsx`, `.../EtikettenBogen.test.tsx` | T162 | neu |
| `error.tsx`, `error.test.tsx`, `_ui/fehler.module.css` | T163 | neu (J7) |
| `g/[code]/page.tsx`, `g/[code]/page.test.tsx` | T164 | neu (J3) |
| `verwaltung/(arbeit)/artikel/**` | T165 | **ERGÄNZT** (Teil 5, T129) |
| `verwaltung/(arbeit)/bestellung/**` | T166 | **ERGÄNZT** (Teil 5, T145) |
| `e2e/lagerbuch-etiketten.spec.ts` | T167 | neu |
| `e2e/lagerbuch-bestand-export.spec.ts` | T168 | neu |
| `e2e/lagerbuch-hosts.spec.ts` | T169 | neu |
| `e2e/lagerbuch-mobil.spec.ts` | T170 | neu |
| `e2e/lagerbuch-helfer.spec.ts` | T171 | neu (J2) |
| `_actions/guards.test.ts` | T172 | **ERGÄNZT** (Teil 2, T20) |
| `_lib/bauform.test.ts` | T173 | **ERGÄNZT** (Teil 2, T21) |
| — (nur Ausführung und Protokoll) | T174, T175, T176 | — |

**Keine `core`-Datei wird in diesem Plan angefasst.** Die drei `core`-Berührungen des Vorhabens sind
abgeschlossen: `core/shell/icons.ts` (Teil 1, T2), `core/bootstrap.ts` (Teil 1 T8 + Teil 2) und
`core/shell/shell.module.css` (Teil 5, T105). ⚠️ Insbesondere wird **`core/qr` nicht erweitert** —
der optionale `margin`-Parameter ist der benannte Rückfall aus A-J2 und wird nur gezogen, wenn der
Probebogen scheitert.

**Die eine Reihenfolgebindung nach außen:** T164 (`g/[code]/page.tsx`) braucht
`_lib/barcode.ts#normalisiereBarcode` aus **Teil 4** (T62). Ohne Teil 4 ist T164 nicht lauffähig; der
Vertrag steht in T164s `Consumes`.

---

## 6. Gates am Ende jeder Wellenstufe

```bash
pnpm typecheck        # muss grün sein
pnpm lint             # Fehler blockieren, Warnungen nicht
pnpm vitest run       # muss grün sein
pnpm build            # muss grün sein
```

**Ab Welle 3 zusätzlich** (dort entsteht die erste Route dieses Plans):

```bash
pnpm exec playwright test
```

**Was diese Gates strukturell NICHT sehen** (§12.4, `CLAUDE.md:9-46`) — und wo es hier nachgeholt
wird:

| Fehlerklasse | Warum kein Gate sie sieht | Wo sie hier nachgeholt wird |
|---|---|---|
| antd-Compound in einer Server Component | `typecheck` sieht ein gültiges Namespace-Member, `build` rendert nicht | T175, Abrufliste (§7) — `/verwaltung/etiketten`, `/g/<…>`, die werfende Route |
| `@ant-design/icons` in der RSC-Ebene | Vitest lädt `react` über die `default`-Bedingung, die Icons rendern klaglos | T175 · Scan in `_ui/ikonen.test.ts` (Teil 5, T101) |
| Ein **WERT** aus einem `"use client"`-Modul in einer Server Component | Unter Vitest ist `"use client"` ein wirkungsloser String | T175 · Scan in `_lib/bauform.test.ts` (T173) |
| **`@media print` wirkt nicht** | `pnpm build` und Vitest sehen `@media print` gar nicht; Playwright rendert per Vorgabe für den **Bildschirm** | T167 (`page.emulateMedia({ media: "print" })`) — der Scan aus T161 hält nur „die Regel steht da", nie „sie wirkt" |
| **Der Riegel im Druck-Layout fehlt** | Route-Group-Grenzen sind **keine** Sicherheitsgrenzen; ein Quelltext-Scan sieht die Kopplung zwischen zwei Layouts nicht | T167, Schritt 6 **und** T175, Zeile `/verwaltung/etiketten` ohne Gruppe |
| Dunkelmodus | **Kein Gate der Suite rendert ein Modul im Dunkelmodus** | T175, Schritt 4 (drei Seiten) — der Bogen zusätzlich, weil er hart `#fff`/`#000` trägt |
| **Der QR trägt den falschen Inhalt** | Ein `toHaveAttribute("src", /^data:image\/png/)` bleibt grün, egal was im Code steht — genau der Mangel des Bestands (`lagerbuch/e2e/etiketten.spec.ts:13`) | T159 (Vitest **mit Dekodierung**) |
| **Der Bogen passt nicht auf gekauftes Material** | Die Aussage lebt auf Papier | **Kein Test** — Runbook-Zeile R30 (A-J2) |

---

## 7. Die Abrufliste aus §12.4 — 29 Seiten und 7 Route Handler, abzuhaken

§12.4 ist wörtlich: „Jede Route, die der Port anfasst, wird **einmal echt abgerufen** — Dev-Server auf
dem Modul-Host, HTTP-Status und ein unterscheidendes Merkmal je Route protokolliert. … die Liste
gehört in die Bau-Task und wird abgehakt, nicht behauptet."

**Die Liste steht hier vollständig, mit dem Task, der sie abhakt.** Die meisten Zeilen sind bereits
von Teil 5 abgehakt worden (T151, Schritt 2 ruft alle 23 Arbeitsseiten ab); sie stehen trotzdem, weil
eine Abnahme über sechs Teile keine Zeile stillschweigend fremdem Protokoll überlassen darf. **T175
prüft das Protokoll und trägt die fehlenden Zeilen selbst nach.**

**Server:** `SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me pnpm dev`, abgerufen als
`http://lagerbuch.localtest.me:3000<pfad>`. **Der Modul-Host ist Pflicht** — auf `localhost` ist keine
einzige Zeile dieser Liste erreichbar (Falle 61 von der richtigen Seite).

⚠️ **Korrektur aus T175 (gemessen, 2026-08-11):** hier stand „auf `localhost` greift
`requireLagerbuchHost` und jede Zeile antwortete 404". Der **Effekt** stimmt, die **Ursache** nicht,
und die Verwechslung ist folgenreich. Gemessen antwortet `localhost:3000` mit **307 → `/login`**, auch
mit gültigem Sitzungscookie: `moduleForHost("localhost")` findet kein Modul und fällt auf `portal`
zurück, dessen `requiresAuth`-Weiche in `decideRoute` **vor** jeder Modulseite greift — und
`AUTH_COOKIE_DOMAIN=.localtest.me` schickt das Cookie ohnehin nicht an `localhost`.
`requireLagerbuchHost` wird auf diesem Weg **nie erreicht**. Wer die Prüfung so wiederholt, glaubt den
Host-Riegel getestet zu haben und hat portals Auth getestet.

**Der Riegel allein wird dort belegt, wo nichts anderes davorsteht** — ein **innerer** Pfad auf einem
fremden Suite-Host: `decideRoute` nimmt für `/m/lagerbuch/…` den Internal-Zweig, `lagerbuch` trägt
`requiresAuth: false`, `canAccess` steigt sofort mit `true` aus, und die Anfrage landet ungefiltert auf
`requireLagerbuchHost`. In T175 gemessen, gleiche Sitzung, gleicher Pfad, nur der `Host` unterscheidet:

| Host | `/m/lagerbuch/verwaltung/artikel` | `/m/lagerbuch/verwaltung/etiketten` | `/m/lagerbuch/manifest.webmanifest` |
|---|---|---|---|
| `files.localtest.me` | **404** | **404** | **404** |
| `portal.localtest.me` | **404** | **404** | **404** |
| `lagerbuch.localtest.me` | 200 | 200 | 200 |

Dauerhaft gehalten wird dieselbe Aussage von `e2e/lagerbuch-hosts.spec.ts` („Host-Riegel"): fünfzehn
Einstiege, je **404 auf `feedback.localtest.me`** und **nicht-404 auf dem eigenen Host**, angemeldet
**mit** Lagerbuch-Gruppe, damit der 404 nicht der Gruppenriegel ist.

### 7.1 Die 29 `page.tsx`

| ☐ | Pfad | Erwartet | Unterscheidendes Merkmal | Verifiziert in |
|---|---|---|---|---|
| ☐ | `/` (Gate) | 200 | Codefeld mit `inputMode="numeric"`, `maxlength="7"` | **Teil 4** ⚠️ |
| ☐ | `/helfer` | 200 | Tab-Leiste, `aria-current="page"` auf „Entnahme" | **Teil 4** ⚠️ |
| ☐ | `/helfer/check` | 200 | Fahrzeugwahl oder Leerzustand mit Rückweg | **Teil 4** ⚠️ |
| ☐ | `/a/<bekannt>` | 200 | Artikelname + Entnahmeknopf | **Teil 4** ⚠️ |
| ☐ | `/a/<unbekannt>` | **200**, nicht 303 | „Dieses Etikett kennt kein Artikel" + „Der Artikel wurde gelöscht oder das Etikett stammt aus einer anderen Anwendung. Bitte der Verwaltung melden." (8-C) ⚠️ Wortlaut aus T175 nachgezogen — hier stand „Dieses Etikett gehört zu keinem Artikel mehr."; die Substanz (200 statt 303, benannter Text) war nie strittig | **Teil 4** ⚠️ |
| ☐ | `/g/<bekannt>` | **307** → `/verwaltung/geraete/<id>` bzw. `/verwaltung/bz/<id>` | `Location`-Kopf, **relativ** ⚠️ Erwartung aus T175 nachgezogen — hier stand 303; `redirect()` in einer Server Component liefert unter Next 16 einen **307**, gemessen an `/g/4012345678901` → `/verwaltung/geraete/ger-defi-rtw1` und `/g/4015630000018` → `/verwaltung/bz/bz-rtw1`. Für einen GET verhalten sich beide gleich; das tragende Merkmal ist und bleibt die **relative** `Location` | **T175** |
| ☐ | `/g/<unbekannt>` | **200**, nicht 404 | „Kein Gerät zu diesem Barcode" + der **gescannte Code im Klartext** + Shell + Modulnavigation | **T175** |
| ☐ | `/verwaltung` | 200 | KPI-Kacheln mit farbiger linker Kante | Teil 5, T151/2 |
| ☐ | `/verwaltung/artikel` | 200 | `Table` + Excel-Knopf **ohne** `disabled` | **T175** (ERGÄNZT durch T165) |
| ☐ | `/verwaltung/journal` | 200 | Δ-Spalte mit ASCII-Vorzeichen | Teil 5, T151/2 |
| ☐ | `/verwaltung/checks` | 200 | Grenzhinweis nur, wenn er gegriffen hat | Teil 5, T151/2 |
| ☐ | `/verwaltung/checks/<id>` | 200 | Positionsdetails oder Alt-Format-Hinweis | Teil 5, T151/2 |
| ☐ | `/verwaltung/inventur` | 200 | Abweichungszähler im Knopftext | Teil 5, T151/2 |
| ☐ | `/verwaltung/bestellung` | 200 | **beide** Knöpfe ohne `disabled`, Beschriftungen `Liste kopieren (nur offene)` / `CSV (alle Zeilen)` | **T175** (ERGÄNZT durch T166) |
| ☐ | `/verwaltung/etiketten` | 200 | Bogen + Zeile „Alle QR-Codes zeigen auf https://…" | **T175** |
| ☐ | `/verwaltung/tokens` | 200 | Code-Spalte, Knopf „Sperren", **kein** „Endgültig löschen" (8-F) | **T175** |
| ☐ | `/verwaltung/fahrzeuge` | 200 | Liste mit echtem `<Link>` in der ersten Spalte | Teil 5, T151/2 |
| ☐ | `/verwaltung/fahrzeuge/<id>` | 200 | Brotkrume (kein `aria-current`) | Teil 5, T151/2 |
| ☐ | `/verwaltung/vorlagen` | 200 | Liste | Teil 5, T151/2 |
| ☐ | `/verwaltung/vorlagen/<id>` | 200 | Brotkrume + Gefahrenzone | Teil 5, T151/2 |
| ☐ | `/verwaltung/geraete` | 200 | Fälligkeits-Chips mit Text | Teil 5, T151/2 |
| ☐ | `/verwaltung/geraete/<id>` | 200 | Brotkrume | Teil 5, T151/2 |
| ☐ | `/verwaltung/geraete/scan` | 200 | Kamera-Insel, vier unterscheidbare Zustände ⚠️ Zusatz aus T175: das sind **Client**-Zustände — `kameraText()` (`_ui/BarcodeScanner.tsx`) verzweigt über `DOMException.name` aus `getUserMedia`. Über `http://` ist `window.isSecureContext` **falsch**, die Insel steigt **vor** dem zxing-Import aus, und ein blosser Abruf zeigt immer nur den **fünften** Zustand (`KEIN_SICHERER_KONTEXT`). Wer die vier sehen will, muss `isSecureContext` und `navigator.mediaDevices` im Browser präparieren — in T175 so gemessen | Teil 5, T151/2 |
| ☐ | `/verwaltung/bz` | 200 | Fälligkeit „noch nie geprüft" als eigener Text | Teil 5, T151/2 |
| ☐ | `/verwaltung/bz/<id>` | 200 | Logbuch mit `ref_snapshot`-Grenzen | Teil 5, T151/2 |
| ☐ | `/verwaltung/bz/<id>/kontrolle` | 200 | `DatePicker picker="month"` mit Label **„Kompressen-Verfall"** (gerendert `picker-month`) ⚠️ Wortlaut aus T175 nachgezogen — hier stand „Verfallsmonat"; die Implementierung (`KontrolleForm.tsx:127-134`) hat den Titel nie so getragen | Teil 5, T151/2 |
| ☐ | `/verwaltung/bz/scan` | 200 | Kamera-Insel | Teil 5, T151/2 |
| ☐ | `/verwaltung/sauerstoff` | 200 | „keine Messung", **nie** „0 %" | Teil 5, T151/2 |
| ☐ | `/verwaltung/sauerstoff/<id>` | 200 | Brotkrume + Messverlauf | Teil 5, T151/2 |
| ☐ | `/verwaltung/import` | 200 | Vorschau vor dem Absendeknopf | Teil 5, T151/2 |
| ☐ | `/verwaltung/verfall` | 200 | `<ul>`/`<li>`, **keine** `Table` | Teil 5, T151/2 |

⚠️ **Das sind 31 Zeilen für 29 Dateien** — `/a/[artikelId]` und `/g/[code]` stehen je zweimal (Treffer
und Nichttreffer), weil genau der Unterschied die Entscheidungen 8-C und 8-C2 trägt. Die 29 Dateien
sind: Gate · `g/[code]` · `a/[artikelId]` · zwei Helfer-Seiten · 23 unter `(arbeit)` · der
Etikettenbogen.

### 7.2 Die 7 Route Handler

| ☐ | Pfad | Erwartet | Unterscheidendes Merkmal | Verifiziert in |
|---|---|---|---|---|
| ☐ | `/t/<gültig>` | **303** | `Location` **relativ**, `Set-Cookie: helfer_session` **ohne** `Domain=` | **T171** (E2E) ⚠️ Teil 4 |
| ☐ | `/t/<ungültig>` | 303 → `/?grund=code` | das Gate **zeigt** den Grund (Falle 60) | **T171** ⚠️ Teil 4 |
| ☐ | `/abmelden` | 303 → `/` | `Set-Cookie: helfer_session=` mit `Max-Age=0`, **ohne** `Domain=` | **T171** ⚠️ Teil 4 |
| ☐ | `/manifest.webmanifest` | 200, `application/manifest+json` | `start_url: "/"`; **auf dem Portal-Host darf er NICHT antworten** | **Teil 4** ⚠️ |
| ☐ | `/pwa-icon.svg` | 200, `image/svg+xml` | Suite-Rot `#c8000f` | **Teil 4** ⚠️ |
| ☐ | `/icon-192.png` | 200, `image/png` | Byte-Länge 1558 | **Teil 4** ⚠️ |
| ☐ | `/icon-512.png` · `/icon-maskable-512.png` | 200, `image/png` | Byte-Längen 5458 · 3290 | **Teil 4** ⚠️ |

⚠️ **Das sind acht Zeilen für sieben Handler** — `icon-512.png` und `icon-maskable-512.png` sind zwei
Dateien in einer Zeile; die sieben Handler sind `t/[code]`, `abmelden`, `manifest.webmanifest`,
`pwa-icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.

### 7.3 Die vier Abrufe, die §6 dazustellt — und die absichtlich werfende Route

| ☐ | Abruf | Warum | Verifiziert in |
|---|---|---|---|
| ☐ | `/verwaltung/artikel` in **beiden** Farbmodi | Kein Gate der Suite rendert ein Modul im Dunkelmodus (§6.6.7). Tabelle: tragen die Chips Farbe? | Teil 5, T151/4 |
| ☐ | `/verwaltung/verfall` in **beiden** Farbmodi | Plakette und Chips: ist die Plakette im Dunkelmodus keine weiße Scheibe? | Teil 5, T151/4 |
| ☐ | `/verwaltung` in **beiden** Farbmodi | KPI-Kacheln: sind die farbigen linken Kanten da? | Teil 5, T151/4 |
| ☐ | **`/verwaltung/etiketten` in beiden Farbmodi** | Der Bogen ist hart `#fff`/`#000` und trägt `.modul` aus `DruckRahmen` — **die einzige Stelle, an der ein fester Farbwert richtig ist** (§6.10.2 Punkt 2). Im Dunkelmodus muss er trotzdem weiß bleiben | **T175, Schritt 4** |
| ☐ | **`/verwaltung/etiketten` mit `page.emulateMedia({ media: "print" })`** | abgewählte Kachel unsichtbar · Auswahlkästchen unsichtbar · Suite-Kopfzeile unsichtbar | **T167** |
| ☐ | **`/verwaltung/etiketten` OHNE Lagerbuch-Gruppe** | muss **dieselbe** Antwort geben wie `/verwaltung/artikel` ohne Gruppe (F3, §6.1.3, §12.4). Die **einzige** Zusicherung, die die Kopplung zwischen den zwei Group-Layouts prüft | **T167, Schritt 6** + **T175** |
| ☐ | **Eine absichtlich werfende Route** | Nachweis der `error.tsx`-Rahmung (§11.2, „Prüfpunkt, keine Behauptung": dass eine Modul-`error.tsx` **innerhalb** von `m/lagerbuch/layout.tsx` rendert, ist an keinem Bestandsmodul ablesbar) | **T175, Schritt 5** |

---

## 8. Die sieben Zusicherungen aus §12.1 — Eigentümer, namentlich

§12.1: „**Sieben Zusicherungen sind die einzige Absicherung ihrer Fachlichkeit**, und … das ist die
Liste, für die ein **ersetzender** Test geschuldet ist, **bevor** die alte Spec gelöscht wird."
§12.3 Regel 3: „Ein neu geschriebener Nachfolgetest, der grün läuft und **etwas anderes prüft** als
vorher, ist schlimmer als ein roter. Jede der sieben Aussagen wird beim Umschreiben **namentlich**
gegen ihre alte Fassung gehalten."

| # | Aussage ohne Netz (alte Fassung) | Neuer Eigentümer | Ebene | Zustand |
|---|---|---|---|---|
| 1 | Das Verfallsfeld im Zählschritt wandert in die Check-Nutzlast, die Vorschau `{n} laufen ab` zählt mit (`CheckFlow.tsx:281,306`) | **Unit:** `_lib/checkNutzlast.ts` (Teil 3) — `checkNutzlast(args)` + `zaehleAblaufende(...)`. **DOM:** `_ui/CheckFlow.test.tsx` (Teil 4). **E2E:** `e2e/lagerbuch-helfer.spec.ts` (**T171**) | 3 | Unit ✅ · DOM ⚠️ Teil 4 · E2E **T171** |
| 2 | Der clientseitige Artikelfilter, inline als `useMemo` (`ArtikelTable.tsx:112-123`) — sucht über Name, Fach **und** Chargennummer | **Unit:** `_lib/artikelFilter.ts` (Teil 3) — `artikelTrifft` / `artikelFiltern`. **Unit dazu (Kopplung):** `bestandExportZeilen(gefiltert)` bekommt **dieselbe** abgeleitete Liste — **T156, Schritt 6** | 2 | Filter ✅ · **Kopplung T156** |
| 3 | Die Entprellung, die den Tastendruck als `?q=` in die URL schreibt, plus der `committedQ`-Tanz (`JournalFilter.tsx:29-36,44-52`) | **DOM:** `verwaltung/(arbeit)/journal/JournalFilter.test.tsx` (Teil 5, T147) — gefälschte Uhr, **ein** Schreibvorgang je Tipppause; `committedQ` selbst steht wörtlich in `JournalFilter.tsx:36`. Gestützt auf `_ui/filter.test.tsx` (T109), das die `useUrlFilter`-Schreibmechanik trägt, aber weder Debounce noch den `committedQ`-Tanz prüft. **E2E:** `e2e/lagerbuch-verwaltung.spec.ts` — T174-Befund: fehlte komplett (`e2e/lagerbuch-verwaltung.spec.ts` (T150) trug bis dahin ausschließlich die vier Modulnavigations-Zusicherungen; T150s eigener Scope nennt `_lib/nav.ts`/`.modulnav`, nicht die Journal-Suche). Per W1 sofort gefixt: T174 ergänzt den Test „Journalsuche schreibt die literale URL" in derselben Datei (Nachfolger von `suche-filter.spec.ts:30`), echt gefahren mit `pnpm build && pnpm exec playwright test e2e/lagerbuch-verwaltung.spec.ts` (7 passed) | 2 | ✅ |
| 4 | `.jdelta.minus` — eine Entnahme erscheint im Journal negativ **und** abgesetzt (`verwaltung-flow.spec.ts:67`) | **Unit:** `_lib/journalZeile.ts` (Teil 3) — `journalZeile({typ,menge})` liefert `mengeText` + `zustand`. **DOM:** `journal/page.tsx`-Test (Teil 5, T147) | 2 | ✅ ⚠️ **nennt NIE einen Hexwert** |
| 5 | Der Chip `bestellt` als Zeilenzustand, mit `exact: true` von der Fußnote getrennt (`inventur.spec.ts:29`) | **DOM:** `/verwaltung/bestellung` (Teil 5, T145). ⚠️ Der Text wird „bestellt seit &lt;Datum&gt;" — die Zusicherung wandert **mit** dem Text, nicht gegen ihn | 1 | ✅ |
| 6 | `Endgültig löschen` bleibt gesperrt, bis der Name exakt getippt ist (`loeschen.spec.ts:50-54`) | **DOM:** `_ui/LoeschDialog.test.tsx` (Teil 5, T110). Reine Client-Zusage, gehört nicht in einen E2E | 1 | ✅ |
| 7 | Der erzeugte Data-URI landet im Bogen als `<img src>` (`etiketten.spec.ts:11-13`) | **DOM:** `EtikettenBogen.test.tsx` (**T162, Schritt 5**) — n Zeilen ergeben n QR-Knoten. ⚠️ **Der Träger wechselt von `<img src="data:…">` auf ein eingesetztes `<svg>`**; die Zusicherung wandert auf `.lb-etikettQr > svg` | 1 | **T162** |

**T174 hakt diese Tabelle ab**, mit `grep` auf Datei **und** Testnamen. Punkt 4, 5 und 7 hängen an
eigenem Markup und gehen beim antd-Umbau sicher kaputt; 1, 2, 3 und 6 hängen an Rollen und
Beschriftungen und gehen kaputt, sobald die Bauteile ersetzt werden — was für `Stepper`,
`Filterleiste` und die Tippbestätigung der **Zweck** der Übung ist.

---

## 9. Global Constraints — was ZUSÄTZLICH aus §8, §9, §11 und §12 folgt

**Die Global Constraints aus Teil 1 (`…-teil1.md`, Abschnitt „Global Constraints") gelten unverändert
weiter und werden hier NICHT wiederholt.** Insbesondere: kein `"use client"` unter `_lib/`/`_db/`,
kein `@ant-design/icons` unter `_lib/`/`_db/` oder in einer Server Component, Client-Pfade in
**äußerer** Form / `revalidatePath` in **innerer** Form, kein `isModuleAdmin`/`session.user.isAdmin`,
DOM-Tests über `@/app/m/qr/_lib/test-dom`, Token-Codeform `NNN-NNN` mit Bindestrich im gespeicherten
Wert. Ebenso gelten die Constraints aus Teil 5 §2 für jede Datei, die eine Verwaltungsseite berührt.

Hier stehen nur die Constraints, die **aus den Kapiteln dieses Plans** folgen.

**Gedruckte Artefakte (§8)**

- **Die Basis-URL des Etikettendrucks kommt AUSSCHLIESSLICH aus `moduleUrl("lagerbuch")`** — nie aus
  `resolveHost(headers)` (fälschbarer `x-forwarded-host`; ein manipulierter Kopf druckte einen ganzen
  Bogen auf eine fremde Domain, und der Fehler zeigte sich erst beim Scannen eines geklebten
  Etiketts) und nie aus einem modul-eigenen `APP_BASE_URL` (eine **sechste** Wahrheit neben
  `SUITE_HOST_LAGERBUCH`).
- **`moduleUrl` liefert `null` → der Bogen verweigert sich mit Meldung.** Verboten ist beides, was
  ohne diese Regel passiert: ein QR mit dem Text `null/a/<id>`, und ein stiller Rückfall auf einen
  **relativen** Pfad — ein relativer QR ist auf Papier bedeutungslos und sieht auf dem Bildschirm
  richtig aus.
- **Der verwendete Host steht als Text über dem Bogen** (Klasse `lb-nichtDrucken`), damit die Person
  vor dem Drucken sieht, was sie druckt. Das ist der **einzige** Weg, eine Umsortierung von
  `SUITE_HOST_LAGERBUCH` vor dem Papier zu bemerken.
- **Die Geometrie ist 1:1-Pflicht 22 und zeichengleich:** Etikett 48.5mm × 25.4mm · Raster
  `repeat(auto-fill, 48.5mm)` · `gap` **2mm am Bildschirm, 0 im Druck** · QR 20mm × 20mm ·
  `padding: 2mm`, `gap: 2.5mm` · `@page { margin: 8mm }` · abgewählt **`opacity: .35`** am
  Bildschirm, **`display: none`** im Druck · Titel `font: 700 11px`, Unterzeile `font: 600 9px`
  monospace. ⚠️ **Der `gap`-Unterschied ist die heikelste Zeile:** wer nur die Bildschirmansicht
  portiert, übernimmt das falsche Raster und merkt es erst am Drucker.
- **`body * { visibility: hidden }` wandert NICHT mit** (Falle 43). Es ist per CSS-Modul nicht
  kapselbar und leerte jede andere Druckseite der Suite — feedback-Aushang, files-Zugangslinks. Die
  Sichtbarkeitsumkehr wird **ersatzlos** durch die eigene Route-Gruppe ersetzt: ohne Shell gibt es
  nichts auszublenden.
- **`druck.css` ist ein GEWÖHNLICHES Stylesheet, kein CSS-Modul** — die Namen sind global und tragen
  deshalb alle das Präfix `lb-`. Es ist der **einzige** Ort des Moduls mit `@media print`.
- **Der QR kommt aus `core/qr` (Level H, `margin: 4`), als SVG, unverändert.** `qrSvg` ist `async`
  → **`etikettenDaten` wird selbst `async`** und erzeugt die Codes eines Bogens über **ein**
  `await Promise.all(...)`. ⚠️ Ein fehlendes `await` ergibt hier keine Fehlermeldung, sondern
  `[object Promise]` als Markup.
- **`.lb-etikettQr > svg { display: block; width: 20mm; height: 20mm }` ist Pflicht** — das
  `qrcode`-SVG bringt nur eine `viewBox` mit, keine Breite/Höhe. Ohne die Regel fällt der Code auf
  die Ersatzgröße des Browsers zurück und wird winzig, **ohne dass ein Test anschlägt**.
- **Die Auswahl bleibt ein nacktes `<input type="checkbox">` mit `lb-nichtDrucken`**, kein
  antd-`Checkbox` (§6.10.2 Punkt 1). Das Druck-CSS greift **nie** auf `input` und **nie** auf `.ant-*`.
- **Ein Token kann nur noch gesperrt werden** (8-F). Der Hard-Delete fällt; der Code bleibt für immer
  belegt. `last_used_at` ist danach **kein Löschbarkeitsschalter mehr**, sondern nur noch die
  Auskunft „nie benutzt" mit genau einem Leser.

**Ausgabeformate (§9)**

- **Die drei Wege sind 1:1-Pflicht und liefern verschieden viele Zeilen** — CSV: **alle**;
  Zwischenablage: **nur die offenen**; Excel: die **gefilterte und sortierte** Liste. Eine stille
  Vereinheitlichung wäre eine Fachentscheidung im Gewand einer Aufräumarbeit. Geändert werden
  **nur** die zwei Knopfbeschriftungen.
- **CSV-Dialekt:** Semikolon, **jede** Zelle gequotet mit verdoppelten `"`, Zeilentrenner **`\n`
  (nicht CRLF)**, **kein BOM**, konstanter Dateiname `bestellvorschlag.csv` **ohne Datum**.
  ⚠️ Ein nachgerüstetes BOM kann einen Abnehmer stromabwärts brechen, ohne dass es im Modul sichtbar
  wird — und es verfehlte ausgerechnet die Kopfzeilenerkennung des modul-eigenen Importers.
- **Formel-Neutralisierung nur auf Textspalten.** `-` ist zugleich das Vorzeichen jeder negativen
  Zahl; eine Regel im Dialekt-Helfer machte aus `-3` die Zeichenkette `"'-3"`, die in jeder
  Kalkulation als **TEXT** ankommt und die Spalte unsummierbar macht. Die Kopfzeile läuft
  ausdrücklich durch `csvZelle`, **nicht** durch `csvTextZelle`.
- **Zwischenablage: U+00D7 MULTIPLICATION SIGN, nicht ASCII `x`.** Zeilenform `${vorschlag} × ${name}`,
  nur `!bestellt`. Meldungen bleiben wortgleich: `Bestellliste kopiert` / `Kopieren fehlgeschlagen`.
- **`navigator.clipboard` wird auf Vorhandensein geprüft, nicht angenommen.** Unter
  `lagerbuch.localtest.me` ist es `undefined` — Browser bewerten die **Hostzeichenkette**
  (`localhost`, `*.localhost`, `127.0.0.1`), nicht die aufgelöste Adresse. Ohne Prüfung meldet die
  Oberfläche `Kopieren fehlgeschlagen` und das liest sich wie ein Fehler des Moduls.
- **E2E behauptet nichts über die Zwischenablage.** Ein Playwright-Test, der `navigator.clipboard`
  liest, prüft die Browserrechte des Testlaufs, nicht das Modul.
- **Die neun Excel-Spalten stehen außerhalb der Client-Grenze** (`_lib/bestandExportSpalten.ts`,
  ohne `"use client"`). Bleiben sie in der Insel, bekommt eine Server Component eine
  Client-Referenz statt des Wertes: HTTP 500, `typecheck` und `build` grün, **Vitest strukturell
  blind** (Falle 6).
- **Der Excel-Dateiname wird im BROWSER gebildet** (`new Date()`), also aus der Zeitzone des
  Arbeitsplatzes. Wandert die Bildung je auf den Server, ist `heuteIso()` aus `_lib/zeit.ts` der
  richtige Aufruf — nicht lokale Datumskomponenten.
- **`write-excel-file` wird beim Klick nachgeladen** (`await import("write-excel-file/browser")`),
  nicht statisch importiert.
- **Der Formelschutz berührt den Excel-Pfad NICHT** (9-G): jede nicht-numerische Zelle geht als
  `{ value: String(…), type: String }` und wird von der Bibliothek als Textzelle angelegt.

**Fehlerzustände (§11)**

- **Es gibt `m/lagerbuch/error.tsx`, und es gibt ausdrücklich KEINE `m/lagerbuch/not-found.tsx`**
  (Entscheidung 36 (b) verworfen). Die verbleibenden `notFound()`-Würfe sind Riegel, und für die ist
  die Suite-404 die richtige und bereits gehärtete Form.
- **Keine `loading.tsx`, in keiner Route.** Alle Einstiegsseiten sind `force-dynamic`; eine
  Ladegrenze kürzte nichts ab, sondern erzeugte eine zweite Anmutung.
- **`/g/<code>` antwortet 200 statt 404**, im `_ui/VerwaltungsRahmen.tsx`, **mit** Shell und
  Modulnavigation — „ohne Shell und ohne Modulnavigation" ist **ein Teil dessen**, was hier repariert
  wird. `notFound()` verschwindet aus dieser Datei.
- **`/a/<id>` und `/g/<code>` sind die ZWEI benannten Ausnahmen.** Alle übrigen
  Verwaltungs-Detailseiten mit unbekannter ID behalten die Suite-404 (§11.5, Zustand 16) — dort steht
  kein Mensch mit einem gescannten Gegenstand in der Hand.
- **Fehler kommen als Rückgabewert an, nie über `e.message`.** `e.message` ist in Produktion der
  englische Satz über eine „server-side exception" (Falle 66). Der Wurf bleibt allein dem Riegelfall
  vorbehalten.
- **Jeder gestaltete Zustand trägt einen benannten Weg zurück** (§11.7) — in die Liste, auf den
  Scanner oder aufs Gate.
- **Kein `Alert type="error"`, nirgends im Modul** (§11.6). Fehler tragen `type="warning"` oder Text
  plus 3px linke Kante; `colorError === colorPrimary === #c8000f`, und Rot trägt in diesem Modul
  fachliche Bedeutung.
- **Jeder Zustand trägt Text, nie Farbe allein.**

**Tests (§12)**

- **Kein `.first()` und keine Zusicherung, die an der Reihenfolge früherer Specs hängt.** Playwright
  fährt alle Dateien in **einem** Worker gegen **eine** SQLite-Datei. Der benötigte Zustand wird **im
  Test selbst** hergestellt.
- **Keine defensiven Übersprünge.** Ein `if (await x.count())` liefe ohne Voraussetzung grün **ohne
  Zusicherung** durch. Fehlt eine Voraussetzung, wird der Test **rot**.
- **Antds interne Klassen sind kein Ersatz für eine eigene.** `.ant-drawer-body` ist eine schlechtere
  Kopplung; die Suite geht sie an **genau einer** Stelle bewusst ein. Ersatz sind Rollen,
  Beschriftungen oder `data-testid`.
- **Jede Rollen-Zusicherung wird EINMAL gegen das gerenderte Bauteil geprüft**, nicht gegen die
  Absicht.
- **Mobile Zusagen werden bei 390×844, 1280×720 UND 834×1112 gemessen** — wer nur die Enden misst,
  prüft die Mitte nicht, und die Mitte ist jedes Tablet im Hochformat.
- **jsdom kann Media Queries strukturell nicht auswerten.** Ein Vitest, der „auf 390px ist X
  unsichtbar" behauptet, geht **immer** durch. Vitest besitzt hier nur die Aussage „die Klasse trägt
  die richtige Media Query" als Quelltext-Scan.

---

## Welle 1 — Die reinen Werte (6 Tasks, alle parallel)

Sechs Dateien unter `_lib/`, keine mit `"use client"`, keine mit einem Icon-Import, keine mit einer
Abhängigkeit zu einer anderen davon. Sie sind die Verträge, die das Modul verlassen — und genau
deshalb liegen sie außerhalb jeder Client-Grenze.

### Task 153: `_lib/etikettMasse.ts` — die Millimeter, die beide Seiten kennen müssen

**Files:**
- Create: `src/app/m/lagerbuch/_lib/etikettMasse.ts`
- Test: `src/app/m/lagerbuch/_lib/etikettMasse.test.ts`

**Interfaces:**
- Consumes: nichts. **Die früheste Datei dieses Plans.**
- Produces:
  ```ts
  export const ETIKETT_BREITE_MM: 48.5;
  export const ETIKETT_HOEHE_MM: 25.4;
  export const ETIKETT_QR_MM: 20;
  export const ETIKETT_PADDING_MM: 2;
  export const ETIKETT_SPALT_MM: 2.5;
  export const BOGEN_GAP_BILDSCHIRM_MM: 2;
  export const BOGEN_GAP_DRUCK_MM: 0;
  export const SEITENRAND_MM: 8;
  export const ETIKETT_ABGEWAEHLT_OPAZITAET: 0.35;
  export function mm(wert: number): string;      // 48.5 → "48.5mm"
  ```
  Konsumenten: `verwaltung/(druck)/etiketten/EtikettenBogen.tsx` (T162, Client) und
  `verwaltung/(druck)/etiketten/druck.test.ts` (T161, Server) — **genau die zwei Seiten, um die es
  geht**.

**Warum diese Datei existiert, und warum der Fehler ohne sie still ist.** §8.4 ist ausdrücklich:
„Die Millimeterwerte, die Server- **und** Client-Seite kennen müssen (Etikettbreite, QR-Kante — sie
sind Testgegenstand), gehören in `_lib/etikettMasse.ts` **ohne** `"use client"`. Ein
`export const ETIKETT_BREITE_MM = 48.5` in `EtikettenBogen.tsx` erreicht eine Server Component nicht
als Wert, sondern als **Client-Referenz**: HTTP 500 für die ganze Seite, `typecheck` und `build`
grün, **und Vitest kann es strukturell nicht sehen**" (Falle 6).

⚠️ **Diese Datei hält NUR die Werte, die beide Seiten brauchen.** `_lib/grenzen.ts` hält bewusst
keine Millimeter (§10.3) — dort stehen die Zahlen, die aus der **Umgebung** kommen; hier stehen die,
die an ein **physisches Bogenformat** gebunden sind und deshalb nie konfigurierbar werden.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/etikettMasse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ETIKETT_BREITE_MM, ETIKETT_HOEHE_MM, ETIKETT_QR_MM, ETIKETT_PADDING_MM,
  ETIKETT_SPALT_MM, BOGEN_GAP_BILDSCHIRM_MM, BOGEN_GAP_DRUCK_MM,
  SEITENRAND_MM, ETIKETT_ABGEWAEHLT_OPAZITAET, mm,
} from "./etikettMasse";

/**
 * 1:1-PFLICHT 22 (§8.4). Diese Zahlen sind auf GEKAUFTE Standard-Klebeetiketten
 * abgestimmt; jeder Fehlversuch verbraucht ein Blatt. Die Erwartungswerte stehen
 * hier als LITERALE und nicht als Import — sonst prueft der Test die Datei gegen
 * sich selbst und bleibt auch dann gruen, wenn jemand 48.5 in 48 aendert.
 */
describe("etikettMasse", () => {
  it("traegt die Geometrie aus globals.css:265-282 zeichengleich", () => {
    expect(ETIKETT_BREITE_MM).toBe(48.5);          // globals.css:265,266
    expect(ETIKETT_HOEHE_MM).toBe(25.4);           // :266
    expect(ETIKETT_QR_MM).toBe(20);                // :268
    expect(ETIKETT_PADDING_MM).toBe(2);            // :266
    expect(ETIKETT_SPALT_MM).toBe(2.5);            // :266
    expect(SEITENRAND_MM).toBe(8);                 // :276  @page{margin:8mm}
  });

  /**
   * DIE HEIKELSTE ZEILE DER TABELLE (§8.4): der Abstand ist am Bildschirm 2mm und
   * auf dem Papier 0. Wer nur die Bildschirmansicht portiert, uebernimmt das
   * falsche Raster und merkt es erst am Drucker.
   */
  it("unterscheidet den Abstand zwischen Bildschirm und Druck", () => {
    expect(BOGEN_GAP_BILDSCHIRM_MM).toBe(2);       // globals.css:265
    expect(BOGEN_GAP_DRUCK_MM).toBe(0);            // :279
    expect(BOGEN_GAP_BILDSCHIRM_MM).not.toBe(BOGEN_GAP_DRUCK_MM);
  });

  it("haelt die Abwahl am Bildschirm bei .35 — sichtbar, nicht weg", () => {
    expect(ETIKETT_ABGEWAEHLT_OPAZITAET).toBe(0.35); // globals.css:267
  });

  it("formatiert ohne nachlaufende Null", () => {
    expect(mm(48.5)).toBe("48.5mm");
    expect(mm(20)).toBe("20mm");
    expect(mm(0)).toBe("0mm");
  });

  /**
   * KEIN "use client" — Falle 6. Die Datei wird von einer Server Component
   * (druck.test.ts liest sie, page.tsx erbt sie ueber die Insel) UND von einer
   * Client-Insel gelesen. Mit "use client" bekaeme die Server-Seite eine
   * Client-Referenz statt des Wertes: HTTP 500, build gruen, Vitest blind.
   */
  it("traegt kein use client", () => {
    const quelle = readFileSync(join(__dirname, "etikettMasse.ts"), "utf8");
    expect(quelle).not.toMatch(/["']use client["']/);
  });
});
```

- [ ] **Schritt 2: Rot sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/etikettMasse.test.ts
```

Erwartet: `Error: Failed to load url ./etikettMasse` bzw.
`Cannot find module './etikettMasse'` — die Datei gibt es noch nicht.

- [ ] **Schritt 3: Die Datei schreiben**

`src/app/m/lagerbuch/_lib/etikettMasse.ts`:

```ts
/**
 * DIE GEOMETRIE DES ETIKETTENBOGENS — 1:1-Pflicht 22 (Spec §8.4).
 *
 * KEIN "use client". Diese Werte liest die Client-Insel EtikettenBogen.tsx UND
 * der serverseitige Quelltext-Scan druck.test.ts. Ein Wert aus einem als Client
 * markierten Modul kommt in einer Server Component nicht als Wert an, sondern
 * als Client-Referenz — HTTP 500 fuer die ganze Seite, waehrend `typecheck` und
 * `build` gruen bleiben und Vitest es strukturell nicht sehen kann (Falle 6,
 * CLAUDE.md:24-27).
 *
 * WARUM HIER UND NICHT IN _lib/grenzen.ts: grenzen.ts haelt die Zahlen, die aus
 * der UMGEBUNG kommen und dort eine Einheit im Namen tragen (§10.3). Diese hier
 * kommen aus einem gekauften Bogen Klebeetiketten. Sie werden nie
 * konfigurierbar, und eine Env-Variable dafuer waere ein Angebot, ein Blatt
 * Material falsch zu bedrucken.
 *
 * Belege, Zeile fuer Zeile, aus `../lagerbuch/src/app/globals.css`:
 *   :265  grid-template-columns: repeat(auto-fill, 48.5mm); gap: 2mm
 *   :266  width 48.5mm; height 25.4mm; padding 2mm; gap 2.5mm
 *   :267  .etikett.deselected { opacity: .35 }
 *   :268  .etikett img { width: 20mm; height: 20mm }
 *   :276  @page { margin: 8mm }
 *   :279  @media print .etikettbogen { gap: 0 }
 */

export const ETIKETT_BREITE_MM = 48.5;
export const ETIKETT_HOEHE_MM = 25.4;
export const ETIKETT_QR_MM = 20;
export const ETIKETT_PADDING_MM = 2;
export const ETIKETT_SPALT_MM = 2.5;

/**
 * DER ABSTAND IST AM BILDSCHIRM 2mm UND AUF DEM PAPIER 0 — und das ist keine
 * Nachlaessigkeit, sondern die Bauform: am Bildschirm trennt der Spalt die
 * Kacheln sichtbar, auf dem Bogen sitzen die Klebeetiketten Kante an Kante.
 * Wer nur die Bildschirmansicht portiert, druckt ein verschobenes Raster.
 */
export const BOGEN_GAP_BILDSCHIRM_MM = 2;
export const BOGEN_GAP_DRUCK_MM = 0;

export const SEITENRAND_MM = 8;

/** Abgewaehlt am Bildschirm: blass, aber sichtbar. Im Druck dagegen
 *  `display: none` — `opacity: 0` liesse den Platz stehen und verschoebe alles
 *  Folgende um eine Kachel (druck.css, §8.4). */
export const ETIKETT_ABGEWAEHLT_OPAZITAET = 0.35;

/** `48.5` → `"48.5mm"`. `String(48.5)` liefert "48.5", `String(20)` liefert
 *  "20" — keine nachlaufende Null, und genau so stehen die Werte im CSS. */
export function mm(wert: number): string {
  return `${wert}mm`;
}
```

- [ ] **Schritt 4: Grün sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/etikettMasse.test.ts
```

- [ ] **Schritt 5: Commit**

```bash
rtk git add src/app/m/lagerbuch/_lib/etikettMasse.ts \
            src/app/m/lagerbuch/_lib/etikettMasse.test.ts
rtk git commit -m "feat(lagerbuch): Etikettengeometrie als Werte ausserhalb der Client-Grenze

1:1-Pflicht 22 (Spec §8.4): 48.5 x 25.4 mm, QR 20 mm, @page-Rand 8 mm.

Die Datei traegt KEIN \"use client\", und das ist der ganze Zweck: die Werte
liest die Client-Insel EtikettenBogen.tsx UND der serverseitige Scan
druck.test.ts. Aus einem Client-Modul erreichte ein WERT eine Server Component
nur als Referenz — HTTP 500 fuer die Seite, bei gruenem build und einem Vitest,
der das strukturell nicht sehen kann (Falle 6).

Der Test haelt die Erwartungswerte als Literale, nicht als Import: sonst
prueft er die Datei gegen sich selbst."
```

### Task 154: `_lib/csvZelle.ts` und `_lib/csvBestellung.ts` — der Byte-Vertrag

**Files:**
- Create: `src/app/m/lagerbuch/_lib/csvZelle.ts`, `src/app/m/lagerbuch/_lib/csvBestellung.ts`
- Test: `src/app/m/lagerbuch/_lib/csvBestellung.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  // _lib/csvZelle.ts
  export function csvZelle(s: string | number): string;
  export function csvTextZelle(s: string): string;

  // _lib/csvBestellung.ts
  export type BestellCsvZeile = {
    name: string; bestand: number; mindestbestand: number;
    vorschlag: number; einheit: string; bestellt: boolean;
  };
  export const BESTELL_CSV_KOEPFE: readonly [
    "Artikel", "Bestand", "Mindestbestand", "Vorschlag", "Einheit", "Status",
  ];
  export const BESTELL_CSV_DATEINAME: "bestellvorschlag.csv";
  export function baueBestellCsv(zeilen: BestellCsvZeile[]): string;
  ```
  Konsument: `verwaltung/(arbeit)/bestellung/BestellListe.tsx` (T166, **ERGÄNZT** Teil 5 T145).

**Zwei Dateien und nicht eine, und der Grund steht in der Spec ausgeschrieben.** `csvZelle.ts` ist
der **Dialekt** (wie wird eine Zelle geschrieben), `csvBestellung.ts` ist der **Vertrag** (welche
Spalten, welche Reihenfolge, welcher Dateiname). Sie zusammenzulegen wäre die naheliegende
Vereinfachung — und sie ist genau der Fehler, gegen den §9.2 den Kommentar in `csvTextZelle`
geschrieben hat: die Neutralisierung gehört **nicht** in den Dialekt.

⚠️ **`-` ist zugleich das Vorzeichen jeder negativen Zahl.** Eine Neutralisierung im Dialekt-Helfer
machte aus einem Wert `-3` die Zeichenkette `"'-3"`, die in jeder Kalkulation als **TEXT** ankommt
und die Spalte unsummierbar macht. Heute erzeugt kein Buchungsweg einen negativen Bestand (I2,
§5.2.2) — die Falle wäre also **still** und schlüge erst zu, wenn irgendwann eine Differenzspalte
hinzukommt.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/csvBestellung.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { csvZelle, csvTextZelle } from "./csvZelle";
import {
  BESTELL_CSV_KOEPFE, BESTELL_CSV_DATEINAME, baueBestellCsv,
  type BestellCsvZeile,
} from "./csvBestellung";

const ZEILEN: BestellCsvZeile[] = [
  { name: "Mullbinde 8cm",  bestand: 12, mindestbestand: 20, vorschlag: 8,  einheit: "Stk.", bestellt: false },
  { name: "Kompresse 10x10", bestand: 0, mindestbestand: 40, vorschlag: 40, einheit: "Pkg.", bestellt: true  },
  { name: 'Handschuh "M"',  bestand: 5,  mindestbestand: 30, vorschlag: 25, einheit: "Paar", bestellt: false },
];

describe("csvZelle", () => {
  /** 1:1 aus BestellListe.tsx:8. Aendert NIE den Zellinhalt. */
  it("quotet jede Zelle und verdoppelt enthaltene Anfuehrungszeichen", () => {
    expect(csvZelle("Mullbinde")).toBe('"Mullbinde"');
    expect(csvZelle('Handschuh "M"')).toBe('"Handschuh ""M"""');
    expect(csvZelle(12)).toBe('"12"');
  });

  /**
   * ENTSCHEIDUNG 9-C: Neutralisierung NUR auf Textspalten. Die Trennung ist
   * genau die Stelle, an der eine Ein-Zeilen-Loesung falsch waere.
   */
  it("neutralisiert ein fuehrendes =/+/-/@ nur ueber csvTextZelle", () => {
    expect(csvTextZelle("=1+1")).toBe(`"'=1+1"`);
    expect(csvTextZelle("+49")).toBe(`"'+49"`);
    expect(csvTextZelle("-Rest")).toBe(`"'-Rest"`);
    expect(csvTextZelle("@mail")).toBe(`"'@mail"`);
  });

  it("laesst harmlose Texte unberuehrt", () => {
    expect(csvTextZelle("Mullbinde 8cm")).toBe('"Mullbinde 8cm"');
    expect(csvTextZelle("A2-Fach")).toBe('"A2-Fach"');  // Minus NICHT am Anfang
  });

  /**
   * DIE ZEILE, WEGEN DER DIE NEUTRALISIERUNG NICHT IN csvZelle GEHOERT: `-` ist
   * zugleich das Vorzeichen. `"'-3"` kaeme in jeder Kalkulation als TEXT an und
   * machte die Spalte unsummierbar — still, weil heute kein Buchungsweg einen
   * negativen Bestand erzeugt (I2, §5.2.2).
   */
  it("laesst eine negative ZAHL unangetastet", () => {
    expect(csvZelle(-3)).toBe('"-3"');
    expect(csvZelle(-3)).not.toContain("'");
  });
});

describe("baueBestellCsv", () => {
  it("traegt sechs Koepfe in dieser Reihenfolge", () => {
    expect(BESTELL_CSV_KOEPFE).toEqual([
      "Artikel", "Bestand", "Mindestbestand", "Vorschlag", "Einheit", "Status",
    ]);
  });

  it("trennt mit Semikolon, nicht mit Komma", () => {
    const kopf = baueBestellCsv([]).split("\n")[0];
    expect(kopf).toBe('"Artikel";"Bestand";"Mindestbestand";"Vorschlag";"Einheit";"Status"');
  });

  /**
   * Die Kopfzeile laeuft durch csvZelle, NICHT durch csvTextZelle: sie besteht
   * aus festen Literalen, und ein Apostroph davor waere eine Formataenderung
   * ohne jeden Anlass (§9.2).
   */
  it("neutralisiert die Kopfzeile nicht", () => {
    expect(baueBestellCsv([]).split("\n")[0]).not.toContain("'");
  });

  it("gibt die Beispielausgabe aus §9.2 zeichengleich zurueck", () => {
    expect(baueBestellCsv(ZEILEN)).toBe(
      '"Artikel";"Bestand";"Mindestbestand";"Vorschlag";"Einheit";"Status"\n' +
      '"Mullbinde 8cm";"12";"20";"8";"Stk.";"offen"\n' +
      '"Kompresse 10x10";"0";"40";"40";"Pkg.";"bestellt"\n' +
      '"Handschuh ""M""";"5";"30";"25";"Paar";"offen"',
    );
  });

  it("nennt den Status genau `bestellt` bzw. `offen`", () => {
    const zeilen = baueBestellCsv(ZEILEN).split("\n").slice(1);
    expect(zeilen[0].endsWith('"offen"')).toBe(true);
    expect(zeilen[1].endsWith('"bestellt"')).toBe(true);
  });

  /**
   * BYTE-VERGLEICH, kein Textvergleich: nur er sieht ein fehlendes BOM. Beide
   * Eigenschaften sind heutiges Verhalten (BestellListe.tsx:31) und damit
   * 1:1-Pflicht — ein nachgeruestetes BOM kann einen Abnehmer stromabwaerts
   * brechen, ohne dass es im Modul sichtbar wird (§9.2).
   */
  it("traegt kein Byte-Order-Mark und `\\n` statt CRLF", () => {
    const bytes = Buffer.from(baueBestellCsv(ZEILEN), "utf8");
    expect(bytes[0]).not.toBe(0xef);          // EF BB BF waere das UTF-8-BOM
    expect(bytes.includes(0x0d)).toBe(false); // kein CR irgendwo
    expect(bytes.includes(0x0a)).toBe(true);  // aber LF
  });

  it("haelt den Dateinamen konstant und ohne Datum", () => {
    expect(BESTELL_CSV_DATEINAME).toBe("bestellvorschlag.csv");
    expect(BESTELL_CSV_DATEINAME).not.toMatch(/\d/);
  });

  /**
   * ZEILENUMFANG: ALLE Zeilen, auch die bereits als bestellt markierten
   * (BestellListe.tsx:30 — kein Filter). Die Zwischenablage nimmt nur die
   * offenen; die beiden Wege duerfen auseinanderlaufen und tun es (9-A).
   */
  it("nimmt auch die bereits bestellten Zeilen mit", () => {
    expect(baueBestellCsv(ZEILEN).split("\n")).toHaveLength(1 + 3);
  });

  it("traegt in beiden Dateien kein use client", () => {
    for (const datei of ["csvZelle.ts", "csvBestellung.ts"]) {
      const quelle = readFileSync(join(__dirname, datei), "utf8");
      expect(quelle, datei).not.toMatch(/["']use client["']/);
    }
  });
});
```

- [ ] **Schritt 2: Rot sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/csvBestellung.test.ts
```

Erwartet: `Failed to load url ./csvZelle` — beide Module fehlen.

- [ ] **Schritt 3: `csvZelle.ts` schreiben**

`src/app/m/lagerbuch/_lib/csvZelle.ts`:

```ts
/**
 * DER CSV-DIALEKT DES MODULS — kein "use client" (Falle 6).
 *
 * Zwei Funktionen und eine harte Trennung zwischen ihnen. Sie zusammenzulegen
 * ist die naheliegende Vereinfachung und der eine Fehler, den §9.2 ausschreibt.
 */

/** Dialekt: jede Zelle gequotet, enthaltene Anfuehrungszeichen verdoppelt.
 *  1:1 aus BestellListe.tsx:8. Aendert NIE den Zellinhalt. */
export function csvZelle(s: string | number): string {
  return `"${String(s).replaceAll('"', '""')}"`;
}

/** Formel-Neutralisierung — NUR fuer Textspalten. Ein fuehrendes =/+/-/@ wird von
 *  Tabellenkalkulationen als Formelbeginn gelesen; der Apostroph markiert die Zelle
 *  als Text.
 *
 *  WARUM NICHT IN csvZelle, also nicht fuer alle sechs Spalten: eine Zahlenspalte
 *  kann per Konstruktion keine Formel tragen — die Neutralisierung waere dort reine
 *  Kosten. Und `-` ist zugleich das Vorzeichen jeder negativen Zahl: eine Regel im
 *  Dialekt-Helfer machte aus einem Wert -3 die Zeichenkette "'-3", die in jeder
 *  Kalkulation als TEXT ankommt und die Spalte unsummierbar macht. Heute erzeugt
 *  kein Buchungsweg einen negativen Bestand (I2, §5.2.2) — die Falle waere also
 *  still und schluege erst zu, wenn irgendwann eine Differenzspalte hinzukommt.
 *
 *  DIE SCHWERE, MIT MASS: jede Textzelle stammt aus einem admin-geschuetzten
 *  Schreibpfad (createArtikel/updateArtikel/importArtikelCsv, alle mit Riegel);
 *  der einzige Schreibweg unterhalb von Admin ist bucheEntnahmeHelfer, und der
 *  schreibt eine MENGE, nie eine Textzelle. Das Risiko lautet "ein Admin tippt
 *  etwas, das ein anderer Admin spaeter in Excel oeffnet".
 */
export function csvTextZelle(s: string): string {
  return csvZelle(/^[=+\-@]/.test(s) ? `'${s}` : s);
}
```

- [ ] **Schritt 4: `csvBestellung.ts` schreiben**

`src/app/m/lagerbuch/_lib/csvBestellung.ts`:

```ts
import { csvZelle, csvTextZelle } from "./csvZelle";

/**
 * DER VERTRAG `bestellvorschlag.csv` — kein "use client" (Falle 6).
 *
 * Das ist eine Datei mit einem Abnehmer AUSSERHALB des Repos. Sie ist deshalb
 * 1:1-Pflicht 28, und zwar in jedem Byte: sechs Koepfe in dieser Reihenfolge,
 * Semikolon, jede Zelle gequotet, `\n` statt CRLF, kein BOM, konstanter
 * Dateiname ohne Datum.
 *
 * WAS AUSDRUECKLICH NICHT "MIT REPARIERT" WIRD: das fehlende BOM und das `\n`.
 * Ein nachgeruestetes BOM kann einen Abnehmer stromabwaerts brechen, ohne dass
 * es im Modul sichtbar wird — und es verfehlte ausgerechnet die
 * Kopfzeilenerkennung des modul-eigenen Importers (../lagerbuch/src/lib/csv.ts:24-27).
 * Ebenso unveraendert: der konstante Dateiname, obwohl wiederholte Downloads im
 * Download-Ordner kollidieren. Ein datierter Name waere eine Verbesserung — und
 * eine Formataenderung.
 */

export type BestellCsvZeile = {
  name: string; bestand: number; mindestbestand: number;
  vorschlag: number; einheit: string; bestellt: boolean;
};

/** 1:1-Pflicht 28: sechs Koepfe, diese Reihenfolge, deutsche Beschriftung.
 *  Exportiert, damit der Test gegen die Konstante prueft und nicht gegen eine
 *  zweite Abschrift derselben Liste. */
export const BESTELL_CSV_KOEPFE = [
  "Artikel", "Bestand", "Mindestbestand", "Vorschlag", "Einheit", "Status",
] as const;

export const BESTELL_CSV_DATEINAME = "bestellvorschlag.csv";

export function baueBestellCsv(zeilen: BestellCsvZeile[]): string {
  // Die Kopfzeile laeuft durch csvZelle, NICHT durch csvTextZelle: feste
  // Literale, ein Apostroph davor waere eine Formataenderung ohne Anlass.
  const kopf = BESTELL_CSV_KOEPFE.map(csvZelle).join(";");
  const reihen = zeilen.map((z) =>
    [
      csvTextZelle(z.name),
      csvZelle(z.bestand),
      csvZelle(z.mindestbestand),
      csvZelle(z.vorschlag),
      csvTextZelle(z.einheit),
      // `Status` ist ein Code-Literal und kann nie ein Praefix tragen — es laeuft
      // trotzdem durch csvTextZelle, damit die drei Textspalten EINE Regel haben.
      csvTextZelle(z.bestellt ? "bestellt" : "offen"),
    ].join(";"),
  );
  // "\n", nicht CRLF; kein BOM. Beides 1:1 aus BestellListe.tsx:31.
  return [kopf, ...reihen].join("\n");
}
```

- [ ] **Schritt 5: Grün sehen — und die drei Zeilen markieren, die A-J1 umkehren würde**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/csvBestellung.test.ts
```

Trägt der Betreiber nach, dass der Abnehmer ein **maschineller Importer** ist (Betreiberfrage 7 /
A29), kehrt sich genau ein Spiegelstrich um: in `baueBestellCsv` werden die **drei** Aufrufe von
`csvTextZelle` durch `csvZelle` ersetzt, und die zwei Testfälle „neutralisiert ein führendes …" und
„lässt harmlose Texte unberührt" werden zu einem Fall zusammengezogen. **Nichts anderes ändert
sich** — das ist der Grund, warum die Neutralisierung an genau einer Stelle sitzt.

- [ ] **Schritt 6: Commit**

```bash
rtk git add src/app/m/lagerbuch/_lib/csvZelle.ts \
            src/app/m/lagerbuch/_lib/csvBestellung.ts \
            src/app/m/lagerbuch/_lib/csvBestellung.test.ts
rtk git commit -m "feat(lagerbuch): bestellvorschlag.csv als Byte-Vertrag, Dialekt getrennt vom Format

1:1-Pflicht 28 (Spec §9.2): sechs Koepfe, Semikolon, jede Zelle gequotet,
\\n statt CRLF, kein BOM, konstanter Dateiname ohne Datum.

Entscheidung 9-C, Formel-Neutralisierung: NUR auf den drei Textspalten. Sie
gehoert nicht in csvZelle, weil `-` zugleich das Vorzeichen jeder negativen Zahl
ist — eine Regel im Dialekt machte aus -3 die Zeichenkette \"'-3\", die als TEXT
ankommt und die Spalte unsummierbar macht. Der Test haelt beide Haelften
auseinander.

BOM und Zeilentrenner werden per Byte-Vergleich geprueft; jeder Textvergleich
ist fuer ein fehlendes BOM blind."
```

### Task 155: `_lib/bestellText.ts` — das Multiplikationszeichen, das kein `x` ist

**Files:**
- Create: `src/app/m/lagerbuch/_lib/bestellText.ts`
- Test: `src/app/m/lagerbuch/_lib/bestellText.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export function bestellListeText(
    zeilen: { vorschlag: number; name: string; bestellt: boolean }[],
  ): string;
  ```
  Konsument: `verwaltung/(arbeit)/bestellung/BestellListe.tsx` (T166).

**Warum das eine eigene, reine Funktion ist.** §9.3, Vorschrift 4: „**E2E behauptet nichts über die
Zwischenablage.** Ein Playwright-Test, der `navigator.clipboard` liest, prüft die Browserrechte des
Testlaufs, nicht das Modul. Die Aussage „der kopierte Text ist richtig" gehört in einen Vitest-Test
gegen die reine Funktion." Und: **der Vertrag ist der Textinhalt, nicht der Transportweg** — deshalb
liefert der Rückfallweg (Modal mit vorselektiertem Text, T166) zeichengleich denselben String.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/bestellText.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bestellListeText } from "./bestellText";

const ZEILEN = [
  { vorschlag: 8,  name: "Mullbinde 8cm",   bestellt: false },
  { vorschlag: 40, name: "Kompresse 10x10", bestellt: true  },
  { vorschlag: 25, name: 'Handschuh "M"',   bestellt: false },
];

describe("bestellListeText", () => {
  it("liefert die Beispielausgabe aus §9.3 zeichengleich", () => {
    expect(bestellListeText(ZEILEN)).toBe(
      '8 × Mullbinde 8cm\n25 × Handschuh "M"',
    );
  });

  /**
   * U+00D7 MULTIPLICATION SIGN, NICHT ASCII "x" (BestellListe.tsx:25). Der
   * Unterschied ist am Bildschirm kaum sichtbar und in einer Bestell-Mail sehr
   * wohl. Der Test prueft den CODEPOINT, nicht das Zeichen — eine Datei, die
   * jemand versehentlich nach Latin-1 speichert, faellt sonst nicht auf.
   */
  it("benutzt U+00D7 und nirgends ein ASCII-x", () => {
    const text = bestellListeText(ZEILEN);
    expect(text).toContain("×");
    expect(text).not.toMatch(/\d x /);
  });

  /**
   * ZEILENUMFANG: nur die noch NICHT bestellten (BestellListe.tsx:25 —
   * `filter((z) => !z.bestellt)`). Die CSV nimmt alle. Die beiden Wege sitzen
   * als zwei Knoepfe auf EINEM Bildschirm und liefern verschieden viele Zeilen;
   * Entscheidung 9-A laesst das so und beschriftet es stattdessen.
   */
  it("laesst bereits bestellte Zeilen weg", () => {
    expect(bestellListeText(ZEILEN)).not.toContain("Kompresse");
    expect(bestellListeText(ZEILEN).split("\n")).toHaveLength(2);
  });

  it("liefert bei nichts Offenem einen leeren String, keine Leerzeile", () => {
    expect(bestellListeText([{ vorschlag: 1, name: "X", bestellt: true }])).toBe("");
    expect(bestellListeText([])).toBe("");
  });
});
```

- [ ] **Schritt 2: Rot sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bestellText.test.ts
```

Erwartet: `Failed to load url ./bestellText`.

- [ ] **Schritt 3: Die Datei schreiben**

`src/app/m/lagerbuch/_lib/bestellText.ts`:

```ts
/**
 * DER ZWISCHENABLAGE-TEXT — kein "use client" (Falle 6).
 *
 * Der Kern ist eine reine Funktion, damit die Aussage testbar wird, ohne einen
 * Browser zu brauchen: `navigator.clipboard` verlangt einen secure context, und
 * unter `lagerbuch.localtest.me` gibt es den nicht (§9.3, Entscheidung 9-D).
 * Ein Playwright-Test, der die Zwischenablage liest, prueft die Browserrechte
 * des Testlaufs — nicht das Modul.
 *
 * DER VERTRAG IST DER TEXTINHALT, NICHT DER TRANSPORTWEG: der Rueckfallweg
 * (Modal mit vorselektiertem Text) liefert zeichengleich denselben String.
 */
export function bestellListeText(
  zeilen: { vorschlag: number; name: string; bestellt: boolean }[],
): string {
  // U+00D7, nicht ASCII "x" — 1:1-Pflicht 28. Nur offene Zeilen (BestellListe.tsx:25).
  return zeilen
    .filter((z) => !z.bestellt)
    .map((z) => `${z.vorschlag} × ${z.name}`)
    .join("\n");
}
```

- [ ] **Schritt 4: Grün sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bestellText.test.ts
```

- [ ] **Schritt 5: Commit**

```bash
rtk git add src/app/m/lagerbuch/_lib/bestellText.ts \
            src/app/m/lagerbuch/_lib/bestellText.test.ts
rtk git commit -m "feat(lagerbuch): Zwischenablage-Text als reine Funktion

1:1-Pflicht 28 (Spec §9.3): Zeilenform \"N × Name\" mit U+00D7 (nicht ASCII x),
nur die noch nicht bestellten Zeilen.

Reine Funktion, weil die Aussage sonst nirgends gepruft werden koennte: E2E
behauptet ueber die Zwischenablage NICHTS (Vorschrift 4 in §9.3) — ein
Playwright-Test, der navigator.clipboard liest, prueft die Browserrechte des
Testlaufs. Der Test prueft den Codepoint, nicht das Zeichen."
```

### Task 156: `_lib/bestandExport.ts` — die Zeilenaufbereitung und die Kopplung, die still bricht

**Files:**
- Create: `src/app/m/lagerbuch/_lib/bestandExport.ts`
- Test: `src/app/m/lagerbuch/_lib/bestandExport.test.ts`

**Interfaces:**
- Consumes: `_lib/artikelFilter.ts` (Teil 3) — `artikelFiltern<T extends ArtikelFilterZeile>(…)`,
  `LEERER_FILTER`, `type ArtikelFilterZustand` — **nur für den Kopplungstest** (Schritt 6).
- Produces:
  ```ts
  export type BestandExportEingabe = {
    name: string; fach: string; bestand: number; einheit: string;
    mindestbestand: number; aktiv: boolean; unterMindest: boolean;
    naechsteCharge: { chargenNr: string; verfall: string } | null;
    naechsteAblaufText: string | null;
  };
  export type BestandExportZeile = {
    artikel: string; fach: string; bestand: number; einheit: string;
    mindestbestand: number; status: string; charge: string;
    verfall: string; hinweis: string;
  };
  export function bestandStatus(
    row: Pick<BestandExportEingabe, "aktiv" | "unterMindest">,
  ): string;
  export function bestandExportZeilen(rows: BestandExportEingabe[]): BestandExportZeile[];
  export function bestandExportDateiname(now: Date): string;  // "bestand-2026-07-05.xlsx"
  ```
  Konsument: `verwaltung/(arbeit)/artikel/ArtikelTable.tsx` (T165, **ERGÄNZT** Teil 5 T129).

**Die Datei liegt schon heute richtig — und das ist der Punkt.** `lagerbuch/src/lib/bestand-export.ts`
liegt bereits **außerhalb** der Client-Grenze; nur `EXCEL_SPALTEN` liegt drinnen (T157 holt sie
heraus). Diese Task ist damit ein echter 1:1-Port mit **einer** Änderung: die Zweistellen-Auffüllung
`pad2` steht **lokal** statt als Import.

⚠️ **Warum `pad2` NICHT aus `_lib/format.ts` kommt, obwohl der Bestand es von dort holt.** Der
`Produces`-Block von Teil 3 zu `_lib/format.ts` (T39) führt `fmtVerfall`, `chargeText`, `ampelTon`,
`geraetFaelligChip`, `typLabel` und `zeitraumAus` — **`pad2` steht dort nicht**. Ein Import auf einen
Namen, den der Zulieferer nicht zugesagt hat, ist eine Wette; ihn dort **nachzutragen** wäre ein
Eingriff in eine fremde Datei für drei Zeichen. → **Diese Datei füllt selbst auf**, mit
`String(n).padStart(2, "0")`, und der Kommentar sagt warum. Trägt `_lib/format.ts` den Namen
tatsächlich, ist ein späterer Tausch ein Ein-Zeilen-Commit ohne Teständerung — die Zusicherung hängt
am **Dateinamen**, nicht am Helfer.

⚠️ **Die Leerstring-Regel ist eine Fachentscheidung, keine Nachlässigkeit.** `charge`, `verfall` und
`hinweis` fallen auf **`""`** zurück, nicht auf `–`: in Excel bleibt die Zelle dann leer und stört
Filter und Sortierung nicht (`bestand-export.ts:48-51`). Ein „schöneres" `–` machte jede Filterung
über diese drei Spalten unbrauchbar.

⚠️ **§12.1, Punkt 2 hat hier seine zweite Hälfte** — die **Kopplung** zwischen Filter und Export.
`ArtikelTable.tsx:133` ruft `bestandExportZeilen(gefiltert)`, also mit **derselben** abgeleiteten
Liste, die auch in die Tabelle geht. Wandert das Filtern jemals in antds `Table`-eigenen Zustand,
exportiert der Knopf **still wieder alles**. Schritt 6 nagelt das fest.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/bestandExport.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  bestandStatus, bestandExportZeilen, bestandExportDateiname,
  type BestandExportEingabe,
} from "./bestandExport";

function eingabe(p: Partial<BestandExportEingabe> = {}): BestandExportEingabe {
  return {
    name: "Mullbinde 8cm", fach: "A2", bestand: 12, einheit: "Stk.",
    mindestbestand: 20, aktiv: true, unterMindest: true,
    naechsteCharge: { chargenNr: "L-42", verfall: "2026-08" },
    naechsteAblaufText: "faellig 08/26",
    ...p,
  };
}

/** Die drei Faelle 1:1 aus ../lagerbuch/src/lib/bestand-export.test.ts:32-36. */
describe("bestandStatus", () => {
  it("schlaegt alles: inaktiv", () => {
    expect(bestandStatus({ aktiv: false, unterMindest: true })).toBe("inaktiv");
    expect(bestandStatus({ aktiv: false, unterMindest: false })).toBe("inaktiv");
  });
  it("dann Mindestbestand", () => {
    expect(bestandStatus({ aktiv: true, unterMindest: true })).toBe("unter Mindestbestand");
  });
  it("sonst ok", () => {
    expect(bestandStatus({ aktiv: true, unterMindest: false })).toBe("ok");
  });
});

describe("bestandExportZeilen", () => {
  it("bildet die neun Felder flach ab", () => {
    expect(bestandExportZeilen([eingabe()])[0]).toEqual({
      artikel: "Mullbinde 8cm", fach: "A2", bestand: 12, einheit: "Stk.",
      mindestbestand: 20, status: "unter Mindestbestand",
      charge: "L-42", verfall: "2026-08", hinweis: "faellig 08/26",
    });
  });

  /**
   * LEERSTRING, NICHT "–": in Excel bleibt die Zelle so leer und stoert Filter
   * und Sortierung nicht (bestand-export.ts:48-51). Ein "schoeneres" Zeichen
   * machte jede Filterung ueber diese drei Spalten unbrauchbar.
   */
  it("setzt fehlende Charge, Verfall und Hinweis auf Leerstring", () => {
    const z = bestandExportZeilen([
      eingabe({ naechsteCharge: null, naechsteAblaufText: null }),
    ])[0];
    expect(z.charge).toBe("");
    expect(z.verfall).toBe("");
    expect(z.hinweis).toBe("");
    expect(JSON.stringify(z)).not.toContain("–");  // kein Halbgeviertstrich
  });

  it("behaelt die Reihenfolge der uebergebenen Liste", () => {
    const zeilen = bestandExportZeilen([
      eingabe({ name: "B" }), eingabe({ name: "A" }),
    ]);
    expect(zeilen.map((z) => z.artikel)).toEqual(["B", "A"]);
  });
});

describe("bestandExportDateiname", () => {
  /** ../lagerbuch/src/lib/bestand-export.test.ts:44 prueft genau diesen String. */
  it("liefert bestand-YYYY-MM-DD.xlsx aus LOKALER Zeit", () => {
    expect(bestandExportDateiname(new Date(2026, 6, 5, 13, 37))).toBe("bestand-2026-07-05.xlsx");
  });

  it("fuellt Monat und Tag auf zwei Stellen", () => {
    expect(bestandExportDateiname(new Date(2026, 0, 9))).toBe("bestand-2026-01-09.xlsx");
  });

  /**
   * Die E2E prueft nur die FORM (`/^bestand-\d{4}-\d{2}-\d{2}\.xlsx$/`,
   * lagerbuch/e2e/bestand-export.spec.ts:18), nie den Wert. Diese Zeile ist die
   * einzige, die den Wert festnagelt.
   */
  it("passt zur Regex, die der E2E prueft", () => {
    expect(bestandExportDateiname(new Date(2026, 6, 5)))
      .toMatch(/^bestand-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
```

- [ ] **Schritt 2: Rot sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bestandExport.test.ts
```

Erwartet: `Failed to load url ./bestandExport`.

- [ ] **Schritt 3: Die Datei schreiben**

`src/app/m/lagerbuch/_lib/bestandExport.ts`:

```ts
/**
 * Aufbereitung der Artikelliste fuer den Excel-Export. Bewusst frei von der
 * Excel-Bibliothek: hier entstehen nur die fertigen Zeilen (deutsche
 * Beschriftungen, flache Werte), die der Export-Knopf dann in Spalten giesst.
 * So bleibt die Logik testbar und der Client laedt die Bibliothek erst beim
 * Klick (§9.4, Entscheidung 9-E).
 *
 * KEIN "use client" — und diese Datei lag schon im Bestand richtig
 * (../lagerbuch/src/lib/bestand-export.ts). Falsch lag nur EXCEL_SPALTEN, und
 * die zieht _lib/bestandExportSpalten.ts heraus.
 */

export type BestandExportEingabe = {
  name: string;
  fach: string;
  bestand: number;
  einheit: string;
  mindestbestand: number;
  aktiv: boolean;
  unterMindest: boolean;
  naechsteCharge: { chargenNr: string; verfall: string } | null;
  naechsteAblaufText: string | null;
};

export type BestandExportZeile = {
  artikel: string;
  fach: string;
  bestand: number;
  einheit: string;
  mindestbestand: number;
  status: string;
  charge: string;
  verfall: string;
  hinweis: string;
};

/** Status wie in der Tabelle: inaktive Artikel zuerst, dann Mindestbestand,
 *  sonst „ok". Die Reihenfolge ist Fachlichkeit: ein inaktiver Artikel UNTER
 *  Mindestbestand heisst „inaktiv", nicht „unter Mindestbestand" — sonst stuende
 *  er in der Bestell-Auswertung. */
export function bestandStatus(
  row: Pick<BestandExportEingabe, "aktiv" | "unterMindest">,
): string {
  if (!row.aktiv) return "inaktiv";
  if (row.unterMindest) return "unter Mindestbestand";
  return "ok";
}

export function bestandExportZeilen(rows: BestandExportEingabe[]): BestandExportZeile[] {
  return rows.map((r) => ({
    artikel: r.name,
    fach: r.fach,
    bestand: r.bestand,
    einheit: r.einheit,
    mindestbestand: r.mindestbestand,
    status: bestandStatus(r),
    // Leerstring statt „–": in Excel bleibt die Zelle so leer und stoert
    // Filter/Sortierung nicht.
    charge: r.naechsteCharge?.chargenNr ?? "",
    verfall: r.naechsteCharge?.verfall ?? "",
    hinweis: r.naechsteAblaufText ?? "",
  }));
}

/**
 * DER DATEINAME WIRD IM BROWSER GEBILDET (ArtikelTable.tsx:142 uebergibt
 * `new Date()`), also aus der Zeitzone des ARBEITSPLATZES, nicht aus der des
 * Containers. Die TZ-Frage aendert an diesem Format daher nichts.
 *
 * WANDERT DIE BILDUNG JE AUF DEN SERVER, ist `heuteIso()` aus _lib/zeit.ts der
 * richtige Aufruf und NICHT diese lokalen Datumskomponenten (§9.4). Die Zeile
 * steht hier, damit die Umstellung dann eine Entscheidung ist und kein Versehen.
 */
export function bestandExportDateiname(now: Date): string {
  // Lokal aufgefuellt statt aus _lib/format.ts importiert: dessen Produces-Block
  // (Teil 3, T39) fuehrt `pad2` NICHT. Ein Import auf einen nicht zugesagten
  // Namen waere eine Wette, und ihn dort nachzutragen ein Eingriff in eine
  // fremde Datei fuer drei Zeichen.
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `bestand-${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}.xlsx`;
}
```

- [ ] **Schritt 4: Grün sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bestandExport.test.ts
```

- [ ] **Schritt 5: Commit der Portierung**

```bash
rtk git add src/app/m/lagerbuch/_lib/bestandExport.ts \
            src/app/m/lagerbuch/_lib/bestandExport.test.ts
rtk git commit -m "feat(lagerbuch): Zeilenaufbereitung des Excel-Exports, 1:1 portiert

Spec §9.4. Status-Literale (inaktiv schlaegt alles) und die Leerstring-Regel
1:1 aus ../lagerbuch/src/lib/bestand-export.ts:34-51 samt der drei Testfaelle
aus :32-36.

Leerstring und NICHT \"–\": in Excel bleibt die Zelle so leer und stoert Filter
und Sortierung nicht. Der Test prueft ausdruecklich, dass kein
Halbgeviertstrich in der Ausgabe steht.

Der Dateiname entsteht aus LOKALER Browserzeit; die Zeile traegt den Hinweis,
dass bei einer Verlagerung auf den Server heuteIso() aus _lib/zeit.ts der
richtige Aufruf waere."
```

- [ ] **Schritt 6: Die Kopplung Filter ↔ Export festnageln (§12.1, Punkt 2, zweite Hälfte)**

Dies ist der **ersetzende** Test für die Hälfte von §12.1 Punkt 2, die in keinem anderen Plan einen
Eigentümer hat. Anhängen an `bestandExport.test.ts`:

```ts
import { artikelFiltern, LEERER_FILTER } from "./artikelFilter";

/**
 * §12.1, PUNKT 2 — die KOPPLUNG, nicht das Praedikat.
 *
 * ArtikelTable.tsx:133 ruft `bestandExportZeilen(gefiltert)`, also mit DERSELBEN
 * abgeleiteten Liste, die auch in `dataSource` geht. Wandert das Filtern jemals
 * in antds Table-eigenen Zustand, exportiert der Knopf STILL wieder alles — die
 * Seite sieht richtig aus, die Datei ist falsch.
 *
 * Der Test bildet genau diese Reihenfolge nach: erst filtern, dann exportieren.
 * Er bleibt gruen, solange der Export die gefilterte Liste bekommt, und faellt,
 * sobald jemand die Rohliste durchreicht.
 */
describe("Kopplung Filter -> Export (§12.1 Punkt 2)", () => {
  const rohe = [
    eingabe({ name: "Mullbinde 8cm", fach: "A2", unterMindest: true }),
    eingabe({ name: "Kompresse 10x10", fach: "B1", unterMindest: false }),
  ];

  it("exportiert nur, was der Filter uebrig laesst", () => {
    const gefiltert = artikelFiltern(
      rohe.map((r, i) => ({ ...r, id: String(i), chargenNr: r.naechsteCharge?.chargenNr ?? null })),
      { ...LEERER_FILTER, nurUnterMindest: true },
    );
    const zeilen = bestandExportZeilen(gefiltert);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].artikel).toBe("Mullbinde 8cm");
  });

  it("exportiert ohne Filter die volle Liste — die Gegenrichtung", () => {
    const gefiltert = artikelFiltern(
      rohe.map((r, i) => ({ ...r, id: String(i), chargenNr: r.naechsteCharge?.chargenNr ?? null })),
      LEERER_FILTER,
    );
    expect(bestandExportZeilen(gefiltert)).toHaveLength(2);
  });
});
```

⚠️ **Die genauen Feldnamen von `ArtikelFilterZeile` stehen in Teil 3s `Produces`-Block zu
`_lib/artikelFilter.ts`.** Weicht die Zeilenform ab, wird der Adapter in den zwei `map`-Aufrufen
angepasst — **nicht** die Filterdatei. Die Aussage des Tests ist die Reihenfolge, nicht die Form.

- [ ] **Schritt 7: Rot sehen — und zwar durch die Mutation, die er fangen soll**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bestandExport.test.ts
```

Ist er grün, wird die Mutation einmal gefahren: `bestandExportZeilen(gefiltert)` → `bestandExportZeilen(rohe)`
im ersten Fall. Erwartet: `expected 2 to be 1`. Danach zurückändern.

- [ ] **Schritt 8: Commit**

```bash
rtk git add src/app/m/lagerbuch/_lib/bestandExport.test.ts
rtk git commit -m "test(lagerbuch): Export liest dieselbe abgeleitete Liste wie die Tabelle

Spec §12.1, Punkt 2, zweite Haelfte — die einzige der sieben Aussagen ohne Netz,
fuer die kein anderer Plan einen Eigentuemer nennt. Auflage 9 aus §6.15.

Die Mutation, die er faengt: `bestandExportZeilen(rohe)` statt
`bestandExportZeilen(gefiltert)`. Die Seite saehe danach richtig aus und die
Datei enthielte alles — ein stiller Bruch, sobald Filtern in antds
Table-eigenen Zustand wandert (§9.4, Entscheidung 9-H).

Gegenprobe gefahren: der Test faellt bei genau dieser Aenderung."
```

### Task 157: `_lib/bestandExportSpalten.ts` — neun Überschriften außerhalb der Client-Grenze

**Files:**
- Create: `src/app/m/lagerbuch/_lib/bestandExportSpalten.ts`
- Test: `src/app/m/lagerbuch/_lib/bestandExportSpalten.test.ts`

**Interfaces:**
- Consumes: `_lib/bestandExport.ts` (T156) — `type BestandExportZeile`. ⚠️ **Nur der Typ**, kein
  Laufzeitwert; damit ist die Task trotz Nennung parallel zu T156 lauffähig, wenn beide gleichzeitig
  starten — der Typimport wird von `tsc` erst am Wellenende geprüft.
- Produces:
  ```ts
  export type ExcelSpalte = {
    header: string;
    width: number;
    wert: (z: BestandExportZeile) => string | number;
    zahl?: boolean;
  };
  export const EXCEL_SPALTEN: readonly ExcelSpalte[];   // genau 9
  export const EXCEL_BLATTNAME: "Bestand Handlager";
  export const EXCEL_FEHLERTEXT: string;                // mit Halbgeviertstrich
  ```
  Konsument: `verwaltung/(arbeit)/artikel/ArtikelTable.tsx` (T165).

**Falle 6 trifft diesen Export mit voller Wucht, und das steht in §9.4 wörtlich.** `EXCEL_SPALTEN`
ist heute ein **Wert in einem `"use client"`-Modul** (`ArtikelTable.tsx:89-99`). Die neun
Überschriften sind 1:1-Pflicht und gehören damit in einen Test, den auch eine Server Component lesen
können muss. Bleibt die Liste in der Insel, bekommt eine Server Component eine **Client-Referenz**
statt des Wertes: HTTP 500 für die ganze Seite, `typecheck` und `build` grün, **und Vitest kann es
strukturell nicht finden**.

**Falle 7 trifft ihn NICHT — und das muss aufgeschrieben werden, damit es niemand später „aufräumt".**
`ArtikelTable` trägt `"use client"` in Zeile 1; das Icon am Knopf läuft dort. **Wandert der Knopf
jemals in eine Server Component, ergibt der Icon-Import HTTP 500 beim Import, nicht beim Rendern**,
und `"use client"` auf der Icon-Datei behebt das nicht, sondern macht es still.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/bestandExportSpalten.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXCEL_SPALTEN, EXCEL_BLATTNAME, EXCEL_FEHLERTEXT } from "./bestandExportSpalten";
import type { BestandExportZeile } from "./bestandExport";

const ZEILE: BestandExportZeile = {
  artikel: "Mullbinde 8cm", fach: "A2", bestand: 12, einheit: "Stk.",
  mindestbestand: 20, status: "unter Mindestbestand",
  charge: "L-42", verfall: "2026-08", hinweis: "faellig 08/26",
};

describe("EXCEL_SPALTEN", () => {
  /** 1:1 aus ArtikelTable.tsx:89-99, Reihenfolge inbegriffen. */
  it("traegt neun Ueberschriften in dieser Reihenfolge", () => {
    expect(EXCEL_SPALTEN.map((s) => s.header)).toEqual([
      "Artikel", "Fach", "Bestand", "Einheit", "Mindestbestand",
      "Status", "Nächste Charge", "Verfall", "Hinweis",
    ]);
  });

  it("traegt die Breiten aus dem Bestand", () => {
    expect(EXCEL_SPALTEN.map((s) => s.width)).toEqual([34, 12, 10, 10, 16, 22, 18, 11, 20]);
  });

  /**
   * Zahlen bleiben Zahlen (Excel darf damit rechnen und sortieren), alles andere
   * ist Text. Genau die Spalten 3 und 5 — `Bestand` und `Mindestbestand`.
   */
  it("markiert genau Bestand und Mindestbestand als Zahl", () => {
    expect(EXCEL_SPALTEN.filter((s) => s.zahl).map((s) => s.header))
      .toEqual(["Bestand", "Mindestbestand"]);
  });

  it("liest jede Spalte aus dem passenden Feld", () => {
    expect(EXCEL_SPALTEN.map((s) => s.wert(ZEILE))).toEqual([
      "Mullbinde 8cm", "A2", 12, "Stk.", 20,
      "unter Mindestbestand", "L-42", "2026-08", "faellig 08/26",
    ]);
  });

  it("nennt Blattname und Fehlertext zeichengleich", () => {
    expect(EXCEL_BLATTNAME).toBe("Bestand Handlager");               // ArtikelTable.tsx:140
    expect(EXCEL_FEHLERTEXT)
      .toBe("Excel-Datei konnte nicht erzeugt werden – bitte erneut versuchen.");  // :144
    // Halbgeviertstrich U+2013, nicht Bindestrich — 1:1-Pflicht.
    expect(EXCEL_FEHLERTEXT).toContain("–");
  });

  /**
   * FALLE 6, und sie ist der ganze Grund fuer diese Datei: EXCEL_SPALTEN ist ein
   * WERT, der heute in einem "use client"-Modul lebt (ArtikelTable.tsx:89-99).
   * Aus einem Client-Modul erreicht ein Wert eine Server Component nur als
   * Referenz — HTTP 500 fuer die ganze Seite, waehrend typecheck und build gruen
   * bleiben und Vitest es strukturell nicht sehen kann.
   */
  it("traegt kein use client und keinen Icon-Import", () => {
    const quelle = readFileSync(join(__dirname, "bestandExportSpalten.ts"), "utf8");
    expect(quelle).not.toMatch(/["']use client["']/);
    expect(quelle).not.toContain("@ant-design/icons");
    expect(quelle).not.toContain("lucide-react");
  });
});
```

- [ ] **Schritt 2: Rot sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bestandExportSpalten.test.ts
```

Erwartet: `Failed to load url ./bestandExportSpalten`.

- [ ] **Schritt 3: Die Datei schreiben**

`src/app/m/lagerbuch/_lib/bestandExportSpalten.ts`:

```ts
import type { BestandExportZeile } from "./bestandExport";

/**
 * DIE NEUN SPALTEN DES EXCEL-EXPORTS — kein "use client", und das ist der ganze
 * Zweck dieser Datei (Spec §9.4).
 *
 * FALLE 6 MIT VOLLER WUCHT: EXCEL_SPALTEN ist ein WERT und lebt heute in einem
 * "use client"-Modul (../lagerbuch/.../ArtikelTable.tsx:89-99). Die neun
 * Ueberschriften sind 1:1-Pflicht 28 und gehoeren damit in einen Test, den auch
 * eine Server Component lesen koennen muss. Bleibt die Liste in der Insel,
 * bekommt eine Server Component eine Client-Referenz statt des Wertes: HTTP 500
 * fuer die ganze Seite, `typecheck` und `build` gruen, und Vitest kann es
 * strukturell nicht finden (CLAUDE.md:24-27).
 *
 * FALLE 7 TRIFFT DIESEN EXPORT NICHT — und der Grund gehoert aufgeschrieben,
 * damit ihn niemand spaeter „aufraeumt": ArtikelTable traegt "use client" in
 * Zeile 1, das Icon am Knopf laeuft dort. Wandert der Knopf jemals in eine
 * Server Component, ergibt der Icon-Import HTTP 500 BEIM IMPORT, nicht beim
 * Rendern — und "use client" auf der Icon-Datei behebt das nicht, es macht es
 * still (CLAUDE.md:28-41).
 *
 * ENTSCHEIDUNG 9-G: der Formelschutz aus _lib/csvZelle.ts beruehrt diesen Pfad
 * NICHT. `write-excel-file` legt jede Zelle mit `type: String` als Textzelle an,
 * nie als Formel; eine Neutralisierung hier waere eine Formataenderung ohne
 * Gegenwert.
 */

export type ExcelSpalte = {
  header: string;
  width: number;
  wert: (z: BestandExportZeile) => string | number;
  zahl?: boolean;
};

// Zahlen bleiben Zahlen (Excel darf damit rechnen/sortieren), alles andere ist
// Text; leere Zellen statt „–", damit Filter in Excel sauber greifen.
export const EXCEL_SPALTEN: readonly ExcelSpalte[] = [
  { header: "Artikel",        width: 34, wert: (z) => z.artikel },
  { header: "Fach",           width: 12, wert: (z) => z.fach },
  { header: "Bestand",        width: 10, wert: (z) => z.bestand, zahl: true },
  { header: "Einheit",        width: 10, wert: (z) => z.einheit },
  { header: "Mindestbestand", width: 16, wert: (z) => z.mindestbestand, zahl: true },
  { header: "Status",         width: 22, wert: (z) => z.status },
  { header: "Nächste Charge", width: 18, wert: (z) => z.charge },
  { header: "Verfall",        width: 11, wert: (z) => z.verfall },
  { header: "Hinweis",        width: 20, wert: (z) => z.hinweis },
] as const;

export const EXCEL_BLATTNAME = "Bestand Handlager";

/** Halbgeviertstrich U+2013, 1:1 aus ArtikelTable.tsx:144. Der Text erscheint am
 *  Knopf als Rueckgabewert, nie als `e.message` — der waere in Produktion der
 *  englische Satz ueber eine „server-side exception" (Falle 66, §11.2 d). */
export const EXCEL_FEHLERTEXT =
  "Excel-Datei konnte nicht erzeugt werden – bitte erneut versuchen.";
```

- [ ] **Schritt 4: Grün sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bestandExportSpalten.test.ts
```

- [ ] **Schritt 5: Commit**

```bash
rtk git add src/app/m/lagerbuch/_lib/bestandExportSpalten.ts \
            src/app/m/lagerbuch/_lib/bestandExportSpalten.test.ts
rtk git commit -m "feat(lagerbuch): die neun Excel-Spalten ausserhalb der Client-Grenze

Spec §9.4, Falle 6: EXCEL_SPALTEN ist ein WERT und lebt im Bestand in einem
\"use client\"-Modul (ArtikelTable.tsx:89-99). Aus einem Client-Modul erreicht
ein Wert eine Server Component nur als Referenz — HTTP 500 fuer die ganze Seite,
bei gruenem typecheck und build, und Vitest kann es strukturell nicht finden.

1:1-Pflicht 28: neun Ueberschriften in dieser Reihenfolge, diese Breiten, genau
Spalte 3 und 5 als Number. Blattname und Fehlertext (mit Halbgeviertstrich)
zeichengleich.

Der Kopfkommentar haelt fest, WARUM Falle 7 diesen Export nicht trifft — damit
niemand den Knopf spaeter in eine Server Component raeumt."
```

### Task 158: `_lib/zustandTexte.ts` — die Sätze, die eine Client-Grenze kreuzen

**Files:**
- Create: `src/app/m/lagerbuch/_lib/zustandTexte.ts`
- Test: `src/app/m/lagerbuch/_lib/zustandTexte.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export const FEHLER_TITEL: "Diese Ansicht konnte nicht geladen werden.";
  export const FEHLER_ERNEUT: "Erneut versuchen";
  export const FEHLER_ZURUECK: "Zurück zum Anfang";
  export const BARCODE_TITEL: "Kein Gerät zu diesem Barcode";
  export const BARCODE_TEXT: "Zu diesem Barcode gibt es weder ein Gerät noch eine Sauerstoff-Flasche.";
  export const BARCODE_NOCHMAL: "Noch einmal scannen";
  export const BARCODE_LISTE: "Geräteliste";
  export function etikettenDomainFehlt(): string;
  ```
  Konsumenten: `error.tsx` (T163, **Client**), `g/[code]/page.tsx` (T164, **Server**),
  `verwaltung/(druck)/etiketten/page.tsx` (T162, **Server**).

**Warum diese Datei existiert (Festlegung J6).** §11.6: „Die Zustandstexte dieser Tabelle liest
sowohl eine Server Component … als auch eine Client-Insel … Sie gehören deshalb in ein Modul **ohne**
`"use client"` unter `_lib/`. TypeScript ist zufrieden, `build` findet nichts, und Vitest kann es
strukturell nicht finden." `error.tsx` **muss** `"use client"` tragen — ein dort gehaltener Text wäre
für jede Server Component, die ihn mitliest, Falle 6.

⚠️ **Die Datei sammelt NICHT alle Texte des Moduls.** Die Gate-Texte liegen in `_lib/gateTexte.ts`
(Teil 2, T18), die Helfer-Texte bei ihren Bauteilen (Teil 4). Hier stehen die **drei** Zustände, die
dieser Plan baut: §11.5 Zustände **15** (Barcode unbekannt), **22/23** (Riegel-Wurf und unerwarteter
Wurf im Render) und **38** (Etikettenbogen ohne konfigurierte Domain).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/zustandTexte.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FEHLER_TITEL, FEHLER_ERNEUT, FEHLER_ZURUECK,
  BARCODE_TITEL, BARCODE_TEXT, BARCODE_NOCHMAL, BARCODE_LISTE,
  etikettenDomainFehlt,
} from "./zustandTexte";

describe("zustandTexte", () => {
  /** §11.5, Zustaende 22 und 23. Ein Satz OHNE Technik. */
  it("traegt den Text der Modul-Fehlergrenze", () => {
    expect(FEHLER_TITEL).toBe("Diese Ansicht konnte nicht geladen werden.");
    expect(FEHLER_ERNEUT).toBe("Erneut versuchen");
    expect(FEHLER_ZURUECK).toBe("Zurück zum Anfang");
  });

  /**
   * Kein Wort ueber „Fehler", „Exception", „500" oder einen Stack: die Person
   * vor dem Bildschirm kann damit nichts anfangen, und der englische Satz des
   * Produktions-Deserialisierers ist genau das, was §11.2 (d) verhindert.
   */
  it("nennt in der Fehlergrenze keine Technik", () => {
    expect(FEHLER_TITEL.toLowerCase()).not.toMatch(/exception|error|500|stack|server/);
  });

  /** §11.5, Zustand 15 / Entscheidung 8-C2. */
  it("traegt den Text des unbekannten Barcodes", () => {
    expect(BARCODE_TITEL).toBe("Kein Gerät zu diesem Barcode");
    expect(BARCODE_TEXT)
      .toBe("Zu diesem Barcode gibt es weder ein Gerät noch eine Sauerstoff-Flasche.");
    expect(BARCODE_NOCHMAL).toBe("Noch einmal scannen");
    expect(BARCODE_LISTE).toBe("Geräteliste");
  });

  /**
   * §11.5, Zustand 38 / Entscheidung 8-B. Der Satz muss den ENV-NAMEN nennen —
   * er ist die einzige Auskunft, die den Fehlstart in eine Handlung uebersetzt.
   */
  it("nennt in der Domain-Meldung den Variablennamen und die Folge", () => {
    const text = etikettenDomainFehlt();
    expect(text).toContain("SUITE_HOST_LAGERBUCH");
    expect(text).toContain("Etiketten können nicht gedruckt werden");
    expect(text).toContain("toten Link");
  });

  /**
   * FALLE 6: error.tsx traegt "use client" in Zeile 1 (Next verlangt das fuer
   * jede Fehlergrenze), g/[code]/page.tsx und die Etikettenseite sind Server
   * Components. Ein Text, den error.tsx selbst hielte, kaeme bei den beiden
   * anderen als Client-Referenz an — HTTP 500, build gruen, Vitest blind.
   *
   * FALLE 7: kein Icon-Import. Die Zustaende tragen Inline-SVG.
   */
  it("traegt kein use client und keinen Icon-Import", () => {
    const quelle = readFileSync(join(__dirname, "zustandTexte.ts"), "utf8");
    expect(quelle).not.toMatch(/["']use client["']/);
    expect(quelle).not.toContain("@ant-design/icons");
  });
});
```

- [ ] **Schritt 2: Rot sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/zustandTexte.test.ts
```

Erwartet: `Failed to load url ./zustandTexte`.

- [ ] **Schritt 3: Die Datei schreiben**

`src/app/m/lagerbuch/_lib/zustandTexte.ts`:

```ts
/**
 * DIE ZUSTANDSTEXTE, DIE EINE CLIENT-GRENZE KREUZEN — kein "use client".
 *
 * Drei Zustaende aus §11.5 werden von diesem Plan gebaut, und sie werden von
 * BEIDEN Seiten gelesen:
 *   22/23  Modul-Fehlergrenze  → error.tsx        ("use client", Pflicht)
 *   15     Barcode unbekannt   → g/[code]/page.tsx (Server Component)
 *   38     Domain fehlt        → (druck)/etiketten/page.tsx (Server Component)
 *
 * Ein Text, den error.tsx selbst hielte, waere fuer jede Server Component, die
 * ihn mitliest, Falle 6: sie bekaeme eine Client-Referenz statt des Wertes,
 * HTTP 500 fuer die ganze Seite, waehrend typecheck und build gruen bleiben und
 * Vitest es strukturell nicht sehen kann (§11.6, CLAUDE.md:24-27).
 *
 * WAS HIER NICHT STEHT: die Gate-Texte (_lib/gateTexte.ts, §3.9) und die
 * Helfer-Texte (bei ihren Bauteilen, §7.3). Diese Datei sammelt nicht „alle
 * Texte des Moduls", sondern die drei, die diese eine Grenze kreuzen.
 */

// ——— §11.5, Zustaende 22 und 23: die Modul-Fehlergrenze ———————————————
//
// EIN SATZ OHNE TECHNIK. Der Produktions-Deserialisierer im Browser-Buendel hat
// fuer eine Fehlerzeile genau einen Zweig und baut einen Error mit dem festen
// englischen Text ueber eine „server-side exception" (Falle 66). Die Person vor
// dem Bildschirm bekommt deshalb DIESEN Satz, nie den geworfenen.
export const FEHLER_TITEL = "Diese Ansicht konnte nicht geladen werden.";
export const FEHLER_ERNEUT = "Erneut versuchen";

/** §11.7: jeder gestaltete Zustand traegt einen benannten Weg zurueck. `/`
 *  fuehrt unter dem Host-Rewrite an den Modulanfang — und der ist das Gate
 *  (Entscheidung 15, §3.6.6). */
export const FEHLER_ZURUECK = "Zurück zum Anfang";

// ——— §11.5, Zustand 15 / Entscheidung 8-C2: der gescannte Barcode ————————
//
// `/g/<code>` erreicht ohnehin nur eine angemeldete verwaltende Person — die
// Rollen-Weiche schickt jede Nicht-Admin-Anfrage vorher weg. Die braucht keine
// Auskunft ueber die Suite, sondern ueber den BARCODE, samt dem gescannten Code
// zum Abgleich mit dem Typenschild (§11.3).
export const BARCODE_TITEL = "Kein Gerät zu diesem Barcode";
export const BARCODE_TEXT =
  "Zu diesem Barcode gibt es weder ein Gerät noch eine Sauerstoff-Flasche.";
export const BARCODE_NOCHMAL = "Noch einmal scannen";
export const BARCODE_LISTE = "Geräteliste";

// ——— §11.5, Zustand 38 / Entscheidung 8-B: keine Domain konfiguriert ————
//
// Ein Zustand, den es HEUTE nicht geben kann (config.ts:33 traegt einen
// zod-Default) und der nach dem Port der wahrscheinlichste Fehlstart ist.
// Verboten ist beides, was ohne diese Meldung passiert: ein QR mit dem Text
// `null/a/<id>`, und ein stiller Rueckfall auf einen relativen Pfad — ein
// relativer QR ist auf Papier bedeutungslos und sieht auf dem Bildschirm
// richtig aus.
export function etikettenDomainFehlt(): string {
  return (
    "Etiketten können nicht gedruckt werden: für lagerbuch ist keine öffentliche " +
    "Domain konfiguriert (SUITE_HOST_LAGERBUCH). Ohne sie trägt jeder QR-Code " +
    "einen toten Link."
  );
}
```

- [ ] **Schritt 4: Grün sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/zustandTexte.test.ts
```

- [ ] **Schritt 5: Commit**

```bash
rtk git add src/app/m/lagerbuch/_lib/zustandTexte.ts \
            src/app/m/lagerbuch/_lib/zustandTexte.test.ts
rtk git commit -m "feat(lagerbuch): die drei Zustandstexte, die eine Client-Grenze kreuzen

Spec §11.5 (Zustaende 15, 22/23, 38) und §11.6. Festlegung J6 dieses Plans: der
Verzeichnisbaum aus §2.1 nennt keine Datei dafuer, und ohne eine benannte Datei
landet jeder Text dort, wo er gerade gebraucht wird.

error.tsx MUSS \"use client\" tragen (Next verlangt das fuer jede Fehlergrenze,
und reset() ist eine Client-Prop). Ein dort gehaltener Text kaeme bei
g/[code]/page.tsx und der Etikettenseite — beides Server Components — als
Client-Referenz an: HTTP 500 fuer die ganze Seite, bei gruenem build und einem
Vitest, der das strukturell nicht sehen kann (Falle 6).

Die Datei sammelt bewusst NICHT alle Texte des Moduls: die Gate-Texte liegen in
_lib/gateTexte.ts (Teil 2), die Helfer-Texte bei ihren Bauteilen (Teil 4)."
```

### Gate nach Welle 1

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

`pnpm exec playwright test` ist hier **nicht** fällig: Welle 1 legt keine Route an.
</content>
</invoke>

---

## Welle 2 — Datenzugriff und der Token-Namensraum (2 Tasks, parallel)

### Task 159: `_db/etiketten.ts` — der QR, der zurückgelesen wird

**Files:**
- Create: `src/app/m/lagerbuch/_db/etiketten.ts`
- Test: `src/app/m/lagerbuch/_db/etiketten.test.ts`

**Interfaces:**
- Consumes: `_db/client.ts` (Teil 1, T12) — `type DB`; `_db/schema.ts` (Teil 1, T7) — `artikel`,
  `tokens`; `_db/testdb.ts` (Teil 1, T9, nur für den Test) — `migrierteTestDb()`. Aus `core`:
  `qrSvg` (`@/core/qr`) und `moduleUrl` (`@/core/shell/moduleUrl`). Für den Test zusätzlich
  `decodeQr` aus `e2e/helpers/decode-qr` (J9).
- Produces:
  ```ts
  export class EtikettenBasisFehlt extends Error {}   // name === "EtikettenBasisFehlt"
  export type ArtikelEtikett = { id: string; name: string; fach: string; url: string; qr: string };
  export type TokenEtikett   = { code: string; label: string; url: string; qr: string };
  export type EtikettenDaten = { basis: string; artikel: ArtikelEtikett[]; tokens: TokenEtikett[] };
  export async function etikettenDaten(db: DB): Promise<EtikettenDaten>;
  ```
  Konsument: `verwaltung/(druck)/etiketten/page.tsx` (T162).

**Warum die Datei unter `_db/` liegt, obwohl `_db/` keine Fachabfrage hält.** Sie ist eine von
**zwei** benannten Ausnahmen (neben `quelle.ts`, Teil 1 T13), und der Grund ist bei beiden derselbe:
sie kennt **keine Seite**, sondern nur eine Zeilenform. §2.1 führt sie ausdrücklich dort.

**Vier Entscheidungen dieser Datei, jede gegen einen benannten Befund:**

1. **Die Basis-URL kommt aus `moduleUrl("lagerbuch")`** (8-B). Nicht aus `resolveHost(headers)` —
   der Wert kommt aus `x-forwarded-host`, ist **fälschbar** und garantiert nicht den Modul-Host; ein
   manipulierter Kopf druckte einen ganzen Bogen auf eine fremde Domain, und der Fehler zeigte sich
   erst, wenn jemand ein **geklebtes** Etikett scannt. Und nicht aus einem modul-eigenen
   `APP_BASE_URL` — das wäre eine **sechste** Wahrheit neben `SUITE_HOST_LAGERBUCH`, mit der Gefahr,
   dass beide auseinanderlaufen. Die Variable wird beim Port ersatzlos gestrichen (§10.2).
2. **`null` wirft eine benannte Klasse** (J8). Ein `throw new Error(...)` wäre von einem
   Datenbankfehler nicht zu unterscheiden, und die Seite müsste den Text vergleichen, um zu wissen,
   welchen Zustand sie zeigt.
3. **Der QR kommt aus `core/qr`, unverändert** (8-I). Level **H**, `margin: 4` — die Suite hat seit
   dem `qr`-Modul **eine** Konfiguration für alle QR-Codes, und `core/qr/index.ts:19-23` hat drei
   divergierende Stellen genau deshalb abgeschafft. Für ein laminiertes, verschmutztes Kärtchen ist
   H die bessere Wahl. ⚠️ Der Preis ist gemessen und benannt: bei 20mm Kante fallen ca. **0,41mm je
   Modul** statt 0,57mm — deshalb der Probebogen (R30, A-J2).
4. **`etikettenDaten` ist `async` und benutzt EIN `Promise.all`.** `qrSvg` gibt ein
   `Promise<string>` zurück (`core/qr/index.ts:37-40`). ⚠️ **Ein fehlendes `await` ergibt hier keine
   Fehlermeldung, sondern `[object Promise]` als Markup** — ein Bogen voller identischer,
   unlesbarer Kästchen.

⚠️ **`etikettenDaten` filtert hart auf `aktiv = true`, und das bleibt 1:1** (`etiketten.ts:16-17`).
Es ist trotzdem eine Lücke, die ins Runbook gehört (R32): ein deaktivierter Artikel ist unter
`/a/<id>` **weiterhin vollständig bebuchbar**, aber nie wieder nachdruckbar (Falle 26). Die Menge der
physisch hängenden Etiketten ist damit **echt größer** als die der druckbaren, und die Differenz ist
im Repo nicht abzählbar.

- [ ] **Schritt 1: Prüfen, dass der Dekodierer aus einem `src`-Test auflöst**

Die Messung aus J9 wird einmal selbst nachvollzogen, bevor darauf gebaut wird:

```bash
cat > src/__probe.test.ts <<'EOF'
import { describe, it, expect } from "vitest";
import { decodeQr } from "../e2e/helpers/decode-qr";
import { qrSvg } from "@/core/qr";
describe("probe", () => {
  it("dekodiert", async () => {
    const svg = await qrSvg("https://lagerbuch.iuk-ue.de/a/V1StGXR8_Z5jdHi6B-myT");
    expect(await decodeQr(svg)).toBe("https://lagerbuch.iuk-ue.de/a/V1StGXR8_Z5jdHi6B-myT");
  });
});
EOF
pnpm vitest run src/__probe.test.ts ; rm src/__probe.test.ts
```

Erwartet (gemessen am 04.08.2026, vitest 4.1.10): `Test Files 1 passed`. **Schlägt das fehl**, gilt
der Rückfall aus §8.5: `decodeQr`/`decodeQrPng` wandern nach `src/core/qr/decode.ts`,
`e2e/helpers/decode-qr.ts` re-exportiert von dort (zweiter Nutznießer sind die bestehenden
`qr`-E2E), und dieser Task bekommt einen eigenen `core`-Commit. **Kein zweiter Dekodierer.**

- [ ] **Schritt 2: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_db/etiketten.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, tokens, newId } from "./schema";
import { decodeQr } from "../../../../../e2e/helpers/decode-qr";
import { etikettenDaten, EtikettenBasisFehlt } from "./etiketten";

/**
 * DER HOST WIRD GEMOCKT, NICHT DIE BASIS-URL — und das ist der Unterschied zum
 * Bestand. `../lagerbuch/src/db/etiketten.test.ts:2` mockt `config` auf
 * `https://lager.example` und assertiert genau den gemockten Wert: das friert
 * die Annahme ein, statt sie zu pruefen (§8.5).
 *
 * Hier wird `moduleUrl` gemockt, weil sein null-Zweig an
 * `process.env.NODE_ENV === "production"` haengt (core/shell/moduleUrl.ts:19-21)
 * und unter Vitest NIE greift — der Zustand aus 8-B waere sonst unpruefbar. Eine
 * Umstellung von NODE_ENV waere die Alternative und aenderte eine Variable, die
 * Next und antd mitlesen.
 */
const modulUrl = vi.hoisted(() => ({ wert: "https://lagerbuch.iuk-ue.de" as string | null }));
vi.mock("@/core/shell/moduleUrl", () => ({
  moduleUrl: (key: string) => (key === "lagerbuch" ? modulUrl.wert : null),
}));

let t: TestDb;
const A_ID = "V1StGXR8_Z5jdHi6B-myT";   // echte nanoid-Form, 21 Zeichen (§4.7)

beforeEach(() => {
  modulUrl.wert = "https://lagerbuch.iuk-ue.de";
  t = migrierteTestDb("lagerbuch-etiketten-");
  t.db.insert(artikel).values({
    id: A_ID, name: "Mullbinde 8cm", fach: "A2", einheit: "Stk.",
    mindestbestand: 20, aktiv: true, createdAt: new Date(),
  }).run();
  t.db.insert(artikel).values({
    id: newId(), name: "Alte Schiene", fach: "Z9", einheit: "Stk.",
    mindestbestand: 0, aktiv: false, createdAt: new Date(),
  }).run();
  t.db.insert(tokens).values({
    id: newId(), code: "482-137", label: "RTW 1", aktiv: true, createdAt: new Date(),
  }).run();
  t.db.insert(tokens).values({
    id: newId(), code: "999-999", label: "gesperrt", aktiv: false, createdAt: new Date(),
  }).run();
});
afterEach(() => t.schliessen());

describe("etikettenDaten", () => {
  /**
   * DIE EINZIGE KONSTRUKTION, DIE EINE REGRESSION DER BASIS-URL FANGEN KANN
   * (§8.5). Der Bestand prueft `toHaveAttribute("src", /^data:image\/png/)`
   * (lagerbuch/e2e/etiketten.spec.ts:13) — der QR wird dort NIE dekodiert, ein
   * Code mit falschem Inhalt bleibt gruen.
   */
  it("brennt den absoluten Deep-Link in die Pixel des Artikel-QR", async () => {
    const d = await etikettenDaten(t.db);
    const e = d.artikel.find((x) => x.id === A_ID)!;
    expect(await decodeQr(e.qr)).toBe(`https://lagerbuch.iuk-ue.de/a/${A_ID}`);
  });

  it("brennt den absoluten Token-Link in die Pixel des Token-QR", async () => {
    const d = await etikettenDaten(t.db);
    const e = d.tokens.find((x) => x.code === "482-137")!;
    expect(await decodeQr(e.qr)).toBe("https://lagerbuch.iuk-ue.de/t/482-137");
  });

  /** Der Bindestrich ist Teil des gespeicherten Wertes (§4.7, §8.3). */
  it("laesst den Bindestrich im Code stehen", async () => {
    const d = await etikettenDaten(t.db);
    expect(d.tokens[0].url).toContain("/t/482-137");
    expect(d.tokens[0].url).not.toContain("/t/482137");
  });

  /** SVG, nicht data:image/png (8-I, Punkt 1). Vektor statt 200px-Raster —
   *  bei 20mm Kante gibt es damit keine Aufloesungsgrenze. */
  it("liefert einen SVG-String, keine Data-URL", async () => {
    const d = await etikettenDaten(t.db);
    expect(d.artikel[0].qr.trimStart().startsWith("<svg")).toBe(true);
    expect(d.artikel[0].qr).not.toContain("data:image");
  });

  /**
   * EIN FEHLENDES `await` ERGAEBE HIER KEINE FEHLERMELDUNG, sondern
   * `[object Promise]` als Markup — ein Bogen voller identischer, unlesbarer
   * Kaestchen (8-I, Punkt 1).
   */
  it("laesst nirgends ein Promise stehen", async () => {
    const d = await etikettenDaten(t.db);
    for (const e of [...d.artikel, ...d.tokens]) {
      expect(e.qr).not.toContain("[object Promise]");
    }
  });

  /** 1:1 aus etiketten.ts:16-17 — und die Luecke steht als R32 im Runbook. */
  it("nimmt nur aktive Artikel und aktive Codes", async () => {
    const d = await etikettenDaten(t.db);
    expect(d.artikel.map((a) => a.name)).toEqual(["Mullbinde 8cm"]);
    expect(d.tokens.map((x) => x.code)).toEqual(["482-137"]);
  });

  /**
   * §8.1, 8-B, Fehlerzustand 2: `moduleUrl` nimmt `prodHostsFor(mod)[0]`. Die
   * REIHENFOLGE der Liste bestimmt, welcher Host in die gedruckten Pixel wandert.
   * Deshalb reicht die Funktion die verwendete Basis heraus — die Seite schreibt
   * sie ueber den Bogen, und das ist der einzige Weg, eine Umsortierung VOR dem
   * Papier zu bemerken.
   */
  it("gibt die verwendete Basis heraus", async () => {
    const d = await etikettenDaten(t.db);
    expect(d.basis).toBe("https://lagerbuch.iuk-ue.de");
  });

  it("schneidet einen abschliessenden Schraegstrich ab", async () => {
    modulUrl.wert = "https://lagerbuch.iuk-ue.de/";
    const d = await etikettenDaten(t.db);
    expect(d.basis).toBe("https://lagerbuch.iuk-ue.de");
    expect(d.artikel[0].url).not.toContain("//a/");
  });

  /**
   * §11.5, ZUSTAND 38 — ein Zustand, den es heute nicht geben KANN
   * (config.ts:33 traegt einen zod-Default) und der nach dem Port der
   * wahrscheinlichste Fehlstart ist. Verboten ist beides, was ohne diese Regel
   * passiert: ein QR mit dem Text `null/a/<id>`, und ein stiller Rueckfall auf
   * einen relativen Pfad — ein relativer QR ist auf Papier bedeutungslos und
   * sieht auf dem Bildschirm richtig aus.
   */
  it("wirft EtikettenBasisFehlt, wenn moduleUrl null liefert", async () => {
    modulUrl.wert = null;
    await expect(etikettenDaten(t.db)).rejects.toThrow(EtikettenBasisFehlt);
  });

  /**
   * Die BENANNTE Klasse ist der Grund, warum die Seite den Zustand von einem
   * Datenbankfehler unterscheiden kann, ohne einen Text zu vergleichen (J8).
   */
  it("traegt einen unterscheidbaren Namen", async () => {
    modulUrl.wert = null;
    await expect(etikettenDaten(t.db)).rejects.toMatchObject({ name: "EtikettenBasisFehlt" });
  });

  it("erzeugt in diesem Fall gar keinen QR", async () => {
    modulUrl.wert = null;
    await expect(etikettenDaten(t.db)).rejects.toThrow();
    // Kein Teil-Ergebnis, kein `null/a/<id>` irgendwo — die Funktion steigt vor
    // dem ersten qrSvg aus.
  });
});
```

- [ ] **Schritt 3: Rot sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/etiketten.test.ts
```

Erwartet: `Failed to load url ./etiketten`.

- [ ] **Schritt 4: Die Datei schreiben**

`src/app/m/lagerbuch/_db/etiketten.ts`:

```ts
import { eq } from "drizzle-orm";
import { qrSvg } from "@/core/qr";
import { moduleUrl } from "@/core/shell/moduleUrl";
import type { DB } from "./client";
import { artikel, tokens } from "./schema";

/**
 * DIE DATEN DES ETIKETTENBOGENS (Spec §8.4).
 *
 * Sie liegt unter `_db/`, obwohl `_db/` keine Fachabfrage haelt — eine von zwei
 * benannten Ausnahmen (neben quelle.ts, §2.1). Der Grund ist bei beiden
 * derselbe: sie kennt KEINE Seite, sondern nur eine Zeilenform. Waechst hier
 * etwas heran, das eine Seite kennt, ist es am falschen Ort.
 */

/**
 * WARUM EINE EIGENE KLASSE UND KEIN `new Error(...)`: die Seite muss diesen
 * Zustand von einem Datenbankfehler unterscheiden koennen. Mit einem generischen
 * Error bliebe nur ein Textvergleich als Kontrollfluss — und der bricht beim
 * ersten Umformulieren, still. Alles ausser dieser Klasse faellt bewusst an
 * error.tsx durch (§11.5, Zustaende 23 und 38).
 */
export class EtikettenBasisFehlt extends Error {
  constructor() {
    super(
      "Fuer lagerbuch ist keine oeffentliche Domain konfiguriert (SUITE_HOST_LAGERBUCH).",
    );
    this.name = "EtikettenBasisFehlt";
  }
}

export type ArtikelEtikett = { id: string; name: string; fach: string; url: string; qr: string };
export type TokenEtikett = { code: string; label: string; url: string; qr: string };
export type EtikettenDaten = {
  /** Die tatsaechlich verwendete Basis. Die Seite schreibt sie ueber den Bogen
   *  (Klasse `lb-nichtDrucken`) — der EINZIGE Weg, eine Umsortierung von
   *  SUITE_HOST_LAGERBUCH vor dem Papier zu bemerken (§8.1, 8-B). */
  basis: string;
  artikel: ArtikelEtikett[];
  tokens: TokenEtikett[];
};

export async function etikettenDaten(db: DB): Promise<EtikettenDaten> {
  /**
   * `moduleUrl` liest ueber `prodHostsFor()` und damit aus SUITE_HOST_LAGERBUCH —
   * dieselbe Wahrheit, die auch das Routing benutzt (8-B).
   *
   * NICHT `resolveHost(headers)`: der Wert kommt aus `x-forwarded-host`, ist
   * faelschbar und garantiert nicht den Modul-Host. Ein manipulierter Kopf
   * druckte einen ganzen Bogen auf eine fremde Domain — und der Fehler zeigte
   * sich erst, wenn jemand ein GEKLEBTES Etikett scannt.
   *
   * NICHT `APP_BASE_URL`: das waere eine sechste Wahrheit neben
   * SUITE_HOST_LAGERBUCH, mit der Gefahr, dass beide auseinanderlaufen. Die
   * Variable faellt beim Port ersatzlos (§10.2).
   */
  const roh = moduleUrl("lagerbuch");
  if (!roh) throw new EtikettenBasisFehlt();
  const basis = roh.replace(/\/$/, "");

  // 1:1 aus etiketten.ts:16-17: hart auf `aktiv`. Ein deaktivierter Artikel ist
  // unter /a/<id> weiterhin bebuchbar, aber nie wieder nachdruckbar (Falle 26) —
  // die Luecke ist bewusst uebernommen und steht als R32 im Runbook.
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  const toks = db.select().from(tokens).where(eq(tokens.aktiv, true)).all();

  /**
   * EIN Promise.all, keine Schleife mit vergessenem `await`: `qrSvg` ist async
   * (core/qr/index.ts:37-40), und ein fehlendes `await` ergaebe hier keine
   * Fehlermeldung, sondern `[object Promise]` als Markup (8-I, Punkt 1).
   */
  const [artikelEtiketten, tokenEtiketten] = await Promise.all([
    Promise.all(
      arts.map(async (a) => {
        const url = `${basis}/a/${a.id}`;
        return { id: a.id, name: a.name, fach: a.fach, url, qr: await qrSvg(url) };
      }),
    ),
    Promise.all(
      toks.map(async (t) => {
        // Der Bindestrich ist Teil des gespeicherten Wertes (§4.7) und wandert
        // ungefiltert in die Pixel.
        const url = `${basis}/t/${t.code}`;
        return { code: t.code, label: t.label, url, qr: await qrSvg(url) };
      }),
    ),
  ]);

  return { basis, artikel: artikelEtiketten, tokens: tokenEtiketten };
}
```

- [ ] **Schritt 5: Grün sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/etiketten.test.ts
```

- [ ] **Schritt 6: Die Gegenprobe fahren, die den Dekodierer rechtfertigt**

```bash
# Basis absichtlich verstuemmeln — der Dekodierer MUSS anschlagen
sed -i.bak 's|`${basis}/a/${a.id}`|`${basis}/A/${a.id}`|' src/app/m/lagerbuch/_db/etiketten.ts
pnpm vitest run src/app/m/lagerbuch/_db/etiketten.test.ts   # MUSS rot sein
mv src/app/m/lagerbuch/_db/etiketten.ts.bak src/app/m/lagerbuch/_db/etiketten.ts
pnpm vitest run src/app/m/lagerbuch/_db/etiketten.test.ts   # wieder gruen
```

Erwartet im roten Lauf: `expected 'https://lagerbuch.iuk-ue.de/A/V1St…' to be
'https://lagerbuch.iuk-ue.de/a/V1St…'`. **Das ist die Klasse Fehler, gegen die der Bestand nichts
hat** — ein `toHaveAttribute("src", /^data:image\/png/)` bliebe hier grün.

- [ ] **Schritt 7: Commit**

```bash
rtk git add src/app/m/lagerbuch/_db/etiketten.ts \
            src/app/m/lagerbuch/_db/etiketten.test.ts
rtk git commit -m "feat(lagerbuch): Etikettendaten mit QR aus core/qr — und ein Test, der dekodiert

Spec §8.4 (8-B, 8-I) und §8.5.

Die Basis-URL kommt aus moduleUrl(\"lagerbuch\"), nicht aus resolveHost
(x-forwarded-host ist faelschbar; ein manipulierter Kopf druckte einen ganzen
Bogen auf eine fremde Domain, sichtbar erst beim Scannen eines geklebten
Etiketts) und nicht aus APP_BASE_URL (eine sechste Wahrheit neben
SUITE_HOST_LAGERBUCH).

null -> EtikettenBasisFehlt, eine BENANNTE Klasse: die Seite muss den Zustand
von einem Datenbankfehler unterscheiden, ohne einen Text zu vergleichen. Der
Test mockt @/core/shell/moduleUrl, weil dessen null-Zweig an NODE_ENV haengt und
unter Vitest nie greift.

Der Test DEKODIERT den QR (sharp+jsQR aus e2e/helpers/decode-qr) statt seine
Existenz zu behaupten — die einzige Konstruktion, die eine Regression der
Basis-URL fangen kann. Gegenprobe gefahren: /a/ -> /A/ faerbt ihn rot.

Gemessen: der relative Import aus einem src-Test loest auf (vitest 4.1.10), der
Rueckfall src/core/qr/decode.ts aus §8.5 wird nicht gezogen."
```

### Task 160: §8.3 und Entscheidung 8-F — der Code-Namensraum wird gesperrt

**Files:**
- Modify: `src/app/m/lagerbuch/_actions/tokens.ts` (**ERGÄNZT**, Teil 5 T126)
- Modify: `src/app/m/lagerbuch/_lib/lesepfade/tokens.ts` (**ERGÄNZT**, Teil 5 T126)
- Modify: `src/app/m/lagerbuch/_actions/loeschen.ts` (**ERGÄNZT**, Teil 5 T124 — J13)
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/tokens/**` (**ERGÄNZT**, Teil 5 T148)
- Test: `src/app/m/lagerbuch/_actions/tokens.test.ts` (**ERGÄNZT**),
  `src/app/m/lagerbuch/_actions/loeschen.test.ts` (**ERGÄNZT**)

**Interfaces:**
- Consumes: `_db/schema.ts` (Teil 1) — `tokens`, `newId`; `_lib/zugang.ts` (Teil 2) —
  `requireLagerbuchAdmin`; die vorhandenen Exporte aus Teil 5 T126 (`createToken`, `setTokenAktiv`,
  `tokenListe`) und T124 (`pruefeLoeschbar`, `loescheElement`, `deaktiviereElement`).
- Produces (**zusätzlich** zu den Exporten aus Teil 5, die unverändert bleiben):
  ```ts
  // _actions/tokens.ts
  export const TOKEN_ALPHABET: "0123456789";
  export const TOKEN_ZIFFERN: 6;
  export const TOKEN_ZIEHUNGEN: 20;

  // _actions/loeschen.ts
  export const TOKEN_LOESCHGRUND: string;   // der Text, den der Dialog woertlich zeigt
  ```
  ⚠️ **Die Zahl der Actions ändert sich NICHT.** `_actions/tokens.ts` behält seine **zwei**
  Deklarationen (`createToken`, `setTokenAktiv`), `_actions/loeschen.ts` seine **drei**. Die **vier**
  neuen Exporte sind Konstanten, keine Actions — der Guard-Scan (T172) verwirft sie nicht
  automatisch, deshalb Schritt 8.

**Der Befund, und warum 8-F nicht kosmetisch ist.** `pruefeToken` (`loeschen.ts:89-99`) erlaubt das
harte Löschen, solange `lastUsedAt` **null** ist; `generateUniqueCode` prüft Kollisionen gegen die
Zeilen, die es noch **gibt** (`tokens.ts:16`). Zusammen kann ein gedrucktes, nie eingelöstes Kärtchen
seinen Code an ein später ausgestelltes **verlieren** — und weil `tokens.code` zugleich der
Anzeigeschlüssel im Journal ist (1:1-Pflicht 6, `quelle.ts:20,23`), erschienen historische Zeilen
danach unter dem **neuen** Label.

→ **Nach dem Port kann ein Token nur noch gesperrt werden** (`aktiv = false`); der Code bleibt für
immer belegt. Das passt zum append-only-Geist des Journals (§4.4) und berührt das Schema **nicht**.

⚠️ **`generateUniqueCode` bleibt unverändert, und das ist der Witz an 8-F.** Die Kollisionsprüfung
läuft schon heute gegen alle **vorhandenen** Zeilen; sie war nur deshalb löchrig, weil Zeilen
verschwinden konnten. Fällt der Hard-Delete, schließt sich die Lücke **ohne** eine Zeile im
Generator — Option (b) der Analyse (eine `verbrauchte_codes`-Tabelle) wäre teurer ohne Zusatznutzen.

⚠️ **Zwei Dinge ändert 8-F ausdrücklich NICHT:** `last_used_at` wandert beim Import weiterhin
**vollständig** mit (§4.12, 1:1-Pflicht 5 — ein Anzeigewert, den man nicht überträgt, ist
unwiederbringlich weg), und der Hard-Delete der **übrigen** Objektarten bleibt (§5.21). 8-F ist eine
Ausnahme für **Tokens**, keine neue Regel für das Modul.

- [ ] **Schritt 1: Den fehlschlagenden Test für §8.3 schreiben**

Anhängen an `src/app/m/lagerbuch/_actions/tokens.test.ts`:

```ts
import { TOKEN_ALPHABET, TOKEN_ZIFFERN, TOKEN_ZIEHUNGEN } from "./tokens";

/**
 * §8.3 — DER TOKEN-VERTRAG, 1:1-Pflicht. Die Werte stehen auf laminierten
 * Kaerthchen im Fahrzeug; sie zu aendern macht gedruckte Gegenstaende wertlos.
 */
describe("Token-Codeform (§8.3)", () => {
  it("benutzt genau die zehn Ziffern und sechs Stellen", () => {
    expect(TOKEN_ALPHABET).toBe("0123456789");   // tokens.ts:10
    expect(TOKEN_ZIFFERN).toBe(6);
    // Coderaum 10^6 — die Zahl, gegen die die Gate-Schranke rechnet (§3.5.3).
    expect(TOKEN_ALPHABET.length ** TOKEN_ZIFFERN).toBe(1_000_000);
  });

  it("zieht hoechstens zwanzigmal, dann wirft es benannt", () => {
    expect(TOKEN_ZIEHUNGEN).toBe(20);            // tokens.ts:12
  });

  /**
   * DER BINDESTRICH IST TEIL DES GESPEICHERTEN WERTES (tokens.ts:15, Spalte
   * `tokens.code` UNIQUE). Er steht zwischen Position 3 und 4. Die Normalisierung
   * der EINGABE (_lib/code.ts, Teil 2) bringt `123456` auf diese Form — sie kann
   * damit nur Treffer HINZUFUEGEN, nie einen bestehenden verlieren (8-E).
   */
  it("speichert den Code in der Form NNN-NNN", async () => {
    const { code } = await createToken({ label: "RTW 1" }, t.db);
    expect(code).toMatch(/^\d{3}-\d{3}$/);
    const zeile = t.db.select().from(tokens).where(eq(tokens.code, code)).get();
    expect(zeile, "der Bindestrich muss in der Spalte stehen").toBeDefined();
  });

  /**
   * ES GIBT KEINEN ABLAUF — kein expiresAt, kein validUntil (schema.ts:132-147).
   * Widerruf laeuft ausschliesslich ueber `aktiv`, und der wirkt ab jetzt auch
   * LESEND (§3.4.4). Mehrfachgebrauch ist ausdruecklich beabsichtigt: die Codes
   * sind physisch laminiert.
   */
  it("legt kein Ablaufdatum an", async () => {
    const { id } = await createToken({ label: "RTW 1" }, t.db);
    const zeile = t.db.select().from(tokens).where(eq(tokens.id, id)).get()!;
    expect(Object.keys(zeile)).not.toContain("expiresAt");
    expect(Object.keys(zeile)).not.toContain("validUntil");
    expect(zeile.lastUsedAt).toBeNull();
  });

  /**
   * ENTSCHEIDUNG 8-F: die Kollisionspruefung laeuft gegen ALLE vorhandenen
   * Zeilen — nicht nur gegen die aktiven. Ein gesperrter Code bleibt belegt.
   */
  it("vergibt einen gesperrten Code nicht neu", async () => {
    // 999 von 1.000.000 Codes belegen waere unpraktikabel; stattdessen wird die
    // Aussage direkt geprueft: ein gesperrter Code ist in der Tabelle, und die
    // Pruefung fragt die Tabelle ohne aktiv-Bedingung.
    const { code } = await createToken({ label: "wird gesperrt" }, t.db);
    await setTokenAktiv({ id: (t.db.select().from(tokens).where(eq(tokens.code, code)).get()!).id, aktiv: false }, t.db);
    const quelle = readFileSync(join(__dirname, "tokens.ts"), "utf8");
    // Die Kollisionsabfrage darf KEINE aktiv-Bedingung tragen.
    const block = /function generateUniqueCode[\s\S]*?\n}/.exec(quelle)![0];
    expect(block).toContain("tokens.code");
    expect(block, "Kollisionspruefung darf nicht auf aktiv filtern").not.toContain("tokens.aktiv");
  });
});
```

⚠️ **`t`, `createToken`, `setTokenAktiv`, `tokens`, `eq`, `readFileSync`, `join` stehen bereits im
Kopf der Datei aus Teil 5, T126.** Fehlt einer der Importe, wird er dort ergänzt — es entsteht
**keine zweite Testdatei**.

- [ ] **Schritt 2: Rot sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/tokens.test.ts
```

Erwartet: `TOKEN_ALPHABET is not exported by ./tokens` bzw. `expected undefined to be '0123456789'`.

- [ ] **Schritt 3: `_actions/tokens.ts` ergänzen**

Die drei Werte, die heute als Literale in `customAlphabet("0123456789", 6)` und in der
Schleifengrenze stehen, bekommen Namen — **damit der Test gegen die Konstante prüft und nicht gegen
eine zweite Abschrift derselben Zahl**:

```ts
/**
 * §8.3 — DER TOKEN-VERTRAG. Diese drei Zahlen stehen auf laminierten Kaertchen
 * im Fahrzeug. Sie sind 1:1-Pflicht, und sie sind exportiert, weil ein Test
 * gegen ein Literal im Funktionsrumpf nur pruefen koennte, dass das Literal
 * dasteht — nicht, dass es benutzt wird.
 *
 * Coderaum 10^6. Die Sicherheit gegen Raten liegt NICHT in der Laenge, sondern
 * in der Drosselung davor (§3.5.3): bei N aktiven Codes rund 10^6/N Versuche im
 * Erwartungswert.
 */
export const TOKEN_ALPHABET = "0123456789";
export const TOKEN_ZIFFERN = 6;
export const TOKEN_ZIEHUNGEN = 20;

const sechsZiffern = customAlphabet(TOKEN_ALPHABET, TOKEN_ZIFFERN);

/**
 * ENTSCHEIDUNG 8-F: die Pruefung laeuft gegen ALLE vorhandenen Zeilen, ohne
 * aktiv-Bedingung. Das war schon so — sie war nur deshalb loechrig, weil Zeilen
 * per Hard-Delete verschwinden konnten. Faellt der Hard-Delete (siehe
 * _actions/loeschen.ts), schliesst sich die Luecke OHNE eine Zeile hier.
 *
 * Eine `verbrauchte_codes`-Tabelle (Option b der Analyse) waere teurer ohne
 * Zusatznutzen.
 */
function generateUniqueCode(db: DB): string {
  for (let i = 0; i < TOKEN_ZIEHUNGEN; i++) {
    const d = sechsZiffern();
    // Der Bindestrich zwischen Position 3 und 4 ist TEIL DES GESPEICHERTEN
    // WERTES (Spalte tokens.code, UNIQUE) — nicht Formatierung bei der Anzeige.
    const code = `${d.slice(0, 3)}-${d.slice(3)}`;
    if (!db.select().from(tokens).where(eq(tokens.code, code)).get()) return code;
  }
  throw new Error("Konnte keinen eindeutigen Code erzeugen");
}
```

- [ ] **Schritt 4: Grün sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/tokens.test.ts
```

- [ ] **Schritt 5: Den fehlschlagenden Test für 8-F schreiben**

Anhängen an `src/app/m/lagerbuch/_actions/loeschen.test.ts`:

```ts
/**
 * ENTSCHEIDUNG 8-F (§8.3) — DER HARD-DELETE VON TOKENS FAELLT.
 *
 * Der Befund: pruefeToken (loeschen.ts:89-99) erlaubt das harte Loeschen,
 * solange lastUsedAt null ist. Zusammen mit einer Kollisionspruefung gegen die
 * VORHANDENEN Zeilen kann ein gedrucktes, nie eingeloestes Kaertchen seinen Code
 * an ein spaeter ausgestelltes verlieren — und weil tokens.code zugleich der
 * Anzeigeschluessel im Journal ist (1:1-Pflicht 6), erschienen historische
 * Zeilen danach unter dem NEUEN Label.
 *
 * 8-F ist eine Ausnahme fuer TOKENS, keine neue Regel: der Hard-Delete der
 * uebrigen fuenf Objektarten bleibt (§5.21).
 */
describe("8-F: Zugangs-Codes werden gesperrt, nicht geloescht", () => {
  it("verweigert das Loeschen auch bei nie benutztem Code", async () => {
    const { id } = await createToken({ label: "nie benutzt" }, t.db);
    const status = await pruefeLoeschbar("token", id, t.db);
    expect(status.loeschbar).toBe(false);
    expect(status.kannDeaktivieren).toBe(true);
  });

  it("nennt das Sperren als Weg — im Text, nicht nur als Schalter", () => {
    // Der Dialog zeigt `grund` woertlich an; ein Grund ohne benannte Alternative
    // liesse die Person vor einer Sackgasse stehen (§11.7).
    expect(TOKEN_LOESCHGRUND).toContain("sperren");
  });

  it("verweigert es auch bei bereits benutztem Code", async () => {
    const { id } = await createToken({ label: "benutzt" }, t.db);
    t.db.update(tokens).set({ lastUsedAt: new Date() }).where(eq(tokens.id, id)).run();
    expect((await pruefeLoeschbar("token", id, t.db)).loeschbar).toBe(false);
  });

  /**
   * DIE ZEILE, DIE DEN NAMENSRAUM SCHUETZT: loescheElement darf die Zeile unter
   * KEINEN Umstaenden entfernen. Ein `case "token"` im switch waere sonst
   * erreichbar, sobald jemand pruefeLoeschbar „grosszuegiger" macht.
   */
  it("entfernt die Zeile auch dann nicht, wenn loescheElement direkt gerufen wird", async () => {
    const { id } = await createToken({ label: "bleibt" }, t.db);
    await expect(loescheElement("token", id, t.db)).rejects.toThrow();
    expect(t.db.select().from(tokens).where(eq(tokens.id, id)).get()).toBeDefined();
  });

  /** Der zweite Ausgang bleibt und wirkt: aktiv = false. */
  it("sperrt ueber deaktiviereElement", async () => {
    const { id } = await createToken({ label: "sperrbar" }, t.db);
    await deaktiviereElement("token", id, t.db);
    expect(t.db.select().from(tokens).where(eq(tokens.id, id)).get()!.aktiv).toBe(false);
  });

  /** §5.21: 8-F ist eine Ausnahme fuer Tokens. Die Gegenrichtung wird
   *  mitgeprueft, damit niemand die Regel verallgemeinert. */
  it("laesst den Hard-Delete der uebrigen Arten unberuehrt", async () => {
    const artikelId = newId();
    t.db.insert(artikel).values({
      id: artikelId, name: "frisch", fach: "A1", einheit: "Stk.",
      mindestbestand: 0, aktiv: true, createdAt: new Date(),
    }).run();
    expect((await pruefeLoeschbar("artikel", artikelId, t.db)).loeschbar).toBe(true);
  });
});
```

- [ ] **Schritt 6: Rot sehen, dann `_actions/loeschen.ts` ändern**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/loeschen.test.ts
```

Erwartet: `expected true to be false` im ersten Fall — der Bestand erlaubt das Löschen.

Die Änderung, drei Stellen:

```ts
/**
 * ENTSCHEIDUNG 8-F (§8.3): der Code-Namensraum wird gegen Wiederverwendung
 * gesperrt. Ein Token kann nur noch gesperrt werden; der Code bleibt fuer immer
 * belegt.
 *
 * WAS AN DIE STELLE VON pruefeToken TRITT: eine Konstante. Die BEDINGTE Pruefung
 * („loeschbar, solange lastUsedAt null ist", loeschen.ts:89-99) entfaellt
 * ersatzlos — mit ihr faellt der einzige Weg, auf dem ein Code frei werden
 * konnte. `last_used_at` ist danach KEIN Loeschbarkeitsschalter mehr, sondern
 * nur noch die Auskunft „nie benutzt" mit genau einem Leser (die Code-Tabelle).
 */
export const TOKEN_LOESCHGRUND =
  "Zugangs-Codes bleiben als Nachweis erhalten und ihr Code bleibt dauerhaft " +
  "belegt — sonst erschienen alte Journalzeilen unter dem Label eines neuen " +
  "Codes. Du kannst diesen Code stattdessen sperren.";

const TOKEN_UNLOESCHBAR: Loeschbarkeit = {
  loeschbar: false,
  grund: TOKEN_LOESCHGRUND,
  kannDeaktivieren: true,
};
```

In der Weiche `pruefe(db, art, id)` wird der Token-Zweig zu `case "token": return TOKEN_UNLOESCHBAR;`
— **ohne** Datenbankzugriff.

Im `switch` von `loescheElement` **entfällt `case "token"` ersatzlos** (`loeschen.ts:168`). ⚠️ Der
`switch` deckt danach nur noch fünf der sechs `ElementArt`-Werte ab; damit `tsc` das nicht als
Vollständigkeitslücke meldet und niemand den Zweig „reparierend" zurückbaut, bekommt er einen
`default`-Zweig mit einer Zeile Begründung:

```ts
    // 8-F: `token` erreicht diesen switch nie — pruefe() steigt vorher mit
    // loeschbar:false aus. Der Zweig fehlt deshalb absichtlich; ein
    // wiederhergestelltes `case "token"` waere die Ruecknahme von 8-F.
    default:
      throw new Error(`Loeschen fuer ${a} ist nicht vorgesehen`);
```

- [ ] **Schritt 7: `verwaltung/(arbeit)/tokens/**` — der Löschweg verschwindet aus der Oberfläche**

Teil 5 (T148, §10) hat das ausdrücklich angekündigt: „Streicht 8-F den Hard-Delete, entfällt auf
`/verwaltung/tokens` der `LoeschButton`-Aufruf, **nicht** der Dialog." Der Dialog bleibt, weil
`deaktiviereElement` seinen zweiten Ausgang trägt („Sperren"). Konkret:

- Der `LoeschButton art="token"` wird aus der Zeilenaktion entfernt.
- An seiner Stelle steht der Knopf „Sperren" / „Reaktivieren", der `setTokenAktiv` ruft (Zeile 43 in
  Teil 5s Zuordnungstabelle — er existiert bereits).
- ⚠️ **`ElementArt` behält den Wert `"token"`**: `deaktiviereElement("token", …)` bleibt ein gültiger
  Aufruf, und `pruefeLoeschbar("token", …)` liefert weiterhin eine benannte Ablehnung. Wer den Wert
  aus dem Zod-Enum nähme, machte aus einer bewussten Ablehnung einen Parserfehler.

- [ ] **Schritt 8: Grün sehen und die Zählung nachhalten**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/
```

⚠️ **Zählung unverändert:** `tokens.ts` = **2** Deklarationen, `loeschen.ts` = **3**. Die neuen
Exporte (`TOKEN_ALPHABET`, `TOKEN_ZIFFERN`, `TOKEN_ZIEHUNGEN`, `TOKEN_LOESCHGRUND`) sind
**Konstanten**, keine Actions. Der Guard-Scan aus Teil 2 zählt jede exportierte **Funktion**; eine
exportierte `const` mit einem String ist keine. **T172 prüft das ausdrücklich** — läuft die Zählung
danach auf 51 statt 47, ist der Scan zu grob und nicht dieser Task zu weit.

- [ ] **Schritt 9: Commit**

```bash
rtk git add src/app/m/lagerbuch/_actions/tokens.ts \
            src/app/m/lagerbuch/_actions/tokens.test.ts \
            src/app/m/lagerbuch/_actions/loeschen.ts \
            src/app/m/lagerbuch/_actions/loeschen.test.ts \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/tokens"
rtk git commit -m "feat(lagerbuch): Entscheidung 8-F — Zugangs-Codes werden gesperrt, nie geloescht

Spec §8.3. Der Befund: pruefeToken erlaubt heute den Hard-Delete, solange
lastUsedAt null ist, und die Kollisionspruefung laeuft gegen die VORHANDENEN
Zeilen. Zusammen kann ein gedrucktes, nie eingeloestes Kaertchen seinen Code an
ein spaeter ausgestelltes verlieren — und weil tokens.code zugleich der
Anzeigeschluessel im Journal ist, erschienen historische Zeilen danach unter dem
NEUEN Label.

generateUniqueCode bleibt unveraendert: die Pruefung war nur deshalb loechrig,
weil Zeilen verschwinden konnten. Mit dem Hard-Delete faellt die Luecke ohne eine
Zeile im Generator. Eine verbrauchte_codes-Tabelle waere teurer ohne Zusatznutzen.

8-F ist eine Ausnahme fuer TOKENS: der Hard-Delete der uebrigen fuenf Arten
bleibt (§5.21), und last_used_at wandert beim Import weiterhin vollstaendig mit
(§4.12) — es ist danach kein Loeschbarkeitsschalter mehr, sondern ein
Anzeigefeld.

Dazu §8.3 als Konstanten: Alphabet, Laenge, Ziehungen. Der Bindestrich zwischen
Position 3 und 4 ist Teil des gespeicherten Wertes, nicht Anzeigeformat.

Die Zahl der Actions aendert sich NICHT: tokens.ts 2, loeschen.ts 3."
```

### Gate nach Welle 2

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

## Welle 3 — Die Routen (4 Tasks, alle parallel)

⚠️ **T161 und T162 arbeiten in benachbarten Dateien, aber nie in derselben.** T161 besitzt das
Layout, den Rahmen, das Stylesheet und den Scan; T162 die Seite und die Insel. Der Scan aus T161
liest `druck.css` und den Modulbaum — **nicht** die Dateien von T162.

### Task 161: `verwaltung/(druck)/` — Riegel, Rahmen, Stylesheet, Scan

**Files:**
- Create: `src/app/m/lagerbuch/verwaltung/(druck)/layout.tsx`,
  `src/app/m/lagerbuch/verwaltung/(druck)/druck.css`,
  `src/app/m/lagerbuch/_ui/DruckRahmen.tsx`
- Test: `src/app/m/lagerbuch/verwaltung/(druck)/etiketten/druck.test.ts`

**Interfaces:**
- Consumes: `_lib/host.ts` (Teil 1, T10) — `requireLagerbuchHost(headers: Headers): void`;
  `_lib/zugang.ts` (Teil 2, T25) — `requireLagerbuchAdmin(): Promise<Viewer>`;
  `_ui/verwaltung.module.css` (Teil 5, T100) — die Klasse `modul`;
  `_lib/etikettMasse.ts` (T153) — für den Scan.
- Produces:
  ```tsx
  // _ui/DruckRahmen.tsx  (Server Component, KEIN "use client")
  export function DruckRahmen({ children }: { children: React.ReactNode }): React.ReactElement;
  ```
  Dazu die Route-Gruppe selbst: alles unter `verwaltung/(druck)/` läuft ab jetzt **ohne** Shell und
  **mit** beiden Riegeln. Konsument: `verwaltung/(druck)/etiketten/page.tsx` (T162).

**⚠️ Dies ist die sicherheitsrelevanteste Datei des ganzen Vorhabens, und der Grund steht in Teil 1,
F3.** Der Etikettenbogen trägt die Zugangs-Codes **im Klartext** und als QR
(`src/db/etiketten.ts:19,23`). **Fällt `requireLagerbuchAdmin` aus diesem Layout, gibt die Seite
gedruckte Zugangs-Codes an jeden aus, der die URL kennt.** Route-Group-Grenzen sind **keine**
Sicherheitsgrenzen (§2.1 d), und `requiresAuth: false` bedeutet, dass die Middleware hier **nicht**
gatet — `canAccess` steigt sofort mit `true` aus (`core/registry.ts:155`).

**Der Präzedenzfall ist im Zielrepo ausgeschrieben**, und er ist genau dieser Fehler:

> „DIE DRUCKANSICHT IST EIN `@media print`-BLOCK UND KEINE EIGENE ROUTE. Der Präzedenzfall `feedback`
> hat sie als eigene Route mit eigenem Layout — und **genau dort fiel sie aus dem Zugriffsriegel
> heraus, weil der Riegel im anderen Layout hing**."
> — `src/app/m/files/_ui/zugangslinks.module.css:11-16`

**Warum trotzdem eine eigene Route und nicht das `files`-Muster** (§8.4, 8-H): `files` löst den Druck
über `.druckbereich { position: fixed; inset: 0; overflow: hidden }` — das funktioniert dort, weil
**eine** Karte gedruckt wird. Der Etikettenbogen ist **N Etiketten ohne Obergrenze**; bei
`@page { margin: 8mm }` passen rund 40 auf ein A4-Blatt. **Mehrseitigkeit ist der Regelfall**, und
`position: fixed` mit `overflow: hidden` schneidet alles ab Seite zwei ab — still, auf gekauftem
Material. `feedback` hat den Riegel-Mangel bereits **repariert und dokumentiert**
(`src/app/m/feedback/(print)/layout.tsx`); lagerbuch übernimmt genau dieses Muster.

- [ ] **Schritt 1: Den fehlschlagenden Scan schreiben**

`src/app/m/lagerbuch/verwaltung/(druck)/etiketten/druck.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ETIKETT_BREITE_MM, ETIKETT_HOEHE_MM, ETIKETT_QR_MM, ETIKETT_PADDING_MM,
  ETIKETT_SPALT_MM, BOGEN_GAP_BILDSCHIRM_MM, BOGEN_GAP_DRUCK_MM,
  SEITENRAND_MM, ETIKETT_ABGEWAEHLT_OPAZITAET, mm,
} from "@/app/m/lagerbuch/_lib/etikettMasse";

const MODUL = join(__dirname, "..", "..", "..");          // src/app/m/lagerbuch
const DRUCK_CSS = join(__dirname, "..", "druck.css");     // (druck)/druck.css
const css = () => readFileSync(DRUCK_CSS, "utf8");

/** Alle .css unter dem Modulbaum — NICHT nur die .module.css. Ein Scan ueber
 *  `_ui/*.module.css` liesse ausgerechnet druck.css aus und waere gruen und
 *  blind (§6.10.2 Punkt 4, Festlegung J11). */
function alleCss(dir = MODUL, treffer: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) alleCss(p, treffer);
    else if (e.endsWith(".css")) treffer.push(p);
  }
  return treffer;
}

function ohneKommentare(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("druck.css — die Regel steht da (§8.5, §6.10.2)", () => {
  /**
   * DIESER SCAN HAELT DIE AUSSAGE „die Regel steht da", NIE „sie wirkt".
   * `pnpm build` und Vitest sehen @media print gar nicht; Playwright rendert per
   * Vorgabe fuer den Bildschirm. Die Wirkung belegt T167 mit
   * page.emulateMedia({ media: "print" }), das Papier belegt der Probebogen (R30).
   */
  it("traegt @page mit dem Seitenrand aus etikettMasse", () => {
    expect(ohneKommentare(css())).toMatch(
      new RegExp(`@page\\s*\\{[^}]*margin:\\s*${SEITENRAND_MM}mm`),
    );
  });

  it("traegt einen @media print-Block", () => {
    expect(ohneKommentare(css())).toMatch(/@media\s+print\s*\{/);
  });

  it("versteckt .lb-nichtDrucken im Druck", () => {
    const block = /@media\s+print\s*\{([\s\S]*)\n\}/.exec(ohneKommentare(css()));
    expect(block, "kein @media print-Block").not.toBeNull();
    expect(block![1]).toMatch(/\.lb-nichtDrucken\s*\{[^}]*display:\s*none/);
  });

  /**
   * FALLE 43 — DIE ZEILE, WEGEN DER DIESER SCAN EXISTIERT.
   *
   * globals.css:277 schaltet heute mit `body * { visibility: hidden }` ALLES
   * unsichtbar. CSS Modules schreiben ausschliesslich KLASSENselektoren um:
   * `body *` bliebe global und leerte JEDE andere Druckseite der Suite — den
   * feedback-Aushang und die files-Zugangslinks. Die Sichtbarkeitsumkehr wird
   * ersatzlos durch die eigene Route-Gruppe ersetzt: ohne Shell gibt es nichts
   * auszublenden.
   *
   * Der zweite Teil des Problems faellt damit auch: `Layout{minHeight:100vh}`
   * (FullShell.tsx:19) bliebe unter `visibility:hidden` im FLUSS und erzeugte
   * leere Folgeseiten hinter dem Bogen.
   */
  it("enthaelt NIRGENDS body * — in keiner CSS-Datei des Moduls", () => {
    for (const datei of alleCss()) {
      const rein = ohneKommentare(readFileSync(datei, "utf8"));
      expect(rein, datei).not.toMatch(/body\s*\*/);
      expect(rein, datei).not.toMatch(/visibility:\s*hidden/);
    }
  });

  /**
   * `print-color-adjust: exact` ist Pflicht: ohne sie schluckt der Browser
   * Flaechen — er faengt beim Sparen von Farbe genau bei grossen und bei kleinen
   * an. Der QR waere dann ein grauer Kasten.
   */
  it("verbietet dem Browser die Farbsparrechnung", () => {
    const rein = ohneKommentare(css());
    expect(rein).toContain("-webkit-print-color-adjust: exact");
    expect(rein).toContain("print-color-adjust: exact");
  });

  /**
   * EIN BLATT PAPIER HAT KEINEN DUNKELMODUS — und die Werte sind LITERALE, kein
   * `--ant-*`: antd deklariert seine Variablen auf der Scope-Klasse SEINER
   * Komponenten (Falle 2), auf eigenem Markup waeren sie still leer. Ohne diese
   * Festlegung druckt ein Bogen aus einer dunkel eingestellten Sitzung weisse
   * Schrift auf weisses Papier, und print-color-adjust:exact verbietet dem
   * Browser jede Notrechnung — es kaeme nur der QR-Kasten heraus.
   */
  it("nagelt Papier auf #fff und Schrift auf #000", () => {
    const rein = ohneKommentare(css());
    expect(rein).toMatch(/\.lb-etikettbogen\s*\{[^}]*background:\s*#ffffff/);
    expect(rein).toMatch(/\.lb-etikettbogen\s*\{[^}]*color:\s*#000000/);
  });

  it("benutzt keine --ant-Variable", () => {
    expect(ohneKommentare(css())).not.toContain("--ant-");
  });

  /** §8.4: das Druck-CSS greift NIE auf `input` und NIE auf `.ant-*`. Eine Regel
   *  gegen einen antd-internen Klassennamen waere eine Kopplung, die ein
   *  antd-Major still bricht. */
  it("greift weder auf ein nacktes input noch auf .ant-", () => {
    const rein = ohneKommentare(css());
    expect(rein).not.toMatch(/(^|[\s,>])input\b/m);
    expect(rein).not.toContain(".ant-");
  });

  describe("die Millimeter stehen zeichengleich in beiden Welten", () => {
    it("Etikettmass, Innenabstand und Spalt", () => {
      const rein = ohneKommentare(css());
      expect(rein).toContain(`width: ${mm(ETIKETT_BREITE_MM)}`);
      expect(rein).toContain(`height: ${mm(ETIKETT_HOEHE_MM)}`);
      expect(rein).toContain(`padding: ${mm(ETIKETT_PADDING_MM)}`);
      expect(rein).toContain(`gap: ${mm(ETIKETT_SPALT_MM)}`);
      expect(rein).toContain(`repeat(auto-fill, ${mm(ETIKETT_BREITE_MM)})`);
    });

    /**
     * DER QR BRINGT NUR EINE viewBox MIT, KEINE BREITE/HOEHE (8-I, Punkt 2).
     * globals.css:25-28 faengt das heute nur fuer [data-testid="qr-display"] ab.
     * Ohne diese Regel faellt der Code auf die Ersatzgroesse des Browsers zurueck
     * und wird winzig — OHNE dass ein Test anschlaegt.
     */
    it("gibt dem eingesetzten SVG eine Kante", () => {
      const rein = ohneKommentare(css());
      const regel = /\.lb-etikettQr\s*>\s*svg\s*\{([^}]*)\}/.exec(rein);
      expect(regel, "keine Groessenregel fuer das eingesetzte SVG").not.toBeNull();
      expect(regel![1]).toContain(`width: ${mm(ETIKETT_QR_MM)}`);
      expect(regel![1]).toContain(`height: ${mm(ETIKETT_QR_MM)}`);
      expect(regel![1]).toMatch(/display:\s*block/);
    });

    /**
     * `flex: none` GEHOERT AN DEN UMSCHLAG, NICHT AN DAS SVG. Flexbox wirkt auf
     * die FLEX-ITEMS — das ist `.lb-etikettQr`, nicht sein Kind. Im Bestand war
     * das <img> selbst das Item (globals.css:268), deshalb sass es dort richtig.
     * Steht es am SVG, draengt ein langer Artikelname den QR unter 20mm.
     */
    it("haelt den QR-Umschlag am Schrumpfen", () => {
      const rein = ohneKommentare(css());
      const umschlag = /\.lb-etikettQr\s*\{([^}]*)\}/.exec(rein);
      expect(umschlag, "keine Regel auf .lb-etikettQr selbst").not.toBeNull();
      expect(umschlag![1]).toMatch(/flex:\s*none/);
    });

    /**
     * `display: block` AUF BEIDEN TEXTKLASSEN IST PFLICHT. `.lb-etikettText` ist
     * ein Flex-Item, aber selbst ein gewoehnlicher Block — seine Kinder blieben
     * sonst INLINE. Zwei Folgen auf einem 48,5 x 25,4 mm grossen Etikett: Titel
     * und Unterzeile stuenden NEBENEINANDER, und `text-overflow: ellipsis`
     * waere wirkungslos, weil die Eigenschaft bei nicht ersetzten
     * Inline-Elementen nicht greift.
     */
    it("stapelt Titel und Unterzeile", () => {
      const rein = ohneKommentare(css());
      for (const klasse of ["lb-etikettTitel", "lb-etikettSub"]) {
        const regel = new RegExp(`\\.${klasse}\\s*\\{([^}]*)\\}`).exec(rein);
        expect(regel, klasse).not.toBeNull();
        expect(regel![1], klasse).toMatch(/display:\s*block/);
      }
    });

    /**
     * DIE HEIKELSTE ZEILE DER GEOMETRIETABELLE: 2mm am Bildschirm, 0 im Druck.
     * Wer nur die Bildschirmansicht portiert, uebernimmt das falsche Raster und
     * merkt es erst am Drucker.
     */
    it("setzt den Bogenabstand am Bildschirm und im Druck verschieden", () => {
      const rein = ohneKommentare(css());
      const druck = /@media\s+print\s*\{([\s\S]*)\n\}/.exec(rein)![1];
      const bildschirm = rein.slice(0, rein.indexOf("@media"));
      expect(bildschirm).toMatch(
        new RegExp(`\\.lb-etikettbogen\\s*\\{[^}]*gap:\\s*${mm(BOGEN_GAP_BILDSCHIRM_MM)}`),
      );
      expect(druck).toMatch(
        new RegExp(`\\.lb-etikettbogen\\s*\\{[^}]*gap:\\s*${BOGEN_GAP_DRUCK_MM}`),
      );
    });

    /** Abgewaehlt: am Bildschirm blass, im Druck WEG. `opacity: 0` liesse den
     *  Platz stehen und verschoebe alles Folgende um eine Kachel. */
    it("blendet abgewaehlte Kacheln im Druck aus statt sie blass zu machen", () => {
      const rein = ohneKommentare(css());
      const druck = /@media\s+print\s*\{([\s\S]*)\n\}/.exec(rein)![1];
      const bildschirm = rein.slice(0, rein.indexOf("@media"));
      expect(bildschirm).toMatch(
        new RegExp(`\\.lb-etikettAbgewaehlt\\s*\\{[^}]*opacity:\\s*${ETIKETT_ABGEWAEHLT_OPAZITAET}`),
      );
      expect(druck).toMatch(/\.lb-etikettAbgewaehlt\s*\{[^}]*display:\s*none/);
    });
  });
});

describe("Modulweite CSS-Zusicherungen (§12.2, §6.10.2 Punkt 4)", () => {
  /** ES BLEIBT BEI EINEM @media print, und es steht in (druck)/druck.css. */
  it("hat genau eine Datei mit @media print", () => {
    const treffer = alleCss().filter((d) =>
      /@media\s+print/.test(ohneKommentare(readFileSync(d, "utf8"))),
    );
    expect(treffer.map((d) => d.replace(MODUL, ""))).toEqual([
      DRUCK_CSS.replace(MODUL, ""),
    ]);
  });

  /**
   * §12.2: in max-width-Abfragen des Modul-CSS steht KEIN anderer Wert als
   * 767.98px — nicht 768, sonst gelten bei exakt 768px beide Seiten und die
   * Reihenfolge im Stylesheet entscheidet (design/README.md:195-197).
   * lagerbuch schaltet heute bei 760px (globals.css:250); das ist genau der
   * Fall, den feedback bis zum 27.07. hatte, und er ist an beiden Enden
   * unsichtbar.
   */
  it("benutzt in max-width ausschliesslich 767.98px", () => {
    for (const datei of alleCss()) {
      const rein = ohneKommentare(readFileSync(datei, "utf8"));
      for (const m of rein.matchAll(/max-width:\s*([\d.]+)px/g)) {
        expect(m[1], `${datei}: max-width ${m[1]}px`).toBe("767.98");
      }
    }
  });

  /** §7.7.1: _ui/helfer.module.css hat GAR KEINE Media Query. Der Test
   *  toleriert ihr Fehlen — sie gehoert Teil 4. */
  it("laesst helfer.module.css ohne jede Media Query", () => {
    const p = join(MODUL, "_ui", "helfer.module.css");
    let inhalt: string;
    try {
      inhalt = readFileSync(p, "utf8");
    } catch {
      return; // Teil 4 hat die Datei noch nicht angelegt
    }
    expect(ohneKommentare(inhalt)).not.toMatch(/@media/);
  });
});

describe("Die Route-Gruppen belegen keinen Pfad doppelt (§8.4, Auflage 2)", () => {
  /**
   * ZWEI ROUTE-GRUPPEN DUERFEN DENSELBEN AUFGELOESTEN PFAD NICHT DOPPELT
   * BELEGEN — dieselbe Einschraenkung, die src/app/m/feedback/(print)/layout.tsx
   * in ihrem Kopf ausschreibt. `(arbeit)/etiketten/` und `(druck)/etiketten/`
   * loesten beide auf /verwaltung/etiketten auf; Next bricht dann beim Bau ab,
   * aber erst, wenn beide da sind — und in einem Plan mit 24 Tasks ist das eine
   * halbe Sitzung spaeter.
   */
  it("hat kein verwaltung/(arbeit)/etiketten/", () => {
    const arbeit = join(MODUL, "verwaltung", "(arbeit)");
    expect(readdirSync(arbeit)).not.toContain("etiketten");
  });

  /** §8.4, Auflage 2 zweiter Teil: weder das Modul-Layout noch ein
   *  verwaltung/layout.tsx darf existieren und die Shell mounten. Ein Layout
   *  ohne Gruppenklammer ist Vorfahr ALLER Kinder, auch der Gruppe (druck) — die
   *  Shell waere dann wieder da und die ganze Entscheidung liefe leer. */
  it("hat kein verwaltung/layout.tsx", () => {
    expect(readdirSync(join(MODUL, "verwaltung"))).not.toContain("layout.tsx");
  });

  it("mountet im Modul-Layout keine Shell", () => {
    const wurzel = readFileSync(join(MODUL, "layout.tsx"), "utf8");
    expect(wurzel).not.toContain("Shell");
    expect(wurzel).not.toContain("VerwaltungsRahmen");
  });
});

describe("Beide Group-Layouts rufen BEIDE Riegel (F3, §6.1.3)", () => {
  /**
   * ⚠️ DIESER SCAN IST NICHT DIE ZUSICHERUNG, SONDERN NUR IHR BILLIGSTER TEIL.
   * Die tragende Zusicherung ist ein ABRUF: /verwaltung/etiketten OHNE
   * Lagerbuch-Gruppe muss dieselbe Antwort geben wie /verwaltung/artikel ohne
   * Gruppe (T167 Schritt 6, T175). Ein Quelltext-Scan sieht die Kopplung
   * zwischen zwei Layouts nicht — er sieht nur, dass die Zeile dasteht.
   *
   * Er steht trotzdem hier, weil er den haeufigsten Weg abschneidet, auf dem die
   * Zeile verschwindet: jemand raeumt „doppelten" Code auf.
   */
  it.each(["(arbeit)", "(druck)"])("%s/layout.tsx riegelt Host UND Gruppe", (gruppe) => {
    const quelle = readFileSync(
      join(MODUL, "verwaltung", gruppe, "layout.tsx"), "utf8",
    );
    expect(quelle).toContain("requireLagerbuchHost");
    expect(quelle).toContain("requireLagerbuchAdmin");
    // NIE der Suite-Admin, nie ein zweites Praedikat (§3.6.1).
    expect(quelle).not.toContain("isModuleAdmin");
    expect(quelle).not.toContain("user.isAdmin");
  });
});
```

- [ ] **Schritt 2: Rot sehen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/druck.test.ts"
```

Erwartet: `ENOENT: no such file or directory, open '…/(druck)/druck.css'`.

- [ ] **Schritt 3: `druck.css` schreiben**

`src/app/m/lagerbuch/verwaltung/(druck)/druck.css`:

```css
/* DAS DRUCKSTYLESHEET DES ETIKETTENBOGENS (Spec §8.4, §6.10.2).
 *
 * ALLE KLASSEN TRAGEN DAS PRAEFIX `lb-`: druck.css ist ein GEWOEHNLICHES
 * Stylesheet, kein CSS-Modul — die Namen sind global. `feedback` praefixt aus
 * demselben Grund (`.fb-aushang-*`); dass `files` mit `.nichtDrucken` durchkommt,
 * liegt allein daran, dass dort die Klassennamen gehasht werden.
 *
 * WAS HIER AUSDRUECKLICH NICHT STEHT: `body * { visibility: hidden }`
 * (globals.css:277). CSS Modules schreiben ausschliesslich KLASSENselektoren um
 * — `body *` bliebe global und leerte JEDE andere Druckseite der Suite
 * (feedback-Aushang, files-Zugangslinks; Falle 43). Die Sichtbarkeitsumkehr wird
 * ersatzlos durch die eigene Route-Gruppe ersetzt: ohne Shell gibt es nichts
 * auszublenden. Damit entfaellt auch der zweite Teil des Problems —
 * `Layout{minHeight:100vh}` (FullShell.tsx:19) bliebe unter `visibility:hidden`
 * im Fluss und erzeugte leere Folgeseiten hinter dem Bogen.
 *
 * UND NICHT DAS files-MUSTER: `.druckbereich{position:fixed;inset:0;
 * overflow:hidden}` funktioniert dort, weil EINE Karte gedruckt wird. Der
 * Etikettenbogen ist N Etiketten ohne Obergrenze; bei @page{margin:8mm} passen
 * rund 40 auf ein A4-Blatt. Mehrseitigkeit ist der REGELFALL, und
 * position:fixed mit overflow:hidden schneidet alles ab Seite zwei ab — still,
 * auf gekauftem Material.
 *
 * DAS DRUCK-CSS GREIFT NIE AUF `input` UND NIE AUF `.ant-*`. Eine Regel gegen
 * einen antd-internen Klassennamen waere eine Kopplung, die ein antd-Major still
 * bricht; die Suite geht sie an genau EINER Stelle bewusst ein
 * (globals.css `:root .ant-select-selector`, „der Bruch waere still").
 *
 * Die Millimeter sind 1:1-Pflicht 22 und stehen zugleich in
 * _lib/etikettMasse.ts; etiketten/druck.test.ts haelt beide aneinander.
 */

@page {
  margin: 8mm;                            /* globals.css:276 */
}

.lb-etikettbogen {
  display: grid;
  grid-template-columns: repeat(auto-fill, 48.5mm);   /* :265 */
  gap: 2mm;                                           /* :265, Bildschirm */
  /* EIN BLATT PAPIER HAT KEINEN DUNKELMODUS. Die Werte sind LITERALE, kein
   * `--ant-*`: antd deklariert seine Variablen auf der Scope-Klasse SEINER
   * Komponenten (Falle 2), auf eigenem Markup waeren sie still leer. Genau
   * deshalb kann der Dunkelmodus-Schutz hier kein Token sein. Zeichengleich das
   * Problem, das feedback in druck.css:42-61 fuer den Aushang geloest hat. */
  background: #ffffff;
  color: #000000;
}

.lb-etikett {
  width: 48.5mm;                          /* :266 */
  height: 25.4mm;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 2.5mm;
  padding: 2mm;
  border: 1px dashed #c9ced4;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;                        /* die Kachel ist als Ganzes klickbar */
  background: #ffffff;
  color: #000000;
}

.lb-etikettAbgewaehlt {
  opacity: 0.35;                          /* :267 — blass, aber sichtbar */
}

/* DAS `qrcode`-SVG BRINGT NUR EINE viewBox MIT, KEINE BREITE/HOEHE (8-I).
 * globals.css:25-28 faengt das heute nur fuer [data-testid="qr-display"] ab.
 * Ohne diese Regel faellt der Code auf die Ersatzgroesse des Browsers zurueck
 * und wird winzig — OHNE dass ein Test anschlaegt.
 *
 * ⚠️ `flex: none` SITZT AUF DEM UMSCHLAG, NICHT AUF DEM SVG. Flexbox wirkt auf
 * die FLEX-ITEMS, und das ist hier `.lb-etikettQr` — im Bestand war es das
 * <img> selbst (globals.css:268: `.etikett img{...flex:none}`), deshalb sass es
 * dort richtig. Steht es am SVG, kann der Umschlag weiter schrumpfen: ein langer
 * Artikelname draengt den QR unter 20mm, und genau das ist der Ausfall, den
 * §8.4 als „wird winzig, OHNE dass ein Test anschlaegt" benennt. */
.lb-etikettQr {
  flex: none;
}

.lb-etikettQr > svg {
  display: block;
  width: 20mm;                            /* :268 */
  height: 20mm;
}

.lb-etikettText {
  min-width: 0;
}

/* 1:1-Pflicht 22: 11px bzw. 9px. Das ist KEIN Verstoss gegen die 16px-Regel —
 * die gilt fuer EINGABEelemente (§6.7.3), und das hier sind Textknoten auf einem
 * 25,4 mm hohen Klebeetikett.
 *
 * ⚠️ `display: block` IST PFLICHT UND KEINE KOSMETIK. `.lb-etikett` ist ein
 * Flex-Container, `.lb-etikettText` damit ein Flex-ITEM — aber selbst ein
 * gewoehnlicher Block. Seine beiden Kinder blieben ohne diese Zeile INLINE, und
 * das kostet zwei Dinge auf einem 48,5 x 25,4 mm grossen Etikett: Titel und
 * Unterzeile stuenden NEBENEINANDER statt untereinander, und
 * `text-overflow: ellipsis` waere WIRKUNGSLOS — die Eigenschaft greift bei
 * nicht ersetzten Inline-Elementen nicht. Der Bestand hatte das Problem nicht,
 * weil er <div> benutzte (EtikettenBogen.tsx:22). */
.lb-etikettTitel {
  display: block;
  font: 700 11px var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  line-height: 1.05;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lb-etikettSub {
  display: block;
  font: 600 9px var(--font-geist-mono), ui-monospace, monospace;
  color: #444c55;
}

.lb-etikettWahl {
  margin: 0;
  flex: none;
}

@media print {
  .lb-nichtDrucken {
    display: none;
  }

  body {
    background: #fff;
    /* PFLICHT: ohne sie schluckt der Browser Flaechen — beim Sparen von Farbe
     * faengt er genau bei grossen und bei kleinen an, und der QR waere ein
     * grauer Kasten. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .lb-etikettbogen {
    gap: 0;                               /* :279 — Bildschirm 2mm, Papier 0 */
  }

  .lb-etikett {
    border: none;
    border-radius: 0;
    opacity: 1;
  }

  /* `display:none`, NICHT `opacity:0` (:281): opacity liesse den Platz stehen
   * und verschoebe jede folgende Kachel um eine Position. */
  .lb-etikettAbgewaehlt {
    display: none;
  }
}
```

- [ ] **Schritt 4: `_ui/DruckRahmen.tsx` schreiben**

`src/app/m/lagerbuch/_ui/DruckRahmen.tsx`:

```tsx
import type { ReactNode } from "react";
import s from "./verwaltung.module.css";

/**
 * DER RAHMEN DES DRUCKASTS — ohne Shell, ohne Modulnavigation, ohne App-Switcher
 * (§2.9, §6.1.2). Er ist absichtlich fast leer: alles, was er zusaetzlich
 * renderte, landete auf dem Papier.
 *
 * DIE EINE ZEILE, OHNE DIE DIE HALBE FARBENTSCHEIDUNG STILL INS LEERE LAEUFT:
 * `className={s.modul}`. Auf `.modul` liegen ALLE `--lb-*`- und
 * `--lb-ampel-*`-Variablen (§6.6.2a, §6.6.6). Ohne den Traeger loest jedes
 * `var(--lb-…)` ins Leere auf — und eine nicht aufloesbare CSS-Variable faellt
 * auf `transparent` zurueck und ist GUELTIGES CSS. Der Chip bekaeme Polster und
 * Rundung ohne Farbe, die Fokusregel verschwaende: HTTP 200, kein Log, und der
 * Scan aus §6.6.2a Punkt 4 bliebe gruen, weil er die Deklaration prueft und
 * nicht ihren Traeger.
 *
 * WARUM AUCH DER DRUCKAST IHN BRAUCHT, obwohl er keinen Chip rendert: die
 * Fokusregel und die Brotkrume aus §6.8.4 gelten unter BEIDEN Group-Layouts.
 * Die einzige Aussage, die das haelt, ist ein echter Abruf je Modus (§6.6.7).
 *
 * KEIN "use client": der Rahmen ist eine Server Component und darf deshalb
 * keinen Compound-Zugriff auf antd und keinen Icon-Import tragen. Er traegt
 * ueberhaupt kein antd.
 */
export function DruckRahmen({ children }: { children: ReactNode }) {
  return <div className={s.modul}>{children}</div>;
}
```

- [ ] **Schritt 5: `verwaltung/(druck)/layout.tsx` schreiben**

```tsx
import { headers } from "next/headers";
import "./druck.css";
import { requireLagerbuchHost } from "@/app/m/lagerbuch/_lib/host";
import { requireLagerbuchAdmin } from "@/app/m/lagerbuch/_lib/zugang";
import { DruckRahmen } from "@/app/m/lagerbuch/_ui/DruckRahmen";

/**
 * DAS DRUCK-LAYOUT DES ETIKETTENBOGENS (Spec §8.4, Entscheidung 8-H; §6.1.3).
 *
 * EIGENE ROUTE-GROUP OHNE SUITE-SHELL: laege der Bogen unter `(arbeit)`, druckte
 * `FullShell` Kopfzeile und App-Switcher mit — und `minHeight:100vh`
 * (FullShell.tsx:19) erzeugte leere Folgeseiten hinter dem Bogen.
 *
 * DER PREIS UND SEINE BEZAHLUNG — und das ist die sicherheitsrelevante Zeile
 * dieses Moduls: mit dem `(arbeit)`-Layout faellt auch dessen Zugriffsriegel
 * weg, und DIESE Seite zeigt die Zugangs-Codes IM KLARTEXT und als QR
 * (../lagerbuch/src/db/etiketten.ts:19,23). Deshalb ruft dieses Layout DIESELBEN
 * zwei Riegel wie `(arbeit)/layout.tsx` — dieselbe Funktion, nicht zwei
 * Abschriften (§6.1.3, Punkt 1).
 *
 * ZWEI LINIEN SIND PFLICHT, weil `requiresAuth: false` gilt und die Middleware
 * hier nicht gatet: der Riegel in diesem Layout UND derselbe Riegel in der Seite
 * (§8.4, 8-H). Route-Group-Grenzen sind KEINE Sicherheitsgrenzen (§2.1 d).
 *
 * DER PRAEZEDENZFALL STEHT IM REPO: „Der Praezedenzfall `feedback` hat sie als
 * eigene Route mit eigenem Layout — und genau dort fiel sie aus dem
 * Zugriffsriegel heraus, weil der Riegel im anderen Layout hing."
 * (src/app/m/files/_ui/zugangslinks.module.css:11-16). feedback hat es repariert
 * (m/feedback/(print)/layout.tsx); lagerbuch uebernimmt genau dieses Muster.
 *
 * NIE `session.user.isAdmin`, nie `isModuleAdmin`: der Suite-Admin bekommt keine
 * Lagerbuch-Rechte (Betreiber-Entscheidung 3, §3.6.1).
 *
 * Die EINZIGE Zusicherung, die diese Kopplung prueft, ist ein ABRUF:
 * /verwaltung/etiketten ohne Lagerbuch-Gruppe muss dieselbe Antwort geben wie
 * /verwaltung/artikel ohne Gruppe (T167, T175). Ein Quelltext-Scan sieht sie
 * nicht.
 */
export default async function LagerbuchDruckLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  requireLagerbuchHost(await headers());
  await requireLagerbuchAdmin();

  return <DruckRahmen>{children}</DruckRahmen>;
}
```

- [ ] **Schritt 6: Grün sehen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/druck.test.ts"
```

⚠️ Der Block „Beide Group-Layouts rufen BEIDE Riegel" braucht `(arbeit)/layout.tsx` aus **Teil 5,
T112**. Fehlt die Datei, ist der Testfall rot — **das ist richtig und kein Anlass, ihn zu
entschärfen**: Teil 5 ist Vorbedingung dieses Plans.

- [ ] **Schritt 7: Die Gegenprobe fahren, die F3 rechtfertigt**

```bash
# Den Admin-Riegel im Druck-Layout entfernen — der Scan MUSS anschlagen
sed -i.bak '/await requireLagerbuchAdmin();/d' \
  "src/app/m/lagerbuch/verwaltung/(druck)/layout.tsx"
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/druck.test.ts"  # MUSS rot sein
mv "src/app/m/lagerbuch/verwaltung/(druck)/layout.tsx.bak" \
   "src/app/m/lagerbuch/verwaltung/(druck)/layout.tsx"
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/druck.test.ts"  # wieder gruen
```

⚠️ **Der Scan fängt nur die verschwundene Zeile, nicht die wirkungslose.** Deshalb wiederholt T167
Schritt 6 dieselbe Aussage als **Abruf**.

- [ ] **Schritt 8: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(druck)/layout.tsx" \
            "src/app/m/lagerbuch/verwaltung/(druck)/druck.css" \
            "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/druck.test.ts" \
            src/app/m/lagerbuch/_ui/DruckRahmen.tsx
rtk git commit -m "feat(lagerbuch): Druck-Route-Gruppe mit BEIDEN Riegeln und eigenem Stylesheet

Spec §8.4 (8-H, 8-H2), §6.1.3, §6.10.2. Festlegung F3 aus Teil 1.

Das Druck-Layout ruft requireLagerbuchHost UND requireLagerbuchAdmin. Faellt der
zweite weg, gibt die Seite die Zugangs-Codes IM KLARTEXT an jeden aus, der die
URL kennt — Route-Group-Grenzen sind keine Sicherheitsgrenzen, und
requiresAuth:false heisst, dass die Middleware hier nicht gatet. Der
Praezedenzfall steht im Repo ausgeschrieben
(files/_ui/zugangslinks.module.css:11-16).

body * { visibility: hidden } wandert NICHT mit: per CSS-Modul nicht kapselbar,
es leerte jede andere Druckseite der Suite (Falle 43). Die Route-Gruppe ersetzt
es — ohne Shell gibt es nichts auszublenden. Auch das files-Muster
(position:fixed;overflow:hidden) faellt aus: der Bogen ist mehrseitig, und das
schnitte alles ab Seite zwei ab.

Der Bogen ist hart #fff/#000: ein Blatt Papier hat keinen Dunkelmodus, und
print-color-adjust:exact verbietet dem Browser jede Notrechnung.

DruckRahmen setzt className={s.modul} — ohne den Traeger loest jedes var(--lb-…)
ins Leere auf, faellt auf transparent zurueck und ist gueltiges CSS: HTTP 200,
kein Log, Scan gruen.

Gegenprobe gefahren: ein entfernter requireLagerbuchAdmin faerbt den Scan rot."
```

### Task 162: `verwaltung/(druck)/etiketten/` — die Seite und die Auswahl-Insel

**Files:**
- Create: `src/app/m/lagerbuch/verwaltung/(druck)/etiketten/page.tsx`,
  `src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenBogen.tsx`
- Test: `src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenBogen.test.tsx`

**Interfaces:**
- Consumes: `_db/etiketten.ts` (T159) — `etikettenDaten(db)`, `EtikettenBasisFehlt`,
  `type ArtikelEtikett`, `type TokenEtikett`; `_db/client.ts` (Teil 1, T12) — `getDb()`;
  `_lib/zustandTexte.ts` (T158) — `etikettenDomainFehlt()`; `_lib/etikettMasse.ts` (T153);
  `_lib/host.ts` (Teil 1) und `_lib/zugang.ts` (Teil 2) — die **zweite Linie** der Riegel;
  `verwaltung/(druck)/druck.css` (T161) — über das Layout, **nicht** über einen eigenen Import.
- Produces:
  ```tsx
  // EtikettenBogen.tsx   ("use client")
  export function EtikettenBogen(props: {
    artikel: { id: string; name: string; fach: string; qr: string }[];
    tokens:  { code: string; label: string; qr: string }[];
  }): React.ReactElement;
  ```
  Die Seite selbst hat keinen Export außer `default` und `dynamic`. Sie ist die **29.** und letzte
  `page.tsx` des Moduls.

**Vier Fallen, die dieser Task berührt — und die vierte ist die, an der man reflexhaft danebengreift:**

1. **Falle 7 (`@ant-design/icons` in RSC = HTTP 500 beim Import).** `page.tsx` ist eine **Server
   Component** und darf **kein einziges Icon importieren**, auch kein indirekt gezogenes.
   `src/core/shell/icons.test.ts` riegelt das repo-weit ab; geht der Test rot, liegt die Ursache in
   der genannten Datei, nicht in `core/shell`. ⚠️ **Auch die Client-Insel importiert keins** — §6.5.1
   ist modulweit und schließt Client-Inseln ausdrücklich ein. Alle Zeichen kämen aus
   `_ui/ikonen.tsx` (Teil 5, T101).
2. **Falle 6 (Werte aus `"use client"`-Modulen).** Die Millimeter liegen in `_lib/etikettMasse.ts`
   (T153) — **nicht** als `export const` in `EtikettenBogen.tsx`.
3. **Falle 1 (Compound-Zugriff in RSC).** `page.tsx` benutzt **überhaupt kein antd**; damit ist die
   Falle hier strukturell ausgeschlossen statt bewacht.
4. **Falle 5 (Spezifität) — die konkrete Bruchstelle.** `.etikett input, .no-print { display: none }`
   (`globals.css:282`) trifft heute das nackte `<input type="checkbox">`. Ein antd-`Checkbox`
   rendert an dieser Stelle **kein nacktes `<input>`** auf der erwarteten Ebene, sondern eine
   `.ant-checkbox-wrapper`-Struktur — die Regel liefe ins Leere, und **die Auswahlkästchen stünden
   mit auf dem Papier**. Still, weil das erst am Ausdruck auffällt. → **Die Auswahl bleibt ein
   nacktes `<input type="checkbox">`** mit `className="lb-etikettWahl lb-nichtDrucken"` (§6.10.2
   Punkt 1); die Kachel ist ohnehin als Ganzes klickbar, das Kästchen ist Anzeige.

**Eine Bauformentscheidung dieses Plans: der Drucken-Knopf trägt Text und kein Zeichen.** Der Bestand
setzt dort `<Printer size={15} />` aus `lucide-react` (`EtikettenBogen.tsx:3,34`) — das Paket führt
die Suite gar nicht, und ein direkter `@ant-design/icons`-Import ist modulweit verboten. Der
verbleibende Weg wäre ein Name aus `_ui/ikonen.tsx`; ein Name, den `PFADE` dort nicht führt, färbt
`_ui/ikonen.test.ts` (Teil 5) rot. **Text ist hier billiger und ehrlicher als eine Kopplung an eine
36-Namen-Union, die dieser Plan nicht besitzt.** Der Knopf bleibt die Primäraktion — zulässig, weil
er eine **Handlung** ist und keine Datenfläche (Falle 3).

**Was ausdrücklich NICHT geändert wird** (§8.4): die Auswahl-Interaktion (Alle / Keine / Drucken mit
Zähler), der leere Zustand (`„Keine aktiven Artikel oder Token."`), und der harte `aktiv`-Filter.

- [ ] **Schritt 1: Den fehlschlagenden DOM-Test schreiben**

`src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenBogen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mount, unmount, query, queryAll, exists, clickElement } from "@/app/m/qr/_lib/test-dom";
import { EtikettenBogen } from "./EtikettenBogen";

const ARTIKEL = [
  { id: "V1StGXR8_Z5jdHi6B-myT", name: "Mullbinde 8cm", fach: "A2",
    qr: '<svg viewBox="0 0 45 45"><path d="M0 0h1v1H0z"/></svg>' },
  { id: "aaaaaaaaaaaaaaaaaaaaa", name: "Kompresse 10x10", fach: "B1",
    qr: '<svg viewBox="0 0 45 45"><path d="M1 1h1v1H1z"/></svg>' },
];
const TOKENS = [
  { code: "482-137", label: "RTW 1",
    qr: '<svg viewBox="0 0 45 45"><path d="M2 2h1v1H2z"/></svg>' },
];

afterEach(() => unmount());

describe("EtikettenBogen", () => {
  /**
   * §12.1, PUNKT 7 — DIE ALTE FASSUNG UND IHRE NACHFOLGERIN, namentlich
   * gegeneinander gehalten (§12.3, Regel 3):
   *
   *   ALT:  lagerbuch/e2e/etiketten.spec.ts:11-13
   *         page.locator(".etikett img") — n Zeilen ergeben n <img>, und
   *         `toHaveAttribute("src", /^data:image\/png/)`.
   *   NEU:  n Zeilen ergeben n `.lb-etikettQr > svg`.
   *
   * Der TRAEGER wechselt von <img src="data:…"> auf ein eingesetztes <svg>
   * (§8.4, 8-I). Die Aussage bleibt: „so viele Kacheln wie Datensaetze, jede mit
   * einem Code". Was die alte Fassung NIE geprueft hat — den INHALT des Codes —
   * besitzt jetzt _db/etiketten.test.ts, mit Dekodierung.
   */
  it("rendert je Datensatz genau einen QR-Knoten", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    expect(queryAll(".lb-etikettQr > svg")).toHaveLength(3);
    expect(queryAll(".lb-etikett")).toHaveLength(3);
    // Kein <img> mehr — der alte Anker ist tot und soll es bleiben.
    expect(exists(".lb-etikett img")).toBe(false);
  });

  it("setzt das SVG unveraendert ein", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    expect(query(".lb-etikettQr").innerHTML).toContain('viewBox="0 0 45 45"');
  });

  it("zeigt Name und Fach beim Artikel, Label und Code beim Token", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    const texte = queryAll(".lb-etikettTitel").map((e) => e.textContent);
    expect(texte).toEqual(["Mullbinde 8cm", "Kompresse 10x10", "RTW 1"]);
    const subs = queryAll(".lb-etikettSub").map((e) => e.textContent);
    expect(subs).toEqual(["A2", "B1", "482-137"]);
  });

  /**
   * DER KLARTEXT-CODE IST EIN EIGENER VERTRAG (§8.1, Form 3): der QR ist
   * host-gebunden, die Zeile darunter ist es NICHT. Ein Domainwechsel kostet
   * dort nur den Komfort — die Helferin tippt 482-137 am Gate ein und ist drin.
   * Deshalb steht der Code als TEXT auf dem Kaertchen und nicht nur im QR.
   */
  it("druckt den Zugangs-Code als Klartext unter den QR", async () => {
    await mount(<EtikettenBogen artikel={[]} tokens={TOKENS} />);
    expect(query(".lb-etikettSub").textContent).toBe("482-137");
  });

  it("waehlt zu Beginn alles aus", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    expect(queryAll(".lb-etikettAbgewaehlt")).toHaveLength(0);
    expect(query("[data-testid='lb-drucken']").textContent).toContain("(3)");
  });

  it("waehlt eine Kachel ab und wieder an", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    await clickElement(queryAll(".lb-etikettWahl")[0]);
    expect(queryAll(".lb-etikettAbgewaehlt")).toHaveLength(1);
    expect(query("[data-testid='lb-drucken']").textContent).toContain("(2)");
    await clickElement(queryAll(".lb-etikettWahl")[0]);
    expect(queryAll(".lb-etikettAbgewaehlt")).toHaveLength(0);
  });

  it("schaltet ueber Alle und Keine", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    await clickElement(query("[data-testid='lb-keine']"));
    expect(queryAll(".lb-etikettAbgewaehlt")).toHaveLength(3);
    expect(query("[data-testid='lb-drucken']").textContent).toContain("(0)");
    await clickElement(query("[data-testid='lb-alle']"));
    expect(queryAll(".lb-etikettAbgewaehlt")).toHaveLength(0);
  });

  it("ruft window.print", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    await clickElement(query("[data-testid='lb-drucken']"));
    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  /** 1:1 aus EtikettenBogen.tsx:27 — Wortlaut unveraendert. */
  it("nennt den leeren Zustand beim Namen", async () => {
    await mount(<EtikettenBogen artikel={[]} tokens={[]} />);
    expect(query(".lb-nichtDrucken").textContent).toBe("Keine aktiven Artikel oder Token.");
    expect(exists(".lb-etikettbogen")).toBe(false);
  });

  /**
   * FALLE 5, DIE KONKRETE BRUCHSTELLE: ein antd-Checkbox rendert hier KEIN
   * nacktes <input> auf der erwarteten Ebene, sondern eine
   * .ant-checkbox-wrapper-Struktur. Die Druckregel liefe ins Leere und die
   * Auswahlkaestchen stuenden MIT auf dem Papier — still, weil es erst am
   * Ausdruck auffaellt (§6.10.2, Punkt 1).
   */
  it("benutzt ein nacktes Kontrollkaestchen, keinen antd-Baustein", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    const kasten = queryAll(".lb-etikettWahl");
    expect(kasten).toHaveLength(3);
    for (const k of kasten) {
      expect(k.tagName).toBe("INPUT");
      expect(k.getAttribute("type")).toBe("checkbox");
      expect(k.className).toContain("lb-nichtDrucken");
      expect(k.closest(".ant-checkbox-wrapper")).toBeNull();
    }
  });

  /**
   * DIE KLASSE SITZT AUF DEM KAESTCHEN, NIE AUF DEM LABEL. Auf dem Label saesse
   * die Druckregel auf dem GANZEN Etikett und druckte ein leeres Blatt (§8.4).
   */
  it("haengt lb-nichtDrucken nicht an die Kachel", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    for (const kachel of queryAll(".lb-etikett")) {
      expect(kachel.className).not.toContain("lb-nichtDrucken");
    }
  });

  it("versteckt die Bedienleiste im Druck", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    expect(query("[data-testid='lb-drucken']").closest(".lb-nichtDrucken")).not.toBeNull();
  });

  /** §6.5.1 gilt modulweit und ausdruecklich auch fuer Client-Inseln. Der
   *  Bestand importiert `lucide-react` in dieser Datei; keine dieser
   *  Importzeilen wandert mit — die Suite fuehrt das Paket gar nicht. */
  it("importiert weder @ant-design/icons noch lucide-react", () => {
    const quelle = readFileSync(join(__dirname, "EtikettenBogen.tsx"), "utf8");
    expect(quelle).not.toContain("@ant-design/icons");
    expect(quelle).not.toContain("lucide-react");
  });

  /** Falle 7: die Seite daneben ist eine Server Component und darf kein
   *  einziges Icon importieren — auch kein indirekt gezogenes. */
  it("laesst die Seite ohne Icon-Import und ohne antd", () => {
    const seite = readFileSync(join(__dirname, "page.tsx"), "utf8");
    expect(seite).not.toContain("@ant-design/icons");
    expect(seite).not.toMatch(/from\s+["']antd["']/);
    expect(seite).not.toContain("lucide-react");
  });

  /** Falle 6: die Millimeter stehen NICHT in der Insel. */
  it("haelt keine Millimeterwerte in der Insel", () => {
    const quelle = readFileSync(join(__dirname, "EtikettenBogen.tsx"), "utf8");
    expect(quelle).not.toMatch(/=\s*48\.5\b/);
    expect(quelle).not.toMatch(/=\s*25\.4\b/);
  });
});
```

- [ ] **Schritt 2: Rot sehen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenBogen.test.tsx"
```

Erwartet: `Failed to load url ./EtikettenBogen`.

- [ ] **Schritt 3: Die Client-Insel schreiben**

`src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenBogen.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "antd";

/**
 * DIE AUSWAHL-INSEL DES ETIKETTENBOGENS (Spec §8.4).
 *
 * WAS AUSDRUECKLICH NICHT GEAENDERT WIRD: die Interaktion (Alle / Keine /
 * Drucken mit Zaehler), der leere Zustand im Wortlaut, und dass alles zu Beginn
 * ausgewaehlt ist.
 *
 * DAS KONTROLLKAESTCHEN BLEIBT NACKT — kein antd-Checkbox (§6.10.2, Punkt 1).
 * Ein antd-Checkbox rendert an dieser Stelle KEIN nacktes <input> auf der
 * erwarteten Ebene, sondern eine .ant-checkbox-wrapper-Struktur: die Druckregel
 * liefe ins Leere und die Kaestchen stuenden MIT auf dem Papier. Still, weil es
 * erst am Ausdruck auffaellt (Falle 5). Und die Kachel ist ohnehin als Ganzes
 * klickbar — das Kaestchen ist Anzeige.
 *
 * `lb-nichtDrucken` sitzt auf dem KAESTCHEN, nie auf dem <label>: auf dem Label
 * saesse die Regel auf dem ganzen Etikett und druckte ein leeres Blatt.
 *
 * KEIN ZEICHEN AM KNOPF. Der Bestand setzt dort <Printer/> aus `lucide-react`
 * (EtikettenBogen.tsx:3,34) — das Paket fuehrt die Suite nicht, und ein direkter
 * @ant-design/icons-Import ist modulweit verboten, auch in Client-Inseln
 * (§6.5.1). Der verbleibende Weg waere ein Name aus _ui/ikonen.tsx; ein Name,
 * den PFADE dort nicht fuehrt, faerbt _ui/ikonen.test.ts rot. Text ist hier
 * billiger und ehrlicher.
 *
 * KEIN `size` am Button: controlHeight ist 56 und damit schon das richtige Mass;
 * `size="large"` waere 72px (Falle 4).
 *
 * Das SVG kommt per dangerouslySetInnerHTML herein — dieselbe Stelle und
 * dieselbe Begruendung wie src/app/m/qr/QrDisplay.tsx:16-21: das Markup stammt
 * aus dem SVG-Serializer von `qrcode`, die Nutzlast landet als Modulkoordinaten
 * im d-Attribut, nie als Text im Markup.
 */

type A = { id: string; name: string; fach: string; qr: string };
type T = { code: string; label: string; qr: string };

export function EtikettenBogen({ artikel, tokens }: { artikel: A[]; tokens: T[] }) {
  const keys = [...artikel.map((a) => `a:${a.id}`), ...tokens.map((t) => `t:${t.code}`)];
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set(keys));

  function umschalten(k: string) {
    setGewaehlt((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  function etikett(k: string, qr: string, titel: string, sub: string) {
    return (
      <label className={`lb-etikett${gewaehlt.has(k) ? "" : " lb-etikettAbgewaehlt"}`} key={k}>
        <input
          type="checkbox"
          className="lb-etikettWahl lb-nichtDrucken"
          checked={gewaehlt.has(k)}
          onChange={() => umschalten(k)}
          aria-label={`${titel} drucken`}
        />
        <span className="lb-etikettQr" dangerouslySetInnerHTML={{ __html: qr }} />
        <span className="lb-etikettText">
          <span className="lb-etikettTitel">{titel}</span>
          <span className="lb-etikettSub">{sub}</span>
        </span>
      </label>
    );
  }

  // 1:1 aus EtikettenBogen.tsx:27, Wortlaut unveraendert.
  if (keys.length === 0) {
    return <p className="lb-nichtDrucken">Keine aktiven Artikel oder Token.</p>;
  }

  return (
    <>
      <div className="lb-nichtDrucken" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Button data-testid="lb-alle" onClick={() => setGewaehlt(new Set(keys))}>
          Alle
        </Button>
        <Button data-testid="lb-keine" onClick={() => setGewaehlt(new Set())}>
          Keine
        </Button>
        {/* Primaeraktion — zulaessig, weil der Knopf eine HANDLUNG ist und keine
            Datenflaeche. Rot traegt im Etikettenbogen an keiner Stelle Bedeutung
            (Falle 3). */}
        <Button data-testid="lb-drucken" type="primary" onClick={() => window.print()}>
          Drucken ({gewaehlt.size})
        </Button>
      </div>
      <div className="lb-etikettbogen">
        {artikel.map((a) => etikett(`a:${a.id}`, a.qr, a.name, a.fach))}
        {tokens.map((t) => etikett(`t:${t.code}`, t.qr, t.label, t.code))}
      </div>
    </>
  );
}
```

⚠️ **`.lb-etikettTitel` und `.lb-etikettSub` MÜSSEN `display: block` tragen, und die Regel steht in
T161s `druck.css`.** `.lb-etikett` ist ein Flex-Container, `.lb-etikettText` damit ein Flex-**Item** —
aber selbst ein gewöhnlicher Block, und seine beiden Kinder blieben ohne die Zeile **inline**. Das
kostet zwei Dinge auf einem 48,5 × 25,4 mm großen Etikett: Titel und Unterzeile stünden
**nebeneinander** statt untereinander, und `text-overflow: ellipsis` wäre **wirkungslos** — die
Eigenschaft greift bei nicht ersetzten Inline-Elementen nicht. Der Bestand hatte das Problem nicht,
weil er `<div>` benutzte (`EtikettenBogen.tsx:22`). `min-width: 0` allein leistet das **nicht**.
`druck.test.ts` (T161) prüft beide Zeilen; der Beweis auf dem Bildschirm steht in T170.

- [ ] **Schritt 4: Die Seite schreiben**

`src/app/m/lagerbuch/verwaltung/(druck)/etiketten/page.tsx`:

```tsx
import { headers } from "next/headers";
import { requireLagerbuchHost } from "@/app/m/lagerbuch/_lib/host";
import { requireLagerbuchAdmin } from "@/app/m/lagerbuch/_lib/zugang";
import { getDb } from "@/app/m/lagerbuch/_db/client";
import { etikettenDaten, EtikettenBasisFehlt } from "@/app/m/lagerbuch/_db/etiketten";
import { etikettenDomainFehlt } from "@/app/m/lagerbuch/_lib/zustandTexte";
import { EtikettenBogen } from "./EtikettenBogen";

export const dynamic = "force-dynamic";

/**
 * DER ETIKETTENBOGEN → /verwaltung/etiketten (Entscheidung 8-H2).
 *
 * DER OEFFENTLICHE PFAD BLEIBT. Route-Gruppen erscheinen nicht in der URL; ein
 * naiv unter der Modulwurzel angelegtes (druck)/etiketten loeste auf
 * /etiketten auf. Der Pfad steht in Lesezeichen und in der Navigation — ihn
 * nebenbei zu verschieben waere genau die Sorte stiller Aenderung, die §8
 * sonst verhindert.
 *
 * ZWEITE LINIE DER RIEGEL. Das (druck)-Layout riegelt bereits; diese Seite tut
 * es noch einmal. Beides ist Pflicht, weil `requiresAuth: false` gilt und die
 * Middleware hier nicht gatet (§8.4, 8-H, „Zwei Linien sind Pflicht").
 *
 * KEIN antd UND KEIN ICON IN DIESER DATEI. Sie ist eine Server Component: ein
 * Compound-Zugriff (Typography.Title & Geschwister) ergaebe HTTP 500 (Falle 1),
 * ein @ant-design/icons-Import ebenfalls — und zwar SCHON BEIM IMPORT, nicht
 * beim Rendern, waehrend typecheck und build gruen bleiben (Falle 7). Der
 * einfachste Weg, beide Fallen strukturell auszuschliessen, ist: gar kein antd
 * hier. Was antd braucht, steht in der Insel daneben.
 */
export default async function EtikettenSeite() {
  requireLagerbuchHost(await headers());
  await requireLagerbuchAdmin();

  let daten;
  try {
    daten = await etikettenDaten(getDb());
  } catch (e) {
    /**
     * §11.5, ZUSTAND 38 / Entscheidung 8-B. NUR diese eine Klasse wird gefangen;
     * jeder andere Wurf faellt an error.tsx durch, und das ist richtig — ein
     * Datenbankfehler ist kein Konfigurationsfehler, und ein Textvergleich als
     * Kontrollfluss braeche beim ersten Umformulieren.
     *
     * §11.7: der Zustand traegt einen benannten Weg zurueck.
     */
    if (e instanceof EtikettenBasisFehlt) {
      return (
        <div className="lb-nichtDrucken">
          <h1>Etiketten</h1>
          <p>{etikettenDomainFehlt()}</p>
          <p>
            <a href="/verwaltung">Zurück zur Übersicht</a>
          </p>
        </div>
      );
    }
    throw e;
  }

  return (
    <>
      <h1 className="lb-nichtDrucken">Etiketten</h1>
      {/*
        §8.1, 8-B, Fehlerzustand 2: `moduleUrl` nimmt prodHostsFor(mod)[0]. Eine
        Umsortierung von SUITE_HOST_LAGERBUCH aendert STILL jeden ab dann
        gedruckten Bogen, waehrend die alten Etiketten weiter auf den frueheren
        ersten Eintrag zeigen. Diese Zeile kostet nichts und ist der einzige Weg,
        den Fehler VOR dem Papier zu bemerken.
      */}
      <p className="lb-nichtDrucken" data-testid="lb-basis">
        Alle QR-Codes zeigen auf {daten.basis}
      </p>
      <EtikettenBogen artikel={daten.artikel} tokens={daten.tokens} />
    </>
  );
}
```

- [ ] **Schritt 5: Grün sehen — und §12.1 Punkt 7 abhaken**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/"
```

Der Testfall „rendert je Datensatz genau einen QR-Knoten" **ist** der ersetzende Test für §12.1
Punkt 7. Die alte Fassung (`lagerbuch/e2e/etiketten.spec.ts:11-13`, `.etikett img` mit
`toHaveAttribute("src", /^data:image\/png/)`) und die neue stehen im Kopfkommentar namentlich
nebeneinander (§12.3, Regel 3).

- [ ] **Schritt 6: Den Abruf fahren — die einzige Prüfung für Falle 1, 6 und 7**

```bash
SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me pnpm dev &
sleep 15
curl -s -o /dev/null -w "%{http_code}\n" http://lagerbuch.localtest.me:3000/verwaltung/etiketten
curl -s http://lagerbuch.localtest.me:3000/verwaltung/etiketten | grep -c "lb-etikettQr"
```

Erwartet: `200`, und eine Zahl größer null. ⚠️ **Ein `500` hier ist fast immer Falle 1, 6 oder 7** —
und keins der vier Gates hätte es gesehen. Protokolliere Status und Trefferzahl; die Zeile gehört in
die Abrufliste (§7).

- [ ] **Schritt 7: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/page.tsx" \
            "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenBogen.tsx" \
            "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenBogen.test.tsx"
rtk git commit -m "feat(lagerbuch): Etikettenbogen — Seite ohne antd, Insel mit nacktem Kaestchen

Spec §8.4, §6.10.2. Der oeffentliche Pfad bleibt /verwaltung/etiketten (8-H2):
er steht in Lesezeichen und in der Navigation.

Die Seite benutzt UEBERHAUPT KEIN antd. Damit sind Falle 1 (Compound-Zugriff in
RSC) und Falle 7 (Icon-Import wirft SCHON BEIM IMPORT) hier strukturell
ausgeschlossen statt bewacht — beide sind fuer typecheck, lint, build und Vitest
unsichtbar.

Das Kontrollkaestchen bleibt ein nacktes <input type=checkbox>: ein
antd-Checkbox rendert kein nacktes input auf der erwarteten Ebene, die
Druckregel liefe ins Leere und die Kaestchen stuenden MIT auf dem Papier
(Falle 5). lb-nichtDrucken sitzt auf dem Kaestchen, nie auf dem Label — dort
druckte es ein leeres Blatt.

Der Knopf traegt Text statt eines Zeichens: lucide-react fuehrt die Suite nicht,
@ant-design/icons ist modulweit verboten (auch in Inseln), und ein Name aus
_ui/ikonen.tsx, den PFADE nicht fuehrt, faerbt ikonen.test.ts rot.

Die Seite schreibt den verwendeten Host ueber den Bogen — der einzige Weg, eine
Umsortierung von SUITE_HOST_LAGERBUCH vor dem Papier zu bemerken.

Ersetzt Spec-Aussage 7 aus §12.1: n Zeilen ergeben n .lb-etikettQr > svg
(vorher n <img src=data:image/png>). Beide Fassungen stehen im Testkommentar
namentlich nebeneinander (§12.3, Regel 3)."
```

### Task 163: `error.tsx` — die Modul-Fehlergrenze

**Files:**
- Create: `src/app/m/lagerbuch/error.tsx`, `src/app/m/lagerbuch/_ui/fehler.module.css`
- Test: `src/app/m/lagerbuch/error.test.tsx`

**Interfaces:**
- Consumes: `_lib/zustandTexte.ts` (T158) — `FEHLER_TITEL`, `FEHLER_ERNEUT`, `FEHLER_ZURUECK`.
- Produces: die Fehlergrenze des ganzen Moduls. Sie hat **keinen benannten Export** (Next verlangt
  `default`) und wird von keiner anderen Datei importiert — sie ist eine **Segmentdatei**.

**Warum es sie gibt** (§11.2). lagerbuch hat **null** Grenzdateien: unter `src/app/` liegt weder
`error.tsx` noch `global-error.tsx` noch `not-found.tsx` noch `loading.tsx`. Die Suite hat genau
**eine** (`src/app/not-found.tsx`). Die Portierung erbt aus beiden Richtungen nichts. Dazu **22
Action-Aufrufe ohne `catch`** (Falle 62), deren Ablehnung React an die nächste Fehlergrenze
weiterreicht — die gibt es heute nicht und nach dem Port auch nicht, bis auf **diese eine**.

**⚠️ `"use client"` in Zeile 1, ohne Ausnahme.** Next verlangt das für jede Fehlergrenze, und
`reset()` ist eine Prop, die nur ein Client-Modul annehmen kann. Sie ist damit die **einzige**
`"use client"`-Datei außerhalb von `_ui/`. Das Verbot aus §2.1 richtet sich gegen `_lib/` (Falle 6)
und bleibt unberührt — den Rahmen darf sie sich weiterhin aus `_ui/` holen, **die Texte müssen** aus
`_lib/` kommen (J6).

**⚠️ Ausdrücklich NICHT: `m/lagerbuch/not-found.tsx`** (Entscheidung 36 (b) verworfen). Sie ruht auf
genau der Vorbedingung, die niemand gemessen hat, und sie hat **keinen Kunden**: die verbleibenden
`notFound()`-Würfe sind Riegel (falscher Host, fehlende Gruppe, unbekannte Objekt-ID in der
Verwaltung), und für die ist die Suite-404 die richtige und bereits gehärtete Form —
`src/app/not-found.tsx:4-27` schreibt im Dateikopf aus, warum sie ohne Shell erscheint, und ihr
zweiter Absatz (`:41-46`) ist **wörtlich für den Fall „darfst du nicht sehen" geschrieben worden**.

**⚠️ Ebenso ausdrücklich: keine `loading.tsx`, in keiner Route.** Alle Einstiegsseiten sind
`force-dynamic`; jede Navigation wartet in beiden Welten auf denselben Server-Rundlauf. Eine
Ladegrenze kürzte nichts ab, sondern erzeugte eine **zweite Anmutung**. `global-error.tsx` ist eine
Wurzelfrage und nicht Sache dieses Moduls.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/error.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mount, unmount, query, exists, clickElement } from "@/app/m/qr/_lib/test-dom";
import Fehlergrenze from "./error";
import { FEHLER_TITEL, FEHLER_ERNEUT, FEHLER_ZURUECK } from "./_lib/zustandTexte";

afterEach(() => unmount());

describe("error.tsx — die Modul-Fehlergrenze (§11.2, §12.2)", () => {
  it("rendert den Text ohne Technik", async () => {
    await mount(<Fehlergrenze error={new Error("boom")} reset={() => {}} />);
    expect(document.body.textContent).toContain(FEHLER_TITEL);
    // Der geworfene Text erscheint NIRGENDS: in Produktion waere er ohnehin der
    // englische Satz des Deserialisierers ueber eine „server-side exception"
    // (Falle 66) — die 22 sorgfaeltig formulierten deutschen Meldungen sind
    // fachlich richtig und betrieblich wirkungslos (§11.2 d).
    expect(document.body.textContent).not.toContain("boom");
  });

  it("bietet Erneut versuchen und ruft reset", async () => {
    const reset = vi.fn();
    await mount(<Fehlergrenze error={new Error("boom")} reset={reset} />);
    await clickElement(query("[data-testid='lb-fehler-erneut']"));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(query("[data-testid='lb-fehler-erneut']").textContent).toBe(FEHLER_ERNEUT);
  });

  /**
   * §11.7: JEDER gestaltete Zustand traegt einen benannten Weg zurueck. `/` und
   * NICHT der Suite-Host: unter dem Host-Rewrite fuehrt der relative Pfad an den
   * Anfang GENAU DES Moduls, auf dem man gerade steht — und der ist das Gate
   * (Entscheidung 15, §3.6.6). Ein absoluter Link koennte das nicht zugleich.
   */
  it("fuehrt relativ zurueck an den Modulanfang", async () => {
    await mount(<Fehlergrenze error={new Error("boom")} reset={() => {}} />);
    const weg = query("[data-testid='lb-fehler-zurueck']");
    expect(weg.getAttribute("href")).toBe("/");
    expect(weg.textContent).toBe(FEHLER_ZURUECK);
  });

  it("zeigt keinen Stack und keine digest-Kennung", async () => {
    const e = Object.assign(new Error("boom"), { digest: "1234567890" });
    await mount(<Fehlergrenze error={e} reset={() => {}} />);
    expect(document.body.textContent).not.toContain("1234567890");
    expect(exists("pre")).toBe(false);
  });

  /**
   * FALLE 7 — und sie ist hier besonders naheliegend: ein Warndreieck in einer
   * Fehlergrenze ist genau die Stelle, an der man reflexhaft ein Icon
   * importiert. Der Fehler entstuende BEIM IMPORT, nicht beim Rendern, und
   * "use client" behebt ihn nicht, es macht ihn still (HTTP 200 mit leerer Map
   * und still falschem Icon). `next/dynamic` mit `ssr:false` ist keine Abhilfe.
   */
  it("importiert kein Icon-Paket", () => {
    const quelle = readFileSync(join(__dirname, "error.tsx"), "utf8");
    expect(quelle).not.toContain("@ant-design/icons");
    expect(quelle).not.toContain("lucide-react");
  });

  /**
   * DIE ANMUTUNGSENTSCHEIDUNG (J7): kein antd. Die Grenze faengt BEIDE Aeste des
   * Moduls — den bewusst antd-freien Helfer-Weg (Entscheidung 28, §7.1) und die
   * antd-Verwaltung (§6). antd hier zoege die Verwaltungsanmutung in den
   * Helfer-Zweig; verwaltung.module.css zoege zusaetzlich --lb-* dorthin.
   * Vorbild ist src/app/not-found.tsx: eigenes Markup, eigene Modul-CSS-Datei,
   * eigene --xx-*-Variablen (dort --nf-*).
   */
  it("benutzt kein antd", () => {
    const quelle = readFileSync(join(__dirname, "error.tsx"), "utf8");
    expect(quelle).not.toMatch(/from\s+["']antd["']/);
  });

  /** Next verlangt "use client" fuer jede Fehlergrenze, und `reset` ist eine
   *  Prop, die nur ein Client-Modul annehmen kann. */
  it("traegt use client in Zeile 1", () => {
    const erste = readFileSync(join(__dirname, "error.tsx"), "utf8").split("\n")[0].trim();
    expect(erste).toMatch(/^["']use client["'];?$/);
  });

  /**
   * ENTSCHEIDUNG 36 (b) IST VERWORFEN: es gibt KEINE m/lagerbuch/not-found.tsx.
   * Die verbleibenden notFound()-Wuerfe sind Riegel, und fuer die ist die
   * Suite-404 die richtige und bereits gehaertete Form — ihr zweiter Absatz ist
   * woertlich fuer den Fall „darfst du nicht sehen" geschrieben.
   */
  it("legt weder not-found.tsx noch loading.tsx noch global-error.tsx an", () => {
    const eintraege = readdirSync(__dirname);
    expect(eintraege).not.toContain("not-found.tsx");
    expect(eintraege).not.toContain("loading.tsx");
    expect(eintraege).not.toContain("global-error.tsx");
  });
});
```

- [ ] **Schritt 2: Rot sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/error.test.tsx
```

Erwartet: `Failed to load url ./error`.

- [ ] **Schritt 3: `_ui/fehler.module.css` schreiben**

```css
/*
 * DIE MODUL-FEHLERGRENZE (§11.2). Eigenes Markup, eigene Variablen — dasselbe
 * Muster wie src/app/not-found.module.css mit seinen --nf-*.
 *
 * WARUM KEINE --ant-*: antd deklariert seine Variablen auf der Scope-Klasse
 * SEINER Komponenten (Falle 2). Diese Flaeche besteht vollstaendig aus eigenem
 * Markup — ein --ant-* waere hier still leer, und die Farbe verschwaende
 * einfach.
 *
 * WARUM KEINE --lb-*: die liegen auf `.modul` aus verwaltung.module.css, und
 * dieser Traeger existiert im Helfer-Zweig nicht. Die Fehlergrenze faengt BEIDE
 * Aeste; sie darf an keinem von beiden haengen.
 *
 * Hell/Dunkel laeuft ueber <html data-theme>, NICHT ueber prefers-color-scheme
 * (§6.6.6, CLAUDE.md).
 */

.seite {
  --lbf-flaeche: #ffffff;
  --lbf-schrift: #1a1d20;
  --lbf-gedaempft: #5b6570;
  --lbf-linie: #dfe3e8;

  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  color: var(--lbf-schrift);
}

:global(html[data-theme="dark"]) .seite {
  --lbf-flaeche: #16191c;
  --lbf-schrift: #eceff1;
  --lbf-gedaempft: #9aa4ae;
  --lbf-linie: #2c3236;
}

.karte {
  max-width: 34rem;
  width: 100%;
  background: var(--lbf-flaeche);
  border: 1px solid var(--lbf-linie);
  border-radius: 8px;
  padding: 24px;
}

/* 3px linke Kante statt einer roten Flaeche: Rot traegt in diesem Modul
 * fachliche Bedeutung (Verfall-Ampel, Geraetefaelligkeit), und
 * colorError === colorPrimary === #c8000f. Ein Alert type="error" saehe aus wie
 * eine Primaeraktion und konkurrierte mit der Ampel um dieselbe Farbe (§11.6). */
.kante {
  display: block;
  width: 3px;
  height: 100%;
  background: #c8000f;
}

.titel {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px;
}

.text {
  color: var(--lbf-gedaempft);
  margin: 0 0 16px;
}

.aktionen {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

/* 16px ist die Untergrenze fuer alles Bedienbare (§6.7.3, §7.7.2) — und 44px
 * Hoehe die Tapflaeche. Der Helfer-Ast erreicht diese Grenze ebenfalls. */
.knopf {
  font: inherit;
  font-size: 16px;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 6px;
  border: 1px solid var(--lbf-linie);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.zurueck {
  font-size: 16px;
  color: var(--lbf-gedaempft);
}
```

- [ ] **Schritt 4: `error.tsx` schreiben**

```tsx
"use client";
import s from "./_ui/fehler.module.css";
import { FEHLER_TITEL, FEHLER_ERNEUT, FEHLER_ZURUECK } from "./_lib/zustandTexte";

/**
 * DIE FEHLERGRENZE DES MODULS (Spec §11.2).
 *
 * "use client" IN ZEILE 1, OHNE AUSNAHME: Next verlangt das fuer jede
 * Fehlergrenze, und `reset` ist eine Prop, die nur ein Client-Modul annehmen
 * kann. Sie ist damit die einzige "use client"-Datei ausserhalb von _ui/ — als
 * Segmentdatei muss sie neben der Route liegen. Das Verbot aus §2.1 richtet sich
 * gegen _lib/ (Falle 6) und bleibt unberuehrt.
 *
 * IHRE TEXTE KOMMEN AUS _lib/, IHRE ZEICHEN WAEREN INLINE-SVG (§11.6). Ein
 * Zustandstext, den sie selbst hielte, waere ein Wert aus einem Client-Modul und
 * damit Falle 6 fuer jede Server Component, die ihn mitliest; ein
 * @ant-design/icons-Import waere Falle 7 — und der Fehler entstuende BEIM
 * Import, nicht beim Rendern. Diese Grenze traegt gar kein Zeichen: ein
 * Warndreieck ist genau die Stelle, an der man reflexhaft importiert.
 *
 * KEIN antd (Festlegung J7): die Grenze faengt BEIDE Aeste — den bewusst
 * antd-freien Helfer-Weg (Entscheidung 28) und die antd-Verwaltung. Vorbild ist
 * src/app/not-found.tsx, das aus demselben Grund eigenes Markup und eine eigene
 * Modul-CSS-Datei fuehrt.
 *
 * KEIN TEXT AUS `error`: der Produktions-Deserialisierer im Browser-Buendel hat
 * fuer eine Fehlerzeile genau einen Zweig und baut einen Error mit dem festen
 * ENGLISCHEN Text ueber eine „server-side exception" (Falle 66). Was hier stuende,
 * waere in Produktion nicht der geworfene Satz.
 *
 * ⚠️ PRUEFPUNKT, KEINE BEHAUPTUNG (§11.2): dass eine Modul-error.tsx INNERHALB
 * von m/lagerbuch/layout.tsx rendert, ist im Repo an keinem Bestandsmodul
 * ablesbar — es gibt keine einzige. Der Nachweis ist ein echter Abruf gegen eine
 * absichtlich werfende Route (T175, Schritt 5). Faellt die Messung anders aus,
 * ist der Text trotzdem richtig, nur die Rahmung eine andere; die Entscheidung
 * kippt daran nicht. Da m/lagerbuch/layout.tsx ohnehin nur metadata.manifest
 * traegt (§7.1.1), ist der Unterschied klein.
 */
export default function LagerbuchFehlergrenze({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={s.seite}>
      <div className={s.karte}>
        <span className={s.kante} aria-hidden="true" />
        <h1 className={s.titel}>{FEHLER_TITEL}</h1>
        <p className={s.text}>
          Bitte versuche es noch einmal. Bleibt es dabei, melde dich bei der
          Verwaltung.
        </p>
        <div className={s.aktionen}>
          <button
            type="button"
            className={s.knopf}
            data-testid="lb-fehler-erneut"
            onClick={() => reset()}
          >
            {FEHLER_ERNEUT}
          </button>
          {/*
            `/` und nicht der Modul-Host: unter dem Host-Rewrite fuehrt der
            relative Pfad an den Anfang GENAU DES Moduls, auf dem man steht —
            und der ist das Gate (Entscheidung 15, §3.6.6). Ein absoluter Link
            koennte das nicht zugleich.
          */}
          <a className={s.zurueck} href="/" data-testid="lb-fehler-zurueck">
            {FEHLER_ZURUECK}
          </a>
        </div>
      </div>
    </main>
  );
}
```

⚠️ **Der `error`-Parameter wird bewusst nicht destrukturiert benutzt.** Next übergibt ihn, die Grenze
liest ihn nicht — genau das ist die Aussage. Meldet `pnpm lint` eine ungenutzte Prop, wird sie im
Typ belassen und im Rumpf weggelassen (wie oben), **nicht** ausgegeben.

- [ ] **Schritt 5: Grün sehen**

```bash
pnpm vitest run src/app/m/lagerbuch/error.test.tsx
```

- [ ] **Schritt 6: Commit**

```bash
rtk git add src/app/m/lagerbuch/error.tsx \
            src/app/m/lagerbuch/error.test.tsx \
            src/app/m/lagerbuch/_ui/fehler.module.css
rtk git commit -m "feat(lagerbuch): Modul-Fehlergrenze — ein Satz ohne Technik, ein Weg zurueck

Spec §11.2. lagerbuch hat null Grenzdateien, die Suite genau eine (not-found);
die Portierung erbt aus beiden Richtungen nichts. Dazu 22 Action-Aufrufe ohne
catch (Falle 62), deren Ablehnung React an die naechste Grenze weiterreicht.

\"use client\" in Zeile 1, ohne Ausnahme: Next verlangt das, und reset() ist eine
Client-Prop. Damit ist es die einzige \"use client\"-Datei ausserhalb von _ui/.
Die Texte kommen deshalb aus _lib/zustandTexte.ts — sonst waeren sie fuer jede
Server Component, die sie mitliest, Falle 6.

Kein antd und kein Icon: die Grenze faengt BEIDE Aeste des Moduls, den bewusst
antd-freien Helfer-Weg und die antd-Verwaltung. Vorbild ist src/app/not-found.tsx
(eigenes Markup, eigene Modul-CSS mit eigenen Variablen). Ein Warndreieck waere
genau die Stelle, an der man reflexhaft ein Icon importiert — und der Fehler
entstuende beim Import, nicht beim Rendern.

Der geworfene Text erscheint nirgends: in Produktion waere er ohnehin der
englische Satz des Deserialisierers (Falle 66).

Ausdruecklich NICHT angelegt: not-found.tsx (Entscheidung 36 b verworfen —
die Suite-404 ist die richtige und gehaertete Form), loading.tsx (alle
Einstiege sind force-dynamic) und global-error.tsx (Wurzelfrage). Der Test
prueft die Abwesenheit."
```

### Task 164: `g/[code]/page.tsx` — der gescannte Barcode bekommt eine Antwort

**Files:**
- Create: `src/app/m/lagerbuch/g/[code]/page.tsx`
- Test: `src/app/m/lagerbuch/g/[code]/page.test.tsx`

**Interfaces:**
- Consumes:
  - `_lib/host.ts` (Teil 1, T10) — `requireLagerbuchHost(headers: Headers): void`, als **erste**
    Anweisung.
  - `_lib/zugang.ts` (Teil 2, T25) — `viewerOderNull(): Promise<Viewer | null>` und
    `istLagerbuchAdmin(viewer): boolean`. ⚠️ **Nicht `requireLagerbuchAdmin`** — siehe unten.
  - `_lib/helferZugang.ts` (Teil 2, T25) — `helferZugangOderNull(db): Promise<HelferZugang | null>`.
  - `_lib/barcode.ts` (**Teil 4**, T62) — `normalisiereBarcode(roh: string): string`.
    ⚠️ **Die einzige Reihenfolgebindung dieses Plans nach außen** (J3).
  - `_lib/lesepfade/geraete.ts` (Teil 3) — `geraetByBarcode(db, barcode): { id: string } | null`.
  - `_lib/lesepfade/bz.ts` (Teil 3) — `bzGeraetByBarcode(db, barcode): { id: string } | null`.
  - `_ui/VerwaltungsRahmen.tsx` (Teil 5, T111) — **als ZWEITER Importeur** (§2.1, §2.9), mit
    `nav={LAGERBUCH_NAV}`; `_lib/nav.ts` (Teil 5, T102) — `LAGERBUCH_NAV`, die **vollständige**
    15er-Liste.
  - `_lib/zustandTexte.ts` (T158) — die vier Texte des Zustands.
  - `_db/client.ts` (Teil 1, T12) — `getDb()`.
- Produces: die äußere Route `/g/<code>` (innerer Pfad `/m/lagerbuch/g/<code>`). Sie ist die **28.**
  `page.tsx` des Moduls und hat außer `default` und `dynamic` keinen Export.

**Warum diese Datei hier liegt und nicht in Teil 4** — Festlegung J3, und die Begründung stammt aus
Teil 4 selbst (E1): `/g` rendert **überhaupt nur einen** Zustand, alle Trefferfälle leiten weiter,
und dieser eine Zustand trägt `_ui/VerwaltungsRahmen.tsx` **mit Shell und Modulnavigation** — eine
Datei aus Teil 5.

**Warum ein Prädikat und kein Riegel — die Zeile, an der ein `requireLagerbuchAdmin()` sichtbar
würde** (§3.2.1, §11.5 Zustand 18). Diese Datei ist eine **Rollen-Weiche**, und dort ist „keine
Sitzung" ein **dritter gültiger Fall**, kein Fehlerfall. Ein Riegel hier schickte **jeden anonymen
Scan nach `/login`** statt aufs Gate — genau der Ausfall, gegen den `requiresAuth: false` gebaut ist.
`_lib/bauform.test.ts` (Teil 2, verschärft in T173) hält das fest.

**Warum HTTP 200 statt 404** (§11.3, Entscheidung 8-C2). `g/[code]/page.tsx:33` ruft heute
`notFound()`, und das ist **im Bestand richtig**: die Weiche davor schickt jede Nicht-Admin-Anfrage
weg, wer `:33` erreicht, ist angemeldet und hat gerade einen Barcode gescannt, den weder `geraete`
noch `bz_geraete` kennt. Nach einem unbesehenen Port sähe diese Person aber:

- die Suite-404 **ohne Shell und ohne Modulnavigation** (`not-found.tsx:4-14`),
- einen Absatz, der von „dieser Suite" spricht und an „die Administration" verweist (`:41-46`) — auf
  einem Host, der bis eben nur die Wortmarke des Moduls zeigte,
- und **keinen Hinweis darauf, welchen Code sie eigentlich gescannt hat**.

→ HTTP 200, im `VerwaltungsRahmen`, mit dem **gescannten Code im Klartext** zur Kontrolle gegen das
Typenschild, einem Knopf „Noch einmal scannen" und einem Link auf die Geräteliste. `notFound()`
verschwindet aus dieser Datei.

⚠️ **Der Rahmen ist nicht Zierrat, sondern der ERSTE der drei Mängel** (§11.3): „ohne Shell und ohne
Modulnavigation" ist **ein Teil dessen, was hier repariert wird** — `not-found.tsx:9-10` schreibt
genau das über sich selbst aus. Ein eigener, shell-loser Rahmen baute den Mangel nach.

⚠️ **Die beiden benannten Wege bleiben IM Zustand stehen** und werden nicht durch die Navigation
ersetzt — §11.7 stützt sich darauf, dass jeder gestaltete Zustand einen benannten Weg zurück trägt.

⚠️ **Falle 29:** `page.tsx:29,31` reicht den Routenparameter heute **roh** durch, während beide
Schreibwege trimmen (`actions/geraete.ts:17`, `actions/bz.ts:15`) und der andere Leseweg ebenfalls
(`db/geraete.ts:70`). Das ist die **einzige unnormalisierte Lesestelle des Bestands**. Auch hier
gilt: Trimmen kann nur Treffer **hinzufügen**.

- [ ] **Schritt 0: Prüfen, ob Teil 4 `_lib/barcode.ts` geliefert hat**

```bash
ls src/app/m/lagerbuch/_lib/barcode.ts && \
  grep -n "export function normalisiereBarcode" src/app/m/lagerbuch/_lib/barcode.ts
```

**Fehlt die Datei, hält dieser Task an und wird gemeldet** (§2.1). Sie gehört Teil 4 (T62, §7.6.2);
sie hier nachzubauen erzeugte eine zweite Normalisierung mit eigenem Verhalten — und die zwei
Fassungen liefen genau dort auseinander, wo ein gescannter Aufkleber schon einmal nicht traf.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/g/[code]/page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";

const redirect = vi.hoisted(() => vi.fn((p: string) => { throw new Error(`REDIRECT:${p}`); }));
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NOTFOUND"); }));
vi.mock("next/navigation", () => ({ redirect, notFound }));

const viewer = vi.hoisted(() => ({ wert: null as { sub: string; groups: string[] } | null }));
const helfer = vi.hoisted(() => ({ wert: null as { tokenId: string } | null }));
vi.mock("@/app/m/lagerbuch/_lib/zugang", () => ({
  viewerOderNull: async () => viewer.wert,
  istLagerbuchAdmin: (v: unknown) => Boolean(v),
}));
vi.mock("@/app/m/lagerbuch/_lib/helferZugang", () => ({
  helferZugangOderNull: async () => helfer.wert,
}));

const treffer = vi.hoisted(() => ({ geraet: null as { id: string } | null,
                                    bz: null as { id: string } | null }));
vi.mock("@/app/m/lagerbuch/_lib/lesepfade/geraete", () => ({
  geraetByBarcode: () => treffer.geraet,
}));
vi.mock("@/app/m/lagerbuch/_lib/lesepfade/bz", () => ({
  bzGeraetByBarcode: () => treffer.bz,
}));
vi.mock("@/app/m/lagerbuch/_db/client", () => ({ getDb: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/app/m/lagerbuch/_lib/host", () => ({ requireLagerbuchHost: () => {} }));

import GeraetDeepLink from "./page";

const params = (code: string) => Promise.resolve({ code });

beforeEach(() => {
  viewer.wert = null; helfer.wert = null;
  treffer.geraet = null; treffer.bz = null;
  redirect.mockClear(); notFound.mockClear();
});
afterEach(() => unmount());

describe("g/[code] — die Rollen-Weiche (§3.2.1, §11.3)", () => {
  /**
   * §11.5, ZUSTAND 18: ohne jede Sitzung fuehrt der Weg AUFS GATE mit returnTo,
   * NIE nach /login. Das ist die Zeile, an der ein requireLagerbuchAdmin() in
   * dieser Datei sichtbar wuerde — und der Grund, warum hier ein Praedikat steht
   * und kein Riegel. Ein Riegel schickte jeden anonymen Scan nach /login, also
   * genau den Ausfall, gegen den requiresAuth:false gebaut ist.
   */
  it("schickt ohne Sitzung aufs Gate mit returnTo", async () => {
    await expect(GeraetDeepLink({ params: params("4012345678901") }))
      .rejects.toThrow("REDIRECT:/?returnTo=%2Fg%2F4012345678901");
  });

  /** Mit Helfer-Sitzung, ohne Verwaltungsrecht: der Helfer-Bereich. Eine
   *  Helfer-Geraeteansicht gibt es in V1 nicht (1:1 aus page.tsx:24). */
  it("schickt mit Helfer-Sitzung in den Helfer-Bereich", async () => {
    helfer.wert = { tokenId: "t1" };
    await expect(GeraetDeepLink({ params: params("4012345678901") }))
      .rejects.toThrow("REDIRECT:/helfer");
  });

  it("leitet den Admin bei einem Geraetetreffer weiter", async () => {
    viewer.wert = { sub: "u1", groups: ["lagerbuch_nutzer"] };
    treffer.geraet = { id: "g1" };
    await expect(GeraetDeepLink({ params: params("4012345678901") }))
      .rejects.toThrow("REDIRECT:/verwaltung/geraete/g1");
  });

  /** Erst Geraete, dann BZ: der Barcode-Namensraum ist ueber beide Tabellen
   *  global eindeutig (geraetSpeichern prueft das), daher genuegt die
   *  Reihenfolge. 1:1 aus page.tsx:29-32. */
  it("leitet den Admin bei einem BZ-Treffer weiter", async () => {
    viewer.wert = { sub: "u1", groups: ["lagerbuch_nutzer"] };
    treffer.bz = { id: "b1" };
    await expect(GeraetDeepLink({ params: params("4012345678901") }))
      .rejects.toThrow("REDIRECT:/verwaltung/bz/b1");
  });

  /** ÄUSSERE Pfadform in jedem Redirect-Ziel (§2.1 g): unter dem Host-Rewrite
   *  fuehrt /verwaltung/geraete/g1 richtig, /m/lagerbuch/... waere doppelt. */
  it("benutzt in den Zielen die aeussere Pfadform", async () => {
    viewer.wert = { sub: "u1", groups: ["lagerbuch_nutzer"] };
    treffer.geraet = { id: "g1" };
    await expect(GeraetDeepLink({ params: params("x") })).rejects.toThrow();
    expect(redirect).toHaveBeenCalledWith("/verwaltung/geraete/g1");
    expect(redirect).not.toHaveBeenCalledWith(expect.stringContaining("/m/lagerbuch"));
  });
});

describe("g/[code] — der eine gerenderte Zustand (§11.3, 8-C2)", () => {
  beforeEach(() => { viewer.wert = { sub: "u1", groups: ["lagerbuch_nutzer"] }; });

  /**
   * ALTE FASSUNG: page.tsx:33 ruft notFound(). NEUE FASSUNG: HTTP 200 mit einem
   * gestalteten Zustand. §12.3, Regel 3 — beide stehen hier namentlich
   * nebeneinander.
   */
  it("ruft NICHT notFound", async () => {
    await mount(await GeraetDeepLink({ params: params("4012345678901") }));
    expect(notFound).not.toHaveBeenCalled();
  });

  it("nennt den gescannten Code im Klartext", async () => {
    await mount(await GeraetDeepLink({ params: params("4012345678901") }));
    // Zur Kontrolle gegen das Typenschild — die Auskunft, die die Suite-404
    // ausgerechnet nicht gibt.
    expect(query("[data-testid='lb-barcode-code']").textContent).toBe("4012345678901");
  });

  it("traegt Ueberschrift und Erklaerung", async () => {
    await mount(await GeraetDeepLink({ params: params("4012345678901") }));
    expect(document.body.textContent).toContain("Kein Gerät zu diesem Barcode");
    expect(document.body.textContent)
      .toContain("weder ein Gerät noch eine Sauerstoff-Flasche");
  });

  /** §11.7: BEIDE benannten Wege stehen IM Zustand und werden nicht durch die
   *  Navigation ersetzt. */
  it("bietet beide Wege zurueck", async () => {
    await mount(await GeraetDeepLink({ params: params("4012345678901") }));
    expect(query("[data-testid='lb-barcode-nochmal']").getAttribute("href"))
      .toBe("/verwaltung/geraete/scan");
    expect(query("[data-testid='lb-barcode-liste']").getAttribute("href"))
      .toBe("/verwaltung/geraete");
  });

  /**
   * FALLE 29: die einzige unnormalisierte Lesestelle des Bestands
   * (page.tsx:29,31) — waehrend beide Schreibwege trimmen und der andere
   * Leseweg ebenfalls. Trimmen kann nur Treffer HINZUFUEGEN.
   */
  it("normalisiert den Routenparameter vor der Suche", async () => {
    const quelle = readFileSync(join(__dirname, "page.tsx"), "utf8");
    expect(quelle).toContain("normalisiereBarcode");
    // ...und nicht nur importiert, sondern VOR beiden Lesepfaden angewandt:
    const i = quelle.indexOf("normalisiereBarcode(");
    expect(i).toBeGreaterThan(-1);
    expect(quelle.indexOf("geraetByBarcode")).toBeGreaterThan(i);
    expect(quelle.indexOf("bzGeraetByBarcode")).toBeGreaterThan(i);
  });
});

describe("g/[code] — Bauform (§3.8.2, §11.6)", () => {
  const quelle = readFileSync(join(__dirname, "page.tsx"), "utf8");

  /** Ein Riegel in dieser Datei schickte jeden anonymen Scan nach /login. */
  it("benutzt kein requireLagerbuchAdmin und kein requireHelferSitzung", () => {
    expect(quelle).not.toContain("requireLagerbuchAdmin");
    expect(quelle).not.toContain("requireHelferSitzung");
  });

  it("ruft requireLagerbuchHost als erste Anweisung", () => {
    const rumpf = quelle.slice(quelle.indexOf("export default"));
    const erste = rumpf.split("\n").find((z) => /\w/.test(z) && !z.includes("export default"));
    expect(erste).toContain("requireLagerbuchHost");
  });

  /** Falle 7: die Datei ist eine Server Component. Ein Icon-Import wirft SCHON
   *  BEIM IMPORT, und "use client" behebt das nicht, es macht es still. */
  it("importiert kein Icon-Paket und traegt kein use client", () => {
    expect(quelle).not.toContain("@ant-design/icons");
    expect(quelle).not.toContain("lucide-react");
    expect(quelle).not.toMatch(/["']use client["']/);
  });

  /**
   * FALLE 1: `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag` und
   * `Button` sind in einer Server Component sicher (CLAUDE.md:11-13,
   * not-found.tsx:1,57 benutzt Button so). `Typography.Title` und Geschwister
   * ergeben HTTP 500 — der Compound-Zugriff ist es, nicht der Import.
   */
  it("greift auf kein antd-Compound zu", () => {
    for (const verboten of [
      "Typography.", "Form.Item", "Descriptions.Item", "List.Item",
      "Input.TextArea", "Card.Meta", "Collapse.Panel", "Breadcrumb.Item",
      "Space.Compact", "Table.Summary", "Tag.CheckableTag", "Badge.Ribbon",
      "Layout.Header", "Grid.useBreakpoint",
    ]) {
      expect(quelle, verboten).not.toContain(verboten);
    }
  });

  /**
   * §2.9 und §2.1: VerwaltungsRahmen hat ZWEI Importeure — (arbeit)/layout.tsx
   * und diese Datei —, und `nav` ist Pflicht-Prop. §11.3 ist dazu
   * unmissverstaendlich: „mit Shell UND Modulnavigation", weil „ohne Shell und
   * ohne Modulnavigation" genau der Mangel ist, den 8-C2 behebt.
   *
   * ⚠️ Teil 5s Abschlusstabelle sagt „ohne nav"; sie irrt. Aufgeloest in
   * Plan-Teil 6, T164.
   */
  it("mountet den VerwaltungsRahmen MIT der vollstaendigen Navigation", () => {
    expect(quelle).toContain("VerwaltungsRahmen");
    expect(quelle).toContain("nav={LAGERBUCH_NAV}");
  });
});
```

- [ ] **Schritt 2: Rot sehen**

```bash
pnpm vitest run "src/app/m/lagerbuch/g/[code]/page.test.tsx"
```

Erwartet: `Failed to load url ./page`.

- [ ] **Schritt 3: Die Seite schreiben**

`src/app/m/lagerbuch/g/[code]/page.tsx`:

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "antd";
import { requireLagerbuchHost } from "@/app/m/lagerbuch/_lib/host";
import { viewerOderNull, istLagerbuchAdmin } from "@/app/m/lagerbuch/_lib/zugang";
import { helferZugangOderNull } from "@/app/m/lagerbuch/_lib/helferZugang";
import { normalisiereBarcode } from "@/app/m/lagerbuch/_lib/barcode";
import { geraetByBarcode } from "@/app/m/lagerbuch/_lib/lesepfade/geraete";
import { bzGeraetByBarcode } from "@/app/m/lagerbuch/_lib/lesepfade/bz";
import { getDb } from "@/app/m/lagerbuch/_db/client";
import { VerwaltungsRahmen } from "@/app/m/lagerbuch/_ui/VerwaltungsRahmen";
import { LAGERBUCH_NAV } from "@/app/m/lagerbuch/_lib/nav";
import {
  BARCODE_TITEL, BARCODE_TEXT, BARCODE_NOCHMAL, BARCODE_LISTE,
} from "@/app/m/lagerbuch/_lib/zustandTexte";

export const dynamic = "force-dynamic";

/**
 * DEEP-LINK VOM GESCANNTEN GERAETE-BARCODE (Spec §8.1 Form 4, §11.3, 8-C2).
 *
 * DIESE DATEI IST EINE ROLLEN-WEICHE, KEIN GERIEGELTER BEREICH (§3.2.1). Hier
 * ist „keine Sitzung" ein DRITTER gueltiger Fall, kein Fehlerfall — deshalb
 * steht hier das nicht-werfende Paar viewerOderNull + istLagerbuchAdmin und
 * NICHT requireLagerbuchAdmin. Ein Riegel schickte jeden anonymen Scan nach
 * /login statt aufs Gate: genau der Ausfall, gegen den requiresAuth:false gebaut
 * ist (§11.5, Zustand 18). _lib/bauform.test.ts haelt das fest.
 *
 * requireLagerbuchHost ist die ERSTE Anweisung (§2.6): ohne sie beantwortet
 * JEDER Host, der auf den Suite-Container terminiert, /m/lagerbuch/g/<code> —
 * decideRoute gatet interne Pfade nach dem SEGMENT, nicht nach dem Host, und fuer
 * ein Modul mit requiresAuth:false steigt canAccess sofort mit true aus
 * (Falle 61).
 *
 * DER BARCODE-NAMENSRAUM IST GLOBAL EINDEUTIG ueber generische Geraete UND
 * BZ-Geraete (geraetSpeichern prueft das beim Anlegen), daher genuegt „erst
 * Geraete, dann BZ" — 1:1 aus page.tsx:29-32.
 *
 * FALLE 29: der Routenparameter wird normalisiert, BEVOR gesucht wird. Der
 * Bestand reicht ihn hier roh durch (page.tsx:29,31) — die einzige
 * unnormalisierte Lesestelle —, waehrend beide Schreibwege trimmen und der
 * andere Leseweg ebenfalls. Trimmen kann nur Treffer HINZUFUEGEN, nie einen
 * bestehenden verlieren.
 *
 * DER EINE GERENDERTE ZUSTAND traegt _ui/VerwaltungsRahmen.tsx, also Shell und
 * Modulnavigation (§2.9). Das ist kein Zierrat: „ohne Shell und ohne
 * Modulnavigation" ist der ERSTE der drei Maengel, die 8-C2 behebt —
 * not-found.tsx:9-10 schreibt genau das ueber sich selbst aus. Ein eigener,
 * shell-loser Rahmen baute den Mangel nach.
 *
 * ANTD IN EINER SERVER COMPONENT: `Button` ist gedeckt (die Suite-404 benutzt
 * ihn so, not-found.tsx:1,57), ebenso Card/Result/Table/Tag. Verboten ist der
 * COMPOUND-Zugriff (Typography.Title & Geschwister, Falle 1) und JEDER
 * @ant-design/icons-Import — der wirft schon beim Import, und "use client"
 * behebt das nicht, es macht es still (Falle 7).
 */
export default async function GeraetDeepLink({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  requireLagerbuchHost(await headers());
  const { code } = await params;

  const viewer = await viewerOderNull();
  if (!istLagerbuchAdmin(viewer)) {
    // Kein Verwaltungsrecht: eine Helfer-Geraeteansicht gibt es in V1 nicht.
    const helfer = await helferZugangOderNull(getDb());
    if (helfer) redirect("/helfer");
    // AUFS GATE, nie nach /login — mit Rueckkehrziel in AEUSSERER Pfadform.
    redirect(`/?returnTo=${encodeURIComponent(`/g/${code}`)}`);
  }

  const gesucht = normalisiereBarcode(code);
  const db = getDb();

  const ger = geraetByBarcode(db, gesucht);
  if (ger) redirect(`/verwaltung/geraete/${ger.id}`);
  const bz = bzGeraetByBarcode(db, gesucht);
  if (bz) redirect(`/verwaltung/bz/${bz.id}`);

  /**
   * §11.5, ZUSTAND 15 — HTTP 200 statt 404 (Entscheidung 8-C2). notFound() ist
   * hier verschwunden: die Suite-404 spricht von „dieser Suite" und verweist an
   * „die Administration" — auf einem Host, der bis eben nur die Wortmarke des
   * Moduls zeigte —, und sie nennt den gescannten Code nicht.
   *
   * §11.7: BEIDE Wege stehen IM Zustand und werden nicht durch die Navigation
   * ersetzt.
   */
  return (
    <VerwaltungsRahmen nav={LAGERBUCH_NAV}>
      <h1>{BARCODE_TITEL}</h1>
      <p>{BARCODE_TEXT}</p>
      <p>
        Gescannt:{" "}
        <code data-testid="lb-barcode-code">{code}</code>
        {" — bitte mit dem Typenschild vergleichen."}
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* Kein `size`: controlHeight ist 56 und schon das richtige Mass (Falle 4). */}
        <Button
          type="primary"
          href="/verwaltung/geraete/scan"
          data-testid="lb-barcode-nochmal"
        >
          {BARCODE_NOCHMAL}
        </Button>
        <Button href="/verwaltung/geraete" data-testid="lb-barcode-liste">
          {BARCODE_LISTE}
        </Button>
      </div>
    </VerwaltungsRahmen>
  );
}
```

⚠️ **`VerwaltungsRahmen` wird hier MIT `nav={LAGERBUCH_NAV}` gemountet — und hier widersprechen sich
zwei Quellen.** Teil 5s Abschlusstabelle schreibt „`g/[code]/page.tsx` ist der ZWEITE Importeur des
Rahmens und mountet ihn **ohne** `nav`". Die Spec sagt zweimal das Gegenteil, und sie ist verbindlich:

- **§11.3:** „**Und zwar im `_ui/VerwaltungsRahmen.tsx`, also mit Shell und Modulnavigation.** Das ist
  kein Zierrat, sondern der **erste** der drei oben genannten Mängel: ‚ohne Shell und ohne
  Modulnavigation' ist ein Teil dessen, was hier repariert wird."
- **§2.1:** „`nav` ist **Pflicht-Prop**, die Aufrufer lesen `_lib/nav.ts`."

→ **`nav={LAGERBUCH_NAV}`, mit derselben Liste wie das `(arbeit)`-Layout**, nicht mit einer
gekürzten. Eine gekürzte Navigation wäre eine zweite Navigationsquelle und liefe von der aus
`_lib/nav.ts` weg, sobald dort ein Ziel dazukommt.

⚠️ **Der Nebeneffekt ist gewollt und benannt:** `aktiverEintrag` markiert auf `/g/<code>` **keinen**
Eintrag, weil der Pfad in `LAGERBUCH_NAV` nicht vorkommt (§6.3.3 hat den Abschnittstreffer
ausdrücklich verworfen). Das ist derselbe Verlust wie auf den neun Detailseiten, und er wird dort
durch die **Brotkrume** aufgefangen — hier durch die zwei benannten Wege **im Zustand**.

- [ ] **Schritt 4: Grün sehen**

```bash
pnpm vitest run "src/app/m/lagerbuch/g/[code]/page.test.tsx"
```

- [ ] **Schritt 5: Beide Abrufe fahren**

```bash
SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me pnpm dev &
sleep 15
# unbekannter Barcode, angemeldet als Lagerbuch-Admin (Dev-Login)
curl -s -o /dev/null -w "%{http_code}\n" \
  http://lagerbuch.localtest.me:3000/g/0000000000000
# bekannter Barcode
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
  http://lagerbuch.localtest.me:3000/g/<bekannt>
```

Erwartet: **200** für den unbekannten (nicht 404!) und **307/303** mit einem Ziel unter
`/verwaltung/geraete/` oder `/verwaltung/bz/` für den bekannten. Beide Zeilen gehören in die
Abrufliste (§7.1).

- [ ] **Schritt 6: Commit**

```bash
rtk git add "src/app/m/lagerbuch/g/[code]/page.tsx" \
            "src/app/m/lagerbuch/g/[code]/page.test.tsx"
rtk git commit -m "feat(lagerbuch): /g/<code> antwortet 200 mit gestaltetem Zustand statt 404

Spec §11.3, Entscheidung 8-C2. Festlegung J3 dieses Plans: Teil 4 hat die Datei
mit Begruendung hierher gegeben (E1), weil ihr einziger gerenderter Zustand
_ui/VerwaltungsRahmen.tsx traegt — und der entsteht in Teil 5.

Nach einem unbesehenen Port saehe die scannende Person die Suite-404: ohne Shell,
ohne Modulnavigation, mit einem Absatz ueber „diese Suite" und ohne jeden Hinweis
darauf, WELCHEN Code sie gescannt hat. Jetzt: Ueberschrift, der Code im
Klartext zum Abgleich mit dem Typenschild, ein Knopf zum Scanner und einer zur
Geraeteliste — beide IM Zustand, nicht in der Navigation (§11.7).

Der Rahmen ist kein Zierrat: „ohne Shell und ohne Modulnavigation" ist der erste
der drei Maengel, die 8-C2 behebt.

Rollen-Weiche, kein Riegel: hier steht viewerOderNull + istLagerbuchAdmin, nicht
requireLagerbuchAdmin. Ein Riegel schickte jeden anonymen Scan nach /login statt
aufs Gate — genau der Ausfall, gegen den requiresAuth:false gebaut ist.

Falle 29: der Routenparameter laeuft jetzt durch normalisiereBarcode. Er war die
einzige unnormalisierte Lesestelle des Bestands, waehrend beide Schreibwege und
der andere Leseweg trimmen."
```

### Gate nach Welle 3

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build && pnpm exec playwright test
```

⚠️ **`pnpm exec playwright test` ist ab hier fällig.** Welle 3 legt zwei Routen an, und der
Etikettenbogen ist die erste Seite des Moduls mit einem `@media print`-Block.

---

## Welle 4 — Die drei Knöpfe, die Teil 5 `disabled` abgestellt hat (2 Tasks, parallel)

**Das ist der einzige benannte Vorgriff des ganzen Vorhabens, und Teil 5 hat ihn ausgeschrieben:**
„Drei Knöpfe sind bis dahin `disabled` mit erklärendem `Tooltip` — der Excel-Export auf
`/verwaltung/artikel` (T129) und CSV + Zwischenablage auf `/verwaltung/bestellung` (T145). … Teil 6
löst ihn ein, indem es `disabled` entfernt und die Funktion anbindet."

⚠️ **Beide Tasks arbeiten in Dateien, die Teil 5 gehören.** Die Eigentümertabelle (§5) führt sie mit
**ERGÄNZT**; wer das nicht liest, hält den Vorgriff für einen Fehler und baut eine zweite Insel.

### Task 165: Der Excel-Knopf auf `/verwaltung/artikel` wird angebunden

**Files:**
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/ArtikelTable.tsx` (**ERGÄNZT**, Teil 5 T129)
- Test: `src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/ArtikelTable.test.tsx` (**ERGÄNZT**)

**Interfaces:**
- Consumes: `_lib/bestandExport.ts` (T156) — `bestandExportZeilen`, `bestandExportDateiname`,
  `type BestandExportZeile`; `_lib/bestandExportSpalten.ts` (T157) — `EXCEL_SPALTEN`,
  `EXCEL_BLATTNAME`, `EXCEL_FEHLERTEXT`; die vorhandene Insel aus Teil 5 T129 mit ihrer abgeleiteten
  Liste `gefiltert`.
- Produces: nichts Neues nach außen — der Knopf hört auf, `disabled` zu sein.

**Entscheidung 9-E: die Client-Insel bleibt, und die Bibliothek wird beim Klick nachgeladen.**
`await import("write-excel-file/browser")` hält sie aus dem Seiten-Bundle. Beim RSC-Neubau ist das
keine Zeile in `package.json`, sondern die Frage, **welche Insel den Knopf trägt**: er sitzt in
**derselben** Insel wie Filterleiste und Sortierung, weil er deren Zustand braucht (`gefiltert`).
Ein rein serverseitiger Export wäre ein **anderes Produkt** — er könnte den Dateinamen aus Serverzeit
bilden und kennte den Filterzustand nicht.

**Entscheidung 9-H: die Artikelliste bleibt in V1 clientseitig gefiltert.** Der Knopftitel sagt zu:
„mit der aktuell angezeigten Liste". Sobald die Liste serverseitig paginiert wird, ändert sich
**stillschweigend**, was „Excel-Liste" bedeutet — aus „alles, was ich gerade sehe" wird „die erste
Seite". Pagination der Artikeltabelle ist damit **kein Oberflächendetail, sondern eine Änderung an
einem Ausgabeformat**.

- [ ] **Schritt 1: Prüfen, dass Teil 5 den Knopf wie angekündigt abgestellt hat**

```bash
grep -n "disabled" "src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/ArtikelTable.tsx"
grep -n "write-excel-file" package.json
```

Erwartet: eine `disabled`-Zeile am Export-Knopf und `write-excel-file` in den `dependencies`
(Teil 1, T1). **Fehlt das Paket, hält der Task an** — unter pnpm ist ein nur transitiv vorhandenes
Paket nicht importierbar (Falle 58), und der Fehler entstünde erst zur Bauzeit.

- [ ] **Schritt 2: Den fehlschlagenden Test schreiben**

Anhängen an `ArtikelTable.test.tsx`:

```tsx
import { bestandExportDateiname } from "@/app/m/lagerbuch/_lib/bestandExport";
import { EXCEL_FEHLERTEXT } from "@/app/m/lagerbuch/_lib/bestandExportSpalten";

/**
 * §9.4, Entscheidungen 9-E und 9-H. Teil 5 (T129) hat den Knopf mit `disabled`
 * und erklaerendem Tooltip angelegt; dieser Block loest den Vorgriff ein.
 */
describe("Excel-Export (§9.4)", () => {
  it("ist nicht mehr abgestellt", async () => {
    await mount(<ArtikelTable rows={ZEILEN} />);
    const knopf = query("[data-testid='lb-excel']");
    expect(knopf.hasAttribute("disabled")).toBe(false);
  });

  /** 1:1 aus ArtikelTable.tsx:163 — bei leerer Liste bleibt er abgestellt. */
  it("bleibt bei leerer Liste abgestellt", async () => {
    await mount(<ArtikelTable rows={[]} />);
    expect(query("[data-testid='lb-excel']").hasAttribute("disabled")).toBe(true);
  });

  /**
   * DIE BIBLIOTHEK WIRD BEIM KLICK NACHGELADEN (9-E). Der Test mockt den
   * dynamischen Import — ein echter Lauf braeuchte einen Browser, und die
   * Aussage „es kommt wirklich eine .xlsx an" gehoert deshalb in den E2E (T168).
   * Hier zaehlt: wird die Bibliothek mit den RICHTIGEN Argumenten gerufen.
   */
  it("uebergibt Blattname, fixierte Kopfzeile und den datierten Dateinamen", async () => {
    const toFile = vi.fn().mockResolvedValue(undefined);
    const schreiben = vi.fn().mockReturnValue({ toFile });
    vi.doMock("write-excel-file/browser", () => ({ default: schreiben }));

    await mount(<ArtikelTable rows={ZEILEN} />);
    await clickElement(query("[data-testid='lb-excel']"));

    const [zeilen, optionen] = schreiben.mock.calls[0];
    expect(zeilen).toHaveLength(ZEILEN.length);
    expect(optionen.sheet).toBe("Bestand Handlager");
    expect(optionen.stickyRowsCount).toBe(1);
    expect(optionen.columns).toHaveLength(9);
    expect(optionen.columns[0].header).toMatchObject({ value: "Artikel", fontWeight: "bold" });
    expect(toFile).toHaveBeenCalledWith(bestandExportDateiname(expect.any(Date)));
  });

  /**
   * §12.1, PUNKT 2 — DIE KOPPLUNG AN DER OBERFLAECHE. Die reine Fassung steht in
   * _lib/bestandExport.test.ts (T156); hier wird geprueft, dass die INSEL
   * dieselbe abgeleitete Liste durchreicht, die auch in dataSource geht. Wandert
   * das Filtern in antds Table-eigenen Zustand, exportiert der Knopf still
   * wieder alles (§6.15, Auflage 9).
   */
  it("exportiert nur die gefilterten Zeilen", async () => {
    const toFile = vi.fn().mockResolvedValue(undefined);
    const schreiben = vi.fn().mockReturnValue({ toFile });
    vi.doMock("write-excel-file/browser", () => ({ default: schreiben }));

    await mount(<ArtikelTable rows={ZEILEN} />);
    await fill("[type='search']", "Mullbinde");
    await clickElement(query("[data-testid='lb-excel']"));

    expect(schreiben.mock.calls[0][0]).toHaveLength(1);
  });

  /**
   * §11.2 (d): der Fehler kommt als RUECKGABEWERT an die Stelle, nie ueber
   * e.message — der waere in Produktion der englische Satz (Falle 66).
   */
  it("zeigt bei einem Fehler den deutschen Satz mit Halbgeviertstrich", async () => {
    vi.doMock("write-excel-file/browser", () => { throw new Error("boom"); });
    await mount(<ArtikelTable rows={ZEILEN} />);
    await clickElement(query("[data-testid='lb-excel']"));
    expect(document.body.textContent).toContain(EXCEL_FEHLERTEXT);
    expect(document.body.textContent).not.toContain("boom");
  });

  /** 1:1 aus ArtikelTable.tsx:166 — die Beschriftung wechselt waehrend des Laufs. */
  it("wechselt die Beschriftung auf Erzeuge…", async () => {
    // useTransition-Zustand; die Zusage ist die Beschriftung, nicht das Timing.
    expect(readFileSync(join(__dirname, "ArtikelTable.tsx"), "utf8")).toContain("Erzeuge…");
  });
});
```

⚠️ **`data-testid="lb-excel"`, `ZEILEN`, `mount`, `query`, `fill`, `clickElement` stammen aus Teil 5,
T129.** Trägt der Knopf dort einen anderen Anker, wird **dieser Test** angepasst — nicht der Knopf.
§6.11 und H13 (Teil 5) entscheiden die Anker; dieser Plan setzt keine neuen.

- [ ] **Schritt 3: Rot sehen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/ArtikelTable.test.tsx"
```

Erwartet: `expected true to be false` — der Knopf trägt noch `disabled`.

- [ ] **Schritt 4: Den Knopf anbinden**

In `ArtikelTable.tsx` — die Insel besteht bereits, es kommt genau **eine** Funktion und **ein**
Zustandspaar dazu:

```tsx
import {
  bestandExportZeilen, bestandExportDateiname, type BestandExportZeile,
} from "@/app/m/lagerbuch/_lib/bestandExport";
import {
  EXCEL_SPALTEN, EXCEL_BLATTNAME, EXCEL_FEHLERTEXT,
} from "@/app/m/lagerbuch/_lib/bestandExportSpalten";

  const [exportLaeuft, startExport] = useTransition();
  const [exportFehler, setExportFehler] = useState<string | null>(null);

  /**
   * EXCEL-LISTE DES BESTANDS (Spec §9.4, Entscheidung 9-E).
   *
   * Exportiert GENAU das, was gerade in der Tabelle steht — `gefiltert`, also
   * dieselbe abgeleitete Liste, die auch in `dataSource` geht. Das ist keine
   * Bequemlichkeit: der Knopftitel sagt es zu, und sobald die Liste serverseitig
   * paginiert wird, aenderte sich STILL, was „Excel-Liste" bedeutet — aus
   * „alles, was ich gerade sehe" wuerde „die erste Seite" (9-H). Pagination der
   * Artikeltabelle ist damit eine Aenderung an einem Ausgabeformat, kein
   * Oberflaechendetail.
   *
   * Die Bibliothek wird ERST BEIM KLICK nachgeladen, damit sie nicht im
   * Seiten-Bundle landet. Ein rein serverseitiger Export waere ein anderes
   * Produkt: er koennte den Dateinamen aus Serverzeit bilden und kennte den
   * Filterzustand nicht.
   *
   * DER DATEINAME ENTSTEHT AUS BROWSERZEIT (`new Date()`), also aus der Zone des
   * Arbeitsplatzes. Das ist heutiges Verhalten und bleibt es; die TZ-Frage
   * beruehrt dieses Format nicht (§9.4).
   */
  const exportieren = () => {
    setExportFehler(null);
    startExport(async () => {
      try {
        const { default: writeXlsxFile } = await import("write-excel-file/browser");
        const zeilen = bestandExportZeilen(gefiltert);
        await writeXlsxFile(zeilen, {
          columns: EXCEL_SPALTEN.map((s) => ({
            header: { value: s.header, fontWeight: "bold" as const },
            width: s.width,
            // Zahlen bleiben Zahlen, alles andere ist ausdruecklich Text — die
            // Bibliothek legt es dann als Textzelle an, nie als Formel (9-G).
            cell: (z: BestandExportZeile) =>
              s.zahl
                ? { value: Number(s.wert(z)), type: Number }
                : { value: String(s.wert(z)), type: String },
          })),
          sheet: EXCEL_BLATTNAME,
          stickyRowsCount: 1,
        }).toFile(bestandExportDateiname(new Date()));
      } catch {
        // Der deutsche Satz als ZUSTAND, nie `e.message`: der waere in
        // Produktion der englische Satz ueber eine „server-side exception"
        // (Falle 66, §11.2 d).
        setExportFehler(EXCEL_FEHLERTEXT);
      }
    });
  };
```

Am Knopf fällt `disabled={true}` und der erklärende `Tooltip` aus Teil 5; es bleibt
`disabled={exportLaeuft || rows.length === 0}` und der Titel „Erzeugt eine Excel-Datei (.xlsx) mit
der aktuell angezeigten Liste".

- [ ] **Schritt 5: Grün sehen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/"
```

- [ ] **Schritt 6: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/"
rtk git commit -m "feat(lagerbuch): Excel-Export angebunden — Teil 5s Vorgriff eingeloest

Spec §9.4 (9-E, 9-G, 9-H). Teil 5 (T129) hat den Knopf mit disabled und
erklaerendem Tooltip angelegt; hier faellt beides und die Funktion kommt dran.

Der Knopf sitzt in DERSELBEN Insel wie Filterleiste und Sortierung, weil er
deren Zustand braucht: exportiert wird `gefiltert`, also dieselbe abgeleitete
Liste, die auch in dataSource geht (§6.15, Auflage 9). Ein rein serverseitiger
Export waere ein anderes Produkt.

write-excel-file wird erst beim Klick nachgeladen (9-E). Jede nicht-numerische
Zelle geht als type:String — die Bibliothek legt sie dann als Textzelle an, nie
als Formel; der Formelschutz aus _lib/csvZelle.ts beruehrt diesen Pfad nicht
(9-G).

Der Fehler kommt als Zustand an, nie ueber e.message (Falle 66)."
```

### Task 166: CSV und Zwischenablage auf `/verwaltung/bestellung` werden angebunden

**Files:**
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/bestellung/BestellListe.tsx` (**ERGÄNZT**,
  Teil 5 T145)
- Test: `src/app/m/lagerbuch/verwaltung/(arbeit)/bestellung/BestellListe.test.tsx` (**ERGÄNZT**)

**Interfaces:**
- Consumes: `_lib/csvBestellung.ts` (T154) — `baueBestellCsv`, `BESTELL_CSV_DATEINAME`;
  `_lib/bestellText.ts` (T155) — `bestellListeText`; die vorhandene Insel aus Teil 5 T145.
- Produces: nichts Neues nach außen.

**Entscheidung 9-A: die Zeilenumfänge bleiben verschieden, aber sie werden beschriftet.** Die zwei
Knöpfe sitzen auf **einem** Bildschirm und liefern **nicht dieselben Zeilen** — CSV nimmt alle,
die Zwischenablage nur die offenen. Eine stille Vereinheitlichung wäre eine **Fachentscheidung im
Gewand einer Aufräumarbeit**. Geändert werden nur die beiden Beschriftungen:

| Heute | Nach dem Port |
|---|---|
| `Liste kopieren` | **`Liste kopieren (nur offene)`** |
| `CSV` | **`CSV (alle Zeilen)`** |

**Geprüft, dass das nichts bricht:** eine Suche über `lagerbuch/e2e/` nach `Liste kopieren` und
`bestellvorschlag` liefert **keinen** Treffer; der einzige Export-E2E ist
`lagerbuch/e2e/bestand-export.spec.ts` und trifft über `/Excel-Liste/` ausschließlich den
Excel-Knopf, der unverändert bleibt.

**Entscheidung 9-D: die Zwischenablage bekommt einen Rückfallweg.** `navigator.clipboard` verlangt
einen **secure context**. Heute läuft lagerbuch auf `http://localhost:3000` — `localhost` steht auf
der Allowlist der Browser. Die Suite adressiert Module in Dev über
`http://<key>.localtest.me:<port>`, und Browser bewerten die **Hostzeichenkette** (`localhost`,
`*.localhost`, `127.0.0.1`), **nicht** die aufgelöste Adresse. `lagerbuch.localtest.me` ist keines von
beidem. Ohne Gegenmaßnahme ist `navigator.clipboard` dort `undefined`, der `.catch()`-Zweig greift und
die Oberfläche meldet `Kopieren fehlgeschlagen` — **das liest sich wie ein Fehler des Moduls und ist
eine Eigenschaft der Umgebung.**

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Anhängen an `BestellListe.test.tsx`:

```tsx
import { baueBestellCsv, BESTELL_CSV_DATEINAME } from "@/app/m/lagerbuch/_lib/csvBestellung";
import { bestellListeText } from "@/app/m/lagerbuch/_lib/bestellText";

describe("Ausgabewege der Bestellliste (§9.1–§9.3)", () => {
  it("stellt beide Knoepfe frei", async () => {
    await mount(<BestellListe zeilen={ZEILEN} />);
    expect(query("[data-testid='lb-kopieren']").hasAttribute("disabled")).toBe(false);
    expect(query("[data-testid='lb-csv']").hasAttribute("disabled")).toBe(false);
  });

  /**
   * ENTSCHEIDUNG 9-A: die beiden Wege liefern verschieden viele Zeilen, und das
   * bleibt so. Geaendert werden nur die Beschriftungen — heute verraten sie
   * nichts, und eine stille Vereinheitlichung waere eine Fachentscheidung im
   * Gewand einer Aufraeumarbeit.
   */
  it("beschriftet den Zeilenumfang", async () => {
    await mount(<BestellListe zeilen={ZEILEN} />);
    expect(query("[data-testid='lb-kopieren']").textContent).toBe("Liste kopieren (nur offene)");
    expect(query("[data-testid='lb-csv']").textContent).toBe("CSV (alle Zeilen)");
  });

  it("baut die CSV aus allen Zeilen und benennt sie konstant", async () => {
    const blobs: string[] = [];
    vi.stubGlobal("Blob", class {
      constructor(teile: string[]) { blobs.push(teile.join("")); }
    });
    const erzeugt = vi.fn().mockReturnValue("blob:x");
    const frei = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: erzeugt, revokeObjectURL: frei });

    await mount(<BestellListe zeilen={ZEILEN} />);
    await clickElement(query("[data-testid='lb-csv']"));

    expect(blobs[0]).toBe(baueBestellCsv(ZEILEN.map((z) => ({
      name: z.name, bestand: z.bestand, mindestbestand: z.mindestbestand,
      vorschlag: z.vorschlag, einheit: z.einheit, bestellt: z.bestellt,
    }))));
    // Die Objekt-URL wird wieder freigegeben — sonst haelt jeder Download den
    // Blob bis zum Seitenwechsel im Speicher.
    expect(frei).toHaveBeenCalledWith("blob:x");
    vi.unstubAllGlobals();
  });

  it("kopiert nur die offenen Zeilen", async () => {
    const schreiben = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: schreiben } });
    await mount(<BestellListe zeilen={ZEILEN} />);
    await clickElement(query("[data-testid='lb-kopieren']"));
    expect(schreiben).toHaveBeenCalledWith(bestellListeText(ZEILEN));
    vi.unstubAllGlobals();
  });

  /** 1:1 aus BestellListe.tsx:26 — beide Meldungen bleiben wortgleich. */
  it("meldet den Erfolg wortgleich", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await mount(<BestellListe zeilen={ZEILEN} />);
    await clickElement(query("[data-testid='lb-kopieren']"));
    expect(document.body.textContent).toContain("Bestellliste kopiert");
    vi.unstubAllGlobals();
  });

  /**
   * ENTSCHEIDUNG 9-D — DER RUECKFALLWEG. `navigator.clipboard` verlangt einen
   * secure context; unter `lagerbuch.localtest.me` gibt es den nicht, weil
   * Browser die HOSTZEICHENKETTE bewerten (localhost, *.localhost, 127.0.0.1)
   * und nicht die aufgeloeste Adresse. Ohne diese Pruefung meldet die Oberflaeche
   * „Kopieren fehlgeschlagen" — das liest sich wie ein Fehler des Moduls und ist
   * eine Eigenschaft der Umgebung.
   */
  it("zeigt ohne secure context den Text zum Markieren statt einer Fehlermeldung", async () => {
    vi.stubGlobal("navigator", {});   // kein clipboard
    await mount(<BestellListe zeilen={ZEILEN} />);
    await clickElement(query("[data-testid='lb-kopieren']"));
    expect(document.body.textContent).not.toContain("Kopieren fehlgeschlagen");
    expect(document.body.textContent).toContain(
      "Diese Umgebung erlaubt keinen Zugriff auf die Zwischenablage. Text markieren und kopieren.",
    );
    // DER VERTRAG IST DER TEXTINHALT, NICHT DER TRANSPORTWEG: zeichengleich
    // derselbe String wie im Erfolgsfall.
    expect(queryPortal("textarea").value).toBe(bestellListeText(ZEILEN));
    vi.unstubAllGlobals();
  });

  /** Der echte Fehlerfall bleibt und behaelt seinen Wortlaut. */
  it("meldet einen echten Fehlschlag wortgleich", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("nope")) },
    });
    await mount(<BestellListe zeilen={ZEILEN} />);
    await clickElement(query("[data-testid='lb-kopieren']"));
    expect(document.body.textContent).toContain("Kopieren fehlgeschlagen");
    expect(document.body.textContent).not.toContain("nope");
    vi.unstubAllGlobals();
  });
});
```

⚠️ **`queryPortal` kommt aus dem Harness** (`@/app/m/qr/_lib/test-dom`) und ist nötig, weil ein
antd-`Modal` in einem Portal rendert.

- [ ] **Schritt 2: Rot sehen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bestellung/BestellListe.test.tsx"
```

- [ ] **Schritt 3: Die Insel anbinden**

```tsx
import { Modal, Input } from "antd";
import { baueBestellCsv, BESTELL_CSV_DATEINAME } from "@/app/m/lagerbuch/_lib/csvBestellung";
import { bestellListeText } from "@/app/m/lagerbuch/_lib/bestellText";

  const [abschriftOffen, setAbschriftOffen] = useState(false);

  /**
   * ZWISCHENABLAGE (Spec §9.3, Entscheidung 9-D).
   *
   * NUR DIE OFFENEN ZEILEN — die CSV nimmt alle. Die beiden Wege duerfen
   * auseinanderlaufen und tun es; 9-A laesst den Umfang und beschriftet ihn
   * stattdessen.
   *
   * `navigator.clipboard` wird auf VORHANDENSEIN geprueft, nicht angenommen: es
   * verlangt einen secure context, und Browser bewerten dafuer die
   * HOSTZEICHENKETTE (localhost, *.localhost, 127.0.0.1) — nicht die aufgeloeste
   * Adresse. `lagerbuch.localtest.me` ist keines von beidem, und ohne diese
   * Pruefung meldete die Oberflaeche in Dev und E2E „Kopieren fehlgeschlagen".
   */
  function kopieren() {
    const text = bestellListeText(zeilen);
    const schreiben = navigator.clipboard?.writeText;
    if (!schreiben) {
      setAbschriftOffen(true);
      return;
    }
    schreiben.call(navigator.clipboard, text)
      .then(() => setMsg("Bestellliste kopiert"))
      .catch(() => setErr("Kopieren fehlgeschlagen"));
  }

  /**
   * CSV (Spec §9.2). ALLE Zeilen, auch die bereits als bestellt markierten.
   * Der Dateiname ist konstant und traegt kein Datum — wiederholte Downloads
   * kollidieren dadurch im Download-Ordner. Ein datierter Name waere eine
   * Verbesserung UND eine Formataenderung; 1:1-Pflicht 28 laesst ihn.
   */
  function csvLaden() {
    const inhalt = baueBestellCsv(
      zeilen.map((z) => ({
        name: z.name, bestand: z.bestand, mindestbestand: z.mindestbestand,
        vorschlag: z.vorschlag, einheit: z.einheit, bestellt: z.bestellt,
      })),
    );
    const blob = new Blob([inhalt], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = BESTELL_CSV_DATEINAME;
    a.click();
    URL.revokeObjectURL(url);
  }
```

Dazu der Rückfall-Dialog — **`Input.TextArea` ist ein Compound-Zugriff und gehört deshalb
ausschließlich in diese Client-Insel** (in einer Server Component wäre er HTTP 500, Falle 1):

```tsx
      <Modal
        open={abschriftOffen}
        onCancel={() => setAbschriftOffen(false)}
        footer={null}
        title="Bestellliste kopieren"
      >
        <p>Diese Umgebung erlaubt keinen Zugriff auf die Zwischenablage. Text markieren und kopieren.</p>
        {/* Der Vertrag ist der TEXTINHALT, nicht der Transportweg: zeichengleich
            derselbe String wie im Erfolgsfall (§9.3). */}
        <Input.TextArea
          readOnly
          autoFocus
          rows={8}
          value={bestellListeText(zeilen)}
          onFocus={(e) => e.currentTarget.select()}
        />
      </Modal>
```

Die beiden Beschriftungen werden auf `Liste kopieren (nur offene)` und `CSV (alle Zeilen)` gesetzt;
`disabled` und der erklärende `Tooltip` aus Teil 5 fallen.

- [ ] **Schritt 4: Grün sehen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bestellung/"
```

- [ ] **Schritt 5: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/bestellung/"
rtk git commit -m "feat(lagerbuch): CSV und Zwischenablage angebunden, mit Rueckfallweg

Spec §9.1-§9.3. Teil 5 (T145) hat beide Knoepfe mit disabled angelegt; hier
faellt es.

Entscheidung 9-A: die Zeilenumfaenge bleiben verschieden — CSV alle,
Zwischenablage nur die offenen. Geaendert werden nur die Beschriftungen:
\"Liste kopieren (nur offene)\" und \"CSV (alle Zeilen)\". Eine stille
Vereinheitlichung waere eine Fachentscheidung im Gewand einer Aufraeumarbeit.
Geprueft: kein E2E und kein Unit-Test des Bestands greift auf die beiden
Beschriftungen zu.

Entscheidung 9-D: navigator.clipboard wird auf Vorhandensein geprueft, nicht
angenommen. Es verlangt einen secure context, und Browser bewerten dafuer die
Hostzeichenkette — lagerbuch.localtest.me ist weder localhost noch *.localhost
noch 127.0.0.1. Ohne die Pruefung meldete die Oberflaeche in Dev und E2E
\"Kopieren fehlgeschlagen\", also einen Fehler des Moduls fuer eine Eigenschaft
der Umgebung. Der Rueckfall zeigt denselben Text in einem Modal; der Vertrag ist
der Textinhalt, nicht der Transportweg.

Input.TextArea ist ein Compound-Zugriff und steht deshalb ausschliesslich in
dieser Client-Insel (Falle 1)."
```

### Gate nach Welle 4

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build && pnpm exec playwright test
```

---

## Welle 5 — Die fünf E2E-Dateien (5 Tasks, alle parallel)

⚠️ **Playwright fährt alle Dateien in EINEM Worker gegen EINE SQLite-Datei** (`workers: 1`,
`playwright.config.ts`). Daraus folgen zwei Regeln für **jeden** Task dieser Welle, und beide sind
§12.3:

- **Kein `.first()`** und keine Zusicherung, die an der Reihenfolge früherer Specs hängt. Der
  benötigte Zustand wird **im Test selbst** hergestellt.
- **Keine defensiven Übersprünge.** Ein `if (await x.count())` liefe ohne Voraussetzung **grün ohne
  Zusicherung** durch. Fehlt eine Voraussetzung, wird der Test **rot**.

**Voraussetzung für alle fünf:** `playwright.config.ts` trägt `SUITE_HOST_LAGERBUCH`, das
Sitzungsgeheimnis, die Admin-Gruppe, den Seed-Schritt und den **zweiten Host** (Teil 3, T60). Fehlt
das, sind T169 und T171 nicht durchführbar und die Host-Zeilen bleiben unbewiesen.

### Task 167: `e2e/lagerbuch-etiketten.spec.ts`

**Files:**
- Create: `e2e/lagerbuch-etiketten.spec.ts`

**Interfaces:**
- Consumes: die Route `/verwaltung/etiketten` (T161, T162); `e2e/fixtures.ts` und
  `e2e/helpers/decode-qr.ts` (Bestand); die Seed-Daten aus Teil 3 (T60).
- Produces: die **drei** Druck-Zusagen aus §6.10.2 und die **Riegel-Zusage** aus §6.1.3 Punkt 3.

**Diese Datei besitzt zwei Aussagen, die sonst NIRGENDS geprüft werden:**

1. **`@media print` wirkt.** `pnpm build` und Vitest sehen `@media print` **gar nicht**, Playwright
   rendert per Vorgabe für den **Bildschirm**, und der einzige heutige Test
   (`lagerbuch/e2e/etiketten.spec.ts:11`) prüft `.etikett img` im **Bildschirm**-DOM. Der Scan aus
   T161 hält nur „die Regel steht da", nie „sie wirkt".
2. **Die Kopplung zwischen den zwei Group-Layouts.** Ein Abruf von `/verwaltung/etiketten` **ohne**
   Lagerbuch-Gruppe muss **dieselbe** Antwort liefern wie `/verwaltung/artikel` ohne Gruppe — also
   `notFound()` und **nicht 403**. ⚠️ **Ein Quelltext-Scan sieht diese Kopplung nicht** (F3, §6.1.3).

- [ ] **Schritt 1: Die Spec schreiben**

```ts
import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

const HOST = "http://lagerbuch.localtest.me:3100";

/**
 * DER ETIKETTENBOGEN (Spec §8.4, §6.10.2, §6.1.3, §8.5).
 *
 * Zwei Aussagen dieser Datei werden sonst NIRGENDS geprueft:
 *   1. dass @media print WIRKT — build und Vitest sehen den Block gar nicht,
 *      Playwright rendert per Vorgabe fuer den Bildschirm, und der einzige
 *      heutige Test (lagerbuch/e2e/etiketten.spec.ts:11) prueft das
 *      BILDSCHIRM-DOM.
 *   2. dass BEIDE Group-Layouts denselben Riegel tragen. Ein Quelltext-Scan
 *      sieht die Kopplung zwischen zwei Layouts nicht (F3).
 *
 * KEIN .first() und kein defensiver Uebersprung (§12.3, Regeln 4 und 5): der
 * benoetigte Zustand wird im Test selbst hergestellt.
 */
test.describe("Etikettenbogen", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { groups: ["lagerbuch_nutzer"] });
  });

  test("zeigt Kacheln mit eingesetztem SVG, nicht mit <img>", async ({ page }) => {
    await page.goto(`${HOST}/verwaltung/etiketten`);
    await expect(page.locator(".lb-etikettQr > svg").first()).toBeVisible();
    // Der alte Anker ist tot und soll es bleiben (§12.1, Punkt 7).
    await expect(page.locator(".lb-etikett img")).toHaveCount(0);
  });

  /**
   * §8.1, 8-B, Fehlerzustand 2: die Zeile ueber dem Bogen ist der EINZIGE Weg,
   * eine Umsortierung von SUITE_HOST_LAGERBUCH vor dem Papier zu bemerken.
   */
  test("schreibt den verwendeten Host ueber den Bogen", async ({ page }) => {
    await page.goto(`${HOST}/verwaltung/etiketten`);
    await expect(page.getByTestId("lb-basis")).toContainText("Alle QR-Codes zeigen auf http");
  });

  test("waehlt zu Beginn alles aus und schaltet ueber Keine ab", async ({ page }) => {
    await page.goto(`${HOST}/verwaltung/etiketten`);
    const kacheln = page.locator(".lb-etikett");
    const n = await kacheln.count();
    expect(n, "der Seed muss mindestens zwei Etiketten liefern").toBeGreaterThan(1);
    await expect(page.getByTestId("lb-drucken")).toContainText(`(${n})`);
    await page.getByTestId("lb-keine").click();
    await expect(page.getByTestId("lb-drucken")).toContainText("(0)");
  });

  /**
   * DIE DREI DRUCK-ZUSAGEN AUS §6.10.2. `emulateMedia` ist der einzige Weg, an
   * dem der @media print-Block ueberhaupt sichtbar wird.
   */
  test("blendet im Druck Kaestchen, abgewaehlte Kachel und Suite-Kopfzeile aus", async ({ page }) => {
    await page.goto(`${HOST}/verwaltung/etiketten`);

    // Genau eine Kachel abwaehlen — der Zustand wird im Test hergestellt.
    const ersteWahl = page.locator(".lb-etikettWahl").nth(0);
    await ersteWahl.uncheck();
    const abgewaehlt = page.locator(".lb-etikettAbgewaehlt").nth(0);
    await expect(abgewaehlt).toBeVisible();          // am Bildschirm blass, aber da

    await page.emulateMedia({ media: "print" });

    await expect(abgewaehlt).toBeHidden();           // display:none, nicht opacity
    await expect(page.locator(".lb-etikettWahl").nth(0)).toBeHidden();
    await expect(page.getByTestId("lb-drucken")).toBeHidden();
    await expect(page.getByTestId("suite-header")).toHaveCount(0);

    await page.emulateMedia({ media: "screen" });
  });

  /**
   * DIE KONTROLLE ZUR VORIGEN ZEILE, und ohne sie waere jene ein NO-OP.
   * `expect(getByTestId("suite-header")).toHaveCount(0)` geht auch dann durch,
   * wenn es den Anker gar nicht gibt — dieselbe Bauform wie ein defensiver
   * Uebersprung (§12.3, Regel 5), nur im anderen Kostuem. Ein no-op ist hier
   * SCHLIMMER als keine Zusicherung, weil er abgehakt wird.
   *
   * Der Anker existiert: core/shell/SuiteHeader.tsx:65 setzt
   * data-testid="suite-header" am <Header>. Auf einer Arbeitsseite ist er da,
   * auf dem Druckast nicht — DAS ist die Aussage von Entscheidung 8-H.
   */
  test("dieselbe Kopfzeile ist auf einer Arbeitsseite sehr wohl da", async ({ page }) => {
    await page.goto(`${HOST}/verwaltung/artikel`);
    await expect(page.getByTestId("suite-header")).toHaveCount(1);
    await page.goto(`${HOST}/verwaltung/etiketten`);
    await expect(page.getByTestId("suite-header")).toHaveCount(0);
  });

  /**
   * EIN BLATT PAPIER HAT KEINEN DUNKELMODUS. Der Bogen ist hart #fff/#000, und
   * print-color-adjust:exact verbietet dem Browser jede Notrechnung — ohne die
   * Festlegung kaeme weisse Schrift auf weissem Papier heraus, und gedruckt
   * waere nur der QR-Kasten sichtbar (§6.10.2, Punkt 2).
   */
  test("bleibt im Dunkelmodus weiss", async ({ page }) => {
    await page.goto(`${HOST}/verwaltung/etiketten`);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    const bogen = page.locator(".lb-etikettbogen");
    await expect(bogen).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(bogen).toHaveCSS("color", "rgb(0, 0, 0)");
  });

  /**
   * DIE EINZIGE ZUSICHERUNG, DIE DIE KOPPLUNG ZWISCHEN DEN ZWEI GROUP-LAYOUTS
   * PRUEFT (F3, §6.1.3 Punkt 3, §12.4). Faellt requireLagerbuchAdmin aus
   * (druck)/layout.tsx, sind die gedruckten Zugangs-Codes IM KLARTEXT
   * oeffentlich — und ein Quelltext-Scan sieht das nicht.
   *
   * Bewusst 404 und nicht 403: „ein 403 verriete, dass es die Admin-Route gibt"
   * (core/auth/guards.ts:15-17). Fuer eine Verwaltung mit Journal, Klarnamen und
   * Etiketten voller Klartext-Codes ist das keine Formalie.
   */
  test("antwortet ohne Lagerbuch-Gruppe genau wie eine Arbeitsseite", async ({ page }) => {
    await devLogin(page, { groups: [] });   // angemeldet, aber ohne Gruppe

    const etiketten = await page.goto(`${HOST}/verwaltung/etiketten`);
    const artikel = await page.goto(`${HOST}/verwaltung/artikel`);

    expect(etiketten!.status()).toBe(404);
    expect(etiketten!.status()).toBe(artikel!.status());

    // Und der Inhalt ist die Suite-404, nicht der Bogen: kein Code im Klartext.
    await page.goto(`${HOST}/verwaltung/etiketten`);
    await expect(page.locator(".lb-etikett")).toHaveCount(0);
    await expect(page.getByText(/Diese Seite gibt es hier nicht/)).toBeVisible();
  });

  test("antwortet auch ohne jede Sitzung nicht mit dem Bogen", async ({ browser }) => {
    const anonym = await browser.newContext();
    const seite = await anonym.newPage();
    const antwort = await seite.goto(`${HOST}/verwaltung/etiketten`);
    // 404 (Riegel) oder 307 auf /login — nie 200 mit einem Bogen.
    expect([404, 307, 302, 303]).toContain(antwort!.status());
    await expect(seite.locator(".lb-etikett")).toHaveCount(0);
    await anonym.close();
  });
});
```

⚠️ **`devLogin(page, { groups })` stammt aus `e2e/fixtures.ts`.** Trägt der Helfer eine andere
Signatur, wird **dieser Test** angepasst — `fixtures.ts` gehört nicht diesem Plan. Die
Admin-Gruppe (`lagerbuch_nutzer`) ist eine **Annahme** aus Teil 1 (`src/lib/config.ts:46`) und steht
in `playwright.config.ts` (Teil 3, T60).

- [ ] **Schritt 2: Laufen lassen**

```bash
pnpm exec playwright test e2e/lagerbuch-etiketten.spec.ts
```

- [ ] **Schritt 3: Die Gegenprobe fahren, die den Druck-Test rechtfertigt**

```bash
# den @media print-Block entschaerfen — der Test MUSS anschlagen
sed -i.bak 's/\.lb-etikettAbgewaehlt {\n    display: none;/.lb-etikettAbgewaehlt {\n    opacity: 0;/' \
  "src/app/m/lagerbuch/verwaltung/(druck)/druck.css"
```

Praktikabler ohne mehrzeiliges `sed`: die Zeile `display: none;` im `@media print`-Block von Hand auf
`opacity: 0;` setzen, den Lauf fahren (**muss rot sein**: `expect(abgewaehlt).toBeHidden()` schlägt
fehl, weil ein Element mit `opacity: 0` weiter Platz belegt und für Playwright **sichtbar** ist),
danach zurückändern. **Genau diese Mutation lässt der Quelltext-Scan aus T161 durch** — er prüft, dass
`.lb-etikettAbgewaehlt` im Druckblock steht, nicht, was drinsteht.

- [ ] **Schritt 4: Commit**

```bash
rtk git add e2e/lagerbuch-etiketten.spec.ts
rtk git commit -m "test(lagerbuch): E2E fuer den Etikettenbogen — Druck, Dunkelmodus, Riegel

Spec §6.10.2, §6.1.3, §8.5, §12.4.

Zwei Aussagen dieser Datei werden sonst nirgends geprueft:

1. @media print WIRKT. build und Vitest sehen den Block gar nicht, Playwright
   rendert per Vorgabe fuer den Bildschirm, und der einzige heutige Test des
   Bestands prueft das Bildschirm-DOM. emulateMedia({media:\"print\"}) ist der
   einzige Weg. Gegenprobe gefahren: display:none -> opacity:0 im Druckblock
   faerbt den Test rot, waehrend der Quelltext-Scan aus T161 gruen bleibt.

2. Die Kopplung zwischen den zwei Group-Layouts (F3): /verwaltung/etiketten ohne
   Lagerbuch-Gruppe gibt dieselbe Antwort wie /verwaltung/artikel ohne Gruppe —
   404, nicht 403. Faellt requireLagerbuchAdmin aus dem Druck-Layout, sind die
   gedruckten Zugangs-Codes im Klartext oeffentlich, und ein Quelltext-Scan
   sieht das nicht.

Dazu: der Bogen bleibt im Dunkelmodus weiss. Ein Blatt Papier hat keinen
Dunkelmodus, und print-color-adjust:exact verbietet dem Browser jede
Notrechnung — sonst kaeme nur der QR-Kasten heraus."
```

### Task 168: `e2e/lagerbuch-bestand-export.spec.ts`

**Files:**
- Create: `e2e/lagerbuch-bestand-export.spec.ts`

**Interfaces:**
- Consumes: `/verwaltung/artikel` mit angebundenem Excel-Knopf (T165).
- Produces: die **eine** Zusage, die nur ein Browser zeigen kann: „es kommt wirklich eine `.xlsx`
  an, mit datiertem Namen".

**§12.5 sagt zu dieser Spec: „Übernehmen, Rolle+Name sind antd-neutral."** Sie ist damit die
einzige der 13 Alt-Specs, die **nicht** umgeschrieben wird — und die benannte Lücke wandert mit:
sie prüft nur die **Form** des Dateinamens (`/^bestand-\d{4}-\d{2}-\d{2}\.xlsx$/`), nie den **Wert**.
Der Wert entsteht aus **Browserzeit** (§9.4), also bleibt die Lücke bestehen. `_lib/bestandExport.test.ts`
(T156) nagelt den Wert gegen ein festes Datum fest — mehr geht nicht.

- [ ] **Schritt 1: Die Spec schreiben**

```ts
import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

const HOST = "http://lagerbuch.localtest.me:3100";

/**
 * DER EXCEL-EXPORT (Spec §9.4, §9.6, §12.5).
 *
 * Diese Spec wird als EINZIGE der 13 Alt-Specs uebernommen statt umgeschrieben:
 * Rolle und Name sind antd-neutral (lagerbuch/e2e/bestand-export.spec.ts:16-24).
 *
 * WARUM SIE UEBERHAUPT NOETIG IST: die Bibliothek wird beim Klick nachgeladen
 * (await import("write-excel-file/browser")). Ein Unit-Test kann das nicht sehen
 * — er kann nur pruefen, mit WELCHEN Argumenten sie gerufen wuerde (T165).
 *
 * DIE BENANNTE LUECKE, die 1:1 mitwandert: geprueft wird die FORM des
 * Dateinamens, nie sein WERT. Der Wert entsteht aus BROWSERzeit (§9.4) und ist
 * damit von der Zone des Arbeitsplatzes abhaengig; _lib/bestandExport.test.ts
 * nagelt ihn gegen ein festes Datum fest. Mehr geht nicht, und das steht hier,
 * damit niemand die Luecke fuer ein Versehen haelt.
 */
test.describe("Excel-Export des Bestands", () => {
  test("liefert eine echte .xlsx mit datiertem Namen", async ({ page }) => {
    await devLogin(page, { groups: ["lagerbuch_nutzer"] });
    await page.goto(`${HOST}/verwaltung/artikel`);

    const knopf = page.getByRole("button", { name: /Excel-Liste/ });
    await expect(knopf).toBeEnabled();   // Teil 5s Vorgriff ist eingeloest (T165)

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      knopf.click(),
    ]);

    // 1:1 aus lagerbuch/e2e/bestand-export.spec.ts:18.
    expect(download.suggestedFilename()).toMatch(/^bestand-\d{4}-\d{2}-\d{2}\.xlsx$/);

    // 1:1 aus :20-24 — ZIP-Magic `PK`, also eine echte xlsx und kein
    // umbenanntes CSV. Ohne diese zwei Bytes belegte der Test nur, DASS eine
    // Datei ankommt.
    const pfad = await download.path();
    const kopf = (await import("node:fs")).readFileSync(pfad!).subarray(0, 2);
    expect(kopf.toString("latin1")).toBe("PK");
  });

  /**
   * §6.15, Auflage 9 / §12.1 Punkt 2, an der Oberflaeche: der Export liest
   * DIESELBE abgeleitete Liste wie die Tabelle. Die reine Fassung steht in
   * _lib/bestandExport.test.ts, die Insel-Fassung in ArtikelTable.test.tsx —
   * hier wird nur belegt, dass die Kette im echten Browser haelt.
   */
  test("exportiert nach einer Suche weniger Zeilen", async ({ page }) => {
    await devLogin(page, { groups: ["lagerbuch_nutzer"] });
    await page.goto(`${HOST}/verwaltung/artikel`);

    const vorher = await page.getByRole("row").count();
    await page.getByRole("searchbox").fill("Mullbinde");
    await expect.poll(() => page.getByRole("row").count()).toBeLessThan(vorher);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Excel-Liste/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^bestand-/);
    // Die ZEILENZAHL in der Datei zu pruefen hiesse, hier eine xlsx zu parsen —
    // das besitzt _lib/bestandExport.test.ts. Hier zaehlt: der Knopf bleibt nach
    // dem Filtern bedienbar und liefert.
  });

  /** 1:1 aus ArtikelTable.tsx:163. */
  test("ist ohne Zeilen abgestellt", async ({ page }) => {
    await devLogin(page, { groups: ["lagerbuch_nutzer"] });
    await page.goto(`${HOST}/verwaltung/artikel`);
    await page.getByRole("searchbox").fill("gibtesnicht-zzz");
    await expect(page.getByRole("button", { name: /Excel-Liste/ })).toBeDisabled();
  });
});
```

⚠️ **`role=searchbox` entsteht ALLEIN aus `type="search"`** (§12.3, Regel 2). Wer das Bauteil
ersetzt und nur `placeholder`/`label` mitnimmt, bekommt `textbox` — und dieser Test bricht **still**
im Sinne von „Selektor findet nichts". Teil 5 (§2) schreibt `<Input type="search">` und **nie**
`Input.Search` vor.

- [ ] **Schritt 2: Laufen lassen und committen**

```bash
pnpm exec playwright test e2e/lagerbuch-bestand-export.spec.ts
rtk git add e2e/lagerbuch-bestand-export.spec.ts
rtk git commit -m "test(lagerbuch): E2E fuer den Excel-Export, aus dem Bestand uebernommen

Spec §9.6, §12.5. Die einzige der 13 Alt-Specs, die uebernommen statt
umgeschrieben wird: Rolle und Name sind antd-neutral.

Geprueft wird der Dateiname (Regex) UND der ZIP-Magic PK — ohne die zwei Bytes
belegte der Test nur, dass eine Datei ankommt, nicht dass es eine xlsx ist.

Die benannte Luecke wandert 1:1 mit: geprueft wird die FORM des Dateinamens, nie
sein WERT. Der Wert entsteht aus Browserzeit und haengt an der Zone des
Arbeitsplatzes; _lib/bestandExport.test.ts nagelt ihn gegen ein festes Datum
fest. Sie steht im Kopfkommentar, damit niemand sie fuer ein Versehen haelt."
```

### Task 169: `e2e/lagerbuch-hosts.spec.ts` — Falle 61 mit Datenwirkung

**Files:**
- Create: `e2e/lagerbuch-hosts.spec.ts`

**Interfaces:**
- Consumes: `_lib/host.ts` (Teil 1, T10) — mittelbar über jede Route; `playwright.config.ts` mit dem
  **zweiten Host** (Teil 3, T60); die Seed-Daten mit mindestens einem **aktiven Token**.
- Produces: die Zusage „**jede** Route des Moduls antwortet auf einem **fremden** Suite-Host mit 404
  — und `tokens.last_used_at` ist danach nachweislich `NULL`".

**Warum eine Schleife und nicht zwei Stichproben** (§12.2). `decideRoute` behandelt interne Pfade
gesondert und gatet nach dem **Modul aus dem Segment**, nicht nach dem Host. Für ein Modul mit
`requiresAuth: false` steigt `canAccess` sofort mit `true` aus (`core/registry.ts:155`) — der Zweig
endet bei `{ action: "next" }`, **gleichgültig, welcher Host gefragt hat**. `proxy.ts:103` nimmt
`/m/*` bewusst nicht aus dem Matcher; das wäre ein Auth-Bypass. Folge: sobald lagerbuch das zwingende
`requiresAuth: false` bekommt, beantwortet **jeder** Host, der auf den Suite-Container terminiert,
`/m/lagerbuch/t/<code>`, `/m/lagerbuch/g/<code>`, `/m/lagerbuch/helfer/*` und
`/m/lagerbuch/verwaltung/*`.

⚠️ **Route Handler haben kein Layout.** Ohne diese Schleife bliebe die Mutation „den Host-Abgleich in
`/t/[code]` weglassen" **grün**, und `/m/lagerbuch/t/<code>` verbrauchte Codes von jedem
terminierenden Host aus. Und ein verbrauchter Code ist **nicht mehr löschbar** — `redeemToken`
schreibt `lastUsedAt` **vor** dem Redirect. **`lagerbuch` ist das erste Modul, bei dem diese Klasse
eine Datenwirkung hat statt einer kosmetischen** (§1.5, Punkt 3); genau deshalb ist der Riegel hier
nicht optional.

**Kein Gate sieht das:** `core/routing.test.ts:61-65` prüft **ausdrücklich**, dass interne Pfade nach
dem Segment gegatet werden — das Verhalten ist nicht bloß ungetestet, es ist **festgeschrieben**.
`typecheck`, `lint` und `pnpm build` sehen nichts, und Playwright fährt gegen genau **einen**
`baseURL`.

- [ ] **Schritt 0: Prüfen, dass die Konfiguration einen zweiten Host führt**

```bash
grep -n "SUITE_HOST_LAGERBUCH\|localtest.me" playwright.config.ts
```

Erwartet: `SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me` (Teil 3, T60). **Der fremde Host ist jeder
andere terminierende Suite-Host** — `feedback.localtest.me` und `portal.localtest.me` laufen ohnehin
auf demselben Server (`baseURL` zeigt auf `portal.localtest.me:3100`). **Fehlt die Zeile, ist dieser
Task nicht durchführbar und der Host-Riegel bleibt unbewiesen** (§3.8.3, „Prüflücke, benannt statt
übersehen"); dann gilt `_lib/host.test.ts` als einzige Absicherung, **und das ist ausdrücklich zu
wenig für die Zeile mit der Datenwirkung**.

- [ ] **Schritt 1: Die Spec schreiben**

```ts
import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { devLogin } from "./fixtures";

const EIGEN = "http://lagerbuch.localtest.me:3100";
const FREMD = "http://feedback.localtest.me:3100";
const DB = "./.data/e2e/lagerbuch.db";

/**
 * FALLE 61 — UND SIE HAT HIER EINE DATENWIRKUNG (Spec §2.6, §12.2, §3.8.3).
 *
 * decideRoute gatet interne Pfade nach dem MODUL AUS DEM SEGMENT, nicht nach dem
 * Host. Fuer ein Modul mit requiresAuth:false steigt canAccess sofort mit true
 * aus (core/registry.ts:155), der Zweig endet bei { action: "next" } — GLEICH,
 * welcher Host gefragt hat. proxy.ts:103 nimmt /m/* bewusst nicht aus dem
 * Matcher; das waere ein Auth-Bypass.
 *
 * KEIN GATE SIEHT DAS: core/routing.test.ts:61-65 prueft AUSDRUECKLICH, dass
 * interne Pfade nach dem Segment gegatet werden — das Verhalten ist
 * festgeschrieben, nicht bloss ungetestet. typecheck, lint und build sehen
 * nichts, und Playwright faehrt sonst gegen genau einen baseURL.
 *
 * EINE SCHLEIFE, KEINE ZWEI STICHPROBEN (§12.2): Route Handler haben kein
 * Layout. Ohne die Schleife bliebe die Mutation „den Host-Abgleich in /t/[code]
 * weglassen" gruen — und /m/lagerbuch/t/<code> verbrauchte Codes von JEDEM
 * terminierenden Host aus. Ein verbrauchter Code ist nicht mehr loeschbar,
 * sondern nur noch sperrbar (8-F): redeemToken schreibt lastUsedAt VOR dem
 * Redirect.
 */

/** Jeder Einstieg des Moduls, in INNERER Pfadform — so, wie ein fremder Host
 *  ihn erreichen wuerde. Die Liste ist die Abrufliste aus §7 dieses Plans,
 *  eingedampft auf je einen Vertreter pro Ast plus ALLE Route Handler. */
const EINSTIEGE = [
  "/m/lagerbuch",
  "/m/lagerbuch/helfer",
  "/m/lagerbuch/helfer/check",
  "/m/lagerbuch/a/V1StGXR8_Z5jdHi6B-myT",
  "/m/lagerbuch/g/4012345678901",
  "/m/lagerbuch/verwaltung",
  "/m/lagerbuch/verwaltung/artikel",
  "/m/lagerbuch/verwaltung/etiketten",
  "/m/lagerbuch/verwaltung/tokens",
  "/m/lagerbuch/abmelden",
  "/m/lagerbuch/manifest.webmanifest",
  "/m/lagerbuch/pwa-icon.svg",
  "/m/lagerbuch/icon-192.png",
  "/m/lagerbuch/icon-512.png",
  "/m/lagerbuch/icon-maskable-512.png",
];

test.describe("Host-Riegel", () => {
  for (const pfad of EINSTIEGE) {
    test(`${pfad} antwortet auf einem fremden Suite-Host mit 404`, async ({ page }) => {
      // Angemeldet MIT Lagerbuch-Gruppe: sonst waere der 404 der Gruppenriegel
      // und nicht der Hostriegel, und der Test bewiese das Falsche.
      await devLogin(page, { groups: ["lagerbuch_nutzer"] });
      const antwort = await page.goto(`${FREMD}${pfad}`);
      expect(antwort!.status(), `${pfad} auf ${FREMD}`).toBe(404);
    });
  }

  /** DIE GEGENRICHTUNG. Ohne sie bewiese die Schleife nur, dass irgendetwas
   *  404 gibt — etwa eine kaputte Route. */
  test("dieselben Pfade antworten auf dem EIGENEN Host nicht mit 404", async ({ page }) => {
    await devLogin(page, { groups: ["lagerbuch_nutzer"] });
    for (const pfad of ["/verwaltung/artikel", "/verwaltung/etiketten", "/manifest.webmanifest"]) {
      const antwort = await page.goto(`${EIGEN}${pfad}`);
      expect(antwort!.status(), `${pfad} auf ${EIGEN}`).not.toBe(404);
    }
  });

  /**
   * DIE ZEILE, DIE FALLE 61 BEZAHLT: nach dem Versuch von einem fremden Host ist
   * tokens.last_used_at NACHWEISLICH unveraendert NULL. Ein 404 allein sagte
   * nichts darueber, ob der Code vorher schon verbraucht wurde — der Riegel muss
   * VOR jeder Wirkung greifen.
   */
  test("verbraucht einen Code vom fremden Host aus nicht", async ({ page }) => {
    const db = new Database(DB, { readonly: true });
    const zeile = db
      .prepare("select code, last_used_at from tokens where aktiv = 1 limit 1")
      .get() as { code: string; last_used_at: number | null };
    expect(zeile, "der Seed muss einen aktiven Zugangs-Code liefern").toBeTruthy();
    expect(zeile.last_used_at, "der Seed-Code darf noch nicht benutzt sein").toBeNull();
    db.close();

    const antwort = await page.goto(`${FREMD}/m/lagerbuch/t/${zeile.code}`);
    expect(antwort!.status()).toBe(404);

    const nachher = new Database(DB, { readonly: true });
    const danach = nachher
      .prepare("select last_used_at from tokens where code = ?")
      .get(zeile.code) as { last_used_at: number | null };
    nachher.close();
    expect(danach.last_used_at, "der Riegel muss VOR jeder Wirkung greifen").toBeNull();
  });

  /**
   * §11.5, ZUSTAND 19: angemeldet, aber ohne Lagerbuch-Gruppe → 404 auf dem
   * EIGENEN Host, und KEIN Verwaltungs-Eintrag in der Navigation. Bewusst 404
   * und nicht 403: „ein 403 verriete, dass es die Admin-Route gibt"
   * (core/auth/guards.ts:15-17).
   */
  test("gibt einem Konto ohne Lagerbuch-Gruppe 404 statt 403", async ({ page }) => {
    await devLogin(page, { groups: [] });
    const antwort = await page.goto(`${EIGEN}/verwaltung/artikel`);
    expect(antwort!.status()).toBe(404);
    await expect(page.getByText(/Diese Seite gibt es hier nicht/)).toBeVisible();
  });
});
```

⚠️ **Der Pfad `./.data/e2e/lagerbuch.db` kommt aus `playwright.config.ts`** (`DATA_DIR=./.data/e2e`).
Weicht er ab, wird **die Konstante hier** angepasst, nicht die Konfiguration.

- [ ] **Schritt 2: Laufen lassen, Gegenprobe, Commit**

```bash
pnpm exec playwright test e2e/lagerbuch-hosts.spec.ts
```

Gegenprobe: `requireLagerbuchHost` in `verwaltung/(druck)/layout.tsx` auskommentieren →
`/m/lagerbuch/verwaltung/etiketten` auf `feedback.localtest.me` antwortet **200 statt 404**, der Test
wird rot. Danach zurückändern.

```bash
rtk git add e2e/lagerbuch-hosts.spec.ts
rtk git commit -m "test(lagerbuch): jeder Einstieg antwortet auf fremdem Suite-Host mit 404

Spec §2.6, §12.2, §3.8.3. Falle 61 — und lagerbuch ist das erste Modul, bei dem
diese Klasse eine DATENWIRKUNG hat statt einer kosmetischen.

decideRoute gatet interne Pfade nach dem Segment, nicht nach dem Host; fuer ein
Modul mit requiresAuth:false steigt canAccess sofort mit true aus. Das Verhalten
ist nicht bloss ungetestet, es ist in core/routing.test.ts:61-65 ausdruecklich
FESTGESCHRIEBEN.

Eine Schleife ueber 15 Einstiege, keine zwei Stichproben: Route Handler haben
kein Layout, und ohne die Schleife bliebe „den Host-Abgleich in /t/[code]
weglassen\" gruen. Dazu die Gegenrichtung (auf dem eigenen Host kein 404) und
die Zeile, die Falle 61 bezahlt: tokens.last_used_at ist nach dem Versuch vom
fremden Host nachweislich unveraendert NULL — der Riegel muss VOR jeder Wirkung
greifen, denn ein verbrauchter Code ist nur noch sperrbar (8-F)."
```

### Task 170: `e2e/lagerbuch-mobil.spec.ts` — drei Breiten, nicht zwei

**Files:**
- Create: `e2e/lagerbuch-mobil.spec.ts`

**Interfaces:**
- Consumes: die Verwaltungsseiten (Teil 5) und den Helfer-Zweig (Teil 4, ⚠️ siehe §2.1); die
  `.modulnav`-Reparatur (Teil 5, T105).
- Produces: die Zusagen aus §12.2, Zeile „Mobile Zusagen bei **390×844, 1280×720 und dazwischen
  (834×1112)**".

**Warum drei Breiten und nicht zwei** (§12.2, `docs/design/README.md:199-212`): „**wer nur die Enden
misst, prüft die Mitte nicht**; die Mitte ist jedes Tablet im Hochformat. Der Desktop-Lauf ist keine
Zugabe: ein Test, der nur bei 390px misst, kann eine `display:none`-Regel gar nicht widerlegen."

⚠️ **jsdom kann Media Queries strukturell nicht auswerten.** Ein Vitest, der „auf 390px ist X
unsichtbar" behauptet und dafür im DOM sucht, geht **immer** durch — er misst nichts, und der grüne
Balken ist eine Lüge. Diese Datei ist die einzige Stelle, an der die Aussage überhaupt entsteht.

⚠️ **Diese Datei überschneidet sich NICHT mit `e2e/lagerbuch-verwaltung.spec.ts`** (Teil 5, T150).
Dort steht die `scrollWidth`-Zusage bei 1280×720 gegen die `.modulnav`-Reparatur und die
`aria-current`-Zusage. Hier steht **nur**, was an mehreren Breiten gemessen wird.

- [ ] **Schritt 1: Die Spec schreiben**

```ts
import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

const HOST = "http://lagerbuch.localtest.me:3100";

/**
 * DREI BREITEN, NICHT ZWEI (Spec §12.2, docs/design/README.md:199-212).
 *
 * „Wer nur die Enden misst, prueft die Mitte nicht; die Mitte ist jedes Tablet
 * im Hochformat. Der Desktop-Lauf ist keine Zugabe: ein Test, der nur bei 390px
 * misst, kann eine display:none-Regel gar nicht widerlegen."
 *
 * jsdom kann Media Queries STRUKTURELL nicht auswerten — ein Vitest, der „auf
 * 390px ist X unsichtbar" behauptet, geht IMMER durch. Diese Datei ist die
 * einzige Stelle, an der die Aussage ueberhaupt entsteht.
 *
 * KEINE UEBERSCHNEIDUNG mit lagerbuch-verwaltung.spec.ts (Teil 5, T150): dort
 * stehen die aria-current-Zusage und die scrollWidth-Zusage bei 1280x720 gegen
 * die .modulnav-Reparatur. Hier steht nur, was an MEHREREN Breiten gemessen wird.
 */
const BREITEN = [
  { name: "Telefon", width: 390, height: 844 },
  { name: "Tablet hoch", width: 834, height: 1112 },
  { name: "Desktop", width: 1280, height: 720 },
] as const;

/** Die drei Seiten mit dem groessten Ueberlaufrisiko: die breiteste Tabelle, die
 *  Kachelreihe und der Etikettenbogen mit seinem festen Millimeterraster. */
const SEITEN = ["/verwaltung/artikel", "/verwaltung", "/verwaltung/etiketten"];

test.describe("Waagerechter Ueberlauf", () => {
  for (const b of BREITEN) {
    for (const pfad of SEITEN) {
      test(`${pfad} laeuft bei ${b.name} (${b.width}px) nicht ueber`, async ({ page }) => {
        await devLogin(page, { groups: ["lagerbuch_nutzer"] });
        await page.setViewportSize({ width: b.width, height: b.height });
        await page.goto(`${HOST}${pfad}`);

        /**
         * Das DOKUMENT darf nicht waagerecht scrollen. Breite Inhalte
         * (Tabellen) duerfen es sehr wohl — deshalb wird documentElement
         * gemessen und nicht der Tabellenrumpf. `Table` traegt dafuer
         * scroll={{ x: "max-content" }} (Teil 5, §2).
         */
        const ueberlauf = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(ueberlauf, `${pfad} bei ${b.width}px`).toBeLessThanOrEqual(0);
      });
    }
  }
});

test.describe("Tapflaechen und Feldschrift", () => {
  /**
   * §6.7.3 / §7.7.2: KEIN Eingabeelement unter 16px. Unter 16px zoomt iOS Safari
   * beim Fokus die ganze Seite — und zoomt nicht zurueck. Der Suite-Riegel
   * core/theme/feldschrift.test.ts hat dafuer zwei Luecken, und ein Quelltext-
   * Scan sieht ohnehin nur Deklarationen, nicht die aufgeloeste Kaskade.
   */
  test("kein Eingabefeld unter 16px bei 390px", async ({ page }) => {
    await devLogin(page, { groups: ["lagerbuch_nutzer"] });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${HOST}/verwaltung/artikel`);

    const zuKlein = await page.evaluate(() =>
      [...document.querySelectorAll("input, textarea, select")]
        .map((e) => ({
          tag: e.tagName,
          groesse: parseFloat(getComputedStyle(e).fontSize),
          typ: (e as HTMLInputElement).type ?? "",
        }))
        // Kontrollkaestchen und Schalter tragen keine Textgroesse.
        .filter((e) => !["checkbox", "radio", "hidden"].includes(e.typ))
        .filter((e) => e.groesse < 16),
    );
    expect(zuKlein).toEqual([]);
  });

  /**
   * §7.7.2: 44px Tapmass. Gemessen wird bei 390px, weil dort die Finger sind —
   * und auf einer Verwaltungsseite, weil der Helfer-Zweig seine eigene Zusage in
   * lagerbuch-helfer.spec.ts hat.
   */
  test("jede Zeilenaktion ist mindestens 44px hoch", async ({ page }) => {
    await devLogin(page, { groups: ["lagerbuch_nutzer"] });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${HOST}/verwaltung/bestellung`);

    const knoepfe = page.getByRole("button");
    const n = await knoepfe.count();
    expect(n, "die Seite muss Bedienelemente tragen").toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const k = knoepfe.nth(i);
      if (!(await k.isVisible())) continue;
      const box = await k.boundingBox();
      expect(box!.height, `Knopf ${i}`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("Der Etikettenbogen bei drei Breiten", () => {
  /**
   * Das Raster ist `repeat(auto-fill, 48.5mm)` — es bricht von selbst um. Der
   * Test belegt, dass die KACHEL ihre Millimeter behaelt: waere sie prozentual,
   * passte der Bogen zwar auf jeden Bildschirm und auf kein Etikettenblatt.
   */
  for (const b of BREITEN) {
    test(`Kachelbreite bleibt bei ${b.name} in Millimetern`, async ({ page }) => {
      await devLogin(page, { groups: ["lagerbuch_nutzer"] });
      await page.setViewportSize({ width: b.width, height: b.height });
      await page.goto(`${HOST}/verwaltung/etiketten`);

      const kachel = page.locator(".lb-etikett").nth(0);
      await expect(kachel).toBeVisible();
      const box = await kachel.boundingBox();
      // 48.5mm bei 96dpi ≈ 183.3px. Toleranz 2px fuer Rundung und Rahmen.
      expect(box!.width, `Kachel bei ${b.width}px`).toBeGreaterThan(181);
      expect(box!.width, `Kachel bei ${b.width}px`).toBeLessThan(186);
    });
  }

  /**
   * DIE ZEILE, DIE DEN SCHRUMPFENDEN QR FAENGT (§8.4, 8-I Punkt 2).
   *
   * `.lb-etikett` ist ein Flex-Container. Saesse `flex: none` am SVG statt am
   * Umschlag `.lb-etikettQr`, koennte der Umschlag schrumpfen — und ein LANGER
   * Artikelname draengte den Code unter 20mm. Genauso, wenn `text-overflow:
   * ellipsis` wirkungslos ist, weil die Textknoten inline geblieben sind: dann
   * gibt es nichts zu kuerzen, und der Text nimmt sich den Platz.
   *
   * Beides ist am Bildschirm nur an EINER Zahl zu sehen, und §8.4 sagt es
   * woertlich: „wird winzig, OHNE dass ein Test anschlaegt". Dieser Test ist der
   * Anschlag.
   *
   * ⚠️ DER SEED MUSS EINEN BEWUSST LANGEN ARTIKELNAMEN LIEFERN — sonst laeuft
   * der Fall durch, ohne den Schrumpfweg ueberhaupt zu belasten. Der Name steht
   * im Seed-Schritt aus Teil 3 (T60); reicht er nicht, wird er DORT verlaengert
   * und nicht hier umgangen.
   */
  test("der QR behaelt 20mm auch bei einem langen Artikelnamen", async ({ page }) => {
    await devLogin(page, { groups: ["lagerbuch_nutzer"] });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${HOST}/verwaltung/etiketten`);

    const namen = await page.locator(".lb-etikettTitel").allTextContents();
    const laengster = namen.reduce((a, b) => (b.length > a.length ? b : a), "");
    expect(laengster.length, "der Seed braucht einen langen Artikelnamen").toBeGreaterThan(28);
    const i = namen.indexOf(laengster);

    const qr = page.locator(".lb-etikettQr > svg").nth(i);
    const box = await qr.boundingBox();
    // 20mm bei 96dpi ≈ 75.6px. Toleranz nach unten 2px.
    expect(box!.width, "QR-Breite").toBeGreaterThan(74);
    expect(box!.height, "QR-Hoehe").toBeGreaterThan(74);

    /**
     * Und die zweite Haelfte derselben Ursache: Titel und Unterzeile stehen
     * UNTEREINANDER. Blieben sie inline, saessen sie nebeneinander — und
     * text-overflow:ellipsis waere wirkungslos.
     */
    const titel = await page.locator(".lb-etikettTitel").nth(i).boundingBox();
    const sub = await page.locator(".lb-etikettSub").nth(i).boundingBox();
    expect(sub!.y, "Unterzeile steht unter dem Titel").toBeGreaterThanOrEqual(
      titel!.y + titel!.height - 1,
    );
  });
});
```

⚠️ **Die 44px-Zusage kann an einer Zeilenaktion mit `size="small"` scheitern** — Teil 5 (§2) erlaubt
`size="small"` ausdrücklich **innerhalb einer Tabellenzeile**. Schlägt der Fall an einer solchen
Stelle fehl, wird der Selektor auf die Bedienleiste eingeengt (`page.getByRole("button")` unter
einem Container), **nicht** die Zusage gestrichen; der Grund gehört als Kommentar an die Zeile.

- [ ] **Schritt 2: Laufen lassen und committen**

```bash
pnpm exec playwright test e2e/lagerbuch-mobil.spec.ts
rtk git add e2e/lagerbuch-mobil.spec.ts
rtk git commit -m "test(lagerbuch): mobile Zusagen bei 390, 834 und 1280 Pixeln

Spec §12.2. Drei Breiten, nicht zwei: wer nur die Enden misst, prueft die Mitte
nicht, und die Mitte ist jedes Tablet im Hochformat. Der Desktop-Lauf ist keine
Zugabe — ein Test, der nur bei 390px misst, kann eine display:none-Regel gar
nicht widerlegen.

jsdom kann Media Queries strukturell nicht auswerten; ein Vitest, der \"auf
390px ist X unsichtbar\" behauptet, geht immer durch. Diese Datei ist die
einzige Stelle, an der die Aussage entsteht.

Gemessen wird der Ueberlauf des DOKUMENTS (breite Tabellen duerfen in ihrem
eigenen Container scrollen), die Feldschrift (kein Eingabeelement unter 16px —
darunter zoomt iOS Safari beim Fokus und zoomt nicht zurueck), das 44px-Tapmass
und die Kachelbreite des Etikettenbogens: waere sie prozentual, passte der Bogen
auf jeden Bildschirm und auf kein Etikettenblatt.

Keine Ueberschneidung mit lagerbuch-verwaltung.spec.ts (Teil 5, T150)."
```

### Task 171: `e2e/lagerbuch-helfer.spec.ts` — die vier Zusagen, die sonst niemand hat

**Files:**
- Create: `e2e/lagerbuch-helfer.spec.ts`

**Interfaces:**
- Consumes: **den ganzen Helfer-Weg aus Teil 4** — Gate (`page.tsx`), `t/[code]/route.ts`,
  `abmelden/route.ts`, `a/[artikelId]/page.tsx`, `helfer/page.tsx`, `helfer/check/page.tsx`; dazu
  `/verwaltung/journal` (Teil 5, T147) und `/verwaltung/tokens` (Teil 5, T148).
- Produces: die vier Zusagen aus §12.2 und §3.8.3, die **strukturell** in keinem anderen Gate
  sichtbar sind.

**⚠️ Dieser Task ist ohne einen ausgeführten Teil 4 nicht lauffähig** (§2.1). Er steht trotzdem
hier, weil die Datei bei Teil 4 nur **beansprucht**, nie **geschrieben** wurde (J2) — und weil eine
Zusicherung, die zwei Pläne später kommt, bei diesen vier keine Zusicherung ist, sondern eine
Hoffnung.

**Die vier Zusagen, jede mit dem Grund, warum nur ein echter Abruf sie zeigt:**

| Zusage | Warum nur E2E |
|---|---|
| Der Helfer-Weg am Stück: Code am Gate → `/helfer` → Entnahme → das Journal zeigt die **Token-Provenienz** (Label statt Person, roher Code im `title`) | Cookie über drei Routen, Rollen-Weiche im echten Request |
| **`/t/<code>` setzt das Cookie auf DEMSELBEN Host, auf dem die Landung passiert** (Falle 16) | „Der Mehrhost-Fall ist in Vitest nicht darstellbar; heute mockt `token-redeem.test.ts:3` die Basis-URL auf denselben Host wie der Testserver, **der Bruch ist per Konstruktion unsichtbar**." Diese Route hat heute **null** E2E (Falle 32) |
| **Ein gesperrter Code wird sofort abgewiesen — und die Person sieht eine deutsche Meldung, keinen Absturz** | ersetzt `lagerbuch/e2e/helfer-flow.spec.ts:56`, das wörtlich `/server-side exception/` verlangt — **dort ist der Absturz die erwartete Ausgabe** |
| **`aria-current="page"` landet an drei Einstiegen am richtigen Tab** (Falle 63) | Vitest ist hier **strukturell** blind: `core/shell/SuiteNav.test.tsx:48` mockt `usePathname`, und der Test sagt das über sich selbst (`:263-266`) |

- [ ] **Schritt 1: Die Spec schreiben**

```ts
import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";

const HOST = "http://lagerbuch.localtest.me:3100";
const DB = "./.data/e2e/lagerbuch.db";

/**
 * DER HELFER-WEG (Spec §7.12.4, §12.2, §12.5, §3.8.3).
 *
 * Vier Zusagen, die strukturell in keinem anderen Gate sichtbar sind — deshalb
 * ist diese Datei kein Zusatz, sondern der einzige Nachweis.
 *
 * KEIN .first() und kein defensiver Uebersprung (§12.3, Regeln 4 und 5).
 */

function tokenAus(bedingung: string): { id: string; code: string } {
  const db = new Database(DB, { readonly: true });
  const zeile = db
    .prepare(`select id, code from tokens where ${bedingung} limit 1`)
    .get() as { id: string; code: string };
  db.close();
  return zeile;
}

function sperre(id: string, aktiv: boolean) {
  const db = new Database(DB);
  db.prepare("update tokens set aktiv = ? where id = ?").run(aktiv ? 1 : 0, id);
  db.close();
}

test.describe("Der Weg am Stueck", () => {
  /**
   * §12.2: „Der Helfer-Weg am Stueck … das Journal zeigt die TOKEN-PROVENIENZ
   * (Label statt Person, roher Code im title)." Cookie ueber drei Routen,
   * Rollen-Weiche im echten Request — in Vitest nicht darstellbar.
   */
  test("Gate → Helfer → Entnahme → Journal mit Token-Provenienz", async ({ page }) => {
    const t = tokenAus("aktiv = 1");
    expect(t, "der Seed muss einen aktiven Code liefern").toBeTruthy();

    await page.goto(`${HOST}/`);
    await page.getByRole("textbox").fill(t.code);
    await page.getByRole("button", { name: /Weiter|Einlösen|Anmelden/ }).click();
    await page.waitForURL(/\/helfer/);

    await page.getByRole("link", { name: /Mullbinde/ }).click();
    await page.getByRole("spinbutton").fill("1");
    await page.getByRole("button", { name: /Entnahme buchen/ }).click();
    await expect(page.getByText(/gebucht/i)).toBeVisible();

    // Das Journal zeigt LABEL statt Person, mit dem rohen Code im title
    // (1:1-Pflicht 6, quelle.ts:20,23).
    const ctx = await page.context().browser()!.newContext();
    const admin = await ctx.newPage();
    const { devLogin } = await import("./fixtures");
    await devLogin(admin, { groups: ["lagerbuch_nutzer"] });
    await admin.goto(`${HOST}/verwaltung/journal`);
    const zeile = admin.getByRole("row", { name: /Mullbinde/ }).first();
    await expect(zeile).toContainText(/RTW|Regal|Token/);
    await expect(zeile.locator(`[title="${t.code}"]`)).toHaveCount(1);
    await ctx.close();
  });
});

test.describe("Falle 16 — /t/<code> setzt das Cookie auf DEMSELBEN Host", () => {
  /**
   * DIE ROUTE HAT HEUTE NULL E2E (Falle 32), und der Bruch ist in Vitest per
   * Konstruktion unsichtbar: token-redeem.test.ts:3 mockt die Basis-URL auf
   * denselben Host wie der Testserver.
   *
   * Weicht die konfigurierte Basis vom anfragenden Host ab, gilt das Cookie fuer
   * den einen Host und die Landung passiert auf dem anderen — die Helferin kommt
   * OHNE Sitzung am Gate an, waehrend der Code als benutzt markiert ist und
   * damit nicht mehr loeschbar (8-F).
   */
  test("antwortet 303 mit relativem Location und setzt das Cookie ohne Domain", async ({ page }) => {
    const t = tokenAus("aktiv = 1");

    const antworten: { status: number; location: string | null; setCookie: string | null }[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/t/")) {
        antworten.push({
          status: r.status(),
          location: r.headers()["location"] ?? null,
          setCookie: r.headers()["set-cookie"] ?? null,
        });
      }
    });

    await page.goto(`${HOST}/t/${t.code}`);

    const a = antworten[0];
    expect(a.status).toBe(303);
    // RELATIV: der Browser loest es gegen den Host auf, den er tatsaechlich
    // aufgerufen hat. `new URL(ziel, req.url)` waere falsch — req.url traegt
    // nach dem Rewrite die INTERNE Adresse.
    expect(a.location).toMatch(/^\//);
    expect(a.location).not.toMatch(/^https?:/);
    // OHNE Domain=: das Cookie ist host-only (§3.4).
    expect(a.setCookie).toContain("helfer_session=");
    expect(a.setCookie?.toLowerCase()).not.toContain("domain=");

    // Und die Landung passiert auf demselben Host.
    expect(page.url()).toContain("lagerbuch.localtest.me");
    await expect(page).toHaveURL(/\/(helfer|a\/)/);
  });

  /**
   * FALLE 60: ein ungueltiger Code landet mit einem GRUND am Gate, und das Gate
   * ZEIGT ihn. Heute haengt t/[code]/route.ts:21 `?err=code` an — und
   * (gate)/page.tsx:10 liest den Parameter NIE: wer ein Etikett scannt, dessen
   * Code gesperrt ist, landet WORTLOS auf dem Gate.
   */
  test("leitet einen ungueltigen Code mit sichtbarem Grund ans Gate", async ({ page }) => {
    await page.goto(`${HOST}/t/000-000`);
    await expect(page).toHaveURL(/\?grund=code/);
    await expect(page.getByText(/nicht erkannt|stimmt nicht|unbekannt/i)).toBeVisible();
  });
});

test.describe("Ein gesperrter Code — deutsche Meldung statt Absturz", () => {
  /**
   * ERSETZT lagerbuch/e2e/helfer-flow.spec.ts:56.
   *
   *   ALTE FASSUNG: `await expect(page.getByText(/server-side exception/))
   *                  .toBeVisible()` — der ABSTURZ ist dort die erwartete
   *                  Ausgabe, und :50-51 schreibt das selbst hin. Die Helferin
   *                  sieht eine englische Fehlerseite.
   *   NEUE FASSUNG: kein Erfolgs-Chip, sondern eine deutsche Sperrmeldung
   *                  (§11.5, Zustand 7).
   *
   * ⚠️ Wer die alte Zeile stehen laesst, konserviert den Ausfall; wer sie ohne
   * Begruendung streicht, verliert die Zusage „Sperren wirkt sofort" — die
   * serverseitige Haelfte liegt in _lib/helferZugang.test.ts und bleibt.
   */
  test("weist eine schreibende Aktion mit deutschem Text ab", async ({ page }) => {
    const t = tokenAus("aktiv = 1");
    await page.goto(`${HOST}/t/${t.code}`);
    await page.waitForURL(/\/helfer/);

    // Mitten in der Schicht gesperrt.
    sperre(t.id, false);

    await page.getByRole("link", { name: /Mullbinde/ }).click();
    await page.getByRole("spinbutton").fill("1");
    await page.getByRole("button", { name: /Entnahme buchen/ }).click();

    await expect(page.getByText(/server-side exception/i)).toHaveCount(0);
    await expect(
      page.getByText(/Dieses Kärtchen wurde gesperrt\. Die Buchung wurde nicht gespeichert\./),
    ).toBeVisible();

    sperre(t.id, true);   // Zustand zuruecksetzen: workers:1, eine DB
  });

  /**
   * §3.8.3: ein gesperrter Code blockt auch den LESEPFAD. Die Umleitung laeuft
   * ueber /abmelden — eine Server Component darf kein Cookie loeschen, und ohne
   * den Handler bliebe ein totes Cookie stehen.
   */
  test("schickt einen gesperrten Zugang ueber /abmelden ans Gate", async ({ page }) => {
    const t = tokenAus("aktiv = 1");
    await page.goto(`${HOST}/t/${t.code}`);
    await page.waitForURL(/\/helfer/);

    sperre(t.id, false);

    const antworten: { url: string; status: number; setCookie: string | null }[] = [];
    page.on("response", (r) =>
      antworten.push({ url: r.url(), status: r.status(), setCookie: r.headers()["set-cookie"] ?? null }),
    );
    await page.goto(`${HOST}/helfer`);
    await page.waitForURL(new RegExp(`^${HOST}/(\\?|$)`));

    // Die KETTE wird geprueft, nicht nur die Endadresse: sonst bliebe eine
    // ungeloeschte Cookie-Zeile gruen.
    const abmelden = antworten.find((a) => a.url.includes("/abmelden"));
    expect(abmelden, "der Weg muss ueber /abmelden laufen").toBeTruthy();
    expect(abmelden!.setCookie).toContain("Max-Age=0");
    expect(abmelden!.setCookie?.toLowerCase()).not.toContain("domain=");

    // Ein zweiter Aufruf landet ohne Umweg am Gate.
    await page.goto(`${HOST}/helfer`);
    await expect(page).toHaveURL(new RegExp(`^${HOST}/(\\?|$)`));

    sperre(t.id, true);
  });
});

test.describe("Falle 63 — aria-current an drei Einstiegen", () => {
  /**
   * VITEST IST HIER STRUKTURELL BLIND: core/shell/SuiteNav.test.tsx:48 mockt
   * usePathname, und der Test sagt das ueber sich selbst (:263-266). Die
   * vorhandene Messung steht gegen Next 16.2.6, die Suite faehrt 16.2.11, und
   * sie entstand per curl gegen einen Dev-Server OHNE Reverse-Proxy.
   *
   * Im Modul kommt usePathname gar nicht vor (§7.8.2) — die Aktivmarkierung ist
   * ein SERVER-Prop. Genau deshalb muss der Abruf zeigen, dass sie am richtigen
   * Tab landet, und zwar unter dem Rewrite und auf dem Modul-Host.
   */
  const EINSTIEGE = [
    { pfad: "/helfer", tab: /Entnahme/ },
    { pfad: "/helfer/check", tab: /Check/ },
  ];

  for (const e of EINSTIEGE) {
    test(`${e.pfad} markiert den richtigen Tab`, async ({ page }) => {
      const t = tokenAus("aktiv = 1");
      await page.goto(`${HOST}/t/${t.code}`);
      await page.goto(`${HOST}${e.pfad}`);

      const aktiv = page.locator('[aria-current="page"]');
      await expect(aktiv).toHaveCount(1);
      await expect(aktiv).toHaveText(e.tab);
    });
  }

  /** Der dritte Einstieg: ueber den Deep-Link, nicht ueber die Tab-Leiste. */
  test("/a/<id> markiert die Entnahme", async ({ page }) => {
    const t = tokenAus("aktiv = 1");
    await page.goto(`${HOST}/t/${t.code}`);

    const db = new Database(DB, { readonly: true });
    const a = db.prepare("select id from artikel where aktiv = 1 limit 1").get() as { id: string };
    db.close();

    await page.goto(`${HOST}/a/${a.id}`);
    const aktiv = page.locator('[aria-current="page"]');
    await expect(aktiv).toHaveCount(1);
    await expect(aktiv).toHaveText(/Entnahme/);
  });

  /** DIE GEGENRICHTUNG (Vorbild e2e/shell-mobil.spec.ts:288-324): ohne sie
   *  bewiese der Test nur, dass IRGENDWO ein aria-current steht. */
  test("markiert auf dem Gate gar nichts", async ({ page }) => {
    await page.goto(`${HOST}/`);
    await expect(page.locator('[aria-current="page"]')).toHaveCount(0);
  });
});

test.describe("§12.1 Punkt 1 — der gemeldete Verfall ueberlebt bis in die Datenbank", () => {
  /**
   * Die dritte Ebene der Aussage aus §12.1, Punkt 1. Die Unit-Haelfte besitzt
   * _lib/checkNutzlast.ts (Teil 3), die DOM-Haelfte _ui/CheckFlow.test.tsx
   * (Teil 4). Hier zaehlt nur: der im Zaehlschritt gemeldete Verfall steht
   * danach in checks.ergebnis.
   */
  test("ein im Check gemeldeter Verfall steht danach in checks.ergebnis", async ({ page }) => {
    const t = tokenAus("aktiv = 1");
    await page.goto(`${HOST}/t/${t.code}`);
    await page.goto(`${HOST}/helfer/check`);

    await page.getByRole("link", { name: /RTW|MTW|Fahrzeug/ }).first().click();
    await page.getByLabel(/Verfall/).first().fill("2026-09");
    await page.getByRole("button", { name: /Abschließen/i }).click();
    await expect(page.getByText(/abgeschlossen|gespeichert/i)).toBeVisible();

    const db = new Database(DB, { readonly: true });
    const check = db
      .prepare("select ergebnis from checks order by ts desc limit 1")
      .get() as { ergebnis: string };
    db.close();
    expect(check.ergebnis).toContain("2026-09");
  });
});
```

⚠️ **Die Selektoren dieses Tasks (`getByRole("textbox")` am Gate, „Entnahme buchen", „Abschließen")
stammen aus Teil 4 und sind hier nach der Spec benannt, nicht abgelesen.** Weicht das gebaute
Bauteil ab, wird **dieser Test** an die gerenderte Rolle angepasst — und die Anpassung wird einmal
**gegen das gerenderte Bauteil geprüft**, nicht gegen die Absicht (§12.3, Regel 2). Was nicht
verhandelbar ist, sind die **Aussagen**: 303, relatives `Location`, kein `Domain=`, deutsche
Sperrmeldung statt Absturz, genau ein `aria-current`.

- [ ] **Schritt 2: Laufen lassen und committen**

```bash
pnpm exec playwright test e2e/lagerbuch-helfer.spec.ts
rtk git add e2e/lagerbuch-helfer.spec.ts
rtk git commit -m "test(lagerbuch): der Helfer-Weg am Stueck — vier Zusagen ohne Ersatz

Spec §7.12.4, §12.2, §12.5, §3.8.3. Festlegung J2: Teil 4 hat die Datei in E11
beansprucht, aber keine Task dafuer geschrieben — eine Zusicherung, die nirgends
steht, ist keine.

1. Falle 16: /t/<code> antwortet 303 mit RELATIVEM Location und setzt das Cookie
   ohne Domain=. Der Bruch ist in Vitest per Konstruktion unsichtbar
   (token-redeem.test.ts:3 mockt die Basis-URL auf denselben Host wie der
   Testserver), und die Route hat heute null E2E (Falle 32).
2. Falle 60: ein ungueltiger Code landet mit sichtbarem Grund am Gate. Heute
   haengt route.ts:21 ?err=code an, und das Gate liest den Parameter nie.
3. §11.5 Zustand 7: ein gesperrter Code gibt eine DEUTSCHE Meldung, keinen
   Absturz. Ersetzt helfer-flow.spec.ts:56, das woertlich
   /server-side exception/ verlangt — dort ist der Absturz die erwartete
   Ausgabe. Beide Fassungen stehen im Testkommentar nebeneinander (§12.3 R3).
4. Falle 63: genau ein aria-current, am richtigen Tab, an drei Einstiegen —
   plus die Gegenrichtung auf dem Gate. Vitest ist hier strukturell blind
   (SuiteNav.test.tsx:48 mockt usePathname und sagt es ueber sich selbst).

Dazu die E2E-Haelfte von §12.1 Punkt 1: der gemeldete Verfall ueberlebt bis in
checks.ergebnis."
```

### Gate nach Welle 5

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build && pnpm exec playwright test
```

---

## Welle 6 — Die Zählungen und die Abgleiche (3 Tasks, alle parallel)

Drei Abnahme-Tasks. Sie sind von Anfang an grün, wenn alles davor stimmt — und **das ist ihr Zweck**.
Statt „Rot, weil …" nennt jeder die **Mutation**, die er fängt.

### Task 172: `_actions/guards.test.ts` bekommt die ZÄHLUNG

**Files:**
- Modify: `src/app/m/lagerbuch/_actions/guards.test.ts` (**ERGÄNZT**, Teil 2 T20)

**Interfaces:**
- Consumes: nichts — die Datei liest den **Quelltext** des Ordners `_actions/`.
- Produces: die Zusage „**47 Actions in 18 Dateien, 44 bewacht, 3 auf der Ausnahmeliste, 19
  Verzeichniseinträge**". Damit wird aus der Eigenschaftsform von Teil 2 eine **Zählung**, und aus
  „44 von 44" hört auf, eine Absichtserklärung zu sein.

**Abnahme, nicht TDD.** Die Mutation, die dieser Task fängt: **eine Action, die es gar nicht erst in
den Ordner geschafft hat.** Die Eigenschaftsform aus Teil 2 prüft jede Datei, die **da ist** — eine
vergessene Datei ist für sie unsichtbar. Erst die Zahl macht das Fehlen sichtbar. Umgekehrt fängt sie
eine **zusätzliche** Ausnahme: „wächst die Liste, ist das ein roter Test und keine Zeile im Diff"
(§3.8.2).

**Warum die Zählung erst JETZT kommt und nicht in Teil 2** (F4). Ein Scan, der `toHaveLength(44)` von
Anfang an behauptet, ist **am ersten Tag rot** — und ein am ersten Tag roter Scan wird abgeschaltet
statt repariert. Teil 2 hat deshalb die Eigenschaft geschrieben und toleriert ein leeres `_actions/`;
seine Zähne bekommt er hier.

**Die Zahlen und ihre Herleitung stehen in §4 dieses Plans.** ⚠️ **Sie werden NICHT aus den Angaben
von Teil 4 oder Teil 5 übernommen** — beide rechnen falsch, und §4.2 löst das namentlich auf.

- [ ] **Schritt 1: Die Zählung anhängen**

An `src/app/m/lagerbuch/_actions/guards.test.ts`:

```ts
/**
 * DIE ZAEHLUNG (Teil 1, F4; Spec §2.1 a, §3.8.2).
 *
 * Teil 2 hat diese Datei in der EIGENSCHAFTSform angelegt: „jede exportierte
 * Action beginnt mit requireLagerbuchAdmin() oder requireHelferSchreibend() —
 * oder steht auf der Ausnahmeliste". Genau so konnte ab dem ersten Commit keine
 * Action ungeschuetzt landen, und der Scan war am ersten Tag GRUEN, weil er ein
 * leeres _actions/ toleriert.
 *
 * WAS DIE EIGENSCHAFT NICHT SIEHT: eine Action, die es gar nicht erst in den
 * Ordner geschafft hat. Sie prueft jede Datei, die DA ist. Erst die Zahl macht
 * das Fehlen sichtbar — und eine ZUSAETZLICHE Ausnahme ebenso: „waechst die
 * Liste, ist das ein roter Test und keine Zeile im Diff" (§3.8.2).
 *
 * DIE ZAHLEN SIND HERGELEITET, NICHT UEBERNOMMEN. Sollliste ist die Abbildung
 * Alt→Neu aus Spec §2.1 a (16 Alt-Dateien mit 44 Exporten, dazu gate.ts und
 * sitzung.ts mit 3 Ausnahmen):
 *
 *   artikel 3 · aussondern 1 · bestellung 1 · buchung 3 · bz 4 · check 1 ·
 *   csv 1 · detail 1 · fahrzeuge 5 · geraete 3 · inventur 1 ·
 *   lagerortVerfall 1 · loeschen 3 · sauerstoff 3 · templates 11 · tokens 2
 *   = 44
 *   + gate 1 + sitzung 2 = 47,  davon 44 bewacht + 3 Ausnahmen
 *   18 Action-Dateien + guards.test.ts = 19 Verzeichniseintraege
 *
 * ⚠️ Teil 5 §6 nennt „14 Dateien mit 32 Actions" und Teil 4 E10 „4 Dateien mit
 * 5 Exporten" — beides sind Rechenfehler. Teil 5 baut 15 Dateien mit 43
 * Deklarationen (seine eigene Zuordnungstabelle hat 43 Zeilen), und Teil 4s
 * buchung.ts ist durch H7 vollstaendig an Teil 5 gegangen. Aufgeloest in
 * Plan-Teil 6, §4.2.
 */
describe("Zaehlung (§2.1 a)", () => {
  /** Die Sollliste, Datei fuer Datei. Sie steht HIER und nicht im Modul — sonst
   *  prueft der Test den Code gegen sich selbst und bliebe auch bei einer
   *  fehlenden Datei gruen. */
  const SOLL: Record<string, number> = {
    "artikel.ts": 3,
    "aussondern.ts": 1,
    "bestellung.ts": 1,
    "buchung.ts": 3,
    "bz.ts": 4,
    "check.ts": 1,
    "csv.ts": 1,
    "detail.ts": 1,
    "fahrzeuge.ts": 5,
    "gate.ts": 1,
    "geraete.ts": 3,
    "inventur.ts": 1,
    "lagerortVerfall.ts": 1,
    "loeschen.ts": 3,
    "sauerstoff.ts": 3,
    "sitzung.ts": 2,
    "templates.ts": 11,
    "tokens.ts": 2,
  };

  const AUSNAHMEN = ["einloesenAmGate", "erneuereSitzung", "beenden"];

  it("hat 18 Action-Dateien und 19 Verzeichniseintraege", () => {
    const eintraege = readdirSync(ACTIONS).sort();
    expect(eintraege).toHaveLength(19);
    // guards.test.ts ueberspringt sich selbst — das ist der 19. Eintrag.
    expect(eintraege).toContain("guards.test.ts");
    expect(eintraege.filter((e) => e !== "guards.test.ts")).toEqual(Object.keys(SOLL).sort());
  });

  it("hat je Datei genau so viele Deklarationen wie die Sollliste sagt", () => {
    for (const [datei, n] of Object.entries(SOLL)) {
      expect(actionsIn(datei), datei).toHaveLength(n);
    }
  });

  /**
   * GEZAEHLT WIRD JE DATEI JE DEKLARATION, NIE UEBER EIN SET DER NAMEN.
   * geraetSpeichern, setGeraetAktiv und geraetZuBarcode stehen in bz.ts UND in
   * geraete.ts — gleicher Name, verschiedene Tabellen (bz_geraete gegen
   * geraete), verschiedene Felder. Ein Set ergaebe 41 statt 44. Die beiden
   * Dateien werden NICHT zusammengelegt.
   */
  it("zaehlt 47 Deklarationen, obwohl es nur 44 verschiedene Namen gibt", () => {
    const alle = Object.keys(SOLL).flatMap((d) => actionsIn(d));
    expect(alle).toHaveLength(47);
    expect(new Set(alle).size).toBe(44);   // drei Namensdubletten
  });

  it("bewacht 44 und listet genau 3 Ausnahmen", () => {
    const alle = Object.keys(SOLL).flatMap((d) =>
      actionsIn(d).map((name) => ({ datei: d, name })),
    );
    const ausnahmen = alle.filter((a) => AUSNAHMEN.includes(a.name));
    expect(ausnahmen).toHaveLength(3);
    expect(alle.length - ausnahmen.length).toBe(44);
  });

  it("nennt die drei Ausnahmen namentlich und in ihren Dateien", () => {
    expect(actionsIn("gate.ts")).toEqual(["einloesenAmGate"]);
    expect(actionsIn("sitzung.ts").sort()).toEqual(["beenden", "erneuereSitzung"]);
  });

  /**
   * `export type` IST KEINE ACTION. detail.ts exportiert neben getDetail DREI
   * Typen (ArtikelDetailCharge, ArtikelDetailBuchung, ArtikelDetailResult). Wer
   * sie mitzaehlt, liest drei ungeschuetzte Actions, die keine sind — und
   * „repariert" dann drei Typdeklarationen mit einem Riegel.
   */
  it("verwirft export type und export interface", () => {
    const quelle = readFileSync(join(ACTIONS, "detail.ts"), "utf8");
    expect(quelle.match(/export\s+type\s+\w+/g) ?? []).toHaveLength(3);
    expect(actionsIn("detail.ts")).toEqual(["getDetail"]);
  });

  /**
   * EXPORTIERTE KONSTANTEN SIND KEINE ACTIONS. T160 hat tokens.ts um
   * TOKEN_ALPHABET/TOKEN_ZIFFERN/TOKEN_ZIEHUNGEN und loeschen.ts um
   * TOKEN_LOESCHGRUND ergaenzt. Laeuft die Zaehlung auf 51 statt 47, ist der
   * Scan zu grob — er muss `export const` verwerfen, das keine Funktion ist.
   */
  it("verwirft exportierte Konstanten", () => {
    expect(actionsIn("tokens.ts").sort()).toEqual(["createToken", "setTokenAktiv"]);
    expect(actionsIn("loeschen.ts").sort())
      .toEqual(["deaktiviereElement", "loescheElement", "pruefeLoeschbar"]);
  });

  /**
   * DREI DER 44 LESEN NUR UND BLEIBEN TROTZDEM ACTIONS: getDetail,
   * pruefeLoeschbar und geraetZuBarcode (zweimal, je Datei). Sie stehen hier und
   * nicht unter _lib/lesepfade/, weil ihr einziger Aufrufer jeweils eine
   * Client-Insel ist (§2.1 a, Punkt 4). Sie zaehlen mit und tragen einen Riegel.
   */
  it("zaehlt die drei nur lesenden Actions mit", () => {
    for (const [datei, name] of [
      ["detail.ts", "getDetail"],
      ["loeschen.ts", "pruefeLoeschbar"],
      ["geraete.ts", "geraetZuBarcode"],
      ["bz.ts", "geraetZuBarcode"],
    ] as const) {
      expect(actionsIn(datei), `${datei}#${name}`).toContain(name);
    }
  });

  /** 42 tragen requireLagerbuchAdmin, 2 requireHelferSchreibend. */
  it("verteilt die 44 Riegel auf 42 Admin und 2 Helfer", () => {
    const helfer: string[] = [];
    for (const datei of Object.keys(SOLL)) {
      const quelle = readFileSync(join(ACTIONS, datei), "utf8");
      for (const name of actionsIn(datei)) {
        if (AUSNAHMEN.includes(name)) continue;
        const rumpf = rumpfVon(quelle, name);
        if (rumpf.includes("requireHelferSchreibend")) helfer.push(`${datei}#${name}`);
      }
    }
    expect(helfer.sort()).toEqual([
      "buchung.ts#bucheEntnahmeHelfer",
      "check.ts#checkAbschluss",
    ]);
  });
});
```

⚠️ **`ACTIONS`, `actionsIn(datei)` und `rumpfVon(quelle, name)` stammen aus Teil 2, T20.** Fehlt
`rumpfVon`, wird der Helfer **dort** ergänzt — es entsteht **keine zweite Scan-Datei** und kein
zweiter Parser.

- [ ] **Schritt 2: Laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/guards.test.ts
```

⚠️ **Ohne einen ausgeführten Teil 4 ist dieser Test ROT**, und zwar korrekt: es fehlen `gate.ts`,
`sitzung.ts` und `check.ts` (3 Dateien, 4 Deklarationen). **Das ist der Befund, nicht der Fehler.**
Er wird gemeldet, nicht durch Absenken der Zahlen geheilt.

- [ ] **Schritt 3: Drei Gegenproben fahren**

```bash
# 1) Eine Action entfernen -> die Zahl faellt
# 2) Eine vierte Ausnahme eintragen -> "listet genau 3 Ausnahmen" faellt
# 3) Die Zaehlung auf ein Set umstellen -> 41 statt 44, "47 Deklarationen" faellt
```

Jede der drei wird einmal von Hand gefahren und der rote Lauf protokolliert. **Die dritte ist die
wichtigste**: sie belegt, dass der Scan die Namensdubletten wirklich je Datei zählt und nicht bloß
zufällig auf 47 kommt.

- [ ] **Schritt 4: Commit**

```bash
rtk git add src/app/m/lagerbuch/_actions/guards.test.ts
rtk git commit -m "test(lagerbuch): der Guard-Scan zaehlt jetzt — 47 = 44 + 3 in 18 Dateien

Teil 1, F4; Spec §2.1 a und §3.8.2. Teil 2 hat die Eigenschaftsform angelegt
(„jede exportierte Action beginnt mit einem Riegel oder steht auf der
Ausnahmeliste\") und toleriert ein leeres _actions/ — so konnte ab dem ersten
Commit keine Action ungeschuetzt landen, ohne dass der Scan am ersten Tag rot war.

Was die Eigenschaft nicht sieht: eine Action, die es gar nicht erst in den Ordner
geschafft hat. Erst die Zahl macht das Fehlen sichtbar — und eine zusaetzliche
Ausnahme ebenso.

Die Zahlen sind HERGELEITET aus der Sollliste in Spec §2.1 a, nicht aus den
Angaben der Zuliefererplaene: Teil 5 nennt „14 Dateien mit 32 Actions\" (es sind
15 mit 43, seine eigene Tabelle hat 43 Zeilen), Teil 4 nennt „4 Dateien mit 5
Exporten\" (es sind 3 mit 4 — buchung.ts ist durch H7 vollstaendig an Teil 5
gegangen). Beides aufgeloest in Plan-Teil 6, §4.2.

Drei Fallstricke sind einzeln bewacht: je Datei je Deklaration zaehlen (ein Set
ergaebe 41), export type verwerfen (detail.ts hat drei Typen), und exportierte
Konstanten verwerfen (T160 hat vier hinzugefuegt).

Drei Gegenproben gefahren: Action entfernt, vierte Ausnahme eingetragen,
Zaehlung auf ein Set umgestellt — jede faerbt den Test rot."
```

### Task 173: `_lib/bauform.test.ts` — die Weichen-Zeile wird verschärft

**Files:**
- Modify: `src/app/m/lagerbuch/_lib/bauform.test.ts` (**ERGÄNZT**, Teil 2 T21)

**Interfaces:**
- Consumes: nichts — die Datei liest den **Quelltext** des ganzen Modulbaums.
- Produces: die Verschärfung der Weichen-Zeile von „falls die Datei existiert" auf „**die drei
  Dateien existieren und tragen die Regel**".

**Abnahme, nicht TDD. Die Mutation, die dieser Task fängt:** eine **gelöschte** Weichen-Datei. Die
Eigenschaftsform aus Teil 2 prüft jede der drei Dateien, die **da ist**; verschwindet eine, bleibt
der Scan **grün**. Genau das ist der Zustand, in dem `/a/<id>` oder `/g/<code>` plötzlich über einen
anderen Weg beantwortet wird.

**Warum die Verschärfung erst hier kommt** (Teil 4, E9). Sie behauptet die **Existenz** der drei
Weichen-Dateien — `page.tsx` (Gate), `a/[artikelId]/page.tsx` und `g/[code]/page.tsx`. Die ersten
beiden entstehen in Teil 4, die dritte in **diesem** Plan (T164). Teil 4 hat sich selbst nur die
ersten beiden zugetraut („die Verschärfung nennt nur ZWEI der drei Dateien … `g/[code]/page.tsx`
entsteht erst in Teil 6; sie bleibt bis dahin in der Eigenschaftsform und wird von **Teil 6** in die
Existenzpflicht überführt"). ⚠️ **Da Teil 4 keine Tasks trägt (§2.1), übernimmt dieser Task die
GANZE Verschärfung** — inklusive des `usePathname`-Scans, den E9 an T64 vergeben hatte.

- [ ] **Schritt 1: Prüfen, was Teil 2 und Teil 4 hinterlassen haben**

```bash
grep -n "usePathname\|Weiche\|weichen" src/app/m/lagerbuch/_lib/bauform.test.ts
grep -n "use client" src/app/m/lagerbuch/_lib/bauform.test.ts
```

⚠️ **Die zweite Zeile prüft die REICHWEITE des `"use client"`-Scans, und daran hängt `error.tsx`.**
Teil 2 (T21) hat ihn laut seinem `Produces`-Block auf **`_lib`/`_db`** begrenzt — dann ist alles gut.
**Läuft er über den ganzen Modulbaum**, schlägt er ab T163 an: `error.tsx` **muss** `"use client"` in
Zeile 1 tragen (Next verlangt das für jede Fehlergrenze, §11.2), und sie ist die **einzige** solche
Datei außerhalb von `_ui/`. In diesem Fall **erweitert dieser Task den Scan um genau diese eine
benannte Ausnahme** — mit der Begründung im Kommentar, nicht als stille Pfadliste. Eine zweite
Scan-Datei entsteht auch dann nicht.

- **Ist der `usePathname`-Scan schon da** (Teil 4, T64), bleibt er unangetastet und dieser Task
  ergänzt nur die Existenzpflicht.
- **Fehlt er**, legt dieser Task ihn mit an (Schritt 3). ⚠️ **Er gehört inhaltlich zu §7.8.2 und
  damit zu Teil 4; er entsteht hier nur, weil er sonst keinen Eigentümer hat.** Das gehört in den
  Commit-Text.

- [ ] **Schritt 2: Die Verschärfung schreiben**

```ts
/**
 * DIE DREI WEICHEN-DATEIEN — VERSCHAERFT (Teil 2 T21; Teil 4 E9; §3.8.2).
 *
 * Teil 2 hat die Regel in der Eigenschaftsform angelegt: „falls die Datei
 * existiert, traegt sie requireLagerbuchHost als erste Anweisung und weder
 * requireLagerbuchAdmin noch requireHelferSitzung". Ab jetzt gilt: DIE DREI
 * DATEIEN EXISTIEREN.
 *
 * WAS DIE EIGENSCHAFTSFORM NICHT SIEHT: eine GELOESCHTE Weichen-Datei. Sie
 * prueft jede Datei, die da ist — verschwindet eine, bleibt sie gruen. Genau das
 * ist der Zustand, in dem /a/<id> oder /g/<code> ploetzlich ueber einen anderen
 * Weg beantwortet wird.
 *
 * WARUM DIE REGEL UEBERHAUPT ZAEHLT (§3.2.1): ein Riegel in einer dieser drei
 * Dateien schickt JEDEN ANONYMEN SCAN nach /login statt aufs Gate — der Ausfall,
 * gegen den requiresAuth:false gebaut ist (§11.5, Zustand 18). Der Fehler ist
 * typkorrekt, lint-sauber und fuer pnpm build unsichtbar; ein E2E faende ihn nur
 * mit einem Abruf OHNE Cookie.
 */
const WEICHEN = [
  "page.tsx",                  // das Gate            (Teil 4)
  "a/[artikelId]/page.tsx",    // Regaletikett        (Teil 4)
  "g/[code]/page.tsx",         // Barcode-Deep-Link   (Teil 6, T164)
];

describe("Die drei Rollen-Weichen existieren und tragen die Regel", () => {
  it.each(WEICHEN)("%s existiert", (rel) => {
    expect(existsSync(join(MODUL, rel)), `${rel} fehlt`).toBe(true);
  });

  it.each(WEICHEN)("%s ruft requireLagerbuchHost als erste Anweisung", (rel) => {
    const quelle = readFileSync(join(MODUL, rel), "utf8");
    const rumpf = quelle.slice(quelle.indexOf("export default"));
    const erste = rumpf
      .split("\n")
      .map((z) => z.trim())
      .find((z) => z.length > 0 && !z.startsWith("export default") && !z.startsWith("//")
                   && !z.startsWith("*") && !z.startsWith("/*") && !z.startsWith("}")
                   && !z.startsWith("params") && !z.startsWith("{"));
    expect(erste, rel).toContain("requireLagerbuchHost");
  });

  it.each(WEICHEN)("%s traegt KEINEN Riegel", (rel) => {
    const quelle = readFileSync(join(MODUL, rel), "utf8");
    expect(quelle, rel).not.toContain("requireLagerbuchAdmin");
    expect(quelle, rel).not.toContain("requireHelferSitzung");
    // ...und dafuer das nicht-werfende Paar (§2.1, „ZWEI FORMEN, EINE REGEL").
    expect(
      quelle.includes("istLagerbuchAdmin") || quelle.includes("helferZugangOderNull"),
      `${rel} braucht ein Praedikat statt eines Riegels`,
    ).toBe(true);
  });
});

/**
 * §7.8.2: usePathname kommt unter src/app/m/lagerbuch/ NUR in
 * _ui/useUrlFilter.ts vor. Die Aktivmarkierung des Helfer-Wegs ist ein
 * SERVER-Prop (Falle 63) — ein DOM-Test muesste next/navigation mocken und
 * bewiese damit nichts (SuiteNav.test.tsx:263-266 sagt das ueber sich selbst).
 *
 * ⚠️ Dieser Scan gehoert inhaltlich zu Teil 4 (E9, T64). Er steht hier, weil er
 * dort keinen Eigentuemer bekommen hat.
 */
describe("usePathname (§7.8.2)", () => {
  it("kommt nur in _ui/useUrlFilter.ts vor", () => {
    const treffer = alleQuellen()
      .filter((d) => readFileSync(d, "utf8").includes("usePathname"))
      .map((d) => relative(MODUL, d));
    expect(treffer).toEqual(["_ui/useUrlFilter.ts"]);
  });
});
```

⚠️ **`MODUL`, `alleQuellen()`, `existsSync`, `relative` stammen aus Teil 2, T21.** Fehlt ein Helfer,
wird er **dort** ergänzt — es entsteht **keine zweite Scan-Datei** (Festlegung G2 aus Teil 2).

- [ ] **Schritt 3: Laufen lassen und die Gegenprobe fahren**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```

Gegenprobe: `g/[code]/page.tsx` **umbenennen** (nicht löschen) → der Fall „`g/[code]/page.tsx`
existiert" wird rot. Danach zurückbenennen. **Die Eigenschaftsform aus Teil 2 wäre bei genau dieser
Mutation grün geblieben** — das ist der ganze Gewinn dieses Tasks.

- [ ] **Schritt 4: Commit**

```bash
rtk git add src/app/m/lagerbuch/_lib/bauform.test.ts
rtk git commit -m "test(lagerbuch): die drei Rollen-Weichen MUESSEN existieren

Teil 2, T21 (Eigenschaftsform) und Teil 4, E9 (Verschaerfung). Teil 4 traegt
keine Tasks (Plan-Teil 6, §2.1), deshalb uebernimmt dieser Task die ganze
Verschaerfung — einschliesslich des usePathname-Scans aus §7.8.2, der dort
keinen Eigentuemer bekommen hat.

Die Mutation, die er faengt: eine GELOESCHTE Weichen-Datei. Die Eigenschaftsform
prueft jede Datei, die da ist; verschwindet eine, bleibt sie gruen — und genau
das ist der Zustand, in dem /a/<id> oder /g/<code> ploetzlich ueber einen anderen
Weg beantwortet wird.

Warum die Regel zaehlt: ein Riegel in einer der drei Dateien schickt jeden
anonymen Scan nach /login statt aufs Gate, also genau den Ausfall, gegen den
requiresAuth:false gebaut ist. Der Fehler ist typkorrekt, lint-sauber und fuer
build unsichtbar.

Gegenprobe gefahren: g/[code]/page.tsx umbenannt -> rot. Die Eigenschaftsform
waere bei genau dieser Mutation gruen geblieben."
```

### Task 174: Der namentliche Abgleich der sieben Aussagen aus §12.1

**Files:**
- keine (nur Ausführung und Protokoll)

**Interfaces:**
- Consumes: die Tabelle aus §8 dieses Plans.
- Produces: die Aussage „**für jede der sieben Aussagen ohne Netz existiert ein benannter
  Nachfolger**" — und zwar, **bevor** die alte Spec fällt.

**Abnahme, nicht TDD. Die Mutation, die dieser Task fängt:** ein **grüner Nachfolgetest, der etwas
anderes prüft als vorher**. §12.3, Regel 3 ist dazu wörtlich: „Ein neu geschriebener Nachfolgetest,
der grün läuft und etwas anderes prüft als vorher, ist **schlimmer als ein roter**." Ein roter Test
wird bemerkt; ein grüner, der die Aussage verloren hat, wird abgehakt.

**Warum kein automatischer Test.** Die Aussage „dieser Test prüft dasselbe wie jener" ist keine, die
sich mechanisch prüfen lässt — sie verlangt ein Lesen beider Fassungen. Was **mechanisch** geht, ist
die **Existenz** des Nachfolgers unter seinem Namen, und die wird hier gegriffen.

- [ ] **Schritt 1: Jede der sieben namentlich nachweisen**

```bash
# 1 — Verfallsfeld im Zaehlschritt → Nutzlast
grep -rn "zaehleAblaufende\|checkNutzlast" src/app/m/lagerbuch/_lib/checkNutzlast.test.ts
grep -rn "laufen ab\|Verfall" src/app/m/lagerbuch/_ui/CheckFlow.test.tsx
grep -n "checks.ergebnis" e2e/lagerbuch-helfer.spec.ts

# 2 — clientseitiger Artikelfilter (Name, Fach UND Chargennummer)
grep -n "artikelTrifft\|chargenNr" src/app/m/lagerbuch/_lib/artikelFilter.test.ts
grep -n "Kopplung Filter" src/app/m/lagerbuch/_lib/bestandExport.test.ts

# 3 — Entprellung und der committedQ-Tanz
grep -n "committedQ\|debounce\|useFakeTimers" src/app/m/lagerbuch/_ui/filter.test.tsx
grep -n "?q=" e2e/lagerbuch-verwaltung.spec.ts

# 4 — negatives Journal-Delta
grep -n "journalZeile\|mengeText" src/app/m/lagerbuch/_lib/journalZeile.test.ts
grep -rn "Δ\|delta" "src/app/m/lagerbuch/verwaltung/(arbeit)/journal/"

# 5 — Chip `bestellt` als Zeilenzustand, von der Fussnote getrennt
grep -rn "bestellt seit" "src/app/m/lagerbuch/verwaltung/(arbeit)/bestellung/"

# 6 — „Endgueltig loeschen" bleibt gesperrt, bis der Name exakt getippt ist
grep -n "disabled" src/app/m/lagerbuch/_ui/LoeschDialog.test.tsx

# 7 — der QR-Traeger
grep -n "lb-etikettQr" "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenBogen.test.tsx"
```

**Jede Zeile muss mindestens einen Treffer liefern.** Ein leerer Treffer ist ein **Befund**, kein
Anlass, die Zeile zu streichen.

- [ ] **Schritt 2: Je Aussage die alte Fassung danebenlegen und den Unterschied benennen**

Für jede der sieben wird protokolliert, was **die alte Fassung prüfte** und was **die neue prüft**.
Vier Fälle sind vorab benannt, weil dort die Aussage sich **absichtlich verschiebt** und ein blindes
Abhaken sie verlöre:

| # | Verschiebung | Warum sie richtig ist |
|---|---|---|
| 2 | Die alte Spec probiert **nur den Namen**; das Prädikat sucht über Name, Fach **und** Chargennummer (`ArtikelTable.tsx:119`) | Der Nachfolger prüft **alle drei** Felder — die alte Fassung war unvollständig, nicht der Neubau großzügig |
| 4 | Die alte Fassung greift `.jdelta.minus`, also eine **Klasse**; die neue prüft das **Vorzeichen im Text** | ⚠️ Die Zusicherung nennt **NIE einen Hexwert**. Ob Rot auf dieser Datenfläche bleiben darf, entscheidet Entscheidung 30 (§6.6.2 — und sie entscheidet **Ampel**-Rot `#8c0d16`, nicht Suite-Rot); ein Test, der `#c8000f` festnagelt, entscheidet sie **versehentlich mit** |
| 5 | Der Text ändert sich zu „bestellt seit &lt;Datum&gt;" (§5.5) | Die Zusicherung wandert **mit** dem Text, nicht gegen ihn — `exact: true` trennt weiterhin den Zeilenzustand von der Fußnote |
| 7 | Der Träger wechselt von `<img src="data:…">` auf ein eingesetztes `<svg>` (8-I) | Die Aussage bleibt „so viele Kacheln wie Datensätze, jede mit einem Code"; was die alte Fassung **nie** prüfte — den **Inhalt** — besitzt jetzt `_db/etiketten.test.ts` **mit Dekodierung** |

- [ ] **Schritt 3: Die drei Ebenen je Aussage abhaken**

§12.1 verlangt für Punkt 1 **drei** Ebenen (Unit, DOM, E2E) und für Punkt 2 **zwei**. Die Tabelle in
§8 dieses Plans führt sie; hier wird abgehakt:

- [ ] **1** Unit ✅ `_lib/checkNutzlast.test.ts` · DOM ⚠️ Teil 4 · E2E ✅ T171
- [ ] **2** Unit ✅ `_lib/artikelFilter.test.ts` · Kopplung ✅ T156, Schritt 6
- [ ] **3** DOM ✅ Teil 5, T109 · E2E ✅ Teil 5, T150
- [ ] **4** Unit ✅ Teil 3 · DOM ✅ Teil 5, T147
- [ ] **5** DOM ✅ Teil 5, T145
- [ ] **6** DOM ✅ Teil 5, T110
- [ ] **7** DOM ✅ T162, Schritt 5

- [ ] **Schritt 4: Das Protokoll committen**

```bash
rtk git commit --allow-empty -m "chore(lagerbuch): §12.1 abgeglichen — sieben Aussagen, sieben benannte Nachfolger

Spec §12.1 und §12.3, Regel 3. Fuer jede der sieben Zusicherungen ohne Netz ist
ein ersetzender Test geschuldet, BEVOR die alte Spec faellt — und ein neu
geschriebener Nachfolger, der gruen laeuft und etwas anderes prueft als vorher,
ist schlimmer als ein roter: ein roter wird bemerkt, ein gruener wird abgehakt.

Fuenf der sieben hatten schon einen Eigentuemer (Teil 3 und Teil 5); zwei sind in
diesem Plan entstanden (die Export/Filter-Kopplung in T156, der QR-Traeger in
T162), dazu die E2E-Haelfte von Punkt 1 in T171.

Vier Verschiebungen sind ausdruecklich protokolliert statt stillschweigend
vollzogen: Punkt 2 prueft jetzt alle DREI Suchfelder (die alte Fassung war
unvollstaendig), Punkt 4 prueft das Vorzeichen im Text statt einer Klasse und
nennt NIE einen Hexwert (sonst entschiede er Entscheidung 30 versehentlich mit),
Punkt 5 wandert mit dem geaenderten Text, Punkt 7 wechselt den Traeger von <img>
auf <svg>.

Kein automatischer Test: „dieser Test prueft dasselbe wie jener\" laesst sich
nicht mechanisch pruefen. Was mechanisch geht — die Existenz des Nachfolgers
unter seinem Namen — ist gegriffen."
```

### Gate nach Welle 6

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build && pnpm exec playwright test
```

---

## Welle 7 — Abnahme (2 Tasks, nacheinander)

⚠️ **Diese beiden Tasks laufen NICHT parallel.** T176 hakt ab, was T175 protokolliert hat.

### Task 175: Der Abruf je angefasster Route — 36 Routen, abgehakt statt behauptet

**Files:**
- keine (nur Ausführung und Protokoll)

**Interfaces:**
- Consumes: alles aus Teil 1 bis Teil 6.
- Produces: das **Abrufprotokoll**, ohne das §12.4 nicht eingelöst ist.

**Abnahme, nicht TDD.** Was dieser Task fängt, sind **vier Fehlerklassen, die für `pnpm build`,
`pnpm typecheck`, `pnpm lint` UND Vitest strukturell unsichtbar sind** (§12.4):

| Klasse | Warum kein Gate sie sieht | Symptom |
|---|---|---|
| **Compound-Zugriff auf antd in einer Server Component** | `typecheck` sieht ein gültiges Namespace-Member, `build` rendert nicht | HTTP 500 für die ganze Seite |
| **`@ant-design/icons` in einer Server Component** | Der nackte Spezifizierer löst über `exports["."].node.import` auf CJS auf, das `createContext` auf **Modulebene** ruft; in der RSC-Ebene gibt es das nicht | HTTP 500 **schon beim Import**. Mit `"use client"` auf der Icon-Datei stattdessen HTTP 200 mit **leerer** Map und still falschem Icon |
| **Ein WERT aus einem `"use client"`-Modul in einer Server Component** | Unter Vitest ist `"use client"` ein wirkungsloser String | HTTP 500 für die ganze Seite |
| **`usePathname` unter dem Rewrite** | `SuiteNav.test.tsx:48` mockt `next/navigation`, und `:263-266` sagt das über sich selbst. Die vorhandene Messung steht gegen Next **16.2.6**, die Suite fährt **16.2.11**, und sie entstand per `curl` gegen einen Dev-Server **ohne** Reverse-Proxy | Keine oder falsche Aktivmarkierung — **sieht nicht kaputt aus, nur unaufmerksam** |

- [ ] **Schritt 1: Den Server auf dem Modul-Host starten**

```bash
SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me \
LAGERBUCH_HELFER_SITZUNG_SECRET=<32+ Zeichen, nicht AUTH_SECRET> \
SUITE_ADMIN_GROUP_LAGERBUCH=lagerbuch_nutzer \
AUTH_DEV_LOGIN=true \
pnpm dev
```

⚠️ **Der Modul-Host ist Pflicht.** Auf `localhost` greift `requireLagerbuchHost`, und **jede** Zeile
der Liste antwortete 404 — Falle 61 von der richtigen Seite. Wer das übersieht, protokolliert 36
falsche 404 und hält den Riegel für kaputt.

- [ ] **Schritt 2: Die Abrufliste aus §7.1 abhaken — 29 `page.tsx`**

Die vollständige Liste steht in **§7.1** dieses Plans. Sie wird dort abgehakt, **nicht hier
wiederholt**. Für jede Zeile werden **zwei** Dinge protokolliert: der HTTP-Status **und** ein
unterscheidendes Merkmal (die dritte Spalte der Tabelle).

⚠️ **Der Status allein reicht nicht.** Falle 7 in ihrer stillen Ausprägung liefert **HTTP 200** mit
einer leeren Icon-Map und still falschem Icon; Falle 2 lässt eine Linie einfach verschwinden. Das
unterscheidende Merkmal ist die einzige Zeile, die das sieht.

```bash
for p in / /helfer /helfer/check /verwaltung /verwaltung/artikel /verwaltung/journal \
         /verwaltung/checks /verwaltung/inventur /verwaltung/bestellung \
         /verwaltung/etiketten /verwaltung/tokens /verwaltung/fahrzeuge \
         /verwaltung/vorlagen /verwaltung/geraete /verwaltung/geraete/scan \
         /verwaltung/bz /verwaltung/bz/scan /verwaltung/sauerstoff \
         /verwaltung/import /verwaltung/verfall ; do
  printf "%-34s %s\n" "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' "http://lagerbuch.localtest.me:3000$p")"
done
```

Die Detailseiten mit `[id]` brauchen echte Kennungen aus der Seed-Datenbank und werden einzeln
abgerufen. ⚠️ **Die 23 Arbeitsseiten sind bereits von Teil 5 (T151, Schritt 2) abgerufen worden** —
das Protokoll wird **gelesen und übernommen**, nicht nachgefahren. **Nachgefahren werden die vier
Zeilen, die dieser Plan geändert hat:** `/verwaltung/artikel` (T165), `/verwaltung/bestellung`
(T166), `/verwaltung/tokens` (T160) und `/verwaltung/etiketten` (T162).

- [ ] **Schritt 3: Die sieben Route Handler abhaken (§7.2)**

```bash
for p in /manifest.webmanifest /pwa-icon.svg /icon-192.png /icon-512.png \
         /icon-maskable-512.png /api/health/lagerbuch ; do
  printf "%-30s %s  %s\n" "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' "http://lagerbuch.localtest.me:3000$p")" \
    "$(curl -s -o /dev/null -w '%{content_type}' "http://lagerbuch.localtest.me:3000$p")"
done
```

⚠️ **`/t/<code>` und `/abmelden` werden NICHT per `curl` abgehakt**, sondern über T171: nur ein
Browser zeigt, dass das Cookie auf **demselben** Host gesetzt wird, auf dem die Landung passiert.
⚠️ **Und der Gegentest gehört dazu:** `curl -si http://portal.localtest.me:3000/manifest.webmanifest`
darf **nicht** das lagerbuch-Manifest liefern — sonst bewirbt jeder Suite-Host eine Lagerbuch-PWA
(Falle 56, Runbook R2).

- [ ] **Schritt 4: Je ein Abruf pro Farbmodus auf VIER Seiten**

**Kein Gate der Suite rendert ein Modul im Dunkelmodus** (§6.6.7) — und alle acht fest gegen Hell
gebauten Stellen sind **syntaktisch einwandfrei**.

| Seite | Was im Dunkelmodus zu sehen sein muss | Wer |
|---|---|---|
| `/verwaltung/artikel` | Die Chips tragen **Farbe** (nicht nur Polster und Rundung) | Teil 5, T151/4 — Protokoll lesen |
| `/verwaltung/verfall` | Die Plakette ist **keine weiße Scheibe** | Teil 5, T151/4 — Protokoll lesen |
| `/verwaltung` | Die farbigen **linken Kanten** der KPI-Kacheln sind da | Teil 5, T151/4 — Protokoll lesen |
| **`/verwaltung/etiketten`** | Der Bogen bleibt **weiß mit schwarzer Schrift** | **hier, neu** |

Umgeschaltet wird über den Cookie-Umschalter der Suite bzw. im Browser mit
`document.documentElement.setAttribute("data-theme","dark")` — **nie** über `prefers-color-scheme`
(§6.6.6, Punkt 3).

⚠️ **Der Etikettenbogen ist die einzige Fläche des Moduls, auf der ein fester Farbwert richtig ist.**
Ein Bogen aus einer dunkel eingestellten Sitzung druckte sonst weiße Schrift auf weißes Papier, und
`print-color-adjust: exact` verbietet dem Browser jede Notrechnung — es käme nur der QR-Kasten heraus.
Der Fall ist **neu**: die Alt-Anwendung hat nur ein helles Thema.

⚠️ **Ein fehlender `.modul`-Träger fällt genau hier auf und nirgends sonst.** Ohne ihn löst jedes
`var(--lb-…)` ins Leere auf, fällt auf `transparent` zurück und ist **gültiges CSS**: HTTP 200, kein
Log, und der CSS-Scan bleibt **grün**, weil er die Deklaration prüft und nicht ihren Träger.

- [ ] **Schritt 5: Die absichtlich werfende Route — der Nachweis der `error.tsx`-Rahmung**

§11.2 nennt das ausdrücklich einen **Prüfpunkt, keine Behauptung**: „dass eine Modul-`error.tsx`
**innerhalb** von `m/lagerbuch/layout.tsx` rendert, ist im Repo an keinem Bestandsmodul ablesbar —
es gibt keine einzige."

```bash
# Eine Route absichtlich werfen lassen — TEMPORAER, mit Commit-Sperre.
cat > "src/app/m/lagerbuch/verwaltung/(arbeit)/wurf/page.tsx" <<'EOF'
export const dynamic = "force-dynamic";
export default function Wurf(): never {
  throw new Error("Absichtlicher Wurf fuer den error.tsx-Nachweis (T175, Schritt 5)");
}
EOF
curl -s http://lagerbuch.localtest.me:3000/verwaltung/wurf | \
  grep -o "Diese Ansicht konnte nicht geladen werden\|Erneut versuchen\|manifest"
rm -rf "src/app/m/lagerbuch/verwaltung/(arbeit)/wurf"
```

Erwartet: die zwei Texte aus `_lib/zustandTexte.ts`. **Protokolliere zusätzlich, ob der
Manifest-Verweis aus `m/lagerbuch/layout.tsx` in der Antwort steht** — das ist die eigentliche
Messung. ⚠️ **Fällt sie anders aus, ist der Fehlertext trotzdem richtig, nur die Rahmung eine
andere; die Entscheidung kippt daran nicht.** Da `m/lagerbuch/layout.tsx` ohnehin nur
`metadata.manifest` trägt (§7.1.1), ist der Unterschied klein.

⚠️ **Die Wegwerf-Route wird VOR dem nächsten Commit gelöscht.** Bleibt sie liegen, ist sie eine
30. `page.tsx`, die keine Zählung dieses Plans kennt — und `_actions/guards.test.ts` würde sie zwar
nicht sehen, `pnpm build` aber sehr wohl bauen.

- [ ] **Schritt 6: Den Riegel-Abruf fahren (F3)**

**Die einzige Zusicherung, die die Kopplung zwischen den zwei Group-Layouts prüft** — und ein
Quelltext-Scan sieht sie nicht:

```bash
# Als Konto OHNE Lagerbuch-Gruppe (Dev-Login mit leerer Gruppenliste):
curl -s -o /dev/null -w "etiketten %{http_code}\n" \
  http://lagerbuch.localtest.me:3000/verwaltung/etiketten
curl -s -o /dev/null -w "artikel   %{http_code}\n" \
  http://lagerbuch.localtest.me:3000/verwaltung/artikel
```

Erwartet: **zweimal dieselbe Zahl**, und diese Zahl ist **404** — nicht 403. „Ein 403 verriete, dass
es die Admin-Route gibt" (`core/auth/guards.ts:15-17`); für eine Verwaltung mit Journal, Klarnamen
und Etiketten voller **Klartext-Codes** ist das keine Formalie.

⚠️ **T167 prüft dieselbe Aussage als E2E.** Beide sind fällig: der E2E hält sie dauerhaft, der Abruf
hier belegt sie im Protokoll gegen den **tatsächlich laufenden** Server, auf dem echten Modul-Host.

- [ ] **Schritt 7: Das Protokoll ablegen**

Das vollständige Protokoll — je Zeile Pfad, Status, unterscheidendes Merkmal — wird in den
Commit-Text der Abnahme aufgenommen. **Nicht in eine Datei:** ein Protokoll im Repo veraltet
schweigend, ein Protokoll im Commit ist an den Stand gebunden, den es beschreibt.

```bash
rtk git commit --allow-empty -m "chore(lagerbuch): 36 Routen echt abgerufen, vier Farbmodus-Abrufe, ein Wurf

Spec §12.4. Vier Fehlerklassen sind fuer typecheck, lint, build UND Vitest
strukturell unsichtbar: antd-Compound in RSC, @ant-design/icons in RSC (der
Fehler entsteht BEIM IMPORT), ein WERT aus einem \"use client\"-Modul, und die
usePathname-Naht unter dem Rewrite.

Abgerufen auf dem Modul-Host (lagerbuch.localtest.me) — auf localhost greift
requireLagerbuchHost und jede Zeile antwortete 404.

Je Zeile Status UND unterscheidendes Merkmal: der Status allein reicht nicht.
Falle 7 in ihrer stillen Auspraegung liefert HTTP 200 mit leerer Icon-Map und
still falschem Icon, Falle 2 laesst eine Linie einfach verschwinden.

Vier Farbmodus-Abrufe: drei aus Teil 5 (Protokoll uebernommen) plus der
Etikettenbogen, der als einzige Flaeche des Moduls hart #fff/#000 traegt. Ein
Bogen aus einer dunklen Sitzung druckte sonst weisse Schrift auf weisses Papier,
und print-color-adjust:exact verbietet jede Notrechnung.

Der Riegel-Abruf (F3): /verwaltung/etiketten ohne Lagerbuch-Gruppe antwortet
gleich wie /verwaltung/artikel ohne Gruppe — 404, nicht 403.

Der error.tsx-Nachweis ueber eine temporaere werfende Route; die Route ist
geloescht.

<hier das vollstaendige Protokoll einfuegen>"
```

### Task 176: Die Abnahme des ganzen Vorhabens

**Files:**
- keine (nur Ausführung und Protokoll)

**Interfaces:**
- Consumes: alles aus Teil 1 bis Teil 6.
- Produces: die Aussage „**Spec 1 ist eingelöst**" — und die Übergabe an Spec 2.

**Abnahme, nicht TDD.** Was dieser Task fängt: **einen Teil, den jemand für abgenommen hält, weil
sein eigenes Gate grün war.** Sechs Pläne, sechs Sitzungen, sechs grüne Balken — und die Aussagen,
die zwischen ihnen liegen, hat keiner geprüft.

- [ ] **Schritt 1: Die vier Gates ein letztes Mal, vollständig**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build && pnpm exec playwright test
```

**Alle fünf müssen grün sein.** Warnungen aus `pnpm lint` blockieren nicht, Fehler schon.

- [ ] **Schritt 2: Was aus den 13 Alt-Specs geworden ist (§12.5)**

Die Alt-Anwendung ist eingefroren (`ca04eb1`); es wird dort **nichts gelöscht**. „Bevor die alte Spec
gelöscht wird" heißt hier: **bevor die Alt-Instanz vom Netz geht**. Diese Tabelle wird abgehakt, und
zwar mit dem Nachfolger **namentlich**:

| ☐ | Alt-Spec | Fate | Nachfolger |
|---|---|---|---|
| ☐ | `bestand-export.spec.ts` | **Übernehmen** — Rolle+Name sind antd-neutral | `e2e/lagerbuch-bestand-export.spec.ts` (T168). ⚠️ Die Lücke wandert mit: geprüft wird nur die **Form** des Dateinamens, nie der Wert |
| ☐ | `bz-scan.spec.ts` | **Umschreiben** — die vier `getByPlaceholder`-Anker sterben an `Form.Item label`; der Hydrations-Retry ist ein reines `next dev`-Artefakt und entfällt | `e2e/lagerbuch-verwaltung.spec.ts` (Teil 5, T150) |
| ☐ | `check.spec.ts` | **Umschreiben**, Netz zuerst (§12.1 Punkt 1). `/abschließen/i` trifft heute genau einen Knopf, weil je Phase nur einer rendert; `Stepper` ist eigenes Markup und geht als Ganzes mit | `e2e/lagerbuch-helfer.spec.ts` (T171) + `_lib/checkNutzlast.test.ts` (Teil 3) |
| ☐ | `etiketten.spec.ts` | **Umschreiben**, Netz zuerst (§12.1 Punkt 7). Der QR-Träger wechselt von `<img>` auf `<svg>` | `e2e/lagerbuch-etiketten.spec.ts` (T167) + `EtikettenBogen.test.tsx` (T162) + `_db/etiketten.test.ts` (T159) |
| ☐ | `gate.spec.ts` | **Ersetzen** — die Aussage „login-freie Startseite" bleibt, der Zuschnitt folgt §3.6.6 und §3.9 | `e2e/lagerbuch-helfer.spec.ts` (T171) ⚠️ Teil 4 |
| ☐ | `geraete.spec.ts` | **Teilen.** `:66` (`button "Defekt"`) ist die **Eingabe**seite und überlebt einen Umbau auf `Radio.Group` nicht; `:80` prüft das **persistierte** Literal und überlebt. `combobox "Standort"` bricht mit dem handgesetzten `role="combobox"` | `e2e/lagerbuch-verwaltung.spec.ts` (Teil 5, T150) |
| ☐ | `helfer-flow.spec.ts` | **Umschreiben, fachlich.** ⚠️ `:56` verlangt wörtlich `/server-side exception/` — **der Absturz ist dort die erwartete Ausgabe**, und `:50-51` schreibt das selbst hin | `e2e/lagerbuch-helfer.spec.ts` (T171). ⚠️ Wer die alte Zeile stehen lässt, **konserviert den Ausfall**; wer sie ohne Begründung streicht, verliert die Zusage „Sperren wirkt sofort" — die serverseitige Hälfte liegt in `_lib/helferZugang.test.ts` und bleibt |
| ☐ | `inventur.spec.ts` | **Umschreiben**, Netz zuerst (§12.1 Punkt 5). Der defensive Übersprung in `:26` fällt weg (§12.3, Regel 5) | `e2e/lagerbuch-verwaltung.spec.ts` (Teil 5, T150) |
| ☐ | `loeschen.spec.ts` | **Umschreiben** — die selektorlastigste Spec des Bestands (4× `.drawer`, 2× `.modalbox`, 4× `tr.click`). Netz zuerst (§12.1 Punkt 6) | `_ui/LoeschDialog.test.tsx` (Teil 5, T110) + `e2e/lagerbuch-verwaltung.spec.ts` (T150) |
| ☐ | `suche-filter.spec.ts` | **Umschreiben**, Netz zuerst (§12.1 Punkte 2 und 3), mit der Rollen-Gegenprobe aus §12.3 Regel 2. Die literale URL-Zusicherung `?q=Verband` **bleibt** — sie ist der einzige Beleg für den URL-Vertrag. T174-Befund (behoben): die DOM-Hälfte lebt in `journal/JournalFilter.test.tsx` (T147), nicht in `_ui/filter.test.tsx` (T109, nur die `useUrlFilter`-Mechanik); die E2E-Hälfte fehlte komplett und wurde von T174 in `e2e/lagerbuch-verwaltung.spec.ts` ergänzt | `journal/JournalFilter.test.tsx` (T147) + `_ui/filter.test.tsx` (T109) + `e2e/lagerbuch-verwaltung.spec.ts` (T150 + T174) |
| ☐ | `verfall.spec.ts` | **Umschreiben.** `/× aussondern/` hängt zusätzlich an einem typografischen `×` im Knopftext | `e2e/lagerbuch-verwaltung.spec.ts` (Teil 5, T150) |
| ☐ | `verwaltung-flow.spec.ts` | **Umschreiben**, sechs CSS-Kopplungen; Netz zuerst (§12.1 Punkt 4). Der eigene Kommentar `:48-50` hält fest, warum `.first()` dort bewusst vermieden wurde — Sekundenauflösung der `ts`-Spalte | `e2e/lagerbuch-verwaltung.spec.ts` (Teil 5, T150) + `_lib/journalZeile.test.ts` (Teil 3) |
| ☐ | `verwaltung.spec.ts` | **(a) und (c) übertragen, (b) fällt.** Die literale URL `/\/\?returnTo=%2Fverwaltung%2Fartikel$/` hat nach dem Port **kein Ziel mehr** — die Spec wird **rot, nicht gegenstandslos**. Die reine `returnTo`-Logik ist ohnehin in `_lib/returnTo.test.ts` gegatet (Teil 2), inklusive Endlosschleifen-Schutz und Open-Redirect | `e2e/lagerbuch-hosts.spec.ts` (T169) + `_lib/returnTo.test.ts` (Teil 2) |

- [ ] **Schritt 3: Die 40 Fehlerzustände aus §11.5 auf Abdeckung prüfen**

Teil 1 hat diesen Punkt ausdrücklich verteilt: „**Die 40 Fehlerzustände aus §11.5 sind kein
Teil-6-Task.** Sie sind über E, F und G verteilt und entstehen mit ihnen. Teil 6 bündelt nur
`error.tsx`, die Scans und die E2E-Dateien." → **Dieser Schritt baut nichts; er stellt fest, dass
jeder Zustand einen Ort hat.** Ein Zustand ohne Ort ist ein Befund, kein Anlass, ihn hier
nachzubauen.

| Zustände | Anmutung | Wer | ☐ |
|---|---|---|---|
| **1–5** Gate: Code nicht erkannt · Budget erschöpft · modulweite Bremse · `/t/<code>` ungültig · `/t/<code>` gültig | Modul | **Teil 4** (§7.2), Texte aus `_lib/gateTexte.ts` (Teil 2) | ☐ |
| **6–10** Sitzung abgelaufen · Code gesperrt · **Entnahme gebucht: 0** · teilweise gebucht · Netz weg | Modul | **Teil 4** (§7.3, §7.4.4). ⚠️ Zustand 8 ist heute ein **grüner Chip mit Häkchen** — „ein 200, das lügt, ist der teuerste Zustand dieser Tabelle" | ☐ |
| **11** Die 22 deutschen Meldungstexte als **Rückgabewert** | Modul | **Teil 5** (T113–T126) und **Teil 4** (`check.ts`) | ☐ |
| **12** Fahrzeug-Check: fremdes Objekt in der Nutzlast | **Modul-Grenze** | **Teil 4** (Wurf) → fällt an **`error.tsx` (T163)** | ☐ |
| **13–14** Löschen abgelehnt (Historie) · Löschen scheitert am Fremdschlüssel | Modul | **Teil 5** (T110, T124) | ☐ |
| **15** `/g/<code>`: Barcode unbekannt | Modul | **T164** (dieser Plan) | ☐ |
| **16** Verwaltungs-Detailseite mit unbekannter ID (7 Stellen) | **Suite-404** | **Teil 5** — bewusst **nicht** gestaltet | ☐ |
| **17–18** `/a/<id>` unbekannt · `/a/<id>` ohne Sitzung | Modul | **Teil 4** (8-C) | ☐ |
| **19** Angemeldet ohne Lagerbuch-Gruppe | **Suite-404 + Logzeile** | **Teil 2** (§3.3); der Abruf in **T169** | ☐ |
| **20** Nicht angemeldet, Verwaltungspfad | Suite-Login | **Teil 2** | ☐ |
| **21** Modulpfad auf fremdem Suite-Host | **Suite-404** | **Teil 1** (`_lib/host.ts`); die Schleife in **T169** | ☐ |
| **22–23** Server-Action-Riegel wirft · unerwarteter Wurf im Render | **Modul-Grenze** | **T163** (dieser Plan); der Abruf in **T175, Schritt 5** | ☐ |
| **24–25** Journal-/Checks-Grenze hat gegriffen · `von`/`bis` unlesbar | Modul | **Teil 3** (`_lib/grenzen.ts`) + **Teil 5** (T135, T147) | ☐ |
| **26–28** Altes `checks.ergebnis`-Format · unlesbar · gelöschtes Objekt im Snapshot | Modul | **Teil 3** (`parseCheckErgebnis`) + **Teil 5** (T136) | ☐ |
| **29–32** Flasche ohne Messung · Nennfülldruck unbekannt · BZ nie geprüft · Gerät ohne Datum | Modul | **Teil 3** (`_lib/domain/o2.ts`, `bz.ts`, `geraet.ts`) + **Teil 5** (T139, T141, T143) | ☐ |
| **33–35** Nachfüllen, Handlager leer · Aussondern abgelehnt · kein Fahrzeug / nichts zu prüfen | Modul | **Teil 4** (§7.9) und **Teil 5** (T115) | ☐ |
| **36** Kamera verweigert (vier unterscheidbare Zustände) | Modul | **Teil 5** (T138) mit `_ui/BarcodeScanner.tsx` aus **Teil 4** | ☐ |
| **37** Leerzustände (keine Buchung, kein Gerät, kein Check, kein Bestellvorschlag) | Modul | **Teil 5** — **Pflicht, auch für die Kacheln** | ☐ |
| **38** Etikettenbogen ohne konfigurierte Domain | Modul | **T159 + T162** (dieser Plan) | ☐ |
| **39** Zwischenablage ohne secure context | Modul | **T166** (dieser Plan) | ☐ |
| **40** Auflöser findet die Kennung nicht | Modul | **Teil 1** (`_db/quelle.ts`) — der benannte Defektzustand aus §4.13 (i), protokolliert | ☐ |

⚠️ **Zwei Zeilen dieser Tabelle prüfen sich gegenseitig.** Zustand 16 (Suite-404 für
Verwaltungs-Detailseiten) und Zustand 15/17 (gestaltete Zustände für `/g` und `/a`) sind **dieselbe
Frage mit gegenläufiger Antwort**, und der Unterschied ist begründet: dort steht kein Mensch mit
einem gescannten Gegenstand in der Hand, sondern eine Verwaltende, die einem veralteten Link gefolgt
ist. Wer eine der beiden Seiten „vereinheitlicht", hebt die Begründung auf — in der einen Richtung
verliert die Helferin ihre Auskunft, in der anderen verrät die Suite die Existenz von Admin-Routen.

- [ ] **Schritt 4: Die Abnahmecheckliste über alle sechs Teile**

**Teil 1 — Gerüst und Datenmodell (§2, §4, §5.13.2), T1–T14**
- [ ] Alle 14 Tasks eingecheckt; das **Dreieck** (Migrationsverzeichnis, `MODULE_MIGRATIONS`,
      `COPY`-Zeile im `Dockerfile`) steht, und die Gegenprobe (auskommentierte `COPY`-Zeile → roter
      `bootstrap.test.ts`) ist einmal gefahren worden.
- [ ] Der **Schema-Diff** gegen die Alt-Anwendung ist abschließend und protokolliert.
- [ ] `_db/append-only.test.ts` behauptet **vier** Trigger, die `o2`-Gegenprobe und das
      `INSERT OR REPLACE`-Verhalten.
- [ ] Registry-Eintrag exakt, insbesondere `requiresAuth: false` und `prodHosts: []`.

**Teil 2 — Zugang (§3), T15–T27**
- [ ] `_lib/zugang.ts` ist der **eine** Riegel; `isModuleAdmin`, `requireModuleAdmin`,
      `moduleAdminPageOrNotFound`, `canAdminModule` und `session.user.isAdmin` kommen unter
      `m/lagerbuch/` **nicht** vor.
- [ ] `helferSitzung.ts` setzt **kein** `domain` — die Sitzung ist host-only.
- [ ] `absenderAus` liest `cf-connecting-ip` oder den konstanten Sammelschlüssel, **niemals**
      `x-forwarded-for`.
- [ ] `_actions/guards.test.ts` steht seit dem ersten Commit in der Eigenschaftsform.

**Teil 3 — Fachlogik und Grenzen (§5, §10, §12.6), T28–T61**
- [ ] `_lib/boot.ts` ist in `assertHostConfig()` **eingehängt** — ⚠️ **für diese Naht gibt es kein
      Kopplungsnetz**: ohne den Haken existiert die Datei, wird aber nie gerufen, und nichts wird rot.
- [ ] `playwright.config.ts` trägt `SUITE_HOST_LAGERBUCH`, das Sitzungsgeheimnis, die Admin-Gruppe,
      den Seed-Schritt und den **zweiten Host**.
- [ ] `BESTELL_FAKTOR` kommt im ganzen Modul **nicht** vor; der Vorschlag ist die Lückenformel.
- [ ] Kein globaler `env`-/`TZ`-Block in `iuk-suite/vitest.config.ts`.

**Teil 4 — Helfer-Weg (§7), T62–T85**
- [ ] ⚠️ **Zuerst: existiert der Plan mit Tasks?** (§2.1 — am 04.08.2026: nein, das Dokument endet
      nach E11.) Ohne ausgeführten Teil 4 kann diese Checkliste **nicht** grün werden.
- [ ] Gate, `/t/<code>`, `/abmelden`, `/a/<id>`, `/helfer`, `/helfer/check`, die fünf PWA-Handler.
- [ ] `_lib/barcode.ts#normalisiereBarcode` — **Consumes von T164**.
- [ ] `_ui/helfer.module.css` trägt die acht Ampel-Hexwerte **zeichengleich** zu `_lib/ampel.ts`.
- [ ] `_lib/pwaIcons.ts` hält die Bytes mit den geprüften Längen (1558 · 5458 · 3290).

**Teil 5 — Verwaltung (§6), T100–T152**
- [ ] Alle **23** Arbeitsseiten antworten mit **200**.
- [ ] `.modulnav` hat `overflow-x: auto`; `documentElement.scrollWidth === clientWidth` bei
      1280×720 mit fünfzehn Navigationseinträgen.
- [ ] `_ui/ikonen.test.ts` findet **36** Namen und keinen `@ant-design/icons`- oder
      `lucide-react`-Import unter `m/lagerbuch/`.
- [ ] Kein `Alert type="error"`, kein `size="large"`, kein `e.message` unter `verwaltung/`.
- [ ] Die Tabelle Action → Seite → Bedienelement ist abgehakt — samt der beiden benannten Kandidaten
      für „Action ohne Weg" (`sollPositionWiederherstellen`, `deaktiviereElement`).
- [ ] ⚠️ **Die Zeile „32 Deklarationen in 14 Dateien" in Teil 5s eigener Abnahme trifft NICHT zu**
      und wird als **43 Deklarationen in 15 Dateien** abgehakt (§4.2 dieses Plans).

**Teil 6 — Artefakte, Ausgaben, Abnahme (§8, §9, §11, §12), T153–T176**
- [ ] Alle **24** Tasks eingecheckt, jeder mit eigenem Commit.
- [ ] `_db/etiketten.test.ts` **dekodiert** den QR und vergleicht gegen den aus
      `SUITE_HOST_LAGERBUCH` aufgelösten Host — die Gegenprobe (`/a/` → `/A/`) ist gefahren.
- [ ] `verwaltung/(druck)/layout.tsx` ruft `requireLagerbuchHost` **und**
      `requireLagerbuchAdmin`; der Abruf ohne Lagerbuch-Gruppe liefert **dieselbe** Antwort wie
      `/verwaltung/artikel` ohne Gruppe (**404**, nicht 403).
- [ ] Es gibt **kein** `verwaltung/(arbeit)/etiketten/` und **kein** `verwaltung/layout.tsx`.
- [ ] `druck.test.ts` findet **genau ein** `@media print` unter `m/lagerbuch/**` und **kein**
      `body *` — der Glob liest `**/*.css`, nicht `_ui/*.module.css`.
- [ ] `e2e/lagerbuch-etiketten.spec.ts` fährt `page.emulateMedia({ media: "print" })`; die
      Gegenprobe (`display:none` → `opacity:0`) ist gefahren.
- [ ] `_actions/guards.test.ts` zählt **47 = 44 + 3** in **18** Dateien und **19**
      Verzeichniseinträgen; drei Gegenproben sind gefahren.
- [ ] `_lib/bauform.test.ts` verlangt die **Existenz** aller drei Weichen-Dateien.
- [ ] `error.tsx` existiert; `not-found.tsx`, `loading.tsx` und `global-error.tsx` existieren
      **nicht**.
- [ ] Die Abrufliste aus §7 ist **abgehakt**, inklusive der vier Farbmodus-Abrufe, des
      Print-Abrufs, des Riegel-Abrufs und der absichtlich werfenden Route.
- [ ] Die §12.1-Tabelle (§8) ist abgehakt; die §12.5-Tabelle (Schritt 2) ist abgehakt; die
      §11.5-Verteilungstabelle (Schritt 3) ist abgehakt — **jeder der 40 Zustände hat einen Ort**.

- [ ] **Schritt 5: Die Runbook-Zeilen dieses Plans übergeben**

R30 (Probebogen), R31 (Reihenfolge einfrieren), R32 (nachdruckbare ≠ hängende Etiketten) und R33
(geänderte Knopfbeschriftungen) aus §2.3 werden **wörtlich** in das Cutover-Runbook übernommen.
⚠️ **R30 ist keine Zeile, die man nachholt:** ein falsch bedruckter Bogen kostet gekauftes Material
und einen Gang durch alle Fahrzeuge.

- [ ] **Schritt 6: Die Übergabetabelle an Spec 2 schreiben**

Der vollständige Inhalt steht in §10 dieses Plans („Übergabe an Spec 2"). Er wird als **eigener
Abschnitt** ins Cutover-Runbook übernommen — nicht als Verweis: das Runbook wird unter Zeitdruck
gelesen, und ein Verweis in eine 845-KB-Spec ist unter Zeitdruck kein Verweis.

- [ ] **Schritt 7: Der Abschluss-Commit**

```bash
rtk git commit --allow-empty -m "chore(lagerbuch): Spec 1 abgenommen — sechs Teile, 100 Tasks

Abnahme ueber alle sechs Plaene (T1-T14, T15-T27, T28-T61, T62-T85, T100-T152,
T153-T176).

Was diese Abnahme faengt und kein einzelnes Plan-Gate faengt: einen Teil, den
jemand fuer abgenommen haelt, weil sein eigenes Gate gruen war. Sechs Plaene,
sechs Sitzungen, sechs gruene Balken — und die Aussagen, die ZWISCHEN ihnen
liegen, hat keiner geprueft.

Die drei Kopplungen ueber Plangrenzen hinweg, jede einzeln belegt:
- F3: beide Group-Layouts rufen beide Riegel. Der Abruf ohne Lagerbuch-Gruppe
  gibt auf /verwaltung/etiketten dieselbe Antwort wie auf /verwaltung/artikel.
- F4/J5: 47 = 44 + 3 in 18 Dateien, hergeleitet aus Spec §2.1 a. Die
  abweichenden Zahlen in Teil 4 und Teil 5 sind Rechenfehler, namentlich
  aufgeloest.
- §12.1: sieben Aussagen ohne Netz, sieben benannte Nachfolger, vier bewusste
  Verschiebungen protokolliert.

Die 13 Alt-Specs sind abgewickelt (§12.5): eine uebernommen, elf umgeschrieben,
eine geteilt. Vier Runbook-Zeilen (R30-R33) und die Uebergabetabelle an Spec 2
sind ins Cutover-Runbook uebernommen.

⚠️ Offen, solange Teil 4 keine Tasks traegt: der ganze Helfer-Weg. Siehe
Plan-Teil 6, §2.1."
```

---

## 10. Übergabe an Spec 2 — Datenumzug, Generalprobe, Cutover

**Diese Liste ist verbindlich. Wo Spec 2 davon abweicht, ist es ein Fehler in Spec 2, nicht hier**
(§1.4). Sie steht hier vollständig und nicht als Verweis: das Cutover-Runbook wird unter Zeitdruck
gelesen, und ein Verweis in eine 845-KB-Spec ist unter Zeitdruck kein Verweis.

### 10.1 Was Spec 2 aus Spec 1 erbt

| Festlegung | Wert | Folge für Spec 2 |
|---|---|---|
| **Modul-Key** | `lagerbuch` | DB-Datei `lagerbuch.db` unter `DATA_DIR`; `SUITE_HOST_LAGERBUCH`, `SUITE_ADMIN_GROUP_LAGERBUCH` |
| **Migrationsverzeichnis** | `src/app/m/lagerbuch/_db/migrations` | Dateinamen kommen aus `meta/_journal.json` und werden **nicht** erfunden |
| **Prod-Domain** | `lagerbuch.iuk-ue.de`, ausschließlich über `SUITE_HOST_LAGERBUCH`; Registry `prodHosts: []` | Cutover = **eine** `.env`-Zeile plus `SUITE_TRAEFIK_RULE`; Rollback = dieselbe Zeile leeren. ⚠️ **Die gedruckten Etiketten werden dadurch nicht konfigurierbar** |
| **Öffentliche Pfadform** | `/`, `/t/<code>`, `/g/<code>`, `/a/<artikelId>`, `/helfer/*`, `/verwaltung/*` bleiben **wörtlich** | Der Rewrite `<host>/a/x` → `/m/lagerbuch/a/x` macht das ohne Änderung; die Entscheidung gehört trotzdem ausdrücklich ins Runbook |
| **Append-only** | die zwei Trigger aus `drizzle/0001_append_only.sql` **plus** das neue Paar auf `bz_kontrollen` | Ein Importer mit reinem `INSERT` läuft durch; **`onConflictDoUpdate` — das Muster beider vorhandener Importer — bricht** an `buchungen` beim zweiten Lauf. Wiederholbar ist `INSERT OR IGNORE`. ⚠️ **`INSERT OR REPLACE` ist die Falle:** es läuft bei `recursive_triggers = 0` (dem Default) durch und **umgeht den Trigger** |
| **Einfügereihenfolge** | artikel → fahrzeug_templates → template_positionen → lagerorte → chargen → soll_positionen → buchungen/checks/lagerort_verfall → bz_geraete/o2_flaschen/geraete → bz_kontrollen/o2_messungen → tokens → users | `lagerorte.templateId` → `fahrzeug_templates` sieht rückwärts aus; zweite Abhilfe ist `PRAGMA defer_foreign_keys = ON` **innerhalb** der Transaktion |
| **Zeitstempel-Einheit** | UNIX-**Sekunden**, Drizzle `mode: "timestamp"` | ⚠️ **Ein Faktor-1000-Fehler ist paritätsgrün.** Der Mapper normalisiert auf ganze Sekunden |
| **Zeitzone** | `Europe/Berlin` als **Modulkonstante** im Code | `TZ` wird von Spec 1 **nicht** gesetzt; der Wert ist Runbook-Eingabe. Das Modul hängt bewusst nicht daran |
| **Geheimnisse** | **nur** `HELFER_SESSION_SECRET` aus der produktiven `stack.env`, unter dem neuen Namen `LAGERBUCH_HELFER_SITZUNG_SECRET` | Laufende Helfer-Sitzungen (bis 12 h) überleben den Cutover — **nur, wenn der Modul-Host zeichengleich der heutige ist** (host-only Cookie). `AUTH_SECRET` der Suite bleibt unverändert. Abbau-Zeile: alte `stack.env` löschen |
| **Kennungen (`sub`)** | ✅ **gemessen: gleich.** `subject_types_supported: ["public"]`, keine pairwise identifiers | **Es gibt keine Zuordnungstabelle**, und sie wird nicht gebraucht: der Weg fällt **per Identität** zur Nulloperation zusammen. ⚠️ Der Paritätscheck beantwortete die Frage nie (in beiden Fällen grün); die Stichprobe R11 bleibt |
| **`users`-Tabelle** | Altbestand wird **gefiltert übernommen**, nicht geleert | Eine Zeile wandert genau dann, wenn ihre `id` in einer der sechs Autorenschaftsspalten vorkommt — das Prädikat **ist** der Waisenfilter. ⚠️ **Ausnahme:** Personen, deren einzige `users`-Zeile eine Waise ist (letzte Anmeldung vor `f2b515b`, 29.07.2026). Für die zeigt das Journal die **rohe Kennung**, und ihr Klarname steht **nur** in der Zeile, die der Filter aussortiert → **Bereinigung über die Klarnamen**, keine Übersetzungstabelle. `select count(*) from users` ist ohnehin **keine** Personenzahl |
| **`BESTELL_FAKTOR`** | **ersatzlos gestrichen** | Kein Produktivpfad liest das Feld; ein produktiv gesetzter Wert hat nie etwas bewirkt. Er wandert **nicht** mit |
| **Bestellvorschlag** | Lückenformel `max(0, mindestbestand − bestand)` | Die Faktor-Formel ist tot; keine Zeile der Bestellliste ändert sich |
| **Health** | `/api/health/lagerbuch` | ⚠️ `<host>/api/health` antwortet nach dem Cutover weiter `ok`, **ohne etwas über lagerbuch zu sagen** (Falle 51). Monitor und `deployment.md` umstellen |
| **Alte Modul-Endpunkte** | `src/app/api/health/route.ts` und `src/app/api/auth/[...nextauth]/route.ts` werden **nicht** portiert | Beide Präfixe stehen in `PASSTHROUGH` und erreichen das Modul nie |
| **Rollback-Körnung** | grob | Ein Rückzug auf ein älteres Image nimmt portal, qr, feedback und files mit. **Der Teilrückzug ist `SUITE_HOST_LAGERBUCH` leeren + Host aus `SUITE_TRAEFIK_RULE`** — er nimmt die Domain vom Netz, statt eine ältere lagerbuch-Version auszuliefern |

### 10.2 Was **dieser Plan** zusätzlich an Spec 2 übergibt

| # | Übergabe | Warum sie nicht warten kann |
|---|---|---|
| **R30** | **Probebogen** auf dem tatsächlich benutzten Drucker, auf das tatsächlich gekaufte Etikettenmaterial, mit **zwei** Telefonen aus 15 cm gescannt — je fünf Etiketten aus der **ersten und der letzten** Zeile (8-I) | Kein Test kann das: `build` und Vitest sehen `@media print` gar nicht, Playwright rendert für den Bildschirm. Ein fehlerhafter Bogen kostet gekauftes Material und einen Gang durch alle Fahrzeuge. **Benannter Rückfall bei Fehlschlag:** optionaler `margin`-Parameter an `core/qr#qrSvg`, vom Etikettenbogen auf `1` gesetzt, an der Aufrufstelle mit dem Messergebnis begründet. **Level H bleibt in beiden Fällen** |
| **R31** | **Die Reihenfolge in `SUITE_HOST_LAGERBUCH` wird nach dem ersten Etikettendruck eingefroren** (8-B) | `moduleUrl` nimmt `prodHostsFor(mod)[0]`. Eine Umsortierung ändert **still** jeden ab dann gedruckten Bogen, während die alten Etiketten weiter auf den früheren ersten Eintrag zeigen. ⚠️ Fällt Betreiberfrage 9 auf „alte Domain mitlaufen lassen", **muss `lagerbuch.iuk-ue.de` Index 0 bleiben** |
| **R32** | **Die Menge der physisch hängenden Etiketten ist echt größer als die der nachdruckbaren** (Falle 26) | `etikettenDaten` filtert hart auf `aktiv = true`; ein deaktivierter Artikel bleibt unter `/a/<id>` **bebuchbar**, ist aber nie wieder nachdruckbar. **Die Differenz ist im Repo nicht abzählbar.** Wer nach dem Cutover nachdrucken will und den Artikel nicht findet, sucht sonst einen Fehler, wo eine Entscheidung ist |
| **R33** | **Ankündigung: die beiden Knopfbeschriftungen auf `/verwaltung/bestellung` ändern sich** — `Liste kopieren` → `Liste kopieren (nur offene)`, `CSV` → `CSV (alle Zeilen)` (9-A) | Die beiden Wege liefern **verschieden viele Zeilen**, und heute verrät das nichts. Der Umfang bleibt; die Beschriftung wird ehrlich |
| **R34** | **Entscheidung 8-F ist eine Verhaltensänderung mit Ankündigungspflicht:** ein Zugangs-Code kann nach dem Cutover **nur noch gesperrt**, nie mehr gelöscht werden | Verwaltende, die heute einen versehentlich angelegten Code löschen, finden den Knopf nicht mehr. Der Grund gehört in die Ankündigung: ein gelöschter Code konnte an ein später ausgestelltes Kärtchen zurückfallen, und historische Journalzeilen erschienen danach unter dem **neuen** Label |
| **R35** | **`APP_BASE_URL` wird beim Cutover ersatzlos gestrichen** (8-B) | Sie wäre eine **sechste** Wahrheit neben `SUITE_HOST_LAGERBUCH`. ⚠️ Ihr heutiger Wert ist trotzdem **vorher** abzulesen: der Cutover muss verifizieren, dass er zeichengleich `https://lagerbuch.iuk-ue.de` lautet — sonst ist **jeder gedruckte QR aus Form 1 und 2 auf den alten Wert gebrannt**, und die Entscheidung fällt auf „alter Host als zweiter Eintrag" zurück. **Eine Frage, zwei Folgen:** dieselbe Angabe entscheidet, ob die Helfer-Sitzungen den Cutover überleben (host-only Cookie) |
| **R36** | **`curl -si https://<portal-host>/manifest.webmanifest` darf das lagerbuch-Manifest NICHT liefern** | `start_url: "/"` zeigt ohne gesetztes `SUITE_HOST_LAGERBUCH` aufs **Portal**; eine installierte PWA startete dann im falschen Modul (Falle 56) |

### 10.3 Drei Dinge, die Spec 2 **nicht** von hier erbt

| Gegenstand | Warum nicht | Wo es hingehört |
|---|---|---|
| **`TZ=Europe/Berlin` setzen** | Der Suite-Container fährt heute ohne `TZ`; `node:26-alpine` liefert UTC. Alles, was portal, qr, feedback und files an Datumsgrenzen gezogen haben, ist in **UTC** gezogen worden — ein nachträgliches `TZ` verschöbe jede solche Grenze um ein bis zwei Stunden | **Eigener Schritt mit eigener Prüfung gegen die vier laufenden Module** (§1.5, Punkt 1) |
| **Das Entfernen des Suite-Admin-Kurzschlusses** (`core/groups.ts:104`) | `isModuleAdmin` steigt heute für **jedes** Modul beim Suite-Admin früh mit `true` aus. Der Kurzschluss ist **kein Versehen** — `core/groups.ts:14` schreibt seinen Zweck aus. Ihn zu entfernen ist `core`-Arbeit und berührt portal, qr und files | Eigene Suite-Entscheidung. lagerbuch erreicht dasselbe Ziel modulintern, indem es `isModuleAdmin` gar nicht benutzt — und ist damit **vorwärtskompatibel** zu dem Refactoring |
| **Das suiteweite Gating von `/m/*`** | Dass `/m/<key>/*` von jedem Suite-Host beantwortet wird, ist eine **Klasse** und kein lagerbuch-Problem (Falle 61) | Eigene Suite-Spec. Für Phase 5 genügt der modulinterne Host-Riegel — ⚠️ **lagerbuch ist allerdings das erste Modul, bei dem diese Klasse eine DATENWIRKUNG hätte statt einer kosmetischen**, und genau deshalb ist der Riegel dort nicht optional |

Ebenso benachbart und ausdrücklich **nicht** durchgeführt: die Hebung des DOM-Test-Harness nach
`src/core/` (§12.2). Der benannte Auslöser („sobald ein drittes Modul es braucht") ist mit `files`
längst gefallen; die Hebung berührt über dreißig Importzeilen in drei fremden Modulen und
`CLAUDE.md:106-107`, bringt lagerbuch **keinen** Nutzen und machte aus einem Modul-Port eine
repo-weite Umbenennung **mitten in einer Cutover-Vorbereitung**. Sie gehört als eigener, benannter
Suite-Posten protokolliert — **nicht** still über eine Modul-Spec eingeführt, und ebenso wenig still
weiter übergangen.

---

## 11. Was dieser Teil ausdrücklich NICHT liefert und wo es liegt

| Fehlt | Wo es entsteht |
|---|---|
| Registry, Dreieck, Host-Riegel, Modul-Layout, 16 Drizzle-Tabellen, vier Migrationen, die zwei Trigger-Paare, `_db/client.ts` mit `lb_falte`, `_lib/zeit.ts`, `_lib/konstanten.ts`, `_db/quelle.ts` | **Teil 1** (§2, §4, §5.13.2) |
| `_lib/zugang.ts`, `helferSitzung.ts`, `helferZugang.ts`, `absender.ts`, `gateSchranke.ts`, `gateTexte.ts`, `code.ts`, `returnTo.ts`, `tokenZiel.ts`, `konto.ts`, `abmelden/route.ts` — und die **Eigenschaftsform** von `_actions/guards.test.ts` und `_lib/bauform.test.ts` | **Teil 2** (§3). ⚠️ **Dieser Plan ERGÄNZT beide Scan-Dateien** (T172, T173) und legt **keine** zweiten an |
| `_lib/domain/*`, `_lib/lesepfade/*`, `_lib/schreibpfade/*`, `_lib/format.ts`, `_lib/artikelFilter.ts`, `_lib/journalZeile.ts`, `_lib/checkNutzlast.ts`, `_lib/checkErgebnis.ts`, `_lib/grenzen.ts`, `_lib/marke.ts`, `_lib/boot.ts`, `playwright.config.ts` | **Teil 3** (§5, §10, §12.6). ⚠️ **`_lib/artikelFilter.ts` ist Consumes von T156** (nur für den Kopplungstest, Schritt 6); `_lib/format.ts#pad2` wird **nicht** konsumiert — Teil 3s `Produces` führt den Namen nicht, deshalb füllt `_lib/bestandExport.ts` selbst auf |
| Das Gate (`page.tsx`), `t/[code]/route.ts`, `a/[artikelId]/page.tsx`, `helfer/layout.tsx`, `helfer/page.tsx`, `helfer/check/page.tsx`, die fünf PWA-Route-Handler, `_lib/barcode.ts`, `_lib/pwaIcons.ts`, `_lib/schreibpfade/tokenEinloesung.ts`, `_ui/HelferRahmen.tsx`, `_ui/BarcodeScanner.tsx`, `_ui/helfer.module.css`, `_actions/gate.ts`, `_actions/sitzung.ts`, `_actions/check.ts` | **Teil 4** (§7). **Teil 4 trägt T62–T87** (§2.1). Zwei von ihm zunächst beanspruchte Dateien liegen bei diesem Plan (`g/[code]/page.tsx` → J3/T164, `e2e/lagerbuch-helfer.spec.ts` → J2/T171), gegengezeichnet in Teil 4s E1 und E11. **T176 setzt einen abgenommenen Teil 4 voraus** |
| Die 23 Arbeitsseiten, `_ui/VerwaltungsRahmen.tsx`, `_ui/ikonen.tsx`, `_ui/Chip.tsx`, `_ui/Plakette.tsx`, `_ui/LoeschDialog.tsx`, `_ui/useUrlFilter.ts`, `_ui/verwaltung.module.css`, `_lib/ampel.ts`, `_lib/nav.ts`, `_lib/schrift.ts`, `_lib/mengen.ts`, die **14** Verwaltungs-Action-Dateien, die `.modulnav`-Reparatur, `e2e/lagerbuch-verwaltung.spec.ts` | **Teil 5** (§6). ⚠️ **Dieser Plan ERGÄNZT vier Teil-5-Dateien** (T160, T165, T166) — die Eigentümertabelle (§5) führt sie mit `ERGÄNZT`. ⚠️ **`e2e/lagerbuch-verwaltung.spec.ts` gehört Teil 5 (T150), nicht diesem Plan** (J4). ⚠️ **Teil 5s Abschlusstabelle schreibt, `g/[code]/page.tsx` mounte den Rahmen ohne `nav`** — das widerspricht §11.3 (»mit Shell **und** Modulnavigation«) und §2.1 (»`nav` ist Pflicht-Prop«). **Maßgeblich ist die Spec**; T164 mountet `nav={LAGERBUCH_NAV}` |
| Die **40 Fehlerzustände** aus §11.5, soweit sie nicht `error.tsx`, `/g/<code>` oder den Etikettenbogen betreffen | **Teil 4 und Teil 5.** Zustände 1–11 und 33–36 sind der Helfer-Weg (Teil 4), 13–14, 16, 24–32, 36–37 die Verwaltung (Teil 5). Dieser Plan bündelt **`error.tsx` (22, 23), `/g/<code>` (15), den Etikettenbogen (38) und die Zwischenablage (39)** — und **prüft in T176, Schritt 3**, dass jeder der 40 Zustände einen Ort hat — die vollständige Verteilungstabelle steht dort |
| **Datenumzug, Generalprobe, Cutover, Rollback, Standby** | **Spec 2.** Was sie von hier erbt, steht vollständig in §10 dieses Plans |
| `TZ=Europe/Berlin`, das Entfernen des Suite-Admin-Kurzschlusses, das suiteweite `/m/*`-Gating, die Hebung des DOM-Harness nach `core` | **Nirgends in diesem Vorhaben** — alle vier sind ausdrücklich außerhalb der Spec (§1.5, §12.2) und brauchen je einen eigenen, benannten Posten |

⚠️ **Die Reihenfolge über die Pläne hinweg.** Die Wellen 1 bis 4 dieses Plans hängen an Teil 1, 2, 3 und 5 und laufen unabhängig von Teil 4 durch; die Wellen 5 bis 7 (E2E, Zählung, Abnahme) brauchen ihn. T176 zählt 36 Routen und 47 Actions — **die Zahlen sind richtig, und sie gehen nur auf, wenn alle sechs Teile abgenommen sind.** Wer bei einem roten Lauf beginnt, Zahlen abzusenken, hat den Baum repariert statt des Fehlers.

---

## 12. Was §8, §9, §11 und §12 ausdrücklich NICHT entscheiden

Damit niemand es in diesem Plan sucht:

| Gegenstand | Entschieden in | Umgesetzt in |
|---|---|---|
| Die Absenderadresse des Gate-Rate-Limits (8-G) | §3.5 | **Teil 2** — `cf-connecting-ip` oder Sammelschlüssel, **nie** `x-forwarded-for`; `core/ratelimit.ts` bleibt unangetastet |
| Der vollständige `/t/[code]`-Handler (8-D) | §7.2.3 | **Teil 4.** Dieser Plan hält nur die drei Sätze fest: kein Host im Handler, `NextResponse.redirect(new URL(ziel, req.url))` ist **falsch** (`req.url` trägt nach dem Rewrite die **interne** Adresse), `ziel` beginnt immer mit `/` |
| `normalisiereCode` (8-E, erste Hälfte) | §7.5.3 | **Teil 2** (`_lib/code.ts`) |
| `normalisiereBarcode` (8-E, zweite Hälfte) | §7.6.2 | **Teil 4** (`_lib/barcode.ts`) — **Consumes von T164** |
| Die Lückenformel des Bestellvorschlags (9-B) | §5.4 | **Teil 3** (`_lib/domain/vorschlag.ts`) |
| Der CSV-**Import** (§9.5) | §9.5 als **Abgrenzung** | **Teil 5** (`_actions/csv.ts`). ⚠️ **Export und Import sind zwei getrennte Formate**; die exportierte `bestellvorschlag.csv` ist weder in den Spalten noch in der Quotierung wieder einlesbar. Der Import behält insbesondere seine **fehlende Quote-Behandlung** — sie 1:1 zu übernehmen ist die einzige Fassung, unter der eine heute funktionierende Importdatei auch morgen funktioniert |
| Was aus `pages.error: "/verwaltung/kein-zugriff"` wird (§11.4) | §3.3 | **Teil 2.** Die Seite **wandert nicht mit**; die Benennbarkeit der Ursache wird an **genau einer** Stelle wiederhergestellt: der `console.warn` bekommt einen neuen Ort im modul-eigenen Zugriffsriegel — erwarteter Gruppenname und tatsächliche Gruppen, **keine Kennung, keine E-Mail, kein Name**, einmal je Person je Prozess |
| Die Ampel-Hexwerte und `_lib/ampel.ts` | §6.6.2 | **Teil 5** (T100). Dieser Plan nennt **keinen** Hexwert außer `#fff`/`#000` auf dem Bogen und `#c8000f` als 3px-Kante in `fehler.module.css` — beides **Marke bzw. Papier**, keine Datenfläche |
| Die 28 klassengebundenen Ersatzanker | §6.11 | **Teil 5** (§7 dort). Dieser Plan setzt **einen** davon: `.etikett img` → `.lb-etikettQr > svg` (T162) |
| Der Datenbank-Snapshot (`lagerbuch-YYYYMMDD.db`) | §10.7 | **Teil 3** bzw. Betreiberfrage 4 (A31: kein Backup-Job, `scripts/backup.sh`). ⚠️ Er ist **kein Ausgabeformat** und steht deshalb nicht in §9 |
| Die fünf Randbedingungen aus §12.6 | §12.6 | **Teil 3** — insbesondere: kein globaler `env`-Block in `vitest.config.ts`, und der Scan „keine `e.message`-Anzeige unter `m/lagerbuch`" |

---

## 13. Die drei Zeilen, die dieser Plan aus dem Bestand mitnimmt, obwohl sie Mängel sind

Sie stehen hier zusammen, damit niemand sie beim nächsten Durchgang „repariert" und dabei einen
Vertrag bricht:

1. **Kein BOM und `\n` statt CRLF in `bestellvorschlag.csv`** (§9.2). Beides ist heutiges Verhalten
   und damit 1:1-Pflicht. Ein nachgerüstetes BOM kann einen Abnehmer stromabwärts brechen, **ohne
   dass es im Modul sichtbar wird** — und es verfehlte ausgerechnet die Kopfzeilenerkennung des
   modul-eigenen Importers.
2. **Der konstante Dateiname `bestellvorschlag.csv` ohne Datum** (§9.2), obwohl wiederholte Downloads
   im Download-Ordner kollidieren — anders als beim Excel-Export. Ein datierter Name wäre eine
   Verbesserung **und eine Formatänderung**.
3. **Der harte `aktiv`-Filter in `etikettenDaten`** (§8.4, Falle 26). Ein deaktivierter Artikel ist
   unter `/a/<id>` **weiterhin vollständig bebuchbar**, aber nie wieder nachdruckbar. Die Menge der
   physisch hängenden Etiketten ist damit **echt größer** als die der druckbaren, und die Differenz
   ist im Repo nicht abzählbar. → **Runbook-Zeile R32.**

Dazu die eine Lücke, die als Lücke **bleibt** und benannt ist: `e2e/lagerbuch-bestand-export.spec.ts`
prüft nur die **Form** des Dateinamens, nie den **Wert** — der entsteht aus **Browserzeit** (§9.4).
`_lib/bestandExport.test.ts` nagelt den Wert gegen ein festes Datum fest; mehr geht nicht, solange
der Name im Browser gebildet wird.
