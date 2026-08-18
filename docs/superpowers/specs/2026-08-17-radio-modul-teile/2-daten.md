# 2. Datenmodell, Migrationen, Zeitstempel und Retention

## 2.1 Der Zuschnitt der Datenhaltung

`radio` führt **eine** SQLite-Datei, `radio.db`, für **beide** Domänen — Verwaltung an `/admin` und
Ausleihe an `/`. Der Pfad entsteht wie bei jedem Modul aus `moduleDbPath("radio")` →
`${DATA_DIR}/radio.db` (`src/core/db/index.ts:8-10`); im Container ist `DATA_DIR=/data`
(`Dockerfile:40`).

Das ist nicht Bequemlichkeit, sondern die **strukturelle Voraussetzung für Entscheidung 15**: die sechs
`/v1`-Routen aus `radio-admin/server/src/routes/loanApi.ts` dürfen erst als HTTP-Grenze fallen, wenn
Ausleihe und Rückgabe Drizzle-Aufrufe **im selben Prozess auf derselben Verbindung** sind. Zwei
Datenbanken hätten die Grenze nur verschoben (Postgres → zweite SQLite).

**Zum Ausfall-Puffer `STALE_GRACE_MS = 5 * 60_000`**
(`radio-inventar/apps/backend/src/modules/radio-admin/radio-admin.service.ts:48`): er wird nach
Entscheidung 15 als **Fachlichkeit** mitgenommen — die Datenseite sagt dazu nur, dass er **keine Spalte,
keine Tabelle und kein Zwischenspeicher-Artefakt** in `radio.db` braucht. Das ist keine Absage: der
Puffer hält Ausleihe, Rückgabe und Historie bei kurzer Störung bedienbar, und beim naiven Port fiele er
weg. *Zusage an das Kapitel, das Ausleihe, Rückgabe und Historie entwirft: das Verhalten gehört dorthin,
das Schema stellt ihm nichts bereit und nimmt ihm nichts.*

Die Verbindung kommt aus dem gewöhnlichen `getModuleDb` — **kein** eigener Opener:

```ts
// src/app/m/radio/_db/client.ts
// KEIN "use client" (Falle 6): diese Datei wird ausschliesslich serverseitig gelesen.
import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export function getDb() {
  return getModuleDb("radio", schema);
}

export type DB = ReturnType<typeof getDb>;
```

**Warum kein `client.ts` in der `lagerbuch`-Bauform** (`src/app/m/lagerbuch/_db/client.ts:1-45`):
`lagerbuch` braucht einen eigenen Opener allein, weil es eine benutzerdefinierte SQLite-Funktion
`lb_falte` registrieren muss — die Suche faltet dort in **SQL**. Die Suche des Kiosk faltet in
**JavaScript** (`radio-inventar/apps/frontend/src/lib/device-filter.ts:24-31`, NFD +
Diakritika-Entfernung + ß→ss), und der Gerätebestand ist klein genug, dass sie das weiter tun kann.

> **Zusage an Kapitel 3 und an das Kapitel, das die Geräte-Übersicht und die Rückgabesuche entwirft:**
> die Faltung bleibt in JS, deshalb reicht `getModuleDb`. **Wird die Suche in SQL gezogen** (`LIKE`
> gegen eine gefaltete Spalte oder gegen eine SQLite-Funktion), kippt diese Entscheidung und `radio`
> braucht einen eigenen Opener nach `lagerbuch`-Muster — dann fällt außerdem der Ausschluss aus
> `seedAllModules()` aus §2.9 mit einer **zweiten** Begründung zusammen (`getModuleDb` kennte die
> Funktion nicht).

Die vier Pragmas (`journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`,
`synchronous = NORMAL`) setzt `openModuleDatabase` (`src/core/db/index.ts:12-22`). **`foreign_keys = ON`
ist scharf** — der eine Fremdschlüssel dieses Schemas (§2.5.4) wird durchgesetzt, und damit ist die
Einfügereihenfolge des Importers (§2.8.2) Pflicht, nicht Stil.

## 2.2 Zeitstempel: Millisekunden in der Quelle, Sekunden im Ziel

### 2.2.1 Die Einheit ist entschieden: Sekunden

