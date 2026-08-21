# 5. Standby und Abbau

Der Abbau ist die **einzige unumkehrbare Handlung dieses Cutovers.** Alles davor ist ein
Routing-Vorgang oder ein wiederholbarer Import; ab dem gelöschten Volume gibt es keine Quelle mehr,
gegen die man nachschlagen könnte. Dieses Kapitel legt deshalb drei Dinge fest, in dieser
Reihenfolge: **wie lange was im Standby bleibt und warum**, **welche Zählungen vor dem Abbau laufen
und welches Ergebnis ihn stoppt**, und **was genau abgebaut wird** — Posten für Posten, mit der
Bedingung daneben.

Zwei Sätze, die dieses Kapitel von den fünf vorherigen Abbau-Kapiteln des Hauses trennen:

* ⚠️ **Der billige Rückweg endet früher als das Standby-Fenster.** Bei `files` und `lagerbuch` war
  „Router zurück" bis zum Abbau möglich. Hier stirbt der Rückweg nach **einer Stunde**
  (Spec 1 §9.3.3 Punkt 2), weil der erste fachliche Schreibvorgang in `radio.db` der Point of no
  return ist und es keinen Rückweg-Importer gibt.
* ⚠️ **„Beide parken und in Ruhe schauen" ist hier nicht möglich, und Nachschlagen ist aktiv
  zerstörend.** Der Alt-Kiosk hielt `radio.iuk-ue.de` selbst (Entscheidung 3), es gibt also keinen
  Zustand, in dem beide bedienen. Und **jeder Start von radio-admin löscht Historie**:
  `radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`,
  `radio-admin/server/src/services/retentionService.ts:47` führt `purge()` **sofort** aus, erst `:48`
  folgt der Tagestimer; der Cutoff hängt an der Wanduhr (`:9`, `:19`), also löscht **jeder weitere
  Start mehr als der vorige** (Spec 1 §9.3.4).

---

## 5.1 Das Standby-Fenster: die Frist wird begründet, nicht übernommen

