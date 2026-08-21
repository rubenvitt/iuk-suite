# Radio-Datenhaltung — die Ablesungen (Aufgabe M6)

Planteil 1 von 5, Aufgabe M6. Diese Datei liest ab und protokolliert die drei Leerstellen
⬜ L1, ⬜ L3 und ⬜ L4 (plus ⬜ M-L1), die seit dem 2026-08-19 dreizehn Aufgaben des Import-Wegs
(B5–B17) und zwei des Cutover-Wegs (C9, C15) blockieren. Kein Code entstand in dieser Aufgabe.

**Vorbemerkung zum Bestand:** `.data/radio.db` existierte bereits vor dem Start dieser Aufgabe
(94 KB, Stand 2026-08-21 11:57) — der M1–M3-Implementer hatte den Seed bei seiner eigenen Abnahme
bereits zweimal gefahren. Schritt 1 dieser Aufgabe war deshalb **kein Erstlauf**: der Seed-Lauf
meldete für jede Tabelle „0 von N angelegt (Rest bereits vorhanden)". Die Zahlen aus Schritt 2
stimmen also, aber sie belegen nicht „der Seed hat gerade gewirkt", sondern nur „der Bestand ist
konsistent und ein weiterer Lauf ändert ihn nicht". Die zwei erwarteten `console.info`-Zeilen mit
den Ausleih-Codes im Klartext erschienen bei beiden Läufen (Schritt 1 und Schritt 3):

```
radio: Ausleih-Code (aktiv):    A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW
radio: Ausleih-Code (gesperrt): 7QK2-M4XN-B9HV-3ZTD-5PJW-6RSG-8YFA
```

`.data/radio.db` wurde nicht gelöscht und ist nicht Teil dieses Commits (git-ignoriert,
`.gitignore:3`).

---

## 1. ⬜ L1 — die zehn Typaliase

Wortwörtlich aus `src/app/m/radio/_db/schema.ts`, mit Zeilennummer:

| Zeile | Typalias |
|---|---|
| 255 | `NeuesGeraet` |
| 256 | `Geraet` |
| 257 | `NeueSoftwareVersion` |
| 258 | `SoftwareVersion` |
| 259 | `NeuerBenutzer` |
| 260 | `Benutzer` |
| 261 | `NeuesGeraeteEreignis` |
| 262 | `GeraeteEreignis` |
| 263 | `NeueLeihe` |
| 264 | `Leihe` |

Der Kommentar direkt darüber (`schema.ts:245-247`) benennt selbst, was ohne sie stillsteht: „ohne
sie kompiliert keine Mapper-Signatur von `scripts/import/radio.ts`" — das entsperrt die Aufgaben
**B5, B6, B7, B9, B14, B15, B16** des Import-Wegs.

Anmerkung: `zugangscodes` hat bewusst **keine** Typaliase hier — laut Kommentar `schema.ts:252-253`
bekommt die Tabelle ihre Aliase erst mit Kapitel 3, ihrem ersten Verbraucher. Das ist keine
Leerstelle, sondern eine im Schema selbst begründete Entscheidung.

---

## 2. ⬜ L3 — die vollständigen Spaltenlisten der vier übrigen Paritätssichten

Jede Spalte wurde zweimal abgelesen — einmal per `pragma_table_info` gegen die migrierte
`.data/radio.db`, einmal aus `src/app/m/radio/_db/schema.ts` — und beide Ablesungen wurden
gegeneinander gehalten. In **jeder** Zeile aller vier Tabellen stimmten SQL-Spaltenname,
TypeScript-Bezeichner, Nullability und `mode: "timestamp"`-Angabe überein. Keine Abweichung
gefunden.

Jede mit **ja** markierte Spalte der folgenden vier Tabellen läuft beim Import durch `sekunden()`:
das Ziel führt Unix-**Sekunden**, die Quelle epoch-**Millisekunden** — und keine Spalte trägt
`timestamp_ms` (geprüft: kein Treffer in `src/app/m/radio/`).

### `users` (3 Spalten, `schema.ts:113-117`)

| # | SQL-Spalte | TS-Bezeichner | Typ (pragma) | timestamp-mode? |
|---|---|---|---|---|
| 0 | `sub` | `sub` | TEXT, PK | nein |
| 1 | `name` | `name` | TEXT, NOT NULL | nein |
| 2 | `last_seen_at` | `lastSeenAt` | INTEGER, NOT NULL | **ja** (`schema.ts:116`) |

### `software_versions` (6 Spalten, `schema.ts:67-93`)

| # | SQL-Spalte | TS-Bezeichner | Typ (pragma) | timestamp-mode? |
|---|---|---|---|---|
| 0 | `id` | `id` | TEXT, PK | nein |
| 1 | `value` | `value` | TEXT, NOT NULL | nein |
| 2 | `created_at` | `createdAt` | INTEGER, NOT NULL | **ja** (`schema.ts:70`) |
| 3 | `created_by` | `createdBy` | TEXT, nullable | nein — tote Spalte, s. Kommentar `schema.ts:71-78` |
| 4 | `sort_order` | `sortOrder` | INTEGER, NOT NULL DEFAULT 0 | nein — reiner Integer, kein `mode` |
| 5 | `is_target` | `isTarget` | INTEGER, NOT NULL DEFAULT 0 | nein — `mode: "boolean"`, nicht `"timestamp"` |

### `device_events` (8 Spalten, `schema.ts:119-144`)

