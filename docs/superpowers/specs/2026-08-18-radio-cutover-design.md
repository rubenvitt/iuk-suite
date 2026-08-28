# Spec 2 — Import, Generalprobe, Cutover und Abbau des Moduls `radio`

**Stand 2026-08-18.** Das ist die zweite von zwei Specs zum Modul `radio`. Spec 1
(`docs/superpowers/specs/2026-08-17-radio-modul-design.md`, Stand `1450588`) entwirft **das Modul**;
diese Spec entwirft **den Weg der Daten und den Weg des Routers** — das Import-Skript, die Prüfungen
davor, die Generalprobe, das Cutover-Fenster und den Abbau der zwei Alt-Anwendungen. Gattung und
Vorbild sind `docs/runbooks/files-cutover.md` und `docs/runbooks/lagerbuch-cutover.md`; aus dieser
Spec entsteht `docs/runbooks/radio-cutover.md`.

**Grundlage, mit Stand:**

| Quelle | Stand | Was daraus verbindlich ist |
|---|---|---|
| `docs/superpowers/specs/2026-08-17-radio-modul-design.md` | `1450588` | **Kapitel A** (15 gesetzte Entscheidungen) · **Kapitel B** (B1–B19, entschiedene Widersprüche — was dort steht, gilt, auch wenn ein Kapiteltext abweicht) · **Kapitel C** (was offen ist) · **Kapitel 9** (die Übergabeliste an diese Spec) |
| `docs/radio-portierung-analyse.md` | `c47857a` | Kapitel 4 (die 1:1-Pflichten) und Kapitel 5 (die Fallen) |
| `iuk-suite/CLAUDE.md`, Abschnitt „Cutover einer Alt-Anwendung" | Arbeitsstand | Das Muster: Generalprobe → Freeze → Snapshot → Volume sichern → Import mit Paritätscheck → Verifikation gegen einen ephemeren Container ohne Traefik-Labels → Router umschwenken → Standby |

**Die Freeze-SHAs der zwei Alt-Repos** (sie sind die Belegquelle **jeder** `datei:zeile`-Angabe über
die Alt-Anwendungen in Spec 1 und Spec 2; die Repos werden **archiviert, nicht gelöscht**,
Kapitel 5 Posten 12):

* `radio-admin` — **`265abd5`**
* `radio-inventar` — **`f883ec4`**

---

## ⚠️ Zum Zustand dieses Dokuments

**Geprüft, aber nicht re-kritisiert.** Drei querschnittliche Prüfer haben das zusammengeführte
Dokument gelesen (Ausführbarkeit am Cutover-Abend · Datenintegrität und Testgüte · Zusagen, Belege,
Randbedingungen) und **16 Funde** gemeldet, davon **2 blockierend**. Die Nacharbeit hat **alle 16
eingearbeitet** — nachgezählt und einzeln gegengeprüft (das Dokument wuchs dabei von 4524 auf 4891
Zeilen).

**Was fehlt:** die Nacharbeit wurde von einer Ausgabengrenze abgebrochen, **nachdem** ihre Änderungen
geschrieben waren, aber **bevor** sie ihren Bericht abgab. Deshalb gibt es (a) **kein Protokoll
abgelehnter Beanstandungen** — ob sie einen Fund mit Gegenbeleg verworfen hat, ist nicht
dokumentiert; nach der Gegenprüfung sieht es aus, als habe sie alle übernommen — und (b) **keine
Re-Kritik**. Bei Spec 1 fand die zweite Runde nach einem als geschlossen gemeldeten ersten Durchgang
noch sieben Reste. Mit dieser Größenordnung ist hier zu rechnen: **ein Re-Kritik-Durchgang steht vor
dem Cutover-Abend aus.**

Die zwei blockierenden Funde sind beide eingearbeitet und beide waren Ausführbarkeitsfehler, keine
Denkfehler: der Import griff auf einen Host-Pfad `/data` zu, den es nur im Container gibt, und der
erste Handgriff des Umschwenks („Alt-Router weg") hatte kein ausführbares Ziel — **in beiden
eingecheckten Alt-Compose-Dateien kommt `traefik` nicht ein einziges Mal vor**, beide veröffentlichen
nur `ports:` (unabhängig nachgeprüft). Daraus ist die Vorbedingung §4.2 Nr. 13 geworden: die heutige
Router-Konfiguration ist **vor** dem Fenster abzulesen und wörtlich zu protokollieren.

## Die neun harten Randbedingungen

Sie stehen vorn, weil jede von ihnen mindestens einen Schritt dieser Spec anders macht als in den
fünf vorherigen Cutovern des Hauses.

**1. ⚠️ Es gibt kein Parallelfenster.** Der Alt-Kiosk (`radio-inventar`) läuft **schon heute** unter
`radio.iuk-ue.de` (Betreiberantwort 1, `docs/radio-portierung-analyse.md:1771`; gesetzte
Entscheidung 3). Der Origin bleibt zeichengleich. Alt und Neu können denselben Host nicht
gleichzeitig bedienen — „nie zwei Router gleichzeitig auf derselben Domain" (`CLAUDE.md`, Abschnitt
Cutover) ist hier keine Vorsichtsregel, sondern eine **physische Grenze**. Daraus folgt: die
Verifikation gegen einen **ephemeren Container ohne Traefik-Labels** ist nicht Kür, sondern der
**einzige** Weg, vor dem Umschwenk überhaupt etwas zu prüfen. **Der Rückweg ist „Router zurück",
nichts sonst** — und er kostet Daten, sobald einmal fachlich geschrieben wurde.

**2. ⚠️ Beide Domains ziehen im SELBEN Fenster um** (gesetzte Entscheidung 15). Der Kiosk spricht
nie mit `radio-admin`s Oberfläche, sondern über **sechs `/v1`-Routen**
(`radio-admin/server/src/routes/loanApi.ts`). Schwenkt die Verwaltung zuerst, verliert der Alt-Kiosk
seine Datenquelle; fällt die HTTP-Grenze zu früh, steht der Kiosk ohne Bestand da. Deshalb ist der
Umschwenk **ein** Schritt und nicht zwei (Kapitel 4, Schritt 9).

**3. ⚠️ Der Faktor-1000-Fehler ist paritätsgrün UND löscht die Leihhistorie.** Quelle ist
epoch-**Millisekunden** (`radio-admin/server/src/db/schema.ts:37-38`, `:126-130`; der Kommentar
`:103-104` sagt es), Ziel ist Drizzle `mode: "timestamp"` = Unix-**Sekunden** (Entscheidung 11).
Paritaet vergleicht Zeilen-Hashes aus **derselben** Mapping-Funktion auf **beiden** Armen
(`scripts/import/parity.ts:43-56`; `scripts/import/portal.ts:73-76` schreibt es selbst hin) — ein
konsistenter Fehler hasht beidseitig gleich. Dazu: `radio-admin/server/src/index.ts:35` startet einen
Retention-Purge, der **sofort** läuft (Quellkommentar: „clears any backlog, e.g. straight after a
data migration"), Cutoff = jetzt minus zwei Monate. Sekunden statt Millisekunden legt jedes
`returned_at` ins Jahr **1970** → der **nächste Boot** löscht die komplette abgeschlossene
Leihhistorie. Aktive Leihen (`returned_at IS NULL`) überleben. **Der Import-Test bleibt grün.**

**4. Die 2-Monats-Retention wird übernommen** (Betreiberantwort 4, Entscheidung 12), aber **nicht**
als Sofort-Purge beim Boot (B5: Erstlauf 1440 Minuten). Betroffen sind „< 100" Zeilen — das ist eine
**Schätzung**, keine Zählung. **Die Zählung ist ein Runbook-Schritt** (A8 in Kapitel 2, Abfrage R in
Kapitel 5).

**5. Kein externer API-Konsument** (Betreiberantwort 3: statischer `RADIO_ADMIN_URL` +
`RADIO_ADMIN_API_TOKEN`; der einzige Konsument war der Alt-Kiosk, und er verschwindet mit dem Port).
Daraus folgt Entscheidung 13 und mit ihr B16: **`api_tokens` existiert im Ziel nicht.**

**6. `AdminUser` aus `radio-inventar` wandert nicht** (Entscheidung 14): im Pocket-ID-Betrieb
schreibt der OIDC-Weg **nicht** in die Tabelle, sondern baut die Kennung als `pocketid:${sub}`
(`radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`); die Suite führt den
**rohen** `sub`. Eine **Zählung** vor dem Abbau belegt es: `select count(*) from "AdminUser";`
(Kapitel 5, P3) — die Zählung dokumentiert, **was verworfen wird**.

**7. ⚠️ Der Service Worker des Alt-Kiosk überlebt den Umschwenk**, weil der Origin zeichengleich
bleibt: Root-Scope (`radio-inventar/apps/frontend/src/hooks/usePWA.ts:72-73`), Cache-Name
`radio-inventar-v1` (`public/sw.js:2`), `skipWaiting()` + `clients.claim()` (`:24`, `:40`). Spec 1
§7.1.3 baut dafür einen **Abräum-Worker**; er gehört in den **ersten Deploy**, nicht in den Cutover
(Kapitel 4, §4.2 Nr. 1–2 und §4.7.1).

**8. ⚠️ Die lokale `radio-admin/data/data.sqlite` ist als Beleg unbrauchbar:** leer und
vorbaselinig — `.tables` zeigt nur `__drizzle_migrations`, `device_events`, `devices`,
`software_versions`; `loans`, `api_tokens` und `users` **fehlen ganz**
(`docs/radio-portierung-analyse.md:1865-1872`). Ein Stand **vor** der Loan-Migration `0003`. **Alles
Bestandsbezogene ist ein Runbook-Schritt gegen den echten Dump, nie eine Zahl aus dieser Datei** —
und sie ist auch keine Fixture (die Fixture ist die DDL aus `radio-admin/server/drizzle/`,
Kapitel 1 §1.8).

**9. ⚠️ Das `lagerbuch`-Import-Skript ist NICHT im Repo.** `scripts/import/` führt heute genau
`feedback-time.ts`, `feedback.ts`, `parity.ts`, `portal.ts` plus je einen Test und `fixtures/` —
**kein `lagerbuch.ts`**, obwohl der `lagerbuch`-Import produktiv gelaufen ist. **Wie** er ablief
(Handarbeit am Server, ein nicht committetes Skript, `sqlite3`-Shell), ist aus dem Repo nicht
ableitbar; Spec 1 §2.8.1 zieht daraus die richtige Folge: „Das ist kein Vorbild, dem zu folgen
wäre." **Diese Spec sagt an jeder Stelle, an der ihr dieses Vorbild fehlt, ausdrücklich, woraus sie
stattdessen ableitet:**

| Entscheidung | Abgeleitet aus | Was unbelegt bleibt |
|---|---|---|
| Der Schnappschuss entsteht mit `.backup` (§1.1) | `scripts/backup.sh:41-43` als Hausform | wie der `lagerbuch`-Snapshot entstand |
| Eine Transaktion um das Schreiben (§1.5.3) | Gegenbeleg: `portal.ts` und `feedback.ts` haben **keine** | ob `lagerbuch` eine benutzte |
| Die Zählzeile des Importers (§1.5.3) | `docs/runbooks/lagerbuch-cutover.md:452`, `:544` (dieselbe Zahl vorher und nachher) | ob der Zählvergleich dort automatisiert war |
| Die Aufrufform (§1.5.3, §3.1.2) | `docs/runbooks/portal-cutover.md:19-25` — ein positionales Argument, der Snapshot-Pfad | — |
| Die Paritätsausgabe (⬜ L6) | `portal-cutover.md:20`, `:33` (`parity green`) | die Abschlusszeile von `radio.ts` |

**Wer das Skript findet, prüft diese fünf Zeilen gegen es.**

---

## Kapitelnummern und die Umschlüsselung der Querverweise

Die fünf Teile, aus denen diese Spec zusammengeführt ist, benutzen **vier verschiedene**
Kapitelnummerierungen — jeder Teil hat die Zahl geschätzt, die er nicht kennen konnte, und Teil 2
hat sie ausdrücklich offengelassen („`Zusage an Kapitel N (…)`", Teil 2 Kopf). **Das ist keine
inhaltliche Divergenz, sondern eine Normalisierung; sie steht deshalb hier und nicht unter
„Widersprüche".**

**Verbindlich ist ab hier diese Nummerierung:**

| Kapitel | Inhalt |
|---|---|
| **1** | Das Import-Skript `scripts/import/radio.ts` |
| **2** | Paritaet, Feldstichproben und die Abfragen vor dem Import |
| **3** | Generalprobe und Verifikation ohne Parallelfenster |
| **4** | Der Cutover selbst |
| **5** | Standby und Abbau |

Die Umschlüsselung, damit ein Querverweis aus einem Teiltext auffindbar bleibt:

| Teil | „Kapitel 1" meinte | „2" | „3" | „4" | „5" |
|---|---|---|---|---|---|
| 1 (Import) | Import | Generalprobe → **3** | Cutover → **4** | Abbau → **5** | — |
| 2 (Paritaet) | *durchgehend „Kapitel N (Sache)" — die Klammer trägt, die Zahl war leer* | | | | |
| 3 (Generalprobe) | — | Import **und** Freeze → **1** + **4** | Generalprobe (selbst) | Umschwenk → **4** | Abbau → **5** |
| 4 (Cutover) | — | Import → **1** | Generalprobe → **3** | Cutover (selbst) | Abbau → **5** |
| 5 (Abbau) | Eingaben → **4 §4.3** | Import und Generalprobe → **1** + **3** | das Fenster → **4** | Abnahme und Verifikation → **4 §4.6** | Abbau (selbst) |

⚠️ **Zwei Verweise aus Teil 3 sind zweideutig und hier aufgelöst:** „Kapitel 2 (Import und Freeze)"
zerfällt in **Kapitel 1** (der Importer) und **Kapitel 4 Schritt 1–2** (Freeze und echter
Snapshot). Teil 5s „Kapitel 1 (Eingaben)" gibt es nicht als eigenes Kapitel — die Eingaben stehen in
**§4.3 (E1–E8)**, und U4/U6/U7 sind dort nachgetragen.

---

## Die ⬜-Leerstellen — die Liste, die nach dem Bau abgearbeitet wird

**Sie steht vorn, nicht in einer Fußnote.** Jede Zeile ist eine **Ablesung**, keine Entscheidung: es
ist ausdrücklich erlaubt und besser, hier eine benannte Leerstelle zu führen, als eine prüfbar
aussehende Erfindung. Der Präzedenzfall ist vernarbt: die `lagerbuch`-Spec verlangte ein
`cookies().delete()` in einer Server Component, wo es **wirft** — ein Playwright-Test hätte dort eine
Zusage geprüft, welche die Bauform nicht halten kann.

⚠️ **Zwei Zeilen dieser Tabelle sind Server-Ablesungen (L13) bzw. Browser-Ablesungen (L12) und stehen
hier trotzdem**, weil sie an einem gebauten Stand hängen: L13 nennt Container und Port **des Images,
das erst gebaut werden muss**, L12 den Ablesepunkt **des gebauten Workers**. Rein betriebliche
Auskünfte — Edge-Proxy-Entrypoints, `API_TOKEN`-Fundort, Host-Cron — stehen dagegen in der U-Tabelle
darunter, nicht hier. Die Spalte „Quelle der Ablesung" sagt es je Zeile.

| ⬜ | Was genau abzulesen ist | Quelle der Ablesung | Wo es gebraucht wird |
|---|---|---|---|
| **L1** | Die exakten Namen der zehn Typaliase, die `src/app/m/radio/_db/schema.ts` exportieren muss, damit die Mapper-Signaturen kompilieren. Spec 1 §2.2.4 belegt genau **zwei** (`NeuesGeraet`, `Geraet` in `paritaetsSichtGeraet(r: NeuesGeraet \| Geraet)`); die übrigen acht folgen demselben Muster und werden hier **nicht** als gesetzt behauptet | Bau (Schemadatei) | §1.4, §1.5.2 |
| **L2** | Ob better-sqlite3 die SQLite-Meldung `UNIQUE constraint failed: loans.device_id` unverändert durchreicht oder in einen `SqliteError` mit `code: SQLITE_CONSTRAINT_UNIQUE` verpackt. **Die Meldung selbst ist gemessen** (mit `sqlite3` gegen die DDL aus §1.8); offen ist allein die Verpackung durch den Treiber | Bau (erster Testlauf) | §1.6.3 Fall B |
| **L3** | Namen und **vollständige** Spaltenlisten der **vier** übrigen Paritätssichten (`software_versions` 6, `users` 3, `device_events` 8, `loans` 12). Abzulesen je Sicht: (a) trägt sie **jede** Spalte der Zieltabelle, (b) läuft jede `mode: "timestamp"`-Spalte durch `sekunden()`, (c) bleibt `devices.last_updated_at` **unumgerechnet** | Bau | §1.5.2, §2.1.4 |
| **L4** | `select count(*) from __drizzle_migrations;` in `radio.db` gegen die Zahl der Einträge in `src/app/m/radio/_db/migrations/meta/_journal.json` (Muster `lagerbuch-cutover.md:72`). Die Zahl ist heute nicht nennbar, weil das Verzeichnis nicht existiert | Bau | §2.6 |
| **L5** | **Verkleinert, Nachtrag 2026-08-18 (Cutover-Leitplan NS8).** Aus dem Repo heute lesbar: `module` = der **Modulname**, `status: "ok"` = der **DB-Zugriff** (er entsteht **erst nach** `openModuleDatabase(moduleDbPath(key))` plus `db.prepare("SELECT 1").get()`), `revision` = der **Commit** — `src/core/health/index.ts:4-15` und `src/app/api/health/[modul]/route.ts:23-26`. **Offen bleibt allein der WERT von `revision`.** ⚠️ Der bisher zitierte Beleg `route.ts:11-18` zeigt **nicht** auf die Antwortform, sondern mitten in einen Kommentarblock (`/*` auf `:7`, `*/` auf `:22`) | **§4.2 Nr. 1** — die Protokollzeile des ersten Deploys, **nicht** der Bau (im Runbook ist das **§A Nr. 1**) | §2.6, §3.2.6 V3, §4.6 Nr. 3 |
| **L6** | Die genaue **Abschlusszeile** von `scripts/import/radio.ts`. Bei `portal` ist es die Zeichenkette `parity green` (`portal-cutover.md:20`, `:33`); das Runbook prüft **Zeichenkette und Exit-Code**, nicht nur einen von beiden | Bau | §3.1.2, G2 |
| **L7** | Der genaue `Location`-Kopf der `/admin`-Weiterleitung: **Statuscode** (307 oder 302) sowie Protokoll und Host, die `verwaltungsZiel(headers)` in die `callbackUrl` schreibt. Protokolliert wird der **vollständige** Wert, in jedem Fall | Bau / Abruf | §3.2.6 V2, §4.6 Nr. 5 |
| **L8** | Was `GET /m/radio` mit `Host: iuk-ue.de` liefern **soll** — 404 aus dem Host-Riegel oder eine gerenderte Fläche. Spec 1 §1.2 entscheidet es; **abgelesen und protokolliert wird es in jedem Fall** (Falle 61) | Bau | §3.2.6 V7 |
| **L9** | Ob `/` oder `/t/<code>` eine **kamerabasierte** Fläche trägt. Falls ja, ist ein sicherer Kontext für sie Pflicht und Stufe 3 stellt ihn her; falls nein, bleibt das Secure-Cookie der einzige Grund | Bau | §3.3.1 |
| **L10** | Die Zeichenkette aus dem modul-eigenen Ausleih-Rahmen (Spec 1 §4.2), die im **Portal**-HTML nicht vorkommt — sie ist der `grep`-Anker der Portal-Fallback-Probe. Eine erfundene Zeichenkette wäre ein Test, der grün ist, weil er nichts trifft | Bau | §4.6 Nr. 1 |
| **L11** | Was `curl -si https://radio.iuk-ue.de/manifest.webmanifest` **tatsächlich** liefert (404, oder das Manifest eines anderen Moduls über den Rewrite). Was richtig ist, entscheidet die gebaute Routentabelle | Bau / Abruf | §4.6 Nr. 6 |
| **L12** | Der genaue Ablesepunkt in den Browser-Entwicklerwerkzeugen nach dem Reload: welche Einträge unter *Application → Service Workers* und *Application → Cache Storage* leer sein müssen, und ob ein „redundant"-Eintrag stehen bleibt | Bau / Browser | §4.7.2 |
| **L13** | Der Name des regulären Suite-Containers (`docker compose ps`) und der veröffentlichte Loopback-Port des Fenster-Prüfcontainers — **ohne beides ist §4.5 Schritt 8 nicht ausführbar** (siehe W5) | Server | §4.5 Schritt 8 |
| **L14** | Ob der Fenster-Prüfcontainer **während** des laufenden Schritt-7-Stacks auf `suite_data` booten darf, oder ob er dafür gestoppt werden muss: er ruft `migrateAllModules()` und die Boot-Haken **jedes** Moduls, und zwei bootende Prozesse auf einer SQLite-Datei sind nicht dasselbe wie zwei Leser (siehe W5, Residuum 1) | Bau / Abruf | §4.5 Schritt 8 |

**Zwei ⬜ aus Teil 4 lösen sich beim Zusammenführen auf und werden deshalb NICHT gezählt:**

* Teil 4 ⬜ 1 („die exakte Aufrufzeile von `scripts/import/radio.ts`") — **beantwortet** von
  Kapitel 1 §1.5.3: `tsx scripts/import/radio.ts <radio-snapshot.db>`, ein positionales Argument,
  das Ziel steuert `DATA_DIR`. Teil 4 konnte das nicht wissen, weil es Kapitel 1 nicht sah.
* Teil 4 ⬜ 2 („welche der sechs Tabellen im Ziel überhaupt existiert") — **entschieden** von B16 und
  Entscheidung 13: `api_tokens` existiert im Ziel nicht. Das ist keine Ablesung, sondern eine
  Festlegung, und sie steht in Kapitel B. Siehe W4.

---

## Was nur der Betreiber oder der Server hergibt

Kein ⬜, weil kein Bau sie beantwortet. **Sie werden vor dem Fenster ausgefüllt und ins
Cutover-Protokoll geschrieben.** Vollständig mit Belegen in §4.3.

| # | Eingabe | Woher | Blockiert |
|---|---|---|---|
| E1 | **Gruppenname** für `SUITE_ADMIN_GROUP_RADIO`, exakt wie im `groups`-Claim | Betreiber (U10) | jede Verwaltungsseite |
| E2 | **Echter Volume-Name** von `radio-admin` | Server | §4.5 Schritt 2 |
| E3 | **Echter Volume-Name und `POSTGRES_USER`** von `radio-inventar` | Server | §4.5 Schritt 3, §5.2.3 |
| E4 | **Sitzungsdauer** `RADIO_AUSLEIH_SITZUNG_STUNDEN` (Vorschlag 12, C.2) | Betreiber | `<N>` in der Neuigkeitennotiz |
| E5 | **Gedruckte Aufsteller: Anzahl, Ort, wer sie ersetzen kann** (C.3) | Begehung, kein `SELECT` | der Ausstellungsplan §4.8 |
| E6 | **Wie viele Geräte tragen den Alt-Token im `localStorage`** | Begehung, kein `SELECT` — der Token liegt im `localStorage`, es gibt keine Tabelle (`docs/radio-portierung-analyse.md:1969-1971`) | Umfang des SW-Handgriffs §4.7 |
| E7 | **Traefik-Containername** | Server | §4.6 Nr. 8 |
| E8 | **Wer ist am Cutover-Abend namentlich anwesend** und stellt den ersten Code aus | Betreiber | der erste einlösbare Zugang §4.8.2 |
| U4 | **Wo läuft das `radio-inventar`-Frontend produktiv** (Prozess, Container, statische Auslieferung, Reverse-Proxy-Eintrag; auf welchem Host, mit welcher Konfiguration) | Betreiber | ⛔ der **Freeze** (§4.5 Schritt 1) · ⛔ **der Umschwenk** (§4.5 Schritt 9 Nr. 1 — der Alt-Router hat ohne U4 kein ausführbares Ziel) · ⛔ **der Rückweg** (§4.9 3c/3d) · **und** die Vollständigkeit der Abbauliste (§5.3) |
| U4a | **Wo setzt die Produktion `API_TOKEN`?** Er ist Pflichtwert mit `min(32)` und ohne Default (`radio-inventar/apps/backend/src/config/env.config.ts:11`) und steht in der eingecheckten Compose-Datei **nicht** | Betreiber, gleiche Wurzel wie U4 | §5.4 (der Handgriff lautet „finden, wo Produktion ihn setzt — dann dort löschen") |
| U4b | **Gibt es auf Host-Ebene einen Cron, systemd-Timer oder Backup-Job** zu einem der Alt-Stacks? | Betreiber, gleiche Wurzel wie U4 | §5.5 |
| U6 | Werden die **zwei OIDC-Client-Registrierungen** in Pocket ID gelöscht oder aufbewahrt? | Betreiber | §5.4, Posten 13 |
| U7 | Lief `radio-admin` in Prod je mit `AUTH_DEV_BYPASS`? | **Abfrage A9** (§2.4.5), Wiederholung als Abfrage 8 in §5.2.2 | Lesbarkeit der Audit-Spalten; nach dem gelöschten Volume nicht mehr beantwortbar |
| U8 | **Volumengröße und Dump-Dauer** beider Stacks | Messung **in der Generalprobe** | Bemessung des Fensters (§4.2 Nr. 7) |
| U9 | Sind Repo- und Server-`compose.yaml` am 19.07. auseinandergelaufen (`ADMIN_GROUP` fehlte in der Vorlage)? | Betreiber — **im Repo nicht nachweisbar, deshalb Frage und nicht Tatsache** | nichts; die Aufschreibpflicht aus §4.4.4 hängt nicht daran |

⚠️ **U4 ist der teuerste offene Punkt dieser Spec**, und er ist der einzige, den **kein Befehl**
beantwortet. Er ist **vor** dem Cutover einzuholen: nach dem Abbau ist er nur noch durch
Ausprobieren zu beantworten, und das Ausprobieren heißt dann „was ist kaputtgegangen?".
⚠️ Teil 4 führt U4a als „⬜ 6" in seiner ⬜-Tabelle und nennt es im eigenen Text zwei Zeilen später
„eine Server-Ablesung, keine Repo-Frage" — hier steht es in dieser Tabelle, nicht in der ⬜-Liste.
Dasselbe gilt für die Weitergabe der Entrypoints durch den Edge-Proxy (§4.4.4 Punkt 6).

---

## Was aus Spec 1 Kapitel C noch offen ist — und welchen Cutover-Schritt es blockiert

| # | Frage | Stand in Spec 1 | Welcher Schritt dieser Spec blockiert ist |
|---|---|---|---|
| **C.1** | Bauform des Ausleih-Codes: dauerhaft und sperrbar, rotierend, oder Sitzung je Scan? | ⚠️ **von Spec 1 vorentschieden** (dauerhaft + sperrbar), nicht vom Betreiber | **Kein** Cutover-Schritt — solange nichts gedruckt ist. Ab dem **Druck des ersten Codesatzes** (§4.8.1 Nr. 3, §3.3.3) wird ein Wechsel ein Papieraustausch, nicht eine Schemaänderung. Der Druck ist also die Frist für C.1 |
| **C.2** | Sitzungsdauer 12 h wie `lagerbuch`? | Vorschlag 12 h (`src/app/m/lagerbuch/_lib/grenzen.ts:73`) | **E4** und damit `<N>` in der Neuigkeitennotiz (§4.8.3). Ohne Antwort gilt die Vorbelegung 12 — der Cutover läuft, die **Notiz** aber behauptete sonst eine unbestätigte Zahl |
| **C.3** | Sind gedruckte Aufsteller im Umlauf, und wo? | offen | ⛔ **die Zweigwahl in §4.8.** Im Zweig „ja" ist der Umschwenk **abzubrechen**, wenn Handeingabe-Ausweichweg und ausstellende Person nicht abgedeckt sind (§4.8.1 Nr. 6). ⚠️ Und die Formulierung in C.3 („Bestandscodes zeichengleich übernehmen") ist **nicht durchführbar** — §4.8.1 korrigiert sie |
| **C.4** | Benutzername beim Ausleihen vorausfüllen? | offen, Vorschlag „vorbelegt, überschreibbar" | **kein** Cutover-Schritt. Nur die Generalprobe sieht es (V14) |
| **C.5** | Wie wird das `radio-inventar`-Frontend heute ausgeliefert? | offen | ⛔ **der Freeze** (§4.5 Schritt 1) **und** die Vollständigkeit der Abbauliste (§5.3.1) — identisch mit U4. Der schärfste offene Punkt: bleibt ein Auslieferungsweg unbekannt, bleibt beim Freeze ein Schreibweg offen, den niemand gestoppt hat, und der Verlust ist **stumm** |
| **C.6 / B4** | Zwei Rollen oder eine (Updater-Rechtestufe)? | ⛔ blockierend, fachlich, in Spec 1 **bewusst** geparkt | **die endgültige `.env`** (§4.4.1). Fällt C.6 auf „zwei Rollen", kommt eine `SUITE_UPDATER_GROUP_RADIO` hinzu — mit ihr eine sechste Boot-Prüfung und eine sechste Eingabe neben E1. **Der Cutover ist ohne Antwort durchführbar** (eine Rolle ist der engere Zuschnitt), aber die `.env` wäre dann nachträglich zu erweitern |
| **C.7** | Muss offline geschrieben werden können? | unbeantwortet | **kein** Cutover-Schritt, aber die Begründung des Abräum-Workers hängt daran: er hat **keinen `fetch`-Handler** (§7.1.3). Wäre Offline-Schreiben Pflicht, wäre das eine Moduländerung und keine Runbook-Zeile |

---

## Widersprüche zwischen den Kapiteln

Elf Funde. **Keiner ist still glattgezogen**: je Fall steht, was die zwei Kapitel sagen, was gilt und
warum. Wo eine Entscheidung von Spec 1 abweicht, steht sie zusätzlich in **Anhang B**. Was geprüft
und **nicht** als Widerspruch bestätigt wurde, steht in **Anhang A** — nach der Hausform von Spec 1
(Anhang B, Abgelehnte Beanstandungen); eine Liste, die mit schon geklärten Fällen gepolstert ist,
trainiert den Leser um 23 Uhr aufs Überfliegen.

### W1 — `.backup` statt `cp`, und die Generalprobe hält den Alt-Stack NICHT an ⛔ tragend

**Kapitel 1 §1.1** verbietet `cp` der `data.sqlite` ausdrücklich: `radio-admin` läuft im WAL-Modus
(die Pragmas in `radio-admin/server/src/db/index.ts`, `foreign_keys = ON` dort in `:28`), eine
WAL-Datenbank besteht aus **drei** Dateien, und ein `cp` verliert den Schwanz aller committeten
Transaktionen — **paritätsgrün**, weil eine abgeschnittene Quelle mit sich selbst vollkommen einig
ist. **Kapitel 2 §2.4 und Kapitel 4 Schritt 2** benutzen trotzdem
`docker run … sh -c 'cp /d/data.sqlite /out/radio-admin-snapshot.sqlite'` — wörtlich aus Spec 1
§9.4.1 übernommen; Kapitel 2 hängt eine Ausweichbedingung an (`ls -la`, dann `.backup`), Kapitel 4
nicht.

**Entschieden: `.backup` ist die einzige zulässige Form, in der Generalprobe wie im Fenster.**

```bash
# Verbindlich, beide Läufe. Gegen die LAUFENDE Datenbank zulässig — genau dafür ist .backup da.
docker run --rm -v "$VOL":/d -v "$PWD":/out alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1;
         sqlite3 /d/data.sqlite ".backup /out/radio-admin-snapshot.sqlite"'
# gleichwertig, wenn sqlite3 >= 3.27:  sqlite3 /d/data.sqlite "VACUUM INTO '/out/…'"
```

Begründung, nachgeschlagen: `scripts/backup.sh:41-43` sichert **jede** `*.db` unter `DATA_DIR` mit
genau diesem Befehl, und `scripts/backup.sh:32-36` bricht sogar **hart** ab, wenn kein `*.db`
gefunden wird, „statt ein leeres Tarball zu schreiben und Erfolg zu melden". Das ist die Hausform,
nicht eine Erfindung dieser Spec; §1.1 wendet sie nur auf die **Quellseite** an. Spec 1 §9.1 nennt
dieselben Zeilen als Beleg, dass `radio.db` ohne Skriptänderung ins Backup fällt.

⚠️ **Die Folge, die keiner der fünf Teile ausschreibt, und sie ist die scharfe:** weil `.backup`
gegen die **laufende** Datenbank arbeitet, **wird der Alt-Stack für den Generalproben-Snapshot NICHT
angehalten.** Das `docker compose -f radio-admin/docker-compose.yml stop app` aus Kapitel 2 §2.4
**entfällt dort** und gehört ausschließlich zum **Freeze** (§4.5 Schritt 1). Grund: **jeder Start von
`radio-admin` löscht Historie** — `index.ts:35` ruft `startRetentionSchedule`,
`retentionService.ts:47` purgt **sofort**, erst `:48` setzt den Tagestimer, und der Cutoff hängt an
der **Wanduhr** (`:9`, `:19`). Wer für einen Generalproben-Snapshot stoppt und danach wieder startet,
hat die Alt-Anwendung um zwei Monate Historie gekürzt, mit einer **Erfolgszeile** im Log
(`retentionService.ts:41`, `[retention] purged N expired loan(s)`) und ohne roten Test.

**Daraus die Verschärfung einer Frist, die beide Teile zu spät setzen:** §4.2 Nr. 3 (Retention
neutralisiert **oder** Volume kopiert) und §3.6 Zusage 12 verlangen den Nachweis „vor dem
Cutover-Abend". **Verbindlich ist: vor dem ERSTEN Generalproben-Snapshot** — denn ab da kann jemand
den Alt-Stack anhalten, und der nächste Start ist der Schaden.

### W2 — Wann der erste Zugangscode entsteht ⛔ tragend

**Kapitel 1 §1.4.6 und §1.5.2** sagen zu: „Der erste Satz Zugangscodes entsteht in der Suite,
ausgestellt von einem radio-admin, **nach** dem Import und **vor** dem Umschwenken des Routers", und
schreiben die Schrittfolge fest: **Import → Zugangscodes ausstellen → Verifikation → Router
umschwenken.** **Kapitel 4 §4.8.2** legt das Gegenteil fest: **unmittelbar nach** §4.6 Nr. 3 (also
**nach** dem Umschwenk), auf `https://radio.iuk-ue.de/admin/zugaenge`, durch die Person aus E8, und
**vor** der Freigabe an die Nutzer.

**Entschieden: Kapitel 4 gilt. Kapitel 1s Reihenfolge ist nicht durchführbar.** `erstelleCode`
verlangt `requireRadioAdmin()` als erste Anweisung (Spec 1 §3.2.3), also eine Anmeldung **auf dem
radio-Host** — und bis zum Umschwenk bedient dieser Host den Alt-Kiosk (Randbedingung 1). Der
Fenster-Prüfcontainer hat keine Adresse, unter der sich jemand anmelden könnte, und der reguläre
Stack trägt für `radio` noch keinen Router. **Es gibt vor dem Umschwenk keinen Weg, einen Code
auszustellen.**

**Was von Kapitel 1s Zusage trägt und unverändert gilt:** die Paritätsforderung, dass zum Zeitpunkt
des Imports **keine** `zugangscodes`-Zeile existiert (§1.5.2). Die späte Ausstellung erfüllt sie
erst recht. Kapitel 1s Argument bleibt als **benannter Restposten**: zwischen Umschwenk und erstem
Code steht eine anonym erreichbare Ausleihfläche **ohne einen einzigen einlösbaren Code**. Das ist
**nicht** behebbar, es ist zu **begrenzen** — durch die Reihenfolge in §4.8.2 (erster Code
unmittelbar nach Health-grün, **vor** der Freigabe an die Nutzer) und dadurch, dass genau dieser
Schritt zugleich der Beweis des stummen Login-Rückwegs ist (§4.6 Nr. 10). **Beides in einem, von
einer Person, namentlich (E8).**

### W3 — `'now'` gegen `<freeze_iso>` in der Retention-Gegenprobe ⛔ tragend

**Kapitel 2 (A8)** und **Kapitel 4 Schritt 2 und Schritt 5 (c)** rechnen den Cutoff mit
`strftime('%s','now','-2 months')`; Kapitel 2 §2.3.4 merkt an, die Zahl veralte „um die Länge der
Freeze plus die des Fensters" und werde im Fenster **erneut** gezählt. **Kapitel 5 (Abfrage R)**
verbietet `'now'` ausdrücklich und setzt in **beiden** Armen den protokollierten Freeze-Zeitpunkt:
„`'now'` wandert zwischen Import und Abbau und liefert zwei Zahlen, die sich nicht vergleichen
lassen."

**Entschieden: Kapitel 5 gilt für jeden VERGLEICH; `'now'` bleibt nur für die Vorhersage.** Die zwei
Zahlen haben zwei Zwecke und müssen im Protokoll **verschieden beschriftet** sein:

| Zahl | SQL | Zweck | Wann |
|---|---|---|---|
| **A8 — Vorhersage** | Quelle, `strftime('%s','now','-2 months') * 1000` | ersetzt die Betreiber-**Schätzung** „< 100" durch eine Zählung: *wie viele Zeilen nimmt der erste Purge?* | Generalprobe **und** im Fenster erneut |
| **R — Gegenprobe** | **beide** Arme mit `strftime('%s','<freeze_iso>','-2 months')`, Quelle **mit** Faktor 1000, Ziel **ohne** | *ist die Historie im Ziel angekommen?* Beide Zahlen **müssen gleich** sein | im Fenster (Freigabe) **und** vor dem Abbau (Sperre) — **einmal ermittelt, zweimal gelesen** |

⚠️ **Der Grund, warum das kein Formalismus ist:** Kapitel 4 Schritt 5 (c) vergleicht eine
`now`-Auswertung aus Schritt 2 mit einer `now`-Auswertung aus Schritt 5 — **Minuten später**. Eine
Leihe, deren `returned_at` genau auf der Zwei-Monats-Grenze liegt, wechselt in diesen Minuten die
Seite, und die Erwartung „dieselbe Zahl wie in Schritt 2" ist dann **rot ohne Fehler**. Ein falsches
Rot mitten im Fenster ist teuer: der vorgeschriebene Handgriff daneben lautet „Import verwerfen,
`radio.db` löschen, Mapper korrigieren". **`<freeze_iso>` in beiden Armen macht die Grenze
unbeweglich.**

Der Freeze-Zeitpunkt wird in §4.5 Schritt 1 als **ISO-Zeitstempel in UTC** protokolliert; er ist ab
dann der Cutoff jeder Vergleichsrechnung dieser Spec.

### W4 — Fünf oder sechs Tabellen im Zielarm ⛔ tragend

**Kapitel 4 Schritt 5 (a) und §4.6 Nr. 4** zählen im Ziel über **sechs** Tabellen (`api_tokens`
mit) und setzen darauf ein ⬜. **Kapitel 1 §1.5.1/§1.8, Kapitel 2 §2.6, Kapitel 3 §3.1.5.1 und
Kapitel 5 §5.2.2** zählen **fünf** und führen `api_tokens` nur im **Quell**arm, als Protokollzeile.

**Entschieden: fünf im Ziel.** Verbindlich ist Kapitel B: **B16** sagt wörtlich „`mappeApiToken`
**entfällt** (Entscheidung 13: **die Tabelle existiert im Ziel nicht**)", §2.8.2 und §2.10 Nr. 1 sind
darauf nachgezogen, das Zielschema in Spec 1 §2.5 führt `devices`, `software_versions`, `users`,
`device_events`, `loans`, `zugangscodes` — **kein `api_tokens`**. Kapitel A und B gehen dem
Kapiteltext vor; so steht es im Kopf von Kapitel B.

**Die drei Folgen, ausgeschrieben, weil Spec 1 §9.1 wörtlich ins Runbook wandern soll:**

1. **Keine Position in der Einfügereihenfolge** — es gibt kein Ziel, in das eingefügt würde.
2. **`api_tokens` steht in KEINEM der beiden Paritätsarme.** Spec 1 §9.1s Begründung „weil die
   Tabelle in der Paritaet steht" ist nach B16 nicht mehr wahr. Der Paritätscheck deckt **fünf**
   Tabellen.
3. **Die Zählung `SELECT COUNT(*) FROM api_tokens;` bleibt** — als **Protokollzeile** im Quellarm,
   nicht als Paritäts-Sollwert. Deshalb steht die Zeile in §9.4.1 richtig, auch wenn ihre Begründung
   dort falsch ist.

Die Sechser-Schleife bricht gegen `radio.db` mit `Error: no such table: api_tokens` ab — in der
Generalprobe eine Korrektur, im Fenster ein **verbrannter Schritt**, im Abbau-Protokoll dasselbe.
Teil 4s ⬜ 2 entfällt damit (siehe die ⬜-Liste). **Anhang B A1.**

### W5 — Welcher Container die Verifikation in Schritt 8 fährt ⛔ tragend, und keiner der Teile entscheidet es

**Drei Prüfcontainer stehen in den Teilen, und Kapitel 4 Schritt 8 sagt nicht, welcher es ist:**

| Woher | Volume | Zweck |
|---|---|---|
| §3.2.2 | `"$GP/data"` (Wegwerf) | Generalprobe, bootet, `-p 127.0.0.1:3999:3000` |
| §2.2.2 | `"$VOL_SUITE"` (produktiv), `alpine` + `sqlite3`, **bootet nicht** | SQL-Zählungen und Stichproben auf dem Zielarm |
| §4.5 Schritt 8 | **ungenannt** — `http://127.0.0.1:<port>/`, `<port>` **nicht ausgefüllt** | die Verifikation nach dem echten Import |

Der Wegwerf-Container kann Schritt 8 nicht leisten: er trägt die Generalprobendaten, nicht die
importierten. Der `alpine`-Container kann kein HTTP. Und der reguläre Stack aus Schritt 7 hat die
richtigen Daten und das richtige Image, aber **keinen veröffentlichten Port** (`compose.yaml`
publiziert nichts; erreicht wird er über Traefik) und für `radio` noch keinen Router.

**Entschieden: der Fenster-Prüfcontainer ist dieselbe `docker run`-Form wie §3.2.2, mit ZWEI
benannten Unterschieden — `-v suite_data:/data` statt `-v "$GP/data":/data`, und ⛔ `AUTH_DEV_LOGIN`
wird NICHT gesetzt.** Keine neue Maschinerie; die Form ist schon ausgeschrieben, veröffentlicht schon
einen Loopback-Port und hängt an keinem Router.

⚠️ **Warum `AUTH_DEV_LOGIN` der zweite Unterschied sein MUSS und nicht mitgeerbt werden darf:** in der
Generalprobe hängt der Dev-Login an einem **Wegwerf**-Bestand, hier am **produktiven** Volume — genau
die Lage, die §3.2.7 als Gefahr benennt („ein Container mit `AUTH_DEV_LOGIN=true` und einem echten
Bestand"). Und **kein** Prüfschritt des Fensters braucht eine Sitzung: alle sechs sind `curl` mit
vorgetäuschtem `Host`, und der eine Zweig, der eine echte Anmeldung bräuchte
(`requireRadioAdmin`s `notFound()`), ist mit `curl` ohnehin nicht erreichbar — er ist **V11 in der
Generalprobe**. `AUTH_SECRET` wird frisch erzeugt, nie der Prod-Wert.

⚠️ **Der Textriegel aus §3.2.1 gilt weiter und ist ausdrücklich SCOPE-begrenzt:** „die `docker
run`-Zeile **der Generalprobe** enthält die Zeichenkette `suite_data` nicht." Das ist keine absolute
Regel, sondern die Regel **der Generalprobe** — dort ist ein `-v suite_data:/data` ein Zeichen
Unterschied und schreibt in die Produktion. Im Fenster ist genau dieses Volume das Prüfobjekt. **Der
Riegel wird deshalb im Runbook mit seinem Geltungsbereich zitiert, nie ohne.**

**Zwei Residuen, benannt statt durchgewinkt:**

1. Ein zweiter **bootender** Container auf `suite_data` ruft `migrateAllModules()` und die
   Boot-Haken **jedes** Moduls parallel zum Schritt-7-Stack. Er trägt `RADIO_HISTORIE_PURGE=0`, tut
   also nichts Löschendes, und er wird **innerhalb** von Schritt 8 gestartet und beendet — aber ob
   zwei bootende Prozesse auf einer Datei zulässig sind, ist **⬜ L14**, keine Vermutung dieser
   Spec. Der Ausweichweg, falls nicht: den Schritt-7-Stack für die Dauer von Schritt 8 stoppen —
   zulässig, weil er zu diesem Zeitpunkt für `radio` keine Domain bedient, ⚠️ **aber er bedient
   sechs andere Module**, und dann ist der Umschwenk kein reiner radio-Vorgang mehr. Deshalb ist
   L14 abzulesen, bevor das Fenster geplant wird.
2. **Kapitel 2s Lesereihenfolge ist an dieser Stelle zu korrigieren.** §2.2.2 empfiehlt zuerst
   `file:/data/radio.db?immutable=1`, „**nur** gültig, solange kein Prozess schreibt. Nach dem Import
   und vor dem Umschwenk ist das der Fall, weil der Suite-Container zu diesem Zeitpunkt keine Domain
   bedient." Das verwechselt **„bedient keine Domain"** mit **„hat die Datei nicht offen"**: nach
   Schritt 7 hält der reguläre Stack `radio.db` offen (Migrationen, Health, Boot-Haken). **Im
   Fenster gilt deshalb Ausweg 2:** Mount **ohne** `:ro`, `sqlite3 -readonly`; zurückbleibende
   `-wal`/`-shm` sind harmlos und gehören ins Protokoll. `immutable=1` bleibt der **Generalprobe**
   vorbehalten, wo kein anderer Prozess an der Datei hängt.

**Arbeitsteilung im Fenster, verbindlich:** SQL-Zählungen und Feldstichproben laufen im
**nicht bootenden** `alpine`+`sqlite3`-Container aus §2.2.2 · HTTP-Prüfungen im **bootenden**
Prüfcontainer aus §3.2.2 mit `-v suite_data:/data`. **⬜ L13** liefert Containername und Port.

### W6 — `grep -i '^radio:'` gegen `grep -i 'radio:'` ⛔ tragend, weil der Fehlfall grün ist

**Kapitel 4 Schritt 7, §4.6 Nr. 9 und Nr. 14 (der zweite Log-Blick)** filtern mit `grep -i '^radio:'`. **Kapitel 3
§3.1.6** warnt ausdrücklich: „Der Filter muss auf `radio:` allein stehen."

**Entschieden: ohne `^`.** Der tragende Grund ist die **Richtung des Fehlfalls**: `docker compose
logs` stellt jeder Zeile den Servicenamen voran (`suite  | radio: …`), und eine so präfigierte Zeile
kann `^radio:` **nicht** treffen. Der Befehl liefert dann **leere Ausgabe** — und leere Ausgabe liest
sich in Schritt 7 und in §4.6 Nr. 9 als **„keine `radio:`-Warnung", also grün.** Eine Stopp-Bedingung,
die bei falschem Muster still bestanden wird, ist keine. Ohne `^` ist der Befehl unter **beiden**
Formen richtig — `docker logs radio-gp` (unpräfigiert, Generalprobe) und `docker compose logs suite`
(präfigiert, Fenster).

⚠️ **Und die Begründung in Kapitel 3 ist falsch, während ihr Ergebnis stimmt:** dort steht, ein
zusätzliches `^` „trifft JEDE Zeile, der Befehl gibt dann das ganze Log aus". Das ist nicht der
Mechanismus. Die Entscheidung bleibt, die Begründung wird ersetzt — und weil die Präfixform von hier
aus nicht prüfbar ist, gilt zusätzlich: **die erste Rohzeile des Logs wird ungefiltert ins Protokoll
geschrieben**, damit die Präfixform aktenkundig ist und der nächste Cutover sie nicht wieder raten
muss.

### W7 — Der Sollwert des `/admin`-Riegels: gesetzt gegen offen

**Kapitel 4 Schritt 8 und §4.6 Nr. 5** erwarten „**302** + `location:` …/login". **Kapitel 3
§3.2.6** erklärt genau diesen Wert zur Leerstelle: „⬜ der genaue Sollwert des `Location`-Kopfes von
V2 — Statuscode (307 oder 302)".

**Entschieden: die Leerstelle gilt (⬜ L7).** Die Runbook-Zeile lautet **„Weiterleitung in den Login
(3xx) mit `location:`; ein 404 hier heißt: die Seite ruft den Riegel gar nicht"**, und der
**vollständige** Wert wird protokolliert. Ein festgeschriebenes `302` wäre eine Zusage über eine
Bauform, die Spec 1 nicht festlegt — `redirect()` aus einer Server Component liefert je nach
Aufrufweg 307 oder 302, und ein Runbook-Schritt, der beim richtigen Verhalten rot wird, wird beim
zweiten Mal ignoriert. **Was hier NICHT offen ist**, ist die Unterscheidung der zwei Ausgänge (B10,
B11): Seite → Weiterleitung, Route Handler → **404, nie 403 und nie ein Login-Umweg**. Wer beiden
denselben Sollwert gibt, hat eine der zwei Bauformen kaputtgeprüft.

### W8 — Zwei Zählfehler: „elf" Zeitstempelspalten und „vier" Verwechslungspaare

**Kapitel 3 §3.1.4 Nr. 8 und §3.5 Klasse C** nennen den Plausibilitätsriegel „**elf**spaltig".
Verbindlich sind **zehn** Quellspalten in epoch-Millisekunden (**neun** Zeitstempel + `devices.
last_updated_at`): so zählt B16, so führt die SQL-Abfrage in Spec 1 §2.8.3 ihre Summanden, und so
steht es in §1.3.3 und §2.4.6. Spec 1 §2.8.3 schreibt selbst „alle **elf**" über eine Abfrage mit
zehn Summanden; §8.2.1 zählte **dreizehn** (die drei `api_tokens`-Spalten mit). **Verbindlich: zehn.
Die Abfrage bleibt unverändert, die Beschriftung wird korrigiert.**

**Kapitel 3 §3.1.5.2 und G4** sprechen von „den **vier** Verwechslungspaaren" über einer Liste mit
**fünf** Einträgen. Verbindlich sind **fünf** Paare bzw. Tripel (`issi`↔`tei` ·
`created_at`↔`updated_at`↔`last_updated_at` · `snapshot_call_sign`↔`borrower_name` ·
`alamos_integrated`↔`loanable` · `serial_number`↔`hiorg_id`↔`opta`), wie §2.2.3 Regel 3 und §4.5
Schritt 5 (b) sie führen. Beide Male derselbe Fehlertyp wie „elf": eine Wortzahl neben einer
richtigen Liste. **Sie stehen hier, weil eine Prüfliste, deren Kopf eine andere Zahl nennt als ihr
Rumpf, unter Zeitdruck gekürzt wird.**

### W9 — Die Zeilennummern von `parity.ts`

Vier Kapitel belegen dieselben Funktionen mit zwei verschiedenen Zeilenbändern: Kapitel 1, 4 und 5
nennen `checkParity` als `parity.ts:43-56`, Kapitel 2 §2.1.1 nennt `rowChecksum :31-33`,
`multiset :35-43`, `checkParity :45-59`, `assertParity :61-69` und die Längenbedingung `:57`.

**Nachgeschlagen zum Zeitpunkt des Schreibens** — verbindlich sind diese Zahlen:

| Funktion | Zeilen |
|---|---|
| `canon` | `parity.ts:16-28` |
| `rowChecksum` | `parity.ts:30-32` |
| `multiset` | `parity.ts:34-41` |
| `checkParity` | `parity.ts:43-56`, die `ok`-Bedingung samt `source.length === target.length` in **`:50`** |
| `assertParity` | `parity.ts:58-65`, der Text `Import ABORTED — no cutover.` in `:63` |

Kapitel 2s Angaben liegen durchgehend zwei bis vier Zeilen zu hoch. Das ist der eine Ort, an dem ein
Zusammenführen still eine veraltete Zahl übernimmt — deshalb steht die Auflösung hier und nicht in
einer Fußnote.

### W10 — Wann `RADIO_HISTORIE_PURGE=0` entfernt wird

**Kapitel 4 §4.6 Nr. 14 (Retention wieder einschalten)** entfernt die Zeile „nach bestandener Verifikation" und erwartet danach
**keine** `radio:`-Zeile mehr. **Kapitel 5 §5.2.2 (Abfrage R)** verlangt umgekehrt, `RADIO_HISTORIE_
PURGE=0` zu **setzen**, wenn R nicht grün ist, und §5.1.1 lässt das Standby-Fenster erst beginnen,
wenn R grün protokolliert ist.

**Entschieden: kein Widerspruch, sondern eine fehlende Vorbedingung — und die wird nachgetragen.**
§4.6 Nr. 14 (Retention wieder einschalten) lautet ab hier: *„`RADIO_HISTORIE_PURGE=0` aus der `.env` entfernen — **erst wenn
Abfrage R und Abfrage Z grün protokolliert sind** (§5.2.2). Sind sie es nicht, bleibt die Zeile
stehen, die `info`-Zeile bleibt im Log, und das Standby-Fenster beginnt nicht."* Die zwei Zahlen
werden **einmal ermittelt und zweimal gelesen**: in §4.6 als Freigabe, in §5.2 als Abbau-Sperre,
dieselbe Protokollzeile.

⚠️ Der Grund, warum die Zeile überhaupt wieder weg muss: ein **vergessenes**
`RADIO_HISTORIE_PURGE=0` ist ein **stiller** Verlust der Löschrichtlinie, die der DSGVO-Grund für
`borrower_name` ist. Die `info`-Zeile bei **jedem** Start ist das einzige, was ihn findbar hält
(§7.3.4). Der erste Purge läuft danach nach `RADIO_HISTORIE_ERSTLAUF_MINUTEN` (Vorbelegung **1440**,
B5) — bewusst so lang, dass Verifikation, Stichprobe und „Router zurück" noch ins Fenster passen.

### W11 — Acht Vorabfragen gegen A1–A13

**Kapitel 3 §3.1.4** führt eine Tabelle mit **acht** Abfragen und einer eigenen Numerierung 1–8.
**Kapitel 2 §2.4** führt **dreizehn** (A1–A13) und erklärt sich ausdrücklich als **Superset**: A1–A9
sind die acht aus Spec 1 §9.4.1 in ihrer Reihenfolge, A10 ist der Spannen-Riegel aus §2.8.3 Nr. 6,
A11–A13 sind Ergänzungen. **Kapitel 1 §1.4.4** kündigt zusätzlich eine „zusätzliche Vorabfrage"
`SELECT DISTINCT source FROM device_events;` an.

**Entschieden: verbindlich ist A1–A13 aus Kapitel 2.** Zwei Auflösungen dazu:

* Kapitel 3s Achter-Tabelle ist **keine zweite Liste**, sondern eine Zuordnung zur Probe; sie wird
  auf die A-Marken umgeschrieben (§3.1.4).
* **Kapitel 1s „zusätzliche Vorabfrage" ist keine.** Sie ist **A5** — Spec 1 §9.4.1 Invariante 4
  führt sie längst (`source not in ('manual','csv-import','create','update-note')`). Kapitel 1s
  Fassung (`SELECT DISTINCT source`) ist die **informativere** Form derselben Prüfung und wird als
  A5s Befehl übernommen; eine vierzehnte Nummer entsteht nicht.

**Die blockierende Einstufung, einmal und nach A-Marken benannt** (Spec 1 §2.8.3 zählt „Nummer 2, 4
und 6" in seiner eigenen Numerierung — deshalb wird hier nur noch mit A-Marken zitiert):

| ⛔ blockierend | Protokollpflichtig, nicht blockierend |
|---|---|
| A2 · A3 · A4 · A5 · A6 · A7 · A10 · A11 | A1 (sie **setzt** die Sollwerte) · A8 · A9 · A12 · A13 |

⚠️ Mit zwei Verschärfungen aus §2.5: **A12 im Fall `AKTIV`** ist dem Betreiber vorzulegen (eine
aktive Leihe auf einem nicht existierenden Gerät ist über die Oberfläche nicht zurückgebbar), und
**A13** wird ⛔, wenn dieselbe Zeile zusätzlich in A10 auffällt — dann ist es kein Datenfehler von
2024, sondern ein Hinweis auf einen beschädigten Snapshot.

---

# 1. Das Import-Skript

`scripts/import/radio.ts` — SQLite → SQLite, wie `feedback` es war, nicht wie `portal` es war.

Dieses Kapitel entwirft **eine** Datei plus ihren Test plus ihre Fixtures. Es entwirft nicht die
Prüfungen davor (Kapitel 2), nicht die Generalprobe (Kapitel 3), nicht das Fenster (Kapitel 4) und
nicht den Abbau (Kapitel 5).

## 1.0 Warum diese Datei existieren muss

Spec 1 §2.8.1 setzt es fest: **`scripts/import/radio.ts` MUSS committet sein.** Die Begründung ist
nicht Ordnung, sondern Deckung — die Mapping-Funktion ist die **einzige** Stelle, an der der
Faktor-1000-Fehler überhaupt gefangen werden kann. Der Paritätscheck kann es strukturell nicht:
`scripts/import/parity.ts:43-56` vergleicht Multimengen von Zeilen-Hashes, und beide Arme laufen
durch **dieselbe** Mapping-Funktion. `scripts/import/portal.ts:73-76` schreibt das selbst hin:

> „parity certifies DB round-trip fidelity of all 15 fields — NOT the correctness of `toNewService`'s
> Postgres->app mapping (both parity arms derive from `toNewService`, so a mapping bug hashes
> identically on both sides). Mapping correctness is guarded **solely** by the `toNewService` unit
> test — keep its fixture values distinct per field."

**`portal.ts` ist das falsche Vorbild für die Gestalt, das richtige für die Details.** `portal.ts` ist
einstabellig und liest NDJSON aus Postgres; `feedback.ts` ist **mehrtabellig, SQLite → SQLite, mit
Fremdschlüssel-Reihenfolge** — strukturell genau das, was `radio.ts` wird. Von `portal.ts` übernommen
werden: Upsert per Primärschlüssel (`portal.ts:61`), `tsSeconds()`-Normalisierung in **beiden**
Paritätsarmen (`portal.ts:66-71`), und die Warnung, dass Parität **nach** dem Schreiben läuft
(`portal.ts:105-107`). Es gibt **kein `lagerbuch.ts`** als Vorbild — Randbedingung 9 im Kopf sagt, was
stattdessen die Ableitung ist.

---

## 1.1 Die Eingabe: ein konsistenter Einzeldatei-Schnappschuss, kein `cp`

Der Importer nimmt **einen Pfad** und öffnet ihn **lesend**:

```ts
const quellDb = new Database(quellPfad, { readonly: true });
```

wie `scripts/import/feedback.ts:266`. Was er nicht tut: die **laufende** `data.sqlite` von
`radio-admin` öffnen.

⚠️ **`radio-admin` läuft im WAL-Modus** (die Pragmas setzt `radio-admin/server/src/db/index.ts` beim
Öffnen; `foreign_keys = ON` dort in `:28`). Eine WAL-Datenbank besteht aus **drei** Dateien:
`data.sqlite`, `data.sqlite-wal`, `data.sqlite-shm`. Ein `cp data.sqlite /tmp/snap.db` kopiert die
erste und verliert den Schwanz aller committeten Transaktionen, die noch im WAL stehen. **Und das ist
paritätsgrün:** eine zu kurze Quelle ist mit sich selbst vollkommen einig — derselbe strukturelle
Grund wie beim Faktor 1000.

**Entscheidung: der Schnappschuss entsteht mit einem Befehl, der die Datenbank kennt, nicht mit einem,
der Dateien kennt** (W1; Hausform `scripts/backup.sh:41-43`):

```bash
# Gegen die LAUFENDE Datenbank zulaessig — genau dafuer ist .backup da.
sqlite3 /data/data.sqlite ".backup '/data/radio-snapshot.db'"
# gleichwertig ab sqlite3 3.27:
sqlite3 /data/data.sqlite "VACUUM INTO '/data/radio-snapshot.db'"
```

Beides erzeugt **eine** in sich geschlossene Datei ohne WAL-Anhang; beides nimmt die
Leseverriegelung, die `cp` nicht nimmt. **`cp` der `data.sqlite` ist im Runbook verboten**, und der
Verweis auf diesen Abschnitt gehört an die Schritt-Zeile. Der Importer prüft das nicht und **kann** es
nicht prüfen — eine abgeschnittene Datenbank ist von einer kleinen nicht unterscheidbar.

| Fehlgriff | Symptom |
|---|---|
| `cp` statt `.backup` | Der Importer läuft **grün** durch, mit zu wenigen Zeilen. Erkannt wird es **ausschließlich** am ersten Glied der Zählkette (§1.8) — der Zählung gegen die **laufende** `data.sqlite` nach dem Freeze. Ein Vergleich Schnappschuss↔Ziel sieht es **nicht** |
| `.backup` auf ein Ziel im selben Verzeichnis, das dann per Glob mitkopiert wird | Zwei Datenbanken, eine veraltet. Erkennbar an `sqlite3 <snap> "select count(*) from loans"` gegen die Vorabzählung |
| Snapshot von einem Volume, in das die Alt-App weiterschreibt | In der **Generalprobe** erwartet und in Ordnung. Für den **Echtimport** nicht: dort steht der Freeze davor (§4.5 Schritt 1) |

**Der Importer schreibt nie in die Quelle.** `readonly: true` ist nicht Kosmetik: ohne das Flag legt
better-sqlite3 beim Öffnen einer WAL-Datenbank ein `-shm` an und darf recovern — auf einem Volume,
das im Standby unangetastet bleiben soll (Kapitel 5).

---

## 1.2 Die Spalten werden namentlich gelesen — hier ist die Rechnung dazu

Spec 1 §2.8.1 schreibt „Spalten **namentlich**, nie `SELECT *`" und beruft sich auf
`docs/runbooks/lagerbuch-cutover.md:30-31`. Das ist eine geerbte Regel. **Für `radio` ist sie
gemessen** — und die Messung ist der Grund, warum dieses Kapitel hier von `feedback.ts` abweicht:
`scripts/import/feedback.ts:66-72` liest mit `SELECT * FROM groups`. **Diesem Vorbild wird nicht
gefolgt.**

**Die physische Spaltenreihenfolge der produktiven Tabelle `devices` ist nicht die des Schemas.**

* `radio-admin/server/drizzle/0000_confused_thena.sql` erzeugt `devices` mit **23** Spalten.
* `0001_cooing_overlord.sql:1` — `ALTER TABLE devices ADD update_note text;` → physische Position **24**.
* `0004_polite_redwing.sql:1` — `ALTER TABLE devices ADD tei text;` → physische Position **25**.

Das Ziel entsteht **in einem Rutsch** aus der Deklarationsreihenfolge von Spec 1 §2.5.1, und dort
steht `tei` auf Position **4** (direkt hinter `issi`, wo `radio-admin/server/src/db/schema.ts:11` es
deklariert) und `update_note` auf **21**. **Beide Tabellen haben 25 Spalten** — ein positionsweiser
Import scheitert also **nicht** an der Stelligkeit, er läuft durch:

| Ziel-Position | Ziel-Spalte | empfängt (Quell-Position) |
|---|---|---|
| 4 | `tei` | `serial_number` (4) |
| 5–9 | `serial_number` … `assigned_to` | jeweils die nächste (Verschiebung um 1) |
| 10 | `software_version` | `last_updated_at` (10) — **epoch-ms in eine Textspalte** |
| 11 | `last_updated_at` | `notes` (11) — Freitext in die Kalenderdatumsspalte |
| 20 | `loanable` | `created_at` (20) — **eine 13-stellige Zahl in ein 0/1-Feld: jedes Gerät „ausleihbar"** |
| 21 | `update_note` | `updated_at` (21) |
| 22 | `created_at` | `created_by` (22) — ein OIDC-`sub` in eine `integer NOT NULL`-Spalte |
| 23–25 | `updated_at`, `created_by`, `updated_by` | `updated_by` (23), `update_note` (24), `tei` (25) |

⚠️ **SQLite nimmt das alles an.** Die Tabellen sind nicht `STRICT`; Typaffinität konvertiert, wo sie
kann, und speichert sonst den Wert im Originaltyp. Ein `sub` in `created_at` ist kein Fehler, sondern
ein Wert. Dieselbe Falle mit demselben Ergebnis steht in `docs/runbooks/lagerbuch-cutover.md:33-34`
(dort gemessen als `aktiv ← created_by`). Hier ist der teuerste Einzelposten Zeile 20: **`loanable`
wird für jedes Gerät wahr**, weil `created_at` eine große Zahl ist. Danach kann jedes Gerät
ausgeliehen werden, auch das, das seit einem Jahr in Reparatur ist. **Kein Test, keine Parität, kein
Constraint sieht das.**

**Verbindlich:** jede Quellabfrage nennt ihre Spalten, jede Mapping-Funktion liest die Felder **über
den Namen**, nie über eine Reihenfolge oder ein Destructuring nach Position. Das gilt auch für
`alamos_integrated` und `loanable` — die zwei 0/1-Integer, deren Vertauschung niemandem auffällt
(`schema.ts:29`, `:32`).

---

## 1.3 Die Zeitachse — der teuerste Posten der ganzen Portierung

### 1.3.1 Der Fehler, den es zu fangen gilt

Randbedingung 3 im Kopf beschreibt ihn vollständig. Drei Eigenschaften machen ihn teuer:
**paritätsgrün** (beide Arme, dieselbe Funktion) · **wirft nicht** (`Math.floor(1_735_689_600/1000)`
ist eine gültige Zahl, die Zeit liegt 1970) · **der nächste Boot löscht die Historie**
(`radio-admin/server/src/index.ts:35` → `retentionService.ts:47`, sofort, Cutoff jetzt minus zwei
Monate). Spec 1 §2.7.2 zieht daraus die Konsequenz für die Suite (kein Purge am Boot). Dieses Kapitel
zieht die andere Hälfte: **der Riegel steht im Importer, nicht im Vertrauen.**

### 1.3.2 Die drei Funktionen, ausgeschrieben

Übernommen aus Spec 1 §2.2.4 — unverändert; der Test in §1.3.4 bezieht sich Zeile für Zeile darauf.

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

### 1.3.3 Die **neun** Zeitstempel-Spalten plus die **eine** Datumsspalte

Die vollständige Zeitachse des Imports — sie steht als Tabelle, weil sie sonst über fünf Mapper
verteilt ist und keine Stelle sie ganz sieht.

| Quelle (`radio-admin`) | Typ dort | Ziel | Funktion |
|---|---|---|---|
| `devices.created_at` (`schema.ts:37`) | `integer NOT NULL`, ms | `createdAt` `timestamp` NOT NULL | `msZuDatum("devices.created_at", …)` |
| `devices.updated_at` (`:38`) | `integer NOT NULL`, ms | `updatedAt` NOT NULL | `msZuDatum("devices.updated_at", …)` |
| `devices.last_updated_at` (`:18`) | `integer NULL`, ms | `lastUpdatedAt` **`text` `YYYY-MM-DD`** NULL | `tagInBerlin("devices.last_updated_at", …)` |
| `software_versions.created_at` (`:46`) | `integer NOT NULL`, ms | `createdAt` NOT NULL | `msZuDatum(…)` |
| `users.last_seen_at` (`:81`) | `integer NOT NULL`, ms | `lastSeenAt` NOT NULL | `msZuDatum(…)` |
| `device_events.changed_at` (`:95`) | `integer NOT NULL`, ms | `changedAt` NOT NULL | `msZuDatum(…)` |
| `loans.borrowed_at` (`:126`) | `integer NOT NULL`, ms | `borrowedAt` NOT NULL | `msZuDatum(…)` |
| `loans.returned_at` (`:127`) | `integer NULL`, ms | `returnedAt` NULL | `msZuDatumOptional(…)` |
| `loans.created_at` (`:129`) | `integer NOT NULL`, ms | `createdAt` NOT NULL | `msZuDatum(…)` |
| `loans.updated_at` (`:130`) | `integer NOT NULL`, ms | `updatedAt` NOT NULL | `msZuDatum(…)` |

**Neun** Spalten werden `mode: "timestamp"`, **eine** wird `text` — zusammen **zehn** Quellspalten in
epoch-Millisekunden. Das ist genau B16; die abweichenden Zahlen im Bestand (§8.2.1: dreizehn;
§2.8.3: „alle elf" über zehn Summanden; Kapitel 3: „elfspaltig") sind in **W8** abgeräumt.
`api_tokens.revoked_at` ist zusätzlich der Grund, die Spanne nicht zu lockern (`revoked_at IS NULL`
heißt „nicht widerrufen", `0` heißt es nicht) — aber die Tabelle wandert nicht, also entsteht die
Frage nie.

### 1.3.4 Der Test, der den Faktor 1000 fängt

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
  last_updated_at: 1_740_871_800_000,  // 2025-03-01T23:30:00Z → in Berlin der 2025-03-02
                                       // ⚠️ ABSICHTLICH so gewaehlt: bei 00:00:00Z liefern
                                       // UTC-Kuerzung und Berliner Kalendertag DIESELBE
                                       // Zeichenkette, und die Zusicherung waere vakuoes.
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
  id: "g-2", issi: "1234568",
  alamos_integrated: null, loanable: null, last_updated_at: null, update_note: null,
};

export const ALT_LEIHE = {
  id: "l-1",
  device_id: "g-1",
  snapshot_call_sign: "HRO 1/83-1",    // ≠ borrower_name
  snapshot_serial_number: "SN-001",
  snapshot_device_type: "MTP6650",
  borrower_name: "Marek Sowa",         // ≠ snapshot_call_sign
  borrowed_at: 1_741_000_000_000,
  returned_at: 1_741_100_000_000,      // ≠ borrowed_at, ≠ created_at, ≠ updated_at
  return_note: "Akku leer",
  created_at: 1_740_999_999_000,
  updated_at: 1_741_100_001_000,
};

// Die AKTIVE Leihe — §1.6.3 Fall B nennt sie namentlich und braucht sie.
// ⚠️ Nebenbedingung aus der zeichengleich kopierten Quell-DDL: `loans_device_active_uidx`
// laesst je `device_id` HOECHSTENS EINE Zeile mit `returned_at IS NULL` zu. `ALT_LEIHE`
// (zurueckgegeben) und `ALT_LEIHE_AKTIV` duerfen deshalb beide auf `g-1` zeigen — sonst
// weist schon das Einspielen der Fixture sie ab, und der Test ist aus dem falschen
// Grund rot.
export const ALT_LEIHE_AKTIV = {
  id: "l-aktiv",
  device_id: "g-1",
  snapshot_call_sign: "HRO 1/83-1",
  snapshot_serial_number: "SN-001",
  snapshot_device_type: "MTP6650",
  borrower_name: "Ines Falk",
  borrowed_at: 1_742_000_000_000,       // ≠ jede andere Zeitkonstante der Fixture
  returned_at: null,                    // DAS ist die Eigenschaft, an der Fall B haengt
  return_note: null,
  created_at: 1_742_000_001_000,
  updated_at: 1_742_000_002_000,
};

export const ALT_BENUTZER = {
  sub: "sub-anna",                      // dieselbe Kennung wie devices.created_by
  name: "Anna Reiter",
  last_seen_at: 1_739_000_000_000,      // eigener Wert, sonst faengt kein Test die Vertauschung
};

export const ALT_VERSION = {
  id: "v-1",
  value: "10.5.1",
  created_at: 1_736_000_000_000,        // eigener Wert
  created_by: "sub-anna",
  sort_order: 10,
  is_target: 1,                         // ⚠️ genau EINE Zeile — A2 (§2.4.2)
};

export const ALT_EREIGNIS = {
  id: "e-1",
  device_id: "g-1",
  field: "status",
  old_value: "wartung",                 // ≠ new_value
  new_value: "einsatzbereit",           // ≠ old_value
  changed_by: "sub-bert",
  changed_at: 1_737_000_000_000,        // eigener Wert
  source: "manual",
};

// Der fuenfte Enum-Wert, den Datenbank UND Typpruefung unbeanstandet passieren
// lassen (§1.4.4) — die Zeile fuer `toNeuesGeraeteEreignis wirft bei source="importiert"`.
export const ALT_EREIGNIS_UNBEKANNT = { ...ALT_EREIGNIS, id: "e-2", source: "importiert" };
```

⚠️ **Die Regel „je Feld ein anderer Wert" gilt ueber die ganze Fixture, nicht je Zeile.** Die sieben
Millisekunden-Konstanten oben sind paarweise verschieden (`1_735_689_600_000`, `1_736_000_000_000`,
`1_737_000_000_000`, `1_738_368_000_000`, `1_739_000_000_000`, `1_740_871_800_000`,
`1_740_999_999_000`, `1_741_000_000_000`, `1_741_100_000_000`, `1_741_100_001_000`,
`1_742_000_000_000`, `1_742_000_001_000`, `1_742_000_002_000`). Wer eine Zeile spaeter mit einem
schon benutzten Wert nachtraegt, macht genau die Zusicherungen wieder vakuoes, die dieser Abschnitt
setzt.

Die elf Tests aus Spec 1 §2.2.5, jeder mit seiner **Zusicherung**:

| Test (Name verbindlich aus Spec 1 §2.2.5) | Zusicherung |
|---|---|
| `toNeuesGeraet: jedes Zeitfeld behaelt SEINEN Wert in Millisekunden` | `g.createdAt.getTime() === 1_735_689_600_000` **und** `g.updatedAt.getTime() === 1_738_368_000_000` **und** beide `getUTCFullYear() === 2025`. Die Konstanten sind paarweise verschieden — deshalb fängt derselbe Test **auch** die Vertauschung |
| `msZuDatum wirft bei einem Sekundenwert (1735689600)` | `expect(() => msZuDatum("t.x", 1_735_689_600)).toThrow(/Millisekunden-Spanne/)` |
| `msZuDatum wirft bei 0 und bei null-artigen Werten in einer NOT-NULL-Spalte` | `0`, `NaN`, `1.5` werfen; die Meldung nennt `t.x` |
| `tagInBerlin: 2026-08-16T22:00:00Z (Formular-Mitternacht) ergibt 2026-08-17` | `=== "2026-08-17"` — fängt die UTC-Kürzung, die den Tag zurückschiebt |
| `tagInBerlin: 2026-08-17T00:00:00Z (CSV-Weg) ergibt 2026-08-17` | `=== "2026-08-17"` |
| `tagInBerlin: 2026-08-17T14:35:00Z (Date.now()-Weg) ergibt 2026-08-17` | `=== "2026-08-17"` |
| `toNeueLeihe: snapshot_call_sign und borrower_name werden nicht vertauscht` | `l.snapshotCallSign === "HRO 1/83-1"` **und** `l.borrowerName === "Marek Sowa"` — beide |
| `toNeuesGeraet: alamos_integrated und loanable werden nicht vertauscht` | `g.alamosIntegrated === true` **und** `g.loanable === false` |
| `toNeuesGeraeteEreignis wirft bei source="importiert"` | `toThrow(/source/)` — der fünfte Enum-Wert ohne DB-CHECK |
| `paritaetsSichtGeraet liefert Sekunden fuer beide Arme` | `paritaetsSichtGeraet(toNeuesGeraet(ALT_GERAET)).createdAt === 1_735_689_600` |
| `Import ist asymmetrisch idempotent: Zielzeile geaendert, erneut importiert` | §1.6 — und die Zusicherung dort ist ein **Fehlschlag**, nicht ein No-Op |

⚠️ **Diese elf Namen decken die Zeitachse nur für `devices` ab — und damit steht der Satz aus §1.3.1
(„der Riegel steht im Importer, nicht im Vertrauen") für acht der zehn Spalten noch aus.** §1.3.3 ist
eine **Auftragstabelle**, kein Test; ein Mapper, der `new Date(r.changed_at / 1000)` schreibt, fragt
`msZuDatum` **nie**, wirft **nie** und landet still im Jahr 1970. Deshalb **fünf additive
Zusicherungszeilen** — sie sind **⛛ Ergänzungen dieses Kapitels** und **nicht** Teil der elf Namen aus
Spec 1 §2.2.5 (geführt in §1.9):

| ⛛ Additive Zusicherung | Zusicherung |
|---|---|
| `toNeueLeihe: alle VIER Zeitfelder behalten SEINEN Wert in Millisekunden` | `l.borrowedAt.getTime() === 1_741_000_000_000` **und** `l.returnedAt.getTime() === 1_741_100_000_000` **und** `l.createdAt.getTime() === 1_740_999_999_000` **und** `l.updatedAt.getTime() === 1_741_100_001_000` — vier paarweise verschiedene Konstanten, also fängt dieselbe Zeile auch die Vertauschung |
| `toNeuerBenutzer: last_seen_at behaelt SEINEN Wert` (Name analog zu `paritaetsSichtBenutzer`, §1.5.2) | `b.lastSeenAt.getTime() === 1_739_000_000_000` gegen `ALT_BENUTZER` |
| `toNeueSoftwareVersion: created_at behaelt SEINEN Wert` | `v.createdAt.getTime() === 1_736_000_000_000` gegen `ALT_VERSION` |
| `toNeuesGeraeteEreignis: changed_at behaelt SEINEN Wert` | `e.changedAt.getTime() === 1_737_000_000_000` gegen `ALT_EREIGNIS` — **die Zeile, die `new Date(ms/1000)` fängt**, weil der Enum-Test (`ALT_EREIGNIS_UNBEKANNT`) über `changed_at` nichts sagt |
| `toNeuesGeraet: last_updated_at wird zum BERLINER Kalendertag` | `g.lastUpdatedAt === "2025-03-02"` gegen `ALT_GERAET` — die **einzige** Spalte mit Typwechsel (§1.4.3) und die einzige, deren Richtigkeit an der Zone hängt. Die drei `tagInBerlin`-Tests prüfen die **Funktion**; diese Zeile prüft die **Verdrahtung**. Ein Mapper mit `new Date(ms).toISOString().slice(0,10)` liefert hier `"2025-03-01"` |

⚠️ **Erst mit diesen fünf Zeilen ist bewiesen, dass JEDER Mapper durch den Riegel geht.** Vorher war es
für `users`, `software_versions`, `device_events` und `loans` eine Zusage, die kein Test hält — und der
betriebliche Gegenhalt sieht sie nicht: A10/A11 (§2.4.6, §2.4.7) prüfen den **Quellarm** und können
einen Mapper-Fehler grundsätzlich nicht sehen.

**Der Test, der die Spalten-Reihenfolge fängt, ist kein Unit-Test.** Er hängt an der Fixture-Quelle
und steht in §1.8.

### 1.3.5 Die dritte Falle derselben Bauart: `null` in einem `{ mode: "boolean" }`-Feld

`alamos_integrated` (`schema.ts:29`) und `loanable` (`:32`) sind **nullable** — in der Quelle und im
Ziel (Spec 1 §2.5.1 deklariert beide ohne `.notNull()`). Der Importer liest sie **roh** über
better-sqlite3, also als `0 | 1 | null`.

⚠️ **`portal.ts:46-48` benutzt `!!row.is_public`, und das darf hier nicht übernommen werden.** Dort
ist es unbedenklich, weil die Spalten `notNull` sind. Hier faltet `!!null` das `null` zu `false` —
aus „TEI/Alamos **nicht erfasst**" wird „**nicht** integriert", aus „Ausleihbarkeit unbekannt" wird
„nicht ausleihbar". Paritätsgrün, aus demselben strukturellen Grund wie der Faktor 1000.

```ts
const zuBoolOptional = (v: 0 | 1 | null): boolean | null => (v === null ? null : v === 1);
```

**Ergänzend zu Spec 1 §2.2.5 ein zwölfter Test** (additiv, kein Widerspruch):
`toNeuesGeraet: alamos_integrated=null und loanable=null bleiben null` — Zusicherung
`g.alamosIntegrated === null` **und** `g.loanable === null`, gegen `ALT_GERAET_OHNE_ANGABE`.
`expect(g.loanable).toBeFalsy()` wäre **kein** Test: `false` besteht ihn. Dasselbe gilt für jede
nullable Textspalte, aber dort ist der Schaden sichtbar: `?? null` statt `?? ""`.

---

## 1.4 Je Tabelle: Quellabfrage, Ziel, Mapping

Fünf Tabellen wandern. Die Quellabfragen stehen in `lieseQuelle(quellDb)`, nach dem Muster
`feedback.ts:66-72` — aber mit Spaltennamen (§1.2).

### 1.4.1 `users` (3 Spalten)

```sql
SELECT sub, name, last_seen_at FROM users;
```

| Quelle | Ziel | Mapping |
|---|---|---|
| `sub` | `sub` (PK) | 1:1, **roh**. Der `pocketid:`-Präfix ist ein Artefakt des Kiosk (`pocket-id.service.ts:134`) und kommt hier nie an — `radio-admin` schreibt den `sub` schon roh (`schema.ts:79`) |
| `name` | `name` (NOT NULL) | 1:1 |
| `last_seen_at` | `lastSeenAt` (NOT NULL) | `msZuDatum("users.last_seen_at", …)` |

Keine Zuordnungstabelle `alt_sub → neu_sub`: die Pocket-ID-Instanz führt
`subject_types_supported: ["public"]`, der `sub` ist über beide OIDC-Clients identisch (Spec 1
§2.5.3). ⚠️ `select count(*) from users` ist **keine** Personenzahl — auch nicht im Protokoll.

⚠️ **Der Importer filtert `users` NICHT und repariert keine Waise.** Beide Richtungen gewollt: ein
`sub` in einer Auditspalte ohne `users`-Zeile bricht nichts (es gibt keinen FK auf `users.sub`, Spec 1
§2.3), die Oberfläche rendert dann die rohe Kennung. Eine `users`-Zeile ohne Vorkommen wandert
trotzdem mit — `lagerbuch` hat hier **gefiltert** (`lagerbuch-cutover.md:415`); dieses Kapitel nicht,
weil die Tabelle drei Spalten hat und ein Filter die Anzeige eines später wieder auftauchenden `sub`
verschlechtert, ohne etwas zu schützen. Der Fall, in dem es teuer wird, ist **U7**
(`AUTH_DEV_BYPASS`): dann tragen die Auditspalten synthetische Kennungen. **Das ist keine
Importentscheidung**, sondern eine Messung am Bestand — **A9** in §2.4.5, und sie läuft in der
Generalprobe, nicht im Fenster.

### 1.4.2 `software_versions` (6 Spalten)

```sql
SELECT id, value, created_at, created_by, sort_order, is_target FROM software_versions;
```

| Quelle | Ziel | Mapping |
|---|---|---|
| `id` | `id` (PK) | 1:1 (cuid2 aus `radio-admin/server/src/db/id.ts`) |
| `value` | `value` (NOT NULL, unique) | 1:1, **keine** Normalisierung. `software_versions_value_unique` besteht in beiden DBs; ein Trimmen erzeugte einen Konflikt, den es in der Quelle nicht gab |
| `created_at` | `createdAt` | `msZuDatum("software_versions.created_at", …)` |
| `created_by` | `createdBy` (NULL) | 1:1. **Tote Spalte, wandert trotzdem** — geschrieben (`softwareVersionRepo.ts:39`, `:53`), in keiner Projektion gelesen. Kriterium ist „wird sie **geschrieben**?", nicht „wird sie gelesen?" (§1.7) |
| `sort_order` | `sortOrder` (NOT NULL, default 0) | `row.sort_order ?? 0` — reine Anzeigereihenfolge (`schema.ts:48-51`) |
| `is_target` | `isTarget` (NOT NULL, default false) | `row.is_target === 1`. In der Quelle `NOT NULL` (`0002_numerous_mandroid.sql:2`), also **kein** `zuBoolOptional` |

⚠️ **Genau eine Zeile darf `is_target = 1` tragen, und keine Datenbank erzwingt das.**
`getTargetVersion` (`softwareVersionRepo.ts:63-70`) hat **kein** `ORDER BY`: bei zwei Marken
entscheidet die Reihenfolge, in der SQLite zufällig liefert, über den angezeigten Update-Stand
**jedes** Geräts. Der Importer wandert 1:1 und kann das nicht retten — **die Abwehr ist A2** (§2.4.2),
blockierend, sie muss **genau 1** ergeben.

### 1.4.3 `devices` (25 Spalten)

```sql
SELECT id, rufname, issi, tei, serial_number, device_type, status, location, assigned_to,
       software_version, last_updated_at, notes, hiorg_id, opta, funktion, hersteller,
       bedieneinheit, device_modes, alamos_integrated, loanable, update_note,
       created_at, updated_at, created_by, updated_by
FROM devices;
```

Die Reihenfolge in diesem `SELECT` ist die des **Ziels** (Spec 1 §2.5.1), nicht die physische der
Quelle — zulässig und erwünscht, weil namentlich gelesen wird und die Liste so Feld für Feld gegen
das Zielschema gegengelesen werden kann.

| Quelle | Ziel | Mapping |
|---|---|---|
| `id` | `id` (PK) | 1:1 |
| `rufname` | `rufname` | `?? null` |
| `issi` | `issi` (NOT NULL, unique) | 1:1. **Nicht** `tei` |
| `tei` | `tei` (NULL, **nicht** unique) | 1:1. Ein `unique()` im Ziel bräche beim zweiten Gerät ohne TEI (Spec 1 §2.5.1) |
| `serial_number`, `device_type`, `status`, `location`, `assigned_to`, `software_version`, `notes`, `hiorg_id`, `opta`, `funktion`, `hersteller`, `bedieneinheit` | gleichnamig | `?? null`, keine Normalisierung, kein Trim |
| `device_modes` | `deviceModes` | 1:1, **keine** Normalisierung. Klartext, komma-verbunden; genau eine Stelle liest und splittet ihn |
| `last_updated_at` | `lastUpdatedAt` (**`text`**) | `tagInBerlin(…)` — **Typwechsel** `integer` → `text YYYY-MM-DD` (Spec 1 §2.2.3) |
| `alamos_integrated` | `alamosIntegrated` | `zuBoolOptional` (§1.3.5) |
| `loanable` | `loanable` | `zuBoolOptional`. Stammdatum; war nie in `UPDATER_EDITABLE_FIELDS` (`schema.ts:30-32`) |
| `update_note` | `updateNote` | `?? null`. **Append-only** in der Quelle (`:33-36`) — genau die Spalte, die ein Zweitimport plattwalzt (§1.6) |
| `created_at` / `updated_at` | `createdAt` / `updatedAt` | `msZuDatum` mit dem jeweiligen Feldnamen |
| `created_by` / `updated_by` | `createdBy` / `updatedBy` | 1:1, **ohne** FK auf `users.sub`. Ein FK hier bräche jeden Kaltimport, dessen `sub`-Werte in der Suite noch nie eingeloggt waren — also jeden (Spec 1 §2.3) |

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
| `changed_at` | `changedAt` | `msZuDatum("device_events.changed_at", …)` |
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

Warum nötig: `source` ist in Drizzle ein Enum (`schema.ts:96`), in SQL aber nur
`` `source` text NOT NULL ``. Die Datenbank nimmt **jeden** String; ein fünfter Wert passiert Datenbank
**und** Typprüfung unbeanstandet und bricht erst in einem erschöpfenden `switch` der Oberfläche —
Monate später, in einer Detailansicht. ⚠️ **Der Riegel wirft, also muss er vor dem Fenster feuern** —
das ist **A5** (§2.4.5), blockierend, und Kapitel 1s Fassung `SELECT DISTINCT source FROM
device_events;` ist der Befehl dazu (W11: keine vierzehnte Abfrage).

### 1.4.5 `loans` (11 Quellspalten → 12 Zielspalten)

```sql
SELECT id, device_id, snapshot_call_sign, snapshot_serial_number, snapshot_device_type,
       borrower_name, borrowed_at, returned_at, return_note, created_at, updated_at
FROM loans;
```

| Quelle | Ziel | Mapping |
|---|---|---|
| `id` | `id` (PK) | 1:1 |
| `device_id` | `deviceId` (NOT NULL, **absichtlich kein FK**) | 1:1. Den FK **nicht** nachziehen: `schema.ts:106-110` begründet es im Quelltext (Cascade löscht Historie, Restrict blockiert das Ausmustern) |
| `snapshot_call_sign` | `snapshotCallSign` (NOT NULL) | 1:1. **Nicht** `borrower_name` |
| `snapshot_serial_number`, `snapshot_device_type` | gleichnamig | `?? null` |
| `borrower_name` | `borrowerName` (NOT NULL) | 1:1. Personenbezogen — der DSGVO-Grund der Retention |
| `borrowed_at` | `borrowedAt` | `msZuDatum(…)` |
| `returned_at` | `returnedAt` (NULL) | `msZuDatumOptional(…)` — **`NULL` heißt „aktive Leihe" und muss `NULL` bleiben.** Ein `?? new Date(0)` machte jede aktive Leihe zu einer 1970 zurückgegebenen |
| `return_note` | `returnNote` | `?? null` |
| — | **`zugangscodeId`** | **immer `null`** (Spec 1 §2.11 Zusage 7, B6). Die Spalte hat keine Quelle; sie trägt die **Herkunft des Zugangs**, nicht die Identität der Person |
| `created_at` / `updated_at` | `createdAt` / `updatedAt` | `msZuDatum` mit dem jeweiligen Feldnamen |

**`zugangscode_id` steht explizit als `null` im Mapper, nicht implizit durch Auslassen** — nur so ist
die Spalte in der Paritätssicht (§1.5.2) auf beiden Armen vorhanden, und nur dann fällt es auf, wenn
irgendetwas dort einen Wert hineinschreibt.

### 1.4.6 `zugangscodes` — nicht Teil des Imports

`zugangscodes` wird **nicht** importiert (Spec 1 §2.8.2 Nr. 5): in der Quelle gibt es nichts, was ihr
entspräche — der heutige QR-Mechanismus trägt den **einen** geteilten API-Token base64-kodiert als
URL-Parameter (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`), ohne
Ablauf und ohne Widerruf. Es gibt also keine Zeile zu übernehmen, sondern eine
**Verhaltensänderung** (Entscheidung 8, Ankündigungspflicht).

1. **Der Importer schreibt nie in `zugangscodes`.** Ein Import oder Seed, der Codes „als aktiv"
   anlegt, reaktiviert still jeden gesperrten Code (Spec 1 §2.5.6) — und zwar genau die, die gesperrt
   wurden, weil ein Kärtchen verschwunden ist.
2. **`zugangscodes` braucht trotz FK-Elternschaft keine Position in der Einfügereihenfolge.**
   `loans.zugangscode_id` ist für **jede** importierte Zeile `NULL`, und SQLite prüft eine
   Fremdschlüsselkante bei einem `NULL`-Kindwert nicht. Das steht hier, weil ein gewissenhafter Leser
   die Reihenfolge in §1.5.1 sonst für falsch hält.

⚠️ **Wann der erste Code entsteht, entscheidet NICHT dieses Kapitel** — siehe **W2**: er entsteht
**nach** dem Umschwenk, auf dem umgeschwenkten Host, durch die Person aus E8 (§4.8.2). Kapitel 1s
frühere Zusage („vor dem Umschwenken des Routers") ist nicht durchführbar.

---

## 1.5 Der Ablauf einer Ausführung

### 1.5.1 Einfügereihenfolge — Pflicht, nicht Stil

`foreign_keys = ON` ist in **beiden** Datenbanken scharf: `radio-admin/server/src/db/index.ts:28` und
`src/core/db/index.ts:19`. Die eine Kante `device_events.device_id → devices.id` bricht **hart** ab,
wenn ein Ereignis vor seinem Gerät eingefügt wird.

1. **`users`** — frei
2. **`software_versions`** — frei
3. **`devices`**
4. **`device_events`** — **nach** `devices`, erzwungen durch die FK-Kante
5. **`loans`** — formal frei, fachlich nach `devices`; `zugangscode_id` ist überall `NULL` (§1.4.6)

`zugangscodes` fehlt in der Liste (§1.4.6). **`api_tokens` fehlt ebenfalls** — B16, ausgeschrieben in
**W4**; Spec 1 §9.1s Einfügereihenfolge und ihre Paritätsbegründung sind an diesen zwei Zellen
**korrigiert** zu übernehmen, nicht abzuschreiben (Anhang B A1).

**Kein `PRAGMA defer_foreign_keys`.** Die Kantenmenge ist azyklisch und mit dieser Reihenfolge
erfüllbar; `lagerbuch` brauchte es wegen `lagerorte.templateId`, hier gibt es kein Gegenstück.

**Was das scheitern lässt und wie man es merkt:** ein `device_events`-Insert vor `devices` wirft
`SQLITE_CONSTRAINT_FOREIGNKEY` — der einzige **laute** Fehlschlag dieses Kapitels. Ein
Waisen-Ereignis in der Quelle löst denselben Fehler aus, und dagegen steht **A3** (§2.4.3). In der
Quelle kann es solche Zeilen eigentlich nicht geben (die Kante ist dort `ON DELETE CASCADE`), **aber
nur, solange `foreign_keys = ON` bei jedem Schreiben gesetzt war** — eine Laufzeiteigenschaft, kein
Schemainvariant. Die Abfrage bleibt.

### 1.5.2 Parität: ein Multiset über alle fünf Tabellen, mit Tabellen-Tag

Bauform aus `feedback.ts:238-262`: je Tabelle eine Paritätssicht, dann **ein** getaggtes Multiset über
alle Tabellen, dann **ein** `checkParity`.

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

Das `__table`-Tag ist Pflicht: `feedback.ts:235-237` begründet es — strukturell identische Zeilen
verschiedener Tabellen kollidieren sonst im Multiset. Hier ist der Fall real: eine `users`-Zeile und
eine `software_versions`-Zeile könnten beide auf `{id/sub, name/value, createdAt}` hinauslaufen.

**Vier Regeln für die fünf Paritätssichten** (Namen und Spaltenlisten der vier noch nicht
ausgeschriebenen: **⬜ L3**):

1. **Alle Spalten, namentlich, keine Auswahl.** 25 + 6 + 3 + 8 + **12** Felder. „Parität grün"
   zertifiziert dann die ganze Zeile, nicht eine handverlesene Teilmenge (`portal.ts:78-81`).
   `loans` bekommt **12** Felder, inklusive `zugangscodeId: r.zugangscodeId ?? null`.
2. **Jedes `timestamp`-Feld auf beiden Armen durch `sekunden()`.** Drizzle schreibt Sekunden, die
   Sub-Sekunden gehen beim Schreiben verloren — ohne diese Normalisierung scheitert ein
   zeichengleicher Import allein an Präzision (`portal.ts:66-71`).
   `const sekunden = (d: Date | null) => (d ? Math.floor(d.getTime() / 1000) : null);`
3. **`devices.lastUpdatedAt` wird NICHT umgerechnet** — es ist `text` (`YYYY-MM-DD`), `?? null`.
4. **Insert-Defaults normalisieren, nicht weglassen:** `sortOrder: r.sortOrder ?? 0`,
   `isTarget: r.isTarget ?? false` (`portal.ts:79-80` macht es genauso).

⚠️ **Der Paritätscheck vergleicht gegen den ganzen Zielbestand.** `feedback.ts:248-256` liest
`db.select().from(...).all()` ohne `WHERE`. Läuft der Import gegen eine Ziel-DB, in der schon Zeilen
stehen, ist Parität **rot** mit `missingInSource` — und das ist erwünscht: **der Paritätscheck ist
zugleich der Nachweis, dass die Ziel-DB leer war.** `zugangscodes` steht in keinem der beiden
Multisets; das ist **eine Frage der Vollständigkeit, nicht eine Erlaubnis** — beim Echtimport wird
`radio.db` vorher entfernt (§1.6.4), und damit kann es zu diesem Zeitpunkt gar keine
`zugangscodes`-Zeile geben.

> **Verbindlich für Kapitel 3 und 4:** Der Echtimport läuft gegen eine Ziel-`radio.db`, die außer den
> Migrationen **nichts** enthält. Läuft er gegen ein bespieltes Ziel, ist Parität rot, und Spec 1
> §2.8.4 gilt: der Rückweg ist die **leere** Ziel-DB, nicht ein zweiter Versuch. Der Runbook-Schritt
> heißt **„`radio.db` löschen, dann importieren"**, nicht „importieren".

### 1.5.3 Die Rahmenfunktion und der CLI-Aufruf

```ts
type RadioDb = BetterSQLite3Database<typeof schema>;
// Innerhalb von db.transaction() ist der Empfaenger NICHT die Datenbank, sondern der
// Transaktionskontext. Beide muessen in die Signatur, sonst kompiliert der Aufruf unten nicht.
type RadioTx = SQLiteTransaction<"sync", Database.RunResult, typeof schema,
                                 ExtractTablesWithRelations<typeof schema>>;

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

**Das ist die Aufrufform: dasselbe Skript, dasselbe positionale Argument, dieselbe
Snapshot-Datei — ein anderes `DATA_DIR` je Lauf.** ⚠️ **Nicht „zeichengleich":** der Pfad des
`DATA_DIR` unterscheidet Generalprobe und Echtlauf, und das ist der einzige Unterschied. Wer
„zeichengleich" wörtlich nimmt, sucht im Fenster nach einer Zeile, die es nicht gibt (damit ist
Teil 4s ⬜ 1
beantwortet). ⬜ **L6** bleibt: der genaue Wortlaut der Abschlusszeile.

Drei Abweichungen von `feedback.ts` und ihre Begründung:

* **Synchron, nicht `async`.** `feedback.ts:264` ist `async` ohne `await` im Rumpf; better-sqlite3 ist
  durchgehend synchron. Synchron heißt: `db.transaction()` ist benutzbar (die asynchrone Variante
  wäre es nicht).
* **Eine Transaktion um das Schreiben.** `portal.ts` und `feedback.ts` haben keine; hier hinterlässt
  ein FK-Abbruch in Schritt 4 einen halben Bestand. **Das ändert Spec 1 §2.8.4 nicht:** ein *roter
  Paritätscheck* bleibt „das Ziel ist beschrieben", weil die Prüfung außerhalb der Transaktion läuft —
  und das ist gewollt, denn nur so lässt sich das Ergebnis mit `sqlite3` nachsehen. ⚠️ Der Preis ist
  eine Signatur, die **zwei** Typen annimmt. Verbindlich ist die **Union**, nicht die Buchstabenzahl
  der Parameterliste: passt sie in der gebauten Drizzle-Version nicht, liest man sie am Typfehler des
  Aufrufs ab.
* **Die Zählzeile vor dem Schreiben.** Sie erspart dem Runbook eine zweite Abfragerunde und macht den
  `cp`-Fehler aus §1.1 an genau **einer** Stelle sichtbar.

**Der Aufruf steuert das Ziel über `DATA_DIR`** — `src/core/db/index.ts:8-10`,
`moduleDbPath("radio") === "${DATA_DIR}/radio.db"`:

```bash
# ⚠️ EIN Name fuer die Snapshot-Kopie, ueberall in dieser Spec: `radio-admin-snapshot.sqlite`,
# im ARBEITSVERZEICHNIS DES HOSTS — das ist die Datei, die §4.5 Schritt 2 erzeugt.
# Generalprobe: eigenes, HOST-seitiges DATA_DIR (Bind-Pfad, §3.1.2)
DATA_DIR="$GP/data" pnpm exec tsx scripts/import/radio.ts ./radio-admin-snapshot.sqlite

# Echtlauf im Fenster: Wegwerf-DATA_DIR auf dem HOST, danach traegt ein eigener
# Container die Datei ins Volume — ⛔ NICHT `DATA_DIR=/data` auf dem Host
# (§4.5 Schritt 4 schreibt die vier Handgriffe aus)
DATA_DIR="$IMP/data" pnpm exec tsx scripts/import/radio.ts ./radio-admin-snapshot.sqlite
```

⚠️ **`migrateAllModules()` legt die Ziel-DB an, wenn sie fehlt** — deshalb ist „`radio.db` löschen"
ein zulässiger Schritt und kein Sabotageakt. Umgekehrt: wer `DATA_DIR` vergisst, importiert nach
`./.data/radio.db` (`src/core/db/index.ts:6`), meldet Parität grün und hat nichts migriert. **Wie man
es merkt:** `sqlite3 "$DATA_DIR/radio.db" "select count(*) from devices"` **nach** dem Lauf, gegen die
Zählzeile der Ausgabe — **ein eigener Runbook-Schritt**, nicht eine Fußnote am Importschritt.

---

## 1.6 Idempotenz — der asymmetrische Fall

### 1.6.1 Die Konfliktstrategien

| Tabelle | Strategie | Grund |
|---|---|---|
| `users`, `software_versions`, `devices`, `loans` | `onConflictDoUpdate` per Primärschlüssel (`portal.ts:61`) | Zielt auf die leere Ziel-DB; der Upsert ist die Sicherung gegen einen **abgebrochenen** Lauf |
| `device_events` | **`onConflictDoNothing`** (`INSERT OR IGNORE`) | Die Tabelle ist ein **Journal**. Ein Upsert ist dort fachlich falsch — `lagerbuch-cutover.md:409` unterscheidet genau das |

Beide aus Spec 1 §2.8.4, unverändert.

### 1.6.2 Warum der naheliegende Test nichts beweist

Ein Test, der **zweimal dieselbe Quelle** importiert, ist bei Upsert-per-Primärschlüssel **immer**
grün — und bei `onConflictDoNothing` auch. Er prüft nicht Idempotenz, sondern dass `INSERT … ON
CONFLICT` existiert (`docs/radio-portierung-analyse.md:1292-1301`, Spec 1 §2.2.5). Der echte Fall ist
**asymmetrisch**: zwischen Generalprobe und Echtimport wurde weitergearbeitet — und er geht in
**beide** Richtungen falsch.

### 1.6.3 Der Test — und seine Zusicherung ist ein **Fehlschlag**

⚠️ **Das ist die Stelle, an der eine Spec sich selbst belügen kann.** Die naheliegende Zusicherung
lautet „der zweite Import ändert nichts". Sie ist **falsch**. Der Test schreibt das **beobachtete,
unerwünschte** Verhalten fest; ein Test, der Erfolg zusicherte, wäre eine Zusage, welche die Bauform
nicht hält.

**Fall A — `devices.update_note` wird plattgewalzt (still).**

```
1. Import gegen leeres Ziel. ALT_GERAET.update_note === "ISSI abweichend".
2. Im ZIEL anhaengen (der Weg, den die Suite baut):
   update devices set update_note = "ISSI abweichend\nAntenne getauscht" where id = "g-1";
3. Erneut importieren, dieselbe Quelle.
4. ZUSICHERUNG: geraet.updateNote === "ISSI abweichend"
   — der in der Suite angehaengte Satz ist WEG, ohne Fehler, ohne Warnung.
```

Grund: `update_note` ist in der Quelle **append-only** („never overwritten by the update flow",
`schema.ts:33-36`), und `onConflictDoUpdate` kennt kein Anhängen. **Wie man es im Betrieb merkt: gar
nicht.** Deshalb der Freeze.

**Fall B — `loans.returned_at` wird auferstehen gelassen (laut, aber zu spät).**

```
0. ARRANGE-Riegel gegen das ZIEL, VOR Schritt 4 — sonst tarnt sich eine fehlende
   Ziel-Migration als "expected throw, got none":
     select sql from sqlite_master where type='index' and name='loans_device_active_uidx';
   ZUSICHERUNG: genau ein Treffer, und der Text enthaelt "WHERE returned_at IS NULL".
   Kein Treffer heisst: 0001_loans_aktiv_uidx.sql fehlt oder ist verunglueckt (Spec 1 §2.6) —
   ein Migrationsdefekt, kein Importdefekt. Der Test meldet dann die Ursache selbst.
1. Import gegen leeres Ziel. ALT_LEIHE_AKTIV: device_id "g-1", returned_at NULL.
2. Im ZIEL zurueckgeben: update loans set returned_at = <jetzt> where id = "l-aktiv";
3. Im ZIEL eine NEUE Leihe auf dasselbe Geraet anlegen — voellig legitim, das Geraet ist frei.
4. Erneut importieren, dieselbe Quelle.
5. ZUSICHERUNG: der Import WIRFT, Meldung "UNIQUE constraint failed: loans.device_id".
```

**Beide Angaben sind gemessen**, mit `sqlite3` gegen genau diese DDL nachgestellt:

* **Der Verstoß fällt beim STATEMENT auf, nicht erst beim `COMMIT`.** Das `UPDATE`, das `returned_at`
  auf `NULL` zurücksetzt, bricht ab; `db.transaction()` rollt daraufhin zurück. Der Test darf also
  den `runRadioImport`-Aufruf umschließen.
* ⚠️ **Die Meldung nennt die SPALTE, nicht den Index:** `UNIQUE constraint failed: loans.device_id`.
  `loans_device_active_uidx` steht **nicht** darin. Ein `toThrow(/loans_device_active_uidx/)` wäre ein
  Test, der aus dem falschen Grund rot ist. Ob better-sqlite3 die Meldung verpackt: **⬜ L2.**

Der Mechanismus: `onConflictDoUpdate` setzt `l-aktiv.returned_at` zurück auf `NULL`, damit gibt es
**zwei** aktive Leihen auf `g-1`, und der partielle Unique-Index
`loans_device_active_uidx ON loans(device_id) WHERE returned_at IS NULL` weist die Schreibung ab. Der
Index ist in der Quelle handgeschrieben (`0003_kind_spot.sql`, Kommentar: „drizzle-kit cannot emit
partial indexes") und wandert nach Spec 1 §2.6 als `0001_loans_aktiv_uidx.sql` mit. Dieser Fall ist
der **einzige** der drei, den der Betrieb bemerkt — als Abbruch mitten im Fenster, bei bereits
beschriebenem Ziel.

**Fall C — `device_events` bleibt, wie das Journal es verlangt.**

```
1. Import gegen leeres Ziel.
2. Im ZIEL eine Journalzeile veraendern.
3. Erneut importieren, dieselbe Quelle.
4. ZUSICHERUNG: ereignis.newValue === "in der Suite geaendert" — INSERT OR IGNORE
   ueberschreibt eine bestehende Journalzeile NICHT. Und count(device_events) ist
   unveraendert, es entsteht KEIN Duplikat.
```

Fall C ist die Gegenprobe zu A: dieselbe Situation, andere Strategie, anderes Ergebnis. Er
verteidigt `onConflictDoNothing` gegen ein späteres „der Einheitlichkeit wegen".

### 1.6.4 Was daraus für das Runbook folgt

> **Verbindlich für Kapitel 3 und 4:** Der Importer ist **nicht** so idempotent, dass ein Zweitlauf
> gegen ein bespieltes Ziel gefahrlos wäre. Die Reihenfolge ist:
> **Generalprobe** gegen ein eigenes `DATA_DIR` und eine Schnappschuss-Kopie · **Freeze** ·
> **echter Schnappschuss** · **`radio.db` entfernen** · **Echtimport** · **Paritätscheck** ·
> **Zählvergleich**. Ein „nochmal drüberlaufen lassen" gibt es in diesem Cutover nicht; der Rückweg
> ist die leere Ziel-DB.

---

## 1.7 Was NICHT importiert wird — je Posten ein Satz

**1. `api_tokens`, die ganze Tabelle** — sie existiert im **Ziel nicht** (B16, Entscheidung 13; W4).
Produktiv trägt sie genau **einen** Konsumenten, den Alt-Kiosk mit statischem
`RADIO_ADMIN_API_TOKEN` (Betreiberantwort 3), und der verschwindet mit dem Port; der Klartext ist nie
gespeichert (`schema.ts:62`), eine mitgenommene Zeile wäre also ohnehin nicht einlösbar. **Ersatz
statt Migration:** vor dem Archivieren des Volumes wandert
`SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM api_tokens;` als **Textausgabe**
ins Protokoll (ohne `token_hash` — er ist wertlos und ein Geheimnisrest), dazu `SELECT COUNT(*)` als
Protokollzeile. Das ist **Abfrage T** in §5.2.2.

**2. `api_tokens.created_by` — totes Feld, stirbt mit seiner Tabelle.** Geschrieben
(`apiTokenRepo.ts:50`), in `listApiTokens` (`:79-86`) nicht gelesen. **Gegenbeispiel mit derselben
Eigenschaft und anderem Ergebnis:** `software_versions.created_by` **wandert** (§1.4.2) — das
Unterscheidungskriterium ist „**wird sie geschrieben?**", nicht „wird sie gelesen?": ein Leser lässt
sich nachbauen, ein verlorener Wert nicht.

**3. `AdminUser` aus `radio-inventar` — und damit der ganze Postgres.** Randbedingung 6.
Die Behauptung wird **gezählt**, nicht geglaubt (§5.2.3 P3); und aus einem Repository lässt sich der
Prod-Tabellenbestand grundsätzlich nicht ableiten — `pg_tables` ist die einzige verlässliche Quelle
(§5.2.3 P1).

**4. `zugangscodes`.** Kein Quellgegenstück — §1.4.6, mit den zwei Folgen, die dort stehen.

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

**Die Test-Quelle ist eine In-Memory-SQLite mit der ECHTEN produktiven DDL** — nicht ein
Objekt-Array. `feedback.ts:63-65` nennt genau diese Bauform.

`scripts/import/fixtures/radio-quelle-ddl.sql` enthält, **zeichengleich kopiert**:
`0000_confused_thena.sql` (die fünf `CREATE TABLE` plus die zwei Unique-Indizes plus
`device_events_device_id_idx`) · `0001_cooing_overlord.sql` · `0002_numerous_mandroid.sql` ·
`0003_kind_spot.sql` (`loans` samt `loans_device_active_uidx`) · `0004_polite_redwing.sql`. Als
Kommentarkopf steht die Herkunft in der Datei. **Drei Gründe, das zu kopieren statt zu erzeugen:**

1. **Nur so hat die Fixture die physische Spaltenreihenfolge der Produktion** — `update_note` auf 24,
   `tei` auf 25. Eine aus dem Zielschema erzeugte Fixture hätte die Zielreihenfolge, und der
   Reihenfolge-Test wäre vakuös.
2. **Nur so trägt die Quelle `loans_device_active_uidx` — und der Index beschränkt, wie die Fixture
   aussehen DARF:** je `device_id` höchstens **eine** Zeile mit `returned_at IS NULL`. `ALT_LEIHE`
   (zurückgegeben) und `ALT_LEIHE_AKTIV` (aktiv) dürfen deshalb beide auf `g-1` zeigen, eine zweite
   aktive nicht — sonst weist schon das **Einspielen** der Fixture sie ab. ⚠️ **Das ist NICHT der
   Index, an dem Fall B bricht.** Fall B (§1.6.3) spielt vollständig im **Ziel**: `onConflictDoUpdate`
   setzt `l-aktiv.returned_at` dort auf `NULL`, und abgewiesen wird die Schreibung vom partiellen
   Unique-Index der **Ziel**-Datenbank — dem, der nach Spec 1 §2.6 als `0001_loans_aktiv_uidx.sql`
   mitwandert. Wer Fall B rot sieht, sucht ihn **dort** und nicht in dieser Datei.
3. **`radio-admin` verschwindet.** Nach Kapitel 5 gibt es das Nachbarrepo nur noch archiviert; die
   DDL muss in **diesem** Repo liegen.

**Der Reihenfolge-Test, der aus §1.2 folgt** — er steht in Spec 1 §2.2.5 nicht und ist die zweite
additive Ergänzung dieses Kapitels:

| Test | fängt |
|---|---|
| `lieseQuelle liest namentlich: devices.tei steht in der Quelle an Position 25` | Zwei Zusicherungen. (a) `pragma table_info(devices)` der Fixture liefert `tei` als **letzte** und `update_note` als **vorletzte** Spalte — die Fixture ist also wirklich die produktive Form. (b) nach `lieseQuelle` + `toNeuesGeraet` gilt `g.tei === "7654321"` **und** `g.serialNumber === "SN-001"`. Ein positionsweiser Import liefert hier `tei === "SN-001"` |

**Die Fixtures liegen als `.ts`, nicht als `.json`** (`radio-quelle.ts` + `radio-quelle-ddl.sql`).
Grund: die Zeitstempel sind 13-stellige Zahlen, und `1_735_689_600_000` mit Unterstrichen ist
gegenlesbar, `1735689600000` nicht — im JSON gibt es die Trennstriche nicht. Bei einer Fixture, deren
ganzer Zweck das Gegenlesen von Zeitstempeln ist, ist das kein Formatgeschmack. ⚠️ **Benannte
Abweichung von der Dateiliste in Spec 1 §2.11** — Anhang B A3.

### Die Zählkette hat VIER Glieder, und das erste ist die laufende Datenbank

Die Sollwerte stehen nirgends in dieser Spec, weil sie nur der Server hergibt. Was hier steht, ist die
**Kette**:

```
(1) live /data/data.sqlite  →  (2) radio-snapshot.db  →  (3) Zaehlzeile des Importers  →  (4) Ziel-radio.db
```

```bash
# Das SQL ist in allen vier Gliedern dasselbe. Es steht EINMAL hier, damit die
# vier Befehle darunter sich nur im ZUGRIFF unterscheiden, nicht im Text:
Z6="select 'devices',count(*) from devices union all
    select 'software_versions',count(*) from software_versions union all
    select 'users',count(*) from users union all
    select 'device_events',count(*) from device_events union all
    select 'loans',count(*) from loans union all
    select 'api_tokens',count(*) from api_tokens;"
# Z5 = dieselbe Liste, aber OHNE die letzte Zeile (`api_tokens`) — von Hand
#      gekuerzt, nicht per Parameter-Expansion zusammengebastelt.

# ⚠️ ZUERST den echten Volume-Namen ablesen (E2), wie in §4.5 Schritt 2 — derselbe
# Handgriff, dieselbe Protokollzeile:
docker volume ls | grep -i radio-data
VOL=<die Zeile aus dem Befehl oben>

# Glied (1): gegen die LAUFENDE Alt-Datenbank. Spec 1 §2.8.3 sagt "gegen die ALT-SQLite".
# ⚠️ `/data/data.sqlite` ist ein CONTAINER-Pfad (radio-admin), auf dem Host gibt es ihn
# nicht. Dieselbe Mount-Form wie §4.5 Schritt 2, das Alt-Volume auf `/d`:
echo "$Z6" | docker run --rm -i -v "$VOL":/d alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /d/data.sqlite'

# Glied (2): dasselbe SQL gegen die Snapshot-Kopie. Sie heisst UEBERALL in dieser Spec
# `radio-admin-snapshot.sqlite` und liegt im ARBEITSVERZEICHNIS DES HOSTS — das ist die
# Datei, die §4.5 Schritt 2 mit `-v "$PWD":/out` tatsaechlich erzeugt:
echo "$Z6" | docker run --rm -i -v "$PWD":/out alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly /out/radio-admin-snapshot.sqlite'
# Ist `sqlite3` auf dem Host vorhanden, ist der kurze Weg zulaessig — dann steht die
# Vorbedingung "Host hat sqlite3 >= 3.27" im Protokoll daneben:
#   sqlite3 -readonly radio-admin-snapshot.sqlite "$Z6"

# Glied (4): dasselbe SQL mit $Z5 (OHNE die api_tokens-Zeile — die Tabelle existiert im
# Ziel nicht, W4; wer sie mitschreibt, bekommt "Error: no such table: api_tokens" und
# haelt es fuer einen Fehler) gegen die ZIEL-Datei.
#  - Generalprobe: `sqlite3 -readonly "$DATA_DIR/radio.db"` auf dem HOST — dort ist
#    DATA_DIR ein Bind-Pfad ($GP/data, §3.1.2), der Weg ist gueltig.
#  - Fenster: ⛔ NICHT auf dem Host. Die §2.2.2-Form gegen `$VOL_SUITE` — §4.5 Schritt 5 (a)
#    schreibt sie aus. `$DATA_DIR/radio.db` gibt es auf dem Host nicht (compose.yaml:79, :99).
```

⚠️ **Nur Glied (1)→(2) findet einen abgeschnittenen Schnappschuss.** Wer die Kette bei (2) beginnt,
vergleicht den Schnappschuss mit sich selbst; (2)→(3)→(4) beweist, dass der Importer alles
mitgenommen hat, **nicht**, dass der Schnappschuss vollständig war.

⚠️ **(1)→(2) schließt nur nach dem Freeze.** Daraus zwei verschiedene Ansprüche:

| Lauf | Was die Kette leistet |
|---|---|
| **Generalprobe** (Alt-App läuft weiter) | Nur **(2)→(3)→(4)** schließt. Das prüft den **Importer**. Über die Vollständigkeit des Schnappschusses sagt die Generalprobe **nichts** — und darf es nicht behaupten |
| **Echtlauf** (nach dem Freeze) | **Alle vier** Glieder schließen, und das ist der einzige Lauf, in dem eine Abschneidung überhaupt auffallen kann. Reihenfolge zwingend: **Freeze → Zählung (1) → `.backup` → Zählung (2)** |

**Die Zählung ist ein eigener, nummerierter Runbook-Schritt je Glied**, mit dem Befehl daneben, und
die vier Zahlenreihen stehen im Protokoll untereinander (Muster `lagerbuch-cutover.md:452`, `:544`).

---

## 1.9 Abweichungen dieses Kapitels

Drei, alle in **Anhang B** (A1 `api_tokens` aus Einfügereihenfolge und Parität · A2 „zehn statt elf" ·
A3 Fixture-Dateinamen). Zusätzlich **sieben Ergänzungen ohne Widerspruch**: der zwölfte Mapper-Test für
`null` in den zwei 0/1-Integern (§1.3.5), der Reihenfolge-Test (§1.8) und die **fünf** additiven
Zusicherungszeilen in §1.3.4 (⛛), die die **acht** Zeitachsenfelder außerhalb von `devices.created_at`
/`updated_at` decken — sieben Millisekunden-Spalten plus den Berliner Kalendertag von
`devices.last_updated_at`. **Die elf Namen aus Spec 1 §2.2.5 bleiben unverändert**; die fünf Zeilen
stehen als eigene Tabelle darunter, damit die Zahl „elf" weiter stimmt (W8 ist genau dieser
Fehlertyp). Kapitel 1s dritte
„Ergänzung" — die `DISTINCT source`-Vorabfrage — ist **keine**: sie ist A5 (W11).

## 1.10 Die Dateien dieses Kapitels

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

**Alle drei müssen VOR der ersten Generalprobe grün sein** (§3.6).

---

# 2. Paritaet, Feldstichproben und die Abfragen vor dem Import

Dieses Kapitel liefert die Prüfungen, die **vor** dem Umschwenk laufen müssen, und sagt bei jeder,
was sie beweist, was sie **nicht** beweist, was sie scheitern lässt und wie man das merkt. Es führt
den Import nicht durch und schwenkt keinen Router.

## 2.1 Was Paritaet beweist — und was sie strukturell nicht sehen kann

### 2.1.1 Der Mechanismus, in Zeilen

`scripts/import/parity.ts` vergleicht **Multimengen von Zeilen-Hashes** (Zeilenzahlen nachgeschlagen,
W9):

* `rowChecksum` (`:30-32`) serialisiert eine Zeile wertkanonisch (`canon`, `:16-28`: Schlüssel
  sortiert, `Date → ISO`, `bigint → String`) und hasht das Ergebnis mit `sha256`.
* `multiset` (`:34-41`) zählt gleiche Hashes.
* `checkParity` (`:43-56`) meldet `ok` genau dann, wenn keine Prüfsumme auf einer Seite fehlt **und**
  `source.length === target.length` (die Bedingung steht in **`:50`**).
* `assertParity` (`:58-65`) wirft mit dem Text `Import ABORTED — no cutover.` (`:63`).

Was das leistet, ist echt und nicht klein: **der Datenbank-Rundlauf über alle Spalten der
Paritätssicht.** Ein verlorener Insert, eine vertauschte Zeilenreihenfolge, eine auf dem Schreibweg
abgeschnittene Spalte, ein Datentyp, den SQLite anders zurückgibt als er hineinging — das alles wird
rot. Und weil die Sicht **alle** Spalten führt und nicht eine Auswahl (`portal.ts:78-80`), gilt es für
die ganze Zeile.

### 2.1.2 Der blinde Fleck: beide Arme kommen aus derselben Funktion

Spec 1 §2.2.4 legt `paritaetsSichtGeraet(r: NeuesGeraet | Geraet)` fest — **eine** Funktion, deren
Parametertyp die Vereinigung aus Quellarm und Zielarm ist — und sie rechnet auf beiden Armen mit
demselben `sekunden`. Der Quellarm ist also nicht die Alt-Zeile, sondern `toNeuesGeraet(altzeile)`.
**Die rohe Alt-Ganzzahl betritt den Vergleich nie.**

| Fehlerklasse | sieht die Paritaet? | warum |
|---|---|---|
| Zeile fehlt / zu viel | **ja** | `source.length !== target.length` (`parity.ts:50`) |
| Wert auf dem Schreibweg verändert | **ja** | Hash weicht auf einem Arm ab |
| Präzisionsverlust durch `mode: "timestamp"` | **nein, absichtlich** | beide Arme werden auf Sekunden normalisiert (`portal.ts:66-71`) |
| **Faktor 1000** (ms als Sekunden gelesen) | ⛔ **nein** | ein Fehler in `msZuDatum` wirkt auf beiden Armen; identischer Hash |
| **Zwei Spalten vertauscht** (`issi`↔`tei`) | ⛔ **nein** | der Mapper vertauscht sie beidseitig |
| Spalte gar nicht in der Sicht | ⛔ **nein** | sie geht in keinen Hash ein |
| Fachliche Invariante verletzt (`is_target` zweimal) | ⛔ **nein** | 1:1 übernommen ist 1:1 grün |

Das ist keine Merkregel, sondern die Begründung für den Rest dieses Kapitels: **für die vier
⛔-Zeilen gibt es kein Tor außer dem Mapping-Unit-Test (§1.3.4) und den Handgriffen hier.**

### 2.1.3 Zwei Ablaufregeln, die aus dem Mechanismus folgen

1. ⚠️ **Ein roter Paritätscheck heißt NICHT „es ist nichts passiert".** `portal.ts:105-107` sagt es
   wörtlich. Der Rückweg nach einem roten Check ist die **gelöschte, leere Ziel-DB** und ein neuer
   Lauf — nicht ein zweiter Versuch auf denselben Bestand. **Der Schritt „`radio.db` löschen,
   Migrationen neu fahren" muss im Fenster benannt dastehen, nicht improvisiert werden** (§4.5
   Schritt 4, §3.5 Klasse D).
2. **Paritaet ist die letzte Prüfung, nicht die erste.** Alle Abfragen aus §2.4 laufen **vor** dem
   Import, weil `msZuDatum` **wirft**. Ein Abbruch dort ist in der Generalprobe eine halbe Stunde
   Arbeit und im Echtlauf ein Abbruch um 23 Uhr.

### 2.1.4 Die fuenf Paritaetssichten

Spec 1 §2.2.4 schreibt **eine** von fünf aus (`paritaetsSichtGeraet`, 25 Spalten, „alle 25 Spalten
namentlich, keine Auswahl"). Die vier übrigen sind **⬜ L3**. Abzulesen ist je Sicht: (a) trägt sie
**jede** Spalte der Zieltabelle, (b) läuft jede `mode: "timestamp"`-Spalte durch `sekunden()`,
(c) bleibt `devices.last_updated_at` **unumgerechnet**. Fehlt eine Spalte in einer Sicht, ist die
Paritaet für sie blind, **und das sieht kein Test** — deshalb ist das ein Ablese-, kein Rateschritt.

---

## 2.2 Die Feldstichproben — der Handgriff, der den blinden Fleck schliesst

### 2.2.1 Die Form: roh gegen roh, mit dem Faktor sichtbar im Befehl

Eine Stichprobe, die durch den Mapper liest, wiederholt nur die Paritaet. Verbindlich ist deshalb:

> **Der Quellarm liest die Alt-Ganzzahl, der Zielarm liest den Zielwert, und die Umrechnung steht als
> Rechnung im Protokoll — nicht in einer Funktion.**

Für jede Stichprobe entstehen drei Protokollzeilen: `quelle`, `ziel`, `rechnung`.

```
loans/returned_at  id=<id>
  quelle_ms = 1771000000000        (radio-admin-snapshot.sqlite)
  ziel_s    = 1771000000           (radio.db, Pruefcontainer)
  rechnung  = quelle_ms / 1000 == ziel_s   -> ok
```

Für ein Textfeld entfällt die Rechnung, und geprüft wird **zeichengleich**, nicht „sieht richtig aus".

**`devices.last_updated_at` ist der Sonderfall, und er ist nur halb prüfbar.** Quelle ist epoch-ms,
Ziel ist TEXT `YYYY-MM-DD` **in `Europe/Berlin`** (`tagInBerlin`). `sqlite3` kennt `Europe/Berlin`
nicht, und `'+1 hour'` ist über die Sommerzeitgrenze falsch — der erwartete Wert ist **nicht** per SQL
berechenbar. Verbindlich: **beide Kandidatentage nebeneinander ausgeben und den Zielwert gegen sie
stellen.**

```sql
-- QUELLE: die zwei moeglichen Kalendertage, nebeneinander.
select id, last_updated_at,
       date(last_updated_at/1000, 'unixepoch')            as utc_tag,
       date(last_updated_at/1000, 'unixepoch', '+1 day')  as utc_tag_plus1
  from devices where id = '<id>';

-- Die einzige diskriminierende Zeile: 22:00 UTC oder spaeter (Formular-Weg).
select id, last_updated_at, time(last_updated_at/1000,'unixepoch') as uhrzeit_utc
  from devices
 where last_updated_at is not null
   and last_updated_at % 86400000 >= 79200000
 limit 1;
```

⚠️ **Findet dieser Filter keine Zeile, ist `tagInBerlin` an den Produktionsdaten nicht prüfbar**, und
die Zusage ruht allein auf den drei `tagInBerlin`-Unit-Tests (§1.3.4). Das ist eine Protokollzeile,
kein grüner Haken. Grund: welcher der drei Alt-Schreibwege eine Zeile geschrieben hat, steht
**nirgends in den Daten** — die Uhrzeit ist der einzige Indikator (22:00/23:00 = Formular, 00:00 =
CSV, sonst Update-Karte). Und der Filter ist ein **Kandidaten**filter: im Winter liegt lokale
Mitternacht bei 23:00 UTC. Deshalb steht neben dem Zielwert die **Uhrzeit** im Protokoll, nicht nur
der Tag.

### 2.2.2 Die zwei Arme sind asymmetrisch — und das ist der Kern dieses Cutovers

| Arm | wie gelesen wird | warum nicht anders |
|---|---|---|
| **Quelle** | `sqlite3 radio-admin-snapshot.sqlite '<SELECT>'` gegen die **Snapshot-Kopie**, nie gegen den laufenden Stack (Spec 1 §9.3.4). Zusätzlich **darf** hier die Alt-Oberfläche als zweite Meinung dienen: sie läuft während der Generalprobe noch unter `radio.iuk-ue.de` | Der Alt-Kiosk ist bis zum Umschwenk der Betrieb |
| **Ziel** | ausschliesslich `sqlite3` in einem **Container ohne Traefik-Labels** | ⚠️ Der Zielarm hat **keine** Adresse. „Seite aufmachen und hinsehen" ist auf dem Zielarm **keine** verfügbare Prüfung |

Der Lesebefehl auf dem Zielarm, mit dem Schritt, der ihm vorausgeht:

```bash
# ⚠️ ZUERST den ECHTEN Volume-Namen ablesen und ins Protokoll schreiben — compose
# praefixt deklarierte Volumes mit dem Projektnamen. Ein erfundener Name legt ein
# NEUES, LEERES Volume an, und `sqlite3` liefert dann null Zeilen OHNE Fehler.
docker volume ls | grep -i suite
VOL_SUITE=<die Zeile aus dem Befehl oben>     # in Prod: suite_data (compose.yaml:252-254)

# Kein `-p`, KEINE Traefik-Labels, kein Netz-Alias, kein `--network` auf das Proxy-Netz.
# Dieser Container BOOTET NICHT — er ist alpine plus sqlite3 und nichts sonst.
# Ein Aufruf je Abfrage, SQL ueber stdin — so muss nichts durch zwei Shell-Ebenen
# gequotet werden:
echo "select count(*) from devices;" | docker run --rm -i \
  -v "$VOL_SUITE":/data alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly -header -column /data/radio.db'
```

⚠️ **`:ro` und `-readonly` sind nicht Kosmetik — aber sie haben einen Preis, der benannt sein muss:**
SQLite im WAL-Modus braucht zum **Lesen** eine beschreibbare `-shm`-Datei. Auf einem `:ro`-Mount
scheitert der Befehl dann mit „unable to open database file" oder „attempt to write a readonly
database", **obwohl die Datenbank in Ordnung ist**. Wer das für einen Datenbefund hält, sucht am
falschen Ort. Der Ausweg **hängt vom Lauf ab** (W5, Residuum 2):

| Lauf | Form | Grund |
|---|---|---|
| **Generalprobe** | `file:/data/radio.db?immutable=1` auf `:ro` | Kein anderer Prozess hängt an der Datei — `immutable=1` liest ohne jede Schreibdatei |
| **Fenster** (nach §4.5 Schritt 7) | Mount **ohne** `:ro`, weiter mit `sqlite3 -readonly`. ⛔ **Kein `immutable=1`** | Der reguläre Stack hält `radio.db` offen (Migrationen, Health, Boot-Haken) — „bedient keine Domain" ist **nicht** „hat die Datei nicht offen". Zurückbleibende `-wal`/`-shm` sind harmlos und gehören ins Protokoll |

⚠️ **Ein leeres Ergebnis ist hier ein Verdacht, kein Befund.** `openModuleDatabase` legt das
Verzeichnis per `mkdirSync(dir, {recursive:true})` an (`src/core/db/index.ts:12-22`), better-sqlite3
die Datei — **ein vertipptes `DATA_DIR` oder ein falscher Volume-Name ergibt eine nagelneue, leere
`radio.db`, und jede Abfrage antwortet `0`, nicht „Datei fehlt".** Deshalb geht der Zählung aus §2.6
immer die Ablesung des Volume-Namens voraus.

### 2.2.3 Welche Zeile man waehlt — und warum nicht die naechste

Eine Stichprobe auf einer Zeile, deren Felder alle `NULL` sind, ist unter **jedem** Zuordnungsfehler
grün. Und eine Zeile, in der zwei verwechselbare Spalten denselben Wert tragen, besteht **jede**
Vertauschung. Die Auswahl ist deshalb ein Filter mit vier Regeln — die Produktionsfassung derselben
Regel, die §1.3.4 den Fixtures auferlegt.

**Regel 1 — die Zeile mit den meisten gesetzten Feldern.**

```sql
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
mit `0001`. Die älteste Zeile ist die einzige, die den **Backfill- und NULL-Weg** durchläuft, den
jüngere Zeilen immer gefüllt haben.

**Regel 3 — je verwechselbarem Paar eine Zeile, in der die Glieder VERSCHIEDEN sind.** Es sind
**fünf** Paare bzw. Tripel, nicht vier (W8); sie stehen namentlich in
`docs/radio-portierung-analyse.md` Kap. 4 Pflicht 4:

| Paar / Tripel | Beleg | Auswahl-SQL |
|---|---|---|
| `issi` ↔ `tei` | `schema.ts:7`, `:11` | `select id, issi, tei from devices where tei is not null and tei <> issi limit 1;` |
| `created_at` ↔ `updated_at` ↔ `last_updated_at` | `:37`, `:38`, `:18` | `select id, created_at, updated_at, last_updated_at from devices where updated_at <> created_at and last_updated_at is not null limit 1;` |
| `snapshot_call_sign` ↔ `borrower_name` | `:122`, `:125` | `select id, snapshot_call_sign, borrower_name from loans where borrower_name <> snapshot_call_sign limit 1;` |
| `alamos_integrated` ↔ `loanable` | `:29`, `:32` | `select id, alamos_integrated, loanable from devices where alamos_integrated <> loanable limit 1;` |
| `serial_number` ↔ `hiorg_id` ↔ `opta` | Pflicht 1 | `select id, serial_number, hiorg_id, opta from devices where serial_number is not null and hiorg_id is not null and opta is not null and serial_number <> hiorg_id and hiorg_id <> opta limit 1;` |

**Der Zielarm braucht keine eigene Abfrage — und das ist ein Befund, nicht eine Bequemlichkeit.** Die
SQL-Spaltennamen sind auf **beiden** Armen zeichengleich: Spec 1 §2.5.1–§2.5.5 deklariert sie mit
denselben snake_case-Zeichenketten wie die Quelle (`text("snapshot_call_sign")`,
`integer("borrowed_at", { mode: "timestamp" })`):

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
auf dem Zielarm `snapshotCallSign` schreibt, bekommt „no such column" (laut, harmlos); wer zwei Namen
dabei vertauscht, bekommt eine grüne Stichprobe (still, teuer).

**Genau zwei Spalten weichen ab, und beide sind benannt:**

* `devices.last_updated_at` — Typ geändert (`integer` ms → TEXT `YYYY-MM-DD`), siehe §2.2.1. Steht
  deshalb **nicht** in der symmetrischen Liste.
* `loans.zugangscode_id` — im Ziel **neu** (B6) und in der Quelle nicht vorhanden. Eigene
  Protokollzeile auf dem Zielarm: `select count(*) from loans where zugangscode_id is not null;` —
  **muss `0` sein.** Ein Wert ≠ NULL hieße, dass zwischen Import und Prüfung schon über die Suite
  ausgeliehen wurde — im Fenster ein **Alarm**, kein Datenbefund.

⚠️ **Liefert eine dieser Abfragen keine Zeile, ist das ein Protokolleintrag, kein Freibrief.** „Kein
Gerät hat `alamos_integrated <> loanable`" heißt: die Vertauschung dieser zwei 0/1-Ganzzahlen ist an
den Produktionsdaten **nicht prüfbar**, und das Tor bleibt allein der Unit-Test. Das muss dastehen,
sonst hält jemand später eine ungeprüfte Zusage für geprüft.

**Regel 4 — je Tabelle mindestens eine Zeile, und diese hier zwingend:**

| Tabelle | Pflicht-Stichprobe | Grund |
|---|---|---|
| `devices` | Regel-1-Zeile + älteste Zeile + die fünf Paar-Zeilen aus Regel 3 | 25 Spalten, alle Verwechslungspaare liegen hier |
| `software_versions` | **die Zeile mit `is_target = 1`**, zwingend | Der Update-Stand ist berechnet, nicht gespeichert (`schema.ts:53-56`). Kippt diese eine Zeile, kippt der Status **jedes** Geräts |
| `users` | die Zeile mit dem grössten `last_seen_at` + eine mit dem kleinsten | 3 Spalten; `sub` ist PK und steht in sechs Auditspalten — ein verändertes `sub` entkoppelt das Journal von Personen |
| `device_events` | **eine Zeile je vorkommendem `source`-Wert** (`select source, min(id) from device_events group by source;`) | `source` ist ein TS-Enum **ohne** DB-CHECK (`schema.ts:96`) |
| `loans` | eine **abgeschlossene** (`returned_at is not null`) + eine **aktive** (`returned_at is null`) | Die zwei Fälle verhalten sich unter dem Faktor-1000-Fehler **gegensätzlich** (§2.3) |

### 2.2.4 Wann die Stichproben laufen — zweimal, nicht einmal

1. **In der Generalprobe**, gegen die Ziel-DB aus der Snapshot-Kopie. Hier ist Zeit, ein Ergebnis zu
   verstehen.
2. **Im echten Fenster**, gegen `radio.db`, nach dem Import und **vor** dem Umschwenk. Die
   Auswahl-SQLs werden dort **erneut** gefahren und die `id`s neu abgelesen: **die
   Stichproben-`id`s der Generalprobe sind Protokoll, keine Eingabe für den Echtlauf.**

---

## 2.3 Die Zeitstempel-Stichprobe — sie braucht eine eigene Form

Der Faktor-1000-Fehler ist die einzige Fehlerklasse dieses Ports, die **paritätsgrün ist UND Daten
löscht** (Randbedingung 3). Spec 1 §2.7.2 entschärft die Sofort-Übernahme (Erstlauf 1440 Minuten,
B5) — das verschiebt den Löschzeitpunkt hinter das Rückwegfenster, es beseitigt den Fehler nicht.
**Die Stichprobe muss ihn beseitigen.**

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
Datum aus der Betriebszeit von `radio-admin` zeigen; `gelesen_als_s` muss **1970** zeigen. Zeigen
beide Spalten dasselbe, ist die Grundannahme des ganzen Imports falsch, und dann wird der Cutover
**abgesagt, nicht angepasst** (dieselbe Konsequenz wie bei A6).

```sql
-- ZIEL: derselbe Datensatz, roh.
select id, borrowed_at, returned_at,
       datetime(returned_at, 'unixepoch') as gelesen_als_s
  from loans where id = '<id aus dem Quellarm>';
```

```
loans/returned_at  id=<id>
  quelle_ms  = <Zahl>            gelesen_als_ms = <Datum in der Betriebszeit>
  ziel_s     = <Zahl>            gelesen_als_s  = <dasselbe Datum>
  rechnung   = quelle_ms / 1000 == ziel_s
  Jahr       = <Jahr>            ⛔ 1970 heisst: Faktor-1000-Fehler, ABBRUCH
```

**Warum die jüngste und nicht irgendeine:** sie ist die eine Zeile, die der Retention-Purge
**garantiert nicht** anfassen darf. Fällt sie nach dem ersten Purge-Lauf weg, ist bewiesen, dass nicht
die Retention gelöscht hat, sondern der Faktor.

### 2.3.2 Wert 2 — der, bei dem beide Lesarten plausibel aussehen

Ein einziger Wert genügt nicht, denn nicht jeder Fehler landet in 1970. `msZuDatum` lässt jeden Wert
in `[1e12, 4e12]` durch (`MS_MIN` = 2001-09-09, `MS_MAX` = 2096-10-02). Der Riegel ist absichtlich
weit — und deshalb blind gegen Werte, die **innerhalb** der Spanne falsch sind:

```sql
-- QUELLE: die AELTESTE abgeschlossene Leihe, beide Lesarten daneben.
select id, returned_at,
       datetime(returned_at/1000, 'unixepoch') as gelesen_als_ms,
       datetime(returned_at,      'unixepoch') as gelesen_als_s
  from loans where returned_at is not null
 order by returned_at asc limit 1;
```

Hier ist die zweite Lesart **nicht** offensichtlich absurd, und genau das ist der Punkt: ein Wert knapp
über `MS_MIN` (~2001) passiert den Riegel, ist nicht 1970 und ist für `radio-admin` fachlich
**unmöglich**. Dieselbe Doppeldeutigkeit trägt `users.last_seen_at`.

**Der Vergleich, der diesen Wert prüfbar macht, ist deshalb nicht die Lesart, sondern die
Alt-Anwendung.** Für diesen einen Datensatz wird die Leihe in der Alt-Oberfläche unter
`radio.iuk-ue.de` aufgeschlagen und das dort angezeigte Rückgabedatum ins Protokoll geschrieben — das
ist der einzige Arm dieses Cutovers, der überhaupt eine Oberfläche hat (§2.2.2). **Wert 1 beweist die
Größenordnung ohne Fremdquelle, Wert 2 beweist den Wert gegen die Fremdquelle.** Wer nur einen von
beiden nimmt, hat eine der zwei Fehlerformen ungeprüft.

### 2.3.3 Der Fehlgriff, der diese Stichprobe wertlos macht

⚠️ **Die Zeile, die ein Mensch in der Alt-Oberfläche zuerst sieht, ist eine AKTIVE Leihe — und deren
`returned_at` ist `NULL`.** `NULL` ist auf beiden Armen `NULL`, unter jeder Lesart, bei jedem Faktor.
Eine Stichprobe auf einer aktiven Leihe ist **vakuös** und prüft ausgerechnet das Feld nicht, das der
Fehler zerstört. Dass aktive Leihen den Purge überleben, verstärkt den Irrtum: nach dem Löschlauf
sieht der Kiosk „richtig" aus, weil das, was er anzeigt, das Überlebende ist.

**Verbindlich: die Zeitstempel-Stichprobe kommt aus `returned_at IS NOT NULL`.** Die aktive Leihe wird
zusätzlich gezogen (Regel 4), aber für `borrowed_at` und `created_at`, nicht als
Zeitstempel-Stichprobe.

### 2.3.4 Diese Stichprobe ist die Kontrollgruppe fuer den Retention-Purge

Der erste Purge-Lauf liegt 1440 Minuten nach dem Boot (B5). Danach hat `loans` weniger Zeilen. Um
„planmäßig gelöscht" von „Faktor-1000-Fehler" **nach** dem Umschwenk noch unterscheiden zu können,
müssen **vier** Angaben vor dem Umschwenk im Protokoll stehen:

1. `select count(*) from loans where returned_at is not null;` — abgeschlossene Leihen gesamt
2. die Retention-Zahl **A8** (§2.4.5) — als **Vorhersage** gekennzeichnet (W3)
3. `id` **und rohes** `returned_at` der **jüngsten** abgeschlossenen Leihe (§2.3.1)
4. `id` und rohes `returned_at` der **ältesten** abgeschlossenen Leihe (§2.3.2)

**Mit diesen vier Angaben ist die Nachkontrolle eine Subtraktion.** Verlorene Zeilen == Retention-Zahl
→ planmäßig. Zeile 3 fehlt → **Faktor-1000**, weil die jüngste abgeschlossene Leihe unter keinem
korrekten Cutoff löschbar ist. `count == 0` → alles gelöscht, sofortiger Rückweg „Router zurück".
**Ohne die vier Zeilen ist dieselbe Beobachtung nicht deutbar.**

⚠️ Die Retention-Zahl der Generalprobe **veraltet um die Länge der Freeze plus die des Fensters** —
ihr Cutoff wandert mit `now`. Sie wird im echten Fenster **erneut** gezählt. **Für den Vergleich
Quelle↔Ziel gilt dagegen `<freeze_iso>` in beiden Armen** (W3, Abfrage R in §5.2.2).

---

## 2.4 Die Abfragen VOR dem Import, gegen die Alt-Datenbank

**Diese Liste ist ein Superset.** Spec 1 §9.4.1 ist „vollstaendig und woertlich in das
Cutover-Runbook zu uebernehmen — nicht zusammenfassen, nicht verlinken", und „wo Spec 2 von dieser
Liste abweicht, ist es ein Fehler in Spec 2". **A1–A9 sind die acht Abfragen aus §9.4.1** in ihrer
Reihenfolge und mit ihrem SQL; **A10** ist der Spannen-Riegel aus §2.8.3 Nr. 6; **A11–A13 sind
Ergänzungen** und als solche markiert. Die blockierende Einstufung ist in **W11** einmal und nach
A-Marken benannt.

**Vorbedingung für alle:** sie laufen gegen die **Snapshot-Kopie**, nie gegen einen laufenden Stack.
Der Auszug entsteht **einmal je Lauf** mit `.backup` (W1) — ⛔ **ohne** `docker compose stop`:

```bash
docker volume ls | grep -i radio-data          # ⚠️ compose praefixt mit dem Projektnamen
VOL=<die Zeile aus dem Befehl oben>            # → E2, ins Protokoll
docker run --rm -v "$VOL":/d -v "$PWD":/out alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1;
         sqlite3 /d/data.sqlite ".backup /out/radio-admin-snapshot.sqlite"'
```

⚠️ **Warum kein Stopp:** `.backup` arbeitet gegen die laufende Datenbank und nimmt den WAL-Zustand
mit; ein Stopp wäre unnötig, und der **Neustart danach** löscht Historie (W1). Der Freeze ist ein
Schritt des Fensters (§4.5 Schritt 1), nicht der Generalprobe.

Alle folgenden Abfragen laufen als `sqlite3 radio-admin-snapshot.sqlite '<SQL>'`.

### 2.4.1 A1 — Zeilenzahlen je Tabelle (§9.4.1)

```sql
select 'devices',           count(*) from devices
union all select 'software_versions', count(*) from software_versions
union all select 'api_tokens',        count(*) from api_tokens
union all select 'users',             count(*) from users
union all select 'device_events',     count(*) from device_events
union all select 'loans',             count(*) from loans;
```

**Zweck:** die Sollwerte, gegen die §2.6 nach dem Import zählt. **Kein Erwartungswert im Text** — es
sind sechs Protokollzeilen. **Fünf** davon sind Paritäts-Sollwerte; `api_tokens` ist eine reine
**Protokollzeile** für den Abbau (W4), und die Textausgabe dazu ist **Abfrage T** in §5.2.2.

⚠️ Fehlt eine der sechs Tabellen im Snapshot („no such table"), ist der Snapshot **vorbaselinig** —
genau der Zustand der lokalen `radio-admin/data/data.sqlite` (Randbedingung 8). Dann ist die falsche
Datei kopiert worden; Abbruch und neuer Auszug.

### 2.4.2 A2 — genau ein Update-Ziel ⛔ **blockierend**

```sql
select count(*) from software_versions where is_target = 1;
```

**MUSS genau `1` sein.** Der Update-Stand ist **berechnet, nicht gespeichert** (`schema.ts:53-56`),
und es gibt keinen DB-Constraint dafür: kein partieller Unique, kein Trigger, kein CHECK — die
Invariante lebt allein in einer Anwendungstransaktion (`softwareVersionRepo.ts:81-87`), und der Leser
`getTargetVersion` (`:63-70`) nimmt `.limit(1).get()` **ohne `ORDER BY`**. Bei `0` oder `2` kippt der
angezeigte Update-Status **jedes** Geräts, und **keine Paritaet sieht es**.

### 2.4.3 A3 — Waisen in `device_events` ⛔ **blockierend**

```sql
select count(*) from device_events e
  left join devices d on d.id = e.device_id
 where d.id is null;
```

**MUSS `0` sein.** `foreign_keys = ON` gilt auf beiden Seiten
(`radio-admin/server/src/db/index.ts:28`, `src/core/db/index.ts:19`), und
`device_events.device_id → devices.id ON DELETE CASCADE` ist die einzige `FOREIGN KEY`-Zeile aller
fünf Migrationen (`schema.ts:88-90`). **Ein Treffer heißt: der Import bricht hart ab** — besser jetzt
als im Fenster.

### 2.4.4 A4 — zwei aktive Leihen auf einem Geraet ⛔ **blockierend**

```sql
select device_id, count(*) from loans
 where returned_at is null group by device_id having count(*) > 1;
```

**MUSS leer sein.** Sonst lässt sich `loans_device_active_uidx` im Ziel nicht anlegen — der
**partielle** Unique-Index `ON loans (device_id) WHERE returned_at IS NULL`, den `drizzle-kit` nicht
emittieren kann und der in `0003_kind_spot.sql` handgeschrieben am Ende steht (Analyse Kap. 5 Falle 2).
Zweite Wirkung derselben Falle: `onConflictDoUpdate({ target: loans.deviceId })` kann einen partiellen
Index **nicht** treffen — Historie im Bulk ist gefahrlos, zwei **aktive** Leihen auf einem Gerät
schlagen hart fehl.

### 2.4.5 A5 bis A9 — die vierte Invariante und die vier Belege

```sql
-- A5 (§9.4.1 Invariante 4) ⛔ blockierend. Kapitel 1s Fassung ist der informativere Befehl (W11):
select distinct source from device_events;
--   Ergebnis MUSS eine Teilmenge von {manual, csv-import, create, update-note} sein.
-- Aequivalent, in der Form aus §9.4.1 (MUSS leer sein):
select distinct source from device_events
 where source not in ('manual','csv-import','create','update-note');
```
Das Enum steht nur im Quelltext (`schema.ts:96`); in SQL ist die Spalte `` `source` text NOT NULL ``
und die DB akzeptiert **jeden** String. `toNeuesGeraeteEreignis` **wirft** bei allem anderen.
**Prüfen, nicht annehmen.**

```sql
-- A6 (§9.4.1 Nr. 5) ⛔ blockierend. Groessenordnung: DREIZEHNSTELLIG = Millisekunden.
select min(created_at), max(created_at), length(cast(max(created_at) as text)) from devices;
```
Der empirische Beweis für die Übergabezeile „Zeitstempel-Einheit". **Kommt hier zehnstellig heraus,
ist die gesamte Import-Annahme falsch und der Cutover wird abgesagt, nicht angepasst.**

```sql
-- A7 (§9.4.1 Nr. 6) ⛔ blockierend. Traegt die Prod-DB von Hand angelegte Trigger oder Views?
select type, name, sql from sqlite_master where type in ('trigger','view');
```
Der Grep-Beleg „null Trigger, null CHECKs" gilt für den **Quelltext**, nicht für die laufende
Datenbank (`docs/radio-portierung-analyse.md:2038-2040` streicht dort ausdrücklich den Zusatzbeleg
über die lokale DB, weil die vorbaselinig ist). **Ein Treffer ist Fachlogik, die kein Repo kennt.**

```sql
-- A8 (§9.4.1 Nr. 7) VORHERSAGE, nicht Vergleich (W3): die Retention-Zahl, die die Schaetzung ersetzt.
select count(*) from loans
 where returned_at is not null
   and returned_at < (strftime('%s','now','-2 months') * 1000);
```
⚠️ **Der Faktor 1000 steht hier absichtlich im SQL:** die Alt-Spalte ist Millisekunden,
`strftime('%s')` liefert Sekunden. Wer ihn weglässt, zählt **alle** zurückgegebenen Leihen und hält
das für eine bestätigte Schätzung. Diese Zahl ersetzt die Betreiber-**Schätzung** „< 100"
(`docs/radio-portierung-analyse.md:1774`) durch eine **Zählung**. **Kein Erwartungswert im Text.** Sie
wird im echten Fenster erneut gezählt, weil ihr Cutoff mit `now` wandert — und sie ist im Protokoll als
**Vorhersage** zu beschriften, damit niemand sie mit **Abfrage R** verwechselt.

```sql
-- A9 (§9.4.1 Nr. 8) Steht `dev-user` in der Prod-DB? (Falle 15, beantwortet U7)
select sub from users;
select distinct created_by from devices;
```
Ein `dev-user` unter den Auditspalten heißt: `AUTH_DEV_BYPASS` war irgendwann aktiv, und die Zuordnung
von Journalzeilen zu Personen ist an diesen Stellen keine. **Nach dem gelöschten Volume ist die Frage
nicht mehr stellbar** — Wiederholung als Abfrage 8 in §5.2.2.

### 2.4.6 A10 — der Spannen-Riegel ueber alle **zehn** Zeitstempelspalten ⛔ **blockierend**

`msZuDatum` **wirft** bei jedem Wert außerhalb `[1e12, 4e12]`. Also muss der Riegel **vor** dem
Fenster feuern, nicht darin — und A6 sieht nur die Spanne **einer** Spalte. Diese Abfrage sieht **alle
zehn** (W8: zehn, nicht elf) und **muss `0` ergeben**:

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

Ein Treffer ist eine `0`, ein Sekundenwert oder ein Ausreißer in **einer** Zeile. **Zur Fehlersuche**
wird derselbe Ausdruck spaltenweise wiederholt, sonst weiß man nur „irgendwo eine". Die Beschriftung
im Runbook lautet **„zehn Spalten in epoch-Millisekunden (neun Zeitstempel + `devices.
last_updated_at`)"**, nicht „elf".

### 2.4.7 A11 — `typeof()` je Zeitstempelspalte ⛛ **Ergaenzung** ⛔ **blockierend**

SQLite erzwingt Spaltentypen nicht — die Deklaration `integer` ist eine **Affinität**, kein
Constraint. **A11 und A10 prüfen disjunkte Fehlerklassen:** A10 die **Groessenordnung**, A11 die
**Speicherklasse**. Beide enden im selben Riegel: `msZuDatum` prüft `Number.isInteger(ms)` und wirft.

| Speicherklasse | sieht A10? | warum |
|---|---|---|
| `'real'` (z. B. `1.771e12`) | ⛔ **nein** | Der Wert liegt **in** der Spanne, A10 ist grün. `Number.isInteger` ist `false`, `msZuDatum` wirft. **Dafür ist A11 gebaut** |
| `'null'` in einer NOT-NULL-Spalte | ⛔ **nein** | `NULL NOT BETWEEN …` ergibt `NULL`, nicht `1` — die Zeile wird von A10 **nicht** gezählt |
| `'text'`, nicht numerisch | ja | Speicherklassenordnung: TEXT > INTEGER. A10 meldet aber nur „irgendwo eine"; A11 nennt Spalte **und** Klasse |
| `'text'`, numerisch (`'1771000000000'`) | entfällt | Integer-Affinität wandelt beim Schreiben in `'integer'` um; wer sie erwartet, sucht am falschen Ort |

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

* **Zehn Beschriftungsgruppen in der Ausgabe.** ⚠️ Jedes Glied hat ein `group by 2` — eine **leere
  Tabelle liefert gar keine Zeile**, nicht `count = 0`. Weniger als zehn Beschriftungen ist selbst ein
  Befund und **vor** dem Lesen der Klassen gegen A1 abzugleichen.
* `'integer'` für alle zehn Spalten.
* **`'null'` ist zusätzlich erwartet und richtig** für die zwei nullable Spalten
  `devices.last_updated_at` und `loans.returned_at`. ⚠️ `'null'` bei einer der **acht**
  NOT-NULL-Spalten ist dagegen ein Befund.
* **`'text'` oder `'real'` ist immer ein Befund.** `'real'` ist der leise Fall: A10 ist dafür grün,
  `msZuDatum` wirft.

### 2.4.8 A12 — Leihen ohne Geraet ⛛ **Ergaenzung**, protokollpflichtig

```sql
select case when l.returned_at is null then 'AKTIV' else 'abgeschlossen' end as art,
       count(*)
  from loans l left join devices d on d.id = l.device_id
 where d.id is null
 group by 1;
```

`loans.device_id` trägt **absichtlich keinen** Fremdschlüssel, und der Quelltext begründet es wörtlich
(`schema.ts:106-110`): zurückgegebene Leihen sind Historie und müssen eine spätere Gerätelöschung
überleben; die historische Richtigkeit trägt der unveränderliche `snapshot_*`-Dreisatz, nicht ein
lebender Join. Im Ziel bleibt es so. **Eine Waise ist hier legal — auf beiden Seiten.**

* `abgeschlossen` → **mitnehmen und im Ziel tolerieren.** Protokollzeile, keine Bereinigung. ⚠️ **Und
  ausdrücklich: keinen FK „der Ordnung wegen" nachziehen** — mit `CASCADE` löscht die erste
  Ausmusterung die Historie, mit `RESTRICT` blockiert jede alte Rückgabe das Ausmustern, und beides
  ist gültiges Drizzle, gültiges SQL und **paritätsgrün**.
* `AKTIV` → **untersuchen und dem Betreiber vorlegen.** Eine aktive Leihe auf einem nicht
  existierenden Gerät ist im Betrieb nicht zurückgebbar: die Rückgabe geht über den Gerätebestand.
  Sie wandert mit, aber die Zahl gehört als **benannter Restposten** ins Protokoll, damit sie nach dem
  Umschwenk nicht als Portierungsfehler gelesen wird.

### 2.4.9 A13 — `returned_at` vor `borrowed_at` ⛛ **Ergaenzung**, protokollpflichtig

```sql
select count(*) from loans
 where returned_at is not null and returned_at < borrowed_at;
```

Diese Abfrage findet, was A10 und A11 nicht finden können: eine **zeilenweise Vertauschung** der
beiden Zeitstempel ist größenordnungsrichtig, speicherklassenrichtig und damit unter A10 wie A11 grün.
Serverseitig ist die Reihenfolge nirgends geschützt — `radio-admin/shared/src/schemas.ts:29`, `:61`,
`:87` typisieren `z.number().int().nullable()` ohne `min`/`max`, es gibt keinen CHECK und keinen
Trigger.

**Entscheidung: mitnehmen und im Ziel tolerieren**, mit Protokollzeile. Grund: das Zielschema verlangt
die Ordnung ebenso wenig, eine „Korrektur" wäre eine erfundene Fachentscheidung über fremde Daten, und
die betroffene Leihe ist abgeschlossen. ⚠️ Was **nicht** toleriert wird: `returned_at < borrowed_at` in
einer Zeile, die A10 zusätzlich als unplausibel meldet. Dann ist es kein Datenfehler von 2024, sondern
ein Hinweis darauf, dass der Snapshot beschädigt ist — ⛔.

---

## 2.5 Was passiert, wenn eine Abfrage etwas findet — die Entscheidung je Fall

Drei Ausgänge, und jeder hat echte Insassen. **Wo „bereinigen" steht, wird in der SNAPSHOT-KOPIE
bereinigt, nie in der laufenden Alt-Datenbank**, und die Bereinigung ist eine Protokollzeile mit dem
ausgeführten SQL.

| Abfrage | Befund | Entscheidung | Wie man merkt, dass es schiefgegangen ist |
|---|---|---|---|
| **A1** | Tabelle fehlt | ⛔ **abbrechen** | „no such table" — falscher, vorbaselinger Snapshot |
| **A1** | Zahl weicht von der Alt-Oberfläche ab | ⛔ **abbrechen** | WAL nicht mitgenommen — `.backup` benutzen, nicht `cp` (W1) |
| **A2** | `is_target` ≠ 1 | 🧹 **bereinigen, protokolliert.** Der Betreiber benennt die Zielversion, `update software_versions set is_target = 0;` dann `= 1` für die eine. Mechanisch möglich, weil der Zielzustand fachlich eindeutig **eine** Version ist | Nach dem Import zeigt jedes Gerät denselben oder keinen Update-Status. Kein Test, keine Paritaet |
| **A3** | Waise in `device_events` | 🧹 **bereinigen, protokolliert.** `delete from device_events where device_id not in (select id from devices);`, Anzahl ins Protokoll | Ohne Bereinigung: harter Abbruch beim Import — laut, aber ein verbrannter Schritt im Fenster |
| **A4** | zwei aktive Leihen auf einem Gerät | ⛔ **abbrechen bzw. Betreiberentscheid, und deshalb in der GENERALPROBE finden.** Welche der zwei Leihen die echte ist, ist eine **fachliche** Frage über ein Gerät im Umlauf — kein mechanischer Fix | Ohne Entscheid schlägt das Anlegen von `loans_device_active_uidx` fehl. Wer den Index daraufhin „weglässt", hat die Invariante **still** abgeschafft — und der Bestand erfüllt sie ja, also merkt es niemand, bis der Kiosk ein Gerät zweimal ausleiht |
| **A5** | unbekannter `source`-Wert | ⛔ **abbrechen / eskalieren.** Den bekannten Wertesatz zu erweitern ist eine **Änderung an Spec 1** (§2.2.4 plus der erschöpfende Switch der Oberfläche), keine Fensterentscheidung | Ohne Abfrage: Abbruch mitten im Import. Mit „Wert schnell in den Mapper aufnehmen": die Oberfläche bricht später an einem nicht erschöpften Switch |
| **A6** | zehnstellig | ⛔ **Cutover absagen**, nicht anpassen | — |
| **A7** | Trigger oder View | ⛔ **abbrechen / eskalieren.** Fachlogik, die kein Repo kennt; sie muss gelesen und bewertet werden, bevor irgendetwas importiert wird | Ohne Abfrage wandert die Wirkung nicht mit, und niemand vermisst sie: das Ziel ist konsistent, nur anders |
| **A8** | Zahl deutlich über der Schätzung | ✅ **mitnehmen — es ist keine Abweichung, sondern die Zählung** | Wer sie als „zu hoch" behandelt und die Retention abschaltet, schaltet die DSGVO-Begründung für `borrower_name` ab (B5: der Abschalter ist `RADIO_HISTORIE_PURGE=0`, **laut** bei jedem Start) |
| **A9** | `dev-user` in Auditspalten | ✅ **mitnehmen und im Ziel tolerieren.** Eine Zuschreibungslücke ist kein Datenfehler; ein „bereinigter" Audit-Eintrag wäre eine Fälschung | Nicht protokolliert wirkt es später wie ein Importfehler |
| **A10** | ≠ 0 | ⛔ **abbrechen**, dann spaltenweise nachfahren und die Zeilen ansehen. Erst danach Entscheid: Einzelzeile bereinigen (protokolliert) oder absagen | `msZuDatum` wirft — laut, aber im Fenster. Genau dafür läuft A10 davor |
| **A11** | `'text'` oder `'real'` | ⛔ **abbrechen.** Einzelzeile nach Sichtprüfung in der Kopie bereinigen (`cast`), protokolliert | Bei `'real'` ist A10 **grün** — das ist der Grund, warum A11 existiert |
| **A11** | `'null'` in einer NOT-NULL-Spalte | ⛔ **abbrechen / eskalieren** | Ein toleranter Mapper macht daraus 1970 und der Purge löscht die Zeile |
| **A12** | Waise, `abgeschlossen` | ✅ **mitnehmen und im Ziel tolerieren.** **Keinen FK nachziehen** | Ein „aufräumendes" `delete` löscht Historie, die die Alt-Anwendung bewusst behalten hat |
| **A12** | Waise, `AKTIV` | ⚠️ **mitnehmen, als benannter Restposten protokollieren** und dem Betreiber vorlegen | Ohne Protokollzeile sucht später jemand einen Portierungsfehler |
| **A13** | `returned_at < borrowed_at` | ✅ **mitnehmen und tolerieren**, Zahl ins Protokoll — außer die Zeile fällt zusätzlich in A10, dann ⛔ Snapshot verdächtig | Eine „Korrektur" erfindet eine Fachentscheidung über fremde Daten |

**Die Zeile, die alle drei Spalten zusammenhält:** ⛔ **Kein Befund wird im Cutover-Fenster zum ersten
Mal gesehen.** Alle dreizehn Abfragen laufen in der **Generalprobe** gegen die Snapshot-Kopie und im
echten Fenster ein zweites Mal. Der Unterschied ist nicht die Abfrage, sondern der Preis: in der
Generalprobe eine halbe Stunde, im Echtlauf ein Abbruch um 23 Uhr — und weil es kein Parallelfenster
gibt, ist der Abbruch dort teuer.

⚠️ **Eine Bereinigung der Klasse 🧹 wird im Echtlauf WIEDERHOLT, nicht vererbt.** Sie fand in einer
Kopie statt, die es im Fenster nicht mehr gibt (§3.5 Klasse B).

---

## 2.6 Nach dem Import: die Gegenzaehlungen, bevor irgendetwas umgeschwenkt wird

Muster `docs/runbooks/lagerbuch-cutover.md:452`, `:544` — **dieselbe Zahl vorher und nachher.** Alle
Befehle laufen im **nicht bootenden** Container aus §2.2.2, **kein Browser, keine Domain.**

```sql
-- FUENF Sollwerte gegen A1. `api_tokens` fehlt hier absichtlich — die Tabelle
-- existiert im Ziel nicht (W4); wer sie mitschreibt, bekommt "no such table".
select 'devices',           count(*) from devices
union all select 'software_versions', count(*) from software_versions
union all select 'users',             count(*) from users
union all select 'device_events',     count(*) from device_events
union all select 'loans',             count(*) from loans;

-- Die drei Invarianten, jetzt im ZIEL. Erwartung wie A2/A3/A4.
select count(*) from software_versions where is_target = 1;
select count(*) from device_events e left join devices d on d.id = e.device_id where d.id is null;
select device_id, count(*) from loans where returned_at is null group by device_id having count(*) > 1;

-- Die Spalte ohne Quelle MUSS leer sein (§2.2.3).
select count(*) from loans where zugangscode_id is not null;

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

**Dazu zwei Ablesungen, die erst der Bau liefert:** **⬜ L4** (`__drizzle_migrations` gegen
`_journal.json`) und **⬜ L5** (die Ausgabe von `/api/health/radio` samt Feldnamen). ⚠️ **Nie
`/api/health`** — `src/app/api/health/route.ts` liefert konstant `{status:"ok"}` ohne Modul und ohne
Datenbank. Und Health beweist ohnehin weniger als sein Name: `SELECT 1` auf einer Datei, die bei
Bedarf **neu angelegt** wird. Deshalb steht die **zählende** Prüfung **neben** dem Healthcheck, nicht
an seiner Stelle.

---

# 3. Generalprobe und Verifikation ohne Parallelfenster

**Was dieses Kapitel entscheidet:** wie vor dem Umschwenk überhaupt etwas geprüft wird, obwohl die
Endadresse `radio.iuk-ue.de` **schon besetzt ist**. Es legt die Generalprobe fest (Ablauf, Messgrößen,
Grün-Bedingung, Abbruchpunkt), schreibt den ephemeren Container aus, benennt die drei Stufen, mit denen
der Modul-Host vorgetäuscht wird, und zählt auf, was an diesem Container **strukturell nicht** prüfbar
ist.

## 3.1 Die Generalprobe

### 3.1.1 Was sie ist — und was das Wort hier nicht bedeutet

Die Generalprobe ist der **vollständige Import in eine Wegwerf-Umgebung, gegen eine Kopie des
Snapshots, mit anschließender Verifikation am ephemeren Container.** Sie läuft **vor** dem
Cutover-Abend, mehrfach, und niemals gegen das produktive Volume.

| Ding | In der Generalprobe | Im Echtlauf (Kapitel 4) |
|---|---|---|
| **Quelle** | `radio-admin-snapshot.sqlite`, per `.backup` gegen die **laufende** Alt-DB gezogen (§2.4) | derselbe Befehl, aber **nach dem Freeze** neu gezogen |
| **Ziel** | Wegwerf-`DATA_DIR` (`$GP/data`), Datei `radio.db` | das produktive Volume `suite_data` |
| **Läufer** | ephemerer Container **ohne Labels**, Port 3999, `-v "$GP/data":/data` | §4.5 Schritt 7 der reguläre Stack; §4.5 Schritt 8 dieselbe `docker run`-Form mit `-v suite_data:/data` (W5) |

⚠️ **Der Alt-Stack wird für den Generalproben-Snapshot NICHT angehalten** (W1). `.backup` arbeitet
gegen die laufende Datenbank; ein Stopp wäre unnötig, und der **Neustart** danach löscht Historie:
`radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`, `retentionService.ts:47` führt
`purge()` **sofort** aus — Kommentar dort: „clears any backlog, e.g. straight after a data migration".
Der Cutoff hängt an der Wanduhr (`:9`, `:19`), also löscht **jeder weitere Start mehr als der
vorige**. Das ist kein Fehler und kein rotes Log, sondern eine **Erfolgszeile**
(`retentionService.ts:41`, `[retention] purged N expired loan(s)`). **Alle Abfragen der Generalprobe
laufen gegen die Snapshot-Kopie.**

⚠️ **Und daraus die Frist, die beide Vorlagen zu spät setzen:** der Nachweis „Retention der
Standby-Umgebung neutralisiert **oder** Volume kopiert" (§4.2 Nr. 3) gilt **vor dem ERSTEN
Generalproben-Snapshot**, nicht „vor dem Cutover-Abend". Ab dem ersten Snapshot kann jemand den
Alt-Stack anhalten, und der nächste Start ist der Schaden.

### 3.1.2 Der Aufbau, ausgeschrieben

**Die Blöcke sind `bash`.** Die Shell des Betreibers ist `fish`, die weder `for … do … done` noch
diese `$( )`-Verschachtelungen so kennt — vorher einmal `bash` starten. Die übrigen Runbooks des
Hauses sind ebenfalls bash-geschrieben; eine erste Fehlermeldung aus der falschen Shell kostet im
Fenster genauso viel Zeit wie eine echte.

```bash
# ---- 0) Einmalig: Kennung aus dem Image lesen -------------------------------
# Warum: Dockerfile:88 startet den Prozess als `USER nextjs`, und Dockerfile:72
# (`RUN mkdir -p /data/files && chown nextjs:nodejs /data`) uebereignet den
# Mountpunkt. Schreibt der Import als root in dasselbe Verzeichnis, gehoert
# `radio.db` root — und die Migrationen beim Boot scheitern mit SQLITE_CANTOPEN.
# Laut, im Container-Log, kein stiller Fall. Aber ein verbrannter Durchlauf.
IMG=ghcr.io/rubenvitt/iuk-suite:latest
UID_APP=$(docker run --rm --entrypoint sh "$IMG" -c 'id -u')
GID_APP=$(docker run --rm --entrypoint sh "$IMG" -c 'id -g')
# ⚠️ BEIDE Werte, und beide abgelesen. Die Kennung heisst `nextjs:nodejs` —
# Benutzer und Gruppe tragen verschiedene Namen (Dockerfile:42-43 legt sie als
# `addgroup --gid 1001 nodejs` und `adduser --uid 1001 nextjs` an). Die Zahlen
# ins Protokoll; ein fest eingetragenes `1001:1001` waere genau die Art Annahme,
# die dieses Kapitel ueberall sonst vermeidet.

# ---- 1) Wegwerf-DATA_DIR ---------------------------------------------------
# ⚠️ `data/files` MUSS mit angelegt werden, und das ist kein files-Zubehoer:
# ein BIND-Mount erbt die Verzeichnisstruktur des Images NICHT (nur ein LEERES
# benanntes Volume tut das — Dockerfile:64-71 schreibt die Regel aus). Und
# `src/core/bootstrap.ts:87-90` ruft die Boot-Pruefungen JEDES Moduls, nicht nur
# die von radio: `src/app/m/files/_lib/boot.ts:425` loest
# `resolve(DATA_DIR, "files")` auf. Fehlt der Pfad, bricht der Pruefcontainer aus
# einem Grund ab, der nichts mit radio zu tun hat — und genau das wird um 22 Uhr
# als radio-Defekt gelesen.
GP="$HOME/gp-radio"
rm -rf "$GP" && mkdir -p "$GP/data/files"

# ---- 2) Import aus einem REPO-CHECKOUT, nicht aus dem App-Image ------------
# ⚠️ Das standalone-Image enthaelt weder `scripts/` noch `tsx`
# (docs/runbooks/portal-cutover.md:25-26). `docker compose exec suite tsx …`
# ist der Reflex und er scheitert — im besten Fall.
DATA_DIR="$GP/data" pnpm exec tsx scripts/import/radio.ts ./radio-admin-snapshot.sqlite

# ---- 3) Eigentum an die Kennung aus dem Image uebergeben --------------------
sudo chown -R "$UID_APP:$GID_APP" "$GP/data"
```

Die Aufrufform ist die aus §1.5.3 — **dasselbe Skript, dasselbe positionale Argument, dieselbe
Snapshot-Datei `./radio-admin-snapshot.sqlite`, ein anderes `DATA_DIR` je Lauf** (nicht
„zeichengleich", §1.5.3). Generalprobe und Echtimport sind zwei Läufe
**derselben** Datei. ⬜ **L6**: die genaue Abschlusszeile; bei `portal` ist es `parity green`
(`portal-cutover.md:20`, `:33`), und das Runbook prüft diese Zeile **und** den Exit-Code, nicht nur
einen von beiden.

### 3.1.3 Idempotenz heißt **Reset**, nicht Wiederholung

Die Generalprobe darf beliebig oft laufen — aber die Wiederholbarkeit liegt im `rm -rf "$GP"` aus
Schritt 1, **nicht** in der Konfliktstrategie des Importers (§1.6). **Verbindlich: jede Generalprobe
beginnt mit einem leeren `DATA_DIR`.** Wer stattdessen „nochmal importiert", prüft die Idempotenz des
Skripts und nicht den Import — und walzt genau das platt, was die Probe erzeugt hat (Fall A und B in
§1.6.3).

⚠️ **Ein roter Paritätscheck ist kein „es ist nichts passiert"** (`portal.ts:105-107`). Der Rückweg ist
die leere Ziel-DB, nie ein zweiter Versuch auf demselben Stand.

### 3.1.4 Die Abfragen gegen die Kopie, **vor** dem Import

Sie gehören in die Generalprobe, weil dort ein Treffer eine halbe Stunde Arbeit ist und im Echtlauf ein
Abbruch um 23 Uhr. **Vollständig ausgeschrieben stehen sie in Kapitel 2 als A1–A13** (W11); hier nur
die Zuordnung zur Probe:

| A-Marke | Was | Blockierend? |
|---|---|---|
| **A1** | sechs Zeilenzahlen (`devices`, `software_versions`, `api_tokens`, `users`, `device_events`, `loans`) | nein — sie **sind** die Sollwerte (fünf davon Paritäts-Sollwerte, `api_tokens` Protokoll) |
| **A2** | `software_versions where is_target = 1` MUSS genau 1 sein | ⛔ ja |
| **A3** | verwaiste `device_events` MUSS 0 sein | ⛔ ja |
| **A4** | doppelt aktive Leihen je Gerät MUSS leer sein | ⛔ ja |
| **A5** | `device_events.source` — Teilmenge des Vierer-Enums | ⛔ ja |
| **A6** | `min/max(created_at)` **dreizehnstellig** = Millisekunden | ⛔ ja — zehnstellig heißt: Absage, nicht Anpassung |
| **A7** | Trigger/Views in `sqlite_master` MUSS leer sein | ⛔ ja |
| **A8** | die Retention-Zahl als **Vorhersage** (ersetzt die Schätzung „< 100") | nein, aber Protokollpflicht |
| **A9** | `dev-user` in Auditspalten (U7) | nein, Protokollpflicht |
| **A10** | **zehn**spaltiger Plausibilitätsriegel `NOT BETWEEN 1e12 AND 4e12` MUSS 0 sein | ⛔ ja |
| **A11** | `typeof()` je Zeitstempelspalte | ⛔ ja |
| **A12** | Leihen ohne Gerät, getrennt nach AKTIV/abgeschlossen | nein, Protokollpflicht (AKTIV: dem Betreiber vorlegen) |
| **A13** | `returned_at < borrowed_at` | nein, Protokollpflicht (⛔ nur zusammen mit A10) |

⚠️ Der Riegel A10 ist **zehn**spaltig, nicht elf (W8), und A8 trägt den Faktor 1000 **absichtlich** im
SQL (§2.4.5).

### 3.1.5 Was die Generalprobe grün macht — und warum „parity green" allein es **nicht** ist

⚠️ **Der teuerste Fehler dieses Ports ist paritätsgrün** (Randbedingung 3, §2.1.2). Die Grün-Bedingung
ist deshalb **zusammengesetzt. Alle sechs Zeilen, nicht eine Auswahl:**

| # | Messung | Befehl / Stelle |
|---|---|---|
| **G1** | A1–A13 haben ihre Sollwerte, **alle acht blockierenden** sind erfüllt | §2.4, W11 |
| **G2** | Der Importer endet mit Exit-Code 0 **und** der Paritätszeile | §3.1.2, ⬜ L6 |
| **G3** | **Fünf** Zeilenzahlen im Ziel entsprechen den Sollwerten der Quelle — **paarweise, nicht in der Summe** | §3.1.5.1 |
| **G4** | Die **fünf** Verwechslungspaare stimmen **zeilengenau** | §3.1.5.2 |
| **G5** | Die Zeitstempel-Gegenprobe zeigt keinen 1970er-Stand | §3.1.5.3 |
| **G6** | Der ephemere Container besteht den Prüfsatz aus §3.2.6 | §3.2.6 |

#### 3.1.5.1 Fünf Tabellen im Ziel, nicht sechs

```bash
for t in devices software_versions users device_events loans; do
  printf '%s\t' "$t"
  sqlite3 "$GP/data/radio.db" "select count(*) from $t;"
done
```

Die Begründung steht in **W4**: `api_tokens` existiert im Ziel nicht (Entscheidung 13, B16). Die
Sechser-Schleife aus Spec 1 §9.4.3 bricht mit `Error: no such table: api_tokens` ab; in der
Generalprobe ist das eine Korrektur, im Cutover-Fenster ein verbrannter Schritt. **`api_tokens` wird
genau einmal gezählt: in der Quelle, als Protokollzeile** — sie belegt Entscheidung 13 und wird in
Kapitel 5 (Abfrage T) gebraucht.

#### 3.1.5.2 Die fünf Verwechslungspaare — feldweise, weil die Parität die Zuordnung nicht sieht

`issi` ↔ `tei` · `created_at` ↔ `updated_at` ↔ `last_updated_at` · `snapshot_call_sign` ↔
`borrower_name` · `alamos_integrated` ↔ `loanable` (**zwei 0/1-Integer, die niemandem auffallen**) ·
`serial_number` ↔ `hiorg_id` ↔ `opta`. Die Auswahl-SQLs stehen in §2.2.3 Regel 3; **je Paar eine
Zeile, zeilengenau gegen die Snapshot-Kopie.**

Warum feldweise und nicht als Zählung: ein vertauschtes Spaltenpaar ändert **keine** Zeilenzahl und
keinen Hash, wenn beide Arme dieselbe Vertauschung tragen. Es ändert nur, was die Oberfläche
behauptet.

#### 3.1.5.3 Die Gegenprobe gegen den Faktor 1000

Zwei Schnitte, und der zweite ist der scharfe:

```bash
# a) Die Retention-Zahl aus A8 muss im Ziel wiederzufinden sein — in SEKUNDEN.
#    ⚠️ Im Fenster wird dieser Vergleich mit <freeze_iso> in BEIDEN Armen gefahren
#    (W3, Abfrage R in §5.2.2); in der Generalprobe genuegt 'now', weil beide
#    Auswertungen Sekunden auseinanderliegen und kein Freigabeschritt daran haengt.
sqlite3 "$GP/data/radio.db" \
  "select count(*) from loans
    where returned_at is not null
      and returned_at < strftime('%s','now','-2 months');"

# b) Der Fingerabdruck: ein Sekundenwert, der als Millisekunde gelesen wurde,
#    liegt im Jahr 1970 — positiv, aber unmoeglich klein.
sqlite3 "$GP/data/radio.db" \
  "select min(returned_at), max(returned_at), count(*)
     from loans where returned_at is not null;"
```

(b) ist eine Zeile und eindeutig: die Quelldaten stammen aus dem Betrieb dieser Anwendung, ein
`max(returned_at)` unterhalb von etwa `1000000000` (2001) ist damit ausgeschlossen. Zeigt (b) einen
1970er-Stand, ist der Faktor-1000-Fehler bewiesen — **bevor** der erste Retention-Lauf ihn unsichtbar
macht. Die **spaltengenaue** Fassung derselben Probe ist **Abfrage Z** (§5.2.2); sie wird auch hier
gefahren, weil sie sagt, **welche** Spalte betroffen ist.

⚠️ **(a), (b) und Z sind kein Ersatz für den Mapping-Unit-Test** (§1.3.4, Fixture-Werte **je Feld
unterschiedlich**). Sie sind die Betriebsprobe daneben. Der Test läuft in CI und muss **vor** der
Generalprobe grün sein.

### 3.1.6 Der Retention-Arbeiter wird in der Probe stillgelegt

**`RADIO_HISTORIE_PURGE=0` gehört in die Env des ephemeren Containers.** Der Erstlauf steht auf 1440
Minuten (B5), eine kurze Probe erreicht ihn also gar nicht — aber eine Probe, die über Nacht läuft
oder mehrfach neu startet, löschte genau die Historie, die G5 gerade nachweist.

Der Schalter ist **nicht** stumm und das ist beabsichtigt: er meldet „Retention abgeschaltet" als
**`console.info`**, nicht als `console.warn` (§7.3.4). Die Trennung ist scharf und prüfbar —
**`warn` = Stopp, `info` = Zustand.** Die Generalprobe ist damit auch die Probe darauf, dass diese
Trennung im Log wirklich so aussieht:

```bash
docker logs radio-gp 2>&1 | head -1              # die ROHZEILE ins Protokoll (W6)
docker logs radio-gp 2>&1 | grep -i 'radio:'
# erwartet: eine radio:-INFO-Zeile ("Retention abgeschaltet"), KEINE radio:-WARNUNG.
```

⚠️ **Das Muster steht OHNE `^`** (W6). Unter `docker compose logs` trägt jede Zeile den Servicenamen
als Präfix, und eine präfigierte Zeile kann `^radio:` nicht treffen — der Befehl liefert dann leere
Ausgabe, und leere Ausgabe liest sich als „keine Warnung", also grün. Deshalb wird zusätzlich die
**erste Rohzeile** protokolliert: damit die Präfixform aktenkundig ist.

⚠️ **Zwei `warn`-Zeilen sind in der Probe legitim und dürfen nicht als Stopp gelesen werden**, solange
Schritt 2 noch nicht gelaufen ist: „`devices` ist leer" und „`radio.db` wurde neu angelegt" (§7.3.4 —
„vor dem Import ist die Tabelle **legitim** leer"). **Nach dem Import müssen beide verschwunden sein.**
Sind sie es nicht, zeigt `DATA_DIR` woanders hin als der Import — Analyse-Falle 29
(`docs/radio-portierung-analyse.md:1685-1696`).

### 3.1.7 `SUITE_SEED` bleibt aus — und das ist bei `radio` schärfer als bisher

`shouldSeed()` ist `SUITE_SEED === "1" || NODE_ENV === "development"`. **`SUITE_SEED=1` ist der
Generalproben-Schalter, nicht der Lokalschalter** — und bei `radio` wäre ein geseedeter Zugangscode ein
**gültiger anonymer Zugang** zum gesamten Bestand samt Ausleihernamen (§9.3.2 Punkt 2).

**Verbindlich: `SUITE_SEED` ist in der Generalprobe nicht gesetzt.** Und weil eine Zusage, die niemand
abliest, keine ist, wird sie abgelesen:

```bash
sqlite3 "$GP/data/radio.db" "select count(*) from zugangscodes;"   # MUSS 0 sein
```

Spec 1 sagt dazu zu: `seedLokal` legt Geräte und Stammdaten an und **niemals** eine einlösbare
Zugangszeile (§9.3.2). Diese Zeile prüft die Zusage, statt ihr zu glauben.

### 3.1.8 Die Probe hat eine Reihenfolge, und sie folgt aus dem Datenmodell

`zugangscodes` ist **nicht Teil des Imports** (§1.4.6). **Nach dem Import gibt es also keinen einzigen
Code, der eingelöst werden könnte.** Daraus folgt die Reihenfolge der Probe — der Verwaltungsweg ist
**Voraussetzung** des Ausleihwegs, nicht ein zweiter, unabhängiger Prüfpunkt:

1. Anmelden als radio-admin (Dev-Login, §3.2.3).
2. `/admin/geraete` — der Bestand steht da, mit echten Zeilen aus dem Import.
3. `/admin/zugaenge` — **einen Code ausstellen.** Das ist der erste Code, den es überhaupt gibt.
4. Den Code einlösen: einmal über `/t/<code>` (der gescannte Weg) und einmal über das Eingabefeld am
   Gate (der Ausweichweg, `_actions/gate.ts#einloesenAmGate`).
5. Ausleihen, zurückgeben, Historie ansehen.
6. Den Code sperren und die Einlösung erneut versuchen — sie muss scheitern, und zwar mit dem
   vorgesehenen Text, nicht mit einem Stacktrace.

⚠️ **Das ist gleichzeitig ein Ankündigungsposten, kein reiner Testschritt.** Die 1:1-Übernahme des
heutigen QR-Mechanismus ist ausgeschlossen (Entscheidung 8) und damit eine **Verhaltensänderung mit
Ankündigungspflicht**. Ob und wo gedruckte Aufsteller im Umlauf sind, weiß nur der Betreiber (C.3/E5)
— **die Frage muss vor dem Umschwenk beantwortet sein** (§4.8), weil „Bestandscodes zeichengleich
übernehmen" ein **Druck**vorgang wäre und Papier für jedes Tor unsichtbar bleibt.

⚠️ **In der Produktion entsteht der erste Code NACH dem Umschwenk** (W2, §4.8.2). Die Reihenfolge oben
ist die der **Probe**, wo ein Dev-Login auf `localhost:3999` möglich ist.

---

## 3.2 Die Verifikation gegen einen ephemeren Container ohne Traefik-Labels

**Der einzige Weg, vor dem Umschwenk etwas zu prüfen.** Deshalb ausführlich.

### 3.2.1 Warum ohne Labels, welches Netz, welches Volume

**Ohne Traefik-Labels.** Ein zweiter Router auf ``Host(`radio.iuk-ue.de`)`` ist ausgeschlossen, weil
dieser Container gar nicht an Traefik hängt (Vorbild: `docs/runbooks/portal-cutover.md:35-37`, „keine
Router-Kollision möglich, da dieser Container gar nicht an Traefik hängt"). Erreicht wird er über IP
und Port.

**Welches Netz: das Standard-Bridge-Netz. Ausdrücklich nicht `proxy`, ausdrücklich nicht `av`.** Der
reguläre Service hängt in `networks: [proxy, av]` (`compose.yaml:127`); der Prüfcontainer braucht
keines von beiden. `proxy` ist das Netz, über das Traefik die Container erreicht — ihn dort
herauszuhalten ist der **zweite, unabhängige Riegel** neben den fehlenden Labels. `av` bedient ClamAV
für `files`-Uploads und ist für `radio` ohne Bedeutung.

**Welches Volume: ⚠️ in der GENERALPROBE niemals das produktive.** Prod ist `suite_data` —
deterministisch, ohne Projektpräfix, weil `compose.yaml:252-254` es mit `name: suite_data` festnagelt.
Der Prüfcontainer der Probe mountet stattdessen das Wegwerf-Verzeichnis aus §3.1.2.

> **Der Riegel, der das hält, ist eine Textprüfung, und sie steht so im Runbook — mit ihrem
> Geltungsbereich:**
> **die `docker run`-Zeile DER GENERALPROBE enthält die Zeichenkette `suite_data` nicht.**
> Ein `-v suite_data:/data` ist ein Zeichen Unterschied und schreibt in die Produktion.

⚠️ **Der Riegel gilt NICHT für den Fenster-Prüfcontainer** (§4.5 Schritt 8): dort ist `suite_data`
genau das Prüfobjekt, weil nur dieses Volume die importierten Daten trägt. **W5** schreibt es aus. Wer
den Riegel ohne Geltungsbereich zitiert, macht Schritt 8 unausführbar.

Auch nicht gemountet werden `files_data` und `aufgaben_data` (`compose.yaml:256-258`). Der Container
ist für die Dauer der Probe eine Suite ohne Dateien und ohne Aufgaben — das ist richtig und kein
Mangel.

### 3.2.2 Die `docker run`-Form, ausgeschrieben

```bash
docker run --rm -d --name radio-gp \
  --user "$UID_APP:$GID_APP" \
  -p 127.0.0.1:3999:3000 \
  -v "$GP/data":/data \
  -e DATA_DIR=/data \
  -e SUITE_HOST_RADIO=localhost \
  -e SUITE_ADMIN_GROUP_RADIO=radio-verwaltung-gp \
  -e RADIO_AUSLEIH_SITZUNG_SECRET="$(openssl rand -hex 32)" \
  -e RADIO_HISTORIE_PURGE=0 \
  -e AUTH_SECRET="$(openssl rand -hex 32)" \
  -e AUTH_URL=http://localhost:3999 \
  -e AUTH_TRUST_HOST=true \
  -e AUTH_DEV_LOGIN=true \
  "$IMG"
sleep 15
docker logs radio-gp 2>&1 | tail -30      # Boot-Pruefungen: siehe 3.2.4
```

⚠️ **Nachtrag 2026-08-18 (Cutover-Leitplan NS11): der FENSTER-Prüfcontainer (§4.5 Schritt 8) hat
DREI Unterschiede zu `radio-gp`, nicht zwei.** W5 nennt zwei — das **produktive Volume** statt des
Bind-Pfads `$GP/data` (W5 schreibt es als `-v suite_data:/data`; verbindlich ist die
**Protokollzeile `$VOL_SUITE`** aus §4.5 Schritt 4 Handgriff 1, weil der echte Name das
Projektpräfix tragen kann), und ⛔ **kein** `AUTH_DEV_LOGIN`. Der dritte:
**`SUITE_HOST_RADIO=localhost,radio.iuk-ue.de`** statt `SUITE_HOST_RADIO=localhost` — eine
**Kommaliste mit zwei Werten**. Ohne den zweiten Wert findet `moduleForHost` für
`radio.iuk-ue.de` kein Modul und liefert `null` (`src/core/registry.ts:251-257`), worauf
`decideRoute` auf das **Portal** zurückfällt (`src/core/routing.ts:79`,
`moduleForHost(host) ?? getModule("portal")`) — und die Fenster-Probe mit vorgetäuschtem `Host`
misst still das Portal statt `radio`. Nachgemessen: `envHostsFor` splittet auf `,`
(`src/core/hosts.ts:39-46`), und `validateHostConfig` hat gegen zwei Werte in einer Liste nichts
(`:65-99` — es prüft Protokoll/Port im Wert und Doppelvergabe **zwischen** Modulen, nicht die
Anzahl).
⚠️ **Der Beleg wurde beim Eintragen berichtigt:** die Vorlage nannte `src/core/hosts.ts:52-57` für
`moduleForHost`. Die Funktion steht dort nicht — `hosts.ts` führt nur `envVarName` (`:29`),
`envHostsFor` (`:39`) und `validateHostConfig` (`:65`); `:52-57` liegt in einem **Kommentarblock**,
der den Namen lediglich erwähnt. Dieselbe Fehlerklasse wie beim alten L5-Beleg.
**Eine Ergänzung zu W5, kein Widerspruch zu ihm** — für die **Generalprobe** bleibt es bei dem
einen Wert `localhost`, und die `docker run`-Zeile oben bleibt deshalb unverändert.

**Zeile für Zeile, weil jede eine Prüfung ist oder eine Falle vermeidet:**

| Zeile | Warum sie so lautet |
|---|---|
| `--rm -d --name radio-gp` | benannt, damit `docker logs`/`docker stop` ohne ID gehen; `--rm`, damit kein Prüfcontainer liegen bleibt und irgendwann als „der läuft doch" gelesen wird |
| `--user "$UID_APP:$GID_APP"` | §3.1.2 Schritt 0: der Import muss dieselbe Kennung benutzt haben wie der Prozess. `Dockerfile:88`, `:72`, `:42-43` |
| `-p 127.0.0.1:3999:3000` | **die Bindung an `127.0.0.1` ist Absicht.** Ohne sie ist die Probe von außen erreichbar — mit `AUTH_DEV_LOGIN=true` und einem Bestand samt Ausleihernamen darin. Der Container hört auf 3000 (`Dockerfile:89`, `compose.yaml:155`) |
| `-v "$GP/data":/data` + `DATA_DIR=/data` | derselbe Pfad wie im regulären Stack (`compose.yaml:79`), nur ein anderes Ziel. `radio.db` liegt damit unter `DATA_DIR` — **eine** Datei, kein zweiter Store |
| `SUITE_HOST_RADIO=localhost` | **der Kern dieses Kapitels** — §3.2.4 |
| `SUITE_ADMIN_GROUP_RADIO=…` | Pflicht, sonst startet die **gesamte Suite** nicht — §3.2.3 |
| `RADIO_AUSLEIH_SITZUNG_SECRET` | Pflicht, ≥ 32 Zeichen, **≠ `AUTH_SECRET`** — §3.2.3 |
| `RADIO_HISTORIE_PURGE=0` | §3.1.6 |
| `AUTH_SECRET` | Auth.js; frisch erzeugt, nie der Prod-Wert in einem Prüfcontainer |
| **`AUTH_URL=http://localhost:3999`** | ⚠️ **die Zeile, die am leichtesten fehlt und deren Fehlen wie ein Moduldefekt aussieht.** „Auth.js leitet seine `baseUrl` aus `AUTH_URL` ab — **immer**" (`src/core/auth/redirect.ts:8`, ebenso `callbackUrl.ts:4`, `redirect.test.ts:7`). Im regulären Stack steht sie in `compose.yaml:80` mit Vorbelegung `https://iuk-ue.de` — die greift aber nur über die compose-Ersetzung; ein `docker run` ohne die Zeile hat sie **nicht**. Sie muss **zeichengleich der Origin der Probe** sein, sonst führt der Dev-Login aus `localhost:3999` heraus und kommt nicht zurück |
| **`AUTH_TRUST_HOST=true`** | im regulären Stack unbedingt gesetzt (`compose.yaml:82`). Fehlt sie, misstraut Auth.js dem Host der Probe |
| `AUTH_DEV_LOGIN=true` | `src/core/auth/devLogin.ts:10-11`: „force on (**even in production**)". Gruppen sind dabei freier Text (`src/core/registry.ts:137`) — nur so ist die Verwaltungsfläche ohne Pocket ID prüfbar. Und weil Pocket ID ungefragt bleibt, braucht die Probe **kein** `POCKET_ID_*` |
| **kein** `SUITE_SEED` | §3.1.7 |
| **kein** `SUITE_TRAEFIK_RULE` | §7.3.4: die Warnung „Host nicht in der Rule" feuert nur, wenn **beide** Variablen gesetzt sind. Ohne die Rule bleibt sie still — im Prüfcontainer richtig, weil die Labels auf dem Server leben |
| **keine** `labels:` | §3.2.1 |

### 3.2.3 Die Env-Liste ist selbst eine Prüfung

Sobald `SUITE_HOST_RADIO` einen Wert hat, ist `radio` **eingeschaltet**: `radioBootFehler()` steigt als
erste Anweisung mit `prodHostsFor(getModule("radio"), env).length === 0` aus (§7.3.2), und mit
`prodHosts: []` in der Registry ist dieser Schalter genau „der Betreiber hat radio eingeschaltet".

Damit laufen im Prüfcontainer **dieselben fünf Boot-Prüfungen wie in der Produktion** (§7.3.3), und
jeder zurückgegebene String **ist** ein Startabbruch — `assertHostConfig` wirft bei `length > 0`
(`src/core/bootstrap.ts:92`):

* `SUITE_ADMIN_GROUP_RADIO` fehlt → **die Suite startet nicht.** Nicht `radio` allein: portal, qr,
  feedback, files, lagerbuch und aufgaben stehen mit.
* `RADIO_AUSLEIH_SITZUNG_SECRET` fehlt, ist kürzer als 32 Zeichen **oder gleich `AUTH_SECRET`** →
  dasselbe.
* `SUITE_ACCESS_GROUP_RADIO` gesetzt → dasselbe, und zwar richtig: der Wert wäre **still wirkungslos**
  (`canAccess` steigt für `requiresAuth: false` sofort mit `true` aus, `src/core/registry.ts:239`).
* `RADIO_HISTORIE_MONATE=0` → dasselbe. `0` wird ausdrücklich abgewiesen und **nicht** als „aus"
  gelesen; `0` Monate lösche beim ersten Lauf die gesamte abgeschlossene Historie.

**Das ist ein Gewinn, nicht ein Hindernis.** Die Generalprobe ist die erste und einzige Gelegenheit,
die Boot-Prüfungen unter echten Bedingungen feuern zu sehen — und §7.3.1 sagt, warum das nötig ist:
ohne die Einhängung in `src/core/bootstrap.ts` laufen **alle** Prüfungen nie, die Tests dazu sind grün
und `pnpm build` auch. „Für die Boot-Haken gibt es kein Netz."

**Vorgeschriebener Handgriff: die Probe wird einmal absichtlich rot gefahren.**
`SUITE_ADMIN_GROUP_RADIO` weglassen, starten, den Abbruch im Log lesen, Variable wieder setzen. Wer
diesen Abbruch nie gesehen hat, weiß am Cutover-Abend nicht, ob eine startende Suite die Prüfungen
bestanden hat oder sie nie gelaufen sind.

### 3.2.4 ⚠️ Wie der Modul-Host vorgetäuscht wird, obwohl `radio.iuk-ue.de` der Alt-Kiosk ist

**Das ist die zentrale Frage dieses Kapitels.** Die Auflösung liegt in zwei Dateien:

* `src/core/routing.ts:37` — `resolveHost` nimmt `x-forwarded-host` **vor** `host`; bei einer
  Kommaliste gewinnt der erste Wert, ein leerer Wert fällt auf `host` zurück.
* `src/core/registry.ts:225-232` — `moduleForHost` schneidet den Port ab
  (`host.split(":")[0].toLowerCase()`) und prüft dann **zwei** Dinge: ``h === `${m.key}.localtest.me` ``
  (eingebaut, ohne jede Env-Variable) und `prodHostsFor(m, env)`, das `SUITE_HOST_RADIO` liest.

| Stufe | Form | Kauft | Kauft **nicht** |
|---|---|---|---|
| **1** | `curl -H 'Host: radio.iuk-ue.de'` | jede HTTP-Aussage: Status, Header, Weiterleitung, Rumpf. Der **zeichengleiche** Prod-Host im Header | alles, was einen Browser braucht |
| **2** | Browser auf `http://radio.localtest.me:3999` | Modulauflösung ohne jede Env-Zeile (`registry.ts:228`) | ⚠️ **kein sicherer Kontext** und damit **kein Secure-Cookie** (§3.3.2). Der Ausleihweg sieht dort kaputt aus, obwohl er es nicht ist |
| **3** | Browser auf `http://localhost:3999` mit `SUITE_HOST_RADIO=localhost` | dasselbe **plus** vertrauenswürdiger Origin: sicherer Kontext, Secure-Cookies werden angenommen | den echten TLS-Handschlag, Cloudflare, den echten Hostwert |

**Verbindlich ist Stufe 3 für alles Browsergestützte und Stufe 1 für alles Kopfgestützte.** Stufe 2
wird hier nur benannt, damit niemand sie für den bequemen Weg hält: sie ist der Weg, der eine intakte
Ausleihe als Fehler ausweist.

**Warum Stufe 3 zulässig ist, nachgeschlagen und nicht angenommen:**

1. `validateHostConfig` weist einen Wert nur ab, wenn er `/` oder `:` enthält — „muss ein reiner
   Hostname sein" (`src/core/hosts.ts:80-85`). **`localhost` enthält keines von beiden.**
   `SUITE_HOST_RADIO=localhost:3999` wäre dagegen ein Startabbruch.
2. `moduleForHost` schneidet den Port ab (`registry.ts:226`), also trifft `localhost:3999` →
   `localhost` → `radio`.
3. Kein anderes Modul beansprucht `localhost`, die Doppelvergabeprüfung (`hosts.ts:86-93`) bleibt
   still.
4. `/login`, `/api/auth`, `/api/health` und `/_next` sind PASSTHROUGH (`src/core/routing.ts:12`) — der
   Dev-Login funktioniert also weiter, obwohl `radio` den ganzen Host beansprucht.
5. ⚠️ **`AUTH_URL` muss mitwandern und zeichengleich `http://localhost:3999` lauten.** Stufe 3 ist
   **zwei** zeichengleiche Werte, nicht einer.

**Der Präzedenzfall dazu ist im Haus vernarbt und heißt anders, meint aber dasselbe:**
`docs/runbooks/lagerbuch-cutover.md:158` — „⚠️ `APP_BASE_URL` und `SUITE_HOST_LAGERBUCH` müssen
ZEICHENGLEICH derselbe Host sein", dort „der teuerste Einzelposten aus dem Bau von Teil 4". Der Grund
ist bei `radio` identisch: das Sitzungscookie trägt `path: "/"` und **kein** `domain`, es ist damit an
**genau die Origin** gebunden, auf der es gesetzt wurde (§3.4.1) — „und **kein Test sieht das**.
Vitest kennt nur einen Host, Playwright kennt nur `<modul>.localtest.me`, und `pnpm build` prüft keine
Env-Werte gegeneinander."

Zwei Folgen, die auseinanderzuhalten sind:

* **Für die Probe:** die Origin der Probe ist eine andere als die Produktion. Alle in der Probe
  geprägten Ausleih-Sitzungen sind danach wertlos — das ist richtig, sie gehören zu einem
  Wegwerf-Stand.
* **Für den Umschwenk:** `SUITE_HOST_RADIO` und der Wert, gegen den Auth.js auflöst, werden vor dem
  Umschwenk **nebeneinandergelegt und zeichenweise verglichen**. `radio` führt kein eigenes
  `APP_BASE_URL` (Spec 1 nennt keines); die Variable, die hier zählt, ist **`AUTH_URL`**
  (`compose.yaml:80`). Ein Unterschied in der Schreibweise beendet keine laufende Alt-Sitzung — es gibt
  keine zu erhalten, weil der Alt-Kiosk seinen Zugang im `localStorage` hält —, **aber er bricht den
  Login-Rückweg, und dieser Bruch ist stumm** (§4.6 Nr. 10).

⚠️ **Was Stufe 3 ausdrücklich NICHT beweist — und das ist die wichtigste Einschränkung dieses
Kapitels.** Sie beweist, dass das Modul unter **einem beanspruchten Host** arbeitet. Sie beweist
**nicht**, dass der Produktionswert `SUITE_HOST_RADIO=radio.iuk-ue.de` richtig gesetzt ist. Genau
dieser Fehlfall ist **stumm**: die Allowlist in `src/core/auth/redirect.ts` erkennt einen Modul-Host
über **genau** diese Variable; fehlt der Wert, wirft Auth.js den Nutzer nach dem Login aufs Portal,
„ohne Fehler und ohne Meldung", und — wörtlich — „Ein curl sieht davon nichts"
(`src/core/hosts.ts:59-63`).

Spec 1 §9.3.1 nennt die zwei ehrlichen Wege und empfiehlt **Weg A** (temporärer echter Host
`radio-neu.iuk-ue.de` samt `SUITE_TRAEFIK_RULE`-Eintrag), mit der Warnung: „Beim Wechsel gilt
**dieselbe** Prüfung noch einmal — der Rückweg hängt am **Wert**, nicht am Code."
**Die Wahl zwischen Weg A und Weg B** (Nachprüfung als erster Schritt nach dem Umschwenk, mit
`SUITE_HOST_RADIO=` leeren als benanntem Rückweg und einer namentlich benannten Person) **fällt HIER
und VOR dem Cutover-Abend, nicht an ihm.** Stufe 3 ersetzt diese Entscheidung nicht — sie macht nur
die browsergestützten Prüfungen möglich, die §9.3.1 gar nicht vorsah.

⚠️ **Und ein zweiter Unterschied, der leicht verschwimmt: Falle 61 ist bei Stufe 3 NICHT
bauartbedingt vermieden.** §9.3.1 schreibt das für Weg A zu, weil dort `/m/radio` auf dem Portal-Host
gar nicht angefasst wird. Bei Stufe 3 ist der interne Pfad weiter erreichbar: `decideRoute` behandelt
`/m/<key>` in einem eigenen Zweig, und für ein Modul mit `requiresAuth: false` liefert `canAccess`
sofort `true` (`routing.ts:57-67`, `registry.ts:239`). **Die Negativprobe ist deshalb Pflicht: V7.**

### 3.2.5 Wenn ein echter TLS-Handschlag gebraucht wird: die Escalation, benannt und nicht empfohlen

Stufe 3 liefert einen **sicheren Kontext** ohne TLS, weil `localhost` als vertrauenswürdiger Origin
gilt. Was sie nicht liefert, ist ein echter Handschlag und der Header-Vorlauf eines Reverse-Proxys.
Wer das braucht, stellt einen TLS-Abschluss vor den Prüfcontainer, der `X-Forwarded-Host` setzt — und
trifft damit den Zweig, den die Produktion wirklich benutzt (`routing.ts:37`):

```yaml
# gp-compose.yaml — NUR fuer die Generalprobe. Keine traefik.*-Labels, kein proxy-Netz.
services:
  app:
    image: ghcr.io/rubenvitt/iuk-suite:latest
    user: "${UID_APP}:${GID_APP}"     # abgelesen in 3.1.2, nicht eingetragen
    volumes: ["${GP}/data:/data"]
    environment:
      DATA_DIR: /data
      SUITE_HOST_RADIO: radio.iuk-ue.de   # ⚠️ nur zulaessig, weil KEIN Router hier haengt
      SUITE_ADMIN_GROUP_RADIO: radio-verwaltung-gp
      RADIO_AUSLEIH_SITZUNG_SECRET: ${GP_SECRET}
      RADIO_HISTORIE_PURGE: "0"
      AUTH_SECRET: ${GP_AUTH_SECRET}
      AUTH_URL: https://localhost:8443     # zeichengleich die Origin des Browsers
      AUTH_TRUST_HOST: "true"
      AUTH_DEV_LOGIN: "true"
  tls:
    image: caddy:2-alpine
    ports: ["127.0.0.1:8443:8443"]
    command: >
      caddy reverse-proxy --from https://localhost:8443 --to app:3000
      --header-up "X-Forwarded-Host: radio.iuk-ue.de"
```

**Zwei Warnungen, ohne die diese Form gefährlich ist:**

1. ⚠️ **`SUITE_HOST_RADIO=radio.iuk-ue.de` steht hier nur deshalb, weil dieser Stack keinen Router
   trägt.** Dieselbe Zeile in der echten `.env` **ist** der Umschwenk. Die Datei heißt
   `gp-compose.yaml` und nicht `compose.override.yaml`, damit ein `docker compose up -d` im
   Projektverzeichnis sie **nicht** einliest.
2. Der Browser muss das Caddy-interne Zertifikat annehmen. Eine durchgeklickte Zertifikatswarnung ist
   kein sicherer Kontext im Sinne des Cookie-Verhaltens — wer prüfen will, ob das Cookie ankommt,
   prüft es **an dieser Stelle noch einmal** und glaubt nicht dem Erfolg auf Stufe 3.

**Empfehlung: Stufe 3, nicht diese Form.** Ein Container statt zwei, eine Env-Zeile statt eines
Zertifikats — und der Zweig, der hier zusätzlich getroffen wird (`x-forwarded-host`), ist nach dem
Umschwenk in einem Atemzug nachprüfbar. Diese Form steht hier, damit sie im Fenster nicht erfunden
wird.

### 3.2.6 Der Prüfsatz am ephemeren Container

**Kopfgestützt (Stufe 1). Alle Zeilen laufen, nicht nur die erste:**

```bash
B=http://127.0.0.1:3999
H='Host: radio.iuk-ue.de'

# V1) Die Ausleihflaeche antwortet unter dem radio-Host.
curl -si -H "$H" "$B/" | head -3                       # erwartet: 200

# V2) /admin riegelt anonym ab — als WEITERLEITUNG in den Login, nicht als 404.
curl -si -H "$H" "$B/admin" | grep -iE '^HTTP/|^location:'

# V3) Health, mit Revision — der einzige Beleg, dass der NEUE Stand antwortet.
curl -s -H "$H" "$B/api/health/radio"

# V4) Der CSV-Export antwortet anonym 404, nicht 403 (B10/B17).
curl -s -o /dev/null -w '%{http_code}\n' -H "$H" "$B/admin/geraete/export"

# V5) Der Abraeum-Worker liegt im Image und ist der richtige.
curl -si -H "$H" "$B/sw.js" | head -5
curl -s  -H "$H" "$B/sw.js" | grep -c 'registration.unregister'   # MUSS >= 1
curl -s  -H "$H" "$B/sw.js" | grep -c 'caches.keys'               # MUSS >= 1
curl -s  -H "$H" "$B/sw.js" | grep -c 'addEventListener("fetch"'  # MUSS 0 sein

# V6) /sw.js auf einem FREMDEN Host darf ihn nicht liefern.
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: iuk-ue.de' "$B/sw.js"

# V7) Falle 61: der interne Pfad auf dem Portal-Host.
curl -si -H 'Host: iuk-ue.de' "$B/m/radio" | head -3

# V8) siehe unten — R36 ist bei radio KEIN curl.
```

**Zu V2, weil hier zwei Riegelformen dicht nebeneinanderliegen und der naheliegende Sollwert der
falsche ist.** `requireRadioAdmin()` läuft in einer festen Reihenfolge (§3.6.1): Host, dann
`viewerAusSession`, dann **Schritt 4** `redirect('/login?callbackUrl=' + verwaltungsZiel(kopf))` für
**anonym**, und erst **Schritt 5** `notFound()` — „NICHT 403" — für **angemeldet ohne Gruppe**:

| Fall | Erwartung | Wo geprüft |
|---|---|---|
| anonym auf `/admin` (Seite) | **Weiterleitung (3xx)** in den Login, mit `callbackUrl` — der genaue Code ist **⬜ L7** | V2 |
| angemeldet **ohne** `SUITE_ADMIN_GROUP_RADIO` auf `/admin` (Seite) | **404** | V11 |
| anonym auf `/admin/geraete/export` (**Route Handler**) | **404**, nie 403 und nie ein Login-Umweg | V4 |

Der Unterschied zwischen Zeile 1 und Zeile 3 ist keine Unsauberkeit, sondern **B11**: Seiten und
Actions rufen `requireRadioAdmin()`, **Route Handler unter `admin/` rufen `radioHostOderNull` +
`istRadioAdmin(await viewerOderNull())`** und bauen ihre Antwort selbst. **Wer V2 und V4 denselben
Sollwert gibt, hat eine der beiden Bauformen kaputtgeprüft.** Protokolliert wird der **vollständige**
`Location`-Wert: nennt die `callbackUrl` nicht den Host aus dem `Host`-Kopf, ist das derselbe stumme
Fehlfall wie beim Login-Rückweg (§3.2.4).

**Zu V8: R36 ist bei `radio` kein `curl`, sondern eine Abwesenheitsprüfung — und das ist die stärkere
Form.** §7.1.1 entscheidet: „**`radio` erhält kein Manifest, keine Icon-Handler und keinen
`<link rel="manifest">`**", und schreibt die Folge selbst aus: lagerbuch-Falle 56 ist „durch
**Abwesenheit** beantwortet … es gibt keinen Pfad an der Wurzel, der sie auslösen könnte". Ein `curl`
auf `…/manifest.webmanifest` prüfte dann die Abwesenheit von etwas, das kategorisch nicht entstehen
kann: **immer grün, und liest sich als Zusage.** Verbindlich ist stattdessen:

```bash
# R36 in der radio-Fassung: es entsteht keine Manifest-Route unter dem Modul.
test ! -e src/app/m/radio/manifest.webmanifest/route.ts && echo "R36 ok"
rg -n 'metadata.*manifest|rel="manifest"' src/app/m/radio/ || echo "R36 ok"
```

Das läuft im **Repo**, nicht gegen den Container, und gehört damit **vor** die Generalprobe. Was nach
dem Umschwenk gegen den Portal-Host zu prüfen bleibt, ist nicht die Abwesenheit des radio-Manifests,
sondern die **Unverändertheit** des Portal-Manifests — dieselbe Zeile wie bei lagerbuch
(`lagerbuch-cutover.md:432`, der ausführbare Befehl in `:236`), aber mit umgekehrter Beweislast (§4.6 Nr. 6).

**Zu V3, weil `200` allein zu wenig ist.** `/api/health/radio` wäre gegen eine frisch angelegte,
**leere** `radio.db` grün. Was zählt, sind **zwei** Dinge im Rumpf: `status` und `revision`.
`revision` kommt aus `laufendeRevision()` und damit aus `SUITE_REVISION`, das `Dockerfile:85-86` in die
letzte Metadatenschicht schreibt — „der einzige Beleg, den der automatische Rollout von AUSSEN prüfen
kann". Und die Gegenrichtung (§7.2.4): **solange der Registry-Eintrag `radio` fehlt, antwortet
`/api/health/radio` mit 503**, weil `getModule` bei unbekanntem Key wirft. **200 heißt „das Modul ist
im Image", 503 heißt „falsches Image".** Die billigste Image-Prüfung, die es gibt. Welches Feld was
belegt: **⬜ L5.**

**Zu V5:** der Handler ist in §7.1.3 vollständig ausgeschrieben, die Zusicherungen sind also keine
Vermutung: `content-type: text/javascript; charset=utf-8`, `cache-control: no-cache`, im Rumpf
`self.registration.unregister()` und `caches.keys()`, und **kein** `fetch`-Handler („Ein Worker ohne
`fetch`-Handler lässt jede Anfrage unberührt zum Netz"). **V6** prüft die nicht werfende Riegelform
`hostAbweisung` (B13): ein `notFound()` wäre eine HTML-Seite mit `Content-Type: text/html`, und der
Browser meldete „manifest fetch failed" statt einer klaren Absage.

**Zu V7:** hier steht **kein** Sollwert im Text, weil er von einer Entscheidung abhängt, die dieses
Kapitel nicht trifft (**⬜ L8**). Die Zeile bleibt trotzdem im Runbook: **abgelesen und protokolliert
wird sie in jedem Fall**, denn Falle 61 ist die zweite Herkunft, die in keinem Runbook steht.

**Browsergestützt (Stufe 3), auf `http://localhost:3999`:**

| # | Schritt | Was ihn scheitern lässt, und wie man es merkt |
|---|---|---|
| V9 | `/login` → Dev-Login mit der Gruppe aus `SUITE_ADMIN_GROUP_RADIO` | fehlt `AUTH_DEV_LOGIN=true`, führt der Login gegen Pocket ID und die Rückleitung scheitert — sichtbar als Fehlerseite des IdP, nicht der Suite. Fehlt `AUTH_URL`, landet der Login **auf einem anderen Host** und der Fehler sieht aus wie ein Riegel, der zu viel riegelt |
| V10 | `/admin/geraete` zeigt echte Zeilen aus dem Import | leere Tabelle bei nicht-leerem `select count(*)` → Falle 9 (Client-Insel ohne serialisierbare Daten), sichtbar nur hier, nie im Build |
| V11 | Negativprobe: abmelden, neu anmelden **ohne** die Admin-Gruppe → `/admin` ist 404 | eine gerenderte Verwaltungsseite heißt: der Riegel steht nicht in **jeder** Datei. Mit `requiresAuth: false` erbt `/admin` **kein** Middleware-Gating (Entscheidung 10) |
| V12 | `/admin/zugaenge`: Code ausstellen, Blatt drucken (Druckvorschau) | erbt das Druckblatt Kopfzeile, Navigation und `controlHeight: 44`, fehlen die zwei Route-Groups aus §1.2.2 (B9) — **still, der Build ist grün, sichtbar nur auf Papier bzw. in der Vorschau** |
| V13 | `/t/<code>` aufrufen → 303 auf die Ausleihfläche, **und das Cookie `radio_ausleihe` steht danach in den DevTools** | §3.3.2 |
| V14 | Ausleihen, zurückgeben, Historie | eine 500 hier ist ein Fund; eine falsche Konfliktmeldung ist auch einer (§4.3.5: sechs Ausgänge, heute vier Sätze) |
| V15 | Code sperren, Einlösung erneut versuchen | die Meldung muss aus dem geschlossenen Satz der vier Texte kommen (§3.3.4), nicht aus einem Stacktrace |
| V16 | Hell **und** dunkel je Fläche einmal ansehen | Vorbild `lagerbuch-cutover.md:267-284`: Ampelringe, Statuschips, Tabellenkanten. Keine weiße Fremdfläche im Dunkelmodus, kein abgeschnittener Inhalt |

### 3.2.7 Aufräumen — und warum das ein eigener Schritt ist

```bash
docker stop radio-gp          # --rm entfernt ihn dabei
rm -rf "$GP"
```

Ein liegengebliebener Prüfcontainer ist ein Container mit `AUTH_DEV_LOGIN=true` und einem echten
Bestand. Er hängt an keinem Router, also fällt er niemandem auf. **Der Schritt gehört ins Protokoll
wie jeder andere.**

---

## 3.3 Der sichere Kontext — was HTTPS hier wirklich betrifft

Bei `lagerbuch` war „Die Generalprobe MUSS über HTTPS laufen — sonst sind die Kamerawege ungeprüft"
ein eigener Runbook-Punkt (`lagerbuch-cutover.md:290-310`). Bei `radio` gilt derselbe Satz, **aber aus
einem anderen Grund** — und das ist ein Befund, nicht eine Kürzung.

### 3.3.1 `radio` hat keine Kamerafläche im Modul — nachgesehen, nicht angenommen

Ein Scan über Spec 1 und die Portierungsanalyse findet **keine** Stelle mit `getUserMedia`,
`BarcodeDetector`, `mediaDevices` oder einer Scanner-Komponente unter `src/app/m/radio/`. Der einzige
Treffer für „Scanner" ist eine Prosastelle über anonyme Nutzung (§3.5.3). Der gescannte Code ist bei
`radio` **ein GET aus der Adresszeile**: §3.3.2 begründet den Route Handler `t/[code]/route.ts` genau
damit, und §3.3.3 nennt das Eingabefeld am Gate den Weg „für den Fall, dass die Kamera nicht will" —
gemeint ist die **Kamera-App des Telefons**, nicht eine Fläche des Moduls.

Der lagerbuch-Punkt ist damit **nicht übertragbar**: dort gibt es `/verwaltung/geraete/scan` und
`/verwaltung/bz/scan` mit einem eigenen `BarcodeScanner.tsx`, das über `http://` ausschließlich
`KEIN_SICHERER_KONTEXT` zeigt. Bei `radio` gibt es diese Fläche nach Spec 1 nicht.

**⬜ L9** bleibt: ob `/` oder `/t/<code>` doch eine kamerabasierte Fläche trägt. ⚠️ Warum das als
Leerstelle steht und nicht als Zusage: **eine Prüfzeile auf eine Fläche, die es nicht gibt, ist
entweder immer grün oder immer rot, und beides wird als Aussage gelesen.** Präzedenzfall: die
`lagerbuch`-Spec verlangte ein `cookies().delete()` in einer Server Component, wo es **wirft**.

### 3.3.2 Der echte Zwang zum sicheren Kontext ist das **Secure-Cookie**

Die Ausleih-Sitzung setzt `secure: process.env.NODE_ENV === "production"` (§3.4.1), und
`Dockerfile:36` setzt `ENV NODE_ENV=production`. **Im Prüfcontainer ist das Cookie also `Secure` —
genau wie in der Produktion.** Ein `Secure`-Cookie von einem nicht vertrauenswürdigen Origin wird vom
Browser verworfen; auf `http://radio.localtest.me:3999` (Stufe 2) ist der Ausleihweg damit **nicht
benutzbar, obwohl er intakt ist**. **Das ist der zweite falsche Schluss aus dem lagerbuch-Punkt:** wer
die Probe über Stufe 2 fährt, hält den Gate-Weg für kaputt und „repariert" ihn — oder er hält ihn für
geprüft, weil die Seite ja erschien. Der zweite ist der teurere.

**Deshalb ist V13 kein Behauptungssatz, sondern eine Ablesung:**

> Nach `GET /t/<code>` MUSS das Cookie **`radio_ausleihe`** in den DevTools unter
> Application → Cookies → `http://localhost:3999` stehen, mit `HttpOnly`, `SameSite=Lax`, `Path=/`
> und **ohne** `Domain`-Eintrag. Fehlt es, liegt die Ursache am Origin und nicht am Modul — dann ist
> der Ausleihweg in dieser Probe **ungeprüft**, und die Probe wird auf Stufe 3 wiederholt, nicht das
> Modul angefasst.

Der Name ist nachgeschlagen: `AUSLEIH_COOKIE = "radio_ausleihe"` (§3.4.1). Er kollidiert **nicht** mit
dem Alt-Cookie `radio-inventar.sid`
(`radio-inventar/packages/shared/src/constants/auth.constants.ts:29`) — auch das ist nachgeschlagen
und nicht angenommen. Die Probe läuft in **Chromium oder Firefox**.

### 3.3.3 Der gedruckte QR-Code: prüfbar ist die **Nutzlast**, nicht der Scan

Ein gedruckter Code trägt eine **absolute** URL auf `https://radio.iuk-ue.de/t/<code>`. Bis zum
Umschwenk führt diese URL zum Alt-Kiosk — der Scan ist also vorher **nicht** prüfbar, und keine
Umgehung ändert das.

**Was vorher prüfbar ist, und es ist nicht wenig:** die Nutzlast als Text. Den Code im ephemeren
Container ausstellen, das Druckblatt öffnen, den QR mit einem beliebigen Leser als **Zeichenkette**
auslesen und **zeichenweise** gegen die erwartete URL vergleichen. Ein Tippfehler im Host, ein
fehlendes `https`, ein Modul-Pfad `/m/radio/t/…` statt `/t/…` — alles drei fällt hier auf und keines
davon nach dem Druck.

⚠️ **Reihenfolge, damit daraus kein Altpapier wird:** gedruckt wird **nach** dem Umschwenk. Papier ist
für jedes Tor unsichtbar. Der Druck des ersten Codesatzes ist ein eigener, protokollierter Schritt
**nach** dem Umschwenk (§4.8), keine Vorbereitung — und er ist zugleich die Frist für **C.1**.

---

## 3.4 Was am ephemeren Container NICHT prüfbar ist

Sechs Punkte, je Punkt: wann prüfbar, und was der Ersatz vorher ist. **Diese Tabelle ist der Grund,
warum das Kapitel nicht mit §3.2 endet.**

| Aussage | Warum nicht am Prüfcontainer | Wann prüfbar | Der Ersatz vorher |
|---|---|---|---|
| **Cloudflare lässt die Wege durch** | Der Container hängt an keinem Router und schon gar nicht am Rand. Bekannter Bestandsfall: `iuk-ue.de`/`qr.iuk-ue.de` zeigten Bot-Challenges | **nach** dem Umschwenk, erster Abruf von außen | keiner am Container. Der Ersatz ist ein **Vorabblick in die Zone**: trägt `radio.iuk-ue.de` heute Regeln, die der Alt-Kiosk brauchte (Bot Fight Mode, Cache-Regeln, Page Rules)? **Ein benannter Schritt „Zonenregeln für `radio.iuk-ue.de` gelesen und protokolliert" VOR dem Fenster** (§4.2) |
| **Echtes TLS, echtes Zertifikat, HSTS** | kein Router, kein ACME. Stufe 3 liefert einen *sicheren Kontext* ohne TLS | **nach** dem Umschwenk | Stufe 3 für alles, was nur einen sicheren Kontext braucht; notfalls die Escalation aus §3.2.5 |
| **Der Header-Vorlauf des Randes** (`x-forwarded-host`) | ein `docker run` setzt ihn nicht; die Probe trifft den `host`-Rückfall in `routing.ts:37`, die Produktion den Vorrangzweig. Vernarbt: `lagerbuch-cutover.md:102` | **nach** dem Umschwenk, in einem Atemzug mit dem ersten Abruf | die Escalation aus §3.2.5 setzt den Header und trifft denselben Zweig; dazu §4.2 Nr. 8 (am Server belegen, dass der Edge-Proxy ihn **setzt**, nicht durchreicht) |
| **Gedruckte QR-Codes** | absolute URL auf die besetzte Endadresse | **nach** dem Umschwenk | die Nutzlast als Text vergleichen (§3.3.3) |
| **Der Service Worker des Alt-Kiosk** | er lebt in **fremden Browsern**, nicht im Image. Er überlebt den Umschwenk, weil der Origin zeichengleich bleibt, und liefert HTTP 200 mit veraltetem Inhalt — kein Build, kein Test, kein Healthcheck sieht das | **nach** dem Umschwenk, auf einem Gerät, das den Alt-Kiosk kannte: einmal neu laden | V5/V6: der Abräum-Worker ist **im Image**, hat den richtigen Rumpf und wird auf Fremdhosts nicht ausgeliefert. ⚠️ Er gehört in den **ersten Deploy**, nicht in den Cutover (§4.7.1) — bis zum Umschwenk holt ihn niemand ab, weil nichts in der Suite `register()` ruft. Worst Case bleibt **eine** veraltete Ansicht je Gerät |
| **Die Cookie-Domain** (host-only, **kein** `.iuk-ue.de`) | ⚠️ **nie per HTTP prüfbar — auch nicht nach dem Umschwenk.** §3.4.1 wörtlich: „Playwright kann diesen Fehler nicht sehen. Es fährt gegen **einen** Host, und dort verhält sich ein domain-weites Cookie **exakt** wie ein host-only" (Falle 19). `pnpm build` und `pnpm typecheck` sehen ein zusätzliches `domain`-Feld nicht — es ist typkorrekt | **nie** durch einen Abruf | **die Quelltext-Zusicherung aus §3.8, und sie muss vor der Generalprobe grün sein.** Das ist die einzige Absicherung. V13 liest zusätzlich ab, dass in den DevTools **keine** `Domain` steht — ein Indiz, kein Beweis |

**Dazu, aus §9.3.1 unverändert übernommen und hier nicht aufgeweicht:**

* **Der Redirect vom Alt-Host `radio-admin.iuk-ue.de` darf vorher NICHT scharf sein.** Er zeigt auf
  `radio.iuk-ue.de/admin`, und dort liegt bis zum Umschwenk die **eigene Verwaltung des Alt-Kiosk**
  (`login.tsx`, `index.tsx`, `history.tsx`, `devices.tsx`, `settings.tsx`,
  `docs/radio-portierung-analyse.md:392-398`). Früh geschaltet führt er jeden Verwaltenden aus einer
  funktionierenden Alt-Verwaltung in die Verwaltung **einer anderen Anwendung** — schlechter als
  nichts zu tun. **Der Redirect wird im selben Fenster wie der Umschwenk scharf, und die drei `curl`
  laufen danach** (§4.6 Nr. 7).
* **Der Login-Rückweg** ist der einzige Fehlfall, der **stumm** ist (§3.2.4). Er entscheidet über Weg A
  oder Weg B, und diese Entscheidung fällt vor dem Fenster.

---

## 3.5 Der Abbruchpunkt: was die Generalprobe rot macht — und was rot bedeutet

**„Rot" heißt vier verschiedene Dinge, und die Unterscheidung ist der Zweck dieses Abschnitts.** Wer
sie im Fenster improvisiert, verschiebt entweder einen behebbaren Fund oder repariert einen, der eine
Absage ist.

### Klasse A — **Absagen, nicht anpassen**

| Fund | Warum Absage |
|---|---|
| **Zehnstellige Zeitstempel** in der Quelle (A6) | „ist die gesamte Import-Annahme falsch und der Cutover wird **abgesagt, nicht angepasst**" — Spec 1 wörtlich. Die Einheitenentscheidung (11), die Mapping-Funktionen und der Riegel `[1e12, 4e12]` hängen daran |
| **Trigger oder Views** in `sqlite_master` (A7) | „Ein Treffer ist Fachlogik, die kein Repo kennt." Der Grep-Beleg der Analyse gilt für den **Quelltext**, nicht für die laufende Datenbank |
| **Der Registry-Eintrag fehlt im Image** (V3 antwortet 503) | Falsches Image. Kein Handgriff am Cutover-Abend behebt das; es braucht einen CI-Lauf. Vorbild derselben Härte: `docs/runbooks/suite-update-webfinger.md:43-45` |

### Klasse B — **in der Kopie bereinigen, Bereinigung protokollieren**

`software_versions where is_target = 1` ≠ 1 (A2): „wird sie **vor** dem Import in der Kopie bereinigt
und die Bereinigung protokolliert" (§9.4.1). Der Update-Stand ist **berechnet, nicht gespeichert**
(`schema.ts:53-56`) — bei 0 oder 2 kippt der angezeigte Status **jedes** Geräts, und keine Parität
sieht es. Ebenso A3 (Waisen löschen, Anzahl ins Protokoll).

⚠️ Die Bereinigung geschieht in der **Kopie** und wird im Echtlauf **wiederholt, nicht vererbt**. Eine
Bereinigung, die nur in der Generalprobe stattfand, ist ein Fund, den das Fenster erneut trifft.

### Klasse C — **reparieren, dann Generalprobe von vorn**

A3 · A4 · A5 · A10 · A11 · jeder Fund aus V1–V16. **„Von vorn" ist wörtlich zu nehmen:**
`rm -rf "$GP"`, neu importieren (§3.1.3). Ein Nachbessern auf dem bestehenden Stand prüft die
Reparatur und nicht den Import.

### Klasse D — **der Fund, der aussieht wie C und keiner ist**

**Ein roter Paritätscheck.** `portal.ts:105-107`: „A thrown parity error means the target was already
mutated … not ‚nothing happened'". Der Rückweg ist **die leere Ziel-DB**, nie ein zweiter Lauf. In der
Generalprobe kostet das ein `rm -rf`; im Echtlauf ist es der Grund, warum Kapitel 4 gegen eine
**leere** Ziel-DB importiert und nicht gegen eine „fast fertige".

### Und die Klasse, die keine ist: ein Startabbruch aus `radioBootFehler()`

Fünf Meldungen (§7.3.3) brechen den Start der **gesamten** Suite ab. Das ist **kein Moduldefekt**,
sondern eine unvollständige Env — behebbar in einer Zeile, und die Probe ist danach zu wiederholen.
§3.2.3 macht diesen Abbruch zum vorgeschriebenen Handgriff, damit er im Fenster wiedererkannt wird.

### Die Grenze, verschieben oder reparieren

> **Verschoben wird bei Klasse A. Repariert wird bei B, C, D — aber niemals im Cutover-Fenster.**
> Jede Reparatur zieht eine vollständige neue Generalprobe nach sich (§3.1.3), und eine vollständige
> Generalprobe passt nicht in ein Fenster ohne Parallelbetrieb.

Der Grund steht in der Lage selbst: es gibt **keinen Rückweg-Importer** (Suite → radio-admin) und kein
Vorbild dafür (`docs/radio-portierung-analyse.md:626-628`). Der Point of no return ist der **erste
fachliche Schreibvorgang in `radio.db`** nach dem Umschwenk. Ein Fund, der im Fenster „schnell" behoben
wird, wird also entweder vor diesem Punkt behoben — oder er wird zu einem Datenverlust mit bekanntem
Umfang.

**Die Abbruchbedingung in einem Satz:** *Die Generalprobe ist grün, wenn G1 bis G6 vollständig grün
sind. Ist eine Zeile rot, ist die Generalprobe rot — es gibt keine teilweise grüne Generalprobe, und
es gibt keinen Cutover auf einer roten.*

---

## 3.6 Was vor der Generalprobe grün sein muss

Voraussetzungen, keine Zusagen. **Alle vier laufen im Repo bzw. am Server, und keiner von ihnen ist
durch eine Betriebsprobe ersetzbar:**

1. Der **Mapping-Unit-Test** aus §1.3.4 mit **je Feld unterschiedlichen** Fixture-Werten, plus die
   zwei anderen Tests aus §1.10.
2. Die **Quelltext-Zusicherung zur Cookie-Domain** aus Spec 1 §3.8 — die einzige Absicherung gegen
   Falle 19 (§3.4).
3. Die **Abwesenheitsprüfung R36** aus §3.2.6 (V8).
4. Der Nachweis **„Retention der Standby-Umgebung neutralisiert oder Volume kopiert"** (§4.2 Nr. 3) —
   ⚠️ **vor dem ersten Generalproben-Snapshot**, nicht vor dem Cutover-Abend (W1).

**In der Generalprobe entstehen außerdem zwei Messungen für Kapitel 4:** Größe der Prod-Volumes und
Dauer von `pg_dump` bzw. `sqlite3 .backup` (**U8**). Sie bemessen das Fenster, und am Cutover-Abend
sind sie zu spät.

---

# 4. Der Cutover selbst

Dieses Kapitel ist der **Ablauf des Fensters**: die Reihenfolge, die `.env`, der Redirect, die
Verifikation, der Rückweg und der Ausstellungsplan für die Zugangscodes. Es führt den Import nicht
selbst (Kapitel 1), beschreibt die Generalprobe nicht (Kapitel 3) und baut nicht ab (Kapitel 5).

## 4.1 Die Reihenfolge, und warum sie nicht tauschbar ist

Freeze → Snapshot → Volume sichern → Import → Parität + Stichproben → `.env` → `up -d` →
Verifikation → **Router**.

⚠️ **Der eine Punkt, an dem die naive Lesart dieser Kette den Cutover bricht:** `SUITE_TRAEFIK_RULE`
wirkt über Traefik-Labels, die beim Containerstart gelesen werden (`compose.yaml:153`). Wer die Regel
in derselben Änderung setzt, in der er `up -d` ruft, **hat den Router damit schon umgeschwenkt** — die
Verifikation liefe dann nach dem Umschwenk, nicht davor. Deshalb wird die `.env` in **einer** Änderung
vorbereitet, aber die drei schaltenden Zeilen bleiben zunächst **ungesetzt** (`SUITE_HOST_RADIO`, die
`SUITE_TRAEFIK_RULE`-Erweiterung, `SUITE_REDIRECT_RULE_RADIO_ADMIN`). Genau so macht es
`docs/runbooks/files-cutover.md:107-109`. **Der Router ist ein eigener, letzter Schritt.**

| # | Schritt | Warum nicht früher | Warum nicht später |
|---|---|---|---|
| 1 | **Freeze** beider Alt-Apps (Schreibwege aus) | — | Jede Ausleihe oder Rückgabe **nach** dem Snapshot steht in einer Datei, die niemand mehr importiert. Der Verlust ist **stumm**: Parität, Zählungen und Health sind grün, die Zeile fehlt einfach |
| 2 | **Echter Snapshot** per `.backup` | Ohne Freeze ist die Kopie ein Zwischenstand mitten in einem Schreibvorgang | Der Import darf **nie** gegen einen laufenden Alt-Stack laufen (§9.3.4 Zeile 2) |
| 3 | **Volume sichern** (Archiv: SQLite-Kopie + `pg_dump` des Kiosk-Postgres) | Der Dump gehört zum eingefrorenen Stand, nicht zu einem späteren | ⚠️ Der Kiosk-Postgres hängt an **keiner** Sicherung, die dieses Repo kennt (`scripts/backup.sh:15-21`). Fällt das Volume ohne Dump, ist die `AdminUser`-Zählung für immer weg |
| 4 | **Import** in `radio.db` | Ohne Snapshot keine stabile Quelle; ohne den **früheren** Deploy (§4.2 Nr. 1) kein Schema, in das geschrieben werden könnte | Der Import ist der langsamste Schritt; nach ihm folgen nur noch Prüfungen |
| 5 | **Parität + feldweise Stichproben + Retention-Gegenprobe** | Ohne Import nichts zu vergleichen | ⚠️ **Die Parität allein gibt die Freigabe nicht her** (Schritt 5) |
| 6 | **`.env` scharf schalten** — ohne die drei Router-Zeilen | Vor dem Import stünden Boot-Prüfungen auf einer Datenlage, die es nicht gibt; und `SUITE_HOST_RADIO` **vor** dem Registry-Eintrag bricht den Start der **ganzen Suite** ab (§4.4.2) | — |
| 7 | **`docker compose up -d`** | — | — |
| 8 | **Verifikation** gegen den **Prüfcontainer** mit vorgetäuschtem `Host`-Kopf | — | Nach dem Umschwenk ist die Prüfung keine Vorprüfung mehr, sondern eine Nachricht über einen bereits sichtbaren Zustand |
| 9 | **Router umschwenken:** Alt-Kiosk vom Traefik-Router nehmen, **dann** die drei Zeilen setzen, `up -d` | Nie zwei Router gleichzeitig; der Alt-Kiosk muss **zuerst** weg, sonst ist nicht deterministisch, wer gewinnt (`files-cutover.md:167-170`) | Ab hier läuft die Uhr für den Rückweg (§4.9) |

**Was zwischen 8 und 9 ausdrücklich nicht passieren darf:** die HTTP-Grenze fällt **mit** dem
Umschwenk, nicht davor (Randbedingung 2). Beides ist mit **einem** Fenster ausgeschlossen — deshalb ist
Schritt 9 **ein** Schritt und nicht zwei.

---

## 4.2 Was vor dem Fenster fertig sein muss

Keine Wiederholung von Kapitel 3, sondern die Menge der Dinge, deren Fehlen das Fenster **verbrennt**.

1. **Der Deploy mit dem Registry-Eintrag und dem Abräum-Worker ist gelaufen — in einem FRÜHEREN
   Fenster.** Beweis, gegen den **laufenden** Container:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://iuk-ue.de/api/health/radio
   #   200 = das Modul ist im Image
   #   503 = falsches Image: getModule(key) wirft bei unbekanntem Key (§7.2.4)
   ```
   ⚠️ **Und im selben Handgriff die ZWEI Ablesungen, ohne die §4.6 Nr. 3 und Schritt 8 keine linke
   Seite haben** — beide ins Protokoll:
   ```bash
   curl -s https://iuk-ue.de/api/health/radio          # das Revisionsfeld des LAUFENDEN Stands
   git rev-parse --short HEAD                          # im Checkout, aus dem gebaut wurde
   docker compose images suite                         # der Image-Digest, der gerade laeuft
   ```
   **Warum das hier steht und nicht am Abend:** §4.6 Nr. 3 und Schritt 8 machen `revision` zum
   „einzigen Beleg, dass wirklich der neue Stand antwortet" und erwarten „`revision` = deployter
   Commit". **Der Sollwert dieser Erwartung entsteht nur hier.** ⬜ L5 sagt, **welches Feld** die
   Revision trägt — nicht, welchen **Wert** sie haben muss. Ohne diese Protokollzeile liest man am
   Abend ein Feld ab, ohne es vergleichen zu können. Der Digest ist die Gegenprobe zu
   `docker compose pull` in Schritt 7 (dort ausgeschrieben).
   **Abbruch:** 503 → der Cutover wird abgesagt, nicht angepasst. Ohne den Registry-Eintrag hat der
   Import kein Zielschema, und `SUITE_HOST_RADIO` in der `.env` bricht den Start der ganzen Suite ab.
2. ⚠️ **Der Abräum-Worker gehört in diesen ersten Deploy, nicht in den Cutover** (Spec 1 §7.1.3,
   Randbedingung 7). Begründung in §4.7.1.
3. **Die Retention der Standby-Umgebung ist neutralisiert oder das Volume ist kopiert** — ⚠️ **vor dem
   ERSTEN Generalproben-Snapshot** (W1), nicht erst „vor dem Cutover-Abend".
   `radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`, `retentionService.ts:47` purgt
   **sofort**, erst `:48` startet den Tagestimer; der Cutoff hängt an der **Wanduhr** (`:9`, `:19`) —
   **jeder weitere Start löscht mehr als der vorige.** Handgriff: `HISTORY_RETENTION_MONTHS` in der
   Standby-Umgebung neutralisieren **oder** das Volume kopieren.
   **Wie man es merkt, wenn es fehlt:** ein **erfolgreicher** Start mit der Protokollzeile
   `[retention] purged N expired loan(s)` (`retentionService.ts:41`) — kein Fehler, kein roter Test.
4. **`SUITE_SEED` ist nicht `1`.** ⚠️ Bei `radio` schärfer als bei jedem bisherigen Modul: ein
   geseedeter Zugangscode wäre ein **gültiger anonymer Zugang** zum gesamten Bestand samt
   Ausleihernamen. (Gegenzusage aus Spec 1: `seedLokal` legt **niemals** eine einlösbare Zugangszeile
   an, §9.3.2 Nr. 2.)
5. **Abgelesen und protokolliert ist, was `radio.iuk-ue.de/admin` und `radio-admin.iuk-ue.de/`
   HEUTE liefern:**
   ```bash
   curl -si https://radio.iuk-ue.de/admin  | head -10   # heute: Alt-Verwaltungsoberflaeche
   curl -si https://radio-admin.iuk-ue.de/ | head -10   # heute: der Alt-Verwaltungshost
   ```
   Beide Ausgaben ins Protokoll. **Sie sind die Vergleichsbasis für §4.6 Nr. 7** und der Beleg dafür,
   dass die Alt-Verwaltung **mit** dem Umschwenk verschwindet und nicht schon vorher.
   ⚠️ **Was hier ausdrücklich NICHT verlangt wird, ist ein aufgelöster Zustand.** Bis zum Umschwenk
   liegt unter `radio.iuk-ue.de/admin` die **eigene Verwaltungsoberfläche des Alt-Kiosk**
   (`docs/radio-portierung-analyse.md:392-398`) — die Kollision **endet definitionsgemäß mit dem
   Umschwenk**, und §4.4.4 sagt selbst „der Redirect wird im selben Fenster wie der Umschwenk scharf,
   nie davor". **Ein Haken „Kollision aufgelöst" wäre vor dem Fenster nicht setzbar**; der Haken, den
   diese Zeile trägt, ist „abgelesen und im Protokoll". Die Auflösung selbst prüft §4.6 Nr. 7.
6. **Der Registry-Code-Default-Abgleich, den kein Boot sehen kann:**
   ```bash
   grep -n 'prodHosts' src/core/registry.ts
   ```
   und die Code-Defaults von Hand gegen die gesetzten `SUITE_HOST_*` vergleichen. Grund: die
   Kollisions-Map in `validateHostConfig` wird **ausschließlich** aus `envHostsFor` gefüllt
   (`src/core/hosts.ts:78-95`) — ein Host, den ein anderes Modul per Registry-`prodHosts` im
   **Code-Default** führt, erreicht sie **nie** und kollidiert ohne jede Meldung. `moduleForHost`
   entscheidet dann nach **Registry-Reihenfolge**, nicht nach Env.
7. **Zwei Messungen aus der Generalprobe liegen vor** (U8): Größe der Prod-Volumes und Dauer von
   `pg_dump` bzw. `sqlite3 .backup`. Sie bemessen das Fenster.
8. ⚠️ **Belegen, dass der Edge-Proxy `X-Forwarded-Host` SETZT statt durchreicht.** Der Host-Riegel löst
   den Host über `resolveHost` auf, und das liest `x-forwarded-host` mit **Vorrang** vor `host`; nach
   dem Rewrite der Middleware ist das die einzig richtige Reihenfolge, aber der Header ist
   client-fälschbar. Der Docblock in `core/routing.ts` begründet die Ungefährlichkeit mit
   `requiresAuth`/`canAccess` als Auffangriegel — **und `requiresAuth: false` entfernt genau diesen
   Auffangriegel** (Entscheidung 4, wörtlich dieselbe Lage wie `lagerbuch-cutover.md:102-118`).
   **Deployment-Invariante, im Repo nicht belegbar** — also **vor** dem Umschwenken am Server belegen
   und ins Protokoll schreiben.
9. **Die Cloudflare-Zonenregeln für `radio.iuk-ue.de` sind gelesen und protokolliert** (§3.4): trägt
   der Host heute Regeln, die der Alt-Kiosk brauchte — Bot Fight Mode, Cache-Regeln, Page Rules?
   Bekannter Bestandsfall im Haus: `iuk-ue.de`/`qr.iuk-ue.de` zeigten Bot-Challenges.
10. **Die Wahl zwischen Weg A und Weg B** für den Login-Rückweg ist getroffen (§3.2.4).
11. **`TZ=Europe/Berlin` ist als Voraussetzung benannt, aber in diesem Fenster NICHT gesetzt.** Es ist
    ein eigener Suite-Posten mit eigener Prüfung gegen **alle** laufenden Module; ein nachträgliches
    `TZ` verschöbe jede Datumsgrenze, die portal, qr, feedback, files, lagerbuch und aufgaben bisher in
    UTC gezogen haben (§9.7). `radio` hängt bewusst nicht daran — die Zone steht in `tagInBerlin`
    (§1.3.2). Wer es doch am Cutover-Abend setzt, ändert sechs fremde Module mit.
12. **⬜ L13 und ⬜ L14 sind abgelesen** — ohne Containername, Port und die Antwort auf „darf ein
    zweiter bootender Container auf `suite_data`?" ist Schritt 8 nicht ausführbar (W5).
13. ⚠️ **Die heutige Router-Konfiguration von `radio.iuk-ue.de` UND `radio-admin.iuk-ue.de` ist
    abgelesen und WÖRTLICH im Protokoll — und der Handgriff, der sie zurückstellt, steht daneben.**
    ```bash
    # label-basierte Regeln (E7 = Traefik-Containername):
    docker inspect <E7> --format '{{json .Config.Labels}}'
    # sonst: die Datei des File-Providers bzw. die Konfiguration des Edge-Proxy —
    # WO sie liegt, ist U4 und wird beim Betreiber eingeholt, nicht geraten.
    ```
    **Warum das eine eigene Vorbedingung ist und keine Fußnote:** in **beiden** eingecheckten
    Alt-Compose-Dateien kommt die Zeichenkette `traefik` **nicht vor** — sie veröffentlichen nur
    `ports:` (`radio-inventar/docker-compose.yml:13`, `:40`; `radio-admin/docker-compose.yml:6`). Es
    gibt also **keine Labels zu entfernen** und keine Datei im Repo, in der man sie sucht; die heutige
    Regel für `radio.iuk-ue.de` liegt **außerhalb** dieses Repos. Damit hängen daran **drei** Schritte,
    nicht einer: Schritt 9 Nr. 1 („Alt-Router zuerst weg") hat ohne diese Protokollzeile **kein
    ausführbares Ziel**, und §4.9 3c/3d hat **nichts zurückzustellen**. Der Rückweg ist hier der
    **einzige** Rückweg (Randbedingung 1). ⛔ **Fehlt die Zeile, wird das Fenster nicht eröffnet** — um
    21 Uhr ist das Rekonstruktionsarbeit an einer fremden Proxy-Konfiguration. Quelle: **U4**.

---

## 4.3 Die Eingaben: was nur der Betreiber oder der Server hergibt

Vollständig in der Tabelle im Kopf dieser Spec (**E1–E8**, **U4–U9**). Zwei Anmerkungen, die im Fenster
teuer sind:

⚠️ **Zu E1:** Gruppen werden im JWT nur beim Login und beim Token-Refresh nachgezogen — ein
Gruppenentzug oder eine frisch angelegte Gruppe wirkt mit bis zu **einer Stunde** Verzug (`CLAUDE.md`,
Abschnitt Zugriffsschutz). Wer die Gruppe am Cutover-Abend anlegt, prüft die Verwaltung **nach einer
neuen Anmeldung**, nicht mit der offenen Sitzung.

⚠️ **Zu U4/C.5:** solange offen ist, wer das `radio-inventar`-Frontend ausliefert, **blockiert es den
Freeze** (Schritt 1) — nicht erst den Abbau. Ein unbekannter Auslieferungsweg ist ein Schreibweg, den
niemand gestoppt hat, und der Verlust ist stumm.

---

## 4.4 Die `.env`

### 4.4.1 Die Zeilen, ausgeschrieben

Alle Zeilen in **einer** Änderung, aber die drei mit ⏸ markierten bleiben bis Schritt 9 **ungesetzt**.
⚠️ **Sie stehen im Block ABSICHTLICH auskommentiert** — wer den Block unter Zeitdruck kopiert, bekommt
damit den richtigen Zustand *vor* dem Umschwenk. Sie werden in Schritt 9 einkommentiert, nicht neu
getippt.

```dotenv
# ── im Block „Prod-Domains der Module" (.env.example:112) ──
# ⏸ SUITE_HOST_RADIO=radio.iuk-ue.de        # erst in Schritt 9

# ── Block „── Modul radio ──" (neu, nach dem lagerbuch-Block, vor .env.example:309) ──
SUITE_ADMIN_GROUP_RADIO=<E1>
# SUITE_ACCESS_GROUP_RADIO  — DIESE ZEILE DARF NICHT EXISTIEREN. Siehe unten.
RADIO_AUSLEIH_SITZUNG_SECRET=<openssl rand -base64 32, frisch, NICHT gleich AUTH_SECRET>
RADIO_AUSLEIH_SITZUNG_STUNDEN=<E4, Vorschlag 12>
RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=5
RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=30
RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=300
RADIO_HISTORIE_PURGE=0          # Cutover-Schalter, wird nach dem Fenster ENTFERNT (§4.6 Nr. 14 — Retention wieder einschalten)
# RADIO_HISTORIE_MONATE=2                 # Vorbelegung, im Fenster nicht setzen
# RADIO_HISTORIE_ERSTLAUF_MINUTEN=1440    # Vorbelegung, im Fenster nicht setzen

# ── neben der SUITE_TRAEFIK_RULE-Zeile (.env.example:366-369) ──
# ⏸ SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`) || … || Host(`radio.iuk-ue.de`)   # erst in Schritt 9
# ⏸ SUITE_REDIRECT_RULE_RADIO_ADMIN=Host(`radio-admin.iuk-ue.de`)          # erst in Schritt 9
```

⚠️ **`SUITE_TRAEFIK_RULE` ist bis Schritt 9 nicht „weg", sondern trägt ihren bisherigen Wert weiter** —
sie führt heute schon die Hosts der sechs laufenden Module. Auskommentiert wird nur die **erweiterte**
Fassung; die bestehende Zeile bleibt unverändert stehen, bis sie in Schritt 9 ersetzt wird. Wer sie
versehentlich auskommentiert, nimmt mit **einem** Handgriff sechs fremde Module vom Netz
(Vorbelegung ``Host(`iuk-ue.de`)``, `compose.yaml:153`).

⚠️ **Die Namen `RADIO_AUSLEIH_SITZUNG_SECRET` und `RADIO_AUSLEIH_SITZUNG_STUNDEN` sind B1/B2** — nicht
`RADIO_ZUGANG_*`, nicht `…_GEHEIMNIS`. Die drei `RADIO_GATE_*`-Namen sind B18.

| Variable | Wert | Was passiert, wenn sie fehlt oder falsch ist |
|---|---|---|
| `SUITE_HOST_RADIO` | `radio.iuk-ue.de` | Fehlt sie: `moduleForHost` fällt auf **portal** zurück (`hosts.ts:52-57`), der Rewrite auf `/m/radio<rest>` greift nicht, `/sw.js` landet im Portal-Modul, und der Login-Rückweg wirft auf das Portal (`:59-63`). **Alles davon still.** ⚠️ Bei `radio` schärfer als sonst: der Portal-Fallback überdeckt die **Ausleihe** — die anonyme Fläche, die kein Anmeldefenster zeigt, an dem jemand den Fehler bemerkt |
| `SUITE_ADMIN_GROUP_RADIO` | `<E1>`, **nicht leer** | Leer oder fehlend = **Startabbruch** (§7.3.3 Nr. 1). Der Boot-Riegel existiert genau deshalb: die Alternative wäre ein **stummes 404 für JEDE Verwaltungsseite und alle Verwaltenden auf einmal** — `radio` ignoriert den `isModuleAdmin`-Kurzschluss modulintern (Entscheidung 9), es gibt keine Suite-Admin-Rückfallebene |
| `SUITE_ACCESS_GROUP_RADIO` | ⚠️ **Zeile gar nicht vorhanden** | ⚠️ **Diese Variable invertiert `SUITE_HOST_RADIO`, und die naheliegende Zeile ist der Startabbruch.** Die Prüfung ist `!== undefined` (§7.3.3 Nr. 2), und ein `SUITE_ACCESS_GROUP_RADIO=` kommt per `env_file` als **leerer String**, also als *definiert*, im Prozess an → **Boot-Abbruch**. Gemeint ist: die Zeile **ersatzlos entfernen**. Wäre sie gesetzt und würde nicht geprüft, wäre sie **still wirkungslos** (`registry.ts:239`) |
| `RADIO_AUSLEIH_SITZUNG_SECRET` | frisch, ≥ 32 Zeichen | Fehlt, zu kurz, **oder gleich `AUTH_SECRET`** → **Startabbruch** (§7.3.3 Nr. 3). ⚠️ **Hier gibt es nichts zu erben** — anders als bei `lagerbuch`, wo `HELFER_SESSION_SECRET` wertgleich aus der Prod-`stack.env` übernommen wurde, damit laufende Sitzungen den Cutover überleben (`.env.example:252-258`). Der heutige Zugang des Kiosk ist ein base64-Bearer-Token im `localStorage`, kein signiertes Cookie. **Wer nach einem zu übernehmenden Wert sucht, sucht vergeblich** |
| `RADIO_AUSLEIH_SITZUNG_STUNDEN` | `<E4>`, ganze Zahl `1..168` | Außerhalb des Bereichs → **Startabbruch** (§7.3.3 Nr. 5). Ohne die Zeile gilt die Vorbelegung 12 |
| `RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN` | `5` | Je Absender, **nur Fehlversuche** (§3.7.2). Keine ganze Zahl im Bereich → Startabbruch über `zahlFehler` |
| `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN` | `30` | Modulweite Burst-Kappe gegen Rotation des Absenderschlüssels (= sechs Absender-Budgets) |
| `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` | `300` | Der tragende Zähler (= 5/min × 60). ⚠️ Die drei Grenzen sind ab dem ersten Import **eingefroren**; eine geänderte `.env` wirkt erst nach einem Neustart (`grenzen()` steht auf Modulebene). ⚠️ Solange die CWE-348-Umstellung in `src/core/ratelimit.ts` aussteht (eigener Suite-Posten), ist die Absenderkennung fälschbar und diese Schranke eine **Bremse, kein Riegel** — das steht hier, damit sie niemand für mehr hält |
| `RADIO_HISTORIE_PURGE` | `0` **im Fenster** | Die zweite Hälfte der Faktor-1000-Absicherung. Wird nach dem Fenster entfernt — **erst wenn R und Z grün protokolliert sind** (W10, §4.6 Nr. 14 — Retention wieder einschalten) |
| `SUITE_TRAEFIK_RULE` | bestehende Hosts **plus** ``\|\| Host(`radio.iuk-ue.de`)`` | Ohne die Erweiterung erreicht die Domain den Container gar nicht erst (`compose.yaml:149-153`). Bestehende Hosts **übernehmen**, nicht ersetzen. ⚠️ **`radio-admin.iuk-ue.de` gehört dort ausdrücklich NICHT hinein** — §4.4.4 |
| `SUITE_REDIRECT_RULE_RADIO_ADMIN` | ``Host(`radio-admin.iuk-ue.de`)`` | Solange ungesetzt, existiert der Redirect-Router und trifft nichts (Vorbelegung `radio-admin.invalid`). Wird in **derselben** Änderung gesetzt wie `SUITE_HOST_RADIO` |

**Was ausdrücklich nicht entsteht:** kein `RADIO_ADMIN_URL`, kein `RADIO_ADMIN_API_TOKEN`, kein
`POCKET_ID_*` für `radio`. `api_tokens` trug produktiv genau einen Konsumenten (Randbedingung 5), und
der verschwindet mit dem Port. **Eine Variable dafür wäre ein Angebot an einen Konsumenten, den es
nicht gibt.**

### 4.4.2 Was den Boot abbricht — und was STILL auf den Portal-Fallback zurückfällt

Nachgeschlagen in `src/core/hosts.ts` zum Zeitpunkt des Schreibens.

**Abbruch (drei Dinge, und nur diese drei, aus `validateHostConfig`, `:65-99`):**

1. Ein `SUITE_HOST_*`, dessen Suffix zu **keinem** Modul-Key passt (`:69-76`). ⚠️ **Daraus folgt die
   einzige Reihenfolge, die ein Cutover selbst verletzen kann: erst der Registry-Eintrag im Image,
   dann die `.env`.** Solange `key: "radio"` in `src/core/registry.ts` fehlt, bricht
   `SUITE_HOST_RADIO` **oder** `SUITE_ADMIN_GROUP_RADIO` den Start der **ganzen Suite** ab — nachweisbar
   vermeidbar über §4.2 Nr. 1 (200 statt 503).
2. Ein Wert mit `/` oder `:` (`:81-85`) — reiner Hostname, ohne Protokoll, ohne Port.
3. Ein Host, den **zwei per Env gesetzte** Module beanspruchen (`:87-93`).

Dazu die fünf modul-eigenen Abbrüche aus `radioBootFehler()` (§7.3.3): leere Admin-Gruppe · gesetztes
`SUITE_ACCESS_GROUP_RADIO` · fehlendes/zu kurzes/gleiches Sitzungsgeheimnis · `RADIO_HISTORIE_MONATE`
keine ganze Zahl ≥ 1 · `RADIO_AUSLEIH_SITZUNG_STUNDEN` außerhalb `1..168`. Jeder zurückgegebene String
**ist** ein Startabbruch: `assertHostConfig` wirft bei `length > 0` (`src/core/bootstrap.ts:92`).

**Still (drei Ausprägungen, jede mit ihrem eigenen Handgriff — §7.4.4):**

| Stiller Fall | Beleg | Handgriff, und wo er in diesem Kapitel steht |
|---|---|---|
| **Richtig geschriebener, falscher Hostname.** `SUITE_HOST_RADIO=falsch.example.com` ist von einem Tippfehler nicht zu unterscheiden; `moduleForHost` fällt auf **portal** zurück, `radio.iuk-ue.de` zeigt stillschweigend das Portal | `src/core/hosts.ts:52-57` (wörtlich: „der Host fällt dann in `moduleForHost` auf das Portal zurück und die QR-Domain zeigt stillschweigend das Portal") | **Eigener Verifikationsschritt** §4.6 Nr. 1 + Nr. 3 + Nr. 5. Bei `files` war das ebenfalls ein eigener Schritt, kein Nebensatz |
| **Der Login-Rückweg, den kein `curl` sieht.** Fehlt die Variable, wirft Auth.js den Nutzer nach dem Login **aufs Portal**, ohne Fehler und ohne Meldung | `src/core/hosts.ts:59-63` (wörtlich: „Ein curl sieht davon nichts") | **Handarbeit**, §4.6 Nr. 10 — und dieselbe Person stellt den ersten Zugangscode aus (§4.8.2), damit der Schritt nicht vergessen wird |
| **Die Kollision, die `validateHostConfig` strukturell nicht sehen kann** — ein Host im Registry-**Code-Default** eines anderen Moduls erreicht die Kollisions-Map nie | `src/core/hosts.ts:78-95`; `docs/radio-portierung-analyse.md:798-804` | **Vor** dem Fenster, §4.2 Nr. 6 |

⚠️ **Und der stille Fall, den nur eine Protokollzeile findet:** `SUITE_HOST_RADIO` gesetzt, aber in
`SUITE_TRAEFIK_RULE` nicht enthalten — die Domain ist tot, ohne dass etwas kaputt aussieht. Das
**meldet** (`console.warn`), es wirft nicht: die Labels leben in der `.env` auf dem Server, und ein
Abbruch träfe genau in dem Moment, in dem der Betreiber die `.env` gerade umstellt (§7.3.4). Deshalb
§4.6 Nr. 9: **`warn` = Stopp, `info` = Zustand.**

### 4.4.3 Rollback ist die leere Zeile, nicht die gelöschte

`SUITE_HOST_RADIO=` ergibt `[]` (bewusst **keine** Prod-Hosts). Das **Entfernen** der Variable ergibt
`null` und damit den Code-Default aus der Registry (`src/core/hosts.ts:33-46`). Mit `prodHosts: []` ist
der Unterschied heute wirkungsgleich — aber nur heute, und die leere Zeile ist die Form, die sagt, was
gemeint ist.

⚠️ **Die beiden Formen sind bei `radio` gegenläufig, und das ist die Zeile, die man am leichtesten
verkehrt schreibt:**

* `SUITE_HOST_RADIO=` → **leer, Zeile bleibt stehen.** Das ist der Rückweg.
* `SUITE_ACCESS_GROUP_RADIO` → **Zeile weg.** Ein leerer Wert ist hier der **Startabbruch**.

### 4.4.4 Der Redirect vom Alt-Host

**Muss `radio-admin.iuk-ue.de` in `SUITE_TRAEFIK_RULE` stehen? Nein — ausdrücklich nicht.** Wer ihn
dort mit aufnimmt, bekommt **nicht** den Redirect, sondern den stillen Portal-Fallback: der Host
erreicht den Container, kein `SUITE_HOST_*` beansprucht ihn, und `decideRoute` schreibt auf portal um
(`const mod = moduleForHost(host) ?? getModule("portal")`, `src/core/routing.ts:69`). Der Alt-Host zeigt
dann das **Portal** — ein funktionierender Ausdruck mit falschem Inhalt, und **kein Test des Repos sieht
Traefik-Labels an**. Genau diesen Fall meldet die Boot-Warnung „`SUITE_TRAEFIK_RULE` enthält einen
Host, der mit `radio-admin.` beginnt" (§7.3.4).

Der Redirect braucht deshalb einen **zweiten, eigenen Router** mit eigener Middleware:

```yaml
# in compose.yaml, am selben Service `app`, unter den bestehenden Labels
- traefik.http.routers.radio-admin-alt.rule=${SUITE_REDIRECT_RULE_RADIO_ADMIN:-Host(`radio-admin.invalid`)}
- traefik.http.routers.radio-admin-alt.entrypoints=web
- traefik.http.routers.radio-admin-alt.middlewares=radio-admin-alt-redirect
- traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.regex=^https?://radio-admin\.iuk-ue\.de/(.*)
- traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.replacement=https://radio.iuk-ue.de/admin/$${1}
- traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.permanent=false
```

⚠️ **Es gibt im Repo kein erprobtes Vorbild.** `rg -n -i redirectregex compose.yaml .env.example docs/`
trifft ausschließlich `docs/radio-portierung-analyse.md` (`:1654`, `:1660`, `:2105`, `:2287`). Das ist
ein **Entwurf** — und deshalb sind die drei `curl` aus §4.6 Nr. 7 protokollpflichtig, nicht optional.

Sechs Punkte, jeder mit seinem Preis:

1. **Middleware am Router, nicht am Service.** Am Service träfe der Redirect auch die Suite selbst.
2. **`permanent=false` → 302, nie 301.** Ein 301 liegt im Cache jedes Telefons, das den Alt-Host je
   besucht hat, und macht den Rückweg praktisch unmöglich.
3. **`$$` gegen die Compose-Interpolation.** `$${1}` erreicht Traefik als `${1}`; ein einfaches `$`
   verschluckt Compose, und die Ersetzung liefert `/admin/` für **jeden** Pfad. Der Redirect
   funktioniert dann, ist aber nicht mehr pfaderhaltend — **der stille Fehlfall dieses Blocks.**
4. **Pfaderhaltend heißt:** `radio-admin.iuk-ue.de/geraete` → `radio.iuk-ue.de/admin/geraete`. Die
   Alt-Verwaltung bediente ihre Oberfläche ab `/`; das neue Präfix ist `/admin`.
5. **Eigene Variable mit unschädlicher Vorbelegung.** `radio-admin.invalid` löst niemand auf; ohne
   Vorbelegung scheitert `docker compose config`, sobald die Variable fehlt. ⚠️ Der Name ist bewusst
   **nicht** `SUITE_HOST_`-präfigiert: `const PREFIX = "SUITE_HOST_"` (`src/core/hosts.ts:20`), und
   `validateHostConfig` bricht bei jedem Namen mit diesem Präfix ab, der zu keinem Modul-Key passt.
   `SUITE_REDIRECT_RULE_RADIO_ADMIN` ist damit boot-neutral.
6. ⚠️ **`entrypoints=web` ist richtig, und der Grund gehört hierher, weil er sonst wie ein Fehler
   aussieht.** Nachgeschlagen: der bestehende Suite-Router trägt genau dieselbe Zeile —
   `traefik.http.routers.iuk-suite.entrypoints=web` (`compose.yaml:154`) — und **im ganzen Compose gibt
   es kein `tls`- und kein `certresolver`-Label.** TLS endet also **vor** Traefik, an einem Edge-Proxy;
   `lagerbuch-cutover.md:102-105` nennt denselben Umstand als „Deployment-Invariante, im Repo nicht
   belegbar". Der Redirect-Router muss deshalb **dieselben** Entrypoints führen wie der Suite-Router.
   Führt er einen anderen, oder lernt der Edge-Proxy den Alt-Host nicht kennen, antwortet
   `https://radio-admin.iuk-ue.de/` über HTTPS **gar nicht** oder mit einem Zertifikatsfehler, und die
   drei `curl` laufen ins Leere, statt rot zu werden — also **keine** 302-Zeile, sondern ein
   Verbindungs- oder TLS-Fehler. **Welche Entrypoints der Edge-Proxy weitergibt und ob
   `radio-admin.iuk-ue.de` dort bekannt ist: Server-Ablesung (U-Tabelle im Kopf), keine Repo-Frage.**

⚠️ **Der Redirect wird im selben Fenster wie der Umschwenk scharf, nie davor** (§4.2 Nr. 5, §3.4).

⚠️ **Der DNS-Eintrag `radio-admin.iuk-ue.de` muss BLEIBEN, solange der Redirect steht.** Er ist die
Abhängigkeit des Redirects, kein Abbau-Posten. Der Redirect fällt, sobald im Traefik-Zugriffsprotokoll
über **vier zusammenhängende Wochen** kein Treffer mehr erscheint — und dann in dieser Reihenfolge:
Labels aus `compose.yaml`, `SUITE_REDIRECT_RULE_RADIO_ADMIN` aus der `.env`, **DNS zuletzt** (§5.6).

#### Der Preis: die Regel lebt auf dem Server, nicht im Repo

Die Labels sind **Struktur** und gehören als echte, per Env parametrisierte Labels in die
**Repo**-`compose.yaml`. Die zwei **Werte** leben in der `.env` **auf dem Server** und sind in keinem
Repo nachlesbar. Damit die nächste Sitzung sie kennt, gehören sie an **drei** Orte:

1. **`compose.yaml` im Repo** — die sechs Label-Zeilen oben, parametrisiert, mit Vorbelegung.
2. **`.env.example`, neben der `SUITE_TRAEFIK_RULE`-Zeile (`:366-369`)** — als kommentierter Block plus
   Rollback-Handgriff, wie `.env.example:231-239` es für `lagerbuch` vormacht.
3. **Ins Cutover-Protokoll, wörtlich, beide gesetzten Werte** — plus nach dem Deploy:
   ```bash
   docker compose config | grep -A2 radio-admin-alt
   ```
   damit protokolliert ist, was Traefik **tatsächlich** bekommt.

⚠️ **Die Behauptung, am 19.07. seien Repo- und Server-`compose.yaml` auseinandergelaufen, ist im Repo
nicht nachweisbar** und steht deshalb als **U9**, nicht als Tatsache. Die Aufschreibpflicht aus (1)–(3)
hängt **nicht** daran: sie folgt schon aus „Struktur gehört ins Repo".

---

## 4.5 Der Ablauf im Fenster, Schritt für Schritt

Jeder Schritt: Befehl · Erwartung · **was ihn scheitern lässt und wie man es merkt.** Ergebnis
danebenschreiben, nicht nur abhaken (`files-cutover.md:192-196`).

### Schritt 1 — Freeze

```bash
date -u +%Y-%m-%dT%H:%M:%SZ            # → <freeze_iso>, ins Protokoll (W3)
docker compose -f radio-admin/docker-compose.yml stop app
# und im selben Handgriff der Kiosk. ⚠️ `--profile full-app` gehoert IN den stop-Befehl:
# `backend` steht hinter `profiles: ["full-app"]` (radio-inventar/docker-compose.yml:26-27),
# und ob eine Compose-Version das Profil beim namentlichen Aufruf selbst aktiviert, ist
# versionsabhaengig. Ohne das Profil kann der Stopp ein No-op sein — und ein No-op sieht
# wie ein Erfolg aus.
docker compose -f radio-inventar/docker-compose.yml --profile full-app stop backend

# ---- RUECKLESUNG. Der Freeze ist der einzige Schritt, dessen Wirkung man SOFORT
#      pruefen kann und muss — sonst faellt sein Fehlfall erst in Schritt 5 auf.
docker compose -f radio-admin/docker-compose.yml ps
docker compose -f radio-inventar/docker-compose.yml --profile full-app ps
# Erwartung: `app` und `backend` mit Status `exited`; `postgres` weiter `running`
# — Schritt 3 braucht ihn fuer den pg_dump.

# ---- Und der dritte Handgriff, der die U4-Luecke sichtbar macht:
curl -si https://radio.iuk-ue.de/ | head -3
# Erwartung: Verbindungsfehler oder 5xx. Eine BEDIENBARE Alt-Oberflaeche heisst:
# der Auslieferungsweg aus U4 laeuft noch. Dann wird das Fenster ANGEHALTEN,
# nicht fortgesetzt.
```

⚠️ **Die drei gestoppten Dinge sind die Liste, die der Rückweg später wieder startet** —
`radio-admin/app`, `radio-inventar/backend` **und** der Auslieferungsweg des Frontends (U4). **Der
Stopp-Befehl jedes dieser drei gehört wörtlich ins Protokoll**, weil §4.9 3a–3d ihn als Start-Befehl
zurücklesen muss (§4.9).

**Erwartung:** beide Schreibwege sind zu. `radio.iuk-ue.de` ist ab hier nicht bedienbar — das ist der
Beginn der angekündigten Auszeit, nicht ein Fehler.
**Der ISO-Zeitstempel ist ab hier der Cutoff jeder Vergleichsrechnung** (W3, Abfrage R).
**Scheitert an:** einem noch laufenden zweiten Frontend-Prozess. ⚠️ `radio-inventar/docker-compose.yml`
führt nur `postgres` und `backend` (letzteres hinter einem Profil) — **wer das Frontend ausliefert, ist
offen (U4/C.5)** und muss vor dem Freeze bekannt sein, sonst bleibt ein Schreibweg offen, den niemand
gestoppt hat.
**Wie man es merkt: an der Rücklesung oben, im selben Schritt** — `ps` zeigt einen Dienst weiter
`running`, oder `curl` liefert eine bedienbare Alt-Oberfläche. ⚠️ **Ohne die Rücklesung fällt es erst in
Schritt 5 auf** (Zeilenzahlen weichen von Schritt 2 ab), also **nach** dem Import — und der Verlust
selbst bleibt stumm: jede Ausleihe nach dem Snapshot steht in einer Datei, die niemand importiert,
während Parität, Zählungen und Health grün sind (§4.1).

### Schritt 2 — Echter Snapshot

```bash
docker volume ls | grep -i radio-data            # → E2, ins Protokoll
VOL=<die Zeile aus dem Befehl oben>
docker run --rm -v "$VOL":/d -v "$PWD":/out alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1;
         sqlite3 /d/data.sqlite ".backup /out/radio-admin-snapshot.sqlite"'
```

⚠️ **`.backup`, nicht `cp`** (W1) — ein `cp` verliert den WAL-Schwanz, und der Fehler ist paritätsgrün.
**Erwartung:** eine Datei `radio-admin-snapshot.sqlite` mit plausibler Größe.
**Scheitert an:** dem **deklarierten** statt dem echten Volume-Namen. Compose präfixt deklarierte
Volumes mit dem Projektnamen (`radio-admin_radio-data`); ein `-v radio-data:/d` legt ein **neues,
leeres** Volume an — laut, aber ein verbrannter Schritt im Fenster.
**Wie man es merkt:** `unable to open database file` bzw. eine Snapshot-Datei von wenigen Kilobyte.

⚠️ **Die lokale `radio-admin/data/data.sqlite` ist als Beleg unbrauchbar** (Randbedingung 8). **Jede**
Zahl kommt aus dem Snapshot, nie aus dieser Datei.

**Und im selben Schritt die Zählungen gegen die Kopie**, die die Sollwerte setzen: **A1–A13
vollständig** (§2.4), plus **Glied (1) und (2) der Zählkette** (§1.8) — Reihenfolge zwingend
**Freeze → Zählung (1) → `.backup` → Zählung (2)**, weil nur (1)→(2) einen abgeschnittenen Snapshot
findet. Zwei Abfragen sind **Abbruchbedingungen des Fensters**: **A6** (zehnstellig → **abgesagt, nicht
angepasst**) und **A10/A11**.

### Schritt 3 — Volume sichern (Archiv)

```bash
# radio-inventar: Werte ZUERST ablesen, dann dumpen (E3)
docker compose -f radio-inventar/docker-compose.yml exec -T postgres printenv POSTGRES_USER
docker volume ls | grep -i postgres_data

docker compose -f radio-inventar/docker-compose.yml exec -T postgres \
  pg_dump -U "<echter POSTGRES_USER>" -d radio_inventar --format=custom \
  > radio-inventar-final-$(date +%Y%m%dT%H%M%S).dump
```

**Erwartung:** ein Dump mit plausibler Größe, in der Archivablage.
**Scheitert an:** übernommenen **Vorbelegungen** statt gelesenen Werten. `POSTGRES_USER` trägt nur
einen `:-radio`-Default (`radio-inventar/docker-compose.yml:7`); nur `POSTGRES_DB: radio_inventar` ist
hart gesetzt (`:10`).
**Wie man es merkt:** `FATAL: role "radio" does not exist`.

⚠️ **Der Kiosk-Postgres fällt aus jeder Sicherung heraus, die dieses Repo kennt** (`scripts/backup.sh`
kennt `*.db` und `BLOB_DIR`, `:15-21`). **Dieser Dump ist der einzige.** Er ist zugleich die
Voraussetzung dafür, dass die `AdminUser`-Zählung überhaupt noch möglich ist — **ein gelöschtes Volume
nimmt die Antwort mit** (`docs/radio-portierung-analyse.md:814-816`). Die fünf Postgres-Zählungen
(P1–P5) sind **Abbau**-Schritte (§5.2.3), brauchen aber dieses Volume.

**Dazu die Archivprobe:** beide Archivdateien werden **geöffnet** (§5.2.4) — der Schritt, den Spec 1
nicht führt.

### Schritt 4 — Import

Der Importer ist `scripts/import/radio.ts`, **committet, mit Test** — kein Handgriff am Server und kein
nicht committetes Skript (§9.1). Die Aufrufform ist die der Generalprobe (§1.5.3, §3.1.2): dasselbe
Skript, dasselbe positionale Argument, ein **anderes `DATA_DIR` je Lauf.**

⚠️ **`$DATA_DIR/radio.db` gibt es auf dem HOST nicht.** `DATA_DIR=/data` ist ein Wert **im Container**
(`compose.yaml:79`); dort mountet `compose.yaml:99` das **benannte Volume** `suite_data`
(`compose.yaml:252-254`), und ein benanntes Volume hat keinen vereinbarten Host-Pfad. Der Import
dagegen läuft zwingend aus einem **Repo-Checkout auf dem Host** (§3.1.2 Nr. 2 — das standalone-Image
führt weder `scripts/` noch `tsx`). Deshalb sind es **vier Handgriffe** und nicht zwei: der Import
schreibt auf den Host, und **ein eigener Container legt die Datei ins Volume** — dieselbe
`docker run`-Form wie §2.2.2, mit **ausgeschriebenen** Pfaden.
⛔ **Nicht `DATA_DIR=/data` auf dem Host.** Unprivilegiert scheitert `mkdirSync` auf `/` mit `EACCES`
(laut, ein verbrannter Schritt); als `root` entsteht `/data/radio.db` **auf dem Host**, der Import
läuft durch, und die Abschlusszeile meldet **Parität grün** — Parität vergleicht beide Arme durch
**dasselbe** Handle und ist grün, egal wo die Datei liegt (§2.1.2). Schritt 5 (a) läse dann dieselbe
falsche Datei und bestätigte sie; alle vier Freigabeprüfungen wären grün, während Schritt 7 im
Container eine **nagelneue leere** `radio.db` bekommt. Das ist der Fall aus §4.6 Nr. 4 — er entsteht
nicht aus einem Tippfehler, sondern aus der falschen Zugriffsform.

```bash
# --- 0) Kennung aus dem Image ablesen. Dieselbe Ablesung wie §3.1.2 Handgriff 0,
#        aber die Werte gehen in DAS FENSTER-Protokoll — nicht aus dem Probenprotokoll
#        uebernommen, nicht als 1001:1001 eingetragen (Dockerfile:42-43, :72, :88).
IMG=ghcr.io/rubenvitt/iuk-suite:latest
UID_APP=$(docker run --rm --entrypoint sh "$IMG" -c 'id -u')
GID_APP=$(docker run --rm --entrypoint sh "$IMG" -c 'id -g')

# --- 1) Volume-Namen ABLESEN, nicht raten (E2-Muster, §2.2.2). Ins Protokoll.
docker volume ls | grep -i suite
VOL_SUITE=<die Zeile aus dem Befehl oben>        # in Prod: suite_data

# --- 2) Import auf dem HOST, in ein WEGWERF-DATA_DIR — die Form aus §3.1.2.
#        `data/files` mit anlegen: die Boot-Pruefungen JEDES Moduls laufen mit (§3.1.2 Nr. 1).
IMP="$HOME/cutover-radio"
rm -rf "$IMP" && mkdir -p "$IMP/data/files"
DATA_DIR="$IMP/data" pnpm exec tsx scripts/import/radio.ts ./radio-admin-snapshot.sqlite

# --- 3) Erst NACH gruener Paritaet ins Volume — §2.2.2-Form, Pfade ausgeschrieben,
#        Loeschung und Eigentumsuebergabe IM Container. Keine Variable, die
#        nirgends gesetzt ist.
docker run --rm -v "$VOL_SUITE":/data -v "$IMP/data":/neu \
  -e UID_APP="$UID_APP" -e GID_APP="$GID_APP" alpine sh -c '
    rm -f /data/radio.db /data/radio.db-wal /data/radio.db-shm
    cp /neu/radio.db* /data/
    chown "$UID_APP:$GID_APP" /data/radio.db*
    ls -ln /data'
```

**Erwartung Handgriff 3:** `ls -ln /data` zeigt `radio.db` mit **derselben numerischen Kennung** wie die
übrigen Modul-Datenbanken im Volume.
**Scheitert an:** einem **erfundenen** Volume-Namen — dann legt `docker run` ein neues, leeres Volume
an, `ls -ln /data` zeigt **nur** `radio.db` und keine der sechs anderen Modul-Datenbanken. ⚠️ **Das ist
das Erkennungsmerkmal**, und es ist der einzige billige: eine Zählung `0` in Schritt 5 (a) ist danach
ein **Volume-Fehler, kein Datenbefund.**
⚠️ **Das `radio.db` im Volume MUSS vorher da sein und MUSS weg:** §4.2 Nr. 1 hat `/api/health/radio`
mit 200 beantwortet, und das heißt, `openModuleDatabase` hat die Datei bereits angelegt
(`src/core/db/index.ts:12-22`). Die Löschung ist notwendig, nicht zeremoniell.
⚠️ **Der `chown` ist keine Kür:** `Dockerfile:88` startet den Prozess als `USER nextjs`, `Dockerfile:72`
übereignet den Mountpunkt. Eine root-eigene `radio.db` lässt die **Migrationen beim Boot** mit
`SQLITE_CANTOPEN` scheitern — laut, im Container-Log, aber ein verbrannter Durchlauf (§3.1.2
Handgriff 0/3).
**Der Rückweg bei roter Parität ist die LEERE Ziel-DB** (§1.5.2) — hier **stärker** als dort
beschrieben: bei rot wird Handgriff 3 **gar nicht gefahren**, das Volume bleibt unangetastet, und der
Rückweg ist `rm -rf "$IMP"`. §1.5.2 und §3.1.3 („jede Generalprobe beginnt mit einem leeren
`DATA_DIR`") behalten ihren Wortlaut für den **Host-**`DATA_DIR`; im Fenster ist der Host-`DATA_DIR`
das Wegwerf-Verzeichnis aus Handgriff 2.
⚠️ **Die Zahlen aus Schritt 5 (a) gelten nur, wenn `VOL_SUITE` aus derselben Protokollzeile stammt,
gegen die Handgriff 3 und Schritt 8 gefahren sind.** Drei verschiedene Ablesungen desselben Namens sind
drei Gelegenheiten für drei verschiedene Volumes.

Einfügereihenfolge `users`, `software_versions` → `devices` → `device_events` → `loans` (§1.5.1),
Spalten **namentlich** (§1.2), `api_tokens` wandert nicht (W4), `zugangscodes` ist **nicht Teil des
Imports** (§1.4.6).

**Scheitert an:** der FK-Kante (A3) oder einem `device_events.source`, den das TS-Enum nicht kennt (A5).
**Wie man es merkt:** harter Abbruch mit SQLITE-Constraint-Fehler. **Das ist der gute Fall.**

### Schritt 5 — Parität, Stichproben, Retention-Gegenprobe

⚠️ **Dieser Schritt ist der Grund, warum dieses Kapitel überhaupt lang ist. Die Parität allein gibt die
Freigabe nicht her** (§2.1.2, `CLAUDE.md`: „Paritätscheck beweist den Datenbank-Rundlauf, nicht die
Richtigkeit der Feldzuordnung").

**Vier Prüfungen, alle vier Pflicht:**

**(a) Die FÜNF Zählungen, paarweise gegen die Sollwerte aus Schritt 2 — nicht in der Summe** (W4).
⚠️ **Gelesen wird die Datei IM VOLUME, mit der `docker run`-Form aus §2.2.2** — `sqlite3` auf dem Host
gegen `"$DATA_DIR/radio.db"` liest einen Pfad, den es auf dem Host nicht gibt (Schritt 4). `$VOL_SUITE`
ist **dieselbe Protokollzeile** wie in Schritt 4 Handgriff 1:

```bash
for t in devices software_versions users device_events loans; do
  printf '%s\t' "$t"
  echo "select count(*) from $t;" | docker run --rm -i -v "$VOL_SUITE":/data alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly /data/radio.db'
done
# dazu, nur fuers Protokoll — Tabelle ohne Quellgegenstueck:
echo "select 'zugangscodes', count(*) from zugangscodes;" | docker run --rm -i \
  -v "$VOL_SUITE":/data alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly /data/radio.db'   # MUSS 0
```

⚠️ **Mount OHNE `:ro`, `sqlite3 -readonly`, ⛔ kein `immutable=1`** — die Fenster-Zeile aus §2.2.2: nach
Schritt 7 hält der reguläre Stack `radio.db` offen.
⚠️ **Eine Zählung `0` ist hier zuerst ein Volume-Fehler, kein Datenbefund** (§2.2.2 letzter Absatz): ein
falscher Volume-Name legt ein neues, leeres Volume an, und jede Abfrage antwortet `0` **ohne Fehler**.
Gegenprobe im selben Handgriff: `docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data` muss **alle**
Modul-Datenbanken zeigen, nicht nur `radio.db`.

⛔ **Nicht die Sechser-Schleife aus Spec 1 §9.4.3** — `api_tokens` existiert im Ziel nicht, die Schleife
ist **by construction rot**. Dazu die Invarianten, der Index-Check und `zugangscode_id` im Ziel: **die
vollständige Liste steht in §2.6.**

**(b) Die feldweisen Stichproben**, **fünf** Paare bzw. Tripel, je eine Zeile, zeilengenau gegen die
Snapshot-Kopie (§2.2.3 Regel 3, §2.2.4). Die `id`s werden **hier neu abgelesen**, nicht aus der
Generalprobe übernommen.

**(c) Die Zeitstempel-Stichprobe** (§2.3): der diskriminierende Wert (jüngste abgeschlossene Leihe) und
der doppeldeutige (älteste), plus die **vier Angaben der Retention-Kontrollgruppe** (§2.3.4).

**(d) Die Retention-Gegenprobe R und die Zeitstempel-Grenzprobe Z** (§5.2.2), mit `<freeze_iso>` in
**beiden** Armen (W3):

```bash
# Quelle, Millisekunden — der Faktor 1000 steht absichtlich im SQL.
sqlite3 radio-admin-snapshot.sqlite "
select count(*) from loans
 where returned_at is not null
   and returned_at < (strftime('%s','<freeze_iso>','-2 months') * 1000);"

# Ziel, Sekunden — derselbe Cutoff, ohne Faktor. Und wieder die §2.2.2-Form gegen
# dieselbe Protokollzeile $VOL_SUITE wie §4.5 Schritt 4 Handgriff 1: `$DATA_DIR/radio.db`
# gibt es auf dem HOST nicht (compose.yaml:79, :99, :221-223).
echo "select count(*) from loans
 where returned_at is not null
   and returned_at < strftime('%s','<freeze_iso>','-2 months');" \
| docker run --rm -i -v "$VOL_SUITE":/data alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly /data/radio.db'
```

**Erwartung: beide Zahlen gleich.**
**Weicht sie ab, hat der Faktor-1000-Fehler zugeschlagen** — an der **einzigen** Stelle, an der er
nicht paritätsgrün bleibt.
**Abbruchbedingung:** Abweichung → **kein Umschwenk.** Der Import wird verworfen, `radio.db` gelöscht,
der Mapper korrigiert, der Import läuft neu gegen dieselbe Snapshot-Kopie.
⚠️ **`'now'` gehört hier NICHT hin** (W3): Schritt 2 und Schritt 5 liegen Minuten auseinander, und eine
Leihe auf der Zwei-Monats-Grenze wechselt in diesen Minuten die Seite — **ein falsches Rot mitten im
Fenster**, dessen vorgeschriebener Handgriff „Import verwerfen" lautet.

**Die Zahlen aus R und Z werden EINMAL ermittelt und ZWEIMAL gelesen:** hier als Freigabe, in §5.2 als
Abbau-Sperre. Dieselbe Protokollzeile.

### Schritt 6 — `.env` scharf schalten, ohne die drei Router-Zeilen

Alle Zeilen aus §4.4.1 **außer** den drei mit ⏸.

**Scheitert an:** `SUITE_ACCESS_GROUP_RADIO=` (leer statt entfernt) → **Startabbruch** in Schritt 7.
**Wie man es merkt:** `up -d` läuft, der Container startet nicht, und die Meldung ist selbsterklärend.

### Schritt 7 — `up -d`

```bash
docker compose pull && docker compose up -d
docker compose images suite                              # Digest ins Protokoll — GEGEN §4.2 Nr. 1
docker compose logs --since 2m suite | head -1          # die ROHZEILE ins Protokoll (W6)
docker compose logs --since 2m suite | grep -i 'radio:'
```

⚠️ **`docker compose pull` holt, was in der Registry gerade unter dem verwendeten Tag steht** — das kann
ein **anderes** Image sein als das, gegen das die Generalprobe lief und das §4.2 Nr. 1 geprüft hat.
Deshalb der Digest, und er wird **verglichen**: gleich der Protokollzeile aus §4.2 Nr. 1 → weiter;
**abweichend → Stopp-Punkt, kein Hinweis** (es antwortet ein anderer Stand als der geprobte). Wer den
Vergleich nicht führen will, fährt Schritt 7 mit **festgenageltem** Digest statt mit dem Tag.

⚠️ **Das Muster steht OHNE `^`** (W6): unter `docker compose logs` trägt jede Zeile den Servicenamen als
Präfix, `^radio:` trifft dann **nichts**, und leere Ausgabe liest sich als „keine Warnung", also grün.

**Erwartung:** genau **eine** `radio:`-Zeile, und sie ist eine **`info`**: „Retention abgeschaltet"
(die Folge von `RADIO_HISTORIE_PURGE=0`). **Keine** `radio:`-**Warnung**.
**Warum die Unterscheidung trägt:** `warn` = **Stopp**, `info` = **Zustand** (§7.3.4). Wäre die
Retention-Zeile ein `warn`, träte der vorgeschriebene Cutover-Zustand seine eigene Stopp-Bedingung aus.

**Erwartete Warnungen, die hier trotzdem legitim erscheinen können und protokolliert werden:**
„`devices` ist leer" (nach dem Import darf sie **nicht** kommen — kommt sie doch, ist `DATA_DIR`
vertippt oder das Volume nicht gemountet) und „`radio.db` wurde neu angelegt" (dieselbe Familie, eine
Stufe früher — nach dem Import ein **Stopp**).

⚠️ **Das dritte erwartete Fehlbild: der Container kommt gar nicht hoch, mit `SQLITE_CANTOPEN` beim
Migrationslauf.** **Das ist ein Eigentumsfehler aus Schritt 4 Handgriff 3, keine `.env`-Frage.** Der
Import lief als `root` im Container, der Prozess läuft als `USER nextjs` (`Dockerfile:88`, `:72`).
**Wie man es merkt und behebt:** `docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data` — trägt
`radio.db` eine andere numerische Kennung als die übrigen Modul-Datenbanken, wird Handgriff 3 mit dem
`chown` nachgeholt, **nicht** die `.env` durchsucht.

### Schritt 8 — Verifikation gegen den Prüfcontainer

⚠️ **Ohne Traefik-Labels, und der Host muss vorgetäuscht werden.** Der Container hängt an keinem
Router; erreicht wird er über Loopback und Port. **Ohne den `Host`-Kopf läuft jede Anfrage auf den
Portal-Fallback und prüft `radio` überhaupt nicht.**

**Welcher Container — die Entscheidung steht in W5:** dieselbe `docker run`-Form wie §3.2.2, mit
**zwei benannten** Unterschieden — `-v suite_data:/data` statt `-v "$GP/data":/data`, und ⛔ **kein
`AUTH_DEV_LOGIN`**. Sonst gleich: `DATA_DIR=/data`, `SUITE_HOST_RADIO=localhost`,
`SUITE_ADMIN_GROUP_RADIO=<E1>`, `RADIO_AUSLEIH_SITZUNG_SECRET` frisch, `AUTH_SECRET` frisch (**nie** der
Prod-Wert), `AUTH_URL=http://localhost:<port>`, `AUTH_TRUST_HOST=true`, `RADIO_HISTORIE_PURGE=0`,
**keine** Labels, **kein** `proxy`-Netz, `-p 127.0.0.1:<port>:3000`. Der Container wird **innerhalb**
dieses Schrittes gestartet und beendet.

⚠️ **`AUTH_DEV_LOGIN` wird hier NICHT gesetzt** (W5): in der Generalprobe hängt der Dev-Login an einem
Wegwerf-Bestand, hier am **produktiven** Volume. Alle Prüfungen dieses Schrittes sind kopfgestützt; die
angemeldete Negativprobe ist V11 in der Generalprobe.

⚠️ **Der Textriegel aus §3.2.1 („die `docker run`-Zeile enthält `suite_data` nicht") gilt für die
GENERALPROBE, nicht hier** — hier ist `suite_data` das Prüfobjekt. Wer den Riegel ohne Geltungsbereich
zitiert, macht diesen Schritt unausführbar.
⚠️ **⬜ L14:** ob dieser Container **parallel** zum Schritt-7-Stack booten darf. Ist die Antwort nein,
wird der Schritt-7-Stack für die Dauer von Schritt 8 gestoppt — zulässig, weil er für `radio` noch
keine Domain bedient, **aber er bedient sechs andere Module**, und dann ist der Umschwenk kein reiner
radio-Vorgang mehr. **Deshalb ist L14 vor der Fensterplanung abzulesen, nicht darin.**

```bash
B=http://127.0.0.1:<port>
H='Host: radio.iuk-ue.de'
curl -si -H "$H" "$B/"                        | head -5   # Ausleihe, 200
curl -si -H "$H" "$B/admin"                   | grep -iE '^HTTP/|^location:'   # Seite: 3xx → Login
curl -s -o /dev/null -w '%{http_code}\n' -H "$H" "$B/admin/geraete/export"     # Handler: 404
curl -s  -H "$H" "$B/api/health/radio"
curl -si -H "$H" "$B/sw.js"                   | head -5
curl -si -H 'Host: iuk-ue.de' "$B/m/radio"    | head -3   # Falle 61, ⬜ L8
```

**Erwartung:** Ausleihe 200 · Health 200 mit `"module":"radio"` **und** `revision` = dem deployten
Commit (der einzige Beleg, dass wirklich der neue Stand antwortet, ⬜ L5) · `/sw.js` mit
`content-type: text/javascript`.

⚠️ **Der `/admin`-Riegel hat ZWEI Ausgänge, und sie zu verwechseln ist die Regression, die B10/B11
gerade beseitigt haben:**

* **Seiten und Server Actions** rufen `requireRadioAdmin()`; das endet für einen **anonymen** Abruf in
  `redirect('/login?…')` → **Weiterleitung (3xx) mit `location:` auf den Login** — der genaue Code ist
  **⬜ L7** (W7). Ein **404** hier hieße: die Seite ruft den Riegel gar nicht.
* **Route Handler unter `admin/`** rufen `radioHostOderNull` + `istRadioAdmin(await viewerOderNull())`
  und bauen ihre Antwort selbst → **404, nie 403 und nie ein Login-Umweg** (B10, B11, B17). Wörtlich
  umgesetzt landete ein anonymer `GET` auf `/admin/geraete/export` sonst in einem Login-Umweg, und ein
  403 machte den Bestand an Verwaltungspfaden aufzählbar.
* **Der `notFound()`-Zweig von `requireRadioAdmin` (angemeldet, aber nicht in der Gruppe) ist mit
  `curl` gar nicht erreichbar** — er braucht eine echte Sitzung und ist damit die angemeldete
  Negativprobe im Browser (V11), kein Statuscode in dieser Liste.

**Was hier strukturell NICHT prüfbar ist** (§3.4) und deshalb in §4.6 wandert: der Redirect vom
Alt-Host · der **Login-Rückweg** · der alte Service Worker · die gescannten QR-Wege · Cloudflare · TLS ·
der Header-Vorlauf des Randes.

### Schritt 9 — Router umschwenken

**In dieser Reihenfolge, und beide Domains im selben Handgriff:**

1. **Alt-Router zuerst weg — gegen die Protokollzeile aus §4.2 Nr. 13, nicht gegen „die Labels".**
   `radio.iuk-ue.de` verliert seine heutige Router-Regel; **welcher Handgriff das ist, steht wörtlich
   in dieser Protokollzeile** (samt dem Handgriff, der sie zurückstellt). ⚠️ **In den eingecheckten
   Alt-Compose-Dateien gibt es keine Traefik-Labels** — beide veröffentlichen nur `ports:`; wer hier
   „Labels entfernen" liest und danach sucht, sucht in der falschen Datei (U4, §4.2 Nr. 13).
   Nie zwei Router gleichzeitig auf derselben Domain — welcher gewinnt, ist nicht
   deterministisch (`files-cutover.md:167-170`).
2. **Die drei ⏸-Zeilen setzen — in EINER Änderung:** `SUITE_HOST_RADIO`, die
   `SUITE_TRAEFIK_RULE`-Erweiterung, `SUITE_REDIRECT_RULE_RADIO_ADMIN`.
3. ```bash
   docker compose up -d
   docker compose config | grep -A2 radio-admin-alt   # ins Protokoll
   ```

**Ab hier läuft die Uhr:** der Rückweg ist ab dem **ersten fachlichen Schreibvorgang** in `radio.db`
kein Routing-Vorgang mehr (§4.9).

---

## 4.6 Die Verifikation nach dem Umschwenk

Kein Punkt ist durch einen Statuscode allein erfüllt. **Ausgabe danebenschreiben.**

**1. Die Ausleihe antwortet, und es ist nicht das Portal.**
```bash
curl -si https://radio.iuk-ue.de/ | head -20
```
**Erwartung:** HTTP 200 **und** im Body eine Zeichenkette, die es nur auf der Ausleih-Fläche gibt
(**⬜ L10**).
⚠️ **`-si`, nicht `-sI`** — ein HEAD hat keinen Body und prüft damit nichts
(`docs/runbooks/suite-update-webfinger.md:220`). Portal und Ausleihe antworten **beide** 200; nur der
Body unterscheidet sie. Das ist der Handgriff gegen den ersten stillen Fall aus §4.4.2.

**2. Keine toten `localtest.me`-Links** (Post-Cutover-Befund 2).
```bash
curl -si https://radio.iuk-ue.de/ | grep localtest.me       # muss LEER sein
curl -si https://radio.iuk-ue.de/admin | grep localtest.me  # muss LEER sein
```

**3. Health nennt das Modul und die Revision.**
```bash
curl -s https://radio.iuk-ue.de/api/health/radio
```
**Erwartung:** 200, `"module":"radio"`, `revision` = deployter Commit (⬜ L5).
⚠️ **Nie `/api/health`.** `src/app/api/health/route.ts` liefert konstant `{status:"ok"}` ohne Modul und
ohne Datenbank; `radio.iuk-ue.de/api/health` antwortet nach dem Cutover weiter `ok`, **ohne etwas über
radio zu sagen**. Monitor und `docs/deployment.md` mit umstellen (Nr. 15 — Monitor).
⚠️ **Und Health beweist weniger als der Name:** `openModuleDatabase` legt Verzeichnis und Datei stumm
an (`src/core/db/index.ts:12-22`) — ein vertipptes `DATA_DIR` oder ein nicht gemountetes Volume ergibt
eine **nagelneue, leere** `radio.db`: Health grün, null Geräte. **Deshalb Nr. 4.**

**4. Der zählende Check ersetzt `status:"ok"`.** Die **fünf** Zählungen aus Schritt 5 (a) **noch
einmal**, paarweise gegen die Sollwerte aus Schritt 2. Dieselbe Zahl vorher und nachher
(`lagerbuch-cutover.md:452`, `:544`).

⚠️ **Gelesen wird mit der `docker run`-Form aus §2.2.2**, gegen dieselbe `$VOL_SUITE`-Protokollzeile wie
Schritt 4 Handgriff 1 — **nicht** mit nacktem `sqlite3 "$DATA_DIR/radio.db"`: diesen Pfad gibt es auf dem
Host nicht (`compose.yaml:79`, `:99`, `:221-223`). Eine `0` heißt hier zuerst „falsches Volume", nicht
„keine Daten".

⚠️ **Und was diese Zählung beweist, ist die Datei im Volume — nicht die Sicht des laufenden
Containers.** Ist `DATA_DIR` im **Container** vertippt, zeigt das Volume weiter die importierten Zahlen,
während der Container eine **nagelneue, leere** `radio.db` an einem anderen Pfad bedient. Was **die
Sicht des Containers** beweist, sind drei andere Dinge: die zwei Log-Zeilen aus Schritt 7 („`devices`
ist leer" / „`radio.db` wurde neu angelegt" — nach dem Import **beide** ein Stopp), das
`revision`-Feld aus Nr. 3, und der Body aus Nr. 1.

**5. `/admin` riegelt ab — mit ZWEI verschiedenen Ausgängen — und `/sw.js` liefert den Abräum-Worker.**
```bash
curl -si https://radio.iuk-ue.de/admin | head -5
#   erwartet: 3xx + location: …/login?…   (Seite, requireRadioAdmin) — Code ⬜ L7
#   ein 404 hier heisst: die Seite ruft den Riegel nicht.
curl -si https://radio.iuk-ue.de/admin/geraete/export | head -5
#   erwartet: 404. Nie 403 (macht Verwaltungspfade aufzaehlbar, B10),
#   nie ein Login-Umweg (B11: Route Handler benutzen das PRAEDIKAT, nicht den werfenden Riegel).
curl -si https://radio.iuk-ue.de/sw.js | head -5
```
**Erwartung `/sw.js`:** `content-type: text/javascript; charset=utf-8`, `cache-control: no-cache`, im
Body `self.registration.unregister()`.
**Kommt hier HTML oder Portal-Inhalt, greift der Rewrite nicht** — also ist `SUITE_HOST_RADIO` falsch
gesetzt (§7.1.4). Derselbe stille Fall wie Nr. 1, nur mit einer schärferen Ausgabe.

**6. Kein radio-Manifest auf einem fremden Host.**
```bash
curl -si https://iuk-ue.de/manifest.webmanifest | head -20
```
**Erwartung: kein radio-Manifest** — die Prüfzeile wird zeichengleich aus `lagerbuch-cutover.md:432`
übernommen (der ausführbare Befehl steht in `:236`; R36 / Falle 56). Der Fehlfall, den sie fängt: ein Manifest oder Icon an der **Wurzel**
statt unter `src/app/m/radio/` bewürbe **jeden** Suite-Host als radio-PWA — alle Suite-Hosts hängen an
**einem** Traefik-Router auf **einem** Container (`compose.yaml:146-155`).
⚠️ **`radio` baut ausdrücklich KEINE PWA** (§7.1.1) — es gibt gar kein radio-Manifest, das hier
auftauchen dürfte. Die Prüfung bleibt trotzdem Pflicht: **sie prüft nicht eine Zusage, sondern deren
Verletzung.** Was `radio.iuk-ue.de/manifest.webmanifest` liefert: **⬜ L11**.

**7. Der Redirect vom Alt-Host trifft** (alle drei, protokollpflichtig):
```bash
curl -si https://radio-admin.iuk-ue.de/geraete | head -5
#   erwartet: HTTP/2 302  +  location: https://radio.iuk-ue.de/admin/geraete
curl -si https://radio-admin.iuk-ue.de/       | head -5
#   erwartet: HTTP/2 302  +  location: https://radio.iuk-ue.de/admin/
curl -si https://radio.iuk-ue.de/             | head -5
#   erwartet: HTTP/2 200 — der Ziel-Host darf NICHT redirecten.
```
**Ein 302 in der dritten Zeile heißt: die Middleware hängt am Service statt am Router.**
**Ein `location: …/admin/` für JEDEN Pfad in der ersten Zeile heißt: `$$` wurde von Compose
verschluckt** — der Redirect funktioniert, ist aber nicht mehr pfaderhaltend (§4.4.4 Punkt 3).
**Ein Verbindungs- oder TLS-Fehler statt einer 302-Zeile heißt: die Entrypoints stimmen nicht oder der
Edge-Proxy kennt den Alt-Host nicht** (§4.4.4 Punkt 6).

**8. Das Traefik-Access-Log zeigt keine wachsende `/m/<key>`-Kette** (Post-Cutover-Befund 1).
```bash
docker logs --tail 200 <E7> | grep -o '/m/[^ "]*' | sort -u | head
```
**Erwartung:** kein `/m/radio/m/radio/…`. Jede weitere Ebene ist ein RSC-/Prefetch-Request, der eine
Ebene akkumuliert.

**9. Ein Blick in das Suite-Log, mit der scharfen Trennung.**
```bash
docker compose logs --since 2m suite | grep -i 'radio:'
```
**Erwartung:** genau eine Zeile, `info`, „Retention abgeschaltet". **Jede `radio:`-Warnung ist ein
Stopp-Punkt, kein Hinweis.** Muster **ohne `^`** (W6).

**10. Der Login-Rückweg — Handarbeit, nicht automatisierbar.** Einmal von
`https://radio.iuk-ue.de/admin` aus anmelden und prüfen, dass man **dort** wieder landet, nicht auf dem
Portal.
**Wie der Fehlfall aussieht:** man landet auf `iuk-ue.de`, ohne Fehler und ohne Meldung
(`src/core/hosts.ts:59-63`: „Ein curl sieht davon nichts"). **Diese Prüfung ist die einzige, deren
Fehlfall vollständig stumm ist** — deshalb macht sie eine namentlich benannte Person (**E8**), und
deshalb ist es dieselbe Person, die im nächsten Schritt den ersten Zugangscode ausstellt (§4.8.2).
⚠️ Betrifft nur `/admin`, aber genau die Personen, die den Cutover verantworten. Und: **nach einer
neuen Anmeldung** prüfen, wenn die Gruppe am selben Abend angelegt wurde (bis zu eine Stunde Verzug).

**11. Der erste Zugangscode wird ausgestellt** — §4.8.2, durch dieselbe Person, **vor** der Freigabe an
die Nutzer.

**12. Ein Telefon, das den Alt-Kiosk kannte, einmal neu laden.** Siehe §4.7.2.

**13. Das Backup einmal von Hand — der Glob ist bewiesen, wenn er gelaufen ist.**
```bash
scripts/backup.sh
tar -tzf <das erzeugte Tarball> | grep radio.db
```
**Erwartung:** `radio.db` ist im Tarball. `scripts/backup.sh:25-27` sammelt `"$DATA_DIR"/*.db` per
`nullglob` und sichert jede Datei per `sqlite3 .backup` (`:41-43`) — **ohne jede Skriptänderung**.
`BACKUP_KEEP` bleibt unverändert.

**14. Die Retention wieder einschalten — und der zweite Log-Blick, in dem die Zeile FEHLT.**
⛔ **Vorbedingung: R und Z sind grün protokolliert** (W10, §5.2.2). Sind sie es nicht, bleibt
`RADIO_HISTORIE_PURGE=0` stehen, die `info`-Zeile bleibt im Log, **und das Standby-Fenster beginnt
nicht** (§5.1.1).
Danach: `RADIO_HISTORIE_PURGE=0` **aus der `.env` entfernen**, `up -d`, dann
```bash
docker compose logs --since 2m suite | grep -i 'radio:'
```
**Erwartung: keine Zeile mehr.** Ein nach dem Fenster **vergessenes** `RADIO_HISTORIE_PURGE=0` ist ein
**stiller** Verlust der Löschrichtlinie, die der DSGVO-Grund für `borrower_name` ist — die Info-Zeile
bei **jedem** Start ist das einzige, was ihn findbar hält (§7.3.4). Der erste Purge läuft danach nach
`RADIO_HISTORIE_ERSTLAUF_MINUTEN` (Vorbelegung **1440**, B5) — bewusst so lang, dass Verifikation,
Stichprobe und „Router zurück" noch ins Fenster passen.

**15. Der Monitor zeigt auf `/api/health/radio`**, nicht auf `/api/health`; `docs/deployment.md` mit
umstellen. (Vorbild für den Fehlfall: `lagerbuch-cutover.md:122` — „Der Monitor zeigt auf den falschen
Endpunkt".)

**16. Die Neuigkeitennotiz ist eingetragen** — §4.8.3.

---

## 4.7 Der Service Worker des Alt-Kiosk

⚠️ **Er überlebt den Umschwenk, weil der Origin zeichengleich bleibt.** Gemessen (Spec 1 §7.1.2):
Registrierung mit **Root-Scope** (`radio-inventar/apps/frontend/src/hooks/usePWA.ts:72-73`), Cache-Name
`radio-inventar-v1` (`public/sw.js:2`), `skipWaiting()` + `clients.claim()` (`:24`, `:40`), also
**aktiv ohne Reload**.

* **Kein dauerhaft veraltetes HTML.** Navigationen sind **network-first** (`sw.js:78-96`); solange Netz
  da ist, kommt die Suite-Antwort durch.
* **Aber ohne Netz** liefert der alte Worker `/` aus seinem Cache — die **Alt-Oberfläche**, gegen ein
  Backend, das es nicht mehr gibt.
* **Und `cache-first` gilt dauerhaft** für `/manifest.json`, `/favicon.svg`, `/apple-touch-icon.svg`
  und drei Icons (`sw.js:100-127`): eine installierte Alt-PWA bewirbt sich nach dem Cutover **weiter
  mit dem alten Manifest**.
* **Dazu die zwischengespeicherten `/api`-Antworten:** Bestands- und Ausleihdaten samt Ausleihernamen
  liegen im Cache eines fremden Telefons.

*Kein Gate sieht davon etwas:* **HTTP 200 mit veraltetem Inhalt.** Kein Build, kein Test, kein
Healthcheck.

### 4.7.1 Der Abräum-Worker gehört in den ERSTEN Deploy

Spec 1 §7.1.3 baut ihn: `src/app/m/radio/sw.js/route.ts` liefert `RADIO_SW_ABRAEUM_QUELLE` aus
`_lib/sw-quelle.ts`, geriegelt durch `hostAbweisung(req) ?? …` (die **nicht werfende** Riegelform, weil
ein `notFound()` eine HTML-Fehlerseite wäre und der Browser „manifest fetch failed" bzw. einen
irreführenden Registrierungsabbruch meldete). Der Worker hat **keinen `fetch`-Handler**, löscht
**alle** Cache-Namen über `caches.keys()` (ein fester Name wäre eine Annahme) und ruft `skipWaiting()`
+ `clients.claim()` **vor** `unregister()`.

**Er muss VORHER deployt sein — im Deploy aus §4.2 Nr. 1, nicht im Cutover.** Grund: **nichts in der
Suite ruft `navigator.serviceWorker.register()`.** Die Route wird ausschließlich von der
**Update-Prüfung eines schon registrierten Workers** abgeholt — der Browser holt das Worker-Skript bei
einer Navigation im Scope neu und vergleicht die Bytes. Kommt der Abräum-Worker erst mit dem Cutover,
gibt es im entscheidenden Fenster nichts, was sich vom Alten unterscheidet. Auf einem Gerät, das den
Alt-Kiosk **nie** geöffnet hat, wird die Route nie abgerufen — das ist richtig und kein Fehler.

### 4.7.2 Wie man am Cutover-Abend prüft, dass er greift

**Zwei Hälften, und die erste beweist die zweite nicht.**

**Hälfte 1 — die Route liefert das Richtige** (`curl`, §4.6 Nr. 5): `content-type: text/javascript`, im
Body `self.registration.unregister()`.
**Was man sieht, wenn nicht:** HTML oder Portal-Inhalt → der Rewrite greift nicht,
`SUITE_HOST_RADIO` ist falsch.

**Hälfte 2 — ein echtes Gerät, und das kann kein `curl`.** ⚠️ **`curl` hat keinen Service Worker.** Ein
Telefon, das den Alt-Kiosk kannte, wird **einmal** neu geladen.
**Erwartung:** im **schlechtesten** Fall **eine** veraltete Seitenansicht, danach die
Suite-Oberfläche; die Registrierung ist weg und die Cache Storage leer.
**Was man sieht, wenn er nicht greift:** HTTP 200 mit der **Alt-Oberfläche**, `radio-inventar-v1` steht
weiter in der Cache Storage, und im Flugmodus erscheint die alte `offline.html`.
**Der genaue Ablesepunkt in den Entwicklerwerkzeugen: ⬜ L12.**

**Umfang des Handgriffs: E6** — wie viele Geräte den Alt-Token im `localStorage` tragen, ist im Repo
**nicht abzählbar** (es gibt keine Tabelle). Die Antwort ist eine **Begehung, kein `SELECT`**. Für
Geräte, die den Kiosk **installiert** haben, kommt „einmal Speicher löschen" dazu — ein Handgriff pro
Gerät, kein Serverbefehl. **Und das gehört in die Ankündigung:** der Worst Case ist **eine** veraltete
Seitenansicht je Gerät (§4.8.3).

---

## 4.8 Der Ausstellungsplan für die Zugangscodes

Spec 1 §3.9 hängt daran, und **C.3 ist offen** (E5: sind gedruckte Aufsteller im Umlauf, wo, und wer
kann sie ersetzen?). **Beide Zweige sind hier behandelt, weil die Entscheidung am Cutover-Abend zu spät
kommt.**

**Die gemeinsame Lage:** `zugangscodes` ist **nicht Teil des Imports** (§1.4.6). Der heutige QR-Code
trägt den **einen geteilten API-Token base64-kodiert als URL-Parameter**, ohne Ablauf und ohne Widerruf
(`AppQRCode.tsx:11-23`). Und `seedLokal` legt **niemals** eine einlösbare Zugangszeile an.
**Daraus folgt der Zustand, den niemand plant und den man sonst um 22 Uhr entdeckt:** unmittelbar nach
dem Umschwenk steht eine **anonym erreichbare Ausleih-Fläche** ohne **einen einzigen einlösbaren
Code**. Der erste Satz Codes entsteht **in der Suite**, ausgestellt von einem `radio`-Admin
(`erstelleCode(bezeichnung)`, erste Anweisung `requireRadioAdmin()`, §3.2.3) — **und das ist erst nach
dem Umschwenk möglich** (W2).

### 4.8.1 Zweig „ja, es sind gedruckte Aufsteller im Umlauf" (C.3 = ja)

⚠️ **„Bestandscodes zeichengleich übernehmen" ist hier NICHT möglich** — das ist der Satz, den C.3
offenlässt und der hier zu korrigieren ist. Ein Aufsteller trägt heute einen base64-Token in einer URL,
kein 28-Zeichen-Crockford-Base32-Code in sieben Gruppen (§3.2.1). **Es gibt keine Zeichenkette zu
übernehmen.** Der Zweig ist also **kein Datenvorgang, sondern ein Austausch von Papier**:

1. **Zählen und verorten (E5):** Anzahl, Ort, wer sie ersetzen kann. Papier ist für jedes Tor
   unsichtbar.
2. **Je Aufsteller ein Code**, ausgestellt in der Suite mit einer `bezeichnung`, die den **Ort** nennt
   — nur so ist später ein einzelner Aufsteller sperrbar, ohne die anderen mitzunehmen. Der Code wird
   **einmal** zurückgegeben und danach in der Verwaltungsliste im Klartext angezeigt und gedruckt: er
   ist kein Einmalgeheimnis, sondern ein **Dauerausweis** (§3.2.3/§3.2.4).
3. **Drucken** über `admin/(druck)/zugaenge/blatt` — die eigene Route-Group ist der Grund, warum das
   Druckblatt Kopfzeile, Navigation und `controlHeight: 44` **nicht** auf Papier erbt (B9, Falle 4).
4. **Austauschen, mit Datum je Ort ins Protokoll.**
5. **Solange ein Aufsteller nicht ersetzt ist, ist die Handeingabe der Ausweichweg:** der Code wird der
   betroffenen Person **außerhalb** des Aufstellers mitgeteilt und in das Feld auf der Startseite
   getippt (Groß-/Kleinschreibung gleichgültig, §3.9 Absatz 3).
   **Was schiefgeht, wenn man diesen Ausweichweg nicht plant:** der alte QR-Code hört mit dem Port auf
   zu funktionieren, und wer vor dem Aufsteller steht, hat **keinen** Weg herein.
6. **Abbruchbedingung für den Umschwenk:** Schritt 5 ist nicht abgedeckt und es ist niemand erreichbar,
   der Codes ausstellen kann → **der Umschwenk wird verschoben, nicht durchgeführt.**

### 4.8.2 Zweig „nein, es sind keine im Umlauf" (C.3 = nein) — und die Festlegung, die für beide gilt

**Festlegung, damit sie nicht um 22 Uhr fällt:**

1. **Wer:** die namentlich benannte Person aus **E8** — dieselbe, die §4.6 Nr. 10 durchführt. Das ist
   kein Zufall: `erstelleCode` verlangt `requireRadioAdmin()` auf dem **umgeschwenkten** Host, also
   eine Anmeldung genau auf dem Weg, dessen Fehlfall stumm ist. **Der Schritt beweist beides in
   einem.**
2. **Wann:** **unmittelbar nach** §4.6 Nr. 3 (Health grün, Modul antwortet) und **vor** der Freigabe an
   die Nutzer. **Nicht vorher** — auf dem Alt-Host gibt es die Fläche nicht (W2).
3. **Auf welchem Host:** `https://radio.iuk-ue.de/admin/zugaenge` (der Pfadname ist mit B9
   entschieden). Nicht über den Portal-Host, nicht über den internen `/m/radio`-Pfad.
4. **Wie viele:** mindestens einer je Ort, an dem geliehen wird, mit ortsnennender `bezeichnung`. Ein
   einziger Code für alles ist technisch gültig und betrieblich der Rückfall in genau das Modell, das
   Entscheidung 8 abschafft: ein Code, den man sperren muss, sperrt dann alle.
5. **Abbruchbedingung:** die benannte Person kann sich nicht anmelden oder landet nach dem Login auf dem
   Portal → **Stopp**, und der Fall ist §4.6 Nr. 10, nicht ein Codeproblem. Rückweg §4.9.

**Der benannte Restposten, der nicht behebbar ist** (W2): zwischen Umschwenk und erstem Code steht eine
anonym erreichbare Ausleihfläche ohne einlösbaren Code. Er ist **begrenzt** durch die Reihenfolge oben,
nicht beseitigt — und er steht im Protokoll, damit ihn niemand als Defekt liest.

### 4.8.3 Die Neuigkeitennotiz ist ein Schritt am Rollout-Tag, kein Vorab-Commit

Spec 1 §3.9 legt Datei, Titel und Text fest; **drei Dinge werden am Cutover-Tag gesetzt:**

* **`datum`** = der Tag des **Rollouts**, nicht des Commits.
* **die Registerzeile** in `src/app/m/portal/_lib/neuigkeiten/notizen/register.ts` — das Dreieck ist
  Dateiname ↔ Felder (`modul`, `datum`, `slug`) ↔ Registerzeile, und `register.test.ts` hält alle drei
  zusammen.
* **`<N>`** = der tatsächlich gesetzte Wert von `RADIO_AUSLEIH_SITZUNG_STUNDEN` (**E4**),
  **ausgeschrieben** („zwölf Stunden", nicht „12"). Er ist der einzige Platzhalter der Notiz, und er ist
  einer mit Grund: eine Anwendernotiz, die eine unbestätigte Zahl behauptet, ist eine falsche Auskunft,
  die niemand mehr korrigiert.

**Kein Markdown im Text** — er wird als Textknoten gerendert, `**fett**` käme mit Sternchen auf dem
Bildschirm an, und `register.test.ts` prüft es. **Und der Satz aus §7.1.3 gehört hinein:** im
schlechtesten Fall **eine** veraltete Seitenansicht je Gerät nach dem Umschwenk.

---

## 4.9 Der Rückweg

**Er ist ein Routing-Vorgang, und er hat drei Handgriffe — nicht zwei.**

```dotenv
SUITE_HOST_RADIO=                       # LEEREN, die Zeile NICHT entfernen
SUITE_TRAEFIK_RULE=...                  # radio.iuk-ue.de herausnehmen
SUITE_REDIRECT_RULE_RADIO_ADMIN=        # leeren; `${…:-radio-admin.invalid}` greift bei leer UND ungesetzt
```
```bash
docker compose up -d
```

**Und dann der dritte Handgriff, der bei `lagerbuch` fehlte — zweiteilig, weil der Freeze zwei Stacks
angehalten hat:**

```bash
# 3a) radio-admin zuerst: er ist die Datenquelle des Kiosk.
docker compose -f radio-admin/docker-compose.yml start app
# 3b) dann der Kiosk selbst, samt seinem Postgres.
docker compose -f radio-inventar/docker-compose.yml start postgres backend
# 3c) beide Hosts wieder an ihren Router: radio.iuk-ue.de auf radio-inventar,
#     radio-admin.iuk-ue.de auf radio-admin. ⚠️ NICHT "die Labels, die der Cutover
#     entfernt hat" — es gibt keine: beide Alt-Compose-Dateien fuehren `traefik`
#     nirgends. Der Handgriff ist der, der WOERTLICH in der Protokollzeile aus
#     §4.2 Nr. 13 neben der heutigen Router-Konfiguration steht (U4).
# 3d) den Auslieferungsweg des FRONTENDS wieder starten — Befehl aus der
#     U4-Protokollzeile von Schritt 1. Reihenfolge wie 3a vor 3b: erst Daten,
#     dann Oberflaeche.
```

⚠️ **Der Rückweg startet genau die Prozesse, die Schritt 1 angehalten hat — DREI, nicht zwei.** Die
Protokollzeile aus §4.5 Schritt 1 **ist** die Liste. Ohne 3d bleibt die Domain nach dem Rollback
ebenso tot wie ohne 3a–3c: der Kiosk ist eine **Oberfläche** vor sechs `/v1`-Routen, nicht das Backend
allein (Entscheidung 15). Damit muss U4 **einmal** beantwortet werden und nicht zweimal — der
Stopp-Befehl aus Schritt 1 ist die Vorlage des Start-Befehls hier. ⚠️ **In der Rückweg-Frist von einer
Stunde ist „welcher Prozess lieferte eigentlich das Frontend aus" keine Frage, die man noch klären
kann.**

⚠️ **Die Reihenfolge 3a vor 3b ist keine Kosmetik.** Der Kiosk ist Konsument der sechs `/v1`-Routen von
`radio-admin` (Entscheidung 15). Allein zurückgeholt, startet er und zeigt **keinen Bestand** — ein
Rollback, der aussieht wie ein zweiter Ausfall. Und `radio-inventar`s Backend hängt per
`depends_on: postgres: condition: service_healthy` (`radio-inventar/docker-compose.yml:42-44`): ohne
Postgres startet er gar nicht.
⚠️ **`radio-admin.iuk-ue.de` braucht seinen eigenen Router zurück**, sobald
`SUITE_REDIRECT_RULE_RADIO_ADMIN` geleert ist — sonst ist der Alt-Verwaltungshost nach dem Rollback
tot. Der DNS-Eintrag bleibt in beiden Richtungen unangetastet.

⚠️ **Bei `radio` bedeutet der Rückweg etwas anderes als bei `lagerbuch`.** Dort nahm er die Domain
**vom Netz** (`lagerbuch-cutover.md:420`). Hier ist der **Alt-Kiosk der Rückfall**, weil er
`radio.iuk-ue.de` bis zum Umschwenk bedient hat. **Ohne 3a–3c ist die Domain nach dem „Rollback"
tot.**

⚠️ **Und der Start von `radio-admin` in Schritt 3a ist selbst gefährlich: er löscht Historie**
(`index.ts:35` → `retentionService.ts:47`, Cutoff an der Wanduhr `:9`, `:19`). Der Kiosk purgt nichts —
**die Gefahr sitzt allein in 3a.** Ein Rollback ist deshalb nur zulässig, wenn §4.2 Nr. 3 (Retention
neutralisiert **oder** Volume kopiert) **als erfüllt nachgewiesen** ist. Sonst wird der Start abgesagt
— auch der Rollback.
**Wie man den Schaden merkt, wenn man es doch tut:** ein **erfolgreicher** Start mit der Zeile
`[retention] purged N expired loan(s)`. Kein Fehler, kein roter Test.

**Was der Rückweg NICHT zurückholt:**

1. **Jede Ausleihe und jede Rückgabe, die nach dem Umschwenk in `radio.db` gelandet ist.** Es gibt
   **keinen** Rückweg-Importer (Suite → radio-admin) und kein Vorbild dafür
   (`docs/radio-portierung-analyse.md:626-628`).
2. **Die Historie, die ein Start des Alt-Stacks bereits gelöscht hat.** Der Cutoff hängt an der
   Wanduhr — **jeder weitere Start löscht mehr als der vorige.**
3. **Die ausgestellten Zugangscodes** (§4.8). `zugangscodes` existiert in der Alt-App nicht; ein
   gedruckter Suite-Code ist nach dem Rollback wertlos, und der alte QR-Weg gilt wieder.
4. **Die Cache Storage der Telefone, auf denen der Abräum-Worker schon gelaufen ist.** Sie sind leer und
   die alte Registrierung ist weg — kein Schaden (der Kiosk registriert bei der nächsten Navigation
   neu), aber die erste Ansicht kommt dann aus dem Netz, nicht aus dem Cache.
5. **Nichts an einem 301** — deshalb ist der Redirect ein **302** (§4.4.4 Punkt 2).

**Die zwei Fristen, ausgeschrieben, damit sie nicht um 22 Uhr entschieden werden (§9.3.3):**

* **Point of no return:** der **erste fachliche Schreibvorgang** in `radio.db` — die erste Ausleihe oder
  Rückgabe nach dem Umschwenk. Ab da ist der Rollback ein **Datenverlust mit bekanntem Umfang**, keine
  Routing-Rücknahme.
* **Frist:** Rollback **ohne Nachtrag** nur innerhalb der **ersten Stunde** nach dem Umschwenk, und in
  dieser Stunde bleibt der Kiosk unter Beobachtung. Danach nur noch vorwärts.

**Der Nachtrag, wenn in der Frist zurückgezogen wird — ausgeschrieben, nicht improvisiert:**
```bash
sqlite3 -readonly "$DATA_DIR/radio.db" \
  "select id, device_id, borrower_name, borrowed_at, returned_at, return_note
     from loans where created_at >= <umschwenk_epoch_sekunden> order by created_at;"
```
⚠️ **Die Zeitstempel stehen hier in Sekunden, die Alt-App erwartet Millisekunden — beim Nachtragen mit
1000 multiplizieren.** Derselbe Faktor, andere Richtung.

**Was der Rückweg nicht ist:** ein Rückzug auf ein älteres **Image**. Die Rollback-Körnung ist **grob**
— ein älteres Image nimmt portal, qr, feedback, files, lagerbuch und aufgaben mit. **Der Teilrückzug ist
die `.env`, nicht das Image.**

---

# 5. Standby und Abbau

Der Abbau ist die **einzige unumkehrbare Handlung dieses Cutovers.** Alles davor ist ein
Routing-Vorgang oder ein wiederholbarer Import; ab dem gelöschten Volume gibt es keine Quelle mehr,
gegen die man nachschlagen könnte. Dieses Kapitel legt drei Dinge fest: **wie lange was im Standby
bleibt und warum**, **welche Zählungen vor dem Abbau laufen und welches Ergebnis ihn stoppt**, und
**was genau abgebaut wird** — Posten für Posten, mit der Bedingung daneben.

Zwei Sätze, die dieses Kapitel von den fünf vorherigen Abbau-Kapiteln des Hauses trennen:

* ⚠️ **Der billige Rückweg endet früher als das Standby-Fenster.** Bei `files` und `lagerbuch` war
  „Router zurück" bis zum Abbau möglich. Hier stirbt der Rückweg nach **einer Stunde** (§4.9), weil der
  erste fachliche Schreibvorgang in `radio.db` der Point of no return ist und es keinen
  Rückweg-Importer gibt.
* ⚠️ **„Beide parken und in Ruhe schauen" ist hier nicht möglich, und Nachschlagen ist aktiv
  zerstörend.** Der Alt-Kiosk hielt `radio.iuk-ue.de` selbst (Entscheidung 3), es gibt also keinen
  Zustand, in dem beide bedienen. Und **jeder Start von `radio-admin` löscht Historie** (§9.3.4).

## 5.1 Das Standby-Fenster: die Frist wird begründet, nicht übernommen

Das Projektmuster sind zwei Wochen (`CLAUDE.md`: „Router umschwenken (nie zwei Router gleichzeitig
aktiv) → 2 Wochen Standby"). Bei `files` wurde bewusst darauf verzichtet, weil es **keinen Bestand**
gab — die vier Bestandszählungen dort waren alle null (`files-cutover.md:62`, §H Punkt 1). **Hier gibt
es Bestand:** Geräte, Leihen, Geräte-Ereignisse, Benutzer, Softwareversionen. Das Muster wird also nicht
verworfen — aber es wird **anders zugeschnitten**.

### 5.1.1 Drei Fristen, weil drei verschiedene Dinge geschützt werden

| Frist | Was sie schützt | Woran sie hängt |
|---|---|---|
| **Stunde 1 nach dem Umschwenk** | Der **Rückweg**: `SUITE_HOST_RADIO=` leeren, `radio.iuk-ue.de` aus `SUITE_TRAEFIK_RULE` nehmen, beide Alt-Stacks in der Reihenfolge 3a–3c zurückholen (§4.9) | Ab dem ersten fachlichen Schreibvorgang in `radio.db` ist Rollback ein **Datenverlust mit bekanntem Umfang**. In dieser Stunde bleibt der Kiosk unter Beobachtung; danach nur noch vorwärts |
| **Zwei Wochen** | Die **Datenquelle** für feldweise Nachprüfung und Re-Import: das radio-admin-Volume bzw. seine Snapshot-Kopie, das radio-inventar-Postgres-Volume, beide Images | ⚠️ **Nicht** der Rückweg — der ist nach Stunde 1 vorbei. Die zwei Wochen sind die Zeit, in der ein **Zuordnungsfehler** auffällt, den kein Tor sieht |
| **Dauerhaft, off-server** | Das **Archiv**: `radio-admin-snapshot.sqlite` und der `pg_dump` im Custom-Format, **nicht** auf demselben Server wie die Suite | Spec 1 §9.5.1. Es ist der Rest, der die Volumes überlebt |

⚠️ **Die Fehllesart, die diesen Cutover teuer macht:** die zwei Wochen als „Rollback-Fenster" zu lesen.
Wer das tut, entspannt die Abnahme („wir können ja zurück"), und genau das kann er nach Stunde 1 nicht
mehr. **Die Abnahme (§4.6) ist die einzige Stelle, an der noch etwas billig ist.**

### 5.1.2 Warum zwei Wochen die richtige Zahl für die Datenquelle sind — die Rechnung

Die Frist folgt aus dem **Erstlauf der übernommenen Retention**: Vorbelegung **1440 Minuten**, also ein
Tag (B5: „Kapitel 2s Begründung — das Fenster für Verifikation, Stichprobe und ‚Router zurück' —
trägt").

1. Ein **Faktor-1000-Fehler ist paritätsgrün** (`parity.ts:43-56`, `portal.ts:73-76`).
2. Sekunden statt Millisekunden legt jedes `returned_at` ins Jahr 1970. Der Schaden entsteht nicht beim
   Import, sondern beim **ersten Retention-Lauf** — also frühestens **einen Tag nach dem Umschwenk**,
   und dann still: die abgeschlossene Leihhistorie ist weg, aktive Leihen leben weiter, die Oberfläche
   sieht funktionsfähig aus.
3. Die **einzige** Quelle, aus der diese Historie zurückkommt, ist das radio-admin-Volume bzw. seine
   Snapshot-Kopie.
4. „Einen Tag nach dem Umschwenk" ist der **frühestmögliche** Zeitpunkt der Sichtbarkeit, nicht der
   wahrscheinliche: bemerkt wird eine fehlende Historie, wenn jemand sie braucht — bei einer Nachfrage,
   einer Auswertung, einem Monatsabschluss. **Zwei Wochen decken einen vollen Dienstzyklus ab** und
   lassen nach dem verdächtigen Tag noch dreizehn Tage zum Nachschlagen.

**Festlegung:** Standby der Datenquellen = **14 Tage nach dem Umschwenk**, mit einem im Protokoll
**ausgeschriebenen Enddatum** und einer namentlich benannten Person, die den Abbau auslöst. Ohne Datum
und Namen endet ein Standby nie — dann steht in einem Jahr ein gestoppter Stack, den niemand mehr
erklären kann, und niemand traut sich, ihn zu löschen.

> Umschwenk am: ____________ · Standby-Ende (Umschwenk + 14 Tage): ____________ ·
> Abbau verantwortet: ____________________

⚠️ **Verlängerungsgrund, benannt:** ist die Retention-Gegenprobe (Abfrage R) **nicht** grün
protokolliert, **beginnen die 14 Tage erst, wenn sie es ist.** Eine offene Gegenprobe heißt: es ist
unbekannt, ob die Historie im Ziel angekommen ist — und dann ist das Volume nicht Standby, sondern die
einzige Kopie. **Dasselbe Kriterium hängt am Entfernen von `RADIO_HISTORIE_PURGE=0`** (W10, §4.6
Nr. 14): **R und Z werden einmal ermittelt und zweimal gelesen** — dort als Freigabe, hier als
Abbau-Sperre. Dieselbe Protokollzeile.

---

## 5.2 Die Zählungen vor dem Abbau

**Warum das keine Formalie ist.** „Bestand annehmen statt zählen" ist der beim Namen genannte Fehler der
Phase 4 (`docs/radio-portierung-analyse.md:1777`, Spec 1 §9.4). Dazu die strukturelle Blindheit des
Paritätschecks (§2.1.2).

⚠️ **Keine Zahl in diesem Kapitel ist ein Wert; jede ist ein Schritt.** Insbesondere ist
`radio-admin/data/data.sqlite` als Beleg **unbrauchbar** (Randbedingung 8). Wer eine Zahl aus dieser
Datei ins Protokoll schreibt, protokolliert einen Stand **vor** der Loan-Migration.

### 5.2.1 Was hier läuft und was ausdrücklich nicht

A1–A13 (§2.4) sind **nicht alle** Abbau-Sperren, und sie hier vollständig zu wiederholen würde die
Liste verwässern, die unter Zeitdruck gelesen wird.

| Abfrage | Gehört zu | Warum |
|---|---|---|
| A2 `is_target = 1` | **Kapitel 2/4, vor dem Import** | Ein Import-Tor. Vor dem Abbau beweist eine Wiederholung nichts — die Kopie hat sich nicht geändert |
| A3 Waisen in `device_events` | **vor dem Import** | FK-Kante; der Import bricht hart ab, wenn sie verletzt ist — das ist laut, nicht still |
| A4 doppelte aktive Leihen | **vor dem Import** | Sonst lässt sich der partielle Aktiv-Index im Ziel nicht anlegen |
| A5 `source` außerhalb des Enums | **vor dem Import** | TS-Enum ohne DB-CHECK (`schema.ts:96`) |
| A6 Zeitstempel-Größenordnung | **vor dem Import** | Zehnstellig → Cutover abgesagt, nicht angepasst |
| A7 `sqlite_master` auf Trigger/Views | **vor dem Import** | Fachlogik, die kein Repo kennt |
| **A1 / Retention-Zahl** | ⚠️ **beides** — hier als **Abfrage A** und **Abfrage R** | R ist die **einzige** Zahl, die der Faktor-1000-Fehler nicht paritätsgrün überlebt |
| **A9 `dev-user` in Audit-Spalten** | **hier, falls nicht vor dem Import protokolliert** | Sie beantwortet **U7** und ist nach dem gelöschten Volume nicht mehr beantwortbar |

**Vor dem Abbau laufen genau diese sechs Blöcke:** der Zählungsvergleich **A**, die
`api_tokens`-Archivzeile **T**, die Retention-Gegenprobe **R**, die Zeitstempel-Grenzprobe **Z**, die
Postgres-Zählungen **P1–P6** und die **Archivprobe** (§5.2.4). Jeder Block sagt: Erwartung · was eine
Abweichung bedeutet · **blockiert den Abbau** oder **nur Protokoll**.

**Alle SQLite-Abfragen laufen gegen die Snapshot-Kopie, niemals gegen einen gebooteten Alt-Stack**
(§9.3.4 Zeile 2). Der Grund steht oben: **der Start selbst löscht.**

### 5.2.2 radio-admin: die Snapshot-Kopie gegen `radio.db`

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

⚠️ **Nachtrag 2026-08-18 (Re-Kritik, dreifach gemeldet — RK-A4 erster und zweiter Durchgang,
RK-A2 dritter, EIN Fund):** der Zielarm las mit `sqlite3 -readonly "$DATA_DIR/radio.db"` **auf dem
Host**. Diesen Pfad gibt es dort nicht — `DATA_DIR=/data` ist ein Wert **im Container**
(`compose.yaml:79`), gemountet wird das benannte Volume `suite_data` (`compose.yaml:99`,
Deklaration siehe dritter Nachtrag), und ein benanntes Volume hat keinen vereinbarten Host-Pfad. Die
Nachbarblöcke R und Z verbieten die Form zwanzig Zeilen weiter ausdrücklich; A war der eine von
dreien, an dem sie stehen blieb. Ersetzt durch die §2.2.2-Form gegen `$VOL_SUITE`, **einschließlich**
der Gegenprobe `docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data`.

⚠️ **Zweiter Nachtrag 2026-08-21 (NT8), an derselben Zeile:** die Ersatzform liest **ohne**
`-readonly`. Eine frisch importierte `radio.db` liegt im **WAL-Modus** und trägt noch **kein**
`-shm`; ein Readonly-Handle darf es nicht anlegen und scheitert mit `unable to open database file
(14)` — eine Meldung, die wie ein **Importfehler** aussieht und keiner ist. Die Datei gehört uns,
das Anlegen der `-shm` ist harmlos. Für die **Quelle** gilt das Gegenteil: dort bleibt `-readonly`
Pflicht, solange `pragma journal_mode` der Alt-DB `delete` liefert.

Ziel (**fünf** Zahlen, gegen `radio.db` **im Volume**):

```bash
# ⚠️ ZUERST den ECHTEN Volume-Namen ablesen. Das ist die ZWEITE Ablesung
#    desselben Namens — die erste steht in §4.5 Schritt 4 Handgriff 1, im
#    Fenster-Protokoll. Sie wird hier NICHT geerbt, und das ist Absicht:
#    dieser Abschnitt laeuft fruehestens vierzehn Tage spaeter in einer NEUEN
#    Shell, in der die Zuweisung von damals laengst weg ist. Eine ungesetzte
#    Variable liest ein leeres Volume, und dessen Nullen sehen aus wie ein
#    Datenbefund.
# ⛔ BEIDE Ablesungen MUESSEN denselben Namen ergeben. Der hier abgelesene Wert
#    wird gegen die Protokollzeile aus §4.5 Schritt 4 Handgriff 1 GEGENGELESEN,
#    bevor eine einzige Zahl gezaehlt wird.
docker volume ls | grep -i suite
VOL_SUITE=<die Zeile aus dem Befehl oben>     # in Prod: suite_data (compose.yaml:252-254)

# Gegenprobe VOR der ersten Zaehlung — sie entscheidet, ob eine 0 ein Befund ist:
docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data
#   Erwartet: portal.db, qr.db, feedback.db, files.db, lagerbuch.db, aufgaben.db,
#   konto.db UND radio.db — die ACHT aus MODULE_MIGRATIONS (src/core/bootstrap.ts:21-58,
#   `radio` steht dort selbst auf :57) plus CORE_MIGRATIONS (:76-78, `konto` auf :77).
#   ⚠️ radio.db entsteht damit schon beim MIGRATIONSLAUF, nicht erst durch den Import —
#   eine vorhandene radio.db belegt also NICHTS ueber den Import. Das belegen die
#   Zaehlungen darunter.
#   Steht dort NUR radio.db, ist der Volume-Name falsch: `docker run` hat ein
#   neues, leeres Volume angelegt, und JEDE folgende 0 ist ein Volume-Fehler,
#   kein Datenbefund.

# KEIN -readonly (NT8, siehe Nachtrag oben).
for t in devices software_versions users device_events loans; do
  printf '%s\t' "$t"
  echo "select count(*) from $t;" | docker run --rm -i -v "$VOL_SUITE":/data alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /data/radio.db'
done

# zusaetzlich, nur fuers Protokoll — Tabelle ohne Quellgegenstueck:
echo "select 'zugangscodes', count(*) from zugangscodes;" | docker run --rm -i \
  -v "$VOL_SUITE":/data alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /data/radio.db'
```

⚠️ **Mount OHNE `:ro`, ⛔ kein `immutable=1`.** SQLite im WAL-Modus braucht zum **Lesen** eine
beschreibbare `-shm`-Datei; auf einem `:ro`-Mount scheitert der Befehl mit „unable to open database
file", **obwohl die Datenbank in Ordnung ist**. `immutable=1` hat dieselbe Wirkung wie `-readonly`
und ist hier ebenfalls unzulässig: zum Abbau-Zeitpunkt bedient der reguläre Stack `radio.iuk-ue.de`
seit vierzehn Tagen und hält sein Handle über die Prozesslebensdauer (`src/core/db/index.ts:24-34`,
`globalThis.__suiteDb`).

⚠️ **Dritter Nachtrag 2026-08-28 (C2), und er betrifft jeden `compose.yaml`-Verweis dieses
Dokuments:** die sechs Redirect-Labels des Alt-Hosts haben **31 Zeilen nach `compose.yaml:155`**
eingefügt. Verweise auf Zeilen **ab `:156`** sind seitdem um **+31** verschoben. Die Deklaration des
benannten Volumes `suite_data` stand als `:221-223` und steht heute auf **`:252-254`**; unter
`:221-223` liegt heute ein `files_data:/data/files:ro`-Mount am clamd-Dienst. Die Verweise `:79`,
`:99` und `:155` liegen **vor** dem Einfügepunkt und stimmen unverändert.

⚠️ **Es sind fünf Paare, nicht sechs** — vollständig entschieden in **W4**. Die Sechs-Tabellen-Schleife
aus Spec 1 §9.4.3 scheitert im Zielarm an `no such table: api_tokens`; das ist laut, aber ein
verbrannter Schritt im Abbau-Protokoll.

* **Erwartung:** fünf Paare gleich, **paarweise, nicht in der Summe**.
* **Abweichung bedeutet:** entweder ist der Import unvollständig, oder `DATA_DIR` zeigt woanders hin und
  `radio.db` ist eine frisch angelegte, leere Datei — `openModuleDatabase` legt Verzeichnis und Datei
  bei Bedarf an (`src/core/db/index.ts:12-22`), `/api/health/radio` wäre dagegen **grün**.
* **Folge:** ⛔ **blockiert den Abbau.** Ohne fünf gleiche Paare wird kein Volume gelöscht.
* `zugangscodes` hat kein Quellgegenstück und ist **nur Protokoll** — die Tabelle ist neu (B6). ⚠️ Hier
  ist eine Zahl **> 0 richtig und erwartet**: der erste Codesatz entstand nach dem Umschwenk (§4.8.2).

**Abfrage T — die `api_tokens`-Archivzeile.** Sie ersetzt die Migration und ist eine ausdrückliche
Zusage von Spec 1 §2.10 Nr. 1 an Spec 2:

```bash
sqlite3 -header -column radio-admin-snapshot.sqlite \
  "select id, name, prefix, created_at, last_used_at, revoked_at from api_tokens;"
```

* **Erwartung:** produktiv wenige Zeilen, davon **höchstens eine** mit `revoked_at IS NULL` — der
  Alt-Kiosk (Randbedingung 5, **kein externer Konsument**).
* **Abweichung bedeutet:** mehr als eine lebende Zeile heißt, es gab mehr als einen Konsumenten — dann
  ist Betreiberantwort 3 überholt und **es gibt einen Abnehmer, den niemand angekündigt hat.**
* **Folge:** ⛔ **blockiert den Abbau**, bis geklärt ist, wer die zweite lebende Zeile benutzt hat. Der
  Klartext ist nie gespeichert (`schema.ts:62`), eine mitgenommene Zeile wäre nicht einlösbar — die
  Zeile ist also keine Migrationsfrage, sondern eine **Konsumentenfrage**.
* Die Ausgabe geht **wörtlich** ins Protokoll, **ohne `token_hash`**: `last_used_at` ist danach nicht
  mehr abfragbar.

**Abfrage R — die Retention-Gegenprobe.** Die Stelle, an der der Faktor-1000-Fehler **nicht**
paritätsgrün bleibt.

```bash
# Quelle, Millisekunden. <freeze_iso> ist der in §4.5 Schritt 1 protokollierte Freeze-Zeitpunkt,
# NICHT 'now': 'now' wandert zwischen Import und Abbau und liefert zwei Zahlen,
# die sich nicht vergleichen lassen (W3).
sqlite3 radio-admin-snapshot.sqlite "
select count(*) from loans
 where returned_at is not null
   and returned_at < (strftime('%s','<freeze_iso>','-2 months') * 1000);"

# Ziel, Sekunden — derselbe Cutoff, ohne Faktor. Und wieder die §2.2.2-Form gegen
# dieselbe Protokollzeile $VOL_SUITE wie §4.5 Schritt 4 Handgriff 1: `$DATA_DIR/radio.db`
# gibt es auf dem HOST nicht (compose.yaml:79, :99, :252-254 — Nachtrag 2026-08-28).
# KEIN -readonly gegen radio.db (NT8, 2026-08-21) — siehe den Nachtrag an Abfrage A.
echo "select count(*) from loans
 where returned_at is not null
   and returned_at < strftime('%s','<freeze_iso>','-2 months');" \
| docker run --rm -i -v "$VOL_SUITE":/data alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /data/radio.db'
```

* ⚠️ **Der Faktor 1000 steht im Quellarm absichtlich im SQL** und **nicht** im Zielarm. Wer ihn im
  Quellarm weglässt, zählt **alle** zurückgegebenen Leihen und hält das für eine bestätigte Schätzung.
  Wer ihn im Zielarm hinzufügt, zählt null und hält das für „nichts betroffen".
* **Erwartung:** beide Zahlen gleich. Diese Zahl ersetzt die Betreiber-Schätzung „< 100" durch eine
  **Zählung** — die Schätzung ist keine Zählung und war nie eine.
* **Abweichung bedeutet:** Zielarm deutlich **höher** als Quellarm → der Faktor-1000-Fehler hat
  zugeschlagen, die Zeitstempel liegen im Jahr 1970 und der **nächste Retention-Lauf löscht die
  komplette abgeschlossene Leihhistorie**. Zielarm **niedriger** → der Import hat Zeilen verloren, die
  Abfrage A aber nicht gesehen hat (weil A nur zählt, nicht datiert).
* **Folge:** ⛔ **blockiert den Abbau** und, wenn sie vor dem Erstlauf der Retention auffällt, **auch
  den Weiterbetrieb**: `RADIO_HISTORIE_PURGE=0` setzen (B5: „laut bei jedem Start"), dann neu
  importieren.

> Abfrage R — Quelle: ________ · Ziel: ________ · gleich? ☐ ja ☐ nein · geprüft am ____________

**Abfrage Z — die Zeitstempel-Grenzprobe.** Billiger als R und findet denselben Fehler, ohne einen
Cutoff zu brauchen — **und sie sagt, WELCHE Spalte betroffen ist:**

⚠️ **Gelesen wird die Datei IM VOLUME, mit der `docker run`-Form aus §2.2.2** und derselben
`$VOL_SUITE`-Protokollzeile wie §4.5 Schritt 4 Handgriff 1 — `sqlite3` auf dem Host gegen
`"$DATA_DIR/radio.db"` liest einen Pfad, den es auf dem Host **nicht gibt** (`compose.yaml:79`,
`:99`, `:252-254` — Nachtrag 2026-08-28). Mount **ohne** `:ro`, ⛔ **kein** `immutable=1`.
⚠️ *Nachtrag 2026-08-21 (NT8): auch hier **ohne** `-readonly`. Diese Zeile forderte es bis dahin
ausdrücklich — gegen eine frisch importierte, im WAL-Modus liegende `radio.db` ohne `-shm`
scheitert ein Readonly-Handle mit `unable to open database file (14)`, und die Meldung sieht wie
ein Importfehler aus. Begründung vollständig am Nachtrag zu Abfrage A.*

```bash
echo "
select 'loans.returned_at',        count(*) from loans
   where returned_at is not null and (returned_at < 946684800 or returned_at > 4000000000)
union all
select 'loans.borrowed_at',        count(*) from loans
   where borrowed_at  < 946684800 or borrowed_at  > 4000000000
union all
select 'loans.created_at',         count(*) from loans
   where created_at   < 946684800 or created_at   > 4000000000
union all
select 'loans.updated_at',         count(*) from loans
   where updated_at   < 946684800 or updated_at   > 4000000000
union all
select 'devices.created_at',       count(*) from devices
   where created_at   < 946684800 or created_at   > 4000000000
union all
select 'devices.updated_at',       count(*) from devices
   where updated_at   < 946684800 or updated_at   > 4000000000
union all
select 'software_versions.created_at', count(*) from software_versions
   where created_at   < 946684800 or created_at   > 4000000000
union all
select 'users.last_seen_at',       count(*) from users
   where last_seen_at < 946684800 or last_seen_at > 4000000000
union all
select 'device_events.changed_at', count(*) from device_events
   where changed_at   < 946684800 or changed_at   > 4000000000
union all
select 'devices.last_updated_at (Formatprobe)', count(*) from devices
   where last_updated_at is not null
     and last_updated_at not glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';" \
| docker run --rm -i -v "$VOL_SUITE":/data alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /data/radio.db'
```

* `946684800` = 2000-01-01T00:00:00Z, `4000000000` = 2096-10-02T07:06:40Z. **Alle zehn Zahlen MÜSSEN
  0 sein.**
* ⚠️ **Beide Grenzen, und die obere ist nicht Zierrat:** `< 946684800` fängt Sekunden in einer
  Millisekunden-Quelle (Jahr 1970), `> 4000000000` fängt die **Gegenrichtung** — rohe Millisekunden,
  die ungeteilt in einer Sekundenspalte landen (Jahr 57000). Bis hierhin fragte das **niemand** ab.
* ⚠️ **Neun Spalten sind Zahlen, die zehnte ist Text.** `devices.last_updated_at` ist die einzige
  Spalte mit Typwechsel (`integer` ms → `text YYYY-MM-DD`, §1.4.3); für sie ist die Grenzprobe eine
  **Formatprobe**. Sie sagt nichts über die **Zone** — das tut nur die Zusicherung
  `g.lastUpdatedAt === "2025-03-02"` in §1.3.4 (⛛).
* **Abweichung bedeutet:** genau der Faktor-1000-Fehler; der Mapper hat je Feld eine eigene Zeile
  (§1.3.2), also ist die Fehlerstelle benannt.
* **Folge:** ⛔ **blockiert den Abbau.**

**Abfrage 8 — `dev-user`, falls nicht vor dem Import protokolliert** (= A9, beantwortet **U7**):

```bash
sqlite3 radio-admin-snapshot.sqlite "select sub from users;"
sqlite3 radio-admin-snapshot.sqlite "select distinct created_by from devices;"
```

* **Abweichung bedeutet:** ein `dev-user` unter den Audit-Spalten heißt, `AUTH_DEV_BYPASS` war
  irgendwann aktiv, und die Zuordnung von Journalzeilen zu Personen ist an diesen Stellen keine.
* **Folge:** **nur Protokoll** — aber nach dem gelöschten Volume ist die Frage nicht mehr stellbar.
  Deshalb steht sie hier und nicht „irgendwann".

### 5.2.3 radio-inventar: der Postgres, bevor er stirbt

⚠️ **Zwei Zugangswerte sind Vorbelegungen, keine Tatsachen** — beide vor dem ersten Befehl ablesen und
ins Protokoll schreiben (**E3**). `POSTGRES_USER` trägt nur `${POSTGRES_USER:-radio}`
(`radio-inventar/docker-compose.yml:7`), der Volumename bekommt das Projektpräfix (`postgres_data`,
`:12`). Hart gesetzt ist nur `POSTGRES_DB: radio_inventar` (`:10`).

```bash
docker compose -f radio-inventar/docker-compose.yml exec -T postgres printenv POSTGRES_USER
docker volume ls | grep -i postgres_data
```

> Echter POSTGRES_USER: ____________ · echter Volumename: ____________________

⚠️ **Die Anführungszeichen sind tragend.** Prisma legt die Tabellen in gemischter Groß-/Kleinschreibung
an; Postgres braucht dafür doppelte Anführungszeichen im SQL. Deshalb steht das SQL in **einfachen**
Anführungszeichen — ein `-c "…"` mit doppelten außen zerstört die inneren, und die Abfrage scheitert an
einer nicht existierenden Relation `adminuser`.

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
  Migrationsdateien plus einer handgepflegten `create-session-table.sql` **abgeleitet**; **aus einem
  Repository lässt sich der Prod-Tabellenbestand grundsätzlich nicht ableiten** (Spec 1 §2.10 Nr. 3).
* **Abweichung bedeutet:** liefert `pg_tables` **mehr**, liegt dort Bestand, den niemand eingeplant
  hat. Jede zusätzliche Tabelle ist per `select count(*)` zu zählen.
* **Folge:** ⛔ **blockiert den Abbau**, bis jede zusätzliche Tabelle gezählt und die Abbauliste (§5.3)
  um sie erweitert ist.

**P2 — liegt noch Bestand? `Loan` und `Device`.**

```bash
$PG 'select to_regclass('"'"'public."Loan"'"'"') as loan,
            to_regclass('"'"'public."Device"'"'"') as device;'
$PG 'select count(*) from "_prisma_migrations" where finished_at is not null;'
```

* **Erwartung:** `NULL, NULL` und **5** abgeschlossene Migrationen.
* **Abweichung bedeutet:** ein **Nicht-NULL** heißt, die Drop-Migrationen sind in Prod nie gelaufen —
  dann liegt im Kiosk-Postgres Geräte- und Leihbestand, den Kapitel 1 nicht kennt, und der Import
  braucht einen zweiten Zweig. Eine Zahl **unter 5** heißt, Prod hängt hinter dem eingefrorenen Stand
  `f883ec4`; dann ist jede `datei:zeile`-Aussage über den Kiosk unsicher.
* **Folge:** ⛔ **blockiert den Abbau, hart.** Bei Nicht-NULL wird kein Volume angefasst, sondern
  Kapitel 1 wieder aufgemacht. Das ist der Fall, in dem der Abbau am Standby-Ende **abgesagt** und
  nicht verschoben wird.

**P3 — `AdminUser`: wandert nicht, wird aber gezählt.**

```bash
$PG 'select count(*) from "AdminUser";'
$PG 'select username, "createdAt", "updatedAt" from "AdminUser";'
```

* Die Zeile „`AdminUser` wandert **nicht**" (Entscheidung 14) ist eine **Entscheidung, keine Messung**;
  diese Zählung dokumentiert, **was verworfen wird**. Der Beleg für die Entscheidung ist
  `pocket-id.service.ts:134`: im Pocket-ID-Betrieb baut der OIDC-Weg die Kennung synthetisch als
  `` `pocketid:${userInfo.sub}` `` und schreibt gar nicht in die Tabelle. Die Suite führt den **rohen**
  `sub`.
* **Erwartung:** `0`.
* **Abweichung bedeutet:** ein Ergebnis **> 0** heißt, es gab lokale Passwort-Identitäten, und ihr
  Verlust ist **vor** dem Löschen des Volumes ausdrücklich zur Kenntnis zu nehmen — nicht danach zu
  entdecken. `updatedAt > createdAt` beantwortet ohne Konfigurationszugriff, ob die Zugangsdaten je
  geändert wurden, also ob der Nutzer in Benutzung war (`docs/radio-portierung-analyse.md:2056-2059`).
* **Folge:** ⛔ **blockiert den Abbau**, bis die betroffene Person namentlich benannt und benachrichtigt
  ist. Die **Entscheidung** kippt dadurch nicht — der Port streicht den lokalen Passwort-Login
  ersatzlos —, aber sie wird dann **angekündigt statt bemerkt**.

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
  Sitzungen heißt: jemand arbeitet **heute** mit einem Passwort-Login, den der Port ersatzlos streicht.
* **Folge:** ⛔ **blockiert den Abbau** — und es ist eine Ankündigung an eine namentlich bekannte
  Person, kein technischer Posten.

**P5 — Zeilenzahlen aller Tabellen auf einen Blick, fürs Protokoll. Gezählt, nicht geschätzt.**

⚠️ **`n_live_tup` ist ein Schätzwert des Statistik-Sammlers** — er veraltet ohne `ANALYZE`- bzw.
Autovacuum-Lauf und steht nach einem Postgres-Neustart auf `0`. Genau diese Zeile ist die **letzte
Aufnahme eines Bestands, der in §5.3 fällt** und dessen einzige Sicherung der `pg_dump` aus P6 ist
(§5.2.4). Eine Schätzung ist dafür der falsche Datentyp — und P1 zwei Abfragen weiter verlangt für
jede unerwartet gefundene Tabelle ausdrücklich ein exaktes `select count(*)`. **Dasselbe Idiom hier:**

```bash
# Die Tabellenliste ist die AUSGABE von P1 — nicht abgeleitet, nicht erfunden.
for t in <die Tabellennamen aus P1, einer je Wort>; do
  $PG "select '$t' as tabelle, count(*) from \"$t\";"
done

# Zusaetzlich, und im Protokoll ausdruecklich als SCHAETZWERT beschriftet:
$PG 'select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc;'
```

* ⚠️ **Die Anführungszeichen um `"$t"` sind Pflicht:** `AdminUser` ist in Postgres nur als
  **quoted identifier** ansprechbar; ohne sie sucht der Server nach `adminuser` und meldet
  `relation "adminuser" does not exist` — ein Fehlbild, das wie eine fehlende Tabelle aussieht.
* **Folge:** **nur Protokoll** — aber **exakt**, und für **jede** Tabelle aus P1. Die
  `pg_stat_user_tables`-Zeile läuft mit, sie trägt im Protokoll das Wort **Schätzwert**, und
  Abweichungen zwischen ihr und den Zählungen sind **kein** Befund.

**P6 — der Archiv-Dump. Erst danach darf das Volume fallen.**

```bash
docker compose -f radio-inventar/docker-compose.yml exec -T postgres \
  pg_dump -U <echter POSTGRES_USER> -d radio_inventar --format=custom \
  > radio-inventar-final-$(date +%Y%m%dT%H%M%S).dump
```

⚠️ Der Kiosk-Postgres fiel aus jeder Sicherung, die dieses Repo kennt, **automatisch heraus**:
`scripts/backup.sh` kennt nur `"$DATA_DIR"/*.db` (`:25-27`) und `BLOB_DIR` (`:19-21`). **Dieser
`pg_dump` ist die einzige Sicherung, die dieses Volume je hatte** (§9.5.3). Er ist in §4.5 Schritt 3
schon einmal gelaufen; **hier läuft er erneut**, falls der Standby-Stack zwischenzeitlich gestartet
wurde — beides ins Protokoll, mit Zeitstempel.

### 5.2.4 Die Archivprobe: beide Archivdateien werden geöffnet

⚠️ **Der Schritt, den Spec 1 nicht führt, und der die Lücke schließt.** §9.4.1 verlangt die
Snapshot-Kopie, §9.4.2 Nr. 6 den `pg_dump` — **kein Schritt öffnet je eine der beiden Dateien.** Ohne
diesen Block ruht die einzige unumkehrbare Handlung dieses Cutovers auf zwei Dateien, die niemand
gelesen hat. Der Präzedenzfall steht im Haus: `files-cutover.md:368` — „Ein Backup-Tarball wurde
**geöffnet** und enthielt `files.db` **und** Blobs."

```bash
# (a) Die SQLite-Snapshot-Kopie: Tabellen vorhanden, Zahlen gleich der Freeze-Aufnahme.
sqlite3 radio-admin-snapshot.sqlite '.tables'
#   MUSS alle sechs fuehren: devices, device_events, software_versions,
#   users, loans, api_tokens. Fehlt eine, ist die Kopie vorbaselinig —
#   dasselbe Bild wie radio-admin/data/data.sqlite im Repo (Randbedingung 8),
#   und die Kopie ist wertlos.
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

* **Folge:** ⛔ **beide blockieren den Abbau.** Die Zahlen aus (a) gehören neben die Freeze-Aufnahme ins
  Protokoll; ein Unterschied heißt, in das Volume wurde nach dem Freeze geschrieben — **dann war der
  Freeze keiner.**
* ⚠️ **Und die Archivdateien liegen nicht auf demselben Server wie die Suite** (§9.5.1). Ein Archiv auf
  dem Rechner, dessen Ausfall es abdecken soll, ist kein Archiv. Ablageort ins Protokoll:
  ____________________

---

## 5.3 Die Abbauliste

Jede Zeile einzeln abhaken, und keine, bevor ihre Bedingung grün protokolliert ist.

> ⛔ **Kein Häkchen in dieser Liste, solange ein Block aus §5.2 offen oder rot ist.** Die Abbau-Sperren
> sind: **A, T, R, Z, P1, P2, P3, P4, P6** und **beide Archivproben** aus §5.2.4.
> **P5 ist Protokoll, keine Sperre** — **P6 ist Sperre, kein Protokoll.**
>
> ⚠️ *Nachtrag 2026-08-18:* P6 fehlte in diesem Kasten, obwohl §5.2.3 ihn mit „Erst danach darf das
> Volume fallen" überschreibt und Posten 3 den Abbau ausdrücklich „erst nach P6" bindet — der
> `pg_dump` ist die **einzige** Sicherung, die dieses Volume je hatte.

| # | Posten | Frist | Bedingung |
|---|---|---|---|
| 1 | **Traefik-Anbindung radio-inventar** (der Router auf `radio.iuk-ue.de`) | **sofort** beim Umschwenk | Muss weg, sonst halten **zwei** Router denselben Host. Das ist kein Abbau-, sondern ein **Cutover**-Schritt (§4.5 Schritt 9.1) und steht hier nur der Vollständigkeit halber |
| 2 | **Container `radio-inventar-backend`** (Image `ghcr.io/rubenvitt/radio-inventar/radio-inventar-backend`, `radio-inventar/docker-compose.yml:28`) | Standby **14 Tage** | Gestoppt, Image behalten. Er ist bis Stunde 1 der Rückweg für `radio.iuk-ue.de` |
| 3 | **Container `radio-inventar-db` + Volume `postgres_data`** (⚠️ **deklarierter** Name, `:12`; der echte trägt das Projektpräfix) | Standby **14 Tage** | Gestoppt, Volume erhalten — das Backend hängt per `depends_on: condition: service_healthy` (`:42-44`) daran, ein Rollback ohne ihn startet nicht. Abbau **erst** nach P6 **und erst**, wenn P1–P5 protokolliert sind |
| 4 | **Container `app` des radio-admin-Stacks** (Image `radio-admin:local`) | Standby **14 Tage** | Gestoppt. ⚠️ **Nicht starten** — §5.5 |
| 5 | **Volume `radio-data` von radio-admin** (⚠️ **deklarierter** Name; der echte trägt das Projektpräfix) | Standby **14 Tage** | Einzige Quelle für Re-Import und feldweise Nachprüfung. Abbau erst, wenn **A, T, R, Z** und die Archivprobe (a) grün sind |
| 6 | **Images** `radio-admin:local` und `…/radio-inventar-backend` | Standby **14 Tage** | Ohne Image ist der Rollback kein Handgriff, sondern ein Build |
| 7 | **Alte `.env`-Dateien beider Stacks** | **mit** dem Volume, nicht davor | §5.4 — der Posten, der liegen bleibt |
| 8 | **DNS `radio.iuk-ue.de`** | **bleibt**, unverändert | Zeigt vor und nach dem Cutover auf denselben Edge; nichts zu tun. **Genau das ist der Grund, warum es kein Parallelfenster gibt** |
| 9 | **DNS `radio-admin.iuk-ue.de`** | **bleibt**, solange der Redirect steht | **Kein** Abbau-Posten (`docs/radio-portierung-analyse.md:1669-1670`) — er ist die Abhängigkeit des Redirects. Ende in §5.6 |
| 10 | **Redirect-Router `radio-admin-alt` + `SUITE_REDIRECT_RULE_RADIO_ADMIN`** | nach der Bedingung aus §5.6 | Vier zusammenhängende Wochen ohne Treffer auf `radio-admin.iuk-ue.de` im Traefik-Zugriffsprotokoll (§9.2.4) |
| 11 | **Snapshot-Kopie + Postgres-Dump** | **Archiv, dauerhaft** | Nicht auf demselben Server wie die Suite. Sie sind der Rest, der die Volumes überlebt |
| 12 | **Repos `radio-admin` und `radio-inventar`** | **archivieren, nicht löschen** | GitHub-Archivierung (read-only) mit den Freeze-SHAs **`265abd5`** bzw. **`f883ec4`** im Archivierungshinweis. Sie sind die Belegquelle **jeder** `datei:zeile` aus Spec 1 und Spec 2; **ein gelöschtes Repo macht beide Specs unnachprüfbar** |
| 13 | **Zwei OIDC-Client-Registrierungen in Pocket ID** | Betreiberentscheidung (**U6**) | §5.4 |
| 14 | ⬜ **`radio-inventar`-Frontend-Auslieferung** | ⚠️ **unbekannt — siehe §5.3.1** | Solange **U4 / C.5** offen ist, ist **diese Liste unvollständig** |

### 5.3.1 ⚠️ Die benannte Lücke: wer liefert das radio-inventar-Frontend aus? (U4 / C.5)

**Diese Liste ist nachweislich unvollständig, und das steht hier als Lücke, nicht als Vermutung.**

Gemessen, zum Zeitpunkt des Schreibens: `radio-inventar/docker-compose.yml` führt **zwei** Services,
`postgres` (`:3`) und `backend` (`:26`, hinter `profiles: ["full-app"]`, `:27`). **Es gibt keinen
Frontend-Service.** Die Datei sagt es in ihrer ersten Zeile selbst:
`# docker-compose.yml (Development + Full-App Profile)` (`:1`). Zweiter Beleg derselben Klasse:
`API_TOKEN` ist Pflichtwert mit mindestens 32 Zeichen und **ohne Default**
(`radio-inventar/apps/backend/src/config/env.config.ts:11`), kommt in der eingecheckten Compose-Datei
aber **nicht vor** — der Env-Block des `backend`-Service (`:33-39`) führt ihn nicht. Dritter:
`POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-secret}` (`:9`) mit dem Kommentar „WICHTIG: In Production
POSTGRES_PASSWORD setzen!" (`:8`).

**Schlussfolgerung, belegt:** die eingecheckte Compose-Datei ist **nicht der Produktionsweg**
(`docs/radio-portierung-analyse.md:1880-1886`). Daraus folgt, was hier fehlt — **U4, U4a und U4b in der
Tabelle im Kopf dieser Spec**. Jede gefundene Komponente wird eine eigene Zeile in der Liste oben, mit
derselben Standby-Frist wie Posten 2 — **sie ist Teil des Rückwegs.**

⚠️ **Der Abbau ist nicht abgeschlossen, solange diese drei Auskünfte fehlen.** „Abgebaut" heißt sonst
„die Teile abgebaut, die im Repo standen" — und die eine Komponente, die den Host bedient hat, läuft
weiter. **Die Auskunft ist vor dem Cutover einzuholen, nicht danach** (§9.5.1), weil U4 zusätzlich den
**Freeze** blockiert (§4.5 Schritt 1).

---

## 5.4 Die Geheimnisse — der Posten, der liegen bleibt

⚠️ **Hier gilt Spec 1 §9.5.2, nicht die Analyse.** `docs/radio-portierung-analyse.md:839-843` schreibt,
die übernommenen Geheimnisse lebten nach dem Cutover „doppelt auf demselben Server". Für `radio` trifft
das **nicht** zu, weil **nichts** wertgleich übernommen wird: es gibt genau **einen** neuen Wert,
`RADIO_AUSLEIH_SITZUNG_SECRET`, **frisch erzeugt** und ⚠️ **nicht gleich `AUTH_SECRET`**
(`.env.example:256-257`). Radio invertiert damit das `lagerbuch`-Muster, wo `HELFER_SESSION_SECRET`
wertgleich aus der produktiven `stack.env` übernommen wurde, damit laufende Sitzungen den Cutover
überleben (`lagerbuch-cutover.md:413`).

**Der Befund wird dadurch nicht schwächer, sondern stärker:** die alten Werte bleiben **gültig** in
Dateien, die niemand mehr pflegt und die kein Repo kennt. **Ein verwaister, aber funktionierender
Vollzugriffs-Token braucht kein Duplikat, um gefährlich zu sein.** Deshalb steht das Löschen als
**Zeile**, nicht als Absicht.

| Datei / Ort | Werte |
|---|---|
| radio-admin `.env` | `SESSION_SECRET` · `OIDC_CLIENT_ID` · `OIDC_CLIENT_SECRET` · `OIDC_ISSUER` · `OIDC_REDIRECT_URI` · `OIDC_ADMIN_GROUP` · `OIDC_UPDATER_GROUP` · `LOAN_API_EXPECTED_AUDIENCE` · `LOAN_API_EXPECTED_SUBJECT` · `AUTH_DEV_BYPASS` / `DEV_USER_*` |
| radio-inventar Produktionsumgebung | `API_TOKEN` (der geteilte Kiosk-Token) · `SESSION_SECRET` · `POSTGRES_PASSWORD` · `POCKET_ID_CLIENT_SECRET` und die drei übrigen `POCKET_ID_*` |

Nachgeschlagen zum Zeitpunkt des Schreibens: `env.config.ts:11` führt `API_TOKEN` als **Pflichtwert
ohne Default** mit `min(32)`, `:12-15` die vier `POCKET_ID_*` als `optional().default('')`, und
`SESSION_SECRET` kommt aus `radio-inventar/docker-compose.yml:37` mit der Vorbelegung
`change-me-in-production`.

- [ ] radio-admin `.env` gelöscht, mit dem Volume (Posten 7) — am ____________
- [ ] ⚠️ **`API_TOKEN` — eigene Zeile.** Er ist Pflichtwert (`env.config.ts:11`), steht aber **nicht** in
      der eingecheckten Compose-Datei. Der Handgriff lautet **„finden, wo Produktion ihn setzt — dann
      dort löschen"**, nicht „aus der Compose-Datei entfernen" (**U4a**). Solange er irgendwo lebt,
      lebt ein Vollzugriff auf den alten Bestand. Fundort: ____________________
- [ ] `SESSION_SECRET` gelöscht — ⚠️ und geprüft, ob Produktion je die Vorbelegung
      `change-me-in-production` benutzt hat (`radio-inventar/docker-compose.yml:37`)
- [ ] `POSTGRES_PASSWORD` gelöscht — ⚠️ und geprüft, ob Produktion je die Vorbelegung `secret` benutzt
      hat (`:9`). Wenn ja, ist es kein Geheimnis, sondern war nie eines; **die Zeile bleibt trotzdem**
- [ ] ⚠️ **Die zwei OIDC-Client-Registrierungen in Pocket ID** (Posten 13, **U6**). radio-admin ist ein
      eigener Client (`radio-admin/server/src/auth/auth-service.ts:26-48`), radio-inventar ein zweiter.
      Beide tragen lebende Secrets und `redirect_uri`s auf Hosts, die verschwinden. Ob sie gelöscht oder
      aufbewahrt werden, entscheidet der Betreiber — **die Zeile muss existieren**, sonst bleiben zwei
      gültige Clients mit toten Rückadressen stehen. Entscheidung: ☐ gelöscht ☐ aufbewahrt, begründet:
      __________

⚠️ **Reihenfolge:** die `.env`-Dateien fallen **mit** dem Volume, nicht davor. Solange ein
Standby-Rückweg existiert (bis Stunde 1) bzw. ein Re-Import denkbar ist (14 Tage), braucht der Stack
seine Konfiguration. **Eine früh gelöschte `.env` macht den Rückweg zu einem Ratespiel.**

---

## 5.5 Der alte Purge ist **kein Cron** — und deshalb lautet die Zeile anders

Bei `files` war „**den alten Cleanup-Cron abschalten**" ein eigener Abbau-Punkt, weil er sonst „ins Leere
oder, schlimmer, in ein wiederverwendetes Verzeichnis" löscht (`files-cutover.md:309-310`). Der Punkt
gilt hier auch — **aber nicht in dieser Form**, und ihn falsch zu übernehmen sucht etwas, was es nicht
gibt.

**Gemessen: in radio-admin gibt es keinen externen Cron.** Der Purge fährt **im Anwendungsprozess** mit
(`index.ts:35` → `retentionService.ts:47`, erst `:48` setzt den Tagestimer). **Es gibt also nichts
abzuschalten — es gibt etwas nicht zu starten.**

- [ ] Der radio-admin-Stack wird im Standby **nicht gestartet.** Muss er doch (Rollback,
      Oberflächenvergleich), gilt **vorher** als nachgewiesen erfüllt: `HISTORY_RETENTION_MONTHS` in der
      Standby-Umgebung neutralisiert **oder** das Volume kopiert (§4.2 Nr. 3, §9.3.4 Zeile 1).
      Nachgewiesen am ____________ durch ____________________
- [ ] Jede feldweise Nachprüfung läuft per `sqlite3` gegen die **Snapshot-Kopie**, nie gegen einen
      gebooteten Alt-Stack (§9.3.4 Zeile 2)

*Kein Gate:* ein Start ist ein **erfolgreicher** Start mit einer Protokollzeile
(`retentionService.ts:41`, `[retention] purged N expired loan(s)`) — kein Fehler, kein roter Test, kein
Healthcheck. **Wer den Stack in Woche zwei hochfährt, um gegen die Historie zu prüfen, verliert zwei
weitere Wochen genau dieser Historie.**

**Für radio-inventar bleibt die Frage offen: U4b** (Host-Cron, systemd-Timer, Backup-Job). Aus dem
eingefrorenen Repo ist das **nicht ableitbar** — die eingecheckte Compose-Datei ist nicht der
Produktionsweg, und ein Host-Cron erscheint darin ohnehin nie. **Hier wird nichts erfunden**: ein
behaupteter Cron, den es nicht gibt, macht aus einem Abbau-Schritt eine Suche ohne Ende, und ein
verschwiegener, den es gibt, schreibt nach dem Abbau in ein wiederverwendetes Verzeichnis.

---

## 5.6 Der Redirect und sein Ende — die einzige Frist mit Bedingung statt Datum

Der Redirect vom Alt-Verwaltungshost (`radio-admin.iuk-ue.de` → 302 auf `radio.iuk-ue.de/admin`,
pfaderhaltend) hat **kein Ablaufdatum, sondern eine Bedingung** (§9.2.4):

* Er steht **mindestens** bis zum Ende des Standby-Fensters (§5.1).
* Er fällt, sobald im Traefik-Zugriffsprotokoll über **vier zusammenhängende Wochen** kein Treffer mehr
  auf `radio-admin.iuk-ue.de` erscheint. **Ohne benannte Bedingung lebt ein Redirect für immer**, und
  mit ihm ein DNS-Eintrag, den niemand mehr erklären kann.

**Der Abbau ist drei Zeilen, in dieser Reihenfolge** — der DNS-Eintrag fällt **zuletzt**, weil er die
Abhängigkeit des Redirects ist:

- [ ] 1. Die sechs `radio-admin-alt`-Labels aus `compose.yaml` entfernen, `docker compose up -d`
- [ ] 2. `SUITE_REDIRECT_RULE_RADIO_ADMIN` aus der `.env` auf dem Server entfernen
- [ ] 3. DNS-Eintrag `radio-admin.iuk-ue.de` löschen

> Vier-Wochen-Fenster ohne Treffer: von ____________ bis ____________ · Protokollquelle:
> ____________________ · Redirect abgebaut am ____________

⚠️ **Was hier nicht abgebaut wird:** `radio.iuk-ue.de` bleibt in `SUITE_TRAEFIK_RULE` und
`SUITE_HOST_RADIO` bleibt gesetzt — das ist ab dem Umschwenk der produktive Zustand, kein
Übergangsposten. **Und `radio-admin.iuk-ue.de` gehört zu keinem Zeitpunkt in `SUITE_TRAEFIK_RULE`**
(§4.4.4): dort aufgenommen bekäme der Host nicht den Redirect, sondern den stillen Portal-Fallback —
`const mod = moduleForHost(host) ?? getModule("portal")` (`src/core/routing.ts:69`), Kommentar zum
Fehlfall in `src/core/hosts.ts:52-57`. Ein funktionierender Ausdruck mit falschem Inhalt, und **kein
Test des Repos sieht Traefik-Labels an.**

---

## 5.7 Was der Abbau ausdrücklich nicht anfasst

* **`scripts/backup.sh` braucht keine Änderung.** Es sammelt `"$DATA_DIR"/*.db` per nullglob (`:25-27`)
  und sichert jede Datei per `sqlite3 .backup` (`:41-43`) — `radio.db` fällt automatisch hinein. Es gibt
  hier **keinen** Abbau-Handgriff, und das ist der Vorteil der Ein-Datei-je-Modul-Regel.
* **Der Monitor auf `/api/health/radio`** bleibt — er ist ab dem Umschwenk der produktive Posten.
  ⚠️ **Nie `/api/health`**: der Pfad liefert konstant `{status:"ok"}` ohne Modul und ohne Datenbank, und
  er antwortet nach dem Cutover auf `radio.iuk-ue.de` weiter `ok`, **ohne etwas über radio zu sagen**.
  Das Umstellen von Monitor und `docs/deployment.md` gehört ins **Cutover-Fenster** (§4.6 Nr. 15), nicht
  in den Abbau.
* **`SUITE_ADMIN_GROUP_RADIO`** bleibt gesetzt und nicht leer. Eine leere Liste gewährt **nichts**, und
  weil `radio` den `isModuleAdmin`-Kurzschluss modulintern ignoriert (Entscheidung 9), fängt der
  Suite-Admin niemanden auf: die Folge ist ein **stummes 404 für jede Verwaltungsseite**. Das ist keine
  Abbau-Zeile, aber es ist die Zeile, die beim Aufräumen am ehesten versehentlich geleert wird.
* **Der Abräum-Service-Worker unter `/sw.js`** bleibt. Er gehört in den **ersten Deploy**, nicht in den
  Cutover (§4.7.1) — und er bleibt danach stehen: der Origin ist zeichengleich, und ein Gerät, das den
  Alt-Kiosk installiert hat und erst in sechs Monaten wieder aufgeschlagen wird, braucht ihn dann noch.
  **Er ist kein Abbau-Posten** und hat kein Ablaufdatum, das diese Spec setzen könnte.

---

# Erfüllungspunkte

Nach dem Muster `docs/runbooks/files-cutover.md:360-370` (§H). **Jeder Punkt mit Ausgabe, nicht mit
Erwartung** — eine abgehakte Zeile ohne protokollierte Zahl ist keine abgehakte Zeile. Die
kleinteiligen Prüflisten stehen in **G1–G6** (§3.1.5), **§4.6 Nr. 1–16** und **§5.2**; diese Liste ist
die Klammer darüber.

**Vor der Generalprobe**

- [ ] 1. **Die drei Import-Tests sind grün** (§1.10): Faktor 1000 mit je Feld verschiedenen
      Fixture-Werten · asymmetrische Idempotenz Fall A und B (Zusicherung = **Fehlschlag**) ·
      Spaltenposition gegen die echte Alt-DDL
- [ ] 2. **Die Quelltext-Zusicherung zur Cookie-Domain** (Spec 1 §3.8) und **R36** (§3.2.6 V8) sind grün
- [ ] 3. ⛔ **Der Standby-Stack kann keine Historie mehr löschen — Nachweis ist das KOPIERTE
      VOLUME**, **vor dem ersten Generalproben-Snapshot** (W1): nachgewiesen am ______ durch ______
      *Nachtrag 2026-08-18 (**N7**): „`HISTORY_RETENTION_MONTHS` neutralisieren" ist **kein**
      ausführbarer Zweig. `export const HISTORY_RETENTION_MONTHS = 2;`
      (`radio-admin@265abd5:server/src/services/retentionService.ts:9`) ist eine
      **Quelltextkonstante**; der Name wird nirgends aus `process.env` gelesen und kommt weder in
      `.env.example` noch in `docker-compose.yml` vor (`git grep -n HISTORY_RETENTION 265abd5` =
      **drei** Treffer: `retentionService.ts:9` und `:19` sowie eine Entwurfsnotiz in
      `docs/loan-ownership-migration.md:100`). „Neutralisieren" hieße Quelltext ändern und
      `radio-admin:local` neu bauen (`radio-admin@265abd5:docker-compose.yml:3-4`) — was §5.3
      Posten 6 („Image behalten") bricht. **Verfügbar sind nur: Volume kopieren, oder nicht
      starten.***
- [ ] 4. **⬜ L13 und ⬜ L14 abgelesen** — ohne sie ist §4.5 Schritt 8 nicht ausführbar

**Generalprobe**

- [ ] 5. **G1–G6 vollständig grün** (§3.1.5). Es gibt keine teilweise grüne Generalprobe
- [ ] 6. **Der absichtliche Startabbruch wurde einmal gesehen** (§3.2.3)
- [ ] 7. **U8 gemessen:** Volumengröße und Dump-Dauer beider Stacks — sie bemessen das Fenster
- [ ] 8. **Der Prüfcontainer ist entfernt und `$GP` gelöscht** (§3.2.7)

**Vor dem Fenster**

- [ ] 9. **§4.2 Nr. 1–13 vollständig**, insbesondere: `/api/health/radio` antwortet **200** (nicht 503)
      · Abräum-Worker deployt · Cloudflare-Zonenregeln gelesen · `X-Forwarded-Host` am Server belegt ·
      Weg A/B entschieden · ⛔ **Nr. 13** (heutige Router-Regel **beider** Hosts wörtlich
      protokolliert, samt Rückstell-Befehl)
      *Nachtrag 2026-08-18: „Nr. 1–12" ließ genau den Posten aus, der ausweislich des Kopfes von
      §4.2 das Ergebnis des vorigen Kritikdurchgangs ist und selbst ein ⛔ trägt — ohne ihn hat der
      erste Handgriff des Umschwenks kein ausführbares Ziel.*
- [ ] 10. ⛔ **U4 / C.5 ist beantwortet** — sie blockiert den **Freeze**, nicht erst den Abbau
- [ ] 11. **E1–E8 ausgefüllt und im Protokoll**, `<E1>` exakt wie im `groups`-Claim
- [ ] 12. **Der Ausstellungsplan für die Zugangscodes steht** (§4.8), Zweig nach C.3 gewählt, Person
      aus E8 benannt

**Im Fenster**

- [ ] 13. **`<freeze_iso>` protokolliert** (§4.5 Schritt 1) — er ist der Cutoff jeder
      Vergleichsrechnung
- [ ] 14. **Der Snapshot entstand mit `.backup`, nicht mit `cp`** (W1), und **alle vier Glieder der
      Zählkette** schließen (§1.8)
- [ ] 15. **A1–A13 gelaufen**, die **acht** blockierenden erfüllt, jede 🧹-Bereinigung **wiederholt und
      protokolliert** (§3.5 Klasse B)
- [ ] 16. **Fünf Paare gleich** (§4.5 Schritt 5 a), **fünf** Feldstichproben zeilengenau (b), die
      Zeitstempel-Stichprobe aus `returned_at IS NOT NULL` (c)
- [ ] 17. **R und Z grün**, mit `<freeze_iso>` in **beiden** Armen: R Quelle ______ / Ziel ______ ·
      **Z: alle zehn Zeilen `0`** (neun Zahlgrenzproben + die Formatprobe
      `devices.last_updated_at`)
      *Nachtrag 2026-08-18: „alle drei" gegen zehn `union all`-Glieder und gegen §5.2.2, die „alle
      zehn Zahlen" schon sagt. Wer drei Zahlen abhakt und sieben ungelesen lässt, gibt ein Volume
      frei, dessen Zeitstempelspalten zu sieben Zehnteln ungeprüft sind.*
- [ ] 18. **`loans_device_active_uidx` existiert im Ziel** (§2.6) und `zugangscode_id` ist überall NULL
- [ ] 19. **Schritt 9 war EIN Schritt:** Alt-Router zuerst weg, dann die drei ⏸-Zeilen, dann `up -d`

**Nach dem Umschwenk**

- [ ] 20. **§4.6 Nr. 1–16 vollständig, mit Ausgabe** — insbesondere Nr. 1 (Body, nicht nur 200),
      Nr. 5 (**zwei** Ausgänge), Nr. 7 (alle drei `curl`), Nr. 10 (Login-Rückweg, Handarbeit, E8)
- [ ] 21. **Der erste Zugangscode ist ausgestellt** — auf dem umgeschwenkten Host, durch E8, **vor** der
      Freigabe an die Nutzer (§4.8.2). Der Restposten „Fläche ohne Code" ist protokolliert
- [ ] 22. **`RADIO_HISTORIE_PURGE=0` entfernt** — **erst nach** Punkt 17, und der zweite Log-Blick zeigt
      **keine** `radio:`-Zeile mehr (W10)
- [ ] 23. **Ein Telefon, das den Alt-Kiosk kannte, wurde einmal neu geladen** (§4.7.2)
- [ ] 24. **Das Backup ist einmal von Hand gelaufen** und `radio.db` liegt im Tarball
- [ ] 25. **Monitor und `docs/deployment.md` zeigen auf `/api/health/radio`**, nie auf `/api/health`
- [ ] 26. **Die Neuigkeitennotiz ist eingetragen**, `datum` = Rollout-Tag, `<N>` = der gesetzte Wert,
      ausgeschrieben

**Standby und Abbau**

- [ ] 27. **Standby-Ende als Datum und mit Namen** im Protokoll (§5.1.1): ______ / ____________
- [ ] 28. **A und T** protokolliert; T mit **höchstens einer** lebenden Zeile
- [ ] 29. **P1–P6 vollständig als Ausgabe**: `pg_tables` (jede unerwartete Tabelle gezählt) ·
      `Loan`/`Device` **NULL, NULL** und **5** Migrationen · `count(*) from "AdminUser"` = ______ ·
      `session` · `pg_stat_user_tables` · Dump existiert
- [ ] 30. **Beide Archivdateien wurden geöffnet** (§5.2.4): `.tables` zeigt alle **sechs**,
      `pragma integrity_check` = `ok`, `pg_restore --list` liefert eine Objektliste — und die
      Archivdateien liegen **nicht** auf dem Suite-Server: ____________________
- [ ] 31. **Der radio-admin-Stack wurde im Standby nie gestartet** — oder jeder Start ist mit dem
      Nachweis aus §5.5 protokolliert
- [ ] 32. **Beide Alt-Stacks abgebaut** (Posten 2–6), **Geheimnisse gelöscht** (§5.4) mit `API_TOKEN`
      und **Fundort**, **U6 entschieden und begründet**
- [ ] 33. **Beide Repos archiviert, nicht gelöscht**, mit `265abd5` und `f883ec4` im
      Archivierungshinweis
- [ ] 34. ⛔ **Punkt 10 bleibt offen, solange U4 offen ist:** „abgebaut" heißt sonst nur „die Teile, die
      im Repo standen"
- [ ] 35. **Der Redirect ist abgebaut** (§5.6, Reihenfolge Labels → `.env` → **DNS zuletzt**) **oder
      seine Bedingung läuft nachweislich weiter**: Vier-Wochen-Fenster begonnen am ______,
      Protokollquelle ____________
- [ ] 36. **`radio-admin.iuk-ue.de` steht in `SUITE_TRAEFIK_RULE` nicht** — geprüft mit
      `docker compose config | grep -A2 radio-admin-alt`, Ausgabe im Protokoll
- [ ] 37. **Die ⬜-Liste ist abgearbeitet** — jede der vierzehn Zeilen trägt eine Ablesung, und die
      Runbook-Stellen sind darauf nachgezogen

⚠️ **Punkt 10 und Punkt 34 sind die einzigen Punkte dieser Liste, die kein Befehl beantwortet.** Alle
anderen haben eine Ausgabe. Diese eine ist eine **Auskunft**, und sie ist **vor** dem Cutover
einzuholen — nach dem Abbau ist sie nur noch durch Ausprobieren zu beantworten, und das Ausprobieren
heißt dann: „was ist kaputtgegangen?"

---

# Anhang A — geprüft, kein Widerspruch

Nach der Hausform von Spec 1 (Anhang B, Abgelehnte Beanstandungen). **Diese sechs Stellen sahen beim
Zusammenführen wie Divergenzen aus und sind keine.** Sie stehen hier, damit ein späterer Durchgang sie
nicht erneut als Fund führt — und **nicht** in der Widerspruchsliste, weil eine mit geklärten Fällen
gepolsterte Liste um 23 Uhr überflogen wird.

| # | Sah aus wie | Befund |
|---|---|---|
| A-1 | **Blockierende Einstufung** — Spec 1 §2.8.3 nennt „Nummer 2, 4 und 6", Kapitel 2 markiert acht A-Marken ⛔, Kapitel 3 sechs Zeilen | **Konsistent.** Die Zahlen zählen in **drei verschiedenen Numerierungen**. Nach A-Marken aufgelöst ergibt sich **eine** Menge (W11); Kapitel 2 ist ein Superset und weitet nur, es widerspricht nicht |
| A-2 | **`api_tokens` in der Zählkette** — Kapitel 1 §1.8 führt sie in Glied (1) und (2), nicht in (4); Kapitel 2 A1 und Kapitel 5 Abfrage A führen sie im Quellarm | **Konsistent, und genau richtig:** Quelle protokolliert, Ziel existiert nicht (W4) |
| A-3 | **Postgres im Freeze nicht gestoppt, im Rückweg gestartet** — §4.5 Schritt 1 stoppt nur `backend`, §4.9 3b startet `postgres backend` | **Teilweise bestätigt, Nachtrag 2026-08-18.** Was **harmlos bleibt**: der Postgres hat keinen eigenen Schreiber, das Stoppen von `backend` schließt den Schreibweg, und `start postgres backend` ist auf einen laufenden Postgres idempotent. Was **nicht harmlos ist und hier berichtigt wird**: §4.9 3b fehlt `--profile full-app`. `backend` steht hinter `profiles: ["full-app"]` (`radio-inventar@f883ec4:docker-compose.yml:27`, unabhängig nachgelesen; `postgres` auf `:3` trägt keines) — und §4.5 Schritt 1 begründet für den **Stopp** ausdrücklich, warum das Profil in den Befehl gehört („ohne das Profil kann der Stopp ein No-op sein, und ein No-op sieht wie ein Erfolg aus"). **Das Argument ist richtungsunabhängig.** Verbindlich: der Stopp-Befehl aus Schritt 1 ist die Vorlage des Start-Befehls in §4.9, Wort für Wort, nur `stop` gegen `start` getauscht |
| A-4 | **Rückwegfrist gegen Standby-Frist** — eine Stunde gegen zwei Wochen | **Zwei verschiedene Dinge**, in §5.1.1 auseinandergehalten: die Stunde schützt den **Rückweg**, die zwei Wochen die **Datenquelle**. Die Fehllesart „zwei Wochen = Rollback-Fenster" ist dort ausdrücklich benannt |
| A-5 | **Zwei Zeitstempelproben** — §3.1.5.3 (b) `min/max(returned_at)` gegen Abfrage Z (**zehn** Spalten, feste Epoche) | **Komplementär, nicht doppelt.** (b) ist die eine eindeutige Zeile für die Generalprobe, Z benennt zusätzlich **welche** Spalte. Beide bleiben; Z ist die Abbau-Sperre. *Nachtrag 2026-08-18: die Nebenbemerkung „drei Spalten" war derselbe Zählfehler wie in Erfüllungspunkt 17 — es sind zehn, gezählt an den `union all`-Gliedern von Abfrage Z (§5.2.2). Die Entscheidung von A-5 ist davon unberührt.* |
| A-6 | **Posten 1 der Abbauliste ist ein Cutover-Schritt** | **Absicht.** Er steht in §5.3 „nur der Vollständigkeit halber" und wird in §4.5 Schritt 9.1 ausgeführt — sonst hielten zwei Router denselben Host |

---

# Anhang B — Abweichungen von Spec 1, gesammelt

Spec 1 §9 sagt: „wo Spec 2 von dieser Liste abweicht, ist es ein Fehler in Spec 2." **Vier Abweichungen
sind trotzdem nötig, und jede beruft sich auf die Ausnahme, die Kapitel B selbst setzt („Verbindlich ist
diese Tabelle") oder auf einen Beleg, den §9 nicht kannte.** Keine davon ist stillschweigend.

| # | Wo | Was | Warum |
|---|---|---|---|
| **A1** | Spec 1 §9.1, Zeile „Einfügereihenfolge" und Zeile „`api_tokens`"; §9.4.3, die Sechser-Schleife | `api_tokens` fällt aus der Einfügereihenfolge, aus **beiden** Paritätsarmen und aus dem Zielarm jeder Zählung. Der Paritätscheck deckt **fünf** Tabellen. Die `COUNT(*)`-Zeile bleibt als **Protokollzeile** | **B16** entscheidet wörtlich: „`mappeApiToken` **entfällt** (Entscheidung 13: **die Tabelle existiert im Ziel nicht**)". §2.8.2 und §2.10 Nr. 1 sind darauf nachgezogen, §9.1 und §9.4.3 sind es nicht. Ausgeschrieben in **W4** |
| **A2** | Spec 1 §2.8.3, das Wort „alle elf"; §8.2.1, „dreizehn"; Kapitel 3, „elfspaltig" | **Zehn** Quellspalten in epoch-Millisekunden: neun Zeitstempel + `devices.last_updated_at` | B16 sagt „**neun** Zeitstempel-Spalten" plus eine eigene Zeile für `last_updated_at`; die SQL-Abfrage in §2.8.3 führt schon zehn Summanden. **Die Abfrage bleibt unverändert, nur die Beschriftung wird korrigiert** (W8) |
| **A3** | Spec 1 §2.11, Dateiliste `scripts/import/fixtures/radio-*.json` | Fixtures liegen als `radio-quelle.ts` **und** `radio-quelle-ddl.sql`, also **kein** `.json` | Numerische Trennstriche in 13-stelligen Zeitstempeln sind gegenlesbar, im JSON gibt es sie nicht; und die Alt-DDL **muss** kopiert im Repo liegen, weil `radio-admin` nach Kapitel 5 nur noch archiviert ist. Gleiche Anzahl, gleiche Werte, gleiche Regel (§1.8) |
| **A4** | Spec 1 §9.4.1, der Snapshot-Befehl `cp /d/data.sqlite /out/…` | **`sqlite3 … ".backup …"`** (oder `VACUUM INTO`), in Generalprobe und Fenster, **und ohne `docker compose stop`** | §9.4.1 bindet die **Abfragen** wörtlich, nicht den Snapshot-**Befehl**. Der `cp` verliert bei WAL den Schwanz aller committeten Transaktionen (`radio-admin/server/src/db/index.ts`), und der Fehler ist **paritätsgrün**. `.backup` ist die Hausform (`scripts/backup.sh:41-43`, das ohne `*.db` sogar **hart** abbricht) und arbeitet gegen die laufende DB — womit der Stopp entfällt, dessen **Neustart** Historie löscht. Ausgeschrieben in **W1** |

**Zusätzlich zwei Ergänzungen ohne Widerspruch** (additiv zu Spec 1 §2.2.5 bzw. §2.8.3): der zwölfte
Mapper-Test für `null` in `alamos_integrated`/`loanable` (§1.3.5), der Reihenfolge-Test gegen die echte
Alt-DDL (§1.8), sowie **A11–A13** als Vorabfragen (§2.4.7–§2.4.9) und die **Archivprobe** (§5.2.4) —
der Schritt, der die beiden Archivdateien tatsächlich öffnet.
