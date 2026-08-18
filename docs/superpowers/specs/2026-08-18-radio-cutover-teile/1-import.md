# 1. Das Import-Skript

`scripts/import/radio.ts` — SQLite → SQLite, wie `feedback` es war, nicht wie `portal` es war.

Dieses Kapitel entwirft **eine** Datei plus ihren Test plus ihre Fixtures. Es entwirft **nicht** das
Cutover-Fenster (Kapitel 3), nicht die Generalprobe (Kapitel 2) und nicht das Abschalten der
Alt-Anwendungen (Kapitel 4). Wo es diesen Kapiteln etwas zusagt oder etwas von ihnen fordert, steht
das als **Zusage an Kapitel N** dort, wo es entsteht.

Kapitelnummern in diesem Teil-Satz: **1** Import · **2** Generalprobe · **3** Cutover · **4** Abbau.

---

## 1.0 Warum diese Datei existieren muss, und was sie nicht ist

Spec 1 §2.8.1 setzt es fest: **`scripts/import/radio.ts` MUSS committet sein.** Die Begründung ist
nicht Ordnung, sondern Deckung — die Mapping-Funktion ist die **einzige** Stelle, an der der
Faktor-1000-Fehler überhaupt gefangen werden kann. Der Paritätscheck kann es strukturell nicht:
`scripts/import/parity.ts:43-56` vergleicht Multimengen von Zeilen-Hashes, und beide Arme laufen durch
**dieselbe** Mapping-Funktion. `scripts/import/portal.ts:73-76` schreibt das selbst hin:

> „parity certifies DB round-trip fidelity of all 15 fields — NOT the correctness of `toNewService`'s
> Postgres->app mapping (both parity arms derive from `toNewService`, so a mapping bug hashes
> identically on both sides)."

⚠️ **Es gibt kein `lagerbuch.ts` als Vorbild.** `scripts/import/` enthält heute genau
`feedback-time.ts`, `feedback.ts`, `parity.ts`, `portal.ts` plus je einen Test und `fixtures/` —
obwohl der `lagerbuch`-Import produktiv gelaufen ist. **Wie** er ablief (Handarbeit am Server, ein
nicht committetes Skript, `sqlite3`-Shell), ist aus dem Repo nicht ableitbar. Dieses Kapitel folgt
deshalb `feedback.ts` und nicht einer Rekonstruktion. **Wo mir das fehlt, steht es unten ausdrücklich
dabei** (§1.10).

**`portal.ts` ist das falsche Vorbild für die Gestalt, das richtige für die Details.** `portal.ts` ist
einstabellig und liest NDJSON aus Postgres; `feedback.ts` ist **mehrtabellig, SQLite → SQLite, mit
Fremdschlüssel-Reihenfolge** — strukturell genau das, was `radio.ts` wird. Von `portal.ts` übernommen
werden die Detailentscheidungen: Upsert per Primärschlüssel (`portal.ts:61`), `tsSeconds()`-
Normalisierung in **beiden** Paritätsarmen (`portal.ts:66-71`), und die Warnung, dass Parität **nach**
dem Schreiben läuft (`portal.ts:105-107`).

---

## 1.1 Die Eingabe: ein konsistenter Einzeldatei-Schnappschuss, kein `cp`

Der Importer nimmt **einen Pfad** und öffnet ihn **lesend**:

```ts
const quellDb = new Database(quellPfad, { readonly: true });
```

wie `scripts/import/feedback.ts:266`. Was er nicht tut: die **laufende** `data.sqlite` von
radio-admin öffnen.

⚠️ **`radio-admin` läuft im WAL-Modus** (`radio-admin/server/src/db/index.ts` setzt die Pragmas beim
Öffnen; `foreign_keys = ON` steht dort in `:28`). Eine WAL-Datenbank besteht aus **drei** Dateien:
`data.sqlite`, `data.sqlite-wal`, `data.sqlite-shm`. Ein `cp data.sqlite /tmp/snap.db` kopiert die
erste und verliert den Schwanz aller committeten Transaktionen, die noch im WAL stehen. **Und das ist
paritätsgrün:** beide Paritätsarme leiten aus dem ab, was gelesen wurde — eine zu kurze Quelle ist
mit sich selbst vollkommen einig. Genau derselbe strukturelle Grund wie beim Faktor 1000.

**Entscheidung: der Schnappschuss entsteht mit einem Befehl, der die Datenbank kennt, nicht mit einem,
der Dateien kennt.**

```bash
# im Container oder auf dem Volume, gegen die LAUFENDE Datenbank zulässig:
sqlite3 /data/data.sqlite ".backup '/data/radio-snapshot.db'"
# gleichwertig, wenn sqlite3 >= 3.27 verfügbar ist:
sqlite3 /data/data.sqlite "VACUUM INTO '/data/radio-snapshot.db'"
```

Beides erzeugt **eine** in sich geschlossene Datei ohne WAL-Anhang; beides nimmt die
Leseverriegelung, die `cp` nicht nimmt.

**`.backup` ist im Repo schon die Hausform, nicht eine Erfindung dieses Kapitels.**
`scripts/backup.sh:41-43` sichert jede `*.db` unter `DATA_DIR` mit genau diesem Befehl
(`sqlite3 "$db" ".backup '$work/…'"`), und `scripts/backup.sh:32-36` bricht sogar **hart** ab, wenn
kein `*.db` gefunden wird, „statt ein leeres Tarball zu schreiben und Erfolg zu melden". Dieser
Abschnitt wendet die vorhandene Regel nur auf die **Quellseite** an. Spec 1 §9.1 nennt dieselben
Zeilen als Beleg dafür, dass `radio.db` ohne Skriptänderung ins Backup fällt.

**Was den Schritt scheitern lässt und wie man es merkt:**

| Fehlgriff | Symptom |
|---|---|
| `cp` statt `.backup` | Der Importer läuft **grün** durch, mit zu wenigen Zeilen. Erkannt wird es **ausschließlich** am ersten Glied der Zählkette aus §1.8 — der Zählung gegen die **laufende** `data.sqlite` nach dem Freeze. Ein Vergleich Schnappschuss↔Ziel sieht es **nicht**: eine abgeschnittene Datei ist mit sich selbst vollkommen einig, aus genau demselben strukturellen Grund wie der Faktor 1000. |
| `.backup` auf ein Ziel im selben Verzeichnis, das dann per Glob mitkopiert wird | Zwei Datenbanken, eine davon veraltet. Erkennbar an `sqlite3 <snap> "select count(*) from loans"` gegen die Vorabzählung. |
| Snapshot von einem Volume, in das die Alt-App weiterschreibt (Generalprobe) | Erwartet und in Ordnung — für die Generalprobe. **Für den Echtimport nicht:** dort steht der Freeze davor (Kapitel 3). |

> **Zusage an Kapitel 2 und Kapitel 3:** Der Importer setzt einen Einzeldatei-Schnappschuss voraus,
> der mit `.backup` oder `VACUUM INTO` entstanden ist. **`cp` der `data.sqlite` ist im Runbook
> ausdrücklich verboten**, und der Verweis auf diesen Abschnitt gehört an die Schritt-Zeile.
> Der Importer prüft das nicht und kann es nicht prüfen — eine abgeschnittene Datenbank ist von einer
> kleinen nicht unterscheidbar.

**Der Importer schreibt nie in die Quelle.** `readonly: true` ist nicht Kosmetik: ohne das Flag legt
better-sqlite3 beim Öffnen einer WAL-Datenbank ein `-shm` an und darf recovern — auf einem Volume,
das im Standby unangetastet bleiben soll (Kapitel 4).

---

## 1.2 Die Spalten werden namentlich gelesen — hier ist die Rechnung dazu

Spec 1 §2.8.1 schreibt „Spalten **namentlich**, nie `SELECT *`" und beruft sich auf
`docs/runbooks/lagerbuch-cutover.md:30-31`. Das ist eine geerbte Regel. **Für `radio` ist sie
gemessen**, und die Messung ist der Grund, warum dieses Kapitel an dieser Stelle von `feedback.ts`
abweicht: `scripts/import/feedback.ts:66-72` liest mit `SELECT * FROM groups` usw. **Diesem Vorbild
wird hier nicht gefolgt.**

**Die physische Spaltenreihenfolge der produktiven Tabelle `devices` ist nicht die des Schemas.**
Zwei `ALTER TABLE ADD` hängen hinten an:

* `radio-admin/server/drizzle/0000_confused_thena.sql` erzeugt `devices` mit **23** Spalten
  (`id, rufname, issi, serial_number, device_type, status, location, assigned_to, software_version,
  last_updated_at, notes, hiorg_id, opta, funktion, hersteller, bedieneinheit, device_modes,
  alamos_integrated, loanable, created_at, updated_at, created_by, updated_by`).
* `radio-admin/server/drizzle/0001_cooing_overlord.sql:1` — `ALTER TABLE devices ADD update_note text;`
  → physische Position **24**.
* `radio-admin/server/drizzle/0004_polite_redwing.sql:1` — `ALTER TABLE devices ADD tei text;`
  → physische Position **25**.

Das Ziel entsteht dagegen **in einem Rutsch** aus der Deklarationsreihenfolge von Spec 1 §2.5.1, und
dort steht `tei` auf Position **4** (direkt hinter `issi`, wo `radio-admin/server/src/db/schema.ts:11`
es deklariert) und `update_note` auf Position **21**.

**Beide Tabellen haben 25 Spalten.** Ein positionsweiser Import scheitert also **nicht** an der
Stelligkeit — er läuft durch. Die Verschiebung, ausgeschrieben:

| Ziel-Position | Ziel-Spalte | empfängt (Quell-Position) |
|---|---|---|
| 4 | `tei` | `serial_number` (4) |
| 5 | `serial_number` | `device_type` (5) |
| 6 | `device_type` | `status` (6) |
| 7 | `status` | `location` (7) |
| 8 | `location` | `assigned_to` (8) |
| 9 | `assigned_to` | `software_version` (9) |
| 10 | `software_version` | `last_updated_at` (10) — **epoch-ms in eine Textspalte** |
| 11 | `last_updated_at` | `notes` (11) — Freitext in die Kalenderdatumsspalte |
| … | (Verschiebung um 1) | … |
| 20 | `loanable` | `created_at` (20) — **eine 13-stellige Zahl in ein 0/1-Feld: jedes Gerät „ausleihbar"** |
| 21 | `update_note` | `updated_at` (21) |
| 22 | `created_at` | `created_by` (22) — ein OIDC-`sub` in eine `integer NOT NULL`-Spalte |
| 23 | `updated_at` | `updated_by` (23) |
| 24 | `created_by` | `update_note` (24) |
| 25 | `updated_by` | `tei` (25) |