| # | SQL-Spalte | TS-Bezeichner | Typ (pragma) | timestamp-mode? |
|---|---|---|---|---|
| 0 | `id` | `id` | TEXT, PK | nein |
| 1 | `device_id` | `deviceId` | TEXT, NOT NULL, FK → `devices.id` cascade | nein |
| 2 | `field` | `field` | TEXT, NOT NULL | nein |
| 3 | `old_value` | `oldValue` | TEXT, nullable | nein |
| 4 | `new_value` | `newValue` | TEXT, nullable | nein |
| 5 | `changed_by` | `changedBy` | TEXT, nullable | nein |
| 6 | `changed_at` | `changedAt` | INTEGER, NOT NULL | **ja** (`schema.ts:134`) |
| 7 | `source` | `source` | TEXT, NOT NULL, Enum ohne DB-Check | nein |

### `loans` (12 Spalten, `schema.ts:209-242`)

| # | SQL-Spalte | TS-Bezeichner | Typ (pragma) | timestamp-mode? |
|---|---|---|---|---|
| 0 | `id` | `id` | TEXT, PK | nein |
| 1 | `device_id` | `deviceId` | TEXT, NOT NULL, **kein** FK (§2.3) | nein |
| 2 | `snapshot_call_sign` | `snapshotCallSign` | TEXT, NOT NULL | nein |
| 3 | `snapshot_serial_number` | `snapshotSerialNumber` | TEXT, nullable | nein |
| 4 | `snapshot_device_type` | `snapshotDeviceType` | TEXT, nullable | nein |
| 5 | `borrower_name` | `borrowerName` | TEXT, NOT NULL | nein |
| 6 | `borrowed_at` | `borrowedAt` | INTEGER, NOT NULL | **ja** (`schema.ts:218`) |
| 7 | `returned_at` | `returnedAt` | INTEGER, nullable | **ja** (`schema.ts:219`) |
| 8 | `return_note` | `returnNote` | TEXT, nullable | nein |
| 9 | `zugangscode_id` | `zugangscodeId` | TEXT, nullable, FK → `zugangscodes.id` | nein |
| 10 | `created_at` | `createdAt` | INTEGER, NOT NULL | **ja** (`schema.ts:231`) |
| 11 | `updated_at` | `updatedAt` | INTEGER, NOT NULL | **ja** (`schema.ts:232`) |

⚠️ `loans` trägt **zwölf** Spalten, elf davon aus der Quelle und **eine neue**: **`zugangscode_id`**
an cid 9 (die zehnte Spalte). Sie bleibt beim Import für
**alle** Alt-Leihen `NULL` (`pragma_table_info` bestätigt `notnull = 0`; `schema.ts:230` trägt kein
`.notNull()`). Der Kommentar `schema.ts:221-223` benennt das ausdrücklich: „NULL für jede
importierte Alt-Leihe und für jede Leihe über den Suite-Weg." Aufgabe **B13**
(`paritaetsSichtLeihe`) hängt daran — die Paritätssicht darf für Alt-Leihen keinen Wert erwarten.

### Die eine Ausnahme: `devices.last_updated_at`

`devices` selbst gehört nicht zu den vier oben abgelesenen Sichten, aber die Ausnahme aus dem
Brief wurde mitgeprüft: `pragma_table_info('devices')` zeigt für `last_updated_at` (cid 10) den
Typ **TEXT**, nicht INTEGER — es ist ein Kalenderdatum `YYYY-MM-DD`, keine Zeitspalte. `schema.ts:39`
deklariert sie als `text("last_updated_at")`, ohne `mode`. Sie bleibt **unumgerechnet** — sie darf
beim Import **nicht** durch `sekunden()` laufen.

---

## 3. ⬜ L4 / ⬜ M-L2 — die Zahl aus Schritt 4

```
select count(*) from __drizzle_migrations;   →  2
```

Journal (`src/app/m/radio/_db/migrations/meta/_journal.json`) trägt zwei Einträge:

| idx | tag | when |
|---|---|---|
| 0 | `0000_melodic_eternals` | 1787305720971 |
| 1 | `0001_loans_aktiv_uidx` | 1787400000000 |

Beide Zahlen sind **gleich** (2 = 2). Keine Migration fehlt; nichts zu melden.

---

## 4. ⬜ M-L1 — der gewürfelte Name der `0000`

`0000_melodic_eternals.sql` (Journal-`tag`: `0000_melodic_eternals`, `when` `1787305720971`). Das
deckt sich mit der vorab mitgeteilten Angabe im Auftrag — beim eigenen Ablesen aus dem Journal
(Schritt 4) trat keine Abweichung auf.

---

## 5. Was nicht abgelesen werden konnte

Nichts. Alle in Schritt 1–4 des Briefs verlangten Werte waren ablesbar, und jede Ablesung aus
`pragma_table_info` stimmte mit `_db/schema.ts` überein — keine Abweichung, kein Fehlbetrag, keine
im Code auffällige Unstimmigkeit.

Eine Anmerkung, die keine Leerstelle ist, aber der Vollständigkeit wegen gehört: der aktuelle
Bestand von `.data/radio.db` belegt Idempotenz (Schritt 3: 8 devices / 4 loans unverändert nach
zweitem Lauf), aber **nicht** einen Erstlauf-Seed auf einer leeren Datenbank — dafür fehlt in
diesem Arbeitsverzeichnis eine Datenbank, die vor dem allerersten Seed-Lauf stand. Das ist kein
Mangel dieser Aufgabe (der Auftrag verbietet ausdrücklich, `.data/radio.db` zu löschen, um einen
Erstlauf herzustellen) und wird hier nur benannt, nicht als Bedenken erhoben.
