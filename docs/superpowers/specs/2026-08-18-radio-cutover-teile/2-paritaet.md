# 2. Paritaet, Feldstichproben und die Abfragen vor dem Import

Dieses Kapitel liefert die Prüfungen, die **vor** dem Umschwenk laufen müssen, und sagt bei jeder,
was sie beweist, was sie **nicht** beweist, was sie scheitern lässt und wie man das merkt. Es führt
den Import nicht durch und schwenkt keinen Router.

**Zur Schreibweise der Querverweise.** Wo dieses Kapitel eine Zusage an ein anderes Kapitel dieser
Spec macht, steht `**Zusage an Kapitel N (…)**` mit der Sache in Klammern. Das `N` bleibt stehen: die
Nummerierung der Teile unter `docs/superpowers/specs/2026-08-18-radio-cutover-teile/` ist mir nicht
vorgegeben, und eine erfundene Nummer wäre ein Verweis, der unter Zeitdruck ins Leere zeigt. Die
Klammer trägt die Sache; sie ist eindeutig.

**Drei Randbedingungen, unter denen alles hier steht.**

1. ⚠️ **Es gibt kein Parallelfenster.** Der Alt-Kiosk läuft **schon heute** unter
   `radio.iuk-ue.de` (Entscheidung 3, Spec 1 §A). Jede Prüfung auf dem **Ziel**arm läuft deshalb
   gegen einen **ephemeren Container ohne Traefik-Labels** — nicht im Browser, nicht über die
   Domain. Der Rückweg ist „Router zurück", nichts sonst.
2. ⚠️ **Beide Domains ziehen im selben Fenster um** (Entscheidung 15). Es gibt keinen Zustand, in
   dem `radio-admin` schon in der Suite liegt und der Kiosk noch per HTTP mit ihm spricht. Also:
   **eine** Freeze, **eine** Snapshot-Runde, **ein** Satz Zahlen.
3. ⚠️ **Die lokale `radio-admin/data/data.sqlite` beantwortet nichts.** Sie ist leer und
   vorbaselinig — `.tables` zeigt nur `__drizzle_migrations`, `device_events`, `devices`,
   `software_versions`; `loans`, `api_tokens` und `users` **fehlen ganz**
   (`docs/radio-portierung-analyse.md:1865-1872`). Jede Zahl in diesem Kapitel ist ein **Schritt**
   mit dem Befehl daneben, kein Wert im Text.

---

## 2.1 Was Paritaet beweist — und was sie strukturell nicht sehen kann

### 2.1.1 Der Mechanismus, in Zeilen

`scripts/import/parity.ts` vergleicht **Multimengen von Zeilen-Hashes**:

* `rowChecksum` (`parity.ts:31-33`) serialisiert eine Zeile wertkanonisch (`canon`, `:16-29`:
  Schlüssel sortiert, `Date → ISO`, `bigint → String`) und hasht das Ergebnis mit `sha256`.
* `multiset` (`:35-43`) zählt gleiche Hashes.
* `checkParity` (`:45-59`) meldet `ok` genau dann, wenn keine Prüfsumme auf einer Seite fehlt
  **und** `source.length === target.length`.
* `assertParity` (`:61-69`) wirft mit dem Text `Import ABORTED — no cutover.`

Was das leistet, ist echt und nicht klein: **der Datenbank-Rundlauf über alle Spalten der
Paritätssicht.** Ein verlorener Insert, eine vertauschte Zeilenreihenfolge, eine auf dem
Schreibweg abgeschnittene Spalte, ein Datentyp, den SQLite anders zurückgibt als er hineinging —
das alles wird rot. Und weil die Sicht **alle** Spalten führt und nicht eine Auswahl
(`portal.ts:78-80`: „EVERY migrated field enters parity, so ‚parity green' certifies the whole row,
not a hand-picked subset"), gilt es für die ganze Zeile.

### 2.1.2 Der blinde Fleck: beide Arme kommen aus derselben Funktion

`scripts/import/portal.ts:73-76` schreibt ihn selbst hin, im Quelltext, den wir kopieren:

> „parity certifies DB round-trip fidelity of all 15 fields — **NOT** the correctness of
> `toNewService`'s Postgres->app mapping (both parity arms derive from `toNewService`, so a mapping
> bug hashes identically on both sides). Mapping correctness is guarded **solely** by the
> `toNewService` unit test — keep its fixture values distinct per field."

Bei `radio` ist es dieselbe Bauform. Spec 1 §2.2.4 legt `paritaetsSichtGeraet(r: NeuesGeraet |
Geraet)` fest — **eine** Funktion, deren Parametertyp die Vereinigung aus Quellarm und Zielarm ist —
und sie rechnet auf beiden Armen mit demselben `sekunden = (d) => Math.floor(d.getTime() / 1000)`.
Der Quellarm ist also nicht die Alt-Zeile, sondern `toNeuesGeraet(altzeile)`; der Zielarm ist die
gelesene Zielzeile. **Die rohe Alt-Ganzzahl betritt den Vergleich nie.**

Daraus folgt exakt, was ein grüner Paritätscheck aussagt und was nicht:

| Fehlerklasse | sieht die Paritaet? | warum |
|---|---|---|
| Zeile fehlt / zu viel | **ja** | `source.length !== target.length` (`parity.ts:57`) |
| Wert auf dem Schreibweg verändert | **ja** | Hash weicht auf einem Arm ab |
| Präzisionsverlust durch `mode: "timestamp"` | **nein, absichtlich** | beide Arme werden auf Sekunden normalisiert (`portal.ts:64-71`, Spec 1 §2.2.4) |
| **Faktor 1000** (ms als Sekunden gelesen) | ⛔ **nein** | ein Fehler in `msZuDatum` wirkt auf beiden Armen; identischer Hash |
| **Zwei Spalten vertauscht** (`issi`↔`tei`) | ⛔ **nein** | der Mapper vertauscht sie beidseitig |
| Spalte gar nicht in der Sicht | ⛔ **nein** | sie geht in keinen Hash ein |
| Fachliche Invariante verletzt (`is_target` zweimal) | ⛔ **nein** | 1:1 übernommen ist 1:1 grün |

Das ist keine Merkregel, sondern die Begründung für die restlichen drei Abschnitte dieses Kapitels:
**für die vier ⛔-Zeilen gibt es kein Tor außer dem Mapping-Unit-Test (Spec 1 §2.2.5) und den
Handgriffen hier.**

### 2.1.3 Zwei Ablaufregeln, die aus dem Mechanismus folgen

1. ⚠️ **Ein roter Paritätscheck heißt NICHT „es ist nichts passiert".** `portal.ts:105-107` sagt
   es wörtlich: „parity runs AFTER this (idempotent) write. A thrown parity error means the target
   was already mutated … not ‚nothing happened'". Der Rückweg nach einem roten Check ist die
   **gelöschte, leere Ziel-DB** und ein neuer Lauf — nicht ein zweiter Versuch auf denselben
   Bestand. **Zusage an Kapitel N (Generalprobe und Cutover-Fenster):** der Schritt „`radio.db`
   löschen, Migrationen neu fahren" muss im Fenster **benannt** dastehen, nicht improvisiert werden.
2. **Paritaet ist die letzte Prüfung, nicht die erste.** Alle Abfragen aus §2.4 laufen **vor** dem
   Import, weil `msZuDatum` **wirft** (Spec 1 §2.2.4: `MS_MIN = 1e12`, `MS_MAX = 4e12`). Ein
   Abbruch dort ist in der Generalprobe eine halbe Stunde Arbeit und im Echtlauf ein Abbruch um
   23 Uhr.

### 2.1.4 Die fuenf Paritaetssichten