⚠️ **SQLite nimmt das alles an.** Die Tabellen sind nicht `STRICT`; Typaffinität konvertiert, wo sie
kann, und speichert sonst den Wert im Originaltyp. Ein `sub` in `created_at` ist kein Fehler, sondern
ein Wert. Die Bauform derselben Falle mit demselben Ergebnis steht in
`docs/runbooks/lagerbuch-cutover.md:33-34`, dort gemessen als `aktiv ← created_by`. Hier ist sie
gemessen als `tei ← serial_number`, und der teuerste Einzelposten ist Zeile 20: **`loanable` wird für
jedes Gerät wahr**, weil `created_at` eine große Zahl ist. Danach kann jedes Gerät ausgeliehen werden,
auch das, das seit einem Jahr in Reparatur ist. Kein Test, keine Parität, kein Constraint sieht das.

**Die Regel dieses Kapitels, verbindlich:** jede Quellabfrage nennt ihre Spalten, jede
Mapping-Funktion liest die Felder **über den Namen**, nie über eine Reihenfolge oder ein Destructuring
nach Position. Das gilt auch für `alamos_integrated` und `loanable` — die zwei 0/1-Integer, deren
Vertauschung niemandem auffällt (`radio-admin/server/src/db/schema.ts:29`, `:32`).

---

## 1.3 Die Zeitachse — der teuerste Posten der ganzen Portierung

### 1.3.1 Der Fehler, den es zu fangen gilt

