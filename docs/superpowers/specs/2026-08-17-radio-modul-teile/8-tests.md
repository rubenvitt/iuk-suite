# 8. Testplan: was jedes Tor sieht und was keines sieht

## 8.1 Warum dieses Kapitel vier Ebenen führt und nicht drei

Die Zusagen des Moduls `radio` liegen fast alle in genau dem Bereich, den die vorhandenen Tore
**strukturell** nicht sehen können. Das ist keine Klage, sondern die Begründung für den Zuschnitt:

* **`pnpm typecheck` und `pnpm lint`** sehen keinen Unterschied zwischen zwei `number` — der
  Faktor-1000-Fehler ist für sie unsichtbar (Entscheidung 11). Eine fehlende Guard-Zeile in einer
  neuen Server Action ist typkorrekt und lint-sauber (Entscheidung 10).
* **`pnpm build`** prüft Modulgrenzen **statisch**, nicht die tatsächliche Serialisierung eines
  Requests (`CLAUDE.md:61-64`). Falle 9 und Falle 7 sind für den Build unsichtbar, Falle 6 ist HTTP
  200 mit falschem Inhalt und damit für **jedes** Tor unsichtbar (`CLAUDE.md:41-44`).
* **Vitest** läuft in jsdom, also in **einem** JS-Prozess ohne RSC-Grenze überhaupt
  (`CLAUDE.md:62-64`). Dort ist `"use client"` ein wirkungsloser String (`CLAUDE.md:29-30`), und
  `@ant-design/icons` lädt über die `default`-Bedingung und rendert klaglos (`CLAUDE.md:35-36`).
  Vitest kann Falle 6, 7 und 9 **nicht** finden, und zwar nicht aus Nachlässigkeit.
* **Playwright** fährt gegen genau **einen** `baseURL` (`playwright.config.ts:64`:
  `http://portal.localtest.me:3100`). Der Host-Riegel ist damit nur mit **absoluter** Navigation auf
  einen zweiten Host darstellbar.
* **Der Paritätscheck des Imports** ist strukturell blind: `scripts/import/parity.ts:43-56`
  vergleicht Multimengen von Zeilen-Hashes, und `scripts/import/portal.ts:72-75` schreibt selbst
  hin, dass **beide Paritäts-Arme aus derselben Mapping-Funktion** ableiten. Ein konsistenter
  Mapping-Fehler hasht auf beiden Seiten gleich (`CLAUDE.md:241-243` sagt dasselbe für den Cutover).
* **Der Healthcheck ist selbst das Tor und ist grün**, auch gegen eine frisch angelegte, leere
  `radio.db` (§8.5).

Daraus folgen vier Ebenen. Die vierte ist keine Verlegenheitslösung, sondern der Ort, an dem eine
Zusage **ehrlich** landet, die kein Laufzeittest tragen kann:

| Ebene | Besitzt | Ort |
|---|---|---|
| **Vitest (Einheit)** | reine Rechnungen, Prädikate, Riegel-Funktionen, DOM-Verhalten von Client-Inseln | §8.2 |
| **Quelltext-Zusicherungen** | „diese **Bauform** ist eingehalten" — Regeln, deren Bruch typkorrekt, lint-sauber und laufzeitgrün ist | §8.3 |
| **Playwright (e2e)** | alles, was nur ein **echter Abruf** über eine **echte RSC-Grenze** zeigt, und alles Hostabhängige | §8.4 |
| **Kein Test** | alles, was einen echten Host, einen echten Dump, ein echtes Tablet oder ein Blatt Papier braucht | §8.5 |

**Die Falsifikationsregel ist verbindlich und gilt für jede Zeile jeder Tabelle unten.** Jede
Tabelle führt die Spalte „**Mutation, die ohne den Test grün bliebe**" — dieselbe Form, die die
`lagerbuch`-Spec in `docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md:2451-2459`
etabliert hat. Diese Spalte **ist** die Falsifikation; es gibt kein zweites Verfahren daneben. Die
Regel dazu:

> Ein Pflichtstück gilt als abgenommen, wenn **jede** in seiner Zeile genannte Mutation den Test
> **rot** macht. Ein Test, der eine der genannten Mutationen überlebt, ist **vakuös** und wird
> gelöscht oder neu geschrieben — nicht ergänzt. Das Verfahren dazu steht in §8.6.

Der Grund für diese Härte steht im Projekt bereits: im `radio-admin`-Bestand ist
`software_versions.created_by` eine **tote** Spalte, die trotzdem geschrieben wird (Kapitel 4 der
Analyse, Pflicht 1, Falle 4) — genau die Klasse Zustand, die eine grüne, leere Suite entstehen
lässt.

## 8.2 Vitest — welche Einheiten, mit welchen Namen

Vitest besitzt hier **reine Funktionen und Prädikate**, nichts Hostabhängiges am echten Server und
keine RSC-Grenze. Wo eine Aussage nur über eine RSC-Grenze wahr oder falsch wird, steht sie in §8.4;
wo sie eine Bauform ist, steht sie in §8.3. Diese Trennung ist der ganze Zweck der Aufteilung: ein
Vitest, der eine RSC-Aussage zu tragen behauptet, ist eine grüne Lüge.

### 8.2.1 Die Zeitstempel-Abbildung — das teuerste Pflichtstück (Entscheidung 11)

**Datei: `scripts/import/radio.test.ts`** gegen **`scripts/import/radio.ts`.** Es gibt heute in
`scripts/import/` genau `feedback-time.ts`, `feedback.ts`, `parity.ts`, `portal.ts` je mit Test und
`fixtures/` — kein `radio.ts` (Kapitel 4 der Analyse, Pflicht 5). Der Importer entsteht also neu und
bringt seinen Test mit.

**Die Signaturen, die dieser Test verlangt** (Zusage an Kapitel Datenmodell und Import):

```ts
/** Epoch-MILLISEKUNDEN → Unix-SEKUNDEN. NULL bleibt NULL. */
export function sekundenAusMs(wert: number | null): number | null;

/** Wirft, wenn der Wert nicht plausibel dreizehnstellig ist. */
export function pruefeMs(wert: number, feld: string): number;

export function mappeGeraet(zeile: AltGeraet): NeuesGeraet;
export function mappeGeraeteEreignis(zeile: AltEreignis): NeuesEreignis;
export function mappeSoftwareVersion(zeile: AltVersion): NeueVersion;
export function mappeApiToken(zeile: AltToken): NeuesToken;
export function mappeNutzer(zeile: AltNutzer): NeuerNutzer;
export function mappeLeihe(zeile: AltLeihe): NeueLeihe;
```