Spec 1 §2.2.4 schreibt **eine** von fünf aus (`paritaetsSichtGeraet`, 25 Spalten, mit dem Hinweis
„alle 25 Spalten namentlich, keine Auswahl").

⬜ **zu ergaenzen nach dem Bau:** die Namen und die vollständigen Spaltenlisten der vier übrigen
Paritätssichten (`software_versions` 6, `users` 3, `device_events` 8, `loans` 12 Spalten nach Spec 1
§2.5.2–§2.5.5). Abzulesen ist je Sicht: (a) trägt sie **jede** Spalte der Zieltabelle, (b) läuft
jede `mode: "timestamp"`-Spalte durch `sekunden()`, (c) bleibt `devices.last_updated_at`
**unumgerechnet** (TEXT `YYYY-MM-DD`, Spec 1 §2.2.3). Fehlt eine Spalte in einer Sicht, ist die
Paritaet für sie blind, und das sieht kein Test — deshalb ist das ein Ablese-, kein Rateschritt.

⚠️ **Wo mir eine Vorlage fehlt:** `scripts/import/` enthält heute genau `feedback-time.ts`,
`feedback.ts`, `parity.ts`, `portal.ts` (plus Tests und `fixtures/`) — **kein `lagerbuch.ts`**,
obwohl der lagerbuch-Import produktiv gelaufen ist. Wie er ablief (Handarbeit am Server, nicht
committetes Skript, oder anders), ist aus dem Repo nicht ableitbar
(`docs/radio-portierung-analyse.md` Kap. 4 Pflicht 5). Die einzigen lesbaren Vorbilder sind
`portal.ts` und `feedback.ts`; alles unten ist an ihnen und an `parity.ts` nachgelesen, nicht an
einem radio- oder lagerbuch-Skript.

---

## 2.2 Die Feldstichproben — der Handgriff, der den blinden Fleck schliesst

### 2.2.1 Die Form: roh gegen roh, mit dem Faktor sichtbar im Befehl

Eine Stichprobe, die durch den Mapper liest, wiederholt nur die Paritaet. Verbindlich ist deshalb:

> **Der Quellarm liest die Alt-Ganzzahl, der Zielarm liest den Zielwert, und die Umrechnung steht
> als Rechnung im Protokoll — nicht in einer Funktion.**

Für jede Stichprobe entstehen drei Protokollzeilen: `quelle`, `ziel`, `rechnung`. Beispiel für ein
Zeitfeld:

```
loans/returned_at  id=<id>
  quelle_ms = 1771000000000        (radio-admin-snapshot.sqlite)
  ziel_s    = 1771000000           (radio.db, ephemerer Container)
  rechnung  = quelle_ms / 1000 == ziel_s   -> ok
```

Für ein Textfeld entfällt die Rechnung, und geprüft wird **zeichengleich**, nicht „sieht richtig
aus".

**`devices.last_updated_at` ist der Sonderfall, und er ist nur halb prüfbar.** Quelle ist epoch-ms,
Ziel ist TEXT `YYYY-MM-DD` **in `Europe/Berlin`** (Spec 1 §2.2.3, `tagInBerlin`). `sqlite3` kennt
`Europe/Berlin` nicht, und `'+1 hour'` ist über die Sommerzeitgrenze falsch — der erwartete Wert ist
also **nicht** per SQL berechenbar. Verbindlich ist deshalb: **beide Kandidatentage nebeneinander
ausgeben und den Zielwert gegen sie stellen.**

```sql
-- QUELLE: die zwei moeglichen Kalendertage, nebeneinander.
select id, last_updated_at,
       date(last_updated_at/1000, 'unixepoch')            as utc_tag,
       date(last_updated_at/1000, 'unixepoch', '+1 day')  as utc_tag_plus1
  from devices where id = '<id>';
```

Der Zielwert muss **einem** der beiden gleichen — und **welchem**, entscheidet die Uhrzeit:

* Ist der Quellwert UTC-Mitternacht (CSV-Import-Weg), sind Berliner Tag und UTC-Tag **derselbe**.
  Dann ist `utc_tag` richtig — und die Stichprobe ist **nicht diskriminierend**: eine falsche
  UTC-Kürzung im Mapper besteht sie.
* Nur ein Quellwert ab **22:00 UTC** (Formular-Weg mit lokaler Mitternacht) unterscheidet die zwei
  Lesarten. Der Kandidatenfilter dafür:

```sql
-- Die einzige diskriminierende Zeile: 22:00 UTC oder spaeter.
select id, last_updated_at, time(last_updated_at/1000,'unixepoch') as uhrzeit_utc
  from devices
 where last_updated_at is not null
   and last_updated_at % 86400000 >= 79200000
 limit 1;
```

⚠️ **Findet dieser Filter keine Zeile, ist `tagInBerlin` an den Produktionsdaten nicht prüfbar**, und
die Zusage ruht allein auf den drei `tagInBerlin`-Unit-Tests aus Spec 1 §2.2.5
(`2026-08-16T22:00:00Z → 2026-08-17`, `2026-08-17T00:00:00Z → 2026-08-17`,
`2026-08-17T14:35:00Z → 2026-08-17`). Das ist eine Protokollzeile, kein grüner Haken. Grund: welcher
der drei Alt-Schreibwege eine gegebene Zeile geschrieben hat, steht **nirgends in den Daten** — die
Uhrzeit ist der einzige Indikator (`22:00`/`23:00` = Formular, `00:00` = CSV, alles andere =
Update-Karte). Und der Filter selbst ist ein **Kandidaten**filter: im Winter liegt lokale
Mitternacht bei 23:00 UTC, ein Wert um 22:30 UTC im Januar ist also ein Update-Karten-Wert, dessen
Berliner Tag derselbe bleibt. Deshalb steht neben dem Zielwert die Uhrzeit im Protokoll, nicht nur
der Tag.

### 2.2.2 Die zwei Arme sind asymmetrisch — und das ist der Kern dieses Cutovers

| Arm | wie gelesen wird | warum nicht anders |
|---|---|---|
| **Quelle** | `sqlite3 radio-admin-snapshot.sqlite '<SELECT>'` gegen die **Snapshot-Kopie**, nie gegen den laufenden Stack (Spec 1 §9.3.4). Zusätzlich **darf** hier die Alt-Oberfläche als zweite Meinung dienen: sie läuft während der Generalprobe noch unter `radio.iuk-ue.de` | Der Alt-Kiosk ist bis zum Umschwenk der Betrieb. Ein Lesezugriff auf die Datei eines laufenden SQLite-Stacks ist genau der Handgriff, den §9.3.4 verbietet |
| **Ziel** | ausschliesslich `sqlite3` in einem **ephemeren Container ohne Traefik-Labels** | ⚠️ Der Zielarm hat **keine** Adresse. `radio.iuk-ue.de` bedient bis zum Umschwenk den Alt-Kiosk; zwei Router auf einem Host gibt es nie. „Seite aufmachen und hinsehen" ist auf dem Zielarm **keine** verfügbare Prüfung |

Der Lesebefehl auf dem Zielarm, mit dem Schritt, der ihm vorausgeht:

```bash
# ⚠️ ZUERST den ECHTEN Volume-Namen ablesen und ins Protokoll schreiben — compose
# praefixt deklarierte Volumes mit dem Projektnamen. Ein erfundener Name legt ein
# NEUES, LEERES Volume an, und `sqlite3` liefert dann null Zeilen OHNE Fehler.
docker volume ls | grep -i suite
VOL_SUITE=<die Zeile aus dem Befehl oben>

# Ephemerer Container: kein `-p`, KEINE Traefik-Labels, kein Netz-Alias, kein
# `--network` auf das Proxy-Netz. Er ist von aussen nicht erreichbar und kann den
# Alt-Kiosk nicht verdraengen. Ein Aufruf je Abfrage, SQL ueber stdin — so muss
# nichts durch zwei Shell-Ebenen gequotet werden:
echo "select count(*) from devices;" | docker run --rm -i \
  -v "$VOL_SUITE":/data:ro alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly -header -column /data/radio.db'
```

⚠️ **`:ro` und `-readonly` sind nicht Kosmetik** — aber sie haben einen Preis, der benannt sein
muss: SQLite im WAL-Modus braucht zum **Lesen** eine beschreibbare `-shm`-Datei. Auf einem
`:ro`-Mount scheitert der Befehl dann mit „unable to open database file" oder „attempt to write a
readonly database", **obwohl die Datenbank in Ordnung ist**. Wer das für einen Datenbefund hält,
sucht am falschen Ort. Der Ausweg, in dieser Reihenfolge:

1. `file:/data/radio.db?immutable=1` statt des nackten Pfades — liest ohne jede Schreibdatei,
   **nur** gültig, solange kein Prozess schreibt. Nach dem Import und vor dem Umschwenk ist das der
   Fall, weil der Suite-Container zu diesem Zeitpunkt keine Domain bedient.
2. Andernfalls das Mount **ohne** `:ro`, dafür weiter mit `-readonly`. Dann können `-wal`/`-shm` im
   Volume zurückbleiben; das ist harmlos, gehört aber ins Protokoll, damit es im Fenster kein Rätsel
   ist.

⚠️ **Ein leeres Ergebnis ist hier ein Verdacht, kein Befund.** `openModuleDatabase` legt das
Verzeichnis per `mkdirSync(dir, {recursive:true})` an (`src/core/db/index.ts:12-22`), better-sqlite3
die Datei — **ein vertipptes `DATA_DIR` oder ein falscher Volume-Name ergibt eine nagelneue, leere
`radio.db`, und jede Abfrage antwortet `0`, nicht „Datei fehlt".** Deshalb geht der Zählung aus
§2.6 immer die Ablesung des Volume-Namens voraus.

### 2.2.3 Welche Zeile man waehlt — und warum nicht die naechste

Eine Stichprobe auf einer Zeile, deren Felder alle `NULL` sind, ist unter **jedem** Zuordnungsfehler
grün. Und eine Zeile, in der zwei verwechselbare Spalten denselben Wert tragen, besteht **jede**
Vertauschung. Die Auswahl ist deshalb kein Zufallsgriff, sondern ein Filter mit vier Regeln — sie
ist die Produktionsfassung derselben Regel, die Spec 1 §2.2.5 den Fixtures auferlegt („jedes
Zeitfeld einer Zeile trägt einen anderen Fixture-Wert — sonst ist der Test vakuös"):

**Regel 1 — die Zeile mit den meisten gesetzten Feldern.** Maximale Zuordnungsbreite je Stichprobe.
Für `devices`:

```sql
-- Waehlt die eine Zeile, die am meisten prueft.
select id,
       (case when tei             is not null then 1 else 0 end)
     + (case when serial_number   is not null then 1 else 0 end)
     + (case when hiorg_id        is not null then 1 else 0 end)
     + (case when opta            is not null then 1 else 0 end)
     + (case when funktion        is not null then 1 else 0 end)
     + (case when bedieneinheit   is not null then 1 else 0 end)
     + (case when hersteller      is not null then 1 else 0 end)
     + (case when device_modes    is not null then 1 else 0 end)
     + (case when update_note     is not null then 1 else 0 end)
     + (case when notes           is not null then 1 else 0 end)
     + (case when last_updated_at is not null then 1 else 0 end) as gesetzt
  from devices
 order by gesetzt desc, created_at asc
 limit 3;
```

**Regel 2 — dazu die aelteste Zeile.** `select id, created_at from devices order by created_at asc
limit 1;` Sie ist **nicht** redundant zu Regel 1: `tei` kam erst mit Migration `0004`, `update_note`
mit `0001` (`docs/radio-portierung-analyse.md` Kap. 4 Pflicht 1). Die älteste Zeile ist also die
einzige, die den **Backfill- und NULL-Weg** durchläuft, den jüngere Zeilen immer gefüllt haben. Sie
prüft weniger Felder und dafür die Felder, die sonst nie leer sind.

**Regel 3 — je verwechselbarem Paar eine Zeile, in der die Glieder VERSCHIEDEN sind.** Die Paare
stehen namentlich in `docs/radio-portierung-analyse.md` Kap. 4 Pflicht 4:

| Paar / Tripel | Beleg | Auswahl-SQL |
|---|---|---|
| `issi` ↔ `tei` | `radio-admin/server/src/db/schema.ts:7`, `:11` | `select id, issi, tei from devices where tei is not null and tei <> issi limit 1;` |
| `created_at` ↔ `updated_at` ↔ `last_updated_at` | `:37`, `:38`, `:18` | `select id, created_at, updated_at, last_updated_at from devices where updated_at <> created_at and last_updated_at is not null limit 1;` |
| `snapshot_call_sign` ↔ `borrower_name` | `:122`, `:125` | `select id, snapshot_call_sign, borrower_name from loans where borrower_name <> snapshot_call_sign limit 1;` |
| `alamos_integrated` ↔ `loanable` | `:29`, `:32` | `select id, alamos_integrated, loanable from devices where alamos_integrated <> loanable limit 1;` |
| `serial_number` ↔ `hiorg_id` ↔ `opta` | Pflicht 1 | `select id, serial_number, hiorg_id, opta from devices where serial_number is not null and hiorg_id is not null and opta is not null and serial_number <> hiorg_id and hiorg_id <> opta limit 1;` |

**Der Zielarm braucht keine eigene Abfrage — und das ist ein Befund, nicht eine Bequemlichkeit.**
Die SQL-Spaltennamen sind auf **beiden** Armen zeichengleich: Spec 1 §2.5.1–§2.5.5 deklariert sie mit
denselben snake_case-Zeichenketten wie die Quelle (`text("snapshot_call_sign")`,
`integer("borrowed_at", { mode: "timestamp" })`). **Genau derselbe `select` läuft unverändert gegen
`radio-admin-snapshot.sqlite` und gegen `radio.db`:**

```sql
-- identisch auf BEIDEN Armen — nichts wird von Hand uebersetzt:
select id, issi, tei, serial_number, hiorg_id, opta, alamos_integrated, loanable
  from devices where id = '<id>';

select id, device_id, snapshot_call_sign, snapshot_serial_number, snapshot_device_type,
       borrower_name, borrowed_at, returned_at, return_note, created_at, updated_at
  from loans where id = '<id>';
```

⚠️ **Warum das ausdrücklich dastehen muss:** eine Spaltenliste von Hand nach camelCase zu übersetzen
ist selbst eine Vertauschungsgelegenheit — in genau der Prüfung, die Vertauschungen fangen soll. Wer
auf dem Zielarm `snapshotCallSign` schreibt, bekommt „no such column" (laut, harmlos); wer zwei
Namen dabei vertauscht, bekommt eine grüne Stichprobe (still, teuer).

**Genau zwei Spalten weichen ab, und beide sind benannt:**

* `devices.last_updated_at` — Typ geändert (`integer` ms → TEXT `YYYY-MM-DD`), siehe §2.2.1. Steht
  deshalb **nicht** in der symmetrischen Liste oben.
* `loans.zugangscode_id` — im Ziel **neu** (Spec 1 §2.5.5, B6) und in der Quelle nicht vorhanden.
  Eigene Protokollzeile auf dem Zielarm: `select count(*) from loans where zugangscode_id is not
  null;` — **muss `0` sein.** Jede importierte Alt-Leihe hat `NULL` (Spec 1 §2.5.5, Kommentar), und
  `zugangscodes` ist ausdrücklich **nicht Teil des Imports** (§2.8.2 Punkt 5). Ein Wert ≠ NULL hieße,
  dass zwischen Import und Prüfung schon über die Suite ausgeliehen wurde — im Cutover-Fenster ist
  das ein Alarm, kein Datenbefund.

⚠️ **Liefert eine dieser Abfragen keine Zeile, ist das ein Protokolleintrag, kein Freibrief.** „Kein
Gerät im Bestand hat `alamos_integrated <> loanable`" heißt: die Vertauschung dieser zwei
0/1-Ganzzahlen ist an den Produktionsdaten **nicht prüfbar**, und das Tor dafür bleibt allein der
Unit-Test `toNeuesGeraet: alamos_integrated und loanable werden nicht vertauscht` (Spec 1 §2.2.5).
Das muss dastehen, sonst hält jemand später eine ungeprüfte Zusage für geprüft.

**Regel 4 — je Tabelle mindestens eine Zeile, und diese hier zwingend:**

| Tabelle | Pflicht-Stichprobe | Grund |
|---|---|---|
| `devices` | Regel-1-Zeile + älteste Zeile + die Paar-Zeilen aus Regel 3 | 25 Spalten, alle vier Verwechslungspaare liegen hier |
| `software_versions` | **die Zeile mit `is_target = 1`**, zwingend | Der Update-Stand ist berechnet, nicht gespeichert (`schema.ts:53-56`). Kippt diese eine Zeile, kippt der Status **jedes** Geräts |
| `users` | die Zeile mit dem grössten `last_seen_at` + eine mit dem kleinsten | 3 Spalten; `sub` ist Primärschlüssel und steht in sechs Auditspalten — ein verändertes `sub` entkoppelt das Journal von Personen |
| `device_events` | **eine Zeile je vorkommendem `source`-Wert** (`select source, min(id) from device_events group by source;`) | `source` ist ein TS-Enum **ohne** DB-CHECK (`schema.ts:96`); der Mapper wirft bei einem fünften Wert (Spec 1 §2.2.4) |
| `loans` | eine **abgeschlossene** Leihe (`returned_at is not null`) + eine **aktive** (`returned_at is null`) | Die zwei Fälle verhalten sich unter dem Faktor-1000-Fehler **gegensätzlich**, siehe §2.3 |

### 2.2.4 Wann die Stichproben laufen — zweimal, nicht einmal

1. **In der Generalprobe**, gegen die Ziel-DB, die aus der **Snapshot-Kopie** entstanden ist. Hier
   ist Zeit, ein Ergebnis zu verstehen.
2. **Im echten Fenster**, gegen `radio.db`, nach dem Import und **vor** dem Umschwenk. Dieselben
   `id`s wie in der Generalprobe sind hier nur brauchbar, wenn zwischen den Läufen keine Zeile
   dazukam oder verschwand — deshalb werden die Auswahl-SQLs im echten Fenster **erneut** gefahren
   und die `id`s neu abgelesen. **Zusage an Kapitel N (Generalprobe und Cutover-Fenster):** die
   Stichproben-`id`s der Generalprobe sind Protokoll, keine Eingabe für den Echtlauf.

---

## 2.3 Die Zeitstempel-Stichprobe — sie braucht eine eigene Form

Der Faktor-1000-Fehler ist die einzige Fehlerklasse dieses Ports, die **paritätsgrün ist UND
Daten löscht**. Die Kette, in drei Belegen:

* Quelle ist epoch-**Millisekunden** (alle Schreibpfade, `docs/radio-portierung-analyse.md:102-115`),
  Ziel ist Drizzle `mode: "timestamp"` = Unix-**Sekunden** (Spec 1 §2.2.1).
* Paritaet ist blind (§2.1.2).
* `radio-admin/server/src/index.ts:35` startet einen Retention-Purge, der **sofort** läuft —
  Quellkommentar: „clears any backlog, e.g. straight after a data migration"
  (`radio-admin/server/src/services/retentionService.ts:47` purgt, erst `:48` startet den
  Tagestimer). Cutoff ist „jetzt minus zwei Monate". Sekunden statt Millisekunden legt jedes
  `returned_at` ins Jahr **1970** → der Purge löscht die **komplette abgeschlossene
  Leihhistorie**. Aktive Leihen (`returned_at IS NULL`) überleben.

Spec 1 §2.7.2 entschärft die Sofort-Übernahme (erster Lauf erst nach 1440 Minuten, B5) — das
verschiebt den Löschzeitpunkt hinter das Rückwegfenster, es beseitigt den Fehler nicht. Die
Stichprobe muss ihn beseitigen.

### 2.3.1 Wert 1 — der diskriminierende: ein `returned_at` einer abgeschlossenen Leihe

```sql
-- QUELLE (Snapshot-Kopie): die JUENGSTE abgeschlossene Leihe.
select id, borrowed_at, returned_at,
       datetime(returned_at/1000, 'unixepoch') as gelesen_als_ms,
       datetime(returned_at,      'unixepoch') as gelesen_als_s
  from loans
 where returned_at is not null
 order by returned_at desc
 limit 1;
```

**Beide Lesarten stehen absichtlich nebeneinander in derselben Ausgabe.** `gelesen_als_ms` muss ein
Datum aus der Betriebszeit von radio-admin zeigen; `gelesen_als_s` muss **1970** zeigen. Zeigen
beide Spalten dasselbe, ist die Grundannahme des ganzen Imports falsch, und dann wird der Cutover
**abgesagt, nicht angepasst** (dieselbe Konsequenz wie bei §2.4.6 / §9.4.1 Nr. 5).

```sql
-- ZIEL (ephemerer Container): derselbe Datensatz, roh.
select id, borrowed_at, returned_at,
       datetime(returned_at, 'unixepoch') as gelesen_als_s
  from loans where id = '<id aus dem Quellarm>';
```

Protokoll, ausgeschrieben:

```
loans/returned_at  id=<id>
  quelle_ms  = <Zahl>            gelesen_als_ms = <Datum in der Betriebszeit>
  ziel_s     = <Zahl>            gelesen_als_s  = <dasselbe Datum>
  rechnung   = quelle_ms / 1000 == ziel_s
  Jahr       = <Jahr>            ⛔ 1970 heisst: Faktor-1000-Fehler, ABBRUCH
```

**Warum die jüngste und nicht irgendeine:** sie ist die eine Zeile, die der Retention-Purge
**garantiert nicht** anfassen darf. Fällt sie nach dem ersten Purge-Lauf weg, ist bewiesen, dass
nicht die Retention gelöscht hat, sondern der Faktor.

### 2.3.2 Wert 2 — der, bei dem beide Lesarten plausibel aussehen

Ein einziger Wert genügt nicht, denn nicht jeder Fehler landet in 1970. `msZuDatum` lässt jeden Wert
in `[1e12, 4e12]` durch (Spec 1 §2.2.4: `MS_MIN` = 2001-09-09, `MS_MAX` = 2096-10-02). Der Riegel
ist absichtlich weit — und deshalb blind gegen Werte, die **innerhalb** der Spanne falsch sind:

```sql
-- QUELLE: die AELTESTE abgeschlossene Leihe, beide Lesarten daneben.
select id, returned_at,
       datetime(returned_at/1000, 'unixepoch') as gelesen_als_ms,
       datetime(returned_at,      'unixepoch') as gelesen_als_s
  from loans where returned_at is not null
 order by returned_at asc limit 1;
```

Hier ist die zweite Lesart **nicht** offensichtlich absurd, und genau das ist der Punkt: ein Wert
knapp über `MS_MIN` (~2001) passiert den Riegel, ist nicht 1970 und ist für radio-admin fachlich
**unmöglich**. Dieselbe Doppeldeutigkeit trägt `users.last_seen_at`: ein Sekundenwert von 2026
(~1.77e9) fällt unter `MS_MIN` und **wirft** — ein Millisekundenwert von 2001 fällt nicht auf.

**Der Vergleich, der diesen Wert prüfbar macht, ist deshalb nicht die Lesart, sondern die
Alt-Anwendung.** Für diesen einen Datensatz wird die Leihe in der Alt-Oberfläche unter
`radio.iuk-ue.de` aufgeschlagen und das dort angezeigte Rückgabedatum ins Protokoll geschrieben —
das ist der einzige Arm dieses Cutovers, der überhaupt eine Oberfläche hat (§2.2.2). Zwei Zeilen,
zwei Prüfarten: Wert 1 beweist die Größenordnung ohne Fremdquelle, Wert 2 beweist den Wert gegen
die Fremdquelle. Wer nur einen von beiden nimmt, hat eine der zwei Fehlerformen ungeprüft.

### 2.3.3 Der Fehlgriff, der diese Stichprobe wertlos macht

⚠️ **Die Zeile, die ein Mensch in der Alt-Oberfläche zuerst sieht, ist eine AKTIVE Leihe — und
deren `returned_at` ist `NULL`.** `NULL` ist auf beiden Armen `NULL`, unter jeder Lesart, bei jedem
Faktor. Eine Stichprobe auf einer aktiven Leihe ist **vakuös** und prüft ausgerechnet das Feld
nicht, das der Fehler zerstört. Dass aktive Leihen den Purge überleben, verstärkt den Irrtum: nach
dem Löschlauf sieht der Kiosk „richtig" aus, weil das, was er anzeigt, das Überlebende ist.

**Verbindlich: die Zeitstempel-Stichprobe kommt aus `returned_at IS NOT NULL`.** Die aktive Leihe
wird zusätzlich gezogen (§2.2.3 Regel 4), aber für die Prüfung von `borrowed_at` und `created_at`,
nicht als Zeitstempel-Stichprobe.

### 2.3.4 Diese Stichprobe ist die Kontrollgruppe fuer den Retention-Purge

Der erste Purge-Lauf liegt 1440 Minuten nach dem Boot (B5, `RADIO_HISTORIE_ERSTLAUF_MINUTEN`).
Danach hat `loans` weniger Zeilen. Um „planmäßig gelöscht" von „Faktor-1000-Fehler" **nach** dem
Umschwenk noch unterscheiden zu können, müssen vier Angaben vor dem Umschwenk im Protokoll stehen:

1. `select count(*) from loans where returned_at is not null;` — abgeschlossene Leihen gesamt
2. die Retention-Zahl aus §2.4.5 (A8)
3. `id` **und rohes** `returned_at` der jüngsten abgeschlossenen Leihe (§2.3.1)
4. `id` und rohes `returned_at` der ältesten abgeschlossenen Leihe (§2.3.2)

**Zusage an Kapitel N (Verifikation nach dem Umschwenk):** mit diesen vier Angaben ist die
Nachkontrolle eine Subtraktion. Verlorene Zeilen == Retention-Zahl → planmäßig. Zeile 3 fehlt →
Faktor-1000, weil die jüngste abgeschlossene Leihe unter keinem korrekten Cutoff löschbar ist.
`count == 0` → alles gelöscht, sofortiger Rückweg „Router zurück". Ohne die vier Zeilen ist dieselbe
Beobachtung nicht deutbar.

⚠️ Die Retention-Zahl der Generalprobe **veraltet um die Länge der Freeze plus die des Fensters** —
ihr Cutoff wandert mit `now`. Sie wird im echten Fenster **erneut** gezählt.

---

## 2.4 Die Abfragen VOR dem Import, gegen die Alt-Datenbank

**Diese Liste ist ein Superset.** Spec 1 §9.4.1 ist „vollstaendig und woertlich in das
Cutover-Runbook zu uebernehmen — nicht zusammenfassen, nicht verlinken", und „wo Spec 2 von dieser
Liste abweicht, ist es ein Fehler in Spec 2". A1–A9 sind deshalb die acht Abfragen aus §9.4.1 in
ihrer Reihenfolge und mit ihrem SQL; A10 ist der Spannen-Riegel aus §2.8.3 Nr. 6; **A11–A13 sind
Ergänzungen dieses Kapitels** und als solche markiert. Die blockierende Einstufung von Spec 1
(§2.8.3: „Nummer 2, 4 und 6 sind blockierend") bleibt erhalten.

**Vorbedingung für alle:** sie laufen gegen die **Snapshot-Kopie**, nie gegen einen laufenden Stack.
Der Auszug entsteht **einmal** (Spec 1 §9.4.1, mit dem Volume-Namen als eigenem Ableseschritt):

```bash
docker compose -f radio-admin/docker-compose.yml stop app
docker volume ls | grep -i radio-data          # ⚠️ compose praefixt mit dem Projektnamen
VOL=<die Zeile aus dem Befehl oben>
docker run --rm -v "$VOL":/d -v "$PWD":/out alpine \
  sh -c 'cp /d/data.sqlite /out/radio-admin-snapshot.sqlite'
```

⚠️ **Der Snapshot muss die WAL mitnehmen.** Ein `cp` der `.sqlite` allein verliert alles, was noch
in `data.sqlite-wal` steht, falls der Stack nicht saubergestoppt hat. Prüfschritt daneben:
`ls -la` im Volume — liegen `-wal`/`-shm` mit Inhalt daneben, wird stattdessen
`sqlite3 /d/data.sqlite ".backup /out/radio-admin-snapshot.sqlite"` verwendet, das den
WAL-Zustand einrechnet. **Wie man den Fehler merkt:** A1 liefert weniger Zeilen als die
Alt-Oberfläche anzeigt — und das fällt nur auf, wenn man beide vergleicht.

Alle folgenden Abfragen laufen als `sqlite3 radio-admin-snapshot.sqlite '<SQL>'`.

### 2.4.1 A1 — Zeilenzahlen je Tabelle (§9.4.1, die sechs Paritaets-Sollwerte)

```sql
select 'devices',           count(*) from devices
union all select 'software_versions', count(*) from software_versions
union all select 'api_tokens',        count(*) from api_tokens
union all select 'users',             count(*) from users
union all select 'device_events',     count(*) from device_events
union all select 'loans',             count(*) from loans;
```

**Zweck:** die sechs Sollwerte, gegen die §2.6 nach dem Import zählt. **Kein Erwartungswert im
Text** — es sind sechs Protokollzeilen. `api_tokens` steht mit in der Liste, obwohl die Tabelle
nicht wandert (Spec 1 §2.10 Punkt 1): die Zahl ist Protokoll für den Abbau.
**Zusage an Kapitel N (Abbau):** der Ersatz für die nicht wandernde Tabelle ist die Textausgabe
`select id, name, prefix, created_at, last_used_at, revoked_at from api_tokens;` **vor** dem
Archivieren des Volumes (Spec 1 §2.10 Punkt 1). Dieses Kapitel liefert nur die Zahl.

⚠️ Fehlt eine der sechs Tabellen im Snapshot („no such table"), ist der Snapshot **vorbaselinig** —
genau der Zustand der lokalen `radio-admin/data/data.sqlite`. Dann ist die falsche Datei kopiert
worden; Abbruch und neuer Auszug.

### 2.4.2 A2 — genau ein Update-Ziel (§9.4.1 Invariante 1) ⛔ **blockierend**

```sql
select count(*) from software_versions where is_target = 1;
```

**MUSS genau `1` sein.** Der Update-Stand ist **berechnet, nicht gespeichert**
(`radio-admin/server/src/db/schema.ts:53-56`), und es gibt keinen DB-Constraint dafür: kein
partieller Unique, kein Trigger, kein CHECK — die Invariante lebt allein in einer
Anwendungstransaktion (`softwareVersionRepo.ts:81-87`), und der Leser `getTargetVersion` (`:63-70`)
nimmt `.limit(1).get()` **ohne `ORDER BY`**. Bei `0` oder `2` kippt der angezeigte Update-Status
**jedes** Geräts, und **keine Paritaet sieht es** (1:1 übernommen ist 1:1 grün).

### 2.4.3 A3 — Waisen in `device_events` (§9.4.1 Invariante 2) ⛔ **blockierend**

```sql
select count(*) from device_events e
  left join devices d on d.id = e.device_id
 where d.id is null;
```

**MUSS `0` sein.** `foreign_keys = ON` gilt auf beiden Seiten
(`radio-admin/server/src/db/index.ts:28`, `src/core/db/index.ts:19`), und
`device_events.device_id → devices.id ON DELETE CASCADE` ist die einzige `FOREIGN KEY`-Zeile aller
fünf Migrationen (`schema.ts:88-90`). **Ein Treffer heißt: der Import bricht hart ab** — besser
jetzt als im Fenster.

### 2.4.4 A4 — zwei aktive Leihen auf einem Geraet (§9.4.1 Invariante 3) ⛔ **blockierend**

```sql
select device_id, count(*) from loans
 where returned_at is null group by device_id having count(*) > 1;
```

**MUSS leer sein.** Sonst lässt sich `loans_device_active_uidx` im Ziel nicht anlegen — der
**partielle** Unique-Index `ON loans (device_id) WHERE returned_at IS NULL`, den `drizzle-kit` nicht
emittieren kann und der in `0003_kind_spot.sql` handgeschrieben am Ende steht
(`docs/radio-portierung-analyse.md` Kap. 5 Falle 2). Zweite Wirkung derselben Falle:
`onConflictDoUpdate({ target: loans.deviceId })` kann einen partiellen Index **nicht** treffen —
Historie im Bulk ist gefahrlos (`returned_at NOT NULL`, der Index greift nicht), zwei **aktive**
Leihen auf einem Gerät schlagen hart fehl.

### 2.4.5 A5 bis A9 — die vierte Invariante und die vier Belege (§9.4.1)

```sql
-- A5 (§9.4.1 Invariante 4) MUSS leer sein — `source` ist ein TS-Enum OHNE DB-CHECK.
select distinct source from device_events
 where source not in ('manual','csv-import','create','update-note');
```
Das Enum steht nur im Quelltext (`schema.ts:96`); in SQL ist die Spalte `` `source` text NOT NULL ``
und die DB akzeptiert **jeden** String. Der Mapper `toNeuesGeraeteEreignis` **wirft** bei allem
anderen (Spec 1 §2.2.4). **Prüfen, nicht annehmen.**

```sql
-- A6 (§9.4.1 Nr. 5) Groessenordnung: DREIZEHNSTELLIG = Millisekunden.
select min(created_at), max(created_at), length(cast(max(created_at) as text)) from devices;
```
Der empirische Beweis für die Übergabezeile „Zeitstempel-Einheit". **Kommt hier zehnstellig heraus,
ist die gesamte Import-Annahme falsch und der Cutover wird abgesagt, nicht angepasst.**

```sql
-- A7 (§9.4.1 Nr. 6) Traegt die Prod-DB von Hand angelegte Trigger oder Views?
select type, name, sql from sqlite_master where type in ('trigger','view');
```
Der Grep-Beleg „null Trigger, null CHECKs" gilt für den **Quelltext**, nicht für die laufende
Datenbank (`docs/radio-portierung-analyse.md:2038-2040`; die Analyse streicht dort ausdrücklich den
Zusatzbeleg über die lokale DB, weil die vorbaselinig ist). **Ein Treffer ist Fachlogik, die kein
Repo kennt.**

```sql
-- A8 (§9.4.1 Nr. 7) Die Retention-Zahl, die die Schaetzung ersetzt.
select count(*) from loans
 where returned_at is not null
   and returned_at < (strftime('%s','now','-2 months') * 1000);
```
⚠️ **Der Faktor 1000 steht hier absichtlich im SQL:** die Alt-Spalte ist Millisekunden,
`strftime('%s')` liefert Sekunden. Wer ihn weglässt, zählt **alle** zurückgegebenen Leihen und hält
das für eine bestätigte Schätzung. Diese Zahl ersetzt die Betreiber-**Schätzung** „< 100"
(`docs/radio-portierung-analyse.md:1774`) durch eine **Zählung** — sie ist gleichzeitig die Zahl,
die der Import nicht verlieren darf (§2.3.4). **Kein Erwartungswert im Text.** Sie wird im echten
Fenster erneut gezählt, weil ihr Cutoff mit `now` wandert.

```sql
-- A9 (§9.4.1 Nr. 8) Steht `dev-user` in der Prod-DB? (Falle 15)
select sub from users;
select distinct created_by from devices;
```
Ein `dev-user` unter den Auditspalten heißt: `AUTH_DEV_BYPASS` war irgendwann aktiv, und die
Zuordnung von Journalzeilen zu Personen ist an diesen Stellen keine.

### 2.4.6 A10 — der Spannen-Riegel ueber alle zehn Zeitstempelspalten (§2.8.3 Nr. 6) ⛔ **blockierend**

`msZuDatum` **wirft** bei jedem Wert außerhalb `[1e12, 4e12]` (Spec 1 §2.2.4). Also muss der Riegel
**vor** dem Fenster feuern, nicht darin — und A6 sieht nur die Spanne **einer** Spalte. Diese
Abfrage sieht **alle zehn** und **muss `0` ergeben**:

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

Ein Treffer ist eine `0`, ein Sekundenwert oder ein Ausreißer in **einer** Zeile. **Zur
Fehlersuche** wird derselbe Ausdruck spaltenweise wiederholt, sonst weiß man nur „irgendwo eine".

### 2.4.7 A11 — `typeof()` je Zeitstempelspalte ⬛ **Ergaenzung dieses Kapitels**

SQLite erzwingt Spaltentypen nicht — die Deklaration `integer` ist eine **Affinität**, kein
Constraint. **A11 und A10 prüfen disjunkte Fehlerklassen:** A10 die **Groessenordnung**, A11 die
**Speicherklasse**. Beide enden im selben Riegel: `msZuDatum` prüft `Number.isInteger(ms)` und wirft
— und ein `throw` im Fenster ist ein Abbruch.

⚠️ **Nachgerechnet, welche Klasse A10 wirklich sieht** — sonst ist A11 nur Zeremonie:

| Speicherklasse | sieht A10? | warum |
|---|---|---|
| `'real'` (z. B. `1.771e12`) | ⛔ **nein** | Der Wert liegt **in** der Spanne, A10 ist grün. `Number.isInteger` ist `false`, `msZuDatum` wirft. **Das ist der Fall, für den A11 gebaut ist** |
| `'null'` in einer NOT-NULL-Spalte | ⛔ **nein** | `NULL NOT BETWEEN …` ergibt `NULL`, nicht `1` — die Zeile wird von A10 **nicht** gezählt |
| `'text'`, nicht numerisch | ja | Speicherklassenordnung: TEXT > INTEGER, also ist `NOT BETWEEN` wahr. A10 meldet aber nur „irgendwo eine"; A11 nennt Spalte **und** Klasse |
| `'text'`, numerisch (`'1771000000000'`) | entfällt | Integer-Affinität wandelt beim Schreiben in `'integer'` um; die Klasse taucht hier nicht auf. Wer sie erwartet, sucht am falschen Ort |

```sql
select 'devices.created_at',            typeof(created_at),      count(*) from devices            group by 2
union all select 'devices.updated_at',           typeof(updated_at),      count(*) from devices            group by 2
union all select 'devices.last_updated_at',      typeof(last_updated_at), count(*) from devices            group by 2
union all select 'device_events.changed_at',     typeof(changed_at),      count(*) from device_events      group by 2
union all select 'software_versions.created_at', typeof(created_at),      count(*) from software_versions  group by 2
union all select 'users.last_seen_at',           typeof(last_seen_at),    count(*) from users              group by 2
union all select 'loans.borrowed_at',            typeof(borrowed_at),     count(*) from loans              group by 2
union all select 'loans.returned_at',            typeof(returned_at),     count(*) from loans              group by 2
union all select 'loans.created_at',             typeof(created_at),      count(*) from loans              group by 2
union all select 'loans.updated_at',             typeof(updated_at),      count(*) from loans              group by 2
order by 1, 2;
```

**Erwartetes Ergebnis, ausgeschrieben — sonst wird diese Abfrage jedes Mal „findet etwas" und jedes
Mal durchgewunken:**

* **Zehn Beschriftungsgruppen in der Ausgabe.** ⚠️ Jedes Glied der Union hat ein `group by 2` — eine
  **leere Tabelle liefert gar keine Zeile**, nicht `count = 0`. Weniger als zehn Beschriftungen ist
  deshalb selbst ein Befund und **vor** dem Lesen der Klassen gegen A1 abzugleichen: sonst ist
  „Spalte gemessen, alles `integer`" von „Spalte nie gemessen" nicht zu unterscheiden.
* `'integer'` für alle zehn Spalten.
* **`'null'` ist zusätzlich erwartet und richtig** für die zwei nullable Spalten
  `devices.last_updated_at` und `loans.returned_at` (`schema.ts:18` bzw. Spec 1 §2.5.5:
  `returnedAt` ohne `.notNull()`). ⚠️ `'null'` bei einer der **acht** NOT-NULL-Spalten ist dagegen
  ein Befund: NOT NULL galt nicht immer, oder die Zeile ist älter als die Migration.
* **`'text'` oder `'real'` ist immer ein Befund.** `'real'` ist der leise Fall (siehe Tabelle
  oben): A10 ist dafür grün, `msZuDatum` wirft.

### 2.4.8 A12 — Leihen ohne Geraet ⬛ **Ergaenzung dieses Kapitels**

```sql
select case when l.returned_at is null then 'AKTIV' else 'abgeschlossen' end as art,
       count(*)
  from loans l left join devices d on d.id = l.device_id
 where d.id is null
 group by 1;
```

**Zweck.** `loans.device_id` trägt **absichtlich keinen** Fremdschlüssel, und der Quelltext
begründet es wörtlich (`radio-admin/server/src/db/schema.ts:106-110`): zurückgegebene Leihen sind
Historie und müssen eine spätere Gerätelöschung überleben; die historische Richtigkeit trägt der
unveränderliche `snapshot_*`-Dreisatz, nicht ein lebender Join. Im Ziel bleibt es so (Spec 1 §2.3,
§2.10 Punkt 6). **Eine Waise ist hier also legal — auf beiden Seiten**, und deshalb gibt es weder
ein Tor noch einen Paritätsfehler dafür.

Die Zeile **trennt trotzdem zwei Fälle**, und darum lohnt die Abfrage:

* `abgeschlossen` → **mitnehmen und im Ziel tolerieren.** Das ist genau der Fall, für den die
  FK-Freiheit gebaut ist. Protokollzeile, keine Bereinigung. ⚠️ **Und ausdrücklich: keinen FK
  „der Ordnung wegen" nachziehen** — mit `CASCADE` löscht die erste Ausmusterung die Historie, mit
  `RESTRICT` blockiert jede alte Rückgabe das Ausmustern, und beides ist gültiges Drizzle,
  gültiges SQL und **paritätsgrün** (Falle 3 der Analyse).
* `AKTIV` → **untersuchen.** Eine aktive Leihe auf einem nicht existierenden Gerät ist im Betrieb
  nicht zurückgebbar: die Rückgabe geht über den Gerätebestand. Sie wandert mit, aber die Zahl
  gehört als benannter Restposten ins Protokoll, damit sie nach dem Umschwenk nicht als
  Portierungsfehler gelesen wird.

### 2.4.9 A13 — `returned_at` vor `borrowed_at` ⬛ **Ergaenzung dieses Kapitels**

```sql
select count(*) from loans
 where returned_at is not null and returned_at < borrowed_at;
```

**Zweck und Eigenständigkeit.** Diese Abfrage findet, was A10 und A11 nicht finden können: eine
**zeilenweise Vertauschung** der beiden Zeitstempel ist größenordnungsrichtig, speicherklassenrichtig
und damit unter A10 wie A11 grün. Serverseitig ist die Reihenfolge nirgends geschützt —
`radio-admin/shared/src/schemas.ts:29`, `:61`, `:87` typisieren `z.number().int().nullable()` ohne
`min`/`max`, es gibt keinen CHECK und keinen Trigger.

**Entscheidung: mitnehmen und im Ziel tolerieren**, mit Protokollzeile. Grund: das Zielschema
verlangt die Ordnung ebenso wenig (Spec 1 §2.5.5), eine „Korrektur" wäre eine erfundene
Fachentscheidung über fremde Daten, und die betroffene Leihe ist abgeschlossen — sie fällt ohnehin
in absehbarer Zeit unter die Retention. ⚠️ Was **nicht** toleriert wird: `returned_at < borrowed_at`
in einer Zeile, die A10 zusätzlich als unplausibel meldet. Dann ist es kein Datenfehler von 2024,
sondern ein Hinweis darauf, dass der Snapshot beschädigt ist.

---

## 2.5 Was passiert, wenn eine Abfrage etwas findet — die Entscheidung je Fall

Drei Ausgänge, und jeder hat echte Insassen. **Wo „bereinigen" steht, wird in der SNAPSHOT-KOPIE
bereinigt, nie in der laufenden Alt-Datenbank**, und die Bereinigung ist eine Protokollzeile mit dem
ausgeführten SQL.

| Abfrage | Befund | Entscheidung | Wie man merkt, dass es schiefgegangen ist |
|---|---|---|---|
| **A1** | Tabelle fehlt | ⛔ **abbrechen** | „no such table" — falscher, vorbaselinger Snapshot |
| **A1** | Zahl weicht von der Alt-Oberfläche ab | ⛔ **abbrechen** | WAL nicht mitgenommen; `.backup` statt `cp` verwenden |
| **A2** | `is_target` ≠ 1 | 🧹 **bereinigen, protokolliert.** Der Betreiber benennt die Zielversion, `update software_versions set is_target = 0;` dann `= 1` für die eine. Mechanisch möglich, weil der Zielzustand fachlich eindeutig **eine** Version ist | Nach dem Import zeigt jedes Gerät denselben oder keinen Update-Status. Kein Test, keine Paritaet |
| **A3** | Waise in `device_events` | 🧹 **bereinigen, protokolliert.** Die Waise ist ein Journaleintrag zu einem gelöschten Gerät und im Ziel per CASCADE-FK nicht speicherbar. `delete from device_events where device_id not in (select id from devices);`, Anzahl ins Protokoll | Ohne Bereinigung: harter Abbruch beim Import — laut, aber ein verbrannter Schritt im Fenster |
| **A4** | zwei aktive Leihen auf einem Gerät | ⛔ **abbrechen bzw. Betreiberentscheid, und deshalb in der GENERALPROBE finden.** Welche der zwei Leihen die echte ist, ist eine **fachliche** Frage über ein Gerät im Umlauf — kein mechanischer Fix. Ohne Entscheid wird nicht importiert | Ohne Entscheid schlägt das Anlegen von `loans_device_active_uidx` fehl. Wer den Index daraufhin „weglässt", hat die Invariante **still** abgeschafft — und der Bestand erfüllt sie ja, also merkt es niemand, bis der Kiosk ein Gerät zweimal ausleiht |
| **A5** | unbekannter `source`-Wert | ⛔ **abbrechen / eskalieren.** Der Mapper wirft, und den bekannten Wertesatz zu erweitern ist eine **Änderung an Spec 1** (§2.2.4 plus der erschöpfende Switch der Oberfläche), keine Fensterentscheidung | Ohne Abfrage: Abbruch mitten im Import. Mit „Wert schnell in den Mapper aufnehmen": die Oberfläche bricht später an einem nicht erschöpften Switch |
| **A6** | zehnstellig | ⛔ **Cutover absagen**, nicht anpassen. Die Grundannahme des Imports ist falsch | — |
| **A7** | Trigger oder View | ⛔ **abbrechen / eskalieren.** Das ist Fachlogik, die kein Repo kennt; sie muss gelesen und bewertet werden, bevor irgendetwas importiert wird | Ohne Abfrage wandert die Wirkung nicht mit, und niemand vermisst sie: das Ziel ist konsistent, nur anders |
| **A8** | Zahl deutlich über der Schätzung | ✅ **mitnehmen — es ist keine Abweichung, sondern die Zählung.** „< 100" war eine Schätzung. Die Zahl geht ins Protokoll und in §2.3.4 | Wer sie als „zu hoch" behandelt und die Retention abschaltet, schaltet die DSGVO-Begründung für `borrower_name` ab (Spec 1 §2.7, B5: der Abschalter ist `RADIO_HISTORIE_PURGE=0`, **laut** bei jedem Start) |
| **A9** | `dev-user` in Auditspalten | ✅ **mitnehmen und im Ziel tolerieren.** Eine Zuschreibungslücke ist kein Datenfehler; ein „bereinigter" Audit-Eintrag wäre eine Fälschung | Nicht protokolliert wirkt es später wie ein Importfehler |
| **A10** | ≠ 0 | ⛔ **abbrechen**, dann spaltenweise nachfahren und die Zeilen ansehen. Erst danach Entscheid: Einzelzeile bereinigen (protokolliert) oder absagen | `msZuDatum` wirft — laut, aber im Fenster. Genau dafür läuft A10 davor |
| **A11** | `'text'` oder `'real'` | ⛔ **abbrechen.** `Number.isInteger` ist `false`, der Mapper wirft. Eine Einzelzeile ist nach Sichtprüfung in der Kopie zu bereinigen (`cast`), protokolliert | Bei `'real'` ist A10 **grün** — das ist der Grund, warum A11 existiert. Bei `'null'` in einer NOT-NULL-Spalte ebenfalls (`NULL NOT BETWEEN …` ergibt `NULL`) |
| **A11** | `'null'` in einer NOT-NULL-Spalte | ⛔ **abbrechen / eskalieren.** „Fehlender Zeitstempel" ist der Fall, den Spec 1 §2.2.5 mit dem Test `msZuDatum wirft bei 0 und bei null-artigen Werten in einer NOT-NULL-Spalte` ausdrücklich als 1970-Falle benennt | Ein toleranter Mapper macht daraus 1970 und der Purge löscht die Zeile |
| **A12** | Waise, `abgeschlossen` | ✅ **mitnehmen und im Ziel tolerieren.** Genau der Fall, für den die FK-Freiheit gebaut ist. **Keinen FK nachziehen** | Ein „aufräumendes" `delete` löscht Historie, die die Alt-Anwendung bewusst behalten hat |
| **A12** | Waise, `AKTIV` | ⚠️ **mitnehmen, aber als benannter Restposten protokollieren** und dem Betreiber vorlegen: die Leihe ist über die Oberfläche nicht zurückgebbar | Ohne Protokollzeile sucht später jemand einen Portierungsfehler |
| **A13** | `returned_at < borrowed_at` | ✅ **mitnehmen und im Ziel tolerieren**, Zahl ins Protokoll — außer die Zeile fällt zusätzlich in A10, dann ⛔ Snapshot verdächtig | Eine „Korrektur" erfindet eine Fachentscheidung über fremde Daten |

**Die Zeile, die alle drei Spalten zusammenhält:** ⛔ **Kein Befund wird im Cutover-Fenster zum
ersten Mal gesehen.** Alle dreizehn Abfragen laufen in der **Generalprobe** gegen die Snapshot-Kopie
(Spec 1 §9.3.4) und im echten Fenster ein zweites Mal. Der Unterschied ist nicht die Abfrage,
sondern der Preis: in der Generalprobe eine halbe Stunde, im Echtlauf ein Abbruch um 23 Uhr — und
weil es kein Parallelfenster gibt, ist der Abbruch dort teuer.

---

## 2.6 Nach dem Import: die Gegenzaehlungen, bevor irgendetwas umgeschwenkt wird

Muster `docs/runbooks/lagerbuch-cutover.md:452`, `:544` — **dieselbe Zahl vorher und nachher.** Alle
Befehle laufen im ephemeren Container aus §2.2.2, **kein Browser, keine Domain.**

```sql
-- Fuenf Sollwerte gegen A1. `api_tokens` fehlt hier absichtlich (Spec 1 §2.10 Punkt 1).
select 'devices',           count(*) from devices
union all select 'software_versions', count(*) from software_versions
union all select 'users',             count(*) from users
union all select 'device_events',     count(*) from device_events
union all select 'loans',             count(*) from loans;

-- Die drei Invarianten, jetzt im ZIEL. Erwartung wie A2/A3/A4.
select count(*) from software_versions where is_target = 1;
select count(*) from device_events e left join devices d on d.id = e.device_id where d.id is null;
select device_id, count(*) from loans where returned_at is null group by device_id having count(*) > 1;

-- Der partielle Index MUSS da sein — drizzle-kit erzeugt ihn nicht (Falle 2).
select name, sql from sqlite_master
 where type = 'index' and name = 'loans_device_active_uidx';

-- Die vier Angaben fuer die Retention-Kontrollgruppe (§2.3.4).
select count(*) from loans where returned_at is not null;
select id, returned_at, datetime(returned_at,'unixepoch') from loans
 where returned_at is not null order by returned_at desc limit 1;
select id, returned_at, datetime(returned_at,'unixepoch') from loans
 where returned_at is not null order by returned_at asc  limit 1;
```

⚠️ **Der Index-Check ist nicht redundant.** `loans_device_active_uidx` ist für das Drizzle-Schema
unsichtbar (`0003_kind_spot.sql` sagt es selbst: „it is invisible to the drizzle schema, so future
`drizzle-kit generate` runs neither see nor drop it"). Fehlt er, ist alles grün — Build, Typecheck,
Paritaet, jede Zählung oben — und die Invariante „höchstens eine aktive Leihe je Gerät" ist **weg**.
Sichtbar wird es erst, wenn der Kiosk ein Gerät zum zweiten Mal ausleiht.

⬜ **zu ergaenzen nach dem Bau:** die zwei Ablesungen, die erst existieren, wenn das Modul gebaut
ist. (a) `select count(*) from __drizzle_migrations;` in `radio.db` gegen die Zahl der Einträge in
`src/app/m/radio/_db/migrations/meta/_journal.json` — Muster `lagerbuch-cutover.md:72`; die Zahl
kann ich nicht nennen, weil das Verzeichnis noch nicht existiert. (b) die Ausgabe von
`/api/health/radio` im ephemeren Container samt der Angabe, welches Feld darin den Modulnamen und
welches den DB-Zugriff belegt (`src/app/api/health/[modul]/route.ts:11-18`). ⚠️ **Nie
`/api/health`** — `src/app/api/health/route.ts` liefert konstant `{status:"ok"}` ohne Modul und ohne
Datenbank. Und Health beweist ohnehin weniger als sein Name: `SELECT 1` auf einer Datei, die bei
Bedarf **neu angelegt** wird. Deshalb steht die **zählende** Prüfung oben **neben** dem Healthcheck,
nicht an seiner Stelle.

---

## 2.7 Zusagen dieses Kapitels, gesammelt

| An wen | Zusage |
|---|---|
| **Kapitel N (Generalprobe und Cutover-Fenster)** | A1–A13 laufen **zweimal**: in der Generalprobe gegen die Snapshot-Kopie, im echten Fenster erneut. Die Stichproben-`id`s der Generalprobe sind Protokoll, keine Eingabe für den Echtlauf. A8 wird im Fenster **neu** gezählt, weil ihr Cutoff mit `now` wandert |
| **Kapitel N (Generalprobe und Cutover-Fenster)** | Nach einem roten Paritätscheck ist der Rückweg die **gelöschte, leere `radio.db`** plus neuer Migrationslauf — nicht ein zweiter Import auf denselben Bestand (`portal.ts:105-107`). Der Schritt muss benannt im Fenster stehen |
| **Kapitel N (Verifikation und Umschwenk)** | Jede Zielarm-Prüfung dieses Kapitels läuft im **ephemeren Container ohne Traefik-Labels**. Es gibt keinen Browserweg auf den Zielarm, solange der Alt-Kiosk `radio.iuk-ue.de` bedient |
| **Kapitel N (Verifikation nach dem Umschwenk)** | Die vier Angaben aus §2.3.4 stehen **vor** dem Umschwenk im Protokoll. Mit ihnen ist „Retention hat gelöscht" von „Faktor-1000 hat gelöscht" nach dem ersten Purge-Lauf (1440 min, B5) unterscheidbar; ohne sie nicht |
| **Kapitel N (Abbau)** | Dieses Kapitel liefert die **Zahl** aus `api_tokens` (A1). Die Textausgabe `select id, name, prefix, created_at, last_used_at, revoked_at from api_tokens;` vor dem Archivieren des Volumes gehört dorthin (Spec 1 §2.10 Punkt 1) |
| **Kapitel N (Abbau)** | Der Postgres von radio-inventar und die Zählung `select count(*) from "AdminUser";` sind **nicht** Teil dieses Kapitels; sie stehen in Spec 1 §9.4.2 und gehören ins Abbau-Kapitel. ⚠️ Die dortigen einfachen Anführungszeichen sind tragend — Prisma legt gemischtschreibende Tabellennamen an |
| **Spec 1 (Rückwirkung)** | Findet A5 einen fünften `source`-Wert oder A7 einen Trigger, ist das eine **Änderung an Spec 1** (§2.2.4 bzw. §2.3 Punkt 3), keine Fensterentscheidung |

**Die drei Leerstellen dieses Kapitels, benannt:** die vier noch nicht ausgeschriebenen
Paritätssichten (§2.1.4), die Migrationszählung und die Health-Ausgabe (§2.6). Alle drei sind
Ablesungen an einem gebauten Modul; eine geratene Fassung hätte prüfbar ausgesehen und wäre keine.
