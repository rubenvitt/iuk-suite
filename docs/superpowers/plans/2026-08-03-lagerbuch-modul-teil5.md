# Modul `lagerbuch` — Implementierungsplan, Teil 5: Verwaltung

> **Für agentische Umsetzer:** PFLICHT-SUB-SKILL `superpowers:subagent-driven-development` (empfohlen)
> oder `superpowers:executing-plans`. Die Tasks sind auf parallele Ausführung geschnitten.
> **Innerhalb einer Wellenstufe dürfen alle genannten Tasks gleichzeitig laufen; über Stufengrenzen
> hinweg nicht.** Die Gates (§4) laufen am Ende **jeder Stufe**.
>
> Jeder Task ist TDD, und zwar **vollständig**: erst der Test, dann **ein Lauf, der FEHLSCHLAGEN
> muss**, dann der Code. **Die 50 Tasks T100–T149 tragen diesen Rot-Schritt alle**, jeder mit der
> konkret erwarteten Meldung — ein Test, den niemand hat rot sehen können, ist kein Test, sondern
> eine Behauptung über eine Datei.
>
> **Ausgenommen sind die drei als „Abnahme" markierten Tasks** (T150, T151, T152): sie prüfen
> zusammengesetztes Verhalten, das zum Zeitpunkt ihrer Entstehung schon gebaut ist. Sie sind von
> Anfang an grün, und das ist **kein** Mangel; statt „Rot, weil …" nennen sie die **Mutation**, die
> sie fangen. ⚠️ **T150 gehört ausdrücklich dazu:** seine vier Subjekte entstehen in T102 und T105,
> rund vierzig Tasks früher — ein „muss FEHLSCHLAGEN" wäre dort eine falsche Behauptung.

**Spec:** `docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md` (11.036 Zeilen, verbindlich).
Dieser Plan deckt **§6 vollständig** (§6.0–§6.15, Spec-Zeilen 5408–7497) — Knoten **F** und
**Außenarbeit 4** aus dem Spec-Anhang.
**Faktenbasis:** `docs/lagerbuch-portierung-analyse.md`. **Querschnitt:** `docs/design/README.md`.
**Projektregeln:** `CLAUDE.md`. **Alt-Anwendung:** `../lagerbuch` @ `ca04eb1` (eingefroren).
**Branch:** `feat/lagerbuch-modul`.

**Ziel:** Die Fläche, an der **gepflegt** wird. `verwaltung/(arbeit)/layout.tsx` mit beiden Riegeln,
die 23 Arbeitsseiten samt ihren Client-Inseln, die geteilten Bausteine (`_ui/ikonen.tsx`,
`_ui/Chip.tsx`, `_ui/Plakette.tsx`, `_ui/VerwaltungsRahmen.tsx`, `_ui/verwaltung.module.css`), die
Werteschichten (`_lib/ampel.ts`, `_lib/schrift.ts`, `_lib/nav.ts`, `_lib/mengen.ts`), die 14
Verwaltungs-Action-Dateien **mit ihren enumerierten `revalidatePath`-Listen** — und die einzige
`core`-Änderung, die §6 verlangt: `.modulnav` bekommt `overflow-x: auto` und `scrollbar-width: thin`.

**Architektur:** Alle 23 Seiten sind Server Components; die Interaktion liegt in routen-lokalen
Client-Inseln. „Sie lädt und rechnet, die Insel bedient" — der Client bekommt fertige Zeichenketten
und fertige Tonnamen, nie ein `Date` und nie einen Hexwert. Ampelfarben tragen eine **fachliche**
Bedeutung und sind deshalb **nicht** Suite-Rot (§6.6.2, Falle 3).

**Tech Stack:** Next.js 16.2.11 (App Router/RSC) · Ant Design 6 · Drizzle 0.45 + better-sqlite3 12.11
· Auth.js v5 (Pocket ID) · Vitest 4 + Playwright · pnpm.

**Plan-Index:** steht in `2026-08-03-lagerbuch-modul-teil1.md`, Abschnitt „Plan-Index — dieser Plan ist
Teil 1 von sechs". Er wird hier **nicht** kopiert; eine zweite Kopie liefe auseinander.

---

## 0. Vorbedingungen

**Teil 1, Teil 2 und Teil 3 sind fertig und eingecheckt.** Ohne sie fehlt jeder Lesepfad, jeder Riegel
und jede Textformatierung. **Teil 4 (Helfer-Weg, §7) entsteht PARALLEL** — die Kopplung zu ihm ist in
§2, F5 und F6 ausgeschrieben und in beide Richtungen ohne Wartepunkt gebaut.

**Für Teil 5 blockiert keine der offenen Betreiberfragen den Baubeginn.** Die Tabelle steht vollständig,
weil eine gekürzte Liste eine stille Herabstufung wäre.

| # | Frage | Antwortet | Blockiert in Teil 5 | Rückfall, mit dem dieser Plan baut |
|---|---|---|---|---|
| — | **Sind Barlow, Barlow Condensed und IBM Plex Mono CD-gebunden?** (Betreiberfrage 29, §6.7.1) | Betreiber | **nichts** — aber sie entscheidet, ob `_ui/verwaltung.module.css` eine vierte Variable `--lb-display` bekommt | **A-S1** (§2): die Verwaltung bekommt **Geist Sans / Geist Mono**, also den Suite-Standard; die drei Google-Schriften werden im Verwaltungszweig **nicht** registriert. Fällt die Antwort „gebunden", kehrt sich genau ein Spiegelstrich um: eine modul-lokale Registrierung nach dem Muster `m/feedback/f/[slugSecret]/Zustaende.tsx:2` plus `--lb-display` in T100. **Die Rollen aus `_lib/schrift.ts` bleiben unverändert** — sie sind als Rollen definiert, nicht als Schriftnamen |
| 7 | In welchem Programm wird `bestellvorschlag.csv` geöffnet? (A29) | Betreiber | **nichts** — die Entscheidung ist gegen beide Antworten robust | Der CSV-Weg selbst ist **§9.2 und damit Teil 6**. Teil 5 baut auf `/verwaltung/bestellung` nur den **Knopf**, der Teil 6s Funktion ruft (T141, Consumes) |
| 4 | Entscheidung 22 — Backup-Job | Betreiber | nichts | in Teil 2 abgehandelt (A31) |
| 5 | `tokens.scope_lagerort_id` als Riegel? (E14) | Betreiber | nichts | kein Riegel; die Spalte bleibt. Betrifft §7.9.1 (Teil 4) |
| 6 | Netz im Lagerraum / in der Fahrzeughalle? (A26) | Betreiber | nichts | betrifft §7.10 (Teil 4) |
| 8 | Stehen Hersteller-EANs im Bestand? (A25) | Betreiber | nichts | betrifft §7.6.2 (Teil 4) |
| 9 | Abgelöste Domain als zweiter Host? (E16 b) | Betreiber | nichts | Spec 2 (Cutover) |

**Keine dieser Fragen darf durch eine erfundene Vorbelegung ersetzt werden.** Wo dieser Plan einen
Wert nennt, ist er in der Spec belegt oder als Annahme (`A-S…`) markiert.

**Zwei Zeilen, die dieser Plan dem Cutover-Runbook schuldet** (§6.14) — sie sind **keine** Rückfrage,
die Begründung trägt die Entscheidung, aber sie gehören in die Ankündigung und nicht in die
Überraschung danach:

1. **Die Ampelfarben ändern sich sichtbar.** Gelb wird dunkler (`#b26a00` → `#8a5200`), Rot bekommt
   einen eigenen Ton (`#c8000f` → `#8c0d16`). Grund: Luminanz-Monotonie und ein **bestehender**
   AA-Verstoß bei `chip-gelb` (3,78 : 1). Helfer und Verwaltende kennen die heutigen Farben vom
   Etikett und aus dem Fahrzeug.
2. **Die Wortmarke „LAGERBUCH" verschwindet aus dem Verwaltungsbereich** und wird durch den Modultitel
   der Suite-Kopfzeile ersetzt (§6.1.2). Sie überlebt dort, wo sie Wiedererkennung leistet — auf dem
   Gate und im Helfer-Rahmen (Teil 4, §7.1).
3. Dazu die zwei Zeilen, die §6.14 wörtlich verlangt: „Verwaltungsoberfläche im Dunkelmodus einmal
   durchgesehen (drei Seiten)" und „Etikettenbogen einmal auf echtem Papier gedruckt und gegen einen
   alten Ausdruck gehalten" (die zweite löst **Teil 6** ein, §8.4 R30).

---

## 1. Festlegungen dieses Plans, die die Spec offen lässt

Vierzehn Punkte. Jeder ist eine Entscheidung **dieses** Plans, keine Ableitung — sie stehen hier
beisammen, damit Teil 4 und Teil 6 sie nicht ein zweites Mal treffen. Die Punkte H1–H14 setzen die
Nummernkreise F… (Teil 1) und G… (Teil 2) fort.

**H1 — Der Nummernkreis dieses Plans beginnt bei T100.** Teil 1 vergibt T1–T14, Teil 2 T15–T27,
Teil 3 T28–T61. **Teil 4 entsteht parallel zu diesem Plan** und bekommt den Kreis **T62–T99**
reserviert; Teil 5 beginnt deshalb bei **T100** und endet bei T152. Teil 6 setzt bei **T153** fort.
⚠️ Ohne diese Reservierung vergäben zwei gleichzeitig geschriebene Pläne dieselben Nummern, und die
Task-Verweise in den Commit-Texten wären mehrdeutig.

**H2 — `_lib/ampel.ts` führt KEINEN eigenen Typ `Ton`; der Tonname heißt `AmpelTon` und kommt aus
`_lib/format.ts`.** §6.6.2 schreibt `export type Ton = "rot" | "gelb" | "ok" | "grau"`. Genau diese
Menge exportiert **Teil 3 bereits** als `export type AmpelTon` aus `_lib/format.ts` (T39), zusammen
mit `ampelTon(a: Ampel | null): AmpelTon` und `FaelligChip = { ton: AmpelTon; text: string }` — und
Teil 3 stellt dazu ausdrücklich die **Auflage H5** an diesen Plan: „`_lib/ampel.ts` bildet exakt die
vier Tonnamen aus `format.ts#ampelTon` ab". Zwei Namen für **eine** Menge wären genau die
Typinkonsistenz, gegen die die `Produces`-Blöcke geschrieben sind. → **`_lib/ampel.ts` importiert
`type AmpelTon` (type-only, kein Laufzeit-Zyklus) und re-exportiert ihn nicht unter einem zweiten
Namen.** `_ui/Chip.tsx` nimmt `ton: AmpelTon`.
⚠️ Aus demselben Grund deklariert `_lib/ampel.ts` **kein** `export type Ampel`: der Typ wohnt seit
Teil 3 in `_lib/domain/verfall.ts` (T28) und ist „die gemeinsame Sprache von vier Fachbereichen".

**H3 — `toggleInSet` liegt in `_lib/mengen.ts`.** §6.9.4 Punkt 4 sagt nur „wandert als generische
Mengenoperation nach `_lib/`", nennt aber keine Datei. `_lib/suche.ts` (T5) ist besetzt und trägt die
Faltung; `_lib/format.ts` ist Text und Tonnamen. Eine generische Mengenoperation gehört in keine von
beiden. → **`src/app/m/lagerbuch/_lib/mengen.ts`**, ein Export.

**H4 — `useUrlFilter` liegt in `_ui/useUrlFilter.ts` und ist die EINZIGE Datei des Moduls mit
`usePathname`.** §5.14.1 und §6.3.4 legen Ort und Ausnahme fest, nennen aber keinen Dateinamen. Ein
Hook ist kein Bedienelement — er bekommt trotzdem eine eigene Datei unter `_ui/`, weil §2.1 ihn dort
verortet und weil der `usePathname`-Scan aus Teil 4 (§7.8.2) **eine namentlich benannte Ausnahme**
braucht und keine Datei mit wechselndem Inhalt. ⚠️ **Der Scan gehört Teil 4** (`_lib/bauform.test.ts`,
Erweiterung); dieser Plan schreibt **keinen zweiten**.

**H5 — Der `AMPEL ↔ CSS`-Scan (§6.6.2a Punkt 4) entsteht in der EIGENSCHAFTSFORM.** §6.6.2a verlangt
den Scan über `_ui/verwaltung.module.css` **und** `_ui/helfer.module.css`. Die zweite Datei gehört
**Teil 4** und existiert am Tag von T100 nicht. Ein Scan, der beide Dateien hart verlangt, ist am
ersten Tag **rot** — und ein am ersten Tag roter Scan wird abgeschaltet statt repariert (dieselbe
Lehre wie Teil 1, F4). → **T100 schreibt den Scan so, dass er über jede *vorhandene*
`_ui/*.module.css` läuft und eine fehlende Datei toleriert; er verlangt mindestens
`verwaltung.module.css`.** Sobald Teil 4 `helfer.module.css` anlegt, greift er dort **ohne dass
jemand ihn anfasst**. Die **Verschärfung** auf „beide Dateien existieren" ist namentlich **T152**
(Abnahme dieses Plans, Schritt 6) zugewiesen — sie läuft erst, wenn Teil 4 eingecheckt ist, und wird
dort als bedingter Schritt ausgeführt.

**H6 — `_ui/ikonen.tsx` und `_ui/ikonen.test.ts` gehören TEIL 5, mit allen 36 Namen.** §6.5.1 Punkt 4
und §6.5.2 sagen: „dieselbe Datei" wie §7.7.4, und „wo §7.7.4 nur die achtzehn Zeichen des
Helfer-Wegs nennt, führt dieser Abschnitt die **vollständige** Union". Da beide Pläne parallel
entstehen, wird die Eigentümerschaft hier hart gezogen: **Teil 5 legt die Datei mit der vollständigen
36er-Union an (T101); Teil 4 importiert sie und ergänzt keinen Namen.** Braucht der Helfer-Weg ein
37. Zeichen, ergänzt es **T101s Datei** — und `ikonen.test.ts` (ebenfalls T101) schlägt an, wenn ein
`.tsx` einen Namen benutzt, der nicht in `PFADE` steht.

**H7 — `_actions/buchung.ts` gehört vollständig Teil 5, einschließlich `bucheEntnahmeHelfer`.**
Teil 2 nennt die Datei als Teil-4-Konsumenten von `requireHelferSchreibend`, Teil 3 weist sie
(T57-Konsumenten, T54-Konsumenten) **Teil 5** zu. Beides ist auflösbar, aber nicht beides zugleich
wahr: eine Datei hat **einen** Eigentümer. → **Teil 5 baut alle drei Buchungs-Actions in einer Datei**
(`bucheZugang`, `bucheEntnahme`, `bucheEntnahmeHelfer`), weil sie sich `fefoAbbuchung` und dieselbe
Zod-Basis teilen; Teil 4 **ruft** `bucheEntnahmeHelfer` aus `_ui/Entnahme.tsx` und legt keine
zweite Datei an. ⚠️ `_actions/check.ts` bleibt **Teil 4** — obwohl seine sechs `revalidatePath`
Verwaltungspfade tragen (§3, Zeile `check.ts`). Diese sechs Pfade stehen in der Tabelle in §3 mit,
damit Teil 4 sie nicht fallen lässt.

**H8 — `_lib/lesepfade/tokens.ts` und `_actions/tokens.ts` gehören Teil 5; Teil 6 ERWEITERT sie.**
Teil 3 hat `tokenListe` bewusst nach Teil 6 geschoben („Tokens sind Kapitel 8"). Damit wäre
`/verwaltung/tokens` (§6.2.2, Zeile 22 — **eine Seite dieses Kapitels**) in Teil 5 nicht baubar: die
Seite hätte keinen Lesepfad und keine Action. Eine plan-übergreifende Reihenfolge innerhalb einer
Welle ist die schlechtere Lösung als eine benannte Erweiterung. → **Teil 5 baut `tokenListe`,
`createToken` und `setTokenAktiv` (T126) in der Form des Bestands**; **Teil 6 erweitert sie** um
Alphabet/Länge/Kollision/Ablauf aus §8.3 und um **Entscheidung 8-F** (Hard-Delete entfällt, nur noch
sperren). Fällt 8-F so aus, entfernt Teil 6 auf `/verwaltung/tokens` den `LoeschDialog`-Aufruf — nicht
den Dialog.

**H9 — Eine Seite und ihre routen-lokalen Inseln sind EIN Task.** Die einzige Ausnahme ist
`_ui/ArtikelDrawer.tsx` (393 Zeilen im Bestand, sechs Belange, §6.2.3): er bekommt einen eigenen Task
in einer **früheren** Welle, damit `ArtikelTable` ihn importieren kann, ohne dass zwei Tasks in
derselben Wellenstufe voneinander abhängen. Er liegt in `_ui/` und nicht in `verwaltung/(arbeit)/
artikel/`, weil zwei Tasks ihn sonst als „ihre" Routendatei ansähen.

**H10 — Die Spaltenreihenfolge jeder `Table` wird ABGELESEN, nicht entschieden.** §6.12, Frage 7 ist
dazu wörtlich: „die Spalten bleiben, wie sie sind. Der Umbau auf `Table` ist ein Trägerwechsel, keine
Gelegenheit zum Aufräumen von Spalten." Verbindlich für jeden Seitentask: die Spalten stehen in der
Reihenfolge, in der die Felder heute in der Zeile stehen — bei den zwei echten `<table>` in
`<thead>`-Reihenfolge, bei den elf Kartenlisten in der Reihenfolge `rowname` → `rowmeta` (links nach
rechts) → rechter Block (`bignum`) → Zeilenaktion. **Die abgelesenen Reihenfolgen stehen je Seitentask
in dessen `columns`-Array ausgeschrieben.** Das ist keine Festlegung dieses Plans, sondern eine
Ableitung — sie steht hier nur, damit niemand sie für frei hält.

**H11 — Es gibt genau eine Modul-CSS-Datei der Verwaltung, und sie heißt `_ui/verwaltung.module.css`.**
Sie trägt `.modul` (den Variablenträger), den Fokusring, den Chip, die KPI-Kachel, die Brotkrume, die
Fachnummer, die Warn-/Infobox, die Gefahrenzone, die Journalzeile und die Trefferanzeige — zusammen
die ~40 Zeilen aus Eimer C (§6.8.4), die der Verwaltung zufallen. **Keine `@media`-Abfrage** (§6.8.6,
Punkt 2); wird eine nötig, heißt sie `max-width: 767.98px`.

**H12 — Die vier `*AktivToggle` werden NICHT zu einer Komponente zusammengelegt.** Sie sehen gleich
aus (je 16 Zeilen im Bestand), rufen aber **vier verschiedene Actions** in vier verschiedenen Dateien
(`setFahrzeugAktiv`, `setGeraetAktiv` aus `bz.ts`, `setGeraetAktiv` aus `geraete.ts`,
`setFlascheAktiv`). Eine gemeinsame Komponente bräuchte die Action als Prop — und eine Server Action
als Prop aus einer Server Component in eine Client-Insel ist zwar erlaubt, macht aber aus vier
trivialen Dateien eine Indirektion, die den Zusammenhang „welcher Knopf ruft was" verdeckt. Genau
diesen Zusammenhang muss §6.12, Frage 1 abhaken. → **Vier Dateien, je bei ihrer Seite.**

**H13 — Die Ersatzanker aus §6.11 werden mit `data-testid` NUR dort gesetzt, wo keine Rolle trägt.**
§12.3 verlangt Rollen und Beschriftungen; `data-testid` ist der zweite Weg, nicht der erste. In diesem
Plan gibt es genau **zwei** `data-testid`: `data-testid="trefferanzeige"` (die „X von Y"-Anzeige hat
keine eigene Rolle und ist ein `<span>`) und `data-testid="modulnav"` — das existiert bereits in
`core/shell/SuiteNav.tsx:178` und wird **nicht** neu gesetzt. Alles andere greift über
`getByRole`/`getByLabel`.

**H14 — Dieser Plan schreibt EINE E2E-Datei, `e2e/lagerbuch-verwaltung.spec.ts`.** Teil 1 weist „die
E2E-Dateien" pauschal Teil 6 zu; §6.3.2 und §6.3.4 verlangen aber vier Playwright-Zusicherungen, deren
Subjekt **ausschließlich** in diesem Plan entsteht (`aria-current` über `LAGERBUCH_NAV`,
`scrollWidth` bei 1280×720 gegen die `.modulnav`-Reparatur). Sie hier zu schreiben, ist billiger als
sie zu beschreiben und weiterzureichen. **Teil 6 schreibt die übrigen** (`etiketten.spec.ts` samt
Druck-Emulation und dem Riegel-Abruf aus §6.1.3, die umgeschriebenen Alt-Specs). Es entsteht **keine
zweite** Navigations-Spec.

---

## 2. Global Constraints — was ZUSÄTZLICH aus §6 folgt

**Die Global Constraints aus Teil 1 (`…-teil1.md`, Abschnitt „Global Constraints") gelten unverändert
weiter und werden hier NICHT wiederholt.** Insbesondere: kein `"use client"` unter `_lib/`/`_db/`,
Client-Pfade in **äußerer** Form / `revalidatePath` in **innerer** Form, kein
`isModuleAdmin`/`session.user.isAdmin`, DOM-Tests über `@/app/m/qr/_lib/test-dom`.

Hier stehen nur die Constraints, die **aus §6** folgen. Die Anforderungen jedes Tasks schließen sie
implizit ein.

**Bauform der Oberfläche**

- **Alle 23 `page.tsx` sind Server Components.** Keine trägt `"use client"` — im Bestand tut es keine
  einzige, und die Aufteilung wird nicht umgebaut (§6.2.1).
- **Kein antd-Compound in einer `page.tsx`.** Verboten: `Typography.*`, `Form.Item`,
  `Descriptions.Item`, `List.Item`, `Card.Meta`, `Collapse.Panel`, `Breadcrumb.Item`, `Input.Group`,
  `Input.TextArea`, `Space.Compact`, `Statistic.Countdown`, `Table.Summary`, `Tag.CheckableTag`,
  `Badge.Ribbon`, `Layout.Header`, `Grid.useBreakpoint` (Falle 1, `docs/design/README.md:38-43`).
  **Überschriften sind nacktes `<h1>`/`<h2>` mit einer Rolle aus `_lib/schrift.ts`.**
- **Kein `@ant-design/icons` in IRGENDEINER Datei unter `src/app/m/lagerbuch/`** — auch nicht in einer
  Client-Insel (§6.5.1). Alle Zeichen kommen aus `_ui/ikonen.tsx`. **Kein `lucide-react`** — die Suite
  führt das Paket gar nicht.
- **Jede `Table` setzt `pagination` ausdrücklich; die Vorgabe ist `pagination={false}`** (§6.4.1
  Punkt 1, §6.9.3). Auf `/verwaltung/journal` und `/verwaltung/checks` ist das keine Formalie, sondern
  die Datenaussage selbst.
- **Jede `Table` ohne Spaltenbreiten setzt `scroll={{ x: "max-content" }}`.** Keine Spalte trägt
  `fixed`, `ellipsis` oder `scroll.y` — sonst schaltet rc-table auf `table-layout: fixed` und **das
  Desktop-Bild ändert sich**, ohne dass etwas überläuft (`docs/design/README.md:176-178`).
- **`rowKey` ist immer die fachliche Kennung, nie der Index** (§6.4.1 Punkt 3).
- **`size` wird NICHT gesetzt.** `controlHeight: 56` ist bereits das richtige Maß, `size="large"` wäre
  72px (Falle 4). **Genau eine Ausnahme:** Zeilenaktionen **innerhalb** einer Tabellenzeile tragen
  `size="small"` (§6.4.1 Punkt 4, `docs/design/README.md:61-62`).
- **Eine anklickbare Zeile (`onRow`) ist die Zugabe, nie der einzige Weg.** Die erste Spalte trägt
  zusätzlich einen echten `<Link>` bzw. `<Button>` mit dem Namen als Beschriftung (§6.4.1).
- **`antd Form` + `Form.Item` nur in Client-Inseln, und nur wo es einen Absendeknopf gibt** (§6.4.7).
  Jedes Feld, das **beim Ändern** speichert, steht **außerhalb** eines `Form` — sonst gibt es drei
  Zustandsquellen (Serverwert, lokaler Spiegel, `Form`-Store; Falle 45).
- **Fehler kommen als Rückgabewert am Feld an, nie über `e.message`.** `e.message` ist in Produktion
  der englische Satz (Falle 66, §11.2 (d), §11.7).

**Farbe**

- **Ampel-Rot ist `#8c0d16`, NICHT Suite-Rot `#c8000f`** (§6.6.2). In einem Modul, in dem Rot fachliche
  Bedeutung trägt, gehört Suite-Rot nie auf eine Datenfläche (Falle 3).
- **`Alert type="error"` erscheint in diesem Modul NIRGENDS** (§6.6.5, §11.6). Warnungen sind
  `type="warning"` oder Text mit 3px linker Kante.
- **Kein `Tag` für Statuschips** — eigenes Markup mit `_ui/Chip.tsx` (§6.6.3). **Kein `Statistic` mit
  farbigem `valueStyle`** — `Card` plus farbige linke Kante (§6.6.4).
- **`--ant-*` kommt in eigenem Markup nie vor; `--lb-*` kommt in antd-Props nie vor** (§6.6.6, Falle 2).
  `shell-css.test.ts:97-98` und `not-found.test.tsx:92-93` verbieten das erste repo-weit.
- **Der Moduswechsel ist `<html data-theme>`, nie `prefers-color-scheme`** (§6.6.6 Punkt 3).
- **Alle `--lb-*`- und `--lb-ampel-*`-Variablen liegen auf `.modul`** — dem äußersten Element von
  `_ui/VerwaltungsRahmen.tsx` **und** `_ui/DruckRahmen.tsx` (Teil 6). Ohne den Träger löst jedes
  `var(--lb-…)` ins Leere auf, fällt auf `transparent` zurück und ist **gültiges CSS** (§6.1.2).

**Schrift**

- **`font-variant-numeric: tabular-nums` überall, wo Ziffern verglichen werden** (§6.7.3): jede
  Zahlenspalte jeder `Table`, die KPI-Zahlen, `InputNumber`, die Journal-Deltas, die Ziffern der
  Plakette.
- **Kein Selektor unter `m/lagerbuch/` setzt eine Schriftgröße unter 16px auf ein Eingabeelement** —
  weder in Lang- noch in Kurzschreibweise (§6.7.3). Der Suite-Riegel
  `core/theme/feldschrift.test.ts:114-141` hat dafür zwei Lücken.
- **Die 21 px-Größen des Bestands werden sechs Rollen** in `_lib/schrift.ts`; alle liegen auf antds
  Leiter (12/14/16/20/24/30). Die Halbpixelwerte fallen.

**Navigation und Pfade**

- **`LAGERBUCH_NAV` führt alle 15 Ziele; kein `/`-Eintrag** (§6.3.1, §6.3.3). Ein Wurzeleintrag wäre
  der Rückfall für **jede** nicht getroffene Seite — und der äußere Modulwurzelpfad ist **das Gate**.
- **Die `href` tragen die ÄUSSERE Pfadform** (`/verwaltung/artikel`). Innere `href` kehrten die
  Suffix-Regel um und ließen die Markierung auf dem **Normalweg** verschwinden (§6.3.3).
- **Neun Detailseiten tragen eine Brotkrume**, weil `aktiverEintrag` sie nicht markiert: `bz/[id]` ·
  `bz/[id]/kontrolle` · `bz/scan` · `checks/[id]` · `fahrzeuge/[id]` · `geraete/[id]` ·
  `geraete/scan` · `sauerstoff/[id]` · `vorlagen/[id]` (§6.3.3).
- **Die Brotkrume ist eigenes Markup, kein antd-`Breadcrumb`.** Ob `Breadcrumb` in der RSC-Ebene lädt,
  ist **nicht gemessen**, und `Breadcrumb.Item` steht auf der Verbotsliste (§6.3.3).
- **`usePathname` kommt unter `src/app/m/lagerbuch/` nur in `_ui/useUrlFilter.ts` vor** (§6.3.4, H4).

**Suchen und Filtern**

- **Kein Regimewechsel.** Sechs Listen filtern clientseitig über eine vollständig geladene Liste
  (Regime A), zwei Seiten serverseitig über `searchParams` (Regime B). Wer die Journalsuche in antds
  `Table`-eigene Filter legte, suchte in den geladenen 100 Zeilen statt in der Historie (§6.9.1).
- **Die sechs Suchfeldmengen sind sechs einzeln zu portierende Zusicherungen** (§6.9.4, §5.13.3
  Auflage 7). Ein globales `Table`-Suchfeld ersetzt sie nicht.
- **Die Trefferanzeige „X von Y" erscheint nur bei `gezeigt !== gesamt`** und ist eigenes Markup, kein
  antd-Pager (§6.9.5, §5.13.3 Auflage 8).
- **Gefiltert wird, BEVOR die Liste in `dataSource` geht** — dann gibt es genau **eine** abgeleitete
  Liste, und Tabelle wie Excel-Export lesen dieselbe (§6.9.4 Punkt 1, §6.9.5 zweitens).
- **Jedes `Select showSearch` setzt `filterOption` ausdrücklich** und filtert über `label + keywords`
  (§6.4.3 Bedingung 1). Ohne das tippt jemand ein Kennzeichen und findet nichts — kein Fehler, keine
  Meldung, nur ein leeres Auswahlfeld.
- **Das Suchfeld ist `<Input type="search">`, nie `Input.Search`** (§6.9.2 Punkt 1+2). Die Rolle
  `searchbox` entsteht **allein** aus `type="search"`.
- **`von`/`bis` sind zwei `DatePicker`, nie ein `RangePicker`** (§6.9.2 Punkt 4). Ein `RangePicker`
  machte aus zwei unabhängigen URL-Parametern ein Wertepaar.

---

## 3. Die `revalidatePath`-Listen — enumeriert, nicht behauptet

**Warum diese Tabelle hier steht.** §6.15, Auflage 5 löst die `revalidatePath`-**Listen** ausdrücklich
**nicht** ein und verweist auf §15.3 Nr. 23 („ausdrücklich NICHT Teil dieser Spec"). Der Grund dort ist
Umfang, nicht Unklarheit: es sind **61 Bestandsaufrufe**, und sie sind **enumerierbar**. Dieser Plan
weicht deshalb bewusst nach oben ab und liefert sie — „revalidiere die passenden Pfade" wäre ein
Planfehler nach den Regeln dieses Dokuments.

**Die Enumeration.** Gemessen am 04.08.2026 gegen `../lagerbuch` @ `ca04eb1`:

```bash
cd ../lagerbuch && grep -rn "revalidatePath" src/ | grep -v "\.test\.ts" | grep -v "^src/app/" | wc -l
```

**61** Aufrufe in 15 Dateien (`artikel` 4 · `aussondern` 3 · `bestellung` 2 · `buchung` 7 · `bz` 6 ·
`check` 6 · `csv` 1 · `fahrzeuge` 9 · `geraete` 4 · `inventur` 3 · `lagerort-verfall` 3 · `loeschen` 2
Schleifen über eine 6-zeilige Tabelle · `sauerstoff` 6 · `templates` 3 in einem Helfer · `tokens` 2).
Die Zeile `import { revalidatePath }` ist mitgezählt worden, wo `grep` sie liefert — die Tabelle unten
zählt **Aufrufe**, nicht Zeilen.

⚠️ **Alle 61 Bestandsaufrufe übergeben die ÄUSSERE Pfadform.** Im Zielmodul liegt jede Route unter
`/m/lagerbuch/…`; `revalidatePath` arbeitet gegen den **internen** Pfad (Teil 1, Global Constraints).
Die Umrechnung geschieht **einmal, hier** — 15 Neuableitungen sind die Stelle, an der ein
`/m/lagerbuch`-Präfix verlorengeht.

**Die verbindlichen Listen, in innerer Form:**

| Task | Datei | Action | `revalidatePath`-Liste (innere Form) | Bestandsbeleg |
|---|---|---|---|---|
| T113 | `_actions/artikel.ts` | `createArtikel` | `/m/lagerbuch/verwaltung/artikel` | `artikel.ts:21` |
| T113 | | `updateArtikel` | `/m/lagerbuch/verwaltung/artikel` | `:31` |
| T113 | | `setArtikelAktiv` | `/m/lagerbuch/verwaltung/artikel` · `/m/lagerbuch/verwaltung` | `:39-40` |
| T114 | `_actions/buchung.ts` | `bucheZugang` | `/m/lagerbuch/verwaltung/artikel` · `/m/lagerbuch/verwaltung` | `buchung.ts:44-45` |
| T114 | | `bucheEntnahme` | `/m/lagerbuch/verwaltung/artikel` · `/m/lagerbuch/verwaltung` | `:72-73` |
| T114 | | `bucheEntnahmeHelfer` | `` /m/lagerbuch/a/${artikelId} `` · `/m/lagerbuch/helfer` · `/m/lagerbuch/verwaltung` | `:89-91` |
| T115 | `_actions/aussondern.ts` | `aussondern` | `/m/lagerbuch/verwaltung/verfall` · `/m/lagerbuch/verwaltung/artikel` · `/m/lagerbuch/verwaltung` | `aussondern.ts:44-46` |
| T116 | `_actions/inventur.ts` | `inventurKorrektur` | `/m/lagerbuch/verwaltung/inventur` · `/m/lagerbuch/verwaltung/artikel` · `/m/lagerbuch/verwaltung` | `inventur.ts:49-51` |
| T117 | `_actions/bestellung.ts` | `markiereBestellt` | `/m/lagerbuch/verwaltung/bestellung` · `/m/lagerbuch/verwaltung` | `bestellung.ts:15-16` |
| T118 | `_actions/fahrzeuge.ts` | `createFahrzeug` | `/m/lagerbuch/verwaltung/fahrzeuge` | `fahrzeuge.ts:17` |
| T118 | | `setFahrzeugAktiv` | `/m/lagerbuch/verwaltung/fahrzeuge` | `:26` |
| T118 | | `sollPositionSetzen` | `/m/lagerbuch/verwaltung/fahrzeuge` · `` /m/lagerbuch/verwaltung/fahrzeuge/${fahrzeugId} `` | `:54-55` |
| T118 | | `sollPositionEntfernen` | `` /m/lagerbuch/verwaltung/fahrzeuge/${row.fahrzeugId} `` (nur wenn `row`) · `/m/lagerbuch/verwaltung/verfall` · `/m/lagerbuch/verwaltung/fahrzeuge` | `:82-84` |
| T118 | | `sollPositionWiederherstellen` | `` /m/lagerbuch/verwaltung/fahrzeuge/${row.fahrzeugId} `` (nur wenn `row`) · `/m/lagerbuch/verwaltung/fahrzeuge` | `:94-95` |
| T119 | `_actions/templates.ts` | **alle elf**, über den Helfer `revalidate(fahrzeugId?)` | `/m/lagerbuch/verwaltung/vorlagen` · `/m/lagerbuch/verwaltung/fahrzeuge` · `` /m/lagerbuch/verwaltung/fahrzeuge/${fahrzeugId} `` (nur wenn übergeben) | `templates.ts:10-14` |
| T120 | `_actions/lagerortVerfall.ts` | `verfallSetzen` | `` /m/lagerbuch/verwaltung/fahrzeuge/${lagerortId} `` · `/m/lagerbuch/verwaltung/fahrzeuge` · `/m/lagerbuch/verwaltung/verfall` | `lagerort-verfall.ts:38-40` |
| T121 | `_actions/geraete.ts` | `geraetSpeichern` | `/m/lagerbuch/verwaltung/geraete` · `` /m/lagerbuch/verwaltung/geraete/${id} `` | `geraete.ts:50-51` |
| T121 | | `setGeraetAktiv` | `/m/lagerbuch/verwaltung/geraete` · `` /m/lagerbuch/verwaltung/geraete/${id} `` | `:60-61` |
| T121 | | `geraetZuBarcode` | **keine** — die Action liest nur | — |
| T122 | `_actions/bz.ts` | `geraetSpeichern` | `/m/lagerbuch/verwaltung/bz` · `` /m/lagerbuch/verwaltung/bz/${id} `` | `bz.ts:51-52` |
| T122 | | `setGeraetAktiv` | `/m/lagerbuch/verwaltung/bz` · `` /m/lagerbuch/verwaltung/bz/${id} `` | `:61-62` |
| T122 | | `kontrolleErfassen` | `/m/lagerbuch/verwaltung/bz` · `` /m/lagerbuch/verwaltung/bz/${geraetId} `` | `:147-148` |
| T122 | | `geraetZuBarcode` | **keine** — die Action liest nur | — |
| T123 | `_actions/sauerstoff.ts` | `flascheSpeichern` | `` /m/lagerbuch/verwaltung/sauerstoff/${id} `` (**nur beim Ändern**, nicht beim Anlegen) · `/m/lagerbuch/verwaltung/sauerstoff` | `sauerstoff.ts:26,32` |
| T123 | | `setFlascheAktiv` | `/m/lagerbuch/verwaltung/sauerstoff` · `` /m/lagerbuch/verwaltung/sauerstoff/${id} `` | `:41-42` |
| T123 | | `messungErfassen` | `/m/lagerbuch/verwaltung/sauerstoff` · `` /m/lagerbuch/verwaltung/sauerstoff/${flascheId} `` | `:59-60` |
| T124 | `_actions/loeschen.ts` | `loescheElement`, `deaktiviereElement` — **beide über dieselbe Tabelle** `REVALIDATE[art]` | `artikel` → `/m/lagerbuch/verwaltung/artikel`, `/m/lagerbuch/verwaltung` · `fahrzeug` → `/m/lagerbuch/verwaltung/fahrzeuge`, `/m/lagerbuch/verwaltung` · `token` → `/m/lagerbuch/verwaltung/tokens` · `bzGeraet` → `/m/lagerbuch/verwaltung/bz` · `o2Flasche` → `/m/lagerbuch/verwaltung/sauerstoff` · `geraet` → `/m/lagerbuch/verwaltung/geraete` | `loeschen.ts:41-48,173,190` |
| T124 | | `pruefeLoeschbar` | **keine** — die Action liest nur | — |
| T125 | `_actions/csv.ts` | `importArtikelCsv` | `/m/lagerbuch/verwaltung/artikel` | `csv.ts:51` |
| T125 | `_actions/detail.ts` | `getDetail` | **keine** — die Action liest nur | — |
| T126 | `_actions/tokens.ts` | `createToken` | `/m/lagerbuch/verwaltung/tokens` | `tokens.ts:51` |
| T126 | | `setTokenAktiv` | `/m/lagerbuch/verwaltung/tokens` | `:61` |
| **Teil 4** | `_actions/check.ts` | `checkAbschluss` | `/m/lagerbuch/helfer/check` · `/m/lagerbuch/verwaltung/checks` · `/m/lagerbuch/verwaltung` · `/m/lagerbuch/verwaltung/sauerstoff` · `/m/lagerbuch/verwaltung/verfall` · `/m/lagerbuch/verwaltung/fahrzeuge` | `check.ts:170-175` |

⚠️ **Die letzte Zeile gehört Teil 4 und steht hier trotzdem.** `checkAbschluss` ist die Action mit den
**meisten** Verwaltungspfaden im ganzen Modul — ein Fahrzeug-Check ändert Bestand, Sauerstoff, Verfall
und Fahrzeugstatus auf einmal. Fällt einer der sechs Pfade weg, zeigt eine Verwaltungsseite nach einem
Check **veraltete Zahlen**, ohne dass irgendwo etwas kaputt aussieht. Sie steht deshalb in dieser
Tabelle, damit Teil 4 sie nicht neu erfinden muss.

⚠️ **Drei Feinheiten, die man beim Abschreiben verliert:**

1. **`sollPositionEntfernen` und `sollPositionWiederherstellen` revalidieren den Fahrzeugpfad nur,
   wenn die Zeile gefunden wurde** (`if (row)`, `fahrzeuge.ts:82,94`). Die ID kommt aus der gelöschten
   Zeile — nach dem Löschen gibt es sie nicht mehr, deshalb wird sie **vorher** gelesen.
2. **`flascheSpeichern` revalidiert den Detailpfad nur beim Ändern** (`sauerstoff.ts:26` steht **im**
   `if (v.id)`-Zweig). Beim Anlegen gibt es die Detailseite noch nicht.
3. **`templates.ts` hat genau EINEN Revalidierungs-Helfer für elf Actions.** Wer ihn auflöst und je
   Action ausschreibt, hat elf Stellen, an denen die Liste auseinanderlaufen kann. Der Helfer wandert
   **mit**, nur die drei Pfade werden auf die innere Form gezogen.

---

## 4. Gates am Ende jeder Wellenstufe

```bash
pnpm typecheck        # muss grün sein
pnpm lint             # Fehler blockieren, Warnungen nicht
pnpm vitest run       # muss grün sein
pnpm build            # muss grün sein
```

**Ab Welle 4 zusätzlich** (dort entsteht die erste Route dieses Plans):

```bash
pnpm exec playwright test
```

**Was diese Gates strukturell NICHT sehen** (§12.4, `CLAUDE.md:9-46`) — und deshalb in T151/T152 als
**Abruf gegen einen laufenden Server** nachgeholt wird:

| Fehlerklasse | Warum kein Gate sie sieht | Wo sie hier nachgeholt wird |
|---|---|---|
| antd-Compound in einer Server Component | `typecheck` sieht ein gültiges Namespace-Member, `build` rendert nicht | T151, Schritt 2 (Abruf aller 23 Routen) |
| `@ant-design/icons` in der RSC-Ebene | Vitest lädt `react` über die `default`-Bedingung, die Icons rendern klaglos | T151, Schritt 2 · Scan in T101 |
| Ein **WERT** aus einem `"use client"`-Modul in einer Server Component | Unter Vitest ist `"use client"` ein wirkungsloser String | T151, Schritt 2 |
| Kaskadenkollision zwischen Modul-CSS und antd-CSS | Ein Quelltext-Scan kennt Reihenfolge und Fremd-Stylesheets nicht | T151, Schritt 3 (1280px) |
| Dunkelmodus | **Kein Gate der Suite rendert ein Modul im Dunkelmodus** | T151, Schritt 4 (drei Seiten, beide Modi) |
| Nicht auflösbare `--lb-*`-Variable (fehlender `.modul`-Träger) | fällt auf `transparent` zurück und ist gültiges CSS; der Scan aus §6.6.2a bleibt **grün** | T151, Schritt 4 |
| `aria-current` unter dem Proxy-Rewrite | `SuiteNav.test.tsx:48` mockt `next/navigation` und sagt es über sich selbst (`:263-266`) | T150 (Playwright) |
| Waagerechter Überlauf durch 15 Navigationseinträge | bei 390px sind die richtige und die kaputte Fassung nicht zu unterscheiden | T150, 1280×720 |

---

## 5. Datei-Eigentümerschaft — mechanisch prüfbar

Jede Datei gehört genau einem Task. Wer in einer fremden Datei arbeitet, hat den Schnitt verlassen.
Pfade ohne Präfix liegen unter `src/app/m/lagerbuch/`.

| Datei | Task |
|---|---|
| `_lib/ampel.ts`, `_lib/ampel.test.ts`, `_ui/verwaltung.module.css` | T100 |
| `_ui/ikonen.tsx`, `_ui/ikonen.test.ts` | T101 |
| `_lib/nav.ts`, `_lib/nav.test.ts` | T102 |
| `_lib/schrift.ts`, `_lib/schrift.test.ts` | T103 |
| `_lib/mengen.ts`, `_lib/mengen.test.ts` | T104 |
| `src/core/shell/shell.module.css`, `src/core/shell/shell-css.test.ts` | **T105** (eigener Commit) |
| `_ui/Chip.tsx`, `_ui/Chip.test.tsx` | T106 |
| `_ui/Plakette.tsx`, `_ui/Plakette.test.tsx` | T107 |
| `_ui/Kachel.tsx`, `_ui/SeitenKopf.tsx`, `_ui/Brotkrume.tsx`, `_ui/seitenbausteine.test.tsx` | T108 |
| `_ui/useUrlFilter.ts`, `_ui/Suchfeld.tsx`, `_ui/Trefferanzeige.tsx`, `_ui/filter.test.tsx` | T109 |
| `_lib/loeschen.ts`, `_ui/LoeschDialog.tsx`, `_ui/LoeschButton.tsx`, `_ui/LoeschDialog.test.tsx` | T110 |
| `_ui/VerwaltungsRahmen.tsx`, `_ui/VerwaltungsRahmen.test.tsx` | T111 |
| `verwaltung/(arbeit)/layout.tsx` | T112 |
| `_actions/artikel.ts`, `_actions/artikel.test.ts` | T113 |
| `_actions/buchung.ts`, `_actions/buchung.test.ts` | T114 |
| `_actions/aussondern.ts`, `_actions/aussondern.test.ts` | T115 |
| `_actions/inventur.ts`, `_actions/inventur.test.ts` | T116 |
| `_actions/bestellung.ts`, `_actions/bestellung.test.ts` | T117 |
| `_actions/fahrzeuge.ts`, `_actions/fahrzeuge.test.ts` | T118 |
| `_actions/templates.ts`, `_actions/templates.test.ts` | T119 |
| `_actions/lagerortVerfall.ts`, `_actions/lagerortVerfall.test.ts` | T120 |
| `_actions/geraete.ts`, `_actions/geraete.test.ts` | T121 |
| `_actions/bz.ts`, `_actions/bz.test.ts` | T122 |
| `_actions/sauerstoff.ts`, `_actions/sauerstoff.test.ts` | T123 |
| `_actions/loeschen.ts`, `_actions/loeschen.test.ts` | T124 |
| `_actions/csv.ts`, `_actions/detail.ts`, `_actions/csv.test.ts` | T125 |
| `_actions/tokens.ts`, `_lib/lesepfade/tokens.ts`, `_actions/tokens.test.ts` | T126 |
| `_ui/monat.ts`, `_ui/ArtikelDrawer.tsx`, `_ui/ArtikelDrawer.test.tsx` | T127 |
| `verwaltung/(arbeit)/page.tsx` | T128 |
| `verwaltung/(arbeit)/artikel/**` | T129 |
| `verwaltung/(arbeit)/verfall/**` | T130 |
| `verwaltung/(arbeit)/fahrzeuge/page.tsx`, `.../FahrzeugeListe.tsx`, `.../NeuFahrzeug.tsx` | T131 |
| `verwaltung/(arbeit)/fahrzeuge/[id]/**` | T132 |
| `verwaltung/(arbeit)/vorlagen/page.tsx`, `.../NeuTemplate.tsx` | T133 |
| `verwaltung/(arbeit)/vorlagen/[id]/**` | T134 |
| `verwaltung/(arbeit)/checks/page.tsx`, `.../ChecksFilter.tsx` | T135 |
| `verwaltung/(arbeit)/checks/[id]/**` | T136 |
| `verwaltung/(arbeit)/bz/page.tsx`, `.../BzListe.tsx`, `.../NeuBzGeraet.tsx` | T137 |
| `verwaltung/(arbeit)/bz/scan/**`, `verwaltung/(arbeit)/geraete/scan/**` | T138 |
| `verwaltung/(arbeit)/bz/[id]/page.tsx`, `.../ReferenzEditor.tsx`, `.../BzAktivToggle.tsx` | T139 |
| `verwaltung/(arbeit)/bz/[id]/kontrolle/**` | T140 |
| `verwaltung/(arbeit)/sauerstoff/page.tsx`, `.../SauerstoffListe.tsx`, `.../NeuFlasche.tsx` | T141 |
| `verwaltung/(arbeit)/sauerstoff/[id]/**` | T142 |
| `verwaltung/(arbeit)/geraete/page.tsx`, `.../GeraeteListe.tsx`, `.../NeuGeraet.tsx` | T143 |
| `verwaltung/(arbeit)/geraete/[id]/**` | T144 |
| `verwaltung/(arbeit)/bestellung/**` | T145 |
| `verwaltung/(arbeit)/inventur/**` | T146 |
| `verwaltung/(arbeit)/journal/**` | T147 |
| `verwaltung/(arbeit)/tokens/**` | T148 |
| `verwaltung/(arbeit)/import/**` | T149 |
| `e2e/lagerbuch-verwaltung.spec.ts` | T150 |
| — (nur Ausführung und Protokoll) | T151, T152 |

**Die eine `core`-Datei dieses Plans:** `src/core/shell/shell.module.css` samt
`src/core/shell/shell-css.test.ts` (T105), mit **eigenem Commit**.
⚠️ **Teil 1 nennt in seiner Eigentümertabelle für `.modulnav` „Teil 4".** Das ist eine Ungenauigkeit
gegen Teil 1s **eigenen** Plan-Index, der „Außenarbeit 4" und damit `.modulnav` **Teil 5** zuweist
(§6.3.2, „Anhang, Arbeit 4"). **Maßgeblich ist Teil 5.** Die Zeile steht hier, damit niemand die
Änderung in Teil 4 sucht und nicht findet.

**Was dieser Plan NICHT anfasst, obwohl es naheliegt:** `core/shell/SuiteNav.tsx` (`aktiverEintrag`
bleibt schmal, §6.3.3), `core/theme/*` (die Ampel ist eine **modul**-eigene Palette,
`core/theme/tokens.ts:6-11` sieht die Ausnahme vor), `_lib/format.ts` (Teil 3, T39 — H2).

---

## 6. Die Zuordnung Server Action → Seite → Bedienelement

§6.12, Frage 1 verlangt sie ausdrücklich als Auflage an die Bau-Task: „jede Server Action des Moduls
wird namentlich einer Seite und einem Bedienelement zugeordnet, und die Liste wird abgehakt, nicht
behauptet." Die Spec liefert die Tabelle nicht — **hier ist sie.** T151 hakt sie ab.

**Die Zählung dieses Plans:** **14 Action-Dateien** mit **40 Deklarationen**, **alle bewacht**, **null
Ausnahmen** — und **alle 40** beginnen mit `await requireLagerbuchAdmin()`. Dazu **drei exportierte
Typen** in `_actions/detail.ts`, die **keine** Actions sind.

> ⚠️ **Korrigiert im Abschluss von Teil 4 (06.08.2026).** Vorher stand hier „15 Action-Dateien mit
> 43 Deklarationen … davon 42 mit `requireLagerbuchAdmin()`; die dreiundvierzigste ist
> `bucheEntnahmeHelfer`". `_actions/buchung.ts` mit ihren **drei** Deklarationen (`bucheZugang`,
> `bucheEntnahme`, `bucheEntnahmeHelfer`) ist in Teil 4 **vorgezogen und eingecheckt** (T114,
> `d5b1cf1`), zählt also nicht mehr zu diesem Plan: 15−1 = **14**, 43−3 = **40**. Damit entfällt
> auch die Ausnahme — `bucheEntnahmeHelfer` war die einzige Deklaration mit
> `await requireHelferSchreibend(db)`. **Festlegung H7 bleibt unverändert gültig:** die Datei gehört
> vollständig Teil 5, Teil 4 hat sie nur vorgezogen; es gibt genau eine `_actions/buchung.ts`.
>
> **Folgeposten (in dieser Fix-Welle bewusst NICHT mitgezogen):** drei Begründungstexte **außerhalb
> dieses Abschnitts** schreiben die alte Zahl fort — zweimal „Jede der **43** Deklarationen dieses
> Plans trägt ihren Riegel selbst" (T112, einmal als Fließtext und einmal als Kommentar im Testkörper)
> und einmal „**42 der 43** Deklarationen mit `await requireLagerbuchAdmin();`" (Vorspann von
> Welle 4). Wer sie anfasst, ändert Plan-vorgeschriebene Kommentare außerhalb des Befundumfangs.
> **Wer T151 baut, zählt neu** — Teil 6 tut das ohnehin (`teil6.md:6612-6617`).
> ⚠️ Sie sind hier **über ihren Wortlaut und nicht über eine Zeilennummer** benannt: jede Bearbeitung
> dieses Abschnitts verschiebt die Zeilen darunter, und ein Zeilenzeiger wäre schon beim nächsten
> Lesen falsch. Suchen statt zählen.

⚠️ **Drei Namensdubletten innerhalb dieses Plans:** `geraetSpeichern`, `setGeraetAktiv` und
`geraetZuBarcode` stehen in `_actions/bz.ts` **und** `_actions/geraete.ts`. Ein Scan, der die
Exportnamen in ein `Set` legt, zählt **37** statt 40 — gezählt wird **je Datei je Deklaration**
(Teil 2, T20, Auflage 2). Teil 6s Abnahme „47 = 44 + 3" bekommt von diesem Plan die Zahl **40**;
Teil 4 steuert die restlichen **7 Deklarationen** bei (**4 bewachte** — `checkAbschluss` plus die
drei aus `buchung.ts`; ⚠️ „bewacht" heißt hier wie in **Teil 6 §4.1** *irgendein* Riegel als erste
Anweisung, bei `checkAbschluss` und `bucheEntnahmeHelfer` also `requireHelferSchreibend` — nicht zu
verwechseln mit der „Ausnahme" im Blockzitat oben, die den Sonderfall **gegenüber
`requireLagerbuchAdmin`** meint —, **3 Ausnahmen** im Sinn von §4.1: `einloesenAmGate`,
`erneuereSitzung`, `beenden`, die **gar keinen** Riegel tragen) — die verbindliche Herleitung steht in
**Teil 6 §4.1/§4.2** (47 gesamt / 44 bewacht / 3 Ausnahmen / 18 Dateien / 19 Verzeichniseinträge).
⚠️ Die Aufteilungstabelle in **Teil 6 §4.2** nennt in ihren beiden Zuliefererzeilen (Teil 5 / Teil 4)
weiterhin **43 / 4** und ist **nicht** nachgezogen — sie liegt außerhalb dieses Plans. Die **Summen**
47 / 44 / 3 / 18 / 19 aus §4.1 sind davon unberührt und bleiben verbindlich.

**Die Tabelle hat 43 Zeilen und deckt damit die 40 Deklarationen DIESES Plans ab — plus die drei
vorgezogenen aus `buchung.ts`, die als solche gekennzeichnet sind —, nicht das ganze Modul.**
Vollständig wird die Auflage aus §6.12, Frage 1 („jede Server Action des Moduls wird namentlich einer
Seite und einem Bedienelement zugeordnet") erst über beide Pläne zusammen:
**40 hier + 7 in Teil 4 (`einloesenAmGate` aus `_actions/gate.ts`, `erneuereSitzung` und `beenden`
aus `_actions/sitzung.ts`, `checkAbschluss` aus `_actions/check.ts`, dazu `bucheZugang`,
`bucheEntnahme` und `bucheEntnahmeHelfer` aus dem vorgezogenen `_actions/buchung.ts`) = 47.**
Teil 6s Abnahme hakt die Auflage erst ab, wenn beide Teiltabellen vorliegen; sie hier
stillschweigend als vollständig zu lesen wäre der Fehler, gegen den dieser Satz steht.

| # | Action | Datei | Seite | Bedienelement | ☐ |
|---|---|---|---|---|---|
| 1 | `createArtikel` | `artikel.ts` | `/verwaltung/artikel` | `NeuArtikel` — `Modal` „Neuer Artikel", Absendeknopf | ☐ |
| 2 | `updateArtikel` | `artikel.ts` | `/verwaltung/artikel` | `ArtikelDrawer` — Mindestbestand (`InputNumber`, 400 ms), Fach (`onBlur`), Einheit (`onBlur`) | ☐ |
| 3 | `setArtikelAktiv` | `artikel.ts` | `/verwaltung/artikel` | `ArtikelDrawer` — `Switch` „aktiv" | ☐ |
| 4 | `bucheZugang` | `buchung.ts` ⬆️ | `/verwaltung/artikel` | `ArtikelDrawer`, Abschnitt „Zugang buchen" — Knopf „Zugang buchen". ⚠️ **Vorgezogen nach Teil 4 (T114, `d5b1cf1`)** — die Deklaration steht schon im Baum und zählt NICHT zu den 40 dieses Plans | ☐ |
| 5 | `bucheEntnahme` | `buchung.ts` ⬆️ | `/verwaltung/artikel` | `ArtikelDrawer`, Abschnitt „Entnahme / Umlagerung" — Knopf „Buchen". ⚠️ **Vorgezogen nach Teil 4 (T114, `d5b1cf1`)** — zählt NICHT zu den 40 dieses Plans | ☐ |
| 6 | `bucheEntnahmeHelfer` | `buchung.ts` ⬆️ | **`/a/[artikelId]` (Teil 4)** | `Entnahme` (`_ui/Entnahme.tsx`) — Knopf „Entnahme buchen". ⚠️ **Vorgezogen nach Teil 4 (T114, `d5b1cf1`)** — zählt NICHT zu den 40 dieses Plans; **der einzige Aufrufer liegt ebenfalls in Teil 4**. Die Zeile bleibt hier stehen, weil die Datei fachlich vollständig Teil 5 gehört (H7) | ☐ |
| 7 | `aussondern` | `aussondern.ts` | `/verwaltung/verfall` | `AussondernRow` — `Popconfirm` „× aussondern" je Zeile | ☐ |
| 8 | `inventurKorrektur` | `inventur.ts` | `/verwaltung/inventur` | `InventurForm` — Knopf „Inventur abschließen (N Abweichungen)" | ☐ |
| 9 | `markiereBestellt` | `bestellung.ts` | `/verwaltung/bestellung` | `BestellListe` — Kreis-Knopf je Zeile (`aria-label` „Als bestellt markieren" / „Bestellung zurücknehmen") | ☐ |
| 10 | `createFahrzeug` | `fahrzeuge.ts` | `/verwaltung/fahrzeuge` | `NeuFahrzeug` — `Modal` „Neues Fahrzeug", Absendeknopf | ☐ |
| 11 | `setFahrzeugAktiv` | `fahrzeuge.ts` | `/verwaltung/fahrzeuge/[id]` | `FahrzeugAktivToggle` — `Switch` im Seitenkopf | ☐ |
| 12 | `sollPositionSetzen` | `fahrzeuge.ts` | `/verwaltung/fahrzeuge/[id]` | `SollEditor` — Zeile hinzufügen (`Select` + `InputNumber` + „+") **und** `InputNumber` je bestehender Zeile (auto-committend) | ☐ |
| 13 | `sollPositionEntfernen` | `fahrzeuge.ts` | `/verwaltung/fahrzeuge/[id]` | `SollEditor` — `Popconfirm` am Papierkorb-Knopf je Zeile | ☐ |
| 14 | `sollPositionWiederherstellen` | `fahrzeuge.ts` | `/verwaltung/fahrzeuge/[id]` | `SollEditor` — Knopf „zurücksetzen" an einer Grabstein-Zeile. ⚠️ **Genau der Kandidat für „Action ohne Weg"**: die Zeile ist nur sichtbar, wenn `entfernt === true` | ☐ |
| 15 | `createTemplate` | `templates.ts` | `/verwaltung/vorlagen` | `NeuTemplate` — `Modal` „Neue Vorlage", Absendeknopf | ☐ |
| 16 | `renameTemplate` | `templates.ts` | `/verwaltung/vorlagen/[id]` | `TemplateAktionen` — Stift-Knopf „Umbenennen" öffnet `Modal` mit `Input` | ☐ |
| 17 | `setTemplateAktiv` | `templates.ts` | `/verwaltung/vorlagen/[id]` | `TemplateAktionen` — `Switch` „aktiv" | ☐ |
| 18 | `deleteTemplate` | `templates.ts` | `/verwaltung/vorlagen/[id]` | `TemplateAktionen` — `LoeschButton art="template"` in der Gefahrenzone | ☐ |
| 19 | `templatePositionSetzen` | `templates.ts` | `/verwaltung/vorlagen/[id]` | `TemplatePosEditor` — Zeile hinzufügen **und** `InputNumber` je Zeile | ☐ |
| 20 | `templatePositionEntfernen` | `templates.ts` | `/verwaltung/vorlagen/[id]` | `TemplatePosEditor` — `Popconfirm` am Papierkorb je Zeile (Fall 2 aus §6.4.5) | ☐ |
| 21 | `fahrzeugTemplateZuweisen` | `templates.ts` | `/verwaltung/fahrzeuge/[id]` | `TemplateVerknuepfung` — `Select` „Vorlage" + Knopf „Verknüpfen" | ☐ |
| 22 | `fahrzeugTemplateSync` | `templates.ts` | `/verwaltung/fahrzeuge/[id]` | `TemplateVerknuepfung` — Knopf „Erneut übertragen" (Zeichen `erneut`) | ☐ |
| 23 | `templateAufFahrzeugeSyncen` | `templates.ts` | `/verwaltung/vorlagen/[id]` | `TemplateAktionen` — Knopf „Auf alle Fahrzeuge übertragen" (Zeichen `erneut`) | ☐ |
| 24 | `fahrzeugTemplateLoesen` | `templates.ts` | `/verwaltung/fahrzeuge/[id]` | `TemplateVerknuepfung` — `Popconfirm` am Knopf „Verknüpfung lösen" (Zeichen `entketten`) | ☐ |
| 25 | `templateAusFahrzeug` | `templates.ts` | `/verwaltung/fahrzeuge/[id]` | `TemplateVerknuepfung` — Knopf „Vorlage aus diesem Fahrzeug erstellen" öffnet `Modal` mit Name + `Checkbox` „verknüpfen" | ☐ |
| 26 | `verfallSetzen` | `lagerortVerfall.ts` | `/verwaltung/fahrzeuge/[id]` | `VerfallEditor` — `DatePicker picker="month"` je Artikel, auto-committend | ☐ |
| 27 | `geraetSpeichern` | `geraete.ts` | `/verwaltung/geraete` **und** `/verwaltung/geraete/[id]` | `NeuGeraet` (`Modal`) bzw. `GeraetForm` (`Form`, Absendeknopf „Speichern") | ☐ |
| 28 | `setGeraetAktiv` | `geraete.ts` | `/verwaltung/geraete/[id]` | `GeraetAktivToggle` — `Switch` im Seitenkopf | ☐ |
| 29 | `geraetZuBarcode` | `geraete.ts` | `/verwaltung/geraete/scan` | `GeraetScanner` — als Prop `zuBarcode` an `_ui/BarcodeScanner` (Teil 4); **keine sichtbare Schaltfläche**, der Auslöser ist der Kamerafund | ☐ |
| 30 | `geraetSpeichern` | `bz.ts` | `/verwaltung/bz` **und** `/verwaltung/bz/[id]` | `NeuBzGeraet` (`Modal`) bzw. `ReferenzEditor` (auto-committende `InputNumber`/`Input`) | ☐ |
| 31 | `setGeraetAktiv` | `bz.ts` | `/verwaltung/bz/[id]` | `BzAktivToggle` — `Switch` im Seitenkopf | ☐ |
| 32 | `geraetZuBarcode` | `bz.ts` | `/verwaltung/bz/scan` | `BzScanner` — Prop `zuBarcode` an `_ui/BarcodeScanner` | ☐ |
| 33 | `kontrolleErfassen` | `bz.ts` | `/verwaltung/bz/[id]/kontrolle` | `KontrolleForm` — `Form`, Absendeknopf „Kontrolle speichern" | ☐ |
| 34 | `flascheSpeichern` | `sauerstoff.ts` | `/verwaltung/sauerstoff` **und** `/verwaltung/sauerstoff/[id]` | `NeuFlasche` (`Modal`) bzw. `ReferenzFelder` im Flaschenblatt | ☐ |
| 35 | `setFlascheAktiv` | `sauerstoff.ts` | `/verwaltung/sauerstoff/[id]` | `FlascheAktivToggle` — `Switch` im Seitenkopf | ☐ |
| 36 | `messungErfassen` | `sauerstoff.ts` | `/verwaltung/sauerstoff/[id]` | `MessungForm` — `Form`, Absendeknopf „Messung speichern" | ☐ |
| 37 | `pruefeLoeschbar` | `loeschen.ts` | fünf Seiten | `LoeschDialog` — **beim Öffnen**, vor jeder Handlung (§6.4.5 Punkt 1) | ☐ |
| 38 | `loescheElement` | `loeschen.ts` | fünf Seiten | `LoeschDialog` — Knopf „Endgültig löschen", freigeschaltet erst nach exakt abgetipptem Namen | ☐ |
| 39 | `deaktiviereElement` | `loeschen.ts` | fünf Seiten | `LoeschDialog` — **zweiter Ausgang**, Knopf mit konfigurierbarer Beschriftung („Deaktivieren" / für Zugangs-Codes „Sperren"). ⚠️ **Der zweite benannte Kandidat für „Action ohne Weg"** (§6.12, Frage 1) | ☐ |
| 40 | `importArtikelCsv` | `csv.ts` | `/verwaltung/import` | `ImportForm` — `Form`, Absendeknopf „Importieren" nach der Vorschau | ☐ |
| 41 | `getDetail` | `detail.ts` | `/verwaltung/artikel` | `ArtikelDrawer` — **beim Öffnen**; liest nur, ist aber eine Action, weil ihr einziger Aufrufer eine Client-Insel ist | ☐ |
| 42 | `createToken` | `tokens.ts` | `/verwaltung/tokens` | `NeuToken` — `Modal` „Neuer Zugangs-Code", Absendeknopf | ☐ |
| 43 | `setTokenAktiv` | `tokens.ts` | `/verwaltung/tokens` | `TokenTable` — Knopf „Sperren" / „Reaktivieren" je Zeile | ☐ |

⚠️ **43 Zeilen, davon 3 vorgezogen → 40 Deklarationen dieses Plans in 14 Dateien.** Eine Zeile je
Deklaration, ohne Differenz — die Zeilen **4–6** (`buchung.ts`, ⬆️) stehen seit T114 im Baum und
gehören zu Teil 4; **43 − 3 = 40**, **15 − 1 = 14**. `templates.ts` trägt
**elf** Deklarationen und bekommt **elf** Zeilen (15–25); die drei Namensdubletten stehen je Datei
**einmal** und bekommen deshalb je **zwei** Zeilen (`geraetSpeichern` 27 und 30, `setGeraetAktiv` 28
und 31, `geraetZuBarcode` 29 und 32). Die drei `loeschen.ts`-Actions (37–39) bedienen je fünf Seiten
in **einem** Dialog und bekommen trotzdem je genau eine Zeile — die Seitenspalte sagt „fünf Seiten",
sie vervielfacht die Zeile nicht. Die Zählung **„40 Deklarationen in 14 Dateien"** ist damit an der
Tabelle nachzählbar (43 Zeilen minus die drei mit ⬆️) und nicht bloß behauptet. ⚠️ **Die Zeilennummern
1–43 bleiben unverändert** — sie sind Anker für T151 und für Teil 6, keine laufende Zählung der 40.

**Die fünf Seiten mit `LoeschDialog`:** `/verwaltung/artikel` (im Drawer, `art="artikel"`),
`/verwaltung/fahrzeuge/[id]` (`art="fahrzeug"`), `/verwaltung/bz/[id]` (`art="bzGeraet"`),
`/verwaltung/sauerstoff/[id]` (`art="o2Flasche"`), `/verwaltung/geraete/[id]` (`art="geraet"`) —
dazu `/verwaltung/tokens` (`art="token"`, Zeile 43s Nachbar) und `/verwaltung/vorlagen/[id]`
(`art="template"`, **neu** — der Bestand ruft `deleteTemplate` direkt ohne Dialog).
⚠️ **`"template"` ist eine siebte `ElementArt` und kommt in `loeschen.ts` NICHT vor.** Der Bestand
löscht Vorlagen über `deleteTemplate` in `templates.ts` mit eigener Transaktion. Verbindlich für
T110/T119: `LoeschButton art="template"` ruft **`deleteTemplate`**, nicht `loescheElement` — der
Dialog nimmt die Action als Prop entgegen (`onLoeschen`), und `pruefeLoeschbar` wird für diesen Fall
**nicht** gerufen, weil `deleteTemplate` verknüpfte Fahrzeuge selbst löst (`templates.ts:47-56`). Die
Vorprüfung entfällt damit nicht ersatzlos, sondern wird zu einem Hinweistext: „N Fahrzeuge werden von
dieser Vorlage gelöst; ihre Positionen bleiben als individuelle Bestückung erhalten."

---

## 7. Die 28 klassengebundenen Selektoren — Anker, und WER sie setzt

§6.11 nennt die Ersatzanker. Die dritte Spalte ist die Ergänzung dieses Plans und der Grund, warum die
Tabelle hier steht: **ein Anker, der im Plan erwähnt und nirgends gerendert wird, besteht jeden
Platzhalter-Scan und fällt erst im E2E.**

| Alter Selektor | × | Neuer Anker | Wer setzt ihn | Task |
|---|---|---|---|---|
| `.drawer` | 8 | `getByRole("dialog", { name: "<Artikelname>" })` | `_ui/ArtikelDrawer.tsx` — `<Drawer title={artikel.name}>` | T127 |
| `tr.click` | 5 | `getByRole("row", { name: /…/ })` **und** darin `getByRole("link"\|"button", { name })` | jede Listentabelle — erste Spalte rendert einen echten `<Link>`/`<Button>` | T129, T131, T133, T137, T141, T143, T148 |
| `.card.journal .row` | 3 | `getByRole("row")` in der Journaltabelle, adressiert über Zeitstempel + Artikelname | `journal/page.tsx` — `<Table>` mit `columns[0].title = "Zeit"` | T147 |
| `.row` | 3 | `getByRole("listitem")` in der Verfallsliste | `verfall/page.tsx` — `<ul>`/`<li>`, **keine** `Table` (§6.4.2) | T130 |
| `.modalbox` | 2 | `getByRole("dialog", { name: /löschen/i })` | `_ui/LoeschDialog.tsx` — `<Modal title={\`${typLabel} löschen\`}>` | T110 |
| `div.grid2 input.input` | 2 | `getByLabel("<Feldname>")` | jedes `Neu*`-Formular — `Form.Item label` erzeugt die Verknüpfung | T129, T131, T137, T141, T143, T148 |
| `table.tbl tbody tr` | 2 | `getByRole("row")` unter `getByRole("table", { name })` | jede `Table` — `aria-label` auf dem `Table`-Wrapper | T129, T147 |
| `a.row` | 1 | `getByRole("link", { name })` | `_ui/Kachel.tsx` bzw. die erste Spalte | T108, T128 |
| `.jdelta.minus` | 1 | `getByRole("row", …).getByText("−1")` — geprüft wird das **Vorzeichen im Text**, nicht die Farbe | `journal/page.tsx` — Spalte „Δ" rendert `journalZeile().mengeText` (Teil 3, T42) | T147 |
| `.etikett img` | 1 | `getByRole("img", { name: /Zugangs-Code …/ })` am QR-**Umschlag** | **Teil 6** (§8.4) — der QR ist ein Inline-SVG, kein `<img>` | Teil 6 |
| `input[type="month"]` | 2 | `getByLabel("Verfallsmonat")` — ⚠️ **der Selektor stirbt**, `DatePicker` rendert kein `<input type="month">` | `_ui/ArtikelDrawer.tsx` (`ArtikelDrawer.tsx:307`), `KontrolleForm.tsx` (`:71`), `VerfallEditor.tsx` (`:58`) | T127, T140, T132 |
| `[title="111-111"]` | 1 | `getByRole("row", { name: /111-111/ })` | `tokens/TokenTable.tsx` — der Code steht als Text in der ersten Spalte | T148 |

**Vier Regeln über der Tabelle** (§6.11), jede als Schritt in dem Task, der den Anker setzt:

1. **Jede Rollen-Zusicherung wird EINMAL gegen das gerenderte Bauteil geprüft**, nicht gegen die
   Absicht. Der belegte Fall ist `role=searchbox` (§6.9.2), aber ob ein `Drawer` eine `dialog`-Rolle
   **mit zugänglichem Namen** trägt, ob eine `Table` eine `table`-Rolle hat und ob `Form.Item label`
   tatsächlich verknüpft, steht in keiner Spec — nur im DOM. → In T127, T110 und T109 ist das je ein
   eigener DOM-Schritt über `@/app/m/qr/_lib/test-dom`.
2. **Ein grüner Nachfolgetest, der etwas anderes prüft als vorher, ist schlimmer als ein roter.**
3. **Kein `.first()`.** Playwright fährt alle Dateien in **einem** Worker gegen **eine** SQLite-Datei.
4. **Die Zugänglichkeit ist die Voraussetzung, nicht die Folge:** `Drawer title`, `Modal title`,
   `Form.Item label`, `aria-label` an Icon-Knöpfen.

---

## 8. Die 22 Auflagen aus §6.15 — welcher Task sie einlöst

§6.15 sammelt, was andere Kapitel an §6 stellen, und nennt je Auflage die **Spec**-Stelle. Diese
Tabelle nennt den **Task**. Zwei Auflagen löst §6 ausdrücklich nicht ein — sie stehen mit ihrem
tatsächlichen Ort.

| # | Auflage (Kurzform) | Task |
|---|---|---|
| 1 | Kein Layout außer `(arbeit)/layout.tsx` mountet `<Shell variant="full">`; zweiter Importeur ist `g/[code]/page.tsx` | **T111** (die Komponente) + **T112** (der eine Mounter). ⚠️ Den **zweiten** Importeur stellt **Teil 4** (`g/[code]/page.tsx`, §2.9) |
| 2 | Kein `(arbeit)/etiketten/` — die Route liegt in `(druck)` | **T112**, Schritt 6 (Verzeichnis-Zusicherung) + **Teil 6** |
| 3 | Beide Group-Layouts rufen `requireLagerbuchHost` **und** `requireLagerbuchAdmin` | **T112**, Schritt 3 (`(arbeit)`) + **Teil 6** (`(druck)`); der koppelnde Abruf in **T151**, Schritt 5 |
| 4 | Navigation und Riegel lesen dasselbe Prädikat auf demselben Viewer | **T112** — ein `requireLagerbuchAdmin()`, kein zweiter `auth()` |
| 5 | `href` äußere Form, `revalidatePath` innere | **T102** (die 15 `href`) + **§3 dieses Plans** und **T113–T126** (die Listen) |
| 6 | `usePathname` nur in `useUrlFilter` | **T109** (die eine Datei); der Scan gehört Teil 4 |
| 7 | Sechs listenspezifische Suchfeldmengen einzeln portiert | **T129, T131, T137, T141, T143, T148** — je ein eigener Testschritt |
| 8 | „X von Y" nur bei `gezeigt !== gesamt` | **T109** (`_ui/Trefferanzeige.tsx`) — der Test steht dort |
| 9 | Excel-Export liest dieselbe abgeleitete Liste wie die Tabelle | **T129**, Schritt 4 (`ArtikelTable.tsx`) |
| 10 | Jedes `Select showSearch` setzt `filterOption` | **T127** (2 Stellen), **T132** (1), **T134** (1), **T135** (1) |
| 11 | Jedes `Table` setzt `pagination`; keine Pagination über die gedeckelten 100 | **§2 dieses Plans** (Constraint) + **T135, T147** (die zwei gedeckelten) |
| 12 | Drei Monatsfelder mit `DatePicker picker="month"`, `format="YYYY-MM"`, `MONAT_REGEX`-Strenge serverseitig | **T127** (`ArtikelDrawer`), **T140** (`KontrolleForm`), **T132** (`VerfallEditor`) |
| 13 | Check-Detailseite schreibt aus, dass die Verfall-Ampel gegen **heute** rechnet | **T136**, Schritt 3 |
| 14 | `altFormat`-Check zeigt Hinweistext, keine leere Tabelle | **T136**, Schritt 3 |
| 15 | Herkunft einer O2-Messung (Check vs. manuell) sichtbar | **T141** (Übersicht) + **T142** (Verlauf) |
| 16 | BZ-Logbuch zeigt `ref_snapshot`-Grenzen, nicht die heutigen | **T139**, Schritt 3 |
| 17 | Bestellliste zeigt „bestellt seit <Datum>" und „Ware offenbar eingetroffen" | **T145**, Schritt 3 |
| 18 | Löschdialog nennt bei Ablehnung den Grund und bietet **Deaktivieren** | **T110** |
| 19 | Rot nie auf einer Datenfläche; kein `Alert type="error"`; `size` nicht gesetzt; Felder ≥ 16px | **§2 dieses Plans** + **T100** (Palette) + **T106** (Chip) + **T151**, Schritt 6 (repo-weiter Scan `Alert type="error"` / `size="large"`) |
| 20 | Fehler als Rückgabewert am Feld, nie `e.message` | **T113–T126** (jede Action gibt `{ ok:false; feldFehler }` zurück) + **T151**, Schritt 6 (Scan: kein `e.message` unter `verwaltung/`) |
| 21 | `/g/<code>` antwortet 200 im `VerwaltungsRahmen`, ohne Icons | ⚠️ **Nicht hier.** §6 stellt nur die Bausteine: **T111** (Rahmen), **T101** (Ikonen), **T106** (Chip). Der Zustand selbst ist **Teil 4** (§8.1 8-C2, §11.3) |
| 22 | Keine Seite `/verwaltung/kein-zugriff`, keine `/verwaltung/identitaeten` | **T112**, Schritt 6 (Verzeichnis-Zusicherung) + **T102** (kein Navigationseintrag) |

---

## Welle 1 — Werte, Ikonen und die `core`-Naht (6 Tasks, alle parallel)

Diese sechs Tasks berühren einander nicht. **T100 und T101 sind Voraussetzung JEDER Seite** (§6.6.2a,
§6.5.2) und stehen deshalb ganz vorn; T105 ist die einzige `core`-Änderung und bekommt einen eigenen
Commit.

---

### Task 100: `_lib/ampel.ts` und `_ui/verwaltung.module.css` — eine Palette, zwei Leitungen

**Files:**
- Create: `src/app/m/lagerbuch/_lib/ampel.ts`
- Create: `src/app/m/lagerbuch/_ui/verwaltung.module.css`
- Test: `src/app/m/lagerbuch/_lib/ampel.test.ts`

**Interfaces:**
- Consumes: `_lib/format.ts` (Teil 3, T39) — **nur der Typ** `AmpelTon = "rot" | "gelb" | "ok" | "grau"`
  (type-only Import, kein Laufzeit-Zyklus). `core/theme/tokens.ts` — `FARBEN` (**nur im Test**, für die
  „nicht Suite-Rot"-Zusicherung).
- Produces:
  ```ts
  // _lib/ampel.ts — KEIN "use client" (§5.17, Falle 6).
  export type AmpelPaar = { readonly text: string; readonly flaeche: string };
  export const AMPEL_HELL:   Readonly<Record<AmpelTon, AmpelPaar>>;
  export const AMPEL_DUNKEL: Readonly<Record<AmpelTon, AmpelPaar>>;
  /** Die vier Tonnamen in der Reihenfolge der Rangfolge; `grau` steht AUSSERHALB. */
  export const AMPEL_RANG: readonly ["ok", "gelb", "rot"];
  /** CSS-Variablenname zu einem Ton, z. B. ampelVar("rot", "text") → "--lb-ampel-rot-text". */
  export function ampelVar(ton: AmpelTon, rolle: "text" | "flaeche"): string;
  ```
  ```css
  /* _ui/verwaltung.module.css — die EINE Modul-CSS-Datei der Verwaltung. */
  .modul            /* Träger ALLER --lb-* und --lb-ampel-* Variablen */
  .chip .ok .gelb .rot .grau
  .kpis .kpi .kpiRot .kpiGelb .kpiOk .kpiLink
  .backlink .fach .filtertreffer .footnote
  .journalZeile .jts .jdelta .jminus .jplus
  .warnbox .infobox .gefahr .gtitle
  ```
- ⚠️ **Teil 4 (§7.7.4) legt `_ui/helfer.module.css` an und trägt DIESELBEN acht `--lb-ampel-*`-Werte
  auf `.rahmen`.** Der Scan aus Schritt 5 findet sie automatisch, sobald die Datei existiert (H5).
- ⚠️ **Teil 6 importiert `_ui/verwaltung.module.css` in `_ui/DruckRahmen.tsx`** und setzt dort
  `className={s.modul}` (§6.1.2). **Ohne den Träger löst jedes `var(--lb-…)` ins Leere auf** — und
  eine nicht auflösbare CSS-Variable fällt auf `transparent` zurück und ist gültiges CSS. Das ist die
  einzige Kopplung dieses Tasks nach Teil 6, und sie ist still.

**Warum die Werte so und nicht anders lauten.** Die heutigen drei sind **nicht** luminanz-monoton:
ok `#1e7a3c` = 0,1452 · gelb `#b26a00` = 0,1977 · rot `#c8000f` = 0,1231. Über die Rangfolge
gut → schlecht **steigt** die Luminanz und fällt dann; Gelb ist der **hellste** der drei. In
Graustufen und bei Rot-Grün-Blindheit ist die Rangfolge damit heute nicht ablesbar. Dazu ein Befund,
der schon heute gilt: `chip-gelb` ist `#b26a00` auf `#fbf1dc` — **Kontrast 3,78 : 1**, also **unter
AA**. Die Palette behebt das nebenbei.

⚠️ **Rot wird ein EIGENER Wert `#8c0d16`, nicht `#c8000f`.** Das ist keine Stilfrage: Suite-Rot ist
Marke und Primäraktion (Falle 3). Solange Ampel-Rot und Primär-Rot derselbe Hexwert sind, stehen auf
`/verwaltung/artikel` ein „unter Mindestbestand"-Chip und ein „Artikel anlegen"-Knopf in **exakt
derselben Farbe** — und wer beides zum ersten Mal sieht, hat keinen Grund, sie für verschiedene Dinge
zu halten.

⚠️ **`grau` ist KEIN Ampelwert** und steht außerhalb der Rangfolge. Er trägt „kein Datum gepflegt" und
„keine Messung" und darf **nie** als grün dargestellt werden. Dass seine Luminanz (0,1270) zwischen
gelb und ok liegt, ist deshalb kein Verstoß — `AMPEL_RANG` bezieht ihn nicht ein.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/ampel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { AMPEL_HELL, AMPEL_DUNKEL, AMPEL_RANG, ampelVar } from "./ampel";
import { FARBEN } from "@/core/theme/tokens";

/**
 * WCAG-RELATIVLUMINANZ. Steht im Test, nicht im Modul: die Palette ist ein
 * Ergebnis, die Rechnung ist der Beweis dafuer. Vorbild und Bauform sind
 * `m/feedback/_lib/noten.test.ts` — dort bewacht dieselbe Funktion die
 * Schulnoten-Ampel.
 */
function luminanz(hex: string): number {
  const kanaele = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * kanaele[0] + 0.7152 * kanaele[1] + 0.0722 * kanaele[2];
}

function kontrast(a: string, b: string): number {
  const [l1, l2] = [luminanz(a), luminanz(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("Ampelpalette: die Werte", () => {
  it("hell traegt genau die vier Paare aus Spec 6.6.2", () => {
    expect(AMPEL_HELL).toEqual({
      ok:   { text: "#1e7a3c", flaeche: "#e4f2e9" },
      gelb: { text: "#8a5200", flaeche: "#fbf1dc" },
      rot:  { text: "#8c0d16", flaeche: "#f6e3e0" },
      grau: { text: "#5b6570", flaeche: "#e7eaec" },
    });
  });

  it("dunkel traegt genau die vier Paare aus Spec 6.6.2", () => {
    expect(AMPEL_DUNKEL).toEqual({
      ok:   { text: "#7ee0a0", flaeche: "#10261a" },
      gelb: { text: "#d9a032", flaeche: "#2a1e05" },
      rot:  { text: "#e8837c", flaeche: "#2a1113" },
      grau: { text: "#9aa4ad", flaeche: "#1c2024" },
    });
  });

  it("Gruen bleibt der gewohnte Wert vom Etikett", () => {
    // Wer eine gewohnte Farbe ohne Not aendert, zahlt Wiedererkennung fuer nichts.
    expect(AMPEL_HELL.ok.text).toBe("#1e7a3c");
  });
});

describe("Ampelpalette: Luminanz als farbunabhaengiger Rangkanal", () => {
  it.each([
    ["hell", AMPEL_HELL],
    ["dunkel", AMPEL_DUNKEL],
  ])("%s faellt bzw. steigt streng monoton ueber ok -> gelb -> rot", (_name, palette) => {
    const werte = AMPEL_RANG.map((t) => luminanz(palette[t].text));
    const richtung = Math.sign(werte[1] - werte[0]);
    expect(richtung, "ok und gelb duerfen nicht dieselbe Luminanz haben").not.toBe(0);
    for (let i = 1; i < werte.length; i++) {
      expect(Math.sign(werte[i] - werte[i - 1]),
        `Rangfolge bricht zwischen ${AMPEL_RANG[i - 1]} und ${AMPEL_RANG[i]}`).toBe(richtung);
    }
  });

  it("`grau` steht AUSSERHALB der Rangfolge", () => {
    // Seine Luminanz liegt hell zwischen gelb und ok (0,1270). Das ist kein
    // Verstosz — er traegt „kein Datum gepflegt", nicht „mittelgut".
    expect(AMPEL_RANG).toEqual(["ok", "gelb", "rot"]);
    expect(AMPEL_RANG).not.toContain("grau");
  });
});

describe("Ampelpalette: Kontrast", () => {
  it.each([
    ["hell", AMPEL_HELL],
    ["dunkel", AMPEL_DUNKEL],
  ])("%s erreicht je Ton mindestens AA gegen die eigene Flaeche", (_name, palette) => {
    for (const [ton, paar] of Object.entries(palette)) {
      expect(kontrast(paar.text, paar.flaeche), `${_name}/${ton}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("heilt den bestehenden AA-Verstosz von chip-gelb (heute 3,78 : 1)", () => {
    expect(kontrast("#b26a00", "#fbf1dc")).toBeLessThan(4.5);      // der Bestand
    expect(kontrast(AMPEL_HELL.gelb.text, AMPEL_HELL.gelb.flaeche)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Ampelpalette: Ampel-Rot ist NICHT Suite-Rot", () => {
  it("kein Ton traegt #c8000f — Rot ist Marke und Primaeraktion, nie Statusfarbe", () => {
    // DIE ZEILE, DIE ANSCHLAEGT, WENN JEMAND SPAETER „VEREINHEITLICHT".
    for (const palette of [AMPEL_HELL, AMPEL_DUNKEL]) {
      for (const paar of Object.values(palette)) {
        expect(paar.text.toLowerCase()).not.toBe(FARBEN.rot.toLowerCase());
        expect(paar.flaeche.toLowerCase()).not.toBe(FARBEN.rot.toLowerCase());
      }
    }
    expect(AMPEL_HELL.rot.text).not.toBe(FARBEN.rot);
  });
});

describe("ampelVar", () => {
  it("bildet Ton und Rolle auf den CSS-Variablennamen ab", () => {
    expect(ampelVar("rot", "text")).toBe("--lb-ampel-rot-text");
    expect(ampelVar("ok", "flaeche")).toBe("--lb-ampel-ok-flaeche");
  });
});

/**
 * DER SCAN — DIE WERTE STEHEN AN ZWEI ORTEN, UND EIN TEST BINDET SIE ANEINANDER.
 *
 * `_lib/ampel.ts` ist die Quelle fuer alles, was in TypeScript eine Farbe
 * braucht (Plakette, KPI-Kante, das `warnung`-Zeichen). Das CSS-Modul ist die
 * Quelle fuer die Darstellung — ein CSS-Modul kann keine TS-Konstante lesen,
 * und der Moduswechsel ist reines CSS. Ohne diesen Scan driften beide STILL,
 * und der Monotonie-Test oben bewiese etwas ueber eine Konstante, die niemand
 * mehr rendert.
 *
 * EIGENSCHAFTSFORM, NICHT ZAEHLUNG (Plan-Festlegung H5): der Scan laeuft ueber
 * jede VORHANDENE `_ui/*.module.css` und toleriert eine fehlende. Teil 4 legt
 * `helfer.module.css` spaeter an; der Scan greift dort, ohne dass jemand ihn
 * anfasst. Ein Scan, der beide Dateien hart verlangt, waere am ersten Tag rot
 * — und ein am ersten Tag roter Scan wird abgeschaltet statt repariert.
 */
const CSS_DATEIEN = [
  { pfad: "src/app/m/lagerbuch/_ui/verwaltung.module.css", traeger: "modul", pflicht: true },
  { pfad: "src/app/m/lagerbuch/_ui/helfer.module.css", traeger: "rahmen", pflicht: false },
] as const;

describe("Ampelpalette: TS und CSS tragen dieselben Werte", () => {
  it("verwaltung.module.css existiert — sie ist Pflicht", () => {
    expect(existsSync(CSS_DATEIEN[0].pfad)).toBe(true);
  });

  for (const datei of CSS_DATEIEN) {
    describe(datei.pfad, () => {
      for (const [ton, paar] of Object.entries(AMPEL_HELL)) {
        for (const rolle of ["text", "flaeche"] as const) {
          it(`hell: --lb-ampel-${ton}-${rolle} traegt ${paar[rolle]}`, () => {
            if (!datei.pflicht && !existsSync(datei.pfad)) return;   // Teil 4 baut sie noch
            const css = readFileSync(datei.pfad, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
            const hell = css.slice(0, css.indexOf('[data-theme="dark"]'));
            expect(hell, `Traeger .${datei.traeger} fehlt`).toMatch(
              new RegExp(`\\.${datei.traeger}\\s*\\{`),
            );
            expect(hell).toMatch(
              new RegExp(`--lb-ampel-${ton}-${rolle}\\s*:\\s*${paar[rolle]}\\s*[;}]`, "i"),
            );
          });
        }
      }

      for (const [ton, paar] of Object.entries(AMPEL_DUNKEL)) {
        for (const rolle of ["text", "flaeche"] as const) {
          it(`dunkel: --lb-ampel-${ton}-${rolle} traegt ${paar[rolle]}`, () => {
            if (!datei.pflicht && !existsSync(datei.pfad)) return;
            const css = readFileSync(datei.pfad, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
            const i = css.indexOf('[data-theme="dark"]');
            expect(i, "kein :root[data-theme=\"dark\"]-Block").toBeGreaterThan(-1);
            expect(css.slice(i)).toMatch(
              new RegExp(`--lb-ampel-${ton}-${rolle}\\s*:\\s*${paar[rolle]}\\s*[;}]`, "i"),
            );
          });
        }
      }

      it("schaltet ueber `data-theme`, nicht ueber `prefers-color-scheme`", () => {
        if (!datei.pflicht && !existsSync(datei.pfad)) return;
        const css = readFileSync(datei.pfad, "utf8");
        // Auf `prefers-color-scheme` zu selektieren bricht den Fall „System
        // dunkel, Umschalter hell" (docs/design/README.md:105-118).
        expect(css).not.toMatch(/prefers-color-scheme/);
        expect(css).toMatch(/:root\[data-theme="dark"\]/);
      });

      it("benutzt keine `--ant-*`-Variablen (die sieht eigenes Markup nicht)", () => {
        if (!datei.pflicht && !existsSync(datei.pfad)) return;
        expect(readFileSync(datei.pfad, "utf8")).not.toMatch(/var\(--ant-/);
      });

      it("enthaelt keine Medienabfrage; jede vorhandene max-width schreibt 767.98", () => {
        if (!datei.pflicht && !existsSync(datei.pfad)) return;
        const css = readFileSync(datei.pfad, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        for (const treffer of css.matchAll(/\(max-width:\s*([\d.]+)px\)/g)) {
          // Bei exakt 768px gaelten sonst beide Seiten und die
          // Stylesheet-Reihenfolge entschiede (Spec 6.8.6, Punkt 2).
          expect(treffer[1]).toBe("767.98");
        }
        expect(css).not.toMatch(/\(min-width:/);
      });
    });
  }
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/ampel.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./ampel"`.

- [ ] **Schritt 3: `_lib/ampel.ts` schreiben**

`src/app/m/lagerbuch/_lib/ampel.ts`:

```ts
import type { AmpelTon } from "./format";

/**
 * DIE FACHSEMANTISCHE PALETTE DES MODULS — analog `m/feedback/_lib/noten.ts`.
 *
 * WARUM HIER UND NICHT IN `core/theme/tokens.ts`: die Palette traegt die
 * Bedeutung eines FACHBEREICHS (Bestand, Verfall, Faelligkeit), nicht den
 * Farbeindruck der Suite. `core/theme/tokens.ts:6-11` sieht diese Ausnahme
 * ausdruecklich vor.
 *
 * KEIN "use client" (Spec 5.17): Server Components lesen diese Werte — die
 * Plakette, die KPI-Kante, das `warnung`-Zeichen. Ein Client-Modul lieferte
 * ihnen eine Client-REFERENZ statt des Objekts (Falle 6), HTTP 500 fuer die
 * ganze Seite, und weder `pnpm build` noch Vitest saehen es.
 *
 * KEIN EIGENER TYP `Ton` (Plan-Festlegung H2): die vier Tonnamen kommen aus
 * `_lib/format.ts#AmpelTon` — dieselbe Menge, ein Ort. Zwei Namen fuer eine
 * Menge waeren genau die Typinkonsistenz, gegen die die Interfaces-Bloecke der
 * Plaene geschrieben sind. Der Import ist `import type` und erzeugt deshalb
 * keinen Laufzeit-Zyklus (`format.ts` kennt diese Datei nicht — sie liefert
 * TONNAMEN und niemals Hexwerte).
 *
 * DIE LUMINANZ FAELLT MONOTON ueber ok -> gelb -> rot. Die Werte sind
 * GERECHNET, nicht gegriffen; `ampel.test.ts` rechnet sie nach und schlaegt an,
 * sobald ein spaeterer „schoenerer" Farbtausch den Kanal zerstoert. Das ist der
 * eine Kanal, der Rot-Gruen-Blindheit und Graustufen uebersteht
 * (docs/design/README.md:138-141).
 */
export type AmpelPaar = { readonly text: string; readonly flaeche: string };

/**
 * Hellmodus. Luminanz und Kontrast je Zeile — beides nachgerechnet in
 * `ampel.test.ts`, hier nur als Lesehilfe.
 */
export const AMPEL_HELL: Readonly<Record<AmpelTon, AmpelPaar>> = {
  ok:   { text: "#1e7a3c", flaeche: "#e4f2e9" }, // L 0,1452 — Kontrast 4,66 : 1
  gelb: { text: "#8a5200", flaeche: "#fbf1dc" }, // L 0,1144 — Kontrast 5,69 : 1
  rot:  { text: "#8c0d16", flaeche: "#f6e3e0" }, // L 0,0592 — Kontrast 7,78 : 1
  grau: { text: "#5b6570", flaeche: "#e7eaec" }, // L 0,1270 — Kontrast 4,91 : 1 — KEIN Ampelwert
} as const;

/** Dunkelmodus. Der Umschalter ist `<html data-theme>`, nie `prefers-color-scheme`. */
export const AMPEL_DUNKEL: Readonly<Record<AmpelTon, AmpelPaar>> = {
  ok:   { text: "#7ee0a0", flaeche: "#10261a" }, // L 0,6028 — Kontrast 9,94 : 1
  gelb: { text: "#d9a032", flaeche: "#2a1e05" }, // L 0,4012 — Kontrast 7,02 : 1
  rot:  { text: "#e8837c", flaeche: "#2a1113" }, // L 0,3484 — Kontrast 6,71 : 1
  grau: { text: "#9aa4ad", flaeche: "#1c2024" }, // L 0,3644 — Kontrast 6,47 : 1 — KEIN Ampelwert
} as const;

/**
 * DIE RANGFOLGE, UND `grau` STEHT NICHT DARIN.
 *
 * `grau` traegt „kein Datum gepflegt" (`domain/geraet.ts`) und „keine Messung"
 * (`domain/o2.ts`) — Zustaende, ueber die die Ampel gar keine Aussage macht. Er
 * darf NIE als gruen dargestellt werden, und er darf nicht in den
 * Monotonie-Test: seine Luminanz liegt hell zwischen gelb und ok, was den Test
 * ohne diese Trennung rot faerbte, obwohl nichts falsch ist.
 */
export const AMPEL_RANG = ["ok", "gelb", "rot"] as const satisfies readonly AmpelTon[];

/**
 * Der CSS-Variablenname zu einem Ton. Eine Funktion und keine zweite Tabelle:
 * die Namen entstehen mechanisch aus Ton und Rolle, und eine Tabelle waere ein
 * dritter Ort, an dem sich ein Tippfehler verstecken kann.
 */
export function ampelVar(ton: AmpelTon, rolle: "text" | "flaeche"): string {
  return `--lb-ampel-${ton}-${rolle}`;
}
```

- [ ] **Schritt 4: `_ui/verwaltung.module.css` schreiben**

`src/app/m/lagerbuch/_ui/verwaltung.module.css`:

```css
/*
 * DAS GESAMTE MODUL-CSS DER VERWALTUNG (Spec 6.8.4, „Eimer C").
 *
 * Was hier steht, hat einen von zwei Gruenden: entweder antd hat keinen
 * Baustein dafuer (Chip, KPI-Kante, Fachnummer, Brotkrume, Plakette), oder die
 * Suite-Regel erreicht das Element nicht (Fokusring auf eigenem Markup).
 * ALLES ANDERE IST WEG — eine uebrig gebliebene Regel ohne Verwender ist die
 * Sorte Ballast, die die naechste Aufraeumrunde entweder mitschleppt oder
 * mitsamt einer noch benutzten Nachbarregel entfernt.
 *
 * DREI REGELN, DIE HIER NIE GEBROCHEN WERDEN:
 *  1. KEIN `var(--ant-*)`. antd deklariert seine Variablen auf SEINER
 *     Scope-Klasse, nicht auf `:root`; eigenes Markup sieht sie nicht, und der
 *     Fehler ist STILL — die Haarlinie verschwindet einfach (Falle 2).
 *     `shell-css.test.ts:97-98` verbietet es repo-weit, `ampel.test.ts` hier.
 *  2. KEINE Medienabfrage. Der 760px-Block des Bestands entfaellt ersatzlos;
 *     seine drei Aufgaben uebernehmen Shell (Leiste -> Drawer), `Content` mit
 *     `SPACE.lg` (Innenabstand) und `Row`/`Col` mit `xs`/`md` (KPI-Raster).
 *     Wird doch eine noetig, heiszt sie `max-width: 767.98px` — bei exakt 768
 *     gaelten beide Seiten und die Stylesheet-Reihenfolge entschiede.
 *  3. Selektoren sind an `.modul` gebunden, nie an `:root` allein. Ein
 *     `:root .modul svg { … }` traefe auch die SVGs INNERHALB von
 *     antd-Komponenten und die QR-Codes der Etiketten (Falle 5, dritte
 *     Auspraegung).
 */

/*
 * DER VARIABLENTRAEGER — UND DIE EINE ZEILE, OHNE DIE DIE HALBE
 * FARBENTSCHEIDUNG STILL INS LEERE LAEUFT.
 *
 * `_ui/VerwaltungsRahmen.tsx` UND `_ui/DruckRahmen.tsx` (Teil 6) setzen
 * `className={s.modul}` auf ihr aeuszerstes Element. Fehlt der Traeger, loest
 * jedes `var(--lb-…)` ins Leere auf, faellt auf `transparent` zurueck und ist
 * GUELTIGES CSS: der Chip bekaeme Polster und Rundung ohne Farbe, die
 * KPI-Kante verschwaende, die Plakette bliebe weisz — HTTP 200, kein Log, und
 * der Scan in `ampel.test.ts` bliebe GRUEN, weil er die Deklaration prueft und
 * nicht ihren Traeger. Die einzige Aussage, die das haelt, ist ein echter
 * Abruf je Modus (T151).
 *
 * `--lb-rot` ist Marke und Handlung (Suite-Rot) und hat mit der Ampel NICHTS
 * zu tun (Spec 6.6.2). Sechs Namen, nicht neun: `gelb` und `ok` sind an
 * `colorWarning`/`colorSuccess` gebunden und laufen ohnehin ueber
 * `--lb-ampel-*`; sie brauchen kein zweites `--lb-*`.
 */
.modul {
  --lb-tinte:  #1a1d20;
  --lb-stahl:  #5b6570;
  --lb-linie:  #d9dde1;
  --lb-papier: #eef0f1;
  --lb-karte:  #ffffff;
  --lb-rot:    #c8000f;

  --lb-ampel-ok-text:   #1e7a3c;  --lb-ampel-ok-flaeche:   #e4f2e9;
  --lb-ampel-gelb-text: #8a5200;  --lb-ampel-gelb-flaeche: #fbf1dc;
  --lb-ampel-rot-text:  #8c0d16;  --lb-ampel-rot-flaeche:  #f6e3e0;
  --lb-ampel-grau-text: #5b6570;  --lb-ampel-grau-flaeche: #e7eaec;
}

:root[data-theme="dark"] .modul {
  --lb-tinte:  #ece9e2;
  --lb-stahl:  #9aa4ad;
  --lb-linie:  #2a2f34;
  --lb-papier: #0f1113;
  --lb-karte:  #16191c;
  --lb-rot:    #e04452;

  --lb-ampel-ok-text:   #7ee0a0;  --lb-ampel-ok-flaeche:   #10261a;
  --lb-ampel-gelb-text: #d9a032;  --lb-ampel-gelb-flaeche: #2a1e05;
  --lb-ampel-rot-text:  #e8837c;  --lb-ampel-rot-flaeche:  #2a1113;
  --lb-ampel-grau-text: #9aa4ad;  --lb-ampel-grau-flaeche: #1c2024;
}

/*
 * FOKUS AUF EIGENEM MARKUP.
 * Die Suite-Regel erreicht nur antd-Komponenten. Chip-Zeilen, KPI-Kacheln,
 * Brotkrume und Etikett-Kacheln brauchen ihren eigenen sichtbaren Fokus —
 * docs/design/README.md:143 laeszt „nie `outline: none` ohne Ersatz" ohne
 * Ausnahme gelten. Zeichengleich aus `globals.css:40` uebernommen.
 */
.modul a:focus-visible,
.modul button:focus-visible,
.modul input:focus-visible,
.modul select:focus-visible {
  outline: 2px solid var(--lb-rot);
  outline-offset: 2px;
}

/*
 * DER STATUSCHIP (Spec 6.6.3, 80 Verwendungen).
 * Die Farbe kommt NICHT als Prop, sondern ueber die Klasse aus den Variablen —
 * nur so traegt der Chip beide Modi, ohne dass der Server den Modus kennt.
 */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 99px;
  padding: 2.5px 9px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.ok   { color: var(--lb-ampel-ok-text);   background: var(--lb-ampel-ok-flaeche) }
.gelb { color: var(--lb-ampel-gelb-text); background: var(--lb-ampel-gelb-flaeche) }
.rot  { color: var(--lb-ampel-rot-text);  background: var(--lb-ampel-rot-flaeche) }
.grau { color: var(--lb-ampel-grau-text); background: var(--lb-ampel-grau-flaeche) }

/*
 * DIE KPI-KACHEL (Spec 6.6.4, 39 Verwendungen, davon 21 farbig).
 * „Text plus 3px linke Kante" ist genau das, was docs/design/README.md:57 als
 * Ersatz fuer ein rotes `Alert` VORSCHLAEGT. Die Kante traegt die Farbe, die
 * Zahl traegt Tinte — eine rote 7 waere von einer 7 in Suite-Rot nicht zu
 * unterscheiden, und ein Zahlenwert ist die Datenflaeche schlechthin.
 * Die Anordnung macht `Row`/`Col` mit `xs`/`md`, nicht dieses Stylesheet.
 */
.kpi {
  border-inline-start: 4px solid transparent;
  padding-inline-start: 12px;
  height: 100%;
}
.kpiRot  { border-inline-start-color: var(--lb-ampel-rot-text) }
.kpiGelb { border-inline-start-color: var(--lb-ampel-gelb-text) }
.kpiOk   { border-inline-start-color: var(--lb-ampel-ok-text) }

/*
 * Sechs der 39 Kacheln sind Links. Eine klickbare Kachel ohne erkennbare
 * Klickbarkeit ist eine Sackgasse fuer alle, die es nicht zufaellig
 * ausprobieren — deshalb Chevron (im Markup) und Hover NUR hier. Die nicht
 * verlinkten Kacheln tragen bewusst keinen Hover-Effekt.
 */
.kpiLink { display: block; color: inherit; text-decoration: none }
.kpiLink:hover { background: var(--lb-papier) }

/*
 * DIE BROTKRUME der neun Detailseiten (Spec 6.3.3).
 * Sie ist hier nicht Zierde: `aktiverEintrag` markiert diese neun Seiten
 * nicht, und der Verlust wird angenommen statt repariert. Eigenes Markup, KEIN
 * antd-`Breadcrumb` — ob die Komponente in der RSC-Ebene laedt, ist NICHT
 * gemessen, und `Breadcrumb.Item` steht auf der Verbotsliste.
 */
.backlink {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lb-stahl);
  text-decoration: none;
  min-height: 44px;
}
.backlink:hover { color: var(--lb-tinte) }

/* Die Fachnummer im Handlager — ein Mono-Kaestchen mit Rahmen. Kein
   antd-Baustein trifft das (Spec 6.8.4, Zeile 56-58). */
.fach {
  font-family: var(--font-geist-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  border: 1px solid var(--lb-linie);
  border-radius: 4px;
  padding: 1px 6px;
  color: var(--lb-stahl);
}

/*
 * DIE TREFFERANZEIGE „X von Y" (Spec 6.9.5).
 * Sie ist NICHT der Pager: „X von Y" heiszt „dein Filter blendet Y-X Zeilen
 * aus", ein Pager heiszt „diese Seite von mehreren". Deshalb eigenes Markup
 * ueber der Tabelle und nicht antds `pagination`.
 */
.filtertreffer {
  font-size: 12px;
  color: var(--lb-stahl);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Mono-Fuszzeile unter Listen (Spec 6.8.4, Zeile 102-103). `.empty` faellt
   weg — dafuer gibt es antds `Empty` mit eigener `description`. */
.footnote {
  font-family: var(--font-geist-mono);
  font-size: 12px;
  color: var(--lb-stahl);
}

/*
 * DIE JOURNALZEILE (Spec 6.8.4, Zeile 172-176; Spec 6.6.5).
 * Die Vorzeichenfarbe ist AMPEL-Rot/-Gruen, nicht Suite-Rot — und das
 * Vorzeichen steht ZUSAETZLICH im Text (`journalZeile().mengeText`, Teil 3
 * T42). Bedeutung nie allein ueber Farbe.
 */
.journalZeile { display: flex; align-items: center; gap: 10px }
.jts {
  font-family: var(--font-geist-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--lb-stahl);
  white-space: nowrap;
}
.jdelta {
  font-family: var(--font-geist-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}
.jminus { color: var(--lb-ampel-rot-text) }
.jplus  { color: var(--lb-ampel-ok-text) }

/*
 * WARN- UND INFOKASTEN (Spec 6.6.5).
 * Sie tragen eine FACHAUSSAGE („Charge abgelaufen", „nicht loeschbar") und
 * sind damit eine Datenflaeche — also AMPEL-Rot bzw. AMPEL-Gelb, nie
 * Suite-Rot. Ein `Alert type="error"` ueber einer Liste mit Ampel-Chips
 * braechte zwei verschiedene Rot auf denselben Bildschirm, und das
 * kraeftigere gehoerte der Fehlermeldung statt dem abgelaufenen Medikament.
 */
.warnbox {
  border-inline-start: 3px solid var(--lb-ampel-rot-text);
  background: var(--lb-ampel-rot-flaeche);
  color: var(--lb-ampel-rot-text);
  padding: 10px 12px;
  border-radius: 4px;
  font-size: 14px;
}
.infobox {
  border-inline-start: 3px solid var(--lb-ampel-gelb-text);
  background: var(--lb-ampel-gelb-flaeche);
  color: var(--lb-ampel-gelb-text);
  padding: 10px 12px;
  border-radius: 4px;
  font-size: 14px;
}

/*
 * DIE GEFAHRENZONE (Spec 6.6.5, `globals.css:243-246`).
 * Hier ist Suite-Rot RICHTIG: es umrandet einen HANDLUNGSbereich, keine
 * Flaeche mit Daten darin. Die Regel „kein Rot auf einer Datenflaeche" trennt
 * Handlung von Aussage, nicht rot von nicht-rot.
 */
.gefahr {
  border: 1px solid var(--lb-rot);
  border-radius: 6px;
  padding: 16px;
  margin-block-start: 24px;
}
.gtitle {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--lb-rot);
  margin-block-end: 8px;
}
```

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/ampel.test.ts
```

**Grün.** Die `helfer.module.css`-Zweige überspringen sich selbst, weil die Datei noch nicht existiert
— das ist H5 und **kein** Mangel.

- [ ] **Schritt 5: Die Gegenprobe zum Scan fahren — einmal, von Hand**

Ein Scan, der nie rot war, ist eine Behauptung. Ändere in `_ui/verwaltung.module.css` einen einzigen
Wert (`--lb-ampel-rot-text: #8c0d16` → `#8c0d17`), lass den Test laufen, und **stelle ihn zurück**:

```bash
sed -i.bak 's/--lb-ampel-rot-text:  #8c0d16/--lb-ampel-rot-text:  #8c0d17/' \
  src/app/m/lagerbuch/_ui/verwaltung.module.css
pnpm vitest run src/app/m/lagerbuch/_lib/ampel.test.ts   # MUSS rot sein
mv src/app/m/lagerbuch/_ui/verwaltung.module.css.bak \
   src/app/m/lagerbuch/_ui/verwaltung.module.css
pnpm vitest run src/app/m/lagerbuch/_lib/ampel.test.ts   # wieder gruen
```

Erwartet: `hell: --lb-ampel-rot-text traegt #8c0d16` schlägt fehl.

- [ ] **Schritt 6: Commit**

```bash
rtk git add src/app/m/lagerbuch/_lib/ampel.ts src/app/m/lagerbuch/_lib/ampel.test.ts \
            src/app/m/lagerbuch/_ui/verwaltung.module.css
rtk git commit -m "feat(lagerbuch): Ampelpalette und Modul-CSS der Verwaltung

Entscheidung 30, Option (c): die drei Werte sind so nachjustiert, dass die
relative Luminanz ueber die Rangfolge gut -> schlecht monoton faellt.

  ok   #1e7a3c (unveraendert — der Wert vom Etikett)
  gelb #b26a00 -> #8a5200 (Monotonie UND behebt 3,78 : 1, also unter AA)
  rot  #c8000f -> #8c0d16 (Ampel-Rot ist NICHT Suite-Rot, Falle 3)

grau ist KEIN Ampelwert und steht auszerhalb der Rangfolge.

Die Werte stehen an zwei Orten — TS fuer alles, was in TypeScript eine Farbe
braucht, CSS-Variablen fuer die Darstellung, weil ein CSS-Modul keine
TS-Konstante lesen kann und der Moduswechsel reines CSS ist. Der Scan in
ampel.test.ts bindet beide aneinander; ohne ihn driften sie still.

Der Scan laeuft in der EIGENSCHAFTSFORM ueber jede vorhandene _ui/*.module.css
und toleriert die noch fehlende helfer.module.css (Teil 4). Die Verschaerfung
auf 'beide existieren' ist T152 zugewiesen.

Gegenprobe gefahren: ein geaenderter Hexwert im CSS faerbt den Test rot."
```

---

### Task 101: `_ui/ikonen.tsx` — 36 Inline-SVG, kein Import, der 500 wirft

**Files:**
- Create: `src/app/m/lagerbuch/_ui/ikonen.tsx`
- Test: `src/app/m/lagerbuch/_ui/ikonen.test.ts`

**Interfaces:**
- Consumes: nichts. **Die Datei hat keinen einzigen Import auszer `react`s JSX-Laufzeit.**
- Produces:
  ```tsx
  // _ui/ikonen.tsx — KEIN "use client". Aus RSC UND aus Client-Inseln importierbar.
  export type IkonName =
    | "pfeil-links" | "pfeil-rechts" | "chevron-rechts" | "chevron-links"
    | "plus" | "minus" | "kreuz" | "haken" | "stift" | "papierkorb" | "archiv"
    | "kopieren" | "herunterladen" | "hochladen" | "drucken" | "lupe" | "info"
    | "erneut" | "zuruecksetzen" | "verketten" | "entketten" | "tabelle" | "liste"
    | "scannen" | "qr" | "schluessel" | "taschenlampe" | "auf-ab"
    | "warnung" | "medizin" | "objekt" | "sauerstoff" | "akku" | "verfall"
    | "handlager-griff" | "fahrzeug";
  export const PFADE: Record<IkonName, string>;
  export function Ikone(props: { name: IkonName; groesse?: number }): JSX.Element;
  ```
  Konsumenten: **jede** `.tsx` unter `src/app/m/lagerbuch/` — 23 Verwaltungsseiten und ihre Inseln
  (dieser Plan), der gesamte Helfer-Weg (**Teil 4**, §7.7.4), der Etikettenbogen (**Teil 6**).
- ⚠️ **Teil 4 IMPORTIERT diese Datei und legt keine zweite an** (Festlegung H6). §7.7.4 nennt achtzehn
  Zeichen des Helfer-Wegs; diese Union führt alle **36**. Braucht der Helfer-Weg ein 37., ergänzt er
  **hier** — und `ikonen.test.ts` meldet jeden Namen, der in einem `.tsx` steht und in `PFADE` fehlt.

**Die Regel, in einem Satz** (§6.5.1):

> **Unter `src/app/m/lagerbuch/` importiert keine einzige Datei `@ant-design/icons` — weder eine
> Server Component noch eine Client-Insel. Alle Zeichen des Moduls kommen aus `_ui/ikonen.tsx` als
> Inline-SVG.**

**Die Regel geht bewusst weiter als die Falle.** Falle 7 verbietet den Import nur in einer Server
Component. Vier Gründe, ihn trotzdem nirgends zu erlauben:

1. **Die Grenze verschiebt sich beim Bauen.** Wer heute eine Insel schreibt und morgen merkt, dass sie
   nichts Interaktives tut, löscht `"use client"` — und hat einen Ausfall gebaut, den weder
   `pnpm typecheck` noch `pnpm build` noch Vitest sieht.
2. **Der Ausfall ist maximal folgenreich.** Der nackte Spezifizierer löst über
   `exports["."].node.import` auf CJS auf, das `createContext` auf **Modulebene** ruft; in der
   RSC-Ebene gibt es das nicht → `TypeError: (0, _react.createContext) is not a function`, **schon
   beim Import, nicht beim Rendern**. Die teuerste Einzelstelle wäre `(arbeit)/layout.tsx`: **ein
   einziger Icon-Import legt alle 23 Arbeitsseiten lahm.**
3. ⚠️ **Der Reflex verschlimmert es.** `"use client"` auf eine Icon-Datei zu setzen behebt den 500
   nicht, es macht ihn **still**: gemessen liefert dieselbe Route dann HTTP 200 und
   `Object.keys(ICONS).length === 0` (Falle 6, `core/shell/icons.ts:105-112`). **Laut ist besser als
   still** — deshalb hat diese Datei **kein** `"use client"`, und sie darf keins bekommen.
4. **Es gibt kein zweites Zeichenvokabular zu pflegen.** Für die Helferin, die dasselbe Warndreieck am
   Regal sieht, und die Verwaltende, die es am Bildschirm sieht, ist das keine Kleinigkeit.

**Warum die Datei in beiden Ebenen läuft:** sie ruft **nichts auf Modulebene** auf und gibt nur JSX
zurück. Damit trifft Falle 7 sie nicht — und weil sie kein `"use client"` trägt, trifft sie Falle 6
auch nicht, wenn eine Server Component `PFADE` als **Wert** liest.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/ikonen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { PFADE, type IkonName } from "./ikonen";

const WURZEL = "src/app/m/lagerbuch";

function alleDateien(verzeichnis: string, endungen: string[]): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) treffer.push(...alleDateien(pfad, endungen));
    else if (endungen.some((e) => pfad.endsWith(e))) treffer.push(pfad);
  }
  return treffer;
}

/**
 * DER MODUL-EIGENE RIEGEL — UND WARUM DER VORHANDENE NICHT REICHT.
 *
 * `core/shell/icons.test.ts:147-171` ist ein repo-weiter Scan ueber vier
 * Importformen: er findet jede Datei, die `@ant-design/icons` OHNE
 * "use client" importiert. Beim Portieren schlaegt er zu, und das ist gut.
 *
 * Was er strukturell NICHT sieht: eine Client-Insel mit antd-Icons ist fuer
 * ihn ein GUELTIGER Zustand — die Regel aus Spec 6.5.1 geht weiter als die
 * Falle. Und er sieht nicht, ob ein benutzter IkonName ueberhaupt existiert.
 *
 * Punkt 3 ist der, der still bricht: ein Tippfehler ergibt
 * `PFADE["warnungg"] === undefined`, ein `<path d={undefined}>` und ein
 * UNSICHTBARES Zeichen — gueltiges SVG, HTTP 200, kein Log. Dieselbe
 * Fehlerklasse wie der falsche Registry-Icon-Name bei `files`, nur ohne
 * Rueckfall.
 */
describe("Ikonen-Riegel: kein fremdes Zeichenpaket im Modul", () => {
  const dateien = alleDateien(WURZEL, [".ts", ".tsx"]);

  it("findet ueberhaupt Dateien (sonst prueft der Scan nichts)", () => {
    expect(dateien.length).toBeGreaterThan(10);
  });

  it("keine Datei importiert @ant-design/icons — auch nicht mit \"use client\"", () => {
    const schuldige = dateien.filter((d) =>
      /from\s+["']@ant-design\/icons/.test(readFileSync(d, "utf8")),
    );
    expect(schuldige.map((d) => relative(WURZEL, d))).toEqual([]);
  });

  it("keine Datei importiert lucide-react (die Suite fuehrt das Paket nicht)", () => {
    const schuldige = dateien.filter((d) =>
      /from\s+["']lucide-react["']/.test(readFileSync(d, "utf8")),
    );
    expect(schuldige.map((d) => relative(WURZEL, d))).toEqual([]);
  });

  it("keine Datei importiert core/shell/icons (das ist core-Code fuer die Kopfzeile)", () => {
    const schuldige = dateien.filter((d) =>
      /from\s+["'](@\/core\/shell\/icons|.*core\/shell\/icons)["']/.test(readFileSync(d, "utf8")),
    );
    expect(schuldige.map((d) => relative(WURZEL, d))).toEqual([]);
  });

  it("ikonen.tsx traegt KEIN \"use client\" — das machte Falle 7 zu Falle 6", () => {
    const quelle = readFileSync(join(WURZEL, "_ui/ikonen.tsx"), "utf8");
    expect(quelle.slice(0, 200)).not.toMatch(/["']use client["']/);
  });
});

describe("Ikonen-Riegel: jeder benutzte Name existiert", () => {
  const tsx = alleDateien(WURZEL, [".tsx"]).filter((d) => !d.endsWith("ikonen.tsx"));

  it("jeder `<Ikone name=\"…\">` steht als Schluessel in PFADE", () => {
    const fehlend: string[] = [];
    for (const datei of tsx) {
      const quelle = readFileSync(datei, "utf8");
      for (const treffer of quelle.matchAll(/<Ikone\s[^>]*name=["']([^"']+)["']/g)) {
        if (!(treffer[1] in PFADE)) fehlend.push(`${relative(WURZEL, datei)}: "${treffer[1]}"`);
      }
    }
    // Ein Tippfehler ergibt ein unsichtbares Zeichen, kein Log, HTTP 200.
    expect(fehlend).toEqual([]);
  });

  it("jedes `name={\"…\" satisfies IkonName}` und jede IkonName-Konstante ebenso", () => {
    const fehlend: string[] = [];
    for (const datei of tsx) {
      const quelle = readFileSync(datei, "utf8");
      for (const treffer of quelle.matchAll(/["']([a-z-]+)["']\s+satisfies\s+IkonName/g)) {
        if (!(treffer[1] in PFADE)) fehlend.push(`${relative(WURZEL, datei)}: "${treffer[1]}"`);
      }
    }
    expect(fehlend).toEqual([]);
  });
});

describe("Ikonen: die Union ist die Autoritaet", () => {
  it("fuehrt genau 36 Namen", () => {
    // Die Rechnung aus Spec 6.5.3: 46 lucide-Zeichen − 6 ersatzlose
    // Streichungen − 4 Zusammenlegungen = 36.
    expect(Object.keys(PFADE)).toHaveLength(36);
  });

  it("fuehrt die acht Fachzeichen namentlich", () => {
    const fach: IkonName[] = ["warnung", "medizin", "objekt", "sauerstoff",
                              "akku", "verfall", "handlager-griff", "fahrzeug"];
    for (const name of fach) expect(PFADE[name], name).toBeTruthy();
  });

  it("jeder Pfad ist ein nicht leeres `d`-Attribut", () => {
    for (const [name, d] of Object.entries(PFADE)) {
      expect(typeof d, name).toBe("string");
      expect(d.trim().length, name).toBeGreaterThan(4);
      expect(d, `${name} beginnt nicht mit einem Move-Befehl`).toMatch(/^[Mm]/);
    }
  });

  it("kein Pfad ist doppelt vergeben", () => {
    // Zwei Namen auf demselben `d` waeren zwei Woerter fuer ein Zeichen —
    // genau die Doppeldeutigkeit, die Spec 6.5.4 aufloest.
    const werte = Object.values(PFADE);
    expect(new Set(werte).size).toBe(werte.length);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/ikonen.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./ikonen"`.

- [ ] **Schritt 3: `_ui/ikonen.tsx` schreiben — Kopf und Union**

`src/app/m/lagerbuch/_ui/ikonen.tsx`:

```tsx
/*
 * DIE EINE ZEICHENQUELLE DES MODULS — KEIN "use client", KEIN FREMDES PAKET.
 *
 * Zwei Fallen, gegenlaeufig, und diese Datei loest beide:
 *
 *  * Falle 6 — eine Server Component, die aus einem "use client"-Modul einen
 *    WERT importiert, bekommt eine Client-Referenz statt des Wertes. Diese
 *    Datei exportiert neben der Komponente die Tabelle PFADE, und Seiten lesen
 *    sie. Also: kein "use client".
 *  * Falle 7 — die Gegenrichtung: ein Modul, das Client sein MUESSTE und in
 *    der RSC-Ebene ausgewertet wird. Trifft hier nicht zu: die Datei ruft
 *    NICHTS auf Modulebene auf und gibt nur JSX zurueck, laeuft also in beiden
 *    Ebenen.
 *
 * WER "use client" AN DEN ANFANG SCHREIBT, VERWANDELT 7 IN 6: HTTP 200 mit
 * LEERER Map und still falschem Bild. Genau das ist `core/shell/icons.ts` bis
 * 2026-08-01 passiert und hat einen halben Tag gekostet (`:29-33`).
 * `ikonen.test.ts` riegelt es ab.
 *
 * DIE UNION IST DIE AUTORITAET. 36 Namen; `ikonen.test.ts` prueft gegen sie,
 * nicht gegen eine Aufzaehlung in der Spec. Wer ein Zeichen ergaenzt, ergaenzt
 * HIER — auch der Helfer-Weg (Teil 4) und der Etikettenbogen (Teil 6). Es gibt
 * im Modul genau eine Zeichenquelle statt zweier, damit die acht Fachzeichen
 * auf beiden Wegen gleich aussehen.
 *
 * WAS DIE REGEL NICHT BETRIFFT: die Suite-Kopfzeile. `SuiteHeader`/`SuiteNav`
 * benutzen `core/shell/icons.ts` fuer den Modulwechsler — das ist core-Code in
 * einer Client-Komponente und funktioniert. Ebenso die Zeichen, die antd
 * SELBST rendert (der Pfeil eines `Select`, das Kreuz eines `Modal`, der
 * Sortierpfeil einer `Table`): die kommen aus antds eigenem Buendel innerhalb
 * seiner Client-Komponenten und sind kein Import des Moduls.
 */

/** 28 reine UI-Zeichen und 8 Fachzeichen. Reihenfolge wie Spec 6.5.2. */
export type IkonName =
  // ── 28 reine UI-Zeichen ──────────────────────────────────────────────────
  | "pfeil-links" | "pfeil-rechts" | "chevron-rechts" | "chevron-links"
  | "plus" | "minus" | "kreuz" | "haken" | "stift" | "papierkorb" | "archiv"
  | "kopieren" | "herunterladen" | "hochladen" | "drucken" | "lupe" | "info"
  | "erneut" | "zuruecksetzen" | "verketten" | "entketten" | "tabelle" | "liste"
  | "scannen" | "qr" | "schluessel" | "taschenlampe" | "auf-ab"
  // ── 8 Fachzeichen (Spec 6.5.4) ───────────────────────────────────────────
  | "warnung" | "medizin" | "objekt" | "sauerstoff" | "akku" | "verfall"
  | "handlager-griff" | "fahrzeug";
```

- [ ] **Schritt 4: Die 36 Pfade schreiben**

Weiter in derselben Datei. **Alle Pfade sind auf `viewBox="0 0 24 24"` gezeichnet, Strichstärke 2,
runde Enden** — dieselbe Geometrie wie die abgelösten `lucide`-Zeichen, damit die Verwaltenden und die
Helfer sie wiedererkennen (§6.5.4).

```tsx
/**
 * Ein `d`-Attribut je Name. Mehrteilige Zeichen setzen die Teilpfade mit `M`
 * hintereinander — ein `<path>` genuegt, weil alle Teile dieselbe
 * Strichfuehrung tragen.
 */
export const PFADE: Record<IkonName, string> = {
  // ── UI ───────────────────────────────────────────────────────────────────
  "pfeil-links":   "M19 12H5 M12 19l-7-7 7-7",
  "pfeil-rechts":  "M5 12h14 M12 5l7 7-7 7",
  "chevron-rechts": "M9 18l6-6-6-6",
  "chevron-links":  "M15 18l-6-6 6-6",
  plus:            "M12 5v14 M5 12h14",
  minus:           "M5 12h14",
  kreuz:           "M18 6L6 18 M6 6l12 12",
  haken:           "M20 6L9 17l-5-5",
  stift:           "M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z",
  papierkorb:      "M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6",
  archiv:          "M21 8v13H3V8 M1 3h22v5H1z M10 12h4",
  kopieren:        "M9 9h11v11H9z M5 15H4V4h11v1",
  herunterladen:   "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  hochladen:       "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
  drucken:         "M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z",
  lupe:            "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z M21 21l-4.35-4.35",
  info:            "M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z M12 16v-4 M12 8h.01",
  erneut:          "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  zuruecksetzen:   "M1 4v6h6 M3.51 15a9 9 0 1 0 2.13-9.36L1 10",
  verketten:       "M15 7h3a5 5 0 0 1 0 10h-3 M9 17H6A5 5 0 0 1 6 7h3 M8 12h8",
  entketten:       "M18.36 6.64A9 9 0 0 1 20.77 15 M6.16 6.16a9 9 0 1 0 12.68 12.68 M2 2l20 20",
  tabelle:         "M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18",
  liste:           "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  scannen:         "M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M7 8v8 M11 8v8 M15 8v8",
  qr:              "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M18 18h3v3h-3z",
  schluessel:      "M21 2l-9.6 9.6 M15.5 7.5l3 3 M8.5 21a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11Z",
  taschenlampe:    "M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z M6 6h12 M12 12v3",
  "auf-ab":        "M7 15l5 5 5-5 M7 9l5-5 5 5",
  // ── Fachzeichen (Spec 6.5.4) ─────────────────────────────────────────────
  warnung:         "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z M12 9v4 M12 17h.01",
  medizin:         "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21l8.84-8.61a5.5 5.5 0 0 0 0-7.78Z M3.22 12H9.5l.5-1 2 4 .5-2h5.79",
  objekt:          "M16.5 9.4L7.5 4.21 M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12",
  sauerstoff:      "M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2 M9.6 4.6A2 2 0 1 1 11 8H2 M12.6 19.4A2 2 0 1 0 14 16H2",
  akku:            "M15 7h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2 M6 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4 M23 11v2 M11 7l-4 5h5l-4 5",
  verfall:         "M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5 M16 2v4 M8 2v4 M3 10h18 M18 22a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z M18 16.5V18l1 1",
  "handlager-griff": "M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14 M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12 M18.5 19a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z M22 22l-1.5-1.5",
  fahrzeug:        "M1 3h15v13H1z M16 8h4l3 3v5h-7V8Z M5.5 21a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z M18.5 21a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z",
};
```

- [ ] **Schritt 5: Die Komponente schreiben**

```tsx
/**
 * DREI EIGENSCHAFTEN SIND VERBINDLICH (Spec 6.5.2):
 *
 * 1. `aria-hidden` ist die VORGABE. Jedes Zeichen dieses Moduls steht neben
 *    Text — „Bedeutung nie allein ueber Farbe" gilt fuer Zeichen genauso. Ein
 *    Zeichen OHNE danebenstehenden Text ist ein Bedienelement und traegt dann
 *    ein `aria-label` am KNOPF, nicht am `<svg>`. Genau ein Fall in der
 *    Verwaltung: der Taschenlampen-Schalter des Scanners — und dessen Zustand
 *    muss zusaetzlich `aria-pressed` tragen, weil man „an" von „aus" sonst nur
 *    an der Farbe erkennt.
 *
 * 2. `stroke="currentColor"`, nie ein fester Wert. So erbt jedes Zeichen die
 *    Farbe seines Umfelds und ist im Dunkelmodus ohne Zutun richtig —
 *    dieselbe Begruendung, aus der `core/shell` es tut
 *    (`shell.module.css:155-158`).
 *
 * 3. VORGABEGROESZE 18px — nicht 17 wie `SideNav.tsx:36` und nicht 15 wie
 *    `Filterleiste.tsx:103`. EINE Groesze fuer die ganze Datei, also auch fuer
 *    den Helfer-Weg; abweichende Groeszen tragen sie als Prop und begruenden
 *    sie an der Aufrufstelle.
 *
 * `focusable="false"` ist gegen den Internet-Explorer-Erbe-Fall in
 * Screenreadern gesetzt und kostet nichts.
 */
export function Ikone({
  name,
  groesse = 18,
}: {
  name: IkonName;
  groesse?: number;
}) {
  return (
    <svg
      width={groesse}
      height={groesse}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ flex: "none" }}
    >
      <path d={PFADE[name]} />
    </svg>
  );
}
```

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/ikonen.test.ts
```

**Grün.**

- [ ] **Schritt 6: Die Gegenprobe zum Namensscan fahren**

```bash
cat > /tmp/ikon-gegenprobe.tsx <<'EOF'
import { Ikone } from "./ikonen";
export function Probe() { return <Ikone name="warnungg" />; }
EOF
cp /tmp/ikon-gegenprobe.tsx src/app/m/lagerbuch/_ui/Probe.tsx
pnpm vitest run src/app/m/lagerbuch/_ui/ikonen.test.ts   # MUSS rot sein
rm src/app/m/lagerbuch/_ui/Probe.tsx
pnpm vitest run src/app/m/lagerbuch/_ui/ikonen.test.ts   # wieder gruen
```

Erwartet: `jeder <Ikone name="…"> steht als Schluessel in PFADE` meldet `_ui/Probe.tsx: "warnungg"`.
⚠️ **`pnpm typecheck` hätte das ebenfalls gefunden** (der Name ist kein `IkonName`) — der Scan trägt
den Fall, in dem der Name **berechnet** wird (`name={`chip-${ton}` as IkonName}`), und genau dort ist
TypeScript machtlos.

- [ ] **Schritt 7: Die vier Zusammenlegungen und die sechs Streichungen protokollieren**

Kein Code — eine Zeile im Commit-Text, damit die Rechnung „46 − 6 − 4 = 36" nachlesbar bleibt und
niemand sie später für einen Zählfehler hält.

⚠️ **Vier Navigationszeichen sehen aus wie Streichkandidaten und sind keine.** `Truck`, `Package`,
`HeartPulse` und `CalendarClock` haben **außerhalb** der Navigation eine zweite, fachliche Verwendung.
**Wer die Navigationsliste als Streichliste liest, streicht sieben statt fünf** — und das Ergebnis
wäre ein leeres Zeichen im Vorlagen-Kopf und in der Token-Tabelle, still.

- [ ] **Schritt 8: Commit**

```bash
rtk git add src/app/m/lagerbuch/_ui/ikonen.tsx src/app/m/lagerbuch/_ui/ikonen.test.ts
rtk git commit -m "feat(lagerbuch): _ui/ikonen.tsx — 36 Inline-SVG, kein Icon-Import im Modul

Entscheidung 29, Option (a): Inline-SVG ohne \"use client\". Die Datei ruft
nichts auf Modulebene auf und ist damit aus RSC UND aus Client-Inseln
importierbar — Falle 6 und Falle 7 sind beide ausgeschlossen, nicht nur eine.

Die Regel geht bewusst weiter als Falle 7: KEIN @ant-design/icons im ganzen
Modul, auch nicht in einer Client-Insel. Die Grenze RSC/Insel verschiebt sich
beim Bauen, und ein geloeschtes \"use client\" baute einen Ausfall, den weder
typecheck noch build noch Vitest sieht. Teuerste Einzelstelle waere
(arbeit)/layout.tsx: ein Icon-Import legt alle 23 Arbeitsseiten lahm.

Rechnung: 46 lucide-Zeichen − 6 ersatzlose Streichungen (LayoutDashboard,
LayoutTemplate, Boxes, History, ShoppingCart als Navigationszeichen; LogOut
mit dem Abmelde-Formular) − 4 Zusammenlegungen (Key+KeyRound -> schluessel,
ClipboardCheck -> haken, ClipboardList -> liste, PackageCheck -> haken) = 36.
ChevronsUpDown faellt NICHT darunter: es bleibt als auf-ab fuer die
Sortierumschaltung der Artikeltabelle.

Truck, Package, HeartPulse und CalendarClock sehen aus wie Streichkandidaten
und sind keine — sie haben auszerhalb der Navigation eine fachliche Verwendung.

ikonen.test.ts prueft drei Dinge: kein @ant-design/icons, kein lucide-react,
und jeder in einer .tsx benutzte IkonName steht in PFADE. Punkt 3 faengt den
Tippfehler, der ein unsichtbares Zeichen ergibt — gueltiges SVG, HTTP 200,
kein Log. Gegenprobe gefahren.

Teil 4 (Helfer-Weg) und Teil 6 (Etiketten) importieren diese Datei und legen
keine zweite an."
```

---

### Task 102: `_lib/nav.ts` — fünfzehn Ziele, kein `/`-Eintrag

**Files:**
- Create: `src/app/m/lagerbuch/_lib/nav.ts`
- Test: `src/app/m/lagerbuch/_lib/nav.test.ts`

**Interfaces:**
- Consumes: `@/core/shell/types` — `type SuiteNavItem = { key: string; title: string; href: string }`
  (**nur der Typ**, kein Wert). Im Test zusätzlich `aktiverEintrag` aus `@/core/shell/SuiteNav`.
- Produces:
  ```ts
  // _lib/nav.ts — KEIN "use client" (§2.10).
  export const LAGERBUCH_NAV: SuiteNavItem[];   // 15 Einträge, äußere href, kein "/"
  ```
  Konsumenten: `verwaltung/(arbeit)/layout.tsx` (T112) — und **kein zweiter**.
  ⚠️ Bei `files` gibt es zwei (Layout und Rollen-Verteiler); hier bleibt es bei **einem**, weil
  `g/[code]/page.tsx` (Teil 4) den Rahmen zwar mountet, aber laut §2.9 **ohne** `nav` — es ist eine
  Blattseite, keine Verwaltungsseite mit Abschnitten.

**Warum die Datei in `_lib/` liegt und nicht neben der Komponente.** Eine **Server** Component liest
diesen **WERT**. Läge das Array neben einer `"use client"`-Komponente in `_ui/`, bekäme sie keine
Kopie, sondern eine Client-Referenz: `LAGERBUCH_NAV.map is not a function`, HTTP 500 für die ganze
Seite. TypeScript ist zufrieden, `pnpm build` findet nichts, und Vitest kann es strukturell nicht
sehen (Falle 6 — im Modul `feedback` genau so passiert, `MONATS_FENSTER`).

**Warum alle 15 bleiben** (Entscheidung 31, Option (a)). Die beiden Alternativen kosten mehr als sie
sparen: ein Überlaufmenü ist eine **größere** `core`-Änderung als die Überlaufreparatur
(`SuiteNavItem` kennt weder Gruppen noch Kinder), und „welche sieben sind wichtig" ist eine fachliche
Behauptung ohne Beleg — die Inventur ist einmal im Jahr wichtig und dann sehr. Eine Gruppierung
bräuchte eine dritte Ebene, die es nicht gibt, und kostete auf jedem Weg einen Klick.

⚠️ **Kein `/`-Eintrag, und das ist die folgenreichste Zeile dieses Tasks.** Der Wurzeleintrag ist in
`aktiverEintrag` der Rückfall für **jede** nicht getroffene Seite (`SuiteNav.tsx:107-108`) — und der
äußere Modulwurzelpfad von lagerbuch ist **das Gate**, nicht die Verwaltung. Ein Eintrag „Gate" wäre
auf neun Detailseiten hervorgehoben, während man auf einem Geräteblatt steht. **Eine falsche
Markierung ist schlechter als keine: keine sieht unaufmerksam aus, eine falsche lügt.**

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/nav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { LAGERBUCH_NAV } from "./nav";
import { aktiverEintrag } from "@/core/shell/SuiteNav";

describe("LAGERBUCH_NAV: die fuenfzehn Ziele", () => {
  it("fuehrt genau die 15 Eintraege aus SideNav.tsx:9-23, in dieser Reihenfolge", () => {
    expect(LAGERBUCH_NAV).toEqual([
      { key: "uebersicht", title: "Übersicht",     href: "/verwaltung" },
      { key: "artikel",    title: "Artikel",       href: "/verwaltung/artikel" },
      { key: "verfall",    title: "Verfall",       href: "/verwaltung/verfall" },
      { key: "fahrzeuge",  title: "Fahrzeuge",     href: "/verwaltung/fahrzeuge" },
      { key: "vorlagen",   title: "Vorlagen",      href: "/verwaltung/vorlagen" },
      { key: "checks",     title: "Checks",        href: "/verwaltung/checks" },
      { key: "bz",         title: "BZ-Kontrolle",  href: "/verwaltung/bz" },
      { key: "sauerstoff", title: "Sauerstoff",    href: "/verwaltung/sauerstoff" },
      { key: "geraete",    title: "Geräte",        href: "/verwaltung/geraete" },
      { key: "bestellung", title: "Bestellung",    href: "/verwaltung/bestellung" },
      { key: "inventur",   title: "Inventur",      href: "/verwaltung/inventur" },
      { key: "journal",    title: "Journal",       href: "/verwaltung/journal" },
      { key: "tokens",     title: "Zugangs-Codes", href: "/verwaltung/tokens" },
      { key: "etiketten",  title: "Etiketten",     href: "/verwaltung/etiketten" },
      { key: "import",     title: "Import",        href: "/verwaltung/import" },
    ]);
  });

  it("deklariert KEINEN Wurzeleintrag", () => {
    // Der Wurzeleintrag ist der Rueckfall fuer JEDE nicht getroffene Seite,
    // und der aeuszere Modulwurzelpfad von lagerbuch ist DAS GATE. Er waere
    // auf neun Detailseiten hervorgehoben, waehrend man auf einem
    // Geraeteblatt steht.
    expect(LAGERBUCH_NAV.some((e) => e.href === "/")).toBe(false);
  });

  it("traegt AUSSCHLIESZLICH die aeuszere Pfadform", () => {
    // Innere href kehrten die Suffix-Regel um: gegen den aeuszeren Pfad
    // schluege `endsWith` fehl, und die Markierung verschwaende auf dem
    // NORMALWEG (Spec 6.3.3).
    for (const e of LAGERBUCH_NAV) {
      expect(e.href, e.key).toMatch(/^\/verwaltung/);
      expect(e.href, e.key).not.toMatch(/^\/m\/lagerbuch/);
    }
  });

  it("hat eindeutige Schluessel und eindeutige Ziele", () => {
    expect(new Set(LAGERBUCH_NAV.map((e) => e.key)).size).toBe(15);
    expect(new Set(LAGERBUCH_NAV.map((e) => e.href)).size).toBe(15);
  });

  it("fuehrt weder kein-zugriff noch identitaeten", () => {
    // Spec 6.15, Auflage 22: beide Seiten gibt es nach dem Port nicht mehr
    // (Spec 11.4, 4.13) — ein sichtbarer Weg zu einer Sackgassenseite
    // verletzte die Gegenprobe aus docs/design/README.md:237-242.
    const ziele = LAGERBUCH_NAV.map((e) => e.href).join(" ");
    expect(ziele).not.toMatch(/kein-zugriff|identitaeten/);
  });

  it("traegt kein icon-Feld — SuiteNavItem hat keins, und zwar begruendet", () => {
    for (const e of LAGERBUCH_NAV) expect(Object.keys(e).sort()).toEqual(["href", "key", "title"]);
  });

  it("die Datei traegt kein \"use client\"", () => {
    // Ein WERT aus einem Client-Modul kommt in einer Server Component nicht
    // an — HTTP 500, und weder build noch Vitest sehen es (Falle 6).
    const quelle = readFileSync("src/app/m/lagerbuch/_lib/nav.ts", "utf8");
    expect(quelle.slice(0, 200)).not.toMatch(/["']use client["']/);
  });
});

/**
 * `aktiverEintrag`, DURCHGERECHNET STATT BEHAUPTET (Spec 6.3.3).
 *
 * Die Funktion arbeitet in drei Schritten: alle Nicht-Wurzel-Eintraege, die den
 * Pfad EXAKT treffen oder auf die sein Pfad ENDET; davon der mit dem laengsten
 * href; sonst der Wurzeleintrag; und wenn es keinen gibt, `null`.
 *
 * DIESER TEST IST NICHT DER BEWEIS, ER IST DIE RECHNUNG. `SuiteNav.test.tsx:48`
 * mockt `next/navigation` und sagt ueber sich selbst (`:263-266`), dass es die
 * Aufloesung unter dem Proxy-Rewrite NICHT beweisen kann. Der Beweis ist T150.
 */
describe("aktiverEintrag gegen LAGERBUCH_NAV", () => {
  it.each([
    ["/verwaltung", "uebersicht", true],
    ["/m/lagerbuch/verwaltung", "uebersicht", true],
    ["/verwaltung/artikel", "artikel", true],
    ["/m/lagerbuch/verwaltung/journal", "journal", true],
    ["/verwaltung/bz", "bz", true],
  ])("%s -> %s", (pfad, schluessel, genau) => {
    expect(aktiverEintrag(pfad, LAGERBUCH_NAV)).toEqual({ schluessel, genau });
  });

  it.each([
    ["/verwaltung/bz/17/kontrolle"],
    ["/verwaltung/geraete/scan"],
    ["/verwaltung/geraete/17"],
    ["/verwaltung/checks/abc"],
    ["/verwaltung/fahrzeuge/42"],
    ["/verwaltung/sauerstoff/7"],
    ["/verwaltung/vorlagen/3"],
    ["/verwaltung/bz/scan"],
    ["/verwaltung/bz/17"],
  ])("%s bekommt KEINE Markierung — der Verlust ist angenommen, nicht repariert", (pfad) => {
    // Faellt diese Zeile eines Tages rot, hat jemand einen /-Eintrag
    // deklariert oder `aktiverEintrag` geaendert. Beides soll auffallen.
    expect(aktiverEintrag(pfad, LAGERBUCH_NAV)).toBeNull();
  });

  it("die Uebersicht gewinnt NICHT gegen eine laengere Uebereinstimmung", () => {
    // `/verwaltung/artikel` endet nicht auf `/verwaltung`, aber die Sortierung
    // nach href-Laenge ist trotzdem die Zusicherung, die zaehlt: `bz` und
    // `bz/scan` waeren sonst vertauschbar.
    expect(aktiverEintrag("/verwaltung/artikel", LAGERBUCH_NAV)?.schluessel).toBe("artikel");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/nav.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./nav"`.

- [ ] **Schritt 3: `_lib/nav.ts` schreiben**

```ts
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE MODULNAVIGATION DER VERWALTUNG — ALLE FUENFZEHN ZIELE (Entscheidung 31,
 * Option (a)).
 *
 * WARUM `_lib/` UND NICHT `_ui/`: eine SERVER Component liest diesen WERT
 * (`verwaltung/(arbeit)/layout.tsx`). Laege das Array neben einer
 * "use client"-Komponente, bekaeme sie eine CLIENT-REFERENZ statt einer Kopie:
 * `LAGERBUCH_NAV.map is not a function`, HTTP 500 fuer die ganze Seite.
 * TypeScript ist zufrieden, `pnpm build` findet nichts, und Vitest kann es
 * strukturell nicht sehen — unter Vitest ist "use client" ein wirkungsloser
 * String (Falle 6; im Modul `feedback` genau so passiert).
 *
 * REIHENFOLGE, BESCHRIFTUNGEN UND href SIND WOERTLICH DIE HEUTIGEN
 * (`SideNav.tsx:9-23`). Der Umbau auf die Suite-Leiste ist ein Traegerwechsel,
 * keine Gelegenheit zum Umsortieren.
 *
 * DIE href TRAGEN DIE AEUSZERE PFADFORM. `aktiverEintrag` vergleicht per
 * Suffix, damit es beide Pfadformen traegt (`SuiteNav.tsx:70-82`). Innere href
 * (`/m/lagerbuch/verwaltung/artikel`) kehrten das um: gegen den aeuszeren Pfad
 * schluege `endsWith` fehl, und die Markierung verschwaende auf dem NORMALWEG.
 *
 * KEIN icon-FELD — `SuiteNavItem` hat keins, und zwar begruendet
 * (`core/shell/types.ts:19-20`). Mit den Navigationszeichen verschwinden
 * nebenbei zwei Doppeldeutigkeiten: `Package` stand fuer den Bereich „Artikel"
 * UND fuer die Geraeteklasse „objekt", `HeartPulse` fuer „BZ-Kontrolle" UND
 * fuer „medizin" — beide Paare gleichzeitig sichtbar auf /verwaltung/geraete.
 *
 * KEIN "/"-EINTRAG, und das ist die folgenreichste Zeile hier. Der
 * Wurzeleintrag ist der Rueckfall fuer JEDE nicht getroffene Seite
 * (`SuiteNav.tsx:107-108`), und der aeuszere Modulwurzelpfad von lagerbuch ist
 * DAS GATE (`page.tsx`, §2.1 b). Ein Eintrag „Gate" waere auf neun
 * Detailseiten hervorgehoben, waehrend man auf einem Geraeteblatt steht — eine
 * falsche Markierung ist schlechter als keine.
 *
 * DIE NEUN SEITEN OHNE MARKIERUNG tragen stattdessen eine Brotkrume
 * (`_ui/Brotkrume.tsx`, T108): bz/[id] · bz/[id]/kontrolle · bz/scan ·
 * checks/[id] · fahrzeuge/[id] · geraete/[id] · geraete/scan ·
 * sauerstoff/[id] · vorlagen/[id].
 *
 * FUENFZEHN EINTRAEGE PASSEN NUR, WEIL `.modulnav` DIE UEBERLAUFBEHANDLUNG
 * BEKOMMEN HAT (T105). Ohne sie scrollt bei 1280px `documentElement`
 * waagerecht — das ist nicht „die Leiste sieht eng aus", das ist die ganze
 * Seite, die seitwaerts wandert.
 */
export const LAGERBUCH_NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht",     href: "/verwaltung" },
  { key: "artikel",    title: "Artikel",       href: "/verwaltung/artikel" },
  { key: "verfall",    title: "Verfall",       href: "/verwaltung/verfall" },
  { key: "fahrzeuge",  title: "Fahrzeuge",     href: "/verwaltung/fahrzeuge" },
  { key: "vorlagen",   title: "Vorlagen",      href: "/verwaltung/vorlagen" },
  { key: "checks",     title: "Checks",        href: "/verwaltung/checks" },
  { key: "bz",         title: "BZ-Kontrolle",  href: "/verwaltung/bz" },
  { key: "sauerstoff", title: "Sauerstoff",    href: "/verwaltung/sauerstoff" },
  { key: "geraete",    title: "Geräte",        href: "/verwaltung/geraete" },
  { key: "bestellung", title: "Bestellung",    href: "/verwaltung/bestellung" },
  { key: "inventur",   title: "Inventur",      href: "/verwaltung/inventur" },
  { key: "journal",    title: "Journal",       href: "/verwaltung/journal" },
  { key: "tokens",     title: "Zugangs-Codes", href: "/verwaltung/tokens" },
  { key: "etiketten",  title: "Etiketten",     href: "/verwaltung/etiketten" },
  { key: "import",     title: "Import",        href: "/verwaltung/import" },
];
```

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/nav.test.ts
```

**Grün.**

⚠️ **Der Eintrag `etiketten` zeigt in die Gruppe `(druck)`, die Teil 6 baut.** Bis dahin antwortet
`/verwaltung/etiketten` mit 404. Das ist gewollt und richtig: die Navigation ist vollständig, sobald
sie entsteht, und ein nachträglich ergänzter Eintrag ist genau der, den jemand vergisst (§6.12,
Frage 1).

- [ ] **Schritt 4: Commit**

```bash
rtk git add src/app/m/lagerbuch/_lib/nav.ts src/app/m/lagerbuch/_lib/nav.test.ts
rtk git commit -m "feat(lagerbuch): LAGERBUCH_NAV — alle 15 Ziele, kein Wurzeleintrag

Entscheidung 31, Option (a). Reihenfolge, Beschriftungen und href woertlich aus
SideNav.tsx:9-23; die href tragen die AEUSZERE Pfadform, weil aktiverEintrag
per Suffix vergleicht und innere href die Markierung auf dem Normalweg
zerstoerten.

KEIN /-Eintrag: er waere der Rueckfall fuer jede nicht getroffene Seite, und
der aeuszere Modulwurzelpfad ist das GATE. Der Test rechnet aktiverEintrag
gegen alle neun Detailseiten durch und haelt fest, dass sie KEINE Markierung
bekommen — faellt er rot, hat jemand einen Wurzeleintrag deklariert.

Der Beweis unter dem Proxy-Rewrite ist T150 (Playwright), nicht dieser Test:
SuiteNav.test.tsx mockt usePathname und sagt das ueber sich selbst."
```

---

### Task 103: `_lib/schrift.ts` — 21 Größen werden sechs Rollen

**Files:**
- Create: `src/app/m/lagerbuch/_lib/schrift.ts`
- Test: `src/app/m/lagerbuch/_lib/schrift.test.ts`

**Interfaces:**
- Consumes: `react` — `type CSSProperties`. Sonst nichts.
- Produces:
  ```ts
  // _lib/schrift.ts — KEIN "use client" (Falle 6: Server Components lesen das hier).
  export const SCHRIFT: {
    titel: CSSProperties; abschnitt: CSSProperties; feldname: CSSProperties;
    text: CSSProperties; neben: CSSProperties; zahl: CSSProperties; mono: CSSProperties;
  };
  ```
  Konsumenten: **jede** der 23 Seiten (Überschriften, Abschnittstitel, KPI-Zahlen) und die Inseln.

**Warum Rollen und keine Werte.** `docs/design/README.md:149-152` verlangt „eine Datei mit fertigen
`CSSProperties` je Rolle, statt Schriftgrößen im Markup zu verstreuen", und in Admin-Ansichten „antds
eigene Leiter" — „eine dritte Skala im Produkt wäre der Fehler, nicht die Lösung". Der Bestand hat
**21** verschiedene px-Größen; die Halbpixelwerte (10,5 / 11,5 / 12,5 / 13,5 / 14,5) sind kein
Versehen, sie stehen wortgleich schon im Mockup — und sie fallen.

**Was die Display-Schrift tatsächlich geleistet hat, überlebt als Eigenschaft.** Barlow Condensed lag
auf `.cardtitle`, `.label`, `.secthead`, `.tbl th`, `.mainhead h1`, `.kpi b`, `.bignum`, `.fachhead` —
also durchweg auf **Struktur**, nicht auf Inhalt. Diese Unterscheidung lässt sich mit Größe, Gewicht,
Laufweite und Versalien ebenso ausdrücken wie mit einer zweiten Schriftfamilie.

⚠️ **Annahme A-S1, benannt statt versteckt:** die drei Google-Schriften sind **keine** CD-Vorgabe
(Betreiberfrage 29, unbeantwortet). Die Verwaltung bekommt **Geist Sans / Geist Mono**, den
Suite-Standard. **Falls doch gebunden**, kehrt sich genau ein Spiegelstrich um: eine modul-lokale
Registrierung nach dem Muster `m/feedback/f/[slugSecret]/Zustaende.tsx:2` plus die Zuweisung von
`--lb-display` in `_ui/verwaltung.module.css` (T100). **Die Rollen unten bleiben unverändert** — sie
sind als Rollen definiert und nicht als Schriftnamen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/schrift.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { SCHRIFT } from "./schrift";

/** antds Leiter (docs/design/README.md:150-151). Eine dritte Skala waere der Fehler. */
const LEITER = [12, 14, 16, 20, 24, 30];

describe("SCHRIFT: sieben Rollen auf antds Leiter", () => {
  it("fuehrt genau die sieben benannten Rollen", () => {
    expect(Object.keys(SCHRIFT).sort()).toEqual(
      ["abschnitt", "feldname", "mono", "neben", "text", "titel", "zahl"],
    );
  });

  it("jede fontSize liegt auf der Leiter — keine Halbpixelwerte", () => {
    for (const [rolle, stil] of Object.entries(SCHRIFT)) {
      expect(LEITER, `${rolle}: ${stil.fontSize}`).toContain(stil.fontSize);
    }
  });

  it("Zahlenrollen tragen tabular-nums", () => {
    // Ohne sie wandern Bestandszahlen in einer Tabellenspalte gegeneinander.
    // Im gesamten Alt-Repo kommt `font-variant-numeric` NULL Mal vor — die
    // Ziffernausrichtung haengt heute allein an IBM Plex Mono, und die faellt.
    expect(SCHRIFT.zahl.fontVariantNumeric).toBe("tabular-nums");
    expect(SCHRIFT.mono.fontVariantNumeric).toBe("tabular-nums");
  });

  it("die Strukturrollen tragen Versalien plus Laufweite statt einer zweiten Familie", () => {
    for (const rolle of ["abschnitt", "feldname"] as const) {
      expect(SCHRIFT[rolle].textTransform, rolle).toBe("uppercase");
      expect(SCHRIFT[rolle].letterSpacing, rolle).toBeTruthy();
      expect(SCHRIFT[rolle].fontWeight, rolle).toBe(600);
    }
  });

  it("nur die Mono-Rolle nennt eine Schriftfamilie, und es ist die der Suite", () => {
    for (const [rolle, stil] of Object.entries(SCHRIFT)) {
      if (rolle === "mono") expect(stil.fontFamily).toBe("var(--font-geist-mono)");
      else expect(stil.fontFamily, rolle).toBeUndefined();
    }
  });

  it("keine Rolle setzt eine Farbe", () => {
    // Farbe kommt aus `--lb-*` bzw. aus antds Tokens — eine Rolle, die faerbt,
    // waere eine zweite Farbquelle (Spec 6.6.6, Regel 2).
    for (const [rolle, stil] of Object.entries(SCHRIFT)) {
      expect(stil.color, rolle).toBeUndefined();
      expect(stil.background, rolle).toBeUndefined();
    }
  });
});

/**
 * DIE 16px-UNTERGRENZE — und warum sie hier nachgeprueft wird und nicht nur in
 * `core/theme/feldschrift.test.ts`.
 *
 * Der Suite-Riegel hat ZWEI Luecken, und die Verwaltung traf beide: er liest
 * ausschlieszlich die Langform `/font-size:\s*(\d+)px/` (die
 * font-Kurzschreibweise passiert gruen) und filtert nach dem Selektortext
 * (`.stepval` nennt kein Eingabeelement, ist aber ein echtes `<input>`).
 * Beide Luecken schlieszen sich durch den Bausteintausch — `.input`,
 * `.combo-input` und der Stepper verschwinden mit `Input`/`Select`/
 * `InputNumber`. VERBINDLICH bleibt die Regel trotzdem, weil das Modul-CSS
 * neue Felder einfuehren koennte.
 *
 * Die Suite sperrt den Zoom (`viewport` mit `maximumScale: 1`); beide Regeln
 * sind ausdruecklich eine EINHEIT — ohne Zoom kann niemand mehr heranholen,
 * was zu klein ist.
 */
describe("Kein Eingabefeld unter 16px im ganzen Modul", () => {
  function alleCss(verzeichnis: string): string[] {
    const treffer: string[] = [];
    for (const eintrag of readdirSync(verzeichnis)) {
      const pfad = join(verzeichnis, eintrag);
      if (statSync(pfad).isDirectory()) treffer.push(...alleCss(pfad));
      else if (pfad.endsWith(".css")) treffer.push(pfad);
    }
    return treffer;
  }

  it("kein Selektor unter m/lagerbuch setzt <16px auf ein Eingabeelement", () => {
    const verstoesze: string[] = [];
    for (const datei of alleCss("src/app/m/lagerbuch")) {
      const css = readFileSync(datei, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const regel of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const selektor = regel[1];
        if (!/\b(input|textarea|select)\b|\.ant-select-selector/.test(selektor)) continue;
        // BEIDE Schreibweisen — die Kurzform ist genau die Luecke des
        // Suite-Riegels (`font: 500 14px var(--body)`).
        const lang = /font-size:\s*([\d.]+)px/.exec(regel[2]);
        const kurz = /font:\s*[^;]*?\b([\d.]+)px/.exec(regel[2]);
        for (const treffer of [lang, kurz]) {
          if (treffer && Number(treffer[1]) < 16) {
            verstoesze.push(`${relative("src/app/m/lagerbuch", datei)}: ${selektor.trim()} → ${treffer[1]}px`);
          }
        }
      }
    }
    expect(verstoesze).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/schrift.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./schrift"`.

- [ ] **Schritt 3: `_lib/schrift.ts` schreiben**

```ts
import type { CSSProperties } from "react";

/**
 * ROLLEN STATT WERTE (Entscheidung 32, docs/design/README.md:149-152).
 *
 * KEIN "use client" (Falle 6): Server Components lesen diese Konstante — jede
 * der 23 Seiten setzt ihre Ueberschrift damit. Aus einem Client-Modul kaeme
 * eine Client-Referenz statt des Objekts, HTTP 500 fuer die ganze Seite.
 *
 * DIE VERWALTUNG BEKOMMT GEIST — den Suite-Standard, ohne die drei
 * Google-Schriften des Bestands. Begruendung in drei Punkten:
 *
 *  1. Admin-Ansichten „gehoeren sichtbar zur Suite"
 *     (docs/design/README.md:15-21); oeffentliche Ansichten „duerfen
 *     eigenstaendig aussehen". Der Helfer-Weg behaelt Barlow Condensed als
 *     `--lb-display` (Teil 4, §7.1) — die Verwaltung ist eine Admin-Ansicht
 *     neben portal, qr, feedback und files, und eine eigene Schriftfamilie
 *     machte lagerbuch dort zum Fremdkoerper, auf jeder Seite.
 *  2. Die Wortmarke, die die Wiedererkennung traegt, steht gar nicht mehr in
 *     der Verwaltung — sie verschwindet mit dem Modul-Layout (§6.1.2). Der
 *     Ort, an dem „LAGERBUCH" in Barlow Condensed das Erste ist, was jemand
 *     sieht, ist das Gate und der Helfer-Rahmen.
 *  3. Die Display-Rolle trug in der Verwaltung STRUKTUR, nicht Marke — und
 *     Struktur laeszt sich mit Groesze, Gewicht, Laufweite und Versalien
 *     ebenso ausdruecken.
 *
 * ANNAHME A-S1: die drei Schriften sind KEINE CD-Vorgabe (Betreiberfrage 29,
 * unbeantwortet; das Repo enthaelt keinen Hinweis). Faellt die Antwort
 * „gebunden", kehrt sich nur Punkt 1 um: eine modul-lokale Registrierung nach
 * dem Muster `m/feedback/f/[slugSecret]/Zustaende.tsx:2` plus `--lb-display`
 * in `_ui/verwaltung.module.css`. DIESE ROLLEN BLEIBEN UNVERAENDERT — sie sind
 * als Rollen definiert und nicht als Schriftnamen.
 *
 * AUS 21 GROESZEN WERDEN SECHS. Alle liegen auf antds Leiter
 * (12/14/16/20/24/30); die Halbpixelwerte (10,5 / 11,5 / 12,5 / 13,5 / 14,5)
 * fallen. Eine dritte Skala im Produkt waere der Fehler, nicht die Loesung.
 *
 * `tabular-nums` IST PFLICHT, wo Ziffern verglichen werden (§6.7.3): im
 * gesamten Alt-Repo kommt `font-variant-numeric` NULL Mal vor — die
 * Ziffernausrichtung haengt heute allein an IBM Plex Mono. Faellt die weg,
 * wandern Bestandszahlen in einer Tabellenspalte gegeneinander.
 */
export const SCHRIFT = {
  /** Seitentitel — ersetzt `.mainhead h1` (24px Barlow Condensed versal). */
  titel: {
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: "0.02em",
    lineHeight: 1.2,
  },
  /** Abschnittsueberschrift — ersetzt `.secthead` und `.cardtitle`. */
  abschnitt: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
  },
  /** Feldbeschriftung — ersetzt `.label`. */
  feldname: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
  },
  /** Fliesztext und Tabelleninhalt. */
  text: { fontSize: 14 },
  /** Nebentext — ersetzt `.rowmeta small`, `.cardnote`, `.mainhead p`. */
  neben: { fontSize: 12 },
  /** Grosze Zahl — ersetzt `.bignum`, `.kpi b`, `.tbl .num`. */
  zahl: {
    fontSize: 24,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  },
  /** Fachinformation in Mono — Fachnummern, Journalzeilen, Zugangs-Codes. */
  mono: {
    fontFamily: "var(--font-geist-mono)",
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
} satisfies Record<string, CSSProperties>;
```

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/schrift.test.ts
```

**Grün.**

- [ ] **Schritt 4: Commit**

```bash
rtk git add src/app/m/lagerbuch/_lib/schrift.ts src/app/m/lagerbuch/_lib/schrift.test.ts
rtk git commit -m "feat(lagerbuch): _lib/schrift.ts — sieben Rollen statt 21 Groeszen

Entscheidung 32: die Verwaltung bekommt Geist (Suite-Standard), der Helfer-Weg
behaelt Barlow Condensed (Teil 4). Admin-Ansichten gehoeren sichtbar zur
Suite; die Wortmarke, die die Wiedererkennung traegt, steht nach §6.1.2 gar
nicht mehr in der Verwaltung.

Annahme A-S1: die drei Google-Schriften sind keine CD-Vorgabe (Betreiberfrage
29 unbeantwortet). Faellt die Antwort 'gebunden', kostet die Umkehr eine
modul-lokale Registrierung plus --lb-display; die Rollen bleiben, weil sie als
Rollen definiert sind.

Alle fontSize liegen auf antds Leiter, die Halbpixelwerte fallen. tabular-nums
auf `zahl` und `mono`: im Alt-Repo kommt font-variant-numeric NULL Mal vor,
die Ziffernausrichtung haengt allein an IBM Plex Mono — und die faellt.

Der Test bringt zusaetzlich die 16px-Untergrenze mit, in BEIDEN
Schreibweisen: core/theme/feldschrift.test.ts liest nur die Langform, und
genau dadurch passierten .input und .combo-input mit 14px gruen."
```

---

### Task 104: `_lib/mengen.ts` — die eine Mengenoperation

**Files:**
- Create: `src/app/m/lagerbuch/_lib/mengen.ts`
- Test: `src/app/m/lagerbuch/_lib/mengen.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export function toggleInSet<T>(set: ReadonlySet<T>, item: T): Set<T>;
  ```
  Konsumenten: `GeraeteListe.tsx` (T143, Mehrfachauswahl Klasse) und `TokenTable.tsx` (T148,
  Mehrfachauswahl Ziel) — dieselben zwei wie im Bestand (`GeraeteListe.tsx:27`, `TokenTable.tsx:38`).

**Warum eine eigene Datei** (Festlegung H3). §6.9.4 Punkt 4 sagt nur „wandert als generische
Mengenoperation nach `_lib/` — sie ist kein Bedienelement und hat mit der Filterleiste nur den
Ablageort gemeinsam". `_lib/suche.ts` trägt die Faltung, `_lib/format.ts` Text und Tonnamen; eine
generische Mengenoperation gehört in keine von beiden.

**Warum es sie überhaupt gibt und nicht `setState(s => new Set(...))` an zwei Stellen.** Weil die
Operation **immutabel** sein muss: `set.add(x)` auf dem vorhandenen `Set` ändert die Referenz nicht,
React rendert nicht neu, und der Filterchip bleibt sichtbar unverändert — **kein Fehler, keine
Meldung, ein Klick, der nichts tut.** Genau diesen Fall fängt der Test unten.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/mengen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toggleInSet } from "./mengen";

describe("toggleInSet", () => {
  it("fuegt ein fehlendes Element hinzu", () => {
    expect([...toggleInSet(new Set(["a"]), "b")].sort()).toEqual(["a", "b"]);
  });

  it("entfernt ein vorhandenes Element", () => {
    expect([...toggleInSet(new Set(["a", "b"]), "a")]).toEqual(["b"]);
  });

  it("arbeitet auf einer leeren Menge", () => {
    expect([...toggleInSet(new Set<string>(), "a")]).toEqual(["a"]);
  });

  it("liefert IMMER eine neue Referenz und laeszt die alte unberuehrt", () => {
    // DIE EIGENTLICHE ZUSICHERUNG. Mutierte die Funktion die uebergebene
    // Menge, bliebe die Referenz gleich, React renderte nicht neu, und der
    // Filterchip saehe unveraendert aus — ein Klick, der nichts tut, ohne
    // Fehler und ohne Meldung.
    const vorher = new Set(["a"]);
    const nachher = toggleInSet(vorher, "b");
    expect(nachher).not.toBe(vorher);
    expect([...vorher]).toEqual(["a"]);
    const wiederWeg = toggleInSet(nachher, "b");
    expect(wiederWeg).not.toBe(nachher);
    expect([...nachher].sort()).toEqual(["a", "b"]);
  });

  it("traegt beliebige Werttypen", () => {
    expect([...toggleInSet(new Set([1, 2]), 3)].sort()).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/mengen.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./mengen"`.

- [ ] **Schritt 3: `_lib/mengen.ts` schreiben**

```ts
/**
 * Immutables Umschalten eines Werts in einer Menge (fuer Mehrfach-Filter).
 *
 * Zeichengleich aus `lagerbuch/src/components/Filterleiste.tsx:15-20`
 * uebernommen, nur der Ablageort wechselt: sie ist KEIN Bedienelement und hat
 * mit der Filterleiste nur den Ablageort gemeinsam (§6.9.4, Punkt 4).
 *
 * IMMUTABEL IST DIE GANZE ZUSICHERUNG. `set.add(x)` auf der uebergebenen Menge
 * aenderte die Referenz nicht, React renderte nicht neu, und der Filterchip
 * saehe unveraendert aus — ein Klick, der nichts tut, ohne Fehler und ohne
 * Meldung. `mengen.test.ts` haelt es fest.
 *
 * KEIN "use client": die Datei liegt unter `_lib/` und wird von Client-Inseln
 * importiert. Ein Client-Modul waere hier harmlos, aber die Regel „kein
 * \"use client\" unter `_lib/`" ist absichtlich ausnahmslos — sonst muss bei
 * jeder Datei einzeln entschieden werden, ob eine Server Component sie je
 * anfassen wird.
 */
export function toggleInSet<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const naechste = new Set(set);
  if (naechste.has(item)) naechste.delete(item);
  else naechste.add(item);
  return naechste;
}
```

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/mengen.test.ts
```

**Grün.**

- [ ] **Schritt 4: Commit**

```bash
rtk git add src/app/m/lagerbuch/_lib/mengen.ts src/app/m/lagerbuch/_lib/mengen.test.ts
rtk git commit -m "feat(lagerbuch): _lib/mengen.ts — toggleInSet, immutabel

Zeichengleich aus Filterleiste.tsx:15-20; nur der Ablageort wechselt (§6.9.4,
Punkt 4: kein Bedienelement, teilt mit der Filterleiste nur den Ordner).

Die Immutabilitaet ist die ganze Zusicherung: eine mutierende Fassung liesze
die Referenz gleich, React renderte nicht neu, und der Filterchip saehe
unveraendert aus — ein Klick, der nichts tut, ohne Fehler und ohne Meldung."
```

---

### Task 105: `.modulnav` bekommt die Überlaufbehandlung — die eine `core`-Änderung

**Files:**
- Modify: `src/core/shell/shell.module.css`
- Modify: `src/core/shell/shell-css.test.ts` (ERWEITERUNG)

**Interfaces:**
- Consumes: nichts.
- Produces: die Zusage, dass fünfzehn Navigationseinträge bei 1280px **nicht** die ganze Seite
  seitwärts schieben. Nutznießer sind alle 23 Arbeitsseiten (T112 aufwärts) — und jedes künftige
  Modul mit vielen Abschnitten.
- ⚠️ **Das ist die EINZIGE `core`-Änderung dieses Plans und bekommt einen EIGENEN Commit** (§6.3.2,
  Anhang „Arbeit 4"), nicht als Nebenwirkung in einem Modul-Commit.

**Der Befund, gerechnet statt vermutet.** `.modulnav` ist ein Flex-Container **ohne** `overflow-x`:
die Grundregel steht auf `display: none` (`shell.module.css:122-129`), die waagerechte Fassung wird
erst in der `min-width: 768px`-Abfrage gesetzt (`:194-196`), dort in Vorgabestellung `nowrap`;
`.navLink` trägt `min-height: 56px` und `padding-inline: 12px` (`:161-169`). Fünfzehn Links mit den
lagerbuch-Beschriftungen (zusammen **127 Zeichen**) liegen überschlägig bei **1.300–1.400px**. Bei
1280px kann kein Link unter seine `min-content`-Breite schrumpfen — also läuft die Zeile über, und
**`documentElement` scrollt waagerecht.** Das ist nicht „die Leiste sieht eng aus", das ist die ganze
Seite, die seitwärts wandert.

⚠️ **Zur `core`-Regel, damit die Begründung nicht unterschoben wird.** `docs/design/README.md:25-28`
verlangt einen zweiten, heute belegbaren Nutznießer — **diese Regel gilt für Hebungen**, also dafür,
Modulcode nach `core` zu verschieben. Hier wird **nichts gehoben**: `.modulnav` **liegt bereits** in
`core` und wird von jedem Modul benutzt. Was hier passiert, ist die **Reparatur** eines vorhandenen
`core`-Bausteins, den lagerbuch als erstes Modul über seine Belastungsgrenze fährt. Ein Modul, das
einen `core`-Defekt findet, darf ihn beheben; es muss dafür kein zweites Modul mitbringen. **Die
Alternative — die 15 Einträge im Modul zu verstecken, damit der Defekt unentdeckt bleibt — ist die
schlechtere: sie belässt die Falle für das sechste Modul.**

**Wer welche Aussage besitzt** (`docs/design/README.md:199-212`):

| Aussage | Wer sie besitzt |
|---|---|
| „die Regel steht in `.modulnav`" | `core/shell/shell-css.test.ts` — **dieser Task** |
| „`documentElement.scrollWidth === clientWidth` auf `/verwaltung/artikel` mit 15 Einträgen" | **Playwright bei 1280×720** — T150 |
| „die Leiste ist unsichtbar und die Ziele stehen im Drawer" | Playwright bei 390px — T150 |

⚠️ **Der 1280er-Lauf ist der eigentliche Beweis.** Bei 390px sind die richtige und die kaputte Fassung
**nicht zu unterscheiden**, weil `.modulnav` dort auf `display: none` steht.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Erweitere `src/core/shell/shell-css.test.ts` — **im vorhandenen `describe("shell.module.css")`-Block**,
hinter dem `[aria-current]`-Test:

```ts
  it("laeszt `.modulnav` waagerecht scrollen statt `documentElement`", () => {
    /*
     * DIE UEBERLAUFBEHANDLUNG (Spec 6.3.2 des lagerbuch-Entwurfs,
     * Entscheidung 31).
     *
     * `.modulnav` ist ein Flex-Container mit `nowrap` ab 768px; `.navLink`
     * traegt `min-height: 56px` und `padding-inline: 12px`. Ein Modul mit
     * VIELEN Abschnitten sprengt die Zeile: lagerbuch hat 15 Eintraege mit
     * zusammen 127 Zeichen, ueberschlaegig 1.300-1.400px. Bei 1280px kann kein
     * Link unter seine `min-content`-Breite schrumpfen — also lief die Zeile
     * ueber, und `documentElement` scrollte waagerecht. Das ist nicht „die
     * Leiste sieht eng aus", das ist die ganze Seite, die seitwaerts wandert.
     *
     * `scrollbar-width: thin` haelt die Leiste bei ihrer Hoehe. Der
     * Unterstrich der Aktivmarkierung (`.navLink[aria-current]`, 2px) darf
     * nicht unter einer Scrollleiste verschwinden — deshalb scrollt der
     * CONTAINER und nicht `documentElement`.
     *
     * DIESE DATEI BESITZT „die Regel steht da". Ob sie WIRKT, besitzt der
     * Playwright-Lauf bei 1280x720 (`e2e/lagerbuch-verwaltung.spec.ts`) — bei
     * 390px sind die richtige und die kaputte Fassung nicht zu unterscheiden,
     * weil `.modulnav` dort auf `display: none` steht.
     */
    const basis = /\.modulnav\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(basis, "Klasse .modulnav fehlt").not.toBeNull();
    expect(basis![1]).toMatch(/overflow-x:\s*auto/);
    expect(basis![1]).toMatch(/scrollbar-width:\s*thin/);
  });

  it("animiert das Scrollen der Modulnavigation nicht", () => {
    // `prefers-reduced-motion` bleibt unberuehrt: es wird nichts animiert und
    // `scroll-behavior` bleibt ungesetzt. Ein `scroll-behavior: smooth` hier
    // waere eine Animation ohne Gegenstueck im reduced-motion-Zweig.
    const basis = /\.modulnav\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(basis![1]).not.toMatch(/scroll-behavior/);
  });
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/core/shell/shell-css.test.ts
```

Erwartet: FAIL mit
`expected '\n  display: none;\n  align-items: center;…' to match /overflow-x:\s*auto/`.

⚠️ **Hier ist die Meldung ausnahmsweise KEIN `Failed to resolve import`.** `shell-css.test.ts`
existiert seit langem und `.modulnav` steht bereits in `shell.module.css` — die Datei ist da, ihr
fehlen nur zwei Deklarationen. Wer stattdessen einen Auflösungsfehler erwartet, hat die falsche
Datei angelegt. **Von den beiden neuen Fällen ist genau EINER rot**, und das ist richtig so:

| Neuer Fall | Zustand vor Schritt 3 | Warum |
|---|---|---|
| „lässt `.modulnav` waagerecht scrollen statt `documentElement`" | **rot** | `overflow-x: auto` und `scrollbar-width: thin` fehlen beide; die erste der beiden Zusicherungen scheitert zuerst |
| „animiert das Scrollen der Modulnavigation nicht" | **grün** | Er hält fest, dass `scroll-behavior` **nicht** gesetzt wird — eine Aussage über etwas, das heute schon nicht da ist. Ein solcher Fall ist nie rot zu bekommen, ohne den Fehler erst zu bauen |

⚠️ **Ein Schritt 3, nach dem beide grün sind, ist deshalb kein Beweis für beide.** Die zweite
Zusicherung wird erst dann etwas wert, wenn jemand später `scroll-behavior: smooth` ergänzt — sie ist
ein Wächter, kein Rot-Kandidat.

- [ ] **Schritt 3: Die zwei Zeilen setzen**

In `src/core/shell/shell.module.css`, im `.modulnav`-Block (hinter `border-color`):

```css
.modulnav {
  display: none;
  align-items: center;
  gap: 4px;
  padding-inline: 16px;
  border-block-end: 1px solid;
  border-color: color-mix(in srgb, currentColor 12%, transparent);

  /*
   * UEBERLAUFBEHANDLUNG — ein Modul mit vielen Abschnitten sprengt die Zeile.
   * `lagerbuch` faehrt sie als erstes ueber die Belastungsgrenze: 15 Eintraege
   * mit zusammen 127 Zeichen liegen ueberschlaegig bei 1.300-1.400px, und bei
   * 1280px kann kein Link unter seine `min-content`-Breite schrumpfen. Ohne
   * diese zwei Zeilen scrollt `documentElement` waagerecht — nicht die Leiste,
   * die ganze Seite.
   *
   * Der Unterstrich der Aktivmarkierung (`.navLink[aria-current]`, 2px) darf
   * nicht unter einer Scrollleiste verschwinden — deshalb scrollt der
   * CONTAINER, und die Links behalten ihre volle Hoehe.
   *
   * `scroll-behavior` bleibt ungesetzt: es wird nichts animiert, und
   * `prefers-reduced-motion` ist damit unberuehrt.
   *
   * Ein `overflow-x`-Container mit fokussierbaren Kindern scrollt beim Tabben
   * VON SELBST zum fokussierten Link — die Zusicherung dazu ist ein
   * Playwright-Schritt, kein Quelltext-Scan.
   */
  overflow-x: auto;
  scrollbar-width: thin;
}
```

```bash
pnpm vitest run src/core/shell/shell-css.test.ts
```

**Grün.**

- [ ] **Schritt 4: Prüfen, dass die vorhandenen Zusicherungen unberührt bleiben**

```bash
pnpm vitest run src/core/shell/ && pnpm typecheck && pnpm build
```

Erwartet: grün. ⚠️ Insbesondere `kennt genau einen Breakpoint, und der ist 768px` — die zwei neuen
Zeilen stehen in der **Basisregel** und führen keine Medienabfrage ein. Wären sie in die
`min-width: 768px`-Abfrage gewandert, wäre der Test weiterhin grün und die Regel dennoch richtig; sie
stehen trotzdem in der Basis, weil `.modulnav` dort ohnehin `display: none` trägt und ein
`overflow-x` auf einem unsichtbaren Element nichts kostet — **eine Regel, zwei Zustände, ein Ort.**

- [ ] **Schritt 5: Die vier laufenden Module gegenprüfen**

`.modulnav` wird von `portal`, `qr`, `feedback` und `files` benutzt. Die Änderung ist additiv, aber
„additiv" ist eine Behauptung, bis jemand hinsieht:

```bash
pnpm exec playwright test e2e/shell-mobil.spec.ts
```

Erwartet: grün — insbesondere `e2e/shell-mobil.spec.ts:288-324` (die `aria-current`-Zusicherungen der
Suite).

- [ ] **Schritt 6: Commit — EIGENER Commit, keine Modul-Datei dabei**

```bash
rtk git add src/core/shell/shell.module.css src/core/shell/shell-css.test.ts
rtk git commit -m "fix(core): .modulnav scrollt waagerecht statt documentElement

Die Modulnavigation ist ein Flex-Container mit nowrap ab 768px und ohne
overflow-x. Ein Modul mit vielen Abschnitten sprengt die Zeile: lagerbuch
bringt 15 Eintraege mit zusammen 127 Zeichen, ueberschlaegig 1.300-1.400px, und
bei 1280px kann kein Link unter seine min-content-Breite schrumpfen. Folge:
documentElement scrollt waagerecht — nicht die Leiste, die ganze Seite.

Der Container scrollt und nicht das Dokument, damit der 2px-Unterstrich der
Aktivmarkierung nicht unter einer Scrollleiste verschwindet. scrollbar-width:
thin haelt die Leistenhoehe. scroll-behavior bleibt ungesetzt —
prefers-reduced-motion ist unberuehrt.

KEINE HEBUNG, SONDERN EINE REPARATUR: .modulnav liegt bereits in core und wird
von jedem Modul benutzt. Die Regel 'ein zweiter, heute belegbarer Nutznieszer'
gilt fuer Hebungen. Ein Modul, das einen core-Defekt findet, darf ihn beheben;
die Alternative — die 15 Eintraege im Modul zu verstecken — belieszte die Falle
fuer das sechste Modul.

shell-css.test.ts besitzt 'die Regel steht da'. Ob sie wirkt, besitzt
Playwright bei 1280x720 (e2e/lagerbuch-verwaltung.spec.ts, T150): bei 390px
sind die richtige und die kaputte Fassung nicht zu unterscheiden.

e2e/shell-mobil.spec.ts gegen die vier laufenden Module gefahren: gruen."
```

---

### Gate nach Welle 1

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

Playwright ist hier **noch nicht** fällig — es existiert keine Route dieses Plans. Der eine
Playwright-Lauf aus T105, Schritt 5 ist ein Regressionslauf gegen die vier Bestandsmodule und gehört
zu diesem Task, nicht zum Gate.

---

## Welle 2 — Die geteilten Bausteine (6 Tasks, alle parallel)

Diese sechs bauen auf Welle 1 auf und berühren einander nicht. **Alle sechs sind Voraussetzung jeder
Seite**; keine `page.tsx` entsteht vor ihnen.

---

### Task 106: `_ui/Chip.tsx` — der Statuschip, achtzig Mal, ohne `Tag`

**Files:**
- Create: `src/app/m/lagerbuch/_ui/Chip.tsx`
- Test: `src/app/m/lagerbuch/_ui/Chip.test.tsx`

**Interfaces:**
- Consumes: `_ui/verwaltung.module.css` (T100) — die Klassen `.chip`, `.ok`, `.gelb`, `.rot`, `.grau`;
  `_lib/format.ts` (Teil 3, T39) — `type AmpelTon`; `_ui/ikonen.tsx` (T101) — `Ikone`, `type IkonName`.
- Produces:
  ```tsx
  // _ui/Chip.tsx — KEIN "use client": laeuft in RSC UND in Client-Inseln.
  export function Chip(props: {
    ton: AmpelTon;
    zeichen?: IkonName;
    children: React.ReactNode;
  }): JSX.Element;
  ```
  Konsumenten: **alle 23 Seiten** und ihre Inseln (dieser Plan), `/g/[code]` (**Teil 4**, §6.15
  Auflage 21).

**Drei Gründe gegen `Tag`** (§6.6.3):

1. **`Tag color="error"` greift auf `colorError` zu** — also auf Suite-Rot, also auf Falle 3. Es gibt
   in antd keinen Weg, `Tag` eine fachsemantische Palette unterzuschieben, außer ihm eine eigene Farbe
   als Prop zu geben — dann ist der Baustein aber nur noch eine Hülle mit Rundung.
2. **Der Fehler wäre nicht sichtbar kaputt, sondern nur falsch.** Ein `Tag color="error"` ist gültiges
   antd; im jsdom-DOM steht in beiden Fällen dieselbe Klasse, und am Bildschirm sieht es nicht defekt
   aus. **Kein Gate fängt das.**
3. **`Tag.CheckableTag` ist ein Compound-Zugriff** (Falle 1) — wer `Tag` als Baustein etabliert, macht
   den Griff dorthin wahrscheinlicher.

⚠️ **Die Namensfalle geht mit** (§5.17, §6.6.3). Der Bestand bildet `"gruen"` auf `"ok"` ab, weil die
CSS-Klassen so heißen; ein direkt interpoliertes `chip-${ampel}` ergäbe ein undefiniertes
`chip-gruen` — **mit Polster und Rundung, aber ohne Farbe.** Die CSS-Modul-Schreibweise `s[ton]` hat
**dieselbe** Falle (`s["gruen"] === undefined` → `className="chip undefined"`), und der Riegel dagegen
ist **der Typ `AmpelTon`**, nicht die Wachsamkeit. Der Test unten prüft ihn trotzdem zur Laufzeit,
weil ein `as AmpelTon` an einer Aufrufstelle den Typ aushebelt.

**Und die Regel, die über der Farbe steht:** jeder Chip trägt **Text**, nie nur Farbe. Das ist im
Bestand schon so (`chargeText`, `geraetFaelligChip` — beide portiert in Teil 3, T39) und wird
mitgenommen statt durch ein farbiges Zeichen ersetzt.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/Chip.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import { Chip } from "./Chip";
import s from "./verwaltung.module.css";

afterEach(async () => { await unmount(); });

describe("Chip", () => {
  it("traegt die Basisklasse und die Tonklasse", async () => {
    await mount(<Chip ton="rot">unter Mindestbestand</Chip>);
    const el = query("span");
    expect(el.className.split(" ")).toContain(s.chip);
    expect(el.className.split(" ")).toContain(s.rot);
  });

  it.each(["rot", "gelb", "ok", "grau"] as const)("kennt den Ton %s", async (ton) => {
    await mount(<Chip ton={ton}>x</Chip>);
    // DIE NAMENSFALLE: `s["gruen"]` waere `undefined` und ergaebe
    // `className="chip undefined"` — Polster und Rundung, aber ohne Farbe.
    // Der Riegel ist der Typ; dieser Test faengt ein `as AmpelTon` an einer
    // Aufrufstelle.
    expect(query("span").className).not.toMatch(/undefined/);
  });

  it("rendert IMMER den Text — Bedeutung nie allein ueber Farbe", async () => {
    await mount(<Chip ton="gelb">läuft 03/27 ab</Chip>);
    expect(query("span").textContent).toContain("läuft 03/27 ab");
  });

  it("nimmt ein Zeichen entgegen und rendert es aria-hidden neben dem Text", async () => {
    await mount(<Chip ton="rot" zeichen="warnung">niedriger Druck</Chip>);
    const svg = query("span svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(query("span").textContent).toContain("niedriger Druck");
  });

  it("rendert ohne Zeichen kein <svg>", async () => {
    await mount(<Chip ton="ok">ok</Chip>);
    expect(queryAll("span svg")).toHaveLength(0);
  });

  it("setzt keine Inline-Farbe — die Farbe kommt aus den CSS-Variablen", async () => {
    // Kaeme sie als Prop, muesste der Server den Hell/Dunkel-Modus kennen. Er
    // kennt ihn nicht: der Moduswechsel ist reines CSS (`data-theme`).
    await mount(<Chip ton="rot">x</Chip>);
    expect(query("span").getAttribute("style")).toBeNull();
  });

  it("die Datei traegt kein \"use client\"", async () => {
    const { readFileSync } = await import("node:fs");
    const quelle = readFileSync("src/app/m/lagerbuch/_ui/Chip.tsx", "utf8");
    // Der Chip steht auf RSC-Seiten (Uebersicht, Check-Detail, Verfall) UND in
    // Client-Inseln. Ein "use client" machte ihn fuer die Seiten unbrauchbar.
    expect(quelle.slice(0, 200)).not.toMatch(/["']use client["']/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/Chip.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./Chip"`.

- [ ] **Schritt 3: `_ui/Chip.tsx` schreiben**

```tsx
import type { ReactNode } from "react";
import type { AmpelTon } from "../_lib/format";
import { Ikone, type IkonName } from "./ikonen";
import s from "./verwaltung.module.css";

/**
 * DER STATUSCHIP — 80 Verwendungen, eigenes Markup, KEIN antd-`Tag`.
 *
 * KEIN "use client": er steht auf RSC-Seiten (Uebersicht, Check-Detail,
 * Verfallsliste) UND in Client-Inseln. Er ruft nichts auf Modulebene auf und
 * gibt nur JSX zurueck — damit laeuft er in beiden Ebenen.
 *
 * DREI GRUENDE GEGEN `Tag` (§6.6.3):
 *  1. `Tag color="error"` greift auf `colorError` zu — also auf Suite-Rot,
 *     also auf Falle 3. Eine fachsemantische Palette laeszt sich `Tag` nur
 *     unterschieben, indem man ihm eine eigene Farbe als Prop gibt; dann ist
 *     der Baustein nur noch eine Huelle mit Rundung.
 *  2. Der Fehler waere nicht sichtbar kaputt, sondern nur FALSCH. Ein
 *     `Tag color="error"` ist gueltiges antd, im jsdom-DOM steht dieselbe
 *     Klasse, und am Bildschirm sieht es nicht defekt aus. Kein Gate faengt
 *     das.
 *  3. `Tag.CheckableTag` ist ein Compound-Zugriff (Falle 1) — wer `Tag` als
 *     Baustein etabliert, macht den Griff dorthin wahrscheinlicher.
 *
 * DIE FARBE KOMMT NICHT ALS PROP, sondern ueber die Klasse aus den
 * CSS-Variablen (§6.6.2a). Nur so traegt der Chip beide Modi, ohne dass der
 * Server den Modus kennen muss — der Moduswechsel ist reines CSS
 * (`:root[data-theme="dark"]`), und eine Server Component weisz gar nicht,
 * welcher gilt.
 *
 * DIE NAMENSFALLE, die aus dem Bestand mitwandert: `s["gruen"]` waere
 * `undefined` und ergaebe `className="chip undefined"` — mit Polster und
 * Rundung, aber OHNE FARBE. Der Riegel dagegen ist der Typ `AmpelTon`, nicht
 * die Wachsamkeit; `ampelTon()` aus `_lib/format.ts` bildet `"gruen"` auf
 * `"ok"` ab und ist die einzige Quelle fuer diesen Wert.
 *
 * UND DIE REGEL UEBER DER FARBE: jeder Chip traegt TEXT, nie nur Farbe. Das
 * Zeichen ist `aria-hidden` und Zugabe — `chargeText` und `geraetFaelligChip`
 * (Teil 3, T39) liefern den Text, und sie wandern mit statt durch ein farbiges
 * Zeichen ersetzt zu werden.
 */
export function Chip({
  ton,
  zeichen,
  children,
}: {
  ton: AmpelTon;
  zeichen?: IkonName;
  children: ReactNode;
}) {
  return (
    <span className={`${s.chip} ${s[ton]}`}>
      {zeichen ? <Ikone name={zeichen} groesse={12} /> : null}
      {children}
    </span>
  );
}
```

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/Chip.test.tsx
```

**Grün.**

- [ ] **Schritt 4: Commit**

```bash
rtk git add src/app/m/lagerbuch/_ui/Chip.tsx src/app/m/lagerbuch/_ui/Chip.test.tsx
rtk git commit -m "feat(lagerbuch): _ui/Chip.tsx — Statuschip aus eigenem Markup

Kein antd-Tag: Tag color=error greift auf colorError zu, also auf Suite-Rot,
also auf Falle 3 — und der Fehler waere nicht sichtbar kaputt, sondern nur
falsch (dieselbe Klasse im DOM, kein Gate faengt es). Tag.CheckableTag ist
zudem ein Compound-Zugriff.

Die Farbe kommt ueber die Klasse aus den CSS-Variablen, nicht als Prop: nur so
traegt der Chip beide Modi, ohne dass der Server den Modus kennen muss.

Kein \"use client\" — er steht auf RSC-Seiten UND in Client-Inseln.

Die Namensfalle wandert mit: s['gruen'] waere undefined und ergaebe
className='chip undefined' — Polster und Rundung ohne Farbe. Der Riegel ist der
Typ AmpelTon aus _lib/format.ts (Teil 3), nicht die Wachsamkeit."
```

---

### Task 107: `_ui/Plakette.tsx` — das Zifferblatt, mit drei Korrekturen

**Files:**
- Create: `src/app/m/lagerbuch/_ui/Plakette.tsx`
- Test: `src/app/m/lagerbuch/_ui/Plakette.test.tsx`

**Interfaces:**
- Consumes: `_lib/domain/verfall.ts` (Teil 3, T28) — `type Ampel = "rot" | "gelb" | "gruen"`;
  `_lib/format.ts` (Teil 3, T39) — `fmtVerfall`, `chargeText`, `ampelTon`;
  `_ui/verwaltung.module.css` (T100) — die `--lb-*`-Variablen (indirekt, über `var()`).
- Produces:
  ```tsx
  // _ui/Plakette.tsx — KEIN "use client".
  export function Plakette(props: {
    verfall: string;              // "YYYY-MM"
    ampel: Ampel;
    statusText: string;           // z. B. "abgelaufen" — kommt vom Server, nie berechnet
  }): JSX.Element;
  ```
  Konsumenten: `_ui/ArtikelDrawer.tsx` (T127), `verwaltung/(arbeit)/artikel/ArtikelTable.tsx` (T129),
  `verwaltung/(arbeit)/verfall/page.tsx` (T130) — und **Teil 4** in `_ui/Entnahme.tsx` (§7).

**Sie wandert eins zu eins — mit drei Korrekturen, die alle heute schon fällig sind** (§6.4.8):

1. **Das `aria-label` nennt den Status.** Heute lautet es `Verfall ${fmtVerfall(verfall)}` — es nennt
   das **Datum**, nie den Zustand; die Farbe kommt allein aus dem Ampelwert. Dass die Bildschirme
   „Bedeutung nie allein über Farbe" trotzdem erfüllen, liegt am **Umfeld**: an allen vier Stellen
   steht heute ein Textchip daneben. Der Verstoß liegt im **Zusicherungsvertrag der Komponente** — als
   `role="img"` mit unvollständigem Label ist sie alleinstehend unbrauchbar.
2. **Die drei festen Farbwerte fallen.** `fill="#fff"`, `var(--tinte)` für die Ziffern und `#C7CDD1`
   für die inaktiven Striche — im Dunkelmodus bliebe sie sonst eine **weiße Scheibe**.
3. **Die Ampelfarben kommen aus `_lib/ampel.ts`** und sind damit luminanz-monoton. Das ist der Punkt,
   an dem Entscheidung 30 Option (d) („nur die hellen Chip-Hintergründe neu ordnen") **scheitert**:
   die Plakette führt gar keinen Text und trägt die Bedeutung ausschließlich in Ring und Strich.

⚠️ **`statusText` ist ein Prop und wird NICHT in der Komponente gerechnet.** Was an einer Uhr hängt,
entsteht auf dem Server (§6.2.1, Regel 1) — rechnete der Browser es, entschieden Server und Client an
der Tagesgrenze verschieden, und gegen die Zone des Endgeräts sogar systematisch. Der Aufrufer
übergibt `chargeText(status, verfall)` aus Teil 3.

⚠️ **Die Farbe kommt als `var(--lb-ampel-*)`, nicht aus `AMPEL_HELL`.** Ein `fill={AMPEL_HELL.rot.text}`
wäre im Dunkelmodus falsch, und die Komponente kann den Modus nicht kennen. `_lib/ampel.ts#ampelVar`
liefert den Variablennamen — das ist der einzige Ort, an dem die Komponente die Palette überhaupt
berührt.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/Plakette.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import { Plakette } from "./Plakette";

afterEach(async () => { await unmount(); });

describe("Plakette", () => {
  it("nennt im aria-label Datum UND Status", async () => {
    // Der Bestand nennt nur das Datum; die Farbe traegt den Zustand allein.
    // Als role="img" mit unvollstaendigem Label ist die Komponente
    // alleinstehend unbrauchbar — der Verstosz liegt im Zusicherungsvertrag,
    // nicht am Bildschirm (dort steht heute ueberall ein Chip daneben).
    await mount(<Plakette verfall="2027-03" ampel="rot" statusText="abgelaufen" />);
    expect(query("svg").getAttribute("aria-label")).toBe("Verfall 03/27 — abgelaufen");
  });

  it("traegt role=img", async () => {
    await mount(<Plakette verfall="2027-03" ampel="gelb" statusText="läuft 03/27 ab" />);
    expect(query("svg").getAttribute("role")).toBe("img");
  });

  it("zeichnet zwoelf Monatsstriche und hebt genau einen hervor", async () => {
    await mount(<Plakette verfall="2027-03" ampel="gruen" statusText="bis 03/27" />);
    const striche = queryAll("svg line");
    expect(striche).toHaveLength(12);
    const dick = striche.filter((l) => Number(l.getAttribute("stroke-width")) > 2);
    expect(dick).toHaveLength(1);
    // Maerz ist Index 2 — der dritte Strich.
    expect(striche.indexOf(dick[0])).toBe(2);
  });

  it("setzt KEINEN festen Farbwert — alle Farben kommen aus --lb-*", async () => {
    await mount(<Plakette verfall="2027-03" ampel="rot" statusText="abgelaufen" />);
    const svg = query("svg").outerHTML;
    // Im Dunkelmodus bliebe die Plakette sonst eine weisze Scheibe.
    expect(svg).not.toMatch(/#fff\b|#ffffff/i);
    expect(svg).not.toMatch(/#C7CDD1/i);
    expect(svg).not.toMatch(/var\(--tinte\)|var\(--rot\)|var\(--gelb\)|var\(--ok\)/);
    expect(svg).toMatch(/var\(--lb-karte\)/);
    expect(svg).toMatch(/var\(--lb-ampel-rot-text\)/);
    expect(svg).toMatch(/var\(--lb-linie\)/);
  });

  it("benutzt keine --ant-*-Variable (die sieht eigenes Markup nicht)", async () => {
    // antd deklariert seine Variablen auf SEINER Scope-Klasse; ein SVG
    // auszerhalb eines antd-Baums sieht sie nicht, und der Fehler ist still.
    await mount(<Plakette verfall="2027-03" ampel="gruen" statusText="bis 03/27" />);
    expect(query("svg").outerHTML).not.toMatch(/var\(--ant-/);
  });
});

describe("Plakette: Ampel -> Variablenname", () => {
  it.each([
    ["rot", "--lb-ampel-rot-text"],
    ["gelb", "--lb-ampel-gelb-text"],
    ["gruen", "--lb-ampel-ok-text"],
  ] as const)("%s zeichnet mit %s", async (ampel, variable) => {
    // `gruen` -> `ok` ist die Namensfalle aus §5.17: ein direkt
    // interpoliertes `--lb-ampel-${ampel}-text` ergaebe
    // `--lb-ampel-gruen-text` — nicht deklariert, faellt auf `transparent`
    // zurueck und ist gueltiges CSS. Der Ring verschwaende einfach.
    await mount(<Plakette verfall="2027-03" ampel={ampel} statusText="x" />);
    expect(query("svg").outerHTML).toMatch(new RegExp(variable.replace(/-/g, "\\-")));
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/Plakette.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./Plakette"`.

- [ ] **Schritt 3: `_ui/Plakette.tsx` schreiben**

```tsx
import type { Ampel } from "../_lib/domain/verfall";
import { ampelTon, fmtVerfall } from "../_lib/format";
import { ampelVar } from "../_lib/ampel";

/**
 * DIE VERFALLS-PLAKETTE — ein 40x40-Zifferblatt mit zwoelf Monatsstrichen, bei
 * dem der Verfallsmonat als laengerer, dickerer Strich hervortritt. Ein
 * antd-Gegenstueck gibt es nicht.
 *
 * KEIN "use client": sie steht auf der Verfallsliste (RSC) und in der
 * Artikeltabelle (Insel).
 *
 * DREI KORREKTUREN gegenueber `lagerbuch/src/components/Plakette.tsx`, alle
 * heute schon faellig (§6.4.8):
 *
 * 1. DAS aria-label NENNT DEN STATUS. Heute lautet es
 *    `Verfall ${fmtVerfall(verfall)}` — es nennt das DATUM, nie den Zustand;
 *    die Farbe traegt ihn allein. Dass die Bildschirme „Bedeutung nie allein
 *    ueber Farbe" trotzdem erfuellen, liegt am UMFELD: an allen vier Stellen
 *    steht ein Textchip daneben. Der Verstosz liegt im Zusicherungsvertrag der
 *    Komponente — als role="img" mit unvollstaendigem Label ist sie
 *    alleinstehend unbrauchbar.
 *
 * 2. DIE DREI FESTEN FARBWERTE FALLEN. `fill="#fff"`, `var(--tinte)` fuer die
 *    Ziffern und `#C7CDD1` fuer die inaktiven Striche — im Dunkelmodus bliebe
 *    sie sonst eine WEISZE SCHEIBE. Sie beziehen ihre Werte jetzt aus den
 *    `--lb-*`-Modulvariablen, die beide Modi fuehren.
 *
 * 3. DIE AMPELFARBEN KOMMEN AUS `_lib/ampel.ts` und sind damit
 *    luminanz-monoton. Das ist der Punkt, an dem Entscheidung 30, Option (d)
 *    („nur die hellen Chip-Hintergruende neu ordnen") scheitert: die Plakette
 *    fuehrt GAR KEINEN Text und traegt die Bedeutung ausschlieszlich in Ring
 *    und Strich.
 *
 * DIE FARBE KOMMT ALS `var(--lb-ampel-*)`, NICHT AUS `AMPEL_HELL`. Ein
 * `stroke={AMPEL_HELL.rot.text}` waere im Dunkelmodus falsch, und die
 * Komponente kann den Modus nicht kennen — er ist reines CSS.
 *
 * `statusText` IST EIN PROP UND WIRD HIER NICHT GERECHNET. Was an einer Uhr
 * haengt, entsteht auf dem Server (§6.2.1, Regel 1): rechnete der Browser es,
 * entschieden Server und Client an der Tagesgrenze verschieden — und gegen die
 * Zone des Endgeraets sogar systematisch. Der Aufrufer uebergibt
 * `chargeText(status, verfall)` aus `_lib/format.ts`.
 */
export function Plakette({
  verfall,
  ampel,
  statusText,
}: {
  verfall: string;
  ampel: Ampel;
  statusText: string;
}) {
  // `gruen` -> `ok`: ein direkt interpoliertes `--lb-ampel-${ampel}-text`
  // ergaebe `--lb-ampel-gruen-text`. Das ist nirgends deklariert, faellt auf
  // `transparent` zurueck und ist GUELTIGES CSS — der Ring verschwaende
  // einfach. `ampelTon` ist die eine Stelle, die diese Abbildung kennt.
  const farbe = `var(${ampelVar(ampelTon(ampel), "text")})`;
  const monat = Number(verfall.split("-")[1]);

  const striche = [];
  for (let i = 0; i < 12; i++) {
    const winkel = ((i * 30 - 90) * Math.PI) / 180;
    const aktiv = i === monat - 1;
    const r1 = aktiv ? 13.5 : 15.2;
    const r2 = 18.6;
    striche.push(
      <line
        key={i}
        x1={20 + r1 * Math.cos(winkel)}
        y1={20 + r1 * Math.sin(winkel)}
        x2={20 + r2 * Math.cos(winkel)}
        y2={20 + r2 * Math.sin(winkel)}
        stroke={aktiv ? farbe : "var(--lb-linie)"}
        strokeWidth={aktiv ? 3.4 : 1.7}
        strokeLinecap="round"
      />,
    );
  }

  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      role="img"
      aria-label={`Verfall ${fmtVerfall(verfall)} — ${statusText}`}
      style={{ flex: "none" }}
    >
      <circle cx="20" cy="20" r="19" fill="var(--lb-karte)" stroke={farbe} strokeWidth="1.6" />
      {striche}
      <text
        x="20"
        y="23.4"
        textAnchor="middle"
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "8.6px",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          fill: "var(--lb-tinte)",
        }}
      >
        {fmtVerfall(verfall)}
      </text>
    </svg>
  );
}
```

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/Plakette.test.tsx
```

**Grün.**

- [ ] **Schritt 4: Commit**

```bash
rtk git add src/app/m/lagerbuch/_ui/Plakette.tsx src/app/m/lagerbuch/_ui/Plakette.test.tsx
rtk git commit -m "feat(lagerbuch): _ui/Plakette.tsx — Zifferblatt mit drei Korrekturen

1:1 aus components/Plakette.tsx, mit den drei Korrekturen aus §6.4.8:

 * aria-label nennt jetzt Datum UND Status. Der Bestand nennt nur das Datum;
   als role=img mit unvollstaendigem Label ist die Komponente alleinstehend
   unbrauchbar — dass die Bildschirme die Regel trotzdem erfuellen, liegt am
   Umfeld (ueberall steht ein Chip daneben), nicht an ihr.
 * Die drei festen Farbwerte fallen (#fff, --tinte, #C7CDD1): im Dunkelmodus
   bliebe sie sonst eine weisze Scheibe. Jetzt --lb-karte / --lb-tinte /
   --lb-linie.
 * Die Ampelfarbe kommt als var(--lb-ampel-*) ueber ampelVar(ampelTon(a)) —
   luminanz-monoton und in beiden Modi richtig. Ein direktes
   --lb-ampel-\${ampel}-text ergaebe --lb-ampel-gruen-text: nicht deklariert,
   faellt auf transparent zurueck, gueltiges CSS, Ring weg.

statusText ist ein Prop und wird nicht gerechnet: was an einer Uhr haengt,
entsteht auf dem Server."
```

---

### Task 108: `_ui/SeitenKopf.tsx`, `_ui/Brotkrume.tsx`, `_ui/Kachel.tsx` — die drei Seitenrahmen-Teile

**Files:**
- Create: `src/app/m/lagerbuch/_ui/SeitenKopf.tsx`
- Create: `src/app/m/lagerbuch/_ui/Brotkrume.tsx`
- Create: `src/app/m/lagerbuch/_ui/Kachel.tsx`
- Test: `src/app/m/lagerbuch/_ui/seitenbausteine.test.tsx`

**Interfaces:**
- Consumes: `_lib/schrift.ts` (T103) — `SCHRIFT`; `_ui/verwaltung.module.css` (T100) — `.backlink`,
  `.kpi`, `.kpiRot`, `.kpiGelb`, `.kpiOk`, `.kpiLink`; `_ui/ikonen.tsx` (T101) — `Ikone`;
  `_lib/format.ts` (Teil 3) — `type AmpelTon`; `antd` — `Card`.
- Produces:
  ```tsx
  // Alle drei: KEIN "use client" — sie stehen in Server Components.
  export function SeitenKopf(props: {
    titel: string; beschreibung?: React.ReactNode; aktionen?: React.ReactNode;
  }): JSX.Element;

  export function Brotkrume(props: { href: string; children: React.ReactNode }): JSX.Element;

  export function Kachel(props: {
    zahl: React.ReactNode; beschriftung: React.ReactNode;
    ton?: AmpelTon;               // faerbt die 4px-Kante; ohne Ton keine Kante
    href?: string;                // macht die Kachel zum Link (Chevron + Hover)
  }): JSX.Element;
  ```
  Konsumenten: **alle 23 Seiten** (`SeitenKopf`), die **neun Detailseiten** (`Brotkrume`), zehn Seiten
  mit Kennzahlen (`Kachel`).

**Warum `<h1>` und nicht `Typography.Title`.** `Typography.Title` ist ein Compound-Zugriff und ergibt
in einer Server Component HTTP 500 (Falle 1). Nacktes `<h1>` mit einer Typografie-Rolle aus `_lib/` ist
**keine Notlösung**, sondern erspart **23 Client-Grenzen für eine Zeile Text** (§6.2.1, Regel 2).

**Warum die Brotkrume eigenes Markup ist.** Die Liste der in Server Components sicheren
antd-Komponenten ist kurz und abgeschlossen (`Card`, `Statistic`, `Result`, `Progress`, `Table`,
`Tag`); `Breadcrumb` steht **nicht** darauf, und `Breadcrumb.Item` steht ausdrücklich auf der
Verbotsliste. Die `items`-Schreibweise umgeht zwar den Compound-Zugriff, **aber ob die Komponente
selbst in der RSC-Ebene lädt, ist nicht gemessen** — und eine ungemessene Annahme kostet hier HTTP 500
auf **neun** Seiten. Ein `<nav aria-label="Brotkrume">` mit `next/link` und dem Pfeil aus
`_ui/ikonen.tsx` kostet vier Zeilen und keine Messung.

**Warum `Card` und nicht `Statistic` für die Kachel** (§6.6.4). `Statistic` ist zwar RSC-sicher, aber
die farbige **Zahl** ist genau „Rot auf einer Datenfläche": eine rote 7 ist von einer 7 in Suite-Rot
nicht zu unterscheiden, und **ein Zahlenwert ist die Datenfläche schlechthin**. Die Kante trägt die
Farbe, die Zahl trägt Tinte. Genau die Form „Text plus 3px linke Kante" ist das, was
`docs/design/README.md:57` als Ersatz für ein rotes `Alert` **vorschlägt**.

⚠️ **Sechs der 39 Kacheln sind Links.** Eine klickbare Kachel ohne erkennbare Klickbarkeit ist eine
Sackgasse für alle, die es nicht zufällig ausprobieren. Verbindlich: die verlinkten tragen ein Chevron
und einen Fokusring, die **nicht** verlinkten tragen **keinen** Hover-Effekt.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/seitenbausteine.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import { SeitenKopf } from "./SeitenKopf";
import { Brotkrume } from "./Brotkrume";
import { Kachel } from "./Kachel";
import s from "./verwaltung.module.css";

afterEach(async () => { await unmount(); });

describe("SeitenKopf", () => {
  it("rendert ein nacktes <h1>, kein Typography.Title", async () => {
    await mount(<SeitenKopf titel="Artikel & Bestand" />);
    const h1 = query("h1");
    expect(h1.textContent).toBe("Artikel & Bestand");
    // Typography.Title waere ein Compound-Zugriff und ergaebe in einer Server
    // Component HTTP 500 — auf 23 Seiten.
    expect(h1.className).not.toMatch(/ant-typography/);
  });

  it("setzt die Titel-Rolle als Inline-Stil, nicht als Klasse", async () => {
    await mount(<SeitenKopf titel="Journal" />);
    expect(query("h1").getAttribute("style")).toMatch(/font-size:\s*24px/);
  });

  it("rendert Beschreibung und Aktionen, wenn sie da sind", async () => {
    await mount(
      <SeitenKopf
        titel="Vorlagen"
        beschreibung={<span>Bestückung einmal definieren.</span>}
        aktionen={<button type="button">Neue Vorlage</button>}
      />,
    );
    expect(document.body.textContent).toContain("Bestückung einmal definieren.");
    expect(query("button").textContent).toBe("Neue Vorlage");
  });

  it("rendert ohne Beschreibung und ohne Aktionen genau ein Kind", async () => {
    await mount(<SeitenKopf titel="Inventur" />);
    expect(queryAll("h1")).toHaveLength(1);
    expect(exists("p")).toBe(false);
  });
});

describe("Brotkrume", () => {
  it("ist ein <nav aria-label=\"Brotkrume\"> mit einem Link", async () => {
    await mount(<Brotkrume href="/verwaltung/geraete">Geräte</Brotkrume>);
    expect(query("nav").getAttribute("aria-label")).toBe("Brotkrume");
    const a = query("nav a");
    expect(a.getAttribute("href")).toBe("/verwaltung/geraete");
    expect(a.textContent).toContain("Geräte");
  });

  it("traegt die Modulklasse .backlink und einen Pfeil", async () => {
    await mount(<Brotkrume href="/verwaltung/bz">BZ-Kontrolle</Brotkrume>);
    expect(query("nav a").className.split(" ")).toContain(s.backlink);
    expect(exists("nav a svg")).toBe(true);
  });

  it("benutzt KEIN antd-Breadcrumb", async () => {
    // Breadcrumb steht nicht auf der RSC-sicheren Liste, und ob die Komponente
    // in der RSC-Ebene laedt, ist NICHT gemessen. Eine ungemessene Annahme
    // kostet hier HTTP 500 auf neun Seiten.
    const quelle = readFileSync("src/app/m/lagerbuch/_ui/Brotkrume.tsx", "utf8");
    expect(quelle).not.toMatch(/Breadcrumb/);
    expect(quelle).not.toMatch(/from ["']antd["']/);
  });

  it("traegt die aeuszere Pfadform", async () => {
    await mount(<Brotkrume href="/verwaltung/vorlagen">Vorlagen</Brotkrume>);
    expect(query("nav a").getAttribute("href")).not.toMatch(/^\/m\/lagerbuch/);
  });
});

describe("Kachel", () => {
  it("rendert Zahl und Beschriftung", async () => {
    await mount(<Kachel zahl={7} beschriftung="Artikel unter Mindestbestand" />);
    expect(document.body.textContent).toContain("7");
    expect(document.body.textContent).toContain("Artikel unter Mindestbestand");
  });

  it("die Zahl traegt tabular-nums und KEINE Farbe", async () => {
    await mount(<Kachel zahl={12} beschriftung="offene Bestellpositionen" ton="rot" />);
    const zahl = query("[data-rolle='kachelzahl']");
    expect(zahl.getAttribute("style")).toMatch(/font-variant-numeric:\s*tabular-nums/);
    // Eine rote 7 IST Rot auf einer Datenflaeche — die Kante traegt die Farbe,
    // die Zahl traegt Tinte (§6.6.4).
    expect(zahl.getAttribute("style")).not.toMatch(/color:/);
  });

  it.each([
    ["rot", "kpiRot"],
    ["gelb", "kpiGelb"],
    ["ok", "kpiOk"],
  ] as const)("faerbt bei Ton %s die Kante ueber .%s", async (ton, klasse) => {
    await mount(<Kachel zahl={1} beschriftung="x" ton={ton} />);
    expect(query(`.${s.kpi}`).className.split(" ")).toContain(s[klasse]);
  });

  it("bekommt ohne Ton keine Kantenklasse", async () => {
    await mount(<Kachel zahl={1} beschriftung="x" />);
    const klassen = query(`.${s.kpi}`).className.split(" ");
    expect(klassen).not.toContain(s.kpiRot);
    expect(klassen).not.toContain(s.kpiGelb);
    expect(klassen).not.toContain(s.kpiOk);
  });

  it("`grau` faerbt die Kante NICHT — er ist kein Ampelwert", async () => {
    await mount(<Kachel zahl={1} beschriftung="x" ton="grau" />);
    const klassen = query(`.${s.kpi}`).className.split(" ");
    expect(klassen).not.toContain(s.kpiRot);
    expect(klassen).not.toContain(s.kpiGelb);
    expect(klassen).not.toContain(s.kpiOk);
  });

  it("mit href wird sie ein Link mit Chevron", async () => {
    // Eine klickbare Kachel ohne erkennbare Klickbarkeit ist eine Sackgasse
    // fuer alle, die es nicht zufaellig ausprobieren.
    await mount(<Kachel zahl={3} beschriftung="abgelaufen" ton="rot" href="/verwaltung/verfall" />);
    const a = query("a");
    expect(a.getAttribute("href")).toBe("/verwaltung/verfall");
    expect(a.className.split(" ")).toContain(s.kpiLink);
    expect(exists("a svg")).toBe(true);
  });

  it("ohne href gibt es keinen Link und kein Chevron", async () => {
    await mount(<Kachel zahl={3} beschriftung="Buchungen im Journal" />);
    expect(exists("a")).toBe(false);
    expect(exists("svg")).toBe(false);
  });
});

describe("Alle drei sind RSC-tauglich", () => {
  it.each(["SeitenKopf", "Brotkrume", "Kachel"])("%s.tsx traegt kein \"use client\"", (name) => {
    const quelle = readFileSync(`src/app/m/lagerbuch/_ui/${name}.tsx`, "utf8");
    expect(quelle.slice(0, 200)).not.toMatch(/["']use client["']/);
  });

  it.each(["SeitenKopf", "Brotkrume", "Kachel"])("%s.tsx importiert keine Icons aus antd", (name) => {
    const quelle = readFileSync(`src/app/m/lagerbuch/_ui/${name}.tsx`, "utf8");
    expect(quelle).not.toMatch(/@ant-design\/icons/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/seitenbausteine.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./SeitenKopf"`.

- [ ] **Schritt 3: `_ui/SeitenKopf.tsx` schreiben**

```tsx
import type { ReactNode } from "react";
import { SCHRIFT } from "../_lib/schrift";

/**
 * DER KOPF JEDER VERWALTUNGSSEITE — ersetzt `.mainhead` (`globals.css:197`).
 *
 * KEIN "use client", und das ist der Punkt: die Ueberschrift ist NACKTES
 * `<h1>` mit einer Typografie-Rolle aus `_lib/schrift.ts`, nicht
 * `Typography.Title`. Ein Compound-Zugriff auf antd ergibt in einer Server
 * Component HTTP 500 (Falle 1) — und die Alternative „macht die Ueberschrift
 * halt zu einer Client-Insel" kostete 23 Client-Grenzen fuer eine Zeile Text.
 *
 * `aktionen` steht rechts oben (Anlegen-Knopf, Aktiv-Schalter, Export),
 * `beschreibung` darunter. Beide sind optional; die meisten Detailseiten
 * tragen nur `titel` und `aktionen`.
 *
 * Die Rolle kommt als INLINE-STIL und nicht als CSS-Klasse: `_lib/schrift.ts`
 * ist die eine Quelle, und eine zweite Abschrift in `verwaltung.module.css`
 * waere genau die Doppelung, gegen die die Rollen-Datei gebaut ist.
 */
export function SeitenKopf({
  titel,
  beschreibung,
  aktionen,
}: {
  titel: string;
  beschreibung?: ReactNode;
  aktionen?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBlockEnd: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1 style={{ ...SCHRIFT.titel, margin: 0 }}>{titel}</h1>
        {beschreibung ? (
          <p style={{ ...SCHRIFT.neben, margin: "6px 0 0", maxWidth: "72ch" }}>{beschreibung}</p>
        ) : null}
      </div>
      {aktionen ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{aktionen}</div> : null}
    </div>
  );
}
```

- [ ] **Schritt 4: `_ui/Brotkrume.tsx` schreiben**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { Ikone } from "./ikonen";
import s from "./verwaltung.module.css";

/**
 * DER RUECKWEG DER NEUN DETAILSEITEN — und er ist keine Zierde.
 *
 * `aktiverEintrag` markiert neun der 24 Seiten NICHT: `/verwaltung/bz/17`
 * endet weder auf `/verwaltung/bz` noch auf `/verwaltung`. Der Verlust wird
 * angenommen statt repariert (die zwei Alternativen — ein `/`-Eintrag oder
 * eine dritte Regel in `aktiverEintrag` — sind beide schlechter, §6.3.3), und
 * DAFUER bekommt jede dieser neun Seiten diese Brotkrume. Sie ist ohnehin
 * Pflicht (docs/design/README.md:244) und der Bestand hat sie schon
 * (`.backlink` mit `ArrowLeft`) — sie wandert eins zu eins mit und wird zur
 * benannten Zusicherung statt zur Zierde.
 *
 * EIGENES MARKUP, KEIN antd-`Breadcrumb`. Die Liste der in Server Components
 * sicheren antd-Komponenten ist kurz und abgeschlossen (`Card`, `Statistic`,
 * `Result`, `Progress`, `Table`, `Tag`); `Breadcrumb` steht NICHT darauf, und
 * `Breadcrumb.Item` steht ausdruecklich auf der Verbotsliste. Die
 * `items`-Schreibweise umgeht zwar den Compound-Zugriff, aber ob die
 * Komponente selbst in der RSC-Ebene laedt, ist NICHT GEMESSEN — und eine
 * ungemessene Annahme kostet hier HTTP 500 auf neun Seiten.
 *
 * `href` traegt die AEUSZERE Pfadform (Falle 63, §2.1 g): unter dem
 * Host-Rewrite fuehrt `/verwaltung/bz` an die richtige Stelle,
 * `/m/lagerbuch/verwaltung/bz` in einen doppelt praefixierten Pfad.
 *
 * `min-height: 44px` (in `.backlink`) statt der 56px der Suite: die Brotkrume
 * ist ein Textlink am Seitenanfang, kein Bedienelement im Handschuh-Betrieb —
 * und 56px druecken den Seitentitel spuerbar nach unten.
 */
export function Brotkrume({ href, children }: { href: string; children: ReactNode }) {
  return (
    <nav aria-label="Brotkrume" style={{ marginBlockEnd: 8 }}>
      <Link className={s.backlink} href={href}>
        <Ikone name="pfeil-links" groesse={15} />
        {children}
      </Link>
    </nav>
  );
}
```

- [ ] **Schritt 5: `_ui/Kachel.tsx` schreiben**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "antd";
import type { AmpelTon } from "../_lib/format";
import { SCHRIFT } from "../_lib/schrift";
import { Ikone } from "./ikonen";
import s from "./verwaltung.module.css";

/**
 * DIE KENNZAHLKACHEL — `Card` plus eigene Kante, KEIN `Statistic`.
 *
 * `Card` ist in RSC sicher (docs/design/README.md:43). `Statistic` waere es
 * auch, aber die farbige ZAHL ist genau „Rot auf einer Datenflaeche": eine
 * rote 7 ist von einer 7 in Suite-Rot nicht zu unterscheiden, und ein
 * Zahlenwert ist die Datenflaeche schlechthin. DIE KANTE TRAEGT DIE FARBE,
 * DIE ZAHL TRAEGT TINTE — und genau die Form „Text plus 3px linke Kante" ist
 * das, was docs/design/README.md:57 als Ersatz fuer ein rotes `Alert`
 * VORSCHLAEGT.
 *
 * `grau` faerbt die Kante NICHT. Er ist kein Ampelwert (§6.6.2) — eine graue
 * Kante neben einer roten und einer gruenen laese sich als vierte Stufe lesen,
 * und die gibt es nicht.
 *
 * DIE ZAHL TRAEGT `tabular-nums` (§6.7.3). Kacheln stehen nebeneinander und
 * werden verglichen; ohne sie wandern die Ziffern gegeneinander.
 *
 * SECHS DER 39 KACHELN SIND LINKS (`page.tsx:41,46`). Eine klickbare Kachel
 * ohne erkennbare Klickbarkeit ist eine Sackgasse fuer alle, die es nicht
 * zufaellig ausprobieren — deshalb tragen die verlinkten ein Chevron und
 * (ueber `.kpiLink`) einen Hover, und die nicht verlinkten tragen KEINEN
 * Hover-Effekt.
 *
 * DIE ANORDNUNG MACHT DER AUFRUFER mit `Row`/`Col` und `xs`/`md`, nicht diese
 * Komponente. Das heutige `grid-template-columns: repeat(auto-fill,
 * minmax(190px, 1fr))` samt zweiter Fassung bei <=760px entfaellt mit dem
 * 760px-Block (§6.8.6).
 */
const KANTE: Partial<Record<AmpelTon, string>> = {
  rot: s.kpiRot,
  gelb: s.kpiGelb,
  ok: s.kpiOk,
};

export function Kachel({
  zahl,
  beschriftung,
  ton,
  href,
}: {
  zahl: ReactNode;
  beschriftung: ReactNode;
  ton?: AmpelTon;
  href?: string;
}) {
  const inhalt = (
    <div className={[s.kpi, ton ? KANTE[ton] : undefined].filter(Boolean).join(" ")}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span data-rolle="kachelzahl" style={{ ...SCHRIFT.zahl }}>
          {zahl}
        </span>
        {href ? <Ikone name="chevron-rechts" /> : null}
      </div>
      <div style={{ ...SCHRIFT.neben, marginBlockStart: 4 }}>{beschriftung}</div>
    </div>
  );

  return (
    <Card styles={{ body: { padding: 12 } }} style={{ height: "100%" }}>
      {href ? (
        <Link className={s.kpiLink} href={href}>
          {inhalt}
        </Link>
      ) : (
        inhalt
      )}
    </Card>
  );
}
```

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/seitenbausteine.test.tsx
```

**Grün.**

- [ ] **Schritt 6: Commit**

```bash
rtk git add src/app/m/lagerbuch/_ui/SeitenKopf.tsx src/app/m/lagerbuch/_ui/Brotkrume.tsx \
            src/app/m/lagerbuch/_ui/Kachel.tsx src/app/m/lagerbuch/_ui/seitenbausteine.test.tsx
rtk git commit -m "feat(lagerbuch): SeitenKopf, Brotkrume und Kachel — drei RSC-Bausteine

SeitenKopf rendert nacktes <h1> mit der Titel-Rolle aus _lib/schrift.ts.
Typography.Title waere ein Compound-Zugriff und ergaebe in einer Server
Component HTTP 500 — und die Alternative kostete 23 Client-Grenzen fuer eine
Zeile Text.

Brotkrume ist eigenes Markup: Breadcrumb steht nicht auf der RSC-sicheren
Liste, Breadcrumb.Item steht auf der Verbotsliste, und ob die Komponente
selbst in der RSC-Ebene laedt, ist NICHT gemessen. Neun Detailseiten haengen
daran — sie faengt den angenommenen Verlust der Aktivmarkierung auf.

Kachel ist Card plus eigene 4px-Kante, kein Statistic mit farbigem
valueStyle: eine rote Zahl IST Rot auf einer Datenflaeche. Die Kante traegt
die Farbe, die Zahl traegt Tinte und tabular-nums. `grau` faerbt nicht — er
ist kein Ampelwert. Verlinkte Kacheln tragen Chevron und Hover, nicht
verlinkte tragen keinen."
```

---

### Task 109: `_ui/useUrlFilter.ts`, `_ui/Suchfeld.tsx`, `_ui/Trefferanzeige.tsx`

**Files:**
- Create: `src/app/m/lagerbuch/_ui/useUrlFilter.ts`
- Create: `src/app/m/lagerbuch/_ui/Suchfeld.tsx`
- Create: `src/app/m/lagerbuch/_ui/Trefferanzeige.tsx`
- Test: `src/app/m/lagerbuch/_ui/filter.test.tsx`

**Interfaces:**
- Consumes: `next/navigation` — `useRouter`, `usePathname` (**die einzige Fundstelle des Moduls**,
  Festlegung H4); `antd` — `Input`; `_ui/ikonen.tsx` (T101) — `Ikone`;
  `_ui/verwaltung.module.css` (T100) — `.filtertreffer`.
- Produces:
  ```ts
  // _ui/useUrlFilter.ts — "use client".
  export function useUrlFilter(): (params: Record<string, string>) => void;
  ```
  ```tsx
  // _ui/Suchfeld.tsx — "use client".
  export function Suchfeld(props: {
    wert: string; onWert: (w: string) => void; platzhalter: string; breite?: number;
  }): JSX.Element;

  // _ui/Trefferanzeige.tsx — KEIN "use client" (steht auch in RSC-Listen).
  export function Trefferanzeige(props: { gezeigt: number; gesamt: number }): JSX.Element | null;
  ```
  Konsumenten: `useUrlFilter` → `JournalFilter` (T147), `ChecksFilter` (T135). `Suchfeld` und
  `Trefferanzeige` → **alle sechs** Regime-A-Listen (T129, T131, T137, T141, T143, T148) **plus** die
  zwei Regime-B-Filterleisten.

**Warum `useUrlFilter` die einzige `usePathname`-Fundstelle des Moduls sein darf** (§6.3.4). Der
Riegel aus §7.8.2 (Teil 4) verbietet `usePathname` unter `src/app/m/lagerbuch/` und nennt **diese eine
Datei namentlich als Ausnahme** — sie braucht es, weil sie ein **relatives** Ziel schreibt, genau das
Muster, das die Suite selbst fährt (`m/feedback/_ui/Segment.tsx:29,34`). **Jede weitere Fundstelle ist
ein Fehler.** Der heutige Konsument `SideNav.tsx:27,33` entfällt vollständig: `SuiteNav` in `core`
macht die Aktivmarkierung mit `aktiverEintrag` statt `startsWith`.

⚠️ **`Input.Search` ist falsch — aus zwei Gründen, und der zweite ist der tragende** (§6.9.2 Punkt 1).
Es ist erstens ein Compound-Zugriff (in einer Insel zulässig), und zweitens bringt es einen
**Absendeknopf** mit — und das Feld soll gerade **nicht** abgesendet werden, sondern filtern bzw.
debounced navigieren.

⚠️ **Die Rolle `searchbox` entsteht ALLEIN aus `type="search"`** (§6.9.2 Punkt 2).
`suche-filter.spec.ts:15,28` greift `role=searchbox`; heute entsteht sie aus
`Filterleiste.tsx:106`. Wer das Bauteil ersetzt und nur `placeholder` und `aria-label` mitnimmt,
bekommt `textbox` — **beide Tests brechen, und zwar still im Sinne von „Selektor findet nichts".**
Deshalb wird die Rolle hier **einmal gegen das gerenderte antd-Bauteil** geprüft, nicht gegen die
Absicht.

⚠️ **Die Trefferanzeige ist NICHT der Pager** (§6.9.5). „X von Y" heißt „dein Filter blendet Y−X
Zeilen aus", ein Pager heißt „diese Seite von mehreren" — **nicht dieselbe Aussage.** Sie erscheint
**nur** bei `gezeigt !== gesamt`; alle sechs Listen geben sie mit.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/filter.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { mount, unmount, query, fill, exists } from "@/app/m/qr/_lib/test-dom";
import { Trefferanzeige } from "./Trefferanzeige";
import { Suchfeld } from "./Suchfeld";
import s from "./verwaltung.module.css";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/verwaltung/journal",
}));

beforeEach(() => { replace.mockClear(); });
afterEach(async () => { await unmount(); });

describe("Trefferanzeige", () => {
  it("erscheint, wenn gefiltert wurde", async () => {
    await mount(<Trefferanzeige gezeigt={3} gesamt={42} />);
    const el = query(`.${s.filtertreffer}`);
    expect(el.textContent).toBe("3 von 42");
    expect(el.getAttribute("data-testid")).toBe("trefferanzeige");
  });

  it("erscheint NICHT, wenn nichts ausgeblendet ist", async () => {
    // „X von Y" heiszt „dein Filter blendet Y-X Zeilen aus". Bei gezeigt ===
    // gesamt waere die Aussage leer und der Satz nur Rauschen.
    await mount(<div><Trefferanzeige gezeigt={42} gesamt={42} /></div>);
    expect(exists(`.${s.filtertreffer}`)).toBe(false);
  });

  it("erscheint auch bei null Treffern", async () => {
    await mount(<Trefferanzeige gezeigt={0} gesamt={42} />);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("0 von 42");
  });

  it("erscheint nicht bei leerer Liste", async () => {
    await mount(<div><Trefferanzeige gezeigt={0} gesamt={0} /></div>);
    expect(exists(`.${s.filtertreffer}`)).toBe(false);
  });
});

describe("Suchfeld", () => {
  it("traegt die Rolle searchbox — GEGEN DAS GERENDERTE BAUTEIL geprueft", async () => {
    /*
     * DIE ZUSICHERUNG, DIE STILL BRICHT. `suche-filter.spec.ts:15,28` greift
     * `role=searchbox`; heute entsteht sie allein aus `type="search"`
     * (`Filterleiste.tsx:106`). Wer das Bauteil ersetzt und nur `placeholder`
     * und `aria-label` mitnimmt, bekommt `textbox` — beide Tests brechen, und
     * zwar still im Sinne von „Selektor findet nichts".
     *
     * Geprueft wird das antd-`Input`, nicht die Absicht (§12.3, Regel 2).
     */
    await mount(<Suchfeld wert="" onWert={() => {}} platzhalter="Artikel oder Fach suchen…" />);
    const input = query("input");
    expect(input.getAttribute("type")).toBe("search");
    expect(input.getAttribute("role") ?? "searchbox").toBe("searchbox");
  });

  it("benutzt Input, nicht Input.Search — es gibt keinen Absendeknopf", async () => {
    await mount(<Suchfeld wert="" onWert={() => {}} platzhalter="suchen…" />);
    expect(exists(".ant-input-search-button")).toBe(false);
    const quelle = readFileSync("src/app/m/lagerbuch/_ui/Suchfeld.tsx", "utf8");
    expect(quelle).not.toMatch(/Input\.Search/);
  });

  it("traegt die Lupe als prefix und ein aria-label", async () => {
    await mount(<Suchfeld wert="" onWert={() => {}} platzhalter="Gerät suchen…" />);
    expect(exists(".ant-input-prefix svg")).toBe(true);
    expect(query("input").getAttribute("aria-label")).toBe("Gerät suchen…");
  });

  it("meldet jede Eingabe nach oben", async () => {
    const gesehen: string[] = [];
    await mount(<Suchfeld wert="" onWert={(w) => gesehen.push(w)} platzhalter="suchen…" />);
    await fill("input", "mull");
    expect(gesehen.at(-1)).toBe("mull");
  });

  it("setzt keine Schriftgroesze unter 16px", async () => {
    // Die Suite sperrt den Zoom; beide Regeln sind eine Einheit.
    await mount(<Suchfeld wert="" onWert={() => {}} platzhalter="suchen…" />);
    const stil = query("input").getAttribute("style") ?? "";
    const treffer = /font-size:\s*([\d.]+)px/.exec(stil);
    if (treffer) expect(Number(treffer[1])).toBeGreaterThanOrEqual(16);
  });
});

describe("useUrlFilter", () => {
  it("schreibt gesetzte Parameter relativ und ohne Scroll-Sprung", async () => {
    const { useUrlFilter } = await import("./useUrlFilter");
    function Probe() {
      const setzen = useUrlFilter();
      return <button type="button" onClick={() => setzen({ q: "mull", typ: "entnahme" })}>los</button>;
    }
    await mount(<Probe />);
    query("button").click();
    expect(replace).toHaveBeenCalledWith("/verwaltung/journal?q=mull&typ=entnahme", { scroll: false });
  });

  it("laeszt leere Werte aus", async () => {
    const { useUrlFilter } = await import("./useUrlFilter");
    function Probe() {
      const setzen = useUrlFilter();
      return <button type="button" onClick={() => setzen({ q: "", typ: "zugang" })}>los</button>;
    }
    await mount(<Probe />);
    query("button").click();
    expect(replace).toHaveBeenCalledWith("/verwaltung/journal?typ=zugang", { scroll: false });
  });

  it("bei leerem Objekt bleibt nur der Pfad — alle Filter zurueckgesetzt", async () => {
    const { useUrlFilter } = await import("./useUrlFilter");
    function Probe() {
      const setzen = useUrlFilter();
      return <button type="button" onClick={() => setzen({})}>los</button>;
    }
    await mount(<Probe />);
    query("button").click();
    expect(replace).toHaveBeenCalledWith("/verwaltung/journal", { scroll: false });
  });

  it("benutzt replace und NICHT push", async () => {
    // `push` fuellte die Historie mit jedem Tastendruck; der Zurueck-Knopf
    // brauchte danach zwanzig Klicks (§5.14.1).
    const quelle = readFileSync("src/app/m/lagerbuch/_ui/useUrlFilter.ts", "utf8");
    expect(quelle).toMatch(/router\.replace/);
    expect(quelle).not.toMatch(/router\.push/);
  });
});

describe("usePathname kommt im Modul genau einmal vor", () => {
  it("nur in _ui/useUrlFilter.ts", () => {
    /*
     * Der VOLLSTAENDIGE Riegel gehoert Teil 4 (`_lib/bauform.test.ts`,
     * §7.8.2) — er deckt auch den Helfer-Ast ab. DIESER Test ist die
     * Frueherkennung fuer die Verwaltung: er laeuft, sobald es die erste
     * Verwaltungsdatei gibt, und nicht erst, wenn Teil 4 fertig ist.
     * Es entsteht KEINE zweite Scan-Datei — beide sind Testfaelle, keine
     * Dateien.
     */
    const treffer: string[] = [];
    const suche = (verzeichnis: string) => {
      for (const eintrag of readdirSync(verzeichnis)) {
        const pfad = join(verzeichnis, eintrag);
        if (statSync(pfad).isDirectory()) suche(pfad);
        else if (/\.tsx?$/.test(pfad) && /\busePathname\b/.test(readFileSync(pfad, "utf8"))) {
          treffer.push(relative("src/app/m/lagerbuch", pfad));
        }
      }
    };
    suche("src/app/m/lagerbuch");
    expect(treffer.filter((t) => !t.endsWith("filter.test.tsx"))).toEqual(["_ui/useUrlFilter.ts"]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/filter.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./Trefferanzeige"`.

- [ ] **Schritt 3: `_ui/Trefferanzeige.tsx` schreiben**

```tsx
import s from "./verwaltung.module.css";

/**
 * DIE TREFFERANZEIGE „X von Y" — UND SIE IST NICHT DER PAGER.
 *
 * `Filterleiste.tsx:131` rendert sie NUR, wenn `gezeigt !== gesamt`; alle
 * sechs clientseitig gefilterten Listen geben sie mit (`ArtikelTable.tsx:197`,
 * `GeraeteListe.tsx:47`, `BzListe.tsx:48`, `SauerstoffListe.tsx:41`,
 * `FahrzeugeListe.tsx:44`, `TokenTable.tsx:55`).
 *
 * Ein antd-`Table` zeigt stattdessen einen Pager-Text — NICHT DIESELBE
 * AUSSAGE: „X von Y" heiszt „dein Filter blendet Y-X Zeilen aus", der Pager
 * heiszt „diese Seite von mehreren". Verbindlich (§6.9.5): eigenes Markup
 * ueber der Tabelle, mit derselben Bedingung.
 *
 * `data-testid` ist hier der zweite Weg und ausnahmsweise richtig: ein `<span>`
 * mit einer Zahl hat keine eigene Rolle, und ein `getByText("3 von 42")` waere
 * an den Wert gekoppelt statt an das Element (Plan-Festlegung H13 — eine von
 * genau zwei `data-testid` dieses Plans).
 *
 * KEIN "use client": sie steht auch ueber RSC-gerenderten Listen (Checks,
 * Journal), wo der Server die beiden Zahlen ohnehin kennt.
 */
export function Trefferanzeige({ gezeigt, gesamt }: { gezeigt: number; gesamt: number }) {
  if (gezeigt === gesamt) return null;
  return (
    <span className={s.filtertreffer} data-testid="trefferanzeige">
      {gezeigt} von {gesamt}
    </span>
  );
}
```

- [ ] **Schritt 4: `_ui/Suchfeld.tsx` schreiben**

```tsx
"use client";

import { Input } from "antd";
import { Ikone } from "./ikonen";

/**
 * DAS FREITEXT-SUCHFELD — `<Input type="search">`, NIE `Input.Search`.
 *
 * ZWEI GRUENDE, und der zweite ist der tragende (§6.9.2, Punkt 1):
 *  1. `Input.Search` ist ein Compound-Zugriff (Falle 1). In einer Client-Insel
 *     waere das zulaessig — hier steht es in einer, also faellt der Grund
 *     allein nicht ins Gewicht.
 *  2. `Input.Search` bringt einen ABSENDEKNOPF mit, und das Feld soll gerade
 *     NICHT abgesendet werden: in Regime A filtert es beim Tippen, in Regime B
 *     navigiert es debounced. Ein Knopf, der nichts tut, ist schlimmer als
 *     keiner.
 *
 * `type="search"` IST DIE ROLLE. `suche-filter.spec.ts:15,28` greift
 * `role=searchbox`, und die entsteht ALLEIN daraus (`Filterleiste.tsx:106`).
 * Wer nur `placeholder` und `aria-label` mitnimmt, bekommt `textbox` — beide
 * Tests brechen, und zwar still im Sinne von „Selektor findet nichts". Die
 * Rolle wird deshalb EINMAL gegen das gerenderte Bauteil geprueft
 * (`filter.test.tsx`), nicht gegen die Absicht.
 *
 * KEIN `size`: `controlHeight: 56` ist bereits das richtige Masz,
 * `size="large"` waere 72px (Falle 4). Die Lupe steht als `prefix` und kommt
 * aus `_ui/ikonen.tsx` — `@ant-design/icons` ist im ganzen Modul verboten.
 */
export function Suchfeld({
  wert,
  onWert,
  platzhalter,
  breite = 280,
}: {
  wert: string;
  onWert: (wert: string) => void;
  platzhalter: string;
  breite?: number;
}) {
  return (
    <Input
      type="search"
      value={wert}
      onChange={(e) => onWert(e.target.value)}
      placeholder={platzhalter}
      aria-label={platzhalter}
      prefix={<Ikone name="lupe" groesse={16} />}
      allowClear
      style={{ maxWidth: breite }}
    />
  );
}
```

- [ ] **Schritt 5: `_ui/useUrlFilter.ts` schreiben**

```ts
"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * DER HOOK FUER URL-GETRIEBENE FILTER (Regime B: Journal und Check-Historie).
 *
 * ⚠️ DIES IST DIE EINZIGE DATEI DES MODULS MIT `usePathname` (§6.3.4,
 * Plan-Festlegung H4). Der Riegel aus §7.8.2 (Teil 4, `_lib/bauform.test.ts`)
 * nennt sie namentlich als Ausnahme; JEDE WEITERE FUNDSTELLE IST EIN FEHLER.
 * Sie braucht es, weil sie ein RELATIVES Ziel schreibt — genau das Muster, das
 * die Suite selbst faehrt (`m/feedback/_ui/Segment.tsx:29,34`).
 *
 * Der heutige zweite Konsument, `SideNav.tsx:27,33` (Aktivmarkierung ueber 15
 * Ziele), entfaellt vollstaendig: `SuiteNav` in `core` macht es mit
 * `aktiverEintrag` statt `startsWith`.
 *
 * `router.replace` UND NICHT `push`: der Filter ist kein Navigationsschritt.
 * Mit `push` fuellte jeder Tastendruck die Historie, und der Zurueck-Knopf
 * brauchte danach zwanzig Klicks, um die Seite zu verlassen (§5.14.1).
 * `{ scroll: false }`, weil ein Filterwechsel die Liste aendert und nicht den
 * Ort — ein Sprung nach oben mitten im Lesen ist ein Verlust ohne Gewinn.
 *
 * LEERE WERTE WERDEN AUSGELASSEN, nicht als `?q=` geschrieben: ein leerer
 * Parameter und ein fehlender bedeuten dasselbe, und zwei Schreibweisen fuer
 * einen Zustand machen aus jedem geteilten Link eine Ratesache. Ein leeres
 * Objekt setzt damit ALLE Filter zurueck.
 */
export function useUrlFilter(): (params: Record<string, string>) => void {
  const router = useRouter();
  const pathname = usePathname();
  return (params: Record<string, string>) => {
    const sp = new URLSearchParams();
    for (const [name, wert] of Object.entries(params)) if (wert) sp.set(name, wert);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
}
```

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/filter.test.tsx
```

**Grün.**

- [ ] **Schritt 6: Commit**

```bash
rtk git add src/app/m/lagerbuch/_ui/useUrlFilter.ts src/app/m/lagerbuch/_ui/Suchfeld.tsx \
            src/app/m/lagerbuch/_ui/Trefferanzeige.tsx src/app/m/lagerbuch/_ui/filter.test.tsx
rtk git commit -m "feat(lagerbuch): useUrlFilter, Suchfeld und Trefferanzeige

useUrlFilter ist die EINZIGE Datei des Moduls mit usePathname — der Riegel aus
§7.8.2 (Teil 4) nennt sie namentlich als Ausnahme, jede weitere Fundstelle ist
ein Fehler. replace statt push, { scroll: false }, leere Werte ausgelassen.
Ein Testfall haelt die Einzigkeit schon jetzt fest, damit sie nicht erst mit
Teil 4 auffaellt.

Suchfeld ist <Input type=\"search\">, nicht Input.Search: das bringt einen
Absendeknopf mit, und das Feld soll gerade nicht abgesendet werden. Die Rolle
searchbox entsteht ALLEIN aus type=search — sie ist einmal gegen das
gerenderte antd-Bauteil geprueft, nicht gegen die Absicht.

Trefferanzeige erscheint nur bei gezeigt !== gesamt und ist NICHT der Pager:
'X von Y' heiszt 'dein Filter blendet Y-X Zeilen aus', ein Pager heiszt 'diese
Seite von mehreren'."
```

---

### Task 110: `_ui/LoeschDialog.tsx` und `_ui/LoeschButton.tsx` — der Dialog ist nicht netto null

**Files:**
- Create: `src/app/m/lagerbuch/_lib/loeschen.ts`
- Create: `src/app/m/lagerbuch/_ui/LoeschDialog.tsx`
- Create: `src/app/m/lagerbuch/_ui/LoeschButton.tsx`
- Test: `src/app/m/lagerbuch/_ui/LoeschDialog.test.tsx`

**Interfaces:**
- Consumes: `antd` — `Modal`, `Button`, `Input`, `Alert`; `_ui/ikonen.tsx` (T101);
  `_ui/verwaltung.module.css` (T100). ⚠️ Die **Actions** kommen als Props, nicht als Import — siehe
  unten.
- Produces:
  ```ts
  // _lib/loeschen.ts — KEIN "use client" (Server Actions lesen die Typen).
  export const ELEMENT_ARTEN: readonly
    ["artikel","fahrzeug","token","bzGeraet","o2Flasche","geraet"];
  export type ElementArt = (typeof ELEMENT_ARTEN)[number];
  export type Loeschbarkeit =
    | { loeschbar: true }
    | { loeschbar: false; grund: string; kannDeaktivieren: boolean };
  ```
  ```tsx
  // _ui/LoeschDialog.tsx + _ui/LoeschButton.tsx — "use client".
  export function LoeschDialog(props: {
    offen: boolean;
    name: string;                    // muss exakt abgetippt werden
    typLabel: string;                // „Artikel", „BZ-Gerät", „Zugangs-Code" …
    deaktivierenLabel?: string;      // Vorgabe „Deaktivieren"; Tokens: „Sperren"
    hinweis?: React.ReactNode;       // z. B. „N Fahrzeuge werden gelöst"
    pruefen: () => Promise<Loeschbarkeit>;
    onLoeschen: () => Promise<void>;
    onDeaktivieren?: () => Promise<void>;
    onSchliessen: () => void;
    onFertig?: () => void;
  }): JSX.Element;

  export function LoeschButton(props: {
    name: string; typLabel: string; label?: string; deaktivierenLabel?: string;
    nurZeichen?: boolean; hinweis?: React.ReactNode;
    pruefen: () => Promise<Loeschbarkeit>;
    onLoeschen: () => Promise<void>;
    onDeaktivieren?: () => Promise<void>;
    onFertig?: () => void;
  }): JSX.Element;
  ```
  Konsumenten: `_ui/ArtikelDrawer.tsx` (T127), `fahrzeuge/[id]` (T132), `vorlagen/[id]` (T134),
  `bz/[id]` (T139), `sauerstoff/[id]` (T142), `geraete/[id]` (T144), `tokens` (T148).

**Warum `_lib/loeschen.ts` zu diesem Task gehört und nicht zu T124.** Der Typ `Loeschbarkeit` ist der
Vertrag **zwischen** Dialog und Action; er muss existieren, bevor eine von beiden Seiten gebaut wird,
und er darf in keiner `"use server"`-Datei wohnen (dort ist jeder Export eine Action). Die Datei
enthält **nur Typen und eine Konstante**, kein Verhalten — deshalb kein eigener Task.

⚠️ **Der Dialog nimmt die Actions als PROPS entgegen und importiert sie nicht.** Grund ist §6.12,
Frage 1 und die siebte `ElementArt`: `/verwaltung/vorlagen/[id]` löscht über `deleteTemplate`
(`templates.ts`), nicht über `loescheElement` — dort gibt es keine `ElementArt` `"template"`. Ein
Dialog, der `loescheElement` fest importierte, könnte diesen Fall nicht bedienen, und die Alternative
wäre eine siebte Art in `loeschen.ts` **ohne** Zähler-Logik und **ohne** `REVALIDATE`-Zeile — also ein
Sonderfall in einer Tabelle, die genau davon lebt, keinen zu haben.

**Was `Modal` nicht mitbringt und deshalb wandern muss** (§6.4.5 — „netto Löschung" gilt für die
Hülle, nicht für die Zusagen):

1. **Die Vorprüfung.** `LoeschDialog.tsx:29-31` ruft beim Öffnen `pruefeLoeschbar(art, id)` und zeigt
   das Ergebnis, **bevor irgendetwas passiert**. Das ist der Grund, warum der Dialog überhaupt
   existiert: ob ein Artikel löschbar oder nur deaktivierbar ist, weiß **nur der Server**.
2. **Die Namenseingabe.** „Exakter Name — muss zur Bestätigung abgetippt werden." Ein `Popconfirm` mit
   „Wirklich löschen?" ist **kein Ersatz**; es ist eine schwächere Zusage für dieselbe Handlung.
3. **Der zweite Ausgang.** Neben „Löschen" ein „Deaktivieren" mit konfigurierbarer Beschriftung (für
   Zugangs-Codes „Sperren"). Ein `Popconfirm` hat **genau einen** Bestätigungsknopf — und
   `deaktiviereElement` bliebe **stumm** (§6.12, Frage 1, zweiter benannter Kandidat).
4. **Escape schließt, ohne zu löschen** — das kann `Modal` von selbst und muss nur nicht verlorengehen.

**Das verbindliche Kriterium ist der Datenverlust, nicht die Rücknehmbarkeit** (§6.4.5). Drei Fälle,
in dieser Reihenfolge zu prüfen:

| Fall | Bedienelement | Beispiel |
|---|---|---|
| 1 | **`Popconfirm`** — die Aktion **schreibt** | „× aussondern" (Journalzeile; **nicht** rücknehmbar und trotzdem `Popconfirm`, weil nichts verlorengeht) |
| 2 | **`Popconfirm`** — die Aktion löscht eine Zuordnung **ohne** Journal, die ohne Verlust neu gesetzt werden kann | „Position aus der Vorlage entfernen", „Verknüpfung lösen". ⚠️ **Nur `buchungen` ist append-only** — eine `template_positionen`-Zeile ist danach wirklich weg; sie trägt aber nichts als ihre eigene Sollzahl |
| 3 | **`Modal`** mit Vorprüfung, Namenseingabe, zweitem Ausgang — die Aktion löscht einen **Stammdatensatz** | Artikel, Fahrzeug, Vorlage, Gerät, Flasche, Zugangs-Code |

**Der Kurzschluss „löscht → `Modal`" ist falsch (Fall 2), der Kurzschluss „nicht rücknehmbar →
`Modal`" ebenfalls (Fall 1).**

⚠️ **Rot am Löschknopf ist richtig.** `Button danger` trägt Suite-Rot — **weil er eine Handlung ist,
keine Datenfläche.** Die Regel „kein Rot auf einer Datenfläche" trifft ihn nicht. Was sie trifft, ist
der Warnkasten darüber: der bekommt **Ampel**-Rot (`.warnbox`, T100).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/LoeschDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, fill, click, clickPortal, queryPortal, existsPortal }
  from "@/app/m/qr/_lib/test-dom";
import { LoeschDialog } from "./LoeschDialog";
import { LoeschButton } from "./LoeschButton";
import type { Loeschbarkeit } from "../_lib/loeschen";

afterEach(async () => { await unmount(); });

const LOESCHBAR: Loeschbarkeit = { loeschbar: true };
const GESPERRT: Loeschbarkeit = {
  loeschbar: false,
  grund: "Noch mit 12 Buchungen verknüpft — Löschen würde den Nachweis zerstören.",
  kannDeaktivieren: true,
};

function warte() { return new Promise((r) => setTimeout(r, 0)); }

describe("LoeschDialog: die Vorpruefung", () => {
  it("ruft `pruefen` BEIM OEFFNEN, vor jeder Handlung", async () => {
    const pruefen = vi.fn(async () => LOESCHBAR);
    await mount(
      <LoeschDialog offen name="Kompressen" typLabel="Artikel" pruefen={pruefen}
        onLoeschen={async () => {}} onSchliessen={() => {}} />,
    );
    await warte();
    // Ob ein Artikel loeschbar oder nur deaktivierbar ist, weisz NUR der
    // Server. Genau deshalb existiert dieser Dialog ueberhaupt.
    expect(pruefen).toHaveBeenCalledTimes(1);
  });

  it("zeigt den Grund und bietet Deaktivieren an, wenn nicht loeschbar", async () => {
    const deaktivieren = vi.fn(async () => {});
    await mount(
      <LoeschDialog offen name="Kompressen" typLabel="Artikel" pruefen={async () => GESPERRT}
        onLoeschen={async () => {}} onDeaktivieren={deaktivieren} onSchliessen={() => {}} />,
    );
    await warte();
    expect(queryPortal(".ant-modal").textContent).toContain("Noch mit 12 Buchungen verknüpft");
    // Der zweite Ausgang: ohne ihn bliebe `deaktiviereElement` stumm.
    await clickPortal("[data-rolle='deaktivieren']");
    expect(deaktivieren).toHaveBeenCalledTimes(1);
  });

  it("der Loeschknopf ist bei „nicht loeschbar\" gar nicht vorhanden", async () => {
    await mount(
      <LoeschDialog offen name="Kompressen" typLabel="Artikel" pruefen={async () => GESPERRT}
        onLoeschen={async () => {}} onDeaktivieren={async () => {}} onSchliessen={() => {}} />,
    );
    await warte();
    expect(existsPortal("[data-rolle='loeschen']")).toBe(false);
  });

  it("meldet den Grund NICHT als Alert type=error", async () => {
    // Ein `Alert type=\"error\"` ueber einer Liste mit Ampel-Chips braechte
    // zwei verschiedene Rot auf denselben Bildschirm — und das kraeftigere
    // gehoerte der Fehlermeldung statt dem abgelaufenen Medikament (§6.6.5).
    await mount(
      <LoeschDialog offen name="X" typLabel="Artikel" pruefen={async () => GESPERRT}
        onLoeschen={async () => {}} onSchliessen={() => {}} />,
    );
    await warte();
    expect(existsPortal(".ant-alert-error")).toBe(false);
  });
});

describe("LoeschDialog: die Namenseingabe", () => {
  it("der Loeschknopf bleibt gesperrt, solange der Name nicht exakt stimmt", async () => {
    const loeschen = vi.fn(async () => {});
    await mount(
      <LoeschDialog offen name="Kompressen steril" typLabel="Artikel" pruefen={async () => LOESCHBAR}
        onLoeschen={loeschen} onSchliessen={() => {}} />,
    );
    await warte();
    expect(queryPortal("[data-rolle='loeschen']").hasAttribute("disabled")).toBe(true);
    await fill(".ant-modal input", "Kompressen");           // Praefix genuegt nicht
    expect(queryPortal("[data-rolle='loeschen']").hasAttribute("disabled")).toBe(true);
    await fill(".ant-modal input", "kompressen steril");     // Grosz/Klein zaehlt
    expect(queryPortal("[data-rolle='loeschen']").hasAttribute("disabled")).toBe(true);
    await fill(".ant-modal input", "Kompressen steril");
    expect(queryPortal("[data-rolle='loeschen']").hasAttribute("disabled")).toBe(false);
    await clickPortal("[data-rolle='loeschen']");
    expect(loeschen).toHaveBeenCalledTimes(1);
  });

  it("das Namensfeld traegt ein Label mit dem erwarteten Namen", async () => {
    await mount(
      <LoeschDialog offen name="RTW 1" typLabel="Fahrzeug" pruefen={async () => LOESCHBAR}
        onLoeschen={async () => {}} onSchliessen={() => {}} />,
    );
    await warte();
    expect(queryPortal(".ant-modal").textContent).toContain("RTW 1");
    expect(queryPortal(".ant-modal input").getAttribute("aria-label"))
      .toBe("Namen zur Bestätigung eingeben");
  });
});

describe("LoeschDialog: Huelle und Beschriftungen", () => {
  it("traegt die Rolle dialog mit einem Namen, der „löschen\" enthaelt", async () => {
    // Ersatzanker fuer `.modalbox` (§6.11):
    // getByRole("dialog", { name: /löschen/i }).
    await mount(
      <LoeschDialog offen name="X" typLabel="BZ-Gerät" pruefen={async () => LOESCHBAR}
        onLoeschen={async () => {}} onSchliessen={() => {}} />,
    );
    await warte();
    const modal = queryPortal("[role='dialog']");
    expect(modal.getAttribute("aria-label") ?? modal.textContent).toMatch(/löschen/i);
    expect(queryPortal(".ant-modal-title").textContent).toBe("BZ-Gerät löschen");
  });

  it("benutzt die konfigurierbare Beschriftung des zweiten Ausgangs", async () => {
    await mount(
      <LoeschDialog offen name="111-111" typLabel="Zugangs-Code" deaktivierenLabel="Sperren"
        pruefen={async () => GESPERRT} onLoeschen={async () => {}}
        onDeaktivieren={async () => {}} onSchliessen={() => {}} />,
    );
    await warte();
    expect(queryPortal("[data-rolle='deaktivieren']").textContent).toContain("Sperren");
  });

  it("zeigt einen zusaetzlichen Hinweis, wenn einer uebergeben wird", async () => {
    await mount(
      <LoeschDialog offen name="Standard-RTW" typLabel="Vorlage"
        hinweis="3 Fahrzeuge werden von dieser Vorlage gelöst; ihre Positionen bleiben erhalten."
        pruefen={async () => LOESCHBAR} onLoeschen={async () => {}} onSchliessen={() => {}} />,
    );
    await warte();
    expect(queryPortal(".ant-modal").textContent).toContain("3 Fahrzeuge werden");
  });

  it("meldet einen Fehler der Action am Dialog, nicht als Wurf", async () => {
    await mount(
      <LoeschDialog offen name="X" typLabel="Artikel" pruefen={async () => LOESCHBAR}
        onLoeschen={async () => { throw new Error("Noch verknüpft"); }}
        onSchliessen={() => {}} />,
    );
    await warte();
    await fill(".ant-modal input", "X");
    await clickPortal("[data-rolle='loeschen']");
    await warte();
    expect(queryPortal(".ant-modal").textContent).toContain("konnte nicht gelöscht werden");
  });
});

describe("LoeschButton", () => {
  it("oeffnet den Dialog erst auf Klick — `pruefen` laeuft nicht beim Rendern", async () => {
    const pruefen = vi.fn(async () => LOESCHBAR);
    await mount(
      <LoeschButton name="X" typLabel="Gerät" label="Gerät löschen"
        pruefen={pruefen} onLoeschen={async () => {}} />,
    );
    await warte();
    expect(pruefen).not.toHaveBeenCalled();
    await click("button");
    await warte();
    expect(pruefen).toHaveBeenCalledTimes(1);
  });

  it("traegt `danger` — Rot auf einer HANDLUNG ist richtig", async () => {
    await mount(
      <LoeschButton name="X" typLabel="Gerät" label="Gerät löschen"
        pruefen={async () => LOESCHBAR} onLoeschen={async () => {}} />,
    );
    expect(document.querySelector(".ant-btn-dangerous")).not.toBeNull();
  });

  it("mit `nurZeichen` traegt der Knopf ein aria-label", async () => {
    // Ein Zeichen OHNE danebenstehenden Text ist ein Bedienelement und traegt
    // sein Label am KNOPF, nicht am <svg> (§6.5.2).
    await mount(
      <LoeschButton name="111-111" typLabel="Zugangs-Code" nurZeichen
        pruefen={async () => LOESCHBAR} onLoeschen={async () => {}} />,
    );
    expect(document.querySelector("button")?.getAttribute("aria-label"))
      .toBe("Zugangs-Code 111-111 löschen");
  });

  it("setzt `size=\"small\"` NICHT von selbst", async () => {
    // `size` wird gar nicht gesetzt; die einzige Ausnahme sind Zeilenaktionen
    // INNERHALB einer Tabellenzeile, und das entscheidet der Aufrufer.
    const quelle = readFileSync("src/app/m/lagerbuch/_ui/LoeschButton.tsx", "utf8");
    expect(quelle).not.toMatch(/size=["']large["']/);
  });
});

describe("Kein Popconfirm fuer Stammdatensaetze", () => {
  it("LoeschDialog.tsx importiert kein Popconfirm", () => {
    // Ein Popconfirm verloere die serverseitige Vorpruefung, die
    // Namenseingabe und den zweiten Ausgang — drei Zusagen fuer eine Zeile
    // Ersparnis (§6.4.5).
    const quelle = readFileSync("src/app/m/lagerbuch/_ui/LoeschDialog.tsx", "utf8");
    expect(quelle).not.toMatch(/Popconfirm/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/LoeschDialog.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./LoeschDialog"`.

- [ ] **Schritt 3: `_lib/loeschen.ts` schreiben**

```ts
/**
 * DER VERTRAG ZWISCHEN LOESCHDIALOG UND LOESCH-ACTION.
 *
 * KEIN "use client" und keine `"use server"`-Datei: in einer `"use server"`-
 * Datei ist JEDER Export eine Server Action, und ein exportierter TYP waere
 * dort ein Fehler, den erst die Laufzeit meldet. Deshalb eine eigene
 * `_lib/`-Datei — sie enthaelt nur Typen und eine Konstante, kein Verhalten.
 *
 * SECHS ARTEN, NICHT SIEBEN. Die Vorlage (`fahrzeug_templates`) fehlt
 * absichtlich: sie wird ueber `deleteTemplate` in `_actions/templates.ts`
 * geloescht, mit eigener Transaktion, die verknuepfte Fahrzeuge vorher loest.
 * Eine siebte Art hier haette weder eine Zaehler-Logik in `pruefe()` noch eine
 * `REVALIDATE`-Zeile — ein Sonderfall in einer Tabelle, die genau davon lebt,
 * keinen zu haben. Der Dialog nimmt die Action deshalb als PROP entgegen.
 *
 * Zeichengleich aus `lagerbuch/src/lib/loeschen.ts`; nur der Ablageort
 * wechselt.
 */
export const ELEMENT_ARTEN = [
  "artikel",
  "fahrzeug",
  "token",
  "bzGeraet",
  "o2Flasche",
  "geraet",
] as const;

export type ElementArt = (typeof ELEMENT_ARTEN)[number];

/**
 * Das Ergebnis der serverseitigen Vorpruefung.
 *
 * `kannDeaktivieren` ist NICHT redundant zu `loeschbar: false`: es gibt Faelle,
 * in denen weder geloescht noch deaktiviert werden darf (das Handlager). Der
 * Dialog blendet den zweiten Ausgang dann aus, statt einen Knopf anzubieten,
 * der wirft.
 */
export type Loeschbarkeit =
  | { loeschbar: true }
  | { loeschbar: false; grund: string; kannDeaktivieren: boolean };
```

- [ ] **Schritt 4: `_ui/LoeschDialog.tsx` schreiben**

```tsx
"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Alert, Button, Input, Modal } from "antd";
import type { Loeschbarkeit } from "../_lib/loeschen";
import { SCHRIFT } from "../_lib/schrift";

/**
 * DER LOESCHDIALOG — `Modal` als HUELLE, das Innenleben bleibt eigenes.
 *
 * Die Analyse fuehrt `LoeschDialog.tsx` (155 Z.) und `LoeschButton.tsx`
 * (73 Z.) unter „direktes antd-Gegenstueck = netto Loeschung". DAS GILT FUER
 * DIE HUELLE, NICHT FUER DIE ZUSAGEN. `Modal` bringt Fokusfalle, Escape und
 * Hintergrund mit; alles andere muss wandern:
 *
 *  1. DIE VORPRUEFUNG. Beim Oeffnen laeuft `pruefen()` und das Ergebnis steht
 *     da, BEVOR irgendetwas passiert. Ob ein Artikel loeschbar oder nur
 *     deaktivierbar ist, weisz nur der Server.
 *  2. DIE NAMENSEINGABE. „Exakter Name — muss zur Bestaetigung abgetippt
 *     werden." Ein `Popconfirm` mit „Wirklich loeschen?" ist kein Ersatz, es
 *     ist eine SCHWAECHERE Zusage fuer dieselbe Handlung.
 *  3. DER ZWEITE AUSGANG. Neben „Loeschen" ein „Deaktivieren" mit
 *     konfigurierbarer Beschriftung (fuer Zugangs-Codes „Sperren"). Ein
 *     `Popconfirm` hat genau EINEN Bestaetigungsknopf — und
 *     `deaktiviereElement` bliebe stumm (§6.12, Frage 1).
 *  4. ESCAPE SCHLIESZT, OHNE ZU LOESCHEN. Das kann `Modal` von selbst und muss
 *     nur nicht verlorengehen.
 *
 * DIE ACTIONS KOMMEN ALS PROPS, nicht als Import: `/verwaltung/vorlagen/[id]`
 * loescht ueber `deleteTemplate` und nicht ueber `loescheElement` — dort gibt
 * es keine `ElementArt` „template". Ein fest importierendes Dialogfenster
 * koennte diesen Fall nicht bedienen.
 *
 * FEHLER KOMMEN ALS TEXT AM DIALOG AN, nie als Wurf und nie ueber
 * `e.message`: in Produktion ist das der englische Satz (Falle 66). Der Text
 * hier ist deutsch und fest.
 *
 * KEIN `Alert type="error"` (§6.6.5, §11.6): der Grund einer abgelehnten
 * Loeschung ist eine FACHAUSSAGE. `type="warning"` traegt sie, ohne ein
 * zweites Rot auf den Bildschirm zu bringen.
 */
export function LoeschDialog({
  offen,
  name,
  typLabel,
  deaktivierenLabel = "Deaktivieren",
  hinweis,
  pruefen,
  onLoeschen,
  onDeaktivieren,
  onSchliessen,
  onFertig,
}: {
  offen: boolean;
  name: string;
  typLabel: string;
  deaktivierenLabel?: string;
  hinweis?: ReactNode;
  pruefen: () => Promise<Loeschbarkeit>;
  onLoeschen: () => Promise<void>;
  onDeaktivieren?: () => Promise<void>;
  onSchliessen: () => void;
  onFertig?: () => void;
}) {
  const [status, setStatus] = useState<Loeschbarkeit | null>(null);
  const [eingabe, setEingabe] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();

  // Die Vorpruefung laeuft beim OEFFNEN, nicht beim Rendern des Elternteils —
  // sonst schluege sie auf jeder Detailseite bei jedem Besuch zu, ohne dass
  // jemand loeschen will.
  useEffect(() => {
    if (!offen) return;
    setStatus(null);
    setEingabe("");
    setFehler(null);
    let verworfen = false;
    pruefen().then(
      (s) => { if (!verworfen) setStatus(s); },
      () => { if (!verworfen) setFehler("Die Prüfung ist fehlgeschlagen — bitte erneut versuchen."); },
    );
    return () => { verworfen = true; };
  }, [offen, pruefen]);

  const passt = eingabe === name;

  function ausfuehren(aktion: () => Promise<void>, misslungen: string) {
    setFehler(null);
    start(async () => {
      try {
        await aktion();
        onFertig?.();
        onSchliessen();
      } catch {
        setFehler(misslungen);
      }
    });
  }

  return (
    <Modal
      open={offen}
      title={`${typLabel} löschen`}
      onCancel={onSchliessen}
      footer={null}
      destroyOnHidden
    >
      <div style={{ display: "grid", gap: 12 }}>
        {hinweis ? <div style={SCHRIFT.text}>{hinweis}</div> : null}

        {status === null && !fehler ? <div style={SCHRIFT.neben}>Wird geprüft …</div> : null}

        {status && !status.loeschbar ? (
          <>
            <Alert type="warning" showIcon={false} message={status.grund} />
            {status.kannDeaktivieren && onDeaktivieren ? (
              <Button
                data-rolle="deaktivieren"
                loading={laeuft}
                onClick={() =>
                  ausfuehren(onDeaktivieren, `${typLabel} konnte nicht deaktiviert werden.`)
                }
              >
                {deaktivierenLabel}
              </Button>
            ) : null}
          </>
        ) : null}

        {status?.loeschbar ? (
          <>
            <div style={SCHRIFT.text}>
              Das löscht <strong>{name}</strong> endgültig. Tippe den Namen zur Bestätigung ab.
            </div>
            <Input
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
              placeholder={name}
              aria-label="Namen zur Bestätigung eingeben"
              autoComplete="off"
            />
            <Button
              data-rolle="loeschen"
              danger
              type="primary"
              disabled={!passt}
              loading={laeuft}
              onClick={() => ausfuehren(onLoeschen, `${typLabel} konnte nicht gelöscht werden.`)}
            >
              Endgültig löschen
            </Button>
          </>
        ) : null}

        {fehler ? <Alert type="warning" showIcon={false} message={fehler} /> : null}
      </div>
    </Modal>
  );
}
```

- [ ] **Schritt 5: `_ui/LoeschButton.tsx` schreiben**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { Button } from "antd";
import type { Loeschbarkeit } from "../_lib/loeschen";
import { Ikone } from "./ikonen";
import { LoeschDialog } from "./LoeschDialog";

/**
 * DER AUSLOESER — Knopf plus Dialog in einem Bauteil, damit keine Seite den
 * `offen`-Zustand selbst halten muss.
 *
 * `danger` traegt SUITE-Rot, und das ist hier richtig: der Knopf ist eine
 * HANDLUNG, keine Datenflaeche (§6.4.5, §6.6.5). Die Regel „kein Rot auf einer
 * Datenflaeche" trennt Handlung von Aussage, nicht rot von nicht-rot. Was sie
 * trifft, ist der Warnkasten im Dialog — der traegt AMPEL-Rot.
 *
 * `pruefen()` LAEUFT ERST AUF KLICK. Liefe es beim Rendern, schluege es auf
 * jeder Detailseite bei jedem Besuch zu — eine Datenbankabfrage pro Seite fuer
 * einen Knopf, den fast niemand drueckt.
 *
 * `nurZeichen` fuer Zeilenaktionen (Token-Tabelle): ein Zeichen OHNE
 * danebenstehenden Text ist ein Bedienelement und traegt sein `aria-label` am
 * KNOPF, nicht am `<svg>` (§6.5.2).
 *
 * `size` wird hier NICHT gesetzt. Zeilenaktionen innerhalb einer Tabellenzeile
 * tragen `size="small"` — das ist die eine von der Suite erlaubte Ausnahme,
 * und sie entscheidet der Aufrufer, nicht dieser Baustein.
 */
export function LoeschButton({
  name,
  typLabel,
  label,
  deaktivierenLabel,
  nurZeichen = false,
  hinweis,
  pruefen,
  onLoeschen,
  onDeaktivieren,
  onFertig,
}: {
  name: string;
  typLabel: string;
  label?: string;
  deaktivierenLabel?: string;
  nurZeichen?: boolean;
  hinweis?: ReactNode;
  pruefen: () => Promise<Loeschbarkeit>;
  onLoeschen: () => Promise<void>;
  onDeaktivieren?: () => Promise<void>;
  onFertig?: () => void;
}) {
  const [offen, setOffen] = useState(false);
  const beschriftung = label ?? `${typLabel} löschen`;

  return (
    <>
      <Button
        danger
        icon={<Ikone name="papierkorb" groesse={16} />}
        aria-label={nurZeichen ? `${typLabel} ${name} löschen` : undefined}
        onClick={() => setOffen(true)}
      >
        {nurZeichen ? null : beschriftung}
      </Button>
      <LoeschDialog
        offen={offen}
        name={name}
        typLabel={typLabel}
        deaktivierenLabel={deaktivierenLabel}
        hinweis={hinweis}
        pruefen={pruefen}
        onLoeschen={onLoeschen}
        onDeaktivieren={onDeaktivieren}
        onSchliessen={() => setOffen(false)}
        onFertig={onFertig}
      />
    </>
  );
}
```

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/LoeschDialog.test.tsx
```

**Grün.**

- [ ] **Schritt 6: Commit**

```bash
rtk git add src/app/m/lagerbuch/_lib/loeschen.ts src/app/m/lagerbuch/_ui/LoeschDialog.tsx \
            src/app/m/lagerbuch/_ui/LoeschButton.tsx src/app/m/lagerbuch/_ui/LoeschDialog.test.tsx
rtk git commit -m "feat(lagerbuch): LoeschDialog und LoeschButton — der Dialog ist nicht netto null

Modal traegt die Huelle (Fokusfalle, Escape, Hintergrund); die drei Zusagen
wandern mit: die serverseitige Vorpruefung beim Oeffnen, die Namenseingabe
(exakt, Grosz/Klein zaehlt), und der zweite Ausgang 'Deaktivieren' mit
konfigurierbarer Beschriftung ('Sperren' fuer Zugangs-Codes). Ein Popconfirm
verloere alle drei.

Die Actions kommen als PROPS und nicht als Import: /verwaltung/vorlagen/[id]
loescht ueber deleteTemplate, und dort gibt es keine ElementArt 'template'.
Eine siebte Art in _lib/loeschen.ts haette weder Zaehler-Logik noch eine
REVALIDATE-Zeile — ein Sonderfall in einer Tabelle, die davon lebt, keinen zu
haben.

Button danger traegt Suite-Rot, und das ist richtig: er ist eine HANDLUNG,
keine Datenflaeche. Der Warnkasten im Dialog traegt Ampel-Rot und ist
type=warning — Alert type=error erscheint im ganzen Modul nirgends.

pruefen() laeuft erst auf Klick: beim Rendern waere es eine Datenbankabfrage
pro Seitenaufruf fuer einen Knopf, den fast niemand drueckt."
```

---

### Task 111: `_ui/VerwaltungsRahmen.tsx` — eine Stelle, zwei Importeure

**Files:**
- Create: `src/app/m/lagerbuch/_ui/VerwaltungsRahmen.tsx`
- Test: `src/app/m/lagerbuch/_ui/VerwaltungsRahmen.test.tsx`

**Interfaces:**
- Consumes: `@/core/shell/Shell` — `Shell({ variant, moduleKey, nav })`; `@/core/registry` —
  `getModule`; `@/core/shell/types` — `type SuiteNavItem`; `_ui/verwaltung.module.css` (T100) —
  `.modul`.
- Produces:
  ```tsx
  // _ui/VerwaltungsRahmen.tsx — KEIN "use client", KEIN Import aus "antd".
  export function VerwaltungsRahmen(props: {
    nav?: SuiteNavItem[];
    children: React.ReactNode;
  }): JSX.Element;
  ```
  **Zwei Importeure, und nur zwei:** `verwaltung/(arbeit)/layout.tsx` (T112, **mit** `nav`) und
  `g/[code]/page.tsx` (**Teil 4**, §2.9 — **ohne** `nav`, weil es eine Blattseite außerhalb jeder
  Route-Group ist und das Group-Layout sie nicht erreicht).
- ⚠️ **`_ui/DruckRahmen.tsx` baut Teil 6** und importiert `verwaltung.module.css` **selbst**, um
  `className={s.modul}` zu setzen (§6.1.2). Er benutzt diesen Rahmen **nicht** — er trägt **keine**
  Shell.

**Warum `nav` hier optional ist und bei `files` Pflicht.** `m/files/_ui/VerwaltungsRahmen.tsx:12`
macht `nav` zum Pflicht-Prop, weil dort **beide** Aufrufer eine Verwaltungsansicht mit Abschnitten
sind. Hier ist der zweite Aufrufer `/g/<code>` — eine **Blattseite** mit genau einem gerenderten
Zustand (§2.9). Eine Navigationsleiste über einem gescannten Barcode-Ergebnis führte in Abschnitte,
die mit dem Gescannten nichts zu tun haben. `Shell` selbst erlaubt `nav?` (`Shell.tsx:15`).

⚠️ **Die eine Zeile, ohne die die halbe Farbentscheidung still ins Leere läuft: `className={s.modul}`
auf dem äußersten Element.** Auf `.modul` liegen **alle** `--lb-*`- und `--lb-ampel-*`-Variablen.
Ohne den Träger löst jedes `var(--lb-…)` ins Leere auf — und eine nicht auflösbare CSS-Variable fällt
auf `transparent` zurück und ist **gültiges CSS**. Der Chip bekäme Polster und Rundung ohne Farbe, die
KPI-Kante verschwände, die Plakette bliebe weiß: **HTTP 200, kein Log, und der Scan aus T100 bliebe
grün**, weil er die Deklaration prüft und nicht ihren Träger. Die einzige Aussage, die das hält, ist
ein echter Abruf je Modus (T151).

**Warum `variant` aus der Registry kommt und nicht als Literal.** Sonst hätte das Modul **zwei
Wahrheiten** über seine eigene Shell — eine in `core/registry.ts` und eine hier. Dieselbe Begründung
wie bei `files`.

**Warum diese Datei keinen `antd`-Import hat.** `Shell` trägt die antd-Bausteine; die Compound-Falle
(`Layout.Header` & Co. ergeben in RSC `undefined` und HTTP 500) ist hier damit **strukturell**
ausgeschlossen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_ui/VerwaltungsRahmen.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { VerwaltungsRahmen } from "./VerwaltungsRahmen";
import { LAGERBUCH_NAV } from "../_lib/nav";
import s from "./verwaltung.module.css";

const QUELLE = readFileSync("src/app/m/lagerbuch/_ui/VerwaltungsRahmen.tsx", "utf8");

describe("VerwaltungsRahmen: Bauform", () => {
  it("traegt kein \"use client\"", () => {
    // Sie ruft `getModule` (Server) und wird aus zwei Server Components
    // gemountet.
    expect(QUELLE.slice(0, 200)).not.toMatch(/["']use client["']/);
  });

  it("importiert nichts aus antd", () => {
    // `Shell` traegt die antd-Bausteine. Damit ist die Compound-Falle
    // (Layout.Header & Co. ergeben in RSC `undefined`) hier STRUKTURELL
    // ausgeschlossen.
    expect(QUELLE).not.toMatch(/from ["']antd["']/);
  });

  it("nimmt `variant` aus der Registry und nicht als Literal", () => {
    // Zwei Wahrheiten ueber die eigene Shell — eine in core/registry.ts und
    // eine hier — liefen auseinander, sobald jemand eine aendert.
    expect(QUELLE).toMatch(/getModule\(["']lagerbuch["']\)/);
    expect(QUELLE).toMatch(/variant=\{mod\.shell\}/);
    expect(QUELLE).not.toMatch(/variant=["']full["']/);
  });

  it("setzt `className={s.modul}` auf sein aeuszerstes Element", () => {
    /*
     * DIE ZEILE, OHNE DIE DIE HALBE FARBENTSCHEIDUNG STILL INS LEERE LAEUFT.
     * Auf `.modul` liegen ALLE --lb-* und --lb-ampel-*. Ohne Traeger loest
     * jedes var(--lb-…) ins Leere auf, faellt auf `transparent` zurueck und
     * ist GUELTIGES CSS: HTTP 200, kein Log — und der Scan in ampel.test.ts
     * bleibt gruen, weil er die Deklaration prueft und nicht ihren Traeger.
     */
    expect(QUELLE).toMatch(/className=\{s\.modul\}/);
    expect(s.modul, "Klasse .modul fehlt in verwaltung.module.css").toBeTruthy();
  });

  it("importiert das Modul-CSS hier und nicht im Layout", () => {
    // EINE Stelle, ZWEI Importeure: so kann keiner der beiden den
    // Stylesheet-Import vergessen (dasselbe Muster wie
    // m/files/_ui/VerwaltungsRahmen.tsx).
    expect(QUELLE).toMatch(/from ["']\.\/verwaltung\.module\.css["']/);
  });
});

describe("VerwaltungsRahmen: das Ergebnis", () => {
  it("reicht `nav` an `Shell` durch", () => {
    const baum = VerwaltungsRahmen({ nav: LAGERBUCH_NAV, children: null });
    // Ein flacher Strukturtest statt eines Renderings: `Shell` zieht
    // `FullShell` und damit antds Layout nach, und ein RSC-Baum laeszt sich in
    // jsdom nicht sinnvoll aufloesen. Was hier zaehlt, ist die Weitergabe.
    const innen = (baum.props as { children: { props: Record<string, unknown> } }).children;
    expect(innen.props.nav).toBe(LAGERBUCH_NAV);
    expect(innen.props.moduleKey).toBe("lagerbuch");
  });

  it("laeszt `nav` weg, wenn keins uebergeben wird", () => {
    // `/g/<code>` ist eine BLATTSEITE mit genau einem gerenderten Zustand
    // (§2.9). Eine Navigationsleiste ueber einem gescannten Barcode-Ergebnis
    // fuehrte in Abschnitte, die mit dem Gescannten nichts zu tun haben.
    const baum = VerwaltungsRahmen({ children: null });
    const innen = (baum.props as { children: { props: Record<string, unknown> } }).children;
    expect(innen.props.nav).toBeUndefined();
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/VerwaltungsRahmen.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./VerwaltungsRahmen"`.

- [ ] **Schritt 3: `_ui/VerwaltungsRahmen.tsx` schreiben**

```tsx
// Der Import des Modul-CSS steht HIER und nicht in den Layouts: damit liegen
// Shell, Navigation und Variablen an EINER Stelle mit zwei Importeuren, und
// keiner von beiden kann den Stylesheet-Import vergessen. (`feedback` hat ihn
// im Layout, weil es keine gemeinsame Rahmenkomponente hat.)
import s from "./verwaltung.module.css";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DER RAHMEN DER VERWALTUNGSSEITEN — EINE STELLE, ZWEI IMPORTEURE.
 *
 * 1. `verwaltung/(arbeit)/layout.tsx` — MIT `nav={LAGERBUCH_NAV}`.
 * 2. `g/[code]/page.tsx` (Teil 4, §2.9) — OHNE `nav`. Die Seite liegt
 *    auszerhalb jeder Route-Group; Next stapelt Layouts pro Pfad-Segment, das
 *    Group-Layout erreicht sie also nicht, und sie mountet den Rahmen selbst.
 *
 * WARUM `nav` OPTIONAL IST UND BEI `files` PFLICHT: dort sind beide Aufrufer
 * Verwaltungsansichten mit Abschnitten. Hier ist der zweite Aufrufer eine
 * BLATTSEITE mit genau einem gerenderten Zustand — eine Navigationsleiste
 * ueber einem gescannten Barcode-Ergebnis fuehrte in Abschnitte, die mit dem
 * Gescannten nichts zu tun haben. `Shell` selbst erlaubt `nav?`.
 *
 * ⚠️ `className={s.modul}` IST DIE ZEILE, AN DER DIE HALBE FARBENTSCHEIDUNG
 * HAENGT. Auf `.modul` liegen ALLE `--lb-*`- und `--lb-ampel-*`-Variablen
 * (§6.6.2a, §6.6.6). Ohne den Traeger loest jedes `var(--lb-…)` ins Leere auf
 * — und eine nicht aufloesbare CSS-Variable faellt auf `transparent` zurueck
 * und ist GUELTIGES CSS: der Chip bekaeme Polster und Rundung ohne Farbe, die
 * KPI-Kante verschwaende, die Plakette bliebe weisz. HTTP 200, kein Log, und
 * der Scan in `_lib/ampel.test.ts` bleibt GRUEN, weil er die Deklaration
 * prueft und nicht ihren Traeger. Die einzige Aussage, die das haelt, ist ein
 * echter Abruf je Modus (T151).
 * `_ui/DruckRahmen.tsx` (Teil 6) braucht ihn ebenfalls: `(druck)` rendert zwar
 * keinen Chip, aber die Fokusregel und die Brotkrume gelten unter beiden
 * Group-Layouts.
 *
 * Server Component, und OHNE JEDEN IMPORT AUS `antd`: `Shell` traegt die
 * antd-Bausteine, und die Compound-Falle (`Layout.Header` & Co. ergeben in RSC
 * `undefined` und HTTP 500) ist hier damit strukturell ausgeschlossen.
 * `variant` kommt aus der Registry, nicht als Literal — sonst haette das Modul
 * zwei Wahrheiten ueber seine eigene Shell.
 */
export function VerwaltungsRahmen({
  nav,
  children,
}: {
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  const mod = getModule("lagerbuch");
  return (
    <div className={s.modul}>
      <Shell variant={mod.shell} moduleKey={mod.key} nav={nav}>
        {children}
      </Shell>
    </div>
  );
}
```

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/VerwaltungsRahmen.test.tsx
```

**Grün.**

- [ ] **Schritt 4: Commit**

```bash
rtk git add src/app/m/lagerbuch/_ui/VerwaltungsRahmen.tsx \
            src/app/m/lagerbuch/_ui/VerwaltungsRahmen.test.tsx
rtk git commit -m "feat(lagerbuch): _ui/VerwaltungsRahmen.tsx — eine Stelle, zwei Importeure

(arbeit)/layout.tsx mountet ihn MIT nav, g/[code]/page.tsx (Teil 4) OHNE:
die Blattseite liegt auszerhalb jeder Route-Group, das Group-Layout erreicht
sie nicht, und eine Navigationsleiste ueber einem Barcode-Ergebnis fuehrte in
Abschnitte, die damit nichts zu tun haben.

className={s.modul} auf dem aeuszersten Element ist die Zeile, an der die
halbe Farbentscheidung haengt: dort liegen ALLE --lb-* und --lb-ampel-*. Ohne
Traeger loest jedes var(--lb-…) ins Leere auf, faellt auf transparent zurueck
und ist gueltiges CSS — HTTP 200, kein Log, und der CSS-Scan bleibt gruen,
weil er die Deklaration prueft und nicht ihren Traeger.

Kein antd-Import: Shell traegt die Bausteine, die Compound-Falle ist damit
strukturell ausgeschlossen. variant kommt aus der Registry, nicht als Literal."
```

---

### Gate nach Welle 2

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

## Welle 3 — Das Layout (1 Task)

Ein einzelner Task, weil ab hier **jede** Seite unter ihm hängt und weil er die einzige Stelle ist, an
der ein Fehler **alle 23 Arbeitsseiten** gleichzeitig lahmlegt.

---

### Task 112: `verwaltung/(arbeit)/layout.tsx` — zwei Riegel, ein Prädikat

**Files:**
- Create: `src/app/m/lagerbuch/verwaltung/(arbeit)/layout.tsx`
- Test: `src/app/m/lagerbuch/verwaltung/(arbeit)/layout.test.ts`

**Interfaces:**
- Consumes: `_lib/host.ts` (Teil 1, T10) — `requireLagerbuchHost(headers: Headers): void`;
  `_lib/zugang.ts` (Teil 2, T23) — `requireLagerbuchAdmin(): Promise<Viewer>`; `_lib/nav.ts` (T102) —
  `LAGERBUCH_NAV`; `_ui/VerwaltungsRahmen.tsx` (T111); `next/headers` — `headers`.
- Produces: die Route-Group `(arbeit)` und damit **den Ort, an dem alle 23 Arbeitsseiten entstehen**.
  Von hier ab ist `/verwaltung/*` erreichbar (äußere Form) bzw. `/m/lagerbuch/verwaltung/*` (innere).

**Von den 37 Zeilen des Bestands bleiben rund zehn.** `verwaltung/(admin)/layout.tsx` leistet heute
vier Dinge auf einmal: Sitzung lesen, abriegeln, Wortmarke plus 218px-Seitenleiste rendern, und das
Abmelde-Formular tragen. Wortmarke, Modulwechsler, angemeldete Person und Abmelden liefert
**`SuiteHeader`**; die Seitenleiste ersetzt `Shell nav={…}`.

⚠️ **Die teuerste einzelne Zeile der Portierung ist der `LogOut`-Import aus `lucide-react`
(`layout.tsx:3`).** Würde sie 1:1 auf `@ant-design/icons` umgeschrieben, läge der **gesamte**
Verwaltungsbereich bei HTTP 500 — und zwar **beim Import, nicht beim Rendern**. Diese Datei importiert
deshalb **kein einziges Zeichen**; der Abmeldeknopf entfällt ersatzlos (§6.4.10).

**Die Reihenfolge der beiden Riegel ist nicht beliebig: erst der Host, dann die Person.** Andernfalls
schickte ein anonymer Aufruf auf dem **falschen** Host erst in den Login und antwortete dann mit 404 —
der Login wäre eine Sackgasse, und die Rollentrennung hätte einen Umweg, der die Existenz des Pfades
verrät.

⚠️ **Warum der Riegel überhaupt hier stehen muss, obwohl die Middleware existiert.** lagerbuch ist
`requiresAuth: false` — zwingend, weil `/t/<code>` die Sitzung erst erzeugt und ohne jede Sitzung
aufgerufen wird. `canAccess` steigt für solche Module **sofort mit `true`** aus
(`core/registry.ts:155`) und liest `requiredGroups` **nie**. **Die Middleware gatet hier also
nicht.** Ohne diese zwei Zeilen wäre die Verwaltung für jeden Eingeloggten — und der Host-Riegel fehlt
ganz — für **jeden** offen.

⚠️ **Keine Server Action verlässt sich auf dieses Layout.** Eine Seiten- oder Layout-Prüfung erstreckt
sich **nicht** auf die Actions darunter: Action-IDs sind global, eine Verwaltungs-Action lässt sich
jederzeit gegen `/` posten, wo kein Layout greift. **Jede der 43 Deklarationen dieses Plans trägt
ihren Riegel selbst** — 42-mal `requireLagerbuchAdmin()`, einmal (`bucheEntnahmeHelfer`)
`requireHelferSchreibend(db)`. Der Scan dazu ist `_actions/guards.test.ts` (Teil 2, T20).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const VERW = "src/app/m/lagerbuch/verwaltung";
const LAYOUT = `${VERW}/(arbeit)/layout.tsx`;

/**
 * QUELLTEXT-SCAN STATT RENDERING. Ein Layout, das `headers()` und `auth()`
 * ruft, laeszt sich in jsdom nicht sinnvoll ausfuehren — und der Beweis, dass
 * die Riegel WIRKEN, ist ohnehin ein Abruf (T151, Schritt 5) und kein Test.
 * Was diese Datei besitzt, ist die BAUFORM: dass beide Riegel dastehen, in der
 * richtigen Reihenfolge, mit dem richtigen Praedikat, und dass die verbotenen
 * Abkuerzungen nicht vorkommen.
 */
describe("verwaltung/(arbeit)/layout.tsx", () => {
  const quelle = () => readFileSync(LAYOUT, "utf8");

  it("existiert", () => {
    expect(existsSync(LAYOUT)).toBe(true);
  });

  it("ruft BEIDE Riegel — Host und Person", () => {
    expect(quelle()).toMatch(/requireLagerbuchHost\(/);
    expect(quelle()).toMatch(/requireLagerbuchAdmin\(/);
  });

  it("ruft den Host-Riegel ZUERST", () => {
    // Andernfalls schickte ein anonymer Aufruf auf dem falschen Host erst in
    // den Login und antwortete dann mit 404 — der Login waere eine Sackgasse,
    // und die Rollentrennung haette einen Umweg, der die Existenz des Pfades
    // verraet.
    const q = quelle();
    expect(q.indexOf("requireLagerbuchHost(")).toBeLessThan(q.indexOf("requireLagerbuchAdmin("));
  });

  it("benutzt KEINE der verbotenen Abkuerzungen", () => {
    // Der Suite-Admin bekommt keine Lagerbuch-Rechte (Betreiber-Entscheidung
    // 3, §2.5, §3.6.1).
    const q = quelle();
    for (const verboten of [
      "isModuleAdmin",
      "canAdminModule",
      "requireModuleAdmin",
      "moduleAdminPageOrNotFound",
      "user.isAdmin",
    ]) {
      expect(q, `verbotene Abkuerzung: ${verboten}`).not.toMatch(new RegExp(verboten));
    }
  });

  it("ruft `auth()` NICHT selbst — ein Praedikat, ein Viewer", () => {
    // Oberflaeche und Riegel muessen dasselbe Praedikat auf denselben Viewer
    // anwenden (§3.6.3, docs/design/README.md:240-242). Ein zweiter
    // auth()-Aufruf liefe im Verzugsfenster veralteter JWT-Gruppen
    // auseinander.
    expect(quelle()).not.toMatch(/\bauth\(\)/);
  });

  it("importiert kein Zeichen und kein antd", () => {
    /*
     * DIE TEUERSTE EINZELNE ZEILE DER PORTIERUNG waere hier: der
     * `LogOut`-Import aus lucide-react (`layout.tsx:3` im Bestand). 1:1 auf
     * @ant-design/icons umgeschrieben laege der GESAMTE Verwaltungsbereich bei
     * HTTP 500 — beim Import, nicht beim Rendern. Ein einziger Icon-Import
     * legt alle 23 Arbeitsseiten lahm.
     */
    const q = quelle();
    expect(q).not.toMatch(/@ant-design\/icons/);
    expect(q).not.toMatch(/lucide-react/);
    expect(q).not.toMatch(/from ["']antd["']/);
  });

  it("uebergibt LAGERBUCH_NAV an den Rahmen", () => {
    expect(quelle()).toMatch(/nav=\{LAGERBUCH_NAV\}/);
  });

  it("mountet die Shell NICHT selbst, sondern ueber den Rahmen", () => {
    // Auflage 1 aus §6.15: genau eine Stelle kennt `Shell`.
    const q = quelle();
    expect(q).toMatch(/VerwaltungsRahmen/);
    expect(q).not.toMatch(/from ["'].*core\/shell\/Shell["']/);
  });
});

describe("Die Verzeichnisstruktur von verwaltung/", () => {
  it("es gibt KEIN verwaltung/layout.tsx", () => {
    /*
     * §6.15, Auflage 1 (Festlegung F2 aus Teil 1). Ein `verwaltung/layout.tsx`
     * waere Vorfahr BEIDER Gruppen — auch der Druck-Gruppe, die bewusst keine
     * Shell traegt. `FullShell` bringt `minHeight: 100vh` und den
     * App-Switcher ins Papier (96px-Ueberlauf, Falle 41).
     */
    expect(existsSync(`${VERW}/layout.tsx`)).toBe(false);
  });

  it("es gibt KEIN (arbeit)/etiketten/", () => {
    // §6.15, Auflage 2: die Route liegt in (druck), und beide Pfade loesten
    // auf /verwaltung/etiketten auf — `next build` braeche ab.
    expect(existsSync(`${VERW}/(arbeit)/etiketten`)).toBe(false);
  });

  it("es gibt weder kein-zugriff noch identitaeten", () => {
    // §6.15, Auflage 22 (§11.4, §4.13). Eine Seite, die es gar nicht gibt,
    // kann keinen sichtbaren Weg zu einer Sackgasse tragen.
    expect(existsSync(`${VERW}/kein-zugriff`)).toBe(false);
    expect(existsSync(`${VERW}/identitaeten`)).toBe(false);
    expect(existsSync(`${VERW}/(arbeit)/kein-zugriff`)).toBe(false);
  });

  it("unter verwaltung/ liegen nur Route-Groups, keine losen Seiten", () => {
    // Eine `verwaltung/page.tsx` neben `(arbeit)/page.tsx` loeste zweimal auf
    // /m/lagerbuch/verwaltung auf, und `next build` braeche ab.
    const eintraege = readdirSync(VERW);
    expect(eintraege.filter((e) => e.endsWith(".tsx"))).toEqual([]);
    for (const e of eintraege) expect(e, `unerwarteter Eintrag: ${e}`).toMatch(/^\(/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/layout.test.ts"
```

Erwartet: FAIL mit `expected false to be true` im Fall „existiert" — `existsSync(LAYOUT)`
liefert `false`, weil `verwaltung/(arbeit)/layout.tsx` noch nicht angelegt ist. Die vier
folgenden Fälle werfen im selben Lauf `ENOENT: no such file or directory, open
`'src/app/m/lagerbuch/verwaltung/(arbeit)/layout.tsx'`, weil `quelle()` sie zu lesen versucht.

- [ ] **Schritt 3: Das Layout schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/layout.tsx`:

```tsx
import { headers } from "next/headers";
import { requireLagerbuchHost } from "../../_lib/host";
import { requireLagerbuchAdmin } from "../../_lib/zugang";
import { LAGERBUCH_NAV } from "../../_lib/nav";
import { VerwaltungsRahmen } from "../../_ui/VerwaltungsRahmen";

/**
 * DAS LAYOUT DER 23 ARBEITSSEITEN — ZWEI RIEGEL UND EIN RAHMEN.
 *
 * Von den 37 Zeilen des Bestands (`verwaltung/(admin)/layout.tsx`) bleiben
 * rund zehn: Wortmarke, Modulwechsler, „Angemeldet als" und das
 * Abmelde-Formular liefert `SuiteHeader`, die 218px-Seitenleiste ersetzt
 * `Shell nav={…}`.
 *
 * ⚠️ DIESE DATEI IMPORTIERT KEIN EINZIGES ZEICHEN. Der `LogOut`-Import aus
 * lucide-react (`layout.tsx:3`) ist die teuerste einzelne Zeile der
 * Portierung: 1:1 auf `@ant-design/icons` umgeschrieben laege der GESAMTE
 * Verwaltungsbereich bei HTTP 500 — beim IMPORT, nicht beim Rendern
 * (`core/shell/icons.ts:35-43`, gemessen). Ein einziger Icon-Import hier legt
 * alle 23 Arbeitsseiten lahm. Der modul-eigene Abmeldeknopf entfaellt
 * ersatzlos (§6.4.10).
 *
 * ZWEI RIEGEL, ZWEI VERSCHIEDENE FRAGEN — und die Reihenfolge ist nicht
 * beliebig:
 *
 * 1. `requireLagerbuchHost(await headers())` — „ist das der richtige HOST?"
 *    `decideRoute` gatet interne Pfade nach dem Modul aus dem SEGMENT, nicht
 *    nach dem Host, und fuer ein Modul mit `requiresAuth: false` steigt
 *    `canAccess` sofort mit `true` aus. Ohne diese Zeile beantwortete JEDER
 *    Host, der auf den Suite-Container terminiert, `/m/lagerbuch/verwaltung/*`
 *    (§2.6, Falle 61).
 * 2. `await requireLagerbuchAdmin()` — „darf DIESE Person das Modul
 *    verwalten?" `requiresAuth: false` ist zwingend (`/t/<code>` erzeugt die
 *    Sitzung erst), und `canAccess` liest `requiredGroups` deshalb NIE
 *    (`core/registry.ts:155`). DIE MIDDLEWARE GATET HIER ALSO NICHT — ohne
 *    diese Zeile waere die Verwaltung fuer jeden Eingeloggten offen.
 *
 * ERST DER HOST, DANN DIE PERSON. Andernfalls schickte ein anonymer Aufruf auf
 * dem FALSCHEN Host erst in den Login und antwortete dann mit 404 — der Login
 * waere eine Sackgasse, und die Rollentrennung haette einen Umweg, der die
 * Existenz des Pfades verraet.
 *
 * EIN PRAEDIKAT, ZWEI AUFRUFER (§3.6.3, §6.15 Auflage 4): dieselbe Funktion
 * `requireLagerbuchAdmin` steht auch in `verwaltung/(druck)/layout.tsx`
 * (Teil 6) — keine zweite Abschrift, kein `isModuleAdmin`, kein
 * `session.user.isAdmin` (der Suite-Admin bekommt keine Lagerbuch-Rechte,
 * Betreiber-Entscheidung 3), und KEIN zweiter `auth()`-Aufruf: zwei Quellen
 * liefen im Verzugsfenster veralteter JWT-Gruppen auseinander.
 *
 * ⚠️ FAELLT `requireLagerbuchAdmin` AUS DEM DRUCK-LAYOUT, SIND DIE GEDRUCKTEN
 * ZUGANGS-CODES IM KLARTEXT OEFFENTLICH. Route-Group-Grenzen sind KEINE
 * Sicherheitsgrenzen. Genau diese Luecke ist im Zielrepo schon einmal
 * aufgetreten und dort ausgeschrieben
 * (`m/files/_ui/zugangslinks.module.css:11-16`). Die einzige Zusicherung
 * darueber ist ein Abruf, kein Test (T151, Schritt 5).
 *
 * ⚠️ KEINE SERVER ACTION VERLAESST SICH AUF DIESES LAYOUT. Eine Seiten- oder
 * Layout-Pruefung erstreckt sich nicht auf die Actions darunter: Action-IDs
 * sind GLOBAL, eine Verwaltungs-Action laeszt sich jederzeit gegen `/` posten,
 * wo kein Layout greift. Jede der 43 Deklarationen dieses Plans traegt ihren
 * Riegel selbst — 42-mal `requireLagerbuchAdmin()`, einmal
 * (`bucheEntnahmeHelfer`) `requireHelferSchreibend(db)`;
 * `_actions/guards.test.ts` (Teil 2) haelt das fest.
 */
export default async function LagerbuchArbeitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  requireLagerbuchHost(await headers());
  await requireLagerbuchAdmin();

  return <VerwaltungsRahmen nav={LAGERBUCH_NAV}>{children}</VerwaltungsRahmen>;
}
```

- [ ] **Schritt 4: Eine Wegwerf-Seite anlegen, damit die Route existiert**

Ohne mindestens eine `page.tsx` erzeugt Next.js für die Group keine Route, und der Abruf in Schritt 4
liefe ins Leere. Die Seite wird in **T128 ersetzt**, nicht gelöscht:

```tsx
// src/app/m/lagerbuch/verwaltung/(arbeit)/page.tsx — WIRD IN T128 ERSETZT.
import { SeitenKopf } from "../../_ui/SeitenKopf";

export const dynamic = "force-dynamic";

export default function VerwaltungUebersicht() {
  return <SeitenKopf titel="Übersicht" beschreibung="Kennzahlen folgen in T128." />;
}
```

⚠️ **Das ist der einzige Platzhalter dieses Plans, und er hat einen benannten Einlöser: T128.** Er
steht hier, weil ein Layout ohne Route weder gebaut noch abgerufen werden kann — und ein Abruf ist die
einzige Zusicherung, die die beiden Riegel und den `.modul`-Träger überhaupt prüft.

- [ ] **Schritt 5: Den echten Abruf fahren — beide Riegel, beide Richtungen**

```bash
pnpm dev &
sleep 8
# 1. Richtiger Host, ohne Sitzung -> 404 (notFound), NICHT 403
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Host: lagerbuch.localtest.me" http://localhost:3000/verwaltung
# 2. Falscher Host -> 404
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Host: feedback.localtest.me" http://localhost:3000/m/lagerbuch/verwaltung
# 3. Mit devLogin und Lagerbuch-Gruppe -> 200, und die Modulnavigation ist da
curl -s -b "$(pnpm exec tsx scripts/devlogin-cookie.ts lagerbuch_nutzer)" \
  -H "Host: lagerbuch.localtest.me" http://localhost:3000/verwaltung \
  | grep -c 'data-testid="modulnav"'
kill %1
```

Erwartet: `404`, `404`, `1`.
⚠️ **Schritt 3 ist der eigentliche Beweis dieses Tasks** — er zeigt, dass weder ein Compound-Zugriff
noch ein Icon-Import noch ein Client-Wert die Seite zerlegt hat. **Kein Gate sieht das** (§12.4).
⚠️ **Der Aufbau von `devlogin-cookie.ts` gehört Teil 2/Teil 3** (`e2e/helpers/lagerbuch.ts`, T59).
Existiert das Skript nicht, ersetzt der Playwright-Lauf aus T150 diesen Teilschritt; die beiden
404-Abrufe bleiben.

- [ ] **Schritt 6: Die Verzeichnis-Zusicherungen bestätigen**

```bash
ls src/app/m/lagerbuch/verwaltung/
```

Erwartet: **nur** `(arbeit)`. Kein `layout.tsx`, kein `page.tsx`, kein `kein-zugriff`, kein
`identitaeten`. `(druck)` kommt mit Teil 6 dazu.

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/layout.test.ts"
```

**Grün.**

- [ ] **Schritt 7: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/layout.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/layout.test.ts" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/page.tsx"
rtk git commit -m "feat(lagerbuch): verwaltung/(arbeit)/layout.tsx — zwei Riegel, ein Praedikat

Erst der Host (requireLagerbuchHost), dann die Person
(requireLagerbuchAdmin). Die Reihenfolge ist nicht beliebig: umgekehrt
schickte ein anonymer Aufruf auf dem falschen Host erst in den Login und
antwortete dann mit 404 — der Login waere eine Sackgasse.

Die Middleware gatet hier NICHT: lagerbuch ist requiresAuth: false (zwingend,
/t/<code> erzeugt die Sitzung erst), und canAccess steigt fuer solche Module
sofort mit true aus, ohne requiredGroups je zu lesen.

KEIN Zeichen-Import in dieser Datei. Der LogOut-Import aus lucide-react ist
die teuerste Zeile der Portierung: 1:1 auf @ant-design/icons umgeschrieben
laege der gesamte Verwaltungsbereich bei HTTP 500 — beim Import, nicht beim
Rendern. Ein Icon hier legt alle 23 Arbeitsseiten lahm.

Kein verwaltung/layout.tsx (waere Vorfahr auch der Druck-Gruppe, 96px-Ueberlauf
ins Papier), kein (arbeit)/etiketten (Pfadkollision), kein kein-zugriff und
kein identitaeten.

Abruf gefahren: 404 ohne Sitzung, 404 auf fremdem Host, 200 mit Gruppe und
sichtbarer Modulnavigation.

verwaltung/(arbeit)/page.tsx ist eine Wegwerf-Seite und wird in T128 ersetzt —
ohne sie erzeugt Next fuer die Group keine Route, und der Abruf liefe ins
Leere."
```

---

### Gate nach Welle 3

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build && pnpm exec playwright test
```

**Ab hier ist Playwright fällig** — es existiert die erste Route dieses Plans.

---

## Welle 4 — Die fünfzehn Action-Dateien (14 Tasks, alle parallel)

⚠️ **Fünfzehn Dateien, aber nur vierzehn Tasks:** **T125 legt zwei** an (`_actions/csv.ts` und
`_actions/detail.ts`). Wer Dateien an Tasks abzählt, kommt auf 14 und bricht damit die Guard-Zählung
(Teil 6 §4.2).

Keine dieser Dateien importiert eine andere; jede hängt nur an Teil 2 (`requireLagerbuchAdmin`) und
Teil 3 (Lese- und Schreibpfade). **Die `revalidatePath`-Listen stehen in §3 dieses Plans** und werden
je Task **wörtlich** übernommen — nicht neu abgeleitet.

**Fünf Regeln, die für alle fünfzehn gelten und deshalb hier und nicht fünfzehnmal stehen:**

1. **Jede Datei beginnt mit `"use server";`.** In einer solchen Datei ist **jeder Export eine Server
   Action** — deshalb liegen Typen und Konstanten in `_lib/`, nie hier.
2. **Jede exportierte Action beginnt mit einem Riegel**, vor jeder Validierung und vor jedem
   Datenbankzugriff — **42 der 43 Deklarationen** mit `await requireLagerbuchAdmin();`.
   ⚠️ **Die einzige Ausnahme ist `bucheEntnahmeHelfer` in `_actions/buchung.ts` (T114, H7)**: sie
   beginnt mit `await requireHelferSchreibend(db)`, weil ihr Aufrufer der Helfer-Weg ist und dort
   gar keine OIDC-Sitzung existiert. Sie ist **bewacht, nicht ausgenommen** — die drei echten
   Ausnahmen des Moduls liegen alle in Teil 4. `_actions/guards.test.ts` (Teil 2, T20) hält das fest.
3. **Eingaben werden mit Zod validiert**, und der Parser läuft **nach** dem Riegel: eine
   Fehlermeldung über ein ungültiges Feld ist eine Auskunft, die eine unberechtigte Person nicht
   bekommen soll.
4. **Fehler kommen als RÜCKGABEWERT zurück, nie als Wurf** (§11.2 (d), §6.15 Auflage 20). Der Bestand
   hat **22 ungefangene** Aufrufstellen, **19 davon in der Verwaltung** — der Umbau ist der Anlass,
   sie zu schließen. ⚠️ **`e.message` ist in Produktion der englische Satz** (Falle 66): Next
   ersetzt Fehlermeldungen aus Server Actions durch „An error occurred in the Server Components
   render". Ein `catch (e) { setFehler(e.message) }` zeigt der Verwaltenden also **englischen
   Framework-Text** statt „Noch mit 12 Buchungen verknüpft".
5. **Der zweite Parameter ist immer `db: DB = getDb()`.** Das ist die Naht, an der die Tests eine
   migrierte Test-DB einsetzen (`migrierteTestDb()`, Teil 1 T9) — dieselbe Bauform wie im Bestand.

**Der gemeinsame Rückgabetyp**, damit fünfzehn Dateien nicht fünfzehn Formen erfinden. Er entsteht in
**T113** und wird von den übrigen dreizehn Tasks (vierzehn Dateien) importiert:

```ts
// _lib/actionErgebnis.ts (T113) — KEIN "use server", KEIN "use client".
export type FeldFehler = Record<string, string>;
export type ActionErgebnis<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { wert: T }))
  | { ok: false; fehler: string; feldFehler?: FeldFehler };
export function zodFehler(e: unknown): FeldFehler | null;
```

---

### Task 113: `_actions/artikel.ts` und `_lib/actionErgebnis.ts`

> ⚠️ **`_lib/actionErgebnis.ts` IST BEREITS GEBAUT UND EINGECHECKT** (Teil 4, Commit `6b48c8e`,
> zusammen mit `_actions/buchung.ts` aus T114). Dieser Task hat sein Bündel damit **aufgetrennt**:
> die Typdatei ist vorgezogen, `_actions/artikel.ts` und `artikel.test.ts` sind es **nicht**.
> **Lege `_lib/actionErgebnis.ts` NICHT noch einmal an** — lies sie, prüfe sie gegen die
> „Produces"-Signatur unten, und wenn sie passt, überspringe Schritt 3 und nimm sie nicht in den
> `git add`-Block von Schritt 6 auf. Es gibt genau **eine** `_lib/actionErgebnis.ts`.
>
> Warum der Vermerk hier steht: T114 trägt ihn seit jeher (unten, „Reihenfolge"), T113 trug ihn
> nicht — und auf diesem Weg lief in Teil 4 bereits **T83 BLOCKED**, weil eine vorgezogene Datei
> fehlte, von der der Plan nichts sagte. Die Asymmetrie ist der Defekt, nicht das Vorziehen.

**Files:**
- ~~Create: `src/app/m/lagerbuch/_lib/actionErgebnis.ts`~~ — **erledigt in Teil 4** (`6b48c8e`)
- Create: `src/app/m/lagerbuch/_actions/artikel.ts`
- Test: `src/app/m/lagerbuch/_actions/artikel.test.ts`

**Interfaces:**
- Consumes: `_lib/zugang.ts` (Teil 2, T23) — `requireLagerbuchAdmin`; `_db/client.ts` (Teil 1, T12) —
  `getDb`, `type DB`; `_db/schema.ts` (Teil 1, T7) — `artikel`, `newId`; `zod`; `next/cache` —
  `revalidatePath`.
- Produces:
  ```ts
  // _lib/actionErgebnis.ts
  export type FeldFehler = Record<string, string>;
  export type ActionErgebnis<T = undefined> =
    | ({ ok: true } & (T extends undefined ? object : { wert: T }))
    | { ok: false; fehler: string; feldFehler?: FeldFehler };
  export function zodFehler(e: unknown): FeldFehler | null;

  // _actions/artikel.ts — "use server"
  export async function createArtikel(
    eingabe: unknown, db?: DB): Promise<ActionErgebnis<{ id: string }>>;
  export async function updateArtikel(
    id: string, eingabe: unknown, db?: DB): Promise<ActionErgebnis>;
  export async function setArtikelAktiv(
    eingabe: unknown, db?: DB): Promise<ActionErgebnis>;
  ```
  Konsumenten: `NeuArtikel.tsx` (T129), `_ui/ArtikelDrawer.tsx` (T127).
- ⚠️ **`_lib/actionErgebnis.ts` wird von ALLEN dreizehn übrigen Action-Tasks importiert.** Sie
  entsteht **hier**, weil T113 der kleinste Action-Task ist und die Datei damit den kürzesten Weg zu
  ihrem ersten Verwender hat.

**`revalidatePath`-Liste** (aus §3, wörtlich):

| Action | Pfade (innere Form) |
|---|---|
| `createArtikel` | `/m/lagerbuch/verwaltung/artikel` |
| `updateArtikel` | `/m/lagerbuch/verwaltung/artikel` |
| `setArtikelAktiv` | `/m/lagerbuch/verwaltung/artikel` · `/m/lagerbuch/verwaltung` |

⚠️ **`setArtikelAktiv` revalidiert zusätzlich die Übersicht, `createArtikel` nicht** — das ist kein
Versehen des Bestands, sondern richtig: die Kennzahl „Artikel unter Mindestbestand" ändert sich, wenn
ein Artikel inaktiv wird, aber ein **neuer** Artikel hat noch keinen Bestand und keine Buchung.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_actions/artikel.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel } from "../_db/schema";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: ["lagerbuch_nutzer"], name: "A", email: null }),
}));

import { createArtikel, updateArtikel, setArtikelAktiv } from "./artikel";

let t: TestDb;
beforeEach(() => { t = migrierteTestDb("lagerbuch-actions-artikel-"); revalidiert.length = 0; });
afterEach(() => { t.schliessen(); });

describe("createArtikel", () => {
  it("legt einen Artikel an und liefert seine Kennung", async () => {
    const erg = await createArtikel(
      { name: "Kompressen steril", einheit: "Stk", fach: "A1", mindestbestand: 20 }, t.db);
    expect(erg.ok).toBe(true);
    const id = (erg as { ok: true; wert: { id: string } }).wert.id;
    const zeile = t.db.select().from(artikel).where(eq(artikel.id, id)).get();
    expect(zeile?.name).toBe("Kompressen steril");
    expect(zeile?.aktiv).toBe(true);
  });

  it("revalidiert genau die Artikelliste, in INNERER Pfadform", () => {
    // Alle 61 Bestandsaufrufe uebergeben die aeuszere Form; im Zielmodul liegt
    // jede Route unter /m/lagerbuch.
    return createArtikel({ name: "X", einheit: "Stk", fach: "A", mindestbestand: 1 }, t.db)
      .then(() => { expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/artikel"]); });
  });

  it("meldet einen leeren Namen als FELDFEHLER, nicht als Wurf", async () => {
    const erg = await createArtikel({ name: "  ", einheit: "Stk", fach: "A", mindestbestand: 1 }, t.db);
    expect(erg.ok).toBe(false);
    expect((erg as { ok: false; feldFehler?: Record<string, string> }).feldFehler)
      .toHaveProperty("name");
    expect(revalidiert).toEqual([]);
  });

  it("meldet einen negativen Mindestbestand am Feld", async () => {
    const erg = await createArtikel({ name: "X", einheit: "Stk", fach: "A", mindestbestand: -1 }, t.db);
    expect((erg as { ok: false; feldFehler?: Record<string, string> }).feldFehler)
      .toHaveProperty("mindestbestand");
  });

  it("schneidet Leerraum ab", async () => {
    const erg = await createArtikel(
      { name: "  Mull  ", einheit: " Stk ", fach: " B2 ", mindestbestand: 3 }, t.db);
    const id = (erg as { ok: true; wert: { id: string } }).wert.id;
    const zeile = t.db.select().from(artikel).where(eq(artikel.id, id)).get();
    expect(zeile?.name).toBe("Mull");
    expect(zeile?.fach).toBe("B2");
  });
});

describe("updateArtikel", () => {
  it("aendert Mindestbestand, Fach und Einheit", async () => {
    const neu = await createArtikel({ name: "X", einheit: "Stk", fach: "A", mindestbestand: 1 }, t.db);
    const id = (neu as { ok: true; wert: { id: string } }).wert.id;
    revalidiert.length = 0;
    const erg = await updateArtikel(id, { mindestbestand: 42, fach: "C3", einheit: "Pkg" }, t.db);
    expect(erg.ok).toBe(true);
    const zeile = t.db.select().from(artikel).where(eq(artikel.id, id)).get();
    expect(zeile).toMatchObject({ mindestbestand: 42, fach: "C3", einheit: "Pkg" });
    expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/artikel"]);
  });

  it("laeszt nicht uebergebene Felder unberuehrt", async () => {
    const neu = await createArtikel({ name: "X", einheit: "Stk", fach: "A", mindestbestand: 7 }, t.db);
    const id = (neu as { ok: true; wert: { id: string } }).wert.id;
    await updateArtikel(id, { fach: "D4" }, t.db);
    const zeile = t.db.select().from(artikel).where(eq(artikel.id, id)).get();
    expect(zeile?.mindestbestand).toBe(7);
    expect(zeile?.name).toBe("X");
  });
});

describe("setArtikelAktiv", () => {
  it("schaltet inaktiv und revalidiert ZUSAETZLICH die Uebersicht", async () => {
    const neu = await createArtikel({ name: "X", einheit: "Stk", fach: "A", mindestbestand: 1 }, t.db);
    const id = (neu as { ok: true; wert: { id: string } }).wert.id;
    revalidiert.length = 0;
    await setArtikelAktiv({ id, aktiv: false }, t.db);
    const zeile = t.db.select().from(artikel).where(eq(artikel.id, id)).get();
    expect(zeile?.aktiv).toBe(false);
    // Die Kennzahl „Artikel unter Mindestbestand" aendert sich — bei
    // createArtikel nicht, denn ein neuer Artikel hat noch keinen Bestand.
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/artikel",
      "/m/lagerbuch/verwaltung",
    ]);
  });
});

describe("Der Riegel steht vor der Validierung", () => {
  it("jede Action ruft requireLagerbuchAdmin als erste Anweisung", async () => {
    const { readFileSync } = await import("node:fs");
    const quelle = readFileSync("src/app/m/lagerbuch/_actions/artikel.ts", "utf8");
    for (const rumpf of quelle.split(/export async function /).slice(1)) {
      const ersteZeile = rumpf.split("{")[1]?.split("\n").find((z) => z.trim().length > 0) ?? "";
      // Eine Fehlermeldung ueber ein ungueltiges Feld ist eine Auskunft, die
      // eine unberechtigte Person nicht bekommen soll.
      expect(ersteZeile).toMatch(/requireLagerbuchAdmin\(\)/);
    }
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/artikel.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./artikel"`.

- [ ] **Schritt 3: `_lib/actionErgebnis.ts` schreiben** — ⚠️ **ENTFÄLLT, die Datei steht seit Teil 4
  (`6b48c8e`).** Nur gegen den Abdruck unten lesen, nicht überschreiben (siehe Vermerk am Kopf des
  Tasks).

```ts
import { ZodError } from "zod";

/**
 * DER GEMEINSAME RUECKGABETYP ALLER VERWALTUNGS-ACTIONS.
 *
 * WARUM RUECKGABEWERT UND NICHT WURF (§11.2 (d), §6.15 Auflage 20): der
 * Bestand hat 22 ungefangene Action-Aufrufstellen, 19 davon in der
 * Verwaltung. Sie liegen alle in Bausteinen, die dieses Vorhaben anfaszt — der
 * Umbau ist also der Anlass, sie zu schlieszen, und kein Nachtrag danach.
 *
 * ⚠️ UND DIE ZWOELF GEFANGENEN STELLEN WERDEN EBENFALLS UMGESTELLT:
 * `e.message` ist in Produktion NICHT der deutsche Satz aus der Action,
 * sondern „An error occurred in the Server Components render…" (Falle 66).
 * Next ersetzt Fehlermeldungen aus Server Actions im Produktionsbau durch
 * einen generischen englischen Text — ein `catch (e) { setFehler(e.message) }`
 * sieht in der Entwicklung richtig aus und zeigt der Verwaltenden im Betrieb
 * Framework-Englisch statt „Noch mit 12 Buchungen verknuepft".
 *
 * KEIN "use server" auf dieser Datei: dort waere jeder Export eine Action, und
 * ein exportierter TYP ist dort ein Fehler, den erst die Laufzeit meldet.
 * KEIN "use client": Server Actions lesen sie.
 */
export type FeldFehler = Record<string, string>;

export type ActionErgebnis<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { wert: T }))
  | { ok: false; fehler: string; feldFehler?: FeldFehler };

/**
 * Uebersetzt einen `ZodError` in eine Feldkarte, damit die Insel den Text am
 * FELD anzeigen kann statt in einem Kasten daneben. Der erste Fehler je Feld
 * gewinnt: zwei Meldungen an einem Eingabefeld sind eine mehr, als jemand
 * lesen wird.
 *
 * Liefert `null`, wenn `e` kein `ZodError` ist — der Aufrufer entscheidet dann
 * auf einen allgemeinen Fehler.
 */
export function zodFehler(e: unknown): FeldFehler | null {
  if (!(e instanceof ZodError)) return null;
  const karte: FeldFehler = {};
  for (const problem of e.issues) {
    const feld = problem.path.join(".") || "_";
    if (!(feld in karte)) karte[feld] = problem.message;
  }
  return karte;
}
```

- [ ] **Schritt 4: `_actions/artikel.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { artikel, newId } from "../_db/schema";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";

/**
 * DIE STAMMDATEN-ACTIONS DES ARTIKELS.
 *
 * Jede beginnt mit `await requireLagerbuchAdmin()` — VOR der Validierung: eine
 * Fehlermeldung ueber ein ungueltiges Feld ist eine Auskunft, die eine
 * unberechtigte Person nicht bekommen soll. Eine Layout-Pruefung deckt das
 * NICHT ab: Action-IDs sind global, und eine Verwaltungs-Action laeszt sich
 * gegen `/` posten, wo kein Layout greift.
 *
 * ⚠️ Die `revalidatePath`-Pfade tragen die INNERE Form
 * (`/m/lagerbuch/verwaltung/artikel`). Alle 61 Bestandsaufrufe uebergeben die
 * aeuszere; im Zielmodul liegt jede Route unter `/m/lagerbuch/`, und ein
 * aeuszerer Pfad revalidierte still nichts.
 */

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  einheit: z.string().trim().min(1, "Einheit darf nicht leer sein"),
  fach: z.string().trim().min(1, "Fach darf nicht leer sein"),
  mindestbestand: z.coerce.number().int().min(0, "Mindestbestand darf nicht negativ sein"),
});

export async function createArtikel(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof CreateSchema>;
  try {
    v = CreateSchema.parse(eingabe);
  } catch (e) {
    const feldFehler = zodFehler(e);
    return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
  }
  const id = newId();
  db.insert(artikel)
    .values({
      id,
      name: v.name,
      einheit: v.einheit,
      fach: v.fach,
      mindestbestand: v.mindestbestand,
      aktiv: true,
      createdAt: new Date(),
    })
    .run();
  // NUR die Artikelliste: ein neuer Artikel hat weder Bestand noch Buchung,
  // die Kennzahlen der Uebersicht aendern sich also nicht.
  revalidatePath("/m/lagerbuch/verwaltung/artikel");
  return { ok: true, wert: { id } };
}

const UpdateSchema = z.object({
  mindestbestand: z.coerce.number().int().min(0, "Mindestbestand darf nicht negativ sein").optional(),
  fach: z.string().trim().min(1, "Fach darf nicht leer sein").optional(),
  einheit: z.string().trim().min(1, "Einheit darf nicht leer sein").optional(),
});

/**
 * Die drei auto-committenden Felder des `ArtikelDrawer` (Mindestbestand mit
 * 400 ms Verzoegerung, Fach und Einheit auf `onBlur`). Alle drei sind
 * OPTIONAL: die Insel schickt genau das Feld, das sich geaendert hat — sonst
 * ueberschriebe ein spaeter eintreffender Mindestbestand-Commit ein
 * zwischenzeitlich geaendertes Fach mit dem alten Wert.
 */
export async function updateArtikel(
  id: string,
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof UpdateSchema>;
  try {
    v = UpdateSchema.parse(eingabe);
  } catch (e) {
    const feldFehler = zodFehler(e);
    return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
  }
  const aenderung: Partial<typeof artikel.$inferInsert> = {};
  if (v.mindestbestand !== undefined) aenderung.mindestbestand = v.mindestbestand;
  if (v.fach !== undefined) aenderung.fach = v.fach;
  if (v.einheit !== undefined) aenderung.einheit = v.einheit;
  if (Object.keys(aenderung).length === 0) return { ok: true };
  db.update(artikel).set(aenderung).where(eq(artikel.id, id)).run();
  revalidatePath("/m/lagerbuch/verwaltung/artikel");
  return { ok: true };
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });

export async function setArtikelAktiv(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof AktivSchema>;
  try {
    v = AktivSchema.parse(eingabe);
  } catch {
    return { ok: false, fehler: "Ungültige Eingabe." };
  }
  db.update(artikel).set({ aktiv: v.aktiv }).where(eq(artikel.id, v.id)).run();
  revalidatePath("/m/lagerbuch/verwaltung/artikel");
  // ZUSAETZLICH die Uebersicht: die Kennzahl „Artikel unter Mindestbestand"
  // zaehlt nur aktive Artikel, aendert sich also mit diesem Schalter.
  revalidatePath("/m/lagerbuch/verwaltung");
  return { ok: true };
}
```

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/artikel.test.ts
```

**Grün.**

- [ ] **Schritt 5: Den Guard-Scan aus Teil 2 laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/guards.test.ts
```

Erwartet: grün — **drei** bewachte Actions mehr, keine ungeschützte. ⚠️ Der Scan zählt noch **nicht**
(die Zählung ist Teil 6); er prüft die **Eigenschaft**.

- [ ] **Schritt 6: Commit**

```bash
# ⚠️ `_lib/actionErgebnis.ts` steht seit Teil 4 (6b48c8e) und gehoert NICHT in diesen add-Block.
rtk git add src/app/m/lagerbuch/_actions/artikel.ts \
            src/app/m/lagerbuch/_actions/artikel.test.ts
rtk git commit -m "feat(lagerbuch): _actions/artikel.ts und der gemeinsame Rueckgabetyp

ActionErgebnis<T> mit { ok:false, fehler, feldFehler } statt eines Wurfs: der
Bestand hat 22 ungefangene Aufrufstellen, 19 in der Verwaltung. Und die zwoelf
gefangenen werden ebenfalls umgestellt — e.message ist in Produktion nicht der
deutsche Satz aus der Action, sondern Framework-Englisch (Falle 66).

Der Riegel steht VOR der Validierung: eine Fehlermeldung ueber ein ungueltiges
Feld ist eine Auskunft, die eine unberechtigte Person nicht bekommen soll.

revalidatePath in INNERER Pfadform. setArtikelAktiv revalidiert zusaetzlich
die Uebersicht (die Kennzahl 'unter Mindestbestand' zaehlt nur aktive),
createArtikel nicht — ein neuer Artikel hat weder Bestand noch Buchung.

updateArtikel nimmt alle drei Felder OPTIONAL: die Insel schickt genau das
geaenderte, sonst ueberschriebe ein spaet eintreffender
Mindestbestand-Commit ein zwischenzeitlich geaendertes Fach."
```

---

### Task 114: `_actions/buchung.ts` — drei Buchungswege, einer davon für Teil 4

**Files:**
- Create: `src/app/m/lagerbuch/_actions/buchung.ts`
- Test: `src/app/m/lagerbuch/_actions/buchung.test.ts`

**Interfaces:**
- Consumes: `_lib/zugang.ts` (Teil 2) — `requireLagerbuchAdmin`; `_lib/helferZugang.ts` (Teil 2, T25)
  — `requireHelferSchreibend(db): Promise<{ok:true;zugang}|{ok:false;grund}>`; `_lib/schreibpfade/
  abbuchung.ts` (Teil 3, T54) — `fefoAbbuchung(tx, {…}): { gebucht: number; teile: Teil[] }`;
  `_lib/schreibpfade/umlagerung.ts` (Teil 3, T57) — `umlagerung(tx, {…}): { umgelagert: number }`;
  `_lib/konstanten.ts` (Teil 1, T4) — `HANDLAGER_ID`, `MONAT_REGEX`; `_db/schema.ts` — `artikel`,
  `buchungen`, `chargen`, `lagerorte`, `newId`; `_lib/actionErgebnis.ts` (T113).
- Produces:
  ```ts
  export async function bucheZugang(eingabe: unknown, db?: DB): Promise<ActionErgebnis>;
  export async function bucheEntnahme(
    eingabe: unknown, db?: DB): Promise<ActionErgebnis<{ gebucht: number }>>;
  // ⚠️ NICHT ActionErgebnis — die dritte bedient den Helfer-Weg und traegt deshalb
  // HelferErgebnis mit `grund` und fertigem `text` (Auflage A1 aus Teil 4, §6.3).
  export async function bucheEntnahmeHelfer(
    eingabe: unknown, db?: DB): Promise<HelferErgebnis<{ gebucht: number }>>;
  ```
  Konsumenten: `_ui/ArtikelDrawer.tsx` (T127) für die ersten beiden; **`_ui/Entnahme.tsx`
  (Teil 4, §7.2)** für die dritte.
- ⚠️ **Zusätzliches Consumes für `bucheEntnahmeHelfer`:** `_lib/actionTypen.ts` (Teil 4, T63) —
  `type HelferErgebnis<T>`, `RIEGEL_TEXTE`, `leerText(artikelName)`, `NETZ_TEXT_BUCHUNG`.
  **Die beiden Ergebnistypen sind strukturell unvereinbar** (`ActionErgebnis` trägt im Fehlerzweig
  `fehler`, `HelferErgebnis` trägt `grund` und `text`); wer hier `ActionErgebnis` stehen lässt,
  bekommt in `_ui/Entnahme.tsx` einen Typfehler und in `_ui/CheckFlow.tsx` gar keinen — dort wäre
  der Riegelgrund still weg.
- ⚠️ **Reihenfolge:** dieser Task darf **vorgezogen** werden und vor Welle 7 von Teil 4 laufen — er
  hängt nur an Teil 2 (`requireHelferSchreibend`) und Teil 3 (`fefoAbbuchung`), nicht an Teil 4.
  Läuft er später, ist Teil 4s Gate Stufe 7 an genau einer Importzeile rot, und ein rotes Gate lädt
  dazu ein, eine zweite Datei anzulegen. **Es gibt genau eine `_actions/buchung.ts`** (H7).
- ⚠️ **Festlegung H7: die Datei gehört vollständig Teil 5, auch `bucheEntnahmeHelfer`.** Sie teilt
  sich mit den anderen beiden `fefoAbbuchung` und dieselbe Zod-Basis; zwei Dateien für einen
  Buchungsvorgang wären zwei Orte für dieselbe Invariante. **Teil 4 legt keine zweite Datei an.**

**`revalidatePath`-Listen** (aus §3, wörtlich):

| Action | Pfade (innere Form) |
|---|---|
| `bucheZugang` | `/m/lagerbuch/verwaltung/artikel` · `/m/lagerbuch/verwaltung` |
| `bucheEntnahme` | `/m/lagerbuch/verwaltung/artikel` · `/m/lagerbuch/verwaltung` |
| `bucheEntnahmeHelfer` | `` /m/lagerbuch/a/${artikelId} `` · `/m/lagerbuch/helfer` · `/m/lagerbuch/verwaltung` |

⚠️ **I5 — der Zugang darf keine artikelfremde Charge treffen.** `buchung.ts:33-36` prüft, dass die
übergebene `chargeId` **zu diesem Artikel gehört**; die Prüfung wandert **1:1** mit. Ohne sie erzeugt
eine manipulierte Anfrage „phantom, un-withdrawable Bestand on the target article": die Buchung liegt
auf Artikel A, die Charge auf Artikel B — der Bestand von A steigt, und FEFO findet die Charge nie,
weil sie zu B gehört. **Teil 3 hat diese Invariante ausdrücklich an Teil 5 abgegeben.**

⚠️ **`bestelltAt` wird beim Zugang zurückgesetzt** (`buchung.ts:39`). Das ist die Grundlage der
„Ware offenbar eingetroffen"-Anzeige (§5.5): eine Bestellmarkierung, die einen Zugang überlebt, wäre
nach der Lieferung noch gesetzt und würde die Position dauerhaft als „bestellt" führen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_actions/buchung.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: [], name: null, email: null }),
}));
const helferAntwort = { wert: { ok: true, zugang: { tokenId: "t1", code: "111-111", label: "L", laeuftAb: new Date() } } as
  { ok: true; zugang: { tokenId: string; code: string; label: string; laeuftAb: Date } } |
  { ok: false; grund: "sitzung" | "gesperrt" } };
vi.mock("../_lib/helferZugang", () => ({ requireHelferSchreibend: async () => helferAntwort.wert }));

import { bucheZugang, bucheEntnahme, bucheEntnahmeHelfer } from "./buchung";

let t: TestDb;
function artikelAnlegen(id = newId()) {
  t.db.insert(artikel).values({ id, name: "Mull", einheit: "Stk", fach: "A1",
    mindestbestand: 5, aktiv: true, createdAt: new Date() }).run();
  return id;
}
beforeEach(() => { t = migrierteTestDb("lagerbuch-actions-buchung-"); revalidiert.length = 0; });
afterEach(() => { t.schliessen(); });

describe("bucheZugang", () => {
  it("legt eine neue Charge an und bucht auf das Handlager", async () => {
    const a = artikelAnlegen();
    const erg = await bucheZugang(
      { artikelId: a, menge: 10, neueCharge: { chargenNr: "L42", verfall: "2027-06" } }, t.db);
    expect(erg.ok).toBe(true);
    const b = t.db.select().from(buchungen).all();
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ typ: "zugang", menge: 10, lagerortId: HANDLAGER_ID, quelleTyp: "oidc", quelleId: "u1" });
    expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/artikel", "/m/lagerbuch/verwaltung"]);
  });

  it("I5: lehnt eine Charge ab, die zu einem ANDEREN Artikel gehoert", async () => {
    /*
     * Ohne diese Pruefung entstuende „phantom, un-withdrawable Bestand": die
     * Buchung laege auf Artikel A, die Charge auf Artikel B. Der Bestand von A
     * stiege, und FEFO faende die Charge nie. Teil 3 hat die Invariante
     * ausdruecklich an Teil 5 abgegeben.
     */
    const a = artikelAnlegen();
    const b = artikelAnlegen();
    const fremd = newId();
    t.db.insert(chargen).values({ id: fremd, artikelId: b, chargenNr: "X", verfall: "2027-01", createdAt: new Date() }).run();
    const erg = await bucheZugang({ artikelId: a, menge: 1, chargeId: fremd }, t.db);
    expect(erg.ok).toBe(false);
    expect((erg as { ok: false; fehler: string }).fehler).toMatch(/gehört nicht zu diesem Artikel/);
    expect(t.db.select().from(buchungen).all()).toHaveLength(0);
    expect(revalidiert).toEqual([]);
  });

  it("setzt bestelltAt zurueck — Grundlage von „Ware offenbar eingetroffen\"", async () => {
    const a = artikelAnlegen();
    t.db.update(artikel).set({ bestelltAt: new Date() }).where(eq(artikel.id, a)).run();
    await bucheZugang({ artikelId: a, menge: 1, neueCharge: { chargenNr: "L1", verfall: "2027-01" } }, t.db);
    expect(t.db.select().from(artikel).where(eq(artikel.id, a)).get()?.bestelltAt).toBeNull();
  });

  it("verlangt GENAU eine Chargenangabe", async () => {
    const a = artikelAnlegen();
    for (const eingabe of [
      { artikelId: a, menge: 1 },
      { artikelId: a, menge: 1, chargeId: "x", neueCharge: { chargenNr: "L", verfall: "2027-01" } },
    ]) {
      expect((await bucheZugang(eingabe, t.db)).ok).toBe(false);
    }
  });

  it("lehnt einen Verfall ab, der nicht YYYY-MM ist", async () => {
    const a = artikelAnlegen();
    const erg = await bucheZugang(
      { artikelId: a, menge: 1, neueCharge: { chargenNr: "L", verfall: "06/2027" } }, t.db);
    expect(erg.ok).toBe(false);
  });
});

describe("bucheEntnahme", () => {
  it("bucht ohne Ziel per FEFO aus dem Handlager ab", async () => {
    const a = artikelAnlegen();
    await bucheZugang({ artikelId: a, menge: 10, neueCharge: { chargenNr: "L1", verfall: "2027-01" } }, t.db);
    revalidiert.length = 0;
    const erg = await bucheEntnahme({ artikelId: a, menge: 3, kommentar: "Einsatz" }, t.db);
    expect((erg as { ok: true; wert: { gebucht: number } }).wert.gebucht).toBe(3);
    expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/artikel", "/m/lagerbuch/verwaltung"]);
  });

  it("mit Ziel-Fahrzeug wird daraus eine Umlagerung — netto null", async () => {
    const a = artikelAnlegen();
    const fz = newId();
    t.db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", aktiv: true, createdAt: new Date() }).run();
    await bucheZugang({ artikelId: a, menge: 10, neueCharge: { chargenNr: "L1", verfall: "2027-01" } }, t.db);
    await bucheEntnahme({ artikelId: a, menge: 4, zielLagerortId: fz }, t.db);
    const summe = t.db.select().from(buchungen).all()
      .filter((b) => b.typ === "umlagerung").reduce((s, b) => s + b.menge, 0);
    // Der Verbrauch bleibt am Fahrzeug und sinkt erst beim naechsten Check.
    expect(summe).toBe(0);
  });

  it("lehnt ein inaktives oder fremdes Ziel ab", async () => {
    const a = artikelAnlegen();
    const inaktiv = newId();
    t.db.insert(lagerorte).values({ id: inaktiv, name: "RTW alt", typ: "fahrzeug", aktiv: false, createdAt: new Date() }).run();
    expect((await bucheEntnahme({ artikelId: a, menge: 1, zielLagerortId: inaktiv }, t.db)).ok).toBe(false);
    expect((await bucheEntnahme({ artikelId: a, menge: 1, zielLagerortId: "gibtsnicht" }, t.db)).ok).toBe(false);
  });

  it("das Handlager als Ziel ist KEINE Umlagerung, sondern Verbrauch", async () => {
    const a = artikelAnlegen();
    await bucheZugang({ artikelId: a, menge: 5, neueCharge: { chargenNr: "L1", verfall: "2027-01" } }, t.db);
    await bucheEntnahme({ artikelId: a, menge: 2, zielLagerortId: HANDLAGER_ID }, t.db);
    expect(t.db.select().from(buchungen).all().some((b) => b.typ === "umlagerung")).toBe(false);
  });
});

describe("bucheEntnahmeHelfer", () => {
  it("bucht mit quelleTyp token und dem CODE als quelleId", async () => {
    const a = artikelAnlegen();
    await bucheZugang({ artikelId: a, menge: 5, neueCharge: { chargenNr: "L1", verfall: "2027-01" } }, t.db);
    revalidiert.length = 0;
    const erg = await bucheEntnahmeHelfer({ artikelId: a, menge: 2 }, t.db);
    expect((erg as { ok: true; wert: { gebucht: number } }).wert.gebucht).toBe(2);
    const letzte = t.db.select().from(buchungen).all().at(-1);
    expect(letzte).toMatchObject({ quelleTyp: "token", quelleId: "111-111" });
    expect(revalidiert).toEqual([
      `/m/lagerbuch/a/${a}`,
      "/m/lagerbuch/helfer",
      "/m/lagerbuch/verwaltung",
    ]);
  });

  it("ein gesperrter Code bucht NICHT und meldet den Grund", async () => {
    const a = artikelAnlegen();
    helferAntwort.wert = { ok: false, grund: "gesperrt" };
    const erg = await bucheEntnahmeHelfer({ artikelId: a, menge: 1 }, t.db);
    expect(erg.ok).toBe(false);
    expect((erg as { ok: false; fehler: string }).fehler).toMatch(/gesperrt/i);
    expect(t.db.select().from(buchungen).all()).toHaveLength(0);
    helferAntwort.wert = { ok: true, zugang: { tokenId: "t1", code: "111-111", label: "L", laeuftAb: new Date() } };
  });

  it("ruft NICHT requireLagerbuchAdmin", async () => {
    const { readFileSync } = await import("node:fs");
    const quelle = readFileSync("src/app/m/lagerbuch/_actions/buchung.ts", "utf8");
    const helfer = quelle.slice(quelle.indexOf("export async function bucheEntnahmeHelfer"));
    expect(helfer).toMatch(/requireHelferSchreibend\(/);
    expect(helfer.split("export async function")[0]).not.toMatch(/requireLagerbuchAdmin/);
  });
});
```

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/buchung.test.ts   # rot: Cannot find module './buchung'
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/buchung.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./buchung"`.

- [ ] **Schritt 3: `_actions/buchung.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { artikel, buchungen, chargen, lagerorte, newId } from "../_db/schema";
import { HANDLAGER_ID, MONAT_REGEX } from "../_lib/konstanten";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { requireHelferSchreibend } from "../_lib/helferZugang";
import { fefoAbbuchung } from "../_lib/schreibpfade/abbuchung";
import { umlagerung } from "../_lib/schreibpfade/umlagerung";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";

/**
 * DIE DREI BUCHUNGSWEGE — und warum sie in EINER Datei stehen (H7).
 *
 * `bucheZugang` und `bucheEntnahme` bedienen den `ArtikelDrawer` (Teil 5),
 * `bucheEntnahmeHelfer` bedient `/a/[artikelId]` (Teil 4). Sie teilen sich
 * `fefoAbbuchung` und dieselbe Zod-Basis; zwei Dateien fuer einen
 * Buchungsvorgang waeren zwei Orte fuer dieselbe Invariante. TEIL 4 LEGT KEINE
 * ZWEITE DATEI AN.
 *
 * Der Riegel ist NICHT ueberall derselbe: die ersten beiden rufen
 * `requireLagerbuchAdmin()`, die dritte `requireHelferSchreibend(db)`. Beide
 * stehen als erste Anweisung; `_actions/guards.test.ts` (Teil 2) akzeptiert
 * genau diese zwei Formen.
 */

const ZugangSchema = z
  .object({
    artikelId: z.string().min(1),
    menge: z.coerce.number().int().positive("Menge muss größer als 0 sein"),
    chargeId: z.string().min(1).optional(),
    neueCharge: z
      .object({
        chargenNr: z.string().trim().min(1, "Chargennummer darf nicht leer sein"),
        verfall: z.string().regex(MONAT_REGEX, "Verfall muss YYYY-MM sein"),
      })
      .optional(),
  })
  .refine((v) => Boolean(v.chargeId) !== Boolean(v.neueCharge), {
    message: "Genau eine Charge angeben",
    path: ["chargeId"],
  });

export async function bucheZugang(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const viewer = await requireLagerbuchAdmin();
  let v: z.output<typeof ZugangSchema>;
  try {
    v = ZugangSchema.parse(eingabe);
  } catch (e) {
    const feldFehler = zodFehler(e);
    return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
  }

  try {
    db.transaction((tx) => {
      let chargeId = v.chargeId!;
      if (v.neueCharge) {
        chargeId = newId();
        tx.insert(chargen)
          .values({
            id: chargeId,
            artikelId: v.artikelId,
            chargenNr: v.neueCharge.chargenNr,
            verfall: v.neueCharge.verfall,
            createdAt: new Date(),
          })
          .run();
      } else {
        /*
         * I5 — DIE CHARGE MUSS ZU DIESEM ARTIKEL GEHOEREN.
         * Eine manipulierte Anfrage koennte eine `chargeId` uebergeben, die zu
         * einem anderen Artikel gehoert. Ohne diese Pruefung buchte der Zugang
         * auf den Bestand des falschen Artikels — „phantom,
         * un-withdrawable Bestand": der Bestand steigt, und FEFO findet die
         * Charge nie, weil sie zum anderen Artikel gehoert. Teil 3 hat diese
         * Invariante ausdruecklich an Teil 5 abgegeben.
         */
        const charge = tx.select().from(chargen).where(eq(chargen.id, chargeId)).get();
        if (!charge || charge.artikelId !== v.artikelId) {
          throw new Error("Charge gehört nicht zu diesem Artikel");
        }
      }
      tx.insert(buchungen)
        .values({
          id: newId(),
          ts: new Date(),
          typ: "zugang",
          artikelId: v.artikelId,
          chargeId,
          lagerortId: HANDLAGER_ID,
          menge: v.menge,
          quelleTyp: "oidc",
          quelleId: viewer.sub,
          kommentar: null,
        })
        .run();
      // Eine Bestellmarkierung, die einen Zugang ueberlebt, fuehrte die
      // Position nach der Lieferung dauerhaft als „bestellt" (§5.5).
      tx.update(artikel).set({ bestelltAt: null }).where(eq(artikel.id, v.artikelId)).run();
    });
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : "Zugang konnte nicht gebucht werden." };
  }

  revalidatePath("/m/lagerbuch/verwaltung/artikel");
  revalidatePath("/m/lagerbuch/verwaltung");
  return { ok: true };
}

const EntnahmeSchema = z.object({
  artikelId: z.string().min(1),
  menge: z.coerce.number().int().positive("Menge muss größer als 0 sein"),
  kommentar: z.string().trim().optional(),
  /*
   * Optionales Ziel-Fahrzeug: gesetzt -> Umlagerung Handlager -> Fahrzeug (der
   * Verbrauch bleibt am Fahrzeug und sinkt erst beim naechsten Check);
   * leer oder Handlager -> normaler Verbrauch aus dem Handlager.
   */
  zielLagerortId: z.string().min(1).optional(),
});

export async function bucheEntnahme(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ gebucht: number }>> {
  const viewer = await requireLagerbuchAdmin();
  let v: z.output<typeof EntnahmeSchema>;
  try {
    v = EntnahmeSchema.parse(eingabe);
  } catch (e) {
    const feldFehler = zodFehler(e);
    return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
  }

  const quelle = { quelleTyp: "oidc" as const, quelleId: viewer.sub };
  const zielFahrzeug =
    v.zielLagerortId && v.zielLagerortId !== HANDLAGER_ID ? v.zielLagerortId : null;
  let gebucht = 0;

  try {
    db.transaction((tx) => {
      if (zielFahrzeug) {
        const ziel = tx.select().from(lagerorte).where(eq(lagerorte.id, zielFahrzeug)).get();
        if (!ziel || ziel.typ !== "fahrzeug" || !ziel.aktiv) {
          throw new Error("Ziel ist kein gültiges, aktives Fahrzeug");
        }
        gebucht = umlagerung(tx, {
          artikelId: v.artikelId,
          menge: v.menge,
          vonLagerortId: HANDLAGER_ID,
          nachLagerortId: zielFahrzeug,
          quelle,
          kommentar: v.kommentar ?? null,
          referenz: `entnahme-ziel:${zielFahrzeug}`,
        }).umgelagert;
      } else {
        gebucht = fefoAbbuchung(tx, {
          artikelId: v.artikelId,
          menge: v.menge,
          quelle,
          kommentar: v.kommentar ?? null,
          referenz: null,
        }).gebucht;
      }
    });
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : "Entnahme konnte nicht gebucht werden." };
  }

  revalidatePath("/m/lagerbuch/verwaltung/artikel");
  revalidatePath("/m/lagerbuch/verwaltung");
  return { ok: true, wert: { gebucht } };
}

const HelferEntnahmeSchema = z.object({
  artikelId: z.string().min(1),
  menge: z.coerce.number().int().positive(),
});

/**
 * DER HELFER-WEG. Einziger Aufrufer: `_ui/Entnahme.tsx` (Teil 4, §7.2).
 *
 * `requireHelferSchreibend` prueft Sitzung UND Sperrbefund (Teil 2, T25): ein
 * gesperrter Code liest im Bestand bis zu 12 Stunden weiter und darf hier auf
 * keinen Fall buchen. Der Rueckgabewert traegt den GRUND, damit die Insel
 * „deine Sitzung ist abgelaufen" von „dieser Code wurde gesperrt"
 * unterscheiden kann.
 *
 * `quelleId` ist der CODE, nicht die Token-Kennung: das Journal zeigt ihn als
 * Klarnamen an (`_db/quelle.ts`, Teil 1 T13).
 */
export async function bucheEntnahmeHelfer(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<HelferErgebnis<{ gebucht: number }>> {
  const zugang = await requireHelferSchreibend(db);
  if (!zugang.ok) {
    // Der Grund wandert DURCH, samt seinem fertigen Satz — die Insel darf
    // „deine Sitzung ist abgelaufen" von „dieser Code wurde gesperrt"
    // unterscheiden, und nur der erste Fall darf einen Erneuern-Knopf zeigen
    // (`darfErneuern`, _lib/actionTypen.ts).
    return { ok: false, grund: zugang.grund, text: RIEGEL_TEXTE[zugang.grund] };
  }
  let v: z.output<typeof HelferEntnahmeSchema>;
  try {
    v = HelferEntnahmeSchema.parse(eingabe);
  } catch {
    return { ok: false, grund: "netz", text: "Ungültige Menge." };
  }

  let gebucht = 0;
  try {
    db.transaction((tx) => {
      gebucht = fefoAbbuchung(tx, {
        artikelId: v.artikelId,
        menge: v.menge,
        quelle: { quelleTyp: "token", quelleId: zugang.zugang.code },
        kommentar: null,
        referenz: null,
      }).gebucht;
    });
  } catch {
    return { ok: false, grund: "netz", text: NETZ_TEXT_BUCHUNG };
  }

  /**
   * ⚠️ DER TEUERSTE ZUSTAND DER GANZEN TABELLE AUS §7.3: „ein 200, das lügt."
   *
   * FEFO bucht, was da ist — bei leerem Handlager sind das null Stueck. Der
   * Bestand macht daraus eine Erfolgsmeldung mit Haken („Entnahme gebucht:
   * 0 × Mullbinde", `HelferEntnahme.tsx:26-27`, `:55`), und die Helferin geht
   * mit leeren Haenden und einem gruenen Chip zum Fahrzeug.
   *
   * `gebucht === 0` ist deshalb ein FEHLERZWEIG, kein Erfolg — und zwar mit
   * dem Artikelnamen im Satz, weil der Server ihn hat und die Insel ihn sonst
   * raten muesste. Auflage A1 aus Teil 4, §6.3.
   */
  if (gebucht === 0) {
    const name = db.select({ name: artikel.name }).from(artikel)
      .where(eq(artikel.id, v.artikelId)).get()?.name ?? "diesem Artikel";
    return { ok: false, grund: "leer", text: leerText(name) };
  }

  revalidatePath(`/m/lagerbuch/a/${v.artikelId}`);
  revalidatePath("/m/lagerbuch/helfer");
  revalidatePath("/m/lagerbuch/verwaltung");
  return { ok: true, wert: { gebucht } };
}
```

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/buchung.test.ts && \
pnpm vitest run src/app/m/lagerbuch/_actions/guards.test.ts
```

**Grün.**

- [ ] **Schritt 4: Commit**

```bash
rtk git add src/app/m/lagerbuch/_actions/buchung.ts src/app/m/lagerbuch/_actions/buchung.test.ts
rtk git commit -m "feat(lagerbuch): _actions/buchung.ts — Zugang, Entnahme, Helfer-Entnahme

Alle drei in EINER Datei (Festlegung H7): sie teilen fefoAbbuchung und
dieselbe Zod-Basis. Teil 4 ruft bucheEntnahmeHelfer und legt keine zweite an.

I5 wandert 1:1 mit: der Zugang lehnt eine Charge ab, die zu einem anderen
Artikel gehoert. Ohne die Pruefung entstuende phantom, un-withdrawable Bestand
— der Bestand steigt, und FEFO findet die Charge nie. Teil 3 hat die
Invariante ausdruecklich an Teil 5 abgegeben.

bestelltAt wird beim Zugang zurueckgesetzt: eine Markierung, die einen Zugang
ueberlebt, fuehrte die Position nach der Lieferung dauerhaft als bestellt.

Ein Ziel-Fahrzeug macht aus der Entnahme eine Umlagerung (netto null, der
Verbrauch bleibt am Fahrzeug); das Handlager als Ziel ist Verbrauch.

revalidatePath in innerer Form, je Action wie in §3 des Plans enumeriert."
```

---

### Task 115: `_actions/aussondern.ts` — nur abgelaufen, nur Handlager-Rest

**Files:** Create `_actions/aussondern.ts`; Test `_actions/aussondern.test.ts`.

**Interfaces:**
- Consumes: `requireLagerbuchAdmin` (Teil 2); `_lib/domain/verfall.ts` (Teil 3, T28) —
  `verfallStatus`, `verfallSchwellen`; `_lib/domain/bestand.ts` (Teil 3, T29) —
  `bestandProLagerortUndCharge`; `_db/schema.ts` — `buchungen`, `chargen`, `newId`;
  `_lib/konstanten.ts` — `HANDLAGER_ID`.
- Produces:
  ```ts
  export async function aussondern(eingabe: unknown, db?: DB): Promise<ActionErgebnis>;
  ```
  Konsument: `verwaltung/(arbeit)/verfall/AussondernRow.tsx` (T130) — `Popconfirm` je Zeile.
- **`revalidatePath`:** `/m/lagerbuch/verwaltung/verfall` · `/m/lagerbuch/verwaltung/artikel` ·
  `/m/lagerbuch/verwaltung`.

**Zwei Zusicherungen, die beim Aufräumen leicht verlorengehen:**

1. **Nur abgelaufene Chargen.** Ein Aussondern einer noch gültigen Charge wäre eine Korrekturbuchung
   ohne fachlichen Anlass — und weil `buchungen` append-only ist, **nicht rücknehmbar** außer durch
   eine Gegenbuchung.
2. ⚠️ **Nur der HANDLAGER-Rest dieser Charge.** Läge dieselbe Charge auch in einem Fahrzeug, sonderte
   ein **globaler** Rest den Handlager-Bestand ins **Negative** aus. `bestandProLagerortUndCharge` ist
   die Funktion, die das trennt — sie kommt aus Teil 3 und wird **nicht** durch ein `sum(menge)`
   ersetzt.

⚠️ **`Popconfirm` statt `Modal` ist hier richtig, obwohl der Vorgang nicht rücknehmbar ist**
(§6.4.5, Fall 1): Aussondern **verliert nichts** — es schreibt eine Zeile in ein append-only Journal,
der Vorgang bleibt vollständig nachlesbar. Dazu kommt der Arbeitsablauf: am Verfallsregal werden
mehrere Chargen nacheinander ausgesondert, und ein modaler Dialog mit Namenseingabe je Charge machte
aus einem Durchgang eine Prozedur.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: [], name: null, email: null }),
}));
import { aussondern } from "./aussondern";

let t: TestDb;
function aufbau(verfall: string) {
  const a = newId(), c = newId();
  t.db.insert(artikel).values({ id: a, name: "Mull", einheit: "Stk", fach: "A1",
    mindestbestand: 1, aktiv: true, createdAt: new Date() }).run();
  t.db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "L1", verfall, createdAt: new Date() }).run();
  return { a, c };
}
function buchen(a: string, c: string, lagerortId: string, menge: number) {
  t.db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: a,
    chargeId: c, lagerortId, menge, quelleTyp: "system", quelleId: "seed", kommentar: null }).run();
}
beforeEach(() => { t = migrierteTestDb("lagerbuch-actions-aussondern-"); revalidiert.length = 0; });
afterEach(() => { t.schliessen(); });

describe("aussondern", () => {
  it("bucht den Handlager-Rest als korrektur mit negativer Menge", async () => {
    const { a, c } = aufbau("2020-01");
    buchen(a, c, HANDLAGER_ID, 7);
    const erg = await aussondern({ chargeId: c, kommentar: "Verfallskontrolle 08/2026" }, t.db);
    expect(erg.ok).toBe(true);
    const korrektur = t.db.select().from(buchungen).all().find((b) => b.typ === "korrektur");
    expect(korrektur).toMatchObject({ menge: -7, chargeId: c, artikelId: a, lagerortId: HANDLAGER_ID });
    expect(korrektur?.kommentar).toBe("Verfallskontrolle 08/2026");
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/verfall",
      "/m/lagerbuch/verwaltung/artikel",
      "/m/lagerbuch/verwaltung",
    ]);
  });

  it("sondert NUR den Handlager-Rest aus, nicht den Fahrzeugbestand", async () => {
    // Ein globaler Rest sonderte den Handlager-Bestand ins NEGATIVE aus.
    const { a, c } = aufbau("2020-01");
    const fz = newId();
    t.db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", aktiv: true, createdAt: new Date() }).run();
    buchen(a, c, HANDLAGER_ID, 3);
    buchen(a, c, fz, 9);
    await aussondern({ chargeId: c, kommentar: "x" }, t.db);
    const korrektur = t.db.select().from(buchungen).all().find((b) => b.typ === "korrektur");
    expect(korrektur?.menge).toBe(-3);
  });

  it("lehnt eine noch gueltige Charge ab", async () => {
    const { a, c } = aufbau("2099-12");
    buchen(a, c, HANDLAGER_ID, 5);
    const erg = await aussondern({ chargeId: c, kommentar: "x" }, t.db);
    expect(erg.ok).toBe(false);
    expect((erg as { ok: false; fehler: string }).fehler).toMatch(/abgelaufen/i);
    expect(t.db.select().from(buchungen).all().filter((b) => b.typ === "korrektur")).toHaveLength(0);
  });

  it("lehnt eine Charge ohne Handlager-Rest ab", async () => {
    const { c } = aufbau("2020-01");
    const erg = await aussondern({ chargeId: c, kommentar: "x" }, t.db);
    expect(erg.ok).toBe(false);
    expect((erg as { ok: false; fehler: string }).fehler).toMatch(/Restbestand/i);
  });

  it("verlangt einen Kommentar", async () => {
    const { a, c } = aufbau("2020-01");
    buchen(a, c, HANDLAGER_ID, 1);
    const erg = await aussondern({ chargeId: c, kommentar: "   " }, t.db);
    expect(erg.ok).toBe(false);
    expect((erg as { ok: false; feldFehler?: Record<string, string> }).feldFehler)
      .toHaveProperty("kommentar");
  });

  it("meldet eine unbekannte Charge, ohne zu werfen", async () => {
    const erg = await aussondern({ chargeId: "gibtsnicht", kommentar: "x" }, t.db);
    expect(erg.ok).toBe(false);
    expect(revalidiert).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/aussondern.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./aussondern"`.

- [ ] **Schritt 3: `_actions/aussondern.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { buchungen, chargen, newId } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { bestandProLagerortUndCharge } from "../_lib/domain/bestand";
import { verfallSchwellen, verfallStatus } from "../_lib/domain/verfall";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";

const AussondernSchema = z.object({
  chargeId: z.string().min(1),
  kommentar: z.string().trim().min(1, "Kommentar erforderlich"),
});

/**
 * SONDERT EINE ABGELAUFENE CHARGE AUS: eine `korrektur`-Buchung mit
 * `menge = -rest` fuer GENAU DIESE Charge — NICHT FEFO. `artikelId` wird aus
 * der geladenen Charge abgeleitet und nicht vom Client uebernommen.
 *
 * ZWEI ZUSICHERUNGEN, die beim Aufraeumen leicht verlorengehen:
 *
 * 1. NUR ABGELAUFENE CHARGEN. Ein Aussondern einer gueltigen Charge waere eine
 *    Korrekturbuchung ohne fachlichen Anlass — und weil `buchungen`
 *    append-only ist, nicht ruecknehmbar auszer durch eine Gegenbuchung.
 * 2. ⚠️ NUR DER HANDLAGER-REST DIESER CHARGE. Laege dieselbe Charge auch in
 *    einem Fahrzeug, sonderte ein GLOBALER Rest den Handlager-Bestand ins
 *    NEGATIVE aus. `bestandProLagerortUndCharge` (Teil 3, T29) trennt das —
 *    ein `sum(menge)` ueber alle Lagerorte taete es nicht.
 *
 * Das Bedienelement ist ein `Popconfirm`, obwohl der Vorgang nicht
 * ruecknehmbar ist (§6.4.5, Fall 1): Aussondern VERLIERT NICHTS — es schreibt
 * eine Zeile in ein append-only Journal, der Vorgang bleibt nachlesbar, und am
 * Verfallsregal werden mehrere Chargen nacheinander ausgesondert.
 */
export async function aussondern(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const viewer = await requireLagerbuchAdmin();
  let v: z.output<typeof AussondernSchema>;
  try {
    v = AussondernSchema.parse(eingabe);
  } catch (e) {
    const feldFehler = zodFehler(e);
    return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
  }

  const schwellen = verfallSchwellen();
  try {
    db.transaction((tx) => {
      const charge = tx.select().from(chargen).where(eq(chargen.id, v.chargeId)).get();
      if (!charge) throw new Error("Charge nicht gefunden");
      if (!verfallStatus(charge.verfall, schwellen, new Date()).abgelaufen) {
        throw new Error("Nur abgelaufene Chargen können ausgesondert werden");
      }
      const bu = tx.select().from(buchungen).where(eq(buchungen.chargeId, v.chargeId)).all();
      const rest =
        bestandProLagerortUndCharge(
          bu.map((b) => ({ lagerortId: b.lagerortId, chargeId: b.chargeId, menge: b.menge })),
          HANDLAGER_ID,
        ).get(v.chargeId) ?? 0;
      if (rest <= 0) throw new Error("Charge hat keinen Restbestand im Handlager");
      tx.insert(buchungen)
        .values({
          id: newId(),
          ts: new Date(),
          typ: "korrektur",
          artikelId: charge.artikelId,
          chargeId: charge.id,
          lagerortId: HANDLAGER_ID,
          menge: -rest,
          quelleTyp: "oidc",
          quelleId: viewer.sub,
          kommentar: v.kommentar,
        })
        .run();
    });
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : "Aussondern fehlgeschlagen." };
  }

  revalidatePath("/m/lagerbuch/verwaltung/verfall");
  revalidatePath("/m/lagerbuch/verwaltung/artikel");
  revalidatePath("/m/lagerbuch/verwaltung");
  return { ok: true };
}
```

- [ ] **Schritt 4: Grün laufen lassen und committen**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/aussondern.test.ts
rtk git add src/app/m/lagerbuch/_actions/aussondern.ts src/app/m/lagerbuch/_actions/aussondern.test.ts
rtk git commit -m "feat(lagerbuch): _actions/aussondern.ts — nur abgelaufen, nur Handlager-Rest

Eine korrektur-Buchung menge=-rest fuer genau diese Charge, nicht FEFO;
artikelId kommt aus der geladenen Charge und nicht vom Client.

Der Rest wird ueber bestandProLagerortUndCharge auf den Handlager eingegrenzt:
laege dieselbe Charge auch in einem Fahrzeug, sonderte ein globaler Rest den
Handlager-Bestand ins Negative aus.

Popconfirm statt Modal, obwohl nicht ruecknehmbar (§6.4.5, Fall 1): Aussondern
verliert nichts, der Vorgang bleibt im append-only Journal nachlesbar — und am
Verfallsregal werden mehrere Chargen nacheinander ausgesondert."
```

---

### Task 116: `_actions/inventur.ts` — nur Gezähltes, gegen den LIVE-Bestand

**Files:** Create `_actions/inventur.ts`; Test `_actions/inventur.test.ts`.

**Interfaces:**
- Consumes: `requireLagerbuchAdmin`; `_lib/schreibpfade/korrektur.ts` (Teil 3, T58) —
  `korrekturAufLagerort(tx, {…})`; `_lib/domain/bestand.ts` (T29) — `bestandProLagerort`;
  `_lib/schreibpfade/abbuchung.ts` (T54) — `fefoAbbuchung`; `_lib/konstanten.ts` — `HANDLAGER_ID`.
- Produces:
  ```ts
  export async function inventurKorrektur(
    eingabe: unknown, db?: DB): Promise<ActionErgebnis<{ korrigiert: number }>>;
  ```
  Konsument: `verwaltung/(arbeit)/inventur/InventurForm.tsx` (T146).
- **`revalidatePath`:** `/m/lagerbuch/verwaltung/inventur` · `/m/lagerbuch/verwaltung/artikel` ·
  `/m/lagerbuch/verwaltung`.

⚠️ **Die tragende Zusicherung ist „nur tatsächlich gezählte Positionen"** (`InventurForm.tsx:36-38`).
Nicht angefasste Artikel würden sonst mit dem **veralteten Seitenlade-Snapshot** als `ist` gebucht und
machten parallele Entnahmen **still rückgängig** — ein klassisches Lost Update. Die Insel schickt
deshalb nur die Zeilen, die jemand angefasst hat, und **der Server rechnet `diff = ist − LIVE-Bestand`,
nicht gegen den mitgeschickten Snapshot.**

⚠️ **`diff > 0` wählt die jüngste vorhandene Charge** (max `verfall`, Tiebreak neuestes `createdAt`)
und legt nur dann eine neue an, wenn es **keine** gibt — dann mit `chargen_nr = "Inventur"` und
`verfall = "2099-12"`. Beide Werte sind feste Schlüssel (Teil 1, T4) und dürfen nicht erfunden werden.
`korrekturAufLagerort` (Teil 3, T58) kapselt genau das; **`inventurKorrektur` ist einer von zwei
Aufrufern** (der andere ist `checkAbschluss` in Teil 4).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, newId } from "../_db/schema";
import { HANDLAGER_ID, CHARGE_INVENTUR, PSEUDO_VERFALL } from "../_lib/konstanten";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: [], name: null, email: null }),
}));
import { inventurKorrektur } from "./inventur";

let t: TestDb;
function artikelMitBestand(menge: number, verfall = "2027-01") {
  const a = newId(), c = newId();
  t.db.insert(artikel).values({ id: a, name: `A${a.slice(0, 4)}`, einheit: "Stk", fach: "A1",
    mindestbestand: 1, aktiv: true, createdAt: new Date() }).run();
  if (menge > 0) {
    t.db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "L1", verfall, createdAt: new Date() }).run();
    t.db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: a,
      chargeId: c, lagerortId: HANDLAGER_ID, menge, quelleTyp: "system", quelleId: "seed", kommentar: null }).run();
  }
  return { a, c };
}
const bestand = (a: string) => t.db.select().from(buchungen).all()
  .filter((b) => b.artikelId === a && b.lagerortId === HANDLAGER_ID)
  .reduce((s, b) => s + b.menge, 0);

beforeEach(() => { t = migrierteTestDb("lagerbuch-actions-inventur-"); revalidiert.length = 0; });
afterEach(() => { t.schliessen(); });

describe("inventurKorrektur", () => {
  it("bucht bei diff < 0 per FEFO ab und zaehlt die Korrektur", async () => {
    const { a } = artikelMitBestand(10);
    const erg = await inventurKorrektur(
      { kommentar: "Quartalsinventur 07/2026", positionen: [{ artikelId: a, ist: 7 }] }, t.db);
    expect((erg as { ok: true; wert: { korrigiert: number } }).wert.korrigiert).toBe(1);
    expect(bestand(a)).toBe(7);
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/inventur",
      "/m/lagerbuch/verwaltung/artikel",
      "/m/lagerbuch/verwaltung",
    ]);
  });

  it("bucht bei diff > 0 auf die JUENGSTE vorhandene Charge", async () => {
    const { a } = artikelMitBestand(2, "2027-01");
    const jung = newId();
    t.db.insert(chargen).values({ id: jung, artikelId: a, chargenNr: "L2", verfall: "2028-06", createdAt: new Date() }).run();
    await inventurKorrektur({ kommentar: "x", positionen: [{ artikelId: a, ist: 5 }] }, t.db);
    const zugabe = t.db.select().from(buchungen).all().find((b) => b.typ === "korrektur" && b.menge > 0);
    expect(zugabe?.chargeId).toBe(jung);
    expect(zugabe?.menge).toBe(3);
  });

  it("legt bei diff > 0 ohne jede Charge eine Inventur-Charge an", async () => {
    const { a } = artikelMitBestand(0);
    await inventurKorrektur({ kommentar: "x", positionen: [{ artikelId: a, ist: 4 }] }, t.db);
    const c = t.db.select().from(chargen).all().find((z) => z.artikelId === a);
    // Feste Schluessel aus _lib/konstanten.ts — nicht erfinden.
    expect(c?.chargenNr).toBe(CHARGE_INVENTUR);
    expect(c?.verfall).toBe(PSEUDO_VERFALL);
  });

  it("ueberspringt Positionen ohne Abweichung", async () => {
    const { a } = artikelMitBestand(6);
    const erg = await inventurKorrektur({ kommentar: "x", positionen: [{ artikelId: a, ist: 6 }] }, t.db);
    expect((erg as { ok: true; wert: { korrigiert: number } }).wert.korrigiert).toBe(0);
    expect(t.db.select().from(buchungen).all().filter((b) => b.typ === "korrektur")).toHaveLength(0);
  });

  it("rechnet gegen den LIVE-Bestand, nicht gegen einen mitgeschickten Snapshot", async () => {
    /*
     * DIE TRAGENDE ZUSICHERUNG. Die Insel schickt NUR angefasste Zeilen, und
     * der Server liest den Bestand selbst. Rechnete er gegen einen
     * mitgeschickten Wert, machte eine parallele Entnahme zwischen
     * Seitenaufbau und Absenden STILL rueckgaengig (Lost Update).
     */
    const { a } = artikelMitBestand(10);
    // Zwischen „Seite geladen" und „abgeschickt" wird entnommen:
    const c = t.db.select().from(chargen).all()[0];
    t.db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "entnahme", artikelId: a,
      chargeId: c.id, lagerortId: HANDLAGER_ID, menge: -4, quelleTyp: "token", quelleId: "111-111", kommentar: null }).run();
    await inventurKorrektur({ kommentar: "x", positionen: [{ artikelId: a, ist: 6 }] }, t.db);
    // ist 6, live 6 -> keine Korrektur. Gegen den Snapshot 10 waere -4
    // gebucht worden und die Entnahme still rueckgaengig gemacht.
    expect(bestand(a)).toBe(6);
    expect(t.db.select().from(buchungen).all().filter((b) => b.typ === "korrektur")).toHaveLength(0);
  });

  it("alle Positionen laufen in EINER Transaktion mit gemeinsamer Referenz", async () => {
    const { a } = artikelMitBestand(5);
    const { a: b } = artikelMitBestand(5);
    await inventurKorrektur({ kommentar: "x", positionen: [{ artikelId: a, ist: 3 }, { artikelId: b, ist: 8 }] }, t.db);
    const refs = new Set(t.db.select().from(buchungen).all()
      .filter((z) => z.typ === "korrektur").map((z) => z.referenz));
    expect(refs.size).toBe(1);
    expect([...refs][0]).toMatch(/^inventur:/);
  });

  it("verlangt Kommentar und mindestens eine Position", async () => {
    const { a } = artikelMitBestand(1);
    expect((await inventurKorrektur({ kommentar: " ", positionen: [{ artikelId: a, ist: 0 }] }, t.db)).ok).toBe(false);
    expect((await inventurKorrektur({ kommentar: "x", positionen: [] }, t.db)).ok).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/inventur.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./inventur"`.

- [ ] **Schritt 3: `_actions/inventur.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { buchungen, newId } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { bestandProLagerort } from "../_lib/domain/bestand";
import { fefoAbbuchung } from "../_lib/schreibpfade/abbuchung";
import { korrekturAufLagerort } from "../_lib/schreibpfade/korrektur";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";

const InventurSchema = z.object({
  kommentar: z.string().trim().min(1, "Kommentar erforderlich"),
  positionen: z
    .array(
      z.object({
        artikelId: z.string().min(1),
        // Die groszzuegige Obergrenze ist begruendet: echter Ueberbestand muss
        // zaehlbar bleiben, sonst korrigiert der Abgleich real vorhandene Teile
        // still heraus (§6.4.6).
        ist: z.coerce.number().int().min(0).max(99_999),
      }),
    )
    .min(1, "Keine Zählung erfasst"),
});

/**
 * DIE INVENTUR — je Position `diff = ist − LIVE-Bestand`, alles in EINER
 * Transaktion mit gemeinsamer Referenz.
 *
 * ⚠️ NUR TATSAECHLICH GEZAEHLTE POSITIONEN. Die Insel schickt ausschlieszlich
 * Zeilen, die jemand angefasst hat (`InventurForm.tsx:36-38`) — nicht
 * angefasste Artikel wuerden sonst mit dem veralteten Seitenlade-Snapshot als
 * `ist` gebucht und machten parallele Entnahmen STILL rueckgaengig (Lost
 * Update). Und der Server liest den Bestand SELBST: ein mitgeschickter
 * Snapshot waere derselbe Fehler eine Ebene tiefer.
 *
 * `diff < 0` -> FEFO-Abbuchung mit `typ: "korrektur"`.
 * `diff > 0` -> `korrekturAufLagerort` (Teil 3, T58) waehlt die JUENGSTE
 *               vorhandene Charge (max `verfall`, Tiebreak neuestes
 *               `createdAt`) und legt nur dann eine neue an, wenn es keine
 *               gibt — mit den festen Schluesseln `"Inventur"` und
 *               `"2099-12"`. `inventurKorrektur` ist einer von genau ZWEI
 *               Aufrufern dieser Funktion (der andere ist `checkAbschluss`,
 *               Teil 4).
 */
export async function inventurKorrektur(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ korrigiert: number }>> {
  const viewer = await requireLagerbuchAdmin();
  let v: z.output<typeof InventurSchema>;
  try {
    v = InventurSchema.parse(eingabe);
  } catch (e) {
    const feldFehler = zodFehler(e);
    return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
  }

  const referenz = `inventur:${newId()}`;
  const quelle = { quelleTyp: "oidc" as const, quelleId: viewer.sub };
  let korrigiert = 0;

  try {
    db.transaction((tx) => {
      for (const p of v.positionen) {
        // Die Inventur zaehlt den HANDLAGER-Bestand; Fahrzeugbestand derselben
        // Charge darf nicht mitzaehlen.
        const bu = tx.select().from(buchungen).where(eq(buchungen.artikelId, p.artikelId)).all();
        const bestandJetzt = bestandProLagerort(
          bu.map((b) => ({ lagerortId: b.lagerortId, menge: b.menge })),
          HANDLAGER_ID,
        );
        const diff = p.ist - bestandJetzt;
        if (diff === 0) continue;
        if (diff < 0) {
          fefoAbbuchung(tx, {
            artikelId: p.artikelId,
            menge: -diff,
            quelle,
            kommentar: v.kommentar,
            referenz,
            typ: "korrektur",
          });
        } else {
          korrekturAufLagerort(tx, {
            artikelId: p.artikelId,
            lagerortId: HANDLAGER_ID,
            diff,
            quelle,
            kommentar: v.kommentar,
            referenz,
          });
        }
        korrigiert++;
      }
    });
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : "Inventur konnte nicht gebucht werden." };
  }

  revalidatePath("/m/lagerbuch/verwaltung/inventur");
  revalidatePath("/m/lagerbuch/verwaltung/artikel");
  revalidatePath("/m/lagerbuch/verwaltung");
  return { ok: true, wert: { korrigiert } };
}
```

- [ ] **Schritt 4: Grün laufen lassen und committen**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/inventur.test.ts
rtk git add src/app/m/lagerbuch/_actions/inventur.ts src/app/m/lagerbuch/_actions/inventur.test.ts
rtk git commit -m "feat(lagerbuch): _actions/inventur.ts — diff gegen den LIVE-Bestand

Nur tatsaechlich gezaehlte Positionen, und der Server liest den Bestand
selbst. Ein mitgeschickter Snapshot machte parallele Entnahmen zwischen
Seitenaufbau und Absenden still rueckgaengig — Lost Update.

diff<0 -> FEFO mit typ=korrektur; diff>0 -> korrekturAufLagerort (Teil 3),
das die juengste Charge waehlt und nur ohne jede Charge eine neue anlegt, mit
den festen Schluesseln 'Inventur' / '2099-12'.

max=99_999 statt einer engen Grenze: echter Ueberbestand muss zaehlbar
bleiben, sonst korrigiert der Abgleich real vorhandene Teile still heraus.

Alle Positionen in einer Transaktion mit gemeinsamer Referenz inventur:<id>."
```

---

### Task 117: `_actions/bestellung.ts` — ein Zeitstempel, zwei Aussagen

**Files:** Create `_actions/bestellung.ts`; Test `_actions/bestellung.test.ts`.

**Interfaces:**
- Consumes: `requireLagerbuchAdmin`; `_db/schema.ts` — `artikel`.
- Produces:
  ```ts
  export async function markiereBestellt(eingabe: unknown, db?: DB): Promise<ActionErgebnis>;
  ```
  Konsument: `verwaltung/(arbeit)/bestellung/BestellListe.tsx` (T145).
- **`revalidatePath`:** `/m/lagerbuch/verwaltung/bestellung` · `/m/lagerbuch/verwaltung`.

⚠️ **`bestelltAt` ist ein ZEITSTEMPEL und kein Haken** (§5.5). Daraus folgen zwei Anzeigen, die die
Seite tragen muss (T145): „bestellt seit &lt;Datum&gt;" — und **„Ware offenbar eingetroffen"**, wenn
seit der Markierung ein **Zugang** gebucht wurde. Ein boolescher Haken könnte beides nicht.
`bucheZugang` setzt das Feld deshalb auf `null` zurück (T114).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_actions/bestellung.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, newId } from "../_db/schema";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: [], name: null, email: null }),
}));
import { markiereBestellt } from "./bestellung";

let t: TestDb;
function anlegen() {
  const id = newId();
  t.db.insert(artikel).values({ id, name: "Mull", einheit: "Stk", fach: "A1",
    mindestbestand: 5, aktiv: true, createdAt: new Date() }).run();
  return id;
}
beforeEach(() => { t = migrierteTestDb("lagerbuch-actions-bestellung-"); revalidiert.length = 0; });
afterEach(() => { t.schliessen(); });

describe("markiereBestellt", () => {
  it("setzt einen ZEITSTEMPEL, keinen Haken", async () => {
    // Aus dem Zeitstempel entstehen zwei Anzeigen, die ein boolesches Feld
    // nicht tragen koennte: „bestellt seit <Datum>" und „Ware offenbar
    // eingetroffen" (§5.5).
    const id = anlegen();
    const vorher = Date.now();
    await markiereBestellt({ artikelId: id, bestellt: true }, t.db);
    const gesetzt = t.db.select().from(artikel).where(eq(artikel.id, id)).get()?.bestelltAt;
    expect(gesetzt).toBeInstanceOf(Date);
    expect(gesetzt!.getTime()).toBeGreaterThanOrEqual(Math.floor(vorher / 1000) * 1000);
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/bestellung",
      "/m/lagerbuch/verwaltung",
    ]);
  });

  it("nimmt die Markierung zurueck", async () => {
    const id = anlegen();
    await markiereBestellt({ artikelId: id, bestellt: true }, t.db);
    await markiereBestellt({ artikelId: id, bestellt: false }, t.db);
    expect(t.db.select().from(artikel).where(eq(artikel.id, id)).get()?.bestelltAt).toBeNull();
  });

  it("meldet eine ungueltige Eingabe als Rueckgabewert", async () => {
    const erg = await markiereBestellt({ artikelId: "", bestellt: true }, t.db);
    expect(erg.ok).toBe(false);
    expect(revalidiert).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/bestellung.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./bestellung"`.

- [ ] **Schritt 3: `_actions/bestellung.ts` schreiben**

```ts
// src/app/m/lagerbuch/_actions/bestellung.ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { artikel } from "../_db/schema";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import type { ActionErgebnis } from "../_lib/actionErgebnis";

const Schema = z.object({ artikelId: z.string().min(1), bestellt: z.boolean() });

/**
 * DIE BESTELLT-MARKIERUNG — ein ZEITSTEMPEL, kein Haken.
 *
 * `artikel.bestellt_at` traegt den Zeitpunkt, nicht die Tatsache. Daraus
 * entstehen ZWEI Anzeigen, die ein boolesches Feld nicht tragen koennte
 * (§5.5, §6.15 Auflage 17):
 *   1. „bestellt seit <Datum>" — wie lange steht die Position schon offen?
 *   2. „Ware offenbar eingetroffen" — seit der Markierung wurde ein Zugang
 *      gebucht, die Bestellung ist also vermutlich erledigt.
 *
 * `bucheZugang` (T114) setzt das Feld auf `null` zurueck. Eine Markierung, die
 * einen Zugang ueberlebte, fuehrte die Position nach der Lieferung dauerhaft
 * als bestellt.
 */
export async function markiereBestellt(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof Schema>;
  try {
    v = Schema.parse(eingabe);
  } catch {
    return { ok: false, fehler: "Ungültige Eingabe." };
  }
  db.update(artikel)
    .set({ bestelltAt: v.bestellt ? new Date() : null })
    .where(eq(artikel.id, v.artikelId))
    .run();
  revalidatePath("/m/lagerbuch/verwaltung/bestellung");
  revalidatePath("/m/lagerbuch/verwaltung");
  return { ok: true };
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/bestellung.test.ts
```

**Grün.** Alle drei Fälle laufen durch: der Zeitstempel steht, die Rücknahme setzt `null`, und die
ungültige Eingabe kommt als Rückgabewert zurück, ohne zu revalidieren.

- [ ] **Schritt 5: Gates**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run src/app/m/lagerbuch/_actions/guards.test.ts
```

- [ ] **Schritt 6: Commit**

```bash
rtk git add src/app/m/lagerbuch/_actions/bestellung.ts src/app/m/lagerbuch/_actions/bestellung.test.ts
rtk git commit -m "feat(lagerbuch): _actions/bestellung.ts — Zeitstempel statt Haken

bestellt_at traegt den Zeitpunkt, und daraus entstehen zwei Anzeigen, die ein
boolesches Feld nicht tragen koennte: 'bestellt seit <Datum>' und 'Ware
offenbar eingetroffen' (§5.5). bucheZugang setzt das Feld zurueck."
```

---

### Task 118: `_actions/fahrzeuge.ts` — Flotte und Soll-Positionen, mit den Grabsteinen

**Files:** Create `_actions/fahrzeuge.ts`; Test `_actions/fahrzeuge.test.ts`.

**Interfaces:**
- Consumes: `requireLagerbuchAdmin`; `_lib/schreibpfade/lagerortVerfall.ts` (Teil 3, T55) —
  `loescheVerfallEintrag(db, lagerortId, artikelId)`; `_db/schema.ts` — `lagerorte`,
  `sollPositionen`, `newId`.
- Produces:
  ```ts
  export async function createFahrzeug(e: unknown, db?: DB): Promise<ActionErgebnis<{ id: string }>>;
  export async function setFahrzeugAktiv(e: unknown, db?: DB): Promise<ActionErgebnis>;
  export async function sollPositionSetzen(e: unknown, db?: DB): Promise<ActionErgebnis<{ id: string }>>;
  export async function sollPositionEntfernen(e: unknown, db?: DB): Promise<ActionErgebnis>;
  export async function sollPositionWiederherstellen(e: unknown, db?: DB): Promise<ActionErgebnis>;
  ```
  Konsumenten: `NeuFahrzeug` (T131), `FahrzeugAktivToggle` und `SollEditor` (T132).
- **`revalidatePath`** (aus §3, wörtlich): `createFahrzeug` → `…/fahrzeuge` · `setFahrzeugAktiv` →
  `…/fahrzeuge` · `sollPositionSetzen` → `…/fahrzeuge`, `` …/fahrzeuge/${fahrzeugId} `` ·
  `sollPositionEntfernen` → `` …/fahrzeuge/${row.fahrzeugId} `` **nur wenn `row`**, `…/verfall`,
  `…/fahrzeuge` · `sollPositionWiederherstellen` → `` …/fahrzeuge/${row.fahrzeugId} `` **nur wenn
  `row`**, `…/fahrzeuge` (jeweils mit `/m/lagerbuch`-Präfix).

**Drei Verhaltensweisen, die man beim Portieren verliert, weil sie wie Sonderfälle aussehen:**

1. **Eine bearbeitete Vorlagen-Position gilt als „manuell überschrieben"** (`fahrzeuge.ts:44-46`) und
   wird von einem späteren Sync **nicht mehr angeglichen**. Ohne diese Zeile machte der nächste
   Vorlagen-Sync jede handgesetzte Abweichung wieder rückgängig.
2. ⚠️ **`sollPositionEntfernen` löscht eine Vorlagen-Position NICHT, sondern setzt einen Grabstein**
   (`entfernt: true`). Ein Hard-Delete legte der **nächste Sync wieder an** — die Position käme
   zurück, und niemand verstünde warum. Nur eine **manuelle** Zeile wird wirklich gelöscht.
3. ⚠️ **Steht der Artikel danach an diesem Fahrzeug in keinem Fach mehr, wird die gemeldete
   Verfall-Angabe gelöscht** (`fahrzeuge.ts:76-83`). Sonst geisterte sie weiter durch die
   Verfallsliste — eine Angabe zu einem Artikel, den es dort nicht mehr gibt. **Die Prüfung schließt
   die gerade entfernte Zeile aus und ignoriert Grabsteine.**

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, lagerorte, lagerortVerfall, sollPositionen, newId } from "../_db/schema";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: [], name: null, email: null }),
}));
import { createFahrzeug, setFahrzeugAktiv, sollPositionSetzen,
         sollPositionEntfernen, sollPositionWiederherstellen } from "./fahrzeuge";

let t: TestDb;
const wert = <T>(e: unknown) => (e as { ok: true; wert: T }).wert;
function artikelAnlegen() {
  const id = newId();
  t.db.insert(artikel).values({ id, name: "Mull", einheit: "Stk", fach: "A1",
    mindestbestand: 1, aktiv: true, createdAt: new Date() }).run();
  return id;
}
beforeEach(() => { t = migrierteTestDb("lagerbuch-actions-fahrzeuge-"); revalidiert.length = 0; });
afterEach(() => { t.schliessen(); });

describe("createFahrzeug / setFahrzeugAktiv", () => {
  it("legt ein Fahrzeug mit typ=fahrzeug an", async () => {
    const erg = await createFahrzeug({ name: "RTW 1", kennung: "UE-RK 1234" }, t.db);
    const id = wert<{ id: string }>(erg).id;
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, id)).get())
      .toMatchObject({ typ: "fahrzeug", aktiv: true, kennung: "UE-RK 1234" });
    expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/fahrzeuge"]);
  });

  it("laeszt die Kennung weg, wenn keine kommt", async () => {
    const erg = await createFahrzeug({ name: "MTW" }, t.db);
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, wert<{ id: string }>(erg).id)).get()?.kennung).toBeNull();
  });

  it("schaltet aktiv um", async () => {
    const id = wert<{ id: string }>(await createFahrzeug({ name: "RTW 1" }, t.db)).id;
    revalidiert.length = 0;
    await setFahrzeugAktiv({ id, aktiv: false }, t.db);
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, id)).get()?.aktiv).toBe(false);
    expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/fahrzeuge"]);
  });
});

describe("sollPositionSetzen", () => {
  it("legt eine manuelle Position an und revalidiert beide Pfade", async () => {
    const fz = wert<{ id: string }>(await createFahrzeug({ name: "RTW 1" }, t.db)).id;
    const a = artikelAnlegen();
    revalidiert.length = 0;
    const erg = await sollPositionSetzen({ fahrzeugId: fz, fachLabel: "Fach 1", artikelId: a, soll: 3 }, t.db);
    expect(t.db.select().from(sollPositionen).all()).toHaveLength(1);
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/fahrzeuge",
      `/m/lagerbuch/verwaltung/fahrzeuge/${fz}`,
    ]);
    expect(wert<{ id: string }>(erg).id).toBeTruthy();
  });

  it("markiert eine bearbeitete VORLAGEN-Position als ueberschrieben", async () => {
    // Ohne diese Zeile machte der naechste Vorlagen-Sync jede handgesetzte
    // Abweichung wieder rueckgaengig.
    const fz = wert<{ id: string }>(await createFahrzeug({ name: "RTW 1" }, t.db)).id;
    const a = artikelAnlegen();
    const id = newId();
    t.db.insert(sollPositionen).values({ id, fahrzeugId: fz, fachLabel: "F1", artikelId: a,
      soll: 2, sort: 0, templatePositionId: "tp1", ueberschrieben: false, entfernt: false }).run();
    await sollPositionSetzen({ id, fahrzeugId: fz, fachLabel: "F1", artikelId: a, soll: 9 }, t.db);
    const zeile = t.db.select().from(sollPositionen).where(eq(sollPositionen.id, id)).get();
    expect(zeile).toMatchObject({ soll: 9, ueberschrieben: true, entfernt: false });
  });

  it("hebt einen Grabstein durch Setzen wieder auf", async () => {
    const fz = wert<{ id: string }>(await createFahrzeug({ name: "RTW 1" }, t.db)).id;
    const a = artikelAnlegen();
    const id = newId();
    t.db.insert(sollPositionen).values({ id, fahrzeugId: fz, fachLabel: "F1", artikelId: a,
      soll: 2, sort: 0, templatePositionId: "tp1", ueberschrieben: false, entfernt: true }).run();
    await sollPositionSetzen({ id, fahrzeugId: fz, fachLabel: "F1", artikelId: a, soll: 2 }, t.db);
    expect(t.db.select().from(sollPositionen).where(eq(sollPositionen.id, id)).get()?.entfernt).toBe(false);
  });

  it("lehnt soll <= 0 ab", async () => {
    const fz = wert<{ id: string }>(await createFahrzeug({ name: "R" }, t.db)).id;
    expect((await sollPositionSetzen({ fahrzeugId: fz, fachLabel: "F", artikelId: artikelAnlegen(), soll: 0 }, t.db)).ok)
      .toBe(false);
  });
});

describe("sollPositionEntfernen", () => {
  it("setzt bei einer VORLAGEN-Position einen Grabstein statt zu loeschen", async () => {
    // Ein Hard-Delete legte der naechste Sync wieder an — die Position kaeme
    // zurueck, und niemand verstuende warum.
    const fz = wert<{ id: string }>(await createFahrzeug({ name: "RTW 1" }, t.db)).id;
    const a = artikelAnlegen();
    const id = newId();
    t.db.insert(sollPositionen).values({ id, fahrzeugId: fz, fachLabel: "F1", artikelId: a,
      soll: 2, sort: 0, templatePositionId: "tp1", ueberschrieben: false, entfernt: false }).run();
    await sollPositionEntfernen({ id }, t.db);
    expect(t.db.select().from(sollPositionen).where(eq(sollPositionen.id, id)).get()?.entfernt).toBe(true);
  });

  it("loescht eine MANUELLE Position wirklich", async () => {
    const fz = wert<{ id: string }>(await createFahrzeug({ name: "RTW 1" }, t.db)).id;
    const a = artikelAnlegen();
    const id = wert<{ id: string }>(
      await sollPositionSetzen({ fahrzeugId: fz, fachLabel: "F1", artikelId: a, soll: 2 }, t.db)).id;
    await sollPositionEntfernen({ id }, t.db);
    expect(t.db.select().from(sollPositionen).where(eq(sollPositionen.id, id)).get()).toBeUndefined();
  });

  it("loescht die gemeldete Verfall-Angabe, wenn der Artikel in KEINEM Fach mehr steht", async () => {
    // Sonst geisterte sie weiter durch die Verfallsliste — eine Angabe zu
    // einem Artikel, den es an diesem Fahrzeug nicht mehr gibt.
    const fz = wert<{ id: string }>(await createFahrzeug({ name: "RTW 1" }, t.db)).id;
    const a = artikelAnlegen();
    const id = wert<{ id: string }>(
      await sollPositionSetzen({ fahrzeugId: fz, fachLabel: "F1", artikelId: a, soll: 2 }, t.db)).id;
    t.db.insert(lagerortVerfall).values({ lagerortId: fz, artikelId: a, verfall: "2027-03",
      erfasstAt: new Date(), quelleTyp: "oidc", quelleId: "u1" }).run();
    revalidiert.length = 0;
    await sollPositionEntfernen({ id }, t.db);
    expect(t.db.select().from(lagerortVerfall)
      .where(and(eq(lagerortVerfall.lagerortId, fz), eq(lagerortVerfall.artikelId, a))).get())
      .toBeUndefined();
    expect(revalidiert).toEqual([
      `/m/lagerbuch/verwaltung/fahrzeuge/${fz}`,
      "/m/lagerbuch/verwaltung/verfall",
      "/m/lagerbuch/verwaltung/fahrzeuge",
    ]);
  });

  it("behaelt die Verfall-Angabe, solange der Artikel in einem ANDEREN Fach steht", async () => {
    const fz = wert<{ id: string }>(await createFahrzeug({ name: "RTW 1" }, t.db)).id;
    const a = artikelAnlegen();
    const id1 = wert<{ id: string }>(
      await sollPositionSetzen({ fahrzeugId: fz, fachLabel: "F1", artikelId: a, soll: 2 }, t.db)).id;
    await sollPositionSetzen({ fahrzeugId: fz, fachLabel: "F2", artikelId: a, soll: 1 }, t.db);
    t.db.insert(lagerortVerfall).values({ lagerortId: fz, artikelId: a, verfall: "2027-03",
      erfasstAt: new Date(), quelleTyp: "oidc", quelleId: "u1" }).run();
    await sollPositionEntfernen({ id: id1 }, t.db);
    expect(t.db.select().from(lagerortVerfall).all()).toHaveLength(1);
  });

  it("revalidiert den Fahrzeugpfad NICHT, wenn die Zeile nicht existiert", async () => {
    await sollPositionEntfernen({ id: "gibtsnicht" }, t.db);
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/verfall",
      "/m/lagerbuch/verwaltung/fahrzeuge",
    ]);
  });
});

describe("sollPositionWiederherstellen", () => {
  it("hebt den Grabstein auf", async () => {
    const fz = wert<{ id: string }>(await createFahrzeug({ name: "RTW 1" }, t.db)).id;
    const a = artikelAnlegen();
    const id = newId();
    t.db.insert(sollPositionen).values({ id, fahrzeugId: fz, fachLabel: "F1", artikelId: a,
      soll: 2, sort: 0, templatePositionId: "tp1", ueberschrieben: false, entfernt: true }).run();
    revalidiert.length = 0;
    await sollPositionWiederherstellen({ id }, t.db);
    expect(t.db.select().from(sollPositionen).where(eq(sollPositionen.id, id)).get()?.entfernt).toBe(false);
    expect(revalidiert).toEqual([
      `/m/lagerbuch/verwaltung/fahrzeuge/${fz}`,
      "/m/lagerbuch/verwaltung/fahrzeuge",
    ]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/fahrzeuge.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./fahrzeuge"`.

- [ ] **Schritt 3: `_actions/fahrzeuge.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { lagerorte, sollPositionen, newId } from "../_db/schema";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { loescheVerfallEintrag } from "../_lib/schreibpfade/lagerortVerfall";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";

const fehlerhaft = (e: unknown): ActionErgebnis<never> => {
  const feldFehler = zodFehler(e);
  return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
};

const FahrzeugSchema = z.object({
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  kennung: z.string().trim().optional(),
});

export async function createFahrzeug(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof FahrzeugSchema>;
  try { v = FahrzeugSchema.parse(eingabe); } catch (e) { return fehlerhaft(e); }
  const id = newId();
  db.insert(lagerorte)
    .values({ id, name: v.name, typ: "fahrzeug", kennung: v.kennung || null, aktiv: true })
    .run();
  revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");
  return { ok: true, wert: { id } };
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });

export async function setFahrzeugAktiv(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof AktivSchema>;
  try { v = AktivSchema.parse(eingabe); } catch { return { ok: false, fehler: "Ungültige Eingabe." }; }
  db.update(lagerorte).set({ aktiv: v.aktiv }).where(eq(lagerorte.id, v.id)).run();
  revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");
  return { ok: true };
}

const SollSchema = z.object({
  id: z.string().min(1).optional(),
  fahrzeugId: z.string().min(1),
  fachLabel: z.string().trim().min(1, "Fach darf nicht leer sein"),
  artikelId: z.string().min(1, "Artikel wählen"),
  soll: z.coerce.number().int().positive("Soll muss größer als 0 sein"),
  sort: z.coerce.number().int().default(0),
});

/**
 * SETZT ODER AENDERT EINE SOLL-POSITION.
 *
 * ⚠️ Wird eine aus einer VORLAGE stammende Position bearbeitet, gilt sie als
 * MANUELL UEBERSCHRIEBEN und wird von einem spaeteren Sync nicht mehr
 * angeglichen. Ohne diese Zeile machte der naechste Vorlagen-Sync jede
 * handgesetzte Abweichung wieder rueckgaengig — und die Verwaltende saehe nur,
 * dass ihre Zahl „von selbst" zurueckspringt.
 *
 * Eine zuvor entfernte Position (Grabstein) wird durch das Setzen wieder
 * aktiviert (`entfernt: false`).
 */
export async function sollPositionSetzen(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof SollSchema>;
  try { v = SollSchema.parse(eingabe); } catch (e) { return fehlerhaft(e); }
  const id = v.id ?? newId();
  if (v.id) {
    const row = db.select().from(sollPositionen).where(eq(sollPositionen.id, v.id)).get();
    const ueberschrieben = row?.templatePositionId ? true : (row?.ueberschrieben ?? false);
    db.update(sollPositionen)
      .set({
        fahrzeugId: v.fahrzeugId, fachLabel: v.fachLabel, artikelId: v.artikelId,
        soll: v.soll, sort: v.sort, ueberschrieben, entfernt: false,
      })
      .where(eq(sollPositionen.id, v.id))
      .run();
  } else {
    db.insert(sollPositionen)
      .values({ id, fahrzeugId: v.fahrzeugId, fachLabel: v.fachLabel,
                artikelId: v.artikelId, soll: v.soll, sort: v.sort })
      .run();
  }
  revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");
  revalidatePath(`/m/lagerbuch/verwaltung/fahrzeuge/${v.fahrzeugId}`);
  return { ok: true, wert: { id } };
}

const EntfernenSchema = z.object({ id: z.string().min(1) });

/**
 * ⚠️ EINE VORLAGEN-POSITION WIRD NICHT GELOESCHT, SONDERN ZUM GRABSTEIN.
 * Ein Hard-Delete legte der naechste Sync wieder an; die Position kaeme
 * zurueck, und niemand verstuende warum. Nur eine MANUELLE Zeile verschwindet
 * wirklich.
 *
 * ⚠️ UND DANACH: steht der Artikel an diesem Fahrzeug in KEINEM Fach mehr, ist
 * eine gemeldete Verfall-Angabe gegenstandslos und wird geloescht — sonst
 * geisterte sie weiter durch die Verfallsliste. Die Pruefung schlieszt die
 * gerade entfernte Zeile aus und ignoriert Grabsteine.
 *
 * Der Fahrzeugpfad wird nur revalidiert, wenn die Zeile ueberhaupt existierte:
 * die Kennung kommt aus der geloeschten Zeile, also wird sie VORHER gelesen.
 */
export async function sollPositionEntfernen(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof EntfernenSchema>;
  try { v = EntfernenSchema.parse(eingabe); } catch { return { ok: false, fehler: "Ungültige Eingabe." }; }

  const row = db.select().from(sollPositionen).where(eq(sollPositionen.id, v.id)).get();
  if (row?.templatePositionId) {
    db.update(sollPositionen).set({ entfernt: true }).where(eq(sollPositionen.id, v.id)).run();
  } else {
    db.delete(sollPositionen).where(eq(sollPositionen.id, v.id)).run();
  }
  if (row) {
    const restPositionen = db
      .select({ id: sollPositionen.id, entfernt: sollPositionen.entfernt })
      .from(sollPositionen)
      .where(and(eq(sollPositionen.fahrzeugId, row.fahrzeugId),
                 eq(sollPositionen.artikelId, row.artikelId)))
      .all()
      .filter((p) => p.id !== v.id && !p.entfernt);
    if (restPositionen.length === 0) loescheVerfallEintrag(db, row.fahrzeugId, row.artikelId);
    revalidatePath(`/m/lagerbuch/verwaltung/fahrzeuge/${row.fahrzeugId}`);
  }
  revalidatePath("/m/lagerbuch/verwaltung/verfall");
  revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");
  return { ok: true };
}

/**
 * Hebt einen Grabstein auf. ⚠️ Das Bedienelement dafuer ist nur an einer
 * ENTFERNTEN Zeile sichtbar — genau der Kandidat fuer „Action ohne Weg in der
 * Oberflaeche" (§6.12, Frage 1). T132 muss die Zeile deshalb ausdruecklich
 * rendern, statt Grabsteine auszublenden.
 */
export async function sollPositionWiederherstellen(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof EntfernenSchema>;
  try { v = EntfernenSchema.parse(eingabe); } catch { return { ok: false, fehler: "Ungültige Eingabe." }; }
  const row = db.select().from(sollPositionen).where(eq(sollPositionen.id, v.id)).get();
  db.update(sollPositionen).set({ entfernt: false }).where(eq(sollPositionen.id, v.id)).run();
  if (row) revalidatePath(`/m/lagerbuch/verwaltung/fahrzeuge/${row.fahrzeugId}`);
  revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");
  return { ok: true };
}
```

- [ ] **Schritt 4: Grün und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/fahrzeuge.test.ts
rtk git add src/app/m/lagerbuch/_actions/fahrzeuge.ts src/app/m/lagerbuch/_actions/fahrzeuge.test.ts
rtk git commit -m "feat(lagerbuch): _actions/fahrzeuge.ts — Flotte, Soll-Positionen, Grabsteine

Drei Verhaltensweisen, die wie Sonderfaelle aussehen und keine sind:
 * Eine bearbeitete Vorlagen-Position gilt als ueberschrieben und wird vom
   naechsten Sync nicht mehr angeglichen — sonst springt die Zahl von selbst
   zurueck.
 * Entfernen setzt bei einer Vorlagen-Position einen GRABSTEIN. Ein
   Hard-Delete legte der naechste Sync wieder an.
 * Steht der Artikel danach in keinem Fach mehr, wird die gemeldete
   Verfall-Angabe geloescht — sonst geistert sie durch die Verfallsliste.

Der Fahrzeugpfad wird nur revalidiert, wenn die Zeile existierte: die Kennung
kommt aus der geloeschten Zeile und wird vorher gelesen."
```

---

### Task 119: `_actions/templates.ts` — elf Actions, EIN Revalidierungs-Helfer

**Files:** Create `_actions/templates.ts`; Test `_actions/templates.test.ts`.

**Interfaces:**
- Consumes: `requireLagerbuchAdmin`; `_lib/schreibpfade/templateSync.ts` (Teil 3, T56) —
  `syncFahrzeugTemplate(db|tx, fahrzeugId): SyncErgebnis`, `type SyncErgebnis`; `_db/schema.ts` —
  `fahrzeugTemplates`, `templatePositionen`, `lagerorte`, `sollPositionen`, `newId`.
- Produces:
  ```ts
  export async function createTemplate(e: unknown, db?: DB): Promise<ActionErgebnis<{ id: string }>>;
  export async function renameTemplate(e: unknown, db?: DB): Promise<ActionErgebnis>;
  export async function setTemplateAktiv(e: unknown, db?: DB): Promise<ActionErgebnis>;
  export async function deleteTemplate(e: unknown, db?: DB): Promise<ActionErgebnis>;
  export async function templatePositionSetzen(e: unknown, db?: DB): Promise<ActionErgebnis<{ id: string }>>;
  export async function templatePositionEntfernen(e: unknown, db?: DB): Promise<ActionErgebnis>;
  export async function fahrzeugTemplateZuweisen(e: unknown, db?: DB): Promise<ActionErgebnis<SyncErgebnis>>;
  export async function fahrzeugTemplateSync(e: unknown, db?: DB): Promise<ActionErgebnis<SyncErgebnis>>;
  export async function templateAufFahrzeugeSyncen(
    e: unknown, db?: DB): Promise<ActionErgebnis<SyncErgebnis & { fahrzeuge: number }>>;
  export async function fahrzeugTemplateLoesen(e: unknown, db?: DB): Promise<ActionErgebnis>;
  export async function templateAusFahrzeug(e: unknown, db?: DB): Promise<ActionErgebnis<{ id: string }>>;
  ```
  Konsumenten: `NeuTemplate` (T133), `TemplateAktionen` und `TemplatePosEditor` (T134),
  `TemplateVerknuepfung` (T132).
- **`revalidatePath`:** **alle elf** über den Helfer `revalidate(fahrzeugId?)` →
  `/m/lagerbuch/verwaltung/vorlagen` · `/m/lagerbuch/verwaltung/fahrzeuge` ·
  `` /m/lagerbuch/verwaltung/fahrzeuge/${fahrzeugId} `` (nur wenn übergeben).

⚠️ **Der Helfer wandert MIT.** Elf Actions und **eine** Liste. Wer ihn auflöst und je Action
ausschreibt, hat elf Stellen, an denen die Liste auseinanderlaufen kann — bei einer Datei, deren
Actions sich gegenseitig aufrufen (`deleteTemplate` → `loeseFahrzeugVonTemplate`), ist das die
teuerste Sorte Kopie. Nur die drei Pfade werden auf die **innere** Form gezogen.

⚠️ **`loeseFahrzeugVonTemplate` ist KEIN Export.** Sie ist eine Hilfsfunktion in einer
`"use server"`-Datei — **jeder Export wäre eine Server Action**, und diese Funktion nimmt eine
Transaktion entgegen, die kein Client übergeben kann. Sie bleibt modul-intern.

⚠️ **Grabsteine werden beim Lösen VERWORFEN.** Ohne Verknüpfung ergeben „bewusst ausgelassene
Vorlagen-Positionen" keinen Sinn mehr; die materialisierten Positionen bleiben dagegen als
individuelle Bestückung erhalten. **So verliert das Fahrzeug nichts und wird trotzdem unabhängig.**

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, fahrzeugTemplates, lagerorte, sollPositionen,
         templatePositionen, newId } from "../_db/schema";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: [], name: null, email: null }),
}));
import { createTemplate, renameTemplate, setTemplateAktiv, deleteTemplate,
         templatePositionSetzen, templatePositionEntfernen, fahrzeugTemplateZuweisen,
         fahrzeugTemplateSync, templateAufFahrzeugeSyncen, fahrzeugTemplateLoesen,
         templateAusFahrzeug } from "./templates";

let t: TestDb;
const wert = <T>(e: unknown) => (e as { ok: true; wert: T }).wert;
function artikelAnlegen(name = "Mull") {
  const id = newId();
  t.db.insert(artikel).values({ id, name, einheit: "Stk", fach: "A1",
    mindestbestand: 1, aktiv: true, createdAt: new Date() }).run();
  return id;
}
function fahrzeugAnlegen(name = "RTW 1") {
  const id = newId();
  t.db.insert(lagerorte).values({ id, name, typ: "fahrzeug", aktiv: true }).run();
  return id;
}
beforeEach(() => { t = migrierteTestDb("lagerbuch-actions-templates-"); revalidiert.length = 0; });
afterEach(() => { t.schliessen(); });

describe("Der eine Revalidierungs-Helfer", () => {
  it("createTemplate revalidiert Vorlagen und Fahrzeuge, KEINEN Fahrzeugpfad", async () => {
    await createTemplate({ name: "Standard-RTW" }, t.db);
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/vorlagen",
      "/m/lagerbuch/verwaltung/fahrzeuge",
    ]);
  });

  it("fahrzeugTemplateZuweisen haengt den Fahrzeugpfad an", async () => {
    const tid = wert<{ id: string }>(await createTemplate({ name: "S" }, t.db)).id;
    const fz = fahrzeugAnlegen();
    revalidiert.length = 0;
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz, templateId: tid }, t.db);
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/vorlagen",
      "/m/lagerbuch/verwaltung/fahrzeuge",
      `/m/lagerbuch/verwaltung/fahrzeuge/${fz}`,
    ]);
  });
});

describe("Vorlagen-Stammdaten", () => {
  it("legt an, benennt um, schaltet aktiv", async () => {
    const id = wert<{ id: string }>(await createTemplate({ name: "Standard-RTW" }, t.db)).id;
    await renameTemplate({ id, name: "RTW neu" }, t.db);
    await setTemplateAktiv({ id, aktiv: false }, t.db);
    const z = t.db.select().from(fahrzeugTemplates).where(eq(fahrzeugTemplates.id, id)).get();
    expect(z).toMatchObject({ name: "RTW neu", aktiv: false });
  });

  it("deleteTemplate loest verknuepfte Fahrzeuge und behaelt deren Positionen", async () => {
    const tid = wert<{ id: string }>(await createTemplate({ name: "S" }, t.db)).id;
    const a = artikelAnlegen();
    await templatePositionSetzen({ templateId: tid, fachLabel: "F1", artikelId: a, soll: 2 }, t.db);
    const fz = fahrzeugAnlegen();
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz, templateId: tid }, t.db);
    expect(t.db.select().from(sollPositionen).all()).toHaveLength(1);
    await deleteTemplate({ id: tid }, t.db);
    // Die Vorlage ist weg, die Bestueckung bleibt als individuelle.
    expect(t.db.select().from(fahrzeugTemplates).all()).toHaveLength(0);
    expect(t.db.select().from(templatePositionen).all()).toHaveLength(0);
    const pos = t.db.select().from(sollPositionen).all();
    expect(pos).toHaveLength(1);
    expect(pos[0].templatePositionId).toBeNull();
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, fz)).get()?.templateId).toBeNull();
  });
});

describe("Vorlagen-Positionen", () => {
  it("templatePositionEntfernen loest referenzierende Fahrzeug-Zeilen auf", async () => {
    const tid = wert<{ id: string }>(await createTemplate({ name: "S" }, t.db)).id;
    const a = artikelAnlegen();
    const pid = wert<{ id: string }>(
      await templatePositionSetzen({ templateId: tid, fachLabel: "F1", artikelId: a, soll: 2 }, t.db)).id;
    const fz = fahrzeugAnlegen();
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz, templateId: tid }, t.db);
    await templatePositionEntfernen({ id: pid }, t.db);
    // Nicht ueberschriebene Zeilen verschwinden mit, sonst braeche der
    // Fremdschluessel.
    expect(t.db.select().from(sollPositionen).all()).toHaveLength(0);
  });

  it("eine UEBERSCHRIEBENE Fahrzeug-Zeile ueberlebt als manuelle", async () => {
    const tid = wert<{ id: string }>(await createTemplate({ name: "S" }, t.db)).id;
    const a = artikelAnlegen();
    const pid = wert<{ id: string }>(
      await templatePositionSetzen({ templateId: tid, fachLabel: "F1", artikelId: a, soll: 2 }, t.db)).id;
    const fz = fahrzeugAnlegen();
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz, templateId: tid }, t.db);
    const zeile = t.db.select().from(sollPositionen).all()[0];
    t.db.update(sollPositionen).set({ ueberschrieben: true }).where(eq(sollPositionen.id, zeile.id)).run();
    await templatePositionEntfernen({ id: pid }, t.db);
    const nachher = t.db.select().from(sollPositionen).all();
    expect(nachher).toHaveLength(1);
    expect(nachher[0]).toMatchObject({ templatePositionId: null, ueberschrieben: false });
  });
});

describe("Fahrzeug <-> Vorlage", () => {
  it("fahrzeugTemplateLoesen verwirft Grabsteine und behaelt materialisierte Positionen", async () => {
    const tid = wert<{ id: string }>(await createTemplate({ name: "S" }, t.db)).id;
    const a = artikelAnlegen("A"), b = artikelAnlegen("B");
    await templatePositionSetzen({ templateId: tid, fachLabel: "F1", artikelId: a, soll: 2 }, t.db);
    await templatePositionSetzen({ templateId: tid, fachLabel: "F1", artikelId: b, soll: 1 }, t.db);
    const fz = fahrzeugAnlegen();
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz, templateId: tid }, t.db);
    const zeilen = t.db.select().from(sollPositionen).all();
    t.db.update(sollPositionen).set({ entfernt: true }).where(eq(sollPositionen.id, zeilen[0].id)).run();
    await fahrzeugTemplateLoesen({ fahrzeugId: fz }, t.db);
    const nachher = t.db.select().from(sollPositionen).all();
    // Der Grabstein ist weg (ohne Verknuepfung sinnlos), die andere Zeile
    // bleibt als individuelle Bestueckung.
    expect(nachher).toHaveLength(1);
    expect(nachher[0]).toMatchObject({ templatePositionId: null, ueberschrieben: false });
  });

  it("templateAufFahrzeugeSyncen zaehlt die Fahrzeuge und summiert das Ergebnis", async () => {
    const tid = wert<{ id: string }>(await createTemplate({ name: "S" }, t.db)).id;
    const a = artikelAnlegen();
    await templatePositionSetzen({ templateId: tid, fachLabel: "F1", artikelId: a, soll: 2 }, t.db);
    const f1 = fahrzeugAnlegen("RTW 1"), f2 = fahrzeugAnlegen("RTW 2");
    await fahrzeugTemplateZuweisen({ fahrzeugId: f1, templateId: tid }, t.db);
    await fahrzeugTemplateZuweisen({ fahrzeugId: f2, templateId: tid }, t.db);
    const erg = await templateAufFahrzeugeSyncen({ templateId: tid }, t.db);
    expect(wert<{ fahrzeuge: number }>(erg).fahrzeuge).toBe(2);
  });

  it("fahrzeugTemplateSync liefert das SyncErgebnis zurueck", async () => {
    const tid = wert<{ id: string }>(await createTemplate({ name: "S" }, t.db)).id;
    const fz = fahrzeugAnlegen();
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz, templateId: tid }, t.db);
    const erg = await fahrzeugTemplateSync({ fahrzeugId: fz }, t.db);
    expect(wert<{ hinzugefuegt: number }>(erg)).toHaveProperty("hinzugefuegt");
  });

  it("templateAusFahrzeug uebernimmt die nicht entfernten Positionen und adoptiert sie", async () => {
    const fz = fahrzeugAnlegen();
    const a = artikelAnlegen("A"), b = artikelAnlegen("B");
    t.db.insert(sollPositionen).values([
      { id: newId(), fahrzeugId: fz, fachLabel: "F1", artikelId: a, soll: 2, sort: 0 },
      { id: newId(), fahrzeugId: fz, fachLabel: "F1", artikelId: b, soll: 1, sort: 1, entfernt: true },
    ]).run();
    const erg = await templateAusFahrzeug({ fahrzeugId: fz, name: "Aus RTW 1", verknuepfen: true }, t.db);
    const tid = wert<{ id: string }>(erg).id;
    // Nur die nicht entfernte Position wandert in die Vorlage.
    expect(t.db.select().from(templatePositionen)
      .where(eq(templatePositionen.templateId, tid)).all()).toHaveLength(1);
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, fz)).get()?.templateId).toBe(tid);
    // Und die vorhandene Zeile wird adoptiert statt verdoppelt.
    const adoptiert = t.db.select().from(sollPositionen).all().filter((p) => p.templatePositionId);
    expect(adoptiert).toHaveLength(1);
  });

  it("templateAusFahrzeug ohne verknuepfen laeszt das Fahrzeug unabhaengig", async () => {
    const fz = fahrzeugAnlegen();
    const a = artikelAnlegen();
    t.db.insert(sollPositionen).values({ id: newId(), fahrzeugId: fz, fachLabel: "F1",
      artikelId: a, soll: 2, sort: 0 }).run();
    await templateAusFahrzeug({ fahrzeugId: fz, name: "Kopie", verknuepfen: false }, t.db);
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, fz)).get()?.templateId).toBeNull();
  });
});

describe("Bauform", () => {
  it("loeseFahrzeugVonTemplate ist KEIN Export", async () => {
    // In einer "use server"-Datei waere jeder Export eine Server Action — und
    // diese Funktion nimmt eine Transaktion entgegen, die kein Client
    // uebergeben kann.
    const mod = await import("./templates");
    expect(Object.keys(mod)).not.toContain("loeseFahrzeugVonTemplate");
    expect(Object.keys(mod)).toHaveLength(11);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/templates.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./templates"`.

- [ ] **Schritt 3: `_actions/templates.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { and, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { fahrzeugTemplates, templatePositionen, lagerorte, sollPositionen, newId }
  from "../_db/schema";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { syncFahrzeugTemplate, type SyncErgebnis } from "../_lib/schreibpfade/templateSync";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";

/**
 * ⚠️ EIN REVALIDIERUNGS-HELFER FUER ELF ACTIONS.
 *
 * Der Bestand hat ihn (`templates.ts:10-14`), und er wandert MIT. Wer ihn
 * aufloest und je Action ausschreibt, hat elf Stellen, an denen die Liste
 * auseinanderlaufen kann — bei einer Datei, deren Actions sich gegenseitig
 * aufrufen, ist das die teuerste Sorte Kopie. Nur die drei Pfade wechseln auf
 * die INNERE Form.
 */
function revalidate(fahrzeugId?: string) {
  revalidatePath("/m/lagerbuch/verwaltung/vorlagen");
  revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");
  if (fahrzeugId) revalidatePath(`/m/lagerbuch/verwaltung/fahrzeuge/${fahrzeugId}`);
}

const fehlerhaft = (e: unknown): ActionErgebnis<never> => {
  const feldFehler = zodFehler(e);
  return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
};

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * ⚠️ KEIN EXPORT. In einer `"use server"`-Datei waere jeder Export eine Server
 * Action — und diese Funktion nimmt eine Transaktion entgegen, die kein Client
 * uebergeben kann.
 *
 * GRABSTEINE WERDEN VERWORFEN: ohne Verknuepfung ergeben „bewusst
 * ausgelassene Vorlagen-Positionen" keinen Sinn mehr. Die MATERIALISIERTEN
 * Positionen bleiben dagegen als individuelle Bestueckung erhalten — so
 * verliert das Fahrzeug nichts und wird trotzdem unabhaengig.
 */
function loeseFahrzeugVonTemplate(tx: Tx, fahrzeugId: string) {
  tx.delete(sollPositionen)
    .where(and(eq(sollPositionen.fahrzeugId, fahrzeugId), eq(sollPositionen.entfernt, true)))
    .run();
  tx.update(sollPositionen)
    .set({ templatePositionId: null, ueberschrieben: false })
    .where(and(eq(sollPositionen.fahrzeugId, fahrzeugId),
               isNotNull(sollPositionen.templatePositionId)))
    .run();
  tx.update(lagerorte).set({ templateId: null }).where(eq(lagerorte.id, fahrzeugId)).run();
}

// ── Vorlagen ────────────────────────────────────────────────────────────────

const TemplateSchema = z.object({ name: z.string().trim().min(1, "Name darf nicht leer sein") });

export async function createTemplate(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof TemplateSchema>;
  try { v = TemplateSchema.parse(eingabe); } catch (e) { return fehlerhaft(e); }
  const id = newId();
  db.insert(fahrzeugTemplates)
    .values({ id, name: v.name, aktiv: true, createdAt: new Date() })
    .run();
  revalidate();
  return { ok: true, wert: { id } };
}

const RenameSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
});

export async function renameTemplate(eingabe: unknown, db: DB = getDb()): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof RenameSchema>;
  try { v = RenameSchema.parse(eingabe); } catch (e) { return fehlerhaft(e); }
  db.update(fahrzeugTemplates).set({ name: v.name }).where(eq(fahrzeugTemplates.id, v.id)).run();
  revalidate();
  return { ok: true };
}

const TemplateAktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });

export async function setTemplateAktiv(eingabe: unknown, db: DB = getDb()): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof TemplateAktivSchema>;
  try { v = TemplateAktivSchema.parse(eingabe); } catch { return { ok: false, fehler: "Ungültige Eingabe." }; }
  db.update(fahrzeugTemplates).set({ aktiv: v.aktiv }).where(eq(fahrzeugTemplates.id, v.id)).run();
  revalidate();
  return { ok: true };
}

/**
 * Loescht eine Vorlage. Verknuepfte Fahrzeuge werden VORHER geloest — ihre
 * materialisierten Positionen bleiben als individuelle Bestueckung erhalten,
 * damit kein Fremdschluessel bricht und kein Fahrzeug leer zurueckbleibt.
 */
const DeleteTemplateSchema = z.object({ id: z.string().min(1) });

export async function deleteTemplate(eingabe: unknown, db: DB = getDb()): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof DeleteTemplateSchema>;
  try { v = DeleteTemplateSchema.parse(eingabe); } catch { return { ok: false, fehler: "Ungültige Eingabe." }; }
  try {
    db.transaction((tx) => {
      const fahrzeuge = tx.select().from(lagerorte).where(eq(lagerorte.templateId, v.id)).all();
      for (const f of fahrzeuge) loeseFahrzeugVonTemplate(tx, f.id);
      tx.delete(templatePositionen).where(eq(templatePositionen.templateId, v.id)).run();
      tx.delete(fahrzeugTemplates).where(eq(fahrzeugTemplates.id, v.id)).run();
    });
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : "Vorlage konnte nicht gelöscht werden." };
  }
  revalidate();
  return { ok: true };
}

// ── Vorlagen-Positionen ─────────────────────────────────────────────────────

const TemplatePosSchema = z.object({
  id: z.string().min(1).optional(),
  templateId: z.string().min(1),
  fachLabel: z.string().trim().min(1, "Fach darf nicht leer sein"),
  artikelId: z.string().min(1, "Artikel wählen"),
  soll: z.coerce.number().int().positive("Soll muss größer als 0 sein"),
  sort: z.coerce.number().int().default(0),
});

export async function templatePositionSetzen(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof TemplatePosSchema>;
  try { v = TemplatePosSchema.parse(eingabe); } catch (e) { return fehlerhaft(e); }
  const id = v.id ?? newId();
  const felder = { templateId: v.templateId, fachLabel: v.fachLabel,
                   artikelId: v.artikelId, soll: v.soll, sort: v.sort };
  if (v.id) db.update(templatePositionen).set(felder).where(eq(templatePositionen.id, v.id)).run();
  else db.insert(templatePositionen).values({ id, ...felder }).run();
  revalidate();
  return { ok: true, wert: { id } };
}

const TemplatePosEntfernenSchema = z.object({ id: z.string().min(1) });

/**
 * ⚠️ REFERENZIERENDE FAHRZEUG-POSITIONEN WERDEN ZUERST AUFGELOEST, sonst
 * bricht der Fremdschluessel. Dieselbe Logik wie beim Sync von Waisen:
 * UEBERSCHRIEBENE Zeilen bleiben als manuelle erhalten, der Rest wird
 * geloescht.
 *
 * Das Bedienelement ist ein `Popconfirm` (§6.4.5, Fall 2): eine
 * `template_positionen`-Zeile ist nach dem Loeschen tatsaechlich weg und steht
 * in keiner Historie — sie traegt aber nichts als ihre eigene Sollzahl. Wer sie
 * versehentlich entfernt, tippt sie in zehn Sekunden neu. Kein Bestand haengt
 * daran, keine Buchung verweist darauf.
 */
export async function templatePositionEntfernen(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof TemplatePosEntfernenSchema>;
  try { v = TemplatePosEntfernenSchema.parse(eingabe); } catch { return { ok: false, fehler: "Ungültige Eingabe." }; }
  db.transaction((tx) => {
    const referenzierend = tx.select().from(sollPositionen)
      .where(eq(sollPositionen.templatePositionId, v.id)).all();
    for (const r of referenzierend) {
      if (r.ueberschrieben) {
        tx.update(sollPositionen)
          .set({ templatePositionId: null, ueberschrieben: false })
          .where(eq(sollPositionen.id, r.id)).run();
      } else {
        tx.delete(sollPositionen).where(eq(sollPositionen.id, r.id)).run();
      }
    }
    tx.delete(templatePositionen).where(eq(templatePositionen.id, v.id)).run();
  });
  revalidate();
  return { ok: true };
}

// ── Fahrzeug ↔ Vorlage ──────────────────────────────────────────────────────

const ZuweisenSchema = z.object({ fahrzeugId: z.string().min(1), templateId: z.string().min(1) });

export async function fahrzeugTemplateZuweisen(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<SyncErgebnis>> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof ZuweisenSchema>;
  try { v = ZuweisenSchema.parse(eingabe); } catch (e) { return fehlerhaft(e); }
  let erg!: SyncErgebnis;
  db.transaction((tx) => {
    tx.update(lagerorte).set({ templateId: v.templateId }).where(eq(lagerorte.id, v.fahrzeugId)).run();
    erg = syncFahrzeugTemplate(tx, v.fahrzeugId);
  });
  revalidate(v.fahrzeugId);
  return { ok: true, wert: erg };
}

const SyncSchema = z.object({ fahrzeugId: z.string().min(1) });

export async function fahrzeugTemplateSync(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<SyncErgebnis>> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof SyncSchema>;
  try { v = SyncSchema.parse(eingabe); } catch { return { ok: false, fehler: "Ungültige Eingabe." }; }
  let erg!: SyncErgebnis;
  db.transaction((tx) => { erg = syncFahrzeugTemplate(tx, v.fahrzeugId); });
  revalidate(v.fahrzeugId);
  return { ok: true, wert: erg };
}

const SyncAlleSchema = z.object({ templateId: z.string().min(1) });

export async function templateAufFahrzeugeSyncen(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<SyncErgebnis & { fahrzeuge: number }>> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof SyncAlleSchema>;
  try { v = SyncAlleSchema.parse(eingabe); } catch { return { ok: false, fehler: "Ungültige Eingabe." }; }
  let fahrzeuge = 0;
  const summe: SyncErgebnis = { hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 0, entfernt: 0, losgeloest: 0 };
  db.transaction((tx) => {
    const rows = tx.select().from(lagerorte).where(eq(lagerorte.templateId, v.templateId)).all();
    fahrzeuge = rows.length;
    for (const f of rows) {
      const e = syncFahrzeugTemplate(tx, f.id);
      summe.hinzugefuegt += e.hinzugefuegt;
      summe.aktualisiert += e.aktualisiert;
      summe.uebersprungen += e.uebersprungen;
      summe.entfernt += e.entfernt;
      summe.losgeloest += e.losgeloest;
    }
  });
  revalidate();
  return { ok: true, wert: { fahrzeuge, ...summe } };
}

const LoesenSchema = z.object({ fahrzeugId: z.string().min(1) });

export async function fahrzeugTemplateLoesen(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof LoesenSchema>;
  try { v = LoesenSchema.parse(eingabe); } catch { return { ok: false, fehler: "Ungültige Eingabe." }; }
  db.transaction((tx) => loeseFahrzeugVonTemplate(tx, v.fahrzeugId));
  revalidate(v.fahrzeugId);
  return { ok: true };
}

/**
 * Erstellt eine neue Vorlage aus der aktuellen (nicht entfernten) Bestueckung
 * eines Fahrzeugs. Ideal, um „mehrere identisch gepackte Fahrzeuge" zu
 * vereinheitlichen: ein gut gepacktes Fahrzeug wird zur Vorlage, die dann auf
 * die uebrigen uebertragen wird.
 *
 * ⚠️ Mit `verknuepfen` werden die VORHANDENEN Zeilen ADOPTIERT statt neu
 * angelegt — sonst stuende jede Position danach doppelt am Fahrzeug. Die
 * Zuordnung laeuft in Anlage-Reihenfolge (gleiche Menge, gleiche Reihenfolge).
 */
const AusFahrzeugSchema = z.object({
  fahrzeugId: z.string().min(1),
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  verknuepfen: z.boolean().default(true),
});

export async function templateAusFahrzeug(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof AusFahrzeugSchema>;
  try { v = AusFahrzeugSchema.parse(eingabe); } catch (e) { return fehlerhaft(e); }
  const templateId = newId();
  db.transaction((tx) => {
    tx.insert(fahrzeugTemplates)
      .values({ id: templateId, name: v.name, aktiv: true, createdAt: new Date() }).run();
    const rows = tx.select().from(sollPositionen)
      .where(eq(sollPositionen.fahrzeugId, v.fahrzeugId)).all().filter((r) => !r.entfernt);
    for (const r of rows) {
      tx.insert(templatePositionen)
        .values({ id: newId(), templateId, fachLabel: r.fachLabel, sort: r.sort,
                  artikelId: r.artikelId, soll: r.soll }).run();
    }
    if (v.verknuepfen) {
      tx.update(lagerorte).set({ templateId }).where(eq(lagerorte.id, v.fahrzeugId)).run();
      const tpRows = tx.select().from(templatePositionen)
        .where(eq(templatePositionen.templateId, templateId)).all();
      const soll = tx.select().from(sollPositionen)
        .where(eq(sollPositionen.fahrzeugId, v.fahrzeugId)).all().filter((r) => !r.entfernt);
      for (let i = 0; i < soll.length && i < tpRows.length; i++) {
        tx.update(sollPositionen)
          .set({ templatePositionId: tpRows[i].id, ueberschrieben: false })
          .where(eq(sollPositionen.id, soll[i].id)).run();
      }
    }
  });
  revalidate(v.fahrzeugId);
  return { ok: true, wert: { id: templateId } };
}
```

- [ ] **Schritt 4: Grün und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/templates.test.ts
rtk git add src/app/m/lagerbuch/_actions/templates.ts src/app/m/lagerbuch/_actions/templates.test.ts
rtk git commit -m "feat(lagerbuch): _actions/templates.ts — elf Actions, EIN Revalidierungs-Helfer

Der Helfer wandert mit: elf Actions, eine Liste. Wer ihn aufloest, hat elf
Stellen, an denen sie auseinanderlaufen kann — bei einer Datei, deren Actions
sich gegenseitig aufrufen, die teuerste Sorte Kopie. Nur die drei Pfade
wechseln auf die innere Form.

loeseFahrzeugVonTemplate ist KEIN Export: in einer use-server-Datei waere
jeder Export eine Server Action, und sie nimmt eine Transaktion entgegen.

Beim Loesen werden Grabsteine verworfen (ohne Verknuepfung sinnlos) und die
materialisierten Positionen bleiben als individuelle Bestueckung — das
Fahrzeug verliert nichts und wird trotzdem unabhaengig.

templateAusFahrzeug ADOPTIERT die vorhandenen Zeilen statt sie neu anzulegen,
sonst stuende jede Position danach doppelt am Fahrzeug."
```

---

### Task 120: `_actions/lagerortVerfall.ts` — nur was im Soll steht

**Files:** Create `_actions/lagerortVerfall.ts`; Test `_actions/lagerortVerfall.test.ts`.

⚠️ **Die Datei heißt im Zielmodul `lagerortVerfall.ts`, im Bestand heißt sie `lagerort-verfall.ts`.**
Spec §2.1 a legt die Umbenennung ausdrücklich fest, und Teil 6 §4.1 führt bereits den neuen Namen.
Alle Bestandsbelege in diesem Plan (`lagerort-verfall.ts:38-40`) nennen weiterhin den **alten**
Namen — sie zeigen auf `../lagerbuch` @ `ca04eb1` und dürfen nicht mitumbenannt werden.

**Interfaces:**
- Consumes: `requireLagerbuchAdmin`; `_lib/schreibpfade/lagerortVerfall.ts` (Teil 3, T55) —
  `setzeVerfall(db|tx, { lagerortId, artikelId, verfall, quelle })`; `_lib/konstanten.ts` —
  `MONAT_REGEX`; `_db/schema.ts` — `lagerorte`, `sollPositionen`.
- Produces:
  ```ts
  export async function verfallSetzen(
    eingabe: unknown, db?: DB): Promise<ActionErgebnis<{ gesetzt: boolean }>>;
  ```
  Konsument: `verwaltung/(arbeit)/fahrzeuge/[id]/VerfallEditor.tsx` (T132) — `DatePicker
  picker="month"` je Artikel, **auto-committend**.
- **`revalidatePath`:** `` /m/lagerbuch/verwaltung/fahrzeuge/${lagerortId} `` ·
  `/m/lagerbuch/verwaltung/fahrzeuge` · `/m/lagerbuch/verwaltung/verfall`.

⚠️ **Nur Artikel, die an diesem Lagerort im Soll stehen.** Ohne die Prüfung entstünden
**Verfall-Karteileichen** für beliebige Artikel: eine Zeile in `lagerort_verfall`, zu der es am
Fahrzeug gar keine Position gibt — sie erschiene in der Verfallsliste und ließe sich dort nicht
auflösen. Die Prüfung ignoriert bewusst `entfernt`: ein Grabstein bedeutet „gerade nicht bestückt",
nicht „gehört hier nicht her".

⚠️ **Leerstring und `null` bedeuten „Angabe entfernen".** Der Verfall ist überall optional; ein
`DatePicker` mit `allowClear` liefert `null`. `verfallSetzen` gibt deshalb `{ gesetzt: boolean }`
zurück, damit die Insel „gespeichert" von „entfernt" unterscheiden kann.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, lagerorte, lagerortVerfall, sollPositionen, newId } from "../_db/schema";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: [], name: null, email: null }),
}));
import { verfallSetzen } from "./lagerortVerfall";

let t: TestDb;
function aufbau(mitSoll = true, entfernt = false) {
  const fz = newId(), a = newId();
  t.db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", aktiv: true }).run();
  t.db.insert(artikel).values({ id: a, name: "Mull", einheit: "Stk", fach: "A1",
    mindestbestand: 1, aktiv: true, createdAt: new Date() }).run();
  if (mitSoll) {
    t.db.insert(sollPositionen).values({ id: newId(), fahrzeugId: fz, fachLabel: "F1",
      artikelId: a, soll: 2, sort: 0, entfernt }).run();
  }
  return { fz, a };
}
const eintrag = (fz: string, a: string) => t.db.select().from(lagerortVerfall)
  .where(and(eq(lagerortVerfall.lagerortId, fz), eq(lagerortVerfall.artikelId, a))).get();

beforeEach(() => { t = migrierteTestDb("lagerbuch-actions-lov-"); revalidiert.length = 0; });
afterEach(() => { t.schliessen(); });

describe("verfallSetzen", () => {
  it("setzt den Verfall und revalidiert drei Pfade", async () => {
    const { fz, a } = aufbau();
    const erg = await verfallSetzen({ lagerortId: fz, artikelId: a, verfall: "2027-03" }, t.db);
    expect((erg as { ok: true; wert: { gesetzt: boolean } }).wert.gesetzt).toBe(true);
    expect(eintrag(fz, a)?.verfall).toBe("2027-03");
    expect(revalidiert).toEqual([
      `/m/lagerbuch/verwaltung/fahrzeuge/${fz}`,
      "/m/lagerbuch/verwaltung/fahrzeuge",
      "/m/lagerbuch/verwaltung/verfall",
    ]);
  });

  it("entfernt die Angabe bei null und bei Leerstring", async () => {
    const { fz, a } = aufbau();
    await verfallSetzen({ lagerortId: fz, artikelId: a, verfall: "2027-03" }, t.db);
    const erg = await verfallSetzen({ lagerortId: fz, artikelId: a, verfall: null }, t.db);
    expect((erg as { ok: true; wert: { gesetzt: boolean } }).wert.gesetzt).toBe(false);
    expect(eintrag(fz, a)).toBeUndefined();
    await verfallSetzen({ lagerortId: fz, artikelId: a, verfall: "2027-03" }, t.db);
    await verfallSetzen({ lagerortId: fz, artikelId: a, verfall: "" }, t.db);
    expect(eintrag(fz, a)).toBeUndefined();
  });

  it("lehnt einen Artikel ab, der an diesem Lagerort NICHT im Soll steht", async () => {
    // Sonst entstuenden Verfall-Karteileichen: eine Zeile, zu der es am
    // Fahrzeug gar keine Position gibt — sie erschiene in der Verfallsliste
    // und liesze sich dort nicht aufloesen.
    const { fz, a } = aufbau(false);
    const erg = await verfallSetzen({ lagerortId: fz, artikelId: a, verfall: "2027-03" }, t.db);
    expect(erg.ok).toBe(false);
    expect((erg as { ok: false; fehler: string }).fehler).toMatch(/nicht im Soll/i);
    expect(revalidiert).toEqual([]);
  });

  it("ein GRABSTEIN zaehlt weiterhin als „steht im Soll\"", async () => {
    // Ein Grabstein bedeutet „gerade nicht bestueckt", nicht „gehoert hier
    // nicht her".
    const { fz, a } = aufbau(true, true);
    expect((await verfallSetzen({ lagerortId: fz, artikelId: a, verfall: "2027-03" }, t.db)).ok)
      .toBe(true);
  });

  it("lehnt einen unbekannten Lagerort ab", async () => {
    const { a } = aufbau();
    expect((await verfallSetzen({ lagerortId: "gibtsnicht", artikelId: a, verfall: "2027-03" }, t.db)).ok)
      .toBe(false);
  });

  it("lehnt ein Datum ab, das nicht YYYY-MM ist", async () => {
    const { fz, a } = aufbau();
    const erg = await verfallSetzen({ lagerortId: fz, artikelId: a, verfall: "03/2027" }, t.db);
    expect(erg.ok).toBe(false);
    expect((erg as { ok: false; feldFehler?: Record<string, string> }).feldFehler)
      .toHaveProperty("verfall");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/lagerortVerfall.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./lagerortVerfall"`.

- [ ] **Schritt 3: `_actions/lagerortVerfall.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { lagerorte, sollPositionen } from "../_db/schema";
import { MONAT_REGEX } from "../_lib/konstanten";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { setzeVerfall } from "../_lib/schreibpfade/lagerortVerfall";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";

const VerfallSchema = z.object({
  lagerortId: z.string().min(1),
  artikelId: z.string().min(1),
  // "" bzw. null = Angabe entfernen (der Verfall ist ueberall optional; ein
  // `DatePicker` mit `allowClear` liefert `null`).
  verfall: z
    .union([z.string().regex(MONAT_REGEX, "Verfall muss das Format YYYY-MM haben"), z.literal("")])
    .nullable()
    .transform((v) => v || null),
});

/**
 * PFLEGT DEN IM FAHRZEUG ABGELESENEN VERFALL EINES ARTIKELS aus der Verwaltung
 * heraus — dieselbe Angabe, die der Helfer im Fahrzeug-Check macht.
 *
 * ⚠️ ERLAUBT SIND NUR ARTIKEL, DIE AN DIESEM LAGERORT IM SOLL STEHEN. Ohne
 * diese Pruefung entstuenden Verfall-Karteileichen fuer beliebige Artikel:
 * eine Zeile in `lagerort_verfall`, zu der es am Fahrzeug gar keine Position
 * gibt — sie erschiene in der Verfallsliste und liesze sich dort nicht
 * aufloesen.
 *
 * Die Pruefung ignoriert `entfernt` bewusst: ein GRABSTEIN bedeutet „gerade
 * nicht bestueckt", nicht „gehoert hier nicht her".
 *
 * Der Rueckgabewert traegt `gesetzt`, damit die Insel „gespeichert" von
 * „entfernt" unterscheiden kann — beides ist ein Erfolg, aber nicht dieselbe
 * Rueckmeldung.
 */
export async function verfallSetzen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ gesetzt: boolean }>> {
  const viewer = await requireLagerbuchAdmin();
  let v: z.output<typeof VerfallSchema>;
  try {
    v = VerfallSchema.parse(eingabe);
  } catch (e) {
    const feldFehler = zodFehler(e);
    return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
  }

  const ort = db.select().from(lagerorte).where(eq(lagerorte.id, v.lagerortId)).get();
  if (!ort) return { ok: false, fehler: "Lagerort nicht gefunden." };

  const imSoll = db
    .select({ id: sollPositionen.id })
    .from(sollPositionen)
    .where(and(eq(sollPositionen.fahrzeugId, v.lagerortId),
               eq(sollPositionen.artikelId, v.artikelId)))
    .all().length;
  if (imSoll === 0) return { ok: false, fehler: "Artikel steht an diesem Lagerort nicht im Soll." };

  setzeVerfall(db, {
    lagerortId: v.lagerortId,
    artikelId: v.artikelId,
    verfall: v.verfall,
    quelle: { quelleTyp: "oidc", quelleId: viewer.sub },
  });

  revalidatePath(`/m/lagerbuch/verwaltung/fahrzeuge/${v.lagerortId}`);
  revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");
  revalidatePath("/m/lagerbuch/verwaltung/verfall");
  return { ok: true, wert: { gesetzt: v.verfall !== null } };
}
```

- [ ] **Schritt 4: Grün und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/lagerortVerfall.test.ts
rtk git add src/app/m/lagerbuch/_actions/lagerortVerfall.ts \
            src/app/m/lagerbuch/_actions/lagerortVerfall.test.ts
rtk git commit -m "feat(lagerbuch): _actions/lagerortVerfall.ts — nur was im Soll steht

Ohne die Soll-Pruefung entstuenden Verfall-Karteileichen: eine Zeile, zu der
es am Fahrzeug gar keine Position gibt — sie erschiene in der Verfallsliste
und liesze sich dort nicht aufloesen. Grabsteine zaehlen bewusst mit ('gerade
nicht bestueckt' ist nicht 'gehoert hier nicht her').

null und Leerstring entfernen die Angabe; der Rueckgabewert traegt `gesetzt`,
damit die Insel 'gespeichert' von 'entfernt' unterscheiden kann."
```

---

### Task 121: `_actions/geraete.ts` und `_db/barcode.ts` — ein Barcode, zwei Tabellen

**Files:** Create `_db/barcode.ts`, `_actions/geraete.ts`; Test `_db/barcode.test.ts`,
`_actions/geraete.test.ts`.

**Interfaces:**
- Consumes: `requireLagerbuchAdmin`; `_lib/lesepfade/geraete.ts` (Teil 3, T53) — `geraetByBarcode`;
  `_lib/lesepfade/bz.ts` (Teil 3, T51) — nur für den Barcode-Riegel; `_db/schema.ts` — `geraete`,
  `bzGeraete`, `newId`; `_lib/konstanten.ts` — `TAG_REGEX`, `GERAETE_TYPEN`.
  ⚠️ **`_lib/barcode.ts` (Teil 4, T62) — `normalisiereBarcode(roh: string): string`.**
  Die EINE Normalisierungsstelle des Moduls; sie wird **nicht** nachgebaut (Teil 4 nennt genau diese
  Action als Konsumenten).

- Produces:
  ```ts
  // _db/barcode.ts — KEIN "use client", KEIN "use server".
  export type BarcodeBesitzer = { tabelle: "geraet" | "bzGeraet"; id: string };
  export function pruefeBarcodeFrei(
    db: DB, barcode: string, ausnahme: BarcodeBesitzer | null): void;   // wirft bei Kollision

  // _actions/geraete.ts — "use server"
  export async function geraetSpeichern(e: unknown, db?: DB): Promise<ActionErgebnis<{ id: string }>>;
  export async function setGeraetAktiv(e: unknown, db?: DB): Promise<ActionErgebnis>;
  export async function geraetZuBarcode(rohwert: string, db?: DB): Promise<ActionErgebnis<{ id: string } | null>>;
  ```
  Konsumenten: `NeuGeraet` (T143), `GeraetForm` und `GeraetAktivToggle` (T144), `GeraetScanner`
  (T138).
- ⚠️ **`_db/barcode.ts` ist NICHT `_lib/barcode.ts`.** Letztere gehört **Teil 4** (§7.6.2) und
  normalisiert die **Scanner-Nutzlast**; diese hier ist die **Eindeutigkeitsprüfung über zwei
  Tabellen** und liegt unter `_db/`, weil sie nur eine Zeilenform kennt und keine Seite. Sie ist die
  dritte benannte Ausnahme neben `quelle.ts` und `etiketten.ts`.
- **`revalidatePath`:** `geraetSpeichern` → `/m/lagerbuch/verwaltung/geraete`,
  `` /m/lagerbuch/verwaltung/geraete/${id} `` · `setGeraetAktiv` → dieselben zwei ·
  `geraetZuBarcode` → **keine** (liest nur).

⚠️ **Ein Barcode darf nicht zweimal vergeben sein — auch nicht über die Tabellengrenze.** `geraete`
und `bz_geraete` sind zwei Tabellen, `/g/<code>` ist **ein** Pfad. Ohne die Prüfung führte derselbe
Scan mal zum Gerät und mal zum BZ-Gerät, abhängig von der Suchreihenfolge. Das Schema hat dafür
**bewusst keinen** `UNIQUE`-Index über zwei Tabellen — SQLite kann das nicht, und die Prüfung liegt
deshalb in der Anwendung (Teil 1, T7).

⚠️ **Typfremde Felder werden auf `null` gehalten.** `medizin` hat `mtkFaellig`, `objekt` hat
`beschreibung` und `ablaufdatum`. Wer sie stehen lässt, bekommt einen Datensatz, der je nach Typ
verschiedene Felder trägt — und `geraetFaelligkeit` (Teil 3, T35) entscheidet **am Typ**, welches
Datum zählt.

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

`src/app/m/lagerbuch/_db/barcode.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { pruefeBarcodeFrei } from "./barcode";
import { bzGeraete, geraete, lagerorte, newId } from "./schema";

let t: TestDb; let ort: string;
beforeEach(() => {
  t = migrierteTestDb("lagerbuch-barcode-");
  ort = newId();
  t.db.insert(lagerorte).values({ id: ort, name: "Lager", typ: "lager", aktiv: true }).run();
});
afterEach(() => { t.schliessen(); });

describe("pruefeBarcodeFrei", () => {
  it("laeszt einen freien Barcode durch", () => {
    expect(() => pruefeBarcodeFrei(t.db, "SN-1", null)).not.toThrow();
  });

  it("meldet eine Kollision innerhalb von `geraete`", () => {
    t.db.insert(geraete).values({ id: newId(), typ: "objekt", name: "G", barcode: "SN-1",
      lagerortId: ort, aktiv: true, createdAt: new Date() }).run();
    expect(() => pruefeBarcodeFrei(t.db, "SN-1", null)).toThrow(/bereits vergeben/i);
  });

  it("meldet eine Kollision UEBER die Tabellengrenze", () => {
    // `geraete` und `bz_geraete` sind zwei Tabellen, `/g/<code>` ist EIN Pfad.
    // Ohne diese Pruefung fuehrte derselbe Scan mal hierhin und mal dorthin.
    t.db.insert(bzGeraete).values({ id: newId(), name: "BZ", barcode: "SN-1",
      lagerortId: ort, aktiv: true, createdAt: new Date() }).run();
    expect(() => pruefeBarcodeFrei(t.db, "SN-1", null)).toThrow(/bereits vergeben/i);
  });

  it("laeszt den eigenen Datensatz beim Bearbeiten durch", () => {
    const id = newId();
    t.db.insert(geraete).values({ id, typ: "objekt", name: "G", barcode: "SN-1",
      lagerortId: ort, aktiv: true, createdAt: new Date() }).run();
    expect(() => pruefeBarcodeFrei(t.db, "SN-1", { tabelle: "geraet", id })).not.toThrow();
    // Aber NICHT den gleichnamigen Datensatz der anderen Tabelle.
    expect(() => pruefeBarcodeFrei(t.db, "SN-1", { tabelle: "bzGeraet", id })).toThrow();
  });
});
```

`src/app/m/lagerbuch/_actions/geraete.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { geraete, lagerorte, newId } from "../_db/schema";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: [], name: null, email: null }),
}));
import { geraetSpeichern, setGeraetAktiv, geraetZuBarcode } from "./geraete";

let t: TestDb; let ort: string;
const wert = <T>(e: unknown) => (e as { ok: true; wert: T }).wert;
beforeEach(() => {
  t = migrierteTestDb("lagerbuch-actions-geraete-");
  ort = newId();
  t.db.insert(lagerorte).values({ id: ort, name: "Lager", typ: "lager", aktiv: true }).run();
  revalidiert.length = 0;
});
afterEach(() => { t.schliessen(); });

describe("geraetSpeichern", () => {
  it("legt ein medizinisches Geraet an und haelt objekt-Felder auf null", async () => {
    const erg = await geraetSpeichern({ typ: "medizin", name: "Defi", lagerortId: ort,
      mtkFaellig: "2027-05-31", beschreibung: "wird ignoriert", ablaufdatum: "2028-01-01" }, t.db);
    const id = wert<{ id: string }>(erg).id;
    const z = t.db.select().from(geraete).where(eq(geraete.id, id)).get();
    // Pro Typ ein sauberer Datensatz: geraetFaelligkeit (Teil 3) entscheidet
    // AM TYP, welches Datum zaehlt.
    expect(z).toMatchObject({ typ: "medizin", mtkFaellig: "2027-05-31",
                              beschreibung: null, ablaufdatum: null });
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/geraete",
      `/m/lagerbuch/verwaltung/geraete/${id}`,
    ]);
  });

  it("legt ein Objekt an und haelt mtkFaellig auf null", async () => {
    const erg = await geraetSpeichern({ typ: "objekt", name: "Zelt", lagerortId: ort,
      beschreibung: "4x4", ablaufdatum: "2029-12-31", mtkFaellig: "2027-01-01" }, t.db);
    const z = t.db.select().from(geraete).where(eq(geraete.id, wert<{ id: string }>(erg).id)).get();
    expect(z).toMatchObject({ typ: "objekt", mtkFaellig: null,
                              beschreibung: "4x4", ablaufdatum: "2029-12-31" });
  });

  it("meldet einen kollidierenden Barcode als Rueckgabewert", async () => {
    await geraetSpeichern({ typ: "objekt", name: "A", lagerortId: ort, barcode: "SN-1" }, t.db);
    revalidiert.length = 0;
    const erg = await geraetSpeichern({ typ: "objekt", name: "B", lagerortId: ort, barcode: "SN-1" }, t.db);
    expect(erg.ok).toBe(false);
    expect(revalidiert).toEqual([]);
  });

  it("aktualisiert beim Bearbeiten und behaelt die Kennung", async () => {
    const id = wert<{ id: string }>(
      await geraetSpeichern({ typ: "objekt", name: "A", lagerortId: ort }, t.db)).id;
    await geraetSpeichern({ id, typ: "objekt", name: "A neu", lagerortId: ort }, t.db);
    expect(t.db.select().from(geraete).all()).toHaveLength(1);
    expect(t.db.select().from(geraete).where(eq(geraete.id, id)).get()?.name).toBe("A neu");
  });

  it("lehnt ein Datum ab, das nicht YYYY-MM-DD ist", async () => {
    expect((await geraetSpeichern({ typ: "medizin", name: "D", lagerortId: ort,
      mtkFaellig: "31.05.2027" }, t.db)).ok).toBe(false);
  });
});

describe("setGeraetAktiv", () => {
  it("schaltet um und revalidiert Liste und Blatt", async () => {
    const id = wert<{ id: string }>(
      await geraetSpeichern({ typ: "objekt", name: "A", lagerortId: ort }, t.db)).id;
    revalidiert.length = 0;
    await setGeraetAktiv({ id, aktiv: false }, t.db);
    expect(t.db.select().from(geraete).where(eq(geraete.id, id)).get()?.aktiv).toBe(false);
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/geraete",
      `/m/lagerbuch/verwaltung/geraete/${id}`,
    ]);
  });
});

describe("geraetZuBarcode", () => {
  it("findet ueber die rohe Seriennummer", async () => {
    const id = wert<{ id: string }>(
      await geraetSpeichern({ typ: "objekt", name: "A", lagerortId: ort, barcode: "SN-1" }, t.db)).id;
    expect(wert<{ id: string } | null>(await geraetZuBarcode(" SN-1 ", t.db))).toEqual({ id });
  });

  it("findet auch ueber einen gedruckten /g/-Deep-Link", async () => {
    const id = wert<{ id: string }>(
      await geraetSpeichern({ typ: "objekt", name: "A", lagerortId: ort, barcode: "SN 1" }, t.db)).id;
    expect(wert<{ id: string } | null>(
      await geraetZuBarcode("https://lagerbuch.example/g/SN%201", t.db))).toEqual({ id });
  });

  it("liefert null statt eines Fehlers, wenn nichts passt", async () => {
    expect(wert<{ id: string } | null>(await geraetZuBarcode("unbekannt", t.db))).toBeNull();
    expect(revalidiert).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/barcode.test.ts src/app/m/lagerbuch/_actions/geraete.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./barcode"` in `_db/barcode.test.ts` und
`Failed to resolve import "./geraete"` in `_actions/geraete.test.ts` — **beide Läufe müssen rot**
sein. Ist nur einer rot, ist die andere Datei schon da und der Task hat keinen roten Anfang.

- [ ] **Schritt 3: `_db/barcode.ts` schreiben**

```ts
import { eq } from "drizzle-orm";
import type { DB } from "./client";
import { bzGeraete, geraete } from "./schema";

/**
 * DIE BARCODE-EINDEUTIGKEIT UEBER ZWEI TABELLEN.
 *
 * `geraete` und `bz_geraete` sind zwei Tabellen, `/g/<code>` ist EIN Pfad.
 * Waere ein Barcode doppelt vergeben, fuehrte derselbe Scan mal zum Geraet und
 * mal zum BZ-Geraet — abhaengig von der Suchreihenfolge, also zufaellig. Das
 * Schema hat dafuer bewusst KEINEN Index: SQLite kennt keinen `UNIQUE` ueber
 * zwei Tabellen, und die Pruefung liegt deshalb in der Anwendung (Teil 1, T7).
 *
 * ⚠️ DIESE DATEI IST NICHT `_lib/barcode.ts`. Die gehoert Teil 4 (§7.6.2) und
 * normalisiert die SCANNER-NUTZLAST. Diese hier kennt nur eine Zeilenform und
 * keine Seite — deshalb liegt sie unter `_db/` und ist damit die dritte
 * benannte Ausnahme neben `quelle.ts` und `etiketten.ts`.
 *
 * Sie WIRFT statt zurueckzugeben, weil ihre beiden Aufrufer Server Actions
 * sind, die den Wurf ohnehin in einen Rueckgabewert uebersetzen — und weil ein
 * vergessener Rueckgabewert-Check hier einen doppelten Barcode durchliesze.
 */
export type BarcodeBesitzer = { tabelle: "geraet" | "bzGeraet"; id: string };

export function pruefeBarcodeFrei(
  db: DB,
  barcode: string,
  ausnahme: BarcodeBesitzer | null,
): void {
  const inGeraeten = db.select({ id: geraete.id }).from(geraete)
    .where(eq(geraete.barcode, barcode)).all();
  for (const z of inGeraeten) {
    if (ausnahme?.tabelle === "geraet" && ausnahme.id === z.id) continue;
    throw new Error(`Der Barcode „${barcode}" ist bereits vergeben (Gerät).`);
  }
  const inBz = db.select({ id: bzGeraete.id }).from(bzGeraete)
    .where(eq(bzGeraete.barcode, barcode)).all();
  for (const z of inBz) {
    if (ausnahme?.tabelle === "bzGeraet" && ausnahme.id === z.id) continue;
    throw new Error(`Der Barcode „${barcode}" ist bereits vergeben (BZ-Gerät).`);
  }
}
```

- [ ] **Schritt 4: `_actions/geraete.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { geraete, newId } from "../_db/schema";
import { pruefeBarcodeFrei } from "../_db/barcode";
import { GERAETE_TYPEN, TAG_REGEX } from "../_lib/konstanten";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { geraetByBarcode } from "../_lib/lesepfade/geraete";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";

const GeraetSchema = z.object({
  id: z.string().min(1).optional(),            // gesetzt = Bearbeiten
  typ: z.enum(GERAETE_TYPEN),
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  barcode: z.string().trim().optional(),
  lagerortId: z.string().min(1, "Standort wählen"),
  anmerkung: z.string().trim().optional(),
  mtkFaellig: z.string().regex(TAG_REGEX, "Datum muss YYYY-MM-DD sein").optional(),   // nur medizin
  beschreibung: z.string().trim().optional(),                                          // nur objekt
  ablaufdatum: z.string().regex(TAG_REGEX, "Datum muss YYYY-MM-DD sein").optional(),   // nur objekt
});

const orNull = <T>(v: T | undefined): T | null => (v === undefined || v === "" ? null : v);

/**
 * ⚠️ TYPFREMDE FELDER WERDEN AUF `null` GEHALTEN — pro Typ ein sauberer
 * Datensatz. `geraetFaelligkeit` (Teil 3, T35) entscheidet AM TYP, welches
 * Datum zaehlt: `medizin` liest `mtkFaellig`, `objekt` liest `ablaufdatum`.
 * Ein Datensatz mit beiden Feldern traegt zwei Wahrheiten, und die
 * Faelligkeitsampel zeigte je nach Lesepfad eine andere.
 */
export async function geraetSpeichern(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof GeraetSchema>;
  try {
    v = GeraetSchema.parse(eingabe);
  } catch (e) {
    const feldFehler = zodFehler(e);
    return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
  }

  const barcode = orNull(v.barcode);
  if (barcode) {
    try {
      pruefeBarcodeFrei(db, barcode, v.id ? { tabelle: "geraet", id: v.id } : null);
    } catch (e) {
      return {
        ok: false,
        fehler: e instanceof Error ? e.message : "Barcode bereits vergeben.",
        feldFehler: { barcode: e instanceof Error ? e.message : "bereits vergeben" },
      };
    }
  }

  const istMedizin = v.typ === "medizin";
  const felder = {
    typ: v.typ,
    name: v.name,
    barcode,
    lagerortId: v.lagerortId,
    anmerkung: orNull(v.anmerkung),
    mtkFaellig: istMedizin ? orNull(v.mtkFaellig) : null,
    beschreibung: istMedizin ? null : orNull(v.beschreibung),
    ablaufdatum: istMedizin ? null : orNull(v.ablaufdatum),
  };

  const id = v.id ?? newId();
  if (v.id) db.update(geraete).set(felder).where(eq(geraete.id, v.id)).run();
  else db.insert(geraete).values({ id, aktiv: true, createdAt: new Date(), ...felder }).run();

  revalidatePath("/m/lagerbuch/verwaltung/geraete");
  revalidatePath(`/m/lagerbuch/verwaltung/geraete/${id}`);
  return { ok: true, wert: { id } };
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });

export async function setGeraetAktiv(eingabe: unknown, db: DB = getDb()): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof AktivSchema>;
  try { v = AktivSchema.parse(eingabe); } catch { return { ok: false, fehler: "Ungültige Eingabe." }; }
  db.update(geraete).set({ aktiv: v.aktiv }).where(eq(geraete.id, v.id)).run();
  revalidatePath("/m/lagerbuch/verwaltung/geraete");
  revalidatePath(`/m/lagerbuch/verwaltung/geraete/${v.id}`);
  return { ok: true };
}

/**
 * Sucht ein Geraet zum gescannten Code. Nimmt neben der rohen Seriennummer
 * auch die eigenen `/g/[code]`-Deep-Links an (ein gedrucktes QR-Etikett wird
 * mit derselben Kamera gescannt) und zieht den Code heraus.
 *
 * KEIN `revalidatePath` — die Action liest nur. Sie ist trotzdem eine Action,
 * weil ihr einziger Aufrufer eine Client-Insel ist (Teil 1, F4).
 * Sie liefert `null` statt eines Fehlers: „nicht gefunden" ist ein
 * Normalzustand am Scanner, kein Ausfall.
 */
export async function geraetZuBarcode(
  rohwert: string, db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string } | null>> {
  await requireLagerbuchAdmin();
  // KEIN Nachbau der Normalisierung: `normalisiereBarcode` (Teil 4, T62) ist die
  // EINE Stelle, und sie kann mehr als drei Inline-Zeilen — `decodeURIComponent`
  // steht dort in try/catch. Ein Aufkleber mit kaputtem Prozentzeichen (%ZZ) wirft
  // sonst URIError mitten in einer Server Action.
  const code = normalisiereBarcode(rohwert);
  if (!code) return { ok: true, wert: null };
  return { ok: true, wert: geraetByBarcode(db, code) };
}
```

- [ ] **Schritt 5: Grün und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/barcode.test.ts src/app/m/lagerbuch/_actions/geraete.test.ts
rtk git add src/app/m/lagerbuch/_db/barcode.ts src/app/m/lagerbuch/_db/barcode.test.ts \
            src/app/m/lagerbuch/_actions/geraete.ts src/app/m/lagerbuch/_actions/geraete.test.ts
rtk git commit -m "feat(lagerbuch): _actions/geraete.ts und die Barcode-Eindeutigkeit

pruefeBarcodeFrei prueft ueber ZWEI Tabellen: geraete und bz_geraete sind
zwei Tabellen, /g/<code> ist EIN Pfad. Waere ein Barcode doppelt vergeben,
fuehrte derselbe Scan zufaellig mal hierhin und mal dorthin. SQLite kennt
keinen UNIQUE ueber zwei Tabellen — die Pruefung liegt deshalb in der
Anwendung.

_db/barcode.ts ist NICHT _lib/barcode.ts (Teil 4, §7.6.2 — Normalisierung der
Scanner-Nutzlast). Sie kennt nur eine Zeilenform und keine Seite und ist damit
die dritte benannte _db-Ausnahme neben quelle.ts und etiketten.ts.

Typfremde Felder werden auf null gehalten: geraetFaelligkeit entscheidet am
Typ, welches Datum zaehlt — ein Datensatz mit beiden Feldern traegt zwei
Wahrheiten.

geraetZuBarcode liefert null statt eines Fehlers: 'nicht gefunden' ist am
Scanner ein Normalzustand."
```

---

### Task 122: `_actions/bz.ts` — die Kontrolle friert ihre Referenz ein

**Files:** Create `_actions/bz.ts`; Test `_actions/bz.test.ts`.

**Interfaces:**
- Consumes: `requireLagerbuchAdmin`; `_db/barcode.ts` (T121) — `pruefeBarcodeFrei`;
  `_lib/domain/bz.ts` (Teil 3, T36) — `bewerteKontrolle`; `_lib/lesepfade/bz.ts` (Teil 3, T51) —
  `bzGeraetByBarcode`; `_lib/konstanten.ts` — `MONAT_REGEX`; `_db/schema.ts` — `bzGeraete`,
  `bzKontrollen`, `newId`.
  ⚠️ **`_lib/barcode.ts` (Teil 4, T62) — `normalisiereBarcode(roh: string): string`.**
  Die EINE Normalisierungsstelle des Moduls; sie wird **nicht** nachgebaut (Teil 4 nennt genau diese
  Action als Konsumenten).

- Produces:
  ```ts
  export async function geraetSpeichern(e: unknown, db?: DB): Promise<ActionErgebnis<{ id: string }>>;
  export async function setGeraetAktiv(e: unknown, db?: DB): Promise<ActionErgebnis>;
  export async function geraetZuBarcode(rohwert: string, db?: DB): Promise<ActionErgebnis<{ id: string } | null>>;
  export async function kontrolleErfassen(
    e: unknown, db?: DB): Promise<ActionErgebnis<{ id: string; bestanden: boolean }>>;
  ```
  ⚠️ **Die ersten drei Namen stehen auch in `_actions/geraete.ts`** — das ist eine der drei
  Namensdubletten, die Teil 6s Zählung kennen muss (je Datei je Deklaration zählen, nie über ein
  `Set`).
  Konsumenten: `NeuBzGeraet` (T137), `ReferenzEditor` und `BzAktivToggle` (T139), `KontrolleForm`
  (T140), `BzScanner` (T138).
- **`revalidatePath`:** `geraetSpeichern`, `setGeraetAktiv`, `kontrolleErfassen` → jeweils
  `/m/lagerbuch/verwaltung/bz` und `` /m/lagerbuch/verwaltung/bz/${id} `` · `geraetZuBarcode` →
  **keine**.

⚠️ **`refSnapshot` friert den Referenzstand ein.** Die Kontrolle ist append-only; sie wird nie
geändert. Ändert jemand später die Grenzen am Gerät, muss das **Logbuch weiterhin die Grenzen zeigen,
gegen die damals gemessen wurde** (§5.11, §6.15 Auflage 16). Ohne den Snapshot läse die Detailseite
die **heutigen** Werte und behauptete rückwirkend, eine damals bestandene Kontrolle sei
durchgefallen — oder umgekehrt.

⚠️ **`bewerteKontrolle` entscheidet, nicht die Insel.** Der Bereichsvergleich ist Fachlogik und liegt
seit Teil 3 (T36) in `_lib/domain/bz.ts`. Die Action **liest** `bestanden` von dort und schreibt es
mit; ein zweiter Vergleich in der Oberfläche wäre eine zweite Wahrheit über dieselbe Messung.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { bzGeraete, bzKontrollen, lagerorte, newId } from "../_db/schema";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: [], name: null, email: null }),
}));
import { geraetSpeichern, setGeraetAktiv, geraetZuBarcode, kontrolleErfassen } from "./bz";

let t: TestDb; let ort: string;
const wert = <T>(e: unknown) => (e as { ok: true; wert: T }).wert;
async function geraetMitBereichen() {
  return wert<{ id: string }>(await geraetSpeichern({
    name: "Accu-Chek", lagerortId: ort, streifenLot: "LOT-A",
    level1Label: "L1", level1Min: 40, level1Max: 60,
    level2Label: "L2", level2Min: 250, level2Max: 350,
  }, t.db)).id;
}
beforeEach(() => {
  t = migrierteTestDb("lagerbuch-actions-bz-");
  ort = newId();
  t.db.insert(lagerorte).values({ id: ort, name: "Lager", typ: "lager", aktiv: true }).run();
  revalidiert.length = 0;
});
afterEach(() => { t.schliessen(); });

describe("geraetSpeichern / setGeraetAktiv / geraetZuBarcode", () => {
  it("legt an, aktualisiert und revalidiert Liste und Blatt", async () => {
    const id = await geraetMitBereichen();
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/bz",
      `/m/lagerbuch/verwaltung/bz/${id}`,
    ]);
    revalidiert.length = 0;
    await geraetSpeichern({ id, name: "Accu-Chek II", lagerortId: ort }, t.db);
    expect(t.db.select().from(bzGeraete).all()).toHaveLength(1);
    expect(t.db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get()?.name).toBe("Accu-Chek II");
  });

  it("meldet einen Barcode, der schon einem GERAET gehoert", async () => {
    const { geraete } = await import("../_db/schema");
    t.db.insert(geraete).values({ id: newId(), typ: "objekt", name: "X", barcode: "SN-9",
      lagerortId: ort, aktiv: true, createdAt: new Date() }).run();
    expect((await geraetSpeichern({ name: "BZ", lagerortId: ort, barcode: "SN-9" }, t.db)).ok)
      .toBe(false);
  });

  it("schaltet aktiv und findet ueber Barcode und Deep-Link", async () => {
    const id = wert<{ id: string }>(
      await geraetSpeichern({ name: "BZ", lagerortId: ort, barcode: "SN-1" }, t.db)).id;
    await setGeraetAktiv({ id, aktiv: false }, t.db);
    expect(t.db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get()?.aktiv).toBe(false);
    expect(wert<{ id: string } | null>(await geraetZuBarcode("SN-1", t.db))).toEqual({ id });
    expect(wert<{ id: string } | null>(
      await geraetZuBarcode("https://x/g/SN-1", t.db))).toEqual({ id });
  });
});

describe("kontrolleErfassen", () => {
  it("bewertet gegen die Bereiche des Geraets und schreibt bestanden mit", async () => {
    const id = await geraetMitBereichen();
    revalidiert.length = 0;
    const erg = await kontrolleErfassen({ geraetId: id, level1Wert: 50, level2Wert: 300,
      sticks: 25, lanzetten: 10 }, t.db);
    expect(wert<{ bestanden: boolean }>(erg).bestanden).toBe(true);
    const k = t.db.select().from(bzKontrollen).all()[0];
    expect(k).toMatchObject({ level1ImBereich: true, level2ImBereich: true, bestanden: true,
                              quelleTyp: "oidc", quelleId: "u1", sticks: 25, lanzetten: 10 });
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/bz",
      `/m/lagerbuch/verwaltung/bz/${id}`,
    ]);
  });

  it("meldet eine Messung auszerhalb des Bereichs als nicht bestanden", async () => {
    const id = await geraetMitBereichen();
    const erg = await kontrolleErfassen({ geraetId: id, level1Wert: 10, level2Wert: 300 }, t.db);
    expect(wert<{ bestanden: boolean }>(erg).bestanden).toBe(false);
    expect(t.db.select().from(bzKontrollen).all()[0].level1ImBereich).toBe(false);
  });

  it("friert den Referenzstand als refSnapshot ein", async () => {
    /*
     * ⚠️ DIE ZUSICHERUNG, DIE DAS LOGBUCH TRAEGT. Aendert jemand spaeter die
     * Grenzen am Geraet, muss das Logbuch weiterhin die Grenzen zeigen, gegen
     * die DAMALS gemessen wurde (§5.11). Ohne Snapshot laese die Detailseite
     * die heutigen Werte und behauptete rueckwirkend, eine bestandene
     * Kontrolle sei durchgefallen.
     */
    const id = await geraetMitBereichen();
    await kontrolleErfassen({ geraetId: id, level1Wert: 50 }, t.db);
    await geraetSpeichern({ id, name: "Accu-Chek", lagerortId: ort,
      level1Min: 100, level1Max: 200, streifenLot: "LOT-B" }, t.db);
    const snap = JSON.parse(t.db.select().from(bzKontrollen).all()[0].refSnapshot!);
    expect(snap).toMatchObject({ level1Min: 40, level1Max: 60, streifenLot: "LOT-A" });
  });

  it("nimmt fehlende Messwerte an — nicht jede Kontrolle misst beide Level", async () => {
    const id = await geraetMitBereichen();
    const erg = await kontrolleErfassen({ geraetId: id, sticks: 0, lanzetten: 0 }, t.db);
    expect(erg.ok).toBe(true);
    expect(t.db.select().from(bzKontrollen).all()[0]).toMatchObject({
      level1Wert: null, level2Wert: null });
  });

  it("lehnt ein unbekanntes Geraet ab, ohne zu werfen", async () => {
    const erg = await kontrolleErfassen({ geraetId: "gibtsnicht", level1Wert: 1 }, t.db);
    expect(erg.ok).toBe(false);
    expect(revalidiert).toEqual([]);
  });

  it("lehnt einen Kompressen-Verfall ab, der nicht YYYY-MM ist", async () => {
    const id = await geraetMitBereichen();
    expect((await kontrolleErfassen({ geraetId: id, kompresseVerfall: "2027" }, t.db)).ok).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/bz.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./bz"`.

- [ ] **Schritt 3: `_actions/bz.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { bzGeraete, bzKontrollen, newId } from "../_db/schema";
import { pruefeBarcodeFrei } from "../_db/barcode";
import { MONAT_REGEX } from "../_lib/konstanten";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { bewerteKontrolle } from "../_lib/domain/bz";
import { bzGeraetByBarcode } from "../_lib/lesepfade/bz";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";

/**
 * ⚠️ DREI NAMEN DIESER DATEI STEHEN AUCH IN `_actions/geraete.ts`
 * (`geraetSpeichern`, `setGeraetAktiv`, `geraetZuBarcode`). Das ist Absicht —
 * es sind verschiedene Fachbereiche mit derselben Handlung. Fuer Teil 6s
 * Zaehlung heiszt das: je Datei je Deklaration zaehlen, nie ueber ein `Set`
 * der Namen (das ergaebe 29 statt 32).
 */

const GeraetSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  barcode: z.string().trim().optional(),
  lagerortId: z.string().min(1, "Standort wählen"),
  streifenLot: z.string().trim().optional(),
  level1Label: z.string().trim().optional(),
  level1Min: z.coerce.number().int().optional(),
  level1Max: z.coerce.number().int().optional(),
  level2Label: z.string().trim().optional(),
  level2Min: z.coerce.number().int().optional(),
  level2Max: z.coerce.number().int().optional(),
});

const orNull = <T>(v: T | undefined): T | null => (v === undefined || v === "" ? null : v);

export async function geraetSpeichern(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof GeraetSchema>;
  try {
    v = GeraetSchema.parse(eingabe);
  } catch (e) {
    const feldFehler = zodFehler(e);
    return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
  }
  const barcode = orNull(v.barcode);
  if (barcode) {
    try {
      pruefeBarcodeFrei(db, barcode, v.id ? { tabelle: "bzGeraet", id: v.id } : null);
    } catch (e) {
      const text = e instanceof Error ? e.message : "Barcode bereits vergeben.";
      return { ok: false, fehler: text, feldFehler: { barcode: text } };
    }
  }
  const felder = {
    name: v.name, barcode, lagerortId: v.lagerortId,
    streifenLot: orNull(v.streifenLot),
    level1Label: orNull(v.level1Label), level1Min: orNull(v.level1Min), level1Max: orNull(v.level1Max),
    level2Label: orNull(v.level2Label), level2Min: orNull(v.level2Min), level2Max: orNull(v.level2Max),
  };
  const id = v.id ?? newId();
  if (v.id) db.update(bzGeraete).set(felder).where(eq(bzGeraete.id, v.id)).run();
  else db.insert(bzGeraete).values({ id, aktiv: true, createdAt: new Date(), ...felder }).run();
  revalidatePath("/m/lagerbuch/verwaltung/bz");
  revalidatePath(`/m/lagerbuch/verwaltung/bz/${id}`);
  return { ok: true, wert: { id } };
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });

export async function setGeraetAktiv(eingabe: unknown, db: DB = getDb()): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof AktivSchema>;
  try { v = AktivSchema.parse(eingabe); } catch { return { ok: false, fehler: "Ungültige Eingabe." }; }
  db.update(bzGeraete).set({ aktiv: v.aktiv }).where(eq(bzGeraete.id, v.id)).run();
  revalidatePath("/m/lagerbuch/verwaltung/bz");
  revalidatePath(`/m/lagerbuch/verwaltung/bz/${v.id}`);
  return { ok: true };
}

export async function geraetZuBarcode(
  rohwert: string, db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string } | null>> {
  await requireLagerbuchAdmin();
  // KEIN Nachbau der Normalisierung: `normalisiereBarcode` (Teil 4, T62) ist die
  // EINE Stelle, und sie kann mehr als drei Inline-Zeilen — `decodeURIComponent`
  // steht dort in try/catch. Ein Aufkleber mit kaputtem Prozentzeichen (%ZZ) wirft
  // sonst URIError mitten in einer Server Action.
  const code = normalisiereBarcode(rohwert);
  if (!code) return { ok: true, wert: null };
  return { ok: true, wert: bzGeraetByBarcode(db, code) };
}

const KontrolleSchema = z.object({
  geraetId: z.string().min(1),
  level1Wert: z.coerce.number().int().optional(),
  level2Wert: z.coerce.number().int().optional(),
  kompresseVerfall: z.string().regex(MONAT_REGEX, "Verfall muss YYYY-MM sein").optional(),
  // max 9999: echter Ueberbestand muss zaehlbar bleiben (§6.4.6).
  sticks: z.coerce.number().int().min(0).max(9999).default(0),
  lanzetten: z.coerce.number().int().min(0).max(9999).default(0),
  batterieGewechselt: z.coerce.boolean().default(false),
  kommentar: z.string().trim().optional(),
});

/**
 * ERFASST EINE UNVERAENDERLICHE KONTROLL-ZEILE (append-only, nur Insert; zwei
 * Trigger auf `bz_kontrollen` riegeln UPDATE und DELETE ab, Teil 1 T8).
 *
 * ⚠️ `refSnapshot` FRIERT DEN REFERENZSTAND EIN. Aendert jemand spaeter die
 * Grenzen am Geraet, muss das Logbuch weiterhin die Grenzen zeigen, gegen die
 * DAMALS gemessen wurde (§5.11, §6.15 Auflage 16). Ohne Snapshot laese die
 * Detailseite die heutigen Werte und behauptete rueckwirkend, eine bestandene
 * Kontrolle sei durchgefallen — oder umgekehrt.
 *
 * ⚠️ `bewerteKontrolle` ENTSCHEIDET, NICHT DIE INSEL. Der Bereichsvergleich
 * ist Fachlogik und liegt seit Teil 3 (T36) in `_lib/domain/bz.ts`; ein
 * zweiter Vergleich in der Oberflaeche waere eine zweite Wahrheit ueber
 * dieselbe Messung.
 */
export async function kontrolleErfassen(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string; bestanden: boolean }>> {
  const viewer = await requireLagerbuchAdmin();
  let v: z.output<typeof KontrolleSchema>;
  try {
    v = KontrolleSchema.parse(eingabe);
  } catch (e) {
    const feldFehler = zodFehler(e);
    return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
  }

  const g = db.select().from(bzGeraete).where(eq(bzGeraete.id, v.geraetId)).get();
  if (!g) return { ok: false, fehler: "Gerät nicht gefunden." };

  const level1Wert = v.level1Wert ?? null;
  const level2Wert = v.level2Wert ?? null;
  const { level1ImBereich, level2ImBereich, bestanden } = bewerteKontrolle({
    level1Wert, level1Min: g.level1Min, level1Max: g.level1Max,
    level2Wert, level2Min: g.level2Min, level2Max: g.level2Max,
  });

  const refSnapshot = JSON.stringify({
    streifenLot: g.streifenLot,
    level1Label: g.level1Label, level1Min: g.level1Min, level1Max: g.level1Max,
    level2Label: g.level2Label, level2Min: g.level2Min, level2Max: g.level2Max,
  });

  const id = newId();
  db.insert(bzKontrollen).values({
    id, geraetId: g.id, ts: new Date(),
    quelleTyp: "oidc", quelleId: viewer.sub,
    level1Wert, level1ImBereich, level2Wert, level2ImBereich,
    kompresseVerfall: v.kompresseVerfall ?? null,
    sticks: v.sticks, lanzetten: v.lanzetten,
    batterieGewechselt: v.batterieGewechselt,
    kommentar: v.kommentar ?? null,
    bestanden, refSnapshot,
  }).run();

  revalidatePath("/m/lagerbuch/verwaltung/bz");
  revalidatePath(`/m/lagerbuch/verwaltung/bz/${g.id}`);
  return { ok: true, wert: { id, bestanden } };
}
```

- [ ] **Schritt 4: Grün und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/bz.test.ts
rtk git add src/app/m/lagerbuch/_actions/bz.ts src/app/m/lagerbuch/_actions/bz.test.ts
rtk git commit -m "feat(lagerbuch): _actions/bz.ts — die Kontrolle friert ihre Referenz ein

refSnapshot ist die Zusicherung, die das Logbuch traegt: aendert jemand die
Grenzen am Geraet, zeigt das Logbuch weiterhin die Grenzen, gegen die damals
gemessen wurde. Ohne Snapshot behauptete die Detailseite rueckwirkend, eine
bestandene Kontrolle sei durchgefallen.

bewerteKontrolle (Teil 3) entscheidet, nicht die Insel — ein zweiter
Bereichsvergleich in der Oberflaeche waere eine zweite Wahrheit ueber dieselbe
Messung.

geraetSpeichern, setGeraetAktiv und geraetZuBarcode heiszen absichtlich wie in
_actions/geraete.ts: verschiedene Fachbereiche, dieselbe Handlung. Teil 6s
Zaehlung muss je Datei je Deklaration zaehlen (ein Set ergaebe 29 statt 32)."
```

---

### Task 123: `_actions/sauerstoff.ts` — der Detailpfad nur beim Ändern

**Files:** Create `_actions/sauerstoff.ts`; Test `_actions/sauerstoff.test.ts`.

**Interfaces:**
- Consumes: `requireLagerbuchAdmin`; `_db/schema.ts` — `o2Flaschen`, `o2Messungen`, `newId`.
- Produces:
  ```ts
  export async function flascheSpeichern(e: unknown, db?: DB): Promise<ActionErgebnis<{ id: string }>>;
  export async function setFlascheAktiv(e: unknown, db?: DB): Promise<ActionErgebnis>;
  export async function messungErfassen(e: unknown, db?: DB): Promise<ActionErgebnis<{ id: string }>>;
  ```
  Konsumenten: `NeuFlasche` (T141), `FlascheAktivToggle` und `MessungForm` (T142).
- **`revalidatePath`:** `flascheSpeichern` → `` /m/lagerbuch/verwaltung/sauerstoff/${id} `` **nur
  beim Ändern**, dann `/m/lagerbuch/verwaltung/sauerstoff` · `setFlascheAktiv` und
  `messungErfassen` → `/m/lagerbuch/verwaltung/sauerstoff`, `` /m/lagerbuch/verwaltung/sauerstoff/${id} ``.

⚠️ **Der Detailpfad wird beim ANLEGEN nicht revalidiert** (`sauerstoff.ts:26` steht **im**
`if (v.id)`-Zweig). Beim Anlegen gibt es die Detailseite noch nicht — ein `revalidatePath` auf einen
Pfad, den niemand gerendert hat, ist folgenlos, aber die Zeile suggerierte eine Symmetrie, die es
nicht gibt. **Die Reihenfolge weicht dadurch als einzige der 14 Dateien vom Muster ab** (Detailpfad
**vor** Listenpfad).

⚠️ **`nennfuelldruckBar` hat den Vorgabewert 200 und ist NICHT optional.** Teil 3 (T34) hat
ausdrücklich entschieden: `?? 200` beim **Lesen** ist verboten, weil eine Flasche ohne gepflegten
Nennfülldruck sonst still mit 200 gerechnet würde und die Ampel von „gelb" auf „grün" spränge. Der
Vorgabewert gehört ans **Schreiben** — hier —, damit der Wert danach wirklich in der Zeile steht.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { lagerorte, o2Flaschen, o2Messungen, newId } from "../_db/schema";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: [], name: null, email: null }),
}));
import { flascheSpeichern, setFlascheAktiv, messungErfassen } from "./sauerstoff";

let t: TestDb; let ort: string;
const wert = <T>(e: unknown) => (e as { ok: true; wert: T }).wert;
beforeEach(() => {
  t = migrierteTestDb("lagerbuch-actions-o2-");
  ort = newId();
  t.db.insert(lagerorte).values({ id: ort, name: "Lager", typ: "lager", aktiv: true }).run();
  revalidiert.length = 0;
});
afterEach(() => { t.schliessen(); });

describe("flascheSpeichern", () => {
  it("legt an und revalidiert NUR die Liste — die Detailseite gibt es noch nicht", async () => {
    const erg = await flascheSpeichern({ name: "O2 klein", lagerortId: ort, groesseLiter: 2 }, t.db);
    expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/sauerstoff"]);
    expect(t.db.select().from(o2Flaschen).where(eq(o2Flaschen.id, wert<{ id: string }>(erg).id)).get())
      .toMatchObject({ nennfuelldruckBar: 200, aktiv: true, groesseLiter: 2 });
  });

  it("beim AENDERN kommt der Detailpfad dazu, und zwar ZUERST", async () => {
    const id = wert<{ id: string }>(
      await flascheSpeichern({ name: "O2", lagerortId: ort }, t.db)).id;
    revalidiert.length = 0;
    await flascheSpeichern({ id, name: "O2 groß", lagerortId: ort, nennfuelldruckBar: 300 }, t.db);
    expect(revalidiert).toEqual([
      `/m/lagerbuch/verwaltung/sauerstoff/${id}`,
      "/m/lagerbuch/verwaltung/sauerstoff",
    ]);
    expect(t.db.select().from(o2Flaschen).where(eq(o2Flaschen.id, id)).get()?.nennfuelldruckBar)
      .toBe(300);
  });

  it("setzt den Nennfuelldruck-Vorgabewert beim SCHREIBEN, nicht beim Lesen", async () => {
    // `?? 200` beim Lesen ist verboten (Teil 3, T34): eine Flasche ohne
    // gepflegten Wert wuerde still mit 200 gerechnet, und die Ampel spraenge
    // von gelb auf gruen.
    const id = wert<{ id: string }>(
      await flascheSpeichern({ name: "O2", lagerortId: ort }, t.db)).id;
    expect(t.db.select().from(o2Flaschen).where(eq(o2Flaschen.id, id)).get()?.nennfuelldruckBar)
      .toBe(200);
  });

  it("lehnt einen leeren Namen und einen Nennfuelldruck <= 0 ab", async () => {
    expect((await flascheSpeichern({ name: " ", lagerortId: ort }, t.db)).ok).toBe(false);
    expect((await flascheSpeichern({ name: "O2", lagerortId: ort, nennfuelldruckBar: 0 }, t.db)).ok)
      .toBe(false);
  });
});

describe("setFlascheAktiv / messungErfassen", () => {
  it("schaltet um und revalidiert beide Pfade", async () => {
    const id = wert<{ id: string }>(await flascheSpeichern({ name: "O2", lagerortId: ort }, t.db)).id;
    revalidiert.length = 0;
    await setFlascheAktiv({ id, aktiv: false }, t.db);
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/sauerstoff",
      `/m/lagerbuch/verwaltung/sauerstoff/${id}`,
    ]);
  });

  it("schreibt eine unveraenderliche Messung mit Quelle", async () => {
    const id = wert<{ id: string }>(await flascheSpeichern({ name: "O2", lagerortId: ort }, t.db)).id;
    revalidiert.length = 0;
    await messungErfassen({ flascheId: id, druckBar: 150, kommentar: "Monatskontrolle" }, t.db);
    expect(t.db.select().from(o2Messungen).all()[0]).toMatchObject({
      flascheId: id, druckBar: 150, quelleTyp: "oidc", quelleId: "u1", kommentar: "Monatskontrolle" });
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/sauerstoff",
      `/m/lagerbuch/verwaltung/sauerstoff/${id}`,
    ]);
  });

  it("nimmt 0 bar an — eine leere Flasche ist ein gueltiger Messwert", async () => {
    const id = wert<{ id: string }>(await flascheSpeichern({ name: "O2", lagerortId: ort }, t.db)).id;
    expect((await messungErfassen({ flascheId: id, druckBar: 0 }, t.db)).ok).toBe(true);
  });

  it("lehnt einen negativen Druck ab", async () => {
    const id = wert<{ id: string }>(await flascheSpeichern({ name: "O2", lagerortId: ort }, t.db)).id;
    expect((await messungErfassen({ flascheId: id, druckBar: -1 }, t.db)).ok).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/sauerstoff.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./sauerstoff"`.

- [ ] **Schritt 3: `_actions/sauerstoff.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { o2Flaschen, o2Messungen, newId } from "../_db/schema";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";

const fehlerhaft = (e: unknown): ActionErgebnis<never> => {
  const feldFehler = zodFehler(e);
  return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
};

const FlascheSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  lagerortId: z.string().min(1, "Standort wählen"),
  groesseLiter: z.coerce.number().int().positive().optional(),
  /*
   * ⚠️ VORGABEWERT BEIM SCHREIBEN, NICHT BEIM LESEN. Teil 3 (T34) hat
   * ausdruecklich entschieden, dass `?? 200` beim Lesen verboten ist: eine
   * Flasche ohne gepflegten Nennfuelldruck wuerde sonst still mit 200
   * gerechnet, und die Ampel spraenge von „gelb" auf „gruen". Hier gesetzt,
   * steht der Wert danach wirklich in der Zeile.
   */
  nennfuelldruckBar: z.coerce.number().int().positive("Nennfülldruck muss größer als 0 sein").default(200),
});

/**
 * ⚠️ DER DETAILPFAD WIRD BEIM ANLEGEN NICHT REVALIDIERT — beim Anlegen gibt es
 * die Detailseite noch nicht. Das ist die einzige der 15 Action-Dateien, in
 * der die Pfadreihenfolge vom Muster abweicht (Detail VOR Liste), und es ist
 * kein Versehen des Bestands (`sauerstoff.ts:26` steht IM `if (v.id)`-Zweig).
 */
export async function flascheSpeichern(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof FlascheSchema>;
  try { v = FlascheSchema.parse(eingabe); } catch (e) { return fehlerhaft(e); }
  const id = v.id ?? newId();
  if (v.id) {
    db.update(o2Flaschen)
      .set({ name: v.name, lagerortId: v.lagerortId,
             groesseLiter: v.groesseLiter ?? null, nennfuelldruckBar: v.nennfuelldruckBar })
      .where(eq(o2Flaschen.id, v.id))
      .run();
    revalidatePath(`/m/lagerbuch/verwaltung/sauerstoff/${v.id}`);
  } else {
    db.insert(o2Flaschen)
      .values({ id, name: v.name, lagerortId: v.lagerortId,
                groesseLiter: v.groesseLiter ?? null, nennfuelldruckBar: v.nennfuelldruckBar,
                aktiv: true, createdAt: new Date() })
      .run();
  }
  revalidatePath("/m/lagerbuch/verwaltung/sauerstoff");
  return { ok: true, wert: { id } };
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });

export async function setFlascheAktiv(eingabe: unknown, db: DB = getDb()): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof AktivSchema>;
  try { v = AktivSchema.parse(eingabe); } catch { return { ok: false, fehler: "Ungültige Eingabe." }; }
  db.update(o2Flaschen).set({ aktiv: v.aktiv }).where(eq(o2Flaschen.id, v.id)).run();
  revalidatePath("/m/lagerbuch/verwaltung/sauerstoff");
  revalidatePath(`/m/lagerbuch/verwaltung/sauerstoff/${v.id}`);
  return { ok: true };
}

const MessungSchema = z.object({
  flascheId: z.string().min(1),
  // 0 bar ist ein gueltiger Messwert — eine leere Flasche ist genau das, was
  // die Ampel melden soll.
  druckBar: z.coerce.number().int().min(0, "Druck darf nicht negativ sein"),
  kommentar: z.string().trim().optional(),
});

/** Messungen sind unveraenderlich: nur Insert (append-only), kein Update, kein Delete. */
export async function messungErfassen(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  const viewer = await requireLagerbuchAdmin();
  let v: z.output<typeof MessungSchema>;
  try { v = MessungSchema.parse(eingabe); } catch (e) { return fehlerhaft(e); }
  const id = newId();
  db.insert(o2Messungen).values({
    id, flascheId: v.flascheId, ts: new Date(), druckBar: v.druckBar,
    quelleTyp: "oidc", quelleId: viewer.sub, kommentar: v.kommentar ?? null,
  }).run();
  revalidatePath("/m/lagerbuch/verwaltung/sauerstoff");
  revalidatePath(`/m/lagerbuch/verwaltung/sauerstoff/${v.flascheId}`);
  return { ok: true, wert: { id } };
}
```

- [ ] **Schritt 4: Grün und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/sauerstoff.test.ts
rtk git add src/app/m/lagerbuch/_actions/sauerstoff.ts src/app/m/lagerbuch/_actions/sauerstoff.test.ts
rtk git commit -m "feat(lagerbuch): _actions/sauerstoff.ts — Detailpfad nur beim Aendern

flascheSpeichern revalidiert den Detailpfad nur im if(v.id)-Zweig: beim
Anlegen gibt es die Detailseite noch nicht. Das ist die einzige der 14
Action-Dateien, in der die Pfadreihenfolge vom Muster abweicht.

nennfuelldruckBar bekommt seinen Vorgabewert 200 beim SCHREIBEN. Teil 3 (T34)
hat '?? 200' beim Lesen verboten: eine Flasche ohne gepflegten Wert wuerde
sonst still mit 200 gerechnet, und die Ampel spraenge von gelb auf gruen.

0 bar ist ein gueltiger Messwert — eine leere Flasche ist genau das, was die
Ampel melden soll."
```

---

### Task 124: `_actions/loeschen.ts` — sechs Arten, eine Tabelle, zwei Ausgänge

**Files:** Create `_actions/loeschen.ts`; Test `_actions/loeschen.test.ts`.

**Interfaces:**
- Consumes: `requireLagerbuchAdmin`; `_lib/loeschen.ts` (T110) — `ELEMENT_ARTEN`,
  `type ElementArt`, `type Loeschbarkeit`; `_lib/schreibpfade/lagerortVerfall.ts` (Teil 3, T55) —
  `loescheVerfallFuer`; `_db/schema.ts` — alle betroffenen Tabellen; `_lib/konstanten.ts` —
  `HANDLAGER_ID`.
- Produces:
  ```ts
  export async function pruefeLoeschbar(
    art: ElementArt, id: string, db?: DB): Promise<ActionErgebnis<Loeschbarkeit>>;
  export async function loescheElement(art: ElementArt, id: string, db?: DB): Promise<ActionErgebnis>;
  export async function deaktiviereElement(art: ElementArt, id: string, db?: DB): Promise<ActionErgebnis>;
  ```
  Konsument: `_ui/LoeschDialog.tsx` (T110) über die Props `pruefen`, `onLoeschen`, `onDeaktivieren` —
  auf **sechs** Seiten.
- **`revalidatePath`:** `loescheElement` und `deaktiviereElement` über **dieselbe** Tabelle
  `REVALIDATE[art]` (§3, wörtlich) · `pruefeLoeschbar` → **keine**.

⚠️ **Die Löschbarkeit wird UNMITTELBAR VOR dem Löschen erneut geprüft.** Zwischen dem Öffnen des
Dialogs und dem Klick kann eine Buchung entstanden sein — `better-sqlite3` arbeitet synchron, deshalb
genügt der Recheck auf derselben Verbindung. Ohne ihn löschte der Dialog auf Basis einer Auskunft, die
beim Klick schon falsch war.

⚠️ **Gemeldete Verfälle verhindern das Löschen NICHT, müssen aber vorher weg.** Sie sind
**Ist-Zustand** („was liegt gerade im Fahrzeug"), kein Nachweis — aber ein Fremdschlüssel. Wer sie
als Nachweis behandelt, macht jedes Fahrzeug mit einer einzigen Verfall-Meldung unlöschbar.

⚠️ **Das Handlager ist unlöschbar und undeaktivierbar.** Es ist ein fester Schlüssel
(`lagerorte.id = "handlager"`), auf den jede Buchung zeigt. `pruefeFahrzeug` erreicht es gar nicht
(es hat `typ = "lager"`), aber `deaktiviereElement` würde es treffen — deshalb der ausdrückliche
Riegel.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, lagerortVerfall, sollPositionen,
         tokens, newId } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: [], name: null, email: null }),
}));
import { pruefeLoeschbar, loescheElement, deaktiviereElement } from "./loeschen";

let t: TestDb;
const wert = <T>(e: unknown) => (e as { ok: true; wert: T }).wert;
function artikelAnlegen() {
  const id = newId();
  t.db.insert(artikel).values({ id, name: "Mull", einheit: "Stk", fach: "A1",
    mindestbestand: 1, aktiv: true, createdAt: new Date() }).run();
  return id;
}
beforeEach(() => { t = migrierteTestDb("lagerbuch-actions-loeschen-"); revalidiert.length = 0; });
afterEach(() => { t.schliessen(); });

describe("pruefeLoeschbar", () => {
  it("meldet einen unberuehrten Artikel als loeschbar", async () => {
    const erg = await pruefeLoeschbar("artikel", artikelAnlegen(), t.db);
    expect(wert<{ loeschbar: boolean }>(erg).loeschbar).toBe(true);
    expect(revalidiert).toEqual([]);
  });

  it("nennt bei Buchungen den GRUND und bietet Deaktivieren an", async () => {
    const a = artikelAnlegen();
    const c = newId();
    t.db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "L1", verfall: "2027-01", createdAt: new Date() }).run();
    t.db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: a,
      chargeId: c, lagerortId: HANDLAGER_ID, menge: 5, quelleTyp: "system", quelleId: "s", kommentar: null }).run();
    const s = wert<{ loeschbar: false; grund: string; kannDeaktivieren: boolean }>(
      await pruefeLoeschbar("artikel", a, t.db));
    expect(s.loeschbar).toBe(false);
    expect(s.grund).toMatch(/Buchung/);
    expect(s.grund).toMatch(/Nachweis/);
    expect(s.kannDeaktivieren).toBe(true);
  });

  it("kennt genau die sechs Arten", async () => {
    const { ELEMENT_ARTEN } = await import("../_lib/loeschen");
    expect([...ELEMENT_ARTEN]).toEqual(
      ["artikel", "fahrzeug", "token", "bzGeraet", "o2Flasche", "geraet"]);
  });
});

describe("loescheElement", () => {
  it("loescht und revalidiert genau die Pfade der Art", async () => {
    const a = artikelAnlegen();
    revalidiert.length = 0;
    expect((await loescheElement("artikel", a, t.db)).ok).toBe(true);
    expect(t.db.select().from(artikel).all()).toHaveLength(0);
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/artikel",
      "/m/lagerbuch/verwaltung",
    ]);
  });

  it("revalidiert bei einem Zugangs-Code nur die Token-Liste", async () => {
    const id = newId();
    t.db.insert(tokens).values({ id, code: "111-111", label: "L", aktiv: true,
      createdAt: new Date(), createdBy: "u1" }).run();
    revalidiert.length = 0;
    await loescheElement("token", id, t.db);
    expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/tokens"]);
  });

  it("prueft die Loeschbarkeit UNMITTELBAR VOR dem Loeschen erneut", async () => {
    // Zwischen Dialog-Oeffnen und Klick kann eine Buchung entstanden sein.
    // Ohne den Recheck loeschte der Dialog auf Basis einer Auskunft, die beim
    // Klick schon falsch war.
    const a = artikelAnlegen();
    const c = newId();
    t.db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "L1", verfall: "2027-01", createdAt: new Date() }).run();
    const erg = await loescheElement("artikel", a, t.db);
    expect(erg.ok).toBe(false);
    expect(t.db.select().from(artikel).all()).toHaveLength(1);
  });

  it("raeumt gemeldete Verfaelle vor dem Hard-Delete weg", async () => {
    // Sie sind Ist-Zustand, kein Nachweis — sie verhindern das Loeschen nicht,
    // sind aber ein Fremdschluessel.
    const a = artikelAnlegen();
    const fz = newId();
    t.db.insert(lagerorte).values({ id: fz, name: "RTW", typ: "fahrzeug", aktiv: true }).run();
    t.db.insert(lagerortVerfall).values({ lagerortId: fz, artikelId: a, verfall: "2027-03",
      erfasstAt: new Date(), quelleTyp: "oidc", quelleId: "u1" }).run();
    expect((await loescheElement("artikel", a, t.db)).ok).toBe(true);
    expect(t.db.select().from(lagerortVerfall).all()).toHaveLength(0);
  });

  it("loescht das Handlager NICHT", async () => {
    const erg = await loescheElement("fahrzeug", HANDLAGER_ID, t.db);
    expect(erg.ok).toBe(false);
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, HANDLAGER_ID)).get()).toBeTruthy();
  });

  it("lehnt eine unbekannte Art ab", async () => {
    // @ts-expect-error absichtlich falscher Wert — der Zod-Parser haelt ihn ab
    expect((await loescheElement("vorlage", "x", t.db)).ok).toBe(false);
  });
});

describe("deaktiviereElement", () => {
  it("setzt aktiv=false und revalidiert dieselben Pfade", async () => {
    const a = artikelAnlegen();
    revalidiert.length = 0;
    expect((await deaktiviereElement("artikel", a, t.db)).ok).toBe(true);
    expect(t.db.select().from(artikel).where(eq(artikel.id, a)).get()?.aktiv).toBe(false);
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/artikel",
      "/m/lagerbuch/verwaltung",
    ]);
  });

  it("deaktiviert das Handlager NICHT", async () => {
    // Es ist ein fester Schluessel, auf den jede Buchung zeigt.
    const erg = await deaktiviereElement("fahrzeug", HANDLAGER_ID, t.db);
    expect(erg.ok).toBe(false);
    expect(t.db.select().from(lagerorte).where(eq(lagerorte.id, HANDLAGER_ID)).get()?.aktiv).toBe(true);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/loeschen.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./loeschen"`.

- [ ] **Schritt 3: `_actions/loeschen.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { and, count, eq, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { artikel, buchungen, chargen, sollPositionen, lagerorte, checks, tokens,
         bzGeraete, bzKontrollen, o2Flaschen, o2Messungen, geraete } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { loescheVerfallFuer } from "../_lib/schreibpfade/lagerortVerfall";
import { ELEMENT_ARTEN, type ElementArt, type Loeschbarkeit } from "../_lib/loeschen";
import type { ActionErgebnis } from "../_lib/actionErgebnis";

const ArtSchema = z.enum(ELEMENT_ARTEN);
const IdSchema = z.string().min(1);

/**
 * DIE REVALIDIERUNGSTABELLE — je Art die Pfade, in INNERER Form. Beide
 * schreibenden Actions lesen dieselbe Tabelle; zwei Listen fuer zwei
 * Handlungen, die dieselbe Zeile beruehren, liefen auseinander.
 */
const REVALIDATE: Record<ElementArt, string[]> = {
  artikel:   ["/m/lagerbuch/verwaltung/artikel", "/m/lagerbuch/verwaltung"],
  fahrzeug:  ["/m/lagerbuch/verwaltung/fahrzeuge", "/m/lagerbuch/verwaltung"],
  token:     ["/m/lagerbuch/verwaltung/tokens"],
  bzGeraet:  ["/m/lagerbuch/verwaltung/bz"],
  o2Flasche: ["/m/lagerbuch/verwaltung/sauerstoff"],
  geraet:    ["/m/lagerbuch/verwaltung/geraete"],
};

function anzahl(db: DB, tabelle: SQLiteTable, where: SQL): number {
  return db.select({ n: count() }).from(tabelle).where(where).get()?.n ?? 0;
}
const plural = (n: number, ein: string, mehr: string) => `${n} ${n === 1 ? ein : mehr}`;
const verknuepftGrund = (teile: string[]) =>
  `Noch mit ${teile.join(", ")} verknüpft — Löschen würde den Nachweis zerstören.`;

function pruefeArtikel(db: DB, id: string): Loeschbarkeit {
  const buch = anzahl(db, buchungen, eq(buchungen.artikelId, id));
  const chg = anzahl(db, chargen, eq(chargen.artikelId, id));
  const soll = anzahl(db, sollPositionen, eq(sollPositionen.artikelId, id));
  if (buch + chg + soll === 0) return { loeschbar: true };
  const teile: string[] = [];
  if (buch) teile.push(plural(buch, "Buchung", "Buchungen"));
  if (chg) teile.push(plural(chg, "Charge", "Chargen"));
  if (soll) teile.push(plural(soll, "Soll-Position", "Soll-Positionen"));
  return { loeschbar: false, grund: verknuepftGrund(teile), kannDeaktivieren: true };
}

function pruefeFahrzeug(db: DB, id: string): Loeschbarkeit {
  if (id === HANDLAGER_ID) {
    return {
      loeschbar: false,
      grund: "Das Handlager ist der feste Bezugspunkt jeder Buchung und kann nicht entfernt werden.",
      kannDeaktivieren: false,
    };
  }
  const buch = anzahl(db, buchungen, eq(buchungen.lagerortId, id));
  const chk = anzahl(db, checks, eq(checks.fahrzeugId, id));
  const soll = anzahl(db, sollPositionen, eq(sollPositionen.fahrzeugId, id));
  if (buch + chk + soll === 0) return { loeschbar: true };
  const teile: string[] = [];
  if (buch) teile.push(plural(buch, "Buchung", "Buchungen"));
  if (chk) teile.push(plural(chk, "Check", "Checks"));
  if (soll) teile.push(plural(soll, "Soll-Position", "Soll-Positionen"));
  return { loeschbar: false, grund: verknuepftGrund(teile), kannDeaktivieren: true };
}

function pruefeToken(db: DB, id: string): Loeschbarkeit {
  const zeile = db.select().from(tokens).where(eq(tokens.id, id)).get();
  if (!zeile) return { loeschbar: true };
  const buch = anzahl(db, buchungen, and(eq(buchungen.quelleTyp, "token"),
                                         eq(buchungen.quelleId, zeile.code))!);
  if (buch === 0) return { loeschbar: true };
  return {
    loeschbar: false,
    grund: verknuepftGrund([plural(buch, "Buchung", "Buchungen")]),
    kannDeaktivieren: true,
  };
}

function pruefeBzGeraet(db: DB, id: string): Loeschbarkeit {
  const k = anzahl(db, bzKontrollen, eq(bzKontrollen.geraetId, id));
  if (k === 0) return { loeschbar: true };
  return { loeschbar: false, grund: verknuepftGrund([plural(k, "Kontrolle", "Kontrollen")]),
           kannDeaktivieren: true };
}

function pruefeO2Flasche(db: DB, id: string): Loeschbarkeit {
  const m = anzahl(db, o2Messungen, eq(o2Messungen.flascheId, id));
  if (m === 0) return { loeschbar: true };
  return { loeschbar: false, grund: verknuepftGrund([plural(m, "Messung", "Messungen")]),
           kannDeaktivieren: true };
}

/**
 * Geraete haben kein eigenes Historien-Table, werden aber in `checks.ergebnis`
 * (freies JSON, kein Fremdschluessel) referenziert. Wurde ein Geraet je in
 * einem Check quittiert, verloere ein Hard-Delete den Namen im Nachweis — die
 * Zeile bliebe „geloeschtes Geraet". Wie ueberall: nur Deaktivieren anbieten.
 */
function pruefeGeraet(db: DB, id: string): Loeschbarkeit {
  const n = db.select({ ergebnis: checks.ergebnis }).from(checks).all().filter((r) => {
    try {
      const roh = JSON.parse(r.ergebnis ?? "[]");
      return !Array.isArray(roh)
        && (roh.geraete ?? []).some((e: { geraetId?: string }) => e.geraetId === id);
    } catch {
      return false;
    }
  }).length;
  if (n === 0) return { loeschbar: true };
  return { loeschbar: false, grund: verknuepftGrund([plural(n, "Check", "Checks")]),
           kannDeaktivieren: true };
}

function pruefe(db: DB, art: ElementArt, id: string): Loeschbarkeit {
  switch (art) {
    case "artikel": return pruefeArtikel(db, id);
    case "fahrzeug": return pruefeFahrzeug(db, id);
    case "token": return pruefeToken(db, id);
    case "bzGeraet": return pruefeBzGeraet(db, id);
    case "o2Flasche": return pruefeO2Flasche(db, id);
    case "geraet": return pruefeGeraet(db, id);
  }
}

/** Nur lesend — und trotzdem eine Action, weil ihr einziger Aufrufer eine Client-Insel ist. */
export async function pruefeLoeschbar(
  art: ElementArt, id: string, db: DB = getDb(),
): Promise<ActionErgebnis<Loeschbarkeit>> {
  await requireLagerbuchAdmin();
  try {
    return { ok: true, wert: pruefe(db, ArtSchema.parse(art), IdSchema.parse(id)) };
  } catch {
    return { ok: false, fehler: "Ungültige Anfrage." };
  }
}

/**
 * ⚠️ DIE LOESCHBARKEIT WIRD UNMITTELBAR VOR DEM LOESCHEN ERNEUT GEPRUEFT.
 * Zwischen dem Oeffnen des Dialogs und dem Klick kann eine Buchung entstanden
 * sein; `better-sqlite3` arbeitet synchron, deshalb genuegt der Recheck auf
 * derselben Verbindung. Ohne ihn loeschte der Dialog auf Basis einer Auskunft,
 * die beim Klick schon falsch war.
 *
 * ⚠️ GEMELDETE VERFAELLE VERHINDERN DAS LOESCHEN NICHT, muessen aber vorher
 * weg: sie sind Ist-Zustand („was liegt gerade im Fahrzeug"), kein Nachweis —
 * aber ein Fremdschluessel. Wer sie als Nachweis behandelt, macht jedes
 * Fahrzeug mit einer einzigen Verfall-Meldung unloeschbar.
 */
export async function loescheElement(
  art: ElementArt, id: string, db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let a: ElementArt; let i: string;
  try { a = ArtSchema.parse(art); i = IdSchema.parse(id); }
  catch { return { ok: false, fehler: "Ungültige Anfrage." }; }

  const status = pruefe(db, a, i);
  if (!status.loeschbar) return { ok: false, fehler: status.grund };

  switch (a) {
    case "artikel":
      loescheVerfallFuer(db, "artikel", i);
      db.delete(artikel).where(eq(artikel.id, i)).run();
      break;
    case "fahrzeug":
      loescheVerfallFuer(db, "lagerort", i);
      db.delete(lagerorte)
        .where(and(eq(lagerorte.id, i), eq(lagerorte.typ, "fahrzeug"))!)
        .run();
      break;
    case "token": db.delete(tokens).where(eq(tokens.id, i)).run(); break;
    case "bzGeraet": db.delete(bzGeraete).where(eq(bzGeraete.id, i)).run(); break;
    case "o2Flasche": db.delete(o2Flaschen).where(eq(o2Flaschen.id, i)).run(); break;
    case "geraet": db.delete(geraete).where(eq(geraete.id, i)).run(); break;
  }
  for (const p of REVALIDATE[a]) revalidatePath(p);
  return { ok: true };
}

/**
 * Die history-schonende Alternative.
 *
 * ⚠️ Das Handlager ist auch hier ausgenommen: es ist ein fester Schluessel,
 * auf den jede Buchung zeigt. `pruefeFahrzeug` erreicht es zwar gar nicht
 * (`typ = "lager"`), aber diese Action fragt nicht — deshalb der ausdrueckliche
 * Riegel.
 */
export async function deaktiviereElement(
  art: ElementArt, id: string, db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let a: ElementArt; let i: string;
  try { a = ArtSchema.parse(art); i = IdSchema.parse(id); }
  catch { return { ok: false, fehler: "Ungültige Anfrage." }; }
  if (a === "fahrzeug" && i === HANDLAGER_ID) {
    return { ok: false, fehler: "Das Handlager kann nicht deaktiviert werden." };
  }
  switch (a) {
    case "artikel": db.update(artikel).set({ aktiv: false }).where(eq(artikel.id, i)).run(); break;
    case "fahrzeug": db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, i)).run(); break;
    case "token": db.update(tokens).set({ aktiv: false }).where(eq(tokens.id, i)).run(); break;
    case "bzGeraet": db.update(bzGeraete).set({ aktiv: false }).where(eq(bzGeraete.id, i)).run(); break;
    case "o2Flasche": db.update(o2Flaschen).set({ aktiv: false }).where(eq(o2Flaschen.id, i)).run(); break;
    case "geraet": db.update(geraete).set({ aktiv: false }).where(eq(geraete.id, i)).run(); break;
  }
  for (const p of REVALIDATE[a]) revalidatePath(p);
  return { ok: true };
}
```

- [ ] **Schritt 4: Grün und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/loeschen.test.ts
rtk git add src/app/m/lagerbuch/_actions/loeschen.ts src/app/m/lagerbuch/_actions/loeschen.test.ts
rtk git commit -m "feat(lagerbuch): _actions/loeschen.ts — Vorpruefung, Recheck, zwei Ausgaenge

Die Loeschbarkeit wird unmittelbar VOR dem Loeschen erneut geprueft: zwischen
Dialog-Oeffnen und Klick kann eine Buchung entstanden sein. better-sqlite3 ist
synchron, deshalb genuegt der Recheck auf derselben Verbindung.

Gemeldete Verfaelle verhindern das Loeschen nicht, muessen aber vorher weg —
sie sind Ist-Zustand, kein Nachweis, aber ein Fremdschluessel. Wer sie als
Nachweis behandelt, macht jedes Fahrzeug mit einer Verfall-Meldung
unloeschbar.

Das Handlager ist von beiden Wegen ausgenommen: fester Schluessel, auf den
jede Buchung zeigt.

Eine Revalidierungstabelle fuer beide schreibenden Actions — zwei Listen fuer
zwei Handlungen an derselben Zeile liefen auseinander."
```

---

### Task 125: `_actions/csv.ts`, `_actions/detail.ts` und `_lib/csv.ts`

**Files:** Create `_lib/csv.ts`, `_actions/csv.ts`, `_actions/detail.ts`; Test `_lib/csv.test.ts`,
`_actions/csv.test.ts`.

**Interfaces:**
- Consumes: `requireLagerbuchAdmin`; `_lib/lesepfade/artikel.ts` (Teil 3, T45) — `artikelDetail`;
  `_lib/konstanten.ts` — `HANDLAGER_ID`, `CHARGE_OHNE_VERFALL`, `PSEUDO_VERFALL`.
- Produces:
  ```ts
  // _lib/csv.ts — KEIN "use client", KEIN "use server" (reine Funktion, auch im Test benutzt).
  export type CsvZeile = { name: string; einheit: string; fach: string;
                           mindestbestand: number; startbestand: number };
  export function parseArtikelCsv(text: string): { rows: CsvZeile[]; errors: string[] };

  // _actions/csv.ts — "use server"
  export async function importArtikelCsv(
    text: string, db?: DB): Promise<ActionErgebnis<{ angelegt: number; fehler: string[] }>>;

  // _actions/detail.ts — "use server"
  export type ArtikelDetailCharge = { id: string; chargenNr: string; verfall: string;
                                      rest: number; ampel: Ampel; text: string };
  export type ArtikelDetailBuchung = { id: string; ts: Date; typ: string; menge: number;
                                       kommentar: string | null; quelleName: string };
  export type ArtikelDetailResult = {
    artikel: { id: string; name: string; einheit: string; fach: string;
               mindestbestand: number; aktiv: boolean; bestand: number };
    chargen: ArtikelDetailCharge[];
    historie: ArtikelDetailBuchung[];
  };
  export async function getDetail(id: string): Promise<ActionErgebnis<ArtikelDetailResult>>;
  ```
  Konsumenten: `ImportForm` (T149), `_ui/ArtikelDrawer.tsx` (T127).
- **`revalidatePath`:** `importArtikelCsv` → `/m/lagerbuch/verwaltung/artikel` · `getDetail` →
  **keine** (liest nur).

⚠️ **`_actions/detail.ts` exportiert DREI TYPEN neben einer Action.** Der Guard-Scan aus Teil 2 (T20)
verwirft `export type` und `export interface` ausdrücklich — **ein Scan, der sie mitzählt, wird auf
einer korrekten Datei rot.** Die Typen dürfen hier stehen, weil `"use server"` nur zur Laufzeit über
**Werte** entscheidet; Typen verschwinden beim Kompilieren.

⚠️ **Der CSV-Startbestand wird als `korrektur` gebucht, nicht als `zugang`.** Ein `zugang` behauptete
eine Lieferung, die nie stattfand — und der Bestellvorschlag setzte `bestelltAt` zurück (T114). Die
Charge heißt `"ohne Verfall"` mit `verfall = "2099-12"`; beides sind **feste Schlüssel** (Teil 1, T4).

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

`src/app/m/lagerbuch/_lib/csv.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseArtikelCsv } from "./csv";

describe("parseArtikelCsv", () => {
  it("liest Semikolon-getrennte Zeilen mit Kopfzeile", () => {
    const { rows, errors } = parseArtikelCsv(
      "Name;Einheit;Fach;Mindestbestand;Startbestand\nMull;Stk;A1;20;5\nKompressen;Pkg;B2;10;0\n");
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { name: "Mull", einheit: "Stk", fach: "A1", mindestbestand: 20, startbestand: 5 },
      { name: "Kompressen", einheit: "Pkg", fach: "B2", mindestbestand: 10, startbestand: 0 },
    ]);
  });

  it("nimmt auch Komma als Trennzeichen", () => {
    const { rows } = parseArtikelCsv("Name,Einheit,Fach,Mindestbestand,Startbestand\nMull,Stk,A1,20,5");
    expect(rows).toHaveLength(1);
  });

  it("meldet eine Zeile mit zu wenigen Spalten MIT Zeilennummer und laeszt sie aus", () => {
    const { rows, errors } = parseArtikelCsv("Name;Einheit;Fach;Mindestbestand;Startbestand\nMull;Stk\nA;B;C;1;0");
    expect(rows).toHaveLength(1);
    expect(errors[0]).toMatch(/Zeile 2/);
  });

  it("meldet eine nicht numerische Menge", () => {
    const { rows, errors } = parseArtikelCsv("Name;Einheit;Fach;Mindestbestand;Startbestand\nMull;Stk;A1;viele;0");
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatch(/Zeile 2/);
  });

  it("ueberspringt leere Zeilen ohne Fehler", () => {
    const { rows, errors } = parseArtikelCsv("Name;Einheit;Fach;Mindestbestand;Startbestand\n\nMull;Stk;A1;1;0\n\n");
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it("kommt ohne Kopfzeile aus, wenn die erste Zeile Daten traegt", () => {
    const { rows } = parseArtikelCsv("Mull;Stk;A1;20;5");
    expect(rows).toHaveLength(1);
  });

  it("entfernt ein BOM und Windows-Zeilenenden", () => {
    const { rows, errors } = parseArtikelCsv("﻿Name;Einheit;Fach;Mindestbestand;Startbestand\r\nMull;Stk;A1;1;0\r\n");
    expect(errors).toEqual([]);
    expect(rows[0].name).toBe("Mull");
  });
});
```

`src/app/m/lagerbuch/_actions/csv.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen } from "../_db/schema";
import { CHARGE_OHNE_VERFALL, HANDLAGER_ID, PSEUDO_VERFALL } from "../_lib/konstanten";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: [], name: null, email: null }),
}));
import { importArtikelCsv } from "./csv";

let t: TestDb;
const wert = <T>(e: unknown) => (e as { ok: true; wert: T }).wert;
beforeEach(() => { t = migrierteTestDb("lagerbuch-actions-csv-"); revalidiert.length = 0; });
afterEach(() => { t.schliessen(); });

describe("importArtikelCsv", () => {
  it("legt Artikel an und bucht den Startbestand als KORREKTUR", async () => {
    // Ein `zugang` behauptete eine Lieferung, die nie stattfand — und setzte
    // ueber bucheZugang bestelltAt zurueck.
    const erg = await importArtikelCsv(
      "Name;Einheit;Fach;Mindestbestand;Startbestand\nMull;Stk;A1;20;5", t.db);
    expect(wert<{ angelegt: number }>(erg).angelegt).toBe(1);
    const b = t.db.select().from(buchungen).all();
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ typ: "korrektur", menge: 5, lagerortId: HANDLAGER_ID,
                                 quelleTyp: "oidc", quelleId: "u1", kommentar: "CSV-Startbestand" });
    expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/artikel"]);
  });

  it("benutzt die festen Schluessel der Sammelcharge", async () => {
    await importArtikelCsv("Name;Einheit;Fach;Mindestbestand;Startbestand\nMull;Stk;A1;1;3", t.db);
    expect(t.db.select().from(chargen).all()[0])
      .toMatchObject({ chargenNr: CHARGE_OHNE_VERFALL, verfall: PSEUDO_VERFALL });
  });

  it("legt bei Startbestand 0 KEINE Charge und keine Buchung an", async () => {
    await importArtikelCsv("Name;Einheit;Fach;Mindestbestand;Startbestand\nMull;Stk;A1;1;0", t.db);
    expect(t.db.select().from(chargen).all()).toHaveLength(0);
    expect(t.db.select().from(buchungen).all()).toHaveLength(0);
    expect(t.db.select().from(artikel).all()).toHaveLength(1);
  });

  it("reicht die Parserfehler durch und legt die gueltigen Zeilen trotzdem an", async () => {
    const erg = await importArtikelCsv(
      "Name;Einheit;Fach;Mindestbestand;Startbestand\nMull;Stk\nKompressen;Pkg;B2;10;0", t.db);
    const w = wert<{ angelegt: number; fehler: string[] }>(erg);
    expect(w.angelegt).toBe(1);
    expect(w.fehler).toHaveLength(1);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/csv.test.ts src/app/m/lagerbuch/_actions/csv.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./csv"` — **zweimal**, einmal aus `_lib/csv.test.ts`
(gegen `_lib/csv.ts`) und einmal aus `_actions/csv.test.ts` (gegen `_actions/csv.ts`). ⚠️ **Die
beiden Meldungen sehen identisch aus und meinen verschiedene Dateien** — der Pfad in der
Fehlerzeile davor unterscheidet sie.

- [ ] **Schritt 3: `_lib/csv.ts` schreiben**

```ts
/**
 * DER CSV-STAMMDATENPARSER.
 *
 * ⚠️ Er ist KEIN Ausgabeformat (§9.5) — die Ausgabeseite (`bestellvorschlag.csv`,
 * `bestand-YYYY-MM-DD.xlsx`, Zwischenablage) gehoert §9 und damit Teil 6. Diese
 * Datei liest ein, sie schreibt nichts.
 *
 * KEIN "use server": sie ist eine reine Funktion und wird direkt getestet. In
 * einer `"use server"`-Datei waere jeder Export eine Server Action, und der
 * Guard-Scan verlangte dann einen Riegel in einem Parser.
 *
 * FEHLER TRAGEN DIE ZEILENNUMMER. Ein Import mit „3 Zeilen fehlerhaft" ohne
 * Angabe, welche, ist eine Fehlermeldung, mit der niemand arbeiten kann — und
 * die Vorschau (T149) zeigt sie neben der Tabelle.
 */
export type CsvZeile = {
  name: string;
  einheit: string;
  fach: string;
  mindestbestand: number;
  startbestand: number;
};

const KOPFWORTE = ["name", "einheit", "fach"];

export function parseArtikelCsv(text: string): { rows: CsvZeile[]; errors: string[] } {
  const rows: CsvZeile[] = [];
  const errors: string[] = [];
  // BOM entfernen (Excel schreibt ihn) und Windows-Zeilenenden vereinheitlichen.
  const zeilen = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");

  for (let i = 0; i < zeilen.length; i++) {
    const roh = zeilen[i].trim();
    if (!roh) continue;
    const felder = roh.split(/[;,]/).map((f) => f.trim());
    // Kopfzeile erkennen und ueberspringen — aber nur die erste Zeile, damit
    // ein Artikel namens „Name" spaeter nicht verschwindet.
    if (i === 0 && KOPFWORTE.every((w, k) => felder[k]?.toLowerCase() === w)) continue;
    if (felder.length < 5) {
      errors.push(`Zeile ${i + 1}: erwartet 5 Spalten (Name, Einheit, Fach, Mindestbestand, Startbestand), gefunden ${felder.length}.`);
      continue;
    }
    const [name, einheit, fach, minRoh, startRoh] = felder;
    if (!name || !einheit || !fach) {
      errors.push(`Zeile ${i + 1}: Name, Einheit und Fach dürfen nicht leer sein.`);
      continue;
    }
    const mindestbestand = Number(minRoh);
    const startbestand = Number(startRoh);
    if (!Number.isInteger(mindestbestand) || mindestbestand < 0) {
      errors.push(`Zeile ${i + 1}: Mindestbestand „${minRoh}" ist keine ganze Zahl ≥ 0.`);
      continue;
    }
    if (!Number.isInteger(startbestand) || startbestand < 0) {
      errors.push(`Zeile ${i + 1}: Startbestand „${startRoh}" ist keine ganze Zahl ≥ 0.`);
      continue;
    }
    rows.push({ name, einheit, fach, mindestbestand, startbestand });
  }
  return { rows, errors };
}
```

- [ ] **Schritt 4: `_actions/csv.ts` und `_actions/detail.ts` schreiben**

```ts
// src/app/m/lagerbuch/_actions/csv.ts
"use server";

import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { artikel, buchungen, chargen, newId } from "../_db/schema";
import { CHARGE_OHNE_VERFALL, HANDLAGER_ID, PSEUDO_VERFALL } from "../_lib/konstanten";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { parseArtikelCsv } from "../_lib/csv";
import type { ActionErgebnis } from "../_lib/actionErgebnis";

/**
 * ⚠️ DER STARTBESTAND WIRD ALS `korrektur` GEBUCHT, NICHT ALS `zugang`.
 * Ein `zugang` behauptete eine Lieferung, die nie stattfand — und setzte im
 * selben Zug `bestelltAt` zurueck (T114). Die Sammelcharge traegt die festen
 * Schluessel `"ohne Verfall"` und `"2099-12"` (Teil 1, T4); beide duerfen
 * nicht erfunden werden.
 *
 * Jede Zeile laeuft in ihrer EIGENEN Transaktion: ein Import mit 200 Zeilen,
 * von denen die 137. bricht, soll die ersten 136 behalten — und der
 * Fehlerbericht sagt, welche fehlt.
 */
export async function importArtikelCsv(
  text: string,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ angelegt: number; fehler: string[] }>> {
  const viewer = await requireLagerbuchAdmin();
  const { rows, errors } = parseArtikelCsv(text);
  const fehler = [...errors];
  let angelegt = 0;

  for (const row of rows) {
    try {
      db.transaction((tx) => {
        const artikelId = newId();
        tx.insert(artikel).values({
          id: artikelId, name: row.name, einheit: row.einheit, fach: row.fach,
          mindestbestand: row.mindestbestand, aktiv: true, createdAt: new Date(),
        }).run();
        if (row.startbestand > 0) {
          const chargeId = newId();
          tx.insert(chargen).values({
            id: chargeId, artikelId, chargenNr: CHARGE_OHNE_VERFALL,
            verfall: PSEUDO_VERFALL, createdAt: new Date(),
          }).run();
          tx.insert(buchungen).values({
            id: newId(), ts: new Date(), typ: "korrektur", artikelId, chargeId,
            lagerortId: HANDLAGER_ID, menge: row.startbestand,
            quelleTyp: "oidc", quelleId: viewer.sub, kommentar: "CSV-Startbestand",
          }).run();
        }
      });
      angelegt += 1;
    } catch (e) {
      fehler.push(`„${row.name}": ${e instanceof Error ? e.message : "konnte nicht angelegt werden"}`);
    }
  }

  revalidatePath("/m/lagerbuch/verwaltung/artikel");
  return { ok: true, wert: { angelegt, fehler } };
}
```

```ts
// src/app/m/lagerbuch/_actions/detail.ts
"use server";

import { getDb } from "../_db/client";
import type { Ampel } from "../_lib/domain/verfall";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { artikelDetail } from "../_lib/lesepfade/artikel";
import type { ActionErgebnis } from "../_lib/actionErgebnis";

/**
 * ⚠️ DIESE DATEI EXPORTIERT DREI TYPEN NEBEN EINER ACTION.
 * Der Guard-Scan aus Teil 2 (T20) verwirft `export type` und
 * `export interface` ausdruecklich — ein Scan, der sie mitzaehlt, wird auf
 * einer KORREKTEN Datei rot. Sie duerfen hier stehen, weil `"use server"` nur
 * zur Laufzeit ueber WERTE entscheidet; Typen verschwinden beim Kompilieren.
 *
 * `getDetail` liest nur und ist trotzdem eine Action: ihr einziger Aufrufer
 * ist eine Client-Insel (`_ui/ArtikelDrawer.tsx`), die beim Oeffnen nachlaedt
 * statt alle Chargen und Historien aller Artikel in die Tabelle zu haengen.
 * KEIN `revalidatePath`.
 *
 * DIE INSEL BEKOMMT FERTIGE ZEICHENKETTEN, nie ein `Date` fuer die Ampel: was
 * an einer Uhr haengt, entsteht auf dem Server (§6.2.1, Regel 1).
 * `artikelDetail` (Teil 3, T45) rechnet Ampel und Text bereits.
 */
export type ArtikelDetailCharge = {
  id: string; chargenNr: string; verfall: string; rest: number; ampel: Ampel; text: string;
};
export type ArtikelDetailBuchung = {
  id: string; ts: Date; typ: string; menge: number; kommentar: string | null; quelleName: string;
};
export type ArtikelDetailResult = {
  artikel: { id: string; name: string; einheit: string; fach: string;
             mindestbestand: number; aktiv: boolean; bestand: number };
  chargen: ArtikelDetailCharge[];
  historie: ArtikelDetailBuchung[];
};

export async function getDetail(id: string): Promise<ActionErgebnis<ArtikelDetailResult>> {
  await requireLagerbuchAdmin();
  const detail = artikelDetail(getDb(), id);
  if (!detail) return { ok: false, fehler: "Artikel nicht gefunden." };
  return { ok: true, wert: detail };
}
```

- [ ] **Schritt 5: Grün und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/csv.test.ts src/app/m/lagerbuch/_actions/csv.test.ts
rtk git add src/app/m/lagerbuch/_lib/csv.ts src/app/m/lagerbuch/_lib/csv.test.ts \
            src/app/m/lagerbuch/_actions/csv.ts src/app/m/lagerbuch/_actions/csv.test.ts \
            src/app/m/lagerbuch/_actions/detail.ts
rtk git commit -m "feat(lagerbuch): CSV-Import und getDetail

Der Startbestand wird als korrektur gebucht, nicht als zugang: ein zugang
behauptete eine Lieferung, die nie stattfand, und setzte bestelltAt zurueck.
Sammelcharge mit den festen Schluesseln 'ohne Verfall' / '2099-12'.

Jede Zeile in einer eigenen Transaktion: ein Import mit 200 Zeilen, von denen
die 137. bricht, behaelt die ersten 136 — und der Fehlerbericht sagt, welche
fehlt. Parserfehler tragen die Zeilennummer.

_actions/detail.ts exportiert drei TYPEN neben einer Action. Der Guard-Scan
aus Teil 2 verwirft export type ausdruecklich — ein Scan, der sie mitzaehlt,
wird auf einer korrekten Datei rot."
```

---

### Task 126: `_actions/tokens.ts` und `_lib/lesepfade/tokens.ts`

**Files:** Create `_lib/lesepfade/tokens.ts`, `_actions/tokens.ts`; Test `_actions/tokens.test.ts`.

**Interfaces:**
- Consumes: `requireLagerbuchAdmin`; `nanoid` — `customAlphabet`; `_db/schema.ts` — `tokens`,
  `lagerorte`, `artikel`, `newId`.
- Produces:
  ```ts
  // _lib/lesepfade/tokens.ts — KEIN "use client".
  export type TokenZeile = {
    id: string; code: string; label: string; aktiv: boolean;
    lastUsedAt: Date | null; createdAt: Date;
    zielTyp: "fahrzeug" | "artikel" | null; zielId: string | null; zielName: string | null;
  };
  export function tokenListe(db: DB): TokenZeile[];
  export function tokenZiele(db: DB): {
    fahrzeuge: { id: string; name: string; kennung: string | null }[];
    artikel: { id: string; name: string; fach: string }[];
  };

  // _actions/tokens.ts — "use server"
  export async function createToken(
    e: unknown, db?: DB): Promise<ActionErgebnis<{ id: string; code: string }>>;
  export async function setTokenAktiv(e: unknown, db?: DB): Promise<ActionErgebnis>;
  ```
  Konsumenten: `verwaltung/(arbeit)/tokens/page.tsx`, `TokenTable`, `NeuToken` (alle T148).
- ⚠️ **Teil 6 ERWEITERT beide Dateien** (Festlegung H8): §8.3 legt Alphabet, Länge, Kollision, Ablauf
  und Einlösung fest, **Entscheidung 8-F** streicht möglicherweise den Hard-Delete. **Es entsteht
  keine zweite Datei.**
- **`revalidatePath`:** `createToken` und `setTokenAktiv` → `/m/lagerbuch/verwaltung/tokens`.

⚠️ **Der Bindestrich ist Teil des gespeicherten Werts** (`NNN-NNN`, Teil 1, Global Constraints). Der
Generator setzt ihn fest zwischen Position 3 und 4. **Teil 2s `normalisiereCode` (T17) fügt ihn beim
Einlösen wieder ein**, damit die Eingabe `123456` den Code `123-456` findet — deshalb darf hier
**nichts** an der Speicherform geändert werden.

⚠️ **Das Ziel wird gegen die echten Daten geprüft**, damit ein Code **nie ins Leere zeigt**. Ein
Zugangs-Code steht auf einem laminierten Kärtchen; ein Ziel, das es nicht gibt, fällt erst am Regal
auf.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, lagerorte, tokens, newId } from "../_db/schema";

const revalidiert: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => { revalidiert.push(p); } }));
vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: async () => ({ sub: "u1", groups: [], name: null, email: null }),
}));
import { createToken, setTokenAktiv } from "./tokens";
import { tokenListe, tokenZiele } from "../_lib/lesepfade/tokens";

let t: TestDb;
const wert = <T>(e: unknown) => (e as { ok: true; wert: T }).wert;
beforeEach(() => { t = migrierteTestDb("lagerbuch-actions-tokens-"); revalidiert.length = 0; });
afterEach(() => { t.schliessen(); });

describe("createToken", () => {
  it("erzeugt einen Code in der Form NNN-NNN — mit Bindestrich im WERT", async () => {
    // Der Bindestrich ist Teil des gespeicherten Werts; Teil 2s
    // normalisiereCode fuegt ihn beim Einloesen wieder ein, damit die Eingabe
    // 123456 den Code 123-456 findet.
    const erg = await createToken({ label: "Bereitschaft" }, t.db);
    const { id, code } = wert<{ id: string; code: string }>(erg);
    expect(code).toMatch(/^\d{3}-\d{3}$/);
    expect(t.db.select().from(tokens).where(eq(tokens.id, id)).get()?.code).toBe(code);
    expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/tokens"]);
  });

  it("legt einen allgemeinen Zugang ohne Ziel an", async () => {
    const { id } = wert<{ id: string }>(await createToken({ label: "Allgemein" }, t.db));
    expect(t.db.select().from(tokens).where(eq(tokens.id, id)).get())
      .toMatchObject({ zielTyp: null, zielId: null, createdBy: "u1", aktiv: true });
  });

  it("prueft ein Fahrzeug-Ziel gegen die echten Daten", async () => {
    // Ein Zugangs-Code steht auf einem laminierten Kaertchen; ein Ziel, das es
    // nicht gibt, faellt erst am Regal auf.
    const erg = await createToken({ label: "RTW", zielTyp: "fahrzeug", zielId: "gibtsnicht" }, t.db);
    expect(erg.ok).toBe(false);
    const fz = newId();
    t.db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", aktiv: true }).run();
    expect((await createToken({ label: "RTW", zielTyp: "fahrzeug", zielId: fz }, t.db)).ok).toBe(true);
  });

  it("lehnt einen Lagerort ab, der kein Fahrzeug ist", async () => {
    const lager = newId();
    t.db.insert(lagerorte).values({ id: lager, name: "Lager", typ: "lager", aktiv: true }).run();
    expect((await createToken({ label: "X", zielTyp: "fahrzeug", zielId: lager }, t.db)).ok).toBe(false);
  });

  it("verlangt Typ UND Kennung oder keins von beiden", async () => {
    expect((await createToken({ label: "X", zielTyp: "artikel" }, t.db)).ok).toBe(false);
    expect((await createToken({ label: "X", zielId: "irgendwas" }, t.db)).ok).toBe(false);
  });

  it("erzeugt keine Dubletten", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 30; i++) {
      codes.add(wert<{ code: string }>(await createToken({ label: `L${i}` }, t.db)).code);
    }
    expect(codes.size).toBe(30);
  });
});

describe("setTokenAktiv", () => {
  it("sperrt und reaktiviert", async () => {
    const { id } = wert<{ id: string }>(await createToken({ label: "L" }, t.db));
    revalidiert.length = 0;
    await setTokenAktiv({ id, aktiv: false }, t.db);
    expect(t.db.select().from(tokens).where(eq(tokens.id, id)).get()?.aktiv).toBe(false);
    expect(revalidiert).toEqual(["/m/lagerbuch/verwaltung/tokens"]);
  });
});

describe("tokenListe / tokenZiele", () => {
  it("loest den Zielnamen auf und sortiert neueste zuerst", async () => {
    const a = newId();
    t.db.insert(artikel).values({ id: a, name: "Mull", einheit: "Stk", fach: "A1",
      mindestbestand: 1, aktiv: true, createdAt: new Date() }).run();
    await createToken({ label: "Alt" }, t.db);
    await createToken({ label: "Neu", zielTyp: "artikel", zielId: a }, t.db);
    const zeilen = tokenListe(t.db);
    expect(zeilen[0].label).toBe("Neu");
    expect(zeilen[0].zielName).toBe("Mull");
    expect(zeilen[1].zielName).toBeNull();
  });

  it("liefert nur AKTIVE Fahrzeuge und Artikel als waehlbare Ziele", async () => {
    const fz = newId(), alt = newId(), a = newId();
    t.db.insert(lagerorte).values([
      { id: fz, name: "RTW 1", typ: "fahrzeug", aktiv: true },
      { id: alt, name: "RTW alt", typ: "fahrzeug", aktiv: false },
    ]).run();
    t.db.insert(artikel).values({ id: a, name: "Mull", einheit: "Stk", fach: "A1",
      mindestbestand: 1, aktiv: true, createdAt: new Date() }).run();
    const ziele = tokenZiele(t.db);
    expect(ziele.fahrzeuge.map((f) => f.id)).toEqual([fz]);
    expect(ziele.artikel.map((x) => x.id)).toEqual([a]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/tokens.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./tokens"`.

- [ ] **Schritt 3: `_lib/lesepfade/tokens.ts` schreiben**

```ts
import { desc, eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { artikel, lagerorte, tokens } from "../../_db/schema";

/**
 * DIE ZUGANGS-CODE-LISTE.
 *
 * ⚠️ TEIL 6 ERWEITERT DIESE DATEI (Plan-Festlegung H8). §8.3 legt Alphabet,
 * Laenge, Kollision, Ablauf und Einloesung fest; Teil 3 hatte den Lesepfad
 * deshalb urspruenglich nach Teil 6 geschoben. Er steht hier, weil sonst
 * `/verwaltung/tokens` — eine Seite DIESES Kapitels (§6.2.2, Zeile 22) — in
 * Teil 5 gar nicht baubar waere. ES ENTSTEHT KEINE ZWEITE DATEI.
 *
 * Der ZIELNAME wird hier aufgeloest und nicht in der Insel: der Client bekommt
 * fertige Zeichenketten (§6.2.1). Ohne das musste die Insel zwei weitere
 * Listen laden, nur um einen Namen anzuzeigen.
 */
export type TokenZeile = {
  id: string;
  code: string;
  label: string;
  aktiv: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  zielTyp: "fahrzeug" | "artikel" | null;
  zielId: string | null;
  zielName: string | null;
};

export function tokenListe(db: DB): TokenZeile[] {
  const zeilen = db.select().from(tokens).orderBy(desc(tokens.createdAt)).all();
  const fahrzeugName = new Map(
    db.select({ id: lagerorte.id, name: lagerorte.name }).from(lagerorte).all()
      .map((f) => [f.id, f.name]),
  );
  const artikelName = new Map(
    db.select({ id: artikel.id, name: artikel.name }).from(artikel).all()
      .map((a) => [a.id, a.name]),
  );
  return zeilen.map((t) => ({
    id: t.id, code: t.code, label: t.label, aktiv: t.aktiv,
    lastUsedAt: t.lastUsedAt, createdAt: t.createdAt,
    zielTyp: t.zielTyp as TokenZeile["zielTyp"],
    zielId: t.zielId,
    zielName:
      t.zielTyp === "fahrzeug" ? fahrzeugName.get(t.zielId ?? "") ?? null
      : t.zielTyp === "artikel" ? artikelName.get(t.zielId ?? "") ?? null
      : null,
  }));
}

/**
 * Die waehlbaren Ziele fuer `NeuToken`. NUR AKTIVE: ein Code, der auf ein
 * ausgemustertes Fahrzeug zeigt, ist von Anfang an eine Sackgasse.
 * `kennung` und `fach` wandern mit, weil das `Select showSearch` sie als
 * `keywords` braucht (§6.4.3, Bedingung 1) — sonst tippt jemand ein
 * Kennzeichen und findet nichts.
 */
export function tokenZiele(db: DB): {
  fahrzeuge: { id: string; name: string; kennung: string | null }[];
  artikel: { id: string; name: string; fach: string }[];
} {
  return {
    // `aktiv` wird MITGELESEN statt je Zeile nachgeschlagen — ein
    // `db.select().get()` in einem `.filter()` waere N+1 auf einer Datei, die
    // Teil 6 erweitert und damit als Muster kopiert.
    fahrzeuge: db
      .select({ id: lagerorte.id, name: lagerorte.name,
                kennung: lagerorte.kennung, aktiv: lagerorte.aktiv })
      .from(lagerorte)
      .where(eq(lagerorte.typ, "fahrzeug"))
      .all()
      .filter((f) => f.aktiv)
      .map(({ id, name, kennung }) => ({ id, name, kennung }))
      .sort((a, b) => a.name.localeCompare(b.name, "de")),
    artikel: db
      .select({ id: artikel.id, name: artikel.name, fach: artikel.fach, aktiv: artikel.aktiv })
      .from(artikel)
      .all()
      .filter((a) => a.aktiv)
      .map(({ id, name, fach }) => ({ id, name, fach }))
      .sort((a, b) => a.name.localeCompare(b.name, "de")),
  };
}
```

- [ ] **Schritt 4: `_actions/tokens.ts` schreiben**

```ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { tokens, lagerorte, artikel, newId } from "../_db/schema";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";

/**
 * ⚠️ TEIL 6 ERWEITERT DIESE DATEI (Plan-Festlegung H8): §8.3 entscheidet
 * Alphabet, Laenge, Kollisionsverhalten und Ablauf, Entscheidung 8-F
 * moeglicherweise den Wegfall des Hard-Delete. Hier steht die Form des
 * Bestands, damit `/verwaltung/tokens` in Teil 5 baubar ist.
 *
 * ⚠️ DER BINDESTRICH IST TEIL DES GESPEICHERTEN WERTS. Der Generator setzt ihn
 * fest zwischen Position 3 und 4; Teil 2s `normalisiereCode` (T17) fuegt ihn
 * beim Einloesen wieder ein, damit die Eingabe `123456` den Code `123-456`
 * findet. An der Speicherform darf hier nichts geaendert werden.
 */
const sechsZiffern = customAlphabet("0123456789", 6);

function erzeugeFreienCode(db: DB): string {
  for (let i = 0; i < 20; i++) {
    const d = sechsZiffern();
    const code = `${d.slice(0, 3)}-${d.slice(3)}`;
    if (!db.select().from(tokens).where(eq(tokens.code, code)).get()) return code;
  }
  throw new Error("Konnte keinen eindeutigen Code erzeugen");
}

const CreateSchema = z
  .object({
    label: z.string().trim().min(1, "Bezeichnung erforderlich"),
    zielTyp: z.enum(["fahrzeug", "artikel"]).optional(),
    zielId: z.string().min(1).optional(),
  })
  // Ziel ist entweder komplett gesetzt (Typ + Kennung) oder gar nicht.
  .refine((v) => (v.zielTyp ? Boolean(v.zielId) : !v.zielId),
          { message: "Ziel unvollständig", path: ["zielId"] });

export async function createToken(
  eingabe: unknown, db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string; code: string }>> {
  const viewer = await requireLagerbuchAdmin();
  let v: z.output<typeof CreateSchema>;
  try {
    v = CreateSchema.parse(eingabe);
  } catch (e) {
    const feldFehler = zodFehler(e);
    return { ok: false, fehler: "Bitte die markierten Felder prüfen.", ...(feldFehler ? { feldFehler } : {}) };
  }

  /*
   * ⚠️ DAS ZIEL WIRD GEGEN DIE ECHTEN DATEN GEPRUEFT, damit ein Code NIE ins
   * Leere zeigt. Ein Zugangs-Code steht auf einem laminierten Kaertchen; ein
   * Ziel, das es nicht gibt, faellt erst am Regal auf — und dann steht dort
   * jemand mit Handschuhen vor einer leeren Seite.
   */
  if (v.zielTyp === "fahrzeug") {
    const f = db.select().from(lagerorte).where(eq(lagerorte.id, v.zielId!)).get();
    if (!f || f.typ !== "fahrzeug") {
      return { ok: false, fehler: "Fahrzeug nicht gefunden.", feldFehler: { zielId: "Fahrzeug nicht gefunden" } };
    }
  } else if (v.zielTyp === "artikel") {
    const a = db.select().from(artikel).where(eq(artikel.id, v.zielId!)).get();
    if (!a) {
      return { ok: false, fehler: "Artikel nicht gefunden.", feldFehler: { zielId: "Artikel nicht gefunden" } };
    }
  }

  const id = newId();
  let code: string;
  try { code = erzeugeFreienCode(db); }
  catch { return { ok: false, fehler: "Es konnte kein freier Code erzeugt werden — bitte erneut versuchen." }; }

  db.insert(tokens).values({
    id, code, label: v.label, aktiv: true, createdAt: new Date(), createdBy: viewer.sub,
    zielTyp: v.zielTyp ?? null, zielId: v.zielTyp ? v.zielId! : null,
  }).run();

  revalidatePath("/m/lagerbuch/verwaltung/tokens");
  return { ok: true, wert: { id, code } };
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });

export async function setTokenAktiv(eingabe: unknown, db: DB = getDb()): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();
  let v: z.output<typeof AktivSchema>;
  try { v = AktivSchema.parse(eingabe); } catch { return { ok: false, fehler: "Ungültige Eingabe." }; }
  db.update(tokens).set({ aktiv: v.aktiv }).where(eq(tokens.id, v.id)).run();
  revalidatePath("/m/lagerbuch/verwaltung/tokens");
  return { ok: true };
}
```

- [ ] **Schritt 5: Grün und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/tokens.test.ts
rtk git add src/app/m/lagerbuch/_lib/lesepfade/tokens.ts src/app/m/lagerbuch/_actions/tokens.ts \
            src/app/m/lagerbuch/_actions/tokens.test.ts
rtk git commit -m "feat(lagerbuch): Zugangs-Codes — Lesepfad und zwei Actions

H8: Teil 3 hatte tokenListe nach Teil 6 geschoben. Damit waere
/verwaltung/tokens — eine Seite von §6 — in Teil 5 nicht baubar. Beide Dateien
entstehen hier in der Form des Bestands; TEIL 6 ERWEITERT sie (§8.3: Alphabet,
Laenge, Kollision, Ablauf; Entscheidung 8-F: Hard-Delete).

Der Bindestrich ist Teil des gespeicherten Werts. Teil 2s normalisiereCode
fuegt ihn beim Einloesen wieder ein, damit 123456 den Code 123-456 findet — an
der Speicherform darf nichts geaendert werden.

Das Ziel wird gegen die echten Daten geprueft: ein Code steht auf einem
laminierten Kaertchen, und ein Ziel, das es nicht gibt, faellt erst am Regal
auf.

tokenZiele liefert nur AKTIVE Fahrzeuge und Artikel und traegt kennung/fach
mit — das Select showSearch braucht sie als keywords, sonst tippt jemand ein
Kennzeichen und findet nichts."
```

---

### Gate nach Welle 4

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build && pnpm exec playwright test
pnpm vitest run src/app/m/lagerbuch/_actions/guards.test.ts   # 43 bewachte Deklarationen, keine ungeschuetzte
```

---

## Welle 5 — Der teuerste Umbau der Verwaltung (1 Task)

Ein einzelner Task, weil `ArtikelTable` (T129) ihn importiert und zwei Tasks in derselben
Wellenstufe nicht voneinander abhängen dürfen (Festlegung H9).

---

### Task 127: `_ui/ArtikelDrawer.tsx` — sechs Belange, drei Monatsfelder, ein Zustandsmechanismus

**Files:** Create `src/app/m/lagerbuch/_ui/monat.ts`, `src/app/m/lagerbuch/_ui/ArtikelDrawer.tsx`;
Test `_ui/ArtikelDrawer.test.tsx`.

**Interfaces:**
- Consumes: `_actions/detail.ts` (T125) — `getDetail`, `type ArtikelDetailResult`;
  `_actions/artikel.ts` (T113) — `updateArtikel`, `setArtikelAktiv`; `_actions/buchung.ts` (T114) —
  `bucheZugang`, `bucheEntnahme`; `_actions/loeschen.ts` (T124) — `pruefeLoeschbar`,
  `loescheElement`, `deaktiviereElement`; `_ui/LoeschButton.tsx` (T110); `_ui/Chip.tsx` (T106);
  `_ui/Plakette.tsx` (T107); `_lib/format.ts` (Teil 3) — `ampelTon`, `fmtVerfall`;
  `_lib/journalZeile.ts` (Teil 3, T42) — `journalZeile`; `antd` — `Drawer`, `Form`, `Input`,
  `InputNumber`, `Select`, `DatePicker`, `Switch`, `Button`, `Table`, `Space`, `Alert`.
- Produces:
  ```ts
  // _ui/monat.ts — KEIN "use client" (Falle 6).
  export function monatAusPicker(d: Dayjs | null): string | undefined;   // Dayjs → "YYYY-MM"
  ```
  ```tsx
  // _ui/ArtikelDrawer.tsx — "use client".
  export function zielFilter(eingabe: string,
                             option?: { label?: string; keywords?: string }): boolean;
  export function ArtikelDrawer(props: {
    id: string;
    onSchliessen: () => void;
    fahrzeuge: { id: string; name: string; kennung: string | null }[];  // Server-Prop
  }): JSX.Element;
  ```
  Konsument von `ArtikelDrawer`: `verwaltung/(arbeit)/artikel/ArtikelTable.tsx` (T129) — **einer**.
  Konsumenten von `monatAusPicker`: **drei** — `_ui/ArtikelDrawer.tsx` (hier),
  `verwaltung/(arbeit)/fahrzeuge/[id]/VerfallEditor.tsx` (T132) und
  `verwaltung/(arbeit)/bz/[id]/kontrolle/KontrolleForm.tsx` (T140).
  ⚠️ **Deshalb liegt sie in einer EIGENEN Datei ohne `"use client"`.** Eine aus einem Client-Modul
  exportierte Hilfsfunktion, die drei Dateien benutzen, ist eine Zeitbombe: sobald eine davon zu
  einer Server Component wird — oder eine Seite sie „nur zum Formatieren" importiert —, bekommt sie
  eine Client-Referenz statt der Funktion, HTTP 500 für die ganze Seite, und weder `build` noch
  Vitest sehen es (Falle 6). `_ui/monat.ts` ruft nichts auf Modulebene auf und läuft in beiden
  Ebenen.
- **Ersatzanker (§6.11):** `getByRole("dialog", { name: "<Artikelname>" })` ersetzt `.drawer`
  (8 Vorkommen); `getByLabel("Verfallsmonat")` ersetzt `input[type="month"]` (2 Vorkommen).

**Sechs Belange gleichzeitig** (§6.2.3): Stammdaten bearbeiten (Mindestbestand, Fach, Einheit),
Zugang buchen (Menge, Charge, Verfall), Entnahme/Umlagerung mit Zielauswahl, Chargenliste,
Löschdialog — **und ein Zustandsmechanismus, den man beim Portieren leicht zerstört.**

⚠️ **Falle 45 — lokale, sofort editierbare Spiegel der Serverfelder.** `ArtikelDrawer.tsx:24-26`
schreibt es aus: „so that Stepper clicks / keystrokes never read back a stale value while a commit is
in flight". Der Mindestbestand **committet automatisch** mit **400 ms** Verzögerung. Daraus folgt
§6.4.7: **dieses Feld kommt NICHT in ein `antd Form`.** Wer es in ein `Form.Item` hängt, hat **drei**
Zustandsquellen — Serverwert, lokaler Spiegel, `Form`-Store — in einem Feld, dessen falscher Wert ein
falscher Mindestbestand und damit ein falscher Bestellvorschlag ist. **Das gilt auch dann, wenn `Form`
„eigentlich" funktionieren würde: der Konflikt ist gelöst, und eine gelöste Sache neu aufzumachen ist
keine Modernisierung.**

⚠️ **Zwei `Select showSearch` mit ausgeschriebenem `filterOption`** (§6.4.3, Bedingung 1):
Fahrzeugname (`ArtikelDrawer.tsx:261`) und Chargennummer (`:285`). Beide filtern über
`label + keywords`; ohne das tippt jemand ein Kennzeichen und findet nichts — **kein Fehler, keine
Meldung, nur ein leeres Auswahlfeld.**

⚠️ **Der Verfallsmonat wird `DatePicker picker="month"` mit `format="YYYY-MM"`** (§6.11, Auflage 12).
Der Wert wird **an der Grenze** auf die Zeichenkette `YYYY-MM` normalisiert — **dayjs bleibt in der
Insel**, die Action sieht nur einen String, und die Strenge ist serverseitig `MONAT_REGEX` (T114).
Der E2E-Selektor `input[type="month"]` **stirbt hier** und lebt nur auf dem Helfer-Ast weiter.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, fill, clickPortal, queryPortal, existsPortal }
  from "@/app/m/qr/_lib/test-dom";
import { ArtikelDrawer } from "./ArtikelDrawer";

const detail = {
  artikel: { id: "a1", name: "Kompressen steril", einheit: "Stk", fach: "A1",
             mindestbestand: 20, aktiv: true, bestand: 7 },
  chargen: [{ id: "c1", chargenNr: "L42", verfall: "2027-03", rest: 7,
              ampel: "gelb" as const, text: "läuft 03/27 ab" }],
  historie: [{ id: "b1", ts: new Date("2026-08-01T10:00:00Z"), typ: "entnahme",
               menge: -3, kommentar: null, quelleName: "111-111" }],
};
const updateArtikel = vi.fn(async () => ({ ok: true as const }));
vi.mock("../_actions/detail", () => ({ getDetail: async () => ({ ok: true, wert: detail }) }));
vi.mock("../_actions/artikel", () => ({
  updateArtikel: (...a: unknown[]) => updateArtikel(...(a as [])),
  setArtikelAktiv: async () => ({ ok: true }),
}));
vi.mock("../_actions/buchung", () => ({
  bucheZugang: async () => ({ ok: true }),
  bucheEntnahme: async () => ({ ok: true, wert: { gebucht: 1 } }),
}));
vi.mock("../_actions/loeschen", () => ({
  pruefeLoeschbar: async () => ({ ok: true, wert: { loeschbar: true } }),
  loescheElement: async () => ({ ok: true }),
  deaktiviereElement: async () => ({ ok: true }),
}));

const FAHRZEUGE = [{ id: "f1", name: "RTW 1", kennung: "UE-RK 1234" }];
const warte = () => new Promise((r) => setTimeout(r, 0));
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); updateArtikel.mockClear(); });
afterEach(async () => { vi.useRealTimers(); await unmount(); });

describe("ArtikelDrawer: der Ersatzanker", () => {
  it("traegt die Rolle dialog mit dem ARTIKELNAMEN als zugaenglichem Namen", async () => {
    // Ersatz fuer `.drawer` (8 Vorkommen in loeschen.spec.ts und
    // verwaltung-flow.spec.ts): getByRole("dialog", { name: "<Artikelname>" }).
    await mount(<ArtikelDrawer id="a1" onSchliessen={() => {}} fahrzeuge={FAHRZEUGE} />);
    await warte();
    expect(queryPortal(".ant-drawer-title").textContent).toBe("Kompressen steril");
    expect(queryPortal("[role='dialog']")).toBeTruthy();
  });
});

describe("ArtikelDrawer: Falle 45 — der Spiegel und der Debounce", () => {
  it("der Mindestbestand steht NICHT in einem Form.Item", async () => {
    /*
     * Wer ein auto-committendes Feld in ein Form.Item haengt, hat DREI
     * Zustandsquellen: Serverwert, lokaler Spiegel, Form-Store. In einem
     * Feld, dessen falscher Wert ein falscher Mindestbestand und damit ein
     * falscher Bestellvorschlag ist, ist das der teuerste Ort dafuer.
     */
    const quelle = readFileSync("src/app/m/lagerbuch/_ui/ArtikelDrawer.tsx", "utf8");
    const abschnitt = quelle.slice(quelle.indexOf("Mindestbestand"), quelle.indexOf("Zugang buchen"));
    expect(abschnitt).not.toMatch(/Form\.Item/);
  });

  it("die Eingabe ist SOFORT sichtbar, obwohl der Commit erst nach 400 ms laeuft", async () => {
    await mount(<ArtikelDrawer id="a1" onSchliessen={() => {}} fahrzeuge={FAHRZEUGE} />);
    await warte();
    await fill("[data-rolle='mindestbestand'] input", "37");
    // Kein Rueckfall auf den Serverwert waehrend der Commit unterwegs ist.
    expect(queryPortal("[data-rolle='mindestbestand'] input").getAttribute("value")).toBe("37");
    expect(updateArtikel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    await warte();
    expect(updateArtikel).toHaveBeenCalledWith("a1", { mindestbestand: 37 });
  });

  it("committet innerhalb von 400 ms nur EINMAL", async () => {
    await mount(<ArtikelDrawer id="a1" onSchliessen={() => {}} fahrzeuge={FAHRZEUGE} />);
    await warte();
    await fill("[data-rolle='mindestbestand'] input", "3");
    await fill("[data-rolle='mindestbestand'] input", "37");
    vi.advanceTimersByTime(400);
    await warte();
    expect(updateArtikel).toHaveBeenCalledTimes(1);
  });
});

describe("ArtikelDrawer: die zwei suchbaren Auswahlfelder", () => {
  it("beide setzen `filterOption` ausdruecklich", async () => {
    // Ohne das tippt jemand ein Kennzeichen und findet nichts — kein Fehler,
    // keine Meldung, nur ein leeres Auswahlfeld (§6.4.3).
    const quelle = readFileSync("src/app/m/lagerbuch/_ui/ArtikelDrawer.tsx", "utf8");
    const treffer = [...quelle.matchAll(/showSearch/g)];
    expect(treffer.length).toBe(2);
    expect([...quelle.matchAll(/filterOption=/g)].length).toBe(2);
  });

  it("das Ziel-Auswahlfeld findet ein Fahrzeug ueber sein KENNZEICHEN", async () => {
    await mount(<ArtikelDrawer id="a1" onSchliessen={() => {}} fahrzeuge={FAHRZEUGE} />);
    await warte();
    const { zielFilter } = await import("./ArtikelDrawer");
    expect(zielFilter("UE-RK", { label: "RTW 1", keywords: "UE-RK 1234" })).toBe(true);
    expect(zielFilter("MTW", { label: "RTW 1", keywords: "UE-RK 1234" })).toBe(false);
  });
});

describe("ArtikelDrawer: der Verfallsmonat", () => {
  it("ist ein DatePicker mit format=YYYY-MM und traegt ein Label", async () => {
    await mount(<ArtikelDrawer id="a1" onSchliessen={() => {}} fahrzeuge={FAHRZEUGE} />);
    await warte();
    // `input[type="month"]` stirbt hier: ein DatePicker rendert keins.
    expect(existsPortal("input[type='month']")).toBe(false);
    expect(queryPortal("[data-rolle='verfallsmonat'] input")
      .getAttribute("aria-label")).toBe("Verfallsmonat");
  });

  it("normalisiert den Wert an der Grenze auf YYYY-MM — dayjs bleibt in der Insel", async () => {
    // Aus `_ui/monat.ts`, NICHT aus dem Drawer: drei Dateien benutzen sie, und
    // eine aus einem "use client"-Modul exportierte Hilfsfunktion waere
    // Falle 6 in Wartestellung.
    const { monatAusPicker } = await import("./monat");
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/app/m/lagerbuch/_ui/monat.ts", "utf8").slice(0, 200))
      .not.toMatch(/["']use client["']/);
    const dayjs = (await import("dayjs")).default;
    expect(monatAusPicker(dayjs("2027-03-15"))).toBe("2027-03");
    expect(monatAusPicker(null)).toBeUndefined();
  });
});

describe("ArtikelDrawer: die Chargenliste", () => {
  it("zeigt je Charge Plakette, Nummer, Rest und Statuschip", async () => {
    await mount(<ArtikelDrawer id="a1" onSchliessen={() => {}} fahrzeuge={FAHRZEUGE} />);
    await warte();
    const text = queryPortal(".ant-drawer-body").textContent ?? "";
    expect(text).toContain("L42");
    expect(text).toContain("läuft 03/27 ab");
    expect(existsPortal("svg[role='img']")).toBe(true);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/ArtikelDrawer.test.tsx
```

Erwartet: FAIL mit `Failed to resolve import "./ArtikelDrawer"`.

- [ ] **Schritt 3: `_ui/monat.ts` schreiben**

```ts
import type { Dayjs } from "dayjs";

/**
 * ⚠️ DIE GRENZE, AN DER DAYJS ENDET — UND SIE LIEGT IN EINER DATEI OHNE
 * `"use client"`.
 *
 * `DatePicker picker="month"` arbeitet mit `Dayjs`; jede der drei Actions
 * erwartet die Zeichenkette `YYYY-MM` und prueft sie serverseitig mit
 * `MONAT_REGEX` (§4.6, §6.11 Auflage 12). Diese Funktion ist die EINZIGE
 * Stelle, an der umgerechnet wird — dayjs kommt nie in eine Server Action.
 *
 * WARUM EINE EIGENE DATEI und nicht ein Export aus `ArtikelDrawer.tsx`: drei
 * Dateien benutzen sie (`ArtikelDrawer`, `VerfallEditor`, `KontrolleForm`).
 * Eine aus einem `"use client"`-Modul exportierte Hilfsfunktion, die drei
 * Verwender hat, ist eine Zeitbombe: sobald eine davon zu einer Server
 * Component wird — oder eine Seite sie „nur zum Formatieren" importiert —,
 * bekommt sie eine Client-REFERENZ statt der Funktion. HTTP 500 fuer die ganze
 * Seite, und weder `pnpm build` noch Vitest sehen es (Falle 6).
 *
 * Die Datei ruft nichts auf Modulebene auf und laeuft damit in beiden Ebenen.
 */
export function monatAusPicker(d: Dayjs | null): string | undefined {
  return d ? d.format("YYYY-MM") : undefined;
}
```

- [ ] **Schritt 4: `_ui/ArtikelDrawer.tsx` schreiben**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Alert, Button, DatePicker, Drawer, Form, Input, InputNumber, Select, Space, Switch, Table }
  from "antd";
import type { Dayjs } from "dayjs";
import { monatAusPicker } from "./monat";
import { getDetail, type ArtikelDetailResult } from "../_actions/detail";
import { setArtikelAktiv, updateArtikel } from "../_actions/artikel";
import { bucheEntnahme, bucheZugang } from "../_actions/buchung";
import { deaktiviereElement, loescheElement, pruefeLoeschbar } from "../_actions/loeschen";
import { ampelTon } from "../_lib/format";
import { journalZeile } from "../_lib/journalZeile";
import { SCHRIFT } from "../_lib/schrift";
import { Chip } from "./Chip";
import { Plakette } from "./Plakette";
import { LoeschButton } from "./LoeschButton";
import s from "./verwaltung.module.css";

/** ⚠️ 400 ms — der Wert des Bestands (`ArtikelDrawer.tsx:17`), nicht neu gewählt. */
const MINDEST_DEBOUNCE_MS = 400;

/**
 * `filterOption` fuer die zwei `Select showSearch` (§6.4.3, Bedingung 1).
 * Exportiert, damit der Test sie direkt prueft: `Select showSearch` filtert
 * ohne weitere Angabe NUR ueber `label` und kennt das `keywords`-Feld nicht —
 * ohne diese Funktion tippt jemand ein Kennzeichen und findet nichts. Kein
 * Fehler, keine Meldung, nur ein leeres Auswahlfeld.
 */
export function zielFilter(eingabe: string, option?: { label?: string; keywords?: string }): boolean {
  const heuhaufen = `${option?.label ?? ""} ${option?.keywords ?? ""}`.toLowerCase();
  return heuhaufen.includes(eingabe.trim().toLowerCase());
}

/**
 * DER TEUERSTE UMBAU DER VERWALTUNG — sechs Belange in einem Blatt.
 *
 * ⚠️ FALLE 45: DIE LOKALEN SPIEGEL. `ArtikelDrawer.tsx:24-26` schreibt es aus —
 * lokale, SOFORT editierbare Spiegel der Serverfelder, „so that Stepper clicks
 * / keystrokes never read back a stale value while a commit is in flight".
 * Der Mindestbestand committet automatisch nach 400 ms.
 *
 * DARAUS FOLGT: DIESES FELD KOMMT NICHT IN EIN `antd Form`. Wer es in ein
 * `Form.Item` haengt, hat DREI Zustandsquellen — Serverwert, lokaler Spiegel,
 * `Form`-Store — in einem Feld, dessen falscher Wert ein falscher
 * Mindestbestand und damit ein falscher Bestellvorschlag ist. Das gilt auch
 * dann, wenn `Form` „eigentlich" funktionieren wuerde: der Konflikt ist
 * geloest, und eine geloeste Sache neu aufzumachen ist keine Modernisierung.
 *
 * `antd Form` gibt es hier trotzdem — aber NUR fuer die zwei Buchungsbloecke,
 * weil die einen Absendeknopf haben (§6.4.7: „`antd Form` ueberall dort, wo es
 * einen Absendeknopf gibt — und nirgends sonst").
 *
 * `fahrzeuge` ist ein SERVER-PROP. Die Insel laedt keine Fahrzeugliste nach:
 * die Seite hat sie ohnehin, und ein zweiter Lesepfad waere eine zweite
 * Wahrheit ueber „welche Fahrzeuge sind aktiv".
 */
export function ArtikelDrawer({
  id,
  onSchliessen,
  fahrzeuge,
}: {
  id: string;
  onSchliessen: () => void;
  fahrzeuge: { id: string; name: string; kennung: string | null }[];
}) {
  const [detail, setDetail] = useState<ArtikelDetailResult | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();

  // Die lokalen Spiegel (Falle 45).
  const [mindest, setMindest] = useState<number | null>(null);
  const [fach, setFach] = useState("");
  const [einheit, setEinheit] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const laden = useCallback(async () => {
    const erg = await getDetail(id);
    if (!erg.ok) { setFehler(erg.fehler); return; }
    setDetail(erg.wert);
    setMindest(erg.wert.artikel.mindestbestand);
    setFach(erg.wert.artikel.fach);
    setEinheit(erg.wert.artikel.einheit);
  }, [id]);

  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  function mindestGeaendert(wert: number | null) {
    setMindest(wert);                       // sofort sichtbar — kein stale read
    if (wert === null) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      void updateArtikel(id, { mindestbestand: wert });
    }, MINDEST_DEBOUNCE_MS);
  }

  const a = detail?.artikel;

  return (
    <Drawer
      open
      onClose={onSchliessen}
      width={520}
      /* ⚠️ DER TITEL IST DER ZUGAENGLICHE NAME und damit der Ersatzanker fuer
         `.drawer` (8 Vorkommen): getByRole("dialog", { name: "<Name>" }). */
      title={a?.name ?? "Artikel"}
      destroyOnHidden
    >
      {fehler ? <Alert type="warning" showIcon={false} message={fehler} /> : null}
      {!a ? <div style={SCHRIFT.neben}>Wird geladen …</div> : (
        <div style={{ display: "grid", gap: 20 }}>

          {/* ── Stammdaten — OHNE Form, weil sie beim Aendern speichern ── */}
          <section>
            <h3 style={{ ...SCHRIFT.abschnitt, margin: "0 0 8px" }}>Stammdaten</h3>
            <Space direction="vertical" style={{ width: "100%" }}>
              <label style={SCHRIFT.feldname}>Mindestbestand</label>
              <span data-rolle="mindestbestand">
                <InputNumber
                  min={0}
                  max={99999}
                  value={mindest}
                  onChange={mindestGeaendert}
                  aria-label="Mindestbestand"
                  style={{ width: "100%", fontVariantNumeric: "tabular-nums" }}
                />
              </span>
              <label style={SCHRIFT.feldname}>Fach</label>
              <Input
                value={fach}
                onChange={(e) => setFach(e.target.value)}
                onBlur={() => { if (fach !== a.fach) void updateArtikel(id, { fach }); }}
                aria-label="Fach"
              />
              <label style={SCHRIFT.feldname}>Einheit</label>
              <Input
                value={einheit}
                onChange={(e) => setEinheit(e.target.value)}
                onBlur={() => { if (einheit !== a.einheit) void updateArtikel(id, { einheit }); }}
                aria-label="Einheit"
              />
              <Space>
                <Switch
                  checked={a.aktiv}
                  aria-label="Artikel aktiv"
                  onChange={(aktiv) => start(async () => {
                    await setArtikelAktiv({ id, aktiv });
                    await laden();
                  })}
                />
                <span style={SCHRIFT.text}>{a.aktiv ? "aktiv" : "inaktiv"}</span>
              </Space>
            </Space>
          </section>

          {/* ── Zugang buchen — MIT Form, es gibt einen Absendeknopf ── */}
          <section>
            <h3 style={{ ...SCHRIFT.abschnitt, margin: "0 0 8px" }}>Zugang buchen</h3>
            <Form
              layout="vertical"
              disabled={laeuft}
              onFinish={(werte: { menge: number; chargenNr?: string; verfall?: Dayjs }) =>
                start(async () => {
                  const erg = await bucheZugang({
                    artikelId: id,
                    menge: werte.menge,
                    neueCharge: werte.chargenNr
                      ? { chargenNr: werte.chargenNr, verfall: monatAusPicker(werte.verfall ?? null) ?? "" }
                      : undefined,
                  });
                  if (!erg.ok) setFehler(erg.fehler); else { setFehler(null); await laden(); }
                })}
            >
              <Form.Item name="menge" label="Menge" rules={[{ required: true, message: "Menge angeben" }]}>
                <InputNumber min={1} max={99999} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="chargenNr" label="Chargennummer">
                <Input />
              </Form.Item>
              <Form.Item name="verfall" label="Verfallsmonat">
                <span data-rolle="verfallsmonat">
                  <DatePicker
                    picker="month"
                    format="YYYY-MM"
                    aria-label="Verfallsmonat"
                    style={{ width: "100%" }}
                  />
                </span>
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={laeuft}>Zugang buchen</Button>
            </Form>
          </section>

          {/* ── Entnahme / Umlagerung — MIT Form ── */}
          <section>
            <h3 style={{ ...SCHRIFT.abschnitt, margin: "0 0 8px" }}>Entnahme / Umlagerung</h3>
            <Form
              layout="vertical"
              disabled={laeuft}
              onFinish={(werte: { menge: number; zielLagerortId?: string; kommentar?: string }) =>
                start(async () => {
                  const erg = await bucheEntnahme({ artikelId: id, ...werte });
                  if (!erg.ok) setFehler(erg.fehler); else { setFehler(null); await laden(); }
                })}
            >
              <Form.Item name="menge" label="Menge" rules={[{ required: true, message: "Menge angeben" }]}>
                <InputNumber min={1} max={99999} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="zielLagerortId" label="Ziel (leer = Verbrauch aus dem Handlager)">
                <Select
                  showSearch
                  allowClear
                  filterOption={zielFilter}
                  options={fahrzeuge.map((f) => ({
                    value: f.id, label: f.name, keywords: f.kennung ?? "",
                  }))}
                  aria-label="Ziel-Fahrzeug"
                />
              </Form.Item>
              <Form.Item name="kommentar" label="Kommentar">
                <Input />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={laeuft}>Buchen</Button>
            </Form>
          </section>

          {/* ── Chargen ── */}
          <section>
            <h3 style={{ ...SCHRIFT.abschnitt, margin: "0 0 8px" }}>
              Chargen (Bestand {a.bestand} {a.einheit})
            </h3>
            <Table
              rowKey="id"
              pagination={false}
              scroll={{ x: "max-content" }}
              dataSource={detail.chargen}
              aria-label="Chargen"
              columns={[
                {
                  title: "Verfall", dataIndex: "verfall",
                  render: (_: string, c) => (
                    <Plakette verfall={c.verfall} ampel={c.ampel} statusText={c.text} />
                  ),
                },
                { title: "Charge", dataIndex: "chargenNr",
                  render: (v: string) => <span className={s.fach}>{v}</span> },
                { title: "Rest", dataIndex: "rest", align: "right" as const,
                  render: (v: number) => <span style={SCHRIFT.mono}>{v}</span> },
                { title: "Status", dataIndex: "text",
                  render: (v: string, c) => <Chip ton={ampelTon(c.ampel)}>{v}</Chip> },
              ]}
            />
          </section>

          {/* ── Historie ── */}
          <section>
            <h3 style={{ ...SCHRIFT.abschnitt, margin: "0 0 8px" }}>Letzte Buchungen</h3>
            <Table
              rowKey="id"
              pagination={false}
              scroll={{ x: "max-content" }}
              dataSource={detail.historie}
              aria-label="Buchungshistorie des Artikels"
              columns={[
                { title: "Zeit", dataIndex: "ts",
                  render: (d: Date) => <span className={s.jts}>{d.toLocaleString("de-DE")}</span> },
                { title: "Vorgang", dataIndex: "typ",
                  render: (_: string, b) => journalZeile(b).typText
                    + (b.kommentar ? ` · ${b.kommentar}` : "") },
                {
                  title: "Δ", dataIndex: "menge", align: "right" as const,
                  render: (_: number, b) => {
                    const z = journalZeile(b);
                    return (
                      <span className={`${s.jdelta} ${z.zustand === "negativ" ? s.jminus : s.jplus}`}>
                        {z.mengeText}
                      </span>
                    );
                  },
                },
                { title: "Quelle", dataIndex: "quelleName",
                  render: (v: string) => <Chip ton="grau">{v}</Chip> },
              ]}
            />
          </section>

          {/* ── Gefahrenzone ── */}
          <div className={s.gefahr}>
            <div className={s.gtitle}>Gefahrenzone</div>
            <p style={SCHRIFT.text}>
              Artikel endgültig löschen. Das ist nur möglich, solange keine Buchung, Charge oder
              Soll-Position daran hängt — sonst biete ich stattdessen das Deaktivieren an.
            </p>
            <LoeschButton
              name={a.name}
              typLabel="Artikel"
              pruefen={async () => {
                const e = await pruefeLoeschbar("artikel", id);
                return e.ok ? e.wert : { loeschbar: false, grund: e.fehler, kannDeaktivieren: false };
              }}
              onLoeschen={async () => { await loescheElement("artikel", id); }}
              onDeaktivieren={async () => { await deaktiviereElement("artikel", id); }}
              onFertig={onSchliessen}
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}
```

- [ ] **Schritt 5: Grün, Rollen-Gegenprobe und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/ArtikelDrawer.test.tsx
rtk git add src/app/m/lagerbuch/_ui/monat.ts src/app/m/lagerbuch/_ui/ArtikelDrawer.tsx \
            src/app/m/lagerbuch/_ui/ArtikelDrawer.test.tsx
rtk git commit -m "feat(lagerbuch): _ui/ArtikelDrawer.tsx — sechs Belange, Falle 45 erhalten

Die lokalen Spiegel wandern mit: der Mindestbestand ist sofort sichtbar und
committet nach 400 ms. Er steht deshalb NICHT in einem Form.Item — das waere
eine dritte Zustandsquelle in einem Feld, dessen falscher Wert ein falscher
Bestellvorschlag ist. antd Form gibt es nur fuer die zwei Buchungsbloecke,
weil die einen Absendeknopf haben.

Beide Select showSearch setzen filterOption ausdruecklich (label + keywords):
ohne das tippt jemand ein Kennzeichen und findet nichts.

Der Verfallsmonat ist DatePicker picker=month format=YYYY-MM; monatAusPicker
ist die einzige Stelle, an der dayjs endet — die Action sieht nur einen
String. input[type=month] stirbt hier und lebt nur auf dem Helfer-Ast weiter.

Der Drawer-title IST der zugaengliche Name und damit der Ersatzanker fuer die
acht .drawer-Selektoren."
```

---

### Gate nach Welle 5

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build && pnpm exec playwright test
pnpm vitest run src/app/m/lagerbuch/_ui/ArtikelDrawer.test.tsx
```

⚠️ **Diese Stufe hat genau einen Task, und das ist kein Grund, das Gate zu sparen.** T127 ist der
teuerste Umbau des Plans — der `ArtikelDrawer` trägt Zugang, Entnahme, Chargenwahl und das
Monatsfeld in einem Bauteil. Es ist genau die Stelle, an der ein Gate den Fehler noch billig fängt,
bevor Welle 6 dreiundzwanzig Seiten darauf setzt.

## Welle 6 — Die 23 Arbeitsseiten (22 Tasks, alle parallel)

**Keine dieser 22 Tasks berührt eine Datei einer anderen.** Alle Bausteine stehen; jede Seite lädt
ihre Daten über einen Lesepfad aus Teil 3 und reicht **fertige Zeichenketten und Tonnamen** an ihre
Inseln durch.

**Sechs Regeln, die für alle 22 gelten und deshalb hier stehen:**

1. **`export const dynamic = "force-dynamic";`** in jeder `page.tsx`. Der Bestand hat es auf jeder
   Seite; ohne es liefert eine statisch vorgerenderte Seite nach einem `revalidatePath` weiterhin
   den alten Stand, bis ein zweiter Aufruf kommt.
2. **Die Spaltenreihenfolge ist ABGELESEN, nicht entschieden** (Festlegung H10, §6.12 Frage 7). Sie
   steht je Task im `columns`-Array ausgeschrieben.
3. **Jede `Table` trägt `aria-label`**, damit `getByRole("table", { name })` greift (§6.11, Regel 4).
4. **Die erste Spalte trägt einen echten `<Link>`/`<Button>`**; `onRow` ist die bequeme Zugabe
   (§6.4.1). Eine `onClick`-Zeile ohne Rolle und ohne Tabstop ist mit der Maus bedienbar und sonst
   nicht.
5. **Leerzustände tragen den gesetzten Filter im Text** (§6.12 Frage 6, §5.18) — „keine Treffer" und
   „keine Daten" sind verschiedene Aussagen.
6. **Jede Seite mit Regime-A-Filter reicht `Suchfeld` + `Trefferanzeige` mit** (T109) und filtert
   **vor** `dataSource` (§6.9.4 Punkt 1).

---

### Task 128: `/verwaltung` — die Übersicht, ohne eine einzige Insel

**Files:** Modify `verwaltung/(arbeit)/page.tsx` (ersetzt die Wegwerf-Seite aus T112).

**Interfaces:**
- Consumes: `_lib/lesepfade/bestand.ts` (Teil 3, T44) — `kennzahlen(db, now?)`;
  `_lib/lesepfade/artikel.ts` (T45) — `artikelListe`; `_lib/lesepfade/journal.ts` (T46) —
  `journalEintraege(db, { limit: 5 })`; `_lib/domain/vorschlag.ts` (T31) — `braucht`;
  `_lib/domain/verfall.ts` (T28) — `verfallStatus`, `verfallSchwellen`; `_lib/format.ts` (T39) —
  `chargeText`, `ampelTon`; `_lib/journalZeile.ts` (T42) — `journalZeile`; `_ui/Kachel.tsx`,
  `_ui/SeitenKopf.tsx`, `_ui/Chip.tsx`, `_ui/verwaltung.module.css`; `antd` — `Row`, `Col`, `Card`,
  `Table`, `Empty`.
- Produces: die Route `/verwaltung` (innerer Pfad `/m/lagerbuch/verwaltung`).

**Form: RSC, ohne eine einzige Insel.** Fünf Kennzahlen, die Liste der kritischen Artikel, die letzten
fünf Buchungen — alles ist Anzeige.

⚠️ **`Row`/`Col` und `Empty` stehen NICHT auf der kurzen RSC-sicheren Liste** (`Card`, `Statistic`,
`Result`, `Progress`, `Table`, `Tag`). `Row`/`Col` sind in dieser Suite in RSC **belegt**
(`m/portal/page.tsx`, `m/qr/page.tsx`, `m/feedback/(admin)/…/page.tsx`); `Empty` ist es **nicht**.
**Deshalb ist der Abruf dieser Seite der ERSTE Schritt von T151** — bricht `Empty` in der RSC-Ebene,
ändern sich alle 22 Seitentasks, und das soll man am ersten und nicht am letzten Tag wissen.

⚠️ **Sechs Kacheln sind Links, fünf sind es nicht.** Die zwei Chargen-Kacheln zeigen auf
`/verwaltung/verfall` (`page.tsx:41`, `:46`); die übrigen tragen keinen Weg und deshalb auch keinen
Hover.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, newId } from "../../_db/schema";
import { HANDLAGER_ID } from "../../_lib/konstanten";
import { kritischeArtikel } from "./page";

let t: TestDb;
beforeEach(() => { t = migrierteTestDb("lagerbuch-seite-uebersicht-"); });
afterEach(() => { t.schliessen(); });

/**
 * Die SEITE selbst wird nicht gerendert — sie ist eine Server Component mit
 * `getDb()`, und der Beweis, dass sie 200 liefert, ist ein Abruf (T151). Was
 * hier geprueft wird, ist die eine Auswahlregel, die die Seite trifft: welche
 * Artikel sind „kritisch"?
 */
function artikelMit(bestand: number, mindest: number, verfall?: string) {
  const a = newId();
  t.db.insert(artikel).values({ id: a, name: `A-${a.slice(0, 4)}`, einheit: "Stk", fach: "A1",
    mindestbestand: mindest, aktiv: true, createdAt: new Date() }).run();
  if (verfall) {
    const c = newId();
    t.db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "L1", verfall, createdAt: new Date() }).run();
    if (bestand > 0) {
      t.db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: a,
        chargeId: c, lagerortId: HANDLAGER_ID, menge: bestand, quelleTyp: "system",
        quelleId: "seed", kommentar: null }).run();
    }
  }
  return a;
}

describe("kritischeArtikel", () => {
  it("nimmt einen Artikel unter Mindestbestand auf", () => {
    const a = artikelMit(2, 10, "2099-12");
    expect(kritischeArtikel(t.db, new Date()).map((z) => z.id)).toContain(a);
  });

  it("nimmt einen Artikel mit auffaelliger Charge auf, auch wenn der Bestand reicht", () => {
    const a = artikelMit(50, 1, "2020-01");
    expect(kritischeArtikel(t.db, new Date()).map((z) => z.id)).toContain(a);
  });

  it("laeszt einen unauffaelligen Artikel weg", () => {
    artikelMit(50, 1, "2099-12");
    expect(kritischeArtikel(t.db, new Date())).toHaveLength(0);
  });

  it("liefert fertige Zeichenketten und Tonnamen, nie ein Date", () => {
    // Was an einer Uhr haengt, entsteht auf dem Server (§6.2.1, Regel 1).
    artikelMit(1, 10, "2020-01");
    const z = kritischeArtikel(t.db, new Date())[0];
    expect(typeof z.chargeText).toBe("string");
    expect(["rot", "gelb", "ok", "grau"]).toContain(z.chargeTon);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/page.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./page"`.

- [ ] **Schritt 3: Die Seite schreiben**

```tsx
// src/app/m/lagerbuch/verwaltung/(arbeit)/page.tsx
import { Card, Col, Empty, Row, Table } from "antd";
import Link from "next/link";
import { getDb, type DB } from "../../_db/client";
import { kennzahlen } from "../../_lib/lesepfade/bestand";
import { artikelListe } from "../../_lib/lesepfade/artikel";
import { journalEintraege } from "../../_lib/lesepfade/journal";
import { braucht } from "../../_lib/domain/vorschlag";
import { verfallSchwellen, verfallStatus } from "../../_lib/domain/verfall";
import { ampelTon, chargeText, type AmpelTon } from "../../_lib/format";
import { journalZeile } from "../../_lib/journalZeile";
import { SCHRIFT } from "../../_lib/schrift";
import { Chip } from "../../_ui/Chip";
import { Kachel } from "../../_ui/Kachel";
import { SeitenKopf } from "../../_ui/SeitenKopf";
import s from "../../_ui/verwaltung.module.css";

export const dynamic = "force-dynamic";

export type KritischeZeile = {
  id: string; name: string; fach: string; bestand: number; mindestbestand: number;
  unterMindest: boolean; chargeText: string | null; chargeTon: AmpelTon | null;
};

/**
 * DIE EINE AUSWAHLREGEL DIESER SEITE, exportiert damit sie pruefbar ist:
 * kritisch ist ein Artikel, wenn er unter Mindestbestand liegt ODER seine
 * naechste Charge auffaellig ist.
 *
 * ⚠️ Ampel und Text entstehen HIER, auf dem Server. Rechnete der Browser sie,
 * entschieden Server und Client an der Tagesgrenze verschieden — und gegen die
 * Zone des Endgeraets sogar systematisch (§6.2.1, Regel 1).
 */
export function kritischeArtikel(db: DB, jetzt: Date): KritischeZeile[] {
  const schwellen = verfallSchwellen();
  return artikelListe(db)
    .map((a) => {
      const unterMindest = braucht(a.bestand, a.mindestbestand);
      const status = a.naechsteCharge
        ? verfallStatus(a.naechsteCharge.verfall, schwellen, jetzt)
        : null;
      const auffaellig = status && status.ampel !== "gruen" ? status : null;
      return {
        id: a.id, name: a.name, fach: a.fach, bestand: a.bestand,
        mindestbestand: a.mindestbestand, unterMindest,
        chargeText: auffaellig && a.naechsteCharge
          ? chargeText(auffaellig, a.naechsteCharge.verfall) : null,
        chargeTon: auffaellig ? ampelTon(auffaellig.ampel) : null,
      };
    })
    .filter((a) => a.unterMindest || a.chargeText !== null);
}

/**
 * DIE UEBERSICHT — RSC, OHNE EINE EINZIGE INSEL.
 *
 * ⚠️ `Row`/`Col` und `Empty` stehen nicht auf der kurzen RSC-sicheren Liste
 * (`Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag`). `Row`/`Col`
 * sind in dieser Suite in RSC BELEGT (`m/portal/page.tsx`, `m/qr/page.tsx`,
 * `m/feedback/(admin)/…`); `Empty` ist es NICHT. Deshalb ist der Abruf DIESER
 * Seite der erste Schritt von T151 — braeche `Empty` in der RSC-Ebene,
 * aenderten sich alle 22 Seitentasks, und das soll man am ersten Tag wissen
 * und nicht am letzten.
 *
 * KEIN `Statistic` mit farbigem `valueStyle`: eine rote Zahl IST Rot auf einer
 * Datenflaeche. Die Kante traegt die Farbe, die Zahl traegt Tinte (§6.6.4).
 *
 * Sechs der 39 Kacheln des Moduls sind Links; hier sind es die zwei
 * Chargen-Kacheln (`page.tsx:41`, `:46`). Die uebrigen tragen keinen Weg und
 * deshalb auch keinen Hover.
 */
export default function VerwaltungUebersicht() {
  const db = getDb();
  const jetzt = new Date();
  const k = kennzahlen(db, jetzt);
  const kritisch = kritischeArtikel(db, jetzt);
  const journal = journalEintraege(db, { limit: 5 });

  return (
    <>
      <SeitenKopf
        titel="Übersicht"
        beschreibung={
          <span style={SCHRIFT.mono}>
            Stand {jetzt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} Uhr
          </span>
        }
      />

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={8}>
          <Kachel zahl={k.unterMindest} beschriftung="Artikel unter Mindestbestand"
                  ton={k.unterMindest ? "rot" : "ok"} />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={k.chargenKritisch} beschriftung="Chargen bald fällig / kritisch"
                  ton={k.chargenKritisch ? "gelb" : "ok"} href="/verwaltung/verfall" />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={k.chargenAbgelaufen} beschriftung="abgelaufen — aussondern nötig"
                  ton={k.chargenAbgelaufen ? "rot" : "ok"} href="/verwaltung/verfall" />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={k.offeneBestellungen} beschriftung="offene Bestellpositionen" />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={k.buchungenGesamt} beschriftung="Buchungen im Journal" />
        </Col>
      </Row>

      <Card title="Kritische Artikel" style={{ marginBlockEnd: 24 }}>
        {kritisch.length === 0 ? (
          <Empty description="Alles im grünen Bereich." />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {kritisch.map((a) => (
              <li key={a.id} style={{ display: "flex", alignItems: "center", gap: 10,
                                      padding: "10px 0", borderBlockEnd: "1px solid var(--lb-linie)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Ein echter Link, kein onClick-Div: sonst mit der Maus
                      bedienbar und sonst nicht (§6.4.1). */}
                  <Link href="/verwaltung/artikel" style={{ ...SCHRIFT.text, fontWeight: 600 }}>
                    {a.name}
                  </Link>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBlockStart: 4 }}>
                    <span className={s.fach}>{a.fach}</span>
                    {a.unterMindest ? (
                      <Chip ton="rot" zeichen="warnung">unter Mindestbestand</Chip>
                    ) : null}
                    {a.chargeText && a.chargeTon ? (
                      <Chip ton={a.chargeTon}>Charge {a.chargeText}</Chip>
                    ) : null}
                  </div>
                </div>
                <span style={SCHRIFT.zahl}>{a.bestand}</span>
                <span style={SCHRIFT.neben}>/ min. {a.mindestbestand}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Letzte Buchungen">
        {journal.zeilen.length === 0 ? (
          <Empty description="Noch keine Buchungen." />
        ) : (
          <Table
            rowKey="id"
            pagination={false}
            scroll={{ x: "max-content" }}
            aria-label="Letzte Buchungen"
            dataSource={journal.zeilen}
            columns={[
              { title: "Zeit", dataIndex: "ts",
                render: (d: Date) => (
                  <span className={s.jts}>
                    {d.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
                  </span>
                ) },
              { title: "Artikel", dataIndex: "artikelName" },
              { title: "Vorgang", dataIndex: "typ",
                render: (_: string, b) => journalZeile(b).typText
                  + (b.kommentar ? ` · ${b.kommentar}` : "") },
              { title: "Δ", dataIndex: "menge", align: "right" as const,
                render: (_: number, b) => {
                  const z = journalZeile(b);
                  return (
                    <span className={`${s.jdelta} ${z.zustand === "negativ" ? s.jminus : s.jplus}`}>
                      {z.mengeText}
                    </span>
                  );
                } },
            ]}
          />
        )}
      </Card>
    </>
  );
}
```

- [ ] **Schritt 4: Abrufen — und zwar SOFORT (die `Empty`-Frage)**

```bash
pnpm dev & sleep 8
curl -s -b "$(pnpm exec tsx scripts/devlogin-cookie.ts lagerbuch_nutzer)" \
  -o /dev/null -w "%{http_code}\n" -H "Host: lagerbuch.localtest.me" http://localhost:3000/verwaltung
kill %1
```

Erwartet: **200**. ⚠️ **Bei 500 ändern sich alle 22 Seitentasks:** dann steht `Empty` nicht in der
RSC-Ebene zur Verfügung und wird durch eigenes Markup ersetzt (`<p style={SCHRIFT.neben}>`). Der
Befund gehört dann in T151 als benannte Abweichung — **nicht** als stille Anpassung einzelner Seiten.

- [ ] **Schritt 5: Grün und Commit**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/page.test.tsx"
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/page.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/page.test.tsx"
rtk git commit -m "feat(lagerbuch): /verwaltung — Uebersicht als reine Server Component

Fuenf Kennzahlen als Card mit farbiger Kante, nicht als Statistic mit farbigem
valueStyle: eine rote Zahl IST Rot auf einer Datenflaeche. Zwei der Kacheln
sind Links (Chargen -> /verwaltung/verfall) und tragen Chevron und Hover; die
uebrigen tragen keinen Weg und deshalb auch keinen Hover.

kritischeArtikel ist exportiert und geprueft: Ampel und Text entstehen auf dem
SERVER, sonst entscheiden Server und Client an der Tagesgrenze verschieden.

Der Abruf dieser Seite ist die Probe auf Row/Col/Empty in der RSC-Ebene —
Row/Col sind in der Suite belegt, Empty nicht. Braeche es, aenderten sich alle
22 Seitentasks; deshalb steht die Probe hier und nicht am Ende."
```

---

### Task 129: `/verwaltung/artikel` — der Hauptarbeitsweg

**Files:** Create `verwaltung/(arbeit)/artikel/page.tsx`, `.../ArtikelTable.tsx`,
`.../NeuArtikel.tsx`; Test `.../ArtikelTable.test.tsx`.

**Interfaces:**
- Consumes: `_lib/lesepfade/artikel.ts` (T45) — `artikelListe`; `_lib/lesepfade/fahrzeuge.ts` (T48)
  — `fahrzeugListe`; `_lib/artikelFilter.ts` (T41) — `artikelFiltern`, `LEERER_FILTER`,
  `type ArtikelFilterZustand`; `_lib/format.ts` — `ampelTon`, `chargeText`; `_lib/mengen.ts` (T104);
  `_ui/ArtikelDrawer.tsx` (T127), `_ui/Chip.tsx`, `_ui/Plakette.tsx`, `_ui/Suchfeld.tsx`,
  `_ui/Trefferanzeige.tsx`, `_ui/SeitenKopf.tsx`; `_actions/artikel.ts` — `createArtikel`.
  ⚠️ **`_lib/bestandExport.ts` (`bestandExportZeilen`, `bestandExportDateiname`) gehört TEIL 6**
  (§9.4). Bis dahin ist der Excel-Knopf `disabled` mit dem Titel „Excel-Liste — kommt mit den
  Ausgabeformaten"; **T-Teil-6 löst ihn ein.** Das ist der **einzige** benannte Vorgriff dieses
  Plans und steht in der Abschlusstabelle.
- Produces: `/verwaltung/artikel`.

**Die Spalten, abgelesen aus `ArtikelTable.tsx:203-210`** (H10, §6.12 Frage 7):

| # | Titel | Feld | Anmerkung |
|---|---|---|---|
| 1 | Artikel | `name` | **echter `<Button type="link">`**, öffnet den Drawer — Ersatzanker für `tr.click` |
| 2 | Fach | `fach` | `<span className={s.fach}>` |
| 3 | Bestand | `bestand` | rechtsbündig, `tabular-nums`, Einheit als Nebentext |
| 4 | Min. | `mindestbestand` | rechtsbündig, `SCHRIFT.mono` |
| 5 | Nächster Verfall | `naechsteCharge` | `Plakette` + Chargennummer, sonst Chip „leer" |
| 6 | Status | — | `Chip`-Gruppe (inaktiv / ok / unter Mindestbestand / Charge) |

**Sechs Sortierungen mit Name als Zweitkriterium** (`ArtikelTable.tsx:30-36`, `:41`): `name-asc`,
`name-desc`, `fach`, `bestand-asc`, `bestand-desc`, `verfall`. ⚠️ **Die Sortierung bleibt eine eigene
`Select`-Auswahl über der Tabelle; die Spaltenköpfe tragen KEINE `sorter`** (§6.9.4 Punkt 3): antds
`sorter` je Spalte ergäbe fünf unabhängige Sortierungen **ohne stabiles Zweitkriterium**, und ohne das
wandern gleichrangige Zeilen bei jedem Klick.

**Suchfeldmenge (1 von 6):** Name · Fach · Chargennummer der nächsten Charge
(`ArtikelTable.tsx:112-122`). **Filter:** unter Mindestbestand · Charge kritisch · inaktive
ausblenden — drei **einzelne** `Checkbox` (nicht ausschließend, §6.4.4).

⚠️ **§6.9.5, zweitens — der Export liest DIESELBE abgeleitete Liste.** `gefiltert` entsteht **einmal**
und geht sowohl in `dataSource` als auch (später) in den Export. Wandern Filtern und Sortieren in
antds `Table`-eigenen Zustand, exportiert der Knopf **still wieder alles** — und eine Datei mit mehr
Zeilen sieht nicht kaputt aus.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben** — `ArtikelTable.test.tsx`

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, fill, click, query, queryAll, exists }
  from "@/app/m/qr/_lib/test-dom";
import { ArtikelTable, SORTIERUNGEN, sucheTrifft } from "./ArtikelTable";
import s from "../../../_ui/verwaltung.module.css";

vi.mock("../../../_actions/artikel", () => ({ createArtikel: async () => ({ ok: true, wert: { id: "x" } }) }));
vi.mock("../../../_ui/ArtikelDrawer", () => ({ ArtikelDrawer: () => <div data-rolle="drawer" /> }));

const ZEILEN = [
  { id: "a1", name: "Kompressen", einheit: "Stk", fach: "A1", mindestbestand: 20, bestand: 7,
    aktiv: true, unterMindest: true, chargeKritisch: false,
    naechsteCharge: { chargenNr: "L42", verfall: "2027-03" }, naechsteAmpel: "gelb" as const,
    naechsteAblaufText: "läuft 03/27 ab" },
  { id: "a2", name: "Mull", einheit: "Rol", fach: "B2", mindestbestand: 5, bestand: 40,
    aktiv: true, unterMindest: false, chargeKritisch: false,
    naechsteCharge: null, naechsteAmpel: null, naechsteAblaufText: null },
];
afterEach(async () => { await unmount(); });

describe("ArtikelTable: Spalten und Anker", () => {
  it("traegt die sechs abgelesenen Spalten in dieser Reihenfolge", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={[]} />);
    expect(queryAll("thead th").map((th) => th.textContent)).toEqual(
      ["Artikel", "Fach", "Bestand", "Min.", "Nächster Verfall", "Status"]);
  });

  it("die erste Spalte ist ein echter Knopf — Ersatzanker fuer tr.click", async () => {
    // Eine onClick-Zeile ohne Rolle und ohne Tabstop ist mit der Maus
    // bedienbar und sonst nicht (§6.4.1).
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={[]} />);
    const knopf = query("tbody tr button");
    expect(knopf.textContent).toBe("Kompressen");
    await click("tbody tr button");
    expect(exists("[data-rolle='drawer']")).toBe(true);
  });

  it("die Tabelle traegt ein aria-label und keine Pagination", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={[]} />);
    expect(query("table").closest("[aria-label]")?.getAttribute("aria-label"))
      .toBe("Artikel und Bestand");
    expect(exists(".ant-pagination")).toBe(false);
  });

  it("die Spaltenkoepfe tragen KEINE sorter", () => {
    // Antds sorter je Spalte ergaebe fuenf unabhaengige Sortierungen ohne
    // stabiles Zweitkriterium — gleichrangige Zeilen wanderten bei jedem Klick.
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/ArtikelTable.tsx", "utf8");
    expect(quelle).not.toMatch(/\bsorter\b/);
  });
});

describe("ArtikelTable: die Suchfeldmenge (1 von 6)", () => {
  it("sucht ueber Name, Fach UND Chargennummer der naechsten Charge", () => {
    expect(sucheTrifft(ZEILEN[0], "kompress")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "a1")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "L42")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "RTW")).toBe(false);
  });

  it("faltet unicode-fest (PÄCKCHEN findet Päckchen)", () => {
    // `_lib/suche.ts#falte` ist die eine Faltung fuer beide Haelften (Teil 1).
    expect(sucheTrifft({ ...ZEILEN[1], name: "Päckchen" }, "PÄCKCHEN")).toBe(true);
  });
});

describe("ArtikelTable: Trefferanzeige und Filter", () => {
  it("zeigt „X von Y\" nur, wenn der Filter etwas ausblendet", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={[]} />);
    expect(exists(`.${s.filtertreffer}`)).toBe(false);
    await fill("input[type='search']", "Mull");
    expect(query(`.${s.filtertreffer}`).textContent).toBe("1 von 2");
  });

  it("die drei Filter sind EINZELNE Checkboxen, keine Radio-Gruppe", async () => {
    // Sie sind nicht gegenseitig ausschlieszend; ein Segmented oder eine
    // Radio.Group behauptete das Gegenteil (§6.4.4).
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={[]} />);
    expect(queryAll(".ant-checkbox-input")).toHaveLength(3);
    expect(exists(".ant-radio-group")).toBe(false);
    expect(exists(".ant-segmented")).toBe(false);
  });

  it("fuehrt genau sechs Sortierungen, jede mit Name als Zweitkriterium", () => {
    expect(SORTIERUNGEN.map((o) => o.wert)).toEqual(
      ["name-asc", "name-desc", "fach", "bestand-asc", "bestand-desc", "verfall"]);
  });

  it("die abgeleitete Liste entsteht EINMAL und traegt Tabelle und Export", () => {
    // §6.9.5, zweitens: wandern Filtern und Sortieren in antds Table-Zustand,
    // exportiert der Knopf still wieder alles.
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/ArtikelTable.tsx", "utf8");
    expect([...quelle.matchAll(/const gefiltert = useMemo/g)]).toHaveLength(1);
    expect(quelle).toMatch(/dataSource=\{gefiltert\}/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/ArtikelTable.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./ArtikelTable"`.

- [ ] **Schritt 3: `NeuArtikel.tsx` schreiben**

```tsx
"use client";
import { useState, useTransition } from "react";
import { Button, Form, Input, InputNumber, Modal } from "antd";
import { createArtikel } from "../../../_actions/artikel";
import { Ikone } from "../../../_ui/ikonen";

/** MIT `antd Form` — es gibt einen Absendeknopf (§6.4.7). */
export function NeuArtikel() {
  const [offen, setOffen] = useState(false);
  const [form] = Form.useForm();
  const [laeuft, start] = useTransition();
  return (
    <>
      <Button type="primary" icon={<Ikone name="plus" groesse={16} />} onClick={() => setOffen(true)}>
        Neuer Artikel
      </Button>
      {/* `title` ist der zugaengliche Name — Ersatzanker fuer `.sheettitle`. */}
      <Modal open={offen} title="Neuer Artikel" onCancel={() => setOffen(false)}
             footer={null} destroyOnHidden>
        <Form form={form} layout="vertical" disabled={laeuft}
          onFinish={(w) => start(async () => {
            const erg = await createArtikel(w);
            if (erg.ok) { setOffen(false); form.resetFields(); }
            // Fehler kommen AM FELD an (§11.2 (d)), nie ueber e.message.
            else form.setFields(Object.entries(erg.feldFehler ?? {})
              .map(([name, errors]) => ({ name, errors: [errors] })));
          })}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name angeben" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="fach" label="Fach" rules={[{ required: true, message: "Fach angeben" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="einheit" label="Einheit" rules={[{ required: true, message: "Einheit angeben" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="mindestbestand" label="Mindestbestand" initialValue={0}>
            <InputNumber min={0} max={99999} style={{ width: "100%" }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={laeuft}>Anlegen</Button>
        </Form>
      </Modal>
    </>
  );
}
```

- [ ] **Schritt 4: `ArtikelTable.tsx` schreiben**

```tsx
"use client";
import { useMemo, useState } from "react";
import { Button, Checkbox, Flex, Select, Table, Tooltip } from "antd";
import { artikelFiltern, LEERER_FILTER, type ArtikelFilterZustand } from "../../../_lib/artikelFilter";
import { falte } from "../../../_lib/suche";
import { ampelTon } from "../../../_lib/format";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Plakette } from "../../../_ui/Plakette";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import { ArtikelDrawer } from "../../../_ui/ArtikelDrawer";
import { NeuArtikel } from "./NeuArtikel";
import { Ikone } from "../../../_ui/ikonen";
import s from "../../../_ui/verwaltung.module.css";
import type { ArtikelZeile } from "../../../_lib/lesepfade/artikel";

/**
 * SECHS SORTIERUNGEN, ZWEITKRITERIUM IMMER DER NAME (`ArtikelTable.tsx:30-41`).
 *
 * ⚠️ SIE BLEIBEN EINE EIGENE AUSWAHL UEBER DER TABELLE; die Spaltenkoepfe
 * tragen KEINE `sorter` (§6.9.4, Punkt 3). Antds `sorter` je Spalte ergaebe
 * fuenf UNABHAENGIGE Sortierungen ohne stabiles Zweitkriterium — und ohne das
 * wandern gleichrangige Zeilen bei jedem Klick.
 */
export const SORTIERUNGEN = [
  { wert: "name-asc", label: "Name A–Z" },
  { wert: "name-desc", label: "Name Z–A" },
  { wert: "fach", label: "Fach" },
  { wert: "bestand-asc", label: "Bestand aufsteigend" },
  { wert: "bestand-desc", label: "Bestand absteigend" },
  { wert: "verfall", label: "Nächster Verfall" },
] as const;
export type SortKey = (typeof SORTIERUNGEN)[number]["wert"];

/**
 * DIE SUCHFELDMENGE DIESER LISTE (1 von 6, §6.9.4): Name · Fach ·
 * Chargennummer der naechsten Charge. Die sechs Mengen sind KEIN Zufall,
 * sondern Bedienpraxis — und sechs einzeln zu portierende Zusicherungen.
 * `falte` ist die eine Faltung des Moduls (Teil 1, T5) und wird NICHT durch
 * antds Vorgabevergleich ersetzt.
 */
export function sucheTrifft(z: ArtikelZeile, begriff: string): boolean {
  const q = falte(begriff.trim());
  if (!q) return true;
  return falte(`${z.name} ${z.fach} ${z.naechsteCharge?.chargenNr ?? ""}`).includes(q);
}

function vergleiche(sort: SortKey): (a: ArtikelZeile, b: ArtikelZeile) => number {
  const nachName = (a: ArtikelZeile, b: ArtikelZeile) => a.name.localeCompare(b.name, "de");
  switch (sort) {
    case "name-desc": return (a, b) => b.name.localeCompare(a.name, "de");
    case "fach": return (a, b) => a.fach.localeCompare(b.fach, "de") || nachName(a, b);
    case "bestand-asc": return (a, b) => a.bestand - b.bestand || nachName(a, b);
    case "bestand-desc": return (a, b) => b.bestand - a.bestand || nachName(a, b);
    case "verfall": return (a, b) => {
      // Artikel ohne Charge ans Ende, sonst fruehester Verfall zuerst.
      const av = a.naechsteCharge?.verfall ?? "";
      const bv = b.naechsteCharge?.verfall ?? "";
      if (!av && !bv) return nachName(a, b);
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv) || nachName(a, b);
    };
    default: return nachName;
  }
}

export function ArtikelTable({
  zeilen, fahrzeuge,
}: {
  zeilen: ArtikelZeile[];
  fahrzeuge: { id: string; name: string; kennung: string | null }[];
}) {
  const [suche, setSuche] = useState("");
  const [filter, setFilter] = useState<ArtikelFilterZustand>(LEERER_FILTER);
  const [sort, setSort] = useState<SortKey>("name-asc");
  const [offenerArtikel, setOffenerArtikel] = useState<string | null>(null);

  /**
   * ⚠️ GENAU EINE ABGELEITETE LISTE (§6.9.5, zweitens). Sie geht in
   * `dataSource` UND in den Excel-Export. Wandern Filtern und Sortieren in
   * antds `Table`-eigenen Zustand, liest der Export eine andere Liste und
   * exportiert STILL WIEDER ALLES — eine Datei mit mehr Zeilen sieht nicht
   * kaputt aus, und niemand zaehlt sie nach.
   */
  const gefiltert = useMemo(
    () => artikelFiltern(zeilen, filter).filter((z) => sucheTrifft(z, suche)).sort(vergleiche(sort)),
    [zeilen, filter, suche, sort],
  );

  return (
    <>
      <Flex gap={12} wrap align="center" style={{ marginBlockEnd: 12 }}>
        <Suchfeld wert={suche} onWert={setSuche} platzhalter="Artikel oder Fach suchen…" />
        {/* Drei EINZELNE Checkboxen: sie sind nicht gegenseitig ausschlieszend
            (§6.4.4). Ein Segmented behauptete das Gegenteil. */}
        <Checkbox checked={filter.unterMindest}
          onChange={(e) => setFilter({ ...filter, unterMindest: e.target.checked })}>
          unter Mindestbestand
        </Checkbox>
        <Checkbox checked={filter.chargeKritisch}
          onChange={(e) => setFilter({ ...filter, chargeKritisch: e.target.checked })}>
          Charge kritisch
        </Checkbox>
        <Checkbox checked={filter.ohneInaktive}
          onChange={(e) => setFilter({ ...filter, ohneInaktive: e.target.checked })}>
          inaktive ausblenden
        </Checkbox>
        <Select
          value={sort}
          onChange={setSort}
          options={SORTIERUNGEN.map((o) => ({ value: o.wert, label: o.label }))}
          aria-label="Sortierung"
          style={{ minWidth: 200 }}
        />
        <Trefferanzeige gezeigt={gefiltert.length} gesamt={zeilen.length} />
        {/* ⚠️ `bestandExportZeilen` gehoert TEIL 6 (§9.4). Bis dahin ist der
            Knopf gesperrt und sagt es — ein Knopf, der nichts tut, ist
            schlimmer als ein Knopf, der erklaert, warum. */}
        <Tooltip title="Excel-Liste — kommt mit den Ausgabeformaten (Teil 6, §9.4)">
          <Button icon={<Ikone name="tabelle" groesse={16} />} disabled>Excel-Liste</Button>
        </Tooltip>
        <NeuArtikel />
      </Flex>

      <Table
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Artikel und Bestand"
        dataSource={gefiltert}
        locale={{ emptyText: suche || filter !== LEERER_FILTER
          ? "Kein Artikel passt zu Suche und Filter."
          : "Noch keine Artikel. Lege oben den ersten an." }}
        onRow={(z) => ({ onClick: () => setOffenerArtikel(z.id) })}
        columns={[
          {
            title: "Artikel", dataIndex: "name",
            // Der echte Knopf ist der Anker; die Zeilen-onClick ist die Zugabe.
            render: (v: string, z) => (
              <Button type="link" style={{ padding: 0, fontWeight: 600 }}
                      onClick={() => setOffenerArtikel(z.id)}>{v}</Button>
            ),
          },
          { title: "Fach", dataIndex: "fach",
            render: (v: string) => <span className={s.fach}>{v}</span> },
          { title: "Bestand", dataIndex: "bestand", align: "right" as const,
            render: (v: number, z) => (
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {v} <span style={SCHRIFT.neben}>{z.einheit}</span>
              </span>
            ) },
          { title: "Min.", dataIndex: "mindestbestand", align: "right" as const,
            render: (v: number) => <span style={SCHRIFT.mono}>{v}</span> },
          {
            title: "Nächster Verfall", dataIndex: "naechsteCharge",
            render: (_: unknown, z) => z.naechsteCharge && z.naechsteAmpel ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Plakette verfall={z.naechsteCharge.verfall} ampel={z.naechsteAmpel}
                          statusText={z.naechsteAblaufText ?? ""} />
                <span style={SCHRIFT.mono}>{z.naechsteCharge.chargenNr}</span>
              </span>
            ) : <Chip ton="grau">leer</Chip>,
          },
          {
            title: "Status", dataIndex: "aktiv",
            render: (_: boolean, z) => (
              <Flex gap={6} wrap>
                {!z.aktiv ? <Chip ton="grau">inaktiv</Chip> : null}
                {z.aktiv && !z.unterMindest && !z.naechsteAblaufText
                  ? <Chip ton="ok">ok</Chip> : null}
                {z.unterMindest
                  ? <Chip ton="rot" zeichen="warnung">unter Mindestbestand</Chip> : null}
                {z.naechsteAblaufText && z.naechsteAmpel
                  ? <Chip ton={ampelTon(z.naechsteAmpel)}>Charge {z.naechsteAblaufText}</Chip> : null}
              </Flex>
            ),
          },
        ]}
      />

      {offenerArtikel ? (
        <ArtikelDrawer key={offenerArtikel} id={offenerArtikel} fahrzeuge={fahrzeuge}
                       onSchliessen={() => setOffenerArtikel(null)} />
      ) : null}
    </>
  );
}
```

- [ ] **Schritt 5: `page.tsx` schreiben**

```tsx
// src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/page.tsx
import { getDb } from "../../../_db/client";
import { artikelListe } from "../../../_lib/lesepfade/artikel";
import { fahrzeugListe } from "../../../_lib/lesepfade/fahrzeuge";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { ArtikelTable } from "./ArtikelTable";

export const dynamic = "force-dynamic";

/**
 * SIE LAEDT UND RECHNET, DIE INSEL BEDIENT. Der Client bekommt fertige
 * Zeichenketten und Tonnamen — `artikelListe` (Teil 3, T45) rechnet
 * `unterMindest`, `chargeKritisch`, Ampel und Text bereits serverseitig vor.
 * Eine Client-Insel darf keine Ampel rechnen: sie hat die Zeitzone des
 * Endgeraets, nicht die des Moduls.
 *
 * `fahrzeugListe` wird HIER geladen und als Prop durchgereicht — der
 * `ArtikelDrawer` braucht sie fuer die Zielauswahl der Umlagerung, und ein
 * zweiter Lesepfad in der Insel waere eine zweite Wahrheit ueber „welche
 * Fahrzeuge sind aktiv".
 */
export default function ArtikelSeite() {
  const db = getDb();
  return (
    <>
      <SeitenKopf
        titel="Artikel & Bestand"
        beschreibung="Handlager · Klick auf eine Zeile öffnet Chargen, Buchung und Stammdaten."
      />
      <ArtikelTable
        zeilen={artikelListe(db, { inklInaktiv: true })}
        fahrzeuge={fahrzeugListe(db).filter((f) => f.aktiv)}
      />
    </>
  );
}
```

- [ ] **Schritt 6: Grün, Abruf, Commit**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/ArtikelTable.test.tsx"
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/"
rtk git commit -m "feat(lagerbuch): /verwaltung/artikel — Tabelle, Drawer, Anlegen

Sechs Spalten in der abgelesenen Reihenfolge (ArtikelTable.tsx:203-210); der
Umbau auf Table ist ein Traegerwechsel, keine Gelegenheit zum Aufraeumen.

Die sechs Sortierungen bleiben eine eigene Select-Auswahl ueber der Tabelle;
die Spaltenkoepfe tragen KEINE sorter — antds sorter ergaebe fuenf
unabhaengige Sortierungen ohne stabiles Zweitkriterium, und gleichrangige
Zeilen wanderten bei jedem Klick.

Suchfeldmenge 1 von 6: Name, Fach, Chargennummer der naechsten Charge, ueber
_lib/suche.ts#falte statt antds Vorgabevergleich.

GENAU EINE abgeleitete Liste fuer Tabelle und Export: wanderten Filtern und
Sortieren in antds Table-Zustand, exportierte der Knopf still wieder alles.

Der Excel-Knopf ist bis Teil 6 (§9.4) gesperrt und sagt warum — der einzige
benannte Vorgriff dieses Plans."
```

---

### Task 130: `/verwaltung/verfall` — die Liste, die keine Tabelle wird

**Files:** Create `verwaltung/(arbeit)/verfall/page.tsx`, `.../VerfallItem.tsx`,
`.../AussondernRow.tsx`; Test `.../AussondernRow.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/verfall.ts` (T47) — `verfallListe`, `lagerortVerfallListe`;
`_actions/aussondern.ts` (T115); `_ui/Plakette.tsx`, `_ui/Chip.tsx`, `_ui/SeitenKopf.tsx`; `antd` —
`Card`, `Popconfirm`, `Button`, `Empty`. Produces `/verwaltung/verfall`.

⚠️ **Diese Liste bleibt eine KARTEN-Liste, keine `Table`** (§6.4.2): jede Zeile trägt Plakette +
Chargentext + Aktion und ist damit **verschieden gebaut**; eine Tabelle verstümmelte sie.
**`List.Item` ist verboten** (Falle 1), und `List` mit `renderItem` in einer Server Component ist
**ungemessen** — das eigene `<ul>/<li>` kostet nichts und ist sicher. **Ersatzanker für `.row`
(3 Vorkommen): `getByRole("listitem")`.**

⚠️ **`Popconfirm` statt `Modal`** (§6.4.5, Fall 1): Aussondern **verliert nichts** — es schreibt eine
Journalzeile. Am Verfallsregal werden mehrere Chargen nacheinander ausgesondert; ein modaler Dialog
mit Namenseingabe je Charge machte aus einem Durchgang eine Prozedur.

⚠️ **Zwei getrennte Quellen bleiben getrennt** (Teil 3, T47): Handlager-Chargen (`verfallListe`) und
**gemeldete** Fahrzeug-Verfälle (`lagerortVerfallListe`). Sie in eine Liste zu mischen behauptete, ein
gemeldeter Fahrzeugverfall ließe sich aussondern — er lässt sich nur **neu melden**.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben** — `AussondernRow.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, unmount, click, clickPortal, query, exists } from "@/app/m/qr/_lib/test-dom";
import { AussondernRow } from "./AussondernRow";

const aussondern = vi.fn(async () => ({ ok: true as const }));
vi.mock("../../../_actions/aussondern", () => ({ aussondern: (...a: unknown[]) => aussondern(...(a as [])) }));
afterEach(async () => { aussondern.mockClear(); await unmount(); });

describe("AussondernRow", () => {
  it("fragt vor dem Aussondern per Popconfirm, nicht per Modal", async () => {
    // §6.4.5, Fall 1: Aussondern verliert nichts (Journalzeile), und am
    // Verfallsregal werden mehrere Chargen nacheinander ausgesondert.
    await mount(<AussondernRow chargeId="c1" bezeichnung="L42 · Kompressen" />);
    await click("button");
    expect(exists(".ant-popconfirm")).toBe(true);
    expect(exists(".ant-modal")).toBe(false);
    expect(aussondern).not.toHaveBeenCalled();
  });

  it("bucht mit einem Kommentar, der die Charge nennt", async () => {
    await mount(<AussondernRow chargeId="c1" bezeichnung="L42 · Kompressen" />);
    await click("button");
    await clickPortal(".ant-popconfirm .ant-btn-primary");
    expect(aussondern).toHaveBeenCalledWith(
      expect.objectContaining({ chargeId: "c1", kommentar: expect.stringContaining("L42") }));
  });

  it("der Knopf traegt ein aria-label mit der Charge", async () => {
    await mount(<AussondernRow chargeId="c1" bezeichnung="L42 · Kompressen" />);
    expect(query("button").getAttribute("aria-label")).toBe("L42 · Kompressen aussondern");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/verfall/AussondernRow.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./AussondernRow"`.

- [ ] **Schritt 3: Die drei Dateien schreiben**

```tsx
// AussondernRow.tsx
"use client";
import { useState, useTransition } from "react";
import { Button, Popconfirm } from "antd";
import { aussondern } from "../../../_actions/aussondern";
import { Ikone } from "../../../_ui/ikonen";

/**
 * `Popconfirm` UND NICHT `Modal` — obwohl Aussondern nach §4.4 NICHT
 * ruecknehmbar ist (§6.4.5, Fall 1). Das Kriterium ist der DATENVERLUST, nicht
 * die Ruecknehmbarkeit: Aussondern schreibt eine Zeile in ein append-only
 * Journal, der Vorgang bleibt vollstaendig nachlesbar, und das Rueckgaengig-
 * machen ist eine Gegenbuchung, kein Wiederherstellen. Dazu der Arbeitsablauf:
 * am Verfallsregal werden mehrere Chargen nacheinander ausgesondert.
 */
export function AussondernRow({ chargeId, bezeichnung }: { chargeId: string; bezeichnung: string }) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  return (
    <>
      <Popconfirm
        title="Charge aussondern?"
        description={`Bucht den Handlager-Rest von ${bezeichnung} als Korrektur aus.`}
        okText="Aussondern"
        cancelText="Abbrechen"
        onConfirm={() => start(async () => {
          const erg = await aussondern({
            chargeId,
            kommentar: `Verfallskontrolle — ${bezeichnung} ausgesondert`,
          });
          setFehler(erg.ok ? null : erg.fehler);
        })}
      >
        <Button size="small" danger loading={laeuft}
                icon={<Ikone name="kreuz" groesse={14} />}
                aria-label={`${bezeichnung} aussondern`}>
          aussondern
        </Button>
      </Popconfirm>
      {fehler ? <span style={{ marginInlineStart: 8 }}>{fehler}</span> : null}
    </>
  );
}
```

```tsx
// VerfallItem.tsx — RSC, kein "use client".
import { Plakette } from "../../../_ui/Plakette";
import { Chip } from "../../../_ui/Chip";
import { SCHRIFT } from "../../../_lib/schrift";
import { ampelTon } from "../../../_lib/format";
import type { Ampel } from "../../../_lib/domain/verfall";
import s from "../../../_ui/verwaltung.module.css";

/** Eine Zeile der Verfallsliste. RSC — sie bedient nichts, sie zeigt. */
export function VerfallItem({
  artikelName, chargenNr, verfall, ampel, text, rest, einheit, aktion,
}: {
  artikelName: string; chargenNr: string; verfall: string; ampel: Ampel;
  text: string; rest: number; einheit: string; aktion?: React.ReactNode;
}) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
                 borderBlockEnd: "1px solid var(--lb-linie)" }}>
      <Plakette verfall={verfall} ampel={ampel} statusText={text} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...SCHRIFT.text, fontWeight: 600 }}>{artikelName}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBlockStart: 4 }}>
          <span className={s.fach}>{chargenNr}</span>
          <Chip ton={ampelTon(ampel)}>{text}</Chip>
          <span style={SCHRIFT.neben}>Rest {rest} {einheit}</span>
        </div>
      </div>
      {aktion}
    </li>
  );
}
```

```tsx
// page.tsx
import { Card, Empty } from "antd";
import { getDb } from "../../../_db/client";
import { lagerortVerfallListe, verfallListe } from "../../../_lib/lesepfade/verfall";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { VerfallItem } from "./VerfallItem";
import { AussondernRow } from "./AussondernRow";
import { Chip } from "../../../_ui/Chip";
import { ampelTon } from "../../../_lib/format";
import { SCHRIFT } from "../../../_lib/schrift";
import s from "../../../_ui/verwaltung.module.css";

export const dynamic = "force-dynamic";

/**
 * ⚠️ DIESE LISTE WIRD KEINE `Table` (§6.4.2). Ihre Zeilen sind VERSCHIEDEN
 * gebaut — Plakette, Chargentext, optionale Aktion —, und eine Tabelle
 * verstuemmelte sie. `List.Item` ist verboten (Falle 1), `List` mit
 * `renderItem` in einer Server Component ist UNGEMESSEN; das eigene
 * `<ul>/<li>` kostet nichts und ist sicher. Ersatzanker fuer `.row`
 * (3 Vorkommen): `getByRole("listitem")`.
 *
 * ⚠️ ZWEI QUELLEN, GETRENNT (Teil 3, T47): Handlager-Chargen und GEMELDETE
 * Fahrzeug-Verfaelle. Sie in eine Liste zu mischen behauptete, ein gemeldeter
 * Fahrzeugverfall liesze sich aussondern — er laeszt sich nur NEU MELDEN, auf
 * dem Fahrzeugblatt oder im Check.
 */
export default function VerfallSeite() {
  const db = getDb();
  const jetzt = new Date();
  const chargen = verfallListe(db, jetzt);
  const gemeldet = lagerortVerfallListe(db, jetzt);

  return (
    <>
      <SeitenKopf
        titel="Verfall"
        beschreibung="Chargen im Handlager nach Verfallsampel — und die im Fahrzeug gemeldeten Angaben."
      />

      <Card title="Chargen im Handlager" style={{ marginBlockEnd: 24 }}>
        {chargen.length === 0 ? (
          <Empty description="Keine auffällige Charge im Handlager." />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {chargen.map((c) => (
              <VerfallItem
                key={c.chargeId}
                artikelName={c.artikelName}
                chargenNr={c.chargenNr}
                verfall={c.verfall}
                ampel={c.ampel}
                text={c.text}
                rest={c.rest}
                einheit={c.einheit}
                aktion={c.abgelaufen ? (
                  <AussondernRow chargeId={c.chargeId}
                                 bezeichnung={`${c.chargenNr} · ${c.artikelName}`} />
                ) : undefined}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Im Fahrzeug gemeldet">
        {gemeldet.length === 0 ? (
          <Empty description="Keine auffällige Verfallsmeldung aus einem Fahrzeug." />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {gemeldet.map((g) => (
              <li key={`${g.lagerortId}:${g.artikelId}`}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
                           borderBlockEnd: "1px solid var(--lb-linie)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...SCHRIFT.text, fontWeight: 600 }}>{g.artikelName}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBlockStart: 4 }}>
                    <span className={s.fach}>{g.lagerortName}</span>
                    <Chip ton={ampelTon(g.ampel)}>{g.text}</Chip>
                    <span style={SCHRIFT.neben}>
                      gemeldet {g.erfasstAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
```

- [ ] **Schritt 4: Grün und Commit**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/verfall/AussondernRow.test.tsx"
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/verfall/"
rtk git commit -m "feat(lagerbuch): /verwaltung/verfall — Kartenliste, kein Table

Die Zeilen sind verschieden gebaut (Plakette, Chargentext, optionale Aktion);
eine Tabelle verstuemmelte sie. List.Item ist verboten, List mit renderItem in
RSC ungemessen — eigenes <ul>/<li>, und getByRole('listitem') ersetzt die drei
.row-Selektoren.

Popconfirm statt Modal: Aussondern verliert nichts (Journalzeile), und am
Verfallsregal werden mehrere Chargen nacheinander ausgesondert.

Zwei Quellen bleiben getrennt: Handlager-Chargen und gemeldete
Fahrzeug-Verfaelle. Gemischt behauptete die Liste, ein gemeldeter
Fahrzeugverfall liesze sich aussondern — er laeszt sich nur neu melden."
```

---

### Task 131: `/verwaltung/fahrzeuge` — Flottenliste

**Files:** Create `verwaltung/(arbeit)/fahrzeuge/page.tsx`, `.../FahrzeugeListe.tsx`,
`.../NeuFahrzeug.tsx`; Test `.../FahrzeugeListe.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/fahrzeuge.ts` (T48) — `fahrzeugUebersicht`;
`_actions/fahrzeuge.ts` — `createFahrzeug`; `_lib/suche.ts`, `_ui/Suchfeld`, `_ui/Trefferanzeige`,
`_ui/Chip`, `_ui/SeitenKopf`. Produces `/verwaltung/fahrzeuge`.

**Spalten, abgelesen aus `FahrzeugeListe.tsx:55-80`:**

| # | Titel | Anmerkung |
|---|---|---|
| 1 | Fahrzeug | `<Link href={`/verwaltung/fahrzeuge/${id}`}>` + Kennung in Mono |
| 2 | Vorlage | `templateName` als grauer Chip, sonst „—" |
| 3 | Bestückung | „N Positionen · M Fächer" |
| 4 | Status | Chips: inaktiv · „N unter Soll" (rot, `warnung`) · „N läuft ab" (gelb, `verfall`) · „auf Soll" (ok) |
| 5 | Zuletzt geprüft | `letzterCheck` oder „noch nie geprüft" |

**Suchfeldmenge (2 von 6):** Name · Kennung (`FahrzeugeListe.tsx:16-25`).
**Filter:** unter Soll · läuft ab · inaktive ausblenden — drei einzelne `Checkbox`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, unmount, fill, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import { FahrzeugeListe, sucheTrifft } from "./FahrzeugeListe";
import s from "../../../_ui/verwaltung.module.css";

vi.mock("../../../_actions/fahrzeuge", () => ({ createFahrzeug: async () => ({ ok: true, wert: { id: "x" } }) }));

const ZEILEN = [
  { id: "f1", name: "RTW 1", kennung: "UE-RK 1234", aktiv: true, templateName: "Standard-RTW",
    positionen: 12, faecher: 3, artikelUnterSoll: 2, verfallAuffaellig: 0,
    letzterCheck: new Date("2026-07-30T08:00:00Z") },
  { id: "f2", name: "MTW", kennung: null, aktiv: false, templateName: null,
    positionen: 0, faecher: 0, artikelUnterSoll: 0, verfallAuffaellig: 0, letzterCheck: null },
];
afterEach(async () => { await unmount(); });

describe("FahrzeugeListe", () => {
  it("traegt die fuenf abgelesenen Spalten", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    expect(queryAll("thead th").map((th) => th.textContent)).toEqual(
      ["Fahrzeug", "Vorlage", "Bestückung", "Status", "Zuletzt geprüft"]);
  });

  it("die erste Spalte ist ein echter Link aufs Fahrzeugblatt", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    expect(query("tbody a").getAttribute("href")).toBe("/verwaltung/fahrzeuge/f1");
  });

  it("sucht ueber Name UND Kennung (2 von 6)", () => {
    expect(sucheTrifft(ZEILEN[0], "rtw")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "UE-RK")).toBe(true);
    expect(sucheTrifft(ZEILEN[1], "UE-RK")).toBe(false);
  });

  it("zeigt „X von Y\" erst beim Filtern", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    expect(exists(`.${s.filtertreffer}`)).toBe(false);
    await fill("input[type='search']", "MTW");
    expect(query(`.${s.filtertreffer}`).textContent).toBe("1 von 2");
  });

  it("faerbt „unter Soll\" mit Ampel-Rot, nicht mit Suite-Rot", async () => {
    // Der Chip liest --lb-ampel-rot-*; Suite-Rot bleibt Marke und Handlung.
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    expect(query(`.${s.rot}`).textContent).toContain("2 unter Soll");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/FahrzeugeListe.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./FahrzeugeListe"`.

- [ ] **Schritt 3: Die drei Dateien schreiben**

```tsx
// NeuFahrzeug.tsx — "use client", MIT Form (Absendeknopf).
"use client";
import { useState, useTransition } from "react";
import { Button, Form, Input, Modal } from "antd";
import { createFahrzeug } from "../../../_actions/fahrzeuge";
import { Ikone } from "../../../_ui/ikonen";

export function NeuFahrzeug() {
  const [offen, setOffen] = useState(false);
  const [form] = Form.useForm();
  const [laeuft, start] = useTransition();
  return (
    <>
      <Button type="primary" icon={<Ikone name="plus" groesse={16} />} onClick={() => setOffen(true)}>
        Neues Fahrzeug
      </Button>
      <Modal open={offen} title="Neues Fahrzeug" onCancel={() => setOffen(false)}
             footer={null} destroyOnHidden>
        <Form form={form} layout="vertical" disabled={laeuft}
          onFinish={(w) => start(async () => {
            const erg = await createFahrzeug(w);
            if (erg.ok) { setOffen(false); form.resetFields(); }
            else form.setFields(Object.entries(erg.feldFehler ?? {})
              .map(([name, errors]) => ({ name, errors: [errors] })));
          })}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name angeben" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="kennung" label="Kennzeichen">
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={laeuft}>Anlegen</Button>
        </Form>
      </Modal>
    </>
  );
}
```

```tsx
// FahrzeugeListe.tsx
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Checkbox, Flex, Table } from "antd";
import { falte } from "../../../_lib/suche";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import { NeuFahrzeug } from "./NeuFahrzeug";
import type { FahrzeugUebersichtZeile } from "../../../_lib/lesepfade/fahrzeuge";

/** SUCHFELDMENGE 2 VON 6 (§6.9.4): Name · Kennung. */
export function sucheTrifft(z: FahrzeugUebersichtZeile, begriff: string): boolean {
  const q = falte(begriff.trim());
  return !q || falte(`${z.name} ${z.kennung ?? ""}`).includes(q);
}

export function FahrzeugeListe({ zeilen }: { zeilen: FahrzeugUebersichtZeile[] }) {
  const [suche, setSuche] = useState("");
  const [unterSoll, setUnterSoll] = useState(false);
  const [laeuftAb, setLaeuftAb] = useState(false);
  const [ohneInaktive, setOhneInaktive] = useState(false);

  const gefiltert = useMemo(() => zeilen.filter((z) => {
    if (ohneInaktive && !z.aktiv) return false;
    if (unterSoll && z.artikelUnterSoll === 0) return false;
    if (laeuftAb && z.verfallAuffaellig === 0) return false;
    return sucheTrifft(z, suche);
  }), [zeilen, suche, unterSoll, laeuftAb, ohneInaktive]);

  return (
    <>
      <Flex gap={12} wrap align="center" style={{ marginBlockEnd: 12 }}>
        <Suchfeld wert={suche} onWert={setSuche} platzhalter="Fahrzeug oder Kennung suchen…" />
        <Checkbox checked={unterSoll} onChange={(e) => setUnterSoll(e.target.checked)}>unter Soll</Checkbox>
        <Checkbox checked={laeuftAb} onChange={(e) => setLaeuftAb(e.target.checked)}>läuft ab</Checkbox>
        <Checkbox checked={ohneInaktive} onChange={(e) => setOhneInaktive(e.target.checked)}>
          inaktive ausblenden
        </Checkbox>
        <Trefferanzeige gezeigt={gefiltert.length} gesamt={zeilen.length} />
        <NeuFahrzeug />
      </Flex>
      <Table
        rowKey="id" pagination={false} scroll={{ x: "max-content" }}
        aria-label="Fahrzeuge" dataSource={gefiltert}
        locale={{ emptyText: suche ? "Kein Fahrzeug passt zu Suche und Filter."
                                   : "Noch keine Fahrzeuge. Lege oben das erste an." }}
        columns={[
          { title: "Fahrzeug", dataIndex: "name",
            render: (v: string, z) => (
              <span>
                <Link href={`/verwaltung/fahrzeuge/${z.id}`} style={{ fontWeight: 600 }}>{v}</Link>
                {z.kennung ? <span style={{ ...SCHRIFT.mono, marginInlineStart: 8 }}>{z.kennung}</span> : null}
              </span>
            ) },
          { title: "Vorlage", dataIndex: "templateName",
            render: (v: string | null) => v ? <Chip ton="grau">{v}</Chip> : <span style={SCHRIFT.neben}>—</span> },
          { title: "Bestückung", dataIndex: "positionen",
            render: (_: number, z) => (
              <span style={SCHRIFT.neben}>
                {z.positionen} Position{z.positionen === 1 ? "" : "en"}
                {z.faecher > 0 ? ` · ${z.faecher} ${z.faecher === 1 ? "Fach" : "Fächer"}` : ""}
              </span>
            ) },
          { title: "Status", dataIndex: "aktiv",
            render: (_: boolean, z) => (
              <Flex gap={6} wrap>
                {!z.aktiv ? <Chip ton="grau">inaktiv</Chip> : null}
                {z.artikelUnterSoll > 0
                  ? <Chip ton="rot" zeichen="warnung">{z.artikelUnterSoll} unter Soll</Chip> : null}
                {z.verfallAuffaellig > 0
                  ? <Chip ton="gelb" zeichen="verfall">{z.verfallAuffaellig} läuft ab</Chip> : null}
                {z.positionen > 0 && z.artikelUnterSoll === 0 ? <Chip ton="ok">auf Soll</Chip> : null}
              </Flex>
            ) },
          { title: "Zuletzt geprüft", dataIndex: "letzterCheck",
            render: (d: Date | null) => (
              <span style={SCHRIFT.neben}>
                {d ? d.toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "noch nie geprüft"}
              </span>
            ) },
        ]}
      />
    </>
  );
}
```

```tsx
// page.tsx
import { getDb } from "../../../_db/client";
import { fahrzeugUebersicht } from "../../../_lib/lesepfade/fahrzeuge";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { FahrzeugeListe } from "./FahrzeugeListe";

export const dynamic = "force-dynamic";

export default function FahrzeugeSeite() {
  return (
    <>
      <SeitenKopf titel="Fahrzeuge"
        beschreibung="Flotte mit Soll-Abgleich und Verfallsmeldungen aus den Fahrzeug-Checks." />
      <FahrzeugeListe zeilen={fahrzeugUebersicht(getDb(), new Date())} />
    </>
  );
}
```

- [ ] **Schritt 4: Grün und Commit**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/FahrzeugeListe.test.tsx"
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/page.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/FahrzeugeListe.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/NeuFahrzeug.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/FahrzeugeListe.test.tsx"
rtk git commit -m "feat(lagerbuch): /verwaltung/fahrzeuge — Flottenliste

Fuenf Spalten in der abgelesenen Reihenfolge; erste Spalte ist ein echter Link
aufs Fahrzeugblatt. Suchfeldmenge 2 von 6: Name und Kennung. Drei einzelne
Checkboxen — sie schlieszen einander nicht aus.

'N unter Soll' traegt Ampel-Rot ueber den Chip, nicht Suite-Rot: Rot auf einer
Datenflaeche ist die Fachaussage, nicht die Marke."
```

---

### Task 132: `/verwaltung/fahrzeuge/[id]` — das Fahrzeugblatt, vier Inseln

**Files:** Create `verwaltung/(arbeit)/fahrzeuge/[id]/page.tsx`, `.../SollEditor.tsx`,
`.../TemplateVerknuepfung.tsx`, `.../VerfallEditor.tsx`, `.../FahrzeugAktivToggle.tsx`;
Test `.../SollEditor.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/fahrzeuge.ts` (T48) — `sollFuerFahrzeug`,
`templateListeAktiv`; `_lib/lesepfade/verfall.ts` (T47) — `verfallFuerLagerort`;
`_lib/lesepfade/artikel.ts` (T45) — `artikelListe`; `_actions/fahrzeuge.ts` (T118),
`_actions/templates.ts` (T119), `_actions/lagerortVerfall.ts` (T120), `_actions/loeschen.ts` (T124);
`_ui/Brotkrume`, `_ui/Kachel`, `_ui/Chip`, `_ui/LoeschButton`, `_ui/SeitenKopf`.
Produces `/verwaltung/fahrzeuge/[id]`.

**Spalten des `SollEditor`, abgelesen aus `SollEditor.tsx`:**

| # | Titel | Anmerkung |
|---|---|---|
| 1 | Fach | Gruppenstreifen `.fach`; die Zeilen sind nach `fachLabel` gruppiert |
| 2 | Artikel | Name; bei Grabstein durchgestrichen mit Chip „entfernt" |
| 3 | Soll | `InputNumber`, **auto-committend**, `size="small"` (Zeilenaktion) |
| 4 | Herkunft | Chip: `manuell` (grau) · `vorlage` (grau) · `ueberschrieben` (gelb) |
| 5 | — | Papierkorb mit `Popconfirm` bzw. „zurücksetzen" bei Grabsteinen |

⚠️ **Brotkrume Pflicht** — `aktiverEintrag` markiert diese Seite nicht (§6.3.3).
⚠️ **`Select showSearch` mit `filterOption` über `label + keywords`** (Fach als `keywords`,
`SollEditor.tsx:93`) — sonst tippt jemand ein Fach und findet nichts.
⚠️ **Die Grabstein-Zeile wird GERENDERT, nicht ausgeblendet.** `sollPositionWiederherstellen`
(T118) hat sonst **keinen Weg in der Oberfläche** — §6.12, Frage 1, benannter Kandidat.
⚠️ **`VerfallEditor` ist das dritte Monatsfeld** (`DatePicker picker="month"`, `format="YYYY-MM"`,
`allowClear`) und **auto-committend, ohne `Form`** (§6.4.7).
⚠️ **`InputNumber` und `DatePicker` in Tabellenzeilen tragen `size="small"`** — die einzige von der
Suite erlaubte Ausnahme von `controlHeight: 56` (§6.4.1 Punkt 4).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben** — `SollEditor.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import { SollEditor, fachFilter } from "./SollEditor";

const setzen = vi.fn(async () => ({ ok: true as const, wert: { id: "p1" } }));
vi.mock("../../../../_actions/fahrzeuge", () => ({
  sollPositionSetzen: (...a: unknown[]) => setzen(...(a as [])),
  sollPositionEntfernen: async () => ({ ok: true }),
  sollPositionWiederherstellen: async () => ({ ok: true }),
}));

const POSITIONEN = [
  { id: "p1", fachLabel: "Fach 1", artikelId: "a1", artikelName: "Mull", einheit: "Rol",
    soll: 3, ist: 3, sort: 0, herkunft: "vorlage" as const, entfernt: false },
  { id: "p2", fachLabel: "Fach 1", artikelId: "a2", artikelName: "Kompressen", einheit: "Stk",
    soll: 2, ist: 0, sort: 1, herkunft: "vorlage" as const, entfernt: true },
];
const ARTIKEL = [{ id: "a3", name: "Pflaster", fach: "C3" }];
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); setzen.mockClear(); });
afterEach(async () => { vi.useRealTimers(); await unmount(); });

describe("SollEditor", () => {
  it("traegt die fuenf abgelesenen Spalten", async () => {
    await mount(<SollEditor fahrzeugId="f1" positionen={POSITIONEN} artikel={ARTIKEL} />);
    expect(queryAll("thead th").map((th) => th.textContent))
      .toEqual(["Fach", "Artikel", "Soll", "Herkunft", ""]);
  });

  it("RENDERT die Grabstein-Zeile mit dem Weg zurueck", async () => {
    /*
     * ⚠️ §6.12, Frage 1 — benannter Kandidat fuer „Action ohne Weg in der
     * Oberflaeche": `sollPositionWiederherstellen` ist NUR an einer entfernten
     * Zeile erreichbar. Wer Grabsteine ausblendet, laeszt eine Action stumm
     * zurueck.
     */
    await mount(<SollEditor fahrzeugId="f1" positionen={POSITIONEN} artikel={ARTIKEL} />);
    expect(queryAll("tbody tr")).toHaveLength(2);
    expect(query("[data-rolle='wiederherstellen']").textContent).toContain("zurücksetzen");
  });

  it("committet die Soll-Menge OHNE Form und ohne Absendeknopf", async () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/[id]/SollEditor.tsx", "utf8");
    // Auto-committende Felder duerfen nicht in ein Form.Item (Falle 45, §6.4.7).
    expect(quelle).not.toMatch(/Form\.Item/);
  });

  it("Zeilenaktionen tragen size=\"small\" — die einzige erlaubte Ausnahme", async () => {
    await mount(<SollEditor fahrzeugId="f1" positionen={POSITIONEN} artikel={ARTIKEL} />);
    expect(exists("tbody .ant-input-number-sm")).toBe(true);
  });

  it("filterOption findet einen Artikel ueber sein FACH", () => {
    expect(fachFilter("C3", { label: "Pflaster", keywords: "C3" })).toBe(true);
    expect(fachFilter("A1", { label: "Pflaster", keywords: "C3" })).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/[id]/SollEditor.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./SollEditor"`.

- [ ] **Schritt 3: Die fünf Dateien schreiben** (Kernstücke; die drei kleinen Inseln folgen demselben
  Muster wie `FahrzeugAktivToggle`)

```tsx
// FahrzeugAktivToggle.tsx — "use client". Muster fuer ALLE VIER *AktivToggle.
"use client";
import { useState, useTransition } from "react";
import { Space, Switch, Alert } from "antd";
import { setFahrzeugAktiv } from "../../../../_actions/fahrzeuge";

/**
 * ⚠️ DIE VIER *AktivToggle WERDEN NICHT ZUSAMMENGELEGT (Festlegung H12). Sie
 * sehen gleich aus, rufen aber VIER VERSCHIEDENE Actions in vier Dateien. Eine
 * gemeinsame Komponente braeuchte die Action als Prop — und machte aus vier
 * trivialen Dateien eine Indirektion, die den Zusammenhang „welcher Knopf ruft
 * was" verdeckt. Genau den muss §6.12, Frage 1 abhaken.
 *
 * Der Fehler kommt als Rueckgabewert an, nicht als Wurf: der Bestand hat hier
 * eine der 19 ungefangenen Aufrufstellen (`*AktivToggle.tsx:11`).
 */
export function FahrzeugAktivToggle({ id, aktiv }: { id: string; aktiv: boolean }) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  return (
    <Space direction="vertical">
      <Space>
        <Switch checked={aktiv} loading={laeuft} aria-label="Fahrzeug aktiv"
          onChange={(neu) => start(async () => {
            const erg = await setFahrzeugAktiv({ id, aktiv: neu });
            setFehler(erg.ok ? null : erg.fehler);
          })} />
        <span>{aktiv ? "aktiv" : "inaktiv"}</span>
      </Space>
      {fehler ? <Alert type="warning" showIcon={false} message={fehler} /> : null}
    </Space>
  );
}
```

```tsx
// SollEditor.tsx — "use client".
"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Flex, InputNumber, Popconfirm, Select, Table } from "antd";
import { sollPositionEntfernen, sollPositionSetzen, sollPositionWiederherstellen }
  from "../../../../_actions/fahrzeuge";
import { Chip } from "../../../../_ui/Chip";
import { Ikone } from "../../../../_ui/ikonen";
import { SCHRIFT } from "../../../../_lib/schrift";
import s from "../../../../_ui/verwaltung.module.css";
import type { SollZeile } from "../../../../_lib/lesepfade/fahrzeuge";

const SOLL_DEBOUNCE_MS = 400;

/** `Select showSearch` filtert ohne dies nur ueber `label` — das Fach fiele weg. */
export function fachFilter(eingabe: string, option?: { label?: string; keywords?: string }): boolean {
  return `${option?.label ?? ""} ${option?.keywords ?? ""}`.toLowerCase()
    .includes(eingabe.trim().toLowerCase());
}

const HERKUNFT_TON = { manuell: "grau", vorlage: "grau", ueberschrieben: "gelb" } as const;

export function SollEditor({
  fahrzeugId, positionen, artikel,
}: {
  fahrzeugId: string;
  positionen: SollZeile[];
  artikel: { id: string; name: string; fach: string }[];
}) {
  const [neuFach, setNeuFach] = useState("");
  const [neuArtikel, setNeuArtikel] = useState<string | undefined>();
  const [neuSoll, setNeuSoll] = useState<number | null>(1);
  const [laeuft, start] = useTransition();
  // Lokale Spiegel: der Wert bleibt sofort sichtbar, waehrend der Commit laeuft.
  const [spiegel, setSpiegel] = useState<Record<string, number>>({});
  const timer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => () => { for (const t of Object.values(timer.current)) clearTimeout(t); }, []);

  function sollGeaendert(z: SollZeile, wert: number | null) {
    if (wert === null) return;
    setSpiegel((s) => ({ ...s, [z.id]: wert }));
    clearTimeout(timer.current[z.id]);
    timer.current[z.id] = setTimeout(() => {
      void sollPositionSetzen({ id: z.id, fahrzeugId, fachLabel: z.fachLabel,
                                artikelId: z.artikelId, soll: wert, sort: z.sort });
    }, SOLL_DEBOUNCE_MS);
  }

  return (
    <>
      <Table
        rowKey="id" pagination={false} scroll={{ x: "max-content" }}
        aria-label="Soll-Bestückung" dataSource={positionen}
        locale={{ emptyText: "Noch keine Soll-Position. Lege unten die erste an." }}
        columns={[
          { title: "Fach", dataIndex: "fachLabel",
            render: (v: string) => <span className={s.fach}>{v}</span> },
          { title: "Artikel", dataIndex: "artikelName",
            render: (v: string, z) => (
              <span style={z.entfernt ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
                {v} {z.entfernt ? <Chip ton="grau">entfernt</Chip> : null}
              </span>
            ) },
          { title: "Soll", dataIndex: "soll", align: "right" as const,
            render: (v: number, z) => (
              <InputNumber size="small" min={1} max={9999} disabled={z.entfernt}
                value={spiegel[z.id] ?? v} onChange={(w) => sollGeaendert(z, w)}
                aria-label={`Soll für ${z.artikelName}`} />
            ) },
          { title: "Herkunft", dataIndex: "herkunft",
            render: (v: SollZeile["herkunft"]) => <Chip ton={HERKUNFT_TON[v]}>{v}</Chip> },
          { title: "", dataIndex: "id",
            render: (_: string, z) => z.entfernt ? (
              <Button size="small" data-rolle="wiederherstellen"
                icon={<Ikone name="zuruecksetzen" groesse={14} />}
                onClick={() => start(async () => { await sollPositionWiederherstellen({ id: z.id }); })}>
                zurücksetzen
              </Button>
            ) : (
              // Fall 2 aus §6.4.5: die Zeile traegt nichts als ihre eigene
              // Sollzahl; wer sie versehentlich entfernt, tippt sie neu.
              <Popconfirm title="Position entfernen?" okText="Entfernen" cancelText="Abbrechen"
                onConfirm={() => start(async () => { await sollPositionEntfernen({ id: z.id }); })}>
                <Button size="small" danger icon={<Ikone name="papierkorb" groesse={14} />}
                        aria-label={`${z.artikelName} aus Fach ${z.fachLabel} entfernen`} />
              </Popconfirm>
            ) },
        ]}
      />
      <Flex gap={8} wrap align="center" style={{ marginBlockStart: 12 }}>
        <input className={s.fach} placeholder="Fach" aria-label="Fach"
               value={neuFach} onChange={(e) => setNeuFach(e.target.value)}
               style={{ ...SCHRIFT.text, fontSize: 16, padding: "8px 10px" }} />
        <Select showSearch filterOption={fachFilter} value={neuArtikel} onChange={setNeuArtikel}
          placeholder="Artikel" aria-label="Artikel" style={{ minWidth: 240 }}
          options={artikel.map((a) => ({ value: a.id, label: a.name, keywords: a.fach }))} />
        <InputNumber min={1} max={9999} value={neuSoll} onChange={setNeuSoll} aria-label="Soll" />
        <Button type="primary" icon={<Ikone name="plus" groesse={16} />} loading={laeuft}
          disabled={!neuFach.trim() || !neuArtikel || !neuSoll}
          onClick={() => start(async () => {
            await sollPositionSetzen({ fahrzeugId, fachLabel: neuFach.trim(),
                                       artikelId: neuArtikel!, soll: neuSoll! });
            setNeuArtikel(undefined); setNeuSoll(1);
          })}>
          Position hinzufügen
        </Button>
      </Flex>
    </>
  );
}
```

`TemplateVerknuepfung.tsx` trägt fünf Bedienelemente für fünf Actions (§6 Tabelle, Zeilen 21–25):
`Select` „Vorlage" + „Verknüpfen" (`fahrzeugTemplateZuweisen`), „Erneut übertragen" (Zeichen
`erneut`, `fahrzeugTemplateSync`), `Popconfirm` „Verknüpfung lösen" (Zeichen `entketten`,
`fahrzeugTemplateLoesen`) und „Vorlage aus diesem Fahrzeug erstellen" (`Modal` mit Name + `Checkbox`
„verknüpfen", `templateAusFahrzeug`). Alle rufen ihre Action über `useTransition` und zeigen den
Rückgabewert als `Alert type="warning"` — **nie** `type="error"`.

`VerfallEditor.tsx` rendert je Artikel des Fahrzeugs einen `DatePicker picker="month"
format="YYYY-MM" allowClear size="small"` mit `aria-label={`Verfall ${artikelName}`}` und ruft
`verfallSetzen` **beim Ändern**, ohne `Form` — `monatAusPicker` aus `_ui/monat.ts` (T127) ist auch
hier die einzige dayjs-Grenze; sie wird **nicht** aus `ArtikelDrawer.tsx` importiert (Falle 6).

- [ ] **Schritt 4: `page.tsx` schreiben**

```tsx
import { notFound } from "next/navigation";
import { Card, Col, Row } from "antd";
import { getDb } from "../../../../_db/client";
import { sollFuerFahrzeug, templateListeAktiv } from "../../../../_lib/lesepfade/fahrzeuge";
import { verfallFuerLagerort } from "../../../../_lib/lesepfade/verfall";
import { artikelListe } from "../../../../_lib/lesepfade/artikel";
import { lagerorte } from "../../../../_db/schema";
import { eq } from "drizzle-orm";
import { deaktiviereElement, loescheElement, pruefeLoeschbar } from "../../../../_actions/loeschen";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { Kachel } from "../../../../_ui/Kachel";
import { LoeschButton } from "../../../../_ui/LoeschButton";
import { FahrzeugAktivToggle } from "./FahrzeugAktivToggle";
import { SollEditor } from "./SollEditor";
import { TemplateVerknuepfung } from "./TemplateVerknuepfung";
import { VerfallEditor } from "./VerfallEditor";
import { SCHRIFT } from "../../../../_lib/schrift";
import s from "../../../../_ui/verwaltung.module.css";

export const dynamic = "force-dynamic";

/**
 * ⚠️ BROTKRUME IST PFLICHT: `aktiverEintrag` markiert diese Seite NICHT
 * (`/verwaltung/fahrzeuge/42` endet weder auf `/verwaltung/fahrzeuge` noch auf
 * `/verwaltung`). Der Verlust ist angenommen (§6.3.3) — die Brotkrume faengt
 * ihn auf und ist deshalb keine Zierde.
 *
 * ⚠️ ZWEI-LINIEN-REGEL (§3.2.1, §6.15 Auflage 3): das Group-Layout riegelt den
 * Bereich ab; DIESE Seite prueft die Zugehoerigkeit ihres URL-Parameters
 * ZUSAETZLICH selbst — ein `lagerorte`-Eintrag mit `typ !== "fahrzeug"` ist
 * kein Fahrzeugblatt, und `notFound()` verraet nicht, ob die Kennung existiert.
 */
export default async function FahrzeugBlatt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const fz = db.select().from(lagerorte).where(eq(lagerorte.id, id)).get();
  if (!fz || fz.typ !== "fahrzeug") notFound();

  const soll = sollFuerFahrzeug(db, id);
  const verfall = verfallFuerLagerort(db, id, new Date());
  const artikel = artikelListe(db).map((a) => ({ id: a.id, name: a.name, fach: a.fach }));
  const vorlagen = templateListeAktiv(db);
  const faecher = new Set(soll.filter((p) => !p.entfernt).map((p) => p.fachLabel)).size;

  return (
    <>
      <Brotkrume href="/verwaltung/fahrzeuge">Fahrzeuge</Brotkrume>
      <SeitenKopf
        titel={fz.name}
        beschreibung={fz.kennung ? <span style={SCHRIFT.mono}>{fz.kennung}</span> : undefined}
        aktionen={<FahrzeugAktivToggle id={fz.id} aktiv={fz.aktiv} />}
      />
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={8}><Kachel zahl={soll.filter((p) => !p.entfernt).length}
                                    beschriftung="Soll-Positionen" /></Col>
        <Col xs={24} md={8}><Kachel zahl={faecher} beschriftung="Fächer" /></Col>
        <Col xs={24} md={8}><Kachel zahl={verfall.filter((v) => v.ampel !== "gruen").length}
          beschriftung="auffällige Verfallsmeldungen"
          ton={verfall.some((v) => v.ampel === "rot") ? "rot" : "ok"} /></Col>
      </Row>

      <h2 style={{ ...SCHRIFT.abschnitt, margin: "0 0 8px" }}>Vorlage</h2>
      <TemplateVerknuepfung fahrzeugId={fz.id} templateId={fz.templateId} vorlagen={vorlagen} />

      <h2 style={{ ...SCHRIFT.abschnitt, margin: "24px 0 8px" }}>Soll-Bestückung</h2>
      <SollEditor fahrzeugId={fz.id} positionen={soll} artikel={artikel} />

      <h2 style={{ ...SCHRIFT.abschnitt, margin: "24px 0 8px" }}>Verfall im Fahrzeug</h2>
      <Card><VerfallEditor lagerortId={fz.id} eintraege={verfall} /></Card>

      <div className={s.gefahr}>
        <div className={s.gtitle}>Gefahrenzone</div>
        <p style={SCHRIFT.text}>
          Fahrzeug endgültig löschen. Das ist nur möglich, solange keine Buchung, kein Check und
          keine Soll-Position daran hängt — sonst biete ich stattdessen das Deaktivieren an.
        </p>
        <LoeschButton
          name={fz.name} typLabel="Fahrzeug"
          pruefen={async () => {
            const e = await pruefeLoeschbar("fahrzeug", fz.id);
            return e.ok ? e.wert : { loeschbar: false, grund: e.fehler, kannDeaktivieren: false };
          }}
          onLoeschen={async () => { await loescheElement("fahrzeug", fz.id); }}
          onDeaktivieren={async () => { await deaktiviereElement("fahrzeug", fz.id); }}
        />
      </div>
    </>
  );
}
```

- [ ] **Schritt 5: Grün und Commit**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/[id]/SollEditor.test.tsx"
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/[id]/"
rtk git commit -m "feat(lagerbuch): /verwaltung/fahrzeuge/[id] — Fahrzeugblatt mit vier Inseln

Brotkrume ist Pflicht: aktiverEintrag markiert diese Seite nicht, der Verlust
ist angenommen und wird hier aufgefangen. Zwei-Linien-Regel: die Seite prueft
zusaetzlich selbst, dass die Kennung ein FAHRZEUG ist.

Der SollEditor RENDERT Grabstein-Zeilen mit 'zuruecksetzen' —
sollPositionWiederherstellen haette sonst keinen Weg in der Oberflaeche
(§6.12, Frage 1).

Soll-Mengen und der Verfallsmonat committen beim Aendern und stehen deshalb in
KEINEM Form.Item (Falle 45). Zeilenaktionen tragen size='small' — die einzige
von der Suite erlaubte Ausnahme von controlHeight 56.

Select showSearch mit filterOption ueber label + keywords (Fach), sonst tippt
jemand ein Fach und findet nichts.

Die vier *AktivToggle bleiben vier Dateien (H12): sie rufen vier verschiedene
Actions, und eine gemeinsame Komponente verdeckte den Zusammenhang, den §6.12
Frage 1 abhaken muss."
```

---

### Task 133: `/verwaltung/vorlagen` — Vorlagenliste

**Files:** Create `verwaltung/(arbeit)/vorlagen/page.tsx`, `.../NeuTemplate.tsx`;
Test `.../NeuTemplate.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/fahrzeuge.ts` (T48) — `templateUebersicht`;
`_actions/templates.ts` — `createTemplate`; `_ui/Chip`, `_ui/SeitenKopf`; `antd` — `Table`, `Modal`,
`Form`, `Input`, `Button`. Produces `/verwaltung/vorlagen`.

**Spalten, abgelesen aus `vorlagen/page.tsx:22-40`:**

| # | Titel | Anmerkung |
|---|---|---|
| 1 | Vorlage | `<Link href={`/verwaltung/vorlagen/${id}`}>`; inaktiv als grauer Chip daneben |
| 2 | Bestückung | „N Positionen · M Fächer" |
| 3 | Fahrzeuge | Chip mit Zeichen `fahrzeug` — **die zweite, fachliche Verwendung von `Truck`** (§6.5.4) |

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, unmount, click, fill, queryPortal, existsPortal } from "@/app/m/qr/_lib/test-dom";
import { NeuTemplate } from "./NeuTemplate";

const createTemplate = vi.fn(async () => ({ ok: true as const, wert: { id: "t1" } }));
vi.mock("../../../_actions/templates", () => ({
  createTemplate: (...a: unknown[]) => createTemplate(...(a as [])) }));
afterEach(async () => { createTemplate.mockClear(); await unmount(); });

describe("NeuTemplate", () => {
  it("oeffnet ein Modal, dessen title der zugaengliche Name ist", async () => {
    await mount(<NeuTemplate />);
    await click("button");
    expect(queryPortal(".ant-modal-title").textContent).toBe("Neue Vorlage");
  });

  it("legt an und meldet Feldfehler AM FELD", async () => {
    createTemplate.mockResolvedValueOnce(
      { ok: false, fehler: "x", feldFehler: { name: "Name darf nicht leer sein" } } as never);
    await mount(<NeuTemplate />);
    await click("button");
    await fill(".ant-modal input", " ");
    await click(".ant-modal button[type='submit']");
    await new Promise((r) => setTimeout(r, 0));
    // Nie ueber e.message: das ist in Produktion Framework-Englisch (Falle 66).
    expect(queryPortal(".ant-form-item-explain-error").textContent)
      .toBe("Name darf nicht leer sein");
    expect(existsPortal(".ant-alert-error")).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/NeuTemplate.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./NeuTemplate"`.

- [ ] **Schritt 3: Die zwei Dateien schreiben**

```tsx
// NeuTemplate.tsx — "use client", MIT Form.
"use client";
import { useState, useTransition } from "react";
import { Button, Form, Input, Modal } from "antd";
import { createTemplate } from "../../../_actions/templates";
import { Ikone } from "../../../_ui/ikonen";

export function NeuTemplate() {
  const [offen, setOffen] = useState(false);
  const [form] = Form.useForm();
  const [laeuft, start] = useTransition();
  return (
    <>
      <Button type="primary" icon={<Ikone name="plus" groesse={16} />} onClick={() => setOffen(true)}>
        Neue Vorlage
      </Button>
      <Modal open={offen} title="Neue Vorlage" onCancel={() => setOffen(false)}
             footer={null} destroyOnHidden>
        <Form form={form} layout="vertical" disabled={laeuft}
          onFinish={(w) => start(async () => {
            const erg = await createTemplate(w);
            if (erg.ok) { setOffen(false); form.resetFields(); }
            else form.setFields(Object.entries(erg.feldFehler ?? { name: erg.fehler })
              .map(([name, errors]) => ({ name, errors: [errors] })));
          })}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name angeben" }]}>
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={laeuft}>Anlegen</Button>
        </Form>
      </Modal>
    </>
  );
}
```

```tsx
// page.tsx
import Link from "next/link";
import { Table } from "antd";
import { getDb } from "../../../_db/client";
import { templateUebersicht } from "../../../_lib/lesepfade/fahrzeuge";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { Chip } from "../../../_ui/Chip";
import { NeuTemplate } from "./NeuTemplate";
import { SCHRIFT } from "../../../_lib/schrift";

export const dynamic = "force-dynamic";

/**
 * RSC + EINE Insel. Die Liste ist reine Anzeige; nur das Anlegen bedient.
 *
 * ⚠️ Das Zeichen `fahrzeug` ist hier die ZWEITE, fachliche Verwendung von
 * `Truck` (§6.5.4) — und der Grund, warum es NICHT auf der Streichliste der
 * Navigationszeichen steht. Wer die Navigationsliste als Streichliste liest,
 * streicht sieben statt fuenf und hinterlaeszt hier ein leeres Zeichen, still.
 */
export default function VorlagenSeite() {
  const zeilen = templateUebersicht(getDb());
  return (
    <>
      <SeitenKopf
        titel="Vorlagen"
        beschreibung="Bestückung einmal definieren und auf mehrere identisch gepackte Fahrzeuge übertragen. Pro Fahrzeug bleiben manuelle Abweichungen möglich."
        aktionen={<NeuTemplate />}
      />
      <Table
        rowKey="id" pagination={false} scroll={{ x: "max-content" }}
        aria-label="Vorlagen" dataSource={zeilen}
        locale={{ emptyText: "Noch keine Vorlagen. Lege oben die erste an — oder erstelle eine Vorlage direkt aus einem gepackten Fahrzeug." }}
        columns={[
          { title: "Vorlage", dataIndex: "name",
            render: (v: string, z) => (
              <span>
                <Link href={`/verwaltung/vorlagen/${z.id}`} style={{ fontWeight: 600 }}>{v}</Link>
                {!z.aktiv ? <span style={{ marginInlineStart: 8 }}><Chip ton="grau">inaktiv</Chip></span> : null}
              </span>
            ) },
          { title: "Bestückung", dataIndex: "positionen",
            render: (_: number, z) => (
              <span style={SCHRIFT.neben}>
                {z.positionen} Position{z.positionen === 1 ? "" : "en"}
                {z.faecher > 0 ? ` · ${z.faecher} ${z.faecher === 1 ? "Fach" : "Fächer"}` : ""}
              </span>
            ) },
          { title: "Fahrzeuge", dataIndex: "fahrzeuge",
            render: (v: number) => (
              <Chip ton="grau" zeichen="fahrzeug">{v} Fahrzeug{v === 1 ? "" : "e"}</Chip>
            ) },
        ]}
      />
    </>
  );
}
```

- [ ] **Schritt 4: Grün und Commit**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/NeuTemplate.test.tsx"
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/page.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/NeuTemplate.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/NeuTemplate.test.tsx"
rtk git commit -m "feat(lagerbuch): /verwaltung/vorlagen — Liste und Anlegen

Drei Spalten in der abgelesenen Reihenfolge. Das Zeichen `fahrzeug` ist hier
die zweite, FACHLICHE Verwendung von Truck — und der Grund, warum es nicht auf
der Streichliste der Navigationszeichen steht.

Feldfehler kommen am Feld an, nie ueber e.message: das ist in Produktion
Framework-Englisch."
```

---

### Task 134: `/verwaltung/vorlagen/[id]` — Vorlage bearbeiten

**Files:** Create `verwaltung/(arbeit)/vorlagen/[id]/page.tsx`, `.../TemplateAktionen.tsx`,
`.../TemplatePosEditor.tsx`; Test `.../TemplatePosEditor.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/fahrzeuge.ts` — `templateDetail`;
`_lib/lesepfade/artikel.ts` — `artikelListe`; `_actions/templates.ts` (alle elf);
`_ui/Brotkrume`, `_ui/Kachel`, `_ui/Chip`, `_ui/LoeschButton`. Produces `/verwaltung/vorlagen/[id]`.

**Spalten des `TemplatePosEditor`** (abgelesen, dieselbe Form wie `SollEditor` ohne Grabsteine):
`Fach` · `Artikel` · `Soll` (`InputNumber`, auto-committend, `size="small"`) · `—` (`Popconfirm`).
**`Select showSearch` mit `filterOption` über Fach** (`TemplatePosEditor.tsx:74`).

**Verknüpfte Fahrzeuge** als eigene `Table`: `Fahrzeug` (Link + Kennung) · `Status` (inaktiv-Chip).

⚠️ **`LoeschButton art="template"` ruft `deleteTemplate`, NICHT `loescheElement`** — es gibt keine
`ElementArt` `"template"` (§6, Abschnitt „Die Zuordnung"). Statt der Vorprüfung trägt der Dialog den
Hinweis: **„N Fahrzeuge werden von dieser Vorlage gelöst; ihre Positionen bleiben als individuelle
Bestückung erhalten."**
⚠️ **Brotkrume Pflicht.**

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Der Test prüft dieselben fünf Eigenschaften wie T132s `SollEditor.test.tsx` (Spaltenreihenfolge,
kein `Form.Item`, `size="small"`, `filterOption` über Fach, `Popconfirm` statt `Modal`) — **er wird
ausgeschrieben und nicht referenziert**, weil der Umsetzer Tasks außer der Reihe liest:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import { TemplatePosEditor, fachFilter } from "./TemplatePosEditor";

vi.mock("../../../../_actions/templates", () => ({
  templatePositionSetzen: async () => ({ ok: true, wert: { id: "p1" } }),
  templatePositionEntfernen: async () => ({ ok: true }),
}));
const POS = [{ id: "p1", fachLabel: "Fach 1", artikelId: "a1", artikelName: "Mull",
               einheit: "Rol", soll: 3, sort: 0 }];
afterEach(async () => { await unmount(); });

describe("TemplatePosEditor", () => {
  it("traegt die vier abgelesenen Spalten", async () => {
    await mount(<TemplatePosEditor templateId="t1" positionen={POS}
      artikel={[{ id: "a2", name: "Pflaster", fach: "C3" }]} />);
    expect(queryAll("thead th").map((th) => th.textContent)).toEqual(["Fach", "Artikel", "Soll", ""]);
  });

  it("committet OHNE Form und ohne Absendeknopf", () => {
    const q = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/[id]/TemplatePosEditor.tsx", "utf8");
    expect(q).not.toMatch(/Form\.Item/);
  });

  it("Zeilenaktionen tragen size=\"small\"", async () => {
    await mount(<TemplatePosEditor templateId="t1" positionen={POS} artikel={[]} />);
    expect(exists("tbody .ant-input-number-sm")).toBe(true);
  });

  it("entfernt per Popconfirm, nicht per Modal — Fall 2 aus §6.4.5", async () => {
    // Eine template_positionen-Zeile ist nach dem Loeschen wirklich weg und
    // steht in keiner Historie — sie traegt aber nichts als ihre eigene
    // Sollzahl. Kein Bestand haengt daran, keine Buchung verweist darauf.
    const q = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/[id]/TemplatePosEditor.tsx", "utf8");
    expect(q).toMatch(/Popconfirm/);
    expect(q).not.toMatch(/LoeschDialog|LoeschButton/);
  });

  it("filterOption findet einen Artikel ueber sein Fach", () => {
    expect(fachFilter("C3", { label: "Pflaster", keywords: "C3" })).toBe(true);
    expect(fachFilter("Z9", { label: "Pflaster", keywords: "C3" })).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/[id]/TemplatePosEditor.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./TemplatePosEditor"`.

- [ ] **Schritt 3: `TemplatePosEditor.tsx` schreiben**

⚠️ **Diese Datei wird hier ausgeschrieben und nicht als „zeichengleich zu `SollEditor.tsx`"
abgekürzt.** Der Umsetzer liest Tasks außer der Reihe; ein Verweis auf T132 wäre eine Anweisung, die
sich nur mit einer zweiten offenen Datei befolgen lässt. Die beiden Dateien liegen in
**verschiedenen Routenzweigen** — `fachFilter` wird hier **eigenständig deklariert** und **nicht**
aus `fahrzeuge/[id]/SollEditor.tsx` importiert; ein Import aus einem Routenordner in einen anderen
wäre eine Kopplung ohne Nutzen.

Die Unterschiede zu `SollEditor.tsx`, damit sie beim Lesen auffallen: **keine Grabstein-Spalte**
(eine `template_positionen`-Zeile kennt kein `entfernt`), **keine Herkunft-Spalte** (eine Vorlage
**ist** die Herkunft), und die Actions heißen `templatePositionSetzen` / `templatePositionEntfernen`
statt der Fahrzeug-Actions.

```tsx
// verwaltung/(arbeit)/vorlagen/[id]/TemplatePosEditor.tsx — "use client".
"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Flex, InputNumber, Popconfirm, Select, Table } from "antd";
import { templatePositionEntfernen, templatePositionSetzen }
  from "../../../../_actions/templates";
import { Ikone } from "../../../../_ui/ikonen";
import { SCHRIFT } from "../../../../_lib/schrift";
import s from "../../../../_ui/verwaltung.module.css";
import type { TemplatePositionZeile } from "../../../../_lib/lesepfade/fahrzeuge";

const SOLL_DEBOUNCE_MS = 400;

/**
 * ⚠️ EIGENSTAENDIG DEKLARIERT, NICHT AUS `SollEditor.tsx` IMPORTIERT.
 * `Select showSearch` filtert ohne `filterOption` nur ueber `label` — das Fach
 * fiele weg, und „C3" faende den Artikel nicht. Die gleichnamige Funktion in
 * `fahrzeuge/[id]/SollEditor.tsx` ist eine ZWEITE Deklaration; ein Import aus
 * einem Routenordner in einen anderen waere eine Kopplung ohne Nutzen.
 */
export function fachFilter(eingabe: string, option?: { label?: string; keywords?: string }): boolean {
  return `${option?.label ?? ""} ${option?.keywords ?? ""}`.toLowerCase()
    .includes(eingabe.trim().toLowerCase());
}

export function TemplatePosEditor({
  templateId, positionen, artikel,
}: {
  templateId: string;
  positionen: TemplatePositionZeile[];
  artikel: { id: string; name: string; fach: string }[];
}) {
  const [neuFach, setNeuFach] = useState("");
  const [neuArtikel, setNeuArtikel] = useState<string | undefined>();
  const [neuSoll, setNeuSoll] = useState<number | null>(1);
  const [laeuft, start] = useTransition();
  // Lokale Spiegel: der Wert bleibt sofort sichtbar, waehrend der Commit laeuft.
  const [spiegel, setSpiegel] = useState<Record<string, number>>({});
  const timer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => () => { for (const t of Object.values(timer.current)) clearTimeout(t); }, []);

  function sollGeaendert(z: TemplatePositionZeile, wert: number | null) {
    if (wert === null) return;
    setSpiegel((s) => ({ ...s, [z.id]: wert }));
    clearTimeout(timer.current[z.id]);
    timer.current[z.id] = setTimeout(() => {
      void templatePositionSetzen({ id: z.id, templateId, fachLabel: z.fachLabel,
                                    artikelId: z.artikelId, soll: wert, sort: z.sort });
    }, SOLL_DEBOUNCE_MS);
  }

  return (
    <>
      <Table
        rowKey="id" pagination={false} scroll={{ x: "max-content" }}
        aria-label="Vorlagen-Positionen" dataSource={positionen}
        locale={{ emptyText: "Noch keine Position. Lege unten die erste an." }}
        columns={[
          { title: "Fach", dataIndex: "fachLabel",
            render: (v: string) => <span className={s.fach}>{v}</span> },
          { title: "Artikel", dataIndex: "artikelName" },
          { title: "Soll", dataIndex: "soll", align: "right" as const,
            render: (v: number, z) => (
              // AUTO-COMMITTEND, KEIN `Form.Item` und kein Absendeknopf: die
              // Zahl ist die ganze Eingabe, ein Formular darum waere ein
              // zweiter Klick fuer nichts (§6.4.4).
              <InputNumber size="small" min={1} max={9999}
                value={spiegel[z.id] ?? v} onChange={(w) => sollGeaendert(z, w)}
                aria-label={`Soll für ${z.artikelName}`} />
            ) },
          { title: "", dataIndex: "id",
            render: (_: string, z) => (
              // Fall 2 aus §6.4.5: die Zeile traegt nichts als ihre eigene
              // Sollzahl und steht in keiner Historie; wer sie versehentlich
              // entfernt, tippt sie in zehn Sekunden neu. Deshalb Popconfirm
              // und NICHT der LoeschDialog mit Abtippen.
              <Popconfirm title="Position entfernen?" okText="Entfernen" cancelText="Abbrechen"
                onConfirm={() => start(async () => { await templatePositionEntfernen({ id: z.id }); })}>
                <Button size="small" danger icon={<Ikone name="papierkorb" groesse={14} />}
                        aria-label={`${z.artikelName} aus Fach ${z.fachLabel} entfernen`} />
              </Popconfirm>
            ) },
        ]}
      />
      <Flex gap={8} wrap align="center" style={{ marginBlockStart: 12 }}>
        <input className={s.fach} placeholder="Fach" aria-label="Fach"
               value={neuFach} onChange={(e) => setNeuFach(e.target.value)}
               style={{ ...SCHRIFT.text, fontSize: 16, padding: "8px 10px" }} />
        <Select showSearch filterOption={fachFilter} value={neuArtikel} onChange={setNeuArtikel}
          placeholder="Artikel" aria-label="Artikel" style={{ minWidth: 240 }}
          options={artikel.map((a) => ({ value: a.id, label: a.name, keywords: a.fach }))} />
        <InputNumber min={1} max={9999} value={neuSoll} onChange={setNeuSoll} aria-label="Soll" />
        <Button type="primary" icon={<Ikone name="plus" groesse={16} />} loading={laeuft}
          disabled={!neuFach.trim() || !neuArtikel || !neuSoll}
          onClick={() => start(async () => {
            await templatePositionSetzen({ templateId, fachLabel: neuFach.trim(),
                                           artikelId: neuArtikel!, soll: neuSoll! });
            setNeuArtikel(undefined); setNeuSoll(1);
          })}>
          Position hinzufügen
        </Button>
      </Flex>
    </>
  );
}
```

- [ ] **Schritt 4: `TemplateAktionen.tsx` schreiben — die vier Bedienelemente**

Sie bedienen die §6-Tabellenzeilen **16, 17, 23 und 18**: Stift „Umbenennen" (`renameTemplate`),
`Switch` „aktiv" (`setTemplateAktiv`), „Auf alle Fahrzeuge übertragen" (`templateAufFahrzeugeSyncen`)
und in der Gefahrenzone `LoeschButton` (`deleteTemplate`).

```tsx
// verwaltung/(arbeit)/vorlagen/[id]/TemplateAktionen.tsx — "use client".
"use client";
import { useState, useTransition } from "react";
import { Alert, Button, Flex, Input, Modal, Space, Switch } from "antd";
import { deleteTemplate, renameTemplate, setTemplateAktiv, templateAufFahrzeugeSyncen }
  from "../../../../_actions/templates";
import { LoeschButton } from "../../../../_ui/LoeschButton";
import { Ikone } from "../../../../_ui/ikonen";

/**
 * ⚠️ `LoeschButton` RUFT HIER `deleteTemplate`, NICHT `loescheElement`. Es gibt
 * keine `ElementArt` „template" (§6, „Die Zuordnung") — der Dialog nimmt seine
 * Actions deshalb als PROPS entgegen und importiert sie nicht.
 *
 * ⚠️ UND ES GIBT KEINE VORPRUEFUNG. `pruefeLoeschbar` kennt die sechs Arten aus
 * `loeschen.ts`; „template" ist keine davon. Statt einer Vorpruefung traegt der
 * Dialog den HINWEIS, was das Loeschen mit den verknuepften Fahrzeugen macht —
 * `pruefen` liefert deshalb fest „loeschbar", und `hinweis` sagt, was folgt.
 *
 * Der Fehler kommt ueberall als RUECKGABEWERT an, nie als Wurf, und wird als
 * `Alert type="warning"` gezeigt — `type="error"` sieht in dieser Suite aus wie
 * eine Primaeraktion (`colorError === colorPrimary`, Falle 3).
 */
export function TemplateAktionen({
  id, name, aktiv, fahrzeuge,
}: {
  id: string;
  name: string;
  aktiv: boolean;
  fahrzeuge: number;
}) {
  const [umbenennenOffen, setUmbenennenOffen] = useState(false);
  const [neuerName, setNeuerName] = useState(name);
  const [fehler, setFehler] = useState<string | null>(null);
  const [syncText, setSyncText] = useState<string | null>(null);
  const [laeuft, start] = useTransition();

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Flex gap={8} wrap align="center">
        {/* Zeile 16 der §6-Tabelle */}
        <Button icon={<Ikone name="stift" groesse={16} />}
                onClick={() => { setNeuerName(name); setUmbenennenOffen(true); }}>
          Umbenennen
        </Button>

        {/* Zeile 17 */}
        <Space>
          <Switch checked={aktiv} loading={laeuft} aria-label="Vorlage aktiv"
            onChange={(neu) => start(async () => {
              const erg = await setTemplateAktiv({ id, aktiv: neu });
              setFehler(erg.ok ? null : erg.fehler);
            })} />
          <span>{aktiv ? "aktiv" : "inaktiv"}</span>
        </Space>

        {/* Zeile 23 — das SyncErgebnis wird als Text gezeigt, nicht verschluckt */}
        <Button icon={<Ikone name="erneut" groesse={16} />} loading={laeuft}
          onClick={() => start(async () => {
            const erg = await templateAufFahrzeugeSyncen({ templateId: id });
            if (!erg.ok) { setFehler(erg.fehler); setSyncText(null); return; }
            setFehler(null);
            setSyncText(
              `${erg.wert.fahrzeuge} Fahrzeug(e): ${erg.wert.hinzugefuegt} hinzugefügt, ` +
              `${erg.wert.aktualisiert} aktualisiert, ${erg.wert.uebersprungen} übersprungen, ` +
              `${erg.wert.entfernt} entfernt, ${erg.wert.losgeloest} losgelöst.`,
            );
          })}>
          Auf alle Fahrzeuge übertragen
        </Button>
      </Flex>

      {syncText ? <span>{syncText}</span> : null}
      {fehler ? <Alert type="warning" showIcon={false} message={fehler} /> : null}

      {/* Zeile 18 — die Gefahrenzone */}
      <LoeschButton
        name={name}
        typLabel="Vorlage"
        hinweis={
          `${fahrzeuge} Fahrzeug(e) werden von dieser Vorlage gelöst; ihre Positionen bleiben ` +
          `als individuelle Bestückung erhalten.`
        }
        // `Loeschbarkeit` ist `{ loeschbar: true }` oder
        // `{ loeschbar: false; grund; kannDeaktivieren }`. Hier steht fest
        // `loeschbar: true` — es gibt keine ElementArt „template" und damit
        // keine Vorpruefung; die Folge steht stattdessen im `hinweis`.
        pruefen={async () => ({ loeschbar: true })}
        onLoeschen={async () => { await deleteTemplate({ id }); }}
      />

      <Modal open={umbenennenOffen} title="Vorlage umbenennen" okText="Speichern"
        cancelText="Abbrechen" confirmLoading={laeuft}
        onCancel={() => setUmbenennenOffen(false)}
        onOk={() => start(async () => {
          const erg = await renameTemplate({ id, name: neuerName.trim() });
          if (!erg.ok) { setFehler(erg.fehler); return; }
          setFehler(null); setUmbenennenOffen(false);
        })}>
        <Input value={neuerName} aria-label="Name der Vorlage"
               onChange={(e) => setNeuerName(e.target.value)} />
      </Modal>
    </Space>
  );
}
```

- [ ] **Schritt 5: `page.tsx` schreiben — der Lesepfad und die zwei Inseln**

```tsx
// verwaltung/(arbeit)/vorlagen/[id]/page.tsx — RSC, KEINE Insel.
import { notFound } from "next/navigation";
import { Card, Table } from "antd";
import Link from "next/link";
import { getDb } from "../../../../_db/client";
import { templateDetail } from "../../../../_lib/lesepfade/fahrzeuge";
import { artikelListe } from "../../../../_lib/lesepfade/artikel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { Chip } from "../../../../_ui/Chip";
import { TemplatePosEditor } from "./TemplatePosEditor";
import { TemplateAktionen } from "./TemplateAktionen";

/**
 * ⚠️ BROTKRUME IST HIER PFLICHT. `aktiverEintrag` markiert eine Detailseite
 * NICHT (§6.3.3) — ohne die Brotkrume hat diese Seite keinen sichtbaren
 * Rueckweg und keine Ortsangabe in der Leiste.
 *
 * ⚠️ KEIN `@ant-design/icons`, KEIN Compound-Zugriff (`Card.Meta`,
 * `Table.Column`, `Typography.Title`) — beides ist in einer Server Component
 * HTTP 500 (Fallen 1 und 7) und wird von keinem Gate der Suite gefunden.
 */
export default async function VorlageDetailSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const detail = templateDetail(db, id);
  if (!detail) notFound();

  // `artikelListe(db)` liefert OHNE `inklInaktiv` nur aktive Artikel — genau
  // richtig: ein inaktiver Artikel in einer Vorlage saete sich ueber den Sync
  // auf jedes verknuepfte Fahrzeug aus.
  const artikel = artikelListe(db).map((a) => ({ id: a.id, name: a.name, fach: a.fach }));

  return (
    <>
      <Brotkrume href="/m/lagerbuch/verwaltung/vorlagen">Alle Vorlagen</Brotkrume>
      <SeitenKopf
        titel={detail.name}
        beschreibung={
          <>
            {detail.positionen.length} Position(en) · {detail.fahrzeuge.length} verknüpfte(s)
            Fahrzeug(e) {detail.aktiv ? null : <Chip ton="grau">inaktiv</Chip>}
          </>
        }
      />

      <Card title="Positionen" style={{ marginBlockEnd: 16 }}>
        <TemplatePosEditor
          templateId={detail.id}
          positionen={detail.positionen}
          artikel={artikel}
        />
      </Card>

      <Card title="Verknüpfte Fahrzeuge" style={{ marginBlockEnd: 16 }}>
        <Table
          rowKey="id" pagination={false} scroll={{ x: "max-content" }}
          aria-label="Verknüpfte Fahrzeuge" dataSource={detail.fahrzeuge}
          locale={{ emptyText: "Kein Fahrzeug nutzt diese Vorlage." }}
          columns={[
            { title: "Fahrzeug", dataIndex: "name",
              render: (v: string, f) => (
                <Link href={`/m/lagerbuch/verwaltung/fahrzeuge/${f.id}`}>
                  {v}{f.kennung ? ` (${f.kennung})` : ""}
                </Link>
              ) },
            { title: "Status", dataIndex: "aktiv",
              render: (v: boolean) => v ? null : <Chip ton="grau">inaktiv</Chip> },
          ]}
        />
      </Card>

      <Card title="Aktionen">
        <TemplateAktionen
          id={detail.id}
          name={detail.name}
          aktiv={detail.aktiv}
          fahrzeuge={detail.fahrzeuge.length}
        />
      </Card>
    </>
  );
}
```

- [ ] **Schritt 6: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/[id]/TemplatePosEditor.test.tsx"
```

**Grün.** Alle fünf Fälle laufen durch.

- [ ] **Schritt 7: Gates und Abruf**

```bash
pnpm typecheck && pnpm lint && pnpm build
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://lagerbuch.localtest.me:3000/verwaltung/vorlagen/<eine-echte-id>"   # erwartet 200
```

⚠️ **Der Abruf ist nicht optional.** Ein Compound-Zugriff oder ein `@ant-design/icons`-Import in
dieser RSC ergibt HTTP 500, und weder `typecheck` noch `build` noch Vitest sehen ihn (Fallen 1 und 7).

- [ ] **Schritt 8: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/[id]/"
rtk git commit -m "feat(lagerbuch): /verwaltung/vorlagen/[id] — Positionen, Aktionen, Loeschen

Vier Spalten, auto-committende Soll-Menge ohne Form.Item, Zeilenaktionen mit
size=small, Popconfirm statt Modal (Fall 2 aus §6.4.5: die Zeile traegt nichts
als ihre eigene Sollzahl).

LoeschButton art='template' ruft deleteTemplate und NICHT loescheElement — es
gibt keine ElementArt 'template'. Statt der Vorpruefung traegt der Dialog den
Hinweis, dass N Fahrzeuge geloest werden und ihre Positionen behalten.

Brotkrume Pflicht: aktiverEintrag markiert diese Seite nicht."
```

---

### Task 135: `/verwaltung/checks` — Regime B, Deckel 50, sichtbar gemacht

**Files:** Create `verwaltung/(arbeit)/checks/page.tsx`, `.../ChecksFilter.tsx`;
Test `.../ChecksFilter.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/checks.ts` (T49) — `checkHistorie(db, { fahrzeugId, von,
bis, grenze })` → `{ zeilen, mehrVorhanden }`; `_lib/lesepfade/fahrzeuge.ts` — `fahrzeugListe`;
`_lib/format.ts` — `zeitraumAus`; `_lib/grenzen.ts` (T32) — `CHECK_GRENZE` (= 50);
`_ui/useUrlFilter`, `_ui/Trefferanzeige`, `_ui/Chip`. Produces `/verwaltung/checks`.

**Spalten, abgelesen aus `checks/page.tsx:38-56`:**

| # | Titel | Anmerkung |
|---|---|---|
| 1 | Fahrzeug | `<Link href={`/verwaltung/checks/${id}`}>` |
| 2 | Abgeschlossen | `completedAt`, Mono; sonst „—" |
| 3 | Ergebnis | Chip-Gruppe: „N aus Handlager nachgefüllt" (rot) · „N korrigiert" (gelb) · „N fehlt weiterhin" (rot) · „N Gerät(e) auffällig" (rot) · „N Flasche(n) niedrig" (rot) · sonst „vollständig" (ok) |
| 4 | Positionen | rechtsbündig, `tabular-nums` |

⚠️ **Der Deckel 50 wird SICHTBAR** (§6.9.3, §6.15 Auflage 11). Der Bestand nennt ihn **an keiner
Stelle** — „wer nur das Journal anfasst, lässt die Seite zurück, die ihre Unvollständigkeit gar nicht
erwähnt". Verbindlich: bei `mehrVorhanden` **„Neueste 50 von mehr Treffern — Zeitraum eingrenzen"**,
sonst **„N Treffer"**.
⚠️ **`pagination={false}` ist hier die Aussage selbst.** Ein `<Table dataSource={checks} />` **ohne**
`pagination`-Angabe erzeugt von selbst einen Seitenumbruch über einem **Ausschnitt**: der Pager sagte
„10 von 50", während dahinter fünfhundert Checks liegen.
⚠️ **Zwei `DatePicker`, kein `RangePicker`** (§6.9.2 Punkt 4): `von` und `bis` sind zwei
**unabhängige** URL-Parameter, einzeln setzbar und einzeln leer.
⚠️ **Verworfene Datumsgrenzen werden ANGEZEIGT** (§6.9.2 Punkt 5, §5.14.2). `zeitraumAus` liefert
`hinweise[]`; sie stehen als Text mit 3px linker Kante an der Filterleiste — **kein
`Alert type="error"`**.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";
import { ChecksFilter, deckelText } from "./ChecksFilter";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }), usePathname: () => "/verwaltung/checks" }));
afterEach(async () => { replace.mockClear(); await unmount(); });

describe("deckelText", () => {
  it("nennt den Deckel NUR, wenn er zugeschlagen hat", () => {
    // Der Bestand nennt die 50 an keiner Stelle — wer nur das Journal
    // anfaszt, laeszt die Seite zurueck, die ihre Unvollstaendigkeit gar nicht
    // erwaehnt (§6.9.3).
    expect(deckelText(50, true)).toBe("Neueste 50 von mehr Treffern — Zeitraum eingrenzen");
    expect(deckelText(3, false)).toBe("3 Treffer");
    expect(deckelText(1, false)).toBe("1 Treffer");
  });
});

describe("ChecksFilter", () => {
  it("benutzt zwei DatePicker und KEINEN RangePicker", async () => {
    // Ein RangePicker machte aus zwei unabhaengigen URL-Parametern ein
    // Wertepaar — „nur ab dem 1.3." waere nicht mehr ausdrueckbar.
    await mount(<ChecksFilter fz="" von="" bis="" fahrzeuge={[]} hinweise={[]} />);
    expect(exists(".ant-picker-range")).toBe(false);
    expect(document.querySelectorAll(".ant-picker").length).toBe(2);
  });

  it("das Fahrzeug-Auswahlfeld findet ueber das KENNZEICHEN", async () => {
    const { fahrzeugFilter } = await import("./ChecksFilter");
    // ChecksFilter.tsx:27 sucht heute ueber `keywords` — `Select showSearch`
    // kennt das Feld nicht und filterte sonst nur ueber den Namen.
    expect(fahrzeugFilter("UE-RK", { label: "RTW 1", keywords: "UE-RK 1234" })).toBe(true);
    expect(fahrzeugFilter("MTW", { label: "RTW 1", keywords: "UE-RK 1234" })).toBe(false);
  });

  it("zeigt eine verworfene Datumsgrenze an — als Text, nicht als Alert type=error", async () => {
    await mount(<ChecksFilter fz="" von="unsinn" bis="" fahrzeuge={[]}
      hinweise={["Das Datum in der Adresse ist ungültig und wurde ignoriert."]} />);
    expect(document.body.textContent).toContain("ungültig und wurde ignoriert");
    expect(exists(".ant-alert-error")).toBe(false);
  });

  it("schreibt Aenderungen per replace in die URL", async () => {
    await mount(<ChecksFilter fz="" von="" bis="" fahrzeuge={[]} hinweise={[]} />);
    const { zuruecksetzen } = await import("./ChecksFilter");
    zuruecksetzen(() => replace("/verwaltung/checks", { scroll: false }));
    expect(replace).toHaveBeenCalledWith("/verwaltung/checks", { scroll: false });
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/ChecksFilter.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./ChecksFilter"`.

- [ ] **Schritt 3: `ChecksFilter.tsx` schreiben**

```tsx
"use client";
import { DatePicker, Flex, Select } from "antd";
import dayjs from "dayjs";
import { useUrlFilter } from "../../../_ui/useUrlFilter";
import { SCHRIFT } from "../../../_lib/schrift";
import s from "../../../_ui/verwaltung.module.css";

/** Der bedingte Beschreibungstext (§6.9.3). */
export function deckelText(gezeigt: number, mehrVorhanden: boolean): string {
  return mehrVorhanden
    ? "Neueste 50 von mehr Treffern — Zeitraum eingrenzen"
    : `${gezeigt} Treffer`;
}

/** `Select showSearch` kennt `keywords` nicht — ohne dies faellt das Kennzeichen weg. */
export function fahrzeugFilter(eingabe: string, option?: { label?: string; keywords?: string }) {
  return `${option?.label ?? ""} ${option?.keywords ?? ""}`.toLowerCase()
    .includes(eingabe.trim().toLowerCase());
}

/** Nur fuer den Test: der Ruecksetz-Weg ist ein leeres Objekt an `useUrlFilter`. */
export function zuruecksetzen(setzen: () => void) { setzen(); }

export function ChecksFilter({
  fz, von, bis, fahrzeuge, hinweise,
}: {
  fz: string; von: string; bis: string;
  fahrzeuge: { id: string; name: string; kennung: string | null }[];
  hinweise: string[];
}) {
  const setzen = useUrlFilter();
  const schreibe = (teil: Partial<{ fz: string; von: string; bis: string }>) =>
    setzen({ fz, von, bis, ...teil });

  return (
    <Flex vertical gap={8} style={{ marginBlockEnd: 12 }}>
      <Flex gap={12} wrap align="center">
        <Select
          showSearch allowClear filterOption={fahrzeugFilter}
          value={fz || undefined} onChange={(v) => schreibe({ fz: v ?? "" })}
          placeholder="Alle Fahrzeuge" aria-label="Fahrzeug"
          style={{ minWidth: 220 }}
          options={fahrzeuge.map((f) => ({ value: f.id, label: f.name, keywords: f.kennung ?? "" }))}
        />
        {/* ZWEI DatePicker, kein RangePicker: `von` und `bis` sind zwei
            UNABHAENGIGE URL-Parameter (§6.9.2, Punkt 4). Die gegenseitige
            Begrenzung geht nicht verloren, sie wechselt nur den Traeger. */}
        <DatePicker
          value={von ? dayjs(von) : null} format="YYYY-MM-DD" aria-label="Zeitraum von"
          disabledDate={(d) => (bis ? d.isAfter(dayjs(bis)) : false)}
          onChange={(d) => schreibe({ von: d ? d.format("YYYY-MM-DD") : "" })}
        />
        <DatePicker
          value={bis ? dayjs(bis) : null} format="YYYY-MM-DD" aria-label="Zeitraum bis"
          disabledDate={(d) => (von ? d.isBefore(dayjs(von)) : false)}
          onChange={(d) => schreibe({ bis: d ? d.format("YYYY-MM-DD") : "" })}
        />
      </Flex>
      {hinweise.map((h) => (
        // Text mit 3px linker Kante, KEIN `Alert type="error"` (§6.6.5): das
        // ist eine Aussage ueber die Adresszeile, keine Stoerung.
        <div key={h} className={s.infobox} style={SCHRIFT.neben}>{h}</div>
      ))}
    </Flex>
  );
}
```

- [ ] **Schritt 4: `page.tsx` schreiben und committen**

```tsx
import Link from "next/link";
import { Flex, Table } from "antd";
import { getDb } from "../../../_db/client";
import { checkHistorie } from "../../../_lib/lesepfade/checks";
import { fahrzeugListe } from "../../../_lib/lesepfade/fahrzeuge";
import { zeitraumAus } from "../../../_lib/format";
import { CHECK_GRENZE } from "../../../_lib/grenzen";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { Chip } from "../../../_ui/Chip";
import { ChecksFilter, deckelText } from "./ChecksFilter";
import { SCHRIFT } from "../../../_lib/schrift";
import s from "../../../_ui/verwaltung.module.css";

export const dynamic = "force-dynamic";

/**
 * REGIME B — der Filterzustand lebt in der URL, damit die Suche ueber die
 * GESAMTE Historie geht und nicht nur im geladenen Ausschnitt (§6.9.1). Kein
 * Regimewechsel beim Port: wer das in antds `Table`-eigene Filter legte, suchte
 * in den geladenen 50 Zeilen.
 *
 * ⚠️ DIE 50 WERDEN SICHTBAR (§6.9.3). Der Bestand nennt sie an KEINER Stelle —
 * „die Checks-Grenze ist der strengere Fall, nicht der harmlosere".
 *
 * ⚠️ `pagination={false}` IST HIER DIE AUSSAGE. Ohne die Angabe erzeugte antd
 * von selbst einen Seitenumbruch ueber einem AUSSCHNITT: der Pager saegte
 * „10 von 50", waehrend dahinter fuenfhundert Checks liegen.
 */
export default async function ChecksSeite({
  searchParams,
}: {
  searchParams: Promise<{ fz?: string; von?: string; bis?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const fahrzeuge = fahrzeugListe(db)
    .map((f) => ({ id: f.id, name: f.name, kennung: f.kennung }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const fz = fahrzeuge.some((f) => f.id === sp.fz) ? sp.fz! : "";
  const zeitraum = zeitraumAus(sp.von, sp.bis);
  const { zeilen, mehrVorhanden } = checkHistorie(db, {
    fahrzeugId: fz || undefined, von: zeitraum.von, bis: zeitraum.bis, grenze: CHECK_GRENZE,
  });

  return (
    <>
      <SeitenKopf titel="Fahrzeug-Checks"
                  beschreibung={deckelText(zeilen.length, mehrVorhanden)} />
      <ChecksFilter fz={fz} von={sp.von ?? ""} bis={sp.bis ?? ""}
                    fahrzeuge={fahrzeuge} hinweise={zeitraum.hinweise} />
      <Table
        rowKey="id" pagination={false} scroll={{ x: "max-content" }}
        aria-label="Fahrzeug-Checks" dataSource={zeilen}
        locale={{ emptyText: fz || sp.von || sp.bis
          ? "Kein Check passt zu Fahrzeug und Zeitraum."
          : "Noch kein abgeschlossener Fahrzeug-Check." }}
        columns={[
          { title: "Fahrzeug", dataIndex: "fahrzeugName",
            render: (v: string, z) => (
              <Link href={`/verwaltung/checks/${z.id}`} style={{ fontWeight: 600 }}>{v}</Link>
            ) },
          { title: "Abgeschlossen", dataIndex: "completedAt",
            render: (d: Date | null) => (
              <span className={s.jts}>
                {d ? d.toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "—"}
              </span>
            ) },
          { title: "Ergebnis", dataIndex: "positionen",
            render: (_: number, z) => {
              const alles = z.nachgefuelltGesamt + z.korrigiertGesamt + z.offenGesamt
                + z.geraeteAuffaellig + z.flaschenAuffaellig;
              return (
                <Flex gap={6} wrap>
                  {z.nachgefuelltGesamt > 0
                    ? <Chip ton="rot">{z.nachgefuelltGesamt} aus Handlager nachgefüllt</Chip> : null}
                  {z.korrigiertGesamt > 0
                    ? <Chip ton="gelb">{z.korrigiertGesamt} korrigiert</Chip> : null}
                  {z.offenGesamt > 0
                    ? <Chip ton="rot" zeichen="warnung">{z.offenGesamt} fehlt weiterhin</Chip> : null}
                  {z.geraeteAuffaellig > 0
                    ? <Chip ton="rot">{z.geraeteAuffaellig} Gerät(e) auffällig</Chip> : null}
                  {z.flaschenAuffaellig > 0
                    ? <Chip ton="rot" zeichen="sauerstoff">{z.flaschenAuffaellig} Flasche(n) niedrig</Chip> : null}
                  {alles === 0 ? <Chip ton="ok">vollständig</Chip> : null}
                </Flex>
              );
            } },
          { title: "Positionen", dataIndex: "positionen", align: "right" as const,
            render: (v: number) => <span style={SCHRIFT.mono}>{v}</span> },
        ]}
      />
    </>
  );
}
```

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/ChecksFilter.test.tsx"
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/page.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/ChecksFilter.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/ChecksFilter.test.tsx"
rtk git commit -m "feat(lagerbuch): /verwaltung/checks — Regime B, Deckel 50 sichtbar

Der Bestand nennt seine 50 an KEINER Stelle; der bedingte Beschreibungstext
macht sie sichtbar. pagination={false} ist hier die Aussage selbst: ohne die
Angabe erzeugte antd einen Seitenumbruch ueber einem Ausschnitt.

Zwei DatePicker statt RangePicker — von und bis sind zwei unabhaengige
URL-Parameter; die gegenseitige Begrenzung wechselt nur den Traeger.

Verworfene Datumsgrenzen werden angezeigt (zeitraumAus, Teil 3), als Text mit
linker Kante und nicht als Alert type=error.

Select showSearch mit filterOption ueber label + keywords: sonst tippt jemand
ein Kennzeichen und findet nichts."
```

---

### Task 136: `/verwaltung/checks/[id]` — der Bericht, RSC ohne Insel

**Files:** Create `verwaltung/(arbeit)/checks/[id]/page.tsx`; Test `.../page.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/checks.ts` — `checkDetail(db, id, now?)`; `_ui/Brotkrume`,
`_ui/Kachel`, `_ui/Chip`; `antd` — `Card`, `Table`, `Alert`, `Row`, `Col`. Produces
`/verwaltung/checks/[id]`.

**Fünf Abschnitte, jeder mit eigener Zeilenform** (§6.4.2 — deshalb `Card` + eigenes Markup, keine
einheitliche Tabelle): Abgleich · **Nachfüllung** · Geräte · Sauerstoff · Verfall.

⚠️ **„Abgleich" und „Nachfüllung" sind zwei Abschnitte und nicht einer**, weil sie **zwei
verschiedene Auflösungen** desselben Checks zeigen und aus zwei verschiedenen Feldern von
`CheckDetail` kommen:

| Abschnitt | Quelle | Auflösung | Was er beantwortet |
|---|---|---|---|
| Abgleich | `CheckDetail.artikel` (`CheckArtikelDetail[]`) | **je Artikel**, über alle Fächer summiert | „Wieviel fehlte, wieviel kam nach, wieviel fehlt noch?" |
| Nachfüllung | `CheckDetail.positionen` (`CheckPositionDetail[]`) | **je (Fach, Artikel)** | „In WELCHEM Fach stand die Lücke?" |

Wer die beiden zusammenlegt, verliert genau eine Angabe: **das Fach.** Der Bestand ist pro
(Fahrzeug, Artikel), das Soll ist pro (Fahrzeug, Fach, Artikel) — derselbe Artikel darf in mehreren
Fächern stehen (Teil 3, §5.7.1). Eine Nachfüllung von 3 sagt ohne die Fachzeile nicht, ob im Fach A1
drei fehlten oder in A1 und C3 je eineinhalb, und wer nachfüllen geht, steht vor dem falschen Fach.
⚠️ **Bei `altFormat` ist `positionen` leer** — die Einzelpositionen stecken nicht im alten Nutzlast-
Format. Der Abschnitt zeigt dann seinen `emptyText` und **keine erfundene Zeile**; der Hinweis oben
erklärt bereits, warum.

⚠️ **Die Seite SCHREIBT AUS, dass die Verfall-Ampel gegen HEUTE gerechnet ist** (§5.6.3, §6.15
Auflage 13) — nicht gegen den Check-Zeitpunkt. Ohne den Satz zeigt derselbe Check je nach Abrufdatum
verschiedene Ampeln, und niemand versteht warum.
⚠️ **`altFormat` zeigt einen HINWEISTEXT, keine leere Tabelle** (§4.10, §6.15 Auflage 14):
`Alert type="warning"` — **nie** `type="error"` (§6.6.5).
⚠️ **Brotkrume Pflicht.**
⚠️ **Chip statt `Tag`** — die Zustände „In Ordnung" / „Gebrauchsspuren" / „Defekt" sind Ampelwerte.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/checks/[id]/page.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const QUELLE = readFileSync(
  "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/[id]/page.tsx", "utf8");

describe("Check-Detailseite: die vier Auflagen", () => {
  it("schreibt aus, dass die Verfall-Ampel gegen HEUTE rechnet", () => {
    // Ohne den Satz zeigt derselbe Check je nach Abrufdatum verschiedene
    // Ampeln, und niemand versteht warum (§5.6.3).
    expect(QUELLE).toMatch(/gegen heute/i);
  });

  it("meldet altFormat als Alert type=\"warning\", nie als error", () => {
    expect(QUELLE).toMatch(/altFormat/);
    expect(QUELLE).toMatch(/type="warning"/);
    expect(QUELLE).not.toMatch(/type="error"/);
  });

  it("traegt eine Brotkrume", () => {
    expect(QUELLE).toMatch(/<Brotkrume href="\/verwaltung\/checks">/);
  });

  it("benutzt Chip und kein antd-Tag", () => {
    expect(QUELLE).toMatch(/<Chip/);
    expect(QUELLE).not.toMatch(/from "antd";[\s\S]*\bTag\b/);
  });

  it("ist eine Server Component ohne Insel", () => {
    expect(QUELLE.slice(0, 200)).not.toMatch(/["']use client["']/);
  });

  it("traegt ALLE FUENF Abschnitte, Nachfuellung eingeschlossen", () => {
    /*
     * DER ABSCHNITT, DER BEIM ABSCHREIBEN VERLORENGEHT. „Abgleich" liest
     * `c.artikel` (je Artikel summiert), „Nachfuellung" liest `c.positionen`
     * (je Fach). Faellt der zweite weg, sieht die Seite VOLLSTAENDIG aus und
     * verschweigt genau eine Angabe: das FACH. Wer nachfuellen geht, steht
     * dann vor dem falschen Fach.
     */
    for (const titel of ["Abgleich", "Nachfüllung", "Geräte", "Sauerstoff", "Verfall"]) {
      expect(QUELLE, `Abschnitt „${titel}" fehlt`).toMatch(new RegExp(`title="${titel}`));
    }
    expect(QUELLE).toMatch(/dataSource=\{c\.positionen\}/);
    expect(QUELLE).toMatch(/dataSource=\{c\.artikel\}/);
  });

  it("nennt die Felder von CheckDetail so, wie Teil 3 sie deklariert", () => {
    // `verfaelle` und `gebucht` gibt es nicht — die Felder heiszen `verfall`
    // und `nachfuellGebucht`. TypeScript faende es, ein Quelltext-Scan ist
    // aber der billigere Ort dafuer, und er laeuft auch ohne Build.
    expect(QUELLE).not.toMatch(/c\.verfaelle/);
    expect(QUELLE).toMatch(/dataSource=\{c\.verfall\}/);
    expect(QUELLE).toMatch(/"nachfuellGebucht"/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/[id]/page.test.tsx"
```

Erwartet: FAIL mit
`ENOENT: no such file or directory, open 'src/app/m/lagerbuch/verwaltung/(arbeit)/checks/[id]/page.tsx'`
— der `readFileSync` steht auf Modulebene, der Lauf bricht deshalb **vor** dem ersten `it` ab.

- [ ] **Schritt 3: `page.tsx` schreiben — alle fünf Abschnitte**

```tsx
// verwaltung/(arbeit)/checks/[id]/page.tsx — RSC, KEINE Insel.
import { notFound } from "next/navigation";
import { Alert, Card, Col, Row, Table } from "antd";
import { getDb } from "../../../../_db/client";
import { checkDetail } from "../../../../_lib/lesepfade/checks";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { Kachel } from "../../../../_ui/Kachel";
import { Chip } from "../../../../_ui/Chip";
import { ampelTon } from "../../../../_lib/format";
import { SCHRIFT } from "../../../../_lib/schrift";

export const dynamic = "force-dynamic";

export default async function CheckDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = checkDetail(getDb(), id, new Date());
  if (!c) notFound();

  return (
    <>
      <Brotkrume href="/verwaltung/checks">Fahrzeug-Checks</Brotkrume>
      <SeitenKopf
        titel={c.fahrzeugName}
        beschreibung={
          <>
            Abgeschlossen{" "}
            {c.completedAt?.toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) ?? "—"} ·{" "}
            {/* ⚠️ §5.6.3, Auflage 13: OHNE diesen Satz zeigt derselbe Check je
                nach Abrufdatum verschiedene Ampeln. */}
            <strong>Die Verfall-Ampel unten ist gegen heute gerechnet, nicht gegen den
            Zeitpunkt des Checks.</strong>
          </>
        }
      />

      {/* ⚠️ §4.10, Auflage 14: ein altFormat-Check zeigt einen HINWEISTEXT,
          keine leere Tabelle. type="warning", nie type="error" (§6.6.5) — ein
          zweites Rot neben den Ampel-Chips gehoerte der Fehlermeldung statt
          dem abgelaufenen Medikament. */}
      {c.altFormat ? (
        <Alert
          type="warning" showIcon={false} style={{ marginBlockEnd: 16 }}
          message="Dieser Check stammt aus dem alten Format. Die Einzelpositionen sind darin nicht enthalten; die Summen unten sind vollständig."
        />
      ) : null}

      {/* Die vier Zahlen kommen aus `c.summe` (`CheckSummen`, Teil 3 T43) und
          NICHT aus `c.positionen.length`: `summiereCheckErgebnis` ist die eine
          Stelle, an der Historie und Detail dieselben Zahlen bekommen. Bei
          `altFormat` ist `positionen` leer, `summe.positionen` aber gefuellt —
          ein `.length` zeigte dort eine glatte 0. */}
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={6}><Kachel zahl={c.summe.positionen} beschriftung="geprüfte Positionen" /></Col>
        <Col xs={24} md={6}><Kachel zahl={c.summe.nachgefuellt} beschriftung="nachgefüllt"
          ton={c.summe.nachgefuellt ? "rot" : "ok"} /></Col>
        <Col xs={24} md={6}><Kachel zahl={c.summe.korrigiert} beschriftung="korrigiert"
          ton={c.summe.korrigiert ? "gelb" : "ok"} /></Col>
        <Col xs={24} md={6}><Kachel zahl={c.summe.offen} beschriftung="fehlt weiterhin"
          ton={c.summe.offen ? "rot" : "ok"} /></Col>
      </Row>

      {/* ABSCHNITT 1 — je ARTIKEL, ueber alle Faecher summiert. */}
      <Card title="Abgleich" style={{ marginBlockEnd: 16 }}>
        <Table rowKey="artikelId" pagination={false} scroll={{ x: "max-content" }}
          aria-label="Abgleich" dataSource={c.artikel}
          locale={{ emptyText: "Keine Positionen erfasst." }}
          columns={[
            { title: "Artikel", dataIndex: "artikelName" },
            { title: "Soll", dataIndex: "sollSumme", align: "right" as const,
              render: (v: number) => <span style={SCHRIFT.mono}>{v}</span> },
            { title: "Gezählt", dataIndex: "istSumme", align: "right" as const,
              render: (v: number) => <span style={SCHRIFT.mono}>{v}</span> },
            { title: "Korrigiert", dataIndex: "korrektur", align: "right" as const,
              render: (v: number) => <span style={SCHRIFT.mono}>{v}</span> },
            { title: "Nachgefüllt", dataIndex: "nachfuellGebucht", align: "right" as const,
              render: (v: number) => <span style={SCHRIFT.mono}>{v}</span> },
            { title: "Offen", dataIndex: "offen",
              render: (v: number) => v > 0
                ? <Chip ton="rot" zeichen="warnung">fehlt {v}</Chip>
                : <Chip ton="ok">vollständig</Chip> },
          ]} />
      </Card>

      {/* ABSCHNITT 2 — je (FACH, ARTIKEL). ⚠️ DER ABSCHNITT, DER BEIM
          ABSCHREIBEN VERLORENGEHT, und der einzige, der das FACH nennt.
          Das Soll ist pro (Fahrzeug, Fach, Artikel), der Bestand pro
          (Fahrzeug, Artikel) — derselbe Artikel darf in mehreren Faechern
          stehen (Teil 3, §5.7.1). Ohne diese Tabelle sagt „nachgefuellt: 3"
          nicht, VOR WELCHEM FACH man stehen muss.

          Bei `altFormat` ist `positionen` leer — dann greift der `emptyText`,
          und es wird KEINE Zeile erfunden. Der Hinweis oben hat den Grund
          bereits genannt. */}
      <Card title="Nachfüllung (je Fach)" style={{ marginBlockEnd: 16 }}>
        <Table rowKey={(z) => `${z.fachLabel}:${z.artikelId}`}
          pagination={false} scroll={{ x: "max-content" }}
          aria-label="Nachfüllung je Fach" dataSource={c.positionen}
          locale={{ emptyText: c.altFormat
            ? "Dieser Check stammt aus dem alten Format — Einzelpositionen sind darin nicht enthalten."
            : "Keine Einzelposition erfasst." }}
          columns={[
            { title: "Fach", dataIndex: "fachLabel",
              render: (v: string) => <span style={SCHRIFT.mono}>{v}</span> },
            { title: "Artikel", dataIndex: "artikelName",
              render: (v: string, z) => <>{v} <span style={SCHRIFT.neben}>{z.einheit}</span></> },
            { title: "Soll", dataIndex: "soll", align: "right" as const,
              render: (v: number) => <span style={SCHRIFT.mono}>{v}</span> },
            { title: "Gezählt", dataIndex: "ist", align: "right" as const,
              render: (v: number) => <span style={SCHRIFT.mono}>{v}</span> },
            // Die Luecke wird HIER gerechnet und nicht gelesen: `soll − ist`
            // ist die Fachluecke, waehrend `offen` im Abgleich die je Artikel
            // GEKLEMMTE Restmenge nach der Nachfuellung ist. Zwei verschiedene
            // Zahlen mit zwei verschiedenen Bedeutungen.
            { title: "Lücke im Fach", dataIndex: "soll",
              render: (_: number, z) => z.soll - z.ist > 0
                ? <Chip ton="rot" zeichen="warnung">{z.soll - z.ist} fehlten</Chip>
                : <Chip ton="ok">vollständig</Chip> },
          ]} />
      </Card>

      <Card title="Geräte" style={{ marginBlockEnd: 16 }}>
        <Table rowKey="geraetId" pagination={false} scroll={{ x: "max-content" }}
          aria-label="Geräte im Check" dataSource={c.geraete}
          locale={{ emptyText: "Keine Geräte in diesem Check." }}
          columns={[
            { title: "Gerät", dataIndex: "name" },
            { title: "Vorhanden", dataIndex: "vorhanden",
              render: (v: boolean) => v ? <Chip ton="ok">vorhanden</Chip>
                                        : <Chip ton="rot" zeichen="warnung">fehlt</Chip> },
            // „In Ordnung" / „Gebrauchsspuren" / „Defekt" sind Ampelwerte —
            // deshalb Chip und kein antd-Tag (§6.6.3).
            { title: "Zustand", dataIndex: "zustand",
              render: (v: string) => (
                <Chip ton={v === "Defekt" ? "rot" : v === "Gebrauchsspuren" ? "gelb" : "ok"}>{v}</Chip>
              ) },
            { title: "Bemerkung", dataIndex: "bemerkung",
              render: (v: string | null) => <span style={SCHRIFT.neben}>{v ?? "—"}</span> },
          ]} />
      </Card>

      <Card title="Sauerstoff" style={{ marginBlockEnd: 16 }}>
        <Table rowKey="flascheId" pagination={false} scroll={{ x: "max-content" }}
          aria-label="Sauerstoff im Check" dataSource={c.flaschen}
          locale={{ emptyText: "Keine Flaschen in diesem Check." }}
          columns={[
            { title: "Flasche", dataIndex: "name" },
            { title: "Druck", dataIndex: "druckBar", align: "right" as const,
              render: (v: number) => <span style={SCHRIFT.mono}>{v} bar</span> },
            // ⚠️ Keine Messung heiszt `ampel: null` — NICHT 0 % und nicht rot
            // (Teil 3, T52). Die Zeile sagt „Nennfuelldruck unbekannt".
            { title: "Füllstand", dataIndex: "prozent",
              render: (v: number | null, z) => v === null || z.ampel === null
                ? <Chip ton="grau">Nennfülldruck unbekannt</Chip>
                : <Chip ton={ampelTon(z.ampel)}>{v} %</Chip> },
          ]} />
      </Card>

      <Card title="Verfall (gegen heute gerechnet)">
        <Table rowKey="artikelId" pagination={false} scroll={{ x: "max-content" }}
          aria-label="Verfallsmeldungen des Checks" dataSource={c.verfall}
          locale={{ emptyText: "Keine Verfallsangabe in diesem Check." }}
          columns={[
            { title: "Artikel", dataIndex: "artikelName" },
            { title: "Verfall", dataIndex: "verfall",
              render: (v: string) => <span style={SCHRIFT.mono}>{v}</span> },
            { title: "Status", dataIndex: "text",
              render: (v: string, z) => <Chip ton={ampelTon(z.ampel)}>{v}</Chip> },
          ]} />
      </Card>
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/[id]/page.test.tsx"
```

**Grün.** Alle sieben Fälle laufen durch, einschließlich „trägt ALLE FÜNF Abschnitte".

- [ ] **Schritt 5: Gates und Abruf**

```bash
pnpm typecheck && pnpm lint && pnpm build
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://lagerbuch.localtest.me:3000/verwaltung/checks/<eine-echte-id>"   # erwartet 200
```

⚠️ **Der Abruf ist nicht optional.** Diese Seite ist eine reine Server Component mit fünf `Table`
und einem `Alert`; ein Compound-Zugriff (`Table.Column`, `Card.Meta`) oder ein Icon-Import ergibt
HTTP 500, den weder `typecheck` noch `build` noch Vitest sehen (Fallen 1 und 7).

- [ ] **Schritt 6: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/[id]/"
rtk git commit -m "feat(lagerbuch): /verwaltung/checks/[id] — der Bericht, RSC ohne Insel

Fuenf Abschnitte mit je eigener Zeilenform, deshalb Card + Table statt einer
einheitlichen Liste.

Abgleich und Nachfuellung sind ZWEI Abschnitte, weil sie zwei Aufloesungen
zeigen: c.artikel je Artikel ueber alle Faecher summiert, c.positionen je
(Fach, Artikel). Zusammengelegt ginge genau eine Angabe verloren — das FACH,
und wer nachfuellen geht, staende vor dem falschen.

Die Seite SCHREIBT AUS, dass die Verfall-Ampel gegen HEUTE gerechnet ist —
ohne den Satz zeigt derselbe Check je nach Abrufdatum verschiedene Ampeln.

altFormat wird ein Hinweistext, keine leere Tabelle; Alert type=warning, nie
type=error — ein zweites Rot neben den Ampel-Chips gehoerte der
Fehlermeldung statt dem abgelaufenen Medikament.

Keine O2-Messung heiszt 'Nennfuelldruck unbekannt', nicht 0 % und nicht rot."
```

---

### Task 137: `/verwaltung/bz` — BZ-Geräteliste

**Files:** Create `verwaltung/(arbeit)/bz/page.tsx`, `.../BzListe.tsx`, `.../NeuBzGeraet.tsx`;
Test `.../BzListe.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/bz.ts` (T51) — `bzGeraeteUebersicht`, `lagerortOptionen`;
`_actions/bz.ts` — `geraetSpeichern`; `_ui/Suchfeld`, `_ui/Trefferanzeige`, `_ui/Chip`.
Produces `/verwaltung/bz`.

**Spalten, abgelesen aus `BzListe.tsx:54-73`:**

| # | Titel | Anmerkung |
|---|---|---|
| 1 | Gerät | `<Link href={`/verwaltung/bz/${id}`}>` + Barcode in Mono |
| 2 | Standort | `lagerortName` |
| 3 | Fälligkeit | Chip mit `ampelTon`: „noch nie geprüft" / „überfällig (seit N Tagen)" / „heute fällig" / „fällig in N Tagen"; bei rot mit Zeichen `warnung` |
| 4 | Letzte Kontrolle | `fmtTs` oder „–" |
| 5 | Status | inaktiv-Chip |

**Suchfeldmenge (3 von 6):** Name · Barcode · Lagerort (`BzListe.tsx:22-30`).
**Filter:** fällig/überfällig · inaktive ausblenden.
**Sprung zum Scanner:** `<Button href="/verwaltung/bz/scan" icon={<Ikone name="scannen" />}>`.

⚠️ **`faelligText` wandert MIT** (`BzListe.tsx:11-16`) und liegt in der Insel, nicht in
`_lib/format.ts`: Teil 3s `format.ts` liefert `geraetFaelligChip` für **Geräte**, nicht für
BZ-Kontrollen — die Fristen sind verschieden (`BZ_KONTROLL_INTERVALL_TAGE: 31` gegen `MTK_WARN_TAGE:
30`).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/bz/BzListe.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, unmount, fill, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import { BzListe, sucheTrifft, faelligText } from "./BzListe";
import s from "../../../_ui/verwaltung.module.css";

vi.mock("../../../_actions/bz", () => ({ geraetSpeichern: async () => ({ ok: true, wert: { id: "x" } }) }));
const ZEILEN = [
  { id: "g1", name: "Accu-Chek", barcode: "SN-1", lagerortName: "Lager", aktiv: true,
    letzteKontrolle: new Date("2026-07-01T08:00:00Z"),
    faelligkeit: { ampel: "rot" as const, ueberfaellig: true, nieGeprueft: false, tageBisFaellig: -3,
                   faelligAm: new Date("2026-08-01T00:00:00Z") } },
];
afterEach(async () => { await unmount(); });

describe("BzListe", () => {
  it("traegt die fuenf abgelesenen Spalten", async () => {
    await mount(<BzListe zeilen={ZEILEN} lagerorte={[]} />);
    expect(queryAll("thead th").map((th) => th.textContent))
      .toEqual(["Gerät", "Standort", "Fälligkeit", "Letzte Kontrolle", "Status"]);
  });

  it("sucht ueber Name, Barcode UND Lagerort (3 von 6)", () => {
    expect(sucheTrifft(ZEILEN[0], "accu")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "SN-1")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "lager")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "RTW")).toBe(false);
  });

  it("faelligText nennt vier Zustaende beim Namen", () => {
    expect(faelligText({ nieGeprueft: true, ueberfaellig: false, tageBisFaellig: null }))
      .toBe("noch nie geprüft");
    expect(faelligText({ nieGeprueft: false, ueberfaellig: true, tageBisFaellig: -3 }))
      .toBe("überfällig (seit 3 Tagen)");
    expect(faelligText({ nieGeprueft: false, ueberfaellig: false, tageBisFaellig: 0 }))
      .toBe("heute fällig");
    expect(faelligText({ nieGeprueft: false, ueberfaellig: false, tageBisFaellig: 5 }))
      .toBe("fällig in 5 Tagen");
  });

  it("zeigt „X von Y\" erst beim Filtern", async () => {
    await mount(<BzListe zeilen={ZEILEN} lagerorte={[]} />);
    await fill("input[type='search']", "zzz");
    expect(query(`.${s.filtertreffer}`).textContent).toBe("0 von 1");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/BzListe.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./BzListe"`.

- [ ] **Schritt 3: `BzListe.tsx` schreiben**

```tsx
// BzListe.tsx — "use client".
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Checkbox, Flex, Table } from "antd";
import { falte } from "../../../_lib/suche";
import { ampelTon } from "../../../_lib/format";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import { NeuBzGeraet } from "./NeuBzGeraet";
import type { BzGeraetZeile } from "../../../_lib/lesepfade/bz";

/**
 * ⚠️ WANDERT MIT und bleibt HIER, nicht in `_lib/format.ts`: Teil 3s
 * `geraetFaelligChip` gilt fuer GERAETE (MTK/Ablaufdatum, 30 Tage Warnfrist),
 * nicht fuer BZ-Kontrollen (31-Tage-Intervall, 5 Tage Warnfrist). Ein
 * gemeinsamer Text behauptete gleiche Fristen.
 */
export function faelligText(f: { nieGeprueft: boolean; ueberfaellig: boolean;
                                 tageBisFaellig: number | null }): string {
  if (f.nieGeprueft) return "noch nie geprüft";
  if (f.ueberfaellig) return `überfällig (seit ${Math.abs(f.tageBisFaellig ?? 0)} Tagen)`;
  if (f.tageBisFaellig === 0) return "heute fällig";
  return `fällig in ${f.tageBisFaellig} Tagen`;
}

/** SUCHFELDMENGE 3 VON 6: Name · Barcode · Lagerort. */
export function sucheTrifft(z: BzGeraetZeile, begriff: string): boolean {
  const q = falte(begriff.trim());
  return !q || falte(`${z.name} ${z.barcode ?? ""} ${z.lagerortName}`).includes(q);
}

export function BzListe({
  zeilen, lagerorte,
}: {
  zeilen: BzGeraetZeile[];
  lagerorte: { id: string; name: string; typ: "lager" | "fahrzeug" }[];
}) {
  const [suche, setSuche] = useState("");
  const [nurFaellig, setNurFaellig] = useState(false);
  const [ohneInaktive, setOhneInaktive] = useState(false);
  const gefiltert = useMemo(() => zeilen.filter((z) => {
    if (ohneInaktive && !z.aktiv) return false;
    if (nurFaellig && z.faelligkeit.ampel === "gruen") return false;
    return sucheTrifft(z, suche);
  }), [zeilen, suche, nurFaellig, ohneInaktive]);

  return (
    <>
      <Flex gap={12} wrap align="center" style={{ marginBlockEnd: 12 }}>
        <Suchfeld wert={suche} onWert={setSuche} platzhalter="Gerät, Barcode oder Lagerort suchen…" />
        <Checkbox checked={nurFaellig} onChange={(e) => setNurFaellig(e.target.checked)}>
          fällig/überfällig
        </Checkbox>
        <Checkbox checked={ohneInaktive} onChange={(e) => setOhneInaktive(e.target.checked)}>
          inaktive ausblenden
        </Checkbox>
        <Trefferanzeige gezeigt={gefiltert.length} gesamt={zeilen.length} />
        <Button href="/verwaltung/bz/scan" icon={<Ikone name="scannen" groesse={16} />}>
          Scannen
        </Button>
        <NeuBzGeraet lagerorte={lagerorte} />
      </Flex>
      <Table
        rowKey="id" pagination={false} scroll={{ x: "max-content" }}
        aria-label="BZ-Geräte" dataSource={gefiltert}
        locale={{ emptyText: suche ? "Kein Gerät passt zu Suche und Filter."
                                   : "Noch keine BZ-Geräte. Lege oben das erste an." }}
        columns={[
          { title: "Gerät", dataIndex: "name",
            render: (v: string, z) => (
              <span>
                <Link href={`/verwaltung/bz/${z.id}`} style={{ fontWeight: 600 }}>{v}</Link>
                {z.barcode ? <span style={{ ...SCHRIFT.mono, marginInlineStart: 8 }}>{z.barcode}</span> : null}
              </span>
            ) },
          { title: "Standort", dataIndex: "lagerortName" },
          { title: "Fälligkeit", dataIndex: "faelligkeit",
            render: (_: unknown, z) => (
              <Chip ton={ampelTon(z.faelligkeit.ampel)}
                    zeichen={z.faelligkeit.ampel === "rot" ? "warnung" : undefined}>
                {faelligText(z.faelligkeit)}
              </Chip>
            ) },
          { title: "Letzte Kontrolle", dataIndex: "letzteKontrolle",
            render: (d: Date | null) => (
              <span style={SCHRIFT.mono}>
                {d ? d.toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "–"}
              </span>
            ) },
          { title: "Status", dataIndex: "aktiv",
            render: (v: boolean) => v ? null : <Chip ton="grau">inaktiv</Chip> },
        ]}
      />
    </>
  );
}
```

- [ ] **Schritt 4: `NeuBzGeraet.tsx` schreiben**

`NeuBzGeraet.tsx` ist ein `Modal` mit `Form` (Absendeknopf) und den Feldern Name, Barcode,
`Select` Standort, Streifen-Lot sowie den **beiden Referenzniveaus** — je Bezeichnung, Untergrenze
und Obergrenze; es ruft `geraetSpeichern` aus `_actions/bz.ts` und zeigt Feldfehler über
`form.setFields`.

⚠️ **Die `Form.Item name=`-Werte sind ZEICHENGLEICH zu `GeraetSchema` in T122** und heißen
`level1Label` · `level1Min` · `level1Max` · `level2Label` · `level2Min` · `level2Max`. Ein
selbsterfundenes `refNiedrigMin` o. ä. wäre **still**: `GeraetSchema` verwirft Unbekanntes, jedes
Feld ist `.optional()`, und `orNull(undefined)` macht daraus `null`. Ergebnis: das Gerät wird
angelegt, **ohne jede Referenzgrenze** — und `bewerteKontrolle` bewertet danach jede Kontrolle als
„nicht bewertbar", ohne dass irgendwo ein Fehler erscheint.
⚠️ **Die beiden `*Label` sind Pflichtfelder der Oberfläche, auch wenn Zod sie optional lässt.** T140
rendert sie als **Feldbeschriftung** am Messwert (`${level1.label ?? "Level 1"}${bereich(level1)}`);
ohne sie steht dort „Level 1" statt „L1", und die Kontrollperson vergleicht den Wert mit der
falschen Kontrolllösung.
⚠️ **`Form.Item` ist ein Compound-Zugriff und deshalb NUR in dieser Client-Insel erlaubt** (Falle 1).
Die Datei trägt `"use client"` als erste Zeile; ohne sie ergibt schon der Import HTTP 500.
⚠️ **`size` wird nirgends gesetzt** — `controlHeight: 56` ist bereits das richtige Maß, `size="large"`
wären 72px (Falle 4).

```tsx
// NeuBzGeraet.tsx — "use client".
"use client";
import { useState, useTransition } from "react";
import { Alert, Button, Form, Input, InputNumber, Modal, Select } from "antd";
import { geraetSpeichern } from "../../../_actions/bz";
import { Ikone } from "../../../_ui/ikonen";

/** ZEICHENGLEICH zu `GeraetSchema` (T122) — jeder abweichende Name ist still. */
type Werte = {
  name: string; barcode?: string; lagerortId: string; streifenLot?: string;
  level1Label?: string; level1Min?: number; level1Max?: number;
  level2Label?: string; level2Min?: number; level2Max?: number;
};

export function NeuBzGeraet({
  lagerorte,
}: {
  lagerorte: { id: string; name: string; typ: "lager" | "fahrzeug" }[];
}) {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const [form] = Form.useForm<Werte>();

  return (
    <>
      <Button type="primary" icon={<Ikone name="plus" groesse={16} />} onClick={() => setOffen(true)}>
        Neues BZ-Gerät
      </Button>
      <Modal open={offen} title="Neues BZ-Gerät" okText="Anlegen" cancelText="Abbrechen"
        confirmLoading={laeuft} onCancel={() => setOffen(false)}
        onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={(w) => start(async () => {
          const erg = await geraetSpeichern(w);
          if (erg.ok) { setFehler(null); setOffen(false); form.resetFields(); return; }
          // ⚠️ FELDFEHLER GEHEN ANS FELD, nicht in einen Sammelkasten: `feldFehler`
          // ist der Grund, warum `ActionErgebnis` ihn ueberhaupt traegt.
          if (erg.feldFehler) {
            form.setFields(Object.entries(erg.feldFehler)
              .map(([name, e]) => ({ name, errors: [e] })));
          }
          setFehler(erg.fehler);
        })}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name fehlt" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="barcode" label="Barcode"><Input /></Form.Item>
          <Form.Item name="lagerortId" label="Standort"
                     rules={[{ required: true, message: "Standort wählen" }]}>
            <Select options={lagerorte.map((l) => ({ value: l.id, label: l.name }))} />
          </Form.Item>
          <Form.Item name="streifenLot" label="Streifen-Lot"><Input /></Form.Item>

          {/* ⚠️ KEIN `initialValue` auf den Grenzen. `undefined` bedeutet „nicht
              hinterlegt" und wird von `orNull` zu `null`; eine vorbelegte 0
              behauptete dagegen eine Untergrenze von 0 mg/dl, und
              `bewerteKontrolle` liesze jeden Messwert durchgehen. */}
          <Form.Item name="level1Label" label="Level 1 — Bezeichnung"
                     tooltip="Steht bei der Kontrolle als Feldbeschriftung, z. B. „L1“ oder „niedrig“.">
            <Input />
          </Form.Item>
          <Form.Item name="level1Min" label="Level 1 — von"><InputNumber min={0} max={9999} /></Form.Item>
          <Form.Item name="level1Max" label="Level 1 — bis"><InputNumber min={0} max={9999} /></Form.Item>

          <Form.Item name="level2Label" label="Level 2 — Bezeichnung"><Input /></Form.Item>
          <Form.Item name="level2Min" label="Level 2 — von"><InputNumber min={0} max={9999} /></Form.Item>
          <Form.Item name="level2Max" label="Level 2 — bis"><InputNumber min={0} max={9999} /></Form.Item>
        </Form>
        {/* type="warning", nie type="error" — colorError === colorPrimary (Falle 3). */}
        {fehler ? <Alert type="warning" showIcon={false} message={fehler} /> : null}
      </Modal>
    </>
  );
}
```

- [ ] **Schritt 5: `page.tsx` schreiben**

```tsx
// page.tsx
import { getDb } from "../../../_db/client";
import { bzGeraeteUebersicht, lagerortOptionen } from "../../../_lib/lesepfade/bz";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { BzListe } from "./BzListe";

export const dynamic = "force-dynamic";

export default function BzSeite() {
  const db = getDb();
  return (
    <>
      <SeitenKopf titel="BZ-Kontrolle"
        beschreibung="Blutzuckermessgeräte mit Kontrollfrist, Referenzbereichen und Logbuch." />
      <BzListe zeilen={bzGeraeteUebersicht(db, new Date())} lagerorte={lagerortOptionen(db)} />
    </>
  );
}
```

- [ ] **Schritt 6: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/BzListe.test.tsx"
```

**Grün.** Alle vier Fälle laufen durch.

- [ ] **Schritt 7: Gates und Abruf**

```bash
pnpm typecheck && pnpm lint && pnpm build
curl -s -o /dev/null -w "%{http_code}\n" "http://lagerbuch.localtest.me:3000/verwaltung/bz"
```

Erwartet: **200**. `page.tsx` ist eine Server Component, die zwei Client-Inseln mountet — ein
`@ant-design/icons`-Import oder ein Compound-Zugriff **in `page.tsx`** ergibt HTTP 500, und weder
`build` noch Vitest sehen ihn (Fallen 1 und 7).

- [ ] **Schritt 8: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/page.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/BzListe.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/NeuBzGeraet.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/BzListe.test.tsx"
rtk git commit -m "feat(lagerbuch): /verwaltung/bz — Geraeteliste mit Faelligkeitsampel

Fuenf Spalten in der abgelesenen Reihenfolge; Suchfeldmenge 3 von 6 (Name,
Barcode, Lagerort).

faelligText bleibt in der Insel und wandert NICHT nach _lib/format.ts: Teil 3s
geraetFaelligChip gilt fuer Geraete (MTK, 30 Tage), nicht fuer BZ-Kontrollen
(31-Tage-Intervall, 5 Tage Warnfrist). Ein gemeinsamer Text behauptete
gleiche Fristen."
```

---

### Task 138: `/verwaltung/bz/scan` und `/verwaltung/geraete/scan` — die zwei Kamera-Seiten

**Files:** Create `verwaltung/(arbeit)/bz/scan/page.tsx`, `.../bz/scan/BzScanner.tsx`,
`verwaltung/(arbeit)/geraete/scan/page.tsx`, `.../geraete/scan/GeraetScanner.tsx`;
Test `.../bz/scan/BzScanner.test.tsx`.

**Interfaces:**
- Consumes: `_ui/BarcodeScanner.tsx` (**TEIL 4**, §7.6.1/§7.6.2 — Vertrag:
  `BarcodeScanner({ zuBarcode, zielPfad }: { zuBarcode: (rohwert: string) => Promise<{ id: string } | null>;
  zielPfad: (id: string) => string })`, navigiert **hart** über `window.location.assign`);
  `_actions/bz.ts` — `geraetZuBarcode`; `_actions/geraete.ts` — `geraetZuBarcode`;
  `_ui/Brotkrume`, `_ui/SeitenKopf`.
- Produces: `/verwaltung/bz/scan`, `/verwaltung/geraete/scan`.
- ⚠️ **Diesen Plan baut `_ui/BarcodeScanner.tsx` NICHT.** Teil 4 besitzt ihn (§7.6); die beiden
  13-Zeilen-Hüllen hier reichen nur ihre Action hinein. **Beide Seiten sind bis zum Einchecken von
  Teil 4 nicht lauffähig** — das ist die einzige Reihenfolgebindung dieses Plans nach außen und steht
  in der Abschlusstabelle.

**Zwei Brüche, beide in der Verwaltung** (§6.4.9):

1. **Die Elternseiten trugen je ein Icon** (`geraete/scan/page.tsx:2`, `bz/scan/page.tsx:2`) und
   fielen damit unter Falle 33. Hier kommen sie aus `_ui/ikonen.tsx` (`scannen`).
2. ⚠️ **Der Taschenlampen-Schalter färbt sich aus `var(--lb-rot)`, nie aus `var(--ant-color-primary)`**
   — er ist eigenes Markup **außerhalb** eines antd-Baums, sieht `--ant-*` also **nicht**, und eine
   nicht auflösbare CSS-Variable fällt auf `transparent` zurück und ist **gültiges CSS**: ein Knopf
   ohne Hintergrundfarbe, still. Der Schalter gehört Teil 4; **die Regel steht hier**, weil §6.4.9
   sie in der Verwaltung verortet.

⚠️ **Der Zielpfad bleibt ÄUSSER** (`/verwaltung/bz/${id}`). Die naheliegende Vereinheitlichung „alles
auf `/m/lagerbuch/…`" schickte den mobilen Kernpfad in einen **doppelt präfixierten** Pfad (Falle 63).
⚠️ **Brotkrume Pflicht** auf beiden Seiten — `aktiverEintrag` markiert `…/scan` nicht.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/bz/scan/BzScanner.test.tsx`:

```tsx
// BzScanner.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query } from "@/app/m/qr/_lib/test-dom";
vi.mock("../../../../_ui/BarcodeScanner", () => ({
  BarcodeScanner: (p: { zielPfad: (id: string) => string }) =>
    <div data-rolle="scanner" data-ziel={p.zielPfad("g1")} />,
}));
vi.mock("../../../../_actions/bz", () => ({ geraetZuBarcode: async () => ({ ok: true, wert: null }) }));
import { BzScanner } from "./BzScanner";
afterEach(async () => { await unmount(); });

describe("BzScanner", () => {
  it("uebergibt den AEUSZEREN Zielpfad", async () => {
    // „Alles auf /m/lagerbuch/…" schickte den mobilen Kernpfad in einen
    // doppelt praefixierten Pfad (Falle 63).
    await mount(<BzScanner />);
    expect(query("[data-rolle='scanner']").getAttribute("data-ziel")).toBe("/verwaltung/bz/g1");
  });

  it("beide Scan-Seiten importieren kein Icon aus antd", () => {
    for (const p of ["bz", "geraete"]) {
      const q = readFileSync(
        `src/app/m/lagerbuch/verwaltung/(arbeit)/${p}/scan/page.tsx`, "utf8");
      expect(q).not.toMatch(/@ant-design\/icons|lucide-react/);
      expect(q).toMatch(/<Brotkrume/);
    }
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/scan/BzScanner.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./BzScanner"`.

⚠️ **Nicht mit `Failed to resolve import "../../../../_ui/BarcodeScanner"` verwechseln.** Der
Scanner ist per `vi.mock` ersetzt und muss deshalb **nicht** existieren; genau deshalb ist dieser
Task auch **ohne** Teil 4 grün zu bekommen, während die **Seite** ohne Teil 4 nicht lauffähig ist.
Fällt der Lauf über `BarcodeScanner`, ist der `vi.mock`-Pfad falsch geschrieben.

- [ ] **Schritt 3: `bz/scan/BzScanner.tsx` schreiben**

```tsx
// BzScanner.tsx — "use client". Dreizehn Zeilen, und mehr soll es nicht werden.
"use client";
import { BarcodeScanner } from "../../../../_ui/BarcodeScanner";
import { geraetZuBarcode } from "../../../../_actions/bz";

/**
 * Die Huelle reicht die Action in den Scanner (Teil 4, §7.6) und uebersetzt
 * die Kennung in einen AEUSZEREN Pfad. Mehr tut sie nicht — und mehr soll sie
 * auch nicht tun: der Scanner selbst ist eine gemessene Client-Insel mit
 * dynamischem Doppelimport, und RSC-first aendert daran nichts.
 */
export function BzScanner() {
  return (
    <BarcodeScanner
      zuBarcode={async (rohwert) => {
        const erg = await geraetZuBarcode(rohwert);
        return erg.ok ? erg.wert : null;
      }}
      zielPfad={(id) => `/verwaltung/bz/${id}`}
    />
  );
}
```

- [ ] **Schritt 4: `bz/scan/page.tsx` schreiben**

```tsx
// bz/scan/page.tsx
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { BzScanner } from "./BzScanner";

export const dynamic = "force-dynamic";

/**
 * ⚠️ DIESE SEITE TRUG IM BESTAND EIN lucide-ICON (`bz/scan/page.tsx:2`) und
 * fiel damit unter Falle 33. Sie traegt jetzt gar keins: die Ueberschrift
 * genuegt, und der Scanner bringt seine eigenen Zeichen aus `_ui/ikonen.tsx`
 * mit.
 *
 * Brotkrume Pflicht — `aktiverEintrag` markiert `/verwaltung/bz/scan` nicht
 * (der Pfad endet weder auf `/verwaltung/bz` noch auf `/verwaltung`).
 */
export default function BzScanSeite() {
  return (
    <>
      <Brotkrume href="/verwaltung/bz">BZ-Kontrolle</Brotkrume>
      <SeitenKopf titel="Gerät scannen"
        beschreibung="Barcode auf das Kamerabild halten — der Sprung ins Geräteblatt erfolgt automatisch." />
      <BzScanner />
    </>
  );
}
```

- [ ] **Schritt 5: `geraete/scan/GeraetScanner.tsx` und `geraete/scan/page.tsx` schreiben**

⚠️ **Ausgeschrieben und nicht als „zeichengleich zu oben" abgekürzt.** Es sind **drei** Unterschiede,
und alle drei sind stumm, wenn man sie falsch abschreibt: die Action kommt aus `_actions/geraete.ts`
(nicht `bz.ts` — **gleicher Exportname, andere Tabelle**), der Zielpfad heißt `/verwaltung/geraete/`,
und die Brotkrume zeigt auf `/verwaltung/geraete`. Ein kopiertes `bz` an einer dieser drei Stellen
liefert HTTP 200 und schickt in das falsche Geräteblatt.

```tsx
// geraete/scan/GeraetScanner.tsx — "use client".
"use client";
import { BarcodeScanner } from "../../../../_ui/BarcodeScanner";
import { geraetZuBarcode } from "../../../../_actions/geraete";

/**
 * ⚠️ `geraetZuBarcode` HEISZT IN `bz.ts` GENAUSO und liest eine ANDERE Tabelle
 * (`geraete` statt `bz_geraete`). Der Importpfad ist hier die ganze
 * Unterscheidung — ein kopiertes `from "../../../../_actions/bz"` faende BZ-
 * Geraete und spraenge in `/verwaltung/geraete/<bz-id>`, also auf eine 404 mit
 * HTTP 200 davor.
 */
export function GeraetScanner() {
  return (
    <BarcodeScanner
      zuBarcode={async (rohwert) => {
        const erg = await geraetZuBarcode(rohwert);
        return erg.ok ? erg.wert : null;
      }}
      zielPfad={(id) => `/verwaltung/geraete/${id}`}
    />
  );
}
```

```tsx
// geraete/scan/page.tsx
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { GeraetScanner } from "./GeraetScanner";

export const dynamic = "force-dynamic";

/**
 * ⚠️ AUCH DIESE SEITE TRUG IM BESTAND EIN lucide-ICON
 * (`geraete/scan/page.tsx:2`) und faellt damit unter Falle 33. Sie traegt
 * jetzt gar keins.
 *
 * Brotkrume Pflicht — `aktiverEintrag` markiert `/verwaltung/geraete/scan`
 * nicht.
 */
export default function GeraetScanSeite() {
  return (
    <>
      <Brotkrume href="/verwaltung/geraete">Geräte</Brotkrume>
      <SeitenKopf titel="Gerät scannen"
        beschreibung="Barcode auf das Kamerabild halten — der Sprung ins Geräteblatt erfolgt automatisch." />
      <GeraetScanner />
    </>
  );
}
```

- [ ] **Schritt 6: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/scan/BzScanner.test.tsx"
```

**Grün.** Beide Fälle laufen durch — der Zielpfad-Fall gegen die gemockte Insel, der Icon- und
Brotkrumen-Fall als Quelltext-Scan über **beide** `scan/page.tsx`.

- [ ] **Schritt 7: Gates — ohne Abruf, und das ist hier der Punkt**

```bash
pnpm typecheck && pnpm lint
```

⚠️ **`pnpm build` und der Abruf sind hier NICHT fällig und dürfen es auch nicht sein.**
`_ui/BarcodeScanner.tsx` gehört Teil 4 und existiert noch nicht; `build` bräche mit einem
Auflösungsfehler. Das ist die **einzige Reihenfolgebindung dieses Plans nach außen**. Wer den Task
grün bekommen will, indem er eine Notfassung des Scanners anlegt, hat Teil 4 eine Datei
weggenommen — der Abruf beider Seiten gehört in **T151, Schritt 2**, nach Teil 4.

- [ ] **Schritt 8: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/scan/" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/scan/"
rtk git commit -m "feat(lagerbuch): die zwei Scan-Seiten — Huellen um Teil 4s Scanner

Beide Elternseiten trugen im Bestand ein lucide-Icon und fielen unter Falle
33; sie tragen jetzt gar keins. Der Zielpfad bleibt AEUSZER — 'alles auf
/m/lagerbuch' schickte den mobilen Kernpfad in einen doppelt praefixierten
Pfad. Brotkrume auf beiden, weil aktiverEintrag sie nicht markiert.

_ui/BarcodeScanner.tsx gehoert TEIL 4 (§7.6). Beide Seiten sind bis zu dessen
Einchecken nicht lauffaehig — die einzige Reihenfolgebindung dieses Plans nach
auszen."
```

---

### Task 139: `/verwaltung/bz/[id]` — Geräteblatt mit `ref_snapshot`-Logbuch

**Files:** Create `verwaltung/(arbeit)/bz/[id]/page.tsx`, `.../ReferenzEditor.tsx`,
`.../BzAktivToggle.tsx`; Test `.../page.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/bz.ts` — `bzGeraetDetail`, `lagerortOptionen`;
`_lib/grenzen.ts` — `BZ_LOGBUCH_GRENZE` (= 100); `_actions/bz.ts` — `geraetSpeichern`,
`setGeraetAktiv`; `_actions/loeschen.ts`; `_ui/Brotkrume`, `_ui/Kachel`, `_ui/Chip`,
`_ui/LoeschButton`. Produces `/verwaltung/bz/[id]`.

**Logbuch-Spalten, abgelesen aus `bz/[id]/page.tsx:60-92`:**

| # | Titel | Anmerkung |
|---|---|---|
| 1 | Zeitpunkt | Mono |
| 2 | Ergebnis | Chip „bestanden" (ok) / „nicht bestanden" (rot) |
| 3 | Level 1 | Wert + **die Grenzen aus `ref_snapshot`**, Chip nach `imBereich` |
| 4 | Level 2 | dito |
| 5 | Verbrauch | „N Sticks / M Lanzetten", Kompressen-Verfall |
| 6 | Akku | Chip mit Zeichen `akku`, nur wenn gewechselt |
| 7 | Wer | `quelleName` als grauer Chip |

⚠️ **§6.15 Auflage 16 — das Logbuch zeigt je Zeile die Grenzen aus `ref_snapshot`, NICHT die heutigen
aus `bz_geraete`.** Wer die heutigen liest, behauptet rückwirkend, eine damals bestandene Kontrolle
sei durchgefallen. Teil 3 (T51) liefert `refBereiche` je Zeile; **die Seite liest ausschließlich sie.**
⚠️ **Der Deckel 100 wird sichtbar** (`BZ_LOGBUCH_GRENZE`): bei `mehrVorhanden` „Neueste 100 von mehr
Einträgen".
⚠️ **`ReferenzEditor` ist auto-committend, ohne `Form`** (§6.4.7): Streifen-Lot (`onBlur`) und die
vier Grenzen (`InputNumber`, 400 ms).
⚠️ **Brotkrume Pflicht.**

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/page.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const QUELLE = readFileSync("src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/page.tsx", "utf8");
const EDITOR = readFileSync(
  "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/ReferenzEditor.tsx", "utf8");

describe("BZ-Geraeteblatt", () => {
  it("liest die Grenzen aus refBereiche, NICHT aus dem Geraet", () => {
    // Wer die heutigen Grenzen liest, behauptet rueckwirkend, eine damals
    // bestandene Kontrolle sei durchgefallen (§5.11, Auflage 16).
    expect(QUELLE).toMatch(/k\.refBereiche/);
    expect(QUELLE).not.toMatch(/g\.level1Min[\s\S]{0,200}Logbuch/);
  });
  it("macht den Deckel 100 sichtbar", () => {
    expect(QUELLE).toMatch(/BZ_LOGBUCH_GRENZE/);
    expect(QUELLE).toMatch(/Neueste 100 von mehr Einträgen/);
  });
  it("traegt eine Brotkrume", () => {
    expect(QUELLE).toMatch(/<Brotkrume href="\/verwaltung\/bz">/);
  });
  it("der ReferenzEditor committet ohne Form", () => {
    expect(EDITOR).not.toMatch(/Form\.Item/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/page.test.tsx"
```

Erwartet: FAIL mit
`ENOENT: no such file or directory, open 'src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/page.tsx'`
— beide `readFileSync` stehen auf Modulebene, der Lauf bricht vor dem ersten `it` ab.

- [ ] **Schritt 3: `page.tsx` schreiben — der Seitenaufbau**

Der Seitenkopf trägt vier Kacheln (Fälligkeit mit Ampelton · letzte Kontrolle · Ø Akkulaufzeit ·
Status/Standort), darunter „Referenz & Streifen-Lot" (`ReferenzEditor`), einen Knopf „Kontrolle
erfassen" nach `/verwaltung/bz/[id]/kontrolle`, das Logbuch und die Gefahrenzone mit
`LoeschButton art="bzGeraet"`. Das Logbuch ist die tragende Stelle und steht deshalb vollständig da:

```tsx
// Der Logbuch-Ausschnitt aus page.tsx — die tragende Stelle.
<Table
  rowKey="id" pagination={false} scroll={{ x: "max-content" }}
  aria-label="Logbuch der Kontrollen" dataSource={logbuch.zeilen}
  locale={{ emptyText: "Für dieses Gerät wurde noch keine Kontrolle erfasst." }}
  columns={[
    { title: "Zeitpunkt", dataIndex: "ts",
      render: (d: Date) => <span className={s.jts}>
        {d.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</span> },
    { title: "Ergebnis", dataIndex: "bestanden",
      render: (v: boolean) => <Chip ton={v ? "ok" : "rot"}>
        {v ? "bestanden" : "nicht bestanden"}</Chip> },
    {
      title: "Level 1", dataIndex: "level1Wert",
      /* ⚠️ DIE GRENZEN KOMMEN AUS `refBereiche` — dem eingefrorenen Stand
         dieser Kontrolle (§5.11, §6.15 Auflage 16). Die heutigen Werte aus
         `bz_geraete` stehen oben im ReferenzEditor und gelten fuer die
         NAECHSTE Kontrolle, nicht fuer diese. */
      render: (v: number | null, k) => v === null ? <span style={SCHRIFT.neben}>—</span> : (
        <span>
          <Chip ton={k.level1ImBereich === false ? "rot"
                    : k.level1ImBereich === true ? "ok" : "gelb"}>L1 {v}</Chip>
          <span style={{ ...SCHRIFT.neben, marginInlineStart: 6 }}>
            (damals {k.refBereiche.level1Min ?? "?"}–{k.refBereiche.level1Max ?? "?"})
          </span>
        </span>
      ),
    },
    {
      title: "Level 2", dataIndex: "level2Wert",
      render: (v: number | null, k) => v === null ? <span style={SCHRIFT.neben}>—</span> : (
        <span>
          <Chip ton={k.level2ImBereich === false ? "rot"
                    : k.level2ImBereich === true ? "ok" : "gelb"}>L2 {v}</Chip>
          <span style={{ ...SCHRIFT.neben, marginInlineStart: 6 }}>
            (damals {k.refBereiche.level2Min ?? "?"}–{k.refBereiche.level2Max ?? "?"})
          </span>
        </span>
      ),
    },
    { title: "Verbrauch", dataIndex: "sticks",
      render: (_: number, k) => (
        <span style={SCHRIFT.neben}>
          {k.sticks} Sticks / {k.lanzetten} Lanzetten
          {k.kompresseVerfall ? ` · Kompresse ${k.kompresseVerfall}` : ""}
        </span>
      ) },
    { title: "Akku", dataIndex: "batterieGewechselt",
      render: (v: boolean) => v ? <Chip ton="gelb" zeichen="akku">gewechselt</Chip> : null },
    { title: "Wer", dataIndex: "wer",
      render: (v: string) => <Chip ton="grau">{v}</Chip> },
  ]}
/>
```

Unmittelbar über dem `<Table>` steht der sichtbar gemachte Deckel — er ist **kein Schmuck**, sondern
die Aussage selbst (§6.9.3): ein `<Table>` ohne `pagination={false}` erzeugte von sich aus einen
Pager über einem **Ausschnitt** und sagte „10 von 100", während dahinter fünfhundert Kontrollen
liegen.

```tsx
{logbuch.mehrVorhanden ? (
  <p style={SCHRIFT.neben}>Neueste {BZ_LOGBUCH_GRENZE} von mehr Einträgen</p>
) : (
  <p style={SCHRIFT.neben}>{logbuch.zeilen.length} Einträge</p>
)}
```

- [ ] **Schritt 4: `ReferenzEditor.tsx` und `BzAktivToggle.tsx` schreiben**

`ReferenzEditor.tsx` ist **auto-committend und trägt kein `Form.Item`** (§6.4.7): Streifen-Lot
committet `onBlur`, die vier Grenzen committen als `InputNumber` mit 400 ms Debounce — genau die
Bauform aus T132s `SollEditor` (lokaler Spiegel, `useRef`-Timer, Aufräumen im `useEffect`), nur mit
`geraetSpeichern` aus `_actions/bz.ts` statt der Fahrzeug-Action.

`BzAktivToggle.tsx` folgt dem in T132 ausgeschriebenen Muster **aller vier** `*AktivToggle`: `Switch`
plus `useTransition`, `setGeraetAktiv` aus `_actions/bz.ts`, Fehler als Rückgabewert in einem
`Alert type="warning"`.

⚠️ **Die vier `*AktivToggle` werden NICHT zusammengelegt** (Festlegung H12) — sie sehen gleich aus
und rufen **vier verschiedene Actions in vier Dateien**. Eine gemeinsame Komponente bräuchte die
Action als Prop und verdeckte genau den Zusammenhang, den §6.12 Frage 1 abhaken muss.
⚠️ **`setGeraetAktiv` heißt in `geraete.ts` genauso.** Der Importpfad ist die ganze Unterscheidung.

- [ ] **Schritt 5: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/page.test.tsx"
```

**Grün.** Alle vier Fälle laufen durch.

- [ ] **Schritt 6: Gates und Abruf**

```bash
pnpm typecheck && pnpm lint && pnpm build
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://lagerbuch.localtest.me:3000/verwaltung/bz/<eine-echte-id>"   # erwartet 200
```

- [ ] **Schritt 7: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/page.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/ReferenzEditor.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/BzAktivToggle.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/page.test.tsx"
rtk git commit -m "feat(lagerbuch): /verwaltung/bz/[id] — Logbuch aus refBereiche

Das Logbuch zeigt je Zeile die Grenzen aus ref_snapshot und schreibt sie als
'(damals 40-60)' aus. Wer die heutigen Werte aus bz_geraete liest, behauptet
rueckwirkend, eine damals bestandene Kontrolle sei durchgefallen.

Deckel 100 sichtbar gemacht; ReferenzEditor committet beim Aendern und steht
deshalb in keinem Form.Item. Brotkrume Pflicht."
```

---

### Task 140: `/verwaltung/bz/[id]/kontrolle` — das eine Formular mit `Radio.Group`

**Files:** Create `verwaltung/(arbeit)/bz/[id]/kontrolle/page.tsx`, `.../KontrolleForm.tsx`;
Test `.../KontrolleForm.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/bz.ts` — `bzGeraetDetail`; `_actions/bz.ts` —
`kontrolleErfassen`; `_ui/Brotkrume`, `_ui/SeitenKopf`. Produces
`/verwaltung/bz/[id]/kontrolle`.

**Felder** (abgelesen aus `KontrolleForm.tsx:60-95`): Level 1 (`InputNumber`, Label und Grenzen aus
dem Gerät) · Level 2 (dito) · Kompressen-Verfall (**`DatePicker picker="month"`, das dritte
Monatsfeld**) · Teststreifen (`InputNumber max={9999}`) · Lanzetten (dito) · Akku gewechselt
(`Radio.Group` ja/nein) · Kommentar (`Input`).

⚠️ **`max={9999}` bleibt** (§6.4.6): echter Überbestand muss zählbar bleiben, sonst korrigiert der
Abgleich real vorhandene Teile **still** heraus.
⚠️ **MIT `antd Form`** — es gibt einen Absendeknopf (§6.4.7). `Form.Item` steht **in der Insel**, nie
in der Seite (Falle 1).
⚠️ **`Radio.Group` statt Knopfreihe** (`docs/design/README.md:144`): ein Tabstop pro Gruppe,
Pfeiltasten wählen nativ.
⚠️ **Brotkrume Pflicht** — auf `/verwaltung/bz/[id]`, nicht auf die Liste: der Weg zurück ist das
Geräteblatt.
⚠️ **Das Gerät wird serverseitig geladen und als Prop übergeben** (Labels und Grenzen). Die Insel
holt nichts nach; sonst rechnete sie Bereiche gegen einen Stand, den sie selbst gelesen hat.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/kontrolle/KontrolleForm.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";
const erfassen = vi.fn(async () => ({ ok: true as const, wert: { id: "k1", bestanden: true } }));
vi.mock("../../../../../_actions/bz", () => ({ kontrolleErfassen: (...a: unknown[]) => erfassen(...(a as [])) }));
import { KontrolleForm } from "./KontrolleForm";
afterEach(async () => { erfassen.mockClear(); await unmount(); });

const LEVEL = { label: "L1", min: 40, max: 60 };
describe("KontrolleForm", () => {
  it("nennt Label und Grenzen des Geraets am Feld", async () => {
    await mount(<KontrolleForm geraetId="g1" level1={LEVEL} level2={null} />);
    expect(document.body.textContent).toContain("L1 (40–60)");
  });
  it("laeszt bis 9999 Sticks zu — echter Ueberbestand musz zaehlbar bleiben", async () => {
    await mount(<KontrolleForm geraetId="g1" level1={LEVEL} level2={null} />);
    expect(query("[data-rolle='sticks'] input").getAttribute("aria-valuemax")).toBe("9999");
  });
  it("Akku ist eine Radio.Group, keine Knopfreihe", async () => {
    // Ein Tabstop pro Gruppe, Pfeiltasten waehlen nativ
    // (docs/design/README.md:144).
    await mount(<KontrolleForm geraetId="g1" level1={LEVEL} level2={null} />);
    expect(exists(".ant-radio-group")).toBe(true);
    expect(exists("button[aria-pressed]")).toBe(false);
  });
  it("der Kompressen-Verfall ist ein DatePicker picker=month", async () => {
    await mount(<KontrolleForm geraetId="g1" level1={LEVEL} level2={null} />);
    expect(exists("input[type='month']")).toBe(false);
    expect(query("[data-rolle='kompresse'] input").getAttribute("aria-label"))
      .toBe("Kompressen-Verfall");
  });
  it("Form.Item steht in der INSEL, nicht in der Seite", () => {
    const seite = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/kontrolle/page.tsx", "utf8");
    expect(seite).not.toMatch(/Form\.Item/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/kontrolle/KontrolleForm.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./KontrolleForm"`.

⚠️ **Der fünfte Fall („`Form.Item` steht in der INSEL") würde stattdessen mit `ENOENT … open
'…/kontrolle/page.tsx'` scheitern** — sein `readFileSync` steht **im** `it` und nicht auf
Modulebene. Nach Schritt 3 ist er deshalb noch rot und wird erst mit Schritt 4 grün; das ist die
richtige Reihenfolge und kein Fehler.

- [ ] **Schritt 3: `KontrolleForm.tsx` schreiben**

```tsx
// KontrolleForm.tsx — "use client", MIT Form (Absendeknopf).
"use client";
import { useState, useTransition } from "react";
import { Alert, Button, DatePicker, Form, Input, InputNumber, Radio } from "antd";
import type { Dayjs } from "dayjs";
import { kontrolleErfassen } from "../../../../../_actions/bz";
import { monatAusPicker } from "../../../../../_ui/monat";

type Level = { label: string | null; min: number | null; max: number | null } | null;
const bereich = (l: Level) =>
  l && (l.min !== null || l.max !== null) ? ` (${l.min ?? "?"}–${l.max ?? "?"})` : "";

export function KontrolleForm({
  geraetId, level1, level2,
}: { geraetId: string; level1: Level; level2: Level }) {
  const [form] = Form.useForm();
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();

  return (
    <Form form={form} layout="vertical" disabled={laeuft}
      onFinish={(w: { level1Wert?: number; level2Wert?: number; kompresseVerfall?: Dayjs;
                      sticks?: number; lanzetten?: number; batterieGewechselt?: boolean;
                      kommentar?: string }) => start(async () => {
        const erg = await kontrolleErfassen({
          geraetId, ...w, kompresseVerfall: monatAusPicker(w.kompresseVerfall ?? null),
        });
        if (!erg.ok) {
          setFehler(erg.fehler);
          form.setFields(Object.entries(erg.feldFehler ?? {})
            .map(([name, errors]) => ({ name, errors: [errors] })));
        } else {
          setFehler(null);
          setMeldung(erg.wert.bestanden ? "Kontrolle gespeichert — bestanden."
                                        : "Kontrolle gespeichert — NICHT bestanden.");
          form.resetFields();
        }
      })}>
      {level1 ? (
        <Form.Item name="level1Wert" label={`${level1.label ?? "Level 1"}${bereich(level1)}`}>
          <InputNumber min={0} max={9999} style={{ width: "100%" }} />
        </Form.Item>
      ) : null}
      {level2 ? (
        <Form.Item name="level2Wert" label={`${level2.label ?? "Level 2"}${bereich(level2)}`}>
          <InputNumber min={0} max={9999} style={{ width: "100%" }} />
        </Form.Item>
      ) : null}
      <Form.Item name="kompresseVerfall" label="Kompressen-Verfall">
        <span data-rolle="kompresse">
          <DatePicker picker="month" format="YYYY-MM" aria-label="Kompressen-Verfall"
                      style={{ width: "100%" }} />
        </span>
      </Form.Item>
      {/* ⚠️ max=9999 bleibt: echter Ueberbestand musz zaehlbar bleiben, sonst
          korrigiert der Abgleich real vorhandene Teile still heraus (§6.4.6). */}
      <Form.Item name="sticks" label="Teststreifen" initialValue={0}>
        <span data-rolle="sticks"><InputNumber min={0} max={9999} style={{ width: "100%" }} /></span>
      </Form.Item>
      <Form.Item name="lanzetten" label="Lanzetten" initialValue={0}>
        <InputNumber min={0} max={9999} style={{ width: "100%" }} />
      </Form.Item>
      {/* Echte Radiogruppe statt Knopfreihe: ein Tabstop pro Gruppe,
          Pfeiltasten waehlen nativ (docs/design/README.md:144). */}
      <Form.Item name="batterieGewechselt" label="Akku gewechselt" initialValue={false}>
        <Radio.Group options={[{ value: false, label: "nein" }, { value: true, label: "ja" }]} />
      </Form.Item>
      <Form.Item name="kommentar" label="Kommentar"><Input /></Form.Item>
      <Button type="primary" htmlType="submit" loading={laeuft}>Kontrolle speichern</Button>
      {meldung ? <Alert type="warning" showIcon={false} message={meldung}
                        style={{ marginBlockStart: 12 }} /> : null}
      {fehler ? <Alert type="warning" showIcon={false} message={fehler}
                       style={{ marginBlockStart: 12 }} /> : null}
    </Form>
  );
}
```

- [ ] **Schritt 4: `page.tsx` schreiben**

```tsx
// page.tsx
import { notFound } from "next/navigation";
import { getDb } from "../../../../../_db/client";
import { bzGeraetDetail } from "../../../../../_lib/lesepfade/bz";
import { Brotkrume } from "../../../../../_ui/Brotkrume";
import { SeitenKopf } from "../../../../../_ui/SeitenKopf";
import { KontrolleForm } from "./KontrolleForm";

export const dynamic = "force-dynamic";

/**
 * DAS GERAET WIRD SERVERSEITIG GELADEN und als Prop uebergeben — die Insel
 * holt nichts nach. Sonst rechnete sie die Bereiche gegen einen Stand, den sie
 * selbst gelesen hat, und der koennte vom Stand abweichen, gegen den die
 * Action gleich bewertet.
 *
 * `Form.Item` steht ausschlieszlich in der Insel, nie hier (Falle 1).
 */
export default async function KontrolleSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = bzGeraetDetail(getDb(), id);
  if (!d) notFound();
  const g = d.geraet;
  return (
    <>
      <Brotkrume href={`/verwaltung/bz/${g.id}`}>{g.name}</Brotkrume>
      <SeitenKopf titel="Kontrolle erfassen"
        beschreibung="Die Messwerte werden gegen die heute am Gerät hinterlegten Referenzbereiche bewertet; der Stand wird mit der Kontrolle eingefroren." />
      <KontrolleForm
        geraetId={g.id}
        level1={{ label: g.level1Label, min: g.level1Min, max: g.level1Max }}
        level2={{ label: g.level2Label, min: g.level2Min, max: g.level2Max }}
      />
    </>
  );
}
```

- [ ] **Schritt 5: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/kontrolle/KontrolleForm.test.tsx"
```

**Grün.** Alle fünf Fälle laufen durch — der fünfte erst jetzt, weil er die Seite aus Schritt 4 liest.

- [ ] **Schritt 6: Gates und Abruf**

```bash
pnpm typecheck && pnpm lint && pnpm build
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://lagerbuch.localtest.me:3000/verwaltung/bz/<eine-echte-id>/kontrolle"   # erwartet 200
```

⚠️ **Genau hier zahlt sich der Abruf aus.** `Form.Item` ist ein Compound-Zugriff; steht er
versehentlich in `page.tsx` statt in der Insel, ist das **HTTP 500 für die ganze Seite** (Falle 1) —
`typecheck` sieht ein gültiges Namespace-Member, `build` rendert nicht. Der Quelltext-Scan aus
Schritt 1 fängt es zusätzlich, aber nur, solange jemand ihn nicht umgeht.

- [ ] **Schritt 7: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/kontrolle/"
rtk git commit -m "feat(lagerbuch): /verwaltung/bz/[id]/kontrolle — Form mit Radio.Group

antd Form mit Absendeknopf; Form.Item steht in der Insel, nie in der Seite.
Akku ist eine echte Radio.Group statt einer Knopfreihe — ein Tabstop pro
Gruppe, Pfeiltasten waehlen nativ. Der Kompressen-Verfall ist das dritte
Monatsfeld (DatePicker picker=month).

max=9999 bleibt: echter Ueberbestand musz zaehlbar bleiben. Das Geraet kommt
als Server-Prop; die Insel holt nichts nach."
```

---

### Task 141: `/verwaltung/sauerstoff` — Flaschenliste mit Herkunft

**Files:** Create `verwaltung/(arbeit)/sauerstoff/page.tsx`, `.../SauerstoffListe.tsx`,
`.../NeuFlasche.tsx`; Test `.../SauerstoffListe.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/o2.ts` (T52) — `o2FlaschenUebersicht(db: DB):
O2FlascheZeile[]`, `lagerorteFuerFlaschen(db: DB): { id: string; name: string }[]`;
`_actions/sauerstoff.ts` — `flascheSpeichern`; `_ui/Suchfeld`, `_ui/Trefferanzeige`, `_ui/Chip`;
`antd` — `Progress`. Produces `/verwaltung/sauerstoff`.

⚠️ **`O2FlascheZeile` muss ein Feld tragen, das Teil 3 heute NICHT deklariert:**

```ts
herkunft: "check" | "manuell" | null;   // null = es gibt keine Messung
```

**Der benannte Einlöser ist Teil 3, T52** (`_lib/lesepfade/o2.ts`); die Zeile steht auch in §10
dieses Plans. **Bis dahin ist dieser Task nicht typprüfbar** — genau wie T138 ohne Teil 4s
`BarcodeScanner`. Schritt 7 hält das fest.

**Spalten, abgelesen aus `SauerstoffListe.tsx:48-75`:**

| # | Titel | Anmerkung |
|---|---|---|
| 1 | Flasche | Link + Lagerort in Mono |
| 2 | Druck | rechtsbündig, „N bar" oder „–" |
| 3 | Füllstand | `Progress` (RSC-sicher) + Chip mit `ampelTon`; **`null` → Chip „Nennfülldruck unbekannt"** |
| 4 | **Herkunft** | Chip „aus Check" / „manuell" — **§6.15 Auflage 15** |
| 5 | Größe | „N l · Nenndruck M bar" |
| 6 | Status | inaktiv-Chip |

**Suchfeldmenge (4 von 6):** Name · Lagerort (`SauerstoffListe.tsx:15-23`).
**Filter:** niedriger Druck · inaktive ausblenden.

⚠️ **§6.15 Auflage 15 — die Herkunft der jüngsten Messung ist SICHTBAR** (§5.8.1). Ein aus dem
Fahrzeug-Check übernommener Druck und eine von Hand erfasste Messung sind fachlich nicht dasselbe;
ohne die Spalte sieht man den Unterschied nicht.
⚠️ **Keine Messung heißt `status: null` — nicht 0 %, nicht rot** (Teil 3, T52). Ein `?? 200` beim
Lesen wäre verboten: die Ampel spränge von „gelb" auf „grün".
⚠️ **`Progress` trägt KEINE Ampelfarbe als `strokeColor` aus `AMPEL_HELL`** — er ist ein
antd-Baustein und liest antds Tokens; die Ampelaussage trägt der **Chip** daneben.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/SauerstoffListe.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, unmount, queryAll } from "@/app/m/qr/_lib/test-dom";
import { SauerstoffListe, sucheTrifft } from "./SauerstoffListe";
vi.mock("../../../_actions/sauerstoff", () => ({ flascheSpeichern: async () => ({ ok: true, wert: { id: "x" } }) }));
const ZEILEN = [
  { id: "o1", name: "O2 klein", lagerortName: "RTW 1", aktiv: true, groesseLiter: 2,
    nennfuelldruckBar: 200, letzterDruck: 120, herkunft: "check" as const,
    status: { prozent: 60, ampel: "gruen" as const, niedrig: false } },
  { id: "o2", name: "O2 ohne", lagerortName: "Lager", aktiv: true, groesseLiter: null,
    nennfuelldruckBar: 0, letzterDruck: null, herkunft: null, status: null },
];
afterEach(async () => { await unmount(); });

describe("SauerstoffListe", () => {
  it("traegt die sechs abgelesenen Spalten", async () => {
    await mount(<SauerstoffListe zeilen={ZEILEN} lagerorte={[]} />);
    expect(queryAll("thead th").map((th) => th.textContent))
      .toEqual(["Flasche", "Druck", "Füllstand", "Herkunft", "Größe", "Status"]);
  });
  it("zeigt die HERKUNFT der juengsten Messung (Auflage 15)", async () => {
    await mount(<SauerstoffListe zeilen={ZEILEN} lagerorte={[]} />);
    expect(document.body.textContent).toContain("aus Check");
  });
  it("ohne Messung: „Nennfuelldruck unbekannt\", nicht 0 % und nicht rot", async () => {
    await mount(<SauerstoffListe zeilen={ZEILEN} lagerorte={[]} />);
    expect(document.body.textContent).toContain("Nennfülldruck unbekannt");
    expect(document.body.textContent).not.toContain("0 %");
  });
  it("sucht ueber Name UND Lagerort (4 von 6)", () => {
    expect(sucheTrifft(ZEILEN[0], "rtw")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "o2 klein")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "Lager")).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/SauerstoffListe.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./SauerstoffListe"`.

- [ ] **Schritt 3: `SauerstoffListe.tsx` schreiben**

Kopf, Filterleiste und `sucheTrifft` folgen **wörtlich** derselben Bauform wie `BzListe.tsx` in T137
(`"use client"`, `useMemo`-Filter, `Suchfeld` + zwei `Checkbox` + `Trefferanzeige`, `Table` mit
`rowKey="id" pagination={false} scroll={{ x: "max-content" }}`) — mit **einer** Abweichung: die
Suchfeldmenge ist **4 von 6** und deckt nur Name und Lagerort ab, nicht den Barcode (eine Flasche
hat keinen).

```tsx
/** SUCHFELDMENGE 4 VON 6: Name · Lagerort. */
export function sucheTrifft(z: O2FlascheZeile, begriff: string): boolean {
  const q = falte(begriff.trim());
  return !q || falte(`${z.name} ${z.lagerortName}`).includes(q);
}
```

Die sechs Spalten sind die tragende Stelle und stehen deshalb vollständig da:

```tsx
// Der tragende Ausschnitt aus SauerstoffListe.tsx
columns={[
  { title: "Flasche", dataIndex: "name",
    render: (v: string, z) => (
      <span>
        <Link href={`/verwaltung/sauerstoff/${z.id}`} style={{ fontWeight: 600 }}>{v}</Link>
        <span style={{ ...SCHRIFT.mono, marginInlineStart: 8 }}>{z.lagerortName}</span>
      </span>
    ) },
  { title: "Druck", dataIndex: "letzterDruck", align: "right" as const,
    render: (v: number | null) => <span style={SCHRIFT.mono}>{v === null ? "–" : `${v} bar`}</span> },
  {
    title: "Füllstand", dataIndex: "status",
    /* ⚠️ KEINE MESSUNG heiszt `status: null` — nicht 0 % und nicht rot
       (Teil 3, T52). `Progress` traegt KEINE Ampelfarbe: er ist ein
       antd-Baustein und liest antds Tokens; die Ampelaussage traegt der Chip. */
    render: (_: unknown, z) => z.status === null ? (
      <Chip ton="grau">Nennfülldruck unbekannt</Chip>
    ) : (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Progress percent={z.status.prozent} showInfo={false} style={{ width: 80 }} />
        <Chip ton={ampelTon(z.status.ampel)}>{z.status.prozent} %</Chip>
        {z.status.niedrig ? <Chip ton="rot" zeichen="warnung">niedriger Druck</Chip> : null}
      </span>
    ),
  },
  {
    title: "Herkunft", dataIndex: "herkunft",
    /* ⚠️ §6.15, Auflage 15 (§5.8.1): ein aus dem Fahrzeug-Check uebernommener
       Druck und eine von Hand erfasste Messung sind fachlich nicht dasselbe.
       Ohne diese Spalte sieht man den Unterschied nicht. */
    render: (v: "check" | "manuell" | null) => v === null
      ? <span style={SCHRIFT.neben}>—</span>
      : <Chip ton="grau">{v === "check" ? "aus Check" : "manuell"}</Chip>,
  },
  { title: "Größe", dataIndex: "groesseLiter",
    render: (v: number | null, z) => (
      <span style={SCHRIFT.neben}>
        {v ? `${v} l · ` : ""}Nenndruck {z.nennfuelldruckBar} bar
      </span>
    ) },
  { title: "Status", dataIndex: "aktiv",
    render: (v: boolean) => v ? null : <Chip ton="grau">inaktiv</Chip> },
]}
```

⚠️ **Erinnerung an die offene Kopplung von oben.** `O2FlascheZeile` aus Teil 3 (T52) führt heute
`id · name · lagerortName · aktiv · groesseLiter · nennfuelldruckBar · letzterDruck ·
letzteMessung · status` — **kein `herkunft`**; die Herkunft steckt bisher nur im **Detail**pfad als
`O2MessungZeile.ausCheck`. Abgeleitet wird sie **genau wie `ausCheck`**: am `quelleTyp` der jüngsten
Messung, **nie** am Kommentartext (ein Text-`startsWith` bricht, sobald jemand den Kommentar ändert).
⚠️ **Kein Rückfall auf `"manuell"` bei fehlender Messung.** `null` heißt „es gibt nichts zu
verorten"; ein `?? "manuell"` behauptete eine Handeingabe, die nie stattgefunden hat — genau der
Fehler, den Auflage 15 verhindern soll. Der Test oben hält beide Fälle fest: `"check"` in Zeile 1,
`null` in Zeile 2.

- [ ] **Schritt 4: `NeuFlasche.tsx` schreiben**

`NeuFlasche.tsx` ist ein `Modal` mit `Form` (Absendeknopf) und den Feldern Name, `Select` Standort,
Größe in Litern (`InputNumber`, optional) und Nennfülldruck (`InputNumber`); es ruft
`flascheSpeichern` aus `_actions/sauerstoff.ts` und legt Feldfehler über `form.setFields` ans Feld —
dieselbe Bauform wie `NeuBzGeraet.tsx` in T137, Schritt 4.

⚠️ **`nennfuelldruckBar` wird ANGEGEBEN und nicht vorbelegt geraten.** Ein stiller Vorgabewert wäre
das `?? 200` aus §5.12 an der Eingabeseite: die Ampel spränge für eine Flasche, deren Nenndruck
niemand kennt, von „unbekannt" auf „grün".

- [ ] **Schritt 5: `page.tsx` schreiben — der Lesepfad und die Prop-Übergabe**

```tsx
// verwaltung/(arbeit)/sauerstoff/page.tsx — RSC, KEINE Insel.
import { getDb } from "../../../_db/client";
import { o2FlaschenUebersicht, lagerorteFuerFlaschen } from "../../../_lib/lesepfade/o2";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { SauerstoffListe } from "./SauerstoffListe";

export const dynamic = "force-dynamic";

/**
 * ⚠️ `o2FlaschenUebersicht` NIMMT `DB`, NICHT `Leser` (Teil 3, Festlegung H11)
 * — dieser Pfad laeuft nie in einer Transaktion. `getDb()` ist deshalb das
 * richtige Argument und nicht ein durchgereichtes `tx`.
 *
 * ⚠️ KEIN `@ant-design/icons` und KEIN Compound-Zugriff in dieser Datei: beides
 * ist in einer Server Component HTTP 500 (Fallen 7 und 1), und weder
 * `typecheck` noch `build` noch Vitest sehen es. Die Zeichen bringt die Insel
 * aus `_ui/ikonen.tsx` mit.
 *
 * ⚠️ DIE SEITE RECHNET NICHTS. Fuellstand, Ampel und Herkunft kommen fertig aus
 * dem Lesepfad; ein `?? 200` auf den Nennfuelldruck waere hier genauso verboten
 * wie dort (§5.12) — es liesze die Ampel von „unbekannt" auf „gruen" springen.
 */
export default function SauerstoffSeite() {
  const db = getDb();
  return (
    <>
      <SeitenKopf
        titel="Sauerstoff"
        beschreibung="Flaschen mit Füllstand, Herkunft der jüngsten Messung und Standort."
      />
      <SauerstoffListe
        zeilen={o2FlaschenUebersicht(db)}
        lagerorte={lagerorteFuerFlaschen(db)}
      />
    </>
  );
}
```

- [ ] **Schritt 6: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/SauerstoffListe.test.tsx"
```

**Grün.** Alle vier Fälle laufen durch, einschließlich „zeigt die HERKUNFT" und „ohne Messung:
Nennfülldruck unbekannt".

- [ ] **Schritt 7: Gates — mit einer benannten Vorbedingung**

```bash
pnpm lint
pnpm typecheck && pnpm build   # ⚠️ erst NACH Teil 3s Ergaenzung, siehe unten
curl -s -o /dev/null -w "%{http_code}\n" "http://lagerbuch.localtest.me:3000/verwaltung/sauerstoff"
```

⚠️ **`pnpm typecheck` schlägt fehl, solange `O2FlascheZeile` kein `herkunft` trägt** — mit
`Property 'herkunft' is missing in type 'O2FlascheZeile'`. Das ist **kein Mangel dieses Tasks**,
sondern die im `Interfaces`-Block benannte Kopplung an **Teil 3, T52**, dieselbe Bauart wie T138s
Bindung an Teil 4. Zwei Wege, und nur diese zwei:

1. Teil 3 ist schon eingecheckt und trägt das Feld → alles grün, weiter.
2. Teil 3 ist es nicht → **Notiz ins Übergabeprotokoll**, `lint` läuft, `typecheck`/`build` und der
   Abruf werden in **T151, Schritt 1 und 2** nachgeholt. ⚠️ **Was NICHT geht:** das Feld hier in
   einem eigenen Typ nachbauen oder in `page.tsx` mit `?? "manuell"` auffüllen — das erste ist ein
   zweiter Lesepfad, das zweite behauptet eine Handeingabe, die nie stattgefunden hat, und beides
   sähe grün aus.

Erwartet vom Abruf: **200**. Zusätzlich beide Modi einmal ansehen: `Progress` ist ein antd-Baustein
und liest antds Tokens, der Chip daneben liest `--lb-ampel-*` — laufen die beiden im Dunkelmodus
auseinander, sieht man es nur hier.

- [ ] **Schritt 8: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/page.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/SauerstoffListe.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/NeuFlasche.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/SauerstoffListe.test.tsx"
rtk git commit -m "feat(lagerbuch): /verwaltung/sauerstoff — Fuellstand und HERKUNFT

Sechs Spalten, darunter die Herkunft der juengsten Messung (Auflage 15): ein
aus dem Check uebernommener Druck und eine von Hand erfasste Messung sind
fachlich nicht dasselbe.

Keine Messung heiszt 'Nennfuelldruck unbekannt' — nicht 0 %, nicht rot. Progress
traegt keine Ampelfarbe (antd-Baustein, antd-Tokens); die Ampelaussage traegt
der Chip daneben."
```

---

### Task 142: `/verwaltung/sauerstoff/[id]` — Flaschenblatt mit Herkunft je Zeile

**Files:** Create `verwaltung/(arbeit)/sauerstoff/[id]/page.tsx`, `.../MessungForm.tsx`,
`.../ReferenzFelder.tsx`, `.../FlascheAktivToggle.tsx`; Test `.../MessungForm.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/o2.ts` — `o2FlascheDetail`; `_actions/sauerstoff.ts` —
`messungErfassen`, `setFlascheAktiv`, `flascheSpeichern`; `_actions/loeschen.ts`; `_ui/Brotkrume`,
`_ui/Kachel`, `_ui/Chip`, `_ui/LoeschButton`. Produces `/verwaltung/sauerstoff/[id]`.

- Produces (spätere Teile sehen NUR diesen Block):
  ```tsx
  // MessungForm.tsx — "use client".
  export function MessungForm(props: { flascheId: string }): JSX.Element;

  // ReferenzFelder.tsx — "use client", auto-committend, OHNE Form (§6.4.7).
  export function ReferenzFelder(props: {
    id: string; name: string; lagerortId: string;
    groesseLiter: number | null; nennfuelldruckBar: number;
  }): JSX.Element;

  // FlascheAktivToggle.tsx — "use client".
  export function FlascheAktivToggle(props: {
    id: string; name: string; aktiv: boolean;
  }): JSX.Element;
  ```

**Verlaufs-Spalten:** `Zeitpunkt` (Mono) · `Druck` (rechtsbündig, „N bar") · **`Herkunft`** (Chip
„aus Check" / „manuell", **§6.15 Auflage 15**) · `Wer` (grauer Chip) · `Kommentar`.

⚠️ **Vier Kacheln:** aktueller Druck · Füllstand (Ampelton, `null` → grau „unbekannt") ·
Nennfülldruck · Status/Standort.
⚠️ **Der Warnkasten „Niedriger Druck" trägt AMPEL-Rot** (`.warnbox`, T100) — er ist eine
**Datenfläche**, kein `Alert type="error"` (§6.6.5).
⚠️ **`MessungForm` MIT `Form`** (Absendeknopf), Felder Druck (`InputNumber min={0}`) und Kommentar.
**0 bar ist gültig** — eine leere Flasche ist genau das, was die Ampel melden soll.
⚠️ **Brotkrume Pflicht.**
⚠️ **Der `LoeschButton` steht IN `FlascheAktivToggle`, nicht in `page.tsx`.** Seine Props
`pruefen`, `onLoeschen` und `onDeaktivieren` sind Funktionen; eine Server Component kann einer
Client-Insel nur Server Actions als Funktion übergeben, und `loescheElement` liefert
`ActionErgebnis`, nicht `void`. Die Insel ist die Stelle, an der aus beidem der Prop-Vertrag von
T110 wird — und sie ist ohnehin schon Client, weil der Aktiv-Schalter einer braucht.
⚠️ **`ReferenzFelder` steht in der Files-Zeile, weil Zeile 34 der Aufrufer-Tabelle (§3) es
verlangt:** `flascheSpeichern` hat auf `/verwaltung/sauerstoff/[id]` genau diesen einen Aufrufer.
Ohne die Datei wäre eine Action ohne Weg auf einer Seite, die sie namentlich zugewiesen bekommen
hat — und `nennfuelldruckBar` bliebe nach dem Anlegen für immer auf dem Startwert, obwohl Teil 3
(T34) `?? 200` beim **Lesen** ausdrücklich verbietet und den Vorgabewert deshalb ans **Schreiben**
gelegt hat. **Auto-committend, ohne `Form`** (§6.4.7): drei Stammdatenfelder, kein abgeschlossener
Vorgang — dieselbe Bauform wie `ReferenzEditor` (T139).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/[id]/MessungForm.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, exists, fill, submitForm } from "@/app/m/qr/_lib/test-dom";

const erfassen = vi.fn(async () => ({ ok: true as const, wert: { id: "m1" } }));
const speichern = vi.fn(async () => ({ ok: true as const, wert: { id: "f1" } }));
vi.mock("../../../../_actions/sauerstoff", () => ({
  messungErfassen: (...a: unknown[]) => erfassen(...(a as [])),
  flascheSpeichern: (...a: unknown[]) => speichern(...(a as [])),
  setFlascheAktiv: async () => ({ ok: true as const }),
}));
import { MessungForm } from "./MessungForm";
import { ReferenzFelder } from "./ReferenzFelder";

const SEITE = readFileSync(
  "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/[id]/page.tsx", "utf8");

afterEach(async () => { erfassen.mockClear(); speichern.mockClear(); await unmount(); });

describe("MessungForm", () => {
  it("hat ein Form mit Absendeknopf — nicht auto-committend", async () => {
    // §6.4.7: eine Messung ist ein abgeschlossener Vorgang mit Absendeknopf,
    // kein Feld, das beim Verlassen still bucht.
    await mount(<MessungForm flascheId="f1" />);
    expect(exists("form")).toBe(true);
    expect(exists("button[type='submit']")).toBe(true);
  });

  it("0 bar ist ein GUELTIGER Messwert und wird abgeschickt", async () => {
    // Eine leere Flasche ist genau das, was die Ampel melden soll. Zwei
    // Fallen auf einmal: ein Falsy-Guard (`if (!druck) return`) verschluckte
    // sie still, und antds `required` darf sie nicht als „leer" werten —
    // rc-field-form prueft auf undefined/null/"", 0 geht durch. Das Feld hat
    // KEINEN Vorgabewert, damit dieser Test nicht gruen wird, ohne dass die
    // Eingabe ueberhaupt angekommen ist.
    await mount(<MessungForm flascheId="f1" />);
    await fill(".ant-input-number input", "0");
    await submitForm();
    expect(erfassen).toHaveBeenCalledWith({ flascheId: "f1", druckBar: 0, kommentar: undefined });
  });

  it("laeszt keinen negativen Druck zu", async () => {
    await mount(<MessungForm flascheId="f1" />);
    expect(query(".ant-input-number input").getAttribute("aria-valuemin")).toBe("0");
  });

  it("Form.Item steht in der INSEL, nicht in der Seite (Falle 1)", () => {
    expect(SEITE).not.toMatch(/Form\.Item/);
  });
});

describe("ReferenzFelder", () => {
  it("schickt fuer eine Flasche OHNE Groesze `undefined`, nicht `null`", async () => {
    // `FlascheSchema.groesseLiter` ist `.optional()` und NICHT `.nullable()`
    // (T123): `z.coerce.number()` machte aus `null` eine 0, und `.positive()`
    // wiese sie ab. Weil das Bauteil auto-committend ist und kein Ergebnis
    // anzeigt, schluege jede Aenderung am Nennfuelldruck einer Flasche ohne
    // gepflegte Groesze STILL fehl.
    await mount(<ReferenzFelder id="f1" name="O2 klein" lagerortId="rtw-1"
                                groesseLiter={null} nennfuelldruckBar={200} />);
    await fill("input[aria-label='Nennfülldruck']", "300");
    expect(speichern).toHaveBeenCalledWith({
      id: "f1", name: "O2 klein", lagerortId: "rtw-1",
      groesseLiter: undefined, nennfuelldruckBar: 300,
    });
  });
});

describe("Flaschenblatt (page.tsx)", () => {
  it("zeigt die HERKUNFT je Verlaufszeile (Auflage 15)", () => {
    // Ein aus dem Fahrzeug-Check uebernommener Druck und eine von Hand
    // erfasste Messung sind fachlich nicht dasselbe (§5.8.1).
    expect(SEITE).toMatch(/title: "Herkunft"/);
    expect(SEITE).toMatch(/aus Check/);
    expect(SEITE).toMatch(/manuell/);
  });

  it("der Warnkasten traegt AMPEL-Rot und ist kein Alert type=error", () => {
    // §6.6.5: eine Datenflaeche, keine Stoerung. `colorError === colorPrimary`
    // (Falle 3) machte aus der Warnung eine Primaeraktion.
    expect(SEITE).toMatch(/s\.warnbox/);
    expect(SEITE).not.toMatch(/type="error"/);
  });

  it("traegt vier Kacheln und eine Brotkrume", () => {
    expect(SEITE.match(/<Kachel\b/g)?.length).toBe(4);
    expect(SEITE).toMatch(/<Brotkrume href="\/verwaltung\/sauerstoff">/);
  });

  it("gibt `flascheSpeichern` einen Weg — Zeile 34 der Aufrufer-Tabelle", () => {
    // Ohne `ReferenzFelder` waere das eine Action ohne Bedienelement auf einer
    // Seite, die sie namentlich zugewiesen bekommen hat (§6.12, Frage 1).
    expect(SEITE).toMatch(/<ReferenzFelder\b/);
    // Auto-committend, ohne Form (§6.4.7): drei Stammdatenfelder sind kein
    // abgeschlossener Vorgang.
    const felder = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/[id]/ReferenzFelder.tsx", "utf8");
    expect(felder).not.toMatch(/Form\.Item/);
  });

  it("zeigt „unbekannt\" statt 0 %, wenn es keine Messung gibt", () => {
    // `status: null` heiszt KEINE Messung — nicht 0 %, nicht rot (Teil 3, T52).
    expect(SEITE).toMatch(/status === null/);
    expect(SEITE).toMatch(/unbekannt/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/[id]/MessungForm.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./MessungForm"` — und, sobald die Insel steht,
`ENOENT: no such file or directory, open 'src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/[id]/page.tsx'`.

- [ ] **Schritt 3: `MessungForm.tsx`, `ReferenzFelder.tsx`, `FlascheAktivToggle.tsx` und `page.tsx` schreiben**

```tsx
// MessungForm.tsx — "use client", MIT Form (Absendeknopf, §6.4.7).
"use client";
import { useState, useTransition } from "react";
import { Alert, Button, Form, Input, InputNumber } from "antd";
import { messungErfassen } from "../../../../_actions/sauerstoff";

export function MessungForm({ flascheId }: { flascheId: string }) {
  const [form] = Form.useForm();
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, start] = useTransition();

  return (
    <Form
      form={form} layout="inline" disabled={laeuft}
      onFinish={(w: { druckBar: number; kommentar?: string }) => start(async () => {
        /* ⚠️ 0 BAR IST EIN GUELTIGER MESSWERT — eine leere Flasche ist genau
           das, was die Ampel melden soll. Deshalb steht hier KEIN Falsy-Guard
           (`if (!w.druckBar) return`) und KEIN `?? 0`: der Rueckfall saehe wie
           Vorsicht aus und verstecktee, dass die Eingabe gar nicht ankam. Die
           Pflicht traegt `rules={[{ required: true }]}` unten — rc-field-form
           prueft auf undefined/null/"", die 0 geht durch. Die Action prueft
           serverseitig dasselbe: `z.coerce.number().int().min(0)` (T123). */
        const erg = await messungErfassen({
          flascheId,
          druckBar: w.druckBar,
          kommentar: w.kommentar?.trim() || undefined,
        });
        if (!erg.ok) {
          setFehler(erg.fehler);
          form.setFields(Object.entries(erg.feldFehler ?? {})
            .map(([name, errors]) => ({ name, errors: [errors] })));
        } else {
          setFehler(null);
          setMeldung("Messung erfasst.");
          form.resetFields();
        }
      })}
    >
      {/* KEIN <span> um das Feld: `Form.Item` klont SEIN DIREKTES KIND und
          haengt `value`/`onChange` daran. Ein Wrapper bekaeme beides, das
          Eingabefeld nichts — das Formular waere still leer. */}
      <Form.Item name="druckBar" label="Druck (bar)"
                 rules={[{ required: true, message: "Druck erforderlich" }]}>
        <InputNumber min={0} max={400} aria-label="Druck (bar)" />
      </Form.Item>
      <Form.Item name="kommentar" label="Kommentar">
        <Input placeholder="optional" aria-label="Kommentar" style={{ minWidth: 220 }} />
      </Form.Item>
      {/* Die Beschriftung ist Vertrag: Zeile 36 der Aufrufer-Tabelle (§3)
          nennt sie namentlich. */}
      <Button type="primary" htmlType="submit" loading={laeuft}>Messung speichern</Button>
      {meldung ? <Alert type="success" showIcon={false} message={meldung}
                        style={{ marginInlineStart: 12 }} /> : null}
      {/* Fehler sind `warning`, nie `error`: colorError === colorPrimary
          (Falle 3) — ein rotes Alert saehe aus wie die Primaeraktion. */}
      {fehler ? <Alert type="warning" showIcon={false} message={fehler}
                       style={{ marginInlineStart: 12 }} /> : null}
    </Form>
  );
}
```

```tsx
// ReferenzFelder.tsx — "use client", AUTO-COMMITTEND, ohne Form (§6.4.7).
"use client";
import { useState, useTransition } from "react";
import { Flex, InputNumber } from "antd";
import { flascheSpeichern } from "../../../../_actions/sauerstoff";

/**
 * DIE DREI STAMMDATENFELDER DER FLASCHE — der einzige Aufrufer von
 * `flascheSpeichern` auf dieser Seite (Zeile 34 der Aufrufer-Tabelle, §3).
 *
 * ⚠️ WARUM ES SIE GEBEN MUSZ: `nennfuelldruckBar` bekommt seinen Vorgabewert
 * 200 beim SCHREIBEN (T123), weil Teil 3 (T34) `?? 200` beim LESEN verboten
 * hat — eine Flasche ohne gepflegten Wert wuerde sonst still mit 200 gerechnet
 * und die Ampel spraenge von „gelb" auf „grün". Ohne ein Feld, das den Wert
 * nachtraegt, bleibt der Startwert fuer immer stehen.
 *
 * ⚠️ AUTO-COMMITTEND, OHNE `Form` (§6.4.7): drei Stammdatenfelder sind kein
 * abgeschlossener Vorgang mit Absendeknopf. Dieselbe Bauform wie
 * `ReferenzEditor` (T139) — `onChange` mit 400 ms Ruhe.
 */
export function ReferenzFelder({
  id, name, lagerortId, groesseLiter, nennfuelldruckBar,
}: {
  id: string; name: string; lagerortId: string;
  groesseLiter: number | null; nennfuelldruckBar: number;
}) {
  const [groesse, setGroesse] = useState(groesseLiter);
  const [nenn, setNenn] = useState(nennfuelldruckBar);
  const [, start] = useTransition();

  /**
   * ⚠️ `null` DARF HIER NICHT HINAUS. `FlascheSchema.groesseLiter` ist
   * `z.coerce.number().int().positive().optional()` (T123,
   * `_actions/sauerstoff.ts`) — `.optional()`, NICHT `.nullable()`. Ein `null`
   * wuerde von `z.coerce.number()` zu 0 und faellt dann durch `.positive()`:
   * jede Aenderung am Nennfuelldruck einer Flasche OHNE gepflegte Groesze
   * schluege still fehl, weil dieses Bauteil auto-committend ist und kein
   * Ergebnis anzeigt. Der Lesepfad liefert `number | null` — die Umsetzung
   * nach `undefined` ist genau diese Naht.
   */
  const speichere = (teil: { groesseLiter?: number | null; nennfuelldruckBar?: number }) =>
    start(async () => {
      const g = teil.groesseLiter !== undefined ? teil.groesseLiter : groesse;
      await flascheSpeichern({
        id, name, lagerortId,
        groesseLiter: g ?? undefined,
        nennfuelldruckBar: teil.nennfuelldruckBar ?? nenn,
      });
    });

  return (
    <Flex gap={16} wrap align="center" style={{ marginBlockEnd: 12 }}>
      <label>
        Größe (l){" "}
        <InputNumber
          min={0} max={100} value={groesse} aria-label="Größe in Litern"
          onChange={(v) => { setGroesse(v); speichere({ groesseLiter: v }); }}
        />
      </label>
      <label>
        Nennfülldruck (bar){" "}
        <InputNumber
          min={1} max={400} value={nenn} aria-label="Nennfülldruck"
          onChange={(v) => { if (v === null) return; setNenn(v); speichere({ nennfuelldruckBar: v }); }}
        />
      </label>
    </Flex>
  );
}
```

```tsx
// FlascheAktivToggle.tsx — "use client". Traegt AUCH den LoeschButton.
"use client";
import { useTransition } from "react";
import { Flex, Switch } from "antd";
import { setFlascheAktiv } from "../../../../_actions/sauerstoff";
import { pruefeLoeschbar, loescheElement, deaktiviereElement }
  from "../../../../_actions/loeschen";
import { LoeschButton } from "../../../../_ui/LoeschButton";

/**
 * DIE GEFAHRENZONE DER FLASCHE — Schalter UND Loeschknopf in EINER Insel.
 *
 * `LoeschButton` (T110) nimmt `pruefen`, `onLoeschen` und `onDeaktivieren` als
 * FUNKTIONEN entgegen. Eine Server Component kann einer Client-Insel nur eine
 * Server Action als Funktion uebergeben, und `loescheElement` liefert
 * `ActionErgebnis`, nicht `void` — der Prop-Vertrag passt also nicht direkt.
 * Hier entsteht er: die Insel ist ohnehin Client, weil der Schalter einen
 * `useTransition` braucht.
 */
export function FlascheAktivToggle({
  id, name, aktiv,
}: { id: string; name: string; aktiv: boolean }) {
  const [laeuft, start] = useTransition();
  return (
    <Flex gap={12} align="center">
      <Switch
        checked={aktiv} disabled={laeuft} aria-label="Flasche aktiv"
        onChange={(v) => start(async () => { await setFlascheAktiv({ id, aktiv: v }); })}
      />
      <span>{aktiv ? "aktiv" : "inaktiv"}</span>
      <LoeschButton
        name={name} typLabel="Sauerstoff-Flasche"
        pruefen={async () => {
          const e = await pruefeLoeschbar("o2Flasche", id);
          return e.ok ? e.wert : { loeschbar: false as const,
            grund: e.fehler, kannDeaktivieren: true };
        }}
        onLoeschen={async () => { await loescheElement("o2Flasche", id); }}
        onDeaktivieren={async () => { await deaktiviereElement("o2Flasche", id); }}
      />
    </Flex>
  );
}
```

```tsx
// page.tsx
import { notFound } from "next/navigation";
import { Table } from "antd";
import { getDb } from "../../../../_db/client";
import { o2FlascheDetail } from "../../../../_lib/lesepfade/o2";
import { ampelTon } from "../../../../_lib/format";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { Kachel } from "../../../../_ui/Kachel";
import { Chip } from "../../../../_ui/Chip";
import s from "../../../../_ui/verwaltung.module.css";
import { MessungForm } from "./MessungForm";
import { ReferenzFelder } from "./ReferenzFelder";
import { FlascheAktivToggle } from "./FlascheAktivToggle";

export const dynamic = "force-dynamic";

export default async function FlaschenblattSeite({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = o2FlascheDetail(getDb(), id);
  if (!d) notFound();
  const f = d.flasche;
  const juengste = d.verlauf[0] ?? null;

  return (
    <>
      {/* Brotkrume Pflicht: `aktiverEintrag` markiert Detailseiten nicht (§6.3.3). */}
      <Brotkrume href="/verwaltung/sauerstoff">Sauerstoff</Brotkrume>
      <SeitenKopf titel={f.name}
        beschreibung="Der aktuelle Druck ist immer die jüngste Messung — es gibt kein denormalisiertes Feld, und eine falsche Messung ist durch eine neue korrigierbar."
        aktionen={<FlascheAktivToggle id={f.id} name={f.name} aktiv={f.aktiv} />} />

      <div className={s.kpis}>
        <Kachel zahl={juengste ? `${juengste.druckBar} bar` : "–"} beschriftung="Aktueller Druck" />
        {/* ⚠️ KEINE MESSUNG heiszt `status: null` — nicht 0 % und nicht rot
            (Teil 3, T52). Ein `?? 200` beim Lesen liesze die Ampel von „gelb"
            auf „grün" springen; hier heiszt derselbe Zustand „unbekannt". */}
        <Kachel
          zahl={d.status === null ? "unbekannt" : `${d.status.prozent} %`}
          beschriftung="Füllstand"
          ton={d.status === null ? "grau" : ampelTon(d.status.ampel)} />
        <Kachel zahl={`${f.nennfuelldruckBar} bar`} beschriftung="Nennfülldruck" />
        <Kachel zahl={f.aktiv ? "aktiv" : "inaktiv"} beschriftung={d.lagerortName} />
      </div>

      {/* ⚠️ AMPEL-ROT AUF EINER DATENFLAECHE, kein `Alert type="error"`
          (§6.6.5). `colorError === colorPrimary === #c8000f` (Falle 3): ein
          rotes Alert saehe aus wie eine Primaeraktion, und genau hier traegt
          Rot fachliche Bedeutung. */}
      {d.status?.niedrig ? (
        <div className={s.warnbox} style={SCHRIFT.text}>
          Niedriger Druck — die Flasche gehört getauscht.
        </div>
      ) : null}

      <ReferenzFelder
        id={f.id} name={f.name} lagerortId={f.lagerortId}
        groesseLiter={f.groesseLiter} nennfuelldruckBar={f.nennfuelldruckBar} />

      <MessungForm flascheId={f.id} />

      <Table
        rowKey="id" pagination={false} scroll={{ x: "max-content" }}
        aria-label="Messungen" dataSource={d.verlauf}
        locale={{ emptyText: "Für diese Flasche wurde noch keine Messung erfasst." }}
        columns={[
          { title: "Zeitpunkt", dataIndex: "ts",
            render: (t: Date) => (
              <span className={s.jts}>
                {t.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
              </span>
            ) },
          { title: "Druck", dataIndex: "druckBar", align: "right" as const,
            render: (v: number) => <span style={SCHRIFT.mono}>{v} bar</span> },
          {
            title: "Herkunft", dataIndex: "ausCheck",
            /* ⚠️ §6.15, Auflage 15 (§5.8.1): JE ZEILE sichtbar, ob der Druck
               aus einem Fahrzeug-Check kam oder von Hand erfasst wurde. Die
               Angabe haengt am `quelleTyp` und ist heute schon da — sie wird
               nur nirgends gezeigt. `ausCheck` kommt fertig aus T52. */
            render: (v: boolean) => <Chip ton="grau">{v ? "aus Check" : "manuell"}</Chip>,
          },
          { title: "Wer", dataIndex: "wer",
            render: (v: string) => <Chip ton="grau">{v}</Chip> },
          { title: "Kommentar", dataIndex: "kommentar",
            render: (v: string | null) => <span style={SCHRIFT.neben}>{v ?? "—"}</span> },
        ]}
      />
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/[id]/MessungForm.test.tsx"
```

Erwartet: PASS.

- [ ] **Schritt 5: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/[id]/"
rtk git commit -m "feat(lagerbuch): /verwaltung/sauerstoff/[id] — Verlauf mit Herkunft je Zeile

Auflage 15 auch hier: der Verlauf zeigt je Zeile, ob der Druck aus einem
Fahrzeug-Check kam oder von Hand erfasst wurde.

Der Warnkasten 'Niedriger Druck' traegt Ampel-Rot und ist kein Alert
type=error — er ist eine Datenflaeche. 0 bar bleibt ein gueltiger Messwert."
```

---

### Task 143: `/verwaltung/geraete` — Geräteliste mit Mehrfachauswahl

**Files:** Create `verwaltung/(arbeit)/geraete/page.tsx`, `.../GeraeteListe.tsx`,
`.../NeuGeraet.tsx`; Test `.../GeraeteListe.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/geraete.ts` (T53) — `geraeteUebersicht`;
`_lib/lesepfade/bz.ts` — `lagerortOptionen`; `_lib/format.ts` — `geraetFaelligChip`;
`_lib/mengen.ts` (T104) — `toggleInSet`; `_actions/geraete.ts` — `geraetSpeichern`.
Produces `/verwaltung/geraete`.

- Produces (spätere Teile sehen NUR diesen Block):
  ```tsx
  // GeraeteListe.tsx — "use client".
  export function sucheTrifft(z: GeraetZeile, begriff: string): boolean;
  export function GeraeteListe(props: {
    zeilen: GeraetZeile[];
    lagerorte: { id: string; name: string; typ: "lager" | "fahrzeug" }[];
  }): JSX.Element;

  // NeuGeraet.tsx — "use client".
  export function NeuGeraet(props: {
    lagerorte: { id: string; name: string; typ: "lager" | "fahrzeug" }[];
  }): JSX.Element;
  ```

**Spalten, abgelesen aus `GeraeteListe.tsx:53-77`:**

| # | Titel | Anmerkung |
|---|---|---|
| 1 | Gerät | Link + Barcode in Mono |
| 2 | Klasse | Chip mit Zeichen `medizin` bzw. `objekt` |
| 3 | Standort | `lagerortName` |
| 4 | Fälligkeit | `geraetFaelligChip(typ, faelligkeit)` → `{ ton, text }`; **`null` ⇒ keine Spalte** |
| 5 | Status | inaktiv-Chip |

**Suchfeldmenge (5 von 6):** Name · Barcode · Lagerort (`GeraeteListe.tsx:16-24`).
**Filter:** **Medizin/Objekt als `Checkbox.Group`** (Mehrfachauswahl, `toggleInSet`) · nur fällige ·
inaktive ausblenden.

⚠️ **`Checkbox.Group` für die Klassen, einzelne `Checkbox` für die Schalter** (§6.4.4).
`Checkbox.Group` ist semantisch genau das, was `toggleInSet` modelliert — **`Segmented` und
`Tag.CheckableTag` sind ausgeschlossen** (letzteres ist ein Compound-Zugriff).
⚠️ **Die Existenz des Fälligkeits-Chips hängt am TYP** (Teil 3, T39): `medizin` hat **immer** einen
(auch ohne Datum: „kein MTK-Datum", grau), `objekt` ohne Ablaufdatum hat **keinen**.
⚠️ **Beide Klassen müssen im Bild sein** — §6.5.5 nennt das ausdrücklich als die einzige Probe
darauf, dass die **richtigen** Fachzeichen gewählt wurden. Der Abruf gehört zu T151.
⚠️ **`toggleInSet` hängt am `onChange` DER EINZELNEN OPTION, nicht am `onChange` der Gruppe.**
Das Gruppen-`onChange` liefert die **vollständige** neue Auswahl als Array (antd
`checkbox/Group.js:63`) — daraus `new Set(...)` zu bauen wäre möglich und ließe `toggleInSet`
(T104) mit **null** Konsumenten zurück, obwohl sein Produces-Block genau diese Seite und T148
nennt. `CheckboxOptionType.onChange` (antd `checkbox/Group.d.ts`) wird je Option durchgereicht
(`Group.js:80`) und ist das Signal „**dieser** Wert wurde umgeschaltet". **Die Gruppe bekommt
deshalb KEIN eigenes `onChange`** — sonst liefe jeder Klick zweimal.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/GeraeteListe.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, unmount, click, fill, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import { GeraeteListe, sucheTrifft } from "./GeraeteListe";
import s from "../../../_ui/verwaltung.module.css";

vi.mock("../../../_actions/geraete", () => ({
  geraetSpeichern: async () => ({ ok: true, wert: { id: "x" } }),
}));

const MED = {
  id: "g-med", typ: "medizin" as const, name: "Corpuls C3", barcode: "SN-1",
  lagerortId: "handlager", lagerortName: "Handlager", anmerkung: null,
  mtkFaellig: null, beschreibung: null, ablaufdatum: null, aktiv: true,
  faelligkeit: { faelligAm: null, tageBisFaellig: null, ampel: "gelb" as const,
                 ueberfaellig: false, keinDatum: true },
  chip: { ton: "grau" as const, text: "kein MTK-Datum" },
};
const OBJ = {
  id: "g-obj", typ: "objekt" as const, name: "Spineboard", barcode: null,
  lagerortId: "rtw-1", lagerortName: "RTW 1", anmerkung: null,
  mtkFaellig: null, beschreibung: null, ablaufdatum: null, aktiv: false,
  faelligkeit: { faelligAm: null, tageBisFaellig: null, ampel: "gruen" as const,
                 ueberfaellig: false, keinDatum: true },
  chip: null,
};
const ZEILEN = [MED, OBJ];
afterEach(async () => { await unmount(); });

describe("GeraeteListe", () => {
  it("traegt die fuenf abgelesenen Spalten", async () => {
    await mount(<GeraeteListe zeilen={ZEILEN} lagerorte={[]} />);
    expect(queryAll("thead th").map((th) => th.textContent))
      .toEqual(["Gerät", "Klasse", "Standort", "Fälligkeit", "Status"]);
  });

  it("sucht ueber Name, Barcode UND Lagerort (5 von 6)", () => {
    expect(sucheTrifft(MED, "corpuls")).toBe(true);
    expect(sucheTrifft(MED, "SN-1")).toBe(true);
    expect(sucheTrifft(MED, "handlager")).toBe(true);
    expect(sucheTrifft(MED, "RTW")).toBe(false);
  });

  it("die Existenz des Faelligkeits-Chips haengt am TYP", async () => {
    // `medizin` hat IMMER einen (auch ohne Datum: „kein MTK-Datum", grau),
    // `objekt` ohne Ablaufdatum hat KEINEN — ein grauer Chip an jedem
    // Spineboard waere Grundrauschen (§5.10, Teil 3 T39).
    await mount(<GeraeteListe zeilen={ZEILEN} lagerorte={[]} />);
    expect(document.body.textContent).toContain("kein MTK-Datum");
    expect(queryAll("tbody tr").length).toBe(2);
  });

  it("die Klassenfilter sind eine Checkbox.Group, kein Segmented und kein CheckableTag", async () => {
    // §6.4.4: `Segmented` behauptete sich ausschlieszende Werte,
    // `Tag.CheckableTag` waere ein Compound-Zugriff (Falle 1).
    await mount(<GeraeteListe zeilen={ZEILEN} lagerorte={[]} />);
    expect(exists(".ant-checkbox-group")).toBe(true);
    expect(exists(".ant-segmented")).toBe(false);
    expect(exists(".ant-tag-checkable")).toBe(false);
  });

  it("ein Klassen-Klick schaltet GENAU einen Wert um (toggleInSet, immutabel)", async () => {
    // Liefe das Gruppen-onChange zusaetzlich, schaltete ein Klick zweimal und
    // die Auswahl bliebe leer — ein Klick, der nichts tut, ohne Meldung.
    await mount(<GeraeteListe zeilen={ZEILEN} lagerorte={[]} />);
    await click(".ant-checkbox-group .ant-checkbox-input");
    expect(queryAll("tbody tr").length).toBe(1);
    expect(document.body.textContent).toContain("Corpuls C3");
  });

  it("zeigt „X von Y\" erst beim Filtern", async () => {
    await mount(<GeraeteListe zeilen={ZEILEN} lagerorte={[]} />);
    await fill("input[type='search']", "zzz");
    expect(query(`.${s.filtertreffer}`).textContent).toBe("0 von 2");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/GeraeteListe.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./GeraeteListe"`.

- [ ] **Schritt 3: `GeraeteListe.tsx`, `NeuGeraet.tsx` und `page.tsx` schreiben**

```tsx
// GeraeteListe.tsx — "use client".
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Checkbox, Flex, Table } from "antd";
import { falte } from "../../../_lib/suche";
import { toggleInSet } from "../../../_lib/mengen";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import { NeuGeraet } from "./NeuGeraet";
import type { GeraetZeile } from "../../../_lib/lesepfade/geraete";
import type { GeraetTyp } from "../../../_lib/domain/geraet";

/** SUCHFELDMENGE 5 VON 6: Name · Barcode · Lagerort. */
export function sucheTrifft(z: GeraetZeile, begriff: string): boolean {
  const q = falte(begriff.trim());
  return !q || falte(`${z.name} ${z.barcode ?? ""} ${z.lagerortName}`).includes(q);
}

export function GeraeteListe({
  zeilen, lagerorte,
}: {
  zeilen: GeraetZeile[];
  lagerorte: { id: string; name: string; typ: "lager" | "fahrzeug" }[];
}) {
  const [suche, setSuche] = useState("");
  const [klassen, setKlassen] = useState<ReadonlySet<GeraetTyp>>(new Set());
  const [nurFaellig, setNurFaellig] = useState(false);
  const [ohneInaktive, setOhneInaktive] = useState(false);

  const gefiltert = useMemo(() => zeilen.filter((z) => {
    if (ohneInaktive && !z.aktiv) return false;
    if (klassen.size > 0 && !klassen.has(z.typ)) return false;
    if (nurFaellig && (z.faelligkeit.keinDatum || z.faelligkeit.ampel === "gruen")) return false;
    return sucheTrifft(z, suche);
  }), [zeilen, suche, klassen, nurFaellig, ohneInaktive]);

  /**
   * ⚠️ `toggleInSet` HAENGT AM onChange DER EINZELNEN OPTION.
   *
   * Das Gruppen-`onChange` liefert die VOLLSTAENDIGE neue Auswahl als Array
   * (antd `checkbox/Group.js:63`); daraus `new Set(...)` zu bauen liesze
   * `toggleInSet` (T104) mit null Konsumenten zurueck, obwohl sein
   * Produces-Block genau diese Seite nennt. `CheckboxOptionType.onChange`
   * wird je Option durchgereicht (`Group.js:80`) und ist das Signal „DIESER
   * Wert wurde umgeschaltet". Die Gruppe bekommt deshalb KEIN eigenes
   * `onChange` — sonst liefe jeder Klick zweimal und die Auswahl bliebe leer.
   */
  const um = (t: GeraetTyp) => () => setKlassen((s) => toggleInSet(s, t));

  return (
    <>
      <Flex gap={12} wrap align="center" style={{ marginBlockEnd: 12 }}>
        <Suchfeld wert={suche} onWert={setSuche}
                  platzhalter="Gerät, Barcode oder Lagerort suchen…" />
        {/* Mehrfachauswahl -> Checkbox.Group (§6.4.4). Beide Klassen stehen
            nebeneinander im Bild: §6.5.5 nennt das als die einzige Probe
            darauf, dass die RICHTIGEN Fachzeichen gewaehlt wurden. */}
        <Checkbox.Group
          value={[...klassen]}
          options={[
            { value: "medizin", onChange: um("medizin"),
              label: <span><Ikone name="medizin" groesse={12} /> Medizin</span> },
            { value: "objekt", onChange: um("objekt"),
              label: <span><Ikone name="objekt" groesse={12} /> Objekt</span> },
          ]}
        />
        {/* Einzelne, NICHT gegenseitig ausschlieszende Schalter -> einzelne
            Checkbox. Ein `Segmented` behauptete das Gegenteil (§6.4.4). */}
        <Checkbox checked={nurFaellig} onChange={(e) => setNurFaellig(e.target.checked)}>
          nur fällige
        </Checkbox>
        <Checkbox checked={ohneInaktive} onChange={(e) => setOhneInaktive(e.target.checked)}>
          inaktive ausblenden
        </Checkbox>
        <Trefferanzeige gezeigt={gefiltert.length} gesamt={zeilen.length} />
        <NeuGeraet lagerorte={lagerorte} />
      </Flex>
      <Table
        rowKey="id" pagination={false} scroll={{ x: "max-content" }}
        aria-label="Geräte" dataSource={gefiltert}
        locale={{ emptyText: suche || klassen.size > 0
          ? "Kein Gerät passt zu Suche und Filter."
          : "Noch keine Geräte. Lege oben das erste an." }}
        columns={[
          { title: "Gerät", dataIndex: "name",
            render: (v: string, z) => (
              <span>
                <Link href={`/verwaltung/geraete/${z.id}`} style={{ fontWeight: 600 }}>{v}</Link>
                {z.barcode
                  ? <span style={{ ...SCHRIFT.mono, marginInlineStart: 8 }}>{z.barcode}</span>
                  : null}
              </span>
            ) },
          { title: "Klasse", dataIndex: "typ",
            render: (v: GeraetTyp) => (
              <Chip ton="grau" zeichen={v === "medizin" ? "medizin" : "objekt"}>
                {v === "medizin" ? "Medizin" : "Objekt"}
              </Chip>
            ) },
          { title: "Standort", dataIndex: "lagerortName" },
          {
            title: "Fälligkeit", dataIndex: "chip",
            /* ⚠️ DIE EXISTENZ DES CHIPS HAENGT AM TYP (Teil 3, T39):
               `medizin` hat IMMER einen (auch ohne Datum: „kein MTK-Datum",
               grau), `objekt` ohne Ablaufdatum hat KEINEN — ein grauer Chip an
               jedem Spineboard waere Grundrauschen (§5.10).

               `geraetFaelligChip` ist bereits im LESEPFAD gelaufen (T53) und
               liegt als `z.chip` an der Zeile. Ihn hier erneut zu rufen hiesze,
               `DatumFaelligkeit` durch den RSC-Payload zu schicken UND die
               Textregel zu duplizieren. */
            render: (c: { ton: "rot" | "gelb" | "ok" | "grau"; text: string } | null) =>
              c === null ? null
                : <Chip ton={c.ton} zeichen={c.ton === "rot" ? "warnung" : undefined}>{c.text}</Chip>,
          },
          { title: "Status", dataIndex: "aktiv",
            render: (v: boolean) => v ? null : <Chip ton="grau">inaktiv</Chip> },
        ]}
      />
    </>
  );
}
```

`NeuGeraet.tsx` ist eine `"use client"`-Insel: ein `Button` „Neues Gerät" öffnet ein `Modal` mit
`Form` (Absendeknopf) und derselben Feldmenge wie `GeraetForm` (T144) — `Radio.Group` Typ,
`Input` Bezeichnung mit `placeholder="z. B. Corpuls C3"`, `Input` Barcode mit
`placeholder="Barcode / Seriennummer"`, `Select showSearch` mit `aria-label="Standort"`, und
typabhängig `DatePicker` MTK-Fällig bzw. Beschreibung + `DatePicker` Ablaufdatum. Sie ruft
`geraetSpeichern` aus `_actions/geraete.ts` **ohne `id`**, zeigt Feldfehler über `form.setFields`
und schließt bei `ok` das `Modal`. Der Absendeknopf heißt **„Gerät anlegen"** — `geraete.spec.ts:20`
greift ihn namentlich, und die drei Platzhalter oben stehen ebenso in `geraete.spec.ts:17-18`.

```tsx
// page.tsx
import { getDb } from "../../../_db/client";
import { geraeteUebersicht } from "../../../_lib/lesepfade/geraete";
import { lagerortOptionen } from "../../../_lib/lesepfade/bz";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { GeraeteListe } from "./GeraeteListe";

export const dynamic = "force-dynamic";

export default function GeraeteSeite() {
  const db = getDb();
  return (
    <>
      <SeitenKopf titel="Geräte"
        beschreibung="Medizintechnik mit MTK-Frist und Objekte mit Ablaufdatum — zwei Klassen, eine Liste." />
      <GeraeteListe zeilen={geraeteUebersicht(db, new Date())} lagerorte={lagerortOptionen(db)} />
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/GeraeteListe.test.tsx"
```

Erwartet: PASS.

- [ ] **Schritt 5: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/page.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/GeraeteListe.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/NeuGeraet.tsx" \
            "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/GeraeteListe.test.tsx"
rtk git commit -m "feat(lagerbuch): /verwaltung/geraete — Mehrfachauswahl als Checkbox.Group

Fuenf Spalten; Klasse als Chip mit den Fachzeichen medizin/objekt. Die
Klassenfilter sind eine Checkbox.Group (genau das, was toggleInSet
modelliert), die Schalter einzelne Checkboxen — Segmented und
Tag.CheckableTag sind ausgeschlossen.

toggleInSet haengt am onChange der EINZELNEN Option: das Gruppen-onChange
liefert die vollstaendige Auswahl und liesze T104 ohne Konsumenten. Die Gruppe
bekommt deshalb kein eigenes onChange, sonst liefe jeder Klick zweimal.

Die Existenz des Faelligkeits-Chips haengt am Typ: medizin hat immer einen
(auch ohne Datum), objekt ohne Ablaufdatum hat keinen."
```

---

### Task 144: `/verwaltung/geraete/[id]` — das eine echte Stammdatenformular

**Files:** Create `verwaltung/(arbeit)/geraete/[id]/page.tsx`, `.../GeraetForm.tsx`,
`.../GeraetAktivToggle.tsx`; Test `.../GeraetForm.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/geraete.ts` — `geraetById`; `_lib/lesepfade/bz.ts` —
`lagerortOptionen`; `_actions/geraete.ts`, `_actions/loeschen.ts`; `_ui/Brotkrume`, `_ui/Chip`,
`_ui/LoeschButton`. Produces `/verwaltung/geraete/[id]`.

- Produces (spätere Teile sehen NUR diesen Block):
  ```tsx
  // GeraetForm.tsx — "use client".
  export type GeraetInitial = {
    id: string; typ: "medizin" | "objekt"; name: string; barcode: string | null;
    lagerortId: string; anmerkung: string | null; mtkFaellig: string | null;
    beschreibung: string | null; ablaufdatum: string | null;
  };
  export function GeraetForm(props: {
    initial: GeraetInitial;
    lagerorte: { id: string; name: string; typ: "lager" | "fahrzeug" }[];
  }): JSX.Element;

  // GeraetAktivToggle.tsx — "use client".
  export function GeraetAktivToggle(props: {
    id: string; name: string; aktiv: boolean;
  }): JSX.Element;
  ```

**`GeraetForm` ist das einzige echte Stammdatenformular der Verwaltung** (§6.2.3) — der eine Ort, an
dem `antd Form` + `Form.Item` + `useActionState` **wirklich passt**, und zwar **innerhalb der Insel**.

**Felder:** `Radio.Group` Typ (medizin/objekt) · Name · Barcode · `Select showSearch` Standort ·
Anmerkung · **typabhängig**: `DatePicker` MTK-Fällig (medizin) bzw. Beschreibung + `DatePicker`
Ablaufdatum (objekt).

⚠️ **`geraete.spec.ts:66` (`button "Defekt"`) STIRBT hier**, sobald die Eingabe auf `Radio.Group`
umgestellt wird (§12.5, §6.11). **Ersatzanker:** `getByRole("radio", { name: "Defekt" })` — und die
Zusicherung wird **namentlich gegen ihre alte Fassung gehalten** (§6.11, Regel 2).
⚠️ **`geraete.spec.ts:23-24` greift `combobox "Standort"`.** antds `Select` setzt `role="combobox"`
ebenfalls — die Zusicherung wird trotzdem **einmal gegen das gerenderte Bauteil** geprüft, nicht gegen
die Absicht.
⚠️ **Typfremde Felder werden ausgeblendet, nicht nur ignoriert.** Die Action hält sie auf `null`
(T121); das Formular zeigt sie erst gar nicht — sonst tippt jemand ein MTK-Datum in ein Objekt und
wundert sich, dass es verschwindet.
⚠️ **Brotkrume Pflicht.**
⚠️ **Die beiden Datumsfelder formatieren `YYYY-MM-DD` INLINE** — `_ui/monat.ts` (T127) führt
ausschließlich `monatAusPicker` (→ `"YYYY-MM"`) und nennt **drei** Konsumenten namentlich; ein
vierter Export dort widerspräche T127 und der Datei-Eigentümertabelle. `ChecksFilter` (T135) macht
es an derselben Stelle genauso: `d.format("YYYY-MM-DD")` direkt am `onChange`. Serverseitig prüft
`TAG_REGEX` (T121).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/[id]/GeraetForm.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, click, query, exists, queryAll } from "@/app/m/qr/_lib/test-dom";

const speichern = vi.fn(async () => ({ ok: true as const, wert: { id: "g1" } }));
vi.mock("../../../../_actions/geraete", () => ({
  geraetSpeichern: (...a: unknown[]) => speichern(...(a as [])),
  setGeraetAktiv: async () => ({ ok: true as const }),
}));
import { GeraetForm } from "./GeraetForm";

const SEITE = readFileSync(
  "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/[id]/page.tsx", "utf8");

const MED = {
  id: "g1", typ: "medizin" as const, name: "Corpuls C3", barcode: "SN-1",
  lagerortId: "handlager", anmerkung: null, mtkFaellig: "2027-03-01",
  beschreibung: null, ablaufdatum: null,
};
const ORTE = [{ id: "handlager", name: "Handlager", typ: "lager" as const }];
afterEach(async () => { speichern.mockClear(); await unmount(); });

describe("GeraetForm", () => {
  it("der Typ ist eine Radio.Group, keine Knopfreihe mit aria-pressed", async () => {
    // `GeraetForm.tsx:78-93` rendert heute `<button aria-pressed>`. Eine echte
    // Radiogruppe hat einen Tabstop, Pfeiltasten waehlen nativ
    // (docs/design/README.md:144, §6.4.4).
    await mount(<GeraetForm initial={MED} lagerorte={ORTE} />);
    expect(exists(".ant-radio-group")).toBe(true);
    expect(exists("button[aria-pressed]")).toBe(false);
    expect(queryAll(".ant-radio-group input[type='radio']").length).toBe(2);
  });

  it("das Standortfeld traegt WIRKLICH role=combobox — einmal gegen das Bauteil geprueft", async () => {
    // `geraete.spec.ts:23-24` greift `combobox "Standort"`. Geprueft wird das
    // GERENDERTE antd-Bauteil, nicht die Absicht (§6.11, Regel 2): erst die
    // Rolle finden, dann den Namen daran pruefen — die umgekehrte Reihenfolge
    // fiele nicht auf, wenn `Select` die Rolle woanders setzte.
    await mount(<GeraetForm initial={MED} lagerorte={ORTE} />);
    const feld = query("input[role='combobox']");
    expect(feld.getAttribute("aria-label")).toBe("Standort");
  });

  it("medizin zeigt MTK und blendet die Objektfelder AUS", async () => {
    await mount(<GeraetForm initial={MED} lagerorte={ORTE} />);
    expect(exists("input[aria-label='Nächste MTK']")).toBe(true);
    expect(exists("input[aria-label='Ablaufdatum']")).toBe(false);
    expect(exists("input[aria-label='Beschreibung']")).toBe(false);
  });

  it("nach dem Wechsel auf objekt sind MTK weg und Ablauf/Beschreibung da", async () => {
    // AUSGEBLENDET, nicht nur ignoriert: die Action haelt typfremde Felder auf
    // null (T121). Bliebe das Feld stehen, tippte jemand ein MTK-Datum in ein
    // Objekt und wunderte sich, dass es verschwindet.
    await mount(<GeraetForm initial={MED} lagerorte={ORTE} />);
    await click(".ant-radio-group input[value='objekt']");
    expect(exists("input[aria-label='Nächste MTK']")).toBe(false);
    expect(exists("input[aria-label='Ablaufdatum']")).toBe(true);
    expect(exists("input[aria-label='Beschreibung']")).toBe(true);
  });

  it("Form.Item steht in der INSEL, nicht in der Seite (Falle 1)", () => {
    expect(SEITE).not.toMatch(/Form\.Item/);
    expect(SEITE).toMatch(/<Brotkrume href="\/verwaltung\/geraete">/);
  });

  it("die Seite ruft `monatAusPicker` NICHT — die Datumsfelder sind tagesgenau", () => {
    // `_ui/monat.ts` (T127) liefert „YYYY-MM"; mtkFaellig und ablaufdatum
    // pruefen serverseitig gegen TAG_REGEX („YYYY-MM-DD", T121).
    const insel = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/[id]/GeraetForm.tsx", "utf8");
    expect(insel).not.toMatch(/monatAusPicker/);
    expect(insel).toMatch(/YYYY-MM-DD/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/[id]/GeraetForm.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./GeraetForm"`.

- [ ] **Schritt 3: `GeraetForm.tsx`, `GeraetAktivToggle.tsx` und `page.tsx` schreiben**

```tsx
// GeraetForm.tsx — "use client". DAS EINE echte Stammdatenformular (§6.2.3).
"use client";
import { useActionState, useEffect } from "react";
import { Alert, Button, DatePicker, Form, Input, Radio, Select } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { geraetSpeichern } from "../../../../_actions/geraete";
import type { ActionErgebnis } from "../../../../_lib/actionErgebnis";

export type GeraetInitial = {
  id: string; typ: "medizin" | "objekt"; name: string; barcode: string | null;
  lagerortId: string; anmerkung: string | null; mtkFaellig: string | null;
  beschreibung: string | null; ablaufdatum: string | null;
};

type Werte = {
  typ: "medizin" | "objekt"; name: string; barcode?: string; lagerortId: string;
  anmerkung?: string; mtkFaellig?: Dayjs | null; beschreibung?: string;
  ablaufdatum?: Dayjs | null;
};

/** ⚠️ TAGESGENAU, nicht monatsgenau: `_ui/monat.ts` (T127) liefert „YYYY-MM"
 *  und nennt drei Konsumenten namentlich; `mtkFaellig` und `ablaufdatum`
 *  pruefen serverseitig gegen TAG_REGEX (T121). `ChecksFilter` (T135)
 *  formatiert an derselben Stelle ebenso inline. */
const tag = (d: Dayjs | null | undefined) => (d ? d.format("YYYY-MM-DD") : undefined);

export function GeraetForm({
  initial, lagerorte,
}: {
  initial: GeraetInitial;
  lagerorte: { id: string; name: string; typ: "lager" | "fahrzeug" }[];
}) {
  const [form] = Form.useForm<Werte>();
  /**
   * DER EINE ORT, AN DEM `useActionState` WIRKLICH PASST (§6.2.3): ein
   * Stammdatenformular mit Absendeknopf, dessen Ergebnis am Formular haengt.
   * Die Nutzlast ist das Werteobjekt aus `onFinish`, nicht ein `FormData` —
   * `geraetSpeichern` nimmt `unknown` und prueft mit zod (T121).
   */
  const [zustand, absenden, laeuft] = useActionState(
    async (_vorher: ActionErgebnis<{ id: string }> | null, w: Werte) =>
      geraetSpeichern({
        id: initial.id,
        typ: w.typ,
        name: w.name,
        barcode: w.barcode?.trim() || undefined,
        lagerortId: w.lagerortId,
        anmerkung: w.anmerkung?.trim() || undefined,
        // ⚠️ TYPFREMDE FELDER GEHEN GAR NICHT ERST MIT. Die Action haelt sie
        // ohnehin auf null (T121); das Formular zeigt sie schon nicht an.
        mtkFaellig: w.typ === "medizin" ? tag(w.mtkFaellig) : undefined,
        beschreibung: w.typ === "objekt" ? w.beschreibung?.trim() || undefined : undefined,
        ablaufdatum: w.typ === "objekt" ? tag(w.ablaufdatum) : undefined,
      }),
    null,
  );

  useEffect(() => {
    if (zustand && !zustand.ok) {
      form.setFields(Object.entries(zustand.feldFehler ?? {})
        .map(([name, errors]) => ({ name, errors: [errors] })));
    }
  }, [zustand, form]);

  const typ = Form.useWatch("typ", form) ?? initial.typ;

  return (
    <Form
      form={form} layout="vertical" disabled={laeuft}
      initialValues={{
        typ: initial.typ, name: initial.name, barcode: initial.barcode ?? "",
        lagerortId: initial.lagerortId, anmerkung: initial.anmerkung ?? "",
        mtkFaellig: initial.mtkFaellig ? dayjs(initial.mtkFaellig) : null,
        beschreibung: initial.beschreibung ?? "",
        ablaufdatum: initial.ablaufdatum ? dayjs(initial.ablaufdatum) : null,
      }}
      onFinish={(w) => absenden(w)}
    >
      {/* Echte Radiogruppe statt Knopfreihe: ein Tabstop pro Gruppe,
          Pfeiltasten waehlen nativ (docs/design/README.md:144, §6.4.4). */}
      <Form.Item name="typ" label="Klasse">
        <Radio.Group options={[
          { value: "medizin", label: "Medizinisches Gerät" },
          { value: "objekt", label: "Objekt" },
        ]} />
      </Form.Item>
      <Form.Item name="name" label="Bezeichnung">
        <Input placeholder="z. B. Corpuls C3" />
      </Form.Item>
      <Form.Item name="barcode" label="Barcode (optional)">
        <Input placeholder="Barcode / Seriennummer" />
      </Form.Item>
      <Form.Item name="lagerortId" label="Standort">
        <Select
          showSearch aria-label="Standort" placeholder="Standort wählen…"
          optionFilterProp="label"
          options={lagerorte.map((l) => ({ value: l.id, label: l.name }))}
        />
      </Form.Item>
      {/* ⚠️ TYPFREMDE FELDER WERDEN AUSGEBLENDET, nicht nur ignoriert. Kein
          <span> um die Felder: `Form.Item` klont SEIN DIREKTES KIND und
          haengt `value`/`onChange` daran — ein Wrapper bekaeme beides, das
          Eingabefeld nichts, und das Formular waere still leer. */}
      {typ === "medizin" ? (
        <Form.Item name="mtkFaellig" label="Nächste MTK (optional)">
          <DatePicker format="YYYY-MM-DD" allowClear aria-label="Nächste MTK" />
        </Form.Item>
      ) : (
        <>
          <Form.Item name="beschreibung" label="Beschreibung (optional)">
            <Input placeholder="z. B. Spineboard mit Gurtspinne" aria-label="Beschreibung" />
          </Form.Item>
          <Form.Item name="ablaufdatum" label="Ablaufdatum (optional)">
            <DatePicker format="YYYY-MM-DD" allowClear aria-label="Ablaufdatum" />
          </Form.Item>
        </>
      )}
      <Form.Item name="anmerkung" label="Anmerkung (optional)">
        <Input placeholder="Freitext" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={laeuft}>Speichern</Button>
      {zustand?.ok ? <Alert type="success" showIcon={false} message="Gespeichert."
                            style={{ marginBlockStart: 12 }} /> : null}
      {zustand && !zustand.ok
        ? <Alert type="warning" showIcon={false} message={zustand.fehler}
                 style={{ marginBlockStart: 12 }} /> : null}
    </Form>
  );
}
```

`GeraetAktivToggle.tsx` ist die Gefahrenzone als `"use client"`-Insel: ein `Switch`
(`aria-label="Gerät aktiv"`) auf `setGeraetAktiv({ id, aktiv })` und daneben
`<LoeschButton name={name} typLabel="Gerät" …>` mit `pruefen`/`onLoeschen`/`onDeaktivieren` aus
`_actions/loeschen.ts` für die `ElementArt` `"geraet"` — **derselbe Grund wie in T142:** die drei
Props sind Funktionen, `loescheElement` liefert `ActionErgebnis` statt `void`, und die Umsetzung
gehört in die Insel, nicht in die Seite.

```tsx
// page.tsx
import { notFound } from "next/navigation";
import { getDb } from "../../../../_db/client";
import { geraetById } from "../../../../_lib/lesepfade/geraete";
import { lagerortOptionen } from "../../../../_lib/lesepfade/bz";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { Chip } from "../../../../_ui/Chip";
import { GeraetForm } from "./GeraetForm";
import { GeraetAktivToggle } from "./GeraetAktivToggle";

export const dynamic = "force-dynamic";

/** `Form` und `Form.Item` stehen ausschlieszlich in der Insel, nie hier
 *  (Falle 1: Compound-Zugriff in einer Server Component ergibt HTTP 500). */
export default async function GeraetblattSeite({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const d = geraetById(db, id, new Date());
  if (!d) notFound();
  const g = d.geraet;
  return (
    <>
      <Brotkrume href="/verwaltung/geraete">Geräte</Brotkrume>
      <SeitenKopf
        titel={g.name}
        beschreibung={d.chip ? undefined : "Für diese Klasse ist kein Datum gepflegt."}
        aktionen={<GeraetAktivToggle id={g.id} name={g.name} aktiv={g.aktiv} />} />
      {d.chip
        ? <Chip ton={d.chip.ton} zeichen={d.chip.ton === "rot" ? "warnung" : undefined}>
            {d.chip.text}
          </Chip>
        : null}
      <GeraetForm
        initial={{
          id: g.id, typ: g.typ, name: g.name, barcode: g.barcode,
          lagerortId: g.lagerortId, anmerkung: g.anmerkung,
          mtkFaellig: g.mtkFaellig, beschreibung: g.beschreibung,
          ablaufdatum: g.ablaufdatum,
        }}
        lagerorte={lagerortOptionen(db)}
      />
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/[id]/GeraetForm.test.tsx"
```

Erwartet: PASS.

- [ ] **Schritt 5: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/[id]/"
rtk git commit -m "feat(lagerbuch): /verwaltung/geraete/[id] — das eine echte Stammdatenformular

Der eine Ort, an dem antd Form + Form.Item + useActionState wirklich passt —
innerhalb der Insel, nie in der Seite.

geraete.spec.ts:66 (button 'Defekt') stirbt mit der Radio.Group; Ersatzanker
ist getByRole('radio', { name: 'Defekt' }), namentlich gegen die alte Fassung
gehalten. Die combobox-Rolle des Standort-Selects wird einmal gegen das
gerenderte Bauteil geprueft, nicht gegen die Absicht.

Typfremde Felder werden AUSGEBLENDET, nicht nur ignoriert: sonst tippt jemand
ein MTK-Datum in ein Objekt und wundert sich, dass es verschwindet.

Die beiden Datumsfelder formatieren YYYY-MM-DD inline: _ui/monat.ts liefert
YYYY-MM und nennt drei Konsumenten namentlich; ein vierter Export dort
widerspraeche T127 und der Datei-Eigentuemertabelle."
```

---

### Task 145: `/verwaltung/bestellung` — „bestellt seit" und „offenbar eingetroffen"

**Files:** Create `verwaltung/(arbeit)/bestellung/page.tsx`, `.../BestellListe.tsx`;
Test `.../BestellListe.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/bestellung.ts` (T50) — `bestellvorschlag`;
`_actions/bestellung.ts` — `markiereBestellt`; `_ui/Chip`, `_ui/SeitenKopf`.
⚠️ **Der CSV-Download und die Zwischenablage gehören TEIL 6** (§9.2, §9.3). Beide Knöpfe sind bis
dahin `disabled` mit erklärendem `Tooltip` — **derselbe benannte Vorgriff wie beim Excel-Export**
(T129). Produces `/verwaltung/bestellung`.

- Produces (spätere Teile sehen NUR diesen Block):
  ```tsx
  // BestellListe.tsx — "use client".
  export function statusChip(z: BestellZeile): { ton: "rot" | "gelb" | "ok"; text: string };
  export function BestellListe(props: { zeilen: BestellZeile[] }): JSX.Element;
  ```

**Spalten, abgelesen aus `BestellListe.tsx:44-60`:**

| # | Titel | Anmerkung |
|---|---|---|
| 1 | — | Kreis-Knopf, `aria-label` „Als bestellt markieren" / „Bestellung zurücknehmen" |
| 2 | Artikel | Name; bei `bestellt` durchgestrichen |
| 3 | Fach | `.fach` |
| 4 | Bestand / Min. | „N / min. M" |
| 5 | Status | Chip „offen" (rot) / **„bestellt seit TT.MM.JJJJ"** (ok) / **„Ware offenbar eingetroffen"** (gelb) |
| 6 | Vorschlag | rechtsbündig, `SCHRIFT.zahl`, Einheit als Nebentext |

⚠️ **§6.15 Auflage 17 (§5.5): „bestellt seit &lt;Datum&gt;" und „Ware offenbar eingetroffen".**
`bestelltAt` ist ein **Zeitstempel**, kein Haken (T117) — Teil 3 (T50) liefert `bestelltSeit` und
`wareEingetroffen` bereits vorgerechnet. Ein bloßes „bestellt" verschwiege beides.
⚠️ **Die Vorschlagsmenge ist die Lückenformel `max(0, mindestbestand − bestand)`** — `BESTELL_FAKTOR`
ist **ersatzlos gestrichen** (Teil 1, Global Constraints).
⚠️ **Ein `disabled` antd-`Button` verschluckt das Hover-Ereignis** — der erklärende `Tooltip` käme
nie an. Beide gesperrten Knöpfe stehen deshalb in einem `<span>`, das den Tooltip trägt; der Test
unten prüft **beides**, die Sperre und den Grund.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/bestellung/BestellListe.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import { BestellListe, statusChip } from "./BestellListe";

vi.mock("../../../_actions/bestellung", () => ({
  markiereBestellt: async () => ({ ok: true }),
}));

const OFFEN = {
  id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1",
  bestand: 2, mindestbestand: 10, vorschlag: 8,
  bestellt: false, bestelltSeit: null, wareOffenbarDa: false,
};
const BESTELLT = {
  id: "a2", name: "Pflaster", einheit: "Pkg", fach: "B2",
  bestand: 0, mindestbestand: 5, vorschlag: 5,
  bestellt: true, bestelltSeit: new Date("2026-08-01T09:00:00Z"), wareOffenbarDa: false,
};
const DA = { ...BESTELLT, id: "a3", name: "Kompresse", wareOffenbarDa: true };
const ZEILEN = [OFFEN, BESTELLT, DA];
afterEach(async () => { await unmount(); });

describe("statusChip — Auflage 17", () => {
  it("nennt das DATUM, nicht bloszes „bestellt\"", () => {
    // `bestellt_at` ist ein Zeitstempel und kein Haken (§5.5, T117). Ein
    // blosszes „bestellt" verschwiege, wie lange die Position schon offen ist.
    expect(statusChip(BESTELLT)).toEqual({ ton: "ok", text: "bestellt seit 01.08.2026" });
  });

  it("nennt „Ware offenbar eingetroffen\", wenn seit der Markierung ein Zugang lief", () => {
    expect(statusChip(DA)).toEqual({ ton: "gelb", text: "Ware offenbar eingetroffen" });
  });

  it("nennt „offen\", solange nichts markiert ist", () => {
    expect(statusChip(OFFEN)).toEqual({ ton: "rot", text: "offen" });
  });
});

describe("BestellListe", () => {
  it("traegt die sechs abgelesenen Spalten", async () => {
    await mount(<BestellListe zeilen={ZEILEN} />);
    expect(queryAll("thead th").map((th) => th.textContent))
      .toEqual(["", "Artikel", "Fach", "Bestand / Min.", "Status", "Vorschlag"]);
  });

  it("der Kreis-Knopf sagt, was er tut — in beide Richtungen", async () => {
    await mount(<BestellListe zeilen={ZEILEN} />);
    const labels = queryAll("tbody button[aria-label]").map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Als bestellt markieren", "Bestellung zurücknehmen", "Bestellung zurücknehmen",
    ]);
  });

  it("CSV und Zwischenablage sind gesperrt UND sagen warum", async () => {
    // Ein `disabled` antd-Button verschluckt das Hover-Ereignis — der Tooltip
    // haengt deshalb am umschlieszenden span, nicht am Knopf (§9.2/§9.3).
    await mount(<BestellListe zeilen={ZEILEN} />);
    expect(query("[data-rolle='csv'] button").hasAttribute("disabled")).toBe(true);
    expect(query("[data-rolle='clipboard'] button").hasAttribute("disabled")).toBe(true);
    expect(query("[data-rolle='csv']").getAttribute("title")).toContain("Teil 6");
  });

  it("zeigt keinen Excel-, CSV- oder Zwischenablage-Code — der gehoert Teil 6", async () => {
    await mount(<BestellListe zeilen={ZEILEN} />);
    expect(exists("a[download]")).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bestellung/BestellListe.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./BestellListe"`.

- [ ] **Schritt 3: `BestellListe.tsx` und `page.tsx` schreiben**

```tsx
// BestellListe.tsx — "use client".
"use client";
import { useTransition } from "react";
import { Button, Flex, Table, Tooltip } from "antd";
import { markiereBestellt } from "../../../_actions/bestellung";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import s from "../../../_ui/verwaltung.module.css";
import type { BestellZeile } from "../../../_lib/lesepfade/bestellung";

const DATUM = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric",
});

/**
 * ⚠️ §6.15, AUFLAGE 17 (§5.5). `artikel.bestellt_at` traegt genau EINE wahre
 * Aussage — „seit wann steht die aktuelle Markierung". Daraus entstehen zwei
 * Anzeigen, die ein boolescher Haken nicht tragen koennte:
 *
 *   „bestellt seit <Datum>"      — wie lange steht die Position schon offen?
 *   „Ware offenbar eingetroffen" — seit der Markierung wurde ein Zugang
 *                                  gebucht, die Bestellung ist also erledigt.
 *
 * Beide Werte kommen VORGERECHNET aus Teil 3 (T50): `bestelltSeit` und
 * `wareOffenbarDa`. Ein blosszes „bestellt" verschwiege beides.
 */
export function statusChip(z: BestellZeile): { ton: "rot" | "gelb" | "ok"; text: string } {
  if (z.wareOffenbarDa) return { ton: "gelb", text: "Ware offenbar eingetroffen" };
  if (z.bestellt) {
    return z.bestelltSeit
      ? { ton: "ok", text: `bestellt seit ${DATUM.format(z.bestelltSeit)}` }
      : { ton: "ok", text: "bestellt" };
  }
  return { ton: "rot", text: "offen" };
}

const SPERRGRUND = "CSV-Download und Zwischenablage kommen mit Teil 6 (§9.2/§9.3).";

export function BestellListe({ zeilen }: { zeilen: BestellZeile[] }) {
  const [laeuft, start] = useTransition();

  return (
    <>
      <Flex gap={12} wrap align="center" style={{ marginBlockEnd: 12 }}>
        {/* ⚠️ EIN `disabled` antd-Button VERSCHLUCKT DAS HOVER-EREIGNIS — der
            Tooltip erschiene nie. Er haengt deshalb am span, und `title`
            traegt denselben Grund fuer den Fall ohne Zeigegeraet. Derselbe
            benannte Vorgriff wie beim Excel-Export (T129). */}
        <Tooltip title={SPERRGRUND}>
          <span data-rolle="clipboard" title={SPERRGRUND}>
            <Button disabled icon={<Ikone name="kopieren" groesse={16} />}>Liste kopieren</Button>
          </span>
        </Tooltip>
        <Tooltip title={SPERRGRUND}>
          <span data-rolle="csv" title={SPERRGRUND}>
            <Button disabled icon={<Ikone name="herunterladen" groesse={16} />}>CSV</Button>
          </span>
        </Tooltip>
      </Flex>
      <Table
        rowKey="id" pagination={false} scroll={{ x: "max-content" }}
        aria-label="Bestellvorschlag" dataSource={zeilen}
        locale={{ emptyText: "Alles über Mindestbestand — nichts zu bestellen." }}
        columns={[
          { title: "", dataIndex: "bestellt", width: 48,
            render: (v: boolean, z) => (
              <Button
                shape="circle" disabled={laeuft}
                aria-label={v ? "Bestellung zurücknehmen" : "Als bestellt markieren"}
                icon={v ? <Ikone name="haken" groesse={15} /> : undefined}
                onClick={() => start(async () => {
                  await markiereBestellt({ artikelId: z.id, bestellt: !v });
                })}
              />
            ) },
          { title: "Artikel", dataIndex: "name",
            render: (v: string, z) => (
              <span style={z.bestellt
                ? { textDecoration: "line-through", ...SCHRIFT.neben }
                : { fontWeight: 600 }}>{v}</span>
            ) },
          { title: "Fach", dataIndex: "fach",
            render: (v: string) => <span className={s.fach}>{v}</span> },
          { title: "Bestand / Min.", dataIndex: "bestand",
            render: (v: number, z) => (
              <span style={SCHRIFT.neben}>{v} / min. {z.mindestbestand}</span>
            ) },
          { title: "Status", dataIndex: "bestellt",
            render: (_: boolean, z) => {
              const c = statusChip(z);
              return <Chip ton={c.ton}>{c.text}</Chip>;
            } },
          {
            title: "Vorschlag", dataIndex: "vorschlag", align: "right" as const,
            /* Die Vorschlagsmenge ist die Lueckenformel
               `max(0, mindestbestand − bestand)` und kommt fertig aus T50.
               BESTELL_FAKTOR ist ersatzlos gestrichen (Teil 1). */
            render: (v: number, z) => (
              <span style={SCHRIFT.zahl}>
                {v}<span style={{ ...SCHRIFT.neben, marginInlineStart: 4 }}>{z.einheit}</span>
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
```

```tsx
// page.tsx
import { getDb } from "../../../_db/client";
import { bestellvorschlag } from "../../../_lib/lesepfade/bestellung";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { BestellListe } from "./BestellListe";

export const dynamic = "force-dynamic";

export default function BestellungSeite() {
  return (
    <>
      <SeitenKopf titel="Bestellvorschlag"
        beschreibung="Alles unter Mindestbestand. Die Markierung ist ein Zeitstempel — die Liste zeigt deshalb, seit wann bestellt wurde und ob die Ware offenbar da ist." />
      <BestellListe zeilen={bestellvorschlag(getDb())} />
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bestellung/BestellListe.test.tsx"
```

Erwartet: PASS.

- [ ] **Schritt 5: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/bestellung/"
rtk git commit -m "feat(lagerbuch): /verwaltung/bestellung — bestellt seit, offenbar eingetroffen

Auflage 17: bestellt_at ist ein Zeitstempel, kein Haken — daraus 'bestellt
seit <Datum>' und 'Ware offenbar eingetroffen'. Ein blosses 'bestellt'
verschwiege beides.

CSV und Zwischenablage sind bis Teil 6 (§9.2/§9.3) gesperrt und sagen warum —
derselbe benannte Vorgriff wie beim Excel-Export. Der Tooltip haengt am span,
nicht am Knopf: ein disabled Button verschluckt das Hover-Ereignis."
```

---

### Task 146: `/verwaltung/inventur` — zählen, ohne stille Rücknahmen

**Files:** Create `verwaltung/(arbeit)/inventur/page.tsx`, `.../InventurForm.tsx`;
Test `.../InventurForm.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/artikel.ts` — `artikelListe`; `_actions/inventur.ts` —
`inventurKorrektur`; `_ui/Chip`, `_ui/SeitenKopf`. Produces `/verwaltung/inventur`.

- Produces (spätere Teile sehen NUR diesen Block):
  ```tsx
  // InventurForm.tsx — "use client".
  export type InventurZeile = {
    id: string; name: string; einheit: string; fach: string; bestand: number;
  };
  export function positionenAus(
    beruehrt: Readonly<Record<string, number>>): { artikelId: string; ist: number }[];
  export function InventurForm(props: { zeilen: InventurZeile[] }): JSX.Element;
  ```

**Spalten, abgelesen aus `InventurForm.tsx:44-58`:** `Artikel` · `Fach` · `Bestand` (rechtsbündig,
„N Einheit") · `Abweichung` (Chip, nur bei `diff !== 0`: rot bei negativ, gelb bei positiv, mit
Vorzeichen im **Text**) · `Ist` (`InputNumber min={0} max={9999} size="small"`).

⚠️ **NUR ANGEFASSTE ZEILEN WERDEN GESCHICKT** (§5.9, `InventurForm.tsx:36-38`). Die Insel führt eine
`Record<string, number>`-Karte der **berührten** Positionen; nicht angefasste Artikel würden sonst mit
dem **veralteten Seitenlade-Snapshot** gebucht und machten parallele Entnahmen **still** rückgängig.
⚠️ **Der Kommentar ist Pflicht** und der Absendeknopf bleibt ohne ihn gesperrt.
⚠️ **`max={9999}`** — echter Überbestand muss zählbar bleiben (§6.4.6).
⚠️ **Der Fehlerfall ist `Alert type="warning"`, nie `type="error"`** (§6.2.2 Zeile 20, §6.6.5).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/InventurForm.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, unmount, click, fill, query, exists } from "@/app/m/qr/_lib/test-dom";

const korrigieren = vi.fn(async () => ({ ok: true as const, wert: { korrigiert: 1 } }));
vi.mock("../../../_actions/inventur", () => ({
  inventurKorrektur: (...a: unknown[]) => korrigieren(...(a as [])),
}));
import { InventurForm, positionenAus } from "./InventurForm";

const ZEILEN = [
  { id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1", bestand: 12 },
  { id: "a2", name: "Pflaster", einheit: "Pkg", fach: "B2", bestand: 4 },
];
afterEach(async () => { korrigieren.mockClear(); await unmount(); });

describe("positionenAus", () => {
  it("schickt NUR beruehrte Positionen — nie den Seitenlade-Snapshot", () => {
    // DIE TRAGENDE ZUSICHERUNG (§5.9). Nicht angefasste Artikel wuerden sonst
    // mit dem veralteten Snapshot als `ist` gebucht und machten parallele
    // Entnahmen STILL rueckgaengig — ein klassisches Lost Update.
    expect(positionenAus({ a1: 11 })).toEqual([{ artikelId: "a1", ist: 11 }]);
    expect(positionenAus({})).toEqual([]);
  });

  it("behaelt eine beruehrte Zeile, deren Wert dem Bestand ENTSPRICHT", () => {
    // „angefasst und stimmt" ist eine Zaehlung, kein Nichts. Der Server
    // rechnet diff gegen den LIVE-Bestand und verwirft die Zeile selbst,
    // wenn er null ergibt (T116).
    expect(positionenAus({ a1: 12 })).toEqual([{ artikelId: "a1", ist: 12 }]);
  });
});

describe("InventurForm", () => {
  it("laeszt bis 9999 zaehlen — echter Ueberbestand musz zaehlbar bleiben", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    const feld = query("input[aria-label='Ist-Bestand Mullbinde']");
    expect(feld.getAttribute("aria-valuemax")).toBe("9999");
    expect(feld.getAttribute("aria-valuemin")).toBe("0");
  });

  it("der Absendeknopf bleibt ohne Kommentar gesperrt", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    expect(query("button[data-rolle='abschluss']").hasAttribute("disabled")).toBe(true);
    await fill("input[aria-label='Kommentar']", "Quartalsinventur 07/2026");
    expect(query("button[data-rolle='abschluss']").hasAttribute("disabled")).toBe(false);
  });

  it("schickt beim Abschlusz ausschlieszlich die beruehrte Zeile", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    await fill("input[aria-label='Kommentar']", "Quartalsinventur 07/2026");
    await click("button[data-rolle='abschluss']");
    expect(korrigieren).toHaveBeenCalledWith({
      kommentar: "Quartalsinventur 07/2026",
      positionen: [{ artikelId: "a1", ist: 11 }],
    });
  });

  it("zeigt die Abweichung mit VORZEICHEN IM TEXT", async () => {
    // Eine rote und eine gelbe 3 sind in Graustufen dasselbe Zeichen; das
    // Vorzeichen ist ASCII (Festlegung H6), nicht U+2212.
    await mount(<InventurForm zeilen={ZEILEN} />);
    await fill("input[aria-label='Ist-Bestand Pflaster']", "6");
    expect(document.body.textContent).toContain("+2");
    await fill("input[aria-label='Ist-Bestand Pflaster']", "1");
    expect(document.body.textContent).toContain("-3");
  });

  it("der Fehlerfall ist warning, nie error", async () => {
    // §6.2.2 Zeile 20, §6.6.5: colorError === colorPrimary (Falle 3) — ein
    // rotes Alert saehe aus wie die Primaeraktion.
    korrigieren.mockResolvedValueOnce(
      { ok: false, fehler: "Bitte die markierten Felder prüfen." } as never);
    await mount(<InventurForm zeilen={ZEILEN} />);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    await fill("input[aria-label='Kommentar']", "x");
    await click("button[data-rolle='abschluss']");
    expect(exists(".ant-alert-warning")).toBe(true);
    expect(exists(".ant-alert-error")).toBe(false);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/InventurForm.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./InventurForm"`.

- [ ] **Schritt 3: `InventurForm.tsx` und `page.tsx` schreiben**

```tsx
// InventurForm.tsx — "use client".
"use client";
import { useState, useTransition } from "react";
import { Alert, Button, Flex, Input, InputNumber, Table } from "antd";
import { inventurKorrektur } from "../../../_actions/inventur";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import s from "../../../_ui/verwaltung.module.css";

export type InventurZeile = {
  id: string; name: string; einheit: string; fach: string; bestand: number;
};

/**
 * ⚠️ NUR TATSAECHLICH GEZAEHLTE POSITIONEN (§5.9, `InventurForm.tsx:36-38`).
 *
 * Die Karte enthaelt ausschlieszlich Zeilen, die jemand ANGEFASST hat. Wer
 * stattdessen ueber alle Artikel laeuft und `ist[a.id] ?? a.bestand` schickt,
 * bucht nicht angefasste Positionen mit dem VERALTETEN Seitenlade-Snapshot —
 * und macht damit jede parallele Entnahme STILL rueckgaengig (Lost Update).
 * Kein Fehler, keine Meldung, ein Bestand, der wieder auf den alten Stand
 * springt.
 *
 * Eine beruehrte Zeile bleibt auch dann drin, wenn ihr Wert dem angezeigten
 * Bestand ENTSPRICHT: „angefasst und stimmt" ist eine Zaehlung. Der Server
 * rechnet `diff = ist − LIVE-Bestand` und ueberspringt sie selbst, wenn null
 * herauskommt (T116).
 */
export function positionenAus(
  beruehrt: Readonly<Record<string, number>>,
): { artikelId: string; ist: number }[] {
  return Object.entries(beruehrt).map(([artikelId, ist]) => ({ artikelId, ist }));
}

export function InventurForm({ zeilen }: { zeilen: InventurZeile[] }) {
  const [beruehrt, setBeruehrt] = useState<Record<string, number>>({});
  const [kommentar, setKommentar] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();

  const positionen = positionenAus(beruehrt);
  const abweichungen = zeilen.filter(
    (z) => z.id in beruehrt && beruehrt[z.id] !== z.bestand).length;

  return (
    <>
      <Table
        rowKey="id" pagination={false} scroll={{ x: "max-content" }}
        aria-label="Inventur" dataSource={zeilen}
        locale={{ emptyText: "Keine Artikel vorhanden." }}
        columns={[
          { title: "Artikel", dataIndex: "name",
            render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
          { title: "Fach", dataIndex: "fach",
            render: (v: string) => <span className={s.fach}>{v}</span> },
          { title: "Bestand", dataIndex: "bestand", align: "right" as const,
            render: (v: number, z) => (
              <span style={SCHRIFT.mono}>{v} {z.einheit}</span>
            ) },
          {
            title: "Abweichung", dataIndex: "id",
            /* Das Vorzeichen steht im TEXT, nicht nur in der Farbe: eine rote
               und eine gelbe 3 sind in Graustufen dasselbe Zeichen. */
            render: (_: string, z) => {
              if (!(z.id in beruehrt)) return null;
              const diff = beruehrt[z.id] - z.bestand;
              if (diff === 0) return null;
              return (
                <Chip ton={diff < 0 ? "rot" : "gelb"}>
                  {diff > 0 ? `+${diff}` : `${diff}`}
                </Chip>
              );
            },
          },
          {
            title: "Ist", dataIndex: "id", align: "right" as const,
            /* ⚠️ max=9999 (§6.4.6): echter Ueberbestand musz zaehlbar bleiben,
               sonst korrigiert der Abgleich real vorhandene Teile still
               heraus. */
            render: (_: string, z) => (
              <InputNumber
                size="small" min={0} max={9999}
                aria-label={`Ist-Bestand ${z.name}`}
                value={z.id in beruehrt ? beruehrt[z.id] : z.bestand}
                onChange={(v) => setBeruehrt((k) => ({ ...k, [z.id]: v ?? 0 }))}
              />
            ),
          },
        ]}
      />
      <Flex vertical gap={8} style={{ marginBlockStart: 12 }}>
        <Input
          aria-label="Kommentar"
          placeholder="Kommentar (Pflicht), z. B. Quartalsinventur 07/2026"
          value={kommentar}
          onChange={(e) => { setKommentar(e.target.value); setFehler(null); }}
        />
        <Button
          type="primary" data-rolle="abschluss"
          disabled={laeuft || !kommentar.trim() || positionen.length === 0}
          onClick={() => start(async () => {
            const erg = await inventurKorrektur({ kommentar: kommentar.trim(), positionen });
            if (!erg.ok) { setFehler(erg.fehler); return; }
            setFehler(null);
            setMeldung(`Inventur gebucht — ${erg.wert.korrigiert} Position(en) korrigiert.`);
            setBeruehrt({});
            setKommentar("");
          })}
        >
          Inventur abschließen ({abweichungen} Abweichung{abweichungen === 1 ? "" : "en"})
        </Button>
        {meldung ? <Alert type="success" showIcon={false} message={meldung} /> : null}
        {/* ⚠️ warning, NIE error (§6.2.2 Zeile 20, §6.6.5): colorError ===
            colorPrimary (Falle 3) — ein rotes Alert saehe aus wie die
            Primaeraktion, und Rot traegt hier fachliche Bedeutung. */}
        {fehler ? <Alert type="warning" showIcon={false} message={fehler} /> : null}
      </Flex>
    </>
  );
}
```

```tsx
// page.tsx
import { getDb } from "../../../_db/client";
import { artikelListe } from "../../../_lib/lesepfade/artikel";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { InventurForm } from "./InventurForm";

export const dynamic = "force-dynamic";

export default function InventurSeite() {
  const zeilen = artikelListe(getDb()).map((a) => ({
    id: a.id, name: a.name, einheit: a.einheit, fach: a.fach, bestand: a.bestand,
  }));
  return (
    <>
      <SeitenKopf titel="Inventur"
        beschreibung="Gezählt wird der Handlager-Bestand. Nur angefasste Zeilen werden gebucht — der Server rechnet gegen den Live-Bestand, nicht gegen den Stand dieser Seite." />
      <InventurForm zeilen={zeilen} />
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/InventurForm.test.tsx"
```

Erwartet: PASS.

- [ ] **Schritt 5: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/"
rtk git commit -m "feat(lagerbuch): /verwaltung/inventur — nur angefasste Zeilen

Die Insel schickt ausschlieszlich beruehrte Positionen. Nicht angefasste
Artikel wuerden mit dem veralteten Seitenlade-Snapshot gebucht und machten
parallele Entnahmen still rueckgaengig.

Kommentar Pflicht, max=9999, Fehlerfall als Alert type=warning."
```

---

### Task 147: `/verwaltung/journal` — Regime B, Deckel 100, `committedQ`

**Files:** Create `verwaltung/(arbeit)/journal/page.tsx`, `.../JournalFilter.tsx`;
Test `.../JournalFilter.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/journal.ts` (T46) — `journalEintraege(db, filter)` →
`{ zeilen, mehrVorhanden }`; `_lib/grenzen.ts` — `JOURNAL_GRENZE` (= 100); `_lib/format.ts` —
`zeitraumAus`, `typLabel`; `_lib/journalZeile.ts` (T42) — `journalZeile`; `_ui/useUrlFilter`,
`_ui/Chip`. Produces `/verwaltung/journal`.

- Produces (spätere Teile sehen NUR diesen Block):
  ```tsx
  // JournalFilter.tsx — "use client".
  export const TYPEN: readonly ["zugang", "entnahme", "korrektur", "umlagerung"];
  export function deckelText(gezeigt: number, mehrVorhanden: boolean): string;
  export function mitGetipptem(
    basis: { q: string; typ: string; von: string; bis: string },
    getipptes: string,
    teil: Partial<{ q: string; typ: string; von: string; bis: string }>,
  ): { q: string; typ: string; von: string; bis: string };
  export function JournalFilter(props: {
    q: string; typ: string; von: string; bis: string; hinweise: string[];
  }): JSX.Element;
  ```

**Spalten, abgelesen aus `journal/page.tsx:41-47`:**

| # | Titel | Anmerkung |
|---|---|---|
| 1 | Zeit | `.jts`, Mono |
| 2 | Artikel | fett |
| 3 | Vorgang | `journalZeile().typText` + Kommentar |
| 4 | Δ | `.jdelta` + `.jminus`/`.jplus`, **`mengeText` mit Vorzeichen im TEXT** |
| 5 | Quelle | grauer Chip, `quelleName` |

⚠️ **§6.11 — `.jdelta.minus` hat unter `src/` KEIN Netz.** Der Ersatzanker ist
`getByRole("row", …).getByText("−1")`: geprüft wird das **Vorzeichen im Text**, nicht die Farbe. Das
ist die einzige Zusicherung, die es dafür gibt.
**Nachtrag zum Zeichen:** der Anker muss das **ASCII**-Minus `-1` greifen, nicht das typografische
`−1` (U+2212). `journalZeile` liefert `mengeText` ausdrücklich in ASCII (Festlegung H6, Teil 3 T42),
und §12.3 nennt genau diese Klasse Fehler beim Namen: `/× aussondern/` in `verfall.spec.ts:21` hängt
heute an einem typografischen `×`, und **niemand sieht einem Selektor an, dass er an einem
unsichtbaren Zeichenunterschied scheitert.**
⚠️ **Der `committedQ`-Tanz wandert UNVERÄNDERT mit** (§6.9.2 Punkt 3, `JournalFilter.tsx:29-36`): ein
Ref merkt sich den zuletzt selbst geschriebenen Suchbegriff und unterscheidet damit eine **externe**
`q`-Änderung (geteilter Link) von einer selbst ausgelösten — extern wird die Eingabe nachgezogen,
selbst ausgelöst passiert nichts, **sonst verlöre das Feld beim Tippen den Fokus.** Debounce **300 ms**.
⚠️ **Die Zeile, die man beim Portieren gerne „aufräumt"** (`JournalFilter.tsx:40-41`): bei jedem
Chip- und Datumsklick wird das **bereits Getippte** als `q` mitgeschrieben. Ohne sie verliert ein
Datumsklick den halb getippten Suchbegriff.
⚠️ **Der Deckel 100 wird bedingt** (§6.9.3): bei `mehrVorhanden` „Neueste 100 von mehr Treffern —
Zeitraum eingrenzen", sonst „N Treffer". Der Bestand schreibt „Zeigt die neuesten 100 Treffer"
**unbedingt** — auch wenn drei Zeilen zurückkommen.
⚠️ **`Select` für den Typ gegen die Weißliste** (`zugang`/`entnahme`/`korrektur`/`umlagerung`), zwei
`DatePicker`, `Zurücksetzen`-Knopf, `Trefferanzeige`.
⚠️ **Die `Trefferanzeige` („X von Y", T109) steht hier NICHT** — der bedingte Text aus `deckelText`
tritt an ihre Stelle. Sie braucht **beide** Zahlen, und Regime B filtert **serverseitig**: `gesamt`
wäre eine zweite Abfrage über die ganze Historie, nur um eine Zahl zu zeigen. „X von Y" heißt
„dein Filter blendet Y−X Zeilen aus"; hier ist die wahre Aussage „es gibt mehr, als du siehst" —
**nicht dieselbe** (§6.9.5), und genau die trägt `deckelText`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/journal/JournalFilter.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, rerender, fill, query, queryAll, exists }
  from "@/app/m/qr/_lib/test-dom";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }), usePathname: () => "/verwaltung/journal",
}));
import { JournalFilter, deckelText, mitGetipptem, TYPEN } from "./JournalFilter";

const SEITE = readFileSync(
  "src/app/m/lagerbuch/verwaltung/(arbeit)/journal/page.tsx", "utf8");

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(async () => { vi.useRealTimers(); replace.mockClear(); await unmount(); });

describe("deckelText", () => {
  it("nennt den Deckel NUR, wenn er zugeschlagen hat", () => {
    // Der Bestand schreibt „Zeigt die neuesten 100 Treffer" UNBEDINGT — auch
    // wenn drei Zeilen zurueckkommen (§6.9.3).
    expect(deckelText(100, true)).toBe("Neueste 100 von mehr Treffern — Zeitraum eingrenzen");
    expect(deckelText(3, false)).toBe("3 Treffer");
    expect(deckelText(1, false)).toBe("1 Treffer");
  });
});

describe("mitGetipptem", () => {
  it("nimmt das BEREITS GETIPPTE bei jedem Chip- und Datumsklick als q mit", () => {
    // `JournalFilter.tsx:40-41` — die Zeile, die man beim Portieren gerne
    // aufraeumt. Ohne sie verliert ein Datumsklick den halb getippten
    // Suchbegriff, und niemand vermutet die Ursache in einem Datumsfeld.
    expect(mitGetipptem({ q: "", typ: "", von: "", bis: "" }, "  mull  ",
                        { von: "2026-08-01" }))
      .toEqual({ q: "mull", typ: "", von: "2026-08-01", bis: "" });
  });

  it("laeszt das ausdrueckliche Teil gewinnen — auch fuer q selbst", () => {
    expect(mitGetipptem({ q: "alt", typ: "", von: "", bis: "" }, "mull", { q: "" }).q).toBe("");
  });
});

describe("JournalFilter", () => {
  it("kennt genau die vier Typen der Weiszliste", () => {
    expect([...TYPEN]).toEqual(["zugang", "entnahme", "korrektur", "umlagerung"]);
  });

  it("benutzt zwei DatePicker und KEINEN RangePicker", async () => {
    await mount(<JournalFilter q="" typ="" von="" bis="" hinweise={[]} />);
    expect(exists(".ant-picker-range")).toBe(false);
    expect(queryAll(".ant-picker").length).toBe(2);
  });

  it("zieht eine EXTERNE q-Aenderung in die Eingabe nach", async () => {
    // Geteilter Link oder Zurueck-Klick: das Feld musz den neuen Begriff
    // zeigen (`JournalFilter.tsx:29-36`).
    await mount(<JournalFilter q="" typ="" von="" bis="" hinweise={[]} />);
    await rerender(<JournalFilter q="mull" typ="" von="" bis="" hinweise={[]} />);
    expect(query<HTMLInputElement>("input[type='search']").value).toBe("mull");
    expect(replace).not.toHaveBeenCalled();
  });

  it("navigiert NICHT erneut, wenn q die eigene Schreibung ist — sonst faellt der Fokus", async () => {
    // DER committedQ-TANZ. Ohne ihn schriebe der Effekt nach jeder eigenen
    // Navigation erneut, und das Feld verloere beim Tippen den Fokus.
    await mount(<JournalFilter q="" typ="" von="" bis="" hinweise={[]} />);
    await fill("input[type='search']", "mull");
    await vi.advanceTimersByTimeAsync(300);
    expect(replace).toHaveBeenCalledTimes(1);
    replace.mockClear();
    await rerender(<JournalFilter q="mull" typ="" von="" bis="" hinweise={[]} />);
    await vi.advanceTimersByTimeAsync(600);
    expect(replace).not.toHaveBeenCalled();
  });

  it("zeigt eine verworfene Datumsgrenze als Text, nicht als Alert type=error", async () => {
    await mount(<JournalFilter q="" typ="" von="unsinn" bis="" hinweise={[
      "Das Datum in der Adresse ist ungültig und wurde ignoriert."]} />);
    expect(document.body.textContent).toContain("ungültig und wurde ignoriert");
    expect(exists(".ant-alert-error")).toBe(false);
  });
});

describe("Journalseite (page.tsx)", () => {
  it("schreibt das Vorzeichen in den TEXT, nicht nur in die Farbe", () => {
    // §6.11: `.jdelta.minus` hat unter src/ KEIN Netz. `mengeText` ist die
    // einzige Zusicherung, die es dafuer gibt — und sie ist ASCII (H6).
    expect(SEITE).toMatch(/journalZeile\(/);
    expect(SEITE).toMatch(/mengeText/);
    expect(SEITE).toMatch(/s\.jminus/);
    expect(SEITE).toMatch(/s\.jplus/);
    expect(SEITE).not.toMatch(/−/);
  });

  it("macht den Deckel 100 BEDINGT sichtbar", () => {
    expect(SEITE).toMatch(/JOURNAL_GRENZE/);
    expect(SEITE).toMatch(/deckelText\(/);
    expect(SEITE).not.toMatch(/Zeigt die neuesten 100 Treffer/);
  });

  it("traegt die fuenf abgelesenen Spalten", () => {
    for (const t of ["Zeit", "Artikel", "Vorgang", "Δ", "Quelle"]) {
      expect(SEITE).toContain(`title: "${t}"`);
    }
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/journal/JournalFilter.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./JournalFilter"`.

- [ ] **Schritt 3: `JournalFilter.tsx` und `page.tsx` schreiben**

```tsx
// JournalFilter.tsx — "use client".
"use client";
import { useEffect, useRef, useState } from "react";
import { Button, DatePicker, Flex, Input, Select } from "antd";
import dayjs from "dayjs";
import { useUrlFilter } from "../../../_ui/useUrlFilter";
import { typLabel } from "../../../_lib/format";
import { SCHRIFT } from "../../../_lib/schrift";
import s from "../../../_ui/verwaltung.module.css";

/** Die Weiszliste. Alles andere aus der Adresszeile faellt weg (T46). */
export const TYPEN = ["zugang", "entnahme", "korrektur", "umlagerung"] as const;

/**
 * Der BEDINGTE Beschreibungstext (§6.9.3). Der Bestand schreibt „Zeigt die
 * neuesten 100 Treffer" UNBEDINGT — auch wenn drei Zeilen zurueckkommen, und
 * behauptet damit eine Unvollstaendigkeit, die es nicht gibt.
 */
export function deckelText(gezeigt: number, mehrVorhanden: boolean): string {
  return mehrVorhanden
    ? "Neueste 100 von mehr Treffern — Zeitraum eingrenzen"
    : `${gezeigt} Treffer`;
}

/**
 * ⚠️ DIE ZEILE, DIE MAN BEIM PORTIEREN GERNE „AUFRAEUMT"
 * (`JournalFilter.tsx:40-41`): bei jedem Chip- und Datumsklick wird das
 * BEREITS GETIPPTE als `q` mitgeschrieben. Ohne sie verliert ein Datumsklick
 * den halb getippten Suchbegriff — und niemand vermutet die Ursache in einem
 * Datumsfeld.
 *
 * Sie steht als EIGENE Funktion da, weil sie sonst nur ueber antds
 * Select-Portal pruefbar waere: ein Test, der eine Option im Portal anklickt,
 * prueft rc-selects Markup und nicht diese Regel.
 */
export function mitGetipptem(
  basis: { q: string; typ: string; von: string; bis: string },
  getipptes: string,
  teil: Partial<{ q: string; typ: string; von: string; bis: string }>,
): { q: string; typ: string; von: string; bis: string } {
  return { ...basis, q: getipptes.trim(), ...teil };
}

export function JournalFilter({
  q, typ, von, bis, hinweise,
}: { q: string; typ: string; von: string; bis: string; hinweise: string[] }) {
  const setzeUrl = useUrlFilter();
  const [suche, setSuche] = useState(q);

  /**
   * ⚠️ DER committedQ-TANZ, UNVERAENDERT UEBERNOMMEN
   * (`JournalFilter.tsx:29-36`, §6.9.2 Punkt 3).
   *
   * Das Ref merkt sich den zuletzt SELBST in die URL geschriebenen Begriff.
   * Damit laeszt sich eine EXTERNE `q`-Aenderung (geteilter Link,
   * Zurueck-Klick) von einer selbst ausgeloesten unterscheiden:
   *
   *   extern         -> Eingabe nachziehen, aber NICHT erneut navigieren
   *                     (sonst machte ein Zurueck-Klick sich 300 ms spaeter
   *                     selbst rueckgaengig);
   *   selbst         -> nichts tun. SONST VERLIERT DAS FELD BEIM TIPPEN DEN
   *                     FOKUS, weil jede RSC-Navigation den Effekt erneut
   *                     ausloest.
   */
  const committedQ = useRef(q);

  useEffect(() => {
    if (q !== committedQ.current) {
      committedQ.current = q;
      setSuche(q);
    }
  }, [q]);

  // Debounce 300 ms fuer die Freitextsuche — jede Aenderung ist eine
  // RSC-Navigation ueber die GESAMTE Historie (Regime B, §6.9.1).
  useEffect(() => {
    const term = suche.trim();
    if (term === committedQ.current) return;
    const t = setTimeout(() => {
      committedQ.current = term;
      setzeUrl({ q: term, typ, von, bis });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suche, typ, von, bis]);

  const setParam = (teil: Partial<{ q: string; typ: string; von: string; bis: string }>) => {
    committedQ.current = suche.trim();
    setzeUrl(mitGetipptem({ q, typ, von, bis }, suche, teil));
  };

  const zuruecksetzen = () => {
    committedQ.current = "";
    setSuche("");
    setzeUrl({});
  };

  return (
    <Flex vertical gap={8} style={{ marginBlockEnd: 12 }}>
      <Flex gap={12} wrap align="center">
        {/* Die Rolle `searchbox` entsteht ALLEIN aus type="search"
            (§6.9.2 Punkt 2) — `suche-filter.spec.ts:15,28` greift sie. */}
        <Input
          type="search" aria-label="Suche" allowClear
          placeholder="Artikel oder Kommentar suchen…"
          value={suche} onChange={(e) => setSuche(e.target.value)}
          style={{ width: 260 }}
        />
        <Select
          allowClear aria-label="Vorgang" placeholder="Alle Vorgänge"
          style={{ minWidth: 180 }}
          value={typ || undefined}
          onChange={(v) => setParam({ typ: v ?? "" })}
          options={TYPEN.map((t) => ({ value: t, label: typLabel(t) }))}
        />
        {/* Zwei DatePicker, kein RangePicker: `von` und `bis` sind zwei
            UNABHAENGIGE URL-Parameter (§6.9.2 Punkt 4). */}
        <DatePicker
          value={von ? dayjs(von) : null} format="YYYY-MM-DD" aria-label="Zeitraum von"
          disabledDate={(d) => (bis ? d.isAfter(dayjs(bis)) : false)}
          onChange={(d) => setParam({ von: d ? d.format("YYYY-MM-DD") : "" })}
        />
        <DatePicker
          value={bis ? dayjs(bis) : null} format="YYYY-MM-DD" aria-label="Zeitraum bis"
          disabledDate={(d) => (von ? d.isBefore(dayjs(von)) : false)}
          onChange={(d) => setParam({ bis: d ? d.format("YYYY-MM-DD") : "" })}
        />
        {q || typ || von || bis
          ? <Button onClick={zuruecksetzen}>Zurücksetzen</Button>
          : null}
      </Flex>
      {hinweise.map((h) => (
        // Verworfene Datumsgrenzen als Text mit linker Kante, KEIN
        // `Alert type="error"` (§6.6.5, §5.14.2).
        <div key={h} className={s.infobox} style={SCHRIFT.neben}>{h}</div>
      ))}
    </Flex>
  );
}
```

```tsx
// page.tsx
import { Table } from "antd";
import { getDb } from "../../../_db/client";
import { journalEintraege, type BuchungTyp } from "../../../_lib/lesepfade/journal";
import { zeitraumAus } from "../../../_lib/format";
import { journalZeile } from "../../../_lib/journalZeile";
import { JOURNAL_GRENZE } from "../../../_lib/grenzen";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { Chip } from "../../../_ui/Chip";
import s from "../../../_ui/verwaltung.module.css";
import { JournalFilter, deckelText, TYPEN } from "./JournalFilter";

export const dynamic = "force-dynamic";

/**
 * REGIME B — der Filterzustand lebt in der URL, damit die Suche ueber die
 * GESAMTE Historie geht und nicht nur im geladenen Ausschnitt (§6.9.1).
 *
 * ⚠️ `pagination={false}` IST HIER DIE AUSSAGE. Ohne die Angabe erzeugte antd
 * einen Seitenumbruch ueber einem AUSSCHNITT: der Pager saegte „10 von 100",
 * waehrend dahinter Zehntausende Buchungen liegen.
 */
export default async function JournalSeite({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; typ?: string; von?: string; bis?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const typ = (TYPEN as readonly string[]).includes(sp.typ ?? "")
    ? (sp.typ as BuchungTyp) : undefined;
  const zeitraum = zeitraumAus(sp.von, sp.bis);
  const { zeilen, mehrVorhanden } = journalEintraege(getDb(), {
    q: q || undefined, typ, von: zeitraum.von, bis: zeitraum.bis, grenze: JOURNAL_GRENZE,
  });

  return (
    <>
      <SeitenKopf titel="Journal"
        beschreibung={`Append-only Buchungsjournal — der Bestand ist immer die Summe der Buchungen. ${deckelText(zeilen.length, mehrVorhanden)}.`} />
      <JournalFilter q={q} typ={typ ?? ""} von={sp.von ?? ""} bis={sp.bis ?? ""}
                     hinweise={zeitraum.hinweise} />
      <Table
        rowKey="id" pagination={false} scroll={{ x: "max-content" }}
        aria-label="Buchungsjournal" dataSource={zeilen}
        locale={{ emptyText: q || typ || sp.von || sp.bis
          ? "Keine Buchung passt zu Suche, Vorgang und Zeitraum."
          : "Noch keine Buchung." }}
        columns={[
          { title: "Zeit", dataIndex: "ts",
            render: (t: Date) => (
              <span className={s.jts}>
                {t.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
              </span>
            ) },
          { title: "Artikel", dataIndex: "artikelName",
            render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
          { title: "Vorgang", dataIndex: "typ",
            render: (_: string, j) => {
              const d = journalZeile(j);
              return j.kommentar ? `${d.typText} · ${j.kommentar}` : d.typText;
            } },
          {
            title: "Δ", dataIndex: "menge", align: "right" as const,
            /* ⚠️ DAS VORZEICHEN STEHT IM TEXT (§6.11, Teil 3 T42).
               `.jdelta.minus` hat unter src/ KEIN Netz; `mengeText` ist die
               einzige Zusicherung, die es dafuer gibt — und sie ist ASCII
               (Festlegung H6). Ein typografisches Minus (U+2212) laese sich
               schoener und waere genau die Klasse Fehler, vor der §12.3 warnt:
               niemand sieht einem Selektor an, dass er an einem unsichtbaren
               Zeichenunterschied scheitert. DAS ZEICHEN SELBST STEHT DESHALB
               NIRGENDS IN DIESER DATEI — auch nicht in einem Kommentar; der
               Test prueft den ROHTEXT der Datei. */
            render: (_: number, j) => {
              const d = journalZeile(j);
              return (
                <span className={`${s.jdelta} ${d.zustand === "negativ" ? s.jminus : s.jplus}`}>
                  {d.mengeText}
                </span>
              );
            },
          },
          { title: "Quelle", dataIndex: "quelleName",
            render: (v: string) => <Chip ton="grau">{v}</Chip> },
        ]}
      />
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/journal/JournalFilter.test.tsx"
```

Erwartet: PASS.

- [ ] **Schritt 5: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/journal/"
rtk git commit -m "feat(lagerbuch): /verwaltung/journal — committedQ, Deckel 100, Vorzeichen im Text

Der committedQ-Tanz wandert unveraendert mit: ohne ihn verliert das Suchfeld
beim Tippen den Fokus. Und die Zeile, die man gerne aufraeumt — bei jedem
Chip- und Datumsklick wird das bereits Getippte als q mitgeschrieben; ohne sie
verliert ein Datumsklick den halb getippten Begriff. Debounce 300 ms.

Der Deckel 100 wird BEDINGT genannt; der Bestand schreibt ihn unbedingt, auch
wenn drei Zeilen zurueckkommen.

Das Vorzeichen steht im TEXT (journalZeile().mengeText), nicht nur in der
Farbe — .jdelta.minus hat unter src/ kein Netz, und das ist die einzige
Zusicherung, die es dafuer gibt. Es ist ASCII (H6): ein typografisches U+2212
waere genau der unsichtbare Zeichenunterschied, an dem Selektoren still
scheitern."
```

---

### Task 148: `/verwaltung/tokens` — Zugangs-Codes

**Files:** Create `verwaltung/(arbeit)/tokens/page.tsx`, `.../TokenTable.tsx`, `.../NeuToken.tsx`;
Test `.../TokenTable.test.tsx`.

**Interfaces:** Consumes `_lib/lesepfade/tokens.ts` (T126) — `tokenListe`, `tokenZiele`;
`_actions/tokens.ts` — `createToken`, `setTokenAktiv`; `_actions/loeschen.ts`; `_lib/mengen.ts` —
`toggleInSet`; `_ui/Chip`, `_ui/LoeschButton`, `_ui/Suchfeld`, `_ui/Trefferanzeige`.
Produces `/verwaltung/tokens`.

- Produces (spätere Teile sehen NUR diesen Block):
  ```tsx
  // TokenTable.tsx — "use client".
  export type ZielFilter = "fahrzeug" | "artikel" | "liste";
  export function sucheTrifft(z: TokenZeile, begriff: string): boolean;
  export function zielVon(z: TokenZeile): ZielFilter;
  export function TokenTable(props: { zeilen: TokenZeile[] }): JSX.Element;

  // NeuToken.tsx — "use client".
  export function NeuToken(props: {
    ziele: {
      fahrzeuge: { id: string; name: string; kennung: string | null }[];
      artikel: { id: string; name: string; fach: string }[];
    };
  }): JSX.Element;
  ```

**Spalten, abgelesen aus `TokenTable.tsx:57-80`:**

| # | Titel | Anmerkung |
|---|---|---|
| 1 | Code | `SCHRIFT.mono`, fett — **Ersatzanker für `[title="111-111"]`**: `getByRole("row", { name: /111-111/ })` |
| 2 | Bezeichnung | `label` |
| 3 | Ziel | Chip mit Zeichen `fahrzeug` / `objekt` / `liste`, dazu `zielName` bzw. „Artikel-Liste" |
| 4 | Status | Chip „aktiv" (ok) / „gesperrt" (rot) |
| 5 | Zuletzt benutzt | `fmtTs` oder „nie benutzt" |
| 6 | — | Knopf „Sperren"/„Reaktivieren" (`size="small"`) + `LoeschButton nurZeichen` |

**Suchfeldmenge (6 von 6):** Code · Label · Zielname (`TokenTable.tsx:28-35`).
**Filter:** gesperrt (einzelne `Checkbox`) · **Fahrzeug / Artikel / Artikel-Liste als
`Checkbox.Group`** (Mehrfachauswahl, `toggleInSet`).

⚠️ **`LoeschButton art="token"` trägt `deaktivierenLabel="Sperren"`** (§6.4.5, Punkt 3) — der zweite
Ausgang heißt hier nicht „Deaktivieren".
⚠️ **Teil 6 kann diesen Löschweg streichen** (Entscheidung 8-F, §8.3). Dann entfällt der
`LoeschButton`-Aufruf **auf dieser Seite**, nicht der Dialog.
⚠️ **`NeuToken` zeigt den erzeugten Code nach dem Anlegen an** — er ist die einzige Gelegenheit, ihn
zu notieren, bevor das Etikett gedruckt wird.
⚠️ **`fmtTs` gibt es im neuen Modul NICHT.** Teil 3s `_lib/format.ts` (T39) führt sechs Funktionen,
und `fmtTs` ist keine davon; ein Import wäre ein Testlauf gegen eine Datei, die kein Schritt anlegt.
Der Zeitstempel wird deshalb **inline** formatiert — `toLocaleString("de-DE", { timeZone:
"Europe/Berlin" })`, zeichengleich zu T137 und T139.
⚠️ **`toggleInSet` hängt auch hier am `onChange` DER EINZELNEN OPTION**, aus demselben Grund wie in
T143: das Gruppen-`onChange` liefert die vollständige Auswahl, und die Gruppe darf deshalb **kein**
eigenes `onChange` tragen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/tokens/TokenTable.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, click, fill, query, queryAll, exists }
  from "@/app/m/qr/_lib/test-dom";
import { TokenTable, sucheTrifft, zielVon } from "./TokenTable";
import s from "../../../_ui/verwaltung.module.css";

vi.mock("../../../_actions/tokens", () => ({
  createToken: async () => ({ ok: true, wert: { id: "t9", code: "999-999" } }),
  setTokenAktiv: async () => ({ ok: true }),
}));
vi.mock("../../../_actions/loeschen", () => ({
  pruefeLoeschbar: async () => ({ ok: true, wert: { loeschbar: true } }),
  loescheElement: async () => ({ ok: true }),
  deaktiviereElement: async () => ({ ok: true }),
}));

const FZ = {
  id: "t1", code: "111-111", label: "RTW 1 Kärtchen", aktiv: true,
  lastUsedAt: new Date("2026-07-30T10:00:00Z"), createdAt: new Date("2026-01-01T00:00:00Z"),
  zielTyp: "fahrzeug" as const, zielId: "rtw-1", zielName: "RTW 1",
};
const LISTE = {
  id: "t2", code: "222-222", label: "Regal", aktiv: false,
  lastUsedAt: null, createdAt: new Date("2026-01-01T00:00:00Z"),
  zielTyp: null, zielId: null, zielName: null,
};
const ZEILEN = [FZ, LISTE];
afterEach(async () => { await unmount(); });

describe("TokenTable", () => {
  it("traegt die sechs abgelesenen Spalten", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);
    expect(queryAll("thead th").map((th) => th.textContent))
      .toEqual(["Code", "Bezeichnung", "Ziel", "Status", "Zuletzt benutzt", ""]);
  });

  it("sucht ueber Code, Label UND Zielname (6 von 6)", () => {
    expect(sucheTrifft(FZ, "111-111")).toBe(true);
    expect(sucheTrifft(FZ, "kärtchen")).toBe(true);
    expect(sucheTrifft(FZ, "rtw")).toBe(true);
    expect(sucheTrifft(FZ, "regal")).toBe(false);
  });

  it("ein Token ohne Ziel ist die Artikel-Liste", () => {
    expect(zielVon(FZ)).toBe("fahrzeug");
    expect(zielVon(LISTE)).toBe("liste");
  });

  it("der Code steht als Text in der Zeile — Ersatzanker fuer [title=\"111-111\"]", async () => {
    // §6.11: `[title="111-111"]` war eine Zusicherung an einem title-Attribut
    // und ueberlebt den antd-Umbau nicht. Der Ersatz ist der Zeilentext.
    await mount(<TokenTable zeilen={ZEILEN} />);
    expect(queryAll("tbody tr")[0].textContent).toContain("111-111");
  });

  it("schreibt „nie benutzt\" aus, statt eine leere Zelle zu lassen", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);
    expect(document.body.textContent).toContain("nie benutzt");
  });

  it("der zweite Ausgang heiszt „Sperren\", nicht „Deaktivieren\"", () => {
    // §6.4.5 Punkt 3: `LoeschButton art="token"` traegt
    // deaktivierenLabel="Sperren". Teil 6 kann den Loeschweg streichen
    // (Entscheidung 8-F) — dann faellt DIESER AUFRUF, nicht der Dialog.
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/tokens/TokenTable.tsx", "utf8");
    expect(quelle).toMatch(/deaktivierenLabel="Sperren"/);
    expect(quelle).not.toMatch(/deaktivierenLabel="Deaktivieren"/);
  });

  it("die Zielfilter sind eine Checkbox.Group, „gesperrt\" eine einzelne Checkbox", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);
    expect(queryAll(".ant-checkbox-group .ant-checkbox-input").length).toBe(3);
    expect(exists(".ant-segmented")).toBe(false);
  });

  it("ein Zielfilter-Klick schaltet GENAU einen Wert um", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);
    await click(".ant-checkbox-group .ant-checkbox-input");
    expect(queryAll("tbody tr").length).toBe(1);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("1 von 2");
  });

  it("zeigt „X von Y\" erst beim Filtern", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);
    await fill("input[type='search']", "zzz");
    expect(query(`.${s.filtertreffer}`).textContent).toBe("0 von 2");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/tokens/TokenTable.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./TokenTable"`.

- [ ] **Schritt 3: `TokenTable.tsx`, `NeuToken.tsx` und `page.tsx` schreiben**

```tsx
// TokenTable.tsx — "use client".
"use client";
import { useMemo, useState, useTransition } from "react";
import { Button, Checkbox, Flex, Table } from "antd";
import { falte } from "../../../_lib/suche";
import { toggleInSet } from "../../../_lib/mengen";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import { LoeschButton } from "../../../_ui/LoeschButton";
import { setTokenAktiv } from "../../../_actions/tokens";
import { pruefeLoeschbar, loescheElement, deaktiviereElement }
  from "../../../_actions/loeschen";
import type { TokenZeile } from "../../../_lib/lesepfade/tokens";

export type ZielFilter = "fahrzeug" | "artikel" | "liste";

/** Ein Token OHNE Ziel ist die Artikel-Liste — das ist kein Fehlzustand. */
export function zielVon(z: TokenZeile): ZielFilter {
  return z.zielTyp ?? "liste";
}

/** SUCHFELDMENGE 6 VON 6: Code · Label · Zielname. */
export function sucheTrifft(z: TokenZeile, begriff: string): boolean {
  const q = falte(begriff.trim());
  return !q || falte(`${z.code} ${z.label} ${z.zielName ?? ""}`).includes(q);
}

/** ⚠️ `fmtTs` gibt es im neuen Modul NICHT (Teil 3, T39 fuehrt sechs andere
 *  Funktionen). Inline formatiert, zeichengleich zu T137 und T139. */
const ts = (d: Date) => d.toLocaleString("de-DE", { timeZone: "Europe/Berlin" });

export function TokenTable({ zeilen }: { zeilen: TokenZeile[] }) {
  const [laeuft, start] = useTransition();
  const [suche, setSuche] = useState("");
  const [nurGesperrt, setNurGesperrt] = useState(false);
  const [ziele, setZiele] = useState<ReadonlySet<ZielFilter>>(new Set());

  const gefiltert = useMemo(() => zeilen.filter((z) => {
    if (nurGesperrt && z.aktiv) return false;
    if (ziele.size > 0 && !ziele.has(zielVon(z))) return false;
    return sucheTrifft(z, suche);
  }), [zeilen, suche, nurGesperrt, ziele]);

  /** ⚠️ Wie in T143: `toggleInSet` haengt am onChange DER OPTION. Die Gruppe
   *  traegt KEIN eigenes `onChange` — sonst liefe jeder Klick zweimal. */
  const um = (z: ZielFilter) => () => setZiele((s) => toggleInSet(s, z));

  return (
    <>
      <Flex gap={12} wrap align="center" style={{ marginBlockEnd: 12 }}>
        <Suchfeld wert={suche} onWert={setSuche}
                  platzhalter="Code, Bezeichnung oder Ziel suchen…" />
        <Checkbox checked={nurGesperrt} onChange={(e) => setNurGesperrt(e.target.checked)}>
          gesperrt
        </Checkbox>
        <Checkbox.Group
          value={[...ziele]}
          options={[
            { value: "fahrzeug", onChange: um("fahrzeug"),
              label: <span><Ikone name="fahrzeug" groesse={12} /> Fahrzeug</span> },
            { value: "artikel", onChange: um("artikel"),
              label: <span><Ikone name="objekt" groesse={12} /> Artikel</span> },
            { value: "liste", onChange: um("liste"),
              label: <span><Ikone name="liste" groesse={12} /> Artikel-Liste</span> },
          ]}
        />
        <Trefferanzeige gezeigt={gefiltert.length} gesamt={zeilen.length} />
      </Flex>
      <Table
        rowKey="id" pagination={false} scroll={{ x: "max-content" }}
        aria-label="Zugangs-Codes" dataSource={gefiltert}
        locale={{ emptyText: suche || ziele.size > 0 || nurGesperrt
          ? "Kein Code passt zu Suche und Filter."
          : "Noch keine Codes. Lege oben den ersten an." }}
        columns={[
          {
            title: "Code", dataIndex: "code",
            /* ERSATZANKER fuer `[title="111-111"]` (§6.11): der Code steht als
               TEXT in der Zeile, nicht in einem title-Attribut —
               `getByRole("row", { name: /111-111/ })`. */
            render: (v: string) => (
              <span style={{ ...SCHRIFT.mono, fontWeight: 600 }}>{v}</span>
            ),
          },
          { title: "Bezeichnung", dataIndex: "label" },
          { title: "Ziel", dataIndex: "zielTyp",
            render: (_: unknown, z) => {
              const art = zielVon(z);
              return (
                <Chip ton="grau"
                      zeichen={art === "fahrzeug" ? "fahrzeug"
                             : art === "artikel" ? "objekt" : "liste"}>
                  {art === "liste" ? "Artikel-Liste" : (z.zielName ?? "—")}
                </Chip>
              );
            } },
          { title: "Status", dataIndex: "aktiv",
            render: (v: boolean) => (
              <Chip ton={v ? "ok" : "rot"}>{v ? "aktiv" : "gesperrt"}</Chip>
            ) },
          { title: "Zuletzt benutzt", dataIndex: "lastUsedAt",
            render: (d: Date | null) => (
              <span style={SCHRIFT.neben}>{d ? ts(d) : "nie benutzt"}</span>
            ) },
          {
            title: "", dataIndex: "id",
            render: (_: string, z) => (
              <Flex gap={8} align="center">
                <Button
                  size="small" disabled={laeuft}
                  onClick={() => start(async () => {
                    await setTokenAktiv({ id: z.id, aktiv: !z.aktiv });
                  })}
                >
                  {z.aktiv ? "Sperren" : "Reaktivieren"}
                </Button>
                {/* ⚠️ §6.4.5 Punkt 3: der zweite Ausgang heiszt hier
                    „Sperren", nicht „Deaktivieren". TEIL 6 kann diesen
                    Loeschweg streichen (Entscheidung 8-F) — dann entfaellt
                    DIESER AUFRUF, nicht der Dialog. */}
                <LoeschButton
                  nurZeichen name={z.code} typLabel="Zugangs-Code"
                  deaktivierenLabel="Sperren"
                  pruefen={async () => {
                    const e = await pruefeLoeschbar("token", z.id);
                    return e.ok ? e.wert : { loeschbar: false as const,
                      grund: e.fehler, kannDeaktivieren: true };
                  }}
                  onLoeschen={async () => { await loescheElement("token", z.id); }}
                  onDeaktivieren={async () => { await deaktiviereElement("token", z.id); }}
                />
              </Flex>
            ),
          },
        ]}
      />
    </>
  );
}
```

`NeuToken.tsx` ist eine `"use client"`-Insel: ein `Button` „Neuen Code anlegen" öffnet ein `Modal`
mit `Form` (Absendeknopf), den Feldern Bezeichnung (`Input`), Zielart (`Radio.Group`
Fahrzeug/Artikel/Artikel-Liste) und — je nach Zielart — `Select showSearch` über
`ziele.fahrzeuge` bzw. `ziele.artikel`. Sie ruft `createToken` aus `_actions/tokens.ts` und zeigt
Feldfehler über `form.setFields`. ⚠️ **Nach `ok` bleibt das `Modal` offen und zeigt den erzeugten
Code `erg.wert.code` groß in `SCHRIFT.mono`** — er ist die **einzige** Gelegenheit, ihn zu notieren,
bevor das Etikett gedruckt wird; `tokenListe` liefert ihn danach zwar weiter, aber wer das Fenster
schließt, ohne hinzusehen, sucht ihn in einer Liste mit sechzig Zeilen.

```tsx
// page.tsx
import { getDb } from "../../../_db/client";
import { tokenListe, tokenZiele } from "../../../_lib/lesepfade/tokens";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { TokenTable } from "./TokenTable";
import { NeuToken } from "./NeuToken";

export const dynamic = "force-dynamic";

export default function TokensSeite() {
  const db = getDb();
  return (
    <>
      <SeitenKopf titel="Zugangs-Codes"
        beschreibung="Sechsstellige Codes für den Helfer-Weg. Ein Code zeigt entweder auf ein Fahrzeug, auf einen Artikel oder auf die Artikel-Liste."
        aktionen={<NeuToken ziele={tokenZiele(db)} />} />
      <TokenTable zeilen={tokenListe(db)} />
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/tokens/TokenTable.test.tsx"
```

Erwartet: PASS.

- [ ] **Schritt 5: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/tokens/"
rtk git commit -m "feat(lagerbuch): /verwaltung/tokens — Codes, Ziele, Sperren

Sechs Spalten; Suchfeldmenge 6 von 6 (Code, Label, Zielname). Die Zielfilter
sind eine Checkbox.Group, 'gesperrt' eine einzelne Checkbox.

LoeschButton art='token' traegt deaktivierenLabel='Sperren'. Teil 6 kann
diesen Loeschweg streichen (Entscheidung 8-F) — dann entfaellt der Aufruf,
nicht der Dialog.

NeuToken zeigt den erzeugten Code an: die einzige Gelegenheit, ihn zu
notieren, bevor das Etikett gedruckt wird.

fmtTs gibt es im neuen Modul nicht (T39 fuehrt sechs andere Funktionen); der
Zeitstempel wird inline formatiert, zeichengleich zu T137 und T139."
```

---

### Task 149: `/verwaltung/import` — Vorschau und Fehlerbericht

**Files:** Create `verwaltung/(arbeit)/import/page.tsx`, `.../ImportForm.tsx`;
Test `.../ImportForm.test.tsx`.

**Interfaces:** Consumes `_lib/csv.ts` (T125) — `parseArtikelCsv` (**für die Vorschau, im Browser**);
`_actions/csv.ts` — `importArtikelCsv`; `_ui/SeitenKopf`, `_ui/Chip`. Produces `/verwaltung/import`.

- Produces (spätere Teile sehen NUR diesen Block):
  ```tsx
  // ImportForm.tsx — "use client".
  export function vorschauAus(text: string): { rows: CsvZeile[]; fehler: string[] };
  export function VorschauTabelle(props: { rows: CsvZeile[] }): JSX.Element;
  export function Fehlerbericht(props: { fehler: string[] }): JSX.Element | null;
  export function ImportForm(): JSX.Element;
  ```

**Vorschau-Spalten, abgelesen aus `ImportForm.tsx`:** `Artikel` · `Fach` · `Einheit` ·
`Mindestbestand` (rechtsbündig) · `Startbestand` (rechtsbündig).

⚠️ **Die Vorschau läuft im Browser gegen DENSELBEN Parser** (`_lib/csv.ts`), den die Action
serverseitig benutzt. Ein zweiter, „schneller" Vorschau-Parser wäre zwei Wahrheiten über dieselbe
Datei — und die Vorschau zeigte etwas anderes, als hinterher angelegt wird. **Genau deshalb liegt
`parseArtikelCsv` in `_lib/` und nicht in der `"use server"`-Datei.**
⚠️ **Der Fehlerbericht steht NEBEN der Vorschau, nicht statt ihrer** (§6.2.2 Zeile 23): gültige
Zeilen werden angelegt, ungültige einzeln mit Zeilennummer gemeldet — `Alert type="warning"`,
**nie** `type="error"`.
⚠️ **`<input type="file" accept=".csv,text/csv">`, nicht antds `Upload`.** `Upload` bringt eine
Warteschlange und einen Fortschrittsbalken für einen Vorgang mit, der **lokal** und **sofort** ist;
die Datei wird gelesen, nicht hochgeladen. Das Feld trägt `aria-label="CSV-Datei wählen"`.
⚠️ **Die fünf Spalten stehen NICHT im Bestand.** `ImportForm.tsx` @ `ca04eb1` ist ein
`<textarea aria-label="CSV-Daten">` mit Ergebnisliste und **hat überhaupt keine Vorschau** — die
Zeile „abgelesen aus `ImportForm.tsx`" ist an dieser Stelle eine Fehlangabe der Vorlage. Die fünf
Spalten sind die Feldmenge von `CsvZeile` (T125) und damit trotzdem verbindlich; sie sind ein
**Zugewinn** gegenüber dem Bestand und kein Port.
⚠️ **Das Lesen der Datei ist NICHT der Prüfgegenstand.** `vorschauAus`, `VorschauTabelle` und
`Fehlerbericht` sind eigene Exporte, damit der Test sie direkt aufrufen kann; ein Test, der in jsdom
ein `File`-Objekt in ein `input.files` schiebt und auf `change` wartet, prüfte die
`FileReader`-Nachbildung von jsdom und nicht die Vorschau.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/verwaltung/(arbeit)/import/ImportForm.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import { parseArtikelCsv } from "../../../_lib/csv";
import { ImportForm, VorschauTabelle, Fehlerbericht, vorschauAus } from "./ImportForm";

vi.mock("../../../_actions/csv", () => ({
  importArtikelCsv: async () => ({ ok: true, wert: { angelegt: 1, fehler: [] } }),
}));

const CSV = "Name;Einheit;Fach;Mindestbestand;Startbestand\nMullbinde;Stk;A1;20;5";
afterEach(async () => { await unmount(); });

describe("vorschauAus", () => {
  it("benutzt DENSELBEN Parser wie die Action", () => {
    // Ein zweiter, „schneller" Vorschau-Parser waere zwei Wahrheiten ueber
    // dieselbe Datei — und die Vorschau zeigte etwas anderes, als hinterher
    // angelegt wird. Genau deshalb liegt parseArtikelCsv in _lib/.
    const erwartet = parseArtikelCsv(CSV);
    expect(vorschauAus(CSV)).toEqual({ rows: erwartet.rows, fehler: erwartet.errors });
  });
});

describe("VorschauTabelle", () => {
  it("traegt die fuenf Spalten von CsvZeile", async () => {
    await mount(<VorschauTabelle rows={parseArtikelCsv(CSV).rows} />);
    expect(queryAll("thead th").map((th) => th.textContent))
      .toEqual(["Artikel", "Fach", "Einheit", "Mindestbestand", "Startbestand"]);
  });
});

describe("Fehlerbericht", () => {
  it("ist warning, nie error", async () => {
    // §6.2.2 Zeile 23, §6.6.5: gueltige Zeilen werden angelegt, ungueltige
    // einzeln gemeldet. Das ist ein Bericht, keine Stoerung.
    await mount(<Fehlerbericht fehler={["Zeile 3: Mindestbestand ist keine Zahl"]} />);
    expect(exists(".ant-alert-warning")).toBe(true);
    expect(exists(".ant-alert-error")).toBe(false);
    expect(document.body.textContent).toContain("Zeile 3");
  });

  it("verschwindet, wenn es nichts zu melden gibt", async () => {
    await mount(<Fehlerbericht fehler={[]} />);
    expect(exists(".ant-alert")).toBe(false);
  });
});

describe("ImportForm", () => {
  it("nimmt ein nacktes input[type=file], NICHT antds Upload", async () => {
    // `Upload` bringt Warteschlange und Fortschrittsbalken fuer einen Vorgang
    // mit, der lokal und sofort ist: die Datei wird gelesen, nicht hochgeladen.
    await mount(<ImportForm />);
    expect(exists(".ant-upload")).toBe(false);
    const feld = query<HTMLInputElement>("input[type='file']");
    expect(feld.getAttribute("accept")).toBe(".csv,text/csv");
    expect(feld.getAttribute("aria-label")).toBe("CSV-Datei wählen");
  });

  it("der Importknopf bleibt gesperrt, solange nichts gelesen wurde", async () => {
    await mount(<ImportForm />);
    expect(query("button[data-rolle='import']").hasAttribute("disabled")).toBe(true);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/import/ImportForm.test.tsx"
```

Erwartet: FAIL mit `Failed to resolve import "./ImportForm"`.

- [ ] **Schritt 3: `ImportForm.tsx` und `page.tsx` schreiben**

```tsx
// ImportForm.tsx — "use client".
"use client";
import { useState, useTransition } from "react";
import { Alert, Button, Flex, Table } from "antd";
import { parseArtikelCsv, type CsvZeile } from "../../../_lib/csv";
import { importArtikelCsv } from "../../../_actions/csv";
import { SCHRIFT } from "../../../_lib/schrift";
import s from "../../../_ui/verwaltung.module.css";

/**
 * ⚠️ DIE VORSCHAU LAEUFT GEGEN DENSELBEN PARSER WIE DIE ACTION.
 *
 * Ein zweiter, „schneller" Vorschau-Parser waere zwei Wahrheiten ueber
 * dieselbe Datei: die Vorschau zeigte etwas anderes, als hinterher angelegt
 * wird — und niemand haette einen Grund, der Vorschau zu misstrauen. Genau
 * deshalb liegt `parseArtikelCsv` in `_lib/csv.ts` und NICHT in der
 * `"use server"`-Datei: dort waere jeder Export eine Server Action und im
 * Browser nicht aufrufbar.
 */
export function vorschauAus(text: string): { rows: CsvZeile[]; fehler: string[] } {
  const { rows, errors } = parseArtikelCsv(text);
  return { rows, fehler: errors };
}

export function VorschauTabelle({ rows }: { rows: CsvZeile[] }) {
  return (
    <Table
      rowKey={(r) => `${r.fach}/${r.name}`} pagination={false} scroll={{ x: "max-content" }}
      aria-label="Vorschau" dataSource={rows}
      locale={{ emptyText: "Keine gültige Zeile in der Datei." }}
      columns={[
        { title: "Artikel", dataIndex: "name",
          render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
        { title: "Fach", dataIndex: "fach",
          render: (v: string) => <span className={s.fach}>{v}</span> },
        { title: "Einheit", dataIndex: "einheit" },
        { title: "Mindestbestand", dataIndex: "mindestbestand", align: "right" as const,
          render: (v: number) => <span style={SCHRIFT.zahl}>{v}</span> },
        { title: "Startbestand", dataIndex: "startbestand", align: "right" as const,
          render: (v: number) => <span style={SCHRIFT.zahl}>{v}</span> },
      ]}
    />
  );
}

/**
 * ⚠️ DER FEHLERBERICHT STEHT NEBEN DER VORSCHAU, NICHT STATT IHRER
 * (§6.2.2 Zeile 23). Gueltige Zeilen werden angelegt, ungueltige einzeln mit
 * Zeilennummer gemeldet — `warning`, NIE `error`: das ist ein Bericht ueber
 * eine Datei, keine Stoerung des Systems (§6.6.5, Falle 3).
 */
export function Fehlerbericht({ fehler }: { fehler: string[] }) {
  if (fehler.length === 0) return null;
  return (
    <Alert
      type="warning" showIcon={false}
      message={`${fehler.length} Zeile(n) werden übersprungen`}
      description={
        <ul style={{ margin: 0, paddingInlineStart: 18 }}>
          {fehler.map((f) => <li key={f} style={SCHRIFT.mono}>{f}</li>)}
        </ul>
      }
    />
  );
}

export function ImportForm() {
  const [text, setText] = useState("");
  const [ergebnis, setErgebnis] = useState<{ angelegt: number; fehler: string[] } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const vorschau = vorschauAus(text);

  return (
    <Flex vertical gap={12}>
      {/* ⚠️ NACKTES input[type=file], NICHT antds `Upload`. `Upload` bringt
          eine Warteschlange und einen Fortschrittsbalken fuer einen Vorgang
          mit, der LOKAL und SOFORT ist: die Datei wird gelesen, nicht
          hochgeladen. Beides waere irrefuehrend. */}
      <input
        type="file" accept=".csv,text/csv" aria-label="CSV-Datei wählen"
        onChange={async (e) => {
          const datei = e.target.files?.[0];
          if (!datei) return;
          setErgebnis(null);
          setFehler(null);
          setText(await datei.text());
        }}
      />

      <VorschauTabelle rows={vorschau.rows} />
      <Fehlerbericht fehler={vorschau.fehler} />

      <Button
        type="primary" data-rolle="import" loading={laeuft}
        disabled={laeuft || vorschau.rows.length === 0}
        onClick={() => start(async () => {
          const erg = await importArtikelCsv(text);
          if (!erg.ok) { setFehler(erg.fehler); return; }
          setFehler(null);
          setErgebnis(erg.wert);
          setText("");
        })}
      >
        {/* Die Beschriftung ist Vertrag: Zeile 40 der Aufrufer-Tabelle (§3). */}
        Importieren
      </Button>

      {ergebnis
        ? <Alert type="success" showIcon={false}
                 message={`${ergebnis.angelegt} Artikel angelegt.`} />
        : null}
      {ergebnis && ergebnis.fehler.length > 0 ? <Fehlerbericht fehler={ergebnis.fehler} /> : null}
      {fehler ? <Alert type="warning" showIcon={false} message={fehler} /> : null}
    </Flex>
  );
}
```

```tsx
// page.tsx
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export default function ImportSeite() {
  return (
    <>
      <SeitenKopf titel="CSV-Import"
        beschreibung="Spalten: Name · Einheit · Fach · Mindestbestand · Startbestand. Trennzeichen Komma oder Semikolon; die Kopfzeile ist optional. Ein Startbestand über 0 wird als Korrektur-Buchung „CSV-Startbestand“ im Journal erfasst." />
      <ImportForm />
    </>
  );
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/import/ImportForm.test.tsx"
```

Erwartet: PASS.

- [ ] **Schritt 5: Commit**

```bash
rtk git add "src/app/m/lagerbuch/verwaltung/(arbeit)/import/"
rtk git commit -m "feat(lagerbuch): /verwaltung/import — Vorschau gegen denselben Parser

Die Browser-Vorschau benutzt _lib/csv.ts, denselben Parser wie die Action. Ein
zweiter 'schneller' Vorschau-Parser waere zwei Wahrheiten ueber dieselbe Datei
— und die Vorschau zeigte etwas anderes, als hinterher angelegt wird.

Der Fehlerbericht steht NEBEN der Vorschau: gueltige Zeilen werden angelegt,
ungueltige einzeln mit Zeilennummer gemeldet, als Alert type=warning.

<input type=file> statt antds Upload: die Datei wird gelesen, nicht
hochgeladen — eine Warteschlange und ein Fortschrittsbalken waeren fuer einen
lokalen Vorgang irrefuehrend.

Die fuenf Vorschau-Spalten sind ein Zugewinn, kein Port: der Bestand hat
ueberhaupt keine Vorschau, sondern ein textarea mit Ergebnisliste."
```

---

### Gate nach Welle 6

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build && pnpm exec playwright test
```

---

## Welle 7 — Abnahme (3 Tasks: T150 parallel, T151 und T152 seriell)

**Abnahme, nicht TDD — alle drei.** Auch **T150**: der E2E ist zwar eine neue Datei, seine vier
Subjekte (`_lib/nav.ts` aus T102, `.modulnav` aus T105) stehen aber seit rund vierzig Tasks. Nach
T149 geschrieben, ist er **von Anfang an grün**; ein „muss FEHLSCHLAGEN" wäre eine falsche Behauptung
im Plan. T151 und T152 prüfen **zusammengesetztes Verhalten**, das zu ihrer Entstehungszeit schon
gebaut ist. Alle drei nennen statt „Rot, weil …" die **Mutation**, die sie fangen, und alle drei
fahren sie **einmal von Hand** — ein grüner Test, der nie rot war, beweist nichts.

---

### Task 150: **Abnahme** — `e2e/lagerbuch-verwaltung.spec.ts` — was nur ein Browser sieht

**Files:** Create `e2e/lagerbuch-verwaltung.spec.ts`.

**Interfaces:**
- Consumes: `e2e/helpers/lagerbuch.ts` (Teil 3, T59) — `LAGERBUCH_HOST`, `LAGERBUCH_ADMIN_GRUPPE`,
  `lagerbuchUrl(pfad)`, `fremdUrl(pfad)`; `e2e/seed-lagerbuch.ts` (T59).
- Produces: die **vier** Playwright-Zusicherungen, die §6.3.2 und §6.3.4 verlangen und deren Subjekt
  ausschließlich in diesem Plan entsteht.
- ⚠️ **Teil 6 schreibt die ÜBRIGEN E2E-Dateien** (Festlegung H14): `etiketten.spec.ts` samt
  Druck-Emulation und dem Riegel-Abruf aus §6.1.3, sowie die umgeschriebenen Alt-Specs. **Es
  entsteht keine zweite Navigations-Spec.**

**Warum diese vier Aussagen kein Vitest halten kann:**

| Aussage | Warum jsdom sie nicht sieht |
|---|---|
| `aria-current` unter dem Proxy-Rewrite | `SuiteNav.test.tsx:48` **mockt** `next/navigation` und sagt es über sich selbst (`:263-266`). Die vorhandene Messung steht gegen Next **16.2.6**, die Suite fährt **16.2.11**, und sie entstand per `curl` **ohne** Reverse-Proxy |
| `documentElement.scrollWidth === clientWidth` bei 1280×720 | jsdom hat kein Layout. Bei 390px sind die richtige und die kaputte Fassung **nicht zu unterscheiden**, weil `.modulnav` dort `display: none` trägt |
| Tastaturbedienung des `overflow-x`-Containers | Ein Quelltext-Scan sieht keinen Fokus |
| Die Leiste ist bei 390px unsichtbar und die Ziele stehen im Drawer | jsdom wertet Media Queries **nicht** aus — ein Vitest darauf geht **immer** durch |

**Abnahme, nicht TDD — und deshalb OHNE Rot-Schritt.** Die vier Subjekte dieser Datei stehen seit
**T102** (`_lib/nav.ts`, fünfzehn Ziele ohne `/`-Eintrag) und **T105** (`.modulnav` mit
`overflow-x: auto`), also seit rund vierzig Tasks. Ein E2E, der nach T149 geschrieben wird, ist von
Anfang an **grün**, und ein Schritt „er muss FEHLSCHLAGEN" wäre hier eine falsche Behauptung im
Plan. Was der Task stattdessen schuldet, sind die **Mutationen, die er fängt:**

| Mutation | Welche Zusicherung rot wird |
|---|---|
| `overflow-x: auto` aus `.modulnav` entfernen (T105 zurücknehmen) | „fünfzehn Einträge schieben die Seite bei 1280×720 NICHT seitwärts" — `scrollWidth > clientWidth` |
| `scrollbar-width: thin` entfernen | keine — **und das ist der Befund**: diese Zeile besitzt allein `shell-css.test.ts` (T105). Der Browser-Lauf sieht sie nicht |
| einen `/`-Eintrag in `LAGERBUCH_NAV` deklarieren (T102 zurücknehmen) | „markiert auf einer Detailseite GAR NICHTS" — `toHaveCount(0)` wird 1 |
| `aktiverEintrag` um einen Abschnittstreffer erweitern (§6.3.3, verworfen) | dieselbe Zusicherung — sie ist genau der Wächter dieses verworfenen Vorschlags |
| einen sechzehnten Navigationseintrag hinzufügen | `toHaveCount(15)` — die Zahl steht bewusst hart da |
| `display: none` unterhalb 768px entfernen | „bei 390px ist die Leiste unsichtbar" — `toBeHidden()` |

⚠️ **Zwei dieser Mutationen fängt KEIN Vitest**, und das ist der ganze Grund für die Datei: jsdom hat
kein Layout und wertet Media Queries nicht aus. Ein Vitest auf „bei 390px unsichtbar" ginge **immer**
durch.

- [ ] **Schritt 1: Den E2E schreiben**

```ts
import { test, expect } from "@playwright/test";
import { LAGERBUCH_ADMIN_GRUPPE, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DIE VIER ZUSICHERUNGEN, DIE NUR EIN BROWSER HALTEN KANN (§6.3.2, §6.3.4).
 *
 * Vorbild ist `e2e/shell-mobil.spec.ts:288-324`. Der Zustand wird im Test
 * SELBST hergestellt (Anmeldung mit der Lagerbuch-Gruppe) — ein Test, der
 * seinen Zustand vom Seed erbt, ist entweder allein gruen oder in der Suite
 * gruen, nie beides (docs/design/README.md).
 */
test.describe("lagerbuch — Modulnavigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(lagerbuchUrl("/api/dev-login?gruppen=" + LAGERBUCH_ADMIN_GRUPPE));
  });

  test("markiert genau einen Eintrag auf /verwaltung/artikel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    const nav = page.getByTestId("modulnav");
    const markiert = nav.locator("a[aria-current]");
    await expect(markiert).toHaveCount(1);
    await expect(markiert).toHaveText("Artikel");
  });

  test("markiert die Übersicht auf /verwaltung", async ({ page }) => {
    /*
     * ⚠️ Diese Zusicherung ist gegen die Pfadform UNEMPFINDLICH — weil der
     * href `/verwaltung` und nicht `/` lautet, ist
     * `"/m/lagerbuch/verwaltung".endsWith("/verwaltung")` ebenfalls wahr. Das
     * ist ein Gewinn an Robustheit, aber sie taugt deshalb NICHT als
     * Fruehwarnung fuer eine kuenftige Next-Version, die den inneren Pfad
     * liefert (§6.3.4, Fall 2).
     */
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung"));
    const markiert = page.getByTestId("modulnav").locator("a[aria-current]");
    await expect(markiert).toHaveCount(1);
    await expect(markiert).toHaveText("Übersicht");
  });

  test("markiert auf einer Detailseite GAR NICHTS", async ({ page }) => {
    /*
     * DIE ZUSICHERUNG, DIE DEN ANGENOMMENEN VERLUST FESTHAELT (§6.3.3, §6.3.4
     * Fall 3). Faellt sie eines Tages rot, hat jemand einen `/`-Eintrag
     * deklariert oder `aktiverEintrag` geaendert — beides soll auffallen.
     * Geprueft wird `aria-current` OHNE Wert: `="page"` allein liesze die
     * Abschnitts-Markierung `="true"` durchgehen.
     */
    await page.setViewportSize({ width: 1280, height: 720 });
    const geraet = page.locator("table a").first();
    await page.goto(lagerbuchUrl("/verwaltung/geraete"));
    await geraet.click();
    await expect(page).toHaveURL(/\/verwaltung\/geraete\/[^/]+$/);
    await expect(page.getByTestId("modulnav").locator("a[aria-current]")).toHaveCount(0);
    // Und der Rueckweg ist die Brotkrume — nicht die Markierung.
    await expect(page.getByRole("navigation", { name: "Brotkrume" })).toBeVisible();
  });

  test("fünfzehn Einträge schieben die Seite bei 1280×720 NICHT seitwärts", async ({ page }) => {
    /*
     * DER EIGENTLICHE BEWEIS DER `.modulnav`-REPARATUR (§6.3.2, T105).
     * Fuenfzehn Links mit zusammen 127 Zeichen liegen ueberschlaegig bei
     * 1.300-1.400px; ohne `overflow-x: auto` scrollt `documentElement`
     * waagerecht — nicht die Leiste, die GANZE SEITE.
     *
     * Bei 390px sind die richtige und die kaputte Fassung nicht zu
     * unterscheiden (`.modulnav` steht dort auf `display: none`) — deshalb
     * gehoert diese Aussage dem 1280er-Lauf.
     */
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    const nav = page.getByTestId("modulnav");
    await expect(nav).toBeVisible();
    await expect(nav.locator("a")).toHaveCount(15);
    const masze = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(masze.scroll).toBe(masze.client);
  });

  test("der Container scrollt beim Tabben zum fokussierten Link", async ({ page }) => {
    // Ein `overflow-x`-Container mit fokussierbaren Kindern scrollt von
    // selbst — die Zusicherung dazu ist ein Playwright-Schritt, kein
    // Quelltext-Scan (§6.3.2, Punkt 1).
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung"));
    const nav = page.getByTestId("modulnav");
    const letzter = nav.getByRole("link", { name: "Import" });
    await letzter.focus();
    await expect(letzter).toBeFocused();
    await expect(await nav.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  });

  test("bei 390px ist die Leiste unsichtbar und die Ziele stehen im Drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    await expect(page.getByTestId("modulnav")).toBeHidden();
    await page.getByTestId("menue-knopf").click();
    await expect(page.getByRole("link", { name: "Journal" })).toBeVisible();
  });
});
```

- [ ] **Schritt 2: Laufen lassen — er muss von Anfang an GRÜN sein**

```bash
pnpm exec playwright test e2e/lagerbuch-verwaltung.spec.ts
```

Erwartet: **6 passed.** Ist auch nur eine Zusicherung rot, ist **nicht der Test kaputt**, sondern
T102 oder T105 unvollständig eingecheckt — die Fehlermeldung nennt, welche.

- [ ] **Schritt 3: Die Mutationsprobe fahren — einmal, von Hand**

Ein grüner Test, der nie rot war, beweist nichts. Deshalb einmal die tragende Mutation setzen:

```bash
sed -i.bak 's/overflow-x: auto;//' src/core/shell/shell.module.css
pnpm exec playwright test e2e/lagerbuch-verwaltung.spec.ts   # MUSS rot sein:
#   „fünfzehn Einträge schieben die Seite bei 1280×720 NICHT seitwärts"
mv src/core/shell/shell.module.css.bak src/core/shell/shell.module.css
pnpm exec playwright test e2e/lagerbuch-verwaltung.spec.ts   # wieder gruen
```

⚠️ **Bei 390px sind die richtige und die kaputte Fassung NICHT zu unterscheiden** (`.modulnav` steht
dort auf `display: none`). Wer die Probe im Mobilviewport fährt, sieht Grün und schließt daraus das
Falsche — der 1280er-Lauf ist der Beweis.

- [ ] **Schritt 4: Commit**

```bash
rtk git add e2e/lagerbuch-verwaltung.spec.ts
rtk git commit -m "test(lagerbuch): die vier Zusicherungen, die nur ein Browser haelt

aria-current auf drei Faellen (Artikel, Uebersicht, Detailseite ohne
Markierung), scrollWidth bei 1280x720 gegen die .modulnav-Reparatur,
Tastatur-Scroll des Containers, und die Drawer-Fassung bei 390px.

Vitest ist hier strukturell blind: SuiteNav.test.tsx mockt next/navigation und
sagt es ueber sich selbst; jsdom hat kein Layout und wertet Media Queries
nicht aus. Bei 390px sind die richtige und die kaputte .modulnav nicht zu
unterscheiden — der 1280er-Lauf ist der Beweis."
```

---

### Task 151: Die Abnahme von Teil 5 — Abrufe, Modi, die abgehakte Action-Tabelle

**Files:** keine — nur Ausführung und Protokoll.

**Interfaces:** Consumes alles aus T100–T150. Produces die Aussage „§6 ist eingelöst".

**Abnahme, nicht TDD.** Was dieser Task fängt, sind **sechs Mutationen, gegen die kein einzelner
Task-Test etwas ausrichtet, weil sie ZWISCHEN den Dateien liegen:**

| Mutation | Warum kein Task-Test sie fängt |
|---|---|
| Ein antd-Compound in einer `page.tsx` (`Typography.Title` statt `<h1>`) | `typecheck` sieht ein gültiges Namespace-Member, `build` rendert nicht, Vitest rendert keine Server Component |
| Ein `@ant-design/icons`-Import, der über einen **Alias** eingezogen wird | `_ui/ikonen.test.ts` scannt den nackten Spezifizierer; ein Tiefen- oder Alias-Import entgeht ihm (§6.5.5) |
| Ein fehlender `.modul`-Träger | Der CSS-Scan in T100 prüft die **Deklaration**, nicht ihren Träger — und `transparent` ist gültiges CSS |
| Eine Kaskadenkollision zwischen Modul-CSS und antd-CSS | Ein Quelltext-Scan kennt Reihenfolge und Fremd-Stylesheets **nicht** (Falle 5) |
| Eine Action ohne Weg in der Oberfläche | Der Guard-Scan prüft den **Riegel**, nicht den **Aufrufer** |
| Der Druck-Riegel aus §6.1.3 | Die Kopplung liegt **zwischen zwei Layouts**; ein Quelltext-Scan sieht sie nicht |

- [ ] **Schritt 1: Alle Gates ein letztes Mal**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build && pnpm exec playwright test
```

- [ ] **Schritt 2: Jede der 23 Routen einmal abrufen — der einzige Weg, Falle 1/6/7 zu sehen**

```bash
pnpm dev & sleep 8
COOKIE="$(pnpm exec tsx scripts/devlogin-cookie.ts lagerbuch_nutzer)"
for p in /verwaltung /verwaltung/artikel /verwaltung/verfall /verwaltung/fahrzeuge \
         /verwaltung/vorlagen /verwaltung/checks /verwaltung/bz /verwaltung/bz/scan \
         /verwaltung/sauerstoff /verwaltung/geraete /verwaltung/geraete/scan \
         /verwaltung/bestellung /verwaltung/inventur /verwaltung/journal \
         /verwaltung/tokens /verwaltung/import; do
  printf "%-34s %s\n" "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE" -H 'Host: lagerbuch.localtest.me' \
       "http://localhost:3000$p")"
done
```

Erwartet: **16×200**. Die sieben Detailrouten (`fahrzeuge/[id]`, `vorlagen/[id]`, `checks/[id]`,
`bz/[id]`, `bz/[id]/kontrolle`, `sauerstoff/[id]`, `geraete/[id]`) werden mit den Kennungen aus dem
E2E-Seed abgerufen — zusammen **23**.
⚠️ **Ein 500 hier ist fast nie ein Tippfehler**, sondern eine der drei Fallen: Compound-Zugriff in
einer Server Component (Falle 1), ein Icon-Import in der RSC-Ebene (Falle 7) oder ein **WERT** aus
einem `"use client"`-Modul (Falle 6). Die Fehlermeldung nennt die Datei.

- [ ] **Schritt 3: Der Kaskaden-Abruf bei 1280px**

```bash
pnpm exec playwright test e2e/lagerbuch-verwaltung.spec.ts --grep "seitwärts"
```

- [ ] **Schritt 4: Beide Modi auf drei Seiten — was KEIN Gate der Suite rendert**

Mit dem Theme-Umschalter der Kopfzeile je einmal hell und dunkel aufrufen (§6.6.7, §12.4):

| Seite | Worauf zu achten ist |
|---|---|
| `/verwaltung/artikel` | Die `Table`-Fläche, **die Chips** (Farbe da? oder nur Polster und Rundung?), die Plakette in der Verfallsspalte |
| `/verwaltung/verfall` | **Die Plakette** — im Dunkelmodus keine weiße Scheibe; die Ringfarbe kommt aus `--lb-ampel-*` |
| `/verwaltung` | **Die KPI-Kanten** — sind sie da? Eine fehlende Kante ist der Beweis für einen fehlenden `.modul`-Träger |

⚠️ **Ein farbloser Chip bei HTTP 200 ist der Befund, auf den es hier ankommt.** Er bedeutet, dass
`className={s.modul}` fehlt oder nicht greift — und **der Scan aus T100 bleibt dabei grün**, weil er
die Deklaration prüft und nicht ihren Träger.

- [ ] **Schritt 5: Der Druck-Riegel aus §6.1.3 — die einzige Zusicherung über die Layout-Grenze**

⚠️ **Fällt `requireLagerbuchAdmin` aus `verwaltung/(druck)/layout.tsx`, sind die gedruckten
Zugangs-Codes im Klartext öffentlich.** Solange Teil 6 die Gruppe `(druck)` noch nicht gebaut hat,
lautet die Prüfung: **beide Aufrufe antworten gleich** — und zwar mit **404**, nicht 403.

```bash
# ohne Sitzung
curl -s -o /dev/null -w "artikel   %{http_code}\n" \
  -H 'Host: lagerbuch.localtest.me' http://localhost:3000/verwaltung/artikel
curl -s -o /dev/null -w "etiketten %{http_code}\n" \
  -H 'Host: lagerbuch.localtest.me' http://localhost:3000/verwaltung/etiketten
kill %1
```

Erwartet **jetzt**: `404` und `404` (die Etikettenroute existiert noch nicht — dieselbe Antwort aus
einem anderen Grund). Erwartet **nach Teil 6**: weiterhin `404` und `404`, dann aus **demselben**
Grund. **Teil 6 wiederholt diesen Schritt**; er steht hier, damit die Zahl von heute protokolliert
ist.

- [ ] **Schritt 6: Zwei repo-weite Scans, die zwischen den Dateien liegen**

```bash
# 1. Kein `Alert type="error"` im ganzen Modul (§6.6.5, §11.6)
rtk proxy grep -rn 'type="error"' src/app/m/lagerbuch/ | grep -v '\.test\.' || echo "OK: keins"
# 2. Kein `size="large"` (Falle 4) und kein `e.message` unter verwaltung/ (Falle 66)
rtk proxy grep -rn 'size="large"' src/app/m/lagerbuch/ || echo "OK: keins"
rtk proxy grep -rn '\.message' "src/app/m/lagerbuch/verwaltung/" | grep -v '\.test\.' || echo "OK: keins"
# 3. Die Zaehlung dieses Plans: 15 Action-Dateien, 43 Deklarationen
ls src/app/m/lagerbuch/_actions/*.ts | grep -v '\.test\.' | wc -l    # erwartet 15 (+ guards.test.ts)
rtk proxy grep -c "^export async function" src/app/m/lagerbuch/_actions/*.ts | \
  grep -v test | awk -F: '{s+=$2} END {print s}'                      # erwartet 43
```

⚠️ **Zum Zeitpunkt dieses Laufs liegen NUR die Dateien dieses Plans da.** Teil 4 bringt
`_actions/check.ts`, `_actions/gate.ts` und `_actions/sitzung.ts` mit 4 weiteren Deklarationen nach;
erst danach steht die Modulzahl **47 in 18 Dateien** (Teil 6 §4.1). Wer hier 47 erwartet, hakt gegen
einen Zustand ab, den dieser Plan gar nicht herstellen kann.

⚠️ **Die 43 schließen `export type` ABSICHTLICH aus.** `_actions/detail.ts` exportiert drei Typen
neben einer Action; der Guard-Scan aus Teil 2 (T20, Auflage 1) verwirft sie ausdrücklich — **ein
Scan, der sie mitzählt, wird auf einer korrekten Datei rot.** Wer das Zählmuster hier „repariert",
damit es auch `export type` trifft, bricht die Zählung in Teil 6. Ebenso wenig darf über ein `Set`
gezählt werden: die drei Namensdubletten (`geraetSpeichern`, `setGeraetAktiv`, `geraetZuBarcode` in
`bz.ts` **und** `geraete.ts`) machten daraus **40**.

- [ ] **Schritt 7: Die Tabelle aus §6 abhaken — Action → Seite → Bedienelement**

§6.12, Frage 1 verlangt es wörtlich: „die Liste wird **abgehakt, nicht behauptet**." Gehe die
**43 Zeilen** aus §6 dieses Plans durch und klicke jedes Bedienelement **einmal** im laufenden
Server an. ⚠️ **Zwei Zeilen sind die benannten Kandidaten fürs Vergessen** und werden zuerst geprüft:

- **Zeile 14 — `sollPositionWiederherstellen`:** sichtbar **nur** an einer Grabstein-Zeile. Erzeuge
  einen: Fahrzeug mit Vorlage verknüpfen → eine Vorlagen-Position entfernen → die Zeile muss mit
  „zurücksetzen" dastehen.
- **Zeile 39 — `deaktiviereElement`:** sichtbar **nur**, wenn `pruefeLoeschbar` „nicht löschbar"
  meldet. Erzeuge das: Artikel mit einer Buchung → Löschen versuchen → der Dialog muss den Grund
  nennen **und** „Deaktivieren" anbieten.
- **Zeile 6 — `bucheEntnahmeHelfer`:** ⚠️ Ihr einziger Aufrufer liegt in **Teil 4**. Sie wird hier
  **nicht** abgehakt, sondern in der Abschlusstabelle als offene Kopplung geführt.

- [ ] **Schritt 8: Das Ergebnis festhalten**

```bash
git commit --allow-empty -m "chore(lagerbuch): §6 ist eingeloest — Teil 5 abgenommen

23 Arbeitsseiten abgerufen, alle 200. Ein 500 waere hier fast nie ein
Tippfehler gewesen, sondern Falle 1, 6 oder 7 — und kein Gate der Suite sieht
sie.

Beide Modi auf /verwaltung/artikel, /verwaltung/verfall und /verwaltung
durchgesehen: Chips tragen Farbe, die Plakette ist im Dunkelmodus keine weisze
Scheibe, die KPI-Kanten sind da. Ein farbloser Chip bei HTTP 200 waere der
Beweis fuer einen fehlenden .modul-Traeger gewesen — und der CSS-Scan bleibt
dabei gruen.

documentElement.scrollWidth === clientWidth bei 1280x720 mit 15
Navigationseintraegen.

Kein Alert type=error, kein size=large, kein e.message unter verwaltung/.
15 Action-Dateien, 43 Deklarationen, alle bewacht, null Ausnahmen (42x
requireLagerbuchAdmin, 1x requireHelferSchreibend fuer bucheEntnahmeHelfer).
Teil 4 bringt die restlichen 4 nach; erst dann steht die Modulzahl 47/18.

Die Tabelle Action -> Seite -> Bedienelement ist abgehakt, nicht behauptet:
43 Zeilen, darunter die beiden benannten Kandidaten fuers Vergessen
(sollPositionWiederherstellen an einer Grabstein-Zeile, deaktiviereElement als
zweiter Ausgang des Loeschdialogs). bucheEntnahmeHelfer bleibt offen — ihr
einziger Aufrufer liegt in Teil 4.

Der Druck-Riegel aus §6.1.3 ist mit 404/404 protokolliert; Teil 6 wiederholt
den Abruf, dann aus demselben Grund."
```

---

### Task 152: **Abnahme** — Die Verschärfung des Ampel-Scans — nachgelagert, wenn Teil 4 steht

**Files:** Modify `src/app/m/lagerbuch/_lib/ampel.test.ts`.

**Interfaces:** Consumes `_ui/helfer.module.css` (**Teil 4**, §7.7.4). Produces die Verschärfung aus
Festlegung **H5**.

⚠️ **Dieser Task läuft ERST, wenn Teil 4 eingecheckt ist** — er ist der einzige Task dieses Plans mit
einer Vorbedingung außerhalb. **Er ist keine Nacharbeit, sondern der benannte Einlöser** der
Eigenschaftsform aus T100: ohne ihn bliebe der Scan für immer tolerant, und `helfer.module.css`
könnte eine abweichende Ampelpalette tragen, ohne dass etwas rot wird.

- [ ] **Schritt 1: Prüfen, ob Teil 4 die Datei angelegt hat**

```bash
ls src/app/m/lagerbuch/_ui/helfer.module.css
```

Existiert sie **nicht**, endet der Task hier — mit einer Notiz im Übergabeprotokoll, **nicht** mit
einer Abschaltung des Scans.

- [ ] **Schritt 2: Die Toleranz entfernen**

In `_lib/ampel.test.ts` wird `CSS_DATEIEN[1].pflicht` von `false` auf `true` gesetzt und die vier
`if (!datei.pflicht && !existsSync(datei.pfad)) return;`-Zeilen entfallen. Dazu ein neuer Testfall:

```ts
  it("beide Modul-CSS-Dateien existieren — die Toleranz ist aufgehoben", () => {
    /*
     * DER EINLOESER DER EIGENSCHAFTSFORM (Plan-Festlegung H5). Bis Teil 4
     * `helfer.module.css` anlegte, tolerierte der Scan ihr Fehlen — sonst
     * waere er am ersten Tag rot gewesen und abgeschaltet statt repariert
     * worden. Ab jetzt verlangt er BEIDE Dateien, und eine abweichende
     * Ampelpalette im Helfer-CSS faellt sofort auf.
     */
    for (const datei of CSS_DATEIEN) {
      expect(existsSync(datei.pfad), `${datei.pfad} fehlt`).toBe(true);
    }
  });
```

- [ ] **Schritt 3: Die Gegenprobe fahren und committen**

```bash
sed -i.bak 's/--lb-ampel-gelb-text: #8a5200/--lb-ampel-gelb-text: #8a5201/' \
  src/app/m/lagerbuch/_ui/helfer.module.css
pnpm vitest run src/app/m/lagerbuch/_lib/ampel.test.ts   # MUSS rot sein
mv src/app/m/lagerbuch/_ui/helfer.module.css.bak src/app/m/lagerbuch/_ui/helfer.module.css
pnpm vitest run src/app/m/lagerbuch/_lib/ampel.test.ts   # wieder gruen

rtk git add src/app/m/lagerbuch/_lib/ampel.test.ts
rtk git commit -m "test(lagerbuch): der Ampel-Scan verlangt jetzt BEIDE Modul-CSS-Dateien

Einloeser der Eigenschaftsform aus H5: bis Teil 4 helfer.module.css anlegte,
tolerierte der Scan ihr Fehlen — sonst waere er am ersten Tag rot gewesen und
abgeschaltet statt repariert worden.

Gegenprobe gefahren: ein geaenderter Hexwert im Helfer-CSS faerbt den Test
rot. Eine abweichende Ampelpalette auf dem Helfer-Weg faellt damit sofort auf,
statt still zu driften."
```

---

## 9. Abschluss-Abnahme von Teil 5

Bevor Teil 6 beginnt, muss **alles** hiervon zutreffen:

- [ ] Alle **53** Tasks (T100–T152) sind eingecheckt, jeder mit eigenem Commit; **T105
      (`core/shell/shell.module.css`) mit einem eigenen, modulfreien Commit.**
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm vitest run`, `pnpm build` und
      `pnpm exec playwright test` sind grün.
- [ ] **Alle 23 Arbeitsseiten** antworten mit **200** — der einzige Weg, Falle 1, 6 und 7 zu sehen.
- [ ] **Beide Modi** sind auf `/verwaltung/artikel`, `/verwaltung/verfall` und `/verwaltung`
      durchgesehen: Chips tragen Farbe, die Plakette ist im Dunkelmodus keine weiße Scheibe, die
      KPI-Kanten sind da.
- [ ] `documentElement.scrollWidth === clientWidth` bei **1280×720** mit fünfzehn
      Navigationseinträgen.
- [ ] `aria-current` kommt auf einer Detailseite **null-mal** vor — der angenommene Verlust ist
      festgehalten.
- [ ] `_lib/ampel.test.ts` rechnet Monotonie und Kontrast nach, hält „Ampel-Rot ≠ Suite-Rot" fest und
      bindet TS und CSS aneinander; **die Gegenprobe (ein geänderter Hexwert → roter Test) ist einmal
      gefahren worden.**
- [ ] `_ui/ikonen.test.ts` findet **36** Namen, keinen `@ant-design/icons`- und keinen
      `lucide-react`-Import unter `m/lagerbuch/`, und keinen benutzten Namen ohne `PFADE`-Eintrag;
      **die Gegenprobe ist gefahren.**
- [ ] `_actions/guards.test.ts` (Teil 2) ist grün: **43 Deklarationen in 15 Dateien, alle bewacht,
      null Ausnahmen.** ⚠️ Der Scan aus Teil 2 steht in der **Eigenschaftsform** und zählt zu diesem
      Zeitpunkt gar nicht; wer abhakt, zählt selbst nach — je Datei je Deklaration, nie über ein
      `Set` (das ergäbe 40) und ohne `export type` (das ergäbe 46).
- [ ] Kein `Alert type="error"`, kein `size="large"`, kein `e.message` unter `verwaltung/`.
- [ ] **Die Tabelle Action → Seite → Bedienelement ist abgehakt**, nicht behauptet — samt der beiden
      benannten Kandidaten fürs Vergessen.
- [ ] Die zwölf Ersatzanker aus §7 dieses Plans **werden von einer Datei dieses Plans tatsächlich
      gesetzt** (nicht bloß erwähnt).

---

## 10. Was dieser Teil ausdrücklich NICHT liefert und wo es liegt

| Fehlt | Wo es entsteht |
|---|---|
| `verwaltung/(druck)/layout.tsx`, `(druck)/druck.css`, `(druck)/etiketten/**`, `_ui/DruckRahmen.tsx`, `_db/etiketten.ts`, `_lib/etikettMasse.ts` | **Teil 6** (§8.4, §6.10) — ⚠️ **`DruckRahmen.tsx` MUSS `_ui/verwaltung.module.css` importieren und `className={s.modul}` setzen** (§6.1.2). Ohne den Träger löst dort jedes `var(--lb-…)` ins Leere auf, fällt auf `transparent` zurück und ist **gültiges CSS**: HTTP 200, kein Log, und der CSS-Scan aus T100 bleibt **grün**. ⚠️ **Und `(druck)/layout.tsx` ruft `requireLagerbuchHost` UND `requireLagerbuchAdmin`** — fällt der zweite weg, sind die gedruckten Zugangs-Codes **im Klartext öffentlich** (F3 aus Teil 1, §6.1.3). Route-Group-Grenzen sind **keine** Sicherheitsgrenzen |
| `_ui/BarcodeScanner.tsx` und `_lib/barcode.ts` | **Teil 4** (§7.6). ⚠️ **T138 (beide Scan-Seiten) ist bis dahin nicht lauffähig** — die einzige Reihenfolgebindung dieses Plans nach außen. Der Vertrag steht in T138s `Consumes` |
| `_ui/helfer.module.css` samt den acht `--lb-ampel-*`-Werten auf `.rahmen` | **Teil 4** (§7.7.4) — ⚠️ **die Werte müssen zeichengleich zu `_lib/ampel.ts` sein**; **T152** dieses Plans hebt danach die Toleranz des Scans auf (H5) |
| Der `usePathname`-Scan über den ganzen Modulbaum | **Teil 4** (§7.8.2, Erweiterung von `_lib/bauform.test.ts`). Dieser Plan hält die Einzigkeit schon jetzt als **Testfall** in `_ui/filter.test.tsx` fest — **es entsteht keine zweite Scan-Datei** |
| `_lib/bestandExport.ts` (`bestandExportZeilen`, `bestandExportDateiname`), `bestellvorschlag.csv`, die Zwischenablage | **Teil 6** (§9.2–§9.4). ⚠️ **Drei Knöpfe sind bis dahin `disabled` mit erklärendem `Tooltip`** — der Excel-Export auf `/verwaltung/artikel` (T129) und CSV + Zwischenablage auf `/verwaltung/bestellung` (T145). Das ist der **einzige** benannte Vorgriff dieses Plans; Teil 6 löst ihn ein, indem es `disabled` entfernt und die Funktion anbindet. ⚠️ **§6.9.5, zweitens gilt dabei weiter:** der Export liest **dieselbe abgeleitete Liste** wie die Tabelle |
| §8.3 (Alphabet, Länge, Kollision, Ablauf, Einlösung der Tokens) und **Entscheidung 8-F** | **Teil 6** — ⚠️ **erweitert `_lib/lesepfade/tokens.ts` und `_actions/tokens.ts` (T126), es entsteht keine zweite Datei** (H8). Streicht 8-F den Hard-Delete, entfällt auf `/verwaltung/tokens` der `LoeschButton`-Aufruf, **nicht** der Dialog |
| `_actions/check.ts` (`checkAbschluss`) | **Teil 4** (§7.9) — ⚠️ **seine sechs `revalidatePath` tragen Verwaltungspfade** und stehen deshalb in §3 dieses Plans mit: `/m/lagerbuch/helfer/check` · `…/verwaltung/checks` · `…/verwaltung` · `…/verwaltung/sauerstoff` · `…/verwaltung/verfall` · `…/verwaltung/fahrzeuge`. Fällt einer weg, zeigt eine Verwaltungsseite nach einem Check **veraltete Zahlen**, ohne dass etwas kaputt aussieht |
| `O2FlascheZeile.herkunft: "check" \| "manuell" \| null` in `_lib/lesepfade/o2.ts` | **Teil 3, T52.** ⚠️ **§6.15 Auflage 15 verlangt die Herkunft der jüngsten Messung auf `/verwaltung/sauerstoff` (T141), und der Übersichtspfad führt sie heute nicht** — `ausCheck` steht nur am **Detail**pfad (`O2MessungZeile`). Abgeleitet **wie `ausCheck`**: am `quelleTyp`, nie am Kommentartext. ⚠️ **`null` heißt „keine Messung" und darf NICHT auf `"manuell"` zurückfallen** — das behauptete eine Handeingabe, die nie stattgefunden hat, also genau den Unterschied, den Auflage 15 sichtbar machen soll. **Bis dahin ist T141 nicht typprüfbar**; T141s Schritt 7 nennt beide Wege |
| Der einzige Aufrufer von `bucheEntnahmeHelfer` (`_ui/Entnahme.tsx`, Spec §2.1 Zeile 358) | **Teil 4** (§7.2). Die Action selbst liegt in **T114** (H7); Teil 4 legt **keine zweite `_actions/buchung.ts` an** |
| Die **Zählung** im Guard-Scan (47 = 44 + 3, 18 Dateien, 19 Verzeichniseinträge) | **Teil 6** (Teil 1, F4). **Dieser Plan steuert 15 Dateien mit 43 Deklarationen bei**, alle bewacht, **null Ausnahmen**; **Teil 4 steuert 3 Dateien mit 4 Deklarationen bei** (1 bewacht, 3 Ausnahmen) — zusammen 18 / 47 / 44 / 3 (Teil 6 §4.1, §4.2). ⚠️ Drei Namensdubletten (`geraetSpeichern`, `setGeraetAktiv`, `geraetZuBarcode` in `bz.ts` **und** `geraete.ts`) — je Datei je Deklaration zählen, nie über ein `Set`; und `_actions/detail.ts` exportiert **drei Typen**, die keine Actions sind |
| `etiketten.spec.ts` mit `page.emulateMedia({ media: "print" })`, der `@media print`-Scan über **alle** `.css` des Moduls, und die umgeschriebenen Alt-Specs | **Teil 6** (§6.10.2, §8.5, §12.5). ⚠️ **Es bleibt bei EINEM Druck-Scan** (`etiketten/druck.test.ts`) — dieser Plan schreibt keinen zweiten. ⚠️ **Der Glob muss `(druck)/druck.css` einschließen**: ein Scan über `_ui/*.module.css` ließe ausgerechnet die Datei aus, die die Druckregeln trägt, und wäre **grün und blind** |
| `error.tsx` und die 40 Fehlerzustände aus §11.5, soweit sie nicht auf einer Verwaltungsseite liegen | **Teil 6** (§11) |
| Der Zustand von `/g/<code>` bei unbekanntem Barcode (HTTP 200 mit gestalteter Antwort) | **Teil 4** (§8.1 8-C2, §11.3). §6 stellt nur die Bausteine: `_ui/VerwaltungsRahmen.tsx` (T111), `_ui/ikonen.tsx` (T101), `_ui/Chip.tsx` (T106). ⚠️ **`g/[code]/page.tsx` ist der ZWEITE Importeur des Rahmens** und mountet ihn **ohne** `nav` |
| `aktiverEintrag` um einen Abschnittstreffer erweitern | **Nirgends in diesem Vorhaben.** §6.3.3 hat es verworfen: eine `core`-Änderung mit Wirkung auf vier laufende Module für einen Kosmetikgewinn in einem. Bleibt als **eigene** Suite-Entscheidung mit eigenem Test möglich |
| `TZ=Europe/Berlin`, die Entfernung des Suite-Admin-Kurzschlusses in `core/groups.ts:104` | **Nirgends** — beide ausdrücklich außerhalb der Spec (§1.5) |

⚠️ **Warum die ersten drei Zeilen hier stehen und nicht nur in §1.** Sie sind Absprachen **zwischen
Plänen, die verschiedene Umsetzer in verschiedenen Sitzungen ausführen**. Über eine Plangrenze hinweg
hätte die Absprache sonst keinen Ort, an dem sie gelesen wird — und zwei davon sind **still**: ein
fehlender `.modul`-Träger liefert HTTP 200 mit farblosen Chips, und ein fehlender
`requireLagerbuchAdmin` im Druck-Layout liefert HTTP 200 mit gedruckten Zugangs-Codes.

---

## 11. Was §6 ausdrücklich NICHT entscheidet — und deshalb auch hier fehlt

§6.0 führt zehn Fragen, die zur Verwaltungsoberfläche gehören und **anderswo** entschieden sind. Sie
stehen hier verkürzt, damit niemand sie in diesem Plan sucht:

| Gegenstand | Entschieden in | Umgesetzt in |
|---|---|---|
| Dateibaum und Ablageorte | §2.1 | Teil 1 |
| Shell je Bereich, Route-Gruppen `(arbeit)`/`(druck)` | §2.9 | Teil 1 (F2), hier T111/T112, Teil 6 |
| Der Riegel selbst — Name, Datei, Rumpf | §2.5, §3.6 | **Teil 2** (`_lib/zugang.ts`). Dieser Plan entscheidet nur, **wer ihn wo ruft** |
| Mechanik des `nav`-Slots | §2.10 | `core` (vorhanden); der **Inhalt** ist T102 |
| URL-Parameter, `router.replace`, der `committedQ`-Tanz | §5.14.1–2 | hier T109/T135/T147, Namen **wörtlich** übernommen |
| Die Deckel 100/50/100 | §5.14.3 | **Teil 3** (`_lib/grenzen.ts`); hier nur ihre **Darstellung** |
| Ort und Namensgebung der Ampel | §5.17 | **Teil 3** (`ampelTon` in `_lib/format.ts`); die **Hexwerte** sind T100 |
| Der Helfer-Stepper, Tap-Maß 56, `noText`, `draft` | §7.7.3 | **Teil 4**. Was aus den **sechs Verwaltungs-Steppern** wird, ist hier: `InputNumber` (§6.4.6) |
| Ikonen-Bauform (Inline-SVG, kein `"use client"`) | §7.7.4 | hier T101 — **dieselbe Datei**, mit der vollständigen 36er-Union |
| Fehlerzustände, `error.tsx`, Rückgabewert statt Wurf | §11.2, §11.5–11.6 | `error.tsx` **Teil 6**; die Rückgabewerte hier (T113–T126) |
| Etikettengeometrie, `(druck)/druck.css`, QR aus `core/qr` | §8.4 | **Teil 6**. Hier nur: welche Regel den Framework-Wechsel **nicht** überlebt, und welches Bedienelement die Auswahl trägt (§6.10.2) |

**Und drei Dinge, die niemand entscheidet**, weil sie außerhalb der Spec liegen: `TZ=Europe/Berlin`
(suiteweiter Eingriff, §1.5), die Entfernung des Suite-Admin-Kurzschlusses in `core/groups.ts:104`
(eigene Suite-Entscheidung, §1.5), und die Frage, ob die drei Google-Schriften CD-gebunden sind
(**Betreiberfrage 29** — unbeantwortet; dieser Plan entscheidet mit der benannten Annahme **A-S1**,
§0).

---

## 12. Was dieser Teil dem Runbook schuldet

Zwei Zeilen aus §6.14, dazu die zwei sichtbaren Änderungen aus §0:

1. **„Verwaltungsoberfläche im Dunkelmodus einmal durchgesehen (drei Seiten)."** — T151, Schritt 4.
   Kein Gate der Suite rendert ein Modul im Dunkelmodus.
2. **„Etikettenbogen einmal auf echtem Papier gedruckt und gegen einen alten Ausdruck gehalten."** —
   **Teil 6** (§8.4, R30). Papiermaße prüft kein Test.
3. **Ankündigung an die Verwaltenden: die Ampelfarben ändern sich sichtbar** (Gelb dunkler, Rot ein
   anderer Ton). Die Begründung — Luminanz-Monotonie und ein **bestehender** AA-Verstoß — trägt die
   Entscheidung; sie gehört trotzdem in die Ankündigung und nicht in die Überraschung danach.
4. **Ankündigung: die Wortmarke „LAGERBUCH" verschwindet aus dem Verwaltungsbereich** und wird durch
   den Modultitel der Suite-Kopfzeile ersetzt. Sie bleibt dort, wo sie Wiedererkennung leistet — am
   Gate und im Helfer-Rahmen.