**Alle** Zeitstempelspalten von radio-admin sind epoch-**Millisekunden**; belegt ist das an jedem
einzelnen Schreibpfad, nicht am Schema: `devices.created_at/updated_at`
(`radio-admin/server/src/repos/deviceRepo.ts:13`, `:78`), `device_events.changed_at`
(`deviceRepo.ts:230`), `software_versions.created_at`
(`radio-admin/server/src/repos/softwareVersionRepo.ts:36`, `:53`), `users.last_seen_at`
(`radio-admin/server/src/repos/userRepo.ts:12`), `loans.borrowed_at/returned_at/created_at/updated_at`
(`radio-admin/server/src/repos/loanRepo.ts:75`, `:104`). Im Schema steht es **nur** für `loans`
(`radio-admin/server/src/db/schema.ts:103-104`: „`borrowed_at`/`returned_at` are epoch-ms").

Das Ziel ist `integer(mode: "timestamp")`, und das speichert Unix-**Sekunden**. Kein Suite-Modul weicht
davon ab (`src/app/m/feedback/_db/schema.ts:22`, `src/app/m/lagerbuch/_db/schema.ts:409`,
`:414`), und `scripts/import/portal.ts:66-71` trägt die Normalisierung mit Begründung bereits vor.
`radio` weicht **nicht** ab: eine Millisekundenspalte in `radio.db` wäre die einzige der Suite, und
jede spätere Wiederverwendung eines core-Bausteins (Retention, Export, Anzeige) müsste die Ausnahme
kennen.

**Der Preis ist die Falle**, und sie ist im Zielsystem gefährlicher als in der Quelle: ein
Faktor-1000-Fehler ist **paritätsgrün** — `scripts/import/parity.ts:43-56` vergleicht Multimengen von
Zeilen-Hashes, und `portal.ts:73-76` schreibt selbst hin, dass **beide Paritätsarme aus derselben
Mapping-Funktion** ableiten. `docs/runbooks/lagerbuch-cutover.md:411` sagt denselben Satz in einer
Zeile: „⚠️ Ein Faktor-1000-Fehler ist paritätsgrün."

Und er ist **datenvernichtend**, sobald die Retention läuft: mit `returned_at` in Sekunden landet jeder
Wert im Jahr 1970, also weit unter jedem Cutoff. In radio-admin genügte dafür der **nächste Boot**
(`radio-admin/server/src/index.ts:35` → `startRetentionSchedule` → `retentionService.ts:47` `purge()`
**vor** dem Timer). Wie §2.7 den Purge aus dem Boot herausnimmt, ist die direkte Antwort darauf.

### 2.2.2 Drei Verteidigungslinien, in dieser Reihenfolge

1. **Empirisch, vor dem Import** (Abfrage 5 aus §2.8.3): `SELECT MIN(created_at), MAX(created_at) FROM
   devices;` — dreizehnstellig heißt Millisekunden. Das ist die einzige Prüfung, die die *Quelle*
   befragt statt den Code.
2. **Ein Riegel in der Mapping-Funktion selbst.** `radio-admin/server/src/import/commit-service.ts:45-47`
   nimmt jede numerische Zeichenkette nur mit `Number.isFinite`, **ohne Plausibilitätsspanne** — so
   passiert `"1700000000"` (Sekunden) wörtlich. Der neue Mapper **wirft** statt zu übernehmen.
3. **Der Unit-Test mit je Feld unterschiedlichen Fixture-Werten** (§2.2.5). Er ist die *zweite* Linie,
   nicht die erste, und er ist die einzige, die auch eine **Feldvertauschung** fängt.

### 2.2.3 `devices.last_updated_at` wird eine TEXT-Datumsspalte

`devices.last_updated_at` ist in der Quelle `integer`, nullable, epoch-ms
(`radio-admin/server/src/db/schema.ts:18`) — semantisch aber ein reines **Kalenderdatum**, und die drei
Schreibwege sind sich über die Zeitzone uneinig:

| Schreibweg | Beleg | tatsächlich gespeichert |
|---|---|---|
| CSV-Import | `commit-service.ts:40-56` (`isoToUtcMs` → `Date.UTC(y, m-1, d)`) | **UTC**-Mitternacht |
| Verwaltungsformular | `radio-admin/client/src/features/devices/DeviceFields.tsx:163-164` (antd `DatePicker`) → `DeviceFormModal.tsx:63` / `DeviceEditForm.tsx:61` (`values.lastUpdatedAt.valueOf()`) | **lokale** Mitternacht = 22:00/23:00 UTC des **Vortags** |
| Update-Karte | `radio-inventar`-fremder Pfad: `radio-admin/client/src/features/update/UpdateDeviceCard.tsx:24` (`lastUpdatedAt: Date.now()`) | echte **Uhrzeit** |
| CSV-Export | `radio-admin/server/src/routes/export.ts:49-51` (`toISOString().slice(0,10)`) | liest als **UTC** |

Serverseitig ist nichts davon geschützt: `radio-admin/shared/src/schemas.ts:29`, `:61`, `:87`
typisieren `z.number().int().nullable()` ohne `min`/`max`.

**Entscheidung: `text("last_updated_at")` im Format `YYYY-MM-DD`, nullable.** Begründung, in dieser
Ordnung:

* Sie löst den Zeitzonenkonflikt **strukturell** statt durch Disziplin. Eine Integer-Spalte verlangt,
  dass jeder künftige Schreibweg dieselbe Mitternachtskonvention einhält — genau die Zusage, die die
  Quelle in drei Wegen dreimal anders gehalten hat.
* Sie hängt **nicht** an `TZ=Europe/Berlin`. Das Setzen von `TZ` ist ausdrücklich ein eigener
  Suite-Posten und nicht Teil dieser Spec; eine Spalte, deren Richtigkeit von einer
  Prozess-Umgebungsvariable abhängt, die woanders gesetzt wird, ist eine stille Kopplung.
* Der CSV-Export wird trivial und rundlauffest: die Zelle **ist** der Spaltenwert, kein
  `new Date(...)`-Umweg, also auch kein zweiter Ort, an dem eine Zeitzone entscheidet.
* Der Verlust ist benannt und klein: der Uhrzeitanteil, den **ein** Schreibweg
  (`UpdateDeviceCard.tsx:24`) versehentlich mitschreibt. Er wird heute nirgends angezeigt — der Export
  schneidet ihn ab (`export.ts:49-51`), und die Anzeige ist ein Datum.

**Der Import konvertiert in `Europe/Berlin`, nicht in UTC.** Der Diskriminator ist nachrechenbar: eine
UTC-Kürzung ist für **einen** der drei Schreibwege richtig (CSV-Import) und für die anderen zwei falsch
(Formularwerte rutschen einen Tag zurück, `Date.now()`-Werte abends ebenfalls). Eine Berlin-Kürzung ist
für **alle drei** richtig — UTC-Mitternacht ist in Berlin 01:00/02:00 desselben Tages, lokale
Mitternacht ist per Konstruktion derselbe Tag, und eine echte Uhrzeit ergibt den Berliner Kalendertag.
Dass der heutige CSV-Export für Formularwerte einen Tag zu früh anzeigt, ist der **Fehler**, den die
Analyse als Fehler benennt, nicht das zu erhaltende Verhalten.

> **Zusage an das Kapitel, das die Geräteverwaltung an `/admin` entwirft:** `last_updated_at` ist
> `string | null` im Format `YYYY-MM-DD`. Das Formular übergibt die **Zeichenkette**
> (`dayjs(...).format("YYYY-MM-DD")`), nie einen Zeitstempel; die Server Action nimmt
> `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()`. Der CSV-Export gibt die Zelle unverändert
> weiter. Wer einen `DatePicker` an einen `number` bindet, hat den Zeitzonenkonflikt zurückgeholt.

### 2.2.4 Die Mapping-Funktionen — `scripts/import/radio.ts`

`scripts/import/` enthält heute genau `feedback-time.ts`, `feedback.ts`, `parity.ts`, `portal.ts`
(plus je einen Test und `fixtures/`) — **kein `lagerbuch.ts`, kein `radio.ts`**. `radio.ts` **muss**
ins Repo: nur eine committete Mapping-Funktion ist testbar, und nur der Test fängt den
Faktor-1000-Fehler (`docs/radio-portierung-analyse.md:764-774`).

```ts
// scripts/import/radio.ts  (Auszug: die Zeitachse)

/**
 * Plausibilitaetsspanne fuer epoch-MILLISEKUNDEN. 1e12 = 2001-09-09, 4e12 = 2096-10-02.
 * Jeder echte radio-admin-Wert liegt in dieser Spanne; ein Sekundenwert (~1.7e9) liegt
 * darunter und WIRFT, statt als 1970 durchzulaufen. Das ist der Riegel, der
 * `commit-service.ts:45-47` fehlt.
 */
const MS_MIN = 1_000_000_000_000;
const MS_MAX = 4_000_000_000_000;

export function msZuDatum(feld: string, ms: number): Date {
  if (!Number.isFinite(ms) || !Number.isInteger(ms)) {
    throw new Error(`${feld}: kein ganzzahliger Zeitstempel (${ms})`);
  }
  if (ms < MS_MIN || ms > MS_MAX) {
    throw new Error(
      `${feld}: ${ms} liegt ausserhalb der Millisekunden-Spanne — Sekunden statt Millisekunden?`,
    );
  }
  return new Date(ms);
}

export function msZuDatumOptional(feld: string, ms: number | null | undefined): Date | null {
  return ms === null || ms === undefined ? null : msZuDatum(feld, ms);
}

/**
 * epoch-ms → Berliner Kalendertag `YYYY-MM-DD` (§2.2.3). Die Zone steht HIER, nicht in
 * `TZ`: das Setzen von `TZ=Europe/Berlin` ist ein eigener Suite-Posten, und diese Funktion
 * muss auch ohne ihn richtig rechnen. `formatToParts` statt einer Locale-Formatzeichenkette,
 * weil die Reihenfolge der Teile so nicht von Locale-Daten abhaengt.
 */
const BERLIN = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function tagInBerlin(feld: string, ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null;
  const d = msZuDatum(feld, ms);
  const t = Object.fromEntries(BERLIN.formatToParts(d).map((p) => [p.type, p.value]));
  return `${t.year}-${t.month}-${t.day}`;
}
```

Die Zeilen-Mapper daneben (`toNeuesGeraet`, `toNeueSoftwareVersion`, `toNeuenBenutzer`,
`toNeuesGeraeteEreignis`, `toNeueLeihe`) sind reine Funktionen `AltZeile → New<Tabelle>` und rufen
ausschließlich die drei Funktionen oben. Zwei Sonderfälle stehen dort:

* `toNeuesGeraeteEreignis` prüft `source` gegen die vier bekannten Werte und **wirft** bei allem
  anderen. `device_events.source` ist in Drizzle ein Enum
  (`radio-admin/server/src/db/schema.ts:96`), in SQL aber nur `` `source` text NOT NULL `` — die DB
  akzeptiert jeden String, und ein fünfter Wert passiert Datenbank und Typprüfung unbeanstandet und
  bricht erst in einem erschöpfenden Switch der Oberfläche.
* `alamos_integrated` und `loanable` sind zwei 0/1-Integer, die sich verwechseln lassen, ohne dass es
  auffällt (`radio-admin/server/src/db/schema.ts:29`, `:32`). Der Mapper liest sie namentlich, nie
  positionell.

**Die Paritätssicht rechnet auf Sekunden zurück** — beide Arme, sonst scheitert ein
zeichengleicher Import allein an Präzision (`scripts/import/portal.ts:64-71`):

```ts
export function paritaetsSichtGeraet(r: NeuesGeraet | Geraet) {
  return {
    // … alle 25 Spalten namentlich, keine Auswahl …
    lastUpdatedAt: r.lastUpdatedAt ?? null,          // TEXT, keine Umrechnung
    createdAt: sekunden(r.createdAt),
    updatedAt: sekunden(r.updatedAt),
  };
}
const sekunden = (d: Date | null) => (d ? Math.floor(d.getTime() / 1000) : null);
```

### 2.2.5 Der Test, der den Faktor-1000-Fehler fängt

`scripts/import/radio.test.ts`. **Jedes Zeitfeld einer Zeile trägt einen anderen Fixture-Wert** —
sonst ist der Test vakuös: gleiche Werte bestehen jede Vertauschung, und eine durchgängige Division
durch 1000 hasht beidseitig gleich.

```ts
const ALT_GERAET = {
  id: "g-1",
  issi: "1234567",          // ≠ tei
  tei: "7654321",           // ≠ issi
  serial_number: "SN-001",
  hiorg_id: "HO-002",
  opta: "OPTA-003",
  alamos_integrated: 1,     // ≠ loanable
  loanable: 0,              // ≠ alamos_integrated
  created_at: 1_735_689_600_000,      // 2025-01-01T00:00:00Z
  updated_at: 1_738_368_000_000,      // 2025-02-01T00:00:00Z
  last_updated_at: 1_740_787_200_000, // 2025-03-01T00:00:00Z
  // …
};
```

Die Testnamen, verbindlich:

| Test | fängt |
|---|---|
| `toNeuesGeraet: jedes Zeitfeld behaelt SEINEN Wert in Millisekunden` (`getTime()` je Feld exakt gegen die drei Konstanten, plus `getUTCFullYear() === 2025`) | Faktor 1000 (1970) **und** Vertauschung von `created_at`/`updated_at`/`last_updated_at` |
| `msZuDatum wirft bei einem Sekundenwert (1735689600)` | die offene Übernahme aus `commit-service.ts:45-47` |
| `msZuDatum wirft bei 0 und bei null-artigen Werten in einer NOT-NULL-Spalte` | „fehlender Zeitstempel" als 1970 |
| `tagInBerlin: 2026-08-16T22:00:00Z (Formular-Mitternacht) ergibt 2026-08-17` | die UTC-Kürzung, die den Tag zurückschiebt |
| `tagInBerlin: 2026-08-17T00:00:00Z (CSV-Weg) ergibt 2026-08-17` | die Gegenrichtung |
| `tagInBerlin: 2026-08-17T14:35:00Z (Date.now()-Weg) ergibt 2026-08-17` | die dritte Semantik |
| `toNeueLeihe: snapshot_call_sign und borrower_name werden nicht vertauscht` | das Paar aus Pflicht 4 der Analyse |
| `toNeuesGeraet: alamos_integrated und loanable werden nicht vertauscht` | die zwei 0/1-Integer |
| `toNeuesGeraeteEreignis wirft bei source="importiert"` | der fünfte Enum-Wert ohne DB-CHECK |
| `paritaetsSichtGeraet liefert Sekunden fuer beide Arme` | Paritätsrot allein aus Präzision |
| `Import ist asymmetrisch idempotent: Zielzeile geaendert, erneut importiert` | §2.8.4 |

⚠️ Ein Test, der **zweimal dieselbe Quelle** importiert, ist bei Upsert-per-Primärschlüssel **immer**
grün und beweist nichts (`docs/radio-portierung-analyse.md:1292-1301`). Der letzte Test der Tabelle
stellt den asymmetrischen Fall her.

## 2.3 Bestandsaufnahme: was aus radio-admin herüberkommt

Die Quelle ist `radio-admin/server/src/db/schema.ts` (137 Zeilen) plus die fünf Migrationen unter
`radio-admin/server/drizzle/`. Sie führt **sechs Tabellen mit 61 Spalten**:

| Tabelle | Spalten | wandert? |
|---|---|---|
| `devices` | 25 | ja, vollständig |
| `software_versions` | 6 | ja, vollständig (inkl. der toten `created_by`, §2.10) |
| `users` | 3 | ja, 1:1 (§2.10) |
| `device_events` | 8 | ja, vollständig |
| `loans` | 11 | ja, vollständig |
| `api_tokens` | 8 | **nein** (§2.10) |

Vier gemessene Eigenschaften der Quelle, die das Zielschema bindend prägen:

1. **Genau ZWEI SQL-`DEFAULT`s**, beide aus `0002_numerous_mandroid.sql`
   (`software_versions.sort_order` und `software_versions.is_target`). Über alle fünf Migrationen
   erscheint das Schlüsselwort sonst nirgends. Jede `id` bekommt ihren Wert aus `$defaultFn(newId)`
   **in der Anwendung** (`radio-admin/server/src/db/schema.ts:5`, `:44`, `:60`, `:87`, `:120`);
   `created_at`/`updated_at` haben nirgends `CURRENT_TIMESTAMP`. **Folge für den Import: jede Zeile
   muss `id` UND Zeitstempel selbst mitbringen.**
2. **Genau EIN Fremdschlüssel:** `device_events.device_id → devices.id ON DELETE CASCADE`
   (`radio-admin/server/src/db/schema.ts:88-90`; in `0000` die einzige `FOREIGN KEY`-Zeile aller fünf
   Migrationen).
3. **Null Trigger, null CHECK-Constraints.** `rg -rn "CREATE TRIGGER|CHECK *\("` über
   `radio-admin/{server,shared,client,scripts,docker}` liefert 0 Treffer. Die `lagerbuch`-Präzedenz
   „`onConflictDoUpdate` bricht an Append-only-Triggern" trifft hier **nicht** zu.
4. **Sieben Indizes**, davon einer **partiell** und für `drizzle-kit` unsichtbar (§2.6).

**Alle Primärschlüssel sind `text`** — `newId()` bzw. bei `users` der OIDC-`sub`
(`radio-admin/server/src/db/schema.ts:79`). Sie werden **1:1 übernommen**, wie `scripts/import/portal.ts:36`
es vormacht. Es gibt keinen Grund und keine Möglichkeit, sie neu zu vergeben: `loans` und
`device_events` zeigen darauf, und die `sub`s stehen in sechs Auditspalten.

**Die FK-Freiheit von `loans.device_id` ist eine Zusage, keine Nachlässigkeit.** Sie steht im Quelltext
begründet (`radio-admin/server/src/db/schema.ts:106-110`): „returned loans are retained as history and
must outlive a later device deletion (a cascade FK would wipe that history; a restrict FK would block
deleting a device that merely has old returned loans). Historical accuracy is provided by the immutable
display snapshot copied at borrow time, not by a live join." **Pflicht: diesen FK nicht „der Ordnung
wegen" nachziehen.** Mit `CASCADE` löscht die erste Geräteausmusterung die Historie, mit `RESTRICT`
blockiert jede alte Rückgabe das Ausmustern. `devices`↔`device_events` und `devices`↔`loans` sehen
gleich aus und sind **gegensätzlich**: das erste Paar **ist** ein Cascade-FK und muss einer bleiben.
Dasselbe gilt für die Auditspalten: **kein FK auf `users.sub`** — er bräche jeden Kaltimport, dessen
`sub`-Werte in der Suite noch nie eingeloggt waren, also alle.

## 2.4 Der Zugang: welche Spalten der Ausleihweg braucht

Kapitel 3 entwirft die Semantik (Codeformat, Einlöseweg, Sitzungsdauer, Gate-Texte). Dieses Kapitel
entwirft die Spalten, und der Rahmen ist Entscheidung 6: **dauerhaft, sperrbar, nicht löschbar**, und
der Code prägt beim Einlösen eine zeitlich begrenzte Sitzung. Vorbild ist
`src/app/m/lagerbuch/_db/schema.ts:376-415` (Tabelle `tokens`).

**Eine Tabelle genügt: `zugangscodes`.** Der zweite Zugangsweg — Anmeldung über die Suite, Zugriff aus
der Kachel — schreibt hier **nichts**: seine Sitzung ist die Auth.js-Sitzung, und es gibt kein
Objekt, das ausgestellt oder gesperrt werden könnte. *Zusage an Kapitel 3.*

Die Spaltenentscheidungen einzeln:

* **`id` ist der Wert, der in der Sitzung steckt, nicht `code`.** Das ist die Bauform, die `lagerbuch`
  nach §3.4.3 erst erlaubt hat, das Klartext-Geheimnis aus dem Cookie zu entfernen
  (`src/app/m/lagerbuch/_db/schema.ts:377-378`, `src/app/m/lagerbuch/_lib/helferZugang.ts:29-31`). Der
  Riegel schlägt bei jedem Aufruf über den Primärschlüssel nach; das ist ein Indexzugriff auf derselben
  Verbindung, die die Seite ohnehin öffnet.
* **`code` wird zeichengleich gespeichert und nie normalisiert.** Er ist gleichzeitig QR-Nutzlast und
  Gate-Eingabe; eine Umkodierung beim Import oder beim Schreiben macht gedruckte Kärtchen ungültig
  (`src/app/m/lagerbuch/_db/schema.ts:379-383` sagt genau das für `lagerbuch`).
  **Kein `COLLATE NOCASE`:** wenn Kapitel 3 die Eingabe unempfindlich gegen Groß-/Kleinschreibung
  macht, normalisiert es die **Eingabe** vor dem Nachschlagen — eine Collation auf der Spalte änderte
  still die Bedeutung von „exakt".
  *Zusage an Kapitel 3:* Länge und Alphabet des Codes gehören dorthin; die Spalte ist `text` mit
  `unique()` und schreibt kein Format vor.
* **`label` ist das Anzeigefeld.** Der Code allein sagt niemandem etwas — die Verwaltungsliste braucht
  „Aufsteller Fahrzeughalle", nicht „418-207".
* **`aktiv` ist der einzige Widerruf, den es gibt.** Kein Löschweg, keine `revoked_at`-Nachbildung von
  `api_tokens`: `false` ist endgültig genug und lässt die Zeile stehen.
* **`gesperrtAm`/`gesperrtVon` gehen über das `lagerbuch`-Vorbild hinaus, mit Grund.** Weil die Zeile
  **dauerhaft** in der Liste steht, muss sie erklären, warum sie tot ist; `aktiv = false` allein
  verlangt vom Betreiber, sich das zu merken. Beide sind nullable und werden ausschließlich von der
  Sperr-Action geschrieben.
* **`lastUsedAt` ist reine Anzeige** und hat **keinen** Einfluss auf Gültigkeit — wie in `lagerbuch`
  (`src/app/m/lagerbuch/_db/schema.ts:412-414`).

**„Nicht löschbar" braucht einen Mechanismus, keinen Satz.** radio-admin hat null Trigger (§2.3), und
`lagerbuch` erzwingt es ebenfalls nicht in SQL. Die Durchsetzung ist deshalb dreiteilig und gehört
ausgeschrieben in den Plan:

1. **Es gibt keinen Löschweg.** Keine Server Action, kein Route Handler, kein `db.delete(zugangscodes)`
   im ganzen Modul. Kapitel 3 baut die Sperrung, nicht ein Löschen.
2. **Ein Quelltext-Scan hält das fest** — `src/app/m/radio/_db/append.test.ts`, Test
   `"kein Löschweg auf zugangscodes"`: liest alle `.ts`-Dateien unter `src/app/m/radio` und verlangt,
   dass `delete(zugangscodes)` nirgends vorkommt. Dasselbe Mittel, mit dem
   `scripts/seed-lokal.test.ts:56` die Boot-Verdrahtung des Seeds verbietet. Er fängt die naheliegende
   Verdrahtung, nicht jede denkbare — das ist bekannt und akzeptiert.
3. **Der Grund steht als Kommentar in der Spalte selbst** (siehe §2.5.6): ein gelöschter Code kann an
   ein später ausgestelltes Kärtchen zurückfallen, und dann erscheinen **historische** Journal- und
   Verwaltungszeilen unter dem neuen Label. Das ist genau der Schaden, den `lagerbuch` bei seiner
   toten Spalte beschreibt (`src/app/m/lagerbuch/_db/schema.ts:391-394`): der Import hat keinen zweiten
   Versuch.

**`loans` bekommt KEINE Spalte für den Zugangsweg.** Weder `zugangscode_id` noch ein `quelle`-Feld.
Drei Gründe: (a) die Spalte existiert in der Quelle nicht, hat also keinen Importwert; (b) Entscheidung 7
macht die Ausleihe auf **beiden** Wegen „anonym in der Sache" — eine Spalte, die die Wege
unterscheidbar macht, lädt eine Verwaltungsansicht ein, die sie ungleich behandelt; (c) es gibt heute
keinen benannten Leser, und `lagerbuch` führt den Code im Journal nur, weil dort eine Buchung
zurechenbar sein **muss**, während hier `borrower_name` das Wer trägt. Braucht die Verwaltung die
Unterscheidung später, ist das eine **additive** Migration `0002`, keine Änderung dieses Entwurfs.
*Zusage an das Kapitel, das die Ausleihliste an `/admin` entwirft.*

**Die Vorbelegung des Entleihernamens ändert am Schema nichts.** Entscheidung 7 lässt offen (⚠️ **zu
bestätigen**), ob der Benutzername beim angemeldeten Weg vorausgefüllt wird. `loans.borrower_name`
bleibt in jedem Fall `text NOT NULL`: ein vorausgefüllter Name ist eine Zeichenkette wie eine getippte,
und die Retention löscht ihn nach zwei Monaten unabhängig davon, woher er kam. *Zusage an Kapitel 3: die
Vorbelegung ist eine Frage des Formulars, keine des Schemas — es entsteht dafür weder eine Spalte noch
eine Verbindung zur Auth.js-Identität.*

⚠️ **Zwei Punkte bleiben zu bestätigen** (nur der Betreiber weiß sie):
* **Sitzungsdauer.** Vorschlag **12 h**, wie `lagerbuch` (`helferGueltigkeitSekunden()`,
  `src/app/m/lagerbuch/_lib/helferSitzung.ts:50-57`). Sie hat **keine** Spalte in diesem Schema — der
  Ablauf steht im Cookie, die Sperrung in der Datenbank; das ist die Bauform, nicht der Wert.
* **Sind gedruckte Aufsteller im Umlauf?** Falls ja, ist der `code`-Wert der Bestandscodes beim
  Ausstellen zeichengleich zu übernehmen und die Ausgabe des ersten Satzes ist ein Druckvorgang, kein
  Bildschirmvorgang. Falls nein, entstehen alle Codes in der Suite.

## 2.5 Das Zielschema — `src/app/m/radio/_db/schema.ts`

**Die SQL-Spaltennamen sind zeichengleich zur Quelle**, und die TypeScript-Bezeichner bleiben ebenfalls
die der Quelle (`snapshotCallSign`, `issi`, `loanable` …), obwohl die jüngeren Suite-Module deutsch
benennen. Grund: der Importer ordnet 61 Spalten zu, und jede Umbenennung ist eine
Verwechslungsgelegenheit, die kein Gate sieht (`docs/radio-portierung-analyse.md:743-747` listet die vier
Paare, die sich verwechseln lassen). Die **neue** Tabelle `zugangscodes` ist deutsch benannt — sie hat
keine Quelle, die sie binden würde.

**IDs.** Bestehende Primärschlüssel wandern **zeichengleich** (cuid2 aus
`radio-admin/server/src/db/id.ts`). Für **neue** Zeilen erzeugt die Suite `nanoid()` — Präzedenz im
Repo: `src/app/m/portal/_db/schema.ts:2` und `src/app/m/aufgaben/_db/schema.ts:2` importieren es genau
so in ihrer Schemadatei (`package.json:32`, `nanoid ^6.0.1`). Es gibt keinen Grund,
`@paralleldrive/cuid2` als Abhängigkeit aufzunehmen: gemessen prüft, filtert und sortiert **nichts** die
Form einer id — `rg -n 'cuid|regex|length\(' radio-admin/shared/src/schemas.ts` liefert **0 Treffer**,
es gibt also nicht einmal einen Zod-Validator, der eine Länge oder ein Alphabet festlegte. Beide
Kennungsräume koexistieren als Primärschlüssel derselben Tabelle; dieselbe Begründung trägt in
`lagerbuch` (`src/app/m/lagerbuch/_db/schema.ts:428-430`).

**Kein `"use client"` in dieser Datei und in keiner Datei unter `_db/`** — Falle 6.

### 2.5.1 `devices` (25 Spalten)

```ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey().$defaultFn(nanoid),
  rufname: text("rufname"),
  issi: text("issi").notNull().unique(),
  // TEI = die im Geraet gebrannte Hardware-Identitaet, im Gegensatz zur umprogrammierbaren
  // issi. Optional und AUSDRUECKLICH NICHT unique: Geraete ohne erfasste TEI sind der
  // Normalfall (radio-admin/server/src/db/schema.ts:8-11). Ein `unique()` hier bricht den
  // Import beim zweiten NULL-freien Duplikat und ist fachlich falsch.
  tei: text("tei"),
  serialNumber: text("serial_number"),
  deviceType: text("device_type"),
  status: text("status"),
  location: text("location"),
  assignedTo: text("assigned_to"),
  softwareVersion: text("software_version"),
  // KALENDERDATUM `YYYY-MM-DD`, kein Zeitstempel (§2.2.3). Die Quelle fuehrt hier
  // epoch-ms mit drei widerspruechlichen Zeitzonen-Semantiken; der Import kuerzt in
  // Europe/Berlin.
  lastUpdatedAt: text("last_updated_at"),
  notes: text("notes"),
  // Kundenstammdaten, alle nullable.
  hiorgId: text("hiorg_id"),
  opta: text("opta"),
  funktion: text("funktion"),
  hersteller: text("hersteller"),
  bedieneinheit: text("bedieneinheit"),
  // Klartext, komma-verbundene Teilmenge von DEVICE_MODES, z. B. "TMO,DMO". KEINE
  // Normalisierung beim Import — der Wert wird an einer Stelle gelesen und gesplittet.
  deviceModes: text("device_modes"),
  alamosIntegrated: integer("alamos_integrated", { mode: "boolean" }),
  // STAMMDATUM. Entscheidet, ob das Geraet ausleihbar ist, und war in radio-admin nie in
  // UPDATER_EDITABLE_FIELDS (radio-admin/server/src/db/schema.ts:30-32).
  loanable: integer("loanable", { mode: "boolean" }),
  // APPEND-ONLY Update-Anmerkung, getrennt von `notes`: der Update-Weg haengt an, er
  // ueberschreibt nie (radio-admin/server/src/db/schema.ts:33-36). ⚠️ Genau diese Spalte
  // walzt ein `onConflictDoUpdate` beim Zweitimport platt (§2.8.4).
  updateNote: text("update_note"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  // OIDC-`sub`, OHNE FK auf users.sub (§2.3).
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});
```

### 2.5.2 `software_versions` (6 Spalten)

```ts
export const softwareVersions = sqliteTable("software_versions", {
  id: text("id").primaryKey().$defaultFn(nanoid),
  value: text("value").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  /**
   * TOTE SPALTE, WANDERT TROTZDEM. Geschrieben an zwei Stellen
   * (radio-admin/server/src/repos/softwareVersionRepo.ts:39, :53), in KEINER Projektion
   * selektiert (`listSoftwareVersions` :141-148, `getTargetVersion` :65). Es gibt also
   * Werte, und eine weggelassene Spalte macht einen vorhandenen Wert unwiederbringlich —
   * der Import hat keinen zweiten Versuch (dieselbe Begruendung wie
   * src/app/m/lagerbuch/_db/schema.ts:386-395). Es wird KEIN Leser gebaut.
   */
  createdBy: text("created_by"),
  // Reine Anzeigereihenfolge. Leitet den Ziel-Stand AUSDRUECKLICH NICHT ab: eine neu
  // erfasste Version, die oben landet, wird nie automatisch Ziel
  // (radio-admin/server/src/db/schema.ts:48-51).
  sortOrder: integer("sort_order").notNull().default(0),
  // Der Update-Stand eines Geraets ist BERECHNET, nicht gespeichert, und haengt allein an
  // dieser Marke. Genau EINE Zeile darf sie tragen — und es gibt keinen DB-Constraint dafuer
  // (§2.6). Der Leser `getTargetVersion` hat kein ORDER BY
  // (radio-admin/server/src/repos/softwareVersionRepo.ts:63-70): bei zwei Marken entscheidet
  // die Reihenfolge, in der SQLite zufaellig liefert, ueber den angezeigten Stand JEDES Geraets.
  isTarget: integer("is_target", { mode: "boolean" }).notNull().default(false),
});
```

### 2.5.3 `users` (3 Spalten) — wandert 1:1, ohne Zuordnungstabelle

```ts
/**
 * Reine Nachschlagetabelle fuer die ANZEIGE: sechs Auditspalten speichern die stabile
 * OIDC-Identitaet `sub` (devices.created_by/updated_by, device_events.changed_by,
 * software_versions.created_by), und ohne diese Tabelle rendert jede Auditzeile und jedes
 * Geraeteereignis eine nackte UUID.
 *
 * `sub` IST der Primaerschluessel und wird ROH gefuehrt — radio-admin schreibt ihn schon
 * roh (radio-admin/server/src/db/schema.ts:79). Der Praefix `pocketid:` ist ein Artefakt des
 * KIOSK (radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134) und
 * kommt hier nie an; Entscheidung 14 wird davon nicht beruehrt.
 *
 * KEINE Zuordnungstabelle alt_sub → neu_sub: die Pocket-ID-Instanz fuehrt
 * `subject_types_supported: ["public"]` (gemessen, src/app/m/lagerbuch/_db/schema.ts:431-432),
 * der `sub` ist also ueber beide OIDC-Clients identisch.
 */
export const users = sqliteTable("users", {
  sub: text("sub").primaryKey(),
  name: text("name").notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
});
```

⚠️ `select count(*) from users` ist **keine** Personenzahl und gehört in keine Oberfläche, die eine
Personenzahl anzeigen will.

### 2.5.4 `device_events` (8 Spalten) — der einzige Fremdschlüssel

```ts
export const deviceEvents = sqliteTable(
  "device_events",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    // DER EINZIGE FK DES SCHEMAS, und er MUSS ein Cascade-FK bleiben
    // (radio-admin/server/src/db/schema.ts:88-90). `foreign_keys = ON` ist gesetzt
    // (src/core/db/index.ts:19) — ein Ereignis-Insert vor dem passenden Geraet bricht hart ab.
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedBy: text("changed_by"),
    changedAt: integer("changed_at", { mode: "timestamp" }).notNull(),
    // Drizzle-Enum OHNE DB-CHECK — in SQL steht nur `text NOT NULL`. Die Datenbank
    // akzeptiert jeden String; der Importer prueft (§2.2.4), die DB tut es nicht.
    source: text("source", {
      enum: ["manual", "csv-import", "create", "update-note"],
    }).notNull(),
  },
  (t) => [index("device_events_device_id_idx").on(t.deviceId)],
);
```

### 2.5.5 `loans` (11 Spalten) — FK-frei mit Absicht

```ts
/**
 * Ausleihen. `returned_at IS NULL` heisst „aktive Leihe".
 *
 * `device_id` ist ABSICHTLICH KEIN Fremdschluessel (§2.3, Wortlaut der Quelle in
 * radio-admin/server/src/db/schema.ts:106-110). Die historische Richtigkeit traegt der
 * unveraenderliche Anzeige-Schnappschuss, der beim Ausleihen kopiert wird, nicht ein
 * lebender Join.
 *
 * `borrower_name` ist personenbezogen und der DSGVO-Grund der Retention (§2.7).
 */
export const loans = sqliteTable(
  "loans",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    deviceId: text("device_id").notNull(),
    snapshotCallSign: text("snapshot_call_sign").notNull(),
    snapshotSerialNumber: text("snapshot_serial_number"),
    snapshotDeviceType: text("snapshot_device_type"),
    borrowerName: text("borrower_name").notNull(),
    borrowedAt: integer("borrowed_at", { mode: "timestamp" }).notNull(),
    returnedAt: integer("returned_at", { mode: "timestamp" }),
    returnNote: text("return_note"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("loans_device_id_idx").on(t.deviceId),
    index("loans_borrowed_at_idx").on(t.borrowedAt),
    index("loans_returned_at_idx").on(t.returnedAt),
    // Der PARTIELLE Unique-Index steht hier NICHT und kann hier nicht stehen (§2.6).
  ],
);
```

### 2.5.6 `zugangscodes` (9 Spalten) — neu

```ts
/**
 * Der dauerhafte, sperrbare Ausleih-Zugang (Entscheidung 6). Vorbild in Bauform und
 * Begruendung: src/app/m/lagerbuch/_db/schema.ts:376-415.
 *
 * NICHT LOESCHBAR — und der Grund ist kein Ordnungsargument: ein geloeschter Code kann an
 * ein spaeter ausgestelltes Kaertchen zurueckfallen, und danach erscheinen HISTORISCHE
 * Zeilen unter dem neuen Label. Durchgesetzt durch Abwesenheit jedes Loeschwegs plus den
 * Quelltext-Scan in _db/append.test.ts (§2.4).
 */
export const zugangscodes = sqliteTable("zugangscodes", {
  // Steckt im Sitzungs-Cookie JEDER laufenden Ausleih-Sitzung — nicht neu vergeben.
  // Der Riegel schlaegt bei jedem Aufruf hierueber nach, nicht ueber `code`; nur so muss
  // das Klartext-Geheimnis nicht im Cookie stehen.
  id: text("id").primaryKey().$defaultFn(nanoid),
  // ZUGLEICH QR-Nutzlast UND Gate-Eingabe. Zeichengleich gespeichert, nie normalisiert,
  // nie umkodiert — gedruckte Kaertchen sind sonst ungueltig. KEIN `COLLATE NOCASE`:
  // eine unempfindliche Eingabe normalisiert die EINGABE, nicht die Spalte.
  // Laenge und Alphabet: Kapitel 3.
  code: text("code").notNull().unique(),
  // Der Anzeigename in der Verwaltung — der Code allein sagt niemandem etwas.
  label: text("label").notNull(),
  // DER EINZIGE WIDERRUF, DEN ES GIBT. Ein Import oder ein Seed, der alles als aktiv
  // anlegt, reaktiviert still jeden gesperrten Code — und zwar genau die, die gesperrt
  // wurden, weil ein Kaertchen verschwunden ist.
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  // Nur von der Sperr-Action geschrieben. Sie existieren, WEIL die Zeile dauerhaft in der
  // Liste steht und erklaeren muss, warum sie tot ist.
  gesperrtAm: integer("gesperrt_am", { mode: "timestamp" }),
  gesperrtVon: text("gesperrt_von"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // OIDC-`sub` des ausstellenden radio-admins (Entscheidung 7). Reines Auditfeld.
  createdBy: text("created_by").notNull(),
  // NULL = „nie eingeloest". REINE ANZEIGE, ohne Einfluss auf Gueltigkeit.
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
});
```

**Kein Index auf `aktiv`.** Die Verwaltungsliste ist die einzige Abfrage über diese Spalte, und die
Tabelle liegt in der Größenordnung „Zahl der Aufsteller" — ein Index kostet hier mehr Schreibarbeit
als er an Lesezeit einspart. Der Riegel selbst liest über den Primärschlüssel.

## 2.6 Indizes — und der eine, den `drizzle-kit` nicht erzeugen kann

Acht Indizes im Ziel: die sieben der Quelle plus `zugangscodes_code_unique`.

| Index | Herkunft | erzeugt durch |
|---|---|---|
| `devices_issi_unique` | `0000` | `.unique()` auf `devices.issi` |
| `software_versions_value_unique` | `0000` | `.unique()` auf `software_versions.value` |
| `device_events_device_id_idx` | `0000` | Tabellenausdruck `deviceEvents` |
| `loans_device_id_idx` | `0003` | Tabellenausdruck `loans` |
| `loans_borrowed_at_idx` | `0003` | Tabellenausdruck `loans` |
| `loans_returned_at_idx` | `0003` | Tabellenausdruck `loans` |
| **`loans_device_active_uidx`** | `0003`, **handgeschrieben** | **eigene Migration, von Hand** |
| `zugangscodes_code_unique` | neu | `.unique()` auf `zugangscodes.code` |

**`loans_device_active_uidx` ist der einzige Riegel für die Invariante „höchstens eine aktive Ausleihe
je Gerät".** Er ist **partiell**, und `drizzle-kit` kann partielle Indizes nicht emittieren — deshalb
steht er in der Quelle von Hand am Ende von `radio-admin/server/drizzle/0003_kind_spot.sql`, mit dieser
Begründung im Dateikopf: „Hand-added because drizzle-kit cannot emit partial indexes; it is invisible to
the drizzle schema, so future `drizzle-kit generate` runs neither see nor drop it."

**Er wandert zeichengleich, aber in eine EIGENE Migrationsdatei** (`0001_loans_aktiv_uidx.sql`, §2.9.1),
nicht angehängt an die generierte `0000`. Zwei Gründe: eine generierte Datei darf nie von Hand
nachbearbeitet werden, weil der nächste `drizzle-kit generate`-Lauf sie neu schreibt und ihr Hash
wandert; und eine eigene Datei mit sprechendem Namen sagt beim Durchblättern, dass hier etwas steht,
das kein Generator kennt.

```sql
-- src/app/m/radio/_db/migrations/0001_loans_aktiv_uidx.sql
-- Partieller Unique-Index: hoechstens EINE aktive Leihe (returned_at IS NULL) je Geraet.
-- Von Hand, weil drizzle-kit partielle Indizes nicht emittieren kann. Er ist dem
-- Drizzle-Schema UNSICHTBAR — kuenftige `drizzle-kit generate`-Laeufe sehen ihn nicht und
-- entfernen ihn nicht. Diese Datei NICHT neu erzeugen: ihr Hash steht in
-- `__drizzle_migrations`, und ein geaenderter Hash laesst bereits migrierte Datenbanken in
-- eine Absturzschleife laufen.
CREATE UNIQUE INDEX `loans_device_active_uidx` ON `loans` (`device_id`) WHERE `returned_at` IS NULL;
```

**Zwei Folgen, beide gateblind:**

* **(a) Wird der Index vergessen, ist der Riegel weg — und der Import ist grün.** Die Altdaten erfüllen
  die Invariante, also fällt nichts auf. Sichtbar wird es erst, wenn ein zweites Mal dasselbe Gerät
  ausgeleiht wird. `pnpm typecheck` und `pnpm build` fassen Migrationen nicht an.
* **(b) Ein Upsert kann diesen Index nicht als Konfliktziel treffen.** SQLite verlangt, dass das
  Konfliktziel einen Unique-Index trifft, und bei einem partiellen Index muss das Ziel dieselbe
  `WHERE`-Klausel tragen: `onConflictDoUpdate({ target: loans.deviceId })` trifft
  `loans_device_active_uidx` nie. Historie im Bulk zu importieren ist gefahrlos (dort ist
  `returned_at NOT NULL`, der Index greift nicht); **zwei aktive Leihen für dasselbe Gerät schlagen hart
  fehl** — deshalb Abfrage 4 aus §2.8.3 **vor** dem Import.

**Der Test, der die Zeile hält** — `src/app/m/radio/_db/migrations.test.ts`:

| Test | prüft |
|---|---|
| `zwei aktive Leihen auf dasselbe Geraet werden abgewiesen` | migriert eine `:memory:`-DB, legt eine Leihe mit `returnedAt: null` an, erwartet beim zweiten Insert einen Wurf |
| `eine zurueckgegebene und eine aktive Leihe auf dasselbe Geraet sind erlaubt` | die Partialität selbst — sonst wäre ein gewöhnlicher Unique-Index „grün" |
| `zwei zurueckgegebene Leihen auf dasselbe Geraet sind erlaubt` | dass der Index die Historie nicht sperrt |
| `loans_device_active_uidx existiert in sqlite_master` | die Zeile direkt, damit ein `drizzle-kit generate` sie nicht still verlieren kann |

**Was das Schema NICHT durchsetzt und wo der Ersatz liegt:**

* **„Genau eine `is_target`-Zeile"** ist eine Behauptung des Anwendungscodes, kein Constraint. Erzwungen
  wird sie in einer Transaktion (`radio-admin/server/src/repos/softwareVersionRepo.ts:81-87`), und der
  Leser ist wehrlos (`:63-70`, `.limit(1)` **ohne** `orderBy`). Ein Import, der `is_target` je Zeile aus
  einer Quelle mappt, kann schweigend zwei Marken setzen, und danach hängt der angezeigte
  Update-Stand **jedes** Geräts daran, welche Zeile SQLite zufällig zuerst liefert. **Kein zweiter
  partieller Index dagegen** — er würde das Setzen der Marke von einer Zweischritt-Transaktion in einen
  Konflikt verwandeln und den bestehenden Schreibweg brechen. Ersatz ist Abfrage 2 aus §2.8.3, und sie
  ist **blockierend**.
* **`device_events.source`** hat kein DB-CHECK (§2.5.4). Ersatz ist die Prüfung im Mapper.
* **Kein Append-only-Trigger auf `device_events`**, obwohl die Tabelle fachlich ein Journal ist. Die
  Quelle hat keinen (§2.3), und einer im Ziel wäre eine Verhaltensänderung, die dem Import den
  `INSERT OR IGNORE`-Weg nicht erleichtert, sondern erschwert. Der Ersatz ist, dass es keinen
  Schreibweg außer „anhängen" gibt.

## 2.7 Retention — übernommen, aber nicht am Boot

Übernommen wird die Regel: **zurückgegebene Leihen älter als zwei Monate werden gelöscht**
(`HISTORY_RETENTION_MONTHS = 2`, `radio-admin/server/src/services/retentionService.ts:9`). Der Grund
steht dort im Kommentar und ist der einzige, der zählt: `borrower_name` ist personenbezogen, und das
Löschen ist eine **ausdrückliche geplante Richtlinie**, keine Nebenwirkung davon, dass jemand die
Historie liest. Betreiberantwort 4 bestätigt die Übernahme; betroffen sind **< 100 Leihen** — eine
Schätzung des Betreibers, **keine Zählung** (die Zahl fällt beim Cutover an, §2.8.3).

### 2.7.1 Wo sie läuft

Ein modul-eigener Hintergrund-Takt, `starteRadioRetentionTakt()` in `src/app/m/radio/_lib/boot.ts`,
gerufen aus `startBackgroundWork()` (`src/core/bootstrap.ts`, §2.9.3). Vorbild in Bauform und
Begründung ist der Aufräum-Takt von `files` (`src/app/m/files/_lib/boot.ts:113-180`):

```ts
// src/app/m/radio/_lib/boot.ts   — KEIN "use client" (Falle 6)
const MS_PRO_TAG = 86_400_000;
let uhr: ReturnType<typeof setInterval> | undefined;

/** Der Cutoff als DATE, nicht als Millisekundenzahl (§2.7.4). Rein und testbar. */
export function retentionGrenze(jetzt: Date = new Date()): Date {
  const d = new Date(jetzt.getTime());
  d.setUTCMonth(d.getUTCMonth() - 2);
  return d;
}

/** Ein Lauf. Gibt die Zahl geloeschter Zeilen zurueck. Wirft nicht. */
export function raeumeLeihhistorie(db: DB, jetzt?: Date): number {
  const grenze = retentionGrenze(jetzt);
  const ergebnis = db
    .delete(loans)
    .where(and(isNotNull(loans.returnedAt), lt(loans.returnedAt, grenze)))
    .run();
  return ergebnis.changes;
}

export function starteRadioRetentionTakt(): void {
  // Idempotent, weil `register()` unter HMR mehr als einmal laeuft: zwei Timer waeren
  // zwei Laeufe je Takt. Ein Container, ein Timer — `compose.yaml` hat kein `replicas:`.
  if (uhr !== undefined) return;
  // `setInterval` und NICHT `setTimeout`: der erste Lauf ist damit um einen VOLLEN Takt
  // VERZOEGERT. Das ist der Kern dieser Entscheidung, siehe §2.7.2.
  uhr = setInterval(() => {
    try {
      const geloescht = raeumeLeihhistorie(getDb());
      if (geloescht > 0) console.info(`[radio] Retention: ${geloescht} Leihe(n) geloescht`);
    } catch (grund) {
      console.error("[radio] Retention fehlgeschlagen:", grund);
    }
  }, MS_PRO_TAG);
  // `unref`, damit ein Skript, das die Suite nur laedt, nicht am Timer haengt.
  uhr.unref?.();
}

/** Haelt den Takt an. Exportiert, weil ein Modulzustand sonst den Test ueberlebt. */
export function stoppeRadioRetentionTakt(): void {
  if (uhr !== undefined) clearInterval(uhr);
  uhr = undefined;
}
```

**Kein Host-Riegel davor.** `files` prüft vor dem Start, ob das Modul konfiguriert ist, weil sein
Arbeiter sonst in eine unbegrenzte Fehlerschleife läuft (`src/app/m/files/_lib/boot.ts:114-129`, an
einem 75-Sekunden-Lauf gemessen). Dieser Takt braucht keine Konfiguration — er braucht nur die Tabelle,
und die existiert nach der Migration immer. Ein Riegel auf `SUITE_HOST_RADIO` wäre hier sogar
**schädlich**: eine vergessene Variable schaltete die Löschrichtlinie still ab. Statt eines Riegels
steht ein `try`/`catch` um den Lauf — **er darf nie werfen**, sonst nimmt er `portal`, `qr`, `feedback`,
`files` und `aufgaben` mit (dieselbe Zusage, die `lagerbuchBootFehler()` in
`src/core/bootstrap.ts` trägt).

### 2.7.2 Ausdrücklich NICHT sofort beim Boot

radio-admin führt `purge()` **sofort** aus, vor dem Tagestimer
(`radio-admin/server/src/services/retentionService.ts:47`), und der Quellkommentar nennt als Anlass
wörtlich „clears any backlog, e.g. straight after a data migration"
(`retentionService.ts:29-30`). **Genau dieser Anlass ist der Grund, es nicht zu tun.** Kommt der Import
mit einem Faktor-1000-Fehler durch (§2.2), liegt jedes `returned_at` im Jahr 1970 — und ein Boot-Purge
löscht die vollständige abgeschlossene Leihhistorie **im selben Moment, in dem der Container zum ersten
Mal hochkommt**, also vor jeder menschlichen Sichtprüfung und vor jeder feldweisen Stichprobe des
Runbooks.

**Die Taktverzögerung IST das Rücknahmefenster.** Ein voller Tag zwischen Deploy und erstem Löschlauf
ist genau die Zeit, in der die Verifikation gegen den ephemeren Container und die Stichproben laufen —
und in der der Rückweg „Router zurück" noch einen intakten Bestand vorfindet. Der Preis ist ein
Rückstand von bis zu 24 Stunden bei den ohnehin gelöschten Zeilen; das ist gegen die DSGVO-Frist von
zwei Monaten kein Betrag.

**Der Test dazu** — `src/app/m/radio/_lib/boot.test.ts`, mit `vi.useFakeTimers()`:

| Test | prüft |
|---|---|
| `starteRadioRetentionTakt loescht beim Start NICHTS` | eine überfällige Leihe steht nach `starteRadioRetentionTakt()` und `vi.advanceTimersByTime(0)` **noch da** — das ist die Regressionssperre gegen den zurückgebauten Sofort-Purge |
| `nach 24 h laeuft der erste Lauf` | dieselbe Leihe ist nach `advanceTimersByTime(MS_PRO_TAG)` weg |
| `zweimaliger Aufruf startet nur einen Timer` | HMR-Idempotenz: nach zwei Aufrufen und einem Takt genau **ein** Lauf |
| `ein Fehler im Lauf wirft nicht aus dem Takt heraus` | eine geschlossene Verbindung erzeugt eine Protokollzeile, keinen `unhandledRejection` |

### 2.7.3 Was passiert, wenn sie nie läuft — und wenn sie zu oft läuft

**Zu oft ist harmlos, der Cutoff ist das Risiko.** In diesen Worten:

* **Nie:** `borrower_name` sammelt sich über die Zwei-Monats-Richtlinie hinaus an. Das ist eine
  **Richtlinien-Abweichung**, kein Funktionsausfall — nichts bricht, keine Anzeige wird falsch, die
  Historie wird nur länger. Feststellbar mit einer Abfrage:
  `SELECT COUNT(*) FROM loans WHERE returned_at IS NOT NULL AND returned_at < unixepoch('now','-2 months');`
  Sie gehört als wiederkehrende Prüfung ins Runbook (**Zusage an Spec 2**), weil ein stehengebliebener
  Timer sich nicht von selbst meldet.
* **Zu oft:** nichts Neues wird gelöscht. Der Cutoff ist zeitbasiert und der `DELETE` idempotent; zwei
  Läufe in einer Minute löschen dieselbe leere Menge. Die Kosten sind ein indizierter `DELETE` über
  `loans_returned_at_idx`.
* **Die eigentliche Gefahr ist ein falscher Cutoff**, und sie hat zwei Gestalten: die Einheit (deshalb
  rechnet `retentionGrenze` mit `Date` und nie mit Millisekunden — eine `Date`-Grenze kann keinen
  Faktor 1000 tragen, weil Drizzle die Umrechnung selbst besorgt) und das Vorzeichen. `retentionGrenze`
  ist deshalb **rein und einzeln getestet** (`retention.test.ts`):
  `retentionGrenze auf 2026-08-17 ergibt 2026-06-17` · `eine am Cutoff-Tag zurueckgegebene Leihe
  bleibt` · `eine einen Tag vor dem Cutoff zurueckgegebene Leihe geht` · `eine AKTIVE Leihe bleibt,
  egal wie alt ihr borrowed_at ist`.

**Der Monatsende-Überlauf ist übernommenes Verhalten und wird als solches festgeschrieben.**
`setUTCMonth(getUTCMonth() - 2)` auf dem 30. April ergibt „30. Februar" und normalisiert auf den
**2. März** — der Cutoff wandert also an solchen Tagen bis zu zwei Tage **nach vorn** und löscht ein
wenig mehr, als die Richtlinie wörtlich sagt. Die Quelle rechnet zeichengleich so
(`radio-admin/server/src/services/retentionService.ts:17-21`), und Parität ist hier das stärkere
Argument als arithmetische Eleganz: eine korrigierte Monatsarithmetik ließe im Ziel Zeilen stehen, die
die Alt-App gelöscht hätte, und die Abweichung fiele niemandem auf. Ein fünfter Test hält die
Entscheidung fest, damit sie nicht als Fehler „repariert" wird:
`retentionGrenze auf 2026-04-30 ergibt 2026-03-02 — die Monatsende-Verschiebung der Quelle wird
uebernommen`.

### 2.7.4 Aktive Leihen bleiben, immer

`returned_at IS NULL` ist keine Zeit und fällt nie unter einen Cutoff — auch nicht bei einer
Jahre alten aktiven Leihe. Das ist das Verhalten der Quelle
(`radio-admin/server/src/repos/loanRepo.ts:191-196`: `DELETE FROM loans WHERE returned_at IS NOT NULL
AND returned_at < cutoff`) und wird zeichengleich übernommen. Ein „aufräumen, was zu lange draußen ist"
gibt es nicht und darf hier nicht entstehen: eine verschwundene aktive Leihe ist der Verlust der
Information, wer ein Gerät hat.

## 2.8 Der Importer — `scripts/import/radio.ts`

### 2.8.1 Aufbau und Aufrufform

Muster der beiden vorhandenen Importer (`scripts/import/portal.ts`, `scripts/import/feedback.ts`): reine
Mapping-Funktionen (§2.2.4), eine `importiere…`-Funktion je Tabelle, eine Paritätssicht je Tabelle,
`scripts/import/parity.ts` als Vergleicher. Die Quelle ist **kein NDJSON aus Postgres wie bei `portal`,
sondern die Alt-SQLite selbst** — `radio-admin`s `/data/data.sqlite`, per `better-sqlite3` **lesend**
geöffnet, Spalten **namentlich**, nie `SELECT *`
(`docs/runbooks/lagerbuch-cutover.md:30-31` macht das zur Regel; die vollständigen Spaltenlisten stehen
in §2.5).

Ausdrücklich: **`scripts/import/radio.ts` MUSS committet sein.** Ein Runbook ist nicht ausführbar und
nicht gegenlesbar, und die Mapping-Funktion ist die einzige Stelle, an der der Faktor-1000-Fehler
überhaupt gefangen werden kann. ⚠️ Wie der `lagerbuch`-Import stattdessen ablief, ist aus dem Repo
nicht ableitbar — `scripts/import/` enthält kein `lagerbuch.ts`. Das ist kein Vorbild, dem zu folgen
wäre.

### 2.8.2 Einfügereihenfolge — Pflicht, nicht Stil

`foreign_keys = ON` ist in **beiden** Datenbanken gesetzt (`radio-admin/server/src/db/index.ts:28` und
`src/core/db/index.ts:19`). Die Kante `device_events.device_id → devices.id` bricht also hart ab, wenn
ein Ereignis vor seinem Gerät eingefügt wird.

1. `users`, `software_versions` (frei, keine Abhängigkeit)
2. `devices`
3. `device_events` — **nach** `devices`, erzwungen durch die FK-Kante
4. `loans` — formal frei (kein FK), fachlich nach `devices`
5. `zugangscodes` — **nicht Teil des Imports.** Es gibt in der Quelle nichts, was ihnen entspräche: der
   heutige QR-Mechanismus trägt den einen geteilten API-Token base64-kodiert als URL-Parameter
   (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`), ohne Ablauf und
   ohne Widerruf. Es gibt also keine Zeile zu übernehmen, sondern eine **Verhaltensänderung mit
   Ankündigungspflicht** — der erste Satz Codes entsteht in der Suite, ausgestellt von einem
   radio-admin. *Zusage an Kapitel 3 und an Spec 2.*

`api_tokens` fehlt in dieser Liste, und das ist Absicht (§2.10).

### 2.8.3 Sechs Abfragen gegen die Alt-SQLite, **vor** dem Import

Muster `docs/runbooks/lagerbuch-cutover.md:452`, `:544` — dieselbe Zahl vorher und nachher. Diese sechs
gehören ins Runbook (**Zusage an Spec 2**); Nummer 2, 4 und 6 sind **blockierend**:

1. `SELECT COUNT(*) FROM devices;` … `software_versions; … users; … device_events; … loans;` — fünf
   Paritäts-Sollwerte. Dazu `SELECT COUNT(*) FROM api_tokens;` als Protokollzeile (§2.10).
2. **`SELECT COUNT(*) FROM software_versions WHERE is_target = 1;` — MUSS genau 1 sein.** Bei 0 oder 2
   kippt der angezeigte Update-Stand **jedes** Geräts, und keine Parität sieht es (§2.6).
3. `SELECT COUNT(*) FROM device_events e LEFT JOIN devices d ON d.id = e.device_id WHERE d.id IS NULL;`
   — muss 0 sein, sonst scheitert der Import an der FK-Kante.
4. **`SELECT device_id, COUNT(*) FROM loans WHERE returned_at IS NULL GROUP BY device_id HAVING
   COUNT(*) > 1;` — muss leer sein**, sonst lässt sich `loans_device_active_uidx` im Ziel nicht anlegen.
5. `SELECT MIN(created_at), MAX(created_at) FROM devices;` — dreizehnstellig heißt Millisekunden. Die
   empirische Bestätigung von §2.2.1.
6. **Der Riegel aus §2.2.4 wirft — also muss er VOR dem Cutover-Fenster feuern, nicht darin.**
   `msZuDatum` bricht bei jedem Wert außerhalb `[1e12, 4e12]` ab, und Abfrage 5 sieht nur die Spanne
   **einer** Spalte. Diese Abfrage sieht **alle elf** und **muss 0 ergeben** — sie ist blockierend wie
   Nummer 2 und 4:

   ```sql
   SELECT
     (SELECT COUNT(*) FROM devices  WHERE created_at      NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM devices  WHERE updated_at      NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM devices  WHERE last_updated_at IS NOT NULL
                                      AND last_updated_at NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM device_events     WHERE changed_at   NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM software_versions WHERE created_at   NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM users             WHERE last_seen_at NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM loans   WHERE borrowed_at NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM loans   WHERE created_at  NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM loans   WHERE updated_at  NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM loans   WHERE returned_at IS NOT NULL
                                    AND returned_at  NOT BETWEEN 1000000000000 AND 4000000000000)
     AS unplausible_zeitstempel;
   ```

   Ein Treffer ist eine `0`, ein Sekundenwert oder ein Ausreißer in **einer** Zeile — und er ist in der
   Generalprobe eine halbe Stunde Arbeit, im Echtlauf ein Abbruch um 23 Uhr.

Dazu die Zahl, die die Retention-Schätzung ersetzt (Betreiberantwort 4, „< 100" ist ungezählt):
`SELECT COUNT(*) FROM loans WHERE returned_at IS NOT NULL AND returned_at < <cutoff_ms>;` — sie sagt,
wie viele Zeilen der erste Lauf nach 24 Stunden löschen wird, und gehört ins Cutover-Protokoll, **bevor**
er läuft.

### 2.8.4 Idempotenz — der asymmetrische Fall

Beide vorhandenen Importer nutzen Upsert per Primärschlüssel
(`scripts/import/portal.ts:57-63`, `.onConflictDoUpdate({ target: schema.services.id, set: v })`). Ein
Test, der **zweimal dieselbe Quelle** importiert, ist damit immer grün. Der echte Fall geht in **beide**
Richtungen falsch:

* `onConflictDoUpdate` walzt eine Zeile platt, die in der **Suite** nach der Generalprobe entstanden ist.
  Bei `devices` trifft das `update_note`, das append-only ist
  (`radio-admin/server/src/db/schema.ts:33-36`); bei `loans` trifft es `returned_at` — eine in der Suite
  zurückgegebene Ausleihe wird **wieder aktiv** und kollidiert dann mit `loans_device_active_uidx`.
* `onConflictDoNothing` lässt dafür eine in der **Alt-App** geänderte Zeile stehen.

**Die belastbare Lösung ist der Ablauf, nicht die Konfliktstrategie:** Generalprobe gegen eine
Schnappschuss-Kopie, Echtimport gegen eine **leere** Ziel-DB nach dem Freeze. Verbindlich für die vier
Tabellen:

| Tabelle | Strategie | Grund |
|---|---|---|
| `users`, `software_versions`, `devices`, `loans` | `onConflictDoUpdate` per Primärschlüssel | Zielt auf die leere Ziel-DB; der Upsert ist die Sicherung gegen einen abgebrochenen Lauf |
| `device_events` | **`INSERT OR IGNORE`** (`onConflictDoNothing`) | Die Tabelle ist ein **Journal**; ein Upsert ist dort fachlich falsch (`docs/runbooks/lagerbuch-cutover.md:409` unterscheidet genau das) |

⚠️ `scripts/import/portal.ts:105-107` warnt selbst: „parity runs AFTER this (idempotent) write. A thrown
parity error means the target was already mutated … not ‚nothing happened'". Ein roter Paritätscheck ist
also **kein** „es ist nichts passiert" — der Rückweg ist die leere Ziel-DB, nicht ein zweiter Versuch.

## 2.9 Migrationen, das Registrierungs-Dreieck und der Seed

### 2.9.1 Die Dateien unter `_db/`

```
src/app/m/radio/_db/
  schema.ts                      (§2.5)
  client.ts                      (§2.1)
  drizzle.config.ts
  append.test.ts                 (§2.4, Quelltext-Scan gegen einen Loeschweg)
  migrations.test.ts             (§2.6)
  migrations/
    0000_<von drizzle-kit generiert>.sql   sechs Tabellen, sieben Indizes
    0001_loans_aktiv_uidx.sql              der partielle Unique-Index, VON HAND (§2.6)
    meta/                                  drizzle-kit-Snapshot, mit committen
```

```ts
// src/app/m/radio/_db/drizzle.config.ts
// Pfade repo-root-relativ (drizzle-kit loest gegen cwd auf), nicht relativ zu dieser Datei.
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/app/m/radio/_db/schema.ts",
  out: "./src/app/m/radio/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/radio.db" },
} satisfies Config;
```

⚠️ **Migrationen sind append-only.** Der Hash jeder Datei steht in `__drizzle_migrations`; wird eine
bestehende Datei neu erzeugt, versucht Drizzle sie auf bereits migrierten Datenbanken erneut anzuwenden
und der Container läuft in eine Absturzschleife. Das hat in radio-admin **einmal die Produktion
lahmgelegt** (`radio-admin/CLAUDE.md`, Abschnitt „Datenbank-Migrationen — APPEND-ONLY (kritisch)"). Der
Name der generierten `0000` wird von `drizzle-kit` gewürfelt und **nicht** nachträglich umbenannt.

### 2.9.2 Die drei Ecken

**Ecke 1 — Migrationsverzeichnis:** `src/app/m/radio/_db/migrations` (oben).

**Ecke 2 — `MODULE_MIGRATIONS` in `src/core/bootstrap.ts`**, hinter `aufgaben`:

```ts
  // radio: bewusst OHNE Schema-Import und OHNE Seed in `seedAllModules()`. Der
  // Schema-Import waere toter Code (`migrateAllModules()` migriert schema-frei), und der
  // Seed-Ausschluss hat denselben harten Grund wie bei `files`: `shouldSeed()` ist bei
  // `SUITE_SEED=1` auch in der GENERALPROBE wahr, und eine geseedete Zeile in
  // `zugangscodes` ist ein gueltiger ANONYMER SCHREIBZUGANG — jemand kann damit ohne
  // Anmeldung Geraete ausleihen und zurueckgeben. Das lokale Seed-Skript deckt den
  // Entwicklungsbetrieb vollstaendig ab.
  { key: "radio", migrationsFolder: "src/app/m/radio/_db/migrations" },
