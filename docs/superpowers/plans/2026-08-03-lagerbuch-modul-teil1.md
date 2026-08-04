# Modul `lagerbuch` — Implementierungsplan, Teil 1: Gerüst und Datenmodell

> **Für agentische Umsetzer:** PFLICHT-SUB-SKILL `superpowers:subagent-driven-development` (empfohlen)
> oder `superpowers:executing-plans`. Die Tasks sind auf parallele Ausführung geschnitten.
> **Innerhalb einer Wellenstufe dürfen alle genannten Tasks gleichzeitig laufen; über Stufengrenzen
> hinweg nicht.** Die Gates (§3) laufen am Ende **jeder Stufe**.
>
> Jeder Task ist TDD: erst der Test, dann der Code. **Ausgenommen sind die als „Abnahme" markierten
> Schritte** (T14): sie prüfen zusammengesetztes Verhalten, das zum Zeitpunkt ihrer Entstehung schon
> gebaut ist. Sie sind von Anfang an grün, und das ist **kein** Mangel.

**Spec:** `docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md` (11.036 Zeilen, verbindlich).
**Faktenbasis:** `docs/lagerbuch-portierung-analyse.md`. **Querschnitt:** `docs/design/README.md`.
**Projektregeln:** `CLAUDE.md`. **Alt-Anwendung:** `../lagerbuch` @ `ca04eb1` (eingefroren).
**Branch:** `feat/lagerbuch-modul` (aus `main` anzulegen — der Arbeitsbaum steht heute auf `main`).

**Ziel:** Das Modul `lagerbuch` bekommt sein Gerüst und sein vollständiges Datenmodell: Registry,
Registrierungs-Dreieck, Host-Riegel, Modul-Layout, 16 Drizzle-Tabellen, vier Migrationen mit zwei
Trigger-Paaren, der modul-eigene DB-Opener mit `lb_falte`, die Zeit- und Konstantenschicht — und die
Beweise, dass das Schema wirklich das ist, was §4 behauptet.

**Architektur:** `lagerbuch` wird das fünfte Modul der iuk-suite (`src/app/m/lagerbuch/`) mit einer
eigenen SQLite-Datei `lagerbuch.db`. Der Bestand ist **nie eine Spalte**, immer die Summe eines
append-only Buchungsjournals; die Unveränderlichkeit erzwingen SQLite-Trigger, nicht der Code. Zeit
ist ausschließlich UNIX-**Sekunden**, die Zeitzone `Europe/Berlin` steht als Modulkonstante im Code
und **nicht** in der Prozessumgebung.

**Tech Stack:** Next.js 16.2.11 (App Router/RSC) · Ant Design 6 · Drizzle 0.45 + better-sqlite3 12.11
· Auth.js v5 (Pocket ID) · Vitest 4 + Playwright · pnpm.

---

## Plan-Index — dieser Plan ist Teil 1 von sechs

