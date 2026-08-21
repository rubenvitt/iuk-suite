# Sperrenverzeichnis — `radio`, Spec 2

**Stand 2026-08-19.** Die eine Seite, die **vor dem Bau** und **vor dem Cutover-Abend** gelesen wird.

Diese Seite führt jede Nummer, die einen Schritt des `radio`-Wegs anhält, an einem Ort, damit
niemand am Cutover-Abend erfährt, dass ihm eine Auskunft fehlt. Sie ist danach geordnet, **wer
antwortet** — der Bau, der Server, der Betreiber —, weil das die einzige Sortierung ist, aus der
eine Handlung folgt, und weil das, was niemand beantwortet, dann sichtbar übrig bleibt. Jede Zeile
ist eine **Ablesung** oder eine **Auskunft**, keine Entscheidung; wer eine Zeile mit einer plausibel
aussehenden Erfindung füllt, hat keine Lücke geschlossen, sondern eine **geprüft aussehende Zusage**
erzeugt. Der Präzedenzfall ist vernarbt: die `lagerbuch`-Spec verlangte ein `cookies().delete()` in
einer Server Component, wo es **wirft** — ein Test hätte dort eine Zusage geprüft, welche die
Bauform nicht halten kann, und wäre grün gewesen, bis es zu spät war. Deshalb gilt hier dieselbe
Regel wie in den zwei Leitplänen: **der Runbook-TEXT ist heute schreibbar, was wartet, ist die
Ablesung, die das leere Feld füllt** — eine Zeile mit `⬜ L13` ist prüfbar, eine Zeile mit einer
geratenen Portnummer ist es nicht.

---

## Wie diese Seite zu lesen ist

**Zwei Pläne, zwei Numerierungen — und sie kollidieren.** Der Bau-Plan
(`docs/superpowers/plans/2026-08-18-radio-bau-leitplan.md`) zählt **17** Aufgaben, der Cutover-Plan
(`docs/superpowers/plans/2026-08-18-radio-cutover-leitplan.md`) zählt **41**. In diesem Dokument
steht deshalb **nie** eine nackte Zahl:

* **Bau 5** = Aufgabe 5 des Bau-Plans
* **Cut 27** = Aufgabe 27 des Cutover-Plans

**Die Spalten sind in allen vier Tabellen dieselben:** Nummer · Frage/Ablesung · Quelle · blockiert
(Aufgabe/Plan/Schritt) · Frist.

**Die Zeichen:** ⛔ = ohne diese Antwort wird der Schritt nicht ausgeführt · ⚠️ = die Antwort ist
früher fällig, als die Aufgabennummer vermuten lässt · **(Ableitung)** = eine Frist, die **nicht**
in Spec oder Plan steht, sondern hier begründet wird; alles ohne diese Marke ist zitiert.

**Grundlage:** Spec 2 (`docs/superpowers/specs/2026-08-18-radio-cutover-design.md`, 4914 Zeilen,
Rahmen 1–561) · die zwei Leitpläne · die fünf Planteile unter
`docs/superpowers/plans/` · `docs/superpowers/plans/ENTSCHEIDUNGEN-radio.md`.

**Der Stand des Baus, nachgesehen 2026-08-19:** `src/app/m/radio/` existiert nicht,
`scripts/import/radio.ts` existiert nicht (`scripts/import/` führt `feedback-time.ts`,
`feedback.ts`, `parity.ts`, `portal.ts` plus Tests und `fixtures/`). **Spec 1 ist nicht gebaut.**
Alles unter „Der Bau" wartet damit auf ein Ereignis, das noch nicht stattgefunden hat.

---

## (a) Der Bau — was erst die gebaute Datei hergibt

Fünfzehn Zeilen. Sie werden **nach** dem Bau von Spec 1 abgearbeitet; keine davon ist eine
Entscheidung, jede ist eine Ablesung an einer Datei, die es noch nicht gibt.

