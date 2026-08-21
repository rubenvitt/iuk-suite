# Radio-Import — Abnahme von Hand (Aufgabe 11)

Planteil 1 von 5, Aufgabe 11. Der Trockenlauf über die Kommandozeile gegen die **Fixture**
(nicht den echten Bestand — Randbedingung des Briefs, `radio-admin/data/data.sqlite` ist leer
und vorbaselinig). Kein Code geändert in dieser Aufgabe.

**Datum des Trockenlaufs:** 2026-08-21
**Commit, gegen den er lief:** `e440f68` (`fix(radio-import): schreibeUndPruefe —
Transaktionsklammer und assertParity testbar herausgezogen`) — der letzte Stand von `radio.ts`
vor dieser Abnahme.

---

## 1. Die Zählzeile (Schritt 2), wörtlich

```
Quelle: users=1 software_versions=2 devices=2 device_events=1 loans=2
```

## 2. Die Abschlusszeile — ⬜ L6 (Schritt 2), byteweise

Wörtlich:

```
Radio-Import OK — 8 Zeilen, Parität grün.
```

`xxd` der rohen Zeile (inkl. abschließendem `\n`):

```
00000000: 5261 6469 6f2d 496d 706f 7274 204f 4b20  Radio-Import OK
00000010: e280 9420 3820 5a65 696c 656e 2c20 5061  ... 8 Zeilen, Pa
00000020: 7269 74c3 a474 2067 72c3 bc6e 2e0a       rit..t gr..n..
```

Die drei kritischen Stellen einzeln:

| Zeichen | Bytes (UTF-8) | Codepoint | Befund |
|---|---|---|---|
| `—` (Gedankenstrich zwischen „OK" und „8 Zeilen") | `e2 80 94` | U+2014 EM DASH | korrekt — **kein** Bindestrich `-` (U+002D, wäre `2d`) |
| `ä` in „Parität" | `c3 a4` | U+00E4 LATIN SMALL LETTER A WITH DIAERESIS | korrekt |
| `ü` in „grün" | `c3 bc` | U+00FC LATIN SMALL LETTER U WITH DIAERESIS | korrekt |

Die Zeile stimmt **byteweise** mit der Erwartung aus N1 überein (dort korrigiert gegenüber dem
ursprünglichen Brieftext, der die Umlaute noch ohne Kodierung schrieb). Keine Abweichung
gefunden.

**Teilstring, auf den die Runbook-Planteile zu Kapitel 3 (§3.1.2) und Kapitel 4 (§4.5 Schritt 5)
greppen sollen:**

```
Radio-Import OK — 8 Zeilen, Parität grün.
```

⚠️ Der Gedankenstrich in diesem Teilstring ist U+2014 (EM DASH, `e2 80 94`), kein Bindestrich.
Ein Grep-Muster, das stattdessen `-` (U+002D) enthält, verfehlt die Zeile **still** — sie sieht
in jeder Textansicht fast identisch aus.

## 3. Die Exit-Codes

| Schritt | Kommando | Exit-Code |
|---|---|---|
| Schritt 2 (Erstlauf) | `DATA_DIR=./.data/radio-trockenlauf rtk pnpm exec tsx scripts/import/radio.ts /tmp/radio-quelle-probe.sqlite` | `0` |
| Schritt 4 (Zweitlauf) | dasselbe Kommando, unverändert | `0` |

## 4. Die fünf Gegenzählungen (Schritt 3) gegen die Zählzeile

| Tabelle | Gegenzählung (`sqlite3 -readonly` gegen `radio.db`) | Zählzeile aus Schritt 2 | Deckt sich |
|---|---|---|---|
| `devices` | 2 | `devices=2` | ja |
| `software_versions` | 2 | `software_versions=2` | ja |
| `users` | 1 | `users=1` | ja |
| `device_events` | 1 | `device_events=1` | ja |
| `loans` | 2 | `loans=2` | ja |

Alle fünf Zahlen decken sich exakt mit der Zählzeile aus Schritt 2.

⛔ **Befund (Werkzeug, kein Datenwert) — und er betrifft das Cutover-Runbook.**

Das im Brief vorgeschriebene `sqlite3 -readonly`-Kommando gegen die frisch importierte `radio.db`
scheiterte mit

```
Parse error in 3rd command line argument: unable to open database file (14)
```

**Die Ursache ist nachgemessen** (Gegenprobe des Controllers am 2026-08-21, eigener Trockenlauf,
`sqlite3 3.54.0 2026-04-09`, `/usr/bin/sqlite3`):