**Die Fixture-Regel ist die eigentliche Zusage, nicht der Test.** `scripts/import/portal.ts:72-75`
schreibt sie wörtlich aus („keep its fixture values **distinct per field**"), und sie gilt hier für
**dreizehn** Zeitstempel-Spalten: `devices.created_at`, `devices.updated_at`,
`devices.last_updated_at`, `device_events.changed_at`, `software_versions.created_at`,
`api_tokens.created_at`, `api_tokens.last_used_at`, `api_tokens.revoked_at`, `users.last_seen_at`,
`loans.borrowed_at`, `loans.returned_at`, `loans.created_at`, `loans.updated_at`. Belegt sind alle
als Millisekunden an ihrem jeweiligen Schreibpfad: `radio-admin/server/src/repos/deviceRepo.ts:13`,
`:78`, `:230`; `radio-admin/server/src/repos/softwareVersionRepo.ts:36`, `:53`;
`radio-admin/server/src/repos/apiTokenRepo.ts:49`, `:71`, `:72`, `:96`;
`radio-admin/server/src/repos/userRepo.ts:12`; `radio-admin/server/src/repos/loanRepo.ts:75`, `:104`
— im Schema steht es **nur** für `loans` (`radio-admin/server/src/db/schema.ts:103-104`: „epoch-ms").

Die Fixture trägt **dreizehn verschiedene, per Auge unterscheidbare** Werte, in der Sekundenachse
mindestens einen Tag auseinander. Verbindlich als Konstruktion, damit niemand sie „aufräumt":

```ts
// Basis 2025-01-01T00:00:00Z in ms; je Feld ein eigener Tagesoffset.
const MS_BASIS = 1_735_689_600_000;
const TAG_MS = 86_400_000;
const feldWert = (n: number) => MS_BASIS + n * TAG_MS; // n = 1 … 13, je Feld genau ein n
```

| Testname (`it`) | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `sekundenAusMs teilt durch 1000 und rundet ab` | `1_735_689_600_000 → 1_735_689_600` | `* 1000` statt `/ 1000`; Durchleitung ohne Rechnung (**genau der Bestandsfehler**: `radio-admin/server/src/import/commit-service.ts:45-47` nimmt jede numerische Zeichenkette nur mit `Number.isFinite`, ohne Plausibilitätsspanne) |
| `sekundenAusMs lässt NULL NULL und macht daraus NICHT 0` | `null → null` | `?? 0` als „Sicherheitsnetz". **Das ist die zweitschlimmste Mutation des ganzen Plans:** eine `loans.returned_at = 0` ist eine *abgeschlossene* Leihe im Jahr 1970, liegt unter jedem Retention-Cutoff und wird beim nächsten Lauf gelöscht — aus einer **aktiven** Leihe wird eine gelöschte |
| `pruefeMs weist einen Sekundenwert ab` | `1_700_000_000` (zehnstellig) wirft mit Feldnamen | Plausibilitätsspanne entfernt; `Number.isFinite` als einzige Prüfung (= Bestandsverhalten) |
| `mappeGeraet ordnet created_at, updated_at und last_updated_at NICHT gegeneinander um` | drei paarweise verschiedene Werte landen feldweise richtig | zwei der drei Felder vertauschen — **bei gleichen Fixture-Werten unsichtbar**, und die Parität hasht identisch |
| `mappeLeihe hält borrowed_at und returned_at getrennt` | zwei verschiedene Werte, richtige Zuordnung | `returned_at: zeile.borrowed_at` — die Leihe sieht aus wie am Ausleihtag zurückgegeben |
| `mappeLeihe schreibt snapshot_call_sign und borrower_name nicht ineinander` | zwei verschiedene Zeichenketten, richtige Zuordnung | Vertauschung. Das ist eines der vier verwechselbaren Paare aus Pflicht 4 der Analyse; `borrower_name` ist personenbezogen und der DSGVO-Grund der Retention |
| `mappeGeraet hält alamos_integrated und loanable getrennt` | `1` / `0` unterschiedlich belegt | Vertauschung zweier 0/1-Integer, „die niemandem auffallen" (Pflicht 4). `loanable` ist Stammdatum (`radio-admin/server/src/db/schema.ts:30-32`) — vertauscht verschwinden Geräte aus der Ausleihe |
| `mappeGeraeteEreignis weist ein unbekanntes source-Wort ab` | `source` außerhalb `manual\|csv-import\|create\|update-note` wirft | den Wert durchleiten. `radio-admin/server/src/db/schema.ts:96` ist ein Drizzle-Enum **ohne DB-CHECK**: die Altdaten dürfen fremde Werte tragen, das Ziel nicht (Pflicht 3) |
| `keine Mapping-Funktion liefert für zwei Ausgabefelder dasselbe Quellfeld` | Schleife über alle sechs Mapper: die Werte-Multimenge der Ausgabe ist **duplikatfrei** — ⚠️ **`null` ausgenommen**, denn `loans.returned_at` ist rechtmäßig `null` und wäre sonst mit jedem zweiten Null-Feld ein roter Test gegen einen richtigen Mapper | genau das, was gleiche Fixture-Werte verbergen. Diese eine Zeile ist die maschinelle Fassung der Fixture-Regel und darf nicht entfallen, wenn jemand später ein Feld ergänzt |

⚠️ **Was dieser Test NICHT beweist**: dass der echte Dump dreizehnstellige Werte trägt. Das ist
Abfrage 5 aus Pflicht 4 (`SELECT MIN(created_at), MAX(created_at) FROM devices;`) und gehört ins
Runbook (§8.5). Die lokale `radio-admin/data/data.sqlite` beantwortet die Frage **nicht** — sie ist
leer und führt `loans`, `api_tokens`, `users` überhaupt nicht (Kapitel 6 der Analyse, Frage 2).

### 8.2.2 Der Code-Einlöser — drei Gründe, und sie müssen benennbar sein

Bauform ist wörtlich das `lagerbuch`-Muster (Entscheidung 6): der Code ist **dauerhaft und
sperrbar**, nicht löschbar, und prägt beim Einlösen am Gate eine **zeitlich begrenzte** Sitzung.
Vorbilder im Quelltext: `src/app/m/lagerbuch/_lib/helferZugang.ts:110` (Prädikat), `:135` (werfende
Form für Layouts), `:170` (Ergebnisform für schreibende Actions).

**Zusage an Kapitel Zugang — die tragende Schnittstellenauflage dieses Kapitels:** die drei
Ablehnungsgründe sind **eine exportierte, benannte Literal-Union**, kein `boolean`, kein Wurf und
keine Fehlermeldung als Zeichenkette. Ohne sie lässt sich „gesperrt" von „unbekannt" von
„abgelaufen" schlicht nicht **auseinander** prüfen, und der Testplan wird zur Behauptung. Vorbild ist
`SperrGrund` in `src/app/m/lagerbuch/_lib/helferZugang.ts:63` — und dort steht auch die Begründung,
warum es **eine** Union sein muss und nicht zwei: zwei getrennte Unions für dieselben Wörter fallen
erst auf, wenn jemand eine davon erweitert (`:53-60`).

```ts
// src/app/m/radio/_lib/zugang.ts
export type ZugangGrund = "unbekannt" | "gesperrt" | "abgelaufen";
export function einloesenAmGate(db: DB, roh: string):
  | { ok: true; zielPfad: string }
  | { ok: false; grund: Extract<ZugangGrund, "unbekannt" | "gesperrt"> };
export async function kioskZugangOderNull(db: DB): Promise<KioskZugang | null>;
export async function requireKioskZugang(db: DB): Promise<KioskZugang>;
export async function requireKioskSchreibend(db: DB):
  Promise<{ ok: true; zugang: KioskZugang } | { ok: false; grund: ZugangGrund }>;
```

⚠️ **Die Unterscheidung ist nicht kosmetisch**, und das ist derselbe Grund wie bei `lagerbuch`
(`helferZugang.ts:56-62`): bei `abgelaufen` hilft erneutes Einlösen, bei `gesperrt` **nicht** —
derselbe Code scheitert genauso. Nur daran hängt, ob die Oberfläche das Feld zur Code-Erneuerung
überhaupt anbietet.

**Dateien: `src/app/m/radio/_lib/code.test.ts`** (Kanonisierung) und
**`src/app/m/radio/_lib/zugang.test.ts`** (Einlösung und Recheck).

| Testname (`it`) | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `ein unbekannter Code ergibt grund "unbekannt"` | kein Treffer in der Codetabelle | `grund: "gesperrt"` für beides — die Oberfläche bietet dann Erneuerung an, wo keine hilft |
| `ein gesperrter Code ergibt grund "gesperrt", nicht "unbekannt"` | Zeile existiert, `aktiv = 0` | `WHERE aktiv = 1` in der Suchabfrage: der gesperrte Code verhält sich wie ein Tippfehler, und niemand erfährt, dass eine **Sperre** gegriffen hat |
| `ein gesperrter Code blockt auch den LESEPFAD, nicht nur den Schreibpfad` | `kioskZugangOderNull` liefert `null`, sobald `aktiv = 0` — **auch mit gültig signiertem Cookie** | den DB-Recheck aus dem Lesepfad entfernen. **Das ist der Bestandszustand von `lagerbuch` vor der Portierung** (`helferZugang.ts:22-27` schreibt es aus) und bleibt in jedem Test grün, der nur schreibt: ein gesperrter Code liest sonst bis zum Sitzungsende den gesamten Bestand samt Ausleihernamen weiter |
| `ein manipuliertes tokenId in einem gültig signierten Cookie verhält sich wie gesperrt` | kein Treffer auf dem Primärschlüssel → `gesperrt` | `!zeile` als „unbekannt" oder als `ok: true` behandeln — der Doppeltest `!zeile \|\| !zeile.aktiv` ist genau deshalb einer (`helferZugang.ts:83-85`) |
| `eine abgelaufene Sitzung ergibt grund "abgelaufen" und KEINEN Wurf` | `requireKioskSchreibend` gibt zurück, wirft nicht | zum Wurf oder `redirect()` umbauen. Ein `redirect()` verwürfe die schon eingetragenen Felder — genau der Datenverlust, den `docs/design/README.md` unter „Kommen Fehler aus Server-Actions am Feld an?" ausschließt |
| `code, label und Ablauf kommen aus der DB-Zeile, der Ablauf aus dem Cookie` | Sperrung wirkt **sofort** (DB), Ablauf steht seit Ausstellung fest (Cookie) | `label` aus der JWT-Nutzlast lesen: ein umbenannter Code trägt dann bis zum Sitzungsende sein alten Namen in jede Journalzeile |
| `einloesenAmGate verbraucht keinen Code` | die Zeile ist nach der Einlösung **weiter einlösbar**, nur ihr Nutzungsdatum wandert | den Code beim Einlösen entwerten oder löschen. **Entscheidung 6 verbietet das Löschen ausdrücklich**: ein gelöschter Code kann an ein später ausgestelltes Kärtchen zurückfallen, und historische Journalzeilen erschienen danach unter dem neuen Label |
| `123456, 123-456 und " 123 - 456 " ergeben denselben kanonischen Wert` | Kanonisierung vor der Suche | die Bindestrich-Ergänzung entfernen — sie liefert `{ok:false}`, also genau das, was ein falscher Code liefern soll, und hat damit **keine Fehlerform** (übernommen aus `src/app/m/lagerbuch/_lib/code.test.ts`) |

⚠️ **Zu bestätigen (nur der Betreiber weiß es):** die **Sitzungsdauer**. Vorschlag **12 Stunden** wie
bei `lagerbuch` (dort als `LAGERBUCH_HELFER_SITZUNG_STUNDEN` geführt, `e2e/helpers/lagerbuch.ts`
setzt den E2E-Wert auf `"12"` mit dem Vermerk „kürzer bringt nichts, weil kein Test 12 h wartet").
Der Test prüft die **Grenze relativ zum konfigurierten Wert**, nie die Zahl 12 — sonst wandert die
Entscheidung in eine Testdatei.

### 8.2.3 Der Host-Riegel in allen drei Formen (Falle 61)

**Datei: `src/app/m/radio/_lib/host.test.ts`,** gebaut nach
`src/app/m/lagerbuch/_lib/host.test.ts`. Geprüft werden die drei Funktionen
`istRadioHost` / `requireRadioHost` / `radioHostOderNull` — Vorbild
`src/app/m/lagerbuch/_lib/host.ts:42`, `:48`, `:54`. `notFound()` wird gemockt, weil es in der
echten Laufzeit einen Next-internen Fehler wirft; geprüft wird, **dass** geworfen wird.

Warum der Riegel überhaupt existiert, ist keine Vermutung: `src/core/routing.ts:58-67` gatet einen
internen Pfad `/m/<key>/…` **nach dem Modul aus dem Segment**, ohne jeden Hostbezug, und
`src/core/registry.ts:239` steigt für ein Modul ohne Auth-Pflicht sofort aus
(`if (!mod.requiresAuth) return true;`). `radio` führt `requiresAuth: false` (Entscheidung 4). Also
antwortet **jeder** Suite-Host auf `/m/radio/*`, wenn das Modul seinen eigenen Riegel nicht trägt.

| Testname (`it`) | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `istRadioHost trifft den Dev-Host OHNE jede Env` | `radio.localtest.me` → `true`, `SUITE_HOST_RADIO` gelöscht | direkter Vergleich gegen `prodHostsFor` statt `moduleForHost(resolveHost(headers))?.key === "radio"` — der Dev-Host fällt heraus, und **alle** lokalen Läufe und die ganze E2E-Suite werden 404 |
| `istRadioHost trifft den konfigurierten Prod-Host` | `SUITE_HOST_RADIO = "radio.iuk-ue.de"` → `true` | `resolveHost` nachbauen statt wiederverwenden — die Vorrangregel läuft dann auseinander |
| `istRadioHost weist einen FREMDEN Suite-Host ab` | `feedback.localtest.me` → `false`, `iuk-ue.de` → `false` | Prädikat auf `true` verkürzen, „weil der Riegel ja in der Middleware sitzt" — er sitzt dort nicht (`routing.ts:58-67`) |
| `istRadioHost bevorzugt x-forwarded-host vor host` | beide Richtungen geprüft | Reihenfolge tauschen. Nach dem Rewrite der Middleware ist `x-forwarded-host` die einzig richtige Quelle |
| `istRadioHost ignoriert einen Port` | `radio.localtest.me:3000` → `true` | Port mitvergleichen: lokal grün (Port 3100 in beiden), in Produktion hinter Traefik rot |
| `istRadioHost hat KEINEN "kein Prod-Host konfiguriert → durchlassen"-Zweig` | ohne `SUITE_HOST_RADIO` ist `irgendwas.example.org` **falsch** | genau diesen Zweig einbauen. Er ist die Sperre, die sich selbst abschaltet: **vor** dem Cutover ist `SUITE_HOST_RADIO` nicht gesetzt, und genau dann stünde offen, wogegen die Datei gebaut ist. Entscheidung 10 verbietet ihn ausdrücklich |
| `requireRadioHost wirft auf fremdem Host — notFound(), KEIN 403` | Wurf | `forbidden()`/403: die Existenz eines Pfades auf dem falschen Host wird nicht verraten |
| `radioHostOderNull wirft NIE` | `"radio"` / `null` / `null` bei leeren Headers | die werfende Form auch in Route Handlern verwenden — ein `notFound()` ist keine brauchbare Antwort auf einen gescannten QR-Code; der Handler baut seine 404 selbst |

⚠️ **Es gibt kein `validateRadioHosts`.** 0, 1 und ≥ 2 Hosts sind alle erlaubt: 0 vor dem Cutover, 1
im Normalfall, ≥ 2 solange `radio-admin.iuk-ue.de` mitläuft (Entscheidung 2). Die `files`-Form mit
Rollenzuordnung über den Index in `SUITE_HOST_FILES` ist hier **falsch** — bei `radio` liegen beide
Rollen auf **einem** Host und die Rolle steckt im **Pfad** (Entscheidung 10). Der Scan, der die
`files`-Form fernhält, steht in §8.3.

### 8.2.4 Der Pfad-Riegel für `/admin` — der Test, den `lagerbuch` nicht hat

Dies ist **kein** Host-Test, und die Verwechslung ist die naheliegendste Fehlerquelle des ganzen
Moduls: Ausleihe und Verwaltung liegen auf **demselben** Host (Entscheidung 1), der Host-Riegel lässt
also beide durch. Was `/admin` schützt, ist ausschließlich der Zugriffsriegel, den jede Seite, jede
Server Action und jeder Route Handler **selbst als erste Anweisung** ruft (Entscheidung 10).

**Datei: `src/app/m/radio/_lib/zugang.test.ts`** (derselbe Modul-Namensraum wie §8.2.2, andere
`describe`-Blöcke) — Vorbild `src/app/m/lagerbuch/_lib/zugang.test.ts`.

| Testname (`it`) | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `Mitglied von adminGroupsFor darf verwalten` | Gruppe aus `SUITE_ADMIN_GROUP_RADIO` bzw. Registry-Vorgabe | `mod.adminGroups` direkt lesen statt `adminGroupsFor` — die Env-Überschreibung wird wirkungslos, und niemand merkt es, weil der Registry-Vorgabewert lokal stimmt |
| `Suite-Admin OHNE radio-Gruppe bekommt 404` | `session.user.isAdmin` zählt **nicht** | auf `isModuleAdmin` oder `session.user.isAdmin` umstellen. **Beide Dev-Logins setzen `isAdmin = true`** — die gesamte E2E-Suite bliebe grün, während die Verwaltung für jeden Suite-Betreiber offen stünde. Entscheidung 9 verlangt, dass `radio` den Kurzschluss modulintern ignoriert, wie `feedback` und `lagerbuch` |
| `eine leere adminGroups-Liste gewährt NICHTS` | `[]` → 404 | die Prüfung mit der `canAccess`-Verknüpfung aufbauen: `src/core/registry.ts:242` steigt bei leerer Liste mit `true` aus (`if (erlaubt.length === 0) return true;`) — richtig für Modulzugang, **falsch** für Verwaltungszugang |
| `keine Sitzung auf /admin → Umleitung auf /login mit absolutem callbackUrl` | nur der `/admin`-Ast leitet um | relativen `callbackUrl` bauen: die Rückkehr landet auf dem Portal-Host statt auf `radio.iuk-ue.de` |
| `der Riegel steht NICHT auf dem anonymen Ausleih-Ast` | `requireRadioAdmin` kommt in keiner Datei außerhalb von `admin/` und `_actions/` vor | den Riegel „aus Konsistenz" ins Modul-Layout heben. **Das schickt jeden anonymen Scan nach `/login`** — genau den Ausfall, gegen den `requiresAuth: false` gebaut ist. Typkorrekt, lint-sauber, und ein e2e fände es nur mit einem Abruf **ohne** Cookie |
| `requireRadioAdmin ruft requireRadioHost als erste Anweisung` | Host-Riegel liegt **innen** | die Zeile als „doppelt zu den Layouts" entfernen. Eine Server Action hat **kein** Layout über sich; die Zusage „jede Verwaltungs-Action ist host-gebunden" ist nur **durch Konstruktion** wahr, nicht durch eine Liste, die die nächste Action vergisst (`src/app/m/lagerbuch/_lib/helferZugang.ts:13-15` schreibt genau das aus) |

### 8.2.5 Die Retention-Auswahl (Entscheidung 12)

**Datei: `src/app/m/radio/_lib/retention.test.ts`.** Die Auswahl ist eine **reine Funktion**, getrennt
von der Ausführung — nur so ist sie ohne Datenbank prüfbar und nur so lässt sich der Boot-Pfad
ausschließen:

```ts
export const RETENTION_MONATE = 2;
export function retentionGrenze(jetzt: Date, monate?: number): number; // Unix-SEKUNDEN
export function waehleAbgelaufeneLeihen(zeilen: LeiheZeile[], grenze: number): string[];
export function purgeAbgelaufeneLeihen(db: DB, jetzt: Date): number; // ruft die beiden oben
```

| Testname (`it`) | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `eine aktive Leihe (returned_at NULL) wird NIE ausgewählt` | `null` fällt raus, egal wie alt `borrowed_at` ist | die `IS NOT NULL`-Bedingung streichen. Der Bestand hat sie (`radio-admin/server/src/repos/loanRepo.ts:191-196`: `WHERE returned_at IS NOT NULL AND returned_at < cutoffMs`), und ohne sie löscht der erste Lauf **jede laufende Ausleihe** |
| `returned_at = 0 wird ausgewählt — und deshalb darf NULL nie zu 0 werden` | die Kopplung zu §8.2.1 ist ausgeschrieben und im Test **verlinkt** | keine. Diese Zeile ist absichtlich unangenehm: sie hält die beiden Pflichtstücke aneinander. Wer die `?? 0`-Mutation aus §8.2.1 einbaut, macht **diesen** Test rot |
| `die Grenze rechnet in SEKUNDEN, nicht in Millisekunden` | `retentionGrenze` gegen einen festen Zeitpunkt, Erwartung zehnstellig | die Millisekunden-Rechnung des Bestands übernehmen (`radio-admin/server/src/services/retentionService.ts:9`, `:17-21`). In Sekunden verglichen liegt die Grenze im Jahr 1970 — es wird **nichts** gelöscht, und der Fehler ist stumm und harmlos, bis jemand die Einheit an einer Stelle korrigiert |
| `genau auf der Grenze wird nicht gelöscht` | `<`, nicht `<=` | Vergleich kippen. Ein Tag Unterschied fällt niemandem auf |
| `waehleAbgelaufeneLeihen greift ohne Datenbank und ohne Uhr` | reine Funktion, Zeit als Parameter | `Date.now()` in die Funktion ziehen; der Test wird dann unfälschbar grün |

⚠️ **Die Ausführung hängt NICHT am Boot**, und das ist der Kern von Entscheidung 12. Der Bestand
macht es anders: `radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`, und
`radio-admin/server/src/services/retentionService.ts:47` führt `purge()` **sofort** aus, vor dem
Tagestimer — der Quellkommentar auf `:29-30` nennt als Anlass wörtlich „straight after a data
migration". Genau diese Reihenfolge macht einen Faktor-1000-Fehler im Import zur **Datenvernichtung**
beim nächsten Start. Dass der Boot die Funktion nicht ruft, ist eine **Bauform** und steht als
Quelltext-Scan in §8.3.

⚠️ **Zu bestätigen ist nicht die Retention, sondern ihr Umfang:** „betroffen < 100 Leihen" ist eine
Schätzung des Betreibers, keine Zählung (Entscheidung 12). Die Zählung ist ein Runbook-Schritt
(§8.5).

### 8.2.6 Der Ausfall-Puffer — die Fachlichkeit, die beim naiven Port wegfällt

Entscheidung 15 verlangt, `STALE_GRACE_MS` als **Fachlichkeit** mitzunehmen. Der Beleg ist
`radio-inventar/apps/backend/src/modules/radio-admin/radio-admin.service.ts:48`
(`const STALE_GRACE_MS = 5 * 60_000;`), angewandt auf `:123`
(`now - this.deviceCache.fetchedAt < ttl + STALE_GRACE_MS`). Fällt die HTTP-Grenze zwischen Kiosk und
Verwaltung weg — und sie darf erst fallen, wenn die sechs `/v1`-Routen
(`radio-admin/server/src/routes/loanApi.ts:126`, `:133`, `:140`, `:148`, `:158`, `:187`) Drizzle-Aufrufe
im selben Prozess sind —, dann verschwindet der Puffer beim naiven Port lautlos: es gibt keinen
`fetch` mehr, an dem er hängen könnte. Die **Aussage** bleibt aber: Ausleihe, Rückgabe und Historie
bleiben bei einer kurzen Störung bedienbar, statt eine Fehlerseite zu zeigen.

**Datei: `src/app/m/radio/_lib/stand.test.ts`.**

```ts
export const AUSFALL_PUFFER_MS = 5 * 60_000;
export function standNochBedienbar(alterMs: number, ttlMs: number): boolean;
```

| Testname (`it`) | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `innerhalb der TTL ist der Stand frisch` | `alter < ttl` → `true` | keine — dieser Fall ist der harmlose und steht nur als Kontrast da |
| `zwischen TTL und TTL plus Puffer ist der Stand NOCH bedienbar` | `ttl + 1` → `true` | den Puffer-Summanden entfernen (`< ttl` statt `< ttl + AUSFALL_PUFFER_MS`). **Das ist der naive Port**, und er ist grün in jedem Test, der nur den frischen und den ganz alten Fall kennt |
| `jenseits von TTL plus Puffer ist der Stand NICHT mehr bedienbar` | `ttl + AUSFALL_PUFFER_MS + 1` → `false` | `return true` — der Kiosk zeigt dann beliebig alte Bestände als aktuell an, und **kein** Test und **kein** Blick auf den Bildschirm unterscheidet das vom Normalfall |
| `AUSFALL_PUFFER_MS ist fünf Minuten` | die Konstante selbst | die Konstante auf `0` kippen. Ohne diese Zeile ist die Zusage „5 Minuten Störung sind gedeckt" nicht geprüft, sondern nur aufgeschrieben |

### 8.2.7 DOM-Verhalten — das Harness ist gesetzt

Für DOM-Verhalten gilt `src/app/m/qr/_lib/test-dom.tsx` (`CLAUDE.md:250-251`: „kein zweites
erfinden"). Die verfügbaren Bausteine: `mount` (`:24`), `hydrate` (`:47`), `rerender` (`:69`),
`unmount` (`:77`), `query` (`:114`), `queryAll` (`:120`), `exists` (`:124`), `fill` (`:139`), `click`
(`:149`), `clickElement` (`:156`), `submitForm` (`:167`), `queryPortal` (`:187`), `existsPortal`
(`:193`), `clickPortal` (`:197`). Die `*Portal`-Varianten sind für antd-Overlays (Modal, Select,
Dropdown) und der Grund, warum kein zweites Harness nötig ist.

⚠️ **Was hier NICHT geprüft werden darf, und das ist die wichtigste Zeile des Abschnitts:** jsdom hat
**keine RSC-Grenze** (`CLAUDE.md:62-64`). Ein Test, der eine `"use client"`-Tabelleninsel mountet,
beweist über Falle 9 **nichts** — er würde die kaputte Fassung genauso grün mounten. Diese Tests
besitzen Formatierung, Feldzustände und Overlay-Verhalten, nie die Grenze.

| Datei | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `src/app/m/radio/_ui/AusleiheForm.test.tsx` | ein leerer Ausleihername wird am Feld abgewiesen; der **vorausgefüllte** Name ist überschreibbar und wird nicht erzwungen | Vorbelegung als `readonly` bauen. Entscheidung 7: die Ausleihe ist auch für Angemeldete **in der Sache anonym**, der Name **kann** vorausgefüllt werden. ⚠️ Ob die Vorbelegung überhaupt kommt, ist **zu bestätigen** — der Test prüft die Überschreibbarkeit, nicht die Existenz |
| `src/app/m/radio/_ui/GateForm.test.tsx` | ein abgelehnter Code erzeugt eine **benannte deutsche Meldung am Feld**, drei Gründe drei Texte; die Eingabe bleibt stehen | alle drei Gründe auf einen Text abbilden — die Oberfläche bietet Erneuerung dann im gesperrten Fall an, wo sie nicht hilft (§8.2.2) |
| `src/app/m/radio/_ui/CodeSperrenDialog.test.tsx` | „Sperren" ist bestätigungspflichtig; es gibt **kein** „Löschen" | einen Löschknopf anbieten. Entscheidung 6 verbietet Löschen — der Test hält die Abwesenheit fest, weil eine hinzugefügte Aktion sonst niemandem auffällt |
| `src/app/m/radio/_ui/GeraeteTabelle.test.tsx` | die 15 `render`-Funktionen formatieren richtig (Status, Fälligkeit, Modi als Liste statt Klartextkomma) | `device_modes` ungeteilt anzeigen (Bestandsformat ist eine komma-verbundene Zeichenkette wie „TMO,DMO") |

## 8.3 Quelltext-Zusicherungen — die ehrliche Ebene für „diese Bauform ist eingehalten"

Sie belegen nicht, dass etwas **wirkt**, sondern dass eine Bauform **eingehalten** ist. Genau dafür
sind sie hier die richtige Ebene, und die Suite benutzt sie an vergleichbaren Stellen längst:
`src/core/shell/icons.test.ts` riegelt Falle 7 repo-weit ab (`CLAUDE.md:38-40`), und
`scripts/seed-lokal.test.ts:46-56` liest `src/core/bootstrap.ts` und `src/instrumentation.ts` als
**Text** und verbietet dort drei Namen. Diese Ebene existiert also, sie wird hier nur ausdrücklich
benannt.

Der Grund, sie für `radio` besonders schwer zu belasten, ist Entscheidung 10: mit
`requiresAuth: false` erbt `/admin` **kein** Middleware-Gating, also ruft jede Seite, jede Action und
jeder Handler den Riegel selbst. Eine fehlende Guard-Zeile in einer **neu hinzugefügten** Action ist
typkorrekt, lint-sauber, sieht wie ein Erfolg aus — und **es gibt keinen Laufzeittest, der eine
Action ohne Sitzung aufruft.** Ohne die folgende Tabelle bleibt „jede Verwaltungsstelle ist bewacht"
eine Absichtserklärung.

**Datei: `src/app/m/radio/_lib/bauform.test.ts`** (ein Vorbild derselben Bauart liegt als
`src/app/m/lagerbuch/_lib/bauform.test.ts` im Repo).

| Zusicherung | Warum sie kein Laufzeittest sein kann |
|---|---|
| **Kein `user.isAdmin` / `session.user.isAdmin` in `src/app/m/radio/`** | Beide Felder sind `boolean`, ein Umbau ist typkorrekt und baut durch — und **beide Dev-Logins setzen `isAdmin = true`**, die E2E bliebe grün, während die Verwaltung für jeden Suite-Betreiber offen stünde (Entscheidung 9) |
| **Kein `isModuleAdmin`, `requireModuleAdmin`, `moduleAdminPageOrNotFound`, `canAdminModule` in `src/app/m/radio/`** | Die Funktionen sind fertig, gut und die falschen für dieses Modul: `radio` ignoriert den Suite-Admin-Kurzschluss modulintern (Entscheidung 9). Ein Import sieht wie Wiederverwendung aus |
| **Kein `validateRadioHosts`, und in `_lib/host.ts` kein `prodHostsFor`-Vergleich** | Die `files`-Form (`SUITE_HOST_FILES`, Rolle über den Index) ist die naheliegende Vorlage und für `radio` falsch — beide Rollen liegen auf **einem** Host (Entscheidung 10). Ein Nachbau ist grün, solange genau ein Host konfiguriert ist, und kippt beim zweiten (Entscheidung 2 lässt zwei zu) |
| **Jede `page.tsx`, `layout.tsx` und `route.ts` unter `src/app/m/radio/admin/` nennt `requireRadioAdmin` bzw. `radioHostOderNull`** — Zählung gegen die Seitenliste des Kapitels Verwaltungsoberfläche | Route Handler haben **kein** Layout; die Sperre erreicht sie über kein Group-Layout. Route-Group-Grenzen sind keine Sicherheitsgrenzen |
| **Jede exportierte Funktion in `src/app/m/radio/_actions/*.ts` ruft `requireRadioAdmin` oder `requireKioskSchreibend` — oder steht auf einer Ausnahmeliste mit GENAU ZWEI Einträgen** | Der Scan zählt die Ausnahmen mit: wächst die Liste, ist das ein **roter Test** und keine Zeile im Diff. Auflagen zum Zählen, sonst liefert er falsche Zahlen: `export type` und `export interface` werden verworfen; gezählt wird **je Datei je Deklaration**, nie über ein `Set` der Namen; und die Datei überspringt **sich selbst** |
| **Kein Aufruf der Retention aus `src/core/bootstrap.ts` und `src/instrumentation.ts`** — Textscan auf `retention`/`purge`, Vorbild `scripts/seed-lokal.test.ts:46-56` | Entscheidung 12. Die Verdrahtung am Boot ist genau das, was der Bestand tut (`radio-admin/server/src/index.ts:35` → `retentionService.ts:47`), sie sieht nach Sorgfalt aus, und ihr Schaden tritt **einmal** ein, bei einem Start nach einem Import |
| **`seedLokal` legt keine einlösbare Zugangszeile an** — Textscan plus Laufzeitprüfung: nach `seedLokal` ist die Codetabelle **leer** | `shouldSeed()` ist `SUITE_SEED === "1" \|\| NODE_ENV === "development"` (`src/core/bootstrap.ts:108`), und `SUITE_SEED=1` ist der **Generalproben**-Schalter, nicht der Lokalschalter (`CLAUDE.md:180-183`). Ein geseedeter Code wäre in der Generalprobe ein **gültiger anonymer Zugang** zum gesamten Bestand samt Ausleihernamen. Typkorrekt und testgrün; nur das Datenleck ist real |
| **Kein `AdminUser` und kein Literal `pocketid:` in `src/app/m/radio/` und `scripts/import/radio.ts`** | Entscheidung 14: die Suite führt den **rohen** `sub`, der Präfix verschwindet. Der Bestand baut die Kennung als `pocketid:${sub}` (`radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`). Ein mitkopierter Präfix ergibt Audit-Zeilen, die auf niemanden auflösen — HTTP 200, leerer Name |
| **Kein Prüfpfad gegen `api_tokens` in `src/app/m/radio/`** — die Tabelle wird gelesen und geschrieben nur vom Importer und der Historienansicht | Entscheidung 13: produktiv trägt sie genau **einen** Konsumenten, den Alt-Kiosk (statischer `RADIO_ADMIN_API_TOKEN`), und der verschwindet mit dem Port. Ein neu gebauter Bearer-Pfad wäre ein zweiter, undokumentierter anonymer Zugang — und er funktionierte |
| **Kein base64-kodierter Zugang in einer URL** — kein `btoa`, kein `Buffer.from(…).toString("base64")` im QR-Erzeugungspfad | Entscheidung 8. Heute trägt der QR-Code den einen geteilten API-Token als URL-Parameter, base64-kodiert (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`) — ohne Ablauf, ohne Widerruf. Ein 1:1-Port ist **funktionsfähig** und deshalb in keinem Test rot |
| **Kein `localStorage` als Zugangsspeicher unter `src/app/m/radio/`** | Der Bestand legt das Geheimnis dort ab (`radio-inventar/apps/frontend/src/lib/tokenStorage.ts:5-13`). Ein mitportierter `localStorage`-Zugang ist origin-gebunden, umgeht jeden serverseitigen Riegel und ist mit entsperrtem Bildschirm auslesbar |
| **Kein `domain` in den Cookie-Optionen der Kiosk-Sitzung** | Die naheliegende Vorlage `src/core/auth/cookies.ts` setzt es, und der Bestand setzt es sogar ausdrücklich subdomainweit (`radio-inventar/apps/backend/src/config/session.config.ts:16-28`: `domain: '.' + parts.slice(-2).join('.')`, dazu `sameSite: 'none'` auf `:39`). Playwright fährt gegen **einen** Host, wo ein domainweites Cookie sich exakt wie ein host-only verhält |
| **Kein `@ant-design/icons`-Import in einer Datei ohne `"use client"` unter `src/app/m/radio/`** | Deckt bereits `src/core/shell/icons.test.ts` repo-weit ab (`CLAUDE.md:38-40`) — **kein neuer Scan**, aber die Zeile steht hier, damit niemand einen zweiten baut. Betroffen sind beide Alt-Frontends: `react-icons` in `radio-admin`, `lucide-react` im Kiosk, **beide** müssen auf die `ICONS`-Map. ⚠️ Wer `"use client"` auf `icons.ts` setzt, verwandelt Falle 7 in Falle 6: HTTP 200 mit **leerer** Map und still falschem Icon |

**Was ausdrücklich KEINE Quelltext-Zusicherung braucht, weil ein Tor es schon sieht** — hier
korrigiert dieses Kapitel die Analyse: die `COPY`-Zeile im `Dockerfile` ist **nicht** ungeprüft.
`src/core/bootstrap.test.ts:105-111` liest die Datei als Text und verlangt für **jeden** Eintrag aus
`MODULE_MIGRATIONS` und `CORE_MIGRATIONS`, dass sein `migrationsFolder` darin vorkommt
(`expect(dockerfile, "Dockerfile: COPY für … fehlt").toContain(m.migrationsFolder)`), und `:100-101`
prüft Ordner und `meta/_journal.json`. Das Dreieck ist damit **vollständig** durch `pnpm vitest run`
abgedeckt, sobald der Eintrag in `MODULE_MIGRATIONS` (`src/core/bootstrap.ts:20`) steht; die
Behauptung „lokal grün, im Container kaputt" gilt für die Suite von heute nicht mehr. Es bleibt genau
**eine** Reihenfolge-Auflage: der Eintrag in `MODULE_MIGRATIONS` muss im **selben** Commit stehen wie
Ordner und `COPY`-Zeile, sonst ist der Test rot statt der Container.

## 8.4 Playwright — was nur ein echter Abruf zeigt

Playwright besitzt hier genau zwei Klassen von Aussagen, und beide sind für jedes andere Tor
unerreichbar: (a) **die RSC-Grenze**, weil sie erst beim Serialisieren eines echten Requests
existiert, und (b) **der Host**, weil `moduleForHost` in Vitest nur gegen ein `Headers`-Objekt
antwortet, das der Test selbst gebaut hat.

**Die eine Quelle für Host, Fremdhost, Gruppe und Port: `e2e/helpers/radio.ts`.** Vorbild
`e2e/helpers/lagerbuch.ts`, und dessen Kopfkommentar nennt den Grund, der hier wortgleich gilt:
stünde die Admin-Gruppe einmal in `webServer.env` und einmal im Spec, hätte man **zwei** Literale,
und der Fehlerfall ist nicht laut, sondern **gegenteilig** — mit falschem `groups` bezeugt der Lauf
einen 404 und **sieht dabei aus wie ein bestandener Test**.

```ts
// e2e/helpers/radio.ts
export const RADIO_HOST = "radio.localtest.me";
export const FREMDER_HOST = "feedback.localtest.me"; // existiert bereits, playwright.config.ts:155
export const RADIO_ADMIN_GRUPPE = "radio_admin";     // ⚠️ Prod-Wert ist Betreibersache
export const RADIO_PORT = 3100;
export const E2E_CODE_AKTIV = "111-111";
export const E2E_CODE_GESPERRT = "222-222";
export const RADIO_ENV: Record<string, string>;
export function radioUrl(pfad: string): string;   // absolut, weil baseURL aufs PORTAL zeigt
export function fremdUrl(pfad: string): string;
```

⚠️ **Zwei aktive Codes, nicht einer** — dieselbe Begründung wie bei `lagerbuch`: Playwright fährt
alle Spec-Dateien in **einem** Worker gegen **eine** SQLite-Datei, und der Sperr-Test darf die
Sitzung des Ausleih-Tests nicht mitnehmen.

### 8.4.1 Die Flüsse

| Spec-Datei | Fluss | Zusage |
|---|---|---|
| `e2e/radio-kiosk.spec.ts` | Code am Gate einlösen → Geräteliste → ausleihen → zurückgeben | 303 auf das Ziel, `Set-Cookie` der Kiosk-Sitzung **ohne** `Domain=`; die Ausleihe erscheint in der Liste aktiver Leihen; die Rückgabe setzt `returned_at`. Jeder POST wird mit `page.waitForResponse` **auf seine Antwort** geprüft, nicht auf eine spätere Zustandsänderung (§8.4.4) |
| `e2e/radio-zugang.spec.ts` | Zugang über die Suite-Kachel statt über den QR-Code | angemeldet, mit Zugriff aus der Kachel, ohne Code: Ausleihe erreichbar und **in der Sache anonym** — die Journalzeile trägt den eingetippten Ausleihernamen, nicht die Kennung des Angemeldeten (Entscheidung 7) |
| `e2e/radio-zugang.spec.ts` | gesperrter Code am Gate | benannte deutsche Meldung **am Feld** — nicht die stumme Landung des Bestands, und **kein** „server-side exception" |
| `e2e/radio-zugang.spec.ts` | Code sperren, während eine Sitzung läuft, dann neu laden | Umleitung **über den Abmelde-Route-Handler** mit benanntem Grund; dessen Antwort trägt `Set-Cookie` mit `Max-Age=0` und **ohne** `Domain=`; ein zweiter Aufruf landet danach ohne Umweg am Gate. Die Kette wird über das Antwortprotokoll geprüft, nicht nur über die Endadresse — sonst bliebe eine ungelöschte Cookie-Zeile grün |
| `e2e/radio-zugang.spec.ts` | gesperrter Code an einer **schreibenden** Action | deutsche Meldung am Formular, **kein Absturz**, und die eingetragenen Felder bleiben stehen |
| `e2e/radio-verwaltung.spec.ts` | angemeldet mit `RADIO_ADMIN_GRUPPE`: Gerät anlegen, ändern, Code ausstellen, Code sperren | die vier Flächen antworten mit 200; das Ausstellen und Sperren ist **nur** hier möglich (Entscheidung 7) |
| `e2e/radio-verwaltung.spec.ts` | angemeldet **ohne** Gruppe, dann `/admin` | 404 (die Suite-404-Seite, **nicht** 403), und **kein** Verwaltungs-Eintrag in der Navigation |
| `e2e/radio-verwaltung.spec.ts` | **ohne** Sitzung `/admin` | Umleitung nach `/login`; und im **selben** Test: `/` ist ohne Sitzung weiter erreichbar. Die zweite Hälfte ist die eigentliche Zusage — sie fängt den Riegel, der versehentlich im Modul-Layout landet (§8.2.4) |
| `e2e/radio-hosts.spec.ts` | die Host-Schleife | §8.4.3 |
| `e2e/radio-tabellen.spec.ts` | der Rundgang: je **Seite** ein echter Abruf mit Statusprüfung, je **Tabelle** zusätzlich eine Zelle | §8.4.2, §8.4.2.1 |

### 8.4.2 Je Seite ein echter Abruf — Fallen 1 und 7

**Die breitere Regel zuerst, denn sie kostet fast nichts und deckt zwei Fallen.** Falle 1
(Compound-Zugriff auf antd in einer Server Component ergibt HTTP 500, `CLAUDE.md:11-13`) und Falle 7
(`@ant-design/icons` in einer Server Component ergibt HTTP 500, `CLAUDE.md:31-44`) sind **berührt**:
`radio-admin` ist formularlastig — Geräte anlegen und ändern, Software-Versionen, Code-Ausstellung,
Import-Assistent —, und der Kiosk bringt `AdminLoginForm.tsx`, `SetupForm.tsx`, `BorrowerInput.tsx`
mit; `Form.Item`, `Input.TextArea`, `Descriptions.Item` und `Typography.Title` sind die Kandidaten.
Entlastend ist nur, dass `Card`, `Table`, `Tag`, `Statistic`, `Result` und `Progress` sicher sind — und
genau die tragen die Tabellenflächen. ⚠️ **Die Stellenzahl ist nicht gemessen** (anders als bei Falle 9,
wo 31 gezählt sind), es gibt hier also keine Sollzahl, gegen die man prüfen könnte.

Beide Fallen sind ein Laufzeit-500 „auf genau der Seite, die niemand im e2e anfährt". Daraus die
erste Regel, und sie ist die billigste des ganzen Kapitels:

> **Jede Seite**, die das Kapitel Verwaltungsoberfläche oder das Kapitel Kiosk baut, wird in
> `e2e/radio-tabellen.spec.ts` bzw. der zuständigen Spec-Datei **einmal echt abgerufen**, mit
> `expect(antwort.status()).toBe(200)`. Nicht `toBeVisible()`, nicht „irgendwas ist da" — der
> Statuscode, weil ein 500 keinen Inhalt hat und ein `toBeVisible()` dann in sein Zeitbudget läuft
> und sich als Timeout meldet, also nach etwas ganz anderem klingt (`CLAUDE.md:82-85`).

Ein Modul-Rundgang, der jede Seite genau einmal mit Statusprüfung anfährt, ist die einzige Absicherung
gegen Falle 1 und 7, die nicht von einer Stellenzählung abhängt, die niemand hat.

### 8.4.2.1 Je Tabelle zusätzlich eine Zelle — Falle 9

Falle 9 ist der teuerste Posten des Ports: `<Table columns={[{ render: fn }]}>` geht **nicht** direkt
aus einer Server Component (`CLAUDE.md:52-70`), und `radio-admin` trägt **31** `render`-Funktionen —
`radio-admin/client/src/features/devices/deviceColumns.tsx` **15**, `features/loans/LoanList.tsx` 5,
`features/settings/ApiTokensPage.tsx` 5, `features/settings/SoftwareVersionsPage.tsx` 4,
`features/import/ImportWizard.tsx` 2.

⚠️ **Die beiden Fünferlisten sind nicht dieselben, und daraus folgt eine Bauauflage.**
`deviceColumns.tsx` trägt 15 `render`-Funktionen und **kein** `<Table`; `DeviceList.tsx` trägt ein
`<Table` und **kein** `render:`. **Zusage an Kapitel Verwaltungsoberfläche:** beide gehören zusammen
in **EINE** `"use client"`-Insel. Werden sie getrennt portiert, wandern die 15 `render`-Funktionen
weiterhin als Prop über die RSC-Grenze und ergeben genau
`Error: Functions cannot be passed directly to Client Components` (`CLAUDE.md:55-57`).

**Die Regel, nicht die Liste** — weil dieses Kapitel nicht entscheidet, welche Flächen entstehen:

> Jede Tabellenfläche schuldet **über** den Seitenabruf aus §8.4.2 hinaus **eine Zusicherung auf eine
> Zelle, die aus einer `render`-Funktion entsteht**. Eine Tabellenfläche ohne diese Zelle gilt als
> nicht abgenommen — der Statuscode allein deckt Falle 9 **nicht**: eine `"use client"`-Insel, die
> ihre Daten korrekt bekommt, aber die Formatierung verloren hat, antwortet mit 200.

Sicher sind heute die Geräteliste (15 `render`), die Leihliste und die Software-Versionen. **Nicht**
zugesagt werden Zellen für `api_tokens` und den Import-Assistenten: Entscheidung 13 lässt `api_tokens`
nur wandern, „soweit Historie es verlangt", und ob es dafür eine Fläche gibt, entscheidet das Kapitel
Verwaltungsoberfläche. Eine hier versprochene Fläche, die nie entsteht, wäre ein Testplan, der beim
ersten Lesen falsch ist.

### 8.4.2.2 Die Höhe einer Zeile — Falle 8, die dieses Kapitel selbst scharf macht

§8.4.4 entscheidet, dass `/admin` in `FullShell` läuft. Damit ist neben Falle 12 auch **Falle 8**
berührt (`CLAUDE.md:45-51`): `antd/es/layout/style/index.js` setzt auf `.ant-layout-header` ein
`lineHeight` in Kopfzeilenhöhe (hier **64 px**), und die Kopfzeile vererbt das an **jedes** Kind —
`position: absolute` ändert den enthaltenden Block, **nicht** die Vererbungskette. Gemessen wurden 82 px
je Eintrag im Panel des App-Umschalters und 76 px am Auslöser, in einer 64 px hohen Kopfzeile.

**Kein anderes Tor kann das sehen, und der Grund ist zwingend:** antd spritzt die Regel zur Laufzeit
über cssinjs ein, sie steht in **keiner Datei des Repos**, und jsdom rechnet keine Zeilenboxen. Ein
Quelltext-Scan hat nichts zu greifen, ein Vitest kennt die Zahl nicht — nur ein echter Browser.

**Zusage: `e2e/radio-verwaltung.spec.ts` prüft in einem eigenen `it` die Höhe.** Verbindlich als
Verhältnis, nicht als Zahl: der `boundingBox().height` eines Eintrags im App-Umschalter-Panel ist
**kleiner als** die Höhe der Kopfzeile. Eine absolute Erwartung wie „44" wäre bei jeder Token-Änderung
rot ohne Produktfehler, also genau die Sorte Test, die weggekommentiert wird.
**Mutation, die ohne diesen Test grün bliebe:** `line-height: normal` am **gemeinsamen Vorfahren**
entfernen und stattdessen an jedes Kind einzeln schreiben — ein Kind vergisst man, und dieses eine ist
82 px hoch, während alle anderen stimmen.

### 8.4.3 Der Host-Riegel gegen EINEN `baseURL`

Playwright fährt gegen `http://portal.localtest.me:3100` (`playwright.config.ts:64`). Der Fall
„fremder Suite-Host" ist deshalb **nur** darstellbar, wenn die E2E-Konfiguration einen zweiten Host
mitführt und der Test dorthin **absolut** navigiert. Er wird **nicht neu eingeführt**:
`playwright.config.ts:155` wartet heute schon auf `http://feedback.localtest.me:3100/login`, und
`feedback` ist zugleich die schärfere Probe, weil `moduleForHost` dort tatsächlich ein Modul liefert
— ein Nicht-Modul-Host fiele über den Portal-Fallback heraus und bewiese weniger.

`e2e/radio-hosts.spec.ts` fährt eine **Schleife**, keine zwei Stichproben, weil Route Handler kein
Layout haben und die Sperre sie über kein Group-Layout erreicht. Geprüft wird über `fremdUrl(pfad)`:

| Abruf über `fremdUrl(…)` | Zusage |
|---|---|
| `/m/radio/` (Ausleihe-Wurzel) | 404 |
| die Einlöse-Route des Kapitels Zugang, mit **gültigem** Code | **404 vor jeder Wirkung** — und in `radio.db` trägt die Zeile dieses Codes danach **unverändert kein Nutzungsdatum**. Das ist die Zeile, die Falle 61 bezahlt, und sie wird mit `better-sqlite3` direkt gegen die Datei geprüft, nicht über die Oberfläche |
| der Abmelde-Route-Handler | 404, und das Cookie der laufenden Sitzung ist danach **unverändert** vorhanden |
| `/m/radio/admin` | 404 |
| `/m/radio/manifest.webmanifest` und die Icon-Handler | 404 |
| dieselben fünf Pfade über `radioUrl(…)` | 200 bzw. 303 — die Gegenprobe, ohne die die Schleife auch mit einem Riegel grün wäre, der **alles** verwirft |

⚠️ **Die Datenwirkung ist hier eine andere als bei `lagerbuch`, und die Analyse trägt an dieser
Stelle einen überholten Träger.** Sie begründet die Datenwirkung mit dem Enrollment („verbrennt den
Einmal-Code"); Entscheidung 5 hat Enrollment gestrichen — es gibt **kein Gerät und kein
Geräte-Enrollment**. Der verbleibende Träger ist die Einlösung nach Entscheidung 6: sie prägt eine
Sitzung und stempelt das Nutzungsdatum der Codezeile. Ein Treffer auf dem falschen Host legte das
Sitzungscookie auf der **falschen Herkunft** ab und schriebe dabei in `radio.db` — eine zweite
funktionierende Herkunft des Moduls, die in keinem Runbook steht. Der Code selbst bleibt einlösbar
(er ist nicht verbrauchbar), der Schaden ist die zweite Herkunft, nicht der verlorene Code.

⚠️ **Prüflücke, benannt statt übersehen:** diese Schleife prüft „**ein** fremder Suite-Host ist
dicht", nicht „**alle** sind es". Der Beweis für „alle" ist die Bauform des Prädikats (§8.2.3) plus
der Scan gegen einen `prodHostsFor`-Vergleich (§8.3). Ohne den zweiten Host in der Konfiguration ist
die Zeile mit der Datenwirkung **nicht durchführbar**, und dann trägt §8.2.3 die Aussage allein — das
ist ausdrücklich zu wenig.

### 8.4.4 Die drei Testfallen aus `CLAUDE.md` — und was sie für diesen Plan bedeuten

Fallen 10, 11 und 12 sind **Testfallen, keine Produktionsfallen** (`CLAUDE.md:112-114`). Sie gehören
zur Familie „ein e2e-Test misst etwas anderes, als sein Name sagt" — und das ist die teuerste Sorte,
weil sie rote Läufe **ohne** Produktfehler erzeugt und dann wegkommentiert wird.

**Falle 10 — Warmlauf-GET vor dem ersten POST (`CLAUDE.md:71-85`): berührt und scharf.** Ein POST auf
einen Route Handler kann während dessen Erstkompilierung abgebrochen werden; `net::ERR_ABORTED`,
`canceled: true`, **nie eine Antwort**. Das Symptombild führt in die Irre: keine Datenbankzeile, keine
Protokollzeile, der Test läuft in sein Zeitbudget und meldet etwas ganz anderes — isoliert grün, im
Verbund rot.

⚠️ **Der Träger, den die Analyse nennt, ist überholt:** sie begründet „scharf" mit dem
Enrollment-Handler, und Entscheidung 5 hat ihn gestrichen. Die **verbleibenden** Träger, alle drei
nach Entscheidung 6 zwingend Route Handler bzw. POST-Ziele:

1. **Der Abmelde-Route-Handler.** Er *muss* ein Route Handler sein — `cookies().delete()` wirft in
   einer Server Component (`src/app/m/lagerbuch/_lib/helferZugang.ts:121-126` schreibt die Messung
   aus, samt Fundstelle `next/dist/server/web/spec-extension/adapters/request-cookies.js:53`, die den
   Satz „Cookies can only be modified in a Server Action or Route Handler" wörtlich trägt). Er hat
   kein Layout und wird im Lauf als **erster** POST-artiger Treffer erreicht.
2. **Die Einlöse-Route am Gate.** Erster Treffer im ganzen Lauf, und sie hat Datenwirkung.
3. **Die Ausleih- und Rückgabe-Actions.** Server Actions sind POSTs auf eine Route, die vorher nie
   getroffen wurde.

**Verbindlich daraus, für jede der drei Stellen:** (i) ein **Warmlauf-GET auf dieselbe Route** vor dem
ersten echten POST — Vorbild `e2e/files-fileshare.spec.ts`, das dieselbe Falle für
`/api/download/[id]` längst kennt; (ii) **jede** ausgelöste Anfrage wird mit `page.waitForResponse`
**auf ihre Antwort** geprüft, nicht auf eine spätere Zustandsänderung. Ohne (ii) läuft jede abgelehnte
Antwort (404, 405, 413, abgebrochen) still ins Zeitbudget und meldet sich als etwas anderes.

**Falle 11 — `page.mouse` statt `dragTo()` (`CLAUDE.md:86-92`): nach Entscheidung dieses Kapitels
nicht berührt.** `locator.dragTo()` löst kein zuverlässiges natives `dragstart` aus; gemessen lief ein
Zug reproduzierbar in den vollen 90-Sekunden-Timeout, ohne dass je ein `drop` feuerte. Heute ist die
Falle in **keinem** der beiden Alt-Frontends berührt (`rg -ln "dragTo|onDragStart|draggable|dnd-kit|react-beautiful"`
über beide liefert 0 Treffer), aber `radio-admin/server/src/routes/softwareVersions.ts:40` bietet
`PATCH /software-versions/order`, also eine Sortierung, die sich als Ziehen bauen ließe.

**Entscheidung, damit die Falle nicht offenbleibt — Zusage an Kapitel Verwaltungsoberfläche: die
Reihenfolge der Software-Versionen wird mit Hoch/Runter-Knöpfen gebaut, nicht mit Ziehen.** Drei
Gründe, alle belegt: das Ziehen wäre die **einzige** Stelle im Modul, die Falle 11 scharf macht,
ohne dass eine Portierungspflicht es verlangt (die Alt-App zieht nicht); zwei Knöpfe sind auf einem
Telefon bedienbar, ein Zug ist es kaum, und `FullShell`-Inhalte tragen ohnehin `controlHeight: 44` als
WCAG-2.5.5-AAA-Ziel (`CLAUDE.md:19-22`); und die Sortierung wird selten benutzt.
**Falls das Kapitel Verwaltungsoberfläche sich dennoch für Ziehen entscheidet**, gilt ohne weitere
Diskussion: Prüfung über `page.mouse.move`/`down`/mehrfach `move` mit Pausen/`up`, **nie** über
`locator.dragTo()`.

**Falle 12 — `klickeWennRuhig` (`CLAUDE.md:94-110`): berührt, und zwar genau auf einem Ast.** Ein
`.click()` auf einen echten Anker navigiert nicht, wenn die Hülle zwischen `mousedown` und `mouseup`
umbricht; Playwright meldet den Klick als gelungen, der Knoten ist ein `<a href>`, er trägt danach
sogar den Fokus — und im Netzwerkteil steht für das Ziel **kein einziger** Aufruf. Auslöser ist
`SessionProvider`, der `/api/auth/session` nachholt; mit der Sitzung wechselt die Navigation von der
schmalen Platzhalter- auf die volle Spalte und der Inhalt rutscht ~240 px hoch. **Kein größeres
Zeitbudget und keine Wiederholung heilt das** — gewartet wird auf eine Navigation, die nie angestoßen
wurde. Lokal unsichtbar (warmes `.next`, 20 von 20 Mal grün).

**Zusage an Kapitel Verwaltungsoberfläche und Kapitel Kiosk, damit die Falle einen benannten Ort
hat:** `/admin` läuft in `FullShell` mit `SessionProvider`, die Ausleihe an `/` läuft **ohne Shell**
(sonst erbte sie `controlHeight: 44` statt 56/72). Der Registry-Wert entscheidet das nicht — bei
`lagerbuch` steht ein Wert in der Registry, und `src/app/m/lagerbuch/layout.tsx` rendert **gar keine**
Shell; ein Modul mit **zwei** Regimen auf einem Host ist durch **ein** Feld ohnehin nicht
beschreibbar. ⚠️ **Diese Entscheidung macht zwei Fallen scharf, nicht eine** — Falle 12 hier und
Falle 8 in §8.4.2.2; wer nur die eine bedenkt, hat die Hälfte. Daraus folgt für den Testplan:

* **Jeder Klick auf einen Navigations-Anker unter `/admin` läuft über `klickeWennRuhig`** aus
  `e2e/fixtures.ts:93` — nicht über `locator.click()`. Die Funktion klickt erst, wenn der Kasten des
  Elements **dreimal** in Folge stillsteht (drei, nicht zwei: der Sprung fällt in ein Fenster von
  ~200 ms, zwei Proben im Abstand von 100 ms könnten beide davor liegen).
* **Auf dem Ausleih-Ast wird `klickeWennRuhig` NICHT verwendet.** Dort gibt es keine `SessionProvider`-
  Hülle, also keinen Umbruch, und ein vorsorgliches Ruhewarten verdeckte einen echten Umbruch, statt
  ihn zu melden. Diese Zeile ist eine Zusage in beide Richtungen.
* **Jeder Login im Lauf geht über `devLogin` aus `e2e/fixtures.ts:3`**, mit `RADIO_ADMIN_GRUPPE` aus
  `e2e/helpers/radio.ts` — nie mit einem Literal. Das 45-Sekunden-Budget dort ist gemessen (13,7 s auf
  kaltem `.next` unter künstlicher Last; 0,3 s warm) und wird nicht gekürzt.

## 8.5 Was KEIN Test findet — die Liste, die ins Runbook wandert

Diese Liste ist die Gegenprobe zum ganzen Kapitel: alles, was nur ein echter Abruf gegen einen echten
Host, ein echter Dump, ein echtes Gerät oder ein Blatt Papier zeigt. Sie geht vollständig als
**Übergabe an Spec 2 (Runbook)**; jede Zeile nennt den Handgriff, der sie ersetzt.

| Befund | Warum kein Tor es sieht | Der Handgriff im Runbook |
|---|---|---|
| **Es gibt kein Parallelfenster.** Der Alt-Kiosk läuft **bereits** unter `radio.iuk-ue.de` (Entscheidung 3), der Origin bleibt zeichengleich | Alt-Kiosk und Suite können denselben Host nicht gleichzeitig halten. Kein Test kann einen Zustand prüfen, den es nicht gibt | Der Rückweg ist **„Router zurück"**, kein Rückschalten der Daten. Die Rollback-Frist und der Verlustumfang gehören ausgeschrieben ins Runbook |
| **Der pfaderhaltende `redirectRegex` von `radio-admin.iuk-ue.de` auf `radio.iuk-ue.de/admin`** (Entscheidung 2) | Er lebt **auf dem Server**, nicht im Repo. Kein Test des Repos fasst Traefik-Labels an; der Fehlfall ist eine funktionierende Seite mit falschem Inhalt | Eine Zeile im Runbook. ⚠️ **302, nicht 301** — ein 301 liegt im Cache jedes Tablets und macht den Rollback praktisch unmöglich. ⚠️ Der DNS-Eintrag `radio-admin.iuk-ue.de` **bleibt**, solange der Redirect steht: er ist die Abhängigkeit des Redirects, kein Abbau-Posten. ⚠️ Und der Alt-Host darf **nicht** in `SUITE_TRAEFIK_RULE` stehen — dann erreicht er den Container, kein `SUITE_HOST_*` beansprucht ihn, und `moduleForHost` liefert **portal** |
| **`/api/health/radio` antwortet `ok` gegen eine frisch angelegte, LEERE `radio.db`** | Der Healthcheck **ist** das Tor und ist grün. `checkModuleHealth` öffnet die Datei und führt `SELECT 1` aus; `src/core/db/index.ts:14` legt das Verzeichnis bei Bedarf **neu** an (`if (!existsSync(dir)) mkdirSync(dir, { recursive: true });`), und better-sqlite3 legt die Datei an, wenn sie fehlt. Ein vertipptes `DATA_DIR` oder ein nicht gemountetes Volume ergibt eine nagelneue leere Datenbank, auf der `SELECT 1` klaglos gelingt | Die Freigabe zählt: die **sechs** `COUNT(*)` aus Pflicht 4 (`devices`, `software_versions`, `api_tokens`, `users`, `device_events`, `loans`) gegen die Alt-Werte, **nie** `status:"ok"`. Und jeder Runbook-Schritt nennt `/api/health/radio`, **nie** `/api/health` — letzteres ist zwei Zeilen ohne Modulbezug (`src/app/api/health/[modul]/route.ts:12-17` begründet, warum nur der `[modul]`-Handler taugt) |
| **Der alte Service Worker liegt nach dem Umschwenk unter derselben Adresse** | Ein SW mit falschem Scope oder aus dem Cache liefert HTTP 200 mit **veraltetem** Inhalt. Kein Build-Schritt, kein Test, kein Healthcheck sieht das | ⚠️ **Hier verschärft Entscheidung 3 die Analyse:** dort stand „nur wenn der Alt-Kiosk bereits `radio.iuk-ue.de` bedient" — er tut es. Damit ist „alte Registrierung austragen" **nicht bedingt, sondern Pflicht**: `self.registration.unregister()` im Ersatz-SW **und** je Gerät einmal Speicher löschen, im selben Handgriff. Manifest, SW und Icons liegen als Route Handler **unter** `src/app/m/radio/` — nie global, sonst bewirbt jeder Suite-Host eine radio-PWA |
| **Ein konsistenter Mapping-Fehler ist paritätsgrün** | Strukturell: `scripts/import/parity.ts:43-56` vergleicht Zeilen-Hashes, und **beide Arme leiten aus derselben Funktion** ab (`scripts/import/portal.ts:72-75`) | Feldweise Stichproben gegen die Alt-Anwendung, zeilengenau, für die vier verwechselbaren Paare: `issi`↔`tei`, `created_at`↔`updated_at`↔`last_updated_at`, `snapshot_call_sign`↔`borrower_name`, `alamos_integrated`↔`loanable`; dazu `serial_number`↔`hiorg_id`↔`opta`. Plus die fünf Abfragen **vor** dem Import, darunter `SELECT COUNT(*) FROM software_versions WHERE is_target = 1` (**muss genau 1 sein**) und `SELECT MIN(created_at), MAX(created_at) FROM devices` (dreizehnstellig = Millisekunden) |
| **Gedruckte QR-Kärtchen verlieren still ihre Funktion** | Entscheidung 8: der heutige QR-Code trägt den geteilten API-Token base64-kodiert als URL-Parameter (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`), ohne Ablauf und ohne Widerruf. Nichts im Repo weiß, wie viele Kärtchen im Umlauf sind | **Verhaltensänderung mit Ankündigungspflicht.** Zusätzlich: die ausgedruckten Codes zeigen dauerhaft auf den Host des **erzeugenden Browsers**, weil die URL aus `window.location.origin` entsteht und `VITE_PUBLIC_APP_URL` im Repository von **nichts** gesetzt wird (`AppQRCode.tsx:8`) |
| **Ob gedruckte Aufsteller im Umlauf sind** ⚠️ **zu bestätigen** | Papier ist für jedes Tor unsichtbar | Betreiberfrage vor dem Cutover. Von der Antwort hängt ab, ob der Umstieg eine Neuausgabe braucht oder ob die neuen Codes nur digital verteilt werden |
| **Die Sitzungsdauer** ⚠️ **zu bestätigen** (Vorschlag 12 h wie `lagerbuch`) | Kein Test wartet 12 Stunden; die Zahl ist eine Betriebsentscheidung, keine Rechnung | Eine `.env`-Zeile. Der Unit-Test prüft die **Grenze relativ zum konfigurierten Wert** (§8.2.2) |
| **Ob der Benutzername beim Zugang über die Suite vorausgefüllt wird** ⚠️ **zu bestätigen** | Optional nach Entscheidung 7; die Ausleihe bleibt in der Sache anonym | Betreiberfrage. Der DOM-Test prüft die **Überschreibbarkeit**, nicht die Existenz der Vorbelegung (§8.2.7) |
| **„Betroffen < 100 Leihen"** ist eine **Schätzung, keine Zählung** (Entscheidung 12) | Die lokale `radio-admin/data/data.sqlite` ist leer und führt `loans` überhaupt nicht — als Prod-Beleg unbrauchbar | `SELECT COUNT(*) FROM loans WHERE returned_at IS NOT NULL AND returned_at < <grenze>;` gegen den echten Dump, **vor** dem ersten Retention-Lauf |
| **Der produktive Wert von `SUITE_ADMIN_GROUP_RADIO`** | Betreiberentscheidung; E2E fährt den Registry-Vorgabewert. ⚠️ Ein falscher Wert macht den Lauf **grün** — er bezeugt dann den 404 und sieht wie ein bestandener Test aus | Eine `.env`-Zeile beim Cutover, und die Gegenprobe „ein Admin sieht die Verwaltung wirklich" ist ein **Handgriff**, kein Test |
| **Die CWE-348-Umstellung in `src/core/ratelimit.ts`** | **Nicht Teil dieser Spec** — eigener Suite-Posten. Hier nur als **Voraussetzung** benannt: solange sie offen ist, lässt sich die Absenderbremse am Einlöse-Gate nicht wahrheitsgemäß prüfen, weil die Absenderadresse selbst nicht vertrauenswürdig aufgelöst wird | Reihenfolge im Plan: die Umstellung geht dem Gate-Rate-Limit voraus. Ein Test, der heute darauf aufsetzt, wäre grün und bedeutungslos |

Ebenfalls ausdrücklich **nicht** Teil dieses Kapitels und nur benannt: `TZ=Europe/Berlin` setzen, das
Entfernen des Suite-Admin-Kurzschlusses in `src/core/groups.ts`, das suiteweite Gating von `/m/*`.
Alle drei sind eigene Suite-Posten. Für den Testplan folgt daraus nur eines: **kein Test dieses Moduls
darf auf einer dieser drei Änderungen aufsetzen** — sonst ist er heute grün aus dem falschen Grund
und morgen rot ohne Produktfehler.

## 8.6 Die Mutationsprobe als Verfahren

Die Spalte „Mutation, die ohne den Test grün bliebe" ist keine Prosa, sondern eine Arbeitsanweisung.
Im Projekt sind mehrfach grüne, leere Suiten aufgefallen; das Verfahren dagegen ist billig:

1. **Nach dem Grünwerden**, nicht davor: für jedes Pflichtstück wird **jede** in seiner Zeile genannte
   Mutation einzeln in den Arbeitsbaum gelegt, `pnpm vitest run <datei>` bzw.
   `pnpm exec playwright test <spec>` gefahren, das **rote** Ergebnis notiert und die Mutation
   verworfen (`git checkout -- <datei>`). Nichts davon wird committet.
2. **Ein Test, der eine genannte Mutation überlebt, wird gelöscht oder neu geschrieben** — nicht
   ergänzt. Ein ergänzter vakuöser Test bleibt vakuös und trägt danach zwei Namen.
3. **Die Probe ist im Plan ein eigener Arbeitsschritt je Pflichtstück**, mit dem Ergebnis in der
   Aufgabenbeschreibung. Sie steht **nicht** in der CI: sie ist einmalig und beweist die Güte des
   Tests, nicht die des Produkts.

**Die Pflichtstücke, die diese Probe zwingend durchlaufen** — sieben, und für jedes ist die
schlimmste Mutation oben ausgeschrieben:

| Pflichtstück | Ort | Die Mutation, die am teuersten wäre |
|---|---|---|
| Zeitstempel-Abbildung | §8.2.1 | `?? 0` für `returned_at` — aus aktiven Leihen werden gelöschte |
| Code-Einlöser | §8.2.2 | DB-Recheck aus dem Lesepfad entfernen — ein gesperrter Code liest weiter |
| Host-Riegel, drei Formen | §8.2.3 | der „kein Prod-Host → durchlassen"-Zweig — die Sperre schaltet sich vor dem Cutover selbst ab |
| Pfad-Riegel `/admin` | §8.2.4 | `isModuleAdmin` — jeder Suite-Betreiber verwaltet mit, und die E2E bleibt grün |
| Retention-Auswahl | §8.2.5 | `IS NOT NULL` streichen — jede laufende Ausleihe verschwindet |
| Ausfall-Puffer | §8.2.6 | den Puffer-Summanden entfernen — der naive Port, grün in jedem Test |
| Guard-Scan der Actions | §8.3 | eine Action ohne Guard hinzufügen; der Scan muss rot werden, nicht die Ausnahmeliste wachsen |

## 8.7 Zusagen dieses Kapitels an andere Kapitel

Vollständig, damit die Zusammenführung sie gegeneinander prüfen kann. Die Nummern der Teile stehen
erst bei der Zusammenführung fest; die Kapitel werden hier deshalb bei ihrem **Gegenstand** genannt —
eine geratene Nummer führte die Gegenprüfung aktiv in die Irre, ein Gegenstand nicht.

1. **Zusage an Kapitel Zugang:** die drei Ablehnungsgründe sind **eine** exportierte, benannte
   Literal-Union `ZugangGrund = "unbekannt" | "gesperrt" | "abgelaufen"` — kein `boolean`, kein Wurf,
   keine Zeichenkette. Vorbild `src/app/m/lagerbuch/_lib/helferZugang.ts:63`. Ohne sie ist §8.2.2
   nicht durchführbar.
2. **Zusage an Kapitel Zugang:** die Abmeldung ist ein **Route Handler**, und der Host-Riegel steht in
   `requireKioskZugang`, `requireKioskSchreibend` und `requireRadioAdmin` **innen**, als erste
   Anweisung. §8.2.4 und §8.3 prüfen genau das.
3. **Zusage an Kapitel Datenmodell und Import:** die sieben Signaturen aus §8.2.1 sind exportiert und
   **rein** (Zeit als Parameter, keine Uhr, keine Datenbank), und `pruefeMs` wirft mit Feldnamen.
4. **Zusage an Kapitel Datenmodell und Import:** die Retention-Auswahl ist eine reine Funktion,
   getrennt von der Ausführung, und **nichts am Boot-Pfad** ruft sie (§8.2.5, Scan in §8.3).
5. **Zusage an Kapitel Verwaltungsoberfläche:** `deviceColumns.tsx` und `DeviceList.tsx` werden zu
   **EINER** `"use client"`-Insel — sonst wandern die 15 `render`-Funktionen weiterhin als Prop über
   die RSC-Grenze (§8.4.2.1).
6. **Zusage an Kapitel Verwaltungsoberfläche:** die Reihenfolge der Software-Versionen wird mit
   Hoch/Runter-Knöpfen gebaut, nicht mit Ziehen — damit bleibt Falle 11 unberührt (§8.4.4).
7. **Zusage an Kapitel Verwaltungsoberfläche und Kapitel Kiosk:** `/admin` läuft in `FullShell` mit
   `SessionProvider` — damit sind **Falle 12** (→ `klickeWennRuhig`) und **Falle 8** (→ die
   Höhenprüfung aus §8.4.2.2, als Verhältnis) scharf. Die Ausleihe an `/` läuft **ohne Shell**: Falle
   12 unberührt (**kein** `klickeWennRuhig`), Falle 8 unberührt (keine Kopfzeile), und sie behält
   56/72 statt `controlHeight: 44`.
8. **Zusage an Kapitel Verwaltungsoberfläche und Kapitel Kiosk:** **jede** Seite schuldet einen echten
   Abruf mit `expect(antwort.status()).toBe(200)` (Fallen 1 und 7), jede Tabellenfläche zusätzlich eine
   Zelle aus einer `render`-Funktion (Falle 9) — §8.4.2 und §8.4.2.1.
9. **Zusage an Kapitel Kiosk:** der Ausfall-Puffer von fünf Minuten ist eine **Konstante im
   Modulcode** mit eigenem Test, keine Eigenschaft eines `fetch` (§8.2.6).
10. **Zusage an Kapitel Betrieb und Cutover / Spec 2:** die Tabelle aus §8.5 wandert vollständig ins
   Runbook, Zeile für Zeile, mit dem jeweils genannten Handgriff.
11. **Zusage an alle Kapitel:** `e2e/helpers/radio.ts` ist die **eine** Quelle für Host, Fremdhost,
    Admin-Gruppe, Port und die zwei Testcodes. Kein Literal daneben — der Fehlerfall ist ein grüner
    Lauf, nicht ein roter.