| Nummer | Frage / Ablesung | Quelle | blockiert | Frist |
|---|---|---|---|---|
| **⬜ L1** | Die **zehn** Typaliase, die `src/app/m/radio/_db/schema.ts` exportiert. Spec 1 §2.2.4 belegt **zwei** (`NeuesGeraet`, `Geraet`), §8.2.1 **benutzt** vier weitere insert-seitig, die **vier select-seitigen** (`SoftwareVersion`, `Benutzer`, `GeraeteEreignis`, `Leihe`) stehen **nirgends** | Bau (Schemadatei) | **Bau 5 · 6 · 7 · 9 · 10 · 11 · 12 · 13 · 14 · 15 · 16** — ohne sie kompiliert keine Mapper- und keine Sichtsignatur | vor **Bau 5**; ⚠️ und damit vor der ersten Generalprobe — die drei tragenden Tests (§1.10) liegen in Bau 5 und Bau 15, und §3.6 Nr. 1 verlangt sie grün |
| **⬜ L3** | Namen und **vollständige** Spaltenlisten der vier übrigen Paritätssichten (`software_versions` 6, `users` 3, `device_events` 8, `loans` 12); je Sicht: (a) trägt sie **jede** Spalte der Zieltabelle, (b) läuft jede `mode: "timestamp"`-Spalte durch `sekunden()`, (c) bleibt `devices.last_updated_at` **unumgerechnet** | Bau | **Bau 9 · 10 · 11 · 12 · 13** | vor **Bau 9** |
| **⬜ L2** ⚠️ verengt | Ob better-sqlite3 die Meldung `UNIQUE constraint failed: loans.device_id` verpackt. **Gemessen** gegen better-sqlite3 13.0.2 (`SqliteError`, `code === "SQLITE_CONSTRAINT_UNIQUE"`, `message` zeichengleich, **ohne** `cause`); drizzle-orm 0.45.2 reicht sie unverändert durch. **Offen bleibt allein die Versionsbindung** | Bau (erster Testlauf) | **Bau 15** | mit **Bau 15**; keine Wartezeit — der Test darf zusichern, eine künftige Fassung scheitert dann **laut** |
| **⬜ L6** | Die genaue **Abschlusszeile** von `scripts/import/radio.ts`, **byteweise**, samt **Exit-Code**. Vorläufig, ausdrücklich als vorläufig beschriftet und ohne Umlaut: `Radio-Import OK — <n> Zeilen, Paritaet gruen.` | Bau / Runbook | **Bau 16 · 17** · **Cut 14** (§P.4 greppt darauf) | **Bau 16** schreibt sie, **Bau 17** liest sie ab und **meldet sie an Cut 14** — vor der ersten Generalprobe |
| **⬜ L4** | `select count(*) from __drizzle_migrations;` in `radio.db` gegen die Zahl der Einträge in `src/app/m/radio/_db/migrations/meta/_journal.json` | Bau | **Cut 9 · 15** | mit dem gebauten Migrationsverzeichnis, vor **Cut 9** |
| **⬜ L5** ⚠️ verkleinert (NS8) | Allein der **Sollwert** von `revision` in `/api/health/radio`. Die Feldnamen sind heute lesbar (`src/core/health/index.ts:4-15`, `src/app/api/health/[modul]/route.ts:23-26`) | §A Nr. 1 — die Protokollzeile des **ersten Deploys** | **Cut 9 · 19 · 30** | mit dem ersten Deploy; vor **Cut 19** |
| **⬜ L7** | Der **vollständige** `Location`-Kopf der `/admin`-Weiterleitung: Statuscode (**307 oder 302**), Protokoll und Host | Bau / Abruf | **Cut 19 · 29 · 30** | vor **Cut 19**; protokolliert wird der vollständige Wert in jedem Fall |
| **⬜ L8** | Was `GET /m/radio` mit `Host: iuk-ue.de` liefern **soll** — 404 aus dem Host-Riegel oder eine gerenderte Fläche | Bau (Spec 1 §1.2) | **Cut 19 · 29** | vor **Cut 19**; ⚠️ **abgelesen und protokolliert wird es in jedem Fall** |
| **⬜ L9** | Ob `/` oder `/t/<code>` eine **kamerabasierte** Fläche trägt | Bau | **Cut 20** — **Zweigwahl, keine Blockade** | vor der Ausführung von Cut 20; der **Text** beider Fassungen entsteht heute |
| **⬜ L10** | Die Zeichenkette aus dem modul-eigenen Ausleih-Rahmen, die im **Portal**-HTML **nicht** vorkommt | Bau | **Cut 19 · 29 · 30** | vor **Cut 19**. ⚠️ Eine erfundene Zeichenkette wäre ein Test, der grün ist, **weil er nichts trifft** |
| **⬜ L11** | Was `curl -si https://radio.iuk-ue.de/manifest.webmanifest` **tatsächlich** liefert | Bau / Abruf | **Cut 30** | vor **Cut 30** |
| **⬜ L12** | Der Ablesepunkt in den Entwicklerwerkzeugen nach dem Reload: welche Einträge unter *Application → Service Workers* und *Cache Storage* leer sein müssen, und ob ein „redundant"-Eintrag stehen bleibt | Bau / Browser | **Cut 30** | vor **Cut 30** |
| **⬜ L14** ⛔ | Darf der Fenster-Prüfcontainer **parallel** zum Schritt-7-Stack auf `suite_data` booten, oder muss der Stack dafür gestoppt werden? | Bau / Abruf | **Cut 29** | ⚠️ **BEVOR das Fenster geplant wird** — der Ausweichweg stoppt **sechs andere Module**, und dann ist der Umschwenk kein reiner `radio`-Vorgang mehr |
| **⬜ N1** | Hält der reguläre Stack `radio.db` nach dem Boot **dauerhaft offen**? Zwei der drei Wege schließen nachweislich (`src/core/bootstrap.ts:99-105`, `src/core/health/index.ts:13-15`), der dritte — die `radio`-Boot-Haken — ist ungebaut | Bau / Abruf | **Cut 4 · 28** | vor **Cut 4**. ⚠️ Die **Entscheidung** (kein `immutable=1` im Fenster) steht bereits; offen ist die **Festigkeit ihres Grundes** — siehe Risiko **R7** |
| **⬜ N4** | Der Pfad der `sw.js`-Route unter `src/app/m/radio/` und damit die interne URL-Form | Bau (Spec 1 §7.1.3) | **Cut 19** (Fremdhost-Probe V6) | vor **Cut 19** |

**Aufgelöst und nicht mehr zu führen:** die **Exportnamen der fünf Tabellenobjekte** in
`_db/schema.ts` waren nie eine Leerstelle — Spec 1 schreibt alle fünf als `export const` aus
(`2026-08-17-radio-modul-design.md:1206` `devices`, `:1254` `softwareVersions`, `:1298` `users`,
`:1311` `deviceEvents`, `:1349` `loans`). Der **Bau-Leitplan** erklärt sie in **NS6** für aufgelöst
und streicht die Zeile; die flache, dokumentweite Numerierung **N1–N10** (Cutover-Leitplan **NS6**)
führt sie nicht mehr.

---

## (b) Der Server — Ablesungen, und der Befehl, der sie liefert

Elf Zeilen. **Wo in Spec oder Plänen kein Befehl ausgeschrieben ist, steht das hier so da** — ein
geratener Befehl ist dieselbe Klasse Fehler wie ein geratener Wert.