Die Quelle führt epoch-**Millisekunden** (`radio-admin/server/src/db/schema.ts:37-38`, `:126-130` —
`integer(...)` ohne `mode`, und `:103-104` sagt es im Kommentar: „`borrowed_at`/`returned_at` are
epoch-ms"). Das Ziel führt Drizzle `integer(..., { mode: "timestamp" })`, und das sind Unix-**Sekunden**
(Spec 1 §2.2.1, Beleg im Repo: `scripts/import/portal.ts:66-71`).

Der Fehler ist nicht, dass er auffällt, sondern dass er **nicht** auffällt. Drei Eigenschaften
zusammen:

1. **Er ist paritätsgrün.** Beide Arme rechnen mit derselben Funktion (`portal.ts:73-76`).
2. **Er schreibt keinen Fehler.** `Math.floor(1_735_689_600 / 1000)` ist eine gültige Zahl; die
   entstehende Zeit liegt 1970.
3. **Der nächste Boot löscht die Historie.** `radio-admin/server/src/index.ts:35` startet einen
   Retention-Purge, der **sofort** läuft — der Quellkommentar nennt den Anlass wörtlich („clears any
   backlog, e.g. straight after a data migration"), Cutoff ist „jetzt minus zwei Monate". Jedes
   `returned_at` im Jahr 1970 liegt darunter. Aktive Leihen (`returned_at IS NULL`) überleben, die
   **komplette abgeschlossene Leihhistorie** nicht. Und der Import-Test bleibt grün.

Spec 1 §2.7.2 zieht daraus die Konsequenz für die Suite (kein Purge am Boot). Dieses Kapitel zieht die
andere Hälfte: **der Riegel steht im Importer, nicht im Vertrauen.**

### 1.3.2 Die drei Funktionen, ausgeschrieben

Übernommen aus Spec 1 §2.2.4 — dieser Abschnitt ändert daran nichts und ist hier nur, weil der Test in
§1.3.3 sich Zeile für Zeile darauf bezieht:

```ts
// scripts/import/radio.ts

/**
 * Plausibilitaetsspanne fuer epoch-MILLISEKUNDEN. 1e12 = 2001-09-09, 4e12 = 2096-10-02.
 * Jeder echte radio-admin-Wert liegt in dieser Spanne; ein Sekundenwert (~1.7e9) liegt
 * darunter und WIRFT, statt als 1970 durchzulaufen.
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

/** epoch-ms → Berliner Kalendertag `YYYY-MM-DD` (§2.2.3). Die Zone steht HIER, nicht in `TZ`. */
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

Der `feld`-Parameter ist keine Bequemlichkeit. Er ist der Unterschied zwischen
„`loans.returned_at`: 1735689600 liegt ausserhalb der Millisekunden-Spanne" um 23 Uhr im
Cutover-Fenster und „kein ganzzahliger Zeitstempel" ohne Ortsangabe. **Jeder Aufruf übergibt den
`tabelle.spalte`-Namen als Zeichenkette.**

### 1.3.3 Die **neun** Zeitstempel-Spalten plus die **eine** Datumsspalte, je Feld

Das ist die vollständige Zeitachse des Imports. Sie steht hier als Tabelle, weil sie sonst über fünf
Mapper verteilt ist und keine Stelle sie ganz sieht.

| Quelle (`radio-admin`) | Typ dort | Ziel | Funktion |
|---|---|---|---|
| `devices.created_at` (`schema.ts:37`) | `integer NOT NULL`, ms | `createdAt` `timestamp` NOT NULL | `msZuDatum("devices.created_at", …)` |
| `devices.updated_at` (`:38`) | `integer NOT NULL`, ms | `updatedAt` `timestamp` NOT NULL | `msZuDatum("devices.updated_at", …)` |
| `devices.last_updated_at` (`:18`) | `integer NULL`, ms | `lastUpdatedAt` **`text` `YYYY-MM-DD`** NULL | `tagInBerlin("devices.last_updated_at", …)` |
| `software_versions.created_at` (`:46`) | `integer NOT NULL`, ms | `createdAt` NOT NULL | `msZuDatum("software_versions.created_at", …)` |
| `users.last_seen_at` (`:81`) | `integer NOT NULL`, ms | `lastSeenAt` NOT NULL | `msZuDatum("users.last_seen_at", …)` |
| `device_events.changed_at` (`:95`) | `integer NOT NULL`, ms | `changedAt` NOT NULL | `msZuDatum("device_events.changed_at", …)` |
| `loans.borrowed_at` (`:126`) | `integer NOT NULL`, ms | `borrowedAt` NOT NULL | `msZuDatum("loans.borrowed_at", …)` |
| `loans.returned_at` (`:127`) | `integer NULL`, ms | `returnedAt` NULL | `msZuDatumOptional("loans.returned_at", …)` |
| `loans.created_at` (`:129`) | `integer NOT NULL`, ms | `createdAt` NOT NULL | `msZuDatum("loans.created_at", …)` |
| `loans.updated_at` (`:130`) | `integer NOT NULL`, ms | `updatedAt` NOT NULL | `msZuDatum("loans.updated_at", …)` |

**Die Zählung, und warum sie drei verschiedene Zahlen hat.** Verbindlich ist **B16**, und B16 sagt:
„`mappeApiToken` **entfällt** (Entscheidung 13: die Tabelle existiert im Ziel nicht), ebenso die drei
`api_tokens`-Fixture-Spalten; `devices.last_updated_at` bekommt eine **eigene** Zeile (TEXT
`YYYY-MM-DD` über `tagInBerlin`, §2.2.3). Es bleiben **neun** Zeitstempel-Spalten."

Damit ist die Tabelle oben genau B16: **neun** Spalten werden `mode: "timestamp"` (Zeile 1, 2 und 4–10),
**eine** wird `text` (Zeile 3, `devices.last_updated_at`) — zusammen **zehn** Quellspalten in
epoch-Millisekunden.

⚠️ **Das räumt zwei abweichende Zahlen im Bestand ab:**

* §8.2.1 zählte **dreizehn** — neun plus `last_updated_at` plus die drei `api_tokens`-Spalten. B16
  streicht die drei.
* §2.8.3 schreibt „Diese Abfrage sieht **alle elf**" über einer SQL-Abfrage mit **zehn** Summanden. Die
  Abfrage ist richtig (sie führt genau die zehn Zeilen der Tabelle oben, `last_updated_at` mit
  `IS NOT NULL`-Vorbehalt), die Wortzahl daneben ist ein Zählfehler, den B16 der Sache nach schon
  entschieden hat.

> **Zusage an Kapitel 2:** die Vorabfrage aus Spec 1 §2.8.3 bleibt bei **zehn** Summanden und
> **unverändertem Wortlaut**; die Beschriftung im Runbook lautet „zehn Spalten in epoch-Millisekunden
> (neun Zeitstempel + `devices.last_updated_at`)", nicht „elf".

`api_tokens.revoked_at` ist zusätzlich der Grund, die Spanne nicht zu lockern: `revoked_at IS NULL`
heißt dort „nicht widerrufen", und `0` heißt es **nicht** — aber die Tabelle wandert nicht, also
entsteht die Frage nie.

### 1.3.4 Der Test, der den Faktor 1000 fängt — und warum er ohne unterschiedliche Werte nichts fängt

`scripts/import/radio.test.ts`. Spec 1 §2.2.5 setzt die elf Testnamen; dieser Abschnitt setzt die
**Fixture-Werte** und die **Zusicherungen**, denn genau daran hängt, ob die Tests etwas fangen.

**Die Regel:** jedes Zeitfeld **einer** Zeile trägt einen **anderen** Wert. Sonst besteht der Test
jede Vertauschung, und eine durchgängige Division durch 1000 hasht beidseitig identisch.

```ts
// scripts/import/fixtures/radio-quelle.ts  (Rohzeilen, wie better-sqlite3 sie liefert)

export const ALT_GERAET = {
  id: "g-1",
  rufname: "HRO 1/83-1",
  issi: "1234567",                     // ≠ tei
  tei: "7654321",                      // ≠ issi
  serial_number: "SN-001",             // ≠ hiorg_id, ≠ opta
  device_type: "MTP6650",
  status: "einsatzbereit",
  location: "Funkraum",
  assigned_to: "GW-San",
  software_version: "10.5.1",
  last_updated_at: 1_740_787_200_000,  // 2025-03-01T00:00:00Z
  notes: "Stammnotiz",                 // ≠ update_note
  hiorg_id: "HO-002",
  opta: "OPTA-003",
  funktion: "Fuehrung",
  hersteller: "Motorola",
  bedieneinheit: "TMR880i",
  device_modes: "TMO,DMO",
  alamos_integrated: 1,                // ≠ loanable
  loanable: 0,                         // ≠ alamos_integrated
  update_note: "ISSI abweichend",      // ≠ notes
  created_at: 1_735_689_600_000,       // 2025-01-01T00:00:00Z
  updated_at: 1_738_368_000_000,       // 2025-02-01T00:00:00Z
  created_by: "sub-anna",              // ≠ updated_by
  updated_by: "sub-bert",              // ≠ created_by
};

// Zweites Geraet: die NULL-Variante der zwei 0/1-Integer (§1.3.5).
export const ALT_GERAET_OHNE_ANGABE = {
  ...ALT_GERAET,
  id: "g-2",
  issi: "1234568",
  alamos_integrated: null,
  loanable: null,
  last_updated_at: null,
  update_note: null,
};

export const ALT_LEIHE = {
  id: "l-1",
  device_id: "g-1",
  snapshot_call_sign: "HRO 1/83-1",    // ≠ borrower_name
  snapshot_serial_number: "SN-001",
  snapshot_device_type: "MTP6650",
  borrower_name: "Marek Sowa",         // ≠ snapshot_call_sign
  borrowed_at: 1_741_000_000_000,      // 2025-03-03T…
  returned_at: 1_741_100_000_000,      // ≠ borrowed_at, ≠ created_at, ≠ updated_at
  return_note: "Akku leer",
  created_at: 1_740_999_999_000,
  updated_at: 1_741_100_001_000,
};
```

Die elf Tests aus Spec 1 §2.2.5, jeder mit seiner **Zusicherung**:

| Test (Name verbindlich aus Spec 1 §2.2.5) | Zusicherung |
|---|---|
| `toNeuesGeraet: jedes Zeitfeld behaelt SEINEN Wert in Millisekunden` | `g.createdAt.getTime() === 1_735_689_600_000` **und** `g.updatedAt.getTime() === 1_738_368_000_000` **und** `g.createdAt.getUTCFullYear() === 2025` **und** `g.updatedAt.getUTCFullYear() === 2025`. Die drei Konstanten sind paarweise verschieden — deshalb fängt derselbe Test **auch** die Vertauschung. |
| `msZuDatum wirft bei einem Sekundenwert (1735689600)` | `expect(() => msZuDatum("t.x", 1_735_689_600)).toThrow(/Millisekunden-Spanne/)` |
| `msZuDatum wirft bei 0 und bei null-artigen Werten in einer NOT-NULL-Spalte` | `0`, `NaN`, `1.5` werfen; die Meldung nennt `t.x`. Ein `null` in einer NOT-NULL-Quellspalte kann nur aus einem `SELECT`-Tippfehler kommen und wirft über `Number.isFinite`. |
| `tagInBerlin: 2026-08-16T22:00:00Z (Formular-Mitternacht) ergibt 2026-08-17` | `=== "2026-08-17"` — fängt die UTC-Kürzung, die den Tag zurückschiebt |
| `tagInBerlin: 2026-08-17T00:00:00Z (CSV-Weg) ergibt 2026-08-17` | `=== "2026-08-17"` |
| `tagInBerlin: 2026-08-17T14:35:00Z (Date.now()-Weg) ergibt 2026-08-17` | `=== "2026-08-17"` |
| `toNeueLeihe: snapshot_call_sign und borrower_name werden nicht vertauscht` | `l.snapshotCallSign === "HRO 1/83-1"` **und** `l.borrowerName === "Marek Sowa"` — beide, nicht eines |
| `toNeuesGeraet: alamos_integrated und loanable werden nicht vertauscht` | `g.alamosIntegrated === true` **und** `g.loanable === false` |
| `toNeuesGeraeteEreignis wirft bei source="importiert"` | `toThrow(/source/)` — der fünfte Enum-Wert ohne DB-CHECK |
| `paritaetsSichtGeraet liefert Sekunden fuer beide Arme` | `paritaetsSichtGeraet(toNeuesGeraet(ALT_GERAET)).createdAt === 1_735_689_600` |
| `Import ist asymmetrisch idempotent: Zielzeile geaendert, erneut importiert` | §1.6 — und die Zusicherung dort ist ein **Fehlschlag**, nicht ein No-Op |

**Der Test, der die Spalten-Reihenfolge fängt, ist kein Unit-Test.** Er hängt an der Fixture-Quelle
und steht in §1.5.3.

### 1.3.5 Die dritte Falle derselben Bauart: `null` in einem `{ mode: "boolean" }`-Feld

`alamos_integrated` (`radio-admin/server/src/db/schema.ts:29`) und `loanable` (`:32`) sind **nullable**
— in der Quelle und im Ziel (Spec 1 §2.5.1 deklariert beide ohne `.notNull()`). Der Importer liest sie
**roh** über better-sqlite3, also als `0 | 1 | null`; Drizzles `{ mode: "boolean" }` ist dabei nicht
im Spiel, weil die Quelle nicht über Drizzle gelesen wird.

⚠️ **`portal.ts:46-48` benutzt `!!row.is_public`, und das darf hier nicht übernommen werden.** Dort ist
es unbedenklich, weil die Spalten `notNull` sind. Hier faltet `!!null` das `null` zu `false` — aus
„TEI/Alamos **nicht erfasst**" wird „**nicht** integriert", und aus „Ausleihbarkeit unbekannt" wird
„nicht ausleihbar". Es ist paritätsgrün aus demselben strukturellen Grund wie der Faktor 1000, und die
Fixture aus Spec 1 §2.2.5 (`alamos_integrated: 1, loanable: 0`) besteht den Vertauschungstest, während
der Null-Kollaps mitgeliefert wird.

**Entscheidung: expliziter Dreier-Ausdruck, nie `!!`.**

```ts
const zuBoolOptional = (v: 0 | 1 | null): boolean | null => (v === null ? null : v === 1);
```

**Ergänzend zu Spec 1 §2.2.5, ein zwölfter Test** (additiv, kein Widerspruch):
`toNeuesGeraet: alamos_integrated=null und loanable=null bleiben null` — Zusicherung
`g.alamosIntegrated === null` und `g.loanable === null`, gegen `ALT_GERAET_OHNE_ANGABE`.
`expect(g.loanable).toBeFalsy()` wäre **kein** Test: `false` besteht ihn.

Dasselbe gilt für jede nullable Textspalte, aber dort ist der Schaden sichtbar: `?? null` statt
`?? ""` — eine leere Zeichenkette und ein `null` sehen in der Oberfläche gleich aus, in einer
`IS NULL`-Abfrage aber nicht.

---

## 1.4 Je Tabelle: Quellabfrage, Ziel, Mapping

Fünf Tabellen wandern. Die Quellabfragen stehen in einer Funktion `lieseQuelle(quellDb)`, nach dem
Muster `scripts/import/feedback.ts:66-72` — aber mit Spaltennamen (§1.2).

### 1.4.1 `users` (3 Spalten)

```sql
SELECT sub, name, last_seen_at FROM users;
```

| Quelle | Ziel (`users`) | Mapping |
|---|---|---|
| `sub` | `sub` (PK) | 1:1, **roh**. Der `pocketid:`-Präfix ist ein Artefakt des Kiosk (`radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`) und kommt hier nie an — `radio-admin` schreibt den `sub` schon roh (`radio-admin/server/src/db/schema.ts:79`). |
| `name` | `name` (NOT NULL) | 1:1 |
| `last_seen_at` | `lastSeenAt` (NOT NULL) | `msZuDatum("users.last_seen_at", …)` |

Keine Zuordnungstabelle `alt_sub → neu_sub`: die Pocket-ID-Instanz führt
`subject_types_supported: ["public"]`, der `sub` ist über beide OIDC-Clients identisch (Spec 1 §2.5.3).

⚠️ `select count(*) from users` ist **keine** Personenzahl (Spec 1 §2.5.3) — auch nicht im
Cutover-Protokoll.

⚠️ **Der Importer filtert `users` NICHT, und er repariert keine Waise.** Zwei Richtungen, beide
gewollt:

* Ein `sub` in `devices.created_by`, `devices.updated_by`, `device_events.changed_by` oder
  `software_versions.created_by` **ohne** `users`-Zeile bricht nichts — es gibt keinen FK auf
  `users.sub` (Spec 1 §2.3), und die Oberfläche rendert dann die rohe Kennung statt eines Namens.
* Eine `users`-Zeile, deren `sub` in keiner Auditspalte vorkommt, wandert trotzdem mit. `lagerbuch`
  hat hier **gefiltert** (`docs/runbooks/lagerbuch-cutover.md:415`, Zeile „`users`-Tabelle");
  dieses Kapitel filtert **nicht**, weil die Tabelle in `radio` nur drei Spalten hat, keine Klarnamen
  jenseits von `name` trägt und ein Filter die Anzeige eines später wieder auftauchenden `sub`
  verschlechtert, ohne etwas zu schützen.

Der Fall, in dem das teuer wird, ist **U7** aus Spec 1 §9.8: lief `radio-admin` in Produktion je mit
`AUTH_DEV_BYPASS`, tragen die Auditspalten synthetische Kennungen ohne `users`-Zeile, und nach dem
Import zeigt jede Ereigniszeile eine rohe Zeichenkette. **Das ist keine Importentscheidung** — der
Importer wandert, was da ist — sondern eine Messung am Bestand: Spec 1 §9.4.1 Abfrage 8 beantwortet
sie. *Zusage an Kapitel 2:* die Abfrage läuft in der Generalprobe, nicht im Fenster; ihr Ergebnis
ändert am Importer **nichts** und an der Erwartungshaltung der Verifikation alles.

### 1.4.2 `software_versions` (6 Spalten)

```sql
SELECT id, value, created_at, created_by, sort_order, is_target FROM software_versions;
```

| Quelle | Ziel | Mapping |
|---|---|---|
| `id` | `id` (PK) | 1:1 (cuid2 aus `radio-admin/server/src/db/id.ts`) |
| `value` | `value` (NOT NULL, unique) | 1:1, **keine** Normalisierung. `software_versions_value_unique` besteht in beiden DBs (`0000_confused_thena.sql`), ein Trimmen erzeugte hier einen Konflikt, den es in der Quelle nicht gab. |
| `created_at` | `createdAt` (NOT NULL) | `msZuDatum("software_versions.created_at", …)` |
| `created_by` | `createdBy` (NULL) | 1:1. **Tote Spalte, wandert trotzdem** — geschrieben (`radio-admin/server/src/repos/softwareVersionRepo.ts:39`, `:53`), in keiner Projektion gelesen. Kriterium ist „wird sie geschrieben?", nicht „wird sie gelesen?" (§1.7). |
| `sort_order` | `sortOrder` (NOT NULL, default 0) | `row.sort_order ?? 0` — reine Anzeigereihenfolge, leitet den Ziel-Stand **nicht** ab (`radio-admin/server/src/db/schema.ts:48-51`) |
| `is_target` | `isTarget` (NOT NULL, default false) | `row.is_target === 1`. In der Quelle `NOT NULL` (`0002_numerous_mandroid.sql:2`), also **kein** `zuBoolOptional`. |

⚠️ **Genau eine Zeile darf `is_target = 1` tragen, und keine Datenbank erzwingt das.**
`getTargetVersion` (`radio-admin/server/src/repos/softwareVersionRepo.ts:63-70`) hat **kein**
`ORDER BY`: bei zwei Marken entscheidet die Reihenfolge, in der SQLite zufällig liefert, über den
angezeigten Update-Stand **jedes** Geräts. Der Importer wandert die Spalte 1:1 und kann das nicht
retten — **die Abwehr ist die blockierende Vorabfrage Nr. 2 aus Spec 1 §2.8.3.**
**Zusage an Kapitel 2:** diese Zählung ist blockierend und muss **genau 1** ergeben; bei 0 oder 2
bricht das Fenster ab, nicht der Importer.

### 1.4.3 `devices` (25 Spalten)

```sql
SELECT id, rufname, issi, tei, serial_number, device_type, status, location, assigned_to,
       software_version, last_updated_at, notes, hiorg_id, opta, funktion, hersteller,
       bedieneinheit, device_modes, alamos_integrated, loanable, update_note,
       created_at, updated_at, created_by, updated_by
FROM devices;
```

Die Reihenfolge in diesem `SELECT` ist die des **Ziels** (Spec 1 §2.5.1), nicht die physische der
Quelle — das ist zulässig und erwünscht, weil das Ergebnis namentlich gelesen wird und die Liste so
Feld für Feld gegen das Zielschema gegengelesen werden kann.

| Quelle | Ziel | Mapping |
|---|---|---|
| `id` | `id` (PK) | 1:1 |
| `rufname` | `rufname` | `?? null` |
| `issi` | `issi` (NOT NULL, unique) | 1:1. **Nicht** `tei`. |
| `tei` | `tei` (NULL, **nicht** unique) | 1:1. Ein `unique()` im Ziel bräche beim zweiten Gerät ohne TEI (Spec 1 §2.5.1) — das ist Sache des Schemas, nicht des Importers, hier nur als Warnung an den Gegenleser. |
| `serial_number`, `device_type`, `status`, `location`, `assigned_to`, `software_version`, `notes`, `hiorg_id`, `opta`, `funktion`, `hersteller`, `bedieneinheit` | gleichnamig | `?? null`, keine Normalisierung, kein Trim |
| `device_modes` | `deviceModes` | 1:1, **keine** Normalisierung. Klartext, komma-verbunden („TMO,DMO"); genau eine Stelle liest und splittet ihn (Spec 1 §2.5.1). |
| `last_updated_at` | `lastUpdatedAt` (**`text`**) | `tagInBerlin("devices.last_updated_at", …)` — **Typwechsel** `integer` → `text YYYY-MM-DD` (Spec 1 §2.2.3) |
| `alamos_integrated` | `alamosIntegrated` | `zuBoolOptional` (§1.3.5) |
| `loanable` | `loanable` | `zuBoolOptional` (§1.3.5). Stammdatum; war nie in `UPDATER_EDITABLE_FIELDS` (`radio-admin/server/src/db/schema.ts:30-32`). |
| `update_note` | `updateNote` | `?? null`. **Append-only** in der Quelle (`:33-36`) — genau die Spalte, die ein Zweitimport plattwalzt (§1.6). |
| `created_at` / `updated_at` | `createdAt` / `updatedAt` | `msZuDatum` mit dem jeweiligen Feldnamen |
| `created_by` / `updated_by` | `createdBy` / `updatedBy` | 1:1, **ohne** FK auf `users.sub`. Ein FK hier bräche jeden Kaltimport, dessen `sub`-Werte in der Suite noch nie eingeloggt waren — also jeden (Spec 1 §2.3). |

### 1.4.4 `device_events` (8 Spalten)

```sql
SELECT id, device_id, field, old_value, new_value, changed_by, changed_at, source
FROM device_events;
```

| Quelle | Ziel | Mapping |
|---|---|---|
| `id` | `id` (PK) | 1:1 |
| `device_id` | `deviceId` (NOT NULL, **FK → `devices.id` ON DELETE CASCADE**) | 1:1 |
| `field`, `old_value`, `new_value`, `changed_by` | gleichnamig | `?? null` bzw. 1:1 |
| `changed_at` | `changedAt` (NOT NULL) | `msZuDatum("device_events.changed_at", …)` |
| `source` | `source` (Drizzle-Enum) | **geprüft**, siehe unten |

```ts
const EREIGNIS_QUELLEN = ["manual", "csv-import", "create", "update-note"] as const;

function pruefeQuelle(id: string, roh: string): (typeof EREIGNIS_QUELLEN)[number] {
  if (!(EREIGNIS_QUELLEN as readonly string[]).includes(roh)) {
    throw new Error(`device_events.source: unbekannter Wert "${roh}" (Zeile ${id})`);
  }
  return roh as (typeof EREIGNIS_QUELLEN)[number];
}
```

Warum das nötig ist: `source` ist in Drizzle ein Enum (`radio-admin/server/src/db/schema.ts:96`), in
SQL aber nur `` `source` text NOT NULL `` (`0000_confused_thena.sql`, Tabelle `device_events`). Die
Datenbank nimmt **jeden** String; ein fünfter Wert passiert Datenbank **und** Typprüfung
unbeanstandet und bricht erst in einem erschöpfenden `switch` der Oberfläche — Monate später, in einer
Detailansicht.

⚠️ **Der Riegel wirft, also muss er vor dem Fenster feuern.** Genau dasselbe Argument, mit dem Spec 1
§2.8.3 Nr. 6 den Zeitstempel-Riegel zu einer Vorabfrage macht — nur fehlt die Entsprechung dort.
**Zusage an Kapitel 2 (eine zusätzliche Vorabfrage zu denen aus Spec 1 §2.8.3; die Nummerierung
gehört Kapitel 2, weil §9.4.1 dort schon mindestens acht Abfragen führt):**

```sql
SELECT DISTINCT source FROM device_events;
-- Ergebnis MUSS eine Teilmenge von {manual, csv-import, create, update-note} sein.
```

Blockierend, aus demselben Grund wie Nr. 6: ein Treffer ist in der Generalprobe eine halbe Stunde
Arbeit und im Echtlauf ein Abbruch um 23 Uhr.

### 1.4.5 `loans` (11 Quellspalten → 12 Zielspalten)

```sql
SELECT id, device_id, snapshot_call_sign, snapshot_serial_number, snapshot_device_type,
       borrower_name, borrowed_at, returned_at, return_note, created_at, updated_at
FROM loans;
```

| Quelle | Ziel | Mapping |
|---|---|---|
| `id` | `id` (PK) | 1:1 |
| `device_id` | `deviceId` (NOT NULL, **absichtlich kein FK**) | 1:1. Den FK **nicht** nachziehen: `radio-admin/server/src/db/schema.ts:106-110` begründet es im Quelltext (Cascade löscht Historie, Restrict blockiert das Ausmustern). |
| `snapshot_call_sign` | `snapshotCallSign` (NOT NULL) | 1:1. **Nicht** `borrower_name`. |
| `snapshot_serial_number`, `snapshot_device_type` | gleichnamig | `?? null` |
| `borrower_name` | `borrowerName` (NOT NULL) | 1:1. Personenbezogen, der DSGVO-Grund der Retention. |
| `borrowed_at` | `borrowedAt` (NOT NULL) | `msZuDatum("loans.borrowed_at", …)` |
| `returned_at` | `returnedAt` (NULL) | `msZuDatumOptional("loans.returned_at", …)` — **`NULL` heißt „aktive Leihe" und muss `NULL` bleiben.** Ein `?? new Date(0)` machte jede aktive Leihe zu einer 1970 zurückgegebenen. |
| `return_note` | `returnNote` | `?? null` |
| — | **`zugangscodeId`** | **immer `null`** (Spec 1 §2.11 Zusage 7, B6). Die Spalte hat keine Quelle; sie trägt die **Herkunft des Zugangs**, nicht die Identität der Person, und für jede Alt-Leihe gibt es keine. |
| `created_at` / `updated_at` | `createdAt` / `updatedAt` | `msZuDatum` mit dem jeweiligen Feldnamen |

**`zugangscode_id` steht explizit als `null` im Mapper, nicht implizit durch Auslassen.** Grund: nur so
ist die Spalte in der Paritätssicht (§1.5.2) auf beiden Armen vorhanden, und nur dann fällt es auf,
wenn irgendetwas dort einen Wert hineinschreibt.

### 1.4.6 `zugangscodes` — nicht Teil des Imports, und trotzdem eine Zeile hier

`zugangscodes` wird **nicht** importiert (Spec 1 §2.8.2 Nr. 5): in der Quelle gibt es nichts, was ihr
entspräche — der heutige QR-Mechanismus trägt den **einen** geteilten API-Token base64-kodiert als
URL-Parameter (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`), ohne
Ablauf und ohne Widerruf. Es gibt also keine Zeile zu übernehmen, sondern eine **Verhaltensänderung**.

Zwei Dinge, die deshalb in dieses Kapitel gehören:

1. **Der Importer schreibt nie in `zugangscodes`.** Ein Import oder Seed, der Codes „als aktiv" anlegt,
   reaktiviert still jeden gesperrten Code (Spec 1 §2.5.6) — und zwar genau die, die gesperrt wurden,
   weil ein Kärtchen verschwunden ist.
2. **`zugangscodes` braucht trotz FK-Elternschaft keine Position in der Einfügereihenfolge.**
   `loans.zugangscode_id` ist für **jede** importierte Zeile `NULL`, und SQLite prüft eine
   Fremdschlüsselkante bei einem `NULL`-Kindwert nicht. Das steht hier, weil ein gewissenhafter Leser
   die Reihenfolge in §1.5.1 sonst für falsch hält.

> **Zusage an Kapitel 3:** Der erste Satz Zugangscodes entsteht **in der Suite**, ausgestellt von einem
> radio-admin, **nach** dem Import und **vor** dem Umschwenken des Routers — sonst steht die neue
> Ausleihfläche im Moment des Schwenks ohne einen einzigen einlösbaren Code da. Das ist ein
> benannter Schritt im Cutover, kein Nacharbeiten.
> **Zusage an Kapitel 3:** Die Ankündigungspflicht (gedruckte Aufsteller werden ersetzt) hängt daran.

---

## 1.5 Der Ablauf einer Ausführung

### 1.5.1 Einfügereihenfolge — Pflicht, nicht Stil

`foreign_keys = ON` ist in **beiden** Datenbanken scharf: `radio-admin/server/src/db/index.ts:28` und
`src/core/db/index.ts:19`. Die eine Kante `device_events.device_id → devices.id` bricht **hart** ab,
wenn ein Ereignis vor seinem Gerät eingefügt wird.

1. **`users`** — frei, keine Abhängigkeit
2. **`software_versions`** — frei, keine Abhängigkeit
3. **`devices`**
4. **`device_events`** — **nach** `devices`, erzwungen durch die FK-Kante
5. **`loans`** — formal frei (kein FK auf `devices`), fachlich nach `devices`; `zugangscode_id` ist
   überall `NULL`, die zweite Kante wird nie ausgewertet (§1.4.6)

`zugangscodes` fehlt in der Liste (§1.4.6). `api_tokens` fehlt ebenfalls, **und das ist die einzige
Stelle, an der dieses Kapitel der Übergabeliste widerspricht:**

⚠️ **Widerspruch, hier entschieden.** Spec 1 §9.1 führt in ihrer Einfügereihenfolge
„(1) `users`, `software_versions`, **`api_tokens`** (untereinander frei)" und schreibt daneben,
`api_tokens` „wandert nur, soweit Historie es verlangt" und die sechs Zeilenzahlen gälten, „weil die
Tabelle **in der Paritaet steht**". Das ist mit **B16** unvereinbar, und B16 gewinnt: dort steht
wörtlich „`mappeApiToken` **entfällt** (Entscheidung 13: **die Tabelle existiert im Ziel nicht**)".
§2.8.2 und §2.10 Nr. 1 sind auf B16 nachgezogen, §9.1 ist es nicht.

Die Folgen, ausgeschrieben, weil §9.1 wörtlich ins Runbook wandern soll und ein Leser sie sonst
gegeneinander hält:

1. **Keine Position in der Einfügereihenfolge** — es gibt kein Ziel, in das eingefügt würde.
2. **`api_tokens` steht in KEINEM der beiden Paritätsarme.** „Weil die Tabelle in der Parität steht" ist
   nach B16 nicht mehr wahr; der Zielarm hätte keine Tabelle zu lesen. Der Paritätscheck deckt **fünf**
   Tabellen, nicht sechs.
3. **Die Zählung `SELECT COUNT(*) FROM api_tokens;` bleibt trotzdem** — als **Protokollzeile**, nicht
   als Paritäts-Sollwert (§1.7, §1.8). Das ist der Grund, warum die Zeile in §9.4.1 richtig steht,
   auch wenn ihre Begründung dort falsch ist.

> **Zusage an Kapitel 2, 3 und 4:** wo die wörtliche Übernahme von Spec 1 §9.1 ins Runbook diese zwei
> Zellen mitbringt, werden sie **korrigiert** übernommen, mit Verweis auf B16 — nicht abgeschrieben.
> Spec 1 §9 sagt „wo Spec 2 von dieser Liste abweicht, ist es ein Fehler in Spec 2"; für diese zwei
> Zellen gilt die Ausnahme, die Kapitel B selbst setzt („Verbindlich ist diese Tabelle").

**Kein `PRAGMA defer_foreign_keys`.** Die Kantenmenge ist azyklisch und mit dieser Reihenfolge
erfüllbar; `lagerbuch` brauchte es wegen `lagerorte.templateId`, hier gibt es kein Gegenstück.

**Was das scheitern lässt und wie man es merkt:** ein `device_events`-Insert vor `devices` wirft
`SQLITE_CONSTRAINT_FOREIGNKEY`. Das ist ein **lauter** Fehlschlag — der einzige laute in diesem
Kapitel. Ein Waisen-Ereignis in der Quelle (Gerät gelöscht, Ereignis geblieben) löst denselben Fehler
aus, und **dagegen** steht die Vorabfrage Nr. 3 aus Spec 1 §2.8.3 (`LEFT JOIN … WHERE d.id IS NULL`
muss 0 sein). In der Quelle kann es solche Zeilen eigentlich nicht geben — die Kante ist dort
`ON DELETE CASCADE` (`0000_confused_thena.sql`) —, **aber nur, solange `foreign_keys = ON` bei jedem
Schreiben gesetzt war**, und das ist eine Laufzeiteigenschaft, kein Schemainvariant. Die Abfrage bleibt.

### 1.5.2 Parität: ein Multiset über alle fünf Tabellen, mit Tabellen-Tag

Bauform übernommen aus `scripts/import/feedback.ts:238-262`: je Tabelle eine Paritätssicht, dann
**ein** getaggtes Multiset über alle Tabellen, dann **ein** `checkParity`.

```ts
function getaggteQuellzeilen(q: RadioQuelle): Row[] {
  return [
    ...q.users.map((r) => ({ __table: "users", ...paritaetsSichtBenutzer(toNeuenBenutzer(r)) })),
    ...q.softwareVersions.map((r) => ({ __table: "software_versions", ...paritaetsSichtSoftwareVersion(toNeueSoftwareVersion(r)) })),
    ...q.devices.map((r) => ({ __table: "devices", ...paritaetsSichtGeraet(toNeuesGeraet(r)) })),
    ...q.deviceEvents.map((r) => ({ __table: "device_events", ...paritaetsSichtGeraeteEreignis(toNeuesGeraeteEreignis(r)) })),
    ...q.loans.map((r) => ({ __table: "loans", ...paritaetsSichtLeihe(toNeueLeihe(r)) })),
  ];
}
```

Das `__table`-Tag ist Pflicht und nicht Kosmetik: `scripts/import/feedback.ts:235-237` begründet es —
strukturell identische Zeilen verschiedener Tabellen kollidieren sonst im Multiset. Hier ist der Fall
real: eine `users`-Zeile und eine `software_versions`-Zeile könnten beide auf
`{id/sub, name/value, createdAt}` hinauslaufen.

**Vier Regeln für die fünf Paritätssichten:**

1. **Alle Spalten, namentlich, keine Auswahl.** 25 + 6 + 3 + 8 + **12** Felder. „Parität grün"
   zertifiziert dann die ganze Zeile, nicht eine handverlesene Teilmenge (`portal.ts:78-81`).
   `loans` bekommt **12** Felder, inklusive `zugangscodeId: r.zugangscodeId ?? null`.
2. **Jedes `timestamp`-Feld auf beiden Armen durch `sekunden()`.** Drizzle schreibt Sekunden, die
   Sub-Sekunden gehen beim Schreiben verloren — ohne diese Normalisierung scheitert ein
   zeichengleicher Import allein an Präzision (`portal.ts:66-71`).
   `const sekunden = (d: Date | null) => (d ? Math.floor(d.getTime() / 1000) : null);`
3. **`devices.lastUpdatedAt` wird NICHT umgerechnet** — es ist `text` (`YYYY-MM-DD`), `?? null`.
4. **Insert-Defaults normalisieren, nicht weglassen:** `sortOrder: r.sortOrder ?? 0`,
   `isTarget: r.isTarget ?? false`. Zur Laufzeit inert (der Mapper liefert immer konkrete Werte), aber
   der `New…`-Typ lässt sie optional (`portal.ts:79-80` macht es genauso).

⚠️ **Der Paritätscheck vergleicht gegen den ganzen Zielbestand.** `feedback.ts:248-256` liest
`db.select().from(...).all()` ohne `WHERE`. Läuft der Import gegen eine Ziel-DB, in der schon Zeilen
stehen, ist Parität **rot** mit `missingInSource` — und das ist erwünscht: **der Paritätscheck ist
zugleich der Nachweis, dass die Ziel-DB leer war.** `zugangscodes` ist davon nicht betroffen: die
Tabelle steht in keinem der beiden Multisets, ein vor dem Import ausgestellter Code macht Parität
also nicht rot — **eine Frage der Vollständigkeit, nicht eine Erlaubnis:** beim Echtimport wird
`radio.db` vorher entfernt (§1.6.4), und damit kann es zu diesem Zeitpunkt überhaupt keine
`zugangscodes`-Zeile geben. **Der erste Satz Codes entsteht nach dem Import** (§1.4.6) — wer ihn davor
ausstellt, verliert ihn mit der Datei. Das ist eine Reihenfolge, die Kapitel 3 einhalten muss, und
kein Nebensatz.

> **Zusage an Kapitel 2 und 3:** Der Echtimport läuft gegen eine Ziel-`radio.db`, die außer den
> Migrationen **nichts** enthält — auch keine Zugangscodes. Läuft er gegen ein bespieltes Ziel, ist
> Parität rot, und Spec 1 §2.8.4 gilt: der Rückweg ist die **leere** Ziel-DB, nicht ein zweiter
> Versuch. Der Runbook-Schritt heißt „`radio.db` löschen, dann importieren", nicht „importieren".
> Die Schrittfolge im Cutover ist damit festgelegt: **Import → Zugangscodes ausstellen →
> Verifikation → Router umschwenken.**

### 1.5.3 Die Rahmenfunktion und der CLI-Aufruf

```ts
type RadioDb = BetterSQLite3Database<typeof schema>;
// Innerhalb von db.transaction() ist der Empfaenger NICHT die Datenbank, sondern der
// Transaktionskontext. Beide muessen in die Signatur, sonst kompiliert der Aufruf unten
// nicht — und das ist die Art Fehler, die man erst beim Bau sieht.
type RadioTx = SQLiteTransaction<
  "sync",
  Database.RunResult,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export function importiereRadio(quelle: RadioQuelle, db: RadioDb | RadioTx): void { /* §1.5.1 */ }

export function runRadioImport(quellPfad: string): void {
  migrateAllModules();                                   // wie portal.ts:102, feedback.ts:265

  const quellDb = new Database(quellPfad, { readonly: true });
  let quelle: RadioQuelle;
  try {
    quelle = lieseQuelle(quellDb);                       // die fuenf SELECTs aus §1.4
  } finally {
    quellDb.close();
  }

  // Erste Ausgabezeile: die fuenf gelesenen Zaehlungen — damit das Runbook sie
  // gegen die Vorabzaehlung stellen kann, OHNE eine zweite Abfrage zu fahren.
  console.log(
    `Quelle: users=${quelle.users.length} software_versions=${quelle.softwareVersions.length} ` +
      `devices=${quelle.devices.length} device_events=${quelle.deviceEvents.length} ` +
      `loans=${quelle.loans.length}`,
  );

  const db = getModuleDb("radio", schema);               // src/core/db/index.ts:27-36

  // EINE Transaktion ueber alle fuenf Tabellen: ein FK-Abbruch bei device_events
  // laesst sonst devices halb drin. Das macht einen ROTEN PARITAETSCHECK NICHT
  // rueckgaengig — der laeuft danach (siehe unten).
  db.transaction((tx) => importiereRadio(quelle, tx));

  // NB (portal.ts:105-107, feedback.ts:274-276): Paritaet laeuft NACH diesem Schreiben.
  // Ein geworfener Paritaetsfehler heisst, das Ziel wurde bereits beschrieben — nicht
  // "nichts ist passiert".
  const report = checkRadioParitaet(quelle, db);
  assertParity(report);                                  // parity.ts:58-65
  console.log(`Radio-Import OK — ${report.sourceCount} Zeilen, Paritaet gruen.`);
}

// CLI: tsx scripts/import/radio.ts <radio-snapshot.db>   (DATA_DIR steuert das Ziel)
if (import.meta.url === `file://${process.argv[1]}`) {
  const src = process.argv[2];
  if (!src) {
    console.error("usage: tsx scripts/import/radio.ts <radio-snapshot.db>");
    process.exit(1);
  }
  try {
    runRadioImport(src);
  } catch (err: unknown) {
    console.error(err);
    process.exit(1);
  }
}
```

Drei Abweichungen von `feedback.ts` und ihre Begründung:

* **Synchron, nicht `async`.** `feedback.ts:264` ist `async` ohne `await` im Rumpf; better-sqlite3 ist
  durchgehend synchron. Synchron heißt: `db.transaction()` ist benutzbar (die asynchrone Variante
  wäre es nicht).
* **Eine Transaktion um das Schreiben.** `portal.ts` und `feedback.ts` haben keine. Bei einer
  einstabelligen bzw. constraint-armen Quelle fällt das nicht auf; hier hinterlässt ein
  FK-Abbruch in Schritt 4 einen halben Bestand. **Das ändert Spec 1 §2.8.4 nicht:** ein *roter
  Paritätscheck* bleibt „das Ziel ist beschrieben", weil die Prüfung außerhalb der Transaktion läuft —
  und das ist so gewollt, denn nur so lässt sich das Ergebnis mit `sqlite3` nachsehen.
  ⚠️ **Der Preis der Transaktion ist eine Signatur, die zwei Typen annehmen muss** (`RadioDb | RadioTx`
  oben): innerhalb von `db.transaction()` ist der Empfänger der Transaktionskontext, nicht die
  Datenbank. Wer `importiereRadio(quelle: RadioDb)` schreibt, bekommt einen Typfehler an genau einer
  Stelle — laut und billig, aber nur, wenn man ihn erwartet. `SQLiteTransaction` kommt aus
  `drizzle-orm/sqlite-core`, `ExtractTablesWithRelations` aus `drizzle-orm`, `Database.RunResult` aus
  `better-sqlite3`. Verbindlich an diesem Absatz ist die **Union**, nicht die Buchstabenzahl der
  Parameterliste: passt sie in der gebauten Drizzle-Version nicht, liest man sie am Typfehler des
  Aufrufs ab — die Aussage „der Schreiber nimmt beides" bleibt.
* **Die Zählzeile vor dem Schreiben.** Sie erspart dem Runbook eine zweite Abfragerunde und macht den
  `cp`-Fehler aus §1.1 an genau **einer** Stelle sichtbar.

**Der Aufruf steuert das Ziel über `DATA_DIR`** — `src/core/db/index.ts:8-10`,
`moduleDbPath("radio") === "${DATA_DIR}/radio.db"`. Das ist der ganze Unterschied zwischen
Generalprobe und Echtlauf, soweit es den Importer angeht:

```bash
# Generalprobe: eigenes DATA_DIR, Schnappschuss-Kopie
DATA_DIR=/data/probe pnpm tsx scripts/import/radio.ts /data/radio-snapshot.db

# Echtlauf: das produktive DATA_DIR, radio.db vorher entfernt
DATA_DIR=/data pnpm tsx scripts/import/radio.ts /data/radio-snapshot.db
```

⚠️ **`migrateAllModules()` legt die Ziel-DB an, wenn sie fehlt** — deshalb ist „`radio.db` löschen"
ein zulässiger Schritt und kein Sabotageakt. Umgekehrt: wer `DATA_DIR` vergisst, importiert nach
`./.data/radio.db` (der Default in `src/core/db/index.ts:6`), meldet Parität grün und hat nichts
migriert. **Wie man es merkt:** die Zeile
`sqlite3 "$DATA_DIR/radio.db" "select count(*) from devices"` **nach** dem Lauf, gegen die Zählzeile
der Ausgabe. **Zusage an Kapitel 2:** dieser Nachvergleich ist ein eigener Runbook-Schritt, nicht
eine Fußnote am Importschritt.

---

## 1.6 Idempotenz — der asymmetrische Fall, und was der Test zusichert

### 1.6.1 Die Konfliktstrategien

| Tabelle | Strategie | Grund |
|---|---|---|
| `users`, `software_versions`, `devices`, `loans` | `onConflictDoUpdate` per Primärschlüssel (`portal.ts:61`) | Zielt auf die leere Ziel-DB; der Upsert ist die Sicherung gegen einen **abgebrochenen** Lauf |
| `device_events` | **`onConflictDoNothing`** (`INSERT OR IGNORE`) | Die Tabelle ist ein **Journal**. Ein Upsert ist dort fachlich falsch — `docs/runbooks/lagerbuch-cutover.md:409` unterscheidet genau das |

Beide aus Spec 1 §2.8.4, unverändert.

### 1.6.2 Warum der naheliegende Test nichts beweist

Ein Test, der **zweimal dieselbe Quelle** importiert, ist bei Upsert-per-Primärschlüssel **immer**
grün — und bei `onConflictDoNothing` auch. Er prüft nicht Idempotenz, sondern dass `INSERT … ON
CONFLICT` existiert. `docs/radio-portierung-analyse.md:1292-1301` sagt es und Spec 1 §2.2.5 wiederholt
es.

Der echte Fall ist **asymmetrisch**: zwischen Generalprobe und Echtimport wurde weitergearbeitet — in
der Suite, in der Alt-App, oder in beiden. Und er geht in **beide** Richtungen falsch.

### 1.6.3 Der Test — und seine Zusicherung ist ein **Fehlschlag**

⚠️ **Das ist die Stelle, an der eine Spec sich selbst belügen kann.** Die naheliegende Zusicherung
lautet „der zweite Import ändert nichts". Sie ist **falsch**: der zweite Import ändert nachweislich
etwas, und genau deshalb ist „Echtimport gegen eine **leere** Ziel-DB nach dem Freeze" eine
Schutzmaßnahme und keine Stilfrage. Der Test schreibt das **beobachtete, unerwünschte** Verhalten
fest. Ein Test, der Erfolg zusicherte, wäre eine Zusage, welche die Bauform nicht hält — genau der
Präzedenzfall, an dem die `lagerbuch`-Spec sich verhoben hat.

`scripts/import/radio.test.ts`, drei Fälle unter dem Namen aus Spec 1 §2.2.5
(`Import ist asymmetrisch idempotent: Zielzeile geaendert, erneut importiert`):

**Fall A — `devices.update_note` wird plattgewalzt (still).**

```
1. Import gegen leeres Ziel. ALT_GERAET.update_note === "ISSI abweichend".
2. Im ZIEL anhaengen (der Weg, den die Suite baut):
   update devices set update_note = "ISSI abweichend\nAntenne getauscht" where id = "g-1";
3. Erneut importieren, dieselbe Quelle.
4. ZUSICHERUNG: geraet.updateNote === "ISSI abweichend"
   — der in der Suite angehaengte Satz ist WEG, ohne Fehler, ohne Warnung.
```

Der Kommentar über der Zusicherung nennt den Grund: `update_note` ist in der Quelle **append-only**
(„never overwritten by the update flow", `radio-admin/server/src/db/schema.ts:33-36`), und
`onConflictDoUpdate` kennt kein Anhängen. **Wie man es im Betrieb merkt: gar nicht.** Deshalb der
Freeze.

**Fall B — `loans.returned_at` wird auferstehen gelassen (laut, aber zu spät).**

```
1. Import gegen leeres Ziel. ALT_LEIHE_AKTIV: device_id "g-1", returned_at NULL.
2. Im ZIEL zurueckgeben (der Weg, den die Suite baut):
   update loans set returned_at = <jetzt> where id = "l-aktiv";
3. Im ZIEL eine NEUE Leihe auf dasselbe Geraet anlegen — voellig legitim,
   das Geraet ist frei: insert into loans (id, device_id, …, returned_at) values ("l-neu", "g-1", …, NULL);
4. Erneut importieren, dieselbe Quelle.
5. ZUSICHERUNG: der Import WIRFT, und die Meldung lautet
   "UNIQUE constraint failed: loans.device_id".
```

**Beide Angaben sind gemessen, nicht vermutet** — mit `sqlite3` gegen genau diese DDL nachgestellt
(partieller Index, `foreign_keys = ON`, dieselbe Statement-Folge in einer Transaktion):

* **Der Verstoß fällt beim STATEMENT auf, nicht erst beim `COMMIT`.** Die `UPDATE`-Anweisung, die
  `returned_at` auf `NULL` zurücksetzt, bricht ab; `db.transaction()` von better-sqlite3 rollt daraufhin
  zurück. Der Test darf also den `runRadioImport`-Aufruf umschließen und braucht keinen Umbau auf
  „Fehler am Commit".
* ⚠️ **Die Meldung nennt die SPALTE, nicht den Index:** `UNIQUE constraint failed: loans.device_id`.
  `loans_device_active_uidx` steht **nicht** darin. Ein `toThrow(/loans_device_active_uidx/)` wäre also
  ein Test, der aus dem falschen Grund rot ist — genau die Art Zusage, die eine Spec nicht machen darf,
  wenn sie sie nicht nachgeschlagen hat.

Der Mechanismus: `onConflictDoUpdate` setzt `l-aktiv.returned_at` zurück auf `NULL`, damit gibt es
**zwei** aktive Leihen auf `g-1`, und der partielle Unique-Index
`loans_device_active_uidx ON loans(device_id) WHERE returned_at IS NULL` weist die Schreibung ab. Der
Index ist in der Quelle handgeschrieben (`radio-admin/server/drizzle/0003_kind_spot.sql`, mit dem
Kommentar „drizzle-kit cannot emit partial indexes") und wandert nach Spec 1 §2.6 als
`0001_loans_aktiv_uidx.sql` mit.

Dieser Fall ist der **einzige** der drei, den der Betrieb bemerkt — und er bemerkt ihn als Abbruch
mitten im Fenster, bei bereits beschriebenem Ziel (`portal.ts:105-107`). Kein Trost, sondern die
Begründung für §1.5.2.

**Fall C — `device_events` bleibt, wie das Journal es verlangt.**

```
1. Import gegen leeres Ziel.
2. Im ZIEL eine Journalzeile veraendern (etwas, das die Suite nie tun wird —
   der Test prueft die Konfliktstrategie, nicht einen Anwendungsfall):
   update device_events set new_value = "in der Suite geaendert" where id = "e-1";
3. Erneut importieren, dieselbe Quelle.
4. ZUSICHERUNG: ereignis.newValue === "in der Suite geaendert"
   — INSERT OR IGNORE ueberschreibt eine bestehende Journalzeile NICHT.
   Und: count(device_events) ist unveraendert, es entsteht KEIN Duplikat.
```

Fall C ist die Gegenprobe zu A: dieselbe Situation, andere Strategie, anderes Ergebnis. Er ist der
Test, der `onConflictDoNothing` gegen ein späteres „der Einheitlichkeit wegen" verteidigt.

### 1.6.4 Was daraus für das Runbook folgt

> **Zusage an Kapitel 2 und 3:** Der Importer ist **nicht** so idempotent, dass ein Zweitlauf gegen ein
> bespieltes Ziel gefahrlos wäre. Die Reihenfolge ist verbindlich:
> **Generalprobe** gegen ein eigenes `DATA_DIR` und eine Schnappschuss-Kopie · **Freeze** ·
> **echter Schnappschuss** · **`radio.db` entfernen** · **Echtimport** · **Paritätscheck** ·
> **Zählvergleich**. Ein „nochmal drüberlaufen lassen" gibt es in diesem Cutover nicht; der Rückweg
> ist die leere Ziel-DB.

---

## 1.7 Was NICHT importiert wird — je Posten ein Satz

**1. `api_tokens`, die ganze Tabelle** — die Tabelle existiert im **Ziel nicht** (B16, Entscheidung 13;
der Widerspruch zu Spec 1 §9.1 ist in §1.5.1 entschieden). Produktiv trägt sie genau **einen** Konsumenten, den Alt-Kiosk
mit statischem `RADIO_ADMIN_API_TOKEN` (Betreiberantwort 3), und der verschwindet mit dem Port; der
Klartext ist nie gespeichert (`radio-admin/server/src/db/schema.ts:62`), eine mitgenommene Zeile wäre
also ohnehin nicht einlösbar. **Ersatz statt Migration** — *Zusage an Kapitel 3 und 4:* vor dem
Archivieren des Volumes wandert
`SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM api_tokens;` als **Textausgabe** ins
Cutover-Protokoll (ohne `token_hash` — er ist wertlos und ein Geheimnisrest), dazu
`SELECT COUNT(*) FROM api_tokens;` als Protokollzeile; der Volume-Schnappschuss steht die zwei Wochen
Standby ohnehin. Damit ist nichts vernichtet und keine Tabelle ohne Leser gebaut.

**2. `api_tokens.created_by` — totes Feld, stirbt mit seiner Tabelle.** Geschrieben
(`radio-admin/server/src/repos/apiTokenRepo.ts:50`), in `listApiTokens` (`:79-86`) nicht gelesen; es
wandert nicht, weil die Tabelle nicht wandert. **Gegenbeispiel mit derselben Eigenschaft und
anderem Ergebnis:** `software_versions.created_by` **wandert** (§1.4.2) — das Unterscheidungskriterium
ist „**wird sie geschrieben?**", nicht „wird sie gelesen?": ein Leser lässt sich nachbauen, ein
verlorener Wert nicht.

**3. `AdminUser` aus `radio-inventar` — und damit der ganze Postgres.** Im Pocket-ID-Betrieb schreibt
der OIDC-Weg **nicht** in die Tabelle, sondern baut die Kennung als `pocketid:${sub}`
(`radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`); der Kiosk hält ohnehin
keine eigenen Geräte- oder Leihdaten, radio-admin ist das führende System und der Kiosk schreibt über
die S2S-Leih-API durch (`radio-admin/server/src/db/schema.ts:101-103`).
*Zusage an Kapitel 4:* die Behauptung wird **gezählt**, nicht geglaubt — `select count(*) from
"AdminUser";` gehört als Protokollzeile vor den Abbau des Postgres; und aus einem Repository lässt
sich der Prod-Tabellenbestand grundsätzlich nicht ableiten, `pg_tables` ist die einzige verlässliche
Quelle.

**4. `zugangscodes`.** Kein Quellgegenstück, kein Import — §1.4.6, mit den zwei Folgen, die dort
stehen.

**5. Die Setup- und Weiterleitungsmechanik des Kiosk.** `prisma.adminUser.count()`
(`radio-inventar/apps/backend/src/modules/setup/setup.repository.ts:17`) trägt einen Setup-Status, an
dem zwei harte Client-Weiterleitungen hängen; in `radio.db` entsteht dafür **keine** Statuszeile und
**keine** Tabelle — die Suite hat kein Erstinbetriebnahme-Gate, und ein nachgebautes wäre eine zweite
Sperre ohne Träger.

**6. Kein zusätzlicher Fremdschlüssel wird „der Ordnung wegen" nachgezogen.** Weder auf
`loans.device_id` noch von einer Auditspalte auf `users.sub`; ein zusätzlicher FK ist gültiges
Drizzle, gültiges SQL und **paritätsgrün**, und der Schaden entsteht Monate später bei der ersten
Geräteausmusterung (Spec 1 §2.3, §2.10 Nr. 6).

---

## 1.8 Fixtures und der Test, den nur eine echte Quell-DDL bestehen kann

**Die Test-Quelle ist eine In-Memory-SQLite mit der ECHTEN produktiven DDL** — nicht ein Objekt-Array.
`scripts/import/feedback.ts:63-65` nennt genau diese Bauform („read-only im CLI-Pfad,
in-memory-Fixture im Test").

`scripts/import/fixtures/radio-quelle-ddl.sql` enthält, **zeichengleich kopiert**:

* `radio-admin/server/drizzle/0000_confused_thena.sql` (die fünf `CREATE TABLE` plus die zwei
  Unique-Indizes plus `device_events_device_id_idx`),
* `radio-admin/server/drizzle/0001_cooing_overlord.sql` (`ALTER TABLE devices ADD update_note`),
* `radio-admin/server/drizzle/0002_numerous_mandroid.sql` (die zwei `software_versions`-Spalten),
* `radio-admin/server/drizzle/0003_kind_spot.sql` (`loans` samt `loans_device_active_uidx`),
* `radio-admin/server/drizzle/0004_polite_redwing.sql` (`ALTER TABLE devices ADD tei`).

Als Kommentarkopf steht die Herkunft in der Datei. **Drei Gründe, das zu kopieren statt zu erzeugen:**

1. **Nur so hat die Fixture die physische Spaltenreihenfolge der Produktion** — `update_note` auf 24,
   `tei` auf 25. Eine aus dem Zielschema erzeugte Fixture hätte die Zielreihenfolge, und der
   Reihenfolge-Test wäre vakuös.
2. **Nur so ist `loans_device_active_uidx` in der Quelle scharf** — sonst besteht Fall B aus §1.6.3
   nicht deshalb, weil der Index greift, sondern weil er fehlt.
3. **`radio-admin` verschwindet.** Nach Kapitel 4 gibt es das Nachbarrepo nicht mehr; die DDL muss in
   **diesem** Repo liegen, sonst ist der Test nach dem Abbau nicht mehr nachvollziehbar.

**Der Reihenfolge-Test, der aus §1.2 folgt** — er steht in Spec 1 §2.2.5 nicht und ist die zweite
additive Ergänzung dieses Kapitels:

| Test | fängt |
|---|---|
| `lieseQuelle liest namentlich: devices.tei steht in der Quelle an Position 25` | Zwei Zusicherungen. (a) `sqlite3`-Ebene: `pragma table_info(devices)` der Fixture liefert `tei` als **letzte** Spalte und `update_note` als **vorletzte** — die Fixture ist also wirklich die produktive Form. (b) Mapping-Ebene: nach `lieseQuelle` + `toNeuesGeraet` gilt `g.tei === "7654321"` **und** `g.serialNumber === "SN-001"`. Ein positionsweiser Import liefert hier `tei === "SN-001"`. |

Weitere Fixture-Dateien nach Spec 1 §2.11 (`scripts/import/fixtures/radio-*.json`): die Rohzeilen aus
§1.3.4. **Entscheidung: sie liegen als `.ts` (`radio-quelle.ts`), nicht als `.json`.** Grund: die
Zeitstempel sind 13-stellige Zahlen, und `1_735_689_600_000` mit Unterstrichen ist gegenlesbar,
`1735689600000` nicht — im JSON gibt es die Trennstriche nicht. Bei einer Fixture, deren ganzer Zweck
das Gegenlesen von Zeitstempeln ist, ist das kein Formatgeschmack.

⚠️ **Das ist eine benannte Abweichung von einer Dateinamensliste in Spec 1, nicht eine Auslassung.**
Spec 1 §2.11 führt `scripts/import/fixtures/radio-*.json`; dieses Kapitel liefert
`radio-quelle.ts` **und** `radio-quelle-ddl.sql`, also **kein** `.json`. Dateilisten werden beim
Zusammenführen der Specs gegeneinander gehalten, deshalb steht die Abweichung hier ausdrücklich und
gehört in die Abweichungsliste des Zusammenführungsdurchgangs. Inhaltlich ändert sie an §2.11 nichts —
dieselbe Anzahl Fixtures, dieselben Werte, dieselbe Regel „je Feld ein anderer Wert".

**Die Zählkette hat VIER Glieder, und das erste ist die laufende Datenbank.** Die Sollwerte stehen
nirgends in dieser Spec, weil sie nur der Server hergibt. Was hier steht, ist die **Kette**:

```
(1) live /data/data.sqlite  →  (2) radio-snapshot.db  →  (3) Zaehlzeile des Importers  →  (4) Ziel-radio.db
```

Derselbe Befehl, viermal, mit unterschiedlichem Pfad — Glied (3) ist die `console.log`-Zeile aus §1.5.3:

```bash
# Glied (1): gegen die LAUFENDE Alt-Datenbank. Spec 1 §2.8.3 sagt "gegen die ALT-SQLite".
sqlite3 /data/data.sqlite \
  "select 'devices',count(*) from devices union all \
   select 'software_versions',count(*) from software_versions union all \
   select 'users',count(*) from users union all \
   select 'device_events',count(*) from device_events union all \
   select 'loans',count(*) from loans union all \
   select 'api_tokens',count(*) from api_tokens;"

# Glied (2): derselbe Befehl gegen /data/radio-snapshot.db
# Glied (4): derselbe Befehl gegen "$DATA_DIR/radio.db" — ohne die api_tokens-Zeile,
#            die Tabelle existiert im Ziel nicht (§1.5.1)
```

⚠️ **Nur Glied (1)→(2) findet einen abgeschnittenen Schnappschuss.** Wer die Kette bei (2) beginnt,
vergleicht den Schnappschuss mit sich selbst; (2)→(3)→(4) beweist, dass der Importer alles
mitgenommen hat, **nicht**, dass der Schnappschuss vollständig war. Das ist der `cp`-Fehler aus §1.1,
und er ist von (2) aus unsichtbar.

⚠️ **(1)→(2) schließt nur nach dem Freeze.** Schreibt die Alt-App zwischen Zählung und `.backup`
weiter, unterscheiden sich die Zahlen **berechtigt**, und die Kette sagt nichts mehr. Daraus folgt eine
Reihenfolge und zwei verschiedene Ansprüche:

| Lauf | Was die Kette leistet |
|---|---|
| **Generalprobe** (Alt-App läuft weiter) | Nur **(2)→(3)→(4)** schließt. Das prüft den **Importer**. Über die Vollständigkeit des Schnappschusses sagt die Generalprobe **nichts** — und darf es auch nicht behaupten. |
| **Echtlauf** (nach dem Freeze) | **Alle vier** Glieder schließen, und das ist der einzige Lauf, in dem eine Abschneidung überhaupt auffallen kann. Reihenfolge zwingend: **Freeze → Zählung (1) → `.backup` → Zählung (2)**. |

> **Zusage an Kapitel 2 und 3:** Die Zählung ist ein **eigener, nummerierter Runbook-Schritt je Glied**,
> mit dem Befehl daneben, und die vier Zahlenreihen stehen im Cutover-Protokoll untereinander. Muster:
> dieselbe Zahl vorher und nachher, `docs/runbooks/lagerbuch-cutover.md:452`, `:544`. `api_tokens`
> fährt in (1) und (2) mit, um **protokolliert** zu werden, nicht um verglichen zu werden (§1.5.1,
> §1.7) — in (4) fehlt die Zeile, weil die Tabelle dort nicht existiert. Wer sie dort mitschreibt,
> bekommt `Error: no such table: api_tokens` und hält es für einen Fehler.

⚠️ **Die lokale `radio-admin/data/data.sqlite` ist als Beleg unbrauchbar.** Sie ist leer und führt nur
`devices`, `device_events`, `software_versions` — `loans`, `api_tokens`, `users` fehlen ganz; sie ist
ein Stand **vor** der Loan-Migration `0003`. **Keine Zahl aus dieser Datei landet in einem Protokoll,
und sie ist auch keine Fixture** — die Fixture ist die DDL aus dem `drizzle/`-Verzeichnis (oben), das
den vollen Stand kennt.

---

## 1.9 Abweichungen von Spec 1, gesammelt

Damit der Zusammenführungsdurchgang sie nicht suchen muss. **Drei**, alle begründet, keine
stillschweigend:

| # | Wo | Was | Warum |
|---|---|---|---|
| A1 | Spec 1 §9.1, Zeile „Einfuegereihenfolge" und Zeile „`api_tokens`" | `api_tokens` fällt aus der Einfügereihenfolge und aus der Parität | **B16** entscheidet: „die Tabelle existiert im Ziel nicht". §9.1 ist auf B16 nicht nachgezogen. Voll ausgeschrieben in §1.5.1 |
| A2 | Spec 1 §2.8.3, Wort „alle elf" | zehn Quellspalten in epoch-ms (neun Zeitstempel + `devices.last_updated_at`) | B16 sagt „**neun** Zeitstempel-Spalten" plus eine eigene Zeile für `last_updated_at`; die SQL-Abfrage in §2.8.3 führt schon zehn Summanden. §1.3.3 |
| A3 | Spec 1 §2.11, Dateiliste `fixtures/radio-*.json` | Fixtures liegen als `radio-quelle.ts` + `radio-quelle-ddl.sql` | Numerische Trennstriche in 13-stelligen Zeitstempeln; DDL muss kopiert sein, weil `radio-admin` nach dem Abbau weg ist. §1.8 |

Zusätzlich **eine Ergänzung** ohne Widerspruch: die Vorabfrage `SELECT DISTINCT source FROM
device_events;` (§1.4.4) und der zwölfte Mapper-Test für `null` in den zwei 0/1-Integern (§1.3.5).
Beide sind additiv zu Spec 1 §2.8.3 bzw. §2.2.5 und stoßen dort nichts um.

---

## 1.10 Was dieses Kapitel offenlässt — benannt

* ⬜ **zu ergänzen nach dem Bau:** die exakten Namen der Typaliase, die
  `src/app/m/radio/_db/schema.ts` exportieren muss, damit die Mapper-Signaturen kompilieren. Spec 1
  §2.2.4 belegt genau zwei — `NeuesGeraet` und `Geraet` (in
  `paritaetsSichtGeraet(r: NeuesGeraet | Geraet)`). Die übrigen acht folgen demselben Muster
  (`NeueSoftwareVersion`/`SoftwareVersion`, `NeuerBenutzer`/`Benutzer`,
  `NeuesGeraeteEreignis`/`GeraeteEreignis`, `NeueLeihe`/`Leihe`) und sind **abzulesen**, sobald die
  Schemadatei steht; sie werden hier nicht als gesetzt behauptet.
* ⬜ **zu ergänzen nach dem Bau:** ob better-sqlite3 die SQLite-Meldung
  `UNIQUE constraint failed: loans.device_id` unverändert durchreicht oder in einen `SqliteError` mit
  eigenem `code` (`SQLITE_CONSTRAINT_UNIQUE`) verpackt (Fall B, §1.6.3). **Die Meldung selbst ist
  gemessen** (mit `sqlite3` gegen die DDL aus §1.8); offen ist allein die Verpackung durch den Treiber,
  und die ist am ersten Testlauf abzulesen. Der Test prüft die **Zeichenkette**, nicht den Indexnamen.
* ⚠️ **Was mir fehlt:** ein `scripts/import/lagerbuch.ts`. Der `lagerbuch`-Import ist produktiv
  gelaufen, das Skript ist **nicht** im Repo, und damit ist unbelegt, (a) ob dort eine Transaktion
  benutzt wurde, (b) wie der Schnappschuss entstand, (c) ob und wie der Zählvergleich automatisiert
  war. Alle drei Entscheidungen dieses Kapitels (§1.1 Schnappschuss, §1.5.3 Transaktion, §1.5.3
  Zählzeile) sind deshalb **aus `feedback.ts` plus Begründung** abgeleitet und nicht aus dem
  Präzedenzfall. Wer das Skript findet, prüft diese drei Punkte gegen es.
* Die Zählung der Retention-Kandidaten (`SELECT COUNT(*) FROM loans WHERE returned_at IS NOT NULL AND
  returned_at < <cutoff_ms>;`) gehört **nicht** in den Importer, sondern ins Protokoll **vor** dem
  ersten Retention-Lauf — *Zusage an Kapitel 3*. Betreiberantwort 4 nennt „< 100", und das ist eine
  **Schätzung**; die Zählung ist der Schritt, der sie ersetzt.

---

## 1.11 Die Dateien dieses Kapitels

**Neu:**

```
scripts/import/radio.ts
scripts/import/radio.test.ts
scripts/import/fixtures/radio-quelle-ddl.sql      (zeichengleiche Kopie der fuenf Alt-Migrationen)
scripts/import/fixtures/radio-quelle.ts           (Rohzeilen, §1.3.4)
```

**Unverändert benutzt:** `scripts/import/parity.ts` (`checkParity`, `assertParity`, `rowChecksum`) ·
`src/core/db/index.ts` (`getModuleDb`, `moduleDbPath`) · `src/core/bootstrap.ts`
(`migrateAllModules`).

**Die drei Tests, ohne die dieses Kapitel keinen Schutz hat:**

1. `toNeuesGeraet: jedes Zeitfeld behaelt SEINEN Wert in Millisekunden` — der Faktor 1000, mit **je
   Feld verschiedenen** Fixture-Werten (§1.3.4).
2. `Import ist asymmetrisch idempotent: Zielzeile geaendert, erneut importiert`, Fall A und B — die
   Zusicherung ist ein **Fehlschlag** (§1.6.3).
3. `lieseQuelle liest namentlich: devices.tei steht in der Quelle an Position 25` — die
   Spaltenverschiebung, gegen die echte Alt-DDL (§1.8).
