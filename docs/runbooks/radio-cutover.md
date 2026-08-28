# Runbook — Radio-Cutover (`radio-admin` + `radio-inventar` → iuk-suite)

Ziel: Die Domains `radio.iuk-ue.de` **und** `radio-admin.iuk-ue.de` im selben Fenster von den zwei
Alt-Anwendungen auf die Suite umschwenken, mit Import der Alt-Daten in `radio.db`. Rückweg ist
„Router zurück" plus der Neustart von **drei** Prozessen — und er kostet Daten, sobald einmal
fachlich geschrieben wurde.

Grundlage: `docs/superpowers/specs/2026-08-18-radio-cutover-design.md` (Spec 2) und
`docs/superpowers/specs/2026-08-17-radio-modul-design.md` (Spec 1). Die Paragraphen dieses Runbooks
verweisen dorthin — wer eine Begründung sucht, findet sie an der genannten Stelle.

⚠️ **Zur Zitierweise:** ein `§` ohne Präfix meint einen Paragraphen **dieses Runbooks**. Jeder
Verweis in eine Spec trägt ihren Namen: `Spec 1 §7.1.3`, `Spec 2 §4.5`. Die Freeze-SHAs der zwei
Alt-Repos, gegen die jede `datei:zeile`-Angabe über die Alt-Anwendungen gelesen wird:
`radio-admin` = **`265abd5`**, `radio-inventar` = **`f883ec4`**. Beide Repos werden **archiviert,
nicht gelöscht**.

⚠️ **Zu den Abschnittsmarken:** die Reihenfolge ist verbindlich (Nahtstelle NS2,
`docs/superpowers/plans/2026-08-18-radio-cutover-leitplan.md:396-407`) und lautet **vierundzwanzig plangebundene**
`##`-Überschriften: der ⚠️-Kopfabschnitt · `§0` · `§L` · `§V` · `§S` · `§Z` · `§P` · `§A` bis `§G` ·
`§5.1` bis `§5.9` · `§H`. **`§S` sind die Feldstichproben, nicht „Standby und Abbau"** — Standby und
Abbau heißen `§5.1`–`§5.9`. **`§P.0`–`§P.14` ist die Generalprobe** (früher `§G0`–`§G14`); `§G` allein
ist der Rückweg. Wer in einer älteren Fassung eines Plans `§G7` liest, meint `§P.7`.
⚠️ **Die Datei selbst führt 26**: `grep -cE '^## ' docs/runbooks/radio-cutover.md` zählt
zusätzlich `§I` (der datierte Nachtrag in Spec 2, den der Leitplan nicht kennt — er steht zwischen
`§5.9` und `§H`) und den Schlussabschnitt „Was dieses Runbook NICHT beantwortet". **24 ist die Zahl
des Leitplans, 26 der Sollwert dieser Datei.** Wer 24 misst, hat einen der beiden verloren.

---

## ⚠️ Was dieses Runbook ist — und was diesen Abend kippen kann

### Was dieses Runbook ist, und was es nicht ist

**Es fährt den Cutover. Es baut nichts.** Jeder Befehl darin läuft gegen eine Datenbank, einen
Container oder einen Router — keiner ändert Quelltext. Wer beim Lesen den Eindruck bekommt, hier sei
noch etwas zu entwickeln, liest den falschen Abschnitt: der Bauweg ist abgeschlossen (siehe „Der
Stand des Baus"), und die einzige Datei dieses Repos, die im Fenster angefasst wird, ist die
Server-`.env` (§B).

**Es ist auch keine Begründungssammlung.** Warum ein Schritt so und nicht anders läuft, steht in
Spec 1 und Spec 2. Hier steht, **was zu tippen ist, was herauskommen muss, und was zu tun ist, wenn
etwas anderes herauskommt.**

⛔ **Jeder Befehl ist ausgeschrieben und nicht beschrieben.** Der Abbau (§5.1–§5.9) läuft frühestens
vierzehn Tage nach dem Umschwenk, in einer Sitzung, in der niemand mehr den Kontext dieses Abends
hat. Ein „dann den Import starten" ist an diesem Abend kein Satz, sondern eine Lücke.

⚠️ **`rtk`-Präfix nur im Repo.** Befehle, die im Arbeitsverzeichnis dieses Repos laufen (`grep`,
`pnpm`, `git`), tragen `rtk`. **Server-Befehle — `docker`, `sqlite3`, `curl`, `traefik` — laufen
ohne `rtk`**: dort gibt es das Werkzeug nicht.

### Der Stand des Baus (2026-08-27)

* **Das Suite-Modul `radio` ist fertig gebaut.** Fünf Planteile, 256 signierte Commits, **PR #80**
  offen gegen `main`. Alle Tore grün: 512/512 Testdateien, 9122/9122 Tests, Playwright 369 passed,
  `pnpm build` und `pnpm typecheck` fehlerfrei.
* **20 Flächen** mit Riegel (5 Route Handler + 10 Verwaltungsseiten + 5 Ausleihflächen),
  `src/app/m/radio/riegel.test.ts:145,156,166`. Der Importer `scripts/import/radio.ts` ist gebaut und
  von Hand abgenommen (`docs/superpowers/berichte/2026-08-21-radio-import-abnahme.md`).
* ⛔ **Die sechs `/v1`-Routen im Alt-Repo stehen NOCH** (`radio-admin@265abd5
  server/src/routes/loanApi.ts:126-201`). Ihr Ersatz im Modul sind **Server Actions und Lesepfade**,
  keine HTTP-API — es gibt nach dem Cutover **keinen** token-authentifizierten Zugang mehr, gegen den
  ein fremder Prozess sprechen könnte. Ihr Fall gehört in dieses Fenster, nicht davor. Das ist die
  Wurzel von **U4/C.5** (unten).
* ⚠️ **Der Docker-Healthcheck der Suite prüft `/api/health/portal`, nicht `/api/health/radio`**
  (`compose.yaml:141`). Ein rotes `radio` macht den Container **nicht** unhealthy. `/api/health/radio`
  ist deshalb ein **manueller** Prüfschritt dieses Runbooks (§Z.6).

### Fünf Dinge, die diesen Cutover von den vorigen unterscheiden

**1. Es gibt kein Parallelfenster.** Der Alt-Kiosk (`radio-inventar`) läuft **schon heute** unter
`radio.iuk-ue.de`. Alt und Neu können denselben Host nicht gleichzeitig bedienen — „nie zwei Router
gleichzeitig auf derselben Domain" (`CLAUDE.md`, Abschnitt Cutover) ist hier keine Vorsichtsregel,
sondern eine **physische Grenze**. Daraus folgt: die Verifikation gegen einen **ephemeren Container
ohne Traefik-Labels** ist nicht Kür, sondern der **einzige** Weg, vor dem Umschwenk überhaupt etwas
zu prüfen (§C Schritt 8).

**2. Beide Domains ziehen im SELBEN Fenster um.** Der Kiosk spricht nie mit der Oberfläche von
`radio-admin`, sondern über **sechs `/v1`-Routen**. Schwenkt die Verwaltung zuerst, verliert der
Alt-Kiosk seine Datenquelle. Deshalb ist der Umschwenk **ein** Schritt und nicht zwei (§C Schritt 9).

**3. Der Faktor-1000-Fehler ist paritätsgrün UND löscht die Leihhistorie.** Quelle ist
epoch-**Millisekunden**, Ziel ist Drizzle `mode: "timestamp"` = Unix-**Sekunden**. Die Parität
vergleicht Zeilen-Hashes aus **derselben** Mapping-Funktion auf **beiden** Armen
(`scripts/import/parity.ts:43-56`) — ein konsistenter Fehler hasht beidseitig gleich. Sekunden statt
Millisekunden legt jedes `returned_at` ins Jahr **1970**, und der Retention-Purge löscht dann die
komplette abgeschlossene Leihhistorie. **Der Import-Test bleibt grün.** Die zwei Abfragen, an denen
der Fehler **nicht** grün bleibt, heißen **R** und **Z** (§C Schritt 5 d); die Stichprobe davor ist
§S.3.

**4. Der Service Worker des Alt-Kiosk überlebt den Umschwenk**, weil der Origin zeichengleich
bleibt: Root-Scope, Cache-Name `radio-inventar-v1`, `skipWaiting()` + `clients.claim()`. *Kein Gate
sieht davon etwas:* HTTP 200 mit veraltetem Inhalt. Der Abräum-Worker gehört deshalb in den
**früheren** Deploy (§A Nr. 2), nicht in dieses Fenster (§E).

**5. Der wichtigste Einzelpunkt der Abnahme ist ein 404, kein 200 — und daneben steht ein 3xx, das
kein 404 sein darf.** Ein anonymer `GET` auf `/admin/geraete/export` (**Route Handler**) muss **404**
liefern, nie 403 und nie einen Login-Umweg; ein anonymer `GET` auf `/admin` (**Seite**) muss eine
**Weiterleitung in den Login** liefern, und ein 404 dort hieße: die Seite ruft den Riegel gar nicht.
**Wer beiden denselben Sollwert gibt, hat eine der zwei Bauformen kaputtgeprüft** (§D Nr. 5).

### Vier stille Fehler, die den Abend kippen — sie melden sich nicht von selbst

**NT8 — die Meldung, die wie ein Importfehler aussieht und keiner ist.** `sqlite3 -readonly`
**scheitert** gegen eine frisch importierte `radio.db`: sie liegt im **WAL-Modus** und trägt noch
**keine `-shm`**, und ein Readonly-Handle darf das Shared-Memory-File nicht anlegen. Die Meldung
lautet `Parse error … unable to open database file (14)` und steht unmittelbar nach dem Import auf
dem Bildschirm — sie sieht aus wie ein misslungener Import und ist keiner. **Gemessen, nicht
vermutet** (`docs/superpowers/berichte/2026-08-21-radio-import-abnahme.md:78-179`); auch einzeilig,
auch mit absolutem Pfad, auch über `file:?mode=ro`. ⛔ **Deshalb wird die Ziel-Datenbank in diesem
Runbook überall OHNE `-readonly` gelesen** (§L.3) — die Datei gehört uns, das Anlegen der `-shm` ist
harmlos. Für die **Quelle** gilt das Gegenteil: dort bleibt `-readonly` Pflicht, solange
`pragma journal_mode` dort `delete` ergibt — **und diese Ablesung ist datiert und wird am
Freeze-Abend neu gemessen** (§L.1).

**NT9 — die Parität ist gegen einen veralteten Schnappschuss strukturell blind.** Beide Arme von
`checkRadioParitaet` stammen aus **demselben**, einmal gelesenen Quellobjekt. Ein Schnappschuss, der
zwei Stunden alt, aber in sich konsistent ist, ergibt plausible Zahlen, einen sauberen Import und
**grüne** Parität — und ist trotzdem nicht mehr die laufende Alt-Anwendung. ⛔ **Die einzige
Verteidigung ist eine Vorabzählung aus der LAUFENDEN Alt-Anwendung, gegen die der Betreiber die
Zählzeile des Importers stellt** — sie steht in **§V.0** und ist der Grund, warum §V existiert. Wer
§V für Buchhaltung hält und überspringt, hat diesen Fehler nicht mehr fangbar gemacht.

**NT10 — `DATA_DIR` vergessen, und die Parität bleibt grün.** Ohne gesetztes `DATA_DIR` importiert
`scripts/import/radio.ts` nach `./.data/radio.db` — eine Datei, die niemand meint. Die Parität ist
grün, weil sie Quelle gegen **diese** Datei prüft. `openModuleDatabase` legt Verzeichnis und Datei
bei Bedarf **an** (`src/core/db/index.ts:12-22`), und jede Zählung gegen die richtige Datei antwortet
dann `0` — **nicht** „Datei fehlt". ⛔ **Deshalb steht vor jeder Zählung eine Existenz- und
Größenprobe der Zieldatei** (§L.2, §Z.0). **Eine `0` ist zuerst ein Pfad- oder Volume-Fehler, erst
danach ein Datenbefund.**

**RK-A3 — der Rückweg, der Erfolg meldet und die Domain tot lässt.** Der Freeze stoppt den Alt-Kiosk
mit `docker compose -f radio-inventar/docker-compose.yml --profile full-app stop backend`, und das
Profil steht dort mit Begründung: `backend` liegt hinter `profiles: ["full-app"]`, und ob eine
Compose-Version das Profil beim namentlichen Aufruf selbst aktiviert, ist versionsabhängig — **ohne
das Profil kann der Aufruf ein No-op sein, und ein No-op sieht wie ein Erfolg aus.** ⛔ **Die Regel
gilt richtungsunabhängig: der Stopp-Befehl aus §C Schritt 1 ist die Vorlage des Start-Befehls in §G —
Wort für Wort, nur `stop` gegen `start` getauscht, `--profile full-app` eingeschlossen.** Direkt
daneben liegt die zweite Hälfte derselben Lücke (RK-A5): **der Rückweg braucht eine Rücklesung** —
ein `--profile full-app ps` und ein `curl`, so wie der Freeze eine hat. Ohne sie fällt der No-op erst
auf, wenn `radio.iuk-ue.de` schon eine Stunde tot ist. *(In §G ist beides ausgeschrieben; Spec 2 §4.9
trägt es noch nicht — Nachtrag C41.)*

### ⛔ Die offene Sperre: U4 / C.5

**Auf welchem Host und über welchen Weg — Container, statische Auslieferung, Reverse-Proxy-Eintrag —
wird `radio.iuk-ue.de` heute ausgeliefert, und wo läuft das `radio-inventar`-Frontend produktiv?**

⚠️ **Kein Befehl beantwortet das.** `radio-admin` und `radio-inventar` liegen nicht in diesem Repo,
und beide eingecheckten Alt-Compose-Dateien führen `traefik` **null Mal**. Solange U4 offen ist:

* **§C Schritt 1 (Freeze) ist nicht ausführbar** — ein unbekannter Auslieferungsweg ist ein
  Schreibweg, den niemand gestoppt hat, und der Verlust ist stumm.
* **§C Schritt 9 (Umschwenk) hat kein Ziel** — es ist nicht bekannt, welche Regel umgestellt wird.
* **§G (Rückweg) 3c/3d ist nicht ausführbar** — es ist nicht bekannt, was wieder anzuschalten ist.
* **Die Abbauliste (§5.5) ist nicht vollständig** — es ist nicht bekannt, was abgebaut werden muss.

⛔ **Das Fenster wird nicht eröffnet, solange die Zeile U4 in §0 leer ist.** Nach dem Abbau ist die
Frage nur noch durch Ausprobieren zu klären, und das Ausprobieren heißt dann „was ist
kaputtgegangen?". ⚠️ Und auch eine **beantwortete** U4 ist nicht beweisbar vollständig (Risiko R1):
es gibt kein Parallelfenster, in dem sich ein übersehener Weg zeigen könnte.

---

## §0 — Eingaben: was nur der Betreiber oder der Server hergibt

**Vor dem Fenster ausfüllen.** Jede Zeile ist ein Wert, keine Frage — solange hier ein Feld leer ist,
beginnt das Fenster nicht. Die späteren Schritte verweisen auf diese Nummern.

⚠️ **Betriebswerte werden nicht erfunden.** Ein Platzhalter aus einer anderen Maschine ist kein Wert.
Wo unten schon etwas in der Spalte *Eingetragen* steht, ist es **aus dem Quelltext abgelesen** und
mit `datei:zeile` belegt — es ist keine Vermutung und muss am Abend nicht noch einmal besorgt werden.

| # | Wert | Eingetragen | Wer liest ab, und bis wann | Ohne ihn |
|---|---|---|---|---|
| E1 | **Gruppenname** für `SUITE_ADMIN_GROUP_RADIO`, exakt wie im `groups`-Claim | | **Betreiber**, fällig **vor §B** (Cut 26) — **nicht** vor der Generalprobe, die setzt frei erfundene Werte, und das ist richtig | Startabbruch der **ganzen Suite**; und ohne Startabbruch: stummes 404 für jede Verwaltungsseite |
| E1b | **Gruppenname** für `SUITE_UPDATER_GROUP_RADIO` (zweite Rechtestufe, Entscheidung C.6/B4 vom 2026-08-21) | | **Betreiber**, fällig **vor §B** (Cut 26) | Die Updater-Stufe ist geschlossen — ein **gültiger** Zustand, aber ein unbeabsichtigter. Leer heißt: niemand ist Updater |
| E2 | **Echter Volume-Name** von `radio-admin` (`docker volume ls \| grep -i radio-data`) | | **Betreiber am Server**, vor der **Generalprobe** (§P.2) und erneut im Fenster (§C Schritt 2) | §C Schritt 2 legt ein **neues, leeres** Volume an, und der Snapshot ist ein paar Kilobyte groß |
| E3 | **Echter Volume-Name und `POSTGRES_USER`** von `radio-inventar` | | **Betreiber am Server**, vor dem Fenster | `pg_dump` bricht mit `FATAL: role "radio" does not exist` ab — und der Dump ist der **einzige**, den dieses Volume je hatte |
| E4 | **Sitzungsdauer** `RADIO_AUSLEIH_SITZUNG_STUNDEN` (Vorschlag 12, C.2) | | **Betreiber**, vor §B (Cut 26) | Vorbelegung 12 gilt — aber die Neuigkeitennotiz behauptete dann eine unbestätigte Zahl als bestätigt |
| E5 | **Gedruckte Aufsteller: Anzahl, Ort, wer sie ersetzen kann** (C.3) — Begehung, kein `SELECT` | | **Betreiber**, **vor** dem Fenster (Begehung, nicht am Abend) | ⛔ die Zweigwahl in §F ist nicht treffbar |
| E6 | **Wie viele Geräte tragen den Alt-Token im `localStorage`** — Begehung, kein `SELECT`: der Token liegt im Browser, es gibt keine Tabelle | | **Betreiber**, vor dem Fenster; bleibt eine **Schätzung** (Risiko R2) | Der Umfang des Handgriffs aus §E ist unbekannt |
| E7 | **Traefik-Containername** | | **Betreiber am Server**, vor dem Fenster | §D Nr. 8 (Zugriffsprotokoll) und §A Nr. 13 (Labels ablesen) haben kein Ziel |
| E8 | **Wer ist am Cutover-Abend namentlich anwesend** und stellt den ersten Code aus | | **Betreiber**, bei der Terminplanung | §D Nr. 10 (Login-Rückweg, Handarbeit) und §F fallen aus — und §D Nr. 10 ist die einzige Prüfung, deren Fehlfall **vollständig stumm** ist |
| U4 | ⛔ **Wo läuft das `radio-inventar`-Frontend produktiv**, und über welchen Weg wird `radio.iuk-ue.de` heute ausgeliefert (Prozess, Container, statische Auslieferung, Reverse-Proxy-Eintrag; Host, Konfiguration) | | **Betreiber**, ⛔ **vor dem Fenster** — kein Befehl beantwortet sie | ⛔ **Freeze** (§C Schritt 1) · ⛔ **Umschwenk** (§C Schritt 9 Nr. 1) · ⛔ **Rückweg** (§G 3c/3d) · **Abbauliste** (§5.5) |
| U4a | **Wo setzt die Produktion `API_TOKEN`?** Pflichtwert mit `min(32)`, ohne Default, in der eingecheckten Compose-Datei **nicht** enthalten | | **Betreiber**, vor dem Fenster (einmal einholen) | §5.6 — hier nur mitgeführt, damit die Auskunft **einmal** eingeholt wird |
| U4b | **Gibt es auf Host-Ebene einen Cron, systemd-Timer oder Backup-Job** zu einem der Alt-Stacks? | | **Betreiber am Server**, vor dem Fenster | §5.7 |
| U6 | Werden die **zwei OIDC-Client-Registrierungen** in Pocket ID gelöscht oder aufbewahrt? | | **Betreiber**, vor §5.5 | §5.5 Posten 13 und §5.6 |
| U7 | Lief `radio-admin` in Prod je mit `AUTH_DEV_BYPASS`? | | **beantwortet durch Abfrage A9** (§V) — ⛔ letzte Gelegenheit ist §5.5 (Volume-Löschung), danach nie wieder (Risiko R5) | Lesbarkeit der Auditspalten; nach dem gelöschten Volume nicht mehr beantwortbar |
| U8 | **Volumengröße und Dump-Dauer** beider Stacks | | **Messung in der Generalprobe** (§P.12), nicht am Abend | Das Fenster ist unbemessen (§A Nr. 7) |
| U9 | Sind Repo- und Server-`compose.yaml` am 19.07. auseinandergelaufen? **Im Repo nicht nachweisbar, deshalb Frage und nicht Tatsache** | | **Betreiber**, ohne Frist — blockiert nichts | nichts; die Aufschreibpflicht aus §B hängt nicht daran |
| U10 | **Wo liegt die Deployment-Dokumentation, die auf `/api/health/*` zeigt** — Repo, Wiki, Server-README? Oder gibt es keine? ⛔ `docs/deployment.md` existiert in diesem Repo **nicht** (gemessen 2026-08-27) | | **Betreiber**, vor §D Nr. 15 — ohne Frist davor, blockiert das Fenster nicht | §D Nr. 15 und §H Punkt 25 werden entweder **ohne Handlung abgehakt** oder halten an. Gibt es keine, ist der Punkt auf **Monitor allein** zusammenzuziehen |
| N1 | Hält der reguläre Stack `radio.db` **nach dem Boot dauerhaft offen**? | ✅ **JA** — `getModuleDb` cacht den Handle auf `globalThis.__suiteDb` und schließt ihn **nie** (`src/core/db/index.ts:24-34`); `starteRadioHintergrund()` (`src/app/m/radio/_lib/boot.ts:611`) öffnet ihn beim Boot über `bestandswarnung(env)` (`:612` → `:578`, dort steht das `getDb()`) bzw. über `raeumeLeihhistorie` (`:545`) — **nicht** mit einem eigenen `getDb()`-Aufruf; `:610` ist die Kommentarzeile darüber | **abgelesen aus dem Bau am 2026-08-27** — nichts mehr zu tun | — (eingelöst; sie begründet, warum im Fenster **kein** `immutable=1` gelesen wird, §L.3) |
| N2 | Ist die `compose.yaml` **mit** der `radio-admin-alt`-Labelgruppe bereits **auf dem Server** ausgerollt? | | **Betreiber am Server**, ⛔ **vor §A** und damit vor dem Fenster: `docker compose config \| grep -A2 radio-admin-alt` | ⛔ §C Schritt 9 Nr. 3 greift ins Leere: `SUITE_REDIRECT_RULE_RADIO_ADMIN` hat nichts zu parametrisieren (§0.1) |
| N3 | Die **tatsächliche** numerische Kennung des Suite-Prozesses: `docker inspect "$(docker compose ps -q suite)" --format '{{.Config.User}}'` bzw. `SUITE_USER` aus der Server-`.env`. ⚠️ **Nicht am Fenster-Prüfcontainer ablesen** — den gibt es zu diesem Zeitpunkt noch nicht, und ⬜ L13 ist ein **Port**, kein Containername | | **Betreiber am Server**, ⚠️ **vor der Generalprobe** | ⛔ §C Schritt 4 Handgriff 3 setzt die **falsche** Kennung, und die Erwartung dort ist auf einem Standardhost zwangsläufig rot |
| N4 | Der Pfad der `sw.js`-Route unter `src/app/m/radio/`, und damit die interne Form der URL | ✅ **extern `/sw.js` (Scope `/`), intern `/m/radio/sw.js`** — `src/app/m/radio/sw.js/route.ts:1-20`, Rewrite `src/core/routing.ts:43-79` | **abgelesen aus dem Bau am 2026-08-27** — nichts mehr zu tun | — (eingelöst; gebraucht in §P.9 V6 und §D) |
| N5 | Env des Host-Cron für `scripts/backup.sh` (`DATA_DIR`, `BLOB_DIR`) und der Ablageort des Tarballs | | **Betreiber am Server** (Crontab/Timer-Unit), vor §D | §D Nr. 13 bricht mit `no *.db in $DATA_DIR — aborting` ab, oder sichert gegen die falsche Konfiguration |
| N6 | Edge-Proxy: (a) **setzt** er `X-Forwarded-Host`, (b) welche **Entrypoints** gibt er weiter, (c) ist `radio-admin.iuk-ue.de` dort bekannt | | **Betreiber am Server**, vor §A Nr. 8 | §A Nr. 8; und §D Nr. 7 läuft sonst in einen Verbindungs- oder TLS-Fehler **statt rot zu werden** |
| N7 | Ist die **Zwei-Monats-Frist** im produktiv laufenden `radio-admin` überhaupt konfigurierbar? | | **Betreiber am Server** (Image-Herkunft), ⚠️ **vor dem Fenster** — §G 3a hängt daran | §5.7 und §H |
| N8 | **Wohin gehen die zwei Archivdateien?** Zielsystem, Zugriffsweg, Person — und der Beleg, dass es **nicht** der Suite-Server ist | | **Betreiber**, ⚠️ **vor §C Schritt 2/3** — dort entstehen die Dateien | §5.4 (Protokollzeile) und §5.5 Posten 11 |
| N9 | Gibt es ein **Traefik-Zugriffsprotokoll**, wo liegt es, wie lange wird es vorgehalten? | | **Betreiber am Server**, vor §5.8 | §5.8 und §5.5 Posten 10 — ohne Protokollquelle ist die Abbaubedingung „vier Wochen ohne Treffer" nie erfüllbar |
| N10 | **Zwei** Arbeitsverzeichnisse auf dem Server: **(a)** das **Suite-Checkout** (`docker compose`, `pnpm exec tsx scripts/import/radio.ts`, `scripts/deploy.sh` — und der Ablageort des Schnappschusses aus §C Schritt 2), **(b)** wo die zwei **Alt-Checkouts** liegen, aus denen die `docker compose -f …`-Befehle laufen | | **Betreiber am Server**, vor dem Fenster | ⛔ die drei Stopp-Befehle (§C Schritt 1) und der Rückweg (§G) laufen aus einem unbekannten Verzeichnis; dazu §5.3 und §5.7. Und ohne (a) legt §C Schritt 2 den Schnappschuss in ein unbenanntes Verzeichnis, aus dem Schritt 4 ihn als `./radio-admin-snapshot.sqlite` **nicht** findet |

**Siebenundzwanzig Wertzeilen** (E1, E1b, E2–E8 · U4, U4a, U4b, U6, U7, U8, U9, U10 · N1–N10).
⚠️ Die Pläne führen **fünfundzwanzig**, und **beide** Zusätze sind benannt: **E1b** kam mit der
Betreiberentscheidung C.6/B4 vom 2026-08-21 hinzu (zwei Rechtestufen statt einer), **U10** am
2026-08-27 aus der Messung — die Pläne und §D Nr. 15 nennen eine Datei `docs/deployment.md`, die es
in diesem Repo **nicht gibt** (`find . -name 'deployment*.md'` → keine Ausgabe). Zwei Zeilen (N1,
N4) sind aus dem fertigen Bau **abgelesen** und deshalb ausgefüllt; die übrigen **fünfundzwanzig**
brauchen den Server oder den Betreiber.

Zu **E1**: Gruppen im JWT werden nur beim Login und beim Token-Refresh nachgezogen — eine frisch
angelegte Gruppe wirkt mit bis zu **einer Stunde** Verzug (`CLAUDE.md`, Abschnitt Zugriffsschutz).
Wer die Gruppe am Cutover-Abend anlegt, prüft die Verwaltung **nach einer neuen Anmeldung**, nicht
mit der offenen Sitzung.

Zu **E1/E1b**: die zwei Zeilen haben **entgegengesetzte** Leerwert-Bedeutungen. `SUITE_ADMIN_GROUP_RADIO`
leer sperrt die Verwaltung für **jeden**, den Betreiber eingeschlossen (`radio` umgeht den
Suite-Admin-Kurzschluss modulintern, `.env.example:83-96`). `SUITE_UPDATER_GROUP_RADIO` leer schließt
**nur** die Updater-Stufe und ist ein gültiger Zustand (`.env.example:107-114`).

Zu **U4**: solange offen ist, wer das `radio-inventar`-Frontend ausliefert, **blockiert es den
Freeze** — nicht erst den Abbau. Ein unbekannter Auslieferungsweg ist ein Schreibweg, den niemand
gestoppt hat, und der Verlust ist stumm.

**Die Betreiberfragen aus `ENTSCHEIDUNGEN-radio.md` in dieser Tabelle:** C.2 = **E4** · C.3 = **E5** ·
C.5 = **U4**. **C.6/B4 ist entschieden** (2026-08-21: zwei Rechtestufen, gebaut — deshalb E1 **und**
E1b). **C.1** (Bauform des Ausleih-Codes) war nie eine Betreiberfrage, sondern von Spec 1
vorentschieden und so gebaut. **C.4** (Benutzername beim Ausleihen vorbelegt) und **C.7** (Ausleihe
ohne Netz) tragen einen gebauten Default, der der jeweiligen Empfehlung entspricht — sie hängen an
keinem Schritt dieses Runbooks und stehen deshalb nicht in der Tabelle, gehören aber auf die
Abnahmeliste (§D), weil wer abnimmt prüft, was entschieden wurde.

### §0.1 — Was vor dem Fenster ausgerollt sein muss: die sechs Redirect-Labels (Beleg zu N2)

⚠️ **Diese Labels sind kein Fensterschritt.** Sie sind rollout-wirksam und müssen in einem
**früheren** Rollout auf dem Server liegen: `scripts/deploy.sh` vergleicht die Server-`compose.yaml`
**byteweise** mit der des Repos und bricht bei Abweichung ab (begründet in `compose.yaml:42-48`).
Eine von Hand am Cutover-Abend ergänzte Label-Sektion wäre **genau** diese Abweichung — der nächste
Rollout schlüge fehl oder risse die Ergänzung wieder heraus.

✅ **Stand 2026-08-28: die Labelgruppe IST im Repo — C2 hat sie gebaut** (`0fc85370`). Sie steht in
`compose.yaml:156-186` als **zweiter, eigener Router** `radio-admin-alt`, unter den unveränderten
Suite-Labels (`:146-155`, `traefik.http.routers.iuk-suite.*`, `entrypoints=web`), und ein
Regressionstest wacht darüber (`scripts/compose-radio-redirect.test.ts`, 7 Fälle: Middleware am
**Router**, `permanent=false`, das doppelte Dollarzeichen in `$${1}`, und die Abwesenheit des
Alt-Hosts in `SUITE_TRAEFIK_RULE`).

⛔ **Damit ist der Repo-Teil erledigt, der SERVER-Teil nicht.** Was bleibt: **ausrollen** und danach
⬜ **N2** ablesen — `docker compose config | grep -A2 radio-admin-alt` **am Server**. Bis dahin
greift §C Schritt 9 Nr. 3 ins Leere. ⚠️ *Nachtrag 2026-08-28: dieser Absatz forderte bis heute, die
Zeilen unten „zu übernehmen" — wer ihn jetzt liest und der Anweisung folgt, baut die Labels ein
zweites Mal ein.* Die Fassung unten bleibt als **Beleg dessen stehen, was ausgerollt sein muss**;
maßgeblich ist `compose.yaml` im Repo.

Die sechs Zeilen gehören in `compose.yaml`, Service `suite`, unter die vorhandenen `traefik.*`-Labels:

```yaml
      # ── Redirect des Alt-Hosts radio-admin.iuk-ue.de → radio.iuk-ue.de/admin ──
      # ZWEITER, EIGENER Router. `radio-admin.iuk-ue.de` gehoert AUSDRUECKLICH NICHT in
      # SUITE_TRAEFIK_RULE: der Host erreichte dann den Container, kein SUITE_HOST_*
      # beansprucht ihn, und `decideRoute` schreibt auf portal um (src/core/routing.ts:79).
      # Der Alt-Host zeigte dann das PORTAL — ein funktionierender Abruf mit falschem Inhalt.
      # Die Vorbelegung `radio-admin.invalid` loest niemand auf; ohne sie scheitert
      # `docker compose config`, sobald die Variable fehlt.
      - traefik.http.routers.radio-admin-alt.rule=${SUITE_REDIRECT_RULE_RADIO_ADMIN:-Host(`radio-admin.invalid`)}
      # DIESELBEN Entrypoints wie der Suite-Router. TLS endet VOR Traefik, an einem
      # Edge-Proxy — im ganzen Compose gibt es kein `tls`- und kein `certresolver`-Label.
      - traefik.http.routers.radio-admin-alt.entrypoints=web
      # Middleware am ROUTER, nicht am Service: am Service traefe der Redirect die Suite selbst.
      - traefik.http.routers.radio-admin-alt.middlewares=radio-admin-alt-redirect
      - traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.regex=^https?://radio-admin\.iuk-ue\.de/(.*)
      # `$${1}` erreicht Traefik als `${1}`. Ein einfaches `$` verschluckt Compose, und die
      # Ersetzung liefert `/admin/` fuer JEDEN Pfad — der Redirect funktioniert dann, ist aber
      # nicht mehr pfaderhaltend. Das ist der stille Fehlfall dieses Blocks.
      - traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.replacement=https://radio.iuk-ue.de/admin/$${1}
      # 302, nie 301: ein 301 liegt im Cache jedes Telefons, das den Alt-Host je besucht hat,
      # und macht den Rueckweg praktisch unmoeglich.
      - traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.permanent=false
```

**Die fünf stillen Fehlfälle dieser Gruppe** — jeder liefert einen funktionierenden Abruf mit
falschem Ergebnis, und **kein Tor des Repos sieht sie**: `pnpm build` liest keine `compose.yaml`,
`docker compose config` prüft nur Syntax, e2e benutzt kein Compose.

| Fehler | Was dann passiert |
|---|---|
| Middleware am **Service** statt am **Router** | Der Redirect trifft die Suite selbst |
| `permanent=true` (301) | Die Weiterleitung liegt im Cache jedes Telefons, das den Alt-Host je besucht hat — der Rückweg ist praktisch unmöglich |
| `${1}` statt `$${1}` | Compose verschluckt das eine `$`; die Ersetzung liefert `/admin/` für **jeden** Pfad. Der Redirect funktioniert und ist nicht mehr pfaderhaltend |
| fehlende Vorbelegung | `docker compose config` scheitert, sobald die Variable nicht gesetzt ist |
| `entrypoints` abweichend vom Suite-Router | `https://radio-admin.iuk-ue.de/` antwortet gar nicht oder mit einem Zertifikatsfehler — die drei `curl` aus §D laufen ins Leere, **statt rot zu werden** |

⛔ **Deshalb BEKOMMT die Gruppe einen eigenen Regressionstest — er ist am 2026-08-27 NOCH NICHT
ANGELEGT.** `ls scripts/compose-radio-redirect.test.ts` → `No such file or directory`; ein
`pnpm vitest run` darauf endet mit `No test files found, exiting with code 1`. **Er ist Teil von
C2 und damit Teil dieser ⛔-Vorbedingung**, nicht ein bereits vorhandenes Sicherheitsnetz: die fünf
stillen Fehlfälle oben haben bis dahin **keine** Verteidigung. Sollform (Zeilenzerlegung statt
YAML-Paket, Vorbild `src/app/m/files/_lib/compose.test.ts:14-21`), **sieben** Prüfungen:
Regel mit Vorbelegung · Entrypoints gleich dem Suite-Router · Middleware am Router und
**kein** `traefik.http.services.radio-admin-alt` · pfaderhaltende Ersetzung mit `$$` · Regex trifft
beide Protokolle · `permanent=false` · `radio-admin` steht **nicht** in der Vorbelegung von
`SUITE_TRAEFIK_RULE`.

```bash
# ⛔ Diese Zeile ist heute NOCH NICHT fahrbar — die Datei entsteht erst mit C2.
rtk pnpm vitest run scripts/compose-radio-redirect.test.ts
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
```

Und auf dem Server, nach dem Rollout — **das ist die Ablesung für ⬜ N2**:

```bash
docker compose config | grep -A2 radio-admin-alt
```

→ Die Regel steht mit der Vorbelegung `Host(`radio-admin.invalid`)` da, und `replacement` endet auf
`/admin/${1}` — mit **einem** Dollarzeichen, weil Compose das doppelte hier auflöst. **Steht dort
`/admin/` ohne `${1}`, ist das `$$` verloren**: der Redirect funktioniert und ist nicht
pfaderhaltend. Dann **nicht** weitermachen, sondern die Label-Zeile berichtigen und neu ausrollen.

### §0.2 — Die `.env`-Zeilen des Moduls, und der Rollback-Handgriff je Zeile

⚠️ **Hier steht, welche Zeilen es gibt und was ihr Leerwert bedeutet. Gesetzt werden sie in §B** —
mit den Werten aus E1, E1b und E4. Die Vorlage steht vollständig in `.env.example` (Block „Modul
radio", `.env.example:408-647`; Prod-Domain-Zeile `:154`; Redirect-Wert `:593`).

| Zeile | Pflicht | Leerwert bedeutet | Rollback-Handgriff |
|---|---|---|---|
| `SUITE_HOST_RADIO` | ja für den Cutover | Modul ohne Prod-Domain — `envHostsFor` liefert `[]` (`src/core/hosts.ts:33-46`) | ⛔ **Zeile LEEREN, nicht entfernen.** `SUITE_HOST_RADIO=` ist der Rückweg |
| `SUITE_ADMIN_GROUP_RADIO` (⬜ E1) | faktisch ja | **niemand** darf verwalten, Suite-Admin eingeschlossen | Rollback ist das **Zurücksetzen auf den vorigen Wert**, nicht das Leeren |
| `SUITE_UPDATER_GROUP_RADIO` (⬜ E1b) | nein | niemand ist Updater — gültiger Zustand | Leeren ist zulässig |
| `SUITE_ACCESS_GROUP_RADIO` | ⛔ **darf es NICHT geben** | ein `SUITE_ACCESS_GROUP_RADIO=` kommt per `env_file` als **leerer String**, also als *definiert*, im Prozess an → **Startabbruch der ganzen Suite** | Die Zeile **ersatzlos entfernen** — auch die auskommentierte Vorlage nicht anlegen |
| `RADIO_AUSLEIH_SITZUNG_SECRET` | **ja**, sobald `SUITE_HOST_RADIO` gesetzt ist | Startabbruch | Frisch erzeugen (`openssl rand -base64 32`), ≥ 32 Zeichen, **nicht** gleich `AUTH_SECRET`. ⚠️ **Hier gibt es nichts zu erben**: der Alt-Zugang ist ein base64-Bearer-Token im `localStorage`, kein signiertes Cookie |
| `RADIO_AUSLEIH_SITZUNG_STUNDEN` (⬜ E4) | nein | Vorgabe **12**; außerhalb 1..168 ist Startabbruch | Zeile entfernen = 12 |
| `RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN` | nein | Vorgabe **5** | ab dem ersten Import eingefroren — eine geänderte `.env` wirkt erst nach Neustart |
| `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN` | nein | Vorgabe **30** | dito |
| `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` | nein | Vorgabe **300** | dito |
| `RADIO_HISTORIE_MONATE` | nein | Vorgabe **2**; `=0` wird ausdrücklich **abgewiesen**, nicht als „aus" gelesen | im Fenster **nicht** setzen |
| `RADIO_HISTORIE_PURGE` | nein | Vorgabe **1** (an). **`=0` schaltet ab — zeichengenau**: `=false`/`=off`/`=nein` schalten **nicht** ab und laufen still weiter | ⛔ **`=0` gilt NUR im Fenster** und wird entfernt, sobald R und Z grün protokolliert sind (§D Nr. 14) |
| `RADIO_HISTORIE_ERSTLAUF_MINUTEN` | nein | Vorgabe **1440** (24 h) | im Fenster **nicht** setzen |
| `SUITE_TRAEFIK_RULE` | ja | — | Um **eine** Klausel erweitern: ``SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`) \|\| Host(`radio.iuk-ue.de`)``. ⛔ **`radio-admin.iuk-ue.de` gehört dort NICHT hinein** — sonst stiller Portal-Fallback statt Weiterleitung |
| `SUITE_REDIRECT_RULE_RADIO_ADMIN` | nein | Vorbelegung `Host(`radio-admin.invalid`)` greift bei leer **und** bei ungesetzt | ⛔ **Rollback ist die GELEERTE Zeile, nicht die gelöschte.** Reihenfolge des endgültigen Abbaus: Labels aus `compose.yaml`, dann diese Zeile, **DNS zuletzt** — der DNS-Eintrag ist die Abhängigkeit des Redirects, kein Abbau-Posten |

⚠️ **Alle Boot-Prüfungen außer der `SUITE_ACCESS_GROUP_RADIO`-Leerprüfung hängen am Host-Schalter:**
solange `SUITE_HOST_RADIO` fehlt, startet die Suite trotz jedes hier beschriebenen Fehlers klaglos
durch (`.env.example:414-422`). **Das ist der Grund, warum §B eine eigene Verifikation hat und nicht
nur ein „Container läuft".**

⚠️ **Bei `RADIO_HISTORIE_PURGE=0` meldet jeder Start eine Zeile**, und sie ist das einzige, was ein
vergessenes `=0` findbar hält (`src/app/m/radio/_lib/boot.ts:629-635`). Grep-Anker:

```
Retention abgeschaltet
```

---

## §L — Wie auf beiden Armen gelesen wird

**Dieser Abschnitt steht vor allen Abfragen und wird von §V, §S und §Z zurückzitiert.** Es gibt genau
zwei Lesebefehle. Wer einen dritten baut, hat einen Befehl gebaut, den niemand gegengelesen hat.

**Die zwei Arme sind asymmetrisch, und das ist der Kern dieses Cutovers** (Spec 2 §2.2.2):

| Arm | Wie gelesen wird | Warum nicht anders |
|---|---|---|
| **Quelle** | `sqlite3 -readonly radio-admin-snapshot.sqlite '<SELECT>'` gegen die **Snapshot-Kopie**, nie gegen den laufenden Stack. Zusätzlich **darf** die Alt-Oberfläche als zweite Meinung dienen: sie läuft bis zum Umschwenk unter `radio.iuk-ue.de` | Der Alt-Kiosk ist bis zum Umschwenk der Betrieb |
| **Ziel** | ausschließlich `sqlite3` **ohne `-readonly`** in einem Container **ohne Traefik-Labels** | ⚠️ Der Zielarm hat **keine** Adresse. „Seite aufmachen und hinsehen" ist auf dem Zielarm **keine** verfügbare Prüfung. Zum fehlenden `-readonly` siehe §L.3 (NT8) |

⚠️ **Eine Ausnahme von der zweiten Meinung, und sie ist benannt:** für `devices.last_updated_at` ist
die Alt-Anwendung **kein** Schiedsrichter, sondern eine Münze — der CSV-Export formatiert den
**UTC**-Tag (`radio-admin@265abd5 server/src/routes/export.ts:49-51`), die Detailansicht den
**lokalen** Tag (`client/src/utils/format.ts:4`,
`client/src/features/devices/DeviceEditForm.tsx:41`). Die zwei Flächen widersprechen sich bei genau
den Zeilen, die §S auswählt. **Der Sollwert steht in §S.4, nicht hier.**

### §L.1 — Der Quellarm

Der Auszug entsteht **einmal je Lauf** mit `.backup`, ⛔ **ohne `docker compose stop`**:

```bash
docker volume ls | grep -i radio-data     # ⚠️ compose praefixt mit dem Projektnamen
VOL=<die Zeile aus dem Befehl oben>       # → Eingabe E2, ins Protokoll
docker run --rm -v "$VOL":/d -v "$PWD":/out alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1;
         sqlite3 /d/data.sqlite ".backup /out/radio-admin-snapshot.sqlite"'
```

> Echter radio-admin-Volumename (**E2**): ____________________ ·
> Snapshot-Kopie liegt unter: ____________________ · gezogen am ____________ (UTC)

⚠️ **Warum `.backup` und nicht `cp`:** `radio-admin` läuft im WAL-Modus (`radio-admin@265abd5
server/src/db/index.ts:28`). Eine WAL-Datenbank besteht aus **drei** Dateien, und ein `cp` verliert
den Schwanz aller committeten Transaktionen — **paritätsgrün**, weil eine abgeschnittene Quelle mit
sich selbst vollkommen einig ist. `.backup` ist die Hausform (`scripts/backup.sh:41-43`).

⚠️ **Warum KEIN Stopp in der Generalprobe:** `.backup` arbeitet gegen die laufende Datenbank — genau
dafür ist es da. Ein Stopp wäre unnötig, und der **Neustart danach** löscht Historie:
`radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`, `retentionService.ts:47` purgt
**sofort**, und der Purge meldet dabei **Erfolg** (`[retention] purged N expired loan(s)`). Der
Freeze ist ein Schritt des **Fensters** (§C Schritt 1), nicht der Generalprobe.

⛔ **Unmittelbar nach dem `.backup`: den Journal-Modus der QUELLE messen.** Die Ablesung `delete` vom
2026-08-21 ist **datiert** — ein Update von `radio-admin`, eine geänderte Startkonfiguration oder ein
Migrationsschritt genügt, um sie umzustoßen
(`docs/superpowers/berichte/2026-08-21-radio-import-abnahme.md:147-159`).

```bash
sqlite3 radio-admin-snapshot.sqlite "pragma journal_mode;"
```

> Ergebnis: ____________ · gemessen am ____________

* **`delete`** (Erwartung, Stand 2026-08-21) → der Quellarm behält `-readonly`. Weiter.
* **`wal`** → ⚠️ **auch die Quelle verliert `-readonly`**: dieselbe `-shm`-Falle wie im Ziel (NT8,
  §L.3). Dann alle Quellarm-Befehle dieses Runbooks **ohne** `-readonly` fahren und die Abweichung
  ins Protokoll schreiben. **Kein Abbruch** — nur eine andere Leseform.

Alle Abfragen in §V, §S und §Z laufen auf diesem Arm als:

```bash
sqlite3 -readonly radio-admin-snapshot.sqlite '<SQL>'
```

### §L.2 — Der Zielarm

```bash
# ⛔ $VOL_SUITE wird HIER NICHT GESETZT. Diese Befehle gehoeren dem FENSTERLAUF. Die
# GENERALPROBE liest gar nicht das Volume, sondern den Bind-Pfad $GP/data (§L.3, Zeile
# „Generalprobe") und braucht $VOL_SUITE ueberhaupt nicht.
# Im Runbook wird der Name an genau ZWEI Stellen abgelesen — §C Schritt 4 Handgriff 1
# (im Fenster) und §5.2 (die Abbau-Sitzung Wochen spaeter, in einer neuen Shell). Dieser
# Abschnitt erbt die Protokollzeile SEINES Laufs und zitiert sie zurueck. Eine dritte
# Ablesung waere eine dritte Gelegenheit, ein ANDERES Volume zu erwischen.
# ⚠️ ZWEI BEGRUENDUNGEN, und nur eine gilt fuer $VOL_SUITE: dessen Name ist in der
# compose.yaml GEPINNT (`name: suite_data`, compose.yaml:252-254) — das Projektpraefix
# entfaellt, und diese zweite Ablesung ist reine VORSICHT gegen einen umbenannten
# Compose-Projektnamen. ⛔ Sie wird deshalb NICHT gestrichen: sie kostet nichts.
# Die Praefix-Falle selbst gilt fuer E2 und E3 — radio-admin/docker-compose.yml:16-17
# und radio-inventar/docker-compose.yml:61-62 deklarieren ihre Volumes OHNE `name:`,
# dort praefixt compose mit dem Projektnamen. Beide Male gilt: ein erfundener oder
# abweichender Name legt ein NEUES, LEERES Volume an, und `sqlite3` liefert dann null
# Zeilen OHNE Fehler.
# ⚠️ IM FENSTER gilt: liegt die Protokollzeile aus §C Schritt 4 Handgriff 1 nicht vor
# dir, hier NICHT weiterlesen und den Namen NICHT neu ablesen, sondern dorthin zurueck.
# In der GENERALPROBE gilt diese Zeile nicht — dort gilt §L.3.

# Gegenprobe, bevor eine einzige Zahl geglaubt wird: eine `0` ist ZUERST ein Volume-Fehler (NT10).
docker run --rm -v "$VOL_SUITE":/data alpine sh -c 'ls -ln /data; stat -c "%n %s %y" /data/radio.db'

# Kein `-p`, KEINE Traefik-Labels, kein Netz-Alias, kein `--network` auf das Proxy-Netz.
# Dieser Container BOOTET NICHT — er ist alpine plus sqlite3 und nichts sonst.
# KEIN -readonly (NT8) — Begruendung in §L.3.
# Ein Aufruf je Abfrage, SQL ueber stdin — so muss nichts durch zwei Shell-Ebenen gequotet werden:
echo "select count(*) from devices;" | docker run --rm -i \
  -v "$VOL_SUITE":/data alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -header -column /data/radio.db'
```

> Suite-Volumename (**$VOL_SUITE**, **nur im Fenster**): **zurückzitiert aus §C Schritt 4
> Handgriff 1** — hier wird nichts abgelesen und nichts eingetragen. In der **Generalprobe** entfällt
> die Zeile: dort gilt §L.3, Zeile „Generalprobe", mit dem Bind-Pfad `$GP/data` ·
> `stat` zeigt `radio.db` mit ________ Bytes, geändert am ________ · Kennung aus `ls -ln`: ________ ·
> abgelesen am ____________

⚠️ **Ein leeres Ergebnis ist hier ein Verdacht, kein Befund.** `openModuleDatabase` legt das
Verzeichnis per `mkdirSync(dir, {recursive:true})` an (`src/core/db/index.ts:12-22`), better-sqlite3
die Datei — **ein vertipptes `DATA_DIR` oder ein falscher Volume-Name ergibt eine nagelneue, leere
`radio.db`, und jede Abfrage antwortet `0`, nicht „Datei fehlt"** (NT10). Deshalb steht die
`ls -ln`/`stat`-Gegenprobe oben und nicht in einer Fußnote. **Eine `radio.db` von wenigen Kilobyte
oder mit einem Änderungszeitpunkt vor dem Import ist die falsche Datei.**

⛔ **`sqlite3` auf dem HOST gegen `"$DATA_DIR/radio.db"` ist im FENSTERLAUF verboten.** Den Pfad gibt
es auf dem Host **nicht**: `DATA_DIR=/data` ist ein **Container**-Wert (`compose.yaml:79`, unter
`environment:`, das über `env_file` gewinnt), die Datei liegt im benannten Volume
(`compose.yaml:99`, `:221-223`). Der Befehl bricht dann mit `unable to open database file` ab —
laut, aber ein verbrannter Schritt. **In der Generalprobe ist derselbe Pfad richtig**, weil
`DATA_DIR` dort ein Bind-Pfad ist (§L.3).

### §L.3 — Die Lesart hängt vom Lauf ab, und der Mount steht je Zeile dabei

⛔ **NT8, gemessen und nicht vermutet — die Ziel-Datenbank wird OHNE `-readonly` gelesen.** Eine
frisch importierte `radio.db` liegt im **WAL-Modus** und trägt noch **keine `-shm`**; ein
Readonly-Handle darf sie nicht anlegen und bricht ab mit:

```
Parse error in 3rd command line argument: unable to open database file (14)
```

**Diese Meldung sieht wie ein Importfehler aus und ist keiner.** Widerlegt ist auch die naheliegende
Erstdiagnose „das mehrzeilige SQL scheitert, einzeilig läuft es": es scheitert auch einzeilig, auch
mit absolutem Pfad, auch über `file:?mode=ro`. Der scheinbar funktionierende Einzeiler lief,
**nachdem** ein vorheriger Schreibzugriff die `-shm` angelegt hatte
(`docs/superpowers/berichte/2026-08-21-radio-import-abnahme.md:78-179`). **Der Importer selbst ist
nicht betroffen** — `better-sqlite3` mit `readonly: true` öffnet eine WAL-DB ohne `-shm`.

⚠️ **Das gilt für JEDEN ersten Leser einer frisch importierten Datei, also in beiden Läufen** — nicht
nur im Fenster. **Die Datei gehört uns; das Anlegen der `-shm` ist harmlos.** Ein `:ro`-Mount hat
dieselbe Wirkung wie `-readonly` und wird deshalb auf dem Zielarm ebenfalls nicht verwendet.

| Lauf | Ziel-DB liegt | Befehl, ausgeschrieben |
|---|---|---|
| **Generalprobe** | im **Bind-Pfad** `$GP/data`, **nicht** im Volume | `sqlite3 "$DATA_DIR/radio.db" '<SQL>'` auf dem Host — **ohne** `-readonly`, **ohne** `immutable=1`, `DATA_DIR=$GP/data` |
| **Fenster** (nach §C Schritt 7) | im Volume `$VOL_SUITE` | `echo "<SQL>" \| docker run --rm -i -v "$VOL_SUITE":/data alpine sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -header -column /data/radio.db'` — Mount **ohne** `:ro`, **ohne** `-readonly`, ⛔ **kein `immutable=1`** |

⛔ **Der Textriegel gilt für die Generalprobe und nur für sie:** „die `docker run`-Zeile **der
Generalprobe** enthält die Zeichenkette `suite_data` nicht" (Spec 2 §3.2.1). Im Fenster ist genau
dieses Volume das Prüfobjekt. **Der Riegel wird immer mit seinem Geltungsbereich zitiert, nie ohne** —
ein `suite_data` in der Generalprobe ist ein Zeichen Unterschied und schreibt in die Produktion.

**Warum im Fenster kein `immutable=1` steht — die Antwort ist gemessen, nicht mehr konservativ
geraten (✅ **N1, abgelesen am 2026-08-27**):** `getModuleDb` cacht den Handle auf `globalThis.__suiteDb` und schließt
ihn **nie** (`src/core/db/index.ts:24-34`), und `starteRadioHintergrund()` ruft `getDb()` beim Boot
(`src/app/m/radio/_lib/boot.ts:611-612`). **Der laufende Stack hält `radio.db` dauerhaft offen.**
`immutable=1` gegen eine Datei, an der ein anderer Prozess hängt, ist eine falsche Zusage an SQLite.
Dieselbe Messung ist die Grundlage für die Bewertung von §C Schritt 4 Handgriff 3, wo `radio.db`
unter einem laufenden Prozess ersetzt wird.

**Gegenlesung dieses Abschnitts — drei Fragen, je eine Antwort danebenschreiben:**

1. Steht **je Lauf** ein Mount bzw. Pfad da, oder erbt eine Zeile stillschweigend den anderen?
   *(Erwartung: je Lauf ausgeschrieben.)*
2. Steht die `ls -ln`/`stat`-Gegenprobe **vor** der ersten Zählung? *(Erwartung: ja. Eine `0` ist
   zuerst ein Volume- oder Pfadfehler.)*
3. Ist irgendwo ein **ausführbares** `-readonly` gegen `radio.db` stehen geblieben?

```bash
rtk grep -n 'sqlite3 -readonly' docs/runbooks/radio-cutover.md
```

**Erwartung: jeder Treffer betrifft den QUELLARM** (`radio-admin-snapshot.sqlite`) oder steht in
einem Warntext. **Kein** Treffer steht auf einer ausführbaren Zeile gegen `radio.db`:

```bash
rtk grep -n 'sqlite3 -readonly.*radio\.db' docs/runbooks/radio-cutover.md
```

⚠️ **Erwartung: genau EIN Treffer, und er steht in diesem Gegenlese-Abschnitt selbst** — das Zitat
der verworfenen Form im nächsten Absatz. **„Keine Ausgabe" wäre hier die falsche Erwartung** und
würde beim ersten Lauf als Defekt gelesen. **Jeder ZWEITE Treffer ist der Fund, den dieser Schritt
sucht**: eine ausführbare Zeile, die mit `-readonly` gegen die Ziel-Datenbank fährt.

⚠️ **Diese Erwartung ist gegenüber den Plänen berichtigt.** Die Pläne vom 2026-08-18 verlangten für
die Generalprobe genau **einen ausführbaren** Treffer der Form
`sqlite3 -readonly "$DATA_DIR/radio.db"`; **NT8 vom 2026-08-21 hat gemessen, dass diese Form gegen
eine frisch importierte Datei scheitert.** Wer die Zeile „repariert", indem er `-readonly`
zurückschreibt, baut die Falle wieder ein. Der Grund steht oben und ist nicht mehr zu erraten.

```bash
rtk grep -c 'sqlite3 -readonly "\$DATA_DIR' docs/runbooks/radio-cutover.md
```

**Erwartung: `1`** — allein das Zitat der verworfenen Form im Absatz darüber, keine ausführbare
Zeile.

---

## §V — Die dreizehn Abfragen gegen die Alt-Datenbank, VOR dem Import

**Quellarm: der Befehl aus §L.1.** Alle dreizehn laufen gegen die **Snapshot-Kopie**, nie gegen einen
laufenden Stack.

⛔ **Warum es diesen Abschnitt gibt — und warum ihn niemand überspringt (NT9).** Die Parität beweist
den Datenbank-Rundlauf, nicht die Frische der Quelle: **beide Arme von `checkRadioParitaet` stammen
aus demselben, einmal gelesenen Quellobjekt.** Ein Schnappschuss, der zwei Stunden alt, aber in sich
konsistent ist, ergibt plausible Zahlen, einen sauberen Import und **grüne** Parität — und ist
trotzdem nicht mehr die Alt-Anwendung, die die Leute an diesem Abend benutzt haben. **§V ist die
einzige Zahl dieses Cutovers, die von AUSSERHALB dieses Objekts kommt.** Sie ist deshalb keine
Buchhaltung, sondern die Vorabzählung, gegen die der Betreiber später die Zählzeile des Importers und
die Gegenzählungen aus §Z stellt.

**Diese Liste ist ein Superset.** Spec 1 §9.4.1 ist „vollständig und wörtlich in das Cutover-Runbook
zu übernehmen — nicht zusammenfassen, nicht verlinken". **A1–A9 sind die acht Abfragen aus §9.4.1**
in ihrer Reihenfolge und mit ihrem SQL; **A10** ist der Spannen-Riegel aus §2.8.3 Nr. 6; **A11–A13**
sind Ergänzungen und als solche markiert.

⛔ **Kein Befund wird im Cutover-Fenster zum ersten Mal gesehen.** Alle dreizehn laufen in der
**Generalprobe** gegen die Snapshot-Kopie **und** im echten Fenster ein zweites Mal. Der Unterschied
ist nicht die Abfrage, sondern der Preis: in der Generalprobe eine halbe Stunde, im Echtlauf ein
Abbruch um 23 Uhr — und weil es **kein Parallelfenster** gibt, ist der Abbruch dort teuer.

⚠️ **Eine Bereinigung der Klasse 🧹 wird im Echtlauf WIEDERHOLT, nicht vererbt.** Sie fand in einer
Kopie statt, die es im Fenster nicht mehr gibt.

**Acht sind blockierend, fünf sind protokollpflichtig:**

| ⛔ blockierend | Protokollpflichtig, nicht blockierend |
|---|---|
| A2 · A3 · A4 · A5 · A6 · A7 · A10 · A11 | A1 (sie **setzt** die Sollwerte) · A8 · A9 · A12 · A13 |

Mit zwei Verschärfungen: **A12 im Fall `AKTIV`** ist dem Betreiber vorzulegen, und **A13** wird
blockierend, wenn dieselbe Zeile zusätzlich in A10 auffällt.

### §V.0 — Die Vorabzählung aus der LAUFENDEN Alt-Anwendung, und der Zeitstempel dazu

⛔ **Diese Zeile ist die einzige Verteidigung gegen NT9. Ohne sie ist jede grüne Parität dieses
Cutovers eine Aussage über eine Datei, nicht über den Betrieb.**

**Handgriff 1 — den Zeitpunkt des Auszugs protokollieren**, in derselben Minute, in der `.backup`
läuft:

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
```

> `<auszug_iso>`: ____________________

**Handgriff 2 — den letzten Schreibzeitpunkt der Quelle ablesen**, unmittelbar danach:

```bash
docker run --rm -v "$VOL":/d alpine stat -c "%n %s %y" /d/data.sqlite
```

> Größe: ________ Bytes · zuletzt geändert: ____________________

**Handgriff 3 — die Zählung aus der laufenden Alt-Anwendung.** ⬜ **Der Ablese-Weg ist eine
Betreiberauskunft und wird nicht erfunden**: welche Fläche der Alt-Oberfläche unter
`radio.iuk-ue.de` die Zahlen zeigt (Gerätebestand, aktive Leihen, abgeschlossene Leihen), weiß nur
der Betreiber. **Wer liest ab: der Betreiber, unmittelbar VOR dem `.backup`, in derselben Sitzung.**

> Geräte laut Alt-Oberfläche: ________ · aktive Leihen: ________ · abgeschlossene Leihen: ________ ·
> abgelesen am ____________________ (UTC) · Fläche/Weg: ____________________

**Die Regel, gegen die alles Weitere gestellt wird:**

* **A1 (unten, gegen die Kopie) muss diese Zahlen ergeben.** Weicht eine ab, ist entweder der
  Schnappschuss veraltet, oder er wurde mit `cp` statt `.backup` gezogen (§L.1) — **beides
  paritätsgrün.**
* **Im Fenster gilt zusätzlich:** der Auszug entsteht **nach** dem Freeze (§C Schritt 1). Der
  Änderungszeitpunkt aus Handgriff 2 muss deshalb **vor** `<freeze_iso>` liegen. ⛔ **Liegt er
  danach, hat der Freeze nicht gegriffen — irgendetwas schreibt noch.** Dann zurück zu §C Schritt 1,
  und nicht weiterimportieren.
* **In der Generalprobe kann NT9 nicht geschlossen werden**, und das ist keine Nachlässigkeit: es
  gibt dort keinen Freeze, die Quelle läuft weiter, der Schnappschuss ist konstruktionsbedingt schon
  beim Lesen veraltet. **Die Generalprobe prüft die Mechanik dieser Zeile, nicht ihre Aussage.** Der
  scharfe Lauf ist der im Fenster.

> Vorabzählung gegen A1 gestellt? ☐ ja, gleich ☐ **Abweichung** — Zahlen: ____________________

### A1 — Zeilenzahlen je Tabelle · **setzt die Sollwerte**, nicht blockierend

```sql
select 'devices',           count(*) from devices
union all select 'software_versions', count(*) from software_versions
union all select 'api_tokens',        count(*) from api_tokens
union all select 'users',             count(*) from users
union all select 'device_events',     count(*) from device_events
union all select 'loans',             count(*) from loans;
```

**Kein Erwartungswert im Text** — es sind sechs Protokollzeilen. **Fünf** davon sind
Paritäts-Sollwerte; `api_tokens` ist eine reine **Protokollzeile** für den Abbau: die Tabelle
existiert im Ziel **nicht**. Die Textausgabe dazu ist Abfrage **T** in §5.2.

> devices ________ · software_versions ________ · api_tokens ________ · users ________ ·
> device_events ________ · loans ________ · abgelesen am ____________

⛔ Fehlt eine der sechs Tabellen (`no such table`), ist der Snapshot **vorbaselinig** — dann ist die
falsche Datei kopiert worden: **Abbruch und neuer Auszug.**

⛔ Weicht eine Zahl von dem ab, was die Alt-Oberfläche zeigt (§V.0): **WAL nicht mitgenommen** —
`.backup` benutzen, nicht `cp` (§L.1). **Oder der Schnappschuss ist veraltet (NT9).**

### A2 — genau ein Update-Ziel ⛔ **blockierend**

```sql
select count(*) from software_versions where is_target = 1;
```

**MUSS genau `1` sein.** > Ergebnis: ________

Der Update-Stand ist **berechnet, nicht gespeichert** (`radio-admin@265abd5
server/src/db/schema.ts:53-56`), und es gibt keinen DB-Constraint dafür: kein partieller Unique, kein
Trigger, kein CHECK. Die Invariante lebt allein in einer Anwendungstransaktion
(`server/src/repos/softwareVersionRepo.ts:77-89`), und der Leser `getTargetVersion` (`:63-71`) nimmt
`.limit(1).get()` **ohne `ORDER BY`**. Bei `0` oder `2` kippt der angezeigte Update-Status **jedes**
Geräts, und **keine Parität sieht es**.

**Befund ≠ 1:** 🧹 **bereinigen, protokolliert.** Der Betreiber benennt die Zielversion, dann
`update software_versions set is_target = 0;` und `= 1` für die eine — **in der Snapshot-Kopie**, nie
in der laufenden Alt-Datenbank. Das ausgeführte SQL geht wörtlich ins Protokoll.

> Bereinigt? ☐ nein ☐ ja, ausgeführtes SQL: ____________________ · Zielversion laut Betreiber: ________

### A3 — Waisen in `device_events` ⛔ **blockierend**

```sql
select count(*) from device_events e
  left join devices d on d.id = e.device_id
 where d.id is null;
```

**MUSS `0` sein.** > Ergebnis: ________

`foreign_keys = ON` gilt auf **beiden** Seiten (`radio-admin@265abd5 server/src/db/index.ts:28`,
`src/core/db/index.ts:19`), und `device_events.device_id → devices.id ON DELETE CASCADE` ist die
einzige `FOREIGN KEY`-Zeile aller fünf Alt-Migrationen (`server/src/db/schema.ts:88-90`).

**Befund > 0:** 🧹 **bereinigen, protokolliert**, in der Kopie:
`delete from device_events where device_id not in (select id from devices);`, Anzahl ins Protokoll.
Ohne Bereinigung bricht der Import **hart** ab — laut, aber ein verbrannter Schritt im Fenster.

> Bereinigt? ☐ nein ☐ ja, ________ Zeilen gelöscht

### A4 — zwei aktive Leihen auf einem Gerät ⛔ **blockierend**

```sql
select device_id, count(*) from loans
 where returned_at is null group by device_id having count(*) > 1;
```

**MUSS leer sein.** > Ergebnis: ________ Zeilen

Sonst lässt sich `loans_device_active_uidx` im Ziel nicht anlegen — der **partielle** Unique-Index
`ON loans (device_id) WHERE returned_at IS NULL`, den `drizzle-kit` nicht emittieren kann und der in
`src/app/m/radio/_db/migrations/0001_loans_aktiv_uidx.sql` handgeschrieben steht.

**Befund nicht leer:** ⛔ **abbrechen bzw. Betreiberentscheid — und deshalb in der GENERALPROBE
finden.** Welche der zwei Leihen die echte ist, ist eine **fachliche** Frage über ein Gerät im
Umlauf, kein mechanischer Fix. ⚠️ Wer den Index daraufhin „weglässt", hat die Invariante **still**
abgeschafft — und der Bestand erfüllt sie ja, also merkt es niemand, bis der Kiosk ein Gerät zweimal
ausleiht.

### A5 — der `source`-Wertesatz ⛔ **blockierend**

```sql
select distinct source from device_events
 where source not in ('manual','csv-import','create','update-note');
```

**MUSS leer sein.** Äquivalent, zur Sichtprüfung des ganzen Wertesatzes:

```sql
select distinct source from device_events;
```

**Ergebnis MUSS eine Teilmenge von `{manual, csv-import, create, update-note}` sein.**

> Gefundene Werte, wörtlich: ____________________

Das Enum steht **nur im Quelltext** (`server/src/db/schema.ts:96`); in SQL ist die Spalte
`source text NOT NULL` und die Datenbank akzeptiert **jeden** String. `toNeuesGeraeteEreignis`
**wirft** bei allem anderen. **Prüfen, nicht annehmen.**

**Befund unbekannter Wert:** ⛔ **abbrechen / eskalieren.** Den bekannten Wertesatz zu erweitern ist
eine **Änderung an Spec 1** (§2.2.4 plus der erschöpfende Switch der Oberfläche), keine
Fensterentscheidung.

### A6 — die Größenordnung der Zeitstempel ⛔ **blockierend**

```sql
select min(created_at), max(created_at), length(cast(max(created_at) as text)) from devices;
```

**DREIZEHNSTELLIG = Millisekunden.** > min ________ · max ________ · Stellen ________

**Befund zehnstellig:** ⛔ **Cutover ABSAGEN, nicht anpassen.** Dann ist die gesamte Import-Annahme
falsch, und kein Handgriff am Abend behebt das.

### A7 — Trigger und Views in der Prod-Datenbank ⛔ **blockierend**

```sql
select type, name, sql from sqlite_master where type in ('trigger','view');
```

**MUSS leer sein.** > Ergebnis: ________ Zeilen

Der Grep-Beleg „null Trigger, null CHECKs" gilt für den **Quelltext**, nicht für die laufende
Datenbank (`docs/radio-portierung-analyse.md:2038-2040`). **Ein Treffer ist Fachlogik, die kein Repo
kennt** — sie muss gelesen und bewertet werden, bevor irgendetwas importiert wird. Wandert ihre
Wirkung nicht mit, vermisst sie niemand: das Ziel ist konsistent, nur anders.

### A8 — die Retention-**Vorhersage** · protokollpflichtig

```sql
select count(*) from loans
 where returned_at is not null
   and returned_at < (strftime('%s','now','-2 months') * 1000);
```

> Ergebnis: ________ Zeilen · gezählt am ____________ · **Beschriftung im Protokoll: VORHERSAGE**

⚠️ **Der Faktor 1000 steht hier absichtlich im SQL:** die Alt-Spalte ist Millisekunden,
`strftime('%s')` liefert Sekunden. Wer ihn weglässt, zählt **alle** zurückgegebenen Leihen und hält
das für eine bestätigte Schätzung.

Diese Zahl ersetzt die Betreiber-**Schätzung** „< 100" durch eine **Zählung**. Sie wird im echten
Fenster **erneut** gezählt, weil ihr Cutoff mit `now` wandert.

⛔ **Sie ist NICHT Abfrage R.** A8 ist eine Vorhersage („wie viele Zeilen nimmt der erste Purge?"),
R ist ein Vergleich Quelle↔Ziel mit `<freeze_iso>` in **beiden** Armen. Wer sie verwechselt,
vergleicht zwei `now`-Auswertungen, die Minuten auseinanderliegen — und eine Leihe genau auf der
Zwei-Monats-Grenze wechselt in diesen Minuten die Seite. Die Erwartung „dieselbe Zahl wie vorhin" ist
dann **rot ohne Fehler**, und der Handgriff daneben lautet „Import verwerfen, `radio.db` löschen,
Mapper korrigieren".

**Befund deutlich über der Schätzung:** ✅ **mitnehmen — es ist keine Abweichung, sondern die
Zählung.** Wer sie als „zu hoch" behandelt und die Retention abschaltet, schaltet die
DSGVO-Begründung für `borrower_name` ab.

### A9 — `dev-user` in den Auditspalten · protokollpflichtig, **beantwortet U7**

```sql
select sub from users;
select distinct created_by from devices;
```

> `sub`-Werte: ____________________ · `created_by`-Werte: ____________________

Ein `dev-user` unter den Auditspalten heißt: `AUTH_DEV_BYPASS` war irgendwann aktiv, und die
Zuordnung von Journalzeilen zu Personen ist an diesen Stellen keine.

**Befund `dev-user`:** ✅ **mitnehmen und im Ziel tolerieren.** Eine Zuschreibungslücke ist kein
Datenfehler; ein „bereinigter" Audit-Eintrag wäre eine **Fälschung**. Nicht protokolliert wirkt es
später wie ein Importfehler.

⛔ **Nach dem gelöschten Volume ist diese Frage nicht mehr stellbar** (Risiko R5). Sie wird in §5.2
als Abfrage 8 wiederholt — das ist die **letzte** Gelegenheit.

### A10 — der Spannen-Riegel über alle **zehn** Zeitstempelspalten ⛔ **blockierend**

`msZuDatum` **wirft** bei jedem Wert außerhalb `[1e12, 4e12]`. Also muss der Riegel **vor** dem
Fenster feuern, nicht darin — und A6 sieht nur die Spanne **einer** Spalte.

**Zehn Spalten in epoch-Millisekunden** (neun Zeitstempel + `devices.last_updated_at`), nicht elf —
die Abfrage führt zehn Summanden, und der Kopf zählt sie mit.

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

**MUSS `0` ergeben.** > Ergebnis: ________

**Befund ≠ 0:** ⛔ **abbrechen**, dann **denselben Ausdruck spaltenweise** nachfahren — sonst weiß man
nur „irgendwo eine". Erst danach der Entscheid: Einzelzeile in der Kopie bereinigen (protokolliert)
oder absagen.

> Spaltenweise nachgefahren? ☐ ja · betroffene Spalte(n): ____________________ ·
> betroffene `id`(s): ____________________

### A11 — `typeof()` je Zeitstempelspalte ⛛ **Ergänzung**, ⛔ **blockierend**

SQLite erzwingt Spaltentypen nicht — die Deklaration `integer` ist eine **Affinität**, kein
Constraint. **A11 und A10 prüfen disjunkte Fehlerklassen:** A10 die **Größenordnung**, A11 die
**Speicherklasse**.

| Speicherklasse | sieht A10? | warum |
|---|---|---|
| `'real'` (z. B. `1.771e12`) | ⛔ **nein** | Der Wert liegt **in** der Spanne, A10 ist grün. `Number.isInteger` ist `false`, `msZuDatum` wirft. **Dafür ist A11 gebaut** |
| `'null'` in einer NOT-NULL-Spalte | ⛔ **nein** | `NULL NOT BETWEEN …` ergibt `NULL`, nicht `1` — die Zeile wird von A10 **nicht** gezählt |
| `'text'`, nicht numerisch | ja | Speicherklassenordnung: TEXT > INTEGER. A10 meldet aber nur „irgendwo eine"; A11 nennt Spalte **und** Klasse |
| `'text'`, numerisch (`'1771000000000'`) | entfällt | Integer-Affinität wandelt beim Schreiben in `'integer'` um |

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

**Erwartetes Ergebnis, ausgeschrieben — sonst „findet" diese Abfrage jedes Mal etwas und wird jedes
Mal durchgewunken:**

* **Zehn Beschriftungsgruppen in der Ausgabe.** ⚠️ Jedes Glied hat ein `group by 2` — eine **leere
  Tabelle liefert gar keine Zeile**, nicht `count = 0`. **Weniger als zehn Beschriftungen ist selbst
  ein Befund** und **vor** dem Lesen der Klassen gegen A1 abzugleichen.
* `'integer'` für alle zehn Spalten.
* **`'null'` ist zusätzlich erwartet und richtig** für die **zwei** nullable Spalten
  `devices.last_updated_at` und `loans.returned_at`. ⚠️ `'null'` bei einer der **acht**
  NOT-NULL-Spalten ist dagegen ein Befund: ⛔ **abbrechen / eskalieren** — ein toleranter Mapper macht
  daraus 1970, und der Purge löscht die Zeile.
* **`'text'` oder `'real'` ist immer ein Befund**: ⛔ **abbrechen**, Einzelzeile nach Sichtprüfung in
  der Kopie bereinigen (`cast`), protokolliert. `'real'` ist der leise Fall: **A10 ist dafür grün.**

> Beschriftungsgruppen gezählt: ________ (Erwartung 10) · Abweichende Klassen: ____________________

### A12 — Leihen ohne Gerät ⛛ **Ergänzung**, protokollpflichtig

```sql
select case when l.returned_at is null then 'AKTIV' else 'abgeschlossen' end as art,
       count(*)
  from loans l left join devices d on d.id = l.device_id
 where d.id is null
 group by 1;
```

> abgeschlossen: ________ · AKTIV: ________

`loans.device_id` trägt **absichtlich keinen** Fremdschlüssel, und der Quelltext begründet es wörtlich
(`server/src/db/schema.ts:106-110`): zurückgegebene Leihen sind Historie und müssen eine spätere
Gerätelöschung überleben; die historische Richtigkeit trägt der unveränderliche
`snapshot_*`-Dreisatz, nicht ein lebender Join. Im Ziel bleibt es so. **Eine Waise ist hier legal —
auf beiden Seiten.**

Die Gabel:

* **`abgeschlossen` > 0** → ✅ **mitnehmen und im Ziel tolerieren.** Protokollzeile, keine
  Bereinigung. ⚠️ Und ausdrücklich: **keinen Fremdschlüssel „der Ordnung wegen" nachziehen** — mit
  `CASCADE` löscht die erste Ausmusterung die Historie, mit `RESTRICT` blockiert jede alte Rückgabe
  das Ausmustern, und beides ist gültiges Drizzle, gültiges SQL und **paritätsgrün**.
* **`AKTIV` > 0** → ⚠️ **mitnehmen, als benannten Restposten protokollieren, und dem Betreiber
  VORLEGEN.** Eine aktive Leihe auf einem nicht existierenden Gerät ist im Betrieb **nicht
  zurückgebbar**: die Rückgabe geht über den Gerätebestand.

> Dem Betreiber vorgelegt am ____________ · Entscheid: ____________________

### A13 — `returned_at` vor `borrowed_at` ⛛ **Ergänzung**, protokollpflichtig

```sql
select count(*) from loans
 where returned_at is not null and returned_at < borrowed_at;
```

> Ergebnis: ________

Diese Abfrage findet, was A10 und A11 **nicht** finden können: eine **zeilenweise Vertauschung** der
zwei Zeitstempel ist größenordnungsrichtig, speicherklassenrichtig und damit unter A10 wie A11 grün.
Serverseitig ist die Reihenfolge nirgends geschützt — `radio-admin@265abd5 shared/src/schemas.ts:29`,
`:61`, `:87` typisieren `z.number().int().nullable()` ohne `min`/`max`, kein CHECK, kein Trigger.

Die Gabel:

* **Zahl > 0, und keine dieser Zeilen fällt in A10 auf** → ✅ **mitnehmen und tolerieren**, Zahl ins
  Protokoll. Das Zielschema verlangt die Ordnung ebenso wenig, eine „Korrektur" wäre eine erfundene
  Fachentscheidung über fremde Daten, und die betroffene Leihe ist abgeschlossen.
* **Dieselbe Zeile fällt zusätzlich in A10 auf** → ⛔. Dann ist es kein Datenfehler von 2024, sondern
  ein Hinweis darauf, dass **der Snapshot beschädigt** ist. Neuer Auszug, dann A1 und A10 erneut.

> `id`s der Treffer: ____________________ · davon in A10 aufgefallen: ____________________

---

## §S — Die Feldstichproben

**Quellarm: der Befehl aus §L.1. Zielarm: der Befehl aus §L.2, mit der Lesart aus §L.3.**
Wer hier einen eigenen Befehl baut, baut den, den niemand gegengelesen hat.

**Warum es diesen Abschnitt gibt.** Die Parität vergleicht **Multimengen von Zeilen-Hashes**
(`scripts/import/parity.ts:43-56`, `source.length === target.length` in `:50`). Beide Arme laufen
durch **dieselbe** Sicht und damit durch **denselben** Mapper — die rohe Alt-Ganzzahl betritt den
Vergleich nie. Was die Parität deshalb **strukturell nicht sehen kann**:

| Fehlerklasse | sieht die Parität? |
|---|---|
| Zeile fehlt / zu viel | **ja** (`parity.ts:50`) |
| Wert auf dem Schreibweg verändert | **ja** |
| **Faktor 1000** (ms als Sekunden gelesen) | ⛔ **nein** — ein Fehler in `msZuDatum` wirkt auf beiden Armen |
| **Zwei Spalten vertauscht** (`issi`↔`tei`) | ⛔ **nein** — der Mapper vertauscht sie beidseitig |
| Spalte gar nicht in der Sicht | ⛔ **nein** — sie geht in keinen Hash ein |
| Fachliche Invariante verletzt (`is_target` zweimal) | ⛔ **nein** — 1:1 übernommen ist 1:1 grün |
| **Veralteter Schnappschuss** (NT9) | ⛔ **nein** — beide Arme stammen aus demselben Objekt; dagegen steht allein §V.0 |

⚠️ **Ein roter Paritätscheck heißt NICHT „es ist nichts passiert."** Die Parität läuft **nach** dem
Schreibvorgang (`scripts/import/radio.ts:627-645`). Der Rückweg nach einem roten Check ist die
**gelöschte, leere Ziel-DB** und ein neuer Lauf, nicht ein zweiter Versuch auf demselben Bestand. Der
Schritt heißt **„`radio.db` löschen, dann importieren"**, nicht „importieren".

### §S.1 — Welche Zeile man wählt, und warum nicht die nächste

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

> gewählte `id`: ____________________ · `gesetzt` = ________

**Regel 2 — dazu die älteste Zeile.**

```sql
select id, created_at from devices order by created_at asc limit 1;
```

Sie ist **nicht** redundant zu Regel 1: `tei` kam erst mit Migration `0004`, `update_note` mit
`0001`. Die älteste Zeile ist die einzige, die den **Backfill- und NULL-Weg** durchläuft, den jüngere
Zeilen immer gefüllt haben.

> gewählte `id`: ____________________

**Regel 3 — je verwechselbarem Paar eine Zeile, in der die Glieder VERSCHIEDEN sind.** Es sind
**fünf** Paare bzw. Tripel, nicht vier:

| # | Paar / Tripel | Auswahl-SQL | gewählte `id` |
|---|---|---|---|
| 1 | `issi` ↔ `tei` | `select id, issi, tei from devices where tei is not null and tei <> issi limit 1;` | ________ |
| 2 | `created_at` ↔ `updated_at` ↔ `last_updated_at` | `select id, created_at, updated_at, last_updated_at from devices where updated_at <> created_at and last_updated_at is not null limit 1;` | ________ |
| 3 | `snapshot_call_sign` ↔ `borrower_name` | `select id, snapshot_call_sign, borrower_name from loans where borrower_name <> snapshot_call_sign limit 1;` | ________ |
| 4 | `alamos_integrated` ↔ `loanable` | `select id, alamos_integrated, loanable from devices where alamos_integrated <> loanable limit 1;` | ________ |
| 5 | `serial_number` ↔ `hiorg_id` ↔ `opta` | `select id, serial_number, hiorg_id, opta from devices where serial_number is not null and hiorg_id is not null and opta is not null and serial_number <> hiorg_id and hiorg_id <> opta limit 1;` | ________ |

⚠️ **Liefert eine dieser Abfragen keine Zeile, ist das ein Protokolleintrag, kein Freibrief.** „Kein
Gerät hat `alamos_integrated <> loanable`" heißt: die Vertauschung dieser zwei 0/1-Ganzzahlen ist an
den Produktionsdaten **nicht prüfbar**, und das Tor bleibt allein der Unit-Test. Das muss dastehen,
sonst hält jemand später eine ungeprüfte Zusage für geprüft.

> Ohne Treffer geblieben: Paar Nr. ________ · notiert am ____________

**Regel 4 — je Tabelle mindestens eine Zeile, und diese hier zwingend:**

| Tabelle | Pflicht-Stichprobe | Grund |
|---|---|---|
| `devices` | Regel-1-Zeile + älteste Zeile + die fünf Paar-Zeilen | 25 Spalten, alle Verwechslungspaare liegen hier |
| `software_versions` | **die Zeile mit `is_target = 1`**, zwingend | Der Update-Stand ist berechnet, nicht gespeichert. Kippt diese eine Zeile, kippt der Status **jedes** Geräts |
| `users` | die Zeile mit dem größten `last_seen_at` **und** eine mit dem kleinsten | 3 Spalten; `sub` ist Primärschlüssel und steht in sechs Auditspalten — ein verändertes `sub` entkoppelt das Journal von Personen |
| `device_events` | **eine Zeile je vorkommendem `source`-Wert** (`select source, min(id) from device_events group by source;`) | `source` ist ein TS-Enum **ohne** DB-CHECK (`schema.ts:96`) |
| `loans` | eine **abgeschlossene** (`returned_at is not null`) **und** eine **aktive** (`returned_at is null`) | Die zwei Fälle verhalten sich unter dem Faktor-1000-Fehler **gegensätzlich** (§S.3) |

### §S.2 — Der Zielarm braucht keine übersetzte Spaltenliste

**Die SQL-Spaltennamen sind auf beiden Armen zeichengleich.** Spec 1 §2.5.1–§2.5.5 deklariert sie mit
denselben snake_case-Zeichenketten wie die Quelle (`text("snapshot_call_sign")`,
`integer("borrowed_at", { mode: "timestamp" })`). **Dieselbe Abfrage läuft auf beiden Armen.**

⚠️ **Warum das ausdrücklich dastehen muss:** eine Spaltenliste von Hand nach camelCase zu übersetzen
ist selbst eine Vertauschungsgelegenheit — in genau der Prüfung, die Vertauschungen fangen soll. Wer
auf dem Zielarm `snapshotCallSign` schreibt, bekommt `no such column` (laut, harmlos); wer zwei Namen
dabei vertauscht, bekommt eine **grüne Stichprobe** (still, teuer).

```sql
-- (1) identisch auf BEIDEN Armen — Paare 1, 4 und 5:
select id, issi, tei, serial_number, hiorg_id, opta, alamos_integrated, loanable
  from devices where id = '<id>';

-- (2) identisch auf BEIDEN Armen — Paar 3:
select id, device_id, snapshot_call_sign, snapshot_serial_number, snapshot_device_type,
       borrower_name, borrowed_at, returned_at, return_note, created_at, updated_at
  from loans where id = '<id>';

-- (3) DIESELBE SPALTENLISTE auf beiden Armen, aber ASYMMETRISCH IN DEN EINHEITEN — Paar 2:
select id, created_at, updated_at, last_updated_at
  from devices where id = '<id>';
```

⚠️ **Abfrage (3) ist die Ausnahme, und sie ist benannt.** Die zwei zuvor genannten symmetrischen
Abfragen enthalten die Glieder des zweiten Tripels **nicht** — Abfrage (1) führt keine Zeitspalte,
Abfrage (2) keine `devices`-Spalte. Ohne (3) hätte das Tripel
`created_at ↔ updated_at ↔ last_updated_at` **keinen** Zielarm-Handgriff, obwohl Regel 3 für jedes
Paar eine Produktionsbestätigung verlangt. Die Asymmetrie:

| Spalte | Quelle | Ziel | Protokollform |
|---|---|---|---|
| `created_at` | epoch-**ms** | Unix-**Sekunden** | `rechnung = quelle_ms / 1000 == ziel_s` |
| `updated_at` | epoch-**ms** | Unix-**Sekunden** | `rechnung = quelle_ms / 1000 == ziel_s` |
| `last_updated_at` | epoch-**ms** | **TEXT** `YYYY-MM-DD` | Sollwertregel aus §S.4 — **keine** Rechnung |

**Genau zwei Spalten weichen von der Symmetrie ab, und beide sind benannt:**

* `devices.last_updated_at` — Typ geändert (`integer` ms → TEXT `YYYY-MM-DD`), §S.4.
* `loans.zugangscode_id` — im Ziel **neu** und in der Quelle nicht vorhanden. Eigene Protokollzeile,
  **nur auf dem Zielarm**:

```sql
select count(*) from loans where zugangscode_id is not null;
```

**MUSS `0` sein.** > Ergebnis: ________

⛔ Ein Wert ≠ NULL hieße, dass zwischen Import und Prüfung schon **über die Suite** ausgeliehen wurde
— im Fenster ein **Alarm**, kein Datenbefund.

### §S.3 — Die Zeitstempel-Stichprobe

⚠️ **Der Fehlgriff, der diese Stichprobe wertlos macht:** die Zeile, die ein Mensch in der
Alt-Oberfläche zuerst sieht, ist eine **AKTIVE** Leihe — und deren `returned_at` ist `NULL`. `NULL`
ist auf beiden Armen `NULL`, unter jeder Lesart, bei jedem Faktor. Eine Stichprobe auf einer aktiven
Leihe ist **vakuös** und prüft ausgerechnet das Feld nicht, das der Fehler zerstört. Dass aktive
Leihen den Purge überleben, verstärkt den Irrtum: nach dem Löschlauf sieht der Kiosk „richtig" aus,
weil das, was er anzeigt, das Überlebende ist.

⛔ **Verbindlich: die Zeitstempel-Stichprobe kommt aus `returned_at IS NOT NULL`.** Die aktive Leihe
wird zusätzlich gezogen (§S.1 Regel 4), aber für `borrowed_at` und `created_at`.

#### Wert 1 — der diskriminierende: die JÜNGSTE abgeschlossene Leihe

```sql
-- QUELLE (Snapshot-Kopie)
select id, borrowed_at, returned_at,
       datetime(returned_at/1000, 'unixepoch') as gelesen_als_ms,
       datetime(returned_at,      'unixepoch') as gelesen_als_s
  from loans
 where returned_at is not null
 order by returned_at desc
 limit 1;
```

**Beide Lesarten stehen absichtlich nebeneinander in derselben Ausgabe.** Die Erwartung,
ausgeschrieben:

| Spalte | Erwartung | Was eine Abweichung heißt |
|---|---|---|
| `gelesen_als_ms` | ein Datum **aus der Betriebszeit von `radio-admin`** | Liegt es weit davor oder danach, ist die Quelle beschädigt — Abgleich mit A6 |
| `gelesen_als_s` | ⚠️ **LEER / NULL** — der rohe Millisekundenwert liegt außerhalb des SQLite-Kalenderbereichs (Jahr ~57000). **Eine leere Zelle ist hier das ERWARTETE Ergebnis, nicht eine kaputte Abfrage** | ⛔ Ein **nicht** leeres `gelesen_als_s` heißt: der Quellwert ist **kein** Millisekundenwert. Dann ist die Grundannahme des ganzen Imports falsch, und der Cutover wird **abgesagt, nicht angepasst** (dieselbe Konsequenz wie bei A6) |

⛔ **Die ältere Formulierung „`gelesen_als_s` muss 1970 zeigen" ist gestrichen** (Spec 2 §2.3.1/§2.3.2).
Sie beschreibt den **Zielwert** nach einem Faktor-1000-Fehler, und dafür gibt es Abfrage Z in §5.2
(untere Grenze `< 946684800`). Wer die 1970-Erwartung hier stehen lässt, bekommt eine leere Zelle
vorgesetzt, liest sie um 23 Uhr als „Abfrage kaputt" und streicht die Spalte — dann ist die
Stichprobe auf **eine** Lesart reduziert.

```sql
-- ZIEL: derselbe Datensatz, roh.
select id, borrowed_at, returned_at,
       datetime(returned_at, 'unixepoch') as gelesen_als_s
  from loans where id = '<id aus dem Quellarm>';
```

Auf dem **Zielarm** gilt die umgekehrte Erwartung: `gelesen_als_s` **ist gefüllt** und zeigt dasselbe
Datum wie `gelesen_als_ms` im Quellarm.

```
loans/returned_at  id=<id>
  quelle_ms  = ________            gelesen_als_ms = ________ (Betriebszeit)
                                   gelesen_als_s  = ________ (ERWARTET: leer)
  ziel_s     = ________            gelesen_als_s  = ________ (ERWARTET: dasselbe Datum)
  rechnung   = quelle_ms / 1000 == ziel_s   →  ☐ ok  ☐ ABWEICHUNG
  Jahr im Ziel = ________          ⛔ 1970 heisst: Faktor-1000-Fehler, ABBRUCH
```

**Warum die jüngste und nicht irgendeine:** sie ist die eine Zeile, die der Retention-Purge
**garantiert nicht** anfassen darf. Fällt sie nach dem ersten Purge-Lauf weg, ist bewiesen, dass
nicht die Retention gelöscht hat, sondern der Faktor.

#### Wert 2 — der, bei dem die ms-Lesart plausibel aussieht und trotzdem falsch sein kann

```sql
-- QUELLE: die AELTESTE abgeschlossene Leihe.
select id, returned_at,
       datetime(returned_at/1000, 'unixepoch') as gelesen_als_ms,
       datetime(returned_at,      'unixepoch') as gelesen_als_s
  from loans where returned_at is not null
 order by returned_at asc limit 1;
```

Ein einziger Wert genügt nicht, denn nicht jeder Fehler landet in 1970. `msZuDatum` lässt **jeden**
Wert in `[1e12, 4e12]` durch (`MS_MIN` = 2001-09-09, `MS_MAX` = 2096-10-02). Der Riegel ist absichtlich
weit — und deshalb blind gegen Werte, die **innerhalb** der Spanne falsch sind: ein Wert knapp über
`MS_MIN` ergibt als ms gelesen ~2001, passiert A10, ist **nicht** 1970 und ist für `radio-admin`
fachlich **unmöglich**. Dieselbe Doppeldeutigkeit trägt `users.last_seen_at`.

⚠️ `gelesen_als_s` ist auch hier **leer**, aus demselben Grund wie bei Wert 1. Sie steht dabei, weil
ein **gefülltes** `gelesen_als_s` derselbe Alarm ist.

**Der Vergleich, der Wert 2 prüfbar macht, ist nicht die Lesart, sondern die Alt-Anwendung.** Für
diesen einen Datensatz wird die Leihe in der Alt-Oberfläche unter `radio.iuk-ue.de` aufgeschlagen und
das dort angezeigte Rückgabedatum ins Protokoll geschrieben — das ist der einzige Arm dieses
Cutovers, der überhaupt eine Oberfläche hat.

> Wert 2 · `id`: ____________________ · Alt-Oberfläche zeigt: ____________________ ·
> `gelesen_als_ms`: ____________________ · gleich? ☐ ja ☐ nein

**Wert 1 beweist die Größenordnung ohne Fremdquelle, Wert 2 beweist den Wert gegen die Fremdquelle.**
Wer nur einen von beiden nimmt, hat eine der zwei Fehlerformen ungeprüft.

#### Die Kontrollgruppe für den Retention-Purge — vier Angaben, VOR dem Umschwenk

Der erste Purge-Lauf liegt **1440 Minuten** nach dem Boot (`RADIO_HISTORIE_ERSTLAUF_MINUTEN`,
`src/app/m/radio/_lib/boot.ts:451` — bewusst so lang, dass Verifikation, Stichprobe und „Router
zurück" noch ins Fenster passen). Danach hat `loans` weniger Zeilen. Um „planmäßig gelöscht" von
„Faktor-1000-Fehler" **nach** dem Umschwenk noch unterscheiden zu können, müssen diese vier Angaben
vorher im Protokoll stehen:

| # | Angabe | Befehl | Ergebnis |
|---|---|---|---|
| 1 | abgeschlossene Leihen gesamt | `select count(*) from loans where returned_at is not null;` | ________ |
| 2 | die Retention-Zahl **A8**, beschriftet als **VORHERSAGE** | §V, A8 | ________ |
| 3 | Die `id` **und das rohe** `returned_at` der **jüngsten** abgeschlossenen Leihe | §S.3, Wert 1 | ________ |
| 4 | Die `id` und das rohe `returned_at` der **ältesten** abgeschlossenen Leihe | §S.3, Wert 2 | ________ |

**Mit diesen vier Angaben ist die Nachkontrolle eine Subtraktion:**

* verlorene Zeilen **==** Retention-Zahl → **planmäßig**.
* Zeile 3 fehlt → ⛔ **Faktor-1000**, weil die jüngste abgeschlossene Leihe unter keinem korrekten
  Cutoff löschbar ist.
* `count == 0` → ⛔ **alles gelöscht**, sofortiger Rückweg „Router zurück".

**Ohne die vier Zeilen ist dieselbe Beobachtung nicht deutbar.**

⚠️ Die Retention-Zahl der Generalprobe **veraltet um die Länge der Freeze plus die des Fensters** —
ihr Cutoff wandert mit `now`. Sie wird im echten Fenster **erneut** gezählt. **Für den Vergleich
Quelle↔Ziel gilt dagegen `<freeze_iso>` in beiden Armen** (Abfrage R, §5.2).

#### Die Lesart ist gemessen, nicht erinnert

```bash
sqlite3 :memory: "
select 'ms-lesart', datetime(1741100000000/1000,'unixepoch');
select 'roh-als-s', ifnull(datetime(1741100000000,'unixepoch'),'<LEER>');
select 'sek-als-s', datetime(1741100,'unixepoch');"
```

**Erwartung, zeichengleich** (gemessen am 2026-08-27 mit sqlite3 **3.54.0**):

```
ms-lesart|2025-03-04 14:53:20
roh-als-s|<LEER>
sek-als-s|1970-01-21 03:38:20
```

Kommt beim zweiten etwas anderes heraus, ist die sqlite3-Version eine andere, und die
Erwartungstabelle oben wird **gegen die gemessene Ausgabe** berichtigt, nicht gegen das Gedächtnis.

```bash
sqlite3 --version
```

> sqlite3-Version im Fenster: ____________________

### §S.4 — `devices.last_updated_at`: die einzige Spalte mit Typwechsel

Quelle ist epoch-**ms** (`radio-admin@265abd5 server/src/db/schema.ts:18`), Ziel ist TEXT
`YYYY-MM-DD` **in `Europe/Berlin`** (Spec 1 §2.2.3, über `tagInBerlin`; die Zone steht **in der
Funktion**, nicht in `TZ`). Diese Spalte läuft als einzige **nicht** durch `sekunden()` und bleibt
unumgerechnet (`scripts/import/radio.ts:456-604`).

**⛔ Der Sollwert ist der BERLINER Kalendertag.** `utc_tag` und `utc_tag_plus1` sind ein
**Plausibilitätsrahmen**, keine Alternativen — `sqlite3` kennt `Europe/Berlin` nicht, und `'+1 hour'`
ist über die Sommerzeitgrenze falsch; der erwartete Wert ist also **nicht** per SQL berechenbar. Die
Regel, ausgeschrieben:

| `uhrzeit_utc` der Quellzeile | Sollwert |
|---|---|
| **≥ 22:00** in der **Sommerzeit** (CEST = UTC+2) | `utc_tag_plus1` |
| **≥ 23:00** in der **Winterzeit** (CET = UTC+1) | `utc_tag_plus1` |
| sonst | `utc_tag` |

```sql
-- QUELLE: die zwei moeglichen Kalendertage, nebeneinander.
select id, last_updated_at,
       date(last_updated_at/1000, 'unixepoch')            as utc_tag,
       date(last_updated_at/1000, 'unixepoch', '+1 day')  as utc_tag_plus1,
       time(last_updated_at/1000, 'unixepoch')            as uhrzeit_utc
  from devices where id = '<id>';
```

```sql
-- ZIEL: derselbe Datensatz, der Wert ist TEXT und wird ZEICHENGLEICH verglichen.
select id, last_updated_at from devices where id = '<id>';
```

> `id`: ____________________ · `uhrzeit_utc`: ________ · Jahreszeit: ☐ Sommer ☐ Winter ·
> `utc_tag`: ________ · `utc_tag_plus1`: ________ · **Sollwert nach Regel**: ________ ·
> **Zielwert**: ________ · gleich? ☐ ja ☐ nein

⛔ **Die Alt-Anwendung ist für DIESE Spalte keine zulässige zweite Meinung.** Sie zeigt denselben Wert
je Fläche verschieden: der CSV-Export formatiert den **UTC**-Tag
(`server/src/routes/export.ts:49-51`, `new Date(value).toISOString().slice(0,10)`), die Detailansicht
und das Bearbeitungsformular den **lokalen** Tag (`client/src/utils/format.ts:4`,
`client/src/features/devices/DeviceEditForm.tsx:41`). Die zwei Flächen widersprechen sich bei **genau
den Zeilen**, die der Filter unten auswählt. Wer die Detailansicht öffnet, bekommt den Berliner Tag;
wer den CSV-Export zieht, den UTC-Tag. **Das ist kein Schiedsrichter, das ist eine Münze.**

#### Der Kandidatenfilter — und was seine Leere bedeutet

```sql
-- Die einzige diskriminierende Zeile: 22:00 UTC oder spaeter (Formular-Weg).
select id, last_updated_at, time(last_updated_at/1000,'unixepoch') as uhrzeit_utc
  from devices
 where last_updated_at is not null
   and last_updated_at % 86400000 >= 79200000
 limit 1;
```

⚠️ **Findet dieser Filter keine Zeile, ist `tagInBerlin` an den Produktionsdaten NICHT prüfbar**, und
die Zusage ruht allein auf den drei `tagInBerlin`-Unit-Tests (Spec 1 §2.2.5: Formular-Mitternacht
`2026-08-16T22:00:00Z → 2026-08-17` · CSV-Weg `2026-08-17T00:00:00Z → 2026-08-17` ·
`Date.now()`-Weg `2026-08-17T14:35:00Z → 2026-08-17`). **Das ist eine Protokollzeile, kein grüner
Haken.**

> Filter fand: ☐ eine Zeile, `id` ____________________ ☐ **keine Zeile — Zusage ruht auf den Unit-Tests**

**Warum die Uhrzeit und nicht nur der Tag ins Protokoll gehört:** welcher der drei Alt-Schreibwege
eine Zeile geschrieben hat, steht **nirgends in den Daten** — die Uhrzeit ist der einzige Indikator
(22:00/23:00 = Formular, 00:00 = CSV, sonst Update-Karte). Und der Filter ist ein
**Kandidaten**filter: im Winter liegt lokale Mitternacht bei 23:00 UTC.

#### Die Regel ist gegengerechnet, nicht geglaubt

```bash
sqlite3 :memory: "
-- 2025-08-16T22:00:00Z, Sommerzeit: Berliner Tag ist der 17.
select 'sommer 22:00Z',
       date(1755381600, 'unixepoch')           as utc_tag,
       date(1755381600, 'unixepoch', '+1 day') as utc_tag_plus1,
       time(1755381600, 'unixepoch')           as uhrzeit_utc;
-- 2025-01-16T22:30:00Z, Winterzeit: Berliner Tag ist noch der 16.
select 'winter 22:30Z',
       date(1737066600, 'unixepoch')           as utc_tag,
       date(1737066600, 'unixepoch', '+1 day') as utc_tag_plus1,
       time(1737066600, 'unixepoch')           as uhrzeit_utc;"
```

**Erwartung, zeichengleich** (gemessen am 2026-08-27 mit sqlite3 3.54.0):

```
sommer 22:00Z|2025-08-16|2025-08-17|22:00:00
winter 22:30Z|2025-01-16|2025-01-17|22:30:00
```

Damit ist der Sollwert für die erste Zeile `2025-08-17` (Sommerzeit, ≥ 22:00 → `utc_tag_plus1`) und
für die zweite `2025-01-16` (Winterzeit, Schwelle 23:00 **nicht** erreicht → `utc_tag`). Weicht die
Rechnung ab, wird die Regeltabelle oben gegen die Ausgabe berichtigt.

#### Was diese Stichprobe NICHT beweist

Die **Formatprobe** in Abfrage Z (§5.2, zehnte Zeile:
`last_updated_at not glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`) sagt, dass die Spalte die
**Form** `YYYY-MM-DD` hat. Sie sagt **nichts über die Zone**. Umgekehrt sagt diese Stichprobe etwas
über die Zone, aber nur für **eine** Zeile. **Die Zone in der Breite trägt allein der Unit-Test.**
Beide Stellen verweisen aufeinander, damit niemand die eine für die andere hält.

---

## §Z — Die Gegenzählungen nach dem Import

**Zielarm: der Befehl aus §L.2, mit der Lesart aus §L.3 — ohne `-readonly` (NT8). Kein Browser, keine
Domain.**

Muster `docs/runbooks/lagerbuch-cutover.md:452`, `:544` — **dieselbe Zahl vorher und nachher.**

**Vorbedingung: der Import ist durchgelaufen.** Seine letzte Zeile lautet
`Radio-Import OK — <n> Zeilen, Parität grün.` (`scripts/import/radio.ts:672`). ⚠️ **Grep-Anker sind
`Radio-Import OK` und `Zeilen, Parität grün.`, nie die Zahl** — sie ist am Cutover-Abend eine andere
als in der Abnahme. ⚠️ **Der Gedankenstrich ist ein EM DASH (U+2014), kein Bindestrich**; ein Muster
mit `-` verfehlt die Zeile still.

### §Z.0 — Erst die Datei, dann die Zahlen (NT10)

⛔ **Bevor eine einzige Zahl geglaubt wird, wird bewiesen, dass die gelesene Datei die importierte
ist.** Ohne gesetztes `DATA_DIR` schreibt der Importer nach `./.data/radio.db`, und die Parität ist
trotzdem grün — sie prüft gegen **diese** Datei.

**Im Fenster** (Zielarm aus §L.2, `$VOL_SUITE` zurückzitiert aus §C Schritt 4 Handgriff 1):

```bash
docker run --rm -v "$VOL_SUITE":/data alpine sh -c 'ls -ln /data; stat -c "%n %s %y" /data/radio.db'
```

**In der Generalprobe** (Bind-Pfad, `DATA_DIR=$GP/data`):

```bash
ls -la "$DATA_DIR/radio.db"
stat -c "%n %s %y" "$DATA_DIR/radio.db" 2>/dev/null || stat -f "%N %z %Sm" "$DATA_DIR/radio.db"
```

> Pfad: ____________________ · Größe: ________ Bytes · geändert: ____________________ ·
> liegt der Änderungszeitpunkt **nach** dem Importlauf? ☐ ja ☐ **nein → falsche Datei**

⛔ **Eine Datei von wenigen Kilobyte, ein Änderungszeitpunkt vor dem Import, oder gar keine Datei am
erwarteten Pfad:** dann zählt der nächste Schritt eine Datenbank, die niemand meint. **Nicht
weiterzählen** — erst `DATA_DIR` und den Volume-Namen prüfen, dann `radio.db` löschen und neu
importieren.

### §Z.1 — Fünf Zeilenzahlen, nicht sechs

```sql
-- FUENF Sollwerte gegen A1. `api_tokens` fehlt hier ABSICHTLICH — die Tabelle
-- existiert im Ziel nicht; wer sie mitschreibt, bekommt
-- "Error: no such table: api_tokens" und haelt es fuer einen Fehler.
select 'devices',           count(*) from devices
union all select 'software_versions', count(*) from software_versions
union all select 'users',             count(*) from users
union all select 'device_events',     count(*) from device_events
union all select 'loans',             count(*) from loans;
```

Ausgeschrieben als der Einzeiler, der im Fenster wirklich getippt wird — **ohne `-readonly`, weil die
frisch importierte `radio.db` im WAL-Modus liegt und noch keine `-shm` trägt** (NT8,
`docs/superpowers/berichte/2026-08-21-radio-import-abnahme.md:171-179`):

```bash
sqlite3 "$DATA_DIR/radio.db" "select 'devices', count(*) from devices union all select 'software_versions', count(*) from software_versions union all select 'users', count(*) from users union all select 'device_events', count(*) from device_events union all select 'loans', count(*) from loans;"
```

⚠️ **Diese Host-Form gilt nur in der Generalprobe**, wo `DATA_DIR` ein Bind-Pfad ist. **Im Fenster**
läuft dasselbe SQL über den Containerweg aus §L.2 — der Pfad `$DATA_DIR/radio.db` existiert auf dem
Host nicht.

**Erwartung: fünf Paare gleich — PAARWEISE, nicht in der Summe.**

| Tabelle | Quelle (A1) | Ziel | gleich? |
|---|---|---|---|
| `devices` | ________ | ________ | ☐ |
| `software_versions` | ________ | ________ | ☐ |
| `users` | ________ | ________ | ☐ |
| `device_events` | ________ | ________ | ☐ |
| `loans` | ________ | ________ | ☐ |

⛔ **Eine Abweichung heißt: entweder ist der Import unvollständig, oder die Datei ist eine frisch
angelegte, leere `radio.db`.** `openModuleDatabase` legt Verzeichnis und Datei bei Bedarf an
(`src/core/db/index.ts:12-22`) — `/api/health/radio` wäre dabei **grün**. Deshalb steht §Z.0 davor.

### §Z.2 — Die drei Invarianten, jetzt im ZIEL

```sql
select count(*) from software_versions where is_target = 1;
select count(*) from device_events e left join devices d on d.id = e.device_id where d.id is null;
select device_id, count(*) from loans where returned_at is null group by device_id having count(*) > 1;
```

Erwartung wie **A2 / A3 / A4**: `1` · `0` · leer.

> is_target: ________ · Waisen: ________ · doppelt aktive Leihen: ________ Zeilen

#### §Z.2 (b) — Die zwei Null-Zählungen gegen die Faltung (NT4) — Quelle GEGEN Ziel

⛔ **Diese Probe ist die einzige, die den Fehler noch fangen kann, und sie ist nach dem Import nicht
nachholbar.** `devices.alamos_integrated` und `devices.loanable` sind die zwei **nullable**
`mode: "boolean"`-Spalten des Zielschemas. Ein falsch gefaltetes `false` — aus einem `undefined`, das
`null` hätte bleiben müssen — ist dort **nicht mehr von einem echten `false` zu unterscheiden**
(„Alamos nicht erfasst" wird „nicht integriert"), und es ist **paritätsgrün**, weil beide Arme durch
denselben Mapper laufen.

**Zielarm — GENERALPROBE** (Bind-Pfad, `DATA_DIR=$GP/data`, ohne `-readonly` wegen NT8):

```bash
sqlite3 "$DATA_DIR/radio.db" "select count(*) from devices where loanable is null;"
sqlite3 "$DATA_DIR/radio.db" "select count(*) from devices where alamos_integrated is null;"
```

**Zielarm — FENSTER** (Containerform aus §L.2; den Host-Pfad `$DATA_DIR/radio.db` gibt es dort
**nicht**, und sein `unable to open database file` sähe wie ein Importfehler aus):

```bash
echo "select count(*) from devices where loanable is null;" | docker run --rm -i \
  -v "$VOL_SUITE":/data alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /data/radio.db'
echo "select count(*) from devices where alamos_integrated is null;" | docker run --rm -i \
  -v "$VOL_SUITE":/data alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /data/radio.db'
```

**Quellarm** (Befehl aus §L.1, gegen die Snapshot-Kopie) — **dieselbe Abfrage, weil die Spaltennamen
auf beiden Armen zeichengleich sind** (§S.2):

```bash
sqlite3 -readonly radio-admin-snapshot.sqlite "select count(*) from devices where loanable is null;"
sqlite3 -readonly radio-admin-snapshot.sqlite "select count(*) from devices where alamos_integrated is null;"
```

| Spalte | Quelle | Ziel | Differenz |
|---|---|---|---|
| `loanable is null` | ________ | ________ | ________ |
| `alamos_integrated is null` | ________ | ________ | ________ |

**Beide Differenzen MÜSSEN `0` sein.** ⛔ Eine Differenz ≠ 0 heißt: die Faltung hat `null` zu `false`
gemacht. **Import verwerfen, `radio.db` löschen, Mapper korrigieren** — nicht nachbessern, und nicht
umschwenken.

### §Z.3 — Die Spalte ohne Quelle MUSS leer sein

```sql
select count(*) from loans where zugangscode_id is not null;
```

**MUSS `0` sein.** > Ergebnis: ________
⛔ Ein Wert ≠ 0 heißt, dass über die Suite schon ausgeliehen wurde — im Fenster ein **Alarm**.

### §Z.4 — Der partielle Index MUSS da sein

```sql
select name, sql from sqlite_master
 where type = 'index' and name = 'loans_device_active_uidx';
```

**Erwartung, zeichengleich** — abgelesen aus
`src/app/m/radio/_db/migrations/0001_loans_aktiv_uidx.sql:12`:

```
loans_device_active_uidx|CREATE UNIQUE INDEX `loans_device_active_uidx` ON `loans` (`device_id`) WHERE `returned_at` IS NULL
```

> Ergebnis, wörtlich: ____________________ · zeichengleich? ☐ ja ☐ nein

⚠️ **Die Backticks stehen wirklich so da, und sie sind der Grund für einen falschen Alarm:** eine
Textsuche auf `WHERE returned_at IS NULL` in `sqlite_master.sql` ergibt **0** — gemessen, deshalb
prüft `src/app/m/radio/_db/migrations.test.ts` über `pragma_index_list` statt über Textsuche. **Wer
hier grept statt zu vergleichen, hält einen vorhandenen Index für fehlend.**

⚠️ **Diese Probe ist nicht redundant.** `drizzle-kit` erzeugt partielle Indizes **nicht**, und die
Migrationsdatei sagt es selbst: er ist dem Drizzle-Schema unsichtbar, künftige
`drizzle-kit generate`-Läufe sehen ihn nicht und entfernen ihn nicht. **Fehlt er, ist alles grün** —
Build, Typecheck, Parität, jede Zählung oben — **und die Invariante „höchstens eine aktive Leihe je
Gerät" ist weg.** Sichtbar wird es erst, wenn der Kiosk ein Gerät zum zweiten Mal ausleiht.

### §Z.5 — Die vier Angaben der Retention-Kontrollgruppe, im Ziel

```sql
select count(*) from loans where returned_at is not null;
select id, returned_at, datetime(returned_at,'unixepoch') from loans
 where returned_at is not null order by returned_at desc limit 1;
select id, returned_at, datetime(returned_at,'unixepoch') from loans
 where returned_at is not null order by returned_at asc  limit 1;
```

> gesamt: ________ · jüngste `id`/`returned_at`/Datum: ____________________ ·
> älteste `id`/`returned_at`/Datum: ____________________

⛔ **Ein Datum im Jahr 1970 in einer dieser Zeilen ist der Faktor-1000-Fehler, bewiesen.** Die
**spaltengenaue** Fassung derselben Probe ist **Abfrage Z** (§5.2) — sie sagt, **welche** Spalte
betroffen ist, und sie wird auch hier gefahren.

### §Z.6 — Die zwei Ablesungen aus Bau und Server

**✅ L4 — abgelesen: die Migrationen sind vollständig gefahren.** Muster `lagerbuch-cutover.md:72`.

```sql
select count(*) from __drizzle_migrations;
```

**Erwartung: `2`** — abgelesen am 2026-08-27 gegen eine frische Datenbank
(`drizzle-orm/better-sqlite3/migrator`, Muster `src/app/m/radio/_db/migrations.test.ts:32-38`), und
deckungsgleich mit den zwei Einträgen in `src/app/m/radio/_db/migrations/meta/_journal.json`
(`0000_melodic_eternals`, `0001_loans_aktiv_uidx`). **Eine Migration je Journal-Eintrag, kein Batching
und kein Split.** Die Gegenzählung im Repo:

```bash
rtk grep -c '"idx"' src/app/m/radio/_db/migrations/meta/_journal.json
```

**Erwartung: `2`.**

> `__drizzle_migrations`: ________ · Einträge im Journal: ________ · gleich? ☐ ja ☐ nein

⛔ **Nebenauflage, die um 23 Uhr teuer ist:** der `when`-Wert von `0001_loans_aktiv_uidx` wurde am
2026-08-21 von einem **zukünftigen** Zeitstempel auf `0000` + 1000 ms berichtigt
(`docs/superpowers/berichte/2026-08-21-radio-datenhaltung-ablesungen.md:145-154`). **Diesen Wert am
Cutover-Abend NICHT zurücksetzen und die Datei nicht neu erzeugen** — ein zurückgedrehter `when`
lässt den SQLite-Migrator jede künftige Migration **stillschweigend überspringen**, und ein geänderter
Hash lässt bereits migrierte Datenbanken in eine Absturzschleife laufen.

**L5 — der Healthcheck. Die Feldnamen und die Statuscodes stehen hier, sie sind KEINE Leerstelle
mehr.**

⚠️ **Die Adresse hängt vom Lauf ab — dieselbe Bauform wie die Lauf-Tabelle §L.3.** §Z läuft, wie die
Stichproben, **zweimal, nicht einmal**, und die zwei Läufe fragen **verschiedene Prüfcontainer auf
verschiedenen Ports**. Eine Adresse für beide wäre in einem der beiden Läufe falsch.

| Lauf | Gefragt wird | Befehl |
|---|---|---|
| **Generalprobe** | der ephemere Prüfcontainer aus **§P.8** (`-p 127.0.0.1:3999:3000`) | `curl -si http://127.0.0.1:3999/api/health/radio \| tail -1` |
| **Fenster** | der Prüfcontainer aus **§C Schritt 8** (`-p 127.0.0.1:4000:3000`, Vorbelegung ⬜ L13) | `curl -si http://127.0.0.1:4000/api/health/radio \| tail -1` |

⛔ **`<L13-Port>` in der Generalprobe und `3999` im Fenster sind beide falsch.** `3999` steht in §P.8
ausgeschrieben; das Fenster fährt seit dem 2026-08-27 die **Vorbelegung 4000** — ausgeschrieben in
§C Schritt 8, bewusst verschieden von `3999`, damit eine verwechselte Zeile auffällt statt
stillzuschweigen. ⬜ **L13** bleibt trotzdem eine Zeile des Betreibers, weil **ob 4000 auf diesem
Server frei ist**, nur der Server hergibt: er **bestätigt die Vorbelegung oder ersetzt sie** bei der
Fensterplanung (§A Nr. 12). ⚠️ **Nur der Port ist L13** — der Containername steht in §C Schritt 8
fest (`radio-fenster`) und ist keine Leerstelle.

Die Antwort ist `Response.json({ ...result, revision })`
(`src/app/api/health/[modul]/route.ts:23-26`) mit `result` aus `checkModuleHealth`
(`src/core/health/index.ts:4-16`). Die drei Felder und die zwei Statuscodes:

| Feld / Code | Bedeutung | Beleg |
|---|---|---|
| `module` | der Modulschlüssel, hier `"radio"` | `src/core/health/index.ts:10` |
| `status` | `"ok"` **erst nach** `openModuleDatabase(...)` **und** `db.prepare("SELECT 1").get()`; sonst `"error"` mit `error`-Text | `src/core/health/index.ts:8-9` |
| `revision` | der Commit-SHA des laufenden Stands (`"unbekannt"`, wenn keiner gesetzt ist) | `src/app/api/health/[modul]/route.ts:24` |
| HTTP-Status | **200** bei `status: "ok"`, sonst **503** | `src/app/api/health/[modul]/route.ts:25` |

⬜ **Was hier offen bleibt, ist allein der SOLLWERT von `revision`** — er ist der Commit-SHA des
ersten Deploys und entsteht erst mit ihm. **Wer liest ab: der Betreiber, in §A Nr. 1**, und von dort
wird er abgeschrieben, nicht geraten.

> `module`: ________ · `status`: ________ · HTTP: ________ · `revision`: ____________________ ·
> Sollwert aus §A Nr. 1: ____________________ · gleich? ☐ ja ☐ nein

⛔ **NIE `/api/health`.** `src/app/api/health/route.ts` liefert konstant `{status:"ok"}` **ohne Modul
und ohne Datenbank**. Und Health beweist ohnehin weniger als sein Name: `SELECT 1` auf einer Datei,
die bei Bedarf **neu angelegt** wird. **Deshalb steht die zählende Prüfung §Z.1 NEBEN dem
Healthcheck, nicht an seiner Stelle.** ⚠️ Und der Docker-Healthcheck der Suite prüft
`/api/health/portal` (`compose.yaml:141`) — ein rotes `radio` hält den Container **nicht** auf.

### §Z.7 — Was aus diesem Abschnitt weiterverwendet wird

| Protokollzeile aus §Z | Wird gelesen in |
|---|---|
| Die fünf Paare aus §Z.1 | §5.2 **Abfrage A** — dort als **Abbau-Sperre**: ohne fünf gleiche Paare wird kein Volume gelöscht |
| Die zwei Differenzen aus §Z.2 (b) | §D — die Faltung ist danach nicht mehr nachweisbar |
| `is_target = 1` aus §Z.2 | §5.2 als Ziel-Gegenprobe zu A2 |
| Die vier Angaben aus §Z.5 | §5.2 **Abfrage Z** (spaltengenau) und die Nachkontrolle nach dem ersten Purge |
| `$VOL_SUITE` aus **§C Schritt 4 Handgriff 1** (§L.2 setzt ihn nicht, es zitiert ihn zurück) | §L.2, §V, §S, §Z und §5.2 Abfragen R und Z — **innerhalb des Fensterlaufs dieselbe Protokollzeile, keine zweite Ablesung**. §5.2 liest den Namen Wochen später in einer neuen Shell **erneut** ab; er wird dann gegen diese Zeile **gegengelesen** |
| `<freeze_iso>` aus §C Schritt 1 | §5.2 **Abfrage R**, in **beiden** Armen |
| `<auszug_iso>` und die Vorabzählung aus §V.0 | §5.2 — der Beleg, dass die Parität gegen einen **frischen** Stand lief (NT9) |

⛔ **`$VOL_SUITE` wird einmal je LAUF abgelesen und innerhalb dieses Laufs mehrfach gelesen — nicht
einmal im ganzen Dokument.** Der Fensterlauf liest ihn **einmal**, in §C Schritt 4 Handgriff 1; jede
weitere Stelle desselben Laufs (§L.2, §V, §S, §Z) zitiert diese Protokollzeile zurück. Wer
**innerhalb des Fensters** ein zweites Mal abliest, kann eine andere Datei erwischen als die, über
die §Z.1 geurteilt hat.

⚠️ **§5.2 ist kein Verstoß dagegen, sondern die Ausnahme mit Grund:** die Abbau-Sitzung läuft
frühestens vierzehn Tage später in einer **neuen Shell**, in der die Zuweisung von damals längst weg
ist; eine ungesetzte Variable läse ein leeres Volume, und dessen Nullen sähen aus wie ein
Datenbefund. §5.2 liest deshalb **erneut** ab und liest das Ergebnis gegen die Protokollzeile aus §C
Schritt 4 Handgriff 1 **gegen** — zwei verschiedene Namen sind dort ein **Stopp-Punkt**. Damit gibt
es im Runbook genau **zwei** Setzstellen für `$VOL_SUITE`.

---

## §P — Generalprobe

⚠️ **Die Generalprobe ist der EINZIGE Weg, vor dem Umschwenk überhaupt etwas zu prüfen.** Es gibt
**kein Parallelfenster**: der Alt-Kiosk (`radio-inventar`) läuft **schon heute** unter
`radio.iuk-ue.de`, und zwei Router auf derselben Domain sind hier keine Vorsichtsregel, sondern eine
physische Grenze (Kopfabschnitt, Punkt 1). Alles, was dieser Abschnitt prüft, wird gegen einen
**ephemeren Container ohne Traefik-Labels** und gegen ein **Wegwerf-Verzeichnis** geprüft — nicht
gegen die Endadresse. Was dabei **nicht** prüfbar ist, steht vollständig in **§P.14**, damit niemand
eine Lücke für eine Zusage hält.

⛔ **Es gibt keinen Cutover auf einer roten Generalprobe** (§P.13). Und: eine Bereinigung, die in der
Probe stattfand, wird im Fenster **wiederholt, nicht vererbt** — sie geschah in einer Kopie, die es
im Fenster nicht mehr gibt.

### §P.0 — Eingaben und Ablesungen der Generalprobe

**Vor dem ersten Generalprobenlauf ausfüllen.** Jede Zeile ist ein **Wert**, keine Frage — solange
hier ein Feld leer ist, beginnt der Lauf nicht, dem es fehlt. **Betriebswerte werden nicht erfunden**:
ein Platzhalter aus einer anderen Maschine ist kein Wert.

⚠️ **Diese Tabelle ist die Lauf-Tabelle der PROBE, nicht die des Fensters.** Die Fenster-Eingaben
stehen in **§0** und werden hier nur dort zitiert, wo die Probe sie wirklich braucht (E2, N3).

| # | Wert | Eingetragen | Wer liest ab, und wann | Ohne ihn |
|---|---|---|---|---|
| `$IMG` | Image-Referenz der Suite, mit der geprobt wird (`ghcr.io/rubenvitt/iuk-suite:latest` oder ein Digest) | | **Betreiber**, bei der Terminierung der Probe | Die Probe läuft gegen ein anderes Image als der Cutover — V3 vergleicht dann zwei Revisionen, die nichts miteinander zu tun haben |
| `$GP` | Pfad des Wegwerf-Verzeichnisses auf dem Host (Vorschlag `$HOME/gp-radio`) | | **Betreiber am Server**, vor §P.4 | Der Import landet in `./.data/radio.db` und meldet Parität grün, ohne dass irgendetwas migriert wurde (NT10, `src/core/db/index.ts:12-22`) |
| `$UID_APP` / `$GID_APP` | Numerische Kennung **aus dem Image** | / | wird in **§P.4 Handgriff 0** selbst gemessen — keine Vorab-Eingabe | Der Import schreibt `radio.db` als root, und die Migrationen beim Boot scheitern mit `SQLITE_CANTOPEN` |
| ⬜ **N3** | Numerische Kennung, unter der der **produktive** Dienst läuft (`SUITE_USER` in der Server-`.env`; `compose.yaml:62` = `user: ${SUITE_USER:-1001:1001}`) | | **Betreiber am Server**, ⚠️ **vor der Probe** — dieselbe Zeile wie ⬜ N3 in **§0** | Die Probe läuft unter einer anderen Kennung als die Produktion, und ein Rechteproblem des Fensters kann in der Probe **nicht** auftreten |
| **E2** | Echter Volume-Name von `radio-admin` | | **Betreiber am Server**, vor §P.2 — dieselbe Zeile wie **E2** in §0 | Ein erfundener Name legt ein **neues, leeres** Volume an; `sqlite3` liefert dann null Zeilen **ohne Fehler** |
| **E3** | Volume-Name und `POSTGRES_USER` von `radio-inventar` | | **Betreiber am Server**, vor §P.12 | Die zweite Hälfte von **U8** bleibt ungemessen (§P.12) |
| ✅ **L4** | Zahl der Einträge in `src/app/m/radio/_db/migrations/meta/_journal.json` | **2** — `0000_melodic_eternals`, `0001_loans_aktiv_uidx`; abgelesen am 2026-08-27, ausführlich in **§Z.6** | **nichts mehr zu tun** | — (eingelöst) |
| ✅ **L6** | Wortlaut der Abschlusszeile von `scripts/import/radio.ts` **und** der Exit-Code | `Radio-Import OK — <n> Zeilen, Parität grün.` (`scripts/import/radio.ts:672`), Exit-Code **0**; erste Ausgabezeile `Quelle: users=… software_versions=… devices=… device_events=… loans=…` (`:663-667`) | **abgelesen aus dem Bau am 2026-08-27** | — (eingelöst) |
| ⬜ **L5** | **Sollwert** des `revision`-Feldes von `/api/health/radio` = der deployte Commit | | **Betreiber**, aus der Protokollzeile des ersten Deploys — **§A Nr. 1**; von dort **abgeschrieben**, nicht geraten | V3 liest ein Feld ab, das mit nichts vergleichbar ist — „200" allein heißt nur „irgendein Stand antwortet" |
| ⬜ **L7** | Vollständiger `Location`-Kopf der `/admin`-Weiterleitung (**Statuscode** 307 oder 302, Protokoll, Host) | | **wird in §P.9 V2 selbst abgelesen** — der Bau schreibt ausdrücklich, dass er hier nicht festgelegt wird (`src/app/m/radio/_lib/zugang.ts:381-384`) | V2 hätte keinen Sollwert; ein festgeschriebenes `302` wäre eine Zusage über eine Bauform, die der Bau nicht festlegt |
| ✅ **L8** | Sollwert von `GET /m/radio` mit `Host: iuk-ue.de` | **404** — gemessen im e2e-Lauf, `e2e/radio-hosts.spec.ts:466` gegen die Liste `EINSTIEGE` (`:436-441`) | **abgelesen aus dem Bau am 2026-08-27** | — (eingelöst; V7 ist damit **bewertbar** und nicht nur protokollpflichtig) |
| ✅ **L9** | Trägt `/` oder `/t/<code>` doch eine kamerabasierte Fläche? | **nein** — `rtk grep -rn 'getUserMedia\|BarcodeDetector\|mediaDevices' src/app/m/radio/` findet **keine** Fläche; der gescannte Code ist ein `GET` aus der Adresszeile (`t/[code]/route.ts`) | **abgelesen aus dem Bau am 2026-08-27** | — (eingelöst; der Zwang zum sicheren Kontext hängt allein am Secure-Cookie, §P.10) |
| ✅ **L10** | Die Zeichenkette aus dem Ausleih-Rahmen, die im **Portal**-HTML **nicht** vorkommt | **`radio-ausleih-rahmen`** (`src/app/m/radio/_ui/AusleihRahmen.tsx:125`, Belegzeile `:21`), abgeriegelt durch `_ui/AusleihRahmen.test.tsx:483-524` | **abgelesen aus dem Bau am 2026-08-27** | — (eingelöst; ⚠️ **sie gehört nach §P.10, nicht nach §P.9** — siehe die Berichtigung dort) |
| ✅ **N4** | Pfad der `sw.js`-Route unter `src/app/m/radio/` → die interne URL-Form | **extern `/sw.js` (Scope `/`), intern `/m/radio/sw.js`** — `src/app/m/radio/sw.js/route.ts:1-39`, Rewrite `src/core/routing.ts:43-79` | **abgelesen aus dem Bau am 2026-08-27** | — (eingelöst; gebraucht in §P.9 V6) |

**Dreizehn Eingabezeilen** — ⚠️ nicht zu verwechseln mit den **dreizehn Abfragen** aus §P.3, die
etwas ganz anderes zählen. Sechs davon sind aus dem fertigen Bau **abgelesen** (L4, L6, L8, L9, L10, N4) und
tragen deshalb einen Wert; zwei sind Wahlen des Laufs (`$IMG`, `$GP`), zwei werden im Lauf selbst
gemessen (`$UID_APP`/`$GID_APP` in §P.4, L7 in §P.9), und drei brauchen Server oder Betreiber
(⬜ N3, E2, E3) — dazu ⬜ L5 aus §A Nr. 1.

**Dazu eine Zeile, die KEINE Ablesung ist und deshalb keine Nummer trägt** — sie ist die Unterschrift
des Laufs, und ohne sie erkennt der zweite Lauf den ersten nicht wieder:

> Generalprobe Lauf-Nr. ____ · gefahren von ____________________ · am ____________

⛔ **E1 und E1b blockieren diese Probe NICHT, und das ist richtig.** Der Prüfcontainer setzt
**frei erfundene** Gruppennamen (`radio-verwaltung-gp`, `radio-updater-gp`, §P.8): `AUTH_DEV_LOGIN`
nimmt Gruppen als **freies Feld** an (`src/core/auth/devLogin.ts:10-11`, „force on (**even in
production**)"). Die zwei echten Namen sind vor **§B** fällig, nicht vor der Probe (§0, Zeilen E1
und E1b).

**Zu ⬜ N3 — die Kennung wird am Server abgelesen, nicht aus dem Image geschlossen.**
`Dockerfile:42-43` legt `nodejs` (gid 1001) und `nextjs` (uid 1001) an, aber `adduser` bekommt **kein**
`-G nodejs` — `USER nextjs` (`Dockerfile:89`) läuft deshalb als `1001:65533 (nogroup)`. Der Dienst
startet dagegen als `user: ${SUITE_USER:-1001:1001}` (`compose.yaml:62`), und ein Host mit
abweichender clamav-gid setzt `SUITE_USER=1001:1000` (`.env.example:252`). **Beide Zahlen ins
Protokoll, und die Probe läuft unter der Server-Zahl.**

### §P.1 — Was vor der Probe grün sein muss

Vier Voraussetzungen. **Keine davon ist durch eine Betriebsprobe ersetzbar**, und eine davon hat eine
Frist, die leicht zu spät gesetzt wird.

**1. Die Tore des Repos sind grün — in der CI, nicht nur lokal.**

```bash
rtk pnpm vitest run scripts/import/radio.test.ts
rtk pnpm vitest run src/app/m/radio
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
```

Darin insbesondere der **Mapping-Unit-Test** mit **je Feld unterschiedlichen** Fixture-Werten. Warum
er hier steht und nicht bei den Betriebsproben: die Betriebsproben (§P.7) sind die Probe **daneben**,
nicht der Ersatz — beide Paritätsarme laufen durch dieselbe Mapping-Funktion, ein konsistenter
Fehler hasht beidseitig gleich (`scripts/import/parity.ts:43-56`).

> Stand 2026-08-27: **512/512 Testdateien, 9122/9122 Tests**, Playwright **369 passed**, `build` und
> `typecheck` fehlerfrei (PR #80). · erneut gefahren am ____________ · Ergebnis ____________

**Abbruch:** Ist ein Tor rot, beginnt die Generalprobe nicht. Rückweg: der Fund gehört in den Bau,
nicht in einen zweiten Generalprobenlauf.

**2. Die Quelltext-Zusicherung zur Cookie-Domain ist grün.**

Sie ist die **einzige** Absicherung gegen einen Fehler, der **nie per HTTP prüfbar** ist — auch
nicht nach dem Umschwenk (§P.14, letzte Zeile). Ein Testlauf gegen **einen** Host sieht keinen
Unterschied zwischen einem domain-weiten und einem host-only Cookie, und ein zusätzliches
`domain`-Feld ist typkorrekt: `pnpm build` und `pnpm typecheck` sehen es nicht.

✅ **Die Zusicherung ist gebaut, und die Datei ist abgelesen — sie ist keine ⬜ mehr:**
`src/app/m/radio/_lib/ausleihSitzung.test.ts:52-66`. Sie prüft
`expect(ausleihCookieOptionen(3600)).not.toHaveProperty("domain")` — ⛔ **`not.toHaveProperty` und
nicht `toBeUndefined()`**, weil ein `{ domain: undefined }` ein `toBeUndefined` bestünde und Next
das Feld dann trotzdem führt (`:54-57`). Die begründende Zeile im Erzeugnis steht in
`src/app/m/radio/_lib/ausleihSitzung.ts:154-170`.

```bash
rtk pnpm vitest run src/app/m/radio/_lib/ausleihSitzung.test.ts
```

**Abbruch:** Fällt dieser Fall weg, ist er kein „nice to have", das nachgereicht wird — er ist die
einzige Stelle, an der der Fehler je auffallen kann.

**3. Die Abwesenheitsprüfung R36 läuft im Repo — vor der Generalprobe, nicht gegen den Container.**

`radio` erhält **kein Manifest, keine Icon-Handler und keinen `<link rel="manifest">`**. Ein `curl`
auf `…/manifest.webmanifest` prüft damit die Abwesenheit von etwas, das kategorisch nicht entstehen
kann: **immer grün, und liest sich als Zusage.** ✅ **Der Bau hat daraus einen dauerhaften Test
gemacht — `src/app/m/radio/_lib/keine-pwa.test.ts`**; er ist der tragende Nachweis, die zwei Zeilen
darunter sind die Handprobe daneben:

```bash
rtk pnpm vitest run src/app/m/radio/_lib/keine-pwa.test.ts
test ! -e src/app/m/radio/manifest.webmanifest/route.ts && echo "R36 ok"
rtk grep -n 'metadata.*manifest|rel="manifest"' src/app/m/radio/ || echo "R36 ok"
```

**Beide Handzeilen müssen `R36 ok` sagen.** > Ergebnis: ____________________

**Abbruch:** Ein Treffer ist eine Moduländerung, kein Runbook-Fund.

**4. ⚠️ „Die Retention der Standby-Umgebung ist neutralisiert ODER das Volume ist kopiert" — und
zwar VOR dem ERSTEN Generalproben-Schnappschuss, nicht „vor dem Cutover-Abend".**

Der Grund ist eine Kette, die nirgends laut wird: `radio-admin@265abd5 server/src/index.ts:35` ruft
`startRetentionSchedule`, `retentionService.ts:47` führt `purge()` **sofort** aus (Quellkommentar:
„clears any backlog, e.g. straight after a data migration"), erst `:48` setzt den Tagestimer — und
der Cutoff hängt an der **Wanduhr** (`:9`, `:19`). **Jeder weitere Start löscht mehr als der
vorige.** Es gibt dabei keinen Fehler und keinen roten Test, sondern eine **Erfolgszeile**:
`[retention] purged N expired loan(s)` (`retentionService.ts:41`).

Ab dem ersten Schnappschuss kann jemand den Alt-Stack anhalten, und **der nächste Start ist der
Schaden**. **Handgriff:** `HISTORY_RETENTION_MONTHS` in der Standby-Umgebung neutralisieren **oder**
das Volume kopieren.

> Retention neutralisiert ☐ / Volume kopiert ☐ · am ____________ · durch ____________

**Abbruch:** Ohne diese Protokollzeile wird **kein** Schnappschuss gezogen (§P.2 nennt sie als
Vorbedingung). **Rückweg: es gibt keinen** — verlorene Historie ist verloren; deshalb steht die
Zeile **vor** dem ersten Lauf.

⚠️ **Die Generalprobe hält den Alt-Stack NICHT an** (§P.2). Diese Vorbedingung schützt gegen den
Fall, dass es trotzdem jemand tut.

### §P.2 — Der Schnappschuss der Alt-Datenbank

**Vorbedingung:** Die Protokollzeile aus §P.1 Nr. 4 steht. Ohne sie wird kein Schnappschuss gezogen.

⚠️ **`cp` ist verboten, und der Fehlfall ist paritätsgrün** — die Begründung steht vollständig in
**§L.1** und wird hier nicht zweimal geschrieben: eine WAL-Datenbank besteht aus **drei** Dateien, und
eine abgeschnittene Quelle ist mit sich selbst vollkommen einig.

⛔ **Der Alt-Stack wird für den Generalproben-Schnappschuss NICHT angehalten.** `.backup` arbeitet
gegen die **laufende** Datenbank — genau dafür ist es da. Ein Stopp wäre nicht nur unnötig, er
wäre **schädlich**: der **Neustart** danach löscht Historie (§P.1 Nr. 4). Das
`docker compose … stop` gehört **ausschließlich** zum Freeze im Fenster (§C Schritt 1) und steht in
diesem Abschnitt nicht.

**Zuerst den echten Volume-Namen ablesen und protokollieren (E2).** Compose präfixt deklarierte
Volumes mit dem Projektnamen; ein erfundener Name legt ein **neues, leeres** Volume an, und der Befehl
darunter meldet dann Erfolg über eine leere Datenbank.

```bash
docker volume ls | grep -i radio-data
VOL_ADMIN=<die Zeile aus dem Befehl oben>     # → E2, ins Protokoll
```

> **E2** = ____________________ · abgelesen am ____________

**Der Befehl — und die Dauer wird dabei gemessen, denn sie ist die Hälfte von U8 (§P.12):**

```bash
time docker run --rm -v "$VOL_ADMIN":/d -v "$PWD":/out alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1;
         sqlite3 /d/data.sqlite ".backup /out/radio-admin-snapshot.sqlite"'
ls -la radio-admin-snapshot.sqlite
```

⚠️ **`/data/data.sqlite` wäre ein CONTAINER-Pfad von `radio-admin`; auf dem Host gibt es ihn nicht.**
Deshalb das Alt-Volume auf `/d` und das Arbeitsverzeichnis des Hosts auf `/out` — **dieselbe
Mount-Form, die §C Schritt 2 im Fenster fährt.**

⚠️ **Es gibt genau EINE zulässige Form.** Eine „gleichwertige" Variante
`sqlite3 /d/data.sqlite "VACUUM INTO '/out/…'"` steht hier **absichtlich nicht**: in die
`sh -c '…'`-Zeile darüber wörtlich übernommen, beendet ihr erstes `'` die umschließende
Zeichenkette, und der Schnappschuss bricht mit einem Syntaxfehler ab. `.backup` ist die Hausform
(`scripts/backup.sh:41-43`), und eine Variante, die niemand fahren soll, ist eine Falle.

> **U8 / `radio-admin`**: `.backup`-Dauer ________ · Dateigröße ________ · gemessen am ____________

⛔ **Unmittelbar danach: den Journal-Modus der QUELLE messen** — die Ablesung `delete` vom 2026-08-21
ist **datiert**, und der Weg daraus steht vollständig in **§L.1** (Zweig `delete` → `-readonly`
bleibt; Zweig `wal` → auch der Quellarm verliert `-readonly`, **kein Abbruch**):

```bash
sqlite3 radio-admin-snapshot.sqlite "pragma journal_mode;"
```

> Ergebnis: ____________ · gemessen am ____________

**Die Kopie wird gegengeprüft, bevor irgendetwas mit ihr geschieht:**

```bash
sqlite3 -readonly radio-admin-snapshot.sqlite ".tables"
sqlite3 -readonly radio-admin-snapshot.sqlite "pragma integrity_check;"
sqlite3 --version
```

**Erwartung:** `.tables` nennt `devices`, `software_versions`, `users`, `device_events`, `loans`,
`api_tokens` und `__drizzle_migrations`; `integrity_check` sagt `ok`.

⛔ **Fehlen `loans`, `users` oder `api_tokens`, ist die Quelle ein Stand VOR der Loan-Migration
`0003`** — dann wurde das falsche Volume gemountet. **Abbruch. Rückweg:** E2 erneut ablesen,
Schnappschuss verwerfen (`rm radio-admin-snapshot.sqlite`), neu ziehen. Der Schnappschuss ist beliebig
oft wiederholbar — er hält den Alt-Stack nicht an.

> `sqlite3` auf dem Host: Version ________ (⚠️ die Erwartungstabellen in §S.3 und §S.4 sind gegen
> **3.54.0** gemessen) · vorhanden ☐ ja ☐ nein — dann läuft jede Abfrage dieses Abschnitts über die
> `docker run … alpine`-Form

### §P.3 — Die dreizehn Abfragen gegen die Kopie, VOR dem Import

**Der vollständige Wortlaut aller dreizehn Abfragen steht in §V — dort und nur dort, damit es eine
Fassung gibt und nicht zwei.** Dieser Abschnitt sagt, **gegen welche Datei** sie in der Generalprobe
laufen, **welche** blockieren und **was mit ihren Zahlen weiter geschieht**.

**Gegen welche Datei:** ausschließlich gegen `./radio-admin-snapshot.sqlite` aus §P.2 — **nie** gegen
den laufenden Alt-Stack. Der Alt-Kiosk ist bis zum Umschwenk der Betrieb.

```bash
sqlite3 -readonly radio-admin-snapshot.sqlite '<das SQL aus §V>'
```

⛔ **Warum diese dreizehn HIER laufen und nicht erst im Fenster (NT9).** Die Parität beweist den
Datenbank-Rundlauf, **nicht die Frische der Quelle**: beide Arme von `checkRadioParitaet` stammen aus
**demselben**, einmal gelesenen Quellobjekt. Ein Schnappschuss, der zwei Stunden alt, aber in sich
konsistent ist, ergibt plausible Zahlen, einen sauberen Import und **grüne** Parität.

⛔ **Deshalb sind die Zahlen aus A1 keine Buchhaltung, sondern die Sollwerte, gegen die später
gemessen wird — und das muss beim Aufschreiben schon dastehen:**

| Zahl aus A1 | Wird aufgeschrieben und gestellt gegen |
|---|---|
| `devices`, `software_versions`, `users`, `device_events`, `loans` (**fünf**) | **§P.5**, die Gegenzählung im Ziel — **paarweise, nicht in der Summe**. Das ist der Haken **G3** in §P.13 |
| dieselben fünf | die **Zählzeile des Importers** (`Quelle: users=… loans=…`, ✅ L6) — **drei Zahlen, eine Gleichung** (§P.4 Handgriff 4) |
| `api_tokens` (**die sechste**) | reine **Protokollzeile** für den Abbau: die Tabelle existiert im Ziel **nicht**; sie wird in §5.2 als Abfrage **T** wieder gebraucht |
| die **A8**-Zahl, beschriftet als **VORHERSAGE** | **§P.7 (a)**, die Retention-Gegenprobe im Ziel |

> A1: devices ____ · software_versions ____ · api_tokens ____ · users ____ · device_events ____ ·
> loans ____ · abgelesen am ____________

⚠️ **Was die Generalprobe an NT9 NICHT schließen kann, und das ist keine Nachlässigkeit:** es gibt
hier keinen Freeze, die Quelle läuft weiter, der Schnappschuss ist konstruktionsbedingt schon beim
Lesen veraltet. **Die Probe prüft die Mechanik dieser Kette, nicht ihre Aussage** (§V.0, letzter
Aufzählungspunkt). Die **scharfe** NT9-Verteidigung ist die Vorabzählung aus der laufenden
Alt-Anwendung gegen eine **eingefrorene** Quelle, und die steht in **§V.0 und läuft im Fenster**.
⛔ Wer daraus schließt, die dreizehn seien hier verzichtbar, hat die Rechnung falsch herum gelesen:
in der Probe kostet ein Treffer eine halbe Stunde, im Echtlauf einen Abbruch um 23 Uhr — **ohne
Parallelfenster.**

**Welche blockieren:** die Klassenzuordnung steht in §V im Kopf (acht blockierend: A2 · A3 · A4 · A5 ·
A6 · A7 · A10 · A11; fünf protokollpflichtig: A1 · A8 · A9 · A12 · A13). **Was ein Treffer bedeutet,
entscheidet die Klasse und nicht das Gefühl** — die vier Klassen A bis D stehen vollständig in
**§P.13** und werden hier nur zugeordnet:

| Fund | Klasse | Rückweg in einem Satz |
|---|---|---|
| **A6** (zehnstellige Zeitstempel) · **A7** (Trigger/Views) | **A** | Der Cutover wird **abgesagt, nicht angepasst**; der Termin wird verschoben |
| **A2** (`is_target` ≠ 1) · **A3** (Waisen) | **B** | In der **Kopie** bereinigen, das ausgeführte SQL wörtlich protokollieren — und im Echtlauf **wiederholen**, nicht vererben |
| **A4** · **A5** · **A10** · **A11** | **C** | Reparieren, dann `rm -rf "$GP"` und die Generalprobe **von vorn** |
| **A12** im Fall **AKTIV** | Protokoll + **Betreiberentscheid** | Eine aktive Leihe auf einem nicht existierenden Gerät ist über die Oberfläche nicht zurückgebbar |
| **A13** | Protokoll; ⛔ **blockierend NUR zusammen mit A10** | Dann ist es kein Datenfehler von damals, sondern ein **beschädigter Schnappschuss** — §P.2 wiederholen |

**A9 ist die einzige dieser Abfragen, deren Antwort nach dem Abbau nicht mehr zu bekommen ist.** Sie
beantwortet **U7** und entscheidet über die Lesbarkeit der Auditspalten. Sie wird in §5.2 als
Abfrage 8 **wiederholt**, aber gegen dann schon archivierte Daten — deshalb steht die Antwort **hier**
im Protokoll, nicht erst dort.

> **U7**: `dev-user` in Auditspalten gefunden ☐ ja, ____ Zeilen ☐ nein · abgelesen am ____________

### §P.4 — Wegwerf-Aufbau und Import

Der Kern der Probe: ein `DATA_DIR`, das **nicht** das produktive Volume ist, und **derselbe Importer,
den auch das Fenster fährt**.

#### Handgriff 0 — die numerische Kennung, ZWEIMAL abgelesen

**Warum überhaupt:** `Dockerfile:89` startet den Prozess als `USER nextjs`, und `Dockerfile:71`
übereignet den Mountpunkt. Schreibt der Import als root in dasselbe Verzeichnis, gehört `radio.db`
root — und die Migrationen beim Boot scheitern mit `SQLITE_CANTOPEN`. Laut, im Container-Log, kein
stiller Fall. Aber ein verbrannter Durchlauf.

```bash
IMG=<die Image-Referenz aus §P.0>
UID_APP=$(docker run --rm --entrypoint sh "$IMG" -c 'id -u')
GID_APP=$(docker run --rm --entrypoint sh "$IMG" -c 'id -g')
echo "Image: $UID_APP:$GID_APP"

# auf dem Server, im Projektverzeichnis der Suite — das ist die Ablesung fuer ⬜ N3:
grep -n '^SUITE_USER=' .env                     # leer heisst: die Vorgabe 1001:1001 gilt
docker compose config | grep -n 'user:'         # dieselbe Zahl, aufgeloest
```

> ⬜ **N3** Server-Kennung = ________ · Image-Kennung = ________ · gleich? ☐ ja ☐ nein ·
> die Probe läuft unter ____________ · abgelesen am ____________

**Weichen sie ab, gilt die Server-Zahl** — sonst prüft die Generalprobe eine Rechtelage, die es in
der Produktion nicht gibt, und das Fenster trifft eine, die es in der Probe nicht gab. Die
Begründung für die Abweichung Image ↔ Server steht in §P.0 unter „Zu ⬜ N3".

**Abbruch:** Ist `SUITE_USER` auf dem Server nicht ablesbar, ist das eine **Serverauskunft und keine
Vermutung** — sie wird eingeholt. **Rückweg bis dahin:** die Probe läuft unter der Image-Zahl und
trägt im Protokoll den Vermerk „unter Image-Kennung gefahren, Server-Zahl offen (⬜ N3)".

#### Handgriff 1 — das Wegwerf-DATA_DIR

```bash
GP=<der Pfad aus §P.0>              # Vorschlag: $HOME/gp-radio
DATA_DIR="$GP/data"                 # ⛔ HIER gesetzt — §P.5, §P.6 und §P.7 LESEN ihn
export DATA_DIR
rm -rf "$GP" && mkdir -p "$DATA_DIR/files"
```

⛔ **`DATA_DIR` wird in dieser Zeile gesetzt und nirgends sonst.** Die Zuweisung in Handgriff 2 ist
ein **Praefix eines einzelnen Befehls** und ueberlebt ihn nicht — jede spaetere Zeile dieses
Abschnitts (§P.5 saemtliche Zaehlungen, §P.6 Zielarm, §P.7 (a)/(b)/(c)) liest `"$DATA_DIR/radio.db"`.
⚠️ **Ohne diese Zeile expandiert das zu `/radio.db`**, und `sqlite3` legt dort entweder eine leere
Datenbank an oder scheitert am Oeffnen — beides sieht genau wie NT10 aus und schickt die Suche in die
falsche Richtung. **Handgriff 4 schreibt `$GP/data/radio.db` bewusst aus**: diese eine Probe fragt
nach dem woertlich gemeinten Pfad und darf ihn deshalb nicht ueber eine Variable beziehen.

⚠️ **`data/files` MUSS mit angelegt werden, und der Grund ist ein Mount-Grund, kein files-Grund:** ein
**Bind**-Mount erbt die Verzeichnisstruktur des Images **nicht**. Nur ein leeres benanntes Volume
übernimmt Eigentümer und Modus des Mountpunkts aus dem Image (`Dockerfile:64-71`).

⚠️ **Was hier ausdrücklich NICHT der Grund ist, obwohl es naheliegt:** eine Boot-Prüfung von `files`,
die an einem fehlenden Verzeichnis scheitert. **Die gibt es nicht.** `filesBootFehler()` ruft
`pruefeAblage()` **nur**, wenn `files` einen Prod-Host trägt (`src/app/m/files/_lib/boot.ts:82-95`) —
die Env-Liste des Prüfcontainers (§P.8) setzt **kein** `SUITE_HOST_FILES`. **Warum das dasteht:** wer
bei einem Startabbruch dieser falschen Fährte folgt, sucht bei `files` statt bei den Boot-Prüfungen
aus §P.8, die den Abbruch tatsächlich auslösen.

⛔ **`rm -rf "$GP"` ist die Idempotenz dieser Probe — nicht die Konfliktstrategie des Importers.**
**Verbindlich: jede Generalprobe beginnt mit einem leeren `DATA_DIR`.** Wer stattdessen „nochmal
importiert", prüft die Idempotenz des Skripts und nicht den Import — und walzt genau das platt, was
die Probe erzeugt hat.

#### Handgriff 2 — der Import

```bash
DATA_DIR="$GP/data" pnpm exec tsx scripts/import/radio.ts ./radio-admin-snapshot.sqlite
echo "exit=$?"
```

⚠️ **Nicht aus dem App-Image.** Das standalone-Image enthält weder `scripts/` noch `tsx`. Ein
`docker compose exec suite tsx …` ist der Reflex, und er scheitert — im besten Fall.

**Die Aufrufform ist dieselbe wie im Fenster:** dasselbe Skript, dasselbe **eine** positionale
Argument, dieselbe Schnappschuss-Datei — **ein anderes `DATA_DIR` je Lauf**. ⚠️ **Nicht
„zeichengleich":** der Pfad des `DATA_DIR` ist der einzige Unterschied, und wer „zeichengleich"
wörtlich nimmt, sucht im Fenster nach einer Zeile, die es nicht gibt.

**Abnahme dieses Handgriffs — beides, nicht eines von beiden (✅ L6, abgelesen):**

* die **erste** Ausgabezeile
  `Quelle: users=<n> software_versions=<n> devices=<n> device_events=<n> loans=<n>`
  (`scripts/import/radio.ts:663-667`)
* die **Abschlusszeile** `Radio-Import OK — <n> Zeilen, Parität grün.` (`:672`) **und Exit-Code 0**
  (`:679-687` setzt `1` in jedem anderen Fall)

⚠️ **Grep-Anker sind `Radio-Import OK` und `Zeilen, Parität grün.`, nie die Zahl** — und **der
Gedankenstrich ist ein EM DASH (U+2014)**; ein Muster mit `-` verfehlt die Zeile still (§Z, Kopf).

> Erste Zeile wörtlich: ____________________________________ ·
> Abschlusszeile wörtlich: ____________________________________ · exit = ____ · am ____________

**Abbruch — und er ist der teuerste Fehlfall dieser Probe:** ⚠️ **ein roter Paritätscheck heißt
NICHT „es ist nichts passiert"** (Klasse D, §P.13). Die Parität läuft **nach** dem Schreibvorgang
(`scripts/import/radio.ts:627-645`). **Rückweg ist die leere Ziel-DB, nie ein zweiter Lauf auf
demselben Stand:** `rm -rf "$GP"` und von vorn bei Handgriff 1.

#### Handgriff 3 — Eigentum an die Kennung übergeben

```bash
sudo chown -R "$UID_APP:$GID_APP" "$GP/data"     # bzw. die Server-Kennung aus ⬜ N3
ls -ln "$GP/data"
```

**Erwartung:** `radio.db` trägt dieselbe numerische Kennung wie das Verzeichnis, und beide die aus
Handgriff 0 protokollierte Zahl.

#### Handgriff 4 — ist der Import überhaupt DORT gelandet? (NT10)

⚠️ **Ein eigener Schritt, keine Fußnote am Importschritt.** Wer `DATA_DIR` vergisst, importiert nach
`./.data/radio.db`, bekommt **Parität grün** und hat nichts migriert.

```bash
ls -la "$GP/data/radio.db"
sqlite3 "$GP/data/radio.db" "select count(*) from devices;"
ls -la ./.data/radio.db 2>/dev/null && echo "ACHTUNG: es gibt eine zweite radio.db unter ./.data"
```

⛔ **Auch hier ohne `-readonly` — NT8, siehe §L.3.** Dies ist der **erste** Leser der frisch
importierten Datei; sie liegt im WAL-Modus und trägt noch keine `-shm`, und ein Readonly-Handle
brach an genau dieser Stelle mit `unable to open database file (14)` ab — eine Meldung, die wie ein
Importfehler aussieht und keiner ist.

**Erwartung — drei Zahlen, eine Gleichung:** die Zahl aus der zweiten Zeile ist zeichengleich die
`devices=`-Zahl aus der **ersten Ausgabezeile des Importers** (Handgriff 2) und zeichengleich der
`devices`-Zahl aus **A1** (§P.3).

> `$GP/data/radio.db`: ________ Bytes, geändert ____________ · `devices` in der Datei ________ ·
> `devices=` des Importers ________ · `devices` aus A1 ________ · alle drei gleich? ☐ ja ☐ nein

**Abbruch:** Steht eine `./.data/radio.db` da, ist der Lauf in das falsche Ziel gegangen.
**Rückweg:** `rm -rf ./.data/radio.db* "$GP"`, Handgriff 1 und 2 wiederholen — **mit** gesetztem
`DATA_DIR`.

#### Wie ab jetzt gelesen wird — die Regel steht in §L.3, nicht hier

⛔ **Es gibt genau EINE Fassung dieser Regel, und sie steht in der Lauf-Tabelle in §L.3.** Für die
Generalprobe lautet sie: `sqlite3 "$DATA_DIR/radio.db" '<SQL>'` **auf dem Host**, mit
`DATA_DIR=$GP/data`, **ohne `-readonly`** (NT8) und **ohne `immutable=1`**.

⚠️ **Die ältere Fassung der Pläne ist hier berichtigt und wird nicht zurückgeschrieben.** Die
Pläne vom 2026-08-18 führten für die Generalprobe `sqlite3` **mit** `-readonly` gegen
`$GP/data/radio.db`, dazu eine Zwei-Zustands-Tabelle mit `immutable=1`, je nachdem ob der
Prüfcontainer läuft. **NT8 vom 2026-08-21 hat gemessen, dass die Readonly-Form gegen eine frisch
importierte Datei scheitert**, und §L.3 hat die Zwei-Zustands-Tabelle auf **eine** Zeile eingedampft.
Wer eine der zwei Formen „repariert", baut die Falle wieder ein — und macht die Gegenlese in §L.3
rot. ⚠️ **Die verworfene Form steht hier absichtlich AUSEINANDERGESCHRIEBEN**: zusammen getippt wäre
sie der zweite Treffer, den die Gegenlese in §L.3 als Fund meldet.

⛔ **Und der Riegel, der beide Zustände überspannt — er wird nie ohne seinen Geltungsbereich
zitiert:** **die `docker run`-Zeile DER GENERALPROBE enthält die Zeichenkette `suite_data` nicht.**
Ein Zeichen Unterschied schreibt in die Produktion. **Für den Fenster-Prüfcontainer (§C Schritt 8)
gilt der Riegel NICHT** — dort ist es das Prüfobjekt. Die ausführbare Gegenprobe steht in §P.8, weil
sie den laufenden Container braucht.

### §P.5 — Die Gegenzählungen im Ziel

**Alle Befehle laufen gegen `$GP/data/radio.db` nach der Lauf-Tabelle aus §L.3 — kein Browser, keine
Domain.** Vorbedingung ist Handgriff 4 aus §P.4: **eine `0` ist zuerst ein Pfadfehler, erst danach ein
Datenbefund** (NT10).

⛔ **NT8 — hier steht der tragende Weg, und er ist gemessen, nicht vermutet.** Die frisch importierte
`radio.db` liegt im **WAL-Modus** und trägt noch **keine `-shm`**; ein Readonly-Handle darf sie nicht
anlegen und bricht ab mit `Parse error … unable to open database file (14)`. **Diese Meldung sieht wie
ein Importfehler aus und ist keiner** (`docs/superpowers/berichte/2026-08-21-radio-import-abnahme.md:78-179`).
**Deshalb steht in jedem Befehl dieses Abschnitts kein `-readonly`** — die Datei gehört uns, das
Anlegen der `-shm` ist harmlos.

**Die fünf Zeilenzahlen — fünf, nicht sechs:**

```bash
sqlite3 "$DATA_DIR/radio.db" "select 'devices', count(*) from devices union all select 'software_versions', count(*) from software_versions union all select 'users', count(*) from users union all select 'device_events', count(*) from device_events union all select 'loans', count(*) from loans;"
```

⚠️ **`api_tokens` fehlt hier ABSICHTLICH. Die Tabelle existiert im Ziel NICHT.** Eine
Sechser-Schleife bricht mit `Error: no such table: api_tokens` ab — in der Generalprobe eine
Korrektur, im Cutover-Fenster ein **verbrannter Schritt**. `api_tokens` wird genau **einmal** gezählt:
in der Quelle, als Protokollzeile (A1, §P.3); sie wird in §5.2 als Abfrage **T** wieder gebraucht.

**Erwartung: fünf Paare gleich — PAARWEISE, nicht in der Summe.** Das ist der Haken **G3**:

| Tabelle | Quelle (A1) | Ziel | gleich? |
|---|---|---|---|
| `devices` | ________ | ________ | ☐ |
| `software_versions` | ________ | ________ | ☐ |
| `users` | ________ | ________ | ☐ |
| `device_events` | ________ | ________ | ☐ |
| `loans` | ________ | ________ | ☐ |

**Abbruch:** Ein ungleiches Paar ist **Klasse C** (§P.13): reparieren, dann `rm -rf "$GP"` und die
Generalprobe **von vorn**. Ein Nachbessern auf dem bestehenden Stand prüft die Reparatur und nicht
den Import.

**Die drei Invarianten, jetzt im ZIEL — Erwartung wie A2 / A3 / A4:**

```bash
sqlite3 "$DATA_DIR/radio.db" "select count(*) from software_versions where is_target = 1;"
sqlite3 "$DATA_DIR/radio.db" "select count(*) from device_events e left join devices d on d.id = e.device_id where d.id is null;"
sqlite3 "$DATA_DIR/radio.db" "select device_id, count(*) from loans where returned_at is null group by device_id having count(*) > 1;"
```

**Erwartung:** genau `1` · `0` · **leer**. > is_target: ____ · Waisen: ____ · doppelt aktive: ____ Zeilen

**Die zwei Spalten ohne Quelle MÜSSEN leer sein — und sie prüfen zwei verschiedene Dinge:**

```bash
sqlite3 "$DATA_DIR/radio.db" "select count(*) from zugangscodes;"
sqlite3 "$DATA_DIR/radio.db" "select count(*) from loans where zugangscode_id is not null;"
```

* `zugangscodes` ist **nicht Teil des Imports** — die Zeile prüft zugleich die Zusage aus §P.8, dass
  **`SUITE_SEED` nicht gesetzt ist**. ⚠️ Bei `radio` ist das schärfer als bei jedem anderen Modul: ein
  geseedeter Zugangscode wäre ein **gültiger anonymer Zugang** zum gesamten Bestand samt
  Ausleihernamen. `scripts/seed-lokal.test.ts` und die zwei ausgeschriebenen Ausschlüsse in
  `core/bootstrap.ts` halten das repo-seitig — **diese Zeile prüft die Zusage, statt ihr zu glauben.**
* `loans.zugangscode_id` ist im Ziel **neu** und in der Quelle nicht vorhanden. Ein Wert ≠ NULL hieße,
  dass zwischen Import und Prüfung schon über die Suite ausgeliehen wurde.

> `zugangscodes`: ____ (MUSS 0) · `zugangscode_id is not null`: ____ (MUSS 0)

**Abbruch:** `zugangscodes` ≠ 0 → **`SUITE_SEED` war gesetzt.** Rückweg: `rm -rf "$GP"`, Env prüfen,
§P.4 von vorn — **nicht die Zeilen löschen.**

#### Die zwei Null-Zählungen gegen die Faltung (NT4) — Quelle GEGEN Ziel

⛔ **Diese Probe ist die einzige, die den Fehler noch fangen kann, und sie ist nach dem Import nicht
nachholbar.** `devices.alamos_integrated` und `devices.loanable` sind nullable; ein falsch gefaltetes
`false` ist dort **nicht mehr von einem echten zu unterscheiden**, und es ist **paritätsgrün**. Der
vollständige Wortlaut steht in **§Z.2 (b)**; in der Generalprobe gilt die Host-Form:

```bash
sqlite3 "$DATA_DIR/radio.db" "select count(*) from devices where loanable is null;"
sqlite3 "$DATA_DIR/radio.db" "select count(*) from devices where alamos_integrated is null;"
sqlite3 -readonly radio-admin-snapshot.sqlite "select count(*) from devices where loanable is null;"
sqlite3 -readonly radio-admin-snapshot.sqlite "select count(*) from devices where alamos_integrated is null;"
```

| Spalte | Quelle | Ziel | Differenz |
|---|---|---|---|
| `loanable is null` | ________ | ________ | ________ |
| `alamos_integrated is null` | ________ | ________ | ________ |

**Beide Differenzen MÜSSEN `0` sein.** ⛔ Eine Differenz ≠ 0 ist **Klasse C**: Import verwerfen,
`rm -rf "$GP"`, Mapper korrigieren — nicht nachbessern.

#### Der partielle Index MUSS da sein — und die Prüfung geht auf Struktur, nicht auf Text

```bash
# (a) die STRUKTURELLE Zusicherung — sie entscheidet:
sqlite3 "$DATA_DIR/radio.db" "select count(*) from pragma_index_list('loans') where name = 'loans_device_active_uidx' and partial = 1;"
# (b) der Wortlaut, nur fuers Protokoll:
sqlite3 "$DATA_DIR/radio.db" "select name, sql from sqlite_master where type = 'index' and name = 'loans_device_active_uidx';"
```

**Erwartung:** (a) ist **genau `1`**. (b) liefert die Zeile, die in **§Z.4** zeichengleich ausgeschrieben
steht.

⚠️ **Warum (a) die Zusicherung trägt und nicht (b):** `sqlite_master.sql` speichert die
`CREATE`-Anweisung **zeichengleich so, wie sie ausgeführt wurde**, und die Migration schreibt den
Ausdruck **mit Backticks**. Eine Textsuche auf `WHERE returned_at IS NULL` ergibt darauf **0** —
gemessen; deshalb prüft auch `src/app/m/radio/_db/migrations.test.ts` über `pragma_index_list`.
**Wer hier grept statt zu vergleichen, hält einen vorhandenen Index für fehlend.**

⚠️ **Warum die Prüfung überhaupt nötig ist:** `drizzle-kit` erzeugt partielle Indizes **nicht**, und
die Migrationsdatei sagt es selbst. **Fehlt er, ist alles grün** — Build, Typecheck, Parität, jede
Zählung oben — **und die Invariante „höchstens eine aktive Leihe je Gerät" ist weg.** Sichtbar wird
es erst, wenn der Kiosk ein Gerät zum zweiten Mal ausleiht.

> Index vorhanden und partiell: ☐ ja (a) = 1 ☐ nein · Wortlaut (b): ____________________

**Abbruch:** (a) ≠ 1 → **Migrationsdefekt, nicht Importdefekt.** Rückweg: die Handmigration
`src/app/m/radio/_db/migrations/0001_loans_aktiv_uidx.sql`, danach `rm -rf "$GP"` und §P.4 von vorn.

#### ✅ L4 — die Migrationszahl, beidseitig

```bash
sqlite3 "$DATA_DIR/radio.db" "select count(*) from __drizzle_migrations;"
rtk grep -c '"idx"' src/app/m/radio/_db/migrations/meta/_journal.json
```

**Erwartung: beide `2`** — abgelesen am 2026-08-27, ausführlich in §Z.6. **Eine Migration je
Journal-Eintrag, kein Batching und kein Split.**

> `__drizzle_migrations`: ____ · Einträge im Journal: ____ · gleich? ☐ ja ☐ nein

⛔ **Nebenauflage, die später teuer ist:** den `when`-Wert von `0001_loans_aktiv_uidx` **nicht**
zurücksetzen und die Datei nicht neu erzeugen (Begründung in §Z.6).

#### Die vier Angaben der Retention-Kontrollgruppe

Sie gehen an §P.7 und an die Nachkontrolle nach dem ersten Purge-Lauf:

```bash
sqlite3 "$DATA_DIR/radio.db" "select count(*) from loans where returned_at is not null;"
sqlite3 "$DATA_DIR/radio.db" "select id, returned_at, datetime(returned_at,'unixepoch') from loans where returned_at is not null order by returned_at desc limit 1;"
sqlite3 "$DATA_DIR/radio.db" "select id, returned_at, datetime(returned_at,'unixepoch') from loans where returned_at is not null order by returned_at asc  limit 1;"
```

> gesamt: ________ · jüngste `id`/`returned_at`/Datum: ____________________ ·
> älteste `id`/`returned_at`/Datum: ____________________ · **A8-Vorhersage** aus §P.3: ________

⛔ **Ein Datum im Jahr 1970 in einer dieser Zeilen ist der Faktor-1000-Fehler, bewiesen** — die
spaltengenaue Fassung ist Abfrage **Z** in §P.7.

⚠️ **Nie `/api/health/radio` als Ersatz für diese Zählungen.** Er ist `SELECT 1` auf einer Datei, die
bei Bedarf **neu angelegt** wird. **Die zählende Prüfung steht NEBEN dem Healthcheck, nicht an
seiner Stelle** (§Z.6, letzter Absatz).

### §P.6 — Die fünf Verwechslungspaare, feldweise

**Warum feldweise und nicht als Zählung:** ein vertauschtes Spaltenpaar ändert **keine** Zeilenzahl
und keinen Hash, wenn beide Arme dieselbe Vertauschung tragen (`scripts/import/parity.ts:43-56`). Es
ändert nur, was die Oberfläche behauptet. Die vollständige Blindheitstafel der Parität steht im
Kopf von **§S**.

**Die zwei Arme, und ihre Lesebefehle sind verschieden:**

| Arm | Befehl in der GENERALPROBE |
|---|---|
| **Quelle** | `sqlite3 -readonly radio-admin-snapshot.sqlite '<SELECT>'` — gegen die Schnappschuss-Kopie, nie gegen den laufenden Stack |
| **Ziel** | `sqlite3 "$DATA_DIR/radio.db" '<SELECT>'` auf dem **Host**, `DATA_DIR=$GP/data`, **ohne `-readonly`** (§L.3, Zeile „Generalprobe") |

⛔ **Der Zielarm der Generalprobe liest NICHT über `$VOL_SUITE`.** Die `docker run … -v
"$VOL_SUITE":/data alpine`-Form aus §L.2 gehört zum **Fenster**: dort liegt `radio.db` im produktiven
Volume. Wer die Fenster-Form hier fährt, bekommt entweder einen lauten Öffnungsfehler oder, nach dem
ersten Deploy, **fünf Nullen aus einer leeren produktiven `radio.db`**, die wie ein misslungener
Import aussehen — **und im schlimmeren Fall liest er die Produktion.**

**Die Auswahl der Zeilen steht in §S.1** (Regel 1 bis 4, mit den fünf Auswahl-SQLs), **die
Spaltenlisten in §S.2**, **der Sollwert für `devices.last_updated_at` in §S.4** — eine Fassung,
nicht zwei. Es sind **fünf** Paare bzw. Tripel, nicht vier:

`issi` ↔ `tei` · `created_at` ↔ `updated_at` ↔ `last_updated_at` · `snapshot_call_sign` ↔
`borrower_name` · `alamos_integrated` ↔ `loanable` (**zwei 0/1-Ganzzahlen, die niemandem auffallen**) ·
`serial_number` ↔ `hiorg_id` ↔ `opta`

⚠️ **Der Zielarm braucht KEINE übersetzte Spaltenliste, und das ist ein Befund, keine
Bequemlichkeit** (§S.2): die SQL-Spaltennamen sind auf **beiden** Armen zeichengleich. Wer auf dem
Zielarm `snapshotCallSign` schreibt, bekommt `no such column` (laut, harmlos); wer zwei Namen dabei
vertauscht, bekommt eine **grüne Stichprobe** (still, teuer).

**Die Protokollform, je Stichprobe:**

```
loans/returned_at  id=<id>
  quelle_ms = ________            (radio-admin-snapshot.sqlite)
  ziel_s    = ________            (radio.db, $GP/data)
  rechnung  = quelle_ms / 1000 == ziel_s   →  ☐ ok  ☐ ABWEICHUNG
```

Für ein **Textfeld** entfällt die Rechnung, und geprüft wird **zeichengleich**, nicht „sieht
richtig aus".

⚠️ **Zweite Meinung erlaubt — mit EINER Ausnahme.** Auf dem Quellarm darf zusätzlich die
Alt-Oberfläche befragt werden; sie läuft während der Generalprobe noch unter `radio.iuk-ue.de`.
**Für `devices.last_updated_at` ist sie KEIN Schiedsrichter, sondern eine Münze** — der CSV-Export
formatiert den UTC-Tag, die Detailansicht den lokalen; die zwei Flächen widersprechen sich bei genau
den Zeilen, die der Filter auswählt (§L, Kopf; ausgeschrieben in §S.4).

⚠️ **Liefert eine Auswahl keine Zeile, ist das ein Protokolleintrag, kein Freibrief.** „Kein Gerät hat
`alamos_integrated <> loanable`" heißt: die Vertauschung dieser zwei Ganzzahlen ist an den
Produktionsdaten **nicht prüfbar**, und das Tor bleibt allein der Unit-Test. **Das muss dastehen,
sonst hält jemand später eine ungeprüfte Zusage für geprüft.**

⛔ **Die Stichproben-`id`s der Generalprobe sind Protokoll, KEINE Eingabe für den Echtlauf.** Im
Fenster werden die Auswahl-SQLs aus §S.1 **erneut** gefahren und die `id`s **neu** abgelesen — der
Bestand hat sich bis dahin bewegt.

> Paar 1 `id` ________ ☐ ok · Paar 2 `id` ________ ☐ ok · Paar 3 `id` ________ ☐ ok ·
> Paar 4 `id` ________ ☐ ok · Paar 5 `id` ________ ☐ ok ·
> ohne Treffer geblieben: Paar Nr. ________ · notiert am ____________

**Abbruch:** Eine Stichprobe, deren Werte nicht übereinstimmen, ist **Klasse C**: reparieren, dann
`rm -rf "$GP"` und von vorn. ⚠️ Eine **vertauschte** Zuordnung ist dabei kein Runbook-Fund, sondern ein
Mapper-Fund — der Rückweg führt nach `scripts/import/radio.ts`, nicht in einen zweiten Import auf
demselben Stand. Das ist der Haken **G4**.

### §P.7 — Die Gegenprobe gegen den Faktor 1000

**Die Kette, die diesen Abschnitt trägt** (ausführlich im Kopfabschnitt, Punkt 3): Quelle ist
epoch-**Millisekunden**, Ziel ist Drizzle `mode: "timestamp"` = Unix-**Sekunden**. Die Parität
vergleicht Zeilen-Hashes aus **derselben** Mapping-Funktion auf **beiden** Armen — ein konsistenter
Fehler hasht beidseitig gleich. **Sekunden statt Millisekunden legt jedes `returned_at` ins Jahr 1970,
und der nächste Purge-Lauf löscht die komplette abgeschlossene Leihhistorie.** Aktive Leihen
(`returned_at IS NULL`) überleben. **Der Import-Test bleibt grün.**

⚠️ **Diese drei Proben ersetzen den Mapping-Unit-Test nicht.** Sie sind die Betriebsprobe **daneben**;
der Test läuft in der CI und muss **vor** der Generalprobe grün sein (§P.1 Nr. 1).

#### (a) Die Retention-Zahl aus A8 muss im Ziel wiederzufinden sein — in SEKUNDEN

```bash
sqlite3 "$DATA_DIR/radio.db" "select count(*) from loans where returned_at is not null and returned_at < strftime('%s','now','-2 months');"
```

**Erwartung:** dieselbe Zahl wie die A8-Vorhersage aus §P.3.

⚠️ **`'now'` ist HIER zulässig und im Fenster NICHT.** In der Generalprobe liegen beide Auswertungen
Sekunden auseinander, und kein Freigabeschritt hängt daran. **Im Fenster wird derselbe Vergleich mit
`<freeze_iso>` in BEIDEN Armen gefahren** (Abfrage **R**, §5.2): eine Leihe, deren `returned_at` genau
auf der Zwei-Monats-Grenze liegt, wechselt zwischen zwei `now`-Auswertungen die Seite, und die
Erwartung „dieselbe Zahl wie vorhin" ist dann **rot ohne Fehler** — mitten im Fenster, neben einem
Handgriff, der „Import verwerfen, `radio.db` löschen, Mapper korrigieren" lautet.

> (a) A8-Vorhersage = ____ · Ziel = ____ · gleich? ☐ ja ☐ nein

#### (b) Der Fingerabdruck — eine Zeile, eindeutig

```bash
sqlite3 "$DATA_DIR/radio.db" "select min(returned_at), max(returned_at), count(*) from loans where returned_at is not null;"
```

Die Quelldaten stammen aus dem Betrieb dieser Anwendung; ein `max(returned_at)` unterhalb von etwa
`1000000000` (2001) ist damit **ausgeschlossen**. Zeigt (b) einen 1970er-Stand, ist der
Faktor-1000-Fehler **bewiesen** — und zwar **bevor** der erste Retention-Lauf ihn unsichtbar macht.

> (b) min = ________ · max = ________ · count = ____ · `datetime(max,'unixepoch')` = ____________

**Abbruch bei (a) oder (b): Klasse C** — Mapper korrigieren, dann `rm -rf "$GP"` und die Generalprobe
**von vorn**. ⚠️ **Kein Nachbessern der Zahlen in der Ziel-DB:** das repariert die Anzeige und nicht
den Import.

#### (c) Abfrage Z — die spaltengenaue Fassung derselben Probe

(a) und (b) sagen **dass** etwas nicht stimmt. **Z sagt, WELCHE Spalte betroffen ist.**

⛔ **Dies ist die zuerst geschriebene Fassung von Abfrage Z, und sie ist die Leitfassung für die zwei
weiteren im selben Runbook** — **§C Schritt 5 (d)** (im Fenster) und **§5.2** (beim Abbau). **Die zehn
Glieder sind in allen dreien zeichengleich; abweichen darf allein die Zugriffsform:** hier der
Host-Pfad der Generalprobe, dort die `docker run … -v "$VOL_SUITE":/data alpine`-Form aus §L.2. **Wer
hier eine Zeile ändert, ändert sie in allen dreien** — sonst probt die Generalprobe eine andere
Abfrage, als die zwei ⛔-Sperren im Fenster und beim Abbau fahren. ⚠️ **Der Generalproben-Lauf ist
KEINE Abbau-Sperre.**

```bash
sqlite3 "$DATA_DIR/radio.db" "
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
     and last_updated_at not glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';"
```

* **Alle ZEHN Zeilen MÜSSEN `0` sein** — neun Zahlgrenzproben **plus** die Formatprobe auf
  `devices.last_updated_at`. ⚠️ Wer „drei" oder „neun" liest, kürzt unter Zeitdruck und lässt
  Spalten ungeprüft, die genau denselben Fehler tragen können.
* `946684800` = 2000-01-01T00:00:00Z · `4000000000` = 2096-10-02T07:06:40Z.
* ⚠️ **Beide Grenzen, und die obere ist nicht Zierrat:** `< 946684800` fängt Sekunden in einer
  Millisekunden-Quelle (**Jahr 1970**), `> 4000000000` fängt die **Gegenrichtung** — rohe
  Millisekunden, die ungeteilt in einer Sekundenspalte landen (**Jahr 57000**).
* ⚠️ **Neun Spalten sind Zahlen, die zehnte ist Text.** `devices.last_updated_at` ist die einzige
  Spalte mit Typwechsel; für sie ist die Grenzprobe eine **Formatprobe**. **Sie sagt nichts über die
  Zone** — das tut nur die Sollwert-Regel in §S.4 und der Unit-Test dahinter.

> Z: zehn Zeilen abgelesen, alle `0`? ☐ ja ☐ nein — abweichende Zeile(n): ____________________

**Abweichung in Z bedeutet:** genau den Faktor-1000-Fehler, und die Zeile sagt, in welcher Spalte. Der
Mapper hat je Feld eine eigene Zeile — eine einzelne betroffene Spalte ist deshalb **plausibel** und
nicht „dann stimmt gar nichts". **Rückweg:** Mapper korrigieren · `rm -rf "$GP"` · §P.4 von vorn.
⚠️ **Nicht** die Werte in der Ziel-DB umrechnen: der nächste Lauf schriebe sie wieder falsch, und die
Korrektur stünde nirgends im Code.

⚠️ **Und der Fall, der wie ein Fehler aussieht und keiner ist:** ist `loans` leer oder trägt keine
abgeschlossene Leihe, sind (a), (b) und Z **trivial grün**. Dann steht im Protokoll **„nicht
prüfbar", nicht „grün"** — dieselbe Regel wie bei den Verwechslungspaaren. Das ist der Haken **G5**.

### §P.8 — Der ephemere Prüfcontainer

⛔ **Der einzige Weg, vor dem Umschwenk überhaupt etwas zu prüfen** — `radio.iuk-ue.de` ist schon
besetzt, und zwei Router auf einer Domain sind eine physische Grenze.

**Ohne Traefik-Labels.** Ein zweiter Router auf ``Host(`radio.iuk-ue.de`)`` ist ausgeschlossen, weil
dieser Container **gar nicht an Traefik hängt**. Erreicht wird er über Loopback und Port.

**Welches Netz: das Standard-Bridge-Netz. Ausdrücklich nicht `proxy`, ausdrücklich nicht `av`.** Der
reguläre Dienst hängt in `networks: [proxy, av]` (`compose.yaml:127`); der Prüfcontainer braucht
keines von beiden. `proxy` ist das Netz, über das Traefik die Container erreicht — ihn dort
herauszuhalten ist der **zweite, unabhängige Riegel** neben den fehlenden Labels. `av` bedient ClamAV
für `files`-Uploads und ist für `radio` ohne Bedeutung.

**Welches Volume: ⚠️ in der GENERALPROBE niemals das produktive.** Prod ist `suite_data` —
deterministisch, ohne Projektpräfix (`compose.yaml:252-254`). Der Prüfcontainer der Probe mountet
das Wegwerf-Verzeichnis aus §P.4. `files_data` und `aufgaben_data` werden ebenfalls **nicht**
gemountet; der Container ist für die Dauer der Probe eine Suite ohne Dateien und ohne Aufgaben —
**das ist richtig und kein Mangel.**

> **Der Riegel, mit seinem Geltungsbereich:** die `docker run`-Zeile **DER GENERALPROBE** enthält die
> Zeichenkette `suite_data` nicht. ⚠️ Für den **Fenster**-Prüfcontainer (§C Schritt 8) gilt er
> **nicht** — dort ist es das Prüfobjekt. Wer ihn ohne Geltungsbereich zitiert, macht Schritt 8
> unausführbar.

```bash
IMG=<die Image-Referenz aus §P.0>
GP=<der Pfad aus §P.0>
UID_APP=<aus §P.4 Handgriff 0>          # bzw. die Server-Kennung ⬜ N3
GID_APP=<aus §P.4 Handgriff 0>

docker run --rm -d --name radio-gp \
  --user "$UID_APP:$GID_APP" \
  -p 127.0.0.1:3999:3000 \
  -v "$GP/data":/data \
  -e DATA_DIR=/data \
  -e SUITE_HOST_RADIO=localhost,radio.iuk-ue.de \
  -e SUITE_ADMIN_GROUP_RADIO=radio-verwaltung-gp \
  -e SUITE_UPDATER_GROUP_RADIO=radio-updater-gp \
  -e RADIO_AUSLEIH_SITZUNG_SECRET="$(openssl rand -hex 32)" \
  -e RADIO_HISTORIE_PURGE=0 \
  -e AUTH_SECRET="$(openssl rand -hex 32)" \
  -e AUTH_URL=http://localhost:3999 \
  -e AUTH_TRUST_HOST=true \
  -e AUTH_DEV_LOGIN=true \
  "$IMG"
```

⛔ **`SUITE_UPDATER_GROUP_RADIO` ist gegenüber den Plänen NEU und gehört dazu.** Die Pläne vom
2026-08-18 kannten **eine** Rechtestufe; die Betreiberentscheidung **C.6/B4 vom 2026-08-21** hat
**zwei** entschieden, und sie sind gebaut: `admin/(arbeit)/layout.tsx:61` ruft
`requireRadioVerwaltung()`, `admin/(druck)/layout.tsx:49` bleibt bei `requireRadioAdmin()`, und **drei
der zehn Verwaltungsseiten bleiben auf der Admin-Stufe** — `/admin/versionen`
(`admin/(arbeit)/versionen/page.tsx:86`), `/admin/zugaenge`
(`admin/(arbeit)/zugaenge/page.tsx:108`) und `/admin/zugaenge/blatt`. Ohne diese Env-Zeile ist die
Updater-Stufe in der Probe **geschlossen**, und die Negativprobe V11b (§P.10) prüft nichts.

⚠️ **`SUITE_HOST_RADIO` trägt ZWEI Werte, und das ist der Unterschied zwischen einer Prüfung und
einem Selbstbetrug.** Der kopfgestützte Prüfsatz (§P.9) fährt `curl -H 'Host: radio.iuk-ue.de'`;
der browsergestützte (§P.10) fährt `http://localhost:3999`. **Mit nur `localhost` beansprucht
`radio` genau den Host `localhost` — der Kopf `radio.iuk-ue.de` träfe dann KEIN Modul und fiele auf
das Portal zurück.** `moduleForHost` vergleicht **exakt** gegen `prodHostsFor`
(`src/core/registry.ts:251-258`), das Portal führt `prodHosts: ["iuk-ue.de"]` als Code-Default, und
`decideRoute` endet mit `moduleForHost(host) ?? getModule("portal")` und für `groups === null` in
`{ action: "login" }` (`src/core/routing.ts:79-83`). **Die kopfgestützten Zeilen prüfen dann den
Portal-Login, nicht `radio` — und zwei davon wären dabei grün.**

**Warum die Kommaliste zulässig ist, nachgeschlagen und nicht angenommen:** `envHostsFor` splittet auf
`,` und trimmt (`src/core/hosts.ts:39-46`) · `validateHostConfig` weist einen Wert nur ab, wenn er `/`
oder `:` enthält (`:80-85`) — ein `SUITE_HOST_RADIO=localhost:3999` wäre dagegen ein Startabbruch ·
die Doppelvergabeprüfung (`:86-95`) bleibt still · `moduleForHost` schneidet den Port ab
(`registry.ts:226`) · `/login`, `/api/auth`, `/api/health` und `/_next` sind PASSTHROUGH
(`src/core/routing.ts:12`).

**Zulässige Alternative, falls jemand nur einen Wert je Container will:** zwei getrennte `docker run`
mit je einem Wert und je einem Port. **Nicht zulässig ist ein Container mit einem Wert und beiden
Prüfsätzen.**

**Zeile für Zeile — jede ist eine Prüfung oder vermeidet eine Falle:**

| Zeile | Warum sie so lautet |
|---|---|
| `--rm -d --name radio-gp` | benannt, damit `docker logs`/`docker stop` ohne ID gehen; `--rm`, damit kein Prüfcontainer liegen bleibt und irgendwann als „der läuft doch" gelesen wird |
| `--user "$UID_APP:$GID_APP"` | §P.4 Handgriff 0: der Import muss dieselbe Kennung benutzt haben wie der Prozess. ⚠️ Weicht die Server-Kennung ⬜ **N3** ab, steht **sie** hier |
| `-p 127.0.0.1:3999:3000` | ⚠️ **die Bindung an `127.0.0.1` ist Absicht.** Ohne sie ist die Probe von außen erreichbar — mit `AUTH_DEV_LOGIN=true` und einem echten Bestand samt Ausleihernamen darin. Der Container hört auf 3000 (`compose.yaml:155`) |
| `-v "$GP/data":/data` + `DATA_DIR=/data` | derselbe Pfad wie im regulären Stack (`compose.yaml:79`), nur ein anderes Ziel |
| `SUITE_HOST_RADIO=localhost,radio.iuk-ue.de` | beide Prüfsätze aus **einem** Container, siehe oben |
| `SUITE_ADMIN_GROUP_RADIO=radio-verwaltung-gp` | Pflicht, sonst startet die **gesamte** Suite nicht. Der Wert ist frei erfunden und darf es sein — **⬜ E1 blockiert diese Probe nicht** (§0) |
| `SUITE_UPDATER_GROUP_RADIO=radio-updater-gp` | die zweite Rechtestufe (C.6/B4). **Nicht** Pflicht: leer ist ein **gültiger** Zustand (§0.2) — deshalb steht sie hier und **nicht** im Rot-Lauf |
| `RADIO_AUSLEIH_SITZUNG_SECRET` | Pflicht, ≥ 32 Zeichen, **≠ `AUTH_SECRET`** |
| `RADIO_HISTORIE_PURGE=0` | §P.11 — und **zeichengenau `0`**: `=false`/`=off`/`=nein` schalten **nicht** ab und laufen still weiter (`_lib/boot.ts:628`) |
| `AUTH_SECRET` | frisch erzeugt, **nie** der Prod-Wert in einem Prüfcontainer |
| **`AUTH_URL=http://localhost:3999`** | ⚠️ **die Zeile, die am leichtesten fehlt und deren Fehlen wie ein Moduldefekt aussieht.** Auth.js leitet seine `baseUrl` daraus ab — **immer**. Im regulären Stack steht sie in `compose.yaml:80`; ein `docker run` ohne die Zeile hat sie **nicht**. Sie muss **zeichengleich die Origin der Probe** sein, sonst führt der Dev-Login aus `localhost:3999` heraus und kommt nicht zurück |
| **`AUTH_TRUST_HOST=true`** | im regulären Stack unbedingt gesetzt (`compose.yaml:82`). Fehlt sie, misstraut Auth.js dem Host der Probe |
| `AUTH_DEV_LOGIN=true` | `src/core/auth/devLogin.ts:10-11`: „force on (**even in production**)". Nur so ist die Verwaltungsfläche ohne Pocket ID prüfbar — und weil Pocket ID ungefragt bleibt, braucht die Probe **kein** `POCKET_ID_*`. ⛔ Im **Fenster** fällt diese Zeile weg (§C Schritt 8) |
| **kein** `SUITE_SEED` | ein geseedeter Zugangscode wäre ein **gültiger anonymer Zugang** zum ganzen Bestand. Abgelesen wird die Zusage in §P.5 (`select count(*) from zugangscodes;` MUSS 0 sein) |
| **kein** `SUITE_TRAEFIK_RULE` | die Warnung „Host nicht in der Rule" feuert nur, wenn **beide** Variablen gesetzt sind. Ohne die Rule bleibt sie still — im Prüfcontainer richtig, weil die Labels auf dem Server leben |
| **kein** `AUTH_COOKIE_DOMAIN` | ⚠️ **bewusst, mit einer benannten Folge** — siehe §P.14, die siebte Aussage |
| **keine** `labels:` | siehe oben |

#### Die Env-Liste ist selbst eine Prüfung — und wird EINMAL absichtlich rot gefahren

**Sobald `SUITE_HOST_RADIO` einen Wert hat, ist `radio` eingeschaltet**, und damit laufen im
Prüfcontainer **dieselben Boot-Prüfungen wie in der Produktion**; jeder zurückgegebene String
**ist** ein Startabbruch (`src/core/bootstrap.ts:92`). Die vollständige Liste mit ihren
Leerwert-Bedeutungen steht in **§0.2**; blockierend sind: fehlendes `SUITE_ADMIN_GROUP_RADIO` ·
fehlendes, zu kurzes oder mit `AUTH_SECRET` identisches `RADIO_AUSLEIH_SITZUNG_SECRET` · ein
**gesetztes** `SUITE_ACCESS_GROUP_RADIO` · `RADIO_HISTORIE_MONATE=0`.

**Das ist ein Gewinn, kein Hindernis.** Die Generalprobe ist die erste und einzige Gelegenheit, die
Boot-Prüfungen unter echten Bedingungen feuern zu sehen. **„Für die Boot-Haken gibt es kein Netz."**

**Vorgeschriebener Handgriff — die Probe wird EINMAL absichtlich rot gefahren:**

```bash
docker run --rm --name radio-gp-rot \
  --user "$UID_APP:$GID_APP" -p 127.0.0.1:3999:3000 \
  -v "$GP/data":/data -e DATA_DIR=/data \
  -e SUITE_HOST_RADIO=localhost,radio.iuk-ue.de \
  -e RADIO_AUSLEIH_SITZUNG_SECRET="$(openssl rand -hex 32)" \
  -e AUTH_SECRET="$(openssl rand -hex 32)" -e AUTH_URL=http://localhost:3999 \
  -e AUTH_TRUST_HOST=true \
  "$IMG"
# ohne SUITE_ADMIN_GROUP_RADIO — ERWARTET: Startabbruch, Meldung im Vordergrund lesen
```

⛔ **Der Rot-Lauf hängt an `SUITE_ADMIN_GROUP_RADIO` und NICHT an `SUITE_UPDATER_GROUP_RADIO`.** Eine
fehlende Updater-Zeile ist **kein** Startabbruch, sondern ein gültiger Zustand (§0.2) — ein zweiter
Rot-Lauf darauf wäre eine falsche Zusage und bliebe grün.

> Abbruchmeldung wörtlich: ____________________________________ · gelesen am ____________

**Wer diesen Abbruch nie gesehen hat, weiß am Cutover-Abend nicht, ob eine startende Suite die
Prüfungen bestanden hat oder ob sie nie gelaufen sind.** Danach die Variable wieder setzen und den
Container aus dem Block darüber starten.

#### Startprobe statt blindem Warten

```bash
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3999/api/health || true)
  [ "$code" = "200" ] && { echo "bereit nach ${i}s"; break; }
  sleep 1
done
docker logs radio-gp 2>&1 | tail -30

# Gegenprobe des Riegels, am LAUFENDEN Container und nicht am Gedaechtnis:
docker inspect radio-gp --format '{{json .Mounts}}' | grep -c suite_data   # MUSS 0 sein
docker inspect radio-gp --format '{{json .Mounts}}'                        # zum Mitlesen
```

⚠️ **`/api/health` ist hier richtig und nur hier:** die Route ist PASSTHROUGH und braucht **keinen**
`Host`-Kopf, und sie liefert konstant `{status:"ok"}` **ohne Modul und ohne Datenbank** — als
**Bereitschaftsprobe** genau richtig, als Modulbeleg wertlos. Der Modulbeleg ist `/api/health/radio`
in §P.9 (V3), und ⛔ **`/api/health` steht nie an seiner Stelle** (§Z.6).

**Abbruch:** Antwortet nach 30 Sekunden nichts, ist der Container **gestartet und wieder
ausgestiegen** — das ist fast immer eine der Boot-Prüfungen und **kein Moduldefekt**. Rückweg:
`docker logs radio-gp 2>&1 | tail -30` lesen, die genannte Env-Zeile ergänzen, neu starten. ⚠️
**Nicht** bei `files` suchen (§P.4 Handgriff 1).

#### Wie der Modul-Host vorgetäuscht wird — drei Stufen, zwei davon verbindlich

| Stufe | Form | Kauft | Kauft **nicht** |
|---|---|---|---|
| **1** | `curl -H 'Host: radio.iuk-ue.de'` gegen `127.0.0.1:3999` | jede HTTP-Aussage: Status, Kopfzeilen, Weiterleitung, Rumpf — mit dem **zeichengleichen** Prod-Host im Kopf | alles, was einen Browser braucht |
| **2** | Browser auf `http://radio.localtest.me:3999` | Modulauflösung ohne jede Env-Zeile (`src/core/registry.ts:228`) | ⚠️ **kein sicherer Kontext** und damit **kein Secure-Cookie**. Der Ausleihweg **sieht dort kaputt aus, obwohl er es nicht ist** |
| **3** | Browser auf `http://localhost:3999` | dasselbe **plus** vertrauenswürdiger Origin: sicherer Kontext, Secure-Cookies werden angenommen | den echten TLS-Handschlag, Cloudflare, den echten Hostwert |

**Verbindlich ist Stufe 1 für alles Kopfgestützte (§P.9) und Stufe 3 für alles Browsergestützte
(§P.10).** Stufe 2 steht hier nur, damit niemand sie für den bequemen Weg hält: **sie ist der Weg,
der eine intakte Ausleihe als Fehler ausweist.**

⚠️ **Stufe 3 ist ZWEI zeichengleiche Werte, nicht einer:** `AUTH_URL` muss mitwandern und
`http://localhost:3999` lauten. Der Präzedenzfall heißt im Haus anders und meint dasselbe:
`docs/runbooks/lagerbuch-cutover.md:158`, dort „der teuerste Einzelposten aus dem Bau von Teil 4".

⛔ **Was Stufe 3 ausdrücklich NICHT beweist — die wichtigste Einschränkung dieses Abschnitts.** Sie
beweist, dass das Modul unter **einem beanspruchten Host** arbeitet. Sie beweist **nicht**, dass der
Produktionswert `SUITE_HOST_RADIO=radio.iuk-ue.de` in der echten `.env` richtig gesetzt ist. Genau
dieser Fehlfall ist **stumm**: die Allowlist in `src/core/auth/redirect.ts` erkennt einen Modul-Host
über **genau** diese Variable; fehlt der Wert, wirft Auth.js den Nutzer nach dem Login aufs Portal,
ohne Fehler und ohne Meldung — und, wörtlich: **„Ein curl sieht davon nichts"**
(`src/core/hosts.ts:59-63`).

**Die Wahl zwischen Weg A und Weg B fällt HIER und VOR dem Cutover-Abend, nicht an ihm:**

* **Weg A:** ein temporärer echter Host `radio-neu.iuk-ue.de` samt `SUITE_TRAEFIK_RULE`-Eintrag.
  ⚠️ Beim Wechsel gilt **dieselbe** Prüfung noch einmal — der Rückweg hängt am **Wert**, nicht am
  Code.
* **Weg B:** Nachprüfung als **erster** Schritt nach dem Umschwenk, mit `SUITE_HOST_RADIO=` leeren als
  benanntem Rückweg (§0.2) und einer **namentlich benannten** Person.

> Gewählt: ☐ Weg A ☐ Weg B · entschieden am ____________ · Person ____________________

⚠️ **Und ein zweiter Unterschied, der leicht verschwimmt:** bei Weg A wird `/m/radio` auf dem
Portal-Host gar nicht angefasst; bei Stufe 3 ist der interne Pfad weiter erreichbar — `decideRoute`
behandelt `/m/<key>` in einem **eigenen Zweig**, der den Host **nicht** ansieht
(`src/core/routing.ts:57-67`). **Die Negativprobe ist deshalb Pflicht: V7 in §P.9.**

#### Nur falls ein echter TLS-Handschlag gebraucht wird — benannt und NICHT empfohlen

Stufe 3 liefert einen **sicheren Kontext** ohne TLS, weil `localhost` als vertrauenswürdiger Origin
gilt. Was sie nicht liefert, ist ein echter Handschlag und der **Kopfzeilen-Vorlauf** eines
Reverse-Proxys. Wer das braucht, stellt einen TLS-Abschluss davor, der `X-Forwarded-Host` setzt — und
trifft damit den Zweig, den die Produktion wirklich benutzt (`src/core/routing.ts:37`,
`x-forwarded-host` **vor** `host`):

```yaml
# gp-compose.yaml — NUR fuer die Generalprobe. Keine traefik.*-Labels, kein proxy-Netz.
services:
  app:
    image: ${IMG}
    user: "${UID_APP}:${GID_APP}"     # abgelesen in §P.4, nicht eingetragen
    volumes: ["${GP}/data:/data"]
    environment:
      DATA_DIR: /data
      SUITE_HOST_RADIO: radio.iuk-ue.de   # ⚠️ nur zulaessig, weil KEIN Router hier haengt
      SUITE_ADMIN_GROUP_RADIO: radio-verwaltung-gp
      SUITE_UPDATER_GROUP_RADIO: radio-updater-gp
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

1. ⛔ **`SUITE_HOST_RADIO=radio.iuk-ue.de` steht hier nur deshalb, weil dieser Stack keinen Router
   trägt. Dieselbe Zeile in der echten `.env` IST der Umschwenk** (§0.2). Die Datei heißt
   `gp-compose.yaml` und **nicht** `compose.override.yaml`, damit ein `docker compose up -d` im
   Projektverzeichnis sie **nicht** einliest.
2. Der Browser muss das Caddy-interne Zertifikat annehmen. **Eine durchgeklickte Zertifikatswarnung
   ist kein sicherer Kontext im Sinne des Cookie-Verhaltens** — wer prüfen will, ob das Cookie
   ankommt, prüft es **an dieser Stelle noch einmal** und glaubt nicht dem Erfolg auf Stufe 3.

**Empfehlung: Stufe 3, nicht diese Form.** Ein Container statt zwei, eine Env-Zeile statt eines
Zertifikats — und der Zweig, der hier zusätzlich getroffen wird, ist nach dem Umschwenk in einem
Atemzug nachprüfbar (§D). **Diese Form steht hier, damit sie im Fenster nicht erfunden wird.**

### §P.9 — Der kopfgestützte Prüfsatz (Stufe 1)

**Alle Zeilen laufen, nicht nur die erste.** Der Container aus §P.8 läuft.

```bash
B=http://127.0.0.1:3999
H='Host: radio.iuk-ue.de'

# V0) DIE PROBE VOR ALLEN PROBEN: antwortet ueberhaupt `radio` — oder der Portal-Fallback?
curl -s -H "$H" "$B/" | grep -c 'gate-code'            # MUSS >= 1
curl -s -H "$H" "$B/" | grep -ci 'anmelden\|login'     # zur Gegenlese

# V1) Die Gate-Flaeche antwortet unter dem radio-Host.
curl -si -H "$H" "$B/" | head -3                       # erwartet: 200

# V2) /admin riegelt anonym ab — als WEITERLEITUNG in den Login, nicht als 404.
curl -si -H "$H" "$B/admin" | grep -iE '^HTTP/|^location:'

# V3) Health, mit Revision — der einzige Beleg, dass der NEUE Stand antwortet.
curl -s -H "$H" "$B/api/health/radio"

# V4) Der CSV-Export antwortet anonym 404, nicht 403.
curl -s -o /dev/null -w '%{http_code}\n' -H "$H" "$B/admin/geraete/export"

# V5) Der Abraeum-Worker liegt im Image und ist der richtige.
curl -si -H "$H" "$B/sw.js" | head -5
curl -s  -H "$H" "$B/sw.js" | grep -c 'registration.unregister'   # MUSS >= 1
curl -s  -H "$H" "$B/sw.js" | grep -c 'caches.keys'               # MUSS >= 1
curl -s  -H "$H" "$B/sw.js" | grep -c 'addEventListener("fetch"'  # MUSS 0 sein

# V6) Der Modul-Riegel auf einem FREMDEN Host — ueber den INTERNEN Pfad (✅ N4).
curl -si -H 'Host: iuk-ue.de' "$B/m/radio/sw.js" | head -3
# Gegenstueck, das etwas ANDERES misst (siehe unten):
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: iuk-ue.de' "$B/sw.js"

# V7) Der interne Pfad auf dem Portal-Host (✅ L8).
curl -si -H 'Host: iuk-ue.de' "$B/m/radio" | head -3

# V8) siehe §P.1 Nr. 3 — R36 ist bei radio KEIN curl, sondern eine Abwesenheitspruefung im Repo.
```

**Zu V0 — warum eine Probe vor allen Proben steht.** Der Portal-Fallback ist **still**: trifft der
`Host`-Kopf kein Modul, endet `decideRoute` mit `moduleForHost(host) ?? getModule("portal")`
(`src/core/routing.ts:79`), und für einen anonymen Abruf mit `groups === null` folgt
`{ action: "login" }` (`:70-73`). **Das Portal antwortet dann genau so, wie man es von einem
funktionierenden Riegel erwartet** — V2 wäre grün, V6 wäre grün, und beide hätten nichts geprüft.

⚠️ **Der Anker ist gegenüber den Plänen BERICHTIGT, und die Berichtigung ist gemessen.** Die Pläne
vom 2026-08-18 setzten hier ⬜ L10, „die Zeichenkette aus dem Ausleih-Rahmen". Der Bau zeigt: ein
**anonymer** `GET /` rendert das **Gate** (`src/app/m/radio/page.tsx:126-158`), **nicht** den
`AusleihRahmen` — die Weiche `if (zugang) redirect("/geraete")` (`:76`) greift nur **mit** Sitzung,
und der Rahmen trägt Sitzungsetikett und Fußnavigation, die am Gate gerade fehlen
(`page.tsx:38-40`). ⛔ **`radio-ausleih-rahmen` als V0-Anker wäre hier zwangsläufig `0` und ließe
den ganzen Prüfsatz als „Portal-Fallback" abbrechen, obwohl alles richtig ist.**

* **V0 nimmt deshalb `gate-code`** — das Codefeld des Gates, `src/app/m/radio/_ui/GateFormular.tsx:122`.
  Gegengelesen am 2026-08-27, in **beide** Richtungen: `rtk grep -rn 'gate-code' src/app/m/portal src/core`
  findet **nichts** (die Zeichenkette gehört allein dem Modul), und sie steht **im ausgelieferten
  HTML** und nicht nur im JSX — zwei e2e-Läufe greifen sie im echten Browser ab,
  `e2e/radio-zugang.spec.ts:360` und `e2e/radio-kiosk.spec.ts:187`
  (`GATE_CODEFELD = "[data-rolle='gate-code']"`).
* **✅ L10 = `radio-ausleih-rahmen` bleibt gültig und wandert nach §P.10**, wo der Rahmen nach dem
  Einlösen eines Codes wirklich rendert. Er ist dort mit `_ui/AusleihRahmen.test.tsx:483-524`
  abgeriegelt: die Zeichenkette steht im **gerenderten** HTML, die Belegzeile im Dateikopf nennt genau
  diesen Wert, sie trägt keinen Umlaut, und sie kommt **in keiner Portal- und keiner core-Quelle** vor.

**Abbruch:** V0 = 0 → der Kopf trifft kein Modul. **Rückweg:** `SUITE_HOST_RADIO` im laufenden
Container prüfen —
`docker inspect radio-gp --format '{{json .Config.Env}}' | tr ',' '\n' | grep SUITE_HOST` —, er muss
**beide** Werte tragen. **Kein einziger der Prüfsätze wird ausgewertet, bevor V0 grün ist.**

> V0: Treffer `gate-code` = ____ (MUSS ≥ 1) · Login-Wörter im selben Rumpf = ____
> V1: Statuscode ____ (erwartet 200)

**Zu V2 und V4 — zwei Riegelformen, und der naheliegende Sollwert ist der falsche.**

| Fall | Erwartung | Wo geprüft |
|---|---|---|
| anonym auf `/admin` (**Seite**) | **Weiterleitung (3xx)** in den Login, mit `callbackUrl` — der genaue Code ist ⬜ **L7** | V2 |
| angemeldet **ohne** Verwaltungsgruppe auf `/admin` (**Seite**) | **404** | V11, §P.10 |
| angemeldet **nur als Updater** auf `/admin/zugaenge` (**Seite**) | **404** | V11b, §P.10 |
| anonym auf `/admin/geraete/export` (**Route Handler**) | **404**, nie 403 und nie ein Login-Umweg | V4 |

Der Unterschied zwischen Zeile 1 und Zeile 4 ist keine Unsauberkeit, sondern die Bauform: Seiten und
Server Actions rufen `requireRadioAdmin()` bzw. `requireRadioVerwaltung()`, **Route Handler unter
`admin/` rufen `radioHostOderNull` + `istRadioAdmin(await viewerOderNull())` und bauen ihre Antwort
selbst** — `admin/(arbeit)/geraete/export/route.ts:77-78` und `:85-86` liefern beide
`new Response(null, { status: 404 })`. ⛔ **Wer V2 und V4 denselben Sollwert gibt, hat eine der beiden
Bauformen kaputtgeprüft** (Kopfabschnitt, Punkt 5).

⬜ **L7 wird HIER abgelesen und steht nirgends vorher.** Der Bau schreibt es aus:
`redirect()` wählt den Code (307 oder 302) zur Laufzeit, „ein hier festgeschriebenes 302 wäre eine
Zusage über eine Bauform, die Spec 1 nicht festlegt" (`src/app/m/radio/_lib/zugang.ts:381-384`).
**Die FORM des Ziels ist dagegen lesbar und wird gegengeprüft:**
`/login?callbackUrl=<encodeURIComponent(verwaltungsZiel(kopf))>` (`_lib/zugang.ts:513`), und
`verwaltungsZiel` baut `<proto>://<prodHost oder angefragter Host>[:port]/admin` (`:387-396`).
⚠️ Nennt die `callbackUrl` **nicht** den Host aus dem `Host`-Kopf, ist das derselbe stumme Fehlfall
wie beim Login-Rückweg (§P.8, Weg A/Weg B).

> V2: Statuscode ____ (⬜ **L7**, hier abgelesen) · `location:` = ____________________ ·
> nennt sie `radio.iuk-ue.de`? ☐ ja ☐ nein · endet der Pfad auf `/admin`? ☐ ja ☐ nein
> V4: Statuscode ____ (erwartet **404**)

**Abbruch:** V2 = 404 → **die Seite ruft den Riegel gar nicht**. V4 = 403 oder 3xx → der Handler
benutzt die Seitenform. Beides ist **Klasse C**.

**Zu V3, weil `200` allein zu wenig ist.** `/api/health/radio` wäre gegen eine frisch angelegte,
**leere** `radio.db` grün. Was zählt, sind die Felder im Rumpf — die Tafel mit Beleg je Feld steht in
**§Z.6** und wird hier nicht zweimal geschrieben: `module` = `"radio"`, `status` = `"ok"` **erst nach**
`openModuleDatabase(...)` plus `db.prepare("SELECT 1").get()`, `revision` = Commit-SHA, **200** bei
`ok`, sonst **503**.

⚠️ **200 heißt „das Modul ist im Image", 503 heißt „falsches Image"** — `getModule` wirft bei
unbekanntem Key (`src/core/health/index.ts:7`). Die billigste Image-Prüfung, die es gibt. Gemessen im
e2e-Lauf: `e2e/radio-hosts.spec.ts:623-628` (200, `module === "radio"`, `revision` als Zeichenkette).

> V3: `status` = ____ · `module` = ____ · `revision` = ____________________ ·
> Sollwert ⬜ **L5** aus **§A Nr. 1** = ____________________ · gleich? ☐ ja ☐ nein

**Abbruch V3 = 503: Klasse A — Absage, nicht Anpassung.** Falsches Image; kein Handgriff am
Cutover-Abend behebt das, es braucht einen CI-Lauf.

**Zu V5.** Der Handler steht in `src/app/m/radio/sw.js/route.ts:29-39`, der Rumpf in
`_lib/sw-quelle.ts:56-73`. Zusicherungen, **gemessen** in `e2e/radio-hosts.spec.ts:581-598`:
`content-type: text/javascript; charset=utf-8` · `cache-control: no-cache` · im Rumpf
`self.registration.unregister()` und `caches.keys()` · **kein `fetch`-Handler** („Ein Worker ohne
`fetch`-Handler lässt jede Anfrage unberührt zum Netz").

> V5: content-type = ____________________ · `registration.unregister` ____ · `caches.keys` ____ ·
> `addEventListener("fetch"` ____ (MUSS 0)

**Zu V6 — hier steht die Rechnung, weil die naheliegende Zeile den falschen Riegel misst.** Die
Absicht ist: **der Modul-Riegel `hostAbweisung` liefert `/sw.js` auf einem fremden Host nicht aus** —
als **nicht werfende** Absage, denn ein `notFound()` wäre eine HTML-Seite mit
`Content-Type: text/html`, und der Browser meldete etwas anderes als eine klare Absage
(`_lib/hostRiegel.ts:7-9`).

⚠️ **Über den Host-Zweig ist dieser Riegel nicht erreichbar.** `curl -H 'Host: iuk-ue.de' "$B/sw.js"`
löst über `moduleForHost("iuk-ue.de")` → **portal** auf; `portal` ist `requiresAuth: true`, und für
`groups === null` endet `decideRoute` in `{ action: "login" }`. **Der Handler des Moduls läuft dabei
nie.** Die Antwort ist ein Portal-Login-3xx — sie erfüllt „liefert ihn nicht", aber aus dem falschen
Grund, und sie wäre auch dann grün, wenn `radio` gar keinen Host-Riegel hätte.

**Erreichbar ist der Handler über den internen Pfad ✅ N4 = `/m/radio/sw.js`**, denn `decideRoute`
prüft `/m/<key>` in einem **eigenen Zweig vor** der Host-Auflösung (`src/core/routing.ts:57-67`).
Der Handler läuft, sieht `Host: iuk-ue.de` und weist ab. **Erwartung: 404** — gemessen,
`e2e/radio-hosts.spec.ts:466` gegen `EINSTIEGE` (`:436-441`), und **falsifiziert**: die Sonde, die den
`??`-Kurzschluss in `sw.js/route.ts:31` entfernt, macht den Eintrag rot (`Expected: 404 / Received:
200`).

> V6: `/m/radio/sw.js` mit `Host: iuk-ue.de` = ____ (erwartet **404**) ·
> Gegenstück `/sw.js` mit `Host: iuk-ue.de` = ____ (**dies misst den Portal-Fallback, nicht den
> Modul-Riegel** — Protokollzeile, kein Sollwert)

**Zu V7 — ✅ L8 ist abgelesen, die Zeile ist damit bewertbar.** Der Sollwert von
`GET /m/radio` mit `Host: iuk-ue.de` ist **404**, gemessen in derselben Schleife
(`e2e/radio-hosts.spec.ts:466`, Eintrag `/m/radio`). ⚠️ **Die Messung lief gegen `FREMDER_HOST`,
nicht gegen den Portal-Host** — bewusst, weil dieser Host dort ein Modul **auflöst** und der 404
damit nachweislich aus dem radio-Host-Riegel kommt und nicht aus einem unaufgelösten Host
(`e2e/radio-hosts.spec.ts:95-97`). Der Riegel ist **hostblind**: er entscheidet, bevor der fremde
Host ein Modul benennt — der Sollwert **404** gilt deshalb für `iuk-ue.de` genauso. ⚠️ **Der 404 kommt aus dem Gate selbst**:
`page.tsx:60` ruft `requireRadioHost(kopf)` **zusätzlich** zu dem Riegel in
`ausleihZugangOderNull` — und die e2e-Sondentafel zeigt, dass **erst das Entfernen BEIDER** Zeilen den
Fall rot macht (`e2e/radio-hosts.spec.ts:188-190`). Das ist die angeordnete Doppelung, kein Versehen.

⚠️ **Die Schleife prüft `not.toBe(404)` auf dem eigenen Host und `toBe(404)` auf dem fremden — und
zusätzlich, dass der fremde Abruf nicht über einen Umweg woanders landet** (`:480`). Wer hier nur den
Statuscode abliest, übersieht genau den Fall, den der Bau eigens abgeriegelt hat.

> V7: Statuscode ____ (Sollwert ✅ **L8** = **404**) · erste Rumpfzeile ____________________

**Zu V8:** R36 ist bei `radio` **keine** HTTP-Probe, sondern die Abwesenheitsprüfung im Repo (§P.1
Nr. 3, `src/app/m/radio/_lib/keine-pwa.test.ts`). Ein `curl` auf `…/manifest.webmanifest` wäre
**immer grün** und läse sich als Zusage.

**Diese neun Zeilen sind die Vorlage für die Verifikation im Fenster (§C Schritt 8) — mit genau zwei
benannten Unterschieden am Container:**

1. `-v suite_data:/data` statt `-v "$GP/data":/data` — dort ist das produktive Volume das
   **Prüfobjekt**.
2. ⛔ **`AUTH_DEV_LOGIN` wird dort NICHT gesetzt.** In der Generalprobe hängt der Dev-Login an einem
   **Wegwerf**-Bestand, im Fenster am **produktiven** Volume.

⚠️ **Der `notFound()`-Zweig (angemeldet, aber nicht in der Gruppe) ist mit `curl` gar nicht
erreichbar** — er braucht eine echte Sitzung und ist damit V11/V11b in §P.10, **kein Statuscode in
dieser Liste.** Das ist zusammen mit §P.10 der Haken **G6**.

### §P.10 — Der browsergestützte Prüfsatz (Stufe 3)

**Browser: Chromium oder Firefox. Adresse: `http://localhost:3999` — nicht `radio.localtest.me`.**
Warum, steht in §P.8: Stufe 2 ist der Weg, der eine **intakte** Ausleihe als Fehler ausweist.

**`zugangscodes` ist nicht Teil des Imports** (§P.5). **Nach dem Import gibt es also keinen einzigen
Code, der eingelöst werden könnte.** Daraus folgt die Reihenfolge — der **Verwaltungsweg ist
Voraussetzung des Ausleihwegs**, nicht ein zweiter, unabhängiger Prüfpunkt:

1. Anmelden über `/login` (Dev-Login) mit der Gruppe `radio-verwaltung-gp`.
2. `/admin/geraete` — der Bestand steht da, mit echten Zeilen aus dem Import.
3. `/admin/zugaenge` — **einen Code ausstellen.** Das ist der erste Code, den es überhaupt gibt.
4. Den Code einlösen: einmal über `/t/<code>` (der gescannte Weg) **und** einmal über das
   Eingabefeld am Gate (der Ausweichweg).
5. Ausleihen, zurückgeben, Historie ansehen.
6. Den Code sperren und die Einlösung erneut versuchen — sie muss scheitern, **und zwar mit dem
   vorgesehenen Text, nicht mit einem Stacktrace**.

⛔ **In der PRODUKTION entsteht der erste Code NACH dem Umschwenk.** Die Reihenfolge oben ist die der
**Probe**, wo ein Dev-Login auf `localhost:3999` möglich ist. Der Grund: das Ausstellen verlangt
`requireRadioAdmin()` als erste Anweisung, also eine Anmeldung **auf dem radio-Host** — und bis zum
Umschwenk bedient dieser Host den Alt-Kiosk. **Es gibt vor dem Umschwenk keinen Weg, in der
Produktion einen Code auszustellen** (§F).

⚠️ **Schritt 3 ist zugleich ein Ankündigungsposten, kein reiner Testschritt.** Die 1:1-Übernahme des
heutigen QR-Mechanismus ist ausgeschlossen und damit eine **Verhaltensänderung mit
Ankündigungspflicht**. Ob und wo gedruckte Aufsteller im Umlauf sind, weiß nur der Betreiber
(⬜ **E5** in §0) — **die Frage muss vor dem Umschwenk beantwortet sein**, weil „Bestandscodes
zeichengleich übernehmen" ein **Druck**vorgang wäre und Papier für jedes Tor unsichtbar bleibt.

| # | Schritt | Was ihn scheitern lässt, und wie man es merkt | Ergebnis |
|---|---|---|---|
| **V9** | `/login` → Dev-Login mit `radio-verwaltung-gp` | fehlt `AUTH_DEV_LOGIN=true`, führt der Login gegen Pocket ID und die Rückleitung scheitert — sichtbar als Fehlerseite **des IdP**, nicht der Suite. Fehlt `AUTH_URL`, landet der Login **auf einem anderen Host**, und der Fehler sieht aus wie ein Riegel, der zu viel riegelt | ____ |
| **V10** | `/admin/geraete` zeigt echte Zeilen aus dem Import | leere Tabelle bei nicht-leerem `select count(*)` → **Falle 9** (`columns[].render` aus einer Server Component, `CLAUDE.md`), sichtbar **nur hier**, nie im Build | ____ |
| **V11** | Negativprobe: abmelden, neu anmelden **ohne** Verwaltungsgruppe → `/admin` ist **404** | eine gerenderte Verwaltungsseite heißt: der Riegel steht nicht in **jeder** Datei. Mit `requiresAuth: false` erbt `/admin` **kein** Middleware-Gating | ____ |
| **V11b** | Zweite Negativprobe, **neu seit C.6/B4**: anmelden **nur mit `radio-updater-gp`** → **sechs** Seiten erreichbar, **vier** 404 (Tafel unten) | wer `requireRadioVerwaltung()` auf **alle zehn** Seiten setzt, senkt genau die vier Flächen ab, die **Zugangscodes** und **Massenschreibwege** tragen — und das ist still | ____ |
| **V12** | `/admin/zugaenge`: Code ausstellen, Blatt drucken (`/admin/zugaenge/blatt`, Druckvorschau) | erbt das Druckblatt Kopfzeile, Navigation und `controlHeight: 44`, fehlen die zwei Route-Groups — **still, der Build ist grün, sichtbar nur auf Papier bzw. in der Vorschau** | ____ |
| **V13** | `/t/<code>` aufrufen → **303** auf die Ausleihfläche, **und das Cookie steht danach in den DevTools** | siehe unten | ____ |
| **V14** | Ausleihen, zurückgeben, Historie | eine 500 hier ist ein Fund; **eine falsche Konfliktmeldung ist auch einer** | ____ |
| **V15** | Code sperren, Einlösung erneut versuchen | die Meldung muss aus dem **geschlossenen Satz** der vorgesehenen Texte kommen, nicht aus einem Stacktrace | ____ |
| **V16** | Hell **und** dunkel je Fläche einmal ansehen | Vorbild `lagerbuch-cutover.md:267-284`: Statuschips, Ampelringe, Tabellenkanten. **Keine weiße Fremdfläche im Dunkelmodus, kein abgeschnittener Inhalt.** ⚠️ Der Umschalter hat **drei** Zustände, `auto` ist die Vorgabe (`CLAUDE.md`) — beide Modi ausdrücklich einstellen, nicht dem System überlassen | ____ |

**Abbruch:** Jeder Fund aus V9–V16 ist **Klasse C** — reparieren, dann `rm -rf "$GP"` und die
Generalprobe **von vorn** (§P.13). ⚠️ Ein Fund in V9 ist dabei fast nie ein Moduldefekt, sondern eine
fehlende Env-Zeile (`AUTH_URL`, `AUTH_DEV_LOGIN`); der Rückweg ist **§P.8**, nicht der Bau.

#### Die Rechtestufen-Tafel zu V11b — abgelesen aus dem Bau am 2026-08-27

⛔ **Sie ist gegenüber Spec und Plan berichtigt und muss so gefahren werden.** Der Bau nennt die
Betreiberentscheidung, die den Widerspruch entschieden hat, und zeigt die Zeile:

| Äußerer Pfad | Riegel als erste Anweisung | Updater sieht | Beleg |
|---|---|---|---|
| `/admin` | `requireRadioVerwaltung()` | ✅ | `admin/(arbeit)/page.tsx` |
| `/admin/geraete` | `requireRadioVerwaltung()` | ✅ | `admin/(arbeit)/geraete/page.tsx:53` |
| `/admin/geraete/<id>` | `requireRadioVerwaltung()` | ✅ | `admin/(arbeit)/geraete/[id]/page.tsx` |
| `/admin/geraete/<id>/ereignisse` | `requireRadioVerwaltung()` | ✅ | `admin/(arbeit)/geraete/[id]/ereignisse/page.tsx` |
| `/admin/ausleihen` | `requireRadioVerwaltung()` | ✅ | `admin/(arbeit)/ausleihen/page.tsx` |
| `/admin/software` | `requireRadioVerwaltung()` | ✅ | `admin/(arbeit)/software/page.tsx` |
| `/admin/import` | `requireRadioAdmin()` | ⛔ **404** | `admin/(arbeit)/import/page.tsx:62` |
| `/admin/versionen` | `requireRadioAdmin()` | ⛔ **404** | `admin/(arbeit)/versionen/page.tsx:86` |
| `/admin/zugaenge` | `requireRadioAdmin()` | ⛔ **404** | `admin/(arbeit)/zugaenge/page.tsx:108` |
| `/admin/zugaenge/blatt` | `requireRadioAdmin()` | ⛔ **404** | `admin/(druck)/zugaenge/blatt/page.tsx`, Hülle `admin/(druck)/layout.tsx:49` |

**Sechs erreichbar, vier 404 — zehn Seiten, lückenlos.** Dazu die zwei **Route Handler**, die
`riegel.test.ts` getrennt zählt und die **beide** auf der Admin-Stufe liegen (`istRadioAdmin`, Antwort
`new Response(null, { status: 404 })`): `/admin/geraete/export`
(`admin/(arbeit)/geraete/export/route.ts:85-86`) und `/admin/import/hochladen`
(`admin/(arbeit)/import/hochladen/route.ts:96-97`).

⚠️ **`/admin/import` ist die Zeile, die am leichtesten falsch abgeschrieben wird.** Sie überholt
`Spec:4375` **und** die Planentscheidung E-V4, die beide `requireRadioVerwaltung()` vorsahen; die
Spec widerspricht sich an dieser Stelle selbst (drei Fundstellen, zwei davon „nur Admin"). Maßgeblich
ist die **Betreiberentscheidung V-L5 vom 2026-08-24** — „**Nur Admin**, nicht Updater", begründet mit
„ein CSV-Import schreibt viele Datensätze auf einmal und ist schwer rückgängig zu machen"
(`admin/(arbeit)/import/page.tsx:10-27`). ⛔ Wer hier nach der Spec statt nach dem Bau prüft, meldet
einen Fund, der keiner ist — und wer die Prüfung daraufhin „lockert", öffnet den Massenschreibweg für
die Updater-Stufe.

⚠️ **Der Kommentar in `_lib/zugang.ts:158-161` nennt noch „drei der zehn" und ist an dieser Stelle
überholt** — die V-L5-Entscheidung kam später und hat `/admin/import` als vierte hinzugefügt. **Die
Tafel oben ist aus den Dateien abgelesen, nicht aus dem Kommentar.**

#### ✅ L10 — die Zeichenkette, die hier und nicht in §P.9 hingehört

Sobald ein Code eingelöst ist, rendert der **Ausleih-Rahmen**, und **erst dort** steht ⬜ L10:

> **Ablesung:** Auf `/geraete` (nach V13) trägt das äußere Element
> `data-rolle="radio-ausleih-rahmen"` (`src/app/m/radio/_ui/AusleihRahmen.tsx:125`).
> Im Seitenquelltext suchen: `radio-ausleih-rahmen` — Treffer ____ (MUSS ≥ 1)

Der Wert ist abgeriegelt durch `_ui/AusleihRahmen.test.tsx:483-524`: er steht im **gerenderten**
HTML (nicht nur im JSX), die Belegzeile im Dateikopf (`AusleihRahmen.tsx:21`) nennt genau ihn, er
trägt keinen Umlaut (er ist ein Grep-Anker), und er kommt **in keiner Portal- und keiner
core-Quelle** vor. ⚠️ **Die zweite Hälfte dieser Zusage — dass er im ausgelieferten Portal-HTML fehlt
— kann kein Vitest-Lauf prüfen; sie fährt hier per Browser bzw. in §P.9 V0 per `curl`.**

#### Zu V13 — der echte Zwang zum sicheren Kontext ist das Secure-Cookie

Die Ausleih-Sitzung setzt `secure: process.env.NODE_ENV === "production"`, und `Dockerfile:36` setzt
`ENV NODE_ENV=production`. **Im Prüfcontainer ist das Cookie also `Secure` — genau wie in der
Produktion.** Ein `Secure`-Cookie von einem nicht vertrauenswürdigen Origin wird vom Browser
**verworfen**; auf `http://radio.localtest.me:3999` (Stufe 2) ist der Ausleihweg damit **nicht
benutzbar, obwohl er intakt ist**.

⚠️ **Das ist der teure falsche Schluss:** wer die Probe über Stufe 2 fährt, hält den Gate-Weg für
kaputt und „repariert" ihn — oder er hält ihn für **geprüft**, weil die Seite ja erschien. Der
zweite ist der teurere.

> **Ablesung, nicht Behauptung:** Nach `GET /t/<code>` MUSS das Cookie **`radio_ausleihe`**
> (`_lib/ausleihSitzung.ts:35`) in den DevTools unter *Application → Cookies →
> `http://localhost:3999`* stehen, mit **`HttpOnly`**, **`SameSite=Lax`**, **`Path=/`** und **ohne
> `Domain`-Eintrag**.
>
> V13: Statuscode ____ (erwartet **303**) · Cookie da? ☐ ja ☐ nein · HttpOnly ☐ ·
> SameSite = ________ · Path = ________ · Domain-Eintrag vorhanden? ☐ nein (richtig) ☐ ja (⚠️ **Fund**)

Fehlt es, liegt die Ursache **am Origin und nicht am Modul** — dann ist der Ausleihweg in dieser Probe
**ungeprüft**, und die Probe wird auf Stufe 3 wiederholt, **nicht das Modul angefasst**.

⚠️ **Ein fehlender `Domain`-Eintrag in den DevTools ist ein Indiz, kein Beweis.** Die Cookie-Domain ist
**nie per HTTP prüfbar** (§P.14); der Beweis ist und bleibt die Quelltext-Zusicherung aus §P.1 Nr. 2
(`_lib/ausleihSitzung.test.ts:52-66`).

Der Cookie-Name ist nachgeschlagen und kollidiert **nicht** mit dem Alt-Cookie `radio-inventar.sid`.

#### Zu V12 — was am gedruckten Code jetzt prüfbar ist und was nicht

Ein gedruckter Code trägt eine **absolute** URL auf `https://radio.iuk-ue.de/t/<code>`. **Bis zum
Umschwenk führt diese URL zum Alt-Kiosk** — der Scan ist also vorher **nicht** prüfbar, und keine
Umgehung ändert das.

**Was vorher prüfbar ist, und es ist nicht wenig: die Nutzlast als Text.** Den Code im ephemeren
Container ausstellen, das Druckblatt öffnen, den QR mit einem beliebigen Leser als **Zeichenkette**
auslesen und **zeichenweise** gegen die erwartete URL vergleichen. Ein Tippfehler im Host, ein
fehlendes `https`, ein Modul-Pfad `/m/radio/t/…` statt `/t/…` — **alles drei fällt hier auf und
keines davon nach dem Druck.**

> Nutzlast als Text: ____________________________________ ·
> erwartet: `https://radio.iuk-ue.de/t/<code>` · zeichengleich? ☐ ja ☐ nein

⚠️ **Reihenfolge, damit daraus kein Altpapier wird: gedruckt wird NACH dem Umschwenk** (§F). Papier
ist für jedes Tor unsichtbar.

#### ✅ L9 — warum „die Generalprobe muss über HTTPS laufen" bei `radio` etwas anderes heißt

Bei `lagerbuch` war dieser Satz ein eigener Runbook-Punkt (`lagerbuch-cutover.md:290-310`), und der
Grund war die **Kamera** — zwei Scan-Flächen mit eigenem `BarcodeScanner`, die über `http://`
ausschließlich `KEIN_SICHERER_KONTEXT` zeigen.

✅ **Bei `radio` gibt es diese Fläche nicht — abgelesen am 2026-08-27, nicht angenommen:**

```bash
rtk grep -rn 'getUserMedia|BarcodeDetector|mediaDevices' src/app/m/radio/
```

**Erwartung: kein Treffer.** Der gescannte Code ist bei `radio` **ein GET aus der Adresszeile** (der
Route Handler `t/[code]/route.ts`), und das Eingabefeld am Gate ist der Weg für den Fall, dass die
**Kamera-App des Telefons** nicht will — nicht eine Fläche des Moduls.

**Der Zwang zum sicheren Kontext bleibt trotzdem, und er heißt Secure-Cookie** (V13). ⬜ **L9 ist
damit eingelöst**: die Zweigwahl fällt auf „nein", und Stufe 3 trägt allein wegen des Cookies.

### §P.11 — Das Log der Probe

**`RADIO_HISTORIE_PURGE=0` gehört in die Env des ephemeren Containers** (§P.8). Der Erstlauf steht auf
**1440 Minuten** (`src/app/m/radio/_lib/boot.ts:451`), eine kurze Probe erreicht ihn also gar nicht —
**aber eine Probe, die über Nacht läuft oder mehrfach neu startet, löschte genau die Historie, die
§P.7 gerade nachgewiesen hat.**

Der Schalter ist **nicht stumm, und das ist beabsichtigt:** er meldet „Retention abgeschaltet" als
**`console.info`**, nicht als `console.warn`. **Die Trennung ist scharf und prüfbar — `warn` = Stopp,
`info` = Zustand.** Die Generalprobe ist damit auch die Probe darauf, dass diese Trennung im Log
wirklich so aussieht.

```bash
docker logs radio-gp 2>&1 | head -1              # die ROHZEILE ins Protokoll
docker logs radio-gp 2>&1 | grep -i '\[radio\]'
# erwartet: [radio]-INFO-Zeilen, KEINE [radio]-WARNUNG.
```

⚠️ **Das Muster steht OHNE `^`, und der Grund ist die RICHTUNG des Fehlfalls.** `docker compose logs`
stellt jeder Zeile den **Servicenamen** voran (`suite  | [radio] …`), und eine so präfigierte Zeile
kann `^radio:` **nicht** treffen. Der Befehl liefert dann **leere Ausgabe** — und leere Ausgabe liest
sich als „keine `radio:`-Warnung", also grün. **Eine Stopp-Bedingung, die bei falschem Muster still
bestanden wird, ist keine.** Ohne `^` ist der Befehl unter **beiden** Formen richtig:
`docker logs radio-gp` (unpräfigiert, Generalprobe) und `docker compose logs suite` (präfigiert,
Fenster).

⚠️ **Deshalb wird zusätzlich die erste Rohzeile protokolliert** — damit die Präfixform **aktenkundig**
ist und der nächste Cutover sie nicht wieder raten muss.

**Zwei INFO-Zeilen werden ausdrücklich erwartet und sind Ablesungen, keine Befunde:**

| Zeile | Grep-Anker | Beleg |
|---|---|---|
| die Retention ist abgeschaltet | `Retention abgeschaltet` | `src/app/m/radio/_lib/boot.ts:629-635`, Präfix `[radio] ` |
| der Zustand der **zweiten** Rechtestufe | `SUITE_UPDATER_GROUP_RADIO ist` | `src/app/m/radio/_lib/boot.ts:375` — **„Diese Zeile ist ein ZUSTAND"**, sie erscheint in **allen drei** Fällen (gesetzt / leer / nicht gesetzt) und ist **nie** ein Stopp |

> Erste Rohzeile wörtlich: ____________________________________
> `[radio]`-Zeilen: INFO ____ · WARN ____ · Zustand der Updater-Zeile: ____________________

⛔ **Der Anker ist `[radio]`, nicht `radio:` — abgelesen aus dem Bau am 2026-08-27.** Jede
Meldezeile des Moduls trägt die **eckige** Präfixform, und der Quelltext sagt es an zwei Stellen
wörtlich: „die eckige Form, **NICHT** `radio:`" (`src/app/m/radio/_lib/boot.ts:429`, `:626`).
**Ein `grep -i 'radio:'` trifft damit NICHTS — und leere Ausgabe liest sich als „keine Warnung",
also grün.** Genau der Fehlfall, vor dem der Absatz darüber warnt. Die Pläne vom 2026-08-18 führen
noch den alten Anker; **hier und in §C Schritt 7 / §D Nr. 9 gilt der gemessene.**

⛔ **ZWEI ZEILEN, ZWEI LOG-STUFEN — und die Verwechslung kostet den teuersten stillen Fehlfall des
Abends.** Vor dem Import (§P.4 Handgriff 2) sind **beide** legitim; danach ist **jede von beiden ein
Stopp**. Aber nur **eine** von beiden ist ein `warn`:

| Zeile | Stufe | Beleg | Grep-Anker |
|---|---|---|---|
| „`devices` ist leer" | **`console.warn`** | `_lib/boot.ts:580-586` | `devices ist leer` |
| „`radio.db` existierte vor diesem Start nicht" | ⛔ **`console.info`, NICHT `warn`** | `_lib/boot.ts:399-405` | `existierte vor diesem Start nicht` |

⛔ **Warum der Bau das so gebaut hat, und warum das Runbook es tragen muss:** der Quelltext schreibt
es an Ort und Stelle aus (`_lib/boot.ts:390-396`) — beim **ersten** Deploy, der vor dem Import liegt,
ist die Abwesenheit der Datei legitim, und ein `warn` machte einen vorgeschriebenen, normalen Deploy
zum Stopp-Punkt. „Ihre Alarmwirkung holt das Runbook, indem es diese Zeile an einem benannten Punkt
NACH dem Import NICHT sehen darf." **Dieser Punkt ist hier.**

⛔ **Deshalb hängt der Stopp am ANKER, nicht an der Stufe und nicht an der Zeilenzahl** — dieselbe
Bauform wie bei `Retention abgeschaltet`:

```bash
# ⚠️ Generalprobe: `docker logs radio-gp`. Im Fenster (§C Schritt 7, §D Nr. 9) steht an
#    derselben Stelle `docker compose logs --since 2m suite`.
docker logs radio-gp 2>&1 | grep -c 'existierte vor diesem Start nicht'
# NACH dem Import MUSS das 0 sein. Jede andere Zahl heisst: DATA_DIR zeigt woandershin
# als der Import, oder das Volume ist nicht gemountet. Stopp, kein Hinweis.
docker logs radio-gp 2>&1 | grep -c 'devices ist leer'
# NACH dem Import ebenfalls 0 — diese Zeile ist ein `warn` und faellt zusaetzlich unter
# die WARN-Regel oben.
```

⚠️ **Wer nur WARN-Zeilen zählt, sieht die erste der beiden nicht.** Bei nicht gemountetem Volume
nach dem Import zählt der Betreiber dann **drei INFO und null WARN** — und liest grün.

**Abbruch:** Eine `[radio]`-WARN-Zeile **nach** dem Import ist ein Stopp. **Rückweg:** zuerst §P.4
Handgriff 4 wiederholen — in der Mehrzahl der Fälle liegt die Ursache dort und **nicht** im Modul.
Erst wenn Handgriff 4 sauber ist, ist es ein Fund für den Bau.

### §P.12 — Aufräumen und die zwei Messungen fürs Fenster

```bash
docker stop radio-gp               # --rm entfernt ihn dabei
docker ps -a | grep -c radio-gp    # MUSS 0 sein
rm -rf "$GP"
```

⚠️ **Der Schritt gehört ins Protokoll wie jeder andere.** Ein liegengebliebener Prüfcontainer trägt
`AUTH_DEV_LOGIN=true` und einen echten Bestand samt Ausleihernamen. **Er hängt an keinem Router —
also fällt er niemandem auf**, bis jemand ihn findet.

> Container gestoppt und entfernt (`docker ps -a` = 0) ☐ · `$GP` gelöscht ☐ · am ____________

⚠️ **Wer nach dem Aufräumen noch etwas nachlesen will, hat den Lauf verloren, nicht die Datei
wiedergefunden** — das ist beabsichtigt und der Grund, warum jede Ablesung dieses Abschnitts eine
Protokollzeile hat.

#### ⬜ U8 — die zwei Messungen, die das Fenster bemessen

⛔ **Sie entstehen HIER und nirgends sonst. Am Cutover-Abend sind sie zu spät:** dann bemessen sie ein
Fenster, das schon läuft.

**Wie gemessen wird — beide Hälften, jede mit ihrem Befehl:**

```bash
# (1) Groesse beider Prod-Volumes (E2 = radio-admin, E3 = radio-inventar):
docker system df -v | grep -E '<E2-volume-radio-admin>|<E3-volume-radio-inventar>'

# (2a) Dauer des SQLite-Schnappschusses: NICHT hier neu messen, sondern aus §P.2 uebernehmen —
#      dort laeuft der `.backup` bereits unter `time`.

# (2b) Dauer des Postgres-Dumps von radio-inventar, EINMAL gemessen.
#      Der Datenbankname ist KEINE Leerstelle: POSTGRES_DB: radio_inventar ist hart gesetzt
#      (radio-inventar/docker-compose.yml:10). Nur POSTGRES_USER traegt einen Default und ist E3.
time docker exec <radio-inventar-postgres-container, ⬜ U4> \
  pg_dump -U <⬜ E3: POSTGRES_USER> -Fc -f /tmp/gp-probe.dump -d radio_inventar
```

**Wohin die Zahl geschrieben wird — und das ist der Punkt, an dem U8 sonst verloren geht:**

> **U8** · `radio-admin` Volume ________ · `.backup`-Dauer ________ (**übernommen aus §P.2**)
> **U8** · `radio-inventar` Volume ________ · `pg_dump`-Dauer ________
> gemessen am ____________ · durch ____________________
>
> ⛔ **Eingetragen in ⬜ U8 der Tabelle in §0** — von dort liest sie **§A Nr. 7**, und **nur** von dort.
> Eine Zahl, die allein in diesem Abschnitt steht, erreicht die Fensterplanung nicht.

⚠️ **Der Containername von `radio-inventar` ist ⬜ U4** — die teuerste offene Frage dieses Cutovers und
die einzige, die **kein Befehl** beantwortet (Kopfabschnitt). Sie wird beim Betreiber eingeholt, nicht
geraten. **Bleibt sie offen, wird NUR die `radio-admin`-Hälfte von U8 gemessen und die andere Hälfte
im Protokoll als offen vermerkt — nicht geschätzt.**

**Abbruch: keiner.** Eine fehlende Messung stoppt die Generalprobe nicht; **sie stoppt die
Fensterplanung** (§A Nr. 7). Rückweg: die Messung nachholen, **bevor ein Termin gesetzt wird**.

#### Der nächste Lauf beginnt wieder bei §P.2 — oder bei §P.3

**Verbindlich: jede Generalprobe beginnt mit einem leeren `DATA_DIR`** (§P.4 Handgriff 1). Wer
stattdessen „nochmal importiert", prüft die **Idempotenz des Skripts** und nicht den Import.

**Der Schnappschuss dagegen darf wiederverwendet werden**, solange er derselbe Lauf ist: `.backup`
hält den Alt-Stack nicht an, ein neuer Schnappschuss ist also billig — aber er verändert die
**Zahlen**, gegen die A1 gesetzt wurde. **Entscheidungsregel:**

* **Reparatur am Importer, Schema oder Mapper** → derselbe Schnappschuss, `rm -rf "$GP"`, ab **§P.3**.
* **Reparatur an den Quelldaten** (Klasse B: A2/A3) → **neuer** Schnappschuss ab **§P.2**, weil die
  Bereinigung in der Kopie stattfand und die Kopie damit nicht mehr die Quelle abbildet.

> Lauf-Nr. ____ · Schnappschuss vom ____________ wiederverwendet ☐ / neu gezogen ☐

### §P.13 — Der Abbruchpunkt: was rot macht und was rot bedeutet

⚠️ **Der teuerste Fehler dieses Ports ist paritätsgrün.** Die Grün-Bedingung ist deshalb
**zusammengesetzt. Alle sechs Zeilen, nicht eine Auswahl:**

| # | Messung | Wo | Ergebnis |
|---|---|---|---|
| **G1** | A1–A13 haben ihre Sollwerte, **alle acht blockierenden** (A2 · A3 · A4 · A5 · A6 · A7 · A10 · A11) sind erfüllt | §P.3 | ☐ |
| **G2** | Der Importer endet mit **Exit-Code 0 UND** der Abschlusszeile `Radio-Import OK — <n> Zeilen, Parität grün.` (✅ L6) | §P.4 | ☐ |
| **G3** | **Fünf** Zeilenzahlen im Ziel entsprechen den Sollwerten der Quelle — **paarweise, nicht in der Summe** | §P.5 | ☐ |
| **G4** | Die **fünf** Verwechslungspaare stimmen **zeilengenau** | §P.6 | ☐ |
| **G5** | Die Zeitstempel-Gegenprobe zeigt keinen 1970er-Stand; **Abfrage Z: alle zehn Zeilen `0`** | §P.7 | ☐ |
| **G6** | Der ephemere Container besteht **V0–V16** (einschließlich V11b) | §P.9, §P.10 | ☐ |

> **Die Abbruchbedingung in einem Satz:** *Die Generalprobe ist grün, wenn G1 bis G6 vollständig
> grün sind. Ist eine Zeile rot, ist die Generalprobe rot — es gibt keine teilweise grüne
> Generalprobe, und es gibt keinen Cutover auf einer roten.*

#### Klasse A — absagen, nicht anpassen

| Fund | Warum Absage |
|---|---|
| **Zehnstellige Zeitstempel** in der Quelle (A6) | Dann ist die gesamte Import-Annahme falsch, und der Cutover wird **abgesagt, nicht angepasst**. Die Einheitenentscheidung, die Mapping-Funktionen und der Riegel `[1e12, 4e12]` hängen daran |
| **Trigger oder Views** in `sqlite_master` (A7) | Ein Treffer ist Fachlogik, die kein Repo kennt. Der Grep-Beleg der Analyse gilt für den **Quelltext**, nicht für die laufende Datenbank |
| **V3 antwortet 503** | Falsches Image: `getModule("radio")` wirft. Kein Handgriff am Cutover-Abend behebt das; es braucht einen **CI-Lauf**. Vorbild derselben Härte: `docs/runbooks/suite-update-webfinger.md:43-45` |

**Rückweg bei Klasse A: der Termin wird verschoben.** Es gibt keinen anderen.

#### Klasse B — in der KOPIE bereinigen, Bereinigung protokollieren

**A2** (`is_target` ≠ 1) und **A3** (Waisen): **vor** dem Import **in der Kopie** bereinigen, das
ausgeführte SQL wörtlich ins Protokoll. ⚠️ **Die Bereinigung geschieht in der Kopie und wird im
Echtlauf WIEDERHOLT, nicht vererbt** — eine Bereinigung, die nur in der Generalprobe stattfand, ist ein
Fund, den das Fenster **erneut** trifft. **Und sie zieht einen neuen Schnappschuss nach sich** (§P.12,
Entscheidungsregel).

#### Klasse C — reparieren, dann Generalprobe von vorn

A3 · A4 · A5 · A10 · A11 · **jeder** Fund aus V0–V16 · jedes ungleiche Zählpaar aus G3 · jede
abweichende Stichprobe aus G4 · jede Abweichung aus G5 · jede Differenz ≠ 0 aus der Faltungsprobe
(§P.5) · ein fehlender partieller Index · `zugangscodes` ≠ 0.

**„Von vorn" ist wörtlich zu nehmen:** `rm -rf "$GP"`, neu importieren. **Ein Nachbessern auf dem
bestehenden Stand prüft die Reparatur und nicht den Import.**

#### Klasse D — der Fund, der aussieht wie C und keiner ist

**Ein roter Paritätscheck.** Er heißt **nicht** „es ist nichts passiert": die Parität läuft **nach**
dem Schreibvorgang (`scripts/import/radio.ts:627-645`), das Ziel ist also bereits verändert. **Der
Rückweg ist die gelöschte, leere Ziel-DB, nie ein zweiter Lauf auf demselben Bestand.** In der
Generalprobe kostet das ein `rm -rf`; im Echtlauf ist es der Grund, warum §C gegen eine **leere**
Ziel-DB importiert und nicht gegen eine „fast fertige" (§S, Kopf).

#### Und die Klasse, die keine ist: ein Startabbruch aus den Boot-Prüfungen

Die Meldungen aus §P.8 brechen den Start der **gesamten** Suite ab. Das ist **kein Moduldefekt**,
sondern eine **unvollständige Env** — behebbar in einer Zeile, und die Probe ist danach zu
wiederholen. §P.8 macht diesen Abbruch zum vorgeschriebenen Handgriff, damit er im Fenster
**wiedererkannt** wird.

> **Verschoben wird bei Klasse A. Repariert wird bei B, C, D — aber NIEMALS im Cutover-Fenster.**
> Jede Reparatur zieht eine **vollständige neue Generalprobe** nach sich, und eine vollständige
> Generalprobe passt nicht in ein Fenster ohne Parallelbetrieb.

**Der Grund steht in der Lage selbst:** es gibt **keinen Rückweg-Importer** (Suite → `radio-admin`)
und kein Vorbild dafür. Der Punkt ohne Wiederkehr ist der **erste fachliche Schreibvorgang in
`radio.db` nach dem Umschwenk**. Ein Fund, der im Fenster „schnell" behoben wird, wird also entweder
**vor** diesem Punkt behoben — oder er wird zu einem **Datenverlust mit bekanntem Umfang**.

#### Wann die Generalprobe erfüllt ist — alle zehn Punkte, nicht die meisten

- [ ] 1. Die vier Voraussetzungen aus **§P.1** sind grün und **datiert** — insbesondere Nr. 4 (die
      Retention-Frist) **vor** dem ersten Schnappschuss.
- [ ] 2. Der Schnappschuss aus **§P.2** ist mit `.backup` entstanden, `integrity_check` sagte `ok`,
      der Journal-Modus der Quelle ist **neu gemessen**, und der Alt-Stack wurde dafür **nicht**
      angehalten.
- [ ] 3. **G1 bis G6** sind vollständig grün und **einzeln** protokolliert.
- [ ] 4. **Abfrage Z** wurde mit **zehn** abgelesenen Zeilen protokolliert, nicht mit dreien (§P.7).
- [ ] 5. Der **absichtlich rote Lauf** aus §P.8 wurde einmal gefahren und seine Abbruchmeldung
      **wörtlich** notiert.
- [ ] 6. **V0** war grün, **bevor** irgendeine andere V-Zeile ausgewertet wurde (§P.9).
- [ ] 7. Der Prüfcontainer ist gestoppt und **entfernt**, `$GP` ist gelöscht (**§P.12**).
- [ ] 8. **⬜ U8** ist gemessen — **beide** Hälften, oder die zweite ausdrücklich als **offen**
      vermerkt — **und in §0 eingetragen** (§P.12).
- [ ] 9. Die Wahl **Weg A / Weg B** für den Login-Rückweg ist getroffen und mit **Person und Datum**
      protokolliert (§P.8).
- [ ] 10. Jede ⬜-Zeile aus **§P.0** trägt entweder einen **Wert** oder den ausdrücklichen Vermerk
      „nicht prüfbar, weil ______" — **keine leere Zelle ohne Satz.**

### §P.14 — Was am ephemeren Container nicht prüfbar ist

**Diese Tabelle ist der Grund, warum der Abschnitt nicht mit dem Prüfsatz endet.** Sechs Posten, je
Posten: **wann** prüfbar, und **was der Ersatz vorher ist.**

| Aussage | Warum nicht am Prüfcontainer | Wann prüfbar | Der Ersatz vorher |
|---|---|---|---|
| **Cloudflare lässt die Wege durch** | Der Container hängt an keinem Router und schon gar nicht am Rand. Bekannter Bestandsfall im Haus: `iuk-ue.de`/`qr.iuk-ue.de` zeigten Bot-Challenges | **nach** dem Umschwenk, erster Abruf von außen | keiner am Container. Der Ersatz ist ein **Vorabblick in die Zone**: trägt `radio.iuk-ue.de` heute Regeln, die der Alt-Kiosk brauchte (Bot Fight Mode, Cache-Regeln, Page Rules)? **Ein benannter Schritt „Zonenregeln gelesen und protokolliert" VOR dem Fenster** (§A) |
| **Echtes TLS, echtes Zertifikat, HSTS** | kein Router, kein ACME. Stufe 3 liefert einen *sicheren Kontext* **ohne** TLS | **nach** dem Umschwenk | Stufe 3 für alles, was nur einen sicheren Kontext braucht; notfalls die Escalation aus §P.8 |
| **Der Kopfzeilen-Vorlauf des Randes** (`x-forwarded-host`) | ein `docker run` setzt ihn nicht; die Probe trifft den `host`-**Rückfall** in `src/core/routing.ts:37`, die Produktion den **Vorrangzweig**. Vernarbt: `lagerbuch-cutover.md:102` | **nach** dem Umschwenk, in einem Atemzug mit dem ersten Abruf | die Escalation aus §P.8 setzt den Kopf und trifft denselben Zweig; dazu ⬜ **N6** in §0 (am Server belegen, dass der Edge-Proxy ihn **setzt**, nicht durchreicht) |
| **Gedruckte QR-Codes** | absolute URL auf die **besetzte** Endadresse | **nach** dem Umschwenk | die **Nutzlast als Text** vergleichen (§P.10, V12) |
| **Der Service Worker des Alt-Kiosk** | er lebt in **fremden Browsern**, nicht im Image. Er überlebt den Umschwenk, weil der Origin **zeichengleich** bleibt, und liefert HTTP 200 mit veraltetem Inhalt — **kein Build, kein Test, kein Healthcheck sieht das** | **nach** dem Umschwenk, auf einem Gerät, das den Alt-Kiosk kannte: **einmal neu laden** | **V5/V6**: der Abräum-Worker ist **im Image**, hat den richtigen Rumpf und wird auf Fremdhosts nicht ausgeliefert. ⚠️ Er gehört in den **früheren** Deploy (§A), nicht in dieses Fenster — bis zum Umschwenk holt ihn niemand ab, weil nichts in der Suite `register()` ruft. Schlimmster Fall bleibt **eine** veraltete Ansicht je Gerät (§E) |
| **Die Cookie-Domain** (host-only, **kein** `.iuk-ue.de`) | ⚠️ **nie per HTTP prüfbar — auch nicht nach dem Umschwenk.** Ein Testlauf fährt gegen **einen** Host, und dort verhält sich ein domain-weites Cookie **exakt** wie ein host-only. `pnpm build` und `pnpm typecheck` sehen ein zusätzliches `domain`-Feld nicht — es ist **typkorrekt** | **nie** durch einen Abruf | ✅ **die Quelltext-Zusicherung `src/app/m/radio/_lib/ausleihSitzung.test.ts:52-66`, und sie muss vor der Generalprobe grün sein** (§P.1 Nr. 2). Das ist die **einzige** Absicherung. V13 liest zusätzlich ab, dass in den DevTools **keine** `Domain` steht — **ein Indiz, kein Beweis** |

⚠️ **Eine siebte Aussage, die aus der Env-Liste des Prüfcontainers folgt und leicht übersehen wird:**
der reguläre Stack setzt `AUTH_COOKIE_DOMAIN=${AUTH_COOKIE_DOMAIN:-.iuk-ue.de}` (`compose.yaml:83`),
die Probe setzt es **nicht** (§P.8). Das **Suite**-Sitzungscookie ist in der Probe damit **host-only**
und in der Produktion **domain-weit** — **über diese eine Eigenschaft sagt die Probe nichts**, weder
in die eine noch in die andere Richtung. **Das betrifft NICHT das Ausleih-Cookie `radio_ausleihe`**:
es trägt **nie** ein `domain`, und die Zusicherung dafür ist die Zeile darüber.

**Dazu zwei Zusagen, die hier stehen, weil sie aus der Unprüfbarkeit folgen — und nicht aufgeweicht
werden:**

* ⛔ **Der Redirect vom Alt-Host `radio-admin.iuk-ue.de` darf vorher NICHT scharf sein.** Er zeigt auf
  `radio.iuk-ue.de/admin`, und dort liegt bis zum Umschwenk die **eigene Verwaltung des Alt-Kiosk**.
  Früh geschaltet führt er **jeden Verwaltenden aus einer funktionierenden Alt-Verwaltung in die
  Verwaltung einer anderen Anwendung** — schlechter, als nichts zu tun. ⚠️ **Die sechs Labels dürfen
  und müssen vorher ausgerollt sein (§0.1) — scharf wird die Gruppe erst durch den WERT von
  `SUITE_REDIRECT_RULE_RADIO_ADMIN`**, und der wird im **selben** Fenster wie der Umschwenk gesetzt
  (§C Schritt 9). Die drei `curl` laufen danach (§D).
* ⛔ **Der Login-Rückweg ist der einzige Fehlfall, der stumm ist** (§P.8). Er entscheidet über **Weg A
  oder Weg B**, und **diese Entscheidung fällt vor dem Fenster**, nicht in ihm.

> Alt-Host-Redirect: `SUITE_REDIRECT_RULE_RADIO_ADMIN` heute gesetzt? ☐ nein bzw. leer (richtig)
> ☐ ja (⚠️ **Fund** — zurücksetzen, bevor die Generalprobe als grün gilt) · abgelesen am ____________

---

## §A — Was vor dem Fenster fertig sein muss

Keine Wiederholung der Generalprobe (§P), sondern die Menge der Dinge, deren Fehlen das Fenster
**verbrennt**. **Jeder Punkt mit Ausgabe, nicht mit Erwartung** — eine abgehakte Zeile ohne
protokollierte Ausgabe ist keine abgehakte Zeile (`files-cutover.md:192-196`).

⚠️ **`rtk` steht nur vor Befehlen, die im Repo-Checkout laufen.** Auf dem Server gibt es `rtk`
nicht — `docker`, `sqlite3`, `curl`, `pg_dump`, `tar` und `scripts/backup.sh` laufen dort nackt.

⛔ **Eine Zeile, die es in keinem der fünf Cutover-Pläne gibt und die vor allem anderen fällig ist:**
**P1-1 bis P1-5 aus `docs/superpowers/berichte/2026-08-22-proxy-rewrite-abnahme.md:66-154` sind
gemessen und wörtlich protokolliert, BEVOR PR #80 nach `main` gemerged wird.** Die drei
`proxy.ts`-Rewrite-Commits liegen bereits auf dem Zweig, der `radio` einbringt, und die Suite fährt
**ein** Image für **alle** Module — der Merge rollt beides zwangsläufig gemeinsam aus. **Danach sind
die fünf „Vorher"-Messungen unwiederbringlich verloren** (Traefik-Zeilenzahl je Anfrage, Latenz,
Auditspalte aus zwei Netzen), außer durch einen eigenen Rollback des Deploys. ⚠️ Der harte Zeitpunkt
ist **der Merge**, nicht der Cutover-Abend.

> P1-1 bis P1-5 gemessen und protokolliert am ____________ durch ____________________ ·
> ☐ vor dem Merge von PR #80 · ☐ **Fund: bereits gemerged** — dann steht daneben, wie die fünf
> Messungen ersatzweise gewonnen wurden: ____________________

- [ ] **1. Der Deploy mit dem Registry-Eintrag und dem Abräum-Worker ist gelaufen — in einem
      FRÜHEREN Fenster.** Beweis gegen den **laufenden** Container:
      ```bash
      curl -s -o /dev/null -w '%{http_code}\n' https://iuk-ue.de/api/health/radio
      #   200 = das Modul ist im Image
      #   503 = falsches Image: getModule(key) wirft bei unbekanntem Key
      ```
      **Und im selben Handgriff die zwei Ablesungen, ohne die §D Nr. 3 und §C Schritt 8 keine
      linke Seite haben:**
      ```bash
      curl -s https://iuk-ue.de/api/health/radio    # das Feld `revision` des LAUFENDEN Stands
      git rev-parse --short HEAD                    # im Checkout, aus dem gebaut wurde
      docker compose images suite                   # der Image-Digest, der gerade laeuft
      ```
      `revision` = `<revision_soll>` → ____________________
      Digest = `<image_digest_soll>` → ____________________
      **Warum das hier steht und nicht am Abend:** §D Nr. 3 und §C Schritt 8 machen `revision` zum
      einzigen Beleg, dass wirklich der neue Stand antwortet. **Der Sollwert dieser Erwartung
      entsteht nur hier.** Welches Feld was belegt, ist **nicht** offen (✅ **L5**, abgelesen aus
      dem Bau am 2026-08-27): `src/core/health/index.ts:4-16` liefert `{ status, module, error? }` —
      `module` trägt den Modulnamen, `status:"ok"` entsteht erst nach `openModuleDatabase` plus
      `SELECT 1` —, und `src/app/api/health/[modul]/route.ts:23-25` hängt `revision` an und
      antwortet **200 bei `ok`, sonst 503**. Offen ist allein der **Wert** von `revision`, und den
      trägt die Zeile oben.
      ⛔ **Abbruch:** 503 → der Cutover wird **abgesagt, nicht angepasst.** Ohne den
      Registry-Eintrag hat der Import kein Zielschema, und `SUITE_HOST_RADIO` in der `.env`
      bricht den Start der **ganzen** Suite ab.
      ⚠️ **Der Docker-Healthcheck der Suite prüft `/api/health/portal`, nicht `/api/health/radio`**
      (`compose.yaml:141`). Ein rotes `radio` hält den Container **nicht** vom Start ab und macht
      ihn nicht unhealthy — deshalb ist diese Ablesung ein **eigener, manueller** Schritt und kein
      Blick auf einen Container-Zustand.

- [ ] **2. Der Abräum-Worker liegt in diesem ersten Deploy, nicht im Cutover.** Begründung
      in §E.1. **Er ist gebaut** — `src/app/m/radio/sw.js/route.ts` liefert ihn extern unter
      `/sw.js` (Scope `/`), intern unter `/m/radio/sw.js` (✅ **N4**, abgelesen am 2026-08-27;
      Rewrite `src/core/routing.ts:43-79`). **Was hier abgehakt wird, ist nicht sein Bau, sondern
      sein AUSROLLEN vor diesem Fenster.**
      → ____________________

- [ ] **3. ⛔ Die Retention der Standby-Umgebung ist neutralisiert oder das Volume ist kopiert —
      vor dem ERSTEN Generalproben-Snapshot**, nicht erst „vor dem Cutover-Abend".
      `radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`,
      `retentionService.ts:47` purgt **sofort**, erst `:48` startet den Tagestimer; der Cutoff
      hängt an der **Wanduhr** (`:9`, `:19`) — **jeder weitere Start löscht mehr als der vorige.**
      Handgriff: `HISTORY_RETENTION_MONTHS` neutralisieren **oder** das Volume kopieren.
      ⚠️ **Ob die Zwei-Monats-Frist im produktiv laufenden Image überhaupt konfigurierbar ist, ist
      ⬜ N7** — ist sie es nicht, bleibt allein die Volume-Kopie.
      **Wie man es merkt, wenn es fehlt:** ein **erfolgreicher** Start mit der Protokollzeile
      `[retention] purged N expired loan(s)` (`retentionService.ts:41`) — kein Fehler, kein roter
      Test. Nachgewiesen am ______ durch ____________________
      ⛔ **Dieser Punkt ist zugleich die Vorbedingung des RÜCKWEGS** (§G 3a). Ist er nicht
      nachgewiesen, ist auch der Rollback gesperrt.

- [ ] **4. `SUITE_SEED` ist nicht `1`.** Bei `radio` schärfer als bei jedem bisherigen Modul: ein
      geseedeter Zugangscode wäre ein **gültiger anonymer Zugang** zum gesamten Bestand samt
      Ausleihernamen. → ____________________

- [ ] **5. Abgelesen und protokolliert ist, was die zwei Hosts HEUTE liefern:**
      ```bash
      curl -si https://radio.iuk-ue.de/admin  | head -10   # heute: Alt-Verwaltungsoberflaeche
      curl -si https://radio-admin.iuk-ue.de/ | head -10   # heute: der Alt-Verwaltungshost
      ```
      Beide Ausgaben ins Protokoll → ____________________
      ⚠️ **Was hier ausdrücklich NICHT verlangt wird, ist ein aufgelöster Zustand.** Bis zum
      Umschwenk liegt unter `radio.iuk-ue.de/admin` die eigene Verwaltungsoberfläche des
      Alt-Kiosk; die Kollision **endet definitionsgemäß mit dem Umschwenk**. Ein Haken
      „Kollision aufgelöst" wäre vor dem Fenster nicht setzbar. Der Haken hier heißt „abgelesen
      und im Protokoll"; die Auflösung prüft §D Nr. 7.
      ⛔ **Diese zwei Ausgaben sind zugleich die Vergleichsbasis des RÜCKWEGS** (§G, Rücklesung).
      Ohne sie hat der Rollback kein Sollbild, gegen das er seine `curl` stellt.

- [ ] **6. Der Registry-Code-Default-Abgleich, den kein Boot sehen kann:**
      ```bash
      rtk grep -n 'prodHosts' src/core/registry.ts
      ```
      und die Code-Defaults **von Hand** gegen die gesetzten `SUITE_HOST_*` vergleichen. Grund:
      die Kollisions-Map in `validateHostConfig` wird **ausschließlich** aus `envHostsFor`
      gefüllt (`src/core/hosts.ts:78-95`) — ein Host, den ein anderes Modul per
      Registry-`prodHosts` im **Code-Default** führt, erreicht sie **nie** und kollidiert ohne
      jede Meldung. `moduleForHost` entscheidet dann nach **Registry-Reihenfolge**
      (`src/core/registry.ts:251-258`), nicht nach Env. → ____________________

- [ ] **7. Zwei Messungen aus der Generalprobe liegen vor (⬜ U8):** Größe der Prod-Volumes und
      Dauer von `pg_dump` bzw. `sqlite3 .backup`. Sie bemessen das Fenster. **Sie werden in §P.12
      gemessen, nicht hier** — hier wird nur festgestellt, dass sie vorliegen.
      Größe E2 ________ / Größe E3 ________ / `.backup`-Dauer ________ / `pg_dump`-Dauer ________

- [ ] **8. ⬜ N6 (a): belegen, dass der Edge-Proxy `X-Forwarded-Host` SETZT statt durchreicht.**
      Der Host-Riegel löst den Host über `resolveHost` auf, und das liest `x-forwarded-host` mit
      **Vorrang** vor `host` (`src/core/routing.ts:37`). Nach dem Rewrite der Middleware ist das
      die einzig richtige Reihenfolge, aber der Header ist client-fälschbar. Der Docblock in
      `core/routing.ts` begründet die Ungefährlichkeit mit `requiresAuth`/`canAccess` als
      Auffangriegel — **und `requiresAuth: false` entfernt genau diesen Auffangriegel.**
      **Deployment-Invariante, im Repo nicht belegbar** (dieselbe Lage wie
      `lagerbuch-cutover.md:102-118`) — also **am Server** belegen und ins Protokoll schreiben.
      → ____________________
      **Im selben Handgriff ⬜ N6 (b) und (c):** welche **Entrypoints** gibt der Edge-Proxy an
      Traefik weiter, und ist `radio-admin.iuk-ue.de` dort überhaupt bekannt? Ohne beides
      antwortet `https://radio-admin.iuk-ue.de/` in §D Nr. 7 mit einem Verbindungs- oder
      TLS-Fehler **statt rot zu werden**. → ____________________

- [ ] **9. Die Cloudflare-Zonenregeln für `radio.iuk-ue.de` sind gelesen und protokolliert:**
      trägt der Host heute Regeln, die der Alt-Kiosk brauchte — Bot Fight Mode, Cache-Regeln,
      Page Rules? Bekannter Bestandsfall im Haus: `iuk-ue.de`/`qr.iuk-ue.de` zeigten
      Bot-Challenges. → ____________________

- [ ] **10. Die Wahl zwischen Weg A und Weg B für den Login-Rückweg ist getroffen** (§P.8).
      ⛔ **Diese Entscheidung fällt VOR dem Fenster, nicht in ihm** — der Login-Rückweg ist der
      einzige Fehlfall des ganzen Cutovers, der vollständig stumm ist (§D Nr. 10).
      Gewählt: ☐ A ☐ B → ____________________

- [ ] **11. `TZ=Europe/Berlin` ist als Voraussetzung benannt, aber in diesem Fenster NICHT
      gesetzt.** Es ist ein eigener Suite-Posten mit eigener Prüfung gegen **alle** laufenden
      Module; ein nachträgliches `TZ` verschöbe jede Datumsgrenze, die portal, qr, feedback,
      files, lagerbuch und aufgaben bisher in UTC gezogen haben. `radio` hängt bewusst nicht
      daran — die Zone steht in `tagInBerlin`. **Wer es doch am Cutover-Abend setzt, ändert
      sechs fremde Module mit.** ☐ gelesen und **nicht** gesetzt

- [ ] **12. ⬜ L13 bestätigt oder ersetzt · ⬜ L14 abgelesen.**
      **L13 ist NUR der Loopback-Port** — der Containername steht in §C Schritt 8 fest
      (`radio-fenster`) und ist keine Leerstelle. §C Schritt 8 trägt seit dem 2026-08-27 die
      **Vorbelegung 4000** und ist damit auch ohne diese Zeile fahrbar; hier wird sie **bestätigt
      oder ersetzt**, weil nur der Server weiß, ob 4000 dort frei ist.
      L13 Port ☐ 4000 bestätigt ☐ stattdessen ________ · L14 ☐ ja ☐ nein → ____________________
      ⛔ **L14 bleibt die harte Zeile dieses Punktes:** ohne die Antwort auf „darf ein zweiter
      bootender Container auf `suite_data`?" ist §C Schritt 8 **nicht** planbar.
      **Im selben Handgriff ⬜ N3** — aber ⛔ **NICHT am Prüfcontainer**, den es zu diesem
      Zeitpunkt noch gar nicht gibt. Gemeint ist die Kennung des **laufenden Suite**-Prozesses:
      ```bash
      docker inspect "$(docker compose ps -q suite)" --format '{{.Config.User}}'
      grep -n '^SUITE_USER=' <Pfad der Server-.env>
      ```
      Kennung des laufenden Prozesses = `<uid_gid_prozess>` → ____________________
      ⚠️ **Nicht aus dem Image ableiten.** `Dockerfile:42-43` legt `nextjs` **ohne** `-G nodejs`
      an, `USER nextjs` (`Dockerfile:89`) läuft also als 1001:65533(nogroup) — der Service
      startet dagegen als `user: ${SUITE_USER:-1001:1001}` (`compose.yaml:62`), und auf arm64
      verlangt `.env.example:252` sogar `SUITE_USER=1001:1000`. Wer die Image-Zahl nimmt, setzt
      in §C Schritt 4 eine Kennung, die von der der übrigen Modul-Datenbanken **abweicht** —
      und die Erwartung dort ist dann zwangsläufig rot, ohne dass ein Fehler vorläge.
      ⚠️ ✅ **N1 ist eingelöst und ändert L14 nicht:** der laufende Stack hält `radio.db`
      dauerhaft offen (`src/core/db/index.ts:24-34`, `_lib/boot.ts:611-612` — §L.3). Das begründet
      den konservativen `docker compose stop suite` vor §C Schritt 4 Handgriff 3; **ob ein
      zweiter Container parallel booten darf, bleibt trotzdem eine Betriebsentscheidung.**

- [ ] **13. ⛔ Die heutige Router-Konfiguration von `radio.iuk-ue.de` UND
      `radio-admin.iuk-ue.de` ist abgelesen und WÖRTLICH im Protokoll — und der Handgriff, der
      sie zurückstellt, steht daneben.**
      ```bash
      # label-basierte Regeln (E7 = Traefik-Containername):
      docker inspect <E7> --format '{{json .Config.Labels}}'
      # sonst: die Datei des File-Providers bzw. die Konfiguration des Edge-Proxy —
      # WO sie liegt, ist U4 und wird beim Betreiber eingeholt, nicht geraten.
      ```
      `<router_regel_heute>` → ____________________
      Rückstell-Handgriff, wörtlich → ____________________
      **Warum das eine eigene Vorbedingung ist und keine Fußnote:** in **beiden** eingecheckten
      Alt-Compose-Dateien kommt die Zeichenkette `traefik` **nicht vor** — sie veröffentlichen
      nur `ports:` (`radio-inventar/docker-compose.yml:13`, `:40`;
      `radio-admin/docker-compose.yml:6`). Es gibt also **keine Labels zu entfernen** und keine
      Datei im Repo, in der man sie sucht. Daran hängen **drei** Schritte: §C Schritt 9 Nr. 1
      („Alt-Router zuerst weg") hat ohne diese Zeile **kein ausführbares Ziel**, und §G 3c/3d
      hat **nichts zurückzustellen**. ⛔ **Fehlt die Zeile, wird das Fenster nicht eröffnet** —
      um 21 Uhr ist das Rekonstruktionsarbeit an einer fremden Proxy-Konfiguration.
      Quelle: ⬜ **U4**.

- [ ] **14. ⛔ ⬜ N2: Die `compose.yaml` MIT der `radio-admin-alt`-Labelgruppe ist auf dem Server
      ausgerollt** — in einem **eigenen, früheren** Rollout, nicht am Cutover-Abend.
      ```bash
      docker compose config | grep -A2 radio-admin-alt
      ```
      **Erwartung:** die Regel steht mit der Vorbelegung ``Host(`radio-admin.invalid`)`` da, und
      `replacement` endet auf `/admin/${1}` — mit **einem** Dollarzeichen, weil Compose das
      doppelte hier auflöst. Steht dort `/admin/` **ohne** `${1}`, ist das `$$` verloren und der
      Redirect wäre nicht mehr pfaderhaltend. → ____________________
      **Warum das nicht ins Fenster passt:** `scripts/deploy.sh:84-105` vergleicht `compose.yaml`
      per `diff -u` mit der Server-Datei und **bricht bei Abweichung ab** („Stack-Dateien weichen
      ab. Sie werden BEWUSST nicht automatisch übernommen — eine Änderung an compose.yaml oder
      clamd.files.conf ist Runbook-Arbeit"). Ohne diesen Rollout greift §C Schritt 9 Nr. 3 ins
      Leere: `SUITE_REDIRECT_RULE_RADIO_ADMIN` hat nichts zu parametrisieren, und der Alt-Host
      liefert nach dem Umschwenk **das Portal** statt einer Weiterleitung.

⛔ **Vier der vierzehn Punkte eröffnen das Fenster nicht, wenn sie fehlen:** Nr. 1 (503 statt
200), Nr. 3 (Retention nicht neutralisiert — dann ist auch der **Rückweg** gesperrt, §G), Nr. 13
(Router-Regel nicht abgelesen) und Nr. 14 (Compose nicht ausgerollt). Dazu, außerhalb dieser
Liste: ⬜ **U4/C.5** — sie blockiert den **Freeze**, nicht erst den Abbau.

⚠️ **Und außerhalb der Numerierung, weil es kein Fensterschritt ist:** der ⛔-Kasten ganz oben
(P1-1 bis P1-5 vor dem Merge). Er hat seinen eigenen Zeitpunkt und seine eigene Protokollzeile.

---

## §B — Die `.env`

Alle Zeilen in **einer** Änderung, aber die drei mit ⏸ markierten bleiben bis §C Schritt 9
**ungesetzt**. **Welche Zeilen es gibt und was ihr Leerwert bedeutet, steht in §0.2** — hier stehen
die **Werte** und die Reihenfolge.

⚠️ **Der eine Punkt, an dem die naive Lesart den Cutover bricht:** `SUITE_TRAEFIK_RULE` wirkt über
Traefik-Labels, die **beim Containerstart** gelesen werden (`compose.yaml:153`). Wer die Regel in
derselben Änderung setzt, in der er `up -d` ruft, **hat den Router damit schon umgeschwenkt** —
die Verifikation liefe dann **nach** dem Umschwenk, nicht davor. Genau so macht es
`docs/runbooks/files-cutover.md:115-116`: „`.env` vorbereiten — alle Zeilen aus der Tabelle unten
in EINER Änderung, aber noch nicht aktiv". **Der Router ist ein eigener, letzter Schritt.**

⚠️ **Die drei Zeilen stehen ABSICHTLICH auskommentiert im Block** — wer ihn unter Zeitdruck
kopiert, bekommt damit den richtigen Zustand *vor* dem Umschwenk. Sie werden in §C Schritt 9
**einkommentiert, nicht neu getippt.**

⛔ **ZWEI Gruppen-Zeilen, nicht eine — und das ist gegenüber den Plänen vom 2026-08-18 die
Änderung mit der größten Wirkung auf diesen Abschnitt.** Die Betreiberentscheidung **C.6/B4** vom
**2026-08-21** hat **zwei Rechtestufen** ergeben, und der Bau ist ihr gefolgt: `.env.example:74-114`
führt `SUITE_ADMIN_GROUP_RADIO` **und** `SUITE_UPDATER_GROUP_RADIO`, beide auskommentiert, beide
ohne Vorbelegung. Damit gibt es **zwei** Eingaben (⬜ **E1** und ⬜ **E1b**) und eine **sechste
Boot-Prüfung**, die es in den Plänen nicht gab.

```dotenv
# ── im Block „Prod-Domains der Module" (.env.example:154) ──
# ⏸ SUITE_HOST_RADIO=radio.iuk-ue.de        # erst in §C Schritt 9

# ── Block „── Modul radio ──" (.env.example:408-647) ──
SUITE_ADMIN_GROUP_RADIO=<E1>
SUITE_UPDATER_GROUP_RADIO=<E1b>
# SUITE_ACCESS_GROUP_RADIO  — DIESE ZEILE DARF NICHT EXISTIEREN. Siehe Tabelle unten.
RADIO_AUSLEIH_SITZUNG_SECRET=<openssl rand -base64 32, frisch, NICHT gleich AUTH_SECRET>
RADIO_AUSLEIH_SITZUNG_STUNDEN=<E4, Vorschlag 12>
RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=5
RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=30
RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=300
RADIO_HISTORIE_PURGE=0          # Cutover-Schalter, wird nach dem Fenster ENTFERNT (§D Nr. 14)
# RADIO_HISTORIE_MONATE=2                 # Vorbelegung, im Fenster nicht setzen
# RADIO_HISTORIE_ERSTLAUF_MINUTEN=1440    # Vorbelegung, im Fenster nicht setzen

# ── neben der SUITE_TRAEFIK_RULE-Zeile (.env.example:565-580) und dem Redirect-Block
#    (.env.example:582-601) ──
# ⏸ SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`) || … || Host(`radio.iuk-ue.de`)   # erst in §C Schritt 9
# ⏸ SUITE_REDIRECT_RULE_RADIO_ADMIN=Host(`radio-admin.iuk-ue.de`)          # erst in §C Schritt 9
```

⛔ **`SUITE_UPDATER_GROUP_RADIO` trägt KEIN ⏸.** Sie wird in **Schritt 6** gesetzt wie jede andere
Modulzeile, nicht in Schritt 9 — sie hat mit dem Router nichts zu tun. **Die ⏸-Zeilen sind und
bleiben drei**, und sie sind genau die drei, die den Umschwenk auslösen.

⚠️ **`SUITE_TRAEFIK_RULE` ist bis Schritt 9 nicht „weg", sondern trägt ihren bisherigen Wert
weiter** — sie führt heute schon die Hosts der sechs laufenden Module. Auskommentiert wird nur die
**erweiterte** Fassung; die bestehende Zeile bleibt unverändert stehen, bis sie in Schritt 9
ersetzt wird. **Wer sie versehentlich auskommentiert, nimmt mit einem Handgriff sechs fremde
Module vom Netz** (Vorbelegung ``Host(`iuk-ue.de`)``, `compose.yaml:153`).

| Variable | Wert | Was passiert, wenn sie fehlt oder falsch ist |
|---|---|---|
| `SUITE_HOST_RADIO` | `radio.iuk-ue.de` | Fehlt sie: `moduleForHost` fällt auf **portal** zurück (`src/core/hosts.ts:52-57`), der Rewrite auf `/m/radio<rest>` greift nicht, `/sw.js` landet im Portal-Modul, und der Login-Rückweg wirft auf das Portal (`:59-63`). **Alles davon still.** ⚠️ Bei `radio` schärfer als sonst: der Portal-Fallback überdeckt die **Ausleihe** — die anonyme Fläche, die **kein Anmeldefenster zeigt, an dem jemand den Fehler bemerkt** |
| `SUITE_ADMIN_GROUP_RADIO` | ⬜ **E1**, **nicht leer** | Leer oder fehlend = **Startabbruch** der ganzen Suite. Der Boot-Riegel existiert genau deshalb: die Alternative wäre ein **stummes 404 für JEDE Verwaltungsseite und alle Verwaltenden auf einmal** — `radio` ignoriert den `isModuleAdmin`-Kurzschluss modulintern, es gibt keine Suite-Admin-Rückfallebene (`.env.example:83-96`) |
| `SUITE_UPDATER_GROUP_RADIO` | ⬜ **E1b** | ⛔ **Die zweite Rechtestufe aus C.6/B4.** Leer **oder** ungesetzt ist ein **gültiger** Zustand — „niemand ist Updater" — und **bricht den Start NICHT ab** (`.env.example:107-114`). Genau deshalb ist ein **Tippfehler von außen nicht von einer absichtlich unbesetzten Stufe zu unterscheiden**, und genau deshalb **meldet der Start den gelesenen Wert laut**, statt ihn zu bewerten (`src/app/m/radio/_lib/boot.ts:367-379`). ⚠️ **Der Fehlfall ist damit nicht der Abbruch, sondern eine Verwaltung, in der die Updater-Stufe still leer bleibt** — die Meldezeile ist das einzige, was ihn findbar hält |
| `SUITE_ACCESS_GROUP_RADIO` | ⚠️ **Zeile gar nicht vorhanden** | ⚠️ **Diese Variable invertiert `SUITE_HOST_RADIO`, und die naheliegende Zeile ist der Startabbruch.** Die Prüfung ist `!== undefined`, und ein `SUITE_ACCESS_GROUP_RADIO=` kommt per `env_file` als **leerer String**, also als *definiert*, im Prozess an → **Boot-Abbruch**. Gemeint ist: die Zeile **ersatzlos entfernen** — auch die auskommentierte Vorlage nicht anlegen. Wäre sie gesetzt und würde nicht geprüft, wäre sie **still wirkungslos** (`src/core/registry.ts:239`) |
| `RADIO_AUSLEIH_SITZUNG_SECRET` | frisch, ≥ 32 Zeichen | Fehlt, zu kurz **oder gleich `AUTH_SECRET`** → **Startabbruch**. ⚠️ **Hier gibt es nichts zu erben** — anders als bei `lagerbuch`, wo `HELFER_SESSION_SECRET` wertgleich aus der Prod-Umgebung übernommen wurde, damit laufende Sitzungen den Cutover überleben. Der heutige Zugang des Kiosk ist ein base64-Bearer-Token im `localStorage`, kein signiertes Cookie. **Wer nach einem zu übernehmenden Wert sucht, sucht vergeblich** |
| `RADIO_AUSLEIH_SITZUNG_STUNDEN` | ⬜ **E4**, ganze Zahl `1..168` | Außerhalb des Bereichs → **Startabbruch**. Ohne die Zeile gilt die Vorbelegung 12. ⚠️ Der Wert wird in §F.3 **ausgeschrieben** in die Neuigkeitennotiz übernommen |
| `RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN` | `5` | Je Absender, **nur Fehlversuche**. Keine ganze Zahl im Bereich → Startabbruch |
| `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN` | `30` | Modulweite Burst-Kappe gegen Rotation des Absenderschlüssels (= sechs Absender-Budgets) |
| `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` | `300` | Der tragende Zähler (= 5/min × 60). ⚠️ Die drei Grenzen sind ab dem ersten Import **eingefroren**; eine geänderte `.env` wirkt erst nach einem Neustart. ⚠️ Solange die CWE-348-Umstellung in `src/core/ratelimit.ts` aussteht, ist die Absenderkennung fälschbar und diese Schranke eine **Bremse, kein Riegel** — das steht hier, damit sie niemand für mehr hält |
| `RADIO_HISTORIE_PURGE` | `0` **im Fenster** | Die zweite Hälfte der Faktor-1000-Absicherung. **Zeichengenau `0`** — `=false`/`=off`/`=nein` schalten **nicht** ab und laufen still weiter (`_lib/boot.ts:628`). Wird nach dem Fenster entfernt — **erst wenn R und Z grün protokolliert sind** (§D Nr. 14) |
| `SUITE_TRAEFIK_RULE` | bestehende Hosts **plus** ``\|\| Host(`radio.iuk-ue.de`)`` | Ohne die Erweiterung erreicht die Domain den Container gar nicht erst (`compose.yaml:149-153`). Bestehende Hosts **übernehmen**, nicht ersetzen. ⚠️ **`radio-admin.iuk-ue.de` gehört dort ausdrücklich NICHT hinein** |
| `SUITE_REDIRECT_RULE_RADIO_ADMIN` | ``Host(`radio-admin.iuk-ue.de`)`` | Solange ungesetzt, existiert der Redirect-Router und trifft nichts (Vorbelegung `radio-admin.invalid`). Wird in **derselben** Änderung gesetzt wie `SUITE_HOST_RADIO` |

**Dreizehn Variablennamen**, nicht zwölf — die Pläne führen zwölf, `SUITE_UPDATER_GROUP_RADIO` kam
mit C.6/B4 hinzu.

**Was ausdrücklich nicht entsteht:** kein `RADIO_ADMIN_URL`, kein `RADIO_ADMIN_API_TOKEN`, kein
`POCKET_ID_*` für `radio`. `api_tokens` trug produktiv genau **einen** Konsumenten, und der
verschwindet mit dem Port. **Eine Variable dafür wäre ein Angebot an einen Konsumenten, den es
nicht gibt.**

> `<E1>` gesetzt auf: ____________________ · `<E1b>` gesetzt auf: ____________________ ·
> `<E4>` gesetzt auf: ________ · `.env` geändert am ____________ durch ____________________

### §B.1 — Abbruch gegen still

**Abbruch: drei Dinge, und nur diese drei, aus `validateHostConfig` (`src/core/hosts.ts:65-99`):**

1. Ein `SUITE_HOST_*`, dessen Suffix zu **keinem** Modul-Key passt (`:69-76`). ⚠️ **Daraus folgt
   die einzige Reihenfolge, die ein Cutover selbst verletzen kann: erst der Registry-Eintrag im
   Image, dann die `.env`.** Solange `key: "radio"` in `src/core/registry.ts` fehlt, bricht
   `SUITE_HOST_RADIO` **oder** `SUITE_ADMIN_GROUP_RADIO` den Start der **ganzen** Suite ab —
   nachweisbar vermeidbar über §A Nr. 1 (200 statt 503).
2. Ein Wert mit `/` oder `:` (`:81-85`) — reiner Hostname, ohne Protokoll, ohne Port.
3. Ein Host, den **zwei per Env gesetzte** Module beanspruchen (`:87-93`).

Dazu die modul-eigenen Abbrüche aus `radioBootFehler()`: leere Admin-Gruppe · gesetztes
`SUITE_ACCESS_GROUP_RADIO` · fehlendes/zu kurzes/gleiches Sitzungsgeheimnis ·
`RADIO_HISTORIE_MONATE` keine ganze Zahl ≥ 1 · `RADIO_AUSLEIH_SITZUNG_STUNDEN` außerhalb `1..168`.
Jeder zurückgegebene String **ist** ein Startabbruch: `assertHostConfig` wirft bei `length > 0`
(`src/core/bootstrap.ts:92`).

⛔ **Die sechste Boot-Prüfung ist KEINE Abbruch-Prüfung, und das ist der Punkt.** Die Stufe aus
C.6/B4 prüft **nicht den Inhalt**, sondern **meldet den Zustand** von `SUITE_UPDATER_GROUP_RADIO`
laut beim Start — in **allen drei** Fällen (`GESETZT auf "…"` / `GESETZT UND LEER` / `NICHT
GESETZT`), als `console.info` und **nie** als Stopp (`src/app/m/radio/_lib/boot.ts:358-379`).
**Begründung, wörtlich aus dem Bau:** ein gesetzter, aber leerer Wert ist eine gültige Aussage
(„niemand ist Updater") und darf nicht abbrechen; ein **Tippfehler** ist von außen nicht davon zu
unterscheiden. **Deshalb nennt die Zeile den gelesenen Wert — nur daran sieht ein Mensch den
Tippfehler.** Sie wird in §C Schritt 7 und §D Nr. 9 **abgelesen, nicht als Befund gewertet.**

**Still: drei Ausprägungen, jede mit ihrem eigenen Handgriff.**

| Stiller Fall | Beleg | Handgriff, und wo er steht |
|---|---|---|
| **Richtig geschriebener, falscher Hostname.** `SUITE_HOST_RADIO=falsch.example.com` ist von einem Tippfehler nicht zu unterscheiden; `moduleForHost` fällt auf **portal** zurück, `radio.iuk-ue.de` zeigt stillschweigend das Portal | `src/core/hosts.ts:52-57`, wörtlich: „der Host fällt dann in `moduleForHost` auf das Portal zurück und die QR-Domain zeigt stillschweigend das Portal" | **Eigener Verifikationsschritt** §D Nr. 1 + Nr. 3 + Nr. 5 |
| **Der Login-Rückweg, den kein `curl` sieht.** Fehlt die Variable, wirft Auth.js den Nutzer nach dem Login **aufs Portal**, ohne Fehler und ohne Meldung | `src/core/hosts.ts:59-63`, wörtlich: „Ein curl sieht davon nichts" | **Handarbeit**, §D Nr. 10 — und dieselbe Person stellt den ersten Zugangscode aus (§F), damit der Schritt nicht vergessen wird |
| **Die Kollision, die `validateHostConfig` strukturell nicht sehen kann** — ein Host im Registry-**Code-Default** eines anderen Moduls erreicht die Kollisions-Map nie | `src/core/hosts.ts:78-95` | **Vor** dem Fenster, §A Nr. 6 |
| ⛔ **Die still leere zweite Rechtestufe** — ein Tippfehler in ⬜ E1b schließt die Updater-Stufe, ohne dass irgendetwas rot wird | `src/app/m/radio/_lib/boot.ts:367-379` | **Ablesen** der Meldezeile in §C Schritt 7 und §D Nr. 9, Grep-Anker `SUITE_UPDATER_GROUP_RADIO ist` |

⚠️ **Und der stille Fall, den nur eine Protokollzeile findet:** `SUITE_HOST_RADIO` gesetzt, aber
in `SUITE_TRAEFIK_RULE` nicht enthalten — **die Domain ist tot, ohne dass etwas kaputt aussieht.**
Das **meldet** (`console.warn`, `_lib/boot.ts:334-341`), es wirft nicht: die Labels leben in der
`.env` auf dem Server, und ein Abbruch träfe genau in dem Moment, in dem der Betreiber die `.env`
gerade umstellt. Deshalb §D Nr. 9: **`warn` = Stopp, `info` = Zustand.**

### §B.2 — Rollback ist die leere Zeile, nicht die gelöschte

`SUITE_HOST_RADIO=` ergibt `[]` (bewusst **keine** Prod-Hosts). Das **Entfernen** der Variable
ergibt `null` und damit den Code-Default aus der Registry (`src/core/hosts.ts:33-46`). Mit
`prodHosts: []` ist der Unterschied heute wirkungsgleich — aber nur heute, und die leere Zeile
ist die Form, die sagt, was gemeint ist.

⚠️ **Die Formen sind bei `radio` gegenläufig, und das sind die Zeilen, die man am leichtesten
verkehrt schreibt:**

* `SUITE_HOST_RADIO=` → **leer, Zeile bleibt stehen.** Das ist der Rückweg.
* `SUITE_ADMIN_GROUP_RADIO` → **weder leeren noch entfernen.** Rollback ist das **Zurücksetzen auf
  den vorigen Wert**; leer sperrt die Verwaltung für **jeden**.
* `SUITE_UPDATER_GROUP_RADIO` → **Leeren ist zulässig** und heißt „niemand ist Updater".
* `SUITE_ACCESS_GROUP_RADIO` → **Zeile weg.** Ein leerer Wert ist hier der **Startabbruch**.

### §B.3 — Der Redirect vom Alt-Host, und warum er einen eigenen Router hat

**Muss `radio-admin.iuk-ue.de` in `SUITE_TRAEFIK_RULE` stehen? Nein — ausdrücklich nicht.** Wer
ihn dort mit aufnimmt, bekommt **nicht** den Redirect, sondern den stillen Portal-Fallback: der
Host erreicht den Container, kein `SUITE_HOST_*` beansprucht ihn, und `decideRoute` schreibt auf
portal um (`const mod = moduleForHost(host) ?? getModule("portal")`, `src/core/routing.ts:79`).
Der Alt-Host zeigt dann das **Portal** — ein funktionierender Abruf mit falschem Inhalt, und
**kein Test des Repos sieht Traefik-Labels an**.

Die sechs Label-Zeilen stehen deshalb **im Repo**, am Service `suite` (§0.1). Sie sind **vor**
dem Fenster ausgerollt (§A Nr. 14, ⬜ N2). Sechs Punkte, jeder mit seinem Preis:

1. **Middleware am Router, nicht am Service.** Am Service träfe der Redirect auch die Suite selbst.
2. **`permanent=false` → 302, nie 301.** Ein 301 liegt im Cache jedes Telefons, das den Alt-Host
   je besucht hat, und macht den Rückweg praktisch unmöglich.
3. **`$$` gegen die Compose-Interpolation.** `$${1}` erreicht Traefik als `${1}`; ein einfaches
   `$` verschluckt Compose, und die Ersetzung liefert `/admin/` für **jeden** Pfad. Der Redirect
   funktioniert dann, ist aber nicht mehr pfaderhaltend — **der stille Fehlfall dieses Blocks.**
4. **Pfaderhaltend heißt:** `radio-admin.iuk-ue.de/geraete` → `radio.iuk-ue.de/admin/geraete`.
   Die Alt-Verwaltung bediente ihre Oberfläche ab `/`; das neue Präfix ist `/admin`.
5. **Eigene Variable mit unschädlicher Vorbelegung.** `radio-admin.invalid` löst niemand auf;
   ohne Vorbelegung scheitert `docker compose config`, sobald die Variable fehlt. ⚠️ Der Name ist
   bewusst **nicht** `SUITE_HOST_`-präfigiert: `const PREFIX = "SUITE_HOST_"`
   (`src/core/hosts.ts:20`), und `validateHostConfig` bricht bei jedem Namen mit diesem Präfix
   ab, der zu keinem Modul-Key passt. `SUITE_REDIRECT_RULE_RADIO_ADMIN` ist damit boot-neutral.
6. ⚠️ **`entrypoints=web` ist richtig, und der Grund gehört hierher, weil er sonst wie ein Fehler
   aussieht.** Der bestehende Suite-Router trägt genau dieselbe Zeile (`compose.yaml:154`), und
   **im ganzen Compose gibt es kein `tls`- und kein `certresolver`-Label.** TLS endet also **vor**
   Traefik, an einem Edge-Proxy. Führt der Redirect-Router einen anderen Entrypoint, oder kennt
   der Edge-Proxy den Alt-Host nicht, antwortet `https://radio-admin.iuk-ue.de/` über HTTPS **gar
   nicht** oder mit einem Zertifikatsfehler — also **keine** 302-Zeile, sondern ein Verbindungs-
   oder TLS-Fehler, und die drei `curl` aus §D Nr. 7 **laufen ins Leere, statt rot zu werden**.
   Das ist ⬜ **N6**.

⚠️ **Der Redirect wird im selben Fenster wie der Umschwenk scharf, nie davor** (§A Nr. 5, §0.1).

⚠️ **Der DNS-Eintrag `radio-admin.iuk-ue.de` muss BLEIBEN, solange der Redirect steht.** Er ist
die Abhängigkeit des Redirects, kein Abbau-Posten. Der Redirect fällt, sobald im
Traefik-Zugriffsprotokoll über **vier zusammenhängende Wochen** kein Treffer mehr erscheint — und
dann in dieser Reihenfolge: Labels aus `compose.yaml`, `SUITE_REDIRECT_RULE_RADIO_ADMIN` aus der
`.env`, **DNS zuletzt** (§5.8).

**Der Preis: die Regel lebt auf dem Server, nicht im Repo.** Die Labels sind **Struktur** und
gehören als per Env parametrisierte Labels in die Repo-`compose.yaml`. Die zwei **Werte** leben in
der `.env` auf dem Server und sind in keinem Repo nachlesbar. Damit die nächste Sitzung sie kennt,
gehören sie an **drei** Orte: (1) `compose.yaml` im Repo · (2) `.env.example` neben der
`SUITE_TRAEFIK_RULE`-Zeile · (3) **ins Cutover-Protokoll, wörtlich, beide gesetzten Werte**, plus
nach dem Deploy `docker compose config | grep -A2 radio-admin-alt`.
→ ____________________

---

## §C — Im Fenster: neun Schritte

**Freeze → Snapshot → Volume sichern → Import → Parität + Stichproben → `.env` → `up -d` →
Verifikation → Router.**

Jeder Schritt: Befehl · Erwartung · **was ihn scheitern lässt und wie man es merkt.** Ergebnis
danebenschreiben, nicht nur abhaken (`files-cutover.md:192-196`).

⛔ **ZWEI ARBEITSVERZEICHNISSE, UND §C WECHSELT ZWISCHEN IHNEN.** Wer §C von oben nach unten in
**einer** Shell fährt, ohne den Wechsel zu machen, legt den Schnappschuss in Schritt 2 in ein
Verzeichnis, in dem Schritt 4 ihn als `./radio-admin-snapshot.sqlite` **nicht** findet — und der
ganze Quellarm (§V, §S, Abfrage R) greift ins Leere. Dieselbe Protokollzeile führt §5.3 für den
Abbautag; hier sind es **zwei**:

> Arbeitsverzeichnis auf dem Server — **Suite-Checkout**: ____________________
> Arbeitsverzeichnis auf dem Server — **Alt-Checkouts** (⬜ **N10**): ____________________

| Schritt | Verzeichnis | Warum |
|---|---|---|
| **1**, **3** | **Alt-Checkouts** (⬜ N10) | `docker compose -f radio-admin/…` und `-f radio-inventar/…` — aus dem falschen Verzeichnis: `no configuration file provided` |
| **2** | **Alt-Checkouts** für `docker volume ls`; **der Schnappschuss wird ins Suite-Checkout geschrieben** (`-v "<Suite-Checkout>":/out`) | Schritt 4 liest ihn dort als `./radio-admin-snapshot.sqlite` |
| **4**–**9** | **Suite-Checkout** | `pnpm exec tsx scripts/import/radio.ts`, `docker compose ps -q suite`, `docker compose up -d`, die `.env` |

⚠️ **Auch §G (Rückweg) und §5.3/§5.7 (Abbau) wechseln zwischen denselben zwei Verzeichnissen.**

| # | Schritt | Warum nicht früher | Warum nicht später |
|---|---|---|---|
| 1 | **Freeze** beider Alt-Apps (Schreibwege aus) | — | Jede Ausleihe oder Rückgabe **nach** dem Snapshot steht in einer Datei, die niemand mehr importiert. Der Verlust ist **stumm**: Parität, Zählungen und Health sind grün, die Zeile fehlt einfach |
| 2 | **Echter Snapshot** per `.backup` | Ohne Freeze ist die Kopie ein Zwischenstand mitten in einem Schreibvorgang | Der Import darf **nie** gegen einen laufenden Alt-Stack laufen |
| 3 | **Volume sichern** (SQLite-Kopie + `pg_dump` des Kiosk-Postgres) | Der Dump gehört zum eingefrorenen Stand, nicht zu einem späteren | ⚠️ Der Kiosk-Postgres hängt an **keiner** Sicherung, die dieses Repo kennt (`scripts/backup.sh:15-21` kennt `*.db` und `BLOB_DIR`). Fällt das Volume ohne Dump, ist die `AdminUser`-Zählung für immer weg |
| 4 | **Import** in `radio.db` | Ohne Snapshot keine stabile Quelle; ohne den früheren Deploy (§A Nr. 1) kein Schema, in das geschrieben werden könnte | Der Import ist der langsamste Schritt; nach ihm folgen nur noch Prüfungen |
| 5 | **Parität + Vorabzählung + Feldstichproben + R und Z** | Ohne Import nichts zu vergleichen | ⚠️ **Die Parität allein gibt die Freigabe nicht her** |
| 6 | **`.env` scharf schalten** — ohne die drei ⏸-Zeilen | Vor dem Import stünden Boot-Prüfungen auf einer Datenlage, die es nicht gibt; und `SUITE_HOST_RADIO` **vor** dem Registry-Eintrag bricht den Start der **ganzen** Suite ab (§B.1) | — |
| 7 | **`docker compose up -d --force-recreate suite`** | — | — |
| 8 | **Verifikation** gegen den **Prüfcontainer** mit vorgetäuschtem `Host`-Kopf | — | Nach dem Umschwenk ist die Prüfung keine Vorprüfung mehr, sondern eine Nachricht über einen bereits sichtbaren Zustand |
| 9 | **Router umschwenken:** Alt-Router zuerst weg, **dann** die drei ⏸-Zeilen, `up -d` | Nie zwei Router gleichzeitig; der Alt-Kiosk muss **zuerst** weg, sonst ist nicht deterministisch, wer gewinnt (`files-cutover.md:167-170`) | Ab hier läuft die Uhr für den Rückweg (§G) |

**Was zwischen 8 und 9 ausdrücklich nicht passieren darf:** die HTTP-Grenze fällt **mit** dem
Umschwenk, nicht davor. Deshalb ist Schritt 9 **ein** Schritt und nicht zwei.

### Schritt 1 — Freeze

**Arbeitsverzeichnis: Alt-Checkouts** (⬜ N10, §C Kopf).

⛔ **Ohne ⬜ U4/C.5 wird dieser Schritt nicht begonnen.** Solange offen ist, welcher Prozess das
`radio-inventar`-Frontend ausliefert, bleibt ein Schreibweg offen, den niemand gestoppt hat — und
sein Verlust ist stumm.

```bash
date -u +%Y-%m-%dT%H:%M:%SZ            # → <freeze_iso>, ins Protokoll
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

`<freeze_iso>` → ____________________ · `ps` → ____________________ ·
`curl https://radio.iuk-ue.de/` → ____________________

⚠️ **Das Arbeitsverzeichnis der drei `docker compose -f …`-Befehle ist ⬜ N10** — wo die zwei
Alt-Checkouts auf dem Server liegen, steht in §0. Aus einem falschen Verzeichnis gerufen, findet
`-f radio-admin/docker-compose.yml` nichts, und die Meldung sieht nach einem Compose-Problem aus.

⛔ **DIE DREI GESTOPPTEN DINGE SIND DIE LISTE, DIE §G WIEDER STARTET** — `radio-admin/app`,
`radio-inventar/backend` **und** der Auslieferungsweg des Frontends (⬜ U4). **Der Stopp-Befehl
jedes dieser drei gehört WÖRTLICH ins Protokoll**, und zwar hier:

| # | Was | Stopp-Befehl, wörtlich |
|---|---|---|
| 1 | `radio-admin/app` | `docker compose -f radio-admin/docker-compose.yml stop app` |
| 2 | `radio-inventar/backend` | `docker compose -f radio-inventar/docker-compose.yml --profile full-app stop backend` |
| 3 | Auslieferungsweg des Frontends (⬜ **U4**) | ____________________ |

⛔ **Die Regel, die daraus folgt und die in §G noch einmal steht:** *der Stopp-Befehl aus dieser
Tabelle ist die Vorlage des Start-Befehls in §G — Wort für Wort, nur `stop` gegen `start`
getauscht.* Insbesondere wandert `--profile full-app` **mit**. Ein `start` ohne das Profil kann
ein No-op sein, und ein No-op sieht im Rollback genauso aus wie ein Erfolg.

**Erwartung:** beide Schreibwege sind zu. `radio.iuk-ue.de` ist ab hier nicht bedienbar — das ist
der Beginn der angekündigten Auszeit, nicht ein Fehler.
**Der ISO-Zeitstempel ist ab hier der Cutoff jeder Vergleichsrechnung** (Abfrage R, Abfrage Z).
**Scheitert an:** einem noch laufenden zweiten Frontend-Prozess. ⚠️
`radio-inventar/docker-compose.yml` führt nur `postgres` und `backend` (letzteres hinter einem
Profil) — **wer das Frontend ausliefert, ist ⬜ U4/C.5** und muss **vor** dem Freeze bekannt sein.
**Wie man es merkt: an der Rücklesung oben, im selben Schritt.** ⚠️ **Ohne die Rücklesung fällt es
erst in Schritt 5 auf**, also **nach** dem Import — und der Verlust selbst bleibt stumm.

### Schritt 2 — Echter Snapshot

⛔ **Das Ziel des Snapshots ist das SUITE-Checkout, nicht `$PWD`.** Schritt 4 und der ganze
Quellarm (§V, §S, Abfrage R, die zwei Null-Zählungen aus Schritt 5 (b)) lesen ihn unter dem
**blossen Dateinamen** `./radio-admin-snapshot.sqlite` — sie finden ihn also nur, wenn er im
Suite-Checkout liegt. **Deshalb steht der Ablageort hier ausgeschrieben und nicht als `$PWD`:**
`$PWD` ist genau das Verzeichnis, aus dem der Befehl gerade läuft, und das ist hier das
**Alt**-Checkout.

```bash
docker volume ls | grep -i radio-data            # → E2, ins Protokoll
VOL=<die Zeile aus dem Befehl oben>
docker run --rm -v "$VOL":/d -v "<Suite-Checkout aus dem Kopf von §C>":/out alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1;
         sqlite3 /d/data.sqlite ".backup /out/radio-admin-snapshot.sqlite"'

# Rueckelesung, im selben Handgriff — sie kostet nichts und faengt das falsche Verzeichnis:
ls -la "<Suite-Checkout aus dem Kopf von §C>/radio-admin-snapshot.sqlite"
```

`$VOL` (E2) → ____________________ · Snapshot-Größe → ________ Bytes

⚠️ **`.backup`, nicht `cp`.** `radio-admin` läuft im WAL-Modus; eine WAL-Datenbank besteht aus
**drei** Dateien, und ein `cp` verliert den Schwanz aller committeten Transaktionen —
**paritätsgrün**, weil eine abgeschnittene Quelle mit sich selbst vollkommen einig ist.
`.backup` ist die Hausform: `scripts/backup.sh:41-43` sichert **jede** `*.db` unter `DATA_DIR` mit
genau diesem Befehl. **Diese eine Form gilt, in der Generalprobe wie im Fenster** — es gibt keine
angebotene Alternative, die jemand von Hand nachbauen müsste.

⛔ **UNMITTELBAR DANACH: den Journal-Modus der QUELLE NEU messen. Am Freeze-Abend, nicht aus dem
Gedächtnis.** Die Ablesung `delete` stammt vom **2026-08-21** und ist **datiert** — ein Update von
`radio-admin`, eine geänderte Startkonfiguration oder ein Migrationsschritt genügt, um sie
umzustoßen (`docs/superpowers/berichte/2026-08-21-radio-import-abnahme.md:147-159`). **Das ist eine
Auflage des Import-Abnahmeberichts und keine Vorsichtsgeste.**

```bash
sqlite3 radio-admin-snapshot.sqlite "pragma journal_mode;"
# Und die Probe, die die eigentliche Frage ENTSCHEIDET — traegt der Quellarm
# heute Abend noch `-readonly`, oder nicht:
sqlite3 -readonly radio-admin-snapshot.sqlite "select 1;" \
  && echo "readonly OK" || echo "readonly SCHEITERT -> Quellarm ohne -readonly"
```

> Journal-Modus der Quelle: ____________ · `-readonly`-Probe: ☐ OK ☐ **scheitert** ·
> gemessen am ____________ (UTC)

⚠️ **Die zweite Zeile entscheidet, die erste protokolliert.** `pragma journal_mode` gegen die
`.backup`-Zielkopie meldet den Modus **dieser Datei** und muss nicht der der Quelle sein —
§L.1 belegt für `radio-admin` WAL (`radio-admin@265abd5 server/src/db/index.ts:28`) und
protokolliert für den 2026-08-21 zugleich `delete`. **Der Widerspruch wird hier nicht aufgelöst,
sondern umgangen:** maßgeblich ist, ob ein Readonly-Handle gegen den Arm aufgeht, den dieses
Fenster tatsächlich liest.

* **`delete`** (Erwartung, Stand 2026-08-21) → der Quellarm behält `-readonly`. Weiter.
* **`wal`** → ⚠️ **auch die Quelle verliert `-readonly`**: dieselbe `-shm`-Falle wie im Ziel
  (**NT8**, §L.3). Dann alle Quellarm-Befehle dieses Fensters — §V, §S, Abfrage R, die zwei
  Null-Zählungen aus Schritt 5 (b) — **ohne** `-readonly` fahren und die Abweichung ins Protokoll
  schreiben. **Kein Abbruch, nur eine andere Leseform.**
* ⚠️ **Gemessen wird gegen die KOPIE, nicht gegen das Volume.** Gegen die eingefrorene Originaldatei
  liefe derselbe Befehl in genau die NT8-Falle, deren Meldung `unable to open database file (14)`
  wie ein Defekt aussieht und keiner ist.

**Erwartung:** eine Datei `radio-admin-snapshot.sqlite` mit plausibler Größe.
**Scheitert an:** dem **deklarierten** statt dem echten Volume-Namen. Compose präfixt deklarierte
Volumes mit dem Projektnamen (`radio-admin_radio-data`); ein `-v radio-data:/d` legt ein **neues,
leeres** Volume an — laut, aber ein verbrannter Schritt im Fenster.
**Wie man es merkt:** `unable to open database file` bzw. eine Snapshot-Datei von wenigen Kilobyte.

⚠️ **Die lokale `radio-admin/data/data.sqlite` ist als Beleg unbrauchbar:** leer und vorbaselinig —
`.tables` zeigt nur `__drizzle_migrations`, `device_events`, `devices`, `software_versions`;
`loans`, `api_tokens` und `users` **fehlen ganz**. **Jede** Zahl kommt aus dem Snapshot, nie aus
dieser Datei.

**Und im selben Schritt die Zählungen gegen die Kopie**, die die Sollwerte setzen: **§V.0 (die
Vorabzählung aus der laufenden Alt-Anwendung, NT9) und A1–A13 vollständig**. Reihenfolge zwingend
**Freeze → §V.0 → `.backup` → A1**, weil nur diese Reihenfolge einen abgeschnittenen oder
veralteten Snapshot findet. Zwei Abfragen sind **Abbruchbedingungen des Fensters**: **A6**
(zehnstellig → **abgesagt, nicht angepasst**) und **A10/A11**.

⛔ **§V.0 Handgriff 2 hat im Fenster eine zusätzliche Bedeutung:** der Änderungszeitpunkt der
Quelldatei muss **vor** `<freeze_iso>` liegen. Liegt er danach, hat der Freeze nicht gegriffen —
zurück zu Schritt 1, und **nicht weiterimportieren**.

### Schritt 3 — Volume sichern (Archiv)

```bash
# radio-inventar: Werte ZUERST ablesen, dann dumpen (E3)
docker compose -f radio-inventar/docker-compose.yml exec -T postgres printenv POSTGRES_USER
docker volume ls | grep -i postgres_data

docker compose -f radio-inventar/docker-compose.yml exec -T postgres \
  pg_dump -U "<echter POSTGRES_USER>" -d radio_inventar --format=custom \
  > radio-inventar-final-$(date +%Y%m%dT%H%M%S).dump
```

`POSTGRES_USER` (E3) → ________ · Volume (E3) → ________ · Dump-Datei → ____________________

**Erwartung:** ein Dump mit plausibler Größe, in der Archivablage (⬜ **N8** — wohin, entscheidet
der Betreiber **vor** diesem Schritt, nicht danach).
**Scheitert an:** übernommenen **Vorbelegungen** statt gelesenen Werten. `POSTGRES_USER` trägt nur
einen `:-radio`-Default (`radio-inventar/docker-compose.yml:7`); nur `POSTGRES_DB: radio_inventar`
ist hart gesetzt (`:10`).
**Wie man es merkt:** `FATAL: role "radio" does not exist`.

⚠️ **Der Kiosk-Postgres fällt aus jeder Sicherung heraus, die dieses Repo kennt.** **Dieser Dump
ist der einzige.** Er ist zugleich die Voraussetzung dafür, dass die `AdminUser`-Zählung überhaupt
noch möglich ist — **ein gelöschtes Volume nimmt die Antwort mit**. Die **sechs**
Postgres-Zählungen (P1–P6) sind **Abbau**-Schritte (§5.3), brauchen aber dieses Volume.
⚠️ **Sechs, nicht fünf.** P6 ist der Archiv-Dump selbst („Erst danach darf das Volume fallen").

**Dazu die Archivprobe:** beide Archivdateien werden **geöffnet** (§5.4) — der Schritt, den Spec 1
nicht führt. Geöffnet am ______ durch ____________

### Schritt 4 — Import

Der Importer ist `scripts/import/radio.ts`, **committet, mit Test, und von Hand abgenommen**
(`docs/superpowers/berichte/2026-08-21-radio-import-abnahme.md`) — kein Handgriff am Server und kein
nicht committetes Skript. Die Aufrufform ist die der Generalprobe: dasselbe Skript, dasselbe
positionale Argument, ein **anderes `DATA_DIR` je Lauf.**

✅ **L6 — abgelesen aus dem Bau am 2026-08-27.** Die Abschlusszeile hat die Form
`Radio-Import OK — <n> Zeilen, Parität grün.` (`scripts/import/radio.ts:672`; der Gedankenstrich ist
U+2014, die Umlaute sind byteweise geprüft). ⚠️ **Als Grep-Anker wird nur `Radio-Import OK`
verwendet** — ein Anker mit Umlaut und U+2014 ist über zwei Shell-Ebenen nicht verlässlich.
**Geprüft werden Zeichenkette UND Exit-Code, nicht nur einer von beiden.**

⚠️ **`$DATA_DIR/radio.db` gibt es auf dem HOST nicht.** `DATA_DIR=/data` ist ein Wert **im
Container** (`compose.yaml:79`); dort mountet `compose.yaml:99` das **benannte Volume** `suite_data`
(`compose.yaml:252-254`), und ein benanntes Volume hat keinen vereinbarten Host-Pfad. Der Import
dagegen läuft zwingend aus einem **Repo-Checkout auf dem Host** — das standalone-Image führt weder
`scripts/` noch `tsx`. Deshalb sind es **vier Handgriffe** und nicht zwei.

⛔ **Nicht `DATA_DIR=/data` auf dem Host.** Unprivilegiert scheitert `mkdirSync` auf `/` mit
`EACCES` (laut, ein verbrannter Schritt); als `root` entsteht `/data/radio.db` **auf dem Host**,
der Import läuft durch, und die Abschlusszeile meldet **Parität grün** — Parität vergleicht beide
Arme durch **dasselbe** Handle und ist grün, egal wo die Datei liegt. Schritt 5 (a) läse dann
dieselbe falsche Datei und bestätigte sie; alle Freigabeprüfungen wären grün, während Schritt 7 im
Container eine **nagelneue leere** `radio.db` bekommt. **Das ist NT10, und Handgriff 2b ist die
Gegenzählung dagegen.**

**Arbeitsverzeichnis: Suite-Checkout** (§C Kopf) — hier und in allen folgenden Schritten.

```bash
# --- 0) Die Kennung, unter der der Prozess LAEUFT — aus §A Nr. 12 (⬜ N3), nicht aus
#        dem Image. Massgeblich ist der `user:`-Schluessel des Compose-Service
#        (compose.yaml:62, `user: ${SUITE_USER:-1001:1001}`), NICHT `USER nextjs`:
#        `adduser --system --uid 1001 nextjs` setzt kein `-G nodejs` (Dockerfile:42-43),
#        `USER nextjs` laeuft also als 1001:65533(nogroup), und auf arm64 verlangt
#        .env.example:252 sogar SUITE_USER=1001:1000. Wer die Image-Zahl nimmt, setzt eine
#        Kennung, die von der der uebrigen Modul-Datenbanken ABWEICHT — und die Erwartung
#        unten ist dann zwangslaeufig rot, ohne dass ein Fehler vorlaege.
UID_APP=<uid aus §A Nr. 12>
GID_APP=<gid aus §A Nr. 12>

# --- 1) Volume-Namen ABLESEN, nicht raten. Ins Protokoll — DIESE EINE ZEILE gilt fuer
#        Handgriff 3, Handgriff 3b, Schritt 5 und §D Nr. 4.
docker volume ls | grep -i suite
VOL_SUITE=<die Zeile aus dem Befehl oben>        # in Prod: suite_data

# --- 1b) Die Container-ID VOR dem Dateitausch. Sie ist die linke Seite der Gegenprobe
#         in Schritt 7 — eine UNVERAENDERTE ID dort ist ein Stopp-Punkt.
docker compose ps -q suite      # → <container_id_vorher>. `-q` statt `--format`: eine
                                # Go-Vorlage in `--format` nimmt nicht jede Compose-Version an,
                                # und ein stiller Formatfehler kostet genau diese Gegenprobe.

# --- 2) Import auf dem HOST, in ein WEGWERF-DATA_DIR.
#        `data/files` mit anlegen: ein BIND-Mount erbt die Verzeichnisstruktur des
#        Images NICHT — nur ein LEERES benanntes Volume tut das (Dockerfile:64-71).
IMP="$HOME/cutover-radio"
rm -rf "$IMP" && mkdir -p "$IMP/data/files"
DATA_DIR="$IMP/data" pnpm exec tsx scripts/import/radio.ts ./radio-admin-snapshot.sqlite
echo "exit=$?"      # ✅ L6: Zeichenkette UND Exit-Code, nicht nur einer von beiden

# --- 2b) NT10, ERSTE HAELFTE: ist der Import ueberhaupt DORT gelandet?
#         Ein vergessenes DATA_DIR schreibt nach ./.data/radio.db — und die Paritaet
#         bleibt gruen, weil sie nur intern gegen sich selbst zaehlt.
ls -la "$IMP/data/radio.db"
ls -la ./.data/radio.db 2>/dev/null    # ERWARTET: "No such file or directory"
```

`$VOL_SUITE` → ____________________ · `<container_id_vorher>` → ____________________
Zählzeile des Importers (`Quelle: users=… software_versions=… devices=… device_events=… loans=…`)
→ ____________________
Abschlusszeile des Importers → ____________________ · Exit-Code → ______
`ls -la "$IMP/data/radio.db"` → ________ Bytes, geändert ____________ ·
`./.data/radio.db` ☐ existiert **nicht** (richtig) ☐ **existiert → NT10 hat zugeschlagen**

⛔ **NT10, erste Hälfte — was ein Treffer unter `./.data/radio.db` bedeutet:** `DATA_DIR` war beim
Aufruf nicht gesetzt. Der Import ist dann **an der falschen Stelle grün**. **Handgriff:** beide
Dateien löschen, `DATA_DIR` setzen, Import wiederholen. **Nicht** die falsche Datei ins Volume
kopieren — sie ist nicht falsch **entstanden**, aber sie ist nicht die, gegen die Schritt 5 zählt,
und ein zweiter Import in dieselbe Datei ist **paritätsrot mit `missingInSource`** (der Zielarm
läuft ohne `WHERE`, `scripts/import/radio.ts:605-607`).

```bash
# --- 3) Erst NACH gruener Paritaet ins Volume. Pfade ausgeschrieben, Loeschung und
#        Eigentumsuebergabe IM Container. Keine Variable, die nirgends gesetzt ist.
docker compose stop suite      # VOR Handgriff 3 — Begruendung unten (N1)
docker run --rm -v "$VOL_SUITE":/data -v "$IMP/data":/neu \
  -e UID_APP="$UID_APP" -e GID_APP="$GID_APP" alpine sh -c '
    rm -f /data/radio.db /data/radio.db-wal /data/radio.db-shm
    cp /neu/radio.db* /data/
    chown "$UID_APP:$GID_APP" /data/radio.db*
    ls -ln /data'

# --- 3b) NT10, ZWEITE HAELFTE: liegt die Datei jetzt im RICHTIGEN Volume?
#         Baustein aus §Z.0, Fensterform. Eine `0` in Schritt 5 ist ZUERST ein
#         Volume-Fehler und erst danach ein Datenbefund.
docker run --rm -v "$VOL_SUITE":/data alpine sh -c 'ls -ln /data; stat -c "%n %s %y" /data/radio.db'
```

**Erwartung Handgriff 3:** `ls -ln /data` zeigt `radio.db` mit **derselben numerischen Kennung**
wie die übrigen Modul-Datenbanken im Volume. Ausgabe → ____________________
**Erwartung Handgriff 3b:** das Volume zeigt **alle** Modul-Datenbanken (nicht nur `radio.db`),
und `radio.db` trägt die Größe und den Änderungszeitpunkt aus Handgriff 2b.
Größe ________ · geändert ____________ · Kennung ________

**Scheitert an:** einem **erfundenen** Volume-Namen — dann legt `docker run` ein neues, leeres
Volume an, `ls -ln /data` zeigt **nur** `radio.db` und keine der sechs anderen Modul-Datenbanken.
⚠️ **Das ist das Erkennungsmerkmal**, und es ist der einzige billige.

⚠️ **Das `radio.db` im Volume MUSS vorher da sein und MUSS weg:** §A Nr. 1 hat `/api/health/radio`
mit 200 beantwortet, und das heißt, `openModuleDatabase` hat die Datei bereits angelegt
(`src/core/db/index.ts:12-22`). Die Löschung ist notwendig, nicht zeremoniell — und sie steht auch
im Abnahmebericht des Importers als Runbook-Satz: **„`radio.db` löschen, dann importieren"**, nicht
„importieren" (`docs/superpowers/berichte/2026-08-21-radio-import-abnahme.md:198-204`).

⚠️ ✅ **N1 ist eingelöst, und die Antwort verschärft den Handgriff, statt ihn zu entspannen.**
Gemessen am 2026-08-27: `getModuleDb` cacht den Handle auf `globalThis.__suiteDb` und schließt ihn
**nie** (`src/core/db/index.ts:24-34`), und `starteRadioHintergrund()` ruft `getDb()` beim Boot
(`src/app/m/radio/_lib/boot.ts:611-612`). **Der laufende Stack hält `radio.db` dauerhaft offen.**
Deshalb steht `docker compose stop suite` **fest** vor Handgriff 3 und ist keine konservative
Option mehr.
⛔ **Der Preis dieses Stopps gehört ins Protokoll, und er ist größer, als der Handgriff aussieht:**
der Stack bleibt von **Handgriff 3 bis zum `up -d` in Schritt 7** unten — **einschließlich des
ganzen Schrittes 5** (NT9-Kette, fünf Zählungen, NT4, fünf Feldstichproben, §S.3, §S.4, R und Z).
Der Container bedient für `radio` noch keine Domain, **aber er bedient portal, qr, feedback, files,
lagerbuch und aufgaben** — die angekündigte Auszeit umfasst also **diese sechs Module mit**, nicht
nur `radio`. **Das gehört in die Ankündigung, nicht in die Nachbetrachtung.**
⚠️ **Kein Zwischenstart zur Verkürzung:** ein `up -d` vor Schritt 7 macht die Gegenprobe
`<container_id_vorher>` gegen `<container_id_nachher>` wertlos.
**Das ist dieselbe Abwägung wie ⬜ L14 und gehört in dieselbe Ablesung.**
Stopp begonnen ____________ · Stopp beendet ____________ · Dauer ________

⚠️ **Der `chown` ist keine Kür:** `Dockerfile:89` startet den Prozess als `USER nextjs`,
`Dockerfile:72` übereignet den Mountpunkt. Eine root-eigene `radio.db` lässt die **Migrationen beim
Boot** mit `SQLITE_CANTOPEN` scheitern — laut, im Container-Log, aber ein verbrannter Durchlauf.

**Der Rückweg bei roter Parität ist die LEERE Ziel-DB** — hier stärker: bei rot wird Handgriff 3
**gar nicht gefahren**, das Volume bleibt unangetastet, und der Rückweg ist `rm -rf "$IMP"`.
⚠️ **Rot heißt bei diesem Importer nicht „nichts ist passiert":** die Parität läuft **nach** dem
Schreiben, in derselben Transaktion (`scripts/import/radio.ts:627-645`). Ein geworfener
Paritätsfehler bedeutet **„das Wegwerf-Ziel ist bereits beschrieben"** — deshalb wird es verworfen
und nicht nachgebessert.

⚠️ **Die Zahlen aus Schritt 5 gelten nur, wenn `VOL_SUITE` aus derselben Protokollzeile stammt,
gegen die Handgriff 3, Handgriff 3b und Schritt 8 gefahren sind.** Drei verschiedene Ablesungen
desselben Namens sind drei Gelegenheiten für drei verschiedene Volumes.

Einfügereihenfolge `users`, `software_versions` → `devices` → `device_events` → `loans`, Spalten
**namentlich**, `api_tokens` wandert **nicht** (die Tabelle existiert im Ziel nicht),
`zugangscodes` ist **nicht Teil des Imports**.
**Scheitert an:** der FK-Kante (A3) oder einem `device_events.source`, den das TS-Enum nicht kennt
(A5). **Wie man es merkt:** harter Abbruch mit SQLITE-Constraint-Fehler. **Das ist der gute Fall.**

### Schritt 5 — Parität, Vorabzählung, Stichproben, Retention-Gegenprobe

⚠️ **Dieser Schritt ist der Grund, warum dieses Kapitel überhaupt lang ist. Die Parität allein gibt
die Freigabe nicht her** (`CLAUDE.md`: „Paritätscheck beweist den Datenbank-Rundlauf, nicht die
Richtigkeit der Feldzuordnung"). **Ein Vorlauf und vier Prüfungen, alle fünf Pflicht.**

⛔ **Gelesen wird ab hier mit dem Zielarm aus §L.2 — Mount ohne `:ro`, `sqlite3` OHNE `-readonly`,
kein `immutable=1`.** Eine frisch importierte `radio.db` liegt im WAL-Modus und trägt noch keine
`-shm`; ein Readonly-Handle darf sie nicht anlegen und bricht mit
`unable to open database file (14)` ab — **eine Meldung, die wie ein Importfehler aussieht und
keiner ist** (**NT8**, §L.3, gemessen in
`docs/superpowers/berichte/2026-08-21-radio-import-abnahme.md:78-179`). ⚠️ **Die Befehle der Pläne
vom 2026-08-18 tragen an dieser Stelle noch `-readonly`. Sie sind durch NT8 überholt** — wer es
zurückschreibt, baut die Falle wieder ein.

#### (0) NT9 — die Vorabzählung wird dagegengestellt. Der Schritt VOR allen Zählungen.

⛔ **Die Parität ist gegen einen veralteten Schnappschuss strukturell blind, und kein Befehl dieses
Schrittes heilt das.** Quell- und Zielarm der Paritätsprüfung stammen aus **demselben** einmal
gelesenen Objekt — dem Snapshot. Ein zwei Stunden alter, in sich konsistenter Stand ergibt
plausible Zahlen und **grüne** Parität, auch wenn die echte Quelle inzwischen weitergelaufen ist.
**Die einzige Verteidigung ist die Vorabzählung aus der LAUFENDEN Alt-Anwendung (§V.0), und sie
wirkt nur, wenn jemand sie hier von Hand dagegenstellt.**

**Die Kette hat vier Glieder, und sie wird in dieser Reihenfolge gelesen:**

| Glied | Woher | Was ein Bruch an dieser Stelle bedeutet |
|---|---|---|
| **(1) Vorabzählung** aus der laufenden Alt-Oberfläche | §V.0 Handgriff 3, **vor** dem `.backup` | — (sie ist die Wahrheit, gegen die gemessen wird) |
| **(2) A1** gegen die Snapshot-Kopie | §V, A1 (Schritt 2) | (1) ≠ (2) → der Schnappschuss ist **veraltet** oder mit `cp` statt `.backup` gezogen. **Beides paritätsgrün** |
| **(3) Zählzeile des Importers** (`Quelle: users=… loans=…`) | Handgriff 2 dieses Schrittes | (2) ≠ (3) → der Importer **liest weniger**, als der Snapshot führt, und schreibt dieselbe kleinere Zahl paritätsgrün ins Ziel |
| **(4) Zählung im Ziel** | (a) unten | (3) ≠ (4) → im Ziel fehlen Zeilen, obwohl der Importer sie gelesen hat |

> (1) Geräte ________ · aktive Leihen ________ · abgeschlossene Leihen ________ ·
> abgelesen am ____________ (UTC)
> (2) A1 `devices` ________ · `loans` ________ · davon `returned_at is not null` ________
> (3) Zählzeile des Importers: ____________________________________
> **(1) gegen (2) gestellt?** ☐ ja, gleich ☐ **Abweichung** → ____________________
> **(2) gegen (3) gestellt?** ☐ ja, gleich ☐ **Abweichung** → ____________________

⛔ **Jede Abweichung in (1)→(2) hält das Fenster an.** Der Handgriff ist **nicht** „Import
wiederholen", sondern: Freeze prüfen (§C Schritt 1 Rücklesung), Änderungszeitpunkt der Quelldatei
gegen `<freeze_iso>` stellen (§V.0 Handgriff 2), und **erst dann** neu snapshotten.
⚠️ **In der Generalprobe kann NT9 nicht geschlossen werden** — dort gibt es keinen Freeze, die
Quelle läuft weiter, der Schnappschuss ist konstruktionsbedingt schon beim Lesen veraltet. **Die
Generalprobe hat die Mechanik dieser Zeile geprüft, nicht ihre Aussage. Der scharfe Lauf ist
dieser.**

#### (a) Die FÜNF Zählungen — gegen DREI linke Seiten, nicht gegen eine

```bash
for t in devices software_versions users device_events loans; do
  printf '%s\t' "$t"
  echo "select count(*) from $t;" | docker run --rm -i -v "$VOL_SUITE":/data alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /data/radio.db'
done
# dazu, nur fuers Protokoll — Tabelle ohne Quellgegenstueck:
echo "select 'zugangscodes', count(*) from zugangscodes;" | docker run --rm -i \
  -v "$VOL_SUITE":/data alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /data/radio.db'   # MUSS 0
```

| Tabelle | (2) Snapshot (A1) | (3) Importer-Zählzeile | (4) Ziel | alle drei gleich? |
|---|---|---|---|---|
| `devices` | ________ | ________ | ________ | ☐ |
| `software_versions` | ________ | ________ | ________ | ☐ |
| `users` | ________ | ________ | ________ | ☐ |
| `device_events` | ________ | ________ | ________ | ☐ |
| `loans` | ________ | ________ | ________ | ☐ |
| `zugangscodes` | — (keine Quelle) | — | ________ | MUSS 0 |
| `api_tokens` | ________ (nur Protokollzeile) | — | — (existiert im Ziel nicht) | — |

⛔ **Nicht die Sechser-Schleife** — `api_tokens` existiert im Ziel nicht, die Schleife ist **by
construction rot** (`Error: no such table: api_tokens`), und die Meldung liest sich wie ein
Importfehler.
⚠️ **Eine `0` ist ZUERST ein Volume-Fehler** und erst danach ein Datenbefund. Die Gegenprobe steht
in Handgriff 3b und ist bereits gelaufen; sie wird **nicht** hier wiederholt.
Dazu die Invarianten, der Index-Check und `zugangscode_id` im Ziel: die vollständige Liste steht in
**§Z.2 bis §Z.6** und wird von dort gefahren, nicht hier neu formuliert.

#### (b) NT4 — die zwei Null-Zählungen gegen die Faltung, QUELLE GEGEN ZIEL

⛔ **Diese Probe ist die einzige, die den Fehler noch fangen kann, und sie ist nach dem Import
nicht nachholbar.** `devices.alamos_integrated` und `devices.loanable` sind die zwei **nullable**
`mode: "boolean"`-Spalten des Zielschemas. Ein falsch gefaltetes `false` — aus einem `undefined`,
das `null` hätte bleiben müssen — ist dort **nicht mehr von einem echten `false` zu unterscheiden**
(„Alamos nicht erfasst" wird „nicht integriert"), und es ist **paritätsgrün**, weil beide Arme
durch denselben Mapper laufen.

**Baustein aus §Z.2 (b), Fensterform — Zielarm:**

```bash
echo "select count(*) from devices where loanable is null;" | docker run --rm -i \
  -v "$VOL_SUITE":/data alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /data/radio.db'
echo "select count(*) from devices where alamos_integrated is null;" | docker run --rm -i \
  -v "$VOL_SUITE":/data alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /data/radio.db'
```

**Quellarm** (gegen die Snapshot-Kopie; dieselbe Abfrage, weil die Spaltennamen auf beiden Armen
zeichengleich sind, §S.2):

```bash
sqlite3 -readonly radio-admin-snapshot.sqlite "select count(*) from devices where loanable is null;"
sqlite3 -readonly radio-admin-snapshot.sqlite "select count(*) from devices where alamos_integrated is null;"
```

| Spalte | Quelle | Ziel | Differenz |
|---|---|---|---|
| `loanable is null` | ________ | ________ | ________ |
| `alamos_integrated is null` | ________ | ________ | ________ |

**Beide Differenzen MÜSSEN `0` sein.** ⛔ Eine Differenz ≠ 0 heißt: die Faltung hat `null` zu
`false` gemacht. **Import verwerfen, `radio.db` löschen, Mapper korrigieren** — nicht nachbessern,
und **nicht umschwenken**.
⚠️ **Ergab Schritt 2 `wal` für den Quell-Journal-Modus, entfällt `-readonly` auch hier.**

#### (c) Die feldweisen Stichproben und die Zeitstempel-Stichprobe

**Fünf** Paare bzw. Tripel, je eine Zeile, zeilengenau gegen die Snapshot-Kopie: `issi`↔`tei` ·
`created_at`↔`updated_at`↔`last_updated_at` · `snapshot_call_sign`↔`borrower_name` ·
`alamos_integrated`↔`loanable` · `serial_number`↔`hiorg_id`↔`opta`. **Die Auswahlregel und die
Abfragen stehen in §S.1/§S.2** und werden von dort gefahren. Die `id`s werden **hier neu
abgelesen**, nicht aus der Generalprobe übernommen. → ____________________

**Die Zeitstempel-Stichprobe (§S.3):** der diskriminierende Wert (jüngste abgeschlossene Leihe) und
der doppeldeutige (älteste), plus die vier Angaben der Retention-Kontrollgruppe.
→ ____________________

**Und `devices.last_updated_at` (§S.4)** — die einzige Spalte mit Typwechsel (`integer` ms →
`text YYYY-MM-DD`). → ____________________

#### (d) Die Retention-Gegenprobe R und die Zeitstempel-Grenzprobe Z

Mit `<freeze_iso>` in **beiden** Armen.

⚠️ **`'now'` gehört hier NICHT hin.** Schritt 2 und Schritt 5 liegen Minuten auseinander, und eine
Leihe auf der Zwei-Monats-Grenze wechselt in diesen Minuten die Seite — **ein falsches Rot mitten
im Fenster**, dessen vorgeschriebener Handgriff „Import verwerfen" lautet. `<freeze_iso>` macht die
Grenze unbeweglich.

**Abfrage R:**
```bash
# Quelle, Millisekunden — der Faktor 1000 steht absichtlich im SQL.
sqlite3 -readonly radio-admin-snapshot.sqlite "
select count(*) from loans
 where returned_at is not null
   and returned_at < (strftime('%s','<freeze_iso>','-2 months') * 1000);"

# Ziel, Sekunden — derselbe Cutoff, ohne Faktor, gegen DIESELBE $VOL_SUITE-Protokollzeile.
echo "select count(*) from loans
 where returned_at is not null
   and returned_at < strftime('%s','<freeze_iso>','-2 months');" \
| docker run --rm -i -v "$VOL_SUITE":/data alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /data/radio.db'
```
> **Abfrage R** — Quelle: ________ · Ziel: ________ · gleich? ☐ ja ☐ nein

* ⚠️ **Der Faktor 1000 steht im Quellarm absichtlich im SQL und NICHT im Zielarm.** Wer ihn im
  Quellarm weglässt, zählt **alle** zurückgegebenen Leihen und hält das für eine bestätigte
  Schätzung. Wer ihn im Zielarm hinzufügt, zählt null und hält das für „nichts betroffen".
* **Abweichung bedeutet:** Ziel deutlich **höher** → der Faktor-1000-Fehler hat zugeschlagen, die
  Zeitstempel liegen im Jahr 1970, und der nächste Retention-Lauf löscht die komplette
  abgeschlossene Leihhistorie. Ziel **niedriger** → der Import hat Zeilen verloren.
* ⛔ **Abbruchbedingung: Abweichung → kein Umschwenk.** Der Import wird verworfen, `radio.db`
  gelöscht, der Mapper korrigiert, der Import läuft neu gegen dieselbe Snapshot-Kopie.

⚠️ **Dies ist die LEITFASSUNG von Abfrage Z.** Dieselbe Abfrage steht dreimal im Runbook — hier
(§C Schritt 5 (d)), in der Generalprobe (§P.7) und beim Abbau (§5.2). Die zehn Glieder sind in
allen dreien **zeichengleich**; abweichen darf **allein** die Zugriffsform (Generalprobe:
Bind-Pfad `$GP/data/radio.db`; Fenster und Abbau: `docker run … -v "$VOL_SUITE":/data`). **Wer hier
eine Zeile ändert, ändert sie in allen dreien** — sonst probt die Generalprobe eine andere Abfrage,
als die zwei ⛔-Sperren im Fenster und beim Abbau fahren.

**Abfrage Z — zehn Zeilen, und alle zehn müssen `0` sein:**
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
> Z — zehn Zeilen, jede einzeln eintragen (nicht „alles 0"):
> loans.returned_at ____ · loans.borrowed_at ____ · loans.created_at ____ ·
> loans.updated_at ____ · devices.created_at ____ · devices.updated_at ____ ·
> software_versions.created_at ____ · users.last_seen_at ____ ·
> device_events.changed_at ____ · devices.last_updated_at (Formatprobe) ____

* `946684800` = 2000-01-01T00:00:00Z, `4000000000` = 2096-10-02T07:06:40Z.
* ⚠️ **Beide Grenzen, und die obere ist nicht Zierrat:** `< 946684800` fängt Sekunden in einer
  Millisekunden-Quelle (Jahr 1970), `> 4000000000` fängt die **Gegenrichtung** — rohe
  Millisekunden, die ungeteilt in einer Sekundenspalte landen (Jahr 57000).
* ⚠️ **Neun Spalten sind Zahlen, die zehnte ist Text.** `devices.last_updated_at` ist die einzige
  Spalte mit Typwechsel; für sie ist die Grenzprobe eine **Formatprobe** und sagt nichts über die
  **Zone**.
  ⚠️ **„Alle zehn", nicht „alle drei"** — die Erfüllungsliste von Spec 2 nennt an dieser Stelle
  drei, das SQL führt zehn Glieder. Eine Prüfliste, deren Kopf eine andere Zahl nennt als ihr
  Rumpf, wird unter Zeitdruck gekürzt.

**Die Zahlen aus R und Z werden EINMAL ermittelt und ZWEIMAL gelesen:** hier als Freigabe, in §5.2
als Abbau-Sperre. **Dieselbe Protokollzeile.**

### Schritt 6 — `.env` scharf schalten, ohne die drei Router-Zeilen

**Arbeitsverzeichnis: Suite-Checkout** (§C Kopf).

Alle Zeilen aus §B **außer** den drei mit ⏸. **Das schließt `SUITE_UPDATER_GROUP_RADIO` (⬜ E1b)
ein** — sie trägt kein ⏸ und wird hier gesetzt. **Hier steht die Auswahl ausgeschrieben, damit sie
um 22:30 nicht aus einer vierzehnzeiligen Tabelle siebenhundert Zeilen weiter oben im Kopf gebildet
werden muss:**

```dotenv
# ── Block „── Modul radio ──" (.env.example:408-647) ──
SUITE_ADMIN_GROUP_RADIO=<E1>
SUITE_UPDATER_GROUP_RADIO=<E1b>
# SUITE_ACCESS_GROUP_RADIO  — DIESE ZEILE DARF NICHT EXISTIEREN (§B, Tabelle).
RADIO_AUSLEIH_SITZUNG_SECRET=<openssl rand -base64 32, frisch, NICHT gleich AUTH_SECRET>
RADIO_AUSLEIH_SITZUNG_STUNDEN=<E4, Vorschlag 12>
RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=5
RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=30
RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=300
RADIO_HISTORIE_PURGE=0          # Cutover-Schalter, wird nach dem Fenster ENTFERNT (§D Nr. 14)
# RADIO_HISTORIE_MONATE=2                 # Vorbelegung, im Fenster nicht setzen
# RADIO_HISTORIE_ERSTLAUF_MINUTEN=1440    # Vorbelegung, im Fenster nicht setzen

# ⛔ NICHT HIER — die drei ⏸-Zeilen aus §B kommen erst in Schritt 9:
#    SUITE_HOST_RADIO · SUITE_TRAEFIK_RULE · SUITE_REDIRECT_RULE_RADIO_ADMIN
```

⚠️ **Der Block ist eine Wiederholung aus §B, keine zweite Wahrheit.** Weicht er von §B ab, gilt
§B — dort steht die Begründung je Zeile.

**Scheitert an:** `SUITE_ACCESS_GROUP_RADIO=` (leer statt entfernt) → **Startabbruch** in Schritt 7.
**Wie man es merkt:** `up -d` läuft, der Container startet nicht, und die Meldung ist
selbsterklärend. → ____________________

### Schritt 7 — `up -d`

```bash
docker compose pull && docker compose up -d --force-recreate suite
docker compose ps -q suite      # → <container_id_nachher>, gegen <container_id_vorher>
docker compose images suite                              # Digest ins Protokoll — GEGEN §A Nr. 1
docker compose logs --since 2m suite | head -1           # die ROHZEILE ins Protokoll
docker compose logs --since 2m suite | grep -i '\[radio\]'
```

`<container_id_nachher>` → ____________________ · Digest → ____________________
Rohzeile des Logs, ungefiltert → ____________________

⛔ **Der Grep-Anker ist `[radio]`, nicht `radio:` — abgelesen aus dem Bau am 2026-08-27.** Jede
Meldezeile des Moduls trägt die **eckige** Präfixform (`src/app/m/radio/_lib/boot.ts:334`, `:346`,
`:374`, `:399`, `:580`, `:629`), und der Quelltext sagt es an zwei Stellen wörtlich: „die eckige
Form, **NICHT** `radio:`" (`_lib/boot.ts:429`, `:626`). ⚠️ **Ein `grep -i 'radio:'` trifft damit
NICHTS — und leere Ausgabe liest sich als „keine Warnung", also grün.** Die Pläne vom 2026-08-18
und §P.11 führen noch den alten Anker; **hier gilt der gemessene.**
⚠️ **Das Muster steht OHNE `^`.** Unter `docker compose logs` trägt jede Zeile den Servicenamen als
Präfix (`suite  | [radio] …`); ein verankertes Muster trifft dann ebenfalls nichts. Deshalb steht
die erste **Rohzeile ungefiltert** im Protokoll — damit die Präfixform aktenkundig ist und der
nächste Cutover sie nicht wieder raten muss.

⛔ **`--force-recreate suite`, und die Container-ID wird verglichen.** Schritt 4 Handgriff 3 hat
die Datei im Volume **ersetzt**; läuft danach derselbe Prozess weiter, bedient er den gelöschten
Inode. Der Fehlfall ist vollständig grün: `/api/health/radio` antwortet 200 (§D Nr. 3), die fünf
Zählungen **gegen das Volume** stimmen (§D Nr. 4) — und die Oberfläche zeigt **null Geräte**.
**`<container_id_nachher>` gleich `<container_id_vorher>` ist ein Stopp-Punkt**, kein Hinweis.

⚠️ **`docker compose pull` holt, was in der Registry gerade unter dem verwendeten Tag steht** — das
kann ein **anderes** Image sein als das, gegen das die Generalprobe lief und das §A Nr. 1 geprüft
hat. Deshalb der Digest, und er wird **verglichen**: gleich `<image_digest_soll>` → weiter;
**abweichend → Stopp-Punkt, kein Hinweis.** Wer den Vergleich nicht führen will, fährt Schritt 7
mit **festgenageltem** Digest statt mit dem Tag.

**Erwartung: ZWEI `[radio]`-INFO-Zeilen, keine `[radio]`-WARNUNG.** Beide sind **Ablesungen, keine
Befunde**:

| Zeile | Grep-Anker | Beleg | Was sie sagt |
|---|---|---|---|
| Retention ist abgeschaltet | `Retention abgeschaltet` | `_lib/boot.ts:629-635` | die Folge von `RADIO_HISTORIE_PURGE=0`, also der **vorgeschriebene** Fensterzustand |
| Zustand der **zweiten** Rechtestufe | `SUITE_UPDATER_GROUP_RADIO ist` | `_lib/boot.ts:367-379` | einer von drei: `GESETZT auf "…"` / `GESETZT UND LEER` / `NICHT GESETZT`. Sie erscheint bei **jedem** Start und ist **nie** ein Stopp |

> INFO-Zeilen gezählt: ______ (erwartet **2**) · WARN-Zeilen: ______ (erwartet **0**) ·
> Zustand der Updater-Zeile, wörtlich: ____________________________________

⛔ **„Genau eine Zeile" wäre hier falsch, und die Berichtigung ist gemessen.** Die Pläne vom
2026-08-18 kannten die sechste Boot-Meldung aus C.6/B4 (2026-08-21) noch nicht. **Die
Stopp-Bedingung ist nicht die Zeilenzahl, sondern das Fehlen jeder `[radio]`-WARNUNG.** Eine
Prüfliste, die eine normale zweite Info-Zeile als Fund liest, hält das Fenster um 22 Uhr an.
⛔ **Und die Updater-Zeile wird GELESEN, nicht überflogen:** steht dort ein Gruppenname, der nicht
⬜ E1b ist, ist das ein **Tippfehler in der `.env`** — und die einzige Stelle, an der er sichtbar
wird. Der Boot bricht deswegen nicht ab, und die Verwaltung wirkt vollständig in Ordnung.

⛔ **DIE ZWEI ZEILEN, DIE HIER NICHT MEHR ERSCHEINEN DÜRFEN — UND SIE HABEN VERSCHIEDENE
LOG-STUFEN.** **Vor** dem Import sind beide legitim; **nach** dem Import bedeutet jede von beiden,
dass `DATA_DIR` vertippt oder das Volume nicht gemountet ist — **Stopp**. Aber nur **eine** von
beiden ist ein `warn`, und deshalb findet die WARN-Regel oben die andere **nicht**:

| Zeile | Stufe | Beleg | Grep-Anker |
|---|---|---|---|
| „`devices` ist leer" | **`console.warn`** | `_lib/boot.ts:580-586` | `devices ist leer` |
| „`radio.db` existierte vor diesem Start nicht" | ⛔ **`console.info`, NICHT `warn`** | `_lib/boot.ts:399-405` | `existierte vor diesem Start nicht` |

⛔ **Der Bau begründet es an Ort und Stelle** (`_lib/boot.ts:390-396`): beim **ersten** Deploy — der
den Abräum-Worker trägt und **vor** dem Import liegt — ist die Abwesenheit der Datei legitim, ein
`warn` machte einen vorgeschriebenen Deploy zum Stopp-Punkt. „Ihre Alarmwirkung holt das Runbook,
indem es diese Zeile an einem benannten Punkt NACH dem Import NICHT sehen darf." **Dieser Punkt ist
hier.**

⛔ **Deshalb hängt ihr Stopp am ANKER, nicht an der Stufe und nicht an der Zeilenzahl** — zeichen-
gleich zur Bauform von `Retention abgeschaltet`:

```bash
docker compose logs --since 2m suite | grep -c 'existierte vor diesem Start nicht'   # MUSS 0 sein
docker compose logs --since 2m suite | grep -c 'devices ist leer'                    # MUSS 0 sein
```

> `existierte vor diesem Start nicht`: ______ (erwartet **0**) ·
> `devices ist leer`: ______ (erwartet **0**)

⚠️ **Ohne diese zwei Zeilen widersprechen sich das Protokollformular und die Stopp-Regel oben.**
Das Formular zählt INFO-Zeilen und erwartet **2**; die Regel erklärt die Zahl für unmaßgeblich und
verlangt **null WARN**. Bei nicht gemountetem Volume nach dem Import misst der Betreiber **drei INFO
und null WARN** — zwei Sätze, die sich widersprechen, und keiner, der entscheidet. **Die zwei
Anker-Zählungen entscheiden.**

⚠️ **Das dritte erwartete Fehlbild: der Container kommt gar nicht hoch, mit `SQLITE_CANTOPEN` beim
Migrationslauf.** **Das ist ein Eigentumsfehler aus Schritt 4 Handgriff 3, keine `.env`-Frage.**
**Wie man es merkt und behebt:** `docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data` —
trägt `radio.db` eine andere numerische Kennung als die übrigen Modul-Datenbanken, wird
Handgriff 3 mit dem `chown` nachgeholt, **und zwar gegen die Kennung aus §A Nr. 12 (⬜ N3), nicht
gegen die aus dem Image.** Die `.env` wird dafür **nicht** durchsucht.

### Schritt 8 — Verifikation gegen den Prüfcontainer

⚠️ **Ohne Traefik-Labels, und der Host muss vorgetäuscht werden.** Der Container hängt an keinem
Router; erreicht wird er über Loopback und Port. **Ohne den `Host`-Kopf läuft jede Anfrage auf den
Portal-Fallback und prüft `radio` überhaupt nicht.**

⛔ **`$IMG` IST IN DIESER SHELL NICHT GESETZT.** Die zwei Zuweisungen des Runbooks liegen in der
**Generalprobe** (§P.4 Handgriff 0 und §P.8) — und eine Variable wird in einer neuen Shell **neu
gesetzt**, nicht über Läufe hinweg geerbt (§Z.7, §5.2). Ein leeres `"$IMG"` macht aus dem `docker
run` unten einen Aufruf **ohne Image-Argument**. Abgelesen wird sie am **laufenden Suite-Container**,
damit der Prüfcontainer garantiert dasselbe Image fährt wie Schritt 7 — und nicht das, was gerade
unter einem Tag steht (`compose.yaml:16`, `image: ${SUITE_IMAGE:-ghcr.io/rubenvitt/iuk-suite:latest}`).

⚠️ **Der Loopback-Port ist ausgeschrieben: `4000`.** Er ist bewusst **verschieden** von den `3999`
der Generalprobe (§P.8), damit eine verwechselte Zeile auffällt statt stillzuschweigen. ⬜ **L13**
bleibt trotzdem eine Zeile des Betreibers: **ist 4000 auf diesem Server belegt, wird hier ein freier
Port eingesetzt und in §A Nr. 12 eingetragen** → ____________. Der Containername ist **keine**
Leerstelle — er steht unten fest.

```bash
IMG=$(docker inspect "$(docker compose ps -q suite)" --format '{{.Config.Image}}')
echo "$IMG"    # ins Protokoll — GEGEN <image_digest_soll> aus §A Nr. 1
docker run --rm -d --name radio-fenster \
  --user "<uid_gid_prozess aus §A Nr. 12>" \
  -p 127.0.0.1:4000:3000 \
  -v "$VOL_SUITE":/data \
  -e DATA_DIR=/data \
  -e SUITE_HOST_RADIO=localhost,radio.iuk-ue.de \
  -e SUITE_ADMIN_GROUP_RADIO=<E1> \
  -e SUITE_UPDATER_GROUP_RADIO=<E1b> \
  -e RADIO_AUSLEIH_SITZUNG_SECRET="$(openssl rand -hex 32)" \
  -e RADIO_HISTORIE_PURGE=0 \
  -e AUTH_SECRET="$(openssl rand -hex 32)" \
  -e AUTH_URL=http://localhost:4000 \
  -e AUTH_TRUST_HOST=true \
  "$IMG"
sleep 15
docker logs radio-fenster 2>&1 | tail -30
```

⛔ **`SUITE_HOST_RADIO` trägt hier ZWEI Werte, durch Komma getrennt — und das ist keine
Bequemlichkeit, sondern die Bedingung dafür, dass dieser Schritt überhaupt `radio` misst.**
`moduleForHost` vergleicht **exakt** gegen `prodHostsFor(m, env)`
(`src/core/registry.ts:251-258`). Mit `SUITE_HOST_RADIO=localhost` allein beansprucht `radio` genau
den Host `localhost` — der Kopf `Host: radio.iuk-ue.de` trifft **kein Modul** und fällt auf das
**Portal** zurück (`src/core/routing.ts:79-83`). Die kopfgestützten Zeilen unten prüften dann den
**Portal-Login**, nicht `radio` — und zwei davon (der 3xx auf `/admin`, das Nicht-Ausliefern von
`/sw.js` auf fremdem Host) wären **grün, ohne geprüft worden zu sein.**
**Belegt, dass zwei Werte zulässig sind:** `envHostsFor` splittet auf `,`
(`src/core/hosts.ts:39-46`), und `validateHostConfig` hat gegen beide Werte nichts (`:65-99`).
**Wer diese Zeile auf einen Wert „vereinfacht", macht sechs der sieben Prüfungen unten
bedeutungslos.**
*Alternative, gleichwertig und ausdrücklich zulässig:* zwei getrennte `docker run` mit je einem
Wert — Stufe 1 (`Host:`-Kopf) und Stufe 3 (`localhost` im Browser) getrennt fahren.

⛔ **`AUTH_DEV_LOGIN` wird hier NICHT gesetzt.** In der Generalprobe hängt der Dev-Login an einem
**Wegwerf**-Bestand, hier am **produktiven** Volume — ein Container mit `AUTH_DEV_LOGIN=true` und
einem echten Bestand samt Ausleihernamen. Alle Prüfungen dieses Schrittes sind kopfgestützt; der
eine Zweig, der eine echte Anmeldung bräuchte, ist die angemeldete Negativprobe der Generalprobe.
**`AUTH_SECRET` wird frisch erzeugt, nie der Prod-Wert.**

⚠️ **Der Textriegel „die `docker run`-Zeile enthält die Zeichenkette `suite_data` nicht" gilt für
die GENERALPROBE, nicht hier** — hier ist `suite_data` das **Prüfobjekt**. Wer den Riegel ohne
seinen Geltungsbereich zitiert, macht diesen Schritt unausführbar (§L.3).
⚠️ **⬜ L14:** ob dieser Container **parallel** zum Schritt-7-Stack booten darf. Ist die Antwort
nein, wird der Schritt-7-Stack für die Dauer von Schritt 8 gestoppt — zulässig, weil er für `radio`
noch keine Domain bedient, **aber er bedient sechs andere Module**. **Deshalb ist L14 vor der
Fensterplanung abzulesen, nicht darin.**

```bash
B=http://127.0.0.1:4000
H='Host: radio.iuk-ue.de'
curl -si -H "$H" "$B/"                        | head -5   # Ausleihe, 200
curl -s  -H "$H" "$B/" | grep -c 'radio-ausleih-rahmen'    # MUSS >= 1 — Portal-Fallback-Probe
curl -si -H "$H" "$B/admin"                   | grep -iE '^HTTP/|^location:'   # Seite: 3xx → Login
curl -s -o /dev/null -w '%{http_code}\n' -H "$H" "$B/admin/geraete/export"     # Handler: 404
curl -s  -H "$H" "$B/api/health/radio"
curl -si -H "$H" "$B/sw.js"                   | head -5
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: iuk-ue.de' "$B/m/radio"     # ✅ L8: 404
docker stop radio-fenster                                  # --rm entfernt ihn dabei
```

⚠️ **Die zweite Zeile ist die wichtigste.** Der Portal-Fallback ist genau dort still, wo er am
teuersten ist: Portal und Ausleihe antworten **beide** 200. Nur der **Body** unterscheidet sie.
✅ **L10 ist abgelesen** und steht deshalb ausgeschrieben im Befehl statt als Platzhalter:
`radio-ausleih-rahmen` (`src/app/m/radio/_ui/AusleihRahmen.tsx:13-24`). **Eine erfundene
Zeichenkette wäre ein Test, der grün ist, weil er nichts trifft.**

✅ **L8 ist abgelesen: `GET /m/radio` mit dem Portal-Host antwortet 404** — `requireRadioHost`
ruft `notFound()`, wenn `istRadioHost` falsch ist (`src/app/m/radio/_lib/host.ts:65-67`, gerufen
aus `src/app/m/radio/page.tsx:9`). **Alles andere als 404 ist ein Fund**: dann bedient der interne
Pfad das Modul auf einem fremden Host.

**Erwartung:** Ausleihe **200** und `radio-ausleih-rahmen` **≥ 1** · Health **200** mit
`"module":"radio"` **und** `revision` = `<revision_soll>` aus §A Nr. 1 · `/sw.js` mit
`content-type: text/javascript` · `/admin/geraete/export` **404** · `/m/radio` auf `iuk-ue.de`
**404**.
Ausgaben → ____________________

⚠️ **Der `/admin`-Riegel hat ZWEI Ausgänge, und sie zu verwechseln ist die Regression, die dieses
Runbook gerade verhindern soll:**

* **Seiten und Server Actions** rufen `requireRadioAdmin()`; das endet für einen **anonymen**
  Abruf in einer **Weiterleitung (3xx) mit `location:` auf den Login**. ⬜ **L7 bleibt offen und
  ist es zu Recht:** der Quelltext sagt selbst, dass `redirect()` den Code zur Laufzeit wählt und
  ein festgeschriebener Wert eine falsche Zusage wäre (`src/app/m/radio/_lib/zugang.ts:381-384`,
  und der Wurf selbst `:513`). **Wer liest ab: der Betreiber, hier, am Cutover-Abend** — protokolliert wird der
  **vollständige** `location`-Wert samt Statuscode. Ein **404** hier hieße: die Seite ruft den
  Riegel gar nicht. → ____________________
* **Route Handler unter `admin/`** bauen ihre Antwort selbst → **404, nie 403 und nie ein
  Login-Umweg.** Ein 403 machte den Bestand an Verwaltungspfaden aufzählbar.
* **Der „angemeldet, aber nicht in der Gruppe"-Zweig ist mit `curl` gar nicht erreichbar** — er
  braucht eine echte Sitzung und ist die angemeldete Negativprobe der Generalprobe (§P.10).

**Was hier strukturell NICHT prüfbar ist** und deshalb in §D wandert: der Redirect vom Alt-Host ·
der **Login-Rückweg** · der alte Service Worker · die gescannten QR-Wege · Cloudflare · TLS.

### Schritt 9 — Router umschwenken

⛔ **EIN Umschwenk für BEIDE Domains.** `radio.iuk-ue.de` und `radio-admin.iuk-ue.de` wechseln in
**derselben** Änderung und **demselben** `up -d`. Die HTTP-Grenze fällt **mit** dem Umschwenk, nicht
davor — deshalb ist dies **ein** Schritt und nicht zwei, und deshalb steht der Redirect nicht
früher scharf (§B.3, §0.1).

⛔ **Und die Wahrheit über Nr. 1, statt sie zu verschweigen: ohne ⬜ U4/C.5 hat dieser Schritt kein
ausführbares Ziel.** Der Handgriff, der `radio.iuk-ue.de` seinem heutigen Router entzieht, ist
**nicht bekannt** — in beiden eingecheckten Alt-Compose-Dateien kommt `traefik` **nicht** vor, es
gibt keine Labels zu entfernen und keine Datei im Repo, in der man sie sucht. **Er steht wörtlich
in der Protokollzeile aus §A Nr. 13, und nur dort.** Fehlt sie, wird das Fenster **nicht eröffnet**
(§A, Abschlusskasten) — um 21 Uhr ist das Rekonstruktionsarbeit an einer fremden
Proxy-Konfiguration.

**In dieser Reihenfolge:**

1. **Alt-Router zuerst weg — gegen `<router_regel_heute>` aus §A Nr. 13, nicht gegen „die
   Labels".** Nie zwei Router gleichzeitig auf derselben Domain — welcher gewinnt, ist nicht
   deterministisch (`files-cutover.md:167-170`).
   Ausgeführter Handgriff, wörtlich → ____________________
2. **Die drei ⏸-Zeilen setzen — in EINER Änderung:** `SUITE_HOST_RADIO`, die
   `SUITE_TRAEFIK_RULE`-Erweiterung, `SUITE_REDIRECT_RULE_RADIO_ADMIN`. **Einkommentieren, nicht
   neu tippen.**
3. ```bash
   docker compose up -d
   date -u +%Y-%m-%dT%H:%M:%SZ    # → <umschwenk_iso>, ins Protokoll
   date -u +%s                    # → <umschwenk_epoch_sekunden>, ins Protokoll
   docker compose config | grep -A2 radio-admin-alt   # ins Protokoll, GEGEN §A Nr. 14
   ```

`<umschwenk_iso>` → ____________________ · `<umschwenk_epoch_sekunden>` → ____________________
`grep -A2 radio-admin-alt` → ____________________

⛔ **Die zwei Zeitstempel sind Pflicht, nicht Zierrat**, und sie werden hier erzeugt, weil es später
keine Gelegenheit mehr gibt: `<umschwenk_iso>` ist der **Nullpunkt der Ein-Stunden-Frist** aus §G,
und `<umschwenk_epoch_sekunden>` ist das **Filterargument** des Bergungsbefehls in §G. Ohne sie ist
der Nachtrag im Rollback nicht ausführbar — man trägt dann entweder gar nichts oder alles nach. Sie
spiegeln `<freeze_iso>` aus Schritt 1.

⚠️ **Die letzte Zeile vergleicht gegen §A Nr. 14.** Trifft `grep -A2 radio-admin-alt` **nichts**,
ist die `compose.yaml` auf dem Server nicht die aus dem Repo — dann hat
`SUITE_REDIRECT_RULE_RADIO_ADMIN` nichts zu parametrisieren, und `radio-admin.iuk-ue.de` antwortet
nach dem Umschwenk mit **gar nichts**. Das ist ⬜ N2, und es ist **kein** Handgriff für dieses
Fenster: `scripts/deploy.sh:84-105` diffed `compose.yaml` byteweise und bricht ab.

**Ab hier läuft die Uhr:** der Rückweg ist ab dem **ersten fachlichen Schreibvorgang** in
`radio.db` kein Routing-Vorgang mehr (§G).

---

## §D — Abnahme nach dem Umschwenk

**Kein Punkt ist durch einen Statuscode allein erfüllt, und keiner durch eine Erwartung.** Ergebnis
danebenschreiben, nicht nur abhaken (`files-cutover.md:192-196`).

**Die Domain antwortet — und es ist nicht das Portal**

- [ ] **1. Die Ausleihe antwortet, und es ist nicht das Portal.**
      ```bash
      curl -si https://radio.iuk-ue.de/ | head -20
      curl -s  https://radio.iuk-ue.de/ | grep -c 'radio-ausleih-rahmen'   # MUSS >= 1
      ```
      **Erwartung:** HTTP 200 **und** im Body die Zeichenkette `radio-ausleih-rahmen`, die es nur
      auf der Ausleih-Fläche gibt (✅ **L10**, `src/app/m/radio/_ui/AusleihRahmen.tsx:13-24`).
      ⚠️ **`-si`, nicht `-sI`** — ein HEAD hat keinen Body und prüft damit nichts
      (`docs/runbooks/suite-update-webfinger.md:220`). Portal und Ausleihe antworten **beide** 200;
      nur der Body unterscheidet sie. → ____________________

- [ ] **2. Keine toten `localtest.me`-Links.**
      ```bash
      curl -si https://radio.iuk-ue.de/ | grep localtest.me       # muss LEER sein
      ```
      ⚠️ **Für `/admin` ist diese Zeile NICHT verwendbar**, und das ist der Grund: anonym antwortet
      `/admin` mit einer **Weiterleitung in den Login** (Nr. 5), also mit einem 3xx **ohne
      verwertbaren Rumpf**. Ein `grep` darauf ist **strukturell leer** und liest sich als grün —
      unabhängig davon, ob irgendwo ein `localtest.me`-Link steht. **Und die Verwaltungsfläche ist
      die einzige, die Navigationslinks in Menge trägt.** Deshalb wandert die zweite Hälfte dieser
      Probe nach **Nr. 10**: dieselbe Person, dieselbe **angemeldete** Sitzung, Seitenquelltext aus
      dem Browser gespeichert, dann `grep localtest.me`.
      `/` → ____________________ · `/admin` (aus Nr. 10) → ____________________

- [ ] **3. Health nennt das Modul und die Revision.**
      ```bash
      curl -s https://radio.iuk-ue.de/api/health/radio
      ```
      **Erwartung:** 200, `"module":"radio"`, `revision` = `<revision_soll>` aus §A Nr. 1.
      Die Feldbedeutungen sind belegt, nicht offen (✅ **L5**): `src/core/health/index.ts:4-16`
      (`module` = Modulname, `status:"ok"` erst nach `openModuleDatabase` + `SELECT 1`) und
      `src/app/api/health/[modul]/route.ts:23-25` (`revision`, 200 bei `ok`, sonst 503).
      → ____________________
      ⚠️ **Nie `/api/health`.** `src/app/api/health/route.ts` liefert konstant `{status:"ok"}` ohne
      Modul und ohne Datenbank; `radio.iuk-ue.de/api/health` antwortet nach dem Cutover weiter
      `ok`, **ohne etwas über radio zu sagen**.
      ⚠️ **Und Health beweist weniger als der Name:** `openModuleDatabase` legt Verzeichnis und
      Datei stumm an (`src/core/db/index.ts:12-22`) — ein vertipptes `DATA_DIR` oder ein nicht
      gemountetes Volume ergibt eine **nagelneue, leere** `radio.db`: Health grün, null Geräte.
      **Deshalb Nr. 4.**

- [ ] **4. Der zählende Check ersetzt `status:"ok"`.** Die **fünf** Zählungen aus §C Schritt 5 (a)
      **noch einmal**, gegen dieselben Sollwerte — dieselbe Zahl vorher und nachher
      (`lagerbuch-cutover.md:452`, `:544`). Gelesen wird mit der `docker run`-Form gegen
      **dieselbe** `$VOL_SUITE`-Protokollzeile, **ohne `-readonly`** (NT8, §L.3), **nicht** mit
      nacktem `sqlite3` gegen `$DATA_DIR/radio.db`: diesen Pfad gibt es auf dem Host nicht. Eine
      `0` heißt hier **zuerst „falsches Volume"**, nicht „keine Daten".
      ⚠️ **Ausgeschrieben statt verwiesen — um 22:50 blättert niemand fünfhundert Zeilen zurück.**
      `$VOL_SUITE` ist in dieser Shell neu zu setzen (§Z.7): **die Protokollzeile aus §C Schritt 4
      Handgriff 1 abschreiben, nicht neu ablesen.**
      ```bash
      VOL_SUITE=<die Protokollzeile aus §C Schritt 4 Handgriff 1>
      docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data   # Gegenprobe VOR der ersten Zahl
      for t in devices software_versions users device_events loans; do
        printf '%s\t' "$t"
        echo "select count(*) from $t;" | docker run --rm -i -v "$VOL_SUITE":/data alpine \
          sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /data/radio.db'
      done
      ```
      → ____________________
      ⚠️ **Was diese Zählung beweist, ist die Datei im Volume — nicht die Sicht des laufenden
      Containers.** Ist `DATA_DIR` im **Container** vertippt, zeigt das Volume weiter die
      importierten Zahlen, während der Container eine leere `radio.db` an einem anderen Pfad
      bedient. Was **die Sicht des Containers** beweist, sind **vier** andere Dinge: die zwei
      **Anker-Zählungen** aus §C Schritt 7 (`devices ist leer` — ein `warn` — und
      `existierte vor diesem Start nicht` — ⛔ ein **`info`**, das die WARN-Regel nicht findet;
      nach dem Import **beide** ein Stopp), das `revision`-Feld aus Nr. 3, der Body aus
      Nr. 1 — **und die geänderte Container-ID aus §C Schritt 7.**

- [ ] **5. `/admin` riegelt ab — mit ZWEI verschiedenen Ausgängen — und `/sw.js` liefert den
      Abräum-Worker.**
      ```bash
      curl -si https://radio.iuk-ue.de/admin | head -5
      #   erwartet: 3xx + location: …/login?…   (Seite) — Code und voller Wert: ⬜ L7
      #   ein 404 hier heisst: die Seite ruft den Riegel nicht.
      curl -si https://radio.iuk-ue.de/admin/geraete/export | head -5
      #   erwartet: 404. Nie 403 (macht Verwaltungspfade aufzaehlbar),
      #   nie ein Login-Umweg (Route Handler bauen ihre Antwort selbst).
      curl -si https://radio.iuk-ue.de/sw.js | head -5
      ```
      **Erwartung `/sw.js`:** `content-type: text/javascript; charset=utf-8`,
      `cache-control: no-cache`, im Body `self.registration.unregister()`. Extern liegt die Route
      unter `/sw.js` mit Scope `/`, intern unter `/m/radio/sw.js` (✅ **N4**,
      `src/app/m/radio/sw.js/route.ts`).
      **Kommt hier HTML oder Portal-Inhalt, greift der Rewrite nicht** — also ist
      `SUITE_HOST_RADIO` falsch gesetzt. Derselbe stille Fall wie Nr. 1, nur mit schärferer
      Ausgabe. → ____________________

- [ ] **6. Kein radio-Manifest auf einem fremden Host.**
      ```bash
      curl -si https://iuk-ue.de/manifest.webmanifest | head -20
      ```
      **Erwartung: kein radio-Manifest.** Der Fehlfall, den sie fängt: ein Manifest oder Icon an
      der **Wurzel** statt unter `src/app/m/radio/` bewürbe **jeden** Suite-Host als radio-PWA —
      alle Suite-Hosts hängen an **einem** Traefik-Router auf **einem** Container
      (`compose.yaml:146-155`).
      ⚠️ **`radio` baut ausdrücklich KEINE PWA** — gemessen: kein `manifest.webmanifest` unter
      `src/app/m/radio` (`layout.tsx:25-31`). Es gibt also gar kein radio-Manifest, das hier
      auftauchen dürfte. Die Prüfung bleibt trotzdem Pflicht: **sie prüft nicht eine Zusage,
      sondern deren Verletzung.** Was `radio.iuk-ue.de/manifest.webmanifest` liefert, ist ⬜ **L11**
      — **wer liest ab: der Betreiber, hier**, abgelesen und protokolliert in jedem Fall.
      → ____________________

**Der Alt-Host, die Ränder und die Logs**

- [ ] **7. Der Redirect vom Alt-Host trifft** (alle drei, protokollpflichtig):
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
      verschluckt** — der Redirect funktioniert, ist aber nicht mehr pfaderhaltend.
      **Ein Verbindungs- oder TLS-Fehler statt einer 302-Zeile heißt: die Entrypoints stimmen nicht
      oder der Edge-Proxy kennt den Alt-Host nicht** (⬜ N6, §A Nr. 8). ⚠️ Das ist der eine
      Fehlfall dieses Punktes, der **nicht rot aussieht, sondern leer** — er wird deshalb
      ausdrücklich protokolliert, nicht wiederholt. → ____________________

- [ ] **8. Das Traefik-Access-Log zeigt keine wachsende `/m/<key>`-Kette.**
      ```bash
      docker logs --tail 200 <E7> | grep -o '/m/[^ "]*' | sort -u | head
      ```
      **Erwartung:** kein `/m/radio/m/radio/…`. Jede weitere Ebene ist ein RSC-/Prefetch-Request,
      der eine Ebene akkumuliert. → ____________________

- [ ] **9. Ein Blick in das Suite-Log, mit der scharfen Trennung.**
      ```bash
      docker compose logs --since 2m suite | grep -i '\[radio\]'
      ```
      **Erwartung: ZWEI `info`-Zeilen** — `Retention abgeschaltet` (`_lib/boot.ts:629-635`) und
      `SUITE_UPDATER_GROUP_RADIO ist …` (`_lib/boot.ts:367-379`) —, **und keine `[radio]`-WARNUNG.**
      **Jede `[radio]`-Warnung ist ein Stopp-Punkt, kein Hinweis.**
      ⛔ **Die Stopp-Bedingung ist das Fehlen jeder WARNUNG, nicht die Zeilenzahl** — die zweite
      Info-Zeile ist die sechste Boot-Meldung aus C.6/B4 und gehört zum Normalzustand.
      ⛔ **UND DIE WARN-REGEL ALLEIN REICHT NICHT.** „`radio.db` existierte vor diesem Start nicht"
      ist ein **`console.info`**, kein `warn` (`_lib/boot.ts:399-405`, begründet `:390-396`) — sie
      fällt durch jede Zählung, die nur Warnungen sucht, und meldet zugleich den teuersten stillen
      Fehlfall des Abends (nicht gemountetes Volume nach dem Import). Deshalb **zusätzlich** die
      zwei Anker-Zählungen aus §C Schritt 7, zeichengleich:
      ```bash
      docker compose logs --since 2m suite | grep -c 'existierte vor diesem Start nicht'  # 0
      docker compose logs --since 2m suite | grep -c 'devices ist leer'                   # 0
      ```
      > `existierte vor diesem Start nicht`: ______ (erwartet **0**) ·
      > `devices ist leer`: ______ (erwartet **0**)
      ⛔ **Anker `[radio]`, nicht `radio:`** (§C Schritt 7): der Bau trägt ausschließlich die eckige
      Präfixform (`_lib/boot.ts:429`, `:626`), und ein `grep -i 'radio:'` liefert **leere Ausgabe**,
      die sich als grün liest. Muster **ohne `^`** — unter `docker compose logs` trägt jede Zeile
      den Servicenamen als Präfix. → ____________________

- [ ] **10. Der Login-Rückweg — Handarbeit, nicht automatisierbar.** Einmal von
      `https://radio.iuk-ue.de/admin` aus anmelden und prüfen, dass man **dort** wieder landet,
      nicht auf dem Portal.
      **Wie der Fehlfall aussieht:** man landet auf `iuk-ue.de`, ohne Fehler und ohne Meldung
      (`src/core/hosts.ts:59-63`: „Ein curl sieht davon nichts"). **Diese Prüfung ist die einzige,
      deren Fehlfall vollständig stumm ist** — deshalb macht sie eine namentlich benannte Person
      (**E8**), und deshalb ist es dieselbe Person, die in §F den ersten Zugangscode ausstellt.
      ⚠️ **Nach einer NEUEN Anmeldung prüfen**, wenn die Gruppe am selben Abend angelegt wurde
      (Gruppen im JWT werden nur beim Login und beim Refresh nachgezogen — bis zu **eine Stunde**
      Verzug, `CLAUDE.md`, Abschnitt Zugriffsschutz).
      **Im selben Handgriff die Nachholung aus Nr. 2:** Seitenquelltext der Verwaltungsfläche aus
      dem Browser speichern, dann `grep localtest.me` — **muss leer sein**, und **hier** bedeutet
      die Leere etwas, weil ein Rumpf da ist.
      Person (E8) ____________ · Landung ☐ radio ☐ Portal · `localtest.me` → ____________

- [ ] **11. Der erste Zugangscode wird ausgestellt** — §F, durch dieselbe Person, **vor** der
      Freigabe an die Nutzer. → ____________________

- [ ] **12. Ein Telefon, das den Alt-Kiosk kannte, einmal neu laden.** Siehe §E.2. **Geprüft wird,
      ob der Abräum-Worker GEWIRKT hat** — nicht, ob er ausgeliefert wird (das ist Nr. 5).
      → ____________________

**Betrieb — die Messungen, die kein Gate belegen kann**

- [ ] **13. Das Backup einmal von Hand — der Glob ist bewiesen, wenn er gelaufen ist.**
      ⚠️ **Nicht bar aufrufen.** `scripts/backup.sh:3` sagt es selbst („Läuft als Host-Cron"), und
      `:7` fällt ohne Env auf `DATA_DIR=/data` zurück — ein Pfad, den es auf dem **Host** nicht
      gibt; `:32-35` bricht dann hart ab (`backup: no *.db in $DATA_DIR — aborting`). Das ist der
      **gute** Fall; der schlechtere ist die naheliegende Reparatur, ein von Hand exportiertes
      `DATA_DIR`, gegen das dann etwas **anderes** gesichert wird als vom Cron.
      **Deshalb ⬜ N5: die zwei Werte VOR dem Fenster aus der Crontab bzw. der Timer-Unit ablesen**
      und hier einsetzen:
      ```bash
      DATA_DIR=<N5> BLOB_DIR=<N5> scripts/backup.sh
      # Fundort des Archivs: $BACKUP_DIR/<stamp>.tar.gz  (backup.sh:8, :38-39, :100);
      # ohne gesetztes BACKUP_DIR ist das $DATA_DIR/backups.
      tar -tzf <das erzeugte Tarball> | grep radio.db
      ```
      **Erwartung:** `radio.db` ist im Tarball. `scripts/backup.sh:24-26` sammelt `"$DATA_DIR"/*.db`
      per `nullglob` und sichert jede Datei per `sqlite3 .backup` (`:41-43`) — **ohne jede
      Skriptänderung**. `BACKUP_KEEP` bleibt unverändert.
      `DATA_DIR` → ________ · `BLOB_DIR` → ________ · Tarball → ____________________

- [ ] **14. Die Retention wieder einschalten — und der zweite Log-Blick, in dem EINE Zeile fehlt.**
      ⛔ **Vorbedingung: R und Z sind grün protokolliert** (§C Schritt 5 (d)) — **R** beide Zahlen
      gleich, **Z alle zehn Zeilen `0`** (neun Zahlgrenzproben plus die **Formatprobe** auf
      `devices.last_updated_at`). Sind sie es nicht, bleibt `RADIO_HISTORIE_PURGE=0` stehen, die
      `info`-Zeile bleibt im Log, **und das Standby-Fenster beginnt nicht** (§5.1).
      Danach: `RADIO_HISTORIE_PURGE=0` **aus der `.env` entfernen**, `up -d`, dann
      ```bash
      docker compose logs --since 2m suite | grep -c 'Retention abgeschaltet'   # MUSS 0 sein
      docker compose logs --since 2m suite | grep -i '\[radio\]'
      ```
      ⛔ **Erwartung: `Retention abgeschaltet` ist WEG — und die Updater-Zeile steht weiter da.**
      „Keine Zeile mehr" wäre falsch: die sechste Boot-Meldung aus C.6/B4 erscheint bei **jedem**
      Start, unabhängig von der Retention (`_lib/boot.ts:367-379`). **Gezählt wird deshalb der
      Anker, nicht die Zeilenzahl.** → ____________________
      ⚠️ Ein nach dem Fenster **vergessenes** `RADIO_HISTORIE_PURGE=0` ist ein **stiller** Verlust
      der Löschrichtlinie, die der DSGVO-Grund für `borrower_name` ist — die Info-Zeile bei
      **jedem** Start ist das einzige, was ihn findbar hält. Der erste Purge läuft danach nach
      `RADIO_HISTORIE_ERSTLAUF_MINUTEN` (Vorbelegung **1440**, `_lib/boot.ts:451`) — bewusst so
      lang, dass Verifikation, Stichprobe und „Router zurück" noch ins Fenster passen.

- [ ] **15. Der Monitor zeigt auf `/api/health/radio`**, nicht auf `/api/health`; **die
      Deployment-Dokumentation mit umstellen — ⬜ U10.**
      ⛔ **`docs/deployment.md` gibt es in diesem Repo NICHT** (`find . -name 'deployment*.md'` →
      keine Ausgabe, und keines der sieben anderen Haus-Runbooks kennt den Namen). **Wo die
      Deployment-Dokumentation liegt, die auf `/api/health/*` zeigt — Repo, Wiki, Server-README —,
      ist ⬜ U10 und eine Betreiberauskunft.** Ohne sie wird dieser Punkt am Abend entweder
      **ohne Handlung abgehakt** oder er hält an. Gibt es sie nicht, ist der Punkt auf **Monitor
      allein** zusammenzuziehen und das hier zu protokollieren.
      Deployment-Dokumentation liegt: ____________________ ☐ es gibt keine ⚠️ **Der Docker-Healthcheck bleibt auf
      `/api/health/portal`** (`compose.yaml:141`) und wird **nicht** umgestellt — er soll den
      Container nicht wegen `radio` neu starten. (Vorbild für den Fehlfall:
      `lagerbuch-cutover.md:122` — „Der Monitor zeigt auf den falschen Endpunkt".)
      → ____________________

- [ ] **16. Die Neuigkeitennotiz ist eingetragen** — §F.3. → ____________________

### §D.1 — Was die abnehmende Person prüft: das ENTSCHIEDENE, nicht das Erwartete

⛔ **Vier Verhaltensweisen der Fläche sehen wie Fehler aus und sind Entscheidungen.** Sie hängen an
keinem Cutover-Schritt — aber wer abnimmt und sie nicht kennt, protokolliert einen Defekt, wo der
Bau plankonform ist, und der Abend verliert Zeit an eine Diskussion, die 2026 schon geführt wurde.
**Keine dieser Zeilen ist eine Nummer der Sechzehn** — sie sind Ablesungen, keine Schritte.

| Was auf der Fläche auffällt | Warum es so ist | Beleg | Abgenommen |
|---|---|---|---|
| Ein Gerät **ohne erfassten Zustand** erscheint als **„frei"**, nicht als „unbekannt" | ⬜ **A-L13**, Betreiberentscheidung vom **2026-08-22**: `status = NULL` fällt auf „frei" zurück. **Kein fünfter Chip-Zustand, kein Ton „unbekannt", keine Sperre der Ausleihe.** ⚠️ **Der Preis ist bekannt und angenommen:** „ein Gerät ohne erfassten Zustand sieht auf der Fläche aus wie ein geprüft freies. Wo Pflege fehlt, ist das der Fläche nicht anzusehen." Dieselbe Faltung wie im Alt-Bestand | `src/app/m/radio/_lib/status.ts:135-175` (der **einzige** Faltungsort des Moduls); `radio-admin/shared/src/loan.ts:19-28` | ☐ |
| `/admin/import` verlangt die **Admin**-Stufe, nicht die Verwaltungs-Stufe | ⬜ **V-L5**: die Spec widersprach sich, der Bau **wählt** und macht die Wahl prüfbar. Gemessen führt `admin/actions.test.ts` **vier** Seiten auf `requireRadioAdmin` (`.toBe(4)`, `:687`, `:745`). Eine Umkehr ist **eine Zeile plus ein Testfall** — aber sie ist eine **Rechteverschiebung** und keine Zeile im Diff | `docs/superpowers/plans/2026-08-24-radio-modul-plan4-grenze-verwaltung.md:377`, `:1105`, `:4383-4384` | ☐ |
| Das **Löschen eines Geräts wird abgelehnt**, solange eine offene Leihe darauf liegt — mit Meldung im `Popconfirm`, nicht durch einen versteckten Knopf | ⬜ **V-L6**, und es ist eine **benannte Abweichung vom Alt-Bestand**: `radio-admin/server/src/repos/deviceRepo.ts:67-70` prüft **nichts**. Begründung: das ist die **wiederherstellbare** Richtung — eine fälschlich verweigerte Löschung kostet einen Klick nach der Rückgabe, eine verwaiste Leihzeile ist Datenschaden ohne Fehlermeldung (Leihen tragen **keinen** Fremdschlüssel, `_db/schema.ts:207`) | `2026-08-24-radio-modul-plan4-grenze-verwaltung.md:378`, `:2975-2978` | ☐ |
| Die Verwaltungs-Ausleihenliste zeigt **kein Bedienelement** zum Filtern nach Gerät oder Zeitraum | ⬜ **V-L11**, **offen beim Betreiber.** Der Umschlag `ausleihenListe` **reicht `deviceId`/`from`/`to` durch**, die Fläche zeigt sie nicht. Das kostet nichts und ist umkehrbar. ⚠️ **Es ist ausdrücklich KEINE Spec-Zusage**, die hier fehlt — der Alt-Bestand schickt nur `page`/`pageSize` (`useLoans.ts:18-23`). **Der gebaute Zustand wird hier BESTÄTIGT, nicht als Mangel protokolliert** | `2026-08-24-radio-modul-plan4-grenze-verwaltung.md:382`, `:2600`, `:4488` | ☐ |

> Abgenommen durch ____________________ am ____________ ·
> ⬜ **V-L11** bestätigt: ☐ so lassen ☐ Bedienelement nachziehen (eigener Posten, **nicht** dieses
> Fenster) → ____________________

⚠️ **Zwei weitere gebaute Defaults hängen an keinem Schritt und stehen hier nur, damit sie nicht
als Fund auftauchen:** **C.4** — der Entleihername ist beim Ausleihen **vorbelegt und
überschreibbar** (`src/app/m/radio/_ui/EntleiherFeld.tsx:153`) — und **C.7** — es gibt **keine**
Offline-Erfassung, konsistent dazu hat der Abräum-Worker **keinen** `fetch`-Handler. Beide folgen
der jeweiligen Empfehlung, beide sind **nicht ausdrücklich bestätigt**.

---

## §E — Der Service Worker des Alt-Kiosk

⚠️ **Er überlebt den Umschwenk, weil der Origin zeichengleich bleibt.** Gemessen: Registrierung
mit **Root-Scope** (`radio-inventar/apps/frontend/src/hooks/usePWA.ts:72-73`), Cache-Name
`radio-inventar-v1` (`public/sw.js:2`), `skipWaiting()` + `clients.claim()` (`:24`, `:40`), also
**aktiv ohne Reload**.

* **Kein dauerhaft veraltetes HTML.** Navigationen sind **network-first** (`sw.js:78-96`);
  solange Netz da ist, kommt die Suite-Antwort durch.
* **Aber ohne Netz** liefert der alte Worker `/` aus seinem Cache — die **Alt-Oberfläche**, gegen
  ein Backend, das es nicht mehr gibt.
* **Und `cache-first` gilt dauerhaft** für `/manifest.json`, `/favicon.svg`,
  `/apple-touch-icon.svg` und drei Icons (`sw.js:100-127`): eine installierte Alt-PWA bewirbt sich
  nach dem Cutover **weiter mit dem alten Manifest**.
* **Dazu die zwischengespeicherten `/api`-Antworten:** Bestands- und Ausleihdaten samt
  Ausleihernamen liegen im Cache eines fremden Telefons.

*Kein Gate sieht davon etwas:* **HTTP 200 mit veraltetem Inhalt.** Kein Build, kein Test, kein
Healthcheck.

### §E.1 — Der Abräum-Worker gehört in den ERSTEN Deploy — er ist am Fensterabend längst draußen

⛔ **Er ist gebaut** (`src/app/m/radio/sw.js/route.ts`, `_lib/sw-quelle.ts`) **und mit dem Deploy
aus §A Nr. 1/2 bereits ausgerollt.** In diesem Fenster wird er **nicht** eingeführt. **§E.2 prüft
deshalb nicht, ob er da ist, sondern ob er GEWIRKT hat.**

**Warum er nicht in dieses Fenster gehört:** **nichts in der Suite ruft
`navigator.serviceWorker.register()`.** Die Route wird ausschließlich von der **Update-Prüfung
eines schon registrierten Workers** abgeholt — der Browser holt das Worker-Skript bei einer
Navigation im Scope neu und vergleicht die Bytes. **Käme der Abräum-Worker erst mit dem Cutover,
gäbe es im entscheidenden Fenster nichts, was sich vom Alten unterscheidet.** Auf einem Gerät, das
den Alt-Kiosk **nie** geöffnet hat, wird die Route nie abgerufen — das ist richtig und kein Fehler.

**Was er tut:** kein `fetch`-Handler, `caches.keys()` leeren, `skipWaiting()` + `clients.claim()`
**vor** `unregister()`. Extern liegt er unter `/sw.js` (Scope `/`), intern unter `/m/radio/sw.js`
(✅ **N4**).

### §E.2 — Wie man am Cutover-Abend prüft, dass er greift

**Zwei Hälften, und die erste beweist die zweite nicht.**

**Hälfte 1 — die Route liefert das Richtige** (`curl`, §D Nr. 5): `content-type: text/javascript`,
im Body `self.registration.unregister()`.
**Was man sieht, wenn nicht:** HTML oder Portal-Inhalt → der Rewrite greift nicht,
`SUITE_HOST_RADIO` ist falsch.

**Hälfte 2 — ein echtes Gerät, und das kann kein `curl`** (§D Nr. 12). ⚠️ **`curl` hat keinen
Service Worker.** Ein Telefon, das den Alt-Kiosk kannte, wird **einmal** neu geladen.
**Erwartung:** im **schlechtesten** Fall **eine** veraltete Seitenansicht, danach die
Suite-Oberfläche; die Registrierung ist weg und die Cache Storage leer.
**Was man sieht, wenn er nicht greift:** HTTP 200 mit der **Alt-Oberfläche**, `radio-inventar-v1`
steht weiter in der Cache Storage, und im Flugmodus erscheint die alte `offline.html`.
**Der genaue Ablesepunkt in den Entwicklerwerkzeugen: ⬜ L12** — welche Einträge unter
*Application → Service Workers* und *Application → Cache Storage* leer sein müssen, und ob ein
„redundant"-Eintrag stehen bleibt. **Wer liest ab: die Person aus E8, an einem echten Gerät, im
Fenster.** → ____________________

**Umfang des Handgriffs: E6** — wie viele Geräte den Alt-Token im `localStorage` tragen, ist im
Repo **nicht abzählbar** (es gibt keine Tabelle). Die Antwort ist eine **Begehung, kein `SELECT`**.
Für Geräte, die den Kiosk **installiert** haben, kommt „einmal Speicher löschen" dazu — ein
Handgriff pro Gerät, kein Serverbefehl. **Und das gehört in die Ankündigung:** der Worst Case ist
**eine** veraltete Seitenansicht je Gerät.
Geräte (E6) → ________ · davon installiert → ________

---

## §F — Der Ausstellungsplan für die Zugangscodes

⬜ **C.3 / E5 ist offen. Beide Zweige stehen hier, weil die Entscheidung am Cutover-Abend zu spät
kommt.**

**Die gemeinsame Lage:** `zugangscodes` ist **nicht Teil des Imports**. Der heutige QR-Code trägt
den **einen geteilten API-Token base64-kodiert als URL-Parameter**, ohne Ablauf und ohne Widerruf.
Und `seedLokal` legt **niemals** eine einlösbare Zugangszeile an.
**Daraus folgt der Zustand, den niemand plant und den man sonst um 22 Uhr entdeckt:** unmittelbar
nach dem Umschwenk steht eine **anonym erreichbare Ausleih-Fläche** ohne **einen einzigen
einlösbaren Code**.

⛔ **Und der erste Code kann erst NACH dem Umschwenk entstehen.** `erstelleCode` verlangt
`requireRadioAdmin()` als erste Anweisung, also eine Anmeldung **auf dem radio-Host** — und bis zum
Umschwenk bedient dieser Host den Alt-Kiosk. Der Fenster-Prüfcontainer hat keine Adresse, unter der
sich jemand anmelden könnte, und der reguläre Stack trägt für `radio` bis Schritt 9 keinen Router.
**Es gibt vor dem Umschwenk keinen Weg, einen Code auszustellen.**

### §F.1 — Zweig „ja, es sind gedruckte Aufsteller im Umlauf" (C.3 = ja)

⚠️ **„Bestandscodes zeichengleich übernehmen" ist hier NICHT möglich.** Ein Aufsteller trägt heute
einen base64-Token in einer URL, kein 28-Zeichen-Crockford-Base32 in sieben Gruppen. **Es gibt keine
Zeichenkette zu übernehmen.** Der Zweig ist **kein Datenvorgang, sondern ein Austausch von Papier**:

1. **Zählen und verorten (E5):** Anzahl, Ort, wer sie ersetzen kann. **Papier ist für jedes Tor
   unsichtbar.** → ____________________
2. **Je Aufsteller ein Code**, ausgestellt in der Suite mit einer `bezeichnung`, die den **Ort**
   nennt — nur so ist später ein einzelner Aufsteller sperrbar, ohne die anderen mitzunehmen. Der
   Code wird **einmal** zurückgegeben und danach in der Verwaltungsliste im Klartext angezeigt und
   gedruckt: er ist kein Einmalgeheimnis, sondern ein **Dauerausweis**.
3. **Drucken** über `/admin/zugaenge/blatt` (`admin/(druck)/zugaenge/blatt/page.tsx`) — die eigene
   Route-Group ist der Grund, warum das Druckblatt Kopfzeile, Navigation und `controlHeight: 44`
   **nicht** auf Papier erbt.
4. **Austauschen, mit Datum je Ort ins Protokoll.** → ____________________
5. **Solange ein Aufsteller nicht ersetzt ist, ist die Handeingabe der Ausweichweg:** der Code wird
   der betroffenen Person **außerhalb** des Aufstellers mitgeteilt und in das Feld auf der
   Startseite getippt (Groß-/Kleinschreibung gleichgültig).
   **Was schiefgeht, wenn man diesen Ausweichweg nicht plant:** der alte QR-Code hört mit dem Port
   auf zu funktionieren, und wer vor dem Aufsteller steht, hat **keinen** Weg herein.
6. ⛔ **Abbruchbedingung für den Umschwenk:** Punkt 5 ist nicht abgedeckt **und** es ist niemand
   erreichbar, der Codes ausstellen kann → **der Umschwenk wird verschoben, nicht durchgeführt.**

### §F.2 — Zweig „nein, keine im Umlauf" (C.3 = nein) — und die Festlegung, die für beide gilt

1. **Wer:** die namentlich benannte Person aus **E8** — dieselbe, die §D Nr. 10 durchführt. Das ist
   kein Zufall: `erstelleCode` verlangt `requireRadioAdmin()` auf dem **umgeschwenkten** Host, also
   eine Anmeldung genau auf dem Weg, dessen Fehlfall stumm ist. **Der Schritt beweist beides in
   einem.**
2. **Wann:** **unmittelbar nach** §D Nr. 3 (Health grün, Modul antwortet) und **vor** der Freigabe
   an die Nutzer. **Nicht vorher** — auf dem Alt-Host gibt es die Fläche nicht.
3. **Auf welchem Host:** `https://radio.iuk-ue.de/admin/zugaenge`. Nicht über den Portal-Host, nicht
   über den internen `/m/radio`-Pfad (der antwortet dort **404**, ✅ L8).
4. **Wie viele:** mindestens einer je Ort, an dem geliehen wird, mit ortsnennender `bezeichnung`.
   Ein einziger Code für alles ist technisch gültig und betrieblich der Rückfall in genau das
   Modell, das dieser Port abschafft: **ein Code, den man sperren muss, sperrt dann alle.**
5. ⛔ **Abbruchbedingung:** die benannte Person kann sich nicht anmelden oder landet nach dem Login
   auf dem Portal → **Stopp**, und der Fall ist §D Nr. 10, nicht ein Codeproblem. Rückweg §G.

**Der benannte Restposten, der nicht behebbar ist:** zwischen Umschwenk und erstem Code steht eine
anonym erreichbare Ausleihfläche ohne einlösbaren Code. **Er ist begrenzt durch die Reihenfolge
oben, nicht beseitigt** — und er steht im Protokoll, damit ihn niemand als Defekt liest.
→ ____________________

> Zweig gewählt: ☐ §F.1 (C.3 = ja) ☐ §F.2 (C.3 = nein) · Person (E8) ____________________ ·
> erster Code ausgestellt am ____________ (UTC) · Anzahl ausgestellter Codes ________

### §F.3 — Die Neuigkeitennotiz ist ein Schritt am Rollout-Tag, kein Vorab-Commit

**Drei Dinge werden am Cutover-Tag gesetzt:**

* **`datum`** = der Tag des **Rollouts**, nicht des Commits.
* **die Registerzeile** in `src/app/m/portal/_lib/neuigkeiten/register.ts` — das Dreieck ist
  Dateiname ↔ Felder (`modul`, `datum`, `slug`) ↔ Registerzeile, und `register.test.ts` hält alle
  drei zusammen. **Eine nicht eingetragene Notiz ist ein roter Test, keine stille Auslassung.**
* **`<N>`** = der tatsächlich gesetzte Wert von `RADIO_AUSLEIH_SITZUNG_STUNDEN` (⬜ **E4**),
  **ausgeschrieben** („zwölf Stunden", nicht „12"). Er ist der einzige Platzhalter der Notiz, und er
  ist einer mit Grund: **eine Anwendernotiz, die eine unbestätigte Zahl behauptet, ist eine falsche
  Auskunft, die niemand mehr korrigiert.**

**Kein Markdown im Text** — er wird als Textknoten gerendert, `**fett**` käme mit Sternchen auf dem
Bildschirm an, und `register.test.ts` prüft es. **Und der Satz aus §E gehört hinein:** im
schlechtesten Fall **eine** veraltete Seitenansicht je Gerät nach dem Umschwenk.
→ ____________________

---

## §G — Der Rückweg

**Er ist ein Routing-Vorgang, und er hat drei Handgriffe — nicht zwei.**

```dotenv
SUITE_HOST_RADIO=                       # LEEREN, die Zeile NICHT entfernen
# SUITE_TRAEFIK_RULE: die Zeile aus §B OHNE die Klausel `|| Host(`radio.iuk-ue.de`)`.
# Die Vorher-Fassung steht woertlich im Fenster-Protokoll zu §C Schritt 9 Nr. 2 — von DORT
# abschreiben, nicht aus dem Gedaechtnis. Zielform, wenn radio die einzige Ergaenzung war:
SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`)
SUITE_REDIRECT_RULE_RADIO_ADMIN=        # leeren; `${…:-radio-admin.invalid}` greift bei leer UND ungesetzt
```
```bash
docker compose up -d
```

**Und dann der dritte Handgriff, der bei `lagerbuch` fehlte — zweiteilig, weil der Freeze zwei
Stacks angehalten hat:**

⛔ **DIE STELLE, AN DER DIESER RÜCKWEG SCHON EINMAL LAUTLOS GESCHEITERT WÄRE — RK-A3.** Die
Fassung, die bis zur Re-Kritik im Plan stand, lautete
`docker compose -f radio-inventar/docker-compose.yml start postgres backend` — **ohne
`--profile full-app`.** `backend` steht hinter `profiles: ["full-app"]`
(`radio-inventar/docker-compose.yml:26-27`); ohne das Profil **kann der Start ein No-op sein, und
ein No-op sieht wie ein Erfolg aus**. **Der Rollback läuft dann ohne Fehlermeldung durch und startet
den Kiosk nicht.** Nach diesem Abschnitt ist der Alt-Kiosk der **einzige** Rückfall für
`radio.iuk-ue.de` — die Domain bliebe nach dem „Rollback" **tot**, und zwar **innerhalb der
Ein-Stunden-Frist, in der es keine zweite Gelegenheit gibt**. Derselbe Grund, den §C Schritt 1 für
den **Stopp** ausschreibt; **das Argument ist richtungsunabhängig.**

⛔ **Die Regel, nach der die Befehle unten entstehen:** *der Stopp-Befehl aus der Tabelle in §C
Schritt 1 ist die Vorlage des Start-Befehls hier — **Wort für Wort**, nur `stop` gegen `start`
getauscht.* Insbesondere wandert `--profile full-app` **mit**.

```bash
# 3a) radio-admin zuerst: er ist die Datenquelle des Kiosk.
docker compose -f radio-admin/docker-compose.yml start app

# 3b) dann der Kiosk selbst, samt seinem Postgres — ⛔ MIT dem Profil, zeichengleich zum
#     Stopp aus §C Schritt 1. OHNE `--profile full-app` ist dieser Befehl moeglicherweise
#     ein No-op OHNE FEHLERMELDUNG (RK-A3):
docker compose -f radio-inventar/docker-compose.yml --profile full-app start postgres backend

# 3c) beide Hosts wieder an ihren Router: radio.iuk-ue.de auf radio-inventar,
#     radio-admin.iuk-ue.de auf radio-admin. ⚠️ NICHT "die Labels, die der Cutover
#     entfernt hat" — es gibt keine: beide Alt-Compose-Dateien fuehren `traefik`
#     nirgends. Der Handgriff ist der, der WOERTLICH neben <router_regel_heute>
#     in §A Nr. 13 steht (U4).
# 3d) den Auslieferungsweg des FRONTENDS wieder starten — Befehl aus Zeile 3 der
#     Stopp-Tabelle in §C Schritt 1. Reihenfolge wie 3a vor 3b: erst Daten, dann Oberflaeche.

# ---- RUECKLESUNG. Der Freeze hat eine, der Rueckweg braucht dieselbe — sonst meldet
#      der Rollback Erfolg und laesst die Domain tot.
docker compose -f radio-admin/docker-compose.yml ps
docker compose -f radio-inventar/docker-compose.yml --profile full-app ps
# Erwartung: `app`, `backend` und `postgres` mit Status `running` — umgekehrt zu Schritt 1.
curl -si https://radio.iuk-ue.de/       | head -3
# Erwartung: die Alt-Oberflaeche, VERGLICHEN mit der Ablesung aus §A Nr. 5.
curl -si https://radio-admin.iuk-ue.de/ | head -3
# Erwartung: der Alt-Verwaltungshost, ebenfalls gegen §A Nr. 5.
```

`ps` → ____________________ · `radio.iuk-ue.de` → ____________________ ·
`radio-admin.iuk-ue.de` → ____________________
3c ausgeführter Handgriff, wörtlich → ____________________ ·
3d ausgeführter Handgriff, wörtlich → ____________________

⛔ **Die Rücklesung ist Teil des Rückwegs, nicht Kür.** Ohne sie meldet der Rollback Erfolg und
lässt die Domain tot — genau der Fehlfall, den 3b oben beschreibt. **Der Freeze hat eine
Rücklesung und begründet sie eigens; der Rückweg braucht dieselbe.**

⚠️ **Der Rückweg startet genau die Prozesse, die §C Schritt 1 angehalten hat — DREI, nicht zwei.**
Die Stopp-Tabelle **ist** die Liste. Ohne 3d bleibt die Domain nach dem Rollback ebenso tot wie
ohne 3a–3c: der Kiosk ist eine **Oberfläche** vor sechs `/v1`-Routen, nicht das Backend allein.
⚠️ **In der Rückweg-Frist von einer Stunde ist „welcher Prozess lieferte eigentlich das Frontend
aus" keine Frage, die man noch klären kann.** Das ist ⬜ U4/C.5, und sie ist **vor** dem Fenster
fällig.

⚠️ **Die Reihenfolge 3a vor 3b ist keine Kosmetik.** Der Kiosk ist Konsument der sechs
`/v1`-Routen von `radio-admin`. Allein zurückgeholt, startet er und zeigt **keinen Bestand** — ein
Rollback, der aussieht wie ein zweiter Ausfall. Und `radio-inventar`s Backend hängt per
`depends_on: postgres: condition: service_healthy`
(`radio-inventar/docker-compose.yml:42-44`): ohne Postgres startet er gar nicht.
⚠️ **`radio-admin.iuk-ue.de` braucht seinen eigenen Router zurück**, sobald
`SUITE_REDIRECT_RULE_RADIO_ADMIN` geleert ist — sonst ist der Alt-Verwaltungshost nach dem Rollback
tot. Der DNS-Eintrag bleibt in beiden Richtungen unangetastet.

⚠️ **Bei `radio` bedeutet der Rückweg etwas anderes als bei `lagerbuch`.** Dort nahm er die Domain
**vom Netz** (`lagerbuch-cutover.md:420`). Hier ist der **Alt-Kiosk der Rückfall**, weil er
`radio.iuk-ue.de` bis zum Umschwenk bedient hat. **Ohne 3a–3d ist die Domain nach dem „Rollback"
tot.**

⛔ **Und der Start von `radio-admin` in 3a ist selbst gefährlich: er löscht Historie**
(`index.ts:35` → `retentionService.ts:47`, Cutoff an der Wanduhr `:9`, `:19`). Der Kiosk purgt
nichts — **die Gefahr sitzt allein in 3a.** Ein Rollback ist deshalb **nur zulässig, wenn §A Nr. 3
als erfüllt nachgewiesen ist.** Sonst wird der Start abgesagt — auch der Rollback.
**Wie man den Schaden merkt, wenn man es doch tut:** ein **erfolgreicher** Start mit der Zeile
`[retention] purged N expired loan(s)`. Kein Fehler, kein roter Test.

**Was der Rückweg NICHT zurückholt:**

1. **Jede Ausleihe und jede Rückgabe, die nach dem Umschwenk in `radio.db` gelandet ist.** Es gibt
   **keinen** Rückweg-Importer (Suite → radio-admin) und kein Vorbild dafür.
2. **Die Historie, die ein Start des Alt-Stacks bereits gelöscht hat.** Der Cutoff hängt an der
   Wanduhr — **jeder weitere Start löscht mehr als der vorige.**
3. **Die ausgestellten Zugangscodes** (§F). `zugangscodes` existiert in der Alt-App nicht; ein
   gedruckter Suite-Code ist nach dem Rollback wertlos, und der alte QR-Weg gilt wieder.
4. **Die Cache Storage der Telefone, auf denen der Abräum-Worker schon gelaufen ist.** Kein
   Schaden — der Kiosk registriert bei der nächsten Navigation neu —, aber die erste Ansicht kommt
   dann aus dem Netz, nicht aus dem Cache.
5. **Nichts an einem 301** — deshalb ist der Redirect ein **302**.

**Die zwei Fristen, ausgeschrieben, damit sie nicht um 22 Uhr entschieden werden:**

* **Point of no return:** der **erste fachliche Schreibvorgang** in `radio.db` — die erste Ausleihe
  oder Rückgabe nach dem Umschwenk. Ab da ist der Rollback ein **Datenverlust mit bekanntem
  Umfang**, keine Routing-Rücknahme.
* **Frist:** Rollback **ohne Nachtrag** nur innerhalb der **ersten Stunde** nach `<umschwenk_iso>`
  (§C Schritt 9), und in dieser Stunde bleibt der Kiosk unter Beobachtung. Danach nur noch vorwärts.

**Der Nachtrag, wenn in der Frist zurückgezogen wird — ausgeschrieben, nicht improvisiert:**
```bash
echo "select id, device_id, borrower_name, borrowed_at, returned_at, return_note
   from loans where created_at >= <umschwenk_epoch_sekunden> order by created_at;" \
| docker run --rm -i -v "$VOL_SUITE":/data alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -header -column /data/radio.db'
```
⚠️ **Die `docker run`-Form gegen `$VOL_SUITE`, nicht `sqlite3` auf dem Host.**
`"$DATA_DIR/radio.db"` gibt es auf dem **Host** nicht (`compose.yaml:79`, `:99`, `:221-223`), und
`DATA_DIR` ist in **keiner** Fenster-Shell dieses Runbooks gesetzt. Mount **ohne** `:ro`, `sqlite3`
**ohne** `-readonly`, **kein** `immutable=1` — dieselbe Zeile wie Abfrage Z, und aus demselben
Grund (NT8, §L.3).
⚠️ **`<umschwenk_epoch_sekunden>` stammt aus §C Schritt 9** und aus nichts sonst. Fehlt er, trägt
man entweder gar nichts oder alles nach.
⚠️ **Die Zeitstempel stehen hier in Sekunden, die Alt-App erwartet Millisekunden — beim Nachtragen
mit 1000 multiplizieren.** Derselbe Faktor, andere Richtung.

> Nachgetragene Leihen: ________ Zeilen · nachgetragen am ____________ durch ____________________

**Was der Rückweg nicht ist:** ein Rückzug auf ein älteres **Image**. Die Rollback-Körnung ist
**grob** — ein älteres Image nimmt portal, qr, feedback, files, lagerbuch und aufgaben mit. **Der
Teilrückzug ist die `.env`, nicht das Image.**

---


## §5.1 — Standby: drei Fristen, weil drei verschiedene Dinge geschützt werden

Grundlage: Spec 2 §5.1 (`docs/superpowers/specs/2026-08-18-radio-cutover-design.md:4183-4234`).

⚠️ **Kapitel 5 dieses Runbooks und Kapitel 5 der Spec tragen NICHT dieselben Nummern.** Nur `§5.1`
trifft, `§5.2` trifft halb; **ab `§5.3` ist dieses Runbook gegenüber der Spec um zwei verschoben**.
Jeder Verweis in Kapitel 5 nennt deshalb **das Dokument dazu**. Die Umschlüsselung:

| Abschnitt in DIESEM Runbook | Stelle in Spec 2 (`…2026-08-18-radio-cutover-design.md`) |
|---|---|
| **§5.1** Standby: drei Fristen | §5.1 (`:4183-4234`) |
| **§5.2** Zählungen gegen radio-admin (A, T, R, Z, 8) | §5.2.1–§5.2.2 (`:4238-4435`) |
| **§5.3** Zählungen gegen radio-inventar (P1–P6) | §5.2.3 (`:4437-4567`) |
| **§5.4** Die Archivprobe | §5.2.4 (`:4569-4601`) |
| **§5.5** Die Abbauliste | §5.3, §5.3.1 (`:4605-4651`) |
| **§5.6** Die Geheimnisse | §5.4 (`:4655-4698`) |
| **§5.7** Der alte Purge ist kein Cron | §5.5 (`:4702-4729`) |
| **§5.8** Der Redirect und sein Ende | §5.6 (`:4733-4759`) |
| **§5.9** Was der Abbau nicht anfasst | §5.7 (`:4763-4780`) |
| **§H** Wann dieser Cutover erfüllt ist | Erfüllungspunkte (`:4784-4876`) |

⚠️ **Zwei Abschnitte dieses Kapitels stehen NICHT in der Tabelle**, weil sie in Spec 2 kein
Gegenstück haben: **§I** (der datierte Nachtrag in Spec 2, hinter §5.9) und der Schlussabschnitt
**„Was dieses Runbook NICHT beantwortet"** (hinter §H). Wer sie in der Spec sucht, sucht vergebens.

⚠️ **Die zwei gefährlichsten Kollisionen, ausgeschrieben:** „§5.5" heißt **hier** die Abbauliste
und **in der Spec** „Der alte Purge ist kein Cron"; „§5.3" heißt **hier** P1–P6 und **in der Spec**
die Abbauliste. Und **`§5.8`/`§5.9` haben in der Spec gar kein Gegenstück** — Kapitel 5 der Spec
endet mit §5.7.

⚠️ **Und die zweite Umschlüsselung, die dieses Runbook durchgehend anwendet:** die Pläne vom
2026-08-18 sprechen von §4.2, §4.5, §4.6, §4.7, §4.8, §4.9 und §3.x. **Hier heißen sie §A, §C, §D,
§E, §F, §G und §P.** Wo unten „§C Schritt 4 Handgriff 1" steht, sagen die Pläne „§4.5 Schritt 4
Handgriff 1" — dieselbe Stelle, ein anderer Name.

**Der Abbau ist die einzige unumkehrbare Handlung dieses Cutovers.** Alles davor ist ein
Routing-Vorgang oder ein wiederholbarer Import; ab dem gelöschten Volume gibt es keine Quelle
mehr, gegen die man nachschlagen könnte. **Deshalb ist jede Sperre dieses Kapitels eine Zählung,
die dokumentiert, WAS verworfen wird** — und kein Handgriff läuft ohne seine vorherige Zählung.

⛔ **Und deshalb wird hier jeder Befehl AUSGESCHRIEBEN und nicht beschrieben.** Die Handgriffe
dieses Kapitels laufen **frühestens vierzehn Tage nach dem Umschwenk**, in einer Sitzung, in der
niemand mehr den Kontext dieses Abends hat. Eine Variable aus der Fenster-Shell existiert dort
nicht mehr, und ein „wie im Fenster" ist dort keine Anweisung, sondern eine Erinnerungsaufgabe.

| Frist | Was sie schützt | Woran sie hängt |
|---|---|---|
| **Stunde 1 nach dem Umschwenk** | Den **Rückweg**: `SUITE_HOST_RADIO=` leeren, `radio.iuk-ue.de` aus `SUITE_TRAEFIK_RULE` nehmen, beide Alt-Stacks in der Reihenfolge 3a–3d zurückholen (§G) | Ab dem **ersten fachlichen Schreibvorgang** in `radio.db` ist Rollback ein **Datenverlust mit bekanntem Umfang**. In dieser Stunde bleibt der Kiosk unter Beobachtung; danach nur noch vorwärts |
| **14 Tage** | Die **Datenquelle** für feldweise Nachprüfung und Re-Import: das radio-admin-Volume bzw. seine Snapshot-Kopie, das radio-inventar-Postgres-Volume, beide Images | ⚠️ **Nicht** der Rückweg — der ist nach Stunde 1 vorbei. Die 14 Tage sind die Zeit, in der ein **Zuordnungsfehler** auffällt, den kein Tor sieht |
| **Dauerhaft, off-server** | Das **Archiv**: `radio-admin-snapshot.sqlite` und der `pg_dump` im Custom-Format, **nicht** auf demselben Server wie die Suite (Spec 1 §9.5.1) | Es ist der Rest, der die Volumes überlebt. Ablageort: ⬜ **N8** |

⚠️ **Die Fehllesart, die diesen Cutover teuer macht:** die 14 Tage als „Rollback-Fenster" zu
lesen. Wer das tut, entspannt die Abnahme („wir können ja zurück") — und genau das kann er nach
Stunde 1 nicht mehr. **Die Abnahme (§D) ist die einzige Stelle, an der noch etwas billig ist.**

### Warum 14 Tage und nicht sieben

Die Frist folgt aus dem **Erstlauf der übernommenen Retention** (Vorbelegung **1440 Minuten**,
also ein Tag, `RADIO_HISTORIE_ERSTLAUF_MINUTEN`, §0.2):

1. Ein **Faktor-1000-Fehler ist paritätsgrün** — beide Paritätsarme laufen durch **dieselbe**
   Mapping-Funktion (`scripts/import/parity.ts:43-56`, ausgeschrieben in
   `scripts/import/portal.ts:73-76`).
2. Sekunden statt Millisekunden legt jedes `returned_at` ins Jahr **1970**. Der Schaden entsteht
   nicht beim Import, sondern beim **ersten Retention-Lauf** — frühestens **einen Tag nach dem
   Umschwenk**, und dann still: die abgeschlossene Leihhistorie ist weg, aktive Leihen leben
   weiter, die Oberfläche sieht funktionsfähig aus.
3. Die **einzige** Quelle, aus der diese Historie zurückkommt, ist das radio-admin-Volume bzw.
   seine Snapshot-Kopie.
4. „Einen Tag nach dem Umschwenk" ist der **frühestmögliche** Zeitpunkt der Sichtbarkeit, nicht
   der wahrscheinliche: bemerkt wird eine fehlende Historie, wenn jemand sie braucht — bei einer
   Nachfrage, einer Auswertung, einem Monatsabschluss. **14 Tage decken einen vollen
   Dienstzyklus ab** und lassen nach dem verdächtigen Tag noch dreizehn Tage zum Nachschlagen.

### Das Standby-Protokoll

**Ohne Datum und Namen endet ein Standby nie** — dann steht in einem Jahr ein gestoppter Stack,
den niemand mehr erklären kann, und niemand traut sich, ihn zu löschen.

> Umschwenk (ISO, UTC) `<umschwenk_iso>`: ____________________
> Umschwenk (Epoch-Sekunden) `<umschwenk_epoch_sekunden>`: ____________
>   — beide aus **§C Schritt 9**, **eine** Ablesung, zwei Schreibweisen.
>   Die Sekundenzahl ist das Filterargument des Bergungsbefehls in **§G** und der Nullpunkt
>   der Ein-Stunden-Frist; das Datum allein ist für beides zu grob.
> Standby-Ende (Umschwenk + 14 Tage): ____________
> Abbau verantwortet (Name): ____________________

⚠️ **Verlängerungsgrund, benannt:** ist die Retention-Gegenprobe **Abfrage R** (§5.2) **nicht**
grün protokolliert, **beginnen die 14 Tage erst, wenn sie es ist.** Eine offene Gegenprobe heißt:
es ist unbekannt, ob die Historie im Ziel angekommen ist — und dann ist das Volume nicht Standby,
sondern die **einzige Kopie**.
**Dasselbe Kriterium hängt am Entfernen von `RADIO_HISTORIE_PURGE=0`** (§D Nr. 14):
**R und Z werden einmal ermittelt und zweimal gelesen** — dort als Freigabe, hier als
Abbau-Sperre. Dieselbe Protokollzeile.

> Abfrage R grün protokolliert am: ____________ · Abfrage Z grün protokolliert am: ____________
> → Beginn der 14 Tage: ____________

### Zwei Sätze, die diesen Abbau von den fünf vorherigen des Hauses trennen

* ⚠️ **Der billige Rückweg endet früher als das Standby-Fenster.** Bei `files` und `lagerbuch`
  war „Router zurück" bis zum Abbau möglich (`files-cutover.md:299-301`). Hier stirbt der
  Rückweg nach **einer Stunde** (§G), weil der erste fachliche Schreibvorgang in `radio.db`
  der Point of no return ist **und es keinen Rückweg-Importer gibt**
  (`docs/radio-portierung-analyse.md:626-628`).
* ⚠️ **„Beide parken und in Ruhe schauen" ist hier nicht möglich, und Nachschlagen ist aktiv
  zerstörend.** Der Alt-Kiosk hielt `radio.iuk-ue.de` selbst — es gibt keinen Zustand, in dem
  beide bedienen. Und **jeder Start von `radio-admin` löscht Historie** (Mechanik in §5.7).

---

## §5.2 — Die Zählungen vor dem Abbau: radio-admin

Grundlage: Spec 2 §5.2.1–§5.2.2 (`…2026-08-18-radio-cutover-design.md:4238-4435`).

⚠️ **Keine Zahl in diesem Abschnitt ist ein Wert; jede ist ein Schritt.** Insbesondere ist
`radio-admin/data/data.sqlite` als Beleg **unbrauchbar** (leer und vorbaselinig, `.tables` zeigt
weder `loans` noch `users` noch `api_tokens`). Wer eine Zahl aus dieser Datei ins Protokoll
schreibt, protokolliert einen Stand **vor** der Loan-Migration.

**Alle SQLite-Abfragen gegen die Quelle laufen gegen die Snapshot-Kopie, niemals gegen einen
gebooteten Alt-Stack** (Spec 1 §9.3.4 Zeile 2). Der Grund steht in §5.7: **der Start selbst
löscht.**

⛔ **NT8 gilt auch hier, und die Fassung steht in §L.3, Zeile „Fenster" — nicht in diesem
Abschnitt.** Jeder **Zielarm** unten liest `radio.db` **ohne `-readonly`**, Mount **ohne** `:ro`,
**kein** `immutable=1`.
⚠️ **Und der naheliegende Einwand ist vorweggenommen, weil er sonst am Abbautag zur „Reparatur"
führt:** vierzehn Tage nach dem Umschwenk hält der laufende Stack `radio.db` dauerhaft offen
(`src/core/db/index.ts:24-34`, `_lib/boot.ts:611-612` — ⬜ N1, eingelöst), die `-shm` ist also längst
da, und ein `-readonly` **liefe** vermutlich. Es wird trotzdem nicht geschrieben: **es gibt genau
EINE Fassung dieser Regel**, und ein zurückgeschriebenes `-readonly` ist der **zweite** Treffer,
den die Gegenlese in §L.3 als Fund meldet. Der **Quellarm** behält `-readonly`, solange §L.1 am
Freeze-Abend `delete` gemessen hat.

**Was hier NICHT noch einmal läuft** — und warum nicht:

| Abfrage | Gehört zu | Warum nicht hier |
|---|---|---|
| A2 `is_target = 1` | vor dem Import (§V) | Ein Import-Tor. Vor dem Abbau beweist eine Wiederholung nichts — die Kopie hat sich nicht geändert |
| A3 Waisen in `device_events` | vor dem Import (§V) | FK-Kante; der Import bricht hart ab, wenn sie verletzt ist — das ist laut, nicht still |
| A4 doppelte aktive Leihen | vor dem Import (§V) | Sonst lässt sich der partielle Aktiv-Index im Ziel nicht anlegen |
| A5 `source` außerhalb des Enums | vor dem Import (§V) | TS-Enum ohne DB-CHECK |
| A6 Zeitstempel-Größenordnung | vor dem Import (§V) | Zehnstellig → Cutover **abgesagt**, nicht angepasst |
| A7 `sqlite_master` auf Trigger/Views | vor dem Import (§V) | Fachlogik, die kein Repo kennt |
| **A1 / Retention-Zahl** | ⚠️ **beides** — hier als **Abfrage A** und **Abfrage R** | R ist die **einzige** Zahl, die der Faktor-1000-Fehler nicht paritätsgrün überlebt |
| **A9 `dev-user`** | **hier**, falls nicht vor dem Import protokolliert | Sie beantwortet ⬜ **U7** und ist nach dem gelöschten Volume nicht mehr beantwortbar |

> Echter radio-admin-Volumename (⬜ **E2**): ____________________
> Snapshot-Kopie liegt unter: ____________________
> Freeze-Zeitpunkt `<freeze_iso>` (ISO, UTC), aus §C Schritt 1: ____________
> Suite-Volumename `$VOL_SUITE`, hier **neu** abgelesen: ____________________
>   ⛔ gegengelesen gegen die Protokollzeile aus **§C Schritt 4 Handgriff 1** (Fenster-Protokoll):
>   ☐ derselbe Name · ☐ **abweichend → Stopp**. Zwei Ablesungen, **ein** Name — die zweite ist
>   nötig, weil diese Sitzung vierzehn Tage später in einer neuen Shell läuft, **nicht** weil es
>   zwei Volumes gäbe.

### Abfrage A — die Zählungen, paarweise ⛔

**Quelle** (sechs Zahlen, gegen die Kopie):

```bash
sqlite3 -readonly radio-admin-snapshot.sqlite "
select 'devices',           count(*) from devices
union all select 'software_versions', count(*) from software_versions
union all select 'api_tokens',        count(*) from api_tokens
union all select 'users',             count(*) from users
union all select 'device_events',     count(*) from device_events
union all select 'loans',             count(*) from loans;"
```

**Ziel** (**fünf** Zahlen, gegen `radio.db` **im Volume**):

```bash
# ⚠️ ZUERST den ECHTEN Volume-Namen ablesen. Das ist die ZWEITE Ablesung
#    desselben Namens — die erste steht in §C Schritt 4 Handgriff 1, im
#    Fenster-Protokoll. Sie wird hier NICHT geerbt, und das ist Absicht:
#    dieser Abschnitt laeuft fruehestens vierzehn Tage spaeter in einer NEUEN
#    Shell, in der die Zuweisung von damals laengst weg ist. Eine ungesetzte
#    Variable liest ein leeres Volume, und dessen Nullen sehen aus wie ein
#    Datenbefund.
# ⛔ BEIDE Ablesungen MUESSEN denselben Namen ergeben. Der hier abgelesene Wert
#    wird gegen die Protokollzeile aus §C Schritt 4 Handgriff 1 GEGENGELESEN,
#    bevor eine einzige Zahl gezaehlt wird. Zwei verschiedene Namen heissen:
#    hier wird ein anderes Volume gezaehlt als im Fenster befuellt wurde —
#    Stopp-Punkt, kein Datenbefund.
docker volume ls | grep -i suite
VOL_SUITE=<die Zeile aus dem Befehl oben>     # in Prod: suite_data (compose.yaml:252-254)

# Gegenprobe VOR der ersten Zaehlung — sie entscheidet, ob eine 0 ein Befund ist:
docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data
#   Erwartet: portal.db, qr.db, feedback.db, files.db, lagerbuch.db, aufgaben.db,
#   konto.db UND radio.db — die ACHT aus MODULE_MIGRATIONS (:20-58, `radio` steht dort
#   selbst auf :57) plus CORE_MIGRATIONS (:76-78, `konto` auf :77).
#   ⚠️ radio.db entsteht damit schon beim MIGRATIONSLAUF, nicht erst durch den Import —
#   eine vorhandene radio.db belegt also NICHTS ueber den Import. Das belegen die
#   Zaehlungen darunter.
#   Steht dort NUR radio.db, ist der Volume-Name falsch: `docker run` hat ein
#   neues, leeres Volume angelegt, und JEDE folgende 0 ist ein Volume-Fehler,
#   kein Datenbefund.

# KEIN -readonly (NT8) — die Fassung dieser Regel steht in §L.3, Zeile "Fenster".
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

⚠️ **Es sind fünf Paare, nicht sechs.** Die Sechser-Schleife aus Spec 1 §9.4.3 scheitert im
Zielarm an `no such table: api_tokens` — laut, aber ein verbrannter Schritt im Abbau-Protokoll.

* **Erwartung:** fünf Paare gleich, **paarweise, nicht in der Summe**.
* **Abweichung bedeutet:** entweder ist der Import unvollständig, oder `radio.db` ist eine frisch
  angelegte, leere Datei — `openModuleDatabase` legt Verzeichnis und Datei bei Bedarf an
  (`src/core/db/index.ts:12-22`), `/api/health/radio` wäre dabei **grün**.
* **Folge:** ⛔ **blockiert den Abbau.** Ohne fünf gleiche Paare wird kein Volume gelöscht.
* `zugangscodes` hat kein Quellgegenstück und ist **nur Protokoll**. ⚠️ **Zeitindex beachten:**
  in **§C Schritt 5 (a)** — **vor** der ersten Codeausstellung — MUSS diese Zahl `0` sein; **hier**,
  vierzehn Tage nach §F, ist eine Zahl **> 0 richtig und erwartet**. Wer die Zeile aus
  §C Schritt 5 hierher kopiert, erzeugt ein falsches Rot auf einer ⛔-Sperre.

> A — Quelle: devices ____ · software_versions ____ · api_tokens ____ · users ____ ·
> device_events ____ · loans ____
> A — Ziel: devices ____ · software_versions ____ · users ____ · device_events ____ ·
> loans ____ · zugangscodes ____ (Protokoll, > 0 erwartet)
> Fünf Paare gleich? ☐ ja ☐ nein · geprüft am ____________

### Abfrage T — die `api_tokens`-Archivzeile ⛔

Sie ersetzt die Migration und ist eine ausdrückliche Zusage von Spec 1 §2.10 Nr. 1 an Spec 2.

```bash
sqlite3 -readonly -header -column radio-admin-snapshot.sqlite \
  "select id, name, prefix, created_at, last_used_at, revoked_at from api_tokens;"
```

* **Erwartung:** produktiv wenige Zeilen, davon **höchstens eine** mit `revoked_at IS NULL` — der
  Alt-Kiosk als einziger Konsument.
* **Abweichung bedeutet:** mehr als eine lebende Zeile heißt, es gab mehr als einen Konsumenten —
  dann ist die Betreiberauskunft überholt und **es gibt einen Abnehmer, den niemand angekündigt
  hat**.
* **Folge:** ⛔ **blockiert den Abbau**, bis geklärt ist, wer die zweite lebende Zeile benutzt hat.
  Der Klartext ist nie gespeichert — eine mitgenommene Zeile wäre nicht einlösbar. Die Frage ist
  also keine **Migrations**frage, sondern eine **Konsumenten**frage.
* Die Ausgabe geht **wörtlich** ins Protokoll, **ohne `token_hash`**: `last_used_at` ist nach dem
  gelöschten Volume nicht mehr abfragbar.

> T — Zeilen gesamt: ____ · davon `revoked_at IS NULL`: ____ · Ausgabe im Protokoll ☐

### Abfrage R — die Retention-Gegenprobe ⛔

Die eine Stelle, an der der Faktor-1000-Fehler **nicht** paritätsgrün bleibt.

```bash
# Quelle, Millisekunden. <freeze_iso> ist der in §C Schritt 1 protokollierte
# Freeze-Zeitpunkt, NICHT 'now': 'now' wandert zwischen Import und Abbau und liefert
# zwei Zahlen, die sich nicht vergleichen lassen.
sqlite3 -readonly radio-admin-snapshot.sqlite "
select count(*) from loans
 where returned_at is not null
   and returned_at < (strftime('%s','<freeze_iso>','-2 months') * 1000);"

# Ziel, Sekunden — derselbe Cutoff, ohne Faktor. Gelesen wird die Datei IM VOLUME,
# gegen dieselbe $VOL_SUITE-Protokollzeile wie oben: `$DATA_DIR/radio.db` gibt es
# auf dem HOST nicht (compose.yaml:79, :99, :221-223). KEIN -readonly (NT8, §L.3).
echo "select count(*) from loans
 where returned_at is not null
   and returned_at < strftime('%s','<freeze_iso>','-2 months');" \
| docker run --rm -i -v "$VOL_SUITE":/data alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /data/radio.db'
```

* ⚠️ **Der Faktor 1000 steht im Quellarm absichtlich im SQL** und **nicht** im Zielarm. Wer ihn im
  Quellarm weglässt, zählt **alle** zurückgegebenen Leihen und hält das für eine bestätigte
  Schätzung. Wer ihn im Zielarm hinzufügt, zählt null und hält das für „nichts betroffen".
* **Erwartung:** beide Zahlen gleich. Diese Zahl ersetzt die Betreiber-**Schätzung** „< 100" durch
  eine **Zählung** — die Schätzung war nie eine Zählung.
* **Abweichung bedeutet:** Zielarm deutlich **höher** → der Faktor-1000-Fehler hat zugeschlagen,
  die Zeitstempel liegen im Jahr 1970, und der **nächste Retention-Lauf löscht die komplette
  abgeschlossene Leihhistorie**. Zielarm **niedriger** → der Import hat Zeilen verloren, die
  Abfrage A nicht gesehen hat (A zählt, sie datiert nicht).
* **Folge:** ⛔ **blockiert den Abbau** und, wenn sie vor dem Erstlauf der Retention auffällt,
  **auch den Weiterbetrieb**: `RADIO_HISTORIE_PURGE=0` setzen, dann neu importieren.

> R — Quelle: ________ · Ziel: ________ · gleich? ☐ ja ☐ nein · geprüft am ____________

### Abfrage Z — die Zeitstempel-Grenzprobe ⛔

Billiger als R, findet denselben Fehler ohne einen Cutoff — **und sie sagt, WELCHE Spalte
betroffen ist.**

⚠️ **Diese Fassung FOLGT, sie führt nicht.** Die Leitfassung steht in **§C Schritt 5 (d)**;
dieselbe Abfrage steht ein drittes Mal in der Generalprobe (§P.7). Die zehn Glieder sind in allen
dreien **zeichengleich**; abweichen darf **allein** die Zugriffsform (Generalprobe: Bind-Pfad
`$GP/data/radio.db`; Fenster und Abbau: `docker run … -v "$VOL_SUITE":/data`, §L.3). **Wer hier
eine Zeile ändert, ändert sie in allen dreien** — sonst prüft die Abbau-Sperre eine andere Abfrage,
als das Fenster gefahren hat.

⚠️ Gelesen wird die Datei **im Volume**, Mount **ohne** `:ro`, **ohne** `-readonly`, ⛔ **kein**
`immutable=1` — Begründung in §L.3.

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

* `946684800` = 2000-01-01T00:00:00Z, `4000000000` = 2096-10-02T07:06:40Z.
  **Alle ZEHN Zahlen MÜSSEN `0` sein** — neun Zahlgrenzproben **plus** die Formatprobe auf
  `devices.last_updated_at`.
* ⚠️ **Beide Grenzen, und die obere ist nicht Zierrat:** `< 946684800` fängt Sekunden in einer
  Millisekunden-Quelle (Jahr 1970), `> 4000000000` fängt die **Gegenrichtung** — rohe
  Millisekunden, die ungeteilt in einer Sekundenspalte landen.
* ⚠️ **Neun Spalten sind Zahlen, die zehnte ist Text.** `devices.last_updated_at` ist die einzige
  Spalte mit Typwechsel (`integer` ms → `text YYYY-MM-DD`); für sie ist die Grenzprobe eine
  **Formatprobe**. Sie sagt nichts über die **Zone**.
* **Abweichung bedeutet:** genau der Faktor-1000-Fehler; der Mapper hat je Feld eine eigene Zeile,
  also ist die Fehlerstelle benannt.
* **Folge:** ⛔ **blockiert den Abbau.**

> Z — zehn Zeilen, jede einzeln eintragen (nicht „alles 0"):
> loans.returned_at ____ · loans.borrowed_at ____ · loans.created_at ____ ·
> loans.updated_at ____ · devices.created_at ____ · devices.updated_at ____ ·
> software_versions.created_at ____ · users.last_seen_at ____ ·
> device_events.changed_at ____ · devices.last_updated_at (Formatprobe) ____

### Abfrage 8 — `dev-user` in den Audit-Spalten (= A9, beantwortet ⬜ **U7**)

Nur nötig, falls nicht schon vor dem Import protokolliert (§V, Abfrage A9).

```bash
sqlite3 -readonly radio-admin-snapshot.sqlite "select sub from users;"
sqlite3 -readonly radio-admin-snapshot.sqlite "select distinct created_by from devices;"
```

* **Abweichung bedeutet:** ein `dev-user` unter den Audit-Spalten heißt, `AUTH_DEV_BYPASS` war
  irgendwann aktiv, und die Zuordnung von Journalzeilen zu Personen ist an diesen Stellen keine.
* **Folge:** **nur Protokoll** — aber nach dem gelöschten Volume ist die Frage **nicht mehr
  stellbar**. Deshalb steht sie hier und nicht „irgendwann". ⛔ **Letzte Gelegenheit ist §5.5
  Posten 5** (Volume-Löschung), danach nie wieder.

> ⬜ U7 beantwortet: ☐ kein `dev-user` gefunden ☐ `dev-user` gefunden in: ____________________

### Gegenlesung dieses Abschnitts

⚠️ **Jede Zaehlung dieses Kapitels zaehlt ihre eigene Suchzeile mit** — der gesuchte Wortlaut steht
im `grep`-Befehl selbst und damit in der Datei. **Die Erwartungen unten sind deshalb gegenüber den
Plaenen vom 2026-08-18 berichtigt und am 2026-08-27 gegen die fertige Datei GEMESSEN.** Wer die
Planzahlen erwartet, meldet Defekte, wo keine sind. Ein Treffer **ueber** der genannten Zahl ist
dagegen der Fund, den der jeweilige Schritt sucht.

```bash
# (a) Z fuehrt genau zehn Glieder — gemessen, nicht behauptet:
sed -n '/^### Abfrage Z/,/^### /p' docs/runbooks/radio-cutover.md | grep -cE "^select '"
# Erwartung: 10

# (b) das Wort ueber der Liste nennt dieselbe Zahl:
rtk grep -c 'Alle ZEHN Zahlen' docs/runbooks/radio-cutover.md
# Erwartung: 2 — der Satz selbst und DIESE Zeile, die ihn sucht. ⚠️ Die Planzahl 1
#   zaehlte den Pruefsatz nicht mit; wer 1 erwartet, meldet einen Defekt, wo keiner ist.
#   ⛔ Ein DRITTER Treffer waere der Fund: eine zweite, abweichende Fassung des Satzes.

# (c) das Protokollformular fuehrt zehn Eintragefelder — §5.2-LOKAL gezaehlt, wie (a):
# ⚠️ Dieselbe Anfangszeile traegt auch die LEITFASSUNG in §C Schritt 5 (d). Ohne den
#   Abfrage-Z-Rahmen trifft der Bereich ZWEIMAL und die Zaehlung liest 20 — ein Defekt,
#   wo keiner ist.
sed -n '/^### Abfrage Z/,/^### /p' docs/runbooks/radio-cutover.md \
  | sed -n '/^> Z — zehn Zeilen/,/^$/p' | grep -o '____' | wc -l
# Erwartung: 10

# (d) KEIN Zielarm liest mehr mit -readonly gegen radio.db:
rtk grep -n 'sqlite3 -readonly.*radio\.db' docs/runbooks/radio-cutover.md
# Erwartung: GENAU EIN Treffer, und er steht im Gegenlese-Abschnitt von §L.3 — das
#   Zitat der verworfenen Form. ⛔ Jeder ZWEITE Treffer ist der Fund, den dieser
#   Schritt sucht. "Keine Ausgabe" waere die FALSCHE Erwartung.
```

---

## §5.3 — Die Zählungen vor dem Abbau: radio-inventar (der Postgres, bevor er stirbt)

Grundlage: Spec 2 §5.2.3 (`…2026-08-18-radio-cutover-design.md:4437-4567`).

⚠️ **Arbeitsverzeichnis:** jeder Befehl unten läuft aus dem Verzeichnis, das die zwei
Alt-Checkouts enthält — **nicht** aus dem Suite-Repo. Im Entwicklungsstand liegen `radio-admin/`
und `radio-inventar/` **neben** `iuk-suite/`; wo sie auf dem Server liegen, ist ⬜ **N10**. Aus dem
falschen Verzeichnis gefahren antwortet jeder Befehl `no configuration file provided` — das ist
laut, aber es ist der Fehler, der am Abbautag die meiste Zeit kostet.
> Arbeitsverzeichnis auf dem Server: ____________________

⛔ **NT8 regiert JEDEN SQLite-Arm dieses Kapitels — und §5.3 führt keinen.** Die Regel im ganzen:
**§5.2s Zielarme** lesen `radio.db` **ohne `-readonly`** (§L.3, Zeile „Fenster"); **§5.4s
Quellarme** behalten `-readonly` gegen die Snapshot-Kopie, **solange §L.1 am Freeze-Abend `delete`
gemessen hat** — ⚠️ **bei `wal` fallen auch sie**, und dann fahren die zwei `.tables`/
`integrity_check`-Zeilen in §5.4 ebenfalls ohne `-readonly` (§L.1, Zweig `wal`). **Dieser
Abschnitt zählt gegen Postgres und hat deshalb keinen Arm, auf den NT8 zeigen könnte** — an seine
Stelle treten drei gleichwertige stille Fallen, und sie stehen unten ausgeschrieben: das
**Arbeitsverzeichnis** (⬜ N10), die **zwei Vorbelegungen** statt der echten Zugangswerte (⬜ E3),
und die **doppelten Anführungszeichen** um die Prisma-Bezeichner.

⚠️ **Zwei Zugangswerte sind Vorbelegungen, keine Tatsachen** — beide **vor** dem ersten Befehl
ablesen und ins Protokoll schreiben (⬜ **E3**). `POSTGRES_USER` trägt nur `${POSTGRES_USER:-radio}`
(`radio-inventar/docker-compose.yml:7`), der Volumename bekommt das Projektpräfix
(`postgres_data`, `:12`). Hart gesetzt ist nur `POSTGRES_DB: radio_inventar` (`:10`).

```bash
docker compose -f radio-inventar/docker-compose.yml exec -T postgres printenv POSTGRES_USER
docker volume ls | grep -i postgres_data
```

> Echter POSTGRES_USER: ____________ · echter Volumename: ____________________

⚠️ **Die Anführungszeichen sind tragend.** Prisma legt die Tabellen in gemischter
Groß-/Kleinschreibung an; Postgres braucht dafür doppelte Anführungszeichen im SQL. Deshalb steht
das SQL in **einfachen** Anführungszeichen — ein `-c "…"` mit doppelten außen zerstört die
inneren, und die Abfrage scheitert an einer nicht existierenden Relation `adminuser`.

```bash
PG="docker compose -f radio-inventar/docker-compose.yml exec -T postgres \
    psql -U <echter POSTGRES_USER> -d radio_inventar -c"
```

### P1 — welche Tabellen existieren wirklich? ⛔

```bash
$PG 'select tablename from pg_tables where schemaname = '"'"'public'"'"' order by 1;'
```

* **Erwartung (abgeleitet, nicht gezählt):** `AdminUser`, `_prisma_migrations`, evtl. `session`.
  ⚠️ Der Tabellenbestand war bisher aus fünf Migrationsdateien plus einer handgepflegten
  `create-session-table.sql` **abgeleitet**; **aus einem Repository lässt sich der
  Prod-Tabellenbestand grundsätzlich nicht ableiten** (Spec 1 §2.10 Nr. 3).
* **Abweichung bedeutet:** liefert `pg_tables` **mehr**, liegt dort Bestand, den niemand
  eingeplant hat. Jede zusätzliche Tabelle ist per `select count(*)` zu zählen.
* **Folge:** ⛔ **blockiert den Abbau**, bis jede zusätzliche Tabelle gezählt **und die Abbauliste
  (§5.5) um sie erweitert** ist.

> P1 — Tabellenliste wörtlich: ____________________________________________

### P2 — liegt noch Bestand? `Loan` und `Device` ⛔

```bash
$PG 'select to_regclass('"'"'public."Loan"'"'"') as loan,
            to_regclass('"'"'public."Device"'"'"') as device;'
$PG 'select count(*) from "_prisma_migrations" where finished_at is not null;'
```

* **Erwartung:** `NULL, NULL` und **5** abgeschlossene Migrationen.
* **Abweichung bedeutet:** ein **Nicht-NULL** heißt, die Drop-Migrationen sind in Prod nie
  gelaufen — dann liegt im Kiosk-Postgres Geräte- und Leihbestand, den Kapitel 1 nicht kennt, und
  der Import braucht einen zweiten Zweig. Eine Zahl **unter 5** heißt, Prod hängt hinter dem
  eingefrorenen Stand `f883ec4`; dann ist jede `datei:zeile`-Aussage über den Kiosk unsicher.
* **Folge:** ⛔ **blockiert den Abbau, hart.** Bei Nicht-NULL wird kein Volume angefasst, sondern
  Kapitel 1 wieder aufgemacht. Das ist der Fall, in dem der Abbau am Standby-Ende **abgesagt** und
  nicht verschoben wird.

> P2 — loan: ______ · device: ______ · abgeschlossene Migrationen: ______

### P3 — `AdminUser`: wandert nicht, wird aber gezählt ⛔

```bash
$PG 'select count(*) from "AdminUser";'
$PG 'select username, "createdAt", "updatedAt" from "AdminUser";'
```

* Die Zeile „`AdminUser` wandert **nicht**" ist eine **Entscheidung, keine Messung**; diese Zählung
  dokumentiert, **was verworfen wird**. Der Beleg für die Entscheidung ist
  `radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`: im
  Pocket-ID-Betrieb baut der OIDC-Weg die Kennung synthetisch als `pocketid:${sub}` und schreibt
  gar nicht in die Tabelle. Die Suite führt den **rohen** `sub`.
* **Erwartung:** `0`.
* **Abweichung bedeutet:** ein Ergebnis **> 0** heißt, es gab lokale Passwort-Identitäten, und ihr
  Verlust ist **vor** dem Löschen des Volumes zur Kenntnis zu nehmen — nicht danach zu entdecken.
  `updatedAt > createdAt` beantwortet ohne Konfigurationszugriff, ob die Zugangsdaten je geändert
  wurden, also ob der Nutzer in Benutzung war.
* **Folge:** ⛔ **blockiert den Abbau**, bis die betroffene Person namentlich benannt und
  benachrichtigt ist. Die **Entscheidung** kippt dadurch nicht — der Port streicht den lokalen
  Passwort-Login ersatzlos —, aber sie wird dann **angekündigt statt bemerkt**.

> P3 — `count(*)`: ______ · Personen benannt und benachrichtigt: ____________________

### P4 — existiert `session` überhaupt, und liegen dort Zeilen? ⛔

```bash
$PG 'select count(*) from "session";'
$PG 'select count(*) from "session" where expire > now();'
$PG 'select sess from "session" where expire > now() limit 5;'
```

* **Erwartung:** die Tabelle existiert **nicht** (Fehler `relation "session" does not exist`) —
  `prisma/create-session-table.sql` wird von nichts ausgeführt (Spec 1 §2.10 Nr. 3).
* **Abweichung bedeutet:** existiert sie doch, zeigt `sess`, ob dort `provider: 'local'` oder
  `'pocketid'` steht. Ein `'local'` mit **lebenden** Sitzungen heißt: jemand arbeitet **heute** mit
  einem Passwort-Login, den der Port ersatzlos streicht.
* **Folge:** ⛔ **blockiert den Abbau** — und es ist eine Ankündigung an eine namentlich bekannte
  Person, kein technischer Posten.

> P4 — Tabelle existiert: ☐ nein ☐ ja · Zeilen gesamt: ______ · lebende: ______ ·
> `provider` der lebenden: ____________

### P5 — Zeilenzahlen aller Tabellen, fürs Protokoll (**nur Protokoll**, keine Sperre)

⚠️ **`n_live_tup` ist ein Schätzwert des Statistik-Sammlers** — er veraltet ohne `ANALYZE`- bzw.
Autovacuum-Lauf und steht nach einem Postgres-Neustart auf `0`. Genau diese Zeile ist die
**letzte Aufnahme eines Bestands, der in §5.5 fällt** und dessen einzige Sicherung der `pg_dump`
aus P6 ist. Eine Schätzung ist dafür der falsche Datentyp — und P1 verlangt für jede unerwartet
gefundene Tabelle ausdrücklich ein exaktes `select count(*)`. **Dasselbe Idiom hier:**

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
  `pg_stat_user_tables`-Zeile läuft mit, trägt im Protokoll das Wort **Schätzwert**, und
  Abweichungen zwischen ihr und den Zählungen sind **kein** Befund.

> P5 — exakte Zählungen je Tabelle: ____________________________________________
> P5 — `pg_stat_user_tables` (**Schätzwert**): ____________________________________

### P6 — der Archiv-Dump. **Erst danach darf das Volume fallen.** ⛔

```bash
docker compose -f radio-inventar/docker-compose.yml exec -T postgres \
  pg_dump -U <echter POSTGRES_USER> -d radio_inventar --format=custom \
  > radio-inventar-final-$(date +%Y%m%dT%H%M%S).dump
```

⚠️ Der Kiosk-Postgres fiel aus jeder Sicherung, die dieses Repo kennt, **automatisch heraus**:
`scripts/backup.sh` kennt nur `"$DATA_DIR"/*.db` (`:25-27`) und `BLOB_DIR` (`:19-21`). **Dieser
`pg_dump` ist die einzige Sicherung, die dieses Volume je hatte** (Spec 1 §9.5.3). Er ist in
**§C Schritt 3** schon einmal gelaufen; **hier läuft er erneut**, falls der Standby-Stack
zwischenzeitlich gestartet wurde — beides ins Protokoll, mit Zeitstempel.

* **Folge:** ⛔ **blockiert den Abbau des Volumes** (Abbauliste Posten 3). **P6 ist eine
  Abbau-Sperre, nicht eine Protokollzeile** — es ist der einzige Block dieses Abschnitts, dessen
  Ausbleiben den Bestand ersatzlos vernichtet.

> P6 — Dump aus §C Schritt 3: ____________________ (Zeitstempel ______)
> P6 — Dump vor dem Abbau: ____________________ (Zeitstempel ______)
> Stack war im Standby gestartet? ☐ nein ☐ ja, am ____________ (dann §5.7 lesen)

### Gegenlesung dieses Abschnitts

```bash
rtk grep -cE '^### P[1-6] ' docs/runbooks/radio-cutover.md      # Erwartung: 6
rtk grep -E '^### P[1-6] ' docs/runbooks/radio-cutover.md | grep -c '⛔'   # Erwartung: 5
rtk grep -E '^### P5 ' docs/runbooks/radio-cutover.md | grep -c '⛔'       # Erwartung: 0
rtk grep -c 'Arbeitsverzeichnis auf dem Server' docs/runbooks/radio-cutover.md
# Erwartung: 5 — die Protokollzeile oben, DIESE Suchzeile, die ZWEI Protokollzeilen im
# Kopf von §C (Suite-Checkout und Alt-Checkouts) und die Zeile ⬜ N10 im Schlussabschnitt.
# ⚠️ ZWEIMAL berichtigt und beide Male GEMESSEN: die Planzahl 1 stammt aus der Zeit vor
# dem Schlussabschnitt; die 3 stammt aus der Zeit vor den zwei §C-Zeilen (eingefuegt am
# 2026-08-27). Wer 1 oder 3 erwartet, meldet Defekte, wo keiner ist.
# ⛔ Hinweis fuer den Fall, dass die Zahl kleiner wird: dann fehlt eine der zwei Zeilen
#    im Kopf von §C — und §C Schritt 2 legt den Schnappschuss wieder in ein unbenanntes
#    Verzeichnis.
```

---

## §5.4 — Die Archivprobe: beide Archivdateien werden geöffnet ⛔

Grundlage: Spec 2 §5.2.4 (`…2026-08-18-radio-cutover-design.md:4569-4601`).

⚠️ **Der Schritt, den Spec 1 nicht führt.** Spec 1 §9.4.1 verlangt die Snapshot-Kopie, §9.4.2 Nr. 6
den `pg_dump` — **kein Schritt öffnet je eine der beiden Dateien.** Ohne diesen Block ruht die
einzige unumkehrbare Handlung dieses Cutovers auf zwei Dateien, die niemand gelesen hat. Der
Präzedenzfall steht im Haus: `files-cutover.md:368` — „Ein Backup-Tarball wurde **geöffnet** und
enthielt `files.db` **und** Blobs."

⚠️ **Beide Zeilen unter (a) tragen `-readonly` — und das ist an §L.1 gebunden, nicht gesetzt.**
Hat §L.1 am Freeze-Abend `wal` gemessen statt `delete`, verliert **auch der Quellarm** sein
`-readonly` (NT8, §L.3), und diese zwei Zeilen werden ohne gefahren. **Vierzehn Tage später ist
die Messung nicht wiederholbar — sie steht im Fenster-Protokoll und wird von dort abgeschrieben.**

```bash
# (a) Die SQLite-Snapshot-Kopie: Tabellen vorhanden, Zahlen gleich der Freeze-Aufnahme.
sqlite3 -readonly radio-admin-snapshot.sqlite '.tables'
#   MUSS alle SECHS fuehren: devices, device_events, software_versions,
#   users, loans, api_tokens. Fehlt eine, ist die Kopie vorbaselinig —
#   dasselbe Bild wie radio-admin/data/data.sqlite im Repo, und die Kopie
#   ist wertlos.
sqlite3 -readonly radio-admin-snapshot.sqlite 'pragma integrity_check;'
#   MUSS 'ok' liefern.

# (b) Der Postgres-Dump: lesbar und nicht leer. pg_restore liegt im Alt-Image.
docker run --rm -v "$PWD":/a postgres:16-alpine \
  pg_restore --list /a/radio-inventar-final-<stamp>.dump | head -30
#   Das Image ist radio-inventar/docker-compose.yml:4 entnommen.
#   Erwartet: eine Objektliste mit "AdminUser" und "_prisma_migrations".
#   Ein leerer oder abgebrochener Kopf heisst: der Dump ist unbrauchbar,
#   und er ist die EINZIGE Sicherung dieses Volumes.
```

* **Folge:** ⛔ **beide blockieren den Abbau.** Die Zahlen aus (a) gehören **neben die
  Freeze-Aufnahme** ins Protokoll (§C Schritt 2); ein Unterschied heißt, in das Volume wurde nach
  dem Freeze geschrieben — **dann war der Freeze keiner**, und der ganze Import steht auf einer
  Quelle, die sich unter ihm bewegt hat.

> (a) `.tables` — sechs gefunden? ☐ ja ☐ nein, fehlt: ____________
> (a) `integrity_check`: ____________
> (a) Zeilenzahlen gegen die Freeze-Aufnahme aus §C Schritt 2: gleich? ☐ ja ☐ nein
> (b) `pg_restore --list` — Objektliste mit `AdminUser`? ☐ ja ☐ nein

⚠️ **Und die Archivdateien liegen nicht auf demselben Server wie die Suite** (Spec 1 §9.5.1).
**Ein Archiv auf dem Rechner, dessen Ausfall es abdecken soll, ist kein Archiv.**

Das ist ⬜ **N8** und keine Formalie: solange der Ablageort nicht als Wert dasteht, ist „im Archiv"
eine Absichtserklärung. Drei Angaben, alle drei:

> Zielsystem (nicht der Suite-Server): ____________________
> Zugriffsweg (wie kommt man in zwei Jahren an die Datei?): ____________________
> Verantwortlich: ____________________  · abgelegt am: ____________

⛔ **Solange eine der drei Zeilen leer ist, fällt kein Volume** — die zwei Dateien sind der Rest,
der die Volumes überlebt (Abbauliste Posten 11).

### Gegenlesung dieses Abschnitts

```bash
rtk grep -c 'beide blockieren den Abbau' docs/runbooks/radio-cutover.md      # Erwartung: 2
rtk grep -c 'devices, device_events, software_versions' docs/runbooks/radio-cutover.md
# Erwartung: 2   (je der Satz und die Suchzeile)
sed -n '/^> Zielsystem (nicht der Suite-Server)/,/^$/p' docs/runbooks/radio-cutover.md \
  | grep -c '____'
# Erwartung: 3
```

---

## §5.5 — Die Abbauliste

Grundlage: Spec 2 §5.3 und §5.3.1 (`…2026-08-18-radio-cutover-design.md:4605-4651`).

Jede Zeile einzeln abhaken, und **keine, bevor ihre Bedingung grün protokolliert ist.**

> ⛔ **Kein Häkchen in dieser Liste, solange ein Block aus §5.2, §5.3 oder §5.4 offen oder rot
> ist.** Die Abbau-Sperren sind: **A, T, R, Z** (§5.2) · **P1, P2, P3, P4, P6** (§5.3) · **beide
> Archivproben** (§5.4).
> **P5 ist Protokoll, keine Sperre** — und **P6 ist Sperre, kein Protokoll**: er ist die einzige
> Sicherung, die das Postgres-Volume je hatte.

⛔ **UND DIESE LISTE IST NACHWEISLICH UNVOLLSTÄNDIG, SOLANGE ⬜ U4/C.5 OFFEN IST.** Der
Auslieferungsweg des `radio-inventar`-Frontends ist unbekannt; **kein Befehl beantwortet ihn**, und
**nach dem Abbau ist er nur noch durch Ausprobieren zu klären** — das Ausprobieren heißt dann „was
ist kaputtgegangen?". Jede gefundene Komponente wird eine **eigene Zeile in der Tabelle unten**,
mit derselben Standby-Frist wie Posten 2. **Solange Posten 14 leer ist, ist „abgebaut" die Aussage
„die Teile abgebaut, die im Repo standen"** — und die eine Komponente, die den Host bedient hat,
läuft weiter. Die Einzelheiten stehen unter der Tabelle, „Die benannte Lücke".

| # | Posten | Frist | Bedingung |
|---|---|---|---|
| 1 | **Traefik-Anbindung radio-inventar** (der Router auf `radio.iuk-ue.de`) | **sofort** beim Umschwenk | Muss weg, sonst halten **zwei** Router denselben Host. Das ist kein Abbau-, sondern ein **Cutover**-Schritt (§C Schritt 9 Nr. 1) und steht hier nur der Vollständigkeit halber |
| 2 | **Container `radio-inventar-backend`** (Image `ghcr.io/rubenvitt/radio-inventar/radio-inventar-backend`, `radio-inventar/docker-compose.yml:28`) | Standby **14 Tage** | Gestoppt, Image behalten. Er ist bis Stunde 1 der Rückweg für `radio.iuk-ue.de` |
| 3 | **Container `radio-inventar-db` + Volume `postgres_data`** (⚠️ **deklarierter** Name, `:12`; der echte trägt das Projektpräfix, ⬜ E3) | Standby **14 Tage** | Gestoppt, Volume erhalten — das Backend hängt per `depends_on: condition: service_healthy` (`:42-44`) daran, ein Rollback ohne ihn startet nicht. Abbau **erst nach P6** und **erst**, wenn P1–P5 protokolliert sind |
| 4 | **Container `app` des radio-admin-Stacks** (Image `radio-admin:local`, `radio-admin/docker-compose.yml:4`) | Standby **14 Tage** | Gestoppt. ⚠️ **Nicht starten** — §5.7 |
| 5 | **Volume `radio-data` von radio-admin** (⚠️ **deklarierter** Name, `radio-admin/docker-compose.yml:14`, `:17`; der echte trägt das Projektpräfix, ⬜ E2) | Standby **14 Tage** | Einzige Quelle für Re-Import und feldweise Nachprüfung. Abbau erst, wenn **A, T, R, Z** und die Archivprobe (a) grün sind. ⛔ **Letzte Gelegenheit für ⬜ U7** (Abfrage 8) |
| 6 | **Images** `radio-admin:local` und `…/radio-inventar-backend` | Standby **14 Tage** | Ohne Image ist der Rollback kein Handgriff, sondern ein Build. ⚠️ Das gilt auch gegen einen Neubau zur Retention-Neutralisierung — siehe §5.7 und ⬜ **N7** |
| 7 | **Alte `.env`-Dateien beider Stacks** | **mit** dem Volume, nicht davor | §5.6 — der Posten, der liegen bleibt |
| 8 | **DNS `radio.iuk-ue.de`** | **bleibt**, unverändert | Zeigt vor und nach dem Cutover auf denselben Edge; nichts zu tun. **Genau das ist der Grund, warum es kein Parallelfenster gibt** |
| 9 | **DNS `radio-admin.iuk-ue.de`** | **bleibt**, solange der Redirect steht | **Kein** Abbau-Posten — er ist die Abhängigkeit des Redirects. Ende in §5.8 |
| 10 | **Redirect-Router `radio-admin-alt` + `SUITE_REDIRECT_RULE_RADIO_ADMIN`** | nach der Bedingung aus §5.8 | Vier zusammenhängende Wochen ohne Treffer auf `radio-admin.iuk-ue.de` im Traefik-Zugriffsprotokoll. ⚠️ **Ob es ein solches Protokoll gibt, ist ⬜ N9** |
| 11 | **Snapshot-Kopie + Postgres-Dump** | **Archiv, dauerhaft** | Nicht auf demselben Server wie die Suite (⬜ **N8**, drei Zeilen in §5.4). Sie sind der Rest, der die Volumes überlebt |
| 12 | **Repos `radio-admin` und `radio-inventar`** | **archivieren, nicht löschen** | GitHub-Archivierung (read-only) mit den Freeze-SHAs **`265abd5`** bzw. **`f883ec4`** im Archivierungshinweis. Sie sind die Belegquelle **jeder** `datei:zeile` aus Spec 1 und Spec 2; **ein gelöschtes Repo macht beide Specs unnachprüfbar** |
| 13 | **Zwei OIDC-Client-Registrierungen in Pocket ID** | Betreiberentscheidung (⬜ **U6**) | §5.6 |
| 14 | ⬜ **`radio-inventar`-Frontend-Auslieferung** | ⚠️ **unbekannt — solange ⬜ U4/C.5 offen ist, ist DIESE LISTE UNVOLLSTÄNDIG** | Kein Befehl beantwortet den Posten. Nach dem Abbau ist er nur noch durch Ausprobieren zu klären. Siehe „Die benannte Lücke" unten |

### Die Handgriffe, ausgeschrieben

⛔ **Diese Sitzung läuft frühestens vierzehn Tage nach dem Umschwenk — „in einer Sitzung, in der
niemand mehr den Kontext dieses Abends hat" — und sie löscht UNWIDERRUFLICH.** Die Tabelle oben
sagt *was* und *wann*; hier steht *wie*. **Kein Befehl wird beschrieben, jeder steht da.**

⚠️ **Arbeitsverzeichnis: die Alt-Checkouts** (⬜ **N10**, dieselbe Protokollzeile wie §5.3). Aus dem
falschen Verzeichnis antwortet jeder `-f`-Befehl `no configuration file provided`.

⛔ **Vor JEDEM `docker volume rm`: den ECHTEN Namen ablesen.** Die Tabelle oben führt die
**deklarierten** Namen (`postgres_data`, `radio-data`); die echten tragen das Projektpräfix
(⬜ **E2**, ⬜ **E3**) — beide Alt-Repos deklarieren ihre Volumes **ohne** `name:`
(`radio-admin/docker-compose.yml:16-17`, `radio-inventar/docker-compose.yml:61-62`), anders als die
Suite (`compose.yaml:252-254`). **Ein `docker volume rm postgres_data` löscht im besten Fall nichts
und meldet `no such volume`; im schlechteren löscht es ein gleichnamiges Volume eines anderen
Projekts.**

```bash
# ── Posten 2 + 4: die zwei Container endgueltig entfernen (Standby ist abgelaufen) ──
docker compose -f radio-inventar/docker-compose.yml --profile full-app rm -f backend
docker compose -f radio-admin/docker-compose.yml rm -f app
# ⚠️ `--profile full-app` gehoert MIT — ohne das Profil kann der Befehl ein No-op sein,
#    und ein No-op sieht wie ein Erfolg aus (RK-A3, dieselbe Falle wie in §C Schritt 1).

# ── Posten 3: erst der Postgres-Stack, dann sein Volume ──
#    ⛔ NUR wenn P1-P6 protokolliert und P6 (der Dump) GRUEN ist — §5.3.
docker volume ls | grep -i postgres_data          # → der ECHTE Name, ⬜ E3, ins Protokoll
docker compose -f radio-inventar/docker-compose.yml --profile full-app down
docker volume rm <der echte Name aus der Zeile oben>

# ── Posten 5: das radio-admin-Volume ──
#    ⛔ NUR wenn A, T, R, Z und Archivprobe (a) gruen sind — und dies ist die LETZTE
#    Gelegenheit fuer ⬜ U7 (Abfrage 8, §5.2). Danach nie wieder.
docker volume ls | grep -i radio-data             # → der ECHTE Name, ⬜ E2, ins Protokoll
docker compose -f radio-admin/docker-compose.yml down
docker volume rm <der echte Name aus der Zeile oben>

# ── Posten 6: die zwei Images ──
docker image ls | grep -iE 'radio-admin|radio-inventar'    # die echten Tags, ins Protokoll
docker image rm radio-admin:local
docker image rm <der Tag aus der Zeile oben fuer radio-inventar-backend>

# ── Rueckelesung: nichts davon darf danach noch da sein ──
docker ps -a   | grep -iE 'radio-admin|radio-inventar'     # Erwartung: keine Ausgabe
docker volume ls | grep -iE 'radio-data|postgres_data'     # Erwartung: keine Ausgabe
docker image ls  | grep -iE 'radio-admin|radio-inventar'   # Erwartung: keine Ausgabe
```

**Posten 10 — der Redirect-Router** (erst nach der Bedingung aus §5.8, im **Suite**-Checkout):

```bash
# 1) die Label-Gruppe `radio-admin-alt` aus compose.yaml entfernen (§0.1, dieselben sechs Zeilen)
# 2) SUITE_REDIRECT_RULE_RADIO_ADMIN aus der Server-.env entfernen
# 3) ausrollen — ⛔ ueber scripts/deploy.sh, nicht von Hand: es vergleicht die
#    Server-compose.yaml BYTEWEISE mit der des Repos (compose.yaml:42-48).
docker compose config | grep -c radio-admin-alt    # Erwartung NACH dem Rollout: 0
```

**Posten 12 — die zwei Repos archivieren, nicht löschen.** Der Eigentümer wird **abgelesen**, nicht
geraten:

```bash
git -C <Alt-Checkout>/radio-admin    remote get-url origin    # → <owner>/radio-admin
git -C <Alt-Checkout>/radio-inventar remote get-url origin    # → <owner>/radio-inventar
gh repo archive <owner>/radio-admin    --yes
gh repo archive <owner>/radio-inventar --yes
# Und die Freeze-SHAs in den Archivierungshinweis:
#   radio-admin = 265abd5 · radio-inventar = f883ec4
gh repo view <owner>/radio-admin    --json isArchived   # Erwartung: {"isArchived":true}
gh repo view <owner>/radio-inventar --json isArchived   # Erwartung: {"isArchived":true}
```

⚠️ **Posten 7 (die alten `.env`-Dateien) und Posten 13 (die zwei OIDC-Registrierungen) haben hier
bewusst keinen Befehl:** Posten 7 fällt **mit** dem Volume und steht in §5.6; Posten 13 ist eine
Bedienhandlung in Pocket ID und hängt an ⬜ **U6**. **Posten 1, 8, 9, 11 und 14 sind keine
Löschhandlungen** — 1 ist ein Cutover-Schritt (§C Schritt 9), 8 und 9 bleiben, 11 ist das Archiv
(⬜ N8), und 14 ist die Leerzeile, die ⬜ U4 offenlässt.

### Die benannte Lücke: wer liefert das radio-inventar-Frontend aus? (⬜ U4 / C.5)

**Diese Liste ist nachweislich unvollständig, und das steht als Lücke da, nicht als Vermutung.**

Gemessen an `f883ec4`: `radio-inventar/docker-compose.yml` führt **zwei** Services, `postgres`
(`:3`) und `backend` (`:26`, hinter `profiles: ["full-app"]`, `:27`). **Es gibt keinen
Frontend-Service.** Die Datei sagt es in ihrer ersten Zeile selbst:
`# docker-compose.yml (Development + Full-App Profile)` (`:1`). Zweiter Beleg derselben Klasse:
`API_TOKEN` ist Pflichtwert mit mindestens 32 Zeichen und **ohne Default**
(`radio-inventar/apps/backend/src/config/env.config.ts:11`), kommt im Env-Block des
`backend`-Service (`:33-39`) aber **nicht vor**. Dritter: `POSTGRES_PASSWORD:
${POSTGRES_PASSWORD:-secret}` (`:9`) mit dem Kommentar „WICHTIG: In Production
POSTGRES_PASSWORD setzen!" (`:8`).

**Schlussfolgerung, belegt:** die eingecheckte Compose-Datei ist **nicht der Produktionsweg**.
Daraus folgt, was hier fehlt — ⬜ **U4**, ⬜ **U4a** und ⬜ **U4b**. Jede gefundene Komponente wird
eine **eigene Zeile in der Tabelle oben**, mit derselben Standby-Frist wie Posten 2: **sie ist Teil
des Rückwegs.**

⚠️ **Der Abbau ist nicht abgeschlossen, solange diese drei Auskünfte fehlen.** **Die Auskunft ist
vor dem Cutover einzuholen, nicht danach**, weil ⬜ U4 zusätzlich den **Freeze** blockiert (§C
Schritt 1) und der Rückweg (§G 3c/3d) ohne sie nichts zurückzustellen hat.

> Gefundene Komponenten (je eine neue Zeile in der Tabelle oben): ____________________
> ⬜ U4 beantwortet am ____________ durch ____________________

### Gegenlesung dieses Abschnitts

```bash
# (a) genau vierzehn Posten, jeder mit einer Bedingung (vier Spalten, kein leeres Feld):
sed -n '/^| # | Posten | Frist | Bedingung |/,/^$/p' docs/runbooks/radio-cutover.md \
  | grep -cE '^\| [0-9]+ \|'
# Erwartung: 14
sed -n '/^| # | Posten | Frist | Bedingung |/,/^$/p' docs/runbooks/radio-cutover.md \
  | grep -cE '^\| [0-9]+ \|[^|]*\|[^|]*\| *\|'
# Erwartung: 0   (kein Posten ohne Bedingung)

# (b) der Sperrenkasten nennt P6 und nennt P5 NICHT als Sperre:
sed -n '/Die Abbau-Sperren sind/,/^$/p' docs/runbooks/radio-cutover.md | grep -c 'P6'
# Erwartung: 3
sed -n '/Die Abbau-Sperren sind/,/^$/p' docs/runbooks/radio-cutover.md \
  | grep -c 'P5 ist Protokoll, keine Sperre'
# Erwartung: 2
# ⚠️ Beide Zahlen sind berichtigt: die Anfangsmarke des `sed`-Bereichs steht DREIMAL in
#   der Datei — einmal im Sperrenkasten und zweimal in DIESEN Suchzeilen —, die Bereiche
#   werden also aneinandergehaengt. Massgeblich ist, dass der Dump-Block im Kasten steht
#   und P5 dort ausdruecklich NICHT als Sperre gefuehrt wird; die Zahlen sind gemessen.

# (c) jede Sperre des Kastens hat einen Block, der sie fuehrt:
for s in 'Abfrage A' 'Abfrage T' 'Abfrage R' 'Abfrage Z' 'P1' 'P2' 'P3' 'P4' 'P6'; do
  printf '%s: ' "$s"; grep -c "^### $s" docs/runbooks/radio-cutover.md
done
# Erwartung: jede Zeile endet auf 1

# (d) die loeschenden Posten tragen einen ausgeschriebenen Handgriff — nicht nur eine Frist:
sed -n '/^### Die Handgriffe, ausgeschrieben/,/^### Die benannte /p' \
      docs/runbooks/radio-cutover.md | grep -cE '^docker (volume rm|image rm|compose)'
# Erwartung: 9   (2x `rm -f`, 2x `down`, 2x `volume rm`, 2x `image rm`, 1x `config` in
#   Posten 10). ⚠️ Die Rueckelesungszeilen zaehlen NICHT mit: sie beginnen mit
#   `docker ps -a` bzw. `docker volume ls` / `docker image ls`.
sed -n '/^### Die Handgriffe, ausgeschrieben/,/^### Die benannte /p' \
      docs/runbooks/radio-cutover.md | grep -c 'gh repo archive'
# Erwartung: 2   (Posten 12, je Repo eine Zeile)
```

---

## §5.6 — Die Geheimnisse: der Posten, der liegen bleibt

Grundlage: Spec 2 §5.4 (`…2026-08-18-radio-cutover-design.md:4655-4698`).

⚠️ **Hier gilt Spec 1 §9.5.2, nicht die Analyse.** `docs/radio-portierung-analyse.md:839-843`
schreibt, die übernommenen Geheimnisse lebten nach dem Cutover „doppelt auf demselben Server".
Für `radio` trifft das **nicht** zu, weil **nichts** wertgleich übernommen wird: es gibt genau
**einen** neuen Wert, `RADIO_AUSLEIH_SITZUNG_SECRET`, **frisch erzeugt** und ⚠️ **nicht gleich
`AUTH_SECRET`**. Radio invertiert damit das `lagerbuch`-Muster, wo `HELFER_SESSION_SECRET`
wertgleich aus der produktiven `stack.env` übernommen wurde, damit laufende Sitzungen den Cutover
überleben (`lagerbuch-cutover.md:413`).

**Der Befund wird dadurch nicht schwächer, sondern stärker:** die alten Werte bleiben **gültig**
in Dateien, die niemand mehr pflegt und die kein Repo kennt. **Ein verwaister, aber
funktionierender Vollzugriffs-Token braucht kein Duplikat, um gefährlich zu sein.** Deshalb steht
das Löschen als **Zeile**, nicht als Absicht.

| Datei / Ort | Werte |
|---|---|
| radio-admin `.env` | `SESSION_SECRET` · `OIDC_CLIENT_ID` · `OIDC_CLIENT_SECRET` · `OIDC_ISSUER` · `OIDC_REDIRECT_URI` · `OIDC_ADMIN_GROUP` · `OIDC_UPDATER_GROUP` · `LOAN_API_EXPECTED_AUDIENCE` · `LOAN_API_EXPECTED_SUBJECT` · `AUTH_DEV_BYPASS` / `DEV_USER_*` |
| radio-inventar Produktionsumgebung | `API_TOKEN` (der geteilte Kiosk-Token) · `SESSION_SECRET` · `POSTGRES_PASSWORD` · `POCKET_ID_CLIENT_SECRET` und die drei übrigen `POCKET_ID_*` |

Nachgeschlagen an `f883ec4`: `env.config.ts:11` führt `API_TOKEN` als **Pflichtwert ohne Default**
mit `min(32)`, `:12-15` die vier `POCKET_ID_*` als `optional().default('')`, und
`SESSION_SECRET` kommt aus `radio-inventar/docker-compose.yml:37` mit der Vorbelegung
`change-me-in-production`.

- [ ] radio-admin `.env` gelöscht, **mit** dem Volume (Abbauliste Posten 7) — am ____________
- [ ] ⚠️ **`API_TOKEN` — eigene Zeile.** Er ist Pflichtwert (`env.config.ts:11`), steht aber
      **nicht** in der eingecheckten Compose-Datei. Der Handgriff lautet **„finden, wo Produktion
      ihn setzt — dann dort löschen"**, nicht „aus der Compose-Datei entfernen" (⬜ **U4a**).
      Solange er irgendwo lebt, lebt ein Vollzugriff auf den alten Bestand.
      Fundort: ____________________ · gelöscht am ____________
- [ ] `SESSION_SECRET` gelöscht — ⚠️ und geprüft, ob Produktion je die Vorbelegung
      `change-me-in-production` benutzt hat (`radio-inventar/docker-compose.yml:37`).
      Vorbelegung benutzt? ☐ ja ☐ nein
- [ ] `POSTGRES_PASSWORD` gelöscht — ⚠️ und geprüft, ob Produktion je die Vorbelegung `secret`
      benutzt hat (`:9`). Wenn ja, ist es kein Geheimnis, sondern war nie eines; **die Zeile
      bleibt trotzdem**. Vorbelegung benutzt? ☐ ja ☐ nein
- [ ] ⚠️ **Die zwei OIDC-Client-Registrierungen in Pocket ID** (Abbauliste Posten 13, ⬜ **U6**).
      radio-admin ist ein eigener Client (`radio-admin/server/src/auth/auth-service.ts:26-48`),
      radio-inventar ein zweiter. Beide tragen lebende Secrets und `redirect_uri`s auf Hosts, die
      verschwinden. Ob sie gelöscht oder aufbewahrt werden, entscheidet der Betreiber — **die
      Zeile muss existieren**, sonst bleiben zwei gültige Clients mit toten Rückadressen stehen.
      Entscheidung: ☐ gelöscht ☐ aufbewahrt, begründet: ____________________

⚠️ **Reihenfolge:** die `.env`-Dateien fallen **mit** dem Volume, nicht davor. Solange ein
Standby-Rückweg existiert (bis Stunde 1) bzw. ein Re-Import denkbar ist (14 Tage), braucht der
Stack seine Konfiguration. **Eine früh gelöschte `.env` macht den Rückweg zu einem Ratespiel.**

### Gegenlesung dieses Abschnitts

```bash
sed -n '/^## §5.6 /,/^## §5.7 /p' docs/runbooks/radio-cutover.md | grep -c '^- \[ \]'
# Erwartung: 5
sed -n '/^## §5.6 /,/^## §5.7 /p' docs/runbooks/radio-cutover.md | grep -c 'U4a'  # 2
sed -n '/^## §5.6 /,/^## §5.7 /p' docs/runbooks/radio-cutover.md | grep -c 'U6'   # 2
# (je die Haekchenzeile und diese Suchzeile — der Pruefsatz liegt selbst in §5.6)
rtk grep -c 'fallen \*\*mit\*\* dem Volume, nicht davor' docs/runbooks/radio-cutover.md  # 1
```

---

## §5.7 — Der alte Purge ist **kein Cron** — und deshalb lautet die Zeile anders

Grundlage: Spec 2 §5.5 (`…2026-08-18-radio-cutover-design.md:4702-4729`).

Bei `files` war „**den alten Cleanup-Cron abschalten**" ein eigener Abbau-Punkt, weil er sonst
„ins Leere oder, schlimmer, in ein wiederverwendetes Verzeichnis" löscht
(`files-cutover.md:309-310`). Der Punkt gilt hier auch — **aber nicht in dieser Form**, und ihn
falsch zu übernehmen sucht etwas, was es nicht gibt.

**Gemessen an `radio-admin@265abd5`: es gibt keinen externen Cron.** Der Purge fährt **im
Anwendungsprozess** mit: `server/src/index.ts:35` ruft `startRetentionSchedule(db)` aus
`startServer()`, `services/retentionService.ts:47` purgt **sofort** (`purge()`), erst `:48` setzt
den Tagestimer (`setInterval(purge, DAY_MS)`). Der Cutoff hängt an der **Wanduhr**
(`getRetentionCutoffMs(referenceMs = Date.now())`, `:17-21`).

**Es gibt also nichts abzuschalten — es gibt etwas nicht zu starten.**

### ⚠️ `HISTORY_RETENTION_MONTHS` ist **keine** Umgebungsvariable (⬜ **N7**)

§A Nr. 3 und die Rollback-Bedingung in §G 3a lauten: „`HISTORY_RETENTION_MONTHS` in der
Standby-Umgebung **neutralisieren** **oder** das Volume kopieren." **Der erste Zweig ist so nicht
ausführbar.**

**Gemessen an `radio-admin@265abd5`:**

* `server/src/services/retentionService.ts:9` — `export const HISTORY_RETENTION_MONTHS = 2;`
* `git grep -n RETENTION 265abd5` liefert **genau zwei** Treffer, beide in derselben Datei
  (`:9`, `:19`). Weder `.env.example` noch `docker-compose.yml` führen den Namen.

**Folge, ausgeschrieben:** „neutralisieren" hieße den Quelltext ändern und `radio-admin:local`
**neu bauen** (`radio-admin/docker-compose.yml:3-4`: `build: .`, `image: radio-admin:local`) — und
das kollidiert mit **Abbauliste Posten 6** („Image behalten"): der Neubau ersetzt genau das
Image-Tag, an dem der Rollback hängt.

**Damit bleiben zwei ausführbare Wege, und beide stehen hier:**

1. **Das Volume kopieren** (der Zweig aus §A Nr. 3, der ohne Codeänderung auskommt), **oder**
2. **den Stack nicht starten** — die Vorgabe dieses Abschnitts.

⬜ **N7 ist abzulesen, bevor ein Rollback erwogen wird:** ob das produktiv laufende Image von
genau diesem Stand gebaut wurde, oder ob die Produktion eine abweichende Bauform fährt, in der die
Zahl konfigurierbar ist.

> ⬜ N7 beantwortet am ____________ durch ____________________ ·
> Ergebnis: ☐ nicht konfigurierbar (nur Weg 1 oder 2) ☐ konfigurierbar über: ____________

- [ ] Der radio-admin-Stack wird im Standby **nicht gestartet.** Muss er doch (Rollback,
      Oberflächenvergleich), gilt **vorher** als nachgewiesen erfüllt: **das Volume ist kopiert**
      (§A Nr. 3) — die Env-Neutralisierung ist **kein** verfügbarer Zweig, siehe ⬜ **N7**.
      Nachgewiesen am ____________ durch ____________________
- [ ] Jede feldweise Nachprüfung läuft per `sqlite3` gegen die **Snapshot-Kopie**, nie gegen einen
      gebooteten Alt-Stack (Spec 1 §9.3.4 Zeile 2)

**Die Beweiszeile für „nie gestartet" — sie steht im Container, nicht im Log:**

```bash
# --- 1) Den Containernamen ABLESEN, nicht raten. `radio-admin/docker-compose.yml`
#        setzt fuer den Service `app` KEIN `container_name` (:2-14) — der echte Name
#        traegt das Projektpraefix, dieselbe Klasse Falle wie bei E2/E3 und $VOL_SUITE.
#        Arbeitsverzeichnis: ⬜ N10, wie in §5.3.
docker compose -f radio-admin/docker-compose.yml ps -a --format '{{.Name}} {{.State}}'
C_RADIO_ADMIN=<die Zeile aus dem Befehl oben>       # ins Protokoll

# --- 2) Der Nachweis selbst:
docker inspect "$C_RADIO_ADMIN" \
  --format '{{.State.Status}} | StartedAt={{.State.StartedAt}} | FinishedAt={{.State.FinishedAt}}'
```

**Gemessen** (Docker auf dem Entwicklungsrechner, 2026-08-18): ein **gestoppter** Container
liefert beide Zeitstempel in RFC3339-UTC, z. B.
`exited | StartedAt=2026-08-14T11:38:56Z | FinishedAt=2026-08-14T12:50:59Z`.

* **Erwartung:** `StartedAt` liegt **vor** `<freeze_iso>`. Dann gab es seit dem Freeze keinen
  Start, und die Historie in der Quelle ist die, die am Freeze da war.
* **Abweichung bedeutet:** `StartedAt` **nach** `<freeze_iso>` ist der positive Nachweis eines
  Starts im Standby — und damit eines Purges gegen die **Wanduhr dieses Starts**.
* ⚠️ **Grenze der Zeile, benannt:** `StartedAt` trägt nur den **letzten** Start. Zwei Starts sehen
  aus wie einer, und ein **entfernter** Container antwortet gar nicht (`No such object`). Sie
  beweist „es gab einen Start", nicht „es gab genau einen".

> `StartedAt`: ____________________ · `<freeze_iso>`: ____________ ·
> Start im Standby? ☐ nein ☐ ja, am ____________ — dann P6 erneut (§5.3) und R erneut (§5.2)

*Kein Gate:* ein Start ist ein **erfolgreicher** Start. `retentionService.ts:40-41` schreibt
`[retention] purged N expired loan(s)` **nur, wenn `deleted > 0`** — kein Fehler, kein roter
Test, kein Healthcheck, und bei einem Purge ohne Treffer **keine Zeile**. **Wer den Stack in
Woche zwei hochfährt, um gegen die Historie zu prüfen, verliert zwei weitere Wochen genau dieser
Historie.**

### Für radio-inventar bleibt die Frage offen: ⬜ **U4b**

Host-Cron, systemd-Timer, Backup-Job. Aus dem eingefrorenen Repo ist das **nicht ableitbar** — die
eingecheckte Compose-Datei ist nicht der Produktionsweg (§5.5, Die benannte Lücke), und ein
Host-Cron erscheint darin ohnehin nie.

**Hier wird nichts erfunden**: ein behaupteter Cron, den es nicht gibt, macht aus einem
Abbau-Schritt eine Suche ohne Ende; ein verschwiegener, den es gibt, schreibt nach dem Abbau in
ein wiederverwendetes Verzeichnis.

> ⬜ U4b beantwortet am ____________ durch ____________________
> ☐ kein Host-Cron / Timer / Backup-Job  ☐ gefunden: ____________________ → eigene Zeile in §5.5

### Gegenlesung dieses Abschnitts

```bash
rtk grep -c 'export const HISTORY_RETENTION_MONTHS = 2' docs/runbooks/radio-cutover.md   # 2
rtk grep -c 'image: radio-admin:local' docs/runbooks/radio-cutover.md                    # 2
# (je der Beleg im Text und diese Suchzeile)

# die Env-Neutralisierung wird NICHT mehr als Zweig angeboten:
sed -n '/^## §5.7 /,/^## §5.8 /p' docs/runbooks/radio-cutover.md \
  | grep -c 'HISTORY_RETENTION_MONTHS in der Standby-Umgebung neutralisier'
# Erwartung: 1 — allein DIESE Suchzeile. ⛔ Ein ZWEITER Treffer heisst, die
#   Env-Neutralisierung wird wieder als Zweig ANGEBOTEN. Erlaubt ist nur der ZITIERTE
#   Wortlaut von §A Nr. 3 in Anfuehrungszeichen, mit dem Zusatz "Der erste Zweig ist so
#   nicht ausfuehrbar" — und der traegt die Zeichenkette bewusst NICHT wortgleich.
#   ⚠️ Die Planzahl 0 zaehlte den Pruefsatz nicht mit, der selbst in §5.7 liegt.

# die Beweiszeile ist da und das Log ist als Nicht-Detektor benannt:
rtk grep -c 'State.StartedAt' docs/runbooks/radio-cutover.md
# Erwartung: 3 — die Befehlszeile oben, der Erfuellungspunkt 31 in §H, und diese Suchzeile.
# ⚠️ Die Planzahl 1 stammt aus der Zeit vor §H; sie wuerde zwei Defekte melden, wo keiner ist.
rtk grep -c 'nur, wenn `deleted > 0`' docs/runbooks/radio-cutover.md
# Erwartung: 3 — dieselben drei Stellen, dieselbe Berichtigung.
```

---

## §5.8 — Der Redirect und sein Ende: die einzige Frist mit Bedingung statt Datum

Grundlage: Spec 2 §5.6 (`…2026-08-18-radio-cutover-design.md:4733-4759`).

Der Redirect vom Alt-Verwaltungshost (`radio-admin.iuk-ue.de` → **302** auf
`radio.iuk-ue.de/admin`, pfaderhaltend) hat **kein Ablaufdatum, sondern eine Bedingung**:

* Er steht **mindestens** bis zum Ende des Standby-Fensters (§5.1).
* Er fällt, sobald im Traefik-Zugriffsprotokoll über **vier zusammenhängende Wochen** kein Treffer
  mehr auf `radio-admin.iuk-ue.de` erscheint. **Ohne benannte Bedingung lebt ein Redirect für
  immer**, und mit ihm ein DNS-Eintrag, den niemand mehr erklären kann.

⚠️ **Die Bedingung setzt ein Zugriffsprotokoll voraus, und dass es eines gibt, ist nicht belegt
(⬜ N9).** Traefik schreibt ein Access-Log nur bei gesetzter `accessLog`-Konfiguration; im Repo gibt
es keinen Traefik-Dienst — der Router hängt an Labels eines Proxys, der außerhalb dieses
Repositoriums läuft (⬜ **E7** nennt seinen Container). **Gibt es kein Protokoll, oder wird es kürzer
als vier Wochen vorgehalten, ist diese Bedingung nie erfüllbar** — und der Redirect lebt genau so
lange weiter, wie die Bedingung ihn verhindern sollte.
⛔ **Dann wird die Ersatzbedingung vom Betreiber entschieden und hier eingetragen — nicht
erfunden.**

> ⬜ N9 — Zugriffsprotokoll vorhanden? ☐ ja, Quelle: ____________________ ☐ nein
> Aufbewahrungsdauer: ____________ (muss ≥ 4 Wochen sein)
> Ersatzbedingung (nur falls „nein"), vom Betreiber entschieden am ____________:
> ____________________

**Der Abbau ist drei Zeilen, in dieser Reihenfolge** — der DNS-Eintrag fällt **zuletzt**, weil er
die Abhängigkeit des Redirects ist:

- [ ] 1. Die sechs `radio-admin-alt`-Labels **im Repo** aus `compose.yaml` entfernen, committen,
      und über den regulären Deploy-Pfad ausrollen.
      ⚠️ **Nicht von Hand auf dem Server editieren:** `scripts/deploy.sh` vergleicht
      `compose.yaml` **byteweise** mit der Serverdatei und bricht bei Abweichung ab (begründet in
      `compose.yaml:42-48`). Eine handgeänderte Serverdatei bricht den **nächsten** Rollout, und
      zwar mit einer Meldung, die von `radio` nichts mehr weiß.
      Entfernt und ausgerollt am ____________ · Commit: ____________
- [ ] 2. `SUITE_REDIRECT_RULE_RADIO_ADMIN` aus der `.env` auf dem Server entfernen — am ______
- [ ] 3. DNS-Eintrag `radio-admin.iuk-ue.de` löschen — am ____________

**Gegenprobe nach Schritt 1 und 2**, ins Protokoll:

```bash
docker compose config | grep -A2 radio-admin-alt
# Erwartung nach dem Abbau: KEINE Ausgabe.
```

> Vier-Wochen-Fenster ohne Treffer: von ____________ bis ____________ ·
> Protokollquelle (⬜ **N9**): ____________________ · Redirect abgebaut am ____________

---

## §5.9 — Was der Abbau ausdrücklich nicht anfasst

Grundlage: Spec 2 §5.7 (`…2026-08-18-radio-cutover-design.md:4763-4780`).

* ⚠️ **`radio.iuk-ue.de` bleibt in `SUITE_TRAEFIK_RULE`, und `SUITE_HOST_RADIO` bleibt gesetzt.**
  Das ist ab dem Umschwenk der produktive Zustand, kein Übergangsposten.
  **Und `radio-admin.iuk-ue.de` gehört zu keinem Zeitpunkt in `SUITE_TRAEFIK_RULE`** (§0.1):
  dort aufgenommen bekäme der Host nicht den Redirect, sondern den stillen **Portal-Fallback** —
  `const mod = moduleForHost(host) ?? getModule("portal")` (`src/core/routing.ts:79`), Kommentar
  zum Fehlfall in `src/core/hosts.ts:52-57`. Ein funktionierender Ausdruck mit falschem Inhalt,
  und **kein Test des Repos sieht Traefik-Labels an.**
* **`scripts/backup.sh` braucht keine Änderung.** Es sammelt `"$DATA_DIR"/*.db` per `nullglob`
  (`:25-27`) und sichert jede Datei per `sqlite3 .backup` (`:41-43`) — `radio.db` fällt
  **automatisch** hinein. Es gibt hier **keinen** Abbau-Handgriff, und das ist der Vorteil der
  Ein-Datei-je-Modul-Regel.
  ⚠️ Das sagt nichts darüber, mit **welcher** Umgebung der Host-Cron das Skript ruft
  (`DATA_DIR`, `BLOB_DIR`) — das ist ⬜ **N5** und die Abnahme im Fenster (§D Nr. 13), nicht dieser
  Abschnitt.
* **Der Monitor auf `/api/health/radio` bleibt** — er ist ab dem Umschwenk der produktive Posten.
  ⚠️ **Nie `/api/health`**: `src/app/api/health/route.ts` liefert konstant `{status:"ok"}` ohne
  Modul und ohne Datenbank und antwortet nach dem Cutover auf `radio.iuk-ue.de` weiter `ok`,
  **ohne etwas über radio zu sagen**.
  Die Feldbedeutung ist heute lesbar und keine Leerstelle: `module` trägt den Modulschlüssel und
  `status:"ok"` belegt den **Datenbankzugriff** (`openModuleDatabase(...)` plus
  `db.prepare("SELECT 1").get()`, `src/core/health/index.ts:4-15`), `revision` hängt
  `src/app/api/health/[modul]/route.ts:24` an. Offen ist allein der **Sollwert** von `revision`
  (⬜ **L5**) — und der steht in der Protokollzeile aus §A Nr. 1.
  Das Umstellen von Monitor und **Deployment-Dokumentation** (⬜ **U10** — `docs/deployment.md`
  existiert in diesem Repo **nicht**) gehört ins **Cutover-Fenster** (§D Nr. 15), nicht in den
  Abbau.
* **`SUITE_ADMIN_GROUP_RADIO` bleibt gesetzt und nicht leer.** Eine leere Liste gewährt
  **nichts**, und weil `radio` den `isModuleAdmin`-Kurzschluss modulintern ignoriert, fängt der
  Suite-Admin niemanden auf: die Folge ist ein **stummes 404 für jede Verwaltungsseite**. Das ist
  keine Abbau-Zeile, aber es ist die Zeile, die beim Aufräumen am ehesten versehentlich geleert
  wird.
* **Der Abräum-Service-Worker unter `/sw.js` bleibt.** Er gehört in den **ersten Deploy**, nicht
  in den Cutover (§E.1) — und er bleibt danach stehen: der Origin ist zeichengleich, und ein
  Gerät, das den Alt-Kiosk installiert hat und erst in sechs Monaten wieder aufgeschlagen wird,
  braucht ihn dann noch. **Er ist kein Abbau-Posten** und hat kein Ablaufdatum, das diese Spec
  setzen könnte.

### Gegenlesung von §5.8 und §5.9

```bash
# (a) die drei Redirect-Zeilen stehen in der richtigen Reihenfolge (Labels, .env, DNS):
sed -n '/^## §5.8 /,/^## §5.9 /p' docs/runbooks/radio-cutover.md | grep -n '^- \[ \] [123]\.'
# Erwartung: drei Zeilen, in dieser Reihenfolge: Labels — SUITE_REDIRECT_RULE — DNS

# (b) die Deploy-Pfad-Warnung steht am Label-Schritt:
rtk grep -c 'byteweise' docs/runbooks/radio-cutover.md
# Erwartung: 5 — drei Treffer VOR diesem Abschnitt (§0.1 und zwei weitere, gemessen am
#   2026-08-27), die Warnung am Label-Schritt oben, und diese Suchzeile.
# ⚠️ Die Planzahl 1 stammt aus der Zeit vor §0.1; wer sie erwartet, meldet vier Defekte,
#   wo keiner ist.

# (c) §5.9 fuehrt fuenf Punkte:
sed -n '/^## §5.9 /,/^## /p' docs/runbooks/radio-cutover.md | grep -c '^\* '
# Erwartung: 5
```

---

## §I — Der datierte Nachtrag in Spec 2: sieben Stellen und zwei Anhangszeilen

**Kein stilles Überschreiben.** Hausform: ein Widerspruch zwischen Plan und Bau bekommt einen
**datierten Nachtrag**, keine unbemerkte Korrektur
(`docs/superpowers/plans/2026-08-15-aufgaben-koordination-aus-gruppe.md:533-534`).

⚠️ **Dieser Abschnitt ändert `docs/superpowers/specs/2026-08-18-radio-cutover-design.md`, nicht
dieses Runbook.** Er steht hier, weil Spec 2 und dieses Runbook am Abbautag **nebeneinander
liegen** und an sieben Stellen **verschiedene Zahlen** führen. Wer nur die Spec liest, liest an
diesen sieben Stellen den Stand vor der Re-Kritik.

⚠️ **Namensfalle im Quellbericht:** `2026-08-19-re-kritik-radio-spec2.md` vergibt **RK-A1** zweimal
(Zeile 21 und 79) und **RK-A3** dreimal (Zeile 51, 177, 233). `SPERREN-radio-spec2.md:271-352` löst
das auf, indem es die vier **blockierenden** Funde als **RK-1 bis RK-4** neu durchnummeriert. Unten
steht die aufgelöste Nummerierung.

**Die vier blockierenden Funde und die Stelle, an der jeder nachgetragen wird:**

| Fund | Was er sagt | Nachtrag in Spec 2 | Im Runbook |
|---|---|---|---|
| **RK-1** (Bericht: erste „RK-A1") | Beide Prüfcontainer setzen `SUITE_HOST_RADIO=localhost` und fahren danach `curl -H 'Host: radio.iuk-ue.de'` — der Kopf trifft **kein Modul** und fällt auf das Portal zurück. **V2 und V6 sind grün, ohne geprüft worden zu sein** | §3.2.2, unter der `docker run`-Form (`:2571-2611`) | bereits eingebaut — §C Schritt 8 setzt die **Kommaliste** |
| **RK-2** (Bericht: RK-A2) | Der Rückweg-Nachtrag liest mit `-readonly` gegen den **Host**-Pfad unter `$DATA_DIR` (den es dort nicht gibt) — genau die Form, die §L.3 verbietet und verlangt einen `<umschwenk_epoch_sekunden>`, **den kein Schritt erzeugt** | §5.2.2 Abfrage A, Zielarm (`:4293-4299`) | bereits eingebaut — §G liest gegen `$VOL_SUITE`, §C Schritt 9 erzeugt beide Umschwenk-Marken |
| **RK-3** (Bericht: erste „RK-A3") | `--profile full-app` fehlt im Rückweg 3b. **Der Rollback läuft ohne Fehlermeldung durch und startet den Kiosk nicht** — die Domain bleibt tot, innerhalb der Ein-Stunden-Frist | Anhang **A-3** (`:4891`) | bereits eingebaut — §G 3b fährt **mit** Profil, zeichengleich zum Stopp aus §C Schritt 1 |
| **RK-4** (Bericht: zweite „RK-A1") | Erfüllungspunkt 9 klammert nur **12 von 13** Posten; Nr. 13 (die wörtlich protokollierte Router-Regel beider Hosts samt Rückstell-Befehl) fällt heraus, und **kein anderer Punkt fängt ihn auf** | Erfüllungspunkt **9** (`:4810`) | bereits eingebaut — §H Punkt 9 klammert **§A**, und §A führt **vierzehn** Punkte |

**Die sieben Stellen in Spec 2, jede mit einer eigenen datierten Nachtragszeile:**

| # | Stelle | Spec-Zeilen | Was nachgetragen wird | Klasse |
|---|---|---|---|---|
| 1 | §5.2.2 **Abfrage A**, Zielarm | `:4293-4299` | Ersetzt durch die `docker run`-Form gegen `$VOL_SUITE`, **einschließlich** der Gegenprobe `docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data`. Der Host-Pfad `$DATA_DIR/radio.db` existiert dort nicht (`compose.yaml:79`, `:99`, `:221-223`); die Nachbarblöcke R und Z verbieten die Form zwanzig Zeilen weiter — A war der eine von dreien, an dem sie stehen blieb | Widerspruch zum Runbook |
| 2 | §5.3 **Sperrenkasten** | `:4609-4610` | **P6 ergänzen**, **P5** ausdrücklich als Protokoll benennen. Der Kasten zählte „A, T, R, Z, P1–P4 und beide Archivproben" — wer ihn als abschließend liest, kann alle acht grün haben und das Volume löschen, während der **einzige Dump dieses Volumes** nicht gelaufen ist | Widerspruch zum Runbook |
| 3 | **Erfüllungspunkt 3** | `:4797-4798` | Die Env-Neutralisierung ist **kein verfügbarer Zweig** (⬜ N7). Verfügbar sind: Volume kopieren, oder nicht starten | Widerspruch zum Runbook |
| 4 | **Erfüllungspunkt 9** | `:4810` | „Nr. 1–12" → **„§4.2 Nr. 1–13"**, und Nr. 13 in der „insbesondere"-Aufzählung **namentlich** genannt, mit demselben ⛔ wie Punkt 10. ⚠️ **In der SPEC heißt es 1–13; in DIESEM Runbook §A Nr. 1–14** — §A führt einen Punkt mehr (Nr. 14, der ausgerollte `compose.yaml`-Stand, ⬜ N2), den Spec 2 §4.2 gar nicht kennt | Widerspruch zum Runbook (RK-4) |
| 5 | **Erfüllungspunkt 17** | `:4828-4829` | „alle drei" → **„Z: alle zehn Zeilen `0`"** (neun Zahlgrenzproben + die Formatprobe auf `devices.last_updated_at`). Die Spec sagt an §5.2.2 Zeile 4412 selbst schon „alle zehn" | Widerspruch zum Runbook |
| 6 | **⬜-Tabelle, Zeile `L5`** | `:185` | **Verkleinert** (Cutover-Leitplan **NS8**): `module`, `status` und `revision` sind heute aus dem Repo lesbar; **offen bleibt allein der WERT von `revision`**. Und der **Beleg wird berichtigt** — `src/core/health/index.ts:4-15` statt `src/app/api/health/[modul]/route.ts:11-18`, der in einen Kommentarblock zeigte. ⚠️ **Die Zeile bleibt**, sie wird nur eingekürzt | Rahmen-Nachzug |
| 7 | **§3.2.2**, unter der `docker run`-Form | `:2571-2611` | Der **DRITTE** Unterschied des Fenster-Prüfcontainers zu W5 (Cutover-Leitplan **NS11**): `SUITE_HOST_RADIO=localhost,radio.iuk-ue.de` — eine **Kommaliste mit zwei Werten**. `envHostsFor` splittet auf `,` (`src/core/hosts.ts:39-46`), `validateHostConfig` hat gegen beide nichts (`:65-99`). ⛔ **Berichtigt am 2026-08-27: die Kommaliste gehört in BEIDE Prüfcontainer, nicht nur in den des Fensters.** Die frühere Fassung dieser Zeile („die Generalprobe behält ihren einen Wert") war eine wörtlich übernommene, **veraltete** Planzeile (`plan5:1942`) und widersprach §P.8 dieses Runbooks, das `SUITE_HOST_RADIO=localhost,radio.iuk-ue.de` über vier Absätze **begründet** setzt. Verbindlich ist die Re-Kritik: „in **beiden** Prüfcontainern" (`plan3:2600-2601`, `:2696`, `2026-08-19-re-kritik-radio-spec2.md:35`). ⚠️ **Wer C41 mit der alten Fassung fährt, schreibt RK-1 in Spec §3.2.2 wieder fest** — in genau der Hälfte, die §I zu heilen antritt. Der Nachtrag steht **unter** der `docker run`-Zeile, nicht darin | Rahmen-Nachzug (RK-1) |

**Und die zwei Anhangszeilen** — sie sind **keine** der sieben, sondern kommen dazu:

| Anhang | Spec-Zeile | Was nachgetragen wird |
|---|---|---|
| **A-3** | `:4891` | ⚠️ **Die wichtigere der beiden, weil sie heute einen blockierenden Fund LEGITIMIERT.** A-3 erklärt es für „harmlos", dass der Rückweg `start postgres backend` **ohne** `--profile full-app` fährt. **Harmlos bleibt:** der Postgres hat keinen eigenen Schreiber, und `start` auf einen laufenden Postgres ist idempotent. **Nicht harmlos:** `backend` steht hinter `profiles: ["full-app"]` (`radio-inventar/docker-compose.yml:27` @ `f883ec4`), und derselbe Spec-Abschnitt begründet für den **Stopp**, warum das Profil in den Befehl gehört. **Das Argument ist richtungsunabhängig.** Verbindlich: der Stopp-Befehl ist die Vorlage des Start-Befehls, Wort für Wort, nur `stop` gegen `start` getauscht (RK-3) |
| **A-5** | `:4893` | **Komplementär, nicht doppelt.** Die Zeitstempelprobe der Generalprobe (`min/max(returned_at)`) und Abfrage Z bleiben **beide**; Z benennt zusätzlich, **welche** Spalte betroffen ist, und ist die Abbau-Sperre. *Nachtrag: die Nebenbemerkung „drei Spalten" war derselbe Zählfehler wie in Erfüllungspunkt 17 — es sind zehn. Die Entscheidung von A-5 ist davon unberührt.* |

⚠️ **Alle vier blockierenden Funde sind heute schreibbar — keiner wartet auf eine Ablesung.** Am
schärfsten für den Cutover-Abend sind **RK-1** (zwei Prüfsätze melden grün, ohne geprüft zu haben)
und **RK-3** (der Rückweg meldet Erfolg und lässt die Domain tot). **Beide sind stille Fehler,
keine roten.**

⛔ **STAND 2026-08-27: §I IST NICHT AUSGEFÜHRT. Spec 2 ist an allen sieben Stellen unverändert.**
Gemessen, nicht vermutet — die Gegenproben des Plans (`plan5:1946-1990`) laufen heute **alle rot**:

```bash
SPEC=docs/superpowers/specs/2026-08-18-radio-cutover-design.md
rtk grep -c 'P1, P2, P3, P4, P6'                   "$SPEC"   # heute 0, erwartet 1  (Stelle 2)
rtk grep -c '§4.2 Nr. 1–13'                        "$SPEC"   # heute 0, erwartet 1  (Stelle 4)
rtk grep -c 'Z: alle zehn Zeilen'                  "$SPEC"   # heute 0, erwartet 1  (Stelle 5)
rtk grep -c 'src/core/health/index.ts:4-15'        "$SPEC"   # heute 0, erwartet >=1 (Stelle 6)
rtk grep -c 'SUITE_HOST_RADIO=localhost,radio.iuk-ue.de' "$SPEC"  # heute 0, erwartet >=1 (Stelle 7)
rtk grep -c 'Nachtrag 2026-08'                     "$SPEC"   # heute 0 — keine einzige Nachtragszeile
```

⛔ **Die Folge ist konkret, nicht formal.** Am Abbautag liegen Spec 2 und dieses Runbook
nebeneinander. In Spec 2 steht die Bergungsabfrage aus **RK-2** noch **zweimal als ausführbarer
Zielarm** gegen `$DATA_DIR/radio.db` (`:4293-4299`), der Sperrenkasten führt **P6 nicht**
(`:4609-4610`), und Anhang **A-3** (`:4891`) erklärt den Rückweg ohne `--profile full-app` weiter
für „harmlos". Wer dort nachschlägt statt hier, kann **alle genannten Sperren grün** haben und das
Postgres-Volume löschen, **während sein einziger Dump nie gelaufen ist.**

⚠️ **Wer führt das aus, und bis wann:** die Person, die das Runbook fertigstellt — **vor der
Terminierung der Abbau-Sitzung**, spätestens mit dem Umschwenk. Es ist **keine ⬜**: kein Wert
fehlt, es ist eine unerledigte Schreibarbeit an einer anderen Datei (Aufgabe **C41**).
⛔ **Und Stelle 7 wird in ihrer BERICHTIGTEN Fassung geschrieben** (siehe die Zeile oben) — sonst
trägt C41 den blockierenden Fund RK-1 in die Spec zurück.

> §I ausgeführt am ____________ durch ____________________ · Commit: ____________

---

## §H — Wann dieser Cutover erfüllt ist

Nach dem Muster `docs/runbooks/files-cutover.md:360-370`. **Jeder Punkt mit Ausgabe, nicht mit
Erwartung** — eine abgehakte Zeile ohne protokollierte Zahl ist keine abgehakte Zeile. Die
kleinteiligen Prüflisten stehen in **G1–G6** (§P.13), **§A Nr. 1–14**, **§D Nr. 1–16** und
**§5.2–§5.4**; diese Liste ist die Klammer darüber. ⚠️ **Genannt sind hier die Marken DIESES
Runbooks, nicht die Kapitelnummern der Spec** — §A ist dort §4.2, §D ist dort §4.6.

⚠️ **Achtunddreißig Punkte, nicht siebenunddreißig.** Spec 2 führt 1–37. **Punkt 38 ist neu** und
sammelt die vier Leerstellen ein, die beim Schreiben des Abbau-Kapitels entstanden sind (N7–N10);
ohne ihn fielen sie durch das Raster von Punkt 37. **Vier Punkte weichen inhaltlich von Spec 2 ab**
— 3, 9, 17 und 29 —, und jeder trägt den Grund neben sich; nachgetragen wird das in **§I**.

**Vor der Generalprobe**

- [ ] 1. **Die drei Import-Tests sind grün** (§Z): Faktor 1000 mit je Feld verschiedenen
      Fixture-Werten · asymmetrische Idempotenz Fall A und B (Zusicherung = **Fehlschlag**) ·
      Spaltenposition gegen die echte Alt-DDL
- [ ] 2. **Die Quelltext-Zusicherung zur Cookie-Domain** und **R36** (§P.10 V8) sind grün
- [ ] 3. ⛔ **Der Standby-Stack kann keine Historie mehr löschen — und der Nachweis ist das
      KOPIERTE VOLUME**, **vor dem ERSTEN Generalproben-Snapshot**:
      nachgewiesen am ______ durch ____________
      ⚠️ **Berichtigt gegenüber Spec 2.** §A Nr. 3 bietet zwei Zweige an. **Der erste ist keine
      Env-Zeile** (§5.7, ⬜ **N7**): die Zahl ist eine Quelltextkonstante, „neutralisieren" hieße
      Quelltext ändern und das Image neu bauen — was §5.5 Posten 6 („Image behalten") bricht.
      **Verfügbar sind nur: Volume kopieren, oder nicht starten**
- [ ] 4. **⬜ L13 und ⬜ L14 abgelesen** — ohne sie ist §C Schritt 8 nicht ausführbar

**Generalprobe**

- [ ] 5. **G1–G6 vollständig grün** (§P.13). Es gibt keine teilweise grüne Generalprobe
- [ ] 6. **Der absichtliche Startabbruch wurde einmal gesehen** (§P.5)
- [ ] 7. **⬜ U8 gemessen:** Volumengröße und Dump-Dauer beider Stacks — sie bemessen das Fenster
- [ ] 8. **Der Prüfcontainer ist entfernt und `$GP` gelöscht** (§P.14)

**Vor dem Fenster**

- [ ] 9. **§A Nr. 1–14 vollständig**, insbesondere: `/api/health/radio` antwortet **200** (nicht
      503) · Abräum-Worker deployt · Cloudflare-Zonenregeln gelesen · `X-Forwarded-Host` am Server
      belegt · Weg A/B entschieden · ⛔ **Nr. 13: die heutige Router-Regel BEIDER Hosts wörtlich
      protokolliert, samt dem Handgriff, der sie zurückstellt** · **Nr. 14: der ausgerollte
      `compose.yaml`-Stand** (⬜ **N2**) — abgelesen **am Server**, nicht am Repo.
      ⚠️ **§A, nicht §4.2 — und vierzehn, nicht zwölf.** Dieses Runbook hat keinen Abschnitt
      „§4.2"; die Liste, um die es geht, steht hier als **§A**. Nr. 13 ist die Vorbedingung, ohne
      die §C Schritt 9 Nr. 1 **kein ausführbares Ziel** und §G 3c/3d **nichts zurückzustellen**
      hat — in beiden eingecheckten Alt-Compose-Dateien kommt `traefik` **nicht ein einziges Mal**
      vor. **Fehlt die Zeile, wird das Fenster nicht eröffnet.** Nr. 14 kommt in Spec 2 §4.2 gar
      nicht vor und ist eine Ablesung am Server, keine Zeile im Repo (Nachtrag: §I Stelle 4)
- [ ] 10. ⛔ **⬜ U4 / C.5 ist beantwortet** — sie blockiert den **Freeze**, nicht erst den Abbau
- [ ] 11. **⬜ E1–E8 ausgefüllt und im Protokoll**, `<E1>` exakt wie im `groups`-Claim
- [ ] 12. **Der Ausstellungsplan für die Zugangscodes steht** (§F), Zweig nach ⬜ C.3 gewählt,
      Person aus ⬜ E8 benannt

**Im Fenster**

- [ ] 13. **`<freeze_iso>` protokolliert** (§C Schritt 1) — er ist der Cutoff jeder
      Vergleichsrechnung
- [ ] 14. **Der Snapshot entstand mit `.backup`, nicht mit `cp`**, und **alle vier Glieder
      der Zählkette** schließen (§L.1)
- [ ] 15. **A1–A13 gelaufen** (§V), die **acht** blockierenden erfüllt, jede 🧹-Bereinigung
      **wiederholt und protokolliert**
- [ ] 16. **Fünf Paare gleich** (§C Schritt 5 a), **fünf** Feldstichproben zeilengenau (b), die
      Zeitstempel-Stichprobe aus `returned_at IS NOT NULL` (c)
- [ ] 17. **R und Z grün**, mit `<freeze_iso>` in **beiden** Armen:
      R Quelle ______ / Ziel ______ · **Z: alle zehn Zeilen `0`** — neun Zahlgrenzproben **plus**
      die Formatprobe auf `devices.last_updated_at`, jede einzeln eingetragen (§5.2).
      ⚠️ **Zehn, nicht drei.** Z ist die einzige Probe, die sagt, **welche** Spalte vom
      Faktor-1000-Fehler betroffen ist; wer drei Zahlen abhakt und sieben ungelesen lässt, gibt
      ein Volume frei, dessen Zeitstempelspalten zu sieben Zehnteln ungeprüft sind (Nachtrag:
      §I Stelle 5)
- [ ] 18. **`loans_device_active_uidx` existiert im Ziel** (§Z) und `zugangscode_id` ist überall
      NULL
- [ ] 19. **Schritt 9 war EIN Schritt:** Alt-Router zuerst weg, dann die drei ⏸-Zeilen, dann
      `up -d` — **und `<umschwenk_iso>` samt `<umschwenk_epoch_sekunden>` steht im Protokoll**
      (§5.1; ohne sie ist der Bergungsbefehl in §G unausführbar)

**Nach dem Umschwenk**

- [ ] 20. **§D Nr. 1–16 vollständig, mit Ausgabe** — insbesondere Nr. 1 (Body, nicht nur 200),
      Nr. 5 (**zwei** Ausgänge), Nr. 7 (alle drei `curl`), Nr. 10 (Login-Rückweg, Handarbeit, ⬜ E8)
- [ ] 21. **Der erste Zugangscode ist ausgestellt** — auf dem umgeschwenkten Host, durch ⬜ E8,
      **vor** der Freigabe an die Nutzer (§F). Der Restposten „Fläche ohne Code" ist protokolliert
- [ ] 22. **`RADIO_HISTORIE_PURGE=0` entfernt** — **erst nach** Punkt 17, und der zweite Log-Blick
      zeigt **keine** `radio:`-Zeile mehr (§D Nr. 14)
- [ ] 23. **Ein Telefon, das den Alt-Kiosk kannte, wurde einmal neu geladen** (§E.2)
- [ ] 24. **Das Backup ist einmal von Hand gelaufen** und `radio.db` liegt im Tarball (§D Nr. 13)
- [ ] 25. **Monitor und Deployment-Dokumentation zeigen auf `/api/health/radio`**, nie auf
      `/api/health` — ⚠️ der zweite Teil hängt an ⬜ **U10**: `docs/deployment.md` existiert in
      diesem Repo nicht. Gibt es keine solche Dokumentation, ist der Punkt mit **Monitor allein**
      erfüllt, und das steht im Protokoll zu §D Nr. 15
- [ ] 26. **Die Neuigkeitennotiz ist eingetragen**, `datum` = Rollout-Tag, `<N>` = der gesetzte
      Wert, ausgeschrieben (§F.3)

**Standby und Abbau**

- [ ] 27. **Standby-Ende als Datum und mit Namen** im Protokoll (§5.1): ______ / ____________ —
      und `<umschwenk_iso>` **samt** `<umschwenk_epoch_sekunden>` eingetragen
- [ ] 28. **A und T** protokolliert (§5.2); A mit **fünf** gleichen Paaren, T mit **höchstens
      einer** lebenden Zeile
- [ ] 29. **P1–P6 vollständig als Ausgabe**: `pg_tables` (jede unerwartete Tabelle gezählt) ·
      `Loan`/`Device` **NULL, NULL** und **5** Migrationen · `count(*) from "AdminUser"` = ______ ·
      `session` · `pg_stat_user_tables` (als **Schätzwert** beschriftet) · **P6-Dump existiert und
      wurde geöffnet**.
      ⚠️ **Sechs, nicht fünf** — und **P6 ist eine Sperre, keine Protokollzeile** (§5.3, §5.5;
      Nachtrag: §I Stelle 2)
- [ ] 30. **Beide Archivdateien wurden geöffnet** (§5.4): `.tables` zeigt alle **sechs**,
      `pragma integrity_check` = `ok`, `pg_restore --list` liefert eine Objektliste — und die
      Archivdateien liegen **nicht** auf dem Suite-Server (⬜ **N8**, drei Zeilen):
      ____________________
- [ ] 31. **Der radio-admin-Stack wurde im Standby nie gestartet** — belegt mit
      `docker inspect … {{.State.StartedAt}}` **vor** `<freeze_iso>` (§5.7), **nicht** mit einem
      leeren Log: die Purge-Zeile erscheint **nur, wenn `deleted > 0`**. ⚠️ Ist er doch gestartet
      worden, ist der Nachweis aus §5.7 protokolliert **und** die Env-Neutralisierung war **kein**
      verfügbarer Zweig (⬜ **N7**)
- [ ] 32. **Beide Alt-Stacks abgebaut** (§5.5 Posten 2–6), **Geheimnisse gelöscht** (§5.6) mit
      `API_TOKEN` und **Fundort** (⬜ U4a), **⬜ U6 entschieden und begründet**
- [ ] 33. **Beide Repos archiviert, nicht gelöscht**, mit `265abd5` und `f883ec4` im
      Archivierungshinweis (§5.5 Posten 12)
- [ ] 34. ⛔ **Punkt 10 bleibt offen, solange ⬜ U4 offen ist:** „abgebaut" heißt sonst nur „die
      Teile, die im Repo standen", und die Abbauliste in §5.5 ist nachweislich unvollständig
- [ ] 35. **Der Redirect ist abgebaut** (§5.8, Reihenfolge **Labels → `.env` → DNS zuletzt**, und
      Schritt 1 über den **Deploy-Pfad**) **oder seine Bedingung läuft nachweislich weiter**:
      Vier-Wochen-Fenster begonnen am ______, Protokollquelle (⬜ **N9**) ____________
- [ ] 36. **`radio-admin.iuk-ue.de` steht in `SUITE_TRAEFIK_RULE` nicht** — geprüft mit
      `docker compose config | grep -A2 radio-admin-alt`, Ausgabe im Protokoll
- [ ] 37. **Die ⬜-Liste ist abgearbeitet** — **jede** Zeile trägt eine Ablesung, und die
      Runbook-Stellen sind darauf nachgezogen. ⚠️ **Die Anzahl wird gezählt, nicht abgeschrieben.**
      **Gezählt am 2026-08-27 gegen den Schlussabschnitt dieses Runbooks: 36** (die Zeilen der
      Tabelle „Was dieses Runbook NICHT beantwortet"; die Spec-eigene ⬜-Tabelle zählt anders und
      ist nicht der Maßstab). Gezählt: ______ · davon abgelesen: ______
- [ ] 38. **Die vier N-Leerstellen des Abbau-Kapitels sind beantwortet:** ⬜ N7 (Retention
      konfigurierbar?) · ⬜ N8 (Archiv-Ablageort, drei Zeilen) · ⬜ N9 (Zugriffsprotokoll und seine
      Aufbewahrungsdauer) · ⬜ N10 (Arbeitsverzeichnis der Alt-Checkouts)

⚠️ **Die Punkte 10, 34 und 38 sind die einzigen dieser Liste, die kein Befehl beantwortet.** Alle
anderen haben eine Ausgabe. Diese sind **Auskünfte**, und sie sind **vor** dem Cutover einzuholen —
nach dem Abbau sind sie nur noch durch Ausprobieren zu beantworten, und das Ausprobieren heißt
dann: „was ist kaputtgegangen?"

### Gegenlesung von §H — sie zählt, statt zu behaupten

```bash
# (a) VOLLSTAENDIGKEIT: achtunddreissig Punkte, lueckenlos von 1 bis 38.
sed -n '/^## §H /,$p' docs/runbooks/radio-cutover.md \
  | grep -oE '^- \[ \] [0-9]+\.' | grep -oE '[0-9]+' | sort -n | tr '\n' ' '
# Erwartung: 1 2 3 … 38, jede Zahl GENAU EINMAL. Eine Luecke ist ein Stopp-Punkt.
sed -n '/^## §H /,$p' docs/runbooks/radio-cutover.md | grep -cE '^- \[ \] [0-9]+\.'
# Erwartung: 38
# Gegenzaehlung an der Spec (dort 37) — WORTLAUT-VERANKERT, nicht ueber Zeilennummern:
sed -n '/^# Erfüllungspunkte/,/^# Anhang A/p' \
      docs/superpowers/specs/2026-08-18-radio-cutover-design.md \
  | grep -cE '^- \[ \] [0-9]+\.'
# Erwartung: 37 — die Differenz ist Punkt 38 und im Kopf von §H begruendet.
# ⛔ NACHTRAG 2026-08-28: hier stand `sed -n '4784,4876p'`. C41 hat die Spec um 79 Zeilen
#   verlaengert; derselbe Befehl liest heute 3 statt 37 und erzeugt ein FALSCHES ROT an
#   der Pruefung, die die Vollstaendigkeit der Erfuellungsklammer sichert. Ein fester
#   Zeilenbereich in ein Dokument hinein haelt keinen Nachtrag aus — und dieses Runbook
#   selbst fuehrt im Kopf die Regel, ueber den Wortlaut zu ankern.
# ⚠️ Der Schlussabschnitt "Was dieses Runbook NICHT beantwortet" steht NACH §H und faellt
#   damit in den Bereich '/^## §H /,$p'. Er ist eine TABELLE und traegt bewusst KEINE
#   '- [ ] <Zahl>.'-Zeile — sonst zaehlte dieser Befehl mehr als 38.

# (b) die vier berichtigten Punkte stehen berichtigt da:
rtk grep -c '§A Nr. 1–14 voll'          docs/runbooks/radio-cutover.md   # Erwartung: 2
# (Punkt 9 und diese Suchzeile)
rtk grep -n '§4.2 Nr. 1–13 voll'        docs/runbooks/radio-cutover.md
# Erwartung: GENAU EIN Treffer — diese Suchzeile selbst. ⛔ Ein ZWEITER Treffer heisst,
#   Punkt 9 traegt noch die Spec-Numerierung; diese Fassung ist allein in der SPEC
#   richtig (§I Stelle 4). ⚠️ "Keine Ausgabe" waere die falsche Erwartung.
sed -n '/^## §H — Wann dieser Cutover erfüllt ist/,/^## /p' \
      docs/runbooks/radio-cutover.md \
  | grep -c 'Z: alle zehn Zeilen'                                        # Erwartung: 2
# (Punkt 17 und diese Suchzeile — beide liegen §H-lokal)
rtk grep -c 'P1–P6 voll'                docs/runbooks/radio-cutover.md   # Erwartung: 2
rtk grep -c 'Der Standby-Stack kann keine Historie mehr' docs/runbooks/radio-cutover.md
# Erwartung: 2   (je der Erfuellungspunkt und die Suchzeile)

# (c) und die vier FALSCHEN Fassungen kommen nirgends mehr vor:
rtk grep -n '§4.2 Nr. 1–12\|alle drei `0`\|(P1–P5)' docs/runbooks/radio-cutover.md
# Erwartung: GENAU EIN Treffer, und er ist namentlich bekannt — DIESE Suchzeile selbst,
#   die die drei verworfenen Fassungen zitiert, um sie zu verbieten. ⛔ Jeder ZWEITE
#   Treffer ist der Fund, den dieser Schritt sucht: eine der Fassungen als AUSSAGE.
#   ⚠️ "Keine Ausgabe" waere die falsche Erwartung und wuerde beim ersten Lauf als
#   Defekt gelesen — dieselbe Feststellung wie in §L.3.
rtk grep -n 'HISTORY_RETENTION_MONTHS neutralisiert oder Volume kopiert' docs/runbooks/radio-cutover.md
# Erwartung: ebenfalls GENAU EIN Treffer — diese Suchzeile. Jeder zweite ist ein Stopp-Punkt.
```

---

## Was dieses Runbook NICHT beantwortet

⛔ **Das ist die Seite, die vor dem Fenster gelesen wird.** Jede Zeile unten ist eine ⬜, die dieses
Runbook **benennt und nicht erfindet**. Wer das Fenster eröffnet, ohne die Spalte *wann* gelesen zu
haben, verschiebt Arbeit in die eine Stunde, in der es keine zweite Gelegenheit gibt.

**Sechsunddreißig Zeilen**, in vier Gruppen. Die Zahl ist **gezählt**, nicht geschätzt: sie ist die
Zeilenzahl dieser Tabellen, und Punkt 37 in §H liest sie von hier ab. ⚠️ **Am 2026-08-27 kam eine
Zeile hinzu** (⬜ **U10**, die Deployment-Dokumentation); es waren vorher fünfunddreißig.

**Gruppe 1 — Betreiberentscheidungen und Betreiberauskünfte. Kein Befehl beantwortet sie.**

| Marke | Was fehlt | Wer liest sie ab | Wann |
|---|---|---|---|
| ⛔ ⬜ **U4 / C.5** | Auf welchem Weg wird `radio.iuk-ue.de` heute ausgeliefert (Prozess, Container, statische Auslieferung, Reverse-Proxy-Eintrag)? | **Betreiber** — Begehung, kein `SELECT` | ⛔ **vor dem Fenster.** Blockiert Freeze (§C Schritt 1), Umschwenk (§C Schritt 9 Nr. 1), Rückweg (§G 3c/3d) und die **Vollständigkeit** der Abbauliste (§5.5). **Nach dem Abbau nur noch durch Ausprobieren** |
| ⬜ **E1** | Gruppenname für `SUITE_ADMIN_GROUP_RADIO`, exakt wie im `groups`-Claim | **Betreiber** | vor §B (Cut 26) — **nicht** vor der Generalprobe, die setzt frei erfundene Werte |
| ⬜ **E1b** | Gruppenname für `SUITE_UPDATER_GROUP_RADIO` (zweite Rechtestufe, C.6/B4) | **Betreiber** | vor §B (Cut 26) |
| ⬜ **E4 / C.2** | Gilt `RADIO_AUSLEIH_SITZUNG_STUNDEN=12`? Die Vorbelegung trägt, ist aber keine Bestätigung | **Betreiber** | vor §B (Cut 26) — und vor der Neuigkeitennotiz (§F.3), die den Wert nennt |
| ⬜ **E5 / C.3** | Sind gedruckte Aufsteller im Umlauf? Anzahl, Ort, wer sie ersetzen kann | **Betreiber** — Begehung | ⛔ **vor dem Fenster**, nicht am Abend: die Zweigwahl in §F ist sonst nicht treffbar |
| ⬜ **E6** | Wie viele Geräte tragen den Alt-Token im `localStorage`? | **Betreiber** — Begehung; bleibt eine **Schätzung** | vor dem Fenster — sie bemisst den Handgriff aus §E |
| ⬜ **E8** | Wer ist am Cutover-Abend namentlich anwesend und stellt den ersten Code aus? | **Betreiber** | bei der Terminplanung |
| ⬜ **U4a** | Wo setzt die Produktion `API_TOKEN`? Pflichtwert `min(32)` ohne Default, in der eingecheckten Compose-Datei nicht enthalten | **Betreiber** — gleiche Wurzel wie U4 | vor dem Fenster, einmal einholen; gebraucht in §5.6 |
| ⬜ **U4b** | Gibt es auf Host-Ebene einen Cron, systemd-Timer oder Backup-Job zu einem der Alt-Stacks? | **Betreiber am Server** — gleiche Wurzel wie U4 | vor dem Fenster; gebraucht in §5.7 |
| ⬜ **U6** | Werden die zwei OIDC-Client-Registrierungen in Pocket ID gelöscht oder aufbewahrt? | **Betreiber** | vor §5.5 (Posten 13) und §5.6 |
| ⬜ **U9** | Sind Repo- und Server-`compose.yaml` am 19.07. auseinandergelaufen? Im Repo nicht nachweisbar | **Betreiber** | ohne Frist — **blockiert nichts** |
| ⬜ **U10** | Wo liegt die **Deployment-Dokumentation**, die auf `/api/health/*` zeigt — Repo, Wiki, Server-README? Oder gibt es keine? ⛔ `docs/deployment.md` existiert in diesem Repo **nicht** (gemessen 2026-08-27) | **Betreiber** | vor §D Nr. 15 — **blockiert das Fenster nicht**. Ohne sie werden §D Nr. 15 und §H Punkt 25 entweder ohne Handlung abgehakt oder halten an |
| ⬜ **N8** | Wohin gehen die zwei Archivdateien? Zielsystem, Zugriffsweg, Person — und der Beleg, dass es **nicht** der Suite-Server ist | **Betreiber** | ⚠️ **vor §C Schritt 2/3** — dort entstehen die Dateien. Drei Zeilen in §5.4, ⛔ solange eine leer ist, fällt kein Volume |
| ⬜ **L13** | Loopback-Port des **Fenster**-Prüfcontainers. ⚠️ **Nur der Port** — der Containername steht in §C Schritt 8 fest (`radio-fenster`). §C Schritt 8 trägt seit dem 2026-08-27 die **Vorbelegung 4000** und ist damit auch ohne diese Zeile fahrbar; offen bleibt allein, **ob 4000 auf diesem Server frei ist** | **Betreiber am Server** | bei der Fensterplanung (§A Nr. 12): **Vorbelegung bestätigen oder ersetzen**. Ohne die Zeile fährt Schritt 8 gegen 4000 — und scheitert laut, falls der Port belegt ist |
| ⬜ **L14** | Darf der Fenster-Prüfcontainer **parallel** zum Schritt-7-Stack booten? | **Betreiber am Server** | ⚠️ **vor der Fensterplanung**, nicht am Abend — der Ausweichweg stoppt sechs andere Module |
| ⬜ **V-L11** | Die Verwaltungs-Ausleihenliste zeigt kein Filter-Bedienelement. Der gebaute Zustand wird **bestätigt**, nicht als Mangel protokolliert | **Betreiber**, bei der Abnahme | §D.1 — Häkchen „so lassen" oder „nachziehen" (eigener Posten, **nicht** dieses Fenster) |
| ⬜ **(ohne Marke, §V Handgriff 3)** | ⚠️ **Die einzige ⬜ dieses Runbooks, die ueberhaupt keine Marke traegt — auch an keiner anderen Stelle** — und deshalb mit keinem Marken-`grep` auffindbar (gegengelesen am 2026-08-27 mit der Umkehrsuche: jede weitere markenlose ⬜-Zeile der Datei benennt einen Posten, der anderswo eine Marke hat, oder ist ein Verweis auf die ⬜-Liste selbst): **welche Fläche der Alt-Oberfläche unter `radio.iuk-ue.de` die Vorabzahlen zeigt** (Gerätebestand, aktive Leihen, abgeschlossene Leihen). Sie ist die **einzige** Verteidigung gegen NT9 — eine Parität gegen einen veralteten Schnappschuss ist strukturell grün | **Betreiber** | ⛔ **unmittelbar VOR dem `.backup`, in derselben Sitzung** (§V Handgriff 3). Später gibt es keine laufende Alt-Anwendung mehr, gegen die man zählen könnte |

**Gruppe 2 — Ablesungen am Server. Ein Befehl beantwortet sie, aber nur auf dem Server.**

| Marke | Was fehlt | Wer liest sie ab | Wann |
|---|---|---|---|
| ⬜ **N2** | Ist die `compose.yaml` **mit** der `radio-admin-alt`-Labelgruppe auf dem Server ausgerollt? `docker compose config \| grep -A2 radio-admin-alt` | **Betreiber am Server** | ⛔ **vor §A** und damit vor dem Fenster. Ohne sie greift §C Schritt 9 Nr. 3 ins Leere |
| ⬜ **N3** | Tatsächliche numerische Kennung des laufenden Suite-Prozesses (`SUITE_USER` bzw. `docker inspect … {{.Config.User}}`) | **Betreiber am Server** | ⚠️ **vor der Generalprobe** schon. Die Image-Zahl ist auf einem Standardhost zwangsläufig falsch |
| ⬜ **N5** | Env des Host-Cron für `scripts/backup.sh` (`DATA_DIR`, `BLOB_DIR`) und der Ablageort des Tarballs | **Betreiber am Server** (Crontab/Timer-Unit) | vor §D Nr. 13 |
| ⬜ **N6** | Edge-Proxy: (a) setzt er `X-Forwarded-Host`, (b) welche Entrypoints gibt er weiter, (c) ist `radio-admin.iuk-ue.de` dort bekannt | **Betreiber am Server** | vor §A Nr. 8; sonst läuft §D Nr. 7 in einen Verbindungsfehler **statt rot zu werden** |
| ⬜ **N7** | Ist die Zwei-Monats-Frist im **produktiv laufenden** `radio-admin` überhaupt konfigurierbar? (Image-Herkunft) | **Betreiber am Server** | ⚠️ **vor dem Fenster** — §G 3a hängt daran, und §H Punkt 3 und 31 lesen sie ab |
| ⬜ **N9** | Gibt es ein Traefik-Zugriffsprotokoll, wo liegt es, wie lange wird es vorgehalten (≥ 4 Wochen)? | **Betreiber am Server** | vor §5.8. **Ohne Protokollquelle ist die Abbaubedingung nie erfüllbar** — dann entscheidet der Betreiber eine Ersatzbedingung |
| ⬜ **N10** | **Zwei** Verzeichnisse: **(a)** das **Suite-Checkout** (`docker compose`, der Importer, `scripts/deploy.sh` — und der Ablageort des Schnappschusses), **(b)** das **Arbeitsverzeichnis auf dem Server**, aus dem die `docker compose -f …`-Befehle beider Alt-Stacks laufen | **Betreiber am Server** | vor dem Fenster. Ohne (b) antworten §C Schritt 1, §G, §5.3 und §5.7 mit `no configuration file provided`; ohne (a) legt §C Schritt 2 den Schnappschuss dort ab, wo Schritt 4 ihn **nicht** findet |
| ⬜ **E2** | Echter Volume-Name von `radio-admin` (`docker volume ls \| grep -i radio-data`) | **Betreiber am Server** | vor der Generalprobe (§P.2) und **erneut** im Fenster (§C Schritt 2) |
| ⬜ **E3** | Echter Volume-Name **und** `POSTGRES_USER` von `radio-inventar` | **Betreiber am Server** | vor dem Fenster; §5.3 liest beide vor dem ersten Befehl erneut |
| ⬜ **E7** | Traefik-Containername | **Betreiber am Server** | vor dem Fenster — §D Nr. 8 und §5.8 haben sonst kein Ziel |

**Gruppe 3 — wird im Lauf selbst abgelesen. Nichts vorher zu besorgen, aber jede braucht ihre
Protokollzeile.**

| Marke | Was fehlt | Wer liest sie ab | Wann |
|---|---|---|---|
| ⬜ **L5** | **Sollwert** des `revision`-Feldes von `/api/health/radio` — der Commit-SHA des **ersten Deploys**; er entsteht erst mit ihm | **Betreiber**, aus der Protokollzeile des ersten Deploys | **§A Nr. 1**; §P.9 V3 und §D Nr. 3 schreiben ihn von dort ab, sie raten ihn nicht |
| ⬜ **L7** | Vollständiger `Location`-Kopf der `/admin`-Weiterleitung — **Statuscode** 307 oder 302, Protokoll, Host. Der Bau legt ihn ausdrücklich **nicht** fest (`_lib/zugang.ts:381-384`) | **wird in §P.9 V2 selbst abgelesen** | in der Generalprobe; §C Schritt 8 und §D Nr. 2 lesen ihn erneut |
| ⬜ **L11** | Was liefert `radio.iuk-ue.de/manifest.webmanifest`? Das Modul führt bewusst kein eigenes Manifest | **abnehmende Person**, per `curl` | §D — gegen den echten Deploy, nicht vorher |
| ⬜ **L12** | Der genaue Ablesepunkt in den Entwicklerwerkzeugen für Service Worker und Cache Storage nach dem Neuladen | **abnehmende Person**, im echten Browser | §E.2, am Cutover-Abend |
| ⬜ **U7** | Lief `radio-admin` in Prod je mit `AUTH_DEV_BYPASS`? Die Abfrage steht vollständig ausgeschrieben da (§V A9 = §5.2 Abfrage 8) | **wer die Abfrage fährt** | ⛔ **letzte Gelegenheit ist §5.5 Posten 5** (Volume-Löschung) — danach nie wieder |
| ⬜ **U8** | Volumengröße und Dump-Dauer beider Stacks — sie **bemessen das Fenster** | **Messung in der Generalprobe** (§P.12) | nicht am Abend. §A Nr. 7 liest sie von dort ab, und **nur** von dort |

**Gruppe 4 — entschieden, aber das Abnahmehäkchen fehlt.** Diese drei sind **keine offenen Fragen**;
sie stehen hier, damit die abnehmende Person sie als **Entscheidung** erkennt und nicht als Defekt
protokolliert (§D.1).

| Marke | Was fehlt | Wer liest sie ab | Wann |
|---|---|---|---|
| ⬜ **A-L13** | Ein Gerät ohne erfassten Zustand erscheint als „frei", nicht als „unbekannt" — Betreiberentscheidung vom 2026-08-22, der Preis ist benannt und angenommen | **abnehmende Person** | §D.1, nach dem Umschwenk |
| ⬜ **V-L5** | `/admin/import` verlangt die **Admin**-Stufe, nicht die Verwaltungs-Stufe — die Spec widersprach sich, der Bau wählt und macht die Wahl prüfbar | **abnehmende Person** | §D.1. Eine Umkehr ist eine **Rechteverschiebung**, kein Diff-Detail |
| ⬜ **V-L6** | Das Löschen eines Geräts wird abgelehnt, solange eine offene Leihe darauf liegt — eine **benannte Abweichung** vom Alt-Bestand, in der wiederherstellbaren Richtung | **abnehmende Person** | §D.1 |

### Die Rechnung, und was NICHT in ihr steht

**36 Zeilen.** Davon muss der **Betreiber 30 beantworten oder besorgen**: die **17** aus Gruppe 1
(Entscheidungen und Auskünfte), die **10** aus Gruppe 2 (Ablesungen, die nur am Server möglich
sind) und die **3** aus Gruppe 4 (Abnahmehäkchen). Die **6** aus Gruppe 3 liefert das Runbook sich
selbst — sie brauchen keine Vorabbesorgung, wohl aber ihre Protokollzeile.

⚠️ **Drei Dinge stehen bewusst NICHT in dieser Tabelle, und sie fehlen ihr trotzdem nicht:**

1. **⬜ N1, ⬜ N4, ⬜ L4, ⬜ L6, ⬜ L8, ⬜ L9, ⬜ L10** sind **eingelöst** — am 2026-08-27 aus dem
   fertigen Bau abgelesen, mit `datei:zeile` in §0 und §P.0. Sie tragen im Runbook ein ✅ und
   keine offene Zeile mehr.
2. **C.4** (Entleihername beim Ausleihen vorbelegt) und **C.7** (keine Offline-Erfassung) tragen
   **kein ⬜** — sie hängen an keinem Schritt dieses Runbooks. ⚠️ **Beide sind trotzdem nicht
   ausdrücklich bestätigt**: der Bau folgt der jeweiligen Empfehlung. Sie stehen in §D.1 unter der
   Tabelle, damit sie bei der Abnahme nicht als Fund auftauchen. **Wer „alle offenen Punkte" sagt,
   meint 36 + diese zwei.**
3. **Die `proxy.ts`-Vorbedingung P1-1 bis P1-5** (§A) ist **keine ⬜**, sondern eine **Messung, die
   nur einmal möglich ist**: sie muss laufen, **bevor PR #80 nach `main` gemerged wird** — die
   Suite ist **ein** Image für **alle** Module, der Merge rollt `radio` und den unausgerollten
   `proxy.ts`-Umbau zwangsläufig gemeinsam aus, und danach gibt es kein „vorher" mehr. Sie hat
   keinen Cxx-Träger unter den 41 Cutover-Aufgaben, weil kein Plan von 2026-08-18 davon wusste.
   ⚠️ **Der Merge ist der harte Zeitpunkt, nicht §C.**

⛔ **Und die eine Zeile, die dieses Runbook nicht schließen kann:** ⬜ **U4 / C.5**. Sie ist die
einzige, die **vier** Schritte gleichzeitig blockiert — Freeze, Umschwenk, Rückweg und die
Vollständigkeit der Abbauliste — und die einzige, für die es **keinen Befehl** gibt. **Ein Runbook,
das sie als beantwortet behandelt, ist an dieser Stelle eine Erfindung.**