| Nummer | Frage / Ablesung | Quelle — der Befehl, wo es einen gibt | blockiert | Frist |
|---|---|---|---|---|
| **⬜ L13** ⛔ | (a) Der Name des regulären Suite-Containers · (b) der veröffentlichte **Loopback-Port** des Fenster-Prüfcontainers | (a) `docker compose ps` · (b) ⚠️ **kein Befehl — das ist eine Wahl, keine Ablesung**; die Generalprobe fährt `-p 127.0.0.1:3999:3000` (Cut 18) | **Cut 28 · 29** — ⛔ ohne beides ist §C Schritt 8 **nicht ausführbar** | vor **Cut 25** (§A), spätestens vor **Cut 29** |
| **E2** | Der **echte** Volume-Name von `radio-admin` (compose präfixt mit dem Projektnamen) | `docker volume ls \| grep -i radio-data` | **Cut 4 · 12 · 27 · 33** | vor **Cut 12** — der Generalproben-Snapshot braucht ihn |
| **E3** | Der **echte** Volume-Name **und** `POSTGRES_USER` von `radio-inventar` | Server — **kein Befehl in Spec oder Plänen ausgeschrieben** | **Cut 27 · 34** | vor **Cut 27** (Freeze) |
| **E7** | Der Traefik-Containername | Server — **kein Befehl ausgeschrieben** | **Cut 30 · 39** | vor **Cut 30** |
| **⬜ N2** ⛔ | Ist die `compose.yaml` **mit** der `radio-admin-alt`-Labelgruppe auf dem Server **ausgerollt**? | `docker compose config \| grep -A2 radio-admin-alt` — **am Server** | **Cut 25** (§A Nr. 14) — ⛔ sonst trifft **Cut 29** Nr. 3 **nichts** | ⚠️ **vor dem Fenster und vor Cut 25**: die Labels aus Cut 2 „müssen in einem **früheren** Rollout auf dem Server liegen" |
| **⬜ N3** ⛔ | Die **tatsächliche** numerische Kennung des **laufenden** Suite-Prozesses — **nicht** die des Images | `docker inspect <L13> --format '{{.Config.User}}'` bzw. die Zeile `SUITE_USER` aus der `.env` | **Cut 10 · 14 · 18 · 28** | ⚠️ vor **Cut 10** (§P.0) — die **Generalprobe** liest sie schon. Mit dem **Image**-Wert ist die Erwartung auf einem Standardhost **zwangsläufig rot** (siehe Abschnitt 3, Punkt 6) |
| **⬜ N5** | Mit welcher Env läuft der Host-Cron `scripts/backup.sh` (`DATA_DIR`, `BLOB_DIR`), und wo landet das Tarball? | Crontab bzw. Timer-Unit | **Cut 30** (§D Nr. 13) | vor **Cut 30** |
| **⬜ N6** | Der Edge-Proxy: (a) setzt er `X-Forwarded-Host` oder reicht er ihn durch · (b) welche Entrypoints gibt er an Traefik weiter · (c) ist `radio-admin.iuk-ue.de` dort bekannt? | Server — **kein Befehl ausgeschrieben** | **Cut 25** (§A Nr. 8) · **Cut 30** (§D Nr. 7) | vor **Cut 25** — ohne (b)/(c) laufen drei `curl` in einen **TLS-Fehler, statt rot zu werden** |
| **⬜ N7** ⛔ | Ist `HISTORY_RETENTION_MONTHS` im **produktiv laufenden** `radio-admin` konfigurierbar? Gemessen an `265abd5` ist sie es **nicht** | Server — Herkunft des laufenden Images | **Cut 38 · 40** (§H Punkt 3 und 31) **und die Zulässigkeitsbedingung des Rückwegs 3a** | ⚠️ **vor dem Fenster**, nicht erst vor dem Abbau — der **Rückweg** hängt daran, und der Rückweg ist eine Stunde lang |
| **⬜ N9** ⛔ | Gibt es ein Traefik-Zugriffsprotokoll, wo liegt es, wie lange wird es vorgehalten? | Server (**E7** nennt den Container) | **Cut 39 · 36** (Posten 10) · **Cut 40** (Punkt 35) | vor **Cut 39**; ⚠️ **(Ableitung)** sinnvoll **vor dem Umschwenk** — gibt es kein Protokoll, ist die Abbaubedingung **nie erfüllbar** und ein Ersatzkriterium muss verabredet sein, bevor der Redirect lebt |
| **⬜ N10** | Wo liegen die **zwei Alt-Checkouts** auf dem Server — das Arbeitsverzeichnis der `docker compose -f …`-Befehle? | Server — **kein Befehl ausgeschrieben** | **Cut 27 · 34 · 38** | vor **Cut 27** — aus dem falschen Verzeichnis antwortet jeder Befehl `no configuration file provided` |

---

## (c) Der Betreiber — Ruben

Sechzehn Fragen. **Jede ist so gestellt, dass sie mit ja/nein oder einem Wert beantwortbar ist** — das ist der Zweck dieser Tabelle. Die Doppelmarken (`E4 / C.2`) stehen vollständig da, damit
auch findet, wer nach der C-Nummer sucht.