⚠️ **Es liegt NICHT an der Mehrzeiligkeit des SQL** — diese erste Diagnose ist widerlegt. Es liegt
auch nicht am relativen Pfad. **Eine WAL-Datenbank ohne `-shm`-Datei laesst sich ueberhaupt nicht
readonly oeffnen**: SQLite muesste das Shared-Memory-File anlegen, und genau das darf ein
Readonly-Handle nicht. Die Suite betreibt ihre Modul-Datenbanken im **WAL-Modus**
(`pragma journal_mode` = `wal`), und ein frisch geschriebenes `radio.db` traegt **kein** `-shm`.

Die Messreihe, die es trennt — dieselbe Datei, dieselbe Sekunde:

| Aufruf | Ergebnis |
|---|---|
| `sqlite3 -readonly <db> "<mehrzeiliges SQL>"` | **Parse error (14)** |
| `sqlite3 -readonly <db> "<dasselbe SQL einzeilig>"` | **Parse error (14)** ← widerlegt die Mehrzeiligkeits-These |
| `sqlite3 -readonly "<absoluter Pfad>" "select count(*) from devices;"` | **Parse error (14)** ← widerlegt die Pfad-These |
| `sqlite3 "file:<db>?mode=ro" "select count(*) from devices;"` | **Parse error (14)** ← auch der URI-Weg |
| `sqlite3 <db> "select count(*) from devices;"` (**ohne** `-readonly`) | **2**, exit 0 — legt dabei `-shm` und `-wal` an |
| `sqlite3 -readonly <db> …` **danach**, mit vorhandenem `-shm` | **2**, exit 0 |

Warum die urspruengliche Diagnose plausibel aussah: der „funktionierende Einzeiler" lief, **nachdem**
ein vorheriger schreibender Zugriff die `-shm` bereits angelegt hatte — nicht, weil er einzeilig war.

✅ **Entwarnung fuer den Importer selbst — beides gesondet, mit Kommando und roher Ausgabe.**

**(i) `better-sqlite3` mit `readonly: true` oeffnet eine WAL-Datenbank OHNE `-shm`.** Sonde: eine
Wegwerf-DB im WAL-Modus anlegen, sauber schliessen, `-wal` und `-shm` entfernen, dann readonly
oeffnen.

```
$ rtk pnpm exec tsx ./__ctrl-wal2.mts
vor dem readonly-Oeffnen: /tmp/ctrl-wal2.sqlite
readonly-Lesewert: 1
waehrend offen:     /tmp/ctrl-wal2.sqlite /tmp/ctrl-wal2.sqlite-shm /tmp/ctrl-wal2.sqlite-wal
nach close:         /tmp/ctrl-wal2.sqlite /tmp/ctrl-wal2.sqlite-shm /tmp/ctrl-wal2.sqlite-wal
```

Der Lesewert kommt korrekt zurueck — die Zeile `new Database(pfad, { readonly: true })` in
`scripts/import/radio.ts` ist **ungefaehrdet**. Der Befund trifft allein die
`sqlite3`-**Kommandozeile**.

⚠️ **`readonly: true` ist dabei aber NICHT seiteneffektfrei** — die dritte und vierte Ausgabezeile
zeigen es: better-sqlite3 **legt `-shm` und `-wal` selbst an**, und sie bleiben nach dem Schliessen
liegen. Genau das darf die `sqlite3`-CLI nicht, und daher ruehrt der Unterschied. Fuer den Cutover
heisst das: **faellt die Quelle je in den WAL-Modus, legt der Importer beim Lesen zwei Dateien neben
dem Schnappschuss an.** Bei einem Schnappschuss ist das harmlos — er ist eine Kopie —, aber der Satz
„readonly fasst nichts an" waere dann falsch.

**(ii) Die Quellseite liegt im `delete`-Modus** — gemessen, nicht angenommen:

```
$ sqlite3 ../radio-admin/data/data.sqlite "pragma journal_mode;"
delete
$ sqlite3 /tmp/radio-quelle-probe.sqlite "pragma journal_mode;"
delete
```

Sowohl die **echte** `radio-admin/data/data.sqlite` als auch der `vacuum into`-Schnappschuss dieses
Trockenlaufs. Damit greift (i) heute nicht.