```

**Ecke 3 — `COPY`-Zeile im `Dockerfile`**, hinter der `aufgaben`-Zeile (`Dockerfile:56`):

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/radio/_db/migrations ./src/app/m/radio/_db/migrations
```

Fehlt die dritte Ecke, **läuft es lokal und bricht im Container** — `bootstrap.test.ts` prüft das
Dreieck über beide Listen.

### 2.9.3 `startBackgroundWork()`

```ts
export function startBackgroundWork(): void {
  starteFilesHintergrund();
  starteAufgabenScanArbeiter();
  // Taegliche Retention der Leihhistorie. Erster Lauf um einen VOLLEN Takt verzoegert
  // (§2.7.2) und wirft nie — ein Wurf hier naehme alle anderen Module mit.
  starteRadioRetentionTakt();
}
```

Kein Eintrag in `assertHostConfig()`: `radio` hat keine modul-eigene Boot-Prüfung. Die Host-Prüfung
leistet `validateHostConfig`/`validateGroupConfig` über die Registry.

### 2.9.4 Der lokale Seed — Pflicht, nicht Kür

`scripts/seed-lokal.test.ts:41-42` verlangt **Gleichheit der Schlüsselmengen** von `SEED_MODULE` und
`MODULE_MIGRATIONS`. Ein Eintrag in `MODULE_MIGRATIONS` ohne `seedLokal…` ist damit ein **roter Test**,
keine stille Auslassung. Also beides:

```ts
// scripts/seed-lokal.ts — Importe
import * as radioSchema from "@/app/m/radio/_db/schema";
import { seedLokalRadio } from "@/app/m/radio/_lib/seedLokal";

// scripts/seed-lokal.ts — SEED_MODULE, hinter `aufgaben`
  { key: "radio", lauf: () => seedLokalRadio(getModuleDb("radio", radioSchema)) },
```

`seedLokalRadio` ist **idempotent pro Entität** (nicht ein gemeinsames Gate: ein abgebrochener Lauf
ergänzt sich beim nächsten Aufruf selbst) und **rein additiv** (`.data/` enthält lokal gewachsene
Daten). Inhalt, gerade so viel, dass jede Fläche ohne Handarbeit sichtbar ist:

* **drei Softwareversionen**, davon **genau eine** mit `isTarget: true` — sonst zeigt die
  Verwaltungsliste einen Update-Stand, den §2.6 als unbestimmt beschreibt;
* **acht Geräte**: ausleihbar/nicht ausleihbar, mit und ohne `tei`, eines mit `updateNote`, eines mit
  einem Rufnamen mit Umlaut (**„Mühlheim 1/83"**) — ohne Umlaut-Testdaten sieht kein Test, dass die
  Suchfaltung fehlt (`radio-inventar/apps/frontend/src/lib/device-filter.ts:24-31`);
* **je eine aktive und drei zurückgegebene Leihen**, eine davon mit `returnedAt` **älter als zwei
  Monate**, damit der Retention-Lauf lokal überhaupt etwas zu tun hat;
* **zwei `zugangscodes`**: einer `aktiv`, einer gesperrt mit `gesperrtAm`/`gesperrtVon` — die
  Verwaltungsliste muss beide Zustände zeigen können;
* **eine `users`-Zeile** auf den `sub` des Dev-Kontos, damit Auditspalten einen Namen auflösen.

Das Protokoll nennt den erzeugten Code im Klartext — wie bei den übrigen Modulen, das ist der Zweck des
Skripts.

⚠️ **`seedAllModules()` bekommt KEINE `radio`-Zeile**, und `src/core/bootstrap.ts` bekommt **keinen**
`radio`-Schema-Import. Beides ist oben im Kommentar begründet und wird von
`scripts/seed-lokal.test.ts:56` (Quelltext-Scan gegen die Namen `seedLokal`/`seed-lokal` in
`bootstrap.ts` und `instrumentation.ts`) zusätzlich gehalten — er fängt die naheliegende Verdrahtung,
nicht jede denkbare.

## 2.10 Was NICHT wandert

**1. `api_tokens` — die ganze Tabelle.** Entscheidung 13: produktiv trägt sie genau **einen**
Konsumenten, den Alt-Kiosk mit statischem `RADIO_ADMIN_API_TOKEN` (Betreiberantwort 3), und der
verschwindet mit dem Port. Gemessen: `rg -n 'api_tokens|apiTokens' radio-admin/server/src
--glob '!*.test.ts'` liefert 17 Treffer, **alle** in `db/schema.ts` und `repos/apiTokenRepo.ts` — keine
andere Tabelle referenziert `api_tokens.id`, es gibt keine Auditkante, keine Historie hängt daran.
`created_by` ist zusätzlich eine tote Spalte (geschrieben `apiTokenRepo.ts:50`, in `listApiTokens`
`:79-86` nicht gelesen). Der Klartext ist nie gespeichert, eine mitgenommene Zeile wäre also ohnehin
nicht einlösbar. **Ersatz statt Migration:** vor dem Archivieren des Volumes wandert
`SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM api_tokens;` als Textausgabe ins
Cutover-Protokoll, und der Volume-Schnappschuss steht die zwei Wochen Standby ohnehin
(**Zusage an Spec 2**). Damit ist nichts vernichtet und keine Tabelle ohne Leser gebaut.

**2. `AdminUser` aus radio-inventar — und damit der gesamte Postgres.** Entscheidung 14. Im
Pocket-ID-Betrieb schreibt der OIDC-Weg nicht in die Tabelle, sondern baut die Kennung als
`pocketid:${sub}` (`radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`). Die
Suite führt den **rohen** `sub`; der Präfix verschwindet. Der Kiosk hält ohnehin keine eigenen Geräte-
oder Leihdaten — radio-admin ist das führende System und der Kiosk schreibt über die S2S-Leih-API durch
(`radio-admin/server/src/db/schema.ts:101-103`). Es gibt also **nichts** aus Postgres zu übernehmen.

**3. `prisma/create-session-table.sql`.** Erzeugt eine Tabelle **außerhalb** der Prisma-Migrationen und
wird von nichts ausgeführt — kein Import, kein Dockerfile-Schritt, kein `package.json`-Script
(`rg -rn "create-session-table" radio-inventar/apps/backend` → leer). Es gibt nach Codelage keinen
Postgres-Sitzungsspeicher. ⚠️ Methodenhinweis, nicht Baufalle: aus einem Repository lässt sich der
Prod-Tabellenbestand grundsätzlich nicht ableiten; `pg_tables` ist die einzige verlässliche Quelle. Das
betrifft das **Schließen** des Postgres (Spec 2), nicht dieses Schema.

**4. Die Weiterleitungs- und Setup-Mechanik des Kiosk.** `prisma.adminUser.count()`
(`radio-inventar/apps/backend/src/modules/setup/setup.repository.ts:17`) trägt einen Setup-Status, an
dem zwei harte Client-Weiterleitungen hängen (`apps/frontend/src/routes/__root.tsx:89-91`, `:100-112`).
Ohne `AdminUser` ist der Alt-Kiosk **vollständig unbenutzbar** — das ist der Grund, warum es **kein
Parallelfenster** gibt (Entscheidung 3) und der Rückweg „Router zurück" heißt. In `radio.db` entsteht
dafür **keine** Statuszeile und **keine** Setup-Tabelle: die Suite hat kein Erstinbetriebnahme-Gate,
und ein nachgebautes wäre eine zweite Sperre ohne Träger.

**5. Zwei tote Spalten — mit unterschiedlichem Ergebnis.** `software_versions.created_by` **wandert**
(§2.5.2): sie ist geschrieben, es gibt Werte, und eine weggelassene Spalte macht einen vorhandenen Wert
unwiederbringlich. `api_tokens.created_by` wandert nicht, weil die ganze Tabelle nicht wandert. Das
Unterscheidungskriterium ist **„wird sie geschrieben?"**, nicht „wird sie gelesen?" — ein Leser lässt
sich nachbauen, ein verlorener Wert nicht.

**6. Kein Fremdschlüssel wird nachgezogen.** Weder auf `loans.device_id` noch von einer Auditspalte auf
`users.sub` (§2.3). Ein zusätzlicher FK ist gültiges Drizzle, gültiges SQL und **paritätsgrün**; der
Schaden entsteht Monate später, bei der ersten Geräteausmusterung.

## 2.11 Zusagen und Tests dieses Kapitels

**Zusagen an andere Kapitel** (die Zusammenführung prüft sie gegeneinander):

| # | Zusage | an |
|---|---|---|
| 1 | Die Suchfaltung bleibt in JavaScript; deshalb reicht `getModuleDb` und es gibt keinen eigenen Opener. Wird die Suche in SQL gezogen, kippt §2.1. | Kapitel 3 · das Kapitel der Geräte-Übersicht und Rückgabesuche |
| 2 | `zugangscodes` ist die **einzige** neue Tabelle. Der Weg „angemeldet über die Suite" schreibt in ihr **nichts**. | Kapitel 3 |
| 3 | `code` wird zeichengleich gespeichert, nie normalisiert, keine Collation. Länge und Alphabet entscheidet Kapitel 3; das Schema schreibt kein Format vor. | Kapitel 3 |
| 4 | Die Sitzungsdauer hat **keine** Spalte — Ablauf im Cookie, Sperrung in `zugangscodes.aktiv`. Der Riegel schlägt über `zugangscodes.id` nach. | Kapitel 3 |
| 5 | Es gibt **keinen** Löschweg auf `zugangscodes`; Kapitel 3 baut die Sperrung (`aktiv`, `gesperrtAm`, `gesperrtVon`). | Kapitel 3 |
| 6 | `devices.last_updated_at` ist `string \| null` im Format `YYYY-MM-DD`. Formular und CSV-Export arbeiten mit der Zeichenkette, nie mit einem Zeitstempel. | das Kapitel der Geräteverwaltung an `/admin` |
| 7 | `loans` bekommt **keine** Spalte für den Zugangsweg. Wird sie gebraucht, ist das eine additive Migration `0002`. | das Kapitel der Ausleihliste an `/admin` |
| 8 | Die sechs Vorab-Abfragen aus §2.8.3 (Nr. 2, 4 und 6 blockierend), die Zählung der Retention-Kandidaten und der `api_tokens`-Auszug gehören ins Runbook. | Spec 2 |
| 9 | Der erste Satz `zugangscodes` entsteht in der Suite und wird nicht importiert — Verhaltensänderung mit Ankündigungspflicht. | Kapitel 3 · Spec 2 |
| 10 | `STALE_GRACE_MS` braucht in `radio.db` keine Spalte, keine Tabelle und kein Zwischenspeicher-Artefakt; das Verhalten selbst gehört ins Fachkapitel. | das Kapitel für Ausleihe, Rückgabe, Historie |
| 11 | Die Vorbelegung des Entleihernamens ist eine Formularfrage; `borrower_name` bleibt `notNull`, es entsteht keine Spalte und keine Verbindung zur Auth.js-Identität. | Kapitel 3 |

**Voraussetzung außerhalb dieses Kapitels:** die CWE-348-Umstellung in `core/ratelimit.ts`. Sie ist
**nicht** Teil dieser Spec, aber der Einlöse-Endpunkt aus Kapitel 3 hängt daran — und ohne
Ratenbegrenzung ist ein sechsstelliger Code ratbar.

**Neue Dateien dieses Kapitels:**

```
src/app/m/radio/_db/schema.ts · client.ts · drizzle.config.ts
src/app/m/radio/_db/migrations/0000_<generiert>.sql · 0001_loans_aktiv_uidx.sql · meta/
src/app/m/radio/_db/migrations.test.ts · append.test.ts
src/app/m/radio/_lib/boot.ts · boot.test.ts · retention.test.ts
src/app/m/radio/_lib/seedLokal.ts
scripts/import/radio.ts · scripts/import/radio.test.ts · scripts/import/fixtures/radio-*.json
```

**Geänderte Dateien:** `src/core/bootstrap.ts` (`MODULE_MIGRATIONS` + `startBackgroundWork`) ·
`Dockerfile` (eine `COPY`-Zeile) · `scripts/seed-lokal.ts` (zwei Importe + eine `SEED_MODULE`-Zeile).

**Die Tests dieses Kapitels, gesammelt:** `scripts/import/radio.test.ts` (11 Tests, §2.2.5) ·
`_db/migrations.test.ts` (4 Tests, §2.6) · `_db/append.test.ts` (1 Quelltext-Scan, §2.4) ·
`_lib/boot.test.ts` (4 Tests mit Fake-Timern, §2.7.2) · `_lib/retention.test.ts` (5 Tests, §2.7.3).
Die drei, ohne die dieses Kapitel keinen Schutz hat, sind
`toNeuesGeraet: jedes Zeitfeld behaelt SEINEN Wert in Millisekunden`,
`zwei aktive Leihen auf dasselbe Geraet werden abgewiesen` und
`starteRadioRetentionTakt loescht beim Start NICHTS`.