| Nummer | Die Frage, in einem Satz | Quelle | blockiert | Frist |
|---|---|---|---|---|
| **U4 / C.5** ⛔ | **Auf welchem Host und über welchen Weg — Container, statische Auslieferung, Reverse-Proxy-Eintrag — wird `radio.iuk-ue.de` heute ausgeliefert?** | Betreiber — ⚠️ **kein Befehl beantwortet ihn** | ⛔ **Cut 27** (Freeze) · ⛔ **Cut 29** (der Umschwenk hat ohne U4 kein ausführbares Ziel) · ⛔ **Cut 31** (Rückweg 3c/3d) · **Cut 36** (Vollständigkeit der Abbauliste) | **vor dem Fenster.** Nach dem Abbau nur noch durch Ausprobieren — und das Ausprobieren heißt dann „was ist kaputtgegangen?" |
| **C.6 / B4** ⛔ | **Bekommt `radio` zwei Verwaltungsstufen (Admin und Updater) oder eine?** | Betreiber — in Spec 1 **bewusst geparkt**, fachlich blockierend | **Cut 3 · 26** — **genau eine `.env`-Zeile** | vor **Cut 3** und **Cut 26**. Der Cutover ist ohne Antwort **durchführbar** (eine Rolle ist der engere Zuschnitt); fällt sie auf „zwei Rollen", kommen eine sechste Boot-Prüfung und eine sechste Eingabe neben E1 hinzu |
| **E5 / C.3** ⛔ | **Sind gedruckte Aufsteller mit dem heutigen QR-Code im Umlauf — und wenn ja: wie viele, wo, und wer kann sie ersetzen?** | **Begehung, kein `SELECT`** | ⛔ **Cut 31** — die **Zweigwahl** in §F | **vor dem Fenster**, nicht am Fensterabend: „Beide Zweige stehen hier, weil die Entscheidung am Cutover-Abend zu spät kommt" (`2026-08-18-plan4-radio-cutover.md:2292-2293`) |
| **E1** | **Wie heißt die Gruppe für `SUITE_ADMIN_GROUP_RADIO`, zeichengleich wie im `groups`-Claim?** | Betreiber | **Cut 26** — jede Verwaltungsseite | vor **Cut 26**, also vor dem Fenster. ⚠️ **Nicht** vor der Generalprobe: die setzt einen frei erfundenen Wert, und das ist richtig |
| **E4 / C.2** | **Gilt für `RADIO_AUSLEIH_SITZUNG_STUNDEN` der Vorschlag 12, oder ein anderer Wert?** | Betreiber | **Cut 26 · 31** | vor **Cut 26**. Ohne Antwort gilt **12** — der Cutover läuft, aber die Neuigkeitennotiz führte sonst eine **unbestätigte** Zahl als bestätigt |
| **E6** | **Wie viele Geräte tragen den Alt-Token noch im `localStorage`?** | **Begehung, kein `SELECT`** — der Token liegt im `localStorage`, es gibt keine Tabelle | **Cut 30** (Umfang des SW-Handgriffs) | vor **Cut 30**. Zur Grenze dieser Zahl siehe Risiko **R2** |
| **E8** | **Wer ist am Cutover-Abend namentlich anwesend und stellt den ersten Zugangscode aus?** | Betreiber | **Cut 31** | vor dem Fenster — derselbe Schritt ist zugleich der Beweis des stummen Login-Rückwegs |
| **U4a** | **Wo setzt die Produktion `API_TOKEN`** (Pflichtwert `min(32)`, ohne Default, in der eingecheckten Compose-Datei **nicht** enthalten)**?** | Betreiber, gleiche Wurzel wie U4 | **Cut 37** | vor **Cut 37** — der Handgriff lautet „finden, wo Produktion ihn setzt, dann dort löschen" |
| **U4b** | **Gibt es auf Host-Ebene einen Cron, systemd-Timer oder Backup-Job zu einem der zwei Alt-Stacks — ja oder nein?** | Betreiber, gleiche Wurzel wie U4 | **Cut 38** | vor **Cut 38** |
| **U6** | **Werden die zwei OIDC-Client-Registrierungen in Pocket ID gelöscht oder aufbewahrt?** | Betreiber | **Cut 36** (Posten 13) · **Cut 37** | vor **Cut 36** |
| **U7** | **Lief `radio-admin` in Produktion je mit `AUTH_DEV_BYPASS`?** | ⚠️ **nicht der Betreiber, sondern Abfrage A9** (Cut 5), Wiederholung als Abfrage 8 (Cut 33) | **Cut 5 · 33** — die Lesbarkeit der Audit-Spalten | ⛔ **vor dem Löschen des `radio-admin`-Volumes** (Cut 36). Danach **nie wieder** — siehe Risiko **R5** |
| **⬜ N8** ⛔ | **Wohin gehen die zwei Archivdateien — Zielsystem, Zugriffsweg, Person — und womit ist belegt, dass es nicht der Suite-Server ist?** | Betreiber | ⛔ **Cut 35** · **Cut 36** (Posten 11) · **Cut 40** (Punkt 30) | vor **Cut 35**; ⚠️ **(Ableitung)** besser vor **Cut 27**, denn dort **entstehen** die zwei Dateien |
| **U9** | **Sind Repo- und Server-`compose.yaml` am 19.07. auseinandergelaufen** (`ADMIN_GROUP` fehlte in der Vorlage)**?** | Betreiber — im Repo **nicht nachweisbar**, deshalb Frage und nicht Tatsache | **Cut 2 — nur als Notiz, blockiert nichts** | keine Frist |
| **C.1** | **Bleibt es beim dauerhaften, sperrbaren Ausleih-Code, oder soll jeder Scan eine eigene Sitzung prägen?** | von **Spec 1 vorentschieden**, nicht vom Betreiber | **kein Cutover-Schritt** | ⚠️ **der Druck des ersten Codesatzes** (Cut 31, §F) ist die Frist — danach ist ein Wechsel ein Papieraustausch, nicht eine Schemaänderung |
| **C.4** | **Soll der Benutzername beim Ausleihen vorbelegt (und überschreibbar) sein?** | Betreiber | **kein Cutover-Schritt** — nur **Cut 20** (V14) sieht es | vor der Ausführung von Cut 20 |
| **C.7** | **Muss eine Ausleihe ohne Netz erfassbar sein und später nachlaufen?** | Betreiber | **kein Cutover-Schritt** — aber die **Begründung** des Abräum-Workers hängt daran (er hat **keinen `fetch`-Handler**) | keine Frist im Fenster; wäre es Pflicht, wäre es eine **Moduländerung** und keine Runbook-Zeile |

⚠️ **`U8` (Volumengröße und Dump-Dauer beider Stacks) steht in keiner dieser Tabellen und ist keine
Sperre.** Sie **entsteht** in Cut 12 und Cut 22 (Messung in der Generalprobe) und wird von Cut 25
verbraucht — eine Zulieferung, keine Wartezeile (NS14).

---

## (d) Was gar nicht beantwortbar ist — als Risiko geführt

Sieben Posten. **Sie stehen hier, damit sie nicht als offene Sperre gelesen und immer wieder
nachgefragt werden** — auf keinen von ihnen wartet man sinnvoll.

