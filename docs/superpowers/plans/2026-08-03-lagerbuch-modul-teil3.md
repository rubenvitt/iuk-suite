# Modul `lagerbuch` — Implementierungsplan, Teil 3: Fachlogik und Grenzen

> **Für agentische Umsetzer:** PFLICHT-SUB-SKILL `superpowers:subagent-driven-development` (empfohlen)
> oder `superpowers:executing-plans`. Die Tasks sind auf parallele Ausführung geschnitten.
> **Innerhalb einer Wellenstufe dürfen alle genannten Tasks gleichzeitig laufen; über Stufengrenzen
> hinweg nicht.** Die Gates (§4) laufen am Ende **jeder Stufe**.
>
> Jeder Task ist TDD: erst der Test, dann der Code. **Ausgenommen sind die als „Abnahme" markierten
> Schritte** (T61): sie prüfen zusammengesetztes Verhalten, das zum Zeitpunkt ihrer Entstehung schon
> gebaut ist. Sie sind von Anfang an grün, und das ist **kein** Mangel; statt „Rot, weil …" nennen
> sie die **Mutation**, die sie fangen.

**Spec:** `docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md` (11.036 Zeilen, verbindlich).
**Faktenbasis:** `docs/lagerbuch-portierung-analyse.md`. **Querschnitt:** `docs/design/README.md`.
**Projektregeln:** `CLAUDE.md`. **Alt-Anwendung:** `../lagerbuch` @ `ca04eb1` (eingefroren).
**Branch:** `feat/lagerbuch-modul` (existiert seit Teil 1).

**Ziel:** Das Modul `lagerbuch` bekommt seine **Fachlogik** — die Regeln, die es hält, und die
Grenzen, unter denen es sie hält. Die acht reinen Domänen-Module (Bestand, FEFO, Verfall,
Vorschlag, O₂, Gerät, BZ, Check); die zehn Lesepfade, die die vier quadratischen JS-Filter des
Bestands durch je **eine** aggregierende SQL-Abfrage ersetzen, **ohne** den Lagerortbezug zu
verlieren; die fünf transaktionsfreien Schreibpfad-Kerne; die Aufbereitungsschicht (`format.ts`,
`checkErgebnis.ts`, `artikelFilter.ts`, `journalZeile.ts`, `checkNutzlast.ts`); die Boot-Prüfungen
samt dem Haken in `assertHostConfig()`, für den es **kein Kopplungsnetz** gibt — und die
E2E-Konfiguration, ohne die keine der Zusagen aus §3.8.3, §5.19.4 und §12.4 je gefahren werden kann.

**Architektur:** `lagerbuch` ist das fünfte Modul der iuk-suite (`src/app/m/lagerbuch/`) mit einer
eigenen SQLite-Datei `lagerbuch.db`. Der Bestand ist **nie eine Spalte**, immer die Summe eines
append-only Buchungsjournals — und die Summe ist **immer lagerort-gescoped**. Zeit ist ausschließlich
UNIX-**Sekunden**; jede Zivildatums-Rechnung läuft über `_lib/zeit.ts` mit der Modulkonstante
`ZEITZONE = "Europe/Berlin"`, **nie** über die Prozess-`TZ`. Die Fachlogik liegt vollständig in
`_lib/` ohne `"use client"`, weil ihre Werte von **Server Components** gelesen werden.

**Tech Stack:** Next.js 16.2.11 (App Router/RSC) · Ant Design 6 · Drizzle 0.45 + better-sqlite3 12.11
· Auth.js v5 (Pocket ID) · jose · Vitest 4 + Playwright · pnpm.

---

## Plan-Index

**Der vollständige Index aller sechs Teile steht in
`docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil1.md`, Abschnitt „Plan-Index — dieser Plan ist
Teil 1 von sechs".** Er wird hier nicht kopiert; eine zweite Kopie liefe beim ersten
Zuschnitt-Wechsel auseinander.

Dieses Dokument ist **Teil 3** und deckt **Knoten D** des Spec-Anhangs („Abhängigkeiten der
Bauwege"): **Spec §5 vollständig außer §5.13.2** (der modul-eigene Opener mit `lb_falte` ist in
Teil 1, T12 gebaut — dieser Plan **konsumiert** `getDb()` und `falte`), dazu **§10 vollständig** und
**§12.6**. Er löst außerdem die zwei **Außenarbeiten** ein, die daran hängen: den Haken
`lagerbuchBootFehler()` in `assertHostConfig()` (`src/core/bootstrap.ts`) und die E2E-Konfiguration
in `iuk-suite/playwright.config.ts` samt Seed-Schritt `e2e/seed-lagerbuch.ts`.

⚠️ **Drei Korrekturen an dem, was Teil 1 diesem Plan zugeschrieben hatte** — sie sind schon in
Teil 2 gefallen bzw. fallen hier, und wer sie nicht liest, legt Dateien doppelt an:

1. **`_lib/grenzen.ts` existiert bereits** (Teil 2, T15, Festlegung G1) — mit der **vollständigen**
   `ZAHLEN`-Tabelle aller sechs Env-Zahlen. Dieser Plan **erweitert** sie um `grenzenFehler(env)`
   und die drei reinen Konstanten. Er legt sie **nicht** an. Siehe Festlegung **H1**.
2. **Der Boot-Haken wandert von Teil 2 hierher.** Teil 1 hatte ihn Teil 2 zugeschrieben; Teil 2 hat
   ihn ausdrücklich zurückgegeben, weil er an `grenzenFehler()` hängt und das §10.5 ist.
3. **Der zweite E2E-Host muss nicht erfunden werden.** `iuk-suite/playwright.config.ts:95` wartet
   heute schon auf `http://feedback.localtest.me:3100/login`; damit ist §12.6, Punkt 3s „zweiter
   erreichbarer Host" **vorhanden**. Siehe Festlegung **H8**.

---

## 0. Vorbedingungen

**Die vollständige Tabelle aller neun offenen Fragen aus §15.1 steht in Teil 1, §0.** Sie wird hier
nicht kopiert. Hier stehen **nur** die Einträge, die in **diesem** Teil fällig sind — mit dem
Zustand, in dem dieser Plan sie vorfindet, und mit dem **Rückfall**, der den Bau nicht blockiert.

⚠️ **Drei Einträge aus Teil 1s Tabelle sind Teil 3 zugeordnet und sind es NICHT.** Teil 1 hatte
Frage 5 (`tokens.scope_lagerort_id` als Riegel, §7.9.1), Frage 6 (Netz im Lagerraum, §7.10.1) und
Frage 8 (Hersteller-EANs, §7.6.2) mit „fällig vor Teil 3" geführt. Alle drei hängen an **§7** — dem
Kapitel von **Teil 4**. Sie blockieren diesen Plan in keiner Zeile und stehen hier nur, damit ihre
Abwesenheit gelesen wird und nicht als Versehen erscheint.

| # | Frage | Antwortet | Blockiert in Teil 3 | Rückfall dieses Plans |
|---|---|---|---|---|
| 4 | ~~Entscheidung 22 — Backup-Job~~ ✅ **entschieden (D1, 04.08.2026)** | **`_lib/grenzen.ts` (T32) und `_lib/boot.ts` (T38)**: `LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` steht in der Tabelle aus §10.3, hängt aber an dieser Antwort. Teil 2 hat die Zeile **ausgelassen** und die Nachforderung ausdrücklich an Teil 3 adressiert | **A-T3-1 ist zur FESTLEGUNG hochgestuft:** kein Hintergrund-Eintrag, `LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` entfällt ersatzlos, `startBackgroundWork()` bekommt keinen lagerbuch-Eintrag. **Der Betreiber will weder (a) noch (b), sondern ein Sidecar im Deployment** — eigene Spec, eigener Posten, **nicht Teil dieses Moduls**. ✅ **Es entsteht dadurch KEINE Lücke:** `iuk-suite/scripts/backup.sh:29` sammelt `"$DATA_DIR"/*.db` ein, `lagerbuch.db` ist ab dem ersten Boot mit im Tarball. ⚠️ **Das Skript läuft als Host-Cron, nicht im Container** — genau die Abhängigkeit, die das Sidecar ablösen soll |
| — | **Der produktive Wert von `SUITE_ADMIN_GROUP_LAGERBUCH`** (Alt-Name `OIDC_ADMIN_GROUP`, `lagerbuch/compose.yaml:23`) | Betreiber | **`e2e/helpers/lagerbuch.ts` (T59) und `playwright.config.ts` (T60)** — §12.6, Punkt 2 verlangt, dass `devLogin(…, {groups})` **denselben** Wert trägt wie die Serverumgebung | **A-T3-2:** Bau und E2E laufen gegen `lagerbuch_nutzer` — den Registry-Vorgabewert aus T2 (Teil 1), wortgleich mit dem heutigen Default. Der produktive Wert wird beim Cutover als **eine `.env`-Zeile** gesetzt; `adminGroupsFor` liest sie ohne Rebuild. ⚠️ Ein falscher Wert sperrt **jede** verwaltende Person aus, und es gibt für dieses Modul bewusst **keine** Suite-Admin-Rückfallebene (§3.6.2). Boot-Prüfung 5 (T38) fängt den **leeren**, nicht den **falschen** Wert |
| — | **Die heutige Zeilenzahl in `buchungen`** (§5.2.3, Betreiberfrage 9) | Betreiber, aus dem Volume `lagerbuch_data` | **nichts im Bau** — Entscheidung 7 (b) ersetzt die vier quadratischen Terme unabhängig davon | **A-T3-3:** Die Umstellung auf SQL-Aggregate wird **bedingungslos** gebaut, weil sie verhaltensneutral ist und beim Neubau der Leseseite ohnehin anfällt. Die Zahl entscheidet nur, wie **dringend** sie war. ⚠️ Sie bleibt Runbook-Eingabe: `better-sqlite3` ist **synchron**, eine Übersichtsseite, die 1 s rechnet, blockiert für diese Sekunde **die gesamte Suite** — portal, qr, feedback und files antworten in dieser Zeit nicht |

**Keine dieser Fragen darf durch eine erfundene Vorbelegung ersetzt werden.** Wo dieser Plan einen
Wert nennt, ist er entweder in der Spec belegt oder — wie oben — als Annahme mit Rückfall markiert.

**Was aus den Teilen 1 und 2 fertig vorliegen muss, bevor T28 beginnt.** Beide Abschluss-Abnahmen
(Teil 1 §4, Teil 2 §5) sind vollständig abgehakt. Konkret benutzt dieser Plan:

| Aus Teil 1/2 | Signatur, auf die dieser Plan baut |
|---|---|
| `_lib/zeit.ts` (T3) | `ZEITZONE: "Europe/Berlin"` · `ausZivilzeit(jahr, monat1bis12, tag, std?, min?, sek?, ms?): Date` · `monatsEnde(verfall: string): Date` · `startDesTages(now: Date): Date` · `tagesGrenzen(datum: string): { von: Date; bis: Date }` · `fmtTs(d: Date): string` · `heuteIso(now?: Date): string` · `uhrzeit(d: Date): string` |
| `_lib/konstanten.ts` (T4) | `HANDLAGER_ID: "handlager"` · `PSEUDO_VERFALL: "2099-12"` · `istOhneVerfall(v: string): boolean` · `CHARGE_KORREKTUR`/`CHARGE_INVENTUR`/`CHARGE_OHNE_VERFALL` · `ZUSTAENDE: readonly ["In Ordnung","Gebrauchsspuren","Defekt"]` · `ZUSTAND_DEFEKT: "Defekt"` · `type Zustand` · `MONAT_REGEX` · `TAG_REGEX` · `istEchterKalendertag(s: string): boolean` · `BUCHUNGSTYPEN` · `QUELLE_TYPEN` · `LAGERORT_TYPEN` · `GERAETE_TYPEN` · `TOKEN_ZIEL_TYPEN` |
| `_lib/suche.ts` (T5) | `falte(s: string): string` |
| `_db/schema.ts` (T7) | die 16 Tabellen und `newId()`; die vier neuen Indizes `idx_buchungen_ts_id`, `idx_buchungen_lagerort_artikel`, `idx_buchungen_artikel_lagerort_charge`, `idx_checks_fahrzeug_completed` |
| `_db/client.ts` (T12) | `getDb(): ReturnType<typeof drizzle<typeof schema>>` · `type DB = ReturnType<typeof getDb>` — **mit registrierter SQL-Funktion `lb_falte`** |
| `_db/testdb.ts` (T9) | `migrierteTestDb(praefix?: string): TestDb` mit `{ db, sqlite, schliessen }` |
| `_db/quelle.ts` (T13) | `type Quelle = (quelleTyp: string, quelleId: string) => string` · `quelleAufloeser(db: DB): Quelle` |
| `_lib/grenzen.ts` (T15, **Teil 2**) | `class GrenzenUngueltig` · `interface Grenzen { verfallRotTage; verfallGelbTage; helferSitzungStunden; gateProAbsenderProMin; gateGesamtProMin; gateGesamtProStunde }` · `grenzen(env?): Grenzen` · `ZAHL_NAMEN: readonly string[]` · `helferSitzungGeheimnis(env?): string` |
| `_lib/host.ts` (T10) | `requireLagerbuchHost(headers: Headers): void` — **nur** von den Aufrufstellen ab Teil 4 gebraucht, hier nicht |
| Registry-Eintrag (T2) | `getModule("lagerbuch")` mit `adminGroups: ["lagerbuch_nutzer"]`, `requiresAuth: false`, `prodHosts: []` |
| `e2e/fixtures.ts` (Bestand) | `devLogin(page, { host, email?, groups?, callbackPath?, port? })` |

---

## 1. Festlegungen dieses Plans, die die Spec offen lässt

Zehn Punkte. Jeder ist eine Entscheidung dieses Plans, keine Ableitung — sie stehen hier beisammen,
damit ein späterer Teil sie nicht ein zweites Mal trifft. **Sie ergänzen F1–F7 (Teil 1) und G1–G8
(Teil 2), sie ersetzen nichts davon.**

**H1 — `_lib/grenzen.ts` und `_lib/grenzen.test.ts` werden ERWEITERT, nicht angelegt.** Teil 1s
Abschlusstabelle schrieb die Datei diesem Plan zu; Teil 2, Festlegung G1 hat das mit Begründung
umgekehrt und die **vollständige** `ZAHLEN`-Tabelle dort gebaut, weil `_lib/gateSchranke.ts`
wörtlich mit `const g = grenzen();` beginnt. **Der Anteil dieses Plans ist genau:**

- `grenzenFehler(env: EnvLike = process.env): string[]` — die Boot-Liste, §10.5 **Prüfungen 1 bis 4**;
- die drei **reinen** Konstanten `JOURNAL_GRENZE = 100`, `CHECK_GRENZE = 50`,
  `BZ_LOGBUCH_GRENZE = 100` (§10.3, §5.14.3) — sie sind ausdrücklich **keine** Env-Variablen;
- in `grenzen.test.ts` die **Kopplungsfälle** und die Konstanten-Zusicherungen, angehängt an die
  vorhandene unabhängige Erwartungstabelle.

⚠️ **Ein Task, der hier `Write` statt `Edit` benutzt, löscht T15 aus Teil 2.** Die Datei-Eigentümer­
tabelle (§3) führt beide Dateien deshalb ausdrücklich als **(Erweiterung)**. Präzedenz: Teil 2 hat
mit `_db/quelle.test.ts` (Teil 1, T13) genau dasselbe getan.

⚠️ **§10.8, Eigenschaft 1 ist die Bedingung, unter der die Erweiterung überhaupt zulässig ist:**
`grenzen()` und `grenzenFehler()` lesen aus **derselben** `ZAHLEN`-Konstante. Eine zweite Tabelle
wäre eine zweite Wahrheit, und der Boot prüfte etwas anderes als das, was zur Laufzeit gilt.

**H2 — `verfallStatus` bekommt die Parameternamen `{ rotTage, gelbTage }`, nicht
`{ kritisch, faellig }`.** §5.6.1 zitiert die Alt-Signatur; §10.1 schreibt über zwanzig Zeilen aus,
**warum genau diese zwei Namen der Fehler sind**: „kritisch" klingt dringender als „fällig", ist aber
das **kleinere** Fenster, und wer die Werte beim Übertragen vertauscht, bekommt keinen Fehler — der
Gelb-Zweig wird unerreichbar und die Ampel hat zwei Zustände statt drei. §10.3 löst das für die
**Env-Namen** (`LAGERBUCH_VERFALL_ROT_TAGE`/`…_GELB_TAGE`), §5.6.1 lässt die **Feldnamen** stehen.
Das geht nicht auf: dann trüge dieselbe Zahl auf zehn Metern Weg zwei Namen, und die Umbenennung
wäre eine Bitte statt einer Zusage.

**Entschieden:** eine Kette, ein Name.

```ts
export type VerfallSchwellen = { rotTage: number; gelbTage: number };
export function verfallStatus(verfall: string, schwellen: VerfallSchwellen, now: Date): VerfallStatus;
export function verfallSchwellen(env?: EnvLike): VerfallSchwellen;   // liest grenzen(), einzige Brücke
```

`grenzen()` liefert `verfallRotTage`/`verfallGelbTage`; `verfallSchwellen()` ist die **einzige**
Stelle im Modul, die aus dem einen Namen den anderen macht. Kein Lesepfad baut das Objekt selbst.
⚠️ **Das ist kein Verhaltensbruch** — die Auswertung ist zeichengleich (`tage <= rotTage` → rot,
`tage <= gelbTage` → gelb, sonst grün).

**H3 — Die Schreibpfade dieses Teils sind die transaktionsfreien KERNE. Die zusammensetzenden
Actions gehören Teil 4 und Teil 5 — mit ausgeschriebenen Auflagen.** §5.1 nennt für
`_lib/schreibpfade/` **genau fünf** Dateien: `abbuchung.ts`, `umlagerung.ts`, `korrektur.ts`,
`lagerortVerfall.ts`, `templateSync.ts`. Das sind 1:1 die Alt-Dateien unter `src/db/` — Funktionen,
die **innerhalb** einer bestehenden Transaktion laufen. `checkAbschluss` (§5.8) und
`inventurKorrektur` (§5.9) liegen dagegen im Alt-Repo unter `src/actions/`, sie öffnen die
Transaktion, validieren mit Zod und rufen `revalidatePath` — und `_actions/` gehört **Teil 4**
(Helfer-Check) bzw. **Teil 5** (Inventur).

**Folge, und sie ist die gefährlichste Naht dieses Plans:** §5.19.2 weist
`_db/check-abschluss.test.ts` und `_db/inventur.test.ts` diesem Kapitel zu, und **beide sind hier
nicht schreibbar**, weil ihr Prüfgegenstand noch nicht existiert. Sie wandern in die Abgabetabelle
(§6) — **mit den Werten ausgeschrieben**, nicht als Verweis:

| Auflage | Exakter Wert | Wo eingelöst |
|---|---|---|
| Check, gezähltes Ist | `z.coerce.number().int().min(0).max(99_999)` | Teil 4 (§7.9) |
| Check, abgelesener Druck | `z.coerce.number().int().min(0).max(9_999)` — ein Manometer über 9 999 bar gibt es nicht | Teil 4 |
| Inventur, gezähltes Ist | `z.coerce.number().int().min(0).max(99_999)` | Teil 5 (§6) |
| Check, `zustand` | `z.enum(ZUSTAENDE).optional()` aus `_lib/konstanten.ts` — **nicht** `z.string().trim().optional()` | Teil 4 |
| Zugang, Chargenzugehörigkeit (I5) | die Prüfung aus `lagerbuch/src/actions/buchung.ts:33-36` 1:1 — sonst entsteht „phantom, un-withdrawable Bestand on the target article" | Teil 5 (§6) |
| `nachfuellMenge` | **kein** eigener Deckel — serverseitig ohnehin auf `max(0, soll − ist)` geklemmt und an der Handlager-Verfügbarkeit gekappt | — |

⚠️ **Ohne diese Tabelle erbt Teil 4 „§5.8 ist erledigt", und die drei Deckel finden still nie
statt.** Sie sind die einzige Zeile aus §5.15, die eine **Verhaltensänderung** ist, und sie ist
begründet: es sind die Felder, an denen ein Tippfehler eine **irreversible** Zeile erzeugt (I1: kein
`UPDATE`, kein `DELETE`), und der Client-Deckel ist heute die einzige Bremse.

**H4 — Wo die fünf Lesepfade ohne eigene Datei liegen.** §5.1 nennt zehn Dateien unter
`_lib/lesepfade/`; die Alt-Anwendung hat aber ein paar Leser mehr, und für fünf davon nennt die Spec
keinen Ort. Entschieden, damit kein Task rät:

| Leser | Alt-Beleg | Zielort | Grund |
|---|---|---|---|
| `kennzahlen` | `queries.ts:125-157` | `_lib/lesepfade/bestand.ts` | Sie ist vollständig aus Bestand und Charge-Rest abgeleitet und der **Hauptnutznießer** der vier Aggregate — sie ist der Pfad, dessen JS-Term §5.2.3 (b) als erstes nennt |
| `verfallFuerLagerort` | `lagerort-verfall.ts:36-39` | `_lib/lesepfade/verfall.ts` | Es ist ein **Leser**, auch wenn er in der Alt-App in der Schreibdatei steht. `_lib/schreibpfade/lagerortVerfall.ts` behält nur `setzeVerfall`, `loescheVerfallEintrag`, `loescheVerfallFuer` |
| `templateUebersicht`, `templateDetail`, `templateListeAktiv` | `queries.ts:552-602` | `_lib/lesepfade/fahrzeuge.ts` | §5.7 („Soll/Ist, Fahrzeug-Vorlagen, Grabsteine") ist **ein** Abschnitt, und die drei lesen dieselben Tabellen wie `fahrzeugUebersicht` |
| `tokenListe` | `queries.ts:525-543` | **Teil 6** (§8.3) | Tokens sind Kapitel 8, nicht Kapitel 5. Entscheidung 8-F (Hard-Delete entfällt, nur noch sperren) fällt dort, und ein hier gebauter Lesepfad müsste dort sofort angefasst werden |

**H5 — `_lib/format.ts#ampelTon` liefert TONNAMEN, niemals Hexwerte.** §5.17 entscheidet, dass die
Ampel eine **fachsemantische Palette** ist und beim Modul liegt (`_lib/ampel.ts`) — aber
`_lib/ampel.ts` gehört laut Teil 1s Abschlusstabelle **Teil 5**, und §6.6.2 entscheidet dort den
konkreten Hexwert (`#8c0d16` für Ampel-Rot, ausdrücklich **nicht** Suite-Rot `#c8000f`).

**Der Schnitt, der beides trägt:** `format.ts` liefert
`ampelTon(a: Ampel | null): "rot" | "gelb" | "ok" | "grau"` — reine Tonnamen. Die Zuordnung
Ton → Farbe liegt in `_lib/ampel.ts` (Teil 5). Genau das lässt §12.1, Punkt 4s Auflage halten:
`journalZeile.test.ts` nennt **keinen einzigen Hexwert**, denn ein Test, der `#c8000f` festnagelt,
entschiede Entscheidung 30 versehentlich mit. **Auflage an Teil 5:** `_lib/ampel.ts` bildet exakt
diese vier Tonnamen ab, und `"grau"` ist **kein** Ampelwert — er darf nie als grün dargestellt
werden.

⚠️ **`chipTone` gibt es im Zielmodul nicht.** Die Alt-Funktion (`format.ts:42-44`) trug die
CSS-Klassennamen `chip-rot`/`chip-gelb`/`chip-ok` im Namen; ein direkt interpoliertes
`chip-${ampel}` ergäbe ein undefiniertes `chip-gruen` mit Padding und Radius, **aber ohne Farbe**.
Die Namensfalle geht mit, der Name nicht.

**H6 — Vorzeichen im Journal sind ASCII (`+`/`-`), kein typografisches Minus.** §12.1, Punkt 4
verlangt, dass `_lib/journalZeile.ts` „Vorzeichen und einen Zustandsnamen" liefert, sagt aber nicht,
welches Zeichen. Ein `−` (U+2212) läse sich schöner — und wäre exakt die Klasse, vor der §12.3
warnt: `/× aussondern/` in `verfall.spec.ts:21` hängt heute an einem typografischen `×` im
Knopftext, und niemand sieht einem Selektor an, dass er an einem unsichtbaren Zeichenunterschied
scheitert. **Entschieden: `menge > 0 ? "+" + menge : String(menge)`.** Die Formatierung für die
Anzeige darf später ein CSS- oder Komponentenanliegen werden; der **Testanker** bleibt ASCII.

**H7 — Jeder Lesepfad bekommt genau EINE Testdatei neben sich; die vier `_db/*.test.ts` aus §5.19.2
entstehen ZUSÄTZLICH.** §5.19.2 nennt `_db/aggregate.test.ts`, `_db/suche.test.ts`,
`_db/fefo.test.ts` und `_db/template-sync.test.ts` — Dateien unter `_db/`, deren Prüfgegenstand
unter `_lib/` liegt. Das ist kein Widerspruch, sondern ein Zuschnitt: sie tragen **Differenz- und
Determinismus-Aussagen**, die keinem einzelnen Lesepfad gehören (dieselbe Zahl über zwei Wege;
dieselbe Trefferentscheidung in zwei Hälften; dieselbe Reihenfolge gegen eine echte Verbindung).
Die zehn `_lib/lesepfade/<name>.test.ts` prüfen dagegen **je einen** Pfad.

⚠️ **Beide Sorten laufen gegen `migrierteTestDb()`, nie gegen einen Mock** (§5.19.2). Ein Mock
trüge die Aussage nicht: die Aggregate sind SQL, `lb_falte` ist eine registrierte SQLite-Funktion,
und die FEFO-Reihenfolge entscheidet heute die Datenbank.

⚠️ **Die Eigentümertabelle (§3) führt jedes dieser Kreuzpaare mit vollem Pfad.** Ohne das „besitzt"
ein Task `_lib/domain/fefo.ts` und findet einen fremden Test, der dagegen behauptet.

**H8 — Der zweite E2E-Host ist `feedback.localtest.me`, und er existiert bereits.** §12.6, Punkt 3
verlangt für den „fremder Suite-Host"-Fall (§3.8.3, §12.2) einen zweiten erreichbaren Host.
`iuk-suite/playwright.config.ts:95` wartet heute schon auf `http://feedback.localtest.me:3100/login`
— derselbe Server, anderer Host, Wildcard-DNS löst jeden `*.localtest.me` auf `127.0.0.1` auf.
**Entschieden: kein dritter Host wird eingeführt.** Die Host-Zusagen aus §3.8.3 laufen gegen
`feedback.localtest.me:3100`, und das ist zugleich die schärfere Probe — es ist ein **echtes**
Modul, kein Platzhalter, und `moduleForHost` liefert dort tatsächlich `feedback`.

**H9 — Host, Admin-Gruppe und die drei Token-Codes stehen in EINER exportierten Konstantendatei,
importiert von `playwright.config.ts` UND von jedem Spec.** §12.6, Punkt 2 verlangt
`devLogin(page, { host: "lagerbuch.localtest.me", groups: "<Wert von SUITE_ADMIN_GROUP_LAGERBUCH>" })`.
Stünde der Gruppenwert einmal in `webServer.env` und einmal im Spec, hätte man **zwei Literale**,
und der Fehlerfall ist nicht laut, sondern gegenteilig: ohne (oder mit falschem) `groups` bezeugt
der Lauf den **404** aus §11.5, Zustand 19 — und sieht dabei aus wie ein bestandener Test.

⚠️ **Genau diese Klasse steht in derselben Datei schon ausgeschrieben.** `playwright.config.ts:2-6`
begründet, warum `AV_MODUS_DATEI` aus einem Helfer kommt und nicht als Literal: „Zwei Literale
liefen auseinander, ohne dass ein Lauf rot würde — er wäre rennabhängig grün." Dieselbe Bauform,
dieselbe Datei: `e2e/helpers/lagerbuch.ts` (T59).

**H10 — `e2e/seed-lagerbuch.ts` migriert SELBST und geht über `getDb()` des Moduls.** Der Seed läuft
laut §12.6, Punkt 4 als eigener Schritt in der `webServer.command`-Kette, also **vor** `next dev` —
zu diesem Zeitpunkt hat **nichts** migriert. Die Alt-Anwendung hatte denselben Fall und schreibt die
Begründung über zwanzig Zeilen aus (`lagerbuch/e2e/migrate-db.ts:1-20`): Next' Dev-Server wertet
Modul-Singletons je Route-Bundle neu aus, und die späteren Verbindungen sehen das Schema nicht, das
die erste gerade migriert hat.

Daraus folgen **drei** Auflagen an den Seed:

1. Er ruft `migrate()` selbst, gegen dieselbe Datei, die `moduleDbPath("lagerbuch")` liefert.
2. Er geht über `getDb()` aus `_db/client.ts` — **nie** über `getModuleDb` und **nie** über
   `seedAllModules()`. Der zweite Grund wiegt schwerer als der erste: `seedAllModules()` ist die
   einzige `core`-Stelle, die `getModuleDb(<key>, schema)` ruft, und eine solche Verbindung kennte
   **`lb_falte` nicht** (§5.13.2, §12.6 Punkt 4).
3. **Zwei aktive Token-Codes, nicht einer.** `lagerbuch/e2e/migrate-db.ts:84-88` schreibt aus,
   warum: sonst bucht der Check ins Journal des Helfer-Flows hinein, weil Playwright alle Specs in
   **einem** Worker gegen **eine** SQLite-Datei fährt. Dieser Plan seedet **drei** (Helfer, Check,
   Geräte) — dieselbe Aufteilung wie im Bestand.

⚠️ **Die Codes gehören ausdrücklich NICHT in `seedAllModules()`** (§12.6, Punkt 4): ein
Seed-Zugangscode wäre in einer Generalprobe ein **gültiger anonymer Schreibzugang**.
`ensureHandlager` ist dagegen **Schema-Vervollständigung** und liegt seit Teil 1 in
`0003_handlager.sql`.

**H11 — `Leser` bekommt nur, wer wirklich in einer Transaktion laufen kann.** T44 führt
`type Leser = DB | <Transaktionszweig>` ein, weil die vier Aggregate **auch** aus `fefoAbbuchung` und
`korrekturAufLagerort` gerufen werden. Der naheliegende Reflex ist, jeden Lesepfad so zu typisieren
— und er kostet sofort: `quelleAufloeser(db: DB)` (Teil 1, T13) nimmt kein `Leser`, und man landet
bei `quelleAufloeser(db as never)`. **Ein Cast, der eine Frage verdeckt, statt sie zu beantworten.**

**Entschieden, und die Regel ist mechanisch prüfbar:** ein Lesepfad nimmt **`DB`**, sobald er
`quelleAufloeser` ruft — das sind genau **drei** (`lesepfade/journal.ts` T46, `bz.ts` T51, `o2.ts`
T52). Alle übrigen nehmen **`Leser`**, weil sie ausschließlich `select()` brauchen und damit auch
innerhalb einer Transaktion laufen können; **zwingend** ist das für die vier Aggregate aus T44 und
für `verfallFuerLagerort` (T47), die `checkAbschluss` **nach** dem Schreiben in derselben
Transaktion ruft (§5.6.3).

⚠️ **Der Umkehrschluss ist der eigentliche Wert:** wer einen der drei `DB`-Pfade nachträglich in
eine Transaktion ziehen will, muss `quelleAufloeser` in Teil 1 anfassen — und **das ist eine
Entscheidung, kein Cast**. Ein `as never` hätte sie verdeckt.

**H12 — `_lib/konstanten.ts` wird NICHT erweitert.** Teil 2s Abgabetabelle führt
„`_lib/konstanten`-Erweiterungen" als Posten dieses Plans. Nachgeprüft: **es gibt keine.** Alles, was
§5 und §10 brauchen — `HANDLAGER_ID`, `PSEUDO_VERFALL`, `istOhneVerfall`, die drei
Chargen-Nummern, `ZUSTAENDE`, `ZUSTAND_DEFEKT`, `MONAT_REGEX`, `TAG_REGEX`, `istEchterKalendertag`
und die fünf Enum-Listen — steht seit Teil 1, T4. Der Posten ist damit **erledigt, nicht vergessen**;
diese Zeile ist der Beleg dafür.

---

## 2. Global Constraints — was ZUSÄTZLICH aus §5, §10 und §12.6 folgt

**Die projektweiten Constraints stehen vollständig in Teil 1, Abschnitt „Global Constraints", die
Zugangs-Constraints in Teil 2, §2. Beide gelten unverändert weiter und werden hier NICHT
wiederholt.** Insbesondere gelten weiter: kein `"use client"` unter `_lib/` und `_db/` (Falle 6),
kein `@ant-design/icons`-Import unter `_lib/` (Falle 7), äußere Pfadform für Client-Pfade und innere
für `revalidatePath`, kein `_db/queries.ts`, Zeitstempel in UNIX-**Sekunden**, `INSERT OR IGNORE`
statt `INSERT OR REPLACE`, `BESTELL_FAKTOR` ersatzlos gestrichen.

Was **zusätzlich** aus den Kapiteln dieses Plans folgt:

**Bestand — die vier Sätze, die still fehlschlagen**

1. **Der Bestand bleibt rein rekonstruktiv. Es gibt keinen zweiten Wahrheitsspeicher** (§5.2.4,
   Entscheidung 7 b). `chargen` trägt keine Menge; jeder Bestand ist die Summe vorzeichenbehafteter
   Buchungsmengen. Eine materialisierte Bestandstabelle (Variante c) ist **verworfen** (§13).
2. **`lagerort_id` MUSS im Prädikat jeder Aggregation bleiben.** Das ist die eine Zeile, an der die
   Umstellung von N+1 auf `GROUP BY` scheitern kann, und sie scheitert **still**: ohne den
   Lagerortbezug zählt nach der ersten Fahrzeugbuchung derselben Charge der Fahrzeugbestand als
   Handlager-Rest mit → **Phantombestand** und falsche FEFO-Verteilung
   (`lagerbuch/src/lib/domain/bestand.ts:22-24`). ⚠️ **In einer frisch migrierten Test-DB sind
   Handlager- und Fahrzeugbestand identisch** — der Fehler ist dort unsichtbar. Deshalb schuldet
   jedes Aggregat einen Differenztest mit **derselben `chargeId` an zwei Lagerorten**.
3. **Die Bezugsgrößen-Tabelle aus §5.2.1 ist NORMATIV.** Artikelliste, Artikel-Detail-Bestandszahl,
   Kennzahl „unter Mindestbestand", Verfall-KPI, Verfallsliste, Bestellvorschlag, Inventur-Differenz
   und Aussondern-Rest rechnen **Handlager**; „Artikel unter Soll" und `fahrzeugBestand` rechnen
   **das Fahrzeug**; der Buchungsverlauf im Artikel-Detail bleibt **lagerort-übergreifend** (er zeigt
   Umlagerungen als Aktivität). Jede Abweichung ist ein Verhaltensbruch, den kein Gate findet.
4. **`sql<number>` mit `sum(...)` liefert bei leerer Gruppe KEINE Zeile, nicht `0`.** Jede
   Map-Abfrage geht über `?? 0`. Das ist die stille Bruchstelle der Umstellung: heute liefert
   `bestandProLagerort` für einen Artikel ohne Buchungen `0`, morgen fehlt der Schlüssel.

**Die fünf Invarianten (§5.2.2), die dieser Plan hält**

- **I1 — Append-only.** `buchungen` kennt kein `UPDATE` und kein `DELETE`; Korrekturen sind **neue
  Zeilen mit `typ = "korrektur"`**. Die Trigger stehen seit Teil 1 (T8, T11). Geht ein Trigger
  verloren, gilt **keine** Regel dieses Plans mehr.
- **I2 — Bestand wird nie negativ.** Jeder Abgang läuft über `fefoAbbuchung`, das an der
  Verfügbarkeit **an diesem Lagerort** kappt. Positiv gebucht wird ohne Grenze.
- **I3 — Umlagerung ist netto null.** Das Ziel-Leg wird **strikt aus `teile[]`** gebucht, nie aus
  der gewünschten Menge. Beide Legs tragen `typ = "umlagerung"`, die `chargeId` bleibt erhalten.
- **I4 — Nach `korrekturAufLagerort(…, istMenge)` gilt `bestandProLagerort(…, lagerortId) === istMenge`.**
- **I5 — Der Zugang darf keine artikelfremde Charge treffen.** ⚠️ Diese Invariante wird in **Teil 5**
  eingelöst (H3) — der Zugang ist eine Action. Sie steht hier, weil sie in §5.2.2 steht.

**FEFO und die geratene Charge**

- **Die Sortierung ist der Determinismus, nicht ein Index** (§5.3.1):
  `verfall` → `createdAt` → `chargeId`. `ChargeRest` trägt dafür zusätzlich `createdAt` — die Spalte
  existiert (`schema.ts:62`), sie wird heute nur nicht durchgereicht.
- **Es gibt KEINEN Unique-Index auf `(artikelId, chargenNr, verfall)`** und es wird keiner
  eingeführt: er setzte eine Annahme über Produktionsdaten voraus, die im Repo nicht belegbar ist,
  und er verböte einen realen Vorgang (zwei Lieferungen mit derselben aufgedruckten Chargennummer).
- **Die Bedeutung der Pseudo-Charge hängt am VERFALLSWERT, nie an der Chargennummer** (§5.3.2). Drei
  Schreibpfade legen `"2099-12"` unter drei verschiedenen Nummern an (`"Inventur"`, `"Korrektur"`,
  `"ohne Verfall"`); jede Anzeige, jeder Filter und jede Ampel-Sonderbehandlung geht über
  `istOhneVerfall(v)`. **Wer über die Nummer filtert, verliert zwei von drei Fällen, und kein Gate
  meldet das.**
- **Die Charge wird an ZWEI Stellen geraten, nicht an dreien** (§5.3.3): `korrekturAufLagerort`
  (`korrektur.ts:27-30`) und `inventurKorrektur` (`inventur.ts:38`) wählen die **jüngste Charge des
  Artikels ohne jeden Lagerortbezug`. Die dritte Stelle aus §5.3.2 (`csv.ts:31`, CSV-Startbestand)
  **rät nicht** — sie legt eine neue Pseudo-Charge an. In **diesem** Plan liegt genau eine davon:
  `korrekturAufLagerort` (T58); `inventurKorrektur` gehört Teil 5, `csv.ts` ebenfalls.
- ⚠️ **Das Verfall-Feld im Zählschritt ist KEINE Redundanz.** Weil die Charge geraten ist, ist „wann
  läuft das Zeug im Fahrzeug ab?" über Chargen **nicht** beantwortbar — dafür gibt es
  `lagerort_verfall` (§4.11). **Wer es beim Neubau als redundant streicht („die Charge hat doch
  einen Verfall"), zerstört die Kompensation lautlos**, und typecheck, lint und Vitest bleiben grün
  (Falle 9).

**Zeit**

- **Alles rechnet über `_lib/zeit.ts` aus Teil 1.** Außerhalb dieser Datei steht im gesamten Modul
  **kein** `new Date(jahr, monat, …)` mit mehr als einem Argument. Ein Quelltext-Scan hält das fest
  (T39, Schritt 6) — er ist billig und fängt genau die Klasse, die §5.16 als „der Schaden läge in
  der Anzeige" beschreibt: eine Buchung um 01:30 Ortszeit zeigte das Journal unter UTC als
  **Vortag, 23:30**.
- **Zwei Rechnungen hängen ausdrücklich NICHT an der Zone** und dürfen deshalb reine
  Millisekunden-Arithmetik bleiben (§5.16): `bzFaelligkeit` (`letzteKontrolle + 31 · 86 400 000`)
  und `akkuLebensdauer`. Wer sie „vereinheitlicht", macht sie langsamer und nicht richtiger.
- **`config.tz` ist tot und wird gestrichen** (§10.2, §5.16). Der einzige Leser im ganzen Alt-Repo
  ist `config.test.ts:12`. Im Zielmodul gibt es **kein** `tz`-Feld.
- **Kein globaler `env`-/`TZ`-Block in `iuk-suite/vitest.config.ts`** (§12.6, Punkt 1). Er änderte
  die Testsemantik der vier laufenden Module, und **niemand braucht ihn**: unter Entscheidung 26 (b)
  trägt kein Test dieses Moduls eine zonenabhängige Zusage, die ein Pin retten müsste —
  `_lib/zeit.test.ts` verstellt `TZ` **absichtlich** und beweist damit die Unabhängigkeit.
  → Zonenabhängige Zusagen tragen ihre Zone **am Aufrufort**: als Parameter der geprüften Funktion
  oder als `Intl.DateTimeFormat(…, { timeZone })` in der Erwartung. **Nie** aus lokalen Komponenten
  konstruieren und mit lokalen Gettern zurücklesen — `lagerbuch/src/db/backup.test.ts:6-7` macht
  genau das und läuft deshalb unter **jeder** Zone grün.

**Grenzen und Zahlen**

- **Jeder Grenzwert trägt seine Einheit im Namen** (§10.1, §10.3). Das ist keine Formalie: `files`
  hat die Lehre teuer bezahlt, und lagerbuch trägt dieselbe Klasse in anderer Gestalt — zwei Namen,
  deren Rangfolge der Sprachgebrauch **umkehrt**.
- **Die Erwartungstabelle steht im TEST, nicht im Modul** (§10.8, Eigenschaft 2). `ZAHLEN` wird
  **nicht** exportiert, nur `ZAHL_NAMEN`. Sonst zöge der Test seine Erwartungswerte aus der
  Implementierung und bliebe **auch bei falscher Einheit grün**.
- **Gelesen wird bei JEDEM Aufruf, nicht beim Import** (§10.8, Eigenschaft 3). Das gilt auch für
  `grenzenFehler(env = process.env)` und für `verfallSchwellen(env = process.env)`.
- **Vier Warnfenster bleiben Konstanten und werden NICHT konfigurierbar:** `MTK_WARN_TAGE = 30`,
  `OBJEKT_ABLAUF_WARN_TAGE = 30` (beide in `_lib/domain/geraet.ts`), `BZ_KONTROLL_INTERVALL_TAGE = 31`,
  `BZ_WARN_TAGE = 5` (beide in `_lib/domain/bz.ts`). Sie waren nie Env; sie jetzt konfigurierbar zu
  machen wäre eine Neuerung, die niemand beauftragt hat. Bei `BZ_KONTROLL_INTERVALL_TAGE` ist es
  mehr als das: die 31 Tage sind die **Prüfvorgabe** für die Kontrolllösung, und ein Regler daran
  lädt dazu ein, eine Fälligkeit wegzukonfigurieren statt sie zu erfüllen.
- **Drei Deckel bleiben bei 100/50/100, werden aber BEOBACHTBAR** (§5.14.3, Entscheidung 35 a): die
  Abfrage holt `GRENZE + 1` Zeilen und gibt `mehrVorhanden: boolean` zurück; angezeigt werden
  `GRENZE`. Die Konstanten liegen in `_lib/grenzen.ts`, damit Abfrage **und** Text denselben Wert
  lesen — heute stehen die 100 an zwei Stellen und können auseinanderlaufen.

**Der Boot-Haken**

- **`lagerbuchBootFehler()` WIRFT NIE.** Ein Wurf aus dieser Funktion nähme die vier laufenden Module
  mit — `assertHostConfig()` läuft für die **ganze** Suite. Die Funktion sammelt Zeichenketten;
  **`assertHostConfig` entscheidet**, ob daraus ein Abbruch wird.
- **Die Bedingung geht über `prodHostsFor(getModule("lagerbuch"), env)`, NIE über `mod.prodHosts`.**
  Der Registry-Eintrag trägt `prodHosts: []`; der Feldzugriff machte `SUITE_HOST_LAGERBUCH` an genau
  dieser Stelle **wirkungslos**, und die sechs Prüfungen liefen nie. Das ist zeichengleich die Falle,
  die Teil 2 für `adminGroupsFor(mod)` gegen `mod.adminGroups` benannt hat.
- **Die Bedingtheit ist keine Milderung, sondern eine Notwendigkeit** (§10.5). Eine unbedingte
  Pflicht hieße: sobald ein Image mit `lagerbuch` auf dem Server landet, startet die Suite nicht
  mehr — portal, qr, feedback und files inklusive —, bis der Betreiber die `.env` ergänzt hat.
- ⚠️ **Für diese Naht gibt es KEIN Kopplungsnetz.** `src/core/bootstrap.test.ts` koppelt nur das
  Migrations-Dreieck (jedes Modul mit `_db/` steht in `MODULE_MIGRATIONS`, jeder Ordner hat ein
  `meta/_journal.json`, jeder Ordner wird ins Prod-Image kopiert) — **nicht** die Boot-Haken. Ohne
  den Haken existiert `_lib/boot.ts`, wird aber nie gerufen, alle sechs Prüfungen laufen nie, und
  **nichts wird rot**. T38 baut deshalb **zwei** Netze: eine Quelltext-Zusicherung in
  `bootstrap.test.ts` und einen **echten Startlauf** in der Abnahme.

**Was in diesem Teil ausdrücklich NICHT gebaut wird**

- **Keine Oberfläche.** Kein `page.tsx`, kein `_ui/`, kein `layout.tsx`, kein `error.tsx`. Dieser
  Teil baut ausschließlich Werte, Regeln und Pfade, die die Seiten ab Teil 4 aufrufen.
- **Keine Server Action.** `_actions/` bleibt leer; `_actions/guards.test.ts` (Teil 2, T20)
  toleriert das und wird **nicht angefasst**.
- **Keine Migration und keine Schema-Änderung.** Die vier neuen Indizes stehen seit Teil 1; dieser
  Plan **benutzt** sie und legt keinen weiteren an.
- **Keine `core`-Datei außer `src/core/bootstrap.ts`** — und die nur um **eine** Zeile im
  `errors`-Array plus den Import, in einem **eigenen Commit** (T38).
- **Kein Unique-Index auf `chargen`**, keine materialisierte Bestandstabelle, keine normalisierte
  Vergleichsspalte auf `buchungen`, kein `ß`/`ss`-Falten (§5.20).
- **Keine `e2e/lagerbuch-*.spec.ts`.** Dieser Plan baut das **Harness** (Seed, Konstanten,
  `webServer.env`); die sechs Spec-Dateien entstehen in Teil 6 (§12.2).

---

## 3. Datei-Eigentümerschaft — mechanisch prüfbar

Jede Datei gehört genau einem Task. Wer in einer fremden Datei arbeitet, hat den Schnitt verlassen.
**Kreuzpaare stehen mit vollem Pfad**, damit kein Task ein Modul „besitzt" und einen fremden Test
dagegen findet.

| Datei | Task |
|---|---|
| `src/app/m/lagerbuch/_lib/domain/verfall.ts`, `_lib/domain/verfall.test.ts` | T28 |
| `src/app/m/lagerbuch/_lib/domain/bestand.ts`, `_lib/domain/bestand.test.ts` | T29 |
| `src/app/m/lagerbuch/_lib/domain/fefo.ts`, `_lib/domain/fefo.test.ts` | T30 |
| `src/app/m/lagerbuch/_lib/domain/vorschlag.ts`, `_lib/domain/vorschlag.test.ts` | T31 |
| `src/app/m/lagerbuch/_lib/grenzen.ts` (**Erweiterung**), `_lib/grenzen.test.ts` (**Erweiterung**) | T32 |
| `src/app/m/lagerbuch/_lib/marke.ts`, `_lib/marke.test.ts` | T33 |
| `src/app/m/lagerbuch/_lib/domain/o2.ts`, `_lib/domain/o2.test.ts` | T34 |
| `src/app/m/lagerbuch/_lib/domain/geraet.ts`, `_lib/domain/geraet.test.ts` | T35 |
| `src/app/m/lagerbuch/_lib/domain/bz.ts`, `_lib/domain/bz.test.ts` | T36 |
| `src/app/m/lagerbuch/_lib/checkErgebnis.ts`, `_lib/checkErgebnis.test.ts` | T37 |
| `src/app/m/lagerbuch/_lib/boot.ts`, `_lib/boot.test.ts` | T38 (Commit 1) |
| `src/core/bootstrap.ts`, `src/core/bootstrap.test.ts` (**Erweiterung**) | T38 (Commit 2) |
| `src/app/m/lagerbuch/_lib/format.ts`, `_lib/format.test.ts` | T39 |
| `src/app/m/lagerbuch/_lib/domain/check.ts`, `_lib/domain/check.test.ts` | T40 |
| `src/app/m/lagerbuch/_lib/artikelFilter.ts`, `_lib/artikelFilter.test.ts` | T41 |
| `src/app/m/lagerbuch/_lib/journalZeile.ts`, `_lib/journalZeile.test.ts` | T42 |
| `src/app/m/lagerbuch/_lib/checkNutzlast.ts`, `_lib/checkNutzlast.test.ts` | T43 |
| `src/app/m/lagerbuch/_lib/lesepfade/bestand.ts`, **`_db/aggregate.test.ts`** | T44 |
| `src/app/m/lagerbuch/_lib/lesepfade/artikel.ts`, `_lib/lesepfade/artikel.test.ts` | T45 |
| `src/app/m/lagerbuch/_lib/lesepfade/journal.ts`, `_lib/lesepfade/journal.test.ts`, **`_db/suche.test.ts`** | T46 |
| `src/app/m/lagerbuch/_lib/lesepfade/verfall.ts`, `_lib/lesepfade/verfall.test.ts` | T47 |
| `src/app/m/lagerbuch/_lib/lesepfade/fahrzeuge.ts`, `_lib/lesepfade/fahrzeuge.test.ts` | T48 |
| `src/app/m/lagerbuch/_lib/lesepfade/checks.ts`, `_lib/lesepfade/checks.test.ts` | T49 |
| `src/app/m/lagerbuch/_lib/lesepfade/bestellung.ts`, `_lib/lesepfade/bestellung.test.ts` | T50 |
| `src/app/m/lagerbuch/_lib/lesepfade/bz.ts`, `_lib/lesepfade/bz.test.ts` | T51 |
| `src/app/m/lagerbuch/_lib/lesepfade/o2.ts`, `_lib/lesepfade/o2.test.ts` | T52 |
| `src/app/m/lagerbuch/_lib/lesepfade/geraete.ts`, `_lib/lesepfade/geraete.test.ts` | T53 |
| `src/app/m/lagerbuch/_lib/schreibpfade/abbuchung.ts`, `_lib/schreibpfade/abbuchung.test.ts`, **`_db/fefo.test.ts`** | T54 |
| `src/app/m/lagerbuch/_lib/schreibpfade/lagerortVerfall.ts`, `_lib/schreibpfade/lagerortVerfall.test.ts` | T55 |
| `src/app/m/lagerbuch/_lib/schreibpfade/templateSync.ts`, **`_db/template-sync.test.ts`** | T56 |
| `src/app/m/lagerbuch/_lib/schreibpfade/umlagerung.ts`, `_lib/schreibpfade/umlagerung.test.ts` | T57 |
| `src/app/m/lagerbuch/_lib/schreibpfade/korrektur.ts`, `_lib/schreibpfade/korrektur.test.ts` | T58 |
| `iuk-suite/e2e/helpers/lagerbuch.ts`, `iuk-suite/e2e/seed-lagerbuch.ts` | T59 |
| `iuk-suite/playwright.config.ts` (**Erweiterung**), `.env.example` (**Erweiterung**) | T60 |
| — (nur Ausführung und Protokoll) | T61 |

**Genau EINE `core`-Datei wird in Teil 3 angefasst:** `src/core/bootstrap.ts`, in einem **eigenen
Commit** (T38, Commit 2), zusammen mit der Erweiterung von `src/core/bootstrap.test.ts`. Das ist die
dritte und letzte `core`-Berührung des Vorhabens neben `core/shell/icons.ts` (Teil 1, T2) und
`core/shell/shell.module.css` (Teil 5). `core/ratelimit.ts`, `core/groups.ts` und `core/routing.ts`
bleiben unverändert — begründet in Teil 2, §2.

⚠️ **Vier Dateien werden von späteren Teilen ERWEITERT, nicht ersetzt:**

| Datei | Erweitert von | Um was |
|---|---|---|
| `_lib/grenzen.ts` | **diesem Plan** (T32) | `grenzenFehler()`, `JOURNAL_GRENZE`, `CHECK_GRENZE`, `BZ_LOGBUCH_GRENZE` |
| `_lib/bauform.test.ts` (Teil 2, T21) | Teil 4 | `usePathname`-Scan, Verschärfung der Weichen-Zeile |
| `_actions/guards.test.ts` (Teil 2, T20) | Teil 6 | die Zählung 47 = 44 + 3 |
| `iuk-suite/playwright.config.ts` | **diesem Plan** (T60) und Teil 6 | hier: `webServer.env` + Seed-Schritt; dort: nichts mehr — die Spec-Dateien brauchen keine Konfigurationsänderung |

---

## 4. Gates am Ende jeder Wellenstufe

```bash
pnpm typecheck        # muss grün sein
pnpm lint             # Fehler blockieren, Warnungen nicht
pnpm vitest run       # muss grün sein
pnpm build            # muss grün sein
```

**`pnpm exec playwright test` wird in Teil 3 zum ersten Mal fällig — und zwar ab Welle 7.** Vorher
gibt es nichts zu fahren: das Modul hat außer dem riegelfreien Layout (Teil 1, T6) und
`/abmelden` (Teil 2, T26) keine Route. Ab T60 muss der **vorhandene** Bestand grün bleiben:

```bash
pnpm exec playwright test    # ab Welle 7 — die VIER Bestandsmodule dürfen nicht brechen
```

⚠️ **Das ist die eigentliche Zusage von T60, nicht die neue Konfiguration.** `webServer.env` ist ein
**geteilter** Prozess: die neun Lagerbuch-Zeilen laufen im selben `next dev` wie portal, qr,
feedback und files. Ein Tippfehler in `SUITE_HOST_LAGERBUCH` bricht `validateHostConfig` und damit
**jeden** E2E-Lauf der Suite — nicht nur den von lagerbuch.

⚠️ **`pnpm build` prüft ab Welle 3 mehr als in Teil 2, aber immer noch nicht alles.** Bis Teil 4
importiert **keine Route** eine `_lib`-Datei außer über `abmelden/route.ts`; Next übersetzt ein
unreferenziertes Modul eines Private Folders **gar nicht**. Wo dieser Plan die Modulebene prüfen
will, benutzt er deshalb weiterhin einen **ausdrücklichen Import**:

```bash
pnpm exec tsx -e 'import("./src/app/m/lagerbuch/_lib/<datei>.ts").then(…)'
```

**Was die Gates strukturell NICHT sehen** (§12.4, §5.19.5) und wo es nachgeholt wird:

| Blindstelle | Nachgeholt |
|---|---|
| Eine falsche Lagerort-Bezugsgröße aus §5.2.1 — in einer frisch migrierten Test-DB sind Handlager- und Fahrzeugbestand **identisch** | `_db/aggregate.test.ts` (T44) mit **derselben `chargeId` an zwei Lagerorten** und einem Artikel mit Buchungen an **drei** Lagerorten |
| Die Sekunden-Granularität der Zeitstempel — ein Test mit **einer** Buchung erzeugt nie zwei Zeilen in derselben Sekunde | `_db/fefo.test.ts` (T54) und die Journalsortierung in `_lib/lesepfade/journal.test.ts` (T46), beide mit **ausdrücklich gleichem** `ts` |
| Die auseinanderlaufenden Suchhälften — reine ASCII-Begriffe verhalten sich **identisch** | `_db/suche.test.ts` (T46) mit `PÄCKCHEN` in Großschreibung |
| Der Boot-Haken, der nie gerufen wird | Quelltext-Zusicherung in `src/core/bootstrap.test.ts` (T38) **plus** echter Startlauf (T61) |
| Ein WERT aus einem `"use client"`-Modul in einer Server Component (Falle 6) | `_lib/bauform.test.ts` (Teil 2, T21) scannt `_lib/` — **er läuft in jeder Welle mit** |
| `@ant-design/icons` in RSC (Falle 7) | `src/core/shell/icons.test.ts` (Bestand, repo-weit) |
| Ein `new Date(y, m, …)` außerhalb `_lib/zeit.ts` | Quelltext-Scan in `_lib/format.test.ts` (T39, Schritt 6) |
| Alles, was eine gerenderte Seite braucht | Teil 4 bis Teil 6 |

---

## Welle 1 — Reine Domäne und die Zahlen-Ergänzung (6 Tasks, alle parallel)

Diese sechs Tasks berühren einander nicht. T28 (`verfall.ts`) ist die früheste Datei dieses Plans:
sie definiert den Typ `Ampel`, den drei Tasks der **zweiten** Welle konsumieren — deshalb liegen
`o2.ts`, `geraet.ts` und `bz.ts` dort und nicht hier.

⚠️ **T32 arbeitet in einer VORHANDENEN Datei.** `_lib/grenzen.ts` und `_lib/grenzen.test.ts` sind in
Teil 2 (T15) entstanden. Wer dort `Write` statt `Edit` benutzt, löscht die vollständige
`ZAHLEN`-Tabelle und macht `gateSchranke.ts` und `helferSitzung.ts` unübersetzbar.

---

### Task 28: `_lib/domain/verfall.ts` — ein Name für eine Zahl, über die ganze Kette

**Files:**
- Create: `src/app/m/lagerbuch/_lib/domain/verfall.ts`
- Test: `src/app/m/lagerbuch/_lib/domain/verfall.test.ts`

**Interfaces:**
- Consumes: `_lib/zeit.ts` (Teil 1, T3) — `monatsEnde(verfall: string): Date`;
  `_lib/grenzen.ts` (Teil 2, T15) — `grenzen(env?): Grenzen` mit `verfallRotTage`/`verfallGelbTage`;
  `_lib/konstanten.ts` (Teil 1, T4) — `PSEUDO_VERFALL` **nur für den Test**.
- Produces:
  ```ts
  export type Ampel = "rot" | "gelb" | "gruen";
  export type VerfallSchwellen = { rotTage: number; gelbTage: number };
  export type VerfallStatus = { ampel: Ampel; tage: number; abgelaufen: boolean };

  export function verfallStatus(verfall: string, schwellen: VerfallSchwellen,
                                now: Date): VerfallStatus;
  export function verfallSchwellen(env?: Record<string, string | undefined>): VerfallSchwellen;
  ```
  Konsumenten: `_lib/domain/o2.ts`, `geraet.ts`, `bz.ts` (T34–T36, **nur der Typ `Ampel`**),
  `_lib/format.ts` (T39), `_lib/lesepfade/bestand.ts` (T44), `verfall.ts` (T47), `checks.ts` (T49),
  `_lib/checkNutzlast.ts` (T43), `_lib/schreibpfade/lagerortVerfall.ts` (T55).

**Warum `Ampel` hier wohnt und nirgends sonst.** §5.1 führt die Zeile
`domain/verfall.ts   Ampel · verfallStatus` — der Typ ist die gemeinsame Sprache von vier
Fälligkeitsrechnungen (`verfallStatus`, `o2Status`, `datumFaelligkeit`, `bzFaelligkeit`). Ein
eigenes `ampelTyp.ts` wäre eine Datei mehr für drei Wörter; ein zweiter Literal-Union in `o2.ts`
wäre genau die Typinkonsistenz, gegen die die `Produces`-Blöcke geschrieben sind.

**Die Umbenennung (Festlegung H2) und warum sie nicht kosmetisch ist.** `lagerbuch/src/lib/config.ts:36-37`
deklariert `WARN_TAGE_KRITISCH` (31) und `WARN_TAGE_FAELLIG` (56), und `verfall.ts:14-16` liest sie
als `opts.kritisch` bzw. `opts.faellig`. **„Kritisch" klingt dringender als „fällig", ist aber das
kleinere Fenster.** Wer die beiden Werte beim Übertragen vertauscht — 56 nach `kritisch`, 31 nach
`faellig` —, bekommt **keinen Fehler**: der Gelb-Zweig ist dann unerreichbar, weil jede Charge mit
`tage <= 31` schon im Rot-Zweig gelandet ist. Die Ampel hat danach zwei Zustände statt drei, **elf**
Aufrufstellen zeigen sie, und kein Gate sieht es (beide Werte sind positive Ganzzahlen, beide
Zuweisungen typkorrekt, und ein Test mit einer Charge in 90 Tagen ist unter **beiden** Belegungen
grün).

⚠️ **`verfallSchwellen()` ist die EINZIGE Brücke zwischen `grenzen()` und `verfallStatus()`.** Kein
Lesepfad baut das Objekt selbst. Gäbe es zwei Bauorte, könnte einer die Felder vertauschen — und der
ganze Zweck der Umbenennung wäre dahin.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/domain/verfall.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { verfallStatus, verfallSchwellen, type VerfallSchwellen } from "./verfall";
import { PSEUDO_VERFALL } from "../konstanten";
import { ZEITZONE, ausZivilzeit } from "../zeit";

/**
 * DIE SCHWELLEN STEHEN HIER ALS LITERALE, nicht aus `grenzen()` gelesen.
 *
 * Die Funktion nimmt sie als Parameter — genau deshalb ist sie ohne Umgebung
 * pruefbar. Wer hier `verfallSchwellen()` einsetzte, machte aus jedem Fall eine
 * Aussage ueber die .env statt ueber die Rechnung.
 */
const S: VerfallSchwellen = { rotTage: 31, gelbTage: 56 };

/** Ein fester Bezugspunkt: 1. Januar 2026, 12:00 Ortszeit. Ueber `ausZivilzeit`
 *  gebildet, damit der Test unter JEDER Prozess-TZ dasselbe meint (§12.6, Punkt 1). */
const NOW = ausZivilzeit(2026, 1, 1, 12, 0, 0, 0);

describe("verfallStatus — das Monatsende", () => {
  it("ist der LETZTE Tag des Monats, 23:59:59.999 in ZEITZONE", () => {
    // Die Zusage wird ueber Intl gegen die ZONE zurueckgelesen, NICHT ueber
    // lokale Getter. `d.getHours()` antwortete unter TZ=UTC 21 statt 23 und der
    // Test waere unter jeder Zone gruen bzw. unter jeder anderen rot — genau die
    // Bauform, die `lagerbuch/src/db/backup.test.ts:6-7` falsch macht.
    const s = verfallStatus("2026-08", S, NOW);
    // 2026-08 laeuft am 31.08.2026 ab; von NOW (01.01.) sind das 242 Tage.
    expect(s.ampel).toBe("gruen");
    expect(s.abgelaufen).toBe(false);
  });

  it("rechnet das Monatsende ueber _lib/zeit.ts, nicht ueber new Date(y, m, 0, …)", () => {
    // Kanten-Nachweis: der 31.08.2026, 23:59:59.999 Ortszeit liegt in Berlin bei
    // 21:59:59.999Z (Sommerzeit). Wir pruefen die Zonen-Zurueckrechnung, nicht die
    // Zahl 242.
    const ende = ausZivilzeit(2026, 8, 31, 23, 59, 59, 999);
    const f = new Intl.DateTimeFormat("de-DE", {
      timeZone: ZEITZONE, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    expect(f.format(ende)).toBe("31.08.2026, 23:59");
  });
});

describe("verfallStatus — `tage` ist AUFGERUNDET", () => {
  it("eine Charge, die in 12 Stunden ablaeuft, hat tage = 1, nicht 0", () => {
    // Math.ceil, nicht Math.round und nicht Math.floor. Eine abgerundete Zahl
    // liesse eine Charge am Ablauftag als „0 Tage" erscheinen und verschoebe
    // JEDE Ampelkante um einen Tag nach unten.
    const ende = ausZivilzeit(2026, 1, 31, 23, 59, 59, 999);
    const zwoelfStundenVorher = new Date(ende.getTime() - 12 * 3_600_000);
    const s = verfallStatus("2026-01", S, zwoelfStundenVorher);
    expect(s.tage).toBe(1);
    expect(s.abgelaufen).toBe(false);
  });
});

describe("verfallStatus — die drei Schwellen an ihren KANTEN", () => {
  /** Ein `now`, aus dem sich genau `tage` bis zum Monatsende ergeben. */
  function nowFuerTage(verfall: string, tage: number): Date {
    const [y, m] = verfall.split("-").map(Number);
    const ende = ausZivilzeit(y, m + 1, 0, 23, 59, 59, 999);
    // ceil((ende - now)/86_400_000) === tage  ⇔  now liegt knapp unter der Kante.
    return new Date(ende.getTime() - (tage - 1) * 86_400_000 - 1);
  }

  it("tage === rotTage ist ROT (nicht gelb) — die Grenze ist inklusiv", () => {
    expect(verfallStatus("2026-06", S, nowFuerTage("2026-06", 31)).ampel).toBe("rot");
  });

  it("tage === rotTage + 1 ist GELB", () => {
    expect(verfallStatus("2026-06", S, nowFuerTage("2026-06", 32)).ampel).toBe("gelb");
  });

  it("tage === gelbTage ist GELB (nicht gruen) — auch diese Grenze ist inklusiv", () => {
    expect(verfallStatus("2026-06", S, nowFuerTage("2026-06", 56)).ampel).toBe("gelb");
  });

  it("tage === gelbTage + 1 ist GRUEN", () => {
    expect(verfallStatus("2026-06", S, nowFuerTage("2026-06", 57)).ampel).toBe("gruen");
  });

  it("VERTAUSCHTE Schwellen machen den Gelb-Zweig unerreichbar — die Falle aus §10.1", () => {
    /**
     * Diese Zeile ist der Grund fuer die Umbenennung (Festlegung H2, §10.1). Sie
     * beweist NICHT, dass der Code richtig ist — sie beweist, dass ein
     * vertauschtes Wertepaar KEINEN Fehler wirft und die Ampel still auf zwei
     * Zustaende zusammenfaellt. Der Riegel dagegen ist Boot-Pruefung 2 (T32),
     * nicht diese Funktion.
     */
    const vertauscht: VerfallSchwellen = { rotTage: 56, gelbTage: 31 };
    for (const tage of [1, 15, 31, 40, 56]) {
      expect(verfallStatus("2026-06", vertauscht, nowFuerTage("2026-06", tage)).ampel).toBe("rot");
    }
    expect(verfallStatus("2026-06", vertauscht, nowFuerTage("2026-06", 57)).ampel).toBe("gruen");
    // KEIN Aufruf liefert jemals "gelb". Genau das sieht kein Gate.
  });
});

describe("verfallStatus — `abgelaufen` ist NICHT dasselbe wie ampel === 'rot'", () => {
  it("eine abgelaufene Charge ist immer rot", () => {
    const s = verfallStatus("2020-01", S, NOW);
    expect(s.abgelaufen).toBe(true);
    expect(s.ampel).toBe("rot");
    expect(s.tage).toBeLessThan(0);
  });

  it("eine rote Charge ist NICHT immer abgelaufen", () => {
    // 20 Tage Restlaufzeit: rot, aber nicht abgelaufen. Die Verfallsliste
    // sortiert genau nach diesem Unterschied in drei Raengen (§5.6.1).
    const ende = ausZivilzeit(2026, 1, 31, 23, 59, 59, 999);
    const s = verfallStatus("2026-01", S, new Date(ende.getTime() - 20 * 86_400_000));
    expect(s.ampel).toBe("rot");
    expect(s.abgelaufen).toBe(false);
  });
});

describe("verfallStatus — die Pseudo-Charge", () => {
  it("PSEUDO_VERFALL ist bis 2099 gruen", () => {
    // Die Verfallsliste blendet gruen aus — deshalb taucht die Pseudo-Charge dort
    // nicht auf, und genau das bleibt so (§5.3.2).
    const s = verfallStatus(PSEUDO_VERFALL, S, NOW);
    expect(s.ampel).toBe("gruen");
    expect(s.abgelaufen).toBe(false);
  });
});

describe("verfallSchwellen — die EINZIGE Bruecke von grenzen() hierher", () => {
  it("bildet verfallRotTage auf rotTage ab und verfallGelbTage auf gelbTage", () => {
    // Wuerden die Felder hier vertauscht, waere die ganze Umbenennung aus §10.1
    // wirkungslos — und der Fehler saesse an EINER Stelle statt an elf. Das ist
    // der Zweck der Bruecke, und deshalb hat sie einen eigenen Fall.
    const s = verfallSchwellen({
      LAGERBUCH_VERFALL_ROT_TAGE: "10",
      LAGERBUCH_VERFALL_GELB_TAGE: "20",
    });
    expect(s).toEqual({ rotTage: 10, gelbTage: 20 });
  });

  it("liefert bei leerer Umgebung die Vorgaben 31 / 56", () => {
    expect(verfallSchwellen({})).toEqual({ rotTage: 31, gelbTage: 56 });
  });

  it("liest bei JEDEM Aufruf, nicht beim Import", () => {
    expect(verfallSchwellen({ LAGERBUCH_VERFALL_ROT_TAGE: "7" }).rotTage).toBe(7);
    expect(verfallSchwellen({ LAGERBUCH_VERFALL_ROT_TAGE: "9" }).rotTage).toBe(9);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/verfall.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./verfall"`.

- [ ] **Schritt 3: `_lib/domain/verfall.ts` schreiben**

```ts
/**
 * Die Verfallsampel — die Kernsprache dieses Moduls.
 *
 * KEIN "use client". Die Ampel wird von Server Components entschieden und von
 * Client-Inseln nur DARGESTELLT; ein Wert aus einem Client-Modul kaeme in einer
 * Server Component als Client-Referenz an (Falle 6, `CLAUDE.md:24-27`).
 *
 * KEIN Icon-Import, kein JSX, kein Hexwert. Diese Datei entscheidet, WELCHE Farbe
 * gilt — nicht, wie sie aussieht. Die Palette liegt in `_lib/ampel.ts` (Teil 5,
 * §6.6.2); ein hier festgenagelter Hexwert entschiede Entscheidung 30 versehentlich
 * mit (§12.1, Punkt 4).
 */
import { monatsEnde } from "../zeit";
import { grenzen } from "../grenzen";

/**
 * Die drei Ampelzustaende. EIN Typ fuer vier Rechnungen — `verfallStatus`,
 * `o2Status`, `datumFaelligkeit` und `bzFaelligkeit` sprechen dieselbe Sprache.
 * Ein zweiter Literal-Union in `o2.ts` waere die Typinkonsistenz, gegen die die
 * Produces-Bloecke geschrieben sind.
 */
export type Ampel = "rot" | "gelb" | "gruen";

/**
 * DIE NAMEN TRAGEN IHRE FARBE UND IHRE EINHEIT (§10.1, Festlegung H2).
 *
 * Die Alt-Anwendung heisst sie `{ kritisch, faellig }` — und genau diese zwei
 * Namen sind der Fehler: „kritisch" klingt dringender als „faellig", ist aber das
 * KLEINERE Fenster. Vertauscht man die Werte beim Uebertragen, wirft nichts: der
 * Gelb-Zweig wird unerreichbar, weil jede Charge mit `tage <= 56` schon im
 * Rot-Zweig gelandet ist. Die Ampel hat danach zwei Zustaende statt drei, elf
 * Aufrufstellen zeigen sie, und kein Gate sieht es.
 */
export type VerfallSchwellen = { rotTage: number; gelbTage: number };

export type VerfallStatus = {
  ampel: Ampel;
  /** Kalendertage bis zum Monatsende, AUFGERUNDET. Negativ, wenn abgelaufen. */
  tage: number;
  /**
   * `abgelaufen` und `ampel === "rot"` sind NICHT dasselbe: eine abgelaufene
   * Charge ist immer rot, eine rote nicht immer abgelaufen. Die Verfallsliste
   * sortiert danach in drei Raengen (§5.6.1).
   */
  abgelaufen: boolean;
};

/**
 * Ampel, Resttage und Ablaufkennzeichen fuer ein Monatsdatum "YYYY-MM".
 *
 * Das Monatsende kommt aus `_lib/zeit.ts#monatsEnde` — ZONENEXPLIZIT. Die
 * Alt-Anwendung bildet es mit `new Date(y, m, 0, 23,59,59,999)` (`verfall.ts:10`),
 * also aus lokalen Komponenten: unter TZ=UTC schnitte sie das Monatsende zwei
 * Stunden SPAETER. Beide Ampelgrenzen wanderten dabei in die harmlose Richtung —
 * kaputt ginge `fmtTs`, wo eine Buchung um 01:30 Ortszeit als Vortag 23:30
 * erschiene (§5.16). Unter Entscheidung 26 (b) tritt keiner der Faelle ein.
 *
 * `now` ist ein PARAMETER und keine Vorbelegung: eine Funktion, die `new Date()`
 * selbst bildet, ist nur mit gefaelschter Uhr pruefbar.
 */
export function verfallStatus(
  verfall: string,
  schwellen: VerfallSchwellen,
  now: Date,
): VerfallStatus {
  const ende = monatsEnde(verfall);
  // AUFGERUNDET: eine Charge, die in 12 Stunden ablaeuft, hat tage = 1, nicht 0.
  const tage = Math.ceil((ende.getTime() - now.getTime()) / 86_400_000);
  const abgelaufen = ende.getTime() < now.getTime();
  let ampel: Ampel;
  if (tage <= schwellen.rotTage) ampel = "rot";
  else if (tage <= schwellen.gelbTage) ampel = "gelb";
  else ampel = "gruen";
  return { ampel, tage, abgelaufen };
}

/**
 * DIE EINZIGE BRUECKE zwischen `_lib/grenzen.ts` und dieser Datei.
 *
 * Kein Lesepfad baut `{ rotTage, gelbTage }` selbst. Gaebe es zwei Bauorte,
 * koennte einer die Felder vertauschen — und der ganze Zweck der Umbenennung
 * waere dahin.
 *
 * GELESEN WIRD BEI JEDEM AUFRUF, nicht beim Import (§10.8, Eigenschaft 3): ein
 * Modul-Singleton wuerde von `next build` ausgewertet, das mit
 * NODE_ENV=production und ohne .env laeuft.
 *
 * ⚠️ Diese Funktion prueft die KOPPLUNG NICHT. `rotTage > gelbTage` ist eine
 * Boot-Pruefung (§10.5, Pruefung 2) und liegt in `grenzenFehler()` (T32) — der
 * Boot will alle Fehler auf einmal melden, nicht den ersten, und eine
 * Leseseite darf an einer Fehlkonfiguration nicht mit einem Wurf enden.
 */
export function verfallSchwellen(
  env: Record<string, string | undefined> = process.env,
): VerfallSchwellen {
  const g = grenzen(env);
  return { rotTage: g.verfallRotTage, gelbTage: g.verfallGelbTage };
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/verfall.test.ts
```

Erwartet: alle Fälle grün.

- [ ] **Schritt 5: Die Zonen-Unabhängigkeit einmal wirklich fahren**

⚠️ **Das ist der Schritt, den §12.6, Punkt 1 verlangt und den kein Testlauf von selbst tut.** Der
Test oben rechnet über `ausZivilzeit`/`Intl` — die Behauptung, dass er **unter jeder Zone**
dasselbe sagt, prüft nur ein zweiter Lauf:

```bash
TZ=UTC pnpm vitest run src/app/m/lagerbuch/_lib/domain/verfall.test.ts
TZ=Pacific/Kiritimati pnpm vitest run src/app/m/lagerbuch/_lib/domain/verfall.test.ts
```

Erwartet: **beide grün, mit identischer Fallzahl.** Geht einer rot, hängt eine Erwartung an lokalen
Komponenten und gehört auf `ausZivilzeit` bzw. `Intl.DateTimeFormat(…, { timeZone: ZEITZONE })`
umgestellt — **nicht** auf einen `env`-Block in `vitest.config.ts` (§12.6, Punkt 1).

- [ ] **Schritt 6: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/domain/verfall.ts src/app/m/lagerbuch/_lib/domain/verfall.test.ts
git commit -m "feat(lagerbuch): _lib/domain/verfall.ts — Ampel, Schwellen mit Farbe im Namen

verfallStatus(verfall, { rotTage, gelbTage }, now) statt { kritisch, faellig }
(Festlegung H2, Spec §10.1): 'kritisch' klingt dringender als 'faellig', ist aber
das kleinere Fenster. Vertauscht wirft nichts — der Gelb-Zweig wird unerreichbar
und die Ampel hat zwei Zustaende statt drei, an elf Aufrufstellen. Ein Testfall
haelt genau das fest, damit die Umbenennung eine Zusage ist und keine Bitte.

Das Monatsende kommt aus _lib/zeit.ts#monatsEnde, zonenexplizit — nie aus
new Date(y, m, 0, …). Der Test ist unter TZ=UTC und TZ=Pacific/Kiritimati
gefahren worden; ein env-Block in vitest.config.ts wird ausdruecklich NICHT
eingezogen (§12.6, Punkt 1).

verfallSchwellen(env) ist die einzige Bruecke von grenzen() hierher und liest bei
jedem Aufruf. Die Kopplung rotTage <= gelbTage prueft der BOOT (T32), nicht diese
Datei."
```

---

### Task 29: `_lib/domain/bestand.ts` — vier Begriffe, zwei davon tragend

**Files:**
- Create: `src/app/m/lagerbuch/_lib/domain/bestand.ts`
- Test: `src/app/m/lagerbuch/_lib/domain/bestand.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export function bestand(rows: { menge: number }[]): number;
  export function bestandProCharge(rows: { chargeId: string; menge: number }[]): Map<string, number>;
  export function bestandProLagerort(rows: { lagerortId: string; menge: number }[],
                                     lagerortId: string): number;
  export function bestandProLagerortUndCharge(
    rows: { lagerortId: string; chargeId: string; menge: number }[],
    lagerortId: string): Map<string, number>;
  ```
  Konsumenten: `_lib/lesepfade/bestand.ts` (T44, als **Spezifikation** im Differenztest),
  `_lib/schreibpfade/abbuchung.ts` (T54), `korrektur.ts` (T58), `_db/aggregate.test.ts` (T44).

**Warum diese vier Funktionen mitportiert und NICHT gelöscht werden** (§5.2.4, die ausdrücklich
benannte Falle). Wenn die Leseseite auf SQL-Aggregation wechselt, leben sie nur noch in ihren
eigenen Tests — die Tests sind dann grün und bewachen nichts mehr. **Trotzdem bleiben sie, weil sie
die Spezifikation SIND:** jedes Aggregat aus T44 schuldet einen **Differenztest** gegen seine reine
Funktion, und ohne die Funktion gäbe es nichts, wogegen man differenziert.

**Die zwei tragenden Begriffe und ihre Invariante im Quelltext.** `bestandProLagerort` und
`bestandProLagerortUndCharge` sind die einzigen, die die Alt-Anwendung produktiv benutzt; ihre
Begründung steht dort als Kommentar und ist eine **Invariante, kein Kommentar**:

> „Sobald Fahrzeuge eigene Buchungen tragen, darf keine Handlager-Ansicht mehr blind über alle
> Lagerorte summieren" (`bestand.ts:13-14`) und „Kern-Fix gegen Phantombestand:
> FEFO/Aussonderung/Inventur dürfen nicht die gleiche chargeId aus einem anderen Lagerort
> mitzählen" (`:22-24`).

⚠️ **`bestand(rows)` ist der schwächste Begriff und in `queries.ts` NIRGENDS benutzt.** Er wandert
trotzdem mit: er ist die Definition, auf der die drei anderen aufsetzen, und er ist der Fall, den
ein Aufrufer erwischt, der die Zeilenmenge **vorher** gefiltert hat. Wer ihn streicht, lädt dazu
ein, ihn beim nächsten Mal ohne Filter zu benutzen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/domain/bestand.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  bestand, bestandProCharge, bestandProLagerort, bestandProLagerortUndCharge,
} from "./bestand";
import { HANDLAGER_ID } from "../konstanten";

/**
 * DIE KONSTELLATION, DIE DAS SCOPING UEBERHAUPT ERST NOETIG MACHT:
 * dieselbe chargeId liegt GLEICHZEITIG im Handlager und in einem Fahrzeug.
 * Ohne Lagerort-Praedikat zaehlte die Handlager-Rechnung den Fahrzeugbestand mit
 * (Phantombestand) — und in einer frisch migrierten Test-DB waere das unsichtbar,
 * weil dort beide Bestaende identisch sind (§5.2.1).
 */
const ZEILEN = [
  { lagerortId: HANDLAGER_ID, chargeId: "c1", menge: 10 },
  { lagerortId: HANDLAGER_ID, chargeId: "c1", menge: -3 },
  { lagerortId: "rtw-1", chargeId: "c1", menge: 4 },   // dieselbe Charge, anderer Ort
  { lagerortId: HANDLAGER_ID, chargeId: "c2", menge: 5 },
  { lagerortId: "rtw-2", chargeId: "c2", menge: 2 },
];

describe("bestand — die Summe ueber eine bereits gefilterte Zeilenmenge", () => {
  it("summiert vorzeichenbehaftet", () => {
    expect(bestand([{ menge: 10 }, { menge: -3 }, { menge: 4 }])).toBe(11);
  });

  it("liefert fuer eine leere Menge 0, nicht undefined", () => {
    // Das ist die Zusage, die beim Wechsel auf SQL bricht: `sum()` liefert bei
    // leerer Gruppe KEINE ZEILE, nicht 0 (§5.2.4, Punkt 3).
    expect(bestand([])).toBe(0);
  });
});

describe("bestandProCharge — Rest je Charge, OHNE Lagerortbezug", () => {
  it("fasst je chargeId zusammen — ueber ALLE Lagerorte", () => {
    // Der schwaechere der beiden Charge-Begriffe. Sein einziger Aufrufer im
    // Bestand filtert VORHER selbst auf einen Lagerort (`queries.ts:31`).
    const m = bestandProCharge(ZEILEN.map((z) => ({ chargeId: z.chargeId, menge: z.menge })));
    expect(m.get("c1")).toBe(11);  // 10 − 3 + 4, Fahrzeug MITGEZAEHLT
    expect(m.get("c2")).toBe(7);
  });
});

describe("bestandProLagerort — der tragende Begriff", () => {
  it("zaehlt NUR den genannten Lagerort", () => {
    expect(bestandProLagerort(ZEILEN, HANDLAGER_ID)).toBe(12);  // 10 − 3 + 5
    expect(bestandProLagerort(ZEILEN, "rtw-1")).toBe(4);
    expect(bestandProLagerort(ZEILEN, "rtw-2")).toBe(2);
  });

  it("liefert fuer einen Lagerort ohne Buchungen 0, NICHT undefined", () => {
    // Dieselbe Bruchstelle wie oben — hier fuer den Fall, den die Fahrzeugliste
    // taeglich trifft: ein frisch angelegtes Fahrzeug hat keine einzige Buchung.
    expect(bestandProLagerort(ZEILEN, "rtw-neu")).toBe(0);
    expect(bestandProLagerort([], HANDLAGER_ID)).toBe(0);
  });
});

describe("bestandProLagerortUndCharge — der Kern-Fix gegen Phantombestand", () => {
  it("fuehrt DIESELBE chargeId an zwei Lagerorten GETRENNT", () => {
    /**
     * DAS IST DIE ZEILE, UM DIE ES GEHT (`bestand.ts:22-24`). Ohne das
     * Lagerort-Praedikat saehe die FEFO-Abbuchung fuer `c1` einen Rest von 11
     * statt 7 — sie buchte mehr ab, als im Handlager liegt, und der
     * Handlager-Bestand wuerde negativ (I2 gebrochen).
     */
    const imHandlager = bestandProLagerortUndCharge(ZEILEN, HANDLAGER_ID);
    expect(imHandlager.get("c1")).toBe(7);   // 10 − 3, OHNE die 4 aus rtw-1
    expect(imHandlager.get("c2")).toBe(5);

    const imRtw = bestandProLagerortUndCharge(ZEILEN, "rtw-1");
    expect(imRtw.get("c1")).toBe(4);
    expect(imRtw.has("c2")).toBe(false);     // c2 liegt in rtw-2, nicht in rtw-1
  });

  it("laesst Chargen ohne Buchung an diesem Ort GANZ weg (kein 0-Eintrag)", () => {
    // Wichtig fuer den Differenztest in T44: das SQL-Aggregat verhaelt sich
    // genauso (keine Zeile statt 0), und beide Seiten gehen deshalb ueber `?? 0`.
    const m = bestandProLagerortUndCharge(ZEILEN, "rtw-1");
    expect([...m.keys()]).toEqual(["c1"]);
  });

  it("liefert fuer einen unbekannten Lagerort eine LEERE Map", () => {
    expect(bestandProLagerortUndCharge(ZEILEN, "gibtsnicht").size).toBe(0);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/bestand.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./bestand"`.

- [ ] **Schritt 3: `_lib/domain/bestand.ts` schreiben**

```ts
/**
 * Die vier Bestandsbegriffe — 1:1 aus `lagerbuch/src/lib/domain/bestand.ts`.
 *
 * KEIN "use client", kein Icon-Import, kein Datenbankzugriff. Reine Funktionen
 * ueber bereits geladene Zeilen.
 *
 * ⚠️ SIE BLEIBEN, AUCH WENN DIE LESESEITE SIE NICHT MEHR RUFT (§5.2.4). Entscheidung
 * 7 (b) ersetzt jede N+1-Schleife durch EINE aggregierende SQL-Abfrage
 * (`_lib/lesepfade/bestand.ts`); danach leben diese vier nur noch in ihren eigenen
 * Tests. Das ist gewollt: SIE SIND DIE SPEZIFIKATION. Jedes Aggregat schuldet
 * einen Differenztest gegen die Funktion hier — ohne die Funktion gaebe es
 * nichts, wogegen man differenziert.
 */

/**
 * Summe ueber eine BEREITS GEFILTERTE Zeilenmenge — der schwaechste Begriff, in
 * `queries.ts` nirgends benutzt. Er wandert trotzdem mit: er ist die Definition,
 * auf der die drei anderen aufsetzen, und wer ihn streicht, laedt dazu ein, ihn
 * beim naechsten Mal ohne Filter zu benutzen.
 *
 * Vorzeichenbehaftet: Zugang +, Entnahme − (`schema.ts:98`).
 */
export function bestand(rows: { menge: number }[]): number {
  return rows.reduce((sum, r) => sum + r.menge, 0);
}

/**
 * Rest je `chargeId` — OHNE Lagerortbezug. Einziger Aufrufer im Bestand ist
 * `chargenMitRest` (`queries.ts:31`), und der filtert VORHER selbst auf einen
 * Lagerort. Wer diese Funktion ohne Vorfilter benutzt, bekommt Phantombestand.
 */
export function bestandProCharge(
  rows: { chargeId: string; menge: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.chargeId, (m.get(r.chargeId) ?? 0) + r.menge);
  return m;
}

/**
 * Bestand EINES Lagerorts.
 *
 * INVARIANTE, KEIN KOMMENTAR: „Sobald Fahrzeuge eigene Buchungen tragen, darf
 * keine Handlager-Ansicht mehr blind ueber alle Lagerorte summieren"
 * (`bestand.ts:13-14`). Die normative Zuordnung, welche Ansicht welchen Lagerort
 * summiert, steht in §5.2.1 und ist verbindlich — jede Abweichung ist ein
 * Verhaltensbruch, den kein Gate findet, weil Handlager- und Fahrzeugbestand sich
 * erst unterscheiden, wenn tatsaechlich umgelagert wurde.
 */
export function bestandProLagerort(
  rows: { lagerortId: string; menge: number }[],
  lagerortId: string,
): number {
  return rows.reduce((sum, r) => (r.lagerortId === lagerortId ? sum + r.menge : sum), 0);
}

/**
 * Rest je Charge AN EINEM Lagerort — der Kern-Fix gegen Phantombestand
 * (`bestand.ts:22-24`): „FEFO/Aussonderung/Inventur duerfen nicht die gleiche
 * chargeId aus einem anderen Lagerort mitzaehlen (z. B. dieselbe Charge liegt
 * teils im Handlager, teils im RTW)."
 *
 * ⚠️ Chargen ohne Buchung an diesem Ort fehlen in der Map GANZ — es gibt keinen
 * 0-Eintrag. Das SQL-Aggregat aus §5.2.4 verhaelt sich genauso (`sum()` liefert
 * bei leerer Gruppe keine Zeile), und beide Seiten gehen deshalb ueber `?? 0`.
 */
export function bestandProLagerortUndCharge(
  rows: { lagerortId: string; chargeId: string; menge: number }[],
  lagerortId: string,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.lagerortId !== lagerortId) continue;
    m.set(r.chargeId, (m.get(r.chargeId) ?? 0) + r.menge);
  }
  return m;
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/bestand.test.ts
```

- [ ] **Schritt 5: Die Mutationsprobe einmal fahren**

⚠️ **Ohne diesen Schritt ist „das Scoping ist geprüft" eine Absichtserklärung.** Entferne in
`bestandProLagerortUndCharge` die Zeile `if (r.lagerortId !== lagerortId) continue;` und fahre den
Test erneut:

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/bestand.test.ts
```

Erwartet: **rot**, mit `expected 11 to be 7` im Fall „führt DIESELBE chargeId an zwei Lagerorten
GETRENNT". Danach die Zeile wiederherstellen. Dieselbe Mutation wird in T44 gegen das **SQL**-Aggregat
gefahren — dort ist sie ein weggelassenes `where`.

- [ ] **Schritt 6: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/domain/bestand.ts src/app/m/lagerbuch/_lib/domain/bestand.test.ts
git commit -m "feat(lagerbuch): _lib/domain/bestand.ts — die vier Begriffe, 1:1

Der Bestand ist nie eine Spalte, immer die Summe vorzeichenbehafteter
Buchungsmengen — und die Summe ist immer lagerort-gescoped. Der Test faehrt die
Konstellation, die das Scoping ueberhaupt erst noetig macht: dieselbe chargeId
gleichzeitig im Handlager und in einem Fahrzeug. Ohne Praedikat saehe die
FEFO-Abbuchung 11 statt 7 und drueckte den Handlager-Bestand ins Negative.

Die vier Funktionen bleiben, auch wenn die Leseseite ab T44 auf SQL-Aggregate
wechselt: SIE SIND DIE SPEZIFIKATION, gegen die jedes Aggregat einen
Differenztest schuldet (§5.2.4).

Die Mutationsprobe (Lagerort-Praedikat entfernen -> rot) ist einmal gefahren."
```

---

### Task 30: `_lib/domain/fefo.ts` — der Tiebreaker, der aus einer DB-Laune eine Aussage macht

**Files:**
- Create: `src/app/m/lagerbuch/_lib/domain/fefo.ts`
- Test: `src/app/m/lagerbuch/_lib/domain/fefo.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export type ChargeRest = { chargeId: string; verfall: string; rest: number; createdAt: Date };
  export type FefoTeil = { chargeId: string; menge: number };
  export function fefoVerteilung(chargen: ChargeRest[], menge: number): FefoTeil[];
  ```
  Konsumenten: `_lib/schreibpfade/abbuchung.ts` (T54), `_db/fefo.test.ts` (T54).

**Die eine Änderung gegenüber dem Bestand — und sie ist die Zusage, um die es geht** (§5.3.1).
`lagerbuch/src/lib/domain/fefo.ts:10` sortiert **nur** nach `verfall`. Bei gleichem Verfall
entscheidet die Rückgabereihenfolge der Datenbank, und **die ist kein Vertrag**. Zusammen mit dem
fehlenden Unique-Index auf `(artikelId, chargenNr, verfall)` heißt das: dieselbe Chargennummer
zweimal erfasst spaltet den Bestand in zwei Töpfe mit identischem Verfall, und welcher zuerst
verbraucht wird, ist **unbestimmt**.

```
.sort((a, b) => a.verfall.localeCompare(b.verfall)
             || a.createdAt.getTime() - b.createdAt.getTime()
             || a.chargeId.localeCompare(b.chargeId));
```

`ChargeRest` trägt dafür zusätzlich `createdAt` — **die Spalte existiert** (`schema.ts:62`), sie wird
heute nur nicht durchgereicht. Kosten: ein Feld mehr in einem Objektliteral. Nutzen: „gleicher
Verfall, ältere Charge zuerst" ist eine **fachliche** Aussage; „was die Datenbank gerade zurückgibt"
ist keine.

⚠️ **Damit fällt der Unique-Index als Mittel weg, und das ist ausdrücklich entschieden** (§4.8,
§5.3.1): er setzte eine Annahme über Produktionsdaten voraus, die im Repo nicht belegbar ist, und er
verböte einen realen Vorgang — zwei Lieferungen mit derselben aufgedruckten Chargennummer.

⚠️ **Der dritte Tiebreaker `chargeId` ist nicht Zierde.** `createdAt` sind UNIX-**Sekunden**; ein
CSV-Import legt Dutzende Chargen in derselben Sekunde an. Ohne die dritte Stufe wäre die Ordnung
dort wieder unbestimmt — genau der Fall, den `_db/fefo.test.ts` (T54) gegen eine echte Verbindung
fährt.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/domain/fefo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fefoVerteilung, type ChargeRest } from "./fefo";

const T0 = new Date("2026-01-01T00:00:00Z");
const tage = (n: number) => new Date(T0.getTime() + n * 86_400_000);

describe("fefoVerteilung — aufsteigender Verfall", () => {
  it("raeumt die frueher ablaufende Charge zuerst ab", () => {
    const chargen: ChargeRest[] = [
      { chargeId: "spaet", verfall: "2027-06", rest: 10, createdAt: T0 },
      { chargeId: "frueh", verfall: "2026-03", rest: 4, createdAt: T0 },
    ];
    expect(fefoVerteilung(chargen, 6)).toEqual([
      { chargeId: "frueh", menge: 4 },
      { chargeId: "spaet", menge: 2 },
    ]);
  });

  it("ueberspringt Chargen mit rest <= 0", () => {
    const chargen: ChargeRest[] = [
      { chargeId: "leer", verfall: "2026-01", rest: 0, createdAt: T0 },
      { chargeId: "negativ", verfall: "2026-02", rest: -3, createdAt: T0 },
      { chargeId: "voll", verfall: "2026-03", rest: 5, createdAt: T0 },
    ];
    expect(fefoVerteilung(chargen, 2)).toEqual([{ chargeId: "voll", menge: 2 }]);
  });
});

describe("fefoVerteilung — die Kappung ist Invariante I2", () => {
  it("liefert eine KUERZERE Verteilung, wenn der Bestand nicht reicht", () => {
    // Der Aufrufer meldet die tatsaechlich gebuchte Menge (`buchung.ts:74`, `:92`).
    // Ohne die Kappung entstuende eine Buchung, die den Lagerortbestand unter 0
    // drueckt — und `buchungen` kennt kein UPDATE und kein DELETE (I1).
    const chargen: ChargeRest[] = [{ chargeId: "a", verfall: "2026-03", rest: 3, createdAt: T0 }];
    const teile = fefoVerteilung(chargen, 10);
    expect(teile).toEqual([{ chargeId: "a", menge: 3 }]);
    expect(teile.reduce((s, t) => s + t.menge, 0)).toBe(3);
  });

  it("klemmt eine negative Menge auf 0 und liefert eine LEERE Verteilung", () => {
    const chargen: ChargeRest[] = [{ chargeId: "a", verfall: "2026-03", rest: 5, createdAt: T0 }];
    expect(fefoVerteilung(chargen, -7)).toEqual([]);
    expect(fefoVerteilung(chargen, 0)).toEqual([]);
  });

  it("liefert bei leerer Chargenliste eine leere Verteilung", () => {
    expect(fefoVerteilung([], 5)).toEqual([]);
  });
});

describe("fefoVerteilung — DETERMINISMUS (§5.3.1, die neue Zusage)", () => {
  it("gleicher Verfall -> AELTERE createdAt zuerst", () => {
    const chargen: ChargeRest[] = [
      { chargeId: "neu", verfall: "2026-03", rest: 5, createdAt: tage(10) },
      { chargeId: "alt", verfall: "2026-03", rest: 5, createdAt: tage(1) },
    ];
    expect(fefoVerteilung(chargen, 7)).toEqual([
      { chargeId: "alt", menge: 5 },
      { chargeId: "neu", menge: 2 },
    ]);
  });

  it("gleicher Verfall UND gleiche createdAt -> chargeId entscheidet", () => {
    /**
     * DER DRITTE TIEBREAKER IST NICHT ZIERDE. `createdAt` sind UNIX-SEKUNDEN; ein
     * CSV-Import legt Dutzende Chargen in DERSELBEN Sekunde an. Ohne diese Stufe
     * waere die Ordnung dort wieder unbestimmt — dieselbe Klasse wie die
     * Journalsortierung ohne id-Tiebreaker (§5.14.4).
     */
    const chargen: ChargeRest[] = [
      { chargeId: "bbb", verfall: "2026-03", rest: 2, createdAt: T0 },
      { chargeId: "aaa", verfall: "2026-03", rest: 2, createdAt: T0 },
    ];
    expect(fefoVerteilung(chargen, 3)).toEqual([
      { chargeId: "aaa", menge: 2 },
      { chargeId: "bbb", menge: 1 },
    ]);
  });

  it("die Eingabeliste wird NICHT verandert (kein In-Place-Sort)", () => {
    // `[...chargen]` statt `chargen.sort()`. Der Aufrufer haelt dieselbe Liste
    // fuer die Chargen-Anzeige; ein In-Place-Sort aenderte sie unter ihm weg.
    const chargen: ChargeRest[] = [
      { chargeId: "b", verfall: "2027-01", rest: 1, createdAt: T0 },
      { chargeId: "a", verfall: "2026-01", rest: 1, createdAt: T0 },
    ];
    fefoVerteilung(chargen, 2);
    expect(chargen.map((c) => c.chargeId)).toEqual(["b", "a"]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/fefo.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./fefo"`.

- [ ] **Schritt 3: `_lib/domain/fefo.ts` schreiben**

```ts
/**
 * FEFO — first expired, first out. Kein "use client", kein Datenbankzugriff.
 */

/**
 * ⚠️ `createdAt` IST NEU GEGENUEBER DEM BESTAND und der ganze Grund dieser Datei.
 * Die Spalte existiert seit jeher (`schema.ts:62`), sie wurde nur nicht
 * durchgereicht. Wer sie beim Bauen des Objektliterals „spart", nimmt den
 * Determinismus aus §5.3.1 wieder heraus — und der Verlust ist still: die
 * Verteilung bleibt korrekt, nur die REIHENFOLGE ist wieder eine Laune der
 * Datenbank.
 */
export type ChargeRest = {
  chargeId: string;
  /** "YYYY-MM" */
  verfall: string;
  /** Rest AN EINEM Lagerort (`bestandProLagerortUndCharge`), nie global. */
  rest: number;
  createdAt: Date;
};

export type FefoTeil = { chargeId: string; menge: number };

/**
 * Verteilt `menge` ueber die Chargen mit Rest > 0, frueheste Faelligkeit zuerst.
 *
 * DREISTUFIGE SORTIERUNG (§5.3.1):
 *   1. `verfall`     — FEFO selbst.
 *   2. `createdAt`   — gleicher Verfall ⇒ AELTERE Charge zuerst. Das ist eine
 *                      fachliche Aussage; „was die Datenbank gerade zurueckgibt"
 *                      ist keine.
 *   3. `chargeId`    — `createdAt` sind UNIX-SEKUNDEN, ein CSV-Import legt
 *                      Dutzende Chargen in derselben Sekunde an.
 *
 * ⚠️ EIN UNIQUE-INDEX AUF (artikelId, chargenNr, verfall) IST AUSDRUECKLICH KEIN
 * ERSATZ und wird nicht eingefuehrt (§4.8): er setzte eine Annahme ueber
 * Produktionsdaten voraus, die im Repo nicht belegbar ist, und er verboete einen
 * realen Vorgang — zwei Lieferungen mit derselben aufgedruckten Chargennummer.
 *
 * DIE KAPPUNG IST INVARIANTE I2: reicht der Bestand nicht, ist die Rueckgabe
 * KUERZER als angefordert, und der Aufrufer meldet die tatsaechlich gebuchte
 * Menge. Ohne sie entstuende eine Buchung, die den Lagerortbestand unter 0
 * drueckt — in ein Journal, das kein UPDATE und kein DELETE kennt (I1).
 */
export function fefoVerteilung(chargen: ChargeRest[], menge: number): FefoTeil[] {
  let rest = Math.max(0, menge);
  const sortiert = [...chargen]   // KEIN In-Place-Sort: der Aufrufer haelt dieselbe Liste
    .filter((c) => c.rest > 0)
    .sort(
      (a, b) =>
        a.verfall.localeCompare(b.verfall) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.chargeId.localeCompare(b.chargeId),
    );
  const teile: FefoTeil[] = [];
  for (const c of sortiert) {
    if (rest <= 0) break;
    const nimm = Math.min(c.rest, rest);
    rest -= nimm;
    teile.push({ chargeId: c.chargeId, menge: nimm });
  }
  return teile;
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/fefo.test.ts
```

- [ ] **Schritt 5: Die Mutationsprobe (§5.19.3, Zeile 1)**

Entferne die zweite und dritte Sortierstufe, sodass nur `a.verfall.localeCompare(b.verfall)` bleibt,
und fahre den Test erneut. Erwartet: **rot** in „gleicher Verfall -> AELTERE createdAt zuerst".
Danach wiederherstellen.

⚠️ **Dieser Unit-Test allein trägt die Zusage NICHT.** Er sortiert ein JS-Array, dessen
Ausgangsreihenfolge der Test selbst setzt. Ob die Ordnung auch dann gilt, wenn die Zeilen aus einer
**echten** Verbindung kommen, prüft `_db/fefo.test.ts` (T54) — dort ist die Ausgangsreihenfolge
genau das, was heute entscheidet.

- [ ] **Schritt 6: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/domain/fefo.ts src/app/m/lagerbuch/_lib/domain/fefo.test.ts
git commit -m "feat(lagerbuch): _lib/domain/fefo.ts — dreistufige Sortierung, deterministisch

verfall -> createdAt -> chargeId (§5.3.1). Der Bestand sortiert nur nach verfall;
bei gleichem Verfall entscheidet heute die Rueckgabereihenfolge der Datenbank,
und die ist kein Vertrag. ChargeRest traegt dafuer createdAt — die Spalte gibt es
seit jeher, sie wurde nur nicht durchgereicht.

Der dritte Tiebreaker ist nicht Zierde: createdAt sind UNIX-Sekunden, ein
CSV-Import legt Dutzende Chargen in derselben Sekunde an.

Ein Unique-Index auf (artikelId, chargenNr, verfall) wird ausdruecklich NICHT
eingefuehrt (§4.8) — er verboete zwei Lieferungen mit derselben aufgedruckten
Chargennummer.

Mutationsprobe (Zweitsortierung entfernen -> rot) gefahren."
```

---

### Task 31: `_lib/domain/vorschlag.ts` — die Lückenformel, und `BESTELL_FAKTOR` ist weg

**Files:**
- Create: `src/app/m/lagerbuch/_lib/domain/vorschlag.ts`
- Test: `src/app/m/lagerbuch/_lib/domain/vorschlag.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export function braucht(bestand: number, mindestbestand: number): boolean;
  export function vorschlagsmenge(bestand: number, mindestbestand: number): number;
  ```
  Konsumenten: `_lib/lesepfade/bestellung.ts` (T50), `_lib/lesepfade/bestand.ts` (T44, `kennzahlen`).

**Betreiber-Entscheidung 5, Analyse-Entscheidung 3, Variante (a)** (§5.4): `BESTELL_FAKTOR` wird
**ersatzlos gestrichen**, gerechnet wird ausschließlich die Lücke. Nachgeprüft: außerhalb der
Konfiguration gibt es genau **drei** Fundstellen, und **keine ist ein Produktivpfad** —
`actions/bestellung.test.ts:4` (Mock), `lib/config.test.ts:15` und `:23,27` (Parse-Prüfung). Alle
drei werden mitgestrichen; in diesem Modul entsteht keine davon neu.

⚠️ **`braucht` ist STRIKT kleiner.** Bei Gleichstand (`bestand === mindestbestand`) ist der Artikel
**nicht** in der Liste, und `vorschlagsmenge` wäre ohnehin 0. Wer `<=` schreibt, füllt die
Bestellliste mit Zeilen, die „bestelle 0 Stück" sagen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/domain/vorschlag.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { braucht, vorschlagsmenge } from "./vorschlag";

describe("braucht — STRIKT kleiner", () => {
  it("ist wahr, wenn der Bestand unter dem Mindestbestand liegt", () => {
    expect(braucht(3, 5)).toBe(true);
    expect(braucht(0, 1)).toBe(true);
  });

  it("ist FALSCH bei Gleichstand", () => {
    // Mit `<=` fuellte sich die Bestellliste mit Zeilen, die „bestelle 0 Stueck"
    // sagen — die Vorschlagsmenge waere dort ohnehin 0.
    expect(braucht(5, 5)).toBe(false);
  });

  it("ist falsch bei Ueberdeckung", () => {
    expect(braucht(9, 5)).toBe(false);
  });

  it("behandelt einen Mindestbestand von 0 richtig", () => {
    // Der haeufigste Fall im Bestand: Artikel ohne gepflegten Mindestbestand
    // (Vorgabe 0, `schema.ts:50`) tauchen NIE im Bestellvorschlag auf.
    expect(braucht(0, 0)).toBe(false);
    expect(braucht(-2, 0)).toBe(true);   // theoretisch; I2 schliesst es aus
  });
});

describe("vorschlagsmenge — die Luecke, kein Faktor", () => {
  it("ist die Differenz bis zum Mindestbestand", () => {
    expect(vorschlagsmenge(3, 5)).toBe(2);
    expect(vorschlagsmenge(0, 12)).toBe(12);
  });

  it("ist NIE negativ", () => {
    expect(vorschlagsmenge(9, 5)).toBe(0);
    expect(vorschlagsmenge(5, 5)).toBe(0);
  });

  it("ist fuer jede Zeile der Bestellliste >= 1", () => {
    // Die Kopplung zwischen den beiden Funktionen: die Liste enthaelt genau die
    // aktiven Artikel, fuer die `braucht` wahr ist (`queries.ts:516`, `:522`).
    for (const [b, m] of [[0, 1], [3, 5], [11, 12]] as const) {
      expect(braucht(b, m)).toBe(true);
      expect(vorschlagsmenge(b, m)).toBeGreaterThanOrEqual(1);
    }
  });

  it("kennt KEINEN Faktor und KEINEN Puffer", () => {
    // BESTELL_FAKTOR ist ersatzlos gestrichen (Betreiber-Entscheidung 5, §10.2).
    // Diese Zeile ist die Zusage dagegen: 5 − 3 = 2, nicht 2 · irgendwas.
    expect(vorschlagsmenge(3, 5)).toBe(2);
    expect(vorschlagsmenge(0, 10)).toBe(10);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/vorschlag.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./vorschlag"`.

- [ ] **Schritt 3: `_lib/domain/vorschlag.ts` schreiben**

```ts
/**
 * Bestellvorschlag — die Lueckenformel. Kein "use client", kein Datenbankzugriff.
 *
 * `bestand` ist IMMER der HANDLAGER-Bestand (`queries.ts:519`, §5.2.1): der
 * Mindestbestand ist eine Nachschubschwelle fuers Zentrallager, kein Fahrzeugsoll.
 * Wer hier den lagerort-uebergreifenden Bestand einsetzt, bestellt nichts nach,
 * solange genug in den Fahrzeugen liegt — und das ist genau das Gegenteil des
 * Zwecks.
 */

/**
 * STRIKT kleiner. Bei Gleichstand ist der Artikel NICHT in der Bestellliste, und
 * `vorschlagsmenge` waere ohnehin 0.
 */
export function braucht(bestand: number, mindestbestand: number): boolean {
  return bestand < mindestbestand;
}

/**
 * Nachbestellen heisst schlicht: bis zum Mindestbestand auffuellen. KEIN Faktor,
 * KEIN Puffer — `BESTELL_FAKTOR` ist ersatzlos gestrichen (Betreiber-Entscheidung
 * 5, §5.4, §10.2). Nachgeprueft: die drei Fundstellen im Bestand sind ein Mock und
 * zwei Parse-Pruefungen, kein Produktivpfad.
 *
 * Nie negativ.
 */
export function vorschlagsmenge(bestand: number, mindestbestand: number): number {
  return Math.max(0, mindestbestand - bestand);
}
```

- [ ] **Schritt 4: Test grün, Gates und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/vorschlag.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/domain/vorschlag.ts src/app/m/lagerbuch/_lib/domain/vorschlag.test.ts
git commit -m "feat(lagerbuch): _lib/domain/vorschlag.ts — Lueckenformel, BESTELL_FAKTOR gestrichen

braucht ist STRIKT kleiner (Gleichstand -> nicht in der Liste), vorschlagsmenge
ist max(0, mindestbestand − bestand). Betreiber-Entscheidung 5, Variante (a):
BESTELL_FAKTOR entfaellt ersatzlos, samt seinen drei Teststellen — keine davon
war ein Produktivpfad.

bestand ist immer der HANDLAGER-Bestand (§5.2.1): der Mindestbestand ist eine
Nachschubschwelle fuers Zentrallager, kein Fahrzeugsoll."
```

---

### Task 32: `_lib/grenzen.ts` — die Boot-Liste und die drei reinen Deckel (ERWEITERUNG)

**Files:**
- **Modify:** `src/app/m/lagerbuch/_lib/grenzen.ts` (angelegt in **Teil 2, T15**)
- **Modify (Test):** `src/app/m/lagerbuch/_lib/grenzen.test.ts` (angelegt in **Teil 2, T15**)

⚠️ **`Edit`, niemals `Write`.** Ein `Write` löschte die vollständige `ZAHLEN`-Tabelle und machte
`_lib/gateSchranke.ts` und `_lib/helferSitzung.ts` unübersetzbar. Beide Dateien stehen in §3
ausdrücklich als **(Erweiterung)**.

**Interfaces:**
- Consumes: die vorhandene `ZAHLEN`-Konstante, `GANZZAHL`, `GrenzenUngueltig` und `ZAHL_NAMEN` aus
  derselben Datei; aus `core`: `getModule`, `prodHostsFor` (`@/core/registry`).
- Produces (**zusätzlich** zu T15s Exporten, die unverändert bleiben):
  ```ts
  export const JOURNAL_GRENZE: 100;
  export const CHECK_GRENZE: 50;
  export const BZ_LOGBUCH_GRENZE: 100;
  export function grenzenFehler(env?: Record<string, string | undefined>): string[];
  ```
  Konsumenten: `_lib/boot.ts` (T38, **einziger** Aufrufer von `grenzenFehler`),
  `_lib/lesepfade/journal.ts` (T46, `JOURNAL_GRENZE`), `checks.ts` (T49, `CHECK_GRENZE`),
  `bz.ts` (T51, `BZ_LOGBUCH_GRENZE`) — und ab Teil 5 die drei Seitentexte, die denselben Wert lesen.

**Warum die drei Deckel KONSTANTEN sind und keine Env-Variablen** (§10.3, §5.14.3). Sie sind heute
Vorgabewerte, die **kein Aufrufer je überschreibt** (`queries.ts:87`, `:350`, `src/db/bz.ts:124`).
Sie zur Env-Variablen zu machen hieße, einen Regler anzubieten, der bei 5000 die Journalseite bei
realer Datenmenge stehen lässt — und `better-sqlite3` ist **synchron**, die Seite blockierte dabei
die **ganze** Suite (Falle 10).

⚠️ **Sie liegen in `grenzen.ts` und nicht neben ihrer Abfrage, weil zwei Leser denselben Wert
brauchen:** die Abfrage (`limit(JOURNAL_GRENZE + 1)`) und der Beschreibungstext („Neueste 100 von
mehr Treffern"). Heute stehen die 100 an **zwei** Stellen (`queries.ts:87` und
`journal/page.tsx:32`) und können auseinanderlaufen — und der Text ist **unbedingt**, er behauptet
die 100 auch, wenn drei Zeilen zurückkommen.

**Die vier Boot-Prüfungen dieser Datei** (§10.5, Prüfungen 1–4; die Prüfungen 5 und 6 liegen in
`_lib/boot.ts`, T38):

1. Jede Zahlvariable ist **ganzzahlig und im Bereich** — gelesen mit dem vorhandenen
   `/^[+-]?\d+$/`, **nicht** mit `Number()`.
2. `LAGERBUCH_VERFALL_ROT_TAGE ≤ LAGERBUCH_VERFALL_GELB_TAGE`.
3. `…GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN ≤ …GATE_FEHLVERSUCHE_GESAMT_PRO_MIN ≤ …GESAMT_PRO_STUNDE`.
4. `LAGERBUCH_HELFER_SITZUNG_SECRET` ist gesetzt, nicht leer, **mindestens 32 Zeichen**, nicht
   `dev-insecure-secret-change-me` und **nicht identisch mit `AUTH_SECRET`**.

⚠️ **`grenzenFehler` SAMMELT, es wirft nicht.** Prüfung 1 muss die `GrenzenUngueltig`-Würfe von
`grenzen()` **abfangen** und in Zeichenketten verwandeln — sonst meldete der Boot den **ersten**
Fehler statt aller, und der Betreiber fährt drei Deploys für drei Tippfehler.

⚠️ **Die Bedingung ist `prodHostsFor(getModule("lagerbuch"), env).length > 0`, nie `mod.prodHosts`.**
Der Registry-Eintrag trägt `prodHosts: []`; der Feldzugriff machte `SUITE_HOST_LAGERBUCH` an genau
dieser Stelle wirkungslos, und **alle vier Prüfungen liefen nie**.

- [ ] **Schritt 1: Die Testergänzung schreiben — ANHÄNGEN, nichts löschen**

An `src/app/m/lagerbuch/_lib/grenzen.test.ts` **anfügen** (die vorhandene `ERWARTET`-Tabelle, `LEER`
und alle `describe`-Blöcke aus T15 bleiben unverändert stehen). Die Importzeile wird erweitert:

```ts
// Vorhandene Zeile ersetzen durch:
import {
  grenzen, ZAHL_NAMEN, GrenzenUngueltig, helferSitzungGeheimnis,
  grenzenFehler, JOURNAL_GRENZE, CHECK_GRENZE, BZ_LOGBUCH_GRENZE,
} from "./grenzen";
```

Danach anhängen:

```ts
/**
 * DIE UNABHAENGIGE TABELLE DER DREI REINEN DECKEL (§10.8, Eigenschaft 2).
 *
 * Auch hier gilt: die Werte stehen ausgeschrieben und werden NICHT aus dem Modul
 * abgeleitet. Ein Test wie `expect(JOURNAL_GRENZE).toBe(JOURNAL_GRENZE)` waere
 * kein Test; ein Test, der die Zahl aus einer exportierten Tabelle zieht, ist
 * derselbe Fehler eine Ebene tiefer.
 */
const DECKEL = [
  { name: "JOURNAL_GRENZE", wert: JOURNAL_GRENZE, erwartet: 100 },
  { name: "CHECK_GRENZE", wert: CHECK_GRENZE, erwartet: 50 },
  { name: "BZ_LOGBUCH_GRENZE", wert: BZ_LOGBUCH_GRENZE, erwartet: 100 },
] as const;

/** Eine Umgebung, unter der das Modul ERREICHBAR ist — sonst ist die Fehlerliste
 *  konstruktionsgemaess leer (§10.5, die Bedingtheit). */
const ERREICHBAR: Record<string, string | undefined> = {
  SUITE_HOST_LAGERBUCH: "lagerbuch.example.test",
  LAGERBUCH_HELFER_SITZUNG_SECRET: "ein-hinreichend-langes-geheimnis-32z",
  AUTH_SECRET: "ein-anderes-suite-geheimnis",
};

describe("die drei reinen Deckel (§5.14.3, §10.3)", () => {
  it("tragen genau die Werte aus der Spec", () => {
    for (const d of DECKEL) expect(d.wert).toBe(d.erwartet);
  });

  it("stehen NICHT in ZAHL_NAMEN — sie sind Konstanten, keine Env-Variablen", () => {
    /**
     * §10.3: sie zur Env-Variablen zu machen hiesse, einen Regler anzubieten, der
     * bei 5000 die Journalseite bei realer Datenmenge stehen laesst — und
     * `better-sqlite3` ist SYNCHRON, die Seite blockierte dabei die GANZE Suite
     * (Falle 10).
     */
    for (const d of DECKEL) expect(ZAHL_NAMEN).not.toContain(d.name);
  });

  it("werden von keiner Umgebungsvariable beeinflusst", () => {
    // Der Fall, den jemand aus gutem Willen baut: „ich mache es doch nur
    // ueberschreibbar". Diese Zeile ist die Zusage dagegen.
    expect(grenzen({ JOURNAL_GRENZE: "5000" })).toBeTruthy();
    expect(JOURNAL_GRENZE).toBe(100);
  });
});

describe("grenzenFehler — die Bedingtheit ist eine Notwendigkeit", () => {
  it("liefert OHNE Prod-Host eine LEERE Liste, auch wenn ALLES fehlt", () => {
    /**
     * §10.5: `assertHostConfig()` laeuft fuer die GANZE Suite. Eine unbedingte
     * Pflicht hiesse: sobald ein Image mit lagerbuch auf dem Server landet,
     * startet die Suite nicht mehr — portal, qr, feedback und files inklusive —,
     * bis der Betreiber die .env ergaenzt hat. Damit blockierte dieses Modul jeden
     * unbeteiligten Deploy im Fenster zwischen Merge und Cutover.
     */
    expect(grenzenFehler({})).toEqual([]);
    expect(grenzenFehler({ LAGERBUCH_VERFALL_ROT_TAGE: "9999999" })).toEqual([]);
  });

  it("liefert MIT Prod-Host und vollstaendiger Umgebung eine leere Liste", () => {
    expect(grenzenFehler(ERREICHBAR)).toEqual([]);
  });

  it("liest den Host ueber prodHostsFor, nicht ueber mod.prodHosts", () => {
    // Der Registry-Eintrag traegt prodHosts: []. Waere die Bedingung ein
    // Feldzugriff, waere SUITE_HOST_LAGERBUCH an dieser Stelle WIRKUNGSLOS und
    // alle vier Pruefungen liefen nie — zeichengleich die Falle, die Teil 2 fuer
    // adminGroupsFor(mod) gegen mod.adminGroups benannt hat.
    expect(grenzenFehler({ ...ERREICHBAR, LAGERBUCH_HELFER_SITZUNG_SECRET: "" }).length)
      .toBeGreaterThan(0);
  });
});

describe("grenzenFehler — Pruefung 1: ganzzahlig und im Bereich", () => {
  it("SAMMELT alle Fehler, statt beim ersten zu werfen", () => {
    /**
     * ⚠️ DIE STELLE, AN DER EIN NAIVER PORT FALSCH WIRD. `grenzen()` WIRFT bei
     * einem kaputten Wert (GrenzenUngueltig). `grenzenFehler` muss den Wurf
     * ABFANGEN und in eine Zeichenkette verwandeln — sonst meldet der Boot den
     * ERSTEN Fehler statt aller, und der Betreiber faehrt drei Deploys fuer drei
     * Tippfehler.
     */
    const fehler = grenzenFehler({
      ...ERREICHBAR,
      LAGERBUCH_VERFALL_ROT_TAGE: "fuenf",
      LAGERBUCH_HELFER_SITZUNG_SECRET: "kurz",
    });
    expect(fehler.length).toBeGreaterThanOrEqual(2);
    expect(fehler.join("\n")).toContain("LAGERBUCH_VERFALL_ROT_TAGE");
    expect(fehler.join("\n")).toContain("LAGERBUCH_HELFER_SITZUNG_SECRET");
  });

  it("weist 0x10 und 1e7 ab, statt sie als 16 bzw. 10000000 zu lesen", () => {
    for (const roh of ["0x10", "1e7", "31.5", " "]) {
      const f = grenzenFehler({ ...ERREICHBAR, LAGERBUCH_VERFALL_ROT_TAGE: roh });
      if (roh === " ") {
        // LEER GESETZT GILT WIE NICHT GESETZT — das ist kein Fehler.
        expect(f).toEqual([]);
      } else {
        expect(f.join("\n")).toContain("LAGERBUCH_VERFALL_ROT_TAGE");
      }
    }
  });
});

describe("grenzenFehler — Pruefung 2: ROT <= GELB", () => {
  it("lehnt ROT > GELB ab und NENNT die Folge", () => {
    // §10.5, Pruefung 2: die Meldung nennt beide Namen, beide Werte und die Folge.
    // „Wert ungueltig" ohne Namen ist eine Meldung, die eine Suche ausloest statt
    // sie zu beenden.
    const f = grenzenFehler({
      ...ERREICHBAR, LAGERBUCH_VERFALL_ROT_TAGE: "90", LAGERBUCH_VERFALL_GELB_TAGE: "56",
    });
    const text = f.join("\n");
    expect(text).toContain("LAGERBUCH_VERFALL_ROT_TAGE");
    expect(text).toContain("LAGERBUCH_VERFALL_GELB_TAGE");
    expect(text).toContain("90");
    expect(text).toContain("56");
    expect(text).toContain("Gelb-Zweig");
  });

  it("ERLAUBT ROT === GELB", () => {
    // Die Kopplung ist `<=`, nicht `<`. Bei Gleichstand hat die Ampel zwei
    // Zustaende, aber der Betreiber hat das dann GEWOLLT — es ist kein Tippfehler
    // in der Rangfolge.
    expect(grenzenFehler({
      ...ERREICHBAR, LAGERBUCH_VERFALL_ROT_TAGE: "40", LAGERBUCH_VERFALL_GELB_TAGE: "40",
    })).toEqual([]);
  });
});

describe("grenzenFehler — Pruefung 3: die Gate-Kette, in BEIDE Richtungen", () => {
  it("lehnt ABSENDER > GESAMT_PRO_MIN ab", () => {
    // Bricht die erste Ungleichung, fuellt ein einzelner Absender die
    // Gesamtbremse, bevor sein eigener Eimer leer ist — die Reihenfolge der
    // Bremsen waere umgekehrt zur Absicht.
    const f = grenzenFehler({
      ...ERREICHBAR,
      LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "40",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "30",
    });
    expect(f.join("\n")).toContain("LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN");
  });

  it("lehnt GESAMT_PRO_MIN > GESAMT_PRO_STUNDE ab", () => {
    // Bricht die zweite, ist der Stundendeckel wirkungslos.
    const f = grenzenFehler({
      ...ERREICHBAR,
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "600",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "300",
    });
    expect(f.join("\n")).toContain("LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE");
  });

  it("erlaubt Gleichstand an BEIDEN Gliedern der Kette", () => {
    expect(grenzenFehler({
      ...ERREICHBAR,
      LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "30",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "30",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "30",
    })).toEqual([]);
  });
});

describe("grenzenFehler — Pruefung 4: das Sitzungsgeheimnis, fuenf Bedingungen", () => {
  it("meldet ein FEHLENDES Geheimnis", () => {
    const { LAGERBUCH_HELFER_SITZUNG_SECRET: _weg, ...ohne } = ERREICHBAR;
    expect(grenzenFehler(ohne).join("\n")).toContain("LAGERBUCH_HELFER_SITZUNG_SECRET");
  });

  it("meldet ein LEER GESETZTES Geheimnis", () => {
    // `${LAGERBUCH_HELFER_SITZUNG_SECRET}` ohne `:?` setzt in Compose den LEEREN
    // String, und leer greift keinen Default. Ohne diese Zeile bootet der
    // Container gruen und faellt erst beim ersten /t/<code>-Scan mit 500 um — das
    // Scheitern waere von der Startzeit in die Nutzungszeit gewandert (Falle 23).
    for (const wert of ["", "   "]) {
      expect(grenzenFehler({ ...ERREICHBAR, LAGERBUCH_HELFER_SITZUNG_SECRET: wert }).join("\n"))
        .toContain("LAGERBUCH_HELFER_SITZUNG_SECRET");
    }
  });

  it("meldet ein ZU KURZES Geheimnis und nennt die Mindestlaenge", () => {
    const f = grenzenFehler({ ...ERREICHBAR, LAGERBUCH_HELFER_SITZUNG_SECRET: "x".repeat(31) });
    expect(f.join("\n")).toContain("32");
    expect(grenzenFehler({ ...ERREICHBAR, LAGERBUCH_HELFER_SITZUNG_SECRET: "x".repeat(32) }))
      .toEqual([]);
  });

  it("meldet den DEV-VORGABEWERT", () => {
    expect(grenzenFehler({
      ...ERREICHBAR, LAGERBUCH_HELFER_SITZUNG_SECRET: "dev-insecure-secret-change-me",
    }).join("\n")).toContain("dev-insecure-secret-change-me");
  });

  it("meldet GLEICHHEIT mit AUTH_SECRET", () => {
    /**
     * Die fuenfte Bedingung ist NEU gegenueber `assertProductionSecrets`
     * (`config.ts:104-113`) und kostet eine Zeile: dieselbe Signatur fuer
     * Suite-Sitzung und Helfer-Sitzung hebt die Domaenentrennung auf, die das
     * eigene Geheimnis ueberhaupt erst begruendet (§3.4.1).
     */
    const gleich = "dasselbe-geheimnis-fuer-beide-32-zeichen";
    const f = grenzenFehler({
      SUITE_HOST_LAGERBUCH: "lagerbuch.example.test",
      LAGERBUCH_HELFER_SITZUNG_SECRET: gleich,
      AUTH_SECRET: gleich,
    });
    expect(f.join("\n")).toContain("AUTH_SECRET");
  });

  it("meldet KEINE Gleichheit, wenn AUTH_SECRET gar nicht gesetzt ist", () => {
    // Sonst waere „beide fehlen" ein Gleichheitsfehler — eine Meldung, die in die
    // falsche Richtung zeigt. `AUTH_SECRET` ist Sache der Suite
    // (`compose.yaml:23` mit `${AUTH_SECRET:?…}`), nicht dieses Moduls.
    expect(grenzenFehler({
      SUITE_HOST_LAGERBUCH: "lagerbuch.example.test",
      LAGERBUCH_HELFER_SITZUNG_SECRET: "ein-hinreichend-langes-geheimnis-32z",
    })).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/grenzen.test.ts
```

Erwartet: FAIL beim Import — `grenzenFehler`, `JOURNAL_GRENZE`, `CHECK_GRENZE` und
`BZ_LOGBUCH_GRENZE` sind nicht exportiert. ⚠️ **Die vorhandenen Fälle aus T15 müssen dabei
weiterlaufen** — geht einer davon rot, ist die Erweiterung eine Ersetzung geworden.

- [ ] **Schritt 3: `_lib/grenzen.ts` erweitern — ANFÜGEN, nichts ersetzen**

Am Kopf der Datei die Importzeile ergänzen (die Datei hatte bisher **keinen** Import):

```ts
import { getModule, prodHostsFor } from "@/core/registry";
```

Am **Ende** der Datei anfügen:

```ts
/* ──────────────────────────────────────────────────────────────────────────
 * DIE DREI REINEN DECKEL (§5.14.3, §10.3) — Konstanten, keine Env-Variablen.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Sie stehen HIER und nicht neben ihrer Abfrage, weil ZWEI Leser denselben Wert
 * brauchen: die Abfrage (`limit(GRENZE + 1)`) und der Beschreibungstext („Neueste
 * 100 von mehr Treffern"). Heute stehen die 100 an zwei Stellen
 * (`queries.ts:87`, `journal/page.tsx:32`) und koennen auseinanderlaufen — und
 * der Text ist UNBEDINGT: er behauptet die 100 auch dann, wenn drei Zeilen
 * zurueckkommen.
 *
 * SIE WERDEN NICHT KONFIGURIERBAR (§10.3). Es sind heute Vorgabewerte, die KEIN
 * Aufrufer je ueberschreibt. Ein Regler daran bei 5000 liesse die Journalseite bei
 * realer Datenmenge stehen — und `better-sqlite3` ist SYNCHRON, die Seite
 * blockierte dabei die GANZE Suite: portal, qr, feedback und files antworten in
 * dieser Zeit nicht (Falle 10, §5.2.3).
 *
 * Gelesen wird `GRENZE + 1`, angezeigt `GRENZE`, und der Hinweis erscheint NUR,
 * wenn die Grenze tatsaechlich griff.
 */
export const JOURNAL_GRENZE = 100;
/** Dieselbe Regel — und der strengere Fall: die Checks-Seite nennt ihre 50 heute
 *  an KEINER Stelle (§5.14.3). */
export const CHECK_GRENZE = 50;
/** dito (`lagerbuch/src/db/bz.ts:124`). */
export const BZ_LOGBUCH_GRENZE = 100;

/* ──────────────────────────────────────────────────────────────────────────
 * DIE BOOT-LISTE (§10.5, Pruefungen 1 bis 4).
 * ────────────────────────────────────────────────────────────────────────── */

/** Der Wert, den die Alt-Anwendung als Entwicklungs-Vorbelegung fuehrte
 *  (`lagerbuch/src/lib/config.ts:104-113`). Er darf produktiv nie stehen. */
const DEV_GEHEIMNIS = "dev-insecure-secret-change-me";

/** §10.3: „≥ 32 Zeichen". Die Zahl steht hier EINMAL und in der Meldung. */
const GEHEIMNIS_MINDESTLAENGE = 32;

/**
 * Die Konfigurationsfehler dieses Moduls, als Liste statt als Wurf.
 *
 * ⚠️ SIE SAMMELT, SIE WIRFT NICHT. `grenzen()` WIRFT bei einem kaputten Wert; hier
 * wird der Wurf ABGEFANGEN und in eine Zeichenkette verwandelt. Sonst meldete der
 * Boot den ERSTEN Fehler statt aller, und der Betreiber faehrt drei Deploys fuer
 * drei Tippfehler. Der Aufrufer (`_lib/boot.ts` → `assertHostConfig`) entscheidet,
 * ob aus der Liste ein Abbruch wird.
 *
 * ⚠️ SIE GREIFT NUR, WENN DAS MODUL ERREICHBAR IST, und das ist keine Milderung,
 * sondern eine Notwendigkeit (§10.5): `assertHostConfig()` laeuft fuer die GANZE
 * Suite. Eine unbedingte Pflicht hiesse — sobald ein Image mit lagerbuch auf dem
 * Server landet, startet die Suite nicht mehr, portal, qr, feedback und files
 * inklusive. Der Schalter ist DIESELBE Variable, die das Modul einschaltet
 * (`SUITE_HOST_LAGERBUCH` ueber `prodHostsFor`); es gibt keinen zweiten, den
 * jemand vergessen kann.
 *
 * ⚠️ GELESEN WIRD UEBER `prodHostsFor(...)`, NIE UEBER `mod.prodHosts`. Der
 * Registry-Eintrag traegt `prodHosts: []`; der Feldzugriff machte
 * `SUITE_HOST_LAGERBUCH` an genau dieser Stelle wirkungslos, und alle vier
 * Pruefungen liefen nie. Dieselbe Falle wie `adminGroupsFor(mod)` gegen
 * `mod.adminGroups` (Teil 2, §2).
 *
 * ⚠️ DIESE DATEI HAELT DIE PRUEFUNGEN 5 UND 6 NICHT. `SUITE_ADMIN_GROUP_LAGERBUCH`
 * ist gesetzt (5) und `SUITE_ACCESS_GROUP_LAGERBUCH` ist NICHT gesetzt (6) sind
 * GRUPPEN-Fragen, keine Zahlen-Fragen; sie liegen in `_lib/boot.ts`, das diese
 * Liste einsammelt.
 */
export function grenzenFehler(env: EnvLike = process.env): string[] {
  if (prodHostsFor(getModule("lagerbuch"), env).length === 0) return [];
  const fehler: string[] = [];

  // Pruefung 1 — ganzzahlig und im Bereich. Jede Zahl EINZELN auswerten, damit
  // ein kaputter Wert die uebrigen nicht verdeckt.
  const werte: Partial<Record<ZahlName, number>> = {};
  for (const name of ZAHL_NAMEN) {
    try {
      werte[name] = zahl(name, env);
    } catch (e) {
      fehler.push(e instanceof GrenzenUngueltig ? e.message : String(e));
    }
  }

  // Pruefung 2 — ROT <= GELB. Nur, wenn BEIDE Werte gelesen werden konnten;
  // sonst waere die Meldung eine Folge des schon gemeldeten Fehlers.
  const rot = werte.LAGERBUCH_VERFALL_ROT_TAGE;
  const gelb = werte.LAGERBUCH_VERFALL_GELB_TAGE;
  if (rot !== undefined && gelb !== undefined && rot > gelb) {
    fehler.push(
      `LAGERBUCH_VERFALL_ROT_TAGE=${rot} ist groesser als LAGERBUCH_VERFALL_GELB_TAGE=${gelb}. ` +
        `Erlaubt ist ROT <= GELB — sonst ist der Gelb-Zweig unerreichbar und die Ampel hat ` +
        `zwei Zustaende statt drei ("kritisch" ist das KLEINERE Fenster, §10.1).`,
    );
  }

  // Pruefung 3 — die Gate-Kette. Bricht das erste Glied, fuellt ein einzelner
  // Absender die Gesamtbremse, bevor sein eigener Eimer leer ist; bricht das
  // zweite, ist der Stundendeckel wirkungslos.
  const absender = werte.LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN;
  const proMin = werte.LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN;
  const proStunde = werte.LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE;
  if (absender !== undefined && proMin !== undefined && absender > proMin) {
    fehler.push(
      `LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=${absender} ist groesser als ` +
        `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=${proMin}. Dann fuellt ein einzelner ` +
        `Absender die modulweite Bremse, bevor sein eigener Eimer leer ist — die Reihenfolge ` +
        `der Bremsen waere umgekehrt zur Absicht (§3.5.3).`,
    );
  }
  if (proMin !== undefined && proStunde !== undefined && proMin > proStunde) {
    fehler.push(
      `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=${proMin} ist groesser als ` +
        `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=${proStunde}. Dann ist der ` +
        `Stundendeckel wirkungslos — und er ist der tragende Zaehler (§3.5.3).`,
    );
  }

  // Pruefung 4 — das Sitzungsgeheimnis, fuenf Bedingungen. Die ersten vier sind
  // `assertProductionSecrets` (`config.ts:104-113`) an seinem neuen Ort; die
  // fuenfte ist neu und kostet eine Zeile.
  const geheim = env.LAGERBUCH_HELFER_SITZUNG_SECRET?.trim() ?? "";
  const authSecret = env.AUTH_SECRET?.trim() ?? "";
  if (geheim === "") {
    fehler.push(
      `LAGERBUCH_HELFER_SITZUNG_SECRET ist nicht gesetzt oder leer. jose verweigert einen ` +
        `Nullschluessel ("Zero-length key is not supported"); ohne diesen Riegel bootet der ` +
        `Container gruen und faellt erst beim ersten /t/<code>-Scan mit 500 um — das Scheitern ` +
        `waere von der Startzeit in die Nutzungszeit gewandert. Der Wert kommt beim Cutover ` +
        `1:1 aus der alten stack.env (HELFER_SESSION_SECRET), ueber env_file gesetzt.`,
    );
  } else {
    if (geheim.length < GEHEIMNIS_MINDESTLAENGE) {
      fehler.push(
        `LAGERBUCH_HELFER_SITZUNG_SECRET ist ${geheim.length} Zeichen lang, mindestens ` +
          `${GEHEIMNIS_MINDESTLAENGE} sind gefordert.`,
      );
    }
    if (geheim === DEV_GEHEIMNIS) {
      fehler.push(
        `LAGERBUCH_HELFER_SITZUNG_SECRET traegt den Entwicklungs-Vorgabewert ` +
          `"${DEV_GEHEIMNIS}". Er ist im Repo nachlesbar und damit kein Geheimnis.`,
      );
    }
    if (authSecret !== "" && geheim === authSecret) {
      fehler.push(
        `LAGERBUCH_HELFER_SITZUNG_SECRET ist identisch mit AUTH_SECRET. Damit gaebe es keine ` +
          `Domaenentrennung mehr zwischen Suite-Sitzung und Helfer-Sitzung — dieselbe Signatur ` +
          `truege zwei Bedeutungen (§3.4.1). AUTH_SECRET gehoert der Suite und bleibt ` +
          `unveraendert (§10.6, Abweichung 1).`,
      );
    }
  }

  return fehler;
}
```

⚠️ **`zahl(...)` und `ZahlName` sind modul-privat und bleiben es.** `grenzenFehler` steht in
**derselben** Datei und kann sie deshalb benutzen — das ist der Grund, warum die Boot-Liste hier
liegt und nicht in `_lib/boot.ts`. Zwei Dateien bräuchten einen Export der Tabelle, und §10.8,
Eigenschaft 2 verbietet genau den.

- [ ] **Schritt 4: Test grün — und die T15-Fälle prüfen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/grenzen.test.ts
```

Erwartet: **alle** Fälle grün, die alten wie die neuen. Notiere die Fallzahl; sie muss echt größer
sein als die aus Teil 2.

- [ ] **Schritt 5: Die Modulebene ohne Secrets, ein zweites Mal**

⚠️ **Die Erweiterung ist genau die Klasse, die §10.8, Eigenschaft 3 bricht, wenn jemand
`grenzenFehler()` auf Modulebene ruft.** Die Gegenprobe kostet nichts:

```bash
env -u LAGERBUCH_HELFER_SITZUNG_SECRET -u SUITE_HOST_LAGERBUCH \
  pnpm exec tsx -e 'import("./src/app/m/lagerbuch/_lib/grenzen.ts").then(m => {
    console.log("Deckel:", m.JOURNAL_GRENZE, m.CHECK_GRENZE, m.BZ_LOGBUCH_GRENZE);
    console.log("Fehlerliste ohne Prod-Host:", JSON.stringify(m.grenzenFehler()));
  })'
```

Erwartet: `Deckel: 100 50 100` und `Fehlerliste ohne Prod-Host: []` — **ohne** Wurf.

- [ ] **Schritt 6: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/grenzen.ts src/app/m/lagerbuch/_lib/grenzen.test.ts
git commit -m "feat(lagerbuch): grenzenFehler() und die drei reinen Deckel (Erweiterung von T15)

ERWEITERUNG der in Teil 2 angelegten Datei, keine zweite Zahlen-Tabelle
(Festlegung H1, Teil 2 G1): grenzen() und grenzenFehler() lesen aus DERSELBEN
ZAHLEN-Konstante, sonst pruefte der Boot etwas anderes als das, was zur Laufzeit
gilt (§10.8, Eigenschaft 1).

grenzenFehler SAMMELT und wirft nicht — grenzen() wirft, der Wurf wird hier
abgefangen. Sonst meldete der Boot den ersten Fehler statt aller.

Die Bedingung ist prodHostsFor(getModule('lagerbuch'), env).length > 0, NIE
mod.prodHosts: der Registry-Eintrag traegt prodHosts: [], der Feldzugriff machte
SUITE_HOST_LAGERBUCH wirkungslos und alle vier Pruefungen liefen nie.

JOURNAL_GRENZE/CHECK_GRENZE/BZ_LOGBUCH_GRENZE sind KONSTANTEN und stehen
ausdruecklich nicht in ZAHL_NAMEN (§10.3, Falle 10)."
```

---

### Task 33: `_lib/marke.ts` — drei Wörter, die kein Deploy anfassen darf

**Files:**
- Create: `src/app/m/lagerbuch/_lib/marke.ts`
- Test: `src/app/m/lagerbuch/_lib/marke.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export const LAGERBUCH_MARKE: "Lagerbuch";
  export const LAGERBUCH_ORGANISATION: "DRK Bereitschaft Musterstadt";
  export const LAGERBUCH_ZEILE: "Bestand, Fahrzeuge, Geräte";
  ```
  Konsumenten: die Gate-Seite (Teil 4, §7.2.4), die fünf PWA-Route-Handler (Teil 4, §7.10.2), das
  Etikettendruckstück (Teil 6, §8.4).

**Was hier passiert** (§10.2). Drei Alt-Env-Variablen entfallen und werden Konstanten: `APP_NAME`
(`config.ts:30`), `APP_ORG` (`:31`), `APP_TAGLINE` (`:32`). Der Modulname steht in
`core/registry.ts`; die Wortmarke ist **Gestaltung, keine Konfiguration**, und die Organisation ist
seit Bestehen unverändert — sie gehört nicht in eine Datei, die jeder Deploy anfassen kann.

⚠️ **Der Wert von `LAGERBUCH_ORGANISATION` ist eine benannte Annahme.** Im Repo steht er nur als
Dev-Vorbelegung: `lagerbuch/playwright.config.ts:31` setzt `APP_ORG: "DRK Bereitschaft
Musterstadt"`, die produktive `stack.env` ist gitignoriert. **A-T3-4:** Der Plan übernimmt die
Dev-Vorbelegung zeichengleich. **Der wahre Wert ist eine Runbook-Eingabe** — er steht auf jedem
gedruckten Etikett und auf dem Gate, und ein falscher Wert ist zwar folgenlos für den Betrieb, aber
sichtbar auf Papier. Die Korrektur ist danach ein Ein-Zeilen-Commit, kein Deploy-Schalter; genau das
ist der Zweck der Umstellung.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/marke.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LAGERBUCH_MARKE, LAGERBUCH_ORGANISATION, LAGERBUCH_ZEILE } from "./marke";

describe("marke — drei Konstanten, keine Env", () => {
  it("traegt die Werte aus §10.2", () => {
    expect(LAGERBUCH_MARKE).toBe("Lagerbuch");
    expect(LAGERBUCH_ORGANISATION).toBe("DRK Bereitschaft Musterstadt");
    expect(LAGERBUCH_ZEILE).toBe("Bestand, Fahrzeuge, Geräte");
  });

  it("liest KEINE Umgebungsvariable — der Quelltext nennt process.env nicht", () => {
    /**
     * Der Sinn der Umstellung waere dahin, wenn jemand „nur zur Sicherheit" ein
     * `process.env.APP_ORG ?? …` ergaenzte: dann gaebe es die Variable wieder, nur
     * undokumentiert. Ein Quelltext-Scan ist hier die richtige Ebene — ein
     * Wert-Test saehe den Rueckfall nicht, solange die Variable nicht gesetzt ist.
     */
    const quelle = readFileSync(
      join(process.cwd(), "src/app/m/lagerbuch/_lib/marke.ts"), "utf8",
    );
    expect(quelle).not.toContain("process.env");
  });

  it("traegt kein 'use client' — die Gate-Seite ist eine Server Component", () => {
    const quelle = readFileSync(
      join(process.cwd(), "src/app/m/lagerbuch/_lib/marke.ts"), "utf8",
    );
    expect(quelle).not.toContain('"use client"');
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/marke.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./marke"`.

- [ ] **Schritt 3: `_lib/marke.ts` schreiben**

```ts
/**
 * Die Wortmarke des Moduls — drei Alt-Env-Variablen, die zu Konstanten werden
 * (§10.2): APP_NAME, APP_ORG, APP_TAGLINE (`lagerbuch/src/lib/config.ts:30-32`).
 *
 * WARUM KEINE ENV. Der Modulname steht in `core/registry.ts`; die Wortmarke ist
 * Gestaltung, keine Konfiguration. Die Organisation ist seit Bestehen unveraendert
 * und gehoert nicht in eine Datei, die jeder Deploy anfassen kann — eine
 * Env-Variable dafuer ist ein Regler, an dem niemand drehen soll und den trotzdem
 * jeder Deploy neu setzen muss.
 *
 * KEIN "use client". Die Gate-Seite (§7.2.4) und die PWA-Route-Handler (§7.10.2)
 * sind Server-Code; ein Wert aus einem Client-Modul kaeme dort als Client-Referenz
 * an (Falle 6).
 *
 * KEIN ZUGRIFF AUF DIE PROZESSUMGEBUNG in dieser Datei — auch nicht als
 * Rueckfall. Ein `… ?? "…"` mit einer Umgebungsvariablen gaebe die Variable
 * wieder, nur undokumentiert. `_lib/marke.test.ts` scannt den Quelltext darauf.
 *
 * ⚠️ DESHALB STEHT DER GESUCHTE AUSDRUCK HIER NICHT AUSGESCHRIEBEN. Der Scan ist
 * ein schlichtes `toContain` ueber die ganze Datei, KOMMENTARE EINGESCHLOSSEN —
 * eine Kommentar-Ausnahme waere hier die falsche Loesung: die Datei ist zwoelf
 * Zeilen lang, und ein Scan ohne Sonderfaelle ist der, den niemand abschaltet.
 *
 * ⚠️ ANNAHME A-T3-4: `LAGERBUCH_ORGANISATION` steht im Repo nur als
 * Dev-Vorbelegung (`lagerbuch/playwright.config.ts:31`); die produktive stack.env
 * ist gitignoriert. Der wahre Wert ist eine RUNBOOK-EINGABE — er steht auf jedem
 * gedruckten Etikett und auf dem Gate. Die Korrektur ist danach ein
 * Ein-Zeilen-Commit, kein Deploy-Schalter; genau das ist der Zweck.
 */

/** Alt: APP_NAME. Erscheint in der Kopfzeile des Gates und im PWA-Manifest. */
export const LAGERBUCH_MARKE = "Lagerbuch";

/** Alt: APP_ORG. Erscheint am Gate und auf dem Etikettenbogen. ⚠️ A-T3-4. */
export const LAGERBUCH_ORGANISATION = "DRK Bereitschaft Musterstadt";

/** Alt: APP_TAGLINE. Die Unterzeile am Gate und die `description` des Manifests. */
export const LAGERBUCH_ZEILE = "Bestand, Fahrzeuge, Geräte";
```

- [ ] **Schritt 4: Test grün, Gates und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/marke.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/marke.ts src/app/m/lagerbuch/_lib/marke.test.ts
git commit -m "feat(lagerbuch): _lib/marke.ts — APP_NAME/APP_ORG/APP_TAGLINE werden Konstanten

§10.2: die Wortmarke ist Gestaltung, keine Konfiguration; die Organisation ist
seit Bestehen unveraendert. Eine Env-Variable dafuer ist ein Regler, an dem
niemand drehen soll und den trotzdem jeder Deploy neu setzen muss.

Ein Quelltext-Scan haelt fest, dass die Datei process.env NICHT nennt — sonst
ergaenzt jemand 'nur zur Sicherheit' einen Rueckfall und die Variable ist wieder
da, nur undokumentiert.

ANNAHME A-T3-4: LAGERBUCH_ORGANISATION steht im Repo nur als Dev-Vorbelegung; der
produktive Wert ist eine Runbook-Eingabe (er steht auf jedem gedruckten Etikett)."
```

---

### Gate — Ende Welle 1

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

Zusätzlich, einmalig nach dieser Stufe:

```bash
TZ=UTC pnpm vitest run src/app/m/lagerbuch/
```

Erwartet: grün. ⚠️ **Das ist die Probe, die §12.6, Punkt 1 überhaupt erst zulässt.** Wäre sie rot,
wäre der naheliegende Griff ein `env: { TZ }`-Block in `vitest.config.ts` — und der änderte die
Testsemantik der **vier laufenden Module**.

---

## Welle 2 — Die Ampel-Abkömmlinge, der Parser, der Boot-Haken (5 Tasks, alle parallel)

T34, T35 und T36 konsumieren den Typ `Ampel` aus T28 — deshalb liegen sie hier und nicht in Welle 1.
T38 konsumiert `grenzenFehler()` aus T32.

⚠️ **T38 ist der einzige Task dieses Plans mit ZWEI Commits und der einzige, der `core` anfasst.**
Er ist zugleich der Task ohne Kopplungsnetz: ohne den Haken existiert `_lib/boot.ts`, wird aber nie
gerufen, alle sechs Prüfungen laufen nie, und **nichts wird rot**.

---

### Task 34: `_lib/domain/o2.ts` — nicht auf 100 geklemmt, und `?? 200` ist verboten

**Files:**
- Create: `src/app/m/lagerbuch/_lib/domain/o2.ts`
- Test: `src/app/m/lagerbuch/_lib/domain/o2.test.ts`

**Interfaces:**
- Consumes: `_lib/domain/verfall.ts` (T28) — `type Ampel`.
- Produces:
  ```ts
  export const O2_AMPEL_ROT_PROZENT: 25;
  export const O2_AMPEL_GELB_PROZENT: 50;
  export type O2Status = { prozent: number; ampel: Ampel; niedrig: boolean };
  export function fuellstandProzent(druckBar: number, nennfuelldruckBar: number): number;
  export function o2Status(druckBar: number, nennfuelldruckBar: number): O2Status;
  ```
  Konsumenten: `_lib/lesepfade/o2.ts` (T52), `_lib/lesepfade/checks.ts` (T49),
  `_lib/domain/check.ts` (T40, `summiereCheckErgebnis`).

**Vier Eigenschaften, die 1:1 mitgehen** (§5.12):

1. **Nicht auf 100 geklemmt** — Überfüllung bleibt sichtbar. Ein `Progress`, der bei 100 deckelt,
   verliert diese Aussage (das ist eine Auflage an Teil 5, nicht an diese Datei).
2. **`nenn <= 0` → 0 %**, kein Fehler und keine Division durch null.
3. **Vorgabe-Nennfülldruck ist 200 bar** — aber als **Spaltendefault** (`schema.ts:242`), nicht als
   Rechenrückfall.
4. **Keine Messung → `status: null`**, nicht `0 %`. Die Oberfläche zeigt „keine Messung", nicht eine
   leere rote Ampel. ⚠️ Diese vierte Eigenschaft liegt bei den **Lesepfaden** (T52, T49) — `o2Status`
   selbst nimmt immer zwei Zahlen.

⚠️ **`?? 200` gibt es in diesem Modul NICHT** (§5.12, die Entscheidung). Für eine 300-bar-Flasche
skaliert der Rückfall den Füllstand **still falsch**: 150 bar erscheinen als **75 %** statt der
wahren **50 %**, und die Ampel springt von „gelb" auf „grün". Fehlt der Nennfülldruck in **allen**
verfügbaren Quellen, liefert die Zeile `nennfuelldruckBar: null`, `prozent: null`, `ampel: null` und
die Anzeige „Nennfülldruck unbekannt" — **keine** Prozentzahl und **keine** Ampel. Der Riegel dafür
liegt in T49 (`lesepfade/checks.ts`), nicht hier: `o2Status` bekommt gar nicht erst die Chance zu
raten, weil der Aufrufer sie nicht ruft.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/domain/o2.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fuellstandProzent, o2Status, O2_AMPEL_ROT_PROZENT, O2_AMPEL_GELB_PROZENT } from "./o2";

describe("fuellstandProzent", () => {
  it("rundet auf ganze Prozent", () => {
    expect(fuellstandProzent(150, 200)).toBe(75);
    expect(fuellstandProzent(100, 300)).toBe(33);   // 33,33 → 33
    expect(fuellstandProzent(200, 300)).toBe(67);   // 66,67 → 67
  });

  it("klemmt NICHT auf 100 — Ueberfuellung bleibt sichtbar", () => {
    // Ein `Progress`, der bei 100 deckelt, verliert diese Aussage (§5.12,
    // Eigenschaft 1). Das ist eine Auflage an die Darstellung (Teil 5), aber die
    // ZAHL entsteht hier.
    expect(fuellstandProzent(220, 200)).toBe(110);
  });

  it("liefert bei nenn <= 0 genau 0 — kein Fehler, keine Division durch null", () => {
    expect(fuellstandProzent(150, 0)).toBe(0);
    expect(fuellstandProzent(150, -50)).toBe(0);
  });

  it("liefert bei Druck 0 genau 0", () => {
    expect(fuellstandProzent(0, 200)).toBe(0);
  });
});

describe("o2Status — die zwei Schwellen an ihren KANTEN", () => {
  it("24 % ist rot, 25 % ist gelb", () => {
    // `< 25` → rot. Die Kante gehoert zu GELB, nicht zu rot.
    expect(o2Status(48, 200).prozent).toBe(24);
    expect(o2Status(48, 200).ampel).toBe("rot");
    expect(o2Status(50, 200).prozent).toBe(25);
    expect(o2Status(50, 200).ampel).toBe("gelb");
  });

  it("49 % ist gelb, 50 % ist gruen", () => {
    expect(o2Status(98, 200).prozent).toBe(49);
    expect(o2Status(98, 200).ampel).toBe("gelb");
    expect(o2Status(100, 200).prozent).toBe(50);
    expect(o2Status(100, 200).ampel).toBe("gruen");
  });

  it("die Schwellen stehen als benannte Konstanten und tragen ihre Einheit", () => {
    expect(O2_AMPEL_ROT_PROZENT).toBe(25);
    expect(O2_AMPEL_GELB_PROZENT).toBe(50);
  });
});

describe("o2Status — `niedrig` ist genau `ampel === 'rot'`", () => {
  it("ist wahr bei rot und falsch sonst", () => {
    expect(o2Status(40, 200).niedrig).toBe(true);
    expect(o2Status(60, 200).niedrig).toBe(false);
    expect(o2Status(150, 200).niedrig).toBe(false);
  });

  it("ist bei nenn <= 0 WAHR — 0 % ist rot", () => {
    // Der Grenzfall, den die Zaehler `flaschenAuffaellig` sehen: eine Flasche mit
    // Nennfuelldruck 0 im Stamm zaehlt als auffaellig. Das ist richtig — sie ist
    // fehlkonfiguriert und gehoert angesehen. Zu unterscheiden vom Fall
    // „Nennfuelldruck UNBEKANNT" (§5.12), der gar nicht erst hier ankommt.
    expect(o2Status(150, 0)).toEqual({ prozent: 0, ampel: "rot", niedrig: true });
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/o2.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./o2"`.

- [ ] **Schritt 3: `_lib/domain/o2.ts` schreiben**

```ts
/**
 * Sauerstoff — Fuellstand und Ampel. Kein "use client", kein Datenbankzugriff.
 */
import type { Ampel } from "./verfall";

/** Ampel-Schwellen fuer den Fuellstand in % vom Nennfuelldruck. Die Einheit steht
 *  im Namen (§10.1). Konstanten, keine Env — sie waren es nie. */
export const O2_AMPEL_ROT_PROZENT = 25;  // < 25 % → rot (niedrig, Warnung)
export const O2_AMPEL_GELB_PROZENT = 50; // < 50 % → gelb (mittel)

export type O2Status = { prozent: number; ampel: Ampel; niedrig: boolean };

/**
 * Fuellstand in Prozent, gerundet.
 *
 * NICHT auf 100 geklemmt (§5.12, Eigenschaft 1): Ueberfuellung bleibt sichtbar.
 * `nenn <= 0` liefert 0 % — kein Fehler und keine Division durch null.
 *
 * ⚠️ ES GIBT HIER KEINEN `?? 200`-RUECKFALL, und in diesem Modul gibt es ihn
 * nirgends (§5.12). Fuer eine 300-bar-Flasche skalierte er den Fuellstand STILL
 * FALSCH: 150 bar erschienen als 75 % statt der wahren 50 %, und die Ampel
 * spraenge von „gelb" auf „gruen". Fehlt der Nennfuelldruck in allen verfuegbaren
 * Quellen, liefert die ZEILE `null` und die Anzeige „Nennfuelldruck unbekannt";
 * die Funktion hier wird dann gar nicht erst gerufen. Der Riegel liegt in
 * `_lib/lesepfade/checks.ts` und `_lib/lesepfade/o2.ts`.
 */
export function fuellstandProzent(druckBar: number, nennfuelldruckBar: number): number {
  if (nennfuelldruckBar <= 0) return 0;
  return Math.round((druckBar / nennfuelldruckBar) * 100);
}

/** Prozent + Ampel + Warnkennzeichen. `niedrig` ist genau `ampel === "rot"`. */
export function o2Status(druckBar: number, nennfuelldruckBar: number): O2Status {
  const prozent = fuellstandProzent(druckBar, nennfuelldruckBar);
  let ampel: Ampel;
  if (prozent < O2_AMPEL_ROT_PROZENT) ampel = "rot";
  else if (prozent < O2_AMPEL_GELB_PROZENT) ampel = "gelb";
  else ampel = "gruen";
  return { prozent, ampel, niedrig: ampel === "rot" };
}
```

- [ ] **Schritt 4: Test grün, Gates und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/o2.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/domain/o2.ts src/app/m/lagerbuch/_lib/domain/o2.test.ts
git commit -m "feat(lagerbuch): _lib/domain/o2.ts — Fuellstand ohne Deckel, Ampel an den Kanten

1:1 aus lagerbuch/src/lib/domain/o2.ts. Nicht auf 100 geklemmt (Ueberfuellung
bleibt sichtbar), nenn <= 0 liefert 0 %, die zwei Schwellen sind an ihren Kanten
getestet (24 rot / 25 gelb, 49 gelb / 50 gruen).

KEIN ?? 200 — weder hier noch sonst im Modul (§5.12). Fuer eine 300-bar-Flasche
skalierte der Rueckfall still falsch: 150 bar als 75 % statt 50 %, Ampel von gelb
auf gruen. Der Riegel dagegen liegt in den Lesepfaden (T49, T52)."
```

---

### Task 35: `_lib/domain/geraet.ts` — der Tagesanfang kommt aus `_lib/zeit.ts`

**Files:**
- Create: `src/app/m/lagerbuch/_lib/domain/geraet.ts`
- Test: `src/app/m/lagerbuch/_lib/domain/geraet.test.ts`

**Interfaces:**
- Consumes: `_lib/domain/verfall.ts` (T28) — `type Ampel`; `_lib/zeit.ts` (T3) — `startDesTages`,
  `ausZivilzeit`; `_lib/konstanten.ts` (T4) — `TAG_REGEX`, `istEchterKalendertag`.
- Produces:
  ```ts
  export const MTK_WARN_TAGE: 30;
  export const OBJEKT_ABLAUF_WARN_TAGE: 30;
  export type GeraetTyp = "medizin" | "objekt";
  export type DatumFaelligkeit = {
    faelligAm: Date | null; tageBisFaellig: number | null;
    ampel: Ampel; ueberfaellig: boolean; keinDatum: boolean;
  };
  export function datumFaelligkeit(datum: string | null, now: Date,
                                   warnTage: number): DatumFaelligkeit;
  export function mtkFaelligkeit(datum: string | null, now: Date): DatumFaelligkeit;
  export function objektAblauf(datum: string | null, now: Date): DatumFaelligkeit;
  export function geraetFaelligkeit(
    g: { typ: GeraetTyp; mtkFaellig: string | null; ablaufdatum: string | null },
    now: Date): DatumFaelligkeit;
  ```
  Konsumenten: `_lib/format.ts` (T39, `geraetFaelligChip`), `_lib/lesepfade/geraete.ts` (T53).

**Die drei Stellen, an denen ein naiver Port bricht:**

1. **`parseTag` akzeptiert NUR `"YYYY-MM-DD"` und weist überrollende Kalendertage ab.**
   `"2026-02-31"` ergäbe mit `new Date(2026, 1, 31)` den **3. März** — und ein Gerät mit einem
   Tippfehler im MTK-Datum wäre dann still zwei Tage später fällig als gedacht. Die Prüfung dafür
   steht seit Teil 1 in `_lib/konstanten.ts#istEchterKalendertag`; diese Datei baut sie **nicht** neu.
2. **`tageBisFaellig` rundet gegen den TAGESANFANG in `ZEITZONE`**, nicht gegen `now`. Die
   Alt-Anwendung bildet ihn mit `new Date(now.getFullYear(), now.getMonth(), now.getDate())`
   (`geraet.ts:37`) — lokale Komponenten. Hier kommt er aus `_lib/zeit.ts#startDesTages`.
3. **`keinDatum: true` liefert `ampel: "gruen"` UND `ueberfaellig: false`** — die Kombination, die
   eine Anzeige leicht falsch liest. Die Oberfläche zeigt das **grau**, nicht grün und nicht rot,
   damit ein frisch angelegtes Gerät ohne gepflegtes Datum keinen Fehlalarm auslöst. Der Ton kommt
   aus `_lib/format.ts#geraetFaelligChip` (T39), nicht von hier.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/domain/geraet.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { datumFaelligkeit, mtkFaelligkeit, objektAblauf, geraetFaelligkeit,
         MTK_WARN_TAGE, OBJEKT_ABLAUF_WARN_TAGE } from "./geraet";
import { ausZivilzeit } from "../zeit";

/** 15. Juni 2026, 14:37 Ortszeit — bewusst NICHT Mitternacht, damit die
 *  Rundung gegen den TAGESANFANG geprueft wird und nicht gegen `now`. */
const NOW = ausZivilzeit(2026, 6, 15, 14, 37, 0, 0);

describe("datumFaelligkeit — parseTag ist streng", () => {
  it("weist ueberrollende Kalendertage ab", () => {
    // `new Date(2026, 1, 31)` waere der 3. Maerz — ein Tippfehler im MTK-Datum
    // machte das Geraet still zwei Tage spaeter faellig als gedacht.
    const f = datumFaelligkeit("2026-02-31", NOW, 30);
    expect(f.keinDatum).toBe(true);
    expect(f.faelligAm).toBeNull();
  });

  it("weist jedes andere Format ab", () => {
    for (const roh of ["15.06.2026", "2026-6-15", "2026-06", "morgen", "", "2026-13-01"]) {
      expect(datumFaelligkeit(roh, NOW, 30).keinDatum).toBe(true);
    }
  });

  it("weist null ab", () => {
    expect(datumFaelligkeit(null, NOW, 30).keinDatum).toBe(true);
  });

  it("nimmt einen echten Kalendertag an", () => {
    expect(datumFaelligkeit("2026-02-28", NOW, 30).keinDatum).toBe(false);
    expect(datumFaelligkeit("2028-02-29", NOW, 30).keinDatum).toBe(false);  // Schaltjahr
  });
});

describe("datumFaelligkeit — kein Datum ist GRUEN und NICHT ueberfaellig", () => {
  it("liefert die Kombination, die eine Anzeige leicht falsch liest", () => {
    /**
     * `ampel: "gruen"` UND `ueberfaellig: false` UND `keinDatum: true`. Die
     * Oberflaeche zeigt das GRAU, nicht gruen und nicht rot (§5.10) — damit ein
     * frisch angelegtes Geraet ohne gepflegtes Datum keinen Fehlalarm ausloest.
     * Der Ton kommt aus `_lib/format.ts#geraetFaelligChip`, nicht von hier.
     */
    expect(datumFaelligkeit(null, NOW, 30)).toEqual({
      faelligAm: null, tageBisFaellig: null, ampel: "gruen",
      ueberfaellig: false, keinDatum: true,
    });
  });
});

describe("datumFaelligkeit — die Tage zaehlen gegen den TAGESANFANG", () => {
  it("heute = 0, auch um 14:37", () => {
    // Gegen `now` gerechnet waere es −0,6 Tage → gerundet 1 oder 0, je nach
    // Rundungsart. Gegen den Tagesanfang ist es eindeutig 0.
    const f = datumFaelligkeit("2026-06-15", NOW, 30);
    expect(f.tageBisFaellig).toBe(0);
    expect(f.ueberfaellig).toBe(false);
    expect(f.ampel).toBe("gelb");   // 0 <= warnTage, inklusive heute
  });

  it("gestern = −1 und UEBERFAELLIG", () => {
    const f = datumFaelligkeit("2026-06-14", NOW, 30);
    expect(f.tageBisFaellig).toBe(-1);
    expect(f.ueberfaellig).toBe(true);
    expect(f.ampel).toBe("rot");
  });

  it("morgen = 1", () => {
    expect(datumFaelligkeit("2026-06-16", NOW, 30).tageBisFaellig).toBe(1);
  });

  it("ueberlebt einen Zeitumstellungstag", () => {
    /**
     * 29.03.2026 ist der Umstellungstag auf Sommerzeit (23 Stunden). Eine
     * Millisekunden-Division gegen einen lokalen Mitternachtswert liefert dort
     * 0,958 Tage; `Math.round` rettet das, `Math.floor` nicht. Der Fall steht hier,
     * weil er in jeder Zone anders aussieht — und unter Entscheidung 26 (b) gar
     * nicht mehr von der Prozess-TZ abhaengt.
     */
    const vorher = ausZivilzeit(2026, 3, 28, 12, 0, 0, 0);
    expect(datumFaelligkeit("2026-03-29", vorher, 30).tageBisFaellig).toBe(1);
    expect(datumFaelligkeit("2026-03-30", vorher, 30).tageBisFaellig).toBe(2);
  });
});

describe("datumFaelligkeit — die Ampelkanten", () => {
  it("genau warnTage entfernt ist GELB (inklusive)", () => {
    expect(datumFaelligkeit("2026-07-15", NOW, 30).ampel).toBe("gelb");  // 30 Tage
  });

  it("warnTage + 1 ist GRUEN", () => {
    expect(datumFaelligkeit("2026-07-16", NOW, 30).ampel).toBe("gruen"); // 31 Tage
  });
});

describe("die zwei Warnfenster sind KONSTANTEN, keine Env", () => {
  it("tragen 30 Tage und ihre Einheit im Namen", () => {
    // §10.3: sie waren nie Env; sie jetzt konfigurierbar zu machen waere eine
    // Neuerung, die niemand beauftragt hat.
    expect(MTK_WARN_TAGE).toBe(30);
    expect(OBJEKT_ABLAUF_WARN_TAGE).toBe(30);
  });

  it("mtkFaelligkeit und objektAblauf setzen sie ein", () => {
    expect(mtkFaelligkeit("2026-07-15", NOW).ampel).toBe("gelb");
    expect(objektAblauf("2026-07-16", NOW).ampel).toBe("gruen");
  });
});

describe("geraetFaelligkeit — die Typ-Weiche", () => {
  it("medizin liest mtkFaellig, objekt liest ablaufdatum", () => {
    const g = { mtkFaellig: "2026-06-20", ablaufdatum: "2027-01-01" };
    expect(geraetFaelligkeit({ typ: "medizin", ...g }, NOW).tageBisFaellig).toBe(5);
    expect(geraetFaelligkeit({ typ: "objekt", ...g }, NOW).tageBisFaellig).toBe(200);
  });

  it("liest das FREMDE Feld nicht, auch wenn es gesetzt ist", () => {
    // Die Typ-Trennung ist eine SCHREIB-Invariante (`geraete.ts:39-42` haelt
    // typ-fremde Felder auf null) — aber ein Altdatensatz kann beides tragen.
    // Diese Zeile haelt fest, dass die Leseseite trotzdem eindeutig ist.
    expect(geraetFaelligkeit(
      { typ: "objekt", mtkFaellig: "2020-01-01", ablaufdatum: "2027-01-01" }, NOW,
    ).ueberfaellig).toBe(false);
  });

  it("ein Objekt ohne Ablaufdatum ist keinDatum, nicht ueberfaellig", () => {
    expect(geraetFaelligkeit(
      { typ: "objekt", mtkFaellig: null, ablaufdatum: null }, NOW,
    )).toEqual({
      faelligAm: null, tageBisFaellig: null, ampel: "gruen",
      ueberfaellig: false, keinDatum: true,
    });
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/geraet.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./geraet"`.

- [ ] **Schritt 3: `_lib/domain/geraet.ts` schreiben**

```ts
/**
 * Geraetefaelligkeit aus einem TAGESgenauen Datum ("YYYY-MM-DD").
 * Kein "use client", kein Datenbankzugriff.
 */
import type { Ampel } from "./verfall";
import { startDesTages, ausZivilzeit } from "../zeit";
import { TAG_REGEX, istEchterKalendertag } from "../konstanten";

/**
 * Warnfenster (Tage vor Faelligkeit → gelb). KONSTANTEN, keine Env (§10.3): sie
 * waren es nie, und sie jetzt konfigurierbar zu machen waere eine Neuerung, die
 * niemand beauftragt hat. Die Einheit steht im Namen.
 */
export const MTK_WARN_TAGE = 30;
export const OBJEKT_ABLAUF_WARN_TAGE = 30;

export type GeraetTyp = "medizin" | "objekt";

export type DatumFaelligkeit = {
  /** Geparste Faelligkeit auf Mitternacht in ZEITZONE; null bei kein/ungueltigem Datum. */
  faelligAm: Date | null;
  /** Kalendertage bis zur Faelligkeit: heute = 0, gestern = −1. */
  tageBisFaellig: number | null;
  /** ⚠️ Nur aussagekraeftig, wenn `keinDatum === false`. */
  ampel: Ampel;
  ueberfaellig: boolean;
  /** kein oder UNGUELTIGES Datum gepflegt */
  keinDatum: boolean;
};

/**
 * Parst "YYYY-MM-DD" auf Mitternacht in ZEITZONE. Leer, falsches Format oder ein
 * UEBERROLLENDER Kalendertag ("2026-02-31") ergeben null.
 *
 * ⚠️ Die Ueberroll-Pruefung ist der Punkt: `new Date(2026, 1, 31)` waere der
 * 3. Maerz, und ein Tippfehler im MTK-Datum machte das Geraet still zwei Tage
 * spaeter faellig als gedacht. `istEchterKalendertag` liegt seit Teil 1 in
 * `_lib/konstanten.ts` — diese Datei baut die Pruefung NICHT neu.
 */
function parseTag(datum: string | null): Date | null {
  if (!datum) return null;
  if (!TAG_REGEX.test(datum)) return null;
  if (!istEchterKalendertag(datum)) return null;
  const [y, m, d] = datum.split("-").map(Number);
  return ausZivilzeit(y, m, d);
}

/**
 * Faelligkeit aus einem Tagesdatum: rot ab ueberfaellig, gelb im Warnfenster
 * (INKLUSIVE heute), sonst gruen.
 *
 * ⚠️ Kein/ungueltiges Datum → `keinDatum: true`, Ampel GRUEN und
 * `ueberfaellig: false` — die Kombination, die eine Anzeige leicht falsch liest.
 * Die Oberflaeche zeigt das GRAU (§5.10), damit ein frisch angelegtes Geraet ohne
 * gepflegtes Datum keinen Fehlalarm ausloest. Der Ton kommt aus
 * `_lib/format.ts#geraetFaelligChip`, nicht von hier — diese Datei liefert keine
 * Farbe und kein Icon.
 *
 * ⚠️ DER TAGESANFANG KOMMT AUS `_lib/zeit.ts#startDesTages`, nicht aus
 * `new Date(now.getFullYear(), now.getMonth(), now.getDate())` (`geraet.ts:37`):
 * lokale Komponenten haengen an der Prozess-TZ, und das Modul haengt bewusst nicht
 * daran (Entscheidung 26 b, §5.16).
 */
export function datumFaelligkeit(
  datum: string | null,
  now: Date,
  warnTage: number,
): DatumFaelligkeit {
  const faelligAm = parseTag(datum);
  if (faelligAm === null) {
    return {
      faelligAm: null, tageBisFaellig: null, ampel: "gruen",
      ueberfaellig: false, keinDatum: true,
    };
  }
  const startHeute = startDesTages(now);
  // Math.round, nicht floor: ein Zeitumstellungstag hat 23 bzw. 25 Stunden, und
  // eine reine Division ergaebe dort 0,958 statt 1.
  const tageBisFaellig = Math.round((faelligAm.getTime() - startHeute.getTime()) / 86_400_000);
  const ueberfaellig = tageBisFaellig < 0;
  let ampel: Ampel;
  if (ueberfaellig) ampel = "rot";
  else if (tageBisFaellig <= warnTage) ampel = "gelb";
  else ampel = "gruen";
  return { faelligAm, tageBisFaellig, ampel, ueberfaellig, keinDatum: false };
}

export const mtkFaelligkeit = (datum: string | null, now: Date): DatumFaelligkeit =>
  datumFaelligkeit(datum, now, MTK_WARN_TAGE);

export const objektAblauf = (datum: string | null, now: Date): DatumFaelligkeit =>
  datumFaelligkeit(datum, now, OBJEKT_ABLAUF_WARN_TAGE);

/**
 * Waehlt die fuer den Geraetetyp relevante Faelligkeit: medizin → MTK,
 * objekt → Ablaufdatum. Das FREMDE Feld wird nie gelesen, auch wenn ein
 * Altdatensatz beides traegt.
 */
export function geraetFaelligkeit(
  g: { typ: GeraetTyp; mtkFaellig: string | null; ablaufdatum: string | null },
  now: Date,
): DatumFaelligkeit {
  return g.typ === "medizin" ? mtkFaelligkeit(g.mtkFaellig, now) : objektAblauf(g.ablaufdatum, now);
}
```

- [ ] **Schritt 4: Test grün, unter zwei Zonen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/geraet.test.ts
TZ=UTC pnpm vitest run src/app/m/lagerbuch/_lib/domain/geraet.test.ts
```

Erwartet: **beide grün.** Diese Datei ist neben `verfall.ts` die zweite zonenabhängige Rechnung
(§5.16); wäre sie an lokale Komponenten gebunden, wäre der UTC-Lauf hier rot.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/domain/geraet.ts src/app/m/lagerbuch/_lib/domain/geraet.test.ts
git commit -m "feat(lagerbuch): _lib/domain/geraet.ts — Tagesanfang aus _lib/zeit.ts

parseTag akzeptiert nur YYYY-MM-DD und weist ueberrollende Kalendertage ab
(2026-02-31 waere der 3. Maerz — ein Tippfehler machte das Geraet still zwei Tage
spaeter faellig). Die Pruefung kommt aus _lib/konstanten.ts, sie wird nicht neu
gebaut.

tageBisFaellig zaehlt gegen startDesTages(now) in ZEITZONE, nicht gegen lokale
Komponenten (§5.16). Unter TZ=UTC gefahren.

keinDatum liefert ampel 'gruen' UND ueberfaellig false — die Kombination, die eine
Anzeige leicht falsch liest. Der graue Ton kommt aus format.ts, nicht von hier.

MTK_WARN_TAGE und OBJEKT_ABLAUF_WARN_TAGE bleiben Konstanten (§10.3)."
```

---

### Task 36: `_lib/domain/bz.ts` — `ueberfaellig: false` heißt hier NICHT „alles gut"

**Files:**
- Create: `src/app/m/lagerbuch/_lib/domain/bz.ts`
- Test: `src/app/m/lagerbuch/_lib/domain/bz.test.ts`

**Interfaces:**
- Consumes: `_lib/domain/verfall.ts` (T28) — `type Ampel`.
- Produces:
  ```ts
  export const BZ_KONTROLL_INTERVALL_TAGE: 31;
  export const BZ_WARN_TAGE: 5;
  export type BzFaelligkeit = {
    faelligAm: Date | null; tageBisFaellig: number | null;
    ampel: Ampel; ueberfaellig: boolean; nieGeprueft: boolean;
  };
  export type BzKontrolleBewertung = {
    level1ImBereich: boolean | null; level2ImBereich: boolean | null; bestanden: boolean;
  };
  export type BzAkkuKennzahl = {
    tageDurchschnitt: number | null; anzahlWechsel: number; anzahlIntervalle: number;
  };
  export function bzFaelligkeit(letzteKontrolle: Date | null, now: Date): BzFaelligkeit;
  export function imBereich(wert: number | null, min: number | null,
                            max: number | null): boolean | null;
  export function bewerteKontrolle(g: {
    level1Wert: number | null; level1Min: number | null; level1Max: number | null;
    level2Wert: number | null; level2Min: number | null; level2Max: number | null;
  }): BzKontrolleBewertung;
  export function akkuLebensdauer(wechselTs: Date[]): BzAkkuKennzahl;
  ```
  Konsumenten: `_lib/lesepfade/bz.ts` (T51).

**Die Falle dieser Datei, ausgeschrieben** (§5.11). `bzFaelligkeit(null, now)` liefert
`ampel: "rot"`, `ueberfaellig: **false**`, `nieGeprueft: true`. **`ueberfaellig === false` heißt hier
nicht „alles gut".** Jede Anzeige muss `nieGeprueft` **eigenständig** behandeln, sonst zeigt ein nie
kontrolliertes Gerät „nicht überfällig" **neben** einer roten Ampel — und der Satz ist beruhigend,
obwohl das Gerät der schlechteste Fall im Bestand ist.

**Die Rechnung hängt AUSDRÜCKLICH nicht an der Zeitzone** (§5.16): `letzteKontrolle + 31 · 86 400 000`
ist reine Millisekunden-Arithmetik, ebenso `akkuLebensdauer`. Wer sie „vereinheitlicht" und über
`_lib/zeit.ts` schickt, macht sie langsamer und **nicht** richtiger — und riskiert, dass ein
31-Tage-Intervall über einen Zeitumstellungstag plötzlich 30 oder 32 Tage lang ist.

**Die drei `bestanden`-Regeln** (`bz.ts:70-77`), und die erste ist die, die man weglässt:

1. **Kein einziger Wert erfasst → `false`.** Das verhindert „vacuously true": eine **leere**
   Kontrolle ist keine bestandene.
2. **Mindestens ein Level konfiguriert** (min **und** max gesetzt) → **alle** konfigurierten Level
   müssen gemessen **und** im Bereich sein.
3. **Kein Level konfiguriert, aber ein Wert erfasst → `true`** — es gibt keinen Referenzbereich zu
   verletzen.

⚠️ **Kompressen-Verfall, Sticks, Lanzetten und Batteriewechsel fließen NICHT in `bestanden` ein**
(`bz.ts:52`). Die Ausschlussliste wandert als Kommentar mit — ohne sie sieht es aus wie eine Lücke.

⚠️ **`refSnapshot` wird geschrieben und heute nie gelesen** (§5.11). Die Spalte bleibt (Teil 1, T7)
**und wird sichtbar**: das Logbuch zeigt je Zeile die **damals** gültigen Grenzen aus `refSnapshot`,
nicht die heutigen aus `bz_geraete`. Ohne das liest man eine alte Kontrolle gegen einen **neuen**
Referenzbereich, und das ist die Fehlaussage, die ein Nachweis nicht machen darf. **Die Auswertung
liegt in T51** (`lesepfade/bz.ts`), nicht hier — diese Datei bewertet eine **frische** Kontrolle
gegen die **aktuellen** Grenzen.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/domain/bz.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bzFaelligkeit, imBereich, bewerteKontrolle, akkuLebensdauer,
         BZ_KONTROLL_INTERVALL_TAGE, BZ_WARN_TAGE } from "./bz";

const NOW = new Date("2026-06-15T12:00:00Z");
const vorTagen = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("bzFaelligkeit — NIE GEPRUEFT ist die Falle", () => {
  it("liefert rot MIT ueberfaellig: false", () => {
    /**
     * ⚠️ `ueberfaellig === false` heisst hier NICHT „alles gut". Jede Anzeige muss
     * `nieGeprueft` EIGENSTAENDIG behandeln — sonst steht „nicht ueberfaellig"
     * neben einer roten Ampel, und der Satz ist beruhigend, obwohl das Geraet der
     * schlechteste Fall im Bestand ist (§5.11).
     */
    expect(bzFaelligkeit(null, NOW)).toEqual({
      faelligAm: null, tageBisFaellig: null, ampel: "rot",
      ueberfaellig: false, nieGeprueft: true,
    });
  });
});

describe("bzFaelligkeit — 31 Tage, Warnfenster 5", () => {
  it("faelligAm ist letzteKontrolle + 31 Tage", () => {
    const letzte = vorTagen(10);
    const f = bzFaelligkeit(letzte, NOW);
    expect(f.faelligAm?.getTime()).toBe(letzte.getTime() + 31 * 86_400_000);
    expect(f.nieGeprueft).toBe(false);
  });

  it("frisch geprueft ist gruen", () => {
    expect(bzFaelligkeit(vorTagen(1), NOW).ampel).toBe("gruen");
  });

  it("die Warnkante: 5 Tage vor Faelligkeit ist GELB, 6 ist gruen", () => {
    // tageBisFaellig ist AUFGERUNDET (Math.ceil).
    expect(bzFaelligkeit(vorTagen(26), NOW).tageBisFaellig).toBe(5);
    expect(bzFaelligkeit(vorTagen(26), NOW).ampel).toBe("gelb");
    expect(bzFaelligkeit(vorTagen(25), NOW).tageBisFaellig).toBe(6);
    expect(bzFaelligkeit(vorTagen(25), NOW).ampel).toBe("gruen");
  });

  it("ueber 31 Tage her ist rot UND ueberfaellig", () => {
    const f = bzFaelligkeit(vorTagen(40), NOW);
    expect(f.ampel).toBe("rot");
    expect(f.ueberfaellig).toBe(true);
    expect(f.nieGeprueft).toBe(false);
    expect(f.tageBisFaellig).toBeLessThan(0);
  });

  it("die zwei Konstanten tragen ihre Einheit im Namen", () => {
    expect(BZ_KONTROLL_INTERVALL_TAGE).toBe(31);
    expect(BZ_WARN_TAGE).toBe(5);
  });

  it("rechnet ZONEN-UNABHAENGIG (reine ms-Arithmetik, §5.16)", () => {
    // Ueber einen Zeitumstellungstag hinweg: 31 Tage bleiben 31 · 86 400 000 ms.
    // Wer die Rechnung „vereinheitlicht" und ueber _lib/zeit.ts schickt, macht aus
    // einem 31-Tage-Intervall ploetzlich 30 oder 32 Tage.
    const vorUmstellung = new Date("2026-03-15T12:00:00Z");
    const f = bzFaelligkeit(vorUmstellung, new Date("2026-04-10T12:00:00Z"));
    expect(f.faelligAm?.toISOString()).toBe("2026-04-15T12:00:00.000Z");
  });
});

describe("imBereich", () => {
  it("liefert null, wenn IRGENDEIN Wert fehlt", () => {
    expect(imBereich(null, 1, 9)).toBeNull();
    expect(imBereich(5, null, 9)).toBeNull();
    expect(imBereich(5, 1, null)).toBeNull();
  });

  it("ist an beiden Raendern INKLUSIV", () => {
    expect(imBereich(1, 1, 9)).toBe(true);
    expect(imBereich(9, 1, 9)).toBe(true);
    expect(imBereich(0, 1, 9)).toBe(false);
    expect(imBereich(10, 1, 9)).toBe(false);
  });
});

describe("bewerteKontrolle — die drei Regeln", () => {
  const leer = {
    level1Wert: null, level1Min: null, level1Max: null,
    level2Wert: null, level2Min: null, level2Max: null,
  };

  it("Regel 1: eine KOMPLETT LEERE Kontrolle ist NICHT bestanden", () => {
    // Verhindert „vacuously true". Ohne diese Regel waere jede durchgeklickte
    // leere Kontrolle ein bestandener Nachweis.
    expect(bewerteKontrolle(leer).bestanden).toBe(false);
  });

  it("Regel 2: ein konfiguriertes Level muss GEMESSEN und IM BEREICH sein", () => {
    expect(bewerteKontrolle({
      ...leer, level1Wert: 5, level1Min: 1, level1Max: 9,
    }).bestanden).toBe(true);
    expect(bewerteKontrolle({
      ...leer, level1Wert: 12, level1Min: 1, level1Max: 9,
    }).bestanden).toBe(false);
  });

  it("Regel 2: ein konfiguriertes, aber NICHT GEMESSENES Level laesst bestanden fallen", () => {
    // Level 2 ist konfiguriert, aber nicht gemessen — obwohl Level 1 stimmt, ist
    // die Kontrolle nicht bestanden. Genau das ist der Fall, den ein naiver Port
    // verliert, wenn er nur ueber die GEMESSENEN Level iteriert.
    expect(bewerteKontrolle({
      level1Wert: 5, level1Min: 1, level1Max: 9,
      level2Wert: null, level2Min: 100, level2Max: 200,
    }).bestanden).toBe(false);
  });

  it("Regel 3: kein Level konfiguriert, aber ein Wert erfasst -> bestanden", () => {
    expect(bewerteKontrolle({ ...leer, level1Wert: 42 }).bestanden).toBe(true);
  });

  it("meldet die beiden Bereichsurteile getrennt zurueck", () => {
    const b = bewerteKontrolle({
      level1Wert: 5, level1Min: 1, level1Max: 9,
      level2Wert: 300, level2Min: 100, level2Max: 200,
    });
    expect(b.level1ImBereich).toBe(true);
    expect(b.level2ImBereich).toBe(false);
    expect(b.bestanden).toBe(false);
  });
});

describe("akkuLebensdauer", () => {
  it("liefert bei 0 und 1 Wechsel tageDurchschnitt: null", () => {
    expect(akkuLebensdauer([])).toEqual(
      { tageDurchschnitt: null, anzahlWechsel: 0, anzahlIntervalle: 0 });
    expect(akkuLebensdauer([NOW])).toEqual(
      { tageDurchschnitt: null, anzahlWechsel: 1, anzahlIntervalle: 0 });
  });

  it("mittelt bei 2 Wechseln ein Intervall", () => {
    expect(akkuLebensdauer([vorTagen(100), NOW])).toEqual(
      { tageDurchschnitt: 100, anzahlWechsel: 2, anzahlIntervalle: 1 });
  });

  it("mittelt bei 3 Wechseln zwei Intervalle", () => {
    expect(akkuLebensdauer([vorTagen(300), vorTagen(100), NOW])).toEqual(
      { tageDurchschnitt: 150, anzahlWechsel: 3, anzahlIntervalle: 2 });
  });

  it("sortiert selbst und veraendert die Eingabe NICHT", () => {
    const eingabe = [NOW, vorTagen(300), vorTagen(100)];
    expect(akkuLebensdauer(eingabe).tageDurchschnitt).toBe(150);
    expect(eingabe[0]).toBe(NOW);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/bz.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./bz"`.

- [ ] **Schritt 3: `_lib/domain/bz.ts` schreiben**

```ts
/**
 * BZ-Geraete (Blutzucker-Messgeraete) — Kontrollfaelligkeit, Bewertung, Akku.
 * Kein "use client", kein Datenbankzugriff.
 *
 * ⚠️ DIESE DATEI RECHNET ABSICHTLICH IN REINEN MILLISEKUNDEN und geht NICHT ueber
 * `_lib/zeit.ts` (§5.16). Ein Kontrollintervall ist eine Dauer, kein Zivildatum:
 * ueber einen Zeitumstellungstag bleiben 31 Tage 31 · 86 400 000 ms. Wer die
 * Rechnung „vereinheitlicht", macht aus dem Intervall ploetzlich 30 oder 32 Tage.
 */
import type { Ampel } from "./verfall";

/** Kontrollloesung muss spaetestens alle 31 Tage geprueft werden.
 *  ⚠️ KONSTANTE, kein Regler (§10.3): das ist die PRUEFVORGABE fuer die
 *  Kontrollloesung, nicht der Geschmack des Betriebs — ein Regler daran laedt
 *  dazu ein, eine Faelligkeit wegzukonfigurieren statt sie zu erfuellen. */
export const BZ_KONTROLL_INTERVALL_TAGE = 31;

/** Warnfenster (Tage vor Faelligkeit → gelb). */
export const BZ_WARN_TAGE = 5;

export type BzFaelligkeit = {
  /** letzteKontrolle + 31 Tage; null wenn noch nie geprueft. */
  faelligAm: Date | null;
  tageBisFaellig: number | null;
  /** gruen ok · gelb bald · rot ueberfaellig ODER nie geprueft */
  ampel: Ampel;
  ueberfaellig: boolean;
  nieGeprueft: boolean;
};

/**
 * Faelligkeit aus dem Datum der letzten Kontrolle.
 *
 * ⚠️ `null` = noch nie geprueft → `ampel: "rot"`, aber `ueberfaellig: FALSE`.
 * DAS IST DIE FALLE DIESER FUNKTION (§5.11): `ueberfaellig === false` heisst hier
 * NICHT „alles gut". Jede Anzeige muss `nieGeprueft` eigenstaendig behandeln,
 * sonst steht „nicht ueberfaellig" neben einer roten Ampel — beruhigend, obwohl
 * das Geraet der schlechteste Fall im Bestand ist.
 */
export function bzFaelligkeit(letzteKontrolle: Date | null, now: Date): BzFaelligkeit {
  if (letzteKontrolle === null) {
    return {
      faelligAm: null, tageBisFaellig: null, ampel: "rot",
      ueberfaellig: false, nieGeprueft: true,
    };
  }
  const faelligAm = new Date(letzteKontrolle.getTime() + BZ_KONTROLL_INTERVALL_TAGE * 86_400_000);
  const tageBisFaellig = Math.ceil((faelligAm.getTime() - now.getTime()) / 86_400_000);
  const ueberfaellig = faelligAm.getTime() < now.getTime();
  let ampel: Ampel;
  if (ueberfaellig) ampel = "rot";
  else if (tageBisFaellig <= BZ_WARN_TAGE) ampel = "gelb";
  else ampel = "gruen";
  return { faelligAm, tageBisFaellig, ampel, ueberfaellig, nieGeprueft: false };
}

/** Ob ein Messwert im Referenzbereich liegt. Fehlt IRGENDEIN Wert → null
 *  („nicht bewertbar"), nicht `false`. Beide Raender sind inklusiv. */
export function imBereich(
  wert: number | null, min: number | null, max: number | null,
): boolean | null {
  if (wert === null || min === null || max === null) return null;
  return wert >= min && wert <= max;
}

export type BzKontrolleBewertung = {
  level1ImBereich: boolean | null;
  level2ImBereich: boolean | null;
  bestanden: boolean;
};

/**
 * Bewertet eine Kontrolle gegen die (optional) am Geraet konfigurierten
 * Level-Referenzbereiche.
 *
 * `bestanden` nach DREI Regeln (`lagerbuch/src/lib/domain/bz.ts:70-77`):
 *  1. Komplett LEERE Kontrolle (kein einziger Wert erfasst) → false. Verhindert
 *     „vacuously true": eine leere Kontrolle ist keine bestandene.
 *  2. Mindestens ein konfiguriertes Level (min UND max gesetzt) → ALLE
 *     konfigurierten Level muessen GEMESSEN und im Bereich sein. ⚠️ Ein
 *     konfiguriertes, aber nicht gemessenes Level laesst `bestanden` fallen — das
 *     verliert ein Port, der nur ueber die gemessenen Level iteriert.
 *  3. Kein Level konfiguriert, aber mind. ein Wert erfasst → true (kein
 *     Referenzbereich zum Verletzen).
 *
 * ⚠️ Kompresse-Verfall, Sticks, Lanzetten und Batteriewechsel fliessen NICHT in
 * `bestanden` ein. Die Ausschlussliste steht hier, weil sie sonst wie eine Luecke
 * aussieht.
 */
export function bewerteKontrolle(g: {
  level1Wert: number | null; level1Min: number | null; level1Max: number | null;
  level2Wert: number | null; level2Min: number | null; level2Max: number | null;
}): BzKontrolleBewertung {
  const level1ImBereich = imBereich(g.level1Wert, g.level1Min, g.level1Max);
  const level2ImBereich = imBereich(g.level2Wert, g.level2Min, g.level2Max);
  const levels = [
    { wert: g.level1Wert, min: g.level1Min, max: g.level1Max, imB: level1ImBereich },
    { wert: g.level2Wert, min: g.level2Min, max: g.level2Max, imB: level2ImBereich },
  ];
  const hatWert = levels.some((l) => l.wert !== null);
  const konfiguriert = levels.filter((l) => l.min !== null && l.max !== null);
  let bestanden: boolean;
  if (!hatWert) bestanden = false;
  else if (konfiguriert.length > 0) bestanden = konfiguriert.every((l) => l.wert !== null && l.imB === true);
  else bestanden = true;
  return { level1ImBereich, level2ImBereich, bestanden };
}

export type BzAkkuKennzahl = {
  tageDurchschnitt: number | null;
  anzahlWechsel: number;
  anzahlIntervalle: number;
};

/**
 * Ø Batterie-/Akku-Lebensdauer: Mittel der Abstaende zwischen aufeinanderfolgenden
 * Batteriewechsel-Ereignissen.
 *
 * `< 2` Wechsel → `tageDurchschnitt: null` (kein Intervall messbar). Sortiert
 * selbst und veraendert die Eingabe nicht.
 *
 * ⚠️ Die GESAMTkennzahl ueber alle Geraete mittelt nur GERAETEINTERNE Intervalle
 * (`lagerbuch/src/db/bz.ts:137-161`) — sie klebt nicht die Zeitreihen
 * verschiedener Geraete aneinander. Die Funktion dafuer liegt in
 * `_lib/lesepfade/bz.ts` (T51) und ruft diese hier NICHT ueber alle Zeitstempel
 * auf einmal.
 */
export function akkuLebensdauer(wechselTs: Date[]): BzAkkuKennzahl {
  const sorted = [...wechselTs].sort((a, b) => a.getTime() - b.getTime());
  const anzahlWechsel = sorted.length;
  const anzahlIntervalle = Math.max(0, anzahlWechsel - 1);
  if (anzahlIntervalle < 1) return { tageDurchschnitt: null, anzahlWechsel, anzahlIntervalle };
  let summe = 0;
  for (let i = 1; i < sorted.length; i++) {
    summe += (sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000;
  }
  return { tageDurchschnitt: summe / anzahlIntervalle, anzahlWechsel, anzahlIntervalle };
}
```

- [ ] **Schritt 4: Test grün, Gates und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/bz.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/domain/bz.ts src/app/m/lagerbuch/_lib/domain/bz.test.ts
git commit -m "feat(lagerbuch): _lib/domain/bz.ts — nieGeprueft ist rot MIT ueberfaellig false

Die Falle dieser Datei (§5.11): ueberfaellig === false heisst hier NICHT 'alles
gut'. Jede Anzeige muss nieGeprueft eigenstaendig behandeln, sonst steht 'nicht
ueberfaellig' neben einer roten Ampel.

Die drei bestanden-Regeln einzeln getestet, inkl. des Falls, den ein naiver Port
verliert: ein konfiguriertes, aber NICHT GEMESSENES Level laesst bestanden fallen.

Reine ms-Arithmetik, ausdruecklich NICHT ueber _lib/zeit.ts (§5.16): ein
Kontrollintervall ist eine Dauer, kein Zivildatum."
```

---

### Task 37: `_lib/checkErgebnis.ts` — ein Parser für zwei inkompatible JSON-Formate

**Files:**
- Create: `src/app/m/lagerbuch/_lib/checkErgebnis.ts`
- Test: `src/app/m/lagerbuch/_lib/checkErgebnis.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export type CheckPositionRoh = { sollPositionId?: string; artikelId: string;
                                   soll?: number; ist?: number };
  export type CheckArtikelRoh = { artikelId: string; positionen?: number; sollSumme?: number;
    istSumme?: number; recordedVorher?: number; korrektur?: number;
    nachfuellGewuenscht?: number; nachfuellGebucht?: number };
  export type CheckGeraetRoh = { geraetId: string; vorhanden?: boolean;
                                 zustand?: string | null; bemerkung?: string | null };
  export type CheckFlascheRoh = { flascheId: string; druckBar?: number;
                                  nennfuelldruckBar?: number | null };
  export type CheckVerfallRoh = { artikelId: string; verfall: string;
                                  ampel?: string; abgelaufen?: boolean };
  export type CheckErgebnisV1 = { version: 1; eintraege: { fehlt?: number; gebucht?: number }[] };
  export type CheckErgebnisV2 = { version: 2; positionen: CheckPositionRoh[];
    artikel: CheckArtikelRoh[]; geraete: CheckGeraetRoh[];
    flaschen: CheckFlascheRoh[]; verfall: CheckVerfallRoh[] };
  export type CheckErgebnis = CheckErgebnisV1 | CheckErgebnisV2;
  export const LEERES_ERGEBNIS: CheckErgebnisV2;
  export function parseCheckErgebnis(roh: string | null): CheckErgebnis;
  ```
  Konsumenten: `_lib/domain/check.ts` (T40, `summiereCheckErgebnis`),
  `_lib/lesepfade/checks.ts` (T49, **beide** Leser).

**Warum es diese Datei gibt** (§4.10, §5.8.3). `checks.ergebnis` trägt **zwei inkompatible
JSON-Formate**, und die Alt-Anwendung parst sie an **zwei** Stellen dupliziert, jeweils mit einem
nackten `catch { }` (`queries.ts:382`, `:435 ff.`). Das funktioniert und muss **zweimal** gepflegt
werden — und genau daraus entsteht die Doppelrechnung aus §5.8.3, bei der Übersicht und Detail für
dasselbe JSON **verschiedene** Summen liefern können.

**Der Diskriminator ist `version`, nicht `Array.isArray` am Aufrufort.** Beide Leser bekommen ein
Objekt, dessen Form TypeScript unterscheiden kann. Wer stattdessen weiterhin
`Array.isArray(raw)` schreibt, hat den Parser gebaut und nicht benutzt.

**Vier 1:1-Pflichten** (§4.10):

1. **Fällt der V1-Zweig weg, zeigen alte Checks leere Detaillisten** statt der Zusammenfassung — und
   das ist die **einzige** Auswertung, die es für sie je gab. `altFormat: true` bleibt ein Feld der
   Detailantwort (T49), und die Detailseite **sagt es** (Teil 5, §11.5 Zustand 26).
2. **Feldnamen im V2-Format sind NICHT umbenennbar**, sonst wird jede historische Auswertung stumm 0.
3. **Beide Leser überbrücken gelöschte Artikel/Geräte/Flaschen tolerant** — `ergebnis` ist freies
   JSON **ohne Fremdschlüssel**. Das ist eine Auflage an T49, nicht an den Parser.
4. **`geraeteAuffaellig` hängt am Stringvergleich `zustand === "Defekt"`**, und ein unbekannter
   Altwert zählt **nicht** als auffällig — Auflage an T40.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/checkErgebnis.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCheckErgebnis, LEERES_ERGEBNIS } from "./checkErgebnis";

describe("parseCheckErgebnis — das ALTE Format (V1)", () => {
  it("erkennt ein Array und liefert version 1", () => {
    const roh = JSON.stringify([{ fehlt: 3, gebucht: 1 }, { fehlt: 0, gebucht: 0 }]);
    const e = parseCheckErgebnis(roh);
    expect(e.version).toBe(1);
    if (e.version === 1) expect(e.eintraege).toHaveLength(2);
  });

  it("liefert ein LEERES Array als V1, nicht als V2", () => {
    // `"[]"` ist der Vorgabewert des Alt-Lesers (`queries.ts:366`,
    // `JSON.parse(c.ergebnis ?? "[]")`). Er MUSS V1 bleiben, sonst kippt ein
    // Altcheck ohne Eintraege in den V2-Zweig und `altFormat` waere falsch.
    const e = parseCheckErgebnis("[]");
    expect(e.version).toBe(1);
    if (e.version === 1) expect(e.eintraege).toEqual([]);
  });

  it("laesst unvollstaendige Eintraege stehen, statt sie zu fuellen", () => {
    // `{fehlt?}`/`{gebucht?}` sind OPTIONAL. Der Summierer geht ueber `?? 0`;
    // hier zu fuellen naehme ihm die Moeglichkeit, „nicht angegeben" von „0" zu
    // unterscheiden, falls das je gebraucht wird.
    const e = parseCheckErgebnis(JSON.stringify([{ gebucht: 2 }]));
    if (e.version === 1) expect(e.eintraege[0]).toEqual({ gebucht: 2 });
  });
});

describe("parseCheckErgebnis — das HEUTIGE Format (V2)", () => {
  const V2 = {
    positionen: [{ sollPositionId: "sp1", artikelId: "a1", soll: 4, ist: 3 }],
    artikel: [{ artikelId: "a1", positionen: 1, sollSumme: 4, istSumme: 3,
                recordedVorher: 3, korrektur: 0, nachfuellGewuenscht: 1, nachfuellGebucht: 1 }],
    geraete: [{ geraetId: "g1", vorhanden: true, zustand: "In Ordnung", bemerkung: null }],
    flaschen: [{ flascheId: "f1", druckBar: 150, nennfuelldruckBar: 200 }],
    verfall: [{ artikelId: "a1", verfall: "2026-09", ampel: "gelb", abgelaufen: false }],
  };

  it("erkennt ein Objekt und liefert version 2 mit allen fuenf Listen", () => {
    const e = parseCheckErgebnis(JSON.stringify(V2));
    expect(e.version).toBe(2);
    if (e.version === 2) {
      expect(e.positionen).toEqual(V2.positionen);
      expect(e.artikel).toEqual(V2.artikel);
      expect(e.geraete).toEqual(V2.geraete);
      expect(e.flaschen).toEqual(V2.flaschen);
      expect(e.verfall).toEqual(V2.verfall);
    }
  });

  it("ergaenzt FEHLENDE Listen als leere Arrays", () => {
    // Ein teilweise geschriebenes Ergebnis darf keinen Leser zum Absturz bringen.
    const e = parseCheckErgebnis(JSON.stringify({ positionen: [{ artikelId: "a1" }] }));
    if (e.version === 2) {
      expect(e.positionen).toHaveLength(1);
      expect(e.artikel).toEqual([]);
      expect(e.geraete).toEqual([]);
      expect(e.flaschen).toEqual([]);
      expect(e.verfall).toEqual([]);
    }
  });

  it("wirft eine Liste weg, die kein Array ist", () => {
    const e = parseCheckErgebnis(JSON.stringify({ geraete: "kaputt", artikel: 42 }));
    if (e.version === 2) {
      expect(e.geraete).toEqual([]);
      expect(e.artikel).toEqual([]);
    }
  });

  it("erhaelt nennfuelldruckBar: null, statt es wegzuwerfen", () => {
    /**
     * ⚠️ DIE ZEILE, DIE §5.12 TRAEGT. Ein Parser, der `null` auf `undefined`
     * normalisiert oder auf 200 setzt, nimmt dem Leser die Moeglichkeit,
     * „Nennfuelldruck UNBEKANNT" zu erkennen — und dann ist der `?? 200`-Rueckfall
     * wieder da, nur eine Ebene tiefer.
     */
    const e = parseCheckErgebnis(JSON.stringify({
      flaschen: [{ flascheId: "f1", druckBar: 150, nennfuelldruckBar: null }],
    }));
    if (e.version === 2) expect(e.flaschen[0].nennfuelldruckBar).toBeNull();
  });

  it("erhaelt ein FEHLENDES nennfuelldruckBar als undefined", () => {
    // Der haeufigere der beiden Wege in den Rueckfall (§5.12): jeder Check, der
    // VOR der Einfuehrung des Snapshots abgeschlossen wurde.
    const e = parseCheckErgebnis(JSON.stringify({
      flaschen: [{ flascheId: "f1", druckBar: 150 }],
    }));
    if (e.version === 2) expect(e.flaschen[0].nennfuelldruckBar).toBeUndefined();
  });
});

describe("parseCheckErgebnis — jeder Lesefehler wird ein LEERES V2", () => {
  it("kaputtes JSON", () => {
    expect(parseCheckErgebnis("{nicht json")).toEqual(LEERES_ERGEBNIS);
  });

  it("null", () => {
    expect(parseCheckErgebnis(null)).toEqual(LEERES_ERGEBNIS);
  });

  it("leerer String", () => {
    expect(parseCheckErgebnis("")).toEqual(LEERES_ERGEBNIS);
  });

  it("ein Skalar statt Objekt oder Array", () => {
    // `JSON.parse("5")` ist 5, `JSON.parse("null")` ist null — beides parst
    // erfolgreich und ist trotzdem kein Ergebnis.
    for (const roh of ["5", '"text"', "true", "null"]) {
      expect(parseCheckErgebnis(roh)).toEqual(LEERES_ERGEBNIS);
    }
  });

  it("LEERES_ERGEBNIS ist V2 und traegt fuenf leere Listen", () => {
    expect(LEERES_ERGEBNIS).toEqual({
      version: 2, positionen: [], artikel: [], geraete: [], flaschen: [], verfall: [],
    });
  });

  it("liefert bei jedem Aufruf eine EIGENE Instanz der Listen", () => {
    /**
     * Sonst teilten sich zwei Aufrufer dieselben Arrays, und ein `.sort()` im
     * Leser (T49 sortiert alle vier Detaillisten) veraenderte die Ausgabe des
     * anderen. Das ist kein theoretischer Fall: Uebersicht und Detail rufen
     * denselben Parser.
     */
    const a = parseCheckErgebnis("kaputt");
    const b = parseCheckErgebnis("kaputt");
    if (a.version === 2 && b.version === 2) {
      expect(a.positionen).not.toBe(b.positionen);
      expect(a.positionen).not.toBe(LEERES_ERGEBNIS.positionen);
    }
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/checkErgebnis.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./checkErgebnis"`.

- [ ] **Schritt 3: `_lib/checkErgebnis.ts` schreiben**

```ts
/**
 * EIN Parser fuer die zwei inkompatiblen JSON-Formate in `checks.ergebnis`
 * (§4.10). Kein "use client", kein Datenbankzugriff.
 *
 * WARUM ES DIESE DATEI GIBT. Die Alt-Anwendung parst dasselbe Feld an ZWEI
 * Stellen dupliziert, jeweils mit einem nackten `catch { }` (`queries.ts:382`,
 * `:435 ff.`). Das funktioniert und muss zweimal gepflegt werden — und genau
 * daraus entsteht die Doppelrechnung aus §5.8.3, bei der Uebersicht und Detail
 * fuer DASSELBE JSON verschiedene Summen liefern koennen.
 *
 * ⚠️ FELDNAMEN IM V2-FORMAT SIND NICHT UMBENENNBAR. Sie stehen in
 * Produktionsdaten; wird einer geaendert, wird jede historische Auswertung STUMM
 * 0 — kein Fehler, keine Meldung, nur Nullen (§4.10, 1:1-Pflicht 2).
 *
 * ⚠️ DER V1-ZWEIG WANDERT MIT. Das Altformat ist im Produktionsbestand und NICHT
 * konvertierbar (es traegt die Information schlicht nicht). Faellt der Zweig weg,
 * zeigen alte Checks leere Detaillisten statt der Zusammenfassung — und das ist
 * die einzige Auswertung, die es fuer sie je gab.
 */

/** V2: eine gezaehlte Position. `sollPositionId` zeigt auf `soll_positionen.id`
 *  und kann auf eine geloeschte Zeile zeigen — `ergebnis` ist freies JSON OHNE
 *  Fremdschluessel. Der Leser ueberbrueckt das tolerant (T49). */
export type CheckPositionRoh = {
  sollPositionId?: string;
  artikelId: string;
  soll?: number;
  ist?: number;
};

/** V2: die Aggregation JE ARTIKEL — nicht je Position. Der Fahrzeugbestand ist
 *  pro (Artikel, Lagerort); liegt derselbe Artikel in zwei Faechern, teilen sich
 *  die Positionen EINEN Bestand (§5.7.1). */
export type CheckArtikelRoh = {
  artikelId: string;
  positionen?: number;
  sollSumme?: number;
  istSumme?: number;
  recordedVorher?: number;
  korrektur?: number;
  nachfuellGewuenscht?: number;
  nachfuellGebucht?: number;
};

/** V2: die Geraete-Quittierung. ⚠️ `zustand` ist ein FREIER String, weil ein
 *  Altcheck theoretisch einen fremden Wert tragen kann. Beim SCHREIBEN ist er ab
 *  Teil 4 ein Zod-Enum, beim ANZEIGEN bleibt er tolerant (§5.8.2). */
export type CheckGeraetRoh = {
  geraetId: string;
  vorhanden?: boolean;
  zustand?: string | null;
  bemerkung?: string | null;
};

/**
 * V2: die Sauerstoff-Messung.
 *
 * ⚠️ `nennfuelldruckBar` ist `number | null | undefined`, und alle DREI Zustaende
 * sind verschieden (§5.12):
 *   - eine Zahl  → der Snapshot zum Check-Zeitpunkt, die richtige Bezugsgroesse;
 *   - `undefined`→ der Snapshot FEHLT (jeder Check vor seiner Einfuehrung);
 *   - `null`     → ausdruecklich „unbekannt" (ab jetzt geschrieben).
 * Ein Parser, der `null` auf `undefined` normalisiert oder auf 200 setzt, nimmt
 * dem Leser die Moeglichkeit, „Nennfuelldruck unbekannt" zu erkennen — und dann
 * ist der `?? 200`-Rueckfall wieder da, nur eine Ebene tiefer.
 */
export type CheckFlascheRoh = {
  flascheId: string;
  druckBar?: number;
  nennfuelldruckBar?: number | null;
};

/** V2: der im Fahrzeug gemeldete Verfall. `ampel`/`abgelaufen` sind der Snapshot
 *  von damals; die Leser rechnen die Ampel NEU gegen heute (§5.6.3). */
export type CheckVerfallRoh = {
  artikelId: string;
  verfall: string;
  ampel?: string;
  abgelaufen?: boolean;
};

/** V1 (alt, vor dem Fahrzeugbestand): ein Array ohne Positionsdetails. */
export type CheckErgebnisV1 = {
  version: 1;
  eintraege: { fehlt?: number; gebucht?: number }[];
};

/** V2 (heute): ein Objekt mit fuenf Schluesseln (`check.ts:167`). */
export type CheckErgebnisV2 = {
  version: 2;
  positionen: CheckPositionRoh[];
  artikel: CheckArtikelRoh[];
  geraete: CheckGeraetRoh[];
  flaschen: CheckFlascheRoh[];
  verfall: CheckVerfallRoh[];
};

export type CheckErgebnis = CheckErgebnisV1 | CheckErgebnisV2;

/**
 * Der Wert, in den JEDER Lesefehler ueberfuehrt wird.
 *
 * ⚠️ Er wird NIE direkt zurueckgegeben — `parseCheckErgebnis` baut jedes Mal eine
 * frische Kopie. Sonst teilten sich zwei Aufrufer dieselben Arrays, und ein
 * `.sort()` im Leser (T49 sortiert alle vier Detaillisten) veraenderte die Ausgabe
 * des anderen. Uebersicht und Detail rufen denselben Parser.
 */
export const LEERES_ERGEBNIS: CheckErgebnisV2 = {
  version: 2, positionen: [], artikel: [], geraete: [], flaschen: [], verfall: [],
};

/** Frische, leere V2-Struktur — nie die geteilte Konstante. */
function leer(): CheckErgebnisV2 {
  return { version: 2, positionen: [], artikel: [], geraete: [], flaschen: [], verfall: [] };
}

/** Nimmt eine Liste nur an, wenn sie wirklich ein Array ist. */
function liste<T>(wert: unknown): T[] {
  return Array.isArray(wert) ? (wert as T[]) : [];
}

/**
 * Parst `checks.ergebnis`.
 *
 * DER DISKRIMINATOR IST `version`, nicht `Array.isArray` am Aufrufort. Beide
 * Leser bekommen ein Objekt, dessen Form TypeScript unterscheiden kann; wer
 * weiterhin `Array.isArray(raw)` schreibt, hat den Parser gebaut und nicht
 * benutzt.
 *
 * ⚠️ `"[]"` BLEIBT V1. Es ist der Vorgabewert des Alt-Lesers
 * (`JSON.parse(c.ergebnis ?? "[]")`, `queries.ts:366`); kippte es in den
 * V2-Zweig, waere `altFormat` fuer einen Altcheck ohne Eintraege falsch.
 */
export function parseCheckErgebnis(roh: string | null): CheckErgebnis {
  if (!roh) return leer();
  let daten: unknown;
  try {
    daten = JSON.parse(roh);
  } catch {
    return leer();
  }
  if (Array.isArray(daten)) {
    return { version: 1, eintraege: daten as CheckErgebnisV1["eintraege"] };
  }
  // `typeof null === "object"` — deshalb die Null-Pruefung. Ein Skalar
  // (`5`, `"text"`, `true`) parst erfolgreich und ist trotzdem kein Ergebnis.
  if (daten === null || typeof daten !== "object") return leer();
  const o = daten as Record<string, unknown>;
  return {
    version: 2,
    positionen: liste<CheckPositionRoh>(o.positionen),
    artikel: liste<CheckArtikelRoh>(o.artikel),
    geraete: liste<CheckGeraetRoh>(o.geraete),
    flaschen: liste<CheckFlascheRoh>(o.flaschen),
    verfall: liste<CheckVerfallRoh>(o.verfall),
  };
}
```

- [ ] **Schritt 4: Test grün, Gates und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/checkErgebnis.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/checkErgebnis.ts src/app/m/lagerbuch/_lib/checkErgebnis.test.ts
git commit -m "feat(lagerbuch): _lib/checkErgebnis.ts — ein Parser statt zweier catch-Bloecke

§4.10: checks.ergebnis traegt zwei inkompatible JSON-Formate, und die
Alt-Anwendung parst sie an zwei Stellen dupliziert mit nacktem catch{}. Genau
daraus entsteht die Doppelrechnung aus §5.8.3.

Der Diskriminator ist `version`, nicht Array.isArray am Aufrufort. '[]' bleibt
V1 — es ist der Vorgabewert des Alt-Lesers, und ein Kippen in den V2-Zweig machte
altFormat fuer einen Altcheck ohne Eintraege falsch.

nennfuelldruckBar behaelt alle DREI Zustaende (Zahl / undefined / null): ein
Parser, der null normalisiert, bringt den ?? 200-Rueckfall eine Ebene tiefer
zurueck (§5.12).

Jeder Aufruf liefert EIGENE Arrays — T49 sortiert die Detaillisten in place."
```

---

### Task 38: `_lib/boot.ts` und der Haken in `assertHostConfig()` — die Naht ohne Netz

**Files:**
- **Commit 1** — Create: `src/app/m/lagerbuch/_lib/boot.ts`; Test:
  `src/app/m/lagerbuch/_lib/boot.test.ts`
- **Commit 2** — Modify: `src/core/bootstrap.ts`; Modify (Test): `src/core/bootstrap.test.ts`

**Interfaces:**
- Consumes: `_lib/grenzen.ts` (T32) — `grenzenFehler(env?): string[]`; aus `core`: `getModule`,
  `prodHostsFor` (`@/core/registry`).
- Produces:
  ```ts
  export async function lagerbuchBootFehler(
    env?: Record<string, string | undefined>): Promise<string[]>;
  ```
  **Genau ein** Aufrufer: `assertHostConfig()` in `src/core/bootstrap.ts`.

⚠️ **DIESER TASK HAT KEIN KOPPLUNGSNETZ, und das ist der Grund, warum er zwei Commits und drei
Nachweise hat.** `src/core/bootstrap.test.ts` koppelt das **Migrations-Dreieck** — jedes Modul mit
`_db/` steht in `MODULE_MIGRATIONS` (`:85-91`), jeder Ordner hat ein `meta/_journal.json`
(`:93-98`), jeder Ordner wird ins Prod-Image kopiert (`:100-107`). Es koppelt **nicht** die
Boot-Haken. Ohne den Haken existiert `_lib/boot.ts`, `boot.test.ts` ist grün, alle sechs Prüfungen
laufen nie, und **nichts wird rot** — weder `typecheck` noch `lint` noch `build` noch Vitest noch
Playwright.

**Die drei Netze, die dieser Task deshalb spannt:**

| Netz | Was es fängt | Wo |
|---|---|---|
| `_lib/boot.test.ts` | dass die Funktion die **richtige Liste** rechnet | Commit 1 |
| Quelltext-Zusicherung in `src/core/bootstrap.test.ts` | dass `lagerbuchBootFehler` im `errors`-Array von `assertHostConfig` **steht** | Commit 2 |
| Echter Startlauf mit kaputtem Wert | dass der Abbruch **wirklich** eintritt und die Meldung den Variablennamen nennt | T61 (Abnahme) |

**Die Signatur ist `Promise<string[]>`, und sie WIRFT NIE.**

- `async`, weil `assertHostConfig()` bereits `async` ist und `filesBootFehler()` awaitet
  (`bootstrap.ts:44`). Eine synchrone Funktion würde dort ebenfalls funktionieren, aber die Naht
  sähe **anders** aus als die daneben — und die nächste Prüfung, die etwas Asynchrones braucht
  (etwa eine Dateiprobe), müsste den Aufrufer ändern.
- **Sie wirft nie**, weil ein Wurf aus dieser Funktion `assertHostConfig()` mit einem *fremden*
  Fehler abbräche, statt die Sammelmeldung zu bauen. Und die Sammelmeldung ist der ganze Punkt:
  `assertHostConfig` läuft für **portal, qr, feedback und files** mit. Ein Wurf nähme alle vier mit.

**Prüfung 5 liest `SUITE_ADMIN_GROUP_LAGERBUCH` DIREKT und nicht über `adminGroupsFor`.** Das sieht
falsch aus und ist richtig: `adminGroupsFor(mod, env)` fällt bei nicht gesetzter Variable auf
`mod.adminGroups` zurück (`core/groups.ts:83`) — für lagerbuch also auf `["lagerbuch_nutzer"]`, den
**Entwicklungs**-Vorgabewert aus dem Registry. Die Frage der Boot-Prüfung ist aber eine andere: **hat
der Betreiber die produktive Gruppe gesetzt?** Die häufigste Go-live-Fehlkonfiguration ist genau
die, dass er es vergisst, der Registry-Default greift, in Pocket ID aber niemand in einer Gruppe
namens `lagerbuch_nutzer` ist — und die Folge ist ein **stummes 404 für alle Verwaltenden**, weil
der Suite-Admin-Kurzschluss für dieses Modul bewusst nicht gilt (Betreiber-Entscheidung 3).

**Prüfung 6 meldet ein GESETZTES `SUITE_ACCESS_GROUP_LAGERBUCH`.** Ein gesetzter Wert wäre still
wirkungslos: `canAccess` steigt für `requiresAuth: false` sofort mit `true` aus
(`core/registry.ts:155`) und liest `requiredGroups` **nie**. `validateGroupConfig`
(`core/groups.ts:120-142`) meldet nur den **leer** gesetzten Fall (`:137`) — der Betreiber setzte
also eine Zugangsgruppe, bekäme keine Warnung, und das Modul bliebe für jeden offen.

---

#### Commit 1 — `_lib/boot.ts`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/boot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lagerbuchBootFehler } from "./boot";

/** Eine vollstaendige, gueltige Umgebung MIT Prod-Host. */
const OK: Record<string, string | undefined> = {
  SUITE_HOST_LAGERBUCH: "lagerbuch.example.test",
  SUITE_ADMIN_GROUP_LAGERBUCH: "lagerbuch_nutzer",
  LAGERBUCH_HELFER_SITZUNG_SECRET: "ein-hinreichend-langes-geheimnis-32z",
  AUTH_SECRET: "ein-anderes-suite-geheimnis",
};

describe("lagerbuchBootFehler — die Bedingtheit", () => {
  it("liefert OHNE Prod-Host KEINE EINZIGE Meldung, auch wenn alles fehlt", async () => {
    /**
     * §10.5: `assertHostConfig()` laeuft fuer die GANZE Suite. Eine unbedingte
     * Pflicht hiesse — sobald ein Image mit lagerbuch auf dem Server landet,
     * startet die Suite nicht mehr, portal/qr/feedback/files inklusive —, bis der
     * Betreiber die .env ergaenzt hat. Damit blockierte dieses Modul jeden
     * unbeteiligten Deploy im Fenster zwischen Merge und Cutover.
     */
    await expect(lagerbuchBootFehler({})).resolves.toEqual([]);
    await expect(lagerbuchBootFehler({
      SUITE_ACCESS_GROUP_LAGERBUCH: "irgendwas",
      LAGERBUCH_VERFALL_ROT_TAGE: "kaputt",
    })).resolves.toEqual([]);
  });

  it("liefert MIT Prod-Host und vollstaendiger Umgebung eine leere Liste", async () => {
    await expect(lagerbuchBootFehler(OK)).resolves.toEqual([]);
  });
});

describe("lagerbuchBootFehler — sie WIRFT NIE", () => {
  it("liefert auch bei durchweg kaputter Umgebung eine LISTE, keinen Wurf", async () => {
    /**
     * ⚠️ DIE WICHTIGSTE ZEILE DIESER DATEI. `grenzen()` WIRFT bei einem kaputten
     * Wert. Reichte dieser Wurf durch, braeche `assertHostConfig()` mit einem
     * fremden Fehler ab — und `assertHostConfig` laeuft fuer portal, qr, feedback
     * und files MIT. Ein Wurf naehme alle vier mit.
     */
    const fehler = await lagerbuchBootFehler({
      SUITE_HOST_LAGERBUCH: "lagerbuch.example.test",
      LAGERBUCH_VERFALL_ROT_TAGE: "fuenf",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "0x10",
      SUITE_ACCESS_GROUP_LAGERBUCH: "verboten",
    });
    expect(Array.isArray(fehler)).toBe(true);
    expect(fehler.length).toBeGreaterThanOrEqual(4);
  });
});

describe("lagerbuchBootFehler — Pruefungen 1 bis 4 kommen aus grenzenFehler", () => {
  it("reicht die Zahlen- und Geheimnis-Meldungen durch", async () => {
    const f = (await lagerbuchBootFehler({ ...OK, LAGERBUCH_VERFALL_ROT_TAGE: "90" })).join("\n");
    expect(f).toContain("LAGERBUCH_VERFALL_ROT_TAGE");
    expect(f).toContain("Gelb-Zweig");
  });

  it("meldet ein fehlendes Sitzungsgeheimnis", async () => {
    const { LAGERBUCH_HELFER_SITZUNG_SECRET: _weg, ...ohne } = OK;
    expect((await lagerbuchBootFehler(ohne)).join("\n"))
      .toContain("LAGERBUCH_HELFER_SITZUNG_SECRET");
  });
});

describe("lagerbuchBootFehler — Pruefung 5: SUITE_ADMIN_GROUP_LAGERBUCH ist gesetzt", () => {
  it("meldet die FEHLENDE Variable, obwohl der Registry-Default greift", async () => {
    /**
     * ⚠️ DIESE PRUEFUNG LIEST DIE VARIABLE DIREKT und NICHT ueber
     * `adminGroupsFor` — das faellt bei nicht gesetzter Variable auf
     * `mod.adminGroups` zurueck (`core/groups.ts:83`), also auf den
     * ENTWICKLUNGS-Vorgabewert `["lagerbuch_nutzer"]`, und meldete nichts.
     *
     * Die haeufigste Go-live-Fehlkonfiguration ist genau die: der Betreiber
     * vergisst die Zeile, der Registry-Default greift, in Pocket ID ist aber
     * niemand in einer Gruppe namens `lagerbuch_nutzer` — und die Folge ist ein
     * STUMMES 404 fuer ALLE Verwaltenden, weil der Suite-Admin-Kurzschluss fuer
     * dieses Modul bewusst nicht gilt (Betreiber-Entscheidung 3, §3.6.2).
     */
    const { SUITE_ADMIN_GROUP_LAGERBUCH: _weg, ...ohne } = OK;
    const f = (await lagerbuchBootFehler(ohne)).join("\n");
    expect(f).toContain("SUITE_ADMIN_GROUP_LAGERBUCH");
    expect(f).toContain("404");
  });

  it("meldet die LEER gesetzte Variable", async () => {
    for (const wert of ["", "   ", ","]) {
      expect((await lagerbuchBootFehler({ ...OK, SUITE_ADMIN_GROUP_LAGERBUCH: wert })).join("\n"))
        .toContain("SUITE_ADMIN_GROUP_LAGERBUCH");
    }
  });

  it("meldet NICHT, wenn ein Wert gesetzt ist — auch nicht den FALSCHEN", async () => {
    // ⚠️ Diese Pruefung faengt den LEEREN, nicht den FALSCHEN Wert. Ein falscher
    // Gruppenname sperrt jede verwaltende Person aus, und der einzige Weg zurueck
    // ist eine .env-Aenderung auf dem Server. Das steht als Runbook-Zeile in §6.
    await expect(lagerbuchBootFehler({ ...OK, SUITE_ADMIN_GROUP_LAGERBUCH: "tippfehler" }))
      .resolves.toEqual([]);
  });
});

describe("lagerbuchBootFehler — Pruefung 6: SUITE_ACCESS_GROUP_LAGERBUCH ist NICHT gesetzt", () => {
  it("meldet einen GESETZTEN Wert und nennt den Ausweg", async () => {
    /**
     * Ein gesetzter Wert waere STILL WIRKUNGSLOS: `canAccess` steigt fuer
     * `requiresAuth: false` sofort mit `true` aus (`core/registry.ts:155`) und
     * liest `requiredGroups` NIE. `validateGroupConfig` (`core/groups.ts:120-142`)
     * meldet nur den LEER gesetzten Fall (`:137`) — der Betreiber setzte also eine
     * Zugangsgruppe, bekaeme keine Warnung, und das Modul bliebe fuer jeden offen.
     */
    const f = (await lagerbuchBootFehler({ ...OK, SUITE_ACCESS_GROUP_LAGERBUCH: "irgendwer" }))
      .join("\n");
    expect(f).toContain("SUITE_ACCESS_GROUP_LAGERBUCH");
    expect(f).toContain("requiresAuth");
    expect(f).toContain("SUITE_ADMIN_GROUP_LAGERBUCH");   // der Ausweg
  });

  it("meldet auch den LEER gesetzten Wert", async () => {
    // Den faengt `validateGroupConfig` bereits — aber zwei Meldungen sind besser
    // als eine fehlende, und die hiesige nennt den Grund, warum die Variable fuer
    // DIESES Modul gar nicht existieren darf.
    expect((await lagerbuchBootFehler({ ...OK, SUITE_ACCESS_GROUP_LAGERBUCH: "" })).join("\n"))
      .toContain("SUITE_ACCESS_GROUP_LAGERBUCH");
  });

  it("meldet NICHTS, wenn die Variable gar nicht vorkommt", async () => {
    await expect(lagerbuchBootFehler(OK)).resolves.toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/boot.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./boot"`.

- [ ] **Schritt 3: `_lib/boot.ts` schreiben**

```ts
/**
 * Die Boot-Pruefungen des Moduls `lagerbuch` (§10.5).
 *
 * Kein "use client", kein Icon-Import. Diese Datei laeuft im Instrumentation-Hook,
 * bevor irgendetwas gerendert wird.
 *
 * ⚠️ SIE WIRFT NIE. `assertHostConfig()` sammelt die Meldungen ALLER Module ein
 * und entscheidet EINMAL, ob daraus ein Abbruch wird. Ein Wurf von hier braeche
 * die Kette mit einem fremden Fehler ab — und `assertHostConfig` laeuft fuer
 * portal, qr, feedback und files MIT. Ein Wurf naehme alle vier mit, und die
 * Meldung naennte nicht einmal das Modul, das ihn ausgeloest hat.
 *
 * ⚠️ SIE GREIFT NUR, WENN DAS MODUL ERREICHBAR IST — und das ist keine Milderung,
 * sondern eine Notwendigkeit. Eine unbedingte Pflicht hiesse: sobald ein Image mit
 * lagerbuch auf dem Server landet, startet die Suite nicht mehr, bis der Betreiber
 * die .env ergaenzt hat. Damit blockierte dieses Modul jeden unbeteiligten Deploy
 * im Fenster zwischen Merge und Cutover. Der Schalter ist DIESELBE Variable, die
 * das Modul einschaltet (`SUITE_HOST_LAGERBUCH` ueber `prodHostsFor`); es gibt
 * keinen zweiten, den jemand vergessen kann. Vorbild: `files/_lib/grenzen.ts:347-351`.
 *
 * ⚠️ `async` UND `Promise<string[]>`, obwohl nichts hier asynchron ist. Die Naht
 * daneben sieht so aus (`...(await filesBootFehler())`, `bootstrap.ts:44`), und
 * eine synchrone Funktion an derselben Stelle laedt dazu ein, das `await` beim
 * naechsten Umbau zu vergessen — aus einem Startabbruch wuerde dann eine
 * unbehandelte Rejection, die NICHTS abbricht (der Kopfkommentar von
 * `assertHostConfig` schreibt genau diesen Vorfall aus).
 */
import { getModule, prodHostsFor } from "@/core/registry";
import { grenzenFehler } from "./grenzen";

type EnvLike = Record<string, string | undefined>;

/**
 * Alle sechs Boot-Pruefungen aus §10.5 als Liste.
 *
 * 1–4 kommen aus `grenzenFehler()` (`_lib/grenzen.ts`, T32) — Zahlen, Kopplungen,
 * Sitzungsgeheimnis. Sie liegen dort, weil sie die modul-private `ZAHLEN`-Tabelle
 * brauchen und diese ausdruecklich NICHT exportiert wird (§10.8, Eigenschaft 2).
 *
 * 5 und 6 sind GRUPPEN-Fragen und liegen hier.
 */
export async function lagerbuchBootFehler(env: EnvLike = process.env): Promise<string[]> {
  if (prodHostsFor(getModule("lagerbuch"), env).length === 0) return [];

  // Pruefungen 1–4. `grenzenFehler` faengt die Wuerfe von `grenzen()` selbst ab
  // und liefert immer eine Liste.
  const fehler: string[] = [...grenzenFehler(env)];

  // Pruefung 5 — SUITE_ADMIN_GROUP_LAGERBUCH ist gesetzt und nicht leer.
  //
  // ⚠️ GELESEN WIRD DIE VARIABLE DIREKT, NICHT UEBER `adminGroupsFor`. Das faellt
  // bei nicht gesetzter Variable auf `mod.adminGroups` zurueck
  // (`core/groups.ts:83`), also auf den ENTWICKLUNGS-Vorgabewert
  // ["lagerbuch_nutzer"] — und meldete nichts. Die Frage hier ist aber eine andere:
  // HAT DER BETREIBER DIE PRODUKTIVE GRUPPE GESETZT?
  const adminGruppen = (env.SUITE_ADMIN_GROUP_LAGERBUCH ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  if (adminGruppen.length === 0) {
    fehler.push(
      `SUITE_ADMIN_GROUP_LAGERBUCH ist nicht gesetzt oder leer. Ohne sie greift der ` +
        `Entwicklungs-Vorgabewert aus dem Registry ("lagerbuch_nutzer"); ist in Pocket ID ` +
        `niemand in dieser Gruppe, ist die Folge ein STUMMES 404 fuer ALLE Verwaltenden — ` +
        `fuer dieses Modul gibt es bewusst KEINE Suite-Admin-Rueckfallebene ` +
        `(Betreiber-Entscheidung 3). Der Wert wandert 1:1 aus OIDC_ADMIN_GROUP der alten ` +
        `stack.env. ⚠️ Diese Pruefung faengt den LEEREN, nicht den FALSCHEN Wert.`,
    );
  }

  // Pruefung 6 — SUITE_ACCESS_GROUP_LAGERBUCH ist NICHT gesetzt.
  //
  // Ein gesetzter Wert waere STILL WIRKUNGSLOS: `canAccess` steigt fuer
  // `requiresAuth: false` sofort mit `true` aus (`core/registry.ts:155`) und liest
  // `requiredGroups` NIE. `validateGroupConfig` meldet nur den LEER gesetzten Fall
  // (`core/groups.ts:137`) — der Betreiber setzte also eine Zugangsgruppe, bekaeme
  // keine Warnung, und das Modul bliebe fuer jeden offen.
  if (env.SUITE_ACCESS_GROUP_LAGERBUCH !== undefined) {
    fehler.push(
      `SUITE_ACCESS_GROUP_LAGERBUCH ist gesetzt und waere fuer dieses Modul WIRKUNGSLOS. ` +
        `lagerbuch traegt requiresAuth: false (zwingend — /t/<code> erzeugt die Sitzung erst ` +
        `und wird ohne jede Sitzung aufgerufen); canAccess steigt damit sofort mit true aus ` +
        `und liest requiredGroups nie. Ausweg: die Zeile ersatzlos entfernen. Wer den ` +
        `Verwaltungszugang steuern will, setzt SUITE_ADMIN_GROUP_LAGERBUCH.`,
    );
  }

  return fehler;
}
```

- [ ] **Schritt 4: Test grün und die Modulebene ohne Secrets prüfen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/boot.test.ts
env -u SUITE_HOST_LAGERBUCH -u LAGERBUCH_HELFER_SITZUNG_SECRET \
  pnpm exec tsx -e 'import("./src/app/m/lagerbuch/_lib/boot.ts")
    .then(m => m.lagerbuchBootFehler())
    .then(f => console.log("ohne Prod-Host:", JSON.stringify(f)))'
```

Erwartet: grün und `ohne Prod-Host: []`.

- [ ] **Schritt 5: Commit 1**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/boot.ts src/app/m/lagerbuch/_lib/boot.test.ts
git commit -m "feat(lagerbuch): _lib/boot.ts — sechs Boot-Pruefungen, bedingt und wurffrei

§10.5. Pruefungen 1-4 kommen aus grenzenFehler() (sie brauchen die modul-private
ZAHLEN-Tabelle, die ausdruecklich nicht exportiert wird); 5 und 6 sind
Gruppen-Fragen und liegen hier.

WIRFT NIE: assertHostConfig laeuft fuer portal, qr, feedback und files MIT — ein
Wurf naehme alle vier mit, und die Meldung naennte nicht einmal das ausloesende
Modul.

GREIFT NUR BEI prodHostsFor(...).length > 0, und das ist keine Milderung: eine
unbedingte Pflicht hielte jeden unbeteiligten Deploy an, sobald ein Image mit
lagerbuch auf dem Server landet.

Pruefung 5 liest SUITE_ADMIN_GROUP_LAGERBUCH DIREKT, nicht ueber adminGroupsFor —
das faellt auf den Registry-Vorgabewert zurueck und meldete nichts. Genau diese
vergessene Zeile ist die haeufigste Go-live-Fehlkonfiguration.

⚠️ Ohne Commit 2 wird diese Datei NIE GERUFEN und NICHTS wird rot."
```

---

#### Commit 2 — der Haken in `assertHostConfig()`

⚠️ **Zwischen Commit 1 und Commit 2 ist der Baum in genau dem Zustand, den dieser Task verhindern
soll:** die Datei existiert, alle Tests sind grün, und die sechs Prüfungen laufen nie. **Die beiden
Commits gehören in dieselbe Sitzung.**

- [ ] **Schritt 6: Die Quelltext-Zusicherung in `src/core/bootstrap.test.ts` schreiben**

An `src/core/bootstrap.test.ts` **anfügen** (die vorhandenen Blöcke bleiben unverändert):

```ts
/**
 * DIE NAHT OHNE NETZ (§10.5, Plan Teil 3 / T38).
 *
 * `bootstrap.test.ts` koppelt bisher NUR das Migrations-Dreieck. Die Boot-Haken
 * koppelt es nicht — und ohne diesen Block koennte `lagerbuchBootFehler()`
 * existieren, gruen getestet sein und NIE GERUFEN WERDEN: alle sechs Pruefungen
 * liefen nicht, und weder typecheck noch lint noch build noch Vitest noch
 * Playwright wuerde rot.
 *
 * Warum ein QUELLTEXT-Scan und kein Verhaltenstest: `assertHostConfig()` ohne
 * Prod-Host liefert bei JEDER Verdrahtung eine leere Fehlerliste (die
 * Bedingtheit ist Absicht), und MIT Prod-Host braeuchte der Test eine
 * vollstaendige, gueltige Umgebung fuer ALLE Module — dann prueft er das
 * Zusammenspiel und nicht mehr die Naht. Der Scan haelt genau die eine Aussage
 * fest, um die es geht: DER AUFRUF STEHT DA, UND ER STEHT IM errors-ARRAY.
 */
describe("Boot-Haken der Module sind verdrahtet", () => {
  const QUELLE = readFileSync("src/core/bootstrap.ts", "utf8");

  it("assertHostConfig ruft jeden Modul-Boot-Haken", () => {
    for (const haken of ["filesBootFehler", "lagerbuchBootFehler"]) {
      expect(QUELLE, `${haken} fehlt in bootstrap.ts`).toContain(haken);
    }
  });

  it("jeder Haken steht AWAITET im errors-Array, nicht irgendwo", () => {
    // Ein `lagerbuchBootFehler();` ohne `await` und ohne Spread waere
    // typkorrekt, lint-sauber und wirkungslos — die Promise liefe ins Leere und
    // die Fehlerliste bliebe leer. Genau dieselbe Klasse, die der Kopfkommentar
    // von assertHostConfig fuer `files` ausschreibt.
    for (const haken of ["filesBootFehler", "lagerbuchBootFehler"]) {
      expect(QUELLE, `${haken}: kein "...(await ${haken}())"`)
        .toContain(`...(await ${haken}())`);
    }
  });
});
```

- [ ] **Schritt 7: Den Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/core/bootstrap.test.ts
```

Erwartet: FAIL — `lagerbuchBootFehler fehlt in bootstrap.ts`. ⚠️ **Das ist der einzige Moment, in
dem diese Naht überhaupt rot ist. Sieh ihn dir an.**

- [ ] **Schritt 8: `src/core/bootstrap.ts` ändern — zwei Zeilen**

Import ergänzen, direkt unter dem `files`-Import:

```ts
import { filesBootFehler, starteFilesHintergrund } from "@/app/m/files/_lib/boot";
import { lagerbuchBootFehler } from "@/app/m/lagerbuch/_lib/boot";
```

Und in `assertHostConfig()`:

```ts
  const errors = [
    ...validateHostConfig(keys),
    ...validateGroupConfig(keys),
    ...(await filesBootFehler()),
    // lagerbuch: greift nur bei gesetztem SUITE_HOST_LAGERBUCH und WIRFT NIE
    // (Spec §10.5). Ein Wurf von dort naehme portal, qr, feedback und files mit.
    ...(await lagerbuchBootFehler()),
  ];
```

⚠️ **Es entsteht KEIN Eintrag in `startBackgroundWork()`.** Entscheidung 22 ist offen; bis zur
Betreiberantwort gilt Annahme A31 / A-T3-1 — Variante (a), `scripts/backup.sh` der Suite erfasst
`lagerbuch.db` über den vorhandenen Glob, und der Modul-Job wandert **nicht** mit (§10.7, §2.2
Punkt 7).

⚠️ **Es entsteht KEIN Schema-Import und KEIN Seed-Eintrag.** `migrateAllModules()` migriert
schema-frei; einziger Konsument der Schema-Importe ist `seedAllModules()`, und für lagerbuch ist der
Verzicht dort **zwingend**: `seedAllModules()` ist die einzige `core`-Stelle, die
`getModuleDb(<key>, schema)` ruft, und eine solche Verbindung kennte **`lb_falte` nicht** (§5.13.2).
Der `MODULE_MIGRATIONS`-Eintrag steht seit Teil 1 (T8) und wird **nicht** angefasst.

- [ ] **Schritt 9: Test grün und die Gegenprobe fahren**

```bash
pnpm vitest run src/core/bootstrap.test.ts
```

Erwartet: grün, inklusive der drei Dreieck-Fälle.

**Gegenprobe (einmal fahren, dann zurücknehmen):** entferne das `await` aus
`...(await lagerbuchBootFehler())`, sodass dort `...lagerbuchBootFehler()` steht.

```bash
pnpm typecheck
pnpm vitest run src/core/bootstrap.test.ts
```

Erwartet: `typecheck` meldet, dass eine `Promise<string[]>` nicht gespreadet werden kann, **und**
der Scan wird rot. Danach zurücknehmen. ⚠️ **Der `typecheck`-Teil dieser Gegenprobe ist ein
Glücksfall, kein Netz** — er trägt nur, weil die Funktion `async` ist. Wäre sie synchron,
liefe der Spread durch und nur der Scan bliebe.

- [ ] **Schritt 10: Commit 2**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
git add src/core/bootstrap.ts src/core/bootstrap.test.ts
git commit -m "feat(core): lagerbuchBootFehler() in assertHostConfig() einhaengen

Die Naht, fuer die es KEIN Kopplungsnetz gibt (Spec §10.5): ohne diese zwei
Zeilen existiert _lib/boot.ts, ist gruen getestet und wird nie gerufen — alle
sechs Boot-Pruefungen laufen nicht, und weder typecheck noch lint noch build noch
Vitest noch Playwright wird rot.

bootstrap.test.ts bekommt deshalb einen Quelltext-Scan: jeder Modul-Boot-Haken
steht als '...(await <name>())' im errors-Array. Ein Aufruf ohne await waere
typkorrekt-nah, lint-sauber und wirkungslos — dieselbe Klasse, die der
Kopfkommentar von assertHostConfig fuer files ausschreibt.

KEIN Eintrag in startBackgroundWork() (Entscheidung 22 offen, Rueckfall A31),
KEIN Schema-Import und KEIN Seed-Eintrag: seedAllModules() ist die einzige
core-Stelle mit getModuleDb(<key>, schema), und eine solche Verbindung kennte
lb_falte nicht (§5.13.2).

Dritte und letzte core-Beruehrung des Vorhabens neben core/shell/icons.ts (Teil 1)
und core/shell/shell.module.css (Teil 5)."
```

---

### Gate — Ende Welle 2

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

Zusätzlich, einmalig nach dieser Stufe — **der erste echte Startlauf mit dem Haken:**

```bash
SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me \
LAGERBUCH_VERFALL_ROT_TAGE=90 LAGERBUCH_VERFALL_GELB_TAGE=56 \
LAGERBUCH_HELFER_SITZUNG_SECRET=ein-hinreichend-langes-geheimnis-32z \
SUITE_ADMIN_GROUP_LAGERBUCH=lagerbuch_nutzer \
  pnpm exec tsx -e 'import("./src/core/bootstrap.ts")
    .then(m => m.assertHostConfig())
    .then(() => console.log("KEIN ABBRUCH — das waere ein Fehler"))
    .catch(e => console.log("erwartet abgebrochen:\n" + e.message))'
```

Erwartet: **abgebrochen**, und die Meldung nennt `LAGERBUCH_VERFALL_ROT_TAGE`,
`LAGERBUCH_VERFALL_GELB_TAGE` und das Wort `Gelb-Zweig`.

⚠️ **Dieser Lauf ist der einzige Nachweis, dass die Kette wirklich schließt.** Der Scan aus Schritt 6
sagt „der Aufruf steht da", `boot.test.ts` sagt „die Liste stimmt" — dass aus einer nicht leeren
Liste ein **Abbruch** wird, sagt nur ein echter Lauf. Er wird in T61 wiederholt und protokolliert.

---

## Welle 3 — Aufbereitung und das erste Aggregat (6 Tasks, alle parallel)

Diese sechs berühren einander nicht. T44 liegt hier und nicht bei den übrigen Lesepfaden, weil
**drei** Lesepfade der Welle 4 seine vier Aggregate konsumieren.

---

### Task 39: `_lib/format.ts` — Text und Tonnamen, niemals JSX und niemals Hex

**Files:**
- Create: `src/app/m/lagerbuch/_lib/format.ts`
- Test: `src/app/m/lagerbuch/_lib/format.test.ts`

**Interfaces:**
- Consumes: `_lib/domain/verfall.ts` (T28) — `type Ampel`; `_lib/domain/geraet.ts` (T35) —
  `type DatumFaelligkeit`, `type GeraetTyp`; `_lib/zeit.ts` (T3) — `tagesGrenzen`;
  `_lib/konstanten.ts` (T4) — `TAG_REGEX`, `istEchterKalendertag`.
- Produces:
  ```ts
  export type AmpelTon = "rot" | "gelb" | "ok" | "grau";
  export type Zeitraum = { von?: Date; bis?: Date; hinweise: string[] };
  export type FaelligChip = { ton: AmpelTon; text: string };

  export function fmtVerfall(v: string): string;                 // "2026-03" → "03/26"
  export function chargeText(status: { ampel: Ampel; abgelaufen: boolean },
                             verfall: string): string;
  export function ampelTon(a: Ampel | null): AmpelTon;
  export function geraetFaelligChip(typ: GeraetTyp, f: DatumFaelligkeit): FaelligChip | null;
  export function typLabel(typ: string): string;
  export function zeitraumAus(vonRoh?: string, bisRoh?: string): Zeitraum;
  ```
  Konsumenten: `_lib/lesepfade/*` (T44–T53, alle zehn), `_lib/schreibpfade/lagerortVerfall.ts` (T55),
  ab Teil 5 jede Verwaltungsseite.

**Zwei harte Grenzen für diese Datei** (§5.1, §5.17):

1. **Sie liefert nur Text und TONNAMEN — nie JSX, nie Icons, nie Hexwerte.**
   `@ant-design/icons` in einer Server Component ergibt HTTP 500 **schon beim Import** (Falle 7), und
   ein `"use client"` auf `format.ts` verwandelte Falle 7 in Falle 6. Jede Ampel-**Darstellung** ist
   damit eine Client-Insel oder ein Inline-SVG (Teil 4/5); die **Entscheidung**, welche Farbe gilt,
   fällt hier serverseitig als reiner Wert.
2. **`chipTone` gibt es nicht, die Funktion heißt `ampelTon` und kennt VIER Werte.** Die
   Alt-Funktion (`format.ts:42-44`) bildet `"gruen"` auf `"ok"` ab, weil die CSS-Klassen
   `chip-rot`/`chip-gelb`/`chip-ok` heißen — ein direkt interpoliertes `chip-${ampel}` ergäbe ein
   undefiniertes `chip-gruen` **mit Padding und Radius, aber ohne Farbe**. Die Namensfalle geht mit,
   der Name nicht. `"grau"` ist der vierte Zustand für „kein Datum gepflegt" und „keine Messung" —
   er ist **kein** Ampelwert und darf nie als grün dargestellt werden.

**Der Chip-Text ist Vertrag, nicht Dekoration** (§5.6.1, §5.10). Vier Zustände für Chargen
(`abgelaufen` / `läuft MM/JJ ab` / `fällig MM/JJ` / `bis MM/JJ`), und bei Geräten hängt **die
Existenz** des Chips am Typ: `medizin` hat **immer** einen (auch ohne Datum: „kein MTK-Datum", grau),
`objekt` ohne Ablaufdatum hat **keinen** (`format.ts:61`).

**`zeitraumAus` ist neu und heilt eine stille Fehlanzeige** (§5.14.2). `von`/`bis` gehen heute
**ungeprüft** durch; `parseDatumGrenze` liefert bei Unsinn `undefined`, die Abfrage ignoriert die
Grenze — aber die **rohe** Zeichenkette wandert als Prop zurück in den Client und dort in `value=`
eines Datumsfelds. **Das Fehlverhalten ist das gefährliche, nicht das laute:** ein gespeicherter Link
mit defektem `von` liefert die Seite **ohne Fehlermeldung und ungefiltert**. Die Adresszeile zeigt
einen Zeitraum, das Datumsfeld steht leer, und die Liste zeigt die neuesten 100 Buchungen aus der
**ganzen** Historie. Wer den Link für einen gespeicherten Zeitraumbericht hält, liest die falsche
Menge.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fmtVerfall, chargeText, ampelTon, geraetFaelligChip, typLabel, zeitraumAus } from "./format";
import type { DatumFaelligkeit } from "./domain/geraet";
import { ZEITZONE } from "./zeit";

describe("fmtVerfall", () => {
  it("macht aus 2026-03 das 03/26", () => {
    expect(fmtVerfall("2026-03")).toBe("03/26");
    expect(fmtVerfall("2099-12")).toBe("12/99");
  });
});

describe("chargeText — der Vertrag in allen VIER Zustaenden", () => {
  it("abgelaufen schlaegt jede Ampel", () => {
    expect(chargeText({ ampel: "rot", abgelaufen: true }, "2020-01")).toBe("abgelaufen");
    // Auch wenn die Ampel (theoretisch) etwas anderes saegte: `abgelaufen` zuerst.
    expect(chargeText({ ampel: "gruen", abgelaufen: true }, "2020-01")).toBe("abgelaufen");
  });
  it("rot -> 'laeuft MM/JJ ab'", () => {
    expect(chargeText({ ampel: "rot", abgelaufen: false }, "2026-03")).toBe("läuft 03/26 ab");
  });
  it("gelb -> 'faellig MM/JJ'", () => {
    expect(chargeText({ ampel: "gelb", abgelaufen: false }, "2026-05")).toBe("fällig 05/26");
  });
  it("gruen -> 'bis MM/JJ'", () => {
    expect(chargeText({ ampel: "gruen", abgelaufen: false }, "2027-01")).toBe("bis 01/27");
  });
});

describe("ampelTon — die Namensfalle, und der vierte Wert", () => {
  it("bildet gruen auf 'ok' ab, NICHT auf 'gruen'", () => {
    /**
     * Die Alt-Klassen heissen chip-rot/chip-gelb/chip-ok. Ein direkt
     * interpoliertes `chip-${ampel}` ergaebe ein undefiniertes `chip-gruen`: mit
     * Padding und Radius, aber OHNE Farbe. Die Namensfalle geht mit, der Name
     * (`chipTone`) nicht (§5.17).
     */
    expect(ampelTon("gruen")).toBe("ok");
    expect(ampelTon("rot")).toBe("rot");
    expect(ampelTon("gelb")).toBe("gelb");
  });

  it("bildet null auf 'grau' ab — den vierten Zustand", () => {
    // „kein Datum gepflegt" (§5.10) und „keine Messung" (§5.12). ⚠️ `grau` ist
    // KEIN Ampelwert und darf nie als gruen dargestellt werden.
    expect(ampelTon(null)).toBe("grau");
  });

  it("liefert NIE einen Hexwert", () => {
    /**
     * §12.1, Punkt 4: ob Rot auf einer Datenflaeche bleiben darf, entscheidet
     * Entscheidung 30 (§6.6.2 — und sie entscheidet AMPEL-Rot #8c0d16, nicht
     * Suite-Rot #c8000f). Ein Test, der einen Hexwert festnagelt, entscheidet sie
     * versehentlich mit. Die Palette liegt in `_lib/ampel.ts` (Teil 5).
     */
    for (const a of ["rot", "gelb", "gruen", null] as const) {
      expect(ampelTon(a)).not.toMatch(/#/);
    }
  });
});

describe("geraetFaelligChip — bei objekt OHNE Datum gibt es KEINEN Chip", () => {
  const f = (p: Partial<DatumFaelligkeit>): DatumFaelligkeit => ({
    faelligAm: new Date(), tageBisFaellig: 10, ampel: "gelb",
    ueberfaellig: false, keinDatum: false, ...p,
  });

  it("medizin ohne Datum -> grauer Chip 'kein MTK-Datum'", () => {
    expect(geraetFaelligChip("medizin", f({ keinDatum: true, tageBisFaellig: null, ampel: "gruen" })))
      .toEqual({ ton: "grau", text: "kein MTK-Datum" });
  });

  it("objekt ohne Datum -> null (KEIN Chip)", () => {
    // Das Ablaufdatum ist bei Objekten optional (`format.ts:61`). Ein grauer Chip
    // an jedem Spineboard waere Grundrauschen.
    expect(geraetFaelligChip("objekt", f({ keinDatum: true, tageBisFaellig: null, ampel: "gruen" })))
      .toBeNull();
  });

  it("ueberfaellig nennt den BETRAG der Tage, nicht die negative Zahl", () => {
    expect(geraetFaelligChip("medizin", f({ tageBisFaellig: -7, ueberfaellig: true, ampel: "rot" })))
      .toEqual({ ton: "rot", text: "MTK überfällig (7 T)" });
    expect(geraetFaelligChip("objekt", f({ tageBisFaellig: -3, ueberfaellig: true, ampel: "rot" })))
      .toEqual({ ton: "rot", text: "abgelaufen (3 T)" });
  });

  it("'heute faellig' ist ein EIGENER Text — 'in 0 T' liest sich falsch", () => {
    expect(geraetFaelligChip("medizin", f({ tageBisFaellig: 0, ampel: "gelb" })))
      .toEqual({ ton: "gelb", text: "MTK heute fällig" });
    expect(geraetFaelligChip("objekt", f({ tageBisFaellig: 0, ampel: "gelb" })))
      .toEqual({ ton: "gelb", text: "läuft heute ab" });
  });

  it("sonst der Tages-Chip mit dem Ton der Ampel", () => {
    expect(geraetFaelligChip("medizin", f({ tageBisFaellig: 12, ampel: "gelb" })))
      .toEqual({ ton: "gelb", text: "MTK in 12 T" });
    expect(geraetFaelligChip("objekt", f({ tageBisFaellig: 90, ampel: "gruen" })))
      .toEqual({ ton: "ok", text: "läuft in 90 T ab" });
  });
});

describe("typLabel", () => {
  it("uebersetzt die vier Buchungstypen", () => {
    expect(typLabel("zugang")).toBe("Wareneingang");
    expect(typLabel("entnahme")).toBe("Entnahme");
    expect(typLabel("korrektur")).toBe("Korrektur");
    expect(typLabel("umlagerung")).toBe("Umlagerung");
  });
  it("faellt bei einem unbekannten Typ auf den Rohwert zurueck", () => {
    expect(typLabel("was-neues")).toBe("was-neues");
  });
});

describe("zeitraumAus — die vier Faelle aus §5.14.2", () => {
  it("ohne Angaben: keine Grenzen, KEIN Hinweis", () => {
    expect(zeitraumAus(undefined, undefined)).toEqual({ hinweise: [] });
    expect(zeitraumAus("", "")).toEqual({ hinweise: [] });
  });

  it("gueltig: Tagesanfang und Tagesende, INKLUSIV, in ZEITZONE", () => {
    const z = zeitraumAus("2026-06-01", "2026-06-30");
    expect(z.hinweise).toEqual([]);
    const f = new Intl.DateTimeFormat("de-DE", {
      timeZone: ZEITZONE, day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    expect(f.format(z.von!)).toBe("01.06.2026, 00:00:00");
    expect(f.format(z.bis!)).toBe("30.06.2026, 23:59:59");
  });

  it("unparsbar: die Grenze FAELLT WEG und ein Hinweis erscheint", () => {
    /**
     * DAS FEHLVERHALTEN IST DAS GEFAEHRLICHE, NICHT DAS LAUTE (§5.14.2). Heute
     * liefert ein gespeicherter Link mit defektem `von` die Seite OHNE
     * Fehlermeldung und UNGEFILTERT: Adresszeile zeigt einen Zeitraum, Datumsfeld
     * steht leer, Liste zeigt die neuesten 100 aus der GANZEN Historie.
     */
    const z = zeitraumAus("gestern", "2026-06-30");
    expect(z.von).toBeUndefined();
    expect(z.bis).toBeDefined();
    expect(z.hinweise).toHaveLength(1);
    expect(z.hinweise[0]).toContain("ungültig");
  });

  it("ueberrollender Kalendertag ist ebenfalls unparsbar", () => {
    expect(zeitraumAus("2026-02-31", undefined).hinweise).toHaveLength(1);
    expect(zeitraumAus("2026-02-31", undefined).von).toBeUndefined();
  });

  it("von > bis: BEIDE bleiben, und der Hinweis sagt warum", () => {
    // Die Grenzen bleiben stehen, damit die Adresszeile und das Eingabefeld
    // dasselbe sagen — der Nutzer soll sehen, WAS er gesetzt hat.
    const z = zeitraumAus("2026-06-30", "2026-06-01");
    expect(z.von).toBeDefined();
    expect(z.bis).toBeDefined();
    expect(z.hinweise).toHaveLength(1);
    expect(z.hinweise[0]).toContain("leer");
  });

  it("meldet ZWEI defekte Grenzen einzeln", () => {
    expect(zeitraumAus("quatsch", "unfug").hinweise).toHaveLength(2);
  });
});

describe("Quelltext-Zusicherung: keine Zonenrechnung ausserhalb _lib/zeit.ts", () => {
  it("kein `new Date(` mit mehr als EINEM Argument unter src/app/m/lagerbuch", () => {
    /**
     * §5.16, Global Constraints dieses Plans. `new Date(y, m, d, …)` liest die
     * PROZESS-TZ; das Modul haengt bewusst nicht daran (Entscheidung 26 b).
     * Der Fehler ist still: die Ampelgrenzen wandern in die harmlose Richtung,
     * kaputt geht `fmtTs` — eine Buchung um 01:30 Ortszeit erscheint als Vortag
     * 23:30, und JEDE Buchung zwischen 00:00 und 02:00 landet auf dem falschen Tag.
     *
     * Ausgenommen ist genau EINE Datei: `_lib/zeit.ts`. Sie IST die Zonenrechnung.
     *
     * ⚠️ KOMMENTARZEILEN WERDEN UEBERSPRUNGEN, und das ist keine Bequemlichkeit:
     * `domain/verfall.ts` und `domain/geraet.ts` ZITIEREN die verbotene Form
     * ausdruecklich („nicht aus `new Date(y, m, 0, 23,59,59,999)`"), weil genau
     * dieser Satz erklaert, warum die Zeile darunter anders aussieht. Ein Scan,
     * der sie mitzaehlt, wird abgeschaltet statt repariert — dieselbe Lehre wie
     * `ohneKommentare()` in `_lib/bauform.test.ts` (Teil 2, T21).
     */
    const WURZEL = join(process.cwd(), "src/app/m/lagerbuch");
    const AUSNAHMEN = ["_lib/zeit.ts", "_lib/zeit.test.ts"];
    /** Zeilenanfang `//`, `*` oder `/*` — die drei Formen, in denen dieses Modul
     *  kommentiert. Bewusst KEIN vollstaendiger Parser: er waere mehr Code als
     *  die Zusicherung und haette selbst Fehler. */
    const istKommentar = (z: string) => /^\s*(\/\/|\*|\/\*)/.test(z);
    const treffer: string[] = [];
    const gehe = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { gehe(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        const rel = relative(WURZEL, p);
        if (AUSNAHMEN.includes(rel)) continue;
        for (const zeile of readFileSync(p, "utf8").split("\n")) {
          if (istKommentar(zeile)) continue;
          // `new Date(` gefolgt von irgendetwas mit einem Komma vor der Klammer.
          if (/new Date\([^)]*,[^)]*\)/.test(zeile)) treffer.push(`${rel}: ${zeile.trim()}`);
        }
      }
    };
    if (statSync(WURZEL).isDirectory()) gehe(WURZEL);
    expect(treffer, `Zonenrechnung ausserhalb _lib/zeit.ts:\n${treffer.join("\n")}`).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/format.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./format"`.

- [ ] **Schritt 3: `_lib/format.ts` schreiben**

```ts
/**
 * Aufbereitung fuer die Anzeige — TEXT und TONNAMEN, nie JSX und nie Icons.
 *
 * KEIN "use client" (Falle 6) und KEIN `@ant-design/icons`-Import (Falle 7). Der
 * Icon-Fehler entsteht SCHON BEIM IMPORT und risse jede Datei mit, die von hier
 * liest; ein `"use client"` daraufgesetzt verwandelte Falle 7 in Falle 6 und
 * machte den Fehler STILL. Jede Ampel-DARSTELLUNG ist deshalb eine Client-Insel
 * oder ein Inline-SVG (Teil 4/5); die ENTSCHEIDUNG, welche Farbe gilt, faellt hier
 * serverseitig als reiner Wert.
 *
 * KEIN HEXWERT. `ampelTon` liefert Tonnamen; die Zuordnung Ton → Farbe liegt in
 * `_lib/ampel.ts` (Teil 5, §6.6.2 — und sie entscheidet AMPEL-Rot #8c0d16, nicht
 * Suite-Rot #c8000f). Ein hier festgenagelter Hexwert entschiede das versehentlich
 * mit (§12.1, Punkt 4).
 *
 * ⚠️ `fmtTs` und `tagesGrenzen` liegen in `_lib/zeit.ts` (§4.5) und werden hier
 * NICHT nachgebaut.
 */
import type { Ampel } from "./domain/verfall";
import type { DatumFaelligkeit, GeraetTyp } from "./domain/geraet";
import { tagesGrenzen } from "./zeit";
import { TAG_REGEX, istEchterKalendertag } from "./konstanten";

/** Die vier Toenungen. `"ok"` statt `"gruen"` ist die Namensfalle aus §5.17;
 *  `"grau"` ist KEIN Ampelwert und darf nie als gruen dargestellt werden. */
export type AmpelTon = "rot" | "gelb" | "ok" | "grau";

/** "2026-03" → "03/26" */
export function fmtVerfall(v: string): string {
  const [y, m] = v.split("-");
  return `${m}/${y.slice(2)}`;
}

/**
 * DER CHIP-TEXT IST VERTRAG, NICHT DEKORATION (§5.6.1). Vier Zustaende, und
 * `abgelaufen` schlaegt jede Ampel — eine abgelaufene Charge ist immer rot, eine
 * rote nicht immer abgelaufen.
 */
export function chargeText(
  status: { ampel: Ampel; abgelaufen: boolean },
  verfall: string,
): string {
  if (status.abgelaufen) return "abgelaufen";
  if (status.ampel === "rot") return `läuft ${fmtVerfall(verfall)} ab`;
  if (status.ampel === "gelb") return `fällig ${fmtVerfall(verfall)}`;
  return `bis ${fmtVerfall(verfall)}`;
}

/**
 * Ampel → Tonname.
 *
 * ⚠️ `"gruen"` wird auf `"ok"` abgebildet, und das ist keine Kosmetik: die
 * Alt-CSS-Klassen heissen `chip-rot`/`chip-gelb`/`chip-ok`, und ein direkt
 * interpoliertes `chip-${ampel}` ergaebe ein undefiniertes `chip-gruen` — mit
 * Padding und Radius, aber OHNE Farbe. Die Namensfalle geht mit; die Funktion
 * heisst aber `ampelTon` und nicht `chipTone`, weil sie im Zielmodul keine
 * CSS-Klasse mehr benennt.
 *
 * `null` → `"grau"`: der vierte Zustand fuer „kein Datum gepflegt" (§5.10) und
 * „keine Messung" (§5.12).
 */
export function ampelTon(a: Ampel | null): AmpelTon {
  if (a === null) return "grau";
  return a === "gruen" ? "ok" : a;
}

export type FaelligChip = { ton: AmpelTon; text: string };

/**
 * Faelligkeits-Chip fuer ein Geraet. In Liste und Detail identisch verwendet.
 *
 * ⚠️ BEI `objekt` OHNE Datum gibt es KEINEN Chip (`format.ts:61`) — das
 * Ablaufdatum ist dort optional, und ein grauer Chip an jedem Spineboard waere
 * Grundrauschen. Bei `medizin` gibt es IMMER einen, auch ohne Datum.
 *
 * „heute faellig" ist ein EIGENER Text, weil „in 0 T" sich falsch liest.
 */
export function geraetFaelligChip(typ: GeraetTyp, f: DatumFaelligkeit): FaelligChip | null {
  const tage = Math.abs(f.tageBisFaellig ?? 0);
  if (typ === "medizin") {
    if (f.keinDatum) return { ton: "grau", text: "kein MTK-Datum" };
    if (f.ueberfaellig) return { ton: "rot", text: `MTK überfällig (${tage} T)` };
    if (f.tageBisFaellig === 0) return { ton: "gelb", text: "MTK heute fällig" };
    return { ton: ampelTon(f.ampel), text: `MTK in ${f.tageBisFaellig} T` };
  }
  if (f.keinDatum) return null;
  if (f.ueberfaellig) return { ton: "rot", text: `abgelaufen (${tage} T)` };
  if (f.tageBisFaellig === 0) return { ton: "gelb", text: "läuft heute ab" };
  return { ton: ampelTon(f.ampel), text: `läuft in ${f.tageBisFaellig} T ab` };
}

const TYP_LABEL: Record<string, string> = {
  zugang: "Wareneingang",
  entnahme: "Entnahme",
  korrektur: "Korrektur",
  umlagerung: "Umlagerung",
};

/** Deutsche Beschriftung eines Buchungstyps. Unbekanntes faellt auf den Rohwert
 *  zurueck — ein historischer Wert soll lesbar bleiben, nicht verschwinden. */
export function typLabel(typ: string): string {
  return TYP_LABEL[typ] ?? typ;
}

/**
 * Ein geprueftes Zeitfenster aus zwei rohen `searchParams`-Werten.
 *
 * ⚠️ WARUM ES DIESE FUNKTION GIBT (§5.14.2). Heute gehen `von`/`bis` UNGEPRUEFT
 * durch: `parseDatumGrenze` liefert bei Unsinn `undefined`, die Abfrage ignoriert
 * die Grenze — aber die ROHE Zeichenkette wandert als Prop zurueck in den Client
 * und dort in `value=` eines Datumsfelds. Das Fehlverhalten ist das gefaehrliche,
 * nicht das laute: ein gespeicherter Link mit defektem `von` liefert die Seite
 * OHNE Fehlermeldung und UNGEFILTERT. Die Adresszeile zeigt einen Zeitraum, das
 * Datumsfeld steht leer, und die Liste zeigt die neuesten 100 Buchungen aus der
 * GANZEN Historie. Wer den Link fuer einen gespeicherten Zeitraumbericht haelt,
 * liest die falsche Menge.
 *
 * Die HINWEISE erscheinen als Text AN DER FILTERLEISTE, nicht als Fehlerseite
 * (Auflage an Teil 5). Die roh zurueckgereichte Zeichenkette wird durch den
 * normalisierten Wert ersetzt, damit Adresszeile und Eingabefeld dasselbe sagen.
 *
 * Die Zonenrechnung selbst kommt aus `_lib/zeit.ts#tagesGrenzen` — inklusiv, also
 * Tagesanfang fuer `von` und Tagesende fuer `bis`.
 */
export type Zeitraum = { von?: Date; bis?: Date; hinweise: string[] };

const HINWEIS_UNGUELTIG = "Das Datum in der Adresse ist ungültig und wurde ignoriert.";
const HINWEIS_LEER = "Der Zeitraum ist leer: „von“ liegt nach „bis“.";

function grenze(roh: string | undefined, ende: boolean): Date | undefined {
  const s = roh?.trim();
  if (!s) return undefined;
  // Dieselbe Strenge wie bei Geraetedaten: Format UND echter Kalendertag.
  // "2026-02-31" waere sonst der 3. Maerz und der Filter zeigte still zu viel.
  if (!TAG_REGEX.test(s) || !istEchterKalendertag(s)) return undefined;
  const g = tagesGrenzen(s);
  return ende ? g.bis : g.von;
}

export function zeitraumAus(vonRoh?: string, bisRoh?: string): Zeitraum {
  const hinweise: string[] = [];
  const von = grenze(vonRoh, false);
  const bis = grenze(bisRoh, true);
  // Ein Hinweis JE defekter Grenze — zwei defekte Werte sind zwei Meldungen.
  if (vonRoh?.trim() && von === undefined) hinweise.push(HINWEIS_UNGUELTIG);
  if (bisRoh?.trim() && bis === undefined) hinweise.push(HINWEIS_UNGUELTIG);
  // BEIDE Grenzen bleiben stehen, damit Adresszeile und Eingabefeld dasselbe
  // sagen — der Nutzer soll sehen, WAS er gesetzt hat.
  if (von && bis && von.getTime() > bis.getTime()) hinweise.push(HINWEIS_LEER);
  return { von, bis, hinweise };
}
```

- [ ] **Schritt 4: Test grün, unter zwei Zonen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/format.test.ts
TZ=UTC pnpm vitest run src/app/m/lagerbuch/_lib/format.test.ts
```

- [ ] **Schritt 5: Den Quelltext-Scan einmal ROT sehen**

⚠️ **Ein Scan, den niemand hat rot werden sehen, ist keine Zusage.** Lege eine Wegwerfdatei an:

```bash
cat > src/app/m/lagerbuch/_lib/wegwerf.ts <<'EOF'
export const kaputt = new Date(2026, 5, 1, 12, 0);
EOF
pnpm vitest run src/app/m/lagerbuch/_lib/format.test.ts
rm src/app/m/lagerbuch/_lib/wegwerf.ts
```

Erwartet: **rot**, mit `_lib/wegwerf.ts` in der Meldung. Danach grün.

- [ ] **Schritt 6: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/format.ts src/app/m/lagerbuch/_lib/format.test.ts
git commit -m "feat(lagerbuch): _lib/format.ts — Text und Tonnamen, kein JSX, kein Hex

ampelTon statt chipTone, mit VIER Werten: gruen -> 'ok' (die Namensfalle aus
§5.17 geht mit, der Name nicht) und null -> 'grau' fuer 'kein Datum' und 'keine
Messung'. KEIN Hexwert — die Palette liegt in _lib/ampel.ts (Teil 5), und ein
hier festgenagelter Wert entschiede Entscheidung 30 versehentlich mit.

geraetFaelligChip liefert bei typ='objekt' OHNE Datum null: das Ablaufdatum ist
optional, ein grauer Chip an jedem Spineboard waere Grundrauschen.

zeitraumAus ist neu (§5.14.2) und heilt eine stille Fehlanzeige: ein
gespeicherter Link mit defektem von liefert heute die Seite ohne Meldung und
UNGEFILTERT, waehrend die Adresszeile einen Zeitraum zeigt.

Dazu der modulweite Quelltext-Scan 'kein new Date(y, m, …) ausserhalb
_lib/zeit.ts' — einmal ueber eine Wegwerfdatei rot gesehen."
```

---

### Task 40: `_lib/domain/check.ts` — EINE Summe für Übersicht und Detail

**Files:**
- Create: `src/app/m/lagerbuch/_lib/domain/check.ts`
- Test: `src/app/m/lagerbuch/_lib/domain/check.test.ts`

**Interfaces:**
- Consumes: `_lib/checkErgebnis.ts` (T37) — `parseCheckErgebnis`, alle Roh-Typen;
  `_lib/domain/o2.ts` (T34) — `o2Status`; `_lib/konstanten.ts` (T4) — `ZUSTAND_DEFEKT`.
- Produces:
  ```ts
  export function fehlmengen<T extends { soll: number; ist: number }>(
    positionen: T[]): (T & { fehlt: number })[];

  export type CheckSummen = {
    positionen: number; nachgefuellt: number; korrigiert: number; offen: number;
    geraeteAuffaellig: number; flaschenAuffaellig: number; nichtBewertbar: number;
    altFormat: boolean;
  };
  export function summiereCheckErgebnis(roh: string | null): CheckSummen;
  ```
  Konsumenten: `_lib/lesepfade/checks.ts` (T49, **beide** Leser), `_lib/checkNutzlast.ts` (T43,
  `fehlmengen`).

**Warum `summiereCheckErgebnis` existiert** (§5.8.3). Die Alt-Anwendung rechnet dieselben Summen an
**zwei** Stellen getrennt: `checkHistorie` (`queries.ts:374-380`) und `checkDetail` (`:496-501`).
Sie können auseinanderlaufen, und sie tun es bereits: `checkDetail` fällt beim Nennfülldruck **zwei**
Glieder weit zurück (`e.nennfuelldruckBar ?? f?.nennfuelldruckBar ?? 200`), `checkHistorie` nur eins
(`f.nennfuelldruckBar ?? 200`, wobei `f` der **JSON-Eintrag** ist, nicht der Flaschenstamm). **Die
Historie ist damit deutlich leichter in den Rückfall zu bringen als das Detail — und sie ist genau
die Ansicht, die `flaschenAuffaellig` je Check zählt.** Ein Altcheck über 300-bar-Flaschen meldet
dort systematisch **zu wenige** auffällige Flaschen.

**Der neue Zähler `nichtBewertbar`** (§5.12). Fehlt der Nennfülldruck im Ergebnis-JSON, liefert die
Zeile **keine** Prozentzahl und **keine** Ampel, und sie zählt **nicht** in `flaschenAuffaellig`,
sondern hier. ⚠️ **`summiereCheckErgebnis` kennt den Flaschenstamm nicht** — sie sieht nur das JSON.
Das zweite Glied der Kette (`f?.nennfuelldruckBar`) liegt in T49, wo der Stamm vorliegt; hier zählt
ein fehlender Snapshot **immer** als „nicht bewertbar". Die Zusage „Übersicht und Detail liefern für
dasselbe JSON identische Summen" gilt damit für **genau diese Funktion**, und T49 baut das zweite
Glied für **beide** Leser gleich ein.

**`geraeteAuffaellig` bleibt tolerant** (§5.8.2). `!vorhanden || zustand === ZUSTAND_DEFEKT` —
**beim Schreiben streng** (`z.enum(ZUSTAENDE)` ab Teil 4), **beim Anzeigen tolerant**: ein
unbekannter Altwert wird angezeigt wie gespeichert und zählt **nicht** als auffällig.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/domain/check.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fehlmengen, summiereCheckErgebnis } from "./check";

describe("fehlmengen", () => {
  it("liefert nur Eintraege mit fehlt > 0", () => {
    expect(fehlmengen([
      { soll: 5, ist: 3 }, { soll: 4, ist: 4 }, { soll: 2, ist: 7 },
    ])).toEqual([{ soll: 5, ist: 3, fehlt: 2 }]);
  });

  it("ist generisch und reicht die Positions-Identitaet DURCH", () => {
    // `T extends {soll, ist}` — damit Aufrufer sollPositionId/artikelId behalten
    // koennen (`lagerbuch/src/lib/domain/check.ts:2-3`).
    expect(fehlmengen([{ sollPositionId: "sp1", artikelId: "a1", soll: 5, ist: 1 }]))
      .toEqual([{ sollPositionId: "sp1", artikelId: "a1", soll: 5, ist: 1, fehlt: 4 }]);
  });

  it("liefert fuer eine leere Liste eine leere Liste", () => {
    expect(fehlmengen([])).toEqual([]);
  });
});

describe("summiereCheckErgebnis — das ALTE Format", () => {
  it("zaehlt Positionen, Nachgefuelltes und Offenes; alles Uebrige ist 0", () => {
    const roh = JSON.stringify([{ fehlt: 3, gebucht: 1 }, { fehlt: 2, gebucht: 2 }]);
    expect(summiereCheckErgebnis(roh)).toEqual({
      positionen: 2, nachgefuellt: 3, korrigiert: 0, offen: 2,
      geraeteAuffaellig: 0, flaschenAuffaellig: 0, nichtBewertbar: 0, altFormat: true,
    });
  });

  it("setzt altFormat: true — die Detailseite SAGT es", () => {
    // §4.10, 1:1-Pflicht 1: faellt der V1-Zweig weg, zeigen alte Checks leere
    // Detaillisten statt der Zusammenfassung — und das ist die einzige Auswertung,
    // die es fuer sie je gab. Alles andere ist eine leere Tabelle, die wie ein
    // Fehler aussieht (§11.5, Zustand 26).
    expect(summiereCheckErgebnis("[]").altFormat).toBe(true);
  });
});

describe("summiereCheckErgebnis — das HEUTIGE Format", () => {
  const V2 = {
    positionen: [{ artikelId: "a1", soll: 4, ist: 3 }, { artikelId: "a1", soll: 2, ist: 2 }],
    artikel: [{ artikelId: "a1", sollSumme: 6, istSumme: 5, korrektur: -2, nachfuellGebucht: 1 }],
    geraete: [
      { geraetId: "g1", vorhanden: true, zustand: "In Ordnung" },
      { geraetId: "g2", vorhanden: false, zustand: "In Ordnung" },
      { geraetId: "g3", vorhanden: true, zustand: "Defekt" },
    ],
    flaschen: [
      { flascheId: "f1", druckBar: 40, nennfuelldruckBar: 200 },   // 20 % → rot
      { flascheId: "f2", druckBar: 150, nennfuelldruckBar: 200 },  // 75 % → gruen
    ],
    verfall: [],
  };

  it("summiert die fuenf Zaehler und setzt altFormat: false", () => {
    expect(summiereCheckErgebnis(JSON.stringify(V2))).toEqual({
      positionen: 2, nachgefuellt: 1,
      korrigiert: 2,   // BETRAG von −2
      offen: 0,        // max(0, 6 − 5 − 1)
      geraeteAuffaellig: 2, flaschenAuffaellig: 1, nichtBewertbar: 0, altFormat: false,
    });
  });

  it("`korrigiert` ist der BETRAG, nicht die Summe mit Vorzeichen", () => {
    // Sonst hoben sich +3 und −3 auf und ein Check mit zwei gegenlaeufigen
    // Korrekturen saehe aus wie einer ganz ohne (`queries.ts:376`, `:497`).
    const roh = JSON.stringify({ artikel: [
      { artikelId: "a", korrektur: 3 }, { artikelId: "b", korrektur: -3 },
    ] });
    expect(summiereCheckErgebnis(roh).korrigiert).toBe(6);
  });

  it("`offen` ist je Artikel geklemmt, nicht erst in der Summe", () => {
    // max(0, soll − ist − nachgefuellt) JE ARTIKEL. Erst in der Summe geklemmt,
    // fraesse ein ueberfuellter Artikel die Fehlmenge eines anderen auf.
    const roh = JSON.stringify({ artikel: [
      { artikelId: "a", sollSumme: 10, istSumme: 2, nachfuellGebucht: 0 },  // offen 8
      { artikelId: "b", sollSumme: 1, istSumme: 9, nachfuellGebucht: 0 },   // offen 0, nicht −8
    ] });
    expect(summiereCheckErgebnis(roh).offen).toBe(8);
  });

  it("`geraeteAuffaellig` zaehlt !vorhanden ODER zustand === 'Defekt'", () => {
    expect(summiereCheckErgebnis(JSON.stringify(V2)).geraeteAuffaellig).toBe(2);
  });

  it("ein UNBEKANNTER Zustand zaehlt NICHT als auffaellig", () => {
    /**
     * §5.8.2: beim Schreiben streng (z.enum(ZUSTAENDE) ab Teil 4), beim Anzeigen
     * TOLERANT. Ein Altcheck kann theoretisch einen fremden String tragen; er wird
     * angezeigt wie gespeichert und zaehlt nicht — so wie heute (`check.ts:129`).
     */
    const roh = JSON.stringify({ geraete: [{ geraetId: "g", vorhanden: true, zustand: "kaputt" }] });
    expect(summiereCheckErgebnis(roh).geraeteAuffaellig).toBe(0);
  });
});

describe("summiereCheckErgebnis — der Nennfuelldruck wird NICHT geraten (§5.12)", () => {
  it("eine Flasche OHNE Snapshot zaehlt in nichtBewertbar, NICHT in flaschenAuffaellig", () => {
    /**
     * ⚠️ DIE MUTATION, DIE DAS FAENGT: den `?? null` wieder auf `?? 200` setzen.
     * Fuer eine 300-bar-Flasche skalierte der Rueckfall den Fuellstand STILL
     * FALSCH — 150 bar als 75 % statt 50 %, Ampel von gelb auf gruen. Und die
     * HISTORIE ist der leichtere der beiden Wege in den Rueckfall: sie hat KEINEN
     * Rueckgriff auf den Flaschenstamm. Ein Altcheck ueber 300-bar-Flaschen meldet
     * dort systematisch zu wenige auffaellige Flaschen.
     */
    const roh = JSON.stringify({ flaschen: [{ flascheId: "f1", druckBar: 150 }] });
    const s = summiereCheckErgebnis(roh);
    expect(s.nichtBewertbar).toBe(1);
    expect(s.flaschenAuffaellig).toBe(0);
  });

  it("nennfuelldruckBar: null zaehlt genauso", () => {
    const roh = JSON.stringify({
      flaschen: [{ flascheId: "f1", druckBar: 150, nennfuelldruckBar: null }],
    });
    expect(summiereCheckErgebnis(roh).nichtBewertbar).toBe(1);
  });

  it("nennfuelldruckBar: 0 ist BEWERTBAR und zaehlt als auffaellig", () => {
    // Eine Flasche mit Nennfuelldruck 0 im Stamm ist FEHLKONFIGURIERT, nicht
    // unbekannt — sie gehoert angesehen, nicht ausgeblendet. `o2Status` liefert
    // dafuer 0 % / rot (§5.12, Eigenschaft 2).
    const roh = JSON.stringify({
      flaschen: [{ flascheId: "f1", druckBar: 150, nennfuelldruckBar: 0 }],
    });
    const s = summiereCheckErgebnis(roh);
    expect(s.nichtBewertbar).toBe(0);
    expect(s.flaschenAuffaellig).toBe(1);
  });
});

describe("summiereCheckErgebnis — dieselbe Eingabe, dieselbe Ausgabe (§5.8.3)", () => {
  it("ist rein: zwei Aufrufe liefern zeichengleich dasselbe", () => {
    /**
     * DAS IST DIE ZUSAGE, WEGEN DER ES DIE FUNKTION GIBT. Die Alt-Anwendung
     * rechnet dieselben Summen an ZWEI Stellen getrennt (`queries.ts:374-380`
     * gegen `:496-501`) — Uebersicht und Detail koennen fuer DASSELBE JSON
     * verschiedene Zahlen zeigen, und beim Nennfuelldruck TUN sie es bereits.
     * Ab jetzt rufen beide Leser DIESE Funktion.
     */
    const roh = JSON.stringify({
      artikel: [{ artikelId: "a", sollSumme: 5, istSumme: 2, korrektur: -1, nachfuellGebucht: 2 }],
      geraete: [{ geraetId: "g", vorhanden: false }],
      flaschen: [{ flascheId: "f", druckBar: 10, nennfuelldruckBar: 200 }],
    });
    expect(summiereCheckErgebnis(roh)).toEqual(summiereCheckErgebnis(roh));
  });

  it("liefert bei kaputtem JSON Nullen statt eines Wurfs", () => {
    expect(summiereCheckErgebnis("{kaputt")).toEqual({
      positionen: 0, nachgefuellt: 0, korrigiert: 0, offen: 0,
      geraeteAuffaellig: 0, flaschenAuffaellig: 0, nichtBewertbar: 0, altFormat: false,
    });
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/check.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./check"`.

- [ ] **Schritt 3: `_lib/domain/check.ts` schreiben**

```ts
/**
 * Fahrzeug-Check: Fehlmengen und die EINE Summenrechnung.
 * Kein "use client", kein Datenbankzugriff.
 */
import { parseCheckErgebnis } from "../checkErgebnis";
import { o2Status } from "./o2";
import { ZUSTAND_DEFEKT } from "../konstanten";

/**
 * Fehlmengen einer Ist-Erfassung gegen Soll: `fehlt = max(0, soll − ist)`, nur
 * Eintraege mit `fehlt > 0`.
 *
 * GENERISCH ueber `T extends { soll, ist }`, damit Aufrufer ihre
 * Positions-Identitaet (`sollPositionId`, `artikelId`) durchreichen koennen —
 * 1:1 aus `lagerbuch/src/lib/domain/check.ts:3-5`.
 */
export function fehlmengen<T extends { soll: number; ist: number }>(
  positionen: T[],
): (T & { fehlt: number })[] {
  return positionen
    .map((p) => ({ ...p, fehlt: Math.max(0, p.soll - p.ist) }))
    .filter((p) => p.fehlt > 0);
}

export type CheckSummen = {
  positionen: number;
  nachgefuellt: number;
  /** BETRAG, nicht Summe mit Vorzeichen — sonst hoeben sich +3 und −3 auf. */
  korrigiert: number;
  /** Nach dem Check noch fehlend, JE ARTIKEL geklemmt. */
  offen: number;
  geraeteAuffaellig: number;
  flaschenAuffaellig: number;
  /** NEU (§5.12): Flaschen ohne bekannten Nennfuelldruck. Sie zaehlen NICHT als
   *  auffaellig — ein unbekannter Bezugswert erzeugt keine Zahl. */
  nichtBewertbar: number;
  /** Altformat (V1) ohne Positionsdetails. Die Detailseite SAGT es (§11.5, 26). */
  altFormat: boolean;
};

/**
 * DIE EINE Summenrechnung fuer Uebersicht UND Detail (§5.8.3).
 *
 * ⚠️ WARUM SIE EXISTIERT. Die Alt-Anwendung rechnet dieselben Summen an ZWEI
 * Stellen getrennt (`queries.ts:374-380` gegen `:496-501`). Sie koennen
 * auseinanderlaufen, und beim Nennfuelldruck TUN sie es bereits: das Detail faellt
 * zwei Glieder weit zurueck, die Historie nur eins — und die Historie ist genau
 * die Ansicht, die `flaschenAuffaellig` je Check zaehlt. Ein Altcheck ueber
 * 300-bar-Flaschen meldet dort systematisch zu wenige auffaellige Flaschen.
 *
 * ⚠️ DIESE FUNKTION KENNT DEN FLASCHENSTAMM NICHT. Sie sieht nur das JSON; ein
 * fehlender Snapshot zaehlt hier IMMER als „nicht bewertbar". Das zweite Glied der
 * Kette (`f?.nennfuelldruckBar`) liegt in `_lib/lesepfade/checks.ts`, wo der Stamm
 * vorliegt — und es wird dort fuer BEIDE Leser gleich eingebaut. Die Zusage
 * „dieselben Summen" gilt fuer genau diese Funktion.
 *
 * ⚠️ `geraeteAuffaellig` ist beim ANZEIGEN TOLERANT (§5.8.2): ein unbekannter
 * Altwert in `zustand` zaehlt NICHT als auffaellig. Streng ist nur das SCHREIBEN
 * (`z.enum(ZUSTAENDE)` ab Teil 4).
 */
export function summiereCheckErgebnis(roh: string | null): CheckSummen {
  const e = parseCheckErgebnis(roh);

  if (e.version === 1) {
    return {
      positionen: e.eintraege.length,
      nachgefuellt: e.eintraege.reduce((s, x) => s + (x.gebucht ?? 0), 0),
      korrigiert: 0,   // das Altformat kennt keine Korrektur
      offen: e.eintraege.reduce((s, x) => s + Math.max(0, (x.fehlt ?? 0) - (x.gebucht ?? 0)), 0),
      geraeteAuffaellig: 0,
      flaschenAuffaellig: 0,
      nichtBewertbar: 0,
      altFormat: true,
    };
  }

  let flaschenAuffaellig = 0;
  let nichtBewertbar = 0;
  for (const f of e.flaschen) {
    const nenn = f.nennfuelldruckBar;
    // `undefined` (Snapshot fehlt) UND `null` (ausdruecklich unbekannt) sind
    // beide „nicht bewertbar". `0` ist BEWERTBAR: eine Flasche mit Nennfuelldruck
    // 0 ist fehlkonfiguriert, nicht unbekannt — sie gehoert angesehen.
    if (nenn === undefined || nenn === null) {
      nichtBewertbar += 1;
      continue;
    }
    if (o2Status(f.druckBar ?? 0, nenn).niedrig) flaschenAuffaellig += 1;
  }

  return {
    positionen: e.positionen.length,
    nachgefuellt: e.artikel.reduce((s, a) => s + (a.nachfuellGebucht ?? 0), 0),
    korrigiert: e.artikel.reduce((s, a) => s + Math.abs(a.korrektur ?? 0), 0),
    // JE ARTIKEL geklemmt, nicht erst in der Summe — sonst fraesse ein
    // ueberfuellter Artikel die Fehlmenge eines anderen auf.
    offen: e.artikel.reduce(
      (s, a) => s + Math.max(0, (a.sollSumme ?? 0) - (a.istSumme ?? 0) - (a.nachfuellGebucht ?? 0)),
      0,
    ),
    geraeteAuffaellig: e.geraete.filter((g) => !g.vorhanden || g.zustand === ZUSTAND_DEFEKT).length,
    flaschenAuffaellig,
    nichtBewertbar,
    altFormat: false,
  };
}
```

- [ ] **Schritt 4: Test grün und die Mutationsprobe (§5.19.3)**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/domain/check.test.ts
```

Ersetze danach den `nichtBewertbar`-Zweig durch `o2Status(f.druckBar ?? 0, nenn ?? 200)` und fahre
erneut. Erwartet: **rot** in „eine Flasche OHNE Snapshot zählt in nichtBewertbar". Zurücknehmen.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/domain/check.ts src/app/m/lagerbuch/_lib/domain/check.test.ts
git commit -m "feat(lagerbuch): _lib/domain/check.ts — eine Summe fuer Uebersicht und Detail

§5.8.3: die Alt-Anwendung rechnet dieselben Zahlen an zwei Stellen getrennt, und
beim Nennfuelldruck laufen sie bereits auseinander — das Detail faellt zwei
Glieder zurueck, die Historie nur eins, und die Historie ist genau die Ansicht,
die flaschenAuffaellig je Check zaehlt.

Neuer Zaehler nichtBewertbar (§5.12): eine Flasche ohne bekannten Nennfuelldruck
zaehlt NICHT als auffaellig. nennfuelldruckBar 0 dagegen schon — das ist
fehlkonfiguriert, nicht unbekannt.

korrigiert ist der BETRAG, offen wird JE ARTIKEL geklemmt, geraeteAuffaellig ist
beim Anzeigen tolerant (unbekannter Altwert zaehlt nicht).

Mutationsprobe (?? null wieder auf ?? 200) gefahren."
```

---

### Task 41: `_lib/artikelFilter.ts` — das Prädikat, das heute inline in einem `useMemo` steht

**Files:**
- Create: `src/app/m/lagerbuch/_lib/artikelFilter.ts`
- Test: `src/app/m/lagerbuch/_lib/artikelFilter.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export type ArtikelFilterZeile = {
    name: string; fach: string; aktiv: boolean; unterMindest: boolean;
    naechsteCharge: { chargenNr: string; verfall: string } | null; chargeKritisch: boolean;
  };
  export type ArtikelFilterZustand = {
    suche: string; nurUnterMindest: boolean; nurChargeKritisch: boolean; ohneInaktive: boolean;
  };
  export const LEERER_FILTER: ArtikelFilterZustand;
  export function artikelTrifft(z: ArtikelFilterZeile, f: ArtikelFilterZustand): boolean;
  export function artikelFiltern<T extends ArtikelFilterZeile>(
    zeilen: T[], f: ArtikelFilterZustand): T[];
  ```
  Konsumenten: die Artikelliste (Teil 5, §6.9.4) und **derselbe** abgeleitete Datenbestand für den
  Excel-Export (Teil 6, §9.4).

**Warum das Prädikat gehoben wird** (§12.1, Punkt 2). Es steht heute als `useMemo` **inline** in
`ArtikelTable.tsx:112-123` — **es gibt nichts, was ein Unit-Test importieren könnte**, und die
einzige Absicherung ist ein E2E, der nur den Namen probiert. Nebenbefund der Spec: das Prädikat sucht
über Name, Fach **und** Chargennummer (`:119`).

⚠️ **Die Kopplung, die den Export still bricht** (§5.13.3, Punkt 3): `ArtikelTable.tsx:133` ruft
`bestandExportZeilen(gefiltert)` — die Datei enthält „genau das, was gerade in der Tabelle steht".
Wandert Filtern in antds `Table`-eigenen Zustand, **muss der Export dieselbe abgeleitete Liste
lesen**, sonst exportiert der Knopf still wieder alles. `artikelFiltern` ist die Funktion, die beide
Seiten benutzen — das ist ihr Zweck, nicht ihre Bequemlichkeit. **Auflage an Teil 6.**

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/artikelFilter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { artikelTrifft, artikelFiltern, LEERER_FILTER,
         type ArtikelFilterZeile } from "./artikelFilter";

const z = (p: Partial<ArtikelFilterZeile> = {}): ArtikelFilterZeile => ({
  name: "Verbandpäckchen", fach: "A1", aktiv: true, unterMindest: false,
  naechsteCharge: { chargenNr: "CH-4711", verfall: "2027-01" }, chargeKritisch: false, ...p,
});

describe("artikelTrifft — der Freitext sucht ueber DREI Felder", () => {
  it("findet ueber den NAMEN", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "verband" })).toBe(true);
  });
  it("findet ueber das FACH", () => {
    // Der Nebenbefund aus §12.1, Punkt 2: die Alt-Spec probiert nur den Namen.
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "a1" })).toBe(true);
  });
  it("findet ueber die CHARGENNUMMER der naechsten Charge", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "4711" })).toBe(true);
  });
  it("findet nicht, was in keinem der drei Felder steht", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "pflaster" })).toBe(false);
  });
  it("ist gross-/kleinschreibungsunabhaengig und trimmt", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "  VERBAND  " })).toBe(true);
  });
  it("laesst bei LEERER Suche alles durch", () => {
    expect(artikelTrifft(z(), LEERER_FILTER)).toBe(true);
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "   " })).toBe(true);
  });
  it("stolpert nicht ueber naechsteCharge === null", () => {
    expect(artikelTrifft(z({ naechsteCharge: null }), { ...LEERER_FILTER, suche: "verband" }))
      .toBe(true);
    expect(artikelTrifft(z({ naechsteCharge: null }), { ...LEERER_FILTER, suche: "4711" }))
      .toBe(false);
  });
});

describe("artikelTrifft — die drei Chips", () => {
  it("„unter Mindestbestand"", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, nurUnterMindest: true })).toBe(false);
    expect(artikelTrifft(z({ unterMindest: true }), { ...LEERER_FILTER, nurUnterMindest: true }))
      .toBe(true);
  });
  it("„Charge kritisch"", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, nurChargeKritisch: true })).toBe(false);
    expect(artikelTrifft(z({ chargeKritisch: true }), { ...LEERER_FILTER, nurChargeKritisch: true }))
      .toBe(true);
  });
  it("„inaktive ausblenden"", () => {
    expect(artikelTrifft(z({ aktiv: false }), { ...LEERER_FILTER, ohneInaktive: true })).toBe(false);
    expect(artikelTrifft(z({ aktiv: false }), LEERER_FILTER)).toBe(true);
  });
  it("verknuepft alle vier Bedingungen UND", () => {
    const zeile = z({ unterMindest: true, chargeKritisch: true, aktiv: true });
    expect(artikelTrifft(zeile, {
      suche: "verband", nurUnterMindest: true, nurChargeKritisch: true, ohneInaktive: true,
    })).toBe(true);
    expect(artikelTrifft(zeile, {
      suche: "pflaster", nurUnterMindest: true, nurChargeKritisch: true, ohneInaktive: true,
    })).toBe(false);
  });
});

describe("artikelFiltern — DIESELBE abgeleitete Liste fuer Tabelle und Export", () => {
  it("behaelt die Reihenfolge und reicht Zusatzfelder durch", () => {
    /**
     * ⚠️ DIE KOPPLUNG, DIE DEN EXPORT STILL BRICHT (§5.13.3, Punkt 3, §9.4):
     * `ArtikelTable.tsx:133` ruft `bestandExportZeilen(gefiltert)` — die Datei
     * enthaelt „genau das, was gerade in der Tabelle steht". Wandert Filtern in
     * antds Table-eigenen Zustand, MUSS der Export dieselbe abgeleitete Liste
     * lesen, sonst exportiert der Knopf still wieder alles.
     */
    const zeilen = [
      { ...z({ name: "Alpha" }), id: "1" },
      { ...z({ name: "Beta", aktiv: false }), id: "2" },
      { ...z({ name: "Alpha zwei" }), id: "3" },
    ];
    expect(artikelFiltern(zeilen, { ...LEERER_FILTER, suche: "alpha" }).map((r) => r.id))
      .toEqual(["1", "3"]);
    expect(artikelFiltern(zeilen, { ...LEERER_FILTER, ohneInaktive: true }).map((r) => r.id))
      .toEqual(["1", "3"]);
  });

  it("veraendert die Eingabeliste NICHT", () => {
    const zeilen = [z({ name: "A" }), z({ name: "B" })];
    artikelFiltern(zeilen, { ...LEERER_FILTER, suche: "A" });
    expect(zeilen).toHaveLength(2);
  });
});
```

- [ ] **Schritt 2: Test rot sehen, dann `_lib/artikelFilter.ts` schreiben**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/artikelFilter.test.ts   # FAIL: resolve "./artikelFilter"
```

```ts
/**
 * Das Artikellisten-Praedikat, gehoben aus `ArtikelTable.tsx:112-123`.
 *
 * WARUM ES GEHOBEN WIRD (§12.1, Punkt 2): es steht heute als `useMemo` INLINE in
 * der Komponente — es gibt NICHTS, was ein Unit-Test importieren koennte, und die
 * einzige Absicherung ist ein E2E, der nur den Namen probiert. Nebenbefund: das
 * Praedikat sucht ueber Name, Fach UND Chargennummer.
 *
 * Kein "use client": die Datei wird von der Client-Insel der Tabelle UND vom
 * Excel-Export gelesen, und der Export laeuft ab Teil 6 ueber eine Server-Route.
 *
 * ⚠️ DIE SORTIERUNG IST NICHT HIER. Die sechs Sortierungen der Artikelliste sind
 * §6.9.4 und damit Teil 5 — hier steht nur das FILTER-Praedikat. Wer beides
 * zusammenlegt, macht aus einer reinen Funktion einen Anzeige-Entwurf.
 */
export type ArtikelFilterZeile = {
  name: string;
  fach: string;
  aktiv: boolean;
  /** vorgerechnet im Lesepfad — `braucht(bestand, mindestbestand)` */
  unterMindest: boolean;
  naechsteCharge: { chargenNr: string; verfall: string } | null;
  /** vorgerechnet im Lesepfad — die naechste Charge ist rot oder gelb */
  chargeKritisch: boolean;
};

export type ArtikelFilterZustand = {
  suche: string;
  nurUnterMindest: boolean;
  nurChargeKritisch: boolean;
  ohneInaktive: boolean;
};

export const LEERER_FILTER: ArtikelFilterZustand = {
  suche: "", nurUnterMindest: false, nurChargeKritisch: false, ohneInaktive: false,
};

/** Alle vier Bedingungen sind UND-verknuepft. Leere Suche laesst alles durch. */
export function artikelTrifft(z: ArtikelFilterZeile, f: ArtikelFilterZustand): boolean {
  if (f.ohneInaktive && !z.aktiv) return false;
  if (f.nurUnterMindest && !z.unterMindest) return false;
  if (f.nurChargeKritisch && !z.chargeKritisch) return false;
  const q = f.suche.trim().toLowerCase();
  if (!q) return true;
  // DREI Felder, 1:1 aus `ArtikelTable.tsx:119`.
  const heuhaufen = `${z.name} ${z.fach} ${z.naechsteCharge?.chargenNr ?? ""}`.toLowerCase();
  return heuhaufen.includes(q);
}

/**
 * Die abgeleitete Liste — DIESELBE fuer Tabelle und Excel-Export.
 *
 * ⚠️ AUFLAGE AN TEIL 6 (§9.4): der Export ruft `artikelFiltern` mit demselben
 * Filterzustand, nie `bestandExportZeilen(alleZeilen)`. Sonst exportiert der Knopf
 * still wieder alles, sobald Filtern in antds Table-eigenen Zustand wandert.
 */
export function artikelFiltern<T extends ArtikelFilterZeile>(
  zeilen: T[], f: ArtikelFilterZustand,
): T[] {
  return zeilen.filter((z) => artikelTrifft(z, f));
}
```

- [ ] **Schritt 3: Test grün, Gates und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/artikelFilter.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/artikelFilter.ts src/app/m/lagerbuch/_lib/artikelFilter.test.ts
git commit -m "feat(lagerbuch): _lib/artikelFilter.ts — das Praedikat aus dem useMemo gehoben

§12.1, Punkt 2: es steht heute inline in ArtikelTable.tsx:112-123, es gibt nichts,
was ein Unit-Test importieren koennte. Je ein Fall fuer Name, Fach und
Chargennummer — die Alt-Spec probiert nur den Namen.

artikelFiltern ist die Funktion, die Tabelle UND Excel-Export benutzen (§9.4):
wandert Filtern in antds Table-eigenen Zustand, exportiert der Knopf sonst still
wieder alles. Auflage an Teil 6.

Die SORTIERUNG bleibt draussen — sie ist §6.9.4 und damit Teil 5."
```

---

### Task 42: `_lib/journalZeile.ts` — Vorzeichen und Zustandsname, ohne einen einzigen Hexwert

**Files:**
- Create: `src/app/m/lagerbuch/_lib/journalZeile.ts`
- Test: `src/app/m/lagerbuch/_lib/journalZeile.test.ts`

**Interfaces:**
- Consumes: `_lib/format.ts` (T39) — `typLabel`.
- Produces:
  ```ts
  export type JournalZustand = "negativ" | "positiv" | "neutral";
  export type JournalDarstellung = { mengeText: string; zustand: JournalZustand; typText: string };
  export function journalZeile(b: { typ: string; menge: number }): JournalDarstellung;
  ```
  Konsumenten: die Journalseite (Teil 5, §6) und die Artikel-Detail-Historie (Teil 5).

**Was diese acht Zeilen ersetzen** (§12.1, Punkt 4). `verwaltung-flow.spec.ts:67` greift heute
`.jdelta.minus` — eine Zusicherung an einer **eigenen CSS-Klasse**, die den antd-Umbau **sicher
nicht** überlebt. Der Ersatz ist zweiteilig: **Unit** (diese Datei) liefert Vorzeichen und
Zustandsnamen, **DOM** (Teil 5) prüft, dass die Zeile beides rendert.

⚠️ **Die Zusicherung nennt NIE einen Hexwert.** Ob Rot auf dieser Datenfläche bleiben darf,
entscheidet Entscheidung 30 (§6.6.2 — und sie entscheidet **Ampel**-Rot `#8c0d16`, nicht Suite-Rot
`#c8000f`); ein Test, der `#c8000f` festnagelt, **entscheidet sie versehentlich mit**.

⚠️ **Das Vorzeichen ist ASCII (Festlegung H6).** Ein typografisches `−` (U+2212) läse sich schöner
und wäre exakt die Klasse, vor der §12.3 warnt — `/× aussondern/` in `verfall.spec.ts:21` hängt heute
an einem typografischen `×` im Knopftext, und niemand sieht einem Selektor an, dass er an einem
unsichtbaren Zeichenunterschied scheitert.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/journalZeile.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { journalZeile } from "./journalZeile";

describe("journalZeile — Vorzeichen und Zustand", () => {
  it("eine Entnahme ist NEGATIV und traegt ein Minus", () => {
    expect(journalZeile({ typ: "entnahme", menge: -3 }))
      .toEqual({ mengeText: "-3", zustand: "negativ", typText: "Entnahme" });
  });

  it("ein Zugang ist POSITIV und traegt ein PLUS", () => {
    // Das Plus ist der Punkt: `String(5)` waere "5" und saehe aus wie eine
    // Bestandszahl statt wie eine Veraenderung.
    expect(journalZeile({ typ: "zugang", menge: 5 }))
      .toEqual({ mengeText: "+5", zustand: "positiv", typText: "Wareneingang" });
  });

  it("eine Menge 0 ist NEUTRAL und traegt KEIN Vorzeichen", () => {
    expect(journalZeile({ typ: "korrektur", menge: 0 }))
      .toEqual({ mengeText: "0", zustand: "neutral", typText: "Korrektur" });
  });

  it("der Zustand haengt am VORZEICHEN, nicht am Typ", () => {
    // Eine Korrektur kann in beide Richtungen gehen, eine Umlagerung erzeugt
    // ZWEI Legs mit entgegengesetztem Vorzeichen (I3).
    expect(journalZeile({ typ: "korrektur", menge: 7 }).zustand).toBe("positiv");
    expect(journalZeile({ typ: "korrektur", menge: -7 }).zustand).toBe("negativ");
    expect(journalZeile({ typ: "umlagerung", menge: -2 }).zustand).toBe("negativ");
    expect(journalZeile({ typ: "umlagerung", menge: 2 }).zustand).toBe("positiv");
  });

  it("uebersetzt den Typ ueber typLabel und faellt auf den Rohwert zurueck", () => {
    expect(journalZeile({ typ: "umlagerung", menge: 1 }).typText).toBe("Umlagerung");
    expect(journalZeile({ typ: "was-neues", menge: 1 }).typText).toBe("was-neues");
  });
});

describe("journalZeile — die Zusicherung nennt KEINEN Hexwert", () => {
  it("liefert nur Zustandsnamen, keine Farben", () => {
    /**
     * §12.1, Punkt 4: ob Rot auf DIESER Datenflaeche bleiben darf, entscheidet
     * Entscheidung 30 (§6.6.2 — und sie entscheidet AMPEL-Rot #8c0d16, nicht
     * Suite-Rot #c8000f). Ein Test, der einen Hexwert festnagelt, entscheidet sie
     * versehentlich mit.
     */
    for (const menge of [-5, 0, 5]) {
      const d = journalZeile({ typ: "korrektur", menge });
      expect(JSON.stringify(d)).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it("das Vorzeichen ist ASCII, kein typografisches Minus (Festlegung H6)", () => {
    /**
     * Ein `−` (U+2212) laese sich schoener und waere exakt die Klasse, vor der
     * §12.3 warnt: `/× aussondern/` haengt heute an einem typografischen × im
     * Knopftext, und niemand sieht einem Selektor an, dass er an einem
     * unsichtbaren Zeichenunterschied scheitert.
     */
    expect(journalZeile({ typ: "entnahme", menge: -3 }).mengeText).toBe("-3");
    expect(journalZeile({ typ: "entnahme", menge: -3 }).mengeText).not.toContain("−");
  });
});
```

- [ ] **Schritt 2: Test rot sehen, dann `_lib/journalZeile.ts` schreiben**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/journalZeile.test.ts   # FAIL: resolve "./journalZeile"
```

```ts
/**
 * Die Aufbereitung EINER Journalzeile: Vorzeichen, Zustandsname, Typtext.
 * Kein "use client", kein Datenbankzugriff, KEIN Hexwert.
 *
 * WAS DIESE ACHT ZEILEN ERSETZEN (§12.1, Punkt 4): `verwaltung-flow.spec.ts:67`
 * greift heute `.jdelta.minus` — eine Zusicherung an einer EIGENEN CSS-Klasse, die
 * den antd-Umbau sicher nicht ueberlebt. Der Ersatz ist zweiteilig: Unit (hier)
 * liefert Vorzeichen und Zustandsnamen, DOM (Teil 5) prueft, dass die Zeile beides
 * rendert.
 *
 * ⚠️ KEIN HEXWERT UND KEIN KLASSENNAME. Ob Rot auf dieser Datenflaeche bleiben
 * darf, entscheidet Entscheidung 30 (§6.6.2). Diese Datei liefert einen
 * ZUSTANDSNAMEN; wie er aussieht, entscheidet Teil 5.
 */
import { typLabel } from "./format";

export type JournalZustand = "negativ" | "positiv" | "neutral";

export type JournalDarstellung = {
  /** ASCII-Vorzeichen (Festlegung H6): "+5", "-3", "0". KEIN U+2212 — ein
   *  typografisches Minus ist genau die Klasse, an der ein Selektor unsichtbar
   *  scheitert (§12.3). */
  mengeText: string;
  /** Haengt am VORZEICHEN, nicht am Typ: eine Korrektur geht in beide Richtungen,
   *  und eine Umlagerung erzeugt zwei Legs mit entgegengesetztem Vorzeichen (I3). */
  zustand: JournalZustand;
  typText: string;
};

export function journalZeile(b: { typ: string; menge: number }): JournalDarstellung {
  const zustand: JournalZustand = b.menge < 0 ? "negativ" : b.menge > 0 ? "positiv" : "neutral";
  const mengeText = b.menge > 0 ? `+${b.menge}` : String(b.menge);
  return { mengeText, zustand, typText: typLabel(b.typ) };
}
```

- [ ] **Schritt 3: Test grün, Gates und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/journalZeile.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/journalZeile.ts src/app/m/lagerbuch/_lib/journalZeile.test.ts
git commit -m "feat(lagerbuch): _lib/journalZeile.ts — Vorzeichen und Zustand, ohne Hexwert

Ersetzt die .jdelta.minus-Kopplung aus verwaltung-flow.spec.ts:67 (§12.1, Punkt 4).
Der Zustand haengt am Vorzeichen, nicht am Typ — eine Korrektur geht in beide
Richtungen, eine Umlagerung erzeugt zwei Legs mit entgegengesetztem Vorzeichen.

Die Zusicherung nennt NIE einen Hexwert: Entscheidung 30 entscheidet Ampel-Rot
#8c0d16, nicht Suite-Rot #c8000f, und ein Test, der einen Wert festnagelt,
entschiede sie versehentlich mit.

Das Vorzeichen ist ASCII (Festlegung H6) — ein typografisches Minus ist genau die
Klasse, an der ein Selektor unsichtbar scheitert (§12.3)."
```

---

### Task 43: `_lib/checkNutzlast.ts` — die Nutzlast aus der Komponente heraus

**Files:**
- Create: `src/app/m/lagerbuch/_lib/checkNutzlast.ts`
- Test: `src/app/m/lagerbuch/_lib/checkNutzlast.test.ts`

**Interfaces:**
- Consumes: `_lib/domain/verfall.ts` (T28) — `verfallStatus`, `type VerfallSchwellen`;
  `_lib/konstanten.ts` (T4) — `MONAT_REGEX`, `type Zustand`, `ZUSTAENDE`.
- Produces:
  ```ts
  export type CheckPositionEingabe = { id: string; artikelId: string; soll: number };
  export type CheckGeraetEingabe = { id: string };
  export type CheckFlascheEingabe = { id: string; nennfuelldruckBar: number };
  export type CheckGeraetAntwort = { vorhanden: boolean; zustand: Zustand; bemerkung?: string };
  export type CheckZaehlung = {
    ist: Record<string, number | undefined>;
    nachfuell: Record<string, number | undefined>;
    geraete: Record<string, CheckGeraetAntwort | undefined>;
    druck: Record<string, number | undefined>;
    /** NUR die GEAENDERTEN — ein fehlender Eintrag laesst die Angabe unangetastet. */
    verfaelle: Record<string, string | null | undefined>;
  };
  export type CheckNutzlast = {
    fahrzeugId: string;
    positionen: { sollPositionId: string; ist: number; nachfuellMenge: number }[];
    geraete: { geraetId: string; vorhanden: boolean; zustand: Zustand; bemerkung?: string }[];
    flaschen: { flascheId: string; druckBar: number }[];
    verfaelle: { artikelId: string; verfall: string | null }[];
  };
  export const GERAET_VORBELEGUNG: CheckGeraetAntwort;
  export function checkNutzlast(args: {
    fahrzeugId: string; positionen: CheckPositionEingabe[];
    geraete: CheckGeraetEingabe[]; flaschen: CheckFlascheEingabe[]; z: CheckZaehlung;
  }): CheckNutzlast;
  export function zaehleAblaufende(verfaelle: Record<string, string | null | undefined>,
    schwellen: VerfallSchwellen, now: Date): number;
  ```
  Konsumenten: `_ui/CheckFlow.tsx` (Teil 4, §7.9) und `_actions/check.ts` (Teil 4, **nur die Typen**).

**Warum die Nutzlast aus der Komponente gehoben wird** (§12.1, Punkt 1). Das Verfallsfeld im
Zählschritt (`CheckFlow.tsx:281`) und die Live-Vorschau `{n} laufen ab` (`:306`) sind **die einzige
Absicherung ihrer Fachlichkeit** — `actions/check.test.ts:229` beweist nur, dass der Server richtig
zählt, **wenn** der Wert ankommt. Ob er ankommt, prüft heute nichts.

**Die vier Vorbelegungen, die 1:1 bleiben** (§5.8.1, §5.15 Punkte 1, 2, 4, 5, 6):

| Vorbelegung | Beleg | Warum sie bleibt |
|---|---|---|
| Ist = **Soll** (`ist[p.id] ?? p.soll`) | `CheckFlow.tsx:97` | Konvention „voll annehmen, Gezähltes runterkorrigieren" (`:94-96`), im Text der Oberfläche ausgeschrieben und testverankert |
| Es werden **alle** Positionen gesendet | `:146` | dito |
| Gerät: `{vorhanden: true, zustand: "In Ordnung"}` | `:25` | dito |
| Druck = **Nennfülldruck** | `:137` | dito |

⚠️ **Was das kostet, steht hier, damit es niemand später „entdeckt"** (§5.8.1): serverseitig ist
„gezählt und stimmt" von „nicht gezählt" **nicht unterscheidbar**. Ein durchgeklickter Check erzeugt
einen positiven, plausibel aussehenden Nachweis und — wenn der recorded Bestand abwich — eine
Korrekturbuchung in ein Journal, das **weder `UPDATE` noch `DELETE`** kennt. Variante (c) (ein
`gezaehlt: boolean` je Position) ist die einzige, die den fehlenden Nachweis nachrüstet; sie ist
**Backlog, nicht Spec 1** (§15), und sie ist hier benannt, damit sie eine Entscheidung bleibt und
nicht als Nebenwirkung stattfindet.

⚠️ **Die Verfälle sind die EINE Ausnahme: nur GEÄNDERTE werden gesendet** (`CheckFlow.tsx:153-155`).
Ein fehlender Eintrag heißt „unangetastet" (`check.ts:151-152`), `""`/`null` heißt „löschen". Wer das
mit der Alles-senden-Konvention der übrigen Listen „vereinheitlicht", löscht bei jedem Check jede
Verfallsangabe, die niemand angefasst hat.

⚠️ **`nachfuellMenge` wird hier NICHT geklemmt.** Die Klemmung auf `max(0, soll − ist)` ist
**serverseitig** (`check.ts:95`) und bleibt es; der Client-Deckel (`max={luecke}`) ist Bequemlichkeit
vor dem Serverfehler. Eine zweite Klemmung hier verdeckte, ob die serverseitige noch da ist.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/checkNutzlast.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { checkNutzlast, zaehleAblaufende, GERAET_VORBELEGUNG,
         type CheckZaehlung } from "./checkNutzlast";
import { ausZivilzeit } from "./zeit";

const LEER: CheckZaehlung = { ist: {}, nachfuell: {}, geraete: {}, druck: {}, verfaelle: {} };
const BASIS = {
  fahrzeugId: "rtw-1",
  positionen: [
    { id: "sp1", artikelId: "a1", soll: 4 },
    { id: "sp2", artikelId: "a1", soll: 2 },   // DERSELBE Artikel, zweites Fach
    { id: "sp3", artikelId: "a2", soll: 1 },
  ],
  geraete: [{ id: "g1" }, { id: "g2" }],
  flaschen: [{ id: "f1", nennfuelldruckBar: 200 }, { id: "f2", nennfuelldruckBar: 300 }],
};

describe("checkNutzlast — die vier Vorbelegungen (§5.8.1)", () => {
  it("Ist ist auf SOLL vorbelegt", () => {
    // `ist[p.id] ?? p.soll` (CheckFlow.tsx:97). Konvention: „voll annehmen,
    // Gezaehltes runterkorrigieren".
    const n = checkNutzlast({ ...BASIS, z: LEER });
    expect(n.positionen).toEqual([
      { sollPositionId: "sp1", ist: 4, nachfuellMenge: 0 },
      { sollPositionId: "sp2", ist: 2, nachfuellMenge: 0 },
      { sollPositionId: "sp3", ist: 1, nachfuellMenge: 0 },
    ]);
  });

  it("ein gezaehlter Wert schlaegt die Vorbelegung — auch die 0", () => {
    // `?? p.soll`, NICHT `|| p.soll`: eine gezaehlte 0 ist eine Aussage („Fach
    // leer"), und `||` machte daraus wieder das Soll.
    const n = checkNutzlast({ ...BASIS, z: { ...LEER, ist: { sp1: 0 } } });
    expect(n.positionen[0]).toEqual({ sollPositionId: "sp1", ist: 0, nachfuellMenge: 0 });
  });

  it("es werden ALLE Positionen gesendet, auch unveraenderte", () => {
    expect(checkNutzlast({ ...BASIS, z: { ...LEER, ist: { sp2: 1 } } }).positionen).toHaveLength(3);
  });

  it("Geraete sind auf {vorhanden: true, zustand: 'In Ordnung'} vorbelegt", () => {
    const n = checkNutzlast({ ...BASIS, z: LEER });
    expect(GERAET_VORBELEGUNG).toEqual({ vorhanden: true, zustand: "In Ordnung" });
    expect(n.geraete).toEqual([
      { geraetId: "g1", vorhanden: true, zustand: "In Ordnung" },
      { geraetId: "g2", vorhanden: true, zustand: "In Ordnung" },
    ]);
  });

  it("Druck ist auf den NENNFUELLDRUCK vorbelegt — je Flasche verschieden", () => {
    expect(checkNutzlast({ ...BASIS, z: LEER }).flaschen).toEqual([
      { flascheId: "f1", druckBar: 200 },
      { flascheId: "f2", druckBar: 300 },
    ]);
  });

  it("ein abgelesener Druck von 0 schlaegt die Vorbelegung", () => {
    expect(checkNutzlast({ ...BASIS, z: { ...LEER, druck: { f1: 0 } } }).flaschen[0])
      .toEqual({ flascheId: "f1", druckBar: 0 });
  });
});

describe("checkNutzlast — die Verfaelle sind die EINE Ausnahme", () => {
  it("sendet NUR die geaenderten", () => {
    /**
     * `CheckFlow.tsx:153-155`. Ein FEHLENDER Eintrag heisst „unangetastet"
     * (`check.ts:151-152`). Wer das mit der Alles-senden-Konvention der uebrigen
     * Listen „vereinheitlicht", LOESCHT bei jedem Check jede Verfallsangabe, die
     * niemand angefasst hat.
     */
    const n = checkNutzlast({ ...BASIS, z: { ...LEER, verfaelle: { a1: "2026-09" } } });
    expect(n.verfaelle).toEqual([{ artikelId: "a1", verfall: "2026-09" }]);
  });

  it("ein LEERER String wird zu null — das ist 'loeschen', nicht 'unangetastet'", () => {
    expect(checkNutzlast({ ...BASIS, z: { ...LEER, verfaelle: { a1: "" } } }).verfaelle)
      .toEqual([{ artikelId: "a1", verfall: null }]);
    expect(checkNutzlast({ ...BASIS, z: { ...LEER, verfaelle: { a2: null } } }).verfaelle)
      .toEqual([{ artikelId: "a2", verfall: null }]);
  });

  it("`undefined` wird gar nicht gesendet", () => {
    expect(checkNutzlast({ ...BASIS, z: { ...LEER, verfaelle: { a1: undefined } } }).verfaelle)
      .toEqual([]);
  });

  it("wirft einen formal falschen Monat gar nicht erst ein", () => {
    // Der Server lehnt ihn ohnehin ab (MONAT_REGEX in der Zod-Form, Teil 4). Hier
    // wird er ausgelassen, damit ein Tippfehler nicht den GANZEN Check-Abschluss
    // ablehnt — die uebrigen Angaben sind davon unberuehrt.
    const n = checkNutzlast({ ...BASIS, z: { ...LEER, verfaelle: { a1: "2026-13", a2: "2026-09" } } });
    expect(n.verfaelle).toEqual([{ artikelId: "a2", verfall: "2026-09" }]);
  });
});

describe("checkNutzlast — nachfuellMenge wird hier NICHT geklemmt", () => {
  it("reicht den Wert durch, auch wenn er ueber der Luecke liegt", () => {
    /**
     * Die Klemmung auf max(0, soll − ist) ist SERVERSEITIG (`check.ts:95`) und
     * bleibt es; der Client-Deckel (`max={luecke}`) ist Bequemlichkeit vor dem
     * Serverfehler (§5.15, Punkt 8). Eine zweite Klemmung hier verdeckte, ob die
     * serverseitige noch da ist.
     */
    const n = checkNutzlast({ ...BASIS, z: { ...LEER, ist: { sp1: 4 }, nachfuell: { sp1: 99 } } });
    expect(n.positionen[0]).toEqual({ sollPositionId: "sp1", ist: 4, nachfuellMenge: 99 });
  });
});

describe("zaehleAblaufende — die Live-Vorschau '{n} laufen ab'", () => {
  const NOW = ausZivilzeit(2026, 6, 15, 12, 0, 0, 0);
  const S = { rotTage: 31, gelbTage: 56 };

  it("zaehlt jede gemeldete Angabe, deren Ampel NICHT gruen ist", () => {
    expect(zaehleAblaufende(
      { a1: "2026-06", a2: "2026-07", a3: "2028-01" }, S, NOW,
    )).toBe(2);
  });

  it("ignoriert leere und geloeschte Angaben", () => {
    expect(zaehleAblaufende({ a1: "", a2: null, a3: undefined }, S, NOW)).toBe(0);
  });

  it("ignoriert formal falsche Monate, statt zu werfen", () => {
    // Die Vorschau laeuft bei JEDEM Tastendruck. Ein Wurf hier braeche die
    // Eingabe waehrend des Tippens ab — „2026-1" ist ein Zwischenzustand.
    expect(zaehleAblaufende({ a1: "2026-1", a2: "2026-06" }, S, NOW)).toBe(1);
  });

  it("zaehlt die Pseudo-Charge nicht mit", () => {
    expect(zaehleAblaufende({ a1: "2099-12" }, S, NOW)).toBe(0);
  });
});
```

- [ ] **Schritt 2: Test rot sehen, dann `_lib/checkNutzlast.ts` schreiben**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/checkNutzlast.test.ts   # FAIL: resolve "./checkNutzlast"
```

```ts
/**
 * Die Nutzlast des Fahrzeug-Check-Abschlusses, aus der Komponente gehoben.
 *
 * KEIN "use client": die Typen liest auch `_actions/check.ts` (Teil 4), und ein
 * Wert aus einem Client-Modul kaeme dort als Client-Referenz an (Falle 6).
 *
 * WARUM SIE GEHOBEN WIRD (§12.1, Punkt 1): das Verfallsfeld im Zaehlschritt
 * (`CheckFlow.tsx:281`) und die Live-Vorschau `{n} laufen ab` (`:306`) sind die
 * EINZIGE Absicherung ihrer Fachlichkeit — `actions/check.test.ts:229` beweist
 * nur, dass der Server richtig zaehlt, WENN der Wert ankommt. Ob er ankommt,
 * prueft heute nichts.
 *
 * ⚠️ WAS DIE VORBELEGUNGEN KOSTEN, steht hier, damit es niemand spaeter
 * „entdeckt" (§5.8.1): serverseitig ist „gezaehlt und stimmt" von „nicht
 * gezaehlt" NICHT unterscheidbar. Ein durchgeklickter Check erzeugt einen
 * positiven, plausibel aussehenden Nachweis und — wenn der recorded Bestand
 * abwich — eine Korrekturbuchung in ein Journal, das weder UPDATE noch DELETE
 * kennt. Variante (c) (ein `gezaehlt: boolean` je Position) ist die einzige, die
 * das nachruestet; sie ist BACKLOG, nicht Spec 1 (§15), und sie steht hier, damit
 * sie eine Entscheidung bleibt und nicht als Nebenwirkung stattfindet.
 */
import { verfallStatus, type VerfallSchwellen } from "./domain/verfall";
import { MONAT_REGEX, type Zustand } from "./konstanten";

export type CheckPositionEingabe = { id: string; artikelId: string; soll: number };
export type CheckGeraetEingabe = { id: string };
export type CheckFlascheEingabe = { id: string; nennfuelldruckBar: number };

export type CheckGeraetAntwort = { vorhanden: boolean; zustand: Zustand; bemerkung?: string };

/** `CheckFlow.tsx:25`. 1:1 (§5.15, Punkt 4). */
export const GERAET_VORBELEGUNG: CheckGeraetAntwort = { vorhanden: true, zustand: "In Ordnung" };

export type CheckZaehlung = {
  ist: Record<string, number | undefined>;
  nachfuell: Record<string, number | undefined>;
  geraete: Record<string, CheckGeraetAntwort | undefined>;
  druck: Record<string, number | undefined>;
  /** ⚠️ NUR die GEAENDERTEN. Ein fehlender Eintrag laesst die Angabe
   *  unangetastet; `""`/`null` LOESCHT sie. */
  verfaelle: Record<string, string | null | undefined>;
};

export type CheckNutzlast = {
  fahrzeugId: string;
  positionen: { sollPositionId: string; ist: number; nachfuellMenge: number }[];
  geraete: { geraetId: string; vorhanden: boolean; zustand: Zustand; bemerkung?: string }[];
  flaschen: { flascheId: string; druckBar: number }[];
  verfaelle: { artikelId: string; verfall: string | null }[];
};

/**
 * Baut die Nutzlast aus Zaehlwerten und gemeldeten Verfaellen.
 *
 * DREI LISTEN WERDEN VOLLSTAENDIG GESENDET (Positionen, Geraete, Flaschen), die
 * VIERTE nur teilweise. Das ist kein Versehen: der Server prueft bei Geraeten und
 * Flaschen die ZUGEHOERIGKEIT (`check.ts:128`, `:139`), nicht die
 * Vollstaendigkeit — und bei den Verfaellen heisst ein fehlender Eintrag
 * ausdruecklich „unangetastet" (`check.ts:151-152`).
 *
 * ⚠️ `nachfuellMenge` WIRD HIER NICHT GEKLEMMT. Die Klemmung auf
 * `max(0, soll − ist)` ist serverseitig (`check.ts:95`) und bleibt es. Eine
 * zweite Klemmung hier verdeckte, ob die serverseitige noch da ist.
 */
export function checkNutzlast(args: {
  fahrzeugId: string;
  positionen: CheckPositionEingabe[];
  geraete: CheckGeraetEingabe[];
  flaschen: CheckFlascheEingabe[];
  z: CheckZaehlung;
}): CheckNutzlast {
  const { fahrzeugId, positionen, geraete, flaschen, z } = args;
  return {
    fahrzeugId,
    // `?? p.soll`, NICHT `|| p.soll`: eine gezaehlte 0 ist eine Aussage („Fach
    // leer"), und `||` machte daraus wieder das Soll.
    positionen: positionen.map((p) => ({
      sollPositionId: p.id,
      ist: z.ist[p.id] ?? p.soll,
      nachfuellMenge: z.nachfuell[p.id] ?? 0,
    })),
    geraete: geraete.map((g) => {
      const a = z.geraete[g.id] ?? GERAET_VORBELEGUNG;
      return {
        geraetId: g.id, vorhanden: a.vorhanden, zustand: a.zustand,
        ...(a.bemerkung ? { bemerkung: a.bemerkung } : {}),
      };
    }),
    flaschen: flaschen.map((f) => ({
      flascheId: f.id,
      druckBar: z.druck[f.id] ?? f.nennfuelldruckBar,
    })),
    verfaelle: Object.entries(z.verfaelle)
      // `undefined` = unangetastet und wird GAR NICHT gesendet.
      .filter(([, v]) => v !== undefined)
      // Formal falsche Monate werden AUSGELASSEN statt gesendet: der Server lehnt
      // sie ohnehin ab, und ein Tippfehler soll nicht den GANZEN Check-Abschluss
      // ablehnen — die uebrigen Angaben sind davon unberuehrt.
      .filter(([, v]) => !v || MONAT_REGEX.test(v))
      .map(([artikelId, v]) => ({ artikelId, verfall: v ? v : null })),
  };
}

/**
 * Die Live-Vorschau „{n} laufen ab" (`CheckFlow.tsx:306`): wie viele der GERADE
 * gemeldeten Verfaelle nicht gruen sind.
 *
 * ⚠️ SIE WIRFT NIE. Die Vorschau laeuft bei JEDEM Tastendruck; ein Wurf braeche
 * die Eingabe waehrend des Tippens ab — „2026-1" ist ein Zwischenzustand, kein
 * Fehler.
 */
export function zaehleAblaufende(
  verfaelle: Record<string, string | null | undefined>,
  schwellen: VerfallSchwellen,
  now: Date,
): number {
  let n = 0;
  for (const v of Object.values(verfaelle)) {
    if (!v || !MONAT_REGEX.test(v)) continue;
    if (verfallStatus(v, schwellen, now).ampel !== "gruen") n += 1;
  }
  return n;
}
```

- [ ] **Schritt 3: Test grün, Gates und Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/checkNutzlast.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/checkNutzlast.ts src/app/m/lagerbuch/_lib/checkNutzlast.test.ts
git commit -m "feat(lagerbuch): _lib/checkNutzlast.ts — die Nutzlast aus CheckFlow gehoben

§12.1, Punkt 1: das Verfallsfeld im Zaehlschritt und die Vorschau '{n} laufen ab'
sind heute die einzige Absicherung ihrer Fachlichkeit — der Action-Test beweist
nur, dass der Server richtig zaehlt, WENN der Wert ankommt.

Die vier Vorbelegungen bleiben 1:1 (Ist=Soll, alle Positionen, Geraet 'In
Ordnung', Druck=Nennfuelldruck). Was das kostet, steht als Kommentar in der Datei:
'gezaehlt und stimmt' ist serverseitig von 'nicht gezaehlt' nicht unterscheidbar.
Variante (c) ist Backlog und benannt, nicht vergessen.

Die Verfaelle sind die EINE Ausnahme: nur GEAENDERTE werden gesendet, ein
fehlender Eintrag heisst 'unangetastet'. Wer das vereinheitlicht, loescht bei
jedem Check jede Angabe, die niemand angefasst hat.

nachfuellMenge wird hier NICHT geklemmt — die Klemmung ist serverseitig und eine
zweite verdeckte, ob die erste noch da ist."
```

---

### Task 44: `_lib/lesepfade/bestand.ts` — vier Aggregate, und `lagerort_id` bleibt im Prädikat

**Files:**
- Create: `src/app/m/lagerbuch/_lib/lesepfade/bestand.ts`
- Test: `src/app/m/lagerbuch/_db/aggregate.test.ts`

**Interfaces:**
- Consumes: `_db/client.ts` (T12) — `type DB`; `_db/schema.ts` (T7) — `buchungen`, `artikel`,
  `chargen`; `_lib/konstanten.ts` (T4) — `HANDLAGER_ID`; `_lib/domain/verfall.ts` (T28) —
  `verfallStatus`, `verfallSchwellen`; `_lib/domain/vorschlag.ts` (T31) — `braucht`;
  `_db/testdb.ts` (T9, nur für den Test); `_lib/domain/bestand.ts` (T29, **nur für den Test** — als
  Differenz-Referenz).
- Produces:
  ```ts
  export type Leser = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

  export function bestandJeArtikel(db: Leser, lagerortId: string): Map<string, number>;
  export function restJeCharge(db: Leser, lagerortId: string): Map<string, number>;
  export function bestandJeArtikelUndLagerort(db: Leser): Map<string, Map<string, number>>;
  export function restJeChargeFuerArtikel(db: Leser, artikelId: string,
                                          lagerortId: string): Map<string, number>;

  export type Kennzahlen = {
    unterMindest: number; nichtBestellt: number;
    chargenKritisch: number; chargenAbgelaufen: number; buchungenGesamt: number;
  };
  export function kennzahlen(db: Leser, now?: Date): Kennzahlen;
  ```
  Konsumenten: `_lib/lesepfade/artikel.ts` (T45), `fahrzeuge.ts` (T48), `bestellung.ts` (T50),
  `verfall.ts` (T47), `_lib/schreibpfade/abbuchung.ts` (T54), `korrektur.ts` (T58).

**`Leser` ist ein Typ, kein Umweg.** Alle vier Aggregate laufen sowohl auf der echten Verbindung
(Leseseite) als auch **innerhalb** einer offenen Transaktion (`fefoAbbuchung`, `korrekturAufLagerort`).
⚠️ **T54 definiert denselben Ausdruck ein zweites Mal unter dem Namen `Tx`** — 1:1 aus
`lagerbuch/src/db/abbuchung.ts:9`. Das ist kein Widerspruch: beide leiten sich aus **derselben**
`DB["transaction"]`-Signatur ab und sind strukturell identisch. Ein `import` von `Tx` aus einem
Schreibpfad in einen Lesepfad wäre die falsche Richtung.

**Entscheidung 7, Variante (b)** (§5.2.4): der Bestand bleibt **rein rekonstruktiv**, aber jede
Rechnung aus §5.2.3 (b) wird durch **eine** aggregierende SQL-Abfrage ersetzt. Vier Lesepfade laden
`buchungen` heute **komplett** in den Prozess und filtern danach **je Artikel** erneut über die ganze
Liste — O(N_Artikel · N_Buchungen). Bei 100 000 Buchungszeilen sind das 0,4 bis 1 Sekunde, und
`better-sqlite3` ist **synchron**: die Übersichtsseite blockiert für diese Zeit **die gesamte
Suite**.

⚠️ **DIE EINE ZEILE, AN DER DIE UMSTELLUNG SCHEITERN KANN — und sie scheitert STILL:**
`lagerort_id` **muss** im Prädikat bleiben. Ohne den Lagerortbezug zählt nach der ersten
Fahrzeugbuchung derselben Charge der Fahrzeugbestand als Handlager-Rest mit → **Phantombestand** und
falsche FEFO-Verteilung. **In einer frisch migrierten Test-DB ist das unsichtbar**, weil dort
Handlager- und Fahrzeugbestand identisch sind. Genau deshalb fährt `_db/aggregate.test.ts` die
Konstellation aus `bestand.ts:22-24` ausdrücklich: **dieselbe `chargeId` gleichzeitig im Handlager
und in einem Fahrzeug**, und ein Artikel mit Buchungen an **drei** Lagerorten.

⚠️ **Die zweite stille Bruchstelle:** `sql<number>` mit `sum(...)` liefert bei leerer Gruppe **keine
Zeile**, nicht `0` (§5.2.4, Punkt 3). Heute liefert `bestandProLagerort` für einen Artikel ohne
Buchungen `0`, morgen **fehlt der Schlüssel**. Jede Map-Abfrage geht über `?? 0`.

**Die drei Indizes, auf denen das läuft** (Teil 1, T7; §4.14): `idx_buchungen_lagerort_artikel`
trägt `bestandJeArtikel` und `restJeCharge`; `idx_buchungen_artikel_lagerort_charge` trägt
`restJeChargeFuerArtikel` (die **Schreibseite**, die mit `artikel_id` **führend** filtert). ⚠️ Sie
sind **nicht** redundant zueinander: sie unterscheiden sich in der führenden Spalte, und genau daran
entscheidet SQLite, ob ein Index für eine `WHERE`-Klausel taugt.

**`kennzahlen` heißt ein Feld anders** (§5.5). `queries.ts:139-141` zählt `offeneBestellungen` genau
dann hoch, wenn ein Artikel unter Mindestbestand liegt **und `bestelltAt` NICHT gesetzt ist** — also
die Zahl der **noch nicht** bestellten Positionen. Die Oberfläche beschriftet sie mit „offene
Bestellpositionen", was jeder Leser als „bestellt, noch nicht geliefert" versteht. **Entschieden:**
das Feld heißt `nichtBestellt`, die Beschriftung lautet „unter Mindestbestand, noch nicht bestellt"
(Auflage an Teil 5). **Die Zahl bleibt dieselbe** — das ist die Korrektur einer Fehlbenennung, kein
Verhaltensbruch.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_db/aggregate.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "./schema";
import {
  bestandJeArtikel, restJeCharge, bestandJeArtikelUndLagerort,
  restJeChargeFuerArtikel, kennzahlen,
} from "../_lib/lesepfade/bestand";
import {
  bestandProLagerort, bestandProLagerortUndCharge,
} from "../_lib/domain/bestand";
import { HANDLAGER_ID } from "../_lib/konstanten";

/**
 * DER DIFFERENZTEST AUS §5.2.4.
 *
 * Jedes Aggregat schuldet einen Vergleich gegen SEINE REINE FUNKTION: derselbe
 * Zeilenbestand, einmal ueber SQL, einmal ueber die Vollladung — beide Ergebnisse
 * identisch. Die reinen Funktionen bleiben damit DIE SPEZIFIKATION und sind nicht
 * bloss Tests, die nichts mehr bewachen.
 *
 * ⚠️ ZWEI KONSTELLATIONEN SIND PFLICHT, weil ohne sie ein weggelassenes
 * `lagerort_id`-Praedikat GRUEN BLIEBE (§5.2.1, §5.19.5):
 *   1. DIESELBE chargeId gleichzeitig im Handlager UND in einem Fahrzeug
 *      (die Konstellation aus `bestand.ts:22-24`);
 *   2. ein Artikel mit Buchungen an DREI Lagerorten.
 * In einer frisch migrierten Test-DB sind Handlager- und Fahrzeugbestand sonst
 * identisch, und der Fehler ist unsichtbar.
 */

/**
 * DIE VERFALLSSCHWELLEN WERDEN AUSDRUECKLICH GEPINNT.
 *
 * Der Pfad ruft `verfallSchwellen()` ohne Argument, liest also `process.env` —
 * und dieser Test behauptet konkrete Ampelwerte. Ein Entwickler mit
 * `LAGERBUCH_VERFALL_ROT_TAGE=7` in seiner Shell bekaeme sonst eine rote Datei
 * mit einer Meldung, die nichts erklaert. Teil 2 hat die Regel in
 * `grenzen.test.ts` aufgeschrieben: „Der Test darf nicht davon abhaengen, was in
 * der Entwicklerumgebung zufaellig gesetzt ist."
 *
 * `vi.stubEnv`/`vi.unstubAllEnvs` ist das etablierte Muster des Repos fuer genau
 * diesen Fall (`core/bootstrap.test.ts`, `devLogin.test.ts`) — `process.env.X = …`
 * scheitert an Nexts `readonly`-Augmentierung.
 *
 * ⚠️ NICHT „vereinfachen". Ohne den Pin ist die Datei rennabhaengig gruen.
 */
function pinneSchwellen(): void {
  vi.stubEnv("LAGERBUCH_VERFALL_ROT_TAGE", "31");
  vi.stubEnv("LAGERBUCH_VERFALL_GELB_TAGE", "56");
}

const RTW1 = "rtw-1";
const RTW2 = "rtw-2";

let t: TestDb;

beforeEach(() => {
  pinneSchwellen();
  t = migrierteTestDb("lagerbuch-aggregate-");
  const jetzt = new Date("2026-06-15T10:00:00Z");

  t.db.insert(lagerorte).values([
    { id: RTW1, name: "RTW 1", typ: "fahrzeug", kennung: "MS-DRK-1", aktiv: true },
    { id: RTW2, name: "RTW 2", typ: "fahrzeug", kennung: "MS-DRK-2", aktiv: true },
  ]).run();

  t.db.insert(artikel).values([
    { id: "a1", name: "Verbandpäckchen", einheit: "Stk.", fach: "A1",
      mindestbestand: 20, aktiv: true, createdAt: jetzt },
    { id: "a2", name: "NaCl 500", einheit: "Fl.", fach: "B2",
      mindestbestand: 5, aktiv: true, createdAt: jetzt, bestelltAt: jetzt },
    { id: "a3", name: "Ohne Buchung", einheit: "Stk.", fach: "C3",
      mindestbestand: 0, aktiv: true, createdAt: jetzt },
  ]).run();

  t.db.insert(chargen).values([
    { id: "c1", artikelId: "a1", chargenNr: "CH-1", verfall: "2026-07", createdAt: jetzt },
    { id: "c2", artikelId: "a1", chargenNr: "CH-2", verfall: "2028-01", createdAt: jetzt },
    { id: "c3", artikelId: "a2", chargenNr: "CH-3", verfall: "2020-01", createdAt: jetzt },
  ]).run();

  const b = (artikelId: string, chargeId: string, lagerortId: string, menge: number) => ({
    id: newId(), ts: jetzt, typ: "zugang" as const, artikelId, chargeId, lagerortId, menge,
    quelleTyp: "system" as const, quelleId: "test", referenz: null, kommentar: null,
  });

  t.db.insert(buchungen).values([
    // a1 / c1 an DREI Lagerorten — die Konstellation, die das Scoping noetig macht.
    b("a1", "c1", HANDLAGER_ID, 10),
    b("a1", "c1", HANDLAGER_ID, -3),
    b("a1", "c1", RTW1, 4),
    b("a1", "c1", RTW2, 1),
    // a1 / c2 nur im Handlager
    b("a1", "c2", HANDLAGER_ID, 5),
    // a2 / c3 nur im Fahrzeug — der Handlager-Bestand ist 0 UND es fehlt die Zeile
    b("a2", "c3", RTW1, 2),
  ]).run();
});

afterEach(() => {
  t.schliessen();
  vi.unstubAllEnvs();
});

/** Alle Buchungszeilen als reine Objekte — die Vollladung, gegen die verglichen wird. */
function alleZeilen() {
  return t.db.select().from(buchungen).all()
    .map((x) => ({ lagerortId: x.lagerortId, chargeId: x.chargeId,
                   artikelId: x.artikelId, menge: x.menge }));
}

describe("bestandJeArtikel — dieselbe Zahl wie bestandProLagerort", () => {
  it("Handlager: 12 fuer a1, 0 fuer a2", () => {
    const m = bestandJeArtikel(t.db, HANDLAGER_ID);
    const roh = alleZeilen();
    for (const id of ["a1", "a2", "a3"]) {
      expect(m.get(id) ?? 0, `Artikel ${id}`)
        .toBe(bestandProLagerort(roh.filter((r) => r.artikelId === id), HANDLAGER_ID));
    }
    expect(m.get("a1")).toBe(12);   // 10 − 3 + 5, OHNE die 4 aus RTW1 und die 1 aus RTW2
  });

  it("Fahrzeug: nur die Fahrzeugzeilen", () => {
    expect(bestandJeArtikel(t.db, RTW1).get("a1")).toBe(4);
    expect(bestandJeArtikel(t.db, RTW1).get("a2")).toBe(2);
    expect(bestandJeArtikel(t.db, RTW2).get("a1")).toBe(1);
  });

  it("ein Artikel OHNE Buchung fehlt in der Map — `?? 0` ist Pflicht", () => {
    /**
     * ⚠️ DIE STILLE BRUCHSTELLE DER UMSTELLUNG (§5.2.4, Punkt 3): `sum()` liefert
     * bei leerer Gruppe KEINE ZEILE, nicht 0. Heute liefert `bestandProLagerort`
     * fuer einen Artikel ohne Buchungen 0, morgen fehlt der Schluessel.
     */
    const m = bestandJeArtikel(t.db, HANDLAGER_ID);
    expect(m.has("a3")).toBe(false);
    expect(m.get("a3") ?? 0).toBe(0);
  });

  it("ein unbekannter Lagerort liefert eine LEERE Map", () => {
    expect(bestandJeArtikel(t.db, "gibtsnicht").size).toBe(0);
  });
});

describe("restJeCharge — dieselbe Zahl wie bestandProLagerortUndCharge", () => {
  it("fuehrt DIESELBE chargeId an drei Lagerorten getrennt", () => {
    const roh = alleZeilen();
    for (const ort of [HANDLAGER_ID, RTW1, RTW2]) {
      const sql = restJeCharge(t.db, ort);
      const rein = bestandProLagerortUndCharge(roh, ort);
      expect([...rein.keys()].sort(), `Lagerort ${ort}`).toEqual([...sql.keys()].sort());
      for (const [k, v] of rein) expect(sql.get(k), `${ort}/${k}`).toBe(v);
    }
    expect(restJeCharge(t.db, HANDLAGER_ID).get("c1")).toBe(7);   // 10 − 3
    expect(restJeCharge(t.db, RTW1).get("c1")).toBe(4);
    expect(restJeCharge(t.db, RTW2).get("c1")).toBe(1);
  });
});

describe("bestandJeArtikelUndLagerort — EINE Abfrage fuer die Fahrzeugliste", () => {
  it("schluesselt AUSSEN nach Lagerort und INNEN nach Artikel", () => {
    // Die Reihenfolge ist Vertrag: die Fahrzeugliste iteriert Fahrzeuge und
    // schlaegt darin Artikel nach. Umgedreht braeuchte sie je Fahrzeug eine
    // Schleife ueber alle Artikel.
    const m = bestandJeArtikelUndLagerort(t.db);
    expect(m.get(HANDLAGER_ID)?.get("a1")).toBe(12);
    expect(m.get(RTW1)?.get("a1")).toBe(4);
    expect(m.get(RTW1)?.get("a2")).toBe(2);
    expect(m.get(RTW2)?.get("a1")).toBe(1);
    expect(m.get(RTW2)?.has("a2")).toBe(false);
  });

  it("liefert fuer JEDEN Lagerort dieselben Zahlen wie die Vollladung", () => {
    const m = bestandJeArtikelUndLagerort(t.db);
    const roh = alleZeilen();
    for (const ort of [HANDLAGER_ID, RTW1, RTW2]) {
      for (const id of ["a1", "a2", "a3"]) {
        expect(m.get(ort)?.get(id) ?? 0, `${ort}/${id}`)
          .toBe(bestandProLagerort(roh.filter((r) => r.artikelId === id), ort));
      }
    }
  });
});

describe("restJeChargeFuerArtikel — der Lesepfad des Schreibwegs", () => {
  it("liefert nur die Chargen DIESES Artikels an DIESEM Lagerort", () => {
    const m = restJeChargeFuerArtikel(t.db, "a1", HANDLAGER_ID);
    expect([...m.keys()].sort()).toEqual(["c1", "c2"]);
    expect(m.get("c1")).toBe(7);
    expect(m.get("c2")).toBe(5);
  });

  it("stimmt mit bestandProLagerortUndCharge ueber die Vollladung ueberein", () => {
    /**
     * ⚠️ DIESE ZEILE IST DER GRUND, WARUM `fefoAbbuchung` UEBERHAUPT UMGESTELLT
     * WIRD: `abbuchung.ts:38` laedt heute ALLE Buchungen des Artikels OHNE
     * Lagerort-Praedikat und filtert erst in JS. Das Praedikat wandert damit
     * erstmals in die Abfrage.
     */
    const roh = alleZeilen().filter((r) => r.artikelId === "a1");
    const rein = bestandProLagerortUndCharge(roh, HANDLAGER_ID);
    const sql = restJeChargeFuerArtikel(t.db, "a1", HANDLAGER_ID);
    expect([...sql.keys()].sort()).toEqual([...rein.keys()].sort());
    for (const [k, v] of rein) expect(sql.get(k)).toBe(v);
  });

  it("liefert eine LEERE Map fuer einen Artikel ohne Buchung an diesem Ort", () => {
    expect(restJeChargeFuerArtikel(t.db, "a2", HANDLAGER_ID).size).toBe(0);
    expect(restJeChargeFuerArtikel(t.db, "a3", HANDLAGER_ID).size).toBe(0);
  });
});

describe("kennzahlen", () => {
  const NOW = new Date("2026-06-15T10:00:00Z");

  it("zaehlt unter Mindestbestand gegen den HANDLAGER-Bestand", () => {
    // a1: 12 < 20  → unter Mindestbestand
    // a2:  0 <  5  → unter Mindestbestand (die 2 liegen im RTW und zaehlen NICHT)
    // a3:  0 <  0  → nein (strikt kleiner)
    expect(kennzahlen(t.db, NOW).unterMindest).toBe(2);
  });

  it("`nichtBestellt` zaehlt die NOCH NICHT bestellten, und heisst deshalb so", () => {
    /**
     * §5.5: `queries.ts:139-141` nennt das Feld `offeneBestellungen` und zaehlt
     * genau dann hoch, wenn ein Artikel unter Mindestbestand liegt UND bestelltAt
     * NICHT gesetzt ist. Die Oberflaeche beschriftet es „offene Bestellpositionen",
     * was jeder Leser als „bestellt, noch nicht geliefert" versteht. Die ZAHL
     * bleibt dieselbe — nur der Name wird wahr.
     */
    // a1 ist unter Mindestbestand und NICHT bestellt; a2 ist unter Mindestbestand
    // UND bestellt (bestelltAt gesetzt).
    expect(kennzahlen(t.db, NOW).nichtBestellt).toBe(1);
  });

  it("zaehlt Chargen mit HANDLAGER-Rest > 0, getrennt nach kritisch und abgelaufen", () => {
    // c1 (2026-07, Rest 7 im Handlager) → kritisch
    // c2 (2028-01, Rest 5)              → gruen, zaehlt nicht
    // c3 (2020-01) liegt NUR im RTW     → Handlager-Rest 0, zaehlt NICHT
    const k = kennzahlen(t.db, NOW);
    expect(k.chargenKritisch).toBe(1);
    expect(k.chargenAbgelaufen).toBe(0);
  });

  it("eine abgelaufene Charge MIT Handlager-Rest zaehlt in chargenAbgelaufen", () => {
    t.db.insert(buchungen).values({
      id: newId(), ts: NOW, typ: "zugang", artikelId: "a2", chargeId: "c3",
      lagerortId: HANDLAGER_ID, menge: 3, quelleTyp: "system", quelleId: "test",
      referenz: null, kommentar: null,
    }).run();
    const k = kennzahlen(t.db, NOW);
    expect(k.chargenAbgelaufen).toBe(1);
    expect(k.chargenKritisch).toBe(1);   // c1 unveraendert
  });

  it("zaehlt ALLE Buchungszeilen, lagerort-uebergreifend", () => {
    expect(kennzahlen(t.db, NOW).buchungenGesamt).toBe(6);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/aggregate.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "../_lib/lesepfade/bestand"`.

- [ ] **Schritt 3: `_lib/lesepfade/bestand.ts` schreiben**

```ts
/**
 * Die vier Bestandsaggregate — Entscheidung 7, Variante (b) (§5.2.4).
 *
 * Kein "use client". Sie werden von Server Components und von Server Actions
 * gelesen.
 *
 * WAS SIE ERSETZEN. Vier Lesepfade laden `buchungen` heute KOMPLETT in den Prozess
 * und filtern danach JE ARTIKEL erneut ueber die ganze Liste:
 * O(N_Artikel · N_Buchungen) (§5.2.3 b). Bei 100 000 Buchungszeilen sind das 0,4
 * bis 1 Sekunde — und `better-sqlite3` ist SYNCHRON: die Uebersichtsseite
 * blockiert fuer diese Zeit die GESAMTE Suite. Portal, qr, feedback und files
 * antworten in dieser Zeit nicht. Die Grenze ist damit suiteweit, nicht
 * modulintern.
 *
 * ⚠️ DER BESTAND BLEIBT REKONSTRUKTIV. Es gibt keinen zweiten Wahrheitsspeicher;
 * eine materialisierte Bestandstabelle (Variante c) widerspricht der Leitplanke
 * und ist verworfen (§13).
 *
 * ⚠️ `lagerort_id` MUSS IM PRAEDIKAT BLEIBEN. Ohne den Lagerortbezug zaehlt nach
 * der ersten Fahrzeugbuchung derselben Charge der Fahrzeugbestand als
 * Handlager-Rest mit → PHANTOMBESTAND und falsche FEFO-Verteilung
 * (`lagerbuch/src/lib/domain/bestand.ts:22-24`). In einer frisch migrierten
 * Test-DB ist das UNSICHTBAR, weil dort beide Bestaende identisch sind —
 * `_db/aggregate.test.ts` faehrt deshalb ausdruecklich dieselbe chargeId an drei
 * Lagerorten.
 *
 * ⚠️ `sum()` LIEFERT BEI LEERER GRUPPE KEINE ZEILE, NICHT 0 (§5.2.4, Punkt 3).
 * Jede Map-Abfrage geht ueber `?? 0`. Heute liefert `bestandProLagerort` fuer
 * einen Artikel ohne Buchungen 0, morgen fehlt der Schluessel.
 *
 * ⚠️ DIE REINEN FUNKTIONEN IN `_lib/domain/bestand.ts` BLEIBEN DIE SPEZIFIKATION.
 * Jedes Aggregat hier schuldet einen Differenztest gegen sie (§5.2.4, Punkt 2).
 */
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { artikel, buchungen, chargen } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { verfallStatus, verfallSchwellen } from "../domain/verfall";
import { braucht } from "../domain/vorschlag";

/**
 * Alles, was `select()` kann — die echte Verbindung ODER eine offene Transaktion.
 *
 * ⚠️ `_lib/schreibpfade/abbuchung.ts` definiert denselben Ausdruck ein zweites
 * Mal unter dem Namen `Tx` (1:1 aus `lagerbuch/src/db/abbuchung.ts:9`). Beide
 * leiten sich aus DERSELBEN `DB["transaction"]`-Signatur ab und sind strukturell
 * identisch; ein Import von `Tx` aus einem Schreibpfad in einen Lesepfad waere die
 * falsche Richtung.
 */
export type Leser = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Bestand je Artikel AN EINEM Lagerort. Ersetzt jede `allBu.filter()`-Schleife.
 * Index: `idx_buchungen_lagerort_artikel` (§4.14).
 */
export function bestandJeArtikel(db: Leser, lagerortId: string): Map<string, number> {
  const rows = db
    .select({ artikelId: buchungen.artikelId, summe: sql<number>`sum(${buchungen.menge})` })
    .from(buchungen)
    .where(eq(buchungen.lagerortId, lagerortId))
    .groupBy(buchungen.artikelId)
    .all();
  return new Map(rows.map((r) => [r.artikelId, r.summe]));
}

/**
 * Rest je Charge AN EINEM Lagerort. Ersetzt `bestandProLagerortUndCharge` ueber
 * die Vollladung. Index: `idx_buchungen_lagerort_artikel`.
 */
export function restJeCharge(db: Leser, lagerortId: string): Map<string, number> {
  const rows = db
    .select({ chargeId: buchungen.chargeId, summe: sql<number>`sum(${buchungen.menge})` })
    .from(buchungen)
    .where(eq(buchungen.lagerortId, lagerortId))
    .groupBy(buchungen.chargeId)
    .all();
  return new Map(rows.map((r) => [r.chargeId, r.summe]));
}

/**
 * Bestand je (Lagerort, Artikel) fuer ALLE Lagerorte — EINE Abfrage fuer die
 * Fahrzeuguebersicht (heute O(N_Fahrzeug · N_ArtikelImSoll · N_Buchungen)).
 *
 * ⚠️ DIE SCHACHTELUNG IST VERTRAG: AUSSEN der Lagerort, INNEN der Artikel. Die
 * Fahrzeugliste iteriert Fahrzeuge und schlaegt darin Artikel nach; umgedreht
 * braeuchte sie je Fahrzeug eine Schleife ueber alle Artikel.
 */
export function bestandJeArtikelUndLagerort(db: Leser): Map<string, Map<string, number>> {
  const rows = db
    .select({
      lagerortId: buchungen.lagerortId,
      artikelId: buchungen.artikelId,
      summe: sql<number>`sum(${buchungen.menge})`,
    })
    .from(buchungen)
    .groupBy(buchungen.lagerortId, buchungen.artikelId)
    .all();
  const m = new Map<string, Map<string, number>>();
  for (const r of rows) {
    let innen = m.get(r.lagerortId);
    if (!innen) { innen = new Map(); m.set(r.lagerortId, innen); }
    innen.set(r.artikelId, r.summe);
  }
  return m;
}

/**
 * Rest je Charge EINES Artikels AN EINEM Lagerort — der Lesepfad des Schreibwegs.
 * Index: `idx_buchungen_artikel_lagerort_charge` (§4.14).
 *
 * ⚠️ `abbuchung.ts:38` laedt heute ALLE Buchungen des Artikels OHNE
 * Lagerort-Praedikat und filtert erst in JS; `korrektur.ts:18-19` tut dasselbe.
 * Ein Fahrzeug-Check mit 60 Artikeln laedt damit die vollstaendige Historie von
 * 60 Artikeln zwei- bis dreimal. Mit dieser Funktion wandert das Praedikat
 * erstmals in die Abfrage.
 *
 * ⚠️ Der Index ist NICHT redundant zu `idx_buchungen_lagerort_artikel`: er fuehrt
 * `artikel_id` VORAN, und genau daran entscheidet SQLite, ob ein Index fuer eine
 * WHERE-Klausel taugt.
 */
export function restJeChargeFuerArtikel(
  db: Leser, artikelId: string, lagerortId: string,
): Map<string, number> {
  const rows = db
    .select({ chargeId: buchungen.chargeId, summe: sql<number>`sum(${buchungen.menge})` })
    .from(buchungen)
    .where(and(eq(buchungen.artikelId, artikelId), eq(buchungen.lagerortId, lagerortId)))
    .groupBy(buchungen.chargeId)
    .all();
  return new Map(rows.map((r) => [r.chargeId, r.summe]));
}

export type Kennzahlen = {
  /** Aktive Artikel, deren HANDLAGER-Bestand unter dem Mindestbestand liegt. */
  unterMindest: number;
  /**
   * Davon die NOCH NICHT bestellten.
   *
   * ⚠️ HIESS FRUEHER `offeneBestellungen` UND WAR FALSCH HERUM BENANNT (§5.5).
   * `queries.ts:139-141` zaehlt genau dann hoch, wenn ein Artikel unter
   * Mindestbestand liegt UND `bestelltAt` NICHT gesetzt ist — die Oberflaeche
   * beschriftet das mit „offene Bestellpositionen", was jeder Leser als
   * „bestellt, noch nicht geliefert" versteht. Die ZAHL bleibt dieselbe; nur der
   * Name wird wahr. Beschriftung ab Teil 5: „unter Mindestbestand, noch nicht
   * bestellt".
   */
  nichtBestellt: number;
  /** Chargen mit HANDLAGER-Rest > 0, deren Ampel gelb oder rot ist (aber nicht abgelaufen). */
  chargenKritisch: number;
  /** Chargen mit HANDLAGER-Rest > 0, die bereits abgelaufen sind. */
  chargenAbgelaufen: number;
  buchungenGesamt: number;
};

/**
 * Die KPI-Kacheln der Uebersicht — heute der teuerste JS-Term des Moduls
 * (`queries.ts:128` Vollladung, `:136-138` Filter je Artikel in der Schleife).
 *
 * ⚠️ ALLE VIER ZAEHLER BEZIEHEN SICH AUF DEN HANDLAGER (§5.2.1, normativ). Der
 * Mindestbestand ist eine Handlager-Nachschubschwelle; die Verfall-KPIs zaehlen
 * Handlager-Reste, konsistent mit `verfallListe()` und der Aussondern-Aktion
 * (beide handlager-gebunden). Fahrzeug-Chargen laufen ggf. dort ab und werden
 * ueber den naechsten Fahrzeug-Check bereinigt, nicht ueber die
 * Handlager-Verfallsliste.
 */
export function kennzahlen(db: Leser, now: Date = new Date()): Kennzahlen {
  const schwellen = verfallSchwellen();
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  const bestand = bestandJeArtikel(db, HANDLAGER_ID);
  const restProCharge = restJeCharge(db, HANDLAGER_ID);

  let unterMindest = 0;
  let nichtBestellt = 0;
  for (const a of arts) {
    if (!braucht(bestand.get(a.id) ?? 0, a.mindestbestand)) continue;
    unterMindest += 1;
    if (!a.bestelltAt) nichtBestellt += 1;
  }

  let chargenKritisch = 0;
  let chargenAbgelaufen = 0;
  for (const c of db.select().from(chargen).all()) {
    if ((restProCharge.get(c.id) ?? 0) <= 0) continue;   // aufgebraucht → kein Risiko
    const s = verfallStatus(c.verfall, schwellen, now);
    if (s.abgelaufen) chargenAbgelaufen += 1;
    else if (s.ampel !== "gruen") chargenKritisch += 1;
  }

  const gesamt = db
    .select({ n: sql<number>`count(*)` })
    .from(buchungen)
    .get();

  return {
    unterMindest, nichtBestellt, chargenKritisch, chargenAbgelaufen,
    buchungenGesamt: gesamt?.n ?? 0,
  };
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/aggregate.test.ts
```

- [ ] **Schritt 5: Die Mutationsprobe — das Prädikat weglassen**

⚠️ **Ohne diesen Schritt ist der Differenztest eine Absichtserklärung.** Entferne in
`restJeCharge` die Zeile `.where(eq(buchungen.lagerortId, lagerortId))` und fahre erneut:

```bash
pnpm vitest run src/app/m/lagerbuch/_db/aggregate.test.ts
```

Erwartet: **rot**, mit `expected 12 to be 7` (oder gleichwertig) im Fall „führt DIESELBE chargeId an
drei Lagerorten getrennt". Danach wiederherstellen und erneut grün fahren.

Zweite Mutation, ebenfalls einmal fahren: ersetze in `bestandJeArtikel` den Rückgabewert durch
`new Map(rows.map((r) => [r.artikelId, r.summe ?? 0]))` **und** ergänze künstlich einen Eintrag für
jeden Artikel — der Fall „ein Artikel OHNE Buchung fehlt in der Map" muss dann **rot** werden.

- [ ] **Schritt 6: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/lesepfade/bestand.ts src/app/m/lagerbuch/_db/aggregate.test.ts
git commit -m "feat(lagerbuch): _lib/lesepfade/bestand.ts — vier Aggregate, lagerort_id bleibt drin

Entscheidung 7 (b), §5.2.4: der Bestand bleibt rekonstruktiv, aber die vier
quadratischen JS-Terme werden durch je EINE aggregierende SQL-Abfrage ersetzt.
better-sqlite3 ist synchron — eine Uebersichtsseite, die 1 s rechnet, blockiert
fuer diese Sekunde die GESAMTE Suite.

Das Lagerort-Praedikat bleibt in JEDER Abfrage. Ohne es zaehlt der Fahrzeugbestand
als Handlager-Rest mit (Phantombestand), und in einer frisch migrierten Test-DB
ist das unsichtbar. _db/aggregate.test.ts faehrt deshalb dieselbe chargeId an DREI
Lagerorten und vergleicht jedes Aggregat gegen seine reine Funktion.

sum() liefert bei leerer Gruppe KEINE Zeile, nicht 0 — jede Map-Abfrage geht ueber
?? 0. Ein eigener Testfall haelt das fest.

kennzahlen.offeneBestellungen heisst ab jetzt nichtBestellt (§5.5): das Feld
zaehlt die NOCH NICHT bestellten Positionen; die Zahl bleibt dieselbe, nur der
Name wird wahr.

Mutationsproben (Praedikat weglassen, ?? 0 vorziehen) gefahren."
```

---

### Gate — Ende Welle 3

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
TZ=UTC pnpm vitest run src/app/m/lagerbuch/
```

---

## Welle 4 — Die neun übrigen Lesepfade (9 Tasks, alle parallel)

Alle neun konsumieren `_lib/lesepfade/bestand.ts` (T44), `_lib/format.ts` (T39) und die
Domänen-Module — und **keiner** den anderen. Jeder Task bringt seine eigene Testdatei neben der
Quelldatei mit; die vier `_db/*.test.ts` aus §5.19.2 gehören dagegen den Tasks, die ihre
Differenzaussage tragen (T44, T46, T54, T56 — Festlegung H7).

⚠️ **Für alle neun gilt:** kein `"use client"`, kein Icon-Import, und **jede** Bezugsgröße kommt aus
der normativen Tabelle §5.2.1. Wer einen Lagerort „vereinfacht", baut einen Verhaltensbruch, den kein
Gate findet.

---

### Task 45: `_lib/lesepfade/artikel.ts`

**Files:**
- Create: `src/app/m/lagerbuch/_lib/lesepfade/artikel.ts`
- Test: `src/app/m/lagerbuch/_lib/lesepfade/artikel.test.ts`

**Interfaces:**
- Consumes: `_db/client.ts` — `type DB`; `_db/schema.ts` — `artikel`, `buchungen`, `chargen`;
  `_lib/lesepfade/bestand.ts` (T44) — `type Leser`, `bestandJeArtikel`, `restJeCharge`;
  `_lib/konstanten.ts` — `HANDLAGER_ID`; `_lib/domain/verfall.ts` (T28); `_lib/domain/vorschlag.ts`
  (T31) — `braucht`; `_lib/format.ts` (T39) — `chargeText`; `_db/testdb.ts` (nur Test).
- Produces:
  ```ts
  export type ChargeZeile = { id: string; chargenNr: string; verfall: string; rest: number };
  export type ArtikelZeile = {
    id: string; name: string; einheit: string; fach: string; mindestbestand: number;
    bestand: number; aktiv: boolean; unterMindest: boolean; chargeKritisch: boolean;
    naechsteCharge: { chargenNr: string; verfall: string } | null;
  };
  export function chargenMitRest(db: Leser, artikelId: string,
                                 lagerortId?: string): ChargeZeile[];
  export function artikelListe(db: Leser, opts?: { inklInaktiv?: boolean }): ArtikelZeile[];
  export function artikelDetail(db: Leser, id: string, now?: Date): {
    artikel: typeof artikel.$inferSelect; bestand: number; chargen: ChargeZeile[];
    buchungen: { ts: Date; typ: string; menge: number;
                 kommentar: string | null; quelleId: string }[];
  } | null;
  export function artikelDetailHelfer(db: Leser, id: string, now?: Date): {
    id: string; name: string; einheit: string; fach: string; bestand: number;
    chargen: (ChargeZeile & { ampel: Ampel; text: string })[];
  } | null;
  ```
  Konsumenten: die Artikelliste und das Artikel-Detail (Teil 5), `/a/[artikelId]` (Teil 4).

**Was sich gegenüber `queries.ts:35-57` ändert — und was ausdrücklich nicht.** Die drei
Bezugsgrößen bleiben **Handlager** (`queries.ts:53`, `:67`, `:195`); der Buchungsverlauf im Detail
bleibt **lagerort-übergreifend** (`:62`, Begründung `:65-66` — er zeigt Umlagerungen aufs Fahrzeug
als Aktivität). Neu ist **nur** die Abfrageform: `artikelListe` fährt heute **3·N Abfragen**
(`:40`, `:29-30`); ab jetzt sind es **drei** — Artikel, Bestand je Artikel, Rest je Charge.

⚠️ **`unterMindest` und `chargeKritisch` werden VORGERECHNET.** `_lib/artikelFilter.ts` (T41) nimmt
sie als Feld entgegen, und das ist Absicht: eine Client-Insel darf keine Ampel rechnen — sie hat
weder `grenzen()` noch `now` in einer Form, die serverseitig entschieden wäre (§5.1, Falle 6).

- [ ] **Schritt 1: Test schreiben**

`src/app/m/lagerbuch/_lib/lesepfade/artikel.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import { artikelListe, artikelDetail, artikelDetailHelfer, chargenMitRest } from "./artikel";
import { HANDLAGER_ID } from "../konstanten";


/**
 * DIE VERFALLSSCHWELLEN WERDEN AUSDRUECKLICH GEPINNT.
 *
 * Der Pfad ruft `verfallSchwellen()` ohne Argument, liest also `process.env` —
 * und dieser Test behauptet konkrete Ampelwerte. Ein Entwickler mit
 * `LAGERBUCH_VERFALL_ROT_TAGE=7` in seiner Shell bekaeme sonst eine rote Datei
 * mit einer Meldung, die nichts erklaert. Teil 2 hat die Regel in
 * `grenzen.test.ts` aufgeschrieben: „Der Test darf nicht davon abhaengen, was in
 * der Entwicklerumgebung zufaellig gesetzt ist."
 *
 * `vi.stubEnv`/`vi.unstubAllEnvs` ist das etablierte Muster des Repos fuer genau
 * diesen Fall (`core/bootstrap.test.ts`, `devLogin.test.ts`) — `process.env.X = …`
 * scheitert an Nexts `readonly`-Augmentierung.
 *
 * ⚠️ NICHT „vereinfachen". Ohne den Pin ist die Datei rennabhaengig gruen.
 */
function pinneSchwellen(): void {
  vi.stubEnv("LAGERBUCH_VERFALL_ROT_TAGE", "31");
  vi.stubEnv("LAGERBUCH_VERFALL_GELB_TAGE", "56");
}

const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  pinneSchwellen();
  t = migrierteTestDb("lagerbuch-lp-artikel-");
  t.db.insert(lagerorte).values(
    { id: "rtw", name: "RTW", typ: "fahrzeug", kennung: null, aktiv: true }).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "Verbandpäckchen", einheit: "Stk.", fach: "A1",
      mindestbestand: 20, aktiv: true, createdAt: NOW },
    { id: "a2", name: "Alt", einheit: "Stk.", fach: "Z9",
      mindestbestand: 0, aktiv: false, createdAt: NOW },
  ]).run();
  t.db.insert(chargen).values([
    { id: "c-spaet", artikelId: "a1", chargenNr: "CH-SPAET", verfall: "2028-01", createdAt: NOW },
    { id: "c-frueh", artikelId: "a1", chargenNr: "CH-FRUEH", verfall: "2026-07", createdAt: NOW },
    { id: "c-leer", artikelId: "a1", chargenNr: "CH-LEER", verfall: "2026-06", createdAt: NOW },
  ]).run();
  const b = (chargeId: string, lagerortId: string, menge: number, typ = "zugang" as const) => ({
    id: newId(), ts: NOW, typ, artikelId: "a1", chargeId, lagerortId, menge,
    quelleTyp: "system" as const, quelleId: "test", referenz: null, kommentar: null,
  });
  t.db.insert(buchungen).values([
    b("c-spaet", HANDLAGER_ID, 5),
    b("c-frueh", HANDLAGER_ID, 7),
    b("c-frueh", "rtw", 4),                          // dieselbe Charge im Fahrzeug
    b("c-leer", HANDLAGER_ID, 2),
    b("c-leer", HANDLAGER_ID, -2, "entnahme"),       // aufgebraucht
  ]).run();
});
afterEach(() => {
  t.schliessen();
  vi.unstubAllEnvs();
});

describe("chargenMitRest — Handlager als Vorgabe", () => {
  it("rechnet den Rest je Charge NUR im Handlager", () => {
    const cs = chargenMitRest(t.db, "a1");
    expect(new Map(cs.map((c) => [c.id, c.rest]))).toEqual(
      new Map([["c-spaet", 5], ["c-frueh", 7], ["c-leer", 0]]));
  });
  it("liefert auf Wunsch den Rest an einem anderen Lagerort", () => {
    expect(chargenMitRest(t.db, "a1", "rtw").find((c) => c.id === "c-frueh")?.rest).toBe(4);
  });
  it("nennt jede Charge, auch die aufgebrauchte — mit rest 0, nicht fehlend", () => {
    expect(chargenMitRest(t.db, "a1")).toHaveLength(3);
  });
});

describe("artikelListe", () => {
  it("zeigt den HANDLAGER-Bestand, nicht die Summe ueber alle Lagerorte", () => {
    // 5 + 7 + 0 = 12. Die 4 im RTW zaehlen NICHT (§5.2.1).
    expect(artikelListe(t.db, {}, NOW).find((z) => z.id === "a1")?.bestand).toBe(12);
  });

  it("blendet inaktive Artikel per Vorgabe aus", () => {
    expect(artikelListe(t.db, {}, NOW).map((z) => z.id)).toEqual(["a1"]);
    expect(artikelListe(t.db, { inklInaktiv: true }, NOW).map((z) => z.id).sort())
      .toEqual(["a1", "a2"]);
  });

  it("naechsteCharge ist die frueheste mit REST > 0", () => {
    // c-leer (2026-06) ist frueher, aber aufgebraucht → c-frueh (2026-07).
    expect(artikelListe(t.db, {}, NOW).find((z) => z.id === "a1")?.naechsteCharge)
      .toEqual({ chargenNr: "CH-FRUEH", verfall: "2026-07" });
  });

  it("rechnet unterMindest und chargeKritisch VOR", () => {
    // Der Client-Filter (T41) nimmt beides als Feld — eine Client-Insel darf keine
    // Ampel rechnen (§5.1, Falle 6).
    const z = artikelListe(t.db, {}, NOW).find((x) => x.id === "a1")!;
    expect(z.unterMindest).toBe(true);      // 12 < 20
    expect(z.chargeKritisch).toBe(true);    // 2026-07 ist rot
  });

  it("liefert fuer einen Artikel ohne Buchung Bestand 0 und naechsteCharge null", () => {
    const z = artikelListe(t.db, { inklInaktiv: true }, NOW).find((x) => x.id === "a2")!;
    expect(z.bestand).toBe(0);
    expect(z.naechsteCharge).toBeNull();
    expect(z.unterMindest).toBe(false);     // 0 < 0 ist falsch (strikt)
  });
});

describe("artikelDetail", () => {
  it("zeigt den HANDLAGER-Bestand, aber den Verlauf LAGERORT-UEBERGREIFEND", () => {
    // `queries.ts:65-66`: der Verlauf zeigt auch Umlagerungen aufs Fahrzeug als
    // Aktivitaet. Wer ihn auf den Handlager filtert, macht Umlagerungen unsichtbar.
    const d = artikelDetail(t.db, "a1", NOW)!;
    expect(d.bestand).toBe(12);
    expect(d.buchungen).toHaveLength(5);
  });
  it("liefert null fuer eine unbekannte ID", () => {
    expect(artikelDetail(t.db, "gibtsnicht", NOW)).toBeNull();
  });
  it("deckelt den Verlauf auf acht Zeilen", () => {
    for (let i = 0; i < 10; i++) {
      t.db.insert(buchungen).values({
        id: newId(), ts: NOW, typ: "zugang", artikelId: "a1", chargeId: "c-spaet",
        lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "t",
        referenz: null, kommentar: null,
      }).run();
    }
    expect(artikelDetail(t.db, "a1", NOW)!.buchungen).toHaveLength(8);
  });
});

describe("artikelDetailHelfer", () => {
  it("zeigt nur Chargen mit REST > 0, aufsteigend nach Verfall, mit Chip-Text", () => {
    const d = artikelDetailHelfer(t.db, "a1", NOW)!;
    expect(d.chargen.map((c) => c.id)).toEqual(["c-frueh", "c-spaet"]);
    expect(d.chargen[0].ampel).toBe("rot");
    expect(d.chargen[0].text).toBe("läuft 07/26 ab");
    expect(d.bestand).toBe(12);
  });
  it("liefert null fuer eine unbekannte ID", () => {
    expect(artikelDetailHelfer(t.db, "x", NOW)).toBeNull();
  });
});
```

- [ ] **Schritt 2: Rot sehen, dann `_lib/lesepfade/artikel.ts` schreiben**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/artikel.test.ts   # FAIL: resolve "./artikel"
```

```ts
/**
 * Lesepfade rund um Artikel und Chargen. Kein "use client", kein Icon-Import.
 *
 * WAS SICH GEGENUEBER `queries.ts:35-71` AENDERT: nur die ABFRAGEFORM.
 * `artikelListe` faehrt heute 3·N Abfragen (`:40`, `:29-30`); ab jetzt sind es
 * drei — Artikel, Bestand je Artikel, Rest je Charge (§5.2.4).
 *
 * WAS SICH NICHT AENDERT (§5.2.1, normativ): Liste und Detail-Bestandszahl
 * rechnen HANDLAGER; der Buchungsverlauf im Detail bleibt
 * LAGERORT-UEBERGREIFEND, weil er Umlagerungen aufs Fahrzeug als Aktivitaet zeigt
 * (`queries.ts:65-66`). Wer ihn „konsistent" auf den Handlager filtert, macht
 * jede Umlagerung unsichtbar.
 */
import { desc, eq } from "drizzle-orm";
import { artikel, buchungen, chargen } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { verfallStatus, verfallSchwellen, type Ampel } from "../domain/verfall";
import { braucht } from "../domain/vorschlag";
import { chargeText } from "../format";
import { bestandJeArtikel, restJeCharge, type Leser } from "./bestand";

export type ChargeZeile = { id: string; chargenNr: string; verfall: string; rest: number };

export type ArtikelZeile = {
  id: string; name: string; einheit: string; fach: string; mindestbestand: number;
  bestand: number; aktiv: boolean;
  /** VORGERECHNET fuer `_lib/artikelFilter.ts` — eine Client-Insel darf keine
   *  Ampel rechnen (§5.1, Falle 6). */
  unterMindest: boolean;
  chargeKritisch: boolean;
  naechsteCharge: { chargenNr: string; verfall: string } | null;
};

/**
 * Chargen EINES Artikels mit Rest AN EINEM Lagerort (Vorgabe Handlager).
 *
 * ⚠️ AUFGEBRAUCHTE CHARGEN BLEIBEN IN DER LISTE, mit `rest: 0`. Das Artikel-Detail
 * zeigt sie (die Chargennummer ist ein Fundstueck), und `?? 0` macht aus der
 * fehlenden Aggregatzeile die 0.
 */
export function chargenMitRest(
  db: Leser, artikelId: string, lagerortId: string = HANDLAGER_ID,
): ChargeZeile[] {
  const chs = db.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  const rest = restJeCharge(db, lagerortId);
  return chs.map((c) => ({
    id: c.id, chargenNr: c.chargenNr, verfall: c.verfall, rest: rest.get(c.id) ?? 0,
  }));
}

export function artikelListe(
  db: Leser, opts: { inklInaktiv?: boolean } = {}, now: Date = new Date(),
): ArtikelZeile[] {
  const schwellen = verfallSchwellen();
  const arts = opts.inklInaktiv
    ? db.select().from(artikel).all()
    : db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  // DREI Abfragen statt 3·N: Artikel, Bestand je Artikel, Rest je Charge.
  const bestand = bestandJeArtikel(db, HANDLAGER_ID);
  const rest = restJeCharge(db, HANDLAGER_ID);
  const alleChargen = db.select().from(chargen).all();

  return arts.map((a) => {
    const b = bestand.get(a.id) ?? 0;
    const naechste = alleChargen
      .filter((c) => c.artikelId === a.id && (rest.get(c.id) ?? 0) > 0)
      .sort((x, y) => x.verfall.localeCompare(y.verfall))[0] ?? null;
    const s = naechste ? verfallStatus(naechste.verfall, schwellen, now) : null;
    return {
      id: a.id, name: a.name, einheit: a.einheit, fach: a.fach,
      mindestbestand: a.mindestbestand, aktiv: a.aktiv,
      // HANDLAGER, nicht die Summe ueber alle Lagerorte (§5.2.1).
      bestand: b,
      unterMindest: braucht(b, a.mindestbestand),
      chargeKritisch: s !== null && s.ampel !== "gruen",
      naechsteCharge: naechste ? { chargenNr: naechste.chargenNr, verfall: naechste.verfall } : null,
    };
  });
}

export function artikelDetail(db: Leser, id: string, _now: Date = new Date()) {
  const a = db.select().from(artikel).where(eq(artikel.id, id)).get();
  if (!a) return null;
  const bu = db
    .select().from(buchungen).where(eq(buchungen.artikelId, id))
    // Zweitsortierung nach `id`: `ts` sind UNIX-SEKUNDEN, und ein Check-Abschluss
    // schreibt mehrere Zeilen in DERSELBEN Sekunde (§5.14.4).
    .orderBy(desc(buchungen.ts), desc(buchungen.id))
    .all();
  return {
    artikel: a,
    bestand: bestandJeArtikel(db, HANDLAGER_ID).get(id) ?? 0,
    chargen: chargenMitRest(db, id),
    // LAGERORT-UEBERGREIFEND — siehe Kopfkommentar.
    buchungen: bu.slice(0, 8).map((b) => ({
      ts: b.ts, typ: b.typ, menge: b.menge, kommentar: b.kommentar, quelleId: b.quelleId,
    })),
  };
}

/** Die Helfer-Ansicht eines Artikels (`/a/[artikelId]`): nur Chargen mit Rest,
 *  aufsteigend nach Verfall, jede mit Ampel UND Text (§5.17, Punkt 3). */
export function artikelDetailHelfer(db: Leser, id: string, now: Date = new Date()) {
  const d = artikelDetail(db, id, now);
  if (!d) return null;
  const schwellen = verfallSchwellen();
  const cs = d.chargen
    .filter((c) => c.rest > 0)
    .map((c) => {
      const s = verfallStatus(c.verfall, schwellen, now);
      return { ...c, ampel: s.ampel as Ampel, text: chargeText(s, c.verfall) };
    })
    .sort((x, y) => x.verfall.localeCompare(y.verfall));
  return {
    id: d.artikel.id, name: d.artikel.name, einheit: d.artikel.einheit,
    fach: d.artikel.fach, bestand: d.bestand, chargen: cs,
  };
}
```

- [ ] **Schritt 3: Grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/artikel.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/lesepfade/artikel.ts src/app/m/lagerbuch/_lib/lesepfade/artikel.test.ts
git commit -m "feat(lagerbuch): _lib/lesepfade/artikel.ts — drei Abfragen statt 3·N

Liste und Detail-Bestandszahl rechnen HANDLAGER, der Buchungsverlauf bleibt
LAGERORT-UEBERGREIFEND (queries.ts:65-66) — wer ihn 'konsistent' filtert, macht
jede Umlagerung unsichtbar.

unterMindest und chargeKritisch werden vorgerechnet: die Client-Insel des
Artikelfilters darf keine Ampel rechnen (§5.1, Falle 6).

Der Verlauf sortiert ts DESC, id DESC — ts sind UNIX-Sekunden, ein
Check-Abschluss schreibt mehrere Zeilen in derselben Sekunde (§5.14.4)."
```

---

### Task 46: `_lib/lesepfade/journal.ts` — beide Suchhälften falten gleich, und der Deckel wird sichtbar

**Files:**
- Create: `src/app/m/lagerbuch/_lib/lesepfade/journal.ts`
- Test: `src/app/m/lagerbuch/_lib/lesepfade/journal.test.ts`
- Test: `src/app/m/lagerbuch/_db/suche.test.ts`

**Interfaces:**
- Consumes: `_db/client.ts` — `type DB`; `_db/schema.ts` — `artikel`, `buchungen`;
  `_db/quelle.ts` (T13) — `quelleAufloeser`; `_lib/suche.ts` (T5) — `falte`;
  `_lib/grenzen.ts` (T32) — `JOURNAL_GRENZE`; `_db/client.ts` — `type DB`.
  ⚠️ **Dieser Pfad nimmt `DB`, nicht `Leser`** — er läuft nie in einer Transaktion (Festlegung H11).
- Produces:
  ```ts
  export type BuchungTyp = "zugang" | "entnahme" | "korrektur" | "umlagerung";
  export type JournalFilter = { q?: string; typ?: BuchungTyp; von?: Date; bis?: Date;
                                grenze?: number };
  export type JournalZeileRoh = {
    id: string; ts: Date; artikelName: string; typ: BuchungTyp; menge: number;
    quelleId: string; quelleName: string; kommentar: string | null; referenz: string | null;
  };
  export type JournalErgebnis = { zeilen: JournalZeileRoh[]; mehrVorhanden: boolean };
  export function journalEintraege(db: DB, f?: JournalFilter): JournalErgebnis;
  ```
  Konsumenten: `/verwaltung/journal` (Teil 5) und die Artikel-Detail-Historie (Teil 5).

**Drei Änderungen gegenüber `queries.ts:86-123`, jede mit eigener Zusage:**

1. **Beide Suchhälften falten gleich** (§5.13.2). Der Kommentar wird über die registrierte
   SQL-Funktion **`lb_falte`** gesucht, der Artikelname in JS über **`falte`** — **dieselbe**
   Funktion. Heute laufen sie auseinander, sobald der Begriff einen Nicht-ASCII-Buchstaben enthält:
   `PÄCKCHEN` findet den Artikel und **verliert jeden Kommentar**, der `Päckchen` normal schreibt —
   **ohne Rückmeldung**, die Seite zeigt einfach weniger Zeilen.
2. **Der Deckel wird beobachtbar** (§5.14.3). Gelesen wird `JOURNAL_GRENZE + 1`, geliefert werden
   `JOURNAL_GRENZE`, und `mehrVorhanden` sagt, ob die Grenze **wirklich** griff. Heute schreibt
   `journal/page.tsx:32` „Zeigt die neuesten 100 Treffer" **unbedingt** — auch wenn drei Zeilen
   zurückkommen. **Es gibt im gesamten Modul heute keinen Weg herauszufinden, ob eine Grenze gerade
   zugeschlagen hat.**
3. **Die Sortierung bekommt einen Tiebreaker** (§5.14.4): `ORDER BY ts DESC, id DESC`, Index
   `idx_buchungen_ts_id`. `buchungen.ts` speichert UNIX-**Sekunden**; ein Check-Abschluss schreibt
   Abgleich, Umlagerung und Messungen in einem Rutsch — **alle teilen denselben Sekundenwert**, und
   welche Zeile oben steht, entscheidet danach die Datenbank. ⚠️ **Ehrlich zu sagen:** `buchungen.id`
   ist ein `nanoid()` und **nicht** zeitlich geordnet — der Tiebreaker liefert eine **totale**
   Ordnung, keine **kausale**. Er macht die Anzeige reproduzierbar; er stellt **nicht** her, dass
   „Abgleich vor Nachfüllung" steht. Wer die tatsächliche Reihenfolge braucht, liest die gemeinsame
   `referenz` (`check:<id>`) und die `typ`-Werte — deshalb steht `referenz` ab jetzt in der Zeile.

⚠️ **Die LIKE-Sonderzeichen `%`, `_` und `\` werden weiterhin escapt** (`queries.ts:99`), und zwar
**nach** dem Falten. Ohne das findet `5%` jeden Kommentar mit einer 5.

⚠️ **`ß`/`ss` wird ausdrücklich NICHT geheilt** (§5.13.2, §5.20). Gemessen ist
`'Straße' LIKE '%STRASSE%'` → 0, und `"STRASSE".toLowerCase()` ist `"strasse"`, was in `"straße"`
nicht vorkommt. Das ist **keine Divergenz zwischen den Hälften**, sondern eine **gemeinsame** Lücke —
eine Normalisierung, die `ß` auf `ss` faltet, erzeugt Treffer, die niemand gesucht hat
(„Massen"/„Maßen").

- [ ] **Schritt 1: Beide Tests schreiben**

`src/app/m/lagerbuch/_lib/lesepfade/journal.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, newId } from "../../_db/schema";
import { journalEintraege } from "./journal";
import { JOURNAL_GRENZE } from "../grenzen";
import { HANDLAGER_ID } from "../konstanten";

const T = (iso: string) => new Date(iso);
let t: TestDb;

function buche(p: { ts: Date; typ?: "zugang" | "entnahme" | "korrektur" | "umlagerung";
                    menge?: number; kommentar?: string | null; referenz?: string | null;
                    artikelId?: string; id?: string }) {
  t.db.insert(buchungen).values({
    id: p.id ?? newId(), ts: p.ts, typ: p.typ ?? "zugang",
    artikelId: p.artikelId ?? "a1", chargeId: "c1", lagerortId: HANDLAGER_ID,
    menge: p.menge ?? 1, quelleTyp: "system", quelleId: "system",
    referenz: p.referenz ?? null, kommentar: p.kommentar ?? null,
  }).run();
}

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-journal-");
  t.db.insert(artikel).values([
    { id: "a1", name: "Verbandpäckchen", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: T("2026-01-01T00:00:00Z") },
    { id: "a2", name: "NaCl", einheit: "Fl.", fach: "B2",
      mindestbestand: 0, aktiv: true, createdAt: T("2026-01-01T00:00:00Z") },
  ]).run();
  t.db.insert(chargen).values(
    { id: "c1", artikelId: "a1", chargenNr: "CH", verfall: "2030-01",
      createdAt: T("2026-01-01T00:00:00Z") }).run();
});
afterEach(() => t.schliessen());

describe("journalEintraege — der Deckel ist BEOBACHTBAR (§5.14.3)", () => {
  it("GRENZE Zeilen -> mehrVorhanden false", () => {
    for (let i = 0; i < JOURNAL_GRENZE; i++) buche({ ts: T("2026-06-01T10:00:00Z") });
    const e = journalEintraege(t.db);
    expect(e.zeilen).toHaveLength(JOURNAL_GRENZE);
    expect(e.mehrVorhanden).toBe(false);
  });

  it("GRENZE + 1 Zeilen -> mehrVorhanden true, geliefert werden GRENZE", () => {
    /**
     * ⚠️ DIE MUTATION, DIE DAS FAENGT (§5.19.3): `GRENZE + 1` auf `GRENZE`
     * zuruecksetzen. Heute schreibt `journal/page.tsx:32` „Zeigt die neuesten 100
     * Treffer" UNBEDINGT — auch wenn drei Zeilen zurueckkommen —, und es gibt im
     * gesamten Modul KEINEN Weg herauszufinden, ob eine Grenze zugeschlagen hat.
     */
    for (let i = 0; i < JOURNAL_GRENZE + 1; i++) buche({ ts: T("2026-06-01T10:00:00Z") });
    const e = journalEintraege(t.db);
    expect(e.zeilen).toHaveLength(JOURNAL_GRENZE);
    expect(e.mehrVorhanden).toBe(true);
  });

  it("respektiert eine kleinere Grenze aus dem Filter", () => {
    for (let i = 0; i < 5; i++) buche({ ts: T("2026-06-01T10:00:00Z") });
    expect(journalEintraege(t.db, { grenze: 3 }).zeilen).toHaveLength(3);
    expect(journalEintraege(t.db, { grenze: 3 }).mehrVorhanden).toBe(true);
  });
});

describe("journalEintraege — die Sortierung ist TOTAL (§5.14.4)", () => {
  it("sortiert ts absteigend und bei Gleichstand id absteigend", () => {
    /**
     * `buchungen.ts` speichert UNIX-SEKUNDEN. Ein Check-Abschluss schreibt
     * Abgleich, Umlagerung und Messungen in einem Rutsch — ALLE teilen denselben
     * Sekundenwert. Ohne Tiebreaker entscheidet die Datenbank, welche Zeile oben
     * steht, und eine zweite identische Anfrage kann eine andere Reihenfolge
     * liefern.
     */
    const gleich = T("2026-06-01T10:00:00Z");
    buche({ ts: gleich, id: "id-aaa" });
    buche({ ts: gleich, id: "id-bbb" });
    buche({ ts: gleich, id: "id-ccc" });
    expect(journalEintraege(t.db).zeilen.map((z) => z.id))
      .toEqual(["id-ccc", "id-bbb", "id-aaa"]);
  });

  it("liefert bei zwei identischen Anfragen DIESELBE Reihenfolge", () => {
    const gleich = T("2026-06-01T10:00:00Z");
    for (const id of ["a", "b", "c", "d", "e"]) buche({ ts: gleich, id: `id-${id}` });
    expect(journalEintraege(t.db).zeilen.map((z) => z.id))
      .toEqual(journalEintraege(t.db).zeilen.map((z) => z.id));
  });

  it("reicht `referenz` durch — sie ist die EINZIGE kausale Klammer", () => {
    // Der Tiebreaker liefert eine TOTALE Ordnung, keine KAUSALE: `buchungen.id`
    // ist ein nanoid() und nicht zeitlich geordnet. Wer die tatsaechliche
    // Reihenfolge braucht, liest `referenz` und `typ`.
    buche({ ts: T("2026-06-01T10:00:00Z"), referenz: "check:abc" });
    expect(journalEintraege(t.db).zeilen[0].referenz).toBe("check:abc");
  });
});

describe("journalEintraege — die Filter greifen VOR dem Limit", () => {
  it("filtert nach Typ", () => {
    buche({ ts: T("2026-06-01T10:00:00Z"), typ: "zugang" });
    buche({ ts: T("2026-06-01T11:00:00Z"), typ: "entnahme", menge: -1 });
    expect(journalEintraege(t.db, { typ: "entnahme" }).zeilen).toHaveLength(1);
  });

  it("filtert INKLUSIV nach von/bis", () => {
    buche({ ts: T("2026-06-01T00:00:00Z") });
    buche({ ts: T("2026-06-15T12:00:00Z") });
    buche({ ts: T("2026-06-30T23:59:59Z") });
    const e = journalEintraege(t.db, {
      von: T("2026-06-01T00:00:00Z"), bis: T("2026-06-30T23:59:59Z"),
    });
    expect(e.zeilen).toHaveLength(3);
  });

  it("sucht ueber die GANZE Historie, nicht nur im Limit-Fenster", () => {
    // `queries.ts:82-85`: die WHERE-Bedingungen greifen VOR dem LIMIT. Sonst
    // durchsuchte die Suche nur die neuesten 100 Zeilen — und faende bei einem
    // wachsenden Journal immer weniger.
    for (let i = 0; i < JOURNAL_GRENZE + 20; i++) {
      buche({ ts: new Date(T("2026-06-01T10:00:00Z").getTime() + i * 60_000) });
    }
    buche({ ts: T("2020-01-01T00:00:00Z"), kommentar: "uraltnadel" });
    const e = journalEintraege(t.db, { q: "uraltnadel" });
    expect(e.zeilen).toHaveLength(1);
    expect(e.mehrVorhanden).toBe(false);
  });
});

describe("journalEintraege — die aufgeloeste Quelle und der Artikelname", () => {
  it("nennt den Artikelnamen und faellt bei unbekanntem Artikel auf '–' zurueck", () => {
    buche({ ts: T("2026-06-01T10:00:00Z") });
    expect(journalEintraege(t.db).zeilen[0].artikelName).toBe("Verbandpäckchen");
  });
  it("loest quelleTyp 'system' auf 'System' auf", () => {
    buche({ ts: T("2026-06-01T10:00:00Z") });
    expect(journalEintraege(t.db).zeilen[0].quelleName).toBe("System");
  });
});
```

`src/app/m/lagerbuch/_db/suche.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, buchungen, chargen, newId } from "./schema";
import { journalEintraege } from "../_lib/lesepfade/journal";
import { falte } from "../_lib/suche";
import { HANDLAGER_ID } from "../_lib/konstanten";

/**
 * DER DIFFERENZTEST AUS §5.13.2.
 *
 * Die Journalsuche laeuft ueber ZWEI Haelften: der Artikelname in JavaScript
 * (`toLowerCase`, unicode-faehig), der Kommentar in SQL (`LIKE`, faltet NUR A–Z).
 * Gemessen gegen better-sqlite3 12.11.1 laufen sie genau dann auseinander, wenn
 * der Begriff einen NICHT-ASCII-Buchstaben enthaelt, dessen Gross-/Kleinschreibung
 * vom gespeicherten Text abweicht. `PÄCKCHEN` findet den Artikel und VERLIERT
 * JEDEN KOMMENTAR, der `Päckchen` normal schreibt — ohne Rueckmeldung, die Seite
 * zeigt einfach weniger Zeilen.
 *
 * Die Heilung ist die registrierte SQL-Funktion `lb_falte` (Teil 1, T12), die
 * DIESELBE `falte` benutzt wie die JS-Haelfte.
 *
 * ⚠️ DIESE DATEI LAEUFT GEGEN EINE ECHTE VERBINDUNG — `lb_falte` existiert nur
 * dort. Ein Mock traege die Aussage nicht.
 */
const NOW = new Date("2026-06-01T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-suche-");
  t.db.insert(artikel).values([
    { id: "a-paeck", name: "Verbandpäckchen", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a-strasse", name: "Straßenkarte", einheit: "Stk.", fach: "B2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
  t.db.insert(chargen).values([
    { id: "c1", artikelId: "a-paeck", chargenNr: "CH", verfall: "2030-01", createdAt: NOW },
    { id: "c2", artikelId: "a-strasse", chargenNr: "CH2", verfall: "2030-01", createdAt: NOW },
  ]).run();
  const b = (artikelId: string, chargeId: string, kommentar: string | null) => ({
    id: newId(), ts: NOW, typ: "zugang" as const, artikelId, chargeId,
    lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system" as const,
    quelleId: "system", referenz: null, kommentar,
  });
  t.db.insert(buchungen).values([
    b("a-paeck", "c1", "Nachschub Päckchen geliefert"),
    b("a-paeck", "c1", "NACHSCHUB PÄCKCHEN"),
    b("a-strasse", "c2", "Straße nachbestellt"),
    b("a-paeck", "c1", null),
  ]).run();
});
afterEach(() => t.schliessen());

/** Die JS-Haelfte, ausgeschrieben — sie ist die Referenz, gegen die die
 *  SQL-Haelfte gehalten wird. */
function jsTrifft(text: string | null, begriff: string): boolean {
  if (text === null) return false;
  return falte(text).includes(falte(begriff));
}

describe("lb_falte — die SQL-Haelfte faltet wie die JS-Haelfte", () => {
  it("SELECT lb_falte('Ä') liefert 'ä'", () => {
    // Die Grundzusage. Ohne sie ist alles Weitere gegenstandslos.
    const r = t.sqlite.prepare("select lb_falte(?) as f").get("Ä") as { f: string };
    expect(r.f).toBe("ä");
  });

  it("liefert null fuer null — ein Kommentar darf fehlen", () => {
    const r = t.sqlite.prepare("select lb_falte(?) as f").get(null) as { f: string | null };
    expect(r.f).toBeNull();
  });
});

describe("PÄCKCHEN in Grossschreibung — der Fall, der heute bricht", () => {
  it("findet BEIDE Kommentare UND den Artikel", () => {
    const zeilen = journalEintraege(t.db, { q: "PÄCKCHEN" }).zeilen;
    // Drei Zeilen des Artikels „Verbandpäckchen" (Namenstreffer) — davon zwei mit
    // Kommentar. Ohne lb_falte faende die SQL-Haelfte KEINEN der beiden.
    expect(zeilen).toHaveLength(3);
  });

  it("die SQL-Haelfte trifft GENAU dieselben Kommentare wie die JS-Haelfte", () => {
    /**
     * DER EIGENTLICHE DIFFERENZTEST: fuer JEDEN Kommentar im Korpus muss die
     * Trefferentscheidung beider Haelften uebereinstimmen. Geprueft ueber einen
     * Artikel, den der NAME nicht trifft — sonst verdeckte der Namenstreffer die
     * Kommentar-Haelfte.
     */
    for (const begriff of ["PÄCKCHEN", "päckchen", "Päckchen", "nachschub", "NACHSCHUB"]) {
      const perSql = t.sqlite
        .prepare("select kommentar from buchungen where lb_falte(kommentar) like ? escape '\\'")
        .all(`%${falte(begriff).replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
        .map((r) => (r as { kommentar: string }).kommentar);
      const perJs = (t.db.select().from(buchungen).all())
        .filter((b) => jsTrifft(b.kommentar, begriff))
        .map((b) => b.kommentar!);
      expect(perSql.sort(), `Begriff ${begriff}`).toEqual(perJs.sort());
    }
  });
});

describe("die Gegenprobe: ss/ß wird ausdruecklich NICHT geheilt", () => {
  it("STRASSE findet 'Straße' in KEINER der beiden Haelften", () => {
    /**
     * §5.13.2, §5.20: gemessen ist `'Straße' LIKE '%STRASSE%'` → 0, und
     * `"STRASSE".toLowerCase()` ist `"strasse"`, was in `"straße"` nicht vorkommt.
     * Das ist KEINE Divergenz zwischen den Haelften, sondern eine GEMEINSAME
     * Luecke — und sie bleibt: eine Normalisierung, die ß auf ss faltet, erzeugt
     * Treffer, die niemand gesucht hat („Massen"/„Maßen").
     */
    expect(journalEintraege(t.db, { q: "STRASSE" }).zeilen).toHaveLength(0);
    expect(jsTrifft("Straße nachbestellt", "STRASSE")).toBe(false);
  });

  it("STRASSE findet auch den ARTIKELNAMEN nicht — beide Haelften gleich blind", () => {
    expect(jsTrifft("Straßenkarte", "STRASSE")).toBe(false);
  });

  it("'Straße' in Kleinschreibung findet beide Seiten", () => {
    expect(journalEintraege(t.db, { q: "straße" }).zeilen.length).toBeGreaterThan(0);
  });
});

describe("LIKE-Sonderzeichen werden woertlich behandelt", () => {
  it("'%' findet nicht jeden Kommentar", () => {
    // `queries.ts:99`: ohne Escapen matcht „5%" jeden Kommentar mit einer 5.
    t.db.insert(buchungen).values({
      id: newId(), ts: NOW, typ: "zugang", artikelId: "a-paeck", chargeId: "c1",
      lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "system",
      referenz: null, kommentar: "Rabatt 5% erhalten",
    }).run();
    expect(journalEintraege(t.db, { q: "5%" }).zeilen).toHaveLength(1);
    expect(journalEintraege(t.db, { q: "%" }).zeilen).toHaveLength(1);
  });

  it("'_' ist kein Platzhalter", () => {
    t.db.insert(buchungen).values({
      id: newId(), ts: NOW, typ: "zugang", artikelId: "a-paeck", chargeId: "c1",
      lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "system",
      referenz: null, kommentar: "Los_42",
    }).run();
    expect(journalEintraege(t.db, { q: "Los_42" }).zeilen).toHaveLength(1);
    expect(journalEintraege(t.db, { q: "Los.42" }).zeilen).toHaveLength(0);
  });
});
```

- [ ] **Schritt 2: Beide Tests rot sehen, dann `_lib/lesepfade/journal.ts` schreiben**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/journal.test.ts src/app/m/lagerbuch/_db/suche.test.ts
```

```ts
/**
 * Das Buchungsjournal. Kein "use client", kein Icon-Import.
 *
 * DREI AENDERUNGEN GEGENUEBER `queries.ts:86-123`, jede mit eigener Zusage:
 *
 * 1. BEIDE SUCHHAELFTEN FALTEN GLEICH (§5.13.2). Der Kommentar geht ueber die
 *    registrierte SQL-Funktion `lb_falte` (Teil 1, T12), der Artikelname in JS
 *    ueber `falte` — DIESELBE Funktion. Heute laufen sie auseinander, sobald der
 *    Begriff einen Nicht-ASCII-Buchstaben enthaelt: `PÄCKCHEN` findet den Artikel
 *    und VERLIERT jeden Kommentar, der `Päckchen` normal schreibt. Ohne
 *    Rueckmeldung — die Seite zeigt einfach weniger Zeilen.
 * 2. DER DECKEL WIRD BEOBACHTBAR (§5.14.3). Gelesen wird GRENZE + 1, geliefert
 *    GRENZE, und `mehrVorhanden` sagt, ob die Grenze WIRKLICH griff. Heute
 *    schreibt `journal/page.tsx:32` „Zeigt die neuesten 100 Treffer" UNBEDINGT.
 * 3. DIE SORTIERUNG BEKOMMT EINEN TIEBREAKER (§5.14.4): ORDER BY ts DESC, id DESC,
 *    Index `idx_buchungen_ts_id`.
 *    ⚠️ EHRLICH ZU SAGEN: `buchungen.id` ist ein `nanoid()` und NICHT zeitlich
 *    geordnet. Der Tiebreaker liefert eine TOTALE Ordnung, keine KAUSALE — er
 *    macht die Anzeige reproduzierbar, stellt aber nicht her, dass „Abgleich vor
 *    Nachfuellung" steht. Wer die tatsaechliche Reihenfolge braucht, liest die
 *    gemeinsame `referenz` (`check:<id>`) und die `typ`-Werte; deshalb steht
 *    `referenz` ab jetzt in der Zeile.
 *
 * DIE WHERE-BEDINGUNGEN GREIFEN VOR DEM LIMIT (`queries.ts:82-85`): die Suche geht
 * ueber die GESAMTE Historie und liefert davon die neuesten Treffer. Umgekehrt
 * durchsuchte sie nur die neuesten 100 Zeilen und faende bei wachsendem Journal
 * immer weniger.
 */
import { and, desc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { artikel, buchungen } from "../../_db/schema";
import { quelleAufloeser } from "../../_db/quelle";
import { falte } from "../suche";
import { JOURNAL_GRENZE } from "../grenzen";
import type { DB } from "../../_db/client";

export type BuchungTyp = "zugang" | "entnahme" | "korrektur" | "umlagerung";

export type JournalFilter = {
  /** Freitext ueber Artikelname UND Kommentar. */
  q?: string;
  typ?: BuchungTyp;
  /** inklusive untere Zeitgrenze */
  von?: Date;
  /** inklusive obere Zeitgrenze (der Aufrufer setzt das Tagesende, §5.14.2) */
  bis?: Date;
  /** Vorgabe `JOURNAL_GRENZE`. Kein Produktionsaufrufer setzt sie; sie existiert
   *  fuer die Artikel-Detail-Historie und fuer Tests. */
  grenze?: number;
};

export type JournalZeileRoh = {
  id: string;
  ts: Date;
  artikelName: string;
  typ: BuchungTyp;
  menge: number;
  quelleId: string;
  quelleName: string;
  kommentar: string | null;
  /** NEU in der Zeile: die einzige KAUSALE Klammer (`check:<id>`,
   *  `inventur:<id>`, `entnahme-ziel:<lagerortId>`) — der id-Tiebreaker ist es
   *  ausdruecklich nicht (§5.14.4). */
  referenz: string | null;
};

export type JournalErgebnis = {
  zeilen: JournalZeileRoh[];
  /** ⚠️ Der Beschreibungstext ist BEDINGT: bei `true` „Neueste 100 von mehr
   *  Treffern — Zeitraum eingrenzen", sonst „N Treffer" (§5.14.3, Auflage an
   *  Teil 5). Heute gibt es im Modul keinen Weg herauszufinden, ob eine Grenze
   *  zugeschlagen hat. */
  mehrVorhanden: boolean;
};

export function journalEintraege(db: DB, f: JournalFilter = {}): JournalErgebnis {
  const grenze = f.grenze ?? JOURNAL_GRENZE;
  const alleArtikel = db.select().from(artikel).all();
  const namen = new Map(alleArtikel.map((a) => [a.id, a.name]));

  const conds: SQL[] = [];
  if (f.typ) conds.push(eq(buchungen.typ, f.typ));
  if (f.von) conds.push(gte(buchungen.ts, f.von));
  if (f.bis) conds.push(lte(buchungen.ts, f.bis));

  const term = f.q?.trim();
  if (term) {
    // BEIDE HAELFTEN UEBER DIESELBE `falte` (§5.13.2).
    const norm = falte(term);
    // LIKE-Sonderzeichen NACH dem Falten woertlich machen (`queries.ts:99`):
    // ohne das matcht „5%" jeden Kommentar mit einer 5.
    const escaped = norm.replace(/[\\%_]/g, (c) => `\\${c}`);
    const textConds: SQL[] = [
      sql`lb_falte(${buchungen.kommentar}) LIKE ${`%${escaped}%`} ESCAPE '\\'`,
    ];
    const treffer = alleArtikel.filter((a) => falte(a.name).includes(norm)).map((a) => a.id);
    if (treffer.length > 0) textConds.push(inArray(buchungen.artikelId, treffer));
    conds.push(or(...textConds)!);
  }

  // GRENZE + 1 lesen, GRENZE liefern — so ist „hat die Grenze gegriffen?"
  // beantwortbar, ohne eine zweite `count(*)`-Abfrage zu fahren.
  const rows = db
    .select()
    .from(buchungen)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(buchungen.ts), desc(buchungen.id))
    .limit(grenze + 1)
    .all();

  const mehrVorhanden = rows.length > grenze;
  const wer = quelleAufloeser(db);
  return {
    mehrVorhanden,
    zeilen: rows.slice(0, grenze).map((b) => ({
      id: b.id,
      ts: b.ts,
      artikelName: namen.get(b.artikelId) ?? "–",
      typ: b.typ,
      menge: b.menge,
      quelleId: b.quelleId,
      quelleName: wer(b.quelleTyp, b.quelleId),
      kommentar: b.kommentar,
      referenz: b.referenz,
    })),
  };
}
```

- [ ] **Schritt 3: Beide Tests grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/journal.test.ts src/app/m/lagerbuch/_db/suche.test.ts
```

- [ ] **Schritt 4: Zwei Mutationsproben (§5.19.3)**

1. Ersetze `lb_falte(${buchungen.kommentar})` durch `${buchungen.kommentar}` (die rohe Spalte).
   Erwartet: `_db/suche.test.ts` wird **rot** bei `PÄCKCHEN`.
2. Ersetze `.limit(grenze + 1)` durch `.limit(grenze)`. Erwartet: `journal.test.ts` wird **rot** bei
   „GRENZE + 1 Zeilen -> mehrVorhanden true".

Beide zurücknehmen.

- [ ] **Schritt 5: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/lesepfade/journal.ts \
        src/app/m/lagerbuch/_lib/lesepfade/journal.test.ts \
        src/app/m/lagerbuch/_db/suche.test.ts
git commit -m "feat(lagerbuch): _lib/lesepfade/journal.ts — gleiche Faltung, sichtbarer Deckel

§5.13.2: beide Suchhaelften gehen ueber DIESELBE falte — der Kommentar per
lb_falte in SQL, der Artikelname in JS. Heute laufen sie auseinander, sobald der
Begriff einen Nicht-ASCII-Buchstaben traegt: PÄCKCHEN findet den Artikel und
verliert jeden Kommentar, der Päckchen normal schreibt, ohne Rueckmeldung.

_db/suche.test.ts faehrt den Differenztest gegen eine ECHTE Verbindung (lb_falte
gibt es nur dort) — inklusive der Gegenprobe, dass ß/ss in BEIDEN Haelften nichts
findet und das ausdruecklich so bleibt.

§5.14.3: GRENZE + 1 lesen, GRENZE liefern, mehrVorhanden zurueckgeben. Heute
behauptet der Seitentext die 100 unbedingt, auch bei drei Zeilen.

§5.14.4: ORDER BY ts DESC, id DESC. ts sind UNIX-Sekunden — ein Check-Abschluss
schreibt alle Zeilen in derselben Sekunde. Der Tiebreaker ist TOTAL, nicht
KAUSAL; wer die echte Reihenfolge braucht, liest referenz, und die steht ab jetzt
in der Zeile.

Zwei Mutationsproben gefahren (rohe Spalte statt lb_falte, limit ohne +1)."
```

---

### Task 47: `_lib/lesepfade/verfall.ts` — zwei getrennte Quellen, und beide bleiben getrennt

**Files:**
- Create: `src/app/m/lagerbuch/_lib/lesepfade/verfall.ts`
- Test: `src/app/m/lagerbuch/_lib/lesepfade/verfall.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` — `artikel`, `chargen`, `lagerorte`, `lagerortVerfall`;
  `_lib/lesepfade/bestand.ts` — `type Leser`, `restJeCharge`; `_lib/konstanten.ts` — `HANDLAGER_ID`;
  `_lib/domain/verfall.ts` — `verfallStatus`, `verfallSchwellen`, `type Ampel`;
  `_lib/format.ts` — `chargeText`.
- Produces:
  ```ts
  export type VerfallEintrag = {
    chargeId: string; chargenNr: string; verfall: string; rest: number;
    ampel: Ampel; abgelaufen: boolean; text: string;
    artikelId: string; artikelName: string; einheit: string; fach: string };
  export type LagerortVerfallZeile = {
    lagerortId: string; lagerortName: string; lagerortKennung: string | null;
    artikelId: string; artikelName: string; einheit: string;
    verfall: string; erfasstAt: Date; ampel: Ampel; abgelaufen: boolean; text: string };
  export type VerfallAmLagerort = {
    artikelId: string; verfall: string; erfasstAt: Date;
    ampel: Ampel; abgelaufen: boolean; text: string };

  export function verfallListe(db: Leser, now?: Date): VerfallEintrag[];
  export function lagerortVerfallListe(db: Leser,
    opts?: { nurWarnend?: boolean; lagerortId?: string }, now?: Date): LagerortVerfallZeile[];
  export function verfallFuerLagerort(db: Leser, lagerortId: string,
    now?: Date): Map<string, VerfallAmLagerort>;
  ```
  Konsumenten: `/verwaltung/verfall` (Teil 5), `_lib/lesepfade/fahrzeuge.ts` (T48),
  `_actions/check.ts` (Teil 4, `verfallFuerLagerort`), `_actions/aussondern.ts` (Teil 5).

**Warum die beiden Quellen getrennt bleiben** (§5.6.2). Der **Chargen**-Verfall rechnet den Rest je
Charge **nur im Handlager** (`queries.ts:195-198`), und die Begründung steht im Quelltext: eine
komplett aufs Fahrzeug umgelagerte abgelaufene Charge erschiene sonst hier, und der
Aussondern-Knopf — der ausschließlich den **Handlager**-Rest bucht — würde **reproduzierbar
fehlschlagen**. Der **Lagerort**-Verfall (`lagerort_verfall`) trägt dagegen je (Lagerort, Artikel)
genau **einen** Wert: **das früheste Datum, das im Fahrzeug auf einer Packung steht** — nicht die
Charge. Er ist die Kompensation dafür, dass die Charge bei `korrekturAufLagerort` **geraten** wird
(§5.3.3, §4.11).

⚠️ **Die Rangfolgen sind verschieden und das ist Absicht.** `verfallListe` hat **drei** Ränge
(abgelaufen 0, rot 1, gelb 2) und blendet grün aus; `lagerortVerfallListe` hat **vier** (inkl. grün)
und ein **drittes** Kriterium `lagerortName`, weil dieselbe Ampel dort über mehrere Fahrzeuge
verteilt auftaucht.

- [ ] **Schritt 1: Test schreiben, rot sehen**

`src/app/m/lagerbuch/_lib/lesepfade/verfall.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, lagerortVerfall, newId } from "../../_db/schema";
import { verfallListe, lagerortVerfallListe, verfallFuerLagerort } from "./verfall";
import { HANDLAGER_ID } from "../konstanten";


/**
 * DIE VERFALLSSCHWELLEN WERDEN AUSDRUECKLICH GEPINNT.
 *
 * Der Pfad ruft `verfallSchwellen()` ohne Argument, liest also `process.env` —
 * und dieser Test behauptet konkrete Ampelwerte. Ein Entwickler mit
 * `LAGERBUCH_VERFALL_ROT_TAGE=7` in seiner Shell bekaeme sonst eine rote Datei
 * mit einer Meldung, die nichts erklaert. Teil 2 hat die Regel in
 * `grenzen.test.ts` aufgeschrieben: „Der Test darf nicht davon abhaengen, was in
 * der Entwicklerumgebung zufaellig gesetzt ist."
 *
 * `vi.stubEnv`/`vi.unstubAllEnvs` ist das etablierte Muster des Repos fuer genau
 * diesen Fall (`core/bootstrap.test.ts`, `devLogin.test.ts`) — `process.env.X = …`
 * scheitert an Nexts `readonly`-Augmentierung.
 *
 * ⚠️ NICHT „vereinfachen". Ohne den Pin ist die Datei rennabhaengig gruen.
 */
function pinneSchwellen(): void {
  vi.stubEnv("LAGERBUCH_VERFALL_ROT_TAGE", "31");
  vi.stubEnv("LAGERBUCH_VERFALL_GELB_TAGE", "56");
}

const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  pinneSchwellen();
  t = migrierteTestDb("lagerbuch-lp-verfall-");
  t.db.insert(lagerorte).values([
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", aktiv: true },
    { id: "rtw-2", name: "ELW", typ: "fahrzeug", kennung: "MS-2", aktiv: true },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a2", name: "NaCl", einheit: "Fl.", fach: "B2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
  t.db.insert(chargen).values([
    { id: "c-alt", artikelId: "a1", chargenNr: "ALT", verfall: "2020-01", createdAt: NOW },
    { id: "c-rot", artikelId: "a1", chargenNr: "ROT", verfall: "2026-07", createdAt: NOW },
    { id: "c-gelb", artikelId: "a1", chargenNr: "GELB", verfall: "2026-08", createdAt: NOW },
    { id: "c-gruen", artikelId: "a1", chargenNr: "GRUEN", verfall: "2029-01", createdAt: NOW },
    { id: "c-nurfzg", artikelId: "a2", chargenNr: "FZG", verfall: "2020-01", createdAt: NOW },
    { id: "c-pseudo", artikelId: "a2", chargenNr: "Korrektur", verfall: "2099-12", createdAt: NOW },
  ]).run();
  const b = (artikelId: string, chargeId: string, lagerortId: string, menge: number) => ({
    id: newId(), ts: NOW, typ: "zugang" as const, artikelId, chargeId, lagerortId, menge,
    quelleTyp: "system" as const, quelleId: "t", referenz: null, kommentar: null,
  });
  t.db.insert(buchungen).values([
    b("a1", "c-alt", HANDLAGER_ID, 3),
    b("a1", "c-rot", HANDLAGER_ID, 5),
    b("a1", "c-gelb", HANDLAGER_ID, 2),
    b("a1", "c-gruen", HANDLAGER_ID, 9),
    b("a2", "c-nurfzg", "rtw-1", 4),          // NUR im Fahrzeug
    b("a2", "c-pseudo", HANDLAGER_ID, 7),
  ]).run();
  t.db.insert(lagerortVerfall).values([
    { id: newId(), lagerortId: "rtw-1", artikelId: "a1", verfall: "2026-07",
      erfasstAt: NOW, quelleTyp: "token", quelleId: "111-111" },
    { id: newId(), lagerortId: "rtw-2", artikelId: "a1", verfall: "2026-07",
      erfasstAt: NOW, quelleTyp: "token", quelleId: "111-111" },
    { id: newId(), lagerortId: "rtw-1", artikelId: "a2", verfall: "2029-01",
      erfasstAt: NOW, quelleTyp: "oidc", quelleId: "sub-1" },
  ]).run();
});
afterEach(() => {
  t.schliessen();
  vi.unstubAllEnvs();
});

describe("verfallListe — Handlager-Rest, gruen ausgeblendet", () => {
  it("zeigt nur Chargen mit HANDLAGER-Rest > 0 und Ampel != gruen", () => {
    expect(verfallListe(t.db, NOW).map((e) => e.chargeId)).toEqual(["c-alt", "c-rot", "c-gelb"]);
  });

  it("laesst eine abgelaufene Charge WEG, die nur im Fahrzeug liegt", () => {
    /**
     * `queries.ts:192-194`: sonst erschiene sie hier, und der Aussondern-Knopf —
     * der ausschliesslich den HANDLAGER-Rest bucht — wuerde reproduzierbar
     * fehlschlagen.
     */
    expect(verfallListe(t.db, NOW).some((e) => e.chargeId === "c-nurfzg")).toBe(false);
  });

  it("laesst die Pseudo-Charge weg (2099-12 ist gruen)", () => {
    expect(verfallListe(t.db, NOW).some((e) => e.chargeId === "c-pseudo")).toBe(false);
  });

  it("sortiert in DREI Raengen: abgelaufen, rot, gelb — dann nach Verfall", () => {
    const l = verfallListe(t.db, NOW);
    expect(l[0].abgelaufen).toBe(true);
    expect(l[1].ampel).toBe("rot");
    expect(l[2].ampel).toBe("gelb");
  });

  it("traegt den Chip-Text und die Artikelangaben", () => {
    const e = verfallListe(t.db, NOW)[0];
    expect(e.text).toBe("abgelaufen");
    expect(e.artikelName).toBe("Verband");
    expect(e.einheit).toBe("Stk.");
    expect(e.fach).toBe("A1");
    expect(e.rest).toBe(3);
  });
});

describe("lagerortVerfallListe — vier Raenge, drittes Kriterium Lagerortname", () => {
  it("zeigt per Vorgabe ALLE Meldungen, auch gruene", () => {
    expect(lagerortVerfallListe(t.db, {}, NOW)).toHaveLength(3);
  });

  it("nurWarnend blendet gruen aus", () => {
    expect(lagerortVerfallListe(t.db, { nurWarnend: true }, NOW)).toHaveLength(2);
  });

  it("filtert auf einen Lagerort", () => {
    expect(lagerortVerfallListe(t.db, { lagerortId: "rtw-2" }, NOW)).toHaveLength(1);
  });

  it("sortiert bei gleichem Rang und gleichem Verfall nach LAGERORTNAME", () => {
    // rtw-1 heisst „RTW 1", rtw-2 heisst „ELW" — alphabetisch steht ELW vorn.
    const l = lagerortVerfallListe(t.db, { nurWarnend: true }, NOW);
    expect(l.map((z) => z.lagerortName)).toEqual(["ELW", "RTW 1"]);
  });

  it("traegt Kennung, Artikelangaben und erfasstAt", () => {
    const z = lagerortVerfallListe(t.db, { lagerortId: "rtw-1", nurWarnend: true }, NOW)[0];
    expect(z.lagerortKennung).toBe("MS-1");
    expect(z.artikelName).toBe("Verband");
    expect(z.erfasstAt.getTime()).toBe(NOW.getTime());
    expect(z.text).toBe("läuft 07/26 ab");
  });
});

describe("verfallFuerLagerort — je Artikel HOECHSTENS einer", () => {
  it("liefert eine Map, geschluesselt nach artikelId", () => {
    const m = verfallFuerLagerort(t.db, "rtw-1", NOW);
    expect([...m.keys()].sort()).toEqual(["a1", "a2"]);
    expect(m.get("a1")?.verfall).toBe("2026-07");
    expect(m.get("a1")?.ampel).toBe("rot");
    expect(m.get("a2")?.ampel).toBe("gruen");
  });

  it("liefert fuer einen Lagerort ohne Meldung eine LEERE Map", () => {
    expect(verfallFuerLagerort(t.db, "gibtsnicht", NOW).size).toBe(0);
  });
});
```

- [ ] **Schritt 2: `_lib/lesepfade/verfall.ts` schreiben**

```ts
/**
 * ZWEI GETRENNTE VERFALLSQUELLEN, und sie bleiben getrennt (§5.6.2).
 *
 * CHARGEN-VERFALL (`verfallListe`) rechnet den Rest je Charge NUR IM HANDLAGER.
 * Die Begruendung steht im Alt-Quelltext (`queries.ts:192-194`): eine komplett
 * aufs Fahrzeug umgelagerte abgelaufene Charge erschiene sonst hier, und der
 * Aussondern-Knopf — der ausschliesslich den Handlager-Rest bucht — wuerde
 * REPRODUZIERBAR FEHLSCHLAGEN. Dieselbe Bindung gilt fuer die KPIs (T44).
 *
 * LAGERORT-VERFALL (`lagerortVerfallListe`, `verfallFuerLagerort`) traegt je
 * (Lagerort, Artikel) genau EINEN Wert: DAS FRUEHESTE DATUM, DAS IM FAHRZEUG AUF
 * EINER PACKUNG STEHT — nicht die Charge. Er ist die Kompensation dafuer, dass
 * `korrekturAufLagerort` die Charge RAET (§5.3.3, §4.11). Wer das Verfall-Feld im
 * Zaehlschritt als redundant streicht („die Charge hat doch einen Verfall"),
 * zerstoert diese Kompensation lautlos.
 *
 * Kein "use client", kein Icon-Import.
 */
import { eq } from "drizzle-orm";
import { artikel, chargen, lagerorte, lagerortVerfall } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { verfallStatus, verfallSchwellen, type Ampel } from "../domain/verfall";
import { chargeText } from "../format";
import { restJeCharge, type Leser } from "./bestand";

export type VerfallEintrag = {
  chargeId: string; chargenNr: string; verfall: string; rest: number;
  ampel: Ampel; abgelaufen: boolean; text: string;
  artikelId: string; artikelName: string; einheit: string; fach: string;
};

/** Chargen mit HANDLAGER-Rest > 0, deren Ampel nicht gruen ist.
 *  DREI Raenge: abgelaufen (0), rot (1), gelb (2); Zweitkriterium `verfall`. */
export function verfallListe(db: Leser, now: Date = new Date()): VerfallEintrag[] {
  const schwellen = verfallSchwellen();
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const rest = restJeCharge(db, HANDLAGER_ID);
  const eintraege: VerfallEintrag[] = [];
  for (const c of db.select().from(chargen).all()) {
    const r = rest.get(c.id) ?? 0;
    if (r <= 0) continue;                       // aufgebraucht oder nur im Fahrzeug
    const s = verfallStatus(c.verfall, schwellen, now);
    if (s.ampel === "gruen") continue;          // schliesst die Pseudo-Charge mit ein
    const a = arts.get(c.artikelId);
    if (!a) continue;
    eintraege.push({
      chargeId: c.id, chargenNr: c.chargenNr, verfall: c.verfall, rest: r,
      ampel: s.ampel, abgelaufen: s.abgelaufen, text: chargeText(s, c.verfall),
      artikelId: a.id, artikelName: a.name, einheit: a.einheit, fach: a.fach,
    });
  }
  const rang = (e: VerfallEintrag) => (e.abgelaufen ? 0 : e.ampel === "rot" ? 1 : 2);
  return eintraege.sort((x, y) => rang(x) - rang(y) || x.verfall.localeCompare(y.verfall));
}

export type LagerortVerfallZeile = {
  lagerortId: string; lagerortName: string; lagerortKennung: string | null;
  artikelId: string; artikelName: string; einheit: string;
  verfall: string; erfasstAt: Date; ampel: Ampel; abgelaufen: boolean; text: string;
};

/**
 * Die im Fahrzeug gemeldeten Verfaelle.
 *
 * ⚠️ VIER Raenge (inkl. gruen) und ein DRITTES Kriterium `lagerortName` — anders
 * als `verfallListe`, und das ist Absicht: dieselbe Ampel taucht hier ueber
 * mehrere Fahrzeuge verteilt auf.
 */
export function lagerortVerfallListe(
  db: Leser,
  opts: { nurWarnend?: boolean; lagerortId?: string } = {},
  now: Date = new Date(),
): LagerortVerfallZeile[] {
  const schwellen = verfallSchwellen();
  const orte = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l]));
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const rows = opts.lagerortId
    ? db.select().from(lagerortVerfall)
        .where(eq(lagerortVerfall.lagerortId, opts.lagerortId)).all()
    : db.select().from(lagerortVerfall).all();

  const zeilen: LagerortVerfallZeile[] = [];
  for (const r of rows) {
    const s = verfallStatus(r.verfall, schwellen, now);
    if (opts.nurWarnend && s.ampel === "gruen") continue;
    const ort = orte.get(r.lagerortId);
    const a = arts.get(r.artikelId);
    if (!ort || !a) continue;
    zeilen.push({
      lagerortId: ort.id, lagerortName: ort.name, lagerortKennung: ort.kennung,
      artikelId: a.id, artikelName: a.name, einheit: a.einheit,
      verfall: r.verfall, erfasstAt: r.erfasstAt,
      ampel: s.ampel, abgelaufen: s.abgelaufen, text: chargeText(s, r.verfall),
    });
  }
  const rang = (z: LagerortVerfallZeile) =>
    z.abgelaufen ? 0 : z.ampel === "rot" ? 1 : z.ampel === "gelb" ? 2 : 3;
  return zeilen.sort(
    (x, y) =>
      rang(x) - rang(y) ||
      x.verfall.localeCompare(y.verfall) ||
      x.lagerortName.localeCompare(y.lagerortName),
  );
}

export type VerfallAmLagerort = {
  artikelId: string; verfall: string; erfasstAt: Date;
  ampel: Ampel; abgelaufen: boolean; text: string;
};

/**
 * Die gemeldeten Verfaelle EINES Lagerorts, je Artikel HOECHSTENS einer
 * (Unique-Index `idx_lagerort_verfall_ort_artikel`). Leer = nichts gepflegt.
 *
 * ⚠️ Diese Funktion liegt hier und nicht bei den Schreibpfaden, obwohl die
 * Alt-Anwendung sie in `db/lagerort-verfall.ts` fuehrt (Festlegung H4): sie LIEST.
 * `_lib/schreibpfade/lagerortVerfall.ts` behaelt `setzeVerfall`,
 * `loescheVerfallEintrag` und `loescheVerfallFuer`.
 */
export function verfallFuerLagerort(
  db: Leser, lagerortId: string, now: Date = new Date(),
): Map<string, VerfallAmLagerort> {
  const schwellen = verfallSchwellen();
  const rows = db.select().from(lagerortVerfall)
    .where(eq(lagerortVerfall.lagerortId, lagerortId)).all();
  return new Map(rows.map((r) => {
    const s = verfallStatus(r.verfall, schwellen, now);
    return [r.artikelId, {
      artikelId: r.artikelId, verfall: r.verfall, erfasstAt: r.erfasstAt,
      ampel: s.ampel, abgelaufen: s.abgelaufen, text: chargeText(s, r.verfall),
    }];
  }));
}
```

- [ ] **Schritt 3: Grün, Mutationsprobe, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/verfall.test.ts
```

**Mutationsprobe:** ersetze in `verfallListe` den Aufruf `restJeCharge(db, HANDLAGER_ID)` durch eine
lagerortfreie Summierung. Erwartet: **rot** in „lässt eine abgelaufene Charge WEG, die nur im
Fahrzeug liegt". Zurücknehmen.

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/lesepfade/verfall.ts src/app/m/lagerbuch/_lib/lesepfade/verfall.test.ts
git commit -m "feat(lagerbuch): _lib/lesepfade/verfall.ts — zwei Quellen, und sie bleiben getrennt

Chargen-Verfall rechnet HANDLAGER-Rest (queries.ts:192-194): sonst erschiene eine
komplett aufs Fahrzeug umgelagerte abgelaufene Charge hier, und der
Aussondern-Knopf wuerde reproduzierbar fehlschlagen.

Lagerort-Verfall traegt das FRUEHESTE DATUM AUF EINER PACKUNG, nicht die Charge —
die Kompensation dafuer, dass korrekturAufLagerort die Charge raet (§5.3.3).

Verschiedene Rangfolgen mit Absicht: drei Raenge ohne gruen bzw. vier Raenge mit
drittem Kriterium lagerortName.

verfallFuerLagerort liegt hier und nicht bei den Schreibpfaden (Festlegung H4) —
sie liest.

Mutationsprobe (lagerortfreie Summierung) gefahren."
```

---

### Task 48: `_lib/lesepfade/fahrzeuge.ts` — Soll je (Fahrzeug, Fach, Artikel), Bestand je (Fahrzeug, Artikel)

**Files:**
- Create: `src/app/m/lagerbuch/_lib/lesepfade/fahrzeuge.ts`
- Test: `src/app/m/lagerbuch/_lib/lesepfade/fahrzeuge.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` — `lagerorte`, `sollPositionen`, `artikel`, `checks`,
  `fahrzeugTemplates`, `templatePositionen`; `_lib/lesepfade/bestand.ts` —
  `bestandJeArtikelUndLagerort`, `type Leser`; `_lib/lesepfade/verfall.ts` (T47) —
  `lagerortVerfallListe`; `_lib/konstanten.ts` — `HANDLAGER_ID`.
- Produces:
  ```ts
  export type SollHerkunft = "manuell" | "vorlage" | "ueberschrieben";
  export type FahrzeugUebersichtZeile = {
    id: string; name: string; kennung: string | null; aktiv: boolean;
    positionen: number; faecher: number; artikelUnterSoll: number;
    verfallAuffaellig: number; letzterCheck: Date | null; templateName: string | null };
  export type SollZeile = {
    id: string; fachLabel: string; sort: number; artikelId: string; artikelName: string;
    einheit: string; handlagerFach: string; soll: number;
    fahrzeugBestand: number; handlagerBestand: number;
    herkunft: SollHerkunft; entfernt: boolean };
  export type TemplateUebersichtZeile = {
    id: string; name: string; aktiv: boolean;
    positionen: number; faecher: number; fahrzeuge: number };
  export type TemplatePositionZeile = {
    id: string; fachLabel: string; sort: number; artikelId: string; artikelName: string;
    einheit: string; handlagerFach: string; soll: number };
  export type TemplateDetail = {
    id: string; name: string; aktiv: boolean; positionen: TemplatePositionZeile[];
    fahrzeuge: { id: string; name: string; kennung: string | null; aktiv: boolean }[] };

  export function fahrzeugListe(db: Leser): { id: string; name: string; kennung: string | null;
    aktiv: boolean; templateId: string | null }[];
  export function fahrzeugUebersicht(db: Leser, now?: Date): FahrzeugUebersichtZeile[];
  export function sollFuerFahrzeug(db: Leser, fahrzeugId: string): SollZeile[];
  export function templateUebersicht(db: Leser): TemplateUebersichtZeile[];
  export function templateDetail(db: Leser, id: string): TemplateDetail | null;
  export function templateListeAktiv(db: Leser): { id: string; name: string }[];
  ```
  Konsumenten: `/verwaltung/fahrzeuge`, `/verwaltung/vorlagen` (Teil 5), `/helfer/check` (Teil 4).

**Die zentrale Asymmetrie des Modells** (§5.7.1), und aus ihr folgt jede Aggregation:

> Das **Soll** ist pro (Fahrzeug, Fach, Artikel). Der **Bestand** ist pro (Fahrzeug, Artikel).

**Derselbe Artikel darf in mehreren Fächern stehen** — und teilt sich dann **einen**
Fahrzeugbestand. `fahrzeugUebersicht` summiert das Soll je Artikel, **bevor** es gegen den
Fahrzeugbestand vergleicht (`queries.ts:290-297`). **Wer je Position vergleicht, zählt Artikel in
zwei Fächern doppelt unter Soll.**

**Grabsteine** (`entfernt = true`) heißen „diese Vorlagen-Position ist auf diesem Fahrzeug bewusst
nicht vorhanden". Ein Grabstein ist **kein Soll**: er wird aus der Übersicht, aus dem Check und aus
der Vorlagen-Erzeugung herausgefiltert. ⚠️ **`sollFuerFahrzeug` gibt ihn dagegen MIT zurück**, damit
der Editor ihn zeigen und wiederherstellen kann (`queries.ts:320-321`). **Verbindlich: jede neue
Ansicht, die „das Soll" braucht, filtert `entfernt` selbst heraus.**

**Herkunft** (`queries.ts:330`): kein `templatePositionId` → `"manuell"`; gesetzt **und**
`ueberschrieben` → `"ueberschrieben"`; sonst `"vorlage"`.

⚠️ **Die drei Vorlagen-Lesepfade liegen hier** (Festlegung H4): §5.7 ist **ein** Abschnitt, und sie
lesen dieselben Tabellen wie `fahrzeugUebersicht`.

- [ ] **Schritt 1: Test schreiben, rot sehen**

`src/app/m/lagerbuch/_lib/lesepfade/fahrzeuge.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, checks, fahrzeugTemplates, lagerorte,
         lagerortVerfall, sollPositionen, templatePositionen, newId } from "../../_db/schema";
import { fahrzeugListe, fahrzeugUebersicht, sollFuerFahrzeug,
         templateUebersicht, templateDetail, templateListeAktiv } from "./fahrzeuge";
import { HANDLAGER_ID } from "../konstanten";

const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-fahrzeuge-");
  t.db.insert(fahrzeugTemplates).values([
    { id: "tpl-rtw", name: "RTW-Vorlage", aktiv: true, createdAt: NOW },
    { id: "tpl-alt", name: "Alte Vorlage", aktiv: false, createdAt: NOW },
  ]).run();
  t.db.insert(lagerorte).values([
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1",
      aktiv: true, templateId: "tpl-rtw" },
    { id: "rtw-2", name: "ELW", typ: "fahrzeug", kennung: "MS-2", aktiv: false },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a2", name: "NaCl", einheit: "Fl.", fach: "B2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
  t.db.insert(templatePositionen).values(
    { id: "tp1", templateId: "tpl-rtw", fachLabel: "Fach 1", sort: 0,
      artikelId: "a1", soll: 4 }).run();
  t.db.insert(sollPositionen).values([
    // DERSELBE Artikel in ZWEI Faechern — die zentrale Asymmetrie (§5.7.1).
    { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "Fach 1", sort: 0,
      artikelId: "a1", soll: 4, templatePositionId: "tp1",
      ueberschrieben: false, entfernt: false },
    { id: "sp2", fahrzeugId: "rtw-1", fachLabel: "Fach 2", sort: 1,
      artikelId: "a1", soll: 2, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
    // GRABSTEIN — kein Soll.
    { id: "sp3", fahrzeugId: "rtw-1", fachLabel: "Fach 3", sort: 2,
      artikelId: "a2", soll: 9, templatePositionId: null,
      ueberschrieben: false, entfernt: true },
  ]).run();
  t.db.insert(chargen).values(
    { id: "c1", artikelId: "a1", chargenNr: "CH", verfall: "2030-01", createdAt: NOW }).run();
  const b = (lagerortId: string, menge: number) => ({
    id: newId(), ts: NOW, typ: "zugang" as const, artikelId: "a1", chargeId: "c1",
    lagerortId, menge, quelleTyp: "system" as const, quelleId: "t",
    referenz: null, kommentar: null,
  });
  t.db.insert(buchungen).values([b(HANDLAGER_ID, 30), b("rtw-1", 5)]).run();
  t.db.insert(lagerortVerfall).values(
    { id: newId(), lagerortId: "rtw-1", artikelId: "a1", verfall: "2026-07",
      erfasstAt: NOW, quelleTyp: "token", quelleId: "111-111" }).run();
  t.db.insert(checks).values([
    { id: "chk-alt", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "111-111",
      startedAt: new Date("2026-05-01T10:00:00Z"),
      completedAt: new Date("2026-05-01T10:05:00Z"), ergebnis: "[]" },
    { id: "chk-neu", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "111-111",
      startedAt: new Date("2026-06-01T10:00:00Z"),
      completedAt: new Date("2026-06-01T10:05:00Z"), ergebnis: "[]" },
  ]).run();
});
afterEach(() => t.schliessen());

describe("fahrzeugUebersicht — Soll je ARTIKEL summiert, dann verglichen", () => {
  it("zaehlt einen Artikel in ZWEI Faechern EINMAL unter Soll", () => {
    /**
     * §5.7.1: das Soll ist pro (Fahrzeug, Fach, Artikel), der Bestand pro
     * (Fahrzeug, Artikel). a1 steht mit 4 + 2 = 6 im Soll; der Fahrzeugbestand
     * ist 5 → EIN Artikel unter Soll, nicht zwei. Wer je POSITION vergleicht,
     * zaehlt ihn doppelt.
     */
    const z = fahrzeugUebersicht(t.db, NOW).find((x) => x.id === "rtw-1")!;
    expect(z.artikelUnterSoll).toBe(1);
  });

  it("zaehlt Grabsteine NICHT als Soll", () => {
    const z = fahrzeugUebersicht(t.db, NOW).find((x) => x.id === "rtw-1")!;
    expect(z.positionen).toBe(2);   // sp1, sp2 — NICHT sp3
    expect(z.faecher).toBe(2);
  });

  it("nennt den JUENGSTEN abgeschlossenen Check", () => {
    const z = fahrzeugUebersicht(t.db, NOW).find((x) => x.id === "rtw-1")!;
    expect(z.letzterCheck?.toISOString()).toBe("2026-06-01T10:05:00.000Z");
  });

  it("zaehlt die WARNENDEN Verfallsmeldungen des Fahrzeugs", () => {
    expect(fahrzeugUebersicht(t.db, NOW).find((x) => x.id === "rtw-1")!.verfallAuffaellig).toBe(1);
  });

  it("nennt den Vorlagennamen und sortiert aktive nach vorn", () => {
    const l = fahrzeugUebersicht(t.db, NOW);
    expect(l.map((z) => z.id)).toEqual(["rtw-1", "rtw-2"]);
    expect(l[0].templateName).toBe("RTW-Vorlage");
    expect(l[1].templateName).toBeNull();
  });
});

describe("sollFuerFahrzeug — Grabsteine bleiben DRIN", () => {
  it("gibt auch entfernte Zeilen zurueck, damit der Editor sie wiederherstellen kann", () => {
    // `queries.ts:320-321`. VERBINDLICH: jede Ansicht, die „das Soll" braucht,
    // filtert `entfernt` SELBST heraus.
    const z = sollFuerFahrzeug(t.db, "rtw-1");
    expect(z.map((x) => x.id)).toEqual(["sp1", "sp2", "sp3"]);
    expect(z.find((x) => x.id === "sp3")!.entfernt).toBe(true);
  });

  it("nennt fahrzeugBestand und handlagerBestand getrennt", () => {
    const z = sollFuerFahrzeug(t.db, "rtw-1").find((x) => x.id === "sp1")!;
    expect(z.fahrzeugBestand).toBe(5);
    expect(z.handlagerBestand).toBe(30);
  });

  it("leitet die Herkunft aus templatePositionId und ueberschrieben ab", () => {
    const z = sollFuerFahrzeug(t.db, "rtw-1");
    expect(z.find((x) => x.id === "sp1")!.herkunft).toBe("vorlage");
    expect(z.find((x) => x.id === "sp2")!.herkunft).toBe("manuell");
    t.db.update(sollPositionen).set({ ueberschrieben: true })
      .where(eq(sollPositionen.id, "sp1")).run();
    expect(sollFuerFahrzeug(t.db, "rtw-1").find((x) => x.id === "sp1")!.herkunft)
      .toBe("ueberschrieben");
  });

  it("sortiert nach Fach, dann nach sort", () => {
    expect(sollFuerFahrzeug(t.db, "rtw-1").map((x) => x.fachLabel))
      .toEqual(["Fach 1", "Fach 2", "Fach 3"]);
  });

  it("ueberbrueckt einen geloeschten Artikel tolerant", () => {
    // Es gibt einen FK auf artikel.id — der Fall entsteht nur, wenn ein Import
    // Waisen mitbringt. Die Zeile darf dann keine Seite abstuerzen lassen.
    expect(sollFuerFahrzeug(t.db, "rtw-1").every((x) => typeof x.artikelName === "string"))
      .toBe(true);
  });
});

describe("die drei Vorlagen-Lesepfade (Festlegung H4)", () => {
  it("templateUebersicht zaehlt Positionen, Faecher und verknuepfte Fahrzeuge", () => {
    const l = templateUebersicht(t.db);
    expect(l.map((x) => x.id)).toEqual(["tpl-rtw", "tpl-alt"]);   // aktive nach vorn
    expect(l[0]).toMatchObject({ positionen: 1, faecher: 1, fahrzeuge: 1 });
  });

  it("templateDetail nennt Positionen und verknuepfte Fahrzeuge", () => {
    const d = templateDetail(t.db, "tpl-rtw")!;
    expect(d.positionen.map((p) => p.id)).toEqual(["tp1"]);
    expect(d.positionen[0].artikelName).toBe("Verband");
    expect(d.positionen[0].handlagerFach).toBe("A1");
    expect(d.fahrzeuge.map((f) => f.id)).toEqual(["rtw-1"]);
  });

  it("templateDetail liefert null fuer eine unbekannte ID", () => {
    expect(templateDetail(t.db, "gibtsnicht")).toBeNull();
  });

  it("templateListeAktiv liefert nur aktive, alphabetisch", () => {
    expect(templateListeAktiv(t.db)).toEqual([{ id: "tpl-rtw", name: "RTW-Vorlage" }]);
  });
});

describe("fahrzeugListe", () => {
  it("liefert alle Lagerorte vom Typ fahrzeug, inklusive inaktiver", () => {
    expect(fahrzeugListe(t.db).map((f) => f.id).sort()).toEqual(["rtw-1", "rtw-2"]);
  });
});
```

- [ ] **Schritt 2: `_lib/lesepfade/fahrzeuge.ts` schreiben**

```ts
/**
 * Fahrzeuge, Soll-Listen und Vorlagen. Kein "use client", kein Icon-Import.
 *
 * DIE ZENTRALE ASYMMETRIE DES MODELLS (§5.7.1), aus der jede Aggregation folgt:
 *
 *   Das SOLL ist pro (Fahrzeug, Fach, Artikel).
 *   Der BESTAND ist pro (Fahrzeug, Artikel).
 *
 * Derselbe Artikel darf in mehreren Faechern stehen — und teilt sich dann EINEN
 * Fahrzeugbestand. Deshalb wird das Soll JE ARTIKEL summiert, BEVOR es gegen den
 * Fahrzeugbestand verglichen wird (`queries.ts:290-291`). Wer je POSITION
 * vergleicht, zaehlt Artikel in zwei Faechern doppelt unter Soll.
 *
 * GRABSTEINE (`entfernt = true`) heissen „diese Vorlagen-Position ist auf diesem
 * Fahrzeug bewusst nicht vorhanden". Ein Grabstein ist KEIN Soll und wird aus der
 * Uebersicht, dem Check und der Vorlagen-Erzeugung herausgefiltert — aber
 * `sollFuerFahrzeug` gibt ihn MIT zurueck, damit der Editor ihn zeigen und
 * wiederherstellen kann. VERBINDLICH: jede neue Ansicht, die „das Soll" braucht,
 * filtert `entfernt` SELBST heraus.
 *
 * ⚠️ Die drei Vorlagen-Lesepfade liegen hier (Festlegung H4): §5.7 ist EIN
 * Abschnitt, und sie lesen dieselben Tabellen wie `fahrzeugUebersicht`.
 */
import { eq } from "drizzle-orm";
import { artikel, checks, fahrzeugTemplates, lagerorte, sollPositionen,
         templatePositionen } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { bestandJeArtikelUndLagerort, type Leser } from "./bestand";
import { lagerortVerfallListe } from "./verfall";

export function fahrzeugListe(db: Leser) {
  return db.select().from(lagerorte).where(eq(lagerorte.typ, "fahrzeug")).all()
    .map((f) => ({ id: f.id, name: f.name, kennung: f.kennung,
                   aktiv: f.aktiv, templateId: f.templateId }));
}

export type FahrzeugUebersichtZeile = {
  id: string; name: string; kennung: string | null; aktiv: boolean;
  positionen: number; faecher: number;
  /** Artikel, deren Fahrzeugbestand die SOLL-SUMME unterschreitet. */
  artikelUnterSoll: number;
  /** Gemeldete Verfaelle im Warnbereich oder bereits abgelaufen. */
  verfallAuffaellig: number;
  letzterCheck: Date | null;
  templateName: string | null;
};

/**
 * Verdichtete Uebersicht — je Fahrzeug nur Kennzahlen, damit die Seite bei vielen
 * Fahrzeugen scanbar bleibt.
 *
 * ⚠️ EINE Bestandsabfrage fuer ALLE Fahrzeuge (`bestandJeArtikelUndLagerort`)
 * statt der heutigen Vollladung mit Filter je Artikel je Fahrzeug — der teuerste
 * der vier quadratischen Terme, O(N_Fahrzeug · N_ArtikelImSoll · N_Buchungen)
 * (§5.2.3 b).
 */
export function fahrzeugUebersicht(db: Leser, now: Date = new Date()): FahrzeugUebersichtZeile[] {
  const fahrzeuge = db.select().from(lagerorte).where(eq(lagerorte.typ, "fahrzeug")).all();
  const bestand = bestandJeArtikelUndLagerort(db);
  // Grabsteine zaehlen NIRGENDS als Soll.
  const allSoll = db.select().from(sollPositionen).all().filter((s) => !s.entfernt);
  const templateNamen = new Map(
    db.select().from(fahrzeugTemplates).all().map((t) => [t.id, t.name]));

  const verfallProFzg = new Map<string, number>();
  for (const z of lagerortVerfallListe(db, { nurWarnend: true }, now)) {
    verfallProFzg.set(z.lagerortId, (verfallProFzg.get(z.lagerortId) ?? 0) + 1);
  }

  const letzterProFzg = new Map<string, Date>();
  for (const c of db.select().from(checks).all()) {
    if (!c.completedAt) continue;
    const prev = letzterProFzg.get(c.fahrzeugId);
    if (!prev || c.completedAt > prev) letzterProFzg.set(c.fahrzeugId, c.completedAt);
  }

  return fahrzeuge
    .map((f) => {
      const soll = allSoll.filter((s) => s.fahrzeugId === f.id);
      const faecher = new Set(soll.map((s) => s.fachLabel));
      // SOLL JE ARTIKEL SUMMIEREN, DANN vergleichen (§5.7.1).
      const sollProArtikel = new Map<string, number>();
      for (const s of soll) {
        sollProArtikel.set(s.artikelId, (sollProArtikel.get(s.artikelId) ?? 0) + s.soll);
      }
      const imFahrzeug = bestand.get(f.id);
      let artikelUnterSoll = 0;
      for (const [artikelId, sollSumme] of sollProArtikel) {
        if ((imFahrzeug?.get(artikelId) ?? 0) < sollSumme) artikelUnterSoll += 1;
      }
      return {
        id: f.id, name: f.name, kennung: f.kennung, aktiv: f.aktiv,
        positionen: soll.length, faecher: faecher.size, artikelUnterSoll,
        verfallAuffaellig: verfallProFzg.get(f.id) ?? 0,
        letzterCheck: letzterProFzg.get(f.id) ?? null,
        templateName: f.templateId ? (templateNamen.get(f.templateId) ?? null) : null,
      };
    })
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
}

export type SollHerkunft = "manuell" | "vorlage" | "ueberschrieben";

export type SollZeile = {
  id: string; fachLabel: string; sort: number; artikelId: string; artikelName: string;
  einheit: string; handlagerFach: string; soll: number;
  /** recorded Bestand AUF dem Fahrzeug — Ausgangspunkt des Abgleichs. */
  fahrzeugBestand: number;
  /** im Handlager verfuegbar zum Nachfuellen. */
  handlagerBestand: number;
  herkunft: SollHerkunft;
  /** GRABSTEIN: zaehlt nicht als Soll. Diese Funktion filtert ihn NICHT heraus. */
  entfernt: boolean;
};

export function sollFuerFahrzeug(db: Leser, fahrzeugId: string): SollZeile[] {
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const bestand = bestandJeArtikelUndLagerort(db);
  const imFahrzeug = bestand.get(fahrzeugId);
  const imHandlager = bestand.get(HANDLAGER_ID);
  return db.select().from(sollPositionen)
    .where(eq(sollPositionen.fahrzeugId, fahrzeugId)).all()
    .map((p) => {
      const a = arts.get(p.artikelId);
      // `queries.ts:330` — die Herkunft ist abgeleitet, keine eigene Spalte.
      const herkunft: SollHerkunft = !p.templatePositionId
        ? "manuell"
        : p.ueberschrieben ? "ueberschrieben" : "vorlage";
      return {
        id: p.id, fachLabel: p.fachLabel, sort: p.sort, artikelId: p.artikelId,
        // Tolerant gegen Waisen: `ergebnis`-JSONs und Importe koennen auf
        // geloeschte Zeilen zeigen, und eine Seite darf daran nicht abstuerzen.
        artikelName: a?.name ?? "–", einheit: a?.einheit ?? "",
        handlagerFach: a?.fach ?? "", soll: p.soll,
        fahrzeugBestand: imFahrzeug?.get(p.artikelId) ?? 0,
        handlagerBestand: imHandlager?.get(p.artikelId) ?? 0,
        herkunft, entfernt: p.entfernt,
      };
    })
    .sort((x, y) => x.fachLabel.localeCompare(y.fachLabel) || x.sort - y.sort);
}

export type TemplateUebersichtZeile = {
  id: string; name: string; aktiv: boolean;
  positionen: number; faecher: number; fahrzeuge: number;
};

export function templateUebersicht(db: Leser): TemplateUebersichtZeile[] {
  const templates = db.select().from(fahrzeugTemplates).all();
  const allPos = db.select().from(templatePositionen).all();
  const fahrzeuge = db.select().from(lagerorte).where(eq(lagerorte.typ, "fahrzeug")).all();
  return templates
    .map((t) => {
      const pos = allPos.filter((p) => p.templateId === t.id);
      return {
        id: t.id, name: t.name, aktiv: t.aktiv,
        positionen: pos.length,
        faecher: new Set(pos.map((p) => p.fachLabel)).size,
        fahrzeuge: fahrzeuge.filter((f) => f.templateId === t.id).length,
      };
    })
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
}

export type TemplatePositionZeile = {
  id: string; fachLabel: string; sort: number; artikelId: string; artikelName: string;
  einheit: string; handlagerFach: string; soll: number;
};

export type TemplateDetail = {
  id: string; name: string; aktiv: boolean;
  positionen: TemplatePositionZeile[];
  fahrzeuge: { id: string; name: string; kennung: string | null; aktiv: boolean }[];
};

export function templateDetail(db: Leser, id: string): TemplateDetail | null {
  const t = db.select().from(fahrzeugTemplates)
    .where(eq(fahrzeugTemplates.id, id)).get();
  if (!t) return null;
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const positionen = db.select().from(templatePositionen)
    .where(eq(templatePositionen.templateId, id)).all()
    .map((p) => {
      const a = arts.get(p.artikelId);
      return {
        id: p.id, fachLabel: p.fachLabel, sort: p.sort, artikelId: p.artikelId,
        artikelName: a?.name ?? "–", einheit: a?.einheit ?? "",
        handlagerFach: a?.fach ?? "", soll: p.soll,
      };
    })
    .sort((x, y) => x.fachLabel.localeCompare(y.fachLabel) || x.sort - y.sort);
  const fahrzeuge = db.select().from(lagerorte).where(eq(lagerorte.templateId, id)).all()
    .map((f) => ({ id: f.id, name: f.name, kennung: f.kennung, aktiv: f.aktiv }))
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
  return { id: t.id, name: t.name, aktiv: t.aktiv, positionen, fahrzeuge };
}

export function templateListeAktiv(db: Leser) {
  return db.select().from(fahrzeugTemplates).where(eq(fahrzeugTemplates.aktiv, true)).all()
    .map((t) => ({ id: t.id, name: t.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Schritt 3: Grün, Mutationsprobe, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/fahrzeuge.test.ts
```

**Mutationsprobe:** vergleiche in `fahrzeugUebersicht` je **Position** statt je Artikel (also
`for (const s of soll) if (bestand < s.soll) artikelUnterSoll++`). Erwartet: **rot** in „zählt einen
Artikel in ZWEI Fächern EINMAL unter Soll" (2 statt 1). Zurücknehmen.

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/lesepfade/fahrzeuge.ts \
        src/app/m/lagerbuch/_lib/lesepfade/fahrzeuge.test.ts
git commit -m "feat(lagerbuch): _lib/lesepfade/fahrzeuge.ts — Soll je Artikel summiert

§5.7.1, die zentrale Asymmetrie: das Soll ist pro (Fahrzeug, Fach, Artikel), der
Bestand pro (Fahrzeug, Artikel). Wer je Position vergleicht, zaehlt einen Artikel
in zwei Faechern doppelt unter Soll — Mutationsprobe gefahren.

Grabsteine (entfernt) zaehlen nirgends als Soll, aber sollFuerFahrzeug gibt sie
MIT zurueck, damit der Editor sie wiederherstellen kann. Verbindlich: jede neue
Ansicht filtert entfernt selbst heraus.

EINE Bestandsabfrage fuer alle Fahrzeuge statt Vollladung mit Filter je Artikel je
Fahrzeug — der teuerste der vier quadratischen Terme (§5.2.3 b).

Die drei Vorlagen-Lesepfade liegen hier (Festlegung H4): §5.7 ist ein Abschnitt,
und sie lesen dieselben Tabellen."
```

---

### Task 49: `_lib/lesepfade/checks.ts` — dieselbe Kette in beiden Lesern, und `?? 200` fällt

**Files:**
- Create: `src/app/m/lagerbuch/_lib/lesepfade/checks.ts`
- Test: `src/app/m/lagerbuch/_lib/lesepfade/checks.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` — `checks`, `lagerorte`, `artikel`, `sollPositionen`, `geraete`,
  `o2Flaschen`; `_lib/checkErgebnis.ts` (T37); `_lib/domain/check.ts` (T40) —
  `summiereCheckErgebnis`; `_lib/domain/o2.ts` (T34) — `o2Status`; `_lib/domain/verfall.ts` (T28);
  `_lib/format.ts` (T39) — `chargeText`; `_lib/grenzen.ts` (T32) — `CHECK_GRENZE`;
  `_lib/lesepfade/bestand.ts` — `type Leser`.
- Produces:
  ```ts
  export type CheckFilter = { fahrzeugId?: string; von?: Date; bis?: Date; grenze?: number };
  export type CheckHistorieZeile = {
    id: string; fahrzeugId: string; fahrzeugName: string; completedAt: Date | null;
    positionen: number; nachgefuellt: number; korrigiert: number; offen: number;
    geraeteAuffaellig: number; flaschenAuffaellig: number; nichtBewertbar: number;
    altFormat: boolean };
  export type CheckHistorie = { zeilen: CheckHistorieZeile[]; mehrVorhanden: boolean };
  export type CheckFlascheDetail = {
    flascheId: string; name: string; druckBar: number;
    nennfuelldruckBar: number | null; prozent: number | null;
    ampel: Ampel | null; niedrig: boolean };
  export type CheckPositionDetail = { fachLabel: string; artikelId: string;
    artikelName: string; einheit: string; soll: number; ist: number };
  export type CheckArtikelDetail = { artikelId: string; artikelName: string; einheit: string;
    sollSumme: number; istSumme: number; recordedVorher: number;
    korrektur: number; nachfuellGebucht: number; offen: number };
  export type CheckGeraetDetail = { geraetId: string; name: string;
    typ: "medizin" | "objekt" | null; vorhanden: boolean;
    zustand: string | null; bemerkung: string | null };
  export type CheckVerfallDetail = { artikelId: string; artikelName: string; verfall: string;
    ampel: Ampel; abgelaufen: boolean; text: string };
  export type CheckDetail = {
    id: string; fahrzeugId: string; fahrzeugName: string; fahrzeugKennung: string | null;
    quelleId: string; startedAt: Date; completedAt: Date | null;
    positionen: CheckPositionDetail[]; artikel: CheckArtikelDetail[];
    geraete: CheckGeraetDetail[]; flaschen: CheckFlascheDetail[];
    verfall: CheckVerfallDetail[];
    altFormat: boolean;
    summe: CheckSummen & { verfallAuffaellig: number };
  };

  export function checkHistorie(db: Leser, f?: CheckFilter): CheckHistorie;
  export function checkDetail(db: Leser, id: string, now?: Date): CheckDetail | null;
  ```
  Konsumenten: `/verwaltung/checks` und `/verwaltung/checks/[id]` (Teil 5).

**Die zwei Entscheidungen, die diese Datei trägt:**

1. **Beide Leser rufen `summiereCheckErgebnis`** (§5.8.3) — dieselbe Funktion, dieselben Zahlen.
   Heute rechnet die Historie an `queries.ts:374-380` und das Detail an `:496-501`, und sie können
   auseinanderlaufen.
2. **Der Nennfülldruck wird BENANNT statt geraten** (§5.12). Die Kette lautet in **beiden** Lesern
   `e.nennfuelldruckBar ?? f?.nennfuelldruckBar ?? null` — die Historie bekommt damit **dieselbe
   Stammdaten-Kette wie das Detail**, „damit der häufigere der beiden Wege überhaupt erst den
   seltenen erreicht". Fehlt der Wert in **allen** Quellen, liefert die Zeile
   `nennfuelldruckBar: null`, `prozent: null`, `ampel: null` und die Anzeige „Nennfülldruck
   unbekannt" — **keine** Prozentzahl und **keine** Ampel; solche Zeilen zählen in `nichtBewertbar`.

⚠️ **`summiereCheckErgebnis` kennt den Flaschenstamm nicht** (T40). Für die **Historie** ist das
verkraftbar (sie zeigt nur Zahlen); das **Detail** rechnet die Flaschenzeilen deshalb **selbst**,
mit der vollen Kette — und **überschreibt** die beiden Flaschenzähler der Summe. ⚠️ Das ist die eine
Stelle, an der Übersicht und Detail auseinandergehen **dürfen**, und sie geht in die **sichere**
Richtung: das Detail weiß mehr.

3. **Die Verfall-Ampel wird gegen HEUTE gerechnet, nicht gegen den Check-Zeitpunkt** (§5.6.3) — ein
   damals grünes Datum kann inzwischen abgelaufen sein. **Verbindlich für die Oberfläche:** die
   Detailseite **schreibt das aus**. Ohne diesen Satz liest jemand einen Nachweis falsch.

4. **`altFormat` bleibt ein Feld der Detailantwort** (§4.10) und die Detailseite **sagt es** — alles
   andere ist eine leere Tabelle, die wie ein Fehler aussieht.

- [ ] **Schritt 1: Test schreiben, rot sehen**

`src/app/m/lagerbuch/_lib/lesepfade/checks.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, checks, geraete, lagerorte, o2Flaschen, sollPositionen } from "../../_db/schema";
import { checkHistorie, checkDetail } from "./checks";
import { CHECK_GRENZE } from "../grenzen";

const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

const V2 = {
  positionen: [{ sollPositionId: "sp1", artikelId: "a1", soll: 4, ist: 3 }],
  artikel: [{ artikelId: "a1", sollSumme: 4, istSumme: 3, recordedVorher: 5,
              korrektur: -2, nachfuellGewuenscht: 1, nachfuellGebucht: 1 }],
  geraete: [{ geraetId: "g1", vorhanden: false, zustand: "In Ordnung", bemerkung: "fehlt" }],
  flaschen: [{ flascheId: "f-300", druckBar: 150 }],   // OHNE Snapshot!
  verfall: [{ artikelId: "a1", verfall: "2026-07", ampel: "gruen", abgelaufen: false }],
};

/**
 * DIE VERFALLSSCHWELLEN WERDEN AUSDRUECKLICH GEPINNT.
 *
 * Der Pfad ruft `verfallSchwellen()` ohne Argument, liest also `process.env` —
 * und dieser Test behauptet konkrete Ampelwerte. Ein Entwickler mit
 * `LAGERBUCH_VERFALL_ROT_TAGE=7` in seiner Shell bekaeme sonst eine rote Datei
 * mit einer Meldung, die nichts erklaert. Teil 2 hat die Regel in
 * `grenzen.test.ts` aufgeschrieben: „Der Test darf nicht davon abhaengen, was in
 * der Entwicklerumgebung zufaellig gesetzt ist."
 *
 * `vi.stubEnv`/`vi.unstubAllEnvs` ist das etablierte Muster des Repos fuer genau
 * diesen Fall (`core/bootstrap.test.ts`, `devLogin.test.ts`) — `process.env.X = …`
 * scheitert an Nexts `readonly`-Augmentierung.
 *
 * ⚠️ NICHT „vereinfachen". Ohne den Pin ist die Datei rennabhaengig gruen.
 */
function pinneSchwellen(): void {
  vi.stubEnv("LAGERBUCH_VERFALL_ROT_TAGE", "31");
  vi.stubEnv("LAGERBUCH_VERFALL_GELB_TAGE", "56");
}

beforeEach(() => {
  pinneSchwellen();
  t = migrierteTestDb("lagerbuch-lp-checks-");
  t.db.insert(lagerorte).values(
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", aktiv: true }).run();
  t.db.insert(artikel).values(
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW }).run();
  t.db.insert(sollPositionen).values(
    { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "Fach 1", sort: 0,
      artikelId: "a1", soll: 4, templatePositionId: null,
      ueberschrieben: false, entfernt: false }).run();
  t.db.insert(geraete).values(
    { id: "g1", typ: "objekt", name: "Spineboard", lagerortId: "rtw-1",
      aktiv: true, createdAt: NOW, barcode: null, anmerkung: null,
      mtkFaellig: null, beschreibung: null, ablaufdatum: null }).run();
  // 300-bar-Flasche — der Fall, den der ?? 200-Rueckfall still falsch rechnete.
  t.db.insert(o2Flaschen).values(
    { id: "f-300", name: "O2 300", lagerortId: "rtw-1", groesseLiter: 10,
      nennfuelldruckBar: 300, aktiv: true, createdAt: NOW }).run();
  t.db.insert(checks).values(
    { id: "chk-1", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "111-111",
      startedAt: NOW, completedAt: NOW, ergebnis: JSON.stringify(V2) }).run();
});
afterEach(() => {
  t.schliessen();
  vi.unstubAllEnvs();
});

describe("checkHistorie", () => {
  it("liefert die Summen aus summiereCheckErgebnis", () => {
    const z = checkHistorie(t.db).zeilen[0];
    expect(z).toMatchObject({
      fahrzeugName: "RTW 1", positionen: 1, nachgefuellt: 1,
      korrigiert: 2, offen: 0, geraeteAuffaellig: 1, altFormat: false,
    });
  });

  it("zaehlt die Flasche OHNE Snapshot in nichtBewertbar, nicht in flaschenAuffaellig", () => {
    // §5.12: die HISTORIE hat keinen Rueckgriff auf den Flaschenstamm und ist
    // damit der LEICHTERE der beiden Wege in den Rueckfall. Ein Altcheck ueber
    // 300-bar-Flaschen meldete dort systematisch zu wenige auffaellige Flaschen.
    const z = checkHistorie(t.db).zeilen[0];
    expect(z.nichtBewertbar).toBe(1);
    expect(z.flaschenAuffaellig).toBe(0);
  });

  it("filtert nach Fahrzeug und Zeitraum", () => {
    expect(checkHistorie(t.db, { fahrzeugId: "rtw-1" }).zeilen).toHaveLength(1);
    expect(checkHistorie(t.db, { fahrzeugId: "gibtsnicht" }).zeilen).toHaveLength(0);
    expect(checkHistorie(t.db, { von: new Date("2026-07-01T00:00:00Z") }).zeilen).toHaveLength(0);
  });

  it("macht den Deckel BEOBACHTBAR — CHECK_GRENZE + 1", () => {
    // §5.14.3, der strengere Fall: die Checks-Seite nennt ihre 50 heute an KEINER
    // Stelle.
    for (let i = 0; i < CHECK_GRENZE; i++) {
      t.db.insert(checks).values({
        id: `c${i}`, fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "1",
        startedAt: NOW, completedAt: NOW, ergebnis: "[]",
      }).run();
    }
    const h = checkHistorie(t.db);
    expect(h.zeilen).toHaveLength(CHECK_GRENZE);
    expect(h.mehrVorhanden).toBe(true);
  });

  it("sortiert completedAt DESC mit id-Tiebreaker", () => {
    // Dieselbe Sekundengranularitaet wie im Journal (§5.14.4).
    t.db.insert(checks).values({
      id: "chk-2", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "1",
      startedAt: NOW, completedAt: NOW, ergebnis: "[]",
    }).run();
    expect(checkHistorie(t.db).zeilen.map((z) => z.id)).toEqual(["chk-2", "chk-1"]);
  });
});

describe("checkDetail — der Nennfuelldruck wird NICHT geraten (§5.12)", () => {
  it("greift auf den FLASCHENSTAMM zurueck, wenn der Snapshot fehlt", () => {
    // Die Kette `e.nennfuelldruckBar ?? f?.nennfuelldruckBar ?? null`. Die
    // 300-bar-Flasche existiert noch → 150/300 = 50 % → gruen.
    const f = checkDetail(t.db, "chk-1", NOW)!.flaschen[0];
    expect(f.nennfuelldruckBar).toBe(300);
    expect(f.prozent).toBe(50);
    expect(f.ampel).toBe("gruen");
    expect(f.niedrig).toBe(false);
  });

  it("liefert null statt 200, wenn Snapshot UND Stamm fehlen", () => {
    /**
     * ⚠️ DIE MUTATION, DIE DAS FAENGT (§5.19.3): den `?? null` wieder auf `?? 200`
     * setzen. Fuer eine 300-bar-Flasche erschienen 150 bar als 75 % statt der
     * wahren 50 %, und die Ampel spraenge von gelb auf gruen.
     */
    t.db.delete(o2Flaschen).run();
    const f = checkDetail(t.db, "chk-1", NOW)!.flaschen[0];
    expect(f.nennfuelldruckBar).toBeNull();
    expect(f.prozent).toBeNull();
    expect(f.ampel).toBeNull();
    expect(f.name).toBe("(gelöschte Flasche)");
  });

  it("zaehlt eine unbewertbare Flasche in nichtBewertbar, NICHT in flaschenAuffaellig", () => {
    t.db.delete(o2Flaschen).run();
    const d = checkDetail(t.db, "chk-1", NOW)!;
    expect(d.summe.nichtBewertbar).toBe(1);
    expect(d.summe.flaschenAuffaellig).toBe(0);
  });
});

describe("checkDetail — tolerant gegen geloeschte Bezugsobjekte", () => {
  it("ueberbrueckt Artikel, Geraet und Soll-Position", () => {
    // `ergebnis` ist freies JSON OHNE Fremdschluessel (§4.10, 1:1-Pflicht 3).
    t.db.delete(geraete).run();
    const d = checkDetail(t.db, "chk-1", NOW)!;
    expect(d.geraete[0].name).toBe("(gelöschtes Gerät)");
    expect(d.positionen[0].fachLabel).toBe("Fach 1");
    expect(d.positionen[0].artikelName).toBe("Verband");
  });
});

describe("checkDetail — Verfall-Ampel gegen HEUTE, nicht gegen den Check-Zeitpunkt", () => {
  it("rechnet neu und ignoriert den gespeicherten Ampelwert", () => {
    /**
     * §5.6.3: der Snapshot traegt `ampel: "gruen"`. Gegen einen `now` von 2026-08
     * ist 2026-07 ABGELAUFEN. Das ist eine bewusste Entscheidung und bleibt — mit
     * der Konsequenz, dass die Detailseite fuer DENSELBEN Check ueber die Zeit
     * verschiedene Ampeln zeigt. VERBINDLICH: die Seite schreibt das aus (Teil 5).
     */
    const spaeter = new Date("2026-08-15T10:00:00Z");
    const v = checkDetail(t.db, "chk-1", spaeter)!.verfall[0];
    expect(v.abgelaufen).toBe(true);
    expect(v.ampel).toBe("rot");
    expect(v.text).toBe("abgelaufen");
  });
});

describe("checkDetail — das ALTE Format", () => {
  it("setzt altFormat true und liefert leere Detaillisten", () => {
    t.db.insert(checks).values({
      id: "chk-alt", fahrzeugId: "rtw-1", quelleTyp: "token", quelleId: "1",
      startedAt: NOW, completedAt: NOW, ergebnis: JSON.stringify([{ fehlt: 3, gebucht: 1 }]),
    }).run();
    const d = checkDetail(t.db, "chk-alt", NOW)!;
    expect(d.altFormat).toBe(true);
    expect(d.positionen).toEqual([]);
    expect(d.artikel).toEqual([]);
    // Die Summen kommen trotzdem — das ist die EINZIGE Auswertung, die es fuer
    // Altchecks je gab (§4.10, 1:1-Pflicht 1).
    expect(d.summe.nachgefuellt).toBe(1);
  });

  it("liefert null fuer eine unbekannte ID", () => {
    expect(checkDetail(t.db, "gibtsnicht", NOW)).toBeNull();
  });
});
```

- [ ] **Schritt 2: `_lib/lesepfade/checks.ts` schreiben**

```ts
/**
 * Fahrzeug-Check-Historie und -Detail. Kein "use client", kein Icon-Import.
 *
 * ZWEI ENTSCHEIDUNGEN TRAEGT DIESE DATEI:
 *
 * 1. BEIDE LESER RUFEN `summiereCheckErgebnis` (§5.8.3) — dieselbe Funktion,
 *    dieselben Zahlen. Heute rechnet die Historie an `queries.ts:374-380` und das
 *    Detail an `:496-501`, und sie koennen auseinanderlaufen.
 * 2. DER NENNFUELLDRUCK WIRD BENANNT STATT GERATEN (§5.12). Die Kette lautet in
 *    BEIDEN Lesern `e.nennfuelldruckBar ?? f?.nennfuelldruckBar ?? null` — die
 *    Historie bekommt damit DIESELBE Stammdaten-Kette wie das Detail, „damit der
 *    haeufigere der beiden Wege ueberhaupt erst den seltenen erreicht". Fehlt der
 *    Wert in ALLEN Quellen, liefert die Zeile null/null/null und die Anzeige
 *    „Nennfuelldruck unbekannt" — keine Prozentzahl, keine Ampel.
 *
 * ⚠️ `summiereCheckErgebnis` KENNT DEN FLASCHENSTAMM NICHT (T40). Fuer die
 * HISTORIE ist das verkraftbar; das DETAIL rechnet die Flaschenzeilen deshalb
 * SELBST mit der vollen Kette und UEBERSCHREIBT die beiden Flaschenzaehler der
 * Summe. Das ist die eine Stelle, an der Uebersicht und Detail auseinandergehen
 * duerfen — und sie geht in die SICHERE Richtung: das Detail weiss mehr.
 */
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { artikel, checks, geraete, lagerorte, o2Flaschen, sollPositionen } from "../../_db/schema";
import { parseCheckErgebnis } from "../checkErgebnis";
import { summiereCheckErgebnis, type CheckSummen } from "../domain/check";
import { o2Status } from "../domain/o2";
import { verfallStatus, verfallSchwellen, type Ampel } from "../domain/verfall";
import { chargeText } from "../format";
import { CHECK_GRENZE } from "../grenzen";
import type { Leser } from "./bestand";

export type CheckFilter = { fahrzeugId?: string; von?: Date; bis?: Date; grenze?: number };

export type CheckHistorieZeile = CheckSummen & {
  id: string; fahrzeugId: string; fahrzeugName: string; completedAt: Date | null;
};

export type CheckHistorie = { zeilen: CheckHistorieZeile[]; mehrVorhanden: boolean };

export function checkHistorie(db: Leser, f: CheckFilter = {}): CheckHistorie {
  const grenze = f.grenze ?? CHECK_GRENZE;
  const namen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  const conds: SQL[] = [];
  if (f.fahrzeugId) conds.push(eq(checks.fahrzeugId, f.fahrzeugId));
  if (f.von) conds.push(gte(checks.completedAt, f.von));
  if (f.bis) conds.push(lte(checks.completedAt, f.bis));

  const rows = db
    .select()
    .from(checks)
    .where(conds.length > 0 ? and(...conds) : undefined)
    // id-Tiebreaker wie im Journal: `completedAt` sind UNIX-SEKUNDEN (§5.14.4).
    .orderBy(desc(checks.completedAt), desc(checks.id))
    .limit(grenze + 1)
    .all();

  return {
    mehrVorhanden: rows.length > grenze,
    zeilen: rows.slice(0, grenze).map((c) => ({
      id: c.id, fahrzeugId: c.fahrzeugId,
      fahrzeugName: namen.get(c.fahrzeugId) ?? "–",
      completedAt: c.completedAt,
      ...summiereCheckErgebnis(c.ergebnis),
    })),
  };
}

export type CheckPositionDetail = {
  fachLabel: string; artikelId: string; artikelName: string; einheit: string;
  soll: number; ist: number;
};
export type CheckArtikelDetail = {
  artikelId: string; artikelName: string; einheit: string;
  sollSumme: number; istSumme: number; recordedVorher: number;
  korrektur: number; nachfuellGebucht: number; offen: number;
};
export type CheckGeraetDetail = {
  geraetId: string; name: string; typ: "medizin" | "objekt" | null;
  vorhanden: boolean; zustand: string | null; bemerkung: string | null;
};
export type CheckFlascheDetail = {
  flascheId: string; name: string; druckBar: number;
  /** ⚠️ `null` = unbekannt. KEIN `?? 200` (§5.12). */
  nennfuelldruckBar: number | null;
  prozent: number | null;
  ampel: Ampel | null;
  niedrig: boolean;
};
export type CheckVerfallDetail = {
  artikelId: string; artikelName: string; verfall: string;
  ampel: Ampel; abgelaufen: boolean; text: string;
};
export type CheckDetail = {
  id: string; fahrzeugId: string; fahrzeugName: string; fahrzeugKennung: string | null;
  quelleId: string; startedAt: Date; completedAt: Date | null;
  positionen: CheckPositionDetail[]; artikel: CheckArtikelDetail[];
  geraete: CheckGeraetDetail[]; flaschen: CheckFlascheDetail[]; verfall: CheckVerfallDetail[];
  /** ⚠️ Bleibt ein Feld der Antwort, und die Detailseite SAGT es (§4.10, §11.5
   *  Zustand 26) — alles andere ist eine leere Tabelle, die wie ein Fehler
   *  aussieht. */
  altFormat: boolean;
  summe: CheckSummen & { verfallAuffaellig: number };
};

export function checkDetail(db: Leser, id: string, now: Date = new Date()): CheckDetail | null {
  const c = db.select().from(checks).where(eq(checks.id, id)).get();
  if (!c) return null;
  const fahrzeug = db.select().from(lagerorte).where(eq(lagerorte.id, c.fahrzeugId)).get();
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const sollRows = new Map(db.select().from(sollPositionen).all().map((s) => [s.id, s]));
  const gerStamm = new Map(db.select().from(geraete).all().map((g) => [g.id, g]));
  const flStamm = new Map(db.select().from(o2Flaschen).all().map((f) => [f.id, f]));
  const schwellen = verfallSchwellen();

  const e = parseCheckErgebnis(c.ergebnis);
  const summe = summiereCheckErgebnis(c.ergebnis);

  // Das ALTE Format traegt keine Positionsdetails — leere Listen sind die
  // richtige Antwort, und `altFormat: true` macht sie lesbar.
  const leer = e.version === 1;

  // Alle Detaillisten sind TOLERANT gegen geloeschte Bezugsobjekte: `ergebnis`
  // ist freies JSON OHNE Fremdschluessel (§4.10, 1:1-Pflicht 3).
  const positionen: CheckPositionDetail[] = leer ? [] : e.positionen.map((p) => {
    const a = arts.get(p.artikelId);
    const s = p.sollPositionId ? sollRows.get(p.sollPositionId) : undefined;
    return {
      fachLabel: s?.fachLabel ?? "–", artikelId: p.artikelId,
      artikelName: a?.name ?? "(gelöschter Artikel)", einheit: a?.einheit ?? "",
      soll: p.soll ?? 0, ist: p.ist ?? 0,
    };
  });

  const artikelD: CheckArtikelDetail[] = leer ? [] : e.artikel.map((g) => {
    const a = arts.get(g.artikelId);
    const sollSumme = g.sollSumme ?? 0;
    const istSumme = g.istSumme ?? 0;
    const nachfuellGebucht = g.nachfuellGebucht ?? 0;
    return {
      artikelId: g.artikelId, artikelName: a?.name ?? "(gelöschter Artikel)",
      einheit: a?.einheit ?? "", sollSumme, istSumme,
      recordedVorher: g.recordedVorher ?? 0, korrektur: g.korrektur ?? 0, nachfuellGebucht,
      offen: Math.max(0, sollSumme - istSumme - nachfuellGebucht),
    };
  });

  const geraeteD: CheckGeraetDetail[] = leer ? [] : e.geraete.map((x) => {
    const g = gerStamm.get(x.geraetId);
    return {
      geraetId: x.geraetId, name: g?.name ?? "(gelöschtes Gerät)", typ: g?.typ ?? null,
      vorhanden: Boolean(x.vorhanden), zustand: x.zustand ?? null,
      bemerkung: x.bemerkung ?? null,
    };
  });

  // DIE VOLLE KETTE — und sie endet auf `null`, nicht auf 200 (§5.12).
  let flaschenAuffaellig = 0;
  let nichtBewertbar = 0;
  const flaschenD: CheckFlascheDetail[] = leer ? [] : e.flaschen.map((x) => {
    const f = flStamm.get(x.flascheId);
    const druckBar = x.druckBar ?? 0;
    const nenn = x.nennfuelldruckBar ?? f?.nennfuelldruckBar ?? null;
    if (nenn === null) {
      nichtBewertbar += 1;
      return {
        flascheId: x.flascheId, name: f?.name ?? "(gelöschte Flasche)", druckBar,
        nennfuelldruckBar: null, prozent: null, ampel: null, niedrig: false,
      };
    }
    const s = o2Status(druckBar, nenn);
    if (s.niedrig) flaschenAuffaellig += 1;
    return {
      flascheId: x.flascheId, name: f?.name ?? "(gelöschte Flasche)", druckBar,
      nennfuelldruckBar: nenn, prozent: s.prozent, ampel: s.ampel, niedrig: s.niedrig,
    };
  });

  /**
   * ⚠️ DIE AMPEL WIRD NEU GEGEN HEUTE GERECHNET, nicht der damalige Zustand
   * angezeigt (§5.6.3, Begruendung `queries.ts:477-478`): ein damals gruenes Datum
   * kann inzwischen abgelaufen sein. Das ist eine bewusste Entscheidung und
   * bleibt — mit der Konsequenz, dass die Detailseite fuer DENSELBEN Check ueber
   * die Zeit verschiedene Ampeln zeigt. VERBINDLICH FUER DIE OBERFLAECHE: die
   * Seite schreibt aus, dass die Verfall-Ampel gegen HEUTE gerechnet ist. Ohne
   * diesen Satz liest jemand einen Nachweis falsch.
   */
  const verfallD: CheckVerfallDetail[] = leer ? [] : e.verfall.map((x) => {
    const a = arts.get(x.artikelId);
    const s = verfallStatus(x.verfall, schwellen, now);
    return {
      artikelId: x.artikelId, artikelName: a?.name ?? "(gelöschter Artikel)",
      verfall: x.verfall, ampel: s.ampel, abgelaufen: s.abgelaufen,
      text: chargeText(s, x.verfall),
    };
  });

  positionen.sort((x, y) =>
    x.fachLabel.localeCompare(y.fachLabel) || x.artikelName.localeCompare(y.artikelName));
  geraeteD.sort((x, y) => x.name.localeCompare(y.name));
  flaschenD.sort((x, y) => x.name.localeCompare(y.name));
  verfallD.sort((x, y) =>
    x.verfall.localeCompare(y.verfall) || x.artikelName.localeCompare(y.artikelName));

  return {
    id: c.id, fahrzeugId: c.fahrzeugId,
    fahrzeugName: fahrzeug?.name ?? "–", fahrzeugKennung: fahrzeug?.kennung ?? null,
    quelleId: c.quelleId, startedAt: c.startedAt, completedAt: c.completedAt,
    positionen, artikel: artikelD, geraete: geraeteD, flaschen: flaschenD, verfall: verfallD,
    altFormat: summe.altFormat,
    summe: {
      ...summe,
      // Die beiden Flaschenzaehler UEBERSCHREIBEN die Summe: das Detail hat den
      // Stamm gesehen, `summiereCheckErgebnis` nicht.
      flaschenAuffaellig, nichtBewertbar,
      verfallAuffaellig: verfallD.filter((v) => v.ampel !== "gruen").length,
    },
  };
}
```

- [ ] **Schritt 3: Grün, Mutationsprobe, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/checks.test.ts
```

**Mutationsprobe:** ersetze `x.nennfuelldruckBar ?? f?.nennfuelldruckBar ?? null` durch
`… ?? 200`. Erwartet: **rot** in „liefert null statt 200, wenn Snapshot UND Stamm fehlen".
Zurücknehmen.

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/lesepfade/checks.ts src/app/m/lagerbuch/_lib/lesepfade/checks.test.ts
git commit -m "feat(lagerbuch): _lib/lesepfade/checks.ts — eine Summe, und ?? 200 faellt

Beide Leser rufen summiereCheckErgebnis (§5.8.3). Der Nennfuelldruck geht in
BEIDEN ueber dieselbe Kette und endet auf null, nicht auf 200 (§5.12): fuer eine
300-bar-Flasche erschienen 150 bar sonst als 75 % statt 50 %, und die Ampel
spraenge von gelb auf gruen. Die Historie bekommt dieselbe Stammdaten-Kette wie
das Detail, damit der haeufigere Weg den seltenen ueberhaupt erst erreicht.

Das Detail rechnet die Flaschenzeilen selbst und ueberschreibt die zwei
Flaschenzaehler der Summe — die eine Stelle, an der beide auseinandergehen
duerfen, und sie geht in die sichere Richtung.

Die Verfall-Ampel wird gegen HEUTE gerechnet (§5.6.3); die Detailseite schreibt
das aus (Auflage an Teil 5). altFormat bleibt ein Feld der Antwort.

Mutationsprobe (?? 200) gefahren."
```

---

### Task 50: `_lib/lesepfade/bestellung.ts` — „bestellt seit …" statt eines Hakens

**Files:**
- Create: `src/app/m/lagerbuch/_lib/lesepfade/bestellung.ts`
- Test: `src/app/m/lagerbuch/_lib/lesepfade/bestellung.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` — `artikel`; `_lib/lesepfade/bestand.ts` — `bestandJeArtikel`,
  `type Leser`; `_lib/konstanten.ts` — `HANDLAGER_ID`; `_lib/domain/vorschlag.ts` — `braucht`,
  `vorschlagsmenge`.
- Produces:
  ```ts
  export type BestellZeile = {
    id: string; name: string; einheit: string; fach: string;
    bestand: number; mindestbestand: number; vorschlag: number;
    bestellt: boolean; bestelltSeit: Date | null; wareOffenbarDa: boolean };
  export function bestellvorschlag(db: Leser): BestellZeile[];
  ```
  Konsumenten: `/verwaltung/bestellung` (Teil 5), `bestellvorschlag.csv` (Teil 6).

**Drei Befunde aus §5.5, alle mit derselben Ursache:** `artikel.bestelltAt` trägt **genau eine wahre
Aussage** — „seit wann steht die aktuelle Markierung". Weder das Setzen (`bestellung.ts:14`) noch
das Nullen (`buchung.ts:42`) schreibt eine Journalzeile; alles Frühere ist weg, und **es gibt keine
Zeile, aus der man eine Historie rekonstruieren könnte**.

1. **`bestelltSeit` wird mitgeliefert.** Der heutige Leser wirft die einzige verwertbare Information
   weg (`bestellt: Boolean(a.bestelltAt)`). **Entschieden:** die Liste zeigt „bestellt seit
   &lt;Datum&gt;" statt eines Hakens — dieselbe Spalte, eine Aussage mehr, **null Migrationskosten**.
   ⚠️ **Am CSV-Format ändert das nichts:** dort bleibt `Status` = `bestellt`/`offen` (§9.2,
   1:1-Pflicht 28) — deshalb bleibt auch `bestellt: boolean` in der Zeile.
2. **`wareOffenbarDa`** ist neu. Nur ein **Zugang** löscht die Markierung, und der ist **nicht** der
   einzige Weg, wie Ware ankommt: `inventur.ts:44` und `csv.ts:37` schreiben `typ: "korrektur"`,
   `umlagerung.ts:28` schreibt `typ: "umlagerung"`. **Eine als Inventurkorrektur oder per CSV-Import
   eingebuchte Lieferung lässt die Markierung stehen.** ⚠️ **Das bleibt 1:1** — die Alternative
   („jede positive Korrektur am Handlager löscht die Markierung") ist erfunden, im Bestand nicht
   belegt und verwechselte eine Inventur-Zählung nach oben mit einer Lieferung. Stattdessen wird die
   Regel **ausgeschrieben** und gezeigt: ein Artikel, der „bestellt" ist und **nicht** unter
   Mindestbestand liegt, bekommt den Hinweis „Ware offenbar eingetroffen — Markierung zurücksetzen?".
3. ⚠️ **`wareOffenbarDa` kann in dieser Liste NIE `true` sein** — sie enthält nur Artikel unter
   Mindestbestand. Das Feld ist trotzdem hier, weil die **Seite** beide Mengen zeigt (Teil 5,
   Auflage): der Vorschlag **und** die bestellten Artikel, die schon wieder gedeckt sind. Die
   Berechnung gehört zur Zeile, nicht in die Komponente.

- [ ] **Schritt 1: Test schreiben, rot sehen**

`src/app/m/lagerbuch/_lib/lesepfade/bestellung.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, newId } from "../../_db/schema";
import { bestellvorschlag } from "./bestellung";
import { HANDLAGER_ID } from "../konstanten";

const NOW = new Date("2026-06-15T10:00:00Z");
const BESTELLT_AM = new Date("2026-06-01T08:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-bestellung-");
  t.db.insert(artikel).values([
    { id: "a-leer", name: "Leer", einheit: "Stk.", fach: "A1",
      mindestbestand: 10, aktiv: true, createdAt: NOW },
    { id: "a-bestellt", name: "Bestellt", einheit: "Stk.", fach: "A2",
      mindestbestand: 10, aktiv: true, createdAt: NOW, bestelltAt: BESTELLT_AM },
    { id: "a-voll", name: "Voll", einheit: "Stk.", fach: "A3",
      mindestbestand: 1, aktiv: true, createdAt: NOW },
    { id: "a-inaktiv", name: "Inaktiv", einheit: "Stk.", fach: "A4",
      mindestbestand: 99, aktiv: false, createdAt: NOW },
  ]).run();
  t.db.insert(chargen).values(
    { id: "c1", artikelId: "a-voll", chargenNr: "CH", verfall: "2030-01", createdAt: NOW }).run();
  t.db.insert(buchungen).values(
    { id: newId(), ts: NOW, typ: "zugang", artikelId: "a-voll", chargeId: "c1",
      lagerortId: HANDLAGER_ID, menge: 5, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: null }).run();
});
afterEach(() => t.schliessen());

describe("bestellvorschlag", () => {
  it("enthaelt genau die AKTIVEN Artikel unter Mindestbestand", () => {
    expect(bestellvorschlag(t.db).map((z) => z.id).sort()).toEqual(["a-bestellt", "a-leer"]);
  });

  it("rechnet gegen den HANDLAGER-Bestand", () => {
    expect(bestellvorschlag(t.db).find((z) => z.id === "a-leer")!.bestand).toBe(0);
  });

  it("liefert fuer jede Zeile einen Vorschlag >= 1", () => {
    for (const z of bestellvorschlag(t.db)) expect(z.vorschlag).toBeGreaterThanOrEqual(1);
  });

  it("liefert `bestelltSeit` — die einzige wahre Aussage der Spalte (§5.5)", () => {
    /**
     * Der heutige Leser wirft sie weg (`bestellt: Boolean(a.bestelltAt)`,
     * `queries.ts:520`). Die Liste zeigt ab jetzt „bestellt seit <Datum>" statt
     * eines Hakens — dieselbe Spalte, eine Aussage mehr, null Migrationskosten.
     */
    const z = bestellvorschlag(t.db).find((x) => x.id === "a-bestellt")!;
    expect(z.bestellt).toBe(true);
    expect(z.bestelltSeit?.getTime()).toBe(BESTELLT_AM.getTime());
  });

  it("behaelt `bestellt: boolean` — das CSV-Format bleibt 1:1", () => {
    // §9.2, 1:1-Pflicht 28: dort bleibt `Status` = bestellt/offen.
    const z = bestellvorschlag(t.db).find((x) => x.id === "a-leer")!;
    expect(z.bestellt).toBe(false);
    expect(z.bestelltSeit).toBeNull();
  });

  it("`wareOffenbarDa` ist in DIESER Liste nie wahr", () => {
    // Sie enthaelt nur Artikel unter Mindestbestand. Das Feld ist trotzdem in der
    // Zeile, weil die SEITE beide Mengen zeigt (Auflage an Teil 5).
    for (const z of bestellvorschlag(t.db)) expect(z.wareOffenbarDa).toBe(false);
  });
});
```

- [ ] **Schritt 2: `_lib/lesepfade/bestellung.ts` schreiben**

```ts
/**
 * Der Bestellvorschlag. Kein "use client", kein Icon-Import.
 *
 * `bestand` ist IMMER der HANDLAGER-Bestand (`queries.ts:519`, §5.2.1): der
 * Mindestbestand ist eine Nachschubschwelle fuers Zentrallager, kein Fahrzeugsoll.
 *
 * ⚠️ `artikel.bestelltAt` TRAEGT GENAU EINE WAHRE AUSSAGE (§5.5): „seit wann steht
 * die aktuelle Markierung". Weder das Setzen (`bestellung.ts:14`) noch das Nullen
 * (`buchung.ts:42`) schreibt eine Journalzeile; alles Fruehere ist weg, und es
 * gibt KEINE Zeile, aus der man eine Historie rekonstruieren koennte. Der Import
 * uebernimmt den Spaltenwert unveraendert und ERFINDET KEINE HISTORIE.
 *
 * ⚠️ NUR EIN ZUGANG LOESCHT DIE MARKIERUNG — und der ist nicht der einzige Weg,
 * wie Ware ankommt: `inventur.ts:44` und `csv.ts:37` schreiben `typ: "korrektur"`,
 * `umlagerung.ts:28` schreibt `typ: "umlagerung"`. Eine als Inventurkorrektur oder
 * per CSV-Import eingebuchte Lieferung laesst „bestellt" stehen. DAS BLEIBT 1:1:
 * die Alternative („jede positive Korrektur am Handlager loescht die Markierung")
 * ist erfunden, im Bestand nicht belegt und verwechselte eine Inventur-Zaehlung
 * nach oben mit einer Lieferung. Stattdessen wird die Regel AUSGESCHRIEBEN und
 * gezeigt — dafuer ist `wareOffenbarDa` da.
 */
import { eq } from "drizzle-orm";
import { artikel } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { braucht, vorschlagsmenge } from "../domain/vorschlag";
import { bestandJeArtikel, type Leser } from "./bestand";

export type BestellZeile = {
  id: string; name: string; einheit: string; fach: string;
  bestand: number; mindestbestand: number; vorschlag: number;
  /** ⚠️ BLEIBT, weil das CSV-Format 1:1 ist: `Status` = bestellt/offen (§9.2). */
  bestellt: boolean;
  /** NEU (§5.5): „bestellt seit <Datum>" statt eines Hakens. */
  bestelltSeit: Date | null;
  /**
   * NEU: als bestellt markiert, aber NICHT mehr unter Mindestbestand → „Ware
   * offenbar eingetroffen — Markierung zuruecksetzen?".
   *
   * ⚠️ In DIESER Liste immer `false` (sie enthaelt nur Artikel unter
   * Mindestbestand). Das Feld gehoert trotzdem zur Zeile und nicht in die
   * Komponente, weil die SEITE beide Mengen zeigt (Auflage an Teil 5).
   */
  wareOffenbarDa: boolean;
};

export function bestellvorschlag(db: Leser): BestellZeile[] {
  const bestand = bestandJeArtikel(db, HANDLAGER_ID);
  return db.select().from(artikel).where(eq(artikel.aktiv, true)).all()
    .map((a) => {
      const b = bestand.get(a.id) ?? 0;
      const unterMindest = braucht(b, a.mindestbestand);
      return {
        id: a.id, name: a.name, einheit: a.einheit, fach: a.fach,
        bestand: b, mindestbestand: a.mindestbestand,
        vorschlag: vorschlagsmenge(b, a.mindestbestand),
        bestellt: Boolean(a.bestelltAt),
        bestelltSeit: a.bestelltAt ?? null,
        wareOffenbarDa: Boolean(a.bestelltAt) && !unterMindest,
      };
    })
    .filter((z) => braucht(z.bestand, z.mindestbestand));
}
```

- [ ] **Schritt 3: Grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/bestellung.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/lesepfade/bestellung.ts \
        src/app/m/lagerbuch/_lib/lesepfade/bestellung.test.ts
git commit -m "feat(lagerbuch): _lib/lesepfade/bestellung.ts — 'bestellt seit' statt eines Hakens

§5.5: bestelltAt traegt genau eine wahre Aussage — seit wann die AKTUELLE
Markierung steht. Der heutige Leser wirft sie weg (Boolean(a.bestelltAt)). Die
Liste zeigt sie ab jetzt: dieselbe Spalte, eine Aussage mehr, null
Migrationskosten. bestellt: boolean BLEIBT, weil das CSV-Format 1:1 ist (§9.2).

wareOffenbarDa ist neu und schreibt eine Regel aus, die 1:1 bleibt: nur ein
ZUGANG loescht die Markierung, aber Inventur und CSV-Import buchen 'korrektur'.
Die Alternative (jede positive Korrektur loescht) ist erfunden und verwechselte
eine Inventur-Zaehlung nach oben mit einer Lieferung."
```

---

### Task 51: `_lib/lesepfade/bz.ts` — `refSnapshot` wird sichtbar, statt gestrichen zu werden

**Files:**
- Create: `src/app/m/lagerbuch/_lib/lesepfade/bz.ts`
- Test: `src/app/m/lagerbuch/_lib/lesepfade/bz.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` — `bzGeraete`, `bzKontrollen`, `lagerorte`; `_db/quelle.ts` —
  `quelleAufloeser`; `_lib/domain/bz.ts` (T36); `_lib/grenzen.ts` (T32) — `BZ_LOGBUCH_GRENZE`;
  `_db/client.ts` — `type DB`.
  ⚠️ **Dieser Pfad nimmt `DB`, nicht `Leser`** — er läuft nie in einer Transaktion (Festlegung H11).
- Produces:
  ```ts
  export type RefBereiche = { streifenLot?: string | null;
    level1Label?: string | null; level1Min?: number | null; level1Max?: number | null;
    level2Label?: string | null; level2Min?: number | null; level2Max?: number | null };
  export type BzKontrolleZeile = {
    id: string; ts: Date; wer: string; bestanden: boolean;
    level1Wert: number | null; level1ImBereich: boolean | null;
    level2Wert: number | null; level2ImBereich: boolean | null;
    kompresseVerfall: string | null; sticks: number; lanzetten: number;
    batterieGewechselt: boolean; kommentar: string | null;
    /** ⚠️ DAMALS gueltige Grenzen aus refSnapshot — nicht die heutigen (§5.11). */
    refDamals: RefBereiche | null };
  export type LagerortOption = { id: string; name: string; typ: "lager" | "fahrzeug" };
  export type BzGeraetZeile = { id: string; name: string; barcode: string | null;
    lagerortName: string; aktiv: boolean; letzteKontrolle: Date | null;
    letztesBestanden: boolean | null; faelligkeit: BzFaelligkeit };
  export type BzGeraetDetail = { geraet: typeof bzGeraete.$inferSelect; lagerortName: string;
    faelligkeit: BzFaelligkeit; akku: BzAkkuKennzahl; logbuch: BzKontrolleZeile[] };

  export function lagerortOptionen(db: DB): LagerortOption[];
  export function bzGeraeteUebersicht(db: DB, now?: Date): BzGeraetZeile[];
  export function bzGeraetDetail(db: DB, id: string, now?: Date): BzGeraetDetail | null;
  export function bzGeraetByBarcode(db: DB, barcode: string): { id: string } | null;
  export function bzLogbuchGesamt(db: DB, grenze?: number):
    { zeilen: (BzKontrolleZeile & { geraetName: string })[]; mehrVorhanden: boolean };
  export function bzAkkuKennzahlGesamt(db: DB): BzAkkuKennzahl;
  ```
  Konsumenten: `/verwaltung/bz`, `/verwaltung/bz/[id]`, `/verwaltung/bz/scan` (Teil 5).

**Die eine Änderung gegenüber `src/db/bz.ts`: `refSnapshot` wird gelesen** (§5.11). Nachgeprüft
liefert `grep -rn refSnapshot src/` außerhalb von Tests **nur** die Schreibstelle und die
Spaltendefinition. Die Zusage „nachweisfester Snapshot der Referenzbereiche zum Messzeitpunkt"
(`schema.ts:212`) existiert damit **als Datum, nicht als Aussage** — dieselbe Klasse wie
`BESTELL_FAKTOR`, nur andersherum: geschrieben, nie gelesen. **Entschieden:** die Spalte bleibt
**und wird sichtbar** — das Logbuch zeigt je Zeile die **damals** gültigen Grenzen. Ohne das liest
man eine alte Kontrolle gegen einen **neuen** Referenzbereich, und das ist die Fehlaussage, die ein
Nachweis nicht machen darf.

⚠️ **Der rohe JSON-String wird GELESEN, nicht re-serialisiert.** Er entsteht als `JSON.stringify`
über sieben Schlüssel in **dieser** Reihenfolge; ein Import, der ihn parst und neu serialisiert,
**verändert einen Nachweis** (Teil 1, T7). Diese Datei parst ihn nur **zur Anzeige** und schreibt ihn
nie zurück.

⚠️ **`bzAkkuKennzahlGesamt` mittelt nur GERÄTEINTERNE Intervalle** (`src/db/bz.ts:137-161`) — sie
klebt **nicht** die Zeitreihen verschiedener Geräte aneinander. Ein `akkuLebensdauer(alleTs)` über
alle Geräte auf einmal wäre die naheliegende Vereinfachung und **falsch**.

- [ ] **Schritt 1: Test schreiben, rot sehen**

`src/app/m/lagerbuch/_lib/lesepfade/bz.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { bzGeraete, bzKontrollen, lagerorte, users, newId } from "../../_db/schema";
import { lagerortOptionen, bzGeraeteUebersicht, bzGeraetDetail, bzGeraetByBarcode,
         bzLogbuchGesamt, bzAkkuKennzahlGesamt } from "./bz";
import { BZ_LOGBUCH_GRENZE } from "../grenzen";

const NOW = new Date("2026-06-15T10:00:00Z");
const vorTagen = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-bz-");
  t.db.insert(lagerorte).values([
    { id: "handlager", name: "Handlager", typ: "lager", kennung: null, aktiv: true },
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", aktiv: true },
    { id: "alt", name: "Altbestand", typ: "lager", kennung: null, aktiv: false },
  ]).run();
  t.db.insert(users).values(
    { id: "sub-1", name: "Anna Beispiel", email: "anna@example.test", lastLoginAt: NOW }).run();
  t.db.insert(bzGeraete).values([
    { id: "bz-1", name: "Accu-Chek A", barcode: "1234567890128", lagerortId: "rtw-1",
      streifenLot: "LOT-NEU", level1Label: "Level 1", level1Min: 40, level1Max: 60,
      level2Label: "Level 2", level2Min: 250, level2Max: 350, aktiv: true, createdAt: NOW },
    { id: "bz-nie", name: "Nie geprüft", barcode: null, lagerortId: "handlager",
      streifenLot: null, level1Label: null, level1Min: null, level1Max: null,
      level2Label: null, level2Min: null, level2Max: null, aktiv: true, createdAt: NOW },
  ]).run();
  // refSnapshot mit den DAMALS gueltigen Grenzen — heute stehen andere am Geraet.
  t.db.insert(bzKontrollen).values([
    { id: "k1", geraetId: "bz-1", ts: vorTagen(40), quelleTyp: "oidc", quelleId: "sub-1",
      level1Wert: 50, level1ImBereich: true, level2Wert: 300, level2ImBereich: true,
      kompresseVerfall: "2027-01", sticks: 40, lanzetten: 30, batterieGewechselt: true,
      kommentar: null, bestanden: true,
      refSnapshot: '{"streifenLot":"LOT-ALT","level1Label":"L1","level1Min":30,'
        + '"level1Max":70,"level2Label":"L2","level2Min":200,"level2Max":400}' },
    { id: "k2", geraetId: "bz-1", ts: vorTagen(10), quelleTyp: "token", quelleId: "111-111",
      level1Wert: 55, level1ImBereich: true, level2Wert: 310, level2ImBereich: true,
      kompresseVerfall: null, sticks: 20, lanzetten: 10, batterieGewechselt: true,
      kommentar: "ok", bestanden: true, refSnapshot: null },
  ]).run();
});
afterEach(() => t.schliessen());

describe("lagerortOptionen", () => {
  it("liefert nur AKTIVE Lagerorte, sortiert nach Typ und Name", () => {
    expect(lagerortOptionen(t.db).map((o) => o.id)).toEqual(["rtw-1", "handlager"]);
  });
});

describe("bzGeraeteUebersicht", () => {
  it("nennt die letzte Kontrolle und die Faelligkeit", () => {
    const z = bzGeraeteUebersicht(t.db, NOW).find((x) => x.id === "bz-1")!;
    expect(z.letzteKontrolle?.getTime()).toBe(vorTagen(10).getTime());
    expect(z.letztesBestanden).toBe(true);
    expect(z.faelligkeit.nieGeprueft).toBe(false);
    expect(z.lagerortName).toBe("RTW 1");
  });

  it("ein nie geprueftes Geraet ist ROT mit ueberfaellig FALSE", () => {
    // Die Falle aus §5.11 — die Anzeige muss `nieGeprueft` eigenstaendig
    // behandeln, sonst steht „nicht ueberfaellig" neben einer roten Ampel.
    const z = bzGeraeteUebersicht(t.db, NOW).find((x) => x.id === "bz-nie")!;
    expect(z.letzteKontrolle).toBeNull();
    expect(z.faelligkeit).toMatchObject({ ampel: "rot", ueberfaellig: false, nieGeprueft: true });
  });
});

describe("bzGeraetDetail — refSnapshot wird SICHTBAR (§5.11)", () => {
  it("zeigt je Logbuchzeile die DAMALS gueltigen Grenzen, nicht die heutigen", () => {
    /**
     * Nachgeprueft: `grep -rn refSnapshot src/` liefert ausserhalb von Tests nur
     * die SCHREIBstelle und die Spaltendefinition. Die Zusage „nachweisfester
     * Snapshot der Referenzbereiche zum Messzeitpunkt" existiert als DATUM, nicht
     * als AUSSAGE. Ohne diese Anzeige liest man eine alte Kontrolle gegen einen
     * NEUEN Referenzbereich — die Fehlaussage, die ein Nachweis nicht machen darf.
     */
    const d = bzGeraetDetail(t.db, "bz-1", NOW)!;
    const alt = d.logbuch.find((z) => z.id === "k1")!;
    expect(alt.refDamals).toMatchObject({
      streifenLot: "LOT-ALT", level1Min: 30, level1Max: 70, level2Min: 200, level2Max: 400,
    });
    // Am Geraet stehen HEUTE 40..60 bzw. 250..350.
    expect(d.geraet.level1Min).toBe(40);
  });

  it("liefert refDamals: null, wenn kein Snapshot da ist", () => {
    expect(bzGeraetDetail(t.db, "bz-1", NOW)!.logbuch.find((z) => z.id === "k2")!.refDamals)
      .toBeNull();
  });

  it("stuerzt bei KAPUTTEM refSnapshot nicht ab", () => {
    t.db.insert(bzKontrollen).values({
      id: "k3", geraetId: "bz-1", ts: vorTagen(1), quelleTyp: "system", quelleId: "s",
      level1Wert: null, level1ImBereich: null, level2Wert: null, level2ImBereich: null,
      kompresseVerfall: null, sticks: 0, lanzetten: 0, batterieGewechselt: false,
      kommentar: null, bestanden: false, refSnapshot: "{kaputt",
    }).run();
    expect(bzGeraetDetail(t.db, "bz-1", NOW)!.logbuch.find((z) => z.id === "k3")!.refDamals)
      .toBeNull();
  });

  it("loest die Quelle auf: Klarname bzw. Token-Rohwert", () => {
    const d = bzGeraetDetail(t.db, "bz-1", NOW)!;
    expect(d.logbuch.find((z) => z.id === "k1")!.wer).toBe("Anna Beispiel");
    // Kein Token mit diesem Code angelegt → Rueckfall auf die rohe Kennung
    // (`quelleAufloeser`, Teil 1 T13).
    expect(d.logbuch.find((z) => z.id === "k2")!.wer).toBe("111-111");
  });

  it("sortiert das Logbuch absteigend und rechnet den Akku", () => {
    const d = bzGeraetDetail(t.db, "bz-1", NOW)!;
    expect(d.logbuch.map((z) => z.id)).toEqual(["k2", "k1"]);
    expect(d.akku).toEqual({ tageDurchschnitt: 30, anzahlWechsel: 2, anzahlIntervalle: 1 });
  });

  it("liefert null fuer eine unbekannte ID", () => {
    expect(bzGeraetDetail(t.db, "x", NOW)).toBeNull();
  });
});

describe("bzGeraetByBarcode", () => {
  it("findet BYTE-EXAKT", () => {
    expect(bzGeraetByBarcode(t.db, "1234567890128")).toEqual({ id: "bz-1" });
    expect(bzGeraetByBarcode(t.db, " 1234567890128")).toBeNull();
    expect(bzGeraetByBarcode(t.db, "1234567890129")).toBeNull();
  });
});

describe("bzLogbuchGesamt — der Deckel wird beobachtbar", () => {
  it("liefert mehrVorhanden bei BZ_LOGBUCH_GRENZE + 1", () => {
    for (let i = 0; i < BZ_LOGBUCH_GRENZE; i++) {
      t.db.insert(bzKontrollen).values({
        id: `m${i}`, geraetId: "bz-1", ts: vorTagen(1), quelleTyp: "system", quelleId: "s",
        level1Wert: null, level1ImBereich: null, level2Wert: null, level2ImBereich: null,
        kompresseVerfall: null, sticks: 0, lanzetten: 0, batterieGewechselt: false,
        kommentar: null, bestanden: false, refSnapshot: null,
      }).run();
    }
    const l = bzLogbuchGesamt(t.db);
    expect(l.zeilen).toHaveLength(BZ_LOGBUCH_GRENZE);
    expect(l.mehrVorhanden).toBe(true);
    expect(l.zeilen[0].geraetName).toBe("Accu-Chek A");
  });
});

describe("bzAkkuKennzahlGesamt — nur GERAETEINTERNE Intervalle", () => {
  it("klebt die Zeitreihen verschiedener Geraete NICHT aneinander", () => {
    /**
     * `src/db/bz.ts:137-161`. Ein `akkuLebensdauer(alleTs)` ueber alle Geraete auf
     * einmal waere die naheliegende Vereinfachung und FALSCH: es entstuende ein
     * Intervall zwischen dem letzten Wechsel des einen und dem ersten des anderen
     * Geraets.
     */
    t.db.insert(bzKontrollen).values([
      { id: "n1", geraetId: "bz-nie", ts: vorTagen(200), quelleTyp: "system", quelleId: "s",
        level1Wert: 1, level1ImBereich: null, level2Wert: null, level2ImBereich: null,
        kompresseVerfall: null, sticks: 0, lanzetten: 0, batterieGewechselt: true,
        kommentar: null, bestanden: true, refSnapshot: null },
      { id: "n2", geraetId: "bz-nie", ts: vorTagen(100), quelleTyp: "system", quelleId: "s",
        level1Wert: 1, level1ImBereich: null, level2Wert: null, level2ImBereich: null,
        kompresseVerfall: null, sticks: 0, lanzetten: 0, batterieGewechselt: true,
        kommentar: null, bestanden: true, refSnapshot: null },
    ]).run();
    // bz-1: EIN Intervall von 30 Tagen. bz-nie: EIN Intervall von 100 Tagen.
    // Mittel = 65. Ueber alle Zeitstempel geklebt waeren es drei Intervalle.
    expect(bzAkkuKennzahlGesamt(t.db)).toEqual({
      tageDurchschnitt: 65, anzahlWechsel: 4, anzahlIntervalle: 2,
    });
  });
});
```

- [ ] **Schritt 2: `_lib/lesepfade/bz.ts` schreiben**

```ts
/**
 * BZ-Geraete: Uebersicht, Detail, Logbuch, Akku-Kennzahl.
 * Kein "use client", kein Icon-Import.
 *
 * DIE EINE AENDERUNG GEGENUEBER `src/db/bz.ts`: `refSnapshot` WIRD GELESEN
 * (§5.11). Nachgeprueft liefert `grep -rn refSnapshot src/` ausserhalb von Tests
 * nur die Schreibstelle und die Spaltendefinition — die Zusage „nachweisfester
 * Snapshot der Referenzbereiche zum Messzeitpunkt" existiert als DATUM, nicht als
 * AUSSAGE. Das Logbuch zeigt ab jetzt je Zeile die DAMALS gueltigen Grenzen; ohne
 * das liest man eine alte Kontrolle gegen einen NEUEN Referenzbereich, und das ist
 * die Fehlaussage, die ein Nachweis nicht machen darf.
 *
 * ⚠️ DER ROHE JSON-STRING WIRD NUR GELESEN, NIE ZURUECKGESCHRIEBEN. Er entsteht
 * als `JSON.stringify` ueber sieben Schluessel in DIESER Reihenfolge; ein Import,
 * der ihn parst und neu serialisiert, VERAENDERT EINEN NACHWEIS (Teil 1, T7).
 */
import { desc, eq } from "drizzle-orm";
import { bzGeraete, bzKontrollen, lagerorte } from "../../_db/schema";
import { quelleAufloeser } from "../../_db/quelle";
import { akkuLebensdauer, bzFaelligkeit,
         type BzAkkuKennzahl, type BzFaelligkeit } from "../domain/bz";
import { BZ_LOGBUCH_GRENZE } from "../grenzen";
import type { DB } from "../../_db/client";

/** Die sieben Schluessel aus `refSnapshot`, alle optional — ein Altsnapshot kann
 *  weniger tragen, und ein fehlender Schluessel ist kein Fehler. */
export type RefBereiche = {
  streifenLot?: string | null;
  level1Label?: string | null; level1Min?: number | null; level1Max?: number | null;
  level2Label?: string | null; level2Min?: number | null; level2Max?: number | null;
};

/** Parst `refSnapshot`. Jeder Lesefehler wird `null` — eine kaputte Zeile darf die
 *  Detailseite nicht abstuerzen lassen, und der Nachweis ist dann eben unlesbar. */
function refDamalsAus(roh: string | null): RefBereiche | null {
  if (!roh) return null;
  try {
    const d: unknown = JSON.parse(roh);
    if (d === null || typeof d !== "object" || Array.isArray(d)) return null;
    return d as RefBereiche;
  } catch {
    return null;
  }
}

export type BzKontrolleZeile = {
  id: string; ts: Date; wer: string; bestanden: boolean;
  level1Wert: number | null; level1ImBereich: boolean | null;
  level2Wert: number | null; level2ImBereich: boolean | null;
  kompresseVerfall: string | null; sticks: number; lanzetten: number;
  batterieGewechselt: boolean; kommentar: string | null;
  /** ⚠️ Die DAMALS gueltigen Grenzen — nicht die heutigen aus `bz_geraete`. */
  refDamals: RefBereiche | null;
};

function toZeile(
  k: typeof bzKontrollen.$inferSelect,
  wer: (quelleTyp: string, quelleId: string) => string,
): BzKontrolleZeile {
  return {
    id: k.id, ts: k.ts, wer: wer(k.quelleTyp, k.quelleId), bestanden: k.bestanden,
    level1Wert: k.level1Wert, level1ImBereich: k.level1ImBereich,
    level2Wert: k.level2Wert, level2ImBereich: k.level2ImBereich,
    kompresseVerfall: k.kompresseVerfall, sticks: k.sticks, lanzetten: k.lanzetten,
    batterieGewechselt: k.batterieGewechselt, kommentar: k.kommentar,
    refDamals: refDamalsAus(k.refSnapshot),
  };
}

export type LagerortOption = { id: string; name: string; typ: "lager" | "fahrzeug" };

/** Aktive Lagerorte als Auswahl fuer Geraete-Formulare. */
export function lagerortOptionen(db: DB): LagerortOption[] {
  return db.select().from(lagerorte).where(eq(lagerorte.aktiv, true)).all()
    .map((l) => ({ id: l.id, name: l.name, typ: l.typ }))
    .sort((a, b) => a.typ.localeCompare(b.typ) || a.name.localeCompare(b.name));
}

export type BzGeraetZeile = {
  id: string; name: string; barcode: string | null; lagerortName: string; aktiv: boolean;
  letzteKontrolle: Date | null; letztesBestanden: boolean | null; faelligkeit: BzFaelligkeit;
};

export function bzGeraeteUebersicht(db: DB, now: Date = new Date()): BzGeraetZeile[] {
  const geraete = db.select().from(bzGeraete).all();
  const namen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  const kontrollen = db.select().from(bzKontrollen).all();
  const letzteProGeraet = new Map<string, (typeof kontrollen)[number]>();
  for (const k of kontrollen) {
    const prev = letzteProGeraet.get(k.geraetId);
    if (!prev || k.ts > prev.ts) letzteProGeraet.set(k.geraetId, k);
  }
  return geraete
    .map((g) => {
      const letzte = letzteProGeraet.get(g.id) ?? null;
      return {
        id: g.id, name: g.name, barcode: g.barcode,
        lagerortName: namen.get(g.lagerortId) ?? "–", aktiv: g.aktiv,
        letzteKontrolle: letzte ? letzte.ts : null,
        letztesBestanden: letzte ? letzte.bestanden : null,
        // ⚠️ `null` → rot MIT ueberfaellig false. Die Anzeige muss `nieGeprueft`
        // eigenstaendig behandeln (§5.11).
        faelligkeit: bzFaelligkeit(letzte ? letzte.ts : null, now),
      };
    })
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
}

export type BzGeraetDetail = {
  geraet: typeof bzGeraete.$inferSelect;
  lagerortName: string;
  faelligkeit: BzFaelligkeit;
  akku: BzAkkuKennzahl;
  /** chronologisch ABSTEIGEND */
  logbuch: BzKontrolleZeile[];
};

export function bzGeraetDetail(
  db: DB, id: string, now: Date = new Date(),
): BzGeraetDetail | null {
  const g = db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get();
  if (!g) return null;
  const lagerortName =
    db.select().from(lagerorte).where(eq(lagerorte.id, g.lagerortId)).get()?.name ?? "–";
  const ks = db.select().from(bzKontrollen)
    .where(eq(bzKontrollen.geraetId, id))
    // id-Tiebreaker: `ts` sind UNIX-Sekunden (§5.14.4).
    .orderBy(desc(bzKontrollen.ts), desc(bzKontrollen.id))
    .all();
  const letzte = ks[0] ?? null;
  const wer = quelleAufloeser(db);
  return {
    geraet: g, lagerortName,
    faelligkeit: bzFaelligkeit(letzte ? letzte.ts : null, now),
    akku: akkuLebensdauer(ks.filter((k) => k.batterieGewechselt).map((k) => k.ts)),
    logbuch: ks.map((k) => toZeile(k, wer)),
  };
}

/** BYTE-EXAKTE Suche — Barcodes werden nicht normalisiert, nicht getrimmt, nicht
 *  grossgeschrieben (Teil 1, T7). */
export function bzGeraetByBarcode(db: DB, barcode: string): { id: string } | null {
  const g = db.select().from(bzGeraete).where(eq(bzGeraete.barcode, barcode)).get();
  return g ? { id: g.id } : null;
}

export function bzLogbuchGesamt(db: DB, grenze: number = BZ_LOGBUCH_GRENZE) {
  const namen = new Map(db.select().from(bzGeraete).all().map((g) => [g.id, g.name]));
  const wer = quelleAufloeser(db);
  const rows = db.select().from(bzKontrollen)
    .orderBy(desc(bzKontrollen.ts), desc(bzKontrollen.id))
    .limit(grenze + 1)
    .all();
  return {
    mehrVorhanden: rows.length > grenze,
    zeilen: rows.slice(0, grenze).map((k) => ({
      ...toZeile(k, wer), geraetName: namen.get(k.geraetId) ?? "–",
    })),
  };
}

/**
 * Ø Akku-Lebensdauer ueber ALLE Geraete.
 *
 * ⚠️ NUR GERAETEINTERNE Intervalle (`src/db/bz.ts:137-161`). Ein
 * `akkuLebensdauer(alleTs)` ueber alle Geraete auf einmal waere die naheliegende
 * Vereinfachung und FALSCH: es entstuende ein Intervall zwischen dem letzten
 * Wechsel des einen und dem ersten des anderen Geraets.
 */
export function bzAkkuKennzahlGesamt(db: DB): BzAkkuKennzahl {
  const ks = db.select().from(bzKontrollen)
    .where(eq(bzKontrollen.batterieGewechselt, true)).all();
  const proGeraet = new Map<string, Date[]>();
  for (const k of ks) {
    const arr = proGeraet.get(k.geraetId) ?? [];
    arr.push(k.ts);
    proGeraet.set(k.geraetId, arr);
  }
  let summe = 0;
  let anzahlIntervalle = 0;
  let anzahlWechsel = 0;
  for (const ts of proGeraet.values()) {
    const sorted = ts.slice().sort((a, b) => a.getTime() - b.getTime());
    anzahlWechsel += sorted.length;
    for (let i = 1; i < sorted.length; i++) {
      summe += (sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000;
      anzahlIntervalle += 1;
    }
  }
  return {
    tageDurchschnitt: anzahlIntervalle < 1 ? null : summe / anzahlIntervalle,
    anzahlWechsel, anzahlIntervalle,
  };
}
```

- [ ] **Schritt 3: Grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/bz.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/lesepfade/bz.ts src/app/m/lagerbuch/_lib/lesepfade/bz.test.ts
git commit -m "feat(lagerbuch): _lib/lesepfade/bz.ts — refSnapshot wird sichtbar

§5.11: die Spalte wird heute geschrieben und NIRGENDS gelesen — die Zusage
'nachweisfester Snapshot der Referenzbereiche' existiert als Datum, nicht als
Aussage. Das Logbuch zeigt ab jetzt je Zeile die DAMALS gueltigen Grenzen; ohne
das liest man eine alte Kontrolle gegen einen neuen Referenzbereich.

Der rohe JSON-String wird nur GELESEN, nie zurueckgeschrieben — ein Parse-und-neu-
Serialisieren veraenderte einen Nachweis.

bzAkkuKennzahlGesamt mittelt nur geraeteinterne Intervalle: die naheliegende
Vereinfachung ueber alle Zeitstempel erzeugte ein Intervall zwischen zwei
verschiedenen Geraeten."
```

---

### Task 52: `_lib/lesepfade/o2.ts` — keine Messung heißt `status: null`, nicht 0 %

**Files:**
- Create: `src/app/m/lagerbuch/_lib/lesepfade/o2.ts`
- Test: `src/app/m/lagerbuch/_lib/lesepfade/o2.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` — `o2Flaschen`, `o2Messungen`, `lagerorte`; `_db/quelle.ts` —
  `quelleAufloeser`; `_lib/domain/o2.ts` (T34); `_db/client.ts` — `type DB`.
  ⚠️ **Dieser Pfad nimmt `DB`, nicht `Leser`** — er läuft nie in einer Transaktion (Festlegung H11).
- Produces:
  ```ts
  export type O2FlascheZeile = {
    id: string; name: string; lagerortName: string; aktiv: boolean;
    groesseLiter: number | null; nennfuelldruckBar: number;
    letzterDruck: number | null; letzteMessung: Date | null; status: O2Status | null };
  export type O2MessungZeile = { id: string; ts: Date; druckBar: number; wer: string;
    kommentar: string | null; ausCheck: boolean };
  export type O2FlascheDetail = { flasche: typeof o2Flaschen.$inferSelect;
    lagerortName: string; status: O2Status | null; verlauf: O2MessungZeile[] };
  export type O2FlascheCheckZeile = { id: string; name: string;
    nennfuelldruckBar: number; letzterDruck: number | null };

  export function o2FlaschenUebersicht(db: DB): O2FlascheZeile[];
  export function o2FlascheDetail(db: DB, id: string): O2FlascheDetail | null;
  export function o2FlaschenFuerLagerort(db: DB, lagerortId: string): O2FlascheCheckZeile[];
  export function lagerorteFuerFlaschen(db: DB): { id: string; name: string }[];
  ```
  Konsumenten: `/verwaltung/sauerstoff`, `/verwaltung/sauerstoff/[id]` (Teil 5),
  `/helfer/check` (Teil 4).

**Zwei Regeln, die 1:1 mitgehen** (§5.12): **der aktuelle Druck ist immer die jüngste Messung** — es
gibt **kein** denormalisiertes Feld, und damit ist eine falsche Messung **durch eine neue
korrigierbar**, ohne die alte anzufassen. Und **keine Messung → `status: null`**, nicht `0 %`; die
Oberfläche zeigt „keine Messung", nicht eine leere rote Ampel.

**Eine Ergänzung: `ausCheck`** (§5.8.1, die Auflage). Eine Messung aus dem Fahrzeug-Check trägt
`quelleTyp = "token"` und einen Kommentar `"Fahrzeug-Check <referenz>"`; eine manuell erfasste trägt
`quelleTyp = "oidc"`. **Die Angabe ist heute schon da; sie wird nur nirgends gezeigt.** Damit ist der
Falle-8-Befund („durchgeklickt sieht aus wie geprüft") nicht beseitigt, aber **lesbar** — und das ist
die ehrliche Stufe, solange Variante (c) Backlog ist.

⚠️ **`ausCheck` hängt am `quelleTyp`, nicht am Kommentartext.** Ein Text-`startsWith` bräche, sobald
jemand die Meldung umformuliert; der `quelleTyp` ist eine Spalte mit Enum.

- [ ] **Schritt 1: Test schreiben, rot sehen**

`src/app/m/lagerbuch/_lib/lesepfade/o2.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { lagerorte, o2Flaschen, o2Messungen, users, newId } from "../../_db/schema";
import { o2FlaschenUebersicht, o2FlascheDetail,
         o2FlaschenFuerLagerort, lagerorteFuerFlaschen } from "./o2";

const NOW = new Date("2026-06-15T10:00:00Z");
const frueher = new Date("2026-06-01T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-o2-");
  t.db.insert(lagerorte).values([
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", aktiv: true },
    { id: "alt", name: "Altbestand", typ: "lager", kennung: null, aktiv: false },
  ]).run();
  t.db.insert(users).values(
    { id: "sub-1", name: "Anna Beispiel", email: null, lastLoginAt: NOW }).run();
  t.db.insert(o2Flaschen).values([
    { id: "f-200", name: "O2 klein", lagerortId: "rtw-1", groesseLiter: 2,
      nennfuelldruckBar: 200, aktiv: true, createdAt: NOW },
    { id: "f-300", name: "O2 gross", lagerortId: "rtw-1", groesseLiter: 10,
      nennfuelldruckBar: 300, aktiv: true, createdAt: NOW },
    { id: "f-ohne", name: "O2 ohne Messung", lagerortId: "rtw-1", groesseLiter: null,
      nennfuelldruckBar: 200, aktiv: true, createdAt: NOW },
    { id: "f-aus", name: "O2 ausgemustert", lagerortId: "rtw-1", groesseLiter: null,
      nennfuelldruckBar: 200, aktiv: false, createdAt: NOW },
  ]).run();
  t.db.insert(o2Messungen).values([
    { id: "m-alt", flascheId: "f-200", ts: frueher, druckBar: 30,
      quelleTyp: "oidc", quelleId: "sub-1", kommentar: null },
    { id: "m-neu", flascheId: "f-200", ts: NOW, druckBar: 180,
      quelleTyp: "oidc", quelleId: "sub-1", kommentar: "nachgefüllt" },
    { id: "m-check", flascheId: "f-300", ts: NOW, druckBar: 150,
      quelleTyp: "token", quelleId: "111-111", kommentar: "Fahrzeug-Check check:abc" },
  ]).run();
});
afterEach(() => t.schliessen());

describe("o2FlaschenUebersicht", () => {
  it("nimmt als aktuellen Druck die JUENGSTE Messung", () => {
    // Kein denormalisiertes Feld — damit ist eine falsche Messung DURCH EINE NEUE
    // korrigierbar, ohne die alte anzufassen (§5.12).
    const z = o2FlaschenUebersicht(t.db).find((x) => x.id === "f-200")!;
    expect(z.letzterDruck).toBe(180);
    expect(z.letzteMessung?.getTime()).toBe(NOW.getTime());
    expect(z.status).toMatchObject({ prozent: 90, ampel: "gruen", niedrig: false });
  });

  it("rechnet gegen den EIGENEN Nennfuelldruck der Flasche", () => {
    // 150 von 300 = 50 % → gruen. Mit einem ?? 200 waeren es 75 %.
    expect(o2FlaschenUebersicht(t.db).find((x) => x.id === "f-300")!.status)
      .toMatchObject({ prozent: 50, ampel: "gruen" });
  });

  it("liefert bei KEINER Messung status null, nicht 0 %", () => {
    /**
     * §5.12, Eigenschaft 4: die Oberflaeche zeigt „keine Messung", nicht eine
     * leere rote Ampel. Ein `o2Status(0, nenn)` ergaebe 0 % / rot und behauptete
     * eine Aussage, die niemand gemacht hat.
     */
    const z = o2FlaschenUebersicht(t.db).find((x) => x.id === "f-ohne")!;
    expect(z.letzterDruck).toBeNull();
    expect(z.letzteMessung).toBeNull();
    expect(z.status).toBeNull();
  });

  it("sortiert aktive nach vorn, dann alphabetisch", () => {
    expect(o2FlaschenUebersicht(t.db).map((z) => z.id))
      .toEqual(["f-300", "f-200", "f-ohne", "f-aus"]);
  });
});

describe("o2FlascheDetail — die Herkunft der Messung ist SICHTBAR (§5.8.1)", () => {
  it("kennzeichnet eine check-stammende Messung", () => {
    /**
     * VERBINDLICH: „Die Herkunft einer Messung ist in jeder Anzeige sichtbar."
     * Die Angabe ist heute schon da (`quelleTyp`), sie wird nur nirgends gezeigt.
     * Damit ist der Falle-8-Befund („durchgeklickt sieht aus wie geprueft") nicht
     * beseitigt, aber LESBAR — die ehrliche Stufe, solange Variante (c) Backlog
     * ist.
     */
    const d = o2FlascheDetail(t.db, "f-300")!;
    expect(d.verlauf[0].ausCheck).toBe(true);
    expect(d.verlauf[0].wer).toBe("111-111");
  });

  it("kennzeichnet eine manuell erfasste Messung NICHT als check-stammend", () => {
    const d = o2FlascheDetail(t.db, "f-200")!;
    expect(d.verlauf[0].ausCheck).toBe(false);
    expect(d.verlauf[0].wer).toBe("Anna Beispiel");
  });

  it("`ausCheck` haengt am quelleTyp, nicht am Kommentartext", () => {
    // Ein Text-startsWith braeche, sobald jemand die Meldung umformuliert.
    t.db.insert(o2Messungen).values({
      id: "m-x", flascheId: "f-ohne", ts: NOW, druckBar: 100,
      quelleTyp: "token", quelleId: "222-222", kommentar: null,
    }).run();
    expect(o2FlascheDetail(t.db, "f-ohne")!.verlauf[0].ausCheck).toBe(true);
  });

  it("sortiert den Verlauf absteigend und nennt den Status der juengsten Messung", () => {
    const d = o2FlascheDetail(t.db, "f-200")!;
    expect(d.verlauf.map((m) => m.id)).toEqual(["m-neu", "m-alt"]);
    expect(d.status?.prozent).toBe(90);
    expect(d.lagerortName).toBe("RTW 1");
  });

  it("liefert null fuer eine unbekannte ID", () => {
    expect(o2FlascheDetail(t.db, "x")).toBeNull();
  });
});

describe("o2FlaschenFuerLagerort — nur AKTIVE, mit Vorschlagswert", () => {
  it("liefert je Flasche Nennfuelldruck und letzten Druck", () => {
    const l = o2FlaschenFuerLagerort(t.db, "rtw-1");
    expect(l.map((f) => f.id)).toEqual(["f-300", "f-200", "f-ohne"]);
    expect(l.find((f) => f.id === "f-200")!.letzterDruck).toBe(180);
    expect(l.find((f) => f.id === "f-ohne")!.letzterDruck).toBeNull();
  });
  it("blendet inaktive Flaschen aus", () => {
    expect(o2FlaschenFuerLagerort(t.db, "rtw-1").some((f) => f.id === "f-aus")).toBe(false);
  });
});

describe("lagerorteFuerFlaschen", () => {
  it("liefert nur aktive Lagerorte, alphabetisch", () => {
    expect(lagerorteFuerFlaschen(t.db)).toEqual([{ id: "rtw-1", name: "RTW 1" }]);
  });
});
```

⚠️ `o2FlaschenFuerLagerort` sortiert nach **Name**; im Test steht `"O2 gross"` vor `"O2 klein"` vor
`"O2 ohne Messung"` — das ist die erwartete Reihenfolge.

- [ ] **Schritt 2: `_lib/lesepfade/o2.ts` schreiben**

```ts
/**
 * Sauerstoffflaschen. Kein "use client", kein Icon-Import.
 *
 * ZWEI REGELN GEHEN 1:1 MIT (§5.12):
 *
 * 1. DER AKTUELLE DRUCK IST IMMER DIE JUENGSTE MESSUNG. Es gibt KEIN
 *    denormalisiertes Feld — damit ist eine falsche Messung DURCH EINE NEUE
 *    korrigierbar, ohne die alte anzufassen. Das ist zugleich der Grund, warum
 *    `o2_messungen` KEINE Append-only-Trigger bekommt (§4.4, Entscheidung 5 c).
 * 2. KEINE MESSUNG → `status: null`, NICHT `0 %`. Die Oberflaeche zeigt „keine
 *    Messung", nicht eine leere rote Ampel. Ein `o2Status(0, nenn)` ergaebe 0 % /
 *    rot und behauptete eine Aussage, die niemand gemacht hat.
 *
 * EINE ERGAENZUNG: `ausCheck` (§5.8.1, verbindliche Auflage). Eine Messung aus dem
 * Fahrzeug-Check traegt `quelleTyp = "token"`, eine manuell erfasste `"oidc"`.
 * DIE ANGABE IST HEUTE SCHON DA; sie wird nur nirgends gezeigt. Damit ist der
 * Falle-8-Befund („durchgeklickt sieht aus wie geprueft") nicht beseitigt, aber
 * LESBAR — und das ist die ehrliche Stufe, solange Variante (c) Backlog ist.
 *
 * ⚠️ `ausCheck` haengt am `quelleTyp`, NICHT am Kommentartext: ein
 * `startsWith("Fahrzeug-Check")` braeche, sobald jemand die Meldung umformuliert.
 */
import { desc, eq } from "drizzle-orm";
import { lagerorte, o2Flaschen, o2Messungen } from "../../_db/schema";
import { quelleAufloeser } from "../../_db/quelle";
import { o2Status, type O2Status } from "../domain/o2";
import type { DB } from "../../_db/client";

export type O2FlascheZeile = {
  id: string; name: string; lagerortName: string; aktiv: boolean;
  groesseLiter: number | null; nennfuelldruckBar: number;
  letzterDruck: number | null; letzteMessung: Date | null;
  /** ⚠️ `null` = KEINE Messung. Nicht 0 %. */
  status: O2Status | null;
};

/** Juengste Messung je Flasche — EINE Abfrage, dann in JS verdichtet. */
function letzteJeFlasche(db: DB): Map<string, { ts: Date; druckBar: number }> {
  const m = new Map<string, { ts: Date; druckBar: number }>();
  for (const x of db.select().from(o2Messungen).all()) {
    const prev = m.get(x.flascheId);
    if (!prev || x.ts > prev.ts) m.set(x.flascheId, { ts: x.ts, druckBar: x.druckBar });
  }
  return m;
}

export function o2FlaschenUebersicht(db: DB): O2FlascheZeile[] {
  const namen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  const letzte = letzteJeFlasche(db);
  return db.select().from(o2Flaschen).all()
    .map((f) => {
      const l = letzte.get(f.id) ?? null;
      const letzterDruck = l ? l.druckBar : null;
      return {
        id: f.id, name: f.name, lagerortName: namen.get(f.lagerortId) ?? "–",
        aktiv: f.aktiv, groesseLiter: f.groesseLiter,
        nennfuelldruckBar: f.nennfuelldruckBar,
        letzterDruck, letzteMessung: l ? l.ts : null,
        // GUARD: ohne Messung KEIN o2Status-Aufruf (§5.12, Eigenschaft 4).
        status: letzterDruck !== null ? o2Status(letzterDruck, f.nennfuelldruckBar) : null,
      };
    })
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
}

export type O2MessungZeile = {
  id: string; ts: Date; druckBar: number; wer: string; kommentar: string | null;
  /** Stammt aus einem Fahrzeug-Check (`quelleTyp === "token"`) — §5.8.1. */
  ausCheck: boolean;
};

export type O2FlascheDetail = {
  flasche: typeof o2Flaschen.$inferSelect;
  lagerortName: string;
  status: O2Status | null;
  /** chronologisch ABSTEIGEND */
  verlauf: O2MessungZeile[];
};

export function o2FlascheDetail(db: DB, id: string): O2FlascheDetail | null {
  const f = db.select().from(o2Flaschen).where(eq(o2Flaschen.id, id)).get();
  if (!f) return null;
  const lo = db.select().from(lagerorte).where(eq(lagerorte.id, f.lagerortId)).get();
  const rows = db.select().from(o2Messungen)
    .where(eq(o2Messungen.flascheId, id))
    // id-Tiebreaker: `ts` sind UNIX-Sekunden, und ein Check schreibt alle
    // Messungen in derselben Sekunde (§5.14.4).
    .orderBy(desc(o2Messungen.ts), desc(o2Messungen.id))
    .all();
  const wer = quelleAufloeser(db);
  const verlauf: O2MessungZeile[] = rows.map((m) => ({
    id: m.id, ts: m.ts, druckBar: m.druckBar,
    wer: wer(m.quelleTyp, m.quelleId), kommentar: m.kommentar,
    ausCheck: m.quelleTyp === "token",
  }));
  const letzterDruck = verlauf.length > 0 ? verlauf[0].druckBar : null;
  return {
    flasche: f, lagerortName: lo?.name ?? "–",
    status: letzterDruck !== null ? o2Status(letzterDruck, f.nennfuelldruckBar) : null,
    verlauf,
  };
}

export type O2FlascheCheckZeile = {
  id: string; name: string; nennfuelldruckBar: number; letzterDruck: number | null;
};

/** Aktive Flaschen an einem Standort — fuer den Fahrzeug-Check und die
 *  Fahrzeug-Detailseite. `letzterDruck` ist der Vorschlagswert; die VORBELEGUNG
 *  im Zaehlschritt ist dagegen der NENNFUELLDRUCK (§5.15, Punkt 6). */
export function o2FlaschenFuerLagerort(db: DB, lagerortId: string): O2FlascheCheckZeile[] {
  const letzte = letzteJeFlasche(db);
  return db.select().from(o2Flaschen)
    .where(eq(o2Flaschen.lagerortId, lagerortId)).all()
    .filter((f) => f.aktiv)
    .map((f) => ({
      id: f.id, name: f.name, nennfuelldruckBar: f.nennfuelldruckBar,
      letzterDruck: letzte.get(f.id)?.druckBar ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function lagerorteFuerFlaschen(db: DB): { id: string; name: string }[] {
  return db.select().from(lagerorte).where(eq(lagerorte.aktiv, true)).all()
    .map((l) => ({ id: l.id, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Schritt 3: Grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/o2.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/lesepfade/o2.ts src/app/m/lagerbuch/_lib/lesepfade/o2.test.ts
git commit -m "feat(lagerbuch): _lib/lesepfade/o2.ts — keine Messung heisst status null

§5.12: der aktuelle Druck ist immer die juengste Messung (kein denormalisiertes
Feld — deshalb ist eine falsche Messung durch eine neue korrigierbar, und deshalb
bekommt o2_messungen keine Trigger). Ohne Messung status null, nicht 0 % — ein
o2Status(0, nenn) behauptete eine Aussage, die niemand gemacht hat.

Neu: ausCheck. Die Herkunft einer Messung ist ab jetzt sichtbar (§5.8.1, Auflage)
— die Angabe war schon da, sie wurde nur nirgends gezeigt. Sie haengt am
quelleTyp, nicht am Kommentartext."
```

---

### Task 53: `_lib/lesepfade/geraete.ts` — die Typ-Trennung ist auch beim Lesen eindeutig

**Files:**
- Create: `src/app/m/lagerbuch/_lib/lesepfade/geraete.ts`
- Test: `src/app/m/lagerbuch/_lib/lesepfade/geraete.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` — `geraete`, `lagerorte`; `_lib/domain/geraet.ts` (T35) —
  `geraetFaelligkeit`, `type DatumFaelligkeit`, `type GeraetTyp`; `_lib/format.ts` (T39) —
  `geraetFaelligChip`, `type FaelligChip`; `_lib/lesepfade/bestand.ts` — `type Leser`.
- Produces:
  ```ts
  export type GeraetZeile = {
    id: string; typ: GeraetTyp; name: string; barcode: string | null;
    lagerortId: string; lagerortName: string; anmerkung: string | null;
    mtkFaellig: string | null; beschreibung: string | null; ablaufdatum: string | null;
    aktiv: boolean; faelligkeit: DatumFaelligkeit; chip: FaelligChip | null };
  export type GeraetDetail = { geraet: typeof geraete.$inferSelect;
    lagerortName: string; faelligkeit: DatumFaelligkeit; chip: FaelligChip | null };

  export function geraeteUebersicht(db: Leser, now?: Date): GeraetZeile[];
  export function geraeteFuerLagerort(db: Leser, lagerortId: string, now?: Date): GeraetZeile[];
  export function geraetById(db: Leser, id: string, now?: Date): GeraetDetail | null;
  export function geraetByBarcode(db: Leser, barcode: string): { id: string } | null;
  ```
  Konsumenten: `/verwaltung/geraete`, `/verwaltung/geraete/[id]`, `/verwaltung/geraete/scan`
  (Teil 5), `/helfer/check` und `/g/[code]` (Teil 4).

**Der Chip wird SERVERSEITIG gerechnet und mitgeliefert.** `geraetFaelligChip` ist reiner Text plus
Tonname (T39); ihn erst in einer Client-Insel zu rufen hieße, `DatumFaelligkeit` durch den
RSC-Payload zu schicken **und** die Textregel zu duplizieren. ⚠️ **Bei `typ = "objekt"` ohne
Ablaufdatum ist `chip` `null`** — das Ablaufdatum ist dort optional, und ein grauer Chip an jedem
Spineboard wäre Grundrauschen (§5.10).

**Die Typ-Trennung ist eine SCHREIB-Invariante** (`geraete.ts:39-42` hält typ-fremde Felder auf
`null`) — aber ein Altdatensatz kann beides tragen. `geraetFaelligkeit` liest **nur** das zum Typ
passende Feld; diese Datei reicht **beide** Rohfelder durch, damit das Formular sie zeigen kann.

- [ ] **Schritt 1: Test schreiben, rot sehen**

`src/app/m/lagerbuch/_lib/lesepfade/geraete.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { geraete, lagerorte } from "../../_db/schema";
import { geraeteUebersicht, geraeteFuerLagerort, geraetById, geraetByBarcode } from "./geraete";
import { ausZivilzeit } from "../zeit";

const NOW = ausZivilzeit(2026, 6, 15, 14, 37, 0, 0);
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-geraete-");
  t.db.insert(lagerorte).values(
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", aktiv: true }).run();
  t.db.insert(geraete).values([
    { id: "g-med", typ: "medizin", name: "Defibrillator", barcode: "4006381333931",
      lagerortId: "rtw-1", anmerkung: null, mtkFaellig: "2026-06-20",
      beschreibung: null, ablaufdatum: null, aktiv: true, createdAt: NOW },
    { id: "g-med-ohne", typ: "medizin", name: "Absaugpumpe", barcode: null,
      lagerortId: "rtw-1", anmerkung: null, mtkFaellig: null,
      beschreibung: null, ablaufdatum: null, aktiv: true, createdAt: NOW },
    { id: "g-obj-ohne", typ: "objekt", name: "Spineboard", barcode: null,
      lagerortId: "rtw-1", anmerkung: null, mtkFaellig: null,
      beschreibung: "orange", ablaufdatum: null, aktiv: true, createdAt: NOW },
    { id: "g-aus", typ: "objekt", name: "Altes Brett", barcode: null,
      lagerortId: "rtw-1", anmerkung: null, mtkFaellig: null,
      beschreibung: null, ablaufdatum: "2020-01-01", aktiv: false, createdAt: NOW },
  ]).run();
});
afterEach(() => t.schliessen());

describe("geraeteUebersicht — der Chip kommt SERVERSEITIG mit", () => {
  it("medizin mit Datum: gelber Chip mit Tagen", () => {
    const z = geraeteUebersicht(t.db, NOW).find((x) => x.id === "g-med")!;
    expect(z.faelligkeit.tageBisFaellig).toBe(5);
    expect(z.chip).toEqual({ ton: "gelb", text: "MTK in 5 T" });
  });

  it("medizin OHNE Datum: GRAUER Chip, nicht rot und nicht gruen", () => {
    const z = geraeteUebersicht(t.db, NOW).find((x) => x.id === "g-med-ohne")!;
    expect(z.faelligkeit.keinDatum).toBe(true);
    expect(z.chip).toEqual({ ton: "grau", text: "kein MTK-Datum" });
  });

  it("objekt OHNE Ablaufdatum: GAR KEIN Chip", () => {
    // §5.10: das Ablaufdatum ist optional, und ein grauer Chip an jedem
    // Spineboard waere Grundrauschen.
    expect(geraeteUebersicht(t.db, NOW).find((x) => x.id === "g-obj-ohne")!.chip).toBeNull();
  });

  it("objekt mit abgelaufenem Datum: roter Chip mit BETRAG", () => {
    const z = geraeteUebersicht(t.db, NOW).find((x) => x.id === "g-aus")!;
    expect(z.faelligkeit.ueberfaellig).toBe(true);
    expect(z.chip?.ton).toBe("rot");
    expect(z.chip?.text).toMatch(/^abgelaufen \(\d+ T\)$/);
  });

  it("sortiert aktive nach vorn, dann Typ, dann Name", () => {
    expect(geraeteUebersicht(t.db, NOW).map((z) => z.id))
      .toEqual(["g-med-ohne", "g-med", "g-obj-ohne", "g-aus"]);
  });

  it("reicht BEIDE Rohfelder durch, damit das Formular sie zeigen kann", () => {
    const z = geraeteUebersicht(t.db, NOW).find((x) => x.id === "g-obj-ohne")!;
    expect(z.mtkFaellig).toBeNull();
    expect(z.beschreibung).toBe("orange");
  });
});

describe("geraeteFuerLagerort", () => {
  it("liefert nur AKTIVE Geraete dieses Standorts", () => {
    expect(geraeteFuerLagerort(t.db, "rtw-1", NOW).map((z) => z.id))
      .toEqual(["g-med-ohne", "g-med", "g-obj-ohne"]);
  });
  it("liefert fuer einen unbekannten Standort eine leere Liste", () => {
    expect(geraeteFuerLagerort(t.db, "x", NOW)).toEqual([]);
  });
});

describe("geraetById und geraetByBarcode", () => {
  it("geraetById liefert Stammsatz, Lagerortname, Faelligkeit und Chip", () => {
    const d = geraetById(t.db, "g-med", NOW)!;
    expect(d.geraet.name).toBe("Defibrillator");
    expect(d.lagerortName).toBe("RTW 1");
    expect(d.chip).toEqual({ ton: "gelb", text: "MTK in 5 T" });
  });
  it("geraetById liefert null fuer eine unbekannte ID", () => {
    expect(geraetById(t.db, "x", NOW)).toBeNull();
  });
  it("geraetByBarcode sucht BYTE-EXAKT", () => {
    expect(geraetByBarcode(t.db, "4006381333931")).toEqual({ id: "g-med" });
    expect(geraetByBarcode(t.db, "4006381333931 ")).toBeNull();
  });
});
```

- [ ] **Schritt 2: `_lib/lesepfade/geraete.ts` schreiben**

```ts
/**
 * Geraete (medizin/objekt). Kein "use client", kein Icon-Import.
 *
 * DER CHIP KOMMT SERVERSEITIG MIT. `geraetFaelligChip` (T39) liefert reinen Text
 * plus Tonname; ihn erst in einer Client-Insel zu rufen hiesse, `DatumFaelligkeit`
 * durch den RSC-Payload zu schicken UND die Textregel zu duplizieren.
 *
 * ⚠️ BEI `typ = "objekt"` OHNE Ablaufdatum ist `chip` NULL (§5.10): das
 * Ablaufdatum ist dort optional, und ein grauer Chip an jedem Spineboard waere
 * Grundrauschen. Bei `medizin` gibt es IMMER einen — auch ohne Datum, dann grau.
 *
 * DIE TYP-TRENNUNG IST EINE SCHREIB-INVARIANTE (`geraete.ts:39-42` haelt
 * typ-fremde Felder auf null) — aber ein Altdatensatz kann beides tragen.
 * `geraetFaelligkeit` liest NUR das zum Typ passende Feld; diese Datei reicht
 * BEIDE Rohfelder durch, damit das Formular sie zeigen kann.
 */
import { eq } from "drizzle-orm";
import { geraete, lagerorte } from "../../_db/schema";
import { geraetFaelligkeit, type DatumFaelligkeit, type GeraetTyp } from "../domain/geraet";
import { geraetFaelligChip, type FaelligChip } from "../format";
import type { Leser } from "./bestand";

export type GeraetZeile = {
  id: string; typ: GeraetTyp; name: string; barcode: string | null;
  lagerortId: string; lagerortName: string; anmerkung: string | null;
  mtkFaellig: string | null; beschreibung: string | null; ablaufdatum: string | null;
  aktiv: boolean;
  faelligkeit: DatumFaelligkeit;
  /** ⚠️ `null` bei typ='objekt' ohne Ablaufdatum — dann gibt es KEINEN Chip. */
  chip: FaelligChip | null;
};

function toZeile(
  g: typeof geraete.$inferSelect, lagerortName: string, now: Date,
): GeraetZeile {
  const f = geraetFaelligkeit(g, now);
  return {
    id: g.id, typ: g.typ, name: g.name, barcode: g.barcode,
    lagerortId: g.lagerortId, lagerortName, anmerkung: g.anmerkung,
    mtkFaellig: g.mtkFaellig, beschreibung: g.beschreibung, ablaufdatum: g.ablaufdatum,
    aktiv: g.aktiv, faelligkeit: f, chip: geraetFaelligChip(g.typ, f),
  };
}

export function geraeteUebersicht(db: Leser, now: Date = new Date()): GeraetZeile[] {
  const namen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  return db.select().from(geraete).all()
    .map((g) => toZeile(g, namen.get(g.lagerortId) ?? "–", now))
    .sort((a, b) =>
      Number(b.aktiv) - Number(a.aktiv) ||
      a.typ.localeCompare(b.typ) ||
      a.name.localeCompare(b.name));
}

/** Aktive Geraete an einem Standort — fuer den Fahrzeug-Check und die
 *  Fahrzeug-Detailseite. */
export function geraeteFuerLagerort(
  db: Leser, lagerortId: string, now: Date = new Date(),
): GeraetZeile[] {
  const name = db.select().from(lagerorte).where(eq(lagerorte.id, lagerortId)).get()?.name ?? "–";
  return db.select().from(geraete).where(eq(geraete.lagerortId, lagerortId)).all()
    .filter((g) => g.aktiv)
    .map((g) => toZeile(g, name, now))
    .sort((a, b) => a.typ.localeCompare(b.typ) || a.name.localeCompare(b.name));
}

export type GeraetDetail = {
  geraet: typeof geraete.$inferSelect;
  lagerortName: string;
  faelligkeit: DatumFaelligkeit;
  chip: FaelligChip | null;
};

export function geraetById(
  db: Leser, id: string, now: Date = new Date(),
): GeraetDetail | null {
  const g = db.select().from(geraete).where(eq(geraete.id, id)).get();
  if (!g) return null;
  const lagerortName =
    db.select().from(lagerorte).where(eq(lagerorte.id, g.lagerortId)).get()?.name ?? "–";
  const f = geraetFaelligkeit(g, now);
  return { geraet: g, lagerortName, faelligkeit: f, chip: geraetFaelligChip(g.typ, f) };
}

/** BYTE-EXAKTE Suche — Barcodes stehen physisch am Geraet, oft
 *  herstellergedruckt, und werden nicht normalisiert (Teil 1, T7). */
export function geraetByBarcode(db: Leser, barcode: string): { id: string } | null {
  const g = db.select().from(geraete).where(eq(geraete.barcode, barcode)).get();
  return g ? { id: g.id } : null;
}
```

- [ ] **Schritt 3: Grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/geraete.test.ts
TZ=UTC pnpm vitest run src/app/m/lagerbuch/_lib/lesepfade/geraete.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/lesepfade/geraete.ts \
        src/app/m/lagerbuch/_lib/lesepfade/geraete.test.ts
git commit -m "feat(lagerbuch): _lib/lesepfade/geraete.ts — Chip serverseitig, objekt ohne Datum ohne Chip

Der Faelligkeits-Chip kommt serverseitig mit: ihn erst in einer Client-Insel zu
rufen hiesse, DatumFaelligkeit durch den RSC-Payload zu schicken UND die
Textregel zu duplizieren.

Bei typ='objekt' ohne Ablaufdatum ist chip null (§5.10) — ein grauer Chip an
jedem Spineboard waere Grundrauschen. Bei medizin gibt es immer einen.

Beide Rohfelder werden durchgereicht, damit das Formular sie zeigen kann; die
Typ-Trennung ist eine SCHREIB-Invariante, und ein Altdatensatz kann beides
tragen.

Unter TZ=UTC gefahren — die Faelligkeit rechnet gegen startDesTages in ZEITZONE."
```

---

### Gate — Ende Welle 4

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
TZ=UTC pnpm vitest run src/app/m/lagerbuch/
```

---

## Welle 5 — Schreibpfade, Stufe 1 (3 Tasks, alle parallel)

`umlagerung.ts` und `korrektur.ts` rufen `fefoAbbuchung` und liegen deshalb in **Welle 6**.

⚠️ **Alle fünf Schreibpfade sind TRANSAKTIONSFREIE KERNE** (Festlegung H3): sie laufen **innerhalb**
einer bestehenden Transaktion und öffnen keine eigene. Die zusammensetzenden Actions
(`checkAbschluss`, `inventurKorrektur`, `bucheZugang` …) gehören Teil 4 und Teil 5 — mit den
ausgeschriebenen Auflagen aus §1, H3.

---

### Task 54: `_lib/schreibpfade/abbuchung.ts` — das Prädikat wandert in die Abfrage

**Files:**
- Create: `src/app/m/lagerbuch/_lib/schreibpfade/abbuchung.ts`
- Test: `src/app/m/lagerbuch/_lib/schreibpfade/abbuchung.test.ts`
- Test: `src/app/m/lagerbuch/_db/fefo.test.ts`

**Interfaces:**
- Consumes: `_db/client.ts` — `type DB`; `_db/schema.ts` — `buchungen`, `chargen`, `newId`;
  `_lib/konstanten.ts` — `HANDLAGER_ID`; `_lib/domain/fefo.ts` (T30) — `fefoVerteilung`,
  `type ChargeRest`; `_lib/lesepfade/bestand.ts` (T44) — `restJeChargeFuerArtikel`.
- Produces:
  ```ts
  export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
  export type Quelle = { quelleTyp: "oidc" | "token" | "system"; quelleId: string };
  export type Teil = { chargeId: string; menge: number };

  export function fefoAbbuchung(tx: Tx, args: {
    artikelId: string; menge: number; lagerortId?: string; quelle: Quelle;
    kommentar: string | null; referenz: string | null;
    typ?: "entnahme" | "korrektur" | "umlagerung";
  }): { gebucht: number; teile: Teil[] };
  ```
  Konsumenten: `_lib/schreibpfade/umlagerung.ts` (T57), `korrektur.ts` (T58),
  `_actions/buchung.ts` und `_actions/aussondern.ts` (Teil 5), `_actions/inventur.ts` (Teil 5).

⚠️ **`Tx` ist 1:1 aus `lagerbuch/src/db/abbuchung.ts:9` und strukturell identisch mit `Leser` aus
T44** (dort ohne `DB`-Alternative). Beide leiten sich aus derselben `DB["transaction"]`-Signatur ab;
ein Import über die Schichtgrenze wäre die falsche Richtung.

**Die eine Änderung: das Lagerort-Prädikat wandert in die Abfrage.** `abbuchung.ts:38` lädt heute
**alle** Buchungen des Artikels **ohne** Lagerort-Prädikat und filtert erst in JS
(`bestandProLagerortUndCharge`). Ab jetzt: `restJeChargeFuerArtikel(tx, artikelId, lagerortId)`,
Index `idx_buchungen_artikel_lagerort_charge`. **Das Ergebnis ist zeichengleich** — der
Differenztest in T44 hält das fest.

⚠️ **`ChargeRest` trägt jetzt `createdAt`** (T30). Die Charge-Zeilen kommen ohnehin aus der
Datenbank; **ein „gespartes" Feld nimmt den FEFO-Determinismus wieder heraus**, und der Verlust ist
still: die Verteilung bleibt korrekt, nur die Reihenfolge ist wieder eine Laune der Datenbank.

**Die drei Invarianten, die hier hängen:** I2 (kein negativer Bestand — die Kappung sitzt in
`fefoVerteilung`), die Lagerort-Bindung aus §5.2.1, und die Zusage, dass der Aufrufer die
**tatsächlich** gebuchte Menge meldet.

- [ ] **Schritt 1: Beide Tests schreiben**

`src/app/m/lagerbuch/_lib/schreibpfade/abbuchung.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import { fefoAbbuchung, type Quelle } from "./abbuchung";
import { bestandProLagerort } from "../domain/bestand";
import { HANDLAGER_ID } from "../konstanten";

const NOW = new Date("2026-06-15T10:00:00Z");
const QUELLE: Quelle = { quelleTyp: "system", quelleId: "test" };
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sp-abbuchung-");
  t.db.insert(lagerorte).values(
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null, aktiv: true }).run();
  t.db.insert(artikel).values(
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW }).run();
  t.db.insert(chargen).values([
    { id: "c-frueh", artikelId: "a1", chargenNr: "F", verfall: "2026-07", createdAt: NOW },
    { id: "c-spaet", artikelId: "a1", chargenNr: "S", verfall: "2028-01", createdAt: NOW },
  ]).run();
  const b = (chargeId: string, lagerortId: string, menge: number) => ({
    id: newId(), ts: NOW, typ: "zugang" as const, artikelId: "a1", chargeId, lagerortId, menge,
    quelleTyp: "system" as const, quelleId: "t", referenz: null, kommentar: null,
  });
  t.db.insert(buchungen).values([
    b("c-frueh", HANDLAGER_ID, 3),
    b("c-spaet", HANDLAGER_ID, 10),
    b("c-frueh", "rtw-1", 5),      // DIESELBE Charge im Fahrzeug
  ]).run();
});
afterEach(() => t.schliessen());

/** Fuehrt `fn` in einer echten Transaktion aus — die Kerne laufen NUR dort. */
function inTx<T>(fn: (tx: Parameters<Parameters<typeof t.db.transaction>[0]>[0]) => T): T {
  return t.db.transaction((tx) => fn(tx));
}

describe("fefoAbbuchung — FEFO und die Lagerort-Bindung", () => {
  it("raeumt die frueher ablaufende Charge zuerst ab", () => {
    const r = inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 5, quelle: QUELLE, kommentar: null, referenz: null }));
    expect(r.gebucht).toBe(5);
    expect(r.teile).toEqual([{ chargeId: "c-frueh", menge: 3 }, { chargeId: "c-spaet", menge: 2 }]);
  });

  it("sieht den FAHRZEUG-Bestand derselben Charge NICHT", () => {
    /**
     * ⚠️ DIE ZEILE, UM DIE ES GEHT. `abbuchung.ts:38` laedt heute alle Buchungen
     * des Artikels OHNE Lagerort-Praedikat. Ohne das Scoping saehe die Abbuchung
     * fuer `c-frueh` einen Rest von 8 (3 + 5) statt 3 — sie buchte 5 statt 3 ab
     * und drueckte den Handlager-Bestand ins Negative (I2 gebrochen).
     */
    const r = inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 3, quelle: QUELLE, kommentar: null, referenz: null }));
    expect(r.teile).toEqual([{ chargeId: "c-frueh", menge: 3 }]);
    const roh = t.db.select().from(buchungen).all()
      .map((x) => ({ lagerortId: x.lagerortId, menge: x.menge }));
    expect(bestandProLagerort(roh, HANDLAGER_ID)).toBe(10);
    expect(bestandProLagerort(roh, "rtw-1")).toBe(5);
  });

  it("bucht auf Wunsch von einem ANDEREN Lagerort ab", () => {
    const r = inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 99, lagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: null }));
    expect(r).toEqual({ gebucht: 5, teile: [{ chargeId: "c-frueh", menge: 5 }] });
  });
});

describe("fefoAbbuchung — I2: der Bestand wird nie negativ", () => {
  it("kappt an der Verfuegbarkeit AN DIESEM Lagerort", () => {
    const r = inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 1000, quelle: QUELLE, kommentar: null, referenz: null }));
    expect(r.gebucht).toBe(13);
    const roh = t.db.select().from(buchungen).all()
      .map((x) => ({ lagerortId: x.lagerortId, menge: x.menge }));
    expect(bestandProLagerort(roh, HANDLAGER_ID)).toBe(0);
  });

  it("bucht bei leerem Lagerort GAR NICHTS", () => {
    const vorher = t.db.select().from(buchungen).all().length;
    const r = inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 5, lagerortId: "gibtsnicht",
      quelle: QUELLE, kommentar: null, referenz: null }));
    expect(r).toEqual({ gebucht: 0, teile: [] });
    expect(t.db.select().from(buchungen).all()).toHaveLength(vorher);
  });
});

describe("fefoAbbuchung — die geschriebenen Zeilen", () => {
  it("schreibt JE CHARGE eine Zeile mit NEGATIVER Menge und dem gewaehlten Typ", () => {
    inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 5, quelle: QUELLE,
      kommentar: "Entnahme Bereitschaft", referenz: "check:abc", typ: "korrektur" }));
    const neu = t.db.select().from(buchungen).all().filter((b) => b.menge < 0);
    expect(neu).toHaveLength(2);
    for (const b of neu) {
      expect(b.typ).toBe("korrektur");
      expect(b.lagerortId).toBe(HANDLAGER_ID);
      expect(b.referenz).toBe("check:abc");
      expect(b.kommentar).toBe("Entnahme Bereitschaft");
      expect(b.quelleTyp).toBe("system");
    }
    expect(neu.map((b) => b.menge).sort((x, y) => x - y)).toEqual([-3, -2]);
  });

  it("hat den Vorgabetyp 'entnahme'", () => {
    inTx((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 1, quelle: QUELLE, kommentar: null, referenz: null }));
    expect(t.db.select().from(buchungen).all().find((b) => b.menge < 0)!.typ).toBe("entnahme");
  });
});
```

`src/app/m/lagerbuch/_db/fefo.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, buchungen, chargen, newId } from "./schema";
import { fefoAbbuchung } from "../_lib/schreibpfade/abbuchung";
import { HANDLAGER_ID } from "../_lib/konstanten";

/**
 * DER DETERMINISMUS-TEST AUS §5.3.1 — gegen eine ECHTE Verbindung.
 *
 * Der Unit-Test in `_lib/domain/fefo.test.ts` sortiert ein JS-Array, dessen
 * AUSGANGSREIHENFOLGE der Test selbst setzt. Ob die Ordnung auch dann gilt, wenn
 * die Zeilen aus einer echten Verbindung kommen, kann nur DIESE Datei sagen —
 * denn genau die Rueckgabereihenfolge der Datenbank ist es, die heute
 * entscheidet, und sie ist kein Vertrag.
 */
const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-fefo-");
  t.db.insert(artikel).values(
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW }).run();
});
afterEach(() => t.schliessen());

function chargeMitBestand(id: string, verfall: string, createdAt: Date, menge: number) {
  t.db.insert(chargen).values(
    { id, artikelId: "a1", chargenNr: id, verfall, createdAt }).run();
  t.db.insert(buchungen).values(
    { id: newId(), ts: NOW, typ: "zugang", artikelId: "a1", chargeId: id,
      lagerortId: HANDLAGER_ID, menge, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: null }).run();
}

describe("gleicher Verfall — die AELTERE Charge wird zuerst verbraucht", () => {
  it("entscheidet ueber createdAt, nicht ueber die DB-Reihenfolge", () => {
    /**
     * ⚠️ DIE MUTATION, DIE DAS FAENGT (§5.19.3, Zeile 1): die Zweitsortierung in
     * `fefoVerteilung` entfernen. Ohne sie entscheidet die Rueckgabereihenfolge
     * der Datenbank, und die ist kein Vertrag: sie kann sich mit einem Index, mit
     * einer SQLite-Fassung oder mit dem naechsten VACUUM aendern.
     *
     * Die JUENGERE Charge wird ZUERST eingefuegt, damit eine naive
     * Einfuegereihenfolge das falsche Ergebnis liefern WUERDE.
     */
    chargeMitBestand("c-neu", "2026-07", new Date("2026-02-01T00:00:00Z"), 5);
    chargeMitBestand("c-alt", "2026-07", new Date("2026-01-01T00:00:00Z"), 5);
    const r = t.db.transaction((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 7, quelle: { quelleTyp: "system", quelleId: "t" },
      kommentar: null, referenz: null }));
    expect(r.teile).toEqual([{ chargeId: "c-alt", menge: 5 }, { chargeId: "c-neu", menge: 2 }]);
  });

  it("entscheidet bei gleicher createdAt ueber die chargeId", () => {
    // `createdAt` sind UNIX-SEKUNDEN: ein CSV-Import legt Dutzende Chargen in
    // DERSELBEN Sekunde an. Ohne die dritte Stufe waere die Ordnung dort wieder
    // unbestimmt.
    const gleich = new Date("2026-01-01T00:00:00Z");
    chargeMitBestand("zzz", "2026-07", gleich, 2);
    chargeMitBestand("aaa", "2026-07", gleich, 2);
    const r = t.db.transaction((tx) => fefoAbbuchung(tx, {
      artikelId: "a1", menge: 3, quelle: { quelleTyp: "system", quelleId: "t" },
      kommentar: null, referenz: null }));
    expect(r.teile).toEqual([{ chargeId: "aaa", menge: 2 }, { chargeId: "zzz", menge: 1 }]);
  });

  it("liefert bei ZWEI identischen Laeufen dieselbe Verteilung", () => {
    const gleich = new Date("2026-01-01T00:00:00Z");
    chargeMitBestand("b", "2026-07", gleich, 4);
    chargeMitBestand("a", "2026-07", gleich, 4);
    const lauf = () => t.db.transaction((tx) => {
      const r = fefoAbbuchung(tx, {
        artikelId: "a1", menge: 2, quelle: { quelleTyp: "system", quelleId: "t" },
        kommentar: null, referenz: null });
      // Zuruecksetzen ist unmoeglich (Append-only) — deshalb wird die zweite
      // Runde gegen den verbleibenden Rest gefahren und nur die REIHENFOLGE
      // verglichen.
      return r.teile.map((x) => x.chargeId);
    });
    expect(lauf()).toEqual(["a"]);
    expect(lauf()).toEqual(["a"]);
  });
});
```

- [ ] **Schritt 2: Rot sehen, dann `_lib/schreibpfade/abbuchung.ts` schreiben**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/schreibpfade/abbuchung.test.ts src/app/m/lagerbuch/_db/fefo.test.ts
```

```ts
/**
 * Der transaktionsFREIE FEFO-Abbuchungskern.
 *
 * Kein "use client". ⚠️ ER LAEUFT INNERHALB EINER BESTEHENDEN TRANSAKTION und
 * oeffnet keine eigene (Festlegung H3) — die zusammensetzenden Actions
 * (`checkAbschluss`, `inventurKorrektur`, `bucheZugang`, `aussondern`) gehoeren
 * Teil 4 und Teil 5.
 *
 * DIE EINE AENDERUNG GEGENUEBER `lagerbuch/src/db/abbuchung.ts`: das
 * Lagerort-Praedikat wandert IN DIE ABFRAGE. `:38` laedt heute ALLE Buchungen des
 * Artikels ohne Praedikat und filtert erst in JS; ein Fahrzeug-Check mit 60
 * Artikeln laedt damit die vollstaendige Historie von 60 Artikeln zwei- bis
 * dreimal (§5.2.3 b). Ab jetzt: `restJeChargeFuerArtikel`, Index
 * `idx_buchungen_artikel_lagerort_charge`. Das ERGEBNIS ist zeichengleich — der
 * Differenztest in `_db/aggregate.test.ts` haelt das fest.
 *
 * ⚠️ KRITISCH, UND DER GRUND FUER DAS SCOPING: ohne Lagerort-Praedikat wuerde nach
 * der ersten Fahrzeug-Buchung derselben Charge der Fahrzeugbestand als
 * Handlager-Rest MITGEZAEHLT → Phantombestand und falsche FEFO-Verteilung. Die
 * Abbuchung buchte mehr ab, als am Ort liegt, und der Bestand wuerde negativ (I2).
 */
import { eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { buchungen, chargen, newId } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { fefoVerteilung, type ChargeRest } from "../domain/fefo";
import { restJeChargeFuerArtikel } from "../lesepfade/bestand";

/**
 * Der tx-Typ der Drizzle-Transaktion — 1:1 aus `lagerbuch/src/db/abbuchung.ts:9`.
 *
 * ⚠️ Strukturell identisch mit dem Transaktionszweig von `Leser`
 * (`_lib/lesepfade/bestand.ts`). Beide leiten sich aus DERSELBEN
 * `DB["transaction"]`-Signatur ab; ein Import ueber die Schichtgrenze
 * (Schreibpfad → Lesepfad) waere die falsche Richtung.
 */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export type Quelle = { quelleTyp: "oidc" | "token" | "system"; quelleId: string };

export type Teil = { chargeId: string; menge: number };

/**
 * Verteilt `menge` FEFO ueber die Chargen des Artikels AN EINEM LAGERORT
 * (Rest > 0, aufsteigender Verfall), kappt am dortigen Bestand und schreibt je
 * Charge EINE Abgangsbuchung.
 *
 * Gibt die TATSAECHLICH gebuchte Menge UND die Chargen-Aufteilung zurueck —
 * letztere braucht `umlagerung()`, um denselben Bestand 1:1 (gleiche Charge) am
 * Ziel-Lagerort gutzuschreiben (I3).
 *
 * ⚠️ `createdAt` WANDERT IN `ChargeRest` (§5.3.1). Die Chargen-Zeilen kommen
 * ohnehin aus der Datenbank; ein „gespartes" Feld nimmt den FEFO-Determinismus
 * wieder heraus, und der Verlust ist STILL: die Verteilung bleibt korrekt, nur
 * die Reihenfolge ist wieder eine Laune der Datenbank.
 */
export function fefoAbbuchung(
  tx: Tx,
  args: {
    artikelId: string;
    menge: number;
    lagerortId?: string;
    quelle: Quelle;
    kommentar: string | null;
    referenz: string | null;
    typ?: "entnahme" | "korrektur" | "umlagerung";
  },
): { gebucht: number; teile: Teil[] } {
  const {
    artikelId, menge, lagerortId = HANDLAGER_ID, quelle, kommentar, referenz,
    typ = "entnahme",
  } = args;

  const chs = tx.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  // EINE aggregierende Abfrage MIT Lagerort-Praedikat — statt der Vollladung.
  const rest = restJeChargeFuerArtikel(tx, artikelId, lagerortId);
  const chargenRest: ChargeRest[] = chs.map((c) => ({
    chargeId: c.id, verfall: c.verfall, rest: rest.get(c.id) ?? 0, createdAt: c.createdAt,
  }));

  const teile = fefoVerteilung(chargenRest, menge);
  let gebucht = 0;
  for (const teil of teile) {
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ, artikelId, chargeId: teil.chargeId,
      lagerortId,
      // VORZEICHENBEHAFTET: ein Abgang ist negativ (`schema.ts:98`).
      menge: -teil.menge,
      quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId, referenz, kommentar,
    }).run();
    gebucht += teil.menge;
  }
  return { gebucht, teile };
}
```

- [ ] **Schritt 3: Grün, Mutationsprobe, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/schreibpfade/abbuchung.test.ts src/app/m/lagerbuch/_db/fefo.test.ts
```

**Mutationsprobe:** entferne in `_lib/domain/fefo.ts` die zweite und dritte Sortierstufe. Erwartet:
`_db/fefo.test.ts` wird **rot** — und zwar an der Stelle, an der der Unit-Test es **nicht** sieht.
Zurücknehmen.

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/schreibpfade/abbuchung.ts \
        src/app/m/lagerbuch/_lib/schreibpfade/abbuchung.test.ts \
        src/app/m/lagerbuch/_db/fefo.test.ts
git commit -m "feat(lagerbuch): _lib/schreibpfade/abbuchung.ts — Praedikat in der Abfrage

Der transaktionsfreie FEFO-Kern. Die eine Aenderung: restJeChargeFuerArtikel
statt Vollladung mit JS-Filter (abbuchung.ts:38) — ein Fahrzeug-Check mit 60
Artikeln laedt heute die volle Historie von 60 Artikeln zwei- bis dreimal.

ChargeRest traegt createdAt: die Zeilen kommen ohnehin aus der DB, und ein
'gespartes' Feld nimmt den FEFO-Determinismus wieder heraus — still.

_db/fefo.test.ts faehrt den Determinismus gegen eine ECHTE Verbindung: der
Unit-Test sortiert ein Array, dessen Ausgangsreihenfolge er selbst setzt, und
kann die DB-Rueckgabereihenfolge strukturell nicht sehen."
```

---

### Task 55: `_lib/schreibpfade/lagerortVerfall.ts` — der Upsert, der die alte Angabe wegnimmt

**Files:**
- Create: `src/app/m/lagerbuch/_lib/schreibpfade/lagerortVerfall.ts`
- Test: `src/app/m/lagerbuch/_lib/schreibpfade/lagerortVerfall.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` — `lagerortVerfall`, `newId`; `_lib/konstanten.ts` — `MONAT_REGEX`;
  `_lib/schreibpfade/abbuchung.ts` (T54) — `type Tx`, `type Quelle`; `_db/client.ts` — `type DB`.
- Produces:
  ```ts
  export function setzeVerfall(db: DB | Tx, args: {
    lagerortId: string; artikelId: string; verfall: string | null;
    quelle: Quelle; jetzt?: Date }): void;
  export function loescheVerfallEintrag(db: DB | Tx, lagerortId: string, artikelId: string): void;
  export function loescheVerfallFuer(db: DB | Tx,
    feld: "lagerort" | "artikel", id: string): void;
  ```
  Konsumenten: `_actions/check.ts` (Teil 4), `_actions/lagerort-verfall.ts` und
  `_actions/fahrzeuge.ts` (Teil 5), `_actions/loeschen.ts` (Teil 5).

**Drei Regeln** (§5.6.2, §4.11):

1. **Der Upsert überschreibt, und die alte Angabe ist danach weg.** `lagerort_verfall` hat **keine
   Historie und keinen Trigger**; wer den Verfall im Fahrzeug korrigiert, überschreibt. Das ist
   gewollt — ein Fahrzeug hat **einen aktuellen frühesten Verfall, keine Verlaufskurve**.
2. **`null`/`""` LÖSCHT die Angabe.** Sie ist überall optional; ein leerer Wert ist eine Rücknahme,
   kein Fehler.
3. **Es gibt genau EINEN Monatsvalidator** (§5.6.4, Entscheidung 6). `MONAT_REGEX` aus
   `_lib/konstanten.ts` — **nicht** der laxe `/^\d{4}-\d{2}$/` aus `buchung.ts:17` und `bz.ts:83`.
   `"2026-00"` passiert den laxen, `verfallStatus` rechnet daraus den **31.12.2025**, und die Charge
   gilt **ab dem Anlegen** als abgelaufen.

⚠️ **Die Zugehörigkeitsprüfung („der Artikel muss an diesem Lagerort im Soll stehen") liegt NICHT
hier**, sondern in den Actions (`lagerort-verfall.ts:30-36`, `check.ts:153-155`) — sie ist Teil 4/5.
Sie steht in der Abgabetabelle (§6): der eigene Client erzeugt die verletzende Eingabe nie, ein
manipulierter Request schon.

- [ ] **Schritt 1: Test schreiben, rot sehen**

`src/app/m/lagerbuch/_lib/schreibpfade/lagerortVerfall.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, lagerorte, lagerortVerfall, newId } from "../../_db/schema";
import { setzeVerfall, loescheVerfallEintrag, loescheVerfallFuer } from "./lagerortVerfall";
import type { Quelle } from "./abbuchung";

const NOW = new Date("2026-06-15T10:00:00Z");
const SPAETER = new Date("2026-06-20T10:00:00Z");
const QUELLE: Quelle = { quelleTyp: "token", quelleId: "111-111" };
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sp-lvf-");
  t.db.insert(lagerorte).values([
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null, aktiv: true },
    { id: "rtw-2", name: "RTW 2", typ: "fahrzeug", kennung: null, aktiv: true },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "A", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a2", name: "B", einheit: "Stk.", fach: "A2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
});
afterEach(() => t.schliessen());

const alle = () => t.db.select().from(lagerortVerfall).all();

describe("setzeVerfall — der Upsert", () => {
  it("legt eine Angabe an", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    expect(alle()).toHaveLength(1);
    expect(alle()[0]).toMatchObject({ verfall: "2026-09", quelleTyp: "token" });
  });

  it("UEBERSCHREIBT eine bestehende Angabe, statt zu duplizieren", () => {
    /**
     * §4.11: der Upsert laeuft ueber den Unique-Index
     * `idx_lagerort_verfall_ort_artikel`. Die ALTE ANGABE IST DANACH WEG — es gibt
     * keine Historie und keinen Trigger. Das ist gewollt: ein Fahrzeug hat einen
     * aktuellen fruehesten Verfall, keine Verlaufskurve.
     */
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1", verfall: "2026-07",
      quelle: { quelleTyp: "oidc", quelleId: "sub-1" }, jetzt: SPAETER });
    expect(alle()).toHaveLength(1);
    expect(alle()[0]).toMatchObject({
      verfall: "2026-07", quelleTyp: "oidc", quelleId: "sub-1",
    });
    expect(alle()[0].erfasstAt.getTime()).toBe(SPAETER.getTime());
  });

  it("fuehrt (Lagerort, Artikel) als Paar — zwei Fahrzeuge, zwei Zeilen", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    setzeVerfall(t.db, { lagerortId: "rtw-2", artikelId: "a1",
      verfall: "2026-10", quelle: QUELLE, jetzt: NOW });
    expect(alle()).toHaveLength(2);
  });
});

describe("setzeVerfall — null und '' LOESCHEN", () => {
  it("nimmt eine Angabe zurueck", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: null, quelle: QUELLE, jetzt: SPAETER });
    expect(alle()).toHaveLength(0);
  });

  it("behandelt den leeren String wie null", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "", quelle: QUELLE, jetzt: SPAETER });
    expect(alle()).toHaveLength(0);
  });

  it("ist auf einer nicht vorhandenen Zeile ein No-Op", () => {
    expect(() => setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: null, quelle: QUELLE, jetzt: NOW })).not.toThrow();
  });
});

describe("setzeVerfall — genau EIN Monatsvalidator (§5.6.4, Entscheidung 6)", () => {
  it("lehnt '2026-00' ab — der laxe Ausdruck liesse ihn durch", () => {
    /**
     * `/^\d{4}-\d{2}$/` (`buchung.ts:17`, `bz.ts:83`) laesst „2026-00" durch;
     * `verfallStatus` rechnet daraus den 31.12.2025, und die Charge gilt AB DEM
     * ANLEGEN als abgelaufen. Ab jetzt gilt ueberall MONAT_REGEX.
     */
    expect(() => setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-00", quelle: QUELLE, jetzt: NOW })).toThrow(/YYYY-MM/);
    expect(alle()).toHaveLength(0);
  });

  it("lehnt '2026-13' und Freitext ab", () => {
    for (const roh of ["2026-13", "2026-6", "Juni 2026", "2026"]) {
      expect(() => setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
        verfall: roh, quelle: QUELLE, jetzt: NOW })).toThrow();
    }
  });

  it("nimmt '2026-01' und '2026-12' an", () => {
    for (const roh of ["2026-01", "2026-12", "2099-12"]) {
      expect(() => setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
        verfall: roh, quelle: QUELLE, jetzt: NOW })).not.toThrow();
    }
  });
});

describe("die beiden Loeschwege", () => {
  beforeEach(() => {
    for (const [ort, art] of [["rtw-1", "a1"], ["rtw-1", "a2"], ["rtw-2", "a1"]] as const) {
      setzeVerfall(t.db, { lagerortId: ort, artikelId: art,
        verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    }
  });

  it("loescheVerfallEintrag trifft genau EIN Paar", () => {
    // Der Weg, den `fahrzeuge.ts:80` geht, wenn ein Artikel an diesem Fahrzeug
    // aus dem Soll faellt.
    loescheVerfallEintrag(t.db, "rtw-1", "a1");
    expect(alle()).toHaveLength(2);
  });

  it("loescheVerfallFuer('lagerort') raeumt ein ganzes Fahrzeug ab", () => {
    loescheVerfallFuer(t.db, "lagerort", "rtw-1");
    expect(alle().map((r) => r.lagerortId)).toEqual(["rtw-2"]);
  });

  it("loescheVerfallFuer('artikel') raeumt einen Artikel ueberall ab", () => {
    loescheVerfallFuer(t.db, "artikel", "a1");
    expect(alle().map((r) => r.artikelId)).toEqual(["a2"]);
  });
});
```

- [ ] **Schritt 2: `_lib/schreibpfade/lagerortVerfall.ts` schreiben**

```ts
/**
 * Der Schreibweg fuer `lagerort_verfall` — die Kompensation aus §4.11.
 *
 * Kein "use client". Laeuft transaktions-FREI und damit auch INNERHALB des
 * Check-Abschlusses (Festlegung H3).
 *
 * ⚠️ NUR DIE SCHREIBWEGE LIEGEN HIER. Der Leser `verfallFuerLagerort` liegt in
 * `_lib/lesepfade/verfall.ts` (Festlegung H4), obwohl die Alt-Anwendung beides in
 * `db/lagerort-verfall.ts` fuehrt.
 *
 * ⚠️ DIE ZUGEHOERIGKEITSPRUEFUNG LIEGT NICHT HIER. „Der Artikel muss an diesem
 * Lagerort im Soll stehen" prueft die AUFRUFENDE Action
 * (`lagerort-verfall.ts:30-36`, `check.ts:153-155`) — Teil 4 bzw. Teil 5. Der
 * eigene Client erzeugt die verletzende Eingabe nie, ein manipulierter Request
 * schon; die Auflage steht in der Abgabetabelle.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { lagerortVerfall, newId } from "../../_db/schema";
import { MONAT_REGEX } from "../konstanten";
import type { Quelle, Tx } from "./abbuchung";

/**
 * Setzt den gemeldeten Verfall fuer (Lagerort, Artikel).
 *
 * ⚠️ `verfall = null` ODER `""` LOESCHT die Angabe wieder — sie ist ueberall
 * optional, und ein leerer Wert ist eine Ruecknahme, kein Fehler.
 *
 * ⚠️ DER UPSERT UEBERSCHREIBT, UND DIE ALTE ANGABE IST DANACH WEG.
 * `lagerort_verfall` hat KEINE Historie und KEINEN Trigger (§4.4, §4.11). Das ist
 * gewollt: ein Fahrzeug hat EINEN aktuellen fruehesten Verfall, keine
 * Verlaufskurve. Wer hier eine Historie einzieht, aendert die Tabellensemantik.
 *
 * ⚠️ GENAU EIN MONATSVALIDATOR (§5.6.4, Entscheidung 6): `MONAT_REGEX` aus
 * `_lib/konstanten.ts`, NICHT der laxe `/^\d{4}-\d{2}$/` aus `buchung.ts:17` und
 * `bz.ts:83`. „2026-00" passiert den laxen; `verfallStatus` rechnet daraus den
 * 31.12.2025, und die Charge gilt AB DEM ANLEGEN als abgelaufen.
 */
export function setzeVerfall(
  db: DB | Tx,
  args: {
    lagerortId: string; artikelId: string; verfall: string | null;
    quelle: Quelle; jetzt?: Date;
  },
): void {
  const { lagerortId, artikelId, verfall, quelle, jetzt = new Date() } = args;
  if (!verfall) {
    loescheVerfallEintrag(db, lagerortId, artikelId);
    return;
  }
  if (!MONAT_REGEX.test(verfall)) {
    throw new Error(`Verfall muss das Format YYYY-MM haben (Monat 01–12), war: "${verfall}"`);
  }
  db.insert(lagerortVerfall)
    .values({
      id: newId(), lagerortId, artikelId, verfall, erfasstAt: jetzt,
      quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
    })
    // ⚠️ `onConflictDoUpdate` und NICHT `INSERT OR REPLACE`: letzteres umgeht bei
    // `recursive_triggers = 0` (dem Default) den Append-only-Trigger. Auf DIESER
    // Tabelle gibt es zwar keinen, aber das Idiom soll im Modul einheitlich
    // bleiben (Teil 1, Global Constraints).
    .onConflictDoUpdate({
      target: [lagerortVerfall.lagerortId, lagerortVerfall.artikelId],
      set: {
        verfall, erfasstAt: jetzt,
        quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
      },
    })
    .run();
}

/** Entfernt genau EINE Angabe — z. B. wenn der Artikel an diesem Lagerort aus dem
 *  Soll fliegt (`fahrzeuge.ts:80`). Auf einer nicht vorhandenen Zeile ein No-Op. */
export function loescheVerfallEintrag(
  db: DB | Tx, lagerortId: string, artikelId: string,
): void {
  db.delete(lagerortVerfall)
    .where(and(
      eq(lagerortVerfall.lagerortId, lagerortId),
      eq(lagerortVerfall.artikelId, artikelId),
    ))
    .run();
}

/** Raeumt alle Meldungen eines Lagerorts bzw. Artikels ab — vor einem
 *  Hard-Delete (Teil 5, §5.21). */
export function loescheVerfallFuer(
  db: DB | Tx, feld: "lagerort" | "artikel", id: string,
): void {
  const wo = feld === "lagerort"
    ? eq(lagerortVerfall.lagerortId, id)
    : eq(lagerortVerfall.artikelId, id);
  db.delete(lagerortVerfall).where(wo).run();
}
```

- [ ] **Schritt 3: Grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/schreibpfade/lagerortVerfall.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/schreibpfade/lagerortVerfall.ts \
        src/app/m/lagerbuch/_lib/schreibpfade/lagerortVerfall.test.ts
git commit -m "feat(lagerbuch): _lib/schreibpfade/lagerortVerfall.ts — ein Monatsvalidator

Der Upsert ueberschreibt, und die alte Angabe ist danach weg (§4.11): die Tabelle
ist Ist-Zustand, kein Nachweis — ein Fahrzeug hat EINEN aktuellen fruehesten
Verfall, keine Verlaufskurve. null und '' loeschen.

Entscheidung 6 (§5.6.4): MONAT_REGEX ueberall, nie der laxe /^\\d{4}-\\d{2}\$/.
'2026-00' passiert den laxen, verfallStatus rechnet daraus den 31.12.2025, und die
Charge gilt ab dem Anlegen als abgelaufen.

Die Zugehoerigkeitspruefung liegt bewusst nicht hier, sondern in der aufrufenden
Action (Teil 4/5) — sie steht in der Abgabetabelle."
```

---

### Task 56: `_lib/schreibpfade/templateSync.ts` — materialisieren, nicht live rechnen

**Files:**
- Create: `src/app/m/lagerbuch/_lib/schreibpfade/templateSync.ts`
- Test: `src/app/m/lagerbuch/_db/template-sync.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` — `lagerorte`, `sollPositionen`, `templatePositionen`, `newId`;
  `_lib/schreibpfade/abbuchung.ts` (T54) — `type Tx`; `_db/client.ts` — `type DB`.
- Produces:
  ```ts
  export type SyncErgebnis = { hinzugefuegt: number; aktualisiert: number;
    uebersprungen: number; entfernt: number; losgeloest: number };
  export function syncFahrzeugTemplate(db: DB | Tx, fahrzeugId: string): SyncErgebnis;
  ```
  Konsumenten: `_actions/templates.ts` und `_actions/fahrzeuge.ts` (Teil 5).

**Warum materialisiert wird und nicht live gerechnet** (§5.7.2): der Check-Flow liest
**ausschließlich** `soll_positionen` (`template-sync.ts:13-17`). Eine live berechnete Vorlage wäre
für ihn unsichtbar.

**Der Algorithmus in vier Regeln** (`template-sync.ts:21-75`):

1. Vorlagen-Position **ohne** verknüpfte Fahrzeug-Zeile → anlegen, `hinzugefuegt++`.
2. Verknüpfte Zeile mit `ueberschrieben` **oder** `entfernt` → **unangetastet** lassen,
   `uebersprungen++`.
3. Sonst: **nur schreiben, wenn sich `fachLabel`, `sort`, `artikelId` oder `soll` unterscheiden**,
   `aktualisiert++`.
4. Verwaiste Zeile (Vorlagen-Position gelöscht): `ueberschrieben` → **von der Vorlage lösen und als
   manuelle Zeile behalten**, `losgeloest++`; sonst löschen, `entfernt++`.

⚠️ **Regel 2 ist die, an der ein „aufgeräumter" Sync Daten zerstört.** Ein Grabstein ist **kein**
Soft-Delete: er verhindert, dass der Sync die Vorlagen-Position **wieder anlegt**. Wer `entfernt`
missversteht und die Zeilen **vor** dem Sync wegfiltert, legt sie beim nächsten Sync wieder an
(Teil 1, T7).

⚠️ **`SyncErgebnis` mit seinen fünf Zählern ist die Rückmeldung an die Oberfläche** und wird über
alle Fahrzeuge summiert, wenn eine **ganze Vorlage** synchronisiert wird (`templates.ts:143-148`).
Die Zähler sind kein Protokoll, sondern Bedienrückmeldung — deshalb bleiben sie.

**Die zwei Nebenwege liegen NICHT hier** (§5.7.2): „Lösen" (`templates.ts:164-174`) und „Vorlage aus
Fahrzeug" (`:180-204`) sind Actions und gehören **Teil 5**. Sie stehen in der Abgabetabelle mit ihrer
Semantik — insbesondere die **Paarung über den Index** (`:197-199`), die fragil aussieht und
konstruktiv stimmt: **dieser Zusammenhang gehört als Kommentar mit, sonst wirkt `for (let i = 0; …)`
wie ein Versehen und wird „repariert".**

- [ ] **Schritt 1: Test schreiben, rot sehen**

`src/app/m/lagerbuch/_db/template-sync.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, fahrzeugTemplates, lagerorte, sollPositionen,
         templatePositionen } from "./schema";
import { syncFahrzeugTemplate } from "../_lib/schreibpfade/templateSync";

const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-tplsync-");
  t.db.insert(fahrzeugTemplates).values(
    { id: "tpl", name: "RTW-Vorlage", aktiv: true, createdAt: NOW }).run();
  t.db.insert(lagerorte).values([
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null,
      aktiv: true, templateId: "tpl" },
    { id: "rtw-frei", name: "RTW ohne Vorlage", typ: "fahrzeug", kennung: null,
      aktiv: true, templateId: null },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "A", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a2", name: "B", einheit: "Stk.", fach: "A2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
});
afterEach(() => t.schliessen());

const soll = () => t.db.select().from(sollPositionen).all();

describe("Regel 1 — anlegen", () => {
  it("materialisiert jede Vorlagen-Position ohne verknuepfte Zeile", () => {
    // §5.7.2: der Check-Flow liest AUSSCHLIESSLICH soll_positionen. Eine live
    // berechnete Vorlage waere fuer ihn unsichtbar.
    t.db.insert(templatePositionen).values([
      { id: "tp1", templateId: "tpl", fachLabel: "Fach 1", sort: 0, artikelId: "a1", soll: 4 },
      { id: "tp2", templateId: "tpl", fachLabel: "Fach 2", sort: 1, artikelId: "a2", soll: 2 },
    ]).run();
    expect(syncFahrzeugTemplate(t.db, "rtw-1")).toEqual(
      { hinzugefuegt: 2, aktualisiert: 0, uebersprungen: 0, entfernt: 0, losgeloest: 0 });
    expect(soll()).toHaveLength(2);
    expect(soll()[0]).toMatchObject({ templatePositionId: "tp1",
      ueberschrieben: false, entfernt: false, soll: 4 });
  });

  it("ist idempotent — ein zweiter Lauf aendert nichts", () => {
    t.db.insert(templatePositionen).values(
      { id: "tp1", templateId: "tpl", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4 }).run();
    syncFahrzeugTemplate(t.db, "rtw-1");
    expect(syncFahrzeugTemplate(t.db, "rtw-1")).toEqual(
      { hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 0, entfernt: 0, losgeloest: 0 });
    expect(soll()).toHaveLength(1);
  });

  it("tut fuer ein Fahrzeug OHNE Vorlage gar nichts", () => {
    expect(syncFahrzeugTemplate(t.db, "rtw-frei")).toEqual(
      { hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 0, entfernt: 0, losgeloest: 0 });
  });
});

describe("Regel 2 — ueberschrieben und entfernt bleiben UNANGETASTET", () => {
  it("laesst eine ueberschriebene Zeile in Ruhe", () => {
    t.db.insert(templatePositionen).values(
      { id: "tp1", templateId: "tpl", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4 }).run();
    t.db.insert(sollPositionen).values(
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "Eigenes Fach", sort: 9,
        artikelId: "a1", soll: 99, templatePositionId: "tp1",
        ueberschrieben: true, entfernt: false }).run();
    expect(syncFahrzeugTemplate(t.db, "rtw-1").uebersprungen).toBe(1);
    expect(soll()[0]).toMatchObject({ soll: 99, fachLabel: "Eigenes Fach" });
  });

  it("legt eine als GRABSTEIN markierte Position NICHT wieder an", () => {
    /**
     * ⚠️ EIN GRABSTEIN IST KEIN SOFT-DELETE. Er verhindert, dass der Sync die
     * Vorlagen-Position WIEDER ANLEGT. Wer `entfernt` missversteht und die Zeilen
     * VOR dem Sync wegfiltert, legt sie beim naechsten Sync wieder an (Teil 1, T7).
     */
    t.db.insert(templatePositionen).values(
      { id: "tp1", templateId: "tpl", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4 }).run();
    t.db.insert(sollPositionen).values(
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4,
        templatePositionId: "tp1", ueberschrieben: false, entfernt: true }).run();
    expect(syncFahrzeugTemplate(t.db, "rtw-1")).toEqual(
      { hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 1, entfernt: 0, losgeloest: 0 });
    expect(soll()).toHaveLength(1);
    expect(soll()[0].entfernt).toBe(true);
  });
});

describe("Regel 3 — angleichen, aber nur bei echtem Unterschied", () => {
  it("schreibt, wenn sich soll, fachLabel, sort oder artikelId unterscheiden", () => {
    t.db.insert(templatePositionen).values(
      { id: "tp1", templateId: "tpl", fachLabel: "Neu", sort: 5, artikelId: "a2", soll: 7 }).run();
    t.db.insert(sollPositionen).values(
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "Alt", sort: 0, artikelId: "a1", soll: 4,
        templatePositionId: "tp1", ueberschrieben: false, entfernt: false }).run();
    expect(syncFahrzeugTemplate(t.db, "rtw-1").aktualisiert).toBe(1);
    expect(soll()[0]).toMatchObject(
      { fachLabel: "Neu", sort: 5, artikelId: "a2", soll: 7 });
  });

  it("schreibt NICHT, wenn alles gleich ist", () => {
    t.db.insert(templatePositionen).values(
      { id: "tp1", templateId: "tpl", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4 }).run();
    t.db.insert(sollPositionen).values(
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4,
        templatePositionId: "tp1", ueberschrieben: false, entfernt: false }).run();
    expect(syncFahrzeugTemplate(t.db, "rtw-1").aktualisiert).toBe(0);
  });
});

describe("Regel 4 — Waisen", () => {
  it("loest eine UEBERSCHRIEBENE Waise und behaelt sie als manuelle Zeile", () => {
    t.db.insert(sollPositionen).values(
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4,
        templatePositionId: null, ueberschrieben: false, entfernt: false }).run();
    // Verknuepfung auf eine Vorlagen-Position setzen, die es NICHT (mehr) gibt.
    t.db.insert(templatePositionen).values(
      { id: "tp-weg", templateId: "tpl", fachLabel: "X", sort: 0,
        artikelId: "a1", soll: 1 }).run();
    t.db.update(sollPositionen)
      .set({ templatePositionId: "tp-weg", ueberschrieben: true })
      .where(eq(sollPositionen.id, "sp1")).run();
    t.db.delete(templatePositionen).where(eq(templatePositionen.id, "tp-weg")).run();

    expect(syncFahrzeugTemplate(t.db, "rtw-1").losgeloest).toBe(1);
    expect(soll()[0]).toMatchObject(
      { id: "sp1", templatePositionId: null, ueberschrieben: false, soll: 4 });
  });

  it("LOESCHT eine nicht ueberschriebene Waise", () => {
    t.db.insert(templatePositionen).values(
      { id: "tp-weg", templateId: "tpl", fachLabel: "X", sort: 0,
        artikelId: "a1", soll: 1 }).run();
    t.db.insert(sollPositionen).values(
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4,
        templatePositionId: "tp-weg", ueberschrieben: false, entfernt: false }).run();
    t.db.delete(templatePositionen).where(eq(templatePositionen.id, "tp-weg")).run();

    expect(syncFahrzeugTemplate(t.db, "rtw-1").entfernt).toBe(1);
    expect(soll()).toHaveLength(0);
  });

  it("laesst MANUELLE Zeilen (templatePositionId null) unberuehrt", () => {
    t.db.insert(sollPositionen).values(
      { id: "sp-manuell", fahrzeugId: "rtw-1", fachLabel: "Eigen", sort: 0,
        artikelId: "a1", soll: 3, templatePositionId: null,
        ueberschrieben: false, entfernt: false }).run();
    expect(syncFahrzeugTemplate(t.db, "rtw-1")).toEqual(
      { hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 0, entfernt: 0, losgeloest: 0 });
    expect(soll()).toHaveLength(1);
  });
});

describe("die fuenf Zaehler sind die Bedienrueckmeldung", () => {
  it("zaehlt alle vier Regeln in EINEM Lauf getrennt", () => {
    t.db.insert(templatePositionen).values([
      { id: "tp-neu", templateId: "tpl", fachLabel: "N", sort: 0, artikelId: "a1", soll: 1 },
      { id: "tp-gleich", templateId: "tpl", fachLabel: "G", sort: 1, artikelId: "a1", soll: 2 },
      { id: "tp-anders", templateId: "tpl", fachLabel: "A-neu", sort: 2, artikelId: "a1", soll: 3 },
      { id: "tp-ueber", templateId: "tpl", fachLabel: "U", sort: 3, artikelId: "a1", soll: 4 },
      { id: "tp-tot", templateId: "tpl", fachLabel: "T", sort: 4, artikelId: "a1", soll: 5 },
    ]).run();
    t.db.insert(sollPositionen).values([
      { id: "s-gleich", fahrzeugId: "rtw-1", fachLabel: "G", sort: 1, artikelId: "a1", soll: 2,
        templatePositionId: "tp-gleich", ueberschrieben: false, entfernt: false },
      { id: "s-anders", fahrzeugId: "rtw-1", fachLabel: "A-alt", sort: 2, artikelId: "a1", soll: 9,
        templatePositionId: "tp-anders", ueberschrieben: false, entfernt: false },
      { id: "s-ueber", fahrzeugId: "rtw-1", fachLabel: "U", sort: 3, artikelId: "a1", soll: 99,
        templatePositionId: "tp-ueber", ueberschrieben: true, entfernt: false },
      { id: "s-tot", fahrzeugId: "rtw-1", fachLabel: "T", sort: 4, artikelId: "a1", soll: 5,
        templatePositionId: "tp-tot", ueberschrieben: false, entfernt: false },
    ]).run();
    t.db.delete(templatePositionen).where(eq(templatePositionen.id, "tp-tot")).run();

    expect(syncFahrzeugTemplate(t.db, "rtw-1")).toEqual(
      { hinzugefuegt: 1, aktualisiert: 1, uebersprungen: 1, entfernt: 1, losgeloest: 0 });
  });
});
```

- [ ] **Schritt 2: `_lib/schreibpfade/templateSync.ts` schreiben**

```ts
/**
 * Vorlagen-Synchronisierung — MATERIALISIEREND, nicht live rechnend.
 *
 * Kein "use client". Laeuft transaktions-FREI; die Aufrufer (Actions, Teil 5)
 * uebergeben ihre `tx` als `db`, wenn Atomaritaet gefordert ist.
 *
 * WARUM MATERIALISIERT WIRD (§5.7.2): der Check-Flow liest AUSSCHLIESSLICH
 * `soll_positionen` (`template-sync.ts:13-17`). Eine live berechnete Vorlage waere
 * fuer ihn unsichtbar.
 *
 * ⚠️ EIN GRABSTEIN (`entfernt = true`) IST KEIN SOFT-DELETE. Er verhindert, dass
 * der Sync die Vorlagen-Position WIEDER ANLEGT. Wer `entfernt` missversteht und
 * die Zeilen VOR dem Sync wegfiltert, legt sie beim naechsten Sync wieder an.
 *
 * ⚠️ DIE ZWEI NEBENWEGE LIEGEN NICHT HIER: „Loesen" (`templates.ts:164-174`) und
 * „Vorlage aus Fahrzeug" (`:180-204`) sind Actions und gehoeren Teil 5. Sie stehen
 * mit ihrer Semantik in der Abgabetabelle — insbesondere die Paarung ueber den
 * Index (`:197-199`), die fragil AUSSIEHT und konstruktiv stimmt (dieselbe
 * Transaktion, dieselbe Quelle). Der Zusammenhang gehoert als Kommentar mit,
 * sonst wirkt `for (let i = 0; …)` wie ein Versehen und wird „repariert".
 */
import { eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { lagerorte, sollPositionen, templatePositionen, newId } from "../../_db/schema";
import type { Tx } from "./abbuchung";

/** Die Rueckmeldung an die Oberflaeche — fuenf Zaehler, ueber alle Fahrzeuge
 *  summierbar, wenn eine GANZE Vorlage synchronisiert wird
 *  (`templates.ts:143-148`). Kein Protokoll, sondern Bedienrueckmeldung. */
export type SyncErgebnis = {
  /** neue Positionen aus der Vorlage materialisiert */
  hinzugefuegt: number;
  /** Vorlagen-Positionen an die Vorlage angeglichen */
  aktualisiert: number;
  /** manuell ueberschrieben oder entfernt → unangetastet */
  uebersprungen: number;
  /** in der Vorlage geloeschte Positionen aus dem Fahrzeug entfernt */
  entfernt: number;
  /** ueberschriebene Waisen zu manuellen Positionen gemacht */
  losgeloest: number;
};

export function syncFahrzeugTemplate(db: DB | Tx, fahrzeugId: string): SyncErgebnis {
  const erg: SyncErgebnis = {
    hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 0, entfernt: 0, losgeloest: 0,
  };
  const fahrzeug = db.select().from(lagerorte).where(eq(lagerorte.id, fahrzeugId)).get();
  if (!fahrzeug?.templateId) return erg;

  const tpRows = db.select().from(templatePositionen)
    .where(eq(templatePositionen.templateId, fahrzeug.templateId)).all();
  const tpById = new Map(tpRows.map((t) => [t.id, t]));

  const existing = db.select().from(sollPositionen)
    .where(eq(sollPositionen.fahrzeugId, fahrzeugId)).all();
  const linkedByTp = new Map<string, (typeof existing)[number]>();
  for (const r of existing) if (r.templatePositionId) linkedByTp.set(r.templatePositionId, r);

  // REGEL 1 und 2 und 3 — je Vorlagen-Position.
  for (const tp of tpRows) {
    const row = linkedByTp.get(tp.id);
    if (!row) {
      // Regel 1: anlegen.
      db.insert(sollPositionen).values({
        id: newId(), fahrzeugId, fachLabel: tp.fachLabel, sort: tp.sort,
        artikelId: tp.artikelId, soll: tp.soll, templatePositionId: tp.id,
        ueberschrieben: false, entfernt: false,
      }).run();
      erg.hinzugefuegt += 1;
      continue;
    }
    if (row.ueberschrieben || row.entfernt) {
      // Regel 2: manuell angepasst ODER bewusst ausgelassen → in Ruhe lassen.
      erg.uebersprungen += 1;
      continue;
    }
    // Regel 3: unveraenderte Vorlagen-Zeile — nur schreiben, wenn sich etwas
    // geaendert hat. Ein bedingungsloses UPDATE waere kein Fehler, aber es
    // machte den `aktualisiert`-Zaehler wertlos, und der IST die Rueckmeldung.
    if (row.fachLabel !== tp.fachLabel || row.sort !== tp.sort ||
        row.artikelId !== tp.artikelId || row.soll !== tp.soll) {
      db.update(sollPositionen)
        .set({ fachLabel: tp.fachLabel, sort: tp.sort,
               artikelId: tp.artikelId, soll: tp.soll })
        .where(eq(sollPositionen.id, row.id))
        .run();
      erg.aktualisiert += 1;
    }
  }

  // REGEL 4 — verwaiste Zeilen (die Vorlagen-Position wurde geloescht).
  for (const r of existing) {
    if (!r.templatePositionId || tpById.has(r.templatePositionId)) continue;
    if (r.ueberschrieben) {
      // Die Ueberschreibung war GEWOLLT → als manuelle Position erhalten, nur von
      // der Vorlage loesen.
      db.update(sollPositionen)
        .set({ templatePositionId: null, ueberschrieben: false })
        .where(eq(sollPositionen.id, r.id))
        .run();
      erg.losgeloest += 1;
    } else {
      db.delete(sollPositionen).where(eq(sollPositionen.id, r.id)).run();
      erg.entfernt += 1;
    }
  }

  return erg;
}
```

- [ ] **Schritt 3: Grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/template-sync.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/schreibpfade/templateSync.ts \
        src/app/m/lagerbuch/_db/template-sync.test.ts
git commit -m "feat(lagerbuch): _lib/schreibpfade/templateSync.ts — vier Regeln, einzeln getestet

§5.7.2, 1:1. Materialisierend, weil der Check-Flow ausschliesslich
soll_positionen liest — eine live berechnete Vorlage waere fuer ihn unsichtbar.

Ein Grabstein ist KEIN Soft-Delete: er verhindert, dass der Sync die
Vorlagen-Position wieder anlegt. Wer entfernt-Zeilen vor dem Sync wegfiltert,
legt sie beim naechsten Sync wieder an.

Regel 3 schreibt nur bei echtem Unterschied — ein bedingungsloses UPDATE waere
kein Fehler, machte aber den aktualisiert-Zaehler wertlos, und der IST die
Rueckmeldung an die Oberflaeche.

Die zwei Nebenwege (Loesen, Vorlage aus Fahrzeug) sind Actions und gehoeren
Teil 5 — sie stehen mit ihrer Semantik in der Abgabetabelle."
```

---

### Gate — Ende Welle 5

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

---

## Welle 6 — Schreibpfade, Stufe 2 (2 Tasks, parallel)

Beide rufen `fefoAbbuchung` aus T54.

---

### Task 57: `_lib/schreibpfade/umlagerung.ts` — I3: netto null, strikt aus `teile[]`

**Files:**
- Create: `src/app/m/lagerbuch/_lib/schreibpfade/umlagerung.ts`
- Test: `src/app/m/lagerbuch/_lib/schreibpfade/umlagerung.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` — `buchungen`, `newId`; `_lib/schreibpfade/abbuchung.ts` (T54) —
  `fefoAbbuchung`, `type Tx`, `type Quelle`, `type Teil`.
- Produces:
  ```ts
  export function umlagerung(tx: Tx, args: {
    artikelId: string; menge: number; vonLagerortId: string; nachLagerortId: string;
    quelle: Quelle; kommentar: string | null; referenz: string;
  }): { umgelagert: number; teile: Teil[] };
  ```
  Konsumenten: `_actions/check.ts` (Teil 4, Schritt 3), `_actions/buchung.ts` (Teil 5).

**Invariante I3, und die Zeile, vor der der Alt-Quelltext warnt** (`umlagerung.ts:26-27`): das
**Ziel-Leg wird STRIKT aus `teile[]` gebucht**, also aus der tatsächlich gebuchten Verteilung — **nie
aus `menge`**. Ist die Quelle knapp, kappt `fefoAbbuchung`; ein Ziel-Leg aus `menge` erzeugte dann
Bestand aus dem Nichts, und die Summe **aller** Buchungen des Artikels wäre nicht mehr gleich.

**Beide Legs tragen `typ = "umlagerung"`** (`:8-9`) — **nicht** `zugang`/`entnahme` —, damit
Reporting und Bestellvorschlag eine **interne Verschiebung** nicht als Wareneingang oder Verbrauch
missverstehen. ⚠️ **Genau deshalb löscht eine Umlagerung die Bestellt-Markierung NICHT** (§5.5,
Punkt 2): nur ein `zugang` tut das, und das bleibt 1:1.

**Die `chargeId` bleibt erhalten** — die Verfall-Provenienz wandert mit.

- [ ] **Schritt 1: Test schreiben, rot sehen**

`src/app/m/lagerbuch/_lib/schreibpfade/umlagerung.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import { umlagerung } from "./umlagerung";
import type { Quelle } from "./abbuchung";
import { bestandProLagerort } from "../domain/bestand";
import { HANDLAGER_ID } from "../konstanten";

const NOW = new Date("2026-06-15T10:00:00Z");
const QUELLE: Quelle = { quelleTyp: "token", quelleId: "111-111" };
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sp-umlagerung-");
  t.db.insert(lagerorte).values(
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null, aktiv: true }).run();
  t.db.insert(artikel).values(
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW }).run();
  t.db.insert(chargen).values([
    { id: "c-frueh", artikelId: "a1", chargenNr: "F", verfall: "2026-07", createdAt: NOW },
    { id: "c-spaet", artikelId: "a1", chargenNr: "S", verfall: "2028-01", createdAt: NOW },
  ]).run();
  for (const [chargeId, menge] of [["c-frueh", 3], ["c-spaet", 4]] as const) {
    t.db.insert(buchungen).values({
      id: newId(), ts: NOW, typ: "zugang", artikelId: "a1", chargeId,
      lagerortId: HANDLAGER_ID, menge, quelleTyp: "system", quelleId: "t",
      referenz: null, kommentar: null,
    }).run();
  }
});
afterEach(() => t.schliessen());

const alleZeilen = () => t.db.select().from(buchungen).all();
const summe = () => alleZeilen().reduce((s, b) => s + b.menge, 0);

function inTx<T>(fn: (tx: Parameters<Parameters<typeof t.db.transaction>[0]>[0]) => T): T {
  return t.db.transaction((tx) => fn(tx));
}

describe("umlagerung — I3: netto null", () => {
  it("die Summe ALLER Buchungen des Artikels ist vorher und nachher gleich", () => {
    const vorher = summe();
    inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 5, vonLagerortId: HANDLAGER_ID, nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(summe()).toBe(vorher);
  });

  it("verschiebt den Bestand vollstaendig zwischen den Lagerorten", () => {
    inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 5, vonLagerortId: HANDLAGER_ID, nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    const roh = alleZeilen().map((b) => ({ lagerortId: b.lagerortId, menge: b.menge }));
    expect(bestandProLagerort(roh, HANDLAGER_ID)).toBe(2);
    expect(bestandProLagerort(roh, "rtw-1")).toBe(5);
  });
});

describe("umlagerung — das Ziel-Leg kommt STRIKT aus teile[]", () => {
  it("bei knapper Quelle wird nur das UMGELAGERTE gutgeschrieben", () => {
    /**
     * ⚠️ DIE ZEILE, VOR DER `umlagerung.ts:26` WARNT. Ein Ziel-Leg aus `menge`
     * statt aus `teile[]` erzeugte Bestand AUS DEM NICHTS: die Quelle wird an
     * ihrer Verfuegbarkeit gekappt, das Ziel bekaeme trotzdem die volle Menge, und
     * die Summe aller Buchungen waere nicht mehr gleich.
     */
    const vorher = summe();
    const r = inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 100, vonLagerortId: HANDLAGER_ID, nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r.umgelagert).toBe(7);
    expect(summe()).toBe(vorher);
    const roh = alleZeilen().map((b) => ({ lagerortId: b.lagerortId, menge: b.menge }));
    expect(bestandProLagerort(roh, HANDLAGER_ID)).toBe(0);
    expect(bestandProLagerort(roh, "rtw-1")).toBe(7);
  });

  it("schreibt bei LEERER Quelle GAR KEINE Zeile", () => {
    const vorher = alleZeilen().length;
    const r = inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 5, vonLagerortId: "rtw-1", nachLagerortId: HANDLAGER_ID,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r).toEqual({ umgelagert: 0, teile: [] });
    expect(alleZeilen()).toHaveLength(vorher);
  });
});

describe("umlagerung — die chargeId und der Typ", () => {
  it("erhaelt die chargeId je Teil — die Verfall-Provenienz wandert mit", () => {
    inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 5, vonLagerortId: HANDLAGER_ID, nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    const zielLegs = alleZeilen().filter((b) => b.lagerortId === "rtw-1");
    expect(zielLegs.map((b) => [b.chargeId, b.menge]).sort())
      .toEqual([["c-frueh", 3], ["c-spaet", 2]].sort());
  });

  it("BEIDE Legs tragen typ 'umlagerung', nicht zugang/entnahme", () => {
    /**
     * `umlagerung.ts:8-9`: damit Reporting und Bestellvorschlag eine INTERNE
     * Verschiebung nicht als Wareneingang oder Verbrauch missverstehen. Genau
     * deshalb loescht eine Umlagerung die Bestellt-Markierung NICHT (§5.5) — nur
     * ein `zugang` tut das, und das bleibt 1:1.
     */
    inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 5, vonLagerortId: HANDLAGER_ID, nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    const neu = alleZeilen().filter((b) => b.referenz === "check:abc");
    expect(neu).toHaveLength(4);
    for (const b of neu) expect(b.typ).toBe("umlagerung");
  });

  it("traegt Referenz, Kommentar und Quelle auf BEIDEN Legs", () => {
    inTx((tx) => umlagerung(tx, {
      artikelId: "a1", menge: 3, vonLagerortId: HANDLAGER_ID, nachLagerortId: "rtw-1",
      quelle: QUELLE, kommentar: "Nachfüllung", referenz: "check:xyz" }));
    for (const b of alleZeilen().filter((x) => x.referenz === "check:xyz")) {
      expect(b.kommentar).toBe("Nachfüllung");
      expect(b.quelleTyp).toBe("token");
      expect(b.quelleId).toBe("111-111");
    }
  });
});
```

- [ ] **Schritt 2: `_lib/schreibpfade/umlagerung.ts` schreiben**

```ts
/**
 * Umlagerung zwischen zwei Lagerorten — transaktionsfrei (Festlegung H3).
 *
 * INVARIANTE I3 — NETTO NULL. Das Ziel-Leg wird STRIKT aus `teile[]` gebucht,
 * also aus der TATSAECHLICH gebuchten Verteilung, NIE aus `menge`. Ist die Quelle
 * knapp, kappt `fefoAbbuchung`; ein Ziel-Leg aus `menge` erzeugte dann Bestand AUS
 * DEM NICHTS, und die Summe aller Buchungen des Artikels waere nicht mehr gleich.
 * `umlagerung.ts:26` warnt woertlich vor genau dieser Zeile.
 *
 * BEIDE LEGS TRAGEN `typ = "umlagerung"` (`:8-9`), nicht zugang/entnahme — damit
 * Reporting und Bestellvorschlag eine INTERNE Verschiebung nicht als Wareneingang
 * oder Verbrauch missverstehen.
 * ⚠️ Genau deshalb loescht eine Umlagerung die Bestellt-Markierung NICHT (§5.5,
 * Punkt 2): nur ein `zugang` tut das, und das bleibt 1:1.
 *
 * DIE `chargeId` BLEIBT ERHALTEN — die Verfall-Provenienz wandert mit.
 */
import { buchungen, newId } from "../../_db/schema";
import { fefoAbbuchung, type Quelle, type Teil, type Tx } from "./abbuchung";

export function umlagerung(
  tx: Tx,
  args: {
    artikelId: string;
    menge: number;
    vonLagerortId: string;
    nachLagerortId: string;
    quelle: Quelle;
    kommentar: string | null;
    /** Pflicht, nicht optional: eine Umlagerung ist IMMER Teil eines Vorgangs
     *  (`check:<id>`, `entnahme-ziel:<lagerortId>`), und die Referenz ist die
     *  einzige Klammer zwischen den beiden Legs (§5.14.4). */
    referenz: string;
  },
): { umgelagert: number; teile: Teil[] } {
  const { artikelId, menge, vonLagerortId, nachLagerortId, quelle, kommentar, referenz } = args;

  const { gebucht, teile } = fefoAbbuchung(tx, {
    artikelId, menge, lagerortId: vonLagerortId, quelle, kommentar, referenz,
    typ: "umlagerung",
  });

  // ⚠️ STRIKT AUS `teile[]` — nie aus `menge`. Sonst Netto != 0.
  for (const teil of teile) {
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ: "umlagerung", artikelId,
      chargeId: teil.chargeId, lagerortId: nachLagerortId, menge: teil.menge,
      quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId, referenz, kommentar,
    }).run();
  }

  return { umgelagert: gebucht, teile };
}
```

- [ ] **Schritt 3: Grün, Mutationsprobe, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/schreibpfade/umlagerung.test.ts
```

**Mutationsprobe (§5.19.3):** ersetze die Schleife durch **ein** Ziel-Leg mit `menge: menge` und der
Charge des ersten Teils. Erwartet: **rot** in „bei knapper Quelle wird nur das UMGELAGERTE
gutgeschrieben" (die Summe stimmt nicht mehr). Zurücknehmen.

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/schreibpfade/umlagerung.ts \
        src/app/m/lagerbuch/_lib/schreibpfade/umlagerung.test.ts
git commit -m "feat(lagerbuch): _lib/schreibpfade/umlagerung.ts — I3, strikt aus teile[]

Das Ziel-Leg kommt aus der TATSAECHLICH gebuchten Verteilung, nie aus menge. Bei
knapper Quelle kappt fefoAbbuchung; ein Ziel-Leg aus menge erzeugte Bestand aus
dem Nichts. Der Test prueft die Summe ALLER Buchungen vorher/nachher.

Beide Legs tragen typ 'umlagerung' — deshalb loescht eine Umlagerung die
Bestellt-Markierung nicht (§5.5), und das bleibt 1:1.

Mutationsprobe (ein Ziel-Leg aus menge) gefahren."
```

---

### Task 58: `_lib/schreibpfade/korrektur.ts` — I4, und die geratene Charge

**Files:**
- Create: `src/app/m/lagerbuch/_lib/schreibpfade/korrektur.ts`
- Test: `src/app/m/lagerbuch/_lib/schreibpfade/korrektur.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` — `buchungen`, `chargen`, `newId`;
  `_lib/schreibpfade/abbuchung.ts` (T54) — `fefoAbbuchung`, `type Tx`, `type Quelle`;
  `_lib/lesepfade/bestand.ts` (T44) — `restJeChargeFuerArtikel`; `_lib/konstanten.ts` —
  `CHARGE_KORREKTUR`, `PSEUDO_VERFALL`.
- Produces:
  ```ts
  export function korrekturAufLagerort(tx: Tx, args: {
    artikelId: string; lagerortId: string; istMenge: number;
    quelle: Quelle; kommentar: string | null; referenz: string;
  }): { diff: number; chargeId: string | null };
  ```
  Konsumenten: `_actions/check.ts` (Teil 4, Schritt 2). ⚠️ **`inventurKorrektur` (§5.9) ruft es
  NICHT** — es rechnet gegen den Handlager und hat eine **andere** Absendekonvention; es gehört
  Teil 5 und steht in der Abgabetabelle.

**Die Zusage: I4.** Nach `korrekturAufLagerort(…, istMenge)` gilt
`bestandProLagerort(…, lagerortId) === istMenge`. So steht es als Zusage im Quelltext
(`korrektur.ts:12`), und so wird es benutzt: der Fahrzeug-Check setzt den Fahrzeugbestand je Artikel
auf die Summe der gezählten Ist.

⚠️ **HIER WIRD DIE CHARGE GERATEN — eine von genau ZWEI Stellen im ganzen Modul** (§5.3.3; die
zweite ist `inventurKorrektur`, Teil 5). Bei `diff > 0` wählt die Funktion die **jüngste Charge des
Artikels OHNE jeden Lagerortbezug** (`verfall` absteigend, Tiebreak `createdAt` absteigend). **Der
Fahrzeug-Check kann Fahrzeugbestand damit auf eine Charge buchen, die nie im Fahrzeug lag.**

**Das ist kein Defekt, den man beim Port „behebt", sondern ein bewusster Kompromiss mit einer
Kompensation:** weil die Charge geraten ist, ist die Frage „wann läuft das Zeug im Fahrzeug ab?"
über Chargen **nicht** beantwortbar — und **genau dafür** gibt es `lagerort_verfall` (§4.11, T47,
T55). ⚠️ **Wer beim Neubau das Verfall-Feld im Zählschritt als redundant streicht („die Charge hat
doch einen Verfall"), zerstört diese Kompensation lautlos.** Die Fahrzeug-Verfallsampel hängt danach
an einer geratenen Charge, und typecheck, lint und Vitest bleiben grün (Falle 9).

⚠️ **Die Pseudo-Charge trägt `chargenNr = "Korrektur"` und `verfall = PSEUDO_VERFALL`.** Die
Bedeutung hängt am **Verfallswert**, nie am Namen (§5.3.2) — die Nummer bleibt als
**Herkunftshinweis**, sie ist das einzige Fundstück, das später noch sagt, woher eine Zeile kam.

- [ ] **Schritt 1: Test schreiben, rot sehen**

`src/app/m/lagerbuch/_lib/schreibpfade/korrektur.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "../../_db/schema";
import { korrekturAufLagerort } from "./korrektur";
import type { Quelle } from "./abbuchung";
import { bestandProLagerort } from "../domain/bestand";
import { HANDLAGER_ID, PSEUDO_VERFALL, CHARGE_KORREKTUR, istOhneVerfall } from "../konstanten";

const NOW = new Date("2026-06-15T10:00:00Z");
const QUELLE: Quelle = { quelleTyp: "token", quelleId: "111-111" };
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sp-korrektur-");
  t.db.insert(lagerorte).values(
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null, aktiv: true }).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a-ohne", name: "Ohne Charge", einheit: "Stk.", fach: "A2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
  t.db.insert(chargen).values([
    { id: "c-alt", artikelId: "a1", chargenNr: "ALT", verfall: "2026-07",
      createdAt: new Date("2026-01-01T00:00:00Z") },
    { id: "c-neu", artikelId: "a1", chargenNr: "NEU", verfall: "2028-01",
      createdAt: new Date("2026-02-01T00:00:00Z") },
  ]).run();
  const b = (chargeId: string, lagerortId: string, menge: number) => ({
    id: newId(), ts: NOW, typ: "zugang" as const, artikelId: "a1", chargeId, lagerortId, menge,
    quelleTyp: "system" as const, quelleId: "t", referenz: null, kommentar: null,
  });
  t.db.insert(buchungen).values([
    b("c-alt", HANDLAGER_ID, 20),
    b("c-alt", "rtw-1", 4),
  ]).run();
});
afterEach(() => t.schliessen());

const rohZeilen = () => t.db.select().from(buchungen).all()
  .map((x) => ({ lagerortId: x.lagerortId, menge: x.menge, artikelId: x.artikelId }));

function inTx<T>(fn: (tx: Parameters<Parameters<typeof t.db.transaction>[0]>[0]) => T): T {
  return t.db.transaction((tx) => fn(tx));
}

describe("korrekturAufLagerort — I4", () => {
  it("nach dem Abgleich gilt bestandProLagerort === istMenge (Abwaerts)", () => {
    const r = inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 1,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r.diff).toBe(-3);
    expect(bestandProLagerort(rohZeilen().filter((x) => x.artikelId === "a1"), "rtw-1")).toBe(1);
  });

  it("nach dem Abgleich gilt bestandProLagerort === istMenge (Aufwaerts)", () => {
    const r = inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 9,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r.diff).toBe(5);
    expect(bestandProLagerort(rohZeilen().filter((x) => x.artikelId === "a1"), "rtw-1")).toBe(9);
  });

  it("diff === 0 schreibt NICHTS", () => {
    const vorher = t.db.select().from(buchungen).all().length;
    const r = inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 4,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r).toEqual({ diff: 0, chargeId: null });
    expect(t.db.select().from(buchungen).all()).toHaveLength(vorher);
  });

  it("laesst den HANDLAGER-Bestand unberuehrt", () => {
    // Der Abgleich ist LAGERORT-GESCOPED. Ohne das Scoping saehe er 24 statt 4
    // und buchte eine Korrektur von −23 statt −3.
    inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 1,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(bestandProLagerort(rohZeilen().filter((x) => x.artikelId === "a1"), HANDLAGER_ID))
      .toBe(20);
  });
});

describe("korrekturAufLagerort — diff < 0 laeuft ueber FEFO", () => {
  it("bucht negativ mit typ 'korrektur' und der Referenz", () => {
    inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 1,
      quelle: QUELLE, kommentar: "Fahrzeug-Check", referenz: "check:abc" }));
    const neu = t.db.select().from(buchungen).all().filter((b) => b.referenz === "check:abc");
    expect(neu).toHaveLength(1);
    expect(neu[0]).toMatchObject({ typ: "korrektur", menge: -3,
      lagerortId: "rtw-1", chargeId: "c-alt" });
  });
});

describe("korrekturAufLagerort — diff > 0: DIE CHARGE WIRD GERATEN (§5.3.3)", () => {
  it("waehlt die JUENGSTE Charge des Artikels OHNE Lagerortbezug", () => {
    /**
     * ⚠️ EINE VON GENAU ZWEI STELLEN IM MODUL, an denen die Charge geraten wird
     * (die zweite ist `inventurKorrektur`, Teil 5). `c-neu` (2028-01) liegt
     * NIRGENDWO im Fahrzeug — und wird trotzdem gewaehlt. DAS IST KEIN DEFEKT,
     * DEN MAN BEIM PORT BEHEBT, sondern ein bewusster Kompromiss MIT einer
     * Kompensation: weil die Charge geraten ist, beantwortet `lagerort_verfall`
     * die Frage „wann laeuft das Zeug im Fahrzeug ab?" (§4.11).
     *
     * Wer das Verfall-Feld im Zaehlschritt als redundant streicht, zerstoert die
     * Kompensation LAUTLOS — und kein Gate wird rot (Falle 9).
     */
    const r = inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 9,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    expect(r.chargeId).toBe("c-neu");
    const neu = t.db.select().from(buchungen).all().filter((b) => b.referenz === "check:abc");
    expect(neu[0]).toMatchObject({ typ: "korrektur", menge: 5, chargeId: "c-neu" });
  });

  it("entscheidet bei gleichem Verfall ueber die JUENGERE createdAt", () => {
    t.db.insert(chargen).values(
      { id: "c-neuer", artikelId: "a1", chargenNr: "NEUER", verfall: "2028-01",
        createdAt: new Date("2026-03-01T00:00:00Z") }).run();
    const r = inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "rtw-1", istMenge: 5,
      quelle: QUELLE, kommentar: null, referenz: "check:xyz" }));
    expect(r.chargeId).toBe("c-neuer");
  });

  it("legt eine PSEUDO-CHARGE an, wenn der Artikel gar keine hat", () => {
    const r = inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a-ohne", lagerortId: "rtw-1", istMenge: 3,
      quelle: QUELLE, kommentar: null, referenz: "check:abc" }));
    const c = t.db.select().from(chargen).all().find((x) => x.id === r.chargeId)!;
    expect(c.chargenNr).toBe(CHARGE_KORREKTUR);
    expect(c.verfall).toBe(PSEUDO_VERFALL);
    // ⚠️ Die BEDEUTUNG haengt am Verfallswert, NIE am Namen (§5.3.2). Die Nummer
    // bleibt als Herkunftshinweis — das einzige Fundstueck, das spaeter noch sagt,
    // woher die Zeile kam.
    expect(istOhneVerfall(c.verfall)).toBe(true);
  });

  it("legt bei einem ZWEITEN Lauf KEINE zweite Pseudo-Charge an", () => {
    inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a-ohne", lagerortId: "rtw-1", istMenge: 3,
      quelle: QUELLE, kommentar: null, referenz: "check:1" }));
    inTx((tx) => korrekturAufLagerort(tx, {
      artikelId: "a-ohne", lagerortId: "rtw-1", istMenge: 8,
      quelle: QUELLE, kommentar: null, referenz: "check:2" }));
    expect(t.db.select().from(chargen).all().filter((c) => c.artikelId === "a-ohne"))
      .toHaveLength(1);
  });
});
```

- [ ] **Schritt 2: `_lib/schreibpfade/korrektur.ts` schreiben**

```ts
/**
 * Gleicht den recorded Bestand EINES Lagerorts auf den gezaehlten Ist ab.
 * Transaktionsfrei (Festlegung H3).
 *
 *   diff = ist − recorded
 *   diff < 0  → FEFO-Korrektur ueber die Chargen DIESES Lagerorts (nur dessen Rest)
 *   diff > 0  → +diff auf die JUENGSTE existierende Charge des Artikels,
 *               sonst eine Pseudo-Charge ("Korrektur" / PSEUDO_VERFALL)
 *   diff == 0 → No-Op, es wird NICHTS geschrieben
 *
 * DIE ZUSAGE IST I4: danach gilt `bestandProLagerort(…, lagerortId) === istMenge`.
 * So wird es benutzt — der Fahrzeug-Check setzt den Fahrzeugbestand je Artikel auf
 * die Summe der gezaehlten Ist (`check.ts:107-110`).
 *
 * ⚠️ HIER WIRD DIE CHARGE GERATEN — eine von genau ZWEI Stellen im Modul (§5.3.3;
 * die zweite ist `inventurKorrektur`, Teil 5). Bei `diff > 0` waehlt die Funktion
 * die JUENGSTE Charge des Artikels OHNE JEDEN LAGERORTBEZUG. Der Fahrzeug-Check
 * kann Fahrzeugbestand damit auf eine Charge buchen, DIE NIE IM FAHRZEUG LAG.
 *
 * DAS IST KEIN DEFEKT, DEN MAN BEIM PORT „BEHEBT", sondern ein bewusster
 * Kompromiss MIT EINER KOMPENSATION: weil die Charge geraten ist, ist die Frage
 * „wann laeuft das Zeug im Fahrzeug ab?" ueber Chargen NICHT beantwortbar — und
 * genau dafuer gibt es `lagerort_verfall` (§4.11). ⚠️ WER BEIM NEUBAU DAS
 * VERFALL-FELD IM ZAEHLSCHRITT ALS REDUNDANT STREICHT („die Charge hat doch einen
 * Verfall"), ZERSTOERT DIESE KOMPENSATION LAUTLOS. Die Fahrzeug-Verfallsampel
 * haengt danach an einer geratenen Charge, und typecheck, lint und Vitest bleiben
 * gruen (Falle 9).
 */
import { eq } from "drizzle-orm";
import { buchungen, chargen, newId } from "../../_db/schema";
import { CHARGE_KORREKTUR, PSEUDO_VERFALL } from "../konstanten";
import { restJeChargeFuerArtikel } from "../lesepfade/bestand";
import { fefoAbbuchung, type Quelle, type Tx } from "./abbuchung";

export function korrekturAufLagerort(
  tx: Tx,
  args: {
    artikelId: string;
    lagerortId: string;
    istMenge: number;
    quelle: Quelle;
    kommentar: string | null;
    referenz: string;
  },
): { diff: number; chargeId: string | null } {
  const { artikelId, lagerortId, istMenge, quelle, kommentar, referenz } = args;

  /**
   * LAGERORT-GESCOPED. `korrektur.ts:18-19` laedt heute alle Buchungen des
   * Artikels und filtert in JS; ohne das Scoping saehe der Abgleich den
   * Handlager-Bestand mit und buchte eine viel zu grosse Korrektur.
   *
   * ⚠️ HIER STEHT `restJeChargeFuerArtikel` UND NICHT `bestandJeArtikel`, und das
   * ist eine Entscheidung: `bestandJeArtikel(tx, lagerortId)` aggregierte JEDEN
   * Artikel am Lagerort, um EINEN zu lesen — der Fahrzeug-Check ruft diese
   * Funktion je Artikel, bei 60 Artikeln also 60-mal. Die
   * Zwei-Praedikat-Form laeuft auf `idx_buchungen_artikel_lagerort_charge`, genau
   * dem Index, der fuer die Schreibseite angelegt wurde (§4.14) — und sie ist
   * DIESELBE Abfrage, die `fefoAbbuchung` nebenan schon fuehrt.
   *
   * Die Summe ueber die Chargen-Reste EINES Artikels an EINEM Lagerort ist
   * definitionsgemaess sein Bestand dort; `_db/aggregate.test.ts` haelt beide
   * Wege gegen `bestandProLagerort` (T44).
   */
  let recorded = 0;
  for (const rest of restJeChargeFuerArtikel(tx, artikelId, lagerortId).values()) {
    recorded += rest;
  }
  const diff = istMenge - recorded;
  if (diff === 0) return { diff: 0, chargeId: null };

  if (diff < 0) {
    const { teile } = fefoAbbuchung(tx, {
      artikelId, menge: -diff, lagerortId, quelle, kommentar, referenz, typ: "korrektur",
    });
    return { diff, chargeId: teile[0]?.chargeId ?? null };
  }

  // diff > 0 — DIE GERATENE CHARGE. Juengste zuerst: `verfall` ABSTEIGEND,
  // Tiebreak `createdAt` ABSTEIGEND. (Gegenlaeufig zu FEFO, und das ist richtig:
  // beim Nachbuchen soll die Ware mit der laengsten Restlaufzeit gewaehlt werden.)
  const chs = tx.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  let chargeId: string;
  if (chs.length > 0) {
    chargeId = chs
      .slice()
      .sort((a, b) =>
        b.verfall.localeCompare(a.verfall) || (b.createdAt.getTime() - a.createdAt.getTime()))[0]
      .id;
  } else {
    chargeId = newId();
    tx.insert(chargen).values({
      id: chargeId, artikelId,
      // ⚠️ Die BEDEUTUNG haengt am VERFALLSWERT, nie an der Nummer (§5.3.2). Die
      // Nummer bleibt als Herkunftshinweis — sie ist das einzige Fundstueck, das
      // spaeter noch sagt, woher die Zeile kam.
      chargenNr: CHARGE_KORREKTUR, verfall: PSEUDO_VERFALL, createdAt: new Date(),
    }).run();
  }

  tx.insert(buchungen).values({
    id: newId(), ts: new Date(), typ: "korrektur", artikelId, chargeId,
    lagerortId, menge: diff,
    quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId, referenz, kommentar,
  }).run();

  return { diff, chargeId };
}
```

- [ ] **Schritt 3: Grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/schreibpfade/korrektur.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/schreibpfade/korrektur.ts \
        src/app/m/lagerbuch/_lib/schreibpfade/korrektur.test.ts
git commit -m "feat(lagerbuch): _lib/schreibpfade/korrektur.ts — I4 und die geratene Charge

Nach korrekturAufLagerort(..., istMenge) gilt bestandProLagerort === istMenge.
Der Abgleich ist lagerort-gescoped — ohne das saehe er den Handlager-Bestand mit
und buchte eine viel zu grosse Korrektur.

Bei diff > 0 wird die Charge GERATEN: juengste Charge des Artikels OHNE jeden
Lagerortbezug (§5.3.3). Eine von genau ZWEI Stellen im Modul. Das ist kein Defekt,
den der Port behebt, sondern ein bewusster Kompromiss MIT Kompensation —
lagerort_verfall beantwortet die Frage 'wann laeuft das Zeug im Fahrzeug ab'.
Wer das Verfall-Feld im Zaehlschritt streicht, zerstoert sie lautlos, und kein
Gate wird rot.

Die Pseudo-Charge traegt 'Korrektur' / 2099-12; die Bedeutung haengt am
Verfallswert, die Nummer bleibt Herkunftshinweis (§5.3.2)."
```

---

### Gate — Ende Welle 6

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
TZ=UTC pnpm vitest run src/app/m/lagerbuch/
```

⚠️ **Ab hier ist die gesamte Fachlogik von §5 gebaut.** Was fehlt, sind ausschließlich die
**Aufrufstellen** (Actions und Seiten, Teil 4–6) und das E2E-Harness (Welle 7).

---

## Welle 7 — Die E2E-Naht (2 Tasks, FESTE Reihenfolge)

⚠️ **Diese zwei Tasks laufen NICHT parallel.** T60 importiert `e2e/helpers/lagerbuch.ts` aus T59;
landet die Konfiguration zuerst, ist der Baum unübersetzbar. Sie stehen trotzdem in **einer** Welle,
weil sie zusammen **eine** Zusage bilden und zwischen ihnen kein Gate sinnvoll ist.

⚠️ **Ab T60 ist `pnpm exec playwright test` fällig — und die tragende Zusage ist, dass die VIER
Bestandsmodule grün bleiben.** `webServer.env` ist ein **geteilter** Prozess: ein Tippfehler in
`SUITE_HOST_LAGERBUCH` bricht `validateHostConfig` und damit **jeden** E2E-Lauf der Suite.

---

### Task 59: `e2e/helpers/lagerbuch.ts` und `e2e/seed-lagerbuch.ts`

**Files:**
- Create: `iuk-suite/e2e/helpers/lagerbuch.ts`
- Create: `iuk-suite/e2e/seed-lagerbuch.ts`

**Interfaces:**
- Consumes: `_db/client.ts` (T12) — `getDb()`; `_db/schema.ts` (T7); `@/core/db` — `moduleDbPath`;
  `MODULE_MIGRATIONS` bzw. der Migrationspfad aus Teil 1, T8.
- Produces:
  ```ts
  // e2e/helpers/lagerbuch.ts
  export const LAGERBUCH_HOST: "lagerbuch.localtest.me";
  export const FREMDER_HOST: "feedback.localtest.me";
  export const LAGERBUCH_ADMIN_GRUPPE: "lagerbuch_nutzer";
  export const LAGERBUCH_PORT: 3100;
  export const E2E_TOKEN_HELFER: "111-111";
  export const E2E_TOKEN_CHECK: "222-222";
  export const E2E_TOKEN_GERAETE: "333-333";
  export const LAGERBUCH_ENV: Record<string, string>;
  export function lagerbuchUrl(pfad: string): string;
  export function fremdUrl(pfad: string): string;
  ```
  Konsumenten: `iuk-suite/playwright.config.ts` (T60) und **jede** `e2e/lagerbuch-*.spec.ts`
  (Teil 6).

**Warum EINE Konstantendatei** (Festlegung H9). §12.6, Punkt 2 verlangt
`devLogin(page, { host: "lagerbuch.localtest.me", groups: "<Wert von SUITE_ADMIN_GROUP_LAGERBUCH>" })`.
Stünde der Gruppenwert einmal in `webServer.env` und einmal im Spec, hätte man **zwei Literale** —
und der Fehlerfall ist nicht laut, sondern **gegenteilig**: ohne (oder mit falschem) `groups`
bezeugt der Lauf den **404** aus §11.5, Zustand 19 und sieht dabei aus wie ein bestandener Test.

⚠️ **Genau diese Klasse steht in `playwright.config.ts:2-6` schon ausgeschrieben** — dort für
`AV_MODUS_DATEI`: „Zwei Literale liefen auseinander, ohne dass ein Lauf rot würde — er wäre
rennabhängig grün." Dieselbe Bauform, dieselbe Datei.

**Warum der Seed selbst migriert** (Festlegung H10). Er läuft als eigener Schritt in der
`webServer.command`-Kette, also **vor** `next dev` — zu diesem Zeitpunkt hat **nichts** migriert.
Die Alt-Anwendung hatte denselben Fall und schreibt die Begründung über zwanzig Zeilen aus
(`lagerbuch/e2e/migrate-db.ts:1-20`): Next' Dev-Server wertet Modul-Singletons **je Route-Bundle**
neu aus, und die späteren Verbindungen sehen das Schema **nicht**, das die erste gerade migriert hat
— empirisch bestätigt, `sqlite_master` liefert Sekunden nach erfolgreicher Migration über eine frisch
geöffnete Verbindung **keine Tabellen**.

⚠️ **Der Seed geht über `getDb()` des Moduls, NIE über `getModuleDb` und NIE über
`seedAllModules()`** (§12.6, Punkt 4). Der zweite Grund wiegt schwerer als der erste:
`seedAllModules()` ist die einzige `core`-Stelle mit `getModuleDb(<key>, schema)`, und eine solche
Verbindung kennte **`lb_falte` nicht** (§5.13.2).

⚠️ **DREI Token-Codes, nicht einer.** `lagerbuch/e2e/migrate-db.ts:84-88` schreibt aus, warum ein
zweiter nötig war: sonst bucht der Check ins Journal des Helfer-Flows hinein, weil Playwright alle
Specs in **einem** Worker gegen **eine** SQLite-Datei fährt. Der dritte trennt den Geräte-Check vom
Artikel-Check.

⚠️ **Die Codes gehören ausdrücklich NICHT in `seedAllModules()`**: ein Seed-Zugangscode wäre in
einer Generalprobe ein **gültiger anonymer Schreibzugang**.

- [ ] **Schritt 1: `e2e/helpers/lagerbuch.ts` schreiben**

```ts
/**
 * DIE EINE QUELLE fuer Host, Admin-Gruppe, Port und die drei Token-Codes
 * (Festlegung H9, Spec §12.6 Punkt 2).
 *
 * ⚠️ WARUM NICHT ALS LITERALE. Stuende die Admin-Gruppe einmal in
 * `webServer.env` und einmal im Spec, haette man ZWEI Literale — und der
 * Fehlerfall ist nicht laut, sondern GEGENTEILIG: ohne (oder mit falschem)
 * `groups` bezeugt der Lauf den 404 aus §11.5, Zustand 19 und sieht dabei aus wie
 * ein bestandener Test.
 *
 * Dieselbe Klasse steht in `playwright.config.ts:2-6` schon ausgeschrieben (fuer
 * AV_MODUS_DATEI): „Zwei Literale liefen auseinander, ohne dass ein Lauf rot
 * wuerde — er waere rennabhaengig gruen."
 */

/** Der Modul-Host. Wildcard-DNS loest jeden `*.localtest.me` auf 127.0.0.1 auf. */
export const LAGERBUCH_HOST = "lagerbuch.localtest.me";

/**
 * Der ZWEITE erreichbare Suite-Host fuer die „fremder Host"-Zusagen (§3.8.3,
 * §12.2, §12.6 Punkt 3).
 *
 * ⚠️ ER EXISTIERT BEREITS: `playwright.config.ts:95` wartet heute schon auf
 * `http://feedback.localtest.me:3100/login`. Es wird KEIN dritter Host
 * eingefuehrt — und `feedback` ist zugleich die schaerfere Probe, weil
 * `moduleForHost` dort tatsaechlich ein Modul liefert (Festlegung H8).
 */
export const FREMDER_HOST = "feedback.localtest.me";

/**
 * Der Wert, den `SUITE_ADMIN_GROUP_LAGERBUCH` im E2E-Server traegt UND den
 * `devLogin(…, { groups })` mitgeben MUSS.
 *
 * ⚠️ Annahme A-T3-2: der produktive Wert ist eine Betreiberentscheidung und wird
 * beim Cutover als eine `.env`-Zeile gesetzt. Fuer E2E gilt der
 * Registry-Vorgabewert.
 */
export const LAGERBUCH_ADMIN_GRUPPE = "lagerbuch_nutzer";

/** Derselbe Port wie in `playwright.config.ts` (`next dev -p 3100`). */
export const LAGERBUCH_PORT = 3100;

/**
 * DREI aktive Token-Codes, nicht einer.
 *
 * ⚠️ `lagerbuch/e2e/migrate-db.ts:84-88` schreibt aus, warum ein zweiter noetig
 * war: sonst bucht der Check ins Journal des Helfer-Flows hinein — Playwright
 * faehrt alle Spec-Dateien in EINEM Worker gegen EINE SQLite-Datei. Der dritte
 * trennt den Geraete-Check vom Artikel-Check.
 */
export const E2E_TOKEN_HELFER = "111-111";
export const E2E_TOKEN_CHECK = "222-222";
export const E2E_TOKEN_GERAETE = "333-333";

/**
 * Die neun Lagerbuch-Zeilen fuer `webServer.env` (§10.3, „Werte fuer Dev und
 * E2E"). „Klein" ist hier KEIN zulaessiger Eintrag: die Kopplungen aus §10.5
 * greifen sonst, bevor ein Test laeuft.
 *
 * ⚠️ `SUITE_ACCESS_GROUP_LAGERBUCH` steht bewusst NICHT darunter — ein gesetzter
 * Wert bricht den Boot ab (§2.5, §10.5 Pruefung 6).
 */
export const LAGERBUCH_ENV: Record<string, string> = {
  // Der Host-Riegel braeuchte sie nicht (§2.6), aber die Boot-Pruefungen haengen
  // an `prodHostsFor(...).length > 0`, und der Zwei-Host-E2E ist sonst nicht
  // darstellbar.
  SUITE_HOST_LAGERBUCH: LAGERBUCH_HOST,
  SUITE_ADMIN_GROUP_LAGERBUCH: LAGERBUCH_ADMIN_GRUPPE,
  // ≠ leer, ≠ Alt-Default, ≠ AUTH_SECRET der E2E-Konfiguration ("test-secret"),
  // ≥ 32 Zeichen — alle vier Bedingungen aus Boot-Pruefung 4.
  LAGERBUCH_HELFER_SITZUNG_SECRET: "e2e-helfer-secret-nicht-produktiv-32z",
  // Fixtures rechnen gegen die Vorgaben.
  LAGERBUCH_VERFALL_ROT_TAGE: "31",
  LAGERBUCH_VERFALL_GELB_TAGE: "56",
  // 1:1; kuerzer bringt nichts, weil kein Test 12 h wartet.
  LAGERBUCH_HELFER_SITZUNG_STUNDEN: "12",
  // Der Sperrtest braucht eine erreichbare Grenze: bei 5 sind es sechs
  // Fehleingaben.
  LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "5",
  // ≥ ABSENDER — der Absendertest darf die Gesamtbremse nicht ausloesen und damit
  // die Ursache verwischen.
  LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "30",
  LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "300",
};

/** Absolute Per-Host-URL (§12.6, Punkt 3): `baseURL` zeigt auf den PORTAL-Host,
 *  und portal traegt `requiresAuth: true` — jeder relative Aufruf landete im
 *  Login. */
export function lagerbuchUrl(pfad: string): string {
  return `http://${LAGERBUCH_HOST}:${LAGERBUCH_PORT}${pfad}`;
}

/** Dieselbe URL auf dem FREMDEN Suite-Host — fuer die 404-Schleife aus §3.8.3. */
export function fremdUrl(pfad: string): string {
  return `http://${FREMDER_HOST}:${LAGERBUCH_PORT}${pfad}`;
}
```

- [ ] **Schritt 2: `e2e/seed-lagerbuch.ts` schreiben**

```ts
/**
 * Migriert und seedet `lagerbuch.db` als eigenstaendiger Node-Prozess — gerufen
 * EINMAL aus `webServer.command` in `playwright.config.ts`, VOR `next dev`.
 *
 * ⚠️ WARUM DAS NOETIG IST UND NICHT `src/instrumentation.ts` GENUEGT: Next'
 * Dev-Server uebersetzt Module ON DEMAND je Route-Bundle und wertet den
 * Modul-Singleton in `_db/client.ts` dabei MEHRFACH aus. Jede Auswertung oeffnet
 * eine frische better-sqlite3-Verbindung — und in `next dev` sehen diese spaeteren
 * Verbindungen das Schema NICHT, das die Instrumentation-Verbindung gerade
 * migriert hat (empirisch bestaetigt: `sqlite_master` ueber eine frisch
 * geoeffnete Verbindung auf denselben aufgeloesten Dateipfad liefert Sekunden
 * nach erfolgreicher, gecheckpointeter Migration KEINE Tabellen — alles im selben
 * OS-Prozess). Die Migration HIER, in einem separaten `tsx`-Prozess, der beendet
 * ist BEVOR `next dev` startet, garantiert das Schema dauerhaft auf der Platte.
 * Die Begruendung steht wortgleich in `lagerbuch/e2e/migrate-db.ts:1-20`.
 *
 * ⚠️ ES WIRD `getDb()` DES MODULS BENUTZT, nie `getModuleDb` und nie
 * `seedAllModules()` (§12.6, Punkt 4). Der zweite Grund wiegt schwerer:
 * `seedAllModules()` ist die einzige core-Stelle mit `getModuleDb(<key>, schema)`,
 * und eine solche Verbindung KENNTE `lb_falte` NICHT (§5.13.2).
 *
 * ⚠️ DIE TOKEN-CODES GEHOEREN AUSDRUECKLICH NICHT IN `seedAllModules()`: ein
 * Seed-Zugangscode waere in einer Generalprobe ein GUELTIGER ANONYMER
 * SCHREIBZUGANG.
 *
 * ⚠️ `ensureHandlager` STEHT HIER NICHT. Die Handlager-Zeile ist
 * Schema-Vervollstaendigung und liegt seit Teil 1 in `0003_handlager.sql` (§4.3,
 * §12.6 Punkt 4).
 *
 * Alles ist IDEMPOTENT (`onConflictDoNothing`) — `playwright.config.ts` loescht
 * `./.data/e2e` zwar vor jedem Lauf, aber ein Seed, der beim zweiten Aufruf
 * bricht, ist beim Debuggen unbrauchbar.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase, moduleDbPath } from "@/core/db";
import { getDb } from "@/app/m/lagerbuch/_db/client";
import {
  artikel, buchungen, chargen, geraete, lagerorte, o2Flaschen, sollPositionen, tokens, newId,
} from "@/app/m/lagerbuch/_db/schema";
import { HANDLAGER_ID } from "@/app/m/lagerbuch/_lib/konstanten";
import {
  E2E_TOKEN_HELFER, E2E_TOKEN_CHECK, E2E_TOKEN_GERAETE,
} from "./helpers/lagerbuch";

const JETZT = new Date();

/** Schema-frei migrieren — dieselbe Form wie `migrateAllModules()`
 *  (`core/bootstrap.ts:54-59`): eigene Verbindung, migrieren, schliessen. */
function migriere(): void {
  const sqlite = openModuleDatabase(moduleDbPath("lagerbuch"));
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/lagerbuch/_db/migrations" });
  sqlite.close();
}

/** Aktiver Token + Artikel mit Bestand > 0 fuer `e2e/lagerbuch-helfer.spec.ts`. */
function helferFixtures(): void {
  const db = getDb();
  db.insert(tokens).values({
    id: "e2e-token", code: E2E_TOKEN_HELFER, label: "E2E Helfer", aktiv: true,
    createdAt: JETZT, createdBy: "e2e", scopeLagerortId: null, zielTyp: null,
    zielId: null, lastUsedAt: null,
  }).onConflictDoNothing().run();

  db.insert(artikel).values({
    id: "e2e-artikel", name: "E2E Verbandpäckchen", einheit: "Stk.", fach: "A1",
    mindestbestand: 0, aktiv: true, createdAt: JETZT,
  }).onConflictDoNothing().run();

  db.insert(chargen).values({
    id: "e2e-charge", artikelId: "e2e-artikel", chargenNr: "E2E-001",
    verfall: "2030-01", createdAt: JETZT,
  }).onConflictDoNothing().run();

  if (!db.select().from(buchungen).where(eq(buchungen.chargeId, "e2e-charge")).get()) {
    db.insert(buchungen).values({
      id: newId(), ts: JETZT, typ: "zugang", artikelId: "e2e-artikel",
      chargeId: "e2e-charge", lagerortId: HANDLAGER_ID, menge: 10,
      quelleTyp: "system", quelleId: "e2e", referenz: null, kommentar: null,
    }).run();
  }
}

/** Artikel mit ABGELAUFENER Charge (Rest > 0) fuer die Verfallsliste + Aussondern. */
function verfallFixtures(): void {
  const db = getDb();
  db.insert(artikel).values({
    id: "e2e-verfall-artikel", name: "E2E Verfall NaCl", einheit: "Fl.", fach: "B2",
    mindestbestand: 0, aktiv: true, createdAt: JETZT,
  }).onConflictDoNothing().run();

  db.insert(chargen).values({
    id: "e2e-verfall-charge", artikelId: "e2e-verfall-artikel", chargenNr: "E2E-EXP",
    verfall: "2020-01", createdAt: JETZT,
  }).onConflictDoNothing().run();

  if (!db.select().from(buchungen).where(eq(buchungen.chargeId, "e2e-verfall-charge")).get()) {
    db.insert(buchungen).values({
      id: newId(), ts: JETZT, typ: "zugang", artikelId: "e2e-verfall-artikel",
      chargeId: "e2e-verfall-charge", lagerortId: HANDLAGER_ID, menge: 3,
      quelleTyp: "system", quelleId: "e2e", referenz: null, kommentar: null,
    }).run();
  }
}

/**
 * EIGENER Token + Fahrzeug fuer den Check-Spec.
 * ⚠️ Ohne den zweiten Code buchte der Check zusaetzlich mit `quelleId=111-111` in
 * das Journal des Helfer-Flows hinein — Playwright faehrt alle Specs in EINEM
 * Worker gegen EINE Datei (`lagerbuch/e2e/migrate-db.ts:84-88`).
 */
function checkFixtures(): void {
  const db = getDb();
  db.insert(tokens).values({
    id: "e2e-check-token", code: E2E_TOKEN_CHECK, label: "E2E Check", aktiv: true,
    createdAt: JETZT, createdBy: "e2e", scopeLagerortId: null, zielTyp: null,
    zielId: null, lastUsedAt: null,
  }).onConflictDoNothing().run();

  db.insert(lagerorte).values({
    id: "e2e-fahrzeug", name: "E2E RTW", typ: "fahrzeug", kennung: "MS-E2E-1",
    aktiv: true, templateId: null,
  }).onConflictDoNothing().run();

  db.insert(sollPositionen).values({
    id: "e2e-soll", fahrzeugId: "e2e-fahrzeug", fachLabel: "E2E Fach", sort: 0,
    artikelId: "e2e-artikel", soll: 3, templatePositionId: null,
    ueberschrieben: false, entfernt: false,
  }).onConflictDoNothing().run();

  // 300-bar-Flasche: der Fall, an dem der gestrichene `?? 200`-Rueckfall sichtbar
  // wird (§5.12). Sie steht bewusst am CHECK-Fahrzeug.
  db.insert(o2Flaschen).values({
    id: "e2e-o2", name: "E2E O2 300", lagerortId: "e2e-fahrzeug", groesseLiter: 10,
    nennfuelldruckBar: 300, aktiv: true, createdAt: JETZT,
  }).onConflictDoNothing().run();
}

/** EIGENES Fahrzeug (damit der Check-Spec KEINEN Geraete-Schritt bekommt) +
 *  Token + Soll + ein Objekt-Geraet am Standort. */
function geraeteFixtures(): void {
  const db = getDb();
  db.insert(tokens).values({
    id: "e2e-geraete-token", code: E2E_TOKEN_GERAETE, label: "E2E Geräte", aktiv: true,
    createdAt: JETZT, createdBy: "e2e", scopeLagerortId: null, zielTyp: null,
    zielId: null, lastUsedAt: null,
  }).onConflictDoNothing().run();

  db.insert(lagerorte).values({
    id: "e2e-geraete-fahrzeug", name: "E2E Geräte RTW", typ: "fahrzeug",
    kennung: "MS-E2E-2", aktiv: true, templateId: null,
  }).onConflictDoNothing().run();

  db.insert(sollPositionen).values({
    id: "e2e-geraete-soll", fahrzeugId: "e2e-geraete-fahrzeug", fachLabel: "E2E Fach",
    sort: 0, artikelId: "e2e-artikel", soll: 2, templatePositionId: null,
    ueberschrieben: false, entfernt: false,
  }).onConflictDoNothing().run();

  db.insert(geraete).values({
    id: "e2e-geraet", typ: "objekt", name: "E2E Spineboard",
    lagerortId: "e2e-geraete-fahrzeug", aktiv: true, createdAt: JETZT,
    barcode: null, anmerkung: null, mtkFaellig: null,
    beschreibung: null, ablaufdatum: null,
  }).onConflictDoNothing().run();
}

/** Artikel UNTER Mindestbestand — sonst ist die Bestellvorschlagsliste leer und
 *  der Spec liefe ohne Zusicherung durch (§12.3, Regel 5). */
function bestellFixtures(): void {
  getDb().insert(artikel).values({
    id: "e2e-bestellung-artikel", name: "E2E Bestellung NaCl", einheit: "Fl.",
    fach: "C3", mindestbestand: 5, aktiv: true, createdAt: JETZT,
  }).onConflictDoNothing().run();
}

migriere();
helferFixtures();
verfallFixtures();
checkFixtures();
geraeteFixtures();
bestellFixtures();
console.log(`[e2e] lagerbuch migriert + geseedet: ${moduleDbPath("lagerbuch")}`);
```

- [ ] **Schritt 3: Den Seed einmal von Hand fahren**

⚠️ **Vor T60, damit ein Fehler hier nicht als Konfigurationsfehler dort erscheint.**

```bash
rm -rf ./.data/e2e-probe
DATA_DIR=./.data/e2e-probe pnpm exec tsx e2e/seed-lagerbuch.ts
sqlite3 ./.data/e2e-probe/lagerbuch.db \
  "select count(*) as tokens from tokens; select code from tokens order by code;"
```

Erwartet: `3` und die drei Codes `111-111`, `222-222`, `333-333`. Danach

```bash
DATA_DIR=./.data/e2e-probe pnpm exec tsx e2e/seed-lagerbuch.ts   # zweiter Lauf
```

Erwartet: **kein Fehler**, weiterhin drei Token — der Nachweis der Idempotenz. Danach
`rm -rf ./.data/e2e-probe`.

- [ ] **Schritt 4: Commit**

```bash
pnpm typecheck && pnpm lint
git add e2e/helpers/lagerbuch.ts e2e/seed-lagerbuch.ts
git commit -m "feat(lagerbuch): e2e-Konstanten und Seed-Schritt

EINE Quelle fuer Host, Admin-Gruppe, Port und die drei Token-Codes (Festlegung
H9): stuende die Gruppe einmal in webServer.env und einmal im Spec, waeren es
zwei Literale — und der Fehlerfall ist gegenteilig, nicht laut: ohne groups
bezeugt der Lauf den 404 und sieht aus wie ein bestandener Test. Dieselbe Klasse
steht in playwright.config.ts:2-6 schon ausgeschrieben.

Der Seed MIGRIERT SELBST (Festlegung H10): er laeuft vor next dev, und next dev
wertet den Modul-Singleton je Route-Bundle neu aus — spaetere Verbindungen sehen
das Schema der Instrumentation-Verbindung nicht.

Er geht ueber getDb() des Moduls, nie ueber getModuleDb/seedAllModules: eine
solche Verbindung kennte lb_falte nicht (§5.13.2). Die Token-Codes gehoeren
ausdruecklich nicht in seedAllModules — sie waeren in einer Generalprobe ein
gueltiger anonymer Schreibzugang.

DREI Codes, nicht einer: sonst bucht der Check ins Journal des Helfer-Flows.

Zweimal gefahren (Idempotenz)."
```

---

### Task 60: `iuk-suite/playwright.config.ts` und `.env.example` (ERWEITERUNG)

**Files:**
- **Modify:** `iuk-suite/playwright.config.ts`
- **Modify:** `iuk-suite/.env.example` (angelegt/erweitert in Teil 2, T26)

**Interfaces:**
- Consumes: `e2e/helpers/lagerbuch.ts` (T59) — `LAGERBUCH_ENV`.
- Produces: einen E2E-Lauf, in dem `lagerbuch.localtest.me:3100` antwortet, das Modul migriert und
  geseedet ist und `feedback.localtest.me:3100` als **fremder** Host erreichbar bleibt.

⚠️ **`Edit`, niemals `Write`.** Die Datei trägt zwei `webServer`-Einträge mit über hundert Zeilen
begründender Kommentare (Fake-clamd, Timeouts, `reuseExistingServer`), und **jeder davon hat einen
Vorfall hinter sich**.

- [ ] **Schritt 1: Die `webServer.env` erweitern**

In `playwright.config.ts` den Import ergänzen:

```ts
import { AV_MODUS_DATEI } from "./e2e/helpers/avModus";
import { LAGERBUCH_ENV } from "./e2e/helpers/lagerbuch";
```

Und im **zweiten** `webServer`-Eintrag (dem `next dev`) die `env` erweitern — **ans Ende**, hinter
`FAKE_CLAMD_MODUS_DATEI`:

```ts
        FAKE_CLAMD_MODUS_DATEI: AV_MODUS_DATEI,
        /*
         * Die neun Lagerbuch-Zeilen kommen aus EINER Quelle (Festlegung H9,
         * Spec §12.6 Punkt 2): `devLogin(…, { groups })` in jedem
         * Verwaltungs-Spec liest DIESELBE Konstante wie
         * SUITE_ADMIN_GROUP_LAGERBUCH hier. Zwei Literale liefen auseinander,
         * ohne dass ein Lauf rot wuerde — er waere GEGENTEILIG gruen: ohne
         * passende Gruppe bezeugt der Spec den 404 aus §11.5, Zustand 19.
         *
         * ⚠️ SUITE_ACCESS_GROUP_LAGERBUCH steht bewusst NICHT darunter — ein
         * gesetzter Wert bricht den Boot ab (Spec §2.5, §10.5 Pruefung 6), und
         * zwar fuer die GANZE Suite.
         *
         * ⚠️ „Klein" ist bei den Zahlen kein zulaessiger Eintrag: die
         * Kopplungspruefungen aus §10.5 greifen sonst, bevor ein Test laeuft.
         */
        ...LAGERBUCH_ENV,
```

- [ ] **Schritt 2: Den Seed-Schritt in die `command`-Kette hängen**

```ts
      command:
        "rm -rf ./.data/e2e && pnpm exec tsx e2e/seed-lagerbuch.ts && next dev -p 3100",
```

⚠️ **Die Reihenfolge ist tragend, und zwar in beide Richtungen** (Festlegung H10, §12.6 Punkt 4):

- **Nach `rm -rf`**, sonst löscht das Aufräumen die gerade geseedete Datei.
- **Vor `next dev`**, weil Next' Dev-Server den Modul-Singleton je Route-Bundle neu auswertet und die
  späteren Verbindungen das Schema der ersten **nicht sehen**.

⚠️ **`DATA_DIR=./.data/e2e` steht bereits in `env`** — der Seed-Prozess erbt es aus derselben
`env`-Map, weil Playwright sie für den **ganzen** `command` setzt. Ohne das schriebe der Seed in
`./.data` und `next dev` läse aus `./.data/e2e`: **zwei Dateien, ein leerer Testlauf**, und nichts
wäre rot außer den Zusicherungen.

- [ ] **Schritt 3: `.env.example` erweitern**

An `iuk-suite/.env.example` **anfügen** (die neun Lagerbuch-Zeilen aus Teil 2, T26 stehen bereits
dort — hier kommt **nur** hinzu, was Teil 2 offengelassen hatte):

```bash
# ── lagerbuch: die drei reinen Deckel sind KONSTANTEN und stehen NICHT hier ────
# JOURNAL_GRENZE (100), CHECK_GRENZE (50) und BZ_LOGBUCH_GRENZE (100) liegen in
# src/app/m/lagerbuch/_lib/grenzen.ts. Sie sind bewusst nicht konfigurierbar:
# ein Regler bei 5000 liesse die Journalseite bei realer Datenmenge stehen, und
# better-sqlite3 ist SYNCHRON — die Seite blockierte dabei die ganze Suite
# (Spec §10.3, Falle 10).
#
# LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE existiert NICHT. Entscheidung 22 ist offen;
# bis zur Betreiberantwort gilt Annahme A31: scripts/backup.sh der Suite erfasst
# lagerbuch.db ueber den vorhandenen Glob, der Modul-Job wandert nicht mit
# (Spec §10.7).
#
# ⚠️ SUITE_ACCESS_GROUP_LAGERBUCH DARF NICHT GESETZT WERDEN. Der Wert waere still
# wirkungslos (lagerbuch traegt requiresAuth: false, canAccess liest
# requiredGroups nie) — deshalb bricht der Boot ab, wenn er gesetzt ist.
# Verwaltungszugang steuert SUITE_ADMIN_GROUP_LAGERBUCH.
```

- [ ] **Schritt 4: Den vollen E2E-Lauf fahren — die VIER Bestandsmodule müssen grün bleiben**

```bash
pnpm exec playwright test
```

⚠️ **Das ist die tragende Zusage dieses Tasks, nicht die neue Konfiguration.** `webServer.env` ist
ein **geteilter** Prozess: die neun Lagerbuch-Zeilen laufen im selben `next dev` wie portal, qr,
feedback und files. Ein Tippfehler in `SUITE_HOST_LAGERBUCH` bricht `validateHostConfig` und damit
**jeden** E2E-Lauf der Suite — nicht nur den von lagerbuch.

Erwartet: **alle vorhandenen Specs grün**, und in der Serverausgabe die Seed-Zeile
`[e2e] lagerbuch migriert + geseedet: …`.

- [ ] **Schritt 5: Die Gegenprobe — ein gesetztes `SUITE_ACCESS_GROUP_LAGERBUCH` muss den Boot anhalten**

⚠️ **Einmal fahren, dann zurücknehmen.** Ergänze in `LAGERBUCH_ENV` (T59, `e2e/helpers/lagerbuch.ts`)
zeitweilig `SUITE_ACCESS_GROUP_LAGERBUCH: "irgendwer"` und starte:

```bash
pnpm exec playwright test e2e/portal.spec.ts
```

Erwartet: der `webServer` kommt **nicht** hoch, und die Meldung nennt
`SUITE_ACCESS_GROUP_LAGERBUCH` und `requiresAuth`. **Das ist der einzige Lauf, der belegt, dass
Boot-Prüfung 6 wirklich greift** — `boot.test.ts` prüft die Liste, nicht den Abbruch.
Danach die Zeile wieder entfernen und `pnpm exec playwright test` erneut grün fahren.

- [ ] **Schritt 6: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
git add playwright.config.ts .env.example
git commit -m "feat(lagerbuch): E2E-Konfiguration — neun env-Zeilen, Seed-Schritt, zweiter Host

Die neun Zeilen kommen aus EINER Quelle (e2e/helpers/lagerbuch.ts): devLogin(...,
{groups}) liest dieselbe Konstante wie SUITE_ADMIN_GROUP_LAGERBUCH. Zwei Literale
liefen auseinander, und der Fehlerfall ist gegenteilig gruen — ohne passende
Gruppe bezeugt der Spec den 404.

Der Seed haengt zwischen 'rm -rf ./.data/e2e' und 'next dev', und die Reihenfolge
ist in BEIDE Richtungen tragend (Festlegung H10).

SUITE_ACCESS_GROUP_LAGERBUCH steht bewusst NICHT in der env — ein gesetzter Wert
bricht den Boot ab, und zwar fuer die GANZE Suite. Die Gegenprobe ist einmal
gefahren worden.

Ein zweiter Host wird NICHT eingefuehrt: playwright.config.ts:95 wartet schon auf
feedback.localtest.me:3100, und feedback ist die schaerfere Probe (Festlegung H8).

pnpm exec playwright test ist gruen — die vier Bestandsmodule teilen sich diesen
Serverprozess."
```

---

### Gate — Ende Welle 7

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
pnpm exec playwright test
```

---

## Welle 8 — Abnahme (1 Task)

---

### Task 61: Die Abnahme von Teil 3 — Boot, Zonen, Spec-Abdeckung

**Files:**
- — (nur Ausführung und Protokoll; keine Datei wird geändert)

**Interfaces:**
- Consumes: alles aus T28–T60.
- Produces: die Aussage „§5, §10 und §12.6 sind eingelöst", ohne die Teil 4 nicht beginnen sollte.

**Abnahme, nicht TDD.** Dieser Task prüft **zusammengesetztes** Verhalten, das zum Zeitpunkt seiner
Entstehung schon gebaut ist. Er ist von Anfang an grün, und das ist **kein** Mangel. Was er fängt,
sind **drei** Mutationen, gegen die jeder einzelne Test blind ist:

| Mutation | Warum kein Test sie fängt | Fängt sie hier |
|---|---|---|
| Der Haken in `assertHostConfig()` wird entfernt | `boot.test.ts` prüft die **Liste**, nicht den Abbruch; der Quelltext-Scan prüft den **Aufruf**, nicht die Wirkung | Schritt 1 |
| Eine Zeitrechnung hängt doch an der Prozess-`TZ` | Jeder Einzeltest läuft unter **einer** Zone und ist dort grün | Schritt 2 |
| Ein Kapitel der Spec hat keinen Umsetzer | Kein Test kennt die Spec | Schritt 4 |

- [ ] **Schritt 1: Der echte Startlauf mit kaputter Konfiguration**

⚠️ **Der einzige Nachweis, dass die Boot-Kette wirklich schließt.** Vier Läufe, jeder mit **einem**
Defekt:

```bash
# (a) ROT > GELB
SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me SUITE_ADMIN_GROUP_LAGERBUCH=lagerbuch_nutzer \
LAGERBUCH_HELFER_SITZUNG_SECRET=e2e-helfer-secret-nicht-produktiv-32z \
LAGERBUCH_VERFALL_ROT_TAGE=90 LAGERBUCH_VERFALL_GELB_TAGE=56 \
  pnpm exec tsx -e 'import("./src/core/bootstrap.ts").then(m => m.assertHostConfig())
    .then(() => console.log("FEHLER: kein Abbruch")).catch(e => console.log("OK:", e.message))'

# (b) Geheimnis fehlt
SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me SUITE_ADMIN_GROUP_LAGERBUCH=lagerbuch_nutzer \
  pnpm exec tsx -e 'import("./src/core/bootstrap.ts").then(m => m.assertHostConfig())
    .then(() => console.log("FEHLER: kein Abbruch")).catch(e => console.log("OK:", e.message))'

# (c) Admin-Gruppe fehlt
SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me \
LAGERBUCH_HELFER_SITZUNG_SECRET=e2e-helfer-secret-nicht-produktiv-32z \
  pnpm exec tsx -e 'import("./src/core/bootstrap.ts").then(m => m.assertHostConfig())
    .then(() => console.log("FEHLER: kein Abbruch")).catch(e => console.log("OK:", e.message))'

# (d) ALLES richtig, KEIN Prod-Host  →  MUSS DURCHLAUFEN
env -u SUITE_HOST_LAGERBUCH -u LAGERBUCH_HELFER_SITZUNG_SECRET \
    -u SUITE_ADMIN_GROUP_LAGERBUCH \
  pnpm exec tsx -e 'import("./src/core/bootstrap.ts").then(m => m.assertHostConfig())
    .then(() => console.log("OK: kein Abbruch ohne Prod-Host"))
    .catch(e => console.log("FEHLER:", e.message))'
```

Erwartet: (a) nennt `Gelb-Zweig`, (b) nennt `LAGERBUCH_HELFER_SITZUNG_SECRET`, (c) nennt `404`,
(d) läuft **durch**. ⚠️ **(d) ist der wichtigste der vier** — ohne ihn hielte dieses Modul jeden
unbeteiligten Deploy an.

**Protokolliere alle vier Ausgaben im Commit-Text bzw. im Abnahmeprotokoll.**

- [ ] **Schritt 2: Der Zonen-Lauf über das ganze Modul, dreimal**

```bash
TZ=Europe/Berlin pnpm vitest run src/app/m/lagerbuch/
TZ=UTC            pnpm vitest run src/app/m/lagerbuch/
TZ=Pacific/Kiritimati pnpm vitest run src/app/m/lagerbuch/
```

Erwartet: **dreimal grün, mit identischer Fallzahl.** ⚠️ Geht einer rot, hängt eine Erwartung an
lokalen Komponenten. **Die Abhilfe ist die Erwartung, nicht die Konfiguration** — ein
`env: { TZ }`-Block in `iuk-suite/vitest.config.ts` änderte die Testsemantik der **vier laufenden
Module** (§12.6, Punkt 1), und `_lib/zeit.test.ts` (Teil 1) verstellt `TZ` **absichtlich**.

- [ ] **Schritt 3: Die vier Quelltext-Zusicherungen des Moduls einzeln nachfahren**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts     # Teil 2, T21
pnpm vitest run src/app/m/lagerbuch/_lib/format.test.ts      # der new-Date-Scan (T39)
pnpm vitest run src/app/m/lagerbuch/_lib/marke.test.ts       # kein process.env (T33)
pnpm vitest run src/core/bootstrap.test.ts                   # der Boot-Haken (T38)
pnpm vitest run src/core/shell/icons.test.ts                 # Falle 7, repo-weit
```

Erwartet: alle grün. ⚠️ **`_actions/guards.test.ts` läuft mit und toleriert weiterhin das leere
`_actions/`** — es wird in Teil 3 **nicht** angefasst.

- [ ] **Schritt 4: Die Spec-Abdeckung Unterabschnitt für Unterabschnitt abhaken**

Diese Tabelle wird **abgehakt, nicht behauptet.** Zu jedem Unterabschnitt der drei Kapitel steht,
welcher Task ihn umsetzt.

| Spec | Umgesetzt in | ☐ |
|---|---|---|
| §5.1 Wo die Fachlogik liegt | T28–T44 (Verzeichnisbaum), T39 (Falle 6/7), T21 (Teil 2, Scan) | ☐ |
| §5.2.1 Die Rechnung + normative Bezugsgrößen | T29, T44, T45, T47, T48, T50 | ☐ |
| §5.2.2 Invarianten I1–I5 | I1 Teil 1/T11; I2 T30+T54; I3 T57; I4 T58; **I5 → Teil 5** (H3) | ☐ |
| §5.2.3 Kosten | A-T3-3 (§0), T44 (die Aggregate) | ☐ |
| §5.2.4 Entscheidung 7 (b) | T44 inkl. `_db/aggregate.test.ts` | ☐ |
| §5.3.1 FEFO-Determinismus | T30, T54 (`_db/fefo.test.ts`) | ☐ |
| §5.3.2 Pseudo-Charge, drei Namen | Teil 1/T4 (`istOhneVerfall`), T58 (Anlegen), T47 (Ausblenden) | ☐ |
| §5.3.3 Die geratene Charge | T58 (Kommentar + Test), T47/T55 (die Kompensation) | ☐ |
| §5.4 Bestellvorschlag | T31, T50 | ☐ |
| §5.5 Bestellt-Markierung | T50 (`bestelltSeit`, `wareOffenbarDa`), T44 (`nichtBestellt`) | ☐ |
| §5.6.1 Die Ampel | T28, T39 (`chargeText`) | ☐ |
| §5.6.2 Zwei Verfallsquellen | T47, T55 | ☐ |
| §5.6.3 Die Meldung im Check | T49 (Ampel gegen heute) — der **Schreib**schritt in Teil 4 | ☐ |
| §5.6.4 Ein Monats-Regex | Teil 1/T4, T55 | ☐ |
| §5.7.1 Soll/Ist, Grabsteine | T48 | ☐ |
| §5.7.2 Vorlagen-Sync | T56; die zwei **Nebenwege** → Teil 5 (§6) | ☐ |
| §5.8 Der Fahrzeug-Check | **Teil 4** (H3) — die Kerne T54, T57, T58, T55 stehen | ☐ |
| §5.8.1 Entscheidung 1 + Kosten | T43 (Vorbelegungen), T52 (`ausCheck`) | ☐ |
| §5.8.2 Entscheidung 2 (`zustand`-Enum) | T40 (tolerantes Lesen); der **Zod-Enum** → Teil 4 (H3) | ☐ |
| §5.8.3 Die zwei Ergebnisformate | T37, T40, T49 | ☐ |
| §5.8.4 Fehlmengen | T40 | ☐ |
| §5.9 Inventur | **Teil 5** (H3) — die Kerne T54, T58 stehen | ☐ |
| §5.10 Geräte | T35, T39 (`geraetFaelligChip`), T53 | ☐ |
| §5.11 BZ-Geräte + `refSnapshot` | T36, T51 | ☐ |
| §5.12 Sauerstoff, `?? 200` fällt | T34, T40, T49, T52 | ☐ |
| §5.13.1 Zwei Such-Regime | T41 (Regime A, Artikel); die fünf übrigen Listen → Teil 5 (§6.9.4) | ☐ |
| §5.13.2 Die Ungleichheit | **Teil 1/T12 + T5** (gebaut); T46 (benutzt, `_db/suche.test.ts`) | ☐ |
| §5.13.3 Was beim antd-Umbau verlorengeht | **Teil 5** (§6.9.4, §6.9.5, §6.4.3) — T41 hält die Export-Kopplung | ☐ |
| §5.14.1 URL-State-Vertrag | **Teil 5** (`_ui/useUrlFilter`) — die Parameternamen stehen in §6 | ☐ |
| §5.14.2 Die Prüf-Asymmetrie | T39 (`zeitraumAus`) | ☐ |
| §5.14.3 Die drei Deckel | T32 (Konstanten), T46/T49/T51 (`mehrVorhanden`) | ☐ |
| §5.14.4 Die Sortierung | T45, T46, T49, T51, T52 (id-Tiebreaker überall) | ☐ |
| §5.15 Regeln, die nur im Client stehen | T41, T43, T52; Punkt 9 (die drei `.max()`) → Teil 4/5 (H3) | ☐ |
| §5.16 Zeitzone | T28, T35, T39 (Scan), Schritt 2 dieses Tasks | ☐ |
| §5.17 Ampel und Farbe | T39 (`ampelTon`); `_lib/ampel.ts` → **Teil 5** (H5) | ☐ |
| §5.18 Fehlerzustände | die vier fachlichen Zeilen: T40/T49 (O₂), T36/T51 (BZ), T35/T53 (Gerät); die **Tabelle** §11.5 → Teil 6 | ☐ |
| §5.19.1 Unit-Tests | T28–T31, T34–T37, T39–T43 | ☐ |
| §5.19.2 Tests gegen echte SQLite | T44, T46, T54, T56 + die zehn Lesepfad-Tests (H7) | ☐ |
| §5.19.3 Alt-Defekt → Test | die Mutationsproben in T29, T30, T40, T44, T46, T47, T48, T49, T54, T57 | ☐ |
| §5.19.4 Was nur Playwright belegt | **Teil 6** auf dem Harness aus T59/T60 | ☐ |
| §5.19.5 Was kein Gate findet | T44 (Bezugsgröße), T46 (Sekunden), T39 (Falle 6), T61 Schritt 1 | ☐ |
| §5.20 Verworfene Alternativen | als Kommentare in T30, T44, T46 | ☐ |
| §5.21 Was §5 abgibt | §6 dieses Plans (Abgabetabelle) | ☐ |
| §10.1 Einheit im Namen | T28 (H2), T32 (Boot-Prüfung 2) | ☐ |
| §10.2 Die achtzehn Alt-Felder | T33 (`marke.ts`), T31 (`BESTELL_FAKTOR`), T28/§5.16 (`config.tz`) | ☐ |
| §10.3 Alle Namen mit Einheit | Teil 2/T15 (die sechs Env-Zahlen), T32 (die drei Deckel), T35/T36 (die vier Warnfenster), T59 (Dev/E2E-Werte) | ☐ |
| §10.4 Absenderschlüssel | **Teil 2** (T16, T24) — hier nur die Zahlen | ☐ |
| §10.5 Boot-Prüfungen 1–6 | T32 (1–4), T38 (5–6 + der Haken) | ☐ |
| §10.6 Zwei begründete Abweichungen | T32 (Prüfung 4 gegen `AUTH_SECRET`), §6 (Runbook) | ☐ |
| §10.7 Die Zahl mit Vorbehalt | A-T3-1 (§0), T38 (kein `startBackgroundWork`-Eintrag) | ☐ |
| §10.8 Bauform von `grenzen.ts` | T32 (alle drei Eigenschaften) | ☐ |
| §12.6 Punkt 1 (kein `env`-Block) | §2, T61 Schritt 2 | ☐ |
| §12.6 Punkt 2 (`devLogin` mit `groups`) | T59 (H9), T60 | ☐ |
| §12.6 Punkt 3 (absolute Per-Host-URLs, zweiter Host) | T59 (`lagerbuchUrl`, `fremdUrl`, H8) | ☐ |
| §12.6 Punkt 4 (Seed als eigener Schritt) | T59, T60 (H10) | ☐ |
| §12.6 Punkt 5 (kein Prod-Artefakt) | unverändert — der `webServer` bleibt `next dev`; der **`e.message`-Scan** → Teil 6 (§11.2) | ☐ |

- [ ] **Schritt 5: Die Typkonsistenz gegen Teil 1 und Teil 2 prüfen**

⚠️ **Der Scan muss KOMMENTARZEILEN AUSNEHMEN, und das ist keine Bequemlichkeit.** Mehrere Dateien
dieses Plans **nennen die Alt-Namen absichtlich** — `lesepfade/bestand.ts` schreibt aus, dass das
Feld früher `offeneBestellungen` hieß, `format.ts` erklärt, warum die Funktion **nicht** `chipTone`
heißt, `vorschlag.ts` nennt `BESTELL_FAKTOR` als gestrichen. Genau diese Sätze sind der Grund, warum
die Umbenennungen keine Bitte sind. Ein Scan, der sie mitzählt, wird abgeschaltet statt repariert —
dieselbe Lehre wie `ohneKommentare()` in `_lib/bauform.test.ts` (Teil 2, T21).

```bash
grep -rn "chipTone\|offeneBestellungen\|WARN_TAGE_KRITISCH\|warnTageKritisch\|parseDatumGrenze\|config\.tz\|BESTELL_FAKTOR" \
  src/app/m/lagerbuch/ \
  | grep -vE "^[^:]+:[0-9]+: *(\*|//|/\*)" \
  || echo "OK: keine Alt-Namen im CODE"
```

Erwartet: `OK: keine Alt-Namen im CODE`. ⚠️ **Jeder Treffer ist ein halb portierter Name** — und die
gefährlichsten sind `warnTageKritisch` (H2) und `offeneBestellungen` (§5.5), weil sie
**typkorrekt** wären.

```bash
grep -rn "?? 200" src/app/m/lagerbuch/ \
  | grep -vE "^[^:]+:[0-9]+: *(\*|//|/\*)" \
  || echo "OK: kein geratener Nennfuelldruck"
```

Erwartet: `OK: kein geratener Nennfuelldruck` (§5.12). ⚠️ Auch hier greift die Kommentar-Ausnahme:
`domain/o2.ts`, `domain/check.ts` und `lesepfade/checks.ts` schreiben ausdrücklich hin, dass es
**keinen** `?? 200`-Rückfall gibt.

- [ ] **Schritt 6: Der Platzhalter-Scan über die neuen Dateien**

```bash
grep -rnE "TODO|TBD|FIXME|XXX" src/app/m/lagerbuch/_lib src/app/m/lagerbuch/_db e2e/seed-lagerbuch.ts \
  || echo "OK: keine Platzhalter"
```

Erwartet: `OK: keine Platzhalter`.

- [ ] **Schritt 7: Alle Gates ein letztes Mal, und der Commit des Protokolls**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build && pnpm exec playwright test
```

```bash
git commit --allow-empty -m "chore(lagerbuch): Abnahme Teil 3 — Fachlogik und Grenzen

Vier Boot-Laeufe protokolliert: ROT>GELB nennt den Gelb-Zweig, fehlendes
Geheimnis nennt die Variable, fehlende Admin-Gruppe nennt den 404 — und OHNE
Prod-Host laeuft assertHostConfig DURCH. Der vierte ist der wichtigste: ohne ihn
hielte dieses Modul jeden unbeteiligten Deploy an.

Das Modul ist unter Europe/Berlin, UTC und Pacific/Kiritimati gefahren worden,
dreimal mit identischer Fallzahl. Ein env-Block in vitest.config.ts wird
ausdruecklich NICHT eingezogen (§12.6, Punkt 1).

Spec-Abdeckung §5, §10 und §12.6 Unterabschnitt fuer Unterabschnitt abgehakt.
Typkonsistenz-Scan gegen die Alt-Namen (chipTone, offeneBestellungen,
warnTageKritisch, parseDatumGrenze, config.tz, BESTELL_FAKTOR) leer, und
'?? 200' kommt im Modul nicht vor."
```

---

## 5. Abschluss-Abnahme von Teil 3

Bevor Teil 4 beginnt, muss **alles** hiervon zutreffen:

- [ ] Alle 34 Tasks (T28–T61) sind eingecheckt. **T38 hat ZWEI Commits**, und beide liegen im Baum —
      zwischen ihnen sind alle sechs Boot-Prüfungen gebaut und **ungerufen**.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm vitest run`, `pnpm build` und **`pnpm exec playwright
      test`** sind grün. ⚠️ Der Playwright-Lauf ist ab T60 **Pflicht**: `webServer.env` ist ein
      geteilter Prozess, und ein Tippfehler in `SUITE_HOST_LAGERBUCH` bricht **jeden** E2E-Lauf der
      Suite.
- [ ] `src/core/bootstrap.test.ts` prüft, dass `lagerbuchBootFehler` als `...(await
      lagerbuchBootFehler())` im `errors`-Array steht — und die Gegenprobe (Haken entfernen → roter
      Test) ist **einmal gefahren** worden.
- [ ] Die **vier** Boot-Läufe aus T61, Schritt 1 sind protokolliert, **einschließlich (d)**
      („ohne Prod-Host läuft `assertHostConfig` durch").
- [ ] Das Modul ist unter **drei** Zeitzonen gefahren worden, mit identischer Fallzahl.
- [ ] Die **zehn** Mutationsproben sind gefahren worden: Lagerort-Prädikat (T29 **und** T44),
      FEFO-Zweitsortierung (T30 **und** T54 — der Unit-Test und der DB-Test fangen **verschiedene**
      Fälle), `?? 200` (T40 **und** T49), `lb_falte` → rohe Spalte (T46), `GRENZE + 1` → `GRENZE`
      (T46), Verfallsliste ohne Lagerortbezug (T47), Soll je Position statt je Artikel (T48),
      Ziel-Leg aus `menge` (T57).
- [ ] Der `new Date(y, m, …)`-Scan (T39) ist **einmal über eine Wegwerfdatei rot gesehen** worden.
- [ ] `e2e/seed-lagerbuch.ts` ist **zweimal hintereinander** gefahren worden (Idempotenz) und legt
      **drei** Token-Codes an.
- [ ] Die Gegenprobe aus T60, Schritt 5 ist gefahren: ein gesetztes `SUITE_ACCESS_GROUP_LAGERBUCH`
      hält den `webServer` an, und die Meldung nennt `requiresAuth`.
- [ ] Die Spec-Abdeckungstabelle (T61, Schritt 4) ist vollständig abgehakt — **kein Kästchen leer,
      keine Zeile gestrichen**.
- [ ] Die beiden Typkonsistenz-Scans sind leer (`chipTone`/`offeneBestellungen`/`warnTageKritisch`/
      `parseDatumGrenze`/`config.tz`/`BESTELL_FAKTOR` und `?? 200`).
- [ ] `_actions/guards.test.ts` (Teil 2) ist **nicht angefasst** worden und toleriert weiterhin das
      leere `_actions/`.

---

## 6. Was dieser Teil ausdrücklich NICHT liefert und wo es liegt

Damit Teil 4 nichts für erledigt hält — und damit die Abwesenheit jedes Punktes als **Entscheidung**
lesbar ist statt als Versehen.

| Fehlt | Wo es entsteht |
|---|---|
| **`checkAbschluss` (§5.8) — die sechs Schritte in EINER Transaktion** | **Teil 4** (§7.9) — die Kerne stehen (T54 `fefoAbbuchung`, T57 `umlagerung`, T58 `korrekturAufLagerort`, T55 `setzeVerfall`, T47 `verfallFuerLagerort`), aber **die Reihenfolge ist tragend**: erst Abgleich, dann Nachfüllen. Umgekehrt würde die Nachfüllung vom Abgleich wieder herauskorrigiert. ⚠️ **Auflagen mit Werten:** `ist` bekommt `.max(99_999)`, `druckBar` `.max(9_999)`, `zustand` wird `z.enum(ZUSTAENDE).optional()` — und `nachfuellMenge` bekommt **keinen** Deckel (serverseitig ohnehin geklemmt). Dazu `_db/check-abschluss.test.ts`: **die entstandenen Buchungen**, nicht nur der Rückgabewert |
| **`inventurKorrektur` (§5.9)** | **Teil 5** (§6) — ⚠️ **die Absendekonvention ist der Check-Konvention ENTGEGENGESETZT, und das ist richtig so:** `InventurForm.tsx:24-25` sendet **nur** die angefassten Positionen, mit ausgeschriebener Lost-Update-Begründung. Wer die beiden Formulare „vereinheitlicht", baut je nach Richtung einen Lost-Update-Kanal oder einen Check, der nichts bucht. Auflage: `ist` bekommt `.max(99_999)`. Dazu `_db/inventur.test.ts` |
| **I5 — die Chargenzugehörigkeit beim Zugang** | **Teil 5** (`_actions/buchung.ts`) — die Prüfung aus `lagerbuch/src/actions/buchung.ts:33-36` **1:1**. Sie ist der **einzige** Schutz gegen einen manipulierten Request, und der eigene Client erzeugt die Eingabe nie; ohne sie entsteht „phantom, un-withdrawable Bestand on the target article" |
| **Die zwei Zugehörigkeitsprüfungen beim Verfall** | **Teil 4** (`check.ts:153-155`) und **Teil 5** (`lagerort-verfall.ts:30-36`): der Artikel muss an diesem Lagerort **im Soll** stehen. `_lib/schreibpfade/lagerortVerfall.ts` prüft das bewusst **nicht** — es kennt kein Soll |
| **Die zwei Vorlagen-Nebenwege** (§5.7.2) | **Teil 5** (`_actions/templates.ts`) — **Lösen** (`:164-174`): Grabsteine werden **verworfen**, materialisierte Zeilen bleiben als individuelle Bestückung, `lagerorte.templateId` wird genullt; das ist auch der Weg, den `deleteTemplate` für jedes verknüpfte Fahrzeug geht. **Vorlage aus Fahrzeug** (`:180-204`): kopiert die nicht entfernten Zeilen und **adoptiert** die vorhandenen Fahrzeug-Zeilen **paarweise in Anlagereihenfolge**. ⚠️ **Die Paarung über den Index ist fragil, aber konstruktiv richtig** (dieselbe Transaktion, dieselbe Quelle) — **dieser Zusammenhang gehört als Kommentar mit, sonst wirkt `for (let i = 0; …)` wie ein Versehen und wird „repariert"** |
| **`_lib/ampel.ts`** (die Palette) | **Teil 5** (§6.6.2) — ⚠️ **Auflage aus H5:** sie bildet exakt die vier Tonnamen aus `format.ts#ampelTon` ab (`"rot" \| "gelb" \| "ok" \| "grau"`), und `"grau"` ist **kein** Ampelwert — er darf nie als grün dargestellt werden. Ampel-Rot ist ein **eigener** Hexwert (`#8c0d16`), **nicht** `colorError`/`colorPrimary` (`#c8000f`) |
| **`_lib/bestandExportSpalten.ts`** und der Excel-Export | **Teil 6** (§9.4) — ⚠️ **Auflage aus T41:** der Export ruft `artikelFiltern` mit **demselben** Filterzustand wie die Tabelle, nie `bestandExportZeilen(alleZeilen)`. Sonst exportiert der Knopf **still** wieder alles |
| **`_ui/useUrlFilter`** und der `committedQ`-Tanz | **Teil 5** (§5.14.1, §6.3.4) — ⚠️ die Datei liegt in `_ui/`, **nicht** in `_lib/`: sie ruft `useRouter`/`usePathname` und **muss** ein Client-Modul sein. Die Parameternamen `q`, `typ`, `von`, `bis`, `fz` sind **wörtlich** zu übernehmen; `router.replace`, nicht `push` |
| **Die fünf übrigen Listen-Suchfeldmengen** und die Sortiervorgaben | **Teil 5** (§6.9.4) — T41 hebt **nur** das Artikel-Prädikat. Die anderen fünf (`GeraeteListe`, `BzListe`, `SauerstoffListe`, `FahrzeugeListe`, `TokenTable`) sind **je verschieden**, und das ist Bedienpraxis, keine Nachlässigkeit |
| **`tokenListe`** | **Teil 6** (§8.3) — Tokens sind Kapitel 8. Entscheidung 8-F (Hard-Delete entfällt, nur noch sperren) fällt dort, und ein hier gebauter Lesepfad müsste dort sofort angefasst werden (Festlegung H4) |
| **Der Löschpfad** (§5.21, Entscheidung 8) | **Teil 5** (`_actions/loeschen.ts`) — ⚠️ **fachlich HIER entschieden, gebaut dort:** blockierende Bindungen sind `buchungen`, `chargen`, `soll_positionen`, **`template_positionen.artikelId`** und **`tokens.zielId`**; `tokens.scopeLagerortId` wird **nicht** gezählt (die Spalte bleibt aber im Schema, §4.12). `loescheElement` läuft ab jetzt **in einer Transaktion** — heute klammert es seine zwei Schritte nicht, im Gegensatz zu jedem anderen mehrschrittigen Schreibpfad |
| **Die 24 Verwaltungsseiten, `_ui/*`, `_lib/nav.ts`, die `.modulnav`-Reparatur** | Teil 5 (§6) — ⚠️ **es gelten F2 und F3 aus Teil 1:** die Route-Groups heißen `(arbeit)` und `(druck)`, es gibt **kein** `verwaltung/layout.tsx`, und **beide** Group-Layouts rufen `requireLagerbuchHost` **und** `requireLagerbuchAdmin` |
| **Gate, `/t`, `/a`, `/g`, `/helfer`, Fahrzeug-Check, Barcode-Scanner, `_lib/actionTypen.ts`** | Teil 4 (§7) — ⚠️ **die Lesepfade dieses Plans sind bis dahin gebaut und größtenteils ungerufen.** Das ist gewollt, aber es heißt auch: **kein Test dieses Plans belegt, dass sie am richtigen Ort gerufen werden.** Das belegen erst die Abrufe aus §12.4 (Teil 4–6) |
| **Etiketten, Druckansicht, CSV/Excel/Zwischenablage, `error.tsx`, die sechs E2E-Dateien, die ZÄHLUNG in `_actions/guards.test.ts`** | Teil 6 (§8, §9, §11, §12) — das **Harness** (Seed, Konstanten, `webServer.env`, zweiter Host) steht seit T59/T60 |
| **Die 40 Fehlerzustände aus §11.5** | über Teil 4, 5 und 6 verteilt — §5.18 nennt **vier** fachliche davon, und die sind hier eingelöst (O₂ „nicht bewertbar", BZ „nie geprüft", Gerät „kein Datum", „Entnahme gebucht: 0" → Teil 4) |
| **Der `e.message`-Quelltext-Scan** („keine Fehlermeldungs-Anzeige unter `m/lagerbuch`") | **Teil 6** (§11.2, §12.6 Punkt 5) — ⚠️ **der blinde Fleck von Falle 66:** dass ein geworfener Fehler in Produktion als **englischer** Satz ankommt und in Entwicklung als deutscher Text, sieht der einzige Prüflauf, der es sehen könnte, **strukturell im falschen Modus** (`next dev`). Die Umstellung auf Rückgabewerte ist deshalb keine Testfrage, sondern eine **Bauform** |
| **`TZ=Europe/Berlin` für den Container** | **Spec 2** — suiteweiter Schritt mit eigener Prüfung gegen vier laufende Module (§1.5). ⚠️ **Für lagerbuch selbst nicht tragend**: die Zone steht als Modulkonstante im Code |
| **Der Cutover** (Import, Runbook, `users`-Bereinigung) | **Spec 2** (§1.3) |

---

## 7. Was dieser Teil dem Runbook schuldet

Keine dieser Angaben steht im Repo, und keine blockiert den Bau. **Die Einträge aus §3.11 stehen
vollständig in Teil 2, §8 und werden hier nicht wiederholt** — hier stehen nur die, die aus §5 und
§10 **neu** hinzukommen.

| Eingabe | Warum sie nicht im Repo steht — und was sie entscheidet |
|---|---|
| ⚠️ **`select count(*) from buchungen`** (Betreiberfrage 9) | Bestimmt, **wie dringend** Entscheidung 7 (b) war und ob sie reicht. `better-sqlite3` ist **synchron**: eine Übersichtsseite, die 1 s rechnet, blockiert für diese Sekunde **die gesamte Suite**. Die gerechnete Grenze liegt bei rund **100 000** Zeilen; ein Fahrzeug-Check schreibt 60–240 Zeilen, bei 8 Fahrzeugen und monatlichem Check sind das 6 000–23 000 im Jahr. **Ohne Eingriff ist die Grenze in 4–15 Betriebsjahren erreicht — und die Alt-Anwendung läuft bereits.** Die Zahl muss **vor** dem Bau der Leseseite vorliegen, nicht danach |
| ⚠️ **Die Diagnose-Abfrage auf Chargen-Doppel** (§4.8, §5.3.1) | `select artikel_id, chargen_nr, verfall, count(*) from chargen group by 1,2,3 having count(*) > 1`. Sie **meldet**, dass es Doppel gibt; sie ist **keine Sperre**. Der FEFO-Tiebreaker löst das Problem ohne Unique-Index — die Abfrage sagt nur, ob es den Fall in Produktion überhaupt gibt |
| ⚠️ **Die produktiven Werte von `WARN_TAGE_KRITISCH` und `WARN_TAGE_FAELLIG`** | Aus der alten `stack.env` ablesen und auf `LAGERBUCH_VERFALL_ROT_TAGE` / `…_GELB_TAGE` **umschreiben** (§10.1). Stehen sie dort nicht, greifen die Vorgaben 31/56 und die Zeilen entfallen ersatzlos. ⚠️ **Die Umbenennung ist eine Runbook-Eingabe, keine Codearbeit** — und die Boot-Prüfung fängt die **vertauschte** Belegung, nicht die vergessene Zeile |
| ⚠️ **Der Wert von `LAGERBUCH_ORGANISATION`** (A-T3-4) | Im Repo steht nur die Dev-Vorbelegung `"DRK Bereitschaft Musterstadt"` (`lagerbuch/playwright.config.ts:31`); die produktive `stack.env` ist gitignoriert. Der Wert steht **auf jedem gedruckten Etikett und auf dem Gate**. Die Korrektur ist ein **Ein-Zeilen-Commit**, kein Deploy-Schalter — genau das ist der Zweck der Umstellung (§10.2) |
| ✅ **Entscheidung 22 — der Backup-Job** (§10.7, A-T3-1) | **Entschieden am 04.08.2026:** der Modul-Job wandert **nicht** mit, `LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` entfällt. `lagerbuch.db` ist über den Glob in `scripts/backup.sh` ab dem ersten Boot gesichert — Preis: **Tarball-Körnung statt Einzeldateien und `KEEP` statt Tagen**, und das Skript hängt an einem Host-Cron. Ein **Sidecar im Deployment** ist als eigener Posten aufgenommen (ClickUp), nicht als Teil dieses Moduls. ⚠️ **In JEDEM Fall gilt die Runbook-Zeile, das `backups/`-Verzeichnis im Volume `lagerbuch_data` vor dem Abbau des Alt-Stacks wegzusichern** — es ist die einzige historische Tiefe vor dem Cutover-Snapshot |
| ⚠️ **Ein falscher `SUITE_ADMIN_GROUP_LAGERBUCH`-Wert** | Boot-Prüfung 5 fängt den **leeren**, nicht den **falschen** Wert. Ein falscher Gruppenname sperrt **jede** verwaltende Person aus, und es gibt für dieses Modul bewusst **keine** Suite-Admin-Rückfallebene (§3.6.2). Der einzige Weg zurück ist eine `.env`-Änderung auf dem Server |
| ⚠️ **Die Prozess-Zeitzone im laufenden Container** | `docker exec … node -e "process.stdout.write(Intl.DateTimeFormat().resolvedOptions().timeZone)"`. Suiteweiter Schritt, **nicht Teil dieser Spec** — und **für lagerbuch selbst nicht tragend**, weil die Zone als Modulkonstante im Code steht (§4.5, Entscheidung 26 b) |

---

## 8. Was §5, §10 und §12.6 ausdrücklich NICHT entscheiden — und deshalb auch hier fehlen

Diese Punkte stehen in den Kapiteln dieses Plans **als Nicht-Entscheidung**. Ihre Abwesenheit ist
keine Lücke, die ein späterer Teil schließt:

- **Ein `gezaehlt: boolean` je Check-Position** (§5.8.1, Variante c) — die **einzige** Variante, die
  den fehlenden Nachweis nachrüstet: serverseitig ist „gezählt und stimmt" von „nicht gezählt"
  **nicht unterscheidbar**. Sie kostet ein Feld im Zod-Schema, ein Feld in `checks.ergebnis`
  (**Formatversion 3**, also einen dritten Zweig in beiden Lesern) und das Umschreiben zweier Tests.
  **Backlog, nicht Spec 1** (§15) — benannt, damit sie eine **Entscheidung** bleibt und nicht als
  Nebenwirkung stattfindet.
- **„Jede positive Korrektur am Handlager löscht die Bestellt-Markierung"** (§5.5, Punkt 2) —
  erfunden, im Bestand nicht belegt, und sie verwechselte eine **Inventur-Zählung nach oben** mit
  einer Lieferung. Stattdessen wird die Regel ausgeschrieben und gezeigt (`wareOffenbarDa`, T50).
- **Ein Unique-Index auf `(artikelId, chargenNr, verfall)`** (§4.8, §5.3.1) — er setzte eine Annahme
  über Produktionsdaten voraus, die im Repo nicht belegbar ist, und **verböte einen realen Vorgang**:
  zwei Lieferungen mit derselben aufgedruckten Chargennummer. Der FEFO-Tiebreaker löst dasselbe
  Problem ohne beides.
- **Eine materialisierte Bestandstabelle** (§5.2.4, Variante c) — widerspricht der Leitplanke „kein
  zweiter Wahrheitsspeicher" und ist in §13 verworfen.
- **Eine normalisierte Vergleichsspalte auf `buchungen`** (§5.13.2) — Backfill hieße
  `UPDATE buchungen` und bräche am Append-only-Trigger ab; eine **generierte** Spalte scheidet aus,
  weil SQLite darin keine benutzerdefinierten Funktionen zulässt und `lower()` nur ASCII faltet.
- **`ß`/`ss` mitfalten** (§5.13.2, §5.20) — erzeugt Treffer, die niemand gesucht hat
  („Massen"/„Maßen"). Die Lücke ist in **beiden** Hälften gleich und damit nicht überraschend.
- **URL-Parameter umbenennen** (§5.14.1) — Kosten des Behaltens null, Kosten des Umbenennens
  gebrochene Lesezeichen und Runbook-Links, die niemand einsammeln kann.
- **Die Deckel anheben statt sichtbar machen** (§5.14.3) — ein höherer Deckel verschiebt dieselbe
  stille Grenze nach hinten und kostet bei **jedem** Aufruf. Sichtbar machen löst das Problem, das
  der Nutzer tatsächlich hat.
- **Inventur- und Check-Absendekonvention vereinheitlichen** (§5.20) — sie sind aus gutem Grund
  gegenläufig: der Check zählt **vollständig gegen ein Soll**, die Inventur **stichprobenartig gegen
  einen Live-Bestand**.
- **`MTK_WARN_TAGE`, `OBJEKT_ABLAUF_WARN_TAGE`, `BZ_KONTROLL_INTERVALL_TAGE`, `BZ_WARN_TAGE`
  konfigurierbar machen** (§10.3) — sie waren nie Env. Bei `BZ_KONTROLL_INTERVALL_TAGE` ist es mehr
  als das: die 31 Tage sind die **Prüfvorgabe** für die Kontrolllösung, und ein Regler daran lädt
  dazu ein, eine Fälligkeit **wegzukonfigurieren statt sie zu erfüllen**.
- **`SUITE_TRUSTED_PROXY_HOPS` / `SUITE_CF_TRUSTED`** (§10.4) — die richtige Hop-Zahl lässt sich aus
  dem Repo nicht ermitteln, und ein geratener Mechanismus ist schlechter als eine benannte Grenze.
  Die Env-Oberfläche dieses Themas besteht ausschließlich aus den **drei Gate-Zahlen**.
- **`AUTH_SECRET` aus der produktiven `stack.env` übernehmen** (§10.6, Abweichung 1) — es signiert
  die Sitzungen **aller** Module; es zu ersetzen meldete portal, qr, feedback und files auf einen
  Schlag ab, **für einen Nutzen, den es nicht gibt** (lagerbuchs Alt-JWT trägt kein `token.groups`,
  ein entschlüsselbares Alt-Token ergäbe `groups: []`). **Das ist keine Verletzung von
  Betreiber-Entscheidung 4, sondern ihre Erfüllung.**
- **`LAGERBUCH_HELFER_SITZUNG_SECRET` als `${VAR:?…}`-Zeile in der `compose.yaml`** (§10.6,
  Abweichung 2) — sie hielte den **ganzen** Stack an, sobald das Image mit lagerbuch ankommt und die
  `.env`-Zeile noch fehlt. Der Riegel ist stattdessen die **bedingte** Boot-Prüfung. **Der
  Unterschied zu Falle 23 ist nur der Ort, nicht die Härte.**
- **Ein globaler `env`-/`TZ`-Block in `iuk-suite/vitest.config.ts`** (§12.6, Punkt 1) — er änderte
  die Testsemantik der **vier laufenden Module**, und **niemand braucht ihn**: `_lib/zeit.test.ts`
  verstellt `TZ` absichtlich und beweist damit die Unabhängigkeit.
- **Ein E2E-Lauf gegen ein Produktions-Artefakt** (§12.6, Punkt 5) — bleibt `next dev`, wie bei allen
  vier Bestandsmodulen. ⚠️ **Genau diese Naht ist der blinde Fleck von Falle 66**, und die Abhilfe
  ist eine **Bauform** (Rückgabewerte statt geworfener Fehler), kein Testlauf — festgehalten durch
  einen Quelltext-Scan in Teil 6.