⛔ **Diese Messung ist datiert und gehoert am Freeze-Abend WIEDERHOLT.** Sie stammt vom 2026-08-21
aus der lokalen Arbeitskopie. Der Journal-Modus einer laufenden Anwendung kann sich aendern — ein
Update von `radio-admin`, eine geaenderte Startkonfiguration, ein Migrationsschritt genuegt. **Wer
sich beim echten Cutover auf (ii) verlaesst, ohne sie erneut zu fahren, verlaesst sich auf einen
Wert von einer anderen Maschine zu einer anderen Zeit.** Der Handgriff ist einer, unmittelbar nach
dem `.backup`:

```
sqlite3 <schnappschuss> "pragma journal_mode;"
```

Ergibt er `wal` statt `delete`, gilt der ⚠️-Absatz aus (i) — und die Gegenzaehlungen brauchen den
Weg aus dem naechsten Absatz **auch fuer die Quelle**.

⛔ **Was daraus fuer das Runbook folgt — weiterzureichen an C15, C28, C33 und C34:**
Jede Gegenzaehlung und jede Feldstichprobe, die mit `sqlite3 -readonly` gegen eine **frisch
importierte** `radio.db` faehrt, **scheitert** — am Cutover-Abend, mit einer Meldung
(`unable to open database file`), die wie ein Importfehler aussieht und keiner ist. Das Runbook
muss den Weg vorschreiben, der traegt, und dazusagen, **warum**: entweder `sqlite3` **ohne**
`-readonly` gegen die **Ziel**-DB (sie gehoert uns, das Anlegen der `-shm` ist harmlos), oder ein
vorgeschalteter Schreibzugriff, der die `-shm` erzeugt. ⚠️ **Fuer die QUELLE gilt das Gegenteil:**
dort bleibt der lesende Zugriff Pflicht (W1) — was hier aber kein Problem ist, weil sie im
`delete`-Modus liegt.

**Der fertige Handgriff fuer das Runbook — so uebernehmbar, ohne noch einmal zu messen:**

```bash
# Gegenzaehlung im ZIEL. KEIN -readonly: radio.db liegt im WAL-Modus und traegt
# nach dem Import noch keine -shm; ein Readonly-Handle koennte sie nicht anlegen
# und braeche mit "unable to open database file (14)" ab. Die Datei gehoert uns,
# das Anlegen der -shm ist harmlos.
sqlite3 "$DATA_DIR/radio.db" "select 'devices', count(*) from devices union all select 'software_versions', count(*) from software_versions union all select 'users', count(*) from users union all select 'device_events', count(*) from device_events union all select 'loans', count(*) from loans;"
```

⚠️ **`api_tokens` steht in dieser Abfrage NICHT** — die Tabelle existiert im Ziel nicht (W4). Wer sie
mitschreibt, bekommt `no such table: api_tokens` und haelt es fuer einen Fehler.

## 5. Was die Zählkette hier schließt — und was nicht

Die Zählkette hat vier Glieder (§1.8):

```
(1) live /data/data.sqlite → (2) radio-admin-snapshot.sqlite → (3) Zaehlzeile des Importers → (4) Ziel-radio.db
```

**Glied (3)→(4) schließt dieser Trockenlauf** — die Gegenzählung aus Abschnitt 4 oben belegt es.

**Glied (1)→(2) schließt hier NICHT und kann es nicht** — es braucht den Freeze und die echte
laufende Alt-Datenbank. Dieser Trockenlauf beginnt bei der Fixture, also faktisch bei einem
Stellvertreter für (2); er vergleicht keinen Schnappschuss mit der lebenden Quelle.

## 6. Was der Zweitlauf (Schritt 4) NICHT beweist

`exit=0` und „Parität grün" beim Zweitlauf gegen dieselbe Quelle und denselben Bestand belegen
**keine Idempotenz** (§1.6.2). Sie belegen nur, dass `INSERT … ON CONFLICT` existiert und ohne
Fehler durchläuft. Die belastbare Aussage über Idempotenz — inklusive der beiden asymmetrischen,
bewusst nicht behobenen Fälle A und B — steht in Aufgabe 9. Der Runbook-Satz für den echten
Cutover lautet **„`radio.db` löschen, dann importieren"**, nicht „importieren" (§1.6.4).

---

Aufgeräumt nach Schritt 5: `.data/radio-trockenlauf/`, `/tmp/radio-quelle-probe.sqlite`,
`./__radio-fixture-dump.mts` und alle temporären Ausgabedateien in `/tmp` entfernt.
`rtk git status --short` lief danach leer (vor dem Commit dieser Datei hier).