| Nummer | Was nicht beantwortbar ist | Quelle | blockiert | Frist |
|---|---|---|---|---|
| **R1** | **Die Vollständigkeit von U4/C.5.** Auch eine beantwortete U4 ist nicht **beweisbar** vollständig: es gibt kein Parallelfenster, also keinen Lauf, in dem sich ein übersehener Auslieferungsweg zeigen könnte. Bleibt einer unbekannt, bleibt beim Freeze ein Schreibweg offen, den niemand gestoppt hat — **und der Verlust ist stumm** | niemand | nichts zusätzlich; es **verschärft Cut 27** | im Cutover-Protokoll zu **benennen**, nicht zu schließen |
| **R2** | **E6 bleibt eine Schätzung.** Der Alt-Token liegt im `localStorage`, es gibt **keine Tabelle** und damit keine Abfrage; ein Gerät, das bei der Begehung nicht anwesend ist, behält ihn unbemerkt | niemand | **Cut 30** bemisst danach den **Umfang** des SW-Handgriffs, nicht seine Vollständigkeit | — |
| **R3** | **Das `lagerbuch`-Import-Skript ist nicht im Repo** (Randbedingung 9). Fünf Ableitungen dieser Spec bleiben deshalb ohne Vorbild: Schnappschussform, Transaktion, Zählzeile, Aufrufform, Paritätsausgabe. Kein Bau und keine Person beantwortet das, solange das Skript nicht auftaucht | niemand | nichts — jede der fünf Zeilen ist **eigenständig belegt** | ⚠️ **wer das Skript findet, prüft diese fünf Zeilen gegen es** |
| **R4** | **Der Restposten aus W2.** Zwischen Umschwenk und erstem Zugangscode steht eine anonym erreichbare Ausleihfläche **ohne einen einzigen einlösbaren Code**; das ist nicht behebbar, weil `erstelleCode` eine Anmeldung **auf dem radio-Host** verlangt und dieser Host bis zum Umschwenk den Alt-Kiosk bedient | niemand | **zu begrenzen** in Cut 31 — erster Code unmittelbar nach Health-grün, **vor** der Freigabe an die Nutzer, durch **E8** | die Reihenfolge ist die Begrenzung |
| **R5** | **U7 nach dem Volume-Löschen.** Wird Abfrage A9 in Cut 5 bzw. Cut 33 ausgelassen, ist die Frage nach **Cut 36** für immer offen, und die Audit-Spalten der Alt-Daten sind nicht mehr einzuordnen | niemand — die Datenquelle ist dann fort | — | ⛔ die Frist ist **Cut 36**, und sie ist hart |
| **R6** | **L2s Versionsbindung.** Gemessen ist better-sqlite3 **13.0.2** und drizzle-orm **0.45.2**; ob eine künftige Fassung die Meldung verpackt, ist heute nicht ablesbar | niemand | nichts | der Schutz ist, dass **Bau 15** dann **laut** scheitert und nicht still |
| **R7** | **N1s Grund.** Die Entscheidung „kein `immutable=1` im Fenster" steht; ihre Begründung ist als **Messung** formuliert und ist keine — zwei der drei Wege schließen ihr Handle nachweislich (`src/core/bootstrap.ts:99-105`, `src/core/health/index.ts:13-15`), der dritte ist **ungebaut** | Bau, aber erst nach dem Bau | nichts; die **konservative** Wahl trägt ohne den Beleg | ⚠️ mit dem Bau **nachzuziehen**: hält ein Boot-Haken die Datei offen, arbeitet §4.5 Schritt 4 Handgriff 3 an einer **geöffneten** Datei |

---

## Was ohne Antwort NICHT gebaut werden darf

Sieben Stellen. **Überall sonst gilt die Regel des Cutover-Leitplans** — Text heute, Wert später.
Hier nicht, und zwar je aus einem benannten Grund: Weiterbauen unter Annahme wäre **teurer** als
Warten, weil der Fehler entweder **grün** ist oder erst im Fenster auffällt, wo es keine zweite
Gelegenheit gibt.

**1. Die fünf Paritätssichten und die vier Mapper (Bau 5–16) ohne ⬜ L1 und ⬜ L3.**
Eine geratene Spaltenliste macht die Parität für die fehlende Spalte **blind, und sie meldet grün**.
Der einzige Riegel dagegen ist der Vollständigkeitstest in Bau 8 — und der prüft gegen dieselbe
geratene Liste. Der Preis des Wartens ist die Zeit bis zum Spec-1-Bau, die ohnehin vergeht; der
Preis des Ratens ist ein Import, dessen Grün nichts bedeutet.

**2. Der Freeze (Cut 27, §C Schritt 1) ohne ⛔ U4 / C.5.**
Der **Text** ist heute schreibbar: die Stopp-Tabelle wird angelegt, Zeile 1 und 2 ausgeschrieben,
Zeile 3 als benannte Lücke. **Ausgeführt** wird er nicht — ein unbekannter Auslieferungsweg ist ein
**nicht gestoppter Schreibweg**, und was danach in die Alt-Anwendung geschrieben wird, taucht im
Snapshot nicht auf und fehlt im Ziel, ohne dass eine Zählung darüber stolpert.

**3. Der Umschwenk (Cut 29) und der Rückweg (Cut 31) ohne U4 / C.5 und ohne §4.2 Nr. 13.**
Der erste und nicht tauschbare Handgriff heißt „Alt-Router zuerst weg" und hat ohne diese Auskunft
**kein ausführbares Ziel**: in **beiden** eingecheckten Alt-Compose-Dateien kommt `traefik` **null
Mal** vor, beide veröffentlichen nur `ports:`. Und was vor dem Fenster nicht **wörtlich**
protokolliert wurde, hat der Rückweg um 22 Uhr nicht zurückzustellen — die Rekonstruktion einer
fremden Proxy-Konfiguration unter Zeitdruck ist genau das, was Nr. 13 verhindern soll.

**4. Die Zweigwahl in §F (Cut 31) ohne ⛔ C.3 / E5.**
Beide Zweige sind heute schreibbar und werden geschrieben; **die Wahl** ist es nicht. Im Zweig „ja"
ist der Umschwenk **abzubrechen**, wenn Handeingabe-Ausweichweg und ausstellende Person nicht
abgedeckt sind — eine Abbruchbedingung entdeckt man nicht um 21 Uhr, man bringt sie mit.

**5. §C Schritt 8 (Cut 28/29) ohne ⬜ L13 und ⬜ L14.**
Ohne Containername und Loopback-Port ist der Schritt **nicht ausführbar**, und das ist der harmlose
Teil. Der scharfe: der Ausweichweg zu L14 — den Schritt-7-Stack für die Dauer von Schritt 8 stoppen
— betrifft **sechs andere Module**, und damit ist der Umschwenk kein reiner `radio`-Vorgang mehr.
Das ist eine Frage der **Fensterplanung**, nicht eine Entscheidung **im** Fenster.

