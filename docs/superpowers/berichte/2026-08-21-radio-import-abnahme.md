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

**Befund (Werkzeug, kein Datenwert):** Das im Brief vorgeschriebene mehrzeilige `sqlite3`-Kommando
scheiterte in der hier installierten Fassung (`sqlite3 3.54.0 2026-04-09`, `/usr/bin/sqlite3`) mit
`Parse error in 3rd command line argument: unable to open database file (14)` — sowohl mit
relativem als auch mit absolutem Pfad, reproduzierbar. Als **Einzeiler** (identisches SQL, ohne
eingebettete Zeilenumbrüche im Argument) lief dieselbe Abfrage fehlerfrei und lieferte die oben
stehenden fünf Werte. Ursache nicht weiter untersucht (nicht Gegenstand dieser Aufgabe); für
künftige Läufe: Einzeiler verwenden.

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