Die Spec ist mit 845 KB / 11.036 Zeilen das **Vierfache** des bisher größten Vorbilds
(`2026-07-30-files-modul-design.md`, 207 KB → ein Plan mit 194 KB und 51 Tasks). Ein einziges
Plandokument in derselben Auflösung wäre ~800 KB groß, für den Task-Subagenten unbenutzbar und in
einer Sitzung nicht schreibbar. Der Schnitt folgt deshalb **dem Abhängigkeitsgraphen der Spec
selbst** (Anhang „Abhängigkeiten der Bauwege", Knoten A–H), nicht den Kapitelnummern.

| Teil | Datei | Deckt Knoten | Spec-Kapitel | Zustand |
|---|---|---|---|---|
| **1** | `…-teil1.md` (dieses Dokument) — Gerüst und Datenmodell | A + B, Außenarbeit 1 und 2 | §2, §4, §5.13.2 (`lb_falte`) | **geschrieben** |
| 2 | `…-teil2.md` — Zugang | C | §3 (beide Sitzungsarten, Rate-Limit, Rollen, Guard-Scan) | offen |
| 3 | `…-teil3.md` — Fachlogik und Grenzen | D, Außenarbeit 3 und 5 | §5, §10, §12.6 | offen |
| 4 | `…-teil4.md` — Helfer-Weg | E | §7 (inkl. `_ui/BarcodeScanner.tsx`, `_lib/barcode.ts`) | offen |
| 5 | `…-teil5.md` — Verwaltung | F, Außenarbeit 4 | §6 (24 Seiten, `.modulnav`-Reparatur) | offen |
| 6 | `…-teil6.md` — Artefakte, Ausgaben, Abnahme | G + H | §8, §9, §11, §12 | offen |

**Warum dieser Schnitt und kein anderer.** A steht vor allem; B und C sind laut Graph parallel baubar
und teilen nur A; D braucht beide; E, F und G teilen ausschließlich A–D. Teil 1 nimmt A+B, weil das
zusammen ein **lokal lauffähiges, abnehmbares** Zwischenergebnis ist: das Modul ist registriert, der
Container-Pfad stimmt, die Datenbank migriert, die Trigger beißen, und der Schema-Diff gegen die
Alt-Anwendung ist abschließend erklärt.

⚠️ **C und D bekommen bewusst getrennte Pläne, obwohl sie zusammen „das Fundament" sind.** Gemessen an
diesem Dokument entspricht 1 Spec-Zeile rund 77 Byte Plan (2.350 → 181 KB). C+D zusammen sind ~3.100
Spec-Zeilen und ergäben ~240 KB in einem Dokument — größer als das bisher größte Vorbild und wieder
an der Grenze der Schreibbarkeit. Getrennt liegen alle sechs Teile zwischen 90 und 180 KB.

⚠️ **Zwei Korrekturen an der naiven Lesart des Graphen, die für die späteren Teile gelten:**

1. **„H zuletzt" gilt für die Quelltext-Scans NICHT.** Der Anhang schreibt ausdrücklich, dass die
   Scans (§3.8.2, §7.12.2) **früh** gehören — sie sind billig und fangen genau die Bauform-Fehler,
   die später teuer werden. Der Guard-Scan `_actions/guards.test.ts` entsteht in **Teil 2**, nicht in
   Teil 6 (Einzelheiten in F4).
2. **Die 40 Fehlerzustände aus §11.5 sind kein Teil-6-Task.** Sie sind über E, F und G verteilt und
   entstehen mit ihnen. Teil 6 bündelt nur `error.tsx`, die Scans und die E2E-Dateien.

---

## 0. Vorbedingungen

**Für Teil 1 blockiert nichts.** Die neun offenen Fragen aus §15.1 hängen sämtlich an Kapiteln, die
dieser Plan nicht baut. Die Tabelle steht hier trotzdem vollständig, weil eine gekürzte Liste eine
stille Herabstufung wäre und weil zwei Einträge **vor Teil 2** fällig werden.

| # | Frage | Antwortet | Blockiert | Fällig vor |
|---|---|---|---|---|
| 4 | **Entscheidung 22 — Backup-Job** (`starteLagerbuchHintergrund()` oder `scripts/backup.sh`) | Betreiber | `_lib/boot.ts`, `startBackgroundWork()`-Eintrag | **Teil 2** (§10.7). Ohne Antwort gilt A31: (a), kein Eintrag, `LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` entfällt |
| 5 | Soll `tokens.scope_lagerort_id` je ein Riegel werden? (E14) | Betreiber | nichts — bis dahin: kein Riegel, Spalte bleibt | Teil 3 (§7.9.1) |
| 6 | Liegt im Lagerraum und in der Fahrzeughalle Netz an? (A26) | Betreiber | Service Worker vs. Access Point | Teil 3 (§7.10.1) |
| 7 | In welchem Programm wird `bestellvorschlag.csv` geöffnet? (A29) | Betreiber | nichts — die Entscheidung ist gegen beide Antworten robust | Teil 5 (§9.2) |
| 8 | Stehen Hersteller-EANs tatsächlich im Bestand? (A25) | Betreiber | nichts — robust gegen beide Antworten | Teil 3 (§7.6.2) |
| 9 | Soll eine abgelöste Domain dauerhaft als zweiter Host mitlaufen? (E16 b) | Betreiber | nichts — §2.6 erlaubt ≥ 2 Hosts | Spec 2 (Cutover) |
| — | ~~Der produktive Wert von `SUITE_ADMIN_GROUP_LAGERBUCH`~~ | ✅ **entschieden (D3, 04.08.2026): `lagerbuch_nutzer`** — die einzige lagerbuch-eigene Gruppe in Pocket ID. ⚠️ Der Alt-Vorgabewert `lagerbuch-admin` existiert dort **nicht** (Bindestrich statt Unterstrich); vor dem Cutover einmal echt einloggen | `playwright.config.ts`, `devLogin`-Gruppen | erledigt |
| — | **Der produktiv wirksame `TZ`-Wert der Alt-Instanz** (`lagerbuch/compose.yaml:7` setzt nur einen Default) | Betreiber | nichts im Bau — reine Cutover-Notiz | Spec 2 |

**Keine dieser Fragen darf durch eine erfundene Vorbelegung ersetzt werden.** Wo dieser Plan einen
Wert nennt, ist er entweder in der Spec belegt oder als Annahme markiert.

---

## 1. Festlegungen dieses Plans, die die Spec offen lässt

Sieben Punkte. Jeder ist eine Entscheidung dieses Plans, keine Ableitung — sie stehen hier
beisammen, damit ein späterer Teil sie nicht ein zweites Mal trifft.

**F1 — `_db/testdb.ts` wird eingeführt.** Die Spec listet unter `_db/` zehn Testdateien, die alle
gegen eine **echte, migrierte SQLite-Datei** laufen (§2.1 h, §5.19.2), nennt aber keinen gemeinsamen
Aufbau. `m/files/_db/` hat keinen — dort baut jede Testdatei ihre DB selbst. Bei zehn Dateien wären
das zehn Kopien derselben zwölf Zeilen, und jede Abweichung (ein vergessenes
`pragma("foreign_keys = ON")`) macht eine ganze Datei grün, ohne etwas zu prüfen. → **Dieser Plan
legt `src/app/m/lagerbuch/_db/testdb.ts` an** (T9), mit genau einem Export `migrierteTestDb()`.
`_db/migrations.test.ts` baut seine DB weiterhin **selbst**, weil es genau den Migrationslauf prüft
und ihn deshalb nicht hinter einem Helfer verstecken darf.

**F2 — Die Verwaltungs-Route-Groups heißen `(arbeit)` und `(druck)`, und es gibt kein
`verwaltung/layout.tsx`.** Das ist §6.15 Auflagen 1 und 2, eingelöst in §6.1.2 — aber die Naht läuft
zwischen **Teil 4 (F)** und **Teil 5 (G)**, und über eine Plangrenze hinweg hätte die Absprache sonst
keinen Ort. Sie steht deshalb hier, im ersten Plan, und gilt für alle folgenden. Route-Group-Grenzen
sind **keine** Sicherheitsgrenzen (§2.1 d).

**F3 — Beide Group-Layouts rufen `requireLagerbuchHost` **und** `requireLagerbuchAdmin`.** §6.1.3
und §8.4. Fällt der Riegel im `(druck)`-Layout weg, sind die gedruckten Zugangs-Codes im Klartext
öffentlich. Auch das kreuzt die Grenze Teil 4 / Teil 5 und gehört deshalb hierher.

**F4 — Es gibt genau EINE `_actions/guards.test.ts`, und sie entsteht früh.** §3.8.2 zählt über E und
F **zusammen**: 47 exportierte Actions in 18 Dateien — 44 bewachte plus drei benannte Ausnahmen
(`einloesenAmGate`, `erneuereSitzung`, `beenden`) —, und der Ordner hat 19 Einträge, weil
`guards.test.ts` sich selbst überspringt. Verbindliche Aufteilung über die Pläne:

- **Teil 2 legt die Datei an, in der EIGENSCHAFTSFORM**: „jede exportierte Action beginnt mit
  `requireLagerbuchAdmin()` oder `requireHelferSchreibend()` — oder steht auf der Ausnahmeliste".
  Der Scan toleriert ein leeres bzw. fehlendes `_actions/` und ist damit am ersten Tag grün. Genau so
  kann ab dem ersten Commit **keine** Action ungeschützt landen.
- **Teil 4 (E) und Teil 5 (F) füllen den Ordner** und schreiben **keine zweite Scan-Datei**.
- **Teil 6 nagelt die ZÄHLUNG als Abnahme fest** (47 = 44 + 3, 18 Dateien, 19 Verzeichniseinträge).
  ⚠️ Ein Scan, der `toHaveLength(44)` von Anfang an behauptet, ist am ersten Tag rot — deshalb die
  Trennung von Eigenschaft und Zählung.

⚠️ **Drei Fallstricke der Zählung, die die Spec ausschreibt und die Teil 6 kennen muss:** es gibt
**drei Namensdubletten** (`geraetSpeichern`, `setGeraetAktiv`, `geraetZuBarcode` stehen in `bz.ts`
**und** `geraete.ts`) — ein Scan, der die Exportnamen in ein `Set` legt, zählt **41** statt 44, also
wird je Datei je Deklaration gezählt; **`export type` ist keine Action** (`detail.ts` exportiert drei
Typen) und muss verworfen werden; und **drei der 44 lesen nur** (`getDetail`, `pruefeLoeschbar`,
`geraetZuBarcode`) und bleiben trotzdem Actions, weil ihr einziger Aufrufer eine Client-Insel ist.

**F5 — `_db/quelle.ts` gehört zu Teil 1, `_lib/konto.ts` zu Teil 2.** §4.13 nennt beide, aber
`merkeNutzer(db, viewer)` braucht den Typ `Viewer` aus `_lib/zugang.ts` und wird aus
`requireLagerbuchAdmin` gerufen — beides ist Knoten C. `quelleAufloeser` braucht nichts davon.
⚠️ §4.16 Punkt 4 weist die `merkeNutzer`-Gegenprobe ausdrücklich `_db/quelle.test.ts` zu:
**Teil 2 erweitert diese Datei, es entsteht keine zweite.**

**F6 — Die Enum-Listen stehen doppelt, und ein Test hält sie zusammen.** §4.15 schreibt
`_db/schema.ts` (Drizzle-Enum) **und** `_lib/konstanten.ts` (Zod) als zwei Orte fest. Das ist
gewollt: der Drizzle-Enum ist ein 1:1-Port, die Zod-Liste ist der Eingangsvalidator. Damit sie nicht
auseinanderlaufen, behauptet `_lib/konstanten.test.ts` die Mengengleichheit gegen `schema.ts`
(T4). ⚠️ Die **Reihenfolge** darf abweichen (`bz_kontrollen` führt `["oidc","token","system"]`,
`buchungen` `["token","oidc","system"]`) — sie erzeugt kein SQL und ist damit für den Schema-Diff
unsichtbar.

**F7 — Der `when`-Wert der drei handgeschriebenen Migrationen wird aus dem generierten `0000`
abgeleitet, nicht erfunden.** Ein kleinerer `when` als der Vorgänger wird **nie ausgeführt** (§4.3),
und `drizzle-kit generate` stempelt die Erzeugungszeit. Vorschrift: `0000`s `when` ablesen, dann
`+1000`, `+2000`, `+3000`. `_db/migrations.test.ts` behauptet die strenge Monotonie (T9).

---

## Global Constraints

Projektweit gültig, exakte Werte aus der Spec. **Die Anforderungen jedes Tasks schließen diesen
Abschnitt implizit ein.**

**Identität und Registrierung**
- Modul-Key `lagerbuch`; DB-Datei `lagerbuch.db` unter `DATA_DIR`; Migrationsverzeichnis
  `src/app/m/lagerbuch/_db/migrations`.
- Registry-Eintrag exakt: `{ key: "lagerbuch", title: "Lagerbuch", icon: "ContainerOutlined",
  shell: "full", requiresAuth: false, requiredGroups: [], adminGroups: ["lagerbuch_nutzer"],
  prodHosts: [], showInSwitcher: true }`.
- `requiresAuth: false` ist **zwingend**, nicht bequem: `/t/<code>` erzeugt die Sitzung erst und wird
  ohne jede Sitzung aufgerufen. Folge: `canAccess` steigt sofort mit `true` aus
  (`core/registry.ts:155`) und liest `requiredGroups` **nie**.
- `prodHosts: []` — die Domain `lagerbuch.iuk-ue.de` kommt **ausschließlich** aus
  `SUITE_HOST_LAGERBUCH`.

**Zugriff**
- **`isModuleAdmin`, `canAdminModule`, `requireModuleAdmin`, `moduleAdminPageOrNotFound` und
  `session.user.isAdmin` sind für dieses Modul verboten.** Der Suite-Admin bekommt keine
  Lagerbuch-Rechte (Betreiber-Entscheidung 3).
- **Ein gesetztes `SUITE_ACCESS_GROUP_LAGERBUCH` bricht den Boot ab** (§2.5, Punkt 3).
- **`core/ratelimit.ts` wird nicht angefasst.** Für portal, qr, feedback und files ändert sich nichts.
- Die Absenderadresse liest `cf-connecting-ip`, sonst einen konstanten Sammelschlüssel, und
  **niemals `x-forwarded-for`** — weder den ersten noch den rechtesten Eintrag.
- Cookie-Name **`helfer_session`**, ohne Modulpräfix.

**Daten und Zeit**
- Zeitstempel: UNIX-**Sekunden**, Drizzle `mode: "timestamp"`. **Niemals `timestamp_ms`.**
- Zone: `ZEITZONE = "Europe/Berlin"` als **Modulkonstante**. `TZ` wird von diesem Vorhaben **nicht**
  gesetzt; das Modul hängt bewusst nicht an der Prozess-`TZ`.
- **Keine ID wird neu vergeben**, für keine der 16 Tabellen. `newId()` = `nanoid()` mit den
  Vorgabewerten: 21 Zeichen, 64er-Alphabet inkl. `-` und `_`, case-sensitiv.
- Token-Code-Form `NNN-NNN` — **der Bindestrich ist Teil des gespeicherten Werts.**
- Feste Werte, unverhandelbar: `"handlager"` (`lagerorte.id`), `"2099-12"` (`chargen.verfall`,
  „kein Verfall"), `"Korrektur"` / `"Inventur"` / `"ohne Verfall"` (`chargen.chargen_nr`),
  `"In Ordnung"` / `"Gebrauchsspuren"` / `"Defekt"` (in `checks.ergebnis`).
- **`INSERT OR REPLACE` umgeht den Append-only-Trigger** bei `recursive_triggers = 0` (dem Default;
  `openModuleDatabase` setzt es nicht). Das wiederholbare Idiom ist **`INSERT OR IGNORE`**;
  `onConflictDoUpdate` bricht auf `buchungen` beim zweiten Lauf ab.
- **`BESTELL_FAKTOR` wird ersatzlos gestrichen**, samt seiner drei Teststellen.
- Bestellvorschlag = Lückenformel `max(0, mindestbestand − bestand)`.

**Bauform**
- **Kein `"use client"` unter `_lib/` und `_db/`.** Ein WERT aus einem Client-Modul kommt in einer
  Server Component nicht an — HTTP 500, und weder `build` noch Vitest sehen es (Falle 6).
- **Kein `@ant-design/icons`-Import unter `_lib/`, `_db/` oder in einer Server Component.** Der
  Fehler entsteht **beim Import**, nicht beim Rendern; `"use client"` behebt ihn nicht, es macht ihn
  still (Falle 7). Die sieben Fallen stehen vollständig in `CLAUDE.md:9-46`.
- Client-Pfade (`href`, `router.replace`, jedes `Location`) tragen die **äußere** Form
  (`/verwaltung/artikel`); jedes `revalidatePath` die **innere** (`/m/lagerbuch/verwaltung/artikel`).
- **Kein `_db/queries.ts`.** Lesepfade liegen unter `_lib/lesepfade/`, Schreibwege unter
  `_lib/schreibpfade/`; `_db/` hält nur Schema, Verbindung und die zwei tabellennahen Auflöser
  `quelle.ts` und `etiketten.ts`.
- DOM-Tests benutzen `@/app/m/qr/_lib/test-dom` — **kein zweites Harness erfinden**, und die Hebung
  nach `core` findet in diesem Vorhaben **nicht** statt (§12.2).
- **Kein globaler `env`-/`TZ`-Block in `iuk-suite/vitest.config.ts`** (§12.6, Punkt 1).

---

## 2. Datei-Eigentümerschaft — mechanisch prüfbar

Jede Datei gehört genau einem Task. Wer in einer fremden Datei arbeitet, hat den Schnitt verlassen.

| Datei | Task |
|---|---|
| `package.json`, `pnpm-lock.yaml` | T1 |
| `src/core/shell/icons.ts` | T2 (Commit 1) |
| `src/core/registry.ts` | T2 (Commit 2) |
| `src/app/m/lagerbuch/_lib/zeit.ts`, `_lib/zeit.test.ts` | T3 |
| `src/app/m/lagerbuch/_lib/konstanten.ts`, `_lib/konstanten.test.ts` | T4 |
| `src/app/m/lagerbuch/_lib/suche.ts`, `_lib/suche.test.ts` | T5 |
| `src/app/m/lagerbuch/layout.tsx` | T6 |
| `src/app/m/lagerbuch/_db/schema.ts`, `_db/drizzle.config.ts` | T7 |
| `src/app/m/lagerbuch/_db/migrations/**`, `src/core/bootstrap.ts`, `Dockerfile` | T8 |
| `src/app/m/lagerbuch/_db/testdb.ts`, `_db/migrations.test.ts` | T9 |
| `src/app/m/lagerbuch/_lib/host.ts`, `_lib/host.test.ts` | T10 |
| `src/app/m/lagerbuch/_db/append-only.test.ts` | T11 |
| `src/app/m/lagerbuch/_db/client.ts`, `_db/client.test.ts` | T12 |
| `src/app/m/lagerbuch/_db/quelle.ts`, `_db/quelle.test.ts` | T13 |
| — (nur Ausführung und Protokoll) | T14 |

**Drei `core`-Dateien werden im ganzen Vorhaben angefasst, jede mit eigenem Commit:**
`core/shell/icons.ts` (T2, hier), `core/bootstrap.ts` — zweimal: `MODULE_MIGRATIONS` in T8 (hier)
und der Boot-Haken in **Teil 2** —, und `core/shell/shell.module.css` (`.modulnav`, **Teil 4**).

---

## 3. Gates am Ende jeder Wellenstufe

```bash
pnpm typecheck        # muss grün sein
pnpm lint             # Fehler blockieren, Warnungen nicht
pnpm vitest run       # muss grün sein
pnpm build            # muss grün sein
```

**Was diese vier Gates strukturell NICHT sehen** (§12.4) und was deshalb in T14 als **Abruf** gegen
einen laufenden Server nachgeholt wird: Compound-Zugriff auf antd in einer Server Component,
`@ant-design/icons` in RSC, ein WERT aus einem `"use client"`-Modul, und die `usePathname`-Naht
unter dem Rewrite. Teil 1 baut noch keine Oberfläche — der Abruf beschränkt sich hier auf
`/api/health/lagerbuch` und den Boot.

`pnpm exec playwright test` ist in Teil 1 **nicht** fällig: es gibt noch keine Route des Moduls außer
dem riegelfreien Layout. Der E2E-Aufbau (`playwright.config.ts`, Seed-Schritt) gehört zu Teil 3.

---

## Welle 1 — Fundament, reine Werte, `core`-Naht (6 Tasks, alle parallel)

Diese sechs Tasks berühren einander nicht. T1 ist der früheste Schritt überhaupt (ohne ihn scheitert
Teil 2 an `jose` und Teil 6 an `write-excel-file`).

---

### Task 1: Die vier Laufzeit-Abhängigkeiten

**Files:**
- Modify: `package.json` (Block `dependencies`)
- Modify: `pnpm-lock.yaml` (erzeugt, nicht von Hand)

**Interfaces:**
- Consumes: nichts.
- Produces: `jose` (Teil 2, `_lib/helferSitzung.ts`), `write-excel-file` (Teil 6, `_lib/bestandExport.ts`),
  `@zxing/browser` + `@zxing/library` (Teil 4, `_ui/BarcodeScanner.tsx`).

**Warum das ein eigener Task ist.** Unter pnpm ist ein nur **transitiv** vorhandenes Paket nicht
importierbar (Falle 58) — ein `import { SignJWT } from "jose"` scheitert erst zur Bauzeit von Teil 2,
also einen halben Plan später. `qrcode` und `nanoid` sind bereits vorhanden
(`package.json`, `dependencies`) und kommen **nicht** dazu.

- [ ] **Schritt 1: Die vier Pakete installieren**

```bash
pnpm add jose write-excel-file @zxing/browser @zxing/library
```

⚠️ **Der Lockfile wird von der lokal aktiven pnpm-Fassung geschrieben.** Prüfe vorher
`pnpm --version` und protokolliere den Wert im Commit-Text. Weicht er von der Fassung ab, mit der
`pnpm-lock.yaml` heute erzeugt wurde, entsteht ein großer, unzusammenhängender Diff — dann
`pnpm install --lockfile-only` mit der passenden Fassung nachziehen, statt den Diff zu akzeptieren.

⚠️ **Keine einzige Zeile aus `lagerbuch/Dockerfile` wandert mit.** Insbesondere nicht
`RUN corepack enable` (`lagerbuch/Dockerfile:4`): auf Node 26 bricht das mit exit 127 ab, weil die
offiziellen Images corepack seit Node 25 nicht mehr bündeln. Die Suite hat genau das schon einmal
gefressen (`iuk-suite/Dockerfile:3-8`).

- [ ] **Schritt 2: Prüfen, dass alle vier auflösen**

```bash
pnpm exec node -e "for (const p of ['jose','write-excel-file','@zxing/browser','@zxing/library']) { console.log(p, require.resolve(p)); }"
```

Erwartet: vier Zeilen mit Pfaden unter `node_modules/`, kein `MODULE_NOT_FOUND`.

- [ ] **Schritt 3: Gates**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

Erwartet: alle vier grün. Die Pakete werden noch nirgends importiert — das ist richtig so.

- [ ] **Schritt 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(lagerbuch): vier Laufzeit-Abhaengigkeiten fuer den Modul-Port

jose (Helfer-Sitzung), write-excel-file (Bestandsexport), @zxing/browser und
@zxing/library (Barcode-Scanner). Unter pnpm ist ein nur transitiv vorhandenes
Paket nicht importierbar (Analyse-Falle 58), deshalb explizit."
```

---

### Task 2: `core/shell/icons.ts` und der Registry-Eintrag — zwei Commits, feste Reihenfolge

**Files:**
- Modify: `src/core/shell/icons.ts` (Importblock und `ICONS`-Map)
- Modify: `src/core/registry.ts` (`MODULES`, ans **Ende** der Liste)

**Interfaces:**
- Consumes: nichts.
- Produces: `getModule("lagerbuch")` liefert die `ModuleDef`; `moduleForHost("lagerbuch.localtest.me")`
  trifft sie; `/api/health/lagerbuch` antwortet. Alles davon ist Voraussetzung von T10
  (`_lib/host.ts`) und jedem späteren Riegel.

**Warum die Reihenfolge fest ist.** `SuiteNav.test.tsx` prüft die `ICONS`-Map **gegen die echte
`MODULES`-Liste**: jedes Modul-Icon muss in der Map stehen. Landet der Registry-Eintrag zuerst, ist
der Test zwischen den beiden Commits rot. Umgekehrt ist ein zusätzlicher Map-Eintrag ohne Modul
harmlos — die Prüfung läuft nur in eine Richtung.

⚠️ **Der Rückfall ist die Falle, nicht die Rettung.** Ein `icon`-Name, der bloß eine gültige
`@ant-design/icons`-Komponente ist, in der Map aber **fehlt**, fällt **still** auf
`AppstoreOutlined` zurück — das Modul wäre in Kopfzeile und Drawer jeder Suite-Seite vom Portal
nicht zu unterscheiden. Genau so ist es `files` am 30.07.2026 passiert; der Kopfkommentar von
`icons.ts` schreibt den Vorgang aus.

- [ ] **Schritt 1: Prüfen, dass `ContainerOutlined` existiert**

```bash
ls node_modules/@ant-design/icons/es/icons/ContainerOutlined.js
```

Erwartet: der Pfad wird ausgegeben. (Gemessen am 03.08.2026 vorhanden.) Fehlt die Datei, ist der
Registry-Wert falsch und die Task blockiert — **nicht** ein anderes Icon raten.

- [ ] **Schritt 2: Den Test schreiben, der den fehlenden Map-Eintrag fängt**

Die Kopplung ist bereits gebaut (`SuiteNav.test.tsx` prüft `ICONS` gegen `MODULES`). Der Test in
diesem Schritt behauptet nur die **eine** neue Zeile, damit der Commit einen eigenen Beweis hat.
Anfügen in `src/core/shell/icons.test.ts`:

```ts
it("kennt ContainerOutlined fuer lagerbuch", () => {
  expect(Object.keys(ICONS)).toContain("ContainerOutlined");
});
```

- [ ] **Schritt 3: Den Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/core/shell/icons.test.ts
```

Erwartet: FAIL, `expected [ … ] to contain 'ContainerOutlined'`.

- [ ] **Schritt 4: `icons.ts` ergänzen**

Im Importblock alphabetisch einsortieren (zwischen `CommentOutlined` und `DesktopOutlined`) und in
die `ICONS`-Map aufnehmen:

```ts
import {
  AppstoreOutlined,
  BorderOutlined,
  CaretUpOutlined,
  CommentOutlined,
  ContainerOutlined,
  DesktopOutlined,
  FolderOutlined,
  GlobalOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
```

und in der Map-Deklaration die Zeile

```ts
  ContainerOutlined,
```

⚠️ **Diese Datei ist client-only.** Der Kopfkommentar sagt es in Großbuchstaben, und der Grund ist
gemessen: ein `import { ICONS }` in einer Server Component ergibt HTTP 500 mit
`TypeError: (0 , _react.createContext) is not a function`, **beim Import**. Nichts an diesem Task
darf daran rühren.

- [ ] **Schritt 5: Test grün**

```bash
pnpm vitest run src/core/shell/icons.test.ts
```

Erwartet: PASS.

- [ ] **Schritt 6: Commit 1 — nur `core`**

```bash
git add src/core/shell/icons.ts src/core/shell/icons.test.ts
git commit -m "feat(core): ContainerOutlined in die ICONS-Map

Vorbereitung fuer den Registry-Eintrag von lagerbuch. Ein Modul-Icon, das nur
bei antd existiert und in DIESER Map fehlt, faellt still auf AppstoreOutlined
zurueck — genau der Ausfall, den files am 30.07. hatte."
```

- [ ] **Schritt 7: Den Registry-Eintrag schreiben**

In `src/core/registry.ts`, in `MODULES`, **hinter** dem `files`-Eintrag und vor `alpha`
(die Demo-Module `alpha`/`gamma`/`beta`/`kioskdemo` bleiben am Ende):

```ts
  // lagerbuch: EIN Host (lagerbuch.iuk-ue.de), aber die Domain steht ausschliesslich
  // in SUITE_HOST_LAGERBUCH — Betreiberauflage vom 03.08.2026 („zu 100 % konfigurierbar").
  // prodHosts bleibt deshalb leer, wie bei qr, feedback und files.
  //
  // requiresAuth MUSS false bleiben: /t/<code> ist der einzige Weg in die
  // Helfer-Sitzung und wird OHNE jede Sitzung aufgerufen, /g/<code> entscheidet
  // seine Rolle selbst, und das Gate auf / ist der Einstieg beider. Mit
  // requiresAuth: true schickt decideRoute (routing.ts:71-73) jeden anonymen
  // Aufruf in den Login — und zwar sofort beim Cutover, fuer jedes gedruckte
  // Etikett gleichzeitig.
  // Dadurch liest canAccess() requiredGroups hier NIE (frueher Ausstieg bei
  // !requiresAuth, registry.ts:155). Durchgesetzt wird der Verwaltungszugang
  // modul-intern in _lib/zugang.ts, der Host in _lib/host.ts.
  { key: "lagerbuch", title: "Lagerbuch", icon: "ContainerOutlined", shell: "full",
    requiresAuth: false, requiredGroups: [], adminGroups: ["lagerbuch_nutzer"],
    prodHosts: [], showInSwitcher: true },
```

Feld für Feld, damit niemand einen Wert „aufräumt":
- `requiredGroups: []` bleibt leer und wird von `_lib/zugang.ts` **nicht** gelesen; das Feld steht
  nur da, weil `ModuleDef` es verlangt.
- `adminGroups: ["lagerbuch_nutzer"]` — ⚠️ **NICHT der Vorgabewert der Alt-Anwendung.**
  `lagerbuch/src/lib/config.ts:46` führt `lagerbuch-admin` **mit Bindestrich**, und eine Gruppe
  dieses Namens gibt es in Pocket ID **nicht**: die Verzeichnisabfrage vom 04.08.2026 liefert zehn
  Gruppen, alle mit Unterstrich bzw. Kleinschreibung, darunter genau eine lagerbuch-eigene —
  `lagerbuch_nutzer` (4 Mitglieder). Der Alt-Vorgabewert kann also nie gegriffen haben; die
  laufende Instanz **muss** `OIDC_ADMIN_GROUP` explizit gesetzt haben.
  → **Betreiberentscheidung D3 (04.08.2026): `lagerbuch_nutzer`.** Es ist die einzige plausible
  Gruppe — das Modul kennt genau **eine** Zugriffsstufe, und der Helfer-Weg braucht gar kein Konto;
  „Lagerbuch Nutzer" sind damit genau die Personen, die die Verwaltung bedienen.
  ⚠️ **Ein falscher Wert sperrt jede verwaltende Person aus, und die Boot-Prüfung fängt den LEEREN,
  nicht den FALSCHEN Wert.** Deshalb: vor dem Umschwenken des Routers **einmal echt einloggen**.
  Die Gruppenliste liegt ungetrackt unter `.betrieb-lokal/pocketid-gruppen.md`.
- `shell: "full"` ist **nur die Vorgabe**; welche Shell eine Route wirklich bekommt, entscheidet ihr
  Layout (§2.9).
- `showInSwitcher: true` wirkt vor dem Cutover nicht — `switcherEntries.ts:10-14` verwirft Module
  ohne Prod-Host.

- [ ] **Schritt 8: Die Kopplungen laufen lassen**

```bash
pnpm vitest run src/core
```

Erwartet: PASS — insbesondere `SuiteNav.test.tsx` (ICONS gegen MODULES) und `bootstrap.test.ts`.

⚠️ **`bootstrap.test.ts:82-107` prüft „jedes Modul mit `_db/` steht in `MODULE_MIGRATIONS`".** Da
`src/app/m/lagerbuch/_db/` in diesem Task noch **nicht** existiert, bleibt der Test grün. Er wird der
Wächter von T8.

- [ ] **Schritt 9: Gates**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

- [ ] **Schritt 10: Commit 2 — die Registry**

```bash
git add src/core/registry.ts
git commit -m "feat(lagerbuch): Registry-Eintrag, requiresAuth false, prodHosts leer

Fuenftes Modul der Suite. requiresAuth MUSS false bleiben — /t/<code> erzeugt
die Helfer-Sitzung erst und wird ohne jede Sitzung aufgerufen. Folge:
canAccess() liest requiredGroups hier nie; Zugriff und Host werden modulintern
geriegelt (_lib/zugang.ts, _lib/host.ts)."
```

---

### Task 3: `_lib/zeit.ts` — die Zone steht im Code, nicht in der Umgebung

**Files:**
- Create: `src/app/m/lagerbuch/_lib/zeit.ts`
- Test: `src/app/m/lagerbuch/_lib/zeit.test.ts`

**Interfaces:**
- Consumes: nichts. **Das ist die früheste sinnvolle Datei des ganzen Vorhabens** — jede
  Datumsableitung des Moduls läuft durch sie.
- Produces:
  ```ts
  export const ZEITZONE = "Europe/Berlin";
  export function ausZivilzeit(jahr: number, monat1bis12: number, tag: number,
    std?: number, min?: number, sek?: number, ms?: number): Date;
  export function monatsEnde(verfall: string): Date;          // "YYYY-MM" → letzter Tag, 23:59:59.999 Ortszeit
  export function startDesTages(now: Date): Date;             // Mitternacht des Tages in ZEITZONE
  export function tagesGrenzen(datum: string): { von: Date; bis: Date };  // "YYYY-MM-DD", inklusiv
  export function fmtTs(d: Date): string;                     // "TT.MM. HH:MM"
  export function heuteIso(now?: Date): string;               // "YYYY-MM-DD"
  export function uhrzeit(d: Date): string;                   // "HH:MM"
  ```
  Konsumenten: `_lib/domain/verfall.ts` und `geraet.ts` (Teil 3), `_lib/format.ts` (Teil 3),
  `_lib/bestandExport.ts` (Teil 6), `_ui/Restzeit.tsx` (Teil 4).

**Warum überhaupt.** Entscheidung 26 fällt auf **(b)**: explizite Zonenrechnung im Modul, weil das
Setzen von `TZ=Europe/Berlin` ein suiteweiter Eingriff gegen vier laufende Module ist und
**ausdrücklich nicht Teil dieses Vorhabens** (§1.5, Punkt 1). Ein Modul, das auf die Prozess-`TZ`
baut, hängt an einem Schritt, den niemand schuldet.

**Die Regel, die diese Datei durchsetzt:** außerhalb von `_lib/zeit.ts` steht im ganzen Modul **kein**
`new Date(jahr, monat, …)` mit mehr als einem Argument und **kein**
`getHours`/`getMinutes`/`getFullYear`/`getMonth`/`getDate` auf einem Datum, das dem Nutzer gezeigt
oder mit einem Tagesrand verglichen wird. Die Regel ist grep-bar und gehört in das Review jeder Datei
dieses Moduls.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/zeit.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ZEITZONE, ausZivilzeit, monatsEnde, startDesTages, tagesGrenzen, fmtTs, heuteIso, uhrzeit }
  from "./zeit";

/**
 * Der Test verstellt `process.env.TZ` ABSICHTLICH und behauptet in beiden Laeufen
 * dasselbe Ergebnis. Genau daran haengt die Entscheidung aus §12.6 Punkt 1, KEINEN
 * globalen TZ-Pin in `iuk-suite/vitest.config.ts` zu ziehen: dieser Test beweist die
 * Unabhaengigkeit, die ein Pin verstecken wuerde.
 *
 * Pacific/Kiritimati ist UTC+14 und findet Vorzeichenfehler, die UTC nicht findet.
 */
const ZONEN = ["UTC", "Pacific/Kiritimati"] as const;
let vorher: string | undefined;

beforeEach(() => { vorher = process.env.TZ; });
afterEach(() => { process.env.TZ = vorher; });

describe.each(ZONEN)("unter Prozess-TZ %s", (tz) => {
  beforeEach(() => { process.env.TZ = tz; });

  it("ZEITZONE ist Europe/Berlin", () => {
    expect(ZEITZONE).toBe("Europe/Berlin");
  });

  it("monatsEnde trifft den Sommerzeit-Rand", () => {
    expect(monatsEnde("2026-08").toISOString()).toBe("2026-08-31T21:59:59.999Z");
  });

  it("monatsEnde trifft den Winterzeit-Rand — kein fester Offset verdrahtet", () => {
    expect(monatsEnde("2026-01").toISOString()).toBe("2026-01-31T22:59:59.999Z");
  });

  it("heuteIso nimmt den Berliner Tag, nicht den UTC-Tag", () => {
    expect(heuteIso(new Date("2026-08-03T22:30:00Z"))).toBe("2026-08-04");
  });

  it("fmtTs schiebt eine Buchung nach Mitternacht NICHT auf den Vortag", () => {
    // Unter UTC stuende hier "02.08. 23:30" — jede Buchung zwischen 00:00 und
    // 02:00 Ortszeit landete auf dem Vortag (Analyse-Falle 2).
    expect(fmtTs(new Date("2026-08-02T23:30:00Z"))).toBe("03.08. 01:30");
  });

  it("uhrzeit liefert HH:MM in der Zone", () => {
    expect(uhrzeit(new Date("2026-08-02T23:30:00Z"))).toBe("01:30");
  });

  it("startDesTages ist Mitternacht Ortszeit", () => {
    expect(startDesTages(new Date("2026-08-03T14:00:00Z")).toISOString())
      .toBe("2026-08-02T22:00:00.000Z");
  });

  it("tagesGrenzen sind inklusiv und zonenrichtig", () => {
    const { von, bis } = tagesGrenzen("2026-08-03");
    expect(von.toISOString()).toBe("2026-08-02T22:00:00.000Z");
    expect(bis.toISOString()).toBe("2026-08-03T21:59:59.999Z");
  });

  // Die zwei DST-Raender aus §4.5, benannt entschieden:
  it("Sprungloch: 02:30 am letzten Maerzsonntag gibt es nicht → 03:30 Ortszeit", () => {
    // 2026-03-29, Umstellung 02:00 → 03:00 Ortszeit.
    expect(ausZivilzeit(2026, 3, 29, 2, 30).toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("Doppeldeutigkeit: 02:30 am letzten Oktobersonntag gibt es zweimal → Sommerzeit-Lesart", () => {
    // 2026-10-25: 00:30Z ist 02:30 CEST, 01:30Z ist 02:30 CET. Die ERSTE gewinnt.
    expect(ausZivilzeit(2026, 10, 25, 2, 30).toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("Normalfall: die Zivilzeit trifft genau einen Zeitpunkt", () => {
    expect(ausZivilzeit(2026, 8, 15, 12, 0).toISOString()).toBe("2026-08-15T10:00:00.000Z");
  });
});
```

- [ ] **Schritt 2: Den Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/zeit.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./zeit"`.

- [ ] **Schritt 3: `_lib/zeit.ts` schreiben**

```ts
/**
 * Zonenrechnung des Moduls — Entscheidung 26 (b), §4.5.
 *
 * KEIN "use client": die Werte hier werden von Server Components gelesen, und ein
 * WERT aus einem Client-Modul kommt dort nicht an (HTTP 500, Falle 6). Weder
 * `pnpm build` noch Vitest findet das.
 *
 * DIE ZONE STEHT IM CODE, NICHT IN DER PROZESSUMGEBUNG. `TZ=Europe/Berlin` zu
 * setzen ist ein suiteweiter Eingriff gegen vier laufende Module und ausdruecklich
 * nicht Teil dieses Vorhabens (§1.5). Das Modul haengt bewusst nicht daran —
 * `_lib/zeit.test.ts` verstellt `process.env.TZ` absichtlich und beweist es.
 *
 * REGEL FUER DAS GANZE MODUL: ausserhalb dieser Datei steht kein
 * `new Date(jahr, monat, …)` mit mehr als einem Argument und kein
 * getHours/getMinutes/getFullYear/getMonth/getDate auf einem Datum, das dem
 * Nutzer gezeigt oder mit einem Tagesrand verglichen wird.
 */
export const ZEITZONE = "Europe/Berlin";

const TEILE = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZEITZONE,
  hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

type Zivil = { jahr: number; monat: number; tag: number; std: number; min: number; sek: number };

/** Absoluter Zeitpunkt → Zivilzeit in ZEITZONE. */
function zonenTeile(at: Date): Zivil {
  const p = Object.fromEntries(TEILE.formatToParts(at).map((t) => [t.type, t.value]));
  return {
    jahr: Number(p.year), monat: Number(p.month), tag: Number(p.day),
    // `% 24` ist Guertel und Hosentraeger: manche ICU-Faessungen liefern trotz
    // hourCycle "h23" fuer Mitternacht die 24.
    std: Number(p.hour) % 24, min: Number(p.minute), sek: Number(p.second),
  };
}

/** Offset der Zone zum Zeitpunkt `at`, in Minuten (positiv = oestlich von UTC). */
function zonenOffsetMin(at: Date): number {
  const t = zonenTeile(at);
  const alsUtc = Date.UTC(t.jahr, t.monat - 1, t.tag, t.std, t.min, t.sek);
  const ohneMs = at.getTime() - ((at.getTime() % 1000) + 1000) % 1000;
  return Math.round((alsUtc - ohneMs) / 60000);
}

/**
 * Zivilzeit in ZEITZONE → absoluter Zeitpunkt.
 *
 * ZWEI KANDIDATEN, NICHT EINE ZWEISTUFIGE NAEHERUNG: der Offset haengt vom
 * Ergebnis ab, und an den zwei Umstellungsraendern ist die Zivilzeit entweder
 * doppeldeutig oder gar nicht vorhanden. §4.5 entscheidet beide Faelle benannt:
 *
 *   - Doppeldeutigkeit (letzter Oktobersonntag, 02:30 gibt es zweimal):
 *     die ERSTE Lesart gewinnt, also die Sommerzeit. Deshalb wird der KLEINERE
 *     passende Kandidat genommen.
 *   - Sprungloch (letzter Maerzsonntag, 02:30 gibt es nicht): kein Kandidat
 *     passt; dann gewinnt der GROESSERE, das Ergebnis ist 03:30 Ortszeit.
 *
 * Fuer `monatsEnde` und `startDesTages` ist beides folgenlos — weder 23:59:59.999
 * noch 00:00:00 faellt je in den Berliner Umstellungsrand. Genau deshalb ist die
 * Regel billig und muss trotzdem aufgeschrieben werden.
 */
export function ausZivilzeit(
  jahr: number, monat1bis12: number, tag: number,
  std = 0, min = 0, sek = 0, ms = 0,
): Date {
  const naiv = Date.UTC(jahr, monat1bis12 - 1, tag, std, min, sek, ms);
  const kandidaten = [
    naiv - zonenOffsetMin(new Date(naiv - 86_400_000)) * 60_000,
    naiv - zonenOffsetMin(new Date(naiv + 86_400_000)) * 60_000,
  ].sort((a, b) => a - b);

  for (const k of kandidaten) {
    const t = zonenTeile(new Date(k));
    if (t.jahr === jahr && t.monat === monat1bis12 && t.tag === tag
      && t.std === std && t.min === min && t.sek === sek) {
      return new Date(k);
    }
  }
  return new Date(kandidaten[kandidaten.length - 1]);
}

/**
 * Letzter Tag des Monats "YYYY-MM", 23:59:59.999 Ortszeit.
 *
 * TOLERANT GEGEN DEN DOKUMENTIERTEN DEFEKT: ein Monat ausserhalb 01–12 (etwa
 * "2026-00", der laxe Validator liess ihn frueher durch) faellt auf den
 * Rueckfallzweig von `ausZivilzeit` und ergibt einen Zeitpunkt in der
 * Vergangenheit — die Charge gilt als abgelaufen. Das ist der in §4.6
 * ausgeschriebene, bewusst NICHT behobene Ausgang; der Eingang wird ab jetzt
 * ueber MONAT_REGEX geriegelt (_lib/konstanten.ts).
 */
export function monatsEnde(verfall: string): Date {
  const [j, m] = verfall.split("-").map(Number);
  const letzterTag = new Date(Date.UTC(j, m, 0)).getUTCDate();
  return ausZivilzeit(j, m, letzterTag, 23, 59, 59, 999);
}

/** Mitternacht des Tages, in den `now` in ZEITZONE faellt. */
export function startDesTages(now: Date): Date {
  const t = zonenTeile(now);
  return ausZivilzeit(t.jahr, t.monat, t.tag, 0, 0, 0, 0);
}

/** Inklusive Grenzen eines Tages "YYYY-MM-DD" als absolute Zeitpunkte. */
export function tagesGrenzen(datum: string): { von: Date; bis: Date } {
  const [j, m, t] = datum.split("-").map(Number);
  return {
    von: ausZivilzeit(j, m, t, 0, 0, 0, 0),
    bis: ausZivilzeit(j, m, t, 23, 59, 59, 999),
  };
}

const zz = (n: number) => String(n).padStart(2, "0");

/** "TT.MM. HH:MM" in ZEITZONE — das Journalformat. */
export function fmtTs(d: Date): string {
  const t = zonenTeile(d);
  return `${zz(t.tag)}.${zz(t.monat)}. ${zz(t.std)}:${zz(t.min)}`;
}

/** "YYYY-MM-DD" in ZEITZONE — der Excel-Dateiname. */
export function heuteIso(now: Date = new Date()): string {
  const t = zonenTeile(now);
  return `${t.jahr}-${zz(t.monat)}-${zz(t.tag)}`;
}

/**
 * "HH:MM" in ZEITZONE — die Ablaufzeit der Helfer-Sitzung im Helfer-Rahmen
 * (§3.4.3, §7.8.2). Sie steht hier und nicht in `_lib/format.ts`, weil auch sie
 * Zonenrechnung ist.
 */
export function uhrzeit(d: Date): string {
  const t = zonenTeile(d);
  return `${zz(t.std)}:${zz(t.min)}`;
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/zeit.test.ts
```

Erwartet: PASS, **22 Zusicherungen** (11 × zwei Zonen).

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/zeit.ts src/app/m/lagerbuch/_lib/zeit.test.ts
git commit -m "feat(lagerbuch): _lib/zeit.ts — Europe/Berlin als Modulkonstante

Entscheidung 26 (b): explizite Zonenrechnung statt Prozess-TZ. Das Setzen von
TZ ist ein suiteweiter Eingriff gegen vier laufende Module und nicht Teil
dieses Vorhabens; das Modul haengt bewusst nicht daran. Der Test verstellt
process.env.TZ absichtlich (UTC und UTC+14) und beweist die Unabhaengigkeit —
genau deshalb bekommt vitest.config.ts KEINEN globalen TZ-Pin."
```

---

### Task 4: `_lib/konstanten.ts` — die Werte, die auf Papier stehen

**Files:**
- Create: `src/app/m/lagerbuch/_lib/konstanten.ts`
- Test: `src/app/m/lagerbuch/_lib/konstanten.test.ts`

**Interfaces:**
- Consumes: nichts. ⚠️ Die Mengengleichheits-Prüfung in `konstanten.test.ts` importiert
  `_db/schema.ts` — **die entsteht erst in T7**. Der betreffende `describe`-Block wird deshalb in
  T7 nachgezogen; siehe Schritt 6.
- Produces:
  ```ts
  export const HANDLAGER_ID: "handlager";
  export const PSEUDO_VERFALL: "2099-12";
  export function istOhneVerfall(verfall: string): boolean;
  export const CHARGE_KORREKTUR: "Korrektur";
  export const CHARGE_INVENTUR: "Inventur";
  export const CHARGE_OHNE_VERFALL: "ohne Verfall";
  export const ZUSTAENDE: readonly ["In Ordnung", "Gebrauchsspuren", "Defekt"];
  export const ZUSTAND_DEFEKT: "Defekt";
  export type Zustand = (typeof ZUSTAENDE)[number];
  export const MONAT_REGEX: RegExp;
  export const TAG_REGEX: RegExp;
  export function istEchterKalendertag(s: string): boolean;
  export const BUCHUNGSTYPEN: readonly ["zugang","entnahme","korrektur","umlagerung"];
  export const QUELLE_TYPEN: readonly ["token","oidc","system"];
  export const LAGERORT_TYPEN: readonly ["lager","fahrzeug"];
  export const GERAETE_TYPEN: readonly ["medizin","objekt"];
  export const TOKEN_ZIEL_TYPEN: readonly ["fahrzeug","artikel"];
  ```

**Warum diese Datei existiert und warum ohne `"use client"`.** §4.15: ein Dutzend Werte muss von
**Server Components** gelesen werden. `ZUSTAENDE` steht heute in `CheckFlow.tsx:22` — einer
**Client**-Datei — und das ist in der Suite genau die falsche Seite der Grenze. Eine Server Component
bekäme dort eine Client-Referenz statt des Wertes, HTTP 500 für die ganze Seite, und **weder
`pnpm build` noch Vitest findet das**. Umgekehrt darf hier **kein** Icon importiert werden (Falle 7):
der Fehler entstünde beim Import und risse jede Datei mit, die die Konstanten liest.

**Entscheidung 6 — es gibt genau EINEN Monatsvalidator.** Heute stehen zwei Ausdrücke nebeneinander:
streng `/^\d{4}-(0[1-9]|1[0-2])$/` (`lagerort-verfall.ts:10`) und lax `/^\d{4}-\d{2}$/`
(`buchung.ts:17`, `bz.ts:83`). `"2026-00"` passiert den laxen, `verfallStatus` rechnet daraus den
**31.12.2025**, und die Charge gilt ab dem Anlegen als abgelaufen. Ab jetzt gilt überall
`MONAT_REGEX`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/konstanten.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  HANDLAGER_ID, PSEUDO_VERFALL, istOhneVerfall,
  CHARGE_KORREKTUR, CHARGE_INVENTUR, CHARGE_OHNE_VERFALL,
  ZUSTAENDE, ZUSTAND_DEFEKT,
  MONAT_REGEX, TAG_REGEX, istEchterKalendertag,
  BUCHUNGSTYPEN, QUELLE_TYPEN, LAGERORT_TYPEN, GERAETE_TYPEN, TOKEN_ZIEL_TYPEN,
} from "./konstanten";

describe("feste Werte, die auf Papier bzw. in Produktionsdaten stehen", () => {
  it("HANDLAGER_ID ist woertlich 'handlager'", () => {
    // 75 Fundstellen im Alt-Repo. Mit foreign_keys = ON ist eine andere ID kein
    // Schoenheitsfehler, sondern ein FK-Fehler bei der ersten Entnahme.
    expect(HANDLAGER_ID).toBe("handlager");
  });

  it("PSEUDO_VERFALL ist '2099-12' und wird als 'kein Verfall' erkannt", () => {
    expect(PSEUDO_VERFALL).toBe("2099-12");
    expect(istOhneVerfall("2099-12")).toBe(true);
    expect(istOhneVerfall("2026-08")).toBe(false);
  });

  it("die drei Chargennummern-Literale stehen in den Produktionsdaten", () => {
    expect([CHARGE_KORREKTUR, CHARGE_INVENTUR, CHARGE_OHNE_VERFALL])
      .toEqual(["Korrektur", "Inventur", "ohne Verfall"]);
  });

  it("ZUSTAENDE traegt die drei Literale in der Reihenfolge des Bestands", () => {
    // Historische ergebnis-JSONs tragen sie bereits; "Defekt" ist der Vertrag
    // der serverseitigen Auswertung an drei Stellen.
    expect(ZUSTAENDE).toEqual(["In Ordnung", "Gebrauchsspuren", "Defekt"]);
    expect(ZUSTAND_DEFEKT).toBe("Defekt");
  });
});

describe("MONAT_REGEX — der EINZIGE Monatsvalidator des Moduls", () => {
  it("nimmt gueltige Monate an", () => {
    for (const gut of ["2026-01", "2026-08", "2026-12", "2099-12"]) {
      expect(MONAT_REGEX.test(gut)).toBe(true);
    }
  });

  it("weist genau die Werte ab, die der laxe Ausdruck durchliess", () => {
    // "2026-00" landete ueber new Date(2026, 0, 0, …) auf dem 31.12.2025,
    // "2026-13" auf dem 31.01.2027 (Analyse, §4.6).
    for (const schlecht of ["2026-00", "2026-13", "2026-8", "26-08", "2026-08-01", ""]) {
      expect(MONAT_REGEX.test(schlecht)).toBe(false);
    }
  });
});

describe("Tagesfelder — Form UND echter Kalendertag", () => {
  it("TAG_REGEX prueft die Form", () => {
    expect(TAG_REGEX.test("2026-02-31")).toBe(true);   // Form ok
    expect(TAG_REGEX.test("2026-2-3")).toBe(false);
  });

  it("istEchterKalendertag faengt ueberrollende Tage", () => {
    expect(istEchterKalendertag("2026-08-03")).toBe(true);
    expect(istEchterKalendertag("2026-02-31")).toBe(false);
    expect(istEchterKalendertag("2024-02-29")).toBe(true);   // Schaltjahr
    expect(istEchterKalendertag("2026-02-29")).toBe(false);
    expect(istEchterKalendertag("2026-13-01")).toBe(false);
  });
});

describe("Enum-Listen", () => {
  it("BUCHUNGSTYPEN traegt 'umlagerung' — der Typ fehlt im Implementierungsplan", () => {
    // Beide Legs einer Verschiebung tragen ihn, damit Bestellvorschlag und
    // Reporting eine interne Verschiebung nicht als Wareneingang oder Verbrauch
    // missdeuten (1:1-Pflicht 15).
    expect(BUCHUNGSTYPEN).toEqual(["zugang", "entnahme", "korrektur", "umlagerung"]);
  });

  it("die uebrigen vier Listen", () => {
    expect([...QUELLE_TYPEN].sort()).toEqual(["oidc", "system", "token"]);
    expect([...LAGERORT_TYPEN].sort()).toEqual(["fahrzeug", "lager"]);
    expect([...GERAETE_TYPEN].sort()).toEqual(["medizin", "objekt"]);
    expect([...TOKEN_ZIEL_TYPEN].sort()).toEqual(["artikel", "fahrzeug"]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/konstanten.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./konstanten"`.

- [ ] **Schritt 3: `_lib/konstanten.ts` schreiben**

```ts
/**
 * Die Werte, die Server Components lesen muessen — §4.15.
 *
 * KEIN "use client" und KEIN Icon-Import in dieser Datei. Die beiden Fallen sind
 * GEGENLAEUFIG und duerfen nicht zusammengelegt werden: ein WERT aus einem
 * Client-Modul kommt in einer Server Component nicht an (Falle 6, HTTP 500), und
 * `@ant-design/icons` in RSC wirft schon beim Import (Falle 7). Wer "use client"
 * setzt, um Falle 7 zu „loesen", verwandelt sie in Falle 6: HTTP 200 mit leerer
 * Map und still falschem Wert. Laut ist besser als still.
 *
 * ZUSTAENDE stand bis zum Port in CheckFlow.tsx:22 — einer Client-Datei.
 */

/** Die feste Lagerort-Zeile. 75 Fundstellen im Alt-Repo; jede Entnahme, Inventurkorrektur,
 *  Aussonderung und Nachfuellung bucht gegen genau diese ID. */
export const HANDLAGER_ID = "handlager";

/** Kodiert „kein Verfall". Auf NULL umgestellt kippen Ampel, Verfall-Liste und die
 *  FEFO-Sortierung (fefo.ts sortiert ueber den String) fuer jede so angelegte Charge. */
export const PSEUDO_VERFALL = "2099-12";
export const istOhneVerfall = (verfall: string): boolean => verfall === PSEUDO_VERFALL;

/** Herkunftshinweise in chargen.chargen_nr — NICHT Bedeutungstraeger. Die Bedeutung
 *  „ohne Verfall" haengt am Verfallswert (§5.3.2). */
export const CHARGE_KORREKTUR = "Korrektur";
export const CHARGE_INVENTUR = "Inventur";
export const CHARGE_OHNE_VERFALL = "ohne Verfall";

/** Entscheidung 2 (b): kein Backfill der Altdaten, aber ab jetzt z.enum() beim Schreiben.
 *  Beim Schreiben streng, beim Anzeigen tolerant (§5.8.2). */
export const ZUSTAENDE = ["In Ordnung", "Gebrauchsspuren", "Defekt"] as const;
export type Zustand = (typeof ZUSTAENDE)[number];
/** Der Vertrag der serverseitigen Auswertung an drei Stellen. Ein unbekannter Altwert
 *  zaehlt NICHT als auffaellig. */
export const ZUSTAND_DEFEKT: Zustand = "Defekt";

/** Entscheidung 6 (a): der EINZIGE Monatsvalidator des Moduls. Der laxe Ausdruck
 *  /^\d{4}-\d{2}$/ aus buchung.ts:17 und bz.ts:83 faellt ersatzlos weg. */
export const MONAT_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Form der zwei Tagesfelder (geraete.mtk_faellig, geraete.ablaufdatum). Die Form allein
 *  genuegt nicht — "2026-02-31" ist formgerecht und kein Kalendertag. */
export const TAG_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Form UND ueberrollfreier Kalendertag. Portiert aus `parseTag`
 * (lagerbuch/src/lib/domain/geraet.ts:16-25): die Alt-App hat am Eingang gar keinen
 * Validator, die Robustheit sitzt im Leser, und `null` bedeutet dort grau statt rot
 * („damit frisch angelegte Geraete keinen Fehlalarm ausloesen"). Diese Toleranz wandert
 * 1:1 mit; ergaenzt wird sie hier um dieselbe Pruefung am EINGANG, damit neue Zeilen
 * den Fall nicht mehr erzeugen. Altzeilen bleiben unberuehrt.
 */
export function istEchterKalendertag(s: string): boolean {
  if (!TAG_REGEX.test(s)) return false;
  const [j, m, t] = s.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

/**
 * Die Enum-Listen fuer die Zod-Seite. Die Drizzle-Seite steht in `_db/schema.ts` —
 * §4.15 fuehrt bewusst beide Orte: der Drizzle-Enum ist ein 1:1-Port des Bestands,
 * diese Listen sind der Eingangsvalidator. `_lib/konstanten.test.ts` behauptet die
 * Mengengleichheit, damit sie nicht auseinanderlaufen. Die REIHENFOLGE darf abweichen
 * — SQLite-`text({enum})` erzeugt keinen CHECK, sie ist im SQL unsichtbar.
 */
export const BUCHUNGSTYPEN = ["zugang", "entnahme", "korrektur", "umlagerung"] as const;
export const QUELLE_TYPEN = ["token", "oidc", "system"] as const;
export const LAGERORT_TYPEN = ["lager", "fahrzeug"] as const;
export const GERAETE_TYPEN = ["medizin", "objekt"] as const;
export const TOKEN_ZIEL_TYPEN = ["fahrzeug", "artikel"] as const;
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/konstanten.test.ts
```

Erwartet: PASS.

- [ ] **Schritt 5: Der Verbots-Scan über beide Ordner**

Anfügen an `src/app/m/lagerbuch/_lib/konstanten.test.ts` — er kostet nichts und fängt genau die
Fehlerklasse, die kein Gate sieht:

```ts
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("_lib und _db tragen weder 'use client' noch einen Icon-Import", () => {
  const wurzel = "src/app/m/lagerbuch";

  function dateien(ordner: string): string[] {
    const p = join(wurzel, ordner);
    if (!existsSync(p)) return [];
    return readdirSync(p, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .map((f) => join(p, f));
  }

  it.each(["_lib", "_db"])("%s ist frei von 'use client'", (ordner) => {
    // Falle 6: eine Server Component bekaeme eine Client-Referenz statt des Wertes,
    // HTTP 500 fuer die ganze Seite. TypeScript ist zufrieden, `build` findet nichts,
    // und Vitest kann es strukturell nicht sehen — dort ist "use client" ein
    // wirkungsloser String. Deshalb dieser Scan.
    const treffer = dateien(ordner).filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8")));
    expect(treffer).toEqual([]);
  });

  it.each(["_lib", "_db"])("%s importiert kein Icon", (ordner) => {
    // Falle 7: der nackte Spezifizierer loest auf CJS auf, das createContext auf
    // Modulebene ruft — der Fehler entsteht BEIM IMPORT und reisst jede Datei mit,
    // die die Konstanten liest.
    const treffer = dateien(ordner).filter((f) =>
      /from\s+["'](@ant-design\/icons|lucide-react)/.test(readFileSync(f, "utf8")));
    expect(treffer).toEqual([]);
  });
});
```

Erwartet: PASS (beide Ordner sind heute sauber). ⚠️ Dieser Scan **wächst mit dem Modul** — er ist ab
jetzt der Wächter für jede Datei, die die späteren Teile unter `_lib/` und `_db/` anlegen.

- [ ] **Schritt 6: Die Mengengleichheit gegen `schema.ts` — VERTAGT auf T7**

`_db/schema.ts` existiert in Welle 1 noch nicht. **T7, Schritt 6** trägt den Block nach. Der Platz
wird hier mit einem Kommentar reserviert, damit er nicht vergessen wird:

```ts
// TODO(T7): Mengengleichheit BUCHUNGSTYPEN/QUELLE_TYPEN/… gegen die Drizzle-Enums
// aus ../_db/schema.ts. Der Block gehoert hierher, nicht in schema.test.ts —
// Eigentuemer der Aussage ist die Zod-Seite (Festlegung F6).
```

⚠️ Das ist der **einzige** `TODO` dieses Plans, er hat einen benannten Einlöser und wird in T7
gestrichen. Ein `TODO` ohne Einlöser wäre ein Planfehler.

- [ ] **Schritt 7: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/konstanten.ts src/app/m/lagerbuch/_lib/konstanten.test.ts
git commit -m "feat(lagerbuch): _lib/konstanten.ts — Sentinels, Enums, EIN Monatsvalidator

Entscheidung 6 (a): MONAT_REGEX ist ab jetzt der einzige Monatsvalidator; der
laxe Ausdruck, ueber den '2026-00' bis zum 31.12.2025 durchlief, faellt weg.
Entscheidung 2 (b): ZUSTAENDE zieht aus der Client-Datei CheckFlow.tsx in ein
Servermodul — dort war es die falsche Seite der Grenze (Falle 6).

Dazu der Quelltext-Scan ueber _lib und _db: kein 'use client', kein
Icon-Import. Beide Fallen sind fuer typecheck, build und Vitest unsichtbar."
```

---

### Task 5: `_lib/suche.ts` — die eine Faltung für beide Hälften

**Files:**
- Create: `src/app/m/lagerbuch/_lib/suche.ts`
- Test: `src/app/m/lagerbuch/_lib/suche.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `export const falte: (s: string) => string`. Zwei Konsumenten, und das ist der ganze
  Zweck: `_db/client.ts` registriert sie als SQLite-Funktion `lb_falte` (T12), und
  `_lib/lesepfade/journal.ts` benutzt sie für die JS-Hälfte (Teil 3).

**Der Befund, den diese vier Zeilen heilen.** Die Journalsuche läuft heute über zwei Hälften mit
**verschiedener** Faltung: der Artikelname wird in JS mit `toLowerCase()` verglichen (unicode-fähig),
der Kommentar in SQL mit `LIKE` (SQLites eingebautes `LIKE` faltet **nur A–Z**). Gemessen gegen
`better-sqlite3` 12.11.1: die Hälften laufen genau dann auseinander, wenn der Begriff einen
Nicht-ASCII-Buchstaben enthält, dessen Groß-/Kleinschreibung vom gespeicherten Text abweicht.
`PÄCKCHEN` findet den Artikel und **verliert jeden Kommentar**, der `Päckchen` normal schreibt —
ohne Rückmeldung, die Seite zeigt einfach weniger Zeilen.

**Warum es keine gespeicherte Lösung gibt.** Jede Heilung, die gespeicherten Text auf `buchungen`
anfasst, ist eine Trigger- und Migrationsfrage: eine normalisierte Spalte bräuchte einen Backfill,
und Backfill heißt `UPDATE buchungen` — das bricht am Append-only-Trigger ab. Eine **generierte**
Spalte scheidet aus, weil SQLite darin keine benutzerdefinierten Funktionen zulässt und das
eingebaute `lower()` ebenfalls nur ASCII faltet. Es bleibt genau ein Weg, der nichts speichert: die
Faltung als benutzerdefinierte SQL-Funktion **zur Abfragezeit**.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/suche.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { falte } from "./suche";

describe("falte — die EINE Faltung beider Suchhaelften", () => {
  it("faltet ASCII", () => {
    expect(falte("Verband")).toBe("verband");
  });

  it("faltet Umlaute — genau die Stelle, an der SQLites LIKE aussteigt", () => {
    // SQLites eingebautes LIKE faltet nur A–Z: 'PÄCKCHEN' LIKE '%päckchen%' ist 0.
    // Beide Haelften benutzen ab jetzt DIESE Funktion, also gibt es die Divergenz
    // nicht mehr.
    expect(falte("PÄCKCHEN")).toBe("päckchen");
    expect(falte("Größe")).toBe("größe");
  });

  it("faltet NICHT ss/ß — das ist eine gemeinsame Luecke, keine Divergenz", () => {
    // Gemessen: 'Straße' LIKE '%STRASSE%' → 0, und "STRASSE".toLowerCase() ist
    // "strasse", was in "straße" nicht vorkommt. Eine Normalisierung, die ß auf ss
    // faltet, erzeugt Treffer, die niemand gesucht hat („Massen"/„Maßen") — sie ist
    // teurer als das Problem und bleibt bewusst aus.
    expect(falte("STRASSE")).toBe("strasse");
    expect(falte("Straße")).toBe("straße");
    expect(falte("Straße")).not.toBe(falte("STRASSE"));
  });

  it("ist idempotent", () => {
    expect(falte(falte("PÄCKCHEN"))).toBe(falte("PÄCKCHEN"));
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/suche.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./suche"`.

- [ ] **Schritt 3: `_lib/suche.ts` schreiben**

```ts
/**
 * Die EINE Faltung, die beide Haelften der Journalsuche benutzen — §5.13.2.
 *
 * KEIN "use client".
 *
 * Die JS-Haelfte (Artikelname) filtert damit im Speicher; die SQL-Haelfte
 * (buchungen.kommentar) ruft dieselbe Funktion als benutzerdefinierte
 * SQLite-Funktion `lb_falte`, registriert im modul-eigenen Opener `_db/client.ts`.
 * Genau daran haengt, dass lagerbuch NICHT `getModuleDb` benutzt.
 *
 * WARUM ZUR ABFRAGEZEIT UND NICHT GESPEICHERT: eine normalisierte Spalte braeuchte
 * einen Backfill, und Backfill heisst `UPDATE buchungen` — das bricht am
 * Append-only-Trigger ab. Eine generierte Spalte scheidet aus, weil SQLite darin
 * keine benutzerdefinierten Funktionen zulaesst und das eingebaute `lower()`
 * ebenfalls nur ASCII faltet.
 *
 * ß/ss wird bewusst NICHT geheilt: das ist eine gemeinsame Luecke beider Haelften,
 * keine Divergenz zwischen ihnen.
 */
export const falte = (s: string): string => s.toLowerCase();
```

- [ ] **Schritt 4: Test grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/suche.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/suche.ts src/app/m/lagerbuch/_lib/suche.test.ts
git commit -m "feat(lagerbuch): _lib/suche.ts — eine Faltung fuer JS- und SQL-Haelfte

Die Journalsuche faltet heute in zwei Haelften verschieden: JS unicode-faehig,
SQLites LIKE nur A–Z. 'PÄCKCHEN' findet den Artikel und verliert jeden
Kommentar, der 'Päckchen' normal schreibt — ohne Rueckmeldung. Beide Haelften
benutzen ab jetzt diese Funktion; die SQL-Seite ueber die registrierte
SQLite-Funktion lb_falte (_db/client.ts)."
```

---

### Task 6: `src/app/m/lagerbuch/layout.tsx` — die eine erlaubte Ausnahme

**Files:**
- Create: `src/app/m/lagerbuch/layout.tsx`

**Interfaces:**
- Consumes: nichts.
- Produces: den Manifest-Verweis, den die fünf PWA-Route-Handler aus Teil 4 (§7.10.2) bewerben.
  ⚠️ Bis Teil 4 zeigt der Verweis auf einen Pfad, der 404 antwortet. Das ist gewollt und richtig:
  A muss vor G stehen, weil ein Manifest-Handler ohne Layout-Verweis von niemandem gefunden würde.

**Warum es diese Datei überhaupt gibt.** §2.8 sagt „kein Modul-Layout", und diese Datei ist die
**eine** Ausnahme. Ein *Riegel* hier wäre falsch: er umschlösse weder `/t/<code>` (Route Handler
werden von keinem `layout.tsx` umschlossen, Falle 55) noch könnte er zwischen Helfer- und
Verwaltungsklasse unterscheiden. Ein *Metadaten-Export* hier ist dagegen zwingend — steht der
Manifest-Verweis im Root-Layout, bewirbt **jeder** Suite-Host eine Lagerbuch-PWA (Falle 56).

⚠️ **Was diese Datei NICHT enthalten darf, und der Fehler ist ein 96px-Überlauf, den `pnpm build`
nicht findet:** keine `Shell`, keinen Rahmen, keinen Riegel, keinen `viewport`-Export (den erbt sie
von der Suite, §7.7.2). Ein Layout ohne Gruppenklammer ist Vorfahr **aller** Kinder — auch des
gesamten, bewusst antd-freien Helfer-Zweigs und der Druck-Gruppe.

- [ ] **Schritt 1: Die Datei schreiben**

```tsx
import type { Metadata } from "next";

/**
 * DIE EINE AUSNAHME ZU §2.8s REGEL „kein Modul-Layout".
 *
 * Diese Datei traegt AUSSCHLIESSLICH den Manifest-Verweis und rendert {children}.
 *
 * KEINE Shell, KEIN Rahmen, KEIN Riegel, KEIN viewport-Export.
 *  - Ein Riegel waere hier falsch: er umschloesse weder /t/<code> (Route Handler
 *    haben kein Layout ueber sich, Falle 55) noch koennte er zwischen Helfer- und
 *    Verwaltungsklasse unterscheiden.
 *  - Eine Shell waere hier falsch: ein Layout ohne Gruppenklammer ist Vorfahr
 *    ALLER Kinder — auch des bewusst antd-freien Helfer-Zweigs und der Gruppe
 *    (druck). Der Fehler ist ein 96px-Ueberlauf, und `pnpm build` findet ihn nicht.
 *
 * Der Manifest-Verweis MUSS dagegen hier stehen und nicht im Root-Layout: dort
 * bewuerbe JEDER Suite-Host eine Lagerbuch-PWA (Falle 56).
 *
 * Die fuenf Handler dahinter (manifest.webmanifest, pwa-icon.svg, icon-192.png,
 * icon-512.png, icon-maskable-512.png) entstehen in §7.10.2. Bis dahin antwortet
 * der Pfad 404 — die Reihenfolge ist Absicht, nicht Versehen.
 */
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
};

export default function LagerbuchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Schritt 2: Prüfen, dass nichts Verbotenes drinsteht**

```bash
grep -nE "Shell|use client|viewport|require(Lagerbuch|Helfer)" src/app/m/lagerbuch/layout.tsx
```

Erwartet: **keine Ausgabe**. Ein Treffer ist ein Baufehler, kein Geschmack.

- [ ] **Schritt 3: Gates**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Erwartet: grün. Es gibt noch keine `page.tsx` unter dem Layout — Next legt daraus keine Route an,
und das ist richtig.

- [ ] **Schritt 4: Commit**

```bash
git add src/app/m/lagerbuch/layout.tsx
git commit -m "feat(lagerbuch): Modul-Layout, ausschliesslich metadata.manifest

Die eine Ausnahme zur Regel 'kein Modul-Layout' (§2.8). Ein Riegel waere hier
falsch — er umschloesse /t/<code> nicht und koennte Helfer- von
Verwaltungsklasse nicht unterscheiden. Der Manifest-Verweis MUSS hier stehen:
im Root-Layout bewuerbe ihn jeder Suite-Host (Falle 56).

Keine Shell, kein Rahmen, kein viewport-Export."
```

---

**Gate Welle 1.** Alle sechs Tasks sind eingecheckt.

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

## Welle 2 — Das Zielschema (1 Task)

Diese Welle hat genau einen Task, weil `schema.ts` die Vorlage ist, aus der `0000` generiert wird —
jede Parallelität hier erzeugt zwei Wahrheiten über dieselben 16 Tabellen.

---

### Task 7: `_db/schema.ts` und `_db/drizzle.config.ts` — 16 Tabellen, vier benannte Abweichungen

**Files:**
- Create: `src/app/m/lagerbuch/_db/schema.ts`
- Create: `src/app/m/lagerbuch/_db/drizzle.config.ts`
- Modify: `src/app/m/lagerbuch/_lib/konstanten.test.ts` (der vertagte Block aus T4, Schritt 6)

**Interfaces:**
- Consumes: `_lib/konstanten.ts` (T4) — **nur für den Test**, nicht für das Schema selbst (F6).
- Produces: die 16 Drizzle-Tabellen und `newId`. Konsumiert von T8 (Generierung), T9, T11, T12, T13
  und von jedem Lese- und Schreibpfad ab Teil 3:
  ```ts
  export const newId: () => string;
  export const lagerorte, fahrzeugTemplates, templatePositionen, artikel, chargen,
    lagerortVerfall, buchungen, sollPositionen, tokens, checks, users,
    bzGeraete, bzKontrollen, o2Flaschen, o2Messungen, geraete;
  ```

**Was „1:1" hier heißt.** Spaltennamen, Typen, Nullbarkeit, Defaults und **Indexnamen** werden
wörtlich übernommen. Es gibt genau **vier** benannte Abweichungen:

| # | Abweichung | Wirkung auf die Datenbank | Wirkung auf den Import |
|---|---|---|---|
| S1 | `checks.quelle_typ` bekommt den Drizzle-Enum `["token","oidc","system"]` | **keine** — SQLite-`text({enum})` erzeugt keinen CHECK | keine |
| S2 | Zwei zusätzliche Trigger auf `bz_kontrollen`, **ausdrücklich keine** auf `o2_messungen` | `UPDATE`/`DELETE` auf `bz_kontrollen` brechen ab | keiner (T8) |
| S3 | **Vier** zusätzliche Indizes | Schreibkosten, kein Verhalten | keiner |
| S4 | Die Handlager-Zeile wird eine Migrationszeile statt eines Boot-Schritts | eine Zeile in `lagerorte` nach der Migration | `INSERT OR IGNORE`, kollisionsfrei (T8) |

**Was ausdrücklich NICHT abweicht** — und wo der Aufräumreflex Daten kostet:
- **Kein `UNIQUE` auf `(artikel_id, chargen_nr, verfall)`.** Ob die produktive Datenbank solche Paare
  enthält, **steht nicht im Repo**; ein `UNIQUE` in der Migration wäre ein Import, der an Daten
  scheitert, die niemand gesehen hat. Zwei Lieferungen mit derselben aufgedruckten Chargennummer
  sind ein realer Vorgang. Die unbestimmte Entnahmereihenfolge löst §5.3.1 über einen
  **Sortier-Tiebreaker** (Teil 3), ohne Migration.
- **Kein `CHECK` auf die drei Monats- und zwei Tagesfelder.** SQLite kann Constraints nicht
  nachträglich hinzufügen — es bräuchte den Neubau von `chargen`, das per Fremdschlüssel von
  `buchungen` referenziert wird. Und er schützt das Falsche: empfindlich ist `verfallStatus`, nicht
  die FEFO-Sortierung.
- **Keine `NOT NULL`-Verschärfung, keine Spalte gestrichen** — auch nicht die belegt tote
  `tokens.scope_lagerort_id`. „Kein Produktionspfad schreibt sie" ist eine **Code**-Aussage; die
  produktive Tabelle steht nicht im Repo, und eine weggelassene Spalte macht einen vorhandenen Wert
  unwiederbringlich.
- **Kein Feld `gezaehlt` im Check-Ergebnis** und damit **keine Formatversion 3** in `checks.ergebnis`.

⚠️ **Die 1000er-Falle ist hier scharf und paritätsgrün.** `m/qr/_db/schema.ts:19-20` benutzt
`timestamp_ms`; ein Copy-Paste von dort ist der wahrscheinlichste Weg in den Faktor-1000-Fehler. Alle
16 Zeitspalten sind `{ mode: "timestamp" }`, also UNIX-**Sekunden**.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Der eigentliche Schema-Beweis ist `_db/migrations.test.ts` (T9) und läuft gegen die abgespielten
Migrationen. Hier gehört nur die Aussage her, die **ohne** Migration prüfbar ist und die T4 vertagt
hat: die Mengengleichheit der Enums. In `src/app/m/lagerbuch/_lib/konstanten.test.ts` den
`TODO(T7)`-Kommentar **löschen** und ersetzen durch:

```ts
import { getTableColumns } from "drizzle-orm";
import { buchungen, checks, lagerorte, geraete, tokens } from "../_db/schema";

/**
 * §4.15 fuehrt die Enum-Listen bewusst an ZWEI Orten: Drizzle-Enum in _db/schema.ts
 * (1:1-Port des Bestands) und Zod-Liste hier (Eingangsvalidator). Dieser Block haelt
 * sie zusammen. Die REIHENFOLGE darf abweichen — SQLite-`text({enum})` erzeugt keinen
 * CHECK, sie ist im erzeugten SQL unsichtbar (nachpruefbar an
 * lagerbuch/drizzle/0000_brief_zodiak.sql:20, wo buchungen.quelle_typ MIT Enum als
 * nacktes `text NOT NULL` steht).
 */
const enumWerte = (spalte: unknown): string[] =>
  [...((spalte as { enumValues?: string[] }).enumValues ?? [])].sort();

describe("Enum-Listen: Zod-Seite und Drizzle-Seite sind mengengleich", () => {
  it("BUCHUNGSTYPEN", () => {
    expect(enumWerte(getTableColumns(buchungen).typ)).toEqual([...BUCHUNGSTYPEN].sort());
  });
  it("QUELLE_TYPEN — buchungen und checks (checks ist die Abweichung S1)", () => {
    expect(enumWerte(getTableColumns(buchungen).quelleTyp)).toEqual([...QUELLE_TYPEN].sort());
    expect(enumWerte(getTableColumns(checks).quelleTyp)).toEqual([...QUELLE_TYPEN].sort());
  });
  it("LAGERORT_TYPEN", () => {
    expect(enumWerte(getTableColumns(lagerorte).typ)).toEqual([...LAGERORT_TYPEN].sort());
  });
  it("GERAETE_TYPEN", () => {
    expect(enumWerte(getTableColumns(geraete).typ)).toEqual([...GERAETE_TYPEN].sort());
  });
  it("TOKEN_ZIEL_TYPEN", () => {
    expect(enumWerte(getTableColumns(tokens).zielTyp)).toEqual([...TOKEN_ZIEL_TYPEN].sort());
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/konstanten.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "../_db/schema"`.

- [ ] **Schritt 3: `_db/schema.ts` schreiben — Teil 1 von 3, die Stammtabellen**

Anlegen als `src/app/m/lagerbuch/_db/schema.ts`:

```ts
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

/**
 * Das Zielschema von `lagerbuch` — 16 Tabellen, 1:1 aus
 * `lagerbuch/src/db/schema.ts` @ ca04eb1, mit vier benannten Abweichungen
 * (S1–S4, §4.1).
 *
 * KEIN "use client", KEIN Icon-Import (Fallen 6 und 7).
 *
 * ZEIT IST UNIX-SEKUNDEN: jede Zeitspalte traegt `{ mode: "timestamp" }`, NIEMALS
 * `timestamp_ms`. m/qr/_db/schema.ts:19-20 macht es anders, und ein Copy-Paste von
 * dort ist der wahrscheinlichste Weg in den Faktor-1000-Fehler. Er waere
 * PARITAETSGRUEN — beide Arme des Paritaetschecks fuehren dieselbe Umrechnung —,
 * waehrend das ganze Journal um Jahrtausende umdatiert ist (1:1-Pflicht 7).
 * `_db/migrations.test.ts` prueft deshalb den ROHEN Spaltenwert auf zehn Stellen.
 *
 * KEINE ID WIRD BEIM IMPORT NEU VERGEBEN, fuer keine der 16 Tabellen:
 * `artikel.id` steckt als QR auf gedruckten Regaletiketten und existiert dort
 * ausschliesslich als Pixelmuster (das Etikett traegt keinen abtippbaren
 * Identifikator), `soll_positionen.id` steht in historischen checks.ergebnis-JSONs,
 * `tokens.id` im jose-Cookie jeder laufenden Helfer-Sitzung, und `buchungen.id` ist
 * der Tiebreaker jeder deterministischen Sortierung.
 */

/** nanoid() mit den Vorgabewerten: 21 Zeichen, 64er-Alphabet inkl. `-` und `_`,
 *  case-sensitiv. 1:1 aus `lagerbuch/src/db/schema.ts:4`. Es gibt bewusst KEINEN
 *  Validator der Form /^[a-z0-9]+$/ — er gaebe fuer rund jeden 32. Zeichenplatz ein
 *  stilles 404. Der Kollisionsschutz ist der Primaerschluessel selbst. */
export const newId = () => nanoid();

export const lagerorte = sqliteTable("lagerorte", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  typ: text("typ", { enum: ["lager", "fahrzeug"] }).notNull(),
  kennung: text("kennung"),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  // Optionale Vorlage, an der ein Fahrzeug haengt. null = individuell gepackt.
  // DER FREMDSCHLUESSEL ZEIGT „RUECKWAERTS" — lagerorte ist die aeltere und
  // zentralere Tabelle. Kein Fehler, aber er bestimmt die Einfuegereihenfolge des
  // Imports (§4.14): fahrzeug_templates VOR lagerorte.
  templateId: text("template_id").references(() => fahrzeugTemplates.id),
});

export const fahrzeugTemplates = sqliteTable("fahrzeug_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const templatePositionen = sqliteTable(
  "template_positionen",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id").notNull().references(() => fahrzeugTemplates.id),
    fachLabel: text("fach_label").notNull(),
    sort: integer("sort").notNull().default(0),
    // DIESER FK IST DER, DEN DER LOESCHPFAD HEUTE UEBERSIEHT: `pruefeArtikel`
    // zaehlt buchungen, chargen und soll_positionen — nicht template_positionen.
    // Ein Artikel, der nur in einer Vorlage steht, meldet loeschbar: true, und
    // db.delete(artikel) wirft FOREIGN KEY constraint failed (§5.21, Teil 3).
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    soll: integer("soll").notNull(),
  },
  (t) => [index("idx_template_pos_template").on(t.templateId)],
);

export const artikel = sqliteTable("artikel", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  einheit: text("einheit").notNull(),   // freier String ("Stk.", "Pkg.") — KEIN Enum
  fach: text("fach").notNull(),
  mindestbestand: integer("mindestbestand").notNull().default(0),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  // UNIX-Sekunden. WIRD BEI JEDEM ZUGANG GENULLT (buchung.ts:42) — der vorherige
  // Wert ist danach unwiederbringlich weg und NICHT rekonstruierbar (§5.5).
  bestelltAt: integer("bestellt_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const chargen = sqliteTable(
  "chargen",
  {
    id: text("id").primaryKey(),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    chargenNr: text("chargen_nr").notNull(),
    // "YYYY-MM", Ablauf = LETZTER TAG des Monats. "2099-12" ist der Sentinel fuer
    // „kein Verfall" (_lib/konstanten.ts). Auf NULL umgestellt kippen Ampel,
    // Verfall-Liste und FEFO-Sortierung fuer jede so angelegte Charge.
    verfall: text("verfall").notNull(),
    // Tiebreaker fuer „juengste Charge" UND Zweitsortierung der FEFO-Reihenfolge.
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  // KEIN uniqueIndex auf (artikel_id, chargen_nr, verfall) — siehe Kopfkommentar
  // des Tasks. Der Schaden ist eng (gleicher Verfall ⇒ gleiche Ampel, gleiche
  // FEFO-Prioritaet), und die unbestimmte Reihenfolge loest §5.3.1 ohne Migration.
  (t) => [index("idx_chargen_artikel_verfall").on(t.artikelId, t.verfall)],
);

/**
 * CHARGEN TRAEGT KEINE MENGE. Der Rest einer Charge ist SUM(buchungen.menge) je
 * charge_id, LAGERORT-GESCOPED. Die Scoping-Zeile ist kritisch: ohne sie zaehlte
 * nach der ersten Fahrzeugbuchung derselben Charge der Fahrzeugbestand als
 * Handlager-Rest mit → Phantombestand und falsche FEFO-Verteilung. Wer die
 * N+1-Schleife durch EINE GROUP-BY-Abfrage ersetzt (Entscheidung 7 b, §5.2.4),
 * muss `lagerort_id` im Praedikat behalten.
 */

export const sollPositionen = sqliteTable(
  "soll_positionen",
  {
    // Steht in historischen checks.ergebnis-JSONs (check.ts:102) — nicht neu vergeben.
    id: text("id").primaryKey(),
    fahrzeugId: text("fahrzeug_id").notNull().references(() => lagerorte.id),
    fachLabel: text("fach_label").notNull(),
    sort: integer("sort").notNull().default(0),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    soll: integer("soll").notNull(),
    // null = manuell/individuell; gesetzt = aus der Vorlage materialisiert.
    templatePositionId: text("template_position_id").references(() => templatePositionen.id),
    // Manuell abweichend ⇒ der Sync laesst die Zeile in Ruhe.
    ueberschrieben: integer("ueberschrieben", { mode: "boolean" }).notNull().default(false),
    // GRABSTEIN: zaehlt nirgends als Soll, verhindert aber, dass der Sync die
    // Vorlagen-Position wieder anlegt. Wer `entfernt` als „soft delete"
    // missversteht und die Zeilen wegfiltert BEVOR der Sync laeuft, legt sie beim
    // naechsten Sync wieder an (§5.7).
    entfernt: integer("entfernt", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("idx_soll_fahrzeug").on(t.fahrzeugId)],
);

export const geraete = sqliteTable(
  "geraete",
  {
    id: text("id").primaryKey(),
    typ: text("typ", { enum: ["medizin", "objekt"] }).notNull(),
    // BYTE-EXAKT, ohne Bereinigung. Die Werte stehen physisch am Geraet, oft
    // herstellergedruckt (EAN_13, EAN_8, ITF) — sie werden nicht normalisiert,
    // nicht getrimmt, nicht grossgeschrieben. nullable + unique: SQLite erlaubt
    // mehrere NULL im UNIQUE.
    // ⚠️ Die Eindeutigkeit UEBER geraete und bz_geraete hinweg lebt ausschliesslich
    // in einer Anwendungspruefung (`pruefeBarcodeFrei`), nicht im Schema.
    barcode: text("barcode").unique(),
    name: text("name").notNull(),
    // DIE EINZIGE ZUORDNUNG — kein Soll-/Vorlagen-Apparat wie bei Artikeln.
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    anmerkung: text("anmerkung"),
    mtkFaellig: text("mtk_faellig"),        // "YYYY-MM-DD", nur typ='medizin'
    beschreibung: text("beschreibung"),     // nur typ='objekt'
    ablaufdatum: text("ablaufdatum"),       // "YYYY-MM-DD", nur typ='objekt'
    aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_geraete_lagerort").on(t.lagerortId)],
);
```

- [ ] **Schritt 4: `_db/schema.ts` — Teil 2 von 3, Journal, Checks, Verfall**

An dieselbe Datei anfügen:

```ts
export const buchungen = sqliteTable(
  "buchungen",
  {
    // Zeitlich bedeutungslos, aber DETERMINISTISCH — der Tiebreaker, der aus der
    // Sekundengranularitaet eine totale Ordnung macht (§4.9, §5.14.4).
    id: text("id").primaryKey(),
    // UNIX-Sekunden. SEKUNDENGRANULARITAET IST HIER FACHLICH SICHTBAR: ein
    // Check-Abschluss schreibt Abgleich, Umlagerung und Messungen in einem Rutsch,
    // alle Zeilen teilen dieselbe Sekunde (Falle 3).
    ts: integer("ts", { mode: "timestamp" }).notNull(),
    // `umlagerung` IST TRAGEND und fehlt im Implementierungsplan. Beide Legs einer
    // Verschiebung tragen ihn, damit Bestellvorschlag und Reporting eine interne
    // Verschiebung nicht als Wareneingang oder Verbrauch missdeuten. Ein
    // Enum-Entwurf „nach Plan" verliert ihn — und mit ihm die Netto-Null-
    // Eigenschaft jeder Umlagerung (1:1-Pflicht 15).
    typ: text("typ", { enum: ["zugang", "entnahme", "korrektur", "umlagerung"] }).notNull(),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    // NOT NULL — jede Buchung hat eine Charge, notfalls eine Dummy-Charge.
    chargeId: text("charge_id").notNull().references(() => chargen.id),
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    menge: integer("menge").notNull(),   // VORZEICHENBEHAFTET: Zugang +, Entnahme −
    quelleTyp: text("quelle_typ", { enum: ["token", "oidc", "system"] }).notNull(),
    // bei token der CODE-KLARTEXT "NNN-NNN", bei oidc der Pocket-ID-`sub`.
    // Ein umkodierter Token-Code macht das gesamte historische Journal namenlos.
    quelleId: text("quelle_id").notNull(),
    // DIE EINZIGE VERBINDUNG zwischen Journalzeile und ausloesendem Vorgang — es
    // gibt KEINEN Fremdschluessel auf `checks`. Die drei Praefixe `check:<id>`,
    // `inventur:<id>`, `entnahme-ziel:<lagerortId>` stehen in historischen Zeilen
    // und sind damit Vertrag (1:1-Pflicht 12).
    referenz: text("referenz"),
    // Das Suchfeld des Journals durchsucht ihn per SQL-LIKE ueber `lb_falte` (§5.13.2).
    kommentar: text("kommentar"),
  },
  (t) => [
    index("idx_buchungen_artikel").on(t.artikelId),
    index("idx_buchungen_charge").on(t.chargeId),
    // Praefix-redundant zu idx_buchungen_ts_id und BLEIBT TROTZDEM STEHEN: die Regel
    // „kein Index wird entfernt" (§4.14) ist die Bedingung dafuer, dass der
    // Schema-Diff aus §4.3 einen abschliessenden Erwartungswert hat.
    index("idx_buchungen_ts").on(t.ts),
    // S3, neu: deterministische Journalsortierung ORDER BY ts DESC, id DESC. Macht
    // ein spaeteres Keyset-Nachladen zur Query-Aenderung statt zur Migration.
    index("idx_buchungen_ts_id").on(t.ts, t.id),
    // S3, neu: traegt bestandJeArtikel(db, lagerortId) und restJeCharge (§5.2.4) —
    // ein Lagerort, alle Artikel. Ohne ihn ist das ein Full-Scan.
    index("idx_buchungen_lagerort_artikel").on(t.lagerortId, t.artikelId),
    // S3, neu: deckend fuer restJeChargeFuerArtikel(db, artikelId, lagerortId) —
    // die Schreibseite (FEFO, Korrektur), die mit artikel_id FUEHREND filtert.
    // ⚠️ NICHT redundant zum vorigen: sie unterscheiden sich in der fuehrenden
    // Spalte, und genau daran entscheidet SQLite, ob ein Index fuer eine
    // WHERE-Klausel taugt.
    index("idx_buchungen_artikel_lagerort_charge").on(t.artikelId, t.lagerortId, t.chargeId),
  ],
);

export const checks = sqliteTable(
  "checks",
  {
    id: text("id").primaryKey(),   // steckt als `check:<id>` in buchungen.referenz
    fahrzeugId: text("fahrzeug_id").notNull().references(() => lagerorte.id),
    // S1: bekommt den Drizzle-Enum. Wirkung auf die Datenbank: KEINE —
    // SQLite-`text({enum})` erzeugt keinen CHECK.
    quelleTyp: text("quelle_typ", { enum: ["token", "oidc", "system"] }).notNull(),
    quelleId: text("quelle_id").notNull(),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    // NULL = offener Check. Heute nie erzeugt (check.ts schreibt startedAt und
    // completedAt in EINEM Insert), aber das Schema sieht die Bauform ausdruecklich
    // vor — GENAU DESHALB bekommt `checks` keinen UPDATE-Trigger (§4.4).
    completedAt: integer("completed_at", { mode: "timestamp" }),
    // JSON-String, ZWEI INKOMPATIBLE FORMATE, beide bleiben lesbar (§4.10):
    //   V1 = Array je Element { fehlt?, gebucht? }, erkannt an Array.isArray
    //   V2 = Objekt { positionen, artikel, geraete, flaschen, verfall }
    // Feldnamen im V2-Format sind NICHT umbenennbar — sonst wird jede historische
    // Auswertung stumm 0.
    ergebnis: text("ergebnis"),
  },
  // S3, neu: checkHistorie filtert nach fahrzeug_id und sortiert nach completed_at.
  // `checks` hat heute KEINEN EINZIGEN Index ausser dem Primaerschluessel.
  (t) => [index("idx_checks_fahrzeug_completed").on(t.fahrzeugId, t.completedAt)],
);

/**
 * Die Kompensation, die man beim Aufraeumen zerstoert (§4.11).
 *
 * Bei diff > 0 waehlt `korrekturAufLagerort` die JUENGSTE Charge des Artikels OHNE
 * JEDEN LAGERORTBEZUG und legt notfalls eine Dummy-Charge "Korrektur"/"2099-12" an.
 * Der Fahrzeug-Check bucht Fahrzeugbestand also auf eine Charge, die nie im Fahrzeug
 * lag. Fuer die Frage „wann laeuft das Zeug im Fahrzeug ab?" zaehlt nur, was auf der
 * Packung steht — und das steht HIER.
 *
 * ⚠️ WER DAS VERFALL-FELD IM ZAEHL-SCHRITT BEIM ANTD-NEUBAU ALS REDUNDANT STREICHT
 * („die Charge hat doch einen Verfall"), ZERSTOERT DIESE KOMPENSATION LAUTLOS. Die
 * Fahrzeug-Verfallsampel haengt danach an einer geratenen Charge, und kein Gate wird
 * rot (Falle 9).
 *
 * KEIN Trigger: die Tabelle ist Ist-Zustand, kein Nachweis. Der Upsert ueberschreibt,
 * ein leerer Wert LOESCHT die Zeile.
 */
export const lagerortVerfall = sqliteTable(
  "lagerort_verfall",
  {
    id: text("id").primaryKey(),
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    verfall: text("verfall").notNull(),   // "YYYY-MM", streng ueber MONAT_REGEX
    erfasstAt: integer("erfasst_at", { mode: "timestamp" }).notNull(),
    quelleTyp: text("quelle_typ", { enum: ["token", "oidc", "system"] }).notNull(),
    quelleId: text("quelle_id").notNull(),
  },
  (t) => [uniqueIndex("idx_lagerort_verfall_ort_artikel").on(t.lagerortId, t.artikelId)],
);
```

- [ ] **Schritt 5: `_db/schema.ts` — Teil 3 von 3, Logbücher, Tokens, Users**

An dieselbe Datei anfügen:

```ts
export const bzGeraete = sqliteTable(
  "bz_geraete",
  {
    id: text("id").primaryKey(),
    // byte-exakt; kreuz-eindeutig mit geraete.barcode NUR per Anwendungspruefung.
    barcode: text("barcode").unique(),
    name: text("name").notNull(),
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    streifenLot: text("streifen_lot"),
    level1Label: text("level1_label"),
    level1Min: integer("level1_min"),     // Referenzbereich, bar-frei (reine Zahl)
    level1Max: integer("level1_max"),
    level2Label: text("level2_label"),
    level2Min: integer("level2_min"),
    level2Max: integer("level2_max"),
    aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_bz_geraete_lagerort").on(t.lagerortId)],
);

/**
 * MIT TRIGGERN (S2, in 0002_bz_kontrollen_append_only.sql).
 *
 * Entscheidung 5 faellt auf (c): Trigger auf bz_kontrollen, NICHT auf o2_messungen.
 * Die Tabelle ist ein Medizinprodukte-Nachweis; die Append-only-Zusage steht heute
 * nur als Kommentar. Geprueft, dass nichts bricht: im gesamten Alt-Repo gibt es
 * null Treffer fuer delete(bzKontrollen)/update(bzKontrollen), und der Hard-Delete
 * eines BZ-Geraets ist bereits gesperrt, sobald eine Kontrolle existiert.
 */
export const bzKontrollen = sqliteTable(
  "bz_kontrollen",
  {
    id: text("id").primaryKey(),
    geraetId: text("geraet_id").notNull().references(() => bzGeraete.id),
    ts: integer("ts", { mode: "timestamp" }).notNull(),
    quelleTyp: text("quelle_typ", { enum: ["oidc", "token", "system"] }).notNull(),
    quelleId: text("quelle_id").notNull(),
    level1Wert: integer("level1_wert"),
    level1ImBereich: integer("level1_im_bereich", { mode: "boolean" }),
    level2Wert: integer("level2_wert"),
    level2ImBereich: integer("level2_im_bereich", { mode: "boolean" }),
    kompresseVerfall: text("kompresse_verfall"),   // "YYYY-MM"
    sticks: integer("sticks").notNull().default(0),
    lanzetten: integer("lanzetten").notNull().default(0),
    batterieGewechselt: integer("batterie_gewechselt", { mode: "boolean" }).notNull().default(false),
    kommentar: text("kommentar"),
    bestanden: integer("bestanden", { mode: "boolean" }).notNull(),
    // ROHER JSON-STRING — NICHT RE-SERIALISIEREN. Er entsteht als JSON.stringify
    // ueber sieben Schluessel in DIESER Reihenfolge: streifenLot, level1Label,
    // level1Min, level1Max, level2Label, level2Min, level2Max. Ein Import, der ihn
    // parst und neu serialisiert, VERAENDERT EINEN NACHWEIS — Schluesselreihenfolge
    // und Zahlenformat sind nicht garantiert stabil. Der Wert wandert byte-fuer-byte.
    // Der Paritaetscheck faengt das nur, wenn er den Rohwert vergleicht.
    // ⚠️ Nachgeprueft: die Spalte wird heute GESCHRIEBEN und NIRGENDS GELESEN;
    // §5.11 macht sie sichtbar, statt sie zu streichen.
    refSnapshot: text("ref_snapshot"),
  },
  (t) => [index("idx_bz_kontrollen_geraet_ts").on(t.geraetId, t.ts)],
);

export const o2Flaschen = sqliteTable(
  "o2_flaschen",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    groesseLiter: integer("groesse_liter"),
    // bar; Bezugsgroesse der Fuellstandsampel. Wandert zusaetzlich als Snapshot ins
    // Check-Ergebnis, damit der Fuellstand rekonstruierbar bleibt, wenn die Flasche
    // umkonfiguriert oder geloescht wird. Fehlt der Snapshot in einem Altcheck, wird
    // der Wert NICHT geraten (§5.12 ersetzt den heutigen ?? 200-Rueckfall).
    nennfuelldruckBar: integer("nennfuelldruck_bar").notNull().default(200),
    aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_o2_flaschen_lagerort").on(t.lagerortId)],
);

/**
 * OHNE TRIGGER — und das ist entschieden, nicht vergessen (Entscheidung 5 c).
 *
 * Der Sauerstoff-Schritt des Fahrzeug-Checks ist auf den Nennfuelldruck VORBELEGT,
 * und beim Abschluss werden ausnahmslos ALLE Flaschen des Standorts gesendet. Wer
 * den Schritt durchklickt, erzeugt einen positiv aussehenden, fachlich wertlosen
 * Messwert. Eine solche Zeile faellt in keinen der zwei Zweige aus §5.12 („auffaellig"
 * / „nicht bewertbar"): sie sieht plausibel aus und zaehlt als bewertet. Der Entwurf
 * erzeugt also selbst den Bedarf an Loeschbarkeit, den ein Trigger hier wegnaehme.
 *
 * `_db/append-only.test.ts` behauptet die Gegenprobe ausdruecklich — ohne sie ist
 * der Unterschied zwischen „bewusst offen gelassen" und „vergessen" nicht lesbar.
 */
export const o2Messungen = sqliteTable(
  "o2_messungen",
  {
    id: text("id").primaryKey(),
    flascheId: text("flasche_id").notNull().references(() => o2Flaschen.id),
    ts: integer("ts", { mode: "timestamp" }).notNull(),
    druckBar: integer("druck_bar").notNull(),
    quelleTyp: text("quelle_typ", { enum: ["oidc", "token", "system"] }).notNull(),
    quelleId: text("quelle_id").notNull(),
    kommentar: text("kommentar"),
  },
  (t) => [index("idx_o2_messungen_flasche_ts").on(t.flascheId, t.ts)],
);

export const tokens = sqliteTable("tokens", {
  // Steckt im jose-Cookie JEDER laufenden Helfer-Sitzung — nicht neu vergeben.
  id: text("id").primaryKey(),
  // "NNN-NNN", sechs Ziffern MIT Bindestrich. Der Bindestrich ist Teil des
  // gespeicherten Werts, nicht der Anzeige; die Suche ist exakt. Der Code ist
  // zugleich QR-Nutzlast, Gate-Eingabe UND Anzeigeschluessel im Journal — er darf
  // beim Import unter keinen Umstaenden umkodiert oder normalisiert werden.
  code: text("code").notNull().unique(),
  // Der Anzeigename im Journal — der Code allein sagt niemandem etwas.
  label: text("label").notNull(),
  /**
   * TOTE SPALTE, 1:1 ERHALTEN. Belegt: createToken schreibt sie nicht, redeemToken
   * liest sie nicht, einziger Leser im ganzen src/ ist ein Loeschzaehler, der
   * dauerhaft auf 0 steht. Ein nicht zurueckgebauter Planrest.
   *
   * SIE WIRD TROTZDEM NICHT GESTRICHEN: „kein Produktionspfad schreibt sie" ist eine
   * CODE-Aussage, und die produktive Tabelle steht nicht im Repo. Eine weggelassene
   * Spalte macht einen vorhandenen Wert unwiederbringlich, und der Import hat keinen
   * zweiten Versuch. Der Loeschzaehler wechselt stattdessen auf `ziel_id` (§5.21).
   */
  scopeLagerortId: text("scope_lagerort_id").references(() => lagerorte.id),
  zielTyp: text("ziel_typ", { enum: ["fahrzeug", "artikel"] }),
  // BEWUSST POLYMORPH, OHNE FK: je nach zielTyp eine lagerorte.id oder eine artikel.id.
  // ⚠️ Waisenrisiko — ein ziel_id kann auf eine geloeschte Zeile zeigen. Runbook:
  // vor dem Cutover pruefen; Treffer sind laminierte Kaertchen, die ins Leere zeigen.
  zielId: text("ziel_id"),
  /**
   * DER EINZIGE WIDERRUF, DEN ES GIBT — und die schaerfste Import-Zusage dieser
   * Tabelle. Ein Import, der alles als aktiv anlegt, reaktiviert stillschweigend
   * jeden gesperrten Code — und zwar genau die, die gesperrt wurden, weil ein
   * laminiertes Kaertchen verschwunden ist (1:1-Pflicht 5).
   */
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // OIDC-`sub` des ausstellenden Kontos. Reines Auditfeld — kein Leser im ganzen Repo.
  createdBy: text("created_by").notNull(),
  // NULL = „nie eingeloest". Reines Anzeigefeld, OHNE Einfluss auf Gueltigkeit und
  // (nach Entscheidung 8-F) auch ohne Einfluss auf Loeschbarkeit. Wandert vollstaendig mit.
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
});

/**
 * Reine Nachschlagetabelle fuer die ANZEIGE. `quelleAufloeser` laedt sie einmal je
 * Request und loest oidc → users.name, sonst email, sonst die ROHE ID auf.
 *
 * ⚠️ `select count(*) from users` ist KEINE Personenzahl — das gilt vor wie nach der
 * Bereinigung und gehoert in jede Oberflaeche, die die Zahl anzeigen will. Bis
 * f2b515b (29.07.2026) schrieb die Alt-App hier den Auth.js-`user.id`, also eine
 * ZUFALLS-UUID PRO ANMELDUNG; der Freeze liegt fuenf Tage spaeter. Fast jede Zeile
 * des Altbestands ist deshalb auf eine Waise geschluesselt. DAS JOURNAL IST HEIL —
 * dort stand immer der echte `sub`; verseucht ist ausschliesslich diese Tabelle.
 *
 * Es gibt KEINE Zuordnungstabelle alt_sub → neu_sub und es wird keine geben (§4.13):
 * die Kennung wird nirgends gefiltert, gruppiert oder aggregiert, nur angezeigt —
 * beide Kennungsraeume duerfen als Primaerschluessel DERSELBEN Tabelle koexistieren.
 * Gemessen ist ohnehin, dass die Pocket-ID-Instanz `subject_types_supported:
 * ["public"]` fuehrt, der `sub` also ueber beide OIDC-Clients identisch ist.
 *
 * KEIN UNIQUE auf `email` — er wuerde den zweiten Login zum Fehler machen.
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),   // der OIDC-`sub`
  name: text("name"),
  email: text("email"),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
});
```

- [ ] **Schritt 6: `_db/drizzle.config.ts` schreiben**

```ts
import type { Config } from "drizzle-kit";

// Pfade repo-root-relativ (drizzle-kit löst gegen cwd auf), nicht relativ zu dieser Datei.
export default {
  schema: "./src/app/m/lagerbuch/_db/schema.ts",
  out: "./src/app/m/lagerbuch/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/lagerbuch.db" },
} satisfies Config;
```

- [ ] **Schritt 7: Zählen — 16 Tabellen, 16 Zeitspalten**

```bash
grep -c "sqliteTable(" src/app/m/lagerbuch/_db/schema.ts
grep -cE 'mode: "timestamp"' src/app/m/lagerbuch/_db/schema.ts
```

Erwartet: **16** und **16**. ⚠️ `grep -c` zählt **Zeilen**, nicht Vorkommen — das geht hier auf, weil
jede Deklaration auf einer eigenen Zeile steht. Weicht eine Zahl ab, ist eine Tabelle oder eine
Zeitspalte verlorengegangen; **nicht** die Erwartung anpassen.

Gegenprobe, dass nirgends `timestamp_ms` steht:

```bash
grep -n "timestamp_ms" src/app/m/lagerbuch/_db/schema.ts
```

Erwartet: keine Ausgabe.

- [ ] **Schritt 8: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/konstanten.test.ts
```

Erwartet: PASS, einschließlich der fünf Mengengleichheits-Zusicherungen.

- [ ] **Schritt 9: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
git add src/app/m/lagerbuch/_db/schema.ts src/app/m/lagerbuch/_db/drizzle.config.ts \
        src/app/m/lagerbuch/_lib/konstanten.test.ts
git commit -m "feat(lagerbuch): _db/schema.ts — 16 Tabellen, vier benannte Abweichungen

1:1-Port aus lagerbuch@ca04eb1 in Spaltennamen, Typen, Nullbarkeit, Defaults
und Indexnamen. S1 checks.quelle_typ bekommt den Drizzle-Enum (kein SQL-Effekt),
S3 vier neue Indizes (idx_buchungen_ts_id, _lagerort_artikel,
_artikel_lagerort_charge, idx_checks_fahrzeug_completed). S2 und S4 folgen als
Migration.

Ausdruecklich NICHT dabei: kein UNIQUE auf (artikel_id, chargen_nr, verfall),
kein CHECK auf die Monats-/Tagesfelder, keine NOT-NULL-Verschaerfung, keine
gestrichene Spalte — auch nicht die belegt tote tokens.scope_lagerort_id.
Jede Zeitspalte ist mode: timestamp (UNIX-SEKUNDEN), nie timestamp_ms."
```

---

**Gate Welle 2.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

## Welle 3 — Migrationen und das Registrierungs-Dreieck (1 Task)

Wieder genau ein Task: die vier Migrationsdateien, ihr `meta/_journal.json` und die drei Einträge des
Dreiecks hängen so eng zusammen, dass jede Aufteilung einen Zwischenzustand mit rotem
`bootstrap.test.ts` erzeugte.

---

### Task 8: Das Migrationsverzeichnis und das Dreieck

**Files:**
- Create: `src/app/m/lagerbuch/_db/migrations/0000_<generiert>.sql` (von `drizzle-kit`)
- Create: `src/app/m/lagerbuch/_db/migrations/0001_append_only.sql`
- Create: `src/app/m/lagerbuch/_db/migrations/0002_bz_kontrollen_append_only.sql`
- Create: `src/app/m/lagerbuch/_db/migrations/0003_handlager.sql`
- Modify: `src/app/m/lagerbuch/_db/migrations/meta/_journal.json` (von `drizzle-kit` erzeugt, dann
  um drei Einträge ergänzt)
- Modify: `src/core/bootstrap.ts` (`MODULE_MIGRATIONS`) — **`core`-Datei**
- Modify: `Dockerfile` (eine `COPY`-Zeile)

**Interfaces:**
- Consumes: `_db/schema.ts` (T7).
- Produces: ein abspielbares Migrationsverzeichnis. Konsumiert von T9, T11, T12, T13, T14 und von
  `migrateAllModules()` beim Boot.

**Das Dreieck — drei zusammenpassende Einträge, sonst läuft es lokal und bricht im Container**
(`CLAUDE.md:50-54`). Die Kopplung ist real und CI-bewacht: `src/core/bootstrap.test.ts:82-107` prüft
**drei** Dinge — jedes Modul mit `_db/` steht in `MODULE_MIGRATIONS`, jeder Ordner hat ein
`meta/_journal.json`, und **jeder Ordner wird ins Prod-Image kopiert** (ein `toContain` auf den
Dockerfile-Text). Das dritte Bein ist genau das, für das lagerbuchs eigene CI nichts hatte.

⚠️ **`lagerbuch` wird ans ENDE beider Listen einsortiert, hinter `files`.** `MODULE_MIGRATIONS` wird
der Reihe nach abgearbeitet, und **ein Migrationsfehler in lagerbuch bricht den Start des ganzen
Containers ab** — also auch portal, qr, feedback und files (Falle 50). Das ist eine geerbte
Ausfallkopplung, keine neue; sie gilt für jedes Modul mit eigener DB. Sie steht hier trotzdem
ausgeschrieben, weil lagerbuch mit sieben Bestandsmigrationen und handgeschriebenem Trigger-SQL das
bisher größte Migrationsrisiko der Suite mitbringt. Konsequenz fürs Runbook: die Generalprobe
migriert gegen eine **Kopie** des Produktionsstands, nicht gegen eine leere DB.

⚠️ **Kein Schema-Import und kein Seed in `core/bootstrap.ts`.** `migrateAllModules()` migriert
schema-frei; einziger Konsument der Schema-Importe ist `seedAllModules()` — ein Import wäre toter
Code. Für lagerbuch kommt ein **zweiter, härterer Grund** dazu: `seedAllModules()` ist die einzige
Stelle im `core`, die `getModuleDb(<key>, schema)` ruft. Stünde lagerbuch dort, öffnete `core` eine
Verbindung **ohne** die registrierte SQLite-Funktion `lb_falte` — der Fehler wäre ein
`no such function: lb_falte` auf genau einem Codepfad.

- [ ] **Schritt 1: Das `0000` generieren**

```bash
pnpm exec drizzle-kit generate --config=src/app/m/lagerbuch/_db/drizzle.config.ts
```

Erwartet: eine Datei `src/app/m/lagerbuch/_db/migrations/0000_<zwei-worte>.sql` und ein frisch
erzeugtes `meta/_journal.json` mit **genau einem** Eintrag (`idx: 0`).

Sofort nachzählen:

```bash
grep -c "CREATE TABLE" src/app/m/lagerbuch/_db/migrations/0000_*.sql
grep -c "CREATE INDEX\|CREATE UNIQUE INDEX" src/app/m/lagerbuch/_db/migrations/0000_*.sql
```

Erwartet: **16** Tabellen. Bei den Indizes: **16** benannte `CREATE …INDEX`-Anweisungen — die zwölf
1:1-Indizes plus die vier aus S3. ⚠️ Die drei `UNIQUE`-Constraints auf Spaltenebene
(`tokens.code`, `geraete.barcode`, `bz_geraete.barcode`) erzeugt drizzle-kit als eigene
`CREATE UNIQUE INDEX`-Zeilen mit den Namen `tokens_code_unique`, `geraete_barcode_unique`,
`bz_geraete_barcode_unique`; sie zählen mit. Weicht eine Zahl ab, **erst `schema.ts` prüfen**, nicht
die SQL-Datei von Hand nachbessern — eine handkorrigierte `0000` läuft dem Schema danach dauerhaft
davon.

⚠️ **`drizzle-kit generate` erzeugt keine Trigger.** Drizzle kennt für SQLite kein Trigger-Primitiv;
ein naiv regeneriertes Verzeichnis ergibt eine Datenbank, die sich **exakt gleich verhält, bis
irgendwer `UPDATE buchungen` fährt**. Genau dafür sind die Schritte 2 und 3 da.

- [ ] **Schritt 2: `0001_append_only.sql` — eine WÖRTLICHE Kopie**

```bash
cp ../lagerbuch/drizzle/0001_append_only.sql \
   src/app/m/lagerbuch/_db/migrations/0001_append_only.sql
diff ../lagerbuch/drizzle/0001_append_only.sql \
     src/app/m/lagerbuch/_db/migrations/0001_append_only.sql
```

Erwartet: `diff` gibt nichts aus. Der Inhalt ist dann:

```sql
CREATE TRIGGER buchungen_no_update
BEFORE UPDATE ON buchungen
BEGIN
  SELECT RAISE(ABORT, 'journal ist append-only');
END;
--> statement-breakpoint
CREATE TRIGGER buchungen_no_delete
BEFORE DELETE ON buchungen
BEGIN
  SELECT RAISE(ABORT, 'journal ist append-only');
END;
```

⚠️ **Nicht neu formulieren, nicht umbenennen.** Die Triggernamen `buchungen_no_update` und
`buchungen_no_delete` und der Meldungstext `journal ist append-only` bleiben, weil der portierte Test
auf `/append-only/` prüft **und** weil der Text die einzige Erklärung ist, die ein Betreiber im Log
sieht.

- [ ] **Schritt 3: `0002_bz_kontrollen_append_only.sql` schreiben (S2)**

Bewusst eine **eigene** Datei, damit die Behauptung „0001 ist wörtlich die Alt-Datei" wörtlich prüfbar
bleibt.

```sql
-- Entscheidung 5 (c): bz_kontrollen ist ein Medizinprodukte-Nachweis und friert in
-- ref_snapshot die Referenzbereiche zum Messzeitpunkt ein. Die Append-only-Zusage
-- stand bisher nur als Kommentar im Anwendungscode.
--
-- Geprueft, dass nichts bricht: im gesamten Alt-Repo null Treffer fuer
-- delete(bzKontrollen)/update(bzKontrollen); der Hard-Delete eines BZ-Geraets ist
-- bereits gesperrt, sobald eine Kontrolle existiert. Der Trigger nimmt keinem
-- laufenden Pfad etwas weg — er macht eine Zusage erzwingbar.
--
-- o2_messungen bekommt bewusst KEINE (§4.4). Die Gegenprobe steht in
-- _db/append-only.test.ts, sonst ist „bewusst offen gelassen" von „vergessen"
-- nicht zu unterscheiden.
CREATE TRIGGER bz_kontrollen_no_update
BEFORE UPDATE ON bz_kontrollen
BEGIN
  SELECT RAISE(ABORT, 'bz-kontrollen sind append-only');
END;
--> statement-breakpoint
CREATE TRIGGER bz_kontrollen_no_delete
BEFORE DELETE ON bz_kontrollen
BEGIN
  SELECT RAISE(ABORT, 'bz-kontrollen sind append-only');
END;
```

- [ ] **Schritt 4: `0003_handlager.sql` schreiben (S4)**

```sql
-- Entscheidung 25 (a): die Handlager-Zeile ist eine MIGRATIONSZEILE, kein Seed.
--
-- Sie ist eine fachliche Konstante mit 75 Fundstellen unter src/ der Alt-App; jede
-- Entnahme, Inventurkorrektur, Aussonderung und Nachfuellung bucht gegen genau diese
-- ID. Mit foreign_keys = ON ist eine andere ID kein Schoenheitsfehler, sondern ein
-- FK-Fehler bei der ersten Entnahme.
--
-- Als Boot-Schritt liefe sie ausserhalb der Versionierung; als Boot-Assert machte
-- eine fehlende Zeile aus einem Datenproblem einen TOTALAUSFALL DER GANZEN SUITE,
-- weil migrateAllModules() alle Module in einer Schleife faehrt.
--
-- INSERT OR IGNORE ist idempotent und kollidiert nicht mit der Altzeile, die der
-- Import mitbringt: die produktive lagerorte-Tabelle traegt 'handlager' seit dem
-- ersten Boot (ensureHandlager arbeitet selbst mit onConflictDoNothing).
INSERT OR IGNORE INTO lagerorte (id, name, typ, kennung, aktiv, template_id)
VALUES ('handlager', 'Handlager', 'lager', NULL, 1, NULL);
```

- [ ] **Schritt 5: `meta/_journal.json` um drei Einträge ergänzen**

Zuerst den von drizzle-kit gestempelten `when`-Wert von `0000` ablesen:

```bash
cat src/app/m/lagerbuch/_db/migrations/meta/_journal.json
```

Dann die drei Einträge anfügen, mit **`when` = `<0000s when>` + 1000 / + 2000 / + 3000**:

```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    { "idx": 0, "version": "6", "when": <VON DRIZZLE-KIT>, "tag": "0000_<generiert>", "breakpoints": true },
    { "idx": 1, "version": "6", "when": <+1000>, "tag": "0001_append_only", "breakpoints": true },
    { "idx": 2, "version": "6", "when": <+2000>, "tag": "0002_bz_kontrollen_append_only", "breakpoints": true },
    { "idx": 3, "version": "6", "when": <+3000>, "tag": "0003_handlager", "breakpoints": true }
  ]
}
```

⚠️ **Warum die Werte abgeleitet und nicht erfunden werden (Festlegung F7).** Der Migrator vergleicht
ausschließlich `created_at` der letzten `__drizzle_migrations`-Zeile gegen `folderMillis` und liest
den gespeicherten **Hash nie zurück** (1:1-Pflicht 9). Zwei Folgen, die in jedes Review dieses
Verzeichnisses gehören:

1. Eine **inhaltlich geänderte** `.sql` bei gleichbleibendem `when` bleibt **still** — Produktion und
   frische Dev-DB divergieren, beide grün.
2. Ein nachträglich eingeschobener **kleinerer** `when` wird **nie ausgeführt**. Ein fest verdrahteter
   Zeitstempel für `0001`–`0003` wäre genau dieser Fall, sobald drizzle-kit später stempelt.

`version: "6"` je Eintrag und `version: "7"` am Kopf sind die Werte, die die Alt-App führt und die
drizzle-kit 0.31 erzeugt — nicht ändern.

- [ ] **Schritt 6: Den Migrationslauf einmal von Hand prüfen**

```bash
rm -f /tmp/lb-neu.db && pnpm exec tsx -e '
import D from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
const s = new D("/tmp/lb-neu.db");
s.pragma("foreign_keys = ON");
migrate(drizzle(s), { migrationsFolder: "src/app/m/lagerbuch/_db/migrations" });
console.log("tabellen:", s.prepare("select count(*) c from sqlite_master where type=%27table%27 and name not like %27sqlite_%%27 and name not like %27__drizzle%%27").get());
console.log("trigger:", s.prepare("select name from sqlite_master where type=%27trigger%27 order by name").all());
console.log("handlager:", s.prepare("select id,name,typ,aktiv from lagerorte where id=%27handlager%27").get());
'
```

Erwartet:
- `tabellen: { c: 16 }`
- `trigger:` vier Namen — `bz_kontrollen_no_delete`, `bz_kontrollen_no_update`,
  `buchungen_no_delete`, `buchungen_no_update`
- `handlager: { id: 'handlager', name: 'Handlager', typ: 'lager', aktiv: 1 }`

- [ ] **Schritt 7: `MODULE_MIGRATIONS` ergänzen**

In `src/core/bootstrap.ts`, ans **Ende** des Arrays, hinter `files`:

```ts
  // lagerbuch: bewusst OHNE Schema-Import und OHNE Seed unten — dieselbe Begründung
  // wie bei `files` (der Schema-Import wäre toter Code), plus ein zweiter, härterer
  // Grund: `seedAllModules()` ist die einzige core-Stelle, die
  // `getModuleDb(<key>, schema)` ruft, und eine solche Verbindung kennte die
  // registrierte SQLite-Funktion `lb_falte` NICHT (Modul-Spec §5.13.2). Die
  // Handlager-Zeile gehört ohnehin nicht hierher: sie ist eine Migrationszeile
  // (0003_handlager.sql), keine Testdatenzeile.
  { key: "lagerbuch", migrationsFolder: "src/app/m/lagerbuch/_db/migrations" },
```

⚠️ **Der Boot-Haken `lagerbuchBootFehler()` in `assertHostConfig()` gehört NICHT in diesen Task.** Er
ist die zweite Änderung an `core/bootstrap.ts` und braucht `_lib/boot.ts`, das es noch nicht gibt —
er steht am **Fuß von Teil 3** (§10.5). ⚠️ **Für diese Naht gibt es kein Kopplungsnetz:** das
Migrations-Dreieck hat eines (`bootstrap.test.ts:82-107`), die Boot-Haken haben keines. Kein Test
behauptet „jedes Modul mit `_lib/boot.ts` steht in `assertHostConfig`". Deshalb steht der Punkt
ausdrücklich hier und nicht in einer Fußnote.

- [ ] **Schritt 8: Die `COPY`-Zeile im `Dockerfile`**

Neben den vier vorhandenen Migrations-`COPY`-Zeilen anfügen:

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/lagerbuch/_db/migrations ./src/app/m/lagerbuch/_db/migrations
```

⚠️ **Der Zielpfad ist derselbe String wie im `MODULE_MIGRATIONS`-Eintrag.** Der Migrationspfad ist
**cwd-relativ** (Dev = Repo-Root, Prod = `/app`); eine Abweichung an dieser Stelle läuft lokal und
bricht im Container.

- [ ] **Schritt 9: Die CI-Kopplung laufen lassen**

```bash
pnpm vitest run src/core/bootstrap.test.ts
```

Erwartet: PASS. Der Test prüft jetzt alle drei Beine für `lagerbuch`. **Gegenprobe, dass er wirklich
greift** (er ist der einzige Wächter des dritten Beins): die `COPY`-Zeile probeweise auskommentieren,
Test laufen lassen — er muss ROT werden —, dann zurücknehmen.

- [ ] **Schritt 10: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
git add src/app/m/lagerbuch/_db/migrations src/core/bootstrap.ts Dockerfile
git commit -m "feat(lagerbuch): Migrationsverzeichnis und das Registrierungs-Dreieck

Entscheidung 4 (i): regeneriert statt kopiert — ein gequetschtes 0000 aus
schema.ts plus drei handgeschriebene Nachtraege. drizzle-kit erzeugt KEINE
Trigger, deshalb:
  0001_append_only.sql             woertliche Kopie aus lagerbuch@ca04eb1
  0002_bz_kontrollen_append_only   S2, eigene Datei, damit 0001 woertlich bleibt
  0003_handlager.sql               S4, INSERT OR IGNORE, idempotent

Dazu die drei Eintraege des Dreiecks: _db/migrations, MODULE_MIGRATIONS
(ans Ende, hinter files) und die COPY-Zeile im Dockerfile. Ohne das dritte Bein
laeuft es lokal und bricht im Container; bootstrap.test.ts:82-107 bewacht alle
drei.

Der Boot-Haken lagerbuchBootFehler() folgt in Teil 3 — fuer diese Naht gibt es
kein Kopplungsnetz."
```

---

**Gate Welle 3.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

## Welle 4 — Die Beweise (ZWEI Stufen)

Die Beweispflicht, die das Regenerieren erzeugt: **wer kopiert, hat das Alt-Schema per Definition;
wer regeneriert, behauptet es.**

**Stufe 4a** (2 Tasks, parallel): T9 und T10.
**Stufe 4b** (3 Tasks, parallel): T11, T12, T13 — alle drei brauchen `_db/testdb.ts` aus T9.

---

### Task 9: `_db/testdb.ts` und `_db/migrations.test.ts` — „das Schema ist das, was §4 behauptet"

**Files:**
- Create: `src/app/m/lagerbuch/_db/testdb.ts`
- Create: `src/app/m/lagerbuch/_db/migrations.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` (T7), `_db/migrations/` (T8).
- Produces:
  ```ts
  // _db/testdb.ts
  export type TestDb = { db: ReturnType<typeof drizzle<typeof schema>>;
                         sqlite: Database.Database; schliessen: () => void };
  export function migrierteTestDb(praefix?: string): TestDb;   // Vorgabe "lagerbuch-"
  ```
  Konsumiert von T11, T12, T13 und von jeder `_db/*.test.ts` der Teile 2 bis 5 (§5.19.2 nennt neun
  weitere).

**Warum ein Helfer (Festlegung F1).** Zehn Testdateien laufen gegen eine **echte, migrierte
SQLite-Datei**. Ohne gemeinsamen Aufbau sind das zehn Kopien derselben zwölf Zeilen — und ein
einziges vergessenes `pragma("foreign_keys = ON")` macht eine ganze Datei grün, ohne etwas zu prüfen.
`m/files/_db/` hat keinen solchen Helfer; das ist bei zwei Dateien vertretbar und bei zehn nicht.

⚠️ **`migrations.test.ts` benutzt den Helfer NICHT.** Es prüft genau den Migrationslauf und darf ihn
deshalb nicht hinter einem Helfer verstecken — es baut seine DB selbst, nach dem Muster von
`m/files/_db/migrations.test.ts:1-40`.

⚠️ **Datei-DB, nicht `:memory:`.** Nur der Dateiweg belegt, dass `migrate()` auf einer frisch
angelegten Datei durchläuft — und der Boot legt `lagerbuch.db` als Datei an.

- [ ] **Schritt 1: `_db/testdb.ts` schreiben**

Der Helfer ist selbst kein Prüfling; er entsteht deshalb vor dem Test, der ihn benutzt.

```ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "./schema";
import { falte } from "../_lib/suche";

export const MIGRATIONS_ORDNER = "src/app/m/lagerbuch/_db/migrations";

export type TestDb = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database.Database;
  schliessen: () => void;
};

/**
 * Eine frisch migrierte Test-Datenbank fuer alle `_db/*.test.ts` dieses Moduls.
 *
 * DREI EIGENSCHAFTEN, DIE JEDE EINZELN WEGLASSBAR AUSSAEHEN UND ES NICHT SIND:
 *
 * 1. DATEI-DB, NICHT :memory:. Nur der Dateiweg belegt, dass `migrate()` auf einer
 *    frisch angelegten Datei durchlaeuft — und genau das tut der Boot.
 * 2. `foreign_keys = ON`. Das Pragma ist eine VERBINDUNGS-Eigenschaft und in SQLite
 *    standardmaessig AUS. Ohne diese Zeile waeren saemtliche FK-Zusagen dieses
 *    Moduls gruen, ohne zu gelten.
 * 3. `lb_falte`. Dieselbe Funktion, die `_db/client.ts` registriert. Ohne sie
 *    scheitert jede Journalsuche im Test mit `no such function: lb_falte` — und
 *    zwar auf genau dem Codepfad, den der Produktivbetrieb faehrt.
 *
 * ABGESPIELT, NICHT GEPUSHT: die DB entsteht durch `migrate()` gegen das echte
 * Verzeichnis. Ein schema-gepushter Aufbau macht `append-only.test.ts` gruen und
 * INHALTSLEER — drizzle-kit erzeugt keine Trigger, ein Push traegt sie also nie.
 */
export function migrierteTestDb(praefix = "lagerbuch-"): TestDb {
  const ordner = mkdtempSync(join(tmpdir(), praefix));
  const sqlite = new Database(join(ordner, "lagerbuch.db"));
  sqlite.pragma("foreign_keys = ON");
  sqlite.function("lb_falte", { deterministic: true },
    (v: string | null) => (v === null ? null : falte(v)));
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_ORDNER });
  const db = drizzle(sqlite, { schema });
  return {
    db, sqlite,
    schliessen: () => { sqlite.close(); rmSync(ordner, { recursive: true, force: true }); },
  };
}
```

- [ ] **Schritt 2: `_db/migrations.test.ts` — Gerüst und Spaltenprüfung schreiben**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "./schema";

const ORDNER = "src/app/m/lagerbuch/_db/migrations";

/**
 * „Das Schema ist das, was §4 behauptet." Wer ein Migrationsverzeichnis kopiert, hat
 * das Alt-Schema per Definition; wer es REGENERIERT, behauptet es. Diese Datei loest
 * die Behauptung dauerhaft ein; der einmalige Schema-Diff gegen die Alt-App (T14)
 * loest sie fuer den Zeitpunkt des Ports ein.
 *
 * Gegen eine temporaere DATEI-DB, nicht :memory: — und BEWUSST OHNE `migrierteTestDb`
 * aus testdb.ts: dieser Test prueft den Migrationslauf selbst und darf ihn nicht
 * hinter einem Helfer verstecken.
 */
let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "lagerbuch-migrations-"));
  sqlite = new Database(join(tmp, "lagerbuch.db"));
  // `foreign_keys` ist eine VERBINDUNGS-Eigenschaft und in SQLite standardmaessig AUS.
  // Ohne diese Zeile waeren alle FK-Zusagen unten gruen, ohne zu gelten.
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: ORDNER });
  db = drizzle(sqlite, { schema });
});

afterAll(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

type SpalteInfo = { name: string; type: string; notnull: number; dflt_value: string | null };
type IndexInfo = { name: string; unique: number; origin: string };

const spalten = (tabelle: string) =>
  sqlite.prepare(`PRAGMA table_info(${tabelle})`).all() as SpalteInfo[];

/** Alle Indizes AUSSER den PK-Autoindizes (`sqlite_autoindex_*`, origin "pk").
 *  Die drei UNIQUE-Indizes tokens_code_unique, geraete_barcode_unique und
 *  bz_geraete_barcode_unique GEHOEREN dazu — drizzle-kit emittiert sie als eigene
 *  `CREATE UNIQUE INDEX`-Anweisungen (origin "c"), nicht als Spaltenconstraint. */
const indizes = (tabelle: string) =>
  (sqlite.prepare(`PRAGMA index_list(${tabelle})`).all() as IndexInfo[])
    .filter((i) => i.origin !== "pk")
    .map((i) => i.name)
    .sort();

const TABELLEN: Record<string, { name: string; typ: string; notnull: 0 | 1; dflt: string | null }[]> = {
  lagerorte: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "name", typ: "text", notnull: 1, dflt: null },
    { name: "typ", typ: "text", notnull: 1, dflt: null },
    { name: "kennung", typ: "text", notnull: 0, dflt: null },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "template_id", typ: "text", notnull: 0, dflt: null },
  ],
  fahrzeug_templates: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "name", typ: "text", notnull: 1, dflt: null },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
  ],
  template_positionen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "template_id", typ: "text", notnull: 1, dflt: null },
    { name: "fach_label", typ: "text", notnull: 1, dflt: null },
    { name: "sort", typ: "integer", notnull: 1, dflt: "0" },
    { name: "artikel_id", typ: "text", notnull: 1, dflt: null },
    { name: "soll", typ: "integer", notnull: 1, dflt: null },
  ],
  artikel: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "name", typ: "text", notnull: 1, dflt: null },
    { name: "einheit", typ: "text", notnull: 1, dflt: null },
    { name: "fach", typ: "text", notnull: 1, dflt: null },
    { name: "mindestbestand", typ: "integer", notnull: 1, dflt: "0" },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "bestellt_at", typ: "integer", notnull: 0, dflt: null },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
  ],
  chargen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "artikel_id", typ: "text", notnull: 1, dflt: null },
    { name: "chargen_nr", typ: "text", notnull: 1, dflt: null },
    { name: "verfall", typ: "text", notnull: 1, dflt: null },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
  ],
  soll_positionen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "fahrzeug_id", typ: "text", notnull: 1, dflt: null },
    { name: "fach_label", typ: "text", notnull: 1, dflt: null },
    { name: "sort", typ: "integer", notnull: 1, dflt: "0" },
    { name: "artikel_id", typ: "text", notnull: 1, dflt: null },
    { name: "soll", typ: "integer", notnull: 1, dflt: null },
    { name: "template_position_id", typ: "text", notnull: 0, dflt: null },
    { name: "ueberschrieben", typ: "integer", notnull: 1, dflt: "false" },
    { name: "entfernt", typ: "integer", notnull: 1, dflt: "false" },
  ],
  buchungen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "ts", typ: "integer", notnull: 1, dflt: null },
    { name: "typ", typ: "text", notnull: 1, dflt: null },
    { name: "artikel_id", typ: "text", notnull: 1, dflt: null },
    { name: "charge_id", typ: "text", notnull: 1, dflt: null },
    { name: "lagerort_id", typ: "text", notnull: 1, dflt: null },
    { name: "menge", typ: "integer", notnull: 1, dflt: null },
    { name: "quelle_typ", typ: "text", notnull: 1, dflt: null },
    { name: "quelle_id", typ: "text", notnull: 1, dflt: null },
    { name: "referenz", typ: "text", notnull: 0, dflt: null },
    { name: "kommentar", typ: "text", notnull: 0, dflt: null },
  ],
  checks: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "fahrzeug_id", typ: "text", notnull: 1, dflt: null },
    { name: "quelle_typ", typ: "text", notnull: 1, dflt: null },
    { name: "quelle_id", typ: "text", notnull: 1, dflt: null },
    { name: "started_at", typ: "integer", notnull: 1, dflt: null },
    { name: "completed_at", typ: "integer", notnull: 0, dflt: null },
    { name: "ergebnis", typ: "text", notnull: 0, dflt: null },
  ],
  lagerort_verfall: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "lagerort_id", typ: "text", notnull: 1, dflt: null },
    { name: "artikel_id", typ: "text", notnull: 1, dflt: null },
    { name: "verfall", typ: "text", notnull: 1, dflt: null },
    { name: "erfasst_at", typ: "integer", notnull: 1, dflt: null },
    { name: "quelle_typ", typ: "text", notnull: 1, dflt: null },
    { name: "quelle_id", typ: "text", notnull: 1, dflt: null },
  ],
  bz_geraete: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "barcode", typ: "text", notnull: 0, dflt: null },
    { name: "name", typ: "text", notnull: 1, dflt: null },
    { name: "lagerort_id", typ: "text", notnull: 1, dflt: null },
    { name: "streifen_lot", typ: "text", notnull: 0, dflt: null },
    { name: "level1_label", typ: "text", notnull: 0, dflt: null },
    { name: "level1_min", typ: "integer", notnull: 0, dflt: null },
    { name: "level1_max", typ: "integer", notnull: 0, dflt: null },
    { name: "level2_label", typ: "text", notnull: 0, dflt: null },
    { name: "level2_min", typ: "integer", notnull: 0, dflt: null },
    { name: "level2_max", typ: "integer", notnull: 0, dflt: null },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
  ],
  bz_kontrollen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "geraet_id", typ: "text", notnull: 1, dflt: null },
    { name: "ts", typ: "integer", notnull: 1, dflt: null },
    { name: "quelle_typ", typ: "text", notnull: 1, dflt: null },
    { name: "quelle_id", typ: "text", notnull: 1, dflt: null },
    { name: "level1_wert", typ: "integer", notnull: 0, dflt: null },
    { name: "level1_im_bereich", typ: "integer", notnull: 0, dflt: null },
    { name: "level2_wert", typ: "integer", notnull: 0, dflt: null },
    { name: "level2_im_bereich", typ: "integer", notnull: 0, dflt: null },
    { name: "kompresse_verfall", typ: "text", notnull: 0, dflt: null },
    { name: "sticks", typ: "integer", notnull: 1, dflt: "0" },
    { name: "lanzetten", typ: "integer", notnull: 1, dflt: "0" },
    { name: "batterie_gewechselt", typ: "integer", notnull: 1, dflt: "false" },
    { name: "kommentar", typ: "text", notnull: 0, dflt: null },
    { name: "bestanden", typ: "integer", notnull: 1, dflt: null },
    { name: "ref_snapshot", typ: "text", notnull: 0, dflt: null },
  ],
  o2_flaschen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "name", typ: "text", notnull: 1, dflt: null },
    { name: "lagerort_id", typ: "text", notnull: 1, dflt: null },
    { name: "groesse_liter", typ: "integer", notnull: 0, dflt: null },
    { name: "nennfuelldruck_bar", typ: "integer", notnull: 1, dflt: "200" },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
  ],
  o2_messungen: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "flasche_id", typ: "text", notnull: 1, dflt: null },
    { name: "ts", typ: "integer", notnull: 1, dflt: null },
    { name: "druck_bar", typ: "integer", notnull: 1, dflt: null },
    { name: "quelle_typ", typ: "text", notnull: 1, dflt: null },
    { name: "quelle_id", typ: "text", notnull: 1, dflt: null },
    { name: "kommentar", typ: "text", notnull: 0, dflt: null },
  ],
  geraete: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "typ", typ: "text", notnull: 1, dflt: null },
    { name: "barcode", typ: "text", notnull: 0, dflt: null },
    { name: "name", typ: "text", notnull: 1, dflt: null },
    { name: "lagerort_id", typ: "text", notnull: 1, dflt: null },
    { name: "anmerkung", typ: "text", notnull: 0, dflt: null },
    { name: "mtk_faellig", typ: "text", notnull: 0, dflt: null },
    { name: "beschreibung", typ: "text", notnull: 0, dflt: null },
    { name: "ablaufdatum", typ: "text", notnull: 0, dflt: null },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
  ],
  tokens: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "code", typ: "text", notnull: 1, dflt: null },
    { name: "label", typ: "text", notnull: 1, dflt: null },
    { name: "scope_lagerort_id", typ: "text", notnull: 0, dflt: null },
    { name: "ziel_typ", typ: "text", notnull: 0, dflt: null },
    { name: "ziel_id", typ: "text", notnull: 0, dflt: null },
    { name: "aktiv", typ: "integer", notnull: 1, dflt: "true" },
    { name: "created_at", typ: "integer", notnull: 1, dflt: null },
    { name: "created_by", typ: "text", notnull: 1, dflt: null },
    { name: "last_used_at", typ: "integer", notnull: 0, dflt: null },
  ],
  users: [
    { name: "id", typ: "text", notnull: 1, dflt: null },
    { name: "name", typ: "text", notnull: 0, dflt: null },
    { name: "email", typ: "text", notnull: 0, dflt: null },
    { name: "last_login_at", typ: "integer", notnull: 0, dflt: null },
  ],
};

describe("16 Tabellen, Spalte fuer Spalte", () => {
  it("es sind genau 16 und keine mehr", () => {
    const namen = (sqlite.prepare(
      `select name from sqlite_master where type='table'
         and name not like 'sqlite_%' and name not like '__drizzle%' order by name`,
    ).all() as { name: string }[]).map((r) => r.name);
    expect(namen.sort()).toEqual(Object.keys(TABELLEN).sort());
  });

  it.each(Object.entries(TABELLEN))("%s", (tabelle, erwartet) => {
    const ist = spalten(tabelle).map((s) => ({
      name: s.name, typ: s.type.toLowerCase(), notnull: s.notnull as 0 | 1, dflt: s.dflt_value,
    }));
    expect(ist).toEqual(erwartet);
  });
});
```

⚠️ **`dflt` ist der ROHE SQL-Default.** Drizzle schreibt für `.default(true)` das Literal `true` und
für `.default(false)` das Literal `false` in das DDL, nicht `1`/`0`. Ist die Ausgabe von
`PRAGMA table_info` in der installierten Fassung eine andere, wird **die Erwartung an die Messung
angepasst und der Unterschied im Commit-Text benannt** — nicht umgekehrt.

- [ ] **Schritt 3: Indizes, Zeiteinheit, Handlager, Fremdschlüssel, Journal**

An dieselbe Datei anfügen:

```ts
const INDIZES: Record<string, string[]> = {
  lagerorte: [],
  fahrzeug_templates: [],
  template_positionen: ["idx_template_pos_template"],
  artikel: [],
  chargen: ["idx_chargen_artikel_verfall"],
  soll_positionen: ["idx_soll_fahrzeug"],
  buchungen: [
    "idx_buchungen_artikel",
    "idx_buchungen_artikel_lagerort_charge",   // neu, S3
    "idx_buchungen_charge",
    "idx_buchungen_lagerort_artikel",          // neu, S3
    "idx_buchungen_ts",
    "idx_buchungen_ts_id",                     // neu, S3
  ],
  checks: ["idx_checks_fahrzeug_completed"],   // neu, S3 — checks hatte KEINEN Index
  lagerort_verfall: ["idx_lagerort_verfall_ort_artikel"],
  bz_geraete: ["bz_geraete_barcode_unique", "idx_bz_geraete_lagerort"],
  bz_kontrollen: ["idx_bz_kontrollen_geraet_ts"],
  o2_flaschen: ["idx_o2_flaschen_lagerort"],
  o2_messungen: ["idx_o2_messungen_flasche_ts"],
  geraete: ["geraete_barcode_unique", "idx_geraete_lagerort"],
  tokens: ["tokens_code_unique"],
  users: [],
};

describe("Indizes — alle bestehenden bleiben, vier kommen dazu", () => {
  it.each(Object.entries(INDIZES))("%s", (tabelle, erwartet) => {
    expect(indizes(tabelle)).toEqual([...erwartet].sort());
  });

  it("idx_lagerort_verfall_ort_artikel ist UNIQUE", () => {
    const l = sqlite.prepare("PRAGMA index_list(lagerort_verfall)").all() as IndexInfo[];
    expect(l.find((i) => i.name === "idx_lagerort_verfall_ort_artikel")?.unique).toBe(1);
  });

  it("die vier neuen Indizes tragen genau die Spalten aus S3", () => {
    const sp = (name: string) =>
      (sqlite.prepare(`PRAGMA index_info(${name})`).all() as { name: string }[]).map((r) => r.name);
    expect(sp("idx_buchungen_ts_id")).toEqual(["ts", "id"]);
    expect(sp("idx_buchungen_lagerort_artikel")).toEqual(["lagerort_id", "artikel_id"]);
    expect(sp("idx_buchungen_artikel_lagerort_charge"))
      .toEqual(["artikel_id", "lagerort_id", "charge_id"]);
    expect(sp("idx_checks_fahrzeug_completed")).toEqual(["fahrzeug_id", "completed_at"]);
  });
});

describe("Zeitstempel-Einheit — der EINZIGE Test, der die 1000er-Falle sehen kann", () => {
  it("legt UNIX-SEKUNDEN ab: zehn Stellen, nicht dreizehn", () => {
    // Jede Pruefung, die ueber mode: "timestamp" schreibt UND liest, ist gegen die
    // Falle blind — beide Richtungen fahren dieselbe Umrechnung. Deshalb wird hier
    // der ROHE Spaltenwert gelesen.
    const jetzt = new Date(1770000000789);   // 789 ms, damit das Abschneiden sichtbar wird
    db.insert(schema.artikel).values({
      id: "ts-probe", name: "Mullbinde", einheit: "Stk.", fach: "A2",
      mindestbestand: 10, createdAt: jetzt,
    }).run();

    const roh = sqlite.prepare("select created_at from artikel where id = 'ts-probe'")
      .get() as { created_at: number };
    expect(roh.created_at).toBe(1770000000);
    expect(String(roh.created_at)).toHaveLength(10);

    // Gegenprobe: der Rueckweg multipliziert wieder auf Millisekunden.
    const zurueck = db.select().from(schema.artikel).all().find((a) => a.id === "ts-probe");
    expect(zurueck?.createdAt?.getTime()).toBe(1770000000000);
  });
});

describe("die Handlager-Zeile ist eine MIGRATIONSZEILE (S4)", () => {
  it("existiert nach der Migration, ohne Seed", () => {
    const z = sqlite.prepare("select id, name, typ, aktiv, template_id from lagerorte where id = 'handlager'")
      .get() as { id: string; name: string; typ: string; aktiv: number; template_id: string | null };
    expect(z).toEqual({ id: "handlager", name: "Handlager", typ: "lager", aktiv: 1, template_id: null });
  });

  it("0003 ist idempotent — ein zweiter Lauf legt keine zweite Zeile an", () => {
    sqlite.prepare(
      `INSERT OR IGNORE INTO lagerorte (id, name, typ, kennung, aktiv, template_id)
       VALUES ('handlager', 'Handlager', 'lager', NULL, 1, NULL)`,
    ).run();
    const n = sqlite.prepare("select count(*) c from lagerorte where id = 'handlager'")
      .get() as { c: number };
    expect(n.c).toBe(1);
  });
});

describe("foreign_keys beisst wirklich", () => {
  it("ein Insert in buchungen mit erfundener artikel_id wirft", () => {
    // Ohne `pragma foreign_keys = ON` waere die ganze Datei gruen, ohne etwas zu pruefen.
    expect(() => sqlite.prepare(
      `insert into buchungen (id, ts, typ, artikel_id, charge_id, lagerort_id, menge, quelle_typ, quelle_id)
       values ('fk-probe', 1770000000, 'zugang', 'gibt-es-nicht', 'auch-nicht', 'handlager', 1, 'system', 'test')`,
    ).run()).toThrow(/FOREIGN KEY constraint failed/);
  });
});

describe("meta/_journal.json — die Eigenschaft, an der ein stiller Migrationsfehler haengt", () => {
  const journal = JSON.parse(readFileSync(join(ORDNER, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };

  it("fuehrt vier Eintraege in aufsteigender idx-Reihenfolge", () => {
    expect(journal.entries.map((e) => e.idx)).toEqual([0, 1, 2, 3]);
  });

  it("`when` ist STRENG monoton", () => {
    // Ein nachtraeglich eingeschobener kleinerer `when` wird NIE ausgefuehrt — der
    // Migrator vergleicht nur `created_at` der letzten Zeile gegen `folderMillis`
    // und liest den gespeicherten Hash nie zurueck (1:1-Pflicht 9). Der Ausfall ist
    // still: Produktion und frische Dev-DB divergieren, beide gruen.
    const w = journal.entries.map((e) => e.when);
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeGreaterThan(w[i - 1]);
  });

  it("jeder `tag` hat eine Datei, und die drei handgeschriebenen heissen wie erwartet", () => {
    for (const e of journal.entries) {
      expect(() => readFileSync(join(ORDNER, `${e.tag}.sql`), "utf8")).not.toThrow();
    }
    expect(journal.entries.map((e) => e.tag).slice(1))
      .toEqual(["0001_append_only", "0002_bz_kontrollen_append_only", "0003_handlager"]);
  });

  it("0001 ist WOERTLICH die Datei aus der Alt-Anwendung", () => {
    // Die Behauptung „0001 ist woertlich die Alt-Datei" ist nur deshalb woertlich
    // pruefbar, weil die zwei neuen Trigger in einer EIGENEN Datei stehen.
    const neu = readFileSync(join(ORDNER, "0001_append_only.sql"), "utf8");
    const alt = readFileSync("../lagerbuch/drizzle/0001_append_only.sql", "utf8");
    expect(neu).toBe(alt);
  });
});
```

⚠️ **Die letzte Zusicherung setzt voraus, dass `../lagerbuch` neben `iuk-suite` ausgecheckt ist.**
Das ist im Arbeitsbaum der Fall (`/Users/rubeen/dev/personal/drk/lagerbuch`, eingefroren auf
`ca04eb1`). Steht das Alt-Repo woanders, ist der Pfad **im Test** anzupassen und der neue Pfad im
Commit-Text zu nennen — die Zusicherung wird **nicht** gestrichen. Nach dem Abbau des Alt-Stacks
(Spec 2) wird sie durch die eingecheckte Kopie ersetzt; bis dahin ist sie der einzige Beweis der
Wörtlichkeit.

- [ ] **Schritt 4: Test laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/migrations.test.ts
```

Erwartet: PASS. **Schlägt eine Spaltenzusicherung fehl, ist zuerst `schema.ts` verdächtig, nicht die
Erwartungstabelle** — sie ist die ausgeschriebene Fassung von §4.8 bis §4.12 und der eigentliche
Prüfling.

- [ ] **Schritt 5: Die Gegenprobe, dass der Test etwas prüft**

Eine Spalte in `schema.ts` probeweise auf `.notNull()` setzen, die es nicht ist (etwa
`artikel.bestelltAt`), `drizzle-kit generate` **nicht** laufen lassen, Test starten:

```bash
pnpm vitest run src/app/m/lagerbuch/_db/migrations.test.ts
```

Erwartet: weiterhin PASS — der Test misst die **Migration**, nicht `schema.ts`. Danach die Änderung
zurücknehmen und die Gegenprobe an der richtigen Stelle fahren: eine Zeile in `TABELLEN` verfälschen
→ der Test muss **rot** werden. Beides zurücknehmen.

- [ ] **Schritt 6: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_db/testdb.ts src/app/m/lagerbuch/_db/migrations.test.ts
git commit -m "test(lagerbuch): das Schema ist das, was §4 behauptet

Spalten, Typen, Nullbarkeit, Defaults und Indexliste je Tabelle gegen eine
ausgeschriebene Erwartung — die Beweispflicht, die das Regenerieren erzeugt.
Dazu die Zeitstempel-Einheit als ROHER Spaltenwert (zehn Stellen): der einzige
Test, der die 1000er-Falle sehen kann, weil jede Pruefung ueber mode:
'timestamp' in beiden Richtungen dieselbe Umrechnung faehrt.

Ausserdem: die Handlager-Migrationszeile, dass foreign_keys wirklich beisst,
die strenge Monotonie von meta/_journal.json und dass 0001_append_only.sql
woertlich die Datei aus lagerbuch@ca04eb1 ist.

_db/testdb.ts ist der gemeinsame Aufbau fuer die uebrigen neun _db-Tests:
Datei-DB, foreign_keys = ON, lb_falte, abgespielte Migrationen."
```

---

### Task 10: `_lib/host.ts` — der Riegel, den kein Gate findet

**Files:**
- Create: `src/app/m/lagerbuch/_lib/host.ts`
- Test: `src/app/m/lagerbuch/_lib/host.test.ts`

**Interfaces:**
- Consumes: der Registry-Eintrag (T2).
- Produces:
  ```ts
  export function istLagerbuchHost(headers: Headers): boolean;
  export function requireLagerbuchHost(headers: Headers): void;          // wirft notFound()
  export function lagerbuchHostOderNull(headers: Headers): "lagerbuch" | null;
  ```
  Konsumiert von: `helferZugang.ts` (Teil 2, **intern als erste Anweisung**), dem Gate, beiden
  Rollen-Weichen, allen vier Layouts (Teile 3–5) und den sieben Route Handlern.

**Der Befund.** `decideRoute` behandelt interne Pfade gesondert und gatet nach dem **Modul aus dem
Segment**, nicht nach dem Host. Für ein Modul mit `requiresAuth: false` steigt `canAccess` sofort mit
`true` aus, der Zweig endet also bei `{ action: "next" }` — **gleichgültig, welcher Host gefragt
hat**. `proxy.ts:103` nimmt `/m/*` bewusst nicht aus dem Matcher; das wäre ein Auth-Bypass. Folge:
sobald lagerbuch das zwingende `requiresAuth: false` bekommt, beantwortet **jeder** Host, der auf den
Suite-Container terminiert, `/m/lagerbuch/t/<code>`, `/m/lagerbuch/g/<code>`,
`/m/lagerbuch/helfer/*` und `/m/lagerbuch/verwaltung/*`.

*Kein Gate:* das Verhalten ist nicht bloß ungetestet, es ist **festgeschrieben** —
`core/routing.test.ts:61-65` prüft ausdrücklich, dass interne Pfade nach dem Segment gegatet werden.
`typecheck`, `lint` und `pnpm build` sehen nichts; Playwright fährt gegen genau **einen** `baseURL`.

**Warum das für lagerbuch nicht kosmetisch ist.** Der Verwaltungsriegel ist host-blind und bleibt es
— `/m/lagerbuch/verwaltung/*` ist auf fremdem Host genauso gegatet. Es ist **kein
Autorisierungs-Bypass**. Teuer ist `/t/<code>`: davor steht allein das Rate-Limit, und `redeemToken`
schreibt `lastUsedAt`. Zwei Folgen mit Datenwirkung:

1. **Die Token-Tabelle sagt danach etwas Falsches** — „zuletzt ⟨Zeitstempel⟩" statt „nie benutzt",
   für einen Code, den niemand benutzt hat.
2. **Das Cookie landet auf dem fremden Host.** `helferCookieOptionen()` führt kein `domain`, ist also
   host-only. Bleibt der Redirect relativ, läuft lagerbuch auf dem fremden Host **vollständig** — als
   zweite funktionierende Herkunft desselben Moduls, die in keinem Runbook steht und deren Sitzungen
   niemand sieht. **Das ist die Folge, die den Riegel allein trägt:** echte Buchungen in ein
   append-only Journal aus einer unbeobachteten Herkunft sind nicht rückbaubar.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

// `notFound()` wirft in der echten Laufzeit einen Next-internen Fehler. Fuer die
// Unit-Aussage genuegt ein erkennbarer Wurf — geprueft wird, DASS geworfen wird.
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import { istLagerbuchHost, requireLagerbuchHost, lagerbuchHostOderNull } from "./host";

const kopf = (h: Record<string, string>) => new Headers(h);
const alterWert = process.env.SUITE_HOST_LAGERBUCH;
afterEach(() => {
  if (alterWert === undefined) delete process.env.SUITE_HOST_LAGERBUCH;
  else process.env.SUITE_HOST_LAGERBUCH = alterWert;
});

describe("istLagerbuchHost", () => {
  it("trifft den Dev-Host OHNE jede Env", () => {
    // Genau dieser Fall macht den „kein Prod-Host konfiguriert → durchlassen"-Zweig
    // ueberfluessig: moduleForHost trifft <key>.localtest.me VOR und UNABHAENGIG
    // von prodHostsFor. Damit laeuft in Dev, E2E und Produktion derselbe Code-Pfad.
    delete process.env.SUITE_HOST_LAGERBUCH;
    expect(istLagerbuchHost(kopf({ host: "lagerbuch.localtest.me" }))).toBe(true);
  });

  it("trifft den konfigurierten Prod-Host", () => {
    process.env.SUITE_HOST_LAGERBUCH = "lagerbuch.iuk-ue.de";
    expect(istLagerbuchHost(kopf({ host: "lagerbuch.iuk-ue.de" }))).toBe(true);
  });

  it("weist einen FREMDEN Suite-Host ab", () => {
    expect(istLagerbuchHost(kopf({ host: "feedback.localtest.me" }))).toBe(false);
    expect(istLagerbuchHost(kopf({ host: "iuk-ue.de" }))).toBe(false);
  });

  it("bevorzugt x-forwarded-host vor host — die Vorrangregel aus core/routing", () => {
    // Nach dem Rewrite der Middleware ist das die einzig richtige Reihenfolge. Eine
    // zweite Aufloesung waere der Ort, an dem beide auseinanderlaufen; deshalb wird
    // `resolveHost` wiederverwendet, nicht nachgebaut.
    expect(istLagerbuchHost(kopf({
      "x-forwarded-host": "lagerbuch.localtest.me", host: "feedback.localtest.me",
    }))).toBe(true);
    expect(istLagerbuchHost(kopf({
      "x-forwarded-host": "feedback.localtest.me", host: "lagerbuch.localtest.me",
    }))).toBe(false);
  });

  it("ignoriert einen Port", () => {
    expect(istLagerbuchHost(kopf({ host: "lagerbuch.localtest.me:3000" }))).toBe(true);
  });

  it("hat KEINEN 'kein Prod-Host konfiguriert → durchlassen'-Zweig", () => {
    // Er waere die Sperre, die sich selbst abschaltet: solange SUITE_HOST_LAGERBUCH
    // fehlt, waere genau der Zustand offen, gegen den die Datei gebaut ist.
    delete process.env.SUITE_HOST_LAGERBUCH;
    expect(istLagerbuchHost(kopf({ host: "irgendwas.example.org" }))).toBe(false);
  });
});

describe("requireLagerbuchHost — fuer LAYOUTS UND SEITEN, erste Anweisung", () => {
  it("laesst den eigenen Host durch", () => {
    expect(() => requireLagerbuchHost(kopf({ host: "lagerbuch.localtest.me" }))).not.toThrow();
  });

  it("wirft auf fremdem Host — notFound(), KEIN 403", () => {
    // Die Existenz eines Pfades auf dem falschen Host wird nicht verraten
    // (docs/design/README.md:237-242).
    expect(() => requireLagerbuchHost(kopf({ host: "feedback.localtest.me" })))
      .toThrow("NEXT_NOT_FOUND");
  });
});

describe("lagerbuchHostOderNull — fuer ROUTE HANDLER", () => {
  it("wirft NIE", () => {
    // Ein notFound() ist keine brauchbare Antwort auf einen gescannten QR-Code;
    // der Handler baut seine 404 selbst.
    expect(lagerbuchHostOderNull(kopf({ host: "lagerbuch.localtest.me" }))).toBe("lagerbuch");
    expect(lagerbuchHostOderNull(kopf({ host: "feedback.localtest.me" }))).toBeNull();
    expect(lagerbuchHostOderNull(kopf({}))).toBeNull();
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/host.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./host"`.

- [ ] **Schritt 3: `_lib/host.ts` schreiben**

```ts
import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Der modul-eigene Host-Riegel — Entscheidung 10 (d), additiv zu (a), nach dem
 * produktiv laufenden Muster von `m/files/_lib/hostRolle.ts:90-121`. Anders als
 * `files` hat lagerbuch EINE Rolle, also drei Funktionen statt sechs.
 *
 * KEIN "use client": Server Components UND Route Handler lesen hier.
 *
 * WARUM ES IHN GIBT: `decideRoute` gatet interne Pfade nach dem MODUL AUS DEM
 * SEGMENT, nicht nach dem Host (core/routing.ts:58-66), und fuer ein Modul mit
 * `requiresAuth: false` steigt `canAccess` sofort mit true aus. Ohne diese Datei
 * beantwortet JEDER Host, der auf den Suite-Container terminiert,
 * /m/lagerbuch/t/<code> — und `redeemToken` schreibt `lastUsedAt`. Das Cookie
 * laege dann host-only auf dem fremden Host, und lagerbuch liefe dort
 * VOLLSTAENDIG: eine zweite Herkunft, die in keinem Runbook steht und aus der
 * echte Buchungen in ein append-only Journal laufen.
 *
 * Kein Gate faengt das: core/routing.test.ts:61-65 schreibt das Verhalten sogar
 * ausdruecklich fest, und Playwright faehrt gegen genau einen baseURL (Falle 57).
 */

/**
 * Ist das der Lagerbuch-Host? `moduleForHost(resolveHost(headers))?.key` und
 * NICHT ein direkter Vergleich gegen prodHostsFor:
 *
 * - `moduleForHost` (registry.ts:141-148) trifft `lagerbuch.localtest.me` VOR und
 *   UNABHAENGIG von prodHostsFor. Damit laeuft derselbe Code-Pfad in Dev, E2E und
 *   Produktion, OHNE dass SUITE_HOST_LAGERBUCH lokal gesetzt sein muss.
 * - `resolveHost` (routing.ts:36-41) wird WIEDERVERWENDET, nicht nachgebaut: seine
 *   Vorrangregel `x-forwarded-host` vor `host` ist nach dem Rewrite der Middleware
 *   die einzig richtige. Eine zweite Aufloesung waere der Ort, an dem beide
 *   auseinanderlaufen.
 *
 * ES GIBT KEINEN „kein Prod-Host konfiguriert -> durchlassen"-ZWEIG. Er waere die
 * Sperre, die sich selbst abschaltet: solange SUITE_HOST_LAGERBUCH fehlt, waere
 * genau der Zustand offen, gegen den die Datei gebaut ist. Die Praedikatsform
 * oben macht ihn ueberfluessig, weil sie den Dev-Host ohne jede Env deckt.
 */
export function istLagerbuchHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "lagerbuch";
}

/** Fuer LAYOUTS UND SEITEN, erste Anweisung. Wirft. Kein 403: die Existenz eines
 *  Pfades auf dem falschen Host wird nicht verraten (docs/design/README.md:237-242). */
export function requireLagerbuchHost(headers: Headers): void {
  if (!istLagerbuchHost(headers)) notFound();
}

/** Fuer ROUTE HANDLER. Wirft NIE — ein notFound() ist keine brauchbare Antwort auf
 *  einen gescannten QR-Code; der Handler baut seine 404 selbst. */
export function lagerbuchHostOderNull(headers: Headers): "lagerbuch" | null {
  return istLagerbuchHost(headers) ? "lagerbuch" : null;
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/host.test.ts
```

Erwartet: PASS.

- [ ] **Schritt 5: Die Verankerungstabelle als Kommentar sichern**

An das Ende von `_lib/host.ts` anfügen — sie ist die Liste, gegen die die Teile 2 bis 5 prüfen, und
**die dritte Stelle vergisst man**:

```ts
/**
 * WO DIESE FUNKTIONEN GERUFEN WERDEN — verbindlich (§2.6). Route Handler haben
 * KEIN Layout; die Sperre erreicht sie ueber kein Group-Layout.
 *
 *   verwaltung/(arbeit)/layout.tsx      requireLagerbuchHost      Teil 5
 *   verwaltung/(druck)/layout.tsx       requireLagerbuchHost      Teil 6
 *   helfer/layout.tsx                   requireLagerbuchHost      Teil 4
 *   page.tsx (Gate)                     requireLagerbuchHost      Teil 4
 *   g/[code]/page.tsx, a/[…]/page.tsx   requireLagerbuchHost      Teil 4
 *   t/[code]/route.ts                   lagerbuchHostOderNull     Teil 4  ← Tuer mit Datenwirkung
 *   abmelden/route.ts                   lagerbuchHostOderNull     Teil 2/4
 *   manifest + vier Icon-Handler        lagerbuchHostOderNull     Teil 4
 *   einloesenAmGate, erneuereSitzung    requireLagerbuchHost      Teil 4  ← die WERFENDE Form
 *   requireHelferSitzung/-Schreibend    rufen requireLagerbuchHost INTERN, erste Anweisung
 *
 * DIE LETZTE ZEILE IST KEINE BEQUEMLICHKEIT. `requireHelfer` prueft heute
 * Cookie-Signatur und tokens.aktiv und gibt {tokenId, code} zurueck — KEINEN Host.
 * Ein helfer_session-Cookie, das ueber einen fremden Suite-Host entstanden ist, waere
 * dort ein VOLLGUELTIGER Ausweis fuer bucheEntnahmeHelfer und checkAbschluss. Weil der
 * Host-Riegel INNEN sitzt, ist die Zusage „jede Helfer-Action ist host-gebunden" durch
 * KONSTRUKTION wahr — nicht durch eine Liste, die die naechste Action vergisst.
 *
 * FUER DIE VERWALTUNGS-ACTIONS GILT: kein Host-Riegel, nur der Zugriffsriegel. Der ist
 * host-blind und vollstaendig — eine Admin-Action auf fremdem Host verlangt dieselbe
 * Gruppe wie auf der eigenen Domain und ist damit kein Autorisierungsproblem.
 *
 * ⚠️ Die Zahl der Hosts in SUITE_HOST_LAGERBUCH ist NICHT begrenzt: 0 (vor dem
 * Cutover), 1 (Normalfall) und ≥ 2 (abgeloeste Domain laeuft mit) sind alle erlaubt.
 * Es gibt deshalb KEIN validateLagerbuchHosts — Tippfehler, Protokoll/Port im Wert und
 * doppelt vergebene Hosts faengt bereits validateHostConfig (core/hosts.ts:65-100).
 */
```

- [ ] **Schritt 6: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/host.ts src/app/m/lagerbuch/_lib/host.test.ts
git commit -m "feat(lagerbuch): _lib/host.ts — der modulinterne Host-Riegel (Falle 61)

decideRoute gatet interne Pfade nach dem Modul aus dem SEGMENT, nicht nach dem
Host; bei requiresAuth: false steigt canAccess sofort mit true aus. Ohne diesen
Riegel beantwortet jeder terminierende Host /m/lagerbuch/t/<code>, redeemToken
schreibt lastUsedAt, und das host-only Cookie laesst lagerbuch auf einer
zweiten, unbeobachteten Herkunft vollstaendig laufen — mit echten Buchungen in
ein append-only Journal.

Drei Funktionen: Praedikat, werfende Form fuer Layouts und Seiten,
nicht-werfende fuer Route Handler (ein notFound() ist keine brauchbare Antwort
auf einen gescannten QR-Code). Kein 'kein Prod-Host → durchlassen'-Zweig — er
waere die Sperre, die sich selbst abschaltet."
```

---

**Gate Stufe 4a.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

### Task 11: `_db/append-only.test.ts` — „die Trigger sind da, und sie sind es aus der Migration"

**Files:**
- Create: `src/app/m/lagerbuch/_db/append-only.test.ts`

**Interfaces:**
- Consumes: `_db/testdb.ts` (T9), `_db/schema.ts` (T7), `_db/migrations/` (T8).
- Produces: nichts für andere Tasks — die Datei **ist** die Zusage.

**Die eine Eigenschaft, wegen der der Test überhaupt greift.** Die Test-DB entsteht durch **Abspielen
der Migrationen**, nicht durch einen Schema-Push. Das war im Alt-Repo bereits so
(`src/db/testing.ts:10` → `applyMigrations`) und ist die einzige Eigenschaft, die zählt: ein
schema-gepushter Aufbau macht die Datei grün und **inhaltsleer**, weil drizzle-kit keine Trigger
erzeugt. `migrierteTestDb()` (T9) hält das fest.

⚠️ **Die Suite hat heute keinen einzigen Test, der SQLite-Trigger anfasst (Falle 1). Diese Datei ist
der erste.**

- [ ] **Schritt 1: Den Test schreiben**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, chargen, lagerorte, buchungen, bzGeraete, bzKontrollen,
         o2Flaschen, o2Messungen, newId } from "./schema";

/**
 * „Die Trigger sind da, und sie sind es AUS DER MIGRATION."
 *
 * Portierung von lagerbuch/src/db/append-only.test.ts:19-37 mit EINER
 * entscheidenden Eigenschaft: `migrierteTestDb()` spielt die Migrationen ab. Ein
 * schema-gepushter Aufbau macht diese Datei gruen und INHALTSLEER — drizzle-kit
 * erzeugt keine Trigger.
 */
let t: TestDb;
let ids: { lagerId: string; artId: string; chId: string; buId: string;
           bzGeraetId: string; bzKontrolleId: string; flascheId: string; messungId: string };

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-appendonly-");
  const now = new Date();
  const lagerId = "handlager";     // von 0003_handlager.sql, schon da
  const artId = newId(); const chId = newId(); const buId = newId();
  const bzGeraetId = newId(); const bzKontrolleId = newId();
  const flascheId = newId(); const messungId = newId();

  t.db.insert(artikel).values({ id: artId, name: "Mullbinde", einheit: "Stk.", fach: "A2",
    mindestbestand: 10, createdAt: now }).run();
  t.db.insert(chargen).values({ id: chId, artikelId: artId, chargenNr: "X-1",
    verfall: "2028-06", createdAt: now }).run();
  t.db.insert(buchungen).values({ id: buId, ts: now, typ: "zugang", artikelId: artId,
    chargeId: chId, lagerortId: lagerId, menge: 5, quelleTyp: "system", quelleId: "seed" }).run();

  t.db.insert(bzGeraete).values({ id: bzGeraetId, name: "Accu-Chek", lagerortId: lagerId,
    createdAt: now }).run();
  t.db.insert(bzKontrollen).values({ id: bzKontrolleId, geraetId: bzGeraetId, ts: now,
    quelleTyp: "system", quelleId: "seed", bestanden: true }).run();

  t.db.insert(o2Flaschen).values({ id: flascheId, name: "O2-1", lagerortId: lagerId,
    createdAt: now }).run();
  t.db.insert(o2Messungen).values({ id: messungId, flascheId, ts: now, druckBar: 180,
    quelleTyp: "system", quelleId: "seed" }).run();

  ids = { lagerId, artId, chId, buId, bzGeraetId, bzKontrolleId, flascheId, messungId };
});

afterEach(() => t.schliessen());

describe("buchungen — das Journal (0001, woertlich aus der Alt-App)", () => {
  it("erlaubt INSERT", () => {
    expect(t.db.select().from(buchungen).all()).toHaveLength(1);
  });

  it("blockiert UPDATE", () => {
    expect(() => t.db.update(buchungen).set({ menge: 99 })
      .where(eq(buchungen.id, ids.buId)).run()).toThrow(/append-only/);
  });

  it("blockiert DELETE", () => {
    expect(() => t.db.delete(buchungen).where(eq(buchungen.id, ids.buId)).run())
      .toThrow(/append-only/);
  });

  it("blockiert auch eine sqlite3-Sitzung von Hand — es ist kein Konventionsschutz", () => {
    // Die Datenbank bricht jedes UPDATE und DELETE ab, unabhaengig davon, welcher
    // Prozess es faehrt. Es ist die einzige Invariante des Moduls, die nicht im
    // Code steht.
    expect(() => t.sqlite.prepare("update buchungen set menge = 99").run())
      .toThrow(/append-only/);
  });
});

describe("bz_kontrollen — der Medizinprodukte-Nachweis (0002, neu mit S2)", () => {
  it("erlaubt INSERT", () => {
    expect(t.db.select().from(bzKontrollen).all()).toHaveLength(1);
  });

  it("blockiert UPDATE", () => {
    expect(() => t.db.update(bzKontrollen).set({ bestanden: false })
      .where(eq(bzKontrollen.id, ids.bzKontrolleId)).run()).toThrow(/append-only/);
  });

  it("blockiert DELETE", () => {
    expect(() => t.db.delete(bzKontrollen).where(eq(bzKontrollen.id, ids.bzKontrolleId)).run())
      .toThrow(/append-only/);
  });
});

describe("o2_messungen — die BEWUSSTE Gegenprobe zu Entscheidung 5 (c)", () => {
  /**
   * Ohne diese drei Zusicherungen ist der Unterschied zwischen „bewusst offen
   * gelassen" und „vergessen" nicht lesbar.
   *
   * Der Grund: der Sauerstoff-Schritt des Fahrzeug-Checks ist auf den
   * Nennfuelldruck VORBELEGT und sendet beim Abschluss ausnahmslos alle Flaschen
   * des Standorts. Wer ihn durchklickt, erzeugt einen positiv aussehenden,
   * fachlich wertlosen Messwert — der in KEINEN der zwei Zweige aus §5.12 faellt
   * („auffaellig" / „nicht bewertbar"): er sieht plausibel aus und zaehlt als
   * bewertet. Der Entwurf erzeugt also selbst den Bedarf an Loeschbarkeit, den ein
   * Trigger hier wegnaehme.
   */
  it("erlaubt UPDATE", () => {
    expect(() => t.db.update(o2Messungen).set({ druckBar: 150 })
      .where(eq(o2Messungen.id, ids.messungId)).run()).not.toThrow();
  });

  it("erlaubt DELETE", () => {
    expect(() => t.db.delete(o2Messungen).where(eq(o2Messungen.id, ids.messungId)).run())
      .not.toThrow();
  });
});

describe("checks und lagerort_verfall bekommen ausdruecklich KEINE Trigger", () => {
  it("es gibt genau vier Trigger im Schema, und sie heissen so", () => {
    const namen = (t.sqlite.prepare(
      "select name from sqlite_master where type = 'trigger' order by name",
    ).all() as { name: string }[]).map((r) => r.name);
    expect(namen).toEqual([
      "buchungen_no_delete", "buchungen_no_update",
      "bz_kontrollen_no_delete", "bz_kontrollen_no_update",
    ]);
  });
});

describe("INSERT OR REPLACE — die gemessene Tatsache, nicht die Beschwerde", () => {
  it("umgeht den Trigger bei recursive_triggers = 0 (dem Default)", () => {
    // Selbst nachgemessen an better-sqlite3 ^12.11.1. `openModuleDatabase` setzt
    // genau vier Pragmas, und dieses ist KEINES davon. Wer einen Abbruch mit
    // INSERT OR REPLACE „repariert", hebelt die Append-only-Zusage lautlos aus —
    // und der Paritaetscheck bleibt gruen, weil er nur Zeileninhalte vergleicht.
    //
    // Dieser Test HAELT DIE TATSACHE FEST. Er ist der Grund, warum das
    // Import-Kapitel INSERT OR IGNORE vorschreibt, und er wird rot, falls eine
    // spaetere SQLite-Fassung das aendert.
    expect(t.sqlite.pragma("recursive_triggers", { simple: true })).toBe(0);

    expect(() => t.sqlite.prepare(
      `insert or replace into buchungen
         (id, ts, typ, artikel_id, charge_id, lagerort_id, menge, quelle_typ, quelle_id)
       values (?, ?, 'zugang', ?, ?, ?, 999, 'system', 'ersetzt')`,
    ).run(ids.buId, 1770000000, ids.artId, ids.chId, ids.lagerId)).not.toThrow();

    const z = t.sqlite.prepare("select menge from buchungen where id = ?")
      .get(ids.buId) as { menge: number };
    expect(z.menge).toBe(999);   // stillschweigend ueberschrieben
  });

  it("mit PRAGMA recursive_triggers = ON bricht derselbe Aufruf ab", () => {
    t.sqlite.pragma("recursive_triggers = ON");
    expect(() => t.sqlite.prepare(
      `insert or replace into buchungen
         (id, ts, typ, artikel_id, charge_id, lagerort_id, menge, quelle_typ, quelle_id)
       values (?, ?, 'zugang', ?, ?, ?, 999, 'system', 'ersetzt')`,
    ).run(ids.buId, 1770000000, ids.artId, ids.chId, ids.lagerId)).toThrow(/append-only/);
  });

  it("INSERT OR IGNORE ist das vorgeschriebene Idiom: laeuft durch, Zeile bleibt", () => {
    expect(() => t.sqlite.prepare(
      `insert or ignore into buchungen
         (id, ts, typ, artikel_id, charge_id, lagerort_id, menge, quelle_typ, quelle_id)
       values (?, ?, 'zugang', ?, ?, ?, 999, 'system', 'ignoriert')`,
    ).run(ids.buId, 1770000000, ids.artId, ids.chId, ids.lagerId)).not.toThrow();

    const z = t.sqlite.prepare("select menge, quelle_id from buchungen where id = ?")
      .get(ids.buId) as { menge: number; quelle_id: string };
    expect(z).toEqual({ menge: 5, quelle_id: "seed" });   // unveraendert
  });
});
```

- [ ] **Schritt 2: Test laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/append-only.test.ts
```

Erwartet: PASS.

⚠️ **Läuft die `INSERT OR REPLACE`-Zusicherung ANDERS aus als beschrieben** (also: der erste Fall
wirft), ist das **kein Grund, den Test zu streichen** — es ist eine geänderte SQLite-Eigenschaft. Dann
wird die Erwartung an die Messung angepasst **und** der Befund im Commit-Text sowie in der
Cutover-Notiz benannt: das Import-Idiom `INSERT OR IGNORE` bleibt in beiden Fällen richtig.

- [ ] **Schritt 3: Die Gegenprobe, dass der Test aus der MIGRATION prüft**

In `_db/testdb.ts` probeweise `migrate(...)` durch einen Schema-Push ersetzen wäre der ehrliche
Nachweis — er ist aber aufwendig. Billiger und genauso aussagekräftig:

```bash
mv src/app/m/lagerbuch/_db/migrations/0001_append_only.sql /tmp/ && \
  pnpm vitest run src/app/m/lagerbuch/_db/append-only.test.ts ; \
  mv /tmp/0001_append_only.sql src/app/m/lagerbuch/_db/migrations/
```

Erwartet: der Lauf **schlägt fehl** (die Migration bricht ab, weil `meta/_journal.json` die Datei
nennt). Danach ist die Datei wieder am Platz — mit `git status` prüfen.

- [ ] **Schritt 4: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_db/append-only.test.ts
git commit -m "test(lagerbuch): die Trigger sind da — und sie sind es aus der Migration

Der erste Test der Suite, der SQLite-Trigger anfasst (Falle 1). Gegen eine
ABGESPIELTE Migration, nicht gegen ein gepushtes Schema: drizzle-kit erzeugt
keine Trigger, ein Push machte die Datei gruen und inhaltsleer.

buchungen und bz_kontrollen blockieren UPDATE und DELETE, auch aus einer
sqlite3-Sitzung von Hand. o2_messungen erlaubt beides — die BEWUSSTE Gegenprobe
zu Entscheidung 5 (c), ohne die 'bewusst offen gelassen' von 'vergessen' nicht
zu unterscheiden ist.

Dazu die gemessene Tatsache, dass INSERT OR REPLACE den Trigger bei
recursive_triggers = 0 umgeht und mit ON abbricht. Sie ist der Grund, warum das
Import-Kapitel INSERT OR IGNORE vorschreibt."
```

---

### Task 12: `_db/client.ts` — der modul-eigene Opener mit `lb_falte`

**Files:**
- Create: `src/app/m/lagerbuch/_db/client.ts`
- Test: `src/app/m/lagerbuch/_db/client.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` (T7), `_lib/suche.ts` (T5).
- Produces:
  ```ts
  export function getDb(): ReturnType<typeof drizzle<typeof schema>>;
  export type DB = ReturnType<typeof getDb>;
  ```
  Konsumiert von jedem Lese- und Schreibpfad ab Teil 3, von `_db/quelle.ts` (T13) und von
  `_db/etiketten.ts` (Teil 6).

**Warum lagerbuch NICHT `getModuleDb` benutzt.** Die Journalsuche läuft über zwei Hälften, und die
Hälften falten heute verschieden (T5). Die einzige Heilung, die **nichts speichert** — und damit am
Append-only-Trigger vorbeikommt —, ist eine benutzerdefinierte SQLite-Funktion zur Abfragezeit.
`openModuleDatabase` bietet dafür keinen Haken, und eine `core`-Erweiterung hätte heute **keinen
zweiten Nutznießer**.

**Die Zwei-Verbindungs-Gefahr wird geschlossen, nicht abgegeben — dreifach:**
1. **Derselbe Cache-Schlüssel**, den `getModuleDb` benutzt (`globalThis.__suiteDb["lagerbuch"]`). Ein
   später hinzugefügtes `getModuleDb("lagerbuch", schema)` fände den vorhandenen Eintrag **mit**
   registrierter Funktion vor, statt eine zweite Verbindung ohne sie zu öffnen.
2. **Die Auslassung in `seedAllModules()`** (T8): nachgeprüft die **einzige** `core`-Stelle, die
   `getModuleDb(<key>, schema)` ruft. `migrateAllModules` öffnet eine eigene, schema-freie Verbindung
   und schließt sie wieder; `core/health` tut dasselbe und fährt nur `SELECT 1`.
3. **Der Quelltext-Scan** — er entsteht hier (Schritt 4).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";

const g = globalThis as unknown as { __suiteDb?: Record<string, unknown> };
let aufraeumen: (() => void)[] = [];
afterEach(() => { aufraeumen.forEach((f) => f()); aufraeumen = []; delete g.__suiteDb; });

async function frischerClient(): Promise<typeof import("./client")> {
  const ordner = mkdtempSync(join(tmpdir(), "lagerbuch-client-"));
  process.env.DATA_DIR = ordner;
  aufraeumen.push(() => rmSync(ordner, { recursive: true, force: true }));
  delete g.__suiteDb;
  // Frisch importieren, damit der Modulzustand nicht aus einem vorigen Test stammt.
  return await import(`./client?t=${ordner}`);
}

describe("getDb — der modul-eigene Opener", () => {
  it("registriert lb_falte, und die Funktion faltet unicode-faehig", async () => {
    // Ohne diese Registrierung scheitert jede Journalsuche mit
    // `no such function: lb_falte` — auf genau einem Codepfad.
    const { getDb } = await frischerClient();
    const db = getDb();
    const r = db.$client.prepare("select lb_falte('PÄCKCHEN') as v").get() as { v: string };
    expect(r.v).toBe("päckchen");
  });

  it("lb_falte reicht NULL durch", async () => {
    const { getDb } = await frischerClient();
    const r = getDb().$client.prepare("select lb_falte(NULL) as v").get() as { v: null };
    expect(r.v).toBeNull();
  });

  it("cacht unter DEMSELBEN Schluessel, den getModuleDb benutzt", async () => {
    // Das ist die eigentliche Absicherung gegen zwei Verbindungen auf dieselbe
    // WAL-Datei: ein spaeter hinzugefuegtes getModuleDb("lagerbuch", schema) faende
    // den vorhandenen Eintrag MIT registrierter Funktion vor.
    const { getDb } = await frischerClient();
    const a = getDb();
    expect(g.__suiteDb?.["lagerbuch"]).toBe(a);
    expect(getDb()).toBe(a);
  });

  it("erbt die vier Pragmas von openModuleDatabase", async () => {
    // Der Opener benutzt dieselbe Funktion und ergaenzt allein lb_falte.
    // `foreign_keys` ist eine VERBINDUNGS-Eigenschaft und standardmaessig AUS —
    // ohne sie waeren alle FK-Zusagen des Moduls gruen, ohne zu gelten.
    const { getDb } = await frischerClient();
    const s = getDb().$client;
    expect(s.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(s.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(s.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(s.pragma("synchronous", { simple: true })).toBe(1);   // NORMAL
  });
});

describe("Quelltext-Scan: das Modul oeffnet seine DB an genau EINER Stelle", () => {
  it("kein getModuleDb ausserhalb von _db/client.ts", () => {
    // Eine zweite Verbindung kennte lb_falte nicht. Der Scan haelt die Bauform fest;
    // der geteilte Cache-Schluessel und die Auslassung in seedAllModules() sind die
    // beiden anderen Beine.
    const wurzel = "src/app/m/lagerbuch";
    const treffer = readdirSync(wurzel, { recursive: true, encoding: "utf8" })
      .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.endsWith("_db/client.ts"))
      .map((f) => join(wurzel, f))
      .filter((f) => /\bgetModuleDb\s*\(/.test(readFileSync(f, "utf8")));
    expect(treffer).toEqual([]);
  });

  it("core/bootstrap.ts fuehrt lagerbuch NICHT in seedAllModules", () => {
    const boot = readFileSync("src/core/bootstrap.ts", "utf8");
    const seed = boot.slice(boot.indexOf("function seedAllModules"));
    expect(seed).not.toContain("lagerbuch");
  });
});
```

⚠️ **Zwei Griffe in diesem Test, die scheitern können, ohne dass die Aussage falsch wäre:**

1. **Der Import mit Query-String (`./client?t=…`)** holt den Modulzustand je Test neu. Trägt er in
   der installierten Vitest-Fassung nicht, ist der Ersatz `vi.resetModules()` vor dem
   `await import("./client")`.
2. **`db.$client`** ist der Zugriff auf das darunterliegende `better-sqlite3`-Handle (drizzle-orm
   ≥ 0.30). Existiert die Eigenschaft nicht, gibt `getDb()` sie über einen zusätzlichen Export
   heraus — `export const getSqlite = () => …` neben `getDb()` — **statt** die Zusicherungen zu
   streichen. Sie sind der einzige Beweis, dass `lb_falte` und die vier Pragmas wirklich anliegen.

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/client.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./client"`.

- [ ] **Schritt 3: `_db/client.ts` schreiben**

```ts
import { openModuleDatabase, moduleDbPath } from "@/core/db";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { falte } from "../_lib/suche";

/**
 * WARUM lagerbuch NICHT `getModuleDb` benutzt: `journalEintraege` sucht ueber
 * zwei Haelften (JS-Artikelname, SQL-Kommentar), und die Haelften falten heute
 * verschieden (§5.13.2). Die einzige Heilung, die NICHTS speichert — und damit
 * am Append-only-Trigger vorbeikommt —, ist eine benutzerdefinierte
 * SQLite-Funktion zur Abfragezeit. `openModuleDatabase` bietet dafuer keinen
 * Haken, und eine core-Erweiterung haette heute KEINEN zweiten Nutzniesser.
 *
 * DER CACHE-SCHLUESSEL IST DERSELBE, den `getModuleDb` benutzt
 * (`globalThis.__suiteDb["lagerbuch"]`, core/db/index.ts:25-35). Das ist die
 * eigentliche Absicherung gegen zwei Verbindungen auf dieselbe WAL-Datei: ein
 * spaeter hinzugefuegtes `getModuleDb("lagerbuch", schema)` faende den
 * vorhandenen Eintrag MIT registrierter Funktion vor, statt eine zweite
 * Verbindung ohne sie zu oeffnen. Der Quelltext-Scan in client.test.ts bleibt
 * trotzdem — er haelt die Bauform fest, aber er ist nicht mehr die einzige
 * Absicherung.
 *
 * DIE VIER PRAGMAS (WAL, foreign_keys, busy_timeout, synchronous) kommen
 * unveraendert aus `openModuleDatabase`; dieser Opener ergaenzt allein `lb_falte`.
 *
 * TRAEGT DIESE RAHMUNG NICHT, ist der benannte Rueckfall Entscheidung (a): die
 * Ungleichheit der beiden Suchhaelften 1:1 uebernehmen und ausschreiben — nicht
 * eine halb gebaute UDF.
 */
const g = globalThis as unknown as { __suiteDb?: Record<string, unknown> };

export function getDb() {
  g.__suiteDb ??= {};
  if (!g.__suiteDb["lagerbuch"]) {
    const sqlite = openModuleDatabase(moduleDbPath("lagerbuch"));
    sqlite.function("lb_falte", { deterministic: true },
      (v: string | null) => (v === null ? null : falte(v)));
    g.__suiteDb["lagerbuch"] = drizzle(sqlite, { schema });
  }
  return g.__suiteDb["lagerbuch"] as ReturnType<typeof drizzle<typeof schema>>;
}

export type DB = ReturnType<typeof getDb>;
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/client.test.ts
```

Erwartet: PASS.

⚠️ **Schlägt die Pragma-Zusicherung mit einem anderen `synchronous`-Wert fehl**, ist das die
Messung — `core/db/index.ts:18-21` ist die Wahrheit, nicht diese Erwartung. Wert anpassen und im
Commit-Text nennen.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_db/client.ts src/app/m/lagerbuch/_db/client.test.ts
git commit -m "feat(lagerbuch): _db/client.ts — modul-eigener Opener mit lb_falte

lagerbuch benutzt bewusst nicht getModuleDb: die Journalsuche laeuft ueber zwei
Haelften, die verschieden falten, und die einzige Heilung, die NICHTS speichert
(und damit am Append-only-Trigger vorbeikommt), ist eine benutzerdefinierte
SQLite-Funktion zur Abfragezeit.

Die Zwei-Verbindungs-Gefahr wird geschlossen, nicht abgegeben: derselbe
Cache-Schluessel wie getModuleDb, die Auslassung in seedAllModules() und ein
Quelltext-Scan. Die vier Pragmas kommen unveraendert aus openModuleDatabase."
```

---

### Task 13: `_db/quelle.ts` — Kennung wird zu Klarname, und der benannte Defektzustand

**Files:**
- Create: `src/app/m/lagerbuch/_db/quelle.ts`
- Test: `src/app/m/lagerbuch/_db/quelle.test.ts`

**Interfaces:**
- Consumes: `_db/client.ts` (T12, nur für den Typ `DB`), `_db/schema.ts` (T7), `_db/testdb.ts` (T9).
- Produces:
  ```ts
  export type Quelle = (quelleTyp: string, quelleId: string) => string;
  export function quelleAufloeser(db: DB): Quelle;
  ```
  Konsumiert von `_lib/lesepfade/journal.ts` und `_lib/lesepfade/o2.ts` (Teil 3).
- ⚠️ **Teil 2 ERWEITERT `_db/quelle.test.ts`** um die `merkeNutzer`-Gegenprobe (Festlegung F5,
  §4.16 Punkt 4). Es entsteht **keine zweite Datei**.

**Warum die Datei unter `_db/` liegt, obwohl `_db/` keine Fachabfrage hält.** Sie ist einer von
**zwei** benannten Ausnahmen (neben `etiketten.ts`), und der Grund ist bei beiden derselbe: sie
kennen **keine Seite**, sondern nur eine Zeilenform, und jeder Lesepfad benutzt sie. Wächst hier
etwas heran, das eine Seite kennt, ist es am falschen Ort.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { quelleAufloeser } from "./quelle";
import { tokens, users } from "./schema";

let t: TestDb;
beforeEach(() => { t = migrierteTestDb("lagerbuch-quelle-"); });
afterEach(() => t.schliessen());

const ALT_SUB = "a1b2c3d4-alt";       // Kennung aus dem historischen Journal
const NEU_SUB = "e5f6g7h8-neu";       // Kennung aus dem Suite-Login

describe("quelleAufloeser", () => {
  it("loest oidc → users.name auf", () => {
    t.db.insert(users).values({ id: NEU_SUB, name: "Anna Beispiel", email: "anna@example.org" }).run();
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("Anna Beispiel");
  });

  it("faellt auf die E-Mail zurueck, wenn kein Name da ist", () => {
    t.db.insert(users).values({ id: NEU_SUB, name: null, email: "anna@example.org" }).run();
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("anna@example.org");
  });

  it("loest token → tokens.label auf, nicht den Code", () => {
    // Der Code allein sagt niemandem etwas. Ein umkodierter Token-Code macht das
    // gesamte historische Journal namenlos.
    t.db.insert(tokens).values({ id: "tk1", code: "482-137", label: "RTW 1 Kaertchen",
      aktiv: true, createdAt: new Date(), createdBy: NEU_SUB }).run();
    expect(quelleAufloeser(t.db)("token", "482-137")).toBe("RTW 1 Kaertchen");
  });

  it("loest system → 'System'", () => {
    expect(quelleAufloeser(t.db)("system", "irgendwas")).toBe("System");
  });

  it("faellt bei unbekannter Kennung auf die ROHE ID zurueck", () => {
    expect(quelleAufloeser(t.db)("oidc", "gibt-es-nicht")).toBe("gibt-es-nicht");
    expect(quelleAufloeser(t.db)("token", "999-999")).toBe("999-999");
  });

  it("traegt BEIDE Kennungsraeume nebeneinander — deshalb gibt es keine Zuordnungstabelle", () => {
    // Historische Zeilen tragen den Alt-`sub` und finden ihre importierte Zeile;
    // neue Zeilen tragen den Neu-`sub` und finden die vom Upsert geschriebene.
    // Es gibt keine Kollision, weil beide Werte Primaerschluessel DERSELBEN Tabelle
    // sind — und die Kennung wird nirgends gefiltert, gruppiert oder aggregiert,
    // nur angezeigt (§4.13).
    t.db.insert(users).values({ id: ALT_SUB, name: "Anna Beispiel", email: "anna@example.org" }).run();
    t.db.insert(users).values({ id: NEU_SUB, name: "Anna Beispiel", email: "anna@example.org" }).run();
    const q = quelleAufloeser(t.db);
    expect(q("oidc", ALT_SUB)).toBe("Anna Beispiel");
    expect(q("oidc", NEU_SUB)).toBe("Anna Beispiel");
  });

  it("DER BENANNTE DEFEKTZUSTAND: name UND email null → die rohe Kennung", () => {
    /**
     * Der Test verhindert den Zustand NICHT — er macht ihn benannt und auffindbar,
     * statt ihn als „unerklaerliche UUID im Journal" wiederzuentdecken.
     *
     * Der Ausfall im Klartext: eine Person bucht nach dem Cutover, und das Journal
     * zeigt fuer DIESE Zeile eine rohe sub-Kennung, waehrend ihre Zeilen von VOR dem
     * Cutover den Klarnamen tragen — dieselbe Person, zwei Darstellungen, in
     * derselben Liste.
     *
     * Zwei moegliche Ursachen, beide sofort zu melden statt still hinzunehmen: die
     * Suite-Sitzung fuehrt keine name/email-Claims, oder `merkeNutzer` laeuft an
     * einer Stelle, an der die Claims noch nicht vorliegen.
     */
    t.db.insert(users).values({ id: NEU_SUB, name: null, email: null }).run();
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe(NEU_SUB);
  });

  it("trimmt — ein Name aus Leerzeichen zaehlt nicht als Name", () => {
    t.db.insert(users).values({ id: NEU_SUB, name: "   ", email: "anna@example.org" }).run();
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("anna@example.org");
  });

  it("laedt beide Nachschlagetabellen EINMAL und ist danach wiederverwendbar", () => {
    // Den Resolver pro Request bauen und ueber alle Zeilen wiederverwenden — eine
    // Journalseite hat bis zu JOURNAL_GRENZE Zeilen.
    t.db.insert(users).values({ id: NEU_SUB, name: "Anna Beispiel" }).run();
    const q = quelleAufloeser(t.db);
    // Zeile NACH dem Bau eingefuegt: der Resolver sieht sie bewusst nicht mehr.
    t.db.insert(users).values({ id: "spaeter", name: "Zu spaet" }).run();
    expect(q("oidc", NEU_SUB)).toBe("Anna Beispiel");
    expect(q("oidc", "spaeter")).toBe("spaeter");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/quelle.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./quelle"`.

- [ ] **Schritt 3: `_db/quelle.ts` schreiben**

```ts
import type { DB } from "./client";
import { tokens, users } from "./schema";

export type Quelle = (quelleTyp: string, quelleId: string) => string;

/**
 * Loest quelleTyp/quelleId aus den append-only-Logs in einen Anzeigenamen auf.
 * 1:1 aus `lagerbuch/src/db/quelle.ts:12-25`.
 *
 * IN DER DB BLEIBT DIE ROHE ID STEHEN (nachweisfest); nur die Anzeige wird
 * aufgeloest:
 *   oidc   → users.name, sonst E-Mail, sonst die ROHE ID
 *   token  → tokens.label (der Code allein sagt niemandem etwas)
 *   system → "System"
 *
 * WARUM DIESE DATEI UNTER _db/ LIEGT, obwohl _db/ keine Fachabfrage haelt: sie ist
 * eine von ZWEI benannten Ausnahmen (neben etiketten.ts), und der Grund ist bei
 * beiden derselbe — sie kennt KEINE SEITE, sondern nur eine Zeilenform, und jeder
 * Lesepfad benutzt sie. Waechst hier etwas heran, das eine Seite kennt, ist es am
 * falschen Ort.
 *
 * EIN AUFRUF LAEDT BEIDE LOOKUP-TABELLEN EINMAL — den Resolver pro Request bauen
 * und ueber alle Zeilen wiederverwenden.
 *
 * BEIDE KENNUNGSRAEUME DUERFEN NEBENEINANDER LEBEN, und genau deshalb gibt es
 * keine Zuordnungstabelle alt_sub → neu_sub (§4.13): die Map enthaelt beide, es
 * gibt keine Kollision, weil beide Werte Primaerschluessel derselben Tabelle sind.
 * Nachgeprueft ist zudem, dass die Kennung nirgends gefiltert, gruppiert oder
 * aggregiert wird — sie erscheint ausschliesslich in Projektionen.
 *
 * ⚠️ `select count(*) from users` ist KEINE Personenzahl. Das gilt vor wie nach
 * der Bereinigung und gehoert in jede Oberflaeche, die die Zahl anzeigen will.
 */
export function quelleAufloeser(db: DB): Quelle {
  const userNamen = new Map(
    db.select().from(users).all()
      .map((u) => [u.id, u.name?.trim() || u.email?.trim() || u.id] as const),
  );
  const tokenLabels = new Map(
    db.select().from(tokens).all().map((t) => [t.code, t.label] as const),
  );
  return (quelleTyp, quelleId) => {
    if (quelleTyp === "system") return "System";
    if (quelleTyp === "token") return tokenLabels.get(quelleId) ?? quelleId;
    return userNamen.get(quelleId) ?? quelleId;
  };
}
```

⚠️ **`tokens.created_by` wird NIRGENDS aufgelöst** — reines Auditfeld, kein Leser im ganzen Repo. Der
Resolver kennt es bewusst nicht.

- [ ] **Schritt 4: Test grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/quelle.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_db/quelle.ts src/app/m/lagerbuch/_db/quelle.test.ts
git commit -m "feat(lagerbuch): _db/quelle.ts — Kennung wird zu Klarname

1:1 aus lagerbuch@ca04eb1. oidc → users.name, sonst E-Mail, sonst die ROHE ID;
token → tokens.label; system → 'System'.

Der Test behauptet ausdruecklich BEIDE Kennungsraeume nebeneinander — das ist
die Eigenschaft, wegen der es keine Zuordnungstabelle alt_sub → neu_sub gibt
und geben wird. Dazu der BENANNTE Defektzustand aus §4.13 (i): eine users-Zeile
mit name UND email null loest auf die rohe Kennung auf. Der Test verhindert ihn
nicht, er macht ihn auffindbar.

Die merkeNutzer-Gegenprobe erweitert DIESE Datei in Teil 2 (§4.16 Punkt 4) —
es entsteht keine zweite."
```

---

**Gate Stufe 4b.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

## Welle 5 — Abnahme (1 Task)

---

### Task 14: Der Schema-Diff gegen die Alt-Anwendung und die Abrufprobe

**Files:**
- Keine. Dieser Task **führt aus und protokolliert**; sein Ergebnis ist der Commit-Text und ein
  Abschnitt in der Cutover-Notiz.

**Interfaces:**
- Consumes: alles aus T1–T13.
- Produces: die Aussage „§4 ist eingelöst", ohne die Teil 2 nicht beginnen sollte.

**Abnahme, nicht TDD.** Dieser Task prüft zusammengesetztes Verhalten, das zum Zeitpunkt seiner
Entstehung schon gebaut ist. Er ist von Anfang an grün, und das ist **kein** Mangel. Was er fängt,
ist die Mutation „eine Spalte beim Regenerieren stillschweigend anders getroffen als im Bestand" —
genau die Klasse, gegen die `migrations.test.ts` machtlos ist, weil dessen Erwartungstabelle
**dieselbe Quelle** hat wie das Schema.

- [ ] **Schritt 0: Werkzeug prüfen**

```bash
which sqlite3 && sqlite3 --version
```

Erwartet: ein Pfad und eine Fassung (gemessen am 03.08.2026: `/usr/bin/sqlite3`, 3.54.0). **Fehlt das
Werkzeug, wird der Task NICHT übersprungen** — dann treten in den Schritten 1, 2 und 4 die
`sqlite3`-Aufrufe durch `better-sqlite3` ersetzt, das ohnehin Abhängigkeit ist:

```bash
pnpm exec tsx -e 'import D from "better-sqlite3";
  const s = new D(process.argv[1]);
  for (const r of s.prepare("select type,name,sql from sqlite_master where name not like %27sqlite_%%27 and name not like %27__drizzle%%27 order by type,name").all())
    console.log(JSON.stringify(r));' /tmp/alt.db > /tmp/alt.schema
```

Die Ausgabeform ist dann eine andere (JSON je Zeile statt Pipe-getrennt) — das ist folgenlos, solange
**beide** Seiten des Diffs mit demselben Weg erzeugt werden.

- [ ] **Schritt 1: Das Alt-Schema erzeugen**

```bash
cd ../lagerbuch && git log --oneline -1
```

Erwartet: `ca04eb1 …` — der eingefrorene Stand. Weicht er ab, ist der Diff wertlos; dann zuerst
`git checkout ca04eb1` im Alt-Repo (und danach zurück).

```bash
cd ../lagerbuch && rm -f /tmp/alt.db && pnpm exec tsx -e \
  'import D from "better-sqlite3";import {drizzle} from "drizzle-orm/better-sqlite3";
   import {migrate} from "drizzle-orm/better-sqlite3/migrator";
   const s=new D("/tmp/alt.db");migrate(drizzle(s),{migrationsFolder:"./drizzle"});'
sqlite3 /tmp/alt.db \
  "select type,name,sql from sqlite_master where name not like 'sqlite_%' and name not like '__drizzle%' order by type,name;" > /tmp/alt.schema
```

- [ ] **Schritt 2: Das Zielschema erzeugen**

```bash
cd ../iuk-suite && rm -f /tmp/neu.db && pnpm exec tsx -e \
  'import D from "better-sqlite3";import {drizzle} from "drizzle-orm/better-sqlite3";
   import {migrate} from "drizzle-orm/better-sqlite3/migrator";
   const s=new D("/tmp/neu.db");migrate(drizzle(s),{migrationsFolder:"src/app/m/lagerbuch/_db/migrations"});'
sqlite3 /tmp/neu.db \
  "select type,name,sql from sqlite_master where name not like 'sqlite_%' and name not like '__drizzle%' order by type,name;" > /tmp/neu.schema
```

- [ ] **Schritt 3: Diffen und den Diff Zeile für Zeile abhaken**

```bash
diff /tmp/alt.schema /tmp/neu.schema
```

**Erwarteter Diff, abschließend — jede weitere Zeile ist ein Fehler, kein Geschmack:**

| Was | Woher | Abgehakt |
|---|---|---|
| Trigger `bz_kontrollen_no_update` und `bz_kontrollen_no_delete` (nur rechts) | S2, `0002` | ☐ |
| Index `idx_buchungen_ts_id` (nur rechts) | S3 | ☐ |
| Index `idx_buchungen_lagerort_artikel` (nur rechts) | S3 | ☐ |
| Index `idx_buchungen_artikel_lagerort_charge` (nur rechts) | S3 | ☐ |
| Index `idx_checks_fahrzeug_completed` (nur rechts) | S3 | ☐ |
| Formatierungsunterschiede in der `CREATE TABLE`-Ausgabe | `drizzle-kit` beim Quetschen | ☐ |

⚠️ **Was ausdrücklich NICHT im Diff stehen darf:** eine geänderte Nullbarkeit, ein geänderter
Default, ein fehlender oder umbenannter Index, ein `CHECK`, ein zusätzliches `UNIQUE`, eine
gestrichene Spalte (insbesondere nicht `tokens.scope_lagerort_id`) oder ein Typwechsel. **S1
(`checks.quelle_typ` mit Drizzle-Enum) darf ebenfalls NICHT auftauchen** — SQLite-`text({enum})`
erzeugt keinen CHECK; taucht dort trotzdem etwas auf, ist die Annahme aus §4.1 falsch und der Befund
gehört benannt, nicht weggeräumt.

**Erst wenn dieser Diff so aussieht, ist §4 eingelöst.**

- [ ] **Schritt 4: Die Abrufprobe — was kein Gate sieht**

Dev-Server starten und die zwei Wege abrufen, die Teil 1 überhaupt erreichbar macht:

```bash
pnpm dev
```

In einer zweiten Sitzung:

```bash
curl -s -o /dev/null -w "%{http_code} " http://localhost:3000/api/health/lagerbuch ; echo
curl -s http://localhost:3000/api/health/lagerbuch ; echo
```

Erwartet: `200` und eine Antwort, die den Modul-Health bestätigt. ⚠️ **Der Health-Check öffnet eine
eigene, sofort wieder geschlossene Verbindung über `openModuleDatabase`** — sie kennt `lb_falte`
nicht, braucht sie aber auch nicht (`SELECT 1`). ⚠️ Und **`<host>/api/health` antwortet weiterhin
`ok`, ohne etwas über lagerbuch zu sagen** (Falle 51); die Umstellung des Monitors von
`<host>/api/health` auf `/api/health/lagerbuch` ist eine Runbook-Zeile für Spec 2.

Prüfen, dass der Boot die Datei wirklich angelegt und migriert hat:

```bash
ls -la .data/lagerbuch.db
sqlite3 .data/lagerbuch.db "select count(*) from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '__drizzle%';"
sqlite3 .data/lagerbuch.db "select id,name,typ from lagerorte where id='handlager';"
```

Erwartet: die Datei existiert, **16**, und die Handlager-Zeile.

- [ ] **Schritt 5: Die vollständigen Gates ein letztes Mal**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

- [ ] **Schritt 6: Das Ergebnis festhalten**

Es gibt keine Datei zu committen — der Beweis ist der Diff. Er wird als leerer Commit protokolliert,
damit er in der Historie steht und die Cutover-Notiz ihn zitieren kann:

```bash
git commit --allow-empty -m "chore(lagerbuch): Schema-Diff gegen lagerbuch@ca04eb1 ist abschliessend

Wer ein Migrationsverzeichnis kopiert, hat das Alt-Schema per Definition; wer es
regeneriert, behauptet es. Der Diff zwischen /tmp/alt.schema und /tmp/neu.schema
enthaelt AUSSCHLIESSLICH:
  - die zwei Trigger auf bz_kontrollen (S2)
  - die vier neuen Indizes (S3): idx_buchungen_ts_id,
    idx_buchungen_lagerort_artikel, idx_buchungen_artikel_lagerort_charge,
    idx_checks_fahrzeug_completed
  - Formatierungsunterschiede der CREATE-TABLE-Ausgabe aus dem Quetschen
S1 taucht erwartungsgemaess NICHT auf — SQLite-text({enum}) erzeugt keinen CHECK.

Abrufprobe: /api/health/lagerbuch antwortet 200, .data/lagerbuch.db traegt 16
Tabellen und die Handlager-Zeile aus 0003.

Damit ist §4 eingeloest. Teil 2 (Zugang und Fachlogik) kann beginnen."
```

---

## 4. Abschluss-Abnahme von Teil 1

Bevor Teil 2 beginnt, muss **alles** hiervon zutreffen:

- [ ] Alle 14 Tasks sind eingecheckt, jeder mit eigenem Commit (T2 und T8 mit zwei bzw. den
      dokumentierten Zusatzdateien).
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm vitest run` und `pnpm build` sind grün.
- [ ] `src/core/bootstrap.test.ts` prüft alle **drei** Beine des Dreiecks für `lagerbuch`, und die
      Gegenprobe (auskommentierte `COPY`-Zeile → roter Test) ist einmal gefahren worden.
- [ ] Der Schema-Diff aus T14 ist abschließend und protokolliert.
- [ ] `_db/append-only.test.ts` behauptet **vier** Trigger, die o2-Gegenprobe und das
      `INSERT OR REPLACE`-Verhalten.
- [ ] Der Quelltext-Scan aus T4 (`kein "use client"`, `kein Icon-Import` unter `_lib`/`_db`) und der
      aus T12 (`kein getModuleDb` außerhalb `client.ts`) laufen grün.

**Was Teil 1 ausdrücklich NICHT liefert** und wo es liegt — damit Teil 2 nichts für erledigt hält:

| Fehlt | Wo es entsteht |
|---|---|
| `_lib/zugang.ts`, `helferSitzung.ts`, `helferZugang.ts`, `absender.ts`, `gateSchranke.ts`, `gateTexte.ts`, `code.ts` | Teil 2 (§3) |
| `_lib/konto.ts` (`merkeNutzer`) und die Erweiterung von `_db/quelle.test.ts` | Teil 2 (F5) |
| `_actions/guards.test.ts` — die **Eigenschaftsform** des Guard-Scans | Teil 2 (F4); die Zählung 47 = 44 + 3 erst in Teil 6 |
| `_lib/domain/*`, `_lib/lesepfade/*`, `_lib/schreibpfade/*` | Teil 3 (§5) |
| `_lib/grenzen.ts`, `_lib/marke.ts`, `_lib/boot.ts` und der Haken in `assertHostConfig()` | Teil 3 (§10) — ⚠️ **für diese Naht gibt es kein Kopplungsnetz**: ohne den Haken existiert `_lib/boot.ts`, wird aber nie gerufen, und nichts wird rot |
| `playwright.config.ts`: `SUITE_HOST_LAGERBUCH`, Gate-Zahlen, Sitzungsgeheimnis, Admin-Gruppe, Seed-Schritt, zweiter Host | Teil 3 (§12.6) |
| Gate, `/t`, `/a`, `/g`, `/helfer`, Fahrzeug-Check, Barcode-Scanner | Teil 4 (§7) |
| Die 24 Verwaltungsseiten, `_ui/*`, `_lib/nav.ts`, `_lib/ampel.ts`, die `.modulnav`-Reparatur | Teil 5 (§6) — ⚠️ **es gelten F2 und F3 aus §1 dieses Plans**: die Route-Groups heißen `(arbeit)` und `(druck)`, es gibt **kein** `verwaltung/layout.tsx`, und **beide** Group-Layouts rufen `requireLagerbuchHost` **und** `requireLagerbuchAdmin` |
| Etiketten, Druckansicht, CSV/Excel/Zwischenablage, `error.tsx`, die E2E-Dateien | Teil 6 (§8, §9, §11, §12) — ⚠️ **es gelten F2 und F3 aus §1 dieses Plans.** Fällt `requireLagerbuchAdmin` aus `verwaltung/(druck)/layout.tsx`, sind die gedruckten Zugangs-Codes **im Klartext öffentlich** — und Route-Group-Grenzen sind keine Sicherheitsgrenzen |

⚠️ **Warum diese zwei Zeilen hier stehen und nicht nur in §1.** F2 und F3 sind Absprachen zwischen
**Teil 5 und Teil 6**, also zwischen zwei Plänen, die verschiedene Umsetzer in verschiedenen
Sitzungen ausführen. Über eine Plangrenze hinweg hätte die Absprache sonst keinen Ort, an dem sie
gelesen wird — und die Kopplung ist bei F3 sicherheitsrelevant. Die **einzige** Zusicherung, die sie
prüft, ist ein Abruf, kein Test: `/verwaltung/etiketten` **ohne** Lagerbuch-Gruppe muss dieselbe
Antwort geben wie `/verwaltung/artikel` ohne Gruppe (§6.1.3, §12.4). Ein Quelltext-Scan sieht sie
nicht.