**6. Handgriff 3 in §C Schritt 4 mit der Kennung aus dem Image statt aus dem Prozess (⬜ N3).**
Die Erwartung „`radio.db` trägt dieselbe numerische Kennung wie die übrigen Modul-Datenbanken" ist
mit dem Image-Wert auf einem Standardhost **zwangsläufig rot**: `adduser --system --uid 1001 nextjs`
setzt kein `-G nodejs` (`Dockerfile:42-43`), `USER nextjs` läuft also als `1001:65533(nogroup)`
(`compose.yaml:47-61` führt die Messung wörtlich), während der Service als
`user: ${SUITE_USER:-1001:1001}` startet (`compose.yaml:62`) und ein arm64-Host laut
`.env.example:210` `SUITE_USER=1001:1000` setzen soll. Der daneben vorgeschriebene Handgriff
(„Handgriff 3 mit dem `chown` nachholen") **reproduziert** die Abweichung — ein rotes Signal ohne
Fehler mit einer nicht konvergierenden Reparatur, mitten im Fenster.

**7. Das Löschen der zwei Volumes (Cut 36) ohne ⬜ N8, ⬜ N9 und die acht Abbau-Sperren.**
Es ist die **einzige unumkehrbare Handlung** des ganzen Wegs. **U7** ist danach nie mehr
beantwortbar (R5); ohne Traefik-Zugriffsprotokoll (**N9**) ist die Abbaubedingung des Redirects
**nie erfüllbar** und der Redirect lebt für immer; und ohne **N8** ist nicht belegt, dass die zwei
Archivdateien **nicht** auf dem Suite-Server liegen, den derselbe Vorgang aufräumt.

---

## Was ohne Antwort sehr wohl gebaut werden kann

**Die Regel zuerst, damit diese Seite niemanden anhält:**

> **Der Runbook-TEXT ist für alle einundvierzig Aufgaben heute schreibbar. Was wartet, ist die
> Ablesung, die das leere Feld füllt — nicht der Satz, der es anlegt.**

Das ist die Hausform und kein Kompromiss: eine Zeile mit `⬜ L13` ist prüfbar, eine Zeile mit einer
geratenen Portnummer ist es nicht. Der Beleg dafür steht in `docs/runbooks/files-cutover.md:39-58` —
eine Eingabentabelle mit zehn leeren Feldern und dem Satz darunter: „**Betriebswerte werden nicht
erfunden.** … Ein Platzhalter aus einer anderen Maschine ist **kein Wert**" (`:57-58`, im Repo
nachgeschlagen).

⚠️ **Die zwei Belegstellen, die der Cutover-Leitplan an dieser Stelle nennt, tragen nicht:**
`files-cutover.md:75-78` ist die Bestandsprobe §A (eine Tabelle mit `sqlite3`-Zählungen),
`lagerbuch-cutover.md:197` steht im Abschnitt über den stillen 404 bei falscher Hostzuordnung.
Beide sind hier durch `files-cutover.md:39-58` ersetzt.

**Namentlich heute ausführbar:**

* **Bau 1–4 — die gesamte Quellseite des Importers.** Bau 1 die Quell-DDL als Fixture samt Riegel
  auf ihre Spaltenreihenfolge · Bau 2 die Rohzeilen und der Riegel gegen wiederverwendete
  Zeitwerte · Bau 3 die Zeitachse und die zwei Faltungsriegel · Bau 4 `lieseQuelle` mit fünf
  namentlichen `SELECT`s. Sie brauchen **weder Spec 1 noch eine Betreiberantwort** und schließen mit
  einem grünen `rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run` ab, ohne dass eine
  einzige Datei unter `src/app/m/radio/` existiert. Vorbedingung ist allein die Arbeitskopie
  `radio-admin@265abd5` — **gemessen vorhanden**.