Das Projektmuster sind zwei Wochen (`CLAUDE.md:239`: „Router umschwenken (nie zwei Router
gleichzeitig aktiv) → 2 Wochen Standby"). Bei `files` wurde bewusst darauf verzichtet, weil es
**keinen Bestand** gab — die vier Bestandszählungen dort waren alle null
(`docs/runbooks/files-cutover.md:62`, §H Punkt 1). **Hier gibt es Bestand:** Geräte, Leihen,
Geräte-Ereignisse, Benutzer, Softwareversionen (Spec 1 §9.4.1, sechs Tabellen). Das Muster wird also
nicht verworfen — aber es wird **anders zugeschnitten**, weil die zwei Wochen bei `radio` etwas
anderes tragen als bei `lagerbuch`.

### 5.1.1 Drei Fristen, weil drei verschiedene Dinge geschützt werden

| Frist | Was sie schützt | Woran sie hängt |
|---|---|---|
| **Stunde 1 nach dem Umschwenk** | Der **Rückweg**: `SUITE_HOST_RADIO=` leeren, `radio.iuk-ue.de` aus `SUITE_TRAEFIK_RULE` nehmen, radio-inventar wieder ansprechen lassen | Spec 1 §9.3.3: ab dem ersten fachlichen Schreibvorgang in `radio.db` ist Rollback ein **Datenverlust mit bekanntem Umfang**. In dieser Stunde bleibt der Kiosk unter Beobachtung; danach nur noch vorwärts |
| **Zwei Wochen** | Die **Datenquelle** für feldweise Nachprüfung und Re-Import: das radio-admin-Volume bzw. seine Snapshot-Kopie, das radio-inventar-Postgres-Volume, beide Images | ⚠️ **Nicht** der Rückweg — der ist nach Stunde 1 vorbei. Die zwei Wochen sind die Zeit, in der ein **Zuordnungsfehler** auffällt, den kein Tor sieht |
| **Dauerhaft, off-server** | Das **Archiv**: `radio-admin-snapshot.sqlite` und der `pg_dump` im Custom-Format, nicht auf demselben Server wie die Suite | Spec 1 §9.5.1, Zeile „Snapshot-Kopie". Es ist der Rest, der die Volumes überlebt |

⚠️ **Die Fehllesart, die diesen Cutover teuer macht:** die zwei Wochen als „Rollback-Fenster" zu
lesen. Wer das tut, entspannt die Abnahme („wir können ja zurück"), und genau das kann er nach
Stunde 1 nicht mehr. **Die Abnahme (Kapitel 4) ist die einzige Stelle, an der noch etwas billig
ist.**

### 5.1.2 Warum zwei Wochen die richtige Zahl für die Datenquelle sind — die Rechnung

Die Frist ist nicht Gewohnheit, sondern folgt aus dem **Erstlauf der übernommenen Retention**:
Vorbelegung **1440 Minuten**, also ein Tag (Kapitel B, Eintrag B5: „**Erstlauf: Vorbelegung 1440
Minuten** — Kapitel 2s Begründung (das Fenster für Verifikation, Stichprobe und ‚Router zurück')
trägt").

Daraus die Kette, die die Frist bemisst:

1. Ein **Faktor-1000-Fehler ist paritätsgrün** (`CLAUDE.md:241-243`,
   `scripts/import/parity.ts:43-56`; beide Arme leiten aus derselben Funktion ab,
   `scripts/import/portal.ts:73-76`).
2. Sekunden statt Millisekunden legt jedes `returned_at` ins Jahr 1970. Der Schaden entsteht nicht
   beim Import, sondern beim **ersten Retention-Lauf** — also frühestens **einen Tag nach dem
   Umschwenk**, und dann still: die abgeschlossene Leihhistorie ist weg, aktive Leihen
   (`returned_at IS NULL`) leben weiter, die Oberfläche sieht funktionsfähig aus.
3. Die **einzige** Quelle, aus der diese Historie zurückkommt, ist das radio-admin-Volume bzw. seine
   Snapshot-Kopie.
4. „Einen Tag nach dem Umschwenk" ist der **frühestmögliche** Zeitpunkt der Sichtbarkeit, nicht der
   wahrscheinliche: bemerkt wird eine fehlende Historie, wenn jemand sie braucht — bei einer
   Nachfrage, einer Auswertung, einem Monatsabschluss. Zwei Wochen decken einen vollen
   Dienstzyklus ab und lassen nach dem verdächtigen Tag noch dreizehn Tage zum Nachschlagen.

**Festlegung:** Standby der Datenquellen = **14 Tage nach dem Umschwenk**, mit einem im Protokoll
**ausgeschriebenen Enddatum** und einer namentlich benannten Person, die den Abbau auslöst. Ohne
Datum und Namen endet ein Standby nie — dann steht in einem Jahr ein gestoppter Stack, den niemand
mehr erklären kann, und niemand traut sich, ihn zu löschen.

> Umschwenk am: ____________ · Standby-Ende (Umschwenk + 14 Tage): ____________ ·
> Abbau verantwortet: ____________________

⚠️ **Verlängerungsgrund, benannt:** ist die Retention-Gegenprobe aus 5.2.2 (Abfrage R) **nicht**
grün protokolliert, beginnen die 14 Tage erst, wenn sie es ist. Eine offene Gegenprobe heißt: es ist
unbekannt, ob die Historie im Ziel angekommen ist — und dann ist das Volume nicht Standby, sondern
die einzige Kopie.

**Zusage an Kapitel 4 (Abnahme und Verifikation):** die Retention-Gegenprobe und die
Zeitstempel-Grenzprobe (5.2.2, Abfragen R und Z) gehören in die Abnahme **und** in dieses Kapitel.
Dort sind sie eine Freigabe, hier eine Abbau-Sperre; die Zahl darf nicht zweimal ermittelt, sondern
muss einmal ermittelt und zweimal gelesen werden. Die Protokollzeile ist dieselbe.

---

## 5.2 Die Zählungen vor dem Abbau

**Warum das keine Formalie ist.** „Bestand annehmen statt zählen" ist der beim Namen genannte Fehler
der Phase 4 (§A-Lehre; zitiert in `docs/radio-portierung-analyse.md:1777` und in Spec 1 §9.4). Dazu
die strukturelle Blindheit des Paritätschecks: er beweist den Datenbank-**Rundlauf**, nicht die
**Feldzuordnung** (`CLAUDE.md:241-243`).

⚠️ **Keine Zahl in diesem Kapitel ist ein Wert; jede ist ein Schritt.** Insbesondere ist
`radio-admin/data/data.sqlite` im Repo als Beleg **unbrauchbar**: leer und vorbaselinig,
`.tables` führt nur `__drizzle_migrations`, `device_events`, `devices`, `software_versions` —
`loans`, `api_tokens` und `users` **fehlen ganz** (`docs/radio-portierung-analyse.md:1865-1872`).
Wer eine Zahl aus dieser Datei ins Protokoll schreibt, protokolliert einen Stand **vor** der
Loan-Migration.

### 5.2.1 Was hier läuft und was ausdrücklich nicht

Spec 1 §9.4.1 führt acht Abfragen gegen die Alt-SQLite. Sie sind **nicht alle** Abbau-Sperren, und
sie hier vollständig zu wiederholen würde die Liste verwässern, die unter Zeitdruck gelesen wird.

| Abfrage aus Spec 1 §9.4.1 | Gehört zu | Warum |
|---|---|---|
| 1 `software_versions where is_target = 1` (MUSS 1) | **Kapitel 2, vor dem Import** | Ein Import-Tor. Vor dem Abbau beweist eine Wiederholung nichts — die Kopie hat sich nicht geändert |
| 2 `device_events` ohne `devices` (MUSS 0) | **Kapitel 2, vor dem Import** | FK-Kante, `foreign_keys = ON` beidseitig (`radio-admin/server/src/db/index.ts:28`, `src/core/db/index.ts:19`). Der Import bricht hart ab, wenn sie verletzt ist — das ist laut, nicht still |
| 3 doppelte aktive Leihen je Gerät (MUSS leer) | **Kapitel 2, vor dem Import** | Sonst lässt sich der partielle Aktiv-Index im Ziel nicht anlegen |
| 4 `device_events.source` außerhalb des Enums (MUSS leer) | **Kapitel 2, vor dem Import** | TS-Enum ohne DB-CHECK (`radio-admin/server/src/db/schema.ts:96`) |
| 5 Zeitstempel-Größenordnung (dreizehnstellig) | **Kapitel 2, vor dem Import** | Kommt hier zehnstellig heraus, wird der Cutover abgesagt, nicht angepasst |
| 6 `sqlite_master` auf Trigger/Views | **Kapitel 2, vor dem Import** | Fachlogik, die kein Repo kennt |
| **7 Retention-Zahl** | ⚠️ **beides** — hier als Abfrage R | Die **einzige** Zahl, die der Faktor-1000-Fehler nicht paritätsgrün überlebt |
| **8 `dev-user` in Audit-Spalten** | **hier, falls nicht bei 2 protokolliert** | Sie beantwortet U7 und ist nach dem gelöschten Volume nicht mehr beantwortbar |

**Vor dem Abbau laufen genau diese sechs Blöcke:** der Zählungsvergleich (A), die
`api_tokens`-Archivzeile (T), die Retention-Gegenprobe (R), die Zeitstempel-Grenzprobe (Z), die
Postgres-Zählungen (P1–P5) und die **Archivprobe** (5.2.4). Jeder Block sagt: Erwartung · was eine
Abweichung bedeutet · **blockiert den Abbau** oder **nur Protokoll**.

Alle SQLite-Abfragen laufen gegen die **Snapshot-Kopie**, niemals gegen einen gebooteten Alt-Stack
(Spec 1 §9.3.4 Zeile 2). Der Grund steht oben: der Start selbst löscht.

### 5.2.2 radio-admin: die Snapshot-Kopie gegen `radio.db`

Voraussetzung: die Snapshot-Kopie existiert und der **echte** Volume-Name steht im Protokoll — er
trägt das Compose-Projektpräfix, ein `-v radio-data:/d` legt ein **neues, leeres** Volume an
(Spec 1 §9.4.1).

> Echter radio-admin-Volumename: ____________________ ·
> Snapshot-Kopie liegt unter: ____________________ · Freeze-Zeitpunkt (ISO, UTC): ____________

**Abfrage A — die Zählungen, paarweise.**

Quelle (sechs Zahlen, gegen die Kopie):

```bash
sqlite3 radio-admin-snapshot.sqlite "
select 'devices',           count(*) from devices
union all select 'software_versions', count(*) from software_versions
union all select 'api_tokens',        count(*) from api_tokens
union all select 'users',             count(*) from users
union all select 'device_events',     count(*) from device_events
union all select 'loans',             count(*) from loans;"
```

Ziel (**fünf** Zahlen, gegen `radio.db`):

```bash
for t in devices software_versions users device_events loans; do
  printf '%s\t' "$t"; sqlite3 "$DATA_DIR/radio.db" "select count(*) from $t;"
done
# zusätzlich, nur fürs Protokoll — Tabelle ohne Quellgegenstück:
sqlite3 "$DATA_DIR/radio.db" "select 'zugangscodes', count(*) from zugangscodes;"
```

⚠️ **Es sind fünf Paare, nicht sechs — und das ist ein aufgelöster Widerspruch, keine Abweichung
von Spec 1.** Spec 1 §9.4.3 schreibt eine Schleife über **sechs** Tabellen gegen `radio.db`, führt
`api_tokens` also im Zielarm. Verbindlich ist Kapitel B: `api_tokens` **existiert im Ziel nicht** —
Entscheidung 13 („`api_tokens` trägt produktiv genau einen Konsumenten (den Alt-Kiosk), der mit dem
Port verschwindet"), Kapitel B Eintrag B16 („`mappeApiToken` **entfällt** (Entscheidung 13: die
Tabelle existiert im Ziel nicht)") und Spec 1 §2.10 Nr. 1 („`api_tokens` — die ganze Tabelle" wandert
nicht). Das Zielschema in Spec 1 §2.5 führt `devices`, `software_versions`, `users`,
`device_events`, `loans`, `zugangscodes` — kein `api_tokens`. Die Sechs-Tabellen-Schleife scheitert
im Zielarm an `no such table: api_tokens`; das ist laut, aber ein verbrannter Schritt im
Abbau-Protokoll.

**Zusage an Kapitel 4 (Abnahme und Verifikation):** der zählende Check nach dem Import ist **fünf
Paare plus eine Archivzeile**, nicht die Sechs-Tabellen-Schleife aus Spec 1 §9.4.3. Wer sie wörtlich
übernimmt, baut einen Schritt, der by construction rot ist.

**Zusage an Kapitel 2 (Import und Generalprobe) — dieselbe Wurzel, andere Stelle:** Spec 1 §9.1
begründet die sechs Zeilenzahlen mit „weil die Tabelle in der **Paritaet** steht". Der Paritätscheck
(`scripts/import/parity.ts`) gehört Kapitel 2, und er wird über **fünf** Tabellen konfiguriert, nicht
sechs — im Zielarm gibt es kein `api_tokens` (Entscheidung 13, Kapitel B Eintrag B16, Spec 1 §2.10
Nr. 1). Was aus `api_tokens` erhalten bleibt, ist die Textausgabe T unten, nicht eine Paritätszeile.

* **Erwartung:** fünf Paare gleich, **paarweise, nicht in der Summe** (Spec 1 §9.4.3).
* **Abweichung bedeutet:** entweder ist der Import unvollständig, oder `DATA_DIR` zeigt woanders hin
  und `radio.db` ist eine frisch angelegte, leere Datei — `openModuleDatabase` legt Verzeichnis und
  Datei bei Bedarf an (`src/core/db/index.ts:12-22`), `/api/health/radio` wäre dagegen **grün**.
* **Folge:** ⛔ **blockiert den Abbau.** Ohne fünf gleiche Paare wird kein Volume gelöscht.
* `zugangscodes` hat kein Quellgegenstück und ist **nur Protokoll** — die Tabelle ist neu (Spec 1
  §2.5.6, Kapitel B Eintrag B6).

**Abfrage T — die `api_tokens`-Archivzeile.** Sie ersetzt die Migration und ist eine ausdrückliche
Zusage von Spec 1 §2.10 Nr. 1 an Spec 2 („vor dem Archivieren des Volumes wandert … als Textausgabe
ins Cutover-Protokoll"):

```bash
sqlite3 -header -column radio-admin-snapshot.sqlite \
  "select id, name, prefix, created_at, last_used_at, revoked_at from api_tokens;"
```

* **Erwartung:** produktiv wenige Zeilen, davon höchstens eine mit `revoked_at IS NULL` — der
  Alt-Kiosk (Betreiberantwort 3: statischer `RADIO_ADMIN_URL` + `RADIO_ADMIN_API_TOKEN`, **kein
  externer Konsument**).
* **Abweichung bedeutet:** mehr als eine lebende Zeile heißt, es gab mehr als einen Konsumenten —
  dann ist Betreiberantwort 3 überholt und **es gibt einen Abnehmer, den niemand angekündigt hat.**
* **Folge:** ⛔ **blockiert den Abbau**, bis geklärt ist, wer die zweite lebende Zeile benutzt hat.
  Der Klartext ist nie gespeichert, eine mitgenommene Zeile wäre nicht einlösbar — die Zeile ist
  also keine Migrationsfrage, sondern eine **Konsumentenfrage**.
* Die Ausgabe geht **wörtlich** ins Protokoll: `last_used_at` ist danach nicht mehr abfragbar.

**Abfrage R — die Retention-Gegenprobe.** Das ist die Stelle, an der der Faktor-1000-Fehler
**nicht** paritätsgrün bleibt (Spec 1 §9.4.3, letzter Absatz).

```bash
# Quelle, Millisekunden. <freeze_iso> ist der protokollierte Freeze-Zeitpunkt,
# NICHT 'now': 'now' wandert zwischen Import und Abbau und liefert zwei Zahlen,
# die sich nicht vergleichen lassen.
sqlite3 radio-admin-snapshot.sqlite "
select count(*) from loans
 where returned_at is not null
   and returned_at < (strftime('%s','<freeze_iso>','-2 months') * 1000);"

# Ziel, Sekunden — derselbe Cutoff, ohne Faktor.
sqlite3 "$DATA_DIR/radio.db" "
select count(*) from loans
 where returned_at is not null
   and returned_at < strftime('%s','<freeze_iso>','-2 months');"
```

* ⚠️ **Der Faktor 1000 steht im Quellarm absichtlich im SQL** und **nicht** im Zielarm. Wer ihn im
  Quellarm weglässt, zählt **alle** zurückgegebenen Leihen und hält das für eine bestätigte
  Schätzung. Wer ihn im Zielarm hinzufügt, zählt null und hält das für „nichts betroffen".
* **Erwartung:** beide Zahlen gleich. Diese Zahl ersetzt die Betreiber-Schätzung „< 100"
  (Betreiberantwort 4, `docs/radio-portierung-analyse.md:1774`) durch eine **Zählung** — die
  Schätzung ist keine Zählung und war nie eine.
* **Abweichung bedeutet:** Zielarm deutlich **höher** als Quellarm → der Faktor-1000-Fehler hat
  zugeschlagen, die Zeitstempel liegen im Jahr 1970 und der **nächste Retention-Lauf löscht die
  komplette abgeschlossene Leihhistorie**. Zielarm **niedriger** → der Import hat Zeilen verloren,
  die Abfrage A aber nicht gesehen hat (weil A nur zählt, nicht datiert).
* **Folge:** ⛔ **blockiert den Abbau** und, wenn sie vor dem Erstlauf der Retention auffällt,
  **auch den Weiterbetrieb**: `RADIO_HISTORIE_PURGE=0` setzen (Kapitel B Eintrag B5: „Der Abschalter
  ist `RADIO_HISTORIE_PURGE=0`, laut bei jedem Start"), dann neu importieren.

> Abfrage R — Quelle: ________ · Ziel: ________ · gleich? ☐ ja ☐ nein · geprüft am ____________

**Abfrage Z — die Zeitstempel-Grenzprobe.** Billiger als R und findet denselben Fehler, ohne einen
Cutoff zu brauchen:

```bash
sqlite3 "$DATA_DIR/radio.db" "
select 'loans.returned_at 1970', count(*) from loans
   where returned_at is not null and returned_at < 946684800
union all
select 'loans.borrowed_at 1970',  count(*) from loans
   where borrowed_at  < 946684800
union all
select 'devices.created_at 1970', count(*) from devices
   where created_at   < 946684800;"
```

* `946684800` = 2000-01-01T00:00:00Z. **Alle drei Zahlen MÜSSEN 0 sein.**
* **Abweichung bedeutet:** genau der Faktor-1000-Fehler, und sie sagt zusätzlich, **welche Spalte**
  betroffen ist — der Mapper hat je Feld eine eigene Zeile (Spec 1 §2.2.4).
* **Folge:** ⛔ **blockiert den Abbau.**

**Abfrage 8 — `dev-user`, falls nicht bei 2 protokolliert** (Falle 15, beantwortet U7):

```bash
sqlite3 radio-admin-snapshot.sqlite "select sub from users;"
sqlite3 radio-admin-snapshot.sqlite "select distinct created_by from devices;"
```

* **Abweichung bedeutet:** ein `dev-user` unter den Audit-Spalten heißt, `AUTH_DEV_BYPASS` war
  irgendwann aktiv, und die Zuordnung von Journalzeilen zu Personen ist an diesen Stellen keine.
* **Folge:** **nur Protokoll** — aber nach dem gelöschten Volume ist die Frage nicht mehr
  stellbar. Deshalb steht sie hier und nicht „irgendwann".

### 5.2.3 radio-inventar: der Postgres, bevor er stirbt

⚠️ **Zwei Zugangswerte sind Vorbelegungen, keine Tatsachen** — beide vor dem ersten Befehl ablesen
und ins Protokoll schreiben (Spec 1 §9.4.2). `POSTGRES_USER` trägt nur `${POSTGRES_USER:-radio}`
(`radio-inventar/docker-compose.yml:7`), der Volumename bekommt das Projektpräfix
(`postgres_data`, `:12`). Hart gesetzt ist nur `POSTGRES_DB: radio_inventar` (`:10`).

```bash
docker compose -f radio-inventar/docker-compose.yml exec -T postgres printenv POSTGRES_USER
docker volume ls | grep -i postgres_data
```

> Echter POSTGRES_USER: ____________ · echter Volumename: ____________________

⚠️ **Die Anführungszeichen sind tragend.** Prisma legt die Tabellen in gemischter
Groß-/Kleinschreibung an; Postgres braucht dafür doppelte Anführungszeichen im SQL. Deshalb steht
das SQL in **einfachen** Anführungszeichen — ein `-c "…"` mit doppelten außen zerstört die inneren,
und die Abfrage scheitert an einer nicht existierenden Relation `adminuser`.

```bash
PG="docker compose -f radio-inventar/docker-compose.yml exec -T postgres \
    psql -U <echter POSTGRES_USER> -d radio_inventar -c"
```

**P1 — Grundwahrheit statt Ableitung: welche Tabellen existieren wirklich?**

```bash
$PG 'select tablename from pg_tables where schemaname = '"'"'public'"'"' order by 1;'
```

* **Erwartung (abgeleitet, nicht gezählt):** `AdminUser`, `_prisma_migrations`, evtl. `session`
  (`docs/radio-portierung-analyse.md:2048-2052`). ⚠️ Der Tabellenbestand war bisher aus fünf
  Migrationsdateien plus einer handgepflegten `create-session-table.sql` **abgeleitet**; aus einem
  Repository lässt sich der Prod-Tabellenbestand grundsätzlich nicht ableiten (Spec 1 §2.10 Nr. 3).
* **Abweichung bedeutet:** liefert `pg_tables` **mehr**, liegt dort Bestand, den niemand eingeplant
  hat. Jede zusätzliche Tabelle ist per `select count(*)` zu zählen.
* **Folge:** ⛔ **blockiert den Abbau**, bis jede zusätzliche Tabelle gezählt und die Abbauliste
  (5.3) um sie erweitert ist.

**P2 — liegt noch Bestand? `Loan` und `Device`.**

```bash
$PG 'select to_regclass('"'"'public."Loan"'"'"') as loan,
            to_regclass('"'"'public."Device"'"'"') as device;'
$PG 'select count(*) from "_prisma_migrations" where finished_at is not null;'
```

* **Erwartung:** `NULL, NULL` und **5** abgeschlossene Migrationen.
* **Abweichung bedeutet:** ein **Nicht-NULL** heißt, die Drop-Migrationen sind in Prod nie gelaufen
  — dann liegt im Kiosk-Postgres Geräte- und Leihbestand, den die Import-Spec nicht kennt, und sie
  braucht einen zweiten Zweig. Eine Zahl **unter 5** heißt, Prod hängt hinter dem eingefrorenen
  Stand `f883ec4`; dann ist jede `datei:zeile`-Aussage über den Kiosk unsicher.
* **Folge:** ⛔ **blockiert den Abbau, hart.** Bei Nicht-NULL wird kein Volume angefasst, sondern
  Kapitel 2 (Import) wieder aufgemacht. Das ist der Fall, in dem der Abbau am Standby-Ende
  **abgesagt** und nicht verschoben wird.

**P3 — `AdminUser`: wandert nicht, wird aber gezählt.**

```bash
$PG 'select count(*) from "AdminUser";'
$PG 'select username, "createdAt", "updatedAt" from "AdminUser";'
```

* Die Zeile „`AdminUser` wandert **nicht**" (Entscheidung 14) ist eine **Entscheidung, keine
  Messung**; diese Zählung dokumentiert, **was verworfen wird**. Der Beleg für die Entscheidung ist
  `radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`: im
  Pocket-ID-Betrieb baut der OIDC-Weg die Kennung synthetisch als `` `pocketid:${userInfo.sub}` ``
  und schreibt gar nicht in die Tabelle. Die Suite führt den **rohen** `sub`.
* **Erwartung:** `0`.
* **Abweichung bedeutet:** ein Ergebnis **> 0** heißt, es gab lokale Passwort-Identitäten, und ihr
  Verlust ist **vor** dem Löschen des Volumes ausdrücklich zur Kenntnis zu nehmen — nicht danach zu
  entdecken. `updatedAt > createdAt` beantwortet ohne Konfigurationszugriff, ob die Zugangsdaten je
  geändert wurden, also ob der Nutzer in Benutzung war
  (`docs/radio-portierung-analyse.md:2056-2059`).
* **Folge:** ⛔ **blockiert den Abbau**, bis die betroffene Person namentlich benannt und
  benachrichtigt ist. Die **Entscheidung** kippt dadurch nicht — der Port streicht den lokalen
  Passwort-Login ersatzlos —, aber sie wird dann angekündigt statt bemerkt.

**P4 — existiert `session` überhaupt, und liegen dort Zeilen?**

```bash
$PG 'select count(*) from "session";'
$PG 'select count(*) from "session" where expire > now();'
$PG 'select sess from "session" where expire > now() limit 5;'
```

* **Erwartung:** die Tabelle existiert **nicht** (Fehler `relation "session" does not exist`) —
  `prisma/create-session-table.sql` wird von nichts ausgeführt (Spec 1 §2.10 Nr. 3).
* **Abweichung bedeutet:** existiert sie doch, zeigt `sess`, ob dort `provider: 'local'` oder
  `'pocketid'` steht (`docs/radio-portierung-analyse.md:2060-2064`). Ein `'local'` mit **lebenden**
  Sitzungen heißt: jemand arbeitet **heute** mit einem Passwort-Login, den der Port ersatzlos
  streicht.
* **Folge:** ⛔ **blockiert den Abbau** — und es ist eine Ankündigung an eine namentlich bekannte
  Person, kein technischer Posten.

**P5 — Zeilenzahlen aller Tabellen auf einen Blick, fürs Protokoll.**

```bash
$PG 'select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc;'
```

* **Folge:** **nur Protokoll**, aber vollständig — es ist die letzte Aufnahme dieses Bestands.

**P6 — der Archiv-Dump. Erst danach darf das Volume fallen.**

```bash
docker compose -f radio-inventar/docker-compose.yml exec -T postgres \
  pg_dump -U <echter POSTGRES_USER> -d radio_inventar --format=custom \
  > radio-inventar-final-$(date +%Y%m%dT%H%M%S).dump
```

⚠️ Der Kiosk-Postgres fiel aus jeder Sicherung, die dieses Repo kennt, **automatisch heraus**:
`scripts/backup.sh` kennt nur `"$DATA_DIR"/*.db` (`:25-27`) und `BLOB_DIR` (`:19-21`). **Dieser
`pg_dump` ist die einzige Sicherung, die dieses Volume je hatte** (Spec 1 §9.5.3).

### 5.2.4 Die Archivprobe: beide Archivdateien werden geöffnet

⚠️ **Der Schritt, den Spec 1 nicht führt, und der die Lücke schließt.** §9.4.1 verlangt die
Snapshot-Kopie, §9.4.2 Nr. 6 den `pg_dump` — **kein Schritt öffnet je eine der beiden Dateien.**
Ohne diesen Block ruht die einzige unumkehrbare Handlung dieses Cutovers auf zwei Dateien, die
niemand gelesen hat. Der Präzedenzfall steht im Haus: `docs/runbooks/files-cutover.md:368` (§H
Punkt 5) — „Ein Backup-Tarball wurde **geöffnet** und enthielt `files.db` **und** Blobs."

```bash
# (a) Die SQLite-Snapshot-Kopie: Tabellen vorhanden, Zahlen gleich der Freeze-Aufnahme.
sqlite3 radio-admin-snapshot.sqlite '.tables'
#   MUSS alle sechs führen: devices, device_events, software_versions,
#   users, loans, api_tokens. Fehlt eine, ist die Kopie vorbaselinig —
#   dasselbe Bild wie radio-admin/data/data.sqlite im Repo
#   (docs/radio-portierung-analyse.md:1865-1872), und die Kopie ist wertlos.
sqlite3 radio-admin-snapshot.sqlite 'pragma integrity_check;'
#   MUSS 'ok' liefern.

# (b) Der Postgres-Dump: lesbar und nicht leer. pg_restore liegt im Alt-Image.
docker run --rm -v "$PWD":/a postgres:16-alpine \
  pg_restore --list /a/radio-inventar-final-<stamp>.dump | head -30
#   Das Image ist radio-inventar/docker-compose.yml:4 entnommen.
#   Erwartet: eine Objektliste mit "AdminUser" und "_prisma_migrations".
#   Ein leerer oder abgebrochener Kopf heisst: der Dump ist unbrauchbar,
#   und er ist die EINZIGE Sicherung dieses Volumes.
```

* **Folge:** ⛔ **beide blockieren den Abbau.** Die Zahlen aus (a) gehören neben die
  Freeze-Aufnahme ins Protokoll; ein Unterschied heißt, in das Volume wurde nach dem Freeze
  geschrieben — dann war der Freeze keiner.
* ⚠️ **Und die Archivdateien liegen nicht auf demselben Server wie die Suite** (Spec 1 §9.5.1,
  Zeile „Snapshot-Kopie"). Ein Archiv auf dem Rechner, dessen Ausfall es abdecken soll, ist kein
  Archiv. Ablageort ins Protokoll: ____________________

---

## 5.3 Die Abbauliste

Jede Zeile einzeln abhaken, und keine, bevor ihre Bedingung grün protokolliert ist.

> ⛔ **Kein Häkchen in dieser Liste, solange ein Block aus 5.2 offen oder rot ist.** Die
> Abbau-Sperren sind: A, T, R, Z, P1, P2, P3, P4 und beide Archivproben aus 5.2.4.

| # | Posten | Frist | Bedingung |
|---|---|---|---|
| 1 | **Traefik-Anbindung radio-inventar** (der Router auf `radio.iuk-ue.de`) | **sofort** beim Umschwenk | Muss weg, sonst halten **zwei** Router denselben Host (`CLAUDE.md:239`). Das ist kein Abbau-, sondern ein Cutover-Schritt und steht hier nur der Vollständigkeit halber — **Zusage an Kapitel 3 (das Fenster)**: dort gehört er hin |
| 2 | **Container `radio-inventar-backend`** (Image `ghcr.io/rubenvitt/radio-inventar/radio-inventar-backend`, `radio-inventar/docker-compose.yml:28`) | Standby **14 Tage** | Gestoppt, Image behalten. Er ist bis Stunde 1 der Rückweg für `radio.iuk-ue.de` (Spec 1 §9.3.3) |
| 3 | **Container `radio-inventar-db` + Volume `postgres_data`** (⚠️ **deklarierter** Name, `:12`; der echte trägt das Projektpräfix) | Standby **14 Tage** | Gestoppt, Volume erhalten — der Backend hängt per `depends_on: condition: service_healthy` daran (`:42-44`), ein Rollback ohne ihn startet nicht. Abbau **erst** nach P6 **und erst**, wenn P1–P5 protokolliert sind |
| 4 | **Container `app` des radio-admin-Stacks** (Image `radio-admin:local`) | Standby **14 Tage** | Gestoppt. ⚠️ **Nicht starten** — 5.5 |
| 5 | **Volume `radio-data` von radio-admin** (⚠️ **deklarierter** Name; der echte trägt das Projektpräfix) | Standby **14 Tage** | Einzige Quelle für Re-Import und feldweise Nachprüfung. Abbau erst, wenn A, T, R, Z und die Archivprobe (a) grün sind |
| 6 | **Images** `radio-admin:local` und `ghcr.io/rubenvitt/radio-inventar/radio-inventar-backend` | Standby **14 Tage** | Ohne Image ist der Rollback kein Handgriff, sondern ein Build |
| 7 | **Alte `.env`-Dateien beider Stacks** | **sofort** nach dem Standby-Ende, mit dem Volume | 5.4 — der Posten, der liegen bleibt |
| 8 | **DNS `radio.iuk-ue.de`** | **bleibt**, unverändert | Zeigt vor und nach dem Cutover auf denselben Edge; nichts zu tun. Genau das ist der Grund, warum es kein Parallelfenster gibt |
| 9 | **DNS `radio-admin.iuk-ue.de`** | **bleibt**, solange der Redirect steht | **Kein** Abbau-Posten (`docs/radio-portierung-analyse.md:1669-1670`) — er ist die Abhängigkeit des Redirects. Ende in 5.6 |
| 10 | **Redirect-Router `radio-admin-alt` + `SUITE_REDIRECT_RULE_RADIO_ADMIN`** | nach der Bedingung aus 5.6 | Vier zusammenhängende Wochen ohne Treffer auf `radio-admin.iuk-ue.de` im Traefik-Zugriffsprotokoll (Spec 1 §9.2.4) |
| 11 | **Snapshot-Kopie + Postgres-Dump** | **Archiv, dauerhaft** | Nicht auf demselben Server wie die Suite. Sie sind der Rest, der die Volumes überlebt |
| 12 | **Repos `radio-admin` und `radio-inventar`** | **archivieren, nicht löschen** | GitHub-Archivierung (read-only) mit den Freeze-SHAs `265abd5` bzw. `f883ec4` im Archivierungshinweis. Sie sind die Belegquelle **jeder** `datei:zeile` aus Spec 1 und Spec 2; ein gelöschtes Repo macht beide Specs unnachprüfbar |
| 13 | **Zwei OIDC-Client-Registrierungen in Pocket ID** | Betreiberentscheidung (U6) | 5.4 |
| 14 | ⬜ **`radio-inventar`-Frontend-Auslieferung** | ⚠️ **unbekannt — siehe 5.3.1** | Solange U4 / C.5 offen ist, ist **diese Liste unvollständig** |

### 5.3.1 ⚠️ Die benannte Lücke: wer liefert das radio-inventar-Frontend aus? (C.5 / U4)

**Diese Liste ist nachweislich unvollständig, und das steht hier als Lücke, nicht als Vermutung.**

Gemessen, zum Zeitpunkt des Schreibens: `radio-inventar/docker-compose.yml` führt **zwei** Services,
`postgres` (`:3`) und `backend` (`:26`, hinter `profiles: ["full-app"]`, `:27`). **Es gibt keinen
Frontend-Service.** Die Datei sagt es in ihrer ersten Zeile selbst:
`# docker-compose.yml (Development + Full-App Profile)` (`:1`). Zweiter Beleg derselben Klasse:
`API_TOKEN` ist Pflichtwert mit mindestens 32 Zeichen und **ohne Default**
(`radio-inventar/apps/backend/src/config/env.config.ts:11`), kommt in der eingecheckten
Compose-Datei aber **nicht vor** — der Env-Block des `backend`-Service (`:33-39`) führt ihn nicht.
Dritter: `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-secret}` (`:9`) mit dem Kommentar „WICHTIG: In
Production POSTGRES_PASSWORD setzen!" (`:8`).

**Schlussfolgerung, belegt:** die eingecheckte Compose-Datei ist **nicht der Produktionsweg**
(`docs/radio-portierung-analyse.md:1880-1886`). Daraus folgt, was hier fehlt:

* ⬜ **zu ergänzen nach der Betreiberauskunft (U4 / C.5):** *welcher Prozess, Container, statische
  Auslieferung oder Reverse-Proxy-Eintrag liefert heute das Kiosk-Frontend unter
  `radio.iuk-ue.de` aus, auf welchem Host, und mit welcher Router-/Server-Konfiguration?* Jede
  gefundene Komponente wird eine eigene Zeile in der Liste oben, mit derselben Standby-Frist wie
  Posten 2 — sie ist Teil des Rückwegs.
* ⬜ **zu ergänzen nach derselben Auskunft:** *wo setzt die Produktion `API_TOKEN`?* Der Handgriff
  in 5.4 lautet deshalb „finden, wo Produktion ihn setzt — dann dort löschen", nicht „aus der
  Compose-Datei entfernen".
* ⬜ **zu ergänzen nach derselben Auskunft:** *gibt es auf Host-Ebene einen Cron, Timer oder
  Backup-Job, der zu einem der beiden Alt-Stacks gehört?* Aus dem eingefrorenen Repo ist das
  **nicht ableitbar** — dieselbe Wurzel wie U4. Siehe 5.5.

⚠️ **Der Abbau ist nicht abgeschlossen, solange diese drei Zeilen leer sind.** „Abgebaut" heißt
sonst „die Teile abgebaut, die im Repo standen" — und die eine Komponente, die den Host bedient
hat, läuft weiter. **Die Auskunft ist vor dem Cutover einzuholen, nicht danach** (Spec 1 §9.5.1,
letzte Zeile). **Zusage an Kapitel 1 (Eingaben):** U4 gehört dort als Eingabe mit Wert, nicht als
Frage.

---

## 5.4 Die Geheimnisse — der Posten, der liegen bleibt

⚠️ **Hier gilt Spec 1 §9.5.2, nicht die Analyse.** `docs/radio-portierung-analyse.md:839-843`
schreibt, die übernommenen Geheimnisse lebten nach dem Cutover „doppelt auf demselben Server". Für
`radio` trifft das **nicht** zu, weil **nichts** wertgleich übernommen wird: es gibt genau **einen**
neuen Wert, `RADIO_AUSLEIH_SITZUNG_SECRET`, **frisch erzeugt** (`openssl rand -base64 32`) und
⚠️ **nicht gleich `AUTH_SECRET`** (Spec 1 §9.1, Zeile „Geheimnisse";
`.env.example:256-257`). Radio invertiert damit das `lagerbuch`-Muster, wo
`HELFER_SESSION_SECRET` wertgleich aus der produktiven `stack.env` übernommen wurde, damit laufende
Sitzungen den Cutover überleben (`docs/runbooks/lagerbuch-cutover.md:413`).

**Der Befund wird dadurch nicht schwächer, sondern stärker:** die alten Werte bleiben **gültig** in
Dateien, die niemand mehr pflegt und die kein Repo kennt. Ein verwaister, aber funktionierender
Vollzugriffs-Token braucht kein Duplikat, um gefährlich zu sein. Deshalb steht das Löschen als
**Zeile**, nicht als Absicht — die Lehre aus `lagerbuch`, wo die Abbau-Zeile „alte `stack.env`
löschen" ausgeschrieben in der Übergabe stand (`docs/runbooks/lagerbuch-cutover.md:413`).

**Zu löschen, namentlich** (aus `radio-admin/.env.example`; für radio-inventar nachgeschlagen zum
Zeitpunkt des Schreibens: `apps/backend/src/config/env.config.ts:11` führt `API_TOKEN` als
**Pflichtwert ohne Default** mit `min(32)`, `:12-15` die vier `POCKET_ID_*` als
`optional().default('')`, und `SESSION_SECRET` kommt aus `radio-inventar/docker-compose.yml:37` mit
der Vorbelegung `change-me-in-production`):

| Datei / Ort | Werte |
|---|---|
| radio-admin `.env` | `SESSION_SECRET` · `OIDC_CLIENT_ID` · `OIDC_CLIENT_SECRET` · `OIDC_ISSUER` · `OIDC_REDIRECT_URI` · `OIDC_ADMIN_GROUP` · `OIDC_UPDATER_GROUP` · `LOAN_API_EXPECTED_AUDIENCE` · `LOAN_API_EXPECTED_SUBJECT` · `AUTH_DEV_BYPASS` / `DEV_USER_*` |
| radio-inventar Produktionsumgebung | `API_TOKEN` (der geteilte Kiosk-Token) · `SESSION_SECRET` · `POSTGRES_PASSWORD` · `POCKET_ID_CLIENT_SECRET` und die drei übrigen `POCKET_ID_*` |

- [ ] radio-admin `.env` gelöscht, mit dem Volume (Posten 7) — am ____________
- [ ] ⚠️ **`API_TOKEN` — eigene Zeile.** Er ist Pflichtwert (`env.config.ts:11`), steht aber
      **nicht** in der eingecheckten Compose-Datei. Der Handgriff lautet **„finden, wo Produktion
      ihn setzt — dann dort löschen"**, nicht „aus der Compose-Datei entfernen". Solange er
      irgendwo lebt, lebt ein Vollzugriff auf den alten Bestand. Fundort: ____________________
- [ ] `SESSION_SECRET` gelöscht — ⚠️ und geprüft, ob Produktion je die Vorbelegung
      `change-me-in-production` benutzt hat (`radio-inventar/docker-compose.yml:37`)
- [ ] `POSTGRES_PASSWORD` gelöscht — ⚠️ und geprüft, ob Produktion je die Vorbelegung `secret`
      benutzt hat (`radio-inventar/docker-compose.yml:9`). Wenn ja, ist es kein Geheimnis, sondern
      war nie eines; die Zeile bleibt trotzdem
- [ ] ⚠️ **Die zwei OIDC-Client-Registrierungen in Pocket ID** (Posten 13, U6). radio-admin ist ein
      eigener Client (`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`,
      `radio-admin/server/src/auth/auth-service.ts:26-48`), radio-inventar ein zweiter
      (`POCKET_ID_CLIENT_ID`/`POCKET_ID_CLIENT_SECRET`). Beide tragen lebende Secrets und
      `redirect_uri`s auf Hosts, die verschwinden. Ob sie gelöscht oder aufbewahrt werden,
      entscheidet der Betreiber — **die Zeile muss existieren**, sonst bleiben zwei gültige Clients
      mit toten Rückadressen stehen. Entscheidung: ☐ gelöscht ☐ aufbewahrt, begründet: __________

⚠️ **Reihenfolge:** die `.env`-Dateien fallen **mit** dem Volume, nicht davor. Solange ein
Standby-Rückweg existiert (bis Stunde 1) bzw. ein Re-Import denkbar ist (14 Tage), braucht der Stack
seine Konfiguration. Eine früh gelöschte `.env` macht den Rückweg zu einem Ratespiel.

---

## 5.5 Der alte Purge ist **kein Cron** — und deshalb lautet die Zeile anders

Bei `files` war „**den alten Cleanup-Cron abschalten**" ein eigener Abbau-Punkt, weil er sonst „ins
Leere oder, schlimmer, in ein wiederverwendetes Verzeichnis" löscht
(`docs/runbooks/files-cutover.md:309-310`). Der Punkt gilt hier auch — **aber nicht in dieser
Form**, und ihn falsch zu übernehmen sucht etwas, was es nicht gibt.

**Gemessen: in radio-admin gibt es keinen externen Cron.** Der Purge fährt **im Anwendungsprozess**
mit: `radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`,
`radio-admin/server/src/services/retentionService.ts:47` führt `purge()` **sofort** aus, erst `:48`
setzt den Tagestimer. Es gibt also nichts abzuschalten — es gibt etwas **nicht zu starten**.

**Die Zeile lautet:**

- [ ] Der radio-admin-Stack wird im Standby **nicht gestartet.** Muss er doch (Rollback,
      Oberflächenvergleich), gilt **vorher** als nachgewiesen erfüllt: `HISTORY_RETENTION_MONTHS` in
      der Standby-Umgebung neutralisiert **oder** das Volume kopiert (Spec 1 §9.3.4 Zeile 1).
      Nachgewiesen am ____________ durch ____________________
- [ ] Jede feldweise Nachprüfung läuft per `sqlite3` gegen die **Snapshot-Kopie**, nie gegen einen
      gebooteten Alt-Stack (Spec 1 §9.3.4 Zeile 2)

*Kein Gate:* ein Start ist ein **erfolgreicher** Start mit einer Protokollzeile
(`retentionService.ts:41`, `[retention] purged N expired loan(s)`) — kein Fehler, kein roter Test,
kein Healthcheck. Wer den Stack in Woche zwei hochfährt, um gegen die Historie zu prüfen, verliert
zwei weitere Wochen genau dieser Historie.

**Für radio-inventar bleibt die Frage offen:**

* ⬜ **zu ergänzen nach der Betreiberauskunft (U4, siehe 5.3.1):** *gibt es auf Host-Ebene einen
  Cron, systemd-Timer oder Backup-Job, der zu radio-inventar oder radio-admin gehört?* Aus dem
  eingefrorenen Repo ist das nicht ableitbar — die eingecheckte Compose-Datei ist nicht der
  Produktionsweg, und ein Host-Cron erscheint darin ohnehin nie. **Hier wird nichts erfunden**: ein
  behaupteter Cron, den es nicht gibt, macht aus einem Abbau-Schritt eine Suche ohne Ende, und ein
  verschwiegener, den es gibt, schreibt nach dem Abbau in ein wiederverwendetes Verzeichnis.

---

## 5.6 Der Redirect und sein Ende — die einzige Frist mit Bedingung statt Datum

Der Redirect vom Alt-Verwaltungshost (`radio-admin.iuk-ue.de` → 302 auf `radio.iuk-ue.de/admin`,
pfaderhaltend) hat **kein Ablaufdatum, sondern eine Bedingung** (Spec 1 §9.2.4):

* Er steht **mindestens** bis zum Ende des Standby-Fensters (5.1).
* Er fällt, sobald im Traefik-Zugriffsprotokoll über **vier zusammenhängende Wochen** kein Treffer
  mehr auf `radio-admin.iuk-ue.de` erscheint. Ohne benannte Bedingung lebt ein Redirect für immer,
  und mit ihm ein DNS-Eintrag, den niemand mehr erklären kann.

**Der Abbau ist drei Zeilen, in dieser Reihenfolge** — der DNS-Eintrag fällt **zuletzt**, weil er
die Abhängigkeit des Redirects ist:

- [ ] 1. Die sechs `radio-admin-alt`-Labels aus `compose.yaml` entfernen, `docker compose up -d`
- [ ] 2. `SUITE_REDIRECT_RULE_RADIO_ADMIN` aus der `.env` auf dem Server entfernen
- [ ] 3. DNS-Eintrag `radio-admin.iuk-ue.de` löschen

> Vier-Wochen-Fenster ohne Treffer: von ____________ bis ____________ · Protokollquelle:
> ____________________ · Redirect abgebaut am ____________

⚠️ **Was hier nicht abgebaut wird:** `radio.iuk-ue.de` bleibt in `SUITE_TRAEFIK_RULE` und
`SUITE_HOST_RADIO` bleibt gesetzt — das ist ab dem Umschwenk der produktive Zustand, kein
Übergangsposten. **Und `radio-admin.iuk-ue.de` gehört zu keinem Zeitpunkt in
`SUITE_TRAEFIK_RULE`** (Spec 1 §9.2.1): dort aufgenommen bekäme der Host nicht den Redirect, sondern
den stillen Portal-Fallback — `const mod = moduleForHost(host) ?? getModule("portal")`
(`src/core/routing.ts:69`), Kommentar zum Fehlfall in `src/core/hosts.ts:52-57`. Ein funktionierender
Ausdruck mit falschem Inhalt, und **kein Test des Repos sieht Traefik-Labels an.**

---

## 5.7 Was der Abbau ausdrücklich nicht anfasst

* **`scripts/backup.sh` braucht keine Änderung.** Es sammelt `"$DATA_DIR"/*.db` per nullglob
  (`:25-27`) und sichert jede Datei per `sqlite3 .backup` (`:41-43`) — `radio.db` fällt automatisch
  hinein (Spec 1 §9.1, Zeile „Modul-Key"). Es gibt hier **keinen** Abbau-Handgriff, und das ist der
  Vorteil der Ein-Datei-je-Modul-Regel.
* **Der Monitor auf `/api/health/radio`** bleibt — er ist ab dem Umschwenk der produktive Posten.
  ⚠️ **Nie `/api/health`**: der Pfad liefert konstant `{status:"ok"}` ohne Modul und ohne Datenbank
  (`src/app/api/health/route.ts`), und er antwortet nach dem Cutover auf `radio.iuk-ue.de` weiter
  `ok`, **ohne etwas über radio zu sagen**. Das Umstellen von Monitor und `docs/deployment.md`
  gehört ins Cutover-Fenster (**Zusage an Kapitel 3**), nicht in den Abbau.
* **`SUITE_ADMIN_GROUP_RADIO`** bleibt gesetzt und nicht leer. Eine leere Liste gewährt **nichts**,
  und weil `radio` den `isModuleAdmin`-Kurzschluss modulintern ignoriert (Entscheidung 9), fängt der
  Suite-Admin niemanden auf: die Folge ist ein **stummes 404 für jede Verwaltungsseite**
  (Spec 1 §9.1). Das ist keine Abbau-Zeile, aber es ist die Zeile, die beim Aufräumen am ehesten
  versehentlich geleert wird.
* **Der Abräum-Service-Worker unter `/sw.js`** bleibt. Er gehört in den **ersten Deploy**, nicht in
  den Cutover (Spec 1 §7.1.3) — und er bleibt danach stehen: der Origin ist zeichengleich, und ein
  Gerät, das den Alt-Kiosk installiert hat und erst in sechs Monaten wieder aufgeschlagen wird,
  braucht ihn dann noch. **Er ist kein Abbau-Posten** und hat kein Ablaufdatum, das dieses Kapitel
  setzen könnte.

---

## 5.8 Wann Standby und Abbau erfüllt sind

Nach dem Muster von `docs/runbooks/files-cutover.md:360-370` (§H). **Jeder Punkt mit Ausgabe, nicht
mit Erwartung** — eine abgehakte Zeile ohne protokollierte Zahl ist keine abgehakte Zeile.

- [ ] 1. **Das Standby-Ende steht als Datum und mit Namen** im Protokoll (5.1.1), nicht als „zwei
      Wochen": ____________ / ____________________
- [ ] 2. **Fünf Paare gleich** (Abfrage A), paarweise protokolliert, nicht in der Summe. Und die
      Sechs-Tabellen-Schleife aus Spec 1 §9.4.3 wurde **nicht** benutzt — `api_tokens` existiert im
      Ziel nicht (Entscheidung 13, Kapitel B / B16, Spec 1 §2.10 Nr. 1)
- [ ] 3. **Die `api_tokens`-Textausgabe steht wörtlich im Protokoll** (Abfrage T), und es war
      höchstens **eine** lebende Zeile
- [ ] 4. **Retention-Gegenprobe grün** (Abfrage R): beide Zahlen gleich, und sie ersetzt die
      Betreiber-Schätzung „< 100" durch eine **Zählung**: ________
- [ ] 5. **Zeitstempel-Grenzprobe grün** (Abfrage Z): alle drei Zahlen `0`
- [ ] 6. **Postgres vollständig aufgenommen**: P1 (`pg_tables`, jede unerwartete Tabelle gezählt) ·
      P2 (`Loan`/`Device` **NULL, NULL** und **5** abgeschlossene Migrationen) · P3
      (`count(*) from "AdminUser"` = ________) · P4 (`session`) · P5 (`pg_stat_user_tables`) —
      **alle fünf als Ausgabe**
- [ ] 7. **P6 gelaufen**: der `pg_dump` existiert — die **einzige** Sicherung, die dieses Volume je
      hatte (`scripts/backup.sh:19-21`, `:25-27` kennen ihn nicht)
- [ ] 8. **Beide Archivdateien wurden geöffnet** (5.2.4): `.tables` zeigt alle sechs Tabellen,
      `pragma integrity_check` = `ok`, `pg_restore --list` liefert eine Objektliste — und die
      Archivdateien liegen **nicht** auf dem Suite-Server: ____________________
- [ ] 9. **Der radio-admin-Stack wurde im Standby nie gestartet** — oder jeder Start ist mit dem
      Nachweis aus 5.5 protokolliert
- [ ] 10. **Beide Alt-Stacks abgebaut**: Container, Volumes, Images, Router-Regeln (Posten 2–6)
- [ ] 11. **Die Geheimnisse sind gelöscht** (5.4), `API_TOKEN` mit **Fundort**, und die
      Pocket-ID-Entscheidung (U6) ist getroffen und begründet
- [ ] 12. **Beide Repos sind archiviert, nicht gelöscht**, mit den Freeze-SHAs `265abd5`
      (radio-admin) und `f883ec4` (radio-inventar) im Archivierungshinweis
- [ ] 13. ⛔ **U4 / C.5 ist beantwortet** und jede gefundene Frontend-Komponente steht als eigene
      Zeile in 5.3 — **solange diese Zeile offen ist, darf Punkt 10 nicht als „radio-inventar
      vollständig abgebaut" gelesen werden**, sondern nur als „die Teile, die im Repo standen"
- [ ] 14. **Der Redirect ist entweder abgebaut** (5.6, drei Zeilen in der Reihenfolge Labels → `.env`
      → DNS) **oder seine Bedingung läuft nachweislich weiter**: Vier-Wochen-Fenster begonnen am
      ____________, Protokollquelle ____________________
- [ ] 15. **`radio-admin.iuk-ue.de` steht in `SUITE_TRAEFIK_RULE` nicht** — geprüft mit
      `docker compose config | grep -A2 radio-admin-alt`, Ausgabe im Protokoll

⚠️ **Punkt 13 ist der einzige Punkt dieser Liste, den kein Befehl beantwortet.** Alle anderen haben
eine Ausgabe. Diese eine ist eine Auskunft, und sie ist **vor** dem Cutover einzuholen — nach dem
Abbau ist sie nur noch durch Ausprobieren zu beantworten, und das Ausprobieren heißt dann: „was ist
kaputtgegangen?"

---

## 5.9 Zusagen an andere Kapitel — gesammelt

| An | Zusage |
|---|---|
| **Kapitel 1 (Eingaben)** | **U4 / C.5** (wo läuft das radio-inventar-Frontend produktiv, woher kommt `API_TOKEN`, gibt es einen Host-Cron?) gehört dort als **Eingabe mit Wert**, nicht als Frage. Ebenso **U6** (Pocket-ID-Clients) und **U7** (`AUTH_DEV_BYPASS`) |
| **Kapitel 2 (Import und Generalprobe)** | Die Invarianten 1–6 aus Spec 1 §9.4.1 laufen **dort**, vor dem Import, nicht hier. Dieses Kapitel wiederholt sie nicht. Umgekehrt gehören die **Volumengröße** und die **Dump-Dauer** beider Stacks (U8) in die **Generalprobe** — sie bemessen das Cutover-Fenster, und am Cutover-Abend sind sie zu spät |
| **Kapitel 3 (das Fenster)** | Der Traefik-Router von radio-inventar fällt **beim Umschwenk** (Posten 1), nicht im Abbau — sonst halten zwei Router denselben Host. Ebenso dort: die Umstellung von Monitor und `docs/deployment.md` auf `/api/health/radio` |
| **Kapitel 4 (Abnahme und Verifikation)** | (a) Der zählende Check ist **fünf Paare plus eine Archivzeile**, nicht die Sechs-Tabellen-Schleife aus Spec 1 §9.4.3 — `api_tokens` existiert im Ziel nicht. (b) **Retention-Gegenprobe (R) und Zeitstempel-Grenzprobe (Z) werden einmal ermittelt und zweimal gelesen**: dort als Freigabe, hier als Abbau-Sperre; dieselbe Protokollzeile. (c) Ist R nicht grün protokolliert, **beginnt das Standby-Fenster nicht** |

---

## 5.10 Offene Punkte dieses Kapitels

Alle sind Betreiberauskünfte oder Messungen am Prod-Bestand. **Keiner ist ein Platzhalter für eine
Entscheidung, die dieses Kapitel hätte treffen können.**

| # | Offen | Wer beantwortet | Blockiert |
|---|---|---|---|
| U4 | Wo läuft das radio-inventar-Frontend produktiv, und woher kommt `API_TOKEN`? | Betreiber | **Vollständigkeit der Abbauliste (5.3) und der Löschliste (5.4)** — Erfüllungspunkt 13 |
| U4b | Gibt es auf Host-Ebene einen Cron/Timer/Backup-Job zu einem der Alt-Stacks? | Betreiber, gleiche Wurzel wie U4 | 5.5 |
| U6 | Werden die zwei Pocket-ID-Clients gelöscht oder aufbewahrt? | Betreiber | 5.4, Posten 13 |
| U7 | Lief `radio-admin` in Prod je mit `AUTH_DEV_BYPASS`? | Abfrage 8 in 5.2.2 | Lesbarkeit der Audit-Spalten; nach dem Volume nicht mehr beantwortbar |
| U8 | Volumengröße und Dump-Dauer beider Stacks | Messung bei der Generalprobe (Kapitel 2) | Bemessung des Fensters, nicht des Abbaus |
| — | Enddatum des Standby-Fensters und die Person, die den Abbau auslöst | Betrieb, am Cutover-Abend festzulegen | Erfüllungspunkt 1 |