* **Cut 1, 2, 4, 5, 6, 7, 8 — die sieben mit „Wartet auf: nichts".** Cut 1 das Runbook anlegen ·
  Cut 2 die sechs Redirect-Labels mit Regressionstest (`2026-08-18-plan4-radio-cutover.md:349`: „ohne Spec 1
  ausführbar") · Cut 4 §L, der Leseapparat · Cut 5 §V, die dreizehn Vorabfragen A1–A13 · Cut 6–8 die
  Feldstichproben §S.1 bis §S.4. ⚠️ **Cut 2 ist zusätzlich terminlich vorgezogen**: die Labels
  müssen in einem **früheren** Rollout auf dem Server liegen (⬜ N2).
* **Cut 32–41 — der gesamte Abbau-Planteil.** Sein Kopf stellt es fest: „Er ist **heute vollständig
  abarbeitbar** — mit einer Ausnahme, die je Aufgabe benannt ist" (`2026-08-18-plan5-radio-abbau.md:35-36`). Die
  Handgriffe laufen frühestens vierzehn Tage nach dem Umschwenk, „in einer Sitzung, in der niemand
  mehr den Kontext dieses Abends hat. **Genau deshalb wird jeder Befehl ausgeschrieben und nicht
  beschrieben**".
* **Cut 3 und Cut 26 — die `.env` bis auf eine Zeile.** An ⛔ C.6/B4 hängt **genau eine**
  zusätzliche `.env`-Zeile; alles andere (Env-Block, Folgen-Tabelle, §B.1 Abbruch gegen still, §B.2
  Rollback als **leere** Zeile, §B.3 Redirect) entsteht heute, mit **drei** ⏸-Zeilen als benannten
  Lücken.
* **Cut 20 in beiden Fassungen** — ⬜ L9 ist eine **Zweigwahl, keine Blockade**
  (`2026-08-18-plan3-radio-generalprobe.md:91`); Stufe 3 wird in beiden Fassungen beschrieben.
* **Cut 31 in beiden Zweigen** und **Cut 27 mit den Zeilen 1 und 2 der Stopp-Tabelle** — Zeile 3
  bleibt die benannte Lücke von U4.
* **Bau 16 und 17 mit der vorläufigen Abschlusszeile** — `Radio-Import OK — <n> Zeilen, Paritaet
  gruen.`, **byteweise so**, ohne Umlaut und **im selben Feld als vorläufig beschriftet**. Eine
  vorläufige Zeichenkette, die gesetzt aussieht, ist selbst eine Falle der L6-Klasse.
* **Cut 41 — der datierte Nachtrag in Spec 2.** Er braucht **keine einzige Ablesung**: er zieht die
  Zahlen der Spec auf die des Runbooks nach (L5-Verkleinerung NS8, der dritte Unterschied des
  Fenster-Prüfcontainers NS11, Anhang A-3 NS12, der Sperrenkasten **mit P6** NS13). **Die vier Funde
  des nächsten Abschnitts gehören in denselben Nachtrag.**

---

## Die vier blockierenden Funde der Re-Kritik

**Sie betreffen die SPEC, nicht die Pläne.** Keiner von ihnen wartet auf eine Ablesung, alle vier
sind heute schreibbar, und alle vier sind **vor dem Cutover-Abend** in Spec 2 nachzuziehen —
zweckmäßig als Erweiterung von **Cut 41**. Jeder ist eine Stelle, an der die Spec sich selbst
widerspricht und dabei **grün** aussieht oder **rot ohne Fehler** wird.

### RK-1 — Beide Prüfcontainer messen den Portal-Login statt `radio`

**Ort:** Spec 2 §3.2.2 (Z. 2579), §3.2.6 (Z. 2769–2782) und §4.5 Schritt 8 (Z. 3702, 3721–3727).

**Befund.** Beide Prüfcontainer setzen `SUITE_HOST_RADIO=localhost`, und beide Prüfsätze fahren
danach `curl -H 'Host: radio.iuk-ue.de'` — mit diesem Wert beansprucht `radio` genau den Host
`localhost`, der gesendete Kopf trifft **kein Modul** und fällt auf das Portal zurück
(`src/core/registry.ts:225-232` vergleicht exakt gegen `prodHostsFor`; `src/core/routing.ts:69-73`
fällt auf `getModule("portal")` und dann auf `action: "login"`). Die sechs bzw. sieben
kopfgestützten Zeilen messen damit den Portal-Login, und das Teuerste daran ist nicht das Rot: **V2**
(`/admin` → 3xx + `location: …/login`) und **V6** sind **grün, ohne geprüft worden zu sein**, weil
das Portal genau diese Antwort liefert.

**Empfehlung.** In **beiden** Prüfcontainern `SUITE_HOST_RADIO=localhost,radio.iuk-ue.de` setzen —
`envHostsFor` splittet auf Komma (`src/core/hosts.ts:39-46`), und `validateHostConfig` hat gegen
beide Werte nichts (`hosts.ts:65-99`); alternativ Stufe 1 und Stufe 3 als **zwei** `docker run` mit
je einem Wert fahren. Zusätzlich in §3.2.6 und §4.5 Schritt 8 die Zeile
`curl -s -H "$H" "$B/" | grep -c '<L10-Zeichenkette>'` aufnehmen, damit der Portal-Fallback nicht
still bleibt. Die Spec kennt die Mechanik bereits — §3.2.4 zitiert `registry.ts:225-232` wörtlich,
und §3.2.5 setzt in der Eskalation folgerichtig `SUITE_HOST_RADIO: radio.iuk-ue.de`.

### RK-2 — Der Nachtrag in §4.9 ist doppelt nicht ausführbar

**Ort:** Spec 2 §4.9, der Nachtrag (Z. 4150–4156).

**Befund.** Der einzige ausgeschriebene Weg, in der Rückweg-Stunde die nach dem Umschwenk
geschriebenen Leihen zu retten, liest `sqlite3 -readonly "$DATA_DIR/radio.db"` **auf dem Host** —
die Form, die dieselbe Spec an vier Stellen verbietet (§1.8 Z. 1516-1519, §4.5 Schritt 4 Z. 3504,
Schritt 5 Z. 3587, §4.6 Nr. 4 Z. 3813) und die es dort nicht geben kann, weil `DATA_DIR=/data` ein
Wert **im Container** ist (`compose.yaml:79`, `:99`, `:221-223`: benanntes Volume `suite_data` ohne
vereinbarten Host-Pfad). Zweitens filtert das SQL gegen `<umschwenk_epoch_sekunden>`, einen Wert,
den **kein Schritt erzeugt**: `date -u` steht in der ganzen Spec genau einmal (§4.5 Schritt 1,
Z. 3404, für `<freeze_iso>`), und §4.5 Schritt 9 protokolliert keinen Zeitpunkt.

**Empfehlung.** Den Nachtrag auf die §2.2.2-Containerform gegen `$VOL_SUITE` umschreiben, wörtlich
wie Abfrage Z (Mount **ohne** `:ro`, `sqlite3 -readonly`, kein `immutable=1`). Und in §4.5 Schritt 9
nach `docker compose up -d` eine Zeile aufnehmen, die `<umschwenk_iso>` **und**
`<umschwenk_epoch_sekunden>` ins Protokoll schreibt — sie ist zugleich der **Nullpunkt der
Ein-Stunden-Frist** und das Filterargument des Nachtrags. **Cut 29** sagt beide Werte bereits als
Lieferung zu; hier zieht die Spec dem Plan nach, nicht umgekehrt.

### RK-3 — `--profile full-app` fehlt im Rückweg

**Ort:** Spec 2 §4.9 Handgriff 3b (Z. 4087) gegen §4.5 Schritt 1 (Z. 3406–3411, 3416).

**Befund.** Der Freeze stoppt den Kiosk mit `--profile full-app` und **begründet das Profil eigens**
(`backend` steht hinter `profiles: ["full-app"]`; ob eine Compose-Version es beim namentlichen
Aufruf selbst aktiviert, ist versionsabhängig — „ohne das Profil kann der Stopp ein No-op sein, und
ein No-op sieht wie ein Erfolg aus"), der Rückweg startet ihn **ohne**. Das Argument ist
richtungsunabhängig: der Rollback läuft ohne Fehlermeldung durch, startet den Kiosk nicht, und weil
der Alt-Kiosk nach §4.9 der **einzige** Rückfall für `radio.iuk-ue.de` ist, bleibt die Domain nach
dem „Rollback" tot — innerhalb der Stunde, in der es keine zweite Gelegenheit gibt.

**Empfehlung.** `--profile full-app` in 3b aufnehmen, **zeichengleich** zum Stopp-Befehl aus
Schritt 1, und die Regel ausschreiben, die §4.5 Schritt 1 ohnehin schon aufstellt: der Stopp-Befehl
aus Schritt 1 ist die **Vorlage** des Start-Befehls in §4.9 — Wort für Wort, nur `stop` gegen
`start` getauscht. **Cut 31** führt die Korrektur bereits („die drei Rückweg-Handgriffe **mit**
`--profile full-app`", NS12); die Spec ist die Stelle, die nachzieht. ⚠️ **Direkt daneben liegt der
zweite Teil derselben Lücke:** der Rückweg hat **keine Rücklesung** — kein `ps`, kein `curl` —,
während der Freeze eine hat und sie eigens begründet. Ein `start` ohne Profil ist ein No-op, und
ohne Rücklesung fällt es erst auf, wenn jemand anruft.

### RK-4 — Erfüllungspunkt 9 klammert nur zwölf von dreizehn Posten

**Ort:** Spec 2, Erfüllungspunkte Punkt 9 (Z. 4810) gegen §4.2 (Posten 13, Z. 3175–3191).
⚠️ **Zwei Kritikdurchgänge haben unabhängig dieselbe Stelle gefunden**, einmal als „erheblich",
einmal als „blockierend"; hier gilt die schärfere Einstufung.

**Befund.** Die Abschlussliste hakt „§4.2 Nr. 1–**12** vollständig" ab, §4.2 führt **dreizehn**
Posten — und der dreizehnte ist die **wörtlich** protokollierte heutige Router-Konfiguration
**beider** Hosts samt Rückstell-Befehl, mit eigenem ⛔ („Fehlt die Zeile, wird das Fenster nicht
eröffnet") und ausweislich des Spec-Kopfes (Z. 51-53) das Ergebnis eines blockierenden Funds des
vorigen Durchgangs. Kein anderer Erfüllungspunkt fängt ihn auf — Punkt 4 deckt L13/L14, Punkt 10
deckt U4/C.5 (verwandte Wurzel, anderer Handgriff), Punkt 19 prüft die **Ausführung** von Schritt 9
und nicht seine Vorbedingung —, so dass sich die Abschlussliste **vollständig abhaken** lässt,
während die eine ⛔-Vorbedingung ungelesen ist, die Schritt 9 Nr. 1 überhaupt ausführbar macht.

**Empfehlung.** Punkt 9 auf „§4.2 Nr. 1–**13** vollständig" ändern, Nr. 13 in der
„insbesondere"-Aufzählung **namentlich** nennen („heutige Router-Regel beider Hosts wörtlich
protokolliert, samt Rückstell-Befehl") und mit demselben ⛔ versehen wie Punkt 10 — beide hängen an
derselben Auskunft. Zusätzlich in §4.2 Nr. 13 einen Rückverweis auf Erfüllungspunkt 9 setzen, damit
die Kopplung **in beide Richtungen** steht.

### Was aus derselben Re-Kritik hier NICHT steht

Die als *erheblich* und *klein* eingestuften Funde sind nicht Gegenstand dieser Seite. **Drei davon
berühren Nummern dieser Tabellen und gehören in denselben Nachtrag (Cut 41):**

* **Abfrage A liest auf dem Host** (`sqlite3 -readonly "$DATA_DIR/radio.db"`, §5.2.2 Z. 4295 und
  4298) — **dreimal** gemeldet, in drei Durchgängen. Abfrage A ist eine der acht Abbau-Sperren; R
  und Z zwanzig Zeilen weiter machen es richtig.
* **„Z alle drei `0`"** (Erfüllungspunkt 17, Z. 4828-4829) gegen „**alle zehn** Zahlen MÜSSEN 0
  sein" (§5.2.2 Z. 4412) — **zweimal** gemeldet; dieselbe Zahl steht auch in Anhang A-5 falsch.
* **⬜ L5 war zu groß gefasst** — die Feldnamen sind heute lesbar; die Verkleinerung auf den
  **Sollwert von `revision`** ist in dieser Tabelle bereits vollzogen (NS8) und in der Spec
  nachzuziehen.

---

## Abgleich — steht jede Nummer hier, und hat jede Zeile ein Ziel?

**Hinrichtung (jede Nummer der Pläne steht in einer Tabelle):** L1–L14 = 14 · N1–N10 = 10 ·
E1–E8 = 8 · U4, U4a, U4b, U6, U7, U9 = 6 · C.1, C.2, C.3, C.4, C.5, C.6, C.7 = 7. **U8** ist
ausdrücklich **keine** Sperre und steht mit Begründung außerhalb der Tabellen (NS14). Die vier
Doppelmarken sind zusammengeführt und in der Nummernspalte vollständig geführt: **E4 / C.2** ·
**E5 / C.3** · **U4 / C.5** · **C.6 / B4**.

**Rückrichtung (jede Zeile hat ein Ziel in mindestens einem Plan):** die Behauptung gilt für die
Tabellen **(a) bis (c)**. Die Zeilen der Tabelle **(d)** sind davon **bauartbedingt ausgenommen** —
ein Risiko hat kein Ziel, sondern eine Fundstelle; ebenso **U8**, die außerhalb der Tabellen als
Zulieferung geführt wird. Für (a) bis (c) ist die Rückrichtung erfüllt bis auf **zwei benannte
Ausnahmen**, die deshalb hier stehen und nicht stillschweigend passen:

1. **C.1, C.4, C.7, U9** — sie haben **keinen** blockierten Cutover-Schritt, und das steht in der
   Tabelle als Wert und nicht als Leerfeld. C.1 trägt stattdessen eine **Sachfrist** (der Druck des
   ersten Codesatzes), C.4 sieht nur Cut 20, C.7 trägt eine Begründung und keine Handlung, U9 ist
   eine Notiz an Cut 2.
2. **⬜ L13** steht hier unter **(b) Der Server**, im Cutover-Leitplan dagegen unter „Der Bau" — die
   Einteilung dieser Seite folgt der Frage „wer antwortet", und den Containernamen liefert
   `docker compose ps`. ⚠️ **Die zweite Hälfte von L13 ist überhaupt keine Ablesung**: der
   veröffentlichte Loopback-Port des Fenster-Prüfcontainers wird **gewählt**, nicht abgelesen; die
   Generalprobe fährt `-p 127.0.0.1:3999:3000`.

**Eine Zeile steht doppelt, und zwar mit Absicht:** **⬜ L6** blockiert **Bau 16 · 17** (dort
entsteht und wird sie abgelesen) **und Cut 14** (dort wird auf sie gegreppt). Die zwei Leitpläne
führen je nur ihre eigene Hälfte; hier stehen beide in einer Zeile, weil sonst der Übergabepunkt
zwischen den zwei Plänen unsichtbar bliebe.
